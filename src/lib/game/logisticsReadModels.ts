import { compareWorldCityIds } from './cityInventory';
import type {
	DailyRouteDispatchAttempt,
	GameState,
	MaterialId,
	RecurringRoute,
	TransferOrder,
	WorldCityId
} from './types';

export interface InTransitInventorySummary {
	destinationCityId: WorldCityId;
	materialId: MaterialId;
	quantity: number;
	orderIds: string[];
	earliestArrivalOnDay: number;
}

export interface RouteOperationalSummary {
	route: RecurringRoute;
	inTransitQuantity: number;
	latestAttempt: DailyRouteDispatchAttempt | null;
	utilization: number | null;
	unusedCapacity: number;
	unmetDestinationNeed: number;
	deliveredUnits: number;
	transportCost: number;
}

interface RouteOperationalTotals {
	inTransitQuantity: number;
	latestAttempt: DailyRouteDispatchAttempt | null;
	latestAttemptDay: number | null;
	deliveredUnits: number;
	transportCost: number;
}

export function selectInTransitInventory(game: GameState): InTransitInventorySummary[] {
	const summaries = new Map<string, InTransitInventorySummary>();

	for (const order of game.logistics.transferOrders) {
		if (order.status !== 'in-transit') {
			continue;
		}

		const key = `${order.destinationCityId}:${order.materialId}`;
		const existing = summaries.get(key);
		if (existing) {
			existing.quantity = checkedAdd(
				existing.quantity,
				order.quantity,
				'In-transit inventory quantity'
			);
			existing.orderIds.push(order.id);
			existing.earliestArrivalOnDay = Math.min(existing.earliestArrivalOnDay, order.arrivalOnDay);
			continue;
		}

		summaries.set(key, {
			destinationCityId: order.destinationCityId,
			materialId: order.materialId,
			quantity: order.quantity,
			orderIds: [order.id],
			earliestArrivalOnDay: order.arrivalOnDay
		});
	}

	return [...summaries.values()]
		.map((summary) => ({ ...summary, orderIds: [...summary.orderIds].sort(compareRawIds) }))
		.sort(
			(left, right) =>
				compareWorldCityIds(left.destinationCityId, right.destinationCityId) ||
				compareRawIds(left.materialId, right.materialId)
		);
}

export function selectRecentTransfers(game: GameState, limit = 20): TransferOrder[] {
	return [...game.logistics.transferOrders]
		.sort(
			(left, right) =>
				right.dispatchedOnDay - left.dispatchedOnDay || -compareRawIds(left.id, right.id)
		)
		.slice(0, limit);
}

export function selectRouteOperations(game: GameState): RouteOperationalSummary[] {
	const totalsByRouteId = new Map<string, RouteOperationalTotals>();

	for (const route of game.logistics.recurringRoutes) {
		totalsByRouteId.set(route.id, {
			inTransitQuantity: 0,
			latestAttempt: null,
			latestAttemptDay: null,
			deliveredUnits: 0,
			transportCost: 0
		});
	}

	for (const order of game.logistics.transferOrders) {
		if (order.source.kind !== 'recurring-route') {
			continue;
		}

		const totals = totalsByRouteId.get(order.source.routeId);
		if (!totals) {
			continue;
		}

		totals.transportCost = checkedAdd(
			totals.transportCost,
			order.transportCost,
			'Route transport cost'
		);
		if (order.status === 'in-transit') {
			totals.inTransitQuantity = checkedAdd(
				totals.inTransitQuantity,
				order.quantity,
				'Route in-transit quantity'
			);
		} else {
			totals.deliveredUnits = checkedAdd(
				totals.deliveredUnits,
				order.quantity,
				'Route delivered units'
			);
		}
	}

	for (const report of game.reports) {
		for (const attempt of report.logistics.routeDispatchAttempts) {
			const totals = totalsByRouteId.get(attempt.routeId);
			if (!totals || (totals.latestAttemptDay !== null && report.day <= totals.latestAttemptDay)) {
				continue;
			}

			totals.latestAttempt = attempt;
			totals.latestAttemptDay = report.day;
		}
	}

	return [...game.logistics.recurringRoutes].sort(compareCurrentRoutes).map((route) => {
		const totals = totalsByRouteId.get(route.id)!;
		const latestAttempt = totals.latestAttempt;

		return {
			route,
			inTransitQuantity: totals.inTransitQuantity,
			latestAttempt,
			utilization: latestAttempt ? latestAttempt.dispatchedQuantity / latestAttempt.capacity : null,
			unusedCapacity: latestAttempt?.unusedCapacity ?? 0,
			unmetDestinationNeed: latestAttempt?.unmetDestinationNeed ?? 0,
			deliveredUnits: totals.deliveredUnits,
			transportCost: totals.transportCost
		};
	});
}

export function selectLogisticsTotals(game: GameState): {
	deliveredUnits: number;
	transportCost: number;
} {
	// Transfer orders are the authoritative full history; this intentionally has no retention limit.
	let deliveredUnits = 0;
	let transportCost = 0;

	for (const order of game.logistics.transferOrders) {
		transportCost = checkedAdd(transportCost, order.transportCost, 'Logistics transport cost');
		if (order.status === 'delivered') {
			deliveredUnits = checkedAdd(deliveredUnits, order.quantity, 'Logistics delivered units');
		}
	}

	return { deliveredUnits, transportCost };
}

function compareCurrentRoutes(left: RecurringRoute, right: RecurringRoute): number {
	if (left.priority !== right.priority) {
		return left.priority < right.priority ? -1 : 1;
	}

	return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function compareRawIds(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function checkedAdd(left: number, right: number, label: string): number {
	const sum = left + right;
	if (!Number.isSafeInteger(sum)) {
		throw new RangeError(`${label} exceeds the safe integer range`);
	}

	return sum;
}
