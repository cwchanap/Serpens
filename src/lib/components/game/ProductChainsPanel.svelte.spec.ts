import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { addWarehouseMaterial } from '$lib/game/industryProduction';
import { createNewGame } from '$lib/game/state';
import { createI18n, type I18nBundle } from '$lib/i18n';
import type { GameState } from '$lib/game/types';
import ProductChainsPanel from './ProductChainsPanel.svelte';

function renderProductChainsPanel(game: GameState, i18n: I18nBundle = createI18n('en')) {
	return render(ProductChainsPanel, { game, i18n });
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
		expect(document.querySelector('.chain-title')?.textContent).toBe('Bottled Water chain');
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

	it('renders Japanese mode buttons', async () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260518);

		renderProductChainsPanel(game, createI18n('ja'));

		await expect.element(page.getByRole('button', { name: '倉庫フロー' })).toBeVisible();
	});

	it('shows empty-state messages and the fallback heading when no stores have chain categories', async () => {
		expect.assertions(4);
		const baseGame = createNewGame('convenience', 20260518);
		const game: GameState = { ...baseGame, stores: [] };

		renderProductChainsPanel(game);

		await expect
			.element(page.getByText('No store categories have local production chains yet.'))
			.toBeVisible();
		await expect.element(page.getByText('No chain graph is available.')).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Product Chains' })).toBeVisible();
		await expect.element(page.getByTestId('category-stamp-bottled-water')).not.toBeInTheDocument();
	});

	it('shows the fallback heading in warehouse-flow mode when no warehouse stock or report exists', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);

		renderProductChainsPanel(game);

		await page.getByRole('button', { name: 'Warehouse flow' }).click();

		await expect.element(page.getByText('No warehouse stock or daily report yet.')).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Warehouse flow' })).toBeVisible();
	});

	it('selects a chain node and shows the inspected node broadside', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);

		renderProductChainsPanel(game);

		const graph = page.getByTestId('product-chain-graph-chain:bottled-water');
		const firstNodeButton = graph.getByRole('button').first();
		await firstNodeButton.click();

		await expect.element(page.getByText('Inspected node')).toBeVisible();
		await expect
			.element(page.getByText('Select a graph node to inspect its latest flow metrics.'))
			.not.toBeInTheDocument();
	});
});
