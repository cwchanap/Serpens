/**
 * Balance-harness measurement stage (HPA-502 Stage 3). Pure aggregation:
 * `measureRun` reads the daily history the engine already retains in
 * `game.reports` plus the runner-local opening ledger — no per-day mirror
 * recorder, no new GameState fields.
 *
 * Determinism contract: every function here is a pure function of its inputs
 * and emits plain JSON-safe data with no timestamps, durations, or machine
 * paths, so the same seed/config serializes byte-identically.
 */

import type { ArchetypeId, DailyReport, GameState } from '$lib/game/types';
import type { BotId, BotLedger } from './bots';

/** Forecast attribution uses the store's first 14 complete days of revenue. */
export const FORECAST_OBSERVATION_DAYS = 14;
/** Gate A proposal: per-opening revenue forecast within ±25%. */
export const FORECAST_ERROR_BAND = 0.25;
/** Producer stall exception threshold: consecutive zero-output days. */
export const PRODUCER_STALL_DAYS = 7;

export const CHECKPOINT_DAYS = [30, 60, 90, 180, 365] as const;

export const SWEEP_ARCHETYPES: readonly ArchetypeId[] = [
	'convenience',
	'boutique',
	'electronics',
	'grocery'
];

export const SWEEP_BOTS: readonly BotId[] = ['idle', 'retail-steady', 'advisor'];

/** The advisor layer only covers convenience (see bots.ts). */
export function botsForArchetype(archetypeId: ArchetypeId): BotId[] {
	return archetypeId === 'convenience'
		? [...SWEEP_BOTS]
		: SWEEP_BOTS.filter((bot) => bot !== 'advisor');
}

export interface WindowMetric {
	startDay: number;
	endDay: number;
	/** Sum of daily `operatingIncome` over the window (loan proceeds excluded by construction). */
	operatingIncome: number;
	/** Same window's operating cash flow, shown separately from income. */
	operatingCashFlow: number;
}

export interface CheckpointMetric {
	day: (typeof CHECKPOINT_DAYS)[number];
	cash: number | null;
	debt: number | null;
	storeCount: number | null;
	/** Level of each store present at the checkpoint, in opening order. */
	storeLevels: number[] | null;
}

export interface OpeningForecastOutcome {
	storeId: string;
	openedOnDay: number;
	neighborhood: string;
	archetypeId: ArchetypeId;
	forecastDailyRevenue: number;
	observedMeanDailyRevenue: number | null;
	/** (observed mean − forecast) / forecast — forecast-denominated; the Gate A
	 * item-4 band is realized-denominated (|forecast − realized| / realized). */
	relativeError: number | null;
	withinBand: boolean;
	/** False when fewer than 14 complete days were observed — incomplete, not a pass. */
	complete: boolean;
}

export interface ForecastGroupStat {
	openings: number;
	/** Openings with a full 14-day observation window. */
	complete: number;
	/** Complete observations with |relative error| ≤ 25% (forecast-denominated
	 * `relativeError` band; the Gate A item-4 band is realized-denominated). */
	withinBand: number;
	meanRelativeError: number | null;
}

export interface RepeatedNoOpMetric {
	startDay: number;
	streak: number;
	action: string;
	detail: string;
}

export interface ProducerStallMetric {
	startDay: number;
	endDay: number;
	days: number;
}

/**
 * Served-chain composite legs, measured per advisor run (the Gate A advisor
 * item's verdict source; docs/balance/tuning-changelog.md lever 15). `served`
 * is the conjunction of
 * chain built (producer + warehouse applied), rails applied, no zero-output
 * production day after the last applied rail, ≥1 local (warehouse) delivery
 * to a store, and no repeated unapplied advisor recommendation.
 */
export interface AdvisorChainMetric {
	producerBuilt: boolean;
	warehouseBuilt: boolean;
	railsApplied: boolean;
	/** Day of the last applied connect-rail; null when none applied. */
	lastRailDay: number | null;
	/** Zero-output production days strictly after lastRailDay; null when no rail applied. */
	zeroOutputDaysAfterLastRail: number | null;
	/** Warehouse (local) units delivered to stores across the run. */
	localDeliveryUnits: number;
	/** Informational shape of the run's producer-stall window: buildout-shaped
	 * windows (a build/rail action inside, production resumed and sustained to
	 * end) are construction-sequencing pauses; every other shape stays a stall. */
	stallShape: 'construction-sequencing pause' | 'producer stalled' | null;
	/** The served-chain composite verdict for this run. */
	served: boolean;
}

export interface RunMeasurement {
	seed: number;
	archetypeId: ArchetypeId;
	bot: BotId;
	foundingTileId: string;
	daysSimulated: number;
	/** Cash before the first daily tick, i.e. right after founding. */
	foundingCash: number;
	firstPositiveWindow7: WindowMetric | null;
	firstPositiveWindow30: WindowMetric | null;
	firstNegativeCashDay: number | null;
	minimumCash: number;
	/** Report day of the minimum; 0 means the founding-cash baseline. */
	minimumCashDay: number;
	checkpoints: CheckpointMetric[];
	missedDemandShare: number | null;
	stockoutShare: number | null;
	wasteUnits: number;
	wasteValue: number;
	/** Largest |cash| over the founding baseline and every daily cashAfter. */
	maxAbsCash: number;
	/** Largest outstanding loan principal across daily reports (no founding-debt recorder exists). */
	maxOutstandingPrincipal: number;
	/** Sum of the daily report's importSpend (retail + industrial) over the whole run. */
	cumulativeImportSpend: number;
	/** Sum of operatingIncome over report days 61–90 inclusive (partial when the run ends earlier). */
	operatingIncomeDays61To90: number;
	forecastOutcomes: OpeningForecastOutcome[];
	forecastByArchetype: Record<string, ForecastGroupStat>;
	forecastByNeighborhood: Record<string, ForecastGroupStat>;
	advisorRepeatedNoOp: RepeatedNoOpMetric | null;
	producerStall: ProducerStallMetric | null;
	/** Served-chain composite legs (Gate A item-5 verdict source). */
	advisorChain: AdvisorChainMetric;
}

export interface SweepRunResult {
	seed: number;
	archetypeId: ArchetypeId;
	bot: BotId;
	measurement: RunMeasurement;
}

export interface SweepReport {
	config: { seeds: number[]; days: number };
	runs: RunMeasurement[];
}

/**
 * First window of `length` consecutive report days whose summed
 * `operatingIncome` is positive. Windows must be complete (fully inside the
 * observed history) and contiguous by report day; loan proceeds never enter
 * `operatingIncome`, so financing cannot fake profitability.
 */
function firstPositiveWindow(reports: DailyReport[], length: number): WindowMetric | null {
	for (let end = length - 1; end < reports.length; end += 1) {
		const start = end - length + 1;
		if (reports[end]!.day - reports[start]!.day !== length - 1) continue;
		let operatingIncome = 0;
		let operatingCashFlow = 0;
		for (let index = start; index <= end; index += 1) {
			operatingIncome += reports[index]!.operatingIncome;
			operatingCashFlow += reports[index]!.operatingCashFlow;
		}
		if (operatingIncome > 0) {
			return {
				startDay: reports[start]!.day,
				endDay: reports[end]!.day,
				operatingIncome,
				operatingCashFlow
			};
		}
	}
	return null;
}

function groupStat(outcomes: OpeningForecastOutcome[]): ForecastGroupStat {
	const errors = outcomes
		.filter((outcome) => outcome.complete && outcome.relativeError !== null)
		.map((outcome) => outcome.relativeError!);
	return {
		openings: outcomes.length,
		complete: outcomes.filter((outcome) => outcome.complete).length,
		withinBand: outcomes.filter((outcome) => outcome.withinBand).length,
		meanRelativeError:
			errors.length === 0 ? null : errors.reduce((total, error) => total + error, 0) / errors.length
	};
}

function groupBy<T extends string>(
	outcomes: OpeningForecastOutcome[],
	key: (outcome: OpeningForecastOutcome) => T
): Record<string, ForecastGroupStat> {
	const buckets = new Map<T, OpeningForecastOutcome[]>();
	for (const outcome of outcomes) {
		const bucket = buckets.get(key(outcome));
		if (bucket) bucket.push(outcome);
		else buckets.set(key(outcome), [outcome]);
	}
	return Object.fromEntries(
		[...buckets.entries()]
			.sort(([a], [b]) => (a < b ? -1 : 1))
			.map(([group, list]) => [group, groupStat(list)])
	);
}

/**
 * Longest run of weekly-cadence advisor recommendations that PROPOSED a
 * concrete action but were not applied, with an identical action+detail
 * shape (Ruling 10b). Honest planner declines — `advisor:plan` failures and
 * `advisor:none` advices — propose nothing and never count as violations;
 * they are reported as counts in sweep analysis instead.
 */
function findRepeatedAdvisorNoOp(ledger: BotLedger): RepeatedNoOpMetric | null {
	// Only the `advisor:`-prefixed planner records count: retail-steady no-ops
	// (openStore/hireStaff/...) share the ledger's bot label during advisor runs
	// and their daily cadence would otherwise reset the weekly streak.
	const unapplied = ledger.actions
		.filter(
			(action) =>
				action.bot === 'advisor' &&
				action.action.startsWith('advisor:') &&
				action.action !== 'advisor:plan' &&
				action.action !== 'advisor:none' &&
				action.outcome !== 'applied'
		)
		.sort((a, b) => a.day - b.day);
	let best: RepeatedNoOpMetric | null = null;
	let startDay = 0;
	let streak = 0;
	let action = '';
	let detail = '';
	for (const record of unapplied) {
		const recordDetail = record.detail ?? '';
		const continues =
			streak > 0 &&
			record.day - startDay === 7 * streak &&
			record.action === action &&
			recordDetail === detail;
		startDay = continues ? startDay : record.day;
		streak = continues ? streak + 1 : 1;
		action = continues ? action : record.action;
		detail = continues ? detail : recordDetail;
		if (streak >= 2 && (best === null || streak > best.streak)) {
			best = { startDay, streak, action, detail };
		}
	}
	return best;
}

/**
 * Longest run of ≥PRODUCER_STALL_DAYS consecutive zero-output days AFTER the
 * first day with nonzero output (Ruling 10a: the buildout gap between chain
 * construction and first flow is not a stall). A chain that never produces
 * at all stalls from the producer-build day. Reports aggregate per city,
 * not per building; a partial stall alongside a producing building is
 * invisible at this level.
 */
function findProducerStall(reports: DailyReport[], ledger: BotLedger): ProducerStallMetric | null {
	const buildDays = ledger.actions
		.filter((action) => action.action === 'advisor:build-producer' && action.outcome === 'applied')
		.map((action) => action.day)
		.sort((a, b) => a - b);
	const firstBuildDay = buildDays[0];
	if (firstBuildDay === undefined) return null;
	let best: ProducerStallMetric | null = null;
	let firstOutputDay = 0; // 0 = no nonzero-output day seen yet.
	let startDay = 0;
	let endDay = 0; // 0 = no open zero-output run.
	for (const report of reports) {
		if (report.day < firstBuildDay) continue;
		const produced = report.productionReport.produced.reduce(
			(total, movement) => total + movement.quantity,
			0
		);
		if (produced === 0) {
			if (firstOutputDay === 0) continue; // Still inside the buildout gap.
			startDay = endDay !== 0 && report.day - endDay === 1 ? startDay : report.day;
			endDay = report.day;
			const days = endDay - startDay + 1;
			if (days >= PRODUCER_STALL_DAYS && (best === null || days > best.days)) {
				best = { startDay, endDay, days };
			}
		} else {
			if (firstOutputDay === 0) firstOutputDay = report.day;
			endDay = 0;
		}
	}
	// All-zero chain: never produced at all — stall runs from the build day.
	if (firstOutputDay === 0) {
		const lastDay = reports.length > 0 ? reports[reports.length - 1]!.day : null;
		if (lastDay === null || lastDay < firstBuildDay) return null;
		const days = lastDay - firstBuildDay + 1;
		return days >= PRODUCER_STALL_DAYS ? { startDay: firstBuildDay, endDay: lastDay, days } : null;
	}
	return best;
}

function productionByDay(reports: DailyReport[]): { day: number; produced: number }[] {
	return reports.map((report) => ({
		day: report.day,
		produced: report.productionReport.produced.reduce(
			(total, movement) => total + movement.quantity,
			0
		)
	}));
}

/**
 * Informational stall-window shape: a window with an applied
 * advisor build/rail action inside it whose production resumes after the
 * window and stays on through end-of-run is a construction-sequencing pause;
 * every other window keeps the `producer stalled` label.
 */
function classifyStallShape(
	reports: DailyReport[],
	ledger: BotLedger,
	stall: ProducerStallMetric
): 'construction-sequencing pause' | 'producer stalled' {
	const buildInside = ledger.actions.some(
		(record) =>
			record.bot === 'advisor' &&
			record.outcome === 'applied' &&
			(record.action === 'advisor:build-producer' ||
				record.action === 'advisor:build-warehouse' ||
				record.action === 'advisor:connect-rail') &&
			record.day >= stall.startDay &&
			record.day <= stall.endDay
	);
	let resumed = false;
	let brokeAfterResume = false;
	for (const entry of productionByDay(reports)) {
		if (entry.day <= stall.endDay) continue;
		if (entry.produced > 0) resumed = true;
		else if (resumed) brokeAfterResume = true;
	}
	return buildInside && resumed && !brokeAfterResume
		? 'construction-sequencing pause'
		: 'producer stalled';
}

/**
 * Served-chain composite legs for one run. `advisorRepeatedNoOp`
 * closes the last leg; a producer-stall window contributes only its
 * informational shape, never the verdict.
 */
function measureAdvisorChain(
	reports: DailyReport[],
	ledger: BotLedger,
	stall: ProducerStallMetric | null,
	advisorRepeatedNoOp: RepeatedNoOpMetric | null
): AdvisorChainMetric {
	const appliedDays = (action: string): number[] =>
		ledger.actions
			.filter(
				(record) =>
					record.bot === 'advisor' && record.action === action && record.outcome === 'applied'
			)
			.map((record) => record.day)
			.sort((a, b) => a - b);
	const producerBuilt = appliedDays('advisor:build-producer').length > 0;
	const warehouseBuilt = appliedDays('advisor:build-warehouse').length > 0;
	const railDays = appliedDays('advisor:connect-rail');
	const railsApplied = railDays.length > 0;
	const lastRailDay = railsApplied ? railDays[railDays.length - 1]! : null;
	const zeroOutputDaysAfterLastRail =
		lastRailDay === null
			? null
			: productionByDay(reports).filter((entry) => entry.day > lastRailDay && entry.produced === 0)
					.length;
	let localDeliveryUnits = 0;
	for (const report of reports) {
		for (const store of report.storeReports) {
			for (const product of store.productReports) {
				localDeliveryUnits += product.warehouseUnits;
			}
		}
	}
	const served =
		producerBuilt &&
		warehouseBuilt &&
		railsApplied &&
		zeroOutputDaysAfterLastRail === 0 &&
		localDeliveryUnits >= 1 &&
		advisorRepeatedNoOp === null;
	return {
		producerBuilt,
		warehouseBuilt,
		railsApplied,
		lastRailDay,
		zeroOutputDaysAfterLastRail,
		localDeliveryUnits,
		stallShape: stall === null ? null : classifyStallShape(reports, ledger, stall),
		served
	};
}

/**
 * Per-opening forecast attribution against that store's first 14 COMPLETE
 * days of revenue. Short observations are incomplete — never silently passes.
 */
function measureForecastOutcomes(
	reports: DailyReport[],
	ledger: BotLedger
): OpeningForecastOutcome[] {
	const revenueByStore = new Map<string, { day: number; revenue: number }[]>();
	for (const report of reports) {
		for (const store of report.storeReports) {
			const list = revenueByStore.get(store.storeId);
			if (list) list.push({ day: report.day, revenue: store.revenue });
			else revenueByStore.set(store.storeId, [{ day: report.day, revenue: store.revenue }]);
		}
	}
	return ledger.openings.map((opening) => {
		const observed = (revenueByStore.get(opening.storeId) ?? []).filter(
			(entry) => entry.day >= opening.day && entry.day < opening.day + FORECAST_OBSERVATION_DAYS
		);
		const complete =
			observed.length === FORECAST_OBSERVATION_DAYS && observed[0]!.day === opening.day;
		const forecast = opening.forecast.projectedDailyRevenue;
		if (!complete || forecast <= 0) {
			return {
				storeId: opening.storeId,
				openedOnDay: opening.day,
				neighborhood: opening.neighborhood,
				archetypeId: opening.archetypeId,
				forecastDailyRevenue: forecast,
				observedMeanDailyRevenue: null,
				relativeError: null,
				withinBand: false,
				complete
			};
		}
		const mean = observed.reduce((total, entry) => total + entry.revenue, 0) / observed.length;
		const relativeError = (mean - forecast) / forecast;
		return {
			storeId: opening.storeId,
			openedOnDay: opening.day,
			neighborhood: opening.neighborhood,
			archetypeId: opening.archetypeId,
			forecastDailyRevenue: forecast,
			observedMeanDailyRevenue: mean,
			relativeError,
			withinBand: Math.abs(relativeError) <= FORECAST_ERROR_BAND,
			complete
		};
	});
}

/** Pure post-simulation measurement of one bot run. */
export function measureRun(game: Pick<GameState, 'reports'>, ledger: BotLedger): RunMeasurement {
	const reports = game.reports;
	// Founding cash comes from the ledger, not reports[0].cashBefore: bots act
	// before the first advanceDay tick, so that report field is already
	// downstream of day-1 hires/expansions/builds.
	const foundingCash = ledger.foundingCash;

	let firstNegativeCashDay: number | null = null;
	let minimumCash = foundingCash;
	let minimumCashDay = 0;
	let missedDemand = 0;
	let soldUnits = 0;
	let productDays = 0;
	let stockoutProductDays = 0;
	let wasteUnits = 0;
	let wasteValue = 0;
	let maxAbsCash = Math.abs(foundingCash);
	let maxOutstandingPrincipal = 0;
	let cumulativeImportSpend = 0;
	let operatingIncomeDays61To90 = 0;
	for (const report of reports) {
		if (report.cashAfter < 0 && firstNegativeCashDay === null) firstNegativeCashDay = report.day;
		maxAbsCash = Math.max(maxAbsCash, Math.abs(report.cashAfter));
		maxOutstandingPrincipal = Math.max(maxOutstandingPrincipal, report.outstandingPrincipalAfter);
		cumulativeImportSpend += report.importSpend;
		// The agreed Gate A comparison window (days 61–90 inclusive); fixed by
		// the field's definition, independent of any threshold value.
		if (report.day >= 61 && report.day <= 90) operatingIncomeDays61To90 += report.operatingIncome;
		if (minimumCash === null || report.cashAfter < minimumCash) {
			minimumCash = report.cashAfter;
			minimumCashDay = report.day;
		}
		for (const store of report.storeReports) {
			missedDemand += store.demandMissed;
			soldUnits += store.customersServed;
			for (const product of store.productReports) {
				productDays += 1;
				if (product.endingStock === 0) stockoutProductDays += 1;
				wasteUnits += product.wasteUnits;
				wasteValue += product.wasteValue;
			}
		}
	}

	const checkpoints: CheckpointMetric[] = CHECKPOINT_DAYS.map((day) => {
		const report = reports.find((entry) => entry.day === day);
		const stores = ledger.openings.filter((opening) => opening.day <= day);
		return {
			day,
			cash: report ? report.cashAfter : null,
			debt: report ? report.outstandingPrincipalAfter : null,
			storeCount: report ? stores.length : null,
			storeLevels: report ? stores.map((opening) => opening.level) : null
		};
	});

	const forecastOutcomes = measureForecastOutcomes(reports, ledger);
	const advisorRepeatedNoOp = findRepeatedAdvisorNoOp(ledger);
	const producerStall = findProducerStall(reports, ledger);

	return {
		seed: ledger.seed,
		archetypeId: ledger.archetypeId,
		bot: ledger.bot,
		foundingTileId: ledger.foundingTileId,
		daysSimulated: reports.length,
		foundingCash,
		firstPositiveWindow7: firstPositiveWindow(reports, 7),
		firstPositiveWindow30: firstPositiveWindow(reports, 30),
		firstNegativeCashDay,
		minimumCash,
		minimumCashDay,
		checkpoints,
		missedDemandShare:
			missedDemand + soldUnits === 0 ? null : missedDemand / (missedDemand + soldUnits),
		stockoutShare: productDays === 0 ? null : stockoutProductDays / productDays,
		wasteUnits,
		wasteValue,
		maxAbsCash,
		maxOutstandingPrincipal,
		cumulativeImportSpend,
		operatingIncomeDays61To90,
		forecastOutcomes,
		forecastByArchetype: groupBy(forecastOutcomes, (outcome) => outcome.archetypeId),
		forecastByNeighborhood: groupBy(forecastOutcomes, (outcome) => outcome.neighborhood),
		advisorRepeatedNoOp,
		producerStall,
		advisorChain: measureAdvisorChain(reports, ledger, producerStall, advisorRepeatedNoOp)
	};
}

/** Gate A thresholds, approved verbatim 2026-10-25 (design doc, "Gate A decision record"). */
export interface GateAThresholds {
	/** Full positive operating-income window length that counts as viable. */
	viabilityWindowDays: number;
	/** Viable = the window completes on or before this day. */
	viabilityByDay: number;
	/** Required share of viable retail-steady seeds. Gate A's single 80% bar — also
	 * the managed-vs-idle win bar and the forecast pass share. */
	viabilitySeedShare: number;
	/** Every measured |value| must stay strictly below this (design: "below 1,000,000,000"). */
	absCeiling: number;
	/** Inclusive operating-income comparison window, retail-steady vs idle. */
	incomePairDays: [number, number];
	/** Per-opening forecast tolerance: |forecast − realized| / realized ≤ this
	 * (realized-denominated; the stored `relativeError` keeps a forecast
	 * denominator). Same 0.25 value as FORECAST_ERROR_BAND. */
	forecastTolerance: number;
	/** Required share of clean advisor runs. */
	advisorSeedShare: number;
}

export const GATE_A_THRESHOLDS: GateAThresholds = {
	viabilityWindowDays: 30,
	viabilityByDay: 90,
	viabilitySeedShare: 0.8,
	absCeiling: 1_000_000_000,
	incomePairDays: [61, 90],
	forecastTolerance: 0.25,
	advisorSeedShare: 0.8
};

export type GateAItemId = 'viability' | 'boundedness' | 'managed-vs-idle' | 'forecast' | 'advisor';

export interface GateAItemVerdict {
	id: GateAItemId;
	passed: boolean;
	detail: string;
}

export interface GateAVerdict {
	items: GateAItemVerdict[];
	/** Scenario guardrails are measured by scenario tests (Step 5), not here. */
	scenarioGuardrails: 'out of scope (scenario tests)';
	allPassed: boolean;
}

function fmtShare(share: number): string {
	return `${(share * 100).toFixed(1)}%`;
}

/**
 * Pure Gate A evaluation over a finished sweep report (design doc Gate A
 * items 1–4; item 5 scenarios are scenario-test scope, item 6 is the
 * determinism spec). Mutates nothing.
 */
export function evaluateGateA(
	report: SweepReport,
	thresholds: GateAThresholds = GATE_A_THRESHOLDS
): GateAVerdict {
	const items: GateAItemVerdict[] = [];

	// Item 1 — retail viability: per archetype, the share of retail-steady
	// seeds whose first full positive window completes by viabilityByDay.
	{
		const parts: string[] = [];
		let passed = true;
		for (const archetypeId of SWEEP_ARCHETYPES) {
			const runs = report.runs.filter(
				(run) => run.archetypeId === archetypeId && run.bot === 'retail-steady'
			);
			if (runs.length === 0) continue;
			const viable = runs.filter(
				(run) =>
					run.firstPositiveWindow30 !== null &&
					run.firstPositiveWindow30.endDay <= thresholds.viabilityByDay
			).length;
			const share = viable / runs.length;
			if (share < thresholds.viabilitySeedShare) passed = false;
			parts.push(`${archetypeId} ${viable}/${runs.length} (${fmtShare(share)})`);
		}
		items.push({
			id: 'viability',
			passed,
			detail: `${thresholds.viabilityWindowDays}d window complete by day ${thresholds.viabilityByDay} (retail-steady): ${parts.join(', ') || 'no runs'}`
		});
	}

	// Item 2 — boundedness: strict |value| < absCeiling across all runs for
	// daily cash (incl. founding), outstanding principal, cumulative import
	// spend, and waste units/value.
	{
		const maxima: Record<string, number> = {
			cash: 0,
			principal: 0,
			'cumulative imports': 0,
			'waste units': 0,
			'waste value': 0
		};
		let worstRun: RunMeasurement | null = null;
		let worstMetric = 'none';
		let globalMax = 0;
		// NaN never satisfies `value > max`, so a corrupted measurement would
		// otherwise pass the gate silently; track the first non-finite
		// candidate and fail on it explicitly.
		let nonFinite: { metric: string; run: RunMeasurement } | null = null;
		for (const run of report.runs) {
			const candidates: [string, number][] = [
				['cash', run.maxAbsCash],
				['principal', run.maxOutstandingPrincipal],
				['cumulative imports', run.cumulativeImportSpend],
				['waste units', run.wasteUnits],
				['waste value', run.wasteValue]
			];
			for (const [metric, value] of candidates) {
				if (!Number.isFinite(value)) {
					nonFinite ??= { metric, run };
					continue;
				}
				if (value > maxima[metric]) maxima[metric] = value;
				if (value > globalMax) {
					globalMax = value;
					worstMetric = metric;
					worstRun = run;
				}
			}
		}
		items.push({
			id: 'boundedness',
			passed: nonFinite === null && globalMax < thresholds.absCeiling,
			detail: `max |cash| ${maxima.cash}, max principal ${maxima.principal}, max cumulative imports ${maxima['cumulative imports']}, max waste ${maxima['waste units']}u/${maxima['waste value']} over ${report.runs.length} runs; ceiling ${thresholds.absCeiling}${worstRun ? `; worst: ${worstMetric} on seed ${worstRun.seed} ${worstRun.archetypeId}/${worstRun.bot}` : ''}${nonFinite ? `; non-finite ${nonFinite.metric} on seed ${nonFinite.run.seed} ${nonFinite.run.archetypeId}/${nonFinite.run.bot}` : ''}`
		});
	}

	// Item 3 — managed-vs-idle: per archetype, retail-steady must beat idle
	// (strictly) on days 61–90 operating income in the required share of paired
	// seeds; seeds without both runs are excluded from the denominator.
	{
		const parts: string[] = [];
		let passed = true;
		for (const archetypeId of SWEEP_ARCHETYPES) {
			const managedBySeed = new Map<number, RunMeasurement>();
			const idleBySeed = new Map<number, RunMeasurement>();
			for (const run of report.runs) {
				if (run.archetypeId !== archetypeId) continue;
				if (run.bot === 'retail-steady') managedBySeed.set(run.seed, run);
				else if (run.bot === 'idle') idleBySeed.set(run.seed, run);
			}
			const pairedSeeds = [...managedBySeed.keys()]
				.filter((seed) => idleBySeed.has(seed))
				.sort((a, b) => a - b);
			if (pairedSeeds.length === 0) continue;
			let wins = 0;
			for (const seed of pairedSeeds) {
				if (
					managedBySeed.get(seed)!.operatingIncomeDays61To90 >
					idleBySeed.get(seed)!.operatingIncomeDays61To90
				) {
					wins += 1;
				}
			}
			const share = wins / pairedSeeds.length;
			if (share < thresholds.viabilitySeedShare) passed = false;
			parts.push(`${archetypeId} ${wins}/${pairedSeeds.length} (${fmtShare(share)})`);
		}
		const [startDay, endDay] = thresholds.incomePairDays;
		items.push({
			id: 'managed-vs-idle',
			passed,
			detail: `days ${startDay}-${endDay} operating income, retail-steady > idle per seed: ${parts.join(', ') || 'no pairs'}`
		});
	}

	// Item 4 — opening forecast: share of complete eligible openings within
	// the tolerance, measured as |forecast − realized| / realized (Gate A
	// criterion: relative to the OBSERVED mean revenue; the stored
	// relativeError keeps its forecast-denominator definition and is not
	// reused here). Eligible = replenishing bots (retail-steady/advisor,
	// founding + expansion); idle openings and incomplete windows are
	// excluded but counted in the detail. Observed revenue of 0 (or less)
	// can never lie within tolerance of a positive forecast, so such
	// openings deterministically fail the band.
	{
		const outcomes = report.runs
			.filter((run) => run.bot !== 'idle')
			.flatMap((run) => run.forecastOutcomes);
		const complete = outcomes.filter((outcome) => outcome.complete);
		const within = complete.filter((outcome) => {
			const observed = outcome.observedMeanDailyRevenue;
			if (observed === null || observed <= 0) return false;
			return (
				Math.abs(outcome.forecastDailyRevenue - observed) / observed <= thresholds.forecastTolerance
			);
		}).length;
		const incomplete = outcomes.length - complete.length;
		const idleOpenings = report.runs
			.filter((run) => run.bot === 'idle')
			.reduce((total, run) => total + run.forecastOutcomes.length, 0);
		const share = complete.length === 0 ? null : within / complete.length;
		items.push({
			id: 'forecast',
			passed: share !== null && share >= thresholds.viabilitySeedShare,
			detail: `${within}/${complete.length}/${outcomes.length} eligible openings within ±${thresholds.forecastTolerance * 100}% of realized (share ${share === null ? 'n/a' : fmtShare(share)}); excluded-and-counted: ${incomplete} incomplete, ${idleOpenings} idle openings`
		});
	}

	// Item 5 — advisor: clean = the served-chain
	// composite (chain built + rails applied + no zero-output day after the
	// last applied rail + ≥1 local delivery to a store + no repeated
	// unapplied recommendation). Stall windows stay informational
	// diagnostics: buildout-shaped windows render as construction-sequencing
	// pauses, other shapes as producer stalls; neither fails the item.
	{
		const advisorRuns = report.runs.filter((run) => run.bot === 'advisor');
		const served = advisorRuns.filter((run) => run.advisorChain.served).length;
		const share = advisorRuns.length === 0 ? null : served / advisorRuns.length;
		const unapplied = advisorRuns.filter((run) => run.advisorRepeatedNoOp !== null).length;
		const windows = new Map<string, number>();
		for (const run of advisorRuns) {
			if (run.producerStall === null) continue;
			const label = run.advisorChain.stallShape ?? 'producer stalled';
			const key = `${label} days ${run.producerStall.startDay}-${run.producerStall.endDay}`;
			windows.set(key, (windows.get(key) ?? 0) + 1);
		}
		const windowSummary = [...windows.entries()]
			.sort(([a], [b]) => (a < b ? -1 : 1))
			.map(([key, count]) => `${count} ${key}`)
			.join(', ');
		items.push({
			id: 'advisor',
			passed: share !== null && share >= thresholds.advisorSeedShare,
			detail: `${served}/${advisorRuns.length} advisor runs complete the served-chain composite (share ${share === null ? 'n/a' : fmtShare(share)}); stall windows (informational): ${windowSummary || 'none'}; ${unapplied} repeated unapplied`
		});
	}

	return {
		items,
		scenarioGuardrails: 'out of scope (scenario tests)',
		allPassed: items.every((item) => item.passed)
	};
}

function archetypeOrder(archetypeId: ArchetypeId): number {
	return Math.max(0, SWEEP_ARCHETYPES.indexOf(archetypeId));
}

function botOrder(bot: BotId): number {
	return Math.max(0, SWEEP_BOTS.indexOf(bot));
}

/** Assemble the sweep report with the deterministic seed/archetype/bot ordering. */
function compareMeasurements(a: RunMeasurement, b: RunMeasurement): number {
	return (
		a.seed - b.seed ||
		archetypeOrder(a.archetypeId) - archetypeOrder(b.archetypeId) ||
		botOrder(a.bot) - botOrder(b.bot)
	);
}

export function buildSweepReport(
	seeds: number[],
	days: number,
	results: SweepRunResult[]
): SweepReport {
	return {
		config: { seeds: [...seeds].sort((a, b) => a - b), days },
		runs: results.map((result) => result.measurement).sort(compareMeasurements)
	};
}

/**
 * Re-assemble one deterministic report from separately executed partial
 * reports (e.g. several seed batches run as parallel CLI invocations). Pure
 * regrouping only — byte-identical to a single-run report over the same runs.
 */
export function mergeSweepReports(parts: SweepReport[]): SweepReport {
	if (parts.length === 0) throw new Error('balance: cannot merge an empty report list.');
	const days = parts[0]!.config.days;
	const seeds = [...new Set(parts.flatMap((part) => part.config.seeds))];
	return {
		config: { seeds: seeds.sort((a, b) => a - b), days },
		runs: parts.flatMap((part) => part.runs).sort(compareMeasurements)
	};
}

function fmtPct(value: number | null): string {
	return value === null ? '-' : `${(value * 100).toFixed(1)}%`;
}

function fmtCash(value: number | null): string {
	return value === null ? '-' : String(Math.round(value));
}

function fmtWindow(window: WindowMetric | null): string {
	return window === null ? '-' : `${window.startDay}-${window.endDay}`;
}

function fmtErrorStat(stat: ForecastGroupStat): string {
	return `${stat.withinBand}/${stat.complete}/${stat.openings} ${
		stat.meanRelativeError === null ? '-' : `${(stat.meanRelativeError * 100).toFixed(1)}%`
	}`;
}

function runExceptions(run: RunMeasurement): string[] {
	const exceptions: string[] = [];
	if (run.firstNegativeCashDay !== null) {
		exceptions.push(`negative cash from day ${run.firstNegativeCashDay}`);
	}
	if (run.producerStall !== null) {
		const label = run.advisorChain.stallShape ?? 'producer stalled';
		exceptions.push(
			`${label} ${run.producerStall.days}d (days ${run.producerStall.startDay}-${run.producerStall.endDay})`
		);
	}
	if (run.advisorRepeatedNoOp !== null) {
		exceptions.push(
			`advisor recommendation unapplied, repeated ${run.advisorRepeatedNoOp.streak}x from day ${run.advisorRepeatedNoOp.startDay}: ${run.advisorRepeatedNoOp.action} (${run.advisorRepeatedNoOp.detail})`
		);
	}
	const incomplete = run.forecastOutcomes.filter((outcome) => !outcome.complete);
	if (incomplete.length > 0) {
		exceptions.push(
			`${incomplete.length}/${run.forecastOutcomes.length} openings lack 14 complete forecast days`
		);
	}
	return exceptions;
}

export const SWEEP_DISCLOSURE =
	'Disclosure: the rail planner correctness fix (HPA-502 Task 1, connect-rail advice grounded in a concrete missing rail edge) landed BEFORE this baseline. The measured economy is otherwise untouched; advisor results are measured on the repaired planner.';

export const BOT_DEFINITIONS = [
	'idle: takes no actions; only the daily advanceDay tick runs (negative control).',
	'retail-steady: delegates protect-availability (city scope, so expansion stores stay managed) to the first eligible manager, hires/assigns to cover every staffing shortage, and opens the best legal affordable tile while under the store cap.',
	'advisor (convenience only): retail-steady plus the supply planner recommendation every 7 in-game days, executed through applyGameCommand / buildRailPreview (build producer or warehouse, upgrade building, connect rail).'
];

const SWEEP_SEEDS = Array.from({ length: 50 }, (_, index) => 20260501 + index);

export const SWEEP_REGENERATION_COMMAND = `bun tests/balance/run.ts --seeds ${SWEEP_SEEDS.join(',')} --days 365 --bots idle,retail-steady,advisor --output docs/balance/generated/balance-sweep`;

/**
 * The regeneration command rendered into artifact headers. Ruling 10c:
 * artifacts must describe their OWN regeneration, so the runner passes the
 * actual CLI invocation (seeds/days/bots/output as run); the documented
 * full-sweep command remains the fallback for callers without one.
 */
export function sweepRegenerationCommand(invocation: {
	seeds: number[];
	days: number;
	bots: string[];
	output?: string;
}): string {
	const output = invocation.output ?? 'docs/balance/generated/balance-sweep';
	return `bun tests/balance/run.ts --seeds ${invocation.seeds.join(',')} --days ${invocation.days} --bots ${invocation.bots.join(',')} --output ${output}`;
}

/** Deterministic Markdown rendering of a sweep report. */
export function renderSweepMarkdown(
	report: SweepReport,
	regenerationCommand: string = SWEEP_REGENERATION_COMMAND
): string {
	const lines: string[] = [];
	lines.push('# HPA-502 balance sweep');
	lines.push('');
	lines.push(`- Seeds (${report.config.seeds.length}): ${report.config.seeds.join(', ')}`);
	lines.push(`- Days per run: ${report.config.days}`);
	lines.push(
		`- Ordering: seed, then archetype (${SWEEP_ARCHETYPES.join(' < ')}), then bot (${SWEEP_BOTS.join(' < ')}).`
	);
	lines.push(`- Regenerate JSON/Markdown: \`${regenerationCommand}\``);
	for (const definition of BOT_DEFINITIONS) lines.push(`- Bot: ${definition}`);
	lines.push(`- ${SWEEP_DISCLOSURE}`);
	lines.push('');
	lines.push('## Per-archetype × bot aggregates');
	lines.push('');
	lines.push(
		'| archetype | bot | runs | positive 30d window by day 365 | first negative cash day | within ±25% (forecast band) / complete / openings | stalls ≥7d | repeated unapplied advisor recommendations |'
	);
	lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
	const groups = new Map<string, RunMeasurement[]>();
	for (const run of report.runs) {
		const key = `${run.archetypeId} | ${run.bot}`;
		const bucket = groups.get(key);
		if (bucket) bucket.push(run);
		else groups.set(key, [run]);
	}
	for (const [key, runs] of groups) {
		const [archetypeId, bot] = key.split(' | ');
		const withWindow = runs.filter((run) => run.firstPositiveWindow30 !== null).length;
		const negativeCash = runs.filter((run) => run.firstNegativeCashDay !== null).length;
		const openings = runs.flatMap((run) => run.forecastOutcomes);
		const stat = groupStat(openings);
		const stalls = runs.filter((run) => run.producerStall !== null).length;
		const noOps = runs.filter((run) => run.advisorRepeatedNoOp !== null).length;
		lines.push(
			`| ${archetypeId} | ${bot} | ${runs.length} | ${withWindow}/${runs.length} | ${negativeCash}/${runs.length} | ${fmtErrorStat(stat)} | ${stalls} | ${noOps} |`
		);
	}
	lines.push('');
	const verdict = evaluateGateA(report);
	lines.push('## Gate A verdict');
	lines.push('');
	for (const item of verdict.items) {
		lines.push(`- ${item.id}: ${item.passed ? 'PASS' : 'FAIL'} — ${item.detail}`);
	}
	lines.push(`- scenario guardrails: ${verdict.scenarioGuardrails}`);
	lines.push(
		`- overall: ${verdict.allPassed ? 'PASS' : 'FAIL'} (${verdict.items.filter((item) => item.passed).length}/${verdict.items.length} items passed)`
	);
	lines.push('');
	lines.push('## Per-run results');
	lines.push('');
	lines.push(
		'| seed | archetype | bot | pos7 | pos30 | negCash | minCash (day) | d30 cash | d90 cash | d365 cash | missed | stockout | waste | forecast in±25% | maxAbs | maxDebt | cumImports | d61-90 inc |'
	);
	lines.push(
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
	);
	for (const run of report.runs) {
		const at = (day: (typeof CHECKPOINT_DAYS)[number]) =>
			run.checkpoints.find((checkpoint) => checkpoint.day === day)?.cash ?? null;
		const overall = groupStat(run.forecastOutcomes);
		lines.push(
			`| ${run.seed} | ${run.archetypeId} | ${run.bot} | ${fmtWindow(run.firstPositiveWindow7)} | ${fmtWindow(run.firstPositiveWindow30)} | ${run.firstNegativeCashDay ?? '-'} | ${fmtCash(run.minimumCash)} (${run.minimumCashDay ?? '-'}) | ${fmtCash(at(30))} | ${fmtCash(at(90))} | ${fmtCash(at(365))} | ${fmtPct(run.missedDemandShare)} | ${fmtPct(run.stockoutShare)} | ${run.wasteUnits}u/${fmtCash(run.wasteValue)} | ${fmtErrorStat(overall)} | ${fmtCash(run.maxAbsCash)} | ${fmtCash(run.maxOutstandingPrincipal)} | ${fmtCash(run.cumulativeImportSpend)} | ${fmtCash(run.operatingIncomeDays61To90)} |`
		);
	}
	lines.push('');
	lines.push('## Measured exceptions');
	lines.push('');
	let exceptionRuns = 0;
	for (const run of report.runs) {
		const exceptions = runExceptions(run);
		if (exceptions.length === 0) continue;
		exceptionRuns += 1;
		lines.push(`- seed ${run.seed} ${run.archetypeId}/${run.bot}: ${exceptions.join('; ')}`);
	}
	if (exceptionRuns === 0) lines.push('- none');
	lines.push('');
	return lines.join('\n');
}
