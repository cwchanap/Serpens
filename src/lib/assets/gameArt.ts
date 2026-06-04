import { INDUSTRIAL_BUILDING_TYPES } from '$lib/game/industry';
import type { ProductChainNode } from '$lib/game/productChainGraph';
import type {
	ArchetypeId,
	IndustrialBuildingTypeId,
	IndustryResourceId,
	IndustryTerrainId,
	MaterialId,
	ProductionRecipeId,
	TerrainId
} from '$lib/game/types';

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
	| 'prepared'
	| 'household'
	| 'peripherals'
	| 'bakery';

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
	}),
	bakery: Object.freeze({
		categoryId: 'bakery',
		path: '/assets/game/products/bakery.png',
		alt: 'Product icon for bakery'
	}),
	household: Object.freeze({
		categoryId: 'household',
		path: '/assets/game/products/household.png',
		alt: 'Product icon for household'
	}),
	peripherals: Object.freeze({
		categoryId: 'peripherals',
		path: '/assets/game/products/peripherals.png',
		alt: 'Product icon for peripherals'
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

export const INDUSTRY_TERRAIN_ART: Readonly<Record<IndustryTerrainId, string>> = Object.freeze({
	farmland: '/assets/game/industry/terrain/farmland-tile.png',
	forest: '/assets/game/industry/terrain/forest-tile.png',
	water: '/assets/game/industry/terrain/water-tile.png',
	deposit: '/assets/game/industry/terrain/deposit-tile.png',
	industrial: '/assets/game/industry/terrain/industrial-tile.png',
	blocked: '/assets/game/industry/terrain/blocked-tile.png'
});

export const INDUSTRY_RESOURCE_ART: Readonly<Record<IndustryResourceId, string>> = Object.freeze({
	'grain-field': '/assets/game/industry/resources/grain-field.png',
	'salt-deposit': '/assets/game/industry/resources/salt-deposit.png',
	'oilseed-field': '/assets/game/industry/resources/oilseed-field.png',
	'water-source': '/assets/game/industry/resources/water-source.png',
	'fruit-orchard': '/assets/game/industry/resources/fruit-orchard.png',
	'sugar-field': '/assets/game/industry/resources/sugar-field.png',
	'pulpwood-forest': '/assets/game/industry/resources/pulpwood-forest.png',
	'chemical-feedstock': '/assets/game/industry/resources/chemical-feedstock.png'
});

export const INDUSTRY_MATERIAL_ART: Readonly<Record<MaterialId, string>> = Object.freeze({
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
});

export const INDUSTRIAL_BUILDING_ART: Readonly<Record<IndustrialBuildingTypeId, string>> =
	Object.freeze({
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
	});

export const RECIPE_BUILDING_ART: Readonly<Partial<Record<ProductionRecipeId, string>>> =
	Object.freeze(
		(() => {
			const map: Partial<Record<ProductionRecipeId, string>> = {};
			for (const building of Object.values(INDUSTRIAL_BUILDING_TYPES)) {
				if (!building.recipeId) continue;
				const art = INDUSTRIAL_BUILDING_ART[building.id];
				if (!art) continue;
				map[building.recipeId] = art;
			}
			return map;
		})()
	);

export const INDUSTRY_TERRAIN_ART_LIST: readonly string[] = Object.freeze(
	Object.values(INDUSTRY_TERRAIN_ART)
);
export const INDUSTRY_RESOURCE_ART_LIST: readonly string[] = Object.freeze(
	Object.values(INDUSTRY_RESOURCE_ART)
);
export const INDUSTRY_MATERIAL_ART_LIST: readonly string[] = Object.freeze(
	Object.values(INDUSTRY_MATERIAL_ART)
);
export const INDUSTRIAL_BUILDING_ART_LIST: readonly string[] = Object.freeze(
	Object.values(INDUSTRIAL_BUILDING_ART)
);
export const INDUSTRY_ART_LIST: readonly string[] = Object.freeze([
	...INDUSTRY_TERRAIN_ART_LIST,
	...INDUSTRY_RESOURCE_ART_LIST,
	...INDUSTRY_MATERIAL_ART_LIST,
	...INDUSTRIAL_BUILDING_ART_LIST
]);

export interface WorldMapArt {
	background: {
		path: string;
		alt: string;
	};
	markers: {
		retail: {
			path: string;
			alt: string;
		};
		industry: {
			path: string;
			alt: string;
		};
		locked: {
			path: string;
			alt: string;
		};
	};
}

export const WORLD_MAP_ART: Readonly<WorldMapArt> = Object.freeze({
	background: Object.freeze({
		path: '/assets/game/world/regional-map.png',
		alt: 'Illustrated regional world map with retail districts, industrial zones, rivers, farms, and harbor routes'
	}),
	markers: Object.freeze({
		retail: Object.freeze({
			path: '/assets/game/world/city-retail.png',
			alt: 'Retail city marker'
		}),
		industry: Object.freeze({
			path: '/assets/game/world/city-industry.png',
			alt: 'Industrial city marker'
		}),
		locked: Object.freeze({
			path: '/assets/game/world/city-locked.png',
			alt: 'Locked city marker'
		})
	})
});

export const WORLD_MAP_ART_LIST: readonly string[] = Object.freeze([
	WORLD_MAP_ART.background.path,
	WORLD_MAP_ART.markers.retail.path,
	WORLD_MAP_ART.markers.industry.path,
	WORLD_MAP_ART.markers.locked.path
]);

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

export function getIndustryTerrainArt(terrain: IndustryTerrainId): string {
	return INDUSTRY_TERRAIN_ART[terrain];
}

export function getIndustryResourceArt(resource: IndustryResourceId): string {
	return INDUSTRY_RESOURCE_ART[resource];
}

export function getIndustryMaterialArt(material: MaterialId): string {
	return INDUSTRY_MATERIAL_ART[material];
}

export function getIndustrialBuildingArt(buildingType: IndustrialBuildingTypeId): string {
	return INDUSTRIAL_BUILDING_ART[buildingType];
}

export interface ChainNodeArt {
	src: string | null;
	alt: string;
	fallbackGlyph: 'material' | 'recipe' | 'warehouse';
}

const WAREHOUSE_ART_PATH = INDUSTRIAL_BUILDING_ART.warehouse;

export function chainNodeArt(node: ProductChainNode): ChainNodeArt {
	if (node.kind === 'material' && node.materialId) {
		return {
			src: INDUSTRY_MATERIAL_ART[node.materialId] ?? null,
			alt: node.label,
			fallbackGlyph: 'material'
		};
	}

	if (node.kind === 'recipe' && node.recipeId) {
		return {
			src: RECIPE_BUILDING_ART[node.recipeId] ?? null,
			alt: node.label,
			fallbackGlyph: 'recipe'
		};
	}

	if (node.kind === 'warehouse') {
		return {
			src: WAREHOUSE_ART_PATH,
			alt: node.label,
			fallbackGlyph: 'warehouse'
		};
	}

	return { src: null, alt: node.label, fallbackGlyph: node.kind };
}
