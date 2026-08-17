import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StoreOverview from './StoreOverview.svelte';
import { initializeStoreProducts } from '$lib/game/stock';
import { createI18n } from '$lib/i18n';
import type { DailyStoreReport, Store } from '$lib/game/types';

const store: Store = {
	id: 'store-1',
	level: 1,
	name: 'Founding Store',
	archetypeId: 'boutique',
	location: { neighborhoodId: 'downtown', x: 1, y: 1 },
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
			productId: 'snacks',
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
	replenishment: null,
	warnings: []
};

describe('StoreOverview', () => {
	it('shows current staff coverage while preserving stock and import metrics', async () => {
		expect.assertions(6);

		render(StoreOverview, {
			i18n: createI18n('en'),
			stores: [store],
			staff: [],
			latestReports: [staleReport]
		});

		const storeRegion = page.getByRole('region', { name: 'Stores' });

		await expect.element(storeRegion.getByText('100%', { exact: true })).not.toBeInTheDocument();
		await expect.element(storeRegion.getByText('0/1 mgr, 0/2 gen')).toBeVisible();
		await expect.element(storeRegion.getByText('Stock')).toBeVisible();
		await expect.element(storeRegion.getByText(/^External imports$/)).toBeVisible();
		await expect.element(storeRegion.getByText('90')).toBeVisible();
		await expect.element(storeRegion.getByText('$125')).toBeVisible();
	});

	it('shows latest product local supply and external import source split', async () => {
		expect.assertions(3);

		render(StoreOverview, {
			i18n: createI18n('en'),
			stores: [store],
			staff: [],
			latestReports: [staleReport]
		});

		const storeRegion = page.getByRole('region', { name: 'Stores' });
		const productSources = storeRegion.getByRole('list', {
			name: 'Founding Store product source split'
		});

		await expect.element(productSources.getByText('Snacks')).toBeVisible();
		await expect.element(productSources.getByText('3 local supply')).toBeVisible();
		await expect.element(productSources.getByText('2 external imports')).toBeVisible();
	});

	it('lists store warnings when the latest report includes them', async () => {
		expect.assertions(2);

		const reportWithWarnings: DailyStoreReport = {
			...staleReport,
			warnings: [{ code: 'stockPressure', storeId: 'store-1' }]
		};

		render(StoreOverview, {
			i18n: createI18n('en'),
			stores: [store],
			staff: [],
			latestReports: [reportWithWarnings]
		});

		const storeRegion = page.getByRole('region', { name: 'Stores' });
		const warningsList = storeRegion.getByRole('list', { name: 'Founding Store warnings' });

		await expect.element(warningsList.getByText('Founding Store has stock pressure')).toBeVisible();
		await expect.element(storeRegion.getByText('No current warnings.')).not.toBeInTheDocument();
	});

	it('localizes known store warnings in non-English locales', async () => {
		expect.assertions(3);

		const reportWithWarnings: DailyStoreReport = {
			...staleReport,
			warnings: [
				{ code: 'stockPressure', storeId: 'store-1' },
				{ code: 'reputationSlipping', storeId: 'store-1' }
			]
		};

		render(StoreOverview, {
			i18n: createI18n('zh-Hant'),
			stores: [store],
			staff: [],
			latestReports: [reportWithWarnings]
		});

		const warningsList = page.getByRole('list', { name: 'Founding Store警告' });

		await expect.element(warningsList.getByText('Founding Store 有庫存壓力')).toBeVisible();
		await expect.element(warningsList.getByText('Founding Store 聲譽正在下滑')).toBeVisible();
		await expect
			.element(warningsList.getByText('Founding Store has stock pressure'))
			.not.toBeInTheDocument();
	});

	it('falls back to store defaults when no matching report exists', async () => {
		expect.assertions(5);

		render(StoreOverview, {
			i18n: createI18n('en'),
			stores: [store],
			staff: [],
			latestReports: []
		});

		const storeRegion = page.getByRole('region', { name: 'Stores' });

		await expect.element(storeRegion.getByText('80', { exact: true })).toBeVisible();
		await expect.element(storeRegion.getByText('$0').first()).toBeVisible();
		await expect
			.element(storeRegion.getByRole('list', { name: 'Founding Store product source split' }))
			.not.toBeInTheDocument();
		await expect.element(storeRegion.getByText('No current warnings.')).toBeVisible();
		await expect
			.element(storeRegion.getByRole('list', { name: 'Founding Store warnings' }))
			.not.toBeInTheDocument();
	});

	it('shows product source split for products sourced only via imports', async () => {
		expect.assertions(3);

		const importOnlyReport: DailyStoreReport = {
			...staleReport,
			productReports: [
				{
					productId: 'snacks',
					name: 'Snacks',
					unitsSold: 6,
					demandMissed: 1,
					revenue: 36,
					costOfGoods: 18,
					grossMargin: 18,
					endingStock: 14,
					warehouseUnits: 0,
					warehouseValue: 0,
					importedUnits: 5,
					importCost: 3,
					importSpend: 15
				}
			]
		};

		render(StoreOverview, {
			i18n: createI18n('en'),
			stores: [store],
			staff: [],
			latestReports: [importOnlyReport]
		});

		const productSources = page.getByRole('list', {
			name: 'Founding Store product source split'
		});

		await expect.element(productSources.getByText('Snacks')).toBeVisible();
		await expect.element(productSources.getByText('0 local supply')).toBeVisible();
		await expect.element(productSources.getByText('5 external imports')).toBeVisible();
	});
});
