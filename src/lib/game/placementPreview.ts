import { ARCHETYPES } from './archetypes';
import { getTileById } from './city';
import { INDUSTRIAL_BUILDING_TYPES } from './industry';
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
	type CityTileLookup
} from './storeFootprint';
import type {
	ArchetypeId,
	City,
	CityTile,
	GameState,
	IndustrialBuildingTypeId,
	IndustryCity
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
	disabledReason: string | null;
}

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

export function getRetailPlacementBlockReason(input: RetailPlacementInput): string | null {
	const tile = getTileById(input.city, input.tileId);

	if (!tile) {
		return 'Unknown city tile';
	}

	return getRetailTilePlacementBlockReason({
		tile,
		archetypeId: input.archetypeId,
		context: createRetailPlacementContext(input.game, input.city)
	});
}

function getRetailTilePlacementBlockReason(input: RetailTilePlacementInput): string | null {
	const tileBlockReason = getStoreFootprintPlacementBlockReason(
		input.context.tileLookup,
		input.tile,
		input.context.occupiedTileIds
	);

	if (tileBlockReason) {
		return tileBlockReason;
	}

	if (
		input.context.storeCount !== null &&
		input.context.storeCap !== null &&
		input.context.storeCount >= input.context.storeCap
	) {
		return 'Store limit reached';
	}

	if (input.context.cash === null) {
		return null;
	}

	const setupCost = forecastOpening(input.tile, input.archetypeId).setupCost;

	if (input.context.cash < setupCost) {
		return `Requires ${setupCost.toLocaleString('en-US')} cash`;
	}

	return null;
}

export function getRetailBuildMenuOptions(input: RetailBuildMenuInput): RetailBuildMenuOption[] {
	const context = createRetailPlacementContext(input.game, input.city);

	return ARCHETYPES.map((archetype) => {
		const forecasts = input.city.tiles
			.filter(
				(tile) =>
					getRetailTilePlacementBlockReason({
						tile,
						archetypeId: archetype.id,
						context
					}) === null
			)
			.map((tile) => forecastOpening(tile, archetype.id));

		if (forecasts.length === 0) {
			return {
				archetypeId: archetype.id,
				setupCostRange: { min: 0, max: 0 },
				projectedDailyRevenueRange: { min: 0, max: 0 },
				validTileCount: 0,
				disabledReason: getRetailBuildMenuDisabledReason(input, archetype.id, context)
			};
		}

		return {
			archetypeId: archetype.id,
			setupCostRange: rangeFrom(forecasts.map((forecast) => forecast.setupCost)),
			projectedDailyRevenueRange: rangeFrom(
				forecasts.map((forecast) => forecast.projectedDailyRevenue)
			),
			validTileCount: forecasts.length,
			disabledReason: null
		};
	});
}

function getRetailBuildMenuDisabledReason(
	input: RetailBuildMenuInput,
	archetypeId: ArchetypeId,
	context: RetailPlacementContext
): string {
	if (
		context.storeCount !== null &&
		context.storeCap !== null &&
		context.storeCount >= context.storeCap
	) {
		return 'Store limit reached';
	}

	let cheapestBlockedSetupCost: number | null = null;
	const tileReasons = new Set<string>();

	for (const tile of input.city.tiles) {
		const tileBlockReason = getStoreFootprintPlacementBlockReason(
			context.tileLookup,
			tile,
			context.occupiedTileIds
		);

		if (tileBlockReason) {
			tileReasons.add(tileBlockReason);
			continue;
		}

		if (context.cash === null) {
			continue;
		}

		const setupCost = forecastOpening(tile, archetypeId).setupCost;

		if (context.cash < setupCost) {
			cheapestBlockedSetupCost =
				cheapestBlockedSetupCost === null
					? setupCost
					: Math.min(cheapestBlockedSetupCost, setupCost);
		}
	}

	if (cheapestBlockedSetupCost !== null) {
		return `Requires ${cheapestBlockedSetupCost.toLocaleString('en-US')} cash`;
	}

	for (const reason of [
		'Occupied location',
		'Locked location',
		'Road location',
		'River location'
	]) {
		if (tileReasons.has(reason)) {
			return reason;
		}
	}

	return 'No valid tiles';
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

export function getIndustryBuildPlacementBlockReason(input: IndustryPlacementInput): string | null {
	if (!input.game) {
		return 'Found a retail store to unlock construction.';
	}

	const placementReason = input.placementContext
		? getIndustrialPlacementBlockReasonWithContext(
				input.placementContext,
				input.tileId,
				input.buildingTypeId
			)
		: getIndustrialPlacementBlockReason(input.game, input.tileId, input.buildingTypeId);

	if (placementReason) {
		return placementReason;
	}

	const buildingType = INDUSTRIAL_BUILDING_TYPES[input.buildingTypeId];

	if (!buildingType) {
		return 'Unknown industrial building type';
	}

	if (input.game.cash < buildingType.buildCost) {
		return `${buildingType.name} requires ${buildingType.buildCost.toLocaleString('en-US')} cash.`;
	}

	return null;
}

function getActiveIndustryCity(game: GameState | null): IndustryCity | undefined {
	return game?.industryCities.find((city) => city.id === game.activeIndustryCityId);
}

function rangeFrom(values: number[]): NumberRange {
	return {
		min: Math.min(...values),
		max: Math.max(...values)
	};
}
