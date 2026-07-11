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

interface RetailPlacementInput {
	game: GameState | null;
	city: City;
	tileId: string;
	archetypeId: ArchetypeId;
}

interface RetailPreviewInput {
	game: GameState | null;
	city: City;
	archetypeId: ArchetypeId;
}

interface RetailBuildMenuInput {
	game: GameState | null;
	city: City;
}

interface RetailPlacementContext {
	tileLookup: CityTileLookup;
	occupiedTileIds: ReadonlySet<string>;
	storeCount: number | null;
	storeCap: number | null;
	cash: number | null;
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
	placementContext?: IndustrialPlacementContext | null;
}

interface IndustryPreviewInput {
	game: GameState | null;
	buildingTypeId: IndustrialBuildingTypeId;
}

export function createRetailPlacementPreview(input: RetailPreviewInput): PlacementPreview {
	const context = createRetailPlacementContext(input.game, input.city);
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
		context: createRetailPlacementContext(input.game, input.city)
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

	if (input.context.cash === null) {
		return null;
	}

	const setupCost = forecastOpening(input.tile, input.archetypeId).setupCost;

	if (input.context.cash < setupCost) {
		return { code: 'retail.requiresCash', amount: setupCost };
	}

	return null;
}

export function getRetailBuildMenuOptions(input: RetailBuildMenuInput): RetailBuildMenuOption[] {
	const context = createRetailPlacementContext(input.game, input.city);

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
		let cheapestBlockedSetupCost: number | null = null;

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

			if (context.cash !== null && context.cash < forecast.setupCost) {
				cheapestBlockedSetupCost =
					cheapestBlockedSetupCost === null
						? forecast.setupCost
						: Math.min(cheapestBlockedSetupCost, forecast.setupCost);
				continue;
			}

			validForecasts.push(forecast);
		}

		if (validForecasts.length === 0) {
			return {
				archetypeId: archetype.id,
				setupCostRange: { min: 0, max: 0 },
				projectedDailyRevenueRange: { min: 0, max: 0 },
				validTileCount: 0,
				disabledReason: resolveRetailDisabledReason(
					context,
					footprintReasons,
					cheapestBlockedSetupCost
				)
			};
		}

		return {
			archetypeId: archetype.id,
			setupCostRange: rangeFrom(validForecasts.map((forecast) => forecast.setupCost)),
			projectedDailyRevenueRange: rangeFrom(
				validForecasts.map((forecast) => forecast.projectedDailyRevenue)
			),
			validTileCount: validForecasts.length,
			disabledReason: null
		};
	});
}

function resolveRetailDisabledReason(
	context: RetailPlacementContext,
	footprintReasons: Set<StoreFootprintPlacementBlockReason>,
	cheapestBlockedSetupCost: number | null
): PlacementBlockReason {
	if (
		context.storeCount !== null &&
		context.storeCap !== null &&
		context.storeCount >= context.storeCap
	) {
		return { code: 'retail.storeLimitReached' };
	}

	if (cheapestBlockedSetupCost !== null) {
		return { code: 'retail.requiresCash', amount: cheapestBlockedSetupCost };
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

function createRetailPlacementContext(game: GameState | null, city: City): RetailPlacementContext {
	const tileLookup = createCityTileLookup(city);

	return {
		tileLookup,
		occupiedTileIds: game ? getOccupiedStoreTileIds(city, game.stores, tileLookup) : new Set(),
		storeCount: game?.stores.length ?? null,
		storeCap: game?.storeCap ?? null,
		cash: game?.cash ?? null
	};
}

export function createIndustryPlacementPreview(input: IndustryPreviewInput): PlacementPreview {
	const city = getActiveIndustryCity(input.game);
	const placementContext = input.game ? createIndustrialPlacementContext(input.game) : null;

	if (!city) {
		return { validTileIds: [], invalidTileIds: [] };
	}

	const validTileIds: string[] = [];
	const invalidTileIds: string[] = [];

	for (const tile of city.tiles) {
		const blockReason = getIndustryBuildPlacementBlockReason({
			...input,
			tileId: tile.id,
			placementContext
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
