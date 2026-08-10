import { describe, expect, test, vi } from 'vitest';
import {
	selectInTransitInventory,
	selectLogisticsTotals,
	selectRecentRouteDispatchAttempts,
	selectRecentTransfers,
	selectRouteOperations
} from './logisticsReadModels';
import { simulateDay } from './simulateDay';
import { createNewGame } from './state';
import type {
	DailyRouteDispatchAttempt,
	DailyReport,
	GameState,
	RecurringRoute,
	TransferOrder
} from './types';

function reportTemplate(): DailyReport {
	return simulateDay(createNewGame('convenience', 20260806)).reports[0]!;
}

function transferOrder(overrides: Partial<TransferOrder> = {}): TransferOrder {
	return {
		id: 'transfer-1',
		source: { kind: 'manual' },
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		quantity: 4,
		createdOnDay: 7,
		dispatchedOnDay: 7,
		arrivalOnDay: 9,
		transportCost: 8,
		status: 'in-transit',
		...overrides
	};
}

function recurringRoute(overrides: Partial<RecurringRoute> = {}): RecurringRoute {
	return {
		id: 'route-1',
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		capacity: 30,
		frequencyDays: 3,
		leadTimeDays: 2,
		transportCostPerUnit: 2,
		priority: 1,
		state: 'active',
		nextDispatchOnDay: 7,
		...overrides
	};
}

function routeAttempt(
	overrides: Partial<DailyRouteDispatchAttempt> = {}
): DailyRouteDispatchAttempt {
	return {
		routeId: 'route-1',
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		destinationNeed: 20,
		capacity: 20,
		availableOriginStock: 20,
		dispatchedQuantity: 5,
		unusedCapacity: 15,
		unmetDestinationNeed: 15,
		transportCost: 10,
		transferOrderId: 'transfer-1',
		...overrides
	};
}

function report(day: number, routeDispatchAttempts: DailyRouteDispatchAttempt[]): DailyReport {
	const template = reportTemplate();
	return {
		...template,
		day,
		logistics: {
			...template.logistics,
			arrivals: [...template.logistics.arrivals],
			routeDispatchAttempts,
			scheduledTransportCost: routeDispatchAttempts.reduce(
				(total, attempt) => total + attempt.transportCost,
				0
			)
		}
	};
}

function gameWithLogistics(input: {
	transferOrders?: TransferOrder[];
	recurringRoutes?: RecurringRoute[];
	reports?: DailyReport[];
}): GameState {
	const game = createNewGame('convenience', 20260806);

	return {
		...game,
		logistics: {
			...game.logistics,
			transferOrders: input.transferOrders ?? [],
			recurringRoutes: input.recurringRoutes ?? []
		},
		reports: input.reports ?? []
	};
}

describe('logistics read models', () => {
	test('groups in-transit inventory by destination and material with catalog, material, and raw-ID sorting', () => {
		const game = gameWithLogistics({
			transferOrders: [
				transferOrder({
					id: 'transfer-2',
					destinationCityId: 'industry-city',
					materialId: 'grain',
					quantity: 3,
					arrivalOnDay: 8
				}),
				transferOrder({
					id: 'transfer-10',
					destinationCityId: 'industry-city',
					materialId: 'grain',
					quantity: 4,
					arrivalOnDay: 6
				}),
				transferOrder({
					id: 'transfer-1',
					destinationCityId: 'industry-city',
					materialId: 'water',
					quantity: 5,
					arrivalOnDay: 7
				}),
				transferOrder({ id: 'transfer-3', quantity: 6, arrivalOnDay: 9 }),
				transferOrder({
					id: 'transfer-delivered',
					destinationCityId: 'industry-city',
					materialId: 'grain',
					quantity: 100,
					status: 'delivered'
				})
			]
		});
		const before = structuredClone(game);
		const localeCompare = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
			throw new Error('logistics read-model ordering must not depend on locale');
		});

		try {
			expect(selectInTransitInventory(game)).toEqual([
				{
					destinationCityId: 'industry-city',
					materialId: 'grain',
					quantity: 7,
					orderIds: ['transfer-10', 'transfer-2'],
					earliestArrivalOnDay: 6
				},
				{
					destinationCityId: 'industry-city',
					materialId: 'water',
					quantity: 5,
					orderIds: ['transfer-1'],
					earliestArrivalOnDay: 7
				},
				{
					destinationCityId: 'breadbasket-basin',
					materialId: 'water',
					quantity: 6,
					orderIds: ['transfer-3'],
					earliestArrivalOnDay: 9
				}
			]);
		} finally {
			localeCompare.mockRestore();
		}

		expect(game).toEqual(before);
	});

	test('sorts recent transfers by dispatch day and raw transfer ID descending with a default limit of 20', () => {
		const archivedOrders = Array.from({ length: 18 }, (_, index) =>
			transferOrder({
				id: `archived-${index}`,
				dispatchedOnDay: 1,
				arrivalOnDay: 2
			})
		);
		const game = gameWithLogistics({
			transferOrders: [
				...archivedOrders,
				transferOrder({ id: 'transfer-10', dispatchedOnDay: 9 }),
				transferOrder({ id: 'transfer-2', dispatchedOnDay: 9 }),
				transferOrder({ id: 'transfer-newest', dispatchedOnDay: 10 })
			]
		});

		const recent = selectRecentTransfers(game);

		expect(recent).toHaveLength(20);
		expect(recent.slice(0, 3).map((order) => order.id)).toEqual([
			'transfer-newest',
			'transfer-2',
			'transfer-10'
		]);
		expect(recent.some((order) => order.id === 'archived-0')).toBe(false);
	});

	test('derives current route operations from route orders and the latest recorded attempt capacity', () => {
		const routeThree = recurringRoute({ id: 'route-3', priority: 0 });
		const routeTen = recurringRoute({ id: 'route-10', priority: 1, capacity: 50 });
		const routeTwo = recurringRoute({ id: 'route-2', priority: 1, capacity: 20 });
		const earlierAttempt = routeAttempt({
			routeId: 'route-2',
			capacity: 20,
			dispatchedQuantity: 20,
			unusedCapacity: 0,
			unmetDestinationNeed: 10,
			transportCost: 40,
			transferOrderId: 'transfer-earlier'
		});
		const latestAttempt = routeAttempt({
			routeId: 'route-2',
			capacity: 20,
			dispatchedQuantity: 5,
			unusedCapacity: 15,
			unmetDestinationNeed: 3,
			transportCost: 10,
			transferOrderId: 'transfer-latest'
		});
		const game = gameWithLogistics({
			transferOrders: [
				transferOrder({
					id: 'transfer-route-3',
					source: { kind: 'recurring-route', routeId: 'route-3' },
					quantity: 7,
					transportCost: 14,
					status: 'delivered'
				}),
				transferOrder({
					id: 'transfer-route-10',
					source: { kind: 'recurring-route', routeId: 'route-10' },
					quantity: 6,
					transportCost: 18
				}),
				transferOrder({
					id: 'transfer-route-2-transit',
					source: { kind: 'recurring-route', routeId: 'route-2' },
					quantity: 4,
					transportCost: 12
				}),
				transferOrder({
					id: 'transfer-route-2-delivered',
					source: { kind: 'recurring-route', routeId: 'route-2' },
					quantity: 8,
					transportCost: 24,
					status: 'delivered'
				})
			],
			recurringRoutes: [routeTwo, routeTen, routeThree],
			reports: [report(8, [earlierAttempt]), report(9, [latestAttempt])]
		});
		const localeCompare = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
			throw new Error('route ordering must not depend on locale');
		});

		try {
			const summaries = selectRouteOperations(game);

			expect(summaries.map((summary) => summary.route.id)).toEqual([
				'route-3',
				'route-10',
				'route-2'
			]);
			expect(summaries.find((summary) => summary.route.id === 'route-2')).toMatchObject({
				route: routeTwo,
				inTransitQuantity: 4,
				latestAttempt,
				condition: 'normal',
				utilization: 0.25,
				unusedCapacity: 15,
				unmetDestinationNeed: 3,
				deliveredUnits: 8,
				transportCost: 36
			});
			expect(summaries.find((summary) => summary.route.id === 'route-10')).toMatchObject({
				route: routeTen,
				inTransitQuantity: 6,
				latestAttempt: null,
				condition: 'awaiting-dispatch',
				utilization: null,
				unusedCapacity: 0,
				unmetDestinationNeed: 0,
				deliveredUnits: 0,
				transportCost: 18
			});
		} finally {
			localeCompare.mockRestore();
		}
	});

	test("keeps a full destination's zero need distinct from an unmet-demand interpretation", () => {
		const fullAttempt = routeAttempt({
			routeId: 'route-full',
			destinationNeed: 0,
			capacity: 30,
			dispatchedQuantity: 0,
			unusedCapacity: 30,
			unmetDestinationNeed: 0,
			transportCost: 0,
			transferOrderId: null
		});
		const metAttempt = routeAttempt({
			routeId: 'route-met',
			destinationNeed: 12,
			capacity: 30,
			dispatchedQuantity: 12,
			unusedCapacity: 18,
			unmetDestinationNeed: 0,
			transportCost: 24,
			transferOrderId: 'transfer-met'
		});
		const game = gameWithLogistics({
			recurringRoutes: [
				recurringRoute({ id: 'route-full', priority: 0 }),
				recurringRoute({ id: 'route-met', priority: 1 })
			],
			reports: [report(9, [fullAttempt, metAttempt])]
		});

		const summaries = selectRouteOperations(game);

		expect(summaries.find((summary) => summary.route.id === 'route-full')).toMatchObject({
			latestAttempt: { destinationNeed: 0, unmetDestinationNeed: 0 },
			condition: 'destination-full',
			utilization: 0,
			unusedCapacity: 30,
			unmetDestinationNeed: 0
		});
		expect(summaries.find((summary) => summary.route.id === 'route-met')).toMatchObject({
			latestAttempt: { destinationNeed: 12, unmetDestinationNeed: 0 },
			utilization: 0.4,
			unusedCapacity: 18,
			unmetDestinationNeed: 0
		});
	});

	test('classifies origin stock and route capacity constraints from the latest attempt', () => {
		const originConstrainedAttempt = routeAttempt({
			routeId: 'route-stock',
			destinationNeed: 10,
			capacity: 30,
			availableOriginStock: 0,
			dispatchedQuantity: 0,
			unusedCapacity: 30,
			unmetDestinationNeed: 10,
			transportCost: 0,
			transferOrderId: null
		});
		const capacityConstrainedAttempt = routeAttempt({
			routeId: 'route-capacity',
			destinationNeed: 40,
			capacity: 30,
			availableOriginStock: 30,
			dispatchedQuantity: 30,
			unusedCapacity: 0,
			unmetDestinationNeed: 10,
			transportCost: 60,
			transferOrderId: 'transfer-capacity'
		});
		const game = gameWithLogistics({
			recurringRoutes: [
				recurringRoute({ id: 'route-stock', priority: 0 }),
				recurringRoute({ id: 'route-capacity', priority: 1 })
			],
			reports: [report(9, [originConstrainedAttempt, capacityConstrainedAttempt])]
		});

		const summaries = selectRouteOperations(game);

		expect(summaries.find((summary) => summary.route.id === 'route-stock')).toMatchObject({
			condition: 'origin-stock-constrained'
		});
		expect(summaries.find((summary) => summary.route.id === 'route-capacity')).toMatchObject({
			condition: 'route-capacity-constrained'
		});
	});

	test('groups recent route attempts newest-first with a per-route limit', () => {
		const routeOneDaySeven = routeAttempt({ routeId: 'route-1', transferOrderId: 'transfer-7' });
		const routeTwoDaySeven = routeAttempt({ routeId: 'route-2', transferOrderId: 'transfer-2-7' });
		const routeOneDayEight = routeAttempt({ routeId: 'route-1', transferOrderId: 'transfer-8' });
		const routeOneDayNine = routeAttempt({ routeId: 'route-1', transferOrderId: 'transfer-9' });
		const routeTwoDayNine = routeAttempt({ routeId: 'route-2', transferOrderId: 'transfer-2-9' });
		const game = gameWithLogistics({
			reports: [
				report(7, [routeOneDaySeven, routeTwoDaySeven]),
				report(8, [routeOneDayEight]),
				report(9, [routeOneDayNine, routeTwoDayNine])
			]
		});

		const recent = selectRecentRouteDispatchAttempts(game, 2);

		expect([...recent.entries()]).toEqual([
			['route-1', [routeOneDayNine, routeOneDayEight]],
			['route-2', [routeTwoDayNine, routeTwoDaySeven]]
		]);
	});

	test('keeps removed-route history and totals exact over the authoritative full order collection', () => {
		const archivedOrders = Array.from({ length: 21 }, (_, index) =>
			transferOrder({
				id: `archived-${index}`,
				source: { kind: 'recurring-route', routeId: 'route-removed' },
				quantity: 1,
				dispatchedOnDay: index + 1,
				transportCost: index + 1,
				status: index % 2 === 0 ? 'delivered' : 'in-transit'
			})
		);
		const game = gameWithLogistics({
			transferOrders: [
				...archivedOrders,
				transferOrder({
					id: 'transfer-current',
					source: { kind: 'recurring-route', routeId: 'route-current' },
					quantity: 5,
					transportCost: 10,
					status: 'delivered'
				}),
				transferOrder({
					id: 'transfer-removed-delivered',
					source: { kind: 'recurring-route', routeId: 'route-removed' },
					quantity: 7,
					dispatchedOnDay: 100,
					transportCost: 17,
					status: 'delivered'
				}),
				transferOrder({
					id: 'transfer-removed-transit',
					source: { kind: 'recurring-route', routeId: 'route-removed' },
					quantity: 99,
					dispatchedOnDay: 99,
					transportCost: 13
				}),
				transferOrder({
					id: 'transfer-manual',
					quantity: 3,
					transportCost: 19,
					status: 'delivered'
				})
			],
			recurringRoutes: [recurringRoute({ id: 'route-current' })]
		});

		expect(selectRouteOperations(game).map((summary) => summary.route.id)).toEqual([
			'route-current'
		]);
		expect(
			selectRecentTransfers(game).some((order) => order.id === 'transfer-removed-delivered')
		).toBe(true);
		expect(selectLogisticsTotals(game)).toEqual({ deliveredUnits: 26, transportCost: 290 });
	});

	test('skips route dispatch attempts for removed routes and older report days', () => {
		const latestAttempt = routeAttempt({
			routeId: 'route-1',
			capacity: 30,
			dispatchedQuantity: 5,
			unusedCapacity: 25,
			unmetDestinationNeed: 5,
			transportCost: 10,
			transferOrderId: 'transfer-latest'
		});
		const olderAttempt = routeAttempt({
			routeId: 'route-1',
			capacity: 30,
			dispatchedQuantity: 30,
			unusedCapacity: 0,
			unmetDestinationNeed: 0,
			transportCost: 60,
			transferOrderId: 'transfer-older'
		});
		const removedRouteAttempt = routeAttempt({
			routeId: 'route-removed',
			capacity: 10,
			dispatchedQuantity: 10,
			unusedCapacity: 0,
			unmetDestinationNeed: 0,
			transportCost: 20,
			transferOrderId: 'transfer-removed'
		});
		const game = gameWithLogistics({
			recurringRoutes: [recurringRoute({ id: 'route-1' })],
			reports: [
				report(9, [latestAttempt]),
				report(7, [olderAttempt]),
				report(8, [removedRouteAttempt])
			]
		});

		const summaries = selectRouteOperations(game);
		const routeOne = summaries.find((summary) => summary.route.id === 'route-1');

		expect(routeOne?.latestAttempt).toEqual(latestAttempt);
		expect(routeOne?.latestAttempt).not.toEqual(olderAttempt);
		expect(summaries.some((summary) => summary.route.id === 'route-removed')).toBe(false);
	});

	test('ignores stale attempts after a recurring route edit until a matching dispatch occurs', () => {
		// updateRecurringRoute preserves the route ID while allowing origin,
		// destination, material, and capacity to change. A routeId-only match
		// would let the prior configuration's capacity-constrained attempts
		// surface as the edited route's latest dispatch and drive its condition.
		const originalRoute = recurringRoute({ id: 'route-1', capacity: 20 });
		const editedRoute: RecurringRoute = {
			...originalRoute,
			originCityId: 'quarry-works',
			destinationCityId: 'industry-city',
			materialId: 'grain',
			capacity: 30
		};
		const staleConstrainedAttempt = routeAttempt({
			routeId: 'route-1',
			originCityId: 'industry-city',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water',
			capacity: 20,
			destinationNeed: 30,
			availableOriginStock: 20,
			dispatchedQuantity: 20,
			unusedCapacity: 0,
			unmetDestinationNeed: 10,
			transportCost: 40,
			transferOrderId: 'transfer-stale'
		});
		const game = gameWithLogistics({
			recurringRoutes: [editedRoute],
			reports: [report(7, [staleConstrainedAttempt]), report(8, [staleConstrainedAttempt])]
		});

		const summaries = selectRouteOperations(game);
		const routeOne = summaries.find((summary) => summary.route.id === 'route-1');

		expect(routeOne?.latestAttempt).toBeNull();
		expect(routeOne?.condition).toBe('awaiting-dispatch');
		expect(routeOne?.utilization).toBeNull();
		expect(routeOne?.unusedCapacity).toBe(0);
		expect(routeOne?.unmetDestinationNeed).toBe(0);

		const matchingAttempt = routeAttempt({
			routeId: 'route-1',
			originCityId: 'quarry-works',
			destinationCityId: 'industry-city',
			materialId: 'grain',
			capacity: 30,
			destinationNeed: 40,
			availableOriginStock: 30,
			dispatchedQuantity: 30,
			unusedCapacity: 0,
			unmetDestinationNeed: 10,
			transportCost: 30,
			transferOrderId: 'transfer-matching'
		});
		const recoveredGame = {
			...game,
			reports: [...game.reports, report(9, [matchingAttempt])]
		};

		const recoveredSummary = selectRouteOperations(recoveredGame).find(
			(summary) => summary.route.id === 'route-1'
		);
		expect(recoveredSummary?.latestAttempt).toEqual(matchingAttempt);
		expect(recoveredSummary?.condition).toBe('route-capacity-constrained');
		expect(recoveredSummary?.utilization).toBe(1);
	});

	test('compareCurrentRoutes and compareRawIds return zero for equal IDs', () => {
		const route = recurringRoute({ id: 'route-1', priority: 1 });
		const game = gameWithLogistics({
			recurringRoutes: [route, { ...route }],
			transferOrders: [
				transferOrder({
					id: 'transfer-1',
					destinationCityId: 'industry-city',
					materialId: 'water'
				}),
				transferOrder({
					id: 'transfer-1',
					destinationCityId: 'industry-city',
					materialId: 'water',
					quantity: 2,
					arrivalOnDay: 6
				})
			]
		});

		// Duplicate IDs force the comparator's equal-ID branch (returns 0)
		// for both route sorting and order-ID sorting.
		expect(selectRouteOperations(game)).toHaveLength(2);
		expect(selectInTransitInventory(game)).toEqual([
			{
				destinationCityId: 'industry-city',
				materialId: 'water',
				quantity: 6,
				orderIds: ['transfer-1', 'transfer-1'],
				earliestArrivalOnDay: 6
			}
		]);
	});

	test('compareCurrentRoutes sorts equal-priority routes by ascending raw ID', () => {
		const routeTen = recurringRoute({ id: 'route-10', priority: 1 });
		const routeTwo = recurringRoute({ id: 'route-2', priority: 1 });
		const game = gameWithLogistics({
			// Inserted in ascending ID order ('route-10' < 'route-2' lexicographically).
			// Insertion sort calls compare(arr[i], arr[j]) with i > j, so this
			// forces compare(route-2, route-10) where left.id > right.id, hitting
			// the comparator's positive-return branch (returns 1, no swap).
			recurringRoutes: [routeTen, routeTwo]
		});

		const summaries = selectRouteOperations(game);
		expect(summaries.map((summary) => summary.route.id)).toEqual(['route-10', 'route-2']);
	});

	test('throws when aggregate totals exceed the safe integer range over the unbounded order history', () => {
		// Each order is individually a safe integer (as the persisted contract validates),
		// but the unchecked aggregate would silently lose precision. Two orders at
		// Number.MAX_SAFE_INTEGER push the sum past the safe-integer range.
		const overflowingOrders = [
			transferOrder({
				id: 'transfer-overflow-a',
				source: { kind: 'recurring-route', routeId: 'route-1' },
				quantity: Number.MAX_SAFE_INTEGER,
				transportCost: Number.MAX_SAFE_INTEGER,
				status: 'delivered'
			}),
			transferOrder({
				id: 'transfer-overflow-b',
				source: { kind: 'recurring-route', routeId: 'route-1' },
				quantity: Number.MAX_SAFE_INTEGER,
				transportCost: Number.MAX_SAFE_INTEGER,
				status: 'delivered'
			})
		];
		const game = gameWithLogistics({
			transferOrders: overflowingOrders,
			recurringRoutes: [recurringRoute({ id: 'route-1' })]
		});

		expect(() => selectLogisticsTotals(game)).toThrow(RangeError);
		expect(() => selectRouteOperations(game)).toThrow(RangeError);
	});
});
