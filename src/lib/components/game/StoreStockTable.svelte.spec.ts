import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StoreStockTable from './StoreStockTable.svelte';
import { getProductArt } from '$lib/assets/gameArt';
import { initializeStoreProducts } from '$lib/game/stock';
import { createI18n } from '$lib/i18n';
import type { DailyStoreReport, Store } from '$lib/game/types';

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
	competition: 15,
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
	marketPosition: 40,
	productReports: [
		{
			categoryId: 'bottled-water',
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
			importSpend: 0
		}
	],
	warnings: []
};

describe('StoreStockTable', () => {
	it('renders product stock rows with fixed cost and latest report demand', async () => {
		expect.assertions(9);

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
		await expect.element(page.getByRole('cell', { name: '$2' })).toBeVisible();
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
					categoryId: 'apparel',
					stock: 10,
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
					categoryId: 'apparel',
					stock: 10,
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
			allowedProductCategoryIds: ['bottled-water'],
			disabledReason: 'This category is locked.'
		});

		await expect.element(page.getByText('This category is locked.')).toBeVisible();
		await expect.element(page.getByRole('cell', { name: 'apparel' })).toBeVisible();
	});
});
