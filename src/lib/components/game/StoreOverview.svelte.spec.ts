import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StoreOverview from './StoreOverview.svelte';
import { initializeStoreProducts } from '$lib/game/stock';
import type { DailyStoreReport, Store } from '$lib/game/types';

const store: Store = {
	id: 'store-1',
	level: 1,
	name: 'Founding Store',
	archetypeId: 'boutique',
	location: 'Downtown (1, 1)',
	cityId: 'harbor-city',
	tileId: 'harbor-city-1-1',
	mapX: 1,
	mapY: 1,
	daysOpen: 1,
	reputation: 50,
	stockHealth: 80,
	products: initializeStoreProducts('boutique'),
	staffMorale: 75,
	staffCapacity: 70,
	localDemand: 72,
	competition: 15,
	managerQuality: 60
};

const staleReport: DailyStoreReport = {
	storeId: store.id,
	revenue: 1_200,
	costOfGoods: 420,
	grossMargin: 780,
	operatingCosts: 300,
	importSpend: 125,
	netIncome: 480,
	customersServed: 42,
	demandMissed: 0,
	staffingCoverage: 100,
	staffingShortage: { manager: 0, general: 0 },
	stockHealth: 90,
	staffMorale: 82,
	reputation: 55,
	marketPosition: 45,
	productReports: [
		{
			categoryId: 'snacks',
			name: 'Snacks',
			unitsSold: 6,
			demandMissed: 1,
			revenue: 36,
			costOfGoods: 18,
			grossMargin: 18,
			endingStock: 14,
			warehouseUnits: 3,
			warehouseValue: 24,
			importedUnits: 2,
			importCost: 3,
			importSpend: 6
		}
	],
	warnings: []
};

describe('StoreOverview', () => {
	it('shows current staff coverage while preserving stock and import metrics', async () => {
		expect.assertions(5);

		render(StoreOverview, {
			stores: [store],
			staff: [],
			latestReports: [staleReport]
		});

		const storeRegion = page.getByRole('region', { name: 'Stores' });

		await expect.element(storeRegion.getByText('100%', { exact: true })).not.toBeInTheDocument();
		await expect.element(storeRegion.getByText('0/1 mgr, 0/2 gen')).toBeVisible();
		await expect.element(storeRegion.getByText('Stock')).toBeVisible();
		await expect.element(storeRegion.getByText('90')).toBeVisible();
		await expect.element(storeRegion.getByText('$125')).toBeVisible();
	});

	it('shows latest product warehouse and import source split', async () => {
		expect.assertions(3);

		render(StoreOverview, {
			stores: [store],
			staff: [],
			latestReports: [staleReport]
		});

		const storeRegion = page.getByRole('region', { name: 'Stores' });
		const productSources = storeRegion.getByRole('list', {
			name: 'Founding Store product source split'
		});

		await expect.element(productSources.getByText('Snacks')).toBeVisible();
		await expect.element(productSources.getByText('3 warehouse')).toBeVisible();
		await expect.element(productSources.getByText('2 imported')).toBeVisible();
	});
});
