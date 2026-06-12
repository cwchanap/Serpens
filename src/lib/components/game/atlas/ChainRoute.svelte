<script lang="ts">
	import type { ProductChainEdge, ProductChainHealth } from '$lib/game/productChainGraph';

	interface Props {
		edge: ProductChainEdge;
		source: { x: number; y: number };
		target: { x: number; y: number };
		markerPrefix: string;
	}

	let { edge, source, target, markerPrefix }: Props = $props();

	const path = $derived.by(() => {
		const dx = Math.max(40, (target.x - source.x) / 2);
		const c1 = { x: source.x + dx, y: source.y };
		const c2 = { x: target.x - dx, y: target.y };
		return `M ${source.x} ${source.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${target.x} ${target.y}`;
	});

	// Anchor the label at t = 0.3 along the same cubic bezier as `path` so
	// labels on edges that converge into the same target don't stack on top
	// of each other at the midpoint.
	const labelPoint = $derived.by(() => {
		const t = 0.3;
		const u = 1 - t;
		const dx = Math.max(40, (target.x - source.x) / 2);
		const c1 = { x: source.x + dx, y: source.y };
		const c2 = { x: target.x - dx, y: target.y };
		return {
			x: u * u * u * source.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * target.x,
			y: u * u * u * source.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * target.y
		};
	});

	const stroke = $derived(healthStroke(edge.health));
	const dashArray = $derived(healthDash(edge.health));
	const ariaLabel = $derived(`${edge.label}, ${edge.health.replace(/-/g, ' ')}`);

	let textEl: SVGTextElement | null = $state(null);
	let labelWidth = $state(44);

	$effect(() => {
		if (textEl) {
			const _label = edge.label;
			void _label;
			labelWidth = textEl.getComputedTextLength();
		}
	});

	const rectPad = 6;
	const rectWidth = $derived(Math.max(44, labelWidth + rectPad * 2));
	const rectX = $derived(-rectWidth / 2);

	function healthStroke(health: ProductChainHealth): string {
		if (health === 'healthy') return 'var(--moss)';
		if (health === 'shortage' || health === 'no-local-capacity') return 'var(--wax-red)';
		if (health === 'no-report')
			return 'color-mix(in srgb, var(--brass-700) 50%, var(--paper-edge))';
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
		{stroke}
		stroke-width="2.5"
		stroke-dasharray={dashArray}
		fill="none"
		marker-end={`url(#${markerPrefix}-chain-route-arrow-${edge.health})`}
	/>
	<g transform={`translate(${labelPoint.x}, ${labelPoint.y - 8})`}>
		<rect
			x={rectX}
			y="-9"
			width={rectWidth}
			height="14"
			fill="var(--paper-50)"
			stroke="var(--paper-edge)"
		/>
		<text
			bind:this={textEl}
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
