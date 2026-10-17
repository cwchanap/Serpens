import type { GameAlert } from './alerts';
import { CASH_RISK_ALERT_KINDS } from './openingGuidance';
import type { GameState } from './types';

/**
 * Recovery steps for a sandbox company that is running out of cash after the
 * opening window has closed. Opening Guidance only names the danger; this read
 * model lists the levers that can actually stop the slide, in the order a
 * player should try them: restore revenue, raise cash, then cut fixed costs.
 *
 * It triggers on the same same-day cash alerts as Opening Guidance's
 * `cash-risk` lane (`missedLoanPayment`, `lowCashRunway`). Structural finance
 * alerts never trigger it.
 */
export type CashRecoveryStep =
	| { kind: 'restock'; alert: GameAlert }
	| { kind: 'finance'; alert: GameAlert }
	| { kind: 'release-idle-staff'; count: number }
	| { kind: 'review-payroll' }
	| { kind: 'pause-routes'; count: number };

export interface CashRecoveryPlan {
	/** The cash alert that triggered the plan; its kind keys dismissal. */
	alert: GameAlert;
	steps: CashRecoveryStep[];
}

export function selectCashRecovery(
	game: GameState | null,
	alerts: readonly GameAlert[]
): CashRecoveryPlan | null {
	if (game === null) return null;

	const cashAlert = alerts.find((alert) => CASH_RISK_ALERT_KINDS.includes(alert.kind));
	if (!cashAlert) return null;

	const steps: CashRecoveryStep[] = [];

	const stockAlert = alerts.find((alert) => alert.kind === 'store-stock');
	if (stockAlert) steps.push({ kind: 'restock', alert: stockAlert });

	steps.push({ kind: 'finance', alert: cashAlert });

	// Payroll is charged for every hired member, assigned or not, so idle
	// staff are pure cost.
	const idleStaffCount = game.staff.filter((member) => member.assignedStoreId === null).length;
	if (idleStaffCount > 0) {
		steps.push({ kind: 'release-idle-staff', count: idleStaffCount });
	} else if (game.staff.length > 0) {
		steps.push({ kind: 'review-payroll' });
	}

	const activeRouteCount = game.logistics.recurringRoutes.filter(
		(route) => route.state === 'active'
	).length;
	if (activeRouteCount > 0) steps.push({ kind: 'pause-routes', count: activeRouteCount });

	return { alert: cashAlert, steps };
}
