import { describe, expect, it } from 'vitest';
import {
	buildRail,
	buildRailPreview,
	demolishRailSegment,
	getDemolishRemovableCellKeys,
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

	it('rejects cross-city endpoints without a path or cost', () => {
		const origin = ORIGIN();
		const dest = { ...DEST(), cityId: 'other-city' };
		const game = makeGame(makeCity([]), [origin, dest]);
		const preview = buildRailPreview(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'dest'
		});
		expect(preview.blockReason?.code).toBe('railCrossCity');
		expect(preview.pathKeys).toEqual([]);
		expect(preview.newCellKeys).toEqual([]);
		expect(preview.cost).toBe(0);
	});

	it('reports an unknown building when the origin id does not exist', () => {
		const game = makeGame(makeCity([]), [DEST()]);
		const preview = buildRailPreview(game, {
			originBuildingId: 'missing-origin',
			waypoints: [],
			destinationBuildingId: 'dest'
		});
		expect(preview.blockReason?.code).toBe('railUnknownBuilding');
		expect(preview.pathKeys).toEqual([]);
		expect(preview.cost).toBe(0);
	});

	it('reports an unknown building when the destination id does not exist', () => {
		const game = makeGame(makeCity([]), [ORIGIN()]);
		const preview = buildRailPreview(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'missing-dest'
		});
		expect(preview.blockReason?.code).toBe('railUnknownBuilding');
		expect(preview.destinationBuildingId).toBeNull();
		expect(preview.pathKeys).toEqual([]);
	});

	it('reports an unknown building when the endpoints share a city absent from the world', () => {
		// Both buildings exist and share a cityId that is absent from
		// industryCities, so the cross-city check passes but findCity returns
		// null and the preview short-circuits with an unknown-building reason.
		const origin = { ...ORIGIN(), cityId: 'missing-city' };
		const dest = { ...DEST(), cityId: 'missing-city' };
		const game = makeGame(makeCity([]), [origin, dest]);
		const preview = buildRailPreview(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'dest'
		});
		expect(preview.blockReason?.code).toBe('railUnknownBuilding');
		expect(preview.pathKeys).toEqual([]);
		expect(preview.cost).toBe(0);
	});

	it('explores forked existing track in deterministic N/E/S/W order', () => {
		// Existing rails form a cross centered at (6,4). Origin at (2,2) and
		// dest at (10,2) can both attach along y=4; from the western trunk the
		// zero-cost neighbors must be considered N then E then S then W so the
		// chosen equal-cost route is stable across runs.
		const rails: RailCell[] = [
			...straightRails(4, 4, 8),
			{ x: 6, y: 2, level: 1 },
			{ x: 6, y: 3, level: 1 },
			{ x: 6, y: 5, level: 1 },
			{ x: 6, y: 6, level: 1 }
		];
		const game = makeGame(makeCity(rails), [ORIGIN(), DEST()]);
		const first = buildRailPreview(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'dest'
		});
		const second = buildRailPreview(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'dest'
		});
		expect(first.blockReason).toBeNull();
		expect(first.pathKeys).toEqual(second.pathKeys);
		// Zero-cost neighbors are batch-prepended in N/E/S/W order, so equal-cost
		// forked exploration stays deterministic across runs.
		expect(first.pathKeys).toEqual(['4,3', '4,4', '5,4', '6,4', '7,4', '8,4', '8,3', '9,3']);
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

	it('is a no-op when cash is insufficient to cover the upgrade cost', () => {
		const rails: RailCell[] = [
			{ x: 2, y: 5, level: 1 },
			{ x: 3, y: 5, level: 1 },
			{ x: 4, y: 5, level: 2 },
			{ x: 5, y: 5, level: 2 },
			{ x: 6, y: 5, level: 1 }
		];
		const game = makeGame(makeCity(rails), [], 50);
		const network = buildRailNetwork(game.industryCities[0]!);
		const segments = deriveRailSegments(network, []);
		const segment = segments[0]!;
		expect(getSegmentUpgradeCost(segment, network)).toBe(90);
		const result = upgradeRailSegment(game, CITY_ID, segment.id);
		expect(result).toBe(game);
		expect(result.cash).toBe(50);
		expect(result.industryCities[0]!.rails.every((cell) => cell.level <= 2)).toBe(true);
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
		// Junction cell (5,5) is shared with the horizontal segment and survives,
		// so only 3 of the 4 cells are actually removable — refund is based on
		// the removable count, not the full segment length.
		const removable = getDemolishRemovableCellKeys(vertical, segments, network);
		expect(removable.size).toBe(3);
		expect(removable.has('5,5')).toBe(false);
		expect(getSegmentDemolishRefund(removable.size)).toBe(60);

		const result = demolishRailSegment(game, CITY_ID, vertical.id);
		expect(result.cash).toBe(1_060);
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

	it('is a no-op with zero refund when every cell is a shared junction', () => {
		// Two adjacent buildings whose attach cells form a chain of junction
		// pairs: (2,4)|(3,4) [building A], (3,4)|(4,4) [pair], (4,4)|(5,4)
		// [building B]. Demolishing the middle pair (3,4)|(4,4) leaves zero
		// removable cells — both cells are shared with neighbouring segments
		// and each has an outside rail neighbour — so no cells are removed and
		// no refund is issued.
		const rails: RailCell[] = straightRails(4, 2, 7);
		const buildingA = makeBuilding('building-a', 2, 2);
		const buildingB = makeBuilding('building-b', 4, 2);
		const game = makeGame(makeCity(rails), [buildingA, buildingB], 1_000);

		const network = buildRailNetwork(game.industryCities[0]!);
		const segments = deriveRailSegments(network, [buildingA, buildingB]);
		const middle = segments.find(
			(segment) => segment.cellKeys.includes('3,4') && segment.cellKeys.includes('4,4')
		)!;
		expect(middle.cellKeys).toEqual(['3,4', '4,4']);

		const removable = getDemolishRemovableCellKeys(middle, segments, network);
		expect(removable.size).toBe(0);
		expect(getSegmentDemolishRefund(removable.size)).toBe(0);

		const result = demolishRailSegment(game, CITY_ID, middle.id);
		expect(result.cash).toBe(1_000);
		expect(result.industryCities[0]!.rails).toHaveLength(rails.length);
		// original state untouched
		expect(game.cash).toBe(1_000);
	});
});
