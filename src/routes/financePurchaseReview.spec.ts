import { describe, expect, it } from 'vitest';
import type { ExpansionFinanceOffer } from '$lib/game/finance';
import {
	beginFinancePurchaseConfirmation,
	createFinancePurchaseReviewState,
	dismissFinancePurchaseReview,
	openFinancePurchaseReview,
	settleFinancePurchaseConfirmation,
	shouldRefreshFinancedPurchase,
	type PendingFinancedPurchase
} from './financePurchaseReview';

const offer: ExpansionFinanceOffer = {
	principal: 1200,
	termDays: 84,
	annualInterestRateBps: 725,
	estimatedPeakPayment: 40
};

const retailPurchase: PendingFinancedPurchase = {
	kind: 'retail',
	tileId: 'tile-12',
	archetypeId: 'convenience',
	expectedCost: 2_450,
	offer
};

describe('finance purchase review coordinator', () => {
	it('forwards the exact quoted expected cost to every typed controller command', () => {
		const cases: Array<{ purchase: PendingFinancedPurchase; expected: unknown[] }> = [
			{
				purchase: { kind: 'world', cityId: 'harbor-city', expectedCost: 7_500, offer },
				expected: ['harbor-city', 7_500]
			},
			{ purchase: retailPurchase, expected: ['tile-12', 'convenience', 2_450] },
			{
				purchase: {
					kind: 'industry',
					tileId: 'industry-3',
					buildingTypeId: 'water-pump',
					expectedCost: 4_800,
					offer
				},
				expected: ['industry-3', 'water-pump', 4_800]
			}
		];

		for (const { purchase, expected } of cases) {
			const started = beginFinancePurchaseConfirmation(
				openFinancePurchaseReview(createFinancePurchaseReviewState(), purchase)
			);
			expect(started?.request.command.args).toEqual(expected);
		}
	});

	it('starts only one confirmation request and clears it after settlement', () => {
		const open = openFinancePurchaseReview(createFinancePurchaseReviewState(), retailPurchase);
		const started = beginFinancePurchaseConfirmation(open);
		expect(started).not.toBeNull();
		expect(beginFinancePurchaseConfirmation(started!.state)).toBeNull();

		const settled = settleFinancePurchaseConfirmation(started!.state, started!.request, {
			kind: 'rejected',
			feedback: 'Unable to complete this purchase.'
		});
		expect(settled.confirmationPending).toBe(false);
		expect(settled.purchase).toEqual(retailPurchase);
	});

	it('refreshes an invalid quote and explicitly removes a quote when credit is gone', () => {
		const started = beginFinancePurchaseConfirmation(
			openFinancePurchaseReview(createFinancePurchaseReviewState(), retailPurchase)
		)!;
		const refreshed = {
			...retailPurchase,
			expectedCost: 2_600,
			offer: { ...offer, principal: 1_350 }
		};
		const withFreshQuote = settleFinancePurchaseConfirmation(started.state, started.request, {
			kind: 'rejected',
			feedback: 'The purchase cost changed.',
			refreshedPurchase: refreshed
		});
		expect(withFreshQuote.purchase).toEqual(refreshed);

		const noCredit = settleFinancePurchaseConfirmation(withFreshQuote, started.request, {
			kind: 'rejected',
			feedback: 'Credit is no longer available.',
			refreshedPurchase: { ...refreshed, offer: null }
		});
		expect(noCredit.purchase).toEqual({ ...refreshed, offer: null });
		expect(noCredit.confirmationPending).toBe(false);
	});

	for (const invalidation of ['Cancel', 'Escape', 'placement cancellation', 'scenario reset']) {
		it(`ignores a late result after ${invalidation} invalidates the active review`, () => {
			const started = beginFinancePurchaseConfirmation(
				openFinancePurchaseReview(createFinancePurchaseReviewState(), retailPurchase)
			)!;
			const invalidated = dismissFinancePurchaseReview(started.state);

			const late = settleFinancePurchaseConfirmation(invalidated, started.request, {
				kind: 'committed'
			});
			expect(late).toBe(invalidated);
			expect(late.purchase).toBeNull();
		});
	}

	it('identifies only stale cost or credit rejections for live quote refresh', () => {
		expect(
			shouldRefreshFinancedPurchase({ status: 'domain-rejected', code: 'purchaseCostChanged' })
		).toBe(true);
		expect(
			shouldRefreshFinancedPurchase({ status: 'domain-rejected', code: 'insufficientCredit' })
		).toBe(true);
		expect(
			shouldRefreshFinancedPurchase({ status: 'domain-rejected', code: 'purchaseUnavailable' })
		).toBe(false);
	});
});
