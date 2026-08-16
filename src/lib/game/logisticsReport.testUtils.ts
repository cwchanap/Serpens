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
	return {
		routeId: 'route-1',
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'grain',
		destinationNeed: 100,
		capacity: 100,
		availableOriginStock: 100,
		dispatchedQuantity: 100,
		unusedCapacity: 0,
		unmetDestinationNeed: 0,
		transportCost: 200,
		transferOrderId: 'transfer-1',
		baselineCapacity: 100,
		dispatchSuspended: false,
		modifierImpacts: [],
		...overrides
	};
}
