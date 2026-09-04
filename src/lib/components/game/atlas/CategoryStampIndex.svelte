<script lang="ts">
	import { INDUSTRY_MATERIAL_ART } from '$lib/assets/gameArt';
	import { getProductDefinition } from '$lib/game/products';
	import type { LocalizedProductChainCategorySummary } from '$lib/i18n/localizedTypes';
	import type { I18nBundle } from '$lib/i18n';
	import type { ProductId } from '$lib/game/types';

	interface Props {
		i18n: I18nBundle;
		summaries: LocalizedProductChainCategorySummary[];
		activeProductId: ProductId | null;
		mode: 'store-categories' | 'warehouse-flow';
		onSelectProduct: (productId: ProductId) => void;
	}

	let { i18n, summaries, activeProductId, mode, onSelectProduct }: Props = $props();

	function iconFor(productId: ProductId): string | null {
		const materialId = getProductDefinition(productId).productionMaterialId;
		return materialId ? (INDUSTRY_MATERIAL_ART[materialId] ?? null) : null;
	}
</script>

<div class="stamp-index" role="group" aria-label={i18n.t('atlas.categoryIndex.ariaLabel')}>
	{#each summaries as summary (summary.productId)}
		{@const active = mode === 'store-categories' && activeProductId === summary.productId}
		{@const icon = iconFor(summary.productId)}
		{@const categoryName = i18n.labels.productCategory(summary.productId)}
		{@const attention = summary.health === 'shortage' || summary.health === 'no-local-capacity'}
		<button
			type="button"
			class={['stamp', active && 'is-active', attention && 'has-attention']}
			data-category-id={summary.productId}
			data-testid={`category-stamp-${summary.productId}`}
			aria-pressed={active}
			aria-label={categoryName}
			title={categoryName}
			onclick={() => onSelectProduct(summary.productId)}
		>
			{#if icon}
				<img src={icon} alt="" />
			{:else}
				<span class="dash" aria-hidden="true">—</span>
			{/if}
			{#if attention}
				<span class="attention" aria-hidden="true">!</span>
			{/if}
		</button>
	{/each}
</div>

<style>
	.stamp-index {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
	}

	.stamp {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 70px;
		height: 70px;
		padding: 0;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		border-radius: 50%;
		cursor: pointer;
	}

	.stamp:hover {
		border-color: var(--brass-700);
	}

	.stamp.is-active {
		background: color-mix(in srgb, var(--brass-100) 78%, var(--paper-50));
		border: 2px solid var(--brass-700);
		box-shadow: 0 0 0 3px color-mix(in srgb, var(--brass-700) 18%, transparent);
	}

	.stamp img {
		width: 44px;
		height: 44px;
		image-rendering: pixelated;
	}

	.dash {
		font-family: var(--font-mono);
		font-size: 1.1rem;
		color: var(--ink-500);
	}

	.attention {
		position: absolute;
		right: -2px;
		bottom: -2px;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		font-family: var(--font-ui);
		font-size: 11px;
		font-weight: 700;
		color: var(--paper-50);
		background: var(--wax-red);
		border: 1px solid var(--paper-50);
		border-radius: 50%;
	}
</style>
