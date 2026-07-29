import {
	assessCredit,
	calculateDailyInterestMicros,
	estimateNextLoanPayment,
	getInstallmentCount,
	getScheduledPrincipalForInstallment,
	getTotalAmountDue
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

interface ProjectedLoan extends LoanInstrument {
	closed: boolean;
}

function isOutstandingLoan(loan: LoanInstrument): boolean {
	return loan.status === 'active' || loan.status === 'delinquent';
}

function compareLoans(left: LoanInstrument, right: LoanInstrument): number {
	return (
		left.nextPaymentDay! - right.nextPaymentDay! ||
		left.openedOnDay - right.openedOnDay ||
		(left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
	);
}

function projectLoanPayment(
	loan: ProjectedLoan,
	day: number
): { principal: number; interest: number } {
	const accruedInterestMicros =
		loan.accruedInterestMicros +
		calculateDailyInterestMicros(loan.remainingPrincipal, loan.annualInterestRateBps) *
			Math.max(0, day - loan.lastInterestAccrualDay);
	const installmentCount = getInstallmentCount(loan.termDays);
	const isFinalInstallment = loan.installmentsProcessed === installmentCount - 1;
	const scheduledPrincipal = getScheduledPrincipalForInstallment(loan, loan.installmentsProcessed);
	const accruedInterest = isFinalInstallment
		? Math.ceil(accruedInterestMicros / 1_000_000)
		: Math.floor(accruedInterestMicros / 1_000_000);
	const principal = loan.overduePrincipal + scheduledPrincipal;
	const interest = loan.overdueInterest + accruedInterest;

	loan.remainingPrincipal = Math.max(0, loan.remainingPrincipal - principal);
	loan.overduePrincipal = 0;
	loan.overdueInterest = 0;
	loan.accruedInterestMicros = isFinalInstallment
		? 0
		: accruedInterestMicros - accruedInterest * 1_000_000;
	loan.lastInterestAccrualDay = day;
	loan.installmentsProcessed += 1;
	loan.nextPaymentDay = loan.installmentsProcessed === installmentCount ? null : day + 7;
	loan.closed = loan.remainingPrincipal === 0 && loan.accruedInterestMicros === 0;

	return { principal, interest };
}

export function projectScheduledDebtService(
	game: GameState,
	fromDay: number,
	throughDay: number
): ScheduledDebtService[] {
	if (throughDay < game.day + 1 || throughDay < fromDay) return [];

	const projectedLoans: ProjectedLoan[] = game.finance.loans
		.filter((loan) => isOutstandingLoan(loan) && loan.nextPaymentDay !== null)
		.map((loan) => ({ ...loan, closed: false }));
	const services = new Map<number, ScheduledDebtService>();

	for (let day = game.day + 1; day <= throughDay; day += 1) {
		const dueLoans = projectedLoans
			.filter((loan) => !loan.closed && loan.nextPaymentDay === day)
			.sort(compareLoans);
		for (const loan of dueLoans) {
			const payment = projectLoanPayment(loan, day);
			if (day < fromDay || payment.principal + payment.interest === 0) continue;
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
			scheduled.loanIds.push(loan.id);
			services.set(day, scheduled);
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
