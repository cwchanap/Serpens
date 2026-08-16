import type { DailyLogisticsReport, DailyRouteDispatchAttempt } from './types';

export function emptyLogisticsReport(): DailyLogisticsReport {
	return {
		arrivals: [],
		routeDispatchAttempts: [],
		deliveredUnits: 0,
		scheduledTransportCost: 0,
		modifierRecoveries: []
	};
}

export function createRouteDispatchAttempt(
	overrides: Partial<DailyRouteDispatchAttempt> = {}
): DailyRouteDispatchAttempt {
	// baselineCapacity tracks an explicit override, else the resolved capacity,
	// so capacity-only overrides cannot leave a stale baseline behind. The
	// trailing spread keeps caller overrides authoritative.
	const capacity = overrides.capacity ?? 100;
	return {
		routeId: 'route-1',
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'grain',
		destinationNeed: 100,
		capacity,
		availableOriginStock: 100,
		dispatchedQuantity: 100,
		unusedCapacity: 0,
		unmetDestinationNeed: 0,
		transportCost: 200,
		transferOrderId: 'transfer-1',
		baselineCapacity: overrides.baselineCapacity ?? capacity,
		dispatchSuspended: false,
		modifierImpacts: [],
		...overrides
	};
}
