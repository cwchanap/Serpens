import {
	addCityInventoryMaterial,
	compareWorldCityIds,
	getCityInventory,
	getCityInventoryStats,
	getCityInventoryUsed,
	removeCityInventoryMaterial
} from './cityInventory';
import { cloneTimedEffect } from './eventModifiers';
import {
	buildRouteDispatchAttempt,
	compareRecurringRoutes,
	getDestinationTransferNeedFromCapacity,
	sumReservedInTransitUnits
} from './interCityLogistics';
import { resolveEffectiveRecurringRoute } from './logisticsRouteModifiers';
import { selectInTransitInventory, type InTransitInventorySummary } from './logisticsReadModels';
import type {
	CityInventory,
	DailyRouteDispatchAttempt,
	DailyTransferArrival,
	GameState,
	RecurringRoute,
	RouteModifierInput,
	TransferOrder,
	WorldCityId
} from './types';

/** The projection's copied route-modifier shape: exactly the fields
 * `resolveEffectiveRecurringRoute` reads (identity, target, activity window,
 * effect, and evidence copy). Stacking/lifecycle bookkeeping and any
 * non-route targets are deliberately not copied. */
export type PlannerRouteModifier = RouteModifierInput;

/** Deep-copy only route-targeted active modifiers, keeping only the fields the
 * route resolver reads. Never copies company modifiers, event RNG/cooldowns,
 * history, or precomputed effective routes. */
export function copyRouteTargetedModifiers(
	modifiers: readonly PlannerRouteModifier[]
): PlannerRouteModifier[] {
	return modifiers
		.filter((modifier) => modifier.target.kind === 'recurring-route')
		.map((modifier) => ({
			id: modifier.id,
			source: { ...modifier.source },
			target: { ...modifier.target },
			startsOnDay: modifier.startsOnDay,
			expiresOnDay: modifier.expiresOnDay,
			effect: cloneTimedEffect(modifier.effect),
			explanation: { ...modifier.explanation, params: { ...modifier.explanation.params } }
		}));
}

export interface SupplyPlannerRemoteLogisticsCitySnapshot {
	inventory: Readonly<CityInventory>;
	warehouseCapacity: number;
}

export interface SupplyPlannerLogisticsSnapshot {
	currentDay: number;
	remoteCities: readonly SupplyPlannerRemoteLogisticsCitySnapshot[];
	inTransitOrders: readonly Readonly<TransferOrder>[];
	/** Existing day-zero logistics read model for planner presentation only. */
	inTransitInventory?: readonly InTransitInventorySummary[];
	routes: readonly Readonly<RecurringRoute>[];
	/** Route-targeted active modifiers copied for the projection horizon. */
	routeModifiers: readonly PlannerRouteModifier[];
	nextRouteSequence: number;
	nextTransferSequence: number;
}

/** Mutable, trace-local integer state used by the planner's route-day helpers. */
export interface SupplyPlannerLogisticsState {
	selectedIntegerInventory: CityInventory;
	remoteIntegerInventories: CityInventory[];
	selectedWarehouseCapacity: number;
	remoteWarehouseCapacities: Partial<Record<WorldCityId, number>>;
	inTransitOrders: TransferOrder[];
	routes: RecurringRoute[];
	routeModifiers: readonly PlannerRouteModifier[];
	nextTransferSequence: number;
}

export interface SupplyPlannerTransferArrivalResult {
	state: SupplyPlannerLogisticsState;
	arrivals: DailyTransferArrival[];
	deliveredUnits: number;
}

export interface SupplyPlannerRouteDispatchResult {
	state: SupplyPlannerLogisticsState;
	attempts: DailyRouteDispatchAttempt[];
	scheduledTransportCost: number;
	selectedWarehouseUsed: number;
}

/**
 * Copy the logistics state needed by a supply projection. The selected
 * supply city is already represented by SupplyPlannerSnapshot.inventory, so
 * only other opened industry cities are included here.
 */
export function buildSupplyPlannerLogisticsSnapshot(
	game: GameState,
	selectedSupplyCityId: WorldCityId
): SupplyPlannerLogisticsSnapshot {
	const remoteCities = game.industryCities
		.filter(
			(city) =>
				city.id !== selectedSupplyCityId &&
				game.world.openedCityIds.includes(city.id as WorldCityId)
		)
		.sort((left, right) => compareWorldCityIds(left.id as WorldCityId, right.id as WorldCityId))
		.flatMap((city) => {
			const access = getCityInventory(game, city.id);
			if (!access.ok) return [];

			const stats = getCityInventoryStats(game, city.id);
			return [
				{
					inventory: structuredClone(access.inventory),
					warehouseCapacity: stats.capacity
				}
			];
		});

	return {
		currentDay: game.day,
		remoteCities,
		inTransitOrders: structuredClone(
			game.logistics.transferOrders.filter((order) => order.status === 'in-transit')
		),
		inTransitInventory: selectInTransitInventory(game),
		routes: structuredClone(game.logistics.recurringRoutes),
		routeModifiers: copyRouteTargetedModifiers(game.events.activeModifiers),
		nextRouteSequence: game.logistics.nextRouteSequence,
		nextTransferSequence: game.logistics.nextTransferSequence
	};
}

/** Build mutable integer state from a copied planner logistics snapshot. */
export function createSupplyPlannerLogisticsState(input: {
	selectedInventory: CityInventory;
	selectedWarehouseCapacity: number;
	logistics: SupplyPlannerLogisticsSnapshot;
}): SupplyPlannerLogisticsState {
	return {
		selectedIntegerInventory: structuredClone(input.selectedInventory),
		remoteIntegerInventories: input.logistics.remoteCities.map((row) =>
			structuredClone(row.inventory)
		),
		selectedWarehouseCapacity: input.selectedWarehouseCapacity,
		remoteWarehouseCapacities: Object.fromEntries(
			input.logistics.remoteCities.map((row) => [row.inventory.cityId, row.warehouseCapacity])
		) as Partial<Record<WorldCityId, number>>,
		inTransitOrders: input.logistics.inTransitOrders.map((order) => structuredClone(order)),
		routes: input.logistics.routes.map((route) => structuredClone(route)),
		routeModifiers: copyRouteTargetedModifiers(input.logistics.routeModifiers),
		nextTransferSequence: input.logistics.nextTransferSequence
	};
}

/** Apply all integer transfer arrivals due on the projected day. */
export function processSupplyPlannerTransferArrivals(
	input: SupplyPlannerLogisticsState,
	day: number
): SupplyPlannerTransferArrivalResult {
	let selectedIntegerInventory = structuredClone(input.selectedIntegerInventory);
	let remoteIntegerInventories = structuredClone(input.remoteIntegerInventories);
	const dueOrders = input.inTransitOrders
		.filter((order) => order.status === 'in-transit' && order.arrivalOnDay <= day)
		.sort(compareTransferOrderIds);
	const deliveredOrderIds = new Set<string>();
	const arrivals: DailyTransferArrival[] = [];
	let deliveredUnits = 0;

	for (const order of dueOrders) {
		const destination = findInventory(
			selectedIntegerInventory,
			remoteIntegerInventories,
			order.destinationCityId
		);
		if (!destination) {
			throw new Error(`Transfer arrival destination is invalid: ${order.destinationCityId}`);
		}

		if (destination.kind === 'selected') {
			selectedIntegerInventory = addCityInventoryMaterial(
				selectedIntegerInventory,
				order.materialId,
				order.quantity
			);
		} else {
			remoteIntegerInventories = remoteIntegerInventories.map((inventory) =>
				inventory.cityId === order.destinationCityId
					? addCityInventoryMaterial(inventory, order.materialId, order.quantity)
					: inventory
			);
		}

		deliveredOrderIds.add(order.id);
		deliveredUnits = checkedAdd(deliveredUnits, order.quantity, 'Delivered transfer units');
		arrivals.push({
			transferOrderId: order.id,
			originCityId: order.originCityId,
			destinationCityId: order.destinationCityId,
			materialId: order.materialId,
			quantity: order.quantity
		});
	}

	return {
		state: {
			...input,
			selectedIntegerInventory,
			remoteIntegerInventories,
			inTransitOrders: input.inTransitOrders.map((order) =>
				deliveredOrderIds.has(order.id) ? { ...order, status: 'delivered' } : { ...order }
			),
			routes: input.routes.map((route) => ({ ...route }))
		},
		arrivals,
		deliveredUnits
	};
}

/** Apply all active due recurring route dispatches in HPA-294 order. */
export function processSupplyPlannerRouteDispatches(
	input: SupplyPlannerLogisticsState,
	day: number
): SupplyPlannerRouteDispatchResult {
	let selectedIntegerInventory = structuredClone(input.selectedIntegerInventory);
	let remoteIntegerInventories = structuredClone(input.remoteIntegerInventories);
	let inTransitOrders = structuredClone(input.inTransitOrders);
	let routes = structuredClone(input.routes);
	let nextTransferSequence = input.nextTransferSequence;
	let scheduledTransportCost = 0;
	const attempts: DailyRouteDispatchAttempt[] = [];

	const dueRoutes = routes
		.filter((route) => route.state === 'active' && route.nextDispatchOnDay <= day)
		.sort(compareRecurringRoutes);

	for (const route of dueRoutes) {
		const origin = findInventory(
			selectedIntegerInventory,
			remoteIntegerInventories,
			route.originCityId
		);
		if (!origin) {
			throw new Error(`Recurring route origin is invalid: ${route.originCityId}`);
		}

		const destination = findInventory(
			selectedIntegerInventory,
			remoteIntegerInventories,
			route.destinationCityId
		);
		if (!destination) {
			throw new Error(`Recurring route destination is invalid: ${route.destinationCityId}`);
		}

		const destinationCapacity = getWarehouseCapacity(input, route.destinationCityId);
		const destinationNeed = getDestinationTransferNeedFromCapacity({
			warehouseCapacity: destinationCapacity,
			warehouseUsed: getCityInventoryUsed(destination.inventory),
			reservedInTransitUnits: sumReservedInTransitUnits(inTransitOrders, route.destinationCityId)
		});
		const availableOriginStock = origin.inventory.materials[route.materialId] ?? 0;
		// Same shared resolver + builder the live loop uses; the copied
		// modifiers already satisfy the resolver's structural input type.
		const effective = resolveEffectiveRecurringRoute(route, input.routeModifiers, day);
		const built = buildRouteDispatchAttempt({
			route,
			effective,
			destinationNeed,
			availableOriginStock
		});

		let transferOrderId: string | null = null;
		if (built.dispatchedQuantity > 0) {
			const removal = removeCityInventoryMaterial(
				origin.inventory,
				route.materialId,
				built.dispatchedQuantity
			);
			if (removal.shortage !== 0) {
				throw new Error('Transfer origin stock changed before dispatch');
			}

			if (origin.kind === 'selected') {
				selectedIntegerInventory = removal.inventory;
			} else {
				remoteIntegerInventories = remoteIntegerInventories.map((inventory) =>
					inventory.cityId === route.originCityId ? removal.inventory : inventory
				);
			}

			transferOrderId = `transfer-${nextTransferSequence}`;
			nextTransferSequence = checkedAdd(nextTransferSequence, 1, 'Next transfer sequence');
			const order: TransferOrder = {
				id: transferOrderId,
				source: { kind: 'recurring-route', routeId: route.id },
				originCityId: route.originCityId,
				destinationCityId: route.destinationCityId,
				materialId: route.materialId,
				quantity: built.dispatchedQuantity,
				createdOnDay: day,
				dispatchedOnDay: day,
				arrivalOnDay: checkedAdd(day, effective.leadTimeDays, 'Transfer arrival day'),
				transportCost: built.attempt.transportCost,
				status: 'in-transit'
			};
			inTransitOrders = [...inTransitOrders, order];
		}

		const nextDispatchOnDay = checkedAdd(
			day,
			route.frequencyDays,
			'Recurring route next dispatch day'
		);
		routes = routes.map((candidate) =>
			candidate.id === route.id ? { ...candidate, nextDispatchOnDay } : candidate
		);
		scheduledTransportCost = checkedAdd(
			scheduledTransportCost,
			built.attempt.transportCost,
			'Scheduled transport cost'
		);
		attempts.push({ ...built.attempt, transferOrderId });
	}

	return {
		state: {
			...input,
			selectedIntegerInventory,
			remoteIntegerInventories,
			inTransitOrders,
			routes,
			nextTransferSequence
		},
		attempts,
		scheduledTransportCost,
		selectedWarehouseUsed: getCityInventoryUsed(selectedIntegerInventory)
	};
}

function findInventory(
	selectedIntegerInventory: CityInventory,
	remoteIntegerInventories: readonly CityInventory[],
	cityId: WorldCityId
): { kind: 'selected' | 'remote'; inventory: CityInventory } | null {
	if (selectedIntegerInventory.cityId === cityId) {
		return { kind: 'selected', inventory: selectedIntegerInventory };
	}
	const remote = remoteIntegerInventories.find((inventory) => inventory.cityId === cityId);
	return remote ? { kind: 'remote', inventory: remote } : null;
}

function getWarehouseCapacity(input: SupplyPlannerLogisticsState, cityId: WorldCityId): number {
	if (input.selectedIntegerInventory.cityId === cityId) return input.selectedWarehouseCapacity;
	return input.remoteWarehouseCapacities[cityId] ?? 0;
}

function compareTransferOrderIds(left: TransferOrder, right: TransferOrder): number {
	return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function checkedAdd(left: number, right: number, label: string): number {
	const sum = left + right;
	if (!Number.isSafeInteger(sum)) {
		throw new RangeError(`${label} exceeds the safe integer range`);
	}
	return sum;
}
