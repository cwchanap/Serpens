import { describe, expect, it } from 'vitest';
import { inventoryUsed } from './buildingInventory';
import {
	buildRailNetwork,
	consumeRailBudget,
	createRailBudget,
	deriveRailSegments,
	findShippingPath,
	getPathCapacity,
	parseRailCellKey,
	railCellKey,
	type RailNetwork,
	type RailSegment
} from './rail';
import {
	buildRailWaypointPreview,
	demolishRailSegment,
	getDemolishRemovableCellKeys,
	getSegmentUpgradeCost,
	upgradeRailSegment
} from './railPlacement';
import type { GameState, IndustrialBuilding, IndustryCity, IndustryTile, RailCell } from './types';

const CITY_ID = 'coverage-city';

function makeTiles(width = 8, height = 8, blocked = new Set<string>()): IndustryTile[] {
	const tiles: IndustryTile[] = [];
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			tiles.push({
				id: `${CITY_ID}-${x}-${y}`,
				cityId: CITY_ID,
				x,
				y,
				terrain: blocked.has(railCellKey(x, y)) ? 'blocked' : 'industrial',
				resource: null,
				locked: false
			});
		}
	}
	return tiles;
}

function makeCity(rails: RailCell[] = [], blocked = new Set<string>(), id = CITY_ID): IndustryCity {
	return {
		id,
		name: id,
		width: 8,
		height: 8,
		tiles: makeTiles(8, 8, blocked).map((tile) => ({
			...tile,
			id: `${id}-${tile.x}-${tile.y}`,
			cityId: id
		})),
		rails
	};
}

function makeBuilding(
	id: string,
	mapX: number,
	mapY: number,
	cityId = CITY_ID
): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId: 'grain-farm',
		cityId,
		tileId: `${cityId}-${mapX}-${mapY}`,
		mapX,
		mapY,
		status: 'idle',
		inventory: {},
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0
	};
}

function makeGame(
	cities: IndustryCity[],
	buildings: IndustrialBuilding[],
	cash = 1_000
): GameState {
	return {
		cash,
		industryCities: cities,
		activeIndustryCityId: cities[0]?.id ?? CITY_ID,
		industrialBuildings: buildings
	} as unknown as GameState;
}

function line(y: number, fromX: number, toX: number, level = 1): RailCell[] {
	return Array.from({ length: toX - fromX + 1 }, (_, index) => ({
		x: fromX + index,
		y,
		level
	}));
}

describe('rail utility coverage', () => {
	it('handles missing coordinates and undefined inventory quantities', () => {
		expect(parseRailCellKey('7')).toEqual({ x: 7, y: 0 });
		expect(inventoryUsed({ grain: undefined })).toBe(0);
	});

	it('filters invalid and duplicate roots while allowing a root target', () => {
		const city = makeCity(line(2, 1, 3));
		const network = buildRailNetwork(city);
		const budget = createRailBudget(network);
		budget.remaining.set('1,2', 0);

		expect(findShippingPath(network, budget, ['missing', '1,2', '2,2', '2,2'], ['2,2'])).toEqual([
			'2,2'
		]);
	});

	it('ignores exhausted and already-visited neighbors during BFS', () => {
		const city = makeCity([
			{ x: 1, y: 1, level: 1 },
			{ x: 2, y: 1, level: 1 },
			{ x: 1, y: 2, level: 1 },
			{ x: 2, y: 2, level: 1 }
		]);
		const network = buildRailNetwork(city);
		const budget = createRailBudget(network);
		budget.remaining.set('2,1', 0);

		expect(findShippingPath(network, budget, ['1,1'], ['2,2'])).toEqual(['1,1', '1,2', '2,2']);
	});

	it('covers empty and missing-key budget fallbacks', () => {
		const budget = { remaining: new Map<string, number>() };
		expect(getPathCapacity(budget, [])).toBe(Number.POSITIVE_INFINITY);
		expect(getPathCapacity(budget, ['missing'])).toBe(0);
		consumeRailBudget(budget, ['missing'], 3);
		expect(budget.remaining.get('missing')).toBe(0);
	});
});

describe('rail placement guard coverage', () => {
	it('returns null when a waypoint preview building references a missing city', () => {
		const building = makeBuilding('origin', 2, 2, 'missing-city');
		const game = makeGame([makeCity()], [building]);
		expect(buildRailWaypointPreview(game, building.id, [{ x: 4, y: 4 }])).toBeNull();
	});

	it('skips blocked origin attachment seeds and routes from a remaining legal seed', () => {
		const blocked = new Set(['2,1', '3,1', '1,2', '1,3', '2,4', '3,4', '4,3']);
		const origin = makeBuilding('origin', 2, 2);
		const game = makeGame([makeCity([], blocked)], [origin]);
		const preview = buildRailWaypointPreview(game, origin.id, [{ x: 6, y: 2 }]);

		expect(preview).not.toBeNull();
		expect(preview?.pathKeys.at(0)).toBe('4,2');
		expect(preview?.pathKeys).toContain('6,2');
	});

	it('uses the max-level fallback for segment cells absent from the network', () => {
		const network: RailNetwork = { cityId: CITY_ID, cells: new Map() };
		const segment: RailSegment = {
			id: 'seg:missing',
			cellKeys: ['9,9'],
			minLevel: 1
		};
		expect(getSegmentUpgradeCost(segment, network)).toBe(0);
	});

	it('no-ops upgrades for missing cities and unknown segments', () => {
		const city = makeCity(line(2, 1, 3));
		const game = makeGame([city], []);
		expect(upgradeRailSegment(game, 'missing-city', 'seg:any')).toBe(game);
		expect(upgradeRailSegment(game, city.id, 'seg:unknown')).toBe(game);
	});

	it('no-ops demolition for missing cities and unknown segments', () => {
		const city = makeCity(line(2, 1, 3));
		const game = makeGame([city], []);
		expect(demolishRailSegment(game, 'missing-city', 'seg:any')).toBe(game);
		expect(demolishRailSegment(game, city.id, 'seg:unknown')).toBe(game);
	});

	it('keeps an unshared cell removable when unrelated segments do not contain it', () => {
		const city = makeCity(line(2, 1, 3));
		const network = buildRailNetwork(city);
		const segments = deriveRailSegments(network, []);
		const segment = segments[0]!;
		const unrelated: RailSegment = {
			id: 'seg:other',
			cellKeys: ['7,7'],
			minLevel: 1
		};
		const removable = getDemolishRemovableCellKeys(segment, [segment, unrelated], network);
		expect(removable).toEqual(new Set(segment.cellKeys));
	});
});
