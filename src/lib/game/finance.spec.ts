import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from './archetypes';
import {
	appendFinanceTransaction,
	calculateDailyInterestMicros,
	createEmptyFinanceState,
	createFoundingFinanceState,
	estimateNextLoanPayment,
	getInstallmentCount,
	getScheduledPrincipalForInstallment,
	getTotalAmountDue,
	getTotalDebt,
	replaceFoundingLoan,
	resetFinanceDayActivity,
	serviceFinanceForDay
} from './finance';
import { createNewGame } from './state';
import type { FinanceState, LoanInstrument } from './types';

function createLoan(overrides: Partial<LoanInstrument> = {}): LoanInstrument {
	const loan = createFoundingFinanceState(1, 1_200).loans[0]!;
	return { ...loan, ...overrides };
}

function createFinance(loans: LoanInstrument[], day = 1): FinanceState {
	return { ...createEmptyFinanceState(day), loans };
}

describe('finance state', () => {
	it.each(ARCHETYPES)('creates one promotional founding loan for $name', (archetype) => {
		const game = createNewGame(archetype.id, 123);
		const loan = game.finance.loans[0]!;

		expect(game.cash).toBe(archetype.startingCash);
		expect(loan).toMatchObject({
			id: 'loan-1',
			purpose: 'founding',
			status: 'active',
			openedOnDay: 1,
			originalPrincipal: archetype.startingDebt,
			remainingPrincipal: archetype.startingDebt,
			annualInterestRateBps: 1_200,
			termDays: 84,
			installmentsProcessed: 0,
			nextPaymentDay: 8,
			lastInterestAccrualDay: 1,
			accruedInterestMicros: 0,
			overdueInterest: 0,
			overduePrincipal: 0,
			arrearsSinceDay: null,
			scheduledPaymentCount: 0,
			onTimePaymentCount: 0,
			missedPaymentCount: 0
		});
		expect(game.finance.nextLoanSequence).toBe(2);
		expect(game.finance.nextTransactionSequence).toBe(1);
		expect(game.finance.transactions).toEqual([]);
		expect(game.finance.currentDayActivity).toEqual({
			day: 1,
			principalBorrowed: 0,
			principalRepaid: 0,
			interestPaid: 0,
			interestCapitalized: 0,
			refinancedPrincipal: 0,
			financingCashFlow: 0
		});
	});

	it('creates a neutral finance state for a zero-principal founding balance', () => {
		expect(createFoundingFinanceState(5, 0)).toEqual(createEmptyFinanceState(5));
	});

	it.each([-1, 12.5])('rejects an invalid founding principal of %s', (principal) => {
		expect(() => createFoundingFinanceState(5, principal)).toThrow(RangeError);
		expect(() => replaceFoundingLoan(createEmptyFinanceState(5), 5, principal)).toThrow(RangeError);
	});

	it.each([
		[28, 4],
		[56, 8],
		[84, 12]
	] as const)('derives %i installments for a %i-day term', (termDays, expectedCount) => {
		expect(getInstallmentCount(termDays)).toBe(expectedCount);
	});

	it('excludes closed loans from total debt', () => {
		const finance = createFoundingFinanceState(1, 1_000);
		const loan = finance.loans[0]!;
		const game = {
			finance: {
				...finance,
				loans: [{ ...loan, status: 'paid' as const, remainingPrincipal: 0, overduePrincipal: 300 }]
			}
		};

		expect(getTotalDebt(game)).toBe(0);
	});

	it('includes overdue balances and rounded accrued interest in amount due', () => {
		const finance = createFoundingFinanceState(1, 1_000);
		const loan = finance.loans[0]!;
		const game = {
			finance: {
				...finance,
				loans: [
					{
						...loan,
						remainingPrincipal: 700,
						overduePrincipal: 50,
						overdueInterest: 20,
						accruedInterestMicros: 1_200_001
					}
				]
			}
		};

		expect(getTotalAmountDue(game)).toBe(772);
	});

	it('replaces only the founding loan without changing unrelated loans or history', () => {
		const finance = createFoundingFinanceState(3, 100);
		const unrelated = { ...finance.loans[0]!, id: 'loan-99', purpose: 'expansion' as const };
		const withUnrelated = {
			...finance,
			loans: [finance.loans[0]!, unrelated],
			transactions: [
				{
					id: 'finance-transaction-1',
					day: 2,
					kind: 'disbursement' as const,
					loanId: unrelated.id,
					cashDelta: 100,
					principalAmount: 100,
					principalDelta: 100,
					interestAmount: 0
				}
			],
			nextLoanSequence: 2,
			nextTransactionSequence: 2
		};

		const result = replaceFoundingLoan(withUnrelated, 9, 400);

		expect(result.loans).toEqual([
			unrelated,
			expect.objectContaining({
				id: 'loan-2',
				purpose: 'founding',
				originalPrincipal: 400,
				nextPaymentDay: 16
			})
		]);
		expect(result.transactions).toEqual(withUnrelated.transactions);
		expect(replaceFoundingLoan(result, 9, 0).loans).toEqual([unrelated]);
	});
});

describe('finance servicing', () => {
	it('follows the founding-loan day 1 through day 9 servicing timeline', () => {
		let finance = createFoundingFinanceState(1, 1_200);
		let cash = 1_000;

		for (let day = 1; day <= 7; day += 1) {
			const serviced = serviceFinanceForDay({ finance, cash, day });
			finance = serviced.finance;
			cash = serviced.cash;
			expect(finance.loans[0]!.lastInterestAccrualDay).toBe(day);
			expect(serviced.interestAccruedThisDayMicros).toBe(day === 1 ? 0 : 394_521);
			expect(finance.transactions).toHaveLength(0);
		}

		const dueDay = serviceFinanceForDay({ finance, cash, day: 8 });
		expect(dueDay.cash).toBe(898);
		expect(dueDay.finance.loans[0]).toMatchObject({
			remainingPrincipal: 1_100,
			installmentsProcessed: 1,
			nextPaymentDay: 15,
			lastInterestAccrualDay: 8,
			accruedInterestMicros: 761_647,
			scheduledPaymentCount: 1,
			onTimePaymentCount: 1,
			missedPaymentCount: 0
		});
		expect(dueDay.finance.transactions).toEqual([
			expect.objectContaining({
				id: 'finance-transaction-1',
				day: 8,
				kind: 'interestPayment',
				cashDelta: -2,
				interestAmount: 2
			}),
			expect.objectContaining({
				id: 'finance-transaction-2',
				day: 8,
				kind: 'principalPayment',
				cashDelta: -100,
				principalAmount: 100,
				principalDelta: -100
			})
		]);
		expect(dueDay.finance.currentDayActivity).toMatchObject({
			day: 8,
			principalRepaid: 100,
			interestPaid: 2,
			financingCashFlow: -102
		});

		const dayNine = serviceFinanceForDay({
			finance: resetFinanceDayActivity(dueDay.finance, 9),
			cash: dueDay.cash,
			day: 9
		});
		expect(dayNine.interestAccruedThisDayMicros).toBe(361_644);
		expect(dayNine.finance.loans[0]).toMatchObject({
			remainingPrincipal: 1_100,
			accruedInterestMicros: 1_123_291,
			lastInterestAccrualDay: 9
		});
	});

	it('calculates daily micro-interest exactly and does not compound arrears', () => {
		expect(calculateDailyInterestMicros(1_000, 1_200)).toBe(328_767);
		const finance = createFinance([
			createLoan({
				status: 'delinquent',
				remainingPrincipal: 1_000,
				annualInterestRateBps: 1_200,
				lastInterestAccrualDay: 1,
				overdueInterest: 50,
				arrearsSinceDay: 1,
				nextPaymentDay: 8
			})
		]);

		const serviced = serviceFinanceForDay({ finance, cash: 0, day: 2 });
		expect(serviced.interestAccruedThisDayMicros).toBe(328_767);
		expect(serviced.finance.loans[0]).toMatchObject({
			overdueInterest: 50,
			accruedInterestMicros: 328_767
		});
	});

	it('schedules equal principal and gives the floor-division remainder to the final installment', () => {
		const loan = createLoan({ originalPrincipal: 1_000, remainingPrincipal: 1_000, termDays: 84 });

		expect(getScheduledPrincipalForInstallment(loan, 0)).toBe(83);
		expect(getScheduledPrincipalForInstallment(loan, 10)).toBe(83);
		expect(getScheduledPrincipalForInstallment(loan, 11)).toBe(87);
		expect(estimateNextLoanPayment(loan)).toBe(83);
	});

	it('advances zero-dollar installment checkpoints without ledger evidence or repayment counters', () => {
		const finance = createFinance([
			createLoan({
				originalPrincipal: 1,
				remainingPrincipal: 1,
				annualInterestRateBps: 0,
				termDays: 84,
				nextPaymentDay: 8,
				lastInterestAccrualDay: 7
			})
		]);

		const serviced = serviceFinanceForDay({ finance, cash: 0, day: 8 });
		expect(serviced.finance.loans[0]).toMatchObject({
			installmentsProcessed: 1,
			nextPaymentDay: 15,
			scheduledPaymentCount: 0,
			onTimePaymentCount: 0,
			missedPaymentCount: 0
		});
		expect(serviced.finance.transactions).toEqual([]);
	});

	it('records a full scheduled principal payment as on time', () => {
		const finance = createFinance([
			createLoan({
				originalPrincipal: 700,
				remainingPrincipal: 700,
				termDays: 28,
				annualInterestRateBps: 0,
				nextPaymentDay: 8,
				lastInterestAccrualDay: 7
			})
		]);

		const serviced = serviceFinanceForDay({ finance, cash: 175, day: 8 });
		expect(serviced.cash).toBe(0);
		expect(serviced.finance.loans[0]).toMatchObject({
			remainingPrincipal: 525,
			status: 'active',
			scheduledPaymentCount: 1,
			onTimePaymentCount: 1,
			missedPaymentCount: 0
		});
	});

	it('records a partial scheduled payment and its unpaid principal as arrears', () => {
		const finance = createFinance([
			createLoan({
				originalPrincipal: 1_000,
				remainingPrincipal: 1_000,
				termDays: 28,
				annualInterestRateBps: 0,
				nextPaymentDay: 8,
				lastInterestAccrualDay: 7
			})
		]);

		const serviced = serviceFinanceForDay({ finance, cash: 50, day: 8 });
		expect(serviced.cash).toBe(0);
		expect(serviced.finance.loans[0]).toMatchObject({
			status: 'delinquent',
			remainingPrincipal: 950,
			overduePrincipal: 200,
			arrearsSinceDay: 8,
			scheduledPaymentCount: 1,
			onTimePaymentCount: 0,
			missedPaymentCount: 1
		});
		expect(serviced.finance.transactions.map((transaction) => transaction.kind)).toEqual([
			'principalPayment',
			'missedPayment'
		]);
	});

	it('records a full scheduled miss without making negative cash more negative', () => {
		const finance = createFinance([
			createLoan({
				originalPrincipal: 1_000,
				remainingPrincipal: 1_000,
				termDays: 28,
				annualInterestRateBps: 0,
				nextPaymentDay: 8,
				lastInterestAccrualDay: 7
			})
		]);

		const serviced = serviceFinanceForDay({ finance, cash: -20, day: 8 });
		expect(serviced.cash).toBe(-20);
		expect(serviced.finance.loans[0]).toMatchObject({
			overduePrincipal: 250,
			missedPaymentCount: 1
		});
		expect(serviced.finance.transactions).toEqual([
			expect.objectContaining({ kind: 'missedPayment', principalAmount: 250, cashDelta: 0 })
		]);
	});

	it('accumulates arrears at later checkpoints and sweeps them as soon as cash recovers', () => {
		const loan = createLoan({
			originalPrincipal: 1_000,
			remainingPrincipal: 1_000,
			termDays: 28,
			annualInterestRateBps: 0,
			nextPaymentDay: 8,
			lastInterestAccrualDay: 7
		});
		const missed = serviceFinanceForDay({ finance: createFinance([loan]), cash: 0, day: 8 });
		const stacked = serviceFinanceForDay({
			finance: resetFinanceDayActivity(missed.finance, 15),
			cash: 0,
			day: 15
		});
		expect(stacked.finance.loans[0]).toMatchObject({
			overduePrincipal: 500,
			missedPaymentCount: 2
		});

		const recovered = serviceFinanceForDay({
			finance: resetFinanceDayActivity(stacked.finance, 16),
			cash: 500,
			day: 16
		});
		expect(recovered.cash).toBe(0);
		expect(recovered.finance.loans[0]).toMatchObject({
			status: 'active',
			overduePrincipal: 0,
			arrearsSinceDay: null,
			missedPaymentCount: 2
		});
	});

	it('continues the daily arrears sweep after maturity until a cash-positive loan closes', () => {
		let finance = createFinance([
			createLoan({
				originalPrincipal: 1_000,
				remainingPrincipal: 1_000,
				termDays: 28,
				annualInterestRateBps: 0,
				nextPaymentDay: 8,
				lastInterestAccrualDay: 7
			})
		]);
		for (const day of [8, 15, 22, 29]) {
			const serviced = serviceFinanceForDay({ finance, cash: 0, day });
			finance = resetFinanceDayActivity(serviced.finance, day + 1);
		}
		expect(finance.loans[0]).toMatchObject({
			status: 'delinquent',
			nextPaymentDay: null,
			overduePrincipal: 1_000
		});

		const recovered = serviceFinanceForDay({ finance, cash: 1_000, day: 30 });
		expect(recovered.cash).toBe(0);
		expect(recovered.finance.loans[0]).toMatchObject({
			status: 'paid',
			remainingPrincipal: 0,
			overduePrincipal: 0,
			arrearsSinceDay: null
		});
	});

	it('sweeps cash-constrained delinquent loans in stable arrears, opening-day, and id order', () => {
		const finance = createFinance([
			createLoan({
				id: 'loan-b',
				openedOnDay: 2,
				status: 'delinquent',
				remainingPrincipal: 100,
				overduePrincipal: 100,
				arrearsSinceDay: 1,
				nextPaymentDay: null,
				annualInterestRateBps: 0
			}),
			createLoan({
				id: 'loan-a',
				openedOnDay: 1,
				status: 'delinquent',
				remainingPrincipal: 100,
				overduePrincipal: 100,
				arrearsSinceDay: 1,
				nextPaymentDay: null,
				annualInterestRateBps: 0
			})
		]);

		const serviced = serviceFinanceForDay({ finance, cash: 100, day: 3 });
		expect(serviced.finance.loans.map((loan) => [loan.id, loan.status])).toEqual([
			['loan-b', 'delinquent'],
			['loan-a', 'paid']
		]);
	});

	it('closes final fractional accrued interest with one ceiling operation', () => {
		const finance = createFinance([
			createLoan({
				originalPrincipal: 1,
				remainingPrincipal: 1,
				termDays: 28,
				installmentsProcessed: 3,
				nextPaymentDay: 8,
				annualInterestRateBps: 0,
				lastInterestAccrualDay: 7,
				accruedInterestMicros: 1
			})
		]);

		const serviced = serviceFinanceForDay({ finance, cash: 2, day: 8 });
		expect(serviced.cash).toBe(0);
		expect(serviced.finance.loans[0]).toMatchObject({
			status: 'paid',
			remainingPrincipal: 0,
			accruedInterestMicros: 0,
			overdueInterest: 0,
			overduePrincipal: 0
		});
		expect(serviced.finance.transactions.map((transaction) => transaction.kind)).toEqual([
			'principalPayment',
			'interestPayment'
		]);
	});

	it('preserves final fractional interest through an insolvent checkpoint until a later sweep can close it', () => {
		const finance = createFinance([
			createLoan({
				originalPrincipal: 1,
				remainingPrincipal: 1,
				termDays: 28,
				installmentsProcessed: 3,
				nextPaymentDay: 8,
				annualInterestRateBps: 0,
				lastInterestAccrualDay: 7,
				accruedInterestMicros: 1
			})
		]);

		const insolvent = serviceFinanceForDay({ finance, cash: 1, day: 8 });
		expect(insolvent.cash).toBe(0);
		expect(insolvent.finance.loans[0]).toMatchObject({
			status: 'delinquent',
			remainingPrincipal: 0,
			overduePrincipal: 0,
			overdueInterest: 0,
			accruedInterestMicros: 1,
			scheduledPaymentCount: 1,
			missedPaymentCount: 0
		});
		expect(insolvent.finance.transactions).toEqual([
			expect.objectContaining({
				kind: 'principalPayment',
				principalAmount: 1,
				interestAmount: 0
			})
		]);

		const recovered = serviceFinanceForDay({
			finance: resetFinanceDayActivity(insolvent.finance, 9),
			cash: 1,
			day: 9
		});
		expect(recovered.cash).toBe(0);
		expect(recovered.finance.loans[0]).toMatchObject({
			status: 'paid',
			accruedInterestMicros: 0,
			overdueInterest: 0
		});
		expect(recovered.finance.transactions.at(-1)).toMatchObject({
			kind: 'interestPayment',
			interestAmount: 1,
			cashDelta: -1
		});
	});

	it('retains paid and refinanced loans but excludes them from servicing', () => {
		const paid = createLoan({
			id: 'loan-paid',
			status: 'paid',
			remainingPrincipal: 0,
			nextPaymentDay: null
		});
		const refinanced = createLoan({
			id: 'loan-refinanced',
			status: 'refinanced',
			remainingPrincipal: 0,
			nextPaymentDay: null
		});
		const finance = createFinance([paid, refinanced]);

		const serviced = serviceFinanceForDay({ finance, cash: 75, day: 8 });
		expect(serviced.cash).toBe(75);
		expect(serviced.finance.loans).toEqual([paid, refinanced]);
		expect(serviced.finance.transactions).toEqual([]);
	});

	it('uses monotonic transaction IDs, keeps chronological evidence, and prunes only transactions', () => {
		const finance = Array.from({ length: 201 }).reduce<FinanceState>(
			(result) =>
				appendFinanceTransaction(result, {
					day: 1,
					kind: 'disbursement',
					loanId: 'loan-1',
					cashDelta: 1,
					principalAmount: 1,
					principalDelta: 1,
					interestAmount: 0
				}),
			createEmptyFinanceState(1)
		);

		expect(finance.transactions).toHaveLength(200);
		expect(finance.transactions[0]?.id).toBe('finance-transaction-2');
		expect(finance.transactions.at(-1)?.id).toBe('finance-transaction-201');
		expect(finance.nextTransactionSequence).toBe(202);
		expect(finance.currentDayActivity).toMatchObject({
			principalBorrowed: 201,
			financingCashFlow: 201
		});
	});

	it('keeps the current-day reconciliation after more than 200 same-day transactions and resets it explicitly', () => {
		const finance = Array.from({ length: 201 }).reduce<FinanceState>(
			(result) =>
				appendFinanceTransaction(result, {
					day: 4,
					kind: 'interestPayment',
					loanId: 'loan-1',
					cashDelta: -1,
					principalAmount: 0,
					principalDelta: 0,
					interestAmount: 1
				}),
			createEmptyFinanceState(4)
		);
		expect(finance.transactions).toHaveLength(200);
		expect(finance.currentDayActivity).toEqual({
			day: 4,
			principalBorrowed: 0,
			principalRepaid: 0,
			interestPaid: 201,
			interestCapitalized: 0,
			refinancedPrincipal: 0,
			financingCashFlow: -201
		});
		expect(resetFinanceDayActivity(finance, 5).currentDayActivity).toEqual({
			day: 5,
			principalBorrowed: 0,
			principalRepaid: 0,
			interestPaid: 0,
			interestCapitalized: 0,
			refinancedPrincipal: 0,
			financingCashFlow: 0
		});
	});
});
