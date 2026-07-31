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

	// Tailwind v4 arbitrary-value utilities replacing the former
	// :global(.finance-review*) rules in +page.svelte. The design tokens live as
	// plain CSS variables (src/lib/styles/tokens.css), not as @theme values, so
	// the utilities reference them via arbitrary values. dt/dd/dl-item repeat
	// across every definition-list row, so they are shared here.
	const dlItemClass = 'p-[0.55rem] border border-[var(--paper-edge)] bg-[var(--paper-50)]';
	const dtClass =
		'font-[var(--font-ui)] text-[0.68rem] font-bold tracking-[0.08em] uppercase text-[var(--brass-700)]';
	const ddClass =
		'm-0 mt-[0.2rem] font-[var(--font-mono)] font-bold tabular-nums lining-nums text-[var(--ink-700)]';
</script>

<div class="fixed inset-0 z-[45] grid place-items-center bg-[rgba(27,19,12,0.58)] p-4">
	<button
		type="button"
		class="finance-review-dismiss absolute inset-0 cursor-default border-0 bg-transparent"
		aria-label={i18n.t('financePanel.ui.dismissReview')}
		disabled={confirmationPending}
		onclick={cancel}
	></button>
	<div
		{@attach focusTrap}
		class="paper relative z-[1] grid w-[min(32rem,100%)] gap-4 p-5"
		role="dialog"
		aria-modal="true"
		aria-labelledby="financed-purchase-review-heading"
	>
		<h2
			id="financed-purchase-review-heading"
			class="m-0 text-[1.45rem] font-[var(--font-display)] font-normal text-[var(--ink-700)]"
		>
			{i18n.t('financePanel.financedPurchase.review')}
		</h2>
		<dl class="m-0 grid grid-cols-2 gap-[0.65rem]">
			<div class={dlItemClass}>
				<dt class={dtClass}>{i18n.t('financePanel.financedPurchase.purchaseCost')}</dt>
				<dd class={ddClass}>{i18n.format.currency(purchase.expectedCost)}</dd>
			</div>
			<div class={dlItemClass}>
				<dt class={dtClass}>{i18n.t('financePanel.ui.cash')}</dt>
				<dd class={ddClass}>{i18n.format.currency(cash)}</dd>
			</div>
			{#if hasFinancedPurchaseOffer(purchase.offer)}
				<div class={dlItemClass}>
					<dt class={dtClass}>{i18n.t('financePanel.financedPurchase.shortfall')}</dt>
					<dd class={ddClass}>{i18n.format.currency(purchase.offer.principal)}</dd>
				</div>
				<div class={dlItemClass}>
					<dt class={dtClass}>{i18n.t('financePanel.ui.loanTerm')}</dt>
					<dd class={ddClass}>
						{i18n.t('financePanel.ui.days', {
							days: i18n.format.integer(purchase.offer.termDays)
						})}
					</dd>
				</div>
				<div class={dlItemClass}>
					<dt class={dtClass}>{i18n.t('financePanel.ui.apr')}</dt>
					<dd class={ddClass}>{formatApr(purchase.offer.annualInterestRateBps)}</dd>
				</div>
				<div class={dlItemClass}>
					<dt class={dtClass}>{i18n.t('financePanel.ui.peakPayment')}</dt>
					<dd class={ddClass}>{i18n.format.currency(purchase.offer.estimatedPeakPayment)}</dd>
				</div>
			{/if}
		</dl>
		<p
			class="m-0 min-h-[1.25rem] font-[var(--font-body)] text-[var(--wax-red)]"
			role="status"
			aria-live="polite"
		>
			{feedback ?? ''}
		</p>
		<div class="flex justify-end gap-[0.6rem]">
			<button
				type="button"
				class="btn-danger"
				disabled={confirmationPending}
				onclick={cancel}
				{@attach focusCancel}
			>
				{i18n.t('financePanel.ui.cancelReview')}
			</button>
			{#if hasFinancedPurchaseOffer(purchase.offer)}
				<button
					type="button"
					class="btn-primary"
					disabled={confirmationPending}
					onclick={onConfirm}
				>
					{i18n.t('financePanel.financedPurchase.confirm')}
				</button>
			{/if}
		</div>
	</div>
</div>
