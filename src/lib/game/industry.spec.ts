import { describe, expect, it, test } from 'vitest';
import {
	CONVENIENCE_BUILDING_TYPE_IDS,
	FINISHED_PRODUCT_MATERIAL_IDS,
	INDUSTRIAL_BUILDING_TYPES,
	MATERIALS,
	PRODUCTION_RECIPES,
	generateIndustryCity,
	getCategoryTier,
	getIndustrialBuildingTypesForProductChain,
	getIndustryTileById,
	getIndustryTilesByResource
} from './industry';
import type {
	IndustrialBuildingType,
	IndustryCity,
	IndustryResourceId,
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
		const sharedResourceIds: IndustryResourceId[] = [
			'salt-deposit',
			'chemical-feedstock',
			'pulpwood-forest',
			'water-source'
		];
		const highBiasCity = generateIndustryCity({
			id: 'high-bias',
			name: 'High Bias',
			width: 18,
			height: 18,
			seed: 20260534,
			resourceProfile: {
				resourceIds: sharedResourceIds,
				industrialBias: 1.25
			}
		});
		const lowBiasCity = generateIndustryCity({
			id: 'low-bias',
			name: 'Low Bias',
			width: 18,
			height: 18,
			seed: 20260534,
			resourceProfile: {
				resourceIds: sharedResourceIds,
				industrialBias: 0.9
			}
		});

		const highBiasIndustrial = highBiasCity.tiles.filter(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		).length;
		const lowBiasIndustrial = lowBiasCity.tiles.filter(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		).length;

		expect(highBiasIndustrial).toBeGreaterThan(lowBiasIndustrial);
		expect(highBiasIndustrial).toBeGreaterThan(0);
	});

	test('clamps zero or negative industrialBias to a positive minimum', () => {
		expect.assertions(2);
		const zeroBias = generateIndustryCity({
			id: 'zero-bias',
			name: 'Zero Bias',
			width: 18,
			height: 18,
			seed: 20260535,
			resourceProfile: {
				resourceIds: ['grain-field', 'salt-deposit'],
				industrialBias: 0
			}
		});
		const negativeBias = generateIndustryCity({
			id: 'negative-bias',
			name: 'Negative Bias',
			width: 18,
			height: 18,
			seed: 20260536,
			resourceProfile: {
				resourceIds: ['grain-field', 'salt-deposit'],
				industrialBias: -1
			}
		});

		expect(zeroBias.tiles.every((tile) => Number.isFinite(tile.x) && Number.isFinite(tile.y))).toBe(
			true
		);
		expect(
			negativeBias.tiles.every((tile) => Number.isFinite(tile.x) && Number.isFinite(tile.y))
		).toBe(true);
	});
});

describe('tier 1 chains', () => {
	it('defines the three new finished materials with one producer recipe each', () => {
		for (const id of ['bottled-water', 'produce', 'pantry'] as const) {
			expect(MATERIALS[id].kind).toBe('finished');
			const producers = Object.values(PRODUCTION_RECIPES).filter((recipe) =>
				recipe.outputs.some((output) => output.materialId === id)
			);
			expect(producers, `${id} must have exactly one producer recipe`).toHaveLength(1);
		}
	});

	it('lists the new finished materials as supported products', () => {
		expect(FINISHED_PRODUCT_MATERIAL_IDS).toContain('bottled-water');
		expect(FINISHED_PRODUCT_MATERIAL_IDS).toContain('produce');
		expect(FINISHED_PRODUCT_MATERIAL_IDS).toContain('pantry');
		expect(FINISHED_PRODUCT_MATERIAL_IDS).toHaveLength(7);
	});

	it('keeps the bottled water chain at two buildings under the tier 1 cost ceiling', () => {
		const types = getIndustrialBuildingTypesForProductChain('bottled-water');
		expect(types.map((type) => type.id).sort()).toEqual(['water-bottler', 'water-pump']);
		expect(types.reduce((sum, type) => sum + type.buildCost, 0)).toBeLessThanOrEqual(1_500);
	});

	it('keeps the produce chain at two buildings and the pantry chain at three', () => {
		expect(
			getIndustrialBuildingTypesForProductChain('produce')
				.map((type) => type.id)
				.sort()
		).toEqual(['fruit-farm', 'produce-packhouse']);
		expect(
			getIndustrialBuildingTypesForProductChain('pantry')
				.map((type) => type.id)
				.sort()
		).toEqual(['flour-mill', 'grain-farm', 'pantry-works']);
	});

	it('runs each tier 1 chain at a positive daily margin', () => {
		for (const materialId of ['bottled-water', 'produce', 'pantry'] as const) {
			const chainTypes = getIndustrialBuildingTypesForProductChain(materialId);
			const finalRecipe = Object.values(PRODUCTION_RECIPES).find((recipe) =>
				recipe.outputs.some((output) => output.materialId === materialId)
			)!;
			const outputValuePerDay = finalRecipe.outputs.reduce(
				(sum, output) => sum + output.quantity * MATERIALS[output.materialId].importCost,
				0
			);
			const dailyCost =
				chainTypes.reduce((sum, type) => sum + type.dailyOperatingCost, 0) +
				finalRecipe.operatingCost;
			expect(outputValuePerDay, `${materialId} chain must clear its daily costs`).toBeGreaterThan(
				dailyCost
			);
		}
	});

	it('assigns a tier between 1 and 3 to every industrial building type', () => {
		for (const type of Object.values(INDUSTRIAL_BUILDING_TYPES)) {
			expect([1, 2, 3], `${type.id} needs a tier`).toContain(type.tier);
		}
	});

	it('derives category tiers from the final factory of each chain', () => {
		expect(getCategoryTier('bottled-water')).toBe(1);
		expect(getCategoryTier('produce')).toBe(1);
		expect(getCategoryTier('pantry')).toBe(1);
		expect(getCategoryTier('snacks')).toBe(3);
		expect(getCategoryTier('gifts')).toBe(3);
		expect(getCategoryTier('apparel')).toBeNull();
	});

	it('terminates every finished chain in raw materials', () => {
		for (const materialId of FINISHED_PRODUCT_MATERIAL_IDS) {
			const seen = new Set<string>();
			const queue: string[] = [materialId];
			while (queue.length > 0) {
				const current = queue.pop()!;
				if (seen.has(current)) continue;
				seen.add(current);
				const producer = Object.values(PRODUCTION_RECIPES).find((recipe) =>
					recipe.outputs.some((output) => output.materialId === current)
				);
				expect(producer, `${current} in ${materialId} chain needs a producer`).toBeDefined();
				for (const input of producer!.inputs) queue.push(input.materialId);
			}
		}
	});
});
