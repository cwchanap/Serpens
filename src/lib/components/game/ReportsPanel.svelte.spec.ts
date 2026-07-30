import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ReportSummary } from '$lib/game/reports';
import type { DailyProductionReport, Store } from '$lib/game/types';
import { createI18n } from '$lib/i18n';
import ReportsPanel from './ReportsPanel.svelte';

const store: Store = {
	id: 'store-1',
	level: 1,
	name: 'Founding Store',
	archetypeId: 'boutique',
	location: { neighborhoodId: 'downtown', x: 1, y: 1 },
	cityId: 'harbor-city',
	tileId: 'harbor-city-1-1',
	mapX: 1,
	mapY: 1,
	daysOpen: 1,
	reputation: 50,
	stockHealth: 80,
	products: [],
	staffMorale: 75,
	staffCapacity: 70,
	localDemand: 72,
	competition: 15,
	managerQuality: 60
};

function emptyProductionReport(): DailyProductionReport {
	return {
		produced: [],
		consumed: [],
		importedInputs: [],
		warehousePulls: [],
		shopImports: [],
		importSpend: 0,
		operatingCost: 0,
		overflowUnits: 0,
		overflowCost: 0,
		warehouseCapacity: 0,
		warehouseUsed: 0,
		railShipments: [],
		railUsage: {}
	};
}

const summary: ReportSummary = {
	latest: {
		day: 4,
		revenue: 1_250,
		costOfGoods: 450,
		grossMargin: 800,
		operatingCosts: 275,
		payrollCost: 320,
		importSpend: 456,
		cashBefore: 12_315,
		operatingIncome: 525,
		operatingCashFlow: 69,
		interestAccrued: 0.25,
		interestPaid: 9,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 30,
		refinancedPrincipal: 0,
		financingCashFlow: -39,
		netCashChange: 30,
		netIncome: 69,
		cashAfter: 12_345,
		outstandingPrincipalAfter: 5_970,
		nextLoanPayment: { loanId: 'loan-1', day: 11, amount: 49 },
		scorecard: {
			profit: 55,
			customerSatisfaction: 60,
			staffMorale: 65,
			marketPosition: 50
		},
		productionReport: emptyProductionReport(),
		storeReports: [],
		warnings: []
	},
	sevenDay: {
		days: 1,
		revenue: 1_250,
		importSpend: 456,
		operatingIncome: 525,
		operatingCashFlow: 69,
		interestAccrued: 0.25,
		interestPaid: 9,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 30,
		refinancedPrincipal: 0,
		financingCashFlow: -39,
		netCashChange: 30,
		netIncome: 69,
		averageRevenue: 1_250,
		averageOperatingIncome: 525,
		averageOperatingCashFlow: 69,
		averageInterestAccrued: 0.25,
		averageInterestPaid: 9,
		averageInterestCapitalized: 0,
		averagePrincipalBorrowed: 0,
		averagePrincipalRepaid: 30,
		averageRefinancedPrincipal: 0,
		averageFinancingCashFlow: -39,
		averageNetCashChange: 30,
		averageNetIncome: 69
	},
	thirtyDay: {
		days: 1,
		revenue: 1_250,
		importSpend: 456,
		operatingIncome: 525,
		operatingCashFlow: 69,
		interestAccrued: 0.25,
		interestPaid: 9,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 30,
		refinancedPrincipal: 0,
		financingCashFlow: -39,
		netCashChange: 30,
		netIncome: 69,
		averageRevenue: 1_250,
		averageOperatingIncome: 525,
		averageOperatingCashFlow: 69,
		averageInterestAccrued: 0.25,
		averageInterestPaid: 9,
		averageInterestCapitalized: 0,
		averagePrincipalBorrowed: 0,
		averagePrincipalRepaid: 30,
		averageRefinancedPrincipal: 0,
		averageFinancingCashFlow: -39,
		averageNetCashChange: 30,
		averageNetIncome: 69
	}
};

describe('ReportsPanel', () => {
	it('shows production import and warehouse overflow metrics with daily imports', async () => {
		expect.assertions(6);

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					productionReport: {
						...emptyProductionReport(),
						importSpend: 222,
						overflowUnits: 8,
						overflowCost: 44
					}
				}
			}
		});

		const reportsRegion = page.getByRole('region', { name: 'Reports' });

		await expect.element(reportsRegion.getByText('Imports', { exact: true })).toBeVisible();
		await expect.element(reportsRegion.getByText('$456')).toBeVisible();
		await expect.element(reportsRegion.getByText('Production imports')).toBeVisible();
		await expect.element(reportsRegion.getByText('$222')).toBeVisible();
		await expect.element(reportsRegion.getByText('Warehouse overflow')).toBeVisible();
		await expect.element(reportsRegion.getByText('$44')).toBeVisible();
	});

	it('shows latest import spend with the daily metrics', async () => {
		expect.assertions(2);

		render(ReportsPanel, { i18n: createI18n('en'), stores: [], summary });

		const reportsRegion = page.getByRole('region', { name: 'Reports' });

		await expect.element(reportsRegion.getByText('Imports', { exact: true })).toBeVisible();
		await expect.element(reportsRegion.getByText('$456')).toBeVisible();
	});

	it('labels reconciled operating and financing movements without calling principal amount due', async () => {
		expect.assertions(9);

		render(ReportsPanel, { i18n: createI18n('en'), stores: [], summary });

		const reportsRegion = page.getByRole('region', { name: 'Reports' });

		await expect.element(reportsRegion.getByText('Operating income')).toBeVisible();
		await expect
			.element(reportsRegion.getByText('Operating cash flow', { exact: true }))
			.toBeVisible();
		await expect.element(reportsRegion.getByText('Financing cash flow')).toBeVisible();
		await expect.element(reportsRegion.getByText('Principal repaid')).toBeVisible();
		await expect.element(reportsRegion.getByText('Interest accrued')).toBeVisible();
		await expect.element(reportsRegion.getByText('Interest capitalized')).toBeVisible();
		await expect.element(reportsRegion.getByText('Refinanced principal')).toBeVisible();
		await expect.element(reportsRegion.getByText('Ending principal')).toBeVisible();
		await expect.element(reportsRegion.getByText('Amount due')).not.toBeInTheDocument();
	});

	it('lists the latest daily warnings when present', async () => {
		expect.assertions(1);

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: { ...summary.latest!, warnings: [{ code: 'cashReservesLow' }] }
			}
		});

		const warningsList = page.getByRole('list', { name: 'Daily warnings' });

		await expect.element(warningsList.getByText('cash reserves are low')).toBeVisible();
	});

	it('localizes known latest daily warnings while preserving store names', async () => {
		expect.assertions(3);
		const i18n = createI18n('ja');

		render(ReportsPanel, {
			i18n,
			stores: [store],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					warnings: [
						{ code: 'shortGeneral', storeId: 'store-1', count: 1234 },
						{ code: 'cashReservesLow' }
					]
				}
			}
		});

		const warningsList = page.getByRole('list', { name: '日次警告' });

		await expect
			.element(
				warningsList.getByText(
					`Founding Store の一般スタッフが ${i18n.format.integer(1234)} 名不足`
				)
			)
			.toBeVisible();
		await expect.element(warningsList.getByText('現金準備が少なくなっています')).toBeVisible();
		await expect
			.element(warningsList.getByText('Founding Store is short 1234 general staff'))
			.not.toBeInTheDocument();
	});

	it('renders duplicate warning codes from different stores without key collisions', async () => {
		expect.assertions(2);

		const store2: Store = { ...store, id: 'store-2', name: 'Second Store' };

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [store, store2],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					warnings: [
						{ code: 'stockPressure', storeId: 'store-1' },
						{ code: 'stockPressure', storeId: 'store-2' }
					]
				}
			}
		});

		const warningsList = page.getByRole('list', { name: 'Daily warnings' });

		await expect.element(warningsList.getByText('Founding Store')).toBeVisible();
		await expect.element(warningsList.getByText('Second Store')).toBeVisible();
	});

	it('renders the rail shipment total when the latest report has rail shipments', async () => {
		expect.assertions(2);

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					productionReport: {
						...emptyProductionReport(),
						railShipments: [
							{
								materialId: 'grain',
								quantity: 12,
								value: 36,
								kind: 'push-warehouse',
								fromId: 'farm-1',
								toId: 'mill-1'
							},
							{
								materialId: 'flour',
								quantity: 8,
								value: 24,
								kind: 'pull-warehouse',
								fromId: 'mill-1',
								toId: 'warehouse-1'
							}
						]
					}
				}
			}
		});

		const reportsRegion = page.getByRole('region', { name: 'Reports' });

		await expect.element(reportsRegion.getByText('Rail shipments')).toBeVisible();
		await expect.element(reportsRegion.getByText('20', { exact: true })).toBeVisible();
	});

	it('shows the empty state when there is no latest report', async () => {
		expect.assertions(1);

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: { ...summary, latest: undefined }
		});

		await expect
			.element(page.getByText('No reports yet. Advance the first day to generate results.'))
			.toBeVisible();
	});
});
