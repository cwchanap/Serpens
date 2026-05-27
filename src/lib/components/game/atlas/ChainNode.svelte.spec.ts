import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ProductChainNode } from '$lib/game/productChainGraph';
import ChainNode from './ChainNode.svelte';

function materialNode(overrides: Partial<ProductChainNode> = {}): ProductChainNode {
	return {
		id: 'material:flour',
		kind: 'material',
		label: 'Flour',
		materialId: 'flour',
		recipeId: null,
		stage: 'process',
		layer: 1,
		row: 0,
		health: 'healthy',
		healthLabel: 'Healthy',
		warehouseStock: 12,
		capacity: { buildingCount: 0, outputPerDay: 0, inputPerDay: 0 },
		actual: {
			produced: 38,
			consumed: 28,
			importedInput: 0,
			warehousePulled: 0,
			shopImported: 0,
			unitsSold: 0,
			demandMissed: 0
		},
		bottleneck: '',
		...overrides
	};
}

describe('ChainNode', () => {
	it('renders a material node as a button with the material icon and label', async () => {
		expect.assertions(3);
		const onSelect = vi.fn();
		render(ChainNode, {
			node: materialNode(),
			selected: false,
			compact: false,
			position: { x: 0, y: 0 },
			onSelect
		});

		const button = page.getByRole('button', { name: /Flour, Healthy/i });
		await expect.element(button).toBeVisible();
		await expect.element(page.getByAltText('Flour')).toBeVisible();
		await expect.element(button).toHaveAttribute('data-node-kind', 'material');
	});

	it('calls onSelect with the node id when clicked', async () => {
		expect.assertions(1);
		const onSelect = vi.fn();
		render(ChainNode, {
			node: materialNode(),
			selected: false,
			compact: false,
			position: { x: 0, y: 0 },
			onSelect
		});

		await page.getByRole('button', { name: /Flour/i }).click();
		expect(onSelect).toHaveBeenCalledWith('material:flour');
	});
});
