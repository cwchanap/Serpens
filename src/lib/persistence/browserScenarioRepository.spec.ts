import { describe, expect, it } from 'vitest';
import { BROWSER_SAVE_STORAGE_KEY } from './browserSaveRepository';
import {
	BROWSER_SCENARIO_STORAGE_KEY,
	createBrowserScenarioRepository,
	type ScenarioStorageLike
} from './browserScenarioRepository';
import { createScenarioMemoryRepository } from './scenarioMemoryRepository';
import type { ScenarioRepository } from './scenarioRepository';
import {
	createFixtureScenarioRun as fixtureRun,
	resolveFixtureDefinition
} from './scenarioRepository.testUtils';
import {
	createTauriScenarioRepositoryFromStore,
	type ScenarioStoreLike
} from './tauriScenarioRepository';

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

	async get<T>(key: string): Promise<T | undefined> {
		return this.values.get(key) as T | undefined;
	}

	async set(key: string, value: unknown): Promise<void> {
		this.values.set(key, value);
	}

	async delete(key: string): Promise<boolean> {
		return this.values.delete(key);
	}

	async reload(): Promise<void> {}

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
