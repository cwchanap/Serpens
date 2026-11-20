/**
 * Claim-aligned progression trace (HPA-721 missing evidence). A passive
 * observer of every production `claimEarnedTiers` evaluation plus the run's
 * persisted daily report series, serialized as plain JSON-safe data.
 *
 * Why a probe instead of more summary fields: the claim transition runs inside
 * the bot after every applied command, so the only honest place to read
 * "pre-claim store count / cap / peak / book value" is the moment before
 * `claimEarnedTiers`. The probe is read-only — it must leave digests, receipts
 * and every summary field identical (proven in the spec).
 *
 * This measures the UNCHANGED policy: no threshold, engine, seed or bot
 * decision is touched and no numeric target is proposed here.
 */

import { getCompanyBookValue, type CompanyBookValueBreakdown } from '$lib/game/companyBookValue';
import { PROGRESSION_TIERS } from '$lib/game/progression';
import type {
	ArchetypeId,
	GameState,
	ProgressionTierId,
	ProgressionTierReward
} from '$lib/game/types';
import { evaluateCondition } from '$lib/scenarios/metrics';
import type { ScenarioComparator, ScenarioCondition } from '$lib/scenarios/types';
import type { OpeningRecord, ProgressionClaimProbe, ProgressionRunResult } from './bots';
import type { ProgressionClaimRecord } from './bots';

/** Static copy of the live ladder, so an artifact is self-describing. */
export interface ProgressionClaimTraceLadder {
	id: ProgressionTierId;
	goals: {
		id: string;
		comparator: ScenarioComparator;
		target: number;
		window: ScenarioCondition['window']['kind'];
		requiresCompleteWindow: boolean;
		query: ScenarioCondition['query'];
	}[];
	reward: ProgressionTierReward;
}

/** One day of the persisted report series (peak, cash, debt and flows). */
export interface ProgressionDailyRow {
	day: number;
	peakBookValue: number;
	companyBookValueAfter: number;
	cashAfter: number;
	debtAfter: number;
	revenue: number;
	operatingCosts: number;
	payrollCost: number;
	importSpend: number;
	operatingIncome: number;
	operatingCashFlow: number;
	netIncome: number;
	principalBorrowed: number;
	principalRepaid: number;
	interestPaid: number;
	interestCapitalized: number;
	nextLoanPayment: number;
}

/**
 * One production claim evaluation. Every goal actual of the ladder is covered
 * by { stores, cities, maxLevel, peakBookValue, localUnits,
 * marketLeaderOperatingMonthPassed } against the static
 * targets in the ladder header; `bookValue` is kept on the post-advance and
 * claim-appending evaluations, where the decomposition actually gets used.
 */
export interface ProgressionClaimEvaluation {
	/** Index of the action the evaluation followed (`ledger.actions.length`). */
	actionIndex: number;
	day: number;
	/** Latest persisted report day, or null before the first daily tick. */
	reportDay: number | null;
	stores: number;
	storeCap: number;
	cities: number;
	maxLevel: number;
	peakBookValue: number;
	/** Tier-3 local-delivery units while that tier is unclaimed, else null. */
	localUnits: number | null;
	marketLeaderOperatingMonthPassed: boolean;
	claimsBefore: number;
	claimsAfter: number;
	newTierIds: ProgressionTierId[];
	bookValue: CompanyBookValueBreakdown | null;
}

export interface ProgressionClaimTraceFinal {
	day: number;
	reportDay: number | null;
	storeCount: number;
	storeCap: number;
	openedCityIds: string[];
	maxLevel: number;
	cash: number;
	debt: number;
	peakBookValue: number;
	localUnits: number | null;
	bookValue: CompanyBookValueBreakdown;
	stores: { id: string; cityId: string; tileId: string; level: number }[];
	openings: OpeningRecord[];
}

export interface ProgressionClaimTrace {
	seed: number;
	archetypeId: ArchetypeId;
	days: number;
	claims: ProgressionClaimRecord[];
	daily: ProgressionDailyRow[];
	claimEvaluations: ProgressionClaimEvaluation[];
	final: ProgressionClaimTraceFinal;
}

export interface ProgressionClaimTraceReport {
	config: { seeds: number[]; days: number; archetypes: ArchetypeId[] };
	ladder: ProgressionClaimTraceLadder[];
	runs: ProgressionClaimTrace[];
}

const TIER3_LOCAL_UNITS_GOAL = PROGRESSION_TIERS.find(
	(tier) => tier.id === 'regional-supplier'
)!.goals.find((goal) => goal.id === 'regional-supplier-local-units')!;
const PEAK_GOAL = PROGRESSION_TIERS[0]!.goals.find(
	(goal) => goal.id === 'local-shop-peak-book-value'
)!;
const MARKET_LEADER_OPERATING_MONTH_GOAL = (() => {
	const goal = PROGRESSION_TIERS.find((tier) => tier.id === 'market-leader')?.goals.find(
		(goal) => goal.id === 'market-leader-profitable-operating-month'
	);
	if (!goal) throw new Error('Missing Market Leader operating-month goal');
	return goal;
})();

/** Peak metric actual, evaluated through the production metric registry. */
function peakBookValue(game: GameState): number {
	return evaluateCondition(PEAK_GOAL, game).evidence.actual;
}

/** Tier-3 local units actual while unclaimed; null once the receipt exists. */
function localUnits(game: GameState): number | null {
	if (game.progression.claims.some((claim) => claim.tierId === 'regional-supplier')) return null;
	const actual = evaluateCondition(TIER3_LOCAL_UNITS_GOAL, game).evidence.actual;
	return typeof actual === 'number' ? actual : 0;
}

export function progressionClaimTraceLadder(): ProgressionClaimTraceLadder[] {
	return PROGRESSION_TIERS.map((tier) => ({
		id: tier.id,
		goals: tier.goals.map((goal) => ({
			id: goal.id,
			comparator: goal.comparator,
			target: goal.target,
			window: goal.window.kind,
			requiresCompleteWindow: goal.requiresCompleteWindow === true,
			query: goal.query
		})),
		reward: { ...tier.reward }
	}));
}

function dailyRows(reports: GameState['reports']): ProgressionDailyRow[] {
	// Same definition as the `peak-company-book-value` metric: a running max
	// over the report series, never clamped at 0 (book value may be negative).
	let peak = Number.NEGATIVE_INFINITY;
	return reports.map((report) => {
		peak = Math.max(peak, report.companyBookValueAfter);
		return {
			day: report.day,
			peakBookValue: peak,
			companyBookValueAfter: report.companyBookValueAfter,
			cashAfter: report.cashAfter,
			debtAfter: report.outstandingPrincipalAfter,
			revenue: report.revenue,
			operatingCosts: report.operatingCosts,
			payrollCost: report.payrollCost,
			importSpend: report.importSpend,
			operatingIncome: report.operatingIncome,
			operatingCashFlow: report.operatingCashFlow,
			netIncome: report.netIncome,
			principalBorrowed: report.principalBorrowed,
			principalRepaid: report.principalRepaid,
			interestPaid: report.interestPaid,
			interestCapitalized: report.interestCapitalized,
			nextLoanPayment: report.nextLoanPayment?.amount ?? 0
		};
	});
}

export function createProgressionClaimTraceCollector(): {
	probe: ProgressionClaimProbe;
	build(
		seed: number,
		archetypeId: ArchetypeId,
		days: number,
		result: ProgressionRunResult
	): ProgressionClaimTrace;
} {
	const evaluations: ProgressionClaimEvaluation[] = [];
	let lastReportDay: number | null = null;
	// The peak metric is a pure function of the report series, so it only
	// changes when a new daily report lands — not between intra-day commands.
	let peakCache: { reportDay: number | null; value: number } | null = null;
	const peakFor = (game: GameState): number => {
		const reportDay = game.reports.at(-1)?.day ?? null;
		if (peakCache === null || peakCache.reportDay !== reportDay) {
			peakCache = { reportDay, value: peakBookValue(game) };
		}
		return peakCache.value;
	};

	return {
		probe(before, after, actionIndex) {
			const reportDay = before.reports.at(-1)?.day ?? null;
			const dayAdvanced = reportDay !== lastReportDay;
			lastReportDay = reportDay;
			const claimsBefore = before.progression.claims.length;
			const newClaims = after.progression.claims.slice(claimsBefore);
			evaluations.push({
				actionIndex,
				day: before.day,
				reportDay,
				stores: before.stores.length,
				storeCap: before.storeCap,
				cities: before.world.openedCityIds.length,
				maxLevel: before.stores.reduce((level, store) => Math.max(level, store.level), 0),
				peakBookValue: peakFor(before),
				localUnits: localUnits(before),
				marketLeaderOperatingMonthPassed: evaluateCondition(
					MARKET_LEADER_OPERATING_MONTH_GOAL,
					before
				).passes,
				claimsBefore,
				claimsAfter: after.progression.claims.length,
				newTierIds: newClaims.map((claim) => claim.tierId),
				bookValue: dayAdvanced || newClaims.length > 0 ? getCompanyBookValue(before) : null
			});
		},
		build(seed, archetypeId, days, result) {
			const { game, ledger, progression } = result;
			// Drain the accumulator so reusing this collector for another run
			// cannot mix runs; the report-day peak cache resets with it.
			const claimEvaluations = evaluations.splice(0);
			lastReportDay = null;
			peakCache = null;
			const bookValue = getCompanyBookValue(game);
			return {
				seed,
				archetypeId,
				days,
				claims: progression.claims.map((claim) => ({ ...claim })),
				daily: dailyRows(game.reports),
				claimEvaluations,
				final: {
					day: game.day,
					reportDay: game.reports.at(-1)?.day ?? null,
					storeCount: game.stores.length,
					storeCap: game.storeCap,
					openedCityIds: [...game.world.openedCityIds],
					maxLevel: game.stores.reduce((level, store) => Math.max(level, store.level), 0),
					cash: game.cash,
					debt: bookValue.debt,
					peakBookValue: peakFor(game),
					localUnits: localUnits(game),
					bookValue,
					stores: game.stores.map((store) => ({
						id: store.id,
						cityId: store.cityId,
						tileId: store.tileId,
						level: store.level
					})),
					openings: ledger.openings.map((opening) => ({ ...opening }))
				}
			};
		}
	};
}

export function buildProgressionClaimTraceReport(
	config: { seeds: number[]; days: number; archetypes: ArchetypeId[] },
	runs: readonly ProgressionClaimTrace[]
): ProgressionClaimTraceReport {
	return {
		config: { ...config, seeds: [...config.seeds].sort((left, right) => left - right) },
		ladder: progressionClaimTraceLadder(),
		runs: runs.map((run) => ({ ...run }))
	};
}
