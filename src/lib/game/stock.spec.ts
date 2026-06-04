import { describe, expect, test } from 'vitest';
import { createRng } from './rng';
import { createNewGame } from './state';
import {
	applyWeeklyImports,
	buildCityDemandPools,
	calculateStockHealth,
	getFinishedMaterialIdForCategory,
	getStoreProductStatus,
	initializeStoreProducts,
	isImportDay,
	simulateProductSalesForCity,
	updateStoreProduct
} from './stock';
import type { GameState, StoreProduct } from './types';

function withOneStoreProducts(products: StoreProduct[]): GameState {
	const game = createNewGame('convenience', 20260508);

	return {
		...game,
		stores: [
			{
				...game.stores[0]!,
				products
			}
		]
	};
}

describe('stock rules', () => {
	test('initializes a single product at level 1', () => {
		expect.assertions(2);
		const products = initializeStoreProducts('convenience');

		expect(products.map((product) => product.categoryId)).toEqual(['snacks']);
		expect(products[0]!.sellingPrice).toBe(5);
	});

	test('initializes unlocked categories for a given level', () => {
		expect.assertions(3);
		expect(initializeStoreProducts('convenience', 4).map((p) => p.categoryId)).toEqual([
			'snacks',
			'drinks'
		]);
		expect(initializeStoreProducts('convenience', 7).map((p) => p.categoryId)).toEqual([
			'snacks',
			'drinks',
			'essentials'
		]);
		expect(initializeStoreProducts('convenience', 10).map((p) => p.categoryId)).toEqual([
			'snacks',
			'drinks',
			'essentials',
			'household'
		]);
	});

	test('maps boutique gifts to a locally producible finished material', () => {
		expect.assertions(1);

		expect(getFinishedMaterialIdForCategory('gifts')).toBe('gifts');
	});

	test('updates a store product immutably and clamps numeric input', () => {
		expect.assertions(8);
		const game = withOneStoreProducts([
			{
				categoryId: 'snacks',
				stock: 8,
				reorderThreshold: 12,
				targetStock: 30,
				sellingPrice: 5
			}
		]);

		const updated = updateStoreProduct(game, 'store-1', 'snacks', {
			sellingPrice: -4,
			reorderThreshold: 40,
			targetStock: 35
		});
		const product = updated.stores[0]!.products[0]!;

		expect(updated).not.toBe(game);
		expect(updated.stores[0]).not.toBe(game.stores[0]);
		expect(product.sellingPrice).toBe(1);
		expect(product.reorderThreshold).toBe(40);
		expect(product.targetStock).toBe(40);
		expect(updated.stores[0]!.stockHealth).toBe(calculateStockHealth(updated.stores[0]!.products));
		expect(game.stores[0]!.products[0]!.sellingPrice).toBe(5);
		expect(game.stores[0]!.stockHealth).not.toBe(updated.stores[0]!.stockHealth);
	});

	test('keeps existing values when product updates receive non-finite numbers', () => {
		expect.assertions(4);
		const game = withOneStoreProducts([
			{
				categoryId: 'snacks',
				stock: 8,
				reorderThreshold: 12,
				targetStock: 30,
				sellingPrice: 5
			}
		]);

		const updated = updateStoreProduct(game, 'store-1', 'snacks', {
			sellingPrice: Number.NaN,
			reorderThreshold: Number.POSITIVE_INFINITY,
			targetStock: Number.NEGATIVE_INFINITY
		});
		const product = updated.stores[0]!.products[0]!;

		expect(product.sellingPrice).toBe(5);
		expect(product.reorderThreshold).toBe(12);
		expect(product.targetStock).toBe(30);
		expect(updated).not.toBe(game);
	});

	test('returns the original game for missing store or category updates', () => {
		expect.assertions(2);
		const game = withOneStoreProducts([
			{
				categoryId: 'snacks',
				stock: 8,
				reorderThreshold: 12,
				targetStock: 30,
				sellingPrice: 5
			}
		]);

		expect(updateStoreProduct(game, 'missing-store', 'snacks', { sellingPrice: 6 })).toBe(game);
		expect(updateStoreProduct(game, 'store-1', 'missing-category', { sellingPrice: 6 })).toBe(game);
	});

	test('describes stock status from current threshold and stock', () => {
		expect.assertions(3);

		expect(getStoreProductStatus({ stock: 0, reorderThreshold: 10 })).toBe('Out of stock');
		expect(getStoreProductStatus({ stock: 9, reorderThreshold: 10 })).toBe('Needs import');
		expect(getStoreProductStatus({ stock: 10, reorderThreshold: 10 })).toBe('Healthy');
	});

	test('calculates stock health from product stock ratios', () => {
		expect.assertions(4);

		expect(calculateStockHealth([])).toBe(100);
		expect(
			calculateStockHealth([
				{
					categoryId: 'snacks',
					stock: 50,
					reorderThreshold: 20,
					targetStock: 100,
					sellingPrice: 5
				},
				{
					categoryId: 'drinks',
					stock: 100,
					reorderThreshold: 20,
					targetStock: 100,
					sellingPrice: 4
				}
			])
		).toBe(75);
		expect(
			calculateStockHealth([
				{
					categoryId: 'snacks',
					stock: 125,
					reorderThreshold: 20,
					targetStock: 100,
					sellingPrice: 5
				}
			])
		).toBe(100);
		expect(
			calculateStockHealth([
				{ categoryId: 'snacks', stock: 0, reorderThreshold: 20, targetStock: 100, sellingPrice: 5 }
			])
		).toBe(0);
	});

	test('builds city-wide demand pools from city demand and product weights', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260508);
		const pools = buildCityDemandPools(game, game.cities[0]!);

		expect(pools.snacks).toBeGreaterThan(0);
		expect(pools.drinks).toBeUndefined();
	});

	test('applies retail city demand multipliers to city demand pools', () => {
		expect.assertions(5);
		const game = createNewGame('electronics', 20260508);
		const campusCity = {
			...game.cities[0]!,
			id: 'campus-junction',
			name: 'Campus Junction',
			tiles: game.cities[0]!.tiles.map((tile) => ({
				...tile,
				id: tile.id.replace('harbor-city', 'campus-junction'),
				cityId: 'campus-junction'
			}))
		};
		expect(campusCity.id).toContain('campus-junction');
		expect(campusCity.tiles.every((t) => t.cityId === 'campus-junction')).toBe(true);

		const campusGame = {
			...game,
			cities: [campusCity],
			activeCityId: 'campus-junction',
			stores: game.stores.map((store) => ({
				...store,
				cityId: 'campus-junction',
				tileId: store.tileId.replace('harbor-city', 'campus-junction')
			}))
		};
		expect(campusGame.stores.every((s) => s.tileId.includes('campus-junction'))).toBe(true);

		const harborPools = buildCityDemandPools(game, game.cities[0]!);
		const campusPools = buildCityDemandPools(campusGame, campusCity);

		expect(campusPools.games).toBeGreaterThan(harborPools.games ?? 0);
		expect(campusPools.devices).toBeUndefined();
	});

	test('shared city demand is consumed across stores selling the same category', () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260508);
		const firstStore = {
			...game.stores[0]!,
			stockHealth: 100,
			products: [
				{
					categoryId: 'snacks',
					stock: 100,
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			]
		};
		const secondStore = {
			...firstStore,
			id: 'store-2',
			name: 'Second Store',
			tileId: 'store-2-tile'
		};
		const result = simulateProductSalesForCity({
			game: { ...game, stores: [firstStore, secondStore] },
			city: game.cities[0]!,
			rng: createRng(5),
			storeCapacity: new Map([
				[firstStore.id, 100],
				[secondStore.id, 100]
			])
		});
		const sold = [...result.productReports.values()]
			.flat()
			.reduce((sum, report) => sum + report.unitsSold, 0);

		expect(result.productReports.get(firstStore.id)?.[0]?.unitsSold).toBeGreaterThan(0);
		expect(result.productReports.get(secondStore.id)?.[0]?.unitsSold).toBeGreaterThan(0);
		expect(sold).toBeLessThanOrEqual(result.initialDemand.snacks ?? 0);
		expect(result.remainingDemand.snacks).toBe((result.initialDemand.snacks ?? 0) - sold);
	});

	test('higher selling price reduces category units sold under stable conditions', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260508);
		const baseStore = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 100,
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			]
		};
		const premiumStore = {
			...baseStore,
			products: [{ ...baseStore.products[0]!, sellingPrice: 10 }]
		};
		const standard = simulateProductSalesForCity({
			game: { ...game, stores: [baseStore] },
			city: game.cities[0]!,
			rng: createRng(12),
			storeCapacity: new Map([[baseStore.id, 100]])
		});
		const premium = simulateProductSalesForCity({
			game: { ...game, stores: [premiumStore] },
			city: game.cities[0]!,
			rng: createRng(12),
			storeCapacity: new Map([[premiumStore.id, 100]])
		});

		expect(premium.productReports.get(premiumStore.id)?.[0]?.unitsSold).toBeLessThan(
			standard.productReports.get(baseStore.id)?.[0]?.unitsSold ?? 0
		);
	});

	test('weekly imports refill below-threshold rows to target and report spend', () => {
		expect.assertions(6);
		const game = createNewGame('convenience', 20260508);
		const store = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 4,
					reorderThreshold: 10,
					targetStock: 25,
					sellingPrice: 5
				}
			]
		};
		const result = applyWeeklyImports({
			game: { ...game, stores: [store] },
			storeReports: new Map([
				[
					store.id,
					[
						{
							categoryId: 'snacks',
							name: 'Snacks',
							unitsSold: 0,
							demandMissed: 0,
							revenue: 0,
							costOfGoods: 0,
							grossMargin: 0,
							endingStock: 4,
							warehouseUnits: 0,
							warehouseValue: 0,
							importedUnits: 0,
							importCost: 3,
							importSpend: 0
						}
					]
				]
			])
		});
		const product = result.stores[0]!.products[0]!;
		const report = result.productReports.get(store.id)![0]!;

		expect(isImportDay(7)).toBe(true);
		expect(product.stock).toBe(25);
		expect(report.endingStock).toBe(25);
		expect(report.importedUnits).toBe(21);
		expect(report.importSpend).toBe(63);
		expect(result.importSpend).toBe(63);
	});

	test('weekly refill pulls finished goods from warehouse before imports', () => {
		expect.assertions(7);
		const game = {
			...createNewGame('convenience', 20260508),
			warehouse: {
				capacity: 200,
				materials: { snacks: 12 },
				overflowUnits: 0,
				overflowCost: 0
			}
		};
		const store = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 4,
					reorderThreshold: 10,
					targetStock: 25,
					sellingPrice: 5
				}
			]
		};
		const result = applyWeeklyImports({
			game: { ...game, stores: [store] },
			storeReports: new Map()
		});
		const product = result.stores[0]!.products[0]!;
		const report = result.productReports.get(store.id)![0]!;

		expect(product.stock).toBe(25);
		expect(result.warehouse.materials.snacks).toBe(0);
		expect(report.warehouseUnits).toBe(12);
		expect(report.warehouseValue).toBe(96);
		expect(report.importedUnits).toBe(9);
		expect(report.importSpend).toBe(27);
		expect(result.importSpend).toBe(27);
	});

	test('store level multiplies product revenue without changing cost of goods', () => {
		expect.assertions(2);
		const base = createNewGame('convenience', 20260603);
		const city = base.cities[0]!;
		const storeCapacity = new Map(base.stores.map((store) => [store.id, 10_000]));

		const level1 = simulateProductSalesForCity({
			game: base,
			city,
			rng: createRng(base.rngState),
			storeCapacity
		});
		const leveledGame = { ...base, stores: [{ ...base.stores[0]!, level: 9 }] };
		const level9 = simulateProductSalesForCity({
			game: leveledGame,
			city,
			rng: createRng(base.rngState),
			storeCapacity: new Map(leveledGame.stores.map((store) => [store.id, 10_000]))
		});

		const storeId = base.stores[0]!.id;
		const rev1 = (level1.productReports.get(storeId) ?? []).reduce((t, r) => t + r.revenue, 0);
		const cog1 = (level1.productReports.get(storeId) ?? []).reduce((t, r) => t + r.costOfGoods, 0);
		const rev9 = (level9.productReports.get(storeId) ?? []).reduce((t, r) => t + r.revenue, 0);
		const cog9 = (level9.productReports.get(storeId) ?? []).reduce((t, r) => t + r.costOfGoods, 0);

		expect(rev9).toBeGreaterThan(rev1);
		expect(cog9).toBe(cog1);
	});

	test('weekly imports non-material categories without writing warehouse keys', () => {
		expect.assertions(7);
		const game = {
			...createNewGame('boutique', 20260508),
			warehouse: {
				capacity: 200,
				materials: { snacks: 12 },
				overflowUnits: 0,
				overflowCost: 0
			}
		};
		const store = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'apparel',
					stock: 4,
					reorderThreshold: 10,
					targetStock: 25,
					sellingPrice: 38
				}
			]
		};
		const result = applyWeeklyImports({
			game: { ...game, stores: [store] },
			storeReports: new Map()
		});
		const product = result.stores[0]!.products[0]!;
		const report = result.productReports.get(store.id)![0]!;

		expect(product.stock).toBe(25);
		expect(result.warehouse.materials).toEqual({ snacks: 12 });
		expect('apparel' in result.warehouse.materials).toBe(false);
		expect(report.warehouseUnits).toBe(0);
		expect(report.importedUnits).toBe(21);
		expect(report.importSpend).toBe(378);
		expect(result.importSpend).toBe(378);
	});
});
