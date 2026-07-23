import { describe, expect, it } from 'vitest';
import type { GameState } from '$lib/game/types';
import { STARTER_STORE_CAP, createInitialWorldProgress } from '$lib/game/world';
import { evaluateScenario } from '$lib/scenarios/runtime';
import type { ScenarioDefinition, ScenarioDefinitionRef, ScenarioRun } from '$lib/scenarios/types';
import { BROWSER_SAVE_STORAGE_KEY } from './browserSaveRepository';
import {
	BROWSER_SCENARIO_STORAGE_KEY,
	createBrowserScenarioRepository,
	type ScenarioStorageLike
} from './browserScenarioRepository';
import { createScenarioMemoryRepository } from './scenarioMemoryRepository';
import type { ScenarioRepository } from './scenarioRepository';
import {
	createTauriScenarioRepositoryFromStore,
	type ScenarioStoreLike
} from './tauriScenarioRepository';

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

function resolveFixtureDefinition(ref: ScenarioDefinitionRef): ScenarioDefinition | undefined {
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

function fixtureRun(): ScenarioRun {
	const game = fixtureGame();
	return {
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

class MemoryStorage implements ScenarioStorageLike {
	readonly readKeys: string[] = [];
	readonly writeKeys: string[] = [];
	private readonly values = new Map<string, string>();

	getItem(key: string): string | null {
		this.readKeys.push(key);
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.writeKeys.push(key);
		this.values.set(key, value);
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}

	seed(key: string, value: string): void {
		this.values.set(key, value);
	}

	peek(key: string): string | null {
		return this.values.get(key) ?? null;
	}
}

class MemoryScenarioStore implements ScenarioStoreLike {
	readonly values = new Map<string, unknown>();

	async get<T>(key: string): Promise<T | null | undefined> {
		return this.values.get(key) as T | null | undefined;
	}

	async set(key: string, value: unknown): Promise<void> {
		this.values.set(key, value);
	}

	async save(): Promise<void> {}
}

const repositoryFactories: Array<{
	name: string;
	create(): ScenarioRepository;
}> = [
	{
		name: 'memory',
		create: () => createScenarioMemoryRepository(undefined, resolveFixtureDefinition)
	},
	{
		name: 'browser',
		create: () => createBrowserScenarioRepository(new MemoryStorage(), resolveFixtureDefinition)
	},
	{
		name: 'Tauri',
		create: () =>
			createTauriScenarioRepositoryFromStore(
				Promise.resolve(new MemoryScenarioStore()),
				resolveFixtureDefinition
			)
	}
];

describe.each(repositoryFactories)('$name scenario repository parity', ({ create }) => {
	it('saves, loads, and removes an active run through the shared repository contract', async () => {
		const repository = create();
		const run = fixtureRun();

		const outcome = await repository.saveActiveRun(run);
		const loaded = await repository.loadActiveRun('first-profit');
		await repository.removeActiveRun('first-profit');

		expect(outcome).toEqual({ activeRun: run, terminalResult: null, bestUpdated: false });
		expect(loaded).toEqual(run);
		expect(loaded).not.toBe(run);
		expect(await repository.loadActiveRun('first-profit')).toBeNull();
	});
});

describe('browser scenario repository', () => {
	it('rejects construction when browser storage is unavailable', () => {
		expect(() => createBrowserScenarioRepository(undefined, resolveFixtureDefinition)).toThrow(
			'Browser scenario storage is unavailable'
		);
	});

	it('writes only the scenario storage key and leaves sandbox saves untouched', async () => {
		const storage = new MemoryStorage();
		storage.seed(BROWSER_SAVE_STORAGE_KEY, 'sandbox-sentinel');
		const repository = createBrowserScenarioRepository(storage, resolveFixtureDefinition);

		await repository.saveActiveRun(fixtureRun());

		expect(BROWSER_SCENARIO_STORAGE_KEY).toBe('serpens.scenarios.v1');
		expect(BROWSER_SCENARIO_STORAGE_KEY).not.toBe(BROWSER_SAVE_STORAGE_KEY);
		expect(storage.writeKeys).toEqual([BROWSER_SCENARIO_STORAGE_KEY]);
		expect(storage.peek(BROWSER_SAVE_STORAGE_KEY)).toBe('sandbox-sentinel');
	});

	it('reports malformed scenario JSON without reading or falling back to sandbox data', async () => {
		const storage = new MemoryStorage();
		storage.seed(BROWSER_SCENARIO_STORAGE_KEY, '{not-json');
		storage.seed(BROWSER_SAVE_STORAGE_KEY, 'sandbox-sentinel');
		const repository = createBrowserScenarioRepository(storage, resolveFixtureDefinition);

		const summary = await repository.getSummary();

		expect(summary.activeRunsByScenarioId).toEqual({});
		expect(summary.bestResultsByDefinitionKey).toEqual({});
		expect(summary.diagnostics).toMatchObject([{ code: 'invalid-json', path: 'scenarioStore' }]);
		expect(storage.readKeys).toEqual([BROWSER_SCENARIO_STORAGE_KEY]);
		expect(storage.peek(BROWSER_SAVE_STORAGE_KEY)).toBe('sandbox-sentinel');
	});
});
