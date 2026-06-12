import { describe, expect, it } from 'vitest';
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
	});

	it('returns an empty graph for categories without chains', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'apparel' });

		expect(tree.nodes).toEqual([]);
		expect(tree.emptyReason).toBe('No local production chain available for this category yet.');
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
