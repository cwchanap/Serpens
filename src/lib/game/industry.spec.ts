import { describe, expect, test } from 'vitest';
import {
	CONVENIENCE_BUILDING_TYPE_IDS,
	INDUSTRIAL_BUILDING_TYPES,
	MATERIALS,
	PRODUCTION_RECIPES,
	generateIndustryCity,
	getIndustrialBuildingTypesForProductChain,
	getIndustryTileById,
	getIndustryTilesByResource
} from './industry';
import type {
	IndustrialBuildingType,
	IndustryCity,
	IndustryTerrainId,
	IndustryTile
} from './types';

function acceptIndustrialBuildingType(building: IndustrialBuildingType): void {
	void building;
}

function tilesInRegion(
	city: IndustryCity,
	predicate: (tile: IndustryTile) => boolean
): IndustryTile[] {
	return city.tiles.filter(predicate);
}

function countTerrain(tiles: IndustryTile[], terrain: IndustryTerrainId): number {
	return tiles.filter((tile) => tile.terrain === terrain).length;
}

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
		expect.assertions(5);

		expect(MATERIALS.snacks.kind).toBe('finished');
		expect(MATERIALS.drinks.kind).toBe('finished');
		expect(MATERIALS.essentials.kind).toBe('finished');
		expect(MATERIALS.gifts.kind).toBe('finished');
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

	test('resolves the full upstream building chain for snacks', () => {
		expect.assertions(3);
		const buildingTypeIds = getIndustrialBuildingTypesForProductChain('snacks').map(
			(buildingType) => buildingType.id
		);

		expect(buildingTypeIds).toEqual([
			'grain-farm',
			'salt-mine',
			'oilseed-farm',
			'pulpwood-grove',
			'chemical-feedstock-well',
			'flour-mill',
			'oil-press',
			'pulp-mill',
			'plastic-plant',
			'packaging-plant',
			'snack-factory'
		]);
		expect(buildingTypeIds).not.toContain('drink-bottling-plant');
		expect(buildingTypeIds).not.toContain('warehouse');
	});

	test('resolves the full upstream building chain for drinks', () => {
		expect.assertions(3);
		const buildingTypeIds = getIndustrialBuildingTypesForProductChain('drinks').map(
			(buildingType) => buildingType.id
		);

		expect(buildingTypeIds).toEqual([
			'water-pump',
			'fruit-farm',
			'sugar-farm',
			'pulpwood-grove',
			'chemical-feedstock-well',
			'water-filtration-plant',
			'syrup-plant',
			'pulp-mill',
			'plastic-plant',
			'packaging-plant',
			'drink-bottling-plant'
		]);
		expect(buildingTypeIds).not.toContain('snack-factory');
		expect(buildingTypeIds).not.toContain('warehouse');
	});

	test('resolves the full upstream building chain for gifts', () => {
		expect.assertions(3);
		const buildingTypeIds = getIndustrialBuildingTypesForProductChain('gifts').map(
			(buildingType) => buildingType.id
		);

		expect(buildingTypeIds).toEqual([
			'pulpwood-grove',
			'chemical-feedstock-well',
			'pulp-mill',
			'plastic-plant',
			'packaging-plant',
			'gift-workshop'
		]);
		expect(buildingTypeIds).not.toContain('snack-factory');
		expect(buildingTypeIds).not.toContain('warehouse');
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

	test('can generate a specialized industry city with only selected resource anchors', () => {
		expect.assertions(4);
		const city = generateIndustryCity({
			id: 'breadbasket-basin',
			name: 'Breadbasket Basin',
			width: 18,
			height: 18,
			seed: 20260533,
			resourceProfile: {
				resourceIds: [
					'grain-field',
					'oilseed-field',
					'fruit-orchard',
					'sugar-field',
					'water-source'
				],
				industrialBias: 0.9
			}
		});

		expect(getIndustryTilesByResource(city, 'grain-field')).toHaveLength(1);
		expect(getIndustryTilesByResource(city, 'fruit-orchard')).toHaveLength(1);
		expect(getIndustryTilesByResource(city, 'salt-deposit')).toHaveLength(0);
		expect(city.tiles.some((tile) => tile.terrain === 'industrial' && !tile.locked)).toBe(true);
	});

	test('organizes filler terrain into planned districts', () => {
		expect.assertions(5);
		const city = generateIndustryCity({
			id: 'industry-city',
			name: 'Industry City',
			width: 18,
			height: 18,
			seed: 20260512
		});
		const cropBelt = tilesInRegion(city, (tile) => tile.x >= 1 && tile.x <= 8 && tile.y <= 3);
		const extractionPocket = tilesInRegion(
			city,
			(tile) => tile.x >= 1 && tile.x <= 5 && tile.y >= 4 && tile.y <= 6
		);
		const utilityBelt = tilesInRegion(
			city,
			(tile) => tile.x >= 1 && tile.x <= 7 && tile.y >= 7 && tile.y <= 10
		);
		const industrialPark = tilesInRegion(
			city,
			(tile) => tile.x >= 9 && tile.y >= 6 && tile.x <= 16 && tile.y <= 16
		);
		const internalBlockedTiles = tilesInRegion(
			city,
			(tile) => tile.terrain === 'blocked' && tile.x > 0 && tile.y > 0 && tile.x < 17 && tile.y < 17
		);

		expect(countTerrain(cropBelt, 'farmland')).toBeGreaterThanOrEqual(20);
		expect(countTerrain(extractionPocket, 'deposit')).toBeGreaterThanOrEqual(11);
		expect(
			countTerrain(utilityBelt, 'water') + countTerrain(utilityBelt, 'forest')
		).toBeGreaterThanOrEqual(22);
		expect(countTerrain(industrialPark, 'industrial')).toBeGreaterThanOrEqual(82);
		expect(internalBlockedTiles).toHaveLength(18);
	});

	test('high industrial bias produces more industrial terrain than low bias', () => {
		expect.assertions(2);
		const quarryCity = generateIndustryCity({
			id: 'quarry-works',
			name: 'Quarry Works',
			width: 18,
			height: 18,
			seed: 20260534,
			resourceProfile: {
				resourceIds: ['salt-deposit', 'chemical-feedstock', 'pulpwood-forest', 'water-source'],
				industrialBias: 1.25
			}
		});
		const breadbasketCity = generateIndustryCity({
			id: 'breadbasket-basin',
			name: 'Breadbasket Basin',
			width: 18,
			height: 18,
			seed: 20260533,
			resourceProfile: {
				resourceIds: ['grain-field', 'oilseed-field', 'fruit-orchard', 'sugar-field', 'water-source'],
				industrialBias: 0.9
			}
		});

		const quarryIndustrial = quarryCity.tiles.filter(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		).length;
		const breadbasketIndustrial = breadbasketCity.tiles.filter(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		).length;

		expect(quarryIndustrial).toBeGreaterThan(breadbasketIndustrial);
		expect(quarryIndustrial).toBeGreaterThan(0);
	});
});
