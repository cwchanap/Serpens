import { describe, expect, test } from 'vitest';
import { createRng, normalizeSeed, randomBetween, randomInt } from './rng';

describe('seeded RNG', () => {
	test('creates repeatable sequences for the same seed', () => {
		expect.assertions(1);
		const first = createRng(12345);
		const second = createRng(12345);

		const firstValues = [first.next(), first.next(), first.next()];
		const secondValues = [second.next(), second.next(), second.next()];

		expect(firstValues).toEqual(secondValues);
	});

	test('normalizes non-finite seeds deterministically', () => {
		expect.assertions(3);

		expect(normalizeSeed(Number.NaN)).toBe(1);
		expect(normalizeSeed(Number.POSITIVE_INFINITY)).toBe(1);
		expect(normalizeSeed(Number.NEGATIVE_INFINITY)).toBe(1);
	});

	test('generates bounded floating point and integer values', () => {
		expect.assertions(400);
		const rng = createRng(77);

		for (let index = 0; index < 100; index += 1) {
			const floatValue = randomBetween(rng, 10, 20);
			const integerValue = randomInt(rng, 3, 5);

			expect(floatValue).toBeGreaterThanOrEqual(10);
			expect(floatValue).toBeLessThanOrEqual(20);
			expect(integerValue).toBeGreaterThanOrEqual(3);
			expect(integerValue).toBeLessThanOrEqual(5);
		}
	});
});
