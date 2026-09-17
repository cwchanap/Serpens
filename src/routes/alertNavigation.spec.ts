import { describe, expect, it } from 'vitest';
import type { GameAlert } from '$lib/game/alerts';
import type { Store } from '$lib/game/types';
import { resolveAlertNavigation, resolveStockAlertFocus } from './alertNavigation';

const focusStore: Store = {
	id: 'store-1',
	level: 1,
	name: 'Corner Market',
	archetypeId: 'convenience',
	location: { neighborhoodId: 'downtown', x: 1, y: 1 },
	cityId: 'harbor-city',
	tileId: 'harbor-city-1-1',
	mapX: 1,
	mapY: 1,
	daysOpen: 3,
	reputation: 50,
	stockHealth: 80,
	products: [
		{
			productId: 'snacks',
			brandId: 'common-ground',
			lots: [{ receivedDay: 1, quantity: 40 }],
			reorderThreshold: 10,
			targetStock: 50,
			sellingPrice: 5
		}
	],
	staffMorale: 70,
	staffCapacity: 2,
	localDemand: 50,
	managerQuality: 40
};

const stockAlert: GameAlert = {
	id: 'store-stock:store-1',
	kind: 'store-stock',
	storeId: 'store-1'
};

describe('alert navigation', () => {
	it('navigates manager exceptions to Staff', () => {
		expect(
			resolveAlertNavigation({
				id: 'manager-exception:manager-1',
				kind: 'manager-exception',
				managerId: 'manager-1',
				managementPanelId: 'staff'
			})
		).toEqual({ panelId: 'staff', focusedFinanceLoanId: null });
	});

	it('honors explicit Decisions and finance routes while retaining the decision fallback', () => {
		expect(
			resolveAlertNavigation({
				id: 'event-modifier:event-modifier-4',
				kind: 'event-modifier',
				modifierId: 'event-modifier-4',
				managementPanelId: 'decisions'
			})
		).toEqual({ panelId: 'decisions', focusedFinanceLoanId: null });
		expect(
			resolveAlertNavigation({
				id: 'upcomingLoanPayment:loan-7',
				kind: 'upcomingLoanPayment',
				loanId: 'loan-7',
				managementPanelId: 'finance'
			})
		).toEqual({ panelId: 'finance', focusedFinanceLoanId: 'loan-7' });
		expect(
			resolveAlertNavigation({
				id: 'decision:system-notice-1',
				kind: 'decision',
				decisionId: 'system-notice-1'
			})
		).toEqual({ panelId: 'decisions', focusedFinanceLoanId: null });
	});

	it('resolves a logistics alert to its world route', () => {
		expect(
			resolveAlertNavigation({
				id: 'logistics-route-capacity:route-1',
				kind: 'logistics-route-capacity',
				routeId: 'route-1'
			})
		).toEqual({ kind: 'world-route', routeId: 'route-1' });
	});

	it('resolves an event-modifier alert with a routeId to its world route before panel navigation', () => {
		expect(
			resolveAlertNavigation({
				id: 'event-modifier:event-modifier-4',
				kind: 'event-modifier',
				modifierId: 'event-modifier-4',
				routeId: 'route-7'
			})
		).toEqual({ kind: 'world-route', routeId: 'route-7' });
		// Route navigation wins even if a panel target is also present.
		expect(
			resolveAlertNavigation({
				id: 'event-modifier:event-modifier-4',
				kind: 'event-modifier',
				modifierId: 'event-modifier-4',
				routeId: 'route-7',
				managementPanelId: 'decisions'
			})
		).toEqual({ kind: 'world-route', routeId: 'route-7' });
	});

	it('returns null for alerts without a management panel, decision kind, or route target', () => {
		expect(
			resolveAlertNavigation({
				id: 'store-stock:store-1',
				kind: 'store-stock',
				storeId: 'store-1'
			})
		).toBeNull();
		expect(
			resolveAlertNavigation({
				id: 'factory-blocked:factory-1',
				kind: 'factory-blocked',
				buildingId: 'factory-1'
			})
		).toBeNull();
		expect(
			resolveAlertNavigation({
				id: 'logistics-origin-stock:route-1',
				kind: 'logistics-origin-stock'
			})
		).toBeNull();
	});

	describe('stock alert focus', () => {
		it('returns null for non-stock alerts', () => {
			expect(
				resolveStockAlertFocus(
					{ id: 'decision:system-notice-1', kind: 'decision', decisionId: 'system-notice-1' },
					focusStore
				)
			).toBeNull();
		});

		it('returns null when the stock alert has no storeId', () => {
			expect(
				resolveStockAlertFocus({ id: 'store-stock:x', kind: 'store-stock' }, focusStore)
			).toBeNull();
		});

		it('returns null when no store detail is selected', () => {
			expect(resolveStockAlertFocus(stockAlert, null)).toBeNull();
		});

		it('returns null when the selected store does not match the alert store', () => {
			expect(resolveStockAlertFocus(stockAlert, { ...focusStore, id: 'store-2' })).toBeNull();
		});

		it('returns the alert product when the matching store stocks it', () => {
			expect(resolveStockAlertFocus({ ...stockAlert, productId: 'snacks' }, focusStore)).toEqual({
				productId: 'snacks'
			});
		});

		it('returns a null product when the alert product is no longer stocked by the store', () => {
			expect(resolveStockAlertFocus({ ...stockAlert, productId: 'apparel' }, focusStore)).toEqual({
				productId: null
			});
		});

		it('returns a null product when the alert carries no focus product', () => {
			expect(resolveStockAlertFocus(stockAlert, focusStore)).toEqual({ productId: null });
		});
	});

	it('returns null focusedFinanceLoanId for finance panel without a loanId', () => {
		expect(
			resolveAlertNavigation({
				id: 'covenantRisk',
				kind: 'covenantRisk',
				managementPanelId: 'finance'
			})
		).toEqual({ panelId: 'finance', focusedFinanceLoanId: null });
	});
});
