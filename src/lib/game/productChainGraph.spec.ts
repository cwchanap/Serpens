import { describe, expect, test } from 'vitest';
import {
	buildProductChainGraph,
	buildStoreCategoryChainSummaries,
	buildWarehouseFlowGraph,
	getSupportedStoreChainCategories
} from './productChainGraph';
import { buildIndustrialBuilding } from './industryPlacement';
import { addWarehouseMaterial } from './industryProduction';
import { createNewGame } from './state';
import type { DailyProductionReport, DailyStoreReport, GameState } from './types';

function emptyProductionReport(
	overrides: Partial<DailyProductionReport> = {}
): DailyProductionReport {
	return {
		produced: [],
		consumed: [],
		importedInputs: [],
		warehousePulls: [],
		shopImports: [],
		importSpend: 0,
		operatingCost: 0,
		overflowUnits: 0,
		overflowCost: 0,
		warehouseCapacity: 0,
		warehouseUsed: 0,
		...overrides
	};
}

function latestStoreReport(overrides: Partial<DailyStoreReport> = {}): DailyStoreReport {
	return {
		storeId: 'store-1',
		revenue: 120,
		costOfGoods: 50,
		grossMargin: 70,
		operatingCosts: 30,
		importSpend: 0,
		netIncome: 40,
		customersServed: 10,
		demandMissed: 2,
		staffingCoverage: 100,
		staffingShortage: { manager: 0, general: 0 },
		stockHealth: 82,
		staffMorale: 75,
		reputation: 55,
		marketPosition: 48,
		productReports: [
			{
				categoryId: 'snacks',
				name: 'Snacks',
				unitsSold: 8,
				demandMissed: 2,
				revenue: 80,
				costOfGoods: 32,
				grossMargin: 48,
				endingStock: 17,
				warehouseUnits: 6,
				warehouseValue: 48,
				importedUnits: 4,
				importCost: 12,
				importSpend: 48
			}
		],
		warnings: [],
		...overrides
	};
}

function withLatestReport(game: GameState, productionReport: DailyProductionReport): GameState {
	return {
		...game,
		reports: [
			{
				day: game.day,
				revenue: 120,
				costOfGoods: 50,
				grossMargin: 70,
				operatingCosts: 30,
				payrollCost: 0,
				importSpend: 48,
				netIncome: 40,
				cashAfter: game.cash + 40,
				scorecard: game.scorecard,
				productionReport,
				storeReports: [latestStoreReport()],
				warnings: []
			}
		]
	};
}

function buildWarehouse(game: GameState): GameState {
	const tile = game.industryCities[0]!.tiles.find(
		(candidate) => candidate.terrain === 'industrial' && !candidate.locked
	)!;

	return buildIndustrialBuilding(game, { tileId: tile.id, buildingTypeId: 'warehouse' });
}

describe('product chain graph discovery', () => {
	test('filters a store to product categories with supported chains', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);
		const store = game.stores[0]!;

		const categories = getSupportedStoreChainCategories(store);

		expect(categories.map((category) => category.id)).toEqual(['snacks', 'drinks', 'essentials']);
		expect(categories.every((category) => category.name.length > 0)).toBe(true);
	});
});

describe('product chain graph metrics', () => {
	test('builds a snacks graph with latest movement, capacity, warehouse stock, and import exposure', () => {
		expect.assertions(15);
		let game = { ...createNewGame('convenience', 20260518), cash: 100_000 };
		game = buildWarehouse(game);
		game = { ...game, warehouse: addWarehouseMaterial(game.warehouse, 'snacks', 12) };
		const productionReport = emptyProductionReport({
			produced: [{ materialId: 'snacks', quantity: 8, value: 64, source: 'local' }],
			consumed: [
				{ materialId: 'flour', quantity: 6, value: 18, source: 'warehouse' },
				{ materialId: 'packaging', quantity: 2, value: 6, source: 'import' }
			],
			importedInputs: [{ materialId: 'packaging', quantity: 2, value: 10, source: 'import' }],
			warehousePulls: [
				{ materialId: 'flour', quantity: 6, value: 18, source: 'warehouse' },
				{ materialId: 'snacks', quantity: 6, value: 48, source: 'warehouse' }
			],
			shopImports: [{ materialId: 'snacks', quantity: 4, value: 48, source: 'import' }],
			importSpend: 58,
			warehouseCapacity: 200,
			warehouseUsed: 12
		});
		game = withLatestReport(game, productionReport);

		const graph = buildProductChainGraph({ game, store: game.stores[0]!, categoryId: 'snacks' });
		const snacks = graph.nodes.find((node) => node.id === 'material:snacks');
		const packaging = graph.nodes.find((node) => node.id === 'material:packaging');
		const snackRecipe = graph.nodes.find((node) => node.id === 'recipe:snack-production');
		const snackOutputEdge = graph.edges.find(
			(edge) => edge.id === 'recipe:snack-production->material:snacks'
		);
		const packagingInputEdge = graph.edges.find(
			(edge) => edge.id === 'material:packaging->recipe:snack-production'
		);
		const flourInputEdge = graph.edges.find(
			(edge) => edge.id === 'material:flour->recipe:snack-production'
		);

		expect(graph.emptyReason).toBeNull();
		expect(graph.edges.some((edge) => edge.materialId === 'packaging')).toBe(true);
		expect(snacks?.actual.produced).toBe(8);
		expect(snacks?.actual.shopImported).toBe(4);
		expect(snacks?.warehouseStock).toBe(12);
		expect(packaging?.health).toBe('shortage');
		expect(snackRecipe?.capacity.outputPerDay).toBe(0);
		expect(snackRecipe?.health).toBe('no-local-capacity');
		expect(snackOutputEdge?.requiredPerCycle).toBe(8);
		expect(snackOutputEdge?.actualPerDay).toBe(8);
		expect(snackOutputEdge?.label).toBe('8/day produced · 8/cycle');
		expect(packagingInputEdge?.requiredPerCycle).toBe(2);
		expect(packagingInputEdge?.label).toBe('2/day used · 2/cycle · import');
		expect(flourInputEdge?.actualPerDay).toBe(6);
		expect(flourInputEdge?.label).toBe('6/day used · 6/cycle');
	});

	test('marks graphs without daily reports as no-report while preserving chain structure', () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260518);

		const graph = buildProductChainGraph({ game, store: game.stores[0]!, categoryId: 'snacks' });

		expect(graph.emptyReason).toBeNull();
		expect(graph.nodes.length).toBeGreaterThan(0);
		expect(graph.nodes.some((node) => node.health === 'no-report')).toBe(true);
		expect(graph.warnings).toContain('No daily report yet; latest-day flow is unavailable.');
	});

	test('returns an empty reason for unsupported product categories', () => {
		expect.assertions(2);
		const game = createNewGame('electronics', 20260518);

		const graph = buildProductChainGraph({ game, store: game.stores[0]!, categoryId: 'devices' });

		expect(graph.nodes).toEqual([]);
		expect(graph.emptyReason).toBe('No local production chain available for this category yet.');
	});
});

describe('store category chain summaries', () => {
	test('uses store sales as consume rate for finished category summaries', () => {
		expect.assertions(4);
		let game = createNewGame('convenience', 20260518);
		game = withLatestReport(
			game,
			emptyProductionReport({
				produced: [{ materialId: 'snacks', quantity: 8, value: 64, source: 'local' }],
				consumed: [{ materialId: 'flour', quantity: 6, value: 18, source: 'warehouse' }],
				warehousePulls: [{ materialId: 'snacks', quantity: 6, value: 48, source: 'warehouse' }],
				shopImports: [{ materialId: 'snacks', quantity: 4, value: 48, source: 'import' }]
			})
		);

		const summaries = buildStoreCategoryChainSummaries(game);
		const snacks = summaries.find((summary) => summary.categoryId === 'snacks');

		expect(snacks?.produced).toBe(8);
		expect(snacks?.consumed).toBe(8);
		expect(snacks?.imported).toBe(4);
		expect(snacks?.warehouseStock).toBe(0);
	});
});

describe('warehouse flow graph', () => {
	test('builds a warehouse-centered graph from stock and latest material movement', () => {
		expect.assertions(11);
		let game = createNewGame('convenience', 20260518);
		game = { ...game, warehouse: addWarehouseMaterial(game.warehouse, 'snacks', 14) };
		game = withLatestReport(
			game,
			emptyProductionReport({
				produced: [{ materialId: 'snacks', quantity: 8, value: 64, source: 'local' }],
				consumed: [{ materialId: 'flour', quantity: 6, value: 18, source: 'warehouse' }],
				importedInputs: [{ materialId: 'packaging', quantity: 2, value: 10, source: 'import' }],
				warehousePulls: [{ materialId: 'snacks', quantity: 6, value: 48, source: 'warehouse' }],
				shopImports: [{ materialId: 'snacks', quantity: 4, value: 48, source: 'import' }],
				importSpend: 58,
				warehouseCapacity: 0,
				warehouseUsed: 14,
				overflowUnits: 14,
				overflowCost: 28
			})
		);

		const graph = buildWarehouseFlowGraph(game);
		const warehouse = graph.nodes.find((node) => node.id === 'warehouse');
		const snacks = graph.nodes.find((node) => node.id === 'material:snacks');
		const snacksInEdge = graph.edges.find((edge) => edge.id === 'material:snacks->warehouse');
		const snacksOutEdge = graph.edges.find((edge) => edge.id === 'warehouse->material:snacks');

		expect(graph.emptyReason).toBeNull();
		expect(warehouse?.label).toBe('Warehouse');
		expect(warehouse?.health).toBe('shortage');
		expect(snacks?.actual.produced).toBe(8);
		expect(snacks?.actual.warehousePulled).toBe(6);
		expect(snacks?.actual.shopImported).toBe(4);
		expect(graph.edges.some((edge) => edge.id === 'material:snacks->warehouse')).toBe(true);
		expect(snacksInEdge?.actualPerDay).toBe(8);
		expect(snacksInEdge?.label).toBe('8/day in');
		expect(snacksOutEdge?.actualPerDay).toBe(6);
		expect(snacksOutEdge?.label).toBe('6/day out');
	});
});
