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
});
