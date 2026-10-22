/**
 * Balance-harness measurement specs (HPA-502 Stage 3). Pure aggregation over
 * fake daily reports plus one small integration determinism check over real
 * bot runs — ordinary Vitest expectations only, no filesystem hash machinery.
 */
import { describe, expect, it } from 'vitest';
import type {
	DailyProductReport,
	DailyProductionReport,
	DailyReport,
	DailyStoreReport
} from '$lib/game/types';
import { runBot } from './bots';
import type { BotLedger, OpeningRecord } from './bots';
import {
	buildSweepReport,
	FORECAST_ERROR_BAND,
	FORECAST_OBSERVATION_DAYS,
	measureRun,
	mergeSweepReports,
	renderSweepMarkdown
} from './measure';

const SEED = 424_242;

function fakeProduct(overrides: Partial<DailyProductReport> = {}): DailyProductReport {
	return {
		productId: 'bottled-water',
		brandId: 'common-ground',
		name: 'Bottled Water',
		unitsSold: 0,
		demandMissed: 0,
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		endingStock: 5,
		warehouseUnits: 0,
		warehouseValue: 0,
		importedUnits: 0,
		importCost: 0,
		importSpend: 0,
		wasteUnits: 0,
		wasteValue: 0,
		shrinkUnits: 0,
		shrinkValue: 0,
		stockoutLostDemand: 0,
		averageAgeDays: null,
		oldestSellableAgeDays: null,
		trendMultiplier: 1,
		obsolescenceMultiplier: 1,
		baseSellingPrice: 2,
		effectiveSellingPrice: 2,
		markdownAmount: 0,
		...overrides
	};
}

function fakeStore(overrides: Partial<DailyStoreReport> = {}): DailyStoreReport {
	return {
		storeId: 'store-1',
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		operatingCosts: 0,
		importSpend: 0,
		netIncome: 0,
		customersServed: 0,
		demandMissed: 0,
		staffingCoverage: 1,
		staffingShortage: { manager: 0, general: 0 },
		stockHealth: 100,
		staffMorale: 50,
		reputation: 50,
		brandReputationAdjustment: 0,
		marketPosition: 50,
		productReports: [],
		inventoryLossExpense: 0,
		warnings: [],
		replenishment: null,
		...overrides
	};
}

function fakeProduction(produced: DailyProductionReport['produced']): DailyProductionReport {
	return {
		produced,
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

function fakeReport(day: number, overrides: Partial<DailyReport> = {}): DailyReport {
	return {
		day,
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		operatingCosts: 0,
		payrollCost: 0,
		importSpend: 0,
		cashBefore: 100,
		operatingIncome: 0,
		operatingCashFlow: 0,
		interestAccrued: 0,
		interestPaid: 0,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 0,
		refinancedPrincipal: 0,
		financingCashFlow: 0,
		netCashChange: 0,
		netIncome: 0,
		cashAfter: 100,
		outstandingPrincipalAfter: 8_000,
		nextLoanPayment: null,
		scorecard: { profit: 0, customerSatisfaction: 0, staffMorale: 0, marketPosition: 0 },
		productionReport: {
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
		},
		logistics: {
			arrivals: [],
			routeDispatchAttempts: [],
			deliveredUnits: 0,
			scheduledTransportCost: 0,
			modifierRecoveries: []
		},
		storeReports: [],
		marketReports: [],
		inventoryLossExpense: 0,
		modifierImpacts: [],
		modifierLifecycle: [],
		warnings: [],
		...overrides
	};
}

function fakeOpening(overrides: Partial<OpeningRecord> = {}): OpeningRecord {
	return {
		day: 1,
		storeId: 'store-1',
		tileId: 'tile-a1',
		archetypeId: 'convenience',
		neighborhood: 'downtown',
		level: 1,
		forecast: {
			tileId: 'tile-a1',
			setupCost: 10_000,
			projectedDailyRevenue: 100,
			projectedDailyRent: 50,
			demandScore: 10,
			customerFit: 0.5,
			risks: []
		},
		...overrides
	};
}

function fakeLedger(
	openings: OpeningRecord[] = [fakeOpening()],
	actions: BotLedger['actions'] = []
): BotLedger {
	return {
		seed: SEED,
		archetypeId: 'convenience',
		bot: 'retail-steady',
		foundingTileId: 'tile-a1',
		openings,
		actions
	};
}

function days(
	count: number,
	overrides: (day: number) => Partial<DailyReport> = () => ({})
): DailyReport[] {
	return Array.from({ length: count }, (_, index) => fakeReport(index + 1, overrides(index + 1)));
}

describe('operating-income windows (HPA-502 Stage 3)', () => {
	it('never satisfies a full 7-day window on 6 days, nor a 30-day window on 29 days', () => {
		const sixDays = measureRun(
			{ reports: days(6, () => ({ operatingIncome: 100, operatingCashFlow: 90 })) },
			fakeLedger()
		);
		expect(sixDays.firstPositiveWindow7).toBeNull();
		expect(sixDays.firstPositiveWindow30).toBeNull();

		const twentyNineDays = measureRun(
			{ reports: days(29, () => ({ operatingIncome: 100, operatingCashFlow: 90 })) },
			fakeLedger()
		);
		expect(twentyNineDays.firstPositiveWindow7).not.toBeNull();
		expect(twentyNineDays.firstPositiveWindow30).toBeNull();
	});

	it('finds the first full positive 7-day window with operating cash flow shown separately', () => {
		const reports = days(10, (day) => ({
			operatingIncome: day <= 7 ? -10 : 50,
			operatingCashFlow: day <= 7 ? -40 : 30
		}));
		// The window ending day 9 (days 3-9) is the first positive one:
		// 5 × -10 + 2 × 50 = 50 income, 5 × -40 + 2 × 30 = -140 operating cash flow.
		const window7 = measureRun({ reports }, fakeLedger()).firstPositiveWindow7;
		expect(window7).toEqual({
			startDay: 3,
			endDay: 9,
			operatingIncome: 50,
			operatingCashFlow: -140
		});
	});

	it('never counts loan proceeds as profit', () => {
		const reports = days(10, () => ({
			operatingIncome: -50,
			operatingCashFlow: -50,
			principalBorrowed: 9_000,
			financingCashFlow: 9_000,
			netCashChange: 8_950,
			netIncome: -50
		}));
		const measured = measureRun({ reports }, fakeLedger());
		expect(measured.firstPositiveWindow7).toBeNull();
		expect(measured.firstPositiveWindow30).toBeNull();
	});
});

describe('cash trajectory (HPA-502 Stage 3)', () => {
	it('records the first negative cash day and the minimum cash including founding', () => {
		const cashByDay: Record<number, number> = { 1: 50, 2: -5, 3: -20, 4: 10 };
		const reports = days(4, (day) => ({
			cashBefore: day === 1 ? 100 : cashByDay[day - 1],
			cashAfter: cashByDay[day]
		}));
		const measured = measureRun({ reports }, fakeLedger());
		expect(measured.foundingCash).toBe(100);
		expect(measured.firstNegativeCashDay).toBe(2);
		expect(measured.minimumCash).toBe(-20);
		expect(measured.minimumCashDay).toBe(3);
	});

	it('reports the founding cash as the minimum when cash never dips below it', () => {
		const measured = measureRun({ reports: days(3, () => ({ cashAfter: 80 })) }, fakeLedger());
		expect(measured.minimumCash).toBe(80);
		expect(measured.minimumCashDay).toBe(1);
		expect(measured.firstNegativeCashDay).toBeNull();
	});
});

describe('checkpoint snapshots (HPA-502 Stage 3)', () => {
	it('captures cash/debt from the day report and store counts/levels from the opening ledger', () => {
		const reports = Array.from({ length: 60 }, (_, index) =>
			fakeReport(index + 1, { cashAfter: index + 1 === 60 ? 600 : 500 })
		);
		const ledger = fakeLedger([
			fakeOpening(),
			fakeOpening({
				day: 40,
				storeId: 'store-2',
				tileId: 'tile-b2',
				neighborhood: 'mall',
				archetypeId: 'boutique',
				level: 1
			})
		]);
		const measured = measureRun({ reports }, ledger);
		const day30 = measured.checkpoints.find((checkpoint) => checkpoint.day === 30);
		const day60 = measured.checkpoints.find((checkpoint) => checkpoint.day === 60);
		const day365 = measured.checkpoints.find((checkpoint) => checkpoint.day === 365);
		expect(day30).toEqual({
			day: 30,
			cash: 500,
			debt: 8_000,
			storeCount: 1,
			storeLevels: [1]
		});
		expect(day60?.storeCount).toBe(2);
		expect(day60?.storeLevels).toEqual([1, 1]);
		expect(day60?.cash).toBe(600);
		// 61 simulated days: day-365 checkpoint has no report, so all its
		// fields are missing (null), not zero.
		expect(day365).toEqual({
			day: 365,
			cash: null,
			debt: null,
			storeCount: null,
			storeLevels: null
		});
	});
});

describe('demand shares and waste (HPA-502 Stage 3)', () => {
	it('computes missed-demand share, stockout share, and waste totals', () => {
		const reports = days(1, () => ({
			storeReports: [
				fakeStore({
					customersServed: 30,
					demandMissed: 20,
					productReports: [
						fakeProduct({ endingStock: 0, wasteUnits: 2, wasteValue: 10 }),
						fakeProduct({ productId: 'snacks', endingStock: 4 })
					]
				}),
				fakeStore({
					storeId: 'store-2',
					customersServed: 50,
					demandMissed: 0,
					productReports: [fakeProduct({ endingStock: 0, wasteUnits: 1, wasteValue: 5 })]
				})
			]
		}));
		const measured = measureRun({ reports }, fakeLedger());
		expect(measured.missedDemandShare).toBeCloseTo(20 / 100, 12);
		expect(measured.stockoutShare).toBeCloseTo(2 / 3, 12);
		expect(measured.wasteUnits).toBe(3);
		expect(measured.wasteValue).toBe(15);
	});

	it('returns null shares for zero denominators instead of zero or NaN', () => {
		const measured = measureRun({ reports: days(3) }, fakeLedger());
		expect(measured.missedDemandShare).toBeNull();
		expect(measured.stockoutShare).toBeNull();
		expect(measured.wasteUnits).toBe(0);
		expect(measured.wasteValue).toBe(0);
	});
});

describe('per-opening forecast attribution (HPA-502 Stage 3)', () => {
	function revenueDays(revenues: number[], openingDay = 1, storeId = 'store-1'): DailyReport[] {
		return revenues.map((revenue, index) =>
			fakeReport(openingDay + index, {
				storeReports: [fakeStore({ storeId, revenue })]
			})
		);
	}

	it('requires all 14 complete days: 13 days are incomplete, never a pass', () => {
		const ledger = fakeLedger([fakeOpening()]);
		const short = measureRun(
			{ reports: revenueDays(Array(FORECAST_OBSERVATION_DAYS - 1).fill(100)) },
			ledger
		);
		expect(short.forecastOutcomes).toHaveLength(1);
		const shortOutcome = short.forecastOutcomes[0]!;
		expect(shortOutcome.complete).toBe(false);
		expect(shortOutcome.relativeError).toBeNull();
		expect(shortOutcome.withinBand).toBe(false);
		expect(short.forecastByArchetype.convenience).toEqual({
			openings: 1,
			complete: 0,
			withinBand: 0,
			meanRelativeError: null
		});

		const full = measureRun(
			{ reports: revenueDays(Array(FORECAST_OBSERVATION_DAYS).fill(100)) },
			ledger
		);
		const fullOutcome = full.forecastOutcomes[0]!;
		expect(fullOutcome.complete).toBe(true);
		expect(fullOutcome.relativeError).toBe(0);
		expect(fullOutcome.withinBand).toBe(true);
		expect(full.forecastByArchetype.convenience?.withinBand).toBe(1);
	});

	it('attributes in-band and out-of-band openings by archetype and neighborhood', () => {
		const ledger = fakeLedger([
			fakeOpening({ storeId: 'store-1', neighborhood: 'downtown' }),
			fakeOpening({
				day: 20,
				storeId: 'store-2',
				tileId: 'tile-b2',
				neighborhood: 'campus',
				archetypeId: 'boutique',
				forecast: {
					tileId: 'tile-b2',
					setupCost: 10_000,
					projectedDailyRevenue: 100,
					projectedDailyRent: 50,
					demandScore: 10,
					customerFit: 0.5,
					risks: []
				}
			})
		]);
		// store-1: mean 90 → error -10% (in band). store-2 reports start on its
		// opening day 20 with mean 150 → error +50% (out of band). Gap days
		// 15-19 carry no store reports so store-2's window stays exactly 14.
		const reports = [
			...revenueDays(Array(FORECAST_OBSERVATION_DAYS).fill(90)),
			...Array.from({ length: FORECAST_OBSERVATION_DAYS - 9 }, (_, index) =>
				fakeReport(15 + index)
			),
			...revenueDays(Array(FORECAST_OBSERVATION_DAYS).fill(150), 20, 'store-2')
		];
		const measured = measureRun({ reports }, ledger);
		const outcomes = new Map(measured.forecastOutcomes.map((o) => [o.storeId, o]));
		expect(outcomes.get('store-1')?.withinBand).toBe(true);
		expect(outcomes.get('store-1')?.relativeError).toBeCloseTo(-0.1, 12);
		expect(outcomes.get('store-2')?.complete).toBe(true);
		expect(outcomes.get('store-2')?.withinBand).toBe(false);
		expect(Math.abs(outcomes.get('store-2')?.relativeError ?? 0)).toBeGreaterThan(
			FORECAST_ERROR_BAND
		);
		expect(measured.forecastByArchetype.convenience).toEqual({
			openings: 1,
			complete: 1,
			withinBand: 1,
			meanRelativeError: -0.1
		});
		expect(measured.forecastByArchetype.boutique?.withinBand).toBe(0);
		expect(measured.forecastByNeighborhood.downtown?.withinBand).toBe(1);
		expect(measured.forecastByNeighborhood.campus?.withinBand).toBe(0);
	});
});

describe('advisor no-op repeats and producer stalls (HPA-502 Stage 3)', () => {
	it('detects a weekly no-op recommendation repeated on consecutive planning days', () => {
		const weeklyNoOp = (day: number): BotLedger['actions'] => [
			{ day, bot: 'advisor', action: 'advisor:plan', outcome: 'no-op', detail: 'blocked: no rail' }
		];
		const repeated = measureRun(
			{ reports: days(3) },
			fakeLedger([fakeOpening()], [...weeklyNoOp(1), ...weeklyNoOp(8), ...weeklyNoOp(15)])
		);
		expect(repeated.advisorRepeatedNoOp).toEqual({
			startDay: 1,
			streak: 3,
			action: 'advisor:plan',
			detail: 'blocked: no rail'
		});
		// Different reasons break the streak; single no-ops never count.
		const notRepeated = measureRun(
			{ reports: days(3) },
			fakeLedger(
				[fakeOpening()],
				[
					...weeklyNoOp(1),
					{
						day: 8,
						bot: 'advisor',
						action: 'advisor:plan',
						outcome: 'no-op',
						detail: 'blocked: unaffordable'
					}
				]
			)
		);
		expect(notRepeated.advisorRepeatedNoOp).toBeNull();
	});

	it('flags a producer stalled seven consecutive days after the first applied build', () => {
		const stallReports = (zeroDays: number) =>
			days(10, (day) => ({
				productionReport: fakeProduction(
					day >= 3 && day < 3 + zeroDays
						? []
						: [
								{
									cityId: 'industry-city',
									materialId: 'filtered-water',
									quantity: 4,
									value: 8,
									source: 'local'
								}
							]
				)
			}));
		const actions: BotLedger['actions'] = [
			{
				day: 2,
				bot: 'advisor',
				action: 'advisor:build-producer',
				outcome: 'applied',
				detail: 'water-plant on i-05'
			}
		];
		const stalled = measureRun({ reports: stallReports(7) }, fakeLedger([fakeOpening()], actions));
		expect(stalled.producerStall).toEqual({ startDay: 3, endDay: 9, days: 7 });
		const brief = measureRun({ reports: stallReports(6) }, fakeLedger([fakeOpening()], actions));
		expect(brief.producerStall).toBeNull();
		// Without an applied producer build, zero-output days never count.
		const noIndustry = measureRun({ reports: stallReports(10) }, fakeLedger([fakeOpening()], []));
		expect(noIndustry.producerStall).toBeNull();
	});
});

describe('deterministic serialization (HPA-502 Stage 3)', () => {
	it('serializes the same seed/config byte-identically, twice, through real bot runs', () => {
		const runSweep = (): string => {
			const entries = [
				{ seed: SEED, archetypeId: 'convenience' as const, bot: 'retail-steady' as const },
				{ seed: SEED, archetypeId: 'convenience' as const, bot: 'advisor' as const }
			];
			const results = entries.map((entry) => {
				const { game, ledger } = runBot(entry.bot, entry.archetypeId, entry.seed, 12);
				return { ...entry, measurement: measureRun(game, ledger) };
			});
			return JSON.stringify(buildSweepReport([SEED], 12, results), null, 2);
		};
		const first = runSweep();
		const second = runSweep();
		expect(first).toBe(second);
		expect(first).toContain('"seed": 424242');
		expect(first).not.toMatch(/timestamp|duration|uuid|\/Users\//i);
	});

	it('renders stable Markdown and merges partial reports deterministically', () => {
		const results = [
			{ seed: 2, archetypeId: 'convenience' as const, bot: 'idle' as const },
			{ seed: 1, archetypeId: 'grocery' as const, bot: 'retail-steady' as const }
		].map((entry) => ({
			...entry,
			measurement: measureRun(
				{ reports: days(3) },
				{ ...fakeLedger(), seed: entry.seed, bot: entry.bot }
			)
		}));
		const merged = mergeSweepReports([
			buildSweepReport([2], 3, [results[0]!]),
			buildSweepReport([1], 3, [results[1]!])
		]);
		expect(merged.config.seeds).toEqual([1, 2]);
		expect(merged.runs.map((run) => run.seed)).toEqual([1, 2]);
		expect(renderSweepMarkdown(merged)).toBe(
			renderSweepMarkdown(buildSweepReport([1, 2], 3, results))
		);
	});
});
