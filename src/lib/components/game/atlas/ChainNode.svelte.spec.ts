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

	it('renders a recipe node with the building icon and shortage styling', async () => {
		expect.assertions(2);
		const onSelect = vi.fn();
		render(ChainNode, {
			node: materialNode({
				id: 'recipe:flour-milling',
				kind: 'recipe',
				label: 'Flour mill',
				materialId: null,
				recipeId: 'flour-milling',
				health: 'shortage',
				healthLabel: 'Shortage',
				capacity: { buildingCount: 1, outputPerDay: 20, inputPerDay: 20 }
			}),
			selected: false,
			compact: false,
			position: { x: 0, y: 0 },
			onSelect
		});

		const button = page.getByRole('button', { name: /Flour mill, Shortage/i });
		await expect.element(button).toHaveAttribute('data-node-kind', 'recipe');
		await expect.element(button).toHaveAttribute('data-node-health', 'shortage');
	});

	it('shows capacity outputPerDay in recipe node stat, not actual.produced', async () => {
		expect.assertions(1);
		const onSelect = vi.fn();
		render(ChainNode, {
			node: materialNode({
				id: 'recipe:flour-milling',
				kind: 'recipe',
				label: 'Flour mill',
				materialId: null,
				recipeId: 'flour-milling',
				health: 'healthy',
				healthLabel: 'Healthy',
				capacity: { buildingCount: 3, outputPerDay: 60, inputPerDay: 60 },
				actual: {
					produced: 0,
					consumed: 0,
					importedInput: 0,
					warehousePulled: 0,
					shopImported: 0,
					unitsSold: 0,
					demandMissed: 0
				}
			}),
			selected: false,
			compact: false,
			position: { x: 0, y: 0 },
			onSelect
		});

		await expect.element(page.getByText('3 bldg · 60/d')).toBeVisible();
	});

	it('renders a warehouse node with the warehouse icon and stock stat', async () => {
		expect.assertions(2);
		const onSelect = vi.fn();
		render(ChainNode, {
			node: materialNode({
				id: 'warehouse',
				kind: 'warehouse',
				label: 'Warehouse',
				materialId: null,
				warehouseStock: 42
			}),
			selected: true,
			compact: true,
			position: { x: 0, y: 0 },
			onSelect
		});

		const button = page.getByRole('button', { name: /Warehouse/i });
		await expect.element(button).toHaveAttribute('data-node-kind', 'warehouse');
		await expect.element(button).toHaveAttribute('aria-pressed', 'true');
	});

	it('renders a glyph fallback with data-art-missing when art src is null', async () => {
		expect.assertions(2);
		const onSelect = vi.fn();
		render(ChainNode, {
			node: materialNode({
				id: 'recipe:unknown',
				kind: 'recipe',
				label: 'Unknown recipe',
				materialId: null,
				recipeId: null
			}),
			selected: false,
			compact: false,
			position: { x: 0, y: 0 },
			onSelect
		});

		const button = page.getByRole('button', { name: /Unknown recipe/i });
		await expect.element(button).toBeVisible();
		const glyph = page.getByText('U').first();
		await expect.element(glyph).toHaveAttribute('data-art-missing');
	});
});
