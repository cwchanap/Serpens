import { describe, expect, test } from 'vitest';
import { quantizeAtomicRecipeRatio } from './industryProduction';

describe('production ratio edge cases', () => {
	test('returns zero for invalid scales', () => {
		expect(quantizeAtomicRecipeRatio(0, 10, 1, [], [])).toBe(0);
		expect(quantizeAtomicRecipeRatio(0.5, 0, 1, [], [])).toBe(0);
	});

	test('accepts a complete valid recipe scale', () => {
		expect(
			quantizeAtomicRecipeRatio(
				1,
				4,
				1,
				[{ materialId: 'grain', quantity: 2 }],
				[{ materialId: 'flour', quantity: 4 }]
			)
		).toBe(1);
	});

	test('rejects a complete scale when a required input rounds to zero', () => {
		expect(
			quantizeAtomicRecipeRatio(
				1,
				1,
				0.1,
				[{ materialId: 'grain', quantity: 1 }],
				[{ materialId: 'flour', quantity: 10 }]
			)
		).toBe(0);
	});

	test('accepts a valid partial candidate', () => {
		expect(
			quantizeAtomicRecipeRatio(
				0.75,
				4,
				1,
				[{ materialId: 'grain', quantity: 1 }],
				[{ materialId: 'flour', quantity: 4 }]
			)
		).toBe(0.75);
	});

	test('returns zero when partial candidates lose a required input', () => {
		expect(
			quantizeAtomicRecipeRatio(
				0.9,
				2,
				0.1,
				[{ materialId: 'grain', quantity: 1 }],
				[{ materialId: 'flour', quantity: 20 }]
			)
		).toBe(0);
	});

	test('ignores zero-quantity recipe entries', () => {
		expect(
			quantizeAtomicRecipeRatio(
				1,
				2,
				1,
				[
					{ materialId: 'grain', quantity: 0 },
					{ materialId: 'flour', quantity: 1 }
				],
				[
					{ materialId: 'snacks', quantity: 0 },
					{ materialId: 'drinks', quantity: 2 }
				]
			)
		).toBe(1);
	});
});
