import { describe, expect, it } from 'vitest';
import { canConfirmFinancedPurchase, shouldRefreshFinancedPurchase } from './financePurchaseReview';

describe('finance purchase review state', () => {
	it('suppresses duplicate confirmation while a controller action is pending', () => {
		expect(canConfirmFinancedPurchase({ principal: 1200 }, false)).toBe(true);
		expect(canConfirmFinancedPurchase({ principal: 1200 }, true)).toBe(false);
	});

	it('refreshes only typed cost or credit rejections so stale quotes can be removed', () => {
		expect(
			shouldRefreshFinancedPurchase({ status: 'domain-rejected', code: 'purchaseCostChanged' })
		).toBe(true);
		expect(
			shouldRefreshFinancedPurchase({ status: 'domain-rejected', code: 'insufficientCredit' })
		).toBe(true);
		expect(
			shouldRefreshFinancedPurchase({ status: 'domain-rejected', code: 'purchaseUnavailable' })
		).toBe(false);
		expect(shouldRefreshFinancedPurchase({ status: 'failed' })).toBe(false);
	});
});
