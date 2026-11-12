import { describe, expect, it } from 'vitest';
import type { ProgressionRunSummary } from './progressionCalibration';
import { diffProgressionArtifacts, formatProgressionDiff } from './progressionDiff';

function row(seed: number, archetypeId: string, overrides = {}): ProgressionRunSummary {
	return {
		seed,
		archetypeId: archetypeId as ProgressionRunSummary['archetypeId'],
		claims: [{ tierId: 'local-shop', claimedOnDay: 40 }],
		finalCash: -1000,
		finalDebt: 0,
		finalBookValue: 100,
		peakBookValue: 200,
		storeCount: 2,
		openedCityCount: 2,
		maxStoreLevel: 1,
		finalLocalUnits: 0,
		borrowCount: 1,
		totalBorrowed: 1000,
		maxSingleBorrow: 1000,
		borrowCountByClaimsAtBorrow: { '0': 1 },
		repaidCount: 0,
		totalRepaid: 0,
		unclaimedTierGoalIds: {},
		...overrides
	};
}

function artifact(
	runs: ProgressionRunSummary[],
	configOverrides: Record<string, unknown> = {}
): { config: unknown; runs: ProgressionRunSummary[] } {
	return {
		config: {
			seeds: runs.map((run) => run.seed),
			days: 365,
			archetypes: [...new Set(runs.map((run) => run.archetypeId))],
			...configOverrides
		},
		runs
	};
}

describe('diffProgressionArtifacts', () => {
	it('reports field-identical rows per archetype', () => {
		const base = artifact([row(1, 'convenience'), row(1, 'electronics', { finalCash: 5 })]);
		const head = artifact([row(1, 'convenience'), row(1, 'electronics', { finalCash: 6 })]);
		const result = diffProgressionArtifacts(base, head, ['convenience']);
		expect(result.comparedKeys).toBe(2);
		expect(result.identical.map((run) => run.archetypeId)).toEqual(['convenience']);
		expect(result.differing).toEqual([
			{ key: '1/electronics', archetypeId: 'electronics', fields: ['finalCash'] }
		]);
		expect(result.requireIdenticalPassed).toBe(true);
	});

	it('fails require-identical when a required archetype differs', () => {
		const result = diffProgressionArtifacts(
			artifact([row(1, 'convenience')]),
			artifact([row(1, 'convenience', { finalCash: -999 })]),
			['convenience']
		);
		expect(result.requireIdenticalPassed).toBe(false);
		expect(result.requireIdenticalFailures).toEqual(['1/convenience']);
	});

	it('fails when a required-archetype row is missing from head', () => {
		const result = diffProgressionArtifacts(
			artifact([row(1, 'convenience'), row(1, 'electronics')]),
			artifact([row(1, 'electronics')], {
				seeds: [1],
				archetypes: ['convenience', 'electronics']
			}),
			['convenience']
		);
		expect(result.missingInHead).toEqual(['1/convenience']);
		expect(result.configMismatches).toEqual([]);
		expect(result.requireIdenticalPassed).toBe(false);
		expect(result.requireIdenticalFailures).toContain('1/convenience');
	});

	it('fails on missing rows even outside the required archetypes', () => {
		const result = diffProgressionArtifacts(
			artifact([row(1, 'convenience'), row(2, 'convenience')]),
			artifact([row(1, 'convenience')], { seeds: [1, 2] }),
			['convenience']
		);
		expect(result.missingInHead).toEqual(['2/convenience']);
		expect(result.configMismatches).toEqual([]);
		expect(result.requireIdenticalPassed).toBe(false);
	});

	it('fails on duplicate keys instead of collapsing them', () => {
		const result = diffProgressionArtifacts(
			artifact([row(1, 'convenience'), row(1, 'convenience', { finalCash: -5 })]),
			artifact([row(1, 'convenience')]),
			['convenience']
		);
		expect(result.duplicateBaseKeys).toEqual(['1/convenience']);
		expect(result.requireIdenticalPassed).toBe(false);
		expect(result.requireIdenticalFailures).toContain('1/convenience');
	});

	it('fails on incompatible sweep configurations', () => {
		const result = diffProgressionArtifacts(
			artifact([row(1, 'convenience')]),
			artifact([row(1, 'convenience')], { days: 90 })
		);
		expect(result.configMismatches.length).toBeGreaterThan(0);
		expect(result.requireIdenticalPassed).toBe(false);
	});

	it('fails when a required archetype is not represented', () => {
		const result = diffProgressionArtifacts(
			artifact([row(1, 'convenience')]),
			artifact([row(1, 'convenience')]),
			['grocery']
		);
		expect(result.unrepresentedArchetypes).toEqual(['grocery']);
		expect(result.requireIdenticalPassed).toBe(false);
	});

	it('fails when the same declared rows are missing from both artifacts', () => {
		const declared = { seeds: [1, 2], archetypes: ['convenience'] };
		const result = diffProgressionArtifacts(
			artifact([row(1, 'convenience')], declared),
			artifact([row(1, 'convenience')], { ...declared }),
			['convenience']
		);
		expect(result.missingInBase).toEqual([]);
		expect(result.missingInHead).toEqual([]);
		expect(result.baseCoverage.missingKeys).toEqual(['2/convenience']);
		expect(result.headCoverage.missingKeys).toEqual(['2/convenience']);
		expect(result.requireIdenticalPassed).toBe(false);
		expect(result.requireIdenticalFailures).toContain('2/convenience');
	});

	it('fails when declared rows for a non-required archetype are missing from both artifacts', () => {
		const declared = { seeds: [1, 2], archetypes: ['convenience', 'electronics'] };
		const result = diffProgressionArtifacts(
			artifact([row(1, 'convenience'), row(2, 'convenience')], declared),
			artifact([row(1, 'convenience'), row(2, 'convenience')], { ...declared }),
			['convenience']
		);
		expect(result.missingInBase).toEqual([]);
		expect(result.missingInHead).toEqual([]);
		expect(result.baseCoverage.missingKeys).toEqual(['1/electronics', '2/electronics']);
		expect(result.headCoverage.missingKeys).toEqual(['1/electronics', '2/electronics']);
		expect(result.requireIdenticalPassed).toBe(false);
		expect(result.requireIdenticalFailures).toContain('matrix-issue:1/electronics');
	});

	it('fails on undeclared rows for a non-required archetype present in both artifacts', () => {
		const declared = { seeds: [1, 2], archetypes: ['convenience'] };
		const result = diffProgressionArtifacts(
			artifact([row(1, 'convenience'), row(2, 'electronics')], declared),
			artifact([row(1, 'convenience'), row(2, 'electronics')], { ...declared }),
			['convenience']
		);
		expect(result.baseCoverage.unexpectedKeys).toEqual(['2/electronics']);
		expect(result.requireIdenticalPassed).toBe(false);
		expect(result.requireIdenticalFailures).toContain('matrix-issue:2/electronics');
	});

	it('fails on rows outside the declared matrix in both artifacts', () => {
		const result = diffProgressionArtifacts(
			artifact([row(1, 'convenience'), row(2, 'convenience')], { seeds: [1] }),
			artifact([row(1, 'convenience'), row(2, 'convenience')], { seeds: [1] }),
			['convenience']
		);
		expect(result.missingInBase).toEqual([]);
		expect(result.missingInHead).toEqual([]);
		expect(result.baseCoverage.unexpectedKeys).toEqual(['2/convenience']);
		expect(result.headCoverage.unexpectedKeys).toEqual(['2/convenience']);
		expect(result.requireIdenticalPassed).toBe(false);
		expect(result.requireIdenticalFailures).toContain('2/convenience');
	});

	it('fails when both artifacts declare malformed configurations', () => {
		const result = diffProgressionArtifacts(
			{ config: { days: 365 }, runs: [row(1, 'convenience')] },
			{ config: { days: 365 }, runs: [row(1, 'convenience')] },
			['convenience']
		);
		expect(result.configMismatches).toEqual([]);
		expect(result.baseCoverage.configProblems.length).toBeGreaterThan(0);
		expect(result.headCoverage.configProblems.length).toBeGreaterThan(0);
		expect(result.requireIdenticalPassed).toBe(false);
	});

	it('detects fields present only on the head row', () => {
		const headRow = { ...row(1, 'convenience'), futureField: 42 } as ProgressionRunSummary;
		const result = diffProgressionArtifacts(
			artifact([row(1, 'convenience')]),
			artifact([headRow]),
			['convenience']
		);
		expect(result.differing).toEqual([
			{ key: '1/convenience', archetypeId: 'convenience', fields: ['futureField'] }
		]);
		expect(result.requireIdenticalPassed).toBe(false);
	});

	it('formats the verdict lines deterministically', () => {
		const result = diffProgressionArtifacts(
			artifact([row(1, 'convenience')]),
			artifact([row(1, 'convenience')]),
			['convenience']
		);
		const text = formatProgressionDiff(result);
		expect(text).toContain('convenience: 1 identical, 0 differing');
		expect(text).toContain('require-identical: PASS');
	});

	it('fails require-identical and reports mismatch when idle aggregate differs', () => {
		const base = {
			...artifact([row(1, 'convenience')]),
			idle: { totalRuns: 1, totalEarnedUnclaimed: 0 }
		};
		const head = {
			...artifact([row(1, 'convenience')]),
			idle: { totalRuns: 1, totalEarnedUnclaimed: 1 }
		};
		const result = diffProgressionArtifacts(base, head, ['convenience']);
		expect(result.requireIdenticalPassed).toBe(false);
		expect(result.idleControlMismatches).toEqual(['idle aggregate differs between base and head']);
		expect(result.requireIdenticalFailures).toContain(
			'idle-control:idle aggregate differs between base and head'
		);
		const text = formatProgressionDiff(result);
		expect(text).toContain('idle-control mismatch: idle aggregate differs between base and head');
		expect(text).toContain('require-identical: FAIL (1 violation(s))');
	});

	it('reports changed idle book values without failing an ordinary before/after comparison', () => {
		const base = {
			...artifact([row(1, 'convenience')]),
			idle: { totalClaims: 0, totalEarnedUnclaimed: 0, finalBookValue: { median: 40 } },
			tier1NonDecorative: { idlePeakReportBookValueMax: 42, tier1PeakTarget: 70, passes: true }
		};
		const head = {
			...artifact([row(1, 'convenience', { finalCash: 10 })]),
			idle: { totalClaims: 0, totalEarnedUnclaimed: 0, finalBookValue: { median: 30 } },
			tier1NonDecorative: { idlePeakReportBookValueMax: 45, tier1PeakTarget: 70, passes: true }
		};
		const result = diffProgressionArtifacts(base, head);
		expect(result.idleControlMismatches).toEqual([
			'idle aggregate differs between base and head',
			'tier1NonDecorative differs between base and head'
		]);
		expect(result.requireIdenticalPassed).toBe(true);
		expect(result.requireIdenticalFailures).toEqual([]);
		expect(formatProgressionDiff(result)).toContain('idle-control mismatch: idle aggregate differs');
		// Identical mode retains its strict idle checks.
		const strict = diffProgressionArtifacts(base, head, ['convenience']);
		expect(strict.requireIdenticalPassed).toBe(false);
		expect(strict.requireIdenticalFailures).toContain(
			'idle-control:idle aggregate differs between base and head'
		);
	});

	it('reports non-zero violation count in formatted verdict when config mismatches', () => {
		const result = diffProgressionArtifacts(
			artifact([row(1, 'convenience')]),
			artifact([row(1, 'convenience')], { days: 90 })
		);
		expect(result.requireIdenticalPassed).toBe(false);
		expect(result.requireIdenticalFailures.length).toBeGreaterThan(0);
		const text = formatProgressionDiff(result);
		expect(text).toMatch(/require-identical: FAIL \([1-9]\d* violation\(s\)\)/);
	});
});
