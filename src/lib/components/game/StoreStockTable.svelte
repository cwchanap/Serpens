<script lang="ts">
	import { asset } from '$app/paths';
	import { getProductArt } from '$lib/assets/gameArt';
	import { getArchetype } from '$lib/game/archetypes';
	import { getProductDefinition } from '$lib/game/products';
	import { getStoreProductStatus, getStoreProductStock } from '$lib/game/stock';
	import { localizeStockStatus } from '$lib/i18n/gameCopy';
	import type { I18nBundle } from '$lib/i18n';
	import { storeDisplayName } from '$lib/i18n/gameCopy';
	import type {
		DailyProductReport,
		DailyStoreReport,
		ProductId,
		Store,
		StoreProductPatch
	} from '$lib/game/types';

	interface Props {
		i18n: I18nBundle;
		store: Store;
		ordinal: number;
		latestReport: DailyStoreReport | null;
		onUpdate: (storeId: string, categoryId: string, patch: StoreProductPatch) => void;
		canUpdateSellingPrice?: boolean;
		canUpdateInventoryTargets?: boolean;
		allowedProductIds?: string[];
		disabledReason?: string | null;
	}

	let {
		i18n,
		store,
		ordinal,
		latestReport,
		onUpdate,
		canUpdateSellingPrice = true,
		canUpdateInventoryTargets = true,
		allowedProductIds = store.products.map((product) => product.productId),
		disabledReason = null
	}: Props = $props();
	const allowedProductSet = $derived(new Set(allowedProductIds));
	const hasDisallowedProduct = $derived(
		store.products.some((product) => !allowedProductSet.has(product.productId))
	);

	function getCategoryName(categoryId: string): string {
		return i18n.labels.productCategory(categoryId);
	}

	function getImportCost(categoryId: string): number {
		if (!getArchetype(store.archetypeId).startingProductIds.includes(categoryId as ProductId)) {
			return 0;
		}
		return getProductDefinition(categoryId as ProductId)?.importCost ?? 0;
	}

	function getProductReport(categoryId: string): DailyProductReport | null {
		return latestReport?.productReports.find((report) => report.productId === categoryId) ?? null;
	}

	function getFreshnessPercent(
		productId: string,
		report: DailyProductReport | null
	): number | null {
		const averageAgeDays = report?.averageAgeDays;
		const shelfLifeDays = getProductDefinition(productId as ProductId)?.dynamics.shelfLifeDays;
		if (
			report === null ||
			averageAgeDays === null ||
			averageAgeDays === undefined ||
			!Number.isFinite(averageAgeDays) ||
			shelfLifeDays === undefined ||
			!Number.isFinite(shelfLifeDays) ||
			shelfLifeDays <= 0
		) {
			return null;
		}

		return Math.max(0, Math.min(100, Math.round((1 - averageAgeDays / shelfLifeDays) * 100)));
	}

	type PressureKind =
		| 'stockout'
		| 'waste'
		| 'shrink'
		| 'markdown'
		| 'obsolescence'
		| 'freshness'
		| 'neutral';

	function getPressureKind(productId: string, report: DailyProductReport | null): PressureKind {
		if (!report) return 'neutral';
		if ((report.stockoutLostDemand ?? 0) > 0) return 'stockout';
		if ((report.wasteUnits ?? 0) > 0) return 'waste';
		if ((report.shrinkUnits ?? 0) > 0) return 'shrink';
		if ((report.markdownAmount ?? 0) > 0) return 'markdown';
		if ((report.obsolescenceMultiplier ?? 1) < 1) return 'obsolescence';
		const freshnessPercent = getFreshnessPercent(productId, report);
		if (freshnessPercent !== null && freshnessPercent < 100) return 'freshness';
		return 'neutral';
	}

	function pressureLabel(
		productId: string,
		report: DailyProductReport | null,
		kind: PressureKind
	): string {
		switch (kind) {
			case 'stockout':
				return i18n.t('storeStockTable.pressure.stockout', {
					units: i18n.format.integer(report?.stockoutLostDemand ?? 0)
				});
			case 'waste':
				return i18n.t('storeStockTable.pressure.waste', {
					units: i18n.format.integer(report?.wasteUnits ?? 0)
				});
			case 'shrink':
				return i18n.t('storeStockTable.pressure.shrink', {
					units: i18n.format.integer(report?.shrinkUnits ?? 0)
				});
			case 'markdown':
				return i18n.t('storeStockTable.pressure.markdown', {
					amount: i18n.format.currency(report?.markdownAmount ?? 0)
				});
			case 'obsolescence':
				return i18n.t('storeStockTable.pressure.obsolescence', {
					percent: i18n.format.percent(report?.obsolescenceMultiplier ?? 1)
				});
			case 'freshness':
				return i18n.t('storeStockTable.pressure.freshness', {
					percent: i18n.format.integer(getFreshnessPercent(productId, report) ?? 100)
				});
			case 'neutral':
				return i18n.t('storeStockTable.pressure.neutral');
		}
	}

	function updateNumber(categoryId: string, field: keyof StoreProductPatch, event: Event): void {
		const allowed =
			allowedProductSet.has(categoryId) &&
			(field === 'sellingPrice' ? canUpdateSellingPrice : canUpdateInventoryTargets);
		if (!allowed) return;
		const input = event.currentTarget as HTMLInputElement;
		const value = input.valueAsNumber;

		if (!Number.isFinite(value)) {
			return;
		}

		onUpdate(store.id, categoryId, { [field]: value });
	}
</script>

<section class="stock-table" aria-labelledby={`${store.id}-stock-heading`}>
	<h3 id={`${store.id}-stock-heading`}>
		{i18n.t('storeStockTable.title', { storeName: storeDisplayName(store, ordinal, i18n) })}
	</h3>
	{#if disabledReason && (!canUpdateSellingPrice || !canUpdateInventoryTargets || hasDisallowedProduct)}
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
					{@const categoryName = getCategoryName(product.productId)}
					{@const productArt = getProductArt(product.productId)}
					{@const report = getProductReport(product.productId)}
					{@const freshnessPercent = getFreshnessPercent(product.productId, report)}
					{@const pressureKind = getPressureKind(product.productId, report)}
					<tr>
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
								<span>{categoryName}</span>
							</div>
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
									categoryName
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
									categoryName
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
									categoryName
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
						</td>
						<td>
							{#if report}
								{i18n.t('storeStockTable.latestReport', {
									sold: i18n.format.integer(report.unitsSold),
									missed: i18n.format.integer(report.demandMissed)
								})}
								<div class="report-evidence">
									{#if freshnessPercent !== null}
										<span data-testid={`freshness-${product.productId}`}>
											{i18n.t('storeStockTable.evidence.freshness', {
												percent: i18n.format.integer(freshnessPercent)
											})}
										</span>
									{/if}
									{#if (report.stockoutLostDemand ?? 0) > 0}
										<span data-testid={`stockout-loss-${product.productId}`}>
											{i18n.t('storeStockTable.evidence.stockout', {
												units: i18n.format.integer(report.stockoutLostDemand ?? 0)
											})}
										</span>
									{/if}
									{#if (report.wasteUnits ?? 0) > 0}
										<span>
											{i18n.t('storeStockTable.evidence.waste', {
												units: i18n.format.integer(report.wasteUnits ?? 0)
											})}
										</span>
									{/if}
									{#if (report.shrinkUnits ?? 0) > 0}
										<span>
											{i18n.t('storeStockTable.evidence.shrink', {
												units: i18n.format.integer(report.shrinkUnits ?? 0)
											})}
										</span>
									{/if}
									{#if (report.obsolescenceMultiplier ?? 1) < 1}
										<span>
											{i18n.t('storeStockTable.evidence.obsolescence', {
												percent: i18n.format.percent(report.obsolescenceMultiplier ?? 1)
											})}
										</span>
									{/if}
									{#if (report.markdownAmount ?? 0) > 0}
										<span>
											{i18n.t('storeStockTable.evidence.markdown', {
												amount: i18n.format.currency(report.markdownAmount ?? 0)
											})}
										</span>
									{/if}
								</div>
							{:else}
								{i18n.t('storeStockTable.noReport')}
							{/if}
						</td>
					</tr>
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
		min-width: 42rem;
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

	input {
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

	input:focus {
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

	.report-evidence {
		display: grid;
		gap: 0.15rem;
	}
</style>
