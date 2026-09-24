<script lang="ts">
	import type { DailyCashContributorKind, DailyResultView } from '$lib/game/reports';
	import type { I18nBundle, TranslationKey } from '$lib/i18n';

	interface Props {
		view: DailyResultView | null;
		currentCash: number | null;
		i18n: I18nBundle;
		onOpenReports?: () => void;
		onOpenFinance?: () => void;
	}

	let { view, currentCash, i18n, onOpenReports, onOpenFinance }: Props = $props();

	const CONTRIBUTOR_LABEL_KEYS: Record<DailyCashContributorKind, TranslationKey> = {
		'import-spend': 'reportsPanel.metrics.imports',
		'principal-repaid': 'reportsPanel.metrics.principalRepaid',
		'interest-paid': 'reportsPanel.metrics.interestPaid',
		'principal-borrowed': 'reportsPanel.metrics.principalBorrowed'
	};

	const headlineMetrics = $derived.by(() => {
		if (view === null) return [];
		const comparison = view.comparison;
		return [
			{
				labelKey: 'reportsPanel.metrics.revenue' as TranslationKey,
				testId: 'daily-result-revenue',
				value: view.latest.revenue,
				delta: comparison?.revenueDelta ?? null
			},
			{
				labelKey: 'reportsPanel.metrics.operatingIncome' as TranslationKey,
				testId: 'daily-result-operating-income',
				value: view.latest.operatingIncome,
				delta: comparison?.operatingIncomeDelta ?? null
			},
			{
				labelKey: 'reportsPanel.metrics.netCashChange' as TranslationKey,
				testId: 'daily-result-net-cash-change',
				value: view.latest.netCashChange,
				delta: comparison?.netCashChangeDelta ?? null
			}
		];
	});
	const previousDay = $derived(view?.comparison?.previousDay ?? null);
</script>

<section class="panel paper" aria-labelledby="daily-result-heading" data-testid="daily-result">
	<h2 id="daily-result-heading">{i18n.t('dailyResult.title')}</h2>

	{#if view === null}
		<p class="empty" data-testid="daily-result-empty">{i18n.t('dailyResult.empty')}</p>
	{:else}
		<h3 data-testid="daily-result-day">
			{i18n.t('dailyResult.dayCompletedResult', { day: i18n.format.integer(view.latest.day) })}
		</h3>

		<div class="metrics">
			{#each headlineMetrics as metric (metric.testId)}
				<div class="metric">
					<span class="metric-label">{i18n.t(metric.labelKey)}</span>
					<span class="metric-value" data-testid={metric.testId}>
						{i18n.format.currency(metric.value)}
						{#if metric.delta !== null && previousDay !== null}
							<span class="metric-delta">
								{i18n.format.signedCurrency(metric.delta)}
								{i18n.t('dailyResult.vsDay', {
									day: i18n.format.integer(previousDay)
								})}
							</span>
						{/if}
					</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if currentCash !== null}
		<div class="current-cash" data-testid="daily-result-current-cash">
			<span class="metric-label">{i18n.t('dailyResult.currentCash')}</span>
			<span class="metric-value">{i18n.format.currency(currentCash)}</span>
		</div>
	{/if}

	{#if view !== null}
		<div class="bridge" data-testid="daily-result-bridge">
			<div class="metric">
				<span class="metric-label">{i18n.t('reportsPanel.metrics.operatingCashFlow')}</span>
				<span class="metric-value">{i18n.format.currency(view.latest.operatingCashFlow)}</span>
			</div>
			<div class="metric">
				<span class="metric-label">{i18n.t('reportsPanel.metrics.financingCashFlow')}</span>
				<span class="metric-value">{i18n.format.currency(view.latest.financingCashFlow)}</span>
			</div>
			<div class="metric">
				<span class="metric-label">{i18n.t('reportsPanel.metrics.netCashChange')}</span>
				<span class="metric-value">{i18n.format.currency(view.latest.netCashChange)}</span>
			</div>
		</div>

		<p class="explanation">
			{#if view.latest.operatingIncome > 0 && view.latest.netCashChange < 0}
				{i18n.t('dailyResult.explanation.operatingProfitCashFall')}
			{:else}
				{i18n.t('dailyResult.explanation.neutral')}
			{/if}
		</p>

		{#if view.contributors.length > 0}
			<div class="contributors">
				<h4>{i18n.t('dailyResult.contributors.title')}</h4>
				<ul>
					{#each view.contributors as contributor (contributor.kind)}
						<li data-testid="daily-result-contributor">
							<span class="metric-label">{i18n.t(CONTRIBUTOR_LABEL_KEYS[contributor.kind])}</span>
							<span class="metric-value">{i18n.format.signedCurrency(contributor.amount)}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/if}

	{#if onOpenReports || onOpenFinance}
		<div class="actions">
			{#if onOpenReports}
				<button type="button" onclick={onOpenReports}>
					{i18n.t('game.managementPanels.reports')}
				</button>
			{/if}
			{#if onOpenFinance}
				<button type="button" onclick={onOpenFinance}>
					{i18n.t('game.managementPanels.finance')}
				</button>
			{/if}
		</div>
	{/if}
</section>

<style>
	.panel {
		display: grid;
		gap: 0.9rem;
		padding: 1.1rem 1.2rem;
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	h3 {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	h4 {
		margin: 0 0 0.4rem;
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	.empty {
		margin: 0;
		color: var(--ink-700);
	}

	.metric {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.metric-label {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.metric-value {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 1.1rem;
		color: var(--ink-700);
	}

	.metric-delta {
		display: block;
		font-size: 0.8rem;
		color: var(--ink-700);
		text-align: right;
	}

	.current-cash {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--brass-700);
	}

	.explanation {
		margin: 0;
		font-size: 0.85rem;
		color: var(--ink-700);
	}

	.contributors ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.35rem;
	}

	.contributors li {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.actions {
		display: flex;
		gap: 0.6rem;
	}
</style>
