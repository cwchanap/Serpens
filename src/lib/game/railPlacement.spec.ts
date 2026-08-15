import { describe, expect, it } from 'vitest';
import {
	buildRail,
	buildRailPreview,
	buildRailWaypointPreview,
	canRouteRailBetween,
	demolishRailSegment,
	findReachableRailCells,
	getDemolishRemovableCellKeys,
	getSegmentDemolishRefund,
	getSegmentUpgradeCost,
	isRailWaypointTarget,
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

	it('reports already connected when every cell on the path is reused track', () => {
		const game = makeGame(makeCity(straightRails(2, 4, 9)), [ORIGIN(), DEST()]);
		const preview = buildRailPreview(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'dest'
		});
		expect(preview.blockReason?.code).toBe('railAlreadyConnected');
		expect(preview.newCellKeys).toEqual([]);
		expect(preview.reusedCellKeys.length).toBeGreaterThan(0);
		expect(preview.cost).toBe(0);
	});

	it('buildRail is a no-op when already connected', () => {
		const game = makeGame(makeCity(straightRails(2, 4, 9)), [ORIGIN(), DEST()]);
		const result = buildRail(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'dest'
		});
		expect(result).toBe(game);
		expect(result.cash).toBe(game.cash);
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

	it('reuses earlier leg cells when a later waypoint backtracks through them', () => {
		// Origin at (2,2), waypoint1 at (8,2) east of origin, waypoint2 at
		// (2,8) south of origin, destination at (10,8). Leg 1 builds cells
		// from origin-adjacent to (8,2). Leg 2 from (8,2) to (2,8) backtracks
		// west through leg 1's cells — those must be reused (cost 0), not
		// rebuilt as parallel new cells.
		const dest2 = makeBuilding('dest2', 10, 8);
		const game = makeGame(makeCity([]), [ORIGIN(), dest2]);
		const preview = buildRailPreview(game, {
			originBuildingId: 'origin',
			waypoints: [
				{ x: 8, y: 2 },
				{ x: 2, y: 8 }
			],
			destinationBuildingId: 'dest2'
		});
		expect(preview.blockReason).toBeNull();
		// The path must include both waypoints.
		expect(preview.pathKeys).toContain('8,2');
		expect(preview.pathKeys).toContain('2,8');
		// newCellKeys + reusedCellKeys must equal pathKeys with no duplicates.
		const allKeys = new Set(preview.pathKeys);
		expect(preview.newCellKeys.length + preview.reusedCellKeys.length).toBe(allKeys.size);
		// The cost must be based only on new cells.
		expect(preview.cost).toBe(preview.newCellKeys.length * 40);
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

	it('rejects identical origin and destination buildings before pathing', () => {
		const game = makeGame(makeCity([]), [ORIGIN(), DEST()]);
		const preview = buildRailPreview(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'origin'
		});
		expect(preview.blockReason?.code).toBe('railSelfConnected');
		expect(preview.pathKeys).toEqual([]);
		expect(preview.newCellKeys).toEqual([]);
		expect(preview.cost).toBe(0);

		const result = buildRail(game, {
			originBuildingId: 'origin',
			waypoints: [],
			destinationBuildingId: 'origin'
		});
		expect(result).toBe(game);
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

describe('buildRailWaypointPreview', () => {
	it('returns rail-legal origin-adjacent cells when no waypoints are set', () => {
		const game = makeGame(makeCity([]), [ORIGIN()]);
		const preview = buildRailWaypointPreview(game, 'origin', []);
		expect(preview).not.toBeNull();
		expect(preview!.pathKeys.length).toBeGreaterThan(0);
		// Every cell must be adjacent to the origin footprint (2,2)-(3,3).
		for (const key of preview!.pathKeys) {
			const { x, y } = parseRailCellKey(key);
			const isAdjacent =
				(x >= 2 && x <= 3 && (y === 1 || y === 4)) || (y >= 2 && y <= 3 && (x === 1 || x === 4));
			expect(isAdjacent).toBe(true);
		}
	});

	it('threads the path from origin through waypoints', () => {
		const game = makeGame(makeCity([]), [ORIGIN()]);
		const preview = buildRailWaypointPreview(game, 'origin', [{ x: 8, y: 2 }]);
		expect(preview).not.toBeNull();
		expect(preview!.pathKeys).toContain('8,2');
		expect(preview!.newCellKeys.length).toBeGreaterThan(0);
	});

	it('returns null when a waypoint is unreachable', () => {
		// Block the entire column x=5 so the origin (at x=2-3) cannot reach
		// the waypoint at (8,2) on the far side.
		const blocked = new Set(Array.from({ length: SIZE }, (_, y) => `5,${y}`));
		const game = makeGame(makeCity([], blocked), [ORIGIN()]);
		const preview = buildRailWaypointPreview(game, 'origin', [{ x: 8, y: 2 }]);
		expect(preview).toBeNull();
	});

	it('returns null when the origin building does not exist', () => {
		const game = makeGame(makeCity([]), [ORIGIN()]);
		const preview = buildRailWaypointPreview(game, 'nonexistent', []);
		expect(preview).toBeNull();
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

describe('isRailWaypointTarget', () => {
	it('accepts an existing rail cell', () => {
		expect.assertions(1);
		const game = makeGame(makeCity(straightRails(2, 4, 8)), []);
		expect(isRailWaypointTarget(game, CITY_ID, 5, 2)).toBe(true);
	});

	it('accepts a rail-legal empty industrial tile', () => {
		expect.assertions(1);
		const game = makeGame(makeCity([]), []);
		expect(isRailWaypointTarget(game, CITY_ID, 6, 6)).toBe(true);
	});

	it('rejects a blocked tile', () => {
		expect.assertions(1);
		const game = makeGame(makeCity([], new Set(['7,7'])), []);
		expect(isRailWaypointTarget(game, CITY_ID, 7, 7)).toBe(false);
	});

	it('rejects a locked tile', () => {
		expect.assertions(1);
		const city = makeCity([]);
		const tile = city.tiles.find((candidate) => candidate.x === 6 && candidate.y === 6)!;
		city.tiles = city.tiles.map((candidate) =>
			candidate.id === tile.id ? { ...candidate, locked: true } : candidate
		);
		const game = makeGame(city, []);
		expect(isRailWaypointTarget(game, CITY_ID, 6, 6)).toBe(false);
	});

	it('rejects a tile occupied by a building footprint', () => {
		expect.assertions(1);
		// ORIGIN() sits at (2,2); its 2x2 footprint covers (2,2),(3,2),(2,3),(3,3).
		const game = makeGame(makeCity([]), [ORIGIN()]);
		expect(isRailWaypointTarget(game, CITY_ID, 2, 2)).toBe(false);
	});

	it('returns false when the city does not exist', () => {
		expect.assertions(1);
		const game = makeGame(makeCity([]), []);
		expect(isRailWaypointTarget(game, 'missing-city', 6, 6)).toBe(false);
	});

	it('returns false for an out-of-bounds waypoint target', () => {
		// Out-of-bounds coordinates are not part of the city, so they are
		// rejected — including non-rail waypoint targets.
		expect.assertions(1);
		const game = makeGame(makeCity([]), []);
		const result = isRailWaypointTarget(game, CITY_ID, -1, -1);
		expect(result).toBe(false);
	});
});

describe('findReachableRailCells', () => {
	it('returns all cells reachable via existing rail and legal empty tiles', () => {
		expect.assertions(3);
		// Rail at y=4 from x=2 to x=8. Source at (2, 4) (existing rail).
		// The BFS should follow existing rail (cost 0) and expand into
		// adjacent legal empty tiles (cost 1).
		const city = makeCity(horizontalRails(2, 8, 4));
		const game = makeGame(city, []);
		const reachable = findReachableRailCells(game, CITY_ID, [{ x: 2, y: 4 }]);
		// Existing rail cells are reachable.
		expect(reachable.has(railCellKey(5, 4))).toBe(true);
		// Adjacent legal empty tiles are reachable.
		expect(reachable.has(railCellKey(5, 3))).toBe(true);
		// Tiles blocked by a building footprint are NOT reachable.
		const gameWithBuilding = makeGame(city, [ORIGIN()]);
		const reachableWithBuilding = findReachableRailCells(gameWithBuilding, CITY_ID, [
			{ x: 10, y: 10 }
		]);
		expect(reachableWithBuilding.has(railCellKey(2, 2))).toBe(false);
	});

	it('routes through empty legal tiles even with no existing rail', () => {
		expect.assertions(2);
		// No existing rail. Source at (5, 5). All tiles are industrial
		// (legal for rail). The BFS should expand through empty tiles.
		const city = makeCity([]);
		const game = makeGame(city, []);
		const reachable = findReachableRailCells(game, CITY_ID, [{ x: 5, y: 5 }]);
		// Nearby tiles are reachable via future rail.
		expect(reachable.has(railCellKey(6, 5))).toBe(true);
		expect(reachable.has(railCellKey(10, 10))).toBe(true);
	});

	it('does not route through blocked terrain', () => {
		expect.assertions(2);
		// Create a wall of blocked tiles at x=10 from y=0 to y=19.
		const blocked = new Set<string>();
		for (let y = 0; y < SIZE; y += 1) {
			blocked.add(railCellKey(10, y));
		}
		const city = makeCity([], blocked);
		const game = makeGame(city, []);
		// Source at (5, 5) (left of the wall).
		const reachable = findReachableRailCells(game, CITY_ID, [{ x: 5, y: 5 }]);
		// Tiles on the left side are reachable.
		expect(reachable.has(railCellKey(8, 5))).toBe(true);
		// Tiles on the right side are NOT reachable (wall blocks the path).
		expect(reachable.has(railCellKey(12, 5))).toBe(false);
	});

	it('returns empty set when the city does not exist', () => {
		expect.assertions(1);
		const game = makeGame(makeCity([]), []);
		const reachable = findReachableRailCells(game, 'missing-city', [{ x: 5, y: 5 }]);
		expect(reachable.size).toBe(0);
	});
});

describe('canRouteRailBetween', () => {
	it('returns true when a future rail path exists through empty legal tiles', () => {
		expect.assertions(1);
		// No existing rail. Two buildings on opposite sides of the grid.
		// canRouteRailBetween should find a path through empty industrial tiles.
		const game = makeGame(makeCity([]), [ORIGIN(), DEST()]);
		const result = canRouteRailBetween(
			game,
			CITY_ID,
			[
				{ x: 1, y: 2 },
				{ x: 1, y: 3 }
			],
			[
				{ x: 9, y: 2 },
				{ x: 9, y: 3 }
			]
		);
		expect(result).toBe(true);
	});

	it('returns true when routing through existing rail cells', () => {
		expect.assertions(1);
		// Existing rail connects the two buildings' adjacent cells.
		const game = makeGame(makeCity(straightRails(2, 4, 9)), [ORIGIN(), DEST()]);
		const result = canRouteRailBetween(
			game,
			CITY_ID,
			[
				{ x: 4, y: 2 },
				{ x: 4, y: 3 }
			],
			[
				{ x: 9, y: 2 },
				{ x: 9, y: 3 }
			]
		);
		expect(result).toBe(true);
	});

	it('returns false when a blocked terrain wall separates the endpoints', () => {
		expect.assertions(1);
		// Block the entire column x=5 so no path can cross.
		const blocked = new Set(Array.from({ length: SIZE }, (_, y) => `5,${y}`));
		const game = makeGame(makeCity([], blocked), [ORIGIN(), DEST()]);
		const result = canRouteRailBetween(
			game,
			CITY_ID,
			[
				{ x: 4, y: 2 },
				{ x: 4, y: 3 }
			],
			[
				{ x: 6, y: 2 },
				{ x: 6, y: 3 }
			]
		);
		expect(result).toBe(false);
	});

	it('returns false when the city does not exist', () => {
		expect.assertions(1);
		const game = makeGame(makeCity([]), []);
		const result = canRouteRailBetween(game, 'missing-city', [{ x: 0, y: 0 }], [{ x: 1, y: 0 }]);
		expect(result).toBe(false);
	});

	it('returns false when no source cell is rail-legal', () => {
		expect.assertions(1);
		// All source cells are blocked.
		const blocked = new Set(['0,0', '0,1']);
		const game = makeGame(makeCity([], blocked), []);
		const result = canRouteRailBetween(
			game,
			CITY_ID,
			[
				{ x: 0, y: 0 },
				{ x: 0, y: 1 }
			],
			[{ x: 5, y: 5 }]
		);
		expect(result).toBe(false);
	});

	it('returns true when source and target share a rail-legal cell', () => {
		expect.assertions(1);
		// Source and target overlap on the same legal tile.
		const game = makeGame(makeCity([]), []);
		const result = canRouteRailBetween(game, CITY_ID, [{ x: 5, y: 5 }], [{ x: 5, y: 5 }]);
		expect(result).toBe(true);
	});
});

function horizontalRails(fromX: number, toX: number, y = 4): RailCell[] {
	return Array.from({ length: toX - fromX + 1 }, (_, index) => ({
		x: fromX + index,
		y,
		level: 1
	}));
}
