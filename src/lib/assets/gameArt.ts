import type { ArchetypeId, TerrainId } from '$lib/game/types';

export interface StoreArt {
	archetypeId: ArchetypeId;
	path: string;
	textureKey: string;
	alt: string;
}

export type TerrainArtId = TerrainId | 'road' | 'roadIntersection' | 'river' | 'tree';

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

export type ProductArtCategoryId =
	| 'snacks'
	| 'drinks'
	| 'essentials'
	| 'apparel'
	| 'home-goods'
	| 'gifts'
	| 'games'
	| 'accessories'
	| 'devices'
	| 'produce'
	| 'pantry'
	| 'prepared';

export interface ProductArt {
	categoryId: ProductArtCategoryId;
	path: string;
	alt: string;
}

export const PRODUCT_ART: Readonly<Record<ProductArtCategoryId, ProductArt>> = Object.freeze({
	snacks: Object.freeze({
		categoryId: 'snacks',
		path: '/assets/game/products/snacks.png',
		alt: 'Product icon for snacks'
	}),
	drinks: Object.freeze({
		categoryId: 'drinks',
		path: '/assets/game/products/drinks.png',
		alt: 'Product icon for drinks'
	}),
	essentials: Object.freeze({
		categoryId: 'essentials',
		path: '/assets/game/products/essentials.png',
		alt: 'Product icon for essentials'
	}),
	apparel: Object.freeze({
		categoryId: 'apparel',
		path: '/assets/game/products/apparel.png',
		alt: 'Product icon for apparel'
	}),
	'home-goods': Object.freeze({
		categoryId: 'home-goods',
		path: '/assets/game/products/home-goods.png',
		alt: 'Product icon for home goods'
	}),
	gifts: Object.freeze({
		categoryId: 'gifts',
		path: '/assets/game/products/gifts.png',
		alt: 'Product icon for gifts'
	}),
	games: Object.freeze({
		categoryId: 'games',
		path: '/assets/game/products/games.png',
		alt: 'Product icon for games'
	}),
	accessories: Object.freeze({
		categoryId: 'accessories',
		path: '/assets/game/products/accessories.png',
		alt: 'Product icon for accessories'
	}),
	devices: Object.freeze({
		categoryId: 'devices',
		path: '/assets/game/products/devices.png',
		alt: 'Product icon for devices'
	}),
	produce: Object.freeze({
		categoryId: 'produce',
		path: '/assets/game/products/produce.png',
		alt: 'Product icon for produce'
	}),
	pantry: Object.freeze({
		categoryId: 'pantry',
		path: '/assets/game/products/pantry.png',
		alt: 'Product icon for pantry'
	}),
	prepared: Object.freeze({
		categoryId: 'prepared',
		path: '/assets/game/products/prepared.png',
		alt: 'Product icon for prepared food'
	})
});

export const PRODUCT_ART_LIST: readonly ProductArt[] = Object.freeze(Object.values(PRODUCT_ART));

export const TERRAIN_ART: Readonly<Record<TerrainArtId, TerrainArt>> = Object.freeze({
	commercial: Object.freeze({
		id: 'commercial',
		path: '/assets/game/terrain/commercial-tile.png',
		textureKey: 'terrain-commercial',
		alt: 'Stylized commercial city terrain tile'
	}),
	residential: Object.freeze({
		id: 'residential',
		path: '/assets/game/terrain/residential-tile.png',
		textureKey: 'terrain-residential',
		alt: 'Stylized residential city terrain tile'
	}),
	green: Object.freeze({
		id: 'green',
		path: '/assets/game/terrain/green-tile.png',
		textureKey: 'terrain-green',
		alt: 'Stylized grass terrain tile'
	}),
	transit: Object.freeze({
		id: 'transit',
		path: '/assets/game/terrain/transit-tile.png',
		textureKey: 'terrain-transit',
		alt: 'Stylized transit city terrain tile'
	}),
	industrial: Object.freeze({
		id: 'industrial',
		path: '/assets/game/terrain/industrial-tile.png',
		textureKey: 'terrain-industrial',
		alt: 'Stylized industrial city terrain tile'
	}),
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

export function getProductArt(categoryId: string): ProductArt {
	const productArt = PRODUCT_ART[categoryId as ProductArtCategoryId];

	if (!productArt) {
		throw new Error(`Unknown product art category: ${categoryId}`);
	}

	return productArt;
}

export function getTerrainArt(id: TerrainArtId): TerrainArt {
	return TERRAIN_ART[id];
}
