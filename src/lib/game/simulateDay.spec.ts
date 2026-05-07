import { describe, expect, test } from 'vitest';
import { generateDecisions } from './events';
import { createNewGame, updatePolicy } from './state';
import { simulateDay } from './simulateDay';
import type { DecisionItem, GameState } from './types';

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
				staffMorale: 35,
				managerQuality: 0
			}))
		});
		const report = result.reports[0]?.storeReports[0];

		expect(report?.staffMorale).toBeLessThan(30);
		expect(report?.warnings.some((warning) => warning.includes('staff'))).toBe(true);
	});

	test('resumes persisted rng state across sequential days', () => {
		expect.assertions(6);
		const initial = updatePolicy(createNewGame('electronics', 1234), {
			inventory: 'generous',
			marketing: 'promotions',
			pricing: 'competitive'
		});
		const uninterruptedDayOne = simulateDay(initial);
		const uninterruptedDayTwo = simulateDay(uninterruptedDayOne);
		const persistedDayOne = JSON.parse(JSON.stringify(uninterruptedDayOne)) as GameState;
		const resumedDayTwo = simulateDay(persistedDayOne);
		const staleRngDayTwo = simulateDay({
			...persistedDayOne,
			rngState: initial.rngState
		});

		expect(resumedDayTwo.day).toBe(uninterruptedDayTwo.day);
		expect(resumedDayTwo.rngState).toBe(uninterruptedDayTwo.rngState);
		expect(resumedDayTwo.cash).toBe(uninterruptedDayTwo.cash);
		expect(resumedDayTwo.reports[1]?.netIncome).toBe(uninterruptedDayTwo.reports[1]?.netIncome);
		expect(resumedDayTwo.reports[1]?.storeReports).toEqual(
			uninterruptedDayTwo.reports[1]?.storeReports
		);
		expect(staleRngDayTwo.reports[1]?.storeReports).not.toEqual(
			uninterruptedDayTwo.reports[1]?.storeReports
		);
	});

	test('removes expired decisions after a simulated day', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 55);
		const expiredDecision: DecisionItem = {
			id: 'expired',
			title: 'Expired',
			context: 'No longer relevant.',
			expiresOnDay: game.day,
			options: []
		};

		const result = simulateDay({ ...game, decisions: [expiredDecision] });

		expect(result.decisions.some((decision) => decision.id === expiredDecision.id)).toBe(false);
	});

	test('preserves non-expired existing decisions after a simulated day', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 56);
		const activeDecision: DecisionItem = {
			id: 'active',
			title: 'Active',
			context: 'Still relevant.',
			expiresOnDay: game.day + 2,
			options: []
		};

		const result = simulateDay({ ...game, decisions: [activeDecision] });

		expect(result.decisions.some((decision) => decision.id === activeDecision.id)).toBe(true);
	});

	test('generates decisions from the returned post-day rng state', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 1);
		const activeDecision: DecisionItem = {
			id: 'active',
			title: 'Active',
			context: 'Still relevant.',
			expiresOnDay: game.day + 2,
			options: []
		};
		const result = simulateDay({ ...game, decisions: [activeDecision] });
		const preservedDecisions = result.decisions.filter(
			(decision) => decision.id === activeDecision.id
		);
		const generatedDecisions = result.decisions.filter(
			(decision) => !preservedDecisions.some((preserved) => preserved.id === decision.id)
		);

		expect(generatedDecisions).toEqual(
			generateDecisions({
				...result,
				decisions: preservedDecisions
			})
		);
	});

	test('charges monthly payroll on payroll days only', () => {
		expect.assertions(5);
		const baseGame = {
			...createNewGame('convenience', 90),
			cash: 50_000,
			reports: []
		};
		const payroll = baseGame.staff.reduce((sum, member) => sum + member.monthlySalary, 0);
		const payrollDay = simulateDay({ ...baseGame, day: 30 });
		const nonPayrollDay = simulateDay({ ...baseGame, day: 29 });

		expect(payrollDay.reports[0]?.payrollCost).toBe(payroll);
		expect(nonPayrollDay.reports[0]?.payrollCost).toBe(0);
		expect(payrollDay.cash).toBeLessThan(nonPayrollDay.cash);
		expect(payrollDay.reports[0]?.operatingCosts).toBeGreaterThan(
			nonPayrollDay.reports[0]?.operatingCosts ?? 0
		);
		expect(payroll).toBeGreaterThan(0);
	});

	test('understaffing reduces served demand and reports role shortages', () => {
		expect.assertions(6);
		const baseGame = updatePolicy(createNewGame('grocery', 91), {
			pricing: 'discount',
			inventory: 'generous',
			marketing: 'promotions'
		});
		const stores = baseGame.stores.map((store) => ({
			...store,
			localDemand: 220,
			stockHealth: 100,
			staffCapacity: 100,
			staffMorale: 85
		}));
		const staffed = simulateDay({
			...baseGame,
			stores,
			staff: baseGame.staff.map((member) => ({ ...member, skill: 88, morale: 82 }))
		});
		const understaffed = simulateDay({
			...baseGame,
			stores,
			staff: baseGame.staff
				.filter((member) => member.role === 'manager')
				.map((member) => ({ ...member, skill: 88, morale: 82 }))
		});
		const staffedReport = staffed.reports[0]?.storeReports[0];
		const understaffedReport = understaffed.reports[0]?.storeReports[0];

		expect(understaffedReport?.customersServed).toBeLessThan(staffedReport?.customersServed ?? 0);
		expect(understaffedReport?.staffingCoverage).toBeLessThan(100);
		expect(understaffedReport?.staffingShortage).toEqual({ manager: 0, general: 3 });
		expect(understaffedReport?.warnings).toContain('Grocery Market is short 3 general staff');
		expect(understaffedReport?.staffMorale).toBeLessThan(staffedReport?.staffMorale ?? 0);
		expect(staffedReport?.staffingCoverage).toBe(100);
	});
});
