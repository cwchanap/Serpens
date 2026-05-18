<script lang="ts">
	import '@xyflow/svelte/dist/style.css';

	import {
		Background,
		BackgroundVariant,
		Controls,
		Position,
		SvelteFlow,
		type Edge,
		type Node
	} from '@xyflow/svelte';
	import type {
		ProductChainEdge,
		ProductChainGraph as ProductChainGraphData,
		ProductChainHealth,
		ProductChainNode
	} from '$lib/game/productChainGraph';
	import ProductChainSelectionBridge from './ProductChainSelectionBridge.svelte';

	interface Props {
		graph: ProductChainGraphData;
		selectedNodeId: string | null;
		compact?: boolean;
		onSelectNode: (nodeId: string | null) => void;
	}

	type ChainFlowNode = Node<{ label: string }, 'input' | 'default' | 'output'>;
	type ChainFlowEdge = Edge<{ health: ProductChainHealth }, 'smoothstep'>;

	let { graph, selectedNodeId, compact = false, onSelectNode }: Props = $props();

	const flowNodes = $derived.by(() => graph.nodes.map((node) => toFlowNode(node)));
	const flowEdges = $derived.by(() => graph.edges.map((edge) => toFlowEdge(edge)));
	const selectedNode = $derived(selectedNodeId ? graph.details[selectedNodeId] : null);
	const hasGraph = $derived(graph.nodes.length > 0);

	function toFlowNode(node: ProductChainNode): ChainFlowNode {
		const xStep = compact ? 155 : 210;
		const yStep = compact ? 82 : 104;
		const nodeType =
			node.kind === 'warehouse' ? 'output' : node.kind === 'recipe' ? 'default' : 'input';

		return {
			id: node.id,
			type: nodeType,
			data: { label: formatNodeLabel(node) },
			position: {
				x: node.layer * xStep,
				y: node.row * yStep
			},
			sourcePosition: Position.Right,
			targetPosition: Position.Left,
			draggable: false,
			connectable: false,
			deletable: false,
			selectable: true,
			selected: selectedNodeId === node.id,
			class: ['chain-node', `chain-node-${node.health}`],
			style: nodeStyle(node.health, selectedNodeId === node.id),
			ariaLabel: `${node.label}, ${node.healthLabel}`,
			domAttributes: {
				'data-node-id': node.id
			}
		};
	}

	function toFlowEdge(edge: ProductChainEdge): ChainFlowEdge {
		return {
			id: edge.id,
			type: 'smoothstep',
			source: edge.source,
			target: edge.target,
			label: edge.label,
			data: { health: edge.health },
			animated: edge.health === 'shortage',
			deletable: false,
			selectable: false,
			focusable: false,
			class: ['chain-edge', `chain-edge-${edge.health}`],
			style: edgeStyle(edge.health),
			labelStyle:
				'fill: var(--ink-700); font-family: var(--font-ui); font-size: 11px; font-weight: 700;',
			ariaLabel: edge.label
		};
	}

	function formatNodeLabel(node: ProductChainNode): string {
		const stockLabel =
			node.kind === 'recipe'
				? `${node.capacity.buildingCount} buildings`
				: `stock ${formatQuantity(node.warehouseStock)}`;

		return `${node.label}\n${node.healthLabel} - ${stockLabel}`;
	}

	function formatQuantity(quantity: number): string {
		return Number.isInteger(quantity)
			? String(quantity)
			: quantity.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
	}

	function nodeStyle(health: ProductChainHealth, selected: boolean): string {
		const borderColor = selected ? 'var(--brass-700)' : healthColor(health);
		const shadow = selected
			? '0 0 0 2px color-mix(in srgb, var(--brass-700) 22%, transparent)'
			: 'none';

		return [
			'width: 132px',
			'min-height: 46px',
			'border-radius: 3px',
			`border: 1px solid ${borderColor}`,
			'background: var(--paper-50)',
			'color: var(--ink-700)',
			'font-family: var(--font-ui)',
			'font-size: 11px',
			'font-weight: 700',
			'letter-spacing: 0',
			'line-height: 1.25',
			'padding: 0.45rem 0.55rem',
			'white-space: pre-line',
			'overflow-wrap: anywhere',
			`box-shadow: ${shadow}`
		].join('; ');
	}

	function edgeStyle(health: ProductChainHealth): string {
		return [`stroke: ${healthColor(health)}`, 'stroke-width: 2'].join('; ');
	}

	function healthColor(health: ProductChainHealth): string {
		if (health === 'healthy') {
			return 'var(--moss)';
		}

		if (health === 'shortage' || health === 'no-local-capacity') {
			return 'var(--wax-red)';
		}

		return 'var(--brass-700)';
	}
</script>

<section
	class={['graph-shell', compact && 'compact']}
	data-testid={`product-chain-graph-${graph.id}`}
	aria-label={graph.title}
>
	<div class="graph-heading">
		<div>
			<p>Product chain</p>
			<h3>{graph.title}</h3>
		</div>
		{#if selectedNode}
			<span>{selectedNode.label}: {selectedNode.healthLabel}</span>
		{/if}
	</div>

	{#if graph.emptyReason}
		<p class="empty">{graph.emptyReason}</p>
	{:else if hasGraph}
		<div class="flow-frame" aria-label={`${graph.title} graph`}>
			<SvelteFlow
				id={`product-chain-flow-${graph.id}`}
				class="product-chain-flow"
				nodes={flowNodes}
				edges={flowEdges}
				fitView
				fitViewOptions={{
					padding: compact ? 0.18 : 0.24,
					minZoom: compact ? 0.45 : 0.55,
					maxZoom: 1
				}}
				nodesDraggable={false}
				nodesConnectable={false}
				elementsSelectable={true}
				nodesFocusable={true}
				edgesFocusable={false}
				selectNodesOnDrag={false}
				selectionOnDrag={false}
				panOnDrag={true}
				panOnScroll={true}
				zoomOnDoubleClick={false}
				deleteKey={null}
				selectionKey={null}
				multiSelectionKey={null}
				proOptions={{ hideAttribution: true }}
			>
				<ProductChainSelectionBridge onSelect={onSelectNode} />
				<Background
					id={`product-chain-background-${graph.id}`}
					variant={BackgroundVariant.Lines}
					gap={compact ? 18 : 24}
					patternColor="color-mix(in srgb, var(--paper-edge) 72%, transparent)"
				/>
				<Controls showLock={false} fitViewOptions={{ padding: compact ? 0.18 : 0.24 }} />
			</SvelteFlow>
		</div>

		{#if graph.warnings.length > 0}
			<ul class="warnings" aria-label={`${graph.title} warnings`}>
				{#each graph.warnings as warning (warning)}
					<li>{warning}</li>
				{/each}
			</ul>
		{/if}
	{:else}
		<p class="empty">No graph nodes are available for this chain.</p>
	{/if}
</section>

<style>
	.graph-shell {
		display: grid;
		gap: 0.75rem;
		min-width: 0;
		color: var(--ink-700);
	}

	.graph-heading {
		display: flex;
		align-items: start;
		justify-content: space-between;
		gap: 0.75rem;
		min-width: 0;
	}

	.graph-heading div {
		min-width: 0;
	}

	h3,
	p {
		margin: 0;
	}

	h3 {
		overflow-wrap: anywhere;
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.graph-heading p,
	.graph-heading span {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	.graph-heading span {
		max-width: 14rem;
		text-align: right;
		overflow-wrap: anywhere;
	}

	.flow-frame {
		width: 100%;
		height: 25rem;
		min-height: 18rem;
		overflow: hidden;
		border: 1px solid var(--paper-edge);
		border-radius: 3px;
		background: var(--paper-50);
	}

	.compact .flow-frame {
		height: 17rem;
		min-height: 15rem;
	}

	.empty {
		border: 1px solid var(--paper-edge);
		border-radius: 3px;
		background: var(--paper-50);
		padding: 0.85rem;
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.9rem;
		line-height: 1.45;
	}

	.warnings {
		margin: 0;
		padding-left: 1rem;
		color: var(--wax-red);
		font-family: var(--font-body);
		font-size: 0.86rem;
		line-height: 1.4;
	}

	:global(.svelte-flow.product-chain-flow) {
		--xy-background-color: var(--paper-50);
		--xy-edge-label-background-color: var(--paper-50);
		--xy-edge-label-color: var(--ink-700);
		--xy-controls-button-background-color: var(--paper-50);
		--xy-controls-button-background-color-hover: color-mix(
			in srgb,
			var(--paper-50) 78%,
			var(--brass-700)
		);
		--xy-controls-button-color: var(--ink-700);
		--xy-controls-button-border-color: var(--paper-edge);
		font-family: var(--font-ui);
	}

	:global(.svelte-flow.product-chain-flow .svelte-flow__node) {
		box-shadow: none;
	}

	:global(.svelte-flow.product-chain-flow .svelte-flow__edge-textbg) {
		fill: var(--paper-50);
		stroke: var(--paper-edge);
		stroke-width: 1px;
	}

	:global(.svelte-flow.product-chain-flow .svelte-flow__controls) {
		box-shadow: none;
		border: 1px solid var(--paper-edge);
	}

	@media (max-width: 640px) {
		.graph-heading {
			display: grid;
		}

		.graph-heading span {
			max-width: none;
			text-align: left;
		}

		.flow-frame {
			height: 20rem;
		}
	}
</style>
