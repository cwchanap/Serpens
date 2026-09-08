<script lang="ts">
	import HudIcon from '$lib/components/game/HudIcon.svelte';
	import { chainOverview } from '$lib/components/game/atlas/chainOverview';
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
	import type { GameState, ProductId } from '$lib/game/types';

	interface Props {
		game: GameState;
		i18n: I18nBundle;
		onPlanProduct?: (productId: ProductId) => void;
		plannerProductIds?: readonly ProductId[];
		onClose?: () => void;
	}

	type ChainMode = 'store-categories' | 'warehouse-flow';

	interface NodeSelection {
		graphId: string | null;
		nodeId: string | null;
	}

	let { game, i18n, onPlanProduct = () => {}, plannerProductIds = [], onClose }: Props = $props();

	let mode = $state<ChainMode>('store-categories');
	let fullChain = $state(false);
	let selectedProductId = $state<ProductId | null>(null);
	let nodeSelection = $state<NodeSelection>({ graphId: null, nodeId: null });

	const categoryOrder: readonly ProductId[] = [
		'snacks',
		'soft-drinks',
		'produce',
		'essentials',
		'household'
	];
	const summaries = $derived(
		buildStoreCategoryChainSummaries(game)
			.map((summary) => localizeProductChainCategorySummary(summary, i18n))
			.sort(
				(a, b) =>
					(categoryOrder.indexOf(a.productId) < 0 ? 99 : categoryOrder.indexOf(a.productId)) -
					(categoryOrder.indexOf(b.productId) < 0 ? 99 : categoryOrder.indexOf(b.productId))
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
	const overview = $derived.by(() => {
		if (!categoryGraph) return null;
		const compact = chainOverview(categoryGraph);
		if (categorySupplyState.code !== 'available') return compact;
		const supplyCityId = categorySupplyState.cityId;
		const product = compact.nodes.at(-1);
		if (!product?.id.startsWith('product:')) return compact;
		// The category endpoint is this product's stock in its assigned supply warehouse.
		const warehouse = {
			...product,
			kind: 'warehouse' as const,
			label: i18n.labels.industrialBuilding('warehouse'),
			subLabel: product.label,
			capacity: {
				...product.capacity,
				buildingCount: game.industrialBuildings.filter(
					(building) => building.cityId === supplyCityId && building.typeId === 'warehouse'
				).length
			},
			statLine: i18n.t('worldMap.stockHeld', { stock: i18n.format.integer(product.warehouseStock) })
		};
		return {
			...compact,
			nodes: compact.nodes.map((node) => (node.id === product.id ? warehouse : node)),
			details: { ...compact.details, [product.id]: warehouse }
		};
	});
	const visibleGraph = $derived(mode === 'store-categories' && !fullChain ? overview : graph);
	const categorySupplyState = $derived(getProductChainSupplyState(game));
	const inventoryCityId = $derived(
		mode === 'warehouse-flow'
			? game.activeIndustryCityId
			: categorySupplyState.code === 'imports-only'
				? null
				: categorySupplyState.cityId
	);
	const inventoryStats = $derived(
		inventoryCityId ? getCityInventoryStats(game, inventoryCityId) : null
	);
	const activeNodeId = $derived(
		graph && nodeSelection.graphId === graph.id ? nodeSelection.nodeId : null
	);
	const selectedNode = $derived(
		visibleGraph && activeNodeId ? visibleGraph.details[activeNodeId] : null
	);
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

<section class="panel product-chains-panel" aria-label={i18n.t('productChainsPanel.ariaLabel')}>
	<div class="sheet-head">
		<div>
			<p class="eyebrow">{i18n.t('productChainsPanel.eyebrow')}</p>
			<h2>{headingText}</h2>
			{#if graph}
				<p class="chain-title">{graph.title}</p>
			{/if}
		</div>
		<div class="mode-toggle" role="group" aria-label={i18n.t('productChainsPanel.modeGroup')}>
			<button
				type="button"
				class:active={mode === 'store-categories'}
				aria-pressed={mode === 'store-categories'}
				onclick={() => selectMode('store-categories')}
			>
				<HudIcon name="retail" /><span class="sr-only"
					>{i18n.t('productChainsPanel.storeCategoryChains')}</span
				>
			</button>
			<button
				type="button"
				class:active={mode === 'warehouse-flow'}
				aria-pressed={mode === 'warehouse-flow'}
				onclick={() => selectMode('warehouse-flow')}
			>
				<svg
					class="flow-icon"
					viewBox="0 0 24 24"
					aria-hidden="true"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
					><path d="M4 7h16v13H4z" /><path d="M4 12h16" /><path d="M9 7v13" /></svg
				><span class="sr-only">{i18n.t('productChainsPanel.cityInventoryFlow')}</span>
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
				<svg
					class="advisor-icon"
					viewBox="0 0 24 24"
					aria-hidden="true"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg
				>{i18n.t('productChainsPanel.advisor')}
			</button>
		{/if}

		{#if onClose}
			<button
				type="button"
				class="close-chain btn-danger"
				aria-label={i18n.t('route.controlTower.closePanel', {
					panel: i18n.t('productChainsPanel.ariaLabel')
				})}
				onclick={onClose}>×</button
			>
		{/if}
	</div>

	<div class="category-toolbar">
		{#if summaries.length > 0}
			<CategoryStampIndex
				{summaries}
				{i18n}
				activeProductId={activeCategory?.productId ?? null}
				{mode}
				onSelectProduct={selectProduct}
			/>
		{:else}
			<p class="empty">{i18n.t('productChainsPanel.emptyCategories')}</p>
		{/if}
		<div class="inventory-scope">
			{#if mode === 'store-categories' && overview && categoryGraph && overview.nodes.length < categoryGraph.nodes.length}
				<button
					type="button"
					class="branch-toggle"
					aria-pressed={fullChain}
					onclick={() => {
						fullChain = !fullChain;
						nodeSelection = { graphId: null, nodeId: null };
					}}
				>
					<span class="sr-only"
						>{i18n.t(
							fullChain ? 'productChainsPanel.overview' : 'productChainsPanel.fullChain'
						)}</span
					><span aria-hidden="true">{fullChain ? '⊖' : '⊕'}</span>
				</button>
			{/if}
			{#if inventoryStats && inventoryCityId}
				<span
					class="inventory-strip"
					title={mode === 'warehouse-flow' ? activeIndustryScopeLabel() : retailSupplyScopeLabel()}
				>
					<span>{cityName(inventoryCityId)}</span>
					<meter
						min="0"
						max={Math.max(1, inventoryStats.capacity)}
						value={inventoryStats.used}
						aria-label={i18n.t('productChainsPanel.scopeAria')}
					></meter>
					<strong
						>{i18n.format.integer(inventoryStats.used)} / {i18n.format.integer(
							inventoryStats.capacity
						)}</strong
					>
				</span>
			{/if}
			<details class="scope">
				<summary
					aria-label={i18n.t('productChainsPanel.scopeAria')}
					title={i18n.t('productChainsPanel.scopeAria')}>ⓘ</summary
				>
				<div>
					<p>
						{mode === 'warehouse-flow' ? activeIndustryScopeLabel() : retailSupplyScopeLabel()}
					</p>
					{#each selectedInventoryStateLabels() as stateLabel (stateLabel)}
						<p>{stateLabel}</p>
					{/each}
				</div>
			</details>
		</div>
	</div>

	{#if visibleGraph}
		<div class="chain-layout">
			<ProductChainAtlas
				graph={visibleGraph}
				{i18n}
				compact
				selectedNodeId={activeNodeId}
				onSelectNode={selectNode}
			/>
			<NodeBroadside {i18n} node={selectedNode} />
		</div>
	{:else}
		<p class="empty">{i18n.t('productChainsPanel.emptyGraph')}</p>
	{/if}
</section>

<style>
	.product-chains-panel {
		display: grid;
		gap: 14px;
		padding: 0;
	}
	.sheet-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding-bottom: 7px;
		border-bottom: 1px solid var(--brass-700);
	}
	.sheet-head > div:first-child {
		min-width: 0;
		margin-right: auto;
	}
	h2,
	p {
		margin: 0;
	}
	h2 {
		font: 26px var(--font-display);
		color: var(--ink-900);
	}
	.eyebrow {
		color: var(--brass-700);
		font: 700 10px var(--font-ui);
		letter-spacing: 0.22em;
		text-transform: uppercase;
	}
	.chain-title,
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	.mode-toggle {
		display: flex;
	}
	.mode-toggle button {
		display: grid;
		place-items: center;
		width: 47px;
		height: 40px;
		padding: 0;
		background: var(--paper-50);
		border: 1px solid var(--brass-700);
		color: var(--ink-700);
		cursor: pointer;
	}
	.mode-toggle button + button {
		border-left: 0;
	}
	.mode-toggle button.active,
	.mode-toggle button[aria-pressed='true'] {
		background: var(--paper-300);
	}
	.branch-toggle {
		width: 24px;
		height: 24px;
		padding: 0;
		border: 1px solid var(--paper-edge);
		background: var(--paper-50);
		color: var(--brass-700);
		cursor: pointer;
	}
	.flow-icon {
		width: 20px;
		height: 20px;
	}
	.plan-category {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 40px;
		padding: 0 14px;
		font: 700 13px var(--font-ui);
		background: var(--moss);
		border: 1px solid var(--ink-900);
		border-radius: 2px;
		color: var(--paper-50);
		cursor: pointer;
	}
	.advisor-icon {
		width: 17px;
		height: 17px;
	}
	.plan-category:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.close-chain {
		flex: 0 0 40px;
		height: 40px;
		padding: 0;
		font-size: 24px;
	}
	.category-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding-bottom: 14px;
		border-bottom: 1px solid var(--brass-700);
	}
	.inventory-scope {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.inventory-strip {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 12px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-50);
		white-space: nowrap;
	}
	.inventory-strip > span {
		font: 700 9px var(--font-ui);
		color: var(--brass-700);
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}
	.inventory-strip strong {
		font: 700 12px var(--font-mono);
	}
	meter {
		width: 100px;
		height: 8px;
		appearance: none;
		background: var(--paper-300);
		border: 0;
		border-radius: 4px;
	}
	meter::-webkit-meter-bar {
		height: 8px;
		background: var(--paper-300);
		border: 0;
	}
	meter::-webkit-meter-optimum-value {
		background: var(--brass-700);
	}
	.scope summary {
		cursor: pointer;
		list-style: none;
		color: var(--brass-700);
	}
	.scope > div {
		position: absolute;
		right: 0;
		top: 100%;
		width: min(300px, 80vw);
		z-index: 5;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		padding: 12px;
		box-shadow: var(--shadow-paper);
	}
	.scope p {
		font: 13px/1.4 var(--font-body);
		color: var(--ink-700);
	}
	.chain-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 280px;
		align-items: start;
		gap: 16px;
	}
	.chain-layout :global(.broadside) {
		min-height: 264px;
	}
	.empty {
		color: var(--ink-500);
		font: 14px/1.45 var(--font-body);
	}
	@media (max-width: 1000px) {
		.category-toolbar {
			flex-wrap: wrap;
		}
	}
	@media (max-width: 700px) {
		.chain-layout {
			grid-template-columns: minmax(0, 1fr);
		}
		.sheet-head {
			flex-wrap: wrap;
		}
		.sheet-head > div:first-child {
			flex: 1 1 100%;
		}
		.inventory-strip {
			flex-wrap: wrap;
			white-space: normal;
		}
	}
</style>
