<script lang="ts">
	import NodeBroadside from '$lib/components/game/atlas/NodeBroadside.svelte';
	import ProductChainAtlas from '$lib/components/game/atlas/ProductChainAtlas.svelte';
	import {
		buildProductChainGraph,
		getSupportedStoreChainCategories
	} from '$lib/game/productChainGraph';
	import type { GameState, Store } from '$lib/game/types';

	interface Props {
		game: GameState;
		store: Store;
	}

	interface StoreChainSelection {
		storeId: string | null;
		categoryId: string | null;
		nodeId: string | null;
	}

	let { game, store }: Props = $props();

	let selection = $state<StoreChainSelection>({ storeId: null, categoryId: null, nodeId: null });
	let previousStoreId = $state<string | null>(null);

	const selectId = $props.id();
	const supportedCategories = $derived(getSupportedStoreChainCategories(store));
	const activeSelection = $derived.by(
		(): StoreChainSelection =>
			selection.storeId === store.id
				? selection
				: { storeId: store.id, categoryId: null, nodeId: null }
	);
	const selectedCategory = $derived.by(
		() =>
			supportedCategories.find((category) => category.id === activeSelection.categoryId) ??
			supportedCategories[0] ??
			null
	);
	const graph = $derived(
		selectedCategory
			? buildProductChainGraph({ game, store, categoryId: selectedCategory.id })
			: null
	);
	const selectedNode = $derived(
		graph && activeSelection.nodeId ? graph.details[activeSelection.nodeId] : null
	);

	$effect(() => {
		if (previousStoreId === store.id) return;
		previousStoreId = store.id;
		selection = { storeId: store.id, categoryId: null, nodeId: null };
	});

	function selectCategory(event: Event): void {
		selection = {
			storeId: store.id,
			categoryId: (event.currentTarget as HTMLSelectElement).value,
			nodeId: null
		};
	}

	function selectNode(nodeId: string | null): void {
		selection = {
			storeId: store.id,
			categoryId: selectedCategory?.id ?? activeSelection.categoryId,
			nodeId
		};
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
			<p class="chain-title">{graph.title}</p>
		</div>

		<div class="chain-content">
			<ProductChainAtlas
				{graph}
				selectedNodeId={activeSelection.nodeId}
				compact
				onSelectNode={selectNode}
			/>
			<NodeBroadside node={selectedNode} />
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

	.chain-title {
		margin: 0.15rem 0 0;
		font-family: var(--font-body);
		font-size: 0.85rem;
		font-style: italic;
		color: var(--ink-500);
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
