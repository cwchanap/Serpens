import { describe, expect, test } from 'vitest';
import {
	aggregateProductReports,
	buildWarehouseFlowGraph,
	getSupportedStoreChainCategories,
	SUPPORTED_FINISHED_MATERIALS
} from './productChainGraph';
import { MATERIALS, PRODUCTION_RECIPES } from './industry';
import { addWarehouseMaterial } from './industryProduction';
import { createNewGame } from './state';
import type {
	DailyProductReport,
	DailyProductionReport,
	DailyStoreReport,
	GameState
} from './types';

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

function snackProductReport(overrides: Partial<DailyProductReport> = {}): DailyProductReport {
	return {
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
		importSpend: 48,
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

describe('product chain graph discovery', () => {
	test('filters a store to product categories with supported chains', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);
		const store = game.stores[0]!;

		const categories = getSupportedStoreChainCategories(store);

		expect(categories.map((category) => category.id)).toEqual([
			'bottled-water',
			'snacks',
			'drinks',
			'essentials'
		]);
		expect(categories.every((category) => category.name.length > 0)).toBe(true);
	});

	test('keeps supported finished materials aligned with recipe outputs', () => {
		expect.assertions(2);
		const producedMaterialIds = Object.values(PRODUCTION_RECIPES).flatMap((recipe) =>
			recipe.outputs.map((output) => output.materialId)
		);
		const duplicateMaterialIds = producedMaterialIds.filter(
			(materialId, index) => producedMaterialIds.indexOf(materialId) !== index
		);
		const finishedMaterialIds = Object.values(MATERIALS)
			.filter(
				(material) => material.kind === 'finished' && producedMaterialIds.includes(material.id)
			)
			.map((material) => material.id)
			.sort();

		expect(duplicateMaterialIds).toEqual([]);
		expect([...SUPPORTED_FINISHED_MATERIALS].sort()).toEqual(finishedMaterialIds);
	});
});

describe('store category chain summaries', () => {
	test('weights aggregate import cost by imported units and reports zero without imports', () => {
		expect.assertions(5);

		const aggregate = aggregateProductReports('snacks', [
			snackProductReport({ importedUnits: 2, importCost: 12, importSpend: 24 }),
			snackProductReport({ importedUnits: 6, importCost: 9, importSpend: 54 })
		]);
		const noImportAggregate = aggregateProductReports('snacks', [
			snackProductReport({ importedUnits: 0, importCost: 12, importSpend: 0 }),
			snackProductReport({ importedUnits: 0, importCost: 9, importSpend: 0 })
		]);

		expect(aggregate?.importedUnits).toBe(8);
		expect(aggregate?.importSpend).toBe(78);
		expect(aggregate?.importCost).toBe(9.75);
		expect(noImportAggregate?.importedUnits).toBe(0);
		expect(noImportAggregate?.importCost).toBe(0);
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
