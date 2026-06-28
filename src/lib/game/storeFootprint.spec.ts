import { describe, expect, test } from 'vitest';
import {
	RETAIL_STORE_FOOTPRINT_HEIGHT,
	RETAIL_STORE_FOOTPRINT_WIDTH,
	createCityTileLookup,
	getOccupiedStoreTileIds,
	getRetailStoreFootprint,
	getStoreFootprintPlacementBlockReason,
	isTileInStoreFootprint
} from './storeFootprint';
import type { City, CityTile, Store } from './types';

function makeTile(
	cityId: string,
	x: number,
	y: number,
	overrides: Partial<CityTile> = {}
): CityTile {
	return {
		id: `${cityId}-${x}-${y}`,
		cityId,
		x,
		y,
		neighborhood: 'downtown',
		terrain: 'commercial',
		feature: null,
		demand: 50,
		rent: 100,
		footTraffic: 50,
		customerFit: 50,
		locked: false,
		...overrides
	};
}

function makeCity(id: string, width: number, height: number): City {
	const tiles: CityTile[] = [];
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			tiles.push(makeTile(id, x, y));
		}
	}
	return { id, name: id, width, height, tiles };
}

function makeStore(cityId: string, tileId: string, mapX: number, mapY: number): Store {
	return {
		id: `store-${tileId}`,
		level: 1,
		name: 'Store',
		archetypeId: 'convenience',
		location: 'Downtown',
		cityId,
		tileId,
		mapX,
		mapY,
		daysOpen: 0,
		reputation: 0,
		stockHealth: 100,
		products: [],
		staffMorale: 80,
		staffCapacity: 1,
		localDemand: 50,
		competition: 0,
		managerQuality: 0
	};
}

describe('city tile lookup', () => {
	test('createCityTileLookup indexes every tile by id and coordinate', () => {
		expect.assertions(2);
		const city = makeCity('retail', 2, 2);
		const lookup = createCityTileLookup(city);

		expect(lookup.byId.size).toBe(4);
		expect(lookup.byCoordinate.get('1,1')).toBe(city.tiles[3]);
	});
});

describe('getRetailStoreFootprint', () => {
	test('returns the full 2x2 tile set for an interior anchor', () => {
		expect.assertions(1);
		const city = makeCity('retail', 4, 4);
		const anchor = city.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;

		const footprint = getRetailStoreFootprint(createCityTileLookup(city), anchor);

		expect(footprint.tiles).toHaveLength(
			RETAIL_STORE_FOOTPRINT_WIDTH * RETAIL_STORE_FOOTPRINT_HEIGHT
		);
	});

	test('reports missing coordinates when the anchor sits on the map edge', () => {
		expect.assertions(1);
		const city = makeCity('retail', 3, 3);
		const corner = city.tiles.find((tile) => tile.x === 2 && tile.y === 2)!;

		const footprint = getRetailStoreFootprint(createCityTileLookup(city), corner);

		expect(footprint.missingCoordinates).toEqual([
			{ x: 3, y: 2 },
			{ x: 2, y: 3 },
			{ x: 3, y: 3 }
		]);
	});
});

describe('getOccupiedStoreTileIds', () => {
	test('marks every footprint tile of in-city stores as occupied', () => {
		expect.assertions(1);
		const city = makeCity('retail', 4, 4);
		const anchor = city.tiles.find((tile) => tile.x === 0 && tile.y === 0)!;
		const stores = [makeStore(city.id, anchor.id, anchor.x, anchor.y)];

		expect(getOccupiedStoreTileIds(city, stores).size).toBe(4);
	});

	test('ignores stores belonging to a different city', () => {
		expect.assertions(1);
		const city = makeCity('retail', 4, 4);
		const anchor = city.tiles.find((tile) => tile.x === 0 && tile.y === 0)!;
		const foreignStore = makeStore('other-city', anchor.id, anchor.x, anchor.y);

		expect(getOccupiedStoreTileIds(city, [foreignStore]).size).toBe(0);
	});

	test('skips stores whose anchor tile cannot be resolved by id or coordinate', () => {
		expect.assertions(1);
		const city = makeCity('retail', 4, 4);
		const missingStore = makeStore(city.id, 'retail-99-99', 99, 99);

		expect(getOccupiedStoreTileIds(city, [missingStore]).size).toBe(0);
	});

	test('falls back to coordinate lookup when the tile id is absent but coordinates match', () => {
		expect.assertions(1);
		const city = makeCity('retail', 4, 4);
		const anchor = city.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;
		const coordinateOnlyStore = makeStore(city.id, 'stale-id', anchor.x, anchor.y);

		expect(getOccupiedStoreTileIds(city, [coordinateOnlyStore]).size).toBe(4);
	});
});

describe('getStoreFootprintPlacementBlockReason', () => {
	test('returns Locked location when the footprint extends beyond the map', () => {
		expect.assertions(1);
		const city = makeCity('retail', 3, 3);
		const lookup = createCityTileLookup(city);
		const corner = city.tiles.find((tile) => tile.x === 2 && tile.y === 2)!;

		expect(getStoreFootprintPlacementBlockReason(lookup, corner)).toBe('Locked location');
	});

	test('returns the per-tile block reason when a footprint tile is a road', () => {
		expect.assertions(1);
		const city = makeCity('retail', 4, 4);
		const roadTile = city.tiles.find((tile) => tile.x === 1 && tile.y === 0)!;
		roadTile.feature = 'road';
		const anchor = city.tiles.find((tile) => tile.x === 0 && tile.y === 0)!;

		expect(getStoreFootprintPlacementBlockReason(createCityTileLookup(city), anchor)).toBe(
			'Road location'
		);
	});

	test('returns River location when a non-anchor footprint tile is a river', () => {
		expect.assertions(1);
		const city = makeCity('retail', 4, 4);
		// (1,1) is a non-anchor tile of the anchor (0,0) 2x2 footprint.
		const riverTile = city.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;
		riverTile.feature = 'river';
		const anchor = city.tiles.find((tile) => tile.x === 0 && tile.y === 0)!;

		expect(getStoreFootprintPlacementBlockReason(createCityTileLookup(city), anchor)).toBe(
			'River location'
		);
	});

	test('returns Locked location when a non-anchor footprint tile is locked', () => {
		expect.assertions(1);
		const city = makeCity('retail', 4, 4);
		// (0,1) is a non-anchor tile of the anchor (0,0) 2x2 footprint.
		const lockedTile = city.tiles.find((tile) => tile.x === 0 && tile.y === 1)!;
		lockedTile.locked = true;
		const anchor = city.tiles.find((tile) => tile.x === 0 && tile.y === 0)!;

		expect(getStoreFootprintPlacementBlockReason(createCityTileLookup(city), anchor)).toBe(
			'Locked location'
		);
	});

	test('returns Occupied location when a footprint tile is already taken', () => {
		expect.assertions(1);
		const city = makeCity('retail', 4, 4);
		const lookup = createCityTileLookup(city);
		const anchor = city.tiles.find((tile) => tile.x === 0 && tile.y === 0)!;
		const occupied = getOccupiedStoreTileIds(
			city,
			[makeStore(city.id, anchor.id, anchor.x, anchor.y)],
			lookup
		);
		const neighbor = city.tiles.find((tile) => tile.x === 1 && tile.y === 0)!;

		expect(getStoreFootprintPlacementBlockReason(lookup, neighbor, occupied)).toBe(
			'Occupied location'
		);
	});

	test('returns null for a fully buildable, unoccupied footprint', () => {
		expect.assertions(1);
		const city = makeCity('retail', 4, 4);
		const anchor = city.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;

		expect(getStoreFootprintPlacementBlockReason(createCityTileLookup(city), anchor)).toBeNull();
	});
});

describe('isTileInStoreFootprint', () => {
	const store = { mapX: 2, mapY: 2 } as Pick<Store, 'mapX' | 'mapY'>;

	test('returns true for tiles inside the 2x2 footprint', () => {
		expect.assertions(4);
		expect(isTileInStoreFootprint({ x: 2, y: 2 }, store)).toBe(true);
		expect(isTileInStoreFootprint({ x: 3, y: 2 }, store)).toBe(true);
		expect(isTileInStoreFootprint({ x: 2, y: 3 }, store)).toBe(true);
		expect(isTileInStoreFootprint({ x: 3, y: 3 }, store)).toBe(true);
	});

	test('returns false for tiles outside the footprint bounds', () => {
		expect.assertions(4);
		expect(isTileInStoreFootprint({ x: 1, y: 2 }, store)).toBe(false);
		expect(isTileInStoreFootprint({ x: 4, y: 2 }, store)).toBe(false);
		expect(isTileInStoreFootprint({ x: 2, y: 1 }, store)).toBe(false);
		expect(isTileInStoreFootprint({ x: 2, y: 4 }, store)).toBe(false);
	});
});
