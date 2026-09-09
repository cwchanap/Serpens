<script lang="ts">
	import { chainNodeArt, getIndustryMaterialArt } from '$lib/assets/gameArt';
	import { PRODUCTION_RECIPES } from '$lib/game/industry';
	import type { LocalizedProductChainNode } from '$lib/i18n/localizedTypes';
	import type { I18nBundle } from '$lib/i18n';

	interface Props {
		i18n: I18nBundle;
		node: LocalizedProductChainNode | null;
	}

	let { i18n, node }: Props = $props();

	const headingId = $props.id();
	const art = $derived(node ? chainNodeArt(node) : null);
	const recipe = $derived(node?.recipeId ? PRODUCTION_RECIPES[node.recipeId] : null);

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
				primary: true,
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
				primary: true,
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
		<div class="node-heading">
			{#if art?.src}<img src={art.src} alt="" />{/if}
			<div>
				<span class="sub">{i18n.t('atlas.nodeBroadside.inspected')}</span>
				<h3 id={headingId}>{node.label}</h3>
			</div>
		</div>
		{#if recipe}
			<div class="recipe">
				{#each recipe.inputs as input (input.materialId)}
					<span title={`${i18n.labels.material(input.materialId)} ×${input.quantity}`}
						><img
							src={getIndustryMaterialArt(input.materialId)}
							alt={i18n.labels.material(input.materialId)}
						/><small>×{input.quantity}</small></span
					>
				{/each}
				<span aria-hidden="true">→</span>
				{#each recipe.outputs as output (output.materialId)}
					<span title={`${i18n.labels.material(output.materialId)} ×${output.quantity}`}
						><img
							src={getIndustryMaterialArt(output.materialId)}
							alt={i18n.labels.material(output.materialId)}
						/><small>×{output.quantity}</small></span
					>
				{/each}
			</div>
		{/if}
		<dl class="primary-metrics">
			{#each metrics.filter((metric) => metric.primary) as metric (metric.label)}
				<div>
					<dt>{metric.label}</dt>
					<dd>{metric.value}</dd>
				</div>
			{/each}
		</dl>
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

		<details>
			<summary
				><span>{i18n.t('atlas.nodeBroadside.moreMetrics')}</span>
				<span class={['status', `status-${node.health}`]}>{node.healthLabel}</span></summary
			>
			<dl>
				{#each metrics.filter((metric) => !metric.primary) as metric (metric.label)}
					<div>
						<dt>{metric.label}</dt>
						<dd>{metric.value}</dd>
					</div>
				{/each}
			</dl>
		</details>
	{:else}
		<h3 id={headingId}>{i18n.t('atlas.nodeBroadside.emptyTitle')}</h3>
		<p>{i18n.t('atlas.nodeBroadside.empty')}</p>
	{/if}
</section>

<style>
	.node-heading {
		display: flex;
		align-items: center;
		gap: 18px;
	}
	.node-heading img {
		width: 48px;
		height: 48px;
		object-fit: contain;
		image-rendering: pixelated;
	}
	.recipe {
		margin-top: 7px;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		padding: 8px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-100);
	}
	.recipe span {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}
	.recipe img {
		width: 32px;
		height: 32px;
		object-fit: contain;
		image-rendering: pixelated;
	}
	.recipe small {
		font: 10px var(--font-mono);
	}
	.broadside {
		display: grid;
		align-content: start;
		gap: 8px;
		min-width: 0;
		padding: 14px 14px 12px;
		background: var(--paper-50);
		border: 1px solid var(--brass-700);
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

	summary {
		cursor: pointer;
		font: 11px var(--font-ui);
		color: var(--ink-500);
	}
	details dl {
		margin-top: 6px;
	}

	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 18px;
		font-weight: 400;
		color: var(--ink-700);
		overflow-wrap: anywhere;
	}

	.status {
		width: fit-content;
		padding: 2px 4px;
		font-family: var(--font-ui);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.04em;
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
		padding: 0;
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
	.primary-metrics {
		gap: 8px;
	}
	.primary-metrics > div {
		padding: 8px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-100);
		text-align: center;
	}
	.primary-metrics dd {
		line-height: 1.2;
		font-size: 18px;
		font-weight: 700;
	}
	.primary-metrics > div:last-child {
		border-color: var(--wax-red);
	}
	.primary-metrics > div:last-child dt,
	.primary-metrics > div:last-child dd {
		color: var(--wax-red);
	}
	.recipe small {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
</style>
