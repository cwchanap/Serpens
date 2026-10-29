/**
 * Progression calibration measurement stage (HPA-318 Step 4). Pure
 * aggregation over opt-in `progression` bot runs and `idle` negative-control
 * runs: per-tier claim-day distributions (p10/median/p90 among reached runs,
 * never-claimed reported distinctly), blockers, seed-level outliers, credit
 * utilization, and the tier-1 non-decorative check against idle founding
 * peaks. Plain JSON-safe data only — no timestamps, durations, or machine
 * paths — so a sweep artifact serializes byte-identically for the same runs.
 */

import { getCompanyBookValue } from '$lib/game/companyBookValue';
import { evaluateProgression, PROGRESSION_TIERS } from '$lib/game/progression';
import type { ArchetypeId, GameState, ProgressionTierId } from '$lib/game/types';
import type { ProgressionRunResult } from './bots';

/**
 * Linear-interpolation quantile on the (n − 1) positional grid: q(sample, 0.5)
 * is the median; empty samples report null instead of inventing a value.
 */
export function quantile(sample: readonly number[], q: number): number | null {
	if (sample.length === 0) return null;
	const sorted = [...sample].sort((left, right) => left - right);
	const position = (sorted.length - 1) * q;
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	if (lower === upper) return sorted[lower]!;
	return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (position - lower);
}

export function median(sample: readonly number[]): number | null {
	return quantile(sample, 0.5);
}

function minMedianMax(sample: readonly number[]): { min: number; median: number; max: number } {
	const sorted = [...sample].sort((left, right) => left - right);
	return {
		min: sorted[0]!,
		median: median(sorted)!,
		max: sorted[sorted.length - 1]!
	};
}

export interface ProgressionRunSummary {
	seed: number;
	archetypeId: ArchetypeId;
	claims: { tierId: ProgressionTierId; claimedOnDay: number }[];
	finalCash: number;
	finalDebt: number;
	finalBookValue: number;
	/** Max `companyBookValueAfter` over the run's daily reports. */
	peakBookValue: number;
	storeCount: number;
	openedCityCount: number;
	maxStoreLevel: number;
	/** Run-to-date delivered units of the authored tier-3 product set. */
	finalLocalUnits: number;
	borrowCount: number;
	totalBorrowed: number;
	maxSingleBorrow: number;
	/** Borrow count keyed by `claims.length` at borrow time. */
	borrowCountByClaimsAtBorrow: Record<string, number>;
	repaidCount: number;
	totalRepaid: number;
	/**
	 * For every unclaimed tier: the goal ids still failing at the final state
	 * (the claim fixed point makes these the honest per-run blockers).
	 */
	unclaimedTierGoalIds: Record<string, string[]>;
}

export function summarizeProgressionRun(
	seed: number,
	archetypeId: ArchetypeId,
	result: ProgressionRunResult
): ProgressionRunSummary {
	const { game, progression } = result;
	const evaluation = evaluateProgression(game);
	const unclaimedTierGoalIds: Record<string, string[]> = {};
	for (const tier of evaluation.tiers) {
		if (tier.claimed) continue;
		unclaimedTierGoalIds[tier.tier.id] = tier.goals
			.filter((goal) => !goal.passes)
			.map((goal) => goal.goal.id);
	}
	const localUnitsGoal = evaluation.tiers
		.find((tier) => tier.tier.id === 'regional-supplier')
		?.goals.find((goal) => goal.goal.id === 'regional-supplier-local-units');
	return {
		seed,
		archetypeId,
		claims: progression.claims.map((claim) => ({ ...claim })),
		finalCash: game.cash,
		finalDebt: game.finance.loans.reduce(
			(total, loan) => total + Math.max(0, loan.remainingPrincipal),
			0
		),
		finalBookValue: getCompanyBookValue(game).total,
		peakBookValue: game.reports.reduce(
			(peak, report) => Math.max(peak, report.companyBookValueAfter),
			0
		),
		storeCount: game.stores.length,
		openedCityCount: game.world.openedCityIds.length,
		maxStoreLevel: game.stores.reduce((level, store) => Math.max(level, store.level), 0),
		finalLocalUnits:
			localUnitsGoal && typeof localUnitsGoal.evidence.actual === 'number'
				? localUnitsGoal.evidence.actual
				: 0,
		borrowCount: progression.creditEvents.length,
		totalBorrowed: progression.creditEvents.reduce((total, event) => total + event.amount, 0),
		maxSingleBorrow: progression.creditEvents.reduce(
			(max, event) => Math.max(max, event.amount),
			0
		),
		borrowCountByClaimsAtBorrow: progression.creditEvents.reduce<Record<string, number>>(
			(counts, event) => {
				const key = String(event.claimsAtBorrow);
				counts[key] = (counts[key] ?? 0) + 1;
				return counts;
			},
			{}
		),
		repaidCount: progression.repayments.length,
		totalRepaid: progression.repayments.reduce((total, event) => total + event.amount, 0),
		unclaimedTierGoalIds
	};
}

export interface IdleRunSummary {
	seed: number;
	archetypeId: ArchetypeId;
	claimCount: number;
	/** Book value right after founding (cash − founding debt; founding store free). */
	foundingBookValue: number;
	/** Max `companyBookValueAfter` over the idle run's daily reports. */
	peakReportBookValue: number;
	finalBookValue: number;
}

export function summarizeIdleRun(
	seed: number,
	archetypeId: ArchetypeId,
	founded: GameState,
	idleGame: GameState
): IdleRunSummary {
	return {
		seed,
		archetypeId,
		claimCount: idleGame.progression.claims.length,
		foundingBookValue: getCompanyBookValue(founded).total,
		peakReportBookValue: idleGame.reports.reduce(
			(peak, report) => Math.max(peak, report.companyBookValueAfter),
			0
		),
		finalBookValue: getCompanyBookValue(idleGame).total
	};
}

export interface TierClaimCalibration {
	tierId: ProgressionTierId;
	total: number;
	reached: number;
	neverClaimed: number;
	claimDayMin: number | null;
	claimDayP10: number | null;
	claimDayMedian: number | null;
	claimDayP90: number | null;
	claimDayMax: number | null;
	neverClaimedByArchetype: Record<string, number>;
	/** Failing goal id → run count among the runs that never claimed the tier. */
	blockerGoalCounts: Record<string, number>;
	/** Reached runs whose claim day lands strictly after the tier's p90. */
	outliers: { seed: number; archetypeId: ArchetypeId; claimedOnDay: number }[];
}

export function calibrateTier(
	tierId: ProgressionTierId,
	runs: readonly ProgressionRunSummary[]
): TierClaimCalibration {
	const claimDays = runs.flatMap((run) =>
		run.claims.filter((claim) => claim.tierId === tierId).map((claim) => claim.claimedOnDay)
	);
	const neverClaimedRuns = runs.filter(
		(run) => !run.claims.some((claim) => claim.tierId === tierId)
	);
	const neverClaimedByArchetype: Record<string, number> = {};
	const blockerGoalCounts: Record<string, number> = {};
	for (const run of neverClaimedRuns) {
		neverClaimedByArchetype[run.archetypeId] = (neverClaimedByArchetype[run.archetypeId] ?? 0) + 1;
		for (const goalId of run.unclaimedTierGoalIds[tierId] ?? []) {
			blockerGoalCounts[goalId] = (blockerGoalCounts[goalId] ?? 0) + 1;
		}
	}
	const claimDayP90 = quantile(claimDays, 0.9);
	return {
		tierId,
		total: runs.length,
		reached: claimDays.length,
		neverClaimed: neverClaimedRuns.length,
		claimDayMin: claimDays.length > 0 ? Math.min(...claimDays) : null,
		claimDayP10: quantile(claimDays, 0.1),
		claimDayMedian: median(claimDays),
		claimDayP90,
		claimDayMax: claimDays.length > 0 ? Math.max(...claimDays) : null,
		neverClaimedByArchetype,
		blockerGoalCounts,
		outliers:
			claimDayP90 === null
				? []
				: runs.flatMap((run) =>
						run.claims
							.filter((claim) => claim.tierId === tierId && claim.claimedOnDay > claimDayP90)
							.map((claim) => ({
								seed: run.seed,
								archetypeId: run.archetypeId,
								claimedOnDay: claim.claimedOnDay
							}))
					)
	};
}

export interface CreditCalibration {
	runsUsingCredit: number;
	borrowCount: number;
	totalBorrowed: number;
	maxSingleBorrow: number;
	/** Borrow count keyed by `claims.length` at borrow time. */
	borrowCountByClaimsAtBorrow: Record<string, number>;
	repaidCount: number;
	totalRepaid: number;
}

export function calibrateCredit(runs: readonly ProgressionRunSummary[]): CreditCalibration {
	const borrowCountByClaimsAtBorrow: Record<string, number> = {};
	for (const run of runs) {
		for (const [key, count] of Object.entries(run.borrowCountByClaimsAtBorrow)) {
			borrowCountByClaimsAtBorrow[key] = (borrowCountByClaimsAtBorrow[key] ?? 0) + count;
		}
	}
	return {
		runsUsingCredit: runs.filter((run) => run.borrowCount > 0).length,
		borrowCount: runs.reduce((total, run) => total + run.borrowCount, 0),
		totalBorrowed: runs.reduce((total, run) => total + run.totalBorrowed, 0),
		maxSingleBorrow: runs.reduce((max, run) => Math.max(max, run.maxSingleBorrow), 0),
		borrowCountByClaimsAtBorrow,
		repaidCount: runs.reduce((total, run) => total + run.repaidCount, 0),
		totalRepaid: runs.reduce((total, run) => total + run.totalRepaid, 0)
	};
}

export interface IdleControlCalibration {
	runs: number;
	zeroClaimRuns: number;
	totalClaims: number;
	foundingBookValue: { min: number; median: number; max: number };
	peakReportBookValue: { min: number; median: number; max: number };
	finalBookValue: { min: number; median: number; max: number };
}

export function calibrateIdle(runs: readonly IdleRunSummary[]): IdleControlCalibration {
	return {
		runs: runs.length,
		zeroClaimRuns: runs.filter((run) => run.claimCount === 0).length,
		totalClaims: runs.reduce((total, run) => total + run.claimCount, 0),
		foundingBookValue: minMedianMax(runs.map((run) => run.foundingBookValue)),
		peakReportBookValue: minMedianMax(runs.map((run) => run.peakReportBookValue)),
		finalBookValue: minMedianMax(runs.map((run) => run.finalBookValue))
	};
}

export interface ProgressionCalibrationConfig {
	seeds: number[];
	days: number;
	archetypes: ArchetypeId[];
}

export interface ProgressionCalibrationReport {
	config: ProgressionCalibrationConfig & { quantileMethod: string };
	progressionRuns: number;
	idleRuns: number;
	tiers: TierClaimCalibration[];
	credit: CreditCalibration;
	idle: IdleControlCalibration;
	/** Tier-1 peak target vs the idle set's maximum observed book value. */
	tier1NonDecorative: {
		idlePeakReportBookValueMax: number;
		tier1PeakTarget: number;
		passes: boolean;
	};
	finalBookValue: { min: number; median: number; max: number };
	finalStoreCount: { min: number; median: number; max: number };
	/** Per-run rows so seed-level outliers and per-archetype coverage are
	 * auditable straight from the artifact. */
	runs: ProgressionRunSummary[];
}

export function buildProgressionCalibrationReport(
	config: ProgressionCalibrationConfig,
	progressionRuns: readonly ProgressionRunSummary[],
	idleRuns: readonly IdleRunSummary[]
): ProgressionCalibrationReport {
	const idle = calibrateIdle(idleRuns);
	const tier1 = PROGRESSION_TIERS[0]!;
	const tier1PeakTarget = tier1.goals.find((goal) => goal.id === 'local-shop-peak-book-value')!
		.target as number;
	return {
		config: {
			...config,
			seeds: [...config.seeds].sort((left, right) => left - right),
			quantileMethod: 'linear interpolation on the (n-1) positional grid'
		},
		progressionRuns: progressionRuns.length,
		idleRuns: idleRuns.length,
		tiers: PROGRESSION_TIERS.map((tier) => calibrateTier(tier.id, progressionRuns)),
		credit: calibrateCredit(progressionRuns),
		idle,
		tier1NonDecorative: {
			idlePeakReportBookValueMax: idle.peakReportBookValue.max,
			tier1PeakTarget,
			passes: idle.peakReportBookValue.max < tier1PeakTarget
		},
		finalBookValue: minMedianMax(progressionRuns.map((run) => run.finalBookValue)),
		finalStoreCount: minMedianMax(progressionRuns.map((run) => run.storeCount)),
		runs: progressionRuns.map((run) => ({ ...run }))
	};
}
