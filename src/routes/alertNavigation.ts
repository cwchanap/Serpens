import type { GameAlert } from '$lib/game/alerts';
import type { ManagementPanelId } from '$lib/game/keyboardShortcuts';

export interface AlertPanelNavigation {
	panelId: ManagementPanelId;
	focusedFinanceLoanId: string | null;
}

export interface AlertWorldRouteNavigation {
	kind: 'world-route';
	routeId: string;
}

export type AlertNavigation = AlertPanelNavigation | AlertWorldRouteNavigation;

export function resolveAlertNavigation(alert: GameAlert): AlertNavigation | null {
	// Route-targeted alerts resolve to the world route before generic panel
	// navigation: a route event-modifier may carry a stale decisions-panel
	// target, but its routeId is the actionable destination.
	if (
		(alert.kind === 'logistics-origin-stock' ||
			alert.kind === 'logistics-route-capacity' ||
			(alert.kind === 'event-modifier' && alert.routeId)) &&
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
