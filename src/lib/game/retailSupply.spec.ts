import { describe, expect, test } from 'vitest';
import { createNewGame } from './state';
import {
	applyWeeklyReplenishment,
	isReplenishmentDay,
	setRetailSupplySource
} from './retailSupply';
import { DEFAULT_SIMULATION_RULES } from './simulationRules';
import type { SimulationRuleSource, SimulationRules } from './simulationRules';
import type { GameState, MaterialId, StoreProduct } from './types';
import { createOpenedMultiCityFixture } from './cityInventory.testUtils';

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

function withOneReplenishmentProduct(game: GameState): GameState {
	const product: StoreProduct = {
		categoryId: 'snacks',
		stock: 4,
		reorderThreshold: 10,
		targetStock: 25,
		sellingPrice: 5
	};

	return {
		...game,
		stores: [{ ...game.stores[0]!, products: [product] }]
	};
}

function withIndustrySnacks(game: GameState, snacks: number): GameState {
	return withIndustryMaterials(game, { snacks });
}

function withIndustryMaterials(
	game: GameState,
	materials: Partial<Record<MaterialId, number>>
): GameState {
	return {
		...game,
		cityInventories: game.cityInventories!.map((inventory) =>
			inventory.cityId === 'industry-city'
				? {
						...inventory,
						capacity: 200,
						materials,
						overflowUnits: 0,
						overflowCost: 0
					}
				: inventory
		)
	};
}

function createReplenishmentStore(
	game: GameState,
	id: string,
	cityId: 'harbor-city' | 'campus-junction'
) {
	return {
		...game.stores[0]!,
		id,
		name: id,
		cityId,
		tileId: `${cityId}-${id}`,
		products: [
			{
				categoryId: 'bottled-water',
				stock: 0,
				reorderThreshold: 1,
				targetStock: 10,
				sellingPrice: 3
			}
		]
	};
}

describe('retail supply assignment', () => {
	test('uses the existing seven-day replenishment cadence', () => {
		expect.assertions(4);

		expect(isReplenishmentDay(0)).toBe(false);
		expect(isReplenishmentDay(1)).toBe(false);
		expect(isReplenishmentDay(7)).toBe(true);
		expect(isReplenishmentDay(14)).toBe(true);
	});

	test('assigns an opened industrial source and supports an explicit imports-only source', () => {
		expect.assertions(6);
		const game = createNewGame('convenience', 292_501);
		const importsOnly = setRetailSupplySource(game, 'harbor-city', null);
		const restored = setRetailSupplySource(importsOnly.game, 'harbor-city', 'industry-city');

		expect(importsOnly).toMatchObject({ ok: true, changed: true });
		expect(importsOnly.game).not.toBe(game);
		expect(importsOnly.game.retailSupplyAssignments).toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: null }
		]);
		expect(restored).toMatchObject({ ok: true, changed: true });
		expect(restored.game.retailSupplyAssignments).toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }
		]);
		expect(restored.game.cityInventories).toBe(game.cityInventories);
	});

	test('does not create a new game state when assigning the current source', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 292_502);
		const result = setRetailSupplySource(game, 'harbor-city', 'industry-city');

		expect(result).toMatchObject({ ok: true, changed: false });
		expect(result.game).toBe(game);
		expect(result.game.retailSupplyAssignments).toBe(game.retailSupplyAssignments);
	});

	test.each([
		['unknown retail city', 'missing-city', null, 'unknown-retail-city'],
		['closed retail city', 'campus-junction', null, 'retail-city-closed'],
		['unsupported retail city', 'industry-city', null, 'unsupported-retail-city'],
		['unknown supply city', 'harbor-city', 'missing-city', 'unknown-supply-city'],
		['closed supply city', 'harbor-city', 'breadbasket-basin', 'supply-city-closed'],
		['unsupported supply city', 'harbor-city', 'harbor-city', 'unsupported-supply-city']
	] as const)(
		'rejects an %s without mutating the game',
		(_label, retailCityId, supplyCityId, reason) => {
			expect.assertions(3);
			const game = createNewGame('convenience', 292_503);
			const result = setRetailSupplySource(game, retailCityId, supplyCityId);

			expect(result).toMatchObject({ ok: false, reason });
			expect(result.game).toBe(game);
			expect(result.game.retailSupplyAssignments).toBe(game.retailSupplyAssignments);
		}
	);
});

describe('weekly retail replenishment', () => {
	test.each([
		{
			name: 'debits a fully stocked source city',
			snacks: 21,
			assignment: 'industry-city',
			expected: {
				warehouseUnits: 21,
				warehouseValue: 168,
				importedUnits: 0,
				importCost: 3,
				importSpend: 0,
				outcome: 'city-inventory',
				remainingSnacks: 0,
				context: {
					retailCityId: 'harbor-city',
					configuredSupplyCityId: 'industry-city',
					resolvedSupplyCityId: 'industry-city'
				}
			}
		},
		{
			name: 'mixes a partial source city with paid imports',
			snacks: 12,
			assignment: 'industry-city',
			expected: {
				warehouseUnits: 12,
				warehouseValue: 96,
				importedUnits: 9,
				importCost: 3,
				importSpend: 27,
				outcome: 'mixed',
				remainingSnacks: 0,
				context: {
					retailCityId: 'harbor-city',
					configuredSupplyCityId: 'industry-city',
					resolvedSupplyCityId: 'industry-city'
				}
			}
		},
		{
			name: 'imports when the resolved source has no relevant stock',
			snacks: 0,
			assignment: 'industry-city',
			expected: {
				warehouseUnits: 0,
				warehouseValue: 0,
				importedUnits: 21,
				importCost: 3,
				importSpend: 63,
				outcome: 'import-only',
				remainingSnacks: 0,
				context: {
					retailCityId: 'harbor-city',
					configuredSupplyCityId: 'industry-city',
					resolvedSupplyCityId: 'industry-city'
				}
			}
		},
		{
			name: 'imports for an explicit imports-only assignment',
			snacks: 21,
			assignment: null,
			expected: {
				warehouseUnits: 0,
				warehouseValue: 0,
				importedUnits: 21,
				importCost: 3,
				importSpend: 63,
				outcome: 'unassigned-import',
				remainingSnacks: 21,
				context: {
					retailCityId: 'harbor-city',
					configuredSupplyCityId: null,
					resolvedSupplyCityId: null
				}
			}
		},
		{
			name: 'imports without mutating a usable inventory for an unavailable source',
			snacks: 21,
			assignment: 'breadbasket-basin',
			expected: {
				warehouseUnits: 0,
				warehouseValue: 0,
				importedUnits: 21,
				importCost: 3,
				importSpend: 63,
				outcome: 'source-unavailable-import',
				remainingSnacks: 21,
				context: {
					retailCityId: 'harbor-city',
					configuredSupplyCityId: 'breadbasket-basin',
					resolvedSupplyCityId: null
				}
			}
		}
	] as const)('$name', ({ snacks, assignment, expected }) => {
		expect.assertions(10);
		const game = withOneReplenishmentProduct(
			withIndustrySnacks(createNewGame('convenience', 292_504), snacks)
		);
		const assigned = {
			...game,
			retailSupplyAssignments: game.retailSupplyAssignments!.map((candidate) => ({
				...candidate,
				supplyCityId: assignment
			}))
		};
		const result = applyWeeklyReplenishment({ game: assigned, storeReports: new Map() });
		const store = result.stores[0]!;
		const report = result.productReports.get(store.id)![0]!;
		const inventory = result.cityInventories!.find(
			(candidate) => candidate.cityId === 'industry-city'
		)!;

		expect(store.products[0]!.stock).toBe(25);
		expect(report.warehouseUnits).toBe(expected.warehouseUnits);
		expect(report.warehouseValue).toBe(expected.warehouseValue);
		expect(report.importedUnits).toBe(expected.importedUnits);
		expect(report.importCost).toBe(expected.importCost);
		expect(report.importSpend).toBe(expected.importSpend);
		expect(report.replenishmentOutcome).toBe(expected.outcome);
		expect(result.importSpend).toBe(expected.importSpend);
		expect(result.storeReplenishmentContexts.get(store.id)).toEqual(expected.context);
		expect(inventory.materials.snacks).toBe(expected.remainingSnacks);
	});

	test('treats a missing assignment record as imports-only without consuming a city', () => {
		expect.assertions(6);
		const game = {
			...withOneReplenishmentProduct(withIndustrySnacks(createNewGame('convenience', 292_513), 21)),
			retailSupplyAssignments: []
		};

		const result = applyWeeklyReplenishment({ game, storeReports: new Map() });
		const report = result.productReports.get(game.stores[0]!.id)![0]!;

		expect(report.warehouseUnits).toBe(0);
		expect(report.importedUnits).toBe(21);
		expect(report.replenishmentOutcome).toBe('unassigned-import');
		expect(result.cityInventories![0]!.materials.snacks).toBe(21);
		expect(result.storeReplenishmentContexts.get(game.stores[0]!.id)).toEqual({
			retailCityId: 'harbor-city',
			configuredSupplyCityId: null,
			resolvedSupplyCityId: null
		});
		expect(result.warehouse.materials.snacks).toBe(21);
	});

	test('does not use or copy the legacy aggregate warehouse when a source inventory is missing', () => {
		expect.assertions(6);
		const base = withOneReplenishmentProduct(createNewGame('convenience', 292_514));
		const game = {
			...base,
			cityInventories: [],
			warehouse: {
				...base.warehouse,
				materials: { snacks: 21 }
			}
		};

		const result = applyWeeklyReplenishment({ game, storeReports: new Map() });
		const report = result.productReports.get(game.stores[0]!.id)![0]!;

		expect(report.warehouseUnits).toBe(0);
		expect(report.importedUnits).toBe(21);
		expect(report.replenishmentOutcome).toBe('source-unavailable-import');
		expect(result.cityInventories).toEqual([]);
		expect(result.warehouse.materials).toEqual({});
		expect(game.warehouse.materials).toEqual({ snacks: 21 });
	});

	test('preserves an absent-city-inventory legacy aggregate without treating it as a source', () => {
		expect.assertions(6);
		const base = withOneReplenishmentProduct(createNewGame('convenience', 292_516));
		const game = {
			...base,
			cityInventories: undefined,
			warehouse: {
				...base.warehouse,
				materials: { snacks: 21 }
			}
		};

		const result = applyWeeklyReplenishment({ game, storeReports: new Map() });
		const report = result.productReports.get(game.stores[0]!.id)![0]!;

		expect(report.warehouseUnits).toBe(0);
		expect(report.importedUnits).toBe(21);
		expect(report.replenishmentOutcome).toBe('source-unavailable-import');
		expect(result.cityInventories).toBeUndefined();
		expect(result.warehouse).toBe(game.warehouse);
		expect(result.warehouse.materials).toEqual({ snacks: 21 });
	});

	test('merges replenishment fields onto the existing daily sales row', () => {
		expect.assertions(12);
		const game = withOneReplenishmentProduct(
			withIndustrySnacks(createNewGame('convenience', 292_515), 12)
		);
		const storeId = game.stores[0]!.id;
		const storeReports = new Map([
			[
				storeId,
				[
					{
						categoryId: 'snacks',
						name: 'Snacks',
						unitsSold: 2,
						demandMissed: 1,
						revenue: 10,
						costOfGoods: 6,
						grossMargin: 4,
						endingStock: 4,
						warehouseUnits: 0,
						warehouseValue: 0,
						importedUnits: 0,
						importCost: 3,
						importSpend: 0
					}
				]
			]
		]);

		const result = applyWeeklyReplenishment({ game, storeReports });
		const report = result.productReports.get(storeId)![0]!;

		expect(report.unitsSold).toBe(2);
		expect(report.demandMissed).toBe(1);
		expect(report.revenue).toBe(10);
		expect(report.costOfGoods).toBe(6);
		expect(report.grossMargin).toBe(4);
		expect(report.endingStock).toBe(25);
		expect(report.warehouseUnits).toBe(12);
		expect(report.warehouseValue).toBe(96);
		expect(report.importedUnits).toBe(9);
		expect(report.importCost).toBe(3);
		expect(report.importSpend).toBe(27);
		expect(report.replenishmentOutcome).toBe('mixed');
	});

	test('applies import modifiers only to the paid shortage and preserves local valuation', () => {
		expect.assertions(7);
		const game = withOneReplenishmentProduct(
			withIndustrySnacks(createNewGame('convenience', 292_505), 12)
		);
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

		const result = applyWeeklyReplenishment({ game, storeReports: new Map(), rules });
		const report = result.productReports.get(game.stores[0]!.id)![0]!;

		expect(report.warehouseUnits).toBe(12);
		expect(report.warehouseValue).toBe(96);
		expect(report.importedUnits).toBe(9);
		expect(report.importCost).toBe(3);
		expect(report.importSpend).toBe(49);
		expect(result.importSpend).toBe(49);
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

	test('keeps omitted and explicit default modifiers deeply equal', () => {
		expect.assertions(1);
		const base = createNewGame('electronics', 292_509);
		const game = {
			...base,
			stores: [
				{
					...base.stores[0]!,
					products: base.stores[0]!.products.map((product) => ({
						...product,
						stock: 0,
						reorderThreshold: 5,
						targetStock: 10
					}))
				}
			]
		};
		const input = { game, storeReports: new Map() };

		expect(applyWeeklyReplenishment(input)).toEqual(
			applyWeeklyReplenishment({ ...input, rules: DEFAULT_SIMULATION_RULES })
		);
	});

	test('rounds import spend after applying a retail product modifier to the entire shortage', () => {
		expect.assertions(1);
		const base = createNewGame('electronics', 292_510);
		const game = {
			...base,
			stores: [
				{
					...base.stores[0]!,
					products: [
						{
							categoryId: 'accessories',
							stock: 0,
							reorderThreshold: 1,
							targetStock: 3,
							sellingPrice: 22
						}
					]
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

		const result = applyWeeklyReplenishment({ game, storeReports: new Map(), rules });

		expect(result.productReports.get(game.stores[0]!.id)![0]!.importSpend).toBe(50);
	});

	test('does not apply an industrial-material modifier to a retail product import', () => {
		expect.assertions(2);
		const base = createNewGame('electronics', 292_511);
		const game = {
			...base,
			stores: [
				{
					...base.stores[0]!,
					products: [
						{ categoryId: 'games', stock: 0, reorderThreshold: 1, targetStock: 3, sellingPrice: 48 }
					]
				}
			]
		};
		const input = { game, storeReports: new Map() };
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

		const result = applyWeeklyReplenishment({ ...input, rules });

		expect(result).toEqual(applyWeeklyReplenishment(input));
		expect(result.importCostApplications).toEqual([]);
	});

	test('keeps one-retail-city shortage allocation in original store-array order', () => {
		expect.assertions(6);
		const base = withIndustryMaterials(createNewGame('convenience', 292_512), {
			'bottled-water': 10
		});
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
			stores: storeIds.map((storeId) => createReplenishmentStore(base, storeId, 'harbor-city'))
		};

		const result = applyWeeklyReplenishment({ game, storeReports: new Map() });
		const first = result.productReports.get('store-2')![0]!;
		const second = result.productReports.get('store-10')![0]!;

		expect(game.stores.slice(0, 2).map((store) => store.id)).toEqual(['store-2', 'store-10']);
		expect(result.stores.map((store) => store.id)).toEqual(storeIds);
		expect(result.cityInventories![0]!.materials['bottled-water']).toBe(0);
		expect(first.warehouseUnits).toBe(10);
		expect(first.importedUnits).toBe(0);
		expect(second.importedUnits).toBe(10);
	});

	test('resolves shared-source contention by retail city before restoring global store order', () => {
		expect.assertions(7);
		const base = createOpenedMultiCityFixture();
		const game = {
			...base,
			cityInventories: base.cityInventories!.map((inventory) =>
				inventory.cityId === 'industry-city'
					? {
							...inventory,
							capacity: 100,
							materials: { 'bottled-water': 20 }
						}
					: inventory
			),
			stores: [
				createReplenishmentStore(base, 'store-2', 'harbor-city'),
				createReplenishmentStore(base, 'store-campus', 'campus-junction'),
				createReplenishmentStore(base, 'store-10', 'harbor-city')
			]
		};

		const result = applyWeeklyReplenishment({ game, storeReports: new Map() });
		const reports = new Map(
			[...result.productReports.entries()].map(([storeId, productReports]) => [
				storeId,
				productReports[0]!
			])
		);

		expect(result.stores.map((store) => store.id)).toEqual(['store-2', 'store-campus', 'store-10']);
		expect(reports.get('store-2')!.warehouseUnits).toBe(10);
		expect(reports.get('store-2')!.importedUnits).toBe(0);
		expect(reports.get('store-10')!.warehouseUnits).toBe(10);
		expect(reports.get('store-10')!.importedUnits).toBe(0);
		expect(reports.get('store-campus')!.warehouseUnits).toBe(0);
		expect(reports.get('store-campus')!.importedUnits).toBe(10);
	});

	test('preserves authored product order while appending replenishment reports', () => {
		expect.assertions(3);
		const base = createNewGame('convenience', 292_506);
		const game = {
			...base,
			stores: [
				{
					...base.stores[0]!,
					products: [
						{
							categoryId: 'snacks',
							stock: 0,
							reorderThreshold: 1,
							targetStock: 2,
							sellingPrice: 5
						},
						{
							categoryId: 'bottled-water',
							stock: 0,
							reorderThreshold: 1,
							targetStock: 2,
							sellingPrice: 3
						}
					]
				}
			]
		};

		const result = applyWeeklyReplenishment({ game, storeReports: new Map() });
		const storeId = game.stores[0]!.id;

		expect(result.stores[0]!.products.map((product) => product.categoryId)).toEqual([
			'snacks',
			'bottled-water'
		]);
		expect(result.productReports.get(storeId)!.map((report) => report.categoryId)).toEqual([
			'snacks',
			'bottled-water'
		]);
		expect(result.storeReplenishmentContexts.get(storeId)).toEqual({
			retailCityId: 'harbor-city',
			configuredSupplyCityId: 'industry-city',
			resolvedSupplyCityId: 'industry-city'
		});
	});

	test('imports unsupported categories without consuming a city inventory material', () => {
		expect.assertions(6);
		const base = withIndustrySnacks(createNewGame('boutique', 292_507), 12);
		const game = {
			...base,
			stores: [
				{
					...base.stores[0]!,
					products: [
						{
							categoryId: 'apparel',
							stock: 4,
							reorderThreshold: 10,
							targetStock: 25,
							sellingPrice: 38
						}
					]
				}
			]
		};

		const result = applyWeeklyReplenishment({ game, storeReports: new Map() });
		const report = result.productReports.get(game.stores[0]!.id)![0]!;

		expect(result.stores[0]!.products[0]!.stock).toBe(25);
		expect(result.cityInventories![0]!.materials.snacks).toBe(12);
		expect('apparel' in result.cityInventories![0]!.materials).toBe(false);
		expect(report.warehouseUnits).toBe(0);
		expect(report.importedUnits).toBe(21);
		expect(report.replenishmentOutcome).toBe('import-only');
	});

	test('leaves non-attempted products and their store context untouched', () => {
		expect.assertions(4);
		const base = createNewGame('convenience', 292_508);
		const game = {
			...base,
			stores: [
				{
					...base.stores[0]!,
					products: [
						{
							categoryId: 'snacks',
							stock: 30,
							reorderThreshold: 10,
							targetStock: 100,
							sellingPrice: 5
						}
					]
				}
			]
		};

		const result = applyWeeklyReplenishment({ game, storeReports: new Map() });

		expect(result.stores[0]!.products[0]!.stock).toBe(30);
		expect(result.importSpend).toBe(0);
		expect(result.productReports.size).toBe(0);
		expect(result.storeReplenishmentContexts.get(game.stores[0]!.id)).toBeNull();
	});
});
