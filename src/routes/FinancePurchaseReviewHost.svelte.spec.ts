import { page } from 'vitest/browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import {
	createFinancePurchaseReviewState,
	isFinanceReviewEscapeOwned,
	openFinancePurchaseReview,
	type FinancePurchaseReviewState,
	type PendingFinancedPurchase
} from './financePurchaseReview';
import FinancePurchaseReviewHost from './FinancePurchaseReviewHost.svelte';

const purchase: PendingFinancedPurchase = {
	kind: 'retail',
	tileId: 'tile-12',
	archetypeId: 'convenience',
	expectedCost: 2_450,
	offer: {
		principal: 1_200,
		termDays: 84,
		annualInterestRateBps: 725,
		estimatedPeakPayment: 40
	}
};

const pageEscapeListeners: Array<(event: KeyboardEvent) => void> = [];

afterEach(() => {
	for (const listener of pageEscapeListeners.splice(0)) {
		window.removeEventListener('keydown', listener);
	}
});

function installRouteEscapeSelectionHandler(
	review: FinancePurchaseReviewState,
	selection: { tileId: string | null; cityId: string | null }
): ReturnType<typeof vi.fn> {
	const handler = vi.fn((event: KeyboardEvent) => {
		if (event.key !== 'Escape') return;
		if (isFinanceReviewEscapeOwned(review)) return;
		if (selection.cityId !== null) {
			selection.cityId = null;
			return;
		}
		selection.tileId = null;
	});
	pageEscapeListeners.push(handler);
	window.addEventListener('keydown', handler);
	return handler;
}

function hostProps(overrides: Record<string, unknown> = {}) {
	return {
		review: openFinancePurchaseReview(createFinancePurchaseReviewState(), purchase),
		cash: 1_250,
		i18n: createI18n('en'),
		formatApr: (basisPoints: number) => `${basisPoints / 100}%`,
		onConfirm: vi.fn(),
		onDismiss: vi.fn(),
		...overrides
	};
}

describe('FinancePurchaseReviewHost route Escape boundary', () => {
	it('cancels the real review coordinator without clearing selected outer state', async () => {
		expect.assertions(5);
		const selected = { tileId: 'tile-12' as string | null, cityId: 'harbor-city' as string | null };
		const review = openFinancePurchaseReview(createFinancePurchaseReviewState(), purchase);
		const pageEscapeHandler = installRouteEscapeSelectionHandler(review, selected);
		const onDismiss = vi.fn();
		render(FinancePurchaseReviewHost, hostProps({ review, onDismiss }));

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		expect(onDismiss).toHaveBeenCalledOnce();
		expect(pageEscapeHandler).toHaveBeenCalledOnce();
		expect(selected.tileId).toBe('tile-12');
		expect(selected.cityId).toBe('harbor-city');
		await expect
			.element(page.getByRole('dialog', { name: /review financing/i }))
			.not.toBeInTheDocument();
	});

	it('keeps the review and outer state intact while confirmation is pending', async () => {
		expect.assertions(6);
		const selected = { tileId: 'tile-12' as string | null, cityId: 'harbor-city' as string | null };
		const review = {
			...openFinancePurchaseReview(createFinancePurchaseReviewState(), purchase),
			confirmationPending: true
		};
		const pageEscapeHandler = installRouteEscapeSelectionHandler(review, selected);
		const onDismiss = vi.fn();
		render(
			FinancePurchaseReviewHost,
			hostProps({
				review,
				onDismiss
			})
		);

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		expect(onDismiss).not.toHaveBeenCalled();
		expect(pageEscapeHandler).toHaveBeenCalledOnce();
		expect(selected.tileId).toBe('tile-12');
		expect(selected.cityId).toBe('harbor-city');
		await expect.element(page.getByRole('dialog', { name: /review financing/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /confirm financing/i })).toBeDisabled();
	});
});
