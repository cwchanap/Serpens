import { describe, expect, test } from 'vitest';
import { createNewGame } from './state';
import { getStoreProductStatus, getStoreProductStock } from './stock';
import { buildStoreStockRecoveryViews } from './stockRecovery';
import type {
	DailyProductReport,
	DailyReport,
	GameState,
	ProductId,
	RetailReplenishmentContext,
	StoreProduct
} from './types';

const assignedContext: RetailReplenishmentContext = {
	retailCityId: 'harbor-city',
	configuredSupplyCityId: 'industry-city',
	resolvedSupplyCityId: 'industry-city'
};

const unassignedContext: RetailReplenishmentContext = {
	retailCityId: 'harbor-city',
	configuredSupplyCityId: null,
	resolvedSupplyCityId: null
};

function product(
	productId: ProductId,
	overrides: Partial<StoreProduct> & { initialQuantity?: number } = {}
): StoreProduct {
	const { initialQuantity = 50, ...productOverrides } = overrides;
	return {
		productId,
		brandId: 'common-ground',
		lots: initialQuantity > 0 ? [{ receivedDay: 1, quantity: initialQuantity }] : [],
		reorderThreshold: 10,
		targetStock: 60,
		sellingPrice: 5,
		...productOverrides
	};
}

function storeGame(products: StoreProduct[], overrides: Partial<GameState> = {}): GameState {
	const game = createNewGame('convenience', 292_601);
	return {
		...game,
		stores: [{ ...game.stores[0]!, products }],
		...overrides
	};
}

function receiptReport(
	day: number,
	storeId: string,
	productReports: Pick<DailyProductReport, 'productId' | 'warehouseUnits' | 'importedUnits'>[],
	replenishment: RetailReplenishmentContext | null
): DailyReport {
	return {
		day,
		storeReports: [
			{
				storeId,
				productReports: productReports.map((report) => ({ ...report })),
				replenishment
			}
		]
	} as unknown as DailyReport;
}

function viewFor(game: GameState, productId: ProductId) {
	const view = buildStoreStockRecoveryViews(game, game.stores[0]!.id).get(productId);
	if (!view) {
		throw new Error(`expected a recovery view for ${productId}`);
	}
	return view;
}

describe('buildStoreStockRecoveryViews', () => {
	test('copies current stock, status, threshold, and target from live product state', () => {
		expect.assertions(4);
		const liveProduct = product('snacks', { initialQuantity: 4 });
		const game = storeGame([liveProduct]);
		const view = viewFor(game, 'snacks');

		expect(view.productId).toBe('snacks');
		expect(view.currentStock).toBe(getStoreProductStock(liveProduct));
		expect(view.status).toBe(getStoreProductStatus(liveProduct));
		expect(view).toMatchObject({
			currentStock: 4,
			status: 'Needs import',
			reorderThreshold: 10,
			targetStock: 60,
			// Day 1 game: the first closing-day check is day 7.
			nextCheckDay: 7
		});
	});

	test('reports eligible-at-current-stock below the reorder threshold', () => {
		expect.assertions(1);
		const view = viewFor(storeGame([product('snacks', { initialQuantity: 9 })]), 'snacks');

		expect(view.eligibility).toBe('eligible-at-current-stock');
	});

	test('reports not-below-threshold exactly at the reorder threshold', () => {
		expect.assertions(1);
		const view = viewFor(storeGame([product('snacks', { initialQuantity: 10 })]), 'snacks');

		expect(view.eligibility).toBe('not-below-threshold');
	});

	test('reports blocked-by-zero-threshold for an empty shelf with threshold zero', () => {
		expect.assertions(1);
		const view = viewFor(
			storeGame([product('snacks', { initialQuantity: 0, reorderThreshold: 0 })]),
			'snacks'
		);

		expect(view.eligibility).toBe('blocked-by-zero-threshold');
	});

	test('reports not-replenishable-product outside the archetype catalog', () => {
		expect.assertions(1);
		// Apparel never belongs to the convenience archetype, mirroring the
		// authoritative replenishment guard.
		const view = viewFor(storeGame([product('apparel', { initialQuantity: 4 })]), 'apparel');

		expect(view.eligibility).toBe('not-replenishable-product');
	});

	test('reports assigned-city-with-import-fallback for a resolved supply city', () => {
		expect.assertions(3);
		const view = viewFor(storeGame([product('snacks', { initialQuantity: 4 })]), 'snacks');

		expect(view.supplyMode).toBe('assigned-city-with-import-fallback');
		expect(view.configuredSupplyCityId).toBe('industry-city');
		expect(view.resolvedSupplyCityId).toBe('industry-city');
	});

	test('reports unassigned-import-fallback without a supply assignment', () => {
		expect.assertions(3);
		const game: GameState = {
			...storeGame([product('snacks', { initialQuantity: 4 })]),
			retailSupplyAssignments: []
		};
		const view = viewFor(game, 'snacks');

		expect(view.supplyMode).toBe('unassigned-import-fallback');
		expect(view.configuredSupplyCityId).toBeNull();
		expect(view.resolvedSupplyCityId).toBeNull();
	});

	test('reports unavailable-source-import-fallback for a configured but unavailable source', () => {
		expect.assertions(3);
		const game: GameState = {
			...storeGame([product('snacks', { initialQuantity: 4 })]),
			retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: 'breadbasket-basin' }]
		};
		const view = viewFor(game, 'snacks');

		expect(view.supplyMode).toBe('unavailable-source-import-fallback');
		expect(view.configuredSupplyCityId).toBe('breadbasket-basin');
		expect(view.resolvedSupplyCityId).toBeNull();
	});

	test('selects the latest receipt newest-first by report day', () => {
		expect.assertions(2);
		const game = storeGame([product('snacks', { initialQuantity: 4 })], {
			reports: [
				receiptReport(
					7,
					'store-1',
					[{ productId: 'snacks', warehouseUnits: 5, importedUnits: 0 }],
					assignedContext
				),
				receiptReport(
					14,
					'store-1',
					[{ productId: 'snacks', warehouseUnits: 2, importedUnits: 3 }],
					assignedContext
				)
			]
		});
		const view = viewFor(game, 'snacks');

		expect(view.lastReceipt?.day).toBe(14);
		expect(view.lastReceipt).toMatchObject({
			warehouseUnits: 2,
			importedUnits: 3,
			outcome: 'mixed'
		});
	});

	test.each([
		[
			'local-only receipt as city-inventory',
			{ warehouseUnits: 5, importedUnits: 0 },
			assignedContext,
			'city-inventory'
		],
		['mixed receipt as mixed', { warehouseUnits: 3, importedUnits: 2 }, assignedContext, 'mixed'],
		[
			'assigned import-only receipt as import-only',
			{ warehouseUnits: 0, importedUnits: 4 },
			assignedContext,
			'import-only'
		],
		[
			'unassigned import receipt as unassigned-import',
			{ warehouseUnits: 0, importedUnits: 4 },
			unassignedContext,
			'unassigned-import'
		]
	] as const)('classifies a %s', (_label, quantities, replenishment, expectedOutcome) => {
		expect.assertions(1);
		const game = storeGame([product('snacks', { initialQuantity: 4 })], {
			reports: [
				receiptReport(7, 'store-1', [{ productId: 'snacks', ...quantities }], replenishment)
			]
		});

		expect(viewFor(game, 'snacks').lastReceipt?.outcome).toBe(expectedOutcome);
	});

	test('keeps historical receipt evidence visible when current stock is empty again', () => {
		expect.assertions(4);
		const game = storeGame([product('snacks', { initialQuantity: 0 })], {
			reports: [
				receiptReport(
					7,
					'store-1',
					[{ productId: 'snacks', warehouseUnits: 6, importedUnits: 0 }],
					assignedContext
				)
			]
		});
		const view = viewFor(game, 'snacks');

		expect(view.currentStock).toBe(0);
		expect(view.status).toBe('Out of stock');
		expect(view.lastReceipt?.day).toBe(7);
		expect(view.lastReceipt).toMatchObject({
			warehouseUnits: 6,
			importedUnits: 0,
			outcome: 'city-inventory'
		});
	});

	test('leaves lastReceipt null without positive receipt quantities', () => {
		expect.assertions(2);
		const game = storeGame([product('snacks', { initialQuantity: 4 })], {
			reports: [
				receiptReport(
					7,
					'store-1',
					[{ productId: 'snacks', warehouseUnits: 0, importedUnits: 0 }],
					assignedContext
				)
			]
		});

		expect(viewFor(game, 'snacks').lastReceipt).toBeNull();
		expect(
			viewFor(storeGame([product('snacks', { initialQuantity: 4 })]), 'snacks').lastReceipt
		).toBeNull();
	});

	test('reading recovery views leaves the game state untouched', () => {
		expect.assertions(6);
		const game = storeGame([product('snacks', { initialQuantity: 4 })], {
			reports: [
				receiptReport(
					7,
					'store-1',
					[{ productId: 'snacks', warehouseUnits: 5, importedUnits: 0 }],
					assignedContext
				)
			]
		});
		const snapshot = structuredClone(game);

		buildStoreStockRecoveryViews(game, game.stores[0]!.id);

		expect(game).toEqual(snapshot);
		expect(game.rngState).toBe(snapshot.rngState);
		expect(game.cash).toBe(snapshot.cash);
		expect(game.reports).toEqual(snapshot.reports);
		expect(game.stores[0]!.products[0]!.lots).toEqual(snapshot.stores[0]!.products[0]!.lots);
		expect(game.retailSupplyAssignments).toEqual(snapshot.retailSupplyAssignments);
	});
});
