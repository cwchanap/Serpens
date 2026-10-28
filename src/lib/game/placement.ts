import { ARCHETYPES, getArchetype } from './archetypes';
import { brandedSellerScore, resolveBrandEconomics } from './brands';
import {
	computeStoreLocalDemand,
	getTileById,
	getTilePlacementBlockDecisionIdPart,
	getTilePlacementBlockReason
} from './city';
import { clampScore } from './reports';
import { runExpansionPurchase } from './expansionFinancing';
import type { FinanceActionResult, FinancedPurchaseReceipt } from './finance';
import { getStoreRevenueMultiplier } from './leveling';
import { resolveProductMarketShare } from './marketCompetition';
import {
	applyProductInventoryAging,
	getOldestSellableAgeDays,
	resolveMarkdownMultiplier,
	resolveObsolescenceMultiplier,
	resolveTrendMultiplier
} from './productDynamics';
import { resolveEffectivePolicy } from './policyInheritance';
import { getProductDefinition } from './products';
import { REPLENISHMENT_INTERVAL_DAYS } from './retailSupply';
import {
	buildCityDemandPools,
	consumeStoreProductStock,
	getEligibleProductSellers,
	getStoreProductStock,
	priceDemandMultiplier,
	sellerPolicyDemand
} from './stock';
import {
	getStoreDailyOperatingCost,
	POLICY_PRICING_TABLE,
	projectStoreSalesCapacity
} from './simulateDay';
import {
	STAFF_GENERATION_MORALE_BASE,
	STAFF_GENERATION_MORALE_SPREAD,
	STAFF_GENERATION_SKILL_BASE,
	STAFF_GENERATION_SKILL_SPREAD,
	summarizeStoreStaffing
} from './staffing';
import {
	buildStore,
	createNewGame,
	getExpansionSetupCost,
	NEW_STORE_MANAGER_QUALITY_MIDPOINT,
	NEW_STORE_STAFF_CAPACITY_MIDPOINT,
	NEW_STORE_STAFF_MORALE_MIDPOINT,
	openStore
} from './state';
import { decisionContextLocationBlocked, decisionContextLocationGeneric } from './decisionContext';
import {
	createCityTileLookup,
	getOccupiedStoreTileIds,
	getStoreFootprintPlacementBlockReason,
	type StoreFootprintPlacementBlockReason
} from './storeFootprint';
import type {
	ArchetypeId,
	City,
	CityTile,
	CompanyPolicy,
	DecisionItem,
	GameState,
	OpeningForecast,
	ProductDefinition,
	ProductId,
	ProductStockLot,
	RetailDemandProfile,
	Store,
	StoreLocation,
	StoreProduct
} from './types';
import type { TilePlacementBlockReason } from './city';

const ARCHETYPE_NEIGHBORHOOD_FIT: Record<
	ArchetypeId,
	Partial<Record<CityTile['neighborhood'], number>>
> = {
	convenience: {
		downtown: 10,
		transit: 14,
		campus: 6,
		residential: 4
	},
	boutique: {
		downtown: 12,
		mall: 14,
		parkEdge: 8,
		suburb: 4
	},
	electronics: {
		campus: 18,
		mall: 12,
		downtown: 8,
		transit: 4
	},
	grocery: {
		residential: 14,
		suburb: 12,
		transit: 6,
		parkEdge: 4
	}
};

const ARCHETYPE_TERRAIN_FIT: Record<ArchetypeId, Partial<Record<CityTile['terrain'], number>>> = {
	convenience: {
		commercial: 8,
		transit: 12,
		residential: 4
	},
	boutique: {
		commercial: 12,
		green: 5
	},
	electronics: {
		commercial: 14,
		transit: 4
	},
	grocery: {
		residential: 10,
		commercial: 5
	}
};

export function getRecommendedArchetypes(tile: CityTile): ArchetypeId[] {
	return ARCHETYPES.map((archetype) => ({
		id: archetype.id,
		score: scoreTileForArchetype(tile, archetype.id)
	}))
		.sort((left, right) => right.score - left.score)
		.map((recommendation) => recommendation.id);
}

/** Observation window the estimator forecasts: the store's first 14 complete trading days. */
export const OPENING_ESTIMATE_DAYS = 14;

export interface OpeningEstimateProduct {
	productId: ProductId;
	/** Per-unit revenue basis: brand shelf price × policy pricing multiplier. */
	sellingPrice: number;
	/** The entrant's share of the city-wide product pool (0..1). */
	entrantShare: number;
	/** Window-mean desired units/day before capacity and stock caps. */
	desiredUnitsPerDay: number;
	/** Opening shelf stock in units. */
	initialStockUnits: number;
	/** 14-day totals across the observation window. */
	unitsSold: number;
	revenue: number;
}

export interface OpeningEstimate extends OpeningForecast {
	archetypeId: ArchetypeId;
	/** Store-wide daily unit sales ceiling, shared across products. */
	capacityUnitsPerDay: number;
	/**
	 * The daily charge the entrant will pay once opened: archetype rent plus
	 * the marketing tier's cost under the entrant's resolved effective policy
	 * (company policy + city override). Founding previews resolve to
	 * `DEFAULT_POLICY`, so they keep quoting the default tier.
	 */
	dailyOperatingCost: number;
	perProduct: OpeningEstimateProduct[];
}

/**
 * One shared market-based opening estimate for a prospective store on `tile`,
 * serving founding (`game === null` + explicit `seed`, mirroring the inputs
 * the real founding command will use) and expansion (pre-command game; the
 * prospective entrant is counted in the market exactly once; no state is
 * mutated or returned). Pure: deterministic in its inputs, no rng draws.
 *
 * Model (mirrors the measured demand chain):
 *
 * 1. Demand: `buildCityDemandPools` over the city with the entrant included,
 *    per-day product trend applied, then the entrant-counted-once market
 *    share (`resolveProductMarketShare`), seller share, and effective-policy
 *    multiplier (`sellerPolicyDemand`), brand demand, obsolescence, and price
 *    multipliers — the exact chain `simulateProductSalesForCity` runs.
 * 2. Caps: units/day = min(desired, sales capacity, shelf stock). Capacity is
 *    `projectStoreSalesCapacity` at the jitter's expectation; staffing uses
 *    the founding derivation's real starter staff, or full requirement
 *    coverage at starter-grade skill/morale (65/68, the generation
 *    midpoints) for a prospective expansion entrant.
 * 3. Stock: the store opens with `createStoreProduct`'s initial lot; each day
 *    applies shelf-life waste and shrink before sales; on engine
 *    replenishment days (day % 7 === 0, `REPLENISHMENT_INTERVAL_DAYS`) stock
 *    below the reorder threshold tops up to target — imports are assumed
 *    available (the engine's weekly replenishment never partially fills by
 *    default; it draws cash negative instead).
 *
 * Documented simplifications: transient event modifiers are excluded (they
 * are day-scoped and unknowable at planning time); the per-day demand jitter
 * (±6%) and capacity jitter (±4%) sit at their 1.0 expectation; the
 * prospective expansion store's zero-mean creation noise (reputation ±4,
 * staff capacity ±5) is folded to its midpoint.
 */
export function estimateOpeningRevenue(input: {
	game: GameState | null;
	city: City;
	tileId: string;
	archetypeId: ArchetypeId;
	seed: number;
}): OpeningEstimate {
	const tile = getAvailableTileOrThrow(input.city, input.tileId, input.game);

	if (input.game === null) {
		const base = deriveFoundingBase({
			archetypeId: input.archetypeId,
			city: input.city,
			seed: input.seed
		});
		const entrant = placeStoreOnTile(base.baseStore, tile);

		return estimateOpeningForEntrant({
			entrantGame: { ...base.game, stores: [entrant] },
			entrant,
			city: input.city,
			tile,
			archetypeId: input.archetypeId
		});
	}

	const projected = projectExpansionEntrant(input.game, tile, input.archetypeId);

	return estimateOpeningForEntrant({
		...projected,
		city: input.city,
		tile,
		archetypeId: input.archetypeId
	});
}

/**
 * Core estimator over a preassembled entrant state (entrant already included
 * in `entrantGame`'s stores exactly once). Exposed for callers that derive
 * many entrants from one expensive founding base (placement previews).
 *
 * `pools` accepts a precomputed `buildCityDemandPools(entrantGame, city)`
 * result. Pools depend only on carried products + world modifiers (never the
 * entrant's tile), so menu builders estimating many tiles per archetype pass
 * the pools once instead of recomputing the city scan per tile.
 */
export function estimateOpeningForEntrant(input: {
	entrantGame: GameState;
	entrant: Store;
	city: City;
	tile: CityTile;
	archetypeId: ArchetypeId;
	pools?: RetailDemandProfile;
}): OpeningEstimate {
	const { entrantGame, entrant, city } = input;
	const windowStart = entrantGame.day;
	const policy = resolveEffectivePolicy(entrantGame, {
		kind: 'store',
		storeId: entrant.id
	}).values;
	const capacityUnitsPerDay = resolveEntrantSalesCapacity(entrantGame, entrant, policy);
	const pools = input.pools ?? buildCityDemandPools(entrantGame, city);
	const cityCompetitors = entrantGame.competitors.filter(
		(competitor) => competitor.cityId === city.id
	);

	interface EntrantProductModel {
		product: StoreProduct;
		definition: ProductDefinition;
		/** The entrant's share of the city product pool (playerShare × seller split). */
		entrantShare: number;
		playerShare: number;
		/** The entrant's split of the company pool across its own sellers. */
		sellerSplit: number;
		brandDemand: number;
		basePrice: number;
		priceMultiplier: number;
	}

	const models = new Map<ProductId, EntrantProductModel>();

	for (const product of entrant.products) {
		const definition = getProductDefinition(product.productId);
		const sellers = getEligibleProductSellers(entrantGame, city.id, product.productId);
		const totalScore = sellers.reduce(
			(sum, seller) => sum + brandedSellerScore(seller, product.productId),
			0
		);

		if (totalScore <= 0) continue;

		const market = resolveProductMarketShare(
			cityCompetitors,
			[],
			definition,
			totalScore,
			windowStart
		);
		const brandEconomics = resolveBrandEconomics(definition, product.brandId);
		const basePrice = product.sellingPrice * POLICY_PRICING_TABLE[policy.pricing].price;

		const sellerSplit = brandedSellerScore(entrant, product.productId) / totalScore;

		models.set(product.productId, {
			product,
			definition,
			entrantShare: market.playerShare * sellerSplit,
			playerShare: market.playerShare,
			sellerSplit,
			brandDemand: brandEconomics.demandMultiplier,
			basePrice,
			priceMultiplier: priceDemandMultiplier(definition, basePrice)
		});
	}

	// The daily simulation sells products in ascending product id order and
	// shares one capacity budget across them; mirror that ordering here.
	const orderedModels = entrant.products
		.map((product) => models.get(product.productId))
		.filter((model): model is EntrantProductModel => model !== undefined)
		.sort((left, right) =>
			left.product.productId < right.product.productId
				? -1
				: left.product.productId > right.product.productId
					? 1
					: 0
		);
	const lotsByProduct = new Map<ProductId, ProductStockLot[]>(
		orderedModels.map((model) => [
			model.product.productId,
			model.product.lots.map((lot) => ({ ...lot }))
		])
	);
	const revenueMultiplier = getStoreRevenueMultiplier(entrant.level);
	const perProduct = new Map<ProductId, OpeningEstimateProduct>(
		orderedModels.map((model) => [
			model.product.productId,
			{
				productId: model.product.productId,
				sellingPrice: model.basePrice,
				entrantShare: model.entrantShare,
				desiredUnitsPerDay: 0,
				initialStockUnits: getStoreProductStock(model.product),
				unitsSold: 0,
				revenue: 0
			}
		])
	);

	for (let dayOffset = 0; dayOffset < OPENING_ESTIMATE_DAYS; dayOffset += 1) {
		const day = windowStart + dayOffset;
		let capacityRemaining = capacityUnitsPerDay;

		for (const model of orderedModels) {
			const lots = lotsByProduct.get(model.product.productId)!;
			const shelfLifeDays = model.definition.dynamics.shelfLifeDays;

			// Pre-sales inventory aging through the engine helper: shelf-life
			// waste first, then shrink on the surviving units.
			const aging = applyProductInventoryAging({
				product: { ...model.product, lots },
				definition: model.definition,
				closingDay: day
			});
			const survivingLots = aging.product.lots;
			const stockAfterAging = getStoreProductStock(aging.product);
			const trendMultiplier = resolveTrendMultiplier(model.definition.dynamics.trend, day);
			const cityPool = Math.max(
				0,
				Math.round((pools[model.product.productId] ?? 0) * trendMultiplier)
			);
			const playerPool = Math.round(cityPool * model.playerShare);
			const oldestSellableAge = getOldestSellableAgeDays(
				{ lots: survivingLots },
				day,
				shelfLifeDays
			);
			const obsolescenceMultiplier = resolveObsolescenceMultiplier(
				oldestSellableAge,
				model.definition.dynamics.obsolescence
			);
			const markdownMultiplier = resolveMarkdownMultiplier(
				oldestSellableAge,
				model.definition.dynamics.markdown
			);
			const desiredUnits = Math.max(
				0,
				Math.round(
					sellerPolicyDemand(playerPool, model.sellerSplit, policy) *
						model.brandDemand *
						obsolescenceMultiplier *
						model.priceMultiplier
				)
			);
			const unitsSold = Math.min(desiredUnits, capacityRemaining, stockAfterAging);

			capacityRemaining -= unitsSold;

			const revenue = Math.round(
				unitsSold * (model.basePrice * markdownMultiplier) * revenueMultiplier
			);
			// Consume the sold units oldest-first via the engine helper.
			const soldProduct = consumeStoreProductStock(aging.product, unitsSold);
			const remainingLots = soldProduct.lots;

			// End-of-day engine replenishment: below the reorder threshold on a
			// 7th-day check, the stock tops up to target before tomorrow.
			const stockAfterSales = getStoreProductStock(soldProduct);

			if (
				day % REPLENISHMENT_INTERVAL_DAYS === 0 &&
				stockAfterSales < model.product.reorderThreshold
			) {
				const neededUnits = Math.max(0, model.product.targetStock - stockAfterSales);

				if (neededUnits > 0) remainingLots.push({ receivedDay: day, quantity: neededUnits });
			}

			lotsByProduct.set(model.product.productId, remainingLots);

			const stats = perProduct.get(model.product.productId)!;

			stats.desiredUnitsPerDay += desiredUnits;
			stats.unitsSold += unitsSold;
			stats.revenue += revenue;
		}
	}

	const totalRevenue = [...perProduct.values()].reduce((sum, stats) => sum + stats.revenue, 0);
	const fitScore = scoreTileForArchetype(input.tile, input.archetypeId);
	const demandScore = clampScore((input.tile.demand + input.tile.footTraffic + fitScore) / 3);

	return {
		tileId: input.tile.id,
		archetypeId: input.archetypeId,
		setupCost: getExpansionSetupCost(input.tile, input.archetypeId),
		projectedDailyRevenue: Math.round(totalRevenue / OPENING_ESTIMATE_DAYS),
		dailyOperatingCost: getStoreDailyOperatingCost(input.archetypeId, policy.marketing),
		demandScore,
		customerFit: fitScore,
		capacityUnitsPerDay,
		perProduct: [...perProduct.values()].map((stats) => ({
			...stats,
			desiredUnitsPerDay: Math.round(stats.desiredUnitsPerDay / OPENING_ESTIMATE_DAYS)
		})),
		risks: getOpeningRisks(input.tile, fitScore, demandScore)
	};
}

/**
 * Pure prospective-expansion projection: the store `openStoreAtTile` would
 * create on `tile`, derived WITHOUT calling the transition (which is gated
 * on affordability and mutates state). Base stats sit at `createStore`'s
 * zero-mean rng midpoints; the tile-adjusted reputation/staffCapacity come
 * from the same `placeStoreOnTile` formula the real command applies.
 */
export function projectExpansionEntrant(
	game: GameState,
	tile: CityTile,
	archetypeId: ArchetypeId
): { entrantGame: GameState; entrant: Store } {
	const archetype = getArchetype(archetypeId);
	const base = buildStore({
		id: `store-${game.stores.length + 1}`,
		name: '',
		archetypeId,
		location: formatLocation(tile),
		daysOpen: 0,
		day: game.day,
		reputation: archetype.customerExpectation,
		staffMorale: NEW_STORE_STAFF_MORALE_MIDPOINT,
		staffCapacity: NEW_STORE_STAFF_CAPACITY_MIDPOINT,
		localDemand: archetype.baseTraffic,
		managerQuality: NEW_STORE_MANAGER_QUALITY_MIDPOINT
	});
	const entrant = placeStoreOnTile(base, tile);

	return { entrantGame: { ...game, stores: [...game.stores, entrant] }, entrant };
}

/**
 * Prospective-hire quality for an expansion entrant: midpoints of the
 * uniform skill/morale ranges `generateStaffProfile` rolls (base + spread /
 * 2), imported from staffing.ts so a retune there keeps this in sync.
 */
const PROSPECTIVE_STAFF_SKILL = STAFF_GENERATION_SKILL_BASE + STAFF_GENERATION_SKILL_SPREAD / 2;
const PROSPECTIVE_STAFF_MORALE = STAFF_GENERATION_MORALE_BASE + STAFF_GENERATION_MORALE_SPREAD / 2;

function resolveEntrantSalesCapacity(
	entrantGame: GameState,
	entrant: Store,
	policy: CompanyPolicy
): number {
	if (entrantGame.staff.some((member) => member.assignedStoreId === entrant.id)) {
		const summary = summarizeStoreStaffing(entrantGame, entrant);

		return projectStoreSalesCapacity({
			staffCapacity: entrant.staffCapacity,
			staffMorale: entrant.staffMorale,
			coverage: summary.coverage,
			averageSkill: summary.averageSkill,
			averageMorale: summary.averageMorale,
			policy
		});
	}

	return projectStoreSalesCapacity({
		staffCapacity: entrant.staffCapacity,
		staffMorale: entrant.staffMorale,
		coverage: 100,
		averageSkill: PROSPECTIVE_STAFF_SKILL,
		averageMorale: PROSPECTIVE_STAFF_MORALE,
		policy
	});
}

/**
 * Tile-independent founding derivation: the state `createNewGame` produces for
 * `seed`, with `city` swapped in as the only/active city, and the founding
 * store still unplaced (reputation/staffCapacity not yet tile-adjusted).
 * Exported so callers that project many founding tiles (placement previews)
 * can derive the expensive part once and place the base store per tile.
 */
export interface FoundingBase {
	game: GameState;
	baseStore: Store;
}

export function deriveFoundingBase(input: {
	archetypeId: ArchetypeId;
	city: City;
	seed: number;
}): FoundingBase {
	const game = createNewGame(input.archetypeId, input.seed);
	const baseStore = game.stores[0];

	if (!baseStore) {
		throw new Error('Founding store was not created');
	}

	return {
		game: { ...game, cities: [input.city], activeCityId: input.city.id },
		baseStore
	};
}

export function createFoundingGameAtTile(input: {
	archetypeId: ArchetypeId;
	city: City;
	tileId: string;
	seed: number;
}): GameState {
	const tile = getAvailableTileOrThrow(input.city, input.tileId);
	const { game, baseStore } = deriveFoundingBase(input);
	const placedStore = placeStoreOnTile(baseStore, tile);

	return {
		...game,
		stores: [placedStore],
		scorecard: {
			...game.scorecard,
			staffMorale: placedStore.staffMorale
		}
	};
}

export function openStoreAtTile(
	game: GameState,
	input: { tileId: string; archetypeId: ArchetypeId }
): GameState {
	const city = game.cities.find((candidate) => candidate.id === game.activeCityId);
	const tile = city ? getTileById(city, input.tileId) : undefined;

	if (!city || !tile) {
		return appendLocationUnavailableDecision(game);
	}

	const tileLookup = createCityTileLookup(city);
	const occupiedTileIds = getOccupiedStoreTileIds(city, game.stores, tileLookup);
	const blockReason = getStoreFootprintPlacementBlockReason(tileLookup, tile, occupiedTileIds);

	if (blockReason) {
		return appendLocationUnavailableDecision(game, toTilePlacementDecisionReason(blockReason));
	}

	const expanded = openStore(game, {
		archetypeId: input.archetypeId,
		location: formatLocation(tile),
		tileId: tile.id
	});

	if (expanded.stores.length === game.stores.length) {
		return expanded;
	}

	return {
		...expanded,
		stores: expanded.stores.map((store, index) =>
			index === expanded.stores.length - 1 ? placeStoreOnTile(store, tile) : store
		)
	};
}

export function financeRetailStoreOpening(
	game: GameState,
	input: { tileId: string; archetypeId: ArchetypeId; expectedCost: number }
): FinanceActionResult<FinancedPurchaseReceipt> {
	return runExpansionPurchase(game, {
		expectedCost: input.expectedCost,
		resolveLiveCost: (candidate) => {
			const city = candidate.cities.find((item) => item.id === candidate.activeCityId);
			const tile = city ? getTileById(city, input.tileId) : undefined;
			if (!city || !tile || candidate.stores.length >= candidate.storeCap) return null;

			const tileLookup = createCityTileLookup(city);
			const occupiedTileIds = getOccupiedStoreTileIds(city, candidate.stores, tileLookup);
			return getStoreFootprintPlacementBlockReason(tileLookup, tile, occupiedTileIds)
				? null
				: getExpansionSetupCost(tile, input.archetypeId);
		},
		cashOnlyPurchase: (candidate) => openStoreAtTile(candidate, input),
		postcondition: (candidate) =>
			candidate.stores.length === game.stores.length + 1 &&
			candidate.stores.some(
				(store) => store.tileId === input.tileId && store.archetypeId === input.archetypeId
			)
	});
}

function scoreTileForArchetype(tile: CityTile, archetypeId: ArchetypeId): number {
	const neighborhoodFit = ARCHETYPE_NEIGHBORHOOD_FIT[archetypeId][tile.neighborhood] ?? 0;
	const terrainFit = ARCHETYPE_TERRAIN_FIT[archetypeId][tile.terrain] ?? 0;

	return clampScore(
		tile.customerFit * 0.55 +
			tile.demand * 0.25 +
			tile.footTraffic * 0.2 +
			neighborhoodFit +
			terrainFit
	);
}

function getOpeningRisks(tile: CityTile, fitScore: number, demandScore: number): string[] {
	const risks: string[] = [];

	if (tile.rent >= 2_000) {
		risks.push('High rent pressure');
	}

	if (fitScore < 55) {
		risks.push('Weak customer fit');
	}

	if (demandScore < 50) {
		risks.push('Low local demand');
	}

	return risks;
}

function getAvailableTileOrThrow(city: City, tileId: string, game?: GameState | null): CityTile {
	const tile = getTileById(city, tileId);

	if (!tile) {
		throw new Error(`Unknown tile: ${tileId}`);
	}

	const blockReason = getTilePlacementBlockReason(tile);

	if (blockReason) {
		throw new Error(`${blockReason}: ${tileId}`);
	}

	// Expansion estimates must reject what `openStoreAtTile` rejects — a tile
	// that already carries a store is not a valid opening. Founding callers
	// pass no game: the only store in a founding derivation is the prospective
	// entrant itself, which can never collide with its own tile.
	const tileLookup = createCityTileLookup(city);
	const footprintBlockReason = getStoreFootprintPlacementBlockReason(
		tileLookup,
		tile,
		game ? getOccupiedStoreTileIds(city, game.stores, tileLookup) : undefined
	);

	if (footprintBlockReason) {
		throw new Error(`${footprintBlockReason}: ${tileId}`);
	}

	return tile;
}

function toTilePlacementDecisionReason(
	reason: StoreFootprintPlacementBlockReason
): TilePlacementBlockReason | null {
	return reason === 'occupied' ? null : reason;
}

/**
 * Tile-adjusted store placement projection shared by the real founding and
 * expansion commands (`createFoundingGameAtTile`, `openStoreAtTile`) and the
 * opening estimator's prospective-entrant projection. Pure.
 */
export function placeStoreOnTile(store: Store, tile: CityTile): Store {
	const fitScore = scoreTileForArchetype(tile, store.archetypeId);

	return {
		...store,
		cityId: tile.cityId,
		tileId: tile.id,
		mapX: tile.x,
		mapY: tile.y,
		location: formatLocation(tile),
		localDemand: computeStoreLocalDemand(tile),
		reputation: clampScore(store.reputation + Math.round((fitScore - 60) / 8)),
		staffCapacity: clampScore(store.staffCapacity + Math.round((tile.footTraffic - 55) / 10))
	};
}

export function formatLocation(tile: CityTile): StoreLocation {
	return { neighborhoodId: tile.neighborhood, x: tile.x, y: tile.y };
}

function appendLocationUnavailableDecision(
	game: GameState,
	reason?: TilePlacementBlockReason | null
): GameState {
	const decision = locationUnavailableDecision(game, reason);

	if (game.decisions.some((candidate) => candidate.id === decision.id)) {
		return game;
	}

	return {
		...game,
		decisions: [...game.decisions, decision]
	};
}

function locationUnavailableDecision(
	game: GameState,
	reason?: TilePlacementBlockReason | null
): DecisionItem {
	const idPart = getTilePlacementBlockDecisionIdPart(reason);

	return {
		kind: 'system',
		id: `location-unavailable${idPart ? `-${idPart}` : ''}-${game.day}`,
		title: 'Location unavailable',
		// After Task 1b, TilePlacementBlockReason is already 'locked' | 'road' | 'river'
		// — no English-literal matching needed. The reason IS the stable code.
		context: reason ? decisionContextLocationBlocked(reason) : decisionContextLocationGeneric(),
		expiresOnDay: game.day + 1,
		options: [
			{
				id: 'acknowledge',
				label: 'Acknowledge',
				description: 'Return to location planning.'
			}
		]
	};
}
