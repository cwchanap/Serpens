import type { ProductDefinition, ProductId } from './types';

export const PRODUCTS: Readonly<Record<ProductId, ProductDefinition>> = {
	'bottled-water': {
		id: 'bottled-water',
		familyId: 'beverages',
		name: 'Bottled Water',
		demandWeight: 1.2,
		importCost: 2,
		defaultSellingPrice: 3,
		priceSensitivity: 0.7,
		productionMaterialId: 'bottled-water',
		dynamics: { stockoutSensitivity: 1.15 }
	},
	'soft-drinks': {
		id: 'soft-drinks',
		familyId: 'beverages',
		name: 'Soft Drinks',
		demandWeight: 1.15,
		importCost: 2,
		defaultSellingPrice: 4,
		priceSensitivity: 0.8,
		productionMaterialId: 'drinks',
		dynamics: { stockoutSensitivity: 1.1 }
	},
	snacks: {
		id: 'snacks',
		familyId: 'convenience-goods',
		name: 'Snacks',
		demandWeight: 1,
		importCost: 3,
		defaultSellingPrice: 5,
		priceSensitivity: 0.9,
		productionMaterialId: 'snacks',
		dynamics: {}
	},
	essentials: {
		id: 'essentials',
		familyId: 'convenience-goods',
		name: 'Essentials',
		demandWeight: 0.8,
		importCost: 6,
		defaultSellingPrice: 8,
		priceSensitivity: 0.45,
		productionMaterialId: 'essentials',
		dynamics: {}
	},
	household: {
		id: 'household',
		familyId: 'convenience-goods',
		name: 'Household',
		demandWeight: 0.7,
		importCost: 7,
		defaultSellingPrice: 11,
		priceSensitivity: 0.5,
		productionMaterialId: null,
		dynamics: {}
	},
	apparel: {
		id: 'apparel',
		familyId: 'fashion',
		name: 'Apparel',
		demandWeight: 1,
		importCost: 18,
		defaultSellingPrice: 38,
		priceSensitivity: 1.05,
		productionMaterialId: null,
		dynamics: {
			trend: { amplitude: 0.18, periodDays: 28, phaseDays: 7 },
			reputationSensitivity: 1.25
		}
	},
	'home-goods': {
		id: 'home-goods',
		familyId: 'fashion',
		name: 'Home Goods',
		demandWeight: 0.85,
		importCost: 14,
		defaultSellingPrice: 28,
		priceSensitivity: 0.85,
		productionMaterialId: null,
		dynamics: {}
	},
	gifts: {
		id: 'gifts',
		familyId: 'fashion',
		name: 'Gifts',
		demandWeight: 0.75,
		importCost: 9,
		defaultSellingPrice: 20,
		priceSensitivity: 0.95,
		productionMaterialId: 'gifts',
		dynamics: {}
	},
	'fashion-accessories': {
		id: 'fashion-accessories',
		familyId: 'fashion',
		name: 'Fashion Accessories',
		demandWeight: 0.7,
		importCost: 12,
		defaultSellingPrice: 26,
		priceSensitivity: 1,
		productionMaterialId: null,
		dynamics: {}
	},
	games: {
		id: 'games',
		familyId: 'electronics',
		name: 'Games',
		demandWeight: 1,
		importCost: 32,
		defaultSellingPrice: 48,
		priceSensitivity: 0.75,
		productionMaterialId: null,
		dynamics: {}
	},
	accessories: {
		id: 'accessories',
		familyId: 'electronics',
		name: 'Accessories',
		demandWeight: 0.9,
		importCost: 11,
		defaultSellingPrice: 22,
		priceSensitivity: 0.9,
		productionMaterialId: null,
		dynamics: {}
	},
	devices: {
		id: 'devices',
		familyId: 'electronics',
		name: 'Devices',
		demandWeight: 0.55,
		importCost: 180,
		defaultSellingPrice: 240,
		priceSensitivity: 0.5,
		productionMaterialId: null,
		dynamics: {
			trend: { amplitude: 0.15, periodDays: 14, phaseDays: 0 },
			obsolescence: { startsAfterDays: 21, demandFloor: 0.55 },
			markdown: { startsAtAgeDays: 14, priceMultiplier: 0.85 }
		}
	},
	peripherals: {
		id: 'peripherals',
		familyId: 'electronics',
		name: 'Peripherals',
		demandWeight: 0.7,
		importCost: 24,
		defaultSellingPrice: 44,
		priceSensitivity: 0.85,
		productionMaterialId: null,
		dynamics: {}
	},
	produce: {
		id: 'produce',
		familyId: 'grocery-food',
		name: 'Produce',
		demandWeight: 1,
		importCost: 2,
		defaultSellingPrice: 4,
		priceSensitivity: 0.7,
		productionMaterialId: 'produce',
		dynamics: { shelfLifeDays: 10, shrinkRate: 0.02 }
	},
	pantry: {
		id: 'pantry',
		familyId: 'grocery-food',
		name: 'Pantry',
		demandWeight: 1.1,
		importCost: 3,
		defaultSellingPrice: 6,
		priceSensitivity: 0.55,
		productionMaterialId: 'pantry',
		dynamics: {}
	},
	prepared: {
		id: 'prepared',
		familyId: 'grocery-food',
		name: 'Prepared Food',
		demandWeight: 0.75,
		importCost: 5,
		defaultSellingPrice: 10,
		priceSensitivity: 0.85,
		productionMaterialId: null,
		dynamics: { shelfLifeDays: 12, shrinkRate: 0.03 }
	},
	bakery: {
		id: 'bakery',
		familyId: 'grocery-food',
		name: 'Bakery',
		demandWeight: 0.7,
		importCost: 3,
		defaultSellingPrice: 7,
		priceSensitivity: 0.8,
		productionMaterialId: null,
		dynamics: {}
	}
};

export function getProductDefinition(id: ProductId): ProductDefinition {
	return PRODUCTS[id];
}
