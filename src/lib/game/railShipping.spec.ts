import { describe, expect, it } from 'vitest';
import {
	createRailTickState as createCityRailTickState,
	pullViaRail,
	pushSurplusViaRail,
	type RailTickState
} from './railShipping';
import { simulateIndustryProduction } from './industryProduction';
import { demolishRailSegment } from './railPlacement';
import {
	buildRailNetwork,
	deriveRailSegments,
	getRailCellDailyCapacity,
	railCellKey
} from './rail';
import { createNewGame } from './state';
import type { GameState, CityInventory, IndustrialBuilding, IndustryCity, RailCell } from './types';

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
		cityId: 'industry-city',
		tileId: `industry-city-${mapX}-${mapY}`,
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
	return { id: 'industry-city', name: 'Rail City', width: 30, height: 30, tiles: [], rails };
}

function straightRails(y: number, fromX: number, toX: number, level = 1): RailCell[] {
	const cells: RailCell[] = [];
	for (let x = fromX; x <= toX; x += 1) cells.push({ x, y, level });
	return cells;
}

function makeGame(city: IndustryCity, buildings: IndustrialBuilding[]): GameState {
	const base = createNewGame('convenience', 20260804);

	return {
		...base,
		cash: 100_000,
		industryCities: [city],
		industrialBuildings: buildings,
		cityInventories: [{ cityId: 'industry-city', materials: {} }]
	};
}

function createRailTickState(
	game: GameState,
	cityInventory: Omit<CityInventory, 'cityId'> = game.cityInventories[0]!
): RailTickState & { readonly cityInventory: CityInventory } {
	const state = createCityRailTickState({
		...game,
		cityInventories: [
			{
				...cityInventory,
				cityId: 'industry-city',
				materials: { ...cityInventory.materials }
			}
		]
	});

	return Object.defineProperty(state, 'cityInventory', {
		get: () => state.cityInventoriesByCityId.get('industry-city')!
	}) as RailTickState & { readonly cityInventory: CityInventory };
}

// Layout used across tests:
//   farm (2,2) footprint (2..3, 2..3) — attach row y=4 at (2,4),(3,4)
//   mill (10,2) footprint (10..11, 2..3) — attach row y=4 at (10,4),(11,4)
//   rail line y=4 from x=2..11 connects both.
const LINE = straightRails(4, 2, 11);

describe('pullViaRail', () => {
	it('pulls from a connected producer buffer up to the level-1 line capacity', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
		const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [farm, mill]), {
			materials: {}
		});
		// Request above the line capacity so the path bottleneck really binds.
		const result = pullViaRail(state, mill, 'grain', 25);
		expect(result.fromProducers).toBe(getRailCellDailyCapacity(1)); // level-1 path → per-cell capacity bottleneck
		expect(result.fromWarehouse).toBe(0);
		expect(state.inventories.get('industry-building-1')!.grain).toBe(
			30 - getRailCellDailyCapacity(1)
		);
		expect(state.shipments).toHaveLength(1);
		expect(state.shipments[0]).toMatchObject({
			kind: 'pull-producer',
			fromId: 'industry-building-1',
			toId: 'industry-building-2',
			materialId: 'grain',
			quantity: getRailCellDailyCapacity(1)
		});
		expect(state.usage['industry-city:6,4']).toBe(getRailCellDailyCapacity(1));
	});

	it('does not pull consumer input stock from another processor buffer', () => {
		// Mill A holds grain (its recipe input), not flour. Grain is not an
		// output of flour-milling, so mill B must not treat that stock as
		// transferable producer surplus.
		const millA = makeBuilding('industry-building-1', 'flour-mill', 2, 2, { grain: 30 });
		const millB = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [millA, millB]), {
			materials: {}
		});
		const result = pullViaRail(state, millB, 'grain', 10);
		expect(result.fromProducers).toBe(0);
		expect(result.fromWarehouse).toBe(0);
		expect(state.inventories.get('industry-building-1')!.grain).toBe(30);
		expect(state.shipments).toHaveLength(0);
	});

	it('pulls a processor output (flour) to a downstream consumer via rail', () => {
		// Positive case for the recipe-outputs-only source restriction: a
		// flour-mill holding flour (its recipe output) must satisfy a
		// snack-factory's flour pull. The restriction excludes buffered
		// inputs (covered above) but must not exclude legitimate outputs.
		const mill = makeBuilding('industry-building-1', 'flour-mill', 2, 2, { flour: 30 });
		const snackFactory = makeBuilding('industry-building-2', 'snack-factory', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [mill, snackFactory]), {
			materials: {}
		});
		const result = pullViaRail(state, snackFactory, 'flour', 25);
		expect(result.fromProducers).toBe(getRailCellDailyCapacity(1)); // level-1 line → per-cell capacity bottleneck
		expect(result.fromWarehouse).toBe(0);
		expect(state.inventories.get('industry-building-1')!.flour).toBe(
			30 - getRailCellDailyCapacity(1)
		);
		expect(state.shipments).toHaveLength(1);
		expect(state.shipments[0]).toMatchObject({
			kind: 'pull-producer',
			fromId: 'industry-building-1',
			toId: 'industry-building-2',
			materialId: 'flour',
			quantity: getRailCellDailyCapacity(1)
		});
	});

	it('a level-3 line moves three per-level units of capacity per day', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 50 });
		const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(
			makeGame(makeCity(straightRails(4, 2, 11, 3)), [farm, mill]),
			{ materials: {} }
		);
		expect(pullViaRail(state, mill, 'grain', 40).fromProducers).toBe(getRailCellDailyCapacity(3));
	});

	it('pulls from the warehouse pool through a warehouse building', () => {
		const warehouse = makeBuilding('industry-building-1', 'warehouse', 2, 2);
		const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [warehouse, mill]), {
			materials: { grain: 50 }
		});
		const result = pullViaRail(state, mill, 'grain', 25);
		expect(result.fromWarehouse).toBe(getRailCellDailyCapacity(1));
		expect(state.cityInventory.materials.grain).toBe(50 - getRailCellDailyCapacity(1));
		expect(state.shipments[0]!.kind).toBe('pull-warehouse');
	});

	it('unions warehouse footprints that share a rail cell into one pool endpoint', () => {
		// Warehouse A (5,2) footprint (5..6,2..3) attaches to rail cells
		// (5,4),(6,4); warehouse B (4,5) footprint (4..5,5..6) attaches to
		// (4,4),(5,4). Both claim (5,4): the pool's attach-key union must list
		// it once, and the first warehouse in industrialBuildings order owns
		// the endpoint label used on shipment records.
		const warehouseA = makeBuilding('industry-building-1', 'warehouse', 5, 2);
		const warehouseB = makeBuilding('industry-building-2', 'warehouse', 4, 5);
		const state = createRailTickState(makeGame(makeCity(LINE), [warehouseA, warehouseB]));
		const city = state.citiesById.get('industry-city')!;

		expect(city.warehouseAttachKeys).toEqual(['5,4', '6,4', '4,4']);
		expect(city.warehouseIdByAttachKey.get('5,4')).toBe('industry-building-1');
		expect(city.warehouseIdByAttachKey.get('6,4')).toBe('industry-building-1');
		expect(city.warehouseIdByAttachKey.get('4,4')).toBe('industry-building-2');
	});

	it('reads a corrupt undefined pool entry as zero when checking pool fullness', () => {
		// A hand-edited or legacy-corrupt save can carry an undefined material
		// quantity. The lazy pool-usage sum used for the full-pool recovery
		// check must treat it as unavailable stock rather than throwing like
		// strict getCityInventoryUsed — otherwise one corrupt entry would
		// wedge every pull for the day.
		const warehouse = makeBuilding('industry-building-1', 'warehouse', 2, 2);
		const bottler = makeBuilding('industry-building-2', 'water-bottler', 10, 2);
		// A water pump whose buffer holds no water entry at all is a recipe
		// candidate that must read as zero stock — it cannot satisfy the pull.
		const emptyPump = makeBuilding('industry-building-3', 'water-pump', 14, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [warehouse, bottler, emptyPump]), {
			materials: { water: 100, grain: undefined }
		});

		const result = pullViaRail(state, bottler, 'water', 10);

		expect(result.fromWarehouse).toBe(getRailCellDailyCapacity(1));
		expect(state.shipments[0]!.kind).toBe('pull-warehouse');
	});

	it('pulls from the nearest stocked source — a tied producer wins on building id', () => {
		// Pump (west) and warehouse (east) sit at equal path length from the
		// bottler on a level-1 line. The pump must win: pulling pooled water
		// over the same cells the bottler's bottled-water push needs would
		// consume the shared rail budget on days the push has no other path.
		// The pool stays intact for pushes and export routes instead.
		const pump = makeBuilding('industry-building-1', 'water-pump', 2, 2, { water: 30 });
		const bottler = makeBuilding('industry-building-2', 'water-bottler', 10, 2);
		const warehouse = makeBuilding('industry-building-3', 'warehouse', 18, 2);
		const state = createRailTickState(
			makeGame(makeCity(straightRails(4, 2, 19)), [pump, bottler, warehouse]),
			{ materials: { water: 50 } }
		);
		const result = pullViaRail(state, bottler, 'water', 10);
		expect(result.fromProducers).toBe(10);
		expect(result.fromWarehouse).toBe(0);
		expect(state.inventories.get('industry-building-1')!.water).toBe(20);
		expect(state.cityInventory.materials.water).toBe(50);
		expect(state.shipments[0]).toMatchObject({
			kind: 'pull-producer',
			fromId: 'industry-building-1',
			toId: 'industry-building-2',
			materialId: 'water',
			quantity: 10
		});
	});

	it('returns zero when the consumer has no rail connection', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
		const mill = makeBuilding('industry-building-2', 'flour-mill', 20, 20);
		const state = createRailTickState(makeGame(makeCity(LINE), [farm, mill]), {
			materials: {}
		});
		const result = pullViaRail(state, mill, 'grain', 10);
		expect(result.fromProducers + result.fromWarehouse).toBe(0);
	});

	it('two branches sharing a trunk compete for its budget', () => {
		// Farm at (2,2) with attach (3,4); level-1 trunk y=4 x=2..7 continues
		// east to mill A and branches south to mill B. Mill A: footprint
		// (8..9, 2..3), attach cell (8,4). Mill B: footprint (8..9, 6..7),
		// attach cell (7,6). Both routes share the trunk, which carries one
		// cell's daily capacity total — after A ships a full-capacity load, B
		// gets nothing.
		const rails = [...straightRails(4, 2, 8), { x: 7, y: 5, level: 1 }, { x: 7, y: 6, level: 1 }];
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
		const millA = makeBuilding('industry-building-2', 'flour-mill', 8, 2);
		const millB = makeBuilding('industry-building-3', 'flour-mill', 8, 6);
		const state = createRailTickState(makeGame(makeCity(rails), [farm, millA, millB]), {
			materials: {}
		});
		const pullA = pullViaRail(state, millA, 'grain', 15);
		const pullB = pullViaRail(state, millB, 'grain', 15);
		expect(pullA.fromProducers).toBe(getRailCellDailyCapacity(1));
		expect(pullB.fromProducers).toBe(0); // trunk exhausted
	});

	it('trunk-contention ordering is deterministic: same state twice yields identical shipments', () => {
		// Same trunk+branch layout as the contention case above — this is the
		// highest-risk ordering path (multiple candidates, id tie-break,
		// shared-budget exhaustion), so guard it directly.
		const build = () => {
			const rails = [...straightRails(4, 2, 8), { x: 7, y: 5, level: 1 }, { x: 7, y: 6, level: 1 }];
			const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
			const millA = makeBuilding('industry-building-2', 'flour-mill', 8, 2);
			const millB = makeBuilding('industry-building-3', 'flour-mill', 8, 6);
			const state = createRailTickState(makeGame(makeCity(rails), [farm, millA, millB]), {
				materials: {}
			});
			pullViaRail(state, millA, 'grain', 15);
			pullViaRail(state, millB, 'grain', 15);
			return state.shipments;
		};
		expect(build()).toEqual(build());
	});

	it('is deterministic: same state twice yields identical shipments', () => {
		const build = () => {
			const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
			const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
			const state = createRailTickState(makeGame(makeCity(LINE), [farm, mill]), {
				materials: {}
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
			{ materials: {} }
		);
		const result = pullViaRail(state, mill, 'grain', 20);
		// Only the connected farm ships (level-1 per-cell capacity bottleneck);
		// the disconnected farm's stock is untouched.
		expect(result.fromProducers).toBe(getRailCellDailyCapacity(1));
		expect(state.inventories.get('industry-building-3')!.grain).toBe(30);
	});

	it('fully satisfies a capacity-sized request and exits the pull loop cleanly', () => {
		// Requesting exactly the line's daily capacity drains the bottleneck
		// cells' budget to zero at the same time `remaining` hits 0, so the
		// while loop terminates normally rather than bailing on a missing path.
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
		const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [farm, mill]), {
			materials: {}
		});
		const result = pullViaRail(state, mill, 'grain', getRailCellDailyCapacity(1));
		expect(result.fromProducers).toBe(getRailCellDailyCapacity(1));
		expect(state.shipments).toHaveLength(1);
		expect(state.inventories.get('industry-building-1')!.grain).toBe(
			30 - getRailCellDailyCapacity(1)
		);
	});

	it('splits a pull across multiple producers when the nearest source is exhausted', () => {
		// Farm A (west, 5 grain) and Farm B (east, 40 grain) flank a mill on
		// a level-3 line. The mill requests 50. Farm A is nearer (tied distance,
		// lower id wins), ships its 5 units, then the loop repeats and pulls
		// from Farm B until the shared budget is exhausted. Total = 5 + the
		// level-3 per-cell capacity.
		const farmA = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 5 });
		const farmB = makeBuilding('industry-building-2', 'grain-farm', 15, 2, { grain: 40 });
		const mill = makeBuilding('industry-building-3', 'flour-mill', 8, 2);
		const rails = straightRails(4, 2, 16, 3);
		const state = createRailTickState(makeGame(makeCity(rails), [farmA, farmB, mill]), {
			materials: {}
		});
		const result = pullViaRail(state, mill, 'grain', 50);
		expect(result.fromProducers).toBe(5 + getRailCellDailyCapacity(3));
		expect(result.fromWarehouse).toBe(0);
		expect(state.inventories.get('industry-building-1')!.grain).toBe(0);
		expect(state.inventories.get('industry-building-2')!.grain).toBe(
			40 - getRailCellDailyCapacity(3)
		);
		expect(state.shipments).toHaveLength(2);
		expect(state.shipments[0]).toMatchObject({
			fromId: 'industry-building-1',
			quantity: 5
		});
		expect(state.shipments[1]).toMatchObject({
			fromId: 'industry-building-2',
			quantity: getRailCellDailyCapacity(3)
		});
	});
});

describe('pushSurplusViaRail', () => {
	it('pushes leftover output to a connected warehouse', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 15 });
		const warehouse = makeBuilding('industry-building-2', 'warehouse', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [farm, warehouse]), {
			materials: {}
		});
		pushSurplusViaRail(state, farm);
		expect(state.cityInventory.materials.grain).toBe(getRailCellDailyCapacity(1)); // level-1 line capacity binds
		expect(state.inventories.get('industry-building-1')!.grain).toBe(
			15 - getRailCellDailyCapacity(1)
		);
		expect(state.shipments[0]!.kind).toBe('push-warehouse');
	});

	it('pushes processor outputs while retaining buffered inputs', () => {
		const mill = makeBuilding('industry-building-1', 'flour-mill', 2, 2, {
			grain: 12,
			flour: 15
		});
		const warehouse = makeBuilding('industry-building-2', 'warehouse', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [mill, warehouse]), {
			materials: {}
		});
		pushSurplusViaRail(state, mill);
		expect(state.cityInventory.materials.flour).toBe(getRailCellDailyCapacity(1));
		expect(state.cityInventory.materials.grain).toBeUndefined();
		expect(state.inventories.get('industry-building-1')).toEqual({
			grain: 12,
			flour: 15 - getRailCellDailyCapacity(1)
		});
		expect(state.shipments[0]).toMatchObject({
			kind: 'push-warehouse',
			materialId: 'flour',
			quantity: getRailCellDailyCapacity(1)
		});
	});

	it('does nothing without a reachable warehouse', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 5 });
		const state = createRailTickState(makeGame(makeCity(LINE), [farm]), {
			materials: {}
		});
		pushSurplusViaRail(state, farm);
		expect(state.shipments).toHaveLength(0);
		expect(state.inventories.get('industry-building-1')!.grain).toBe(5);
	});

	it('skips a warehouse with no rail attach cells', () => {
		// A disconnected warehouse (no attach cells) is ignored while the
		// connected warehouse still receives the push.
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 15 });
		const connectedWarehouse = makeBuilding('industry-building-2', 'warehouse', 10, 2);
		const disconnectedWarehouse = makeBuilding('industry-building-3', 'warehouse', 20, 20);
		const state = createRailTickState(
			makeGame(makeCity(LINE), [farm, connectedWarehouse, disconnectedWarehouse]),
			{ materials: {} }
		);
		pushSurplusViaRail(state, farm);
		expect(state.cityInventory.materials.grain).toBe(getRailCellDailyCapacity(1));
		expect(state.shipments).toHaveLength(1);
		expect(state.shipments[0]!.toId).toBe('industry-building-2');
	});

	it('pushes surplus to two warehouses on non-overlapping paths', () => {
		// Farm at (2,2) has 45 grain. Warehouse B (south, 6-cell path) is
		// nearer than warehouse A (east, 8-cell path); the two paths share no
		// cells (one starts at attach (2,4), the other at (3,4)). On level-3
		// lines the first push fills B's path budget, the second sends the
		// remainder down A's path. Total pushed = 45, farm retains 0.
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 45 });
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
			materials: {}
		});
		pushSurplusViaRail(state, farm);
		expect(state.cityInventory.materials.grain).toBe(45);
		expect(state.inventories.get('industry-building-1')!.grain).toBe(0);
		expect(state.shipments).toHaveLength(2);
		// Nearer warehouse B (shorter path) is served first.
		expect(state.shipments[0]).toMatchObject({
			toId: 'industry-building-3',
			quantity: getRailCellDailyCapacity(3)
		});
		expect(state.shipments[1]).toMatchObject({
			toId: 'industry-building-2',
			quantity: 45 - getRailCellDailyCapacity(3)
		});
	});

	describe('warehouse capacity cap', () => {
		it('caps each push at the space remaining in the city warehouse pool', () => {
			// One warehouse building → 200 capacity; 195 used leaves 5 free,
			// less than both the level-1 line's daily capacity and the
			// bottler's 30-unit stock — the pool, not the rail budget, must
			// bind here. Bottled water is finished, so it sees the full free
			// space (the finished-goods reserve does not apply).
			const bottler = makeBuilding('industry-building-1', 'water-bottler', 2, 2, {
				'bottled-water': 30
			});
			const warehouse = makeBuilding('industry-building-2', 'warehouse', 10, 2);
			const state = createRailTickState(makeGame(makeCity(LINE), [bottler, warehouse]), {
				materials: { grain: 195 }
			});
			pushSurplusViaRail(state, bottler);
			expect(state.cityInventory.materials['bottled-water']).toBe(5);
			expect(state.inventories.get('industry-building-1')!['bottled-water']).toBe(25);
			expect(state.shipments).toEqual([
				{
					cityId: 'industry-city',
					materialId: 'bottled-water',
					quantity: 5,
					value: 10,
					kind: 'push-warehouse',
					fromId: 'industry-building-1',
					toId: 'industry-building-2'
				}
			]);
			// Conservation: every shipped unit left the producer buffer and
			// landed in the pool — nothing created, nothing lost.
			expect(
				(state.cityInventory.materials['bottled-water'] ?? 0) +
					(state.inventories.get('industry-building-1')!['bottled-water'] ?? 0)
			).toBe(30);
			// No rail cell is oversubscribed: per-cell usage stays within the
			// level-1 daily capacity.
			for (const units of Object.values(state.usage)) {
				expect(units).toBeLessThanOrEqual(getRailCellDailyCapacity(1));
			}
		});

		it('caps raw surplus at the finished-goods reserve, not the pool limit', () => {
			// One warehouse → 200 capacity with a 100-unit finished reserve:
			// 95 used leaves 5 units of the raw share free — less than the
			// level-1 line's daily capacity and the farm's 30-unit stock —
			// even though the pool still has 105 units of literal free space.
			const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
			const warehouse = makeBuilding('industry-building-2', 'warehouse', 10, 2);
			const state = createRailTickState(makeGame(makeCity(LINE), [farm, warehouse]), {
				materials: { grain: 95 }
			});
			pushSurplusViaRail(state, farm);
			expect(state.cityInventory.materials.grain).toBe(100);
			expect(state.inventories.get('industry-building-1')!.grain).toBe(25);
			expect(state.shipments).toEqual([
				{
					cityId: 'industry-city',
					materialId: 'grain',
					quantity: 5,
					value: 5,
					kind: 'push-warehouse',
					fromId: 'industry-building-1',
					toId: 'industry-building-2'
				}
			]);
		});

		it('leaves the reserve usable by a same-tick finished-goods push', () => {
			// Shared level-2 trunk (20/day per cell), one warehouse → 200
			// capacity. The farm's raw push stops at the 100-unit reserve
			// boundary (95 → 100 used); the bottler's finished push then claims
			// the space the reserve protected — 15 units, bounded by the rail
			// budget the farm's 5-unit shipment left on the shared cells.
			const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
			const bottler = makeBuilding('industry-building-2', 'water-bottler', 4, 2, {
				'bottled-water': 30
			});
			const warehouse = makeBuilding('industry-building-3', 'warehouse', 10, 2);
			const state = createRailTickState(
				makeGame(makeCity(straightRails(4, 2, 11, 2)), [farm, bottler, warehouse]),
				{ materials: { grain: 95 } }
			);
			pushSurplusViaRail(state, farm);
			pushSurplusViaRail(state, bottler);
			expect(state.cityInventory.materials.grain).toBe(100);
			expect(state.cityInventory.materials['bottled-water']).toBe(15);
			expect(state.shipments.map((shipment) => shipment.materialId)).toEqual([
				'grain',
				'bottled-water'
			]);
		});

		it('stops before mutating stock, budget, or shipments when the pool is exactly full', () => {
			// 200 used of 200 capacity → zero free space: the push must bail
			// before consuming rail budget or emitting a zero-quantity shipment.
			const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
			const warehouse = makeBuilding('industry-building-2', 'warehouse', 10, 2);
			const state = createRailTickState(makeGame(makeCity(LINE), [farm, warehouse]), {
				materials: { grain: 200 }
			});
			pushSurplusViaRail(state, farm);
			expect(state.cityInventory.materials.grain).toBe(200);
			expect(state.inventories.get('industry-building-1')!.grain).toBe(30);
			expect(state.shipments).toHaveLength(0);
			expect(state.usage).toEqual({});
		});

		it('does not add to an externally over-capacity pool', () => {
			// Stock that arrived over capacity by other means keeps its
			// preexisting overflow — the rail push just adds nothing on top.
			const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
			const warehouse = makeBuilding('industry-building-2', 'warehouse', 10, 2);
			const state = createRailTickState(makeGame(makeCity(LINE), [farm, warehouse]), {
				materials: { grain: 250 }
			});
			pushSurplusViaRail(state, farm);
			expect(state.cityInventory.materials.grain).toBe(250);
			expect(state.inventories.get('industry-building-1')!.grain).toBe(30);
			expect(state.shipments).toHaveLength(0);
			expect(state.usage).toEqual({});
		});

		it('measures free space across all pooled materials, not per material', () => {
			// 150 flour + 45 grain = 195 used of 200 → only 5 free even though
			// the pushed material itself has 200 units of per-material room.
			const snackFactory = makeBuilding('industry-building-1', 'snack-factory', 2, 2, {
				snacks: 30
			});
			const warehouse = makeBuilding('industry-building-2', 'warehouse', 10, 2);
			const state = createRailTickState(makeGame(makeCity(LINE), [snackFactory, warehouse]), {
				materials: { flour: 150, grain: 45 }
			});
			pushSurplusViaRail(state, snackFactory);
			expect(state.cityInventory.materials).toEqual({ flour: 150, grain: 45, snacks: 5 });
			expect(state.inventories.get('industry-building-1')!.snacks).toBe(25);
			expect(state.shipments).toHaveLength(1);
			expect(state.shipments[0]).toMatchObject({ materialId: 'snacks', quantity: 5 });
		});

		it('lets the earlier producer take the last free unit and stops the later one', () => {
			// 99 used of 200 → one unit of the raw share remains before the
			// finished-goods reserve boundary. Farm A (lower id, pushed first
			// in the tick's stage+id order) takes it; farm B sees zero
			// headroom and ships nothing — deterministic priority, no race.
			const build = () => {
				const farmA = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
				const warehouse = makeBuilding('industry-building-2', 'warehouse', 10, 2);
				const farmB = makeBuilding('industry-building-3', 'grain-farm', 6, 2, { grain: 30 });
				const state = createRailTickState(makeGame(makeCity(LINE), [farmA, warehouse, farmB]), {
					materials: { grain: 99 }
				});
				pushSurplusViaRail(state, farmA);
				pushSurplusViaRail(state, farmB);
				return state;
			};
			const state = build();
			expect(state.cityInventory.materials.grain).toBe(100);
			expect(state.inventories.get('industry-building-1')!.grain).toBe(29);
			expect(state.inventories.get('industry-building-3')!.grain).toBe(30);
			expect(state.shipments).toHaveLength(1);
			expect(state.shipments[0]).toMatchObject({
				kind: 'push-warehouse',
				fromId: 'industry-building-1',
				quantity: 1
			});
			expect(state.shipments.every((shipment) => shipment.quantity > 0)).toBe(true);
			// Deterministic priority: an identical rerun ships identically.
			expect(build().shipments).toEqual(state.shipments);
		});

		it('recomputes space after a same-tick warehouse pull frees room', () => {
			// Two disjoint rail lines sharing one city pool (two warehouses →
			// 400 capacity, prefilled with 200 grain — exactly the raw share
			// the 200-unit finished reserve allows). The mill's same-tick pull
			// frees 10 units on the level-1 y=4 line; the farm's push on the
			// level-3 y=8 line (30-unit budget) then ships into exactly that
			// freed room — and no further, retaining the unshipped 20.
			const warehouseA = makeBuilding('industry-building-1', 'warehouse', 2, 2);
			const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
			const farm = makeBuilding('industry-building-3', 'grain-farm', 2, 6, { grain: 30 });
			const warehouseB = makeBuilding('industry-building-4', 'warehouse', 10, 6);
			const rails = [...straightRails(4, 2, 11), ...straightRails(8, 2, 11, 3)];
			const state = createRailTickState(
				makeGame(makeCity(rails), [warehouseA, mill, farm, warehouseB]),
				{ materials: { grain: 200 } }
			);

			const pulled = pullViaRail(state, mill, 'grain', getRailCellDailyCapacity(1));
			expect(pulled.fromWarehouse).toBe(getRailCellDailyCapacity(1));
			expect(state.cityInventory.materials.grain).toBe(200 - getRailCellDailyCapacity(1));

			pushSurplusViaRail(state, farm);

			expect(state.cityInventory.materials.grain).toBe(200);
			expect(state.inventories.get('industry-building-3')!.grain).toBe(
				30 - getRailCellDailyCapacity(1)
			);
			expect(state.shipments.map((shipment) => shipment.kind)).toEqual([
				'pull-warehouse',
				'push-warehouse'
			]);
			expect(state.shipments[1]).toMatchObject({ quantity: getRailCellDailyCapacity(1) });
			expect(state.usage['industry-city:5,4']).toBe(getRailCellDailyCapacity(1));
			expect(state.usage['industry-city:5,8']).toBe(getRailCellDailyCapacity(1));
		});
	});
});

describe('demolish-mid-trunk-then-retick integration', () => {
	// Layout: grain-farm at (2,2), flour-mill at (10,2), trunk rail at y=4
	// from x=2..11. The farm produces grain (raw stage); the mill pulls
	// grain via rail (process stage). Demolishing the trunk and re-running
	// the production tick must stop rail shipments and force the mill to
	// import grain instead.
	it('stops rail shipments and switches to imports after trunk demolish', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2);
		const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const game = makeGame(makeCity(straightRails(4, 2, 11)), [farm, mill]);

		// Tick 1: mill pulls grain from farm via rail.
		const tick1 = simulateIndustryProduction(game);
		expect(tick1.report.railShipments.length).toBeGreaterThan(0);
		expect(tick1.report.railShipments.some((s) => s.materialId === 'grain')).toBe(true);

		// Demolish the trunk segment containing cell (5,4).
		const network = buildRailNetwork(tick1.game.industryCities[0]!);
		const segments = deriveRailSegments(network, tick1.game.industrialBuildings);
		const trunk = segments.find((seg) => seg.cellKeys.includes('5,4'))!;
		expect(trunk).toBeDefined();
		const afterDemolish = demolishRailSegment(tick1.game, 'industry-city', trunk.id);
		const remainingKeys = new Set(
			afterDemolish.industryCities[0]!.rails.map((c) => railCellKey(c.x, c.y))
		);
		expect(remainingKeys.has('5,4')).toBe(false);

		// Tick 2: mill can no longer pull grain via rail — no rail shipments,
		// and the mill must import grain to keep producing.
		const tick2 = simulateIndustryProduction(afterDemolish);
		expect(tick2.report.railShipments).toHaveLength(0);
		expect(tick2.report.importedInputs.some((imp) => imp.materialId === 'grain')).toBe(true);
	});
});
