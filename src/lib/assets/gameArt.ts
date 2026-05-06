import type { ArchetypeId } from '$lib/game/types';

export interface StoreArt {
	archetypeId: ArchetypeId;
	path: string;
	textureKey: string;
	alt: string;
}

export type TerrainArtId = 'road' | 'roadIntersection' | 'river' | 'tree';

export interface TerrainArt {
	id: TerrainArtId;
	path: string;
	textureKey: string;
	alt: string;
}

export const ARCHETYPE_STORE_ART: Readonly<Record<ArchetypeId, StoreArt>> = Object.freeze({
	convenience: Object.freeze({
		archetypeId: 'convenience',
		path: '/assets/game/shops/anime-storefront.png',
		textureKey: 'shop-storefront-convenience',
		alt: 'Anime-style convenience storefront for an owned shop'
	}),
	boutique: Object.freeze({
		archetypeId: 'boutique',
		path: '/assets/game/shops/boutique-storefront.png',
		textureKey: 'shop-storefront-boutique',
		alt: 'Anime-style boutique storefront for an owned shop'
	}),
	electronics: Object.freeze({
		archetypeId: 'electronics',
		path: '/assets/game/shops/electronics-storefront.png',
		textureKey: 'shop-storefront-electronics',
		alt: 'Anime-style electronics and games storefront for an owned shop'
	}),
	grocery: Object.freeze({
		archetypeId: 'grocery',
		path: '/assets/game/shops/grocery-storefront.png',
		textureKey: 'shop-storefront-grocery',
		alt: 'Anime-style grocery market storefront for an owned shop'
	})
});

export const STORE_ART_LIST: readonly StoreArt[] = Object.freeze(
	Object.values(ARCHETYPE_STORE_ART)
);

export const SHOP_STOREFRONT_PATH = ARCHETYPE_STORE_ART.convenience.path;
export const SHOP_STOREFRONT_TEXTURE_KEY = ARCHETYPE_STORE_ART.convenience.textureKey;
export const SHOP_STOREFRONT_ALT = 'Anime-style storefront for an owned shop';

export const TERRAIN_ART: Readonly<Record<TerrainArtId, TerrainArt>> = Object.freeze({
	road: Object.freeze({
		id: 'road',
		path: '/assets/game/terrain/road-tile.png',
		textureKey: 'terrain-road',
		alt: 'Stylized city road terrain tile'
	}),
	roadIntersection: Object.freeze({
		id: 'roadIntersection',
		path: '/assets/game/terrain/road-intersection-tile.png',
		textureKey: 'terrain-road-intersection',
		alt: 'Stylized city road intersection terrain tile'
	}),
	river: Object.freeze({
		id: 'river',
		path: '/assets/game/terrain/river-tile.png',
		textureKey: 'terrain-river',
		alt: 'Stylized river terrain tile'
	}),
	tree: Object.freeze({
		id: 'tree',
		path: '/assets/game/terrain/tree-decoration.png',
		textureKey: 'terrain-tree',
		alt: 'Stylized tree decoration for green city tiles'
	})
});

export const TERRAIN_ART_LIST: readonly TerrainArt[] = Object.freeze(Object.values(TERRAIN_ART));

export function getStoreArt(archetypeId: ArchetypeId): StoreArt {
	return ARCHETYPE_STORE_ART[archetypeId];
}

export function getTerrainArt(id: TerrainArtId): TerrainArt {
	return TERRAIN_ART[id];
}
