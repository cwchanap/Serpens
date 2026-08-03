import { getArchetype } from './archetypes';
import {
	canUpgradeStore,
	getStoreUpgradeCost,
	getStoreStaffCapacityBonus,
	getUnlockedCategoryCount,
	isMilestoneLevel
} from './leveling';
import {
	computeStoreLocalDemand,
	DEFAULT_RETAIL_CITY_HEIGHT,
	DEFAULT_RETAIL_CITY_WIDTH,
	generateCity,
	getTilePlacementBlockDecisionIdPart,
	isTileBuildable
} from './city';
import {
	DEFAULT_INDUSTRY_CITY_HEIGHT,
	DEFAULT_INDUSTRY_CITY_WIDTH,
	generateIndustryCity
} from './industry';
import { clampScore } from './reports';
import {
	decisionContextExpansionCashBlocked,
	decisionContextExpansionUnavailable,
	decisionContextLocationBlocked,
	decisionContextLocationGeneric
} from './decisionContext';
import { createRng, normalizeSeed, randomInt } from './rng';
import { createInitialEventRuntime } from './eventSelection';
import {
	createCityTileLookup,
	getOccupiedStoreTileIds,
	getStoreFootprintPlacementBlockReason,
	type StoreFootprintPlacementBlockReason
} from './storeFootprint';
import {
	generateHiringCandidates,
	generateStarterStaffForStore,
	HIRING_CANDIDATE_COUNT
} from './staffing';
import { calculateStockHealth, createStoreProduct, initializeStoreProducts } from './stock';
import { STARTER_STORE_CAP, createInitialWorldProgress, refreshWorldProgress } from './world';
import { createFoundingFinanceState } from './finance';
import { initializeCityInventory, initializeRetailSupplyAssignment } from './cityInventory';
export {
	getDecisionOptionAvailability,
	resolveDecision,
	type DecisionOptionAvailability,
	type DecisionResolutionFailureCode,
	type DecisionResolutionResult
} from './eventEffects';
import type {
	ArchetypeId,
	City,
	CityTile,
	CompanyPolicy,
	DecisionItem,
	GameState,
	Store,
	SystemDecisionOption,
	StoreLocation
} from './types';
import type { TilePlacementBlockReason } from './city';

/**
 * Returns the English display name for a store. Used by game-core modules
 * that generate English strings (alerts, warnings) for the reverse-parsing
 * localization layer. The UI uses the i18n-aware `storeDisplayName` from
 * gameCopy.ts instead. `ordinal` is the 1-based position of the store in
 * `game.stores`, derived at runtime rather than persisted.
 */
export function storeNameOrOrdinal(store: Pick<Store, 'name'>, ordinal: number): string {
	return store.name || `Store #${ordinal}`;
}

/**
 * Returns the 1-based position of `storeId` within `stores`, or 0 when not
 * found. Used to derive a store's display ordinal at runtime instead of
 * persisting it on the store.
 */
export function getStoreOrdinal(stores: Store[], storeId: string): number {
	const index = stores.findIndex((store) => store.id === storeId);
	return index === -1 ? 0 : index + 1;
}

export const DEFAULT_POLICY: CompanyPolicy = {
	pricing: 'standard',
	inventory: 'balanced',
	staffing: 'efficient',
	marketing: 'awareness',
	service: 'balanced'
};

// Only commercial and residential terrain carry a setup-cost premium; green
// and transit deliberately cost nothing extra (transit tiles are infrastructure,
// green is undeveloped land). Industrial terrain is never buildable in retail
// cities, so it is intentionally absent here.
const TERRAIN_SETUP_COST_PREMIUM: Partial<Record<CityTile['terrain'], number>> = {
	commercial: 3_500,
	residential: 2_000
};

interface OpenStoreInput {
	archetypeId: ArchetypeId;
	location: StoreLocation;
	tileId?: string;
}

interface ExpansionTileResult {
	tile?: CityTile;
	blockReason?: TilePlacementBlockReason | null;
}

export function createNewGame(archetypeId: ArchetypeId, seed = Date.now()): GameState {
	const archetype = getArchetype(archetypeId);
	const normalizedSeed = normalizeSeed(seed);
	const rng = createRng(normalizedSeed);
	const city = generateCity({
		id: 'harbor-city',
		name: 'Harbor City',
		width: DEFAULT_RETAIL_CITY_WIDTH,
		height: DEFAULT_RETAIL_CITY_HEIGHT,
		seed: normalizedSeed
	});
	const industryCity = generateIndustryCity({
		id: 'industry-city',
		name: 'Industry City',
		width: DEFAULT_INDUSTRY_CITY_WIDTH,
		height: DEFAULT_INDUSTRY_CITY_HEIGHT,
		seed: normalizedSeed + 101
	});
	const fallbackTile = city.tiles.find(isTileBuildable) ?? city.tiles[0]!;
	const openingStore = createStore({
		id: 'store-1',
		name: '',
		archetypeId,
		location: { neighborhoodId: fallbackTile.neighborhood, x: fallbackTile.x, y: fallbackTile.y },
		daysOpen: 1,
		rng
	});
	const placedOpeningStore = {
		...openingStore,
		cityId: city.id,
		tileId: fallbackTile.id,
		mapX: fallbackTile.x,
		mapY: fallbackTile.y
	};
	const staff = generateStarterStaffForStore({
		storeId: placedOpeningStore.id,
		archetypeId,
		day: 1,
		rng
	});
	const hiringCandidates = generateHiringCandidates({ count: HIRING_CANDIDATE_COUNT, day: 1, rng });

	const initialGame: GameState = {
		seed: normalizedSeed,
		rngState: rng.getState(),
		day: 1,
		cash: archetype.startingCash,
		finance: createFoundingFinanceState(1, archetype.startingDebt),
		policy: { ...DEFAULT_POLICY },
		scorecard: {
			profit: clampScore(
				50 + Math.round((archetype.startingCash - archetype.startingDebt) / 2_000)
			),
			customerSatisfaction: clampScore(archetype.customerExpectation),
			staffMorale: placedOpeningStore.staffMorale,
			marketPosition: clampScore(35 + Math.round(archetype.baseTraffic / 10))
		},
		world: createInitialWorldProgress(),
		storeCap: STARTER_STORE_CAP,
		cities: [city],
		activeCityId: city.id,
		industryCities: [industryCity],
		activeIndustryCityId: industryCity.id,
		industrialBuildings: [],
		cityInventories: [],
		retailSupplyAssignments: [],
		stores: [placedOpeningStore],
		staff,
		hiringCandidates,
		events: createInitialEventRuntime(normalizedSeed),
		decisions: [],
		reports: []
	};

	return initializeRetailSupplyAssignment(
		initializeCityInventory(initialGame, industryCity.id),
		city.id
	);
}

export function updatePolicy(game: GameState, patch: Partial<CompanyPolicy>): GameState {
	return {
		...game,
		policy: {
			...game.policy,
			...patch
		}
	};
}

export function openStore(game: GameState, input: OpenStoreInput): GameState {
	const archetypeId = input.archetypeId;
	const expansionTile = getExpansionTile(game, input.tileId);
	const tile = expansionTile.tile;

	if (!tile) {
		return appendDecision(game, locationUnavailableDecision(game, expansionTile.blockReason));
	}

	if (game.stores.length >= game.storeCap) {
		return appendDecision(game, expansionUnavailableDecision(game));
	}

	const setupCost = getExpansionSetupCost(tile, archetypeId);

	if (game.cash < setupCost) {
		return appendDecision(game, expansionCashBlockedDecision(game, setupCost));
	}

	const rng = createRng(game.rngState);
	const store = createStore({
		id: `store-${game.stores.length + 1}`,
		name: '',
		archetypeId,
		location: input.location,
		daysOpen: 0,
		rng
	});
	const placedStore = placeStore(store, tile);

	return refreshWorldProgress({
		...game,
		rngState: rng.getState(),
		cash: game.cash - setupCost,
		stores: [...game.stores, placedStore],
		scorecard: {
			...game.scorecard,
			marketPosition: clampScore(game.scorecard.marketPosition + 4)
		}
	});
}

export function getExpansionSetupCost(tile: CityTile, archetypeId: ArchetypeId): number {
	const archetype = getArchetype(archetypeId);
	const demandScore = clampScore((tile.demand + tile.footTraffic + tile.customerFit) / 3);

	return Math.round(
		9_000 +
			tile.rent * 2.5 +
			archetype.baseRent * 18 +
			demandScore * 24 +
			(TERRAIN_SETUP_COST_PREMIUM[tile.terrain] ?? 0)
	);
}

export function upgradeStore(game: GameState, storeId: string): GameState {
	const index = game.stores.findIndex((store) => store.id === storeId);

	if (index === -1) {
		console.warn(`upgradeStore: storeId "${storeId}" not found in game state`);
		return game;
	}

	const store = game.stores[index]!;

	if (!canUpgradeStore(store.level)) {
		return game;
	}

	const cost = getStoreUpgradeCost(store.level);

	if (game.cash < cost) {
		return game;
	}

	const nextLevel = store.level + 1;
	let products = store.products;
	let staffCapacity = store.staffCapacity;

	if (isMilestoneLevel(nextLevel)) {
		const archetype = getArchetype(store.archetypeId);
		const unlockedCount = getUnlockedCategoryCount(nextLevel);
		const newCategory = archetype.startingCategories.find(
			(category) => !products.some((product) => product.categoryId === category.id)
		);

		// Cap at unlockedCount: a store only catches up to its level's unlock
		// budget — never gains more categories than its milestones allow.
		if (newCategory && products.length < unlockedCount) {
			products = [...products, createStoreProduct(newCategory)];
		}

		staffCapacity = clampScore(
			store.staffCapacity +
				getStoreStaffCapacityBonus(nextLevel) -
				getStoreStaffCapacityBonus(store.level)
		);
	}

	const upgradedStore: Store = {
		...store,
		level: nextLevel,
		products,
		staffCapacity,
		stockHealth: calculateStockHealth(products)
	};

	return {
		...game,
		cash: game.cash - cost,
		stores: game.stores.map((candidate, candidateIndex) =>
			candidateIndex === index ? upgradedStore : candidate
		)
	};
}

function createStore(input: {
	id: string;
	name: string;
	archetypeId: ArchetypeId;
	location: StoreLocation;
	daysOpen: number;
	rng: ReturnType<typeof createRng>;
}): Store {
	const archetype = getArchetype(input.archetypeId);
	const products = initializeStoreProducts(input.archetypeId);

	return {
		id: input.id,
		level: 1,
		name: input.name,
		archetypeId: input.archetypeId,
		location: input.location,
		cityId: 'harbor-city',
		tileId: `${input.id}-unplaced`,
		mapX: 0,
		mapY: 0,
		daysOpen: input.daysOpen,
		reputation: clampScore(archetype.customerExpectation + randomInt(input.rng, -4, 4)),
		stockHealth: calculateStockHealth(products),
		products,
		staffMorale: clampScore(60 + randomInt(input.rng, -6, 6)),
		staffCapacity: clampScore(64 + randomInt(input.rng, -5, 5)),
		localDemand: Math.max(0, archetype.baseTraffic + randomInt(input.rng, -8, 8)),
		competition: clampScore(45 + randomInt(input.rng, -10, 10)),
		managerQuality: clampScore(58 + randomInt(input.rng, -7, 7))
	};
}

function getExpansionTile(
	game: GameState,
	requestedTileId: string | undefined
): ExpansionTileResult {
	const city = getActiveCity(game);

	if (!city) {
		return {};
	}

	if (requestedTileId) {
		const lookup = createCityTileLookup(city);
		const requestedTile = lookup.byId.get(requestedTileId);

		if (!requestedTile) {
			return {};
		}

		// Footprint-aware: a 2x2 store occupies all four footprint tiles, not
		// just the anchor. The production UI flow pre-checks via
		// getStoreFootprintPlacementBlockReason (see openStoreAtTile), so this
		// is a defensive correctness guard for callers that bypass the preview.
		// It must reject anchors whose non-anchor footprint tiles are river,
		// road, locked, off-map, or already occupied — not just the anchor.
		const occupiedTileIds = getOccupiedStoreTileIds(city, game.stores, lookup);
		const footprintBlockReason = getStoreFootprintPlacementBlockReason(
			lookup,
			requestedTile,
			occupiedTileIds
		);

		if (footprintBlockReason) {
			// 'occupied' is a footprint-only concept (not a
			// TilePlacementBlockReason) and maps to null so the decision id and
			// generic "unoccupied" message match the prior occupancy behavior.
			return { blockReason: toExpansionTileBlockReason(footprintBlockReason) };
		}

		return { tile: requestedTile };
	}

	// Auto-pick: choose the first anchor whose full 2x2 footprint is buildable
	// and unoccupied. This mirrors the requested-tile branch and the live
	// placement preview (getStoreFootprintPlacementBlockReason). Checking only
	// the anchor would silently place a store whose non-anchor footprint tiles
	// are river/road/locked/off-map or already covered by another store.
	const lookup = createCityTileLookup(city);
	const occupiedTileIds = getOccupiedStoreTileIds(city, game.stores, lookup);

	return {
		tile: city.tiles.find(
			(anchor) => getStoreFootprintPlacementBlockReason(lookup, anchor, occupiedTileIds) === null
		)
	};
}

function toExpansionTileBlockReason(
	reason: StoreFootprintPlacementBlockReason
): TilePlacementBlockReason | null {
	return reason === 'occupied' ? null : reason;
}

function getActiveCity(game: GameState): City | undefined {
	return game.cities.find((city) => city.id === game.activeCityId);
}

function placeStore(store: Store, tile: CityTile): Store {
	return {
		...store,
		cityId: tile.cityId,
		tileId: tile.id,
		mapX: tile.x,
		mapY: tile.y,
		location: { neighborhoodId: tile.neighborhood, x: tile.x, y: tile.y },
		localDemand: computeStoreLocalDemand(tile)
	};
}

function appendDecision(game: GameState, decision: DecisionItem): GameState {
	if (game.decisions.some((candidate) => candidate.id === decision.id)) {
		return game;
	}

	return {
		...game,
		decisions: [...game.decisions, decision]
	};
}

function expansionUnavailableDecision(game: GameState): DecisionItem {
	return {
		kind: 'system',
		id: `expansion-unavailable-${game.day}`,
		title: 'Expansion unavailable',
		context: decisionContextExpansionUnavailable(game.storeCap),
		expiresOnDay: game.day + 1,
		options: [acknowledgeOption()]
	};
}

function expansionCashBlockedDecision(game: GameState, setupCost: number): DecisionItem {
	return {
		kind: 'system',
		id: `expansion-cash-blocked-${game.day}`,
		title: 'Expansion delayed',
		context: decisionContextExpansionCashBlocked(setupCost),
		expiresOnDay: game.day + 1,
		options: [acknowledgeOption()]
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
		options: [acknowledgeOption()]
	};
}

function acknowledgeOption(): SystemDecisionOption {
	return {
		id: 'acknowledge',
		label: 'Acknowledge',
		description: 'Return to operations planning.'
	};
}
