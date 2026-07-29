<script lang="ts">
	import { tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { I18nBundle } from '$lib/i18n';
	import { focusTrap } from '$lib/a11y/focusTrap';
	import {
		hasFinancedPurchaseOffer,
		type PendingFinancedPurchase
	} from '../../../routes/financePurchaseReview';

	interface Props {
		purchase: PendingFinancedPurchase;
		cash: number;
		feedback: string | null;
		confirmationPending: boolean;
		i18n: I18nBundle;
		formatApr: (basisPoints: number) => string;
		onConfirm: () => void;
		onCancel: () => void;
	}

	let {
		purchase,
		cash,
		feedback,
		confirmationPending,
		i18n,
		formatApr,
		onConfirm,
		onCancel
	}: Props = $props();

	const focusCancel: Attachment<HTMLButtonElement> = (node) => {
		void tick().then(() => node.focus());
	};

	function cancel(): void {
		if (!confirmationPending) onCancel();
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		event.preventDefault();
		event.stopPropagation();
		if (confirmationPending) return;
		cancel();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="finance-review-backdrop">
	<button
		type="button"
		class="finance-review-dismiss"
		aria-label={i18n.t('financePanel.ui.cancelReview')}
		disabled={confirmationPending}
		onclick={cancel}
	></button>
	<div
		{@attach focusTrap}
		class="finance-review paper"
		role="dialog"
		aria-modal="true"
		aria-labelledby="financed-purchase-review-heading"
	>
		<h2 id="financed-purchase-review-heading">
			{i18n.t('financePanel.financedPurchase.review' as never)}
		</h2>
		<dl>
			<div>
				<dt>{i18n.t('financePanel.financedPurchase.purchaseCost' as never)}</dt>
				<dd>{i18n.format.currency(purchase.expectedCost)}</dd>
			</div>
			<div>
				<dt>{i18n.t('financePanel.ui.cash')}</dt>
				<dd>{i18n.format.currency(cash)}</dd>
			</div>
			{#if hasFinancedPurchaseOffer(purchase.offer)}
				<div>
					<dt>{i18n.t('financePanel.financedPurchase.shortfall' as never)}</dt>
					<dd>{i18n.format.currency(purchase.offer.principal)}</dd>
				</div>
				<div>
					<dt>{i18n.t('financePanel.ui.loanTerm')}</dt>
					<dd>
						{i18n.t('financePanel.ui.days', {
							days: i18n.format.integer(purchase.offer.termDays)
						})}
					</dd>
				</div>
				<div>
					<dt>{i18n.t('financePanel.ui.apr')}</dt>
					<dd>{formatApr(purchase.offer.annualInterestRateBps)}</dd>
				</div>
				<div>
					<dt>{i18n.t('financePanel.ui.peakPayment')}</dt>
					<dd>{i18n.format.currency(purchase.offer.estimatedPeakPayment)}</dd>
				</div>
			{/if}
		</dl>
		<p class="live-status" role="status" aria-live="polite">{feedback ?? ''}</p>
		<div class="finance-review-actions">
			<button
				type="button"
				class="btn-danger"
				disabled={confirmationPending}
				onclick={cancel}
				{@attach focusCancel}
			>
				{i18n.t('financePanel.ui.cancelReview')}
			</button>
			{#if purchase.offer}
				<button
					type="button"
					class="btn-primary"
					disabled={confirmationPending}
					onclick={onConfirm}
				>
					{i18n.t('financePanel.financedPurchase.confirm' as never)}
				</button>
			{/if}
		</div>
	</div>
</div>
