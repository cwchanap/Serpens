import { describe, expect, test } from 'vitest';
import { createNewGame } from './state';
import {
	calculateStockHealth,
	getStoreProductStatus,
	initializeStoreProducts,
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
	test('initializes store products from convenience category defaults', () => {
		expect.assertions(5);
		const products = initializeStoreProducts('convenience');

		expect(products.map((product) => product.categoryId)).toEqual([
			'snacks',
			'drinks',
			'essentials'
		]);
		expect(products[0]).toEqual({
			categoryId: 'snacks',
			stock: 70,
			reorderThreshold: 25,
			targetStock: 90,
			sellingPrice: 5
		});
		expect(products[1]).toEqual({
			categoryId: 'drinks',
			stock: 81,
			reorderThreshold: 29,
			targetStock: 104,
			sellingPrice: 4
		});
		expect(products[2]).toEqual({
			categoryId: 'essentials',
			stock: 56,
			reorderThreshold: 20,
			targetStock: 72,
			sellingPrice: 8
		});
		expect(new Set(products.map((product) => product.categoryId)).size).toBe(products.length);
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
});
