import { describe, expect, test } from 'vitest';
import { PRODUCTS } from './products';
import {
	getBrandDefinition,
	getBrandDefaultSellingPrice,
	getSupportedBrands,
	isBrandSupported
} from './brands';
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
});
