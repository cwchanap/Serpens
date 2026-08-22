import { describe, expect, test, vi } from 'vitest';
import { brandedSellerScore, getBrandDefaultSellingPrice } from './brands';
import { resolveEffectivePolicy, setPolicyOverride } from './policyInheritance';
import { resolveProductMarketDynamics } from './productDynamics';
import { getProductDefinition } from './products';
import { createRng, createRngFromState, randomBetween } from './rng';
import { createNewGame } from './state';
import {
	addStoreProductStockLot,
	buildCityDemandPools,
	calculateStockHealth,
	consumeStoreProductStock,
	createStoreProduct,
	getPolicyAdjustedCityProductDemand,
	getPolicyDemandMultiplier,
	getStoreProductStock,
	getStoreProductStatus,
	initializeStoreProducts,
	sellerPolicyDemand,
	simulateProductSalesForCity as simulateProductSalesForCityWithPolicies,
	summarizeStockTrouble,
	updateStoreProduct,
	type EffectivePolicyByStoreId
} from './stock';
import type { CompanyPolicy, GameState, ProductId, StoreProduct } from './types';

function withOneStoreProducts(products: StoreProduct[]): GameState {
	const game = createNewGame('convenience', 20260508);

	return {
		...game,
		stores: [
			{
				...game.stores[0]!,
				products: products.map((product) => ({ ...product }))
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
				brandId: 'common-ground',
				lots: [{ receivedDay: 1, quantity: 100 }],
				reorderThreshold: 10,
				targetStock: 100,
				sellingPrice: 3
			}
		]
	};

	return {
		...game,
		// Rivals are irrelevant to these seller-split mechanics; dropping them
		// keeps the expected values independent of rival-generation calibration.
		competitors: [],
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

function effectivePolicyMap(game: GameState): EffectivePolicyByStoreId {
	return new Map(
		game.stores.map((store) => [
			store.id,
			resolveEffectivePolicy(game, { kind: 'store', storeId: store.id }).values
		])
	);
}

type SalesInput = Parameters<typeof simulateProductSalesForCityWithPolicies>[0];

function simulateProductSalesForCity(
	input: Omit<SalesInput, 'effectivePolicyByStoreId'> &
		Partial<Pick<SalesInput, 'effectivePolicyByStoreId'>>
): ReturnType<typeof simulateProductSalesForCityWithPolicies> {
	return simulateProductSalesForCityWithPolicies({
		...input,
		effectivePolicyByStoreId: input.effectivePolicyByStoreId ?? effectivePolicyMap(input.game)
	});
}

describe('stock rules', () => {
	test('derives FIFO stock totals, consumes oldest lots, and removes empty lots', () => {
		expect.assertions(4);
		const product: StoreProduct = {
			productId: 'snacks',
			brandId: 'common-ground',
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
			brandId: 'common-ground',
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
			brandId: 'common-ground',
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
			brandId: 'common-ground',
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
			brandId: 'common-ground',
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
		expect.assertions(3);
		const products = initializeStoreProducts('convenience');

		expect(products.map((product) => product.productId)).toEqual(['bottled-water']);
		expect(products[0]!.brandId).toBe('common-ground');
		expect(products[0]!.sellingPrice).toBe(3);
	});

	test('createStoreProduct defaults receivedDay to 1 when omitted', () => {
		expect.assertions(3);
		const product = createStoreProduct('bottled-water');

		expect(product.lots).toEqual([{ receivedDay: 1, quantity: expect.any(Number) }]);
		expect(product.productId).toBe('bottled-water');
		expect(product.brandId).toBe('common-ground');
	});

	test('changes a supported brand without repricing unless a price is provided', () => {
		expect.assertions(7);
		const game = withOneStoreProducts([createStoreProduct('apparel')]);

		const branded = updateStoreProduct(game, 'store-1', 'apparel', {
			brandId: 'northstar-select'
		});
		const brandedProduct = branded.stores[0]!.products[0]!;
		expect(brandedProduct.brandId).toBe('northstar-select');
		// The brand switch preserves the shelf price instead of writing the
		// northstar-select default (45).
		expect(brandedProduct.sellingPrice).toBe(38);

		const priceEdited = updateStoreProduct(branded, 'store-1', 'apparel', {
			sellingPrice: 39
		});
		const priceEditedProduct = priceEdited.stores[0]!.products[0]!;
		expect(priceEditedProduct.brandId).toBe('northstar-select');
		expect(priceEditedProduct.sellingPrice).toBe(39);
		// Editing the price alone neither reapplies the brand multiplier nor
		// resets to the brand's default price.
		expect(priceEditedProduct.sellingPrice).not.toBe(
			getBrandDefaultSellingPrice(getProductDefinition('apparel'), 'northstar-select')
		);

		const explicitlyPriced = updateStoreProduct(priceEdited, 'store-1', 'apparel', {
			brandId: 'common-ground',
			sellingPrice: 51
		});
		const explicitlyPricedProduct = explicitlyPriced.stores[0]!.products[0]!;
		expect(explicitlyPricedProduct.brandId).toBe('common-ground');
		expect(explicitlyPricedProduct.sellingPrice).toBe(51);
	});

	test('rejects a brand that does not support the product family without changing the game', () => {
		expect.assertions(3);
		const game = withOneStoreProducts([createStoreProduct('bottled-water')]);

		const updated = updateStoreProduct(game, 'store-1', 'bottled-water', {
			brandId: 'northstar-select'
		});

		expect(updated).toBe(game);
		expect(updated.stores[0]!.products[0]!.brandId).toBe('common-ground');
		expect(updated.stores[0]!.products[0]!.sellingPrice).toBe(3);
	});

	test('applies non-brand edits and heals a missing brand identity through the product default', () => {
		expect.assertions(3);
		const game = withOneStoreProducts([createStoreProduct('snacks')]);
		const malformedGame = {
			...game,
			stores: game.stores.map((store) => ({
				...store,
				products: store.products.map((product) => {
					const malformedProduct = { ...product };
					Reflect.deleteProperty(malformedProduct, 'brandId');
					return malformedProduct;
				})
			}))
		} as unknown as GameState;

		const updated = updateStoreProduct(malformedGame, 'store-1', 'snacks', {
			sellingPrice: 7
		});

		expect(updated).not.toBe(malformedGame);
		expect(updated.stores[0]!.products[0]!.brandId).toBe('common-ground');
		expect(updated.stores[0]!.products[0]!.sellingPrice).toBe(7);
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
				brandId: 'common-ground',
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
				brandId: 'common-ground',
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
				brandId: 'common-ground',
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
				brandId: 'common-ground',
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
				brandId: 'common-ground',
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
				brandId: 'common-ground',
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
				brandId: 'common-ground',
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
					brandId: 'common-ground',
					lots: [{ receivedDay: 1, quantity: 50 }],
					reorderThreshold: 20,
					targetStock: 100,
					sellingPrice: 5
				},
				{
					productId: 'soft-drinks',
					brandId: 'common-ground',
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
					brandId: 'common-ground',
					lots: [{ receivedDay: 1, quantity: 125 }],
					reorderThreshold: 20,
					targetStock: 100,
					sellingPrice: 5
				}
			])
		).toBe(100);
		expect(
			calculateStockHealth([
				{
					productId: 'snacks',
					brandId: 'common-ground',
					lots: [],
					reorderThreshold: 20,
					targetStock: 100,
					sellingPrice: 5
				}
			])
		).toBe(0);
	});

	test('builds policy-free city-wide demand pools from city demand and product weights', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260508);
		const pools = buildCityDemandPools(game, game.cities[0]!);
		const changedPolicyGame = {
			...game,
			policy: { ...game.policy, marketing: 'promotions', pricing: 'premium' as const }
		};
		const changedPolicyPools = buildCityDemandPools(changedPolicyGame, game.cities[0]!);

		expect(pools['bottled-water']!).toBeGreaterThan(0);
		expect(pools['soft-drinks']).toBeUndefined();
		expect(changedPolicyPools).toEqual(pools);
	});

	test('grocery produce pressure wastes old lots while newer stock remains sellable', () => {
		expect.assertions(4);
		const base = createNewGame('grocery', 20260817);
		const store: GameState['stores'][number] = {
			...base.stores[0]!,
			products: [
				{
					productId: 'produce' as const,
					brandId: 'common-ground',
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
		const store: GameState['stores'][number] = {
			...base.stores[0]!,
			products: [
				{
					productId: 'apparel' as const,
					brandId: 'common-ground',
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
		const createStore = (receivedDay: number): GameState['stores'][number] => ({
			...base.stores[0]!,
			products: [
				{
					productId: 'devices' as const,
					brandId: 'common-ground',
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
		const store: GameState['stores'][number] = {
			...base.stores[0]!,
			products: [
				{
					productId: 'bottled-water' as const,
					brandId: 'common-ground',
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
		const createSeller = (id: string, reputation: number): GameState['stores'][number] => ({
			...base.stores[0]!,
			id,
			name: id,
			reputation,
			products: [
				{
					productId: 'apparel' as const,
					brandId: 'common-ground',
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
					brandId: 'common-ground',
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
		expect(sold).toBeGreaterThan(0);
		expect(result.remainingDemand.snacks).toBe(
			Math.max(0, (result.initialDemand.snacks ?? 0) - sold)
		);
	});

	test('applies current rival market share before allocating live product demand', () => {
		expect.assertions(2);
		const generated = createNewGame('convenience', 20260820);
		const base = {
			...generated,
			competitors: generated.competitors.map((competitor) => ({
				...competitor,
				archetypeId: 'convenience' as const,
				productFocus: ['beverages' as const],
				brandIds: ['common-ground' as const]
			}))
		};
		const policies = effectivePolicyMap(base);
		const withRivals = simulateProductSalesForCity({
			game: base,
			city: base.cities[0]!,
			rng: createRng(31),
			storeCapacity: new Map([[base.stores[0]!.id, 10_000]]),
			effectivePolicyByStoreId: policies
		});
		const rivalMarket = withRivals.marketReports[0]!;

		expect(rivalMarket.playerShare).toBeLessThan(1);
		expect(rivalMarket.playerDemandPool).toBeLessThan(rivalMarket.cityDemandPool);
	});

	test('reports a non-null player share delta when a prior market report exists', () => {
		expect.assertions(2);
		const generated = createNewGame('convenience', 20260820);
		const base = {
			...generated,
			competitors: generated.competitors.map((competitor) => ({
				...competitor,
				archetypeId: 'convenience' as const,
				productFocus: ['beverages' as const],
				brandIds: ['common-ground' as const]
			}))
		};
		const priorMarketReports = base.stores[0]!.products.map((product) => ({
			cityId: 'harbor-city' as const,
			productId: product.productId,
			cityDemandPool: 100,
			playerDemandPool: 50,
			playerShare: 0.5,
			playerShareDelta: null,
			playerAttractionScore: 80,
			competitors: []
		}));
		const withPrior = {
			...base,
			reports: [{ marketReports: priorMarketReports } as unknown as GameState['reports'][number]]
		};
		const policies = effectivePolicyMap(withPrior);
		const result = simulateProductSalesForCity({
			game: withPrior,
			city: withPrior.cities[0]!,
			rng: createRng(31),
			storeCapacity: new Map([[withPrior.stores[0]!.id, 10_000]]),
			effectivePolicyByStoreId: policies
		});

		expect(result.marketReports.length).toBeGreaterThan(0);
		expect(result.marketReports.every((report) => report.playerShareDelta !== null)).toBe(true);
	});

	test('applies selected brand demand and unit cost while keeping the configured selling price', () => {
		expect.assertions(8);
		const base = createNewGame('convenience', 20260820);
		const makeStore = (brandId: StoreProduct['brandId']) => ({
			...base.stores[0]!,
			products: [
				{
					productId: 'snacks' as const,
					brandId,
					lots: [{ receivedDay: 1, quantity: 10_000 }],
					reorderThreshold: 10,
					targetStock: 10_000,
					sellingPrice: 5
				}
			]
		});
		const commonStore = makeStore('common-ground');
		const budgetStore = makeStore('budget-bay');
		const common = simulateProductSalesForCity({
			game: { ...base, stores: [commonStore] },
			city: base.cities[0]!,
			rng: createRng(31),
			storeCapacity: new Map([[commonStore.id, 10_000]])
		});
		const budget = simulateProductSalesForCity({
			game: { ...base, stores: [budgetStore] },
			city: base.cities[0]!,
			rng: createRng(31),
			storeCapacity: new Map([[budgetStore.id, 10_000]])
		});
		const commonReport = common.productReports.get(commonStore.id)?.[0];
		const budgetReport = budget.productReports.get(budgetStore.id)?.[0];
		if (!commonReport || !budgetReport) throw new Error('expected branded sales reports');

		expect(budgetReport.brandId).toBe('budget-bay');
		expect(budgetReport.unitsSold).toBeGreaterThan(commonReport.unitsSold);
		expect(commonReport.importCost).toBe(3);
		expect(budgetReport.importCost).toBe(2.52);
		expect(commonReport.costOfGoods).toBe(Math.round(commonReport.unitsSold * 3));
		expect(budgetReport.costOfGoods).toBe(Math.round(budgetReport.unitsSold * 2.52));
		expect(budgetReport.baseSellingPrice).toBe(5);
		expect(budgetReport.effectiveSellingPrice).toBe(5);
	});

	test('allows independent seller demand above the raw trend pool without changing canonical order', () => {
		expect.assertions(7);
		const makeHighStock = (game: GameState): GameState => ({
			...game,
			stores: game.stores.map((store) => ({
				...store,
				products: store.products.map((product) => ({
					...product,
					lots: [{ receivedDay: 1, quantity: 10_000 }],
					targetStock: 10_000
				}))
			}))
		});
		const run = (storeIds: string[]) => {
			const game = makeHighStock(createEqualSellerGame(storeIds));
			const rng = createRng(5);
			const result = simulateProductSalesForCity({
				game,
				city: game.cities[0]!,
				rng,
				storeCapacity: new Map(game.stores.map((store) => [store.id, 10_000])),
				effectivePolicyByStoreId: effectivePolicyMap(game)
			});
			return { game, result, rngState: rng.getState() };
		};

		const ascending = run(['store-a', 'store-z']);
		const descending = run(['store-z', 'store-a']);
		const rawTrendPool = buildCityDemandPools(ascending.game, ascending.game.cities[0]!)[
			'bottled-water'
		]!;
		const sellerProduct = ascending.game.stores[0]!.products[0]!;
		const productDefinition = getProductDefinition(sellerProduct.productId);
		const marketDynamics = resolveProductMarketDynamics({
			product: sellerProduct,
			definition: productDefinition,
			day: ascending.game.day
		});
		const priceRatio =
			sellerProduct.sellingPrice / Math.max(1, productDefinition.defaultSellingPrice);
		const priceMultiplier = Math.max(
			0.18,
			Math.min(1.35, 1 - (priceRatio - 1) * productDefinition.priceSensitivity)
		);
		const desiredRng = createRng(5);
		const desiredUnits = [0, 1].map(() =>
			Math.round(
				sellerPolicyDemand(rawTrendPool, 0.5, ascending.game.policy) *
					marketDynamics.obsolescenceMultiplier *
					priceMultiplier *
					randomBetween(desiredRng, 0.94, 1.06)
			)
		);
		const sold = [...ascending.result.productReports.values()]
			.flat()
			.reduce((sum, report) => sum + report.unitsSold, 0);
		const reportsByStore = (result: typeof ascending.result) =>
			Object.fromEntries(
				[...result.productReports.entries()].map(([storeId, reports]) => [storeId, reports])
			);

		// Pre-HPA-41 could not sell above initialDemand because availableDemand
		// was included in Math.min(...) for every later seller.
		expect(rawTrendPool).toBe(147);
		expect(ascending.result.initialDemand['bottled-water']).toBe(rawTrendPool);
		expect(sold).toBeGreaterThan(rawTrendPool);
		expect(sold).toBeLessThanOrEqual(desiredUnits.reduce((sum, units) => sum + units, 0));
		expect(ascending.result.remainingDemand['bottled-water']).toBe(
			Math.max(0, rawTrendPool - sold)
		);
		expect(reportsByStore(ascending.result)).toEqual(reportsByStore(descending.result));
		expect(ascending.rngState).toBe(descending.rngState);
	});

	test('keeps canonical seller order when brand attraction changes seller shares', () => {
		expect.assertions(2);
		const base = createEqualSellerGame(['store-a', 'store-b']);
		const game: GameState = {
			...base,
			stores: base.stores.map((store, index) => ({
				...store,
				reputation: index === 0 ? 62 : 60,
				products: store.products.map((product) => ({
					...product,
					brandId: index === 0 ? 'common-ground' : 'budget-bay',
					lots: [{ receivedDay: 1, quantity: 10_000 }],
					targetStock: 10_000
				}))
			}))
		};
		const firstStore = game.stores[0]!;
		const secondStore = game.stores[1]!;
		expect(brandedSellerScore(secondStore, 'bottled-water')).toBeGreaterThan(
			brandedSellerScore(firstStore, 'bottled-water')
		);

		const rng = createRng(5);
		const result = simulateProductSalesForCity({
			game,
			city: game.cities[0]!,
			rng,
			storeCapacity: equalSellerCapacity(game),
			effectivePolicyByStoreId: effectivePolicyMap(game)
		});
		const firstReport = result.productReports.get(firstStore.id)?.[0];
		const secondReport = result.productReports.get(secondStore.id)?.[0];
		if (!firstReport || !secondReport) throw new Error('expected branded seller reports');

		// The legacy score orders store-a first, even though branded attraction gives store-b
		// the larger share. The seed's first jitter draw must therefore stay with store-a.
		expect({ first: firstReport.unitsSold, second: secondReport.unitsSold }).toEqual({
			first: 73,
			second: 85
		});
	});

	test('applies a store policy without spilling demand into another seller', () => {
		expect.assertions(7);
		const base = createEqualSellerGame(['store-a', 'store-b']);
		const overridden = setPolicyOverride(
			base,
			{ kind: 'store', storeId: 'store-a' },
			{ marketing: 'promotions' }
		);
		const basePolicies = effectivePolicyMap(base);
		const overriddenPolicies = effectivePolicyMap(overridden);
		const rawPool = buildCityDemandPools(base, base.cities[0]!)['bottled-water']!;
		const baseA = sellerPolicyDemand(rawPool, 0.5, basePolicies.get('store-a')!);
		const overriddenA = sellerPolicyDemand(rawPool, 0.5, overriddenPolicies.get('store-a')!);
		const baseB = sellerPolicyDemand(rawPool, 0.5, basePolicies.get('store-b')!);
		const overriddenB = sellerPolicyDemand(rawPool, 0.5, overriddenPolicies.get('store-b')!);
		const run = (game: GameState, policies: EffectivePolicyByStoreId) =>
			simulateProductSalesForCity({
				game,
				city: game.cities[0]!,
				rng: createRng(5),
				storeCapacity: new Map(game.stores.map((store) => [store.id, 10_000])),
				effectivePolicyByStoreId: policies
			});
		const baseSales = run(base, basePolicies);
		const overriddenSales = run(overridden, overriddenPolicies);
		const baseBReport = baseSales.productReports.get('store-b')?.[0];
		const overriddenBReport = overriddenSales.productReports.get('store-b')?.[0];
		if (!baseBReport || !overriddenBReport) {
			throw new Error('expected store-b product reports');
		}
		const basePlannerDemand = getPolicyAdjustedCityProductDemand(
			base,
			base.cities[0]!,
			'bottled-water',
			basePolicies
		);
		const overriddenPlannerDemand = getPolicyAdjustedCityProductDemand(
			overridden,
			overridden.cities[0]!,
			'bottled-water',
			overriddenPolicies
		);

		expect(overriddenA).toBeGreaterThan(baseA);
		expect(overriddenB).toBe(baseB);
		expect(overriddenBReport.unitsSold + overriddenBReport.demandMissed).toBe(
			baseBReport.unitsSold + baseBReport.demandMissed
		);
		expect(overriddenSales.productReports.get('store-a')?.[0]?.unitsSold).toBeGreaterThan(
			baseSales.productReports.get('store-a')?.[0]?.unitsSold ?? 0
		);
		// The planner rounds the seller sum once, so compare rounded sums rather
		// than the exact fractional change in store A's contribution.
		expect(overriddenPlannerDemand - basePlannerDemand).toBe(
			Math.round(overriddenA + overriddenB) - Math.round(baseA + baseB)
		);
		expect(basePlannerDemand).toBe(Math.round(baseA + baseB));
		expect(overriddenPlannerDemand).toBe(Math.round(overriddenA + overriddenB));
	});

	test('excludes products unsupported by a seller archetype from live and planner demand', () => {
		expect.assertions(3);
		const base = createNewGame('convenience', 20260508);
		const validStore: GameState['stores'][number] = {
			...base.stores[0]!,
			id: 'store-valid',
			products: [
				{
					productId: 'snacks',
					brandId: 'common-ground',
					lots: [{ receivedDay: 1, quantity: 10_000 }],
					reorderThreshold: 10,
					targetStock: 10_000,
					sellingPrice: 5
				}
			]
		};
		const unsupportedStore: GameState['stores'][number] = {
			...validStore,
			id: 'store-unsupported',
			archetypeId: 'electronics',
			tileId: 'store-unsupported-tile'
		};
		const validGame = { ...base, stores: [validStore] };
		const mixedGame = { ...base, stores: [validStore, unsupportedStore] };
		const validPolicies = effectivePolicyMap(validGame);
		const mixedPolicies = effectivePolicyMap(mixedGame);
		const validDemand = getPolicyAdjustedCityProductDemand(
			validGame,
			validGame.cities[0]!,
			'snacks',
			validPolicies
		);
		const mixedDemand = getPolicyAdjustedCityProductDemand(
			mixedGame,
			mixedGame.cities[0]!,
			'snacks',
			mixedPolicies
		);
		const sales = simulateProductSalesForCity({
			game: mixedGame,
			city: mixedGame.cities[0]!,
			rng: createRng(7),
			storeCapacity: new Map([
				[validStore.id, 10_000],
				[unsupportedStore.id, 10_000]
			]),
			effectivePolicyByStoreId: mixedPolicies
		});

		expect(mixedDemand).toBe(validDemand);
		expect(sales.productReports.has(validStore.id)).toBe(true);
		expect(sales.productReports.has(unsupportedStore.id)).toBe(false);
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
					brandId: 'common-ground',
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
					brandId: 'common-ground',
					lots: [{ receivedDay: 1, quantity: 100 }],
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			],
			reputation: 10,
			staffCapacity: 10
		};
		const highScoreStore: GameState['stores'][number] = {
			...game.stores[0]!,
			id: 'store-electronics',
			name: 'Electronics Store',
			tileId: `${game.stores[0]!.tileId}-alt`,
			archetypeId: 'electronics' as const,
			reputation: 100,
			staffCapacity: 100,
			products: [
				{
					productId: 'snacks',
					brandId: 'common-ground',
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
				{
					productId: 'snacks',
					brandId: 'common-ground',
					lots: [],
					reorderThreshold: 0,
					targetStock: 0,
					sellingPrice: 5
				}
			])
		).toBe(100);
		expect(
			calculateStockHealth([
				{
					productId: 'snacks',
					brandId: 'common-ground',
					lots: [],
					reorderThreshold: 0,
					targetStock: -5,
					sellingPrice: 5
				}
			])
		).toBe(100);
	});

	test('composes each marketing and pricing multiplier for seller demand', () => {
		expect.assertions(5);
		const pool = (marketing: CompanyPolicy['marketing'], pricing: CompanyPolicy['pricing']) =>
			getPolicyDemandMultiplier({ marketing, pricing });
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
				brandId: 'common-ground',
				lots: [{ receivedDay: 1, quantity: 8 }],
				reorderThreshold: 12,
				targetStock: 30,
				sellingPrice: 5
			},
			{
				productId: 'soft-drinks',
				brandId: 'common-ground',
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
							brandId: 'common-ground',
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
							brandId: 'common-ground',
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
					brandId: 'common-ground',
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
				brandId: 'common-ground',
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
					brandId: 'common-ground',
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

	test('getPolicyAdjustedCityProductDemand returns 0 when no eligible sellers carry the product', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260508);
		const store: GameState['stores'][number] = {
			...game.stores[0]!,
			products: [
				{
					productId: 'snacks',
					brandId: 'common-ground',
					lots: [{ receivedDay: 1, quantity: 100 }],
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			]
		};
		const demand = getPolicyAdjustedCityProductDemand(
			{ ...game, stores: [store] },
			game.cities[0]!,
			'bottled-water',
			effectivePolicyMap({ ...game, stores: [store] })
		);

		expect(demand).toBe(0);
	});

	test('simulateProductSalesForCity skips a product when no sellers carry it', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260508);
		const store: GameState['stores'][number] = {
			...game.stores[0]!,
			products: [
				{
					productId: 'snacks',
					brandId: 'common-ground',
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
			storeCapacity: new Map([[store.id, 100]])
		});

		expect(result.productReports.get(store.id)?.length).toBe(1);
		expect(result.productReports.get(store.id)?.[0]?.productId).toBe('snacks');
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
