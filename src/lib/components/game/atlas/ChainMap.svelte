<script lang="ts">
	import type { Snippet } from 'svelte';
	import CompassRose from './CompassRose.svelte';
	import LegendCartouche from './LegendCartouche.svelte';

	interface Props {
		width: number;
		height: number;
		compact: boolean;
		children: Snippet;
		broadside?: Snippet;
	}

	let { width, height, compact, children, broadside }: Props = $props();
</script>

<div
	class={['chain-map', compact && 'is-compact']}
	style:--map-width={`${width}px`}
	style:--map-height={`${height}px`}
	data-map-width={width}
	data-map-height={height}
>
	<div class="lat-grid" aria-hidden="true"></div>
	{#if !compact}
		<div class="compass-slot">
			<CompassRose />
		</div>
		<div class="legend-slot">
			<LegendCartouche />
		</div>
		{#if broadside}
			<div class="broadside-slot">
				{@render broadside()}
			</div>
		{/if}
	{/if}
	<div class="canvas">
		{@render children()}
	</div>
</div>

<style>
	.chain-map {
		position: relative;
		width: 100%;
		min-height: var(--map-height);
		border: 1px solid var(--paper-edge);
		background: linear-gradient(
			135deg,
			color-mix(in srgb, var(--paper-50) 96%, var(--brass-100)) 0%,
			var(--paper-50) 70%
		);
		overflow: auto;
	}

	.canvas {
		position: relative;
		width: 100%;
		height: var(--map-height);
		min-width: var(--map-width);
	}

	.lat-grid {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(
				0deg,
				transparent calc(50% - 0.5px),
				color-mix(in srgb, var(--brass-700) 12%, transparent) calc(50% - 0.5px),
				color-mix(in srgb, var(--brass-700) 12%, transparent) calc(50% + 0.5px),
				transparent calc(50% + 0.5px)
			),
			linear-gradient(
				90deg,
				transparent calc(50% - 0.5px),
				color-mix(in srgb, var(--brass-700) 12%, transparent) calc(50% - 0.5px),
				color-mix(in srgb, var(--brass-700) 12%, transparent) calc(50% + 0.5px),
				transparent calc(50% + 0.5px)
			);
		pointer-events: none;
	}

	.compass-slot {
		position: absolute;
		top: 14px;
		right: 14px;
		z-index: 3;
	}

	.legend-slot {
		position: absolute;
		left: 18px;
		bottom: 18px;
		z-index: 3;
	}

	.broadside-slot {
		position: absolute;
		right: 26px;
		top: 88px;
		z-index: 3;
		width: 240px;
	}
</style>
