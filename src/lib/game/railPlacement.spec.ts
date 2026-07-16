import { describe, expect, it } from 'vitest';
import {
	buildRail,
	buildRailPreview,
	demolishRailSegment,
	getSegmentDemolishRefund,
	getSegmentUpgradeCost,
	upgradeRailSegment
} from './railPlacement';
import { buildRailNetwork, deriveRailSegments, parseRailCellKey, railCellKey } from './rail';
import { generateIndustryCity } from './industry';
import type { GameState, IndustrialBuilding, IndustryCity, IndustryTile, RailCell } from './types';

const CITY_ID = 'rail-city';
const SIZE = 20;

function makeTiles(blocked: ReadonlySet<string> = new Set()): IndustryTile[] {
	const tiles: IndustryTile[] = [];
	for (let y = 0; y < SIZE; y += 1) {
		for (let x = 0; x < SIZE; x += 1) {
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

function makeCity(rails: RailCell[], blocked?: ReadonlySet<string>): IndustryCity {
	return {
		id: CITY_ID,
		name: 'Rail City',
		width: SIZE,
		height: SIZE,
		tiles: makeTiles(blocked),
		rails
	};
}

function makeBuilding(id: string, mapX: number, mapY: number): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId: 'grain-farm',
		cityId: CITY_ID,
		tileId: `${CITY_ID}-${mapX}-${mapY}`,
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

function makeGame(city: IndustryCity, buildings: IndustrialBuilding[], cash = 100_000): GameState {
	return {
		cash,
		industryCities: [city],
		activeIndustryCityId: CITY_ID,
		industrialBuildings: buildings
	} as unknown as GameState;
}

function straightRails(y: number, fromX: number, toX: number, level = 1): RailCell[] {
	const cells: RailCell[] = [];
	for (let x = fromX; x <= toX; x += 1) cells.push({ x, y, level });
	return cells;
}

// First unlocked 2x2 all-industrial footprint anchor strictly east of `minX`,
// used to place a processing plant on the far side of the separator wall.
function findIndustrialAnchorEastOf(city: IndustryCity, minX: number): { x: number; y: number } {
	const byCoord = new Map(city.tiles.map((tile) => [railCellKey(tile.x, tile.y), tile]));
	const isIndustrial = (x: number, y: number): boolean => {
		const tile = byCoord.get(railCellKey(x, y));
		return !!tile && tile.terrain === 'industrial' && !tile.locked;
	};
	for (let y = 1; y < city.height - 2; y += 1) {
		for (let x = minX + 1; x < city.width - 2; x += 1) {
			if (
				isIndustrial(x, y) &&
				isIndustrial(x + 1, y) &&
				isIndustrial(x, y + 1) &&
				isIndustrial(x + 1, y + 1)
			) {
				return { x, y };
			}
		}
	}
	throw new Error('no industrial footprint east of the separator');
}

// Origin footprint (2..3, 2..3); destination footprint (10..11, 2..3).
const ORIGIN = () => makeBuilding('origin', 2, 2);
const DEST = () => makeBuilding('dest', 10, 2);

describe('buildRailPreview', () => {
	it('routes a straight new path between two buildings on empty ground', () => {
		const game = makeGame(makeCity([]), [ORIGIN(), DEST()]);
		const preview = buildRailPreview(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'dest'
		});
		expect(preview.blockReason).toBeNull();
		expect(preview.reusedCellKeys).toEqual([]);
		expect(preview.newCellKeys).toHaveLength(6);
		expect(preview.pathKeys).toHaveLength(6);
		expect(preview.cost).toBe(240);
	});

	it('reuses existing track and only charges for the new cells', () => {
		const game = makeGame(makeCity(straightRails(2, 5, 8)), [ORIGIN(), DEST()]);
		const preview = buildRailPreview(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'dest'
		});
		expect(preview.blockReason).toBeNull();
		expect(preview.newCellKeys).toHaveLength(2);
		expect(preview.cost).toBe(80);
		expect(preview.reusedCellKeys).toHaveLength(4);
		expect(new Set(preview.reusedCellKeys)).toEqual(new Set(['5,2', '6,2', '7,2', '8,2']));
	});

	it('threads the path through a waypoint south of the direct line', () => {
		const game = makeGame(makeCity([]), [ORIGIN(), DEST()]);
		const direct = buildRailPreview(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'dest'
		});
		const routed = buildRailPreview(game, {
			originBuildingId: 'origin',
			waypoints: [{ x: 7, y: 6 }],
			destinationBuildingId: 'dest'
		});
		expect(routed.blockReason).toBeNull();
		expect(routed.pathKeys).toContain('7,6');
		expect(routed.reusedCellKeys).toEqual([]);
		expect(routed.newCellKeys.length).toBeGreaterThan(direct.newCellKeys.length);
		expect(routed.cost).toBe(routed.newCellKeys.length * 40);
	});

	it('reports no valid path when the destination is walled off by blocked terrain', () => {
		const blocked = new Set(['10,1', '11,1', '10,4', '11,4', '9,2', '9,3', '12,2', '12,3']);
		const game = makeGame(makeCity([], blocked), [ORIGIN(), DEST()]);
		const preview = buildRailPreview(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'dest'
		});
		expect(preview.blockReason?.code).toBe('railNoValidPath');
		expect(preview.newCellKeys).toEqual([]);
		expect(preview.pathKeys).toEqual([]);
	});

	it('routes rail from a west-side resource extractor across the internal separator to an east-side plant', () => {
		// Acceptance for the raw -> process rail chain on a real generated city:
		// the internal separator wall keeps three crossings (industry.ts), so a
		// grain-farm on a west-side grain-field can reach a flour-mill on an
		// east-side industrial tile. buildRailPreview only reads footprint
		// geometry, so plain makeBuilding fixtures stand in for the two types.
		const width = 56;
		const height = 48;
		const city = generateIndustryCity({
			id: CITY_ID,
			name: 'Real City',
			width,
			height,
			seed: 20260512
		});
		const separatorX = Math.floor(width * 0.45);
		const grainTile = city.tiles.find((tile) => tile.resource === 'grain-field');
		expect(grainTile).toBeDefined();
		const millAnchor = findIndustrialAnchorEastOf(city, separatorX);
		const game = makeGame(city, [
			makeBuilding('farm', grainTile!.x, grainTile!.y),
			makeBuilding('mill', millAnchor.x, millAnchor.y)
		]);

		const preview = buildRailPreview(game, {
			originBuildingId: 'farm',
			waypoints: [],
			destinationBuildingId: 'mill'
		});

		expect(grainTile!.x).toBeLessThan(separatorX);
		expect(millAnchor.x).toBeGreaterThan(separatorX);
		expect(preview.blockReason).toBeNull();
		// The only passable route between the two halves is through a separator
		// crossing, so the path must include a cell at x = separatorX.
		expect(preview.pathKeys.some((key) => parseRailCellKey(key).x === separatorX)).toBe(true);
	});

	it('reports required cash when the build cost exceeds available cash', () => {
		const game = makeGame(makeCity([]), [ORIGIN(), DEST()], 100);
		const preview = buildRailPreview(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'dest'
		});
		const reason = preview.blockReason;
		expect(reason?.code).toBe('railRequiresCash');
		expect(reason && reason.code === 'railRequiresCash' ? reason.cost : null).toBe(240);
		expect(reason && reason.code === 'railRequiresCash' ? reason.cash : null).toBe(100);
	});
});

describe('buildRail', () => {
	it('leaves the state unchanged when the preview is blocked', () => {
		const game = makeGame(makeCity([]), [ORIGIN(), DEST()], 100);
		const result = buildRail(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'dest'
		});
		expect(result).toBe(game);
		expect(result.cash).toBe(100);
		expect(result.industryCities[0]!.rails).toHaveLength(0);
	});

	it('deducts the cost and appends level-1 cells', () => {
		const game = makeGame(makeCity([]), [ORIGIN(), DEST()], 1_000);
		const result = buildRail(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'dest'
		});
		expect(result.cash).toBe(760);
		const rails = result.industryCities[0]!.rails;
		expect(rails).toHaveLength(6);
		expect(rails.every((cell) => cell.level === 1)).toBe(true);
		// original state untouched (pure transition)
		expect(game.cash).toBe(1_000);
		expect(game.industryCities[0]!.rails).toHaveLength(0);
	});
});

describe('rail segment upgrade', () => {
	it('raises only the sub-target cells and charges below-target count × 30 × minLevel', () => {
		const rails: RailCell[] = [
			{ x: 2, y: 5, level: 1 },
			{ x: 3, y: 5, level: 1 },
			{ x: 4, y: 5, level: 2 },
			{ x: 5, y: 5, level: 2 },
			{ x: 6, y: 5, level: 1 }
		];
		const game = makeGame(makeCity(rails), [], 1_000);
		const network = buildRailNetwork(game.industryCities[0]!);
		const segments = deriveRailSegments(network, []);
		expect(segments).toHaveLength(1);
		const segment = segments[0]!;
		expect(segment.minLevel).toBe(1);
		expect(getSegmentUpgradeCost(segment, network)).toBe(90);

		const result = upgradeRailSegment(game, CITY_ID, segment.id);
		expect(result.cash).toBe(910);
		const levels = new Map(
			result.industryCities[0]!.rails.map((cell) => [railCellKey(cell.x, cell.y), cell.level])
		);
		expect(levels.get('2,5')).toBe(2);
		expect(levels.get('3,5')).toBe(2);
		expect(levels.get('4,5')).toBe(2);
		expect(levels.get('5,5')).toBe(2);
		expect(levels.get('6,5')).toBe(2);
		// original state untouched
		expect(game.industryCities[0]!.rails.find((cell) => cell.x === 2 && cell.y === 5)!.level).toBe(
			1
		);
	});

	it('is a no-op when the segment is already at the maximum level', () => {
		const game = makeGame(makeCity(straightRails(5, 2, 4, 5)), [], 1_000);
		const network = buildRailNetwork(game.industryCities[0]!);
		const segments = deriveRailSegments(network, []);
		const segment = segments[0]!;
		expect(segment.minLevel).toBe(5);
		const result = upgradeRailSegment(game, CITY_ID, segment.id);
		expect(result).toBe(game);
		expect(result.cash).toBe(1_000);
		expect(result.industryCities[0]!.rails.every((cell) => cell.level === 5)).toBe(true);
	});
});

describe('rail segment demolish', () => {
	it('refunds half the build cost, removes cells, and retains a shared junction cell', () => {
		const rails: RailCell[] = [
			...straightRails(5, 2, 8),
			{ x: 5, y: 6, level: 1 },
			{ x: 5, y: 7, level: 1 },
			{ x: 5, y: 8, level: 1 }
		];
		const game = makeGame(makeCity(rails), [], 1_000);
		const network = buildRailNetwork(game.industryCities[0]!);
		const segments = deriveRailSegments(network, []);
		const vertical = segments.find((segment) => segment.cellKeys.includes('5,8'))!;
		expect(vertical.cellKeys).toContain('5,5');
		expect(vertical.cellKeys).toHaveLength(4);
		expect(getSegmentDemolishRefund(vertical)).toBe(80);

		const result = demolishRailSegment(game, CITY_ID, vertical.id);
		expect(result.cash).toBe(1_080);
		const keys = new Set(
			result.industryCities[0]!.rails.map((cell) => railCellKey(cell.x, cell.y))
		);
		expect(keys.has('5,6')).toBe(false);
		expect(keys.has('5,7')).toBe(false);
		expect(keys.has('5,8')).toBe(false);
		// junction cell (5,5) still has rail neighbours (4,5) and (6,5), so it survives.
		expect(keys.has('5,5')).toBe(true);
		expect(result.industryCities[0]!.rails).toHaveLength(7);
		// original state untouched
		expect(game.industryCities[0]!.rails).toHaveLength(10);
	});
});
