import { INDUSTRIAL_BUILDING_TYPES } from './industry';
import { estimateNextLoanPayment, hasLoanArrears, isOutstandingLoan } from './finance';
import { getFinanceMetrics } from './financeMetrics';
import { storeNameOrOrdinal } from './state';
import { summarizeStockTrouble } from './stock';
import type { GameState, LoanInstrument } from './types';

/** Debt-service coverage ratio below which a covenant-risk alert fires. */
export const COVENANT_THRESHOLD = 1.25;
/** Cash runway (in days) at or below which a low-cash-runway alert fires. */
export const LOW_CASH_RUNWAY_DAYS = 7;

export type GameAlertKind =
	| 'store-stock'
	| 'decision'
	| 'factory-blocked'
	| 'upcomingLoanPayment'
	| 'missedLoanPayment'
	| 'covenantRisk'
	| 'lowCashRunway';

export interface GameAlert {
	id: string;
	kind: GameAlertKind;
	message: string;
	cityId?: string;
	storeId?: string;
	buildingId?: string;
	tileId?: string;
	decisionId?: string;
	loanId?: string;
	managementPanelId?: 'finance';
}

function compareByNumberThenId(
	left: LoanInstrument,
	right: LoanInstrument,
	leftValue: number | null,
	rightValue: number | null
): number {
	return (
		(leftValue ?? Number.MAX_SAFE_INTEGER) - (rightValue ?? Number.MAX_SAFE_INTEGER) ||
		(left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
	);
}

function collectFinanceAlerts(game: GameState): GameAlert[] {
	const alerts: GameAlert[] = [];
	const missedLoans = game.finance.loans
		.filter((loan) => isOutstandingLoan(loan) && hasLoanArrears(loan))
		.sort((left, right) =>
			compareByNumberThenId(left, right, left.arrearsSinceDay, right.arrearsSinceDay)
		);

	for (const loan of missedLoans) {
		alerts.push({
			id: `missedLoanPayment:${loan.id}`,
			kind: 'missedLoanPayment',
			message: `Missed payment on ${loan.id}`,
			loanId: loan.id,
			managementPanelId: 'finance'
		});
	}

	const upcomingLoans = game.finance.loans
		.filter(
			(loan) =>
				isOutstandingLoan(loan) &&
				loan.nextPaymentDay !== null &&
				loan.nextPaymentDay >= game.day &&
				loan.nextPaymentDay <= game.day + 3
		)
		.sort((left, right) =>
			compareByNumberThenId(left, right, left.nextPaymentDay, right.nextPaymentDay)
		);

	for (const loan of upcomingLoans) {
		const amount = estimateNextLoanPayment(loan);
		alerts.push({
			id: `upcomingLoanPayment:${loan.id}`,
			kind: 'upcomingLoanPayment',
			message: `Loan payment of $${amount.toLocaleString('en-US')} due on day ${loan.nextPaymentDay}`,
			loanId: loan.id,
			managementPanelId: 'finance'
		});
	}

	// Finance metrics are a single coherent snapshot for the entire group. They
	// are derived here rather than persisted, just like the existing alert groups.
	// Covenant risk is gated on debt service (debtServiceCoverage is null without
	// scheduled service), but cash runway is meaningful without debt: a debt-free
	// company with negative cash has a zero-day runway and must still be alerted.
	const metrics = getFinanceMetrics(game);

	if (metrics.debtServiceCoverage !== null && metrics.debtServiceCoverage < COVENANT_THRESHOLD) {
		alerts.push({
			id: 'covenantRisk',
			kind: 'covenantRisk',
			message: `Debt-service coverage is below ${COVENANT_THRESHOLD}.`,
			managementPanelId: 'finance'
		});
	}

	if (metrics.cashRunway.kind === 'days' && metrics.cashRunway.days <= LOW_CASH_RUNWAY_DAYS) {
		alerts.push({
			id: 'lowCashRunway',
			kind: 'lowCashRunway',
			message: `Cash runway is ${metrics.cashRunway.days} days.`,
			managementPanelId: 'finance'
		});
	}

	return alerts;
}

export function collectGameAlerts(game: GameState): GameAlert[] {
	const alerts: GameAlert[] = [];

	for (const [index, store] of game.stores.entries()) {
		const summary = summarizeStockTrouble(store.products);

		if (!summary) {
			continue;
		}

		alerts.push({
			id: `store-stock:${store.id}`,
			kind: 'store-stock',
			message: `${storeNameOrOrdinal(store, index + 1)}: ${summary}`,
			cityId: store.cityId,
			storeId: store.id,
			tileId: store.tileId
		});
	}

	for (const decision of game.decisions) {
		alerts.push({
			id: `decision:${decision.id}`,
			kind: 'decision',
			message: `Decision: ${decision.title}`,
			decisionId: decision.id
		});
	}

	for (const building of game.industrialBuildings) {
		if (building.status !== 'blocked' && building.blockedDays <= 0) {
			continue;
		}

		const name = INDUSTRIAL_BUILDING_TYPES[building.typeId]?.name ?? building.typeId;

		alerts.push({
			id: `factory-blocked:${building.id}`,
			kind: 'factory-blocked',
			message: `${name} starved of inputs`,
			cityId: building.cityId,
			buildingId: building.id,
			tileId: building.tileId
		});
	}

	alerts.push(...collectFinanceAlerts(game));

	return alerts;
}
