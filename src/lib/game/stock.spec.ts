import { describe, expect, test, vi } from 'vitest';
import { createRng, createRngFromState } from './rng';
import {
	DEFAULT_SIMULATION_RULES,
	type SimulationRuleSource,
	type SimulationRules
} from './simulationRules';
import { createNewGame } from './state';
import {
	applyWeeklyImports,
	buildCityDemandPools,
	calculateStockHealth,
	getFinishedMaterialIdForCategory,
	getStoreProductStatus,
	initializeStoreProducts,
	isImportDay,
	simulateProductSalesForCity,
	summarizeStockTrouble,
	updateStoreProduct
} from './stock';
import type { CompanyPolicy, GameState, StoreProduct } from './types';

const scenarioSource: SimulationRuleSource = {
	kind: 'scenario',
	sourceId: 'scenario:test:modifier:0'
};

const eventSource: SimulationRuleSource = {
	kind: 'event-modifier',
	sourceId: 'event-modifier-3',
	modifierId: 'event-modifier-3',
	eventId: 'supplier-opportunity',
	instanceId: 'event-instance-2',
	explanation: { key: 'events.supplierOpportunity.explanation', params: {} }
};

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

function createEqualSellerGame(storeIds: string[]): GameState {
	const game = createNewGame('convenience', 20260508);
	const baseStore = {
		...game.stores[0]!,
		products: [
			{
				categoryId: 'bottled-water',
				stock: 100,
				reorderThreshold: 10,
				targetStock: 100,
				sellingPrice: 3
			}
		]
	};

	return {
		...game,
		stores: storeIds.map((id) => ({
			...baseStore,
			id,
			name: id,
			tileId: `${id}-tile`
		}))
	};
}

function equalSellerCapacity(game: GameState): Map<string, number> {
	return new Map(game.stores.map((store) => [store.id, 100]));
}

describe('stock rules', () => {
	test('keeps omitted and explicit weekly-import defaults deeply equal', () => {
		const game = createNewGame('electronics', 280_008);
		const store = {
			...game.stores[0]!,
			products: game.stores[0]!.products.map((product) => ({
				...product,
				stock: 0,
				reorderThreshold: 5,
				targetStock: 10
			}))
		};
		const input = { game: { ...game, stores: [store] }, storeReports: new Map() };

		expect(applyWeeklyImports(input)).toEqual(
			applyWeeklyImports({ ...input, rules: DEFAULT_SIMULATION_RULES })
		);
	});

	test('doubles actual weekly spend for selected electronics products only', () => {
		const game = createNewGame('electronics', 280_009);
		const store = {
			...game.stores[0]!,
			products: [
				{ categoryId: 'games', stock: 1, reorderThreshold: 5, targetStock: 4, sellingPrice: 48 },
				{
					categoryId: 'accessories',
					stock: 2,
					reorderThreshold: 5,
					targetStock: 5,
					sellingPrice: 22
				},
				{ categoryId: 'devices', stock: 3, reorderThreshold: 5, targetStock: 6, sellingPrice: 240 }
			]
		};
		const input = { game: { ...game, stores: [store] }, storeReports: new Map() };
		const rules: SimulationRules = {
			importCostMultipliers: [
				{
					source: scenarioSource,
					scope: 'retail-product',
					target: { kind: 'ids', ids: ['games', 'accessories'] },
					multiplier: 2
				}
			]
		};
		const baseline = applyWeeklyImports(input);
		const doubled = applyWeeklyImports({ ...input, rules });
		const baselineReports = new Map(
			baseline.productReports.get(store.id)!.map((report) => [report.categoryId, report])
		);
		const doubledReports = new Map(
			doubled.productReports.get(store.id)!.map((report) => [report.categoryId, report])
		);

		expect(doubledReports.get('games')!.importSpend).toBe(
			baselineReports.get('games')!.importSpend * 2
		);
		expect(doubledReports.get('accessories')!.importSpend).toBe(
			baselineReports.get('accessories')!.importSpend * 2
		);
		expect(doubledReports.get('devices')!.importSpend).toBe(
			baselineReports.get('devices')!.importSpend
		);
	});

	test('multiplies only paid retail shortage and keeps warehouse valuation unchanged', () => {
		const game = {
			...createNewGame('convenience', 280_010),
			warehouse: {
				capacity: 200,
				materials: { snacks: 12 },
				overflowUnits: 0,
				overflowCost: 0
			}
		};
		const store = {
			...game.stores[0]!,
			products: [
				{ categoryId: 'snacks', stock: 4, reorderThreshold: 10, targetStock: 25, sellingPrice: 5 }
			]
		};
		const rules: SimulationRules = {
			importCostMultipliers: [
				{
					source: scenarioSource,
					scope: 'retail-product',
					target: { kind: 'ids', ids: ['snacks'] },
					multiplier: 2
				},
				{
					source: eventSource,
					scope: 'retail-product',
					target: { kind: 'all' },
					multiplier: 0.9
				}
			]
		};

		const result = applyWeeklyImports({
			game: { ...game, stores: [store] },
			storeReports: new Map(),
			rules
		});
		const report = result.productReports.get(store.id)![0]!;

		expect(report.warehouseUnits).toBe(12);
		expect(report.warehouseValue).toBe(96);
		expect(report.importedUnits).toBe(9);
		expect(report.importSpend).toBe(49);
		expect(result.importCostApplications).toEqual([
			{
				scope: 'retail-product',
				targetId: 'snacks',
				baselineCost: 27,
				resolvedMultiplier: 1.8,
				actualCost: 49,
				contributions: [
					{ source: eventSource, multiplier: 0.9 },
					{ source: scenarioSource, multiplier: 2 }
				]
			}
		]);
	});

	test('rounds weekly import spend after applying the multiplier to the whole shortage', () => {
		const game = createNewGame('electronics', 280_011);
		const store = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'accessories',
					stock: 0,
					reorderThreshold: 1,
					targetStock: 3,
					sellingPrice: 22
				}
			]
		};
		const rules: SimulationRules = {
			importCostMultipliers: [
				{
					source: scenarioSource,
					scope: 'retail-product',
					target: { kind: 'ids', ids: ['accessories'] },
					multiplier: 1.5
				}
			]
		};

		const result = applyWeeklyImports({
			game: { ...game, stores: [store] },
			storeReports: new Map(),
			rules
		});

		expect(result.productReports.get(store.id)![0]!.importSpend).toBe(50);
	});

	test('does not apply same-id industrial rules to weekly retail imports', () => {
		const game = createNewGame('electronics', 280_012);
		const store = {
			...game.stores[0]!,
			products: [
				{ categoryId: 'games', stock: 0, reorderThreshold: 1, targetStock: 3, sellingPrice: 48 }
			]
		};
		const input = { game: { ...game, stores: [store] }, storeReports: new Map() };
		const rules: SimulationRules = {
			importCostMultipliers: [
				{
					source: scenarioSource,
					scope: 'industrial-material',
					target: { kind: 'ids', ids: ['games'] },
					multiplier: 2
				}
			]
		};

		const result = applyWeeklyImports({ ...input, rules });
		expect(result).toEqual(applyWeeklyImports(input));
		expect(result.importCostApplications).toEqual([]);
	});

	test('initializes a single product at level 1', () => {
		expect.assertions(2);
		const products = initializeStoreProducts('convenience');

		expect(products.map((product) => product.categoryId)).toEqual(['bottled-water']);
		expect(products[0]!.sellingPrice).toBe(3);
	});

	test('initializes unlocked categories for a given level', () => {
		expect.assertions(3);
		expect(initializeStoreProducts('convenience', 4).map((p) => p.categoryId)).toEqual([
			'bottled-water',
			'snacks'
		]);
		expect(initializeStoreProducts('convenience', 7).map((p) => p.categoryId)).toEqual([
			'bottled-water',
			'snacks',
			'drinks'
		]);
		expect(initializeStoreProducts('convenience', 10).map((p) => p.categoryId)).toEqual([
			'bottled-water',
			'snacks',
			'drinks',
			'essentials'
		]);
	});

	test('maps boutique gifts to a locally producible finished material', () => {
		expect.assertions(1);

		expect(getFinishedMaterialIdForCategory('gifts')).toBe('gifts');
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

	test('builds city-wide demand pools from city demand and product weights', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260508);
		const pools = buildCityDemandPools(game, game.cities[0]!);

		expect(pools['bottled-water']).toBeGreaterThan(0);
		expect(pools.drinks).toBeUndefined();
	});

	test('applies retail city demand multipliers to city demand pools', () => {
		expect.assertions(5);
		const game = createNewGame('electronics', 20260508);
		const campusCity = {
			...game.cities[0]!,
			id: 'campus-junction',
			name: 'Campus Junction',
			tiles: game.cities[0]!.tiles.map((tile) => ({
				...tile,
				id: tile.id.replace('harbor-city', 'campus-junction'),
				cityId: 'campus-junction'
			}))
		};
		expect(campusCity.id).toContain('campus-junction');
		expect(campusCity.tiles.every((t) => t.cityId === 'campus-junction')).toBe(true);

		const campusGame = {
			...game,
			cities: [campusCity],
			activeCityId: 'campus-junction',
			stores: game.stores.map((store) => ({
				...store,
				cityId: 'campus-junction',
				tileId: store.tileId.replace('harbor-city', 'campus-junction')
			}))
		};
		expect(campusGame.stores.every((s) => s.tileId.includes('campus-junction'))).toBe(true);

		const harborPools = buildCityDemandPools(game, game.cities[0]!);
		const campusPools = buildCityDemandPools(campusGame, campusCity);

		expect(campusPools.games).toBeGreaterThan(harborPools.games ?? 0);
		expect(campusPools.devices).toBeUndefined();
	});

	test('shared city demand is consumed across stores selling the same category', () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260508);
		const firstStore = {
			...game.stores[0]!,
			stockHealth: 100,
			products: [
				{
					categoryId: 'snacks',
					stock: 100,
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			]
		};
		const secondStore = {
			...firstStore,
			id: 'store-2',
			name: 'Second Store',
			tileId: 'store-2-tile'
		};
		const result = simulateProductSalesForCity({
			game: { ...game, stores: [firstStore, secondStore] },
			city: game.cities[0]!,
			rng: createRng(5),
			storeCapacity: new Map([
				[firstStore.id, 100],
				[secondStore.id, 100]
			])
		});
		const sold = [...result.productReports.values()]
			.flat()
			.reduce((sum, report) => sum + report.unitsSold, 0);

		expect(result.productReports.get(firstStore.id)?.[0]?.unitsSold).toBeGreaterThan(0);
		expect(result.productReports.get(secondStore.id)?.[0]?.unitsSold).toBeGreaterThan(0);
		expect(sold).toBeLessThanOrEqual(result.initialDemand.snacks ?? 0);
		expect(result.remainingDemand.snacks).toBe((result.initialDemand.snacks ?? 0) - sold);
	});

	test('uses a code-unit seller tie-break independent of input order', () => {
		const ascending = createEqualSellerGame(['store-a', 'store-z']);
		const descending = createEqualSellerGame(['store-z', 'store-a']);
		const firstRng = createRngFromState(ascending.rngState);
		const secondRng = createRngFromState(descending.rngState);
		const localeCompare = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
			throw new Error('seller ordering must not use localeCompare');
		});

		try {
			const first = simulateProductSalesForCity({
				game: ascending,
				city: ascending.cities[0]!,
				rng: firstRng,
				storeCapacity: equalSellerCapacity(ascending)
			});
			const second = simulateProductSalesForCity({
				game: descending,
				city: descending.cities[0]!,
				rng: secondRng,
				storeCapacity: equalSellerCapacity(descending)
			});

			expect(Object.fromEntries(first.stores.map((store) => [store.id, store]))).toEqual(
				Object.fromEntries(second.stores.map((store) => [store.id, store]))
			);
			expect(firstRng.getState()).toBe(secondRng.getState());
			expect([...first.productReports.keys()]).toEqual(['store-a', 'store-z']);
		} finally {
			localeCompare.mockRestore();
		}
	});

	test('higher selling price reduces category units sold under stable conditions', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260508);
		const baseStore = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 100,
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			]
		};
		const premiumStore = {
			...baseStore,
			products: [{ ...baseStore.products[0]!, sellingPrice: 10 }]
		};
		const standard = simulateProductSalesForCity({
			game: { ...game, stores: [baseStore] },
			city: game.cities[0]!,
			rng: createRng(12),
			storeCapacity: new Map([[baseStore.id, 100]])
		});
		const premium = simulateProductSalesForCity({
			game: { ...game, stores: [premiumStore] },
			city: game.cities[0]!,
			rng: createRng(12),
			storeCapacity: new Map([[premiumStore.id, 100]])
		});

		expect(premium.productReports.get(premiumStore.id)?.[0]?.unitsSold).toBeLessThan(
			standard.productReports.get(baseStore.id)?.[0]?.unitsSold ?? 0
		);
	});

	test('weekly imports refill below-threshold rows to target and report spend', () => {
		expect.assertions(6);
		const game = createNewGame('convenience', 20260508);
		const store = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 4,
					reorderThreshold: 10,
					targetStock: 25,
					sellingPrice: 5
				}
			]
		};
		const result = applyWeeklyImports({
			game: { ...game, stores: [store] },
			storeReports: new Map([
				[
					store.id,
					[
						{
							categoryId: 'snacks',
							name: 'Snacks',
							unitsSold: 0,
							demandMissed: 0,
							revenue: 0,
							costOfGoods: 0,
							grossMargin: 0,
							endingStock: 4,
							warehouseUnits: 0,
							warehouseValue: 0,
							importedUnits: 0,
							importCost: 3,
							importSpend: 0
						}
					]
				]
			])
		});
		const product = result.stores[0]!.products[0]!;
		const report = result.productReports.get(store.id)![0]!;

		expect(isImportDay(7)).toBe(true);
		expect(product.stock).toBe(25);
		expect(report.endingStock).toBe(25);
		expect(report.importedUnits).toBe(21);
		expect(report.importSpend).toBe(63);
		expect(result.importSpend).toBe(63);
	});

	test('weekly refill pulls finished goods from warehouse before imports', () => {
		expect.assertions(7);
		const game = {
			...createNewGame('convenience', 20260508),
			warehouse: {
				capacity: 200,
				materials: { snacks: 12 },
				overflowUnits: 0,
				overflowCost: 0
			}
		};
		const store = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 4,
					reorderThreshold: 10,
					targetStock: 25,
					sellingPrice: 5
				}
			]
		};
		const result = applyWeeklyImports({
			game: { ...game, stores: [store] },
			storeReports: new Map()
		});
		const product = result.stores[0]!.products[0]!;
		const report = result.productReports.get(store.id)![0]!;

		expect(product.stock).toBe(25);
		expect(result.warehouse.materials.snacks).toBe(0);
		expect(report.warehouseUnits).toBe(12);
		expect(report.warehouseValue).toBe(96);
		expect(report.importedUnits).toBe(9);
		expect(report.importSpend).toBe(27);
		expect(result.importSpend).toBe(27);
	});

	test('allocates depleted warehouse inventory by store array order', () => {
		const base = createNewGame('convenience', 20260804);
		const storeIds = [
			'store-2',
			'store-10',
			'store-1',
			'store-3',
			'store-4',
			'store-5',
			'store-6',
			'store-7',
			'store-8',
			'store-9'
		];
		const game = {
			...base,
			warehouse: {
				capacity: 200,
				materials: { 'bottled-water': 10 },
				overflowUnits: 0,
				overflowCost: 0
			},
			stores: storeIds.map((id) => ({
				...base.stores[0]!,
				id,
				name: id,
				tileId: `${id}-tile`,
				products: [
					{
						categoryId: 'bottled-water',
						stock: 0,
						reorderThreshold: 1,
						targetStock: 10,
						sellingPrice: 3
					}
				]
			}))
		};

		const result = applyWeeklyImports({ game, storeReports: new Map() });
		const first = result.productReports.get('store-2')![0]!;
		const second = result.productReports.get('store-10')![0]!;

		expect(game.stores.slice(0, 2).map((store) => store.id)).toEqual(['store-2', 'store-10']);
		expect(result.warehouse.materials['bottled-water']).toBe(0);
		expect(first.warehouseUnits).toBe(10);
		expect(first.importedUnits).toBe(0);
		expect(second.warehouseUnits).toBe(0);
		expect(second.importedUnits).toBe(10);
	});

	test('store level multiplies product revenue without changing cost of goods', () => {
		expect.assertions(2);
		const base = createNewGame('convenience', 20260603);
		const city = base.cities[0]!;
		const storeCapacity = new Map(base.stores.map((store) => [store.id, 10_000]));

		const level1 = simulateProductSalesForCity({
			game: base,
			city,
			rng: createRng(base.rngState),
			storeCapacity
		});
		const leveledGame = { ...base, stores: [{ ...base.stores[0]!, level: 9 }] };
		const level9 = simulateProductSalesForCity({
			game: leveledGame,
			city,
			rng: createRng(base.rngState),
			storeCapacity: new Map(leveledGame.stores.map((store) => [store.id, 10_000]))
		});

		const storeId = base.stores[0]!.id;
		const rev1 = (level1.productReports.get(storeId) ?? []).reduce((t, r) => t + r.revenue, 0);
		const cog1 = (level1.productReports.get(storeId) ?? []).reduce((t, r) => t + r.costOfGoods, 0);
		const rev9 = (level9.productReports.get(storeId) ?? []).reduce((t, r) => t + r.revenue, 0);
		const cog9 = (level9.productReports.get(storeId) ?? []).reduce((t, r) => t + r.costOfGoods, 0);

		expect(rev9).toBeGreaterThan(rev1);
		expect(cog9).toBe(cog1);
	});

	test('weekly imports non-material categories without writing warehouse keys', () => {
		expect.assertions(7);
		const game = {
			...createNewGame('boutique', 20260508),
			warehouse: {
				capacity: 200,
				materials: { snacks: 12 },
				overflowUnits: 0,
				overflowCost: 0
			}
		};
		const store = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'apparel',
					stock: 4,
					reorderThreshold: 10,
					targetStock: 25,
					sellingPrice: 38
				}
			]
		};
		const result = applyWeeklyImports({
			game: { ...game, stores: [store] },
			storeReports: new Map()
		});
		const product = result.stores[0]!.products[0]!;
		const report = result.productReports.get(store.id)![0]!;

		expect(product.stock).toBe(25);
		expect(result.warehouse.materials).toEqual({ snacks: 12 });
		expect('apparel' in result.warehouse.materials).toBe(false);
		expect(report.warehouseUnits).toBe(0);
		expect(report.importedUnits).toBe(21);
		expect(report.importSpend).toBe(378);
		expect(result.importSpend).toBe(378);
	});

	test('boutique and electronics accessories keep separate category ids in the same city', () => {
		expect.assertions(4);
		const boutiqueGame = createNewGame('boutique', 20260604);
		const electronicsGame = createNewGame('electronics', 20260604);
		const boutiqueStore = {
			...boutiqueGame.stores[0]!,
			level: 10,
			products: initializeStoreProducts('boutique', 10)
		};
		const electronicsStore = {
			...electronicsGame.stores[0]!,
			id: 'store-electronics',
			name: 'Electronics Store',
			tileId: boutiqueStore.tileId + '-alt',
			level: 10,
			products: initializeStoreProducts('electronics', 10)
		};
		const boutiqueIds = boutiqueStore.products.map((product) => product.categoryId);
		const electronicsIds = electronicsStore.products.map((product) => product.categoryId);

		expect(boutiqueIds).toContain('fashion-accessories');
		expect(electronicsIds).toContain('accessories');
		expect(boutiqueIds).not.toContain('accessories');
		expect(electronicsIds).not.toContain('fashion-accessories');
	});

	test('boutique and electronics accessories resolve independent demand pools when co-located', () => {
		expect.assertions(3);
		const boutiqueGame = createNewGame('boutique', 20260604);
		const electronicsGame = createNewGame('electronics', 20260604);
		const city = boutiqueGame.cities[0]!;
		const boutiqueStore = {
			...boutiqueGame.stores[0]!,
			level: 10,
			products: initializeStoreProducts('boutique', 10)
		};
		const electronicsStore = {
			...electronicsGame.stores[0]!,
			id: 'store-electronics',
			name: 'Electronics Store',
			tileId: boutiqueStore.tileId + '-alt',
			level: 10,
			products: initializeStoreProducts('electronics', 10)
		};
		const combinedGame: GameState = {
			...boutiqueGame,
			stores: [boutiqueStore, electronicsStore]
		};
		const pools = buildCityDemandPools(combinedGame, city);

		expect(pools.accessories).toBeGreaterThan(0);
		expect(pools['fashion-accessories']).toBeGreaterThan(0);
		expect(pools.accessories).not.toBe(pools['fashion-accessories']);
	});
});

describe('tier 1 store products', () => {
	test('gives a new level-1 convenience store only bottled water', () => {
		expect.assertions(1);
		const products = initializeStoreProducts('convenience');
		expect(products.map((product) => product.categoryId)).toEqual(['bottled-water']);
	});

	test('maps the new categories to finished materials', () => {
		expect.assertions(3);
		expect(getFinishedMaterialIdForCategory('bottled-water')).toBe('bottled-water');
		expect(getFinishedMaterialIdForCategory('produce')).toBe('produce');
		expect(getFinishedMaterialIdForCategory('pantry')).toBe('pantry');
	});
});

describe('sales loop guards', () => {
	test('skips a category when the top-scoring seller archetype does not carry it', () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260508);
		const city = game.cities[0]!;
		const lowScoreStore = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 100,
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			],
			reputation: 10,
			staffCapacity: 10,
			competition: 50
		};
		const highScoreStore = {
			...game.stores[0]!,
			id: 'store-electronics',
			name: 'Electronics Store',
			tileId: `${game.stores[0]!.tileId}-alt`,
			archetypeId: 'electronics' as const,
			reputation: 100,
			staffCapacity: 100,
			competition: 0,
			products: [
				{
					categoryId: 'snacks',
					stock: 100,
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			]
		};
		const result = simulateProductSalesForCity({
			game: { ...game, stores: [lowScoreStore, highScoreStore] },
			city,
			rng: createRng(7),
			storeCapacity: new Map([
				[lowScoreStore.id, 100],
				[highScoreStore.id, 100]
			])
		});

		expect(Object.keys(result.initialDemand)).toEqual(['snacks']);
		expect(result.initialDemand.snacks).toBeGreaterThan(0);
		expect(result.productReports.size).toBe(0);
		expect(result.remainingDemand.snacks).toBe(result.initialDemand.snacks);
	});

	test('weekly imports leave products at or above their reorder threshold untouched', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260508);
		const store = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 30,
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			]
		};
		const result = applyWeeklyImports({
			game: { ...game, stores: [store] },
			storeReports: new Map()
		});
		const product = result.stores[0]!.products[0]!;

		expect(product.stock).toBe(30);
		expect(result.importSpend).toBe(0);
		expect(result.productReports.size).toBe(0);
	});

	test('weekly imports skip below-threshold products whose target is already met', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260508);
		const store = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'bottled-water',
					stock: 5,
					reorderThreshold: 10,
					targetStock: 5,
					sellingPrice: 3
				}
			]
		};
		const result = applyWeeklyImports({
			game: { ...game, stores: [store] },
			storeReports: new Map()
		});
		const product = result.stores[0]!.products[0]!;

		expect(product.stock).toBe(5);
		expect(result.importSpend).toBe(0);
		expect(result.productReports.size).toBe(0);
	});
});

describe('demand multipliers and stock ratios', () => {
	test('treats a product with no target stock as fully stocked', () => {
		expect.assertions(2);
		expect(
			calculateStockHealth([
				{ categoryId: 'snacks', stock: 0, reorderThreshold: 0, targetStock: 0, sellingPrice: 5 }
			])
		).toBe(100);
		expect(
			calculateStockHealth([
				{ categoryId: 'snacks', stock: 0, reorderThreshold: 0, targetStock: -5, sellingPrice: 5 }
			])
		).toBe(100);
	});

	test('applies each marketing and pricing multiplier to city demand pools', () => {
		expect.assertions(5);
		const game = createNewGame('convenience', 20260508);
		const city = game.cities[0]!;
		const pool = (marketing: CompanyPolicy['marketing'], pricing: CompanyPolicy['pricing']) =>
			buildCityDemandPools(game, city, { marketing, pricing })['bottled-water'];
		const standard = pool('awareness', 'standard');
		const none = pool('none', 'standard');
		const loyalty = pool('loyalty', 'standard');
		const promotions = pool('promotions', 'standard');
		const discount = pool('awareness', 'discount');
		const premium = pool('awareness', 'premium');

		expect(none).toBeGreaterThan(0);
		expect(none).toBeLessThan(loyalty);
		expect(loyalty).toBeLessThan(promotions);
		expect(premium).toBeLessThan(standard);
		expect(standard).toBeLessThan(discount);
	});
});

describe('branch coverage edge cases', () => {
	test('updateStoreProduct leaves sibling products untouched when updating one of many', () => {
		expect.assertions(3);
		const game = withOneStoreProducts([
			{ categoryId: 'snacks', stock: 8, reorderThreshold: 12, targetStock: 30, sellingPrice: 5 },
			{ categoryId: 'drinks', stock: 10, reorderThreshold: 5, targetStock: 40, sellingPrice: 4 }
		]);

		const updated = updateStoreProduct(game, 'store-1', 'snacks', { sellingPrice: 7 });
		const snacks = updated.stores[0]!.products.find((p) => p.categoryId === 'snacks')!;
		const drinks = updated.stores[0]!.products.find((p) => p.categoryId === 'drinks')!;

		expect(snacks.sellingPrice).toBe(7);
		expect(drinks.sellingPrice).toBe(4);
		expect(drinks).toBe(game.stores[0]!.products.find((p) => p.categoryId === 'drinks'));
	});

	test('updateStoreProduct leaves sibling stores untouched when updating one of many', () => {
		expect.assertions(3);
		const baseGame = createNewGame('convenience', 20260508);
		const expansionTile = baseGame.cities[0]!.tiles.find(
			(tile) => !tile.locked && tile.feature === null && tile.id !== baseGame.stores[0]!.tileId
		)!;
		const game = { ...baseGame, cash: 100_000 };
		const gameWithTwoStores = {
			...game,
			stores: [
				{
					...game.stores[0]!,
					products: [
						{
							categoryId: 'snacks',
							stock: 8,
							reorderThreshold: 12,
							targetStock: 30,
							sellingPrice: 5
						}
					]
				},
				{
					...game.stores[0]!,
					id: 'store-2',
					name: 'Store #2',
					tileId: expansionTile.id,
					products: [
						{
							categoryId: 'snacks',
							stock: 8,
							reorderThreshold: 12,
							targetStock: 30,
							sellingPrice: 5
						}
					]
				}
			]
		};

		const updated = updateStoreProduct(gameWithTwoStores, 'store-1', 'snacks', {
			sellingPrice: 9
		});

		expect(updated.stores[0]!.products[0]!.sellingPrice).toBe(9);
		expect(updated.stores[1]!.products[0]!.sellingPrice).toBe(5);
		expect(updated.stores[1]).toBe(gameWithTwoStores.stores[1]);
	});

	test('getFinishedMaterialIdForCategory returns null for non-finished materials', () => {
		expect.assertions(3);
		expect(getFinishedMaterialIdForCategory('water')).toBeNull();
		expect(getFinishedMaterialIdForCategory('flour')).toBeNull();
		expect(getFinishedMaterialIdForCategory('packaging')).toBeNull();
	});

	test('simulateProductSalesForCity treats a missing store capacity as zero', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260508);
		const store = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 100,
					reorderThreshold: 10,
					targetStock: 100,
					sellingPrice: 5
				}
			]
		};
		const result = simulateProductSalesForCity({
			game: { ...game, stores: [store] },
			city: game.cities[0]!,
			rng: createRng(3),
			storeCapacity: new Map()
		});
		const report = result.productReports.get(store.id)?.[0];

		expect(report).toBeDefined();
		expect(report?.unitsSold).toBe(0);
	});
});

describe('summarizeStockTrouble', () => {
	test('returns null when every product is healthy', () => {
		expect.assertions(1);
		expect(summarizeStockTrouble([{ stock: 50, reorderThreshold: 10 }])).toBeNull();
	});

	test('reports a single out-of-stock product', () => {
		expect.assertions(1);
		expect(summarizeStockTrouble([{ stock: 0, reorderThreshold: 10 }])).toBe(
			'1 product out of stock'
		);
	});

	test('uses singular subject-verb agreement for one needs-import product', () => {
		expect.assertions(1);
		expect(summarizeStockTrouble([{ stock: 5, reorderThreshold: 10 }])).toBe(
			'1 product needs import'
		);
	});

	test('counts out-of-stock and needs-import separately in mixed cases', () => {
		expect.assertions(1);
		const summary = summarizeStockTrouble([
			{ stock: 0, reorderThreshold: 10 },
			{ stock: 5, reorderThreshold: 10 },
			{ stock: 3, reorderThreshold: 10 }
		]);
		expect(summary).toBe('1 product out of stock, 2 products need import');
	});

	test('uses plural "products out of stock" when more than one is at zero stock', () => {
		expect.assertions(1);
		const summary = summarizeStockTrouble([
			{ stock: 0, reorderThreshold: 10 },
			{ stock: 0, reorderThreshold: 10 }
		]);
		expect(summary).toBe('2 products out of stock');
	});
});
