import { describe, expect, test } from 'vitest';
import {
	aggregateProductReports,
	allocateInputMovement,
	bottleneckText,
	buildWarehouseFlowGraph,
	createInputWeightMap,
	emptyActualMetrics,
	getSupportedStoreChainCategories,
	healthLabel,
	materialHealth,
	SUPPORTED_FINISHED_MATERIALS
} from './productChainGraph';
import { MATERIALS, PRODUCTION_RECIPES } from './industry';
import { buildIndustrialBuilding } from './industryPlacement';
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

	test('returns an empty graph before any warehouse stock or daily report exists', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260508);
		const graph = buildWarehouseFlowGraph(game);

		expect(graph.nodes).toEqual([]);
		expect(graph.edges).toEqual([]);
		expect(graph.emptyReason).toBe('No warehouse stock or daily report yet.');
	});

	test('counts placed warehouse buildings in the warehouse node capacity', () => {
		expect.assertions(2);
		let game = { ...createNewGame('convenience', 20260508), cash: 100_000 };
		const warehouseTile = game.industryCities[0]!.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;
		game = buildIndustrialBuilding(game, {
			tileId: warehouseTile.id,
			buildingTypeId: 'warehouse'
		});
		game = { ...game, warehouse: addWarehouseMaterial(game.warehouse, 'snacks', 5) };

		const graph = buildWarehouseFlowGraph(game);
		const warehouse = graph.nodes.find((node) => node.id === 'warehouse');

		expect(game.industrialBuildings.some((building) => building.typeId === 'warehouse')).toBe(true);
		expect(warehouse?.capacity.buildingCount).toBe(1);
	});
});

describe('healthLabel', () => {
	test('returns a human-readable label for each chain health state', () => {
		expect.assertions(5);
		expect(healthLabel('healthy')).toBe('Healthy');
		expect(healthLabel('watch')).toBe('Watch');
		expect(healthLabel('shortage')).toBe('Shortage');
		expect(healthLabel('no-local-capacity')).toBe('No local capacity');
		expect(healthLabel('no-report')).toBe('No report yet');
	});
});

describe('bottleneckText', () => {
	test('describes the bottleneck for each chain health state', () => {
		expect.assertions(5);
		expect(bottleneckText({ kind: 'material', health: 'healthy', label: 'Snacks' })).toBe(
			'Snacks is flowing locally.'
		);
		expect(bottleneckText({ kind: 'material', health: 'watch', label: 'Flour' })).toBe(
			'Flour stock is below latest downstream use.'
		);
		expect(bottleneckText({ kind: 'material', health: 'shortage', label: 'Drinks' })).toBe(
			'Drinks relied on imports or had a local shortage today.'
		);
		expect(bottleneckText({ kind: 'material', health: 'no-local-capacity', label: 'Grain' })).toBe(
			'Grain has no placed local producer.'
		);
		expect(bottleneckText({ kind: 'material', health: 'no-report', label: 'Salt' })).toBe(
			'Salt has no latest daily flow yet.'
		);
	});
});

describe('materialHealth', () => {
	test('flags a watch state when warehouse stock is below latest consumption', () => {
		expect.assertions(1);
		expect(
			materialHealth({
				hasReport: true,
				actual: { ...emptyActualMetrics(), consumed: 10 },
				warehouseStock: 3,
				producerBuildingCount: 0,
				hasProducerRecipe: false
			})
		).toBe('watch');
	});

	test('defaults to healthy when stock covers consumption and no imports occurred', () => {
		expect.assertions(1);
		expect(
			materialHealth({
				hasReport: true,
				actual: { ...emptyActualMetrics(), consumed: 5 },
				warehouseStock: 12,
				producerBuildingCount: 0,
				hasProducerRecipe: false
			})
		).toBe('healthy');
	});

	test('returns shortage when demand is missed or inputs are imported', () => {
		expect.assertions(2);
		expect(
			materialHealth({
				hasReport: true,
				actual: { ...emptyActualMetrics(), demandMissed: 4 },
				warehouseStock: 0,
				producerBuildingCount: 1,
				hasProducerRecipe: true
			})
		).toBe('shortage');
		expect(
			materialHealth({
				hasReport: true,
				actual: { ...emptyActualMetrics(), importedInput: 3 },
				warehouseStock: 2,
				producerBuildingCount: 1,
				hasProducerRecipe: true
			})
		).toBe('shortage');
	});

	test('returns no-local-capacity when a producer recipe has no placed buildings', () => {
		expect.assertions(1);
		expect(
			materialHealth({
				hasReport: true,
				actual: { ...emptyActualMetrics(), consumed: 0 },
				warehouseStock: 0,
				producerBuildingCount: 0,
				hasProducerRecipe: true
			})
		).toBe('no-local-capacity');
	});

	test('returns no-report when no daily report is available', () => {
		expect.assertions(1);
		expect(
			materialHealth({
				hasReport: false,
				actual: emptyActualMetrics(),
				warehouseStock: 0,
				producerBuildingCount: 0,
				hasProducerRecipe: false
			})
		).toBe('no-report');
	});
});

describe('allocateInputMovement', () => {
	test('returns zero for non-recipe node ids and recipe ids with no matching weight', () => {
		expect.assertions(2);
		const weights = createInputWeightMap([], null);

		expect(allocateInputMovement(weights, 'grain', 'warehouse', 10)).toBe(0);
		expect(allocateInputMovement(weights, 'grain', 'recipe:snack-production', 10)).toBe(0);
	});
});
