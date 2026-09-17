import { describe, expect, it } from 'vitest';
import type { GameAlert } from '$lib/game/alerts';
import { createNewGame } from '$lib/game/state';
import type { GameState, Store } from '$lib/game/types';
import { resolveAlertNavigation, resolveStockAlertDestination } from './alertNavigation';

const stockAlert: GameAlert = {
	id: 'store-stock:store-1',
	kind: 'store-stock',
	storeId: 'store-1'
};

function storeFixture(products: Store['products']): Store {
	return {
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
		products,
		staffMorale: 70,
		staffCapacity: 2,
		localDemand: 50,
		managerQuality: 40
	};
}

function gameFixture(store: Store): GameState {
	return { ...createNewGame('convenience', 1), stores: [store] };
}

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

	describe('stock alert destination', () => {
		const affectedStore = storeFixture([
			{
				productId: 'snacks',
				brandId: 'common-ground',
				lots: [{ receivedDay: 1, quantity: 40 }],
				reorderThreshold: 10,
				targetStock: 50,
				sellingPrice: 5
			},
			{
				productId: 'bottled-water',
				brandId: 'common-ground',
				lots: [],
				reorderThreshold: 10,
				targetStock: 50,
				sellingPrice: 5
			}
		]);

		it('returns null for non-stock alerts', () => {
			expect(
				resolveStockAlertDestination(
					{ id: 'decision:system-notice-1', kind: 'decision', decisionId: 'system-notice-1' },
					gameFixture(affectedStore)
				)
			).toBeNull();
		});

		it('returns null when the stock alert has no storeId', () => {
			expect(
				resolveStockAlertDestination(
					{ id: 'store-stock:x', kind: 'store-stock' },
					gameFixture(affectedStore)
				)
			).toBeNull();
		});

		it('returns null when the alert store no longer exists in the game', () => {
			const renamedStore = { ...affectedStore, id: 'store-2' };
			expect(resolveStockAlertDestination(stockAlert, gameFixture(renamedStore))).toBeNull();
			expect(
				resolveStockAlertDestination(stockAlert, {
					...gameFixture(affectedStore),
					stores: []
				})
			).toBeNull();
		});

		it('returns the full live destination with the OOS-first primary product', () => {
			expect(resolveStockAlertDestination(stockAlert, gameFixture(affectedStore))).toEqual({
				cityId: 'harbor-city',
				tileId: 'harbor-city-1-1',
				storeId: 'store-1',
				productId: 'bottled-water'
			});
		});

		it('derives the product from current game.stores, not alert snapshot data', () => {
			expect.assertions(2);
			const game = gameFixture(affectedStore);
			// Live state moves on after the alert fired: bottled-water recovers
			// and snacks drops out of stock instead.
			game.stores[0]!.products = [
				{ ...game.stores[0]!.products[0]!, lots: [] },
				{ ...game.stores[0]!.products[1]!, lots: [{ receivedDay: 2, quantity: 30 }] }
			];

			const destination = resolveStockAlertDestination(stockAlert, game);
			expect(destination).not.toBeNull();
			expect(destination!.productId).toBe('snacks');
		});

		it('keeps the destination with a null product when nothing is currently affected', () => {
			const recoveredGame = gameFixture(
				storeFixture(
					affectedStore.products.map((product) => ({
						...product,
						lots: [{ receivedDay: 2, quantity: 30 }]
					}))
				)
			);

			expect(resolveStockAlertDestination(stockAlert, recoveredGame)).toEqual({
				cityId: 'harbor-city',
				tileId: 'harbor-city-1-1',
				storeId: 'store-1',
				productId: null
			});
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
