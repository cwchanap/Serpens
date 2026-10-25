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
	evaluateGateA,
	FORECAST_ERROR_BAND,
	FORECAST_OBSERVATION_DAYS,
	GATE_A_THRESHOLDS,
	measureRun,
	mergeSweepReports,
	renderSweepMarkdown,
	type GateAItemVerdict,
	type OpeningForecastOutcome,
	type RunMeasurement,
	type SweepReport
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
		foundingCash: 100,
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

	it('takes founding cash from the ledger, not the day-1 report cashBefore', () => {
		// Bots act before the first advanceDay tick, so reports[0].cashBefore is
		// already downstream of day-1 hires/expansions/builds (here: 60 post-spend
		// vs the true 100 founding baseline).
		const reports = days(3, (day) => ({
			cashBefore: day === 1 ? 60 : 140,
			cashAfter: 140
		}));
		const measured = measureRun({ reports }, fakeLedger());
		expect(measured.foundingCash).toBe(100);
		expect(measured.minimumCash).toBe(100);
		expect(measured.minimumCashDay).toBe(0);
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

	it('ignores daily retail no-ops recorded under the advisor bot label', () => {
		const weeklyAdvisorNoOp = (day: number) => ({
			day,
			bot: 'advisor' as const,
			action: 'advisor:build-producer',
			outcome: 'no-op' as const,
			detail: 'no legal tile for water-plant'
		});
		const dailyRetailNoOp = (day: number) => ({
			day,
			bot: 'advisor' as const,
			action: 'openStore',
			outcome: 'no-op' as const,
			detail: 'store cap reached'
		});
		// Intervening daily retail no-ops must not reset the weekly streak: the
		// advisor replans on days 1/8/15 and hits the identical block each time.
		const interleaved = measureRun(
			{ reports: days(3) },
			fakeLedger(
				[fakeOpening()],
				[
					...Array.from({ length: 20 }, (_, index) => dailyRetailNoOp(index + 1)),
					weeklyAdvisorNoOp(1),
					weeklyAdvisorNoOp(8),
					weeklyAdvisorNoOp(15)
				]
			)
		);
		expect(interleaved.advisorRepeatedNoOp).toEqual({
			startDay: 1,
			streak: 3,
			action: 'advisor:build-producer',
			detail: 'no legal tile for water-plant'
		});
		// Retail no-ops alone never produce an advisor streak either.
		const retailOnly = measureRun(
			{ reports: days(3) },
			fakeLedger(
				[fakeOpening()],
				Array.from({ length: 20 }, (_, index) => dailyRetailNoOp(index + 1))
			)
		);
		expect(retailOnly.advisorRepeatedNoOp).toBeNull();
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

describe('Gate A evaluation (HPA-502 follow-up step 2)', () => {
	function gateRun(
		overrides: Partial<RunMeasurement> & Pick<RunMeasurement, 'seed' | 'archetypeId' | 'bot'>
	): RunMeasurement {
		return {
			foundingTileId: 'tile-a1',
			daysSimulated: 365,
			foundingCash: 20_000,
			firstPositiveWindow7: null,
			firstPositiveWindow30: null,
			firstNegativeCashDay: null,
			minimumCash: 1_000,
			minimumCashDay: 10,
			checkpoints: [],
			missedDemandShare: null,
			stockoutShare: null,
			wasteUnits: 0,
			wasteValue: 0,
			maxAbsCash: 20_000,
			maxOutstandingPrincipal: 8_000,
			cumulativeImportSpend: 1_000,
			operatingIncomeDays61To90: 0,
			forecastOutcomes: [],
			forecastByArchetype: {},
			forecastByNeighborhood: {},
			advisorRepeatedNoOp: null,
			producerStall: null,
			...overrides
		};
	}

	function gateReport(runs: RunMeasurement[]): SweepReport {
		return {
			config: { seeds: [...new Set(runs.map((run) => run.seed))].sort((a, b) => a - b), days: 365 },
			runs
		};
	}

	function item(report: SweepReport, id: string): GateAItemVerdict {
		const match = evaluateGateA(report).items.find((candidate) => candidate.id === id);
		expect(match).toBeDefined();
		return match!;
	}

	it('locks the approved Gate A threshold values verbatim', () => {
		expect(GATE_A_THRESHOLDS).toEqual({
			viabilityWindowDays: 30,
			viabilityByDay: 90,
			viabilitySeedShare: 0.8,
			absCeiling: 1_000_000_000,
			incomePairDays: [61, 90],
			forecastTolerance: 0.25,
			advisorSeedShare: 0.8
		});
		expect(GATE_A_THRESHOLDS.forecastTolerance).toBe(FORECAST_ERROR_BAND);
	});

	it('viability: 4/5 seeds with a day-80 completion passes at exactly the 80% bar; 3/5 and day-91 completions fail', () => {
		const viable = (seed: number, endDay: number): RunMeasurement =>
			gateRun({
				seed,
				archetypeId: 'boutique',
				bot: 'retail-steady',
				firstPositiveWindow30: {
					startDay: endDay - 29,
					endDay,
					operatingIncome: 10,
					operatingCashFlow: 5
				}
			});
		const atBar = [1, 2, 3, 4]
			.map((seed) => viable(seed, 80))
			.concat(gateRun({ seed: 5, archetypeId: 'boutique', bot: 'retail-steady' }));
		expect(item(gateReport(atBar), 'viability').passed).toBe(true);
		expect(item(gateReport(atBar), 'viability').detail).toContain('boutique 4/5 (80.0%)');

		// Day-90 completions count (at the by-day bar); day-91 completions do
		// not (over it): otherwise-identical 5-seed reports flip PASS → FAIL.
		const atByDay = [1, 2, 3]
			.map((seed) => viable(seed, 80))
			.concat([4, 5].map((seed) => viable(seed, 90)));
		expect(item(gateReport(atByDay), 'viability').passed).toBe(true);
		const overByDay = [1, 2, 3]
			.map((seed) => viable(seed, 80))
			.concat([4, 5].map((seed) => viable(seed, 91)));
		expect(item(gateReport(overByDay), 'viability').passed).toBe(false);

		const threeFifths = [1, 2, 3]
			.map((seed) => viable(seed, 80))
			.concat(
				[4, 5].map((seed) => gateRun({ seed, archetypeId: 'boutique', bot: 'retail-steady' }))
			);
		expect(item(gateReport(threeFifths), 'viability').passed).toBe(false);
	});

	it('boundedness: strictly below the ceiling passes; at-ceiling fails and traces the worst metric/run', () => {
		const under = gateReport([
			gateRun({
				seed: 1,
				archetypeId: 'grocery',
				bot: 'retail-steady',
				maxAbsCash: GATE_A_THRESHOLDS.absCeiling - 1
			})
		]);
		expect(item(under, 'boundedness').passed).toBe(true);

		const atCeiling = gateReport([
			gateRun({
				seed: 2,
				archetypeId: 'electronics',
				bot: 'idle',
				maxOutstandingPrincipal: GATE_A_THRESHOLDS.absCeiling
			})
		]);
		const boundedness = item(atCeiling, 'boundedness');
		expect(boundedness.passed).toBe(false);
		expect(boundedness.detail).toContain('max principal 1000000000');
		expect(boundedness.detail).toContain('worst: principal on seed 2 electronics/idle');
	});

	it('managed-vs-idle: 4/5 wins passes at the bar, ties and idle wins are losses, unpaired seeds are excluded', () => {
		const managed = (seed: number, income: number): RunMeasurement =>
			gateRun({
				seed,
				archetypeId: 'convenience',
				bot: 'retail-steady',
				operatingIncomeDays61To90: income
			});
		const idle = (seed: number, income: number): RunMeasurement =>
			gateRun({ seed, archetypeId: 'convenience', bot: 'idle', operatingIncomeDays61To90: income });

		// Seeds 1-4: managed wins. Seed 5: tie (100 vs 100) — not a win. Seed 6
		// has no idle pair, so it is excluded from the denominator: 4/5 = 80%.
		const paired = [
			...[1, 2, 3, 4].map((seed) => managed(seed, 300)),
			managed(5, 100),
			...[1, 2, 3, 4].map((seed) => idle(seed, 50)),
			idle(5, 100),
			managed(6, 500)
		];
		const atBar = item(gateReport(paired), 'managed-vs-idle');
		expect(atBar.passed).toBe(true);
		expect(atBar.detail).toContain('convenience 4/5 (80.0%)');
		expect(atBar.detail).toContain('days 61-90');

		// Idle strictly better on every seed: managed wins 0/5.
		const idleWins = gateReport([
			...[1, 2, 3, 4, 5].map((seed) => managed(seed, 100)),
			...[1, 2, 3, 4, 5].map((seed) => idle(seed, 200))
		]);
		const loss = item(idleWins, 'managed-vs-idle');
		expect(loss.passed).toBe(false);
		expect(loss.detail).toContain('convenience 0/5 (0.0%)');
	});

	it('forecast: idle openings and incomplete windows are excluded-and-counted around the 80% share bar', () => {
		const outcome = (overrides: Partial<OpeningForecastOutcome>): OpeningForecastOutcome => ({
			storeId: 'store-x',
			openedOnDay: 1,
			neighborhood: 'downtown',
			archetypeId: 'convenience',
			forecastDailyRevenue: 100,
			observedMeanDailyRevenue: null,
			relativeError: null,
			withinBand: false,
			complete: false,
			...overrides
		});
		const complete = (relativeError: number): OpeningForecastOutcome =>
			outcome({
				observedMeanDailyRevenue: 100 * (1 + relativeError),
				relativeError,
				withinBand: Math.abs(relativeError) <= FORECAST_ERROR_BAND,
				complete: true
			});
		const managed = (seed: number, outcomes: OpeningForecastOutcome[]): RunMeasurement =>
			gateRun({
				seed,
				archetypeId: 'convenience',
				bot: 'retail-steady',
				forecastOutcomes: outcomes
			});

		// Eligible complete = 3 (2 in band); excluded-and-counted: 1 incomplete
		// eligible + 1 complete idle opening. 2/3 ≈ 67% < 80%.
		const below = gateReport([
			managed(1, [complete(0.1), complete(0.6), outcome({})]),
			gateRun({
				seed: 1,
				archetypeId: 'convenience',
				bot: 'advisor',
				forecastOutcomes: [complete(-0.2)]
			}),
			gateRun({
				seed: 1,
				archetypeId: 'convenience',
				bot: 'idle',
				forecastOutcomes: [complete(0)]
			})
		]);
		const failing = item(below, 'forecast');
		expect(failing.passed).toBe(false);
		expect(failing.detail).toContain('2/3/4 eligible openings within ±25%');
		expect(failing.detail).toContain('share 66.7%');
		expect(failing.detail).toContain('1 incomplete, 1 idle openings');

		// 4 of 5 complete eligible in band = exactly 80% → passes.
		const atBar = gateReport([
			managed(1, [complete(0.1), complete(-0.2)]),
			managed(2, [complete(0.05), complete(0.9)]),
			gateRun({
				seed: 2,
				archetypeId: 'convenience',
				bot: 'advisor',
				forecastOutcomes: [complete(-0.1)]
			})
		]);
		expect(item(atBar, 'forecast').passed).toBe(true);
		expect(item(atBar, 'forecast').detail).toContain('4/5/5');
	});

	it('advisor: 4/5 clean runs passes at the bar; a stall or repeated no-op disqualifies its run', () => {
		const advisor = (seed: number, overrides: Partial<RunMeasurement> = {}): RunMeasurement =>
			gateRun({ seed, archetypeId: 'convenience', bot: 'advisor', ...overrides });

		const atBar = [1, 2, 3, 4]
			.map((seed) => advisor(seed))
			.concat(advisor(5, { producerStall: { startDay: 100, endDay: 110, days: 11 } }));
		const passing = item(gateReport(atBar), 'advisor');
		expect(passing.passed).toBe(true);
		expect(passing.detail).toContain('4/5 advisor runs');
		expect(passing.detail).toContain('1 stalled, 0 repeated no-ops');

		const below = [1, 2, 3]
			.map((seed) => advisor(seed))
			.concat(
				advisor(4, {
					advisorRepeatedNoOp: { startDay: 8, streak: 3, action: 'advisor:plan', detail: 'blocked' }
				}),
				advisor(5, { producerStall: { startDay: 50, endDay: 60, days: 11 } })
			);
		expect(item(gateReport(below), 'advisor').passed).toBe(false);
	});

	it('renders the Gate A section, is pure, and computes a stable overall verdict', () => {
		const runs = [1, 2, 3, 4, 5]
			.map((seed) =>
				gateRun({
					seed,
					archetypeId: 'boutique',
					bot: 'retail-steady',
					operatingIncomeDays61To90: 300,
					forecastOutcomes: [
						{
							storeId: `store-${seed}`,
							openedOnDay: 1,
							neighborhood: 'downtown',
							archetypeId: 'boutique',
							forecastDailyRevenue: 100,
							observedMeanDailyRevenue: 110,
							relativeError: 0.1,
							withinBand: true,
							complete: true
						}
					]
				})
			)
			.concat(
				[1, 2, 3, 4, 5].map((seed) =>
					gateRun({ seed, archetypeId: 'boutique', bot: 'idle', operatingIncomeDays61To90: 50 })
				)
			)
			.concat([gateRun({ seed: 1, archetypeId: 'convenience', bot: 'advisor' })]);
		const report = gateReport(runs);
		const before = JSON.stringify(report);
		const verdict = evaluateGateA(report);
		expect(JSON.stringify(report)).toBe(before);
		expect(JSON.stringify(evaluateGateA(report))).toBe(JSON.stringify(verdict));
		expect(verdict.scenarioGuardrails).toBe('out of scope (scenario tests)');
		// No boutique retail-steady window → viability fails; the other four
		// items pass on this fixture (idle always loses the 61–90 pairing, all
		// forecasts in band, advisor clean).
		expect(verdict.allPassed).toBe(false);
		expect(verdict.items.filter((entry) => entry.passed).map((entry) => entry.id)).toEqual([
			'boundedness',
			'managed-vs-idle',
			'forecast',
			'advisor'
		]);

		const markdown = renderSweepMarkdown(report);
		expect(markdown).toContain('## Gate A verdict');
		expect(markdown).toContain(
			'- viability: FAIL — 30d window complete by day 90 (retail-steady): boutique 0/5 (0.0%)'
		);
		expect(markdown).toContain('- scenario guardrails: out of scope (scenario tests)');
		expect(markdown).toMatch(/^- overall: FAIL \(4\/5 items passed\)$/m);
	});
});
