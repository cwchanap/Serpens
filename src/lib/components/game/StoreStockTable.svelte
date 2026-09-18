<script lang="ts">
	import { tick } from 'svelte';
	import { asset } from '$app/paths';
	import { getProductArt } from '$lib/assets/gameArt';
	import { getArchetype } from '$lib/game/archetypes';
	import { getSupportedBrands } from '$lib/game/brands';
	import { getProductDefinition, getProductFreshnessPercent } from '$lib/game/products';
	import type { GameRouteCommitResult } from '$lib/game/commandResult';
	import type { StockRecoveryView } from '$lib/game/stockRecovery';
	import { getStoreProductStatus, getStoreProductStock } from '$lib/game/stock';
	import { localizeStockStatus, tScoped } from '$lib/i18n/gameCopy';
	import type { I18nBundle } from '$lib/i18n';
	import { storeDisplayName } from '$lib/i18n/gameCopy';
	import type {
		BrandId,
		DailyProductReport,
		DailyStoreReport,
		ProductId,
		Store,
		StoreProduct,
		StoreProductPatch
	} from '$lib/game/types';

	interface Props {
		i18n: I18nBundle;
		store: Store;
		ordinal: number;
		latestReport: DailyStoreReport | null;
		onUpdate: (
			storeId: string,
			productId: ProductId,
			patch: StoreProductPatch
		) => Promise<GameRouteCommitResult | null> | void;
		onUpdateBrand?: (storeId: string, productId: ProductId, brandId: BrandId) => void;
		canUpdateSellingPrice?: boolean;
		canUpdateInventoryTargets?: boolean;
		canUpdateBrand?: boolean;
		allowedProductIds?: readonly ProductId[];
		disabledReason?: string | null;
		/** Deep-link focus target from a stock alert; transient, never persisted. */
		focusedProductId?: ProductId | null;
		/** Per-product recovery read model derived by the owner (StoreDetailModal). */
		recoveryViews?: ReadonlyMap<ProductId, StockRecoveryView>;
		/** Product ids the supply planner currently supports; gates the Plan supply action. */
		plannerProductIds?: readonly ProductId[];
		onManageSupplySource?: (retailCityId: string) => void;
		onPlanSupply?: (productId: ProductId) => void;
	}

	let {
		i18n,
		store,
		ordinal,
		latestReport,
		onUpdate,
		onUpdateBrand = () => {},
		canUpdateSellingPrice = true,
		canUpdateInventoryTargets = true,
		canUpdateBrand = true,
		allowedProductIds = store.products.map((product) => product.productId),
		disabledReason = null,
		focusedProductId = null,
		recoveryViews = new Map<ProductId, StockRecoveryView>(),
		plannerProductIds = [],
		onManageSupplySource = () => {},
		onPlanSupply = () => {}
	}: Props = $props();
	const allowedProductSet = $derived(new Set(allowedProductIds));
	const hasDisallowedProduct = $derived(
		store.products.some((product) => !allowedProductSet.has(product.productId))
	);

	function getProductName(productId: ProductId): string {
		return i18n.labels.productCategory(productId);
	}

	function getImportCost(productId: ProductId): number {
		if (!getArchetype(store.archetypeId).startingProductIds.includes(productId)) {
			return 0;
		}
		return getProductDefinition(productId)?.importCost ?? 0;
	}

	function getProductReport(productId: ProductId): DailyProductReport | null {
		return latestReport?.productReports.find((report) => report.productId === productId) ?? null;
	}

	function getFreshnessPercent(
		productId: ProductId,
		report: DailyProductReport | null
	): number | null {
		return getProductFreshnessPercent(productId, report ? report.averageAgeDays : null);
	}

	type PressureKind =
		| 'stockout'
		| 'waste'
		| 'shrink'
		| 'markdown'
		| 'obsolescence'
		| 'freshness'
		| 'live-stockout'
		| 'live-reorder'
		| 'neutral';

	function getPressureKind(
		productId: ProductId,
		product: StoreProduct,
		report: DailyProductReport | null
	): PressureKind {
		if (report) {
			if (report.stockoutLostDemand > 0) return 'stockout';
			if (report.wasteUnits > 0) return 'waste';
			if (report.shrinkUnits > 0) return 'shrink';
			if (report.markdownAmount > 0) return 'markdown';
			if (report.obsolescenceMultiplier < 1) return 'obsolescence';
			const freshnessPercent = getFreshnessPercent(productId, report);
			if (freshnessPercent !== null && freshnessPercent < 100) return 'freshness';
		}

		switch (getStoreProductStatus(product)) {
			case 'Out of stock':
				return 'live-stockout';
			case 'Needs import':
				return 'live-reorder';
			default:
				return 'neutral';
		}
	}

	function pressureLabel(
		productId: ProductId,
		report: DailyProductReport | null,
		kind: PressureKind
	): string {
		switch (kind) {
			case 'stockout':
				return i18n.t('storeStockTable.pressure.stockout', {
					units: i18n.format.integer(report ? report.stockoutLostDemand : 0)
				});
			case 'waste':
				return i18n.t('storeStockTable.pressure.waste', {
					units: i18n.format.integer(report ? report.wasteUnits : 0)
				});
			case 'shrink':
				return i18n.t('storeStockTable.pressure.shrink', {
					units: i18n.format.integer(report ? report.shrinkUnits : 0)
				});
			case 'markdown':
				return i18n.t('storeStockTable.pressure.markdown', {
					amount: i18n.format.currency(report ? report.markdownAmount : 0)
				});
			case 'obsolescence':
				return i18n.t('storeStockTable.pressure.obsolescence', {
					percent: i18n.format.percent(report ? report.obsolescenceMultiplier : 1)
				});
			case 'freshness':
				return i18n.t('storeStockTable.pressure.freshness', {
					percent: i18n.format.integer(getFreshnessPercent(productId, report) ?? 100)
				});
			case 'live-stockout':
				return i18n.t('storeStockTable.pressure.liveStockout');
			case 'live-reorder':
				return i18n.t('storeStockTable.pressure.liveReorder');
			case 'neutral':
				return i18n.t('storeStockTable.pressure.neutral');
		}
	}

	function updateNumber(
		productId: ProductId,
		field: 'sellingPrice' | 'reorderThreshold' | 'targetStock',
		event: Event
	): void {
		const allowed =
			allowedProductSet.has(productId) &&
			(field === 'sellingPrice' ? canUpdateSellingPrice : canUpdateInventoryTargets);
		if (!allowed) return;
		const input = event.currentTarget as HTMLInputElement;
		const value = input.valueAsNumber;

		if (!Number.isFinite(value)) {
			return;
		}

		if (field === 'sellingPrice') {
			void onUpdate(store.id, productId, { sellingPrice: value });
			return;
		}
		void commitInventoryTargets(productId, field, value);
	}

	type InventoryStatusKind = 'saved' | 'unchanged' | 'not-saved';
	let inventoryStatus = $state<{
		productId: ProductId;
		kind: InventoryStatusKind;
		text: string;
	} | null>(null);

	/**
	 * Inventory-target edits await the route commit result and acknowledge it
	 * truthfully: success quotes the stored (normalized) values and the next
	 * check day; a no-change result stays neutral; everything else — including
	 * a missing result — reports that settings were not saved. Shelf stock is
	 * never claimed to have moved.
	 */
	async function commitInventoryTargets(
		productId: ProductId,
		field: 'reorderThreshold' | 'targetStock',
		value: number
	): Promise<void> {
		const patch: StoreProductPatch =
			field === 'reorderThreshold' ? { reorderThreshold: value } : { targetStock: value };
		const result = await onUpdate(store.id, productId, patch);
		// Let the parent's committed state settle into props before reading it.
		await tick();

		const product = store.products.find((candidate) => candidate.productId === productId);
		const view = recoveryViews.get(productId);
		// Quoted values come from the committed (normalized) store props, never
		// from the user's unnormalized input; the next check comes from the
		// updated recovery read model.
		const reorder = i18n.format.integer(product?.reorderThreshold ?? 0);
		const target = i18n.format.integer(product?.targetStock ?? 0);

		const committed =
			result?.status === 'committed' || (result?.status === 'sandbox-committed' && result.changed);
		const unchanged =
			result?.status === 'unchanged' || (result?.status === 'sandbox-committed' && !result.changed);

		if (committed) {
			inventoryStatus = {
				productId,
				kind: 'saved',
				text:
					i18n.t('storeStockTable.settingsStatus.saved', { reorder, target }) +
					(view
						? ' ' +
							i18n.t('storeStockTable.settingsStatus.savedNextCheck', {
								day: i18n.format.integer(view.nextCheckDay)
							})
						: '')
			};
		} else if (unchanged) {
			inventoryStatus = {
				productId,
				kind: 'unchanged',
				text: i18n.t('storeStockTable.settingsStatus.unchanged', { reorder, target })
			};
		} else {
			inventoryStatus = {
				productId,
				kind: 'not-saved',
				text: i18n.t('storeStockTable.settingsStatus.notSaved')
			};
		}
	}

	function supplyModeText(view: StockRecoveryView): string {
		if (view.supplyMode === 'unassigned-import-fallback') {
			return i18n.t('storeStockTable.recovery.supplyUnassigned');
		}
		const cityName = i18n.labels.worldCity(view.supplyContext.configuredSupplyCityId ?? '').name;
		return view.supplyMode === 'assigned-city-with-import-fallback'
			? i18n.t('storeStockTable.recovery.supplyAssigned', { cityName })
			: i18n.t('storeStockTable.recovery.supplyUnavailable', { cityName });
	}

	function updateBrand(productId: ProductId, event: Event): void {
		if (!canUpdateBrand || !allowedProductSet.has(productId)) return;
		const brandId = (event.currentTarget as HTMLSelectElement).value as BrandId;
		if (!getSupportedBrands(productId).some((brand) => brand.id === brandId)) return;
		onUpdateBrand(store.id, productId, brandId);
	}

	function stockRowId(productId: ProductId): string {
		return `${store.id}-stock-row-${productId}`;
	}

	// Deep-link focus from a stock alert: focus each new (store, product)
	// request exactly once, after the mounting dialog's focus trap has placed
	// its synchronous initial focus (hence the tick wait). `appliedFocusKey`
	// is plain bookkeeping, not reactive state — it exists only to keep the
	// effect from re-focusing on unrelated rerenders.
	let appliedFocusKey: string | null = null;

	$effect(() => {
		const productId = focusedProductId;
		if (!productId) return;
		const key = `${store.id}:${productId}`;
		if (appliedFocusKey === key) return;
		appliedFocusKey = key;
		void tick().then(() => {
			const row = document.getElementById(stockRowId(productId));
			if (!row) return;
			row.focus();
			row.scrollIntoView({ block: 'nearest' });
		});
	});
</script>

<section class="stock-table" aria-labelledby={`${store.id}-stock-heading`}>
	<h3 id={`${store.id}-stock-heading`}>
		{i18n.t('storeStockTable.title', { storeName: storeDisplayName(store, ordinal, i18n) })}
	</h3>
	{#if disabledReason && (!canUpdateSellingPrice || !canUpdateInventoryTargets || !canUpdateBrand || hasDisallowedProduct)}
		<p class="disabled-copy" role="status">{disabledReason}</p>
	{/if}

	<div class="table-scroll">
		<table
			aria-label={i18n.t('storeStockTable.title', {
				storeName: storeDisplayName(store, ordinal, i18n)
			})}
		>
			<thead>
				<tr>
					<th scope="col">{i18n.t('storeStockTable.headings.product')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.brand')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.stock')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.importCost')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.configuredPrice')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.reorder')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.target')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.status')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.latest')}</th>
				</tr>
			</thead>
			<tbody>
				{#each store.products as product (product.productId)}
					{@const productName = getProductName(product.productId)}
					{@const productArt = getProductArt(product.productId)}
					{@const supportedBrands = getSupportedBrands(product.productId)}
					{@const report = getProductReport(product.productId)}
					{@const freshnessPercent = getFreshnessPercent(product.productId, report)}
					{@const pressureKind = getPressureKind(product.productId, product, report)}
					{@const recoveryView = recoveryViews.get(product.productId)}
					<tr
						id={stockRowId(product.productId)}
						tabindex="-1"
						data-testid={`store-product-row-${product.productId}`}
					>
						<td>
							<div class="product-cell">
								<span class="product-thumb">
									<img
										src={asset(productArt.path)}
										alt=""
										data-testid={`product-art-${product.productId}`}
										width="96"
										height="96"
										loading="lazy"
										decoding="async"
									/>
								</span>
								<span>{productName}</span>
							</div>
						</td>
						<td>
							<select
								value={product.brandId}
								disabled={!canUpdateBrand || !allowedProductSet.has(product.productId)}
								aria-label={i18n.t('storeStockTable.inputLabels.brand', {
									categoryName: productName
								})}
								onchange={(event) => updateBrand(product.productId, event)}
							>
								{#each supportedBrands as brand (brand.id)}
									<option value={brand.id}>{brand.name}</option>
								{/each}
							</select>
						</td>
						<td data-testid={`derived-stock-${product.productId}`}>
							{i18n.format.integer(getStoreProductStock(product))}
						</td>
						<td>{i18n.format.currency(getImportCost(product.productId))}</td>
						<td>
							<input
								type="number"
								min="1"
								step="1"
								value={product.sellingPrice}
								disabled={!canUpdateSellingPrice || !allowedProductSet.has(product.productId)}
								aria-label={i18n.t('storeStockTable.inputLabels.sellingPrice', {
									categoryName: productName
								})}
								onchange={(event) => updateNumber(product.productId, 'sellingPrice', event)}
							/>
						</td>
						<td>
							<input
								type="number"
								min="0"
								step="1"
								value={product.reorderThreshold}
								disabled={!canUpdateInventoryTargets || !allowedProductSet.has(product.productId)}
								aria-label={i18n.t('storeStockTable.inputLabels.reorderThreshold', {
									categoryName: productName
								})}
								onchange={(event) => updateNumber(product.productId, 'reorderThreshold', event)}
							/>
						</td>
						<td>
							<input
								type="number"
								min="0"
								step="1"
								value={product.targetStock}
								disabled={!canUpdateInventoryTargets || !allowedProductSet.has(product.productId)}
								aria-label={i18n.t('storeStockTable.inputLabels.targetStock', {
									categoryName: productName
								})}
								onchange={(event) => updateNumber(product.productId, 'targetStock', event)}
							/>
						</td>
						<td>
							<span
								class="pressure-badge"
								class:neutral={pressureKind === 'neutral'}
								data-pressure-kind={pressureKind}
								data-testid={`product-pressure-${product.productId}`}
							>
								{pressureLabel(product.productId, report, pressureKind)}
							</span>
							<div class="stock-status">
								{localizeStockStatus(getStoreProductStatus(product), i18n)}
							</div>
							{#if inventoryStatus?.productId === product.productId}
								<p
									class="inventory-status"
									class:unsaved={inventoryStatus.kind === 'not-saved'}
									role="status"
									data-testid={`inventory-status-${product.productId}`}
								>
									{inventoryStatus.text}
								</p>
							{/if}
						</td>
						<td>
							{#if report}
								{i18n.t('storeStockTable.latestReport', {
									sold: i18n.format.integer(report.unitsSold),
									missed: i18n.format.integer(report.demandMissed)
								})}
								<div class="report-evidence">
									<span data-testid={`shelf-price-${product.productId}`}>
										{i18n.t('storeStockTable.evidence.shelfPrice', {
											price: i18n.format.currency(report.baseSellingPrice)
										})}
									</span>
									<span data-testid={`effective-price-${product.productId}`}>
										{i18n.t('storeStockTable.evidence.effectivePrice', {
											price: i18n.format.currency(report.effectiveSellingPrice)
										})}
									</span>
									<span data-testid={`gross-margin-${product.productId}`}>
										{i18n.t('storeStockTable.evidence.grossMargin', {
											amount: i18n.format.currency(report.grossMargin)
										})}
									</span>
									{#if freshnessPercent !== null}
										<span data-testid={`freshness-${product.productId}`}>
											{i18n.t('storeStockTable.evidence.freshness', {
												percent: i18n.format.integer(freshnessPercent)
											})}
										</span>
									{/if}
									{#if report.stockoutLostDemand > 0}
										<span data-testid={`stockout-loss-${product.productId}`}>
											{i18n.t('storeStockTable.evidence.stockout', {
												units: i18n.format.integer(report.stockoutLostDemand)
											})}
										</span>
									{/if}
									{#if report.wasteUnits > 0}
										<span>
											{i18n.t('storeStockTable.evidence.waste', {
												units: i18n.format.integer(report.wasteUnits)
											})}
										</span>
									{/if}
									{#if report.shrinkUnits > 0}
										<span>
											{i18n.t('storeStockTable.evidence.shrink', {
												units: i18n.format.integer(report.shrinkUnits)
											})}
										</span>
									{/if}
									{#if report.obsolescenceMultiplier < 1}
										<span>
											{i18n.t('storeStockTable.evidence.obsolescence', {
												percent: i18n.format.percent(report.obsolescenceMultiplier)
											})}
										</span>
									{/if}
									{#if report.markdownAmount > 0}
										<span>
											{i18n.t('storeStockTable.evidence.markdown', {
												amount: i18n.format.currency(report.markdownAmount)
											})}
										</span>
									{/if}
								</div>
							{:else}
								{i18n.t('storeStockTable.noReport')}
							{/if}
						</td>
					</tr>
					{#if recoveryView && recoveryView.eligibility !== 'not-replenishable-product' && (getStoreProductStatus(product) !== 'Healthy' || product.productId === focusedProductId)}
						<tr class="recovery-row" data-testid={`store-recovery-${product.productId}`}>
							<td colspan={9}>
								<div class="recovery-detail">
									<p>{supplyModeText(recoveryView)}</p>
									<p>
										{i18n.t('storeStockTable.recovery.nextCheck', {
											day: i18n.format.integer(recoveryView.nextCheckDay)
										})}
									</p>
									<p data-testid={`recovery-eligibility-${product.productId}`}>
										{tScoped(
											i18n,
											'storeStockTable.recovery.eligibility',
											recoveryView.eligibility
										)}
									</p>
									{#if recoveryView.lastReceipt}
										<p data-testid={`receipt-evidence-${product.productId}`}>
											{i18n.t('storeStockTable.recovery.receipt', {
												day: i18n.format.integer(recoveryView.lastReceipt.day),
												warehouse: i18n.format.integer(recoveryView.lastReceipt.warehouseUnits),
												imported: i18n.format.integer(recoveryView.lastReceipt.importedUnits),
												outcome: tScoped(
													i18n,
													'storeStockTable.recovery.receiptOutcomes',
													recoveryView.lastReceipt.outcome
												)
											})}
										</p>
									{/if}
									<div
										class="recovery-actions"
										data-testid={`store-recovery-actions-${product.productId}`}
									>
										<button type="button" onclick={() => onManageSupplySource(store.cityId)}>
											{i18n.t('storeStockTable.actions.manageSupplySource')}
										</button>
										<button
											type="button"
											disabled={!plannerProductIds.includes(product.productId)}
											onclick={() => onPlanSupply(product.productId)}
										>
											{i18n.t('storeStockTable.actions.planSupply')}
										</button>
									</div>
								</div>
							</td>
						</tr>
					{/if}
				{/each}
			</tbody>
		</table>
	</div>
</section>

<style>
	.stock-table {
		display: grid;
		gap: 0.55rem;
		min-width: 0;
	}

	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 0.94rem;
		font-weight: 400;
	}

	.table-scroll {
		overflow-x: auto;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
	}

	table {
		width: 100%;
		min-width: 46rem;
		border-collapse: collapse;
		font-size: 0.76rem;
	}

	th,
	td {
		padding: 0.4rem 0.45rem;
		border-bottom: 1px solid var(--paper-edge);
		text-align: left;
		vertical-align: middle;
		white-space: nowrap;
	}

	th {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	tbody tr:last-child td {
		border-bottom: 0;
	}

	.product-cell {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-width: 8rem;
	}

	.product-thumb {
		display: grid;
		place-items: center;
		width: 2.5rem;
		height: 2.5rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
	}

	.product-thumb img {
		display: block;
		width: 2.1rem;
		height: 2.1rem;
		object-fit: contain;
	}

	input,
	select {
		width: 4.5rem;
		min-height: 2rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		padding: 0.25rem 0.35rem;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
	}

	select {
		width: 8.5rem;
		font-family: var(--font-body);
	}

	input:focus,
	select:focus {
		border-color: var(--brass-500);
		outline: none;
	}

	.pressure-badge {
		display: inline-block;
		border: 1px solid color-mix(in srgb, var(--wax-red) 55%, var(--paper-edge));
		border-radius: 999px;
		padding: 0.18rem 0.4rem;
		color: var(--wax-red);
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		white-space: normal;
	}

	.pressure-badge.neutral {
		border-color: var(--paper-edge);
		color: var(--ink-500);
	}

	.stock-status,
	.report-evidence {
		margin-top: 0.25rem;
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.72rem;
		white-space: normal;
	}

	.inventory-status {
		margin: 0.3rem 0 0;
		color: var(--ink-700);
		font-family: var(--font-body);
		font-size: 0.72rem;
		white-space: normal;
	}

	.inventory-status.unsaved {
		color: var(--wax-red);
	}

	.recovery-row td {
		white-space: normal;
	}

	.recovery-detail {
		display: grid;
		gap: 0.2rem;
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.72rem;
	}

	.recovery-detail p {
		margin: 0;
	}

	.recovery-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		margin-top: 0.25rem;
	}

	.recovery-actions button {
		padding: 0.25rem 0.55rem;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		cursor: pointer;
	}

	.recovery-actions button:disabled {
		cursor: default;
		opacity: 0.55;
	}

	.report-evidence {
		display: grid;
		gap: 0.15rem;
	}
</style>
