import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StoreStockTable from './StoreStockTable.svelte';
import { getProductArt } from '$lib/assets/gameArt';
import { getSupportedBrands } from '$lib/game/brands';
import { getProductDefinition } from '$lib/game/products';
import { createNewGame } from '$lib/game/state';
import { initializeStoreProducts } from '$lib/game/stock';
import { buildStoreStockRecoveryViews } from '$lib/game/stockRecovery';
import type { StockRecoveryView } from '$lib/game/stockRecovery';
import { createI18n } from '$lib/i18n';
import type { GameRouteCommitResult } from '$lib/game/commandResult';
import type {
	DailyProductReport,
	DailyReport,
	DailyStoreReport,
	GameState,
	ProductId,
	Store,
	StoreProduct
} from '$lib/game/types';

const store: Store = {
	id: 'store-1',
	level: 1,
	name: 'Founding Store',
	archetypeId: 'convenience',
	location: { neighborhoodId: 'downtown', x: 1, y: 1 },
	cityId: 'harbor-city',
	tileId: 'harbor-city-1-1',
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

const latestReport: DailyStoreReport = {
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

function productWithStock(
	productId: ProductId,
	quantity = 10,
	receivedDay = 1,
	overrides: Partial<StoreProduct> = {}
): StoreProduct {
	const definition = getProductDefinition(productId);
	return {
		productId,
		brandId: 'common-ground',
		lots: [{ receivedDay, quantity }],
		reorderThreshold: 4,
		targetStock: 16,
		sellingPrice: definition.defaultSellingPrice,
		...overrides
	};
}

function productReport(
	productId: ProductId,
	overrides: Partial<DailyProductReport> = {}
): DailyProductReport {
	const definition = getProductDefinition(productId);
	return {
		productId,
		brandId: 'common-ground',
		name: definition.name,
		unitsSold: 0,
		demandMissed: 0,
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		endingStock: 10,
		warehouseUnits: 0,
		warehouseValue: 0,
		importedUnits: 0,
		importCost: definition.importCost,
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
		baseSellingPrice: definition.defaultSellingPrice,
		effectiveSellingPrice: definition.defaultSellingPrice,
		markdownAmount: 0,
		...overrides
	};
}

describe('StoreStockTable', () => {
	it('renders product stock rows with fixed cost and latest report demand', async () => {
		expect.assertions(13);

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store,
			ordinal: 1,
			latestReport,
			onUpdate: vi.fn()
		});

		await expect.element(page.getByRole('heading', { name: 'Founding Store stock' })).toBeVisible();
		await expect.element(page.getByRole('cell', { name: 'Bottled Water' })).toBeVisible();
		const bottledWaterArt = getProductArt('bottled-water');

		const image = page.getByTestId('product-art-bottled-water');
		await expect.element(image).toBeVisible();
		await expect.element(image).toHaveAttribute('src', bottledWaterArt.path);
		await expect.element(page.getByRole('cell', { name: '$2', exact: true })).toBeVisible();
		await expect.element(page.getByText('12 sold / 2 missed')).toBeVisible();
		await expect
			.element(page.getByRole('spinbutton', { name: 'Selling price for Bottled Water' }))
			.toBeVisible();
		await expect
			.element(page.getByRole('spinbutton', { name: 'Reorder threshold for Bottled Water' }))
			.toBeVisible();
		await expect
			.element(page.getByRole('spinbutton', { name: 'Target stock for Bottled Water' }))
			.toBeVisible();
		await expect
			.element(page.getByRole('combobox', { name: 'Brand for Bottled Water' }))
			.toHaveValue('common-ground');
		await expect.element(page.getByTestId('shelf-price-bottled-water')).toHaveTextContent('$5');
		await expect.element(page.getByTestId('effective-price-bottled-water')).toHaveTextContent('$5');
		await expect.element(page.getByTestId('gross-margin-bottled-water')).toHaveTextContent('$24');
	});

	it('sends an explicit brand update without changing the shelf-price callback', async () => {
		expect.assertions(3);
		const onUpdate = vi.fn();
		const onUpdateBrand = vi.fn();

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store,
			ordinal: 1,
			latestReport,
			onUpdate,
			onUpdateBrand
		});

		const brand = page.getByRole('combobox', { name: 'Brand for Bottled Water' });
		await brand.selectOptions('budget-bay');

		expect(onUpdateBrand).toHaveBeenCalledTimes(1);
		expect(onUpdateBrand).toHaveBeenCalledWith('store-1', 'bottled-water', 'budget-bay');
		expect(onUpdate).not.toHaveBeenCalled();
	});

	it('offers exactly the compatible family brands and excludes incompatible brands', async () => {
		expect.assertions(2);
		const snacksStore: Store = {
			...store,
			products: [productWithStock('snacks')]
		};

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store: snacksStore,
			ordinal: 1,
			latestReport: null,
			onUpdate: vi.fn()
		});

		const selector = page.getByRole('combobox', { name: 'Brand for Snacks' });
		const optionIds = Array.from(selector.element().querySelectorAll('option')).map(
			(option) => option.value
		);
		expect(optionIds).toEqual(getSupportedBrands('snacks').map((brand) => brand.id));
		expect(optionIds).not.toContain('northstar-select');
	});

	it('keeps the brand selector disabled independently in scenario mode', async () => {
		expect.assertions(2);

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store,
			ordinal: 1,
			latestReport,
			onUpdate: vi.fn(),
			onUpdateBrand: vi.fn(),
			canUpdateBrand: false,
			disabledReason: 'Brand changes are unavailable in this challenge.'
		});

		await expect
			.element(page.getByRole('combobox', { name: 'Brand for Bottled Water' }))
			.toBeDisabled();
		await expect
			.element(page.getByText('Brand changes are unavailable in this challenge.'))
			.toBeVisible();
	});

	it('sends one numeric selling price update for the edited product', async () => {
		expect.assertions(2);
		const onUpdate = vi.fn();

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store,
			ordinal: 1,
			latestReport,
			onUpdate
		});

		const sellingPrice = page.getByRole('spinbutton', { name: 'Selling price for Bottled Water' });
		await sellingPrice.fill('7');
		await page.getByRole('cell', { name: 'Bottled Water' }).click();

		expect(onUpdate).toHaveBeenCalledTimes(1);
		expect(onUpdate).toHaveBeenCalledWith('store-1', 'bottled-water', { sellingPrice: 7 });
	});

	it('does not send an update for invalid numeric input', async () => {
		expect.assertions(1);
		const onUpdate = vi.fn();

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store,
			ordinal: 1,
			latestReport,
			onUpdate
		});

		const sellingPrice = page.getByRole('spinbutton', { name: 'Selling price for Bottled Water' });
		await sellingPrice.fill('');
		await page.getByRole('cell', { name: 'Bottled Water' }).click();

		expect(onUpdate).not.toHaveBeenCalled();
	});

	it('falls back to the category id, zero import cost, and No report for unknown categories', async () => {
		expect.assertions(3);

		const storeWithUnknownProduct: Store = {
			...store,
			products: [
				...store.products,
				{
					productId: 'apparel',
					brandId: 'common-ground',
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 4,
					targetStock: 16,
					sellingPrice: 9
				}
			]
		};

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store: storeWithUnknownProduct,
			ordinal: 1,
			latestReport,
			onUpdate: vi.fn()
		});

		await expect.element(page.getByRole('cell', { name: 'apparel' })).toBeVisible();
		await expect.element(page.getByRole('cell', { name: '$0' })).toBeVisible();
		await expect.element(page.getByText('No report')).toBeVisible();
	});

	it('renders Traditional Chinese stock table headings', async () => {
		expect.assertions(1);

		render(StoreStockTable, {
			i18n: createI18n('zh-Hant'),
			store,
			ordinal: 1,
			latestReport,
			onUpdate: vi.fn()
		});

		await expect.element(page.getByRole('columnheader', { name: '商品' })).toBeVisible();
	});

	it('sends a target stock update for the edited product', async () => {
		expect.assertions(2);
		const onUpdate = vi.fn();

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store,
			ordinal: 1,
			latestReport,
			onUpdate
		});

		const targetStock = page.getByRole('spinbutton', { name: 'Target stock for Bottled Water' });
		await targetStock.fill('120');
		await page.getByRole('cell', { name: 'Bottled Water' }).click();

		expect(onUpdate).toHaveBeenCalledTimes(1);
		expect(onUpdate).toHaveBeenCalledWith('store-1', 'bottled-water', { targetStock: 120 });
	});

	it('sends a reorder threshold update for the edited product', async () => {
		expect.assertions(2);
		const onUpdate = vi.fn();

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store,
			ordinal: 1,
			latestReport,
			onUpdate
		});

		const reorderThreshold = page.getByRole('spinbutton', {
			name: 'Reorder threshold for Bottled Water'
		});
		await reorderThreshold.fill('8');
		await page.getByRole('cell', { name: 'Bottled Water' }).click();

		expect(onUpdate).toHaveBeenCalledTimes(1);
		expect(onUpdate).toHaveBeenCalledWith('store-1', 'bottled-water', { reorderThreshold: 8 });
	});

	it('disables price separately from inventory targets and preserves change-only callbacks', async () => {
		expect.assertions(5);
		const onUpdate = vi.fn();
		render(StoreStockTable, {
			i18n: createI18n('en'),
			store,
			ordinal: 1,
			latestReport,
			onUpdate,
			canUpdateSellingPrice: true,
			canUpdateInventoryTargets: false,
			disabledReason: 'Unavailable in this challenge.'
		});

		const sellingPrice = page.getByRole('spinbutton', { name: 'Selling price for Bottled Water' });
		await expect.element(sellingPrice).not.toBeDisabled();
		await expect
			.element(page.getByRole('spinbutton', { name: 'Reorder threshold for Bottled Water' }))
			.toBeDisabled();
		await expect
			.element(page.getByRole('spinbutton', { name: 'Target stock for Bottled Water' }))
			.toBeDisabled();
		await expect.element(page.getByText('Unavailable in this challenge.')).toBeVisible();
		await sellingPrice.fill('8');
		await page.getByRole('cell', { name: 'Bottled Water' }).click();
		expect(onUpdate).toHaveBeenCalledWith('store-1', 'bottled-water', { sellingPrice: 8 });
	});

	it('does not show the disabled reason when every mutation is still permitted', async () => {
		expect.assertions(2);

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store,
			ordinal: 1,
			latestReport,
			onUpdate: vi.fn(),
			canUpdateSellingPrice: true,
			canUpdateInventoryTargets: true,
			disabledReason: 'Unavailable in this challenge.'
		});

		expect(document.querySelector('.disabled-copy')).toBeNull();
		await expect
			.element(page.getByRole('spinbutton', { name: 'Selling price for Bottled Water' }))
			.toBeEnabled();
	});

	it('shows the disabled reason when the store carries a disallowed product category', async () => {
		expect.assertions(2);

		const storeWithDisallowed: Store = {
			...store,
			products: [
				...store.products,
				{
					productId: 'apparel',
					brandId: 'common-ground',
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 4,
					targetStock: 16,
					sellingPrice: 9
				}
			]
		};

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store: storeWithDisallowed,
			ordinal: 1,
			latestReport,
			onUpdate: vi.fn(),
			canUpdateSellingPrice: true,
			canUpdateInventoryTargets: true,
			allowedProductIds: ['bottled-water'],
			disabledReason: 'This category is locked.'
		});

		await expect.element(page.getByText('This category is locked.')).toBeVisible();
		await expect.element(page.getByRole('cell', { name: 'apparel' })).toBeVisible();
	});

	it('derives historical freshness and keeps one waste pressure label per product', async () => {
		expect.assertions(5);
		const produce = productWithStock('produce');
		const report: DailyStoreReport = {
			...latestReport,
			productReports: [
				productReport('produce', {
					wasteUnits: 2,
					wasteValue: 4,
					averageAgeDays: 4,
					endingStock: 10
				})
			]
		};

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store: { ...store, products: [produce] },
			ordinal: 1,
			latestReport: report,
			onUpdate: vi.fn()
		});

		await expect
			.element(page.getByRole('columnheader', { name: 'Configured price' }))
			.toBeVisible();
		await expect.element(page.getByTestId('derived-stock-produce')).toHaveTextContent('10');
		await expect.element(page.getByTestId('freshness-produce')).toHaveTextContent('Freshness: 60%');
		await expect
			.element(page.getByTestId('product-pressure-produce'))
			.toHaveTextContent('Waste: 2 units');
		expect(document.querySelectorAll('[data-testid="product-pressure-produce"]')).toHaveLength(1);
	});

	it('shows stockout loss as the single pressure label for an otherwise neutral product', async () => {
		expect.assertions(3);
		const bottledWater = productWithStock('bottled-water', 2);
		const report: DailyStoreReport = {
			...latestReport,
			productReports: [productReport('bottled-water', { stockoutLostDemand: 4, endingStock: 0 })]
		};

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store: { ...store, products: [bottledWater] },
			ordinal: 1,
			latestReport: report,
			onUpdate: vi.fn()
		});

		await expect
			.element(page.getByTestId('product-pressure-bottled-water'))
			.toHaveTextContent('Stockout loss: 4 units');
		await expect.element(page.getByTestId('stockout-loss-bottled-water')).toHaveTextContent('4');
		await expect.element(page.getByTestId('derived-stock-bottled-water')).toHaveTextContent('2');
	});

	it('keeps a neutral product visibly non-alarming when no pressure evidence exists', async () => {
		expect.assertions(3);
		const snacks = productWithStock('snacks');
		const report: DailyStoreReport = {
			...latestReport,
			productReports: [productReport('snacks')]
		};

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store: { ...store, products: [snacks] },
			ordinal: 1,
			latestReport: report,
			onUpdate: vi.fn()
		});

		await expect
			.element(page.getByTestId('product-pressure-snacks'))
			.toHaveTextContent('No current pressure');
		await expect
			.element(page.getByTestId('product-pressure-snacks'))
			.toHaveAttribute('data-pressure-kind', 'neutral');
		await expect
			.element(page.getByTestId('product-pressure-snacks'))
			.not.toHaveAttribute('role', 'alert');
	});

	it('surfaces live stock pressure without inventing report loss evidence', async () => {
		expect.assertions(6);
		const outOfStock = productWithStock('bottled-water', 1, 1, { lots: [] });
		const needsImport = productWithStock('snacks', 2);

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store: { ...store, products: [outOfStock, needsImport] },
			ordinal: 1,
			latestReport: { ...latestReport, productReports: [] },
			onUpdate: vi.fn()
		});

		await expect
			.element(page.getByTestId('product-pressure-bottled-water'))
			.toHaveTextContent('Out of stock now');
		await expect
			.element(page.getByTestId('product-pressure-bottled-water'))
			.toHaveAttribute('data-pressure-kind', 'live-stockout');
		await expect
			.element(page.getByTestId('product-pressure-bottled-water'))
			.not.toHaveTextContent('Stockout loss');
		await expect
			.element(page.getByTestId('product-pressure-snacks'))
			.toHaveTextContent('Needs import now');
		await expect
			.element(page.getByTestId('product-pressure-snacks'))
			.toHaveAttribute('data-pressure-kind', 'live-reorder');
		await expect
			.element(page.getByTestId('product-pressure-snacks'))
			.not.toHaveTextContent('No current pressure');
	});

	it('labels shrink pressure and renders the shrink evidence span', async () => {
		expect.assertions(3);
		const produce = productWithStock('produce');
		const report: DailyStoreReport = {
			...latestReport,
			productReports: [
				productReport('produce', { shrinkUnits: 3, shrinkValue: 6, endingStock: 10 })
			]
		};

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store: { ...store, products: [produce] },
			ordinal: 1,
			latestReport: report,
			onUpdate: vi.fn()
		});

		await expect
			.element(page.getByTestId('product-pressure-produce'))
			.toHaveAttribute('data-pressure-kind', 'shrink');
		await expect
			.element(page.getByTestId('product-pressure-produce'))
			.toHaveTextContent('Shrink: 3 units');
		await expect.element(page.getByText('Shrink: 3 units').nth(1)).toBeVisible();
	});

	it('labels obsolescence pressure when demand is reduced without other pressure', async () => {
		expect.assertions(2);
		const produce = productWithStock('produce');
		const report: DailyStoreReport = {
			...latestReport,
			productReports: [productReport('produce', { obsolescenceMultiplier: 0.8, endingStock: 10 })]
		};

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store: { ...store, products: [produce] },
			ordinal: 1,
			latestReport: report,
			onUpdate: vi.fn()
		});

		await expect
			.element(page.getByTestId('product-pressure-produce'))
			.toHaveAttribute('data-pressure-kind', 'obsolescence');
		await expect
			.element(page.getByTestId('product-pressure-produce'))
			.toHaveTextContent('Obsolescence: 80% demand');
	});

	it('labels freshness pressure for an aged perishable product with no other pressure', async () => {
		expect.assertions(2);
		const produce = productWithStock('produce');
		const report: DailyStoreReport = {
			...latestReport,
			productReports: [
				productReport('produce', { averageAgeDays: 4, oldestSellableAgeDays: 6, endingStock: 10 })
			]
		};

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store: { ...store, products: [produce] },
			ordinal: 1,
			latestReport: report,
			onUpdate: vi.fn()
		});

		await expect
			.element(page.getByTestId('product-pressure-produce'))
			.toHaveAttribute('data-pressure-kind', 'freshness');
		await expect
			.element(page.getByTestId('product-pressure-produce'))
			.toHaveTextContent('Freshness: 60%');
	});

	it('labels markdown pressure when a markdown amount is present without other pressure', async () => {
		expect.assertions(3);
		const produce = productWithStock('produce');
		const report: DailyStoreReport = {
			...latestReport,
			productReports: [
				productReport('produce', {
					markdownAmount: 5,
					stockoutLostDemand: 0,
					wasteUnits: 0,
					shrinkUnits: 0,
					obsolescenceMultiplier: 1,
					averageAgeDays: null,
					oldestSellableAgeDays: null,
					endingStock: 10
				})
			]
		};

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store: { ...store, products: [produce] },
			ordinal: 1,
			latestReport: report,
			onUpdate: vi.fn()
		});

		await expect
			.element(page.getByTestId('product-pressure-produce'))
			.toHaveAttribute('data-pressure-kind', 'markdown');
		await expect
			.element(page.getByTestId('product-pressure-produce'))
			.toHaveTextContent('Markdown: $5');
		await expect.element(page.getByText('Markdown: $5').nth(1)).toBeVisible();
	});

	it('moves focus once to the new matching row when the focus request changes', async () => {
		expect.assertions(3);
		const waterAndSnacks: Store = {
			...store,
			products: [productWithStock('bottled-water'), productWithStock('snacks')]
		};
		const focusedRows: string[] = [];
		const onFocusin = (event: Event): void => {
			const row = (event.target as HTMLElement).closest('tr');
			if (row?.id.startsWith(`${store.id}-stock-row-`)) {
				focusedRows.push(row.id);
			}
		};
		document.addEventListener('focusin', onFocusin);

		const { rerender } = render(StoreStockTable, {
			i18n: createI18n('en'),
			store: waterAndSnacks,
			ordinal: 1,
			latestReport,
			onUpdate: vi.fn(),
			focusedProductId: 'bottled-water'
		});

		const waterRow = page.getByTestId('store-product-row-bottled-water');
		await expect.poll(() => document.activeElement).toBe(waterRow.element());

		rerender({
			i18n: createI18n('en'),
			store: waterAndSnacks,
			ordinal: 1,
			latestReport,
			onUpdate: vi.fn(),
			focusedProductId: 'snacks'
		});

		const snacksRow = page.getByTestId('store-product-row-snacks');
		await expect.poll(() => document.activeElement).toBe(snacksRow.element());
		expect(focusedRows).toEqual([
			`${store.id}-stock-row-bottled-water`,
			`${store.id}-stock-row-snacks`
		]);
		document.removeEventListener('focusin', onFocusin);
	});

	it('does not focus any row for an unmatched product focus request', async () => {
		expect.assertions(2);
		const waterAndSnacks: Store = {
			...store,
			products: [productWithStock('bottled-water'), productWithStock('snacks')]
		};

		render(StoreStockTable, {
			i18n: createI18n('en'),
			store: waterAndSnacks,
			ordinal: 1,
			latestReport,
			onUpdate: vi.fn(),
			focusedProductId: 'apparel'
		});

		expect(document.querySelectorAll('tbody tr')).toHaveLength(2);
		await expect
			.poll(() => document.activeElement?.id.startsWith(`${store.id}-stock-row-`) ?? false)
			.toBe(false);
	});
});

describe('StoreStockTable recovery context', () => {
	const unhealthyStore: Store = {
		...store,
		products: [productWithStock('bottled-water', 0)]
	};

	function stockTableGame(storeFixture: Store, overrides: Partial<GameState> = {}): GameState {
		const base = createNewGame('convenience', 292_601);
		return { ...base, stores: [{ ...base.stores[0]!, ...storeFixture }], ...overrides };
	}

	function receiptReport(
		day: number,
		storeId: string,
		productId: ProductId,
		warehouseUnits: number,
		importedUnits: number
	): DailyReport {
		return {
			day,
			storeReports: [
				{
					storeId,
					productReports: [{ productId, warehouseUnits, importedUnits }],
					replenishment: {
						retailCityId: 'harbor-city',
						configuredSupplyCityId: 'industry-city',
						resolvedSupplyCityId: 'industry-city'
					}
				}
			]
		} as unknown as DailyReport;
	}

	function renderWithRecovery(storeFixture: Store, extra: Record<string, unknown> = {}) {
		return render(StoreStockTable, {
			i18n: createI18n('en'),
			store: storeFixture,
			ordinal: 1,
			latestReport: { ...latestReport, productReports: [] },
			onUpdate: vi.fn(),
			recoveryViews: buildStoreStockRecoveryViews(stockTableGame(storeFixture), 'store-1'),
			plannerProductIds: ['bottled-water', 'snacks', 'soft-drinks', 'essentials'],
			onManageSupplySource: vi.fn(),
			onPlanSupply: vi.fn(),
			...extra
		});
	}

	it('shows supply, timing, and eligibility context for a focused unhealthy row without duplicating table columns', async () => {
		expect.assertions(9);
		const mixedStore: Store = {
			...store,
			products: [productWithStock('bottled-water', 0), productWithStock('snacks', 20)]
		};
		renderWithRecovery(mixedStore, { focusedProductId: 'bottled-water' });

		const detail = page.getByTestId('store-recovery-bottled-water');
		await expect.element(detail).toBeVisible();
		await expect.element(detail).toHaveTextContent('Supply city: Industry City');
		await expect.element(detail).toHaveTextContent('Imports cover shortages');
		await expect.element(detail).toHaveTextContent('Next check: closing day 7');
		await expect.element(detail).toHaveTextContent('not a guaranteed delivery');
		await expect.element(detail).toHaveTextContent('below the reorder threshold');

		// The context lives in a detail row: no duplicated headings or inputs.
		expect(document.querySelectorAll('thead th')).toHaveLength(9);
		expect(
			page.getByRole('spinbutton', { name: 'Reorder threshold for Bottled Water' }).elements()
		).toHaveLength(1);

		// A healthy, unfocused product gets no recovery detail row.
		expect(document.querySelector('[data-testid="store-recovery-snacks"]')).toBeNull();
	});

	it('points the zero-threshold explanation at the existing reorder input in the row', async () => {
		expect.assertions(3);
		const zeroThresholdStore: Store = {
			...store,
			products: [productWithStock('bottled-water', 0, 1, { reorderThreshold: 0 })]
		};
		renderWithRecovery(zeroThresholdStore, { focusedProductId: 'bottled-water' });

		const detail = page.getByTestId('store-recovery-bottled-water');
		await expect.element(detail).toHaveTextContent('reorder threshold is 0');
		await expect.element(detail).toHaveTextContent('reorder input in this row');
		await expect
			.element(page.getByRole('spinbutton', { name: 'Reorder threshold for Bottled Water' }))
			.toBeEnabled();
	});

	it('says import fallback covers shortages when no supply city is assigned', async () => {
		expect.assertions(1);
		renderWithRecovery(unhealthyStore, {
			focusedProductId: 'bottled-water',
			recoveryViews: buildStoreStockRecoveryViews(
				stockTableGame(unhealthyStore, { retailSupplyAssignments: [] }),
				'store-1'
			)
		});

		await expect
			.element(page.getByTestId('store-recovery-bottled-water'))
			.toHaveTextContent('No supply city is assigned');
	});

	it.each([
		{
			outcome: 'city-inventory',
			warehouseUnits: 3,
			importedUnits: 0,
			expected: 'restocked from city inventory'
		},
		{
			outcome: 'mixed',
			warehouseUnits: 4,
			importedUnits: 2,
			expected: 'restocked from city inventory and imports'
		},
		{
			outcome: 'import-only',
			warehouseUnits: 0,
			importedUnits: 5,
			expected: 'restocked by imports'
		}
	])(
		'labels a historical $outcome receipt with day and quantities',
		async ({ warehouseUnits, importedUnits, expected }) => {
			expect.assertions(5);
			const game = stockTableGame(unhealthyStore);
			game.reports = [
				...game.reports,
				receiptReport(3, 'store-1', 'bottled-water', warehouseUnits, importedUnits)
			];
			render(StoreStockTable, {
				i18n: createI18n('en'),
				store: unhealthyStore,
				ordinal: 1,
				latestReport: { ...latestReport, productReports: [] },
				onUpdate: vi.fn(),
				recoveryViews: buildStoreStockRecoveryViews(game, 'store-1'),
				plannerProductIds: ['bottled-water'],
				focusedProductId: 'bottled-water'
			});

			const evidence = page.getByTestId('receipt-evidence-bottled-water');
			await expect.element(evidence).toHaveTextContent('day 3');
			await expect.element(evidence).toHaveTextContent(`${warehouseUnits} units`);
			await expect.element(evidence).toHaveTextContent(`${importedUnits} units imported`);
			await expect.element(evidence).toHaveTextContent(expected);
			// The receipt is explicitly historical; it never vouches for today.
			await expect.element(evidence).toHaveTextContent('past record');
		}
	);

	it('acknowledges a committed inventory change with stored values and leaves shelf stock untouched', async () => {
		expect.assertions(5);
		let resolveUpdate: (result: GameRouteCommitResult) => void = () => {};
		const onUpdate = vi.fn(
			() =>
				new Promise<GameRouteCommitResult>((resolve) => {
					resolveUpdate = resolve;
				})
		);
		const props = {
			i18n: createI18n('en'),
			store: unhealthyStore,
			ordinal: 1,
			latestReport: { ...latestReport, productReports: [] },
			onUpdate,
			recoveryViews: buildStoreStockRecoveryViews(stockTableGame(unhealthyStore), 'store-1'),
			plannerProductIds: ['bottled-water'] as readonly ProductId[],
			focusedProductId: 'bottled-water' as ProductId | null
		};
		const instance = render(StoreStockTable, props);

		const reorder = page.getByRole('spinbutton', { name: 'Reorder threshold for Bottled Water' });
		await reorder.fill('8');
		await page.getByRole('cell', { name: 'Bottled Water' }).click();
		expect(onUpdate).toHaveBeenCalledTimes(1);

		// The route committed and normalized the stored state before resolving.
		const updatedStore: Store = {
			...unhealthyStore,
			products: [{ ...unhealthyStore.products[0]!, reorderThreshold: 8 }]
		};
		instance.rerender({
			...props,
			store: updatedStore,
			recoveryViews: buildStoreStockRecoveryViews(stockTableGame(updatedStore), 'store-1')
		});
		resolveUpdate({ status: 'committed' });

		const status = page.getByTestId('inventory-status-bottled-water');
		await expect.element(status).toHaveTextContent('Saved: reorder 8, target 16');
		await expect.element(status).toHaveTextContent('Next check: closing day 7 after sales');
		// The edit itself never moves shelf stock.
		await expect.element(page.getByTestId('derived-stock-bottled-water')).toHaveTextContent('0');
		await expect.element(status).not.toHaveTextContent('restocked');
	});

	it.each([
		{ label: 'unchanged result', result: { status: 'unchanged' } as GameRouteCommitResult },
		{
			label: 'sandbox-committed result without change',
			result: { status: 'sandbox-committed', changed: false } as GameRouteCommitResult
		}
	])('gives neutral no-change text for a $label', async ({ result }) => {
		expect.assertions(3);
		const onUpdate = vi.fn(async () => result);
		renderWithRecovery(unhealthyStore, { onUpdate, focusedProductId: 'bottled-water' });

		const reorder = page.getByRole('spinbutton', { name: 'Reorder threshold for Bottled Water' });
		await reorder.fill('8');
		await page.getByRole('cell', { name: 'Bottled Water' }).click();

		const status = page.getByTestId('inventory-status-bottled-water');
		await expect.element(status).toHaveTextContent('No settings changed: reorder 4, target 16');
		await expect.element(status).not.toHaveTextContent('Saved:');
		// A no-change result still restores the control to the stored value.
		expect((reorder.element() as HTMLInputElement).value).toBe('4');
	});

	it('quotes a fractional stored reorder threshold without rounding in the acknowledgement', async () => {
		expect.assertions(2);
		const decimalStore: Store = {
			...unhealthyStore,
			products: [{ ...unhealthyStore.products[0]!, reorderThreshold: 12.5 }]
		};
		const onUpdate = vi.fn(async () => ({ status: 'committed' }) as GameRouteCommitResult);
		renderWithRecovery(decimalStore, { onUpdate, recoveryViews: new Map() });

		const reorder = page.getByRole('spinbutton', { name: 'Reorder threshold for Bottled Water' });
		await reorder.fill('13');
		await page.getByRole('cell', { name: 'Bottled Water' }).click();

		const status = page.getByTestId('inventory-status-bottled-water');
		await expect.element(status).toHaveTextContent('Saved: reorder 12.5');
		await expect.element(status).not.toHaveTextContent('reorder 13');
	});

	it.each([
		['failed', { status: 'failed' }],
		['busy', { status: 'busy' }],
		['rejected', { status: 'rejected' }],
		['unavailable', { status: 'unavailable' }],
		['null', null],
		['undefined', undefined]
	] as const)('never claims success for a %s inventory-update result', async (_label, result) => {
		expect.assertions(3);
		const onUpdate = vi.fn(async () => result as GameRouteCommitResult | null);
		renderWithRecovery(unhealthyStore, { onUpdate, focusedProductId: 'bottled-water' });

		const reorder = page
			.getByRole('spinbutton', { name: 'Reorder threshold for Bottled Water' })
			.element() as HTMLInputElement;
		reorder.value = '8';
		reorder.dispatchEvent(new Event('change', { bubbles: true }));

		const status = page.getByTestId('inventory-status-bottled-water');
		await expect.element(status).toHaveTextContent('Inventory settings were not saved.');
		await expect.element(status).not.toHaveTextContent('Saved:');
		// A non-committed edit restores the control to the stored value.
		expect(reorder.value).toBe('4');
	});

	it('hands off to manage-supply-source with the current retail city and to the planner with the product', async () => {
		expect.assertions(2);
		const onManageSupplySource = vi.fn();
		const onPlanSupply = vi.fn();
		renderWithRecovery(unhealthyStore, {
			onManageSupplySource,
			onPlanSupply
		});

		await page.getByRole('button', { name: 'Manage supply source' }).click();
		await page.getByRole('button', { name: 'Plan supply' }).click();

		expect(onManageSupplySource).toHaveBeenCalledWith('harbor-city');
		expect(onPlanSupply).toHaveBeenCalledWith('bottled-water');
	});

	it('disables the planner handoff for products outside the planner list', async () => {
		expect.assertions(2);
		renderWithRecovery(unhealthyStore, {
			focusedProductId: 'bottled-water',
			plannerProductIds: ['snacks']
		});

		await expect.element(page.getByRole('button', { name: 'Plan supply' })).toBeDisabled();
		await expect.element(page.getByRole('button', { name: 'Manage supply source' })).toBeEnabled();
	});

	it('renders no recovery detail at all for the defensive not-replenishable state', async () => {
		expect.assertions(4);
		const apparelStore: Store = {
			...store,
			products: [productWithStock('apparel', 2)]
		};
		renderWithRecovery(apparelStore, { focusedProductId: 'apparel' });

		// The read-model/test-only state has no player copy and no handoff
		// chrome: no eligibility line, no receipt, no actions.
		expect(document.querySelector('[data-testid="store-recovery-apparel"]')).toBeNull();
		expect(document.querySelector('[data-testid="recovery-eligibility-apparel"]')).toBeNull();
		expect(page.getByRole('button', { name: 'Manage supply source' }).elements()).toHaveLength(0);
		expect(page.getByRole('button', { name: 'Plan supply' }).elements()).toHaveLength(0);
	});

	it('keeps recovery actions and context inside the existing table scroll surface', async () => {
		expect.assertions(3);
		renderWithRecovery(unhealthyStore, { focusedProductId: 'bottled-water' });

		expect(
			document.querySelector('.table-scroll [data-testid="store-recovery-bottled-water"]')
		).not.toBeNull();
		expect(
			document.querySelector('.table-scroll [data-testid="store-recovery-actions-bottled-water"]')
		).not.toBeNull();
		// No secondary modal is introduced for the recovery context.
		expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(0);
	});

	it('names the configured supply city as unavailable when it cannot serve the store', async () => {
		expect.assertions(2);
		const unavailableSourceGame = stockTableGame(unhealthyStore, {
			retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: 'breadbasket-basin' }]
		});
		renderWithRecovery(unhealthyStore, {
			focusedProductId: 'bottled-water',
			recoveryViews: buildStoreStockRecoveryViews(unavailableSourceGame, 'store-1')
		});

		const detail = page.getByTestId('store-recovery-bottled-water');
		await expect
			.element(detail)
			.toHaveTextContent('Assigned supply city Breadbasket Basin is unavailable');
		await expect.element(detail).toHaveTextContent('imports cover shortages');
	});

	it('still renders recovery context when a supplied view carries no configured city', async () => {
		expect.assertions(1);
		// A hand-built view may not satisfy the read-model invariant that a
		// non-unassigned mode implies a configured city; the row must not break.
		const inconsistentView: StockRecoveryView = {
			eligibility: 'eligible-at-current-stock',
			nextCheckDay: 7,
			supplyContext: {
				retailCityId: 'harbor-city',
				configuredSupplyCityId: null,
				resolvedSupplyCityId: null
			},
			supplyMode: 'unavailable-source-import-fallback',
			lastReceipt: null
		};
		renderWithRecovery(unhealthyStore, {
			focusedProductId: 'bottled-water',
			recoveryViews: new Map([['bottled-water', inconsistentView]])
		});

		await expect
			.element(page.getByTestId('store-recovery-bottled-water'))
			.toHaveTextContent('is unavailable; imports cover shortages');
	});

	it('acknowledges a committed change without a next-check suffix when no recovery view exists', async () => {
		expect.assertions(2);
		const onUpdate = vi.fn(async () => ({ status: 'committed' }) as GameRouteCommitResult);
		renderWithRecovery(unhealthyStore, { onUpdate, recoveryViews: new Map() });

		const reorder = page.getByRole('spinbutton', { name: 'Reorder threshold for Bottled Water' });
		await reorder.fill('8');
		await page.getByRole('cell', { name: 'Bottled Water' }).click();

		const status = page.getByTestId('inventory-status-bottled-water');
		await expect.element(status).toHaveTextContent('Saved: reorder 4, target 16');
		await expect.element(status).not.toHaveTextContent('Next check');
	});

	it('renders no status row when the product leaves the store before the commit resolves', async () => {
		expect.assertions(2);
		let resolveUpdate: (result: GameRouteCommitResult) => void = () => {};
		const onUpdate = vi.fn(
			() =>
				new Promise<GameRouteCommitResult>((resolve) => {
					resolveUpdate = resolve;
				})
		);
		const props = {
			i18n: createI18n('en'),
			store: unhealthyStore,
			ordinal: 1,
			latestReport: { ...latestReport, productReports: [] },
			onUpdate,
			recoveryViews: buildStoreStockRecoveryViews(stockTableGame(unhealthyStore), 'store-1'),
			plannerProductIds: ['bottled-water'] as readonly ProductId[],
			focusedProductId: 'bottled-water' as ProductId | null
		};
		const instance = render(StoreStockTable, props);

		const reorder = page.getByRole('spinbutton', { name: 'Reorder threshold for Bottled Water' });
		await reorder.fill('8');
		await page.getByRole('cell', { name: 'Bottled Water' }).click();
		expect(onUpdate).toHaveBeenCalledTimes(1);

		// The parent swapped in a store without the edited product before the
		// route commit resolved; the commit still settles, but no row can show it.
		instance.rerender({
			...props,
			store: { ...unhealthyStore, products: [productWithStock('snacks')] }
		});
		resolveUpdate({ status: 'committed' });
		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(document.querySelector('[data-testid="inventory-status-bottled-water"]')).toBeNull();
	});
});
