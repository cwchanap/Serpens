import { describe, expect, test } from 'vitest';
import { PRODUCTS } from './products';
import {
	brandedSellerScore,
	getBrandDefinition,
	getBrandDefaultSellingPrice,
	getSupportedBrands,
	isBrandSupported,
	resolveBrandEconomics
} from './brands';
import { createNewGame } from './state';
import type { BrandId, ProductFamilyId } from './types';

const BRAND_IDS: readonly BrandId[] = [
	'common-ground',
	'budget-bay',
	'northstar-select',
	'fresh-field'
];

const PRODUCT_FAMILIES: readonly ProductFamilyId[] = [
	'beverages',
	'convenience-goods',
	'fashion',
	'electronics',
	'grocery-food'
];

describe('brand catalog', () => {
	test('defines the authored brand profiles and family compatibility', () => {
		expect.assertions(8);

		expect(getBrandDefinition('common-ground')).toMatchObject({
			name: 'Common Ground',
			positioning: 'mainstream',
			quality: 50,
			loyaltyMultiplier: 1,
			availabilityMultiplier: 1,
			priceMultiplier: 1,
			demandMultiplier: 1,
			unitCostMultiplier: 1,
			supportedFamilyIds: PRODUCT_FAMILIES
		});
		expect(getBrandDefinition('budget-bay')).toMatchObject({
			name: 'Budget Bay',
			positioning: 'value',
			quality: 42,
			loyaltyMultiplier: 0.95,
			availabilityMultiplier: 1.08,
			priceMultiplier: 0.9,
			demandMultiplier: 1.1,
			unitCostMultiplier: 0.84,
			supportedFamilyIds: ['beverages', 'convenience-goods', 'grocery-food']
		});
		expect(getBrandDefinition('northstar-select')).toMatchObject({
			name: 'Northstar Select',
			positioning: 'premium',
			quality: 82,
			loyaltyMultiplier: 1.12,
			availabilityMultiplier: 0.92,
			priceMultiplier: 1.18,
			demandMultiplier: 0.94,
			unitCostMultiplier: 1.1,
			supportedFamilyIds: ['fashion', 'electronics']
		});
		expect(getBrandDefinition('fresh-field')).toMatchObject({
			name: 'Fresh Field',
			positioning: 'premium',
			quality: 74,
			loyaltyMultiplier: 1.08,
			availabilityMultiplier: 0.98,
			priceMultiplier: 1.08,
			demandMultiplier: 1.06,
			unitCostMultiplier: 1.04,
			supportedFamilyIds: ['grocery-food']
		});
		expect(getSupportedBrands('produce').map((brand) => brand.id)).toEqual([
			'common-ground',
			'budget-bay',
			'fresh-field'
		]);
		expect(getSupportedBrands('apparel').map((brand) => brand.id)).toEqual([
			'common-ground',
			'northstar-select'
		]);
		expect(isBrandSupported('bottled-water', 'northstar-select')).toBe(false);
		expect(isBrandSupported('bottled-water', 'budget-bay')).toBe(true);
	});

	test('catalog family lists are known and contain no duplicates', () => {
		expect.assertions(BRAND_IDS.length * 2);

		for (const brandId of BRAND_IDS) {
			const families = getBrandDefinition(brandId).supportedFamilyIds;
			expect(families.every((familyId) => PRODUCT_FAMILIES.includes(familyId))).toBe(true);
			expect(new Set(families).size).toBe(families.length);
		}
	});

	test('every current product has a supported default brand', () => {
		expect.assertions(Object.keys(PRODUCTS).length);

		for (const product of Object.values(PRODUCTS)) {
			expect(isBrandSupported(product.id, product.defaultBrandId)).toBe(true);
		}
	});

	test('all brand multipliers are finite and positive and quality is bounded', () => {
		expect.assertions(BRAND_IDS.length * 8);

		for (const brandId of BRAND_IDS) {
			const brand = getBrandDefinition(brandId);
			expect(Number.isFinite(brand.loyaltyMultiplier)).toBe(true);
			expect(brand.loyaltyMultiplier).toBeGreaterThan(0);
			expect(Number.isFinite(brand.availabilityMultiplier)).toBe(true);
			expect(brand.availabilityMultiplier).toBeGreaterThan(0);
			expect(Number.isFinite(brand.priceMultiplier)).toBe(true);
			expect(brand.priceMultiplier).toBeGreaterThan(0);
			expect(brand.quality).toBeGreaterThanOrEqual(0);
			expect(brand.quality).toBeLessThanOrEqual(100);
		}
	});

	test('writes a rounded minimum-one default selling price for a brand', () => {
		expect.assertions(2);

		expect(getBrandDefaultSellingPrice(PRODUCTS.apparel, 'northstar-select')).toBe(45);
		expect(getBrandDefaultSellingPrice(PRODUCTS['bottled-water'], 'common-ground')).toBe(3);
	});

	test('resolves unit cost, demand, and market attraction without a customer price', () => {
		expect.assertions(5);

		expect(resolveBrandEconomics(PRODUCTS.snacks, 'budget-bay')).toEqual({
			unitCost: 2.52,
			demandMultiplier: 1.1,
			marketAttractionMultiplier: 1.026
		});
		expect(resolveBrandEconomics(PRODUCTS.apparel, 'northstar-select')).toMatchObject({
			unitCost: 19.8,
			demandMultiplier: 0.94
		});
		expect(
			resolveBrandEconomics(PRODUCTS.apparel, 'northstar-select').marketAttractionMultiplier
		).toBeCloseTo(1.0304, 10);
		const reportShape = resolveBrandEconomics(PRODUCTS.snacks, 'budget-bay');
		expect(reportShape).not.toHaveProperty('customerPrice');
		expect(reportShape).not.toHaveProperty('sellingPrice');
	});

	test('multiplies the seller score without a hidden competition term', () => {
		expect.assertions(2);
		const game = createNewGame('boutique', 20260820);
		const store = {
			...game.stores[0]!,
			reputation: 70,
			staffCapacity: 100,
			products: [
				{
					...game.stores[0]!.products[0]!,
					productId: 'apparel' as const,
					brandId: 'northstar-select' as const
				}
			]
		};
		const commonGroundStore = {
			...store,
			products: [{ ...store.products[0]!, brandId: 'common-ground' as const }]
		};

		expect(brandedSellerScore(store, 'apparel')).toBeCloseTo(71.0976, 10);
		expect(brandedSellerScore(store, 'apparel')).toBeGreaterThan(
			brandedSellerScore(commonGroundStore, 'apparel')
		);
	});
});
