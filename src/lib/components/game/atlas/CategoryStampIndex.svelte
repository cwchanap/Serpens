<script lang="ts">
	import { INDUSTRY_MATERIAL_ART } from '$lib/assets/gameArt';
	import { formatQuantity, type ProductChainCategorySummary } from '$lib/game/productChainGraph';
	import type { MaterialId } from '$lib/game/types';

	interface Props {
		summaries: ProductChainCategorySummary[];
		activeCategoryId: string | null;
		mode: 'store-categories' | 'warehouse-flow';
		onSelectCategory: (categoryId: string) => void;
	}

	let { summaries, activeCategoryId, mode, onSelectCategory }: Props = $props();

	function iconFor(categoryId: string): string | null {
		return INDUSTRY_MATERIAL_ART[categoryId as MaterialId] ?? null;
	}
</script>

<div class="stamp-index" role="group" aria-label="Product category index">
	{#each summaries as summary (summary.categoryId)}
		{@const active = mode === 'store-categories' && activeCategoryId === summary.categoryId}
		{@const icon = iconFor(summary.categoryId)}
		<button
			type="button"
			class={['stamp', `stamp-${summary.health}`, active && 'is-active']}
			data-category-id={summary.categoryId}
			data-testid={`category-stamp-${summary.categoryId}`}
			aria-pressed={active}
			onclick={() => onSelectCategory(summary.categoryId)}
		>
			<span class={['seal', `seal-${summary.health}`]}>{summary.healthLabel}</span>
			<span class="name">{summary.name}</span>
			{#if icon}
				<span class="icons"><img src={icon} alt={summary.name} /></span>
			{/if}
			<span class="nums">
				stock {formatQuantity(summary.warehouseStock)} · made {formatQuantity(summary.produced)}/d ·
				sold {formatQuantity(summary.consumed)}/d
			</span>
		</button>
	{/each}
</div>

<style>
	.stamp-index {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
		gap: 0.75rem;
	}

	.stamp {
		display: grid;
		gap: 4px;
		padding: 12px 14px;
		background: color-mix(in srgb, var(--paper-50) 92%, var(--brass-100));
		border: 1px solid var(--paper-edge);
		text-align: left;
		color: var(--ink-700);
		font: inherit;
		cursor: pointer;
	}

	.stamp:hover {
		border-color: var(--brass-700);
	}

	.stamp.is-active {
		border-color: var(--brass-700);
		box-shadow:
			inset 0 0 0 1px var(--brass-700),
			0 0 0 3px color-mix(in srgb, var(--brass-700) 18%, transparent);
	}

	.seal {
		width: fit-content;
		padding: 2px 6px;
		font-family: var(--font-ui);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: var(--paper-50);
		background: var(--moss);
	}

	.seal-watch,
	.seal-no-report {
		background: var(--brass-700);
	}

	.seal-shortage,
	.seal-no-local-capacity {
		background: var(--wax-red);
	}

	.name {
		font-family: var(--font-display);
		font-size: 17px;
		line-height: 1.1;
		color: var(--ink-700);
	}

	.icons {
		display: flex;
		gap: 4px;
		margin-top: 2px;
	}

	.icons img {
		width: 22px;
		height: 22px;
		padding: 1px;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		border-radius: 50%;
		image-rendering: pixelated;
	}

	.nums {
		font-family: var(--font-mono);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: var(--ink-500);
	}
</style>
