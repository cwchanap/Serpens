import { getArchetype } from './archetypes';
import { resolveWorldCityId } from './cityInventory';
import {
	getNextReplenishmentCheckDay,
	getRetailReplenishmentOutcome,
	resolveRetailSupplyContext
} from './retailSupply';
import { getStoreProductStock } from './stock';
import type {
	GameState,
	ProductId,
	RetailReplenishmentContext,
	RetailReplenishmentOutcome
} from './types';

export type StockRecoveryEligibility =
	| 'eligible-at-current-stock'
	| 'not-below-threshold'
	| 'blocked-by-zero-threshold'
	| 'not-replenishable-product';

export type StockRecoverySupplyMode =
	| 'assigned-city-with-import-fallback'
	| 'unassigned-import-fallback'
	| 'unavailable-source-import-fallback';

export interface StockReceiptEvidence {
	day: number;
	warehouseUnits: number;
	importedUnits: number;
	outcome: RetailReplenishmentOutcome;
}

export interface StockRecoveryView {
	eligibility: StockRecoveryEligibility;
	nextCheckDay: number;
	supplyContext: RetailReplenishmentContext;
	supplyMode: StockRecoverySupplyMode;
	lastReceipt: StockReceiptEvidence | null;
}

/**
 * Pure per-product recovery read model for one store, composed from the
 * shared stock, retail-supply, archetype, and completed-report rules. It
 * never consumes RNG, mutates state, or simulates future days.
 */
export function buildStoreStockRecoveryViews(
	game: GameState,
	storeId: string
): ReadonlyMap<ProductId, StockRecoveryView> {
	const views = new Map<ProductId, StockRecoveryView>();
	const store = game.stores.find((candidate) => candidate.id === storeId);
	const retailCityId = store ? resolveWorldCityId(store.cityId) : undefined;
	if (!store || !retailCityId) {
		return views;
	}

	const startingProductIds = getArchetype(store.archetypeId).startingProductIds;
	const context = resolveRetailSupplyContext(game, retailCityId);
	const supplyMode: StockRecoverySupplyMode =
		context.resolvedSupplyCityId !== null
			? 'assigned-city-with-import-fallback'
			: context.configuredSupplyCityId === null
				? 'unassigned-import-fallback'
				: 'unavailable-source-import-fallback';
	const nextCheckDay = getNextReplenishmentCheckDay(game.day);

	for (const product of store.products) {
		const currentStock = getStoreProductStock(product);
		const eligibility: StockRecoveryEligibility = !startingProductIds.includes(product.productId)
			? 'not-replenishable-product'
			: currentStock <= 0 && product.reorderThreshold === 0
				? 'blocked-by-zero-threshold'
				: currentStock < product.reorderThreshold
					? 'eligible-at-current-stock'
					: 'not-below-threshold';

		views.set(product.productId, {
			eligibility,
			nextCheckDay,
			supplyContext: context,
			supplyMode,
			lastReceipt: findLastReceipt(game, storeId, product.productId)
		});
	}

	return views;
}

/**
 * Newest-first search through completed daily reports. A receipt exists only
 * when the closing-day report carried replenishment context and recorded
 * positive warehouse/import quantities.
 */
function findLastReceipt(
	game: GameState,
	storeId: string,
	productId: ProductId
): StockReceiptEvidence | null {
	for (let index = game.reports.length - 1; index >= 0; index -= 1) {
		const report = game.reports[index]!;
		const storeReport = report.storeReports.find((candidate) => candidate.storeId === storeId);
		if (!storeReport?.replenishment) {
			continue;
		}
		const productReport = storeReport.productReports.find(
			(candidate) => candidate.productId === productId
		);
		if (!productReport || (productReport.warehouseUnits <= 0 && productReport.importedUnits <= 0)) {
			continue;
		}
		const outcome = getRetailReplenishmentOutcome(storeReport.replenishment, productReport);
		if (!outcome) {
			continue;
		}

		return {
			day: report.day,
			warehouseUnits: productReport.warehouseUnits,
			importedUnits: productReport.importedUnits,
			outcome
		};
	}

	return null;
}
