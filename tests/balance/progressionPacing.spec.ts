import { describe, expect, it } from 'vitest';
import type { ArchetypeId, ProgressionTierId } from '$lib/game/types';
import { GATE_A_OFFICIAL_DAYS, SWEEP_ARCHETYPES, SWEEP_SEEDS } from './measure';
import {
	evaluateProgressionPacing,
	type ProgressionCalibrationReport,
	type ProgressionRunSummary
} from './progressionCalibration';

function run(seed: number, archetypeId: ArchetypeId): ProgressionRunSummary {
	const claims: { tierId: ProgressionTierId; claimedOnDay: number }[] = [
		{ tierId: 'local-shop', claimedOnDay: 30 },
		{ tierId: 'neighborhood-chain', claimedOnDay: 80 },
		{ tierId: 'regional-supplier', claimedOnDay: 120 },
		{ tierId: 'multi-city-operator', claimedOnDay: 170 },
		{ tierId: 'market-leader', claimedOnDay: 210 }
	];
	return {
		seed,
		archetypeId,
		claims,
		finalCash: 100,
		finalDebt: 0,
		finalBookValue: 100_000,
		peakBookValue: 100_000,
		storeCount: 7,
		openedCityCount: 5,
		maxStoreLevel: 4,
		finalLocalUnits: 25,
		borrowCount: 0,
		totalBorrowed: 0,
		maxSingleBorrow: 0,
		borrowCountByClaimsAtBorrow: {},
		repaidCount: 0,
		totalRepaid: 0,
		unclaimedTierGoalIds: {}
	};
}

function completeRuns(): ProgressionRunSummary[] {
	return SWEEP_SEEDS.flatMap((seed) => SWEEP_ARCHETYPES.map((archetype) => run(seed, archetype)));
}

/** Evaluator consumes only the report's config, counts, idle count and per-run summaries. */
function input(
	runs: ProgressionRunSummary[],
	configOverrides: Record<string, unknown> = {}
): ProgressionCalibrationReport {
	return {
		config: {
			seeds: [...SWEEP_SEEDS],
			archetypes: [...SWEEP_ARCHETYPES],
			days: GATE_A_OFFICIAL_DAYS,
			...configOverrides
		},
		progressionRuns: runs.length,
		idleRuns: runs.length,
		idle: { runs: runs.length },
		runs
	} as unknown as ProgressionCalibrationReport;
}

describe('evaluateProgressionPacing', () => {
	it('accepts a complete official matrix with spaced, reachable claims', () => {
		const result = evaluateProgressionPacing(input(completeRuns()));
		expect(result.coverageComplete).toBe(true);
		expect(result.allPassed).toBe(true);
		expect(result.peakBookValueRatio).toBe(1);
		for (const row of result.archetypes) {
			expect(row.tier3Reached).toBe(50);
			expect(row.tier3MedianDay).toBe(120);
			expect(row.tier5Reached).toBe(50);
			expect(row.pairedGapMedian).toBe(40);
			expect(row.sameDayTier4Tier5).toBe(0);
		}
	});

	it('cannot claim an official pass on a pilot or a duplicate/missing pair', () => {
		const rows = completeRuns();
		const partial = evaluateProgressionPacing(input(rows.slice(0, 4)));
		expect(partial.coverageComplete).toBe(false);
		expect(partial.allPassed).toBe(false);
		const duplicated = [...rows.slice(0, -1), { ...rows[0]! }];
		expect(evaluateProgressionPacing(input(duplicated)).coverageComplete).toBe(false);
		expect(
			evaluateProgressionPacing(input(rows, { days: 364 })).coverageComplete
		).toBe(false);
	});

	it('treats an absent Tier 5 as a failed, not vacuously passing, spacing gate', () => {
		const rows = completeRuns().map((entry) =>
			entry.archetypeId === 'grocery'
				? { ...entry, claims: entry.claims.filter((claim) => claim.tierId !== 'market-leader') }
				: entry
		);
		const result = evaluateProgressionPacing(input(rows));
		const grocery = result.archetypes.find((row) => row.archetypeId === 'grocery')!;
		expect(grocery.tier5Reached).toBe(0);
		expect(grocery.pairedGapMedian).toBeNull();
		expect(grocery.tier5Passed).toBe(false);
		expect(grocery.spacingPassed).toBe(false);
		expect(result.allPassed).toBe(false);
	});

	it('reports same-day Tier 4 and 5 claims, failing the paired-gap gate', () => {
		const rows = completeRuns().map((entry) => ({
			...entry,
			claims: entry.claims.map((claim) =>
				claim.tierId === 'market-leader' ? { ...claim, claimedOnDay: 170 } : claim
			)
		}));
		const result = evaluateProgressionPacing(input(rows));
		expect(result.archetypes[0]?.sameDayTier4Tier5).toBe(50);
		expect(result.archetypes[0]?.pairedGapMedian).toBe(0);
		expect(result.archetypes[0]?.spacingPassed).toBe(false);
		expect(result.allPassed).toBe(false);
	});

	it('rejects a non-positive median peak value instead of dividing by zero', () => {
		let convenienceCount = 0;
		const rows = completeRuns().map((entry) => {
			if (entry.archetypeId !== 'convenience') return entry;
			convenienceCount += 1;
			return { ...entry, peakBookValue: convenienceCount <= 26 ? 0 : 100_000 };
		});
		const result = evaluateProgressionPacing(input(rows));
		expect(result.archetypes[0]?.medianPeakBookValue).toBe(0);
		expect(result.peakBookValueRatio).toBeNull();
		expect(result.equityPassed).toBe(false);
		expect(result.allPassed).toBe(false);
	});
});
