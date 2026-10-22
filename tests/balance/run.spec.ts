/**
 * Balance-harness CLI specs (HPA-502 Stage 3, promised in the Task 2 brief
 * but only runnable once the server Vitest project picked up tests/**).
 */
import { describe, expect, it } from 'vitest';
import { main, parseBalanceSweepArgs } from './run';

describe('parseBalanceSweepArgs', () => {
	it('parses a full explicit sweep invocation', () => {
		const options = parseBalanceSweepArgs([
			'--seeds',
			'20260501,20260502,20260503',
			'--days',
			'365',
			'--bots',
			'idle,retail-steady,advisor',
			'--output',
			'docs/balance/generated/balance-sweep'
		]);
		expect(options).toEqual({
			seeds: [20260501, 20260502, 20260503],
			days: 365,
			bots: ['idle', 'retail-steady', 'advisor'],
			output: 'docs/balance/generated/balance-sweep'
		});
	});

	it('makes --output optional', () => {
		const options = parseBalanceSweepArgs(['--seeds', '7', '--days', '30', '--bots', 'idle']);
		expect(options.output).toBeUndefined();
		expect(options).toEqual({ seeds: [7], days: 30, bots: ['idle'] });
	});

	it('rejects missing required flags with explicit errors', () => {
		expect(() => parseBalanceSweepArgs(['--days', '30', '--bots', 'idle'])).toThrow(
			/--seeds is required/
		);
		expect(() => parseBalanceSweepArgs(['--seeds', '7', '--bots', 'idle'])).toThrow(
			/--days is required/
		);
		expect(() => parseBalanceSweepArgs(['--seeds', '7', '--days', '30'])).toThrow(
			/--bots is required/
		);
	});

	it('rejects non-positive-integer seeds and days', () => {
		expect(() =>
			parseBalanceSweepArgs(['--seeds', 'abc', '--days', '30', '--bots', 'idle'])
		).toThrow(/--seeds expects a positive integer/);
		expect(() =>
			parseBalanceSweepArgs(['--seeds', '7,0', '--days', '30', '--bots', 'idle'])
		).toThrow(/--seeds expects a positive integer/);
		expect(() =>
			parseBalanceSweepArgs(['--seeds', '7', '--days', '1.5', '--bots', 'idle'])
		).toThrow(/--days expects a positive integer/);
	});

	it('rejects unknown flags, empty bot names, and missing flag values', () => {
		expect(() => parseBalanceSweepArgs(['--seed', '7', '--days', '30', '--bots', 'idle'])).toThrow(
			/unknown argument "--seed"/
		);
		expect(() =>
			parseBalanceSweepArgs(['--seeds', '7', '--days', '30', '--bots', 'idle,'])
		).toThrow(/--bots expects comma-separated bot names/);
		expect(() => parseBalanceSweepArgs(['--seeds', '7', '--days', '30', '--bots'])).toThrow(
			/--bots requires a value/
		);
		expect(() =>
			parseBalanceSweepArgs(['--seeds', '7', '--days', '30', '--bots', 'idle', '--output'])
		).toThrow(/--output requires a value/);
	});

	it('rejects unknown bot names before running any simulation', () => {
		expect(() => main(['--seeds', '7', '--days', '1', '--bots', 'speedrun'])).toThrow(
			/unknown bot "speedrun"/
		);
	});
});
