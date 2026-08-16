import { compareWorldCityIds } from './cityInventory';
import { compareRecurringRoutes } from './interCityLogistics';
import {
	resolveEffectiveRecurringRoute,
	type EffectiveRecurringRoute
} from './logisticsRouteModifiers';
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

export type RouteOperationalCondition =
	| 'awaiting-dispatch'
	| 'destination-full'
	| 'origin-stock-constrained'
	| 'route-capacity-constrained'
	| 'route-event-suspended'
	| 'normal';

export interface RouteOperationalSummary {
	route: RecurringRoute;
	/** Current effective route resolved from base route plus active modifiers. */
	effective: EffectiveRecurringRoute;
	inTransitQuantity: number;
	latestAttempt: DailyRouteDispatchAttempt | null;
	utilization: number | null;
	unusedCapacity: number;
	unmetDestinationNeed: number;
	deliveredUnits: number;
	transportCost: number;
	condition: RouteOperationalCondition;
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

export function selectRecentRouteDispatchAttempts(
	game: GameState,
	limit = 2
): ReadonlyMap<string, readonly DailyRouteDispatchAttempt[]> {
	const attemptsByRoute = new Map<string, DailyRouteDispatchAttempt[]>();
	if (limit <= 0) {
		return attemptsByRoute;
	}

	for (let reportIndex = game.reports.length - 1; reportIndex >= 0; reportIndex -= 1) {
		const report = game.reports[reportIndex]!;
		for (const attempt of report.logistics.routeDispatchAttempts) {
			const attempts = attemptsByRoute.get(attempt.routeId);
			if (attempts && attempts.length >= limit) {
				continue;
			}

			if (attempts) {
				attempts.push(attempt);
			} else {
				attemptsByRoute.set(attempt.routeId, [attempt]);
			}
		}
	}

	return attemptsByRoute;
}

/**
 * A dispatch attempt is only valid evidence for a route's current configuration
 * when its origin, destination, material, and base capacity still match.
 * Editing a recurring route via {@link updateRecurringRoute} preserves the
 * route ID while allowing any of these fields to change, so a routeId-only
 * match would let a prior configuration's attempts bleed into the route
 * inspector's latest attempt, utilization, condition, and capacity-streak
 * alerts. Temporary route modifiers change only the effective capacity, so
 * configuration matching compares the persisted baseline capacity.
 */
export function attemptMatchesRoute(
	attempt: DailyRouteDispatchAttempt,
	route: RecurringRoute
): boolean {
	return (
		attempt.originCityId === route.originCityId &&
		attempt.destinationCityId === route.destinationCityId &&
		attempt.materialId === route.materialId &&
		attempt.baselineCapacity === route.capacity
	);
}

export function selectRouteOperations(game: GameState): RouteOperationalSummary[] {
	const totalsByRouteId = new Map<string, RouteOperationalTotals>();
	const routeById = new Map<string, RecurringRoute>();

	for (const route of game.logistics.recurringRoutes) {
		totalsByRouteId.set(route.id, {
			inTransitQuantity: 0,
			latestAttempt: null,
			latestAttemptDay: null,
			deliveredUnits: 0,
			transportCost: 0
		});
		routeById.set(route.id, route);
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

			// Skip attempts recorded under a prior route configuration. The route
			// ID is preserved across edits, so without this guard a stale attempt
			// would surface as the route's latest dispatch and drive its
			// utilization/condition plus capacity-streak alerts.
			const route = routeById.get(attempt.routeId);
			if (route && !attemptMatchesRoute(attempt, route)) {
				continue;
			}

			totals.latestAttempt = attempt;
			totals.latestAttemptDay = report.day;
		}
	}

	return [...game.logistics.recurringRoutes].sort(compareRecurringRoutes).map((route) => {
		const totals = totalsByRouteId.get(route.id)!;
		const latestAttempt = totals.latestAttempt;

		return {
			route,
			effective: resolveEffectiveRecurringRoute(route, game.events.activeModifiers, game.day),
			inTransitQuantity: totals.inTransitQuantity,
			latestAttempt,
			utilization: latestAttempt ? latestAttempt.dispatchedQuantity / latestAttempt.capacity : null,
			unusedCapacity: latestAttempt?.unusedCapacity ?? 0,
			unmetDestinationNeed: latestAttempt?.unmetDestinationNeed ?? 0,
			deliveredUnits: totals.deliveredUnits,
			transportCost: totals.transportCost,
			condition: classifyRouteOperationalCondition(latestAttempt)
		};
	});
}

function classifyRouteOperationalCondition(
	attempt: DailyRouteDispatchAttempt | null
): RouteOperationalCondition {
	if (!attempt) {
		return 'awaiting-dispatch';
	}
	if (attempt.dispatchSuspended) {
		return 'route-event-suspended';
	}
	if (attempt.destinationNeed === 0) {
		return 'destination-full';
	}
	if (attempt.availableOriginStock < Math.min(attempt.destinationNeed, attempt.capacity)) {
		return 'origin-stock-constrained';
	}
	if (attempt.unmetDestinationNeed > 0 && attempt.dispatchedQuantity === attempt.capacity) {
		return 'route-capacity-constrained';
	}
	return 'normal';
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
