<script lang="ts">
	import CategoryStampIndex from '$lib/components/game/atlas/CategoryStampIndex.svelte';
	import NodeBroadside from '$lib/components/game/atlas/NodeBroadside.svelte';
	import ProductChainAtlas from '$lib/components/game/atlas/ProductChainAtlas.svelte';
	import { getCityInventoryStats } from '$lib/game/cityInventory';
	import {
		buildWarehouseFlowGraph,
		getSupportedStoreChainCategories
	} from '$lib/game/productChainGraph';
	import {
		buildProductChainTree,
		buildStoreCategoryChainSummaries,
		getProductChainSupplyState
	} from '$lib/game/productChainTree';
	import {
		localizeProductChainCategorySummary,
		localizeProductChainGraph
	} from '$lib/i18n/gameCopy';
	import type { I18nBundle } from '$lib/i18n';
	import type { GameState } from '$lib/game/types';

	interface Props {
		game: GameState;
		i18n: I18nBundle;
		onPlanCategory?: (categoryId: string) => void;
		plannerCategoryIds?: readonly string[];
	}

	type ChainMode = 'store-categories' | 'warehouse-flow';

	interface NodeSelection {
		graphId: string | null;
		nodeId: string | null;
	}

	let { game, i18n, onPlanCategory = () => {}, plannerCategoryIds = [] }: Props = $props();

	let mode = $state<ChainMode>('store-categories');
	let selectedCategoryId = $state<string | null>(null);
	let nodeSelection = $state<NodeSelection>({ graphId: null, nodeId: null });

	const summaries = $derived(
		buildStoreCategoryChainSummaries(game).map((summary) =>
			localizeProductChainCategorySummary(summary, i18n)
		)
	);
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
	const categoryGraph = $derived.by(() =>
		activeCategory
			? localizeProductChainGraph(
					buildProductChainTree({
						game,
						store: null,
						categoryId: activeCategory.categoryId
					}),
					i18n
				)
			: null
	);
	const warehouseGraph = $derived(localizeProductChainGraph(buildWarehouseFlowGraph(game), i18n));
	const graph = $derived(mode === 'warehouse-flow' ? warehouseGraph : categoryGraph);
	const categorySupplyState = $derived(getProductChainSupplyState(game));
	const activeNodeId = $derived(
		graph && nodeSelection.graphId === graph.id ? nodeSelection.nodeId : null
	);
	const selectedNode = $derived(graph && activeNodeId ? graph.details[activeNodeId] : null);
	const headingText = $derived(
		mode === 'warehouse-flow'
			? i18n.t('productChainsPanel.cityInventoryFlow')
			: activeCategory
				? i18n.labels.productCategory(activeCategory.categoryId)
				: i18n.t('productChainsPanel.ariaLabel')
	);
	const canPlanActiveCategory = $derived(
		activeCategory ? plannerCategoryIds.includes(activeCategory.categoryId) : false
	);

	function cityName(cityId: string): string {
		return i18n.labels.worldCity(cityId).name;
	}

	function activeIndustryScopeLabel(): string {
		return i18n.t('productChainsPanel.activeIndustryInventory', {
			cityName: cityName(game.activeIndustryCityId)
		});
	}

	function retailSupplyScopeLabel(): string {
		const retailCityName = cityName(game.activeCityId);
		const supplyState = categorySupplyState;

		switch (supplyState.code) {
			case 'available': {
				const stats = getCityInventoryStats(game, supplyState.cityId);
				return i18n.t('productChainsPanel.activeRetailSupply', {
					retailCityName,
					sourceCityName: cityName(supplyState.cityId),
					used: i18n.format.integer(stats.used),
					capacity: i18n.format.integer(stats.capacity)
				});
			}
			case 'imports-only':
				return i18n.t('productChainsPanel.supplyState.importsOnly', { retailCityName });
			case 'zero-capacity':
				return i18n.t('productChainsPanel.supplyState.zeroCapacity', {
					retailCityName,
					sourceCityName: cityName(supplyState.cityId)
				});
		}
	}

	function selectedInventoryStateLabels(): string[] {
		const cityId =
			mode === 'warehouse-flow'
				? game.activeIndustryCityId
				: categorySupplyState.code === 'available' || categorySupplyState.code === 'zero-capacity'
					? categorySupplyState.cityId
					: null;
		if (!cityId) {
			return [];
		}

		const stats = getCityInventoryStats(game, cityId);
		const labels: string[] = [];
		if (stats.used === 0) {
			labels.push(
				i18n.t('productChainsPanel.supplyState.emptyInventory', {
					cityName: cityName(cityId)
				})
			);
		}
		if (stats.overflowUnits > 0) {
			labels.push(
				i18n.t('productChainsPanel.supplyState.inventoryOverflow', {
					cityName: cityName(cityId),
					units: i18n.format.integer(stats.overflowUnits),
					cost: i18n.format.currency(stats.overflowCost)
				})
			);
		}
		return labels;
	}

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

<section
	class="panel paper product-chains-panel atlas-sheet"
	aria-label={i18n.t('productChainsPanel.ariaLabel')}
>
	<div class="sheet-head">
		<div>
			<p class="eyebrow">{i18n.t('productChainsPanel.eyebrow')}</p>
			<h2>{headingText}</h2>
			{#if graph}
				<p class="chain-title">{graph.title}</p>
			{/if}
		</div>
		{#if activeCategory}
			<button
				type="button"
				class="plan-category"
				aria-label={i18n.t('supplyAdvisor.dialog')}
				disabled={!canPlanActiveCategory}
				onclick={() => onPlanCategory(activeCategory.categoryId)}
			>
				{i18n.t('supplyAdvisor.title')}
			</button>
		{/if}
		<div class="mode-toggle" role="group" aria-label={i18n.t('productChainsPanel.modeGroup')}>
			<button
				type="button"
				class:active={mode === 'store-categories'}
				aria-pressed={mode === 'store-categories'}
				onclick={() => selectMode('store-categories')}
			>
				{i18n.t('productChainsPanel.storeCategoryChains')}
			</button>
			<button
				type="button"
				class:active={mode === 'warehouse-flow'}
				aria-pressed={mode === 'warehouse-flow'}
				onclick={() => selectMode('warehouse-flow')}
			>
				{i18n.t('productChainsPanel.cityInventoryFlow')}
			</button>
		</div>
	</div>

	<section class="scope" aria-label={i18n.t('productChainsPanel.scopeAria')}>
		<p>{mode === 'warehouse-flow' ? activeIndustryScopeLabel() : retailSupplyScopeLabel()}</p>
		{#each selectedInventoryStateLabels() as stateLabel (stateLabel)}
			<p>{stateLabel}</p>
		{/each}
	</section>

	<div class="sheet-rule" aria-hidden="true"></div>

	{#if summaries.length > 0}
		<CategoryStampIndex
			{summaries}
			{i18n}
			activeCategoryId={activeCategory?.categoryId ?? null}
			{mode}
			onSelectCategory={selectCategory}
		/>
	{:else}
		<p class="empty">{i18n.t('productChainsPanel.emptyCategories')}</p>
	{/if}

	{#if graph}
		<ProductChainAtlas {graph} {i18n} selectedNodeId={activeNodeId} onSelectNode={selectNode}>
			{#snippet broadside()}
				<NodeBroadside {i18n} node={selectedNode} />
			{/snippet}
		</ProductChainAtlas>
	{:else}
		<p class="empty">{i18n.t('productChainsPanel.emptyGraph')}</p>
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

	.scope {
		display: grid;
		gap: 0.3rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.6rem 0.7rem;
	}

	.scope p {
		font-family: var(--font-body);
		font-size: 0.85rem;
		line-height: 1.4;
		color: var(--ink-700);
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

	.plan-category {
		min-height: 2rem;
		padding: 0.35rem 0.6rem;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		background: var(--moss);
		border: 1px solid var(--ink-900);
		border-radius: 2px;
		color: var(--paper-50);
		cursor: pointer;
	}

	.plan-category:hover,
	.plan-category:focus-visible {
		background: var(--moss-2);
	}

	.plan-category:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.plan-category:disabled:hover,
	.plan-category:disabled:focus-visible {
		background: var(--moss);
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
