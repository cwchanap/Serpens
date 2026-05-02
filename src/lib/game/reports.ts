import type { DailyReport } from './types';

export interface ReportWindowSummary {
	days: number;
	revenue: number;
	netIncome: number;
	averageRevenue: number;
	averageNetIncome: number;
}

export interface ReportSummary {
	latest: DailyReport | undefined;
	sevenDay: ReportWindowSummary;
	thirtyDay: ReportWindowSummary;
}

export function clampScore(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	return Math.max(0, Math.min(100, Math.round(value)));
}

export function summarizeReports(reports: DailyReport[]): ReportSummary {
	return {
		latest: reports.at(-1),
		sevenDay: summarizeWindow(reports, 7),
		thirtyDay: summarizeWindow(reports, 30)
	};
}

function summarizeWindow(reports: DailyReport[], windowSize: number): ReportWindowSummary {
	const window = reports.slice(-windowSize);
	const revenue = Math.round(window.reduce((sum, report) => sum + report.revenue, 0));
	const netIncome = Math.round(window.reduce((sum, report) => sum + report.netIncome, 0));
	const days = window.length;

	return {
		days,
		revenue,
		netIncome,
		averageRevenue: days === 0 ? 0 : Math.round(revenue / days),
		averageNetIncome: days === 0 ? 0 : Math.round(netIncome / days)
	};
}
