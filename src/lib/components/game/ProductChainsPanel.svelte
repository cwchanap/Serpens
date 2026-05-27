<script lang="ts">
	import CategoryStampIndex from '$lib/components/game/atlas/CategoryStampIndex.svelte';
	import NodeBroadside from '$lib/components/game/atlas/NodeBroadside.svelte';
	import ProductChainAtlas from '$lib/components/game/atlas/ProductChainAtlas.svelte';
	import {
		buildProductChainGraph,
		buildStoreCategoryChainSummaries,
		buildWarehouseFlowGraph,
		getSupportedStoreChainCategories
	} from '$lib/game/productChainGraph';
	import type { GameState } from '$lib/game/types';

	interface Props {
		game: GameState;
	}

	type ChainMode = 'store-categories' | 'warehouse-flow';

	interface NodeSelection {
		graphId: string | null;
		nodeId: string | null;
	}

	let { game }: Props = $props();

	let mode = $state<ChainMode>('store-categories');
	let selectedCategoryId = $state<string | null>(null);
	let nodeSelection = $state<NodeSelection>({ graphId: null, nodeId: null });

	const summaries = $derived(buildStoreCategoryChainSummaries(game));
	const defaultCategoryId = $derived(
		game.stores.flatMap((store) => getSupportedStoreChainCategories(store))[0]?.id ?? null
	);
	const activeCategory = $derived.by(
		() =>
			summaries.find((summary) => summary.categoryId === selectedCategoryId) ??
			summaries.find((summary) => summary.categoryId === defaultCategoryId) ??
			summaries[0] ??
			null
	);
	const categoryGraph = $derived(
		activeCategory
			? buildProductChainGraph({
					game,
					store: null,
					categoryId: activeCategory.categoryId
				})
			: null
	);
	const warehouseGraph = $derived(buildWarehouseFlowGraph(game));
	const graph = $derived(mode === 'warehouse-flow' ? warehouseGraph : categoryGraph);
	const activeNodeId = $derived(
		graph && nodeSelection.graphId === graph.id ? nodeSelection.nodeId : null
	);
	const selectedNode = $derived(graph && activeNodeId ? graph.details[activeNodeId] : null);
	const headingText = $derived(
		mode === 'warehouse-flow' ? 'Warehouse flow' : (activeCategory?.name ?? 'Product Chains')
	);

	function selectCategory(categoryId: string): void {
		mode = 'store-categories';
		selectedCategoryId = categoryId;
		nodeSelection = { graphId: null, nodeId: null };
	}

	function selectMode(nextMode: ChainMode): void {
		mode = nextMode;
		nodeSelection = { graphId: null, nodeId: null };
	}

	function selectNode(nodeId: string | null): void {
		nodeSelection = { graphId: graph?.id ?? null, nodeId };
	}
</script>

<section class="panel paper product-chains-panel atlas-sheet" aria-label="Product Chains">
	<div class="sheet-head">
		<div>
			<p class="eyebrow">Folio II · Production Chain</p>
			<h2>{headingText}</h2>
			{#if graph}
				<p class="chain-title">{graph.title}</p>
			{/if}
		</div>
		<div class="mode-toggle" role="group" aria-label="Product chain view">
			<button
				type="button"
				class:active={mode === 'store-categories'}
				aria-pressed={mode === 'store-categories'}
				onclick={() => selectMode('store-categories')}
			>
				Store category chains
			</button>
			<button
				type="button"
				class:active={mode === 'warehouse-flow'}
				aria-pressed={mode === 'warehouse-flow'}
				onclick={() => selectMode('warehouse-flow')}
			>
				Warehouse flow
			</button>
		</div>
	</div>

	<div class="sheet-rule" aria-hidden="true"></div>

	{#if summaries.length > 0}
		<CategoryStampIndex
			{summaries}
			activeCategoryId={activeCategory?.categoryId ?? null}
			{mode}
			onSelectCategory={selectCategory}
		/>
	{:else}
		<p class="empty">No store categories have local production chains yet.</p>
	{/if}

	{#if graph}
		<ProductChainAtlas {graph} selectedNodeId={activeNodeId} onSelectNode={selectNode}>
			{#snippet broadside()}
				<NodeBroadside node={selectedNode} />
			{/snippet}
		</ProductChainAtlas>
	{:else}
		<p class="empty">No chain graph is available.</p>
	{/if}
</section>

<style>
	.product-chains-panel {
		display: grid;
		gap: 1rem;
		padding: 1.1rem 1.2rem;
	}

	.sheet-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.sheet-head > div:first-child {
		min-width: 0;
		display: grid;
		gap: 2px;
	}

	.sheet-rule {
		border-top: 1px solid var(--brass-700);
		border-bottom: 3px double var(--brass-700);
		height: 5px;
	}

	h2,
	p {
		margin: 0;
	}

	h2 {
		font-family: var(--font-display);
		font-size: 1.4rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.chain-title {
		font-family: var(--font-body);
		font-size: 0.85rem;
		font-style: italic;
		color: var(--ink-500);
	}

	.eyebrow {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.22em;
		text-transform: uppercase;
	}

	.mode-toggle {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		justify-content: flex-end;
	}

	.mode-toggle button {
		min-height: 2rem;
		padding: 0.35rem 0.55rem;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		color: var(--ink-700);
		cursor: pointer;
	}

	.mode-toggle button.active {
		border-color: var(--brass-700);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--brass-700) 16%, transparent);
	}

	.empty {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.92rem;
		line-height: 1.45;
	}

	@media (max-width: 980px) {
		.sheet-head {
			display: grid;
		}

		.mode-toggle {
			justify-content: flex-start;
		}
	}
</style>
