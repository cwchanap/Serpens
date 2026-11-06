<script lang="ts">
	import type { I18nBundle } from '$lib/i18n';
	import FinancePurchaseReviewHost from './FinancePurchaseReviewHost.svelte';
	import {
		dismissFinancePurchaseReview,
		isFinanceReviewEscapeOwned,
		type FinancePurchaseReviewState
	} from './financePurchaseReview';

	interface Props {
		initialReview: FinancePurchaseReviewState;
		cash: number;
		i18n: I18nBundle;
		formatApr: (basisPoints: number) => string;
	}

	let { initialReview, cash, i18n, formatApr }: Props = $props();

	function createInitialReview(): FinancePurchaseReviewState {
		return initialReview;
	}

	let review = $state(createInitialReview());
	let selectedTileId = $state<string | null>('tile-12');
	let selectedWorldCityId = $state<string | null>('harbor-city');
	let pageEscapeHandlerCalls = $state(0);
	let dismissCalls = $state(0);

	// Mirrors construction.closeReview: guarded, then applies the shared
	// dismissal reducer to the single review state before focus restore.
	function handleDismiss(): void {
		if (review.confirmationPending) return;
		review = dismissFinancePurchaseReview(review);
		dismissCalls += 1;
	}

	// Mirrors the relevant ordering in +page.svelte: a mounted review owns
	// Escape, then the page clears world-city selection before tile selection.
	function handlePageKeydown(event: KeyboardEvent): void {
		if (event.key !== 'Escape') return;
		if (isFinanceReviewEscapeOwned(review)) return;
		pageEscapeHandlerCalls += 1;
		if (selectedWorldCityId !== null) {
			selectedWorldCityId = null;
			return;
		}
		if (selectedTileId !== null) selectedTileId = null;
	}
</script>

<svelte:window onkeydown={handlePageKeydown} />

<FinancePurchaseReviewHost
	{review}
	{cash}
	{i18n}
	{formatApr}
	onConfirm={() => {}}
	onDismiss={handleDismiss}
/>

<output data-testid="review-state">{review.purchase === null ? 'closed' : 'open'}</output>
<output data-testid="selected-world-city">{selectedWorldCityId ?? 'none'}</output>
<output data-testid="selected-tile">{selectedTileId ?? 'none'}</output>
<output data-testid="page-escape-handler-calls">{pageEscapeHandlerCalls}</output>
<output data-testid="dismiss-calls">{dismissCalls}</output>
