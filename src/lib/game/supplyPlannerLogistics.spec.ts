import { describe, expect, it } from 'vitest';
import { canonicalQuantity, getCityInventory, getCityInventoryStats } from './cityInventory';
import {
	buildSupplyPlannerLogisticsSnapshot,
	createSupplyPlannerLogisticsState,
	processSupplyPlannerRouteDispatches,
	processSupplyPlannerTransferArrivals,
	type SupplyPlannerLogisticsState
} from './supplyPlannerLogistics';
import {
	createTwoIndustryCityGame,
	withCityMaterials,
	withRecurringRoutes,
	withWarehouses
} from './interCityLogistics.testUtils';
import { processRecurringRouteDispatches, processTransferArrivals } from './interCityLogistics';
import { createNewGame } from './state';
import { projectSupplySnapshot, type SupplyPlannerSnapshot } from './supplyPlanner';
import type { CityInventory, RecurringRoute, TransferOrder, WorldCityId } from './types';

function route(overrides: Partial<RecurringRoute> = {}): RecurringRoute {
	return {
		id: 'route-1',
		originCityId: 'breadbasket-basin',
		destinationCityId: 'industry-city',
		materialId: 'water',
		capacity: 4,
		frequencyDays: 7,
		leadTimeDays: 2,
		transportCostPerUnit: 3,
		priority: 1,
		state: 'active',
		nextDispatchOnDay: 7,
		...overrides
	};
}

function inventory(
	cityId: CityInventory['cityId'],
	materials: CityInventory['materials']
): CityInventory {
	return { cityId, materials };
}

function order(overrides: Partial<TransferOrder> = {}): TransferOrder {
	return {
		id: 'transfer-1',
		source: { kind: 'manual' },
		originCityId: 'breadbasket-basin',
		destinationCityId: 'industry-city',
		materialId: 'water',
		quantity: 2,
		createdOnDay: 1,
		dispatchedOnDay: 1,
		arrivalOnDay: 7,
		transportCost: 6,
		status: 'in-transit',
		...overrides
	};
}

function projectionSnapshot(overrides: Partial<SupplyPlannerSnapshot> = {}): SupplyPlannerSnapshot {
	return {
		retailCityId: 'harbor-city',
		supplyCityId: 'industry-city',
		finishedMaterialId: 'bottled-water',
		cash: 0,
		demandContributors: [],
		demandPerDay: 1.5,
		finishedImportCostPerUnit: 2,
		inventory: { 'bottled-water': 4.75 },
		warehouseCapacity: 20,
		warehouseUsed: 4,
		buildings: [],
		usableBuildingIds: [],
		disconnectedBuildingIds: [],
		usableSinkBuildingIdsByMaterial: {},
		reachableDemandByMaterial: {},
		reachableDemandByBuildingAndMaterial: {},
		reachableBranchesByBuildingAndMaterial: {},
		reachableProcessorsByBuildingAndMaterial: {},
		warehouseConnectedConsumerCapacityByMaterial: {},
		warehouseConnectedProcessorsByMaterial: {},
		logistics: {
			currentDay: 5,
			remoteCities: [
				{
					inventory: inventory('breadbasket-basin', { 'bottled-water': 20 }),
					warehouseCapacity: 20
				}
			],
			inTransitOrders: [],
			routes: [
				route({
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'bottled-water',
					capacity: 3,
					nextDispatchOnDay: 5
				})
			],
			nextRouteSequence: 2,
			nextTransferSequence: 1
		},
		...overrides
	};
}

describe('supply planner logistics projection state', () => {
	it('copies remote cities while excluding the selected city', () => {
		const game = createTwoIndustryCityGame({ day: 7 });
		const routes = [route()];
		const withRoutes = withRecurringRoutes(game, routes);
		const snapshot = buildSupplyPlannerLogisticsSnapshot(withRoutes, 'industry-city');

		expect(snapshot.currentDay).toBe(7);
		expect(snapshot.remoteCities.map((row) => row.inventory.cityId)).toEqual(['breadbasket-basin']);
		expect(snapshot.remoteCities.some((row) => row.inventory.cityId === 'industry-city')).toBe(
			false
		);
		expect(snapshot.inTransitOrders).toEqual([]);
		expect(snapshot.inTransitInventory).toEqual([]);
		expect(snapshot.routes).toEqual(routes);

		const remote = snapshot.remoteCities[0]!;
		withRoutes.cityInventories.find((row) => row.cityId === 'breadbasket-basin')!.materials.water =
			99;
		withRoutes.logistics.recurringRoutes[0]!.capacity = 99;
		expect(remote.inventory.materials.water).toBe(1);
		expect(snapshot.routes[0]!.capacity).toBe(4);
	});

	it('isolates copied in-transit orders and preserves the authoritative sequence', () => {
		const sourceOrder = order({ id: 'transfer-1', quantity: 2 });
		const expectedOrder = structuredClone(sourceOrder);
		const base = withWarehouses(createTwoIndustryCityGame({ day: 7 }), [
			'industry-city',
			'breadbasket-basin'
		]);
		const game = {
			...base,
			logistics: {
				...base.logistics,
				transferOrders: [sourceOrder],
				nextTransferSequence: 42
			}
		};
		const snapshot = buildSupplyPlannerLogisticsSnapshot(game, 'industry-city');

		expect(snapshot.inTransitOrders).toEqual([expectedOrder]);
		expect(snapshot.inTransitInventory).toEqual([
			{
				destinationCityId: 'industry-city',
				materialId: 'water',
				quantity: 2,
				orderIds: ['transfer-1'],
				earliestArrivalOnDay: 7
			}
		]);
		expect(snapshot.nextTransferSequence).toBe(42);

		game.logistics.transferOrders[0]!.quantity = 99;
		game.logistics.transferOrders[0]!.status = 'delivered';
		expect(snapshot.inTransitOrders).toEqual([expectedOrder]);
	});

	it('uses the copied live transfer sequence after historical orders', () => {
		let game = withWarehouses(createTwoIndustryCityGame({ day: 7 }), [
			'industry-city',
			'breadbasket-basin'
		]);
		game = withCityMaterials(
			withCityMaterials(game, 'industry-city', { 'bottled-water': 4 }),
			'breadbasket-basin',
			{}
		);
		game = withRecurringRoutes(game, [
			route({
				id: 'route-historical-sequence',
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'bottled-water',
				capacity: 3,
				nextDispatchOnDay: 7
			})
		]);
		game = {
			...game,
			logistics: {
				...game.logistics,
				transferOrders: [
					order({
						id: 'transfer-1',
						materialId: 'bottled-water',
						arrivalOnDay: 99
					})
				],
				nextTransferSequence: 42
			}
		};

		const logistics = buildSupplyPlannerLogisticsSnapshot(game, 'industry-city');
		const selected = getCityInventory(game, 'industry-city');
		expect(selected.ok).toBe(true);
		if (!selected.ok) return;
		const state = createSupplyPlannerLogisticsState({
			selectedInventory: selected.inventory,
			selectedWarehouseCapacity: getCityInventoryStats(game, 'industry-city').capacity,
			logistics
		});
		const dispatched = processSupplyPlannerRouteDispatches(state, game.day);
		const generated = dispatched.state.inTransitOrders.find(
			(candidate) => candidate.source.kind === 'recurring-route'
		);

		expect(generated?.id).toBe('transfer-42');
	});

	it('matches route-day integer mechanics and preserves zero-quantity attempts', () => {
		const initial: SupplyPlannerLogisticsState = {
			selectedIntegerInventory: inventory('industry-city', { water: 4 }),
			remoteIntegerInventories: [inventory('breadbasket-basin', { water: 4 })],
			selectedWarehouseCapacity: 10,
			remoteWarehouseCapacities: { 'breadbasket-basin': 10 },
			inTransitOrders: [order()],
			routes: [
				route({ id: 'route-2', capacity: 4, priority: 2 }),
				route({ id: 'route-1', capacity: 4, priority: 1 })
			],
			nextTransferSequence: 2
		};

		const arrived = processSupplyPlannerTransferArrivals(initial, 7);
		const dispatched = processSupplyPlannerRouteDispatches(arrived.state, 7);

		expect(arrived.arrivals).toEqual([
			expect.objectContaining({ transferOrderId: 'transfer-1', quantity: 2 })
		]);
		expect(dispatched.attempts.map((attempt) => attempt.routeId)).toEqual(['route-1', 'route-2']);
		expect(dispatched.attempts.map((attempt) => attempt.dispatchedQuantity)).toEqual([4, 0]);
		expect(dispatched.attempts[1]).toEqual(
			expect.objectContaining({
				destinationNeed: 0,
				availableOriginStock: 0,
				dispatchedQuantity: 0,
				transferOrderId: null
			})
		);
		expect(dispatched.scheduledTransportCost).toBe(12);
		expect(Number.isSafeInteger(dispatched.selectedWarehouseUsed)).toBe(true);
		expect(dispatched.state.selectedIntegerInventory.materials.water).toBe(6);
		expect(dispatched.state.routes.map((current) => current.nextDispatchOnDay)).toEqual([14, 14]);
		expect(canonicalQuantity(4.75)).toBe(4);
	});

	it('matches the live one-day arrival and dispatch integer phase', () => {
		let game = withWarehouses(createTwoIndustryCityGame({ day: 7 }), [
			'industry-city',
			'breadbasket-basin'
		]);
		const routes = [
			route({ id: 'route-1', capacity: 1, priority: 1 }),
			route({ id: 'route-2', capacity: 2, priority: 2 })
		];
		game = withRecurringRoutes(game, routes);
		game = {
			...game,
			logistics: {
				...game.logistics,
				transferOrders: [order({ arrivalOnDay: 7, quantity: 2 })],
				nextTransferSequence: 2
			}
		};

		const liveArrived = processTransferArrivals(game);
		const live = processRecurringRouteDispatches(liveArrived.game);
		const logistics = buildSupplyPlannerLogisticsSnapshot(game, 'industry-city');
		const selected = getCityInventory(game, 'industry-city');
		expect(selected.ok).toBe(true);
		if (!selected.ok) return;
		const plannerStarted = createSupplyPlannerLogisticsState({
			selectedInventory: selected.inventory,
			selectedWarehouseCapacity: getCityInventoryStats(game, 'industry-city').capacity,
			logistics
		});
		const plannerArrived = processSupplyPlannerTransferArrivals(plannerStarted, game.day);
		const planner = processSupplyPlannerRouteDispatches(plannerArrived.state, game.day);

		expect(plannerArrived.arrivals).toEqual(liveArrived.arrivals);
		expect(planner.attempts).toEqual(live.attempts);
		expect(planner.scheduledTransportCost).toBe(live.scheduledTransportCost);
		expect(planner.state.routes.map((current) => [current.id, current.nextDispatchOnDay])).toEqual(
			live.game.logistics.recurringRoutes.map((current) => [current.id, current.nextDispatchOnDay])
		);
		expect(planner.state.selectedIntegerInventory).toEqual(
			live.game.cityInventories.find((inventory) => inventory.cityId === 'industry-city')
		);
		expect(planner.state.remoteIntegerInventories).toEqual([
			live.game.cityInventories.find((inventory) => inventory.cityId === 'breadbasket-basin')
		]);
	});

	it('keeps selected and remote inventories integer-only after an arrival', () => {
		const game = withCityMaterials(createNewGame('convenience', 20260814), 'industry-city', {
			water: 1
		});
		const snapshot = buildSupplyPlannerLogisticsSnapshot(game, 'industry-city');
		const selected = snapshot.remoteCities.find((row) => row.inventory.cityId === 'industry-city');
		expect(selected).toBeUndefined();
	});

	it('crosses fractional expected stock into integer route stock without throwing', () => {
		const projection = projectSupplySnapshot(projectionSnapshot());
		const row = projection.materials.find((material) => material.materialId === 'bottled-water')!;

		expect(row.sevenDay.startingInventoryUnits).toBe(4.75);
		expect(row.sevenDay.localAvailableUnits).toBeGreaterThan(0);
		expect(row.sevenDay.importRequiredUnits).toBeGreaterThan(0);
		expect(Number.isSafeInteger(row.sevenDay.endingInventoryUnits)).toBe(true);
		expect(projection.limitations).not.toContainEqual(
			expect.objectContaining({ kind: 'remote-origin-production-not-modeled' })
		);
	});

	it('crosses fractional selected outbound stock and matches live integer dispatch', () => {
		let game = withWarehouses(createTwoIndustryCityGame({ day: 7 }), [
			'industry-city',
			'breadbasket-basin'
		]);
		game = withCityMaterials(
			withCityMaterials(game, 'industry-city', { 'bottled-water': 4 }),
			'breadbasket-basin',
			{}
		);
		const outboundRoute = route({
			id: 'route-selected-outbound',
			originCityId: 'industry-city',
			destinationCityId: 'breadbasket-basin',
			materialId: 'bottled-water',
			capacity: 3,
			nextDispatchOnDay: 7
		});
		game = withRecurringRoutes(game, [outboundRoute]);
		game = {
			...game,
			logistics: { ...game.logistics, transferOrders: [], nextTransferSequence: 42 }
		};

		const live = processRecurringRouteDispatches(game);
		const logistics = buildSupplyPlannerLogisticsSnapshot(game, 'industry-city');
		const selected = getCityInventory(game, 'industry-city');
		expect(selected.ok).toBe(true);
		if (!selected.ok) return;
		const planner = processSupplyPlannerRouteDispatches(
			createSupplyPlannerLogisticsState({
				selectedInventory: selected.inventory,
				selectedWarehouseCapacity: getCityInventoryStats(game, 'industry-city').capacity,
				logistics
			}),
			game.day
		);

		expect(planner.attempts).toEqual(live.attempts);
		expect(planner.state.selectedIntegerInventory).toEqual(
			live.game.cityInventories.find((row) => row.cityId === 'industry-city')
		);
		expect(planner.attempts[0]!.dispatchedQuantity).toBe(3);
		expect(canonicalQuantity(4.75)).toBe(4);
		expect(4.75 - planner.attempts[0]!.dispatchedQuantity).toBe(1.75);

		const projection = projectSupplySnapshot(
			projectionSnapshot({
				inventory: { 'bottled-water': 4.75 },
				logistics: {
					...projectionSnapshot().logistics!,
					currentDay: 7,
					remoteCities: [{ inventory: inventory('breadbasket-basin', {}), warehouseCapacity: 20 }],
					routes: [outboundRoute],
					nextTransferSequence: 42
				}
			})
		);
		const row = projection.materials.find((material) => material.materialId === 'bottled-water')!;
		expect(row.sevenDay.importRequiredUnits).toBe(8.75);
		expect(row.sevenDay.endingInventoryUnits).toBe(0);
	});

	it('reports remote-origin stock uncertainty only for a constrained remote route', () => {
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				logistics: {
					...projectionSnapshot().logistics!,
					remoteCities: [
						{
							inventory: inventory('breadbasket-basin', {}),
							warehouseCapacity: 20
						}
					],
					routes: [
						route({
							originCityId: 'breadbasket-basin',
							destinationCityId: 'industry-city',
							nextDispatchOnDay: 5
						})
					]
				}
			})
		);

		expect(projection.limitations).toContainEqual({
			kind: 'remote-origin-production-not-modeled',
			routeIds: ['route-1']
		});
	});

	it('does not back-credit a day-20 arrival into day-5 shortage evidence', () => {
		const base = projectionSnapshot({ inventory: {} });
		const projection = projectSupplySnapshot({
			...base,
			logistics: {
				...base.logistics!,
				routes: [],
				inTransitOrders: [
					order({
						id: 'transfer-9',
						materialId: 'bottled-water',
						quantity: 5,
						arrivalOnDay: 20,
						transportCost: 15
					})
				]
			}
		});
		const row = projection.materials.find((material) => material.materialId === 'bottled-water')!;

		expect(row.sevenDay.importRequiredUnits).toBe(10.5);
		expect(row.thirtyDay.importRequiredUnits).toBeLessThan(45);
		expect(row.projectedStockoutDay).toBe(0);
	});

	it('keeps the earliest arrival when a projected dispatch precedes an in-transit order', () => {
		const base = projectionSnapshot({ inventory: { 'bottled-water': 4.75 } });
		const projection = projectSupplySnapshot({
			...base,
			logistics: {
				...base.logistics!,
				remoteCities: [
					{
						inventory: inventory('breadbasket-basin', { 'bottled-water': 20 }),
						warehouseCapacity: 20
					}
				],
				routes: [
					route({
						id: 'route-early-dispatch',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'bottled-water',
						capacity: 3,
						frequencyDays: 7,
						leadTimeDays: 1,
						nextDispatchOnDay: 5
					})
				],
				inTransitOrders: [
					order({
						id: 'transfer-late',
						source: { kind: 'recurring-route', routeId: 'route-early-dispatch' },
						materialId: 'bottled-water',
						arrivalOnDay: 20
					})
				]
			}
		});
		const forecast = projection.routeForecasts?.find(
			(row) => row.route.id === 'route-early-dispatch'
		);

		expect(forecast?.firstProjectedArrivalDay).toBe(6);
	});
});

describe('supply planner logistics error and edge-case paths', () => {
	it('throws when a transfer arrival destination is invalid', () => {
		const state: SupplyPlannerLogisticsState = {
			selectedIntegerInventory: inventory('industry-city', { water: 4 }),
			remoteIntegerInventories: [inventory('breadbasket-basin', { water: 4 })],
			selectedWarehouseCapacity: 10,
			remoteWarehouseCapacities: { 'breadbasket-basin': 10 },
			inTransitOrders: [order({ destinationCityId: 'nonexistent-city' as WorldCityId })],
			routes: [],
			nextTransferSequence: 2
		};

		expect(() => processSupplyPlannerTransferArrivals(state, 7)).toThrow(
			'Transfer arrival destination is invalid: nonexistent-city'
		);
	});

	it('throws when a recurring route origin is invalid', () => {
		const state: SupplyPlannerLogisticsState = {
			selectedIntegerInventory: inventory('industry-city', { water: 4 }),
			remoteIntegerInventories: [inventory('breadbasket-basin', { water: 4 })],
			selectedWarehouseCapacity: 10,
			remoteWarehouseCapacities: { 'breadbasket-basin': 10 },
			inTransitOrders: [],
			routes: [
				route({
					originCityId: 'nonexistent-city' as WorldCityId,
					destinationCityId: 'industry-city',
					nextDispatchOnDay: 7
				})
			],
			nextTransferSequence: 2
		};

		expect(() => processSupplyPlannerRouteDispatches(state, 7)).toThrow(
			'Recurring route origin is invalid: nonexistent-city'
		);
	});

	it('throws when a recurring route destination is invalid', () => {
		const state: SupplyPlannerLogisticsState = {
			selectedIntegerInventory: inventory('industry-city', { water: 4 }),
			remoteIntegerInventories: [inventory('breadbasket-basin', { water: 4 })],
			selectedWarehouseCapacity: 10,
			remoteWarehouseCapacities: { 'breadbasket-basin': 10 },
			inTransitOrders: [],
			routes: [
				route({
					originCityId: 'breadbasket-basin',
					destinationCityId: 'nonexistent-city' as WorldCityId,
					nextDispatchOnDay: 7
				})
			],
			nextTransferSequence: 2
		};

		expect(() => processSupplyPlannerRouteDispatches(state, 7)).toThrow(
			'Recurring route destination is invalid: nonexistent-city'
		);
	});

	it('dispatches from a remote origin alongside other remote cities that do not match', () => {
		// Multiple remote inventories exercise the false arm of the
		// ternary at line 263 (inventory.cityId !== route.originCityId).
		const state: SupplyPlannerLogisticsState = {
			selectedIntegerInventory: inventory('industry-city', {}),
			remoteIntegerInventories: [
				inventory('breadbasket-basin', { water: 10 }),
				inventory('harbor-city' as WorldCityId, { grain: 5 })
			],
			selectedWarehouseCapacity: 100,
			remoteWarehouseCapacities: {
				'breadbasket-basin': 100,
				'harbor-city': 100
			},
			inTransitOrders: [],
			routes: [
				route({
					originCityId: 'breadbasket-basin',
					destinationCityId: 'industry-city',
					capacity: 4,
					nextDispatchOnDay: 7
				})
			],
			nextTransferSequence: 2
		};

		const dispatched = processSupplyPlannerRouteDispatches(state, 7);
		expect(dispatched.attempts[0]!.dispatchedQuantity).toBe(4);
		// The non-matching remote city is preserved unchanged.
		expect(
			dispatched.state.remoteIntegerInventories.find((i) => i.cityId === 'harbor-city')
		).toEqual(inventory('harbor-city' as WorldCityId, { grain: 5 }));
		// The matching remote city's stock is decremented.
		expect(
			dispatched.state.remoteIntegerInventories.find((i) => i.cityId === 'breadbasket-basin')!
				.materials.water
		).toBe(6);
	});

	it('sorts transfer orders by id when multiple are due on the same day', () => {
		// Multiple due orders with different ids exercise both arms of
		// the compareTransferOrderIds comparator (line 347).
		const state: SupplyPlannerLogisticsState = {
			selectedIntegerInventory: inventory('industry-city', {}),
			remoteIntegerInventories: [inventory('breadbasket-basin', {})],
			selectedWarehouseCapacity: 100,
			remoteWarehouseCapacities: { 'breadbasket-basin': 100 },
			inTransitOrders: [
				order({ id: 'transfer-z', quantity: 1, arrivalOnDay: 7 }),
				order({ id: 'transfer-a', quantity: 1, arrivalOnDay: 7 }),
				order({ id: 'transfer-m', quantity: 1, arrivalOnDay: 7 })
			],
			routes: [],
			nextTransferSequence: 10
		};

		const arrived = processSupplyPlannerTransferArrivals(state, 7);
		expect(arrived.arrivals.map((a) => a.transferOrderId)).toEqual([
			'transfer-a',
			'transfer-m',
			'transfer-z'
		]);
	});

	it('throws when the next transfer sequence overflows the safe integer range', () => {
		const state: SupplyPlannerLogisticsState = {
			selectedIntegerInventory: inventory('industry-city', {}),
			remoteIntegerInventories: [inventory('breadbasket-basin', { water: 10 })],
			selectedWarehouseCapacity: 100,
			remoteWarehouseCapacities: { 'breadbasket-basin': 100 },
			inTransitOrders: [],
			routes: [
				route({
					originCityId: 'breadbasket-basin',
					destinationCityId: 'industry-city',
					capacity: 1,
					nextDispatchOnDay: 7
				})
			],
			nextTransferSequence: Number.MAX_SAFE_INTEGER
		};

		expect(() => processSupplyPlannerRouteDispatches(state, 7)).toThrow(
			'Next transfer sequence exceeds the safe integer range'
		);
	});

	it('throws when the scheduled transport cost overflows the safe integer range', () => {
		const state: SupplyPlannerLogisticsState = {
			selectedIntegerInventory: inventory('industry-city', {}),
			remoteIntegerInventories: [inventory('breadbasket-basin', { water: 10 })],
			selectedWarehouseCapacity: 100,
			remoteWarehouseCapacities: { 'breadbasket-basin': 100 },
			inTransitOrders: [],
			routes: [
				route({
					originCityId: 'breadbasket-basin',
					destinationCityId: 'industry-city',
					capacity: 2,
					transportCostPerUnit: Number.MAX_SAFE_INTEGER,
					nextDispatchOnDay: 7
				})
			],
			nextTransferSequence: 2
		};

		expect(() => processSupplyPlannerRouteDispatches(state, 7)).toThrow(
			'Recurring route transport cost exceeds the safe integer range'
		);
	});

	it('skips a remote city with no city inventory when building the logistics snapshot', () => {
		// A city that is opened but has no cityInventory entry causes
		// getCityInventory to return not-ok, exercising the early
		// return at line 84.
		const game = createTwoIndustryCityGame({ materials: false });
		const withoutInventory = {
			...game,
			cityInventories: game.cityInventories.filter((i) => i.cityId !== 'breadbasket-basin')
		};
		const snapshot = buildSupplyPlannerLogisticsSnapshot(withoutInventory, 'industry-city');
		expect(snapshot.remoteCities).toEqual([]);
	});

	it('sorts remote cities by world city id when multiple are opened', () => {
		// With multiple industry cities opened as remote cities, the
		// sort comparator at line 81 fires. 'breadbasket-basin' <
		// 'industry-city' < 'quarry-works', so breadbasket-basin
		// should come first.
		let game = createTwoIndustryCityGame({ materials: false });
		// Open quarry-works as a third industry city
		game = {
			...game,
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'quarry-works'],
				openedCityIds: [...game.world.openedCityIds, 'quarry-works']
			},
			industryCities: [
				...game.industryCities,
				{
					id: 'quarry-works',
					name: 'Quarry Works',
					width: 56,
					height: 48,
					tiles: [],
					rails: []
				}
			],
			cityInventories: [...game.cityInventories, { cityId: 'quarry-works', materials: {} }]
		};
		const snapshot = buildSupplyPlannerLogisticsSnapshot(game, 'industry-city');
		expect(snapshot.remoteCities.map((r) => r.inventory.cityId)).toEqual([
			'breadbasket-basin',
			'quarry-works'
		]);
	});
});
