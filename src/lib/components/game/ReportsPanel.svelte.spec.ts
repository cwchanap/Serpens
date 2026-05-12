import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ReportSummary } from '$lib/game/reports';
import type { DailyProductionReport } from '$lib/game/types';
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

		render(ReportsPanel, { summary });

		const reportsRegion = page.getByRole('region', { name: 'Reports' });

		await expect.element(reportsRegion.getByText('Imports', { exact: true })).toBeVisible();
		await expect.element(reportsRegion.getByText('$456')).toBeVisible();
	});
});
