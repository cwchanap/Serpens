<script lang="ts">
	import type { I18nBundle } from '$lib/i18n';
	import type { ReportSummary } from '$lib/game/reports';
	import { localizeReportWarning } from '$lib/i18n/gameCopy';
	import type { Store } from '$lib/game/types';

	let { i18n, summary, stores }: { i18n: I18nBundle; summary: ReportSummary; stores: Store[] } =
		$props();

	const railShipmentUnits = $derived(
		(summary.latest?.productionReport.railShipments ?? []).reduce(
			(total, shipment) => total + shipment.quantity,
			0
		)
	);
</script>

<section class="panel paper" aria-labelledby="reports-heading">
	<h2 id="reports-heading">{i18n.t('reportsPanel.title')}</h2>

	{#if summary.latest}
		<div class="metrics">
			<div>
				<span>{i18n.t('reportsPanel.metrics.latestDailyResult')}</span>
				<strong>{i18n.format.currency(summary.latest.netIncome)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.revenue')}</span>
				<strong>{i18n.format.currency(summary.latest.revenue)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.cashAfter')}</span>
				<strong>{i18n.format.currency(summary.latest.cashAfter)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.payroll')}</span>
				<strong>{i18n.format.currency(summary.latest.payrollCost)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.imports')}</span>
				<strong>{i18n.format.currency(summary.latest.importSpend)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.productionImports')}</span>
				<strong>{i18n.format.currency(summary.latest.productionReport.importSpend)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.warehouseOverflow')}</span>
				<strong>{i18n.format.currency(summary.latest.productionReport.overflowCost)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.railShipments')}</span>
				<strong>{i18n.format.integer(railShipmentUnits)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.sevenDayNet')}</span>
				<strong>{i18n.format.currency(summary.sevenDay.netIncome)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.thirtyDayNet')}</span>
				<strong>{i18n.format.currency(summary.thirtyDay.netIncome)}</strong>
			</div>
		</div>

		{#if summary.latest.warnings.length}
			<ul class="warnings" aria-label={i18n.t('reportsPanel.dailyWarnings')}>
				{#each summary.latest.warnings as warning, i (`${warning.code}-${i}`)}
					<li>{localizeReportWarning(warning, stores, i18n)}</li>
				{/each}
			</ul>
		{/if}
	{:else}
		<p>{i18n.t('reportsPanel.empty')}</p>
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
