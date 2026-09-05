<script lang="ts">
	import { INDUSTRY_MATERIAL_ART, chainNodeArt } from '$lib/assets/gameArt';
	import { PRODUCTION_RECIPES } from '$lib/game/industry';
	import type { LocalizedProductChainNode } from '$lib/i18n/localizedTypes';
	import type { I18nBundle } from '$lib/i18n';
	import type { MaterialId } from '$lib/game/types';

	interface Props {
		i18n: I18nBundle;
		node: LocalizedProductChainNode | null;
	}

	let { i18n, node }: Props = $props();

	const headingId = $props.id();

	const art = $derived(node ? chainNodeArt(node) : null);
	const recipe = $derived(node?.recipeId ? (PRODUCTION_RECIPES[node.recipeId] ?? null) : null);
	const throughput = $derived(
		node ? (node.kind === 'recipe' ? node.capacity.outputPerDay : node.actual.produced) : 0
	);
	const shortfall = $derived(node?.actual.demandMissed ?? 0);

	function materialArt(materialId: MaterialId): string {
		return INDUSTRY_MATERIAL_ART[materialId];
	}

	function materialName(materialId: MaterialId): string {
		return i18n.labels.material(materialId);
	}

	function perDay(value: number): string {
		return i18n.t('atlas.nodeBroadside.metrics.perDay', { value: i18n.format.decimal(value) });
	}
</script>

<section class="broadside" aria-labelledby={headingId}>
	{#if node}
		<span class="sub">{i18n.t('atlas.nodeBroadside.inspected')}</span>
		<div class="node-head">
			{#if art?.src}
				<img src={art.src} alt={art.alt} class="art" />
			{:else}
				<span class="glyph" aria-hidden="true">{node.label.charAt(0)}</span>
			{/if}
			<h3 id={headingId}>{node.label}</h3>
		</div>
		{#if recipe || node.materialId}
			<div class="recipe-strip" aria-label={i18n.t('atlas.nodeBroadside.recipe')}>
				{#if recipe}
					{#each recipe.inputs as input (input.materialId)}
						<span class="chip">
							<img src={materialArt(input.materialId)} alt={materialName(input.materialId)} />
							{input.quantity}
						</span>
					{/each}
					<span class="arrow" aria-hidden="true">→</span>
					{#each recipe.outputs as output (output.materialId)}
						<span class="chip">
							<img src={materialArt(output.materialId)} alt={materialName(output.materialId)} />
							{output.quantity}
						</span>
					{/each}
				{:else if node.materialId}
					<span class="chip">
						<img src={materialArt(node.materialId)} alt={materialName(node.materialId)} />
						{i18n.format.decimal(node.warehouseStock)}
					</span>
				{/if}
			</div>
		{/if}
		<div class="metrics">
			<div class="metric">
				<span class="metric-label">{i18n.t('atlas.nodeBroadside.metrics.throughput')}</span>
				<span class="metric-value">{perDay(throughput)}</span>
			</div>
			<div class={['metric', shortfall > 0 && 'is-wax']}>
				<span class="metric-label">
					{shortfall > 0
						? i18n.t('atlas.nodeBroadside.metrics.shortfall')
						: i18n.t('atlas.nodeBroadside.metrics.health')}
				</span>
				<span class="metric-value">
					{shortfall > 0 ? perDay(shortfall) : node.healthLabel}
				</span>
			</div>
		</div>
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
		align-content: start;
		padding: 14px 14px 12px;
		background: linear-gradient(
			180deg,
			color-mix(in srgb, var(--paper-50) 96%, var(--brass-100)) 0%,
			var(--paper-50) 100%
		);
		border: 1px solid var(--brass-700);
		box-shadow:
			inset 0 0 0 3px var(--paper-50),
			inset 0 0 0 4px var(--brass-700);
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

	.node-head {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		min-width: 0;
	}

	.art {
		flex: 0 0 auto;
		width: 48px;
		height: 48px;
		image-rendering: pixelated;
	}

	.glyph {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		font-family: var(--font-display);
		font-size: 24px;
		color: var(--ink-500);
		background: var(--paper-100);
		border: 1px solid var(--paper-edge);
	}

	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 19px;
		font-weight: 400;
		color: var(--ink-700);
		overflow-wrap: anywhere;
	}

	.recipe-strip {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.3rem;
		padding: 0.45rem 0.55rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: color-mix(in srgb, var(--brass-100) 40%, var(--paper-50));
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		padding: 0.1rem 0.35rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		font-family: var(--font-mono);
		font-size: 11px;
		font-variant-numeric: tabular-nums;
		color: var(--ink-700);
	}

	.chip img {
		width: 20px;
		height: 20px;
		image-rendering: pixelated;
	}

	.arrow {
		color: var(--brass-700);
		font-family: var(--font-mono);
	}

	.metrics {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}

	.metric {
		display: grid;
		gap: 2px;
		padding: 0.5rem 0.55rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
	}

	.metric-label {
		font-family: var(--font-ui);
		font-size: 9px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	.metric-value {
		font-family: var(--font-mono);
		font-size: 15px;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--ink-700);
	}

	.metric.is-wax {
		border-color: var(--wax-red);
	}

	.metric.is-wax .metric-label,
	.metric.is-wax .metric-value {
		color: var(--wax-red);
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

	p {
		margin: 0;
	}
</style>
