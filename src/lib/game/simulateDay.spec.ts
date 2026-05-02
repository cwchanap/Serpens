import { describe, expect, test } from 'vitest';
import { createNewGame, updatePolicy } from './state';
import { simulateDay } from './simulateDay';

describe('daily simulation', () => {
	test('advances one day deterministically for the same seed and actions', () => {
		expect.assertions(4);
		const first = simulateDay(createNewGame('convenience', 2026));
		const second = simulateDay(createNewGame('convenience', 2026));

		expect(first.day).toBe(2);
		expect(first.cash).toBe(second.cash);
		expect(first.reports[0]?.netIncome).toBe(second.reports[0]?.netIncome);
		expect(first.rngState).toBe(second.rngState);
	});

	test('premium pricing improves gross margin but can reduce customers served', () => {
		expect.assertions(2);
		const base = createNewGame('boutique', 900);
		const standard = simulateDay(updatePolicy(base, { pricing: 'standard' }));
		const premium = simulateDay(updatePolicy(base, { pricing: 'premium' }));

		expect(premium.reports[0]?.grossMargin).toBeGreaterThan(standard.reports[0]?.grossMargin ?? 0);
		expect(premium.reports[0]?.storeReports[0]?.customersServed).toBeLessThanOrEqual(
			standard.reports[0]?.storeReports[0]?.customersServed ?? 0
		);
	});

	test('lean inventory can create stock warnings', () => {
		expect.assertions(1);
		const game = updatePolicy(createNewGame('grocery', 10), { inventory: 'lean' });
		const result = simulateDay({
			...game,
			stores: game.stores.map((store) => ({ ...store, stockHealth: 18 }))
		});

		expect(result.reports[0]?.warnings.some((warning) => warning.includes('stock'))).toBe(true);
	});

	test('warnings use post-day store health', () => {
		expect.assertions(2);
		const game = updatePolicy(createNewGame('convenience', 41), {
			staffing: 'minimal',
			service: 'speed'
		});
		const result = simulateDay({
			...game,
			stores: game.stores.map((store) => ({
				...store,
				localDemand: 30,
				stockHealth: 80,
				staffCapacity: 100,
				staffMorale: 37,
				managerQuality: 0
			}))
		});
		const report = result.reports[0]?.storeReports[0];

		expect(report?.staffMorale).toBeLessThan(30);
		expect(report?.warnings.some((warning) => warning.includes('staff'))).toBe(true);
	});

	test('resumes persisted rng state across sequential days', () => {
		expect.assertions(1);
		const initial = updatePolicy(createNewGame('electronics', 1234), {
			inventory: 'generous',
			marketing: 'promotions',
			pricing: 'competitive'
		});
		const resumed = simulateDay(simulateDay(initial));
		const sequential = [simulateDay, simulateDay].reduce((state, step) => step(state), initial);

		expect(resumed).toEqual(sequential);
	});
});
