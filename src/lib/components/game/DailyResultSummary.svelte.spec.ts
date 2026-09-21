import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type {
	DailyCashContributor,
	DailyResultComparison,
	DailyResultView
} from '$lib/game/reports';
import type { DailyProductionReport, DailyReport } from '$lib/game/types';
import { emptyLogisticsReport } from '$lib/game/logisticsReport.testUtils';
import { createI18n } from '$lib/i18n';
import DailyResultSummary from './DailyResultSummary.svelte';

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
		railUsage: {},
		cityInventories: []
	};
}

function makeDailyReport(overrides: Partial<DailyReport> = {}): DailyReport {
	return {
		day: 7,
		revenue: 1_200,
		costOfGoods: 400,
		grossMargin: 800,
		operatingCosts: 300,
		payrollCost: 200,
		importSpend: 100,
		cashBefore: 5_000,
		operatingIncome: 300,
		operatingCashFlow: 200,
		interestAccrued: 5,
		interestPaid: 5,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 0,
		refinancedPrincipal: 0,
		financingCashFlow: -5,
		netCashChange: 195,
		netIncome: 200,
		cashAfter: 800,
		inventoryLossExpense: 0,
		outstandingPrincipalAfter: 0,
		nextLoanPayment: null,
		scorecard: {
			profit: 50,
			customerSatisfaction: 50,
			staffMorale: 50,
			marketPosition: 50
		},
		productionReport: emptyProductionReport(),
		logistics: emptyLogisticsReport(),
		storeReports: [],
		modifierImpacts: [],
		modifierLifecycle: [],
		marketReports: [],
		warnings: [],
		...overrides
	};
}

function makeView(
	overrides: Partial<DailyReport> = {},
	comparison: DailyResultComparison | null = null,
	contributors: DailyCashContributor[] = []
): DailyResultView {
	return { latest: makeDailyReport(overrides), comparison, contributors };
}

const i18n = createI18n('en');

describe('DailyResultSummary', () => {
	it('renders the empty state without fabricated values', async () => {
		expect.assertions(5);
		render(DailyResultSummary, { view: null, currentCash: null, i18n });

		await expect.element(page.getByText('No completed-day results yet')).toBeVisible();
		expect(page.getByTestId('daily-result-day').elements()).toHaveLength(0);
		expect(page.getByTestId('daily-result-revenue').elements()).toHaveLength(0);
		expect(page.getByTestId('daily-result-bridge').elements()).toHaveLength(0);
		expect(page.getByTestId('daily-result-contributor').elements()).toHaveLength(0);
	});

	it('keeps current cash separate from the report cash values', async () => {
		expect.assertions(3);
		render(DailyResultSummary, { view: makeView({ cashAfter: 800 }), currentCash: 1_000, i18n });

		const block = page.getByTestId('daily-result-current-cash');
		await expect.element(block).toHaveTextContent('$1,000');
		await expect.element(block).not.toHaveTextContent('$800');
		expect(page.getByText('$1,000').elements()).toHaveLength(1);
	});

	it('renders the exact three headline metrics', async () => {
		expect.assertions(3);
		render(DailyResultSummary, { view: makeView(), currentCash: null, i18n });

		await expect.element(page.getByTestId('daily-result-revenue')).toHaveTextContent('$1,200');
		await expect
			.element(page.getByTestId('daily-result-operating-income'))
			.toHaveTextContent('$300');
		await expect
			.element(page.getByTestId('daily-result-net-cash-change'))
			.toHaveTextContent('$195');
	});

	it('renders one report without any comparison subline', async () => {
		expect.assertions(2);
		render(DailyResultSummary, { view: makeView(), currentCash: null, i18n });

		await expect.element(page.getByTestId('store-operating-result')).toBeVisible();
		expect(page.getByText('vs Day').elements()).toHaveLength(0);
	});

	it('renders signed deltas with the explicit previous day', async () => {
		expect.assertions(4);
		render(DailyResultSummary, {
			view: makeView(
				{},
				{
					previousDay: 6,
					revenueDelta: 120,
					operatingIncomeDelta: 40,
					netCashChangeDelta: -30
				}
			),
			currentCash: null,
			i18n
		});

		const revenue = page.getByTestId('daily-result-revenue');
		await expect.element(revenue).toHaveTextContent('+$120');
		await expect.element(revenue).toHaveTextContent('vs Day 6');
		const netCash = page.getByTestId('daily-result-net-cash-change');
		await expect.element(netCash).toHaveTextContent('-$30');
		await expect.element(netCash).toHaveTextContent('vs Day 6');
	});

	it('renders negative metric values with the currency formatter', async () => {
		expect.assertions(1);
		render(DailyResultSummary, {
			view: makeView({ operatingIncome: -45, netCashChange: -50 }),
			currentCash: null,
			i18n
		});

		await expect
			.element(page.getByTestId('daily-result-operating-income'))
			.toHaveTextContent('-$45');
	});

	it('renders the exact operating/financing/net cash bridge', async () => {
		expect.assertions(6);
		render(DailyResultSummary, { view: makeView(), currentCash: null, i18n });

		const bridge = page.getByTestId('daily-result-bridge');
		await expect.element(bridge).toHaveTextContent('Operating cash flow');
		await expect.element(bridge).toHaveTextContent('Financing cash flow');
		await expect.element(bridge).toHaveTextContent('Net cash change');
		await expect.element(bridge).toHaveTextContent('$200');
		await expect.element(bridge).toHaveTextContent('-$5');
		await expect.element(bridge).toHaveTextContent('$195');
	});

	it('explains positive operating income against a falling cash balance', async () => {
		expect.assertions(1);
		render(DailyResultSummary, {
			view: makeView({ operatingIncome: 300, netCashChange: -50 }),
			currentCash: null,
			i18n
		});

		await expect
			.element(page.getByText(/Operating income was positive, but cash still fell/))
			.toBeVisible();
	});

	it('renders the neutral distinction when operating income and cash move together', async () => {
		expect.assertions(1);
		render(DailyResultSummary, { view: makeView(), currentCash: null, i18n });

		await expect
			.element(page.getByText(/Operating income measures the day's performance/))
			.toBeVisible();
	});

	it('renders at most two contributors in the given order', async () => {
		expect.assertions(5);
		render(DailyResultSummary, {
			view: makeView({}, null, [
				{ kind: 'import-spend', amount: -400 },
				{ kind: 'principal-borrowed', amount: 100 },
				{ kind: 'interest-paid', amount: -5 }
			]),
			currentCash: null,
			i18n
		});

		await expect.element(page.getByText('Recorded cash contributors')).toBeVisible();
		const items = page.getByTestId('daily-result-contributor');
		expect(items.elements()).toHaveLength(2);
		await expect.element(items.nth(0)).toHaveTextContent('External imports');
		await expect.element(items.nth(0)).toHaveTextContent('-$400');
		await expect.element(items.nth(1)).toHaveTextContent('Principal borrowed');
	});

	it('omits the contributor list when contributors are empty', async () => {
		expect.assertions(2);
		render(DailyResultSummary, { view: makeView(), currentCash: null, i18n });

		await expect.element(page.getByTestId('daily-result')).toBeVisible();
		expect(page.getByTestId('daily-result-contributor').elements()).toHaveLength(0);
	});

	it('invokes the optional Reports callback', async () => {
		expect.assertions(1);
		const onOpenReports = vi.fn();
		render(DailyResultSummary, { view: makeView(), currentCash: null, i18n, onOpenReports });

		await page.getByRole('button', { name: 'Reports' }).click();
		expect(onOpenReports).toHaveBeenCalledTimes(1);
	});

	it('invokes the optional Finance callback', async () => {
		expect.assertions(1);
		const onOpenFinance = vi.fn();
		render(DailyResultSummary, { view: makeView(), currentCash: null, i18n, onOpenFinance });

		await page.getByRole('button', { name: 'Finance' }).click();
		expect(onOpenFinance).toHaveBeenCalledTimes(1);
	});

	it('renders no action buttons when callbacks are omitted', async () => {
		expect.assertions(1);
		render(DailyResultSummary, { view: makeView(), currentCash: null, i18n });

		expect(page.getByRole('button').elements()).toHaveLength(0);
	});

	it('resolves the pinned current-cash testid without colliding with a ticker rendering', async () => {
		expect.assertions(4);
		render(DailyResultSummary, { view: makeView({ cashAfter: 800 }), currentCash: 1_000, i18n });

		expect(page.getByTestId('daily-result-current-cash').elements()).toHaveLength(1);
		await expect
			.element(page.getByTestId('daily-result-current-cash'))
			.toHaveTextContent('Current cash');
		await expect.element(page.getByTestId('daily-result-current-cash')).toHaveTextContent('$1,000');
		expect(page.getByText('$1,000').elements()).toHaveLength(1);
	});

	it('renders the day heading and live cash in the empty state', async () => {
		expect.assertions(2);
		render(DailyResultSummary, { view: null, currentCash: 500, i18n });

		await expect.element(page.getByTestId('daily-result-current-cash')).toHaveTextContent('$500');
		expect(page.getByTestId('daily-result-day').elements()).toHaveLength(0);
	});
});
