import type { GameAlert } from '$lib/game/alerts';

export interface AlertPanelNavigation {
	panelId: 'finance' | 'decisions';
	focusedFinanceLoanId: string | null;
}

export interface AlertWorldRouteNavigation {
	kind: 'world-route';
	routeId: string;
}

export type AlertNavigation = AlertPanelNavigation | AlertWorldRouteNavigation;

export function resolveAlertNavigation(alert: GameAlert): AlertNavigation | null {
	if (
		(alert.kind === 'logistics-origin-stock' || alert.kind === 'logistics-route-capacity') &&
		alert.routeId
	) {
		return { kind: 'world-route', routeId: alert.routeId };
	}

	if (alert.managementPanelId) {
		return {
			panelId: alert.managementPanelId,
			focusedFinanceLoanId: alert.managementPanelId === 'finance' ? (alert.loanId ?? null) : null
		};
	}

	return alert.kind === 'decision' ? { panelId: 'decisions', focusedFinanceLoanId: null } : null;
}
