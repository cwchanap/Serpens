<script lang="ts">
	import ProductChainGraph from '$lib/components/game/ProductChainGraph.svelte';
	import ProductChainNodeDetail from '$lib/components/game/ProductChainNodeDetail.svelte';
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
		nodeSelection = {
			graphId: graph?.id ?? null,
			nodeId
		};
	}

	function formatQuantity(value: number): string {
		return Number.isInteger(value)
			? String(value)
			: value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
	}
</script>

<section class="panel paper product-chains-panel" aria-labelledby="product-chains-heading">
	<div class="panel-heading">
		<div>
			<p class="eyebrow">Control board</p>
			<h2 id="product-chains-heading">Product Chains</h2>
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

	{#if summaries.length > 0}
		<div class="summary-grid" aria-label="Store category chains">
			{#each summaries as summary (summary.categoryId)}
				<button
					type="button"
					class:active={mode === 'store-categories' && activeCategory?.categoryId === summary.categoryId}
					aria-pressed={mode === 'store-categories' && activeCategory?.categoryId === summary.categoryId}
					onclick={() => selectCategory(summary.categoryId)}
				>
					<span class={['status', `status-${summary.health}`]}>{summary.healthLabel}</span>
					<strong>{summary.name}</strong>
					<span>{summary.bottleneck}</span>
					<dl>
						<div>
							<dt>Stock</dt>
							<dd>{formatQuantity(summary.warehouseStock)}</dd>
						</div>
						<div>
							<dt>Made</dt>
							<dd>{formatQuantity(summary.produced)}/day</dd>
						</div>
						<div>
							<dt>Sold</dt>
							<dd>{formatQuantity(summary.consumed)}/day</dd>
						</div>
						<div>
							<dt>Imports</dt>
							<dd>{formatQuantity(summary.imported)}/day</dd>
						</div>
					</dl>
				</button>
			{/each}
		</div>
	{:else}
		<p class="empty">No store categories have local production chains yet.</p>
	{/if}

	{#if graph}
		<div class="graph-layout">
			<ProductChainGraph {graph} selectedNodeId={activeNodeId} onSelectNode={selectNode} />
			<ProductChainNodeDetail node={selectedNode} />
		</div>
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

	.panel-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	h2,
	p,
	dl {
		margin: 0;
	}

	h2 {
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.eyebrow,
	.status,
	dt {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.mode-toggle {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		justify-content: flex-end;
	}

	.mode-toggle button,
	.summary-grid button {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
	}

	.mode-toggle button {
		min-height: 2rem;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		padding: 0.35rem 0.55rem;
	}

	.mode-toggle button.active,
	.summary-grid button.active {
		border-color: var(--brass-700);
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--brass-700) 16%, transparent);
	}

	.summary-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
		gap: 0.75rem;
	}

	.summary-grid button {
		display: grid;
		min-width: 0;
		gap: 0.45rem;
		padding: 0.75rem;
		text-align: left;
	}

	.summary-grid button:hover,
	.mode-toggle button:hover {
		border-color: var(--brass-700);
	}

	.summary-grid strong {
		overflow-wrap: anywhere;
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.summary-grid span:not(.status) {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.82rem;
		line-height: 1.35;
	}

	.status {
		width: fit-content;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: color-mix(in srgb, var(--paper-50) 82%, white);
		padding: 0.18rem 0.35rem;
	}

	.status-healthy {
		color: var(--moss);
	}

	.status-watch,
	.status-no-report {
		color: var(--brass-700);
	}

	.status-shortage,
	.status-no-local-capacity {
		color: var(--wax-red);
	}

	dl {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.45rem;
	}

	dl div {
		min-width: 0;
	}

	dd {
		margin: 0.12rem 0 0;
		overflow-wrap: anywhere;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		font-variant-numeric: tabular-nums lining-nums;
		color: var(--ink-700);
	}

	.graph-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(13rem, 17rem);
		gap: 1rem;
		min-width: 0;
	}

	.empty {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.92rem;
		line-height: 1.45;
	}

	@media (max-width: 980px) {
		.panel-heading,
		.graph-layout {
			grid-template-columns: 1fr;
		}

		.panel-heading {
			display: grid;
		}

		.mode-toggle {
			justify-content: flex-start;
		}
	}

	@media (max-width: 620px) {
		dl {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
