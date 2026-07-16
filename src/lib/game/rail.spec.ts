import { describe, expect, it } from 'vitest';
import {
	buildRailNetwork,
	consumeRailBudget,
	createRailBudget,
	deriveRailSegments,
	findShippingPath,
	getBuildingAttachCellKeys,
	getPathCapacity,
	getRailNeighborKeys,
	getSegmentsForCell,
	isJunctionKey,
	railCellKey
} from './rail';
import type { IndustrialBuilding, IndustryCity, RailCell } from './types';

function makeCity(rails: RailCell[]): IndustryCity {
	return { id: 'test-city', name: 'Test', width: 20, height: 20, tiles: [], rails };
}

function makeBuilding(id: string, mapX: number, mapY: number): IndustrialBuilding {
	return makeBuildingInCity(id, 'test-city', mapX, mapY);
}

function makeBuildingInCity(
	id: string,
	cityId: string,
	mapX: number,
	mapY: number
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

function straightRails(y: number, fromX: number, toX: number, level = 1): RailCell[] {
	const cells: RailCell[] = [];
	for (let x = fromX; x <= toX; x += 1) cells.push({ x, y, level });
	return cells;
}

describe('rail network', () => {
	it('indexes cells by coordinate key', () => {
		const network = buildRailNetwork(makeCity([{ x: 3, y: 4, level: 2 }]));
		expect(network.cells.get(railCellKey(3, 4))?.level).toBe(2);
	});

	it('returns neighbors in N,E,S,W order', () => {
		const network = buildRailNetwork(
			makeCity([
				{ x: 5, y: 5, level: 1 },
				{ x: 5, y: 4, level: 1 }, // N
				{ x: 6, y: 5, level: 1 }, // E
				{ x: 5, y: 6, level: 1 }, // S
				{ x: 4, y: 5, level: 1 } // W
			])
		);
		expect(getRailNeighborKeys(network, 5, 5)).toEqual(['5,4', '6,5', '5,6', '4,5']);
	});

	it('finds attach cells around a 2x2 footprint sorted by (y,x)', () => {
		// Building at (10,10) covers (10,10),(11,10),(10,11),(11,11).
		const network = buildRailNetwork(
			makeCity([
				{ x: 9, y: 10, level: 1 }, // west side
				{ x: 12, y: 11, level: 1 }, // east side
				{ x: 10, y: 9, level: 1 }, // north side
				{ x: 9, y: 9, level: 1 } // diagonal — NOT an attach cell
			])
		);
		expect(getBuildingAttachCellKeys(network, makeBuilding('b1', 10, 10))).toEqual([
			'10,9',
			'9,10',
			'12,11'
		]);
	});
});

describe('rail segments', () => {
	it('a plain line with no junctions is one segment', () => {
		const network = buildRailNetwork(makeCity(straightRails(5, 2, 9)));
		const segments = deriveRailSegments(network, []);
		expect(segments).toHaveLength(1);
		expect(segments[0]!.cellKeys).toHaveLength(8);
		expect(segments[0]!.minLevel).toBe(1);
	});

	it('a T-branch splits into three segments sharing the junction cell', () => {
		// Horizontal 2..8 at y=5, vertical branch down from (5,5) to (5,8).
		const rails = [
			...straightRails(5, 2, 8),
			{ x: 5, y: 6, level: 1 },
			{ x: 5, y: 7, level: 1 },
			{ x: 5, y: 8, level: 1 }
		];
		const network = buildRailNetwork(makeCity(rails));
		const segments = deriveRailSegments(network, []);
		expect(segments).toHaveLength(3);
		const atJunction = getSegmentsForCell(segments, 5, 5);
		expect(atJunction).toHaveLength(3);
	});

	it('a pure loop is a single ring segment', () => {
		const rails: RailCell[] = [];
		for (let x = 3; x <= 6; x += 1) rails.push({ x, y: 3, level: 1 }, { x, y: 6, level: 1 });
		for (let y = 4; y <= 5; y += 1) rails.push({ x: 3, y, level: 1 }, { x: 6, y, level: 1 });
		const network = buildRailNetwork(makeCity(rails));
		const segments = deriveRailSegments(network, []);
		expect(segments).toHaveLength(1);
		expect(segments[0]!.cellKeys).toHaveLength(12);
	});

	it('attach cells are junctions: track passing a building splits there', () => {
		const network = buildRailNetwork(makeCity(straightRails(9, 2, 12)));
		// Building at (5,10): footprint (5..6, 10..11); (5,9) and (6,9) are attach cells on the line.
		// Two junctions split the line into: (2..5,9), (6..12,9), and the (5,9)-(6,9) junction pair.
		const segments = deriveRailSegments(network, [makeBuilding('b1', 5, 10)]);
		expect(segments).toHaveLength(3);
		// (5,9) belongs to the left run and the junction-pair segment (not the right run).
		expect(getSegmentsForCell(segments, 5, 9)).toHaveLength(2);
	});

	it('a run between two separated junctions is one segment spanning both junctions', () => {
		// Two buildings on the same line create two attach-junction pairs; the
		// non-junction run between them is bounded by two junctions, exercising
		// the coveredJunctionPairs bookkeeping.
		const network = buildRailNetwork(makeCity(straightRails(5, 1, 13)));
		const segments = deriveRailSegments(network, [
			makeBuilding('b1', 3, 6), // attach cells (3,5),(4,5)
			makeBuilding('b2', 10, 6) // attach cells (10,5),(11,5)
		]);
		// The middle run (5,5)-(9,5) is bounded by junctions (4,5) and (10,5)
		// and forms one segment that includes both bounding junctions.
		const middle = segments.find(
			(segment) => segment.cellKeys.includes('5,5') && segment.cellKeys.includes('9,5')
		);
		expect(middle).toBeDefined();
		expect(middle!.cellKeys).toContain('4,5');
		expect(middle!.cellKeys).toContain('10,5');
	});

	it('buildings in a different city do not create attach junctions', () => {
		// A rail line passing a foreign-city building stays a single segment
		// because that building's attach cells are ignored.
		const network = buildRailNetwork(makeCity(straightRails(5, 2, 12)));
		const segments = deriveRailSegments(network, [
			makeBuildingInCity('foreign', 'other-city', 5, 10)
		]);
		expect(segments).toHaveLength(1);
		expect(segments[0]!.cellKeys).toHaveLength(11);
	});

	it('isJunctionKey flags attach cells and 3-way neighbors', () => {
		const rails = [
			...straightRails(5, 2, 8),
			{ x: 5, y: 6, level: 1 },
			{ x: 5, y: 7, level: 1 },
			{ x: 5, y: 8, level: 1 }
		];
		const network = buildRailNetwork(makeCity(rails));
		// (5,5) has 3 rail neighbors (E/W/S) → junction.
		expect(isJunctionKey(network, [], '5,5')).toBe(true);
		// (2,5) is a plain endpoint → not a junction.
		expect(isJunctionKey(network, [], '2,5')).toBe(false);
		// A rail cell adjacent to a building footprint is an attach junction.
		const lineNetwork = buildRailNetwork(makeCity(straightRails(9, 2, 12)));
		expect(isJunctionKey(lineNetwork, [makeBuilding('b1', 5, 10)], '5,9')).toBe(true);
	});

	it('assigns collision-free ids even when segments share a junction cell', () => {
		// T-junction: only case where the old `seg:<lowest cell>` id collided.
		const rails = [
			...straightRails(5, 2, 8),
			{ x: 5, y: 6, level: 1 },
			{ x: 5, y: 7, level: 1 },
			{ x: 5, y: 8, level: 1 }
		];
		const network = buildRailNetwork(makeCity(rails));
		const segments = deriveRailSegments(network, []);
		expect(new Set(segments.map((segment) => segment.id)).size).toBe(segments.length);
	});

	it('an isolated attach cell with no rail neighbors is still its own segment', () => {
		// Single rail cell at (5,9); building at (5,10) makes (5,9) a zero-neighbor junction.
		const network = buildRailNetwork(makeCity([{ x: 5, y: 9, level: 1 }]));
		expect(network.cells.has(railCellKey(5, 9))).toBe(true);
		const segments = deriveRailSegments(network, [makeBuilding('b1', 5, 10)]);
		expect(segments.some((segment) => segment.cellKeys.includes('5,9'))).toBe(true);
		expect(getSegmentsForCell(segments, 5, 9)).toHaveLength(1);
	});

	it('mixed-level segment reports its min level', () => {
		const rails = straightRails(5, 2, 6, 3).concat(straightRails(5, 7, 9, 1));
		const network = buildRailNetwork(makeCity(rails));
		const segments = deriveRailSegments(network, []);
		expect(segments).toHaveLength(1);
		expect(segments[0]!.minLevel).toBe(1);
	});
});

describe('rail budgets and shipping paths', () => {
	it('budget equals cell level', () => {
		const network = buildRailNetwork(
			makeCity([
				{ x: 1, y: 1, level: 1 },
				{ x: 2, y: 1, level: 3 }
			])
		);
		const budget = createRailBudget(network);
		expect(budget.remaining.get('1,1')).toBe(1);
		expect(budget.remaining.get('2,1')).toBe(3);
	});

	it('finds the shortest budget-positive path', () => {
		const network = buildRailNetwork(makeCity(straightRails(5, 2, 9)));
		const budget = createRailBudget(network);
		const path = findShippingPath(network, budget, ['2,5'], ['9,5']);
		expect(path).toEqual(['2,5', '3,5', '4,5', '5,5', '6,5', '7,5', '8,5', '9,5']);
	});

	it('path capacity is the min remaining budget along the path (bottleneck)', () => {
		const network = buildRailNetwork(
			makeCity(straightRails(5, 2, 5, 3).concat(straightRails(5, 6, 9, 1)))
		);
		const budget = createRailBudget(network);
		const path = findShippingPath(network, budget, ['2,5'], ['9,5'])!;
		expect(getPathCapacity(budget, path)).toBe(1);
	});

	it('consuming budget exhausts cells and blocks reuse', () => {
		const network = buildRailNetwork(makeCity(straightRails(5, 2, 9)));
		const budget = createRailBudget(network);
		const path = findShippingPath(network, budget, ['2,5'], ['9,5'])!;
		consumeRailBudget(budget, path, 1);
		expect(budget.remaining.get('5,5')).toBe(0);
		expect(findShippingPath(network, budget, ['2,5'], ['9,5'])).toBeNull();
	});

	it('reroutes around an exhausted trunk through a parallel line', () => {
		// Endpoints are the level-2 connectors so they survive the first
		// shipment; the level-1 trunk exhausts and the second path must
		// detour through the parallel line at y=7.
		const rails = [
			...straightRails(5, 2, 9), // trunk (level 1)
			...straightRails(7, 2, 9), // parallel line (level 1)
			{ x: 2, y: 6, level: 2 }, // west connector
			{ x: 9, y: 6, level: 2 } // east connector
		];
		const network = buildRailNetwork(makeCity(rails));
		const budget = createRailBudget(network);
		const direct = findShippingPath(network, budget, ['2,6'], ['9,6'])!;
		expect(direct.some((key) => key === '5,5')).toBe(true); // N-first BFS takes the trunk
		consumeRailBudget(budget, direct, 1);
		const detour = findShippingPath(network, budget, ['2,6'], ['9,6']);
		expect(detour).not.toBeNull();
		expect(detour!.some((key) => key === '5,7')).toBe(true);
	});

	it('returns null when no source can reach a target', () => {
		const network = buildRailNetwork(
			makeCity([...straightRails(5, 2, 4), ...straightRails(5, 7, 9)])
		);
		const budget = createRailBudget(network);
		expect(findShippingPath(network, budget, ['2,5'], ['9,5'])).toBeNull();
	});
});
