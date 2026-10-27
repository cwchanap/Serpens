import type { ProductDefinition, ProductId } from './types';

export const PRODUCTS: Readonly<Record<ProductId, ProductDefinition>> = {
	'bottled-water': {
		id: 'bottled-water',
		familyId: 'beverages',
		defaultBrandId: 'common-ground',
		name: 'Bottled Water',
		demandWeight: 1.2,
		// HPA-502 Step 4 round 2: founding capacity fills in sorted-id order, so
		// the alphabetically-first product's margin leads convenience economics
		// (price ×2 is the authorized data-lever cap; demand is unpunished
		// because the store price tracks the table default).
		importCost: 1,
		defaultSellingPrice: 6,
		priceSensitivity: 0.7,
		productionMaterialId: 'bottled-water',
		dynamics: {}
	},
	'soft-drinks': {
		id: 'soft-drinks',
		familyId: 'beverages',
		defaultBrandId: 'common-ground',
		name: 'Soft Drinks',
		demandWeight: 1.15,
		importCost: 2,
		defaultSellingPrice: 4,
		priceSensitivity: 0.8,
		productionMaterialId: 'drinks',
		dynamics: {}
	},
	snacks: {
		id: 'snacks',
		familyId: 'convenience-goods',
		defaultBrandId: 'common-ground',
		name: 'Snacks',
		demandWeight: 1,
		// HPA-502 Step 4 round 2: breadth-2 founding tail margin (price ×1.6,
		// cost ×2/3 — inside the ≤2× data-lever cap).
		importCost: 2,
		defaultSellingPrice: 8,
		priceSensitivity: 0.9,
		productionMaterialId: 'snacks',
		dynamics: {}
	},
	essentials: {
		id: 'essentials',
		familyId: 'convenience-goods',
		defaultBrandId: 'common-ground',
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
		defaultBrandId: 'common-ground',
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
		defaultBrandId: 'common-ground',
		name: 'Apparel',
		demandWeight: 1,
		importCost: 18,
		defaultSellingPrice: 38,
		priceSensitivity: 1.05,
		productionMaterialId: null,
		dynamics: {
			trend: { amplitude: 0.18, periodDays: 28, phaseDays: 7 },
			reputationSensitivity: 1.5
		}
	},
	'home-goods': {
		id: 'home-goods',
		familyId: 'fashion',
		defaultBrandId: 'common-ground',
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
		defaultBrandId: 'common-ground',
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
		defaultBrandId: 'common-ground',
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
		defaultBrandId: 'common-ground',
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
		defaultBrandId: 'common-ground',
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
		defaultBrandId: 'common-ground',
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
		defaultBrandId: 'common-ground',
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
		defaultBrandId: 'common-ground',
		name: 'Produce',
		// HPA-502 Step 4 round 2: grocery-food demandWeight ×2 (the ruled volume
		// lever) makes rival-bound seeds capacity-bound like rival-free seeds,
		// compressing the playerShare swing inside the sizing band; price ×1.5,
		// cost ×0.5 set the capacity-bound margin.
		demandWeight: 2,
		importCost: 1,
		defaultSellingPrice: 6,
		priceSensitivity: 0.7,
		productionMaterialId: 'produce',
		dynamics: { shelfLifeDays: 10, shrinkRate: 0.02 }
	},
	pantry: {
		id: 'pantry',
		familyId: 'grocery-food',
		defaultBrandId: 'common-ground',
		name: 'Pantry',
		demandWeight: 2.2,
		importCost: 1.5,
		// Price 9 (×1.5, inside the ≤2× data cap): with Ruling 8 lever (v) the
		// joint set measures 1.54–1.90× live across the 10 replay seeds — inside
		// the 1.2–2.0× band (scratch/phase5a-r2-live.ts is the authoritative
		// measurement; the HEAD-basis sizing probe reads ~13% high on payroll).
		defaultSellingPrice: 9,
		priceSensitivity: 0.55,
		productionMaterialId: 'pantry',
		dynamics: {}
	},
	prepared: {
		id: 'prepared',
		familyId: 'grocery-food',
		defaultBrandId: 'common-ground',
		name: 'Prepared Food',
		// Same grocery-food demandWeight ×2 family calibration as produce/pantry.
		demandWeight: 1.5,
		importCost: 5,
		defaultSellingPrice: 10,
		priceSensitivity: 0.85,
		productionMaterialId: null,
		dynamics: { shelfLifeDays: 12, shrinkRate: 0.03 }
	},
	bakery: {
		id: 'bakery',
		familyId: 'grocery-food',
		defaultBrandId: 'common-ground',
		name: 'Bakery',
		demandWeight: 1.4,
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

export function getProductFreshnessPercent(
	productId: ProductId,
	averageAgeDays: number | null
): number | null {
	const shelfLifeDays = getProductDefinition(productId)?.dynamics.shelfLifeDays;
	if (
		averageAgeDays === null ||
		!Number.isFinite(averageAgeDays) ||
		shelfLifeDays === undefined ||
		!Number.isFinite(shelfLifeDays) ||
		shelfLifeDays <= 0
	) {
		return null;
	}

	return Math.max(0, Math.min(100, Math.round((1 - averageAgeDays / shelfLifeDays) * 100)));
}
