/**
 * Balance-harness measurement specs (HPA-502 Stage 3). Pure aggregation over
 * fake daily reports plus one small integration determinism check over real
 * bot runs — ordinary Vitest expectations only, no filesystem hash machinery.
 */
import { describe, expect, it } from 'vitest';
import type {
	ArchetypeId,
	DailyMaterialMovement,
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
	SWEEP_ARCHETYPES,
	SWEEP_REGENERATION_COMMAND,
	sweepRegenerationCommand,
	type AdvisorChainMetric,
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

/** Advisor ledger carrying the given advisor action records. */
function advisorLedger(actions: BotLedger['actions']): BotLedger {
	return { ...fakeLedger([fakeOpening()], actions), bot: 'advisor' };
}

function advisorAction(
	day: number,
	action: string,
	outcome: BotLedger['actions'][number]['outcome'] = 'applied'
): BotLedger['actions'][number] {
	return { day, bot: 'advisor', action, outcome, detail: 'fixture' };
}

/** Every composite leg green — the Ruling 11 served chain (Ruling 12). */
function servedChain(overrides: Partial<AdvisorChainMetric> = {}): AdvisorChainMetric {
	return {
		producerBuilt: true,
		warehouseBuilt: true,
		railsApplied: true,
		lastRailDay: 29,
		zeroOutputDaysAfterLastRail: 0,
		postRailObservedDays: 61,
		localDeliveryUnits: 336,
		stallShape: null,
		served: true,
		...overrides
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
	it('never counts honest planner declines — advisor:plan failures and advisor:none advices', () => {
		const weeklyPlanBlock = (day: number): BotLedger['actions'] => [
			{
				day,
				bot: 'advisor',
				action: 'advisor:plan',
				outcome: 'no-op',
				detail: 'unavailable: supply-city-unavailable'
			}
		];
		const weeklyNone = (day: number, reason: string): BotLedger['actions'] => [
			{ day, bot: 'advisor', action: 'advisor:none', outcome: 'no-op', detail: reason }
		];
		// Identical weekly plan failures propose nothing — not rejections.
		const planOnly = measureRun(
			{ reports: days(3) },
			fakeLedger(
				[fakeOpening()],
				[...weeklyPlanBlock(1), ...weeklyPlanBlock(8), ...weeklyPlanBlock(15)]
			)
		);
		expect(planOnly.advisorRepeatedNoOp).toBeNull();
		// Identical weekly 'none' declines are honest feasibility answers.
		const noneOnly = measureRun(
			{ reports: days(3) },
			fakeLedger(
				[fakeOpening()],
				[
					...weeklyNone(1, 'unaffordable'),
					...weeklyNone(8, 'unaffordable'),
					...weeklyNone(15, 'unaffordable')
				]
			)
		);
		expect(noneOnly.advisorRepeatedNoOp).toBeNull();
		// A mixed decline history never streaks either.
		const mixed = measureRun(
			{ reports: days(3) },
			fakeLedger(
				[fakeOpening()],
				[...weeklyPlanBlock(1), ...weeklyNone(8, 'ineffective'), ...weeklyNone(15, 'unaffordable')]
			)
		);
		expect(mixed.advisorRepeatedNoOp).toBeNull();
	});

	it('streaks proposed-but-not-applied recommendations, including rejected and unsupported commands', () => {
		const weeklyRejected = (day: number, tileId: string): BotLedger['actions'] => [
			{
				day,
				bot: 'advisor',
				action: 'advisor:build-producer',
				outcome: 'rejected',
				detail: `water-plant on ${tileId}`
			}
		];
		const rejected = measureRun(
			{ reports: days(3) },
			fakeLedger(
				[fakeOpening()],
				[...weeklyRejected(1, 'i-05'), ...weeklyRejected(8, 'i-05'), ...weeklyRejected(15, 'i-05')]
			)
		);
		expect(rejected.advisorRepeatedNoOp).toEqual({
			startDay: 1,
			streak: 3,
			action: 'advisor:build-producer',
			detail: 'water-plant on i-05'
		});
		const weeklyUnsupported = (day: number): BotLedger['actions'] => [
			{
				day,
				bot: 'advisor',
				action: 'advisor:create-route',
				outcome: 'unsupported',
				detail: '{"kind":"create-route"}'
			}
		];
		const unsupported = measureRun(
			{ reports: days(3) },
			fakeLedger([fakeOpening()], [...weeklyUnsupported(1), ...weeklyUnsupported(8)])
		);
		expect(unsupported.advisorRepeatedNoOp).toEqual({
			startDay: 1,
			streak: 2,
			action: 'advisor:create-route',
			detail: '{"kind":"create-route"}'
		});
		// Applied commands are not unapplied proposals — never count.
		const weeklyApplied = (day: number): BotLedger['actions'] => [
			{
				day,
				bot: 'advisor',
				action: 'advisor:build-producer',
				outcome: 'applied',
				detail: 'water-plant on i-05'
			}
		];
		const applied = measureRun(
			{ reports: days(3) },
			fakeLedger([fakeOpening()], [...weeklyApplied(1), ...weeklyApplied(8), ...weeklyApplied(15)])
		);
		expect(applied.advisorRepeatedNoOp).toBeNull();
		// A different detail breaks the streak; single unapplied proposals never count.
		const notRepeated = measureRun(
			{ reports: days(3) },
			fakeLedger([fakeOpening()], [...weeklyRejected(1, 'i-05'), ...weeklyRejected(8, 'i-09')])
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

	it('does not flag the buildout gap between the applied build and first nonzero output', () => {
		const build = (day: number): BotLedger['actions'] => [
			{
				day,
				bot: 'advisor',
				action: 'advisor:build-producer',
				outcome: 'applied',
				detail: 'water-plant on i-05'
			}
		];
		const producing = (): DailyMaterialMovement[] => [
			{
				cityId: 'industry-city',
				materialId: 'filtered-water',
				quantity: 4,
				value: 8,
				source: 'local'
			}
		];
		// Build day 2, zero-output buildout days 2–9, first flow day 10: the
		// gap between chain construction and first flow is not a stall.
		const gap = measureRun(
			{
				reports: days(12, (day) => ({
					productionReport: fakeProduction(day >= 10 ? producing() : [])
				}))
			},
			fakeLedger([fakeOpening()], build(2))
		);
		expect(gap.producerStall).toBeNull();
		// A zero run only counts after first flow: days 11–17 after output day
		// 10 flags {11-17}; the excluded days 2–9 gap never inflates it.
		const gapThenStall = measureRun(
			{
				reports: days(17, (day) => ({
					productionReport: fakeProduction(day === 10 ? producing() : [])
				}))
			},
			fakeLedger([fakeOpening()], build(2))
		);
		expect(gapThenStall.producerStall).toEqual({ startDay: 11, endDay: 17, days: 7 });
	});

	it('flags a chain that never produces at all, stalling from the producer-build day', () => {
		const build = (day: number): BotLedger['actions'] => [
			{
				day,
				bot: 'advisor',
				action: 'advisor:build-producer',
				outcome: 'applied',
				detail: 'water-plant on i-05'
			}
		];
		const allZero = measureRun(
			{ reports: days(12, () => ({ productionReport: fakeProduction([]) })) },
			fakeLedger([fakeOpening()], build(2))
		);
		expect(allZero.producerStall).toEqual({ startDay: 2, endDay: 12, days: 11 });
		// Fewer than the threshold days since the build is not yet a stall.
		const shortRun = measureRun(
			{ reports: days(5, () => ({ productionReport: fakeProduction([]) })) },
			fakeLedger([fakeOpening()], build(2))
		);
		expect(shortRun.producerStall).toBeNull();
	});
});

describe('advisor served-chain composite (HPA-502 Ruling 12)', () => {
	// The real advisor chain shape: producer d1, warehouse d8, rails d22+d29;
	// flow d1-17 (buildout pump/bottler fill), construction pause d18-29, flow
	// from d30; weekly 7-unit warehouse restocks once connected.
	const CHAIN_ACTIONS: BotLedger['actions'] = [
		advisorAction(1, 'advisor:build-producer'),
		advisorAction(8, 'advisor:build-warehouse'),
		advisorAction(22, 'advisor:connect-rail'),
		advisorAction(29, 'advisor:connect-rail')
	];
	const producing = (): DailyMaterialMovement[] => [
		{
			cityId: 'industry-city',
			materialId: 'filtered-water',
			quantity: 4,
			value: 8,
			source: 'local'
		}
	];
	function chainReports(days: number, produceFrom: number, produceTo: number): DailyReport[] {
		return Array.from({ length: days }, (_, index) => {
			const day = index + 1;
			const delivering = day >= 30;
			return fakeReport(day, {
				productionReport: fakeProduction(day >= produceFrom && day <= produceTo ? producing() : []),
				storeReports: delivering
					? [fakeStore({ productReports: [fakeProduct({ warehouseUnits: 7 })] })]
					: []
			});
		});
	}

	it('measures every composite leg green on a served chain (pause is informational)', () => {
		const measured = measureRun(
			{
				reports: chainReports(35, 1, 17).map((report, index) =>
					index >= 29 ? { ...report, productionReport: fakeProduction(producing()) } : report
				)
			},
			advisorLedger(CHAIN_ACTIONS)
		);
		expect(measured.producerStall).toEqual({ startDay: 18, endDay: 29, days: 12 });
		expect(measured.advisorChain).toEqual({
			producerBuilt: true,
			warehouseBuilt: true,
			railsApplied: true,
			lastRailDay: 29,
			zeroOutputDaysAfterLastRail: 0,
			postRailObservedDays: 6,
			localDeliveryUnits: 42,
			stallShape: 'construction-sequencing pause',
			served: true
		});
	});

	it('fails the composite leg when the producer or warehouse build never applied', () => {
		const reports = chainReports(35, 1, 35);
		const noProducer = measureRun(
			{ reports },
			advisorLedger(CHAIN_ACTIONS.filter((action) => action.action !== 'advisor:build-producer'))
		);
		expect(noProducer.advisorChain.producerBuilt).toBe(false);
		expect(noProducer.advisorChain.served).toBe(false);

		const noWarehouse = measureRun(
			{ reports },
			advisorLedger(CHAIN_ACTIONS.filter((action) => action.action !== 'advisor:build-warehouse'))
		);
		expect(noWarehouse.advisorChain.warehouseBuilt).toBe(false);
		expect(noWarehouse.advisorChain.served).toBe(false);
	});

	it('fails the composite when no rail applied: no anchor day exists', () => {
		const reports = chainReports(35, 1, 35);
		const noRails = measureRun(
			{ reports },
			advisorLedger(CHAIN_ACTIONS.filter((action) => action.action !== 'advisor:connect-rail'))
		);
		expect(noRails.advisorChain.railsApplied).toBe(false);
		expect(noRails.advisorChain.lastRailDay).toBeNull();
		expect(noRails.advisorChain.zeroOutputDaysAfterLastRail).toBeNull();
		expect(noRails.advisorChain.served).toBe(false);
	});

	it('counts zero-output days strictly after the last applied rail', () => {
		// Flow stops on days 33-35 (3 zero-output days after rail day 29).
		const measured = measureRun({ reports: chainReports(35, 1, 32) }, advisorLedger(CHAIN_ACTIONS));
		expect(measured.advisorChain.zeroOutputDaysAfterLastRail).toBe(3);
		expect(measured.advisorChain.served).toBe(false);
	});

	it('does not count a rail connected on the final report day as served', () => {
		// Rails on days 22 and 35 (the last report day): no observed post-rail
		// production day exists, so the chain cannot count as served even with
		// production flowing and deliveries landing.
		const actions = [
			advisorAction(1, 'advisor:build-producer'),
			advisorAction(8, 'advisor:build-warehouse'),
			advisorAction(22, 'advisor:connect-rail'),
			advisorAction(35, 'advisor:connect-rail')
		];
		const measured = measureRun({ reports: chainReports(35, 1, 35) }, advisorLedger(actions));
		expect(measured.advisorChain.lastRailDay).toBe(35);
		expect(measured.advisorChain.postRailObservedDays).toBe(0);
		expect(measured.advisorChain.localDeliveryUnits).toBeGreaterThan(0);
		expect(measured.advisorChain.served).toBe(false);
	});

	it('requires at least one local (warehouse) delivery to a store', () => {
		const reports = chainReports(35, 1, 35).map((report) => ({
			...report,
			storeReports: []
		}));
		const measured = measureRun({ reports }, advisorLedger(CHAIN_ACTIONS));
		expect(measured.advisorChain.localDeliveryUnits).toBe(0);
		expect(measured.advisorChain.served).toBe(false);
	});

	it('keeps a repeated unapplied recommendation disqualifying inside the composite', () => {
		const actions = [
			...CHAIN_ACTIONS,
			advisorAction(36, 'advisor:build-rail', 'rejected'),
			advisorAction(43, 'advisor:build-rail', 'rejected')
		];
		const measured = measureRun({ reports: chainReports(50, 1, 50) }, advisorLedger(actions));
		expect(measured.advisorRepeatedNoOp).not.toBeNull();
		expect(measured.advisorChain.served).toBe(false);
	});

	it('labels mid-run stalls without in-window builds as `producer stalled`', () => {
		// Build d2, flow d5-10, zero d11-20 (no build inside the window), flow after.
		const actions = [advisorAction(2, 'advisor:build-producer')];
		const measured = measureRun(
			{
				reports: chainReports(30, 5, 10).map((report) =>
					report.day >= 21 ? { ...report, productionReport: fakeProduction(producing()) } : report
				)
			},
			advisorLedger(actions)
		);
		expect(measured.producerStall).toEqual({ startDay: 11, endDay: 20, days: 10 });
		expect(measured.advisorChain.stallShape).toBe('producer stalled');
	});

	it('labels resumption that later breaks again as `producer stalled` even with an in-window build', () => {
		// Build d2 + warehouse d12 (inside the d11-20 window), flow d5-10,
		// zero d11-20, flow d21-25, zero d26-30: resumed but not sustained.
		const actions = [
			advisorAction(2, 'advisor:build-producer'),
			advisorAction(12, 'advisor:build-warehouse')
		];
		const reports = Array.from({ length: 30 }, (_, index) => {
			const day = index + 1;
			const produced = (day >= 5 && day <= 10) || (day >= 21 && day <= 25);
			return fakeReport(day, { productionReport: fakeProduction(produced ? producing() : []) });
		});
		const measured = measureRun({ reports }, advisorLedger(actions));
		expect(measured.producerStall).toEqual({ startDay: 11, endDay: 20, days: 10 });
		expect(measured.advisorChain.stallShape).toBe('producer stalled');
	});

	it('labels stall windows in the markdown exceptions by their shape', () => {
		// Real measured runs: a buildout pause (rails applied inside the window,
		// flow sustained after) and a plain mid-run stall.
		const pausedRun = measureRun(
			{
				reports: chainReports(35, 1, 17).map((report, index) =>
					index >= 29 ? { ...report, productionReport: fakeProduction(producing()) } : report
				)
			},
			advisorLedger(CHAIN_ACTIONS)
		);
		const stalledRun = measureRun(
			{
				reports: chainReports(30, 5, 10).map((report) =>
					report.day >= 21 ? { ...report, productionReport: fakeProduction(producing()) } : report
				)
			},
			advisorLedger([advisorAction(2, 'advisor:build-producer')])
		);
		expect(pausedRun.advisorChain.stallShape).toBe('construction-sequencing pause');
		expect(stalledRun.advisorChain.stallShape).toBe('producer stalled');
		const markdown = renderSweepMarkdown({
			config: { seeds: [SEED], days: 35 },
			runs: [pausedRun, stalledRun]
		});
		expect(markdown).toContain('construction-sequencing pause 12d (days 18-29)');
		expect(markdown).toContain('producer stalled 10d (days 11-20)');
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

	it('prints the actual invocation in the regeneration header, not the 50-seed constant', () => {
		const report = buildSweepReport([7], 30, [
			{
				seed: 7,
				archetypeId: 'convenience',
				bot: 'idle' as const,
				measurement: measureRun({ reports: days(3) }, { ...fakeLedger(), seed: 7, bot: 'idle' })
			}
		]);
		const markdown = renderSweepMarkdown(
			report,
			sweepRegenerationCommand({
				seeds: [7],
				days: 30,
				bots: ['idle'],
				output: 'docs/balance/generated/scratch-5c'
			})
		);
		expect(markdown).toContain(
			'- Regenerate JSON/Markdown: `bun tests/balance/run.ts --seeds 7 --days 30 --bots idle --output docs/balance/generated/scratch-5c`'
		);
		// A missing --output falls back to the documented default artifact path.
		expect(sweepRegenerationCommand({ seeds: [7], days: 30, bots: ['idle'] })).toContain(
			'--output docs/balance/generated/balance-sweep'
		);
		// Without an invocation argument the documented full-sweep command is kept.
		expect(renderSweepMarkdown(report)).toContain(SWEEP_REGENERATION_COMMAND);
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
			operatingIncomeByDay: [],
			forecastOutcomes: [],
			forecastByArchetype: {},
			forecastByNeighborhood: {},
			advisorRepeatedNoOp: null,
			producerStall: null,
			advisorChain: servedChain(),
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
		// The gate recomputes the window from operatingIncomeByDay at the active
		// threshold length, so a viable fixture carries a 30-day contiguous
		// tail of positive income ending on `endDay`.
		const incomeTail = (endDay: number): RunMeasurement['operatingIncomeByDay'] =>
			Array.from({ length: 30 }, (_, index) => ({
				day: endDay - 29 + index,
				operatingIncome: 10,
				operatingCashFlow: 5
			}));
		const viable = (seed: number, archetypeId: ArchetypeId, endDay: number): RunMeasurement =>
			gateRun({
				seed,
				archetypeId,
				bot: 'retail-steady',
				firstPositiveWindow30: {
					startDay: endDay - 29,
					endDay,
					operatingIncome: 300,
					operatingCashFlow: 150
				},
				operatingIncomeByDay: incomeTail(endDay)
			});
		const notViable = (seed: number, archetypeId: ArchetypeId): RunMeasurement =>
			gateRun({ seed, archetypeId, bot: 'retail-steady' });
		// A full sweep covers every archetype — endDayByIndex returns the
		// window end day per seed index, or null for a non-viable run.
		const sweep = (endDayByIndex: (index: number) => number | null): RunMeasurement[] =>
			SWEEP_ARCHETYPES.flatMap((archetypeId) =>
				[1, 2, 3, 4, 5].map((seed) => {
					const endDay = endDayByIndex(seed - 1);
					return endDay === null ? notViable(seed, archetypeId) : viable(seed, archetypeId, endDay);
				})
			);

		const atBar = sweep((index) => (index < 4 ? 80 : null));
		expect(item(gateReport(atBar), 'viability').passed).toBe(true);
		expect(item(gateReport(atBar), 'viability').detail).toContain('boutique 4/5 (80.0%)');

		// Day-90 completions count (at the by-day bar); day-91 completions do
		// not (over it): otherwise-identical 5-seed reports flip PASS → FAIL.
		const atByDay = sweep((index) => (index < 3 ? 80 : 90));
		expect(item(gateReport(atByDay), 'viability').passed).toBe(true);
		const overByDay = sweep((index) => (index < 3 ? 80 : 91));
		expect(item(gateReport(overByDay), 'viability').passed).toBe(false);

		const threeFifths = sweep((index) => (index < 3 ? 80 : null));
		expect(item(gateReport(threeFifths), 'viability').passed).toBe(false);

		// A partial sweep — boutique runs only — fails the item instead of
		// passing vacuously on the archetypes it never measured.
		const partial = item(
			gateReport(atBar.filter((run) => run.archetypeId === 'boutique')),
			'viability'
		);
		expect(partial.passed).toBe(false);
		expect(partial.detail).toContain('convenience no runs');
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

	it('boundedness: a NaN measurement fails instead of slipping past the numeric maximum', () => {
		const report = gateReport([
			gateRun({
				seed: 3,
				archetypeId: 'convenience',
				bot: 'retail-steady',
				cumulativeImportSpend: Number.NaN
			})
		]);
		const boundedness = item(report, 'boundedness');
		expect(boundedness.passed).toBe(false);
		expect(boundedness.detail).toContain(
			'non-finite cumulative imports on seed 3 convenience/retail-steady'
		);
	});

	it('managed-vs-idle: 4/5 wins passes at the bar, ties and idle wins are losses, unpaired seeds are excluded', () => {
		// The gate sums operatingIncomeByDay inside the configured pair window;
		// a single entry inside it carries the whole comparison total.
		const pairIncome = (income: number): RunMeasurement['operatingIncomeByDay'] => [
			{ day: 61, operatingIncome: income, operatingCashFlow: 0 }
		];
		const managed = (seed: number, archetypeId: ArchetypeId, income: number): RunMeasurement =>
			gateRun({
				seed,
				archetypeId,
				bot: 'retail-steady',
				operatingIncomeDays61To90: income,
				operatingIncomeByDay: pairIncome(income)
			});
		const idle = (seed: number, archetypeId: ArchetypeId, income: number): RunMeasurement =>
			gateRun({
				seed,
				archetypeId,
				bot: 'idle',
				operatingIncomeDays61To90: income,
				operatingIncomeByDay: pairIncome(income)
			});

		// Seeds 1-4: managed wins. Seed 5: tie (100 vs 100) — not a win. Seed 6
		// has no idle pair, so it is excluded from the denominator: 4/5 = 80%.
		const paired = SWEEP_ARCHETYPES.flatMap((archetypeId) => [
			...[1, 2, 3, 4].map((seed) => managed(seed, archetypeId, 300)),
			managed(5, archetypeId, 100),
			...[1, 2, 3, 4].map((seed) => idle(seed, archetypeId, 50)),
			idle(5, archetypeId, 100),
			managed(6, archetypeId, 500)
		]);
		const atBar = item(gateReport(paired), 'managed-vs-idle');
		expect(atBar.passed).toBe(true);
		expect(atBar.detail).toContain('convenience 4/5 (80.0%)');
		expect(atBar.detail).toContain('days 61-90');

		// Idle strictly better on every seed: managed wins 0/5.
		const idleWins = gateReport(
			SWEEP_ARCHETYPES.flatMap((archetypeId) => [
				...[1, 2, 3, 4, 5].map((seed) => managed(seed, archetypeId, 100)),
				...[1, 2, 3, 4, 5].map((seed) => idle(seed, archetypeId, 200))
			])
		);
		const loss = item(idleWins, 'managed-vs-idle');
		expect(loss.passed).toBe(false);
		expect(loss.detail).toContain('convenience 0/5 (0.0%)');

		// An archetype with no paired seeds fails the item instead of passing
		// vacuously on archetypes the sweep never measured.
		const convenienceOnly = item(
			gateReport(paired.filter((run) => run.archetypeId === 'convenience')),
			'managed-vs-idle'
		);
		expect(convenienceOnly.passed).toBe(false);
		expect(convenienceOnly.detail).toContain('boutique no paired seeds');
	});

	it('uses the configured viability window and income-pair days instead of the baked-in defaults', () => {
		// Income tails end on day 30 and last 7 days: a configured 7-day
		// viability window and a days 1–30 pair window both resolve, while the
		// default 30-day window and days 61–90 pair window find nothing.
		const incomeTail = (
			endDay: number,
			length: number,
			income: number
		): RunMeasurement['operatingIncomeByDay'] =>
			Array.from({ length }, (_, index) => ({
				day: endDay - length + 1 + index,
				operatingIncome: income,
				operatingCashFlow: income
			}));
		const report = gateReport(
			SWEEP_ARCHETYPES.flatMap((archetypeId) => [
				gateRun({
					seed: 1,
					archetypeId,
					bot: 'retail-steady',
					operatingIncomeByDay: incomeTail(30, 7, 100)
				}),
				gateRun({
					seed: 1,
					archetypeId,
					bot: 'idle',
					operatingIncomeByDay: incomeTail(30, 7, 10)
				})
			])
		);
		expect(item(report, 'viability').passed).toBe(false);
		expect(item(report, 'managed-vs-idle').passed).toBe(false);

		const custom = evaluateGateA(report, {
			...GATE_A_THRESHOLDS,
			viabilityWindowDays: 7,
			viabilityByDay: 40,
			incomePairDays: [1, 30]
		});
		expect(custom.items.find((candidate) => candidate.id === 'viability')!.passed).toBe(true);
		expect(custom.items.find((candidate) => candidate.id === 'managed-vs-idle')!.passed).toBe(true);
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

	it('forecast tolerance: ±0.25 is measured against realized revenue — at the boundary passes, just over fails, observed 0 fails', () => {
		// Realized mean 100: ±0.25 of REALIZED is forecasts 75–125 inclusive.
		const opening = (
			forecastDailyRevenue: number,
			observedMeanDailyRevenue: number | null
		): OpeningForecastOutcome => ({
			storeId: 'store-x',
			openedOnDay: 1,
			neighborhood: 'downtown',
			archetypeId: 'convenience',
			forecastDailyRevenue,
			observedMeanDailyRevenue,
			relativeError: null,
			withinBand: false,
			complete: true
		});
		const run = (outcomes: OpeningForecastOutcome[]): SweepReport =>
			gateReport([
				gateRun({
					seed: 1,
					archetypeId: 'convenience',
					bot: 'retail-steady',
					forecastOutcomes: outcomes
				})
			]);

		const at = item(run([opening(75, 100), opening(125, 100)]), 'forecast');
		expect(at.passed).toBe(true);
		expect(at.detail).toContain('2/2/2 eligible openings within ±25% of realized');

		const over = item(run([opening(74, 100), opening(126, 100)]), 'forecast');
		expect(over.passed).toBe(false);
		expect(over.detail).toContain('0/2/2 eligible openings within ±25% of realized');

		// An observed revenue of 0 cannot be within tolerance of any positive
		// forecast — deterministic fail, never a divide-by-zero pass.
		const zero = item(run([opening(100, 0)]), 'forecast');
		expect(zero.passed).toBe(false);
		expect(zero.detail).toContain('0/1/1 eligible openings within ±25% of realized');
	});

	it('advisor (Ruling 12): 4/5 served-chain runs passes at the bar; each composite leg failure disqualifies its run', () => {
		const advisor = (seed: number, overrides: Partial<RunMeasurement> = {}): RunMeasurement =>
			gateRun({ seed, archetypeId: 'convenience', bot: 'advisor', ...overrides });

		const atBar = [1, 2, 3, 4]
			.map((seed) => advisor(seed))
			.concat(
				advisor(5, {
					advisorChain: servedChain({
						served: false,
						railsApplied: false,
						lastRailDay: null,
						zeroOutputDaysAfterLastRail: null,
						postRailObservedDays: null
					})
				})
			);
		const passing = item(gateReport(atBar), 'advisor');
		expect(passing.passed).toBe(true);
		expect(passing.detail).toContain('4/5 advisor runs complete the served-chain composite');
		expect(passing.detail).toContain('share 80.0%');

		// Each failure leg (Ruling 11 composite legs beyond the repeated-unapplied
		// one, which has its own leg below) disqualifies exactly its run: with two
		// leg-broken runs the served share is 3/5 = 60% < 80%.
		const legs: Partial<AdvisorChainMetric>[] = [
			{ producerBuilt: false, served: false },
			{ warehouseBuilt: false, served: false },
			{
				railsApplied: false,
				lastRailDay: null,
				zeroOutputDaysAfterLastRail: null,
				postRailObservedDays: null,
				served: false
			},
			{ zeroOutputDaysAfterLastRail: 9, served: false },
			{ localDeliveryUnits: 0, served: false }
		];
		for (const leg of legs) {
			const runs = [1, 2, 3]
				.map((seed) => advisor(seed))
				.concat(
					advisor(4, { advisorChain: servedChain(leg) }),
					advisor(5, {
						advisorChain: servedChain({
							railsApplied: false,
							lastRailDay: null,
							zeroOutputDaysAfterLastRail: null,
							postRailObservedDays: null,
							served: false
						})
					})
				);
			const verdict = item(gateReport(runs), 'advisor');
			expect(verdict.passed).toBe(false);
			expect(verdict.detail).toContain('3/5 advisor runs');
		}

		// A repeated unapplied recommendation stays disqualifying (frozen leg):
		// two noop runs leave 3/5 served, below the bar.
		const noopChain = servedChain({ served: false });
		const unapplied = [1, 2, 3]
			.map((seed) => advisor(seed))
			.concat(
				advisor(4, {
					advisorRepeatedNoOp: {
						startDay: 8,
						streak: 3,
						action: 'advisor:build-rail',
						detail: 'blocked'
					},
					advisorChain: noopChain
				}),
				advisor(5, {
					advisorRepeatedNoOp: {
						startDay: 8,
						streak: 2,
						action: 'advisor:upgrade-building',
						detail: 'blocked'
					},
					advisorChain: noopChain
				})
			);
		expect(item(gateReport(unapplied), 'advisor').passed).toBe(false);

		// A construction-sequencing pause is informational: it labels the stall
		// window in the detail but does NOT disqualify the run (Ruling 12).
		const paused = [1, 2, 3, 4]
			.map((seed) => advisor(seed))
			.concat(
				advisor(5, {
					producerStall: { startDay: 18, endDay: 29, days: 12 },
					advisorChain: servedChain({ stallShape: 'construction-sequencing pause' })
				})
			);
		const pauseVerdict = item(gateReport(paused), 'advisor');
		expect(pauseVerdict.passed).toBe(true);
		expect(pauseVerdict.detail).toContain('construction-sequencing pause days 18-29');

		// Other stall shapes stay labeled `producer stalled` (informational too).
		const stalled = [1, 2, 3, 4]
			.map((seed) => advisor(seed))
			.concat(
				advisor(5, {
					producerStall: { startDay: 100, endDay: 110, days: 11 },
					advisorChain: servedChain({ stallShape: 'producer stalled' })
				})
			);
		const stallVerdict = item(gateReport(stalled), 'advisor');
		expect(stallVerdict.passed).toBe(true);
		expect(stallVerdict.detail).toContain('producer stalled days 100-110');
	});

	it('renders the Gate A section, is pure, and computes a stable overall verdict', () => {
		const runs = SWEEP_ARCHETYPES.flatMap((archetypeId) =>
			[1, 2, 3, 4, 5]
				.map((seed) =>
					gateRun({
						seed,
						archetypeId,
						bot: 'retail-steady',
						operatingIncomeDays61To90: 300,
						operatingIncomeByDay: [{ day: 61, operatingIncome: 300, operatingCashFlow: 0 }],
						forecastOutcomes: [
							{
								storeId: `store-${archetypeId}-${seed}`,
								openedOnDay: 1,
								neighborhood: 'downtown',
								archetypeId,
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
						gateRun({
							seed,
							archetypeId,
							bot: 'idle',
							operatingIncomeDays61To90: 50,
							operatingIncomeByDay: [{ day: 61, operatingIncome: 50, operatingCashFlow: 0 }]
						})
					)
				)
		).concat([gateRun({ seed: 1, archetypeId: 'convenience', bot: 'advisor' })]);
		const report = gateReport(runs);
		const before = JSON.stringify(report);
		const verdict = evaluateGateA(report);
		expect(JSON.stringify(report)).toBe(before);
		expect(JSON.stringify(evaluateGateA(report))).toBe(JSON.stringify(verdict));
		expect(verdict.scenarioGuardrails).toBe('out of scope (scenario tests)');
		// No retail-steady window → viability fails; the other four
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
			'- viability: FAIL — 30d window complete by day 90 (retail-steady): convenience 0/5 (0.0%), boutique 0/5 (0.0%), electronics 0/5 (0.0%), grocery 0/5 (0.0%)'
		);
		expect(markdown).toContain('- scenario guardrails: out of scope (scenario tests)');
		expect(markdown).toMatch(/^- overall: FAIL \(4\/5 items passed\)$/m);
	});
});
