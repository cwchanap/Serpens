<script lang="ts">
	import type { ProductChainNode } from '$lib/game/productChainGraph';

	interface Props {
		node: ProductChainNode | null;
	}

	interface Metric {
		label: string;
		value: string;
	}

	let { node }: Props = $props();

	const headingId = $props.id();
	const numberFormat = new Intl.NumberFormat('en-US', {
		maximumFractionDigits: 2
	});

	const metrics = $derived.by((): Metric[] => {
		if (!node) {
			return [];
		}

		return [
			{ label: 'Buildings', value: formatNumber(node.capacity.buildingCount) },
			{
				label: 'Capacity',
				value: `${formatNumber(node.capacity.outputPerDay)} out / ${formatNumber(
					node.capacity.inputPerDay
				)} in`
			},
			{ label: 'Produced', value: formatNumber(node.actual.produced) },
			{ label: 'Consumed', value: formatNumber(node.actual.consumed) },
			{
				label: 'Imported',
				value: formatNumber(node.actual.importedInput + node.actual.shopImported)
			},
			{ label: 'Sold', value: formatNumber(node.actual.unitsSold) },
			{ label: 'Missed', value: formatNumber(node.actual.demandMissed) },
			{ label: 'Stock', value: formatNumber(node.warehouseStock) }
		];
	});

	function formatNumber(value: number): string {
		return numberFormat.format(value);
	}
</script>

<section class="node-detail" aria-labelledby={headingId}>
	{#if node}
		<div class="heading">
			<span class={['status', `status-${node.health}`]}>{node.healthLabel}</span>
			<h3 id={headingId}>{node.label}</h3>
		</div>

		<p>{node.bottleneck}</p>

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
	.node-detail {
		display: grid;
		gap: 0.65rem;
		min-width: 0;
		color: var(--ink-700);
	}

	.heading {
		display: grid;
		gap: 0.35rem;
	}

	h3,
	p,
	dl {
		margin: 0;
	}

	h3 {
		overflow-wrap: anywhere;
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	p {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.88rem;
		line-height: 1.45;
	}

	.status,
	dt {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.status {
		width: fit-content;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--brass-700);
		padding: 0.18rem 0.35rem;
	}

	.status-healthy {
		color: var(--moss);
	}

	.status-watch,
	.status-no-report {
		color: var(--brass-700);
	}

	.status-shortage,
	.status-no-local-capacity {
		color: var(--wax-red);
	}

	dl {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	dl div {
		display: grid;
		min-width: 0;
		gap: 0.22rem;
		border-top: 1px solid var(--paper-edge);
		padding-top: 0.45rem;
	}

	dt {
		color: var(--brass-700);
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
		font-family: var(--font-mono);
		font-size: 0.9rem;
		font-variant-numeric: tabular-nums lining-nums;
		color: var(--ink-700);
	}

	@media (max-width: 520px) {
		dl {
			grid-template-columns: 1fr;
		}
	}
</style>
