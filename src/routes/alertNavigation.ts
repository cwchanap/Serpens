import type { GameAlert } from '$lib/game/alerts';

export interface AlertPanelNavigation {
	panelId: 'finance' | 'decisions';
	focusedFinanceLoanId: string | null;
}

export function resolveAlertPanelNavigation(alert: GameAlert): AlertPanelNavigation | null {
	if (alert.managementPanelId) {
		return {
			panelId: alert.managementPanelId,
			focusedFinanceLoanId: alert.managementPanelId === 'finance' ? (alert.loanId ?? null) : null
		};
	}

	return alert.kind === 'decision' ? { panelId: 'decisions', focusedFinanceLoanId: null } : null;
}
