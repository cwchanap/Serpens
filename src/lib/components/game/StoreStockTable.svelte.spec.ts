import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StoreStockTable from './StoreStockTable.svelte';
import { getProductArt } from '$lib/assets/gameArt';
import { initializeStoreProducts } from '$lib/game/stock';
import type { DailyStoreReport, Store } from '$lib/game/types';

const store: Store = {
	id: 'store-1',
	name: 'Founding Store',
	archetypeId: 'convenience',
	location: 'Downtown (1, 1)',
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
			categoryId: 'snacks',
			name: 'Snacks',
			unitsSold: 12,
			demandMissed: 2,
			revenue: 60,
			costOfGoods: 36,
			grossMargin: 24,
			endingStock: 58,
			importedUnits: 0,
			importCost: 3,
			importSpend: 0
		}
	],
	warnings: []
};

describe('StoreStockTable', () => {
	it('renders product stock rows with fixed cost and latest report demand', async () => {
		expect.assertions(9);

		render(StoreStockTable, {
			store,
			latestReport,
			onUpdate: vi.fn()
		});

		await expect.element(page.getByRole('heading', { name: 'Founding Store stock' })).toBeVisible();
		await expect.element(page.getByRole('cell', { name: 'Snacks' })).toBeVisible();
		const snacksArt = getProductArt('snacks');

		await expect.element(page.getByRole('img', { name: snacksArt.alt })).toBeVisible();
		await expect
			.element(page.getByRole('img', { name: snacksArt.alt }))
			.toHaveAttribute('src', snacksArt.path);
		await expect.element(page.getByRole('cell', { name: '$3' })).toBeVisible();
		await expect.element(page.getByText('12 sold / 2 missed')).toBeVisible();
		await expect
			.element(page.getByRole('spinbutton', { name: 'Selling price for Snacks' }))
			.toBeVisible();
		await expect
			.element(page.getByRole('spinbutton', { name: 'Reorder threshold for Snacks' }))
			.toBeVisible();
		await expect
			.element(page.getByRole('spinbutton', { name: 'Target stock for Snacks' }))
			.toBeVisible();
	});

	it('sends one numeric selling price update for the edited product', async () => {
		expect.assertions(2);
		const onUpdate = vi.fn();

		render(StoreStockTable, {
			store,
			latestReport,
			onUpdate
		});

		const sellingPrice = page.getByRole('spinbutton', { name: 'Selling price for Snacks' });
		await sellingPrice.fill('7');
		await page.getByRole('cell', { name: 'Snacks' }).click();

		expect(onUpdate).toHaveBeenCalledTimes(1);
		expect(onUpdate).toHaveBeenCalledWith('store-1', 'snacks', { sellingPrice: 7 });
	});

	it('does not send an update for invalid numeric input', async () => {
		expect.assertions(1);
		const onUpdate = vi.fn();

		render(StoreStockTable, {
			store,
			latestReport,
			onUpdate
		});

		const sellingPrice = page.getByRole('spinbutton', { name: 'Selling price for Snacks' });
		await sellingPrice.fill('');
		await page.getByRole('cell', { name: 'Snacks' }).click();

		expect(onUpdate).not.toHaveBeenCalled();
	});
});
