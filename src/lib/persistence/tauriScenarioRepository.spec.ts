import { describe, expect, it, vi } from 'vitest';
import { SAVE_STORE_FILE, SAVE_STORE_KEY } from './tauriSaveRepository';

const { tauriLoadMock } = vi.hoisted(() => ({ tauriLoadMock: vi.fn() }));

vi.mock('@tauri-apps/plugin-store', () => ({ load: tauriLoadMock }));

import {
	SCENARIO_STORE_FILE,
	SCENARIO_STORE_KEY,
	createTauriScenarioRepository,
	createTauriScenarioRepositoryFromStore,
	type ScenarioStoreLike
} from './tauriScenarioRepository';

class FakeStore implements ScenarioStoreLike {
	readonly values = new Map<string, unknown>();
	readonly getKeys: string[] = [];
	readonly setKeys: string[] = [];
	saveCount = 0;

	async get<T>(key: string): Promise<T | null | undefined> {
		this.getKeys.push(key);
		return this.values.get(key) as T | null | undefined;
	}

	async set(key: string, value: unknown): Promise<void> {
		this.setKeys.push(key);
		this.values.set(key, value);
	}

	async save(): Promise<void> {
		this.saveCount += 1;
	}
}

describe('Tauri scenario repository', () => {
	it('loads the isolated scenario file with explicit manual-save options', async () => {
		const store = new FakeStore();
		tauriLoadMock.mockResolvedValueOnce(store);

		const repository = createTauriScenarioRepository();
		await repository.getSummary();

		expect(SCENARIO_STORE_FILE).toBe('serpens-scenarios.json');
		expect(SCENARIO_STORE_FILE).not.toBe(SAVE_STORE_FILE);
		expect(tauriLoadMock).toHaveBeenCalledWith(SCENARIO_STORE_FILE, {
			defaults: {},
			autoSave: false
		});
	});

	it('writes and saves only the scenario key', async () => {
		const store = new FakeStore();
		store.values.set(SAVE_STORE_KEY, 'sandbox-sentinel');
		const repository = createTauriScenarioRepositoryFromStore(Promise.resolve(store));

		await repository.removeActiveRun('first-profit');

		expect(SCENARIO_STORE_KEY).toBe('scenarios');
		expect(SCENARIO_STORE_KEY).not.toBe(SAVE_STORE_KEY);
		expect(store.setKeys).toEqual([SCENARIO_STORE_KEY]);
		expect(store.values.get(SAVE_STORE_KEY)).toBe('sandbox-sentinel');
		expect(store.saveCount).toBe(1);
	});

	it('reports malformed scenario data without reading or falling back to sandbox data', async () => {
		const store = new FakeStore();
		store.values.set(SCENARIO_STORE_KEY, 'not-scenario-data');
		store.values.set(SAVE_STORE_KEY, {
			schemaVersion: 1,
			activeRunsByScenarioId: {},
			bestResultsByDefinitionKey: {}
		});
		const repository = createTauriScenarioRepositoryFromStore(Promise.resolve(store));

		const summary = await repository.getSummary();

		expect(summary.activeRunsByScenarioId).toEqual({});
		expect(summary.bestResultsByDefinitionKey).toEqual({});
		expect(summary.diagnostics).toMatchObject([{ code: 'invalid-store', path: 'scenarioStore' }]);
		expect(store.getKeys).toEqual([SCENARIO_STORE_KEY]);
		expect(store.values.get(SAVE_STORE_KEY)).toMatchObject({ schemaVersion: 1 });
	});
});
