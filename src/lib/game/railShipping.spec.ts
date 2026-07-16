import { describe, expect, it } from 'vitest';
import { createRailTickState, pullViaRail, pushSurplusViaRail } from './railShipping';
import type { GameState, IndustrialBuilding, IndustryCity, RailCell } from './types';

function makeBuilding(
	id: string,
	typeId: IndustrialBuilding['typeId'],
	mapX: number,
	mapY: number,
	inventory: IndustrialBuilding['inventory'] = {}
): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId,
		cityId: 'rail-city',
		tileId: `rail-city-${mapX}-${mapY}`,
		mapX,
		mapY,
		status: 'idle',
		inventory,
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0
	};
}

function makeCity(rails: RailCell[]): IndustryCity {
	return { id: 'rail-city', name: 'Rail City', width: 30, height: 30, tiles: [], rails };
}

function straightRails(y: number, fromX: number, toX: number, level = 1): RailCell[] {
	const cells: RailCell[] = [];
	for (let x = fromX; x <= toX; x += 1) cells.push({ x, y, level });
	return cells;
}

// Minimal GameState stub: railShipping only touches industryCities,
// industrialBuildings, and warehouse.
function makeGame(city: IndustryCity, buildings: IndustrialBuilding[]): GameState {
	return {
		industryCities: [city],
		industrialBuildings: buildings,
		warehouse: { capacity: 500, materials: {}, overflowUnits: 0, overflowCost: 0 }
	} as unknown as GameState;
}

// Layout used across tests:
//   farm (2,2) footprint (2..3, 2..3) — attach row y=4 at (2,4),(3,4)
//   mill (10,2) footprint (10..11, 2..3) — attach row y=4 at (10,4),(11,4)
//   rail line y=4 from x=2..11 connects both.
const LINE = straightRails(4, 2, 11);

describe('pullViaRail', () => {
	it('pulls from a connected producer buffer, bottlenecked at 1/day on a level-1 line', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
		const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [farm, mill]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		const result = pullViaRail(state, mill, 'grain', 10);
		expect(result.fromProducers).toBe(1); // 8-cell level-1 path → min budget 1
		expect(result.fromWarehouse).toBe(0);
		expect(state.inventories.get('industry-building-1')!.grain).toBe(29);
		expect(state.shipments).toHaveLength(1);
		expect(state.shipments[0]).toMatchObject({
			kind: 'pull-producer',
			fromId: 'industry-building-1',
			toId: 'industry-building-2',
			materialId: 'grain',
			quantity: 1
		});
		expect(state.usage['rail-city:6,4']).toBe(1);
	});

	it('does not pull consumer input stock from another processor buffer', () => {
		// Mill A holds grain (its recipe input), not flour. Grain is not an
		// output of flour-milling, so mill B must not treat that stock as
		// transferable producer surplus.
		const millA = makeBuilding('industry-building-1', 'flour-mill', 2, 2, { grain: 30 });
		const millB = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [millA, millB]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		const result = pullViaRail(state, millB, 'grain', 10);
		expect(result.fromProducers).toBe(0);
		expect(result.fromWarehouse).toBe(0);
		expect(state.inventories.get('industry-building-1')!.grain).toBe(30);
		expect(state.shipments).toHaveLength(0);
	});

	it('a level-3 line moves 3/day', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
		const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(
			makeGame(makeCity(straightRails(4, 2, 11, 3)), [farm, mill]),
			{ capacity: 500, materials: {}, overflowUnits: 0, overflowCost: 0 }
		);
		expect(pullViaRail(state, mill, 'grain', 10).fromProducers).toBe(3);
	});

	it('pulls from the warehouse pool through a warehouse building', () => {
		const warehouse = makeBuilding('industry-building-1', 'warehouse', 2, 2);
		const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [warehouse, mill]), {
			capacity: 500,
			materials: { grain: 50 },
			overflowUnits: 0,
			overflowCost: 0
		});
		const result = pullViaRail(state, mill, 'grain', 10);
		expect(result.fromWarehouse).toBe(1);
		expect(state.warehouse.materials.grain).toBe(49);
		expect(state.shipments[0]!.kind).toBe('pull-warehouse');
	});

	it('returns zero when the consumer has no rail connection', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
		const mill = makeBuilding('industry-building-2', 'flour-mill', 20, 20);
		const state = createRailTickState(makeGame(makeCity(LINE), [farm, mill]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		const result = pullViaRail(state, mill, 'grain', 10);
		expect(result.fromProducers + result.fromWarehouse).toBe(0);
	});

	it('two branches sharing a trunk compete for its budget', () => {
		// Farm at (2,2) with attach (3,4); level-1 trunk y=4 x=2..7 continues
		// east to mill A and branches south to mill B. Mill A: footprint
		// (8..9, 2..3), attach cell (8,4). Mill B: footprint (8..9, 6..7),
		// attach cell (7,6). Both routes share the trunk, which carries
		// 1/day total — after A ships 1 unit, B gets nothing.
		const rails = [...straightRails(4, 2, 8), { x: 7, y: 5, level: 1 }, { x: 7, y: 6, level: 1 }];
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
		const millA = makeBuilding('industry-building-2', 'flour-mill', 8, 2);
		const millB = makeBuilding('industry-building-3', 'flour-mill', 8, 6);
		const state = createRailTickState(makeGame(makeCity(rails), [farm, millA, millB]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		const pullA = pullViaRail(state, millA, 'grain', 5);
		const pullB = pullViaRail(state, millB, 'grain', 5);
		expect(pullA.fromProducers).toBe(1);
		expect(pullB.fromProducers).toBe(0); // trunk exhausted
	});

	it('is deterministic: same state twice yields identical shipments', () => {
		const build = () => {
			const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
			const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
			const state = createRailTickState(makeGame(makeCity(LINE), [farm, mill]), {
				capacity: 500,
				materials: {},
				overflowUnits: 0,
				overflowCost: 0
			});
			pullViaRail(state, mill, 'grain', 10);
			return state.shipments;
		};
		expect(build()).toEqual(build());
	});

	it('skips a stocked producer with no rail attach cells', () => {
		// A disconnected farm (no attach cells) holds grain but cannot ship; the
		// pull must skip it and return zero with no shipments.
		const connectedFarm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
		const disconnectedFarm = makeBuilding('industry-building-3', 'grain-farm', 20, 20, {
			grain: 30
		});
		const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(
			makeGame(makeCity(LINE), [connectedFarm, disconnectedFarm, mill]),
			{ capacity: 500, materials: {}, overflowUnits: 0, overflowCost: 0 }
		);
		const result = pullViaRail(state, mill, 'grain', 10);
		// Only the connected farm ships (1/day bottleneck); the disconnected
		// farm's stock is untouched.
		expect(result.fromProducers).toBe(1);
		expect(state.inventories.get('industry-building-3')!.grain).toBe(30);
	});

	it('fully satisfies a small request and exits the pull loop cleanly', () => {
		// Requesting exactly one unit on a level-1 line drains the budget of
		// the bottleneck cell to zero, but remaining hits 0 first so the while
		// loop terminates normally rather than bailing on a missing path.
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
		const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [farm, mill]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		const result = pullViaRail(state, mill, 'grain', 1);
		expect(result.fromProducers).toBe(1);
		expect(state.shipments).toHaveLength(1);
		expect(state.inventories.get('industry-building-1')!.grain).toBe(29);
	});

	it('splits a pull across multiple producers when the nearest source is exhausted', () => {
		// Farm A (west, 1 grain) and Farm B (east, 10 grain) flank a mill on
		// a level-3 line. The mill requests 5. Farm A is nearer (tied distance,
		// lower id wins), ships its 1 unit, then the loop repeats and pulls
		// from Farm B until the shared budget is exhausted. Total = 1 + 3 = 4.
		const farmA = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 1 });
		const farmB = makeBuilding('industry-building-2', 'grain-farm', 15, 2, { grain: 10 });
		const mill = makeBuilding('industry-building-3', 'flour-mill', 8, 2);
		const rails = straightRails(4, 2, 16, 3);
		const state = createRailTickState(makeGame(makeCity(rails), [farmA, farmB, mill]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		const result = pullViaRail(state, mill, 'grain', 5);
		expect(result.fromProducers).toBe(4);
		expect(result.fromWarehouse).toBe(0);
		expect(state.inventories.get('industry-building-1')!.grain).toBe(0);
		expect(state.inventories.get('industry-building-2')!.grain).toBe(7);
		expect(state.shipments).toHaveLength(2);
		expect(state.shipments[0]).toMatchObject({
			fromId: 'industry-building-1',
			quantity: 1
		});
		expect(state.shipments[1]).toMatchObject({
			fromId: 'industry-building-2',
			quantity: 3
		});
	});
});

describe('pushSurplusViaRail', () => {
	it('pushes leftover output to a connected warehouse', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 5 });
		const warehouse = makeBuilding('industry-building-2', 'warehouse', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [farm, warehouse]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		pushSurplusViaRail(state, farm);
		expect(state.warehouse.materials.grain).toBe(1); // bottlenecked at 1/day
		expect(state.inventories.get('industry-building-1')!.grain).toBe(4);
		expect(state.shipments[0]!.kind).toBe('push-warehouse');
	});

	it('pushes processor outputs while retaining buffered inputs', () => {
		const mill = makeBuilding('industry-building-1', 'flour-mill', 2, 2, {
			grain: 12,
			flour: 5
		});
		const warehouse = makeBuilding('industry-building-2', 'warehouse', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [mill, warehouse]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		pushSurplusViaRail(state, mill);
		expect(state.warehouse.materials.flour).toBe(1);
		expect(state.warehouse.materials.grain).toBeUndefined();
		expect(state.inventories.get('industry-building-1')).toEqual({ grain: 12, flour: 4 });
		expect(state.shipments[0]).toMatchObject({
			kind: 'push-warehouse',
			materialId: 'flour',
			quantity: 1
		});
	});

	it('does nothing without a reachable warehouse', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 5 });
		const state = createRailTickState(makeGame(makeCity(LINE), [farm]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		pushSurplusViaRail(state, farm);
		expect(state.shipments).toHaveLength(0);
		expect(state.inventories.get('industry-building-1')!.grain).toBe(5);
	});

	it('skips a warehouse with no rail attach cells', () => {
		// A disconnected warehouse (no attach cells) is ignored while the
		// connected warehouse still receives the push.
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 5 });
		const connectedWarehouse = makeBuilding('industry-building-2', 'warehouse', 10, 2);
		const disconnectedWarehouse = makeBuilding('industry-building-3', 'warehouse', 20, 20);
		const state = createRailTickState(
			makeGame(makeCity(LINE), [farm, connectedWarehouse, disconnectedWarehouse]),
			{ capacity: 500, materials: {}, overflowUnits: 0, overflowCost: 0 }
		);
		pushSurplusViaRail(state, farm);
		expect(state.warehouse.materials.grain).toBe(1);
		expect(state.shipments).toHaveLength(1);
		expect(state.shipments[0]!.toId).toBe('industry-building-2');
	});

	it('pushes surplus to two warehouses on non-overlapping paths', () => {
		// Farm at (2,2) has 10 grain. Warehouse B (south, 6-cell path) is
		// nearer than warehouse A (east, 8-cell path); the two paths share no
		// cells (one starts at attach (2,4), the other at (3,4)). On a level-3
		// line the first push sends 3 to B, the second sends 3 to A, then both
		// budgets are exhausted. Total pushed = 6, farm retains 4.
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 10 });
		const warehouseA = makeBuilding('industry-building-2', 'warehouse', 10, 2);
		const warehouseB = makeBuilding('industry-building-3', 'warehouse', 2, 10);
		const rails: RailCell[] = [
			// Horizontal from farm's (3,4) east to warehouse A's (10,4)
			{ x: 3, y: 4, level: 3 },
			{ x: 4, y: 4, level: 3 },
			{ x: 5, y: 4, level: 3 },
			{ x: 6, y: 4, level: 3 },
			{ x: 7, y: 4, level: 3 },
			{ x: 8, y: 4, level: 3 },
			{ x: 9, y: 4, level: 3 },
			{ x: 10, y: 4, level: 3 },
			// Vertical from farm's (2,4) south to warehouse B's (2,9)
			{ x: 2, y: 4, level: 3 },
			{ x: 2, y: 5, level: 3 },
			{ x: 2, y: 6, level: 3 },
			{ x: 2, y: 7, level: 3 },
			{ x: 2, y: 8, level: 3 },
			{ x: 2, y: 9, level: 3 }
		];
		const state = createRailTickState(makeGame(makeCity(rails), [farm, warehouseA, warehouseB]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		pushSurplusViaRail(state, farm);
		expect(state.warehouse.materials.grain).toBe(6);
		expect(state.inventories.get('industry-building-1')!.grain).toBe(4);
		expect(state.shipments).toHaveLength(2);
		// Nearer warehouse B (shorter path) is served first.
		expect(state.shipments[0]).toMatchObject({
			toId: 'industry-building-3',
			quantity: 3
		});
		expect(state.shipments[1]).toMatchObject({
			toId: 'industry-building-2',
			quantity: 3
		});
	});
});
