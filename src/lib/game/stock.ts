import { getArchetype } from './archetypes';
import { clampScore } from './reports';
import type { ArchetypeId, GameState, StoreProduct, StoreProductPatch } from './types';

export type StoreProductStatus = 'Out of stock' | 'Needs import' | 'Healthy';

export function initializeStoreProducts(archetypeId: ArchetypeId): StoreProduct[] {
	const archetype = getArchetype(archetypeId);

	return archetype.startingCategories.map((category) => ({
		categoryId: category.id,
		stock: Math.max(1, roundStockDefault(category.demandWeight * 70)),
		reorderThreshold: Math.max(0, roundStockDefault(category.demandWeight * 25)),
		targetStock: Math.max(1, roundStockDefault(category.demandWeight * 90)),
		sellingPrice: category.defaultSellingPrice
	}));
}

export function updateStoreProduct(
	game: GameState,
	storeId: string,
	categoryId: string,
	patch: StoreProductPatch
): GameState {
	const storeIndex = game.stores.findIndex((store) => store.id === storeId);

	if (storeIndex === -1) {
		return game;
	}

	const store = game.stores[storeIndex]!;
	const productIndex = store.products.findIndex((product) => product.categoryId === categoryId);

	if (productIndex === -1) {
		return game;
	}

	const product = store.products[productIndex]!;
	const sellingPrice = Math.max(
		1,
		roundedFiniteOrFallback(patch.sellingPrice, product.sellingPrice)
	);
	const reorderThreshold = Math.max(
		0,
		roundedFiniteOrFallback(patch.reorderThreshold, product.reorderThreshold)
	);
	const targetStock = Math.max(
		reorderThreshold,
		roundedFiniteOrFallback(patch.targetStock, product.targetStock)
	);
	const products = store.products.map((candidate, index) =>
		index === productIndex
			? {
					...candidate,
					sellingPrice,
					reorderThreshold,
					targetStock
				}
			: candidate
	);
	const updatedStore = {
		...store,
		products,
		stockHealth: calculateStockHealth(products)
	};

	return {
		...game,
		stores: game.stores.map((candidate, index) => (index === storeIndex ? updatedStore : candidate))
	};
}

export function getStoreProductStatus(
	product: Pick<StoreProduct, 'stock' | 'reorderThreshold'>
): StoreProductStatus {
	if (product.stock <= 0) {
		return 'Out of stock';
	}

	if (product.stock < product.reorderThreshold) {
		return 'Needs import';
	}

	return 'Healthy';
}

export function calculateStockHealth(products: StoreProduct[]): number {
	if (products.length === 0) {
		return 100;
	}

	const averageRatio =
		products.reduce((total, product) => total + getStockTargetRatio(product), 0) / products.length;

	return clampScore(averageRatio * 100);
}

function roundedFiniteOrFallback(value: number | undefined, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback;
	}

	return Math.round(value);
}

function roundStockDefault(value: number): number {
	return Math.round(value + 1e-9);
}

function getStockTargetRatio(product: StoreProduct): number {
	if (product.targetStock <= 0) {
		return 1;
	}

	return product.stock / product.targetStock;
}
