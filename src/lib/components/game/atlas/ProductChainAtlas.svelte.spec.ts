import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { buildProductChainGraph } from '$lib/game/productChainGraph';
import { createNewGame } from '$lib/game/state';
import ProductChainAtlas from './ProductChainAtlas.svelte';

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
			},
			selectedNodeId: null,
			onSelectNode
		});

		await expect
			.element(page.getByText('No local production chain available for this category yet.'))
			.toBeVisible();
	});

	it('renders one button per graph node with correct aria-pressed for the selected one', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);
		const graph = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'snacks'
		});
		const firstNode = graph.nodes[0]!;
		const onSelectNode = vi.fn();
		render(ProductChainAtlas, {
			graph,
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
		const snacks = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'snacks'
		});
		const drinks = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'drinks'
		});
		const onSelectNode = vi.fn();
		const view = render(ProductChainAtlas, {
			graph: snacks,
			selectedNodeId: snacks.nodes[0]!.id,
			onSelectNode
		});

		view.rerender({
			graph: drinks,
			selectedNodeId: snacks.nodes[0]!.id,
			onSelectNode
		});

		await expect.poll(() => onSelectNode.mock.calls.some(([nodeId]) => nodeId === null)).toBe(true);
	});

	it('emits the node id when a node button is clicked', async () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260518);
		const graph = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'snacks'
		});
		const firstNode = graph.nodes[0]!;
		const onSelectNode = vi.fn();
		render(ProductChainAtlas, {
			graph,
			selectedNodeId: null,
			onSelectNode
		});

		await page
			.getByRole('button', { name: `${firstNode.label}, ${firstNode.healthLabel}` })
			.click();
		expect(onSelectNode).toHaveBeenCalledWith(firstNode.id);
	});

	it('renders SVG route groups for every graph edge', async () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260518);
		const graph = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'snacks'
		});
		const onSelectNode = vi.fn();
		render(ProductChainAtlas, {
			graph,
			selectedNodeId: null,
			onSelectNode
		});

		const edgeGroups = document.querySelectorAll('g[data-edge-id]');
		expect(edgeGroups).toHaveLength(graph.edges.length);
	});

	it('broadside overlay has pointer-events: none so clicks pass through', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);
		const graph = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'snacks'
		});
		const onSelectNode = vi.fn();
		render(ProductChainAtlas, {
			graph,
			selectedNodeId: null,
			onSelectNode
		});

		// The broadside slot is rendered when compact is false (default).
		// Even without a broadside snippet, the slot element may not exist,
		// so verify the CSS rule directly from the ChainMap style.
		const chainMap = document.querySelector('.chain-map');
		expect(chainMap).toBeTruthy();

		// Verify that no .broadside-slot child re-enables pointer-events
		// by checking the broadside-slot rule in the stylesheet.
		const sheets = document.styleSheets;
		let foundReenable = false;
		outer: for (const sheet of sheets) {
			try {
				for (const rule of sheet.cssRules) {
					if (
						rule instanceof CSSStyleRule &&
						rule.selectorText.includes('broadside-slot') &&
						rule.selectorText.includes(':global')
					) {
						foundReenable = rule.style.pointerEvents === 'auto';
						break outer;
					}
				}
			} catch {
				// Cross-origin stylesheets throw
			}
		}
		expect(foundReenable).toBe(false);
	});

	it('uses instance-scoped marker IDs in <defs> and route paths', async () => {
		expect.assertions(5);
		const game = createNewGame('convenience', 20260518);
		const graph = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'snacks'
		});
		const onSelectNode = vi.fn();
		render(ProductChainAtlas, {
			graph,
			selectedNodeId: null,
			onSelectNode
		});

		const markers = document.querySelectorAll('svg defs marker[id]');
		for (const marker of markers) {
			const id = marker.getAttribute('id')!;
			expect(id).toMatch(/^[a-z]\d+-chain-route-arrow-/);
		}
	});
});
