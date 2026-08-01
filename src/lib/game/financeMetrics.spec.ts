import { describe, expect, it } from 'vitest';
import { createEmptyFinanceState, createFoundingFinanceState } from './finance';
import {
	getFinanceMetrics,
	projectCashRunway,
	projectScheduledDebtService
} from './financeMetrics';
import { createNewGame } from './state';
import type { FinanceState, GameState, LoanInstrument } from './types';

function createLoan(overrides: Partial<LoanInstrument> = {}): LoanInstrument {
	const loan = createFoundingFinanceState(1, 1_000).loans[0]!;
	return { ...loan, ...overrides };
}

function createGame(
	input: {
		day?: number;
		cash?: number;
		finance?: FinanceState;
		operatingCashFlows?: number[];
	} = {}
): GameState {
	const game = createNewGame('convenience', 123);
	const day = input.day ?? game.day;
	return {
		...game,
		day,
		cash: input.cash ?? game.cash,
		finance: input.finance ?? createEmptyFinanceState(day),
		reports: (input.operatingCashFlows ?? []).map(
			(operatingCashFlow, index) =>
				({ day: index + 1, operatingCashFlow }) as GameState['reports'][number]
		)
	};
}

describe('finance metrics', () => {
	it('distinguishes outstanding principal from the full amount due and selects the earliest payment', () => {
		const finance = createEmptyFinanceState(10);
		const later = createLoan({
			id: 'loan-2',
			remainingPrincipal: 400,
			nextPaymentDay: 18,
			lastInterestAccrualDay: 10
		});
		const earlier = createLoan({
			id: 'loan-1',
			remainingPrincipal: 700,
			overduePrincipal: 50,
			overdueInterest: 20,
			accruedInterestMicros: 1_200_001,
			nextPaymentDay: 12,
			lastInterestAccrualDay: 10
		});

		const metrics = getFinanceMetrics(
			createGame({ day: 10, finance: { ...finance, loans: [later, earlier] } })
		);

		expect(metrics.outstandingPrincipal).toBe(1_100);
		expect(metrics.amountDue).toBe(1_122);
		expect(metrics.nextLoanPayment).toEqual({ loanId: 'loan-1', day: 12, amount: 154 });
	});

	it('uses only the trailing seven explicit operating-cash-flow reports', () => {
		const metrics = getFinanceMetrics(
			createGame({ operatingCashFlows: [-500, 10, 20, 30, 40, 50, 60, 70] })
		);

		expect(metrics.trailingSevenDayOperatingCashFlow).toBe(280);
		expect(metrics.averageDailyOperatingCashFlow).toBe(40);
	});

	it('projects dated D+1 through D+7 service, excluding an obligation due today', () => {
		const finance = createEmptyFinanceState(10);
		const dueToday = createLoan({
			id: 'loan-today',
			nextPaymentDay: 10,
			lastInterestAccrualDay: 9
		});
		const finalInstallment = createLoan({
			id: 'loan-final',
			originalPrincipal: 1_003,
			remainingPrincipal: 253,
			annualInterestRateBps: 3_650,
			termDays: 28,
			installmentsProcessed: 3,
			nextPaymentDay: 11,
			lastInterestAccrualDay: 10,
			accruedInterestMicros: 1_500_000
		});
		const weekEnd = createLoan({
			id: 'loan-week-end',
			originalPrincipal: 400,
			remainingPrincipal: 400,
			annualInterestRateBps: 0,
			termDays: 28,
			nextPaymentDay: 17,
			lastInterestAccrualDay: 10
		});
		const game = createGame({
			day: 10,
			finance: { ...finance, loans: [dueToday, weekEnd, finalInstallment] }
		});

		expect(projectScheduledDebtService(game, 11, 17)).toEqual([
			{ day: 11, principal: 253, interest: 2, total: 255, loanIds: ['loan-final'] },
			{ day: 17, principal: 100, interest: 0, total: 100, loanIds: ['loan-week-end'] }
		]);
		expect(getFinanceMetrics(game).scheduledDebtServiceNextSevenDays).toBe(355);
	});

	it('projects a matured delinquent payoff into D+1 coverage and runway', () => {
		const finance = createEmptyFinanceState(10);
		const game = createGame({
			day: 10,
			cash: 105,
			operatingCashFlows: [106],
			finance: {
				...finance,
				loans: [
					createLoan({
						id: 'loan-matured',
						status: 'delinquent',
						remainingPrincipal: 100,
						overduePrincipal: 100,
						overdueInterest: 5,
						accruedInterestMicros: 500_000,
						nextPaymentDay: null,
						lastInterestAccrualDay: 10,
						annualInterestRateBps: 0,
						arrearsSinceDay: 8
					})
				]
			}
		});

		expect(projectScheduledDebtService(game, 11, 17)).toEqual([
			{ day: 11, principal: 100, interest: 6, total: 106, loanIds: ['loan-matured'] }
		]);
		expect(getFinanceMetrics(game)).toMatchObject({
			scheduledDebtServiceNextSevenDays: 106,
			debtServiceCoverage: 1
		});
		expect(projectCashRunway({ ...game, reports: [] })).toEqual({ kind: 'days', days: 1 });
	});

	it('sweeps future-due arrears on D+1 without double-counting them at the later checkpoint', () => {
		const finance = createEmptyFinanceState(10);
		const game = createGame({
			day: 10,
			finance: {
				...finance,
				loans: [
					createLoan({
						id: 'loan-future-due',
						status: 'delinquent',
						remainingPrincipal: 600,
						overduePrincipal: 100,
						overdueInterest: 20,
						accruedInterestMicros: 900_000,
						nextPaymentDay: 17,
						lastInterestAccrualDay: 10,
						annualInterestRateBps: 0,
						arrearsSinceDay: 8
					})
				]
			}
		});

		expect(projectScheduledDebtService(game, 11, 17)).toEqual([
			{ day: 11, principal: 100, interest: 20, total: 120, loanIds: ['loan-future-due'] },
			{ day: 17, principal: 83, interest: 0, total: 83, loanIds: ['loan-future-due'] }
		]);
	});

	it('keeps multi-loan service order and honors the requested date range', () => {
		const finance = createEmptyFinanceState(10);
		const makeDueLoan = (id: string): LoanInstrument =>
			createLoan({
				id,
				originalPrincipal: 400,
				remainingPrincipal: 400,
				annualInterestRateBps: 0,
				termDays: 28,
				nextPaymentDay: 17,
				lastInterestAccrualDay: 10
			});
		const game = createGame({
			day: 10,
			finance: {
				...finance,
				loans: [
					makeDueLoan('loan-b'),
					createLoan({
						id: 'loan-outside-range',
						status: 'delinquent',
						remainingPrincipal: 10,
						overduePrincipal: 10,
						nextPaymentDay: null,
						annualInterestRateBps: 0,
						arrearsSinceDay: 1
					}),
					makeDueLoan('loan-a')
				]
			}
		});

		expect(projectScheduledDebtService(game, 12, 17)).toEqual([
			{ day: 17, principal: 200, interest: 0, total: 200, loanIds: ['loan-a', 'loan-b'] }
		]);
	});

	it('clamps negative operating cash flow for coverage and returns null when no service is due', () => {
		const serviceFinance = createEmptyFinanceState(1);
		const withService = createGame({
			finance: {
				...serviceFinance,
				loans: [createLoan({ nextPaymentDay: 2, lastInterestAccrualDay: 1 })]
			},
			operatingCashFlows: [-10, -10]
		});

		expect(getFinanceMetrics(withService).debtServiceCoverage).toBe(0);
		expect(
			getFinanceMetrics(createGame({ operatingCashFlows: [100] })).debtServiceCoverage
		).toBeNull();
	});

	it('returns runway zero for negative cash and the first day that projected cash turns negative', () => {
		expect(projectCashRunway(createGame({ cash: -1 }))).toEqual({ kind: 'days', days: 0 });
		expect(
			projectCashRunway(createGame({ cash: 15, operatingCashFlows: [-5, -5, -5, -5] }))
		).toEqual({ kind: 'days', days: 4 });
	});

	it('uses no borrowing, builds, policies, or events in the focused runway projection', () => {
		const baseline = createGame({ cash: 100, operatingCashFlows: [-25] });
		const unrelatedState: GameState = {
			...baseline,
			rngState: 9_999,
			policy: {
				pricing: 'premium',
				inventory: 'generous',
				staffing: 'service',
				marketing: 'loyalty',
				service: 'highTouch'
			},
			stores: [],
			industrialBuildings: [],
			decisions: [
				{
					kind: 'system',
					id: 'unrelated-event',
					title: 'Unrelated event',
					context: { code: 'cashPressure' },
					expiresOnDay: 2,
					options: []
				}
			]
		};

		expect(projectCashRunway(baseline)).toEqual({ kind: 'days', days: 5 });
		expect(projectCashRunway(unrelatedState)).toEqual(projectCashRunway(baseline));
	});

	it('returns ninetyPlus when the balance survives the complete horizon', () => {
		expect(projectCashRunway(createGame({ cash: 1_000, operatingCashFlows: [0] }))).toEqual({
			kind: 'ninetyPlus'
		});
	});

	it('excludes paid and refinanced loans from outstanding principal', () => {
		// Paid and refinanced loans carry non-zero remainingPrincipal here so the
		// assertion verifies exclusion by loan status, not by a zeroed balance.
		const finance = createEmptyFinanceState(10);
		const paid = createLoan({ id: 'loan-paid', status: 'paid', remainingPrincipal: 250 });
		const refinanced = createLoan({
			id: 'loan-refinanced',
			status: 'refinanced',
			remainingPrincipal: 300
		});
		const active = createLoan({ id: 'loan-active', remainingPrincipal: 500 });

		const metrics = getFinanceMetrics(
			createGame({ finance: { ...finance, loans: [paid, refinanced, active] } })
		);

		expect(metrics.outstandingPrincipal).toBe(500);
	});

	it('returns an empty projection when throughDay is before the next day', () => {
		const game = createGame({ day: 10 });
		expect(projectScheduledDebtService(game, 11, 10)).toEqual([]);
		expect(projectScheduledDebtService(game, 15, 12)).toEqual([]);
	});
});
