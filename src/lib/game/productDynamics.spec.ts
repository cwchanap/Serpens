import { describe, expect, it } from 'vitest';
import {
	applyProductInventoryAging,
	getOldestSellableAgeDays,
	resolveMarkdownMultiplier,
	resolveObsolescenceMultiplier,
	resolveProductMarketDynamics,
	resolveReputationScore,
	resolveTrendMultiplier
} from './productDynamics';
import { getProductDefinition } from './products';
import type { StoreProduct } from './types';

function createProduct(): StoreProduct {
	return {
		productId: 'produce',
		lots: [
			{ receivedDay: 1, quantity: 4 },
			{ receivedDay: 2, quantity: 3 }
		],
		reorderThreshold: 1,
		targetStock: 20,
		sellingPrice: 4
	};
}

describe('product dynamics', () => {
	it('expires a lot at the exact shelf-life boundary and preserves newer stock', () => {
		const product = createProduct();
		const definition = {
			...getProductDefinition('produce'),
			dynamics: { shelfLifeDays: 8 }
		};

		const result = applyProductInventoryAging({ product, definition, closingDay: 9 });

		expect(result.product.lots).toEqual([{ receivedDay: 2, quantity: 3 }]);
		expect(result.product).not.toBe(product);
		expect(result.product.lots).not.toBe(product.lots);
		expect(result.wasteUnits).toBe(4);
		expect(result.wasteValue).toBe(8);
		expect(product.lots).toEqual([
			{ receivedDay: 1, quantity: 4 },
			{ receivedDay: 2, quantity: 3 }
		]);
	});

	it('applies deterministic shrink after spoilage and values it at import cost', () => {
		const product = {
			...createProduct(),
			lots: [
				{ receivedDay: 1, quantity: 25 },
				{ receivedDay: 3, quantity: 6 }
			]
		};
		const definition = {
			...getProductDefinition('produce'),
			dynamics: { shrinkRate: 0.1 }
		};

		const result = applyProductInventoryAging({ product, definition, closingDay: 9 });

		expect(result.product.lots).toEqual([
			{ receivedDay: 1, quantity: 22 },
			{ receivedDay: 3, quantity: 6 }
		]);
		expect(result.shrinkUnits).toBe(3);
		expect(result.shrinkValue).toBe(6);
		expect(result.wasteUnits).toBe(0);
	});

	it('derives weighted average age, freshness, and oldest sellable age from remaining lots', () => {
		const product = {
			...createProduct(),
			lots: [
				{ receivedDay: 1, quantity: 2 },
				{ receivedDay: 7, quantity: 6 }
			]
		};
		const definition = {
			...getProductDefinition('produce'),
			dynamics: { shelfLifeDays: 10 }
		};

		const result = applyProductInventoryAging({ product, definition, closingDay: 9 });

		expect(result.averageAgeDays).toBe(3.5);
		expect(result.freshnessPercent).toBe(65);
		expect(result.oldestSellableAgeDays).toBe(8);
		expect(result.product).not.toHaveProperty('averageAgeDays');
	});

	it('reports no freshness pressure for an empty or non-perishable product', () => {
		const product = createProduct();
		const definition = getProductDefinition('snacks');

		const result = applyProductInventoryAging({ product, definition, closingDay: 9 });
		const emptyResult = applyProductInventoryAging({
			product: { ...product, lots: [] },
			definition,
			closingDay: 9
		});

		expect(result.averageAgeDays).toBeCloseTo(53 / 7);
		expect(result.freshnessPercent).toBeNull();
		expect(emptyResult.averageAgeDays).toBeNull();
		expect(emptyResult.freshnessPercent).toBeNull();
		expect(emptyResult.oldestSellableAgeDays).toBeNull();
	});

	it('resolves a bounded triangle trend with deterministic period wrapping', () => {
		const product = createProduct();
		const definition = {
			...getProductDefinition('apparel'),
			dynamics: { trend: { amplitude: 0.2, periodDays: 8, phaseDays: 0 } }
		};

		const beginning = resolveProductMarketDynamics({
			product,
			definition,
			day: 0
		});
		const peak = resolveProductMarketDynamics({
			product,
			definition,
			day: 2
		});
		const trough = resolveProductMarketDynamics({
			product,
			definition,
			day: 6
		});
		const wrapped = resolveProductMarketDynamics({
			product,
			definition,
			day: 8
		});

		expect(beginning.trendMultiplier).toBe(1);
		expect(peak.trendMultiplier).toBe(1.2);
		expect(trough.trendMultiplier).toBe(0.8);
		expect(wrapped.trendMultiplier).toBe(beginning.trendMultiplier);
	});

	it('uses the oldest sellable lot age for obsolescence and markdown', () => {
		const product = {
			...createProduct(),
			lots: [
				{ receivedDay: 1, quantity: 4 },
				{ receivedDay: 9, quantity: 4 }
			]
		};
		const definition = {
			...getProductDefinition('devices'),
			dynamics: {
				obsolescence: { startsAfterDays: 10, demandFloor: 0.4 },
				markdown: { startsAtAgeDays: 10, priceMultiplier: 0.75 }
			}
		};

		const result = resolveProductMarketDynamics({
			product,
			definition,
			day: 12
		});
		const floorResult = resolveProductMarketDynamics({
			product,
			definition,
			day: 21
		});

		expect(result.obsolescenceMultiplier).toBeCloseTo(0.94);
		expect(result.markdownMultiplier).toBe(0.75);
		expect(floorResult.obsolescenceMultiplier).toBe(0.4);
		expect(product.sellingPrice).toBe(4);
	});

	it('scales only reputation deviation and preserves the neutral score at sensitivity one', () => {
		const neutral = resolveReputationScore({ storeReputation: 50, reputationSensitivity: 1 });
		const highBaseline = resolveReputationScore({ storeReputation: 90, reputationSensitivity: 1 });
		const highSensitive = resolveReputationScore({
			storeReputation: 90,
			reputationSensitivity: 1.5
		});
		const lowBaseline = resolveReputationScore({ storeReputation: 10, reputationSensitivity: 1 });
		const lowSensitive = resolveReputationScore({
			storeReputation: 10,
			reputationSensitivity: 1.5
		});

		expect(neutral).toBeCloseTo(27.5);
		expect(highSensitive - neutral).toBeGreaterThan(highBaseline - neutral);
		expect(neutral - lowSensitive).toBeGreaterThan(neutral - lowBaseline);
		expect(resolveReputationScore({ storeReputation: 50, reputationSensitivity: 2 })).toBe(neutral);
	});

	it('skips empty lots during aging without counting them as waste or shrink', () => {
		const product: StoreProduct = {
			productId: 'produce',
			lots: [
				{ receivedDay: 1, quantity: 0 },
				{ receivedDay: 2, quantity: 4 }
			],
			reorderThreshold: 1,
			targetStock: 20,
			sellingPrice: 4
		};
		const definition = { ...getProductDefinition('produce'), dynamics: { shrinkRate: 0.25 } };

		const result = applyProductInventoryAging({ product, definition, closingDay: 9 });

		expect(result.product.lots).toEqual([{ receivedDay: 2, quantity: 3 }]);
		expect(result.shrinkUnits).toBe(1);
		expect(result.wasteUnits).toBe(0);
	});

	it('getOldestSellableAgeDays ignores empty and expired lots', () => {
		const product: StoreProduct = {
			productId: 'produce',
			lots: [
				{ receivedDay: 1, quantity: 0 },
				{ receivedDay: 2, quantity: 5 },
				{ receivedDay: 0, quantity: 3 }
			],
			reorderThreshold: 1,
			targetStock: 20,
			sellingPrice: 4
		};

		expect(getOldestSellableAgeDays(product, 9, 8)).toBe(7);
		expect(
			getOldestSellableAgeDays({ ...product, lots: [{ receivedDay: 1, quantity: 0 }] }, 9, 8)
		).toBeNull();
		expect(
			getOldestSellableAgeDays({ ...product, lots: [{ receivedDay: 0, quantity: 3 }] }, 9, 8)
		).toBeNull();
	});

	it('resolveTrendMultiplier falls back to defaults for non-finite phase and amplitude', () => {
		const baseline = resolveTrendMultiplier({ amplitude: 0.5, periodDays: 8, phaseDays: 0 }, 2);
		const nonFinitePhase = resolveTrendMultiplier(
			{ amplitude: 0.5, periodDays: 8, phaseDays: Number.NaN },
			2
		);
		const nonFiniteAmplitude = resolveTrendMultiplier(
			{ amplitude: Number.NaN, periodDays: 8, phaseDays: 0 },
			2
		);

		expect(nonFinitePhase).toBe(baseline);
		expect(nonFiniteAmplitude).toBe(1);
	});

	it('resolveObsolescenceMultiplier and resolveMarkdownMultiplier return neutral for null age', () => {
		expect(resolveObsolescenceMultiplier(null, { startsAfterDays: 10, demandFloor: 0.4 })).toBe(1);
		expect(resolveMarkdownMultiplier(null, { startsAtAgeDays: 10, priceMultiplier: 0.75 })).toBe(1);
		expect(resolveObsolescenceMultiplier(5, { startsAfterDays: 10, demandFloor: 0.4 })).toBe(1);
		expect(resolveMarkdownMultiplier(5, { startsAtAgeDays: 10, priceMultiplier: 0.75 })).toBe(1);
	});

	it('resolveReputationScore falls back to neutral reputation for non-finite store reputation', () => {
		const neutral = resolveReputationScore({ storeReputation: 50 });
		const nonFinite = resolveReputationScore({ storeReputation: Number.POSITIVE_INFINITY });

		expect(nonFinite).toBe(neutral);
	});
});
