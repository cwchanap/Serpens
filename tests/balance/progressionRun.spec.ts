import { describe, expect, it } from 'vitest';
import { parseProgressionSweepArgs } from './progressionRun';

describe('parseProgressionSweepArgs', () => {
	it('accepts literal integer seeds and days', () => {
		expect(
			parseProgressionSweepArgs(['--seeds', '20260501,20260502', '--days', '365'])
		).toMatchObject({ seeds: [20260501, 20260502], days: 365 });
	});

	it('rejects scientific notation, decimals, negative, and empty seeds', () => {
		for (const seed of ['2.02605e+07', '7.0', '-7', '']) {
			expect(() =>
				parseProgressionSweepArgs(['--seeds', seed, '--days', '365'])
			).toThrow(/--seeds expects a positive integer/);
		}
	});

	it('rejects scientific notation for the days horizon', () => {
		expect(() =>
			parseProgressionSweepArgs(['--seeds', '20260501', '--days', '3e2'])
		).toThrow(/--days expects a positive integer/);
	});
});
