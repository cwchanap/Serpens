import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n } from '$lib/i18n';
import type { PendingFinancedPurchase } from '../../../routes/financePurchaseReview';
import FinancePurchaseReviewDialog from './FinancePurchaseReviewDialog.svelte';

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

function dialogProps(overrides: Record<string, unknown> = {}) {
	return {
		purchase,
		cash: 1_250,
		feedback: null,
		confirmationPending: false,
		i18n: createI18n('en'),
		formatApr: (basisPoints: number) => `${basisPoints / 100}%`,
		onConfirm: vi.fn(),
		onCancel: vi.fn(),
		...overrides
	};
}

async function nextFrame(): Promise<void> {
	await new Promise((resolve) => window.requestAnimationFrame(resolve));
}

describe('FinancePurchaseReviewDialog', () => {
	it('focuses Cancel and dismisses through its production Escape handler', async () => {
		expect.assertions(3);
		const onCancel = vi.fn();
		render(FinancePurchaseReviewDialog, dialogProps({ onCancel }));

		await nextFrame();
		const cancel = page.getByText('Cancel review');
		await expect.element(cancel).toHaveFocus();
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(onCancel).toHaveBeenCalledTimes(1);
		await expect.element(page.getByRole('dialog', { name: /review financing/i })).toBeVisible();
	});

	it('does not allow backdrop, Cancel, or Escape to dismiss while confirmation is pending', async () => {
		expect.assertions(4);
		const onCancel = vi.fn();
		render(FinancePurchaseReviewDialog, dialogProps({ onCancel, confirmationPending: true }));

		const cancel = page.getByText('Cancel review');
		await expect.element(cancel).toBeDisabled();
		await expect
			.element(document.querySelector<HTMLButtonElement>('.finance-review-dismiss')!)
			.toBeDisabled();
		window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(onCancel).not.toHaveBeenCalled();
		await expect.element(page.getByRole('button', { name: /confirm financing/i })).toBeDisabled();
	});
});
