import {
	addCityInventoryMaterial,
	getCityInventory,
	getCityInventoryStats,
	removeCityInventoryMaterial
} from './cityInventory';
import { MATERIALS } from './industry';
import { getWorldCityDefinition } from './worldCatalog';
import type {
	DailyRouteDispatchAttempt,
	DailyTransferArrival,
	GameState,
	MaterialId,
	RecurringRoute,
	TransferOrder,
	TransferOrderSource,
	WorldCityId
} from './types';

export const INTER_CITY_DISTANCE_PER_BAND = 25;

export interface InterCityRates {
	leadTimeDays: number;
	transportCostPerUnit: number;
}

export interface InterCityTransferQuote {
	leadTimeDays: number;
	transportCostPerUnit: number;
	transportCost: number;
}

export interface ManualTransferInput {
	originCityId: string;
	destinationCityId: string;
	materialId: string;
	quantity: number;
}

export type ManualTransferFailure =
	| 'invalid-origin'
	| 'invalid-destination'
	| 'same-city'
	| 'invalid-material'
	| 'invalid-quantity'
	| 'insufficient-origin-stock'
	| 'insufficient-cash';

export type InterCityTransferQuoteResult =
	| { ok: true; quote: InterCityTransferQuote }
	| { ok: false; reason: ManualTransferFailure };

export type ManualTransferResult =
	| { ok: true; game: GameState; order: TransferOrder }
	| { ok: false; reason: ManualTransferFailure };

export interface RecurringRouteInput {
	originCityId: string;
	destinationCityId: string;
	materialId: string;
	capacity: number;
	frequencyDays: number;
	leadTimeDays: number;
	transportCostPerUnit: number;
	priority: number;
}

export type RecurringRouteUpdateInput = Omit<RecurringRouteInput, 'priority'>;

export type RecurringRouteFailure =
	| 'invalid-origin'
	| 'invalid-destination'
	| 'same-city'
	| 'invalid-material'
	| 'invalid-capacity'
	| 'invalid-frequency-days'
	| 'invalid-lead-time-days'
	| 'invalid-transport-cost-per-unit'
	| 'invalid-priority'
	| 'route-not-found';

export type RecurringRouteResult =
	| { ok: true; game: GameState; route: RecurringRoute }
	| { ok: false; reason: RecurringRouteFailure };

export type RouteRemovalResult =
	| { ok: true; game: GameState; route: RecurringRoute }
	| { ok: false; reason: 'route-not-found' };

export function quoteInterCityRates(
	originCityId: string,
	destinationCityId: string
): InterCityRates | null {
	const originCity = getWorldCityDefinition(originCityId);
	const destinationCity = getWorldCityDefinition(destinationCityId);
	if (
		!originCity ||
		!destinationCity ||
		originCity.kind !== 'industry' ||
		destinationCity.kind !== 'industry' ||
		originCity.id === destinationCity.id
	) {
		return null;
	}

	const distance = Math.hypot(
		destinationCity.worldX - originCity.worldX,
		destinationCity.worldY - originCity.worldY
	);
	const band = Math.max(1, Math.ceil(distance / INTER_CITY_DISTANCE_PER_BAND));
	return { leadTimeDays: band, transportCostPerUnit: band };
}

interface ValidManualTransfer {
	originCityId: WorldCityId;
	destinationCityId: WorldCityId;
	materialId: MaterialId;
	quantity: number;
	quote: InterCityTransferQuote;
}

interface ValidRecurringRouteFields {
	originCityId: WorldCityId;
	destinationCityId: WorldCityId;
	materialId: MaterialId;
	capacity: number;
	frequencyDays: number;
	leadTimeDays: number;
	transportCostPerUnit: number;
}

interface CreateDispatchedTransferInput {
	source: TransferOrderSource;
	originCityId: WorldCityId;
	destinationCityId: WorldCityId;
	materialId: MaterialId;
	quantity: number;
	leadTimeDays: number;
	transportCost: number;
}

interface CreatedDispatchedTransfer {
	game: GameState;
	order: TransferOrder;
	transportCost: number;
}

export function quoteInterCityTransfer(
	game: GameState,
	input: ManualTransferInput
): InterCityTransferQuoteResult {
	const validation = validateManualTransfer(game, input);
	if (!validation.ok) {
		return validation;
	}

	if (game.cash < validation.transfer.quote.transportCost) {
		return { ok: false, reason: 'insufficient-cash' };
	}

	return { ok: true, quote: validation.transfer.quote };
}

export function dispatchManualTransfer(
	game: GameState,
	input: ManualTransferInput
): ManualTransferResult {
	const validation = validateManualTransfer(game, input);
	if (!validation.ok) {
		return validation;
	}

	const { transfer } = validation;
	if (game.cash < transfer.quote.transportCost) {
		return { ok: false, reason: 'insufficient-cash' };
	}

	const created = createDispatchedTransfer(game, {
		source: { kind: 'manual' },
		originCityId: transfer.originCityId,
		destinationCityId: transfer.destinationCityId,
		materialId: transfer.materialId,
		quantity: transfer.quantity,
		leadTimeDays: transfer.quote.leadTimeDays,
		transportCost: transfer.quote.transportCost
	});

	return {
		ok: true,
		game: { ...created.game, cash: created.game.cash - created.transportCost },
		order: created.order
	};
}

export function createRecurringRoute(
	game: GameState,
	input: RecurringRouteInput
): RecurringRouteResult {
	const validation = validateRecurringRouteFields(game, input);
	if (!validation.ok) {
		return validation;
	}

	if (!isSafeNonnegativeInteger(input.priority)) {
		return { ok: false, reason: 'invalid-priority' };
	}

	const route: RecurringRoute = {
		id: `route-${game.logistics.nextRouteSequence}`,
		...validation.route,
		priority: input.priority,
		state: 'active',
		nextDispatchOnDay: game.day
	};
	const nextRouteSequence = checkedAdd(
		game.logistics.nextRouteSequence,
		1,
		'Next recurring route sequence'
	);

	return {
		ok: true,
		game: {
			...game,
			logistics: {
				...game.logistics,
				recurringRoutes: [...game.logistics.recurringRoutes, route],
				nextRouteSequence
			}
		},
		route
	};
}

export function updateRecurringRoute(
	game: GameState,
	routeId: string,
	input: RecurringRouteUpdateInput
): RecurringRouteResult {
	const route = findRecurringRoute(game, routeId);
	if (!route) {
		return { ok: false, reason: 'route-not-found' };
	}

	const validation = validateRecurringRouteFields(game, input);
	if (!validation.ok) {
		return validation;
	}

	const updatedRoute: RecurringRoute = {
		id: route.id,
		...validation.route,
		priority: route.priority,
		state: route.state,
		nextDispatchOnDay: route.nextDispatchOnDay
	};

	return {
		ok: true,
		game: replaceRecurringRoute(game, updatedRoute),
		route: updatedRoute
	};
}

export function pauseRecurringRoute(game: GameState, routeId: string): RecurringRouteResult {
	const route = findRecurringRoute(game, routeId);
	if (!route) {
		return { ok: false, reason: 'route-not-found' };
	}

	if (route.state === 'paused') {
		return { ok: true, game, route };
	}

	const pausedRoute: RecurringRoute = { ...route, state: 'paused' };
	return {
		ok: true,
		game: replaceRecurringRoute(game, pausedRoute),
		route: pausedRoute
	};
}

export function resumeRecurringRoute(game: GameState, routeId: string): RecurringRouteResult {
	const route = findRecurringRoute(game, routeId);
	if (!route) {
		return { ok: false, reason: 'route-not-found' };
	}

	if (route.state === 'active') {
		return { ok: true, game, route };
	}

	const resumedRoute: RecurringRoute = {
		...route,
		state: 'active',
		nextDispatchOnDay: Math.max(route.nextDispatchOnDay, game.day)
	};
	return {
		ok: true,
		game: replaceRecurringRoute(game, resumedRoute),
		route: resumedRoute
	};
}

export function reprioritizeRecurringRoute(
	game: GameState,
	routeId: string,
	priority: number
): RecurringRouteResult {
	const route = findRecurringRoute(game, routeId);
	if (!route) {
		return { ok: false, reason: 'route-not-found' };
	}

	if (!isSafeNonnegativeInteger(priority)) {
		return { ok: false, reason: 'invalid-priority' };
	}

	if (route.priority === priority) {
		return { ok: true, game, route };
	}

	const reprioritizedRoute: RecurringRoute = { ...route, priority };
	return {
		ok: true,
		game: replaceRecurringRoute(game, reprioritizedRoute),
		route: reprioritizedRoute
	};
}

export function removeRecurringRoute(game: GameState, routeId: string): RouteRemovalResult {
	const route = findRecurringRoute(game, routeId);
	if (!route) {
		return { ok: false, reason: 'route-not-found' };
	}

	return {
		ok: true,
		game: {
			...game,
			logistics: {
				...game.logistics,
				recurringRoutes: game.logistics.recurringRoutes.filter(
					(candidate) => candidate.id !== routeId
				)
			}
		},
		route
	};
}

export function compareRecurringRoutes(left: RecurringRoute, right: RecurringRoute): number {
	if (left.priority !== right.priority) {
		return left.priority < right.priority ? -1 : 1;
	}

	return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function getDestinationTransferNeed(
	game: GameState,
	destinationCityId: WorldCityId
): number {
	const destinationStats = getCityInventoryStats(game, destinationCityId);
	const reservedInTransitUnits = game.logistics.transferOrders.reduce((reserved, order) => {
		if (order.status !== 'in-transit' || order.destinationCityId !== destinationCityId) {
			return reserved;
		}

		return checkedAdd(reserved, order.quantity, 'Reserved destination transfer units');
	}, 0);
	const freeWarehouseCapacity = Math.max(0, destinationStats.capacity - destinationStats.used);

	return Math.max(0, freeWarehouseCapacity - reservedInTransitUnits);
}

export function processRecurringRouteDispatches(game: GameState): {
	game: GameState;
	attempts: DailyRouteDispatchAttempt[];
	scheduledTransportCost: number;
} {
	const closingDay = game.day;
	const dueRoutes = game.logistics.recurringRoutes
		.filter((route) => route.state === 'active' && route.nextDispatchOnDay <= closingDay)
		.sort(compareRecurringRoutes);

	if (dueRoutes.length === 0) {
		return { game, attempts: [], scheduledTransportCost: 0 };
	}

	let nextGame = game;
	let scheduledTransportCost = 0;
	const attempts: DailyRouteDispatchAttempt[] = [];

	for (const route of dueRoutes) {
		const origin = getCityInventory(nextGame, route.originCityId);
		if (!origin.ok) {
			throw new Error(`Recurring route origin is invalid: ${origin.reason}`);
		}

		const destinationNeed = getDestinationTransferNeed(nextGame, route.destinationCityId);
		const availableOriginStock = origin.inventory.materials[route.materialId] ?? 0;
		const dispatchedQuantity = Math.min(destinationNeed, route.capacity, availableOriginStock);
		let transportCost = 0;
		let transferOrderId: string | null = null;

		if (dispatchedQuantity > 0) {
			const calculatedTransportCost = checkedMultiply(
				route.transportCostPerUnit,
				dispatchedQuantity
			);
			if (calculatedTransportCost === null) {
				throw new RangeError('Recurring route transport cost exceeds the safe integer range');
			}

			const created = createDispatchedTransfer(nextGame, {
				source: { kind: 'recurring-route', routeId: route.id },
				originCityId: route.originCityId,
				destinationCityId: route.destinationCityId,
				materialId: route.materialId,
				quantity: dispatchedQuantity,
				leadTimeDays: route.leadTimeDays,
				transportCost: calculatedTransportCost
			});
			nextGame = created.game;
			transportCost = created.transportCost;
			transferOrderId = created.order.id;
		}

		const nextDispatchOnDay = checkedAdd(
			closingDay,
			route.frequencyDays,
			'Recurring route next dispatch day'
		);
		nextGame = replaceRecurringRoute(nextGame, { ...route, nextDispatchOnDay });
		scheduledTransportCost = checkedAdd(
			scheduledTransportCost,
			transportCost,
			'Scheduled transport cost'
		);
		attempts.push({
			routeId: route.id,
			originCityId: route.originCityId,
			destinationCityId: route.destinationCityId,
			materialId: route.materialId,
			destinationNeed,
			capacity: route.capacity,
			availableOriginStock,
			dispatchedQuantity,
			unusedCapacity: route.capacity - dispatchedQuantity,
			unmetDestinationNeed: destinationNeed === 0 ? 0 : destinationNeed - dispatchedQuantity,
			transportCost,
			transferOrderId
		});
	}

	return { game: nextGame, attempts, scheduledTransportCost };
}

export function processTransferArrivals(game: GameState): {
	game: GameState;
	arrivals: DailyTransferArrival[];
	deliveredUnits: number;
} {
	const dueOrders = game.logistics.transferOrders
		.filter((order) => order.status === 'in-transit' && order.arrivalOnDay <= game.day)
		.sort(compareTransferOrderIds);

	if (dueOrders.length === 0) {
		return { game, arrivals: [], deliveredUnits: 0 };
	}

	let cityInventories = game.cityInventories;
	let deliveredUnits = 0;
	const arrivals: DailyTransferArrival[] = [];
	const deliveredOrderIds = new Set<string>();

	for (const order of dueOrders) {
		const destination = getCityInventory(game, order.destinationCityId);
		if (!destination.ok) {
			throw new Error(`Transfer arrival destination is invalid: ${destination.reason}`);
		}

		const currentInventory = cityInventories[destination.index]!;
		const nextInventory = addCityInventoryMaterial(
			currentInventory,
			order.materialId,
			order.quantity
		);
		cityInventories = cityInventories.map((inventory, index) =>
			index === destination.index ? nextInventory : inventory
		);
		deliveredUnits = checkedAdd(deliveredUnits, order.quantity, 'Delivered transfer units');
		deliveredOrderIds.add(order.id);
		arrivals.push({
			transferOrderId: order.id,
			originCityId: order.originCityId,
			destinationCityId: order.destinationCityId,
			materialId: order.materialId,
			quantity: order.quantity
		});
	}

	return {
		game: {
			...game,
			cityInventories,
			logistics: {
				...game.logistics,
				transferOrders: game.logistics.transferOrders.map((order) =>
					deliveredOrderIds.has(order.id) ? { ...order, status: 'delivered' } : order
				)
			}
		},
		arrivals,
		deliveredUnits
	};
}

function validateManualTransfer(
	game: GameState,
	input: ManualTransferInput
): { ok: true; transfer: ValidManualTransfer } | { ok: false; reason: ManualTransferFailure } {
	const origin = getCityInventory(game, input.originCityId);
	if (!origin.ok) {
		return { ok: false, reason: 'invalid-origin' };
	}

	const destination = getCityInventory(game, input.destinationCityId);
	if (!destination.ok) {
		return { ok: false, reason: 'invalid-destination' };
	}

	if (origin.inventory.cityId === destination.inventory.cityId) {
		return { ok: false, reason: 'same-city' };
	}

	if (!Object.hasOwn(MATERIALS, input.materialId)) {
		return { ok: false, reason: 'invalid-material' };
	}
	const materialId = input.materialId as MaterialId;

	if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
		return { ok: false, reason: 'invalid-quantity' };
	}

	const availableOriginStock = origin.inventory.materials[materialId] ?? 0;
	if (!Number.isSafeInteger(availableOriginStock) || availableOriginStock < input.quantity) {
		return { ok: false, reason: 'insufficient-origin-stock' };
	}

	const rates = quoteInterCityRates(origin.inventory.cityId, destination.inventory.cityId);
	if (!rates) {
		return { ok: false, reason: 'invalid-quantity' };
	}

	const transportCost = checkedMultiply(rates.transportCostPerUnit, input.quantity);
	if (transportCost === null) {
		return { ok: false, reason: 'invalid-quantity' };
	}

	return {
		ok: true,
		transfer: {
			originCityId: origin.inventory.cityId,
			destinationCityId: destination.inventory.cityId,
			materialId,
			quantity: input.quantity,
			quote: {
				leadTimeDays: rates.leadTimeDays,
				transportCostPerUnit: rates.transportCostPerUnit,
				transportCost
			}
		}
	};
}

function validateRecurringRouteFields(
	game: GameState,
	input: RecurringRouteUpdateInput
): { ok: true; route: ValidRecurringRouteFields } | { ok: false; reason: RecurringRouteFailure } {
	const origin = getCityInventory(game, input.originCityId);
	if (!origin.ok) {
		return { ok: false, reason: 'invalid-origin' };
	}

	const destination = getCityInventory(game, input.destinationCityId);
	if (!destination.ok) {
		return { ok: false, reason: 'invalid-destination' };
	}

	if (origin.inventory.cityId === destination.inventory.cityId) {
		return { ok: false, reason: 'same-city' };
	}

	if (!Object.hasOwn(MATERIALS, input.materialId)) {
		return { ok: false, reason: 'invalid-material' };
	}

	if (!isPositiveSafeInteger(input.capacity)) {
		return { ok: false, reason: 'invalid-capacity' };
	}

	if (!isPositiveSafeInteger(input.frequencyDays)) {
		return { ok: false, reason: 'invalid-frequency-days' };
	}

	if (!isPositiveSafeInteger(input.leadTimeDays)) {
		return { ok: false, reason: 'invalid-lead-time-days' };
	}

	if (!isPositiveSafeInteger(input.transportCostPerUnit)) {
		return { ok: false, reason: 'invalid-transport-cost-per-unit' };
	}

	return {
		ok: true,
		route: {
			originCityId: origin.inventory.cityId,
			destinationCityId: destination.inventory.cityId,
			materialId: input.materialId as MaterialId,
			capacity: input.capacity,
			frequencyDays: input.frequencyDays,
			leadTimeDays: input.leadTimeDays,
			transportCostPerUnit: input.transportCostPerUnit
		}
	};
}

function findRecurringRoute(game: GameState, routeId: string): RecurringRoute | undefined {
	return game.logistics.recurringRoutes.find((route) => route.id === routeId);
}

function replaceRecurringRoute(game: GameState, nextRoute: RecurringRoute): GameState {
	return {
		...game,
		logistics: {
			...game.logistics,
			recurringRoutes: game.logistics.recurringRoutes.map((route) =>
				route.id === nextRoute.id ? nextRoute : route
			)
		}
	};
}

function createDispatchedTransfer(
	game: GameState,
	input: CreateDispatchedTransferInput
): CreatedDispatchedTransfer {
	const origin = getCityInventory(game, input.originCityId);
	if (!origin.ok) {
		throw new Error(`Transfer origin is invalid: ${origin.reason}`);
	}

	const nextTransferSequence = checkedAdd(
		game.logistics.nextTransferSequence,
		1,
		'Next transfer sequence'
	);
	const arrivalOnDay = checkedAdd(game.day, input.leadTimeDays, 'Transfer arrival day');
	const removal = removeCityInventoryMaterial(origin.inventory, input.materialId, input.quantity);
	if (removal.shortage !== 0) {
		throw new Error('Transfer origin stock changed before dispatch');
	}

	const order: TransferOrder = {
		id: `transfer-${game.logistics.nextTransferSequence}`,
		source: input.source,
		originCityId: input.originCityId,
		destinationCityId: input.destinationCityId,
		materialId: input.materialId,
		quantity: input.quantity,
		createdOnDay: game.day,
		dispatchedOnDay: game.day,
		arrivalOnDay,
		transportCost: input.transportCost,
		status: 'in-transit'
	};

	return {
		game: {
			...game,
			cityInventories: game.cityInventories.map((inventory, index) =>
				index === origin.index ? removal.inventory : inventory
			),
			logistics: {
				...game.logistics,
				transferOrders: [...game.logistics.transferOrders, order],
				nextTransferSequence
			}
		},
		order,
		transportCost: input.transportCost
	};
}

function compareTransferOrderIds(left: TransferOrder, right: TransferOrder): number {
	return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function isPositiveSafeInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value > 0;
}

function isSafeNonnegativeInteger(value: number): boolean {
	return Number.isSafeInteger(value) && value >= 0;
}

function checkedAdd(left: number, right: number, label: string): number {
	const sum = left + right;
	if (!Number.isSafeInteger(sum)) {
		throw new RangeError(`${label} exceeds the safe integer range`);
	}

	return sum;
}

function checkedMultiply(left: number, right: number): number | null {
	const product = left * right;
	return Number.isSafeInteger(product) ? product : null;
}
