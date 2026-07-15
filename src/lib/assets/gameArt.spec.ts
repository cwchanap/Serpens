import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ARCHETYPES } from '$lib/game/archetypes';
import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
import * as gameArt from './gameArt';
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
	RAIL_ART,
	RAIL_ART_LIST,
	DOWNTOWN_TERRAIN_ART,
	DOWNTOWN_TERRAIN_ART_VARIANTS,
	CAMPUS_TERRAIN_ART,
	CAMPUS_TERRAIN_ART_VARIANTS,
	GREEN_TERRAIN_ART_VARIANTS,
	MALL_TERRAIN_ART,
	MALL_TERRAIN_ART_VARIANTS,
	NEIGHBORHOOD_TERRAIN_ART,
	SHOP_STOREFRONT_ALT,
	SHOP_STOREFRONT_PATH,
	SHOP_STOREFRONT_TEXTURE_KEY,
	STORE_ART_LIST,
	TERRAIN_ART,
	TERRAIN_ART_LIST,
	RESIDENTIAL_TERRAIN_ART_VARIANTS,
	ROAD_TERRAIN_CONNECTOR_ART,
	RIVER_TERRAIN_CONNECTOR_ART,
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
import type {
	ArchetypeId,
	BuildingTier,
	IndustrialBuildingTypeId,
	MaterialId,
	ProductionRecipeId
} from '$lib/game/types';

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
	gifts: '/assets/game/industry/materials/gifts.png',
	'bottled-water': '/assets/game/industry/materials/bottled-water.png',
	produce: '/assets/game/industry/materials/produce.png',
	pantry: '/assets/game/industry/materials/pantry.png'
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
	'water-bottler': '/assets/game/industry/buildings/water-bottler.png',
	'produce-packhouse': '/assets/game/industry/buildings/produce-packhouse.png',
	'pantry-works': '/assets/game/industry/buildings/pantry-works.png',
	warehouse: '/assets/game/industry/buildings/warehouse.png'
} as const;
const worldMapPaths = {
	background: '/assets/game/world/regional-map.png',
	retailMarker: '/assets/game/world/city-retail.png',
	industryMarker: '/assets/game/world/city-industry.png',
	lockedMarker: '/assets/game/world/city-locked.png'
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

function roadBandStats(assetPath: string): {
	maxHorizontalRoadPixels: number;
	maxVerticalRoadPixels: number;
} {
	const png = PNG.sync.read(readFileSync(staticPath(assetPath)));
	let maxHorizontalRoadPixels = 0;
	let maxVerticalRoadPixels = 0;

	for (let y = 0; y < png.height; y += 1) {
		let roadPixels = 0;

		for (let x = 0; x < png.width; x += 1) {
			const index = (png.width * y + x) << 2;

			if (isRoadAsphaltPixel(png.data[index]!, png.data[index + 1]!, png.data[index + 2]!)) {
				roadPixels += 1;
			}
		}

		maxHorizontalRoadPixels = Math.max(maxHorizontalRoadPixels, roadPixels);
	}

	for (let x = 0; x < png.width; x += 1) {
		let roadPixels = 0;

		for (let y = 0; y < png.height; y += 1) {
			const index = (png.width * y + x) << 2;

			if (isRoadAsphaltPixel(png.data[index]!, png.data[index + 1]!, png.data[index + 2]!)) {
				roadPixels += 1;
			}
		}

		maxVerticalRoadPixels = Math.max(maxVerticalRoadPixels, roadPixels);
	}

	return { maxHorizontalRoadPixels, maxVerticalRoadPixels };
}

function isRoadAsphaltPixel(red: number, green: number, blue: number): boolean {
	const channelSpread = Math.max(red, green, blue) - Math.min(red, green, blue);

	return (
		channelSpread <= 18 &&
		red >= 38 &&
		red <= 108 &&
		green >= 38 &&
		green <= 108 &&
		blue >= 38 &&
		blue <= 108
	);
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
	afterEach(() => {
		vi.resetModules();
	});

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
			river: 'terrain-river',
			residential: 'terrain-residential',
			transit: 'terrain-transit',
			tree: 'terrain-tree'
		} as const;
		const terrainIds = Object.keys(terrainPaths) as Array<keyof typeof terrainPaths>;

		expect(Object.keys(TERRAIN_ART).sort()).toEqual([...terrainIds].sort());
		expect(TERRAIN_ART_LIST).toHaveLength(
			terrainIds.length +
				RESIDENTIAL_TERRAIN_ART_VARIANTS.length -
				1 +
				GREEN_TERRAIN_ART_VARIANTS.length -
				1 +
				DOWNTOWN_TERRAIN_ART_VARIANTS.length +
				CAMPUS_TERRAIN_ART_VARIANTS.length +
				MALL_TERRAIN_ART_VARIANTS.length +
				Object.keys(ROAD_TERRAIN_CONNECTOR_ART).length +
				Object.keys(RIVER_TERRAIN_CONNECTOR_ART).length
		);

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

	it('defines styled road and river connector art without using the legacy road intersection tile', () => {
		expect.assertions(114);
		const connectorVariants = [
			'corner-ne',
			'corner-es',
			'corner-sw',
			'corner-wn',
			'tee-nes',
			'tee-esw',
			'tee-nsw',
			'tee-new',
			'intersection'
		] as const;

		expect(Object.keys(ROAD_TERRAIN_CONNECTOR_ART).sort()).toEqual([...connectorVariants].sort());
		expect(Object.keys(RIVER_TERRAIN_CONNECTOR_ART).sort()).toEqual([...connectorVariants].sort());
		expect(
			TERRAIN_ART_LIST.some((art) => art.path === '/assets/game/terrain/road-intersection-tile.png')
		).toBe(false);
		expect(Object.keys(TERRAIN_ART)).not.toContain('roadIntersection');
		expect(
			duplicateAssetPaths(Object.values(ROAD_TERRAIN_CONNECTOR_ART).map((art) => art.path))
		).toEqual([]);
		expect(
			duplicateAssetPaths(Object.values(RIVER_TERRAIN_CONNECTOR_ART).map((art) => art.path))
		).toEqual([]);

		for (const variant of connectorVariants) {
			const roadArt = ROAD_TERRAIN_CONNECTOR_ART[variant];
			const riverArt = RIVER_TERRAIN_CONNECTOR_ART[variant];

			expect(roadArt.path).toBe(`/assets/game/terrain/road-connector-${variant}.png`);
			expect(roadArt.textureKey).toBe(`terrain-road-connector-${variant}`);
			expect(riverArt.path).toBe(`/assets/game/terrain/river-connector-${variant}.png`);
			expect(riverArt.textureKey).toBe(`terrain-river-connector-${variant}`);

			for (const art of [roadArt, riverArt]) {
				const { width, height, opaquePixels } = imageStats(art.path);

				expect(existsSync(staticPath(art.path))).toBe(true);
				expect(width).toBe(64);
				expect(height).toBe(64);
				expect(
					opaquePixels,
					`${art.path} should preserve visible connector pixels`
				).toBeGreaterThan(0);
			}
		}
	});

	it('defines multiple residential terrain variants with distinct assets', () => {
		expect.assertions(51);
		const residentialPaths = [
			'/assets/game/terrain/residential-tile.png',
			'/assets/game/terrain/residential-tile-2.png',
			'/assets/game/terrain/residential-tile-3.png',
			'/assets/game/terrain/residential-tile-4.png',
			'/assets/game/terrain/residential-tile-5.png',
			'/assets/game/terrain/residential-tile-6.png'
		];

		expect(RESIDENTIAL_TERRAIN_ART_VARIANTS).toHaveLength(6);
		expect(RESIDENTIAL_TERRAIN_ART_VARIANTS.map((art) => art.path)).toEqual(residentialPaths);
		expect(duplicateAssetPaths(residentialPaths)).toEqual([]);

		for (const [index, art] of RESIDENTIAL_TERRAIN_ART_VARIANTS.entries()) {
			expect(art.id).toBe('residential');
			expect(art.textureKey).toBe(`terrain-residential${index === 0 ? '' : `-${index + 1}`}`);
			expect(existsSync(staticPath(art.path))).toBe(true);

			const { width, height, opaquePixels } = imageStats(art.path);

			expect(width).toBe(64);
			expect(height).toBe(64);
			expect(opaquePixels, `${art.path} should preserve visible terrain pixels`).toBeGreaterThan(0);

			const { maxHorizontalRoadPixels, maxVerticalRoadPixels } = roadBandStats(art.path);

			expect(
				maxHorizontalRoadPixels,
				`${art.path} should not embed a horizontal road band`
			).toBeLessThan(44);
			expect(
				maxVerticalRoadPixels,
				`${art.path} should not embed a vertical road band`
			).toBeLessThan(44);
		}
	});

	it('defines varied terrain art for high-repeat retail neighborhoods and green areas', () => {
		const neighborhoodVariantGroups = {
			downtown: {
				base: DOWNTOWN_TERRAIN_ART,
				variants: DOWNTOWN_TERRAIN_ART_VARIANTS,
				paths: [
					'/assets/game/terrain/downtown-tile.png',
					'/assets/game/terrain/downtown-tile-2.png',
					'/assets/game/terrain/downtown-tile-3.png'
				],
				texturePrefix: 'terrain-downtown'
			},
			campus: {
				base: CAMPUS_TERRAIN_ART,
				variants: CAMPUS_TERRAIN_ART_VARIANTS,
				paths: [
					'/assets/game/terrain/campus-tile.png',
					'/assets/game/terrain/campus-tile-2.png',
					'/assets/game/terrain/campus-tile-3.png'
				],
				texturePrefix: 'terrain-campus'
			},
			mall: {
				base: MALL_TERRAIN_ART,
				variants: MALL_TERRAIN_ART_VARIANTS,
				paths: [
					'/assets/game/terrain/mall-tile.png',
					'/assets/game/terrain/mall-tile-2.png',
					'/assets/game/terrain/mall-tile-3.png'
				],
				texturePrefix: 'terrain-mall'
			}
		} as const;
		const greenPaths = [
			'/assets/game/terrain/green-tile.png',
			'/assets/game/terrain/green-tile-2.png',
			'/assets/game/terrain/green-tile-3.png'
		];

		expect(NEIGHBORHOOD_TERRAIN_ART).toEqual({
			downtown: DOWNTOWN_TERRAIN_ART_VARIANTS,
			campus: CAMPUS_TERRAIN_ART_VARIANTS,
			mall: MALL_TERRAIN_ART_VARIANTS
		});
		expect(GREEN_TERRAIN_ART_VARIANTS.map((art) => art.path)).toEqual(greenPaths);

		for (const { base, variants, paths, texturePrefix } of Object.values(
			neighborhoodVariantGroups
		)) {
			expect(base).toBe(variants[0]);
			expect(variants.map((art) => art.path)).toEqual(paths);
			expect(duplicateAssetPaths(paths)).toEqual([]);

			for (const [index, art] of variants.entries()) {
				expect(art.id).toBe('commercial');
				expect(art.textureKey).toBe(`${texturePrefix}${index === 0 ? '' : `-${index + 1}`}`);
				expect(existsSync(staticPath(art.path))).toBe(true);

				const { width, height, opaquePixels } = imageStats(art.path);

				expect(width).toBe(64);
				expect(height).toBe(64);
				expect(opaquePixels, `${art.path} should preserve visible terrain pixels`).toBeGreaterThan(
					0
				);
			}
		}

		expect(duplicateAssetPaths(greenPaths)).toEqual([]);
		for (const [index, art] of GREEN_TERRAIN_ART_VARIANTS.entries()) {
			expect(art.id).toBe('green');
			expect(art.textureKey).toBe(`terrain-green${index === 0 ? '' : `-${index + 1}`}`);
			expect(existsSync(staticPath(art.path))).toBe(true);

			const { width, height, opaquePixels } = imageStats(art.path);

			expect(width).toBe(64);
			expect(height).toBe(64);
			expect(opaquePixels, `${art.path} should preserve visible terrain pixels`).toBeGreaterThan(0);
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

	it('defines transparent 64x64 rail track art for every variant', () => {
		const railPaths = {
			straight: '/assets/game/rail/rail-straight.png',
			corner: '/assets/game/rail/rail-corner.png',
			tee: '/assets/game/rail/rail-tee.png',
			cross: '/assets/game/rail/rail-cross.png'
		} as const;

		expect(RAIL_ART).toEqual(railPaths);
		expect(RAIL_ART_LIST).toEqual(Object.values(railPaths));
		expect(duplicateAssetPaths(RAIL_ART_LIST)).toEqual([]);

		for (const path of RAIL_ART_LIST) {
			expect(existsSync(staticPath(path))).toBe(true);

			const { width, height, opaquePixels, transparentPixels } = imageStats(path);

			expect(width).toBe(64);
			expect(height).toBe(64);
			expect(opaquePixels, `${path} should preserve visible rail pixels`).toBeGreaterThan(0);
			expect(
				transparentPixels,
				`${path} should have a transparent background to overlay terrain`
			).toBeGreaterThan(0);
		}
	});

	it('keeps generated industry catalog sprites byte-distinct within each catalog', () => {
		expect(duplicateAssetPaths(INDUSTRY_RESOURCE_ART_LIST)).toEqual([]);
		expect(duplicateAssetPaths(INDUSTRY_MATERIAL_ART_LIST)).toEqual([]);
		expect(duplicateAssetPaths(INDUSTRIAL_BUILDING_ART_LIST)).toEqual([]);
	});

	it('defines real bitmap art for the world map background and city markers', () => {
		type WorldMapArtCatalog = {
			WORLD_MAP_ART?: {
				background: { path: string; alt: string };
				markers: {
					retail: { path: string; alt: string };
					industry: { path: string; alt: string };
					locked: { path: string; alt: string };
				};
			};
			WORLD_MAP_ART_LIST?: readonly string[];
		};
		const artCatalog = gameArt as WorldMapArtCatalog;

		expect(artCatalog.WORLD_MAP_ART?.background.path).toBe(worldMapPaths.background);
		expect(artCatalog.WORLD_MAP_ART?.markers.retail.path).toBe(worldMapPaths.retailMarker);
		expect(artCatalog.WORLD_MAP_ART?.markers.industry.path).toBe(worldMapPaths.industryMarker);
		expect(artCatalog.WORLD_MAP_ART?.markers.locked.path).toBe(worldMapPaths.lockedMarker);
		expect(artCatalog.WORLD_MAP_ART_LIST).toEqual(Object.values(worldMapPaths));

		const backgroundStats = imageStats(worldMapPaths.background);
		expect(backgroundStats.width).toBe(1024);
		expect(backgroundStats.height).toBe(1024);
		expect(backgroundStats.opaquePixels).toBeGreaterThan(900_000);

		for (const markerPath of Object.values(worldMapPaths).slice(1)) {
			const { width, height, opaquePixels, transparentPixels } = imageStats(markerPath);

			expect(existsSync(staticPath(markerPath))).toBe(true);
			expect(width).toBe(96);
			expect(height).toBe(96);
			expect(transparentPixels, `${markerPath} should include transparent pixels`).toBeGreaterThan(
				0
			);
			expect(opaquePixels, `${markerPath} should preserve visible marker pixels`).toBeGreaterThan(
				0
			);
		}
	});

	it('handles undefined neighborhood terrain art entries in TERRAIN_ART_LIST', async () => {
		vi.resetModules();
		const originalValues = Object.values;
		vi.spyOn(Object, 'values').mockImplementation((obj: object) => {
			const result = originalValues.call(Object, obj) as unknown[];
			if (
				obj &&
				typeof obj === 'object' &&
				'downtown' in obj &&
				'campus' in obj &&
				'mall' in obj &&
				Object.keys(obj).length === 3
			) {
				return [...result, undefined] as never;
			}
			return result as never;
		});

		const gameArtModule = await import('./gameArt');

		expect(gameArtModule.TERRAIN_ART_LIST.every((art) => art !== undefined && art !== null)).toBe(
			true
		);

		vi.resetModules();
	});
});

describe('RECIPE_BUILDING_ART', () => {
	afterEach(() => {
		vi.doUnmock('$lib/game/industry');
		vi.resetModules();
	});

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

	it('returns undefined for recipe IDs without a registered building', () => {
		expect.assertions(1);
		expect(RECIPE_BUILDING_ART['nonexistent-recipe' as ProductionRecipeId]).toBeUndefined();
	});

	it('skips buildings without registered art when building RECIPE_BUILDING_ART', async () => {
		vi.resetModules();
		vi.doMock('$lib/game/industry', async () => {
			const actual =
				await vi.importActual<typeof import('$lib/game/industry')>('$lib/game/industry');
			return {
				...actual,
				INDUSTRIAL_BUILDING_TYPES: {
					...actual.INDUSTRIAL_BUILDING_TYPES,
					'fake-no-art-building': {
						id: 'fake-no-art-building' as IndustrialBuildingTypeId,
						name: 'Fake No Art Building',
						buildCost: 100,
						dailyOperatingCost: 1,
						requiredResource: null,
						requiresIndustrialTile: false,
						recipeId: 'fake-recipe' as ProductionRecipeId,
						warehouseCapacity: 0,
						tier: 1 as BuildingTier
					}
				}
			};
		});
		const gameArtModule = await import('./gameArt');

		expect(gameArtModule.RECIPE_BUILDING_ART['fake-recipe' as ProductionRecipeId]).toBeUndefined();
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
			railPulled: 0,
			shopImported: 0,
			unitsSold: 0,
			demandMissed: 0
		},
		bottleneck: { code: 'healthStatus', health: 'healthy', label: 'Stub' },
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
		const art = chainNodeArt(nodeStub({ kind: 'recipe', recipeId: null }));
		expect(art).toEqual({
			src: null,
			alt: 'Stub',
			fallbackGlyph: 'recipe'
		});
	});

	it('returns a null src for a material node whose materialId is not in INDUSTRY_MATERIAL_ART', () => {
		expect.assertions(1);
		const art = chainNodeArt(
			nodeStub({
				kind: 'material',
				materialId: 'nonexistent-material' as MaterialId,
				label: 'Unknown'
			})
		);
		expect(art).toEqual({
			src: null,
			alt: 'Unknown',
			fallbackGlyph: 'material'
		});
	});

	it('returns a null src for a recipe node whose recipeId is not in RECIPE_BUILDING_ART', () => {
		expect.assertions(1);
		const art = chainNodeArt(
			nodeStub({
				kind: 'recipe',
				recipeId: 'nonexistent-recipe' as ProductionRecipeId,
				label: 'Unknown'
			})
		);
		expect(art).toEqual({
			src: null,
			alt: 'Unknown',
			fallbackGlyph: 'recipe'
		});
	});

	it('throws an error for unknown product art category', () => {
		expect.assertions(1);
		expect(() => gameArt.getProductArt('nonexistent-category' as never)).toThrow(
			'Unknown product art category: nonexistent-category'
		);
	});
});
