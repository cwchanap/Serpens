import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { Snippet } from 'svelte';
import { buildProductChainTree } from '$lib/game/productChainTree';
import { createNewGame } from '$lib/game/state';
import type { LocalizedProductChainGraph } from '$lib/i18n/localizedTypes';
import { createI18n } from '$lib/i18n';
import ProductChainAtlas from './ProductChainAtlas.svelte';

const i18n = createI18n('en');

// A no-op stand-in for a snippet (structural side-column checks only).
const noopSnippet = (() => {}) as unknown as Snippet;

// The atlas accepts LocalizedProductChainGraph (string fields). The raw builder
// emits structured objects; localizeProductChainGraph (Task 8) is the bridge.
// These tests check structure/interaction, not label text, so a cast suffices.
function localizedGraph(
	graph: ReturnType<typeof buildProductChainTree>
): LocalizedProductChainGraph {
	return graph as unknown as LocalizedProductChainGraph;
}

describe('ProductChainAtlas', () => {
	it('renders the empty message when graph.emptyReason is set', async () => {
		expect.assertions(1);
		const onSelectNode = vi.fn();
		render(ProductChainAtlas, {
			graph: {
				id: 'chain:none',
				title: 'No chain',
				nodes: [],
				edges: [],
				details: {},
				warnings: [],
				emptyReason: 'No local production chain available for this category yet.'
			} as LocalizedProductChainGraph,
			i18n,
			selectedNodeId: null,
			onSelectNode
		});

		await expect
			.element(page.getByText('No local production chain available for this category yet.'))
			.toBeVisible();
	});

	it('renders a fallback empty message when the graph has no nodes and no emptyReason', async () => {
		expect.assertions(1);
		const onSelectNode = vi.fn();
		render(ProductChainAtlas, {
			graph: {
				id: 'chain:empty',
				title: 'Empty chain',
				nodes: [],
				edges: [],
				details: {},
				warnings: [],
				emptyReason: null
			} as LocalizedProductChainGraph,
			i18n,
			selectedNodeId: null,
			onSelectNode
		});

		await expect
			.element(page.getByText('No graph nodes are available for this chain.'))
			.toBeVisible();
	});

	it('renders one button per graph node with correct aria-pressed for the selected one', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);
		const graph = buildProductChainTree({
			game,
			store: game.stores[0]!,
			productId: 'snacks'
		});
		const firstNode = graph.nodes[0]!;
		const onSelectNode = vi.fn();
		render(ProductChainAtlas, {
			graph: localizedGraph(graph),
			i18n,
			selectedNodeId: firstNode.id,
			onSelectNode
		});

		const buttons = page.getByRole('button');
		await expect.element(buttons.first()).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: `${firstNode.label}, ${firstNode.healthLabel}` }))
			.toHaveAttribute('aria-pressed', 'true');
	});

	it('clears selection when the graph id changes', async () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260518);
		const snacks = buildProductChainTree({
			game,
			store: game.stores[0]!,
			productId: 'snacks'
		});
		const drinks = buildProductChainTree({
			game,
			store: game.stores[0]!,
			productId: 'soft-drinks'
		});
		const onSelectNode = vi.fn();
		const view = render(ProductChainAtlas, {
			graph: localizedGraph(snacks),
			i18n,
			selectedNodeId: snacks.nodes[0]!.id,
			onSelectNode
		});

		view.rerender({
			graph: localizedGraph(drinks),
			i18n,
			selectedNodeId: snacks.nodes[0]!.id,
			onSelectNode
		});

		await expect.poll(() => onSelectNode.mock.calls.some(([nodeId]) => nodeId === null)).toBe(true);
	});

	it('emits the node id when a node button is clicked', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);
		const graph = buildProductChainTree({
			game,
			store: game.stores[0]!,
			productId: 'snacks'
		});
		const firstNode = graph.nodes[0]!;
		const onSelectNode = vi.fn();
		const onInteractionFeedback = vi.fn();
		render(ProductChainAtlas, {
			graph: localizedGraph(graph),
			i18n,
			selectedNodeId: null,
			onSelectNode,
			onInteractionFeedback
		});

		await page
			.getByRole('button', { name: `${firstNode.label}, ${firstNode.healthLabel}` })
			.click();
		expect(onSelectNode).toHaveBeenCalledWith(firstNode.id);
		expect(onInteractionFeedback).toHaveBeenCalledTimes(1);
	});

	it('clears selection and fires feedback when the canvas background is clicked', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);
		const graph = buildProductChainTree({
			game,
			store: game.stores[0]!,
			productId: 'snacks'
		});
		const onSelectNode = vi.fn();
		const onInteractionFeedback = vi.fn();
		render(ProductChainAtlas, {
			graph: localizedGraph(graph),
			i18n,
			selectedNodeId: graph.nodes[0]!.id,
			onSelectNode,
			onInteractionFeedback
		});

		const canvas = page.getByTestId(`product-chain-graph-${graph.id}`);
		// Click an empty corner of the canvas-inner so the event target is the
		// canvas itself (not a child node button or SVG route).
		await canvas.click({ position: { x: 2, y: 2 } });

		expect(onSelectNode).toHaveBeenCalledWith(null);
		expect(onInteractionFeedback).toHaveBeenCalledTimes(1);
	});

	it('renders SVG route groups for every graph edge', async () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260518);
		const graph = buildProductChainTree({
			game,
			store: game.stores[0]!,
			productId: 'snacks'
		});
		const onSelectNode = vi.fn();
		render(ProductChainAtlas, {
			graph: localizedGraph(graph),
			i18n,
			selectedNodeId: null,
			onSelectNode
		});

		const edgeGroups = document.querySelectorAll('g[data-edge-id]');
		expect(edgeGroups).toHaveLength(graph.edges.length);
	});

	it('renders the broadside as a side column next to the chain map', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);
		const graph = buildProductChainTree({
			game,
			store: game.stores[0]!,
			productId: 'snacks'
		});
		const onSelectNode = vi.fn();
		render(ProductChainAtlas, {
			graph: localizedGraph(graph),
			i18n,
			selectedNodeId: null,
			onSelectNode,
			onInteractionFeedback: () => {},
			// Structural check only: a no-op snippet still mounts the side column.
			broadside: noopSnippet
		});

		const body = document.querySelector<HTMLElement>('.atlas-body');
		expect(body).not.toBeNull();
		expect(document.querySelector('.atlas-body > .broadside-slot')).not.toBeNull();
	});

	it('uses instance-scoped marker IDs in <defs>', async () => {
		const game = createNewGame('convenience', 20260518);
		const graph = buildProductChainTree({
			game,
			store: game.stores[0]!,
			productId: 'snacks'
		});
		const onSelectNode = vi.fn();
		render(ProductChainAtlas, {
			graph: localizedGraph(graph),
			i18n,
			selectedNodeId: null,
			onSelectNode
		});

		const markers = document.querySelectorAll('svg defs marker[id]');
		expect(markers.length).toBeGreaterThan(0);
		expect.assertions(markers.length + 1);
		for (const marker of markers) {
			const id = marker.getAttribute('id')!;
			expect(id).toMatch(/^[a-z]\d+-chain-route-arrow-/);
		}
	});
});
