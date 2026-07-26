import type { GameState } from '$lib/game/types';
import { STARTER_STORE_CAP, createInitialWorldProgress } from '$lib/game/world';
import { evaluateScenario } from '$lib/scenarios/runtime';
import type { ScenarioDefinition, ScenarioDefinitionRef, ScenarioRun } from '$lib/scenarios/types';

const FIXTURE_DEFINITION: ScenarioDefinition = {
	id: 'first-profit',
	version: 1,
	titleKey: 'store.defaultName',
	summaryKey: 'store.defaultName',
	briefingKey: 'store.defaultName',
	strategyHintKey: 'store.defaultName',
	officialSeed: 280_001,
	dayLimit: 14,
	start: {
		foundingStore: {
			ref: 'founder',
			archetypeId: 'convenience',
			cityId: 'harbor-city',
			tileId: 'harbor-city-1-1'
		},
		industrialBuildings: [],
		rails: [],
		overrides: {}
	},
	content: {
		cityIds: ['harbor-city'],
		archetypeIds: ['convenience'],
		productCategoryIds: ['bottled-water'],
		materialIds: [],
		buildingTypeIds: [],
		retailPlacements: [],
		industrialPlacements: []
	},
	allowedCommands: ['advanceDay'],
	modifiers: [],
	requiredObjectives: [
		{
			id: 'cash-goal',
			labelKey: 'store.defaultName',
			query: { metric: 'cash' },
			comparator: 'gte',
			target: 1_000_000,
			window: { kind: 'current' }
		}
	],
	optionalObjectives: [],
	failures: [],
	scoreComponents: [
		{
			kind: 'metric',
			query: { metric: 'cash' },
			window: { kind: 'current' },
			zeroBonusAt: 0,
			fullBonusAt: 1_000_000,
			points: 500
		}
	],
	medalThresholds: { silver: 700, gold: 850 }
};

export function resolveFixtureDefinition(
	ref: ScenarioDefinitionRef
): ScenarioDefinition | undefined {
	return ref.scenarioId === FIXTURE_DEFINITION.id && ref.version === FIXTURE_DEFINITION.version
		? FIXTURE_DEFINITION
		: undefined;
}

function fixtureGame(): GameState {
	return {
		seed: FIXTURE_DEFINITION.officialSeed,
		rngState: 99,
		day: 2,
		cash: 11_000,
		debt: 1_000,
		policy: {
			pricing: 'standard',
			inventory: 'balanced',
			staffing: 'efficient',
			marketing: 'awareness',
			service: 'balanced'
		},
		scorecard: {
			profit: 55,
			customerSatisfaction: 60,
			staffMorale: 65,
			marketPosition: 50
		},
		world: createInitialWorldProgress(),
		storeCap: STARTER_STORE_CAP,
		cities: [
			{
				id: 'harbor-city',
				name: 'Harbor City',
				width: 1,
				height: 1,
				tiles: [
					{
						id: 'harbor-city-0-0',
						cityId: 'harbor-city',
						x: 0,
						y: 0,
						neighborhood: 'downtown',
						terrain: 'commercial',
						feature: null,
						demand: 50,
						rent: 50,
						footTraffic: 50,
						customerFit: 50,
						locked: false
					}
				]
			}
		],
		activeCityId: 'harbor-city',
		industryCities: [
			{
				id: 'industry-city',
				name: 'Industry City',
				width: 1,
				height: 1,
				tiles: [
					{
						id: 'industry-city-0-0',
						cityId: 'industry-city',
						x: 0,
						y: 0,
						terrain: 'industrial',
						resource: null,
						locked: false
					}
				],
				rails: []
			}
		],
		activeIndustryCityId: 'industry-city',
		industrialBuildings: [],
		warehouse: {
			capacity: 0,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		},
		stores: [],
		staff: [],
		hiringCandidates: [],
		decisions: [],
		reports: []
	};
}

export function createFixtureScenarioRun(): ScenarioRun {
	const game = fixtureGame();
	return {
		runId: crypto.randomUUID(),
		definition: {
			scenarioId: FIXTURE_DEFINITION.id,
			version: FIXTURE_DEFINITION.version
		},
		seed: FIXTURE_DEFINITION.officialSeed,
		eligibility: 'ranked',
		status: 'active',
		game,
		evaluation: evaluateScenario(FIXTURE_DEFINITION, game, false),
		result: null
	};
}
