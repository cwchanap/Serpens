import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createNewGame } from '$lib/game/state';
import type { GameState, Store } from '$lib/game/types';
import StoreProductChainPanel from './StoreProductChainPanel.svelte';

function renderProductChainPanel(game: GameState, store: Store) {
	return render(StoreProductChainPanel, { game, store });
}

describe('StoreProductChainPanel', () => {
	it('shows supported convenience store product categories and the default snacks graph', async () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260518);

		renderProductChainPanel(game, game.stores[0]!);

		await expect.element(page.getByLabelText('Product category')).toBeVisible();
		await expect.element(page.getByRole('option', { name: 'Snacks' })).toBeInTheDocument();
		await expect.element(page.getByRole('option', { name: 'Drinks' })).toBeInTheDocument();
		await expect.element(page.getByTestId('product-chain-graph-chain:snacks')).toBeVisible();
	});

	it('switches the graph when the product category changes', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);

		renderProductChainPanel(game, game.stores[0]!);

		await page.getByLabelText('Product category').selectOptions('drinks');

		await expect.element(page.getByTestId('product-chain-graph-chain:drinks')).toBeVisible();
		await expect.element(page.getByText('Drinks chain')).toBeVisible();
	});

	it('shows an empty state for stores without supported production categories', async () => {
		expect.assertions(1);
		const game = createNewGame('electronics', 20260518);

		renderProductChainPanel(game, game.stores[0]!);

		await expect
			.element(
				page.getByText("No local production chain available for this store's categories yet.")
			)
			.toBeVisible();
	});

	it('resets the selected category whenever the selected store changes', async () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260518);
		const secondStore: Store = {
			...game.stores[0]!,
			id: 'store-2',
			name: 'Second Store'
		};
		const view = renderProductChainPanel(game, game.stores[0]!);

		await page.getByLabelText('Product category').selectOptions('drinks');

		view.rerender({ game, store: secondStore });

		await expect.element(page.getByTestId('product-chain-graph-chain:snacks')).toBeVisible();
		await expect.element(page.getByText('Snacks chain')).toBeVisible();

		view.rerender({ game, store: game.stores[0]! });

		await expect.element(page.getByTestId('product-chain-graph-chain:snacks')).toBeVisible();
	});
});
