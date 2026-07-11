<script lang="ts">
	import type { LocalizedProductChainNode } from '$lib/i18n/localizedTypes';
	import type { I18nBundle } from '$lib/i18n';

	interface Props {
		i18n: I18nBundle;
		node: LocalizedProductChainNode | null;
	}

	let { i18n, node }: Props = $props();

	const headingId = $props.id();

	const metrics = $derived.by(() => {
		if (!node) return [];
		return [
			{
				label: i18n.t('atlas.nodeBroadside.metrics.buildings'),
				value: i18n.format.integer(node.capacity.buildingCount)
			},
			{
				label: i18n.t('atlas.nodeBroadside.metrics.capacity'),
				value: i18n.t('atlas.nodeBroadside.metrics.capacityValue', {
					output: i18n.format.decimal(node.capacity.outputPerDay),
					input: i18n.format.decimal(node.capacity.inputPerDay)
				})
			},
			{
				label: i18n.t('atlas.nodeBroadside.metrics.produced'),
				value: i18n.format.integer(node.actual.produced)
			},
			{
				label: i18n.t('atlas.nodeBroadside.metrics.consumed'),
				value: i18n.format.integer(node.actual.consumed)
			},
			{
				label: i18n.t('atlas.nodeBroadside.metrics.imported'),
				value: i18n.format.integer(node.actual.importedInput + node.actual.shopImported)
			},
			{
				label: i18n.t('atlas.nodeBroadside.metrics.sold'),
				value: i18n.format.integer(node.actual.unitsSold)
			},
			{
				label: i18n.t('atlas.nodeBroadside.metrics.missed'),
				value: i18n.format.integer(node.actual.demandMissed)
			},
			{
				label: i18n.t('atlas.nodeBroadside.metrics.stock'),
				value: i18n.format.integer(node.warehouseStock)
			}
		];
	});
</script>

<section class="broadside" aria-labelledby={headingId}>
	{#if node}
		<span class="sub">{i18n.t('atlas.nodeBroadside.inspected')}</span>
		<h3 id={headingId}>{node.label}</h3>
		<span class={['status', `status-${node.health}`]}>{node.healthLabel}</span>
		{#if node.bottleneck}
			<p class="verdict">{node.bottleneck}</p>
		{/if}
		{#if node.sharedBranchCount}
			<p class="shared-note">
				{i18n.t('atlas.nodeBroadside.sharedProducer', {
					count: i18n.format.integer(node.sharedBranchCount)
				})}
			</p>
		{/if}
		<dl>
			{#each metrics as metric (metric.label)}
				<div>
					<dt>{metric.label}</dt>
					<dd>{metric.value}</dd>
				</div>
			{/each}
		</dl>
	{:else}
		<h3 id={headingId}>{i18n.t('atlas.nodeBroadside.emptyTitle')}</h3>
		<p>{i18n.t('atlas.nodeBroadside.empty')}</p>
	{/if}
</section>

<style>
	.broadside {
		display: grid;
		gap: 0.65rem;
		min-width: 0;
		padding: 14px 14px 12px;
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--paper-50) 96%, var(--brass-100)) 0%,
			var(--paper-50) 100%
		);
		border: 1px solid var(--brass-700);
		box-shadow:
			inset 0 0 0 3px var(--paper-50),
			inset 0 0 0 4px var(--brass-700),
			0 12px 20px rgba(20, 12, 4, 0.25);
		color: var(--ink-700);
	}

	.sub {
		font-family: var(--font-ui);
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 17px;
		font-weight: 400;
		color: var(--ink-700);
		overflow-wrap: anywhere;
	}

	.status {
		width: fit-content;
		padding: 2px 6px;
		font-family: var(--font-ui);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: var(--paper-50);
		background: var(--moss);
		border-radius: 1px;
	}

	.status-watch,
	.status-no-report {
		background: var(--brass-700);
	}

	.status-shortage,
	.status-no-local-capacity {
		background: var(--wax-red);
	}

	.verdict {
		margin: 0;
		padding: 6px 8px;
		border-left: 3px solid var(--wax-red);
		background: color-mix(in srgb, var(--wax-red) 6%, var(--paper-50));
		font-family: var(--font-body);
		font-size: 12.5px;
		color: var(--ink-700);
		line-height: 1.45;
	}

	.shared-note {
		margin: 0;
		font-family: var(--font-body);
		font-size: 11.5px;
		font-style: italic;
		color: var(--ink-500);
	}

	dl {
		margin: 0;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px 12px;
	}

	dl > div {
		border-top: 1px solid var(--paper-edge);
		padding-top: 3px;
	}

	dt {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	dd {
		margin: 1px 0 0;
		font-family: var(--font-mono);
		font-size: 12px;
		font-variant-numeric: tabular-nums;
		color: var(--ink-700);
	}
</style>
