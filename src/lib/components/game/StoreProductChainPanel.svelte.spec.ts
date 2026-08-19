import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { flushSync, mount, unmount } from 'svelte';
import { createNewGame } from '$lib/game/state';
import { createI18n } from '$lib/i18n';
import type { GameState, Store } from '$lib/game/types';
import StoreProductChainPanel from './StoreProductChainPanel.svelte';

function renderProductChainPanel(
	game: GameState,
	store: Store,
	overrides: Partial<{
		onInteractionFeedback: () => void;
	}> = {}
) {
	return render(StoreProductChainPanel, { game, i18n: createI18n('en'), store, ...overrides });
}

describe('StoreProductChainPanel', () => {
	it('shows supported convenience store product categories and the default bottled water graph', async () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260518);

		renderProductChainPanel(game, game.stores[0]!);

		await expect.element(page.getByLabelText('Product category')).toBeVisible();
		await expect.element(page.getByRole('option', { name: 'Snacks' })).toBeInTheDocument();
		await expect.element(page.getByRole('option', { name: 'Soft Drinks' })).toBeInTheDocument();
		await expect.element(page.getByTestId('product-chain-graph-chain:bottled-water')).toBeVisible();
	});

	it('switches the graph when the product category changes', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);

		renderProductChainPanel(game, game.stores[0]!);

		await page.getByLabelText('Product category').selectOptions('soft-drinks');

		await expect.element(page.getByTestId('product-chain-graph-chain:soft-drinks')).toBeVisible();
		expect(document.querySelector('.chain-title')?.textContent).toBe('Soft Drinks chain');
	});

	it('fires interaction feedback for category and node selection clicks', async () => {
		expect.assertions(2);
		const onInteractionFeedback = vi.fn();
		const game = createNewGame('convenience', 20260518);

		renderProductChainPanel(game, game.stores[0]!, { onInteractionFeedback });

		await page.getByLabelText('Product category').selectOptions('soft-drinks');

		expect(onInteractionFeedback).toHaveBeenCalledOnce();

		const graph = page.getByTestId('product-chain-graph-chain:soft-drinks');
		await graph.getByRole('button').first().click();

		expect(onInteractionFeedback).toHaveBeenCalledTimes(2);
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

		await page.getByLabelText('Product category').selectOptions('soft-drinks');

		view.rerender({ game, i18n: createI18n('en'), store: secondStore });

		await expect.element(page.getByTestId('product-chain-graph-chain:bottled-water')).toBeVisible();
		expect(document.querySelector('.chain-title')?.textContent).toBe('Bottled Water chain');

		view.rerender({ game, i18n: createI18n('en'), store: game.stores[0]! });

		await expect.element(page.getByTestId('product-chain-graph-chain:bottled-water')).toBeVisible();
	});

	it('ignores select changes for unsupported category values', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);

		renderProductChainPanel(game, game.stores[0]!);

		await expect.element(page.getByTestId('product-chain-graph-chain:bottled-water')).toBeVisible();

		const select = page.getByLabelText('Product category').element() as HTMLSelectElement;
		const tempOption = document.createElement('option');
		tempOption.value = 'nonexistent-category';
		select.appendChild(tempOption);
		select.value = 'nonexistent-category';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		tempOption.remove();

		await expect.element(page.getByTestId('product-chain-graph-chain:bottled-water')).toBeVisible();
	});

	it('falls back to activeSelection productId when selectedCategory is null', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260518);
		const electronicsGame = createNewGame('electronics', 20260518);

		const props = $state({
			game,
			i18n: createI18n('en'),
			store: game.stores[0]!
		});

		const target = document.createElement('div');
		document.body.appendChild(target);
		const component = mount(StoreProductChainPanel, { target, props });
		try {
			flushSync();

			const graph = target.querySelector('[data-testid="product-chain-graph-chain:bottled-water"]');
			const nodeButton = graph?.querySelector('button') as HTMLButtonElement;
			nodeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
			flushSync();

			props.game = electronicsGame;
			props.store = electronicsGame.stores[0]!;
			flushSync();

			expect(target.textContent).toContain(
				"No local production chain available for this store's categories yet."
			);
		} finally {
			flushSync(() => unmount(component));
			target.remove();
		}
	});
});
