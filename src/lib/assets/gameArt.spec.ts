import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from '$lib/game/archetypes';
import {
	ARCHETYPE_STORE_ART,
	PRODUCT_ART,
	PRODUCT_ART_LIST,
	SHOP_STOREFRONT_ALT,
	SHOP_STOREFRONT_PATH,
	SHOP_STOREFRONT_TEXTURE_KEY,
	STORE_ART_LIST,
	TERRAIN_ART,
	TERRAIN_ART_LIST,
	getProductArt,
	getStoreArt,
	getTerrainArt
} from './gameArt';
import type { ArchetypeId } from '$lib/game/types';

const archetypeIds: ArchetypeId[] = ['convenience', 'boutique', 'electronics', 'grocery'];
const productCategoryIds = [
	...new Set(
		ARCHETYPES.flatMap((archetype) => archetype.startingCategories.map((category) => category.id))
	)
].sort();
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
	});

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
});
