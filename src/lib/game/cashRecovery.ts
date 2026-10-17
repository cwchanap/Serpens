import type { GameAlert } from './alerts';
import { CASH_RISK_ALERT_KINDS } from './openingGuidance';
import { summarizeStoreStaffing } from './staffing';
import type { GameState, StaffRole } from './types';

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
	| { kind: 'assign-idle-staff'; count: number }
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

	// Coverage scales store demand, so an idle member who can fill a store's
	// role shortage restores revenue; only the rest are pure payroll cost.
	const { coverable, surplus } = countIdleStaff(game);
	if (coverable > 0) steps.push({ kind: 'assign-idle-staff', count: coverable });

	steps.push({ kind: 'finance', alert: cashAlert });

	if (surplus > 0) {
		steps.push({ kind: 'release-idle-staff', count: surplus });
	} else if (coverable === 0 && game.staff.length > 0) {
		steps.push({ kind: 'review-payroll' });
	}

	const activeRouteCount = game.logistics.recurringRoutes.filter(
		(route) => route.state === 'active'
	).length;
	if (activeRouteCount > 0) steps.push({ kind: 'pause-routes', count: activeRouteCount });

	return { alert: cashAlert, steps };
}

function countIdleStaff(game: GameState): { coverable: number; surplus: number } {
	const shortage: Record<StaffRole, number> = { manager: 0, general: 0 };
	for (const store of game.stores) {
		const summary = summarizeStoreStaffing(game, store);
		shortage.manager += summary.shortage.manager;
		shortage.general += summary.shortage.general;
	}
	const idle: Record<StaffRole, number> = { manager: 0, general: 0 };
	for (const member of game.staff) {
		if (member.assignedStoreId === null) idle[member.role] += 1;
	}
	const coverable =
		Math.min(idle.manager, shortage.manager) + Math.min(idle.general, shortage.general);
	return { coverable, surplus: idle.manager + idle.general - coverable };
}
