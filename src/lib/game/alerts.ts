import { hasLoanArrears, isOutstandingLoan } from './finance';
import { getAlertFinanceSnapshot } from './financeMetrics';
import type { GameState, LoanInstrument } from './types';

/** Debt-service coverage ratio below which a covenant-risk alert fires. */
export const COVENANT_THRESHOLD = 1.25;
/** Cash runway (in days) at or below which a low-cash-runway alert fires. */
export const LOW_CASH_RUNWAY_DAYS = 7;

export type GameAlertKind =
	| 'store-stock'
	| 'decision'
	| 'event-modifier'
	| 'factory-blocked'
	| 'upcomingLoanPayment'
	| 'missedLoanPayment'
	| 'covenantRisk'
	| 'lowCashRunway';

export interface GameAlert {
	id: string;
	kind: GameAlertKind;
	message?: string;
	cityId?: string;
	storeId?: string;
	buildingId?: string;
	tileId?: string;
	decisionId?: string;
	modifierId?: string;
	loanId?: string;
	managementPanelId?: 'finance' | 'decisions';
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
		alerts.push({
			id: `upcomingLoanPayment:${loan.id}`,
			kind: 'upcomingLoanPayment',
			loanId: loan.id,
			managementPanelId: 'finance'
		});
	}

	// Finance metrics are a single coherent snapshot for the entire group. They
	// are derived here rather than persisted, just like the existing alert groups.
	// Covenant risk is gated on debt service (debtServiceCoverage is null without
	// scheduled service), but cash runway is meaningful without debt: a debt-free
	// company with negative cash has a zero-day runway and must still be alerted.
	//
	// Use the lightweight alert snapshot rather than getFinanceMetrics. The full
	// snapshot also runs three term-specific credit assessments (each potentially
	// performing an exact whole-dollar downward scan via findMaxPrincipalByService)
	// that alerts never consume. Normal games always carry the Founding Loan, so
	// routing the reactive alert path through getFinanceMetrics would repeat those
	// scans on every game-state update. debtServiceCoverage is naturally null when
	// there is no scheduled service, so the debt-free case needs no special branch.
	const { debtServiceCoverage, cashRunway } = getAlertFinanceSnapshot(game);

	if (debtServiceCoverage !== null && debtServiceCoverage < COVENANT_THRESHOLD) {
		alerts.push({
			id: 'covenantRisk',
			kind: 'covenantRisk',
			managementPanelId: 'finance'
		});
	}

	if (cashRunway.kind === 'days' && cashRunway.days <= LOW_CASH_RUNWAY_DAYS) {
		alerts.push({
			id: 'lowCashRunway',
			kind: 'lowCashRunway',
			managementPanelId: 'finance'
		});
	}

	return alerts;
}

export function collectGameAlerts(game: GameState): GameAlert[] {
	const alerts: GameAlert[] = [];

	for (const store of game.stores) {
		if (
			!store.products.some(
				(product) => product.stock <= 0 || product.stock < product.reorderThreshold
			)
		) {
			continue;
		}

		alerts.push({
			id: `store-stock:${store.id}`,
			kind: 'store-stock',
			cityId: store.cityId,
			storeId: store.id,
			tileId: store.tileId
		});
	}

	for (const decision of game.decisions) {
		alerts.push({
			id: `decision:${decision.id}`,
			kind: 'decision',
			decisionId: decision.id
		});
	}

	const importantModifiers = game.events.activeModifiers
		.filter((modifier) => modifier.importance === 'important')
		.sort(
			(left, right) =>
				left.expiresOnDay - right.expiresOnDay ||
				(left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
		);
	for (const modifier of importantModifiers) {
		alerts.push({
			id: `event-modifier:${modifier.id}`,
			kind: 'event-modifier',
			modifierId: modifier.id,
			managementPanelId: 'decisions'
		});
	}

	for (const building of game.industrialBuildings) {
		if (building.status !== 'blocked' && building.blockedDays <= 0) {
			continue;
		}

		alerts.push({
			id: `factory-blocked:${building.id}`,
			kind: 'factory-blocked',
			cityId: building.cityId,
			buildingId: building.id,
			tileId: building.tileId
		});
	}

	alerts.push(...collectFinanceAlerts(game));

	return alerts;
}
