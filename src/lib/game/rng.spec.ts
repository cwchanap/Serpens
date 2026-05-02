import { describe, expect, test } from 'vitest';
import { createRng, randomBetween, randomInt } from './rng';

describe('seeded RNG', () => {
	test('creates repeatable sequences for the same seed', () => {
		expect.assertions(1);
		const first = createRng(12345);
		const second = createRng(12345);

		const firstValues = [first.next(), first.next(), first.next()];
		const secondValues = [second.next(), second.next(), second.next()];

		expect(firstValues).toEqual(secondValues);
	});

	test('generates bounded floating point and integer values', () => {
		expect.assertions(2);
		const rng = createRng(77);

		expect(randomBetween(rng, 10, 20)).toBeGreaterThanOrEqual(10);
		expect(randomInt(rng, 3, 5)).toBeLessThanOrEqual(5);
	});
});
