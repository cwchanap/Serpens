<script lang="ts">
	import { summarizeStoreStaffing } from '$lib/game/staffing';
	import type { DailyProductReport, DailyStoreReport, StaffMember, Store } from '$lib/game/types';

	let {
		stores,
		staff,
		latestReports
	}: {
		stores: Store[];
		staff: StaffMember[];
		latestReports: DailyStoreReport[];
	} = $props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	function getProductSourceReports(report: DailyStoreReport | undefined): DailyProductReport[] {
		return (
			report?.productReports.filter(
				(product) => product.warehouseUnits > 0 || product.importedUnits > 0
			) ?? []
		);
	}
</script>

<section class="panel paper" aria-labelledby="stores-heading">
	<h2 id="stores-heading">Stores</h2>

	<div class="stores">
		{#each stores as store (store.id)}
			{@const report = latestReports.find((item) => item.storeId === store.id)}
			{@const staffing = summarizeStoreStaffing({ staff }, store)}
			{@const productSourceReports = getProductSourceReports(report)}
			<article class="store">
				<header>
					<div>
						<h3>{store.name}</h3>
						<p>{store.location}</p>
					</div>
					<span>Day {store.daysOpen}</span>
				</header>

				<dl>
					<div>
						<dt>Revenue</dt>
						<dd>{currency.format(report?.revenue ?? 0)}</dd>
					</div>
					<div>
						<dt>Gross margin</dt>
						<dd>{currency.format(report?.grossMargin ?? 0)}</dd>
					</div>
					<div>
						<dt>Stock</dt>
						<dd>{report?.stockHealth ?? store.stockHealth}</dd>
					</div>
					<div>
						<dt>Imports</dt>
						<dd>{currency.format(report?.importSpend ?? 0)}</dd>
					</div>
					<div>
						<dt>Staff</dt>
						<dd>{Math.round(staffing.coverage)}%</dd>
					</div>
					<div>
						<dt>Coverage</dt>
						<dd>
							{staffing.assigned.manager}/{staffing.requirement.manager} mgr,
							{staffing.assigned.general}/{staffing.requirement.general} gen
						</dd>
					</div>
				</dl>

				{#if productSourceReports.length > 0}
					<ul class="product-sources" aria-label={`${store.name} product source split`}>
						{#each productSourceReports as product (product.categoryId)}
							<li>
								<span>{product.name}</span>
								<small>{product.warehouseUnits} warehouse</small>
								<small>{product.importedUnits} imported</small>
							</li>
						{/each}
					</ul>
				{/if}

				{#if report?.warnings.length}
					<ul aria-label={`${store.name} warnings`}>
						{#each report.warnings as warning (warning)}
							<li>{warning}</li>
						{/each}
					</ul>
				{:else}
					<p class="quiet">No current warnings.</p>
				{/if}
			</article>
		{/each}
	</div>
</section>

<style>
	.panel {
		padding: 1.1rem 1.2rem;
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	h2 {
		margin-bottom: 0.75rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.stores {
		display: grid;
		gap: 0.8rem;
	}

	.store {
		display: grid;
		gap: 0.75rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.9rem;
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	h3 {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	p,
	dt,
	header span {
		color: var(--brass-700);
		font-family: var(--font-ui);
	}

	p {
		font-family: var(--font-body);
		font-size: 0.92rem;
		color: var(--ink-500);
	}

	header span,
	dt {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 0.7rem;
		margin: 0;
	}

	dl div {
		min-width: 0;
	}

	dd {
		margin: 0.2rem 0 0;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-weight: 700;
		color: var(--ink-700);
		overflow-wrap: anywhere;
	}

	ul {
		margin: 0;
		padding-left: 1rem;
		color: var(--wax-red);
		font-family: var(--font-body);
		font-size: 0.9rem;
	}

	.product-sources {
		display: grid;
		gap: 0.35rem;
		padding-left: 0;
		color: var(--ink-700);
		list-style: none;
	}

	.product-sources li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.65rem;
		align-items: baseline;
	}

	.product-sources span {
		font-family: var(--font-body);
		font-weight: 700;
		color: var(--ink-700);
	}

	.product-sources small {
		color: var(--ink-500);
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}

	.quiet {
		font-family: var(--font-body);
		font-size: 0.88rem;
		color: var(--ink-500);
	}

	@media (max-width: 640px) {
		dl {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
