<script lang="ts">
	import { SvelteMap } from 'svelte/reactivity';
	import type { ProductChainGraph } from '$lib/game/productChainGraph';
	import ChainMap from './ChainMap.svelte';
	import ChainNode from './ChainNode.svelte';
	import ChainRoute from './ChainRoute.svelte';

	interface Props {
		graph: ProductChainGraph;
		selectedNodeId: string | null;
		compact?: boolean;
		onSelectNode: (nodeId: string | null) => void;
		broadside?: import('svelte').Snippet;
	}

	let { graph, selectedNodeId, compact = false, onSelectNode, broadside }: Props = $props();

	let previousGraphId = $state<string | null>(null);

	const xStep = $derived(compact ? 155 : 210);
	const yStep = $derived(compact ? 112 : 156);
	const xPad = $derived(compact ? 30 : 60);
	const yPad = $derived(compact ? 30 : 60);

	const positioned = $derived.by(() =>
		graph.nodes.map((node) => ({
			node,
			position: {
				x: node.layer * xStep + xPad,
				y: node.row * yStep + yPad
			}
		}))
	);

	const centers = $derived.by(() => {
		const map = new SvelteMap<string, { x: number; y: number }>();
		const halfX = compact ? 52 : 66;
		const halfY = compact ? 56 : 78;
		for (const { node, position } of positioned) {
			map.set(node.id, { x: position.x + halfX, y: position.y + halfY });
		}
		return map;
	});

	const layout = $derived.by(() => {
		let maxX = 0;
		let maxY = 0;
		for (const { position } of positioned) {
			maxX = Math.max(maxX, position.x + (compact ? 104 : 132));
			maxY = Math.max(maxY, position.y + (compact ? 110 : 152));
		}
		return {
			width: Math.max(maxX + xPad, compact ? 520 : 880),
			height: Math.max(maxY + yPad, compact ? 280 : 460)
		};
	});

	$effect(() => {
		if (previousGraphId === null) {
			previousGraphId = graph.id;
			return;
		}
		if (graph.id !== previousGraphId) {
			previousGraphId = graph.id;
			onSelectNode(null);
			return;
		}
		if (selectedNodeId && !graph.details[selectedNodeId]) {
			onSelectNode(null);
		}
	});

	function handleCanvasClick(event: MouseEvent): void {
		if (event.target === event.currentTarget) {
			onSelectNode(null);
		}
	}
</script>

<section class={['product-chain-atlas', compact && 'is-compact']} aria-label={graph.title}>
	{#if graph.emptyReason}
		<p class="empty">{graph.emptyReason}</p>
	{:else if graph.nodes.length === 0}
		<p class="empty">No graph nodes are available for this chain.</p>
	{:else}
		<ChainMap width={layout.width} height={layout.height} {compact} {broadside}>
			<div
				class="canvas-inner"
				role="presentation"
				onclick={handleCanvasClick}
				style:width={`${layout.width}px`}
				style:height={`${layout.height}px`}
				data-testid={`product-chain-graph-${graph.id}`}
			>
				<svg
					class="routes"
					width={layout.width}
					height={layout.height}
					viewBox={`0 0 ${layout.width} ${layout.height}`}
					aria-hidden="true"
				>
					<defs>
						{#each ['healthy', 'watch', 'shortage', 'no-local-capacity', 'no-report'] as health (health)}
							<marker
								id={`chain-route-arrow-${health}`}
								viewBox="0 0 10 10"
								refX="9"
								refY="5"
								markerWidth="6"
								markerHeight="6"
								orient="auto"
							>
								<path
									d="M0,0 L10,5 L0,10 z"
									fill={health === 'healthy'
										? 'var(--moss)'
										: health === 'shortage' || health === 'no-local-capacity'
											? 'var(--wax-red)'
											: 'var(--brass-700)'}
								/>
							</marker>
						{/each}
					</defs>
					{#each graph.edges as edge (edge.id)}
						{@const source = centers.get(edge.source)}
						{@const target = centers.get(edge.target)}
						{#if source && target}
							<ChainRoute {edge} {source} {target} />
						{/if}
					{/each}
				</svg>
				{#each positioned as item (item.node.id)}
					<ChainNode
						node={item.node}
						selected={item.node.id === selectedNodeId}
						{compact}
						position={item.position}
						onSelect={(id) => onSelectNode(id)}
					/>
				{/each}
			</div>
		</ChainMap>
		{#if graph.warnings.length > 0}
			<ul class="warnings" aria-label={`${graph.title} warnings`}>
				{#each graph.warnings as warning (warning)}
					<li>{warning}</li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>

<style>
	.product-chain-atlas {
		display: grid;
		gap: 0.75rem;
		min-width: 0;
		color: var(--ink-700);
	}

	.canvas-inner {
		position: relative;
	}

	.routes {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.warnings {
		margin: 0;
		padding-left: 1rem;
		color: var(--wax-red);
		font-family: var(--font-body);
		font-size: 0.86rem;
		line-height: 1.4;
	}

	.empty {
		margin: 0;
		border: 1px solid var(--paper-edge);
		border-radius: 3px;
		background: var(--paper-50);
		padding: 0.85rem;
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.9rem;
		line-height: 1.45;
	}
</style>
