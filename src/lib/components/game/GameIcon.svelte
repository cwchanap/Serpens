<script lang="ts">
	import { ICON_PATHS, type GameIconName } from './gameNavigation';

	let { name }: { name: GameIconName } = $props();
</script>

<svg viewBox="0 0 24 24" aria-hidden="true" data-icon={name}>
	{#each ICON_PATHS[name] as d, i (i)}
		<path {d} />
	{/each}
</svg>

<style>
	svg {
		display: block;
		width: 1.25rem;
		height: 1.25rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
</style>
