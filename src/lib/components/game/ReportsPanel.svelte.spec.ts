import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ReportSummary } from '$lib/game/reports';
import ReportsPanel from './ReportsPanel.svelte';

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
		storeReports: [],
		warnings: []
	},
	sevenDay: {
		days: 1,
		revenue: 1_250,
		netIncome: 69,
		averageRevenue: 1_250,
		averageNetIncome: 69
	},
	thirtyDay: {
		days: 1,
		revenue: 1_250,
		netIncome: 69,
		averageRevenue: 1_250,
		averageNetIncome: 69
	}
};

describe('ReportsPanel', () => {
	it('shows latest import spend with the daily metrics', async () => {
		expect.assertions(2);

		render(ReportsPanel, { summary });

		const reportsRegion = page.getByRole('region', { name: 'Reports' });

		await expect.element(reportsRegion.getByText('Imports')).toBeVisible();
		await expect.element(reportsRegion.getByText('$456')).toBeVisible();
	});
});
