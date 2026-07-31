import { ARCHETYPES } from './archetypes';
import { getTileById } from './city';
import type { DecisionContext } from './decisionContext';
import { INDUSTRIAL_BUILDING_TYPES, getIndustryTileById } from './industry';
import { isTileInIndustryBuildingFootprint } from './industryFootprint';
import {
	createIndustrialPlacementContext,
	getIndustrialPlacementBlockReason,
	getIndustrialPlacementBlockReasonWithContext,
	type IndustrialPlacementContext
} from './industryPlacement';
import { forecastOpening } from './placement';
import {
	assessCredit,
	FOUNDING_LOAN_TERM_DAYS,
	getExpansionFinanceOffer,
	getExpansionFinanceOfferWithAssessment,
	type CreditAssessment,
	type ExpansionFinanceOffer
} from './finance';
import {
	createCityTileLookup,
	getOccupiedStoreTileIds,
	getStoreFootprintPlacementBlockReason,
	isTileInStoreFootprint,
	type CityTileLookup,
	type StoreFootprintPlacementBlockReason
} from './storeFootprint';
import type {
	ArchetypeId,
	City,
	CityTile,
	GameState,
	IndustrialBuilding,
	IndustrialBuildingTypeId,
	IndustryCity,
	Store
} from './types';

export interface PlacementPreview {
	validTileIds: string[];
	invalidTileIds: string[];
}

export interface NumberRange {
	min: number;
	max: number;
}

export interface RetailBuildMenuOption {
	archetypeId: ArchetypeId;
	setupCostRange: NumberRange;
	projectedDailyRevenueRange: NumberRange;
	validTileCount: number;
	disabledReason: PlacementBlockReason | null;
	financeOffer: ExpansionFinanceOffer | null;
}

export type PlacementBlockReason =
	| { code: 'retail.unknownCityTile' }
	| { code: 'retail.storeLimitReached' }
	| { code: 'retail.requiresCash'; amount: number }
	| { code: 'retail.occupiedLocation' }
	| { code: 'retail.lockedLocation' }
	| { code: 'retail.roadLocation' }
	| { code: 'retail.riverLocation' }
	| { code: 'retail.noValidTiles' }
	| { code: 'industry.lockedUntilRetail' }
	| { code: 'industry.unknownBuildingType' }
	| { code: 'industry.requiresCash'; buildingTypeId: IndustrialBuildingTypeId; amount: number }
	| { code: 'industry.rawPlacementBlocked'; context: DecisionContext };

export type IndustrialBuildMenuDisabledReason =
	| Extract<PlacementBlockReason, { code: 'industry.requiresCash' }>
	| { code: 'industry.commandUnavailable' };

export interface IndustrialBuildMenuOption {
	buildingTypeId: IndustrialBuildingTypeId;
	disabledReason: IndustrialBuildMenuDisabledReason | null;
	financeOffer: ExpansionFinanceOffer | null;
}

interface RetailPlacementInput {
	game: GameState | null;
	city: City;
	tileId: string;
	archetypeId: ArchetypeId;
	cashCommandAvailable?: boolean;
	financeCommandAvailable?: boolean;
}

interface RetailPreviewInput {
	game: GameState | null;
	city: City;
	archetypeId: ArchetypeId;
	cashCommandAvailable?: boolean;
	financeCommandAvailable?: boolean;
}

interface RetailBuildMenuInput {
	game: GameState | null;
	city: City;
	cashCommandAvailable?: boolean;
	financeCommandAvailable?: boolean;
}

interface RetailPlacementContext {
	tileLookup: CityTileLookup;
	occupiedTileIds: ReadonlySet<string>;
	storeCount: number | null;
	storeCap: number | null;
	cash: number | null;
	game: GameState | null;
	cashCommandAvailable: boolean;
	financeCommandAvailable: boolean;
	// Lazy founding-term credit assessment for the per-tile finance check.
	// `assessCredit`'s expensive part (the principal scan) depends only on
	// `game`, not on the per-tile `setupCost`, so the full-map preview supplies
	// a memoizing getter that runs it on first access — cash-covered or
	// structurally blocked previews never trigger the scan. Retail `setupCost`
	// varies per tile, so a single offer cannot represent all tiles; the
	// assessment is the cost-independent part, reused for every cash-short
	// tile. Standalone single-tile callers supply a getter returning null and
	// the per-tile helper falls back to a single `getExpansionFinanceOffer`.
	getAssessment: () => CreditAssessment | null;
}

interface RetailTilePlacementInput {
	tile: CityTile;
	archetypeId: ArchetypeId;
	context: RetailPlacementContext;
}

interface IndustryPlacementInput {
	game: GameState | null;
	tileId: string;
	buildingTypeId: IndustrialBuildingTypeId;
	financeCommandAvailable: boolean;
	placementContext?: IndustrialPlacementContext | null;
	// Lazy finance offer for the building type's fixed buildCost. When the
	// preview derives block reasons for every map tile, the offer depends only
	// on `game` and `buildCost` (both constant across tiles), so a memoizing
	// getter computes it on first access — cash-covered or structurally blocked
	// previews never trigger the credit-assessment principal scan. Standalone
	// single-tile callers omit this and the helper falls back to a single
	// getExpansionFinanceOffer call.
	getFinanceOffer?: () => ExpansionFinanceOffer | null;
}

interface IndustryPreviewInput {
	game: GameState | null;
	buildingTypeId: IndustrialBuildingTypeId;
	financeCommandAvailable: boolean;
}

interface IndustrialBuildMenuInput {
	game: GameState | null;
	cashCommandAvailable: boolean;
	financeCommandAvailable: boolean;
}

export function createRetailPlacementPreview(input: RetailPreviewInput): PlacementPreview {
	// Normalize the optional flag before the precomputation condition so that
	// omitting it matches the `true` default inside createRetailPlacementContext.
	// Without this, an omitted flag skips the assessment (the condition tests
	// the raw `undefined`) while the context enables financing, forcing the
	// per-tile fallback to re-run assessCredit for every cash-short tile.
	const financeCommandAvailable = input.financeCommandAvailable ?? true;
	// The per-tile finance check needs a credit assessment, but `assessCredit`'s
	// principal scan depends only on `game` (not on the per-tile `setupCost`),
	// so memoize it and run it on first access — cash-covered or structurally
	// blocked previews never trigger the scan. Retail `setupCost` varies per
	// tile, so a single offer cannot be shared; the assessment is the
	// cost-independent part, reused for every cash-short tile.
	const getAssessment = createLazyCreditAssessment(input.game, financeCommandAvailable);
	const context = createRetailPlacementContext(
		input.game,
		input.city,
		input.cashCommandAvailable,
		financeCommandAvailable,
		getAssessment
	);
	const validTileIds: string[] = [];
	const invalidTileIds: string[] = [];

	for (const tile of input.city.tiles) {
		const blockReason = getRetailTilePlacementBlockReason({
			tile,
			archetypeId: input.archetypeId,
			context
		});

		if (blockReason) {
			invalidTileIds.push(tile.id);
		} else {
			validTileIds.push(tile.id);
		}
	}

	return { validTileIds, invalidTileIds };
}

export function getRetailPlacementBlockReason(
	input: RetailPlacementInput
): PlacementBlockReason | null {
	const tile = getTileById(input.city, input.tileId);

	if (!tile) {
		return { code: 'retail.unknownCityTile' };
	}

	return getRetailTilePlacementBlockReason({
		tile,
		archetypeId: input.archetypeId,
		context: createRetailPlacementContext(
			input.game,
			input.city,
			input.cashCommandAvailable,
			input.financeCommandAvailable
		)
	});
}

function getRetailTilePlacementBlockReason(
	input: RetailTilePlacementInput
): PlacementBlockReason | null {
	const tileBlockReason = getStoreFootprintPlacementBlockReason(
		input.context.tileLookup,
		input.tile,
		input.context.occupiedTileIds
	);

	if (tileBlockReason) {
		return mapRetailFootprintBlockReason(tileBlockReason);
	}

	if (
		input.context.storeCount !== null &&
		input.context.storeCap !== null &&
		input.context.storeCount >= input.context.storeCap
	) {
		return { code: 'retail.storeLimitReached' };
	}

	const setupCost = forecastOpening(input.tile, input.archetypeId).setupCost;

	if (input.context.cash === null) {
		return input.context.cashCommandAvailable
			? null
			: { code: 'retail.requiresCash', amount: setupCost };
	}

	if (input.context.cash < setupCost) {
		if (input.context.financeCommandAvailable && input.context.game) {
			const assessment = input.context.getAssessment();
			const offer = assessment
				? getExpansionFinanceOfferWithAssessment(input.context.game, setupCost, assessment)
				: getExpansionFinanceOffer(input.context.game, setupCost);
			if (offer) {
				return null;
			}
		}
		return { code: 'retail.requiresCash', amount: setupCost };
	}

	return input.context.cashCommandAvailable
		? null
		: { code: 'retail.requiresCash', amount: setupCost };
}

export function getRetailBuildMenuOptions(input: RetailBuildMenuInput): RetailBuildMenuOption[] {
	const financeCommandAvailable = input.financeCommandAvailable ?? true;
	const context = createRetailPlacementContext(
		input.game,
		input.city,
		input.cashCommandAvailable,
		financeCommandAvailable
	);
	// The assessment depends only on `game` (not on the per-archetype
	// `minimumSetupCost`), so memoize it and run `assessCredit` on first
	// access — cash-covered menus, capped menus, and menus with no structurally
	// valid tiles never trigger the principal scan. Without this, each
	// cash-short archetype re-ran assessCredit's principal scan through
	// getExpansionFinanceOffer.
	const getAssessment = createLazyCreditAssessment(context.game, financeCommandAvailable);

	// Footprint block reasons are archetype-independent (they depend only on
	// terrain, locked state, edge-of-map, and existing occupancy), so compute
	// them once per tile and reuse across every archetype. This avoids the
	// previous double-iteration where the disabled-reason path rescanned all
	// tiles after the valid-tile filter had already walked them.
	const tileFootprintReasons = input.city.tiles.map((tile) => ({
		tile,
		footprintReason: getStoreFootprintPlacementBlockReason(
			context.tileLookup,
			tile,
			context.occupiedTileIds
		)
	}));

	return ARCHETYPES.map((archetype) => {
		const validForecasts: ReturnType<typeof forecastOpening>[] = [];
		const footprintReasons = new Set<StoreFootprintPlacementBlockReason>();

		for (const { tile, footprintReason } of tileFootprintReasons) {
			if (footprintReason) {
				footprintReasons.add(footprintReason);
				continue;
			}

			if (
				context.storeCount !== null &&
				context.storeCap !== null &&
				context.storeCount >= context.storeCap
			) {
				continue;
			}

			const forecast = forecastOpening(tile, archetype.id);

			validForecasts.push(forecast);
		}

		if (validForecasts.length === 0) {
			return {
				archetypeId: archetype.id,
				setupCostRange: { min: 0, max: 0 },
				projectedDailyRevenueRange: { min: 0, max: 0 },
				validTileCount: 0,
				disabledReason: resolveRetailDisabledReason(context, footprintReasons),
				financeOffer: null
			};
		}

		const minimumSetupCost = Math.min(...validForecasts.map((forecast) => forecast.setupCost));
		const cashCovered = context.cash === null || context.cash >= minimumSetupCost;
		// Only pull the (memoized) assessment when this archetype is actually
		// cash-short — cash-covered archetypes never trigger the principal scan.
		const assessment = !cashCovered ? getAssessment() : null;
		const financeOffer =
			!cashCovered && context.financeCommandAvailable && context.game && assessment
				? getExpansionFinanceOfferWithAssessment(context.game, minimumSetupCost, assessment)
				: null;
		const fundingUnavailable = cashCovered ? !context.cashCommandAvailable : financeOffer === null;

		return {
			archetypeId: archetype.id,
			setupCostRange: rangeFrom(validForecasts.map((forecast) => forecast.setupCost)),
			projectedDailyRevenueRange: rangeFrom(
				validForecasts.map((forecast) => forecast.projectedDailyRevenue)
			),
			validTileCount: validForecasts.length,
			disabledReason: fundingUnavailable
				? { code: 'retail.requiresCash', amount: minimumSetupCost }
				: null,
			financeOffer
		};
	});
}

export function getIndustrialBuildMenuOptions(
	input: IndustrialBuildMenuInput
): IndustrialBuildMenuOption[] {
	// The assessment depends only on `game` (not on the per-type `buildCost`),
	// so memoize it and run `assessCredit` on first access — cash-covered menus
	// never trigger the principal scan. Without this, each cash-short building
	// type re-ran assessCredit's principal scan through getExpansionFinanceOffer.
	const getAssessment = createLazyCreditAssessment(input.game, input.financeCommandAvailable);

	return Object.values(INDUSTRIAL_BUILDING_TYPES).map((buildingType) => {
		if (!input.game) {
			return {
				buildingTypeId: buildingType.id,
				disabledReason: null,
				financeOffer: null
			};
		}

		if (input.game.cash >= buildingType.buildCost) {
			return {
				buildingTypeId: buildingType.id,
				disabledReason: input.cashCommandAvailable
					? null
					: { code: 'industry.commandUnavailable' as const },
				financeOffer: null
			};
		}

		// Only pull the (memoized) assessment when this building is actually
		// cash-short — cash-covered buildings returned above never reach here.
		const assessment = getAssessment();
		const financeOffer =
			input.financeCommandAvailable && assessment
				? getExpansionFinanceOfferWithAssessment(input.game, buildingType.buildCost, assessment)
				: null;
		return {
			buildingTypeId: buildingType.id,
			disabledReason: financeOffer
				? null
				: {
						code: 'industry.requiresCash' as const,
						buildingTypeId: buildingType.id,
						amount: buildingType.buildCost
					},
			financeOffer
		};
	});
}

function resolveRetailDisabledReason(
	context: RetailPlacementContext,
	footprintReasons: Set<StoreFootprintPlacementBlockReason>
): PlacementBlockReason {
	if (
		context.storeCount !== null &&
		context.storeCap !== null &&
		context.storeCount >= context.storeCap
	) {
		return { code: 'retail.storeLimitReached' };
	}

	for (const reason of ['occupied', 'locked', 'road', 'river'] as const) {
		if (footprintReasons.has(reason)) {
			return mapRetailFootprintBlockReason(reason);
		}
	}

	return { code: 'retail.noValidTiles' };
}

function mapRetailFootprintBlockReason(
	reason: StoreFootprintPlacementBlockReason
): PlacementBlockReason {
	switch (reason) {
		case 'occupied':
			return { code: 'retail.occupiedLocation' };
		case 'locked':
			return { code: 'retail.lockedLocation' };
		case 'road':
			return { code: 'retail.roadLocation' };
		case 'river':
			return { code: 'retail.riverLocation' };
	}
}

function createRetailPlacementContext(
	game: GameState | null,
	city: City,
	cashCommandAvailable = true,
	financeCommandAvailable = true,
	getAssessment: () => CreditAssessment | null = () => null
): RetailPlacementContext {
	const tileLookup = createCityTileLookup(city);

	return {
		tileLookup,
		occupiedTileIds: game ? getOccupiedStoreTileIds(city, game.stores, tileLookup) : new Set(),
		storeCount: game?.stores.length ?? null,
		storeCap: game?.storeCap ?? null,
		cash: game?.cash ?? null,
		game,
		cashCommandAvailable,
		financeCommandAvailable,
		getAssessment
	};
}

/**
 * Builds a memoizing getter that returns the founding-term credit assessment
 * for `game`, computing `assessCredit(game, FOUNDING_LOAN_TERM_DAYS)` on first
 * access and caching the result. Returns `null` when there is no game or
 * financing is unavailable, so cash-covered or structurally blocked previews
 * never trigger the principal scan. `assessCredit`'s expensive part depends
 * only on `game` (not on the per-tile/per-archetype/per-type cost), so one
 * getter can be shared across every cash-short entry in a build menu or
 * full-map preview.
 */
function createLazyCreditAssessment(
	game: GameState | null,
	financeCommandAvailable: boolean
): () => CreditAssessment | null {
	let cached: CreditAssessment | null | undefined;
	return (): CreditAssessment | null => {
		if (cached !== undefined) return cached;
		cached = game && financeCommandAvailable ? assessCredit(game, FOUNDING_LOAN_TERM_DAYS) : null;
		return cached;
	};
}

export function createIndustryPlacementPreview(input: IndustryPreviewInput): PlacementPreview {
	const city = getActiveIndustryCity(input.game);
	const placementContext = input.game ? createIndustrialPlacementContext(input.game) : null;

	if (!city) {
		return { validTileIds: [], invalidTileIds: [] };
	}

	// The finance offer depends only on `game` and the building type's fixed
	// buildCost, both constant across tiles. Memoize it and run
	// getExpansionFinanceOffer (and assessCredit's principal scan) on first
	// access — cash-covered or structurally blocked previews never trigger the
	// scan. The preview recomputes on every game update while industrial
	// placement is armed, so this avoids the scan when it would never be
	// consulted.
	const buildingType = input.game ? INDUSTRIAL_BUILDING_TYPES[input.buildingTypeId] : undefined;
	let cachedFinanceOffer: ExpansionFinanceOffer | null | undefined;
	const getFinanceOffer = (): ExpansionFinanceOffer | null => {
		if (cachedFinanceOffer !== undefined) return cachedFinanceOffer;
		cachedFinanceOffer =
			input.game && buildingType && input.financeCommandAvailable
				? getExpansionFinanceOffer(input.game, buildingType.buildCost)
				: null;
		return cachedFinanceOffer;
	};

	const validTileIds: string[] = [];
	const invalidTileIds: string[] = [];

	for (const tile of city.tiles) {
		const blockReason = getIndustryBuildPlacementBlockReason({
			...input,
			tileId: tile.id,
			placementContext,
			getFinanceOffer
		});

		if (blockReason) {
			invalidTileIds.push(tile.id);
		} else {
			validTileIds.push(tile.id);
		}
	}

	return { validTileIds, invalidTileIds };
}

export function getIndustryBuildPlacementBlockReason(
	input: IndustryPlacementInput
): PlacementBlockReason | null {
	if (!input.game) {
		return { code: 'industry.lockedUntilRetail' };
	}

	const placementReason = input.placementContext
		? getIndustrialPlacementBlockReasonWithContext(
				input.placementContext,
				input.tileId,
				input.buildingTypeId
			)
		: getIndustrialPlacementBlockReason(input.game, input.tileId, input.buildingTypeId);

	if (placementReason) {
		return { code: 'industry.rawPlacementBlocked', context: placementReason };
	}

	const buildingType = INDUSTRIAL_BUILDING_TYPES[input.buildingTypeId];

	if (!buildingType) {
		return { code: 'industry.unknownBuildingType' };
	}

	if (input.game.cash < buildingType.buildCost) {
		// Use the lazy offer when the preview supplies one (avoiding a
		// per-tile assessCredit scan); fall back to a single offer computation
		// for standalone single-tile callers that omit getFinanceOffer.
		const offer =
			input.getFinanceOffer !== undefined
				? input.getFinanceOffer()
				: input.financeCommandAvailable
					? getExpansionFinanceOffer(input.game, buildingType.buildCost)
					: null;
		if (input.financeCommandAvailable && offer) {
			return null;
		}
		return {
			code: 'industry.requiresCash',
			buildingTypeId: input.buildingTypeId,
			amount: buildingType.buildCost
		};
	}

	return null;
}

function getActiveIndustryCity(game: GameState | null): IndustryCity | undefined {
	return game?.industryCities.find((city) => city.id === game.activeIndustryCityId);
}

/**
 * Resolves a clicked tile to the anchor tile id that should actually receive a
 * placement. Placement previews only mark valid 2x2 anchors, so clicking a
 * non-anchor cell that belongs to a valid footprint would otherwise try to
 * anchor at the clicked cell (usually invalid). When the clicked tile sits
 * inside a valid anchor's footprint, that anchor is returned instead. If the
 * clicked tile is itself a valid anchor, or is not inside any valid footprint,
 * the clicked tile id is returned unchanged and the normal block check decides.
 */
export function resolveRetailPlacementAnchorTileId(
	preview: PlacementPreview,
	city: City,
	clickedTileId: string
): string {
	const clicked = getTileById(city, clickedTileId);
	if (!clicked) {
		return clickedTileId;
	}

	if (preview.validTileIds.includes(clickedTileId)) {
		return clickedTileId;
	}

	for (const anchorId of preview.validTileIds) {
		const anchor = getTileById(city, anchorId);
		if (anchor && isTileInStoreFootprint(clicked, { mapX: anchor.x, mapY: anchor.y })) {
			return anchorId;
		}
	}

	return clickedTileId;
}

/**
 * Industry-side mirror of resolveRetailPlacementAnchorTileId: resolves a
 * clicked industrial tile to the anchor of a valid 2x2 footprint that contains
 * it, so clicking a non-anchor cell places on the footprint anchor.
 */
export function resolveIndustryPlacementAnchorTileId(
	preview: PlacementPreview,
	city: IndustryCity,
	clickedTileId: string
): string {
	const clicked = getIndustryTileById(city, clickedTileId);
	if (!clicked) {
		return clickedTileId;
	}

	if (preview.validTileIds.includes(clickedTileId)) {
		return clickedTileId;
	}

	for (const anchorId of preview.validTileIds) {
		const anchor = getIndustryTileById(city, anchorId);
		if (anchor && isTileInIndustryBuildingFootprint(clicked, { mapX: anchor.x, mapY: anchor.y })) {
			return anchorId;
		}
	}

	return clickedTileId;
}

/**
 * Selection-side mirror of resolveRetailPlacementAnchorTileId: when a click
 * lands on a non-anchor cell that sits inside a placed store's 2x2 footprint,
 * resolve to that store's anchor tile id so the inspector shows the anchor's
 * tile-derived stats (neighborhood/demand/rent) instead of the clicked cell's.
 * Returns the clicked tile id unchanged when the cell is not inside any store
 * footprint in this city.
 */
export function resolveSelectionAnchorTileId(
	city: City,
	stores: readonly Store[],
	clickedTileId: string
): string {
	const clicked = getTileById(city, clickedTileId);
	if (!clicked) {
		return clickedTileId;
	}

	const store = stores.find((s) => s.cityId === city.id && isTileInStoreFootprint(clicked, s));

	return store ? store.tileId : clickedTileId;
}

/**
 * Industry-side mirror of resolveSelectionAnchorTileId for industrial building
 * selection clicks.
 */
export function resolveIndustrySelectionAnchorTileId(
	city: IndustryCity,
	buildings: readonly IndustrialBuilding[],
	clickedTileId: string
): string {
	const clicked = getIndustryTileById(city, clickedTileId);
	if (!clicked) {
		return clickedTileId;
	}

	const building = buildings.find(
		(b) => b.cityId === city.id && isTileInIndustryBuildingFootprint(clicked, b)
	);

	return building ? building.tileId : clickedTileId;
}

function rangeFrom(values: number[]): NumberRange {
	return {
		min: Math.min(...values),
		max: Math.max(...values)
	};
}
