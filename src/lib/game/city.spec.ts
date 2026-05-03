import { describe, expect, test } from 'vitest';
import { generateCity, getTileById, getTilesByNeighborhood } from './city';

describe('city generation', () => {
	test('generates deterministic city tiles for the same seed', () => {
		expect.assertions(1);
		const first = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 99
		});
		const second = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 99
		});

		expect(first).toEqual(second);
	});

	test('supports city dimensions that are not 20 by 20', () => {
		expect.assertions(4);
		const city = generateCity({
			id: 'test-city',
			name: 'Test City',
			width: 12,
			height: 8,
			seed: 42
		});

		expect(city.width).toBe(12);
		expect(city.height).toBe(8);
		expect(city.tiles).toHaveLength(96);
		expect(city.tiles.at(-1)?.id).toBe('test-city-11-7');
	});

	test('normalizes fractional city dimensions before generating tiles', () => {
		expect.assertions(4);
		const city = generateCity({
			id: 'fractional-city',
			name: 'Fractional City',
			width: 12.8,
			height: 8.3,
			seed: 42
		});

		expect(city.width).toBe(12);
		expect(city.height).toBe(8);
		expect(city.tiles).toHaveLength(96);
		expect(city.tiles.at(-1)?.id).toBe('fractional-city-11-7');
	});

	test('normalizes non-positive and non-finite city dimensions to one', () => {
		expect.assertions(8);
		const nonPositiveCity = generateCity({
			id: 'non-positive-city',
			name: 'Non-positive City',
			width: 0,
			height: -4,
			seed: 42
		});
		const nonFiniteCity = generateCity({
			id: 'non-finite-city',
			name: 'Non-finite City',
			width: Number.POSITIVE_INFINITY,
			height: Number.NaN,
			seed: 42
		});

		expect(nonPositiveCity.width).toBe(1);
		expect(nonPositiveCity.height).toBe(1);
		expect(nonPositiveCity.tiles).toHaveLength(1);
		expect(nonPositiveCity.tiles[0]?.id).toBe('non-positive-city-0-0');
		expect(nonFiniteCity.width).toBe(1);
		expect(nonFiniteCity.height).toBe(1);
		expect(nonFiniteCity.tiles).toHaveLength(1);
		expect(nonFiniteCity.tiles[0]?.id).toBe('non-finite-city-0-0');
	});

	test('generates stable coordinates and bounded economic traits', () => {
		expect.assertions(7);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 77
		});
		const tile = getTileById(city, 'harbor-city-3-4');

		expect(tile?.x).toBe(3);
		expect(tile?.y).toBe(4);
		expect(tile?.demand).toBeGreaterThanOrEqual(20);
		expect(tile?.demand).toBeLessThanOrEqual(100);
		expect(tile?.rent).toBeGreaterThanOrEqual(400);
		expect(tile?.rent).toBeLessThanOrEqual(2600);
		expect(tile?.customerFit).toBeGreaterThanOrEqual(20);
	});

	test('creates readable neighborhood clusters', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 77
		});

		expect(getTilesByNeighborhood(city, 'downtown').length).toBeGreaterThan(0);
		expect(getTilesByNeighborhood(city, 'campus').length).toBeGreaterThan(0);
	});
});
