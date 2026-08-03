import { describe, expect, it } from 'vitest';
import type { GameState } from '$lib/game/types';
import { SCENARIO_COMMAND_KINDS, type ScenarioDefinition } from './types';
import {
	assertValidScenarioDefinition,
	sortScenarioDiagnostics,
	validateRetailSupplyAssignments,
	validateScenarioDefinition,
	validateScenarioSetupReserve
} from './validation';
import { buildScenarioGame } from './setup';

function validDefinition(): ScenarioDefinition {
	return {
		id: 'first-profit',
		version: 1,
		titleKey: 'store.defaultName',
		summaryKey: 'store.defaultName',
		briefingKey: 'store.defaultName',
		strategyHintKey: 'store.defaultName',
		officialSeed: 280,
		dayLimit: 30,
		start: {
			foundingStore: {
				ref: 'founder',
				archetypeId: 'convenience',
				cityId: 'harbor-city',
				tileId: 'harbor-city-1-1'
			},
			industrialBuildings: [],
			rails: [],
			overrides: {
				storeCap: 1,
				stores: [
					{
						storeRef: 'founder',
						targetLevel: 1,
						products: [
							{
								categoryId: 'bottled-water',
								stock: 10,
								reorderThreshold: 2,
								targetStock: 12,
								sellingPrice: 3
							}
						]
					}
				]
			}
		},
		content: {
			cityIds: ['harbor-city'],
			archetypeIds: ['convenience'],
			productCategoryIds: ['bottled-water'],
			materialIds: [],
			buildingTypeIds: [],
			retailPlacements: [
				{
					cityId: 'harbor-city',
					tileId: 'harbor-city-1-1',
					archetypeId: 'convenience'
				}
			],
			industrialPlacements: []
		},
		allowedCommands: ['advanceDay'],
		modifiers: [],
		requiredObjectives: [
			{
				id: 'keep-cash',
				labelKey: 'store.defaultName',
				query: { metric: 'cash' },
				comparator: 'gte',
				target: 0,
				window: { kind: 'current' }
			}
		],
		optionalObjectives: [
			{
				id: 'one-store',
				labelKey: 'store.defaultName',
				query: { metric: 'store-count' },
				comparator: 'gte',
				target: 1,
				window: { kind: 'current' }
			}
		],
		failures: [],
		scoreComponents: [{ kind: 'optional-objective', objectiveId: 'one-store', points: 500 }],
		medalThresholds: { silver: 700, gold: 850 }
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed fixture
type MalformedDefinition = Record<string, any>;

/**
 * Returns a writable copy of {@link validDefinition} typed as a permissive
 * record so individual tests can mutate it into an invalid shape without
 * repeating the `as unknown as Record<string, any>` cast and eslint suppression.
 */
function malformedDefinition(): MalformedDefinition {
	return validDefinition() as unknown as MalformedDefinition;
}

function codes(definition: unknown): Array<{ path: string; code: string }> {
	return validateScenarioDefinition(definition).map(({ path, code }) => ({ path, code }));
}

function withExtra<T extends object>(value: T): T & { unexpected: true } {
	return { ...value, unexpected: true };
}

function localProductionDefinition(): ScenarioDefinition {
	const definition = validDefinition();
	definition.content.cityIds = ['harbor-city', 'industry-city'];
	definition.content.materialIds = ['water'];
	definition.content.buildingTypeIds = ['water-pump', 'water-bottler', 'warehouse'];
	definition.content.industrialPlacements = [
		{
			cityId: 'industry-city',
			tileId: 'industry-city-3-19',
			buildingTypeId: 'water-pump'
		},
		{
			cityId: 'industry-city',
			tileId: 'industry-city-26-6',
			buildingTypeId: 'water-bottler'
		},
		{
			cityId: 'industry-city',
			tileId: 'industry-city-30-6',
			buildingTypeId: 'warehouse'
		}
	];
	definition.allowedCommands = ['advanceDay', 'buildRail'];
	definition.requiredObjectives = [
		{
			...definition.requiredObjectives[0]!,
			query: { metric: 'retail-local-units', categoryIds: ['bottled-water'] },
			window: { kind: 'run-to-date' }
		}
	];
	return definition;
}

function cityInventoryDefinition(): ScenarioDefinition {
	const definition = validDefinition();
	definition.content.cityIds = ['harbor-city', 'industry-city'];
	definition.content.materialIds = ['water'];
	definition.content.buildingTypeIds = ['warehouse'];
	definition.start.industrialBuildings = [
		{
			ref: 'warehouse',
			typeId: 'warehouse',
			cityId: 'industry-city',
			tileId: 'industry-city-26-6'
		}
	];
	definition.start.overrides.cityInventoryMaterials = [
		{ cityId: 'industry-city', materials: { water: 1 } }
	];
	definition.start.overrides.retailSupplyAssignments = [
		{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }
	];
	return definition;
}

const removedStartOverrideKey = ['warehouse', 'Materials'].join('');
const removedQuantityMetric = ['warehouse', 'quantity'].join('-');

describe('validateScenarioDefinition', () => {
	it('accepts a complete closed definition', () => {
		expect(validateScenarioDefinition(validDefinition())).toEqual([]);
	});

	it('does not require authored starting entities to be future gameplay placements', () => {
		const definition = validDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.materialIds = ['water'];
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['water-pump', 'warehouse'];
		definition.content.retailPlacements = [];
		definition.content.industrialPlacements = [];
		definition.start.industrialBuildings = [
			{
				ref: 'pump',
				typeId: 'water-pump',
				cityId: 'industry-city',
				tileId: 'industry-city-3-19'
			},
			{
				ref: 'warehouse',
				typeId: 'warehouse',
				cityId: 'industry-city',
				tileId: 'industry-city-26-20'
			}
		];

		expect(validateScenarioDefinition(definition)).toEqual([]);
	});

	it('supports a complete trailing window for consecutive positive reports', () => {
		const definition = validDefinition();
		definition.requiredObjectives = [
			{
				id: 'positive-income-streak',
				labelKey: 'store.defaultName',
				query: { metric: 'consecutive-positive-net-income-reports' },
				comparator: 'gte',
				target: 3,
				window: { kind: 'trailing-reports', count: 3 },
				requiresCompleteWindow: true
			}
		];

		expect(validateScenarioDefinition(definition)).toEqual([]);
	});

	it('returns every diagnostic in stable path/code order', () => {
		const invalid = {
			...validDefinition(),
			id: 'Bad.Id',
			officialSeed: 0,
			dayLimit: 0
		};

		expect(codes(invalid)).toEqual([
			{ path: 'dayLimit', code: 'invalid-positive-integer' },
			{ path: 'id', code: 'invalid-scenario-id' },
			{ path: 'officialSeed', code: 'invalid-seed' }
		]);
	});

	it('validates the supported version and canonical seed range', () => {
		const definition = { ...validDefinition(), version: 2, officialSeed: 2_147_483_647 };
		expect(codes(definition)).toEqual([
			{ path: 'officialSeed', code: 'invalid-seed' },
			{ path: 'version', code: 'unsupported-version' }
		]);
	});

	it('rejects a zero product selling price before setup builds a non-current state', () => {
		const definition = validDefinition();
		definition.start.overrides.stores![0]!.products![0]!.sellingPrice = 0;

		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].products[0].sellingPrice',
			code: 'invalid-positive-number'
		});
	});

	it('rejects unknown keys on every closed blueprint object', () => {
		const definition = malformedDefinition();
		definition.unexpected = true;
		definition.start = withExtra(definition.start);
		definition.start.foundingStore = withExtra(definition.start.foundingStore);
		definition.start.industrialBuildings = [
			withExtra({
				ref: 'warehouse',
				typeId: 'warehouse',
				cityId: 'industry-city',
				tileId: 'industry-city-26-6'
			})
		];
		definition.start.rails = [withExtra({ cityId: 'industry-city', x: 24, y: 6, level: 1 })];
		definition.start.overrides = withExtra(definition.start.overrides);
		definition.start.overrides.policy = withExtra({
			pricing: 'standard',
			inventory: 'balanced',
			staffing: 'efficient',
			marketing: 'awareness',
			service: 'balanced'
		});
		definition.start.overrides.stores[0] = withExtra(definition.start.overrides.stores[0]);
		definition.start.overrides.stores[0].products[0] = withExtra(
			definition.start.overrides.stores[0].products[0]
		);
		definition.start.overrides.buildingInventories = [
			withExtra({ buildingRef: 'warehouse', materials: {} })
		];
		definition.start.overrides.cityInventoryMaterials = [
			withExtra({ cityId: 'industry-city', materials: {} })
		];
		definition.start.overrides.retailSupplyAssignments = [
			withExtra({ retailCityId: 'harbor-city', supplyCityId: null })
		];
		definition.start.overrides.world = withExtra({
			revealedCityIds: ['harbor-city'],
			openedCityIds: ['harbor-city'],
			activeRetailCityId: 'harbor-city',
			activeIndustryCityId: 'industry-city'
		});

		const unknownPaths = codes(definition)
			.filter((diagnostic) => diagnostic.code === 'unknown-key')
			.map((diagnostic) => diagnostic.path);
		expect(unknownPaths).toEqual([
			'start.foundingStore.unexpected',
			'start.industrialBuildings[0].unexpected',
			'start.overrides.buildingInventories[0].unexpected',
			'start.overrides.cityInventoryMaterials[0].unexpected',
			'start.overrides.policy.unexpected',
			'start.overrides.retailSupplyAssignments[0].unexpected',
			'start.overrides.stores[0].products[0].unexpected',
			'start.overrides.stores[0].unexpected',
			'start.overrides.unexpected',
			'start.overrides.world.unexpected',
			'start.rails[0].unexpected',
			'start.unexpected',
			'unexpected'
		]);
	});

	it('rejects unknown keys on content, modifier, condition, metric, window, score, and medal objects', () => {
		const definition = malformedDefinition();
		definition.content = withExtra(definition.content);
		definition.content.retailPlacements[0] = withExtra(definition.content.retailPlacements[0]);
		definition.content.industrialPlacements = [
			withExtra({
				cityId: 'industry-city',
				tileId: 'industry-city-26-6',
				buildingTypeId: 'warehouse'
			})
		];
		definition.modifiers = [
			withExtra({
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: withExtra({ kind: 'all' }),
				multiplier: 1.2
			})
		];
		definition.requiredObjectives[0] = withExtra(definition.requiredObjectives[0]);
		definition.requiredObjectives[0].query = withExtra(definition.requiredObjectives[0].query);
		definition.requiredObjectives[0].window = withExtra(definition.requiredObjectives[0].window);
		definition.scoreComponents[0] = withExtra(definition.scoreComponents[0]);
		definition.medalThresholds = withExtra(definition.medalThresholds);

		const unknownPaths = codes(definition)
			.filter((diagnostic) => diagnostic.code === 'unknown-key')
			.map((diagnostic) => diagnostic.path);
		expect(unknownPaths).toEqual([
			'content.industrialPlacements[0].unexpected',
			'content.retailPlacements[0].unexpected',
			'content.unexpected',
			'medalThresholds.unexpected',
			'modifiers[0].target.unexpected',
			'modifiers[0].unexpected',
			'requiredObjectives[0].query.unexpected',
			'requiredObjectives[0].unexpected',
			'requiredObjectives[0].window.unexpected',
			'scoreComponents[0].unexpected'
		]);
	});

	it('rejects unknown keys for every specialized query, window, target, and score variant', () => {
		const definition = malformedDefinition();
		definition.content.materialIds = ['water'];
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: withExtra({ kind: 'ids', ids: ['bottled-water'] }),
				multiplier: 1.2
			}
		];
		const base = definition.requiredObjectives[0];
		definition.requiredObjectives = [
			{ ...base, id: 'current', query: { metric: 'cash' }, window: withExtra({ kind: 'current' }) },
			{
				...base,
				id: 'run-to-date',
				query: withExtra({ metric: 'retail-import-spend', categoryIds: ['bottled-water'] }),
				window: withExtra({ kind: 'run-to-date' })
			},
			{
				...base,
				id: 'trailing',
				query: withExtra({ metric: 'scorecard', score: 'profit' }),
				window: withExtra({ kind: 'trailing-reports', count: 3 })
			},
			{
				...base,
				id: 'fixed',
				query: withExtra({ metric: 'industrial-building-count', buildingTypeIds: [] }),
				window: withExtra({ kind: 'fixed-report-days', startDay: 1, endDay: 2 })
			},
			{
				...base,
				id: 'city-inventory',
				query: withExtra({
					metric: 'city-inventory-quantity',
					cityId: 'industry-city',
					materialId: 'water'
				}),
				window: { kind: 'current' }
			}
		];
		definition.scoreComponents = [
			withExtra({
				kind: 'metric',
				query: { metric: 'cash' },
				window: { kind: 'current' },
				zeroBonusAt: 0,
				fullBonusAt: 1,
				points: 250
			}),
			withExtra({
				kind: 'remaining-days',
				zeroBonusAt: 0,
				fullBonusAt: 30,
				points: 250
			})
		];

		expect(codes(definition).filter((diagnostic) => diagnostic.code === 'unknown-key')).toEqual([
			{ path: 'modifiers[0].target.unexpected', code: 'unknown-key' },
			{ path: 'requiredObjectives[0].window.unexpected', code: 'unknown-key' },
			{ path: 'requiredObjectives[1].query.unexpected', code: 'unknown-key' },
			{ path: 'requiredObjectives[1].window.unexpected', code: 'unknown-key' },
			{ path: 'requiredObjectives[2].query.unexpected', code: 'unknown-key' },
			{ path: 'requiredObjectives[2].window.unexpected', code: 'unknown-key' },
			{ path: 'requiredObjectives[3].query.unexpected', code: 'unknown-key' },
			{ path: 'requiredObjectives[3].window.unexpected', code: 'unknown-key' },
			{ path: 'requiredObjectives[4].query.unexpected', code: 'unknown-key' },
			{ path: 'scoreComponents[0].unexpected', code: 'unknown-key' },
			{ path: 'scoreComponents[1].unexpected', code: 'unknown-key' }
		]);
	});

	it('rejects duplicate setup refs and override targets', () => {
		const definition = validDefinition();
		definition.start.industrialBuildings = [
			{ ref: 'founder', typeId: 'warehouse', cityId: 'industry-city', tileId: 'industry-city-26-6' }
		];
		definition.start.overrides.stores = [{ storeRef: 'founder' }, { storeRef: 'founder' }];
		expect(codes(definition)).toEqual(
			expect.arrayContaining([
				{ path: 'start.industrialBuildings[0].ref', code: 'duplicate-reference' },
				{ path: 'start.overrides.stores[1].storeRef', code: 'duplicate-reference' }
			])
		);
	});

	it('validates content and override references against game registries', () => {
		const definition = malformedDefinition();
		definition.start.foundingStore.archetypeId = 'missing-store';
		definition.content.cityIds = ['missing-city'];
		definition.content.materialIds = ['missing-material'];
		definition.content.buildingTypeIds = ['missing-building'];
		expect(codes(definition)).toEqual(
			expect.arrayContaining([
				{ path: 'content.buildingTypeIds[0]', code: 'invalid-reference' },
				{ path: 'content.cityIds[0]', code: 'invalid-reference' },
				{ path: 'content.materialIds[0]', code: 'invalid-reference' },
				{ path: 'start.foundingStore.archetypeId', code: 'invalid-reference' }
			])
		);
	});

	it('enforces the store target-level range without derivative product diagnostics', () => {
		const definition = validDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 'founder',
				targetLevel: 11,
				products: definition.start.overrides.stores?.[0]?.products
			}
		];
		expect(codes(definition)).toEqual([
			{ path: 'start.overrides.stores[0].targetLevel', code: 'invalid-target-level' }
		]);
	});

	it('does not let upgradeStore unlock products for an archetype with no materialized or openable store', () => {
		const definition = validDefinition();
		definition.content.archetypeIds = ['convenience', 'electronics'];
		// Convenience is the founding archetype and upgradeStore is allowed, so
		// the full convenience category set must be allowlisted to satisfy the
		// reverse check; devices stays unallowlisted-reachable to test the
		// forward product-locked diagnostic.
		definition.content.productCategoryIds = [
			'bottled-water',
			'snacks',
			'drinks',
			'essentials',
			'devices'
		];
		definition.allowedCommands = ['advanceDay', 'upgradeStore'];

		expect(codes(definition)).toEqual([
			{ path: 'content.productCategoryIds[4]', code: 'product-locked' }
		]);

		definition.allowedCommands = ['advanceDay', 'openStore', 'upgradeStore'];
		definition.start.overrides.storeCap = 2;
		definition.content.retailPlacements = [
			...definition.content.retailPlacements,
			{ cityId: 'harbor-city', tileId: 'harbor-city-1-1', archetypeId: 'electronics' }
		];
		expect(codes(definition)).toEqual([
			{ path: 'content.productCategoryIds[4]', code: 'product-locked' }
		]);
	});

	it('allows upgradeStore unlocks through an actually openable archetype placement', () => {
		const definition = validDefinition();
		definition.content.archetypeIds = ['convenience', 'electronics'];
		definition.content.productCategoryIds = [
			'bottled-water',
			'snacks',
			'drinks',
			'essentials',
			'games',
			'accessories',
			'devices',
			'peripherals'
		];
		definition.content.retailPlacements = [
			...definition.content.retailPlacements,
			{ cityId: 'harbor-city', tileId: 'harbor-city-3-1', archetypeId: 'electronics' }
		];
		definition.allowedCommands = ['advanceDay', 'openStore', 'upgradeStore'];
		definition.start.overrides.storeCap = 2;

		expect(codes(definition)).toEqual([]);
	});

	it('does not treat a placement in an inaccessible retail city as openable', () => {
		const definition = validDefinition();
		definition.content.cityIds = ['harbor-city', 'campus-junction'];
		definition.content.archetypeIds = ['convenience', 'electronics'];
		definition.content.productCategoryIds = [
			'bottled-water',
			'snacks',
			'drinks',
			'essentials',
			'devices'
		];
		definition.content.retailPlacements = [
			...definition.content.retailPlacements,
			{
				cityId: 'campus-junction',
				tileId: 'campus-junction-1-1',
				archetypeId: 'electronics'
			}
		];
		definition.allowedCommands = ['advanceDay', 'openStore', 'upgradeStore'];
		definition.start.overrides.storeCap = 2;

		expect(codes(definition)).toEqual([
			{ path: 'content.productCategoryIds[4]', code: 'product-locked' }
		]);
	});

	it('accepts openable placements in opened or revealed retail cities with the matching command', () => {
		const definition = validDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city', 'campus-junction'];
		definition.content.archetypeIds = ['convenience', 'electronics'];
		definition.content.productCategoryIds = [
			'bottled-water',
			'snacks',
			'drinks',
			'essentials',
			'games',
			'accessories',
			'devices',
			'peripherals'
		];
		definition.content.retailPlacements = [
			...definition.content.retailPlacements,
			{
				cityId: 'campus-junction',
				tileId: 'campus-junction-1-1',
				archetypeId: 'electronics'
			}
		];
		definition.start.overrides.storeCap = 2;
		definition.start.overrides.world = {
			revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
			openedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
			activeRetailCityId: 'harbor-city',
			activeIndustryCityId: 'industry-city'
		};
		definition.allowedCommands = ['advanceDay', 'openStore', 'upgradeStore', 'selectWorldCity'];
		expect(codes(definition)).toEqual([]);

		definition.start.overrides.world.openedCityIds = ['harbor-city', 'industry-city'];
		definition.allowedCommands = ['advanceDay', 'openStore', 'upgradeStore', 'openWorldCity'];
		expect(codes(definition)).toEqual([]);
	});

	it('flags products materialized by an allowed upgradeStore path that are not in the content allowlist', () => {
		const definition = validDefinition();
		definition.content.productCategoryIds = ['bottled-water'];
		definition.allowedCommands = ['advanceDay', 'upgradeStore'];

		expect(codes(definition)).toEqual([
			{ path: 'start.overrides.stores[0].targetLevel', code: 'product-not-allowlisted' },
			{ path: 'start.overrides.stores[0].targetLevel', code: 'product-not-allowlisted' },
			{ path: 'start.overrides.stores[0].targetLevel', code: 'product-not-allowlisted' }
		]);
	});

	it('flags products materialized by an openable placement upgrade path that are not in the content allowlist', () => {
		const definition = validDefinition();
		definition.content.archetypeIds = ['convenience', 'electronics'];
		// Convenience founding store is fully allowlisted, but the openable
		// electronics placement's upgrade path materializes categories that
		// are not allowlisted.
		definition.content.productCategoryIds = [
			'bottled-water',
			'snacks',
			'drinks',
			'essentials',
			'devices'
		];
		definition.content.retailPlacements = [
			...definition.content.retailPlacements,
			{ cityId: 'harbor-city', tileId: 'harbor-city-3-1', archetypeId: 'electronics' }
		];
		definition.allowedCommands = ['advanceDay', 'openStore', 'upgradeStore'];
		definition.start.overrides.storeCap = 2;

		expect(codes(definition)).toEqual([
			{ path: 'content.retailPlacements[1]', code: 'product-not-allowlisted' },
			{ path: 'content.retailPlacements[1]', code: 'product-not-allowlisted' },
			{ path: 'content.retailPlacements[1]', code: 'product-not-allowlisted' }
		]);
	});

	it('enforces the authored store cap and the no-open-store boundary', () => {
		const definition = validDefinition();
		definition.start.overrides.storeCap = 2;
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.storeCap',
			code: 'invalid-store-cap'
		});

		delete definition.start.overrides.storeCap;
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.storeCap',
			code: 'invalid-store-cap'
		});
	});

	it('validates placement footprints, resources, and authored overlap', () => {
		const invalidRetail = validDefinition();
		invalidRetail.start.foundingStore.tileId = 'harbor-city-0-0';
		invalidRetail.content.retailPlacements = [
			{
				cityId: 'harbor-city',
				tileId: 'harbor-city-0-0',
				archetypeId: 'convenience'
			}
		];
		expect(codes(invalidRetail)).toEqual(
			expect.arrayContaining([
				{ path: 'content.retailPlacements[0].tileId', code: 'invalid-placement' },
				{ path: 'start.foundingStore.tileId', code: 'invalid-placement' }
			])
		);

		const invalidIndustry = validDefinition();
		invalidIndustry.content.cityIds = ['harbor-city', 'industry-city'];
		invalidIndustry.content.buildingTypeIds = ['water-pump', 'warehouse'];
		invalidIndustry.content.industrialPlacements = [
			{
				cityId: 'industry-city',
				tileId: 'industry-city-26-6',
				buildingTypeId: 'water-pump'
			},
			{
				cityId: 'industry-city',
				tileId: 'industry-city-27-6',
				buildingTypeId: 'warehouse'
			}
		];
		invalidIndustry.start.industrialBuildings = [
			{
				ref: 'pump',
				typeId: 'water-pump',
				cityId: 'industry-city',
				tileId: 'industry-city-26-6'
			},
			{
				ref: 'warehouse-a',
				typeId: 'warehouse',
				cityId: 'industry-city',
				tileId: 'industry-city-27-6'
			},
			{
				ref: 'warehouse-b',
				typeId: 'warehouse',
				cityId: 'industry-city',
				tileId: 'industry-city-27-6'
			}
		];
		expect(codes(invalidIndustry)).toEqual(
			expect.arrayContaining([
				{ path: 'content.industrialPlacements[0].tileId', code: 'invalid-placement' },
				{ path: 'start.industrialBuildings[0].tileId', code: 'invalid-placement' },
				{ path: 'start.industrialBuildings[2].tileId', code: 'overlapping-placement' }
			])
		);
	});

	it('validates rail levels, coordinates, duplicates, and topology', () => {
		const definition = malformedDefinition();
		definition.content.cityIds.push('industry-city');
		definition.start.rails = [
			{ cityId: 'industry-city', x: 24, y: 6, level: 0 },
			{ cityId: 'industry-city', x: 24, y: 6, level: 1 }
		];
		expect(codes(definition)).toEqual([
			{ path: 'start.rails', code: 'invalid-rail-topology' },
			{ path: 'start.rails[0].level', code: 'invalid-rail-level' },
			{ path: 'start.rails[1]', code: 'duplicate-rail-cell' }
		]);
	});

	it('does not count a matching start building and permitted placement as two rail endpoints', () => {
		const definition = validDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.content.industrialPlacements = [
			{
				cityId: 'industry-city',
				tileId: 'industry-city-26-6',
				buildingTypeId: 'warehouse'
			}
		];
		definition.start.industrialBuildings = [
			{
				ref: 'warehouse',
				typeId: 'warehouse',
				cityId: 'industry-city',
				tileId: 'industry-city-26-6'
			}
		];
		definition.allowedCommands = ['advanceDay', 'buildIndustrialBuilding'];
		definition.start.rails = [{ cityId: 'industry-city', x: 28, y: 6, level: 1 }];

		expect(codes(definition)).toEqual([{ path: 'start.rails', code: 'invalid-rail-topology' }]);
	});

	it('rejects authored rails that overlap a permitted future building footprint', () => {
		const definition = validDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.content.industrialPlacements = [
			{
				cityId: 'industry-city',
				tileId: 'industry-city-26-6',
				buildingTypeId: 'warehouse'
			}
		];
		definition.start.rails = [{ cityId: 'industry-city', x: 26, y: 6, level: 1 }];

		expect(codes(definition)).toEqual([
			{ path: 'start.rails', code: 'invalid-rail-topology' },
			{ path: 'start.rails[0]', code: 'invalid-rail-coordinate' }
		]);
	});

	it('hard-rejects the removed aggregate inventory override key', () => {
		const definition = malformedDefinition();
		definition.start.overrides[removedStartOverrideKey] = { water: 1 };
		expect(codes(definition)).toContainEqual({
			path: `start.overrides.${removedStartOverrideKey}`,
			code: 'unknown-key'
		});
	});

	it('rejects duplicate, unknown, wrong-kind, and closed city inventory overrides', () => {
		const duplicate = cityInventoryDefinition();
		duplicate.start.overrides.cityInventoryMaterials = [
			{ cityId: 'industry-city', materials: { water: 1 } },
			{ cityId: 'industry-city', materials: { water: 2 } }
		];
		expect(codes(duplicate)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[1].cityId',
			code: 'duplicate-reference'
		});

		const unknown = cityInventoryDefinition() as unknown as MalformedDefinition;
		unknown.start.overrides.cityInventoryMaterials = [
			{ cityId: 'missing-city', materials: { water: 1 } }
		];
		expect(codes(unknown)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].cityId',
			code: 'invalid-reference'
		});

		const wrongKind = cityInventoryDefinition() as unknown as MalformedDefinition;
		wrongKind.start.overrides.cityInventoryMaterials = [
			{ cityId: 'harbor-city', materials: { water: 1 } }
		];
		expect(codes(wrongKind)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].cityId',
			code: 'invalid-city-inventory-city'
		});

		const closed = cityInventoryDefinition() as unknown as MalformedDefinition;
		closed.content.cityIds = ['harbor-city', 'industry-city', 'breadbasket-basin'];
		closed.start.overrides.cityInventoryMaterials = [
			{ cityId: 'breadbasket-basin', materials: { water: 1 } }
		];
		const result = buildScenarioGame(closed as ScenarioDefinition, closed.officialSeed);
		expect(result).toMatchObject({
			ok: false,
			diagnostics: [
				{
					path: 'start.overrides.cityInventoryMaterials[0].cityId',
					code: 'city-inventory-city-closed'
				}
			]
		});
	});

	it('rejects an over-capacity city inventory even when another city has spare capacity', () => {
		const definition = cityInventoryDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city', 'breadbasket-basin'];
		definition.start.overrides.world = {
			revealedCityIds: ['harbor-city', 'industry-city', 'breadbasket-basin'],
			openedCityIds: ['harbor-city', 'industry-city', 'breadbasket-basin'],
			activeRetailCityId: 'harbor-city',
			activeIndustryCityId: 'breadbasket-basin'
		};
		definition.start.industrialBuildings = [
			...definition.start.industrialBuildings,
			{
				ref: 'breadbasket-warehouse',
				typeId: 'warehouse',
				cityId: 'breadbasket-basin',
				tileId: 'breadbasket-basin-30-6'
			}
		];
		definition.start.overrides.cityInventoryMaterials = [
			{ cityId: 'industry-city', materials: { water: 201 } }
		];

		const result = buildScenarioGame(definition, definition.officialSeed);

		expect(result).toMatchObject({
			ok: false,
			diagnostics: [
				{
					path: 'start.overrides.cityInventoryMaterials[0].materials',
					code: 'city-inventory-capacity-exceeded'
				}
			]
		});
	});

	it('rejects duplicate, missing, invalid, and noncanonical retail supply assignments', () => {
		const duplicate = cityInventoryDefinition();
		duplicate.start.overrides.retailSupplyAssignments = [
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }
		];
		expect(codes(duplicate)).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[1].retailCityId',
			code: 'duplicate-reference'
		});

		const missing = cityInventoryDefinition();
		missing.start.overrides.retailSupplyAssignments = [];
		expect(codes(missing)).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments',
			code: 'missing-retail-supply-assignment'
		});

		const importsOnly = cityInventoryDefinition();
		importsOnly.start.overrides.retailSupplyAssignments = [
			{ retailCityId: 'harbor-city', supplyCityId: null }
		];
		expect(codes(importsOnly)).toEqual([]);

		const wrongOwner = cityInventoryDefinition() as unknown as MalformedDefinition;
		wrongOwner.start.overrides.retailSupplyAssignments = [
			{ retailCityId: 'industry-city', supplyCityId: 'industry-city' }
		];
		expect(codes(wrongOwner)).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments[0].retailCityId',
			code: 'invalid-retail-supply-city'
		});

		const unavailableSource = cityInventoryDefinition() as unknown as MalformedDefinition;
		unavailableSource.content.cityIds = ['harbor-city', 'industry-city', 'breadbasket-basin'];
		unavailableSource.start.overrides.retailSupplyAssignments = [
			{ retailCityId: 'harbor-city', supplyCityId: 'breadbasket-basin' }
		];
		const unavailableResult = buildScenarioGame(
			unavailableSource as ScenarioDefinition,
			unavailableSource.officialSeed
		);
		expect(unavailableResult).toMatchObject({
			ok: false,
			diagnostics: [
				{
					path: 'start.overrides.retailSupplyAssignments[0].supplyCityId',
					code: 'supply-city-closed'
				}
			]
		});

		const noncanonical = cityInventoryDefinition();
		noncanonical.content.cityIds = ['harbor-city', 'campus-junction', 'industry-city'];
		noncanonical.start.overrides.world = {
			revealedCityIds: ['harbor-city', 'campus-junction', 'industry-city'],
			openedCityIds: ['harbor-city', 'campus-junction', 'industry-city'],
			activeRetailCityId: 'campus-junction',
			activeIndustryCityId: 'industry-city'
		};
		noncanonical.start.overrides.retailSupplyAssignments = [
			{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' },
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }
		];
		expect(codes(noncanonical)).toContainEqual({
			path: 'start.overrides.retailSupplyAssignments',
			code: 'noncanonical-retail-supply-assignment'
		});
	});

	it('requires canonical retail supply assignments after raw state validation', () => {
		const definition = cityInventoryDefinition();
		const result = buildScenarioGame(definition, definition.officialSeed);

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const malformed = { ...result.game } as Partial<GameState>;
		delete malformed.retailSupplyAssignments;

		expect(() =>
			validateRetailSupplyAssignments(malformed as GameState, definition.start)
		).toThrow();
	});

	it('validates city-scoped metric queries and rejects the removed metric', () => {
		const valid = cityInventoryDefinition();
		valid.requiredObjectives = [
			{
				...valid.requiredObjectives[0]!,
				query: {
					metric: 'city-inventory-quantity',
					cityId: 'industry-city',
					materialId: 'water'
				},
				window: { kind: 'current' }
			}
		];
		expect(codes(valid)).toEqual([]);

		const missingFields = cityInventoryDefinition() as unknown as MalformedDefinition;
		missingFields.requiredObjectives[0].query = { metric: 'city-inventory-quantity' };
		expect(codes(missingFields)).toEqual(
			expect.arrayContaining([
				{ path: 'requiredObjectives[0].query.cityId', code: 'missing-key' },
				{ path: 'requiredObjectives[0].query.materialId', code: 'missing-key' }
			])
		);

		const malformed = cityInventoryDefinition() as unknown as MalformedDefinition;
		malformed.requiredObjectives[0].query = {
			metric: 'city-inventory-quantity',
			cityId: 'harbor-city',
			materialId: 'missing-material',
			extra: true
		};
		malformed.requiredObjectives[0].window = { kind: 'run-to-date' };
		expect(codes(malformed)).toEqual(
			expect.arrayContaining([
				{ path: 'requiredObjectives[0].query.cityId', code: 'invalid-city-inventory-city' },
				{ path: 'requiredObjectives[0].query.extra', code: 'unknown-key' },
				{ path: 'requiredObjectives[0].query.materialId', code: 'invalid-reference' },
				{ path: 'requiredObjectives[0].window.kind', code: 'unsupported-window' }
			])
		);

		const removed = cityInventoryDefinition() as unknown as MalformedDefinition;
		removed.requiredObjectives[0].query = {
			metric: removedQuantityMetric,
			materialId: 'water'
		};
		expect(codes(removed)).toContainEqual({
			path: 'requiredObjectives[0].query.metric',
			code: 'unsupported-metric'
		});
	});

	it('validates supported commands and modifier variants', () => {
		const definition = malformedDefinition();
		definition.allowedCommands = [...SCENARIO_COMMAND_KINDS, 'teleport'];
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'ids', ids: ['missing-product'] },
				multiplier: Number.POSITIVE_INFINITY
			},
			{ kind: 'mystery' }
		];
		expect(codes(definition)).toEqual(
			expect.arrayContaining([
				{ path: 'allowedCommands[26]', code: 'unsupported-command' },
				{ path: 'modifiers[0].multiplier', code: 'invalid-modifier' },
				{ path: 'modifiers[0].target.ids[0]', code: 'invalid-reference' },
				{ path: 'modifiers[1].kind', code: 'unsupported-modifier' }
			])
		);
	});

	it('recognizes retail supply source selection as a supported command', () => {
		const definition = malformedDefinition();
		definition.allowedCommands = ['setRetailSupplySource'];

		expect(codes(definition)).not.toContainEqual({
			path: 'allowedCommands[0]',
			code: 'unsupported-command'
		});
	});

	it('rejects overlapping import-cost-multiplier targets within the same scope', () => {
		const definition = malformedDefinition();
		definition.content.productCategoryIds = ['bottled-water', 'produce'];
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'ids', ids: ['bottled-water'] },
				multiplier: 1.5
			},
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'ids', ids: ['bottled-water', 'produce'] },
				multiplier: 2
			},
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'all' },
				multiplier: 3
			}
		];
		expect(codes(definition)).toEqual(
			expect.arrayContaining([
				{ path: 'modifiers[1].target', code: 'invalid-modifier' },
				{ path: 'modifiers[2].target', code: 'invalid-modifier' }
			])
		);
		expect(codes(definition).filter((item) => item.path === 'modifiers[0].target')).toEqual([]);
	});

	it('does not flag overlapping import-cost-multiplier targets across different scopes', () => {
		const definition = malformedDefinition();
		definition.content.productCategoryIds = ['bottled-water'];
		definition.content.materialIds = ['water'];
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'all' },
				multiplier: 1.5
			},
			{
				kind: 'import-cost-multiplier',
				scope: 'industrial-material',
				target: { kind: 'all' },
				multiplier: 2
			}
		];
		expect(codes(definition)).toEqual([]);
	});

	it('flags a broad all-target that shadows later specific targets', () => {
		const definition = malformedDefinition();
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'all' },
				multiplier: 1.5
			},
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'ids', ids: ['bottled-water'] },
				multiplier: 2
			}
		];
		expect(codes(definition)).toEqual([{ path: 'modifiers[1].target', code: 'invalid-modifier' }]);
	});

	it('validates metric/window support and complete-window semantics', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: { metric: 'cash' },
				window: { kind: 'trailing-reports', count: 3 },
				requiresCompleteWindow: true
			},
			{
				...definition.requiredObjectives[0],
				id: 'bad-fixed',
				query: { metric: 'daily-net-income' },
				window: { kind: 'fixed-report-days', startDay: 0, endDay: 31 }
			},
			{
				...definition.requiredObjectives[0],
				id: 'unknown',
				query: { metric: 'mystery' }
			}
		];
		expect(codes(definition)).toEqual([
			{ path: 'requiredObjectives[0].window.kind', code: 'unsupported-window' },
			{ path: 'requiredObjectives[1].window', code: 'invalid-window' },
			{ path: 'requiredObjectives[2].query.metric', code: 'unsupported-metric' }
		]);
	});

	it('requires objectives and rejects duplicate condition IDs across all groups', () => {
		const definition = validDefinition();
		definition.requiredObjectives = [];
		definition.failures = [
			{
				...definition.optionalObjectives[0]!,
				id: 'one-store'
			}
		];
		expect(codes(definition)).toEqual(
			expect.arrayContaining([
				{ path: 'failures[0].id', code: 'duplicate-objective-id' },
				{ path: 'requiredObjectives', code: 'missing-required-objective' }
			])
		);
	});

	it('enforces the 500-point bonus budget and medal thresholds', () => {
		const definition = validDefinition();
		definition.scoreComponents = [
			{
				kind: 'optional-objective',
				objectiveId: 'one-store',
				points: 499
			}
		];
		definition.medalThresholds = { silver: 500, gold: 1_001 };
		expect(codes(definition)).toEqual([
			{ path: 'medalThresholds', code: 'invalid-medal-thresholds' },
			{ path: 'scoreComponents', code: 'invalid-score-total' }
		]);
	});

	it('rejects starting and objective references excluded by content rules', () => {
		const definition = validDefinition();
		definition.content.archetypeIds = [];
		definition.content.productCategoryIds = [];
		expect(codes(definition)).toEqual(
			expect.arrayContaining([
				{ path: 'start.foundingStore.archetypeId', code: 'excluded-content' },
				{
					path: 'start.overrides.stores[0].products[0].categoryId',
					code: 'excluded-content'
				}
			])
		);
	});

	it('rejects local-production objectives without a permitted producer and warehouse path', () => {
		const definition = validDefinition();
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0]!,
				query: { metric: 'retail-local-units', categoryIds: ['bottled-water'] },
				window: { kind: 'run-to-date' }
			}
		];
		expect(codes(definition)).toEqual([
			{ path: 'requiredObjectives[0].query', code: 'unavailable-local-production-path' }
		]);
	});

	it('does not count future industrial placements when building construction is forbidden', () => {
		const definition = localProductionDefinition();

		expect(codes(definition)).toEqual([
			{ path: 'requiredObjectives[0].query', code: 'unavailable-local-production-path' }
		]);

		definition.allowedCommands = ['advanceDay', 'buildIndustrialBuilding', 'buildRail'];
		expect(codes(definition)).toEqual([]);
	});

	it('requires local-production endpoints to be feasible in the same city', () => {
		const definition = localProductionDefinition();
		definition.allowedCommands = ['advanceDay', 'buildIndustrialBuilding', 'buildRail'];
		definition.content.cityIds = ['harbor-city', 'industry-city', 'breadbasket-basin'];
		definition.content.industrialPlacements = definition.content.industrialPlacements.map(
			(placement) =>
				placement.buildingTypeId === 'warehouse'
					? {
							...placement,
							cityId: 'breadbasket-basin',
							tileId: 'breadbasket-basin-29-6'
						}
					: placement
		);

		expect(codes(definition)).toEqual([
			{ path: 'requiredObjectives[0].query', code: 'unavailable-local-production-path' }
		]);

		const overlapping = localProductionDefinition();
		overlapping.allowedCommands = ['advanceDay', 'buildIndustrialBuilding', 'buildRail'];
		overlapping.content.industrialPlacements = overlapping.content.industrialPlacements.map(
			(placement) =>
				placement.buildingTypeId === 'warehouse'
					? { ...placement, tileId: 'industry-city-27-6' }
					: placement
		);
		expect(codes(overlapping)).toEqual([
			{ path: 'requiredObjectives[0].query', code: 'unavailable-local-production-path' }
		]);
	});

	it('rejects a local-production chain whose endpoint has no usable rail attachment cell', () => {
		const definition = localProductionDefinition();
		definition.allowedCommands = ['advanceDay', 'buildIndustrialBuilding', 'buildRail'];
		definition.content.buildingTypeIds = [...definition.content.buildingTypeIds, 'flour-mill'];
		definition.content.industrialPlacements = [
			definition.content.industrialPlacements[0]!,
			{
				cityId: 'industry-city' as const,
				tileId: 'industry-city-34-6',
				buildingTypeId: 'water-bottler'
			},
			{
				cityId: 'industry-city',
				tileId: 'industry-city-28-8',
				buildingTypeId: 'warehouse'
			},
			...[
				'industry-city-28-6',
				'industry-city-28-10',
				'industry-city-26-8',
				'industry-city-30-8'
			].map((tileId) => ({
				cityId: 'industry-city' as const,
				tileId,
				buildingTypeId: 'flour-mill' as const
			}))
		];
		definition.start.industrialBuildings = [
			'industry-city-28-6',
			'industry-city-28-10',
			'industry-city-26-8',
			'industry-city-30-8'
		].map((tileId, index) => ({
			ref: `blocker-${index}`,
			typeId: 'flour-mill' as const,
			cityId: 'industry-city',
			tileId
		}));

		expect(codes(definition)).toEqual([
			{ path: 'requiredObjectives[0].query', code: 'unavailable-local-production-path' }
		]);
	});

	it('validates building materials even when the building reference is invalid', () => {
		const definition = validDefinition();
		definition.start.overrides.buildingInventories = [
			{
				buildingRef: 'missing-building',
				materials: { water: -1, missing: 2 } as never
			}
		];

		expect(codes(definition)).toEqual([
			{
				path: 'start.overrides.buildingInventories[0].buildingRef',
				code: 'invalid-reference'
			},
			{
				path: 'start.overrides.buildingInventories[0].materials.missing',
				code: 'invalid-reference'
			},
			{
				path: 'start.overrides.buildingInventories[0].materials.water',
				code: 'excluded-content'
			},
			{
				path: 'start.overrides.buildingInventories[0].materials.water',
				code: 'invalid-non-negative-number'
			}
		]);
	});

	it('preserves original world-array indices for exclusion diagnostics', () => {
		const definition = validDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.overrides.world = {
			revealedCityIds: ['campus-junction', 'harbor-city', 'campus-junction', 'industry-city'],
			openedCityIds: ['campus-junction', 'harbor-city', 'campus-junction', 'industry-city'],
			activeRetailCityId: 'harbor-city',
			activeIndustryCityId: 'industry-city'
		};

		expect(codes(definition)).toEqual([
			{ path: 'start.overrides.world.openedCityIds[0]', code: 'excluded-content' },
			{ path: 'start.overrides.world.openedCityIds[2]', code: 'duplicate-reference' },
			{ path: 'start.overrides.world.openedCityIds[2]', code: 'excluded-content' },
			{ path: 'start.overrides.world.revealedCityIds[0]', code: 'excluded-content' },
			{ path: 'start.overrides.world.revealedCityIds[2]', code: 'duplicate-reference' },
			{ path: 'start.overrides.world.revealedCityIds[2]', code: 'excluded-content' }
		]);
	});

	it('asserts validity and exposes sorted diagnostics on failure', () => {
		const valid: unknown = validDefinition();
		assertValidScenarioDefinition(valid);
		expect(valid.id).toBe('first-profit');

		try {
			assertValidScenarioDefinition({ ...validDefinition(), dayLimit: 0 });
			expect.fail('expected validation to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(Error);
			expect((error as Error & { diagnostics?: unknown }).diagnostics).toEqual(
				validateScenarioDefinition({ ...validDefinition(), dayLimit: 0 })
			);
		}
	});

	it('uses the singular "diagnostic" label when exactly one diagnostic is produced', () => {
		// A definition with only an invalid dayLimit produces a single diagnostic.
		const minimal: unknown = { ...validDefinition(), dayLimit: 0 };
		const diagnostics = validateScenarioDefinition(minimal);
		expect(diagnostics).toHaveLength(1);
		try {
			assertValidScenarioDefinition(minimal);
			expect.fail('expected validation to throw');
		} catch (error) {
			expect((error as Error).message).toContain('(1 diagnostic)');
			expect((error as Error).message).not.toContain('diagnostics');
			expect((error as Error & { name?: string }).name).toBe('ScenarioDefinitionValidationError');
		}
	});
});

describe('sortScenarioDiagnostics', () => {
	it('uses plain code-unit path and code comparison without mutating the input', () => {
		const diagnostics = [
			{ path: 'z', code: 'b', value: 1, detail: 'z/b' },
			{ path: 'A', code: 'z', value: 2, detail: 'A/z' },
			{ path: 'z', code: 'a', value: 3, detail: 'z/a' }
		];
		expect(sortScenarioDiagnostics(diagnostics).map(({ path, code }) => ({ path, code }))).toEqual([
			{ path: 'A', code: 'z' },
			{ path: 'z', code: 'a' },
			{ path: 'z', code: 'b' }
		]);
		expect(diagnostics[0]?.code).toBe('b');
	});
});

describe('validateScenarioSetupReserve', () => {
	it('accepts finite non-negative calculated reserves', () => {
		expect(validateScenarioSetupReserve(0)).toEqual([]);
		expect(validateScenarioSetupReserve(12_345)).toEqual([]);
	});

	it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
		'rejects a non-finite or negative calculated reserve: %s',
		(reserve) => {
			expect(validateScenarioSetupReserve(reserve)).toEqual([
				{
					path: 'start',
					code: 'invalid-setup-reserve',
					value: reserve,
					detail: 'The calculated transient setup reserve must be finite and non-negative.'
				}
			]);
		}
	);
});

describe('validateScenarioDefinition coverage gaps', () => {
	it('rejects a non-object score component', () => {
		const definition = malformedDefinition();
		definition.scoreComponents = ['not-an-object'];
		expect(codes(definition)).toContainEqual({
			path: 'scoreComponents[0]',
			code: 'invalid-object'
		});
	});

	it('rejects an optional-objective score component referencing an unknown objective', () => {
		const definition = validDefinition();
		definition.scoreComponents = [
			{ kind: 'optional-objective', objectiveId: 'missing-objective', points: 500 }
		];
		expect(codes(definition)).toContainEqual({
			path: 'scoreComponents[0].objectiveId',
			code: 'invalid-reference'
		});
	});

	it('rejects a metric score component with an unsupported window', () => {
		const definition = validDefinition();
		definition.scoreComponents = [
			{
				kind: 'metric',
				query: { metric: 'cash' },
				window: { kind: 'run-to-date' },
				zeroBonusAt: 0,
				fullBonusAt: 1,
				points: 500
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'scoreComponents[0].window.kind',
			code: 'unsupported-window'
		});
	});

	it('rejects a score component with an unsupported kind', () => {
		const definition = malformedDefinition();
		definition.scoreComponents = [{ kind: 'mystery', points: 500 }];
		expect(codes(definition)).toContainEqual({
			path: 'scoreComponents[0].kind',
			code: 'unsupported-score-component'
		});
	});

	it('rejects a score component with non-integer points', () => {
		const definition = validDefinition();
		definition.scoreComponents = [
			{ kind: 'optional-objective', objectiveId: 'one-store', points: 500.5 }
		];
		expect(codes(definition)).toContainEqual({
			path: 'scoreComponents[0].points',
			code: 'invalid-score-points'
		});
	});

	it('rejects equal score anchors', () => {
		const definition = validDefinition();
		definition.scoreComponents = [
			{ kind: 'remaining-days', zeroBonusAt: 5, fullBonusAt: 5, points: 500 }
		];
		expect(codes(definition)).toContainEqual({
			path: 'scoreComponents[0]',
			code: 'invalid-score-anchors'
		});
	});

	it('rejects a non-object modifier', () => {
		const definition = malformedDefinition();
		definition.modifiers = ['not-an-object'];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[0]',
			code: 'invalid-object'
		});
	});

	it('rejects an import-cost-multiplier with an unsupported scope', () => {
		const definition = malformedDefinition();
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'bad-scope',
				target: { kind: 'all' },
				multiplier: 1.5
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[0].scope',
			code: 'invalid-modifier'
		});
	});

	it('rejects an import-cost-multiplier with a non-positive multiplier', () => {
		const definition = malformedDefinition();
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'all' },
				multiplier: 0
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[0].multiplier',
			code: 'invalid-modifier'
		});
	});

	it('rejects a non-object modifier target', () => {
		const definition = malformedDefinition();
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: 'not-an-object',
				multiplier: 1.5
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[0].target',
			code: 'invalid-object'
		});
	});

	it('rejects a modifier target with an unsupported kind', () => {
		const definition = malformedDefinition();
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'bad' },
				multiplier: 1.5
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[0].target.kind',
			code: 'invalid-modifier'
		});
	});

	it('rejects an unsupported objective comparator', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives[0].comparator = 'bad';
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].comparator',
			code: 'unsupported-comparator'
		});
	});

	it('rejects a non-boolean requiresCompleteWindow', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives[0].requiresCompleteWindow = 'yes';
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].requiresCompleteWindow',
			code: 'invalid-boolean'
		});
	});

	it('rejects a non-object metric query', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives[0].query = 'not-an-object';
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].query',
			code: 'invalid-object'
		});
	});

	it('rejects a category metric query with an empty categoryIds array', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: { metric: 'retail-import-spend', categoryIds: [] },
				window: { kind: 'run-to-date' }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].query.categoryIds',
			code: 'missing-reference'
		});
	});

	it('rejects a scorecard query with an unknown score key', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: { metric: 'scorecard', score: 'bad' },
				window: { kind: 'current' }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].query.score',
			code: 'invalid-reference'
		});
	});

	it('flags industrial-building-count building types excluded by content rules', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: { metric: 'industrial-building-count', buildingTypeIds: ['water-pump'] },
				window: { kind: 'current' }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].query.buildingTypeIds[0]',
			code: 'excluded-content'
		});
	});

	it('rejects a non-object metric window', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives[0].window = 'not-an-object';
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].window',
			code: 'invalid-object'
		});
	});

	it('rejects a trailing-reports window with a non-positive count', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				window: { kind: 'trailing-reports', count: 0 }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].window',
			code: 'invalid-window'
		});
	});

	it('rejects an unsupported window kind', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives[0].window = { kind: 'bad-window' };
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].window.kind',
			code: 'unsupported-window'
		});
	});

	it('rejects requiresCompleteWindow on a non-trailing window', () => {
		const definition = validDefinition();
		definition.requiredObjectives[0].requiresCompleteWindow = true;
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].requiresCompleteWindow',
			code: 'invalid-complete-window'
		});
	});

	it('rejects a local-production category that is not a finished material', () => {
		const definition = malformedDefinition();
		definition.content.productCategoryIds = ['bottled-water', 'household'];
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: { metric: 'retail-local-units', categoryIds: ['household'] },
				window: { kind: 'run-to-date' }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].query',
			code: 'unavailable-local-production-path'
		});
	});

	it('rejects a retail placement in an industry city', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.retailPlacements = [
			{
				cityId: 'industry-city',
				tileId: 'industry-city-3-19',
				archetypeId: 'convenience'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'content.retailPlacements[0].cityId',
			code: 'invalid-placement'
		});
	});

	it('rejects an industrial placement in a retail city', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.content.industrialPlacements = [
			{
				cityId: 'harbor-city',
				tileId: 'harbor-city-1-1',
				buildingTypeId: 'warehouse'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'content.industrialPlacements[0].cityId',
			code: 'invalid-placement'
		});
	});

	it('rejects an industrial placement on a non-existent tile', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.content.industrialPlacements = [
			{
				cityId: 'industry-city',
				tileId: 'industry-city-99-99',
				buildingTypeId: 'warehouse'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'content.industrialPlacements[0].tileId',
			code: 'invalid-placement'
		});
	});

	it('rejects a rail with non-integer coordinates', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.rails = [{ cityId: 'industry-city', x: 1.5, y: 2.5, level: 1 }];
		expect(codes(definition)).toContainEqual({
			path: 'start.rails[0].x',
			code: 'invalid-rail-coordinate'
		});
		expect(codes(definition)).toContainEqual({
			path: 'start.rails[0].y',
			code: 'invalid-rail-coordinate'
		});
	});

	it('rejects an unsupported policy value', () => {
		const definition = malformedDefinition();
		definition.start.overrides.policy = {
			pricing: 'bad',
			inventory: 'lean',
			staffing: 'efficient',
			marketing: 'none',
			service: 'balanced'
		};
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.policy.pricing',
			code: 'invalid-policy'
		});
	});

	it('rejects a duplicate product category in store overrides', () => {
		const definition = validDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 'founder',
				targetLevel: 1,
				products: [
					{
						categoryId: 'bottled-water',
						stock: 10,
						reorderThreshold: 2,
						targetStock: 12,
						sellingPrice: 3
					},
					{
						categoryId: 'bottled-water',
						stock: 5,
						reorderThreshold: 2,
						targetStock: 8,
						sellingPrice: 3
					}
				]
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].products[1].categoryId',
			code: 'duplicate-reference'
		});
	});

	it('rejects a reorder threshold exceeding target stock', () => {
		const definition = validDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 'founder',
				targetLevel: 1,
				products: [
					{
						categoryId: 'bottled-water',
						stock: 10,
						reorderThreshold: 20,
						targetStock: 10,
						sellingPrice: 3
					}
				]
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].products[0].reorderThreshold',
			code: 'invalid-inventory-target'
		});
	});

	it('rejects a duplicate building inventory reference', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.start.industrialBuildings = [
			{
				ref: 'warehouse',
				typeId: 'warehouse',
				cityId: 'industry-city',
				tileId: 'industry-city-26-6'
			}
		];
		definition.start.overrides.buildingInventories = [
			{ buildingRef: 'warehouse', materials: {} },
			{ buildingRef: 'warehouse', materials: {} }
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.buildingInventories[1].buildingRef',
			code: 'duplicate-reference'
		});
	});

	it('does not give the removed aggregate override a dual-read validation path', () => {
		const definition = malformedDefinition();
		definition.start.overrides[removedStartOverrideKey] = 'not-an-object';
		expect(codes(definition)).toContainEqual({
			path: `start.overrides.${removedStartOverrideKey}`,
			code: 'unknown-key'
		});
	});

	it('rejects an opened city that is not revealed', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.overrides.world = {
			revealedCityIds: ['harbor-city'],
			openedCityIds: ['harbor-city', 'industry-city'],
			activeRetailCityId: 'harbor-city',
			activeIndustryCityId: 'industry-city'
		};
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.world.openedCityIds',
			code: 'invalid-world-state'
		});
	});

	it('defaults the store cap to the starter cap when openStore is allowed and storeCap is absent', () => {
		const definition = validDefinition();
		definition.allowedCommands = ['advanceDay', 'openStore'];
		delete definition.start.overrides.storeCap;
		expect(
			codes(definition).filter((diagnostic) => diagnostic.code === 'invalid-store-cap')
		).toEqual([]);
	});

	it('rejects a store cap below the starting store count', () => {
		const definition = validDefinition();
		definition.start.overrides.storeCap = 0;
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.storeCap',
			code: 'invalid-store-cap'
		});
	});

	it('rejects a non-object content value', () => {
		const definition = malformedDefinition();
		definition.content = 'not-an-object';
		expect(codes(definition)).toContainEqual({
			path: 'content',
			code: 'invalid-object'
		});
	});

	it('rejects a missing required definition key', () => {
		const definition = malformedDefinition();
		delete definition.id;
		expect(codes(definition)).toContainEqual({
			path: 'id',
			code: 'missing-key'
		});
	});

	it('rejects a non-array allowedCommands value', () => {
		const definition = malformedDefinition();
		definition.allowedCommands = 'advanceDay';
		expect(codes(definition)).toContainEqual({
			path: 'allowedCommands',
			code: 'invalid-array'
		});
	});

	it('rejects a non-finite objective target', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives[0].target = Number.NaN;
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].target',
			code: 'invalid-finite-number'
		});
	});

	it('rejects an empty objective labelKey', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives[0].labelKey = '';
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].labelKey',
			code: 'invalid-string'
		});
	});

	it('validates cash and debt override values', () => {
		const definition = malformedDefinition();
		definition.start.overrides.cash = 100.5;
		definition.start.overrides.debt = -50;
		expect(codes(definition)).toEqual(
			expect.arrayContaining([
				{ path: 'start.overrides.cash', code: 'invalid-non-negative-integer' },
				{ path: 'start.overrides.debt', code: 'invalid-non-negative-integer' }
			])
		);
	});

	it('rejects a store override referencing an unknown store ref', () => {
		const definition = validDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 'nonexistent',
				targetLevel: 1,
				products: definition.start.overrides.stores?.[0]?.products
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].storeRef',
			code: 'invalid-reference'
		});
	});

	it('rejects building inventory materials exceeding buffer capacity', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.materialIds = ['water'];
		definition.content.buildingTypeIds = ['water-pump'];
		definition.start.industrialBuildings = [
			{
				ref: 'pump',
				typeId: 'water-pump',
				cityId: 'industry-city',
				tileId: 'industry-city-3-19'
			}
		];
		definition.start.overrides.buildingInventories = [
			{ buildingRef: 'pump', materials: { water: 999 } }
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.buildingInventories[0].materials',
			code: 'building-inventory-capacity-exceeded'
		});
	});

	it('accepts city-local materials within the owning warehouse capacity', () => {
		const definition = cityInventoryDefinition();
		definition.start.overrides.cityInventoryMaterials = [
			{ cityId: 'industry-city', materials: { water: 100 } }
		];
		expect(codes(definition)).toEqual([]);
	});

	it('rejects a duplicate allowed command', () => {
		const definition = malformedDefinition();
		definition.allowedCommands = ['advanceDay', 'advanceDay'];
		expect(codes(definition)).toContainEqual({
			path: 'allowedCommands[1]',
			code: 'duplicate-command'
		});
	});

	it('rejects an import-cost-multiplier modifier that is not a closed object', () => {
		const definition = malformedDefinition();
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'all' },
				multiplier: 1.5,
				extra: true
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[0].extra',
			code: 'unknown-key'
		});
	});

	it('validates inclusion of ids-target product references against content rules', () => {
		const definition = malformedDefinition();
		definition.content.productCategoryIds = ['bottled-water'];
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'ids', ids: ['produce'] },
				multiplier: 1.5
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[0].target.ids[0]',
			code: 'excluded-content'
		});
	});

	it('accepts a valid rail topology connecting two authored buildings', () => {
		const definition = validDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.content.industrialPlacements = [
			{
				cityId: 'industry-city',
				tileId: 'industry-city-26-6',
				buildingTypeId: 'warehouse'
			},
			{
				cityId: 'industry-city',
				tileId: 'industry-city-30-6',
				buildingTypeId: 'warehouse'
			}
		];
		definition.start.industrialBuildings = [
			{
				ref: 'wh-a',
				typeId: 'warehouse',
				cityId: 'industry-city',
				tileId: 'industry-city-26-6'
			},
			{
				ref: 'wh-b',
				typeId: 'warehouse',
				cityId: 'industry-city',
				tileId: 'industry-city-30-6'
			}
		];
		definition.allowedCommands = ['advanceDay', 'buildIndustrialBuilding', 'buildRail'];
		definition.start.rails = [
			{ cityId: 'industry-city', x: 28, y: 6, level: 1 },
			{ cityId: 'industry-city', x: 29, y: 6, level: 1 }
		];
		expect(codes(definition)).toEqual([]);
	});

	it('validates local-production paths using authored rail connections without buildRail', () => {
		const definition = validDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.materialIds = ['water'];
		definition.content.buildingTypeIds = ['water-pump', 'water-bottler', 'warehouse'];
		definition.content.industrialPlacements = [];
		definition.start.industrialBuildings = [
			{
				ref: 'pump',
				typeId: 'water-pump',
				cityId: 'industry-city',
				tileId: 'industry-city-3-19'
			},
			{
				ref: 'bottler',
				typeId: 'water-bottler',
				cityId: 'industry-city',
				tileId: 'industry-city-26-6'
			},
			{
				ref: 'warehouse',
				typeId: 'warehouse',
				cityId: 'industry-city',
				tileId: 'industry-city-30-6'
			}
		];
		// Authored rails connecting all three buildings in one component.
		// The industry city has an internal separator at x=25 (blocked except
		// at y=12, 24, 36), so the path crosses at y=12. The path routes
		// around the bottler footprint (26,6)-(27,7) via its bottom edge.
		const rails: Array<{ cityId: string; x: number; y: number; level: number }> = [];
		for (let x = 5; x <= 24; x++) rails.push({ cityId: 'industry-city', x, y: 19, level: 1 });
		for (let y = 18; y >= 12; y--) rails.push({ cityId: 'industry-city', x: 24, y, level: 1 });
		rails.push({ cityId: 'industry-city', x: 25, y: 12, level: 1 });
		for (let y = 12; y >= 8; y--) rails.push({ cityId: 'industry-city', x: 26, y, level: 1 });
		rails.push({ cityId: 'industry-city', x: 27, y: 8, level: 1 });
		rails.push({ cityId: 'industry-city', x: 28, y: 8, level: 1 });
		rails.push({ cityId: 'industry-city', x: 28, y: 7, level: 1 });
		rails.push({ cityId: 'industry-city', x: 28, y: 6, level: 1 });
		rails.push({ cityId: 'industry-city', x: 29, y: 6, level: 1 });
		definition.start.rails = rails as ScenarioDefinition['start']['rails'];
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0]!,
				query: { metric: 'retail-local-units', categoryIds: ['bottled-water'] },
				window: { kind: 'run-to-date' }
			}
		];
		expect(codes(definition)).toEqual([]);
	});

	it('skips a content industrial placement that overlaps a starting building in local-production', () => {
		const definition = validDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.materialIds = ['water'];
		definition.content.buildingTypeIds = ['water-pump', 'water-bottler', 'warehouse'];
		// Content bottler at 27-6 overlaps the start warehouse at 26-6.
		// hasFeasibleBuildingPath must skip the content bottler because it
		// overlaps a starting building, leaving no valid bottler candidate.
		definition.content.industrialPlacements = [
			{
				cityId: 'industry-city',
				tileId: 'industry-city-3-19',
				buildingTypeId: 'water-pump'
			},
			{
				cityId: 'industry-city',
				tileId: 'industry-city-27-6',
				buildingTypeId: 'water-bottler'
			},
			{
				cityId: 'industry-city',
				tileId: 'industry-city-30-6',
				buildingTypeId: 'warehouse'
			}
		];
		definition.start.industrialBuildings = [
			{
				ref: 'pump',
				typeId: 'water-pump',
				cityId: 'industry-city',
				tileId: 'industry-city-3-19'
			},
			{
				ref: 'warehouse',
				typeId: 'warehouse',
				cityId: 'industry-city',
				tileId: 'industry-city-26-6'
			}
		];
		definition.allowedCommands = ['advanceDay', 'buildIndustrialBuilding', 'buildRail'];
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0]!,
				query: { metric: 'retail-local-units', categoryIds: ['bottled-water'] },
				window: { kind: 'run-to-date' }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].query',
			code: 'unavailable-local-production-path'
		});
	});

	it('rejects a non-string known reference value', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = [123];
		expect(codes(definition)).toContainEqual({
			path: 'content.cityIds[0]',
			code: 'invalid-string'
		});
	});

	it('rejects a non-array reference array value', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = 'not-an-array';
		expect(codes(definition)).toContainEqual({
			path: 'content.cityIds',
			code: 'invalid-array'
		});
	});

	it('rejects a retail placement with a non-string tileId', () => {
		const definition = malformedDefinition();
		definition.content.retailPlacements = [
			{
				cityId: 'harbor-city',
				tileId: 123,
				archetypeId: 'convenience'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'content.retailPlacements[0].tileId',
			code: 'invalid-string'
		});
	});

	it('rejects an industrial placement with an invalid city reference', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.content.industrialPlacements = [
			{
				cityId: 'missing-city',
				tileId: 'industry-city-26-6',
				buildingTypeId: 'warehouse'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'content.industrialPlacements[0].cityId',
			code: 'invalid-reference'
		});
	});

	it('rejects an industrial placement with an invalid building type reference', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.content.industrialPlacements = [
			{
				cityId: 'industry-city',
				tileId: 'industry-city-26-6',
				buildingTypeId: 'missing-type'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'content.industrialPlacements[0].buildingTypeId',
			code: 'invalid-reference'
		});
	});

	it('rejects an industrial placement with a non-string tileId', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.content.industrialPlacements = [
			{
				cityId: 'industry-city',
				tileId: 123,
				buildingTypeId: 'warehouse'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'content.industrialPlacements[0].tileId',
			code: 'invalid-string'
		});
	});

	it('rejects a retail placement in a non-retail city via founding store', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.foundingStore.cityId = 'industry-city';
		definition.start.foundingStore.tileId = 'industry-city-3-19';
		expect(codes(definition)).toContainEqual({
			path: 'start.foundingStore.cityId',
			code: 'invalid-placement'
		});
	});

	it('rejects a founding store with a non-string tileId', () => {
		const definition = malformedDefinition();
		definition.start.foundingStore.tileId = 123;
		expect(codes(definition)).toContainEqual({
			path: 'start.foundingStore.tileId',
			code: 'invalid-string'
		});
	});

	it('rejects a start industrial building with an invalid city reference', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.start.industrialBuildings = [
			{
				ref: 'wh',
				typeId: 'warehouse',
				cityId: 'missing-city',
				tileId: 'industry-city-26-6'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.industrialBuildings[0].cityId',
			code: 'invalid-reference'
		});
	});

	it('rejects a start industrial building with an invalid type reference', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.start.industrialBuildings = [
			{
				ref: 'wh',
				typeId: 'missing-type',
				cityId: 'industry-city',
				tileId: 'industry-city-26-6'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.industrialBuildings[0].typeId',
			code: 'invalid-reference'
		});
	});

	it('rejects a start industrial building with a non-string tileId', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.start.industrialBuildings = [
			{
				ref: 'wh',
				typeId: 'warehouse',
				cityId: 'industry-city',
				tileId: 123
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.industrialBuildings[0].tileId',
			code: 'invalid-string'
		});
	});

	it('rejects a start industrial building in a retail city', () => {
		const definition = validDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.start.industrialBuildings = [
			{
				ref: 'wh',
				typeId: 'warehouse',
				cityId: 'harbor-city',
				tileId: 'harbor-city-1-1'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.industrialBuildings[0].cityId',
			code: 'invalid-placement'
		});
	});

	it('rejects a start industrial building on a non-existent tile', () => {
		const definition = validDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.start.industrialBuildings = [
			{
				ref: 'wh',
				typeId: 'warehouse',
				cityId: 'industry-city',
				tileId: 'industry-city-99-99'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.industrialBuildings[0].tileId',
			code: 'invalid-placement'
		});
	});

	it('rejects a rail referencing an unknown city', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.rails = [{ cityId: 'missing-city', x: 28, y: 6, level: 1 }];
		expect(codes(definition)).toContainEqual({
			path: 'start.rails[0].cityId',
			code: 'invalid-reference'
		});
	});

	it('rejects a rail with an invalid level', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.rails = [{ cityId: 'industry-city', x: 28, y: 6, level: 99 }];
		expect(codes(definition)).toContainEqual({
			path: 'start.rails[0].level',
			code: 'invalid-rail-level'
		});
	});

	it('rejects a rail on a locked or occupied tile', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.content.industrialPlacements = [
			{
				cityId: 'industry-city',
				tileId: 'industry-city-26-6',
				buildingTypeId: 'warehouse'
			}
		];
		definition.start.industrialBuildings = [
			{
				ref: 'wh',
				typeId: 'warehouse',
				cityId: 'industry-city',
				tileId: 'industry-city-26-6'
			}
		];
		// Rail on a tile occupied by the building footprint
		definition.start.rails = [{ cityId: 'industry-city', x: 26, y: 6, level: 1 }];
		expect(codes(definition)).toContainEqual({
			path: 'start.rails[0]',
			code: 'invalid-rail-coordinate'
		});
	});

	it('rejects a world override with an invalid active retail city', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.overrides.world = {
			revealedCityIds: ['harbor-city', 'industry-city'],
			openedCityIds: ['harbor-city', 'industry-city'],
			activeRetailCityId: 'industry-city',
			activeIndustryCityId: 'industry-city'
		};
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.world.activeRetailCityId',
			code: 'invalid-world-state'
		});
	});

	it('rejects a world override with an invalid active industry city', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.overrides.world = {
			revealedCityIds: ['harbor-city', 'industry-city'],
			openedCityIds: ['harbor-city', 'industry-city'],
			activeRetailCityId: 'harbor-city',
			activeIndustryCityId: 'harbor-city'
		};
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.world.activeIndustryCityId',
			code: 'invalid-world-state'
		});
	});

	it('rejects a store override with a non-integer target level', () => {
		const definition = validDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 'founder',
				targetLevel: 1.5,
				products: definition.start.overrides.stores?.[0]?.products
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].targetLevel',
			code: 'invalid-target-level'
		});
	});

	it('rejects a store override with a target level below 1', () => {
		const definition = validDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 'founder',
				targetLevel: 0,
				products: definition.start.overrides.stores?.[0]?.products
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].targetLevel',
			code: 'invalid-target-level'
		});
	});

	it('rejects a product override with an unknown category reference', () => {
		const definition = validDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 'founder',
				targetLevel: 1,
				products: [
					{
						categoryId: 'missing-category',
						stock: 10,
						reorderThreshold: 2,
						targetStock: 12,
						sellingPrice: 3
					}
				]
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].products[0].categoryId',
			code: 'invalid-reference'
		});
	});

	it('rejects a product override with a non-finite selling price', () => {
		const definition = validDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 'founder',
				targetLevel: 1,
				products: [
					{
						categoryId: 'bottled-water',
						stock: 10,
						reorderThreshold: 2,
						targetStock: 12,
						sellingPrice: Number.NaN
					}
				]
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].products[0].sellingPrice',
			code: 'invalid-finite-number'
		});
	});

	it('rejects a product override with negative stock', () => {
		const definition = validDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 'founder',
				targetLevel: 1,
				products: [
					{
						categoryId: 'bottled-water',
						stock: -5,
						reorderThreshold: 2,
						targetStock: 12,
						sellingPrice: 3
					}
				]
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].products[0].stock',
			code: 'invalid-non-negative-number'
		});
	});

	it('rejects a building inventory with a non-string buildingRef', () => {
		const definition = malformedDefinition();
		definition.start.overrides.buildingInventories = [{ buildingRef: 123, materials: {} }];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.buildingInventories[0].buildingRef',
			code: 'invalid-string'
		});
	});

	it('rejects a city inventory entry with an unknown material', () => {
		const definition = cityInventoryDefinition() as unknown as MalformedDefinition;
		definition.start.overrides.cityInventoryMaterials = [
			{ cityId: 'industry-city', materials: { 'missing-material': 5 } }
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].materials.missing-material',
			code: 'invalid-reference'
		});
	});

	it('rejects a city inventory entry with a negative quantity', () => {
		const definition = cityInventoryDefinition();
		definition.start.overrides.cityInventoryMaterials = [
			{ cityId: 'industry-city', materials: { water: -3 } }
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.cityInventoryMaterials[0].materials.water',
			code: 'invalid-non-negative-number'
		});
	});

	it('rejects a building inventory materials value that is not an object', () => {
		const definition = malformedDefinition();
		definition.start.overrides.buildingInventories = [
			{ buildingRef: 'founder', materials: 'not-an-object' }
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.buildingInventories[0].materials',
			code: 'invalid-object'
		});
	});

	it('rejects a policy override that is not a closed object', () => {
		const definition = malformedDefinition();
		definition.start.overrides.policy = 'not-an-object';
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.policy',
			code: 'invalid-object'
		});
	});

	it('rejects a store overrides value that is not an array', () => {
		const definition = malformedDefinition();
		definition.start.overrides.stores = 'not-an-array';
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores',
			code: 'invalid-array'
		});
	});

	it('rejects a building inventories value that is not an array', () => {
		const definition = malformedDefinition();
		definition.start.overrides.buildingInventories = 'not-an-array';
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.buildingInventories',
			code: 'invalid-array'
		});
	});

	it('rejects a world override that is not a closed object', () => {
		const definition = malformedDefinition();
		definition.start.overrides.world = 'not-an-object';
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.world',
			code: 'invalid-object'
		});
	});

	it('rejects a store cap that is not an integer', () => {
		const definition = validDefinition();
		definition.start.overrides.storeCap = 1.5;
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.storeCap',
			code: 'invalid-store-cap'
		});
	});

	it('rejects a store cap that does not equal the starting store count when openStore is forbidden', () => {
		const definition = validDefinition();
		definition.allowedCommands = ['advanceDay'];
		definition.start.overrides.storeCap = 2;
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.storeCap',
			code: 'invalid-store-cap'
		});
	});

	it('rejects a product override for a category not unlocked at target level', () => {
		const definition = validDefinition();
		definition.content.productCategoryIds = ['bottled-water', 'snacks'];
		definition.start.overrides.stores = [
			{
				storeRef: 'founder',
				targetLevel: 1,
				products: [
					{
						categoryId: 'snacks',
						stock: 10,
						reorderThreshold: 2,
						targetStock: 12,
						sellingPrice: 3
					}
				]
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].products[0].categoryId',
			code: 'product-locked'
		});
	});

	it('rejects a start overrides value that is not a closed object', () => {
		const definition = malformedDefinition();
		definition.start.overrides = 'not-an-object';
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides',
			code: 'invalid-object'
		});
	});

	it('rejects a founding store that is not a closed object', () => {
		const definition = malformedDefinition();
		definition.start.foundingStore = 'not-an-object';
		expect(codes(definition)).toContainEqual({
			path: 'start.foundingStore',
			code: 'invalid-object'
		});
	});

	it('rejects a start value that is not a closed object', () => {
		const definition = malformedDefinition();
		definition.start = 'not-an-object';
		expect(codes(definition)).toContainEqual({
			path: 'start',
			code: 'invalid-object'
		});
	});

	it('rejects a rail with a non-integer x coordinate only', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.rails = [{ cityId: 'industry-city', x: 1.5, y: 6, level: 1 }];
		expect(codes(definition)).toContainEqual({
			path: 'start.rails[0].x',
			code: 'invalid-rail-coordinate'
		});
		expect(codes(definition).filter((d) => d.path === 'start.rails[0].y')).toEqual([]);
	});

	it('rejects a rail with a non-integer y coordinate only', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.rails = [{ cityId: 'industry-city', x: 28, y: 6.5, level: 1 }];
		expect(codes(definition)).toContainEqual({
			path: 'start.rails[0].y',
			code: 'invalid-rail-coordinate'
		});
	});

	it('rejects a modifier target ids array with a non-string entry', () => {
		const definition = malformedDefinition();
		definition.content.productCategoryIds = ['bottled-water'];
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'ids', ids: [123] },
				multiplier: 1.5
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[0].target.ids[0]',
			code: 'invalid-string'
		});
	});

	it('rejects an industrial-material modifier target with an unknown material', () => {
		const definition = malformedDefinition();
		definition.content.materialIds = ['water'];
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'industrial-material',
				target: { kind: 'ids', ids: ['missing-material'] },
				multiplier: 1.5
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[0].target.ids[0]',
			code: 'invalid-reference'
		});
	});

	it('rejects an industrial-material modifier target excluded by content rules', () => {
		const definition = malformedDefinition();
		definition.content.materialIds = ['water'];
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'industrial-material',
				target: { kind: 'ids', ids: ['water', 'sugar'] },
				multiplier: 1.5
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[0].target.ids[1]',
			code: 'excluded-content'
		});
	});

	it('rejects a modifier target with an ids kind but missing ids field', () => {
		const definition = malformedDefinition();
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'ids' },
				multiplier: 1.5
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[0].target.ids',
			code: 'missing-key'
		});
	});

	it('rejects a non-finite import multiplier', () => {
		const definition = malformedDefinition();
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'all' },
				multiplier: Number.NaN
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[0].multiplier',
			code: 'invalid-modifier'
		});
	});

	it('tracks overlapping ids-target modifiers within the same scope', () => {
		const definition = malformedDefinition();
		definition.content.productCategoryIds = ['bottled-water', 'produce'];
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'ids', ids: ['bottled-water'] },
				multiplier: 1.5
			},
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'ids', ids: ['bottled-water'] },
				multiplier: 2
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[1].target',
			code: 'invalid-modifier'
		});
	});

	it('tracks an all-target modifier followed by an ids-target modifier in the same scope', () => {
		const definition = malformedDefinition();
		definition.content.productCategoryIds = ['bottled-water'];
		definition.modifiers = [
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'all' },
				multiplier: 1.5
			},
			{
				kind: 'import-cost-multiplier',
				scope: 'retail-product',
				target: { kind: 'ids', ids: ['bottled-water'] },
				multiplier: 2
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[1].target',
			code: 'invalid-modifier'
		});
	});

	it('rejects a retail placement with an unknown archetype reference', () => {
		const definition = malformedDefinition();
		definition.content.retailPlacements = [
			{
				cityId: 'harbor-city',
				tileId: 'harbor-city-1-1',
				archetypeId: 'missing-archetype'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'content.retailPlacements[0].archetypeId',
			code: 'invalid-reference'
		});
	});

	it('rejects a retail placement with an unknown city reference', () => {
		const definition = malformedDefinition();
		definition.content.retailPlacements = [
			{
				cityId: 'missing-city',
				tileId: 'harbor-city-1-1',
				archetypeId: 'convenience'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'content.retailPlacements[0].cityId',
			code: 'invalid-reference'
		});
	});

	it('rejects a retail placement with a non-string cityId', () => {
		const definition = malformedDefinition();
		definition.content.retailPlacements = [
			{
				cityId: 123,
				tileId: 'harbor-city-1-1',
				archetypeId: 'convenience'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'content.retailPlacements[0].cityId',
			code: 'invalid-string'
		});
	});

	it('rejects a retail placement that is not a closed object', () => {
		const definition = malformedDefinition();
		definition.content.retailPlacements = ['not-an-object'];
		expect(codes(definition)).toContainEqual({
			path: 'content.retailPlacements[0]',
			code: 'invalid-object'
		});
	});

	it('rejects an industrial placement that is not a closed object', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.content.industrialPlacements = ['not-an-object'];
		expect(codes(definition)).toContainEqual({
			path: 'content.industrialPlacements[0]',
			code: 'invalid-object'
		});
	});

	it('rejects a start industrial building that is not a closed object', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.start.industrialBuildings = ['not-an-object'];
		expect(codes(definition)).toContainEqual({
			path: 'start.industrialBuildings[0]',
			code: 'invalid-object'
		});
	});

	it('rejects a rail that is not a closed object', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.rails = ['not-an-object'];
		expect(codes(definition)).toContainEqual({
			path: 'start.rails[0]',
			code: 'invalid-object'
		});
	});

	it('rejects a store override that is not a closed object', () => {
		const definition = malformedDefinition();
		definition.start.overrides.stores = ['not-an-object'];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0]',
			code: 'invalid-object'
		});
	});

	it('rejects a product override that is not a closed object', () => {
		const definition = malformedDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 'founder',
				targetLevel: 1,
				products: ['not-an-object']
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].products[0]',
			code: 'invalid-object'
		});
	});

	it('rejects a building inventory that is not a closed object', () => {
		const definition = malformedDefinition();
		definition.start.overrides.buildingInventories = ['not-an-object'];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.buildingInventories[0]',
			code: 'invalid-object'
		});
	});

	it('rejects a start industrial buildings value that is not an array', () => {
		const definition = malformedDefinition();
		definition.start.industrialBuildings = 'not-an-array';
		expect(codes(definition)).toContainEqual({
			path: 'start.industrialBuildings',
			code: 'invalid-array'
		});
	});

	it('rejects a rails value that is not an array', () => {
		const definition = malformedDefinition();
		definition.start.rails = 'not-an-array';
		expect(codes(definition)).toContainEqual({
			path: 'start.rails',
			code: 'invalid-array'
		});
	});

	it('rejects a product overrides value that is not an array', () => {
		const definition = malformedDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 'founder',
				targetLevel: 1,
				products: 'not-an-array'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].products',
			code: 'invalid-array'
		});
	});

	it('rejects a world override with an unknown active city reference', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.overrides.world = {
			revealedCityIds: ['harbor-city', 'industry-city'],
			openedCityIds: ['harbor-city', 'industry-city'],
			activeRetailCityId: 'missing-city',
			activeIndustryCityId: 'industry-city'
		};
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.world.activeRetailCityId',
			code: 'invalid-reference'
		});
	});

	it('rejects a world override with an active city not in opened cities', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.overrides.world = {
			revealedCityIds: ['harbor-city', 'industry-city'],
			openedCityIds: ['harbor-city'],
			activeRetailCityId: 'harbor-city',
			activeIndustryCityId: 'industry-city'
		};
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.world.activeIndustryCityId',
			code: 'invalid-world-state'
		});
	});

	it('rejects a world override with a non-array revealedCityIds', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.overrides.world = {
			revealedCityIds: 'not-an-array',
			openedCityIds: ['harbor-city', 'industry-city'],
			activeRetailCityId: 'harbor-city',
			activeIndustryCityId: 'industry-city'
		};
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.world.revealedCityIds',
			code: 'invalid-array'
		});
	});

	it('rejects a world override with a non-array openedCityIds', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.start.overrides.world = {
			revealedCityIds: ['harbor-city', 'industry-city'],
			openedCityIds: 'not-an-array',
			activeRetailCityId: 'harbor-city',
			activeIndustryCityId: 'industry-city'
		};
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.world.openedCityIds',
			code: 'invalid-array'
		});
	});

	it('rejects a city-inventory query with an unknown material reference', () => {
		const definition = cityInventoryDefinition() as unknown as MalformedDefinition;
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: {
					metric: 'city-inventory-quantity',
					cityId: 'industry-city',
					materialId: 'missing-material'
				},
				window: { kind: 'current' }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].query.materialId',
			code: 'invalid-reference'
		});
	});

	it('rejects a city-inventory query with a non-string materialId', () => {
		const definition = cityInventoryDefinition() as unknown as MalformedDefinition;
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: {
					metric: 'city-inventory-quantity',
					cityId: 'industry-city',
					materialId: 123
				},
				window: { kind: 'current' }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].query.materialId',
			code: 'invalid-string'
		});
	});

	it('rejects a scorecard query with a non-string score key', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: { metric: 'scorecard', score: 123 },
				window: { kind: 'current' }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].query.score',
			code: 'invalid-reference'
		});
	});

	it('rejects an industrial-building-count query with a non-array buildingTypeIds', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: { metric: 'industrial-building-count', buildingTypeIds: 'not-an-array' },
				window: { kind: 'current' }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].query.buildingTypeIds',
			code: 'invalid-array'
		});
	});

	it('rejects a category metric query with an unknown category reference', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: { metric: 'retail-import-spend', categoryIds: ['missing-product'] },
				window: { kind: 'run-to-date' }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].query.categoryIds[0]',
			code: 'invalid-reference'
		});
	});

	it('rejects a category metric query with a duplicate category reference', () => {
		const definition = malformedDefinition();
		definition.content.productCategoryIds = ['bottled-water'];
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: { metric: 'retail-import-spend', categoryIds: ['bottled-water', 'bottled-water'] },
				window: { kind: 'run-to-date' }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].query.categoryIds[1]',
			code: 'duplicate-reference'
		});
	});

	it('rejects a fixed-report-days window with endDay exceeding dayLimit', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: { metric: 'daily-net-income' },
				window: { kind: 'fixed-report-days', startDay: 1, endDay: 31 }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].window',
			code: 'invalid-window'
		});
	});

	it('rejects a fixed-report-days window with startDay greater than endDay', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: { metric: 'daily-net-income' },
				window: { kind: 'fixed-report-days', startDay: 5, endDay: 3 }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].window',
			code: 'invalid-window'
		});
	});

	it('rejects a fixed-report-days window with a non-integer startDay', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: { metric: 'daily-net-income' },
				window: { kind: 'fixed-report-days', startDay: 1.5, endDay: 3 }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].window',
			code: 'invalid-window'
		});
	});

	it('rejects a trailing-reports window with a non-integer count', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives = [
			{
				...definition.requiredObjectives[0],
				query: { metric: 'daily-net-income' },
				window: { kind: 'trailing-reports', count: 1.5 }
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].window',
			code: 'invalid-window'
		});
	});

	it('rejects a window without a kind field', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives[0].window = {};
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].window.kind',
			code: 'missing-key'
		});
	});

	it('rejects a metric query without a metric field', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives[0].query = {};
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].query.metric',
			code: 'missing-key'
		});
	});

	it('rejects an objective without an id field', () => {
		const definition = malformedDefinition();
		delete definition.requiredObjectives[0].id;
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].id',
			code: 'missing-key'
		});
	});

	it('rejects an objective without a query field', () => {
		const definition = malformedDefinition();
		delete definition.requiredObjectives[0].query;
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].query',
			code: 'missing-key'
		});
	});

	it('rejects an objective without a window field', () => {
		const definition = malformedDefinition();
		delete definition.requiredObjectives[0].window;
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].window',
			code: 'missing-key'
		});
	});

	it('rejects an objective without a comparator field', () => {
		const definition = malformedDefinition();
		delete definition.requiredObjectives[0].comparator;
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].comparator',
			code: 'missing-key'
		});
	});

	it('rejects an objective without a target field', () => {
		const definition = malformedDefinition();
		delete definition.requiredObjectives[0].target;
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].target',
			code: 'missing-key'
		});
	});

	it('rejects an objective without a labelKey field', () => {
		const definition = malformedDefinition();
		delete definition.requiredObjectives[0].labelKey;
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0].labelKey',
			code: 'missing-key'
		});
	});

	it('rejects an objective that is not a closed object', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives[0] = 'not-an-object';
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives[0]',
			code: 'invalid-object'
		});
	});

	it('rejects a non-array requiredObjectives value', () => {
		const definition = malformedDefinition();
		definition.requiredObjectives = 'not-an-array';
		expect(codes(definition)).toContainEqual({
			path: 'requiredObjectives',
			code: 'invalid-array'
		});
	});

	it('rejects a non-array optionalObjectives value', () => {
		const definition = malformedDefinition();
		definition.optionalObjectives = 'not-an-array';
		expect(codes(definition)).toContainEqual({
			path: 'optionalObjectives',
			code: 'invalid-array'
		});
	});

	it('rejects a non-array failures value', () => {
		const definition = malformedDefinition();
		definition.failures = 'not-an-array';
		expect(codes(definition)).toContainEqual({
			path: 'failures',
			code: 'invalid-array'
		});
	});

	it('rejects a non-array modifiers value', () => {
		const definition = malformedDefinition();
		definition.modifiers = 'not-an-array';
		expect(codes(definition)).toContainEqual({
			path: 'modifiers',
			code: 'invalid-array'
		});
	});

	it('rejects a non-array scoreComponents value', () => {
		const definition = malformedDefinition();
		definition.scoreComponents = 'not-an-array';
		expect(codes(definition)).toContainEqual({
			path: 'scoreComponents',
			code: 'invalid-array'
		});
	});

	it('rejects a non-object medalThresholds value', () => {
		const definition = malformedDefinition();
		definition.medalThresholds = 'not-an-object';
		expect(codes(definition)).toContainEqual({
			path: 'medalThresholds',
			code: 'invalid-object'
		});
	});

	it('rejects a content object missing required keys', () => {
		const definition = malformedDefinition();
		definition.content = { retailPlacements: 'not-an-array' };
		expect(codes(definition)).toContainEqual({
			path: 'content.cityIds',
			code: 'missing-key'
		});
	});

	it('rejects a retail placement with an invalid cityId in founding store path', () => {
		const definition = malformedDefinition();
		definition.start.foundingStore.cityId = 'missing-city';
		expect(codes(definition)).toContainEqual({
			path: 'start.foundingStore.cityId',
			code: 'invalid-reference'
		});
	});

	it('rejects a founding store with an unknown archetype reference', () => {
		const definition = malformedDefinition();
		definition.start.foundingStore.archetypeId = 'missing-archetype';
		expect(codes(definition)).toContainEqual({
			path: 'start.foundingStore.archetypeId',
			code: 'invalid-reference'
		});
	});

	it('rejects a founding store with a non-string ref', () => {
		const definition = malformedDefinition();
		definition.start.foundingStore.ref = 123;
		expect(codes(definition)).toContainEqual({
			path: 'start.foundingStore.ref',
			code: 'invalid-string'
		});
	});

	it('rejects a start industrial building with a non-string ref', () => {
		const definition = malformedDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city'];
		definition.content.buildingTypeIds = ['warehouse'];
		definition.start.industrialBuildings = [
			{
				ref: 123,
				typeId: 'warehouse',
				cityId: 'industry-city',
				tileId: 'industry-city-26-6'
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.industrialBuildings[0].ref',
			code: 'invalid-string'
		});
	});

	it('rejects a store override with a non-string storeRef', () => {
		const definition = malformedDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 123,
				targetLevel: 1,
				products: definition.start.overrides.stores?.[0]?.products
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].storeRef',
			code: 'invalid-string'
		});
	});

	it('rejects a product override with a non-string categoryId', () => {
		const definition = malformedDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 'founder',
				targetLevel: 1,
				products: [
					{
						categoryId: 123,
						stock: 10,
						reorderThreshold: 2,
						targetStock: 12,
						sellingPrice: 3
					}
				]
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].products[0].categoryId',
			code: 'invalid-string'
		});
	});

	it('rejects a product override with negative reorderThreshold', () => {
		const definition = validDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 'founder',
				targetLevel: 1,
				products: [
					{
						categoryId: 'bottled-water',
						stock: 10,
						reorderThreshold: -2,
						targetStock: 12,
						sellingPrice: 3
					}
				]
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].products[0].reorderThreshold',
			code: 'invalid-non-negative-number'
		});
	});

	it('rejects a product override with negative targetStock', () => {
		const definition = validDefinition();
		definition.start.overrides.stores = [
			{
				storeRef: 'founder',
				targetLevel: 1,
				products: [
					{
						categoryId: 'bottled-water',
						stock: 10,
						reorderThreshold: 2,
						targetStock: -12,
						sellingPrice: 3
					}
				]
			}
		];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.stores[0].products[0].targetStock',
			code: 'invalid-non-negative-number'
		});
	});

	it('rejects a modifier with an unsupported kind that is not an object', () => {
		const definition = malformedDefinition();
		definition.modifiers = ['not-an-object'];
		expect(codes(definition)).toContainEqual({
			path: 'modifiers[0]',
			code: 'invalid-object'
		});
	});
});
