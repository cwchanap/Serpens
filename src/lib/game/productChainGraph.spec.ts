import { describe, expect, test } from 'vitest';
import {
	aggregateProductReports,
	buildProductChainGraph,
	buildStoreCategoryChainSummaries,
	buildWarehouseFlowGraph,
	getSupportedStoreChainCategories,
	SUPPORTED_FINISHED_MATERIALS
} from './productChainGraph';
import { MATERIALS, PRODUCTION_RECIPES } from './industry';
import { buildIndustrialBuilding } from './industryPlacement';
import { addWarehouseMaterial } from './industryProduction';
import { openStoreAtTile } from './placement';
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

	test('marks missed finished demand as a shortage even without import movement', () => {
		expect.assertions(3);
		let game = createNewGame('convenience', 20260518);
		game = {
			...game,
			industrialBuildings: [
				...game.industrialBuildings,
				{
					id: 'industry-building-snacks',
					level: 1,
					typeId: 'snack-factory',
					cityId: game.activeIndustryCityId,
					tileId: 'manual-snack-factory',
					mapX: 0,
					mapY: 0,
					status: 'produced',
					lastProduction: [],
					producedTotal: 0,
					importedInputTotal: 0,
					blockedDays: 0
				}
			]
		};
		game = withLatestReport(
			game,
			emptyProductionReport({
				produced: [{ materialId: 'snacks', quantity: 16, value: 128, source: 'local' }]
			})
		);
		game = {
			...game,
			reports: [
				{
					...game.reports[0]!,
					storeReports: [
						latestStoreReport({
							productReports: [snackProductReport({ unitsSold: 8, demandMissed: 12 })]
						})
					]
				}
			]
		};

		const graph = buildProductChainGraph({ game, store: game.stores[0]!, categoryId: 'snacks' });
		const snacks = graph.nodes.find((node) => node.id === 'material:snacks');

		expect(snacks?.actual.demandMissed).toBe(12);
		expect(snacks?.health).toBe('shortage');
		expect(snacks?.bottleneck).toBe('Snacks relied on imports or had a local shortage today.');
	});

	test('scales capacity by throughput multiplier when a producer is upgraded', () => {
		// Snack factory: outputs 8 snacks/cycle; inputs total 11/cycle (6 flour + 2 cooking-oil + 1 salt + 2 packaging).
		// At level 1 (throughput 1.0): output 8, input 11.
		// At level 3 (throughput 1.4): output 11.2, input 15.4.
		expect.assertions(8);
		const base = createNewGame('convenience', 20260518);
		const level1Game: GameState = {
			...base,
			industrialBuildings: [
				...base.industrialBuildings,
				{
					id: 'industry-building-snacks',
					level: 1,
					typeId: 'snack-factory',
					cityId: base.activeIndustryCityId,
					tileId: 'manual-snack-factory',
					mapX: 0,
					mapY: 0,
					status: 'idle',
					lastProduction: [],
					producedTotal: 0,
					importedInputTotal: 0,
					blockedDays: 0
				}
			]
		};
		const level3Game: GameState = {
			...level1Game,
			industrialBuildings: level1Game.industrialBuildings.map((building) =>
				building.id === 'industry-building-snacks' ? { ...building, level: 3 } : building
			)
		};

		const level1Graph = buildProductChainGraph({
			game: level1Game,
			store: level1Game.stores[0]!,
			categoryId: 'snacks'
		});
		const level3Graph = buildProductChainGraph({
			game: level3Game,
			store: level3Game.stores[0]!,
			categoryId: 'snacks'
		});

		const level1Recipe = level1Graph.nodes.find((node) => node.id === 'recipe:snack-production');
		const level3Recipe = level3Graph.nodes.find((node) => node.id === 'recipe:snack-production');
		const level3Material = level3Graph.nodes.find((node) => node.id === 'material:snacks');

		// buildingCount stays as the raw placed-building count.
		expect(level1Recipe?.capacity.buildingCount).toBe(1);
		expect(level3Recipe?.capacity.buildingCount).toBe(1);
		// Level-1 capacity is unscaled.
		expect(level1Recipe?.capacity.outputPerDay).toBe(8);
		expect(level1Recipe?.capacity.inputPerDay).toBe(11);
		// Level-3 capacity is scaled by the 1.4 throughput multiplier. (Capacity is a
		// forecast, so we keep fractional units rather than rounding to integers.)
		expect(level3Recipe?.capacity.outputPerDay).toBeCloseTo(11.2, 5);
		expect(level3Recipe?.capacity.inputPerDay).toBeCloseTo(15.4, 5);
		// The material node inherits the same throughput-scaled capacity.
		expect(level3Material?.capacity.outputPerDay).toBeCloseTo(11.2, 5);
		expect(level3Material?.capacity.inputPerDay).toBeCloseTo(15.4, 5);
	});
});

describe('product chain graph edge allocation', () => {
	test('splits shared input movement across recipe edges in one chain', () => {
		expect.assertions(4);
		const game = withLatestReport(
			createNewGame('convenience', 20260518),
			emptyProductionReport({
				consumed: [{ materialId: 'water', quantity: 16, value: 16, source: 'warehouse' }],
				warehousePulls: [{ materialId: 'water', quantity: 16, value: 16, source: 'warehouse' }]
			})
		);

		const graph = buildProductChainGraph({ game, store: game.stores[0]!, categoryId: 'drinks' });
		const filtrationInput = graph.edges.find(
			(edge) => edge.id === 'material:water->recipe:water-filtration'
		);
		const syrupInput = graph.edges.find(
			(edge) => edge.id === 'material:water->recipe:syrup-production'
		);

		// Zero-capacity fallback splits the 16 consumed water across all
		// water-consuming recipes weighted by requiredPerCycle: filtration (12) +
		// syrup (4) + bottling (10) = 26. So filtration gets 16*12/26 = 7.38 and
		// syrup gets 16*4/26 = 2.46 (rounded to 2 decimals by roundFlowQuantity).
		expect(filtrationInput?.requiredPerCycle).toBe(12);
		expect(filtrationInput?.actualPerDay).toBe(7.38);
		expect(syrupInput?.requiredPerCycle).toBe(4);
		expect(syrupInput?.actualPerDay).toBe(2.46);
	});

	test('does not absorb shared input movement from other finished chains', () => {
		expect.assertions(4);
		const game = withLatestReport(
			createNewGame('convenience', 20260518),
			emptyProductionReport({
				produced: [
					{ materialId: 'snacks', quantity: 8, value: 64, source: 'local' },
					{ materialId: 'drinks', quantity: 10, value: 70, source: 'local' }
				],
				consumed: [{ materialId: 'packaging', quantity: 4, value: 12, source: 'warehouse' }],
				warehousePulls: [{ materialId: 'packaging', quantity: 4, value: 12, source: 'warehouse' }]
			})
		);

		const snacksGraph = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'snacks'
		});
		const drinksGraph = buildProductChainGraph({
			game,
			store: game.stores[0]!,
			categoryId: 'drinks'
		});
		const snacksPackaging = snacksGraph.edges.find(
			(edge) => edge.id === 'material:packaging->recipe:snack-production'
		);
		const drinksPackaging = drinksGraph.edges.find(
			(edge) => edge.id === 'material:packaging->recipe:drink-bottling'
		);

		expect(snacksPackaging?.actualPerDay).toBe(2);
		expect(snacksPackaging?.label).toBe('2/day used · 2/cycle');
		expect(drinksPackaging?.actualPerDay).toBe(2);
		expect(drinksPackaging?.label).toBe('2/day used · 2/cycle');
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

	test('aggregates consume rate across every store carrying the same category', () => {
		expect.assertions(3);
		let game = { ...createNewGame('convenience', 20260518), cash: 100_000 };
		const expansionTile = game.cities[0]!.tiles.find(
			(tile) => !tile.locked && tile.feature === null && tile.id !== game.stores[0]!.tileId
		)!;
		game = openStoreAtTile(game, {
			tileId: expansionTile.id,
			name: 'Store #2',
			archetypeId: 'convenience'
		});
		const firstStore = game.stores[0]!;
		const secondStore = game.stores[1]!;
		game = {
			...game,
			reports: [
				{
					day: game.day,
					revenue: 120,
					costOfGoods: 50,
					grossMargin: 70,
					operatingCosts: 30,
					payrollCost: 0,
					importSpend: 0,
					netIncome: 40,
					cashAfter: game.cash + 40,
					scorecard: game.scorecard,
					productionReport: emptyProductionReport({
						produced: [{ materialId: 'snacks', quantity: 8, value: 64, source: 'local' }]
					}),
					storeReports: [
						latestStoreReport({
							storeId: firstStore.id,
							productReports: [snackProductReport({ unitsSold: 8 })]
						}),
						latestStoreReport({
							storeId: secondStore.id,
							productReports: [snackProductReport({ unitsSold: 5 })]
						})
					],
					warnings: []
				}
			]
		};

		const snacks = buildStoreCategoryChainSummaries(game).find(
			(summary) => summary.categoryId === 'snacks'
		);

		expect(snacks?.produced).toBe(8);
		expect(snacks?.consumed).toBe(13);
		expect(snacks?.imported).toBe(0);
	});

	test('builds aggregate finished-product metrics when no specific store is selected', () => {
		expect.assertions(4);
		let game = { ...createNewGame('convenience', 20260518), cash: 100_000 };
		const expansionTile = game.cities[0]!.tiles.find(
			(tile) => !tile.locked && tile.feature === null && tile.id !== game.stores[0]!.tileId
		)!;
		game = openStoreAtTile(game, {
			tileId: expansionTile.id,
			name: 'Store #2',
			archetypeId: 'convenience'
		});
		const firstStore = game.stores[0]!;
		const secondStore = game.stores[1]!;
		game = {
			...game,
			reports: [
				{
					day: game.day,
					revenue: 120,
					costOfGoods: 50,
					grossMargin: 70,
					operatingCosts: 30,
					payrollCost: 0,
					importSpend: 0,
					netIncome: 40,
					cashAfter: game.cash + 40,
					scorecard: game.scorecard,
					productionReport: emptyProductionReport({
						produced: [{ materialId: 'snacks', quantity: 18, value: 144, source: 'local' }],
						warehousePulls: [
							{ materialId: 'snacks', quantity: 11, value: 88, source: 'warehouse' }
						],
						shopImports: [{ materialId: 'snacks', quantity: 2, value: 24, source: 'import' }]
					}),
					storeReports: [
						latestStoreReport({
							storeId: firstStore.id,
							productReports: [snackProductReport({ unitsSold: 8, demandMissed: 1 })]
						}),
						latestStoreReport({
							storeId: secondStore.id,
							productReports: [
								snackProductReport({
									unitsSold: 5,
									demandMissed: 3,
									warehouseUnits: 5,
									importedUnits: 0,
									importSpend: 0
								})
							]
						})
					],
					warnings: []
				}
			]
		};

		const graph = buildProductChainGraph({ game, store: null, categoryId: 'snacks' });
		const snacks = graph.nodes.find((node) => node.id === 'material:snacks');

		expect(snacks?.actual.unitsSold).toBe(13);
		expect(snacks?.actual.demandMissed).toBe(4);
		expect(snacks?.actual.warehousePulled).toBe(11);
		expect(snacks?.actual.shopImported).toBe(2);
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
