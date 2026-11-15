import { describe, expect, it } from 'vitest';
import type { ArchetypeId, ProgressionTierId } from '$lib/game/types';
import { GATE_A_OFFICIAL_DAYS, SWEEP_ARCHETYPES, SWEEP_SEEDS } from './measure';
import {
	buildProgressionCalibrationReport,
	evaluateProgressionPacing,
	type IdleRunSummary,
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
		expect(evaluateProgressionPacing(input(rows, { days: 364 })).coverageComplete).toBe(false);
	});

	it('scopes verdict rows to the configured archetypes on a pilot', () => {
		const runs = SWEEP_SEEDS.map((seed) => run(seed, 'convenience'));
		const pilot = evaluateProgressionPacing(input(runs, { archetypes: ['convenience'] }));
		expect(pilot.archetypes.map((row) => row.archetypeId)).toEqual(['convenience']);
		expect(pilot.archetypes[0]?.runCount).toBe(SWEEP_SEEDS.length);
		expect(pilot.coverageComplete).toBe(false);
		expect(pilot.allPassed).toBe(false);
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

/**
 * The harness claims after its final `advanceDay`, so a 365-day run can record
 * a receipt on game day 366 (`runProgressionBot` → `claimNewlyEarnedTiers`).
 * The approved gates are "by day 365", so a receipt after `config.days` is
 * terminal evidence, never in-window reach or spacing.
 */
function horizonRow(seed: number, day4: number, day5: number): ProgressionRunSummary {
	return {
		...run(seed, 'boutique'),
		claims: [
			{ tierId: 'local-shop', claimedOnDay: 30 },
			{ tierId: 'neighborhood-chain', claimedOnDay: 80 },
			{ tierId: 'regional-supplier', claimedOnDay: 120 },
			{ tierId: 'multi-city-operator', claimedOnDay: day4 },
			{ tierId: 'market-leader', claimedOnDay: day5 }
		]
	};
}

function boutiqueRow(rows: ProgressionRunSummary[], configOverrides: Record<string, unknown> = {}) {
	const pacing = evaluateProgressionPacing(input(rows, configOverrides));
	return pacing.archetypes.find((row) => row.archetypeId === 'boutique')!;
}

describe('evaluateProgressionPacing horizon boundary', () => {
	it('does not let a day-366 receipt supply 365-day reach or a paired gap', () => {
		const rows = [
			...Array.from({ length: 4 }, (_, index) => horizonRow(index + 1, 190, 210)),
			...Array.from({ length: 6 }, (_, index) => horizonRow(index + 5, 300, 366))
		];
		const boutique = boutiqueRow(rows);
		expect(boutique.tier5Reached).toBe(4);
		expect(boutique.tier5Passed).toBe(false);
		expect(boutique.pairedGapMedian).toBe(20);
		expect(boutique.spacingPassed).toBe(false);
	});

	it('counts a day-365 receipt and rejects day 366 on the official horizon', () => {
		const rows = [
			...Array.from({ length: 5 }, (_, index) => horizonRow(index + 1, 335, 365)),
			...Array.from({ length: 5 }, (_, index) => horizonRow(index + 6, 335, 366))
		];
		const boutique = boutiqueRow(rows);
		expect(boutique.tier5Reached).toBe(5);
		expect(boutique.pairedGapMedian).toBe(30);
	});

	it('applies the configured partial horizon instead of a fixed 365 days', () => {
		const rows = [
			...Array.from({ length: 4 }, (_, index) => horizonRow(index + 1, 150, 200)),
			...Array.from({ length: 6 }, (_, index) => horizonRow(index + 5, 150, 201))
		];
		const boutique = boutiqueRow(rows, { days: 200 });
		expect(boutique.tier5Reached).toBe(4);
		expect(boutique.pairedGapMedian).toBe(50);
	});

	it('does not use a same-day day-366 T4/T5 pair as a spacing sample', () => {
		const rows = [horizonRow(1, 366, 366), horizonRow(2, 200, 300)];
		const boutique = boutiqueRow(rows);
		expect(boutique.tier5Reached).toBe(1);
		expect(boutique.sameDayTier4Tier5).toBe(0);
		expect(boutique.pairedGapMedian).toBe(100);
	});

	it('never pairs an out-of-horizon T4 with an in-horizon T5', () => {
		const rows = [horizonRow(1, 366, 300), horizonRow(2, 200, 300)];
		const boutique = boutiqueRow(rows);
		expect(boutique.tier5Reached).toBe(2);
		expect(boutique.pairedGapMedian).toBe(100);
		expect(boutique.spacingPassed).toBe(false);
	});

	it('reports an out-of-horizon receipt as not reached in the tier table', () => {
		const idle: IdleRunSummary = {
			seed: 1,
			archetypeId: 'boutique',
			claimCount: 0,
			earnedUnclaimedClaims: 0,
			foundingBookValue: 0,
			peakReportBookValue: 0,
			finalBookValue: 0
		};
		const report = buildProgressionCalibrationReport(
			{ seeds: [1], days: 365, archetypes: ['boutique'] },
			[horizonRow(1, 366, 366)],
			[idle]
		);
		const tier = (tierId: ProgressionTierId) => report.tiers.find((row) => row.tierId === tierId)!;
		expect(tier('regional-supplier').reached).toBe(1);
		expect(tier('multi-city-operator').reached).toBe(0);
		expect(tier('market-leader').reached).toBe(0);
		expect(tier('market-leader').neverClaimed).toBe(1);
		expect(tier('market-leader').claimDayMax).toBeNull();
	});

	it('surfaces an after-horizon receipt as its own diagnostic, not a goal id', () => {
		const idle: IdleRunSummary = {
			seed: 1,
			archetypeId: 'boutique',
			claimCount: 0,
			earnedUnclaimedClaims: 0,
			foundingBookValue: 0,
			peakReportBookValue: 0,
			finalBookValue: 0
		};
		const report = buildProgressionCalibrationReport(
			{ seeds: [1], days: 365, archetypes: ['boutique'] },
			[horizonRow(1, 366, 366)],
			[idle]
		);
		const tier = (tierId: ProgressionTierId) => report.tiers.find((row) => row.tierId === tierId)!;
		expect(tier('market-leader').blockerGoalCounts).toEqual({});
		expect(tier('market-leader').claimedAfterHorizon).toEqual([
			{ seed: 1, archetypeId: 'boutique', claimedOnDay: 366 }
		]);
		expect(tier('multi-city-operator').claimedAfterHorizon).toEqual([
			{ seed: 1, archetypeId: 'boutique', claimedOnDay: 366 }
		]);
		expect(tier('local-shop').claimedAfterHorizon).toEqual([]);
	});
});
