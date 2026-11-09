import { describe, expect, it } from 'vitest';
import { createEmptyFinanceState, type ExpansionFinanceOffer } from '$lib/game/finance';
import { createNewGame } from '$lib/game/state';
import {
	beginFinancePurchaseConfirmation,
	createFinancePurchaseReviewState,
	dismissFinancePurchaseReview,
	hasFinancedPurchaseOffer,
	isFinanceReviewEscapeOwned,
	openFinancePurchaseReview,
	resolveExpansionPurchasePaymentPath,
	refreshedFinancedPurchase,
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

describe('live financed purchase quote refresh', () => {
	const base = createNewGame('convenience', 123);
	const game = { ...base, cash: 100, finance: createEmptyFinanceState(base.day) };

	it('refreshes world cost and shortfall from the current revealed city status', () => {
		const refreshed = refreshedFinancedPurchase(
			{ kind: 'world', cityId: 'campus-junction', expectedCost: 1, offer },
			{ ...game, cash: 5_000, world: { ...game.world, revealedCityIds: ['campus-junction'] } }
		);
		expect(refreshed).toMatchObject({
			kind: 'world',
			cityId: 'campus-junction',
			expectedCost: 18_000,
			offer: { principal: 13_000 }
		});
	});

	it('removes a world offer when the city is no longer available to finance', () => {
		expect(
			refreshedFinancedPurchase(
				{ kind: 'world', cityId: 'campus-junction', expectedCost: 1, offer },
				game
			)
		).toEqual({ kind: 'world', cityId: 'campus-junction', expectedCost: 18_000, offer: null });
	});

	it('refreshes retail setup cost from the live active-city tile without mutating the old quote', () => {
		const tile = {
			...game.cities[0]!.tiles[0]!,
			id: 'tile-12',
			terrain: 'commercial' as const,
			rent: 100,
			demand: 50,
			footTraffic: 50,
			customerFit: 50
		};
		const refreshed = refreshedFinancedPurchase(retailPurchase, {
			...game,
			cash: 5_000,
			cities: [{ ...game.cities[0]!, tiles: [tile] }]
		});
		expect(refreshed).toMatchObject({
			kind: 'retail',
			tileId: 'tile-12',
			archetypeId: 'convenience',
			expectedCost: 16_020,
			offer: { principal: 11_020 }
		});
		expect(retailPurchase.expectedCost).toBe(2_450);
		expect(retailPurchase.offer).toBe(offer);
	});

	it('removes the offer if the selected retail tile is absent from the active city', () => {
		expect(
			refreshedFinancedPurchase(retailPurchase, { ...game, activeCityId: 'missing-city' })
		).toEqual({ ...retailPurchase, offer: null });
	});

	it('refreshes industry cost and shortfall from the selected building catalog entry', () => {
		expect(
			refreshedFinancedPurchase(
				{
					kind: 'industry',
					tileId: 'industry-3',
					buildingTypeId: 'water-pump',
					expectedCost: 1,
					offer
				},
				game
			)
		).toMatchObject({
			kind: 'industry',
			tileId: 'industry-3',
			buildingTypeId: 'water-pump',
			expectedCost: 500,
			offer: { principal: 400 }
		});
	});

	it('removes a stale offer when cash now covers the refreshed cost', () => {
		expect(
			refreshedFinancedPurchase(
				{
					kind: 'industry',
					tileId: 'industry-3',
					buildingTypeId: 'water-pump',
					expectedCost: 1,
					offer
				},
				{ ...game, cash: 500 }
			)
		).toMatchObject({ expectedCost: 500, offer: null });
	});
});

describe('finance purchase review coordinator', () => {
	it('allows selected-tile entry through either the cash or matching finance command', () => {
		const selectedTilePurchase = { ...retailPurchase, expectedCost: 1_000 };
		const financeOnlyPath = resolveExpansionPurchasePaymentPath({
			cashCommandAvailable: false,
			financeCommandAvailable: true,
			cash: 500,
			expectedCost: 1_000
		});
		expect(financeOnlyPath).toBe('finance');
		const review =
			financeOnlyPath === 'finance'
				? openFinancePurchaseReview(createFinancePurchaseReviewState(), selectedTilePurchase)
				: createFinancePurchaseReviewState();
		expect(review.purchase).toEqual(selectedTilePurchase);
		expect(
			resolveExpansionPurchasePaymentPath({
				cashCommandAvailable: true,
				financeCommandAvailable: false,
				cash: 500,
				expectedCost: 1_000
			})
		).toBe('requiresCash');
	});

	it('keeps cash-covered selected-tile purchases on their cash command only', () => {
		expect(
			resolveExpansionPurchasePaymentPath({
				cashCommandAvailable: true,
				financeCommandAvailable: false,
				cash: 1_000,
				expectedCost: 1_000
			})
		).toBe('cash');
		expect(
			resolveExpansionPurchasePaymentPath({
				cashCommandAvailable: false,
				financeCommandAvailable: true,
				cash: 1_000,
				expectedCost: 1_000
			})
		).toBe('requiresCash');
	});

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

	it('defers route Escape ownership while a financed review is active', () => {
		const closed = createFinancePurchaseReviewState();
		const open = openFinancePurchaseReview(closed, retailPurchase);
		expect(isFinanceReviewEscapeOwned(closed)).toBe(false);
		expect(isFinanceReviewEscapeOwned(open)).toBe(true);
	});

	it('identifies only stale cost or credit rejections for live quote refresh', () => {
		expect(
			shouldRefreshFinancedPurchase({
				status: 'domain-rejected',
				code: 'purchaseCostChanged',
				context: {}
			})
		).toBe(true);
		expect(
			shouldRefreshFinancedPurchase({
				status: 'domain-rejected',
				code: 'insufficientCredit',
				context: {}
			})
		).toBe(true);
		expect(
			shouldRefreshFinancedPurchase({
				status: 'domain-rejected',
				code: 'purchaseUnavailable',
				context: {}
			})
		).toBe(false);
	});

	it('distinguishes a present offer from a null one', () => {
		expect(hasFinancedPurchaseOffer(offer)).toBe(true);
		expect(hasFinancedPurchaseOffer(null)).toBe(false);
	});

	it('drops the offer when the refreshed entity no longer resolves', () => {
		const game = createNewGame('convenience', 123);
		expect(
			refreshedFinancedPurchase(
				{ kind: 'world', cityId: 'not-a-city' as never, expectedCost: 1, offer },
				game
			)
		).toEqual({ kind: 'world', cityId: 'not-a-city', expectedCost: 1, offer: null });
		expect(
			refreshedFinancedPurchase(
				{
					kind: 'industry',
					tileId: 'industry-3',
					buildingTypeId: 'not-a-building' as never,
					expectedCost: 1,
					offer
				},
				game
			)
		).toMatchObject({ offer: null });
	});
});
