<script lang="ts">
	import type { ProductChainNode } from '$lib/game/productChainGraph';

	interface Props {
		node: ProductChainNode | null;
	}

	let { node }: Props = $props();

	const headingId = $props.id();
	const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

	const metrics = $derived.by(() => {
		if (!node) return [];
		return [
			{ label: 'Buildings', value: numberFormat.format(node.capacity.buildingCount) },
			{
				label: 'Capacity',
				value: `${numberFormat.format(node.capacity.outputPerDay)} out / ${numberFormat.format(
					node.capacity.inputPerDay
				)} in`
			},
			{ label: 'Produced', value: numberFormat.format(node.actual.produced) },
			{ label: 'Consumed', value: numberFormat.format(node.actual.consumed) },
			{
				label: 'Imported',
				value: numberFormat.format(node.actual.importedInput + node.actual.shopImported)
			},
			{ label: 'Sold', value: numberFormat.format(node.actual.unitsSold) },
			{ label: 'Missed', value: numberFormat.format(node.actual.demandMissed) },
			{ label: 'Stock', value: numberFormat.format(node.warehouseStock) }
		];
	});
</script>

<section class="broadside" aria-labelledby={headingId}>
	{#if node}
		<span class="sub">Inspected node</span>
		<h3 id={headingId}>{node.label}</h3>
		<span class={['status', `status-${node.health}`]}>{node.healthLabel}</span>
		{#if node.bottleneck}
			<p class="verdict">{node.bottleneck}</p>
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
		<h3 id={headingId}>Chain node</h3>
		<p>Select a graph node to inspect its latest flow metrics.</p>
	{/if}
</section>

<style>
	.broadside {
		display: grid;
		gap: 0.65rem;
		min-width: 0;
		padding: 14px 14px 12px;
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--paper-50) 96%, var(--brass-100)) 0%, var(--paper-50) 100%);
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
