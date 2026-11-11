import { describe, expect, it } from 'vitest';
import type { ProgressionRunSummary } from './progressionCalibration';
import { diffProgressionRunRows, formatProgressionDiff } from './progressionDiff';

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

describe('diffProgressionRunRows', () => {
	it('reports field-identical rows per archetype', () => {
		const base = [row(1, 'convenience'), row(1, 'electronics', { finalCash: 5 })];
		const head = [row(1, 'convenience'), row(1, 'electronics', { finalCash: 6 })];
		const result = diffProgressionRunRows(base, head, ['convenience']);
		expect(result.comparedKeys).toBe(2);
		expect(result.identical.map((run) => run.archetypeId)).toEqual(['convenience']);
		expect(result.differing).toEqual([
			{ key: '1/electronics', archetypeId: 'electronics', fields: ['finalCash'] }
		]);
		expect(result.requireIdenticalPassed).toBe(true);
	});

	it('fails require-identical when a required archetype differs', () => {
		const result = diffProgressionRunRows(
			[row(1, 'convenience')],
			[row(1, 'convenience', { finalCash: -999 })],
			['convenience']
		);
		expect(result.requireIdenticalPassed).toBe(false);
		expect(result.requireIdenticalFailures).toEqual(['1/convenience']);
	});

	it('reports keys present in only one artifact', () => {
		const result = diffProgressionRunRows([row(1, 'convenience')], [row(2, 'convenience')]);
		expect(result.missingInHead).toEqual(['1/convenience']);
		expect(result.missingInBase).toEqual(['2/convenience']);
		expect(result.comparedKeys).toBe(0);
	});

	it('formats the verdict lines deterministically', () => {
		const result = diffProgressionRunRows(
			[row(1, 'convenience')],
			[row(1, 'convenience')],
			['convenience']
		);
		const text = formatProgressionDiff(result);
		expect(text).toContain('convenience: 1 identical, 0 differing');
		expect(text).toContain('require-identical: PASS');
	});
});
