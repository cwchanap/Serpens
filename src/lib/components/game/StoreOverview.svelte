<script lang="ts">
	import type { DailyStoreReport, Store } from '$lib/game/types';

	let {
		stores,
		latestReports
	}: {
		stores: Store[];
		latestReports: DailyStoreReport[];
	} = $props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});
</script>

<section class="panel" aria-labelledby="stores-heading">
	<h2 id="stores-heading">Stores</h2>

	<div class="stores">
		{#each stores as store (store.id)}
			{@const report = latestReports.find((item) => item.storeId === store.id)}
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
						<dt>Staff</dt>
						<dd>{report?.staffMorale ?? store.staffMorale}</dd>
					</div>
				</dl>

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
		border: 1px solid #253244;
		border-radius: 8px;
		background: #111823;
		padding: 1rem;
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	h2 {
		margin-bottom: 0.75rem;
		font-size: 0.95rem;
	}

	.stores {
		display: grid;
		gap: 0.75rem;
	}

	.store {
		display: grid;
		gap: 0.75rem;
		border: 1px solid #26374d;
		border-radius: 8px;
		background: #151f2d;
		padding: 0.85rem;
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	h3 {
		font-size: 0.98rem;
	}

	p,
	dt,
	header span {
		color: #a7b4c8;
	}

	header span,
	dt {
		font-size: 0.76rem;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.6rem;
		margin: 0;
	}

	dd {
		margin: 0.2rem 0 0;
		font-weight: 700;
	}

	ul {
		margin: 0;
		padding-left: 1rem;
		color: #f4c56f;
		font-size: 0.86rem;
	}

	.quiet {
		font-size: 0.84rem;
	}

	@media (max-width: 640px) {
		dl {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
