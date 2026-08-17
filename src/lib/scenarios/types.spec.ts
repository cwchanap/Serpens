import { describe, expect, it } from 'vitest';
import type { GameState } from '$lib/game/types';
import {
	SCENARIO_COMMAND_KINDS,
	type ScenarioCommand,
	type ScenarioDefinition,
	type ScenarioRun,
	type ScenarioStartBlueprint
} from './types';

type HasStringIndex<T> = string extends keyof T ? true : false;
type HasRemovedAggregateOverride =
	`warehouse${'Materials'}` extends keyof ScenarioStartBlueprint['overrides'] ? true : false;

const blueprintHasNoCatchAllIndex: HasStringIndex<ScenarioStartBlueprint> = false;
const blueprintHasNoRemovedAggregateOverride: HasRemovedAggregateOverride = false;

const definition = {
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
			tileId: 'harbor-1-1'
		},
		industrialBuildings: [
			{
				ref: 'water-pump',
				typeId: 'water-pump',
				cityId: 'industry-city',
				tileId: 'industry-1-1'
			}
		],
		rails: [{ cityId: 'industry-city', x: 1, y: 1, level: 1 }],
		overrides: {
			cash: 2_000,
			debt: 500,
			policy: {
				pricing: 'competitive',
				inventory: 'balanced',
				staffing: 'efficient',
				marketing: 'awareness',
				service: 'balanced'
			},
			storeCap: 3,
			stores: [
				{
					storeRef: 'founder',
					targetLevel: 2,
					products: [
						{
							categoryId: 'soft-drinks',
							stock: 20,
							reorderThreshold: 5,
							targetStock: 25,
							sellingPrice: 4
						}
					]
				}
			],
			buildingInventories: [{ buildingRef: 'water-pump', materials: { water: 10 } }],
			cityInventoryMaterials: [{ cityId: 'industry-city', materials: { water: 5 } }],
			retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }],
			world: {
				revealedCityIds: ['harbor-city', 'industry-city'],
				openedCityIds: ['harbor-city', 'industry-city'],
				activeRetailCityId: 'harbor-city',
				activeIndustryCityId: 'industry-city'
			}
		}
	},
	content: {
		cityIds: ['harbor-city', 'industry-city'],
		archetypeIds: ['convenience'],
		productCategoryIds: ['soft-drinks'],
		materialIds: ['water'],
		buildingTypeIds: ['water-pump'],
		retailPlacements: [{ cityId: 'harbor-city', tileId: 'harbor-1-1', archetypeId: 'convenience' }],
		industrialPlacements: [
			{ cityId: 'industry-city', tileId: 'industry-1-1', buildingTypeId: 'water-pump' }
		]
	},
	allowedCommands: SCENARIO_COMMAND_KINDS,
	modifiers: [
		{
			kind: 'import-cost-multiplier',
			scope: 'retail-product',
			target: { kind: 'ids', ids: ['soft-drinks'] },
			multiplier: 1.2
		}
	],
	requiredObjectives: [
		{
			id: 'cash-positive',
			labelKey: 'store.defaultName',
			query: { metric: 'cash' },
			comparator: 'gte',
			target: 2_500,
			window: { kind: 'current' }
		}
	],
	optionalObjectives: [
		{
			id: 'local-share',
			labelKey: 'store.defaultName',
			query: { metric: 'retail-local-share', categoryIds: ['soft-drinks'] },
			comparator: 'gte',
			target: 0.5,
			window: { kind: 'trailing-reports', count: 3 },
			requiresCompleteWindow: true
		}
	],
	failures: [
		{
			id: 'cash-negative',
			labelKey: 'store.defaultName',
			query: { metric: 'cash' },
			comparator: 'lt',
			target: 0,
			window: { kind: 'current' }
		}
	],
	scoreComponents: [
		{ kind: 'optional-objective', objectiveId: 'local-share', points: 20 },
		{
			kind: 'metric',
			query: { metric: 'scorecard', score: 'profit' },
			window: { kind: 'run-to-date' },
			zeroBonusAt: 0,
			fullBonusAt: 100,
			points: 50
		},
		{ kind: 'remaining-days', zeroBonusAt: 0, fullBonusAt: 30, points: 30 }
	],
	medalThresholds: { silver: 60, gold: 80 }
} satisfies ScenarioDefinition;

const commands = [
	{ kind: 'advanceDay' },
	{ kind: 'resolveDecision', decisionId: 'decision-1', optionId: 'option-1' },
	{ kind: 'updatePolicy', patch: { pricing: 'premium' } },
	{ kind: 'openWorldCity', cityId: 'campus-junction' },
	{ kind: 'selectWorldCity', cityId: 'harbor-city' },
	{
		kind: 'setRetailSupplySource',
		retailCityId: 'harbor-city',
		supplyCityId: null
	},
	{ kind: 'openStore', tileId: 'harbor-1-2', archetypeId: 'boutique' },
	{ kind: 'upgradeStore', storeId: 'store-1' },
	{ kind: 'hireStaff', candidateId: 'candidate-1' },
	{ kind: 'assignStaff', staffId: 'staff-1', storeId: 'store-1' },
	{ kind: 'unassignStaff', staffId: 'staff-1' },
	{ kind: 'promoteStaff', staffId: 'staff-1' },
	{
		kind: 'updateStoreSellingPrice',
		storeId: 'store-1',
		categoryId: 'soft-drinks',
		sellingPrice: 5
	},
	{
		kind: 'updateStoreInventoryTargets',
		storeId: 'store-1',
		categoryId: 'soft-drinks',
		reorderThreshold: 5,
		targetStock: 20
	},
	{ kind: 'buildIndustrialBuilding', tileId: 'industry-1-2', buildingTypeId: 'water-pump' },
	{ kind: 'upgradeIndustrialBuilding', buildingId: 'building-1' },
	{
		kind: 'buildRail',
		originBuildingId: 'building-1',
		waypoints: [{ x: 1, y: 2 }],
		destinationBuildingId: 'building-2'
	},
	{ kind: 'upgradeRail', cityId: 'industry-city', segmentId: 'segment-1' },
	{ kind: 'demolishRail', cityId: 'industry-city', segmentId: 'segment-1' },
	{ kind: 'borrow', amount: 1_000, termDays: 56 },
	{ kind: 'repayLoan', loanId: 'loan-1', amount: 100 },
	{ kind: 'payOffLoan', loanId: 'loan-1' },
	{ kind: 'refinanceLoan', loanId: 'loan-1', termDays: 84 },
	{ kind: 'financeWorldCity', cityId: 'campus-junction', expectedCost: 12_000 },
	{
		kind: 'financeRetailStore',
		tileId: 'harbor-1-2',
		archetypeId: 'boutique',
		expectedCost: 12_000
	},
	{
		kind: 'financeIndustrialBuilding',
		tileId: 'industry-1-2',
		buildingTypeId: 'water-pump',
		expectedCost: 12_000
	}
] as const satisfies readonly ScenarioCommand[];

const run = {
	runId: '00000000-0000-4000-8000-000000000000',
	definition: { scenarioId: definition.id, version: definition.version },
	seed: definition.officialSeed,
	eligibility: 'ranked',
	status: 'active',
	game: {} as GameState,
	evaluation: {
		day: 1,
		required: [
			{
				conditionId: 'cash-positive',
				status: 'pending',
				evidence: {
					conditionId: 'cash-positive',
					metric: 'cash',
					comparator: 'gte',
					target: 2_500,
					actual: 2_000,
					day: 1,
					window: { kind: 'current' },
					windowComplete: true,
					contributingIds: []
				}
			}
		],
		optional: [],
		failures: [],
		deadline: null,
		risks: [{ kind: 'deadline', daysRemaining: 29, triggered: false }],
		projection: {
			score: 0,
			medal: 'bronze',
			componentPoints: [0, 0, 0],
			componentEvidence: [
				null,
				{
					kind: 'metric',
					query: { metric: 'scorecard', score: 'profit' },
					window: { kind: 'run-to-date' },
					actual: 0,
					day: 1,
					windowComplete: true
				},
				null
			]
		}
	},
	result: null
} satisfies ScenarioRun;

describe('scenario contracts', () => {
	it('constructs a closed definition and active run', () => {
		expect(blueprintHasNoCatchAllIndex).toBe(false);
		expect(blueprintHasNoRemovedAggregateOverride).toBe(false);
		expect(definition.start.foundingStore.ref).toBe('founder');
		expect(run.status).toBe('active');
	});

	it('inventories every route-level game mutation', () => {
		expect(SCENARIO_COMMAND_KINDS).toEqual([
			'advanceDay',
			'resolveDecision',
			'updatePolicy',
			'openWorldCity',
			'selectWorldCity',
			'setRetailSupplySource',
			'openStore',
			'upgradeStore',
			'hireStaff',
			'assignStaff',
			'unassignStaff',
			'promoteStaff',
			'updateStoreSellingPrice',
			'updateStoreInventoryTargets',
			'buildIndustrialBuilding',
			'upgradeIndustrialBuilding',
			'buildRail',
			'upgradeRail',
			'demolishRail',
			'borrow',
			'repayLoan',
			'payOffLoan',
			'refinanceLoan',
			'financeWorldCity',
			'financeRetailStore',
			'financeIndustrialBuilding'
		]);
		expect(commands.map((command) => command.kind)).toEqual(SCENARIO_COMMAND_KINDS);
	});
});
