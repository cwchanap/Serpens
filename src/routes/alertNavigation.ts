import type { GameAlert } from '$lib/game/alerts';
import { getAffectedStockProductIds } from '$lib/game/stock';
import type { ManagementPanelId } from '$lib/game/keyboardShortcuts';
import type { GameState, ProductId } from '$lib/game/types';

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

export interface StockAlertDestination {
	cityId: string;
	tileId: string;
	storeId: string;
	productId: ProductId | null;
}

/**
 * Resolves a store-stock alert against the live game state: the alert must
 * name an existing store, and the destination (city/tile/store plus the
 * currently affected primary product) is derived from that live store —
 * never from snapshot data on the alert or reactive UI selection.
 */
export function resolveStockAlertDestination(
	alert: GameAlert,
	game: GameState
): StockAlertDestination | null {
	if (alert.kind !== 'store-stock' || !alert.storeId) return null;
	const store = game.stores.find((candidate) => candidate.id === alert.storeId);
	if (!store) return null;
	return {
		cityId: store.cityId,
		tileId: store.tileId,
		storeId: store.id,
		productId: getAffectedStockProductIds(store.products)[0] ?? null
	};
}
