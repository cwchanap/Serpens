import type { GameAlert, GameAlertKind } from './alerts';
import type { GameState } from './types';

/**
 * Guidance for the opening loop (first store, first week). Alert-backed hints
 * carry the matched GameAlert object directly; the finance `cash-risk` lane is
 * allowlisted to the two alerts that demand same-day money action — structural
 * finance alerts (`covenantRisk`, `upcomingLoanPayment`) must never hijack the
 * opening loop.
 *
 * The selector only decides WHICH hint a live game should show. Eligibility —
 * which play modes may render the card and for how long — is the caller's job:
 * First Profit holds it for the entire active run, while sandbox applies
 * `isSandboxOpeningWindow` (one store, at most seven completed reports).
 */
export type OpeningGuidance =
	| { kind: 'cash-risk'; alert: GameAlert }
	| { kind: 'stock-recovery'; alert: GameAlert }
	| { kind: 'first-result' }
	| { kind: 'result-evidence' };

const CASH_RISK_ALERT_KINDS: readonly GameAlertKind[] = ['missedLoanPayment', 'lowCashRunway'];

/** The opening window: the game exists, has exactly one store, and is at most 7 reports in. */
export function isSandboxOpeningWindow(game: GameState | null): boolean {
	return game !== null && game.stores.length === 1 && game.reports.length <= 7;
}

export function selectOpeningGuidance(
	game: GameState | null,
	alerts: readonly GameAlert[]
): OpeningGuidance | null {
	if (game === null) return null;

	const cashAlert = alerts.find((alert) => CASH_RISK_ALERT_KINDS.includes(alert.kind));
	if (cashAlert) return { kind: 'cash-risk', alert: cashAlert };

	const stockAlert = alerts.find((alert) => alert.kind === 'store-stock');
	if (stockAlert) return { kind: 'stock-recovery', alert: stockAlert };

	return game.reports.length === 0 ? { kind: 'first-result' } : { kind: 'result-evidence' };
}
