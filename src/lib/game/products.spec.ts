import { describe, expect, it } from 'vitest';
import { ARCHETYPES, getArchetype } from './archetypes';
import { MATERIALS } from './industry';
import { getProductDefinition, PRODUCTS } from './products';
import type { MaterialId, ProductId } from './types';

describe('product catalog', () => {
	it('maps products to the intended finished material or no local material', () => {
		const expectedMappings: Record<ProductId, MaterialId | null> = {
			'bottled-water': 'bottled-water',
			'soft-drinks': 'drinks',
			snacks: 'snacks',
			essentials: 'essentials',
			household: null,
			apparel: null,
			'home-goods': null,
			gifts: 'gifts',
			'fashion-accessories': null,
			games: null,
			accessories: null,
			devices: null,
			peripherals: null,
			produce: 'produce',
			pantry: 'pantry',
			prepared: null,
			bakery: null
		};

		expect.assertions(Object.keys(expectedMappings).length * 2);
		for (const [productId, materialId] of Object.entries(expectedMappings) as [
			ProductId,
			MaterialId | null
		][]) {
			const product = getProductDefinition(productId);
			expect(product.productionMaterialId).toBe(materialId);
			if (materialId !== null) {
				expect(MATERIALS[materialId].kind).toBe('finished');
			} else {
				expect(product.productionMaterialId).toBeNull();
			}
		}
	});

	it('does not repeat a product id within an archetype', () => {
		expect.assertions(ARCHETYPES.length);
		for (const archetype of ARCHETYPES) {
			const productIds = archetype.startingProductIds;
			expect(new Set(productIds).size).toBe(productIds.length);
		}
	});

	it('keeps convenience stocked with the two beverage products', () => {
		const convenienceIds = getArchetype('convenience').startingProductIds;

		expect(convenienceIds).toEqual(expect.arrayContaining(['bottled-water', 'soft-drinks']));
	});

	it('uses one catalog definition for shared product economics', () => {
		const product = getProductDefinition('soft-drinks');

		expect(product).toMatchObject({
			name: 'Soft Drinks',
			demandWeight: 1.15,
			importCost: 2,
			defaultSellingPrice: 4,
			priceSensitivity: 0.8,
			productionMaterialId: 'drinks'
		});
		expect(PRODUCTS['soft-drinks']).toBe(product);
	});

	it('keeps every authored age threshold beyond the seven-day replenishment cadence', () => {
		const thresholds = Object.values(PRODUCTS).flatMap((product) => [
			product.dynamics.shelfLifeDays,
			product.dynamics.markdown?.startsAtAgeDays,
			product.dynamics.obsolescence?.startsAfterDays
		]);

		expect(thresholds.every((threshold) => threshold === undefined || threshold > 7)).toBe(true);
	});
});
