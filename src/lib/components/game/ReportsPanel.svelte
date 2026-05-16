<script lang="ts">
	import type { ReportSummary } from '$lib/game/reports';

	let { summary }: { summary: ReportSummary } = $props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});
</script>

<section class="panel paper" aria-labelledby="reports-heading">
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
			<ul class="warnings" aria-label="Daily warnings">
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
		padding: 1.1rem 1.2rem;
	}

	h2,
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

	.metrics {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 0.85rem;
	}

	.metrics div {
		display: grid;
		min-width: 0;
		gap: 0.3rem;
	}

	span,
	p {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	p {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.92rem;
		font-weight: 400;
		letter-spacing: 0;
		text-transform: none;
	}

	strong {
		overflow-wrap: anywhere;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 1.05rem;
		color: var(--ink-700);
	}

	.warnings {
		margin: 0.9rem 0 0;
		padding-left: 1rem;
		color: var(--wax-red);
		font-family: var(--font-body);
		font-size: 0.92rem;
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
