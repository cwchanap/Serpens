import { describe, expect, test, vi } from 'vitest';
import { createRng, createRngFromState } from './rng';
import { createNewGame } from './state';
import {
	addStoreProductStockLot,
	buildCityDemandPools,
	calculateStockHealth,
	consumeStoreProductStock,
	createStoreProduct,
	getStoreProductStock,
	getStoreProductStatus,
	initializeStoreProducts,
	simulateProductSalesForCity,
	summarizeStockTrouble,
	updateStoreProduct
} from './stock';
import type { CompanyPolicy, GameState, ProductId, StoreProduct } from './types';

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

function createEqualSellerGame(storeIds: string[]): GameState {
	const game = createNewGame('convenience', 20260508);
	const baseStore: GameState['stores'][number] = {
		...game.stores[0]!,
		products: [
			{
				productId: 'bottled-water',
				lots: [{ receivedDay: 1, quantity: 100 }],
				reorderThreshold: 10,
				targetStock: 100,
				sellingPrice: 3
			}
		]
	};

	return {
		...game,
		stores: storeIds.map((id) => ({
			...baseStore,
			id,
			name: id,
			tileId: `${id}-tile`
		}))
	};
}

function equalSellerCapacity(game: GameState): Map<string, number> {
	return new Map(game.stores.map((store) => [store.id, 100]));
}

describe('stock rules', () => {
	test('derives FIFO stock totals, consumes oldest lots, and removes empty lots', () => {
		expect.assertions(4);
		const product: StoreProduct = {
			productId: 'snacks',
			lots: [
				{ receivedDay: 1, quantity: 5 },
				{ receivedDay: 3, quantity: 7 }
			],
			reorderThreshold: 2,
			targetStock: 20,
			sellingPrice: 5
		};

		const consumed = consumeStoreProductStock(product, 6);

		expect(getStoreProductStock(product)).toBe(12);
		expect(consumed.lots).toEqual([{ receivedDay: 3, quantity: 6 }]);
		expect(getStoreProductStock(consumed)).toBe(6);
		expect(product.lots).toEqual([
			{ receivedDay: 1, quantity: 5 },
			{ receivedDay: 3, quantity: 7 }
		]);
	});

	test('adds a lot without sharing the lot array or lot object', () => {
		expect.assertions(3);
		const product: StoreProduct = {
			productId: 'snacks',
			lots: [{ receivedDay: 1, quantity: 4 }],
			reorderThreshold: 2,
			targetStock: 20,
			sellingPrice: 5
		};
		const added = addStoreProductStockLot(product, { receivedDay: 7, quantity: 8 });

		expect(added.lots).toEqual([
			{ receivedDay: 1, quantity: 4 },
			{ receivedDay: 7, quantity: 8 }
		]);
		expect(added.lots).not.toBe(product.lots);
		added.lots[0]!.quantity = 99;
		expect(product.lots[0]!.quantity).toBe(4);
	});

	test('merges lots received on the same day into one lot', () => {
		expect.assertions(3);
		const product: StoreProduct = {
			productId: 'snacks',
			lots: [
				{ receivedDay: 1, quantity: 4 },
				{ receivedDay: 7, quantity: 6 }
			],
			reorderThreshold: 2,
			targetStock: 40,
			sellingPrice: 5
		};
		const merged = addStoreProductStockLot(product, { receivedDay: 7, quantity: 8 });

		expect(merged.lots).toEqual([
			{ receivedDay: 1, quantity: 4 },
			{ receivedDay: 7, quantity: 14 }
		]);
		expect(getStoreProductStock(merged)).toBe(18);
		expect(product.lots[1]!.quantity).toBe(6);
	});

	test('caps a lot addition to keep total stock within the safe-integer range', () => {
		expect.assertions(2);
		const product: StoreProduct = {
			productId: 'snacks',
			lots: [{ receivedDay: 1, quantity: Number.MAX_SAFE_INTEGER - 10 }],
			reorderThreshold: 2,
			targetStock: Number.MAX_SAFE_INTEGER - 1,
			sellingPrice: 5
		};
		// Adding 20 units would push the total to MAX_SAFE_INTEGER + 10.
		// The lot must be capped so the total stays at MAX_SAFE_INTEGER.
		const capped = addStoreProductStockLot(product, { receivedDay: 7, quantity: 20 });

		expect(getStoreProductStock(capped)).toBe(Number.MAX_SAFE_INTEGER);
		expect(capped.lots).toEqual([
			{ receivedDay: 1, quantity: Number.MAX_SAFE_INTEGER - 10 },
			{ receivedDay: 7, quantity: 10 }
		]);
	});

	test('does not add a lot when total stock is already at the safe-integer limit', () => {
		expect.assertions(2);
		const product: StoreProduct = {
			productId: 'snacks',
			lots: [{ receivedDay: 1, quantity: Number.MAX_SAFE_INTEGER }],
			reorderThreshold: 2,
			targetStock: Number.MAX_SAFE_INTEGER - 1,
			sellingPrice: 5
		};
		const capped = addStoreProductStockLot(product, { receivedDay: 7, quantity: 5 });

		expect(getStoreProductStock(capped)).toBe(Number.MAX_SAFE_INTEGER);
		expect(capped.lots).toEqual([{ receivedDay: 1, quantity: Number.MAX_SAFE_INTEGER }]);
	});

	test('initializes a single product at level 1', () => {
		expect.assertions(2);
		const products = initializeStoreProducts('convenience');

		expect(products.map((product) => product.productId)).toEqual(['bottled-water']);
		expect(products[0]!.sellingPrice).toBe(3);
	});

	test('createStoreProduct defaults receivedDay to 1 when omitted', () => {
		expect.assertions(2);
		const product = createStoreProduct('bottled-water');

		expect(product.lots).toEqual([{ receivedDay: 1, quantity: expect.any(Number) }]);
		expect(product.productId).toBe('bottled-water');
	});

	test('initializes unlocked categories for a given level', () => {
		expect.assertions(3);
		expect(initializeStoreProducts('convenience', 4).map((p) => p.productId)).toEqual([
			'bottled-water',
			'snacks'
		]);
		expect(initializeStoreProducts('convenience', 7).map((p) => p.productId)).toEqual([
			'bottled-water',
			'snacks',
			'soft-drinks'
		]);
		expect(initializeStoreProducts('convenience', 10).map((p) => p.productId)).toEqual([
			'bottled-water',
			'snacks',
			'soft-drinks',
			'essentials'
		]);
	});

	test('updates a store product immutably and clamps numeric input', () => {
		expect.assertions(10);
		const game = withOneStoreProducts([
			{
				productId: 'snacks',
				lots: [{ receivedDay: 1, quantity: 8 }],
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
		expect(product.lots).not.toBe(game.stores[0]!.products[0]!.lots);
		product.lots[0]!.quantity = 99;
		expect(game.stores[0]!.products[0]!.lots[0]!.quantity).toBe(8);
	});

	test.each([
		['negative', -1],
		['fractional', 12.5],
		['exact max', Number.MAX_SAFE_INTEGER],
		['unsafe', Number.MAX_SAFE_INTEGER + 1]
	] as const)('keeps the existing targetStock for %s input', (_label, targetStock) => {
		expect.assertions(1);
		const game = withOneStoreProducts([
			{
				productId: 'snacks',
				lots: [{ receivedDay: 1, quantity: 8 }],
				reorderThreshold: 12,
				targetStock: 30,
				sellingPrice: 5
			}
		]);

		const updated = updateStoreProduct(game, 'store-1', 'snacks', { targetStock });

		expect(updated.stores[0]!.products[0]!.targetStock).toBe(30);
	});

	test('accepts zero and the largest targetStock that can advance safely', () => {
		expect.assertions(2);
		const game = withOneStoreProducts([
			{
				productId: 'snacks',
				lots: [{ receivedDay: 1, quantity: 8 }],
				reorderThreshold: 0,
				targetStock: 30,
				sellingPrice: 5
			}
		]);

		const zero = updateStoreProduct(game, 'store-1', 'snacks', {
			targetStock: 0
		});
		const largest = updateStoreProduct(game, 'store-1', 'snacks', {
			targetStock: Number.MAX_SAFE_INTEGER - 1
		});

		expect(zero.stores[0]!.products[0]!.targetStock).toBe(0);
		expect(largest.stores[0]!.products[0]!.targetStock).toBe(Number.MAX_SAFE_INTEGER - 1);
	});

	test('preserves decimal reorderThreshold with an integer targetStock', () => {
		expect.assertions(2);
		const game = withOneStoreProducts([
			{
				productId: 'snacks',
				lots: [{ receivedDay: 1, quantity: 8 }],
				reorderThreshold: 12,
				targetStock: 30,
				sellingPrice: 5
			}
		]);

		const updated = updateStoreProduct(game, 'store-1', 'snacks', {
			reorderThreshold: 12.5,
			targetStock: 30
		});
		const product = updated.stores[0]!.products[0]!;

		expect(product.reorderThreshold).toBe(12.5);
		expect(product.targetStock).toBe(30);
	});

	test('requires a catalog ProductId for product edits', () => {
		expect.assertions(2);
		const game = withOneStoreProducts([
			{
				productId: 'snacks',
				lots: [{ receivedDay: 1, quantity: 8 }],
				reorderThreshold: 12,
				targetStock: 30,
				sellingPrice: 5
			}
		]);
		const productId: ProductId = 'snacks';
		const updated = updateStoreProduct(game, 'store-1', productId, { sellingPrice: 7 });
		expect(updated.stores[0]!.products[0]!.sellingPrice).toBe(7);

		const arbitraryProductId: string = 'snacks';
		const invalidProductUpdate = (): GameState => {
			// @ts-expect-error Product edits must not accept arbitrary strings.
			return updateStoreProduct(game, 'store-1', arbitraryProductId, {});
		};
		expect(invalidProductUpdate).toBeTypeOf('function');
	});

	test('keeps existing values when product updates receive non-finite numbers', () => {
		expect.assertions(4);
		const game = withOneStoreProducts([
			{
				productId: 'snacks',
				lots: [{ receivedDay: 1, quantity: 8 }],
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

	test('returns the original game for missing store or product updates', () => {
		expect.assertions(2);
		const game = withOneStoreProducts([
			{
				productId: 'snacks',
				lots: [{ receivedDay: 1, quantity: 8 }],
				reorderThreshold: 12,
				targetStock: 30,
				sellingPrice: 5
			}
		]);

		expect(updateStoreProduct(game, 'missing-store', 'snacks', { sellingPrice: 6 })).toBe(game);
		expect(updateStoreProduct(game, 'store-1', 'soft-drinks', { sellingPrice: 6 })).toBe(game);
	});

	test('describes stock status from current threshold and stock', () => {
		expect.assertions(3);

		expect(getStoreProductStatus({ lots: [], reorderThreshold: 10 })).toBe('Out of stock');
		expect(
			getStoreProductStatus({ lots: [{ receivedDay: 1, quantity: 9 }], reorderThreshold: 10 })
		).toBe('Needs import');
		expect(
			getStoreProductStatus({ lots: [{ receivedDay: 1, quantity: 10 }], reorderThreshold: 10 })
		).toBe('Healthy');
	});

	test('calculates stock health from product stock ratios', () => {
		expect.assertions(4);

		expect(calculateStockHealth([])).toBe(100);
		expect(
			calculateStockHealth([
				{
					productId: 'snacks',
					lots: [{ receivedDay: 1, quantity: 50 }],
					reorderThreshold: 20,
					targetStock: 100,
					sellingPrice: 5
				},
				{
					productId: 'soft-drinks',
					lots: [{ receivedDay: 1, quantity: 100 }],
					reorderThreshold: 20,
					targetStock: 100,
					sellingPrice: 4
				}
			])
		).toBe(75);
		expect(
			calculateStockHealth([
				{
					productId: 'snacks',
					lots: [{ receivedDay: 1, quantity: 125 }],
					reorderThreshold: 20,
					targetStock: 100,
					sellingPrice: 5
				}
			])
		).toBe(100);
		expect(
			calculateStockHealth([
				{ productId: 'snacks', lots: [], reorderThreshold: 20, targetStock: 100, sellingPrice: 5 }
			])
		).toBe(0);
	});

	test('builds city-wide demand pools from city demand and product weights', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260508);
		const pools = buildCityDemandPools(game, game.cities[0]!);

		expect(pools['bottled-water']!).toBeGreaterThan(0);
		expect(pools['soft-drinks']).toBeUndefined();
	});

	test('grocery produce pressure wastes old lots while newer stock remains sellable', () => {
		expect.assertions(4);
		const base = createNewGame('grocery', 20260817);
		const store = {
			...base.stores[0]!,
			products: [
				{
					productId: 'produce' as const,
					lots: [
						{ receivedDay: 1, quantity: 4 },
						{ receivedDay: 2, quantity: 1_000 }
					],
					reorderThreshold: 1,
					targetStock: 100,
					sellingPrice: 4
				}
			]
		};
		const result = simulateProductSalesForCity({
			game: { ...base, day: 11, stores: [store] },
			city: base.cities[0]!,
			rng: createRng(7),
			storeCapacity: new Map([[store.id, 100]])
		});
		const product = result.stores[0]!.products[0]!;
		const report = result.productReports.get(store.id)?.[0];
		if (!report) throw new Error('expected produce sales report');

		expect(product.lots[0]?.receivedDay).toBe(2);
		expect(getStoreProductStock(product)).toBeGreaterThan(0);
		expect(report).toMatchObject({
			wasteUnits: 4,
			wasteValue: 8,
			oldestSellableAgeDays: 9
		});
		expect(report.endingStock).toBeGreaterThan(0);
	});

	test('applies trend to the sales pool once while leaving the baseline demand pool stable', () => {
		expect.assertions(2);
		const base = createNewGame('boutique', 20260818);
		const store = {
			...base.stores[0]!,
			products: [
				{
					productId: 'apparel' as const,
					lots: [{ receivedDay: 1, quantity: 500 }],
					reorderThreshold: 1,
					targetStock: 500,
					sellingPrice: 38
				}
			]
		};
		const daySeven = { ...base, day: 7, stores: [store] };
		const dayFourteen = { ...base, day: 14, stores: [store] };
		const baselineSeven = buildCityDemandPools(daySeven, base.cities[0]!);
		const baselineFourteen = buildCityDemandPools(dayFourteen, base.cities[0]!);
		const salesSeven = simulateProductSalesForCity({
			game: daySeven,
			city: base.cities[0]!,
			rng: createRng(11),
			storeCapacity: new Map([[store.id, 500]])
		});
		const salesFourteen = simulateProductSalesForCity({
			game: dayFourteen,
			city: base.cities[0]!,
			rng: createRng(11),
			storeCapacity: new Map([[store.id, 500]])
		});

		expect(baselineSeven).toEqual(baselineFourteen);
		expect(salesFourteen.initialDemand.apparel).toBeGreaterThan(
			salesSeven.initialDemand.apparel ?? 0
		);
	});

	test('electronics devices show obsolescence and markdown without changing configured price or demand', () => {
		expect.assertions(8);
		const base = createNewGame('electronics', 20260819);
		const createStore = (receivedDay: number) => ({
			...base.stores[0]!,
			products: [
				{
					productId: 'devices' as const,
					lots: [{ receivedDay, quantity: 500 }],
					reorderThreshold: 1,
					targetStock: 500,
					sellingPrice: 240
				}
			]
		});
		const freshStore = createStore(15);
		const agedStore = createStore(1);
		const fresh = simulateProductSalesForCity({
			game: { ...base, day: 15, stores: [freshStore] },
			city: base.cities[0]!,
			rng: createRng(13),
			storeCapacity: new Map([[freshStore.id, 500]])
		});
		const aged = simulateProductSalesForCity({
			game: { ...base, day: 15, stores: [agedStore] },
			city: base.cities[0]!,
			rng: createRng(13),
			storeCapacity: new Map([[agedStore.id, 500]])
		});
		const obsoleteStore = createStore(1);
		const obsolete = simulateProductSalesForCity({
			game: { ...base, day: 28, stores: [obsoleteStore] },
			city: base.cities[0]!,
			rng: createRng(13),
			storeCapacity: new Map([[obsoleteStore.id, 500]])
		});
		const freshReport = fresh.productReports.get(freshStore.id)?.[0];
		const agedReport = aged.productReports.get(agedStore.id)?.[0];
		const obsoleteReport = obsolete.productReports.get(obsoleteStore.id)?.[0];
		if (!freshReport || !agedReport || !obsoleteReport) {
			throw new Error('expected device sales reports');
		}

		expect(agedReport.baseSellingPrice).toBe(240);
		expect(agedReport.effectiveSellingPrice).toBe(204);
		expect(agedReport.unitsSold).toBe(freshReport.unitsSold);
		expect(agedReport.revenue).toBeLessThan(freshReport.revenue);
		expect(agedReport.markdownAmount).toBeGreaterThan(0);
		expect(aged.stores[0]!.products[0]!.sellingPrice).toBe(240);
		expect(obsoleteReport.obsolescenceMultiplier).toBeLessThan(1);
		expect(obsoleteReport.markdownAmount).toBeGreaterThan(0);
	});

	test('convenience beverage pressure attributes only stock-serviceable demand to stockout', () => {
		expect.assertions(2);
		const base = createNewGame('convenience', 20260820);
		const store = {
			...base.stores[0]!,
			products: [
				{
					productId: 'bottled-water' as const,
					lots: [],
					reorderThreshold: 1,
					targetStock: 100,
					sellingPrice: 3
				}
			]
		};
		const noCapacity = simulateProductSalesForCity({
			game: { ...base, stores: [store] },
			city: base.cities[0]!,
			rng: createRng(17),
			storeCapacity: new Map([[store.id, 0]])
		});
		const capacity = simulateProductSalesForCity({
			game: { ...base, stores: [store] },
			city: base.cities[0]!,
			rng: createRng(17),
			storeCapacity: new Map([[store.id, 100]])
		});

		expect(noCapacity.productReports.get(store.id)?.[0]?.stockoutLostDemand).toBe(0);
		expect(capacity.productReports.get(store.id)?.[0]?.stockoutLostDemand).toBeGreaterThan(0);
	});

	test('boutique reputation sensitivity changes apparel seller share', () => {
		expect.assertions(2);
		const base = createNewGame('boutique', 20260823);
		const createSeller = (id: string, reputation: number) => ({
			...base.stores[0]!,
			id,
			name: id,
			reputation,
			products: [
				{
					productId: 'apparel' as const,
					lots: [{ receivedDay: 1, quantity: 500 }],
					reorderThreshold: 1,
					targetStock: 500,
					sellingPrice: 38
				}
			]
		});
		const lowReputation = createSeller('boutique-low', 20);
		const highReputation = createSeller('boutique-high', 90);
		const result = simulateProductSalesForCity({
			game: { ...base, day: 7, stores: [lowReputation, highReputation] },
			city: base.cities[0]!,
			rng: createRng(23),
			storeCapacity: new Map([
				[lowReputation.id, 500],
				[highReputation.id, 500]
			])
		});
		const lowReport = result.productReports.get(lowReputation.id)?.[0];
		const highReport = result.productReports.get(highReputation.id)?.[0];
		if (!lowReport || !highReport) throw new Error('expected boutique seller reports');

		expect(highReport.unitsSold).toBeGreaterThan(lowReport.unitsSold);
		expect(highReport.unitsSold / (highReport.unitsSold + lowReport.unitsSold)).toBeGreaterThan(
			0.7
		);
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

		const campusGame: GameState = {
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
		const firstStore: GameState['stores'][number] = {
			...game.stores[0]!,
			stockHealth: 100,
			products: [
				{
					productId: 'snacks',
					lots: [{ receivedDay: 1, quantity: 100 }],
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			]
		};
		const secondStore: GameState['stores'][number] = {
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

	test('uses a code-unit seller tie-break independent of input order', () => {
		const ascending = createEqualSellerGame(['store-a', 'store-z']);
		const descending = createEqualSellerGame(['store-z', 'store-a']);
		const firstRng = createRngFromState(ascending.rngState);
		const secondRng = createRngFromState(descending.rngState);
		const localeCompare = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
			throw new Error('seller ordering must not use localeCompare');
		});

		try {
			const first = simulateProductSalesForCity({
				game: ascending,
				city: ascending.cities[0]!,
				rng: firstRng,
				storeCapacity: equalSellerCapacity(ascending)
			});
			const second = simulateProductSalesForCity({
				game: descending,
				city: descending.cities[0]!,
				rng: secondRng,
				storeCapacity: equalSellerCapacity(descending)
			});

			expect(Object.fromEntries(first.stores.map((store) => [store.id, store]))).toEqual(
				Object.fromEntries(second.stores.map((store) => [store.id, store]))
			);
			expect(firstRng.getState()).toBe(secondRng.getState());
			expect([...first.productReports.keys()]).toEqual(['store-a', 'store-z']);
		} finally {
			localeCompare.mockRestore();
		}
	});

	test('higher selling price reduces category units sold under stable conditions', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260508);
		const baseStore: GameState['stores'][number] = {
			...game.stores[0]!,
			products: [
				{
					productId: 'snacks',
					lots: [{ receivedDay: 1, quantity: 100 }],
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			]
		};
		const premiumStore: GameState['stores'][number] = {
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

	test('boutique and electronics accessories keep separate category ids in the same city', () => {
		expect.assertions(4);
		const boutiqueGame = createNewGame('boutique', 20260604);
		const electronicsGame = createNewGame('electronics', 20260604);
		const boutiqueStore = {
			...boutiqueGame.stores[0]!,
			level: 10,
			products: initializeStoreProducts('boutique', 10)
		};
		const electronicsStore = {
			...electronicsGame.stores[0]!,
			id: 'store-electronics',
			name: 'Electronics Store',
			tileId: boutiqueStore.tileId + '-alt',
			level: 10,
			products: initializeStoreProducts('electronics', 10)
		};
		const boutiqueIds = boutiqueStore.products.map((product) => product.productId);
		const electronicsIds = electronicsStore.products.map((product) => product.productId);

		expect(boutiqueIds).toContain('fashion-accessories');
		expect(electronicsIds).toContain('accessories');
		expect(boutiqueIds).not.toContain('accessories');
		expect(electronicsIds).not.toContain('fashion-accessories');
	});

	test('boutique and electronics accessories resolve independent demand pools when co-located', () => {
		expect.assertions(3);
		const boutiqueGame = createNewGame('boutique', 20260604);
		const electronicsGame = createNewGame('electronics', 20260604);
		const city = boutiqueGame.cities[0]!;
		const boutiqueStore = {
			...boutiqueGame.stores[0]!,
			level: 10,
			products: initializeStoreProducts('boutique', 10)
		};
		const electronicsStore = {
			...electronicsGame.stores[0]!,
			id: 'store-electronics',
			name: 'Electronics Store',
			tileId: boutiqueStore.tileId + '-alt',
			level: 10,
			products: initializeStoreProducts('electronics', 10)
		};
		const combinedGame: GameState = {
			...boutiqueGame,
			stores: [boutiqueStore, electronicsStore]
		};
		const pools = buildCityDemandPools(combinedGame, city);

		expect(pools.accessories).toBeGreaterThan(0);
		expect(pools['fashion-accessories']).toBeGreaterThan(0);
		expect(pools.accessories).not.toBe(pools['fashion-accessories']);
	});
});

describe('tier 1 store products', () => {
	test('gives a new level-1 convenience store only bottled water', () => {
		expect.assertions(1);
		const products = initializeStoreProducts('convenience');
		expect(products.map((product) => product.productId)).toEqual(['bottled-water']);
	});
});

describe('sales loop guards', () => {
	test('ignores an ineligible top-scoring seller and sells through eligible sellers', () => {
		expect.assertions(5);
		const game = createNewGame('convenience', 20260508);
		const city = game.cities[0]!;
		const lowScoreStore: GameState['stores'][number] = {
			...game.stores[0]!,
			products: [
				{
					productId: 'snacks',
					lots: [{ receivedDay: 1, quantity: 100 }],
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			],
			reputation: 10,
			staffCapacity: 10,
			competition: 50
		};
		const highScoreStore: GameState['stores'][number] = {
			...game.stores[0]!,
			id: 'store-electronics',
			name: 'Electronics Store',
			tileId: `${game.stores[0]!.tileId}-alt`,
			archetypeId: 'electronics' as const,
			reputation: 100,
			staffCapacity: 100,
			competition: 0,
			products: [
				{
					productId: 'snacks',
					lots: [{ receivedDay: 1, quantity: 100 }],
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			]
		};
		const result = simulateProductSalesForCity({
			game: { ...game, stores: [lowScoreStore, highScoreStore] },
			city,
			rng: createRng(7),
			storeCapacity: new Map([
				[lowScoreStore.id, 100],
				[highScoreStore.id, 100]
			])
		});

		expect(Object.keys(result.initialDemand)).toEqual(['snacks']);
		expect(result.initialDemand.snacks).toBeGreaterThan(0);
		expect(result.productReports.has(lowScoreStore.id)).toBe(true);
		expect(result.productReports.has(highScoreStore.id)).toBe(false);
		expect(result.productReports.get(lowScoreStore.id)?.[0]?.unitsSold).toBeGreaterThan(0);
	});
});

describe('demand multipliers and stock ratios', () => {
	test('treats a product with no target stock as fully stocked', () => {
		expect.assertions(2);
		expect(
			calculateStockHealth([
				{ productId: 'snacks', lots: [], reorderThreshold: 0, targetStock: 0, sellingPrice: 5 }
			])
		).toBe(100);
		expect(
			calculateStockHealth([
				{ productId: 'snacks', lots: [], reorderThreshold: 0, targetStock: -5, sellingPrice: 5 }
			])
		).toBe(100);
	});

	test('applies each marketing and pricing multiplier to city demand pools', () => {
		expect.assertions(5);
		const game = createNewGame('convenience', 20260508);
		const city = game.cities[0]!;
		const pool = (marketing: CompanyPolicy['marketing'], pricing: CompanyPolicy['pricing']) =>
			buildCityDemandPools(game, city, { marketing, pricing })['bottled-water']!;
		const standard = pool('awareness', 'standard');
		const none = pool('none', 'standard');
		const loyalty = pool('loyalty', 'standard');
		const promotions = pool('promotions', 'standard');
		const discount = pool('awareness', 'discount');
		const premium = pool('awareness', 'premium');

		expect(none).toBeGreaterThan(0);
		expect(none).toBeLessThan(loyalty);
		expect(loyalty).toBeLessThan(promotions);
		expect(premium).toBeLessThan(standard);
		expect(standard).toBeLessThan(discount);
	});
});

describe('branch coverage edge cases', () => {
	test('updateStoreProduct leaves sibling products untouched when updating one of many', () => {
		expect.assertions(3);
		const game = withOneStoreProducts([
			{
				productId: 'snacks',
				lots: [{ receivedDay: 1, quantity: 8 }],
				reorderThreshold: 12,
				targetStock: 30,
				sellingPrice: 5
			},
			{
				productId: 'soft-drinks',
				lots: [{ receivedDay: 1, quantity: 10 }],
				reorderThreshold: 5,
				targetStock: 40,
				sellingPrice: 4
			}
		]);

		const updated = updateStoreProduct(game, 'store-1', 'snacks', { sellingPrice: 7 });
		const snacks = updated.stores[0]!.products.find((p) => p.productId === 'snacks')!;
		const drinks = updated.stores[0]!.products.find((p) => p.productId === 'soft-drinks')!;

		expect(snacks.sellingPrice).toBe(7);
		expect(drinks.sellingPrice).toBe(4);
		expect(drinks).toBe(game.stores[0]!.products.find((p) => p.productId === 'soft-drinks'));
	});

	test('updateStoreProduct leaves sibling stores untouched when updating one of many', () => {
		expect.assertions(3);
		const baseGame = createNewGame('convenience', 20260508);
		const expansionTile = baseGame.cities[0]!.tiles.find(
			(tile) => !tile.locked && tile.feature === null && tile.id !== baseGame.stores[0]!.tileId
		)!;
		const game = { ...baseGame, cash: 100_000 };
		const gameWithTwoStores: GameState = {
			...game,
			stores: [
				{
					...game.stores[0]!,
					products: [
						{
							productId: 'snacks',
							lots: [{ receivedDay: 1, quantity: 8 }],
							reorderThreshold: 12,
							targetStock: 30,
							sellingPrice: 5
						}
					]
				},
				{
					...game.stores[0]!,
					id: 'store-2',
					name: 'Store #2',
					tileId: expansionTile.id,
					products: [
						{
							productId: 'snacks',
							lots: [{ receivedDay: 1, quantity: 8 }],
							reorderThreshold: 12,
							targetStock: 30,
							sellingPrice: 5
						}
					]
				}
			]
		};

		const updated = updateStoreProduct(gameWithTwoStores, 'store-1', 'snacks', {
			sellingPrice: 9
		});

		expect(updated.stores[0]!.products[0]!.sellingPrice).toBe(9);
		expect(updated.stores[1]!.products[0]!.sellingPrice).toBe(5);
		expect(updated.stores[1]).toBe(gameWithTwoStores.stores[1]);
	});

	test('simulateProductSalesForCity treats a missing store capacity as zero', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260508);
		const store: GameState['stores'][number] = {
			...game.stores[0]!,
			products: [
				{
					productId: 'snacks',
					lots: [{ receivedDay: 1, quantity: 100 }],
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			]
		};
		const result = simulateProductSalesForCity({
			game: { ...game, stores: [store] },
			city: game.cities[0]!,
			rng: createRng(3),
			storeCapacity: new Map()
		});
		const report = result.productReports.get(store.id)?.[0];

		expect(report).toBeDefined();
		expect(report?.unitsSold).toBe(0);
	});

	test('updateStoreProduct rejects a reorderThreshold that overflows the lot-safe range', () => {
		expect.assertions(1);
		const game = withOneStoreProducts([
			{
				productId: 'snacks',
				lots: [{ receivedDay: 1, quantity: 8 }],
				reorderThreshold: 12,
				targetStock: 30,
				sellingPrice: 5
			}
		]);

		const updated = updateStoreProduct(game, 'store-1', 'snacks', {
			reorderThreshold: Number.MAX_SAFE_INTEGER
		});

		expect(updated).toBe(game);
	});

	test('simulateProductSalesForCity falls back to neutral reputation for a non-finite store reputation', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260508);
		const store: GameState['stores'][number] = {
			...game.stores[0]!,
			reputation: Number.POSITIVE_INFINITY,
			products: [
				{
					productId: 'bottled-water',
					lots: [{ receivedDay: 1, quantity: 100 }],
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 3
				}
			]
		};
		const result = simulateProductSalesForCity({
			game: { ...game, stores: [store] },
			city: game.cities[0]!,
			rng: createRng(3),
			storeCapacity: new Map([[store.id, 100]])
		});
		const report = result.productReports.get(store.id)?.[0];

		expect(report).toBeDefined();
		expect(report?.unitsSold).toBeGreaterThan(0);
	});
});

describe('summarizeStockTrouble', () => {
	test('returns null when every product is healthy', () => {
		expect.assertions(1);
		expect(
			summarizeStockTrouble([{ lots: [{ receivedDay: 1, quantity: 50 }], reorderThreshold: 10 }])
		).toBeNull();
	});

	test('reports a single out-of-stock product', () => {
		expect.assertions(1);
		expect(summarizeStockTrouble([{ lots: [], reorderThreshold: 10 }])).toBe(
			'1 product out of stock'
		);
	});

	test('uses singular subject-verb agreement for one needs-import product', () => {
		expect.assertions(1);
		expect(
			summarizeStockTrouble([{ lots: [{ receivedDay: 1, quantity: 5 }], reorderThreshold: 10 }])
		).toBe('1 product needs import');
	});

	test('counts out-of-stock and needs-import separately in mixed cases', () => {
		expect.assertions(1);
		const summary = summarizeStockTrouble([
			{ lots: [], reorderThreshold: 10 },
			{ lots: [{ receivedDay: 1, quantity: 5 }], reorderThreshold: 10 },
			{ lots: [{ receivedDay: 1, quantity: 3 }], reorderThreshold: 10 }
		]);
		expect(summary).toBe('1 product out of stock, 2 products need import');
	});

	test('uses plural "products out of stock" when more than one is at zero stock', () => {
		expect.assertions(1);
		const summary = summarizeStockTrouble([
			{ lots: [], reorderThreshold: 10 },
			{ lots: [], reorderThreshold: 10 }
		]);
		expect(summary).toBe('2 products out of stock');
	});
});
