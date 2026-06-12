import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { addWarehouseMaterial } from '$lib/game/industryProduction';
import { createNewGame } from '$lib/game/state';
import type { GameState } from '$lib/game/types';
import ProductChainsPanel from './ProductChainsPanel.svelte';

function renderProductChainsPanel(game: GameState) {
	return render(ProductChainsPanel, { game });
}

describe('ProductChainsPanel', () => {
	it('shows store category chains and the default bottled water graph', async () => {
		expect.assertions(5);
		const game = createNewGame('convenience', 20260518);

		renderProductChainsPanel(game);

		await expect.element(page.getByRole('region', { name: 'Product Chains' })).toBeVisible();
		await expect.element(page.getByTestId('category-stamp-bottled-water')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Warehouse flow' })).toBeVisible();
		await expect.element(page.getByTestId('product-chain-graph-chain:bottled-water')).toBeVisible();
		await expect.element(page.getByText('Bottled Water chain')).toBeVisible();
	});

	it('toggles from store category chains to warehouse flow', async () => {
		expect.assertions(3);
		const baseGame = createNewGame('convenience', 20260518);
		const game = {
			...baseGame,
			warehouse: addWarehouseMaterial(baseGame.warehouse, 'snacks', 12)
		};

		renderProductChainsPanel(game);

		await page.getByRole('button', { name: 'Warehouse flow' }).click();

		await expect.element(page.getByTestId('product-chain-graph-warehouse-flow')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Store category chains' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Warehouse flow' })).toBeVisible();
	});
});
