import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import TileInspector from './TileInspector.svelte';
import type { GameRouteCommitResult } from '$lib/game/commandResult';
import { getProductArt, getStoreArt } from '$lib/assets/gameArt';
import { createNewGame } from '$lib/game/state';
import { initializeStoreProducts } from '$lib/game/stock';
import { createI18n, type I18nBundle } from '$lib/i18n';
import type { CityTile, DailyStoreReport, GameState, ProductId, Store } from '$lib/game/types';

const tile: CityTile = {
	id: 'harbor-city-1-1',
	cityId: 'harbor-city',
	x: 1,
	y: 1,
	neighborhood: 'downtown',
	terrain: 'commercial',
	feature: null,
	demand: 72,
	rent: 190,
	footTraffic: 76,
	customerFit: 70,
	locked: false
};

const store: Store = {
	id: 'store-1',
	level: 1,
	name: 'Founding Store',
	archetypeId: 'convenience',
	location: { neighborhoodId: 'downtown', x: 1, y: 1 },
	cityId: 'harbor-city',
	tileId: tile.id,
	mapX: 1,
	mapY: 1,
	daysOpen: 0,
	reputation: 50,
	stockHealth: 80,
	products: initializeStoreProducts('convenience'),
	staffMorale: 75,
	staffCapacity: 70,
	localDemand: 72,
	managerQuality: 60
};

const defaultGame: GameState = {
	...createNewGame('convenience', 20260518),
	stores: [store]
};

const latestStoreReport: DailyStoreReport = {
	storeId: 'store-1',
	revenue: 84,
	costOfGoods: 36,
	grossMargin: 48,
	operatingCosts: 120,
	importSpend: 0,
	netIncome: -36,
	customersServed: 12,
	demandMissed: 2,
	staffingCoverage: 100,
	staffingShortage: { manager: 0, general: 0 },
	stockHealth: 80,
	staffMorale: 75,
	reputation: 50,
	brandReputationAdjustment: 0,
	marketPosition: 40,
	productReports: [
		{
			productId: 'bottled-water',
			brandId: 'common-ground',
			name: 'Bottled Water',
			unitsSold: 12,
			demandMissed: 2,
			revenue: 60,
			costOfGoods: 36,
			grossMargin: 24,
			endingStock: 58,
			warehouseUnits: 0,
			warehouseValue: 0,
			importedUnits: 0,
			importCost: 2,
			importSpend: 0,
			wasteUnits: 0,
			wasteValue: 0,
			shrinkUnits: 0,
			shrinkValue: 0,
			stockoutLostDemand: 0,
			averageAgeDays: null,
			oldestSellableAgeDays: null,
			trendMultiplier: 1,
			obsolescenceMultiplier: 1,
			baseSellingPrice: 5,
			effectiveSellingPrice: 5,
			markdownAmount: 0
		}
	],
	inventoryLossExpense: 0,
	replenishment: null,
	warnings: []
};

function renderInspector(
	overrides: Partial<{
		game: GameState;
		tile: CityTile | null;
		store: Store | null;
		latestStoreReport: DailyStoreReport | null;
		onClose: () => void;
		onUpgradeStore: (storeId: string) => Promise<GameRouteCommitResult | null>;
		onOpenDetails: (productId: ProductId | null) => void;
		onClickFeedback: () => void;
		i18n: I18nBundle;
		canUpgradeStore: boolean;
		disabledReason: string;
	}> = {}
) {
	const props = {
		game: defaultGame,
		tile,
		store: null,
		latestStoreReport: null,
		onClose: vi.fn(),
		onOpenDetails: vi.fn(),
		i18n: createI18n('en'),
		...overrides
	};

	render(TileInspector, props);

	return props;
}

describe('TileInspector storefront art', () => {
	it('does not show convenience storefront art for an empty selected tile', async () => {
		renderInspector({ store: null });

		await expect.element(page.getByTestId('store-art-convenience')).not.toBeInTheDocument();
	});

	it('shows electronics storefront art for an electronics store tile', async () => {
		const electronicsArt = getStoreArt('electronics');

		renderInspector({
			store: {
				...store,
				archetypeId: 'electronics',
				products: initializeStoreProducts('electronics')
			}
		});

		const image = page.getByTestId('store-art-electronics');
		await expect.element(image).toBeVisible();
		await expect.element(image).toHaveAttribute('src', electronicsArt.path);
	});

	it('omits the storefront art when the archetype has no registered art', async () => {
		expect.assertions(2);
		renderInspector({
			store: { ...store, archetypeId: 'unknown' as Store['archetypeId'] }
		});

		await expect.element(page.getByRole('heading', { name: 'Founding Store' })).toBeVisible();
		await expect.element(page.getByTestId('store-art-unknown')).not.toBeInTheDocument();
	});
});

describe('TileInspector basic card', () => {
	it('shows staffing coverage from the assigned staff', async () => {
		renderInspector({ game: { ...defaultGame, staff: [] }, store });
		expect(
			(page.getByRole('meter', { name: 'Store staffing' }).element() as HTMLMeterElement).value
		).toBe(0);
		await expect.element(page.getByText('0 / 2', { exact: true })).toBeVisible();
	});
	it('shows store identity, an out-of-stock attention flag, and opens details', async () => {
		expect.assertions(4);
		const onOpenDetails = vi.fn();
		const outOfStockStore: Store = {
			...store,
			id: 'store-basic',
			products: [
				{
					productId: 'snacks',
					brandId: 'common-ground',
					lots: [],
					reorderThreshold: 10,
					targetStock: 50,
					sellingPrice: 5
				}
			]
		};

		renderInspector({ store: outOfStockStore, latestStoreReport, onOpenDetails });

		await expect.element(page.getByRole('heading', { name: 'Founding Store' })).toBeVisible();
		await expect.element(page.getByText(/out of stock/i)).toBeVisible();
		await page.getByRole('button', { name: /open details/i }).click();
		expect(onOpenDetails).toHaveBeenCalledTimes(1);
		// Normal Details always opens the detail unfocused.
		expect(onOpenDetails).toHaveBeenCalledWith(null);
	});

	it('shows the vital gauges (revenue, stock health, staff morale)', async () => {
		expect.assertions(3);

		renderInspector({ store, latestStoreReport });

		await expect.element(page.getByText('Revenue/day')).toBeVisible();
		await expect.element(page.getByRole('meter', { name: 'Stock health' })).toBeVisible();
		await expect.element(page.getByRole('meter', { name: 'Staff morale' })).toBeVisible();
	});

	it('does not render the stock/chain/staff tabs on the basic card', async () => {
		expect.assertions(3);

		renderInspector({ store, latestStoreReport });

		await expect.element(page.getByRole('tab', { name: 'Stock' })).not.toBeInTheDocument();
		await expect.element(page.getByRole('tab', { name: 'Product Chain' })).not.toBeInTheDocument();
		await expect.element(page.getByRole('tab', { name: 'Staff' })).not.toBeInTheDocument();
	});
});

describe('TileInspector store upgrade', () => {
	it('shows store level and fires upgrade callback', async () => {
		expect.assertions(3);
		const onClickFeedback = vi.fn();
		const onUpgradeStore = vi.fn();
		const level2Store: Store = { ...store, id: 'store-upgrade-1', level: 2 };
		const richGame: GameState = {
			...defaultGame,
			cash: 100_000,
			stores: [level2Store]
		};

		renderInspector({
			game: richGame,
			store: level2Store,
			onClickFeedback,
			onUpgradeStore
		});

		const heading = page.getByTitle(/Level 2 \/ 10/i);
		await expect.element(heading).toBeInTheDocument();

		const button = page.getByRole('button', { name: /Upgrade/i });
		await button.click();
		expect(onUpgradeStore).toHaveBeenCalledWith('store-upgrade-1');
		expect(onClickFeedback).not.toHaveBeenCalled();
	});

	it('shows Max level button text and hides the cash hint at MAX_STORE_LEVEL', async () => {
		expect.assertions(4);
		const maxStore: Store = { ...store, id: 'store-max', level: 10 };
		const richGame: GameState = {
			...defaultGame,
			cash: 1_000_000,
			stores: [maxStore]
		};

		renderInspector({ game: richGame, store: maxStore });

		await expect.element(page.getByTitle(/Level 10 \/ 10/i)).toBeInTheDocument();
		const button = page.getByRole('button', { name: /Max level/i });
		await expect.element(button).toBeDisabled();
		await expect.element(page.getByText('Not enough cash.')).not.toBeInTheDocument();
		await expect.element(page.getByTestId('upgrade-card')).not.toBeInTheDocument();
	});

	it('shows the cash hint when the store can upgrade but cash is insufficient', async () => {
		expect.assertions(4);
		const level2Store: Store = { ...store, id: 'store-broke', level: 2 };
		const brokeGame: GameState = {
			...defaultGame,
			cash: 0,
			stores: [level2Store]
		};

		renderInspector({ game: brokeGame, store: level2Store });

		await expect.element(page.getByTitle(/Level 2 \/ 10/i)).toBeInTheDocument();
		const button = page.getByRole('button', { name: /Upgrade/i });
		await expect.element(button).toBeDisabled();
		await expect.element(page.getByText('Not enough cash.')).toBeVisible();
		await expect.element(page.getByTestId('upgrade-card')).toBeVisible();
	});

	it('shows the visible upgrade card for an ordinary level (2 → 3)', async () => {
		expect.assertions(5);
		const level2Store: Store = { ...store, id: 'store-ordinary', level: 2 };
		const richGame: GameState = {
			...defaultGame,
			cash: 100_000,
			stores: [level2Store]
		};

		renderInspector({ game: richGame, store: level2Store });

		await expect.element(page.getByTestId('upgrade-card')).toBeVisible();
		await expect.element(page.getByText(/Level 2 → 3/)).toBeVisible();
		await expect.element(page.getByText('Cost $16,000')).toBeVisible();
		await expect.element(page.getByText('Revenue ×1.1 → ×1.2')).toBeVisible();
		await expect.element(page.getByText('Next milestone: Snacks at Level 4')).toBeVisible();
	});

	it('shows the milestone card with the Snacks unlock, capacity, and staffing changes (3 → 4)', async () => {
		expect.assertions(9);
		const level3Store: Store = { ...store, id: 'store-milestone', level: 3 };
		const richGame: GameState = {
			...defaultGame,
			cash: 100_000,
			stores: [level3Store]
		};

		renderInspector({ game: richGame, store: level3Store });

		await expect.element(page.getByTestId('upgrade-card')).toBeVisible();
		await expect.element(page.getByText(/Level 3 → 4/)).toBeVisible();
		await expect.element(page.getByText('Cost $24,000')).toBeVisible();
		await expect.element(page.getByText('Unlocks Snacks')).toBeVisible();
		const unlockImage = page.getByTestId('upgrade-unlock').getByRole('img');
		await expect.element(unlockImage).toHaveAttribute('src', getProductArt('snacks').path);
		await expect.element(unlockImage).toHaveAttribute('alt', 'Snacks');
		await expect.element(page.getByText('Staff capacity 70 → 78')).toBeVisible();
		await expect
			.element(page.getByText('Staffing 1 manager + 1 general → 1 manager + 2 general'))
			.toBeVisible();
		// Milestone levels are excluded from the revenue model — no increase is claimed.
		await expect.element(page.getByTestId('upgrade-revenue')).not.toBeInTheDocument();
	});

	it('localizes the milestone unlock image alt in Japanese', async () => {
		expect.assertions(1);
		const level3Store: Store = { ...store, id: 'store-milestone-ja', level: 3 };
		const richGame: GameState = {
			...defaultGame,
			cash: 100_000,
			stores: [level3Store]
		};

		renderInspector({ game: richGame, store: level3Store, i18n: createI18n('ja') });

		const unlockImage = page.getByTestId('upgrade-unlock').getByRole('img');
		await expect.element(unlockImage).toHaveAttribute('alt', 'スナック');
	});
});

describe('TileInspector upgrade acknowledgement', () => {
	const upgradableGame = (storeId: string, level: number): { game: GameState; store: Store } => ({
		game: { ...defaultGame, cash: 100_000, stores: [{ ...store, id: storeId, level }] },
		store: { ...store, id: storeId, level }
	});

	function renderUpgradable(
		overrides: Partial<{
			game: GameState;
			store: Store;
			onUpgradeStore: (storeId: string) => Promise<GameRouteCommitResult | null>;
			onOpenDetails: (productId: ProductId | null) => void;
		}> = {}
	) {
		const target = upgradableGame('store-ack', 2);
		return renderInspector({
			game: overrides.game ?? target.game,
			store: overrides.store ?? target.store,
			onUpgradeStore: overrides.onUpgradeStore,
			onOpenDetails: overrides.onOpenDetails
		});
	}

	it('allows one pending upgrade command, keeping the button disabled until it settles', async () => {
		expect.assertions(5);
		let resolveCommand: (result: GameRouteCommitResult | null) => void = () => {};
		const command = new Promise<GameRouteCommitResult | null>((resolve) => {
			resolveCommand = resolve;
		});
		const onUpgradeStore = vi.fn(() => command);
		renderUpgradable({ onUpgradeStore });

		const button = page.getByRole('button', { name: /Upgrade/i });
		await button.click();
		expect(onUpgradeStore).toHaveBeenCalledTimes(1);
		await expect.element(button).toBeDisabled();

		// A click while pending waits for the control to re-enable instead of
		// issuing a second command.
		const secondClick = button.click();
		expect(onUpgradeStore).toHaveBeenCalledTimes(1);
		resolveCommand({ status: 'committed' });
		await secondClick;
		expect(onUpgradeStore).toHaveBeenCalledTimes(2);
		await expect.element(button).toBeEnabled();
	});

	it('acknowledges a committed upgrade as a success without the stock handoff', async () => {
		expect.assertions(3);
		renderUpgradable({ onUpgradeStore: async () => ({ status: 'committed' }) });

		await page.getByRole('button', { name: /Upgrade/i }).click();

		const status = page.getByTestId('upgrade-status');
		await expect.element(status).toHaveTextContent('Upgrade complete.');
		await expect.element(status).not.toHaveTextContent('Upgrade was not applied.');
		await expect.element(page.getByTestId('upgrade-review-stock')).not.toBeInTheDocument();
	});

	it('offers the review-stock handoff for a milestone-unlock success', async () => {
		expect.assertions(5);
		const onOpenDetails = vi.fn();
		const milestone = upgradableGame('store-milestone-ack', 3);
		renderInspector({
			game: milestone.game,
			store: milestone.store,
			onUpgradeStore: async () => ({ status: 'committed' }),
			onOpenDetails
		});

		await page.getByRole('button', { name: /Upgrade/i }).click();

		await expect.element(page.getByTestId('upgrade-review-stock')).toBeVisible();
		const reviewCta = page.getByRole('button', { name: /Review Snacks stock & supply/ });
		await expect.element(reviewCta).toHaveTextContent('Snacks');
		await reviewCta.click();
		expect(onOpenDetails).toHaveBeenCalledTimes(1);
		// The milestone CTA deep-links the unlocked product row.
		expect(onOpenDetails).toHaveBeenCalledWith('snacks');
		await expect.element(page.getByTestId('upgrade-status')).toHaveTextContent('Upgrade complete.');
	});

	it.each([
		{ label: 'unchanged result', result: { status: 'unchanged' } as GameRouteCommitResult },
		{
			label: 'sandbox-committed result without change',
			result: { status: 'sandbox-committed', changed: false } as GameRouteCommitResult
		}
	])('stays neutral for a $label', async ({ result }) => {
		expect.assertions(3);
		renderUpgradable({ onUpgradeStore: async () => result });

		await page.getByRole('button', { name: /Upgrade/i }).click();

		const status = page.getByTestId('upgrade-status');
		await expect.element(status).toHaveTextContent('Level is already up to date.');
		await expect.element(status).not.toHaveTextContent('Upgrade complete.');
		await expect.element(page.getByText('Upgrade was not applied.')).not.toBeInTheDocument();
	});

	it.each([
		{ label: 'busy result', result: { status: 'busy' } as GameRouteCommitResult },
		{ label: 'failed result', result: { status: 'failed' } as GameRouteCommitResult },
		{ label: 'unavailable result', result: { status: 'unavailable' } as GameRouteCommitResult },
		{ label: 'rejected result', result: { status: 'rejected' } as GameRouteCommitResult },
		{ label: 'missing result', result: null }
	])('reports the upgrade as not applied for a $label', async ({ result }) => {
		expect.assertions(3);
		renderUpgradable({ onUpgradeStore: async () => result });

		await page.getByRole('button', { name: /Upgrade/i }).click();

		const status = page.getByTestId('upgrade-status');
		await expect.element(status).toHaveTextContent('Upgrade was not applied.');
		await expect.element(status).not.toHaveTextContent('Upgrade complete.');
		await expect.element(page.getByTestId('upgrade-review-stock')).not.toBeInTheDocument();
	});

	it('clears the acknowledgement when the store changes and never replays it', async () => {
		expect.assertions(3);
		const storeA = { ...store, id: 'store-switch-a', level: 2 };
		const storeB = { ...store, id: 'store-switch-b', level: 2 };
		const game: GameState = { ...defaultGame, cash: 100_000, stores: [storeA, storeB] };
		const baseProps = {
			game,
			tile,
			latestStoreReport: null,
			onUpgradeStore: async () => ({ status: 'committed' }) as GameRouteCommitResult,
			onOpenDetails: vi.fn(),
			onClose: vi.fn(),
			i18n: createI18n('en')
		};
		const instance = render(TileInspector, { ...baseProps, store: storeA });

		await page.getByRole('button', { name: /Upgrade/i }).click();
		await expect.element(page.getByTestId('upgrade-status')).toHaveTextContent('Upgrade complete.');

		instance.rerender({ ...baseProps, store: storeB });
		await expect.element(page.getByTestId('upgrade-status')).not.toBeInTheDocument();

		// Returning to the original store must not replay the retired status.
		instance.rerender({ ...baseProps, store: storeA });
		await expect.element(page.getByTestId('upgrade-status')).not.toBeInTheDocument();
	});

	it('rejects handler re-entry while the first command is still pending', async () => {
		expect.assertions(5);
		let resolveCommand: (result: GameRouteCommitResult | null) => void = () => {};
		const onUpgradeStore = vi.fn(
			() =>
				new Promise<GameRouteCommitResult | null>((resolve) => {
					resolveCommand = resolve;
				})
		);
		renderUpgradable({ onUpgradeStore });

		const button = page.getByRole('button', { name: /Upgrade/i });
		await expect.element(button).toBeEnabled();
		const buttonElement = button.element() as HTMLButtonElement;

		// A raw dispatched click provably reaches the handler: the first one
		// sets `upgradePending`, which disables the button.
		buttonElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await expect.element(button).toBeDisabled();
		expect(onUpgradeStore).toHaveBeenCalledTimes(1);

		// The same raw dispatch while pending must be rejected by the
		// handler-level guard, not only by the disabled attribute (dispatched
		// events bypass disabled-element suppression, and Svelte's delegation
		// still invokes `onclick` when `event.target` is the button itself).
		buttonElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await Promise.resolve();
		expect(onUpgradeStore).toHaveBeenCalledTimes(1);

		resolveCommand({ status: 'committed' });
		await expect.element(page.getByTestId('upgrade-status')).toHaveTextContent('Upgrade complete.');
	});

	it('clears the previous acknowledgement when a second upgrade attempt starts', async () => {
		expect.assertions(3);
		let resolveSecond: (result: GameRouteCommitResult | null) => void = () => {};
		const onUpgradeStore = vi
			.fn<() => Promise<GameRouteCommitResult | null>>()
			.mockResolvedValueOnce({ status: 'committed' })
			.mockImplementationOnce(
				() =>
					new Promise<GameRouteCommitResult | null>((resolve) => {
						resolveSecond = resolve;
					})
			);
		renderUpgradable({ onUpgradeStore });

		const button = page.getByRole('button', { name: /Upgrade/i });
		await button.click();
		await expect.element(page.getByTestId('upgrade-status')).toHaveTextContent('Upgrade complete.');

		// The retry's pending window must not show the first attempt's ack.
		await button.click();
		await expect.element(page.getByTestId('upgrade-status')).not.toBeInTheDocument();

		resolveSecond({ status: 'committed' });
		await expect.element(page.getByTestId('upgrade-status')).toHaveTextContent('Upgrade complete.');
	});

	it('reports a rejecting upgrade callback as not applied', async () => {
		expect.assertions(3);
		renderUpgradable({
			onUpgradeStore: vi.fn(async () => {
				throw new Error('network failure');
			})
		});

		const button = page.getByRole('button', { name: /Upgrade/i });
		await button.click();

		await expect
			.element(page.getByTestId('upgrade-status'))
			.toHaveTextContent('Upgrade was not applied.');
		await expect.element(button).toBeEnabled();
		await expect.element(page.getByTestId('upgrade-review-stock')).not.toBeInTheDocument();
	});

	it('drops a stale settled result when the store changed while the command was pending', async () => {
		expect.assertions(2);
		let resolveCommand: (result: GameRouteCommitResult | null) => void = () => {};
		const onUpgradeStore = vi.fn(
			() =>
				new Promise<GameRouteCommitResult | null>((resolve) => {
					resolveCommand = resolve;
				})
		);
		const storeA = { ...store, id: 'store-stale-a', level: 2 };
		const storeB = { ...store, id: 'store-stale-b', level: 2 };
		const game: GameState = { ...defaultGame, cash: 100_000, stores: [storeA, storeB] };
		const baseProps = {
			game,
			tile,
			latestStoreReport: null,
			onUpgradeStore,
			onOpenDetails: vi.fn(),
			onClose: vi.fn(),
			i18n: createI18n('en')
		};
		const instance = render(TileInspector, { ...baseProps, store: storeA });

		await page.getByRole('button', { name: /Upgrade/i }).click();
		instance.rerender({ ...baseProps, store: storeB });
		resolveCommand({ status: 'committed' });

		await expect.element(page.getByTestId('upgrade-status')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /Upgrade/i })).toBeEnabled();
	});
});

describe('TileInspector empty tile details', () => {
	it('shows tile stats without construction controls for an empty selected tile', async () => {
		renderInspector({ store: null });

		await expect.element(page.getByRole('heading', { name: 'Tile 1, 1' })).toBeVisible();
		await expect.element(page.getByText('Demand')).toBeVisible();
		await expect.element(page.getByText('$190')).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Store type' })).not.toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: /open .* here/i }))
			.not.toBeInTheDocument();
		await expect
			.element(page.getByRole('dialog', { name: 'Confirm store opening' }))
			.not.toBeInTheDocument();
	});

	it('shows road tile details without placement feedback or construction buttons', async () => {
		const roadTile: CityTile = { ...tile, feature: 'road' };

		renderInspector({ tile: roadTile });

		await expect.element(page.getByText('Road', { exact: true })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /Open Boutique Goods here/ }))
			.not.toBeInTheDocument();
		await expect.element(page.getByText('Road location')).not.toBeInTheDocument();
	});

	it('shows river tile details without placement feedback or construction buttons', async () => {
		const riverTile: CityTile = { ...tile, feature: 'river' };

		renderInspector({ tile: riverTile });

		await expect.element(page.getByText('River', { exact: true })).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: /Open Grocery Market here/ }))
			.not.toBeInTheDocument();
		await expect.element(page.getByText('River location')).not.toBeInTheDocument();
	});

	it('localizes road and river feature labels in Japanese', async () => {
		expect.assertions(2);
		const japanese = createI18n('ja');
		const roadTile: CityTile = { ...tile, feature: 'road' };

		renderInspector({ tile: roadTile, i18n: japanese });

		await expect.element(page.getByText('道路', { exact: true })).toBeVisible();
		await expect.element(page.getByText('Road', { exact: true })).not.toBeInTheDocument();
	});
});

describe('TileInspector null tile', () => {
	it('shows the select-tile prompt when no tile is selected', async () => {
		expect.assertions(2);
		renderInspector({ tile: null });

		await expect.element(page.getByRole('heading', { name: 'Select a city tile' })).toBeVisible();
		await expect.element(page.getByRole('heading', { name: 'Tile 1, 1' })).not.toBeInTheDocument();
	});
});

describe('TileInspector close button', () => {
	it('fires click feedback and close when the × button is pressed', async () => {
		expect.assertions(2);
		const onClickFeedback = vi.fn();
		const onClose = vi.fn();
		renderInspector({ onClickFeedback, onClose });

		await page.getByRole('button', { name: /close tile inspector/i }).click();
		expect(onClickFeedback).toHaveBeenCalledTimes(1);
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});

describe('TileInspector localization', () => {
	it('renders a localized fixed label outside English', async () => {
		expect.assertions(2);

		renderInspector({ tile: null, i18n: createI18n('ja') });

		await expect.element(page.getByRole('heading', { name: '都市タイルを選択' })).toBeVisible();
		await expect
			.element(page.getByRole('heading', { name: 'Select a city tile' }))
			.not.toBeInTheDocument();
	});
});

describe('TileInspector capability', () => {
	it('combines challenge permission with level and affordability guards', async () => {
		expect.assertions(4);
		const onUpgradeStore = vi.fn();
		const upgradeable = { ...store, level: 2 };
		renderInspector({
			game: { ...defaultGame, cash: 1_000_000, stores: [upgradeable] },
			store: upgradeable,
			onUpgradeStore,
			canUpgradeStore: false,
			disabledReason: 'Unavailable in this challenge.'
		});

		await expect.element(page.getByRole('button', { name: /upgrade/i })).toBeDisabled();
		await expect.element(page.getByText('Unavailable in this challenge.')).toBeVisible();
		expect(onUpgradeStore).not.toHaveBeenCalled();
		await expect.element(page.getByTestId('upgrade-card')).toBeVisible();
	});
});
