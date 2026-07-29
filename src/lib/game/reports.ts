import type { DailyReport } from './types';

export interface ReportWindowSummary {
	days: number;
	revenue: number;
	importSpend: number;
	operatingIncome: number;
	operatingCashFlow: number;
	interestAccrued: number;
	interestPaid: number;
	interestCapitalized: number;
	principalBorrowed: number;
	principalRepaid: number;
	refinancedPrincipal: number;
	financingCashFlow: number;
	netCashChange: number;
	netIncome: number;
	averageRevenue: number;
	averageOperatingIncome: number;
	averageOperatingCashFlow: number;
	averageInterestAccrued: number;
	averageInterestPaid: number;
	averageInterestCapitalized: number;
	averagePrincipalBorrowed: number;
	averagePrincipalRepaid: number;
	averageRefinancedPrincipal: number;
	averageFinancingCashFlow: number;
	averageNetCashChange: number;
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
	const importSpend = Math.round(window.reduce((sum, report) => sum + getImportSpend(report), 0));
	const operatingIncome = Math.round(
		window.reduce((sum, report) => sum + report.operatingIncome, 0)
	);
	const operatingCashFlow = Math.round(
		window.reduce((sum, report) => sum + report.operatingCashFlow, 0)
	);
	const interestAccrued = window.reduce((sum, report) => sum + report.interestAccrued, 0);
	const interestPaid = Math.round(window.reduce((sum, report) => sum + report.interestPaid, 0));
	const interestCapitalized = Math.round(
		window.reduce((sum, report) => sum + report.interestCapitalized, 0)
	);
	const principalBorrowed = Math.round(
		window.reduce((sum, report) => sum + report.principalBorrowed, 0)
	);
	const principalRepaid = Math.round(
		window.reduce((sum, report) => sum + report.principalRepaid, 0)
	);
	const refinancedPrincipal = Math.round(
		window.reduce((sum, report) => sum + report.refinancedPrincipal, 0)
	);
	const financingCashFlow = Math.round(
		window.reduce((sum, report) => sum + report.financingCashFlow, 0)
	);
	const netCashChange = Math.round(window.reduce((sum, report) => sum + report.netCashChange, 0));
	const netIncome = Math.round(window.reduce((sum, report) => sum + report.netIncome, 0));
	const days = window.length;

	return {
		days,
		revenue,
		importSpend,
		operatingIncome,
		operatingCashFlow,
		interestAccrued,
		interestPaid,
		interestCapitalized,
		principalBorrowed,
		principalRepaid,
		refinancedPrincipal,
		financingCashFlow,
		netCashChange,
		netIncome,
		averageRevenue: days === 0 ? 0 : Math.round(revenue / days),
		averageOperatingIncome: days === 0 ? 0 : Math.round(operatingIncome / days),
		averageOperatingCashFlow: days === 0 ? 0 : Math.round(operatingCashFlow / days),
		averageInterestAccrued: days === 0 ? 0 : interestAccrued / days,
		averageInterestPaid: days === 0 ? 0 : Math.round(interestPaid / days),
		averageInterestCapitalized: days === 0 ? 0 : Math.round(interestCapitalized / days),
		averagePrincipalBorrowed: days === 0 ? 0 : Math.round(principalBorrowed / days),
		averagePrincipalRepaid: days === 0 ? 0 : Math.round(principalRepaid / days),
		averageRefinancedPrincipal: days === 0 ? 0 : Math.round(refinancedPrincipal / days),
		averageFinancingCashFlow: days === 0 ? 0 : Math.round(financingCashFlow / days),
		averageNetCashChange: days === 0 ? 0 : Math.round(netCashChange / days),
		averageNetIncome: days === 0 ? 0 : Math.round(netIncome / days)
	};
}

function getImportSpend(report: DailyReport): number {
	const productionImportSpend = report.productionReport.importSpend;
	const detailedImportSpend =
		report.storeReports.reduce((sum, storeReport) => sum + storeReport.importSpend, 0) +
		productionImportSpend;

	return Math.max(report.importSpend, detailedImportSpend);
}
