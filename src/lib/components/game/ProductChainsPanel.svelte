<script lang="ts">
	import CategoryStampIndex from '$lib/components/game/atlas/CategoryStampIndex.svelte';
	import NodeBroadside from '$lib/components/game/atlas/NodeBroadside.svelte';
	import ProductChainAtlas from '$lib/components/game/atlas/ProductChainAtlas.svelte';
	import { getCityInventory, getCityInventoryStats } from '$lib/game/cityInventory';
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
	import type { GameState, ProductId } from '$lib/game/types';

	interface Props {
		game: GameState;
		i18n: I18nBundle;
		onPlanProduct?: (productId: ProductId) => void;
		plannerProductIds?: readonly ProductId[];
	}

	type ChainMode = 'store-categories' | 'warehouse-flow';

	interface NodeSelection {
		graphId: string | null;
		nodeId: string | null;
	}

	let { game, i18n, onPlanProduct = () => {}, plannerProductIds = [] }: Props = $props();

	let mode = $state<ChainMode>('store-categories');
	let selectedProductId = $state<ProductId | null>(null);
	let nodeSelection = $state<NodeSelection>({ graphId: null, nodeId: null });

	const summaries = $derived(
		buildStoreCategoryChainSummaries(game).map((summary) =>
			localizeProductChainCategorySummary(summary, i18n)
		)
	);
	const defaultProductId = $derived(
		game.stores.flatMap((store) => getSupportedStoreChainCategories(store))[0]?.id ?? null
	);
	const activeCategory = $derived.by(
		() =>
			summaries.find((summary) => summary.productId === selectedProductId) ??
			summaries.find((summary) => summary.productId === defaultProductId) ??
			summaries[0] ??
			null
	);
	const categoryGraph = $derived.by(() =>
		activeCategory
			? localizeProductChainGraph(
					buildProductChainTree({
						game,
						store: null,
						productId: activeCategory.productId
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
				? i18n.labels.productCategory(activeCategory.productId)
				: i18n.t('productChainsPanel.ariaLabel')
	);

	function cityName(cityId: string): string {
		return i18n.labels.worldCity(cityId).name;
	}

	const capacityStrip = $derived.by(() => {
		if (mode === 'warehouse-flow') {
			const cityId = game.activeIndustryCityId;
			if (!cityId || !getCityInventory(game, cityId).ok) {
				return null;
			}
			const stats = getCityInventoryStats(game, cityId);
			return {
				label: i18n.t('productChainsPanel.activeIndustryInventory', {
					cityName: cityName(cityId)
				}),
				used: stats.used,
				capacity: stats.capacity
			};
		}
		const supplyState = categorySupplyState;
		if (supplyState.code !== 'available' || !getCityInventory(game, supplyState.cityId).ok) {
			return null;
		}
		const stats = getCityInventoryStats(game, supplyState.cityId);
		return { label: cityName(supplyState.cityId), used: stats.used, capacity: stats.capacity };
	});
	const capacityFillPercent = $derived(
		capacityStrip && capacityStrip.capacity > 0
			? Math.min(100, (capacityStrip.used / capacityStrip.capacity) * 100)
			: 0
	);

	function supplyStateCaption(): string | null {
		if (mode !== 'store-categories') {
			return null;
		}
		const supplyState = categorySupplyState;
		switch (supplyState.code) {
			case 'imports-only':
				return i18n.t('productChainsPanel.supplyState.importsOnly', {
					retailCityName: cityName(game.activeCityId)
				});
			case 'zero-capacity':
				return i18n.t('productChainsPanel.supplyState.zeroCapacity', {
					retailCityName: cityName(game.activeCityId),
					sourceCityName: cityName(supplyState.cityId)
				});
			default:
				return null;
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

	function selectProduct(productId: ProductId): void {
		mode = 'store-categories';
		selectedProductId = productId;
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
	class="panel product-chains-panel atlas-sheet"
	aria-label={i18n.t('productChainsPanel.ariaLabel')}
>
	<div class="sheet-head">
		<div>
			<p class="eyebrow">{i18n.t('productChainsPanel.eyebrow')}</p>
			<h2>{headingText}</h2>
		</div>
		<div class="head-controls">
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
			{#if activeCategory}
				<button
					type="button"
					class="plan-category"
					aria-label={i18n.t('supplyAdvisor.dialog')}
					disabled={!plannerProductIds.includes(activeCategory.productId)}
					onclick={() => onPlanProduct(activeCategory.productId)}
				>
					{i18n.t('supplyAdvisor.title')}
				</button>
			{/if}
		</div>
	</div>

	<div class="sheet-rule" aria-hidden="true"></div>

	{#if summaries.length > 0}
		<div class="index-band">
			<CategoryStampIndex
				{summaries}
				{i18n}
				activeProductId={activeCategory?.productId ?? null}
				{mode}
				onSelectProduct={selectProduct}
			/>
			{#if capacityStrip}
				<div class="capacity-strip" aria-label={i18n.t('productChainsPanel.capacityLabel')}>
					<span class="cap-name">{capacityStrip.label}</span>
					<span class="cap-bar">
						<span class="cap-fill" style:width={`${capacityFillPercent}%`}></span>
					</span>
					<span class="cap-figures">
						{i18n.t('atlas.capacityStrip.figures', {
							used: i18n.format.integer(capacityStrip.used),
							capacity: i18n.format.integer(capacityStrip.capacity)
						})}
					</span>
				</div>
			{/if}
		</div>
	{:else}
		<p class="empty">{i18n.t('productChainsPanel.emptyCategories')}</p>
	{/if}
	{#if supplyStateCaption()}
		<p class="scope-note wax">{supplyStateCaption()}</p>
	{/if}
	{#each selectedInventoryStateLabels() as stateLabel (stateLabel)}
		<p class="scope-note">{stateLabel}</p>
	{/each}

	{#if graph}
		<p class="chain-title">{graph.title}</p>
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
		gap: 0.9rem;
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

	.head-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: flex-end;
		gap: 0.4rem;
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

	.index-band {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.capacity-strip {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid var(--brass-700);
		border-radius: 2px;
		background: color-mix(in srgb, var(--brass-100) 35%, var(--paper-50));
	}

	.cap-name {
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--ink-700);
		white-space: nowrap;
	}

	.cap-bar {
		position: relative;
		display: inline-block;
		width: 110px;
		height: 8px;
		background: var(--paper-200);
		border: 1px solid var(--brass-700);
		border-radius: 1px;
		overflow: hidden;
	}

	.cap-fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--brass-700);
	}

	.cap-figures {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--ink-700);
		white-space: nowrap;
	}

	.scope-note {
		font-family: var(--font-body);
		font-size: 0.8rem;
		line-height: 1.35;
		color: var(--ink-500);
	}

	.scope-note.wax {
		color: var(--wax-red);
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
		min-height: 1.9rem;
		padding: 0.3rem 0.5rem;
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		color: var(--ink-700);
		cursor: pointer;
	}

	.plan-category {
		min-height: 1.9rem;
		padding: 0.3rem 0.6rem;
		font-family: var(--font-ui);
		font-size: 0.7rem;
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

		.head-controls {
			justify-content: flex-start;
		}

		.mode-toggle {
			justify-content: flex-start;
		}
	}
</style>
