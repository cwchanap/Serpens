import { describe, expect, it } from 'vitest';
import { SCENARIO_COMMAND_KINDS, type ScenarioDefinition } from './types';
import {
	assertValidScenarioDefinition,
	sortScenarioDiagnostics,
	validateScenarioDefinition,
	validateScenarioSetupReserve
} from './validation';

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

describe('validateScenarioDefinition', () => {
	it('accepts a complete closed definition', () => {
		expect(validateScenarioDefinition(validDefinition())).toEqual([]);
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

	it('rejects unknown keys on every closed blueprint object', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed recursive fixture
		const definition = validDefinition() as unknown as Record<string, any>;
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
			'start.overrides.policy.unexpected',
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed recursive fixture
		const definition = validDefinition() as unknown as Record<string, any>;
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed recursive fixture
		const definition = validDefinition() as unknown as Record<string, any>;
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
				id: 'warehouse',
				query: withExtra({ metric: 'warehouse-quantity', materialId: 'water' }),
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed recursive fixture
		const definition = validDefinition() as unknown as Record<string, any>;
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
		definition.content.productCategoryIds = ['bottled-water', 'devices'];
		definition.allowedCommands = ['advanceDay', 'upgradeStore'];

		expect(codes(definition)).toEqual([
			{ path: 'content.productCategoryIds[1]', code: 'product-locked' }
		]);

		definition.allowedCommands = ['advanceDay', 'openStore', 'upgradeStore'];
		definition.start.overrides.storeCap = 2;
		definition.content.retailPlacements = [
			...definition.content.retailPlacements,
			{ cityId: 'harbor-city', tileId: 'harbor-city-1-1', archetypeId: 'electronics' }
		];
		expect(codes(definition)).toEqual([
			{ path: 'content.productCategoryIds[1]', code: 'product-locked' }
		]);
	});

	it('allows upgradeStore unlocks through an actually openable archetype placement', () => {
		const definition = validDefinition();
		definition.content.archetypeIds = ['convenience', 'electronics'];
		definition.content.productCategoryIds = ['bottled-water', 'devices'];
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
		definition.content.productCategoryIds = ['bottled-water', 'devices'];
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
			{ path: 'content.productCategoryIds[1]', code: 'product-locked' }
		]);
	});

	it('accepts openable placements in opened or revealed retail cities with the matching command', () => {
		const definition = validDefinition();
		definition.content.cityIds = ['harbor-city', 'industry-city', 'campus-junction'];
		definition.content.archetypeIds = ['convenience', 'electronics'];
		definition.content.productCategoryIds = ['bottled-water', 'devices'];
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
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed recursive fixture
		const definition = validDefinition() as unknown as Record<string, any>;
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

	it('rejects warehouse contents beyond capacity from authored warehouse buildings', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed recursive fixture
		const definition = validDefinition() as unknown as Record<string, any>;
		definition.start.overrides.warehouseMaterials = { water: 1 };
		definition.content.materialIds = ['water'];
		expect(codes(definition)).toContainEqual({
			path: 'start.overrides.warehouseMaterials',
			code: 'warehouse-capacity-exceeded'
		});
	});

	it('validates supported commands and modifier variants', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed recursive fixture
		const definition = validDefinition() as unknown as Record<string, any>;
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
				{ path: 'allowedCommands[18]', code: 'unsupported-command' },
				{ path: 'modifiers[0].multiplier', code: 'invalid-modifier' },
				{ path: 'modifiers[0].target.ids[0]', code: 'invalid-reference' },
				{ path: 'modifiers[1].kind', code: 'unsupported-modifier' }
			])
		);
	});

	it('validates metric/window support and complete-window semantics', () => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately malformed recursive fixture
		const definition = validDefinition() as unknown as Record<string, any>;
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
