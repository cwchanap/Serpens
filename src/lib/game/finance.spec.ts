import { describe, expect, it } from 'vitest';
import { ARCHETYPES } from './archetypes';
import {
	createEmptyFinanceState,
	createFoundingFinanceState,
	getInstallmentCount,
	getTotalAmountDue,
	getTotalDebt,
	replaceFoundingLoan
} from './finance';
import { createNewGame } from './state';

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
