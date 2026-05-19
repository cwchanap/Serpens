import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { buildProductChainGraph } from '$lib/game/productChainGraph';
import { createNewGame } from '$lib/game/state';
import ProductChainGraph from './ProductChainGraph.svelte';

describe('ProductChainGraph', () => {
	it('clears the selected node when the graph changes', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);
		const onSelectNode = vi.fn();
		const snacksGraph = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'snacks'
		});
		const drinksGraph = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'drinks'
		});
		const view = render(ProductChainGraph, {
			graph: snacksGraph,
			selectedNodeId: 'material:snacks',
			onSelectNode
		});

		await expect.element(page.getByTestId('product-chain-graph-chain:snacks')).toBeVisible();

		view.rerender({
			graph: drinksGraph,
			selectedNodeId: 'material:snacks',
			onSelectNode
		});

		await expect.poll(() => onSelectNode.mock.calls.some(([nodeId]) => nodeId === null)).toBe(true);
	});
});
