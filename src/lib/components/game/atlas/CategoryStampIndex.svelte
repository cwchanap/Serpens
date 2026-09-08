<script lang="ts">
	import { getProductArt } from '$lib/assets/gameArt';
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
</script>

<div class="stamp-index" role="group" aria-label={i18n.t('atlas.categoryIndex.ariaLabel')}>
	{#each summaries as summary (summary.productId)}
		{@const active = mode === 'store-categories' && activeProductId === summary.productId}
		{@const icon = getProductArt(summary.productId).path}
		{@const categoryName = i18n.labels.productCategory(summary.productId)}
		<button
			type="button"
			class={['stamp', `stamp-${summary.health}`, active && 'is-active']}
			data-category-id={summary.productId}
			data-testid={`category-stamp-${summary.productId}`}
			aria-pressed={active}
			title={`${categoryName} · ${i18n.t(`copy.productChainGraph.health.${summary.health}`)}`}
			onclick={() => onSelectProduct(summary.productId)}
		>
			<span class={['seal', `seal-${summary.health}`]}>
				{i18n.t(`copy.productChainGraph.health.${summary.health}`)}
			</span>
			<span class="name">{categoryName}</span>
			{#if summary.tier !== null}
				<span class="tier">{i18n.t('atlas.categoryIndex.tier', { tier: summary.tier })}</span>
			{/if}
			{#if icon}
				<span class="icons"><img src={icon} alt={categoryName} /></span>
			{/if}
			<span class="nums">
				{i18n.t('atlas.categoryIndex.metrics', {
					stock: i18n.format.decimal(summary.warehouseStock),
					produced: i18n.format.decimal(summary.produced),
					consumed: i18n.format.decimal(summary.consumed)
				})}
			</span>
		</button>
	{/each}
</div>

<style>
	.stamp-index {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.stamp {
		position: relative;
		display: grid;
		place-items: center;
		width: 74px;
		height: 74px;
		padding: 7px;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		border-radius: 50%;
		color: var(--ink-700);
		cursor: pointer;
	}
	.stamp:hover,
	.stamp.is-active {
		border-color: var(--brass-700);
	}
	.stamp.is-active {
		background: var(--paper-300);
	}
	.stamp:focus-visible {
		outline: 2px solid var(--brass-700);
		outline-offset: 3px;
	}
	.icons {
		display: contents;
	}
	.icons img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		image-rendering: pixelated;
	}
	.seal,
	.name,
	.tier,
	.nums {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.stamp-shortage::after,
	.stamp-no-local-capacity::after {
		content: '!';
		position: absolute;
		bottom: -2px;
		right: -2px;
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		font: 700 13px var(--font-ui);
		border-radius: 50%;
		background: var(--wax-red);
		color: var(--paper-50);
		border: 2px solid var(--paper-50);
	}
</style>
