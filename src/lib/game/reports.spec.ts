import { describe, expect, test } from 'vitest';
import { clampScore, summarizeReports } from './reports';
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
		warehouseUsed: 0
	};
}

function report(
	day: number,
	netIncome: number,
	options: { storeImportSpend?: number; productionImportSpend?: number } = {}
): DailyReport {
	const productionReport = {
		...emptyProductionReport(),
		importSpend: options.productionImportSpend ?? 0
	};
	const storeReports =
		options.storeImportSpend === undefined ? [] : [storeReport(options.storeImportSpend)];

	return {
		day,
		revenue: 1_000 + day,
		costOfGoods: 400,
		grossMargin: 600,
		operatingCosts: 300,
		payrollCost: 0,
		importSpend: options.storeImportSpend ?? 0,
		netIncome,
		cashAfter: 10_000 + netIncome,
		scorecard: {
			profit: 50,
			customerSatisfaction: 60,
			staffMorale: 70,
			marketPosition: 20
		},
		productionReport,
		storeReports,
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
		marketPosition: 100,
		productReports: [],
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
});
