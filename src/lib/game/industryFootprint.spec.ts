import { describe, expect, test } from 'vitest';
import {
	INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT,
	INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH,
	createIndustryTileLookup,
	getIndustryBuildingFootprint,
	getOccupiedIndustryTileIds,
	isTileInIndustryBuildingFootprint
} from './industryFootprint';
import type { IndustrialBuilding, IndustryCity, IndustryTile } from './types';

function makeTile(
	cityId: string,
	x: number,
	y: number,
	overrides: Partial<IndustryTile> = {}
): IndustryTile {
	return {
		id: `${cityId}-${x}-${y}`,
		cityId,
		x,
		y,
		terrain: 'industrial',
		resource: null,
		locked: false,
		...overrides
	};
}

function makeCity(id: string, width: number, height: number): IndustryCity {
	const tiles: IndustryTile[] = [];
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			tiles.push(makeTile(id, x, y));
		}
	}
	return { id, name: id, width, height, tiles, rails: [] };
}

function makeBuilding(
	cityId: string,
	tileId: string,
	mapX: number,
	mapY: number
): IndustrialBuilding {
	return {
		id: `building-${tileId}`,
		level: 1,
		typeId: 'warehouse',
		cityId,
		tileId,
		mapX,
		mapY,
		status: 'idle',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {}
	};
}

describe('industry footprint lookup', () => {
	test('createIndustryTileLookup indexes every tile by id and coordinate', () => {
		expect.assertions(3);
		const city = makeCity('alpha', 2, 2);
		const lookup = createIndustryTileLookup(city);

		expect(lookup.byId.size).toBe(4);
		expect(lookup.byCoordinate.get('0,0')).toBe(city.tiles[0]);
		expect(lookup.byId.get('alpha-1-1')).toBe(city.tiles[3]);
	});

	test('getIndustryBuildingFootprint returns the full 2x2 tile set for an interior anchor', () => {
		expect.assertions(2);
		const city = makeCity('alpha', 4, 4);
		const lookup = createIndustryTileLookup(city);
		const anchor = city.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;

		const footprint = getIndustryBuildingFootprint(lookup, anchor);

		expect(footprint.tiles).toHaveLength(
			INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH * INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT
		);
		expect(footprint.missingCoordinates).toHaveLength(0);
	});

	test('getIndustryBuildingFootprint reports missing coordinates when the anchor sits on the map edge', () => {
		expect.assertions(3);
		const city = makeCity('alpha', 3, 3);
		const lookup = createIndustryTileLookup(city);
		const corner = city.tiles.find((tile) => tile.x === 2 && tile.y === 2)!;

		const footprint = getIndustryBuildingFootprint(lookup, corner);

		expect(footprint.tiles).toHaveLength(1);
		expect(footprint.missingCoordinates).toEqual([
			{ x: 3, y: 2 },
			{ x: 2, y: 3 },
			{ x: 3, y: 3 }
		]);
		expect(footprint.missingCoordinates).toHaveLength(3);
	});
});

describe('getOccupiedIndustryTileIds', () => {
	test('marks every footprint tile of in-city buildings as occupied', () => {
		expect.assertions(2);
		const city = makeCity('alpha', 4, 4);
		const anchor = city.tiles.find((tile) => tile.x === 0 && tile.y === 0)!;
		const buildings = [makeBuilding(city.id, anchor.id, anchor.x, anchor.y)];

		const occupied = getOccupiedIndustryTileIds(city, buildings);

		expect(occupied.size).toBe(4);
		expect(
			getIndustryBuildingFootprint(createIndustryTileLookup(city), anchor).tiles.every((tile) =>
				occupied.has(tile.id)
			)
		).toBe(true);
	});

	test('ignores buildings belonging to a different city', () => {
		expect.assertions(1);
		const city = makeCity('alpha', 4, 4);
		const anchor = city.tiles.find((tile) => tile.x === 0 && tile.y === 0)!;
		const foreignBuilding = makeBuilding('other-city', anchor.id, anchor.x, anchor.y);

		const occupied = getOccupiedIndustryTileIds(city, [foreignBuilding]);

		expect(occupied.size).toBe(0);
	});

	test('skips buildings whose anchor tile cannot be resolved by id or coordinate', () => {
		expect.assertions(2);
		const city = makeCity('alpha', 4, 4);
		const lookup = createIndustryTileLookup(city);
		const missingIdBuilding = makeBuilding(city.id, 'alpha-99-99', 99, 99);
		const missingCoordBuilding = makeBuilding(city.id, 'alpha-88-88', 88, 88);

		const occupied = getOccupiedIndustryTileIds(
			city,
			[missingIdBuilding, missingCoordBuilding],
			lookup
		);

		expect(occupied.size).toBe(0);
		expect(getOccupiedIndustryTileIds(city, [missingIdBuilding, missingCoordBuilding])).toEqual(
			occupied
		);
	});

	test('falls back to coordinate lookup when the tile id is absent but coordinates match', () => {
		expect.assertions(1);
		const city = makeCity('alpha', 4, 4);
		const anchor = city.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;
		const coordinateOnlyBuilding = makeBuilding(city.id, 'stale-id', anchor.x, anchor.y);

		const occupied = getOccupiedIndustryTileIds(city, [coordinateOnlyBuilding]);

		expect(occupied.size).toBe(4);
	});
});

describe('isTileInIndustryBuildingFootprint', () => {
	const building = { mapX: 2, mapY: 2 } as Pick<IndustrialBuilding, 'mapX' | 'mapY'>;

	test('returns true for tiles inside the 2x2 footprint', () => {
		expect.assertions(4);
		expect(isTileInIndustryBuildingFootprint({ x: 2, y: 2 }, building)).toBe(true);
		expect(isTileInIndustryBuildingFootprint({ x: 3, y: 2 }, building)).toBe(true);
		expect(isTileInIndustryBuildingFootprint({ x: 2, y: 3 }, building)).toBe(true);
		expect(isTileInIndustryBuildingFootprint({ x: 3, y: 3 }, building)).toBe(true);
	});

	test('returns false for tiles outside the footprint bounds', () => {
		expect.assertions(4);
		expect(isTileInIndustryBuildingFootprint({ x: 1, y: 2 }, building)).toBe(false);
		expect(isTileInIndustryBuildingFootprint({ x: 4, y: 2 }, building)).toBe(false);
		expect(isTileInIndustryBuildingFootprint({ x: 2, y: 1 }, building)).toBe(false);
		expect(isTileInIndustryBuildingFootprint({ x: 2, y: 4 }, building)).toBe(false);
	});

	test('treats the anchor tile as inside the footprint (parity with retail inspector)', () => {
		expect.assertions(1);
		expect(
			isTileInIndustryBuildingFootprint({ x: building.mapX, y: building.mapY }, building)
		).toBe(true);
	});
});
