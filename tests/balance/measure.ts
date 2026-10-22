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
	relativeError: number | null;
	withinBand: boolean;
	/** False when fewer than 14 complete days were observed — incomplete, not a pass. */
	complete: boolean;
}

export interface ForecastGroupStat {
	openings: number;
	/** Openings with a full 14-day observation window. */
	complete: number;
	/** Complete observations with |relative error| ≤ 25%. */
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
	forecastOutcomes: OpeningForecastOutcome[];
	forecastByArchetype: Record<string, ForecastGroupStat>;
	forecastByNeighborhood: Record<string, ForecastGroupStat>;
	advisorRepeatedNoOp: RepeatedNoOpMetric | null;
	producerStall: ProducerStallMetric | null;
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

/** Longest run of weekly-cadence advisor no-ops with an identical outcome+reason. */
function findRepeatedAdvisorNoOp(ledger: BotLedger): RepeatedNoOpMetric | null {
	// Only the `advisor:`-prefixed planner records count: retail-steady no-ops
	// (openStore/hireStaff/...) share the ledger's bot label during advisor runs
	// and their daily cadence would otherwise reset the weekly streak.
	const noOps = ledger.actions
		.filter(
			(action) =>
				action.bot === 'advisor' &&
				action.action.startsWith('advisor:') &&
				action.outcome === 'no-op'
		)
		.sort((a, b) => a.day - b.day);
	let best: RepeatedNoOpMetric | null = null;
	let startDay = 0;
	let streak = 0;
	let action = '';
	let detail = '';
	for (const record of noOps) {
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
 * Longest run of consecutive days with zero total industrial output, counted
 * from the first applied producer build onward (so idle runs without industry
 * never count). Reports aggregate per city, not per building; a partial stall
 * alongside a producing building is invisible at this level.
 */
function findProducerStall(reports: DailyReport[], ledger: BotLedger): ProducerStallMetric | null {
	const buildDays = ledger.actions
		.filter((action) => action.action === 'advisor:build-producer' && action.outcome === 'applied')
		.map((action) => action.day)
		.sort((a, b) => a - b);
	const firstBuildDay = buildDays[0];
	if (firstBuildDay === undefined) return null;
	let best: ProducerStallMetric | null = null;
	let startDay = 0;
	let endDay = 0; // 0 = no open zero-output run.
	for (const report of reports) {
		if (report.day < firstBuildDay) continue;
		const produced = report.productionReport.produced.reduce(
			(total, movement) => total + movement.quantity,
			0
		);
		if (produced === 0) {
			startDay = endDay !== 0 && report.day - endDay === 1 ? startDay : report.day;
			endDay = report.day;
			const days = endDay - startDay + 1;
			if (days >= PRODUCER_STALL_DAYS && (best === null || days > best.days)) {
				best = { startDay, endDay, days };
			}
		} else {
			endDay = 0;
		}
	}
	return best;
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
	for (const report of reports) {
		if (report.cashAfter < 0 && firstNegativeCashDay === null) firstNegativeCashDay = report.day;
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
		forecastOutcomes,
		forecastByArchetype: groupBy(forecastOutcomes, (outcome) => outcome.archetypeId),
		forecastByNeighborhood: groupBy(forecastOutcomes, (outcome) => outcome.neighborhood),
		advisorRepeatedNoOp: findRepeatedAdvisorNoOp(ledger),
		producerStall: findProducerStall(reports, ledger)
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
		exceptions.push(
			`producer stalled ${run.producerStall.days}d (days ${run.producerStall.startDay}-${run.producerStall.endDay})`
		);
	}
	if (run.advisorRepeatedNoOp !== null) {
		exceptions.push(
			`advisor no-op repeated ${run.advisorRepeatedNoOp.streak}x from day ${run.advisorRepeatedNoOp.startDay}: ${run.advisorRepeatedNoOp.action} (${run.advisorRepeatedNoOp.detail})`
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

export const SWEEP_REGENERATION_COMMAND =
	'bun tests/balance/run.ts --seeds 20260501,20260502,...,20260550 --days 365 --bots idle,retail-steady,advisor --output docs/balance/generated/balance-sweep';

/** Deterministic Markdown rendering of a sweep report. */
export function renderSweepMarkdown(report: SweepReport): string {
	const lines: string[] = [];
	lines.push('# HPA-502 balance sweep');
	lines.push('');
	lines.push(`- Seeds (${report.config.seeds.length}): ${report.config.seeds.join(', ')}`);
	lines.push(`- Days per run: ${report.config.days}`);
	lines.push(
		`- Ordering: seed, then archetype (${SWEEP_ARCHETYPES.join(' < ')}), then bot (${SWEEP_BOTS.join(' < ')}).`
	);
	lines.push(`- Regenerate JSON/Markdown: \`${SWEEP_REGENERATION_COMMAND}\``);
	for (const definition of BOT_DEFINITIONS) lines.push(`- Bot: ${definition}`);
	lines.push(`- ${SWEEP_DISCLOSURE}`);
	lines.push('');
	lines.push('## Per-archetype × bot aggregates');
	lines.push('');
	lines.push(
		'| archetype | bot | runs | positive 30d window by day 365 | first negative cash day | forecast within ±25% / complete / openings | stalls ≥7d | repeated advisor no-ops |'
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
	lines.push('## Per-run results');
	lines.push('');
	lines.push(
		'| seed | archetype | bot | pos7 | pos30 | negCash | minCash (day) | d30 cash | d90 cash | d365 cash | missed | stockout | waste | forecast in±25% |'
	);
	lines.push(
		'| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'
	);
	for (const run of report.runs) {
		const at = (day: (typeof CHECKPOINT_DAYS)[number]) =>
			run.checkpoints.find((checkpoint) => checkpoint.day === day)?.cash ?? null;
		const overall = groupStat(run.forecastOutcomes);
		lines.push(
			`| ${run.seed} | ${run.archetypeId} | ${run.bot} | ${fmtWindow(run.firstPositiveWindow7)} | ${fmtWindow(run.firstPositiveWindow30)} | ${run.firstNegativeCashDay ?? '-'} | ${fmtCash(run.minimumCash)} (${run.minimumCashDay ?? '-'}) | ${fmtCash(at(30))} | ${fmtCash(at(90))} | ${fmtCash(at(365))} | ${fmtPct(run.missedDemandShare)} | ${fmtPct(run.stockoutShare)} | ${run.wasteUnits}u/${fmtCash(run.wasteValue)} | ${fmtErrorStat(overall)} |`
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
