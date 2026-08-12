import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { simulateDay } from '$lib/game/simulateDay';
import { createNewGame } from '$lib/game/state';
import { openWorldCity } from '$lib/game/world';
import { createI18n, type I18nBundle } from '$lib/i18n';
import type { GameState, IndustrialBuilding, WorldCityId } from '$lib/game/types';
import ProductChainsPanel from './ProductChainsPanel.svelte';

function renderProductChainsPanel(game: GameState, i18n: I18nBundle = createI18n('en')) {
	return render(ProductChainsPanel, { game, i18n });
}

function renderProductChainsPanelWithPlannerCategories(
	game: GameState,
	plannerCategoryIds: readonly string[],
	i18n: I18nBundle = createI18n('en')
) {
	return render(ProductChainsPanel, { game, i18n, plannerCategoryIds });
}

function openCity(game: GameState, cityId: WorldCityId): GameState {
	return openWorldCity(
		{
			...game,
			cash: 1_000_000,
			world: {
				...game.world,
				revealedCityIds: game.world.revealedCityIds.includes(cityId)
					? game.world.revealedCityIds
					: [...game.world.revealedCityIds, cityId]
			}
		},
		cityId
	);
}

function warehouseBuilding(cityId: WorldCityId, id: string): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId: 'warehouse',
		cityId,
		tileId: `${cityId}-warehouse`,
		mapX: 0,
		mapY: 0,
		status: 'idle',
		inventory: {},
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0
	};
}

function cityScopedChainGame(): GameState {
	const game = openCity(createNewGame('convenience', 20260803), 'breadbasket-basin');
	return {
		...game,
		activeCityId: 'harbor-city',
		activeIndustryCityId: 'breadbasket-basin',
		industrialBuildings: [
			warehouseBuilding('industry-city', 'industry-warehouse'),
			warehouseBuilding('breadbasket-basin', 'breadbasket-warehouse')
		],
		cityInventories: game.cityInventories!.map((inventory) =>
			inventory.cityId === 'industry-city'
				? {
						...inventory,
						materials: { snacks: 8 }
					}
				: {
						...inventory,
						materials: { snacks: 12 }
					}
		),
		retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }]
	};
}

function withActiveIndustryInventory(game: GameState): GameState {
	const cityId = game.activeIndustryCityId as WorldCityId;
	return {
		...game,
		industrialBuildings: [
			...game.industrialBuildings,
			warehouseBuilding(cityId, `${cityId}-warehouse`)
		],
		cityInventories: [
			...(game.cityInventories ?? []).filter((inventory) => inventory.cityId !== cityId),
			{
				cityId,
				materials: { snacks: 12 }
			}
		]
	};
}

function withImportedProductChainEdge(game: GameState): GameState {
	const simulated = simulateDay(game);
	const baselineReport = simulated.reports.at(-1)!;

	return {
		...game,
		reports: [
			{
				...baselineReport,
				productionReport: {
					...baselineReport.productionReport,
					importedInputs: [
						{
							cityId: 'industry-city',
							materialId: 'water',
							quantity: 10,
							value: 10,
							source: 'import'
						}
					]
				}
			}
		]
	};
}

describe('ProductChainsPanel', () => {
	it('emits the selected category when the Supply Advisor entry is activated', async () => {
		expect.assertions(1);
		const onPlanCategory = vi.fn();
		const game = createNewGame('convenience', 20260518);

		render(ProductChainsPanel, {
			game,
			i18n: createI18n('en'),
			onPlanCategory,
			plannerCategoryIds: ['bottled-water']
		});

		await page.getByRole('button', { name: 'Supply advisor' }).click();
		expect(onPlanCategory).toHaveBeenCalledWith('bottled-water');
	});

	it('disables the Supply Advisor button for categories not in plannerCategoryIds', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);

		// Snacks is a supported convenience-store archetype category but is
		// not in the planner category IDs (e.g. not carried/unlocked).
		renderProductChainsPanelWithPlannerCategories(game, ['bottled-water']);

		// Select the non-plannable category (snacks).
		await page.getByTestId('category-stamp-snacks').click();
		await expect.element(page.getByRole('heading', { name: 'Snacks' })).toBeVisible();

		// The Supply Advisor button must be disabled for snacks.
		const advisorButton = page.getByRole('button', { name: 'Supply advisor' });
		await expect.element(advisorButton).toBeDisabled();
	});

	it('enables the Supply Advisor button for categories in plannerCategoryIds', async () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260518);

		renderProductChainsPanelWithPlannerCategories(game, ['bottled-water', 'snacks']);

		// Select snacks (which is in the planner category IDs).
		await page.getByTestId('category-stamp-snacks').click();
		const advisorButton = page.getByRole('button', { name: 'Supply advisor' });
		await expect.element(advisorButton).toBeEnabled();
	});

	it('shows store category chains and the default bottled water graph', async () => {
		expect.assertions(5);
		const game = createNewGame('convenience', 20260518);

		renderProductChainsPanel(game);

		await expect.element(page.getByRole('region', { name: 'Product Chains' })).toBeVisible();
		await expect.element(page.getByTestId('category-stamp-bottled-water')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'City inventory flow' })).toBeVisible();
		await expect.element(page.getByTestId('product-chain-graph-chain:bottled-water')).toBeVisible();
		expect(document.querySelector('.chain-title')?.textContent).toBe('Bottled Water chain');
	});

	it('toggles from store category chains to city inventory flow', async () => {
		expect.assertions(3);
		const game = withActiveIndustryInventory(createNewGame('convenience', 20260518));

		renderProductChainsPanel(game);

		await page.getByRole('button', { name: 'City inventory flow' }).click();

		await expect.element(page.getByTestId('product-chain-graph-warehouse-flow')).toBeVisible();
		await expect.element(page.getByRole('button', { name: 'Store category chains' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'City inventory flow' })).toBeVisible();
	});

	it('renders Japanese mode buttons', async () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260518);

		renderProductChainsPanel(game, createI18n('ja'));

		await expect.element(page.getByRole('button', { name: '都市在庫フロー' })).toBeVisible();
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

	it('shows the fallback heading in city inventory flow mode when no city inventory stock or report exists', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);

		renderProductChainsPanel(game);

		await page.getByRole('button', { name: 'City inventory flow' }).click();

		await expect
			.element(page.getByText('No city inventory stock or daily report yet.'))
			.toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'City inventory flow' })).toBeVisible();
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

	it('selects a non-default category stamp to filter the chain view', async () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260518);

		renderProductChainsPanel(game);

		// Bottled water is the default category (first supported chain category),
		// so clicking its stamp cannot prove the stamp click changes the selection.
		// Snacks is a non-default supported convenience category; clicking its
		// stamp must swap both the heading and the rendered graph id.
		await expect.element(page.getByTestId('category-stamp-bottled-water')).toBeVisible();
		await page.getByTestId('category-stamp-snacks').click();

		// After selecting snacks, the heading shows the snacks category name and
		// the graph id switches to the snacks chain — neither matches the default
		// bottled-water state, so the click demonstrably drove the change.
		await expect.element(page.getByRole('heading', { name: 'Snacks' })).toBeVisible();
		await expect.element(page.getByTestId('product-chain-graph-chain:snacks')).toBeVisible();
	});

	it('toggles back to store category chains from city inventory flow mode', async () => {
		expect.assertions(2);
		const game = withActiveIndustryInventory(createNewGame('convenience', 20260518));

		renderProductChainsPanel(game);

		// Switch to the city inventory flow first.
		await page.getByRole('button', { name: 'City inventory flow' }).click();
		await expect.element(page.getByTestId('product-chain-graph-warehouse-flow')).toBeVisible();

		// Switch back to store category chains (exercises selectMode('store-categories')).
		await page.getByRole('button', { name: 'Store category chains' }).click();
		await expect.element(page.getByTestId('product-chain-graph-chain:bottled-water')).toBeVisible();
	});

	it('labels the active industrial city inventory instead of a global warehouse flow', async () => {
		expect.assertions(2);
		renderProductChainsPanel(cityScopedChainGame());

		await page.getByRole('button', { name: 'City inventory flow' }).click();
		await expect
			.element(page.getByText('City inventory — Breadbasket Basin', { exact: true }))
			.toBeVisible();
		await expect.element(page.getByText('Warehouse flow', { exact: true })).not.toBeInTheDocument();
	});

	it('renders External imports on an imported product-chain edge', async () => {
		expect.assertions(1);
		renderProductChainsPanel(withImportedProductChainEdge(cityScopedChainGame()));

		await expect
			.element(page.getByText('0/day used · 10/cycle · External imports', { exact: true }))
			.toBeVisible();
	});

	it.each([
		[
			'available local supply',
			(game: GameState) => game,
			'Local supply for Harbor City — Industry City: 8 / 200 city inventory used.'
		],
		[
			'imports only',
			(game: GameState) => ({
				...game,
				retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: null }]
			}),
			'Harbor City supply: Imports only — replenishment uses external imports.'
		],
		[
			'zero-capacity source',
			(game: GameState) => ({
				...game,
				industrialBuildings: game.industrialBuildings.filter(
					(building) => building.cityId !== 'industry-city'
				),
				cityInventories: game.cityInventories!.map((inventory) =>
					inventory.cityId === 'industry-city'
						? {
								...inventory,
								materials: {}
							}
						: inventory
				)
			}),
			'Local supply for Harbor City — source Industry City has zero city inventory capacity.'
		]
	] as const)('shows %s as a distinct retail source state', async (_, arrange, expectedCopy) => {
		expect.assertions(1);
		renderProductChainsPanel(arrange(cityScopedChainGame()) as GameState);

		await expect.element(page.getByText(expectedCopy)).toBeVisible();
	});

	it.each([
		[
			'imports only',
			(game: GameState) => ({
				...game,
				retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: null }]
			}),
			'Harbor City supply: Imports only — replenishment uses external imports.'
		],
		[
			'zero-capacity source',
			(game: GameState) => ({
				...game,
				industrialBuildings: game.industrialBuildings.filter(
					(building) => building.cityId !== 'industry-city'
				),
				cityInventories: game.cityInventories!.map((inventory) =>
					inventory.cityId === 'industry-city'
						? {
								...inventory,
								materials: {}
							}
						: inventory
				)
			}),
			'Local supply for Harbor City — source Industry City has zero city inventory capacity.'
		]
	] as const)(
		'shows %s with retail-city context when no category graph is available',
		async (_, arrange, expectedCopy) => {
			expect.assertions(2);
			const game = arrange({ ...cityScopedChainGame(), stores: [] }) as GameState;

			renderProductChainsPanel(game);

			await expect.element(page.getByText(expectedCopy)).toBeVisible();
			await expect
				.element(page.getByText('No chain graph is available.', { exact: true }))
				.toBeVisible();
		}
	);

	it('shows city inventory overflow state in City inventory flow', async () => {
		expect.assertions(2);
		const baseGame = withActiveIndustryInventory(createNewGame('convenience', 20260518));
		expect(baseGame.activeIndustryCityId).toBeDefined();
		const cityId = baseGame.activeIndustryCityId as WorldCityId;
		const game: GameState = {
			...baseGame,
			cityInventories: baseGame.cityInventories!.map((inventory) =>
				inventory.cityId === cityId ? { ...inventory, materials: { snacks: 205 } } : inventory
			)
		};

		renderProductChainsPanel(game);

		await page.getByRole('button', { name: 'City inventory flow' }).click();
		await expect
			.element(page.getByText('Industry City city inventory overflow: 5 units ($10).'))
			.toBeVisible();
	});

	it('uses the default onPlanCategory no-op when not provided', async () => {
		// Exercises the default `onPlanCategory = () => {}` prop (L36)
		// and the canPlanActiveCategory true branch (L84) by rendering
		// with plannerCategoryIds that include the active category and
		// clicking the Supply Advisor button without providing onPlanCategory.
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);

		render(ProductChainsPanel, {
			game,
			i18n: createI18n('en'),
			plannerCategoryIds: ['bottled-water']
		});

		const advisorButton = page.getByRole('button', { name: 'Supply advisor' });
		await expect.element(advisorButton).toBeEnabled();
		await advisorButton.click();
		// No assertion on a callback — the default no-op just must not throw.
		// Verify the button is still in the document after the click.
		await expect.element(advisorButton).toBeInTheDocument();
	});
});
