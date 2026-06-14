import { describe, expect, it } from 'vitest';
import { addWarehouseMaterial } from './industryProduction';
import { openStoreAtTile } from './placement';
import { buildProductChainTree, buildStoreCategoryChainSummaries } from './productChainTree';
import { createNewGame } from './state';
import type {
	DailyProductReport,
	DailyProductionReport,
	DailyStoreReport,
	GameState
} from './types';

function convenienceGame(): GameState {
	return { ...createNewGame('convenience', 20260611), cash: 1_000_000 };
}

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

describe('buildProductChainTree', () => {
	it('builds the bottled water chain as a three-node spine', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({
			game,
			store: game.stores[0]!,
			categoryId: 'bottled-water'
		});

		expect(tree.id).toBe('chain:bottled-water');
		expect(tree.emptyReason).toBeNull();
		expect(tree.nodes.map((node) => node.id)).toEqual([
			'recipe:water-pumping@water-bottling',
			'recipe:water-bottling',
			'product:bottled-water'
		]);
		expect(tree.edges.map((edge) => edge.id)).toEqual([
			'recipe:water-bottling->product:bottled-water',
			'recipe:water-pumping@water-bottling->recipe:water-bottling'
		]);
	});

	it('surfaces warehouse stock on a recipe node and labels imported input edges', () => {
		expect.assertions(3);
		let game = convenienceGame();
		game = { ...game, warehouse: addWarehouseMaterial(game.warehouse, 'snacks', 12) };
		game = withLatestReport(
			game,
			emptyProductionReport({
				consumed: [{ materialId: 'packaging', quantity: 2, value: 6, source: 'import' }],
				importedInputs: [{ materialId: 'packaging', quantity: 2, value: 10, source: 'import' }]
			})
		);

		const tree = buildProductChainTree({ game, store: game.stores[0]!, categoryId: 'snacks' });
		const snackFactory = tree.details['recipe:snack-production']!;
		const packagingNode = tree.details['recipe:packaging-production@snack-production']!;
		const packagingEdge = tree.edges.find(
			(edge) => edge.id === 'recipe:packaging-production@snack-production->recipe:snack-production'
		);

		expect(snackFactory.warehouseStock).toBe(12);
		expect(packagingEdge?.label).toContain('· import');
		// Zero placed packaging buildings overrides the material-level shortage
		// signal — the player must build before reports matter.
		expect(packagingNode.health).toBe('no-local-capacity');
	});

	it('gives every non-root node exactly one outgoing edge (tree property)', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'snacks' });

		const sourceCounts = new Map<string, number>();
		for (const edge of tree.edges) {
			sourceCounts.set(edge.source, (sourceCounts.get(edge.source) ?? 0) + 1);
		}
		for (const node of tree.nodes) {
			if (node.id === 'product:snacks') continue;
			expect(sourceCounts.get(node.id), `${node.id} must feed exactly one parent`).toBe(1);
		}
	});

	it('duplicates shared sub-chains per branch with unique path-suffixed ids', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'snacks' });

		const ids = tree.nodes.map((node) => node.id);
		expect(new Set(ids).size).toBe(ids.length);
		// In the snacks chain, packaging pulls pulp + plastic — both sub-chains
		// must appear under the packaging branch with path suffixes.
		expect(ids).toContain('recipe:pulp-milling@snack-production/packaging-production');
		expect(ids).toContain('recipe:plastic-production@snack-production/packaging-production');
	});

	it('marks duplicated producers with a shared branch count', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'drinks' });

		// Water pumping feeds filtration directly and syrup production in the drinks chain.
		const waterCopies = tree.nodes.filter((node) => node.recipeId === 'water-pumping');
		expect(waterCopies.length).toBeGreaterThanOrEqual(2);
		for (const copy of waterCopies) {
			expect(copy.sharedBranchCount).toBe(waterCopies.length);
		}
	});

	it('lays out a planar tree: each parent row sits within its children rows', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'snacks' });

		const byId = tree.details;
		const childrenOf = new Map<string, string[]>();
		for (const edge of tree.edges) {
			childrenOf.set(edge.target, [...(childrenOf.get(edge.target) ?? []), edge.source]);
		}
		for (const [parentId, childIds] of childrenOf) {
			const rows = childIds.map((id) => byId[id]!.row);
			expect(byId[parentId]!.row).toBeGreaterThanOrEqual(Math.min(...rows));
			expect(byId[parentId]!.row).toBeLessThanOrEqual(Math.max(...rows));
			// Every child sits exactly one layer to the left of its parent.
			for (const id of childIds) {
				expect(byId[id]!.layer).toBe(byId[parentId]!.layer - 1);
			}
		}
		// Leaves occupy distinct rows — no overlap.
		const leafRows = tree.nodes.filter((node) => !childrenOf.has(node.id)).map((node) => node.row);
		expect(new Set(leafRows).size).toBe(leafRows.length);
	});

	it('labels merged cards with the building name and output material', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'pantry' });

		const mill = tree.nodes.find(
			(node) => node.id === 'recipe:flour-milling@pantry-goods-production'
		);
		expect(mill?.label).toBe('Flour Mill');
		expect(mill?.subLabel).toBe('Flour');
		expect(mill?.kind).toBe('recipe');
		const root = tree.nodes.find((node) => node.id === 'product:pantry');
		expect(root?.label).toBe('Pantry Goods');
		expect(root?.kind).toBe('material');
	});

	it('flags chains with no placed buildings and no report', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({
			game,
			store: game.stores[0]!,
			categoryId: 'bottled-water'
		});

		expect(tree.warnings).toContain('No daily report yet; latest-day flow is unavailable.');
		const bottler = tree.details['recipe:water-bottling']!;
		expect(bottler.health).toBe('no-local-capacity');
		expect(bottler.capacity.buildingCount).toBe(0);
		expect(tree.details['product:bottled-water']!.health).toBe('no-report');
	});

	it('returns an empty graph for categories without chains', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'apparel' });

		expect(tree.nodes).toEqual([]);
		expect(tree.emptyReason).toBe('No local production chain available for this category yet.');
	});

	it('marks missed finished demand as a shortage even without import movement', () => {
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

		const tree = buildProductChainTree({ game, store: game.stores[0]!, categoryId: 'snacks' });
		const root = tree.details['product:snacks']!;

		expect(root.actual.demandMissed).toBe(12);
		expect(root.health).toBe('shortage');
		expect(root.bottleneck).toBe('Snacks relied on imports or had a local shortage today.');
	});

	it('scales capacity by throughput multiplier when a producer is upgraded', () => {
		// Snack factory: outputs 8 snacks/cycle; inputs total 11/cycle (6 flour + 2 cooking-oil + 1 salt + 2 packaging).
		// At level 1 (throughput 1.0): output 8, input 11.
		// At level 3 (throughput 1.4): output 11.2, input 15.4.
		expect.assertions(7);
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

		const level1Tree = buildProductChainTree({
			game: level1Game,
			store: level1Game.stores[0]!,
			categoryId: 'snacks'
		});
		const level3Tree = buildProductChainTree({
			game: level3Game,
			store: level3Game.stores[0]!,
			categoryId: 'snacks'
		});

		const level1Recipe = level1Tree.details['recipe:snack-production']!;
		const level3Recipe = level3Tree.details['recipe:snack-production']!;

		// buildingCount stays as the raw placed-building count.
		expect(level1Recipe.capacity.buildingCount).toBe(1);
		expect(level3Recipe.capacity.buildingCount).toBe(1);
		// Level-1 capacity is unscaled.
		expect(level1Recipe.capacity.outputPerDay).toBe(8);
		expect(level1Recipe.capacity.inputPerDay).toBe(11);
		// Level-3 capacity is scaled by the 1.4 throughput multiplier. (Capacity is a
		// forecast, so we keep fractional units rather than rounding to integers.)
		expect(level3Recipe.capacity.outputPerDay).toBeCloseTo(11.2, 5);
		expect(level3Recipe.capacity.inputPerDay).toBeCloseTo(15.4, 5);
		// The root product card carries retail metrics; capacity lives on the
		// factory card, so the root node's capacity is intentionally all-zero
		// even though a factory is built and upgraded.
		expect(level3Tree.details['product:snacks']!.capacity).toEqual({
			buildingCount: 0,
			outputPerDay: 0,
			inputPerDay: 0
		});
	});

	it('splits shared input movement across recipe edges feeding different branches', () => {
		expect.assertions(4);
		const game = withLatestReport(
			createNewGame('convenience', 20260518),
			emptyProductionReport({
				consumed: [{ materialId: 'water', quantity: 16, value: 16, source: 'warehouse' }],
				warehousePulls: [{ materialId: 'water', quantity: 16, value: 16, source: 'warehouse' }]
			})
		);

		const tree = buildProductChainTree({ game, store: game.stores[0]!, categoryId: 'drinks' });
		const filtrationInput = tree.edges.find(
			(edge) =>
				edge.id ===
				'recipe:water-pumping@drink-bottling/water-filtration->recipe:water-filtration@drink-bottling'
		);
		const syrupInput = tree.edges.find(
			(edge) =>
				edge.id ===
				'recipe:water-pumping@drink-bottling/syrup-production->recipe:syrup-production@drink-bottling'
		);

		// The weight map is scoped to recipes reachable in the Drinks tree, so
		// water is split only between filtration (12) + syrup (4) = 16, not the
		// sibling bottled-water chain. filtration gets 16*12/16 = 12 and syrup
		// gets 16*4/16 = 4 — the full 16 units stay inside the displayed chain.
		expect(filtrationInput?.requiredPerCycle).toBe(12);
		expect(filtrationInput?.actualPerDay).toBe(12);
		expect(syrupInput?.requiredPerCycle).toBe(4);
		expect(syrupInput?.actualPerDay).toBe(4);
	});

	it('does not leak input flow to a sibling chain with active production', () => {
		// Regression: when bottled-water is produced, its inferred water use
		// would previously dilute the Drinks tree's allocation even though
		// water-bottling is not part of the Drinks chain. With scoped weights
		// the Drinks tree fully accounts for its own water on its own edges.
		expect.assertions(3);
		const game = withLatestReport(
			createNewGame('convenience', 20260518),
			emptyProductionReport({
				produced: [
					{ materialId: 'filtered-water', quantity: 10, value: 20, source: 'local' },
					{ materialId: 'syrup', quantity: 8, value: 40, source: 'local' },
					{ materialId: 'bottled-water', quantity: 10, value: 50, source: 'local' }
				],
				consumed: [{ materialId: 'water', quantity: 26, value: 26, source: 'warehouse' }],
				warehousePulls: [{ materialId: 'water', quantity: 26, value: 26, source: 'warehouse' }]
			})
		);

		const tree = buildProductChainTree({ game, store: game.stores[0]!, categoryId: 'drinks' });
		const filtrationInput = tree.edges.find(
			(edge) =>
				edge.id ===
				'recipe:water-pumping@drink-bottling/water-filtration->recipe:water-filtration@drink-bottling'
		);
		const syrupInput = tree.edges.find(
			(edge) =>
				edge.id ===
				'recipe:water-pumping@drink-bottling/syrup-production->recipe:syrup-production@drink-bottling'
		);

		// inferredPerDay: filtration used 12 water/cycle * 1 cycle (10 produced /
		// 10 output) = 12; syrup used 4 water/cycle * 1 cycle (8 produced / 8
		// output) = 4. water-bottling's inferred 10 is excluded from the Drinks
		// tree, so the two edges sum to 16 — the water the Drinks chain actually
		// used — instead of being diluted across all 26 consumed units.
		expect(filtrationInput?.actualPerDay).toBe(12);
		expect(syrupInput?.actualPerDay).toBe(4);
		expect((filtrationInput?.actualPerDay ?? 0) + (syrupInput?.actualPerDay ?? 0)).toBe(16);
	});

	it('does not absorb shared input movement from other finished chains', () => {
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

		const snacksTree = buildProductChainTree({
			game,
			store: game.stores[0]!,
			categoryId: 'snacks'
		});
		const drinksTree = buildProductChainTree({
			game,
			store: game.stores[0]!,
			categoryId: 'drinks'
		});
		const snacksPackaging = snacksTree.edges.find(
			(edge) => edge.id === 'recipe:packaging-production@snack-production->recipe:snack-production'
		);
		const drinksPackaging = drinksTree.edges.find(
			(edge) => edge.id === 'recipe:packaging-production@drink-bottling->recipe:drink-bottling'
		);

		expect(snacksPackaging?.actualPerDay).toBe(2);
		expect(snacksPackaging?.label).toBe('2/day used · 2/cycle');
		expect(drinksPackaging?.actualPerDay).toBe(2);
		expect(drinksPackaging?.label).toBe('2/day used · 2/cycle');
	});
});

describe('buildStoreCategoryChainSummaries (tree)', () => {
	it('lists tier 1 categories first and carries the tier', () => {
		const game = convenienceGame();
		const summaries = buildStoreCategoryChainSummaries(game);

		expect(summaries[0]?.categoryId).toBe('bottled-water');
		expect(summaries[0]?.tier).toBe(1);
		expect(summaries.map((summary) => summary.categoryId)).toContain('snacks');
		const snacks = summaries.find((summary) => summary.categoryId === 'snacks');
		expect(snacks?.tier).toBe(3);
		const tiers = summaries.map((summary) => summary.tier ?? 99);
		expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
	});

	it('uses store sales as consume rate for finished category summaries', () => {
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

	it('aggregates root-node movement metrics across stores when no store is selected', () => {
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

		const tree = buildProductChainTree({ game, store: null, categoryId: 'snacks' });
		const root = tree.details['product:snacks']!;

		expect(root.actual.unitsSold).toBe(13);
		expect(root.actual.demandMissed).toBe(4);
		expect(root.actual.warehousePulled).toBe(11);
		expect(root.actual.shopImported).toBe(2);
	});

	it('aggregates consume rate across every store carrying the same category', () => {
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
});
