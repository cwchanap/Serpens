import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import {
	createFinancePurchaseReviewState,
	openFinancePurchaseReview,
	type PendingFinancedPurchase
} from './financePurchaseReview';
import FinancePurchaseReviewHostHarness from './FinancePurchaseReviewHostHarness.svelte';

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

function harnessProps(overrides: Record<string, unknown> = {}) {
	return {
		initialReview: openFinancePurchaseReview(createFinancePurchaseReviewState(), purchase),
		cash: 1_250,
		i18n: createI18n('en'),
		formatApr: (basisPoints: number) => `${basisPoints / 100}%`,
		...overrides
	};
}

describe('FinancePurchaseReviewHost route Escape boundary', () => {
	it('updates the parent-bound review without clearing selected outer state', async () => {
		expect.assertions(6);
		render(FinancePurchaseReviewHostHarness, harnessProps());

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		await expect.element(page.getByTestId('review-state')).toHaveTextContent('closed');
		await expect.element(page.getByTestId('dismiss-calls')).toHaveTextContent('1');
		await expect.element(page.getByTestId('page-escape-handler-calls')).toHaveTextContent('0');
		await expect.element(page.getByTestId('selected-tile')).toHaveTextContent('tile-12');
		await expect.element(page.getByTestId('selected-world-city')).toHaveTextContent('harbor-city');
		await expect
			.element(page.getByRole('dialog', { name: /review financing/i }))
			.not.toBeInTheDocument();
	});

	it('keeps the review and outer state intact while confirmation is pending', async () => {
		expect.assertions(7);
		const initialReview = {
			...openFinancePurchaseReview(createFinancePurchaseReviewState(), purchase),
			confirmationPending: true
		};
		render(FinancePurchaseReviewHostHarness, harnessProps({ initialReview }));

		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

		await expect.element(page.getByTestId('review-state')).toHaveTextContent('open');
		await expect.element(page.getByTestId('dismiss-calls')).toHaveTextContent('0');
		await expect.element(page.getByTestId('page-escape-handler-calls')).toHaveTextContent('0');
		await expect.element(page.getByTestId('selected-tile')).toHaveTextContent('tile-12');
		await expect.element(page.getByTestId('selected-world-city')).toHaveTextContent('harbor-city');
		await expect.element(page.getByRole('dialog', { name: /review financing/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /confirm financing/i })).toBeDisabled();
	});
});
