import { describe, expect, it } from 'vitest';
import { resolveAlertNavigation } from './alertNavigation';

describe('alert navigation', () => {
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
