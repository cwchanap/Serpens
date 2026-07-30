import {
	assessCredit,
	calculateDailyInterestMicros,
	estimateNextLoanPayment,
	getInstallmentCount,
	getScheduledPrincipalForInstallment,
	getTotalAmountDue,
	hasLoanArrears,
	isOutstandingLoan,
	LOAN_PAYMENT_FREQUENCY_DAYS,
	moveWholeMaturedInterestToArrears
} from './finance';
import type { CreditAssessment } from './finance';
import type { GameState, LoanInstrument, LoanPaymentSnapshot, LoanTermDays } from './types';

export type CashRunway = { kind: 'days'; days: number } | { kind: 'ninetyPlus' };

export interface ScheduledDebtService {
	day: number;
	principal: number;
	interest: number;
	total: number;
	loanIds: string[];
}

export interface FinanceMetrics {
	outstandingPrincipal: number;
	amountDue: number;
	nextLoanPayment: LoanPaymentSnapshot | null;
	trailingSevenDayOperatingCashFlow: number;
	averageDailyOperatingCashFlow: number;
	scheduledDebtServiceNextSevenDays: number;
	scheduledDebtServiceByDay: ScheduledDebtService[];
	debtServiceCoverage: number | null;
	creditAssessments: Record<LoanTermDays, CreditAssessment>;
	cashRunway: CashRunway;
}

function compareLoans(left: LoanInstrument, right: LoanInstrument): number {
	return (
		left.nextPaymentDay! - right.nextPaymentDay! ||
		left.openedOnDay - right.openedOnDay ||
		(left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
	);
}

function compareArrears(left: LoanInstrument, right: LoanInstrument): number {
	return (
		(left.arrearsSinceDay ?? Number.MAX_SAFE_INTEGER) -
			(right.arrearsSinceDay ?? Number.MAX_SAFE_INTEGER) ||
		left.openedOnDay - right.openedOnDay ||
		(left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
	);
}

function finalizeProjectedLoanStatus(loan: LoanInstrument): void {
	if (
		loan.remainingPrincipal === 0 &&
		loan.overdueInterest === 0 &&
		loan.overduePrincipal === 0 &&
		loan.accruedInterestMicros === 0
	) {
		loan.status = 'paid';
		loan.arrearsSinceDay = null;
		loan.nextPaymentDay = null;
		return;
	}
	if (hasLoanArrears(loan)) {
		loan.status = 'delinquent';
		return;
	}
	if (loan.status === 'delinquent' && loan.nextPaymentDay !== null) {
		loan.status = 'active';
		loan.arrearsSinceDay = null;
	}
}

function accrueProjectedLoanThroughDay(loan: LoanInstrument, day: number): void {
	if (day <= loan.lastInterestAccrualDay) return;
	loan.accruedInterestMicros +=
		calculateDailyInterestMicros(loan.remainingPrincipal, loan.annualInterestRateBps) *
		(day - loan.lastInterestAccrualDay);
	loan.lastInterestAccrualDay = day;
}

function payProjectedArrears(loan: LoanInstrument): { principal: number; interest: number } {
	const interest = loan.overdueInterest;
	const principal = loan.overduePrincipal;
	loan.overdueInterest = 0;
	loan.overduePrincipal = 0;
	loan.remainingPrincipal = Math.max(0, loan.remainingPrincipal - principal);
	return { principal, interest };
}

function projectDueLoanPayment(
	loan: LoanInstrument,
	day: number
): { principal: number; interest: number } {
	const installmentCount = getInstallmentCount(loan.termDays);
	const isFinalInstallment = loan.installmentsProcessed === installmentCount - 1;
	const scheduledPrincipal = getScheduledPrincipalForInstallment(loan, loan.installmentsProcessed);
	const wholeAccruedInterest = Math.floor(loan.accruedInterestMicros / 1_000_000);
	loan.accruedInterestMicros -= wholeAccruedInterest * 1_000_000;
	loan.overdueInterest += wholeAccruedInterest;
	loan.overduePrincipal += scheduledPrincipal;
	loan.installmentsProcessed += 1;
	loan.nextPaymentDay =
		loan.installmentsProcessed === installmentCount ? null : day + LOAN_PAYMENT_FREQUENCY_DAYS;
	const payment = payProjectedArrears(loan);
	if (isFinalInstallment && loan.accruedInterestMicros > 0) {
		loan.arrearsSinceDay ??= day;
	}
	finalizeProjectedLoanStatus(loan);
	return payment;
}

function moveMaturedProjectedInterestToArrears(loan: LoanInstrument): void {
	if (loan.nextPaymentDay !== null || loan.accruedInterestMicros === 0) return;
	const moved = moveWholeMaturedInterestToArrears(loan);
	loan.overdueInterest = moved.overdueInterest;
	loan.accruedInterestMicros = moved.accruedInterestMicros;
	// The projection has no cash context, so fractional matured interest is
	// always rounded up to arrears (conservative). The real ledger applies a
	// cash-availability rule before rounding up fractional interest.
	if (loan.accruedInterestMicros > 0) {
		loan.overdueInterest += Math.ceil(loan.accruedInterestMicros / 1_000_000);
		loan.accruedInterestMicros = 0;
	}
}

export function projectScheduledDebtService(
	game: GameState,
	fromDay: number,
	throughDay: number
): ScheduledDebtService[] {
	if (throughDay < game.day + 1 || throughDay < fromDay) return [];

	const projectedLoans = game.finance.loans.filter(isOutstandingLoan).map((loan) => ({ ...loan }));
	const services = new Map<number, ScheduledDebtService>();
	const recordPayment = (
		day: number,
		loanId: string,
		payment: { principal: number; interest: number }
	): void => {
		if (day < fromDay || payment.principal + payment.interest === 0) return;
		const scheduled = services.get(day) ?? {
			day,
			principal: 0,
			interest: 0,
			total: 0,
			loanIds: []
		};
		scheduled.principal += payment.principal;
		scheduled.interest += payment.interest;
		scheduled.total += payment.principal + payment.interest;
		if (!scheduled.loanIds.includes(loanId)) scheduled.loanIds.push(loanId);
		services.set(day, scheduled);
	};

	for (let day = game.day + 1; day <= throughDay; day += 1) {
		for (const loan of projectedLoans) {
			if (isOutstandingLoan(loan)) accrueProjectedLoanThroughDay(loan, day);
		}
		const dueLoans = projectedLoans
			.filter((loan) => isOutstandingLoan(loan) && loan.nextPaymentDay === day)
			.sort(compareLoans);
		for (const loan of dueLoans) {
			recordPayment(day, loan.id, projectDueLoanPayment(loan, day));
		}
		const delinquentLoans = projectedLoans
			.filter((loan) => loan.status === 'delinquent')
			.sort(compareArrears);
		for (const loan of delinquentLoans) {
			moveMaturedProjectedInterestToArrears(loan);
			recordPayment(day, loan.id, payProjectedArrears(loan));
			finalizeProjectedLoanStatus(loan);
		}
	}

	return [...services.values()];
}

function getNextLoanPayment(game: GameState): LoanPaymentSnapshot | null {
	const loan = game.finance.loans
		.filter((candidate) => isOutstandingLoan(candidate) && candidate.nextPaymentDay !== null)
		.sort(compareLoans)[0];
	return loan === undefined
		? null
		: { loanId: loan.id, day: loan.nextPaymentDay!, amount: estimateNextLoanPayment(loan) };
}

function getTrailingOperatingCashFlow(game: GameState): {
	total: number;
	average: number;
} {
	const reports = game.reports.slice(-7);
	const total = reports.reduce((sum, report) => sum + report.operatingCashFlow, 0);
	return { total, average: reports.length === 0 ? 0 : total / reports.length };
}

export function projectCashRunway(game: GameState, horizonDays = 90): CashRunway {
	if (game.cash < 0) return { kind: 'days', days: 0 };

	const horizon = Math.max(0, Math.floor(horizonDays));
	const { average } = getTrailingOperatingCashFlow(game);
	const scheduledServiceByDay = new Map(
		projectScheduledDebtService(game, game.day + 1, game.day + horizon).map((service) => [
			service.day,
			service.total
		])
	);
	let projectedCash = game.cash;
	for (let projectedDay = 1; projectedDay <= horizon; projectedDay += 1) {
		const day = game.day + projectedDay;
		projectedCash += average - (scheduledServiceByDay.get(day) ?? 0);
		if (projectedCash < 0) return { kind: 'days', days: projectedDay };
	}

	return { kind: 'ninetyPlus' };
}

export interface AlertFinanceSnapshot {
	debtServiceCoverage: number | null;
	cashRunway: CashRunway;
}

/**
 * Lightweight finance slice for alert derivation. Computes only debt-service
 * coverage and cash runway — the two metrics `collectGameAlerts` consumes —
 * without the three term-specific `assessCredit` scans that `getFinanceMetrics`
 * runs for the Finance panel. Each `assessCredit` can perform an exact
 * whole-dollar downward scan via `findMaxPrincipalByService`, so routing the
 * reactive alert path through `getFinanceMetrics` would repeat that work on
 * every game-state update even though alerts never read `creditAssessments`.
 */
export function getAlertFinanceSnapshot(game: GameState): AlertFinanceSnapshot {
	const trailingOperatingCashFlow = getTrailingOperatingCashFlow(game);
	const scheduledDebtServiceNextSevenDays = projectScheduledDebtService(
		game,
		game.day + 1,
		game.day + 7
	).reduce((total, scheduled) => total + scheduled.total, 0);

	return {
		debtServiceCoverage:
			scheduledDebtServiceNextSevenDays === 0
				? null
				: Math.max(0, trailingOperatingCashFlow.total) / scheduledDebtServiceNextSevenDays,
		cashRunway: projectCashRunway(game)
	};
}

export function getFinanceMetrics(game: GameState): FinanceMetrics {
	const trailingOperatingCashFlow = getTrailingOperatingCashFlow(game);
	const scheduledDebtServiceByDay = projectScheduledDebtService(game, game.day + 1, game.day + 7);
	const scheduledDebtServiceNextSevenDays = scheduledDebtServiceByDay.reduce(
		(total, scheduled) => total + scheduled.total,
		0
	);

	return {
		outstandingPrincipal: game.finance.loans.reduce(
			(total, loan) => (isOutstandingLoan(loan) ? total + loan.remainingPrincipal : total),
			0
		),
		amountDue: getTotalAmountDue(game),
		nextLoanPayment: getNextLoanPayment(game),
		trailingSevenDayOperatingCashFlow: trailingOperatingCashFlow.total,
		averageDailyOperatingCashFlow: trailingOperatingCashFlow.average,
		scheduledDebtServiceNextSevenDays,
		scheduledDebtServiceByDay,
		debtServiceCoverage:
			scheduledDebtServiceNextSevenDays === 0
				? null
				: Math.max(0, trailingOperatingCashFlow.total) / scheduledDebtServiceNextSevenDays,
		creditAssessments: {
			28: assessCredit(game, 28),
			56: assessCredit(game, 56),
			84: assessCredit(game, 84)
		},
		cashRunway: projectCashRunway(game)
	};
}
