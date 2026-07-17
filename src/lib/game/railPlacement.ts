import {
	decisionContextRailCrossCity,
	decisionContextRailNoValidPath,
	decisionContextRailRequiresCash,
	decisionContextRailUnknownBuilding,
	type DecisionContext
} from './decisionContext';
import { toCoordinateKey } from './footprintHelpers';
import {
	createIndustryTileLookup,
	getOccupiedIndustryTileIds,
	type IndustryTileLookup
} from './industryFootprint';
import {
	buildRailNetwork,
	deriveRailSegments,
	getFootprintAdjacentCoords,
	getRailNeighborKeys,
	parseRailCellKey,
	railCellKey,
	RAIL_BUILD_COST_PER_CELL,
	RAIL_DEMOLISH_REFUND_RATIO,
	RAIL_MAX_LEVEL,
	RAIL_UPGRADE_COST_PER_CELL_PER_LEVEL,
	type RailNetwork,
	type RailSegment
} from './rail';
import type { GameState, IndustrialBuilding, IndustryCity, RailCell } from './types';

export interface RailBuildInput {
	originBuildingId: string;
	waypoints: Array<{ x: number; y: number }>;
	destinationBuildingId: string;
}

export interface RailBuildPreview {
	originBuildingId: string;
	waypoints: Array<{ x: number; y: number }>;
	destinationBuildingId: string | null;
	pathKeys: string[]; // full path, cell keys
	newCellKeys: string[];
	reusedCellKeys: string[];
	cost: number; // newCellKeys.length * RAIL_BUILD_COST_PER_CELL
	blockReason: DecisionContext | null;
}

// Neighbor offsets in fixed N, E, S, W order — the determinism contract shared
// with rail.ts NEIGHBOR_OFFSETS. Do not reorder: the 0/1-BFS below relies on it.
const NEIGHBOR_OFFSETS = [
	{ dx: 0, dy: -1 },
	{ dx: 1, dy: 0 },
	{ dx: 0, dy: 1 },
	{ dx: -1, dy: 0 }
] as const;

interface RailPathContext {
	lookup: IndustryTileLookup;
	occupiedTileIds: ReadonlySet<string>;
	railKeys: ReadonlySet<string>;
}

/**
 * A tile is rail-legal when it exists in the city, is not blocked terrain, is
 * not locked, and is not occupied by a building footprint. Existing rail cells
 * are always traversable for pathing regardless of tile legality (they are
 * already built) — that is handled by `cellCost`, not here.
 */
function isRailLegalTile(
	lookup: IndustryTileLookup,
	occupiedTileIds: ReadonlySet<string>,
	x: number,
	y: number
): boolean {
	const tile = lookup.byCoordinate.get(toCoordinateKey(x, y));
	if (!tile) return false;
	if (tile.terrain === 'blocked') return false;
	if (tile.locked) return false;
	return !occupiedTileIds.has(tile.id);
}

/**
 * Cost of moving onto (x, y): 0 for an existing rail cell, 1 for a rail-legal
 * empty tile, `null` for an impassable coordinate.
 */
function cellCost(ctx: RailPathContext, x: number, y: number): number | null {
	const key = railCellKey(x, y);
	if (ctx.railKeys.has(key)) return 0;
	if (isRailLegalTile(ctx.lookup, ctx.occupiedTileIds, x, y)) return 1;
	return null;
}

interface DequeEntry {
	key: string;
	distance: number;
}

/**
 * 0/1-cost BFS (Dijkstra with weights 0/1) over grid coordinates. Moving onto
 * an existing rail cell costs 0, onto a rail-legal empty tile costs 1. Sources
 * are seeded with their own cell cost; cost-0 relaxations push to the FRONT of
 * the deque, cost-1 relaxations push to the BACK. Returns the shortest path of
 * cell keys from a source to any target, or null when none is reachable.
 */
function findLegPath(
	ctx: RailPathContext,
	sourceKeys: readonly string[],
	targetKeys: ReadonlySet<string>
): string[] | null {
	const distance = new Map<string, number>();
	const cameFrom = new Map<string, string | null>();
	const deque: DequeEntry[] = [];

	const zeroCostSeeds: DequeEntry[] = [];
	for (const key of sourceKeys) {
		const { x, y } = parseRailCellKey(key);
		const seed = cellCost(ctx, x, y);
		if (seed === null) continue;
		if (seed < (distance.get(key) ?? Number.POSITIVE_INFINITY)) {
			distance.set(key, seed);
			cameFrom.set(key, null);
			if (seed === 0) zeroCostSeeds.push({ key, distance: seed });
			else deque.push({ key, distance: seed });
		}
	}
	// Prepend zero-cost seeds as a batch so NEIGHBOR_OFFSETS / source order is
	// preserved (per-entry unshift would reverse it).
	deque.unshift(...zeroCostSeeds);

	while (deque.length > 0) {
		const { key, distance: popped } = deque.shift()!;
		if (popped > (distance.get(key) ?? Number.POSITIVE_INFINITY)) continue; // stale entry

		if (targetKeys.has(key)) {
			const path: string[] = [];
			let cursor: string | null = key;
			while (cursor !== null) {
				path.unshift(cursor);
				cursor = cameFrom.get(cursor) ?? null;
			}
			return path;
		}

		const { x, y } = parseRailCellKey(key);
		const zeroCostNeighbors: DequeEntry[] = [];
		for (const offset of NEIGHBOR_OFFSETS) {
			const nx = x + offset.dx;
			const ny = y + offset.dy;
			const step = cellCost(ctx, nx, ny);
			if (step === null) continue;
			const neighborKey = railCellKey(nx, ny);
			const next = popped + step;
			if (next < (distance.get(neighborKey) ?? Number.POSITIVE_INFINITY)) {
				distance.set(neighborKey, next);
				cameFrom.set(neighborKey, key);
				if (step === 0) zeroCostNeighbors.push({ key: neighborKey, distance: next });
				else deque.push({ key: neighborKey, distance: next });
			}
		}
		// Batch-prepend zero-cost neighbors in N/E/S/W order (not reverse).
		deque.unshift(...zeroCostNeighbors);
	}

	return null;
}

/**
 * Threads a full route through legs: origin-adjacent coords → waypoint₁ → … →
 * waypointₙ → destination-adjacent coords. Each leg starts from the previous
 * leg's endpoint. Returns the de-duplicated ordered cell keys, or null when any
 * leg has no reachable endpoint.
 */
function findFullPath(
	ctx: RailPathContext,
	originAdjacent: ReadonlyArray<{ x: number; y: number }>,
	waypoints: ReadonlyArray<{ x: number; y: number }>,
	destinationAdjacent: ReadonlyArray<{ x: number; y: number }>
): string[] | null {
	const legTargets: Array<ReadonlySet<string>> = [];
	for (const waypoint of waypoints) {
		legTargets.push(new Set([railCellKey(waypoint.x, waypoint.y)]));
	}
	legTargets.push(new Set(destinationAdjacent.map((coord) => railCellKey(coord.x, coord.y))));

	let sourceKeys: string[] = originAdjacent.map((coord) => railCellKey(coord.x, coord.y));
	const ordered: string[] = [];
	const seen = new Set<string>();

	for (const targets of legTargets) {
		const legPath = findLegPath(ctx, sourceKeys, targets);
		if (legPath === null) return null;

		for (const key of legPath) {
			if (!seen.has(key)) {
				seen.add(key);
				ordered.push(key);
			}
		}
		sourceKeys = [legPath[legPath.length - 1]!];
	}

	return ordered;
}

function findBuilding(game: GameState, id: string): IndustrialBuilding | undefined {
	return game.industrialBuildings.find((building) => building.id === id);
}

function findCity(game: GameState, cityId: string): IndustryCity | undefined {
	return game.industryCities.find((city) => city.id === cityId);
}

function replaceCity(game: GameState, city: IndustryCity): GameState['industryCities'] {
	return game.industryCities.map((candidate) => (candidate.id === city.id ? city : candidate));
}

export function buildRailPreview(game: GameState, input: RailBuildInput): RailBuildPreview {
	const originBuilding = findBuilding(game, input.originBuildingId);
	const destinationBuilding = findBuilding(game, input.destinationBuildingId);

	const base: Omit<RailBuildPreview, 'blockReason'> = {
		originBuildingId: input.originBuildingId,
		waypoints: input.waypoints,
		destinationBuildingId: destinationBuilding ? destinationBuilding.id : null,
		pathKeys: [],
		newCellKeys: [],
		reusedCellKeys: [],
		cost: 0
	};

	if (!originBuilding || !destinationBuilding) {
		return { ...base, blockReason: decisionContextRailUnknownBuilding() };
	}

	// Cross-city endpoints are rejected before pathing; rails never span cities.
	if (originBuilding.cityId !== destinationBuilding.cityId) {
		return { ...base, blockReason: decisionContextRailCrossCity() };
	}

	const city = findCity(game, originBuilding.cityId);
	if (!city) {
		return { ...base, blockReason: decisionContextRailUnknownBuilding() };
	}

	const lookup = createIndustryTileLookup(city);
	const occupiedTileIds = getOccupiedIndustryTileIds(city, game.industrialBuildings, lookup);
	const railKeys = new Set(city.rails.map((cell) => railCellKey(cell.x, cell.y)));
	const ctx: RailPathContext = { lookup, occupiedTileIds, railKeys };

	const path = findFullPath(
		ctx,
		getFootprintAdjacentCoords(originBuilding),
		input.waypoints,
		getFootprintAdjacentCoords(destinationBuilding)
	);

	if (path === null) {
		return { ...base, blockReason: decisionContextRailNoValidPath() };
	}

	const newCellKeys = path.filter((key) => !railKeys.has(key));
	const reusedCellKeys = path.filter((key) => railKeys.has(key));
	const cost = newCellKeys.length * RAIL_BUILD_COST_PER_CELL;
	const blockReason = cost > game.cash ? decisionContextRailRequiresCash(cost, game.cash) : null;

	return { ...base, pathKeys: path, newCellKeys, reusedCellKeys, cost, blockReason };
}

export function buildRail(game: GameState, input: RailBuildInput): GameState {
	const preview = buildRailPreview(game, input);
	if (preview.blockReason || preview.newCellKeys.length === 0) {
		return game;
	}

	const originBuilding = findBuilding(game, input.originBuildingId);
	if (!originBuilding) return game;
	const city = findCity(game, originBuilding.cityId);
	if (!city) return game;

	const newCells: RailCell[] = preview.newCellKeys.map((key) => {
		const { x, y } = parseRailCellKey(key);
		return { x, y, level: 1 };
	});
	const newCity: IndustryCity = { ...city, rails: [...city.rails, ...newCells] };

	return {
		...game,
		cash: game.cash - preview.cost,
		industryCities: replaceCity(game, newCity)
	};
}

/**
 * Cost to raise a segment one level (target = minLevel + 1): only cells below
 * the target are charged, at RAIL_UPGRADE_COST_PER_CELL_PER_LEVEL × minLevel
 * each. Needs the network because a `RailSegment` carries only its minLevel,
 * not per-cell levels.
 */
export function getSegmentUpgradeCost(segment: RailSegment, network: RailNetwork): number {
	const target = segment.minLevel + 1;
	const cellsBelowTarget = segment.cellKeys.filter(
		(key) => (network.cells.get(key)?.level ?? RAIL_MAX_LEVEL) < target
	).length;
	return cellsBelowTarget * RAIL_UPGRADE_COST_PER_CELL_PER_LEVEL * segment.minLevel;
}

/**
 * Cells that would actually be removed when demolishing `segment`: every cell
 * except junction cells shared with another segment that still have a rail
 * neighbour outside this segment. Exposed so the demolish transition and the
 * inspector refund preview agree on the removable count.
 */
export function getDemolishRemovableCellKeys(
	segment: RailSegment,
	segments: readonly RailSegment[],
	network: RailNetwork
): Set<string> {
	const demolishSet = new Set(segment.cellKeys);
	const removable = new Set<string>();

	for (const key of segment.cellKeys) {
		const { x, y } = parseRailCellKey(key);
		const hasOutsideRailNeighbor = getRailNeighborKeys(network, x, y).some(
			(neighborKey) => !demolishSet.has(neighborKey)
		);
		const sharedWithAnotherSegment = segments.some(
			(candidate) => candidate.id !== segment.id && candidate.cellKeys.includes(key)
		);
		if (sharedWithAnotherSegment && hasOutsideRailNeighbor) continue;
		removable.add(key);
	}

	return removable;
}

export function getSegmentDemolishRefund(cellCount: number): number {
	return Math.round(cellCount * RAIL_BUILD_COST_PER_CELL * RAIL_DEMOLISH_REFUND_RATIO);
}

export function upgradeRailSegment(game: GameState, cityId: string, segmentId: string): GameState {
	const city = findCity(game, cityId);
	if (!city) return game;

	const network = buildRailNetwork(city);
	const segment = deriveRailSegments(network, game.industrialBuildings).find(
		(candidate) => candidate.id === segmentId
	);
	if (!segment) return game;
	if (segment.minLevel >= RAIL_MAX_LEVEL) return game;

	const target = segment.minLevel + 1;
	const cost = getSegmentUpgradeCost(segment, network);
	if (game.cash < cost) return game;
	const upgradeKeys = new Set(
		segment.cellKeys.filter((key) => (network.cells.get(key)?.level ?? RAIL_MAX_LEVEL) < target)
	);
	const newRails = city.rails.map((cell) =>
		upgradeKeys.has(railCellKey(cell.x, cell.y)) ? { ...cell, level: target } : cell
	);
	const newCity: IndustryCity = { ...city, rails: newRails };

	return {
		...game,
		cash: game.cash - cost,
		industryCities: replaceCity(game, newCity)
	};
}

export function demolishRailSegment(game: GameState, cityId: string, segmentId: string): GameState {
	const city = findCity(game, cityId);
	if (!city) return game;

	const network = buildRailNetwork(city);
	const segments = deriveRailSegments(network, game.industrialBuildings);
	const segment = segments.find((candidate) => candidate.id === segmentId);
	if (!segment) return game;

	const cellsToRemove = getDemolishRemovableCellKeys(segment, segments, network);
	const refund = getSegmentDemolishRefund(cellsToRemove.size);

	const newRails = city.rails.filter((cell) => !cellsToRemove.has(railCellKey(cell.x, cell.y)));
	const newCity: IndustryCity = { ...city, rails: newRails };

	return {
		...game,
		cash: game.cash + refund,
		industryCities: replaceCity(game, newCity)
	};
}
