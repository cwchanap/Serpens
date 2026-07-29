import type { FinanceState, GameState, LoanInstrument, LoanTermDays } from './types';

export const LOAN_PAYMENT_FREQUENCY_DAYS = 7;
export const FOUNDING_LOAN_TERM_DAYS = 84;
export const FOUNDING_LOAN_APR_BPS = 1_200;
export const FINANCE_TRANSACTION_LIMIT = 200;

function requireNonNegativeIntegerPrincipal(principal: number): void {
	if (!Number.isInteger(principal) || principal < 0) {
		throw new RangeError('Founding loan principal must be a non-negative integer');
	}
}

function createDayActivity(day: number): FinanceState['currentDayActivity'] {
	return {
		day,
		principalBorrowed: 0,
		principalRepaid: 0,
		interestPaid: 0,
		interestCapitalized: 0,
		refinancedPrincipal: 0,
		financingCashFlow: 0
	};
}

export function createEmptyFinanceState(day: number): FinanceState {
	return {
		loans: [],
		transactions: [],
		nextLoanSequence: 1,
		nextTransactionSequence: 1,
		currentDayActivity: createDayActivity(day)
	};
}

function createFoundingLoan(day: number, principal: number, sequence: number): LoanInstrument {
	return {
		id: `loan-${sequence}`,
		purpose: 'founding',
		status: 'active',
		openedOnDay: day,
		originalPrincipal: principal,
		remainingPrincipal: principal,
		annualInterestRateBps: FOUNDING_LOAN_APR_BPS,
		termDays: FOUNDING_LOAN_TERM_DAYS,
		installmentsProcessed: 0,
		nextPaymentDay: day + LOAN_PAYMENT_FREQUENCY_DAYS,
		lastInterestAccrualDay: day,
		accruedInterestMicros: 0,
		overdueInterest: 0,
		overduePrincipal: 0,
		arrearsSinceDay: null,
		scheduledPaymentCount: 0,
		onTimePaymentCount: 0,
		missedPaymentCount: 0
	};
}

export function createFoundingFinanceState(day: number, principal: number): FinanceState {
	requireNonNegativeIntegerPrincipal(principal);
	const finance = createEmptyFinanceState(day);
	return principal === 0
		? finance
		: {
				...finance,
				loans: [createFoundingLoan(day, principal, finance.nextLoanSequence)],
				nextLoanSequence: finance.nextLoanSequence + 1
			};
}

export function replaceFoundingLoan(
	finance: FinanceState,
	day: number,
	principal: number
): FinanceState {
	requireNonNegativeIntegerPrincipal(principal);
	const loans = finance.loans.filter(
		(loan) =>
			loan.purpose !== 'founding' || (loan.status !== 'active' && loan.status !== 'delinquent')
	);

	if (principal === 0) return { ...finance, loans };

	const loan = createFoundingLoan(day, principal, finance.nextLoanSequence);
	return {
		...finance,
		loans: [...loans, loan],
		nextLoanSequence: finance.nextLoanSequence + 1
	};
}

export function getInstallmentCount(termDays: LoanTermDays): number {
	return termDays / LOAN_PAYMENT_FREQUENCY_DAYS;
}

function isOutstandingLoan(loan: LoanInstrument): boolean {
	return loan.status === 'active' || loan.status === 'delinquent';
}

export function getTotalDebt(game: Pick<GameState, 'finance'>): number {
	return game.finance.loans.reduce(
		(total, loan) =>
			isOutstandingLoan(loan) ? total + loan.remainingPrincipal + loan.overduePrincipal : total,
		0
	);
}

export function getTotalAmountDue(game: Pick<GameState, 'finance'>): number {
	return game.finance.loans.reduce(
		(total, loan) =>
			isOutstandingLoan(loan)
				? total +
					loan.remainingPrincipal +
					loan.overduePrincipal +
					loan.overdueInterest +
					Math.ceil(loan.accruedInterestMicros / 1_000_000)
				: total,
		0
	);
}
