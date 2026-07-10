<script lang="ts">
	import { asset } from '$app/paths';
	import { getProductArt } from '$lib/assets/gameArt';
	import { getArchetype } from '$lib/game/archetypes';
	import { getStoreProductStatus } from '$lib/game/stock';
	import { localizeStockStatus } from '$lib/i18n/gameCopy';
	import type { I18nBundle } from '$lib/i18n';
	import { storeDisplayName } from '$lib/i18n/gameCopy';
	import type {
		DailyProductReport,
		DailyStoreReport,
		Store,
		StoreProductPatch
	} from '$lib/game/types';

	interface Props {
		i18n: I18nBundle;
		store: Store;
		latestReport: DailyStoreReport | null;
		onUpdate: (storeId: string, categoryId: string, patch: StoreProductPatch) => void;
	}

	let { i18n, store, latestReport, onUpdate }: Props = $props();

	const categories = $derived(getArchetype(store.archetypeId).startingCategories);

	function getCategoryName(categoryId: string): string {
		return i18n.labels.productCategory(categoryId);
	}

	function getImportCost(categoryId: string): number {
		return categories.find((category) => category.id === categoryId)?.importCost ?? 0;
	}

	function getProductReport(categoryId: string): DailyProductReport | null {
		return latestReport?.productReports.find((report) => report.categoryId === categoryId) ?? null;
	}

	function updateNumber(categoryId: string, field: keyof StoreProductPatch, event: Event): void {
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
		{i18n.t('storeStockTable.title', { storeName: storeDisplayName(store, i18n) })}
	</h3>

	<div class="table-scroll">
		<table
			aria-label={i18n.t('storeStockTable.title', { storeName: storeDisplayName(store, i18n) })}
		>
			<thead>
				<tr>
					<th scope="col">{i18n.t('storeStockTable.headings.product')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.stock')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.importCost')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.sellingPrice')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.reorder')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.target')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.status')}</th>
					<th scope="col">{i18n.t('storeStockTable.headings.latest')}</th>
				</tr>
			</thead>
			<tbody>
				{#each store.products as product (product.categoryId)}
					{@const categoryName = getCategoryName(product.categoryId)}
					{@const productArt = getProductArt(product.categoryId)}
					{@const report = getProductReport(product.categoryId)}
					<tr>
						<td>
							<div class="product-cell">
								<span class="product-thumb">
									<img
										src={asset(productArt.path)}
										alt={productArt.alt}
										width="96"
										height="96"
										loading="lazy"
										decoding="async"
									/>
								</span>
								<span>{categoryName}</span>
							</div>
						</td>
						<td>{i18n.format.integer(product.stock)}</td>
						<td>{i18n.format.currency(getImportCost(product.categoryId))}</td>
						<td>
							<input
								type="number"
								min="1"
								step="1"
								value={product.sellingPrice}
								aria-label={i18n.t('storeStockTable.inputLabels.sellingPrice', {
									categoryName
								})}
								onchange={(event) => updateNumber(product.categoryId, 'sellingPrice', event)}
							/>
						</td>
						<td>
							<input
								type="number"
								min="0"
								step="1"
								value={product.reorderThreshold}
								aria-label={i18n.t('storeStockTable.inputLabels.reorderThreshold', {
									categoryName
								})}
								onchange={(event) => updateNumber(product.categoryId, 'reorderThreshold', event)}
							/>
						</td>
						<td>
							<input
								type="number"
								min="0"
								step="1"
								value={product.targetStock}
								aria-label={i18n.t('storeStockTable.inputLabels.targetStock', {
									categoryName
								})}
								onchange={(event) => updateNumber(product.categoryId, 'targetStock', event)}
							/>
						</td>
						<td>{localizeStockStatus(getStoreProductStatus(product), i18n)}</td>
						<td>
							{#if report}
								{i18n.t('storeStockTable.latestReport', {
									sold: i18n.format.integer(report.unitsSold),
									missed: i18n.format.integer(report.demandMissed)
								})}
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
</style>
