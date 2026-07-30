import type {
	FinanceState,
	FinanceTransaction,
	GameState,
	LoanInstrument,
	LoanTermDays
} from './types';

export const LOAN_PAYMENT_FREQUENCY_DAYS = 7;
export const FOUNDING_LOAN_TERM_DAYS = 84;
export const FOUNDING_LOAN_APR_BPS = 1_200;
export const FINANCE_TRANSACTION_LIMIT = 200;

export type FinanceFailureCode =
	| 'loanNotFound'
	| 'loanClosed'
	| 'loanDelinquent'
	| 'invalidAmount'
	| 'belowMinimumBorrowing'
	| 'insufficientCash'
	| 'overpayment'
	| 'unsupportedTerm'
	| 'unsupportedPurpose'
	| 'insufficientCredit'
	| 'purchaseUnavailable'
	| 'purchaseCostChanged'
	| 'cashSufficient';

export type FinanceActionResult<TReceipt> =
	| { ok: true; game: GameState; receipt: TReceipt }
	| {
			ok: false;
			game?: GameState;
			code: FinanceFailureCode;
			context: Record<string, string | number>;
	  };

type FinanceActionFailure = Extract<FinanceActionResult<never>, { ok: false }>;
type ActionLoanLookup = { ok: true; loan: LoanInstrument } | FinanceActionFailure;

export interface BorrowInput {
	purpose: Exclude<LoanInstrument['purpose'], 'founding' | 'refinance'>;
	amount: number;
	termDays: LoanTermDays;
	allowBelowMinimum?: boolean;
}

export interface CreditScheduleEstimate {
	firstPayment: number;
	regularPayment: number;
	peakPayment: number;
}

export type CreditAssessmentReason =
	| 'delinquentObligation'
	| 'principalCapacityLimited'
	| 'debtServiceCapacityLimited';

export interface CreditAssessment {
	termDays: LoanTermDays;
	baseRateBps: number;
	healthPenaltyBps: number;
	historyPenaltyBps: number;
	annualInterestRateBps: number;
	averageDailyOperatingCashFlow: number;
	weeklyOperatingCashFlow: number;
	healthScore: number;
	healthFactor: number;
	lifetimeScheduledPaymentCount: number;
	lifetimeMissedPaymentCount: number;
	lifetimeMissRate: number;
	historyFactor: number;
	grossPrincipalLimit: number;
	outstandingPrincipal: number;
	principalHeadroom: number;
	weeklyPaymentBudget: number;
	existingWeeklyDebtService: number;
	weeklyServiceHeadroom: number;
	maxPrincipalByService: number;
	availableCredit: number;
	availableCreditSchedule: CreditScheduleEstimate;
	reasons: CreditAssessmentReason[];
}

export interface ExpansionFinanceOffer {
	principal: number;
	termDays: 84;
	annualInterestRateBps: number;
	estimatedPeakPayment: number;
}

export interface FinancedPurchaseReceipt {
	loanId: string | null;
	purchaseCost: number;
	financedPrincipal: number;
}

export interface FinanceServicingResult {
	finance: FinanceState;
	cash: number;
	interestAccruedThisDayMicros: number;
}

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

export function calculateDailyInterestMicros(
	principal: number,
	annualInterestRateBps: number
): number {
	return Math.round((principal * annualInterestRateBps * 1_000_000) / (10_000 * 365));
}

export function getScheduledPrincipalForInstallment(
	loan: LoanInstrument,
	installmentIndex: number
): number {
	const installmentCount = getInstallmentCount(loan.termDays);
	if (installmentIndex < 0 || installmentIndex >= installmentCount) return 0;

	const basePrincipal = Math.floor(loan.originalPrincipal / installmentCount);
	const finalRemainder = loan.originalPrincipal % installmentCount;
	const scheduled =
		installmentIndex === installmentCount - 1 ? basePrincipal + finalRemainder : basePrincipal;
	return Math.min(scheduled, Math.max(0, loan.remainingPrincipal - loan.overduePrincipal));
}

export function estimateNextLoanPayment(loan: LoanInstrument): number {
	if (!isOutstandingLoan(loan) || loan.nextPaymentDay === null) return 0;
	const isFinalInstallment = loan.installmentsProcessed === getInstallmentCount(loan.termDays) - 1;
	const accruedInterest = isFinalInstallment
		? Math.ceil(loan.accruedInterestMicros / 1_000_000)
		: Math.floor(loan.accruedInterestMicros / 1_000_000);
	return (
		loan.overdueInterest +
		loan.overduePrincipal +
		accruedInterest +
		getScheduledPrincipalForInstallment(loan, loan.installmentsProcessed)
	);
}

function isZeroActivity(finance: FinanceState): boolean {
	const activity = finance.currentDayActivity;
	return (
		activity.principalBorrowed === 0 &&
		activity.principalRepaid === 0 &&
		activity.interestPaid === 0 &&
		activity.interestCapitalized === 0 &&
		activity.refinancedPrincipal === 0 &&
		activity.financingCashFlow === 0
	);
}

function assertActivityReconciliation(finance: FinanceState): void {
	const activity = finance.currentDayActivity;
	if (
		activity.financingCashFlow !==
		activity.principalBorrowed - activity.principalRepaid - activity.interestPaid
	) {
		throw new Error('Finance day activity does not reconcile');
	}
}

function updateFinanceDayActivity(
	finance: FinanceState,
	transaction: Omit<FinanceTransaction, 'id'>
): FinanceState['currentDayActivity'] {
	const activity = finance.currentDayActivity;
	const next = { ...activity };

	switch (transaction.kind) {
		case 'disbursement':
			next.principalBorrowed += transaction.principalAmount;
			break;
		case 'principalPayment':
			next.principalRepaid += transaction.principalAmount;
			next.interestPaid += transaction.interestAmount;
			break;
		case 'interestPayment':
			next.interestPaid += transaction.interestAmount;
			break;
		case 'refinance':
			next.refinancedPrincipal += transaction.principalAmount;
			next.interestCapitalized += transaction.interestAmount;
			break;
		case 'missedPayment':
			break;
	}
	next.financingCashFlow = next.principalBorrowed - next.principalRepaid - next.interestPaid;
	return next;
}

export function appendFinanceTransaction(
	finance: FinanceState,
	transaction: Omit<FinanceTransaction, 'id'>
): FinanceState {
	const appended: FinanceTransaction = {
		...transaction,
		id: `finance-transaction-${finance.nextTransactionSequence}`
	};
	const next = {
		...finance,
		transactions: [...finance.transactions, appended].slice(-FINANCE_TRANSACTION_LIMIT),
		nextTransactionSequence: finance.nextTransactionSequence + 1,
		currentDayActivity: updateFinanceDayActivity(finance, transaction)
	};
	assertActivityReconciliation(next);
	return next;
}

export function resetFinanceDayActivity(finance: FinanceState, nextDay: number): FinanceState {
	const next = { ...finance, currentDayActivity: createDayActivity(nextDay) };
	assertActivityReconciliation(next);
	return next;
}

function replaceLoan(finance: FinanceState, nextLoan: LoanInstrument): FinanceState {
	return {
		...finance,
		loans: finance.loans.map((loan) => (loan.id === nextLoan.id ? nextLoan : loan))
	};
}

function compareIds(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function accrueLoanThroughDay(
	loan: LoanInstrument,
	day: number
): {
	loan: LoanInstrument;
	interestAccruedThisDayMicros: number;
} {
	if (!isOutstandingLoan(loan) || day <= loan.lastInterestAccrualDay) {
		return { loan, interestAccruedThisDayMicros: 0 };
	}

	const dailyInterestMicros = calculateDailyInterestMicros(
		loan.remainingPrincipal,
		loan.annualInterestRateBps
	);
	const accrualDays = day - loan.lastInterestAccrualDay;
	return {
		loan: {
			...loan,
			lastInterestAccrualDay: day,
			accruedInterestMicros: loan.accruedInterestMicros + dailyInterestMicros * accrualDays
		},
		interestAccruedThisDayMicros: dailyInterestMicros * accrualDays
	};
}

function appendPaymentTransaction(
	finance: FinanceState,
	loanId: string,
	day: number,
	kind: 'interestPayment' | 'principalPayment',
	amount: number
): FinanceState {
	if (amount === 0) return finance;
	return appendFinanceTransaction(finance, {
		day,
		kind,
		loanId,
		cashDelta: -amount,
		principalAmount: kind === 'principalPayment' ? amount : 0,
		principalDelta: kind === 'principalPayment' ? -amount : 0,
		interestAmount: kind === 'interestPayment' ? amount : 0
	});
}

function payLoanArrears(input: {
	finance: FinanceState;
	loan: LoanInstrument;
	cash: number;
	day: number;
}): { finance: FinanceState; loan: LoanInstrument; cash: number } {
	let { finance, loan } = input;
	let cash = input.cash;
	const availableCash = Math.max(0, cash);
	const interestPayment = Math.min(availableCash, loan.overdueInterest);
	if (interestPayment > 0) {
		loan = { ...loan, overdueInterest: loan.overdueInterest - interestPayment };
		cash -= interestPayment;
		finance = appendPaymentTransaction(
			finance,
			loan.id,
			input.day,
			'interestPayment',
			interestPayment
		);
	}
	const principalPayment = Math.min(Math.max(0, cash), loan.overduePrincipal);
	if (principalPayment > 0) {
		loan = {
			...loan,
			overduePrincipal: loan.overduePrincipal - principalPayment,
			remainingPrincipal: loan.remainingPrincipal - principalPayment
		};
		cash -= principalPayment;
		finance = appendPaymentTransaction(
			finance,
			loan.id,
			input.day,
			'principalPayment',
			principalPayment
		);
	}
	return { finance, loan, cash };
}

export function hasLoanArrears(loan: LoanInstrument): boolean {
	return (
		loan.overdueInterest > 0 ||
		loan.overduePrincipal > 0 ||
		(loan.nextPaymentDay === null && loan.accruedInterestMicros > 0)
	);
}

export function getLoanArrearsAmount(loan: LoanInstrument): number {
	return (
		loan.overdueInterest +
		loan.overduePrincipal +
		(loan.nextPaymentDay === null ? Math.ceil(loan.accruedInterestMicros / 1_000_000) : 0)
	);
}

function finalizeLoanStatus(loan: LoanInstrument): LoanInstrument {
	if (
		loan.remainingPrincipal === 0 &&
		loan.overdueInterest === 0 &&
		loan.overduePrincipal === 0 &&
		loan.accruedInterestMicros === 0
	) {
		return { ...loan, status: 'paid', arrearsSinceDay: null, nextPaymentDay: null };
	}
	if (hasLoanArrears(loan)) {
		return { ...loan, status: 'delinquent', arrearsSinceDay: loan.arrearsSinceDay };
	}
	if (loan.status === 'delinquent' && loan.nextPaymentDay !== null) {
		return { ...loan, status: 'active', arrearsSinceDay: null };
	}
	return loan;
}

interface ScheduledInstallmentStage {
	loanId: string;
	priorOverdueInterest: number;
	priorOverduePrincipal: number;
	accruedInterestDue: number;
	scheduledPrincipal: number;
	hadPriorArrears: boolean;
	scheduledObligation: number;
}

/**
 * Stages a due loan's current instalment (spec daily-servicing steps 2-4):
 * moves the accrued interest and scheduled principal into the overdue buckets,
 * advances the instalment index, and sets the next payment date (or null after
 * the final scheduled instalment). This is deliberately separate from cash
 * allocation so that all due instalments are staged before one unified arrears
 * queue allocates cash. The final instalment uses `ceil` for the accrued
 * interest so a successfully completed loan closes with no stranded fractional
 * interest; the fractional micros are cleared at that point.
 */
function stageScheduledInstallment(
	loan: LoanInstrument,
	day: number
): { loan: LoanInstrument; stage: ScheduledInstallmentStage } {
	const priorOverdueInterest = loan.overdueInterest;
	const priorOverduePrincipal = loan.overduePrincipal;
	const hadPriorArrears = hasLoanArrears(loan);
	const installmentCount = getInstallmentCount(loan.termDays);
	const isFinalInstallment = loan.installmentsProcessed === installmentCount - 1;
	const scheduledPrincipal = getScheduledPrincipalForInstallment(loan, loan.installmentsProcessed);
	const accruedInterestDue = isFinalInstallment
		? Math.ceil(loan.accruedInterestMicros / 1_000_000)
		: Math.floor(loan.accruedInterestMicros / 1_000_000);
	const remainingAccruedInterestMicros = isFinalInstallment
		? 0
		: loan.accruedInterestMicros - accruedInterestDue * 1_000_000;
	const stagedLoan: LoanInstrument = {
		...loan,
		accruedInterestMicros: remainingAccruedInterestMicros,
		overdueInterest: loan.overdueInterest + accruedInterestDue,
		overduePrincipal: loan.overduePrincipal + scheduledPrincipal,
		installmentsProcessed: loan.installmentsProcessed + 1,
		nextPaymentDay:
			loan.installmentsProcessed + 1 === installmentCount ? null : day + LOAN_PAYMENT_FREQUENCY_DAYS
	};
	return {
		loan: stagedLoan,
		stage: {
			loanId: loan.id,
			priorOverdueInterest,
			priorOverduePrincipal,
			accruedInterestDue,
			scheduledPrincipal,
			hadPriorArrears,
			scheduledObligation: accruedInterestDue + scheduledPrincipal
		}
	};
}

/**
 * Finalises a staged due loan's on-time/missed counters based on how much of
 * its current instalment the unified arrears queue actually cleared (spec steps
 * 9-11). Cash is allocated to prior arrears before the current instalment within
 * each bucket, so the current instalment's unpaid slice is reconstructed from
 * the loan's remaining overdue balances rather than from a net-change figure.
 */
function classifyScheduledInstallment(input: {
	finance: FinanceState;
	loan: LoanInstrument;
	stage: ScheduledInstallmentStage;
	day: number;
}): { finance: FinanceState; loan: LoanInstrument } {
	let { finance, loan } = input;
	const stage = input.stage;

	if (stage.scheduledObligation > 0) {
		const paidInterest =
			stage.priorOverdueInterest + stage.accruedInterestDue - loan.overdueInterest;
		const currentInterestPaid = Math.max(0, paidInterest - stage.priorOverdueInterest);
		const unpaidInterest = Math.max(0, stage.accruedInterestDue - currentInterestPaid);
		const paidPrincipal =
			stage.priorOverduePrincipal + stage.scheduledPrincipal - loan.overduePrincipal;
		const currentPrincipalPaid = Math.max(0, paidPrincipal - stage.priorOverduePrincipal);
		const unpaidPrincipal = Math.max(0, stage.scheduledPrincipal - currentPrincipalPaid);
		const missed = stage.hadPriorArrears || unpaidInterest > 0 || unpaidPrincipal > 0;
		loan = {
			...loan,
			scheduledPaymentCount: loan.scheduledPaymentCount + 1,
			onTimePaymentCount: loan.onTimePaymentCount + (missed ? 0 : 1),
			missedPaymentCount: loan.missedPaymentCount + (missed ? 1 : 0),
			arrearsSinceDay:
				unpaidInterest > 0 || unpaidPrincipal > 0
					? (loan.arrearsSinceDay ?? input.day)
					: loan.arrearsSinceDay
		};
		if (unpaidInterest > 0 || unpaidPrincipal > 0) {
			finance = appendFinanceTransaction(finance, {
				day: input.day,
				kind: 'missedPayment',
				loanId: loan.id,
				cashDelta: 0,
				principalAmount: unpaidPrincipal,
				principalDelta: 0,
				interestAmount: unpaidInterest
			});
		}
	}

	loan = finalizeLoanStatus(loan);
	return { finance, loan };
}

function moveMaturedAccruedInterestToArrears(loan: LoanInstrument, cash: number): LoanInstrument {
	if (loan.nextPaymentDay !== null || loan.accruedInterestMicros === 0) return loan;
	let next = moveWholeMaturedInterestToArrears(loan);
	const payoffBeforeFractionalInterest = next.overdueInterest + next.overduePrincipal;
	if (next.accruedInterestMicros > 0 && Math.max(0, cash) > payoffBeforeFractionalInterest) {
		next = {
			...next,
			overdueInterest: next.overdueInterest + Math.ceil(next.accruedInterestMicros / 1_000_000),
			accruedInterestMicros: 0
		};
	}
	return next;
}

/**
 * Moves the whole-dollar portion of matured accrued interest to arrears.
 * Shared between the real ledger transition and the projection flow. The
 * caller is responsible for any fractional-interest cash-availability rule.
 */
export function moveWholeMaturedInterestToArrears(loan: LoanInstrument): LoanInstrument {
	if (loan.nextPaymentDay !== null || loan.accruedInterestMicros === 0) return loan;
	const wholeInterest = Math.floor(loan.accruedInterestMicros / 1_000_000);
	return {
		...loan,
		overdueInterest: loan.overdueInterest + wholeInterest,
		accruedInterestMicros: loan.accruedInterestMicros - wholeInterest * 1_000_000
	};
}

export function serviceFinanceForDay(input: {
	finance: FinanceState;
	cash: number;
	day: number;
}): FinanceServicingResult {
	let finance = input.finance;
	if (finance.currentDayActivity.day !== input.day && isZeroActivity(finance)) {
		finance = resetFinanceDayActivity(finance, input.day);
	}
	let interestAccruedThisDayMicros = 0;
	const accruedLoans = finance.loans.map((loan) => {
		const accrued = accrueLoanThroughDay(loan, input.day);
		interestAccruedThisDayMicros += accrued.interestAccruedThisDayMicros;
		return accrued.loan;
	});
	finance = { ...finance, loans: accruedLoans };
	let cash = input.cash;

	// Stage every loan due today (spec steps 2-4): move the current instalment
	// into the overdue buckets and advance the instalment index WITHOUT
	// allocating cash or updating counters. All due instalments must be staged
	// before cash is allocated so a new instalment cannot jump ahead of an older
	// delinquent obligation in the unified arrears queue.
	const dueLoanIds = finance.loans
		.filter(
			(loan) =>
				isOutstandingLoan(loan) && loan.nextPaymentDay !== null && loan.nextPaymentDay === input.day
		)
		.sort(
			(left, right) =>
				left.nextPaymentDay! - right.nextPaymentDay! ||
				left.openedOnDay - right.openedOnDay ||
				compareIds(left.id, right.id)
		)
		.map((loan) => loan.id);
	const stages = new Map<string, ScheduledInstallmentStage>();
	for (const loanId of dueLoanIds) {
		const loan = finance.loans.find((candidate) => candidate.id === loanId)!;
		const staged = stageScheduledInstallment(loan, input.day);
		finance = replaceLoan(finance, staged.loan);
		stages.set(loanId, staged.stage);
	}

	// Unified arrears queue (spec steps 5-7): every loan with arrears — including
	// the just-staged due loans and pre-existing delinquent/matured loans — is
	// ordered by arrearsSinceDay, then openedOnDay, then loan ID, and cash is
	// allocated overdue interest first and overdue principal second for each
	// loan. A just-staged due loan with no prior arrears has arrearsSinceDay
	// null, so it sorts after older delinquent obligations and cannot consume
	// cash before them.
	const arrearsLoanIds = finance.loans
		.filter((loan) => hasLoanArrears(loan))
		.sort(
			(left, right) =>
				(left.arrearsSinceDay ?? Number.MAX_SAFE_INTEGER) -
					(right.arrearsSinceDay ?? Number.MAX_SAFE_INTEGER) ||
				left.openedOnDay - right.openedOnDay ||
				compareIds(left.id, right.id)
		)
		.map((loan) => loan.id);
	for (const loanId of arrearsLoanIds) {
		let loan = finance.loans.find((candidate) => candidate.id === loanId)!;
		loan = moveMaturedAccruedInterestToArrears(loan, cash);
		const swept = payLoanArrears({ finance, loan, cash, day: input.day });
		finance = swept.finance;
		cash = swept.cash;
		loan = swept.loan;
		// Staged due loans are finalised together with their counter
		// classification below; non-staged delinquent loans are finalised here.
		loan = stages.has(loanId) ? loan : finalizeLoanStatus(loan);
		finance = replaceLoan(finance, loan);
	}

	// Finalise each staged due loan's on-time/missed counters from the
	// allocation result, then settle its status (spec steps 9-11).
	for (const loanId of dueLoanIds) {
		const stage = stages.get(loanId)!;
		const loan = finance.loans.find((candidate) => candidate.id === loanId)!;
		const classified = classifyScheduledInstallment({ finance, loan, stage, day: input.day });
		finance = classified.finance;
		finance = replaceLoan(finance, classified.loan);
	}

	assertActivityReconciliation(finance);
	return { finance, cash, interestAccruedThisDayMicros };
}

export function isOutstandingLoan(loan: LoanInstrument): boolean {
	return loan.status === 'active' || loan.status === 'delinquent';
}

/** Stable tiebreaker for loan sorting: compares by loan id. */
export function compareLoanById(left: LoanInstrument, right: LoanInstrument): number {
	return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function getTotalDebt(game: Pick<GameState, 'finance'>): number {
	return game.finance.loans.reduce(
		(total, loan) =>
			// overduePrincipal is already part of remainingPrincipal; it tracks the
			// overdue slice for servicing priority and must not inflate debt.
			isOutstandingLoan(loan) ? total + loan.remainingPrincipal : total,
		0
	);
}

export function getTotalAmountDue(game: Pick<GameState, 'finance'>): number {
	return game.finance.loans.reduce(
		(total, loan) =>
			isOutstandingLoan(loan)
				? total +
					loan.remainingPrincipal +
					loan.overdueInterest +
					Math.ceil(loan.accruedInterestMicros / 1_000_000)
				: total,
		0
	);
}

export function getLifetimeRepaymentHistory(finance: FinanceState): {
	scheduledPaymentCount: number;
	onTimePaymentCount: number;
	missedPaymentCount: number;
	missRate: number;
} {
	const history = finance.loans.reduce(
		(total, loan) => ({
			scheduledPaymentCount: total.scheduledPaymentCount + loan.scheduledPaymentCount,
			onTimePaymentCount: total.onTimePaymentCount + loan.onTimePaymentCount,
			missedPaymentCount: total.missedPaymentCount + loan.missedPaymentCount
		}),
		{ scheduledPaymentCount: 0, onTimePaymentCount: 0, missedPaymentCount: 0 }
	);
	return {
		...history,
		missRate:
			history.scheduledPaymentCount === 0
				? 0
				: history.missedPaymentCount / history.scheduledPaymentCount
	};
}

function getHealthScore(game: Pick<GameState, 'scorecard'>): number {
	const { profit, customerSatisfaction, staffMorale, marketPosition } = game.scorecard;
	return (profit + customerSatisfaction + staffMorale + marketPosition) / 4;
}

function getBaseOfferRateBps(termDays: LoanTermDays): number {
	switch (termDays) {
		case 28:
			return 1_000;
		case 56:
			return 1_200;
		case 84:
			return 1_400;
	}
}

export function getOfferRateBps(game: GameState, termDays: LoanTermDays): number {
	const healthScore = getHealthScore(game);
	const { missRate } = getLifetimeRepaymentHistory(game.finance);
	return (
		getBaseOfferRateBps(termDays) + Math.round((100 - healthScore) * 6) + Math.round(missRate * 800)
	);
}

export function projectLoanSchedule(input: {
	principal: number;
	annualInterestRateBps: number;
	termDays: LoanTermDays;
}): CreditScheduleEstimate {
	if (!Number.isInteger(input.principal) || input.principal < 0) {
		throw new RangeError('Projected loan principal must be a non-negative integer');
	}
	const installmentCount = getInstallmentCount(input.termDays);
	const basePrincipal = Math.floor(input.principal / installmentCount);
	const finalRemainder = input.principal % installmentCount;
	let remainingPrincipal = input.principal;
	let accruedInterestMicros = 0;
	const payments: number[] = [];

	for (let installmentIndex = 0; installmentIndex < installmentCount; installmentIndex += 1) {
		accruedInterestMicros +=
			calculateDailyInterestMicros(remainingPrincipal, input.annualInterestRateBps) *
			LOAN_PAYMENT_FREQUENCY_DAYS;
		const isFinalInstallment = installmentIndex === installmentCount - 1;
		const principalPayment =
			installmentIndex === installmentCount - 1 ? basePrincipal + finalRemainder : basePrincipal;
		const interestPayment = isFinalInstallment
			? Math.ceil(accruedInterestMicros / 1_000_000)
			: Math.floor(accruedInterestMicros / 1_000_000);
		payments.push(principalPayment + interestPayment);
		remainingPrincipal -= principalPayment;
		accruedInterestMicros = isFinalInstallment
			? 0
			: accruedInterestMicros - interestPayment * 1_000_000;
	}

	return {
		firstPayment: payments[0] ?? 0,
		regularPayment: payments[1] ?? payments[0] ?? 0,
		peakPayment: Math.max(0, ...payments)
	};
}

export function getNormalizedWeeklyService(
	finance: FinanceState,
	options: { excludeLoanId?: string } = {}
): number {
	return finance.loans.reduce((total, loan) => {
		if (
			!isOutstandingLoan(loan) ||
			loan.id === options.excludeLoanId ||
			loan.nextPaymentDay === null
		) {
			return total;
		}
		const scheduledPrincipal = getScheduledPrincipalForInstallment(
			loan,
			loan.installmentsProcessed
		);
		const exactWeeklyInterest =
			(calculateDailyInterestMicros(loan.remainingPrincipal, loan.annualInterestRateBps) *
				LOAN_PAYMENT_FREQUENCY_DAYS) /
			1_000_000;
		return total + scheduledPrincipal + exactWeeklyInterest;
	}, 0);
}

function getOutstandingPrincipal(
	finance: FinanceState,
	options: { excludeLoanId?: string }
): number {
	return finance.loans.reduce(
		(total, loan) =>
			isOutstandingLoan(loan) && loan.id !== options.excludeLoanId
				? total + loan.remainingPrincipal
				: total,
		0
	);
}

function getAverageDailyOperatingCashFlow(game: Pick<GameState, 'reports'>): number {
	const reports = game.reports.slice(-7);
	if (reports.length === 0) return 0;
	return reports.reduce((total, report) => total + report.operatingCashFlow, 0) / reports.length;
}

function findMaxPrincipalByService(input: {
	principalHeadroom: number;
	weeklyServiceHeadroom: number;
	annualInterestRateBps: number;
	termDays: LoanTermDays;
}): number {
	if (input.weeklyServiceHeadroom === 0) return 0;

	// Derive an interest-free upper bound before scanning: with zero interest the
	// peak payment is the largest installment (ceil(principal / installmentCount)),
	// so any affordable principal satisfies principal <= weeklyServiceHeadroom *
	// installmentCount. Clamp that to the principal headroom and scan downward from
	// there for the first affordable whole-dollar amount. Peak payments are
	// deliberately non-monotonic across consecutive principals, so a binary search
	// would be unsafe; the downward scan stays exact at remainder boundaries.
	const installmentCount = getInstallmentCount(input.termDays);
	const interestFreeBound = Math.floor(input.weeklyServiceHeadroom * installmentCount);
	const upperBound = Math.min(input.principalHeadroom, interestFreeBound);
	for (let principal = upperBound; principal >= 0; principal -= 1) {
		if (
			projectLoanSchedule({
				principal,
				annualInterestRateBps: input.annualInterestRateBps,
				termDays: input.termDays
			}).peakPayment <= input.weeklyServiceHeadroom
		) {
			return principal;
		}
	}
	return 0;
}

export function assessCredit(
	game: GameState,
	termDays: LoanTermDays,
	options: { excludeLoanId?: string } = {}
): CreditAssessment {
	const averageDailyOperatingCashFlow = getAverageDailyOperatingCashFlow(game);
	const weeklyOperatingCashFlow = Math.max(0, averageDailyOperatingCashFlow * 7);
	const healthScore = getHealthScore(game);
	const healthFactor = 0.75 + 0.5 * (healthScore / 100);
	const history = getLifetimeRepaymentHistory(game.finance);
	const historyFactor = Math.max(0.5, 1 - 0.5 * history.missRate);
	const baseRateBps = getBaseOfferRateBps(termDays);
	const healthPenaltyBps = Math.round((100 - healthScore) * 6);
	const historyPenaltyBps = Math.round(history.missRate * 800);
	const annualInterestRateBps = baseRateBps + healthPenaltyBps + historyPenaltyBps;
	const grossPrincipalLimit = Math.max(
		0,
		Math.min(
			100_000,
			Math.floor(
				(15_000 + weeklyOperatingCashFlow * 2 + Math.max(0, game.cash) * 0.25) *
					healthFactor *
					historyFactor
			)
		)
	);
	const outstandingPrincipal = getOutstandingPrincipal(game.finance, options);
	const principalHeadroom = Math.max(0, grossPrincipalLimit - outstandingPrincipal);
	const weeklyPaymentBudget = Math.max(
		0,
		Math.floor((2_500 + weeklyOperatingCashFlow * 0.35) * healthFactor * historyFactor)
	);
	const existingWeeklyDebtService = getNormalizedWeeklyService(game.finance, options);
	const weeklyServiceHeadroom = Math.max(0, weeklyPaymentBudget - existingWeeklyDebtService);
	const hasDelinquentObligation = game.finance.loans.some(
		(loan) => isOutstandingLoan(loan) && (loan.status === 'delinquent' || hasLoanArrears(loan))
	);

	const maxPrincipalByService = hasDelinquentObligation
		? 0
		: findMaxPrincipalByService({
				principalHeadroom,
				weeklyServiceHeadroom,
				annualInterestRateBps,
				termDays
			});
	const availableCredit = hasDelinquentObligation
		? 0
		: Math.min(principalHeadroom, maxPrincipalByService);
	const reasons: CreditAssessmentReason[] = hasDelinquentObligation
		? ['delinquentObligation']
		: maxPrincipalByService < principalHeadroom
			? ['debtServiceCapacityLimited']
			: ['principalCapacityLimited'];

	return {
		termDays,
		baseRateBps,
		healthPenaltyBps,
		historyPenaltyBps,
		annualInterestRateBps,
		averageDailyOperatingCashFlow,
		weeklyOperatingCashFlow,
		healthScore,
		healthFactor,
		lifetimeScheduledPaymentCount: history.scheduledPaymentCount,
		lifetimeMissedPaymentCount: history.missedPaymentCount,
		lifetimeMissRate: history.missRate,
		historyFactor,
		grossPrincipalLimit,
		outstandingPrincipal,
		principalHeadroom,
		weeklyPaymentBudget,
		existingWeeklyDebtService,
		weeklyServiceHeadroom,
		maxPrincipalByService,
		availableCredit,
		availableCreditSchedule: projectLoanSchedule({
			principal: availableCredit,
			annualInterestRateBps,
			termDays
		}),
		reasons
	};
}

export function getExpansionFinanceOffer(
	game: GameState,
	purchaseCost: number
): ExpansionFinanceOffer | null {
	const principal = purchaseCost - game.cash;
	if (!Number.isSafeInteger(purchaseCost) || principal <= 0) return null;

	const assessment = assessCredit(game, FOUNDING_LOAN_TERM_DAYS);
	if (principal > assessment.availableCredit) return null;

	return {
		principal,
		termDays: FOUNDING_LOAN_TERM_DAYS,
		annualInterestRateBps: assessment.annualInterestRateBps,
		estimatedPeakPayment: projectLoanSchedule({
			principal,
			annualInterestRateBps: assessment.annualInterestRateBps,
			termDays: FOUNDING_LOAN_TERM_DAYS
		}).peakPayment
	};
}

function failure(
	code: FinanceFailureCode,
	context: Record<string, string | number> = {}
): FinanceActionFailure {
	return { ok: false, code, context };
}

function isSupportedTermDays(termDays: number): termDays is LoanTermDays {
	return termDays === 28 || termDays === 56 || termDays === 84;
}

function isValidActionAmount(amount: number): boolean {
	return Number.isSafeInteger(amount) && amount > 0;
}

function createActionLoan(input: {
	id: string;
	purpose: LoanInstrument['purpose'];
	principal: number;
	annualInterestRateBps: number;
	termDays: LoanTermDays;
	day: number;
	refinancedFromLoanId?: string;
}): LoanInstrument {
	return {
		id: input.id,
		purpose: input.purpose,
		status: 'active',
		openedOnDay: input.day,
		originalPrincipal: input.principal,
		remainingPrincipal: input.principal,
		annualInterestRateBps: input.annualInterestRateBps,
		termDays: input.termDays,
		installmentsProcessed: 0,
		nextPaymentDay: input.day + LOAN_PAYMENT_FREQUENCY_DAYS,
		lastInterestAccrualDay: input.day,
		accruedInterestMicros: 0,
		overdueInterest: 0,
		overduePrincipal: 0,
		arrearsSinceDay: null,
		scheduledPaymentCount: 0,
		onTimePaymentCount: 0,
		missedPaymentCount: 0,
		...(input.refinancedFromLoanId === undefined
			? {}
			: { refinancedFromLoanId: input.refinancedFromLoanId })
	};
}

export function borrow(
	game: GameState,
	input: BorrowInput
): FinanceActionResult<{
	loanId: string;
	amount: number;
	annualInterestRateBps: number;
}> {
	if (!isSupportedTermDays(input.termDays)) {
		return failure('unsupportedTerm', { termDays: input.termDays });
	}
	if (!['workingCapital', 'emergency', 'supplierCredit', 'expansion'].includes(input.purpose)) {
		return failure('unsupportedPurpose', { purpose: input.purpose });
	}
	if (!isValidActionAmount(input.amount)) {
		return failure('invalidAmount', { amount: input.amount });
	}
	if (input.purpose === 'workingCapital' && !input.allowBelowMinimum && input.amount < 1_000) {
		return failure('belowMinimumBorrowing', { amount: input.amount, minimum: 1_000 });
	}

	const assessment = assessCredit(game, input.termDays);
	if (input.amount > assessment.availableCredit) {
		return failure('insufficientCredit', {
			amount: input.amount,
			availableCredit: assessment.availableCredit
		});
	}

	const loanId = `loan-${game.finance.nextLoanSequence}`;
	const loan = createActionLoan({
		id: loanId,
		purpose: input.purpose,
		principal: input.amount,
		annualInterestRateBps: assessment.annualInterestRateBps,
		termDays: input.termDays,
		day: game.day
	});
	let finance: FinanceState = {
		...game.finance,
		loans: [...game.finance.loans, loan],
		nextLoanSequence: game.finance.nextLoanSequence + 1
	};
	finance = appendFinanceTransaction(finance, {
		day: game.day,
		kind: 'disbursement',
		loanId,
		cashDelta: input.amount,
		principalAmount: input.amount,
		principalDelta: input.amount,
		interestAmount: 0
	});
	return {
		ok: true,
		game: { ...game, cash: game.cash + input.amount, finance },
		receipt: {
			loanId,
			amount: input.amount,
			annualInterestRateBps: assessment.annualInterestRateBps
		}
	};
}

function findActionLoan(game: GameState, loanId: string): ActionLoanLookup {
	const loan = game.finance.loans.find((candidate) => candidate.id === loanId);
	if (loan === undefined) return failure('loanNotFound', { loanId });
	if (!isOutstandingLoan(loan)) return failure('loanClosed', { loanId, status: loan.status });
	return { ok: true, loan };
}

export function getPayoffAmount(loan: LoanInstrument): number {
	return (
		loan.remainingPrincipal +
		loan.overdueInterest +
		Math.ceil(loan.accruedInterestMicros / 1_000_000)
	);
}

export function getPayoffQuote(
	game: GameState,
	loanId: string
): FinanceActionResult<{ loanId: string; amount: number }> {
	const found = findActionLoan(game, loanId);
	if (!found.ok) return found;
	return { ok: true, game, receipt: { loanId, amount: getPayoffAmount(found.loan) } };
}

function applyRepayment(
	loan: LoanInstrument,
	amount: number
): {
	loan: LoanInstrument;
	principalPaid: number;
	interestPaid: number;
} {
	const payoffAmount = getPayoffAmount(loan);
	const isClosingPayment = amount === payoffAmount;
	let remainingAmount = amount;
	let next = loan;
	let interestPaid = 0;
	let principalPaid = 0;

	const overdueInterestPaid = Math.min(remainingAmount, next.overdueInterest);
	next = { ...next, overdueInterest: next.overdueInterest - overdueInterestPaid };
	remainingAmount -= overdueInterestPaid;
	interestPaid += overdueInterestPaid;

	const wholeAccruedInterest = Math.floor(next.accruedInterestMicros / 1_000_000);
	const accruedInterestPaid = Math.min(remainingAmount, wholeAccruedInterest);
	next = {
		...next,
		accruedInterestMicros: next.accruedInterestMicros - accruedInterestPaid * 1_000_000
	};
	remainingAmount -= accruedInterestPaid;
	interestPaid += accruedInterestPaid;

	const overduePrincipalPaid = Math.min(remainingAmount, next.overduePrincipal);
	next = {
		...next,
		overduePrincipal: next.overduePrincipal - overduePrincipalPaid,
		remainingPrincipal: next.remainingPrincipal - overduePrincipalPaid
	};
	remainingAmount -= overduePrincipalPaid;
	principalPaid += overduePrincipalPaid;

	const principalPayment = Math.min(remainingAmount, next.remainingPrincipal);
	next = { ...next, remainingPrincipal: next.remainingPrincipal - principalPayment };
	remainingAmount -= principalPayment;
	principalPaid += principalPayment;

	if (isClosingPayment && next.accruedInterestMicros > 0) {
		const fractionalClosePayment = Math.ceil(next.accruedInterestMicros / 1_000_000);
		next = { ...next, accruedInterestMicros: 0 };
		remainingAmount -= fractionalClosePayment;
		interestPaid += fractionalClosePayment;
	}

	if (remainingAmount !== 0) {
		throw new Error('Repayment allocation did not reconcile');
	}
	return { loan: finalizeLoanStatus(next), principalPaid, interestPaid };
}

export function repayLoan(
	game: GameState,
	input: { loanId: string; amount: number }
): FinanceActionResult<{ loanId: string; principalPaid: number; interestPaid: number }> {
	const found = findActionLoan(game, input.loanId);
	if (!found.ok) return found;
	if (!isValidActionAmount(input.amount)) {
		return failure('invalidAmount', { amount: input.amount });
	}
	const payoffAmount = getPayoffAmount(found.loan);
	if (input.amount > payoffAmount) {
		return failure('overpayment', { amount: input.amount, payoffAmount });
	}
	if (game.cash < input.amount) {
		return failure('insufficientCash', { cash: game.cash, amount: input.amount });
	}

	const repayment = applyRepayment(found.loan, input.amount);
	let finance = replaceLoan(game.finance, repayment.loan);
	finance = appendPaymentTransaction(
		finance,
		found.loan.id,
		game.day,
		'interestPayment',
		repayment.interestPaid
	);
	finance = appendPaymentTransaction(
		finance,
		found.loan.id,
		game.day,
		'principalPayment',
		repayment.principalPaid
	);
	return {
		ok: true,
		game: { ...game, cash: game.cash - input.amount, finance },
		receipt: {
			loanId: found.loan.id,
			principalPaid: repayment.principalPaid,
			interestPaid: repayment.interestPaid
		}
	};
}

export function payOffLoan(
	game: GameState,
	loanId: string
): FinanceActionResult<{ loanId: string; principalPaid: number; interestPaid: number }> {
	const quote = getPayoffQuote(game, loanId);
	if (!quote.ok) return quote;
	return repayLoan(game, { loanId, amount: quote.receipt.amount });
}

export function refinanceLoan(
	game: GameState,
	input: { loanId: string; termDays: LoanTermDays }
): FinanceActionResult<{ oldLoanId: string; newLoanId: string; capitalizedInterest: number }> {
	if (!isSupportedTermDays(input.termDays)) {
		return failure('unsupportedTerm', { termDays: input.termDays });
	}
	const found = findActionLoan(game, input.loanId);
	if (!found.ok) return found;
	if (found.loan.status === 'delinquent' || hasLoanArrears(found.loan)) {
		return failure('loanDelinquent', { loanId: found.loan.id });
	}

	const payoffAmount = getPayoffAmount(found.loan);
	const assessment = assessCredit(game, input.termDays, { excludeLoanId: found.loan.id });
	if (payoffAmount > assessment.availableCredit) {
		return failure('insufficientCredit', {
			amount: payoffAmount,
			availableCredit: assessment.availableCredit
		});
	}

	const newLoanId = `loan-${game.finance.nextLoanSequence}`;
	const capitalizedInterest = payoffAmount - found.loan.remainingPrincipal;
	const newLoan = createActionLoan({
		id: newLoanId,
		purpose: 'refinance',
		principal: payoffAmount,
		annualInterestRateBps: assessment.annualInterestRateBps,
		termDays: input.termDays,
		day: game.day,
		refinancedFromLoanId: found.loan.id
	});
	const closedLoan: LoanInstrument = {
		...found.loan,
		status: 'refinanced',
		remainingPrincipal: 0,
		accruedInterestMicros: 0,
		overdueInterest: 0,
		overduePrincipal: 0,
		arrearsSinceDay: null,
		nextPaymentDay: null,
		refinancedByLoanId: newLoanId
	};
	let finance: FinanceState = {
		...game.finance,
		loans: game.finance.loans
			.map((loan) => (loan.id === found.loan.id ? closedLoan : loan))
			.concat(newLoan),
		nextLoanSequence: game.finance.nextLoanSequence + 1
	};
	finance = appendFinanceTransaction(finance, {
		day: game.day,
		kind: 'refinance',
		loanId: newLoanId,
		relatedLoanId: found.loan.id,
		cashDelta: 0,
		principalAmount: payoffAmount,
		principalDelta: capitalizedInterest,
		interestAmount: capitalizedInterest
	});
	return {
		ok: true,
		game: { ...game, finance },
		receipt: {
			oldLoanId: found.loan.id,
			newLoanId,
			capitalizedInterest
		}
	};
}
