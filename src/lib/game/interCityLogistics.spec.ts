import { describe, expect, test, vi } from 'vitest';
import { getCityInventoryStats } from './cityInventory';
import {
	INTER_CITY_DISTANCE_PER_BAND,
	compareRecurringRoutes,
	createRecurringRoute,
	dispatchManualTransfer,
	getDestinationTransferNeed,
	pauseRecurringRoute,
	processTransferArrivals,
	processRecurringRouteDispatches,
	quoteInterCityTransfer,
	removeRecurringRoute,
	reprioritizeRecurringRoute,
	resumeRecurringRoute,
	updateRecurringRoute,
	type ManualTransferFailure,
	type ManualTransferInput,
	type RecurringRouteFailure,
	type RecurringRouteInput,
	type RecurringRouteUpdateInput
} from './interCityLogistics';
import {
	createTwoIndustryCityGame,
	withCityMaterials,
	withRecurringRoutes,
	withWarehouses
} from './interCityLogistics.testUtils';
import type { GameState, RecurringRoute, TransferOrder, WorldCityId } from './types';
import { openWorldCity } from './world';

function createThreeIndustryCityGame(): GameState {
	const twoCityGame = createTwoIndustryCityGame();
	const opened = openWorldCity(
		{
			...twoCityGame,
			cash: 100_000,
			world: {
				...twoCityGame.world,
				revealedCityIds: [...twoCityGame.world.revealedCityIds, 'quarry-works']
			}
		},
		'quarry-works'
	);

	return {
		...opened,
		cash: 100_000,
		cityInventories: opened.cityInventories.map((inventory) => ({
			...inventory,
			materials: { water: 100 }
		}))
	};
}

function validManualInput(overrides: Partial<ManualTransferInput> = {}): ManualTransferInput {
	return {
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		quantity: 5,
		...overrides
	};
}

function createTransferOrder(overrides: Partial<TransferOrder> = {}): TransferOrder {
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

function withTransferOrders(game: GameState, transferOrders: TransferOrder[]): GameState {
	return {
		...game,
		logistics: {
			...game.logistics,
			transferOrders
		}
	};
}

function validRecurringRouteInput(
	overrides: Partial<RecurringRouteInput> = {}
): RecurringRouteInput {
	return {
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		capacity: 30,
		frequencyDays: 3,
		leadTimeDays: 2,
		transportCostPerUnit: 2,
		priority: 1,
		...overrides
	};
}

function createRecurringRouteDefinition(overrides: Partial<RecurringRoute> = {}): RecurringRoute {
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

type ManualFailureCase = {
	name: string;
	reason: ManualTransferFailure;
	setup: () => { game: GameState; input: ManualTransferInput };
};

const manualFailureCases: readonly ManualFailureCase[] = [
	{
		name: 'an invalid origin',
		reason: 'invalid-origin',
		setup: () => ({
			game: createTwoIndustryCityGame(),
			input: validManualInput({ originCityId: 'x' })
		})
	},
	{
		name: 'an invalid destination',
		reason: 'invalid-destination',
		setup: () => ({
			game: createTwoIndustryCityGame(),
			input: validManualInput({ destinationCityId: 'harbor-city' })
		})
	},
	{
		name: 'matching endpoints',
		reason: 'same-city',
		setup: () => ({
			game: createTwoIndustryCityGame(),
			input: validManualInput({ destinationCityId: 'industry-city' })
		})
	},
	{
		name: 'an unknown material',
		reason: 'invalid-material',
		setup: () => ({
			game: createTwoIndustryCityGame(),
			input: validManualInput({ materialId: 'unknown-material' })
		})
	},
	{
		name: 'a nonpositive quantity',
		reason: 'invalid-quantity',
		setup: () => ({ game: createTwoIndustryCityGame(), input: validManualInput({ quantity: 0 }) })
	},
	{
		name: 'a quantity whose transport total exceeds safe integer range',
		reason: 'invalid-quantity',
		setup: () => {
			const game = withCityMaterials(createTwoIndustryCityGame(), 'industry-city', {
				water: Number.MAX_SAFE_INTEGER
			});
			return {
				game: { ...game, cash: Number.MAX_SAFE_INTEGER },
				input: validManualInput({ quantity: Number.MAX_SAFE_INTEGER })
			};
		}
	},
	{
		name: 'insufficient origin stock',
		reason: 'insufficient-origin-stock',
		setup: () => ({ game: createTwoIndustryCityGame(), input: validManualInput({ quantity: 51 }) })
	},
	{
		name: 'insufficient cash',
		reason: 'insufficient-cash',
		setup: () => ({
			game: { ...createTwoIndustryCityGame(), cash: 9 },
			input: validManualInput()
		})
	}
];

describe('inter-city manual logistics', () => {
	test('quotes the current industry-city pairs with the pinned distance bands', () => {
		const game = createThreeIndustryCityGame();

		expect(INTER_CITY_DISTANCE_PER_BAND).toBe(25);
		expect(quoteInterCityTransfer(game, validManualInput())).toEqual({
			ok: true,
			quote: { leadTimeDays: 2, transportCostPerUnit: 2, transportCost: 10 }
		});
		expect(
			quoteInterCityTransfer(
				game,
				validManualInput({ originCityId: 'breadbasket-basin', destinationCityId: 'quarry-works' })
			)
		).toEqual({
			ok: true,
			quote: { leadTimeDays: 2, transportCostPerUnit: 2, transportCost: 10 }
		});
		expect(
			quoteInterCityTransfer(game, validManualInput({ destinationCityId: 'quarry-works' }))
		).toEqual({
			ok: true,
			quote: { leadTimeDays: 3, transportCostPerUnit: 3, transportCost: 15 }
		});
	});

	test.each(manualFailureCases)(
		'reuses quote validation and leaves the game unchanged for $name',
		({ reason, setup }) => {
			const { game, input } = setup();
			const before = structuredClone(game);

			expect(quoteInterCityTransfer(game, input)).toEqual({ ok: false, reason });
			expect(dispatchManualTransfer(game, input)).toEqual({ ok: false, reason });
			expect(game).toEqual(before);
		}
	);

	test('dispatches a quoted manual transfer once with the full immediate cost', () => {
		const game = createTwoIndustryCityGame();
		const before = structuredClone(game);
		const input = validManualInput({ quantity: 4 });
		const quote = quoteInterCityTransfer(game, input);

		expect(quote).toEqual({
			ok: true,
			quote: { leadTimeDays: 2, transportCostPerUnit: 2, transportCost: 8 }
		});

		const result = dispatchManualTransfer(game, input);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error(`Expected successful dispatch, received ${result.reason}`);
		}

		const expectedOrder = createTransferOrder();
		expect(result.order).toEqual(expectedOrder);
		expect(result.game.cash).toBe(99_992);
		expect(
			result.game.cityInventories.find((inventory) => inventory.cityId === 'industry-city')
		).toEqual({ cityId: 'industry-city', materials: { water: 46 } });
		expect(
			result.game.cityInventories.find((inventory) => inventory.cityId === 'breadbasket-basin')
		).toEqual({ cityId: 'breadbasket-basin', materials: { water: 1, grain: 2 } });
		expect(result.game.logistics).toEqual({
			transferOrders: [expectedOrder],
			recurringRoutes: before.logistics.recurringRoutes,
			nextTransferSequence: 2,
			nextRouteSequence: before.logistics.nextRouteSequence
		});
		expect(game).toEqual(before);
	});

	test('leaves in-transit orders and inventories untouched before their arrival day', () => {
		const game = withTransferOrders(createTwoIndustryCityGame({ day: 8 }), [createTransferOrder()]);

		const result = processTransferArrivals(game);

		expect(result.arrivals).toEqual([]);
		expect(result.deliveredUnits).toBe(0);
		expect(result.game).toEqual(game);
	});

	test('delivers due transfers in raw transfer-ID order and changes only their status', () => {
		const transferTwo = createTransferOrder({
			id: 'transfer-2',
			materialId: 'grain',
			quantity: 5,
			transportCost: 10,
			arrivalOnDay: 8
		});
		const notYetDue = createTransferOrder({ id: 'transfer-1', arrivalOnDay: 9 });
		const transferTen = createTransferOrder({ id: 'transfer-10', quantity: 4, arrivalOnDay: 8 });
		const game = withTransferOrders(createTwoIndustryCityGame({ day: 8 }), [
			transferTwo,
			notYetDue,
			transferTen
		]);
		const localeCompare = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
			throw new Error('transfer arrival ordering must not depend on locale');
		});

		try {
			const result = processTransferArrivals(game);

			expect(result.arrivals).toEqual([
				{
					transferOrderId: 'transfer-10',
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'water',
					quantity: 4
				},
				{
					transferOrderId: 'transfer-2',
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'grain',
					quantity: 5
				}
			]);
			expect(result.deliveredUnits).toBe(9);
			expect(
				result.game.cityInventories.find((inventory) => inventory.cityId === 'breadbasket-basin')
			).toEqual({ cityId: 'breadbasket-basin', materials: { water: 5, grain: 7 } });
			expect(result.game.logistics.transferOrders).toEqual([
				{ ...transferTwo, status: 'delivered' },
				notYetDue,
				{ ...transferTen, status: 'delivered' }
			]);
		} finally {
			localeCompare.mockRestore();
		}
	});

	test('allows a due delivery to exceed destination capacity without a cash charge', () => {
		const game = withTransferOrders(createTwoIndustryCityGame({ day: 8 }), [
			createTransferOrder({ arrivalOnDay: 8, quantity: 10, transportCost: 20 })
		]);

		const result = processTransferArrivals(game);
		const destinationStats = getCityInventoryStats(result.game, 'breadbasket-basin');

		expect(result.game.cash).toBe(game.cash);
		expect(destinationStats).toMatchObject({ capacity: 0, used: 13, overflowUnits: 13 });
		expect(result.arrivals).toEqual([
			{
				transferOrderId: 'transfer-1',
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water',
				quantity: 10
			}
		]);
	});
});

type RecurringRouteFailureCase = {
	name: string;
	reason: RecurringRouteFailure;
	input: RecurringRouteInput;
};

const recurringRouteFailureCases: readonly RecurringRouteFailureCase[] = [
	{
		name: 'an invalid origin',
		reason: 'invalid-origin',
		input: validRecurringRouteInput({ originCityId: 'unknown-city' })
	},
	{
		name: 'an invalid destination',
		reason: 'invalid-destination',
		input: validRecurringRouteInput({ destinationCityId: 'harbor-city' })
	},
	{
		name: 'matching endpoints',
		reason: 'same-city',
		input: validRecurringRouteInput({ destinationCityId: 'industry-city' })
	},
	{
		name: 'an unknown material',
		reason: 'invalid-material',
		input: validRecurringRouteInput({ materialId: 'unknown-material' })
	},
	{
		name: 'a nonpositive capacity',
		reason: 'invalid-capacity',
		input: validRecurringRouteInput({ capacity: 0 })
	},
	{
		name: 'a nonpositive frequency',
		reason: 'invalid-frequency-days',
		input: validRecurringRouteInput({ frequencyDays: 0 })
	},
	{
		name: 'a nonpositive lead time',
		reason: 'invalid-lead-time-days',
		input: validRecurringRouteInput({ leadTimeDays: 0 })
	},
	{
		name: 'a nonpositive per-unit transport cost',
		reason: 'invalid-transport-cost-per-unit',
		input: validRecurringRouteInput({ transportCostPerUnit: 0 })
	},
	{
		name: 'a negative priority',
		reason: 'invalid-priority',
		input: validRecurringRouteInput({ priority: -1 })
	}
];

describe('inter-city recurring routes', () => {
	test.each(recurringRouteFailureCases)(
		'rejects $name without consuming a route sequence',
		({ reason, input }) => {
			const game = createTwoIndustryCityGame();
			const before = structuredClone(game);

			expect(createRecurringRoute(game, input)).toEqual({ ok: false, reason });
			expect(game).toEqual(before);
		}
	);

	test('creates route-1 as an immediately due active route', () => {
		const game = createTwoIndustryCityGame();
		const before = structuredClone(game);

		const result = createRecurringRoute(game, validRecurringRouteInput());
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error(`Expected a route, received ${result.reason}`);
		}

		const expectedRoute = createRecurringRouteDefinition();
		expect(result.route).toEqual(expectedRoute);
		expect(result.game.logistics).toEqual({
			transferOrders: [],
			recurringRoutes: [expectedRoute],
			nextTransferSequence: 1,
			nextRouteSequence: 2
		});
		expect(game).toEqual(before);
	});

	test('updates a complete route input without rewriting its lifecycle or existing orders', () => {
		const created = createRecurringRoute(createTwoIndustryCityGame(), validRecurringRouteInput());
		if (!created.ok) {
			throw new Error(`Expected a route, received ${created.reason}`);
		}

		const existingOrder = createTransferOrder({
			source: { kind: 'recurring-route', routeId: 'route-1' }
		});
		const game = withRecurringRoutes(withTransferOrders(created.game, [existingOrder]), [
			{
				...created.route,
				state: 'paused',
				priority: 4,
				nextDispatchOnDay: 12
			}
		]);
		const before = structuredClone(game);
		const input: RecurringRouteUpdateInput = {
			originCityId: 'breadbasket-basin',
			destinationCityId: 'industry-city',
			materialId: 'grain',
			capacity: 17,
			frequencyDays: 5,
			leadTimeDays: 4,
			transportCostPerUnit: 3
		};

		const result = updateRecurringRoute(game, 'route-1', input);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error(`Expected an updated route, received ${result.reason}`);
		}

		expect(result.route).toEqual({
			id: 'route-1',
			...input,
			state: 'paused',
			priority: 4,
			nextDispatchOnDay: 12
		});
		expect(result.game.logistics.transferOrders).toEqual([existingOrder]);
		expect(result.game.logistics.nextRouteSequence).toBe(3);
		expect(game).toEqual(before);
	});

	test('pauses and resumes idempotently without replaying an overdue schedule', () => {
		const game = withRecurringRoutes(createTwoIndustryCityGame(), [
			createRecurringRouteDefinition({ nextDispatchOnDay: 4 })
		]);

		const paused = pauseRecurringRoute(game, 'route-1');
		expect(paused.ok).toBe(true);
		if (!paused.ok) {
			throw new Error(`Expected a paused route, received ${paused.reason}`);
		}
		expect(paused.route).toEqual(
			createRecurringRouteDefinition({ state: 'paused', nextDispatchOnDay: 4 })
		);

		const pausedAgain = pauseRecurringRoute(paused.game, 'route-1');
		expect(pausedAgain.ok).toBe(true);
		if (!pausedAgain.ok) {
			throw new Error(`Expected an idempotent pause, received ${pausedAgain.reason}`);
		}
		expect(pausedAgain.game).toEqual(paused.game);

		const resumed = resumeRecurringRoute(pausedAgain.game, 'route-1');
		expect(resumed.ok).toBe(true);
		if (!resumed.ok) {
			throw new Error(`Expected a resumed route, received ${resumed.reason}`);
		}
		expect(resumed.route).toEqual(createRecurringRouteDefinition({ nextDispatchOnDay: 7 }));

		const resumedAgain = resumeRecurringRoute(resumed.game, 'route-1');
		expect(resumedAgain.ok).toBe(true);
		if (!resumedAgain.ok) {
			throw new Error(`Expected an idempotent resume, received ${resumedAgain.reason}`);
		}
		expect(resumedAgain.game).toEqual(resumed.game);

		const futurePaused = withRecurringRoutes(createTwoIndustryCityGame(), [
			createRecurringRouteDefinition({ state: 'paused', nextDispatchOnDay: 12 })
		]);
		const futureResumed = resumeRecurringRoute(futurePaused, 'route-1');
		expect(futureResumed.ok).toBe(true);
		if (!futureResumed.ok) {
			throw new Error(`Expected a future route to resume, received ${futureResumed.reason}`);
		}
		expect(futureResumed.route.nextDispatchOnDay).toBe(12);
	});

	test('reprioritizes only the selected route priority', () => {
		const route = createRecurringRouteDefinition();
		const game = withRecurringRoutes(createTwoIndustryCityGame(), [route]);

		const result = reprioritizeRecurringRoute(game, 'route-1', 0);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error(`Expected a reprioritized route, received ${result.reason}`);
		}
		expect(result.game).toEqual({
			...game,
			logistics: {
				...game.logistics,
				recurringRoutes: [{ ...route, priority: 0 }]
			}
		});

		expect(reprioritizeRecurringRoute(game, 'route-1', -1)).toEqual({
			ok: false,
			reason: 'invalid-priority'
		});
	});

	test('removes only the route definition and never rewrites its orders', () => {
		const created = createRecurringRoute(createTwoIndustryCityGame(), validRecurringRouteInput());
		if (!created.ok) {
			throw new Error(`Expected a route, received ${created.reason}`);
		}
		const route = created.route;
		const order = createTransferOrder({
			source: { kind: 'recurring-route', routeId: route.id }
		});
		const game = withTransferOrders(created.game, [order]);

		const result = removeRecurringRoute(game, route.id);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error(`Expected a route removal, received ${result.reason}`);
		}
		expect(result.game.logistics).toEqual({
			transferOrders: [order],
			recurringRoutes: [],
			nextTransferSequence: 1,
			nextRouteSequence: 2
		});

		const recreated = createRecurringRoute(result.game, validRecurringRouteInput());
		expect(recreated.ok).toBe(true);
		if (!recreated.ok) {
			throw new Error(`Expected a replacement route, received ${recreated.reason}`);
		}
		expect(recreated.route.id).toBe('route-2');
		expect(removeRecurringRoute(game, 'route-missing')).toEqual({
			ok: false,
			reason: 'route-not-found'
		});
	});

	test('derives destination transfer need from free warehouse space and all in-transit reservations', () => {
		const game = withTransferOrders(
			withWarehouses(createTwoIndustryCityGame(), ['breadbasket-basin']),
			[
				createTransferOrder({
					id: 'transfer-1',
					destinationCityId: 'breadbasket-basin',
					materialId: 'water',
					quantity: 11,
					status: 'in-transit'
				}),
				createTransferOrder({
					id: 'transfer-2',
					destinationCityId: 'breadbasket-basin',
					materialId: 'grain',
					quantity: 50,
					status: 'delivered'
				}),
				createTransferOrder({
					id: 'transfer-3',
					originCityId: 'breadbasket-basin',
					destinationCityId: 'industry-city',
					materialId: 'grain',
					quantity: 60,
					status: 'in-transit'
				})
			]
		);

		expect(getDestinationTransferNeed(game, 'breadbasket-basin')).toBe(186);
	});

	test('dispatches competing due routes by priority then raw route ID with accumulated stock and need', () => {
		const routeTwo = createRecurringRouteDefinition({ id: 'route-2' });
		const routeTen = createRecurringRouteDefinition({ id: 'route-10' });
		const routeThree = createRecurringRouteDefinition({
			id: 'route-3',
			capacity: 10,
			transportCostPerUnit: 3,
			priority: 0
		});
		const game = withRecurringRoutes(
			withCityMaterials(
				withCityMaterials(
					withWarehouses(createTwoIndustryCityGame(), ['breadbasket-basin']),
					'industry-city',
					{ water: 100 }
				),
				'breadbasket-basin',
				{ water: 140 }
			),
			[routeTwo, routeTen, routeThree]
		);
		const before = structuredClone(game);
		const localeCompare = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
			throw new Error('recurring route ordering must not depend on locale');
		});

		try {
			expect(compareRecurringRoutes(routeThree, routeTwo)).toBeLessThan(0);
			expect(compareRecurringRoutes(routeTen, routeTwo)).toBeLessThan(0);

			const result = processRecurringRouteDispatches(game);

			expect(result.attempts).toEqual([
				{
					routeId: 'route-3',
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'water',
					destinationNeed: 60,
					capacity: 10,
					availableOriginStock: 100,
					dispatchedQuantity: 10,
					unusedCapacity: 0,
					unmetDestinationNeed: 50,
					transportCost: 30,
					transferOrderId: 'transfer-1'
				},
				{
					routeId: 'route-10',
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'water',
					destinationNeed: 50,
					capacity: 30,
					availableOriginStock: 90,
					dispatchedQuantity: 30,
					unusedCapacity: 0,
					unmetDestinationNeed: 20,
					transportCost: 60,
					transferOrderId: 'transfer-2'
				},
				{
					routeId: 'route-2',
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'water',
					destinationNeed: 20,
					capacity: 30,
					availableOriginStock: 60,
					dispatchedQuantity: 20,
					unusedCapacity: 10,
					unmetDestinationNeed: 0,
					transportCost: 40,
					transferOrderId: 'transfer-3'
				}
			]);
			expect(result.scheduledTransportCost).toBe(130);
			expect(result.game.cash).toBe(game.cash);
			expect(
				result.game.cityInventories.find((inventory) => inventory.cityId === 'industry-city')
			).toEqual({ cityId: 'industry-city', materials: { water: 40 } });
			expect(result.game.logistics.transferOrders).toEqual([
				createTransferOrder({
					id: 'transfer-1',
					source: { kind: 'recurring-route', routeId: 'route-3' },
					quantity: 10,
					transportCost: 30
				}),
				createTransferOrder({
					id: 'transfer-2',
					source: { kind: 'recurring-route', routeId: 'route-10' },
					quantity: 30,
					transportCost: 60
				}),
				createTransferOrder({
					id: 'transfer-3',
					source: { kind: 'recurring-route', routeId: 'route-2' },
					quantity: 20,
					transportCost: 40
				})
			]);
			expect(result.game.logistics.recurringRoutes).toEqual([
				{ ...routeTwo, nextDispatchOnDay: 10 },
				{ ...routeTen, nextDispatchOnDay: 10 },
				{ ...routeThree, nextDispatchOnDay: 10 }
			]);
			expect(result.game.logistics.nextTransferSequence).toBe(4);
			expect(game).toEqual(before);
		} finally {
			localeCompare.mockRestore();
		}
	});

	test('records zero attempts once while preserving future and paused routes', () => {
		const routeOne = createRecurringRouteDefinition({
			id: 'route-1',
			capacity: 50,
			nextDispatchOnDay: 4
		});
		const routeTwo = createRecurringRouteDefinition({ id: 'route-2', capacity: 20, priority: 2 });
		const routeThree = createRecurringRouteDefinition({
			id: 'route-3',
			destinationCityId: 'quarry-works',
			capacity: 20,
			priority: 3
		});
		const pausedRoute = createRecurringRouteDefinition({
			id: 'route-4',
			state: 'paused',
			priority: 4
		});
		const futureRoute = createRecurringRouteDefinition({
			id: 'route-5',
			nextDispatchOnDay: 8,
			priority: 5
		});
		const game = withRecurringRoutes(
			withCityMaterials(
				withCityMaterials(
					withCityMaterials(
						withWarehouses(createThreeIndustryCityGame(), ['breadbasket-basin', 'quarry-works']),
						'industry-city',
						{ water: 7 }
					),
					'breadbasket-basin',
					{}
				),
				'quarry-works',
				{ water: 200 }
			),
			[routeOne, routeTwo, routeThree, pausedRoute, futureRoute]
		);
		const before = structuredClone(game);

		const result = processRecurringRouteDispatches(game);

		expect(result.attempts).toEqual([
			{
				routeId: 'route-1',
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water',
				destinationNeed: 200,
				capacity: 50,
				availableOriginStock: 7,
				dispatchedQuantity: 7,
				unusedCapacity: 43,
				unmetDestinationNeed: 193,
				transportCost: 14,
				transferOrderId: 'transfer-1'
			},
			{
				routeId: 'route-2',
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water',
				destinationNeed: 193,
				capacity: 20,
				availableOriginStock: 0,
				dispatchedQuantity: 0,
				unusedCapacity: 20,
				unmetDestinationNeed: 193,
				transportCost: 0,
				transferOrderId: null
			},
			{
				routeId: 'route-3',
				originCityId: 'industry-city',
				destinationCityId: 'quarry-works',
				materialId: 'water',
				destinationNeed: 0,
				capacity: 20,
				availableOriginStock: 0,
				dispatchedQuantity: 0,
				unusedCapacity: 20,
				unmetDestinationNeed: 0,
				transportCost: 0,
				transferOrderId: null
			}
		]);
		expect(result.scheduledTransportCost).toBe(14);
		expect(result.game.cash).toBe(game.cash);
		expect(result.game.logistics.transferOrders).toEqual([
			createTransferOrder({
				id: 'transfer-1',
				source: { kind: 'recurring-route', routeId: 'route-1' },
				quantity: 7,
				transportCost: 14
			})
		]);
		expect(result.game.logistics.nextTransferSequence).toBe(2);
		expect(result.game.logistics.recurringRoutes).toEqual([
			{ ...routeOne, nextDispatchOnDay: 10 },
			{ ...routeTwo, nextDispatchOnDay: 10 },
			{ ...routeThree, nextDispatchOnDay: 10 },
			pausedRoute,
			futureRoute
		]);
		expect(game).toEqual(before);
	});

	test('rejects route-not-found for update, pause, resume, and reprioritize', () => {
		const game = withRecurringRoutes(createTwoIndustryCityGame(), [
			createRecurringRouteDefinition()
		]);

		expect(updateRecurringRoute(game, 'route-missing', validRecurringRouteInput())).toEqual({
			ok: false,
			reason: 'route-not-found'
		});
		expect(pauseRecurringRoute(game, 'route-missing')).toEqual({
			ok: false,
			reason: 'route-not-found'
		});
		expect(resumeRecurringRoute(game, 'route-missing')).toEqual({
			ok: false,
			reason: 'route-not-found'
		});
		expect(reprioritizeRecurringRoute(game, 'route-missing', 2)).toEqual({
			ok: false,
			reason: 'route-not-found'
		});
	});

	test('rejects an invalid update input without rewriting the route', () => {
		const game = withRecurringRoutes(createTwoIndustryCityGame(), [
			createRecurringRouteDefinition()
		]);
		const before = structuredClone(game);

		expect(
			updateRecurringRoute(game, 'route-1', validRecurringRouteInput({ originCityId: 'unknown' }))
		).toEqual({ ok: false, reason: 'invalid-origin' });
		expect(game).toEqual(before);
	});

	test('reprioritizes idempotently when the priority matches', () => {
		const game = withRecurringRoutes(createTwoIndustryCityGame(), [
			createRecurringRouteDefinition({ priority: 1 })
		]);

		expect(reprioritizeRecurringRoute(game, 'route-1', 1)).toEqual({
			ok: true,
			game,
			route: createRecurringRouteDefinition({ priority: 1 })
		});
	});

	test('compareRecurringRoutes returns zero for equal priority and ID', () => {
		const route = createRecurringRouteDefinition({ priority: 1 });

		expect(compareRecurringRoutes(route, { ...route })).toBe(0);
	});

	test('compareRecurringRoutes returns positive when priority is equal and left ID is greater', () => {
		const routeTwo = createRecurringRouteDefinition({ id: 'route-2', priority: 1 });
		const routeTen = createRecurringRouteDefinition({ id: 'route-10', priority: 1 });

		expect(compareRecurringRoutes(routeTwo, routeTen)).toBeGreaterThan(0);
		expect(compareRecurringRoutes(routeTen, routeTwo)).toBeLessThan(0);
	});

	test('sorts due transfers with ascending IDs stably via the raw-ID comparator', () => {
		// Insertion sort calls compare(arr[i], arr[j]) with i > j, so an
		// ascending-order array forces the left.id > right.id branch (returns 1).
		const game = withTransferOrders(createTwoIndustryCityGame({ day: 8 }), [
			createTransferOrder({ id: 'transfer-1', arrivalOnDay: 8, quantity: 5 }),
			createTransferOrder({ id: 'transfer-2', arrivalOnDay: 8, quantity: 3 })
		]);

		const result = processTransferArrivals(game);

		expect(result.deliveredUnits).toBe(8);
		expect(result.arrivals.map((arrival) => arrival.transferOrderId)).toEqual([
			'transfer-1',
			'transfer-2'
		]);
	});

	test('sorts due transfers with equal IDs stably via the raw-ID comparator', () => {
		const duplicate = createTransferOrder({ id: 'transfer-1', arrivalOnDay: 8, quantity: 3 });
		const game = withTransferOrders(createTwoIndustryCityGame({ day: 8 }), [
			createTransferOrder({ id: 'transfer-1', arrivalOnDay: 8, quantity: 5 }),
			duplicate
		]);

		const result = processTransferArrivals(game);

		expect(result.deliveredUnits).toBe(8);
		expect(result.arrivals).toHaveLength(2);
	});

	test('reads route origin stock as zero when the material is absent from the inventory', () => {
		const game = withRecurringRoutes(
			withCityMaterials(
				withWarehouses(createTwoIndustryCityGame(), ['breadbasket-basin']),
				'industry-city',
				{ water: 50 }
			),
			[createRecurringRouteDefinition({ materialId: 'grain' })]
		);

		const result = processRecurringRouteDispatches(game);

		expect(result.attempts).toEqual([
			expect.objectContaining({
				routeId: 'route-1',
				availableOriginStock: 0,
				dispatchedQuantity: 0,
				transferOrderId: null
			})
		]);
		expect(result.scheduledTransportCost).toBe(0);
	});

	test('rejects a manual transfer for a material absent from the origin inventory', () => {
		const game = withCityMaterials(createTwoIndustryCityGame(), 'industry-city', { water: 50 });

		expect(
			quoteInterCityTransfer(game, validManualInput({ materialId: 'grain', quantity: 1 }))
		).toEqual({ ok: false, reason: 'insufficient-origin-stock' });
	});

	test('throws when a due route references an invalid origin city', () => {
		const game = withRecurringRoutes(createTwoIndustryCityGame(), [
			createRecurringRouteDefinition({ originCityId: 'nonexistent' as WorldCityId })
		]);

		expect(() => processRecurringRouteDispatches(game)).toThrow(
			/Recurring route origin is invalid/
		);
	});

	test('throws when a route transport cost exceeds the safe integer range', () => {
		const game = withRecurringRoutes(
			withCityMaterials(
				withWarehouses(createTwoIndustryCityGame(), ['breadbasket-basin']),
				'industry-city',
				{ water: 10 }
			),
			[
				createRecurringRouteDefinition({
					transportCostPerUnit: Number.MAX_SAFE_INTEGER,
					capacity: 10
				})
			]
		);

		expect(() => processRecurringRouteDispatches(game)).toThrow(RangeError);
	});

	test('throws when a transfer arrival references an invalid destination city', () => {
		const game = withTransferOrders(createTwoIndustryCityGame(), [
			createTransferOrder({ destinationCityId: 'nonexistent' as WorldCityId, arrivalOnDay: 7 })
		]);

		expect(() => processTransferArrivals(game)).toThrow(/Transfer arrival destination is invalid/);
	});

	test('throws when the next route sequence exceeds the safe integer range', () => {
		const game = {
			...createTwoIndustryCityGame(),
			logistics: {
				...createTwoIndustryCityGame().logistics,
				nextRouteSequence: Number.MAX_SAFE_INTEGER
			}
		};

		expect(() => createRecurringRoute(game, validRecurringRouteInput())).toThrow(RangeError);
	});
});
