import type { DailyLogisticsReport } from './types';

export function emptyLogisticsReport(): DailyLogisticsReport {
	return {
		arrivals: [],
		routeDispatchAttempts: [],
		deliveredUnits: 0,
		scheduledTransportCost: 0
	};
}
