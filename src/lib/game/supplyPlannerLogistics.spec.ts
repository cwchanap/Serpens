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
import type { CityInventory, RecurringRoute, TransferOrder } from './types';

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
		activeOutboundRouteIds: [],
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
			nextRouteSequence: 2
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
		expect(snapshot.routes).toEqual(routes);

		const remote = snapshot.remoteCities[0]!;
		withRoutes.cityInventories.find((row) => row.cityId === 'breadbasket-basin')!.materials.water =
			99;
		withRoutes.logistics.recurringRoutes[0]!.capacity = 99;
		expect(remote.inventory.materials.water).toBe(1);
		expect(snapshot.routes[0]!.capacity).toBe(4);
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
			logistics,
			nextTransferSequence: game.logistics.nextTransferSequence
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
});
