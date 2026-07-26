import { validateScenarioDefinition } from './validation';
import type {
	ScenarioDefinition,
	ScenarioDefinitionKey,
	ScenarioDefinitionRef,
	ScenarioDiagnostic,
	ScenarioId
} from './types';

const STANDARD_RETAIL_COMMANDS = [
	'advanceDay',
	'resolveDecision',
	'updatePolicy',
	'selectWorldCity',
	'hireStaff',
	'assignStaff',
	'unassignStaff',
	'promoteStaff',
	'updateStoreSellingPrice',
	'updateStoreInventoryTargets'
] as const;

const FIRST_LOCAL_CORRIDOR = [
	[4, 18],
	[4, 17],
	[4, 16],
	[4, 15],
	[4, 14],
	[4, 13],
	[4, 12],
	[5, 12],
	[6, 12],
	[7, 12],
	[8, 12],
	[9, 12],
	[10, 12],
	[11, 12],
	[12, 12],
	[13, 12],
	[14, 12],
	[15, 12],
	[16, 12],
	[17, 12],
	[18, 12],
	[19, 12],
	[20, 12],
	[21, 12],
	[22, 12],
	[23, 12],
	[24, 12],
	[25, 12],
	[26, 12],
	[26, 11],
	[26, 10]
] as const;

const SECOND_LOCAL_CORRIDOR = [
	[28, 9],
	[29, 9],
	[29, 10],
	[29, 11],
	[29, 12],
	[29, 13],
	[29, 14],
	[29, 15],
	[29, 16],
	[29, 17],
	[29, 18],
	[29, 19],
	[29, 20],
	[28, 20]
] as const;

const firstProfit = {
	id: 'first-profit',
	version: 1,
	titleKey: 'scenarioDefinitions.firstProfit.title',
	summaryKey: 'scenarioDefinitions.firstProfit.summary',
	briefingKey: 'scenarioDefinitions.firstProfit.briefing',
	strategyHintKey: 'scenarioDefinitions.firstProfit.strategyHint',
	officialSeed: 280_001,
	dayLimit: 14,
	start: {
		foundingStore: {
			ref: 'founding-store',
			archetypeId: 'convenience',
			cityId: 'harbor-city',
			tileId: 'harbor-city-29-35'
		},
		industrialBuildings: [],
		rails: [],
		overrides: {
			cash: 9_000,
			debt: 8_000,
			policy: {
				pricing: 'premium',
				inventory: 'generous',
				staffing: 'minimal',
				marketing: 'none',
				service: 'speed'
			},
			storeCap: 1,
			stores: [
				{
					storeRef: 'founding-store',
					products: [
						{
							categoryId: 'bottled-water',
							stock: 250,
							reorderThreshold: 30,
							targetStock: 108,
							sellingPrice: 3
						}
					]
				}
			]
		}
	},
	content: {
		cityIds: ['harbor-city', 'industry-city'],
		archetypeIds: ['convenience'],
		productCategoryIds: ['bottled-water'],
		materialIds: [],
		buildingTypeIds: [],
		retailPlacements: [],
		industrialPlacements: []
	},
	allowedCommands: [...STANDARD_RETAIL_COMMANDS],
	modifiers: [],
	requiredObjectives: [
		{
			id: 'cumulative-net-income',
			labelKey: 'scenarioDefinitions.firstProfit.objectives.cumulativeNetIncome',
			query: { metric: 'cumulative-net-income' },
			comparator: 'gt',
			target: 0,
			window: { kind: 'run-to-date' }
		},
		{
			id: 'positive-income-streak',
			labelKey: 'scenarioDefinitions.firstProfit.objectives.positiveIncomeStreak',
			query: { metric: 'consecutive-positive-net-income-reports' },
			comparator: 'gte',
			target: 3,
			window: { kind: 'trailing-reports', count: 3 },
			requiresCompleteWindow: true
		}
	],
	optionalObjectives: [],
	failures: [
		{
			id: 'negative-cash',
			labelKey: 'scenarioDefinitions.firstProfit.failures.negativeCash',
			query: { metric: 'cash' },
			comparator: 'lt',
			target: 0,
			window: { kind: 'current' }
		}
	],
	scoreComponents: [
		{ kind: 'remaining-days', zeroBonusAt: 0, fullBonusAt: 11, points: 200 },
		{
			kind: 'metric',
			query: { metric: 'cumulative-net-income' },
			window: { kind: 'run-to-date' },
			zeroBonusAt: 450,
			fullBonusAt: 500,
			points: 180
		},
		{
			kind: 'metric',
			query: { metric: 'scorecard', score: 'customerSatisfaction' },
			window: { kind: 'current' },
			zeroBonusAt: 60,
			fullBonusAt: 75,
			points: 120
		}
	],
	medalThresholds: { silver: 700, gold: 850 }
} as const satisfies ScenarioDefinition;

const importSqueeze = {
	id: 'import-squeeze',
	version: 1,
	titleKey: 'scenarioDefinitions.importSqueeze.title',
	summaryKey: 'scenarioDefinitions.importSqueeze.summary',
	briefingKey: 'scenarioDefinitions.importSqueeze.briefing',
	strategyHintKey: 'scenarioDefinitions.importSqueeze.strategyHint',
	officialSeed: 280_002,
	dayLimit: 21,
	start: {
		foundingStore: {
			ref: 'founding-store',
			archetypeId: 'electronics',
			cityId: 'harbor-city',
			tileId: 'harbor-city-29-35'
		},
		industrialBuildings: [],
		rails: [],
		overrides: {
			cash: 30_000,
			debt: 12_000,
			storeCap: 1,
			stores: [
				{
					storeRef: 'founding-store',
					targetLevel: 4,
					products: [
						{
							categoryId: 'games',
							stock: 50,
							reorderThreshold: 20,
							targetStock: 70,
							sellingPrice: 48
						},
						{
							categoryId: 'accessories',
							stock: 60,
							reorderThreshold: 24,
							targetStock: 80,
							sellingPrice: 22
						}
					]
				}
			]
		}
	},
	content: {
		cityIds: ['harbor-city', 'industry-city'],
		archetypeIds: ['electronics'],
		productCategoryIds: ['games', 'accessories'],
		materialIds: [],
		buildingTypeIds: [],
		retailPlacements: [],
		industrialPlacements: []
	},
	allowedCommands: [...STANDARD_RETAIL_COMMANDS],
	modifiers: [
		{
			kind: 'import-cost-multiplier',
			scope: 'retail-product',
			target: { kind: 'ids', ids: ['games', 'accessories'] },
			multiplier: 2
		}
	],
	requiredObjectives: [
		{
			id: 'completed-import-cycles',
			labelKey: 'scenarioDefinitions.importSqueeze.objectives.completedImportCycles',
			query: { metric: 'completed-retail-import-cycles' },
			comparator: 'gte',
			target: 2,
			window: { kind: 'run-to-date' }
		},
		{
			id: 'cumulative-net-income',
			labelKey: 'scenarioDefinitions.importSqueeze.objectives.cumulativeNetIncome',
			query: { metric: 'cumulative-net-income' },
			comparator: 'gt',
			target: 0,
			window: { kind: 'run-to-date' }
		}
	],
	optionalObjectives: [],
	failures: [
		{
			id: 'negative-cash',
			labelKey: 'scenarioDefinitions.importSqueeze.failures.negativeCash',
			query: { metric: 'cash' },
			comparator: 'lt',
			target: 0,
			window: { kind: 'current' }
		}
	],
	scoreComponents: [
		{
			kind: 'metric',
			query: { metric: 'retail-import-spend', categoryIds: ['games', 'accessories'] },
			window: { kind: 'run-to-date' },
			zeroBonusAt: 12_000,
			fullBonusAt: 7_100,
			points: 180
		},
		{
			kind: 'metric',
			query: { metric: 'cash' },
			window: { kind: 'current' },
			zeroBonusAt: 0,
			fullBonusAt: 35_000,
			points: 180
		},
		{
			kind: 'metric',
			query: { metric: 'demand-missed', categoryIds: ['games', 'accessories'] },
			window: { kind: 'run-to-date' },
			zeroBonusAt: 1_000,
			fullBonusAt: 0,
			points: 140
		}
	],
	medalThresholds: { silver: 700, gold: 850 }
} as const satisfies ScenarioDefinition;

const localLifeline = {
	id: 'local-lifeline',
	version: 1,
	titleKey: 'scenarioDefinitions.localLifeline.title',
	summaryKey: 'scenarioDefinitions.localLifeline.summary',
	briefingKey: 'scenarioDefinitions.localLifeline.briefing',
	strategyHintKey: 'scenarioDefinitions.localLifeline.strategyHint',
	officialSeed: 280_003,
	dayLimit: 21,
	start: {
		foundingStore: {
			ref: 'founding-store',
			archetypeId: 'convenience',
			cityId: 'harbor-city',
			tileId: 'harbor-city-29-35'
		},
		industrialBuildings: [
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
		],
		rails: [...FIRST_LOCAL_CORRIDOR, ...SECOND_LOCAL_CORRIDOR].map(([x, y]) => ({
			cityId: 'industry-city' as const,
			x,
			y,
			level: 5
		})),
		overrides: {
			cash: 12_000,
			debt: 8_000,
			storeCap: 1,
			stores: [
				{
					storeRef: 'founding-store',
					targetLevel: 1,
					products: [
						{
							categoryId: 'bottled-water',
							stock: 10,
							reorderThreshold: 25,
							targetStock: 50,
							sellingPrice: 3
						}
					]
				}
			]
		}
	},
	content: {
		cityIds: ['harbor-city', 'industry-city'],
		archetypeIds: ['convenience'],
		productCategoryIds: ['bottled-water'],
		materialIds: ['water', 'bottled-water'],
		buildingTypeIds: ['water-pump', 'water-bottler', 'warehouse'],
		retailPlacements: [],
		industrialPlacements: [
			{
				cityId: 'industry-city',
				tileId: 'industry-city-26-8',
				buildingTypeId: 'water-bottler'
			}
		]
	},
	allowedCommands: [
		'advanceDay',
		'resolveDecision',
		'updatePolicy',
		'selectWorldCity',
		'hireStaff',
		'assignStaff',
		'unassignStaff',
		'promoteStaff',
		'updateStoreSellingPrice',
		'buildIndustrialBuilding'
	],
	modifiers: [],
	requiredObjectives: [
		{
			id: 'local-units',
			labelKey: 'scenarioDefinitions.localLifeline.objectives.localUnits',
			query: { metric: 'retail-local-units', categoryIds: ['bottled-water'] },
			comparator: 'gte',
			target: 40,
			window: { kind: 'run-to-date' }
		},
		{
			id: 'local-share',
			labelKey: 'scenarioDefinitions.localLifeline.objectives.localShare',
			query: { metric: 'retail-local-share', categoryIds: ['bottled-water'] },
			comparator: 'gte',
			target: 0.5,
			window: { kind: 'run-to-date' }
		}
	],
	optionalObjectives: [],
	failures: [
		{
			id: 'negative-cash',
			labelKey: 'scenarioDefinitions.localLifeline.failures.negativeCash',
			query: { metric: 'cash' },
			comparator: 'lt',
			target: 0,
			window: { kind: 'current' }
		}
	],
	scoreComponents: [
		{
			kind: 'metric',
			query: { metric: 'retail-local-share', categoryIds: ['bottled-water'] },
			window: { kind: 'run-to-date' },
			zeroBonusAt: 0.5,
			fullBonusAt: 0.8,
			points: 200
		},
		{
			kind: 'metric',
			query: { metric: 'retail-imported-units', categoryIds: ['bottled-water'] },
			window: { kind: 'run-to-date' },
			zeroBonusAt: 80,
			fullBonusAt: 0,
			points: 150
		},
		{ kind: 'remaining-days', zeroBonusAt: 0, fullBonusAt: 6, points: 150 }
	],
	medalThresholds: { silver: 700, gold: 850 }
} as const satisfies ScenarioDefinition;

function deepFreeze<T>(value: T): T {
	if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
	Object.freeze(value);
	for (const nested of Object.values(value)) deepFreeze(nested);
	return value;
}

/**
 * Complete immutable definition registry keyed by `${scenarioId}@${version}`.
 * Old definitions remain resolvable here so active runs, best results, and
 * share codes that reference a prior version stay supported after a new
 * version is published. The catalog UI never lists from this map directly —
 * it derives the current-version list from {@link CURRENT_VERSION_BY_SCENARIO}.
 */
const ALL_DEFINITIONS: readonly ScenarioDefinition[] = deepFreeze([
	firstProfit,
	importSqueeze,
	localLifeline
]);

function buildDefinitionByKey(
	definitions: readonly ScenarioDefinition[]
): ReadonlyMap<ScenarioDefinitionKey, ScenarioDefinition> {
	const map = new Map<ScenarioDefinitionKey, ScenarioDefinition>();
	for (const definition of definitions) {
		const key: ScenarioDefinitionKey = `${definition.id}@${definition.version}`;
		if (map.has(key)) {
			throw new Error(`Duplicate scenario definition key: ${key}`);
		}
		map.set(key, definition);
	}
	return map;
}

function buildCurrentVersionByScenario(
	definitions: readonly ScenarioDefinition[]
): Readonly<Record<ScenarioId, number>> {
	const latest = new Map<ScenarioId, number>();
	for (const definition of definitions) {
		const existing = latest.get(definition.id);
		if (existing === undefined || definition.version > existing) {
			latest.set(definition.id, definition.version);
		}
	}
	const record = {} as Record<ScenarioId, number>;
	for (const [id, version] of latest) record[id] = version;
	return deepFreeze(record);
}

/**
 * The complete definition registry. Use this to resolve active runs, best
 * results, and share codes that may reference any published version.
 */
const DEFINITIONS_BY_KEY: ReadonlyMap<ScenarioDefinitionKey, ScenarioDefinition> =
	buildDefinitionByKey(ALL_DEFINITIONS);

/**
 * The current version per scenario ID. The catalog presents only these
 * versions; {@link listCurrentScenarioDefinitions} and
 * {@link currentScenarioDefinition} derive from this map so publishing a new
 * version updates the catalog without affecting historical-version
 * resolution from {@link DEFINITIONS_BY_KEY}.
 */
const CURRENT_VERSION_BY_SCENARIO: Readonly<Record<ScenarioId, number>> =
	buildCurrentVersionByScenario(ALL_DEFINITIONS);

/**
 * The current-version catalog: one definition per scenario ID, in the
 * canonical registry order. Retained as a public export for tests and
 * callers that need the current-version list as a single array.
 */
export const SCENARIO_CATALOG: readonly ScenarioDefinition[] = deepFreeze(
	ALL_DEFINITIONS.filter(
		(definition) => CURRENT_VERSION_BY_SCENARIO[definition.id] === definition.version
	)
);

export interface ScenarioCatalogEntry {
	definition: ScenarioDefinition;
	available: boolean;
	diagnostics: ScenarioDiagnostic[];
}

export function compileScenarioCatalogEntries(
	definitions: readonly ScenarioDefinition[]
): readonly ScenarioCatalogEntry[] {
	return definitions.map((definition) => {
		const diagnostics = validateScenarioDefinition(definition);
		return {
			definition,
			available: diagnostics.length === 0,
			diagnostics
		};
	});
}

const CATALOG_ENTRIES = deepFreeze(compileScenarioCatalogEntries(SCENARIO_CATALOG));

export function listScenarioCatalogEntries(): readonly ScenarioCatalogEntry[] {
	return CATALOG_ENTRIES;
}

export function listCurrentScenarioDefinitions(): readonly ScenarioDefinition[] {
	return SCENARIO_CATALOG;
}

export function resolveScenarioDefinition(
	ref: ScenarioDefinitionRef
): ScenarioDefinition | undefined {
	const key: ScenarioDefinitionKey = `${ref.scenarioId}@${ref.version}`;
	return DEFINITIONS_BY_KEY.get(key);
}

export function currentScenarioDefinition(scenarioId: ScenarioId): ScenarioDefinition | undefined {
	const version = CURRENT_VERSION_BY_SCENARIO[scenarioId];
	if (version === undefined) return undefined;
	const key: ScenarioDefinitionKey = `${scenarioId}@${version}`;
	return DEFINITIONS_BY_KEY.get(key);
}
