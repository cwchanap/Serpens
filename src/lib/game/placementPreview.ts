import { ARCHETYPES } from './archetypes';
import { getTileById, getTilePlacementBlockReason } from './city';
import { INDUSTRIAL_BUILDING_TYPES } from './industry';
import { getIndustrialPlacementBlockReason } from './industryPlacement';
import { forecastOpening } from './placement';
import type { ArchetypeId, City, GameState, IndustrialBuildingTypeId, IndustryCity } from './types';
import { MAX_STORES } from './types';

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

interface IndustryPlacementInput {
	game: GameState | null;
	tileId: string;
	buildingTypeId: IndustrialBuildingTypeId;
}

interface IndustryPreviewInput {
	game: GameState | null;
	buildingTypeId: IndustrialBuildingTypeId;
}

export function createRetailPlacementPreview(input: RetailPreviewInput): PlacementPreview {
	const validTileIds: string[] = [];
	const invalidTileIds: string[] = [];

	for (const tile of input.city.tiles) {
		const blockReason = getRetailPlacementBlockReason({
			...input,
			tileId: tile.id
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

	const tileBlockReason = getTilePlacementBlockReason(tile);

	if (tileBlockReason) {
		return tileBlockReason;
	}

	if (input.game?.stores.some((store) => store.tileId === tile.id)) {
		return 'Occupied location';
	}

	if (input.game && input.game.stores.length >= MAX_STORES) {
		return 'Store limit reached';
	}

	const setupCost = forecastOpening(tile, input.archetypeId).setupCost;

	if (input.game && input.game.cash < setupCost) {
		return `Requires ${setupCost.toLocaleString('en-US')} cash`;
	}

	return null;
}

export function getRetailBuildMenuOptions(input: RetailBuildMenuInput): RetailBuildMenuOption[] {
	return ARCHETYPES.map((archetype) => {
		const forecasts = input.city.tiles
			.filter(
				(tile) =>
					getRetailPlacementBlockReason({
						game: input.game,
						city: input.city,
						tileId: tile.id,
						archetypeId: archetype.id
					}) === null
			)
			.map((tile) => forecastOpening(tile, archetype.id));

		if (forecasts.length === 0) {
			return {
				archetypeId: archetype.id,
				setupCostRange: { min: 0, max: 0 },
				projectedDailyRevenueRange: { min: 0, max: 0 },
				validTileCount: 0,
				disabledReason: 'No valid tiles'
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

export function createIndustryPlacementPreview(input: IndustryPreviewInput): PlacementPreview {
	const city = getActiveIndustryCity(input.game);

	if (!city) {
		return { validTileIds: [], invalidTileIds: [] };
	}

	const validTileIds: string[] = [];
	const invalidTileIds: string[] = [];

	for (const tile of city.tiles) {
		const blockReason = getIndustryBuildPlacementBlockReason({
			...input,
			tileId: tile.id
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

	const placementReason = getIndustrialPlacementBlockReason(
		input.game,
		input.tileId,
		input.buildingTypeId
	);

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
