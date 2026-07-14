import {
	INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT,
	INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH
} from './industryFootprint';
import type { IndustrialBuilding, IndustryCity, RailCell } from './types';

export const RAIL_MAX_LEVEL = 5;
export const RAIL_BUILD_COST_PER_CELL = 40;
export const RAIL_UPGRADE_COST_PER_CELL_PER_LEVEL = 30;
export const RAIL_DEMOLISH_REFUND_RATIO = 0.5;

// Neighbor offsets in fixed N, E, S, W order. This ordering is the
// determinism contract for every BFS in the rail system — do not reorder.
const NEIGHBOR_OFFSETS = [
	{ dx: 0, dy: -1 },
	{ dx: 1, dy: 0 },
	{ dx: 0, dy: 1 },
	{ dx: -1, dy: 0 }
] as const;

export function railCellKey(x: number, y: number): string {
	return `${x},${y}`;
}

export function railUsageKey(cityId: string, x: number, y: number): string {
	return `${cityId}:${x},${y}`;
}

export function parseRailCellKey(key: string): { x: number; y: number } {
	const [x, y] = key.split(',').map(Number);
	return { x: x ?? 0, y: y ?? 0 };
}

export interface RailNetwork {
	cityId: string;
	cells: ReadonlyMap<string, RailCell>;
}

export function buildRailNetwork(city: IndustryCity): RailNetwork {
	const cells = new Map<string, RailCell>();

	for (const cell of city.rails) {
		cells.set(railCellKey(cell.x, cell.y), cell);
	}

	return { cityId: city.id, cells };
}

export function getRailNeighborKeys(network: RailNetwork, x: number, y: number): string[] {
	const keys: string[] = [];

	for (const offset of NEIGHBOR_OFFSETS) {
		const key = railCellKey(x + offset.dx, y + offset.dy);

		if (network.cells.has(key)) {
			keys.push(key);
		}
	}

	return keys;
}

export function getFootprintAdjacentCoords(
	building: Pick<IndustrialBuilding, 'mapX' | 'mapY'>
): Array<{ x: number; y: number }> {
	const coords: Array<{ x: number; y: number }> = [];
	const left = building.mapX;
	const top = building.mapY;
	const right = left + INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH - 1;
	const bottom = top + INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT - 1;

	for (let x = left; x <= right; x += 1) {
		coords.push({ x, y: top - 1 }, { x, y: bottom + 1 });
	}

	for (let y = top; y <= bottom; y += 1) {
		coords.push({ x: left - 1, y }, { x: right + 1, y });
	}

	return coords.sort((first, second) => first.y - second.y || first.x - second.x);
}

export function getBuildingAttachCellKeys(
	network: RailNetwork,
	building: Pick<IndustrialBuilding, 'mapX' | 'mapY'>
): string[] {
	return getFootprintAdjacentCoords(building)
		.map((coord) => railCellKey(coord.x, coord.y))
		.filter((key) => network.cells.has(key));
}

export interface RailSegment {
	id: string; // seg: + full sorted cellKeys joined with '|' (collision-free)
	cellKeys: string[];
	minLevel: number;
}

function collectAttachKeys(
	network: RailNetwork,
	buildings: readonly IndustrialBuilding[]
): Set<string> {
	const attach = new Set<string>();

	for (const building of buildings) {
		if (building.cityId !== network.cityId) {
			continue;
		}

		for (const key of getBuildingAttachCellKeys(network, building)) {
			attach.add(key);
		}
	}

	return attach;
}

export function isJunctionKey(
	network: RailNetwork,
	buildings: readonly IndustrialBuilding[],
	key: string
): boolean {
	const attach = collectAttachKeys(network, buildings);
	return isJunction(network, attach, key);
}

function isJunction(network: RailNetwork, attachKeys: ReadonlySet<string>, key: string): boolean {
	if (attachKeys.has(key)) {
		return true;
	}

	const { x, y } = parseRailCellKey(key);
	return getRailNeighborKeys(network, x, y).length >= 3;
}

function compareKeys(first: string, second: string): number {
	const a = parseRailCellKey(first);
	const b = parseRailCellKey(second);
	return a.y - b.y || a.x - b.x;
}

/**
 * Segment topology: a cell is a junction iff it has 3+ rail neighbors OR it
 * is an attach cell of any building (orthogonally adjacent to a 2x2
 * footprint of a building in this city).
 *
 * Segments = connected components of the network after removing junction
 * cells, each extended with its adjacent junction cells; additionally every
 * orthogonally-adjacent pair of junction cells that is not already covered
 * by a shared component forms its own 2-cell segment. A component with no
 * adjacent junctions (isolated run or pure loop) is a segment by itself.
 * Finally, any rail cell still uncovered — a zero-neighbor junction such as a
 * lone attach cell beside a factory — becomes its own 1-cell segment, so the
 * invariant "every rail cell belongs to >= 1 segment" always holds.
 * Segment id = `seg:` + the full sorted cellKeys joined with '|' (unique
 * per segment: interior cells belong to exactly one segment and junction
 * pairs are emitted once).
 */
export function deriveRailSegments(
	network: RailNetwork,
	buildings: readonly IndustrialBuilding[]
): RailSegment[] {
	const attachKeys = collectAttachKeys(network, buildings);
	const junctionKeys = new Set<string>();

	for (const key of network.cells.keys()) {
		if (isJunction(network, attachKeys, key)) {
			junctionKeys.add(key);
		}
	}

	const visited = new Set<string>();
	const segments: RailSegment[] = [];
	const coveredJunctionPairs = new Set<string>();
	const orderedKeys = [...network.cells.keys()].sort(compareKeys);

	for (const startKey of orderedKeys) {
		if (junctionKeys.has(startKey) || visited.has(startKey)) {
			continue;
		}

		// Flood the non-junction component.
		const componentKeys: string[] = [];
		const boundingJunctions = new Set<string>();
		const queue = [startKey];
		visited.add(startKey);

		while (queue.length > 0) {
			const key = queue.shift()!;
			componentKeys.push(key);
			const { x, y } = parseRailCellKey(key);

			for (const neighborKey of getRailNeighborKeys(network, x, y)) {
				if (junctionKeys.has(neighborKey)) {
					boundingJunctions.add(neighborKey);
				} else if (!visited.has(neighborKey)) {
					visited.add(neighborKey);
					queue.push(neighborKey);
				}
			}
		}

		for (const junctionA of boundingJunctions) {
			for (const junctionB of boundingJunctions) {
				if (junctionA < junctionB) {
					coveredJunctionPairs.add(`${junctionA}|${junctionB}`);
				}
			}
		}

		segments.push(makeSegment(network, [...componentKeys, ...boundingJunctions]));
	}

	// Directly-adjacent junction pairs with no interior component between them.
	for (const key of [...junctionKeys].sort(compareKeys)) {
		const { x, y } = parseRailCellKey(key);

		for (const neighborKey of getRailNeighborKeys(network, x, y)) {
			if (!junctionKeys.has(neighborKey) || key >= neighborKey) {
				continue;
			}

			const pair = `${key}|${neighborKey}`;

			if (!coveredJunctionPairs.has(pair)) {
				coveredJunctionPairs.add(pair);
				segments.push(makeSegment(network, [key, neighborKey]));
			}
		}
	}

	// Any cell still uncovered is a zero-neighbor junction (e.g. a lone attach
	// cell next to a factory): emit it as its own 1-cell segment so that every
	// rail cell belongs to at least one segment.
	const coveredKeys = new Set(segments.flatMap((segment) => segment.cellKeys));

	for (const key of orderedKeys) {
		if (!coveredKeys.has(key)) {
			segments.push(makeSegment(network, [key]));
		}
	}

	return segments.sort((first, second) => compareKeys(first.cellKeys[0]!, second.cellKeys[0]!));
}

function makeSegment(network: RailNetwork, keys: string[]): RailSegment {
	const cellKeys = [...new Set(keys)].sort(compareKeys);
	const minLevel = cellKeys.reduce(
		(min, key) => Math.min(min, network.cells.get(key)?.level ?? 1),
		RAIL_MAX_LEVEL
	);

	return { id: `seg:${cellKeys.join('|')}`, cellKeys, minLevel };
}

export function getSegmentsForCell(
	segments: readonly RailSegment[],
	x: number,
	y: number
): RailSegment[] {
	const key = railCellKey(x, y);
	return segments.filter((segment) => segment.cellKeys.includes(key));
}

export interface RailBudget {
	remaining: Map<string, number>; // cellKey → units left today
}

export function createRailBudget(network: RailNetwork): RailBudget {
	const remaining = new Map<string, number>();

	for (const [key, cell] of network.cells) {
		remaining.set(key, cell.level);
	}

	return { remaining };
}

/**
 * BFS through budget-positive cells only. `fromKeys` are the search roots
 * (distance 0); returns the first path reaching any `toKey`, or null.
 * Deterministic: roots enqueued in given order, neighbors expanded N,E,S,W
 * (see NEIGHBOR_OFFSETS), frontier visited in insertion order.
 */
export function findShippingPath(
	network: RailNetwork,
	budget: RailBudget,
	fromKeys: readonly string[],
	toKeys: readonly string[]
): string[] | null {
	const targets = new Set(toKeys);
	const cameFrom = new Map<string, string | null>();
	const queue: string[] = [];

	for (const key of fromKeys) {
		if ((budget.remaining.get(key) ?? 0) > 0 && !cameFrom.has(key)) {
			cameFrom.set(key, null);
			queue.push(key);
		}
	}

	while (queue.length > 0) {
		const key = queue.shift()!;

		if (targets.has(key)) {
			const path: string[] = [];
			let cursor: string | null = key;

			while (cursor !== null) {
				path.unshift(cursor);
				cursor = cameFrom.get(cursor) ?? null;
			}

			return path;
		}

		const { x, y } = parseRailCellKey(key);

		for (const neighborKey of getRailNeighborKeys(network, x, y)) {
			if (!cameFrom.has(neighborKey) && (budget.remaining.get(neighborKey) ?? 0) > 0) {
				cameFrom.set(neighborKey, key);
				queue.push(neighborKey);
			}
		}
	}

	return null;
}

// Bottleneck capacity model: the path's capacity is the minimum remaining
// budget over its cells, not the sum — one exhausted cell caps the whole path.
export function getPathCapacity(budget: RailBudget, path: readonly string[]): number {
	return path.reduce(
		(min, key) => Math.min(min, budget.remaining.get(key) ?? 0),
		Number.POSITIVE_INFINITY
	);
}

export function consumeRailBudget(
	budget: RailBudget,
	path: readonly string[],
	units: number
): void {
	for (const key of path) {
		budget.remaining.set(key, Math.max(0, (budget.remaining.get(key) ?? 0) - units));
	}
}
