<script lang="ts">
	import type { ProductChainEdge, ProductChainHealth } from '$lib/game/productChainGraph';

	interface Props {
		edge: ProductChainEdge;
		source: { x: number; y: number };
		target: { x: number; y: number };
	}

	let { edge, source, target }: Props = $props();

	const path = $derived.by(() => {
		const dx = Math.max(40, (target.x - source.x) / 2);
		const c1 = { x: source.x + dx, y: source.y };
		const c2 = { x: target.x - dx, y: target.y };
		return `M ${source.x} ${source.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${target.x} ${target.y}`;
	});

	const mid = $derived({
		x: (source.x + target.x) / 2,
		y: (source.y + target.y) / 2
	});

	const stroke = $derived(healthStroke(edge.health));
	const dashArray = $derived(healthDash(edge.health));
	const ariaLabel = $derived(`${edge.label}, ${edge.health.replace(/-/g, ' ')}`);

	function healthStroke(health: ProductChainHealth): string {
		if (health === 'healthy') return 'var(--moss)';
		if (health === 'shortage' || health === 'no-local-capacity') return 'var(--wax-red)';
		if (health === 'no-report') return 'color-mix(in srgb, var(--brass-700) 50%, var(--paper-edge))';
		return 'var(--brass-700)';
	}

	function healthDash(health: ProductChainHealth): string {
		if (health === 'shortage' || health === 'no-local-capacity') return '8 4';
		return '6 4';
	}
</script>

<g
	class={['chain-route', `chain-route-${edge.health}`]}
	data-edge-id={edge.id}
	data-edge-health={edge.health}
	role="img"
	aria-label={ariaLabel}
>
	<title>{ariaLabel}</title>
	<path
		d={path}
		stroke={stroke}
		stroke-width="2.5"
		stroke-dasharray={dashArray}
		fill="none"
		marker-end={`url(#chain-route-arrow-${edge.health})`}
	/>
	<g transform={`translate(${mid.x}, ${mid.y - 8})`}>
		<rect x="-22" y="-9" width="44" height="14" fill="var(--paper-50)" stroke="var(--paper-edge)" />
		<text
			text-anchor="middle"
			dominant-baseline="middle"
			y="-2"
			font-family="var(--font-ui)"
			font-size="10"
			font-weight="700"
			fill="var(--ink-700)"
		>
			{edge.label}
		</text>
	</g>
</g>

<style>
	.chain-route path {
		animation: chain-route-flow 1.4s linear infinite;
	}

	.chain-route-shortage path,
	.chain-route-no-local-capacity path {
		animation-duration: 0.8s;
	}

	.chain-route-no-report path {
		animation: none;
	}

	@keyframes chain-route-flow {
		to {
			stroke-dashoffset: -40;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.chain-route path {
			animation: none;
		}
	}
</style>
