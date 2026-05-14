import { createRng, randomInt, type Rng } from './rng';
import type {
	IndustrialBuildingType,
	IndustrialBuildingTypeId,
	IndustryCity,
	IndustryResourceId,
	IndustryTerrainId,
	IndustryTile,
	MaterialDefinition,
	MaterialId,
	ProductionRecipe,
	ProductionRecipeId
} from './types';

interface GenerateIndustryCityInput {
	id: string;
	name: string;
	width: number;
	height: number;
	seed: number;
}

const RESOURCE_ANCHORS: Array<{
	x: number;
	y: number;
	resource: IndustryResourceId;
	terrain: IndustryTerrainId;
}> = [
	{ x: 1, y: 1, resource: 'grain-field', terrain: 'farmland' },
	{ x: 3, y: 1, resource: 'oilseed-field', terrain: 'farmland' },
	{ x: 5, y: 1, resource: 'fruit-orchard', terrain: 'farmland' },
	{ x: 7, y: 1, resource: 'sugar-field', terrain: 'farmland' },
	{ x: 1, y: 4, resource: 'salt-deposit', terrain: 'deposit' },
	{ x: 3, y: 4, resource: 'chemical-feedstock', terrain: 'deposit' },
	{ x: 1, y: 7, resource: 'water-source', terrain: 'water' },
	{ x: 4, y: 7, resource: 'pulpwood-forest', terrain: 'forest' }
];

export const MATERIALS: Readonly<Record<MaterialId, MaterialDefinition>> = {
	grain: {
		id: 'grain',
		name: 'Grain',
		kind: 'raw',
		importCost: 2,
		localValue: 1
	},
	salt: {
		id: 'salt',
		name: 'Salt',
		kind: 'raw',
		importCost: 1,
		localValue: 1
	},
	oilseeds: {
		id: 'oilseeds',
		name: 'Oilseeds',
		kind: 'raw',
		importCost: 3,
		localValue: 2
	},
	water: {
		id: 'water',
		name: 'Water',
		kind: 'raw',
		importCost: 1,
		localValue: 1
	},
	fruit: {
		id: 'fruit',
		name: 'Fruit',
		kind: 'raw',
		importCost: 4,
		localValue: 3
	},
	sugar: {
		id: 'sugar',
		name: 'Sugar',
		kind: 'raw',
		importCost: 2,
		localValue: 1
	},
	pulpwood: {
		id: 'pulpwood',
		name: 'Pulpwood',
		kind: 'raw',
		importCost: 2,
		localValue: 1
	},
	'chemical-feedstock': {
		id: 'chemical-feedstock',
		name: 'Chemical Feedstock',
		kind: 'raw',
		importCost: 5,
		localValue: 3
	},
	flour: {
		id: 'flour',
		name: 'Flour',
		kind: 'intermediate',
		importCost: 5,
		localValue: 3
	},
	'cooking-oil': {
		id: 'cooking-oil',
		name: 'Cooking Oil',
		kind: 'intermediate',
		importCost: 6,
		localValue: 4
	},
	'filtered-water': {
		id: 'filtered-water',
		name: 'Filtered Water',
		kind: 'intermediate',
		importCost: 3,
		localValue: 2
	},
	syrup: {
		id: 'syrup',
		name: 'Syrup',
		kind: 'intermediate',
		importCost: 5,
		localValue: 3
	},
	'paper-pulp': {
		id: 'paper-pulp',
		name: 'Paper Pulp',
		kind: 'intermediate',
		importCost: 4,
		localValue: 3
	},
	plastic: {
		id: 'plastic',
		name: 'Plastic',
		kind: 'intermediate',
		importCost: 6,
		localValue: 4
	},
	packaging: {
		id: 'packaging',
		name: 'Packaging',
		kind: 'intermediate',
		importCost: 5,
		localValue: 3
	},
	'cleaning-base': {
		id: 'cleaning-base',
		name: 'Cleaning Base',
		kind: 'intermediate',
		importCost: 7,
		localValue: 5
	},
	snacks: {
		id: 'snacks',
		name: 'Snacks',
		kind: 'finished',
		importCost: 12,
		localValue: 8
	},
	drinks: {
		id: 'drinks',
		name: 'Drinks',
		kind: 'finished',
		importCost: 10,
		localValue: 7
	},
	essentials: {
		id: 'essentials',
		name: 'Essentials',
		kind: 'finished',
		importCost: 14,
		localValue: 9
	},
	gifts: {
		id: 'gifts',
		name: 'Gifts',
		kind: 'finished',
		importCost: 9,
		localValue: 6
	}
};

export const PRODUCTION_RECIPES: Readonly<Record<ProductionRecipeId, ProductionRecipe>> = {
	'grain-harvest': {
		id: 'grain-harvest',
		inputs: [],
		outputs: [{ materialId: 'grain', quantity: 30 }],
		operatingCost: 0,
		stage: 'raw'
	},
	'salt-mining': {
		id: 'salt-mining',
		inputs: [],
		outputs: [{ materialId: 'salt', quantity: 24 }],
		operatingCost: 0,
		stage: 'raw'
	},
	'oilseed-harvest': {
		id: 'oilseed-harvest',
		inputs: [],
		outputs: [{ materialId: 'oilseeds', quantity: 24 }],
		operatingCost: 0,
		stage: 'raw'
	},
	'water-pumping': {
		id: 'water-pumping',
		inputs: [],
		outputs: [{ materialId: 'water', quantity: 40 }],
		operatingCost: 0,
		stage: 'raw'
	},
	'fruit-harvest': {
		id: 'fruit-harvest',
		inputs: [],
		outputs: [{ materialId: 'fruit', quantity: 22 }],
		operatingCost: 0,
		stage: 'raw'
	},
	'sugar-harvest': {
		id: 'sugar-harvest',
		inputs: [],
		outputs: [{ materialId: 'sugar', quantity: 26 }],
		operatingCost: 0,
		stage: 'raw'
	},
	'pulpwood-harvest': {
		id: 'pulpwood-harvest',
		inputs: [],
		outputs: [{ materialId: 'pulpwood', quantity: 20 }],
		operatingCost: 0,
		stage: 'raw'
	},
	'chemical-feedstock-extraction': {
		id: 'chemical-feedstock-extraction',
		inputs: [],
		outputs: [{ materialId: 'chemical-feedstock', quantity: 18 }],
		operatingCost: 0,
		stage: 'raw'
	},
	'flour-milling': {
		id: 'flour-milling',
		inputs: [{ materialId: 'grain', quantity: 10 }],
		outputs: [{ materialId: 'flour', quantity: 8 }],
		operatingCost: 18,
		stage: 'process'
	},
	'oil-pressing': {
		id: 'oil-pressing',
		inputs: [{ materialId: 'oilseeds', quantity: 10 }],
		outputs: [{ materialId: 'cooking-oil', quantity: 7 }],
		operatingCost: 20,
		stage: 'process'
	},
	'water-filtration': {
		id: 'water-filtration',
		inputs: [{ materialId: 'water', quantity: 12 }],
		outputs: [{ materialId: 'filtered-water', quantity: 10 }],
		operatingCost: 12,
		stage: 'process'
	},
	'syrup-production': {
		id: 'syrup-production',
		inputs: [
			{ materialId: 'sugar', quantity: 8 },
			{ materialId: 'water', quantity: 4 }
		],
		outputs: [{ materialId: 'syrup', quantity: 8 }],
		operatingCost: 16,
		stage: 'process'
	},
	'pulp-milling': {
		id: 'pulp-milling',
		inputs: [{ materialId: 'pulpwood', quantity: 10 }],
		outputs: [{ materialId: 'paper-pulp', quantity: 8 }],
		operatingCost: 16,
		stage: 'process'
	},
	'plastic-production': {
		id: 'plastic-production',
		inputs: [{ materialId: 'chemical-feedstock', quantity: 8 }],
		outputs: [{ materialId: 'plastic', quantity: 6 }],
		operatingCost: 24,
		stage: 'process'
	},
	'packaging-production': {
		id: 'packaging-production',
		inputs: [
			{ materialId: 'paper-pulp', quantity: 6 },
			{ materialId: 'plastic', quantity: 3 }
		],
		outputs: [{ materialId: 'packaging', quantity: 8 }],
		operatingCost: 18,
		stage: 'process'
	},
	'cleaning-base-production': {
		id: 'cleaning-base-production',
		inputs: [
			{ materialId: 'chemical-feedstock', quantity: 6 },
			{ materialId: 'filtered-water', quantity: 4 }
		],
		outputs: [{ materialId: 'cleaning-base', quantity: 6 }],
		operatingCost: 22,
		stage: 'process'
	},
	'snack-production': {
		id: 'snack-production',
		inputs: [
			{ materialId: 'flour', quantity: 6 },
			{ materialId: 'cooking-oil', quantity: 2 },
			{ materialId: 'salt', quantity: 1 },
			{ materialId: 'packaging', quantity: 2 }
		],
		outputs: [{ materialId: 'snacks', quantity: 8 }],
		operatingCost: 30,
		stage: 'final'
	},
	'drink-bottling': {
		id: 'drink-bottling',
		inputs: [
			{ materialId: 'filtered-water', quantity: 8 },
			{ materialId: 'fruit', quantity: 4 },
			{ materialId: 'syrup', quantity: 3 },
			{ materialId: 'packaging', quantity: 2 }
		],
		outputs: [{ materialId: 'drinks', quantity: 10 }],
		operatingCost: 28,
		stage: 'final'
	},
	'household-goods-production': {
		id: 'household-goods-production',
		inputs: [
			{ materialId: 'cleaning-base', quantity: 5 },
			{ materialId: 'plastic', quantity: 3 },
			{ materialId: 'packaging', quantity: 2 }
		],
		outputs: [{ materialId: 'essentials', quantity: 6 }],
		operatingCost: 34,
		stage: 'final'
	},
	'gift-production': {
		id: 'gift-production',
		inputs: [
			{ materialId: 'paper-pulp', quantity: 4 },
			{ materialId: 'plastic', quantity: 2 },
			{ materialId: 'packaging', quantity: 2 }
		],
		outputs: [{ materialId: 'gifts', quantity: 6 }],
		operatingCost: 26,
		stage: 'final'
	}
};

export const INDUSTRIAL_BUILDING_TYPES: Readonly<
	Record<IndustrialBuildingTypeId, IndustrialBuildingType>
> = {
	'grain-farm': {
		id: 'grain-farm',
		name: 'Grain Farm',
		buildCost: 600,
		dailyOperatingCost: 10,
		requiredResource: 'grain-field',
		requiresIndustrialTile: false,
		recipeId: 'grain-harvest',
		warehouseCapacity: 0
	},
	'salt-mine': {
		id: 'salt-mine',
		name: 'Salt Mine',
		buildCost: 700,
		dailyOperatingCost: 12,
		requiredResource: 'salt-deposit',
		requiresIndustrialTile: false,
		recipeId: 'salt-mining',
		warehouseCapacity: 0
	},
	'oilseed-farm': {
		id: 'oilseed-farm',
		name: 'Oilseed Farm',
		buildCost: 700,
		dailyOperatingCost: 12,
		requiredResource: 'oilseed-field',
		requiresIndustrialTile: false,
		recipeId: 'oilseed-harvest',
		warehouseCapacity: 0
	},
	'water-pump': {
		id: 'water-pump',
		name: 'Water Pump',
		buildCost: 500,
		dailyOperatingCost: 8,
		requiredResource: 'water-source',
		requiresIndustrialTile: false,
		recipeId: 'water-pumping',
		warehouseCapacity: 0
	},
	'fruit-farm': {
		id: 'fruit-farm',
		name: 'Fruit Farm',
		buildCost: 800,
		dailyOperatingCost: 14,
		requiredResource: 'fruit-orchard',
		requiresIndustrialTile: false,
		recipeId: 'fruit-harvest',
		warehouseCapacity: 0
	},
	'sugar-farm': {
		id: 'sugar-farm',
		name: 'Sugar Farm',
		buildCost: 700,
		dailyOperatingCost: 12,
		requiredResource: 'sugar-field',
		requiresIndustrialTile: false,
		recipeId: 'sugar-harvest',
		warehouseCapacity: 0
	},
	'pulpwood-grove': {
		id: 'pulpwood-grove',
		name: 'Pulpwood Grove',
		buildCost: 650,
		dailyOperatingCost: 10,
		requiredResource: 'pulpwood-forest',
		requiresIndustrialTile: false,
		recipeId: 'pulpwood-harvest',
		warehouseCapacity: 0
	},
	'chemical-feedstock-well': {
		id: 'chemical-feedstock-well',
		name: 'Chemical Feedstock Well',
		buildCost: 1100,
		dailyOperatingCost: 20,
		requiredResource: 'chemical-feedstock',
		requiresIndustrialTile: false,
		recipeId: 'chemical-feedstock-extraction',
		warehouseCapacity: 0
	},
	'flour-mill': {
		id: 'flour-mill',
		name: 'Flour Mill',
		buildCost: 1200,
		dailyOperatingCost: 24,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'flour-milling',
		warehouseCapacity: 0
	},
	'oil-press': {
		id: 'oil-press',
		name: 'Oil Press',
		buildCost: 1300,
		dailyOperatingCost: 26,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'oil-pressing',
		warehouseCapacity: 0
	},
	'water-filtration-plant': {
		id: 'water-filtration-plant',
		name: 'Water Filtration Plant',
		buildCost: 1100,
		dailyOperatingCost: 22,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'water-filtration',
		warehouseCapacity: 0
	},
	'syrup-plant': {
		id: 'syrup-plant',
		name: 'Syrup Plant',
		buildCost: 1250,
		dailyOperatingCost: 24,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'syrup-production',
		warehouseCapacity: 0
	},
	'pulp-mill': {
		id: 'pulp-mill',
		name: 'Pulp Mill',
		buildCost: 1250,
		dailyOperatingCost: 24,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'pulp-milling',
		warehouseCapacity: 0
	},
	'plastic-plant': {
		id: 'plastic-plant',
		name: 'Plastic Plant',
		buildCost: 1500,
		dailyOperatingCost: 30,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'plastic-production',
		warehouseCapacity: 0
	},
	'packaging-plant': {
		id: 'packaging-plant',
		name: 'Packaging Plant',
		buildCost: 1450,
		dailyOperatingCost: 28,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'packaging-production',
		warehouseCapacity: 0
	},
	'chemical-plant': {
		id: 'chemical-plant',
		name: 'Chemical Plant',
		buildCost: 1600,
		dailyOperatingCost: 32,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'cleaning-base-production',
		warehouseCapacity: 0
	},
	'snack-factory': {
		id: 'snack-factory',
		name: 'Snack Factory',
		buildCost: 1800,
		dailyOperatingCost: 38,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'snack-production',
		warehouseCapacity: 0
	},
	'drink-bottling-plant': {
		id: 'drink-bottling-plant',
		name: 'Drink Bottling Plant',
		buildCost: 1750,
		dailyOperatingCost: 36,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'drink-bottling',
		warehouseCapacity: 0
	},
	'household-goods-factory': {
		id: 'household-goods-factory',
		name: 'Household Goods Factory',
		buildCost: 1900,
		dailyOperatingCost: 40,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'household-goods-production',
		warehouseCapacity: 0
	},
	'gift-workshop': {
		id: 'gift-workshop',
		name: 'Gift Workshop',
		buildCost: 1500,
		dailyOperatingCost: 30,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'gift-production',
		warehouseCapacity: 0
	},
	warehouse: {
		id: 'warehouse',
		name: 'Warehouse',
		buildCost: 1000,
		dailyOperatingCost: 18,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: null,
		warehouseCapacity: 200
	}
};

export const CONVENIENCE_BUILDING_TYPE_IDS = [
	'grain-farm',
	'salt-mine',
	'oilseed-farm',
	'water-pump',
	'fruit-farm',
	'sugar-farm',
	'pulpwood-grove',
	'chemical-feedstock-well',
	'flour-mill',
	'oil-press',
	'water-filtration-plant',
	'syrup-plant',
	'pulp-mill',
	'plastic-plant',
	'packaging-plant',
	'chemical-plant',
	'snack-factory',
	'drink-bottling-plant',
	'household-goods-factory',
	'gift-workshop',
	'warehouse'
] as const satisfies readonly IndustrialBuildingTypeId[];

export const FINISHED_PRODUCT_MATERIAL_IDS = [
	'snacks',
	'drinks',
	'essentials',
	'gifts'
] as const satisfies readonly MaterialId[];

export type FinishedProductMaterialId = (typeof FINISHED_PRODUCT_MATERIAL_IDS)[number];

export function getIndustrialBuildingTypesForProductChain(
	productId: string
): IndustrialBuildingType[] {
	if (!isMaterialId(productId) || MATERIALS[productId].kind !== 'finished') {
		return [];
	}

	const requiredMaterialIds = new Set<MaterialId>([productId]);
	const recipeIds = new Set<ProductionRecipeId>();
	let changed = true;

	while (changed) {
		changed = false;

		for (const recipe of Object.values(PRODUCTION_RECIPES)) {
			const producesRequiredMaterial = recipe.outputs.some((output) =>
				requiredMaterialIds.has(output.materialId)
			);

			if (!producesRequiredMaterial) {
				continue;
			}

			if (!recipeIds.has(recipe.id)) {
				recipeIds.add(recipe.id);
				changed = true;
			}

			for (const input of recipe.inputs) {
				if (!requiredMaterialIds.has(input.materialId)) {
					requiredMaterialIds.add(input.materialId);
					changed = true;
				}
			}
		}
	}

	return Object.values(INDUSTRIAL_BUILDING_TYPES).filter(
		(buildingType) => buildingType.recipeId !== null && recipeIds.has(buildingType.recipeId)
	);
}

function isMaterialId(value: string): value is MaterialId {
	return Object.hasOwn(MATERIALS, value);
}

export function generateIndustryCity(input: GenerateIndustryCityInput): IndustryCity {
	const rng = createRng(input.seed);
	const width = normalizeDimension(input.width);
	const height = normalizeDimension(input.height);
	const tiles: IndustryTile[] = [];

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
			const anchor = getResourceAnchor(x, y);

			if (!border && anchor) {
				tiles.push({
					id: `${input.id}-${x}-${y}`,
					cityId: input.id,
					x,
					y,
					terrain: anchor.terrain,
					resource: anchor.resource,
					locked: false
				});
				continue;
			}

			const terrain = border ? 'blocked' : getFillerTerrain(width, height, x, y, rng);

			tiles.push({
				id: `${input.id}-${x}-${y}`,
				cityId: input.id,
				x,
				y,
				terrain,
				resource: null,
				locked: terrain === 'blocked'
			});
		}
	}

	return {
		id: input.id,
		name: input.name,
		width,
		height,
		tiles
	};
}

export function getIndustryTileById(city: IndustryCity, tileId: string): IndustryTile | undefined {
	return city.tiles.find((tile) => tile.id === tileId);
}

export function getIndustryTilesByResource(
	city: IndustryCity,
	resource: IndustryResourceId
): IndustryTile[] {
	return city.tiles.filter((tile) => tile.resource === resource);
}

function getResourceAnchor(x: number, y: number): (typeof RESOURCE_ANCHORS)[number] | undefined {
	return RESOURCE_ANCHORS.find((anchor) => anchor.x === x && anchor.y === y);
}

function getFillerTerrain(
	width: number,
	height: number,
	x: number,
	y: number,
	rng: Rng
): IndustryTerrainId {
	if (isIndustrialDistrict(width, height, x, y)) {
		return randomInt(rng, 0, 99) < 85 ? 'industrial' : 'blocked';
	}

	const roll = randomInt(rng, 0, 99);

	if (roll < 30) {
		return 'farmland';
	}

	if (roll < 45) {
		return 'forest';
	}

	if (roll < 55) {
		return 'water';
	}

	if (roll < 65) {
		return 'deposit';
	}

	if (roll < 82) {
		return 'industrial';
	}

	return 'blocked';
}

function isIndustrialDistrict(width: number, height: number, x: number, y: number): boolean {
	return x >= Math.floor(width * 0.55) && y >= Math.floor(height * 0.35);
}

function normalizeDimension(value: number): number {
	if (!Number.isFinite(value)) {
		return 1;
	}

	return Math.max(1, Math.floor(value));
}
