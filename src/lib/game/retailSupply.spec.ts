import { describe, expect, test } from 'vitest';
import { createNewGame } from './state';
import {
	applyWeeklyReplenishment,
	getRetailReplenishmentOutcome,
	isReplenishmentDay,
	setRetailSupplySource
} from './retailSupply';
import { DEFAULT_SIMULATION_RULES } from './simulationRules';
import type { SimulationRuleSource, SimulationRules } from './simulationRules';
import type {
	DailyProductReport,
	GameState,
	MaterialId,
	ProductId,
	RetailReplenishmentContext,
	StoreProduct
} from './types';
import { createOpenedMultiCityFixture } from './cityInventory.testUtils';
import { openWorldCity } from './world';

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
		productId: 'snacks',
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
		cityInventories: game.cityInventories.map((inventory) =>
			inventory.cityId === 'industry-city'
				? {
						...inventory,
						materials
					}
				: inventory
		)
	};
}

function createReplenishmentStore(
	game: GameState,
	id: string,
	cityId: 'harbor-city' | 'campus-junction'
): GameState['stores'][number] {
	return {
		...game.stores[0]!,
		id,
		name: id,
		cityId,
		tileId: `${cityId}-${id}`,
		products: [
			{
				productId: 'bottled-water',
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
		['unknown retail city', 'missing-city', null, 'invalid-retail-city'],
		['closed retail city', 'campus-junction', null, 'invalid-retail-city'],
		['unsupported retail city', 'industry-city', null, 'invalid-retail-city'],
		['unknown supply city', 'harbor-city', 'missing-city', 'invalid-supply-city'],
		['closed supply city', 'harbor-city', 'breadbasket-basin', 'invalid-supply-city'],
		['unsupported supply city', 'harbor-city', 'harbor-city', 'invalid-supply-city']
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

	test('inserts a new assignment in catalog order when no existing entry matches', () => {
		expect.assertions(3);
		const base = createNewGame('convenience', 292_509);
		const game: GameState = { ...base, retailSupplyAssignments: [] };

		const result = setRetailSupplySource(game, 'harbor-city', 'industry-city');

		expect(result).toMatchObject({ ok: true, changed: true });
		expect(result.game).not.toBe(game);
		expect(result.game.retailSupplyAssignments).toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }
		]);
	});

	test('sorts multiple new assignments by catalog order', () => {
		expect.assertions(2);
		const base = createNewGame('convenience', 292_512);
		const opened = openWorldCity(
			{
				...base,
				cash: 1_000_000,
				world: {
					...base.world,
					revealedCityIds: [...base.world.revealedCityIds, 'campus-junction']
				}
			},
			'campus-junction'
		);
		const game: GameState = { ...opened, retailSupplyAssignments: [] };

		const withCampus = setRetailSupplySource(game, 'campus-junction', 'industry-city');
		const withHarbor = setRetailSupplySource(withCampus.game, 'harbor-city', 'industry-city');

		expect(withHarbor).toMatchObject({ ok: true, changed: true });
		expect(withHarbor.game.retailSupplyAssignments).toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
			{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
		]);
	});

	test('updates only the matching assignment and leaves siblings untouched', () => {
		expect.assertions(3);
		const base = createNewGame('convenience', 292_520);
		const opened = openWorldCity(
			{
				...base,
				cash: 1_000_000,
				world: {
					...base.world,
					revealedCityIds: [...base.world.revealedCityIds, 'campus-junction']
				}
			},
			'campus-junction'
		);
		// Start with two assignments both sourcing from industry-city.
		const game: GameState = {
			...opened,
			retailSupplyAssignments: [
				{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
				{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
			]
		};

		// Switch only harbor-city to imports-only; campus-junction must stay.
		const result = setRetailSupplySource(game, 'harbor-city', null);

		expect(result).toMatchObject({ ok: true, changed: true });
		expect(result.game.retailSupplyAssignments).toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: null },
			{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
		]);
		expect(result.game).not.toBe(game);
	});
});

describe('retail replenishment outcomes', () => {
	const availableSupply: RetailReplenishmentContext = {
		retailCityId: 'harbor-city',
		configuredSupplyCityId: 'industry-city',
		resolvedSupplyCityId: 'industry-city'
	};

	test.each([
		['zero replenishment', availableSupply, { warehouseUnits: 0, importedUnits: 0 }, null],
		[
			'local replenishment',
			availableSupply,
			{ warehouseUnits: 7, importedUnits: 0 },
			'city-inventory'
		],
		['mixed replenishment', availableSupply, { warehouseUnits: 4, importedUnits: 3 }, 'mixed'],
		[
			'import-only replenishment',
			availableSupply,
			{ warehouseUnits: 0, importedUnits: 6 },
			'import-only'
		],
		[
			'imports-only configuration',
			{
				retailCityId: 'harbor-city',
				configuredSupplyCityId: null,
				resolvedSupplyCityId: null
			},
			{ warehouseUnits: 0, importedUnits: 6 },
			'unassigned-import'
		],
		[
			'unavailable configured source',
			{
				retailCityId: 'harbor-city',
				configuredSupplyCityId: 'industry-city',
				resolvedSupplyCityId: null
			},
			{ warehouseUnits: 0, importedUnits: 6 },
			'source-unavailable-import'
		]
	] as const)('derives %s from replenishment facts', (_name, context, report, expected) => {
		expect(getRetailReplenishmentOutcome(context, report)).toBe(expected);
	});
});

describe('weekly retail replenishment', () => {
	test('rejects invalid store ownership before grouping stores for replenishment', () => {
		expect.assertions(1);
		const base = withOneReplenishmentProduct(createNewGame('convenience', 292_523));
		const game: GameState = {
			...base,
			stores: [{ ...base.stores[0]!, cityId: 'industry-city' }]
		};

		expect(() => applyWeeklyReplenishment({ game, storeReports: new Map() })).toThrow(
			/city ownership/i
		);
	});

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
		expect(report).not.toHaveProperty('replenishmentOutcome');
		expect(result.importSpend).toBe(expected.importSpend);
		expect(result.storeReplenishmentContexts.get(store.id)).toEqual(expected.context);
		expect(inventory.materials.snacks).toBe(expected.remainingSnacks);
	});

	test('treats a missing assignment record as imports-only without consuming a city', () => {
		expect.assertions(6);
		const game: GameState = {
			...withOneReplenishmentProduct(withIndustrySnacks(createNewGame('convenience', 292_513), 21)),
			retailSupplyAssignments: []
		};

		const result = applyWeeklyReplenishment({ game, storeReports: new Map() });
		const report = result.productReports.get(game.stores[0]!.id)![0]!;

		expect(report.warehouseUnits).toBe(0);
		expect(report.importedUnits).toBe(21);
		expect(report).not.toHaveProperty('replenishmentOutcome');
		expect(result.cityInventories[0]!.materials.snacks).toBe(21);
		expect(result.storeReplenishmentContexts.get(game.stores[0]!.id)).toEqual({
			retailCityId: 'harbor-city',
			configuredSupplyCityId: null,
			resolvedSupplyCityId: null
		});
		expect(result).not.toHaveProperty('warehouse');
	});

	test('falls back to imports when a configured source inventory is missing', () => {
		expect.assertions(5);
		const base = withOneReplenishmentProduct(createNewGame('convenience', 292_514));
		const game: GameState = {
			...base,
			cityInventories: []
		};

		const result = applyWeeklyReplenishment({ game, storeReports: new Map() });
		const report = result.productReports.get(game.stores[0]!.id)![0]!;

		expect(report.warehouseUnits).toBe(0);
		expect(report.importedUnits).toBe(21);
		expect(report).not.toHaveProperty('replenishmentOutcome');
		expect(result.cityInventories).toEqual([]);
		expect(result.cityInventories).not.toBe(game.cityInventories);
	});

	test('merges replenishment fields onto the existing daily sales row', () => {
		expect.assertions(12);
		const game = withOneReplenishmentProduct(
			withIndustrySnacks(createNewGame('convenience', 292_515), 12)
		);
		const storeId = game.stores[0]!.id;
		const storeReports: Map<string, DailyProductReport[]> = new Map([
			[
				storeId,
				[
					{
						productId: 'snacks',
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
						importCost: 99,
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
		expect(report).not.toHaveProperty('replenishmentOutcome');
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
		const game: GameState = {
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
		const game: GameState = {
			...base,
			stores: [
				{
					...base.stores[0]!,
					products: [
						{
							productId: 'accessories',
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
		const game: GameState = {
			...base,
			stores: [
				{
					...base.stores[0]!,
					products: [
						{ productId: 'games', stock: 0, reorderThreshold: 1, targetStock: 3, sellingPrice: 48 }
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
		const game: GameState = {
			...base,
			stores: storeIds.map((storeId) => createReplenishmentStore(base, storeId, 'harbor-city'))
		};

		const result = applyWeeklyReplenishment({ game, storeReports: new Map() });
		const first = result.productReports.get('store-2')![0]!;
		const second = result.productReports.get('store-10')![0]!;

		expect(game.stores.slice(0, 2).map((store) => store.id)).toEqual(['store-2', 'store-10']);
		expect(result.stores.map((store) => store.id)).toEqual(storeIds);
		expect(result.cityInventories[0]!.materials['bottled-water']).toBe(0);
		expect(first.warehouseUnits).toBe(10);
		expect(first.importedUnits).toBe(0);
		expect(second.importedUnits).toBe(10);
	});

	test('resolves shared-source contention by retail city before restoring global store order', () => {
		expect.assertions(7);
		const base = createOpenedMultiCityFixture();
		const game: GameState = {
			...base,
			cityInventories: base.cityInventories.map((inventory) =>
				inventory.cityId === 'industry-city'
					? {
							...inventory,
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
		const game: GameState = {
			...base,
			stores: [
				{
					...base.stores[0]!,
					products: [
						{
							productId: 'snacks',
							stock: 0,
							reorderThreshold: 1,
							targetStock: 2,
							sellingPrice: 5
						},
						{
							productId: 'bottled-water',
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

		expect(result.stores[0]!.products.map((product) => product.productId)).toEqual([
			'snacks',
			'bottled-water'
		]);
		expect(result.productReports.get(storeId)!.map((report) => report.productId)).toEqual([
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
		const game: GameState = {
			...base,
			stores: [
				{
					...base.stores[0]!,
					products: [
						{
							productId: 'apparel',
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
		expect(result.cityInventories[0]!.materials.snacks).toBe(12);
		expect('apparel' in result.cityInventories[0]!.materials).toBe(false);
		expect(report.warehouseUnits).toBe(0);
		expect(report.importedUnits).toBe(21);
		expect(report).not.toHaveProperty('replenishmentOutcome');
	});

	test('leaves non-attempted products and their store context untouched', () => {
		expect.assertions(4);
		const base = createNewGame('convenience', 292_508);
		const game: GameState = {
			...base,
			stores: [
				{
					...base.stores[0]!,
					products: [
						{
							productId: 'snacks',
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

	test('skips replenishment for a product whose category is not in the archetype starting categories', () => {
		expect.assertions(3);
		const base = createNewGame('convenience', 292_510);
		const game: GameState = {
			...base,
			stores: [
				{
					...base.stores[0]!,
					products: [
						{
							productId: 'nonexistent-category' as ProductId,
							stock: 4,
							reorderThreshold: 10,
							targetStock: 25,
							sellingPrice: 5
						}
					]
				}
			]
		};

		const result = applyWeeklyReplenishment({ game, storeReports: new Map() });

		expect(result.stores[0]!.products[0]!.stock).toBe(4);
		expect(result.importSpend).toBe(0);
		expect(result.productReports.size).toBe(0);
	});

	test('skips replenishment when needed units is zero despite stock below reorder threshold', () => {
		expect.assertions(3);
		const base = createNewGame('convenience', 292_511);
		const game: GameState = {
			...base,
			stores: [
				{
					...base.stores[0]!,
					products: [
						{
							productId: 'snacks',
							stock: 5,
							reorderThreshold: 10,
							targetStock: 5,
							sellingPrice: 5
						}
					]
				}
			]
		};

		const result = applyWeeklyReplenishment({ game, storeReports: new Map() });

		expect(result.stores[0]!.products[0]!.stock).toBe(5);
		expect(result.importSpend).toBe(0);
		expect(result.productReports.size).toBe(0);
	});
});
