import { describe, expect, test } from 'vitest';
import { emptyLogisticsReport } from './logisticsReport.testUtils';
import { buildDailyResultView, clampScore, summarizeReports } from './reports';
import type { DailyProductionReport, DailyReport, DailyStoreReport } from './types';

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

function report(
	day: number,
	netIncome: number,
	options: {
		storeImportSpend?: number;
		productionImportSpend?: number;
		operatingIncome?: number;
		principalBorrowed?: number;
		principalRepaid?: number;
		interestPaid?: number;
		financingCashFlow?: number;
		netCashChange?: number;
	} = {}
): DailyReport {
	const productionReport = {
		...emptyProductionReport(),
		importSpend: options.productionImportSpend ?? 0
	};
	const storeReports =
		options.storeImportSpend === undefined ? [] : [storeReport(options.storeImportSpend)];
	const financingCashFlow = options.financingCashFlow ?? -4;
	const netCashChange = options.netCashChange ?? netIncome + financingCashFlow;

	return {
		day,
		revenue: 1_000 + day,
		costOfGoods: 400,
		grossMargin: 600,
		operatingCosts: 300,
		payrollCost: 0,
		importSpend: options.storeImportSpend ?? 0,
		cashBefore: 10_000,
		operatingIncome: options.operatingIncome ?? 300,
		operatingCashFlow: netIncome,
		interestAccrued: 0.125,
		interestPaid: options.interestPaid ?? 3,
		interestCapitalized: 2,
		principalBorrowed: options.principalBorrowed ?? 4,
		principalRepaid: options.principalRepaid ?? 5,
		refinancedPrincipal: 6,
		financingCashFlow,
		netCashChange,
		netIncome,
		cashAfter: 10_000 + netCashChange,
		outstandingPrincipalAfter: 9_000,
		nextLoanPayment: { loanId: 'loan-1', day: day + 7, amount: 120 },
		scorecard: {
			profit: 50,
			customerSatisfaction: 60,
			staffMorale: 70,
			marketPosition: 20
		},
		productionReport,
		logistics: emptyLogisticsReport(),
		storeReports,
		inventoryLossExpense: 0,
		modifierImpacts: [],
		modifierLifecycle: [],
		marketReports: [],
		warnings: []
	};
}

function storeReport(importSpend: number): DailyStoreReport {
	return {
		storeId: 'store-1',
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		operatingCosts: 0,
		importSpend,
		netIncome: -importSpend,
		customersServed: 0,
		demandMissed: 0,
		staffingCoverage: 100,
		staffingShortage: { manager: 0, general: 0 },
		stockHealth: 100,
		staffMorale: 100,
		reputation: 100,
		brandReputationAdjustment: 0,
		marketPosition: 100,
		productReports: [],
		inventoryLossExpense: 0,
		replenishment: null,
		warnings: []
	};
}

describe('reports', () => {
	test('clamps score values into the scorecard range', () => {
		expect.assertions(3);
		expect(clampScore(-4)).toBe(0);
		expect(clampScore(48.7)).toBe(49);
		expect(clampScore(140)).toBe(100);
	});

	test('clamps non-finite score values to zero', () => {
		expect.assertions(3);
		expect(clampScore(Number.NaN)).toBe(0);
		expect(clampScore(Number.POSITIVE_INFINITY)).toBe(0);
		expect(clampScore(Number.NEGATIVE_INFINITY)).toBe(0);
	});

	test('summarizes available history for 7-day and 30-day windows', () => {
		expect.assertions(6);
		const reports = Array.from({ length: 10 }, (_, index) => report(index + 1, 100 + index));
		const summary = summarizeReports(reports);

		expect(summary.latest?.day).toBe(10);
		expect(summary.sevenDay.days).toBe(7);
		expect(summary.thirtyDay.days).toBe(10);
		expect(summary.sevenDay.netIncome).toBe(742);
		expect(summary.thirtyDay.netIncome).toBe(1_045);
		expect(summary.sevenDay.averageRevenue).toBe(1007);
	});

	test('exposes modifier detail only through the latest report', () => {
		const earlier = report(1, 100);
		const latest = report(2, 200);
		latest.modifierImpacts = [
			{
				modifierId: 'modifier-2',
				source: { eventId: 'supplier-terms', instanceId: 'event-2', optionId: 'bulk' },
				target: { kind: 'company' },
				effectKind: 'import-cost-multiplier',
				explanation: { key: 'events.supplierTerms.bulk', params: {} },
				scope: 'retail-product',
				affectedIds: ['snacks'],
				multiplier: 0.9,
				resolvedMultiplier: 0.9,
				baselineCost: 30,
				actualCost: 27,
				applicationCount: 1
			}
		];
		const summary = summarizeReports([earlier, latest]);

		expect(summary.latest?.modifierImpacts).toBe(latest.modifierImpacts);
		expect(summary.latest?.modifierLifecycle).toBe(latest.modifierLifecycle);
		expect(summary.sevenDay).not.toHaveProperty('modifierImpacts');
		expect(summary.sevenDay).not.toHaveProperty('modifierLifecycle');
		expect(summary.thirtyDay).not.toHaveProperty('modifierImpacts');
		expect(summary.thirtyDay).not.toHaveProperty('modifierLifecycle');
	});

	test('includes production import spend in summary import totals', () => {
		expect.assertions(2);
		const reports = [
			report(1, 100, { storeImportSpend: 5, productionImportSpend: 7 }),
			report(2, 100, { storeImportSpend: 3, productionImportSpend: 11 })
		];
		const summary = summarizeReports(reports);

		expect(summary.sevenDay.importSpend).toBe(26);
		expect(summary.thirtyDay.importSpend).toBe(26);
	});

	test('aggregates operating and financing fields without rounding accrued interest', () => {
		expect.assertions(10);
		const summary = summarizeReports([report(1, 100), report(2, 200)]).sevenDay;

		expect(summary.operatingIncome).toBe(600);
		expect(summary.operatingCashFlow).toBe(300);
		expect(summary.interestAccrued).toBe(0.25);
		expect(summary.interestPaid).toBe(6);
		expect(summary.interestCapitalized).toBe(4);
		expect(summary.principalBorrowed).toBe(8);
		expect(summary.principalRepaid).toBe(10);
		expect(summary.refinancedPrincipal).toBe(12);
		expect(summary.financingCashFlow).toBe(-8);
		expect(summary.netCashChange).toBe(292);
	});

	test('returns zero averages when there are no reports', () => {
		expect.assertions(5);
		const summary = summarizeReports([]);

		expect(summary.latest).toBeUndefined();
		expect(summary.sevenDay.days).toBe(0);
		expect(summary.sevenDay.averageRevenue).toBe(0);
		expect(summary.thirtyDay.days).toBe(0);
		expect(summary.thirtyDay.averageNetIncome).toBe(0);
	});

	describe('buildDailyResultView', () => {
		test('returns null when there are no reports', () => {
			expect(buildDailyResultView([])).toBeNull();
		});

		test('summarizes one ordinary completed day without comparison', () => {
			expect.assertions(3);
			const view = buildDailyResultView([report(1, 300)]);

			expect(view?.latest.day).toBe(1);
			expect(view?.comparison).toBeNull();
			expect(view?.contributors).toEqual([
				{ kind: 'principal-repaid', amount: -5 },
				{ kind: 'principal-borrowed', amount: 4 }
			]);
		});

		test('compares two completed days with absolute signed deltas', () => {
			expect.assertions(2);
			const view = buildDailyResultView([
				report(1, 300),
				report(2, 320, { operatingIncome: 350, financingCashFlow: -9 })
			]);

			expect(view?.comparison).toEqual({
				previousDay: 1,
				revenueDelta: 1,
				operatingIncomeDelta: 50,
				netCashChangeDelta: 15
			});
			expect(view?.latest.day).toBe(2);
		});

		test('explains positive operating income alongside negative net cash change from recorded cash pressure', () => {
			expect.assertions(4);
			const view = buildDailyResultView([
				report(3, 500, { operatingIncome: 500, principalRepaid: 800, financingCashFlow: -800 })
			]);

			expect(view?.latest.netCashChange).toBe(-300);
			expect(view?.latest.operatingCashFlow).toBe(500);
			expect(view?.latest.financingCashFlow).toBe(-800);
			expect(view?.contributors[0]).toEqual({ kind: 'principal-repaid', amount: -800 });
		});

		test('consumes recorded netCashChange, operatingCashFlow, and financingCashFlow directly', () => {
			expect.assertions(4);
			const source = report(4, 240, {
				operatingIncome: 240,
				financingCashFlow: -140,
				netCashChange: 100
			});
			const view = buildDailyResultView([source]);

			expect(view?.latest).toBe(source);
			expect(view?.latest.netCashChange).toBe(100);
			expect(view?.latest.operatingCashFlow).toBe(240);
			expect(view?.latest.financingCashFlow).toBe(-140);
		});

		test('uses reconciled import spend for the import-purchase contributor, matching summarizeReports', () => {
			expect.assertions(3);
			const day = report(5, 300, { storeImportSpend: 40, productionImportSpend: 35 });
			const view = buildDailyResultView([day]);

			expect(day.importSpend).toBe(40);
			expect(view?.contributors[0]).toEqual({ kind: 'import-spend', amount: -75 });
			expect(summarizeReports([day]).sevenDay.importSpend).toBe(75);
		});

		test('surfaces principal repayment as a negative contributor', () => {
			expect.assertions(1);
			const view = buildDailyResultView([report(6, 300, { principalRepaid: 80 })]);

			expect(view?.contributors).toEqual([
				{ kind: 'principal-repaid', amount: -80 },
				{ kind: 'principal-borrowed', amount: 4 }
			]);
		});

		test('surfaces borrowing as a positive inflow contributor', () => {
			expect.assertions(1);
			const view = buildDailyResultView([report(7, 300, { principalBorrowed: 200 })]);

			expect(view?.contributors).toEqual([
				{ kind: 'principal-borrowed', amount: 200 },
				{ kind: 'principal-repaid', amount: -5 }
			]);
		});

		test('surfaces paid interest as a negative contributor', () => {
			expect.assertions(1);
			const view = buildDailyResultView([report(8, 300, { interestPaid: 25 })]);

			expect(view?.contributors).toEqual([
				{ kind: 'interest-paid', amount: -25 },
				{ kind: 'principal-repaid', amount: -5 }
			]);
		});

		test('keeps only the two largest when there are more than two candidate contributors', () => {
			expect.assertions(1);
			const view = buildDailyResultView([
				report(9, 300, {
					storeImportSpend: 30,
					productionImportSpend: 20,
					principalBorrowed: 70,
					principalRepaid: 60,
					interestPaid: 50
				})
			]);

			expect(view?.contributors).toEqual([
				{ kind: 'principal-borrowed', amount: 70 },
				{ kind: 'principal-repaid', amount: -60 }
			]);
		});

		test('breaks equal-magnitude ties by declaration order', () => {
			expect.assertions(1);
			const view = buildDailyResultView([
				report(10, 300, {
					storeImportSpend: 45,
					productionImportSpend: 45,
					principalBorrowed: 90,
					principalRepaid: 90,
					interestPaid: 90
				})
			]);

			expect(view?.contributors).toEqual([
				{ kind: 'import-spend', amount: -90 },
				{ kind: 'principal-repaid', amount: -90 }
			]);
		});

		test('does not mutate the source reports or array', () => {
			expect.assertions(2);
			const reports = [report(1, 300), report(2, 320, { principalBorrowed: 250 })];
			const snapshot = JSON.parse(JSON.stringify(reports)) as DailyReport[];

			buildDailyResultView(reports);

			expect(reports).toEqual(snapshot);
			expect(reports).toHaveLength(2);
		});
	});
});
