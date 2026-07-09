import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ReportSummary } from '$lib/game/reports';
import type { DailyProductionReport } from '$lib/game/types';
import { createI18n } from '$lib/i18n';
import ReportsPanel from './ReportsPanel.svelte';

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
		warehouseUsed: 0
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
		netIncome: 69,
		cashAfter: 12_345,
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
		netIncome: 69,
		averageRevenue: 1_250,
		averageNetIncome: 69
	},
	thirtyDay: {
		days: 1,
		revenue: 1_250,
		importSpend: 456,
		netIncome: 69,
		averageRevenue: 1_250,
		averageNetIncome: 69
	}
};

describe('ReportsPanel', () => {
	it('shows production import and warehouse overflow metrics with daily imports', async () => {
		expect.assertions(6);

		render(ReportsPanel, {
			i18n: createI18n('en'),
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

		render(ReportsPanel, { i18n: createI18n('en'), summary });

		const reportsRegion = page.getByRole('region', { name: 'Reports' });

		await expect.element(reportsRegion.getByText('Imports', { exact: true })).toBeVisible();
		await expect.element(reportsRegion.getByText('$456')).toBeVisible();
	});

	it('lists the latest daily warnings when present', async () => {
		expect.assertions(1);

		render(ReportsPanel, {
			i18n: createI18n('en'),
			summary: {
				...summary,
				latest: { ...summary.latest!, warnings: ['Supply chain shortage', 'Staffing gap'] }
			}
		});

		const warningsList = page.getByRole('list', { name: 'Daily warnings' });

		await expect.element(warningsList.getByText('Supply chain shortage')).toBeVisible();
	});

	it('localizes known latest daily warnings while preserving store names and unknown fallback', async () => {
		expect.assertions(4);
		const i18n = createI18n('ja');

		render(ReportsPanel, {
			i18n,
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					warnings: [
						'Founding Store is short 1234 general staff',
						'cash reserves are low',
						'Historical warning'
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
		await expect.element(warningsList.getByText('Historical warning')).toBeVisible();
		await expect
			.element(warningsList.getByText('Founding Store is short 1234 general staff'))
			.not.toBeInTheDocument();
	});

	it('shows the empty state when there is no latest report', async () => {
		expect.assertions(1);

		render(ReportsPanel, { i18n: createI18n('en'), summary: { ...summary, latest: undefined } });

		await expect
			.element(page.getByText('No reports yet. Advance the first day to generate results.'))
			.toBeVisible();
	});
});
