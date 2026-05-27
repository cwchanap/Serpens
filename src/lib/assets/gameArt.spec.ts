import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '$lib/game/archetypes';
import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
import {
	ARCHETYPE_STORE_ART,
	INDUSTRIAL_BUILDING_ART,
	INDUSTRIAL_BUILDING_ART_LIST,
	INDUSTRY_ART_LIST,
	INDUSTRY_MATERIAL_ART,
	INDUSTRY_MATERIAL_ART_LIST,
	INDUSTRY_RESOURCE_ART,
	INDUSTRY_RESOURCE_ART_LIST,
	INDUSTRY_TERRAIN_ART,
	INDUSTRY_TERRAIN_ART_LIST,
	PRODUCT_ART,
	PRODUCT_ART_LIST,
	RECIPE_BUILDING_ART,
	SHOP_STOREFRONT_ALT,
	SHOP_STOREFRONT_PATH,
	SHOP_STOREFRONT_TEXTURE_KEY,
	STORE_ART_LIST,
	TERRAIN_ART,
	TERRAIN_ART_LIST,
	chainNodeArt,
	getIndustrialBuildingArt,
	getIndustryMaterialArt,
	getIndustryResourceArt,
	getIndustryTerrainArt,
	getProductArt,
	getStoreArt,
	getTerrainArt,
	type ChainNodeArt
} from './gameArt';
import type { ProductChainNode } from '$lib/game/productChainGraph';
import type { ArchetypeId, ProductionRecipeId } from '$lib/game/types';

const archetypeIds: ArchetypeId[] = ['convenience', 'boutique', 'electronics', 'grocery'];
const productCategoryIds = [
	...new Set(
		ARCHETYPES.flatMap((archetype) => archetype.startingCategories.map((category) => category.id))
	)
].sort();
const industryTerrainPaths = {
	farmland: '/assets/game/industry/terrain/farmland-tile.png',
	forest: '/assets/game/industry/terrain/forest-tile.png',
	water: '/assets/game/industry/terrain/water-tile.png',
	deposit: '/assets/game/industry/terrain/deposit-tile.png',
	industrial: '/assets/game/industry/terrain/industrial-tile.png',
	blocked: '/assets/game/industry/terrain/blocked-tile.png'
} as const;
const industryResourcePaths = {
	'grain-field': '/assets/game/industry/resources/grain-field.png',
	'salt-deposit': '/assets/game/industry/resources/salt-deposit.png',
	'oilseed-field': '/assets/game/industry/resources/oilseed-field.png',
	'water-source': '/assets/game/industry/resources/water-source.png',
	'fruit-orchard': '/assets/game/industry/resources/fruit-orchard.png',
	'sugar-field': '/assets/game/industry/resources/sugar-field.png',
	'pulpwood-forest': '/assets/game/industry/resources/pulpwood-forest.png',
	'chemical-feedstock': '/assets/game/industry/resources/chemical-feedstock.png'
} as const;
const industryMaterialPaths = {
	grain: '/assets/game/industry/materials/grain.png',
	salt: '/assets/game/industry/materials/salt.png',
	oilseeds: '/assets/game/industry/materials/oilseeds.png',
	water: '/assets/game/industry/materials/water.png',
	fruit: '/assets/game/industry/materials/fruit.png',
	sugar: '/assets/game/industry/materials/sugar.png',
	pulpwood: '/assets/game/industry/materials/pulpwood.png',
	'chemical-feedstock': '/assets/game/industry/materials/chemical-feedstock.png',
	flour: '/assets/game/industry/materials/flour.png',
	'cooking-oil': '/assets/game/industry/materials/cooking-oil.png',
	'filtered-water': '/assets/game/industry/materials/filtered-water.png',
	syrup: '/assets/game/industry/materials/syrup.png',
	'paper-pulp': '/assets/game/industry/materials/paper-pulp.png',
	plastic: '/assets/game/industry/materials/plastic.png',
	packaging: '/assets/game/industry/materials/packaging.png',
	'cleaning-base': '/assets/game/industry/materials/cleaning-base.png',
	snacks: '/assets/game/industry/materials/snacks.png',
	drinks: '/assets/game/industry/materials/drinks.png',
	essentials: '/assets/game/industry/materials/essentials.png',
	gifts: '/assets/game/industry/materials/gifts.png'
} as const;
const industrialBuildingPaths = {
	'grain-farm': '/assets/game/industry/buildings/grain-farm.png',
	'salt-mine': '/assets/game/industry/buildings/salt-mine.png',
	'oilseed-farm': '/assets/game/industry/buildings/oilseed-farm.png',
	'water-pump': '/assets/game/industry/buildings/water-pump.png',
	'fruit-farm': '/assets/game/industry/buildings/fruit-farm.png',
	'sugar-farm': '/assets/game/industry/buildings/sugar-farm.png',
	'pulpwood-grove': '/assets/game/industry/buildings/pulpwood-grove.png',
	'chemical-feedstock-well': '/assets/game/industry/buildings/chemical-feedstock-well.png',
	'flour-mill': '/assets/game/industry/buildings/flour-mill.png',
	'oil-press': '/assets/game/industry/buildings/oil-press.png',
	'water-filtration-plant': '/assets/game/industry/buildings/water-filtration-plant.png',
	'syrup-plant': '/assets/game/industry/buildings/syrup-plant.png',
	'pulp-mill': '/assets/game/industry/buildings/pulp-mill.png',
	'plastic-plant': '/assets/game/industry/buildings/plastic-plant.png',
	'packaging-plant': '/assets/game/industry/buildings/packaging-plant.png',
	'chemical-plant': '/assets/game/industry/buildings/chemical-plant.png',
	'snack-factory': '/assets/game/industry/buildings/snack-factory.png',
	'drink-bottling-plant': '/assets/game/industry/buildings/drink-bottling-plant.png',
	'household-goods-factory': '/assets/game/industry/buildings/household-goods-factory.png',
	'gift-workshop': '/assets/game/industry/buildings/gift-workshop.png',
	warehouse: '/assets/game/industry/buildings/warehouse.png'
} as const;
const require = createRequire(import.meta.url);
const { PNG } = require('pngjs') as {
	PNG: {
		sync: {
			read(buffer: Buffer): { width: number; height: number; data: Uint8Array };
		};
	};
};

function staticPath(assetPath: string): string {
	return join(process.cwd(), 'static', assetPath.replace(/^\//, ''));
}

function imageStats(assetPath: string): {
	width: number;
	height: number;
	opaquePixels: number;
	transparentPixels: number;
} {
	const png = PNG.sync.read(readFileSync(staticPath(assetPath)));
	let opaquePixels = 0;
	let transparentPixels = 0;

	for (let index = 3; index < png.data.length; index += 4) {
		if (png.data[index] === 0) {
			transparentPixels += 1;
		}

		if (png.data[index] === 255) {
			opaquePixels += 1;
		}
	}

	return {
		width: png.width,
		height: png.height,
		opaquePixels,
		transparentPixels
	};
}

function assetHash(assetPath: string): string {
	return createHash('sha256')
		.update(readFileSync(staticPath(assetPath)))
		.digest('hex');
}

function duplicateAssetPaths(assetPaths: readonly string[]): string[] {
	const pathsByHash = new Map<string, string[]>();

	for (const assetPath of assetPaths) {
		const hash = assetHash(assetPath);
		pathsByHash.set(hash, [...(pathsByHash.get(hash) ?? []), assetPath]);
	}

	return [...pathsByHash.values()].filter((paths) => paths.length > 1).flat();
}

describe('game art asset constants', () => {
	it('defines storefront art for every store archetype', () => {
		expect(Object.keys(ARCHETYPE_STORE_ART).sort()).toEqual([...archetypeIds].sort());
		expect(STORE_ART_LIST).toHaveLength(archetypeIds.length);

		for (const archetypeId of archetypeIds) {
			const art = getStoreArt(archetypeId);

			expect(art.archetypeId).toBe(archetypeId);
			expect(art.path).toMatch(/^\/assets\/game\/shops\/.+\.png$/);
			expect(art.textureKey).toBe(`shop-storefront-${archetypeId}`);
			expect(art.alt.toLowerCase()).toContain(
				archetypeId === 'electronics' ? 'electronics' : archetypeId
			);
			expect(existsSync(staticPath(art.path))).toBe(true);
		}
	});

	it('keeps legacy storefront exports compatible with existing integrations', () => {
		const convenienceArt = ARCHETYPE_STORE_ART.convenience;

		expect(SHOP_STOREFRONT_PATH).toBe(convenienceArt.path);
		expect(SHOP_STOREFRONT_TEXTURE_KEY).toBe(convenienceArt.textureKey);
		expect(SHOP_STOREFRONT_ALT).toBe('Anime-style storefront for an owned shop');
	});

	it('uses transparent PNG storefront cutouts', () => {
		for (const art of STORE_ART_LIST) {
			const { opaquePixels, transparentPixels } = imageStats(art.path);

			expect(
				transparentPixels,
				`${art.path} should include transparent background pixels`
			).toBeGreaterThan(0);
			expect(opaquePixels, `${art.path} should preserve visible storefront pixels`).toBeGreaterThan(
				0
			);
		}
	}, 15000);

	it('defines product art for every product category', () => {
		expect(Object.keys(PRODUCT_ART).sort()).toEqual(productCategoryIds);
		expect(PRODUCT_ART_LIST).toHaveLength(productCategoryIds.length);

		for (const categoryId of productCategoryIds) {
			const art = getProductArt(categoryId);

			expect(art.categoryId).toBe(categoryId);
			expect(art.path).toBe(`/assets/game/products/${categoryId}.png`);
			expect(art.alt).toContain('Product icon');
			expect(existsSync(staticPath(art.path))).toBe(true);

			const { width, height, opaquePixels, transparentPixels } = imageStats(art.path);

			expect(width).toBe(96);
			expect(height).toBe(96);
			expect(
				transparentPixels,
				`${art.path} should include transparent background pixels`
			).toBeGreaterThan(0);
			expect(opaquePixels, `${art.path} should preserve visible product pixels`).toBeGreaterThan(0);
		}
	});

	it('defines terrain art for road, river, and tree decoration', () => {
		const terrainPaths = {
			commercial: '/assets/game/terrain/commercial-tile.png',
			green: '/assets/game/terrain/green-tile.png',
			industrial: '/assets/game/terrain/industrial-tile.png',
			road: '/assets/game/terrain/road-tile.png',
			roadIntersection: '/assets/game/terrain/road-intersection-tile.png',
			river: '/assets/game/terrain/river-tile.png',
			residential: '/assets/game/terrain/residential-tile.png',
			transit: '/assets/game/terrain/transit-tile.png',
			tree: '/assets/game/terrain/tree-decoration.png'
		} as const;
		const terrainTextureKeys = {
			commercial: 'terrain-commercial',
			green: 'terrain-green',
			industrial: 'terrain-industrial',
			road: 'terrain-road',
			roadIntersection: 'terrain-road-intersection',
			river: 'terrain-river',
			residential: 'terrain-residential',
			transit: 'terrain-transit',
			tree: 'terrain-tree'
		} as const;
		const terrainIds = Object.keys(terrainPaths) as Array<keyof typeof terrainPaths>;

		expect(Object.keys(TERRAIN_ART).sort()).toEqual([...terrainIds].sort());
		expect(TERRAIN_ART_LIST).toHaveLength(terrainIds.length);

		for (const terrainId of terrainIds) {
			const art = getTerrainArt(terrainId);

			expect(art.id).toBe(terrainId);
			expect(art.path).toBe(terrainPaths[terrainId]);
			expect(art.textureKey).toBe(terrainTextureKeys[terrainId]);

			const { width, height, opaquePixels, transparentPixels } = imageStats(art.path);

			expect(width).toBe(64);
			expect(height).toBe(64);
			expect(opaquePixels, `${art.path} should preserve visible terrain pixels`).toBeGreaterThan(0);

			if (terrainId === 'tree') {
				expect(
					transparentPixels,
					`${art.path} should include transparent background pixels`
				).toBeGreaterThan(0);
			}
		}
	});

	it('defines separate industry terrain art without changing retail terrain keys', () => {
		const terrainIds = Object.keys(industryTerrainPaths) as Array<
			keyof typeof industryTerrainPaths
		>;

		expect(Object.keys(INDUSTRY_TERRAIN_ART).sort()).toEqual([...terrainIds].sort());
		expect(INDUSTRY_TERRAIN_ART_LIST).toEqual(Object.values(industryTerrainPaths));
		expect(Object.keys(TERRAIN_ART).sort()).toEqual([
			'commercial',
			'green',
			'industrial',
			'residential',
			'river',
			'road',
			'roadIntersection',
			'transit',
			'tree'
		]);

		for (const terrainId of terrainIds) {
			const path = getIndustryTerrainArt(terrainId);
			const { width, height, opaquePixels, transparentPixels } = imageStats(path);

			expect(path).toBe(industryTerrainPaths[terrainId]);
			expect(existsSync(staticPath(path))).toBe(true);
			expect(width).toBe(64);
			expect(height).toBe(64);
			expect(opaquePixels, `${path} should preserve visible terrain pixels`).toBeGreaterThan(0);
			expect(transparentPixels, `${path} should be an opaque terrain tile`).toBe(0);
		}
	});

	it('defines transparent industry resource art for every resource type', () => {
		const resourceIds = Object.keys(industryResourcePaths) as Array<
			keyof typeof industryResourcePaths
		>;

		expect(Object.keys(INDUSTRY_RESOURCE_ART).sort()).toEqual([...resourceIds].sort());
		expect(INDUSTRY_RESOURCE_ART_LIST).toEqual(Object.values(industryResourcePaths));

		for (const resourceId of resourceIds) {
			const path = getIndustryResourceArt(resourceId);
			const { width, height, opaquePixels, transparentPixels } = imageStats(path);

			expect(path).toBe(industryResourcePaths[resourceId]);
			expect(existsSync(staticPath(path))).toBe(true);
			expect(width).toBe(96);
			expect(height).toBe(96);
			expect(
				transparentPixels,
				`${path} should include transparent background pixels`
			).toBeGreaterThan(0);
			expect(opaquePixels, `${path} should preserve visible resource pixels`).toBeGreaterThan(0);
		}
	});

	it('defines transparent industry material art for every material type', () => {
		const materialIds = Object.keys(industryMaterialPaths) as Array<
			keyof typeof industryMaterialPaths
		>;

		expect(Object.keys(INDUSTRY_MATERIAL_ART).sort()).toEqual([...materialIds].sort());
		expect(INDUSTRY_MATERIAL_ART_LIST).toEqual(Object.values(industryMaterialPaths));

		for (const materialId of materialIds) {
			const path = getIndustryMaterialArt(materialId);
			const { width, height, opaquePixels, transparentPixels } = imageStats(path);

			expect(path).toBe(industryMaterialPaths[materialId]);
			expect(existsSync(staticPath(path))).toBe(true);
			expect(width).toBe(96);
			expect(height).toBe(96);
			expect(
				transparentPixels,
				`${path} should include transparent background pixels`
			).toBeGreaterThan(0);
			expect(opaquePixels, `${path} should preserve visible material pixels`).toBeGreaterThan(0);
		}
	});

	it('defines transparent industry building art for every building type', () => {
		const buildingTypeIds = Object.keys(industrialBuildingPaths) as Array<
			keyof typeof industrialBuildingPaths
		>;

		expect(Object.keys(INDUSTRIAL_BUILDING_ART).sort()).toEqual([...buildingTypeIds].sort());
		expect(INDUSTRIAL_BUILDING_ART_LIST).toEqual(Object.values(industrialBuildingPaths));

		for (const buildingTypeId of buildingTypeIds) {
			const path = getIndustrialBuildingArt(buildingTypeId);
			const { width, height, opaquePixels, transparentPixels } = imageStats(path);

			expect(path).toBe(industrialBuildingPaths[buildingTypeId]);
			expect(existsSync(staticPath(path))).toBe(true);
			expect(width).toBe(96);
			expect(height).toBe(96);
			expect(
				transparentPixels,
				`${path} should include transparent background pixels`
			).toBeGreaterThan(0);
			expect(opaquePixels, `${path} should preserve visible building pixels`).toBeGreaterThan(0);
		}
	});

	it('exports a combined industry art path list', () => {
		const expectedPaths = [
			...Object.values(industryTerrainPaths),
			...Object.values(industryResourcePaths),
			...Object.values(industryMaterialPaths),
			...Object.values(industrialBuildingPaths)
		];

		expect(INDUSTRY_ART_LIST).toEqual(expectedPaths);
		expect(new Set(INDUSTRY_ART_LIST).size).toBe(expectedPaths.length);
	});

	it('keeps generated industry catalog sprites byte-distinct within each catalog', () => {
		expect(duplicateAssetPaths(INDUSTRY_RESOURCE_ART_LIST)).toEqual([]);
		expect(duplicateAssetPaths(INDUSTRY_MATERIAL_ART_LIST)).toEqual([]);
		expect(duplicateAssetPaths(INDUSTRIAL_BUILDING_ART_LIST)).toEqual([]);
	});
});

describe('RECIPE_BUILDING_ART', () => {
	it('maps every recipe with a registered building to that building art', () => {
		expect.assertions(1);
		const expected: Record<string, string> = {};
		for (const building of Object.values(INDUSTRIAL_BUILDING_TYPES)) {
			if (!building.recipeId) continue;
			const art = INDUSTRIAL_BUILDING_ART[building.id];
			if (!art) continue;
			expected[building.recipeId] = art;
		}
		expect(RECIPE_BUILDING_ART).toEqual(expected);
	});

	it('covers every recipe that has a building bound to it', () => {
		expect.assertions(1);
		const recipeIdsWithBuildings = new Set(
			Object.values(INDUSTRIAL_BUILDING_TYPES)
				.map((building) => building.recipeId)
				.filter((id): id is ProductionRecipeId => Boolean(id))
		);
		const recipeIdsInMap = new Set(Object.keys(RECIPE_BUILDING_ART));
		const missing = [...recipeIdsWithBuildings].filter((id) => !recipeIdsInMap.has(id));
		expect(missing).toEqual([]);
	});
});

function nodeStub(overrides: Partial<ProductChainNode>): ProductChainNode {
	return {
		id: 'stub',
		kind: 'material',
		label: 'Stub',
		materialId: null,
		recipeId: null,
		stage: null,
		layer: 0,
		row: 0,
		health: 'healthy',
		healthLabel: 'Healthy',
		warehouseStock: 0,
		capacity: { buildingCount: 0, outputPerDay: 0, inputPerDay: 0 },
		actual: {
			produced: 0,
			consumed: 0,
			importedInput: 0,
			warehousePulled: 0,
			shopImported: 0,
			unitsSold: 0,
			demandMissed: 0
		},
		bottleneck: '',
		...overrides
	};
}

describe('chainNodeArt', () => {
	it('returns material art for a material node', () => {
		expect.assertions(1);
		const art: ChainNodeArt = chainNodeArt(nodeStub({ kind: 'material', materialId: 'flour' }));
		expect(art).toEqual({
			src: '/assets/game/industry/materials/flour.png',
			alt: 'Stub',
			fallbackGlyph: 'material'
		});
	});

	it('returns recipe building art for a recipe node', () => {
		expect.assertions(1);
		const art = chainNodeArt(
			nodeStub({ kind: 'recipe', recipeId: 'flour-milling', label: 'Flour mill' })
		);
		expect(art.src).toBe('/assets/game/industry/buildings/flour-mill.png');
	});

	it('returns warehouse art for a warehouse node', () => {
		expect.assertions(1);
		const art = chainNodeArt(nodeStub({ kind: 'warehouse', label: 'Warehouse' }));
		expect(art).toEqual({
			src: '/assets/game/industry/buildings/warehouse.png',
			alt: 'Warehouse',
			fallbackGlyph: 'warehouse'
		});
	});

	it('returns a null src with kind-keyed fallback when nothing matches', () => {
		expect.assertions(1);
		const art = chainNodeArt(nodeStub({ kind: 'material', materialId: null }));
		expect(art).toEqual({
			src: null,
			alt: 'Stub',
			fallbackGlyph: 'material'
		});
	});
});
