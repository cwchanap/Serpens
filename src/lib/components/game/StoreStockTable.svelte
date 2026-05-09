<script lang="ts">
	import { getArchetype } from '$lib/game/archetypes';
	import { getStoreProductStatus } from '$lib/game/stock';
	import type { DailyProductReport, DailyStoreReport, Store, StoreProductPatch } from '$lib/game/types';

	interface Props {
		store: Store;
		latestReport: DailyStoreReport | null;
		onUpdate: (storeId: string, categoryId: string, patch: StoreProductPatch) => void;
	}

	let { store, latestReport, onUpdate }: Props = $props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	const categories = $derived(getArchetype(store.archetypeId).startingCategories);

	function getCategoryName(categoryId: string): string {
		return categories.find((category) => category.id === categoryId)?.name ?? categoryId;
	}

	function getImportCost(categoryId: string): number {
		return categories.find((category) => category.id === categoryId)?.importCost ?? 0;
	}

	function getProductReport(categoryId: string): DailyProductReport | null {
		return latestReport?.productReports.find((report) => report.categoryId === categoryId) ?? null;
	}

	function updateNumber(
		categoryId: string,
		field: keyof StoreProductPatch,
		event: Event
	): void {
		const input = event.currentTarget as HTMLInputElement;
		const value = input.valueAsNumber;

		if (!Number.isFinite(value)) {
			return;
		}

		onUpdate(store.id, categoryId, { [field]: value });
	}
</script>

<section class="stock-table" aria-labelledby={`${store.id}-stock-heading`}>
	<h3 id={`${store.id}-stock-heading`}>{store.name} stock</h3>

	<div class="table-scroll">
		<table>
			<thead>
				<tr>
					<th scope="col">Product</th>
					<th scope="col">Stock</th>
					<th scope="col">Import cost</th>
					<th scope="col">Selling price</th>
					<th scope="col">Reorder</th>
					<th scope="col">Target</th>
					<th scope="col">Status</th>
					<th scope="col">Latest</th>
				</tr>
			</thead>
			<tbody>
				{#each store.products as product (product.categoryId)}
					{@const categoryName = getCategoryName(product.categoryId)}
					{@const report = getProductReport(product.categoryId)}
					<tr>
						<td>{categoryName}</td>
						<td>{product.stock}</td>
						<td>{currency.format(getImportCost(product.categoryId))}</td>
						<td>
							<input
								type="number"
								min="1"
								step="1"
								value={product.sellingPrice}
								aria-label={`Selling price for ${categoryName}`}
								onchange={(event) => updateNumber(product.categoryId, 'sellingPrice', event)}
							/>
						</td>
						<td>
							<input
								type="number"
								min="0"
								step="1"
								value={product.reorderThreshold}
								aria-label={`Reorder threshold for ${categoryName}`}
								onchange={(event) => updateNumber(product.categoryId, 'reorderThreshold', event)}
							/>
						</td>
						<td>
							<input
								type="number"
								min="0"
								step="1"
								value={product.targetStock}
								aria-label={`Target stock for ${categoryName}`}
								onchange={(event) => updateNumber(product.categoryId, 'targetStock', event)}
							/>
						</td>
						<td>{getStoreProductStatus(product)}</td>
						<td>
							{#if report}
								{report.unitsSold} sold / {report.demandMissed} missed
							{:else}
								No report
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
		font-size: 0.94rem;
	}

	.table-scroll {
		overflow-x: auto;
		border: 1px solid #3f3d36;
		border-radius: 6px;
	}

	table {
		width: 100%;
		min-width: 40rem;
		border-collapse: collapse;
		font-size: 0.76rem;
	}

	th,
	td {
		padding: 0.4rem 0.45rem;
		border-bottom: 1px solid #34322d;
		text-align: left;
		vertical-align: middle;
		white-space: nowrap;
	}

	th {
		color: #b8b3a7;
		font-weight: 700;
	}

	tbody tr:last-child td {
		border-bottom: 0;
	}

	input {
		width: 4.5rem;
		min-height: 2rem;
		border: 1px solid #4a4a45;
		border-radius: 6px;
		background: #24231f;
		color: #f7f2e8;
		padding: 0.25rem 0.35rem;
		font: inherit;
	}

	input:focus {
		border-color: #d59b45;
		outline: none;
	}
</style>
