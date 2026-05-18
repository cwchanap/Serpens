<script lang="ts">
	import ProductChainGraph from '$lib/components/game/ProductChainGraph.svelte';
	import ProductChainNodeDetail from '$lib/components/game/ProductChainNodeDetail.svelte';
	import {
		buildProductChainGraph,
		getSupportedStoreChainCategories
	} from '$lib/game/productChainGraph';
	import type { GameState, Store } from '$lib/game/types';

	interface Props {
		game: GameState;
		store: Store;
	}

	let { game, store }: Props = $props();

	let selectedCategoryOverride = $state<string | null>(null);
	let selectedNodeId = $state<string | null>(null);

	const selectId = $props.id();
	const supportedCategories = $derived(getSupportedStoreChainCategories(store));
	const selectedCategory = $derived.by(
		() =>
			supportedCategories.find((category) => category.id === selectedCategoryOverride) ??
			supportedCategories[0] ??
			null
	);
	const graph = $derived(
		selectedCategory
			? buildProductChainGraph({ game, store, categoryId: selectedCategory.id })
			: null
	);
	const selectedNode = $derived(graph && selectedNodeId ? graph.details[selectedNodeId] : null);

	function selectCategory(event: Event): void {
		selectedCategoryOverride = (event.currentTarget as HTMLSelectElement).value;
		selectedNodeId = null;
	}

	function selectNode(nodeId: string | null): void {
		selectedNodeId = nodeId;
	}
</script>

<section class="store-chain-panel" aria-label={`${store.name} product chain`}>
	{#if supportedCategories.length > 0 && selectedCategory && graph}
		<div class="chain-controls">
			<label for={selectId}>Product category</label>
			<select id={selectId} value={selectedCategory.id} onchange={selectCategory}>
				{#each supportedCategories as category (category.id)}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>
		</div>

		<div class="chain-content">
			<ProductChainGraph {graph} selectedNodeId={selectedNodeId} compact onSelectNode={selectNode} />
			<ProductChainNodeDetail node={selectedNode} />
		</div>
	{:else}
		<p class="empty">No local production chain available for this store's categories yet.</p>
	{/if}
</section>

<style>
	.store-chain-panel {
		display: grid;
		gap: 0.85rem;
		min-width: 0;
		color: var(--ink-700);
	}

	.chain-controls {
		display: grid;
		gap: 0.35rem;
	}

	label {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	select {
		width: 100%;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.92rem;
		padding: 0.45rem 0.55rem;
	}

	.chain-content {
		display: grid;
		gap: 0.85rem;
		min-width: 0;
	}

	.empty {
		margin: 0;
		border: 1px dashed var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.9rem;
		line-height: 1.45;
		padding: 0.8rem;
	}
</style>
