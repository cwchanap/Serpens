<script lang="ts">
	import type { I18nBundle } from '$lib/i18n';
	import FinancePurchaseReviewDialog from '$lib/components/game/FinancePurchaseReviewDialog.svelte';
	import {
		dismissFinancePurchaseReview,
		type FinancePurchaseReviewState
	} from './financePurchaseReview';

	interface Props {
		review: FinancePurchaseReviewState;
		cash: number;
		i18n: I18nBundle;
		formatApr: (basisPoints: number) => string;
		onConfirm: () => void;
		onDismiss: () => void;
	}

	let { review = $bindable(), cash, i18n, formatApr, onConfirm, onDismiss }: Props = $props();

	function cancelReview(): void {
		if (review.confirmationPending) return;
		review = dismissFinancePurchaseReview(review);
		onDismiss();
	}

	/**
	 * This capture-phase boundary owns Escape while a review is visible. It
	 * prevents the page's later shortcut handler from consuming the same Escape
	 * and clearing the selected tile/city behind the dialog.
	 */
	function handleKeydownCapture(event: KeyboardEvent): void {
		if (event.key !== 'Escape' || review.purchase === null) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		cancelReview();
	}
</script>

<svelte:window onkeydowncapture={handleKeydownCapture} />

{#if review.purchase}
	<FinancePurchaseReviewDialog
		purchase={review.purchase}
		{cash}
		feedback={review.feedback}
		confirmationPending={review.confirmationPending}
		{i18n}
		{formatApr}
		{onConfirm}
		onCancel={cancelReview}
	/>
{/if}
