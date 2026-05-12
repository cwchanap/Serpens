import { describe, expect, test } from 'vitest';
import {
	CONVENIENCE_BUILDING_TYPE_IDS,
	INDUSTRIAL_BUILDING_TYPES,
	MATERIALS,
	PRODUCTION_RECIPES,
	generateIndustryCity,
	getIndustryTileById,
	getIndustryTilesByResource
} from './industry';
import type { IndustrialBuildingType } from './types';

function acceptIndustrialBuildingType(_building: IndustrialBuildingType): void {}

acceptIndustrialBuildingType({
	id: 'warehouse',
	name: 'Invalid Recipe Reference Probe',
	buildCost: 0,
	dailyOperatingCost: 0,
	requiredResource: null,
	requiresIndustrialTile: true,
	// @ts-expect-error recipeId must reference a known production recipe id.
	recipeId: 'missing-recipe',
	warehouseCapacity: 0
});

describe('industry domain catalog', () => {
	test('defines every convenience finished material and required building', () => {
		expect.assertions(4);

		expect(MATERIALS.snacks.kind).toBe('finished');
		expect(MATERIALS.drinks.kind).toBe('finished');
		expect(MATERIALS.essentials.kind).toBe('finished');
		expect(CONVENIENCE_BUILDING_TYPE_IDS.every((id) => INDUSTRIAL_BUILDING_TYPES[id])).toBe(true);
	});

	test('connects convenience recipes to known materials', () => {
		expect.assertions(1);
		const materialIds = new Set(Object.keys(MATERIALS));
		const recipeMaterialIds = Object.values(PRODUCTION_RECIPES).flatMap((recipe) => [
			...recipe.inputs.map((input) => input.materialId),
			...recipe.outputs.map((output) => output.materialId)
		]);

		expect(recipeMaterialIds.every((materialId) => materialIds.has(materialId))).toBe(true);
	});

	test('connects industrial buildings to known recipes', () => {
		expect.assertions(1);
		const recipeIds = new Set(Object.keys(PRODUCTION_RECIPES));
		const buildingRecipeIds = Object.values(INDUSTRIAL_BUILDING_TYPES)
			.map((building) => building.recipeId)
			.filter((recipeId) => recipeId !== null);

		expect(buildingRecipeIds.every((recipeId) => recipeIds.has(recipeId))).toBe(true);
	});
});

describe('industry city generation', () => {
	test('generates deterministic industry tiles for the same seed', () => {
		expect.assertions(1);
		const first = generateIndustryCity({
			id: 'industry-city',
			name: 'Industry City',
			width: 18,
			height: 18,
			seed: 20260512
		});
		const second = generateIndustryCity({
			id: 'industry-city',
			name: 'Industry City',
			width: 18,
			height: 18,
			seed: 20260512
		});

		expect(first).toEqual(second);
	});

	test('guarantees required convenience resources and industrial tiles', () => {
		expect.assertions(10);
		const city = generateIndustryCity({
			id: 'industry-city',
			name: 'Industry City',
			width: 18,
			height: 18,
			seed: 20260512
		});

		expect(getIndustryTilesByResource(city, 'grain-field').length).toBeGreaterThan(0);
		expect(getIndustryTilesByResource(city, 'salt-deposit').length).toBeGreaterThan(0);
		expect(getIndustryTilesByResource(city, 'oilseed-field').length).toBeGreaterThan(0);
		expect(getIndustryTilesByResource(city, 'water-source').length).toBeGreaterThan(0);
		expect(getIndustryTilesByResource(city, 'fruit-orchard').length).toBeGreaterThan(0);
		expect(getIndustryTilesByResource(city, 'sugar-field').length).toBeGreaterThan(0);
		expect(getIndustryTilesByResource(city, 'pulpwood-forest').length).toBeGreaterThan(0);
		expect(getIndustryTilesByResource(city, 'chemical-feedstock').length).toBeGreaterThan(0);
		expect(city.tiles.some((tile) => tile.terrain === 'industrial' && !tile.locked)).toBe(true);
		expect(getIndustryTileById(city, 'industry-city-1-1')?.cityId).toBe(city.id);
	});
});
