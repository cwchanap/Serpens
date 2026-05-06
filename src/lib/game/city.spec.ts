import { describe, expect, test } from 'vitest';
import {
	generateCity,
	getTileById,
	getTilePlacementBlockReason,
	getTilesByNeighborhood
} from './city';

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

	test('adds deterministic road and river features to playable cities', () => {
		expect.assertions(10);
		const first = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 77
		});
		const second = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 77
		});
		const roadTiles = first.tiles.filter((tile) => tile.feature === 'road');
		const riverTiles = first.tiles.filter((tile) => tile.feature === 'river');
		const roadXs = new Set(roadTiles.map((tile) => tile.x));
		const roadYs = new Set(roadTiles.map((tile) => tile.y));
		const riverXs = new Set(riverTiles.map((tile) => tile.x));

		expect(first).toEqual(second);
		expect(roadTiles.length).toBeGreaterThan(0);
		expect(riverTiles.length).toBeGreaterThan(0);
		expect(roadTiles.every((tile) => !tile.locked)).toBe(true);
		expect(riverTiles.every((tile) => !tile.locked)).toBe(true);
		expect(roadXs.has(10) || roadYs.has(10)).toBe(true);
		expect(riverXs.size).toBeGreaterThanOrEqual(2);
		expect(getTileById(first, 'harbor-city-10-1')?.feature).toBe('road');
		expect(getTileById(first, 'harbor-city-5-1')?.feature).toBe('river');
		expect(first.tiles.some((tile) => !tile.locked && tile.feature === null)).toBe(true);
	});

	test('does not add road or river features to cities smaller than five by five', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'tiny-city',
			name: 'Tiny City',
			width: 4,
			height: 4,
			seed: 77
		});

		expect(city.tiles).toHaveLength(16);
		expect(city.tiles.every((tile) => tile.feature === null)).toBe(true);
	});

	test('returns placement block reasons for locked, road, and river tiles', () => {
		expect.assertions(4);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 77
		});

		expect(getTilePlacementBlockReason(getTileById(city, 'harbor-city-0-0')!)).toBe(
			'Locked location'
		);
		expect(getTilePlacementBlockReason(getTileById(city, 'harbor-city-10-1')!)).toBe(
			'Road location'
		);
		expect(getTilePlacementBlockReason(getTileById(city, 'harbor-city-5-1')!)).toBe(
			'River location'
		);
		expect(
			getTilePlacementBlockReason(city.tiles.find((tile) => !tile.locked && tile.feature === null)!)
		).toBeNull();
	});
});
