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
	const total = (select: (report: DailyReport) => number, round = true): number => {
		const sum = window.reduce((acc, report) => acc + select(report), 0);
		return round ? Math.round(sum) : sum;
	};
	const revenue = total((report) => report.revenue);
	const importSpend = total((report) => getImportSpend(report));
	const operatingIncome = total((report) => report.operatingIncome);
	const operatingCashFlow = total((report) => report.operatingCashFlow);
	const interestAccrued = total((report) => report.interestAccrued, false);
	const interestPaid = total((report) => report.interestPaid);
	const interestCapitalized = total((report) => report.interestCapitalized);
	const principalBorrowed = total((report) => report.principalBorrowed);
	const principalRepaid = total((report) => report.principalRepaid);
	const refinancedPrincipal = total((report) => report.refinancedPrincipal);
	const financingCashFlow = total((report) => report.financingCashFlow);
	const netCashChange = total((report) => report.netCashChange);
	const netIncome = total((report) => report.netIncome);
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
