<script lang="ts">
	import type { ReportSummary } from '$lib/game/reports';

	let { summary }: { summary: ReportSummary } = $props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});
</script>

<section class="panel" aria-labelledby="reports-heading">
	<h2 id="reports-heading">Reports</h2>

	{#if summary.latest}
		<div class="metrics">
			<div>
				<span>Latest daily result</span>
				<strong>{currency.format(summary.latest.netIncome)}</strong>
			</div>
			<div>
				<span>Revenue</span>
				<strong>{currency.format(summary.latest.revenue)}</strong>
			</div>
			<div>
				<span>Cash after</span>
				<strong>{currency.format(summary.latest.cashAfter)}</strong>
			</div>
			<div>
				<span>Payroll</span>
				<strong>{currency.format(summary.latest.payrollCost)}</strong>
			</div>
			<div>
				<span>Imports</span>
				<strong>{currency.format(summary.latest.importSpend)}</strong>
			</div>
			<div>
				<span>Production imports</span>
				<strong>{currency.format(summary.latest.productionReport.importSpend)}</strong>
			</div>
			<div>
				<span>Warehouse overflow</span>
				<strong>{currency.format(summary.latest.productionReport.overflowCost)}</strong>
			</div>
			<div>
				<span>7-day net</span>
				<strong>{currency.format(summary.sevenDay.netIncome)}</strong>
			</div>
			<div>
				<span>30-day net</span>
				<strong>{currency.format(summary.thirtyDay.netIncome)}</strong>
			</div>
		</div>

		{#if summary.latest.warnings.length}
			<ul aria-label="Daily warnings">
				{#each summary.latest.warnings as warning (warning)}
					<li>{warning}</li>
				{/each}
			</ul>
		{/if}
	{:else}
		<p>No reports yet. Advance the first day to generate results.</p>
	{/if}
</section>

<style>
	.panel {
		border: 1px solid #253244;
		border-radius: 8px;
		background: #111823;
		padding: 1rem;
	}

	h2,
	p {
		margin: 0;
	}

	h2 {
		margin-bottom: 0.75rem;
		font-size: 0.95rem;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
		gap: 0.75rem;
	}

	.metrics div {
		display: grid;
		min-width: 0;
		gap: 0.25rem;
	}

	span,
	p {
		color: #a7b4c8;
	}

	span {
		font-size: 0.78rem;
	}

	strong {
		overflow-wrap: anywhere;
		font-size: 1.05rem;
	}

	ul {
		margin: 0.8rem 0 0;
		padding-left: 1rem;
		color: #f4c56f;
		font-size: 0.86rem;
	}

	@media (max-width: 980px) {
		.metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 520px) {
		.metrics {
			grid-template-columns: 1fr;
		}
	}
</style>
