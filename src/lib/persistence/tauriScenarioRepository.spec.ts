import { describe, expect, it, vi } from 'vitest';
import type { ReloadOptions } from '@tauri-apps/plugin-store';
import type { ScenarioStoreSnapshot } from '$lib/scenarios/types';
import { createFixtureScenarioRun, resolveFixtureDefinition } from './scenarioRepository.testUtils';
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

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
}

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

async function expectPending(promise: Promise<unknown>): Promise<void> {
	let settled = false;
	void promise.then(
		() => {
			settled = true;
		},
		() => {
			settled = true;
		}
	);
	await Promise.resolve();
	await Promise.resolve();
	expect(settled).toBe(false);
}

class FakeStore implements ScenarioStoreLike {
	readonly values = new Map<string, unknown>();
	readonly persistedValues = new Map<string, unknown>();
	readonly getKeys: string[] = [];
	readonly setKeys: string[] = [];
	readonly deleteKeys: string[] = [];
	readonly reloadOptions: Array<ReloadOptions | undefined> = [];
	fileExists = false;
	reloadCount = 0;
	saveCount = 0;
	failNextReload: unknown;
	failNextSave: unknown;
	failNextSet: unknown;
	private readonly setFailures = new Map<number, unknown>();
	private readonly deleteFailures = new Map<number, unknown>();
	private nextSaveGate: { started: Deferred<void>; release: Deferred<void> } | undefined;

	async get<T>(key: string): Promise<T | undefined> {
		this.getKeys.push(key);
		return this.values.get(key) as T | undefined;
	}

	async set(key: string, value: unknown): Promise<void> {
		this.setKeys.push(key);
		this.values.set(key, value);
		const error = this.setFailures.get(this.setKeys.length) ?? this.failNextSet;
		if (error !== undefined) {
			this.failNextSet = undefined;
			throw error;
		}
	}

	async delete(key: string): Promise<boolean> {
		this.deleteKeys.push(key);
		const error = this.deleteFailures.get(this.deleteKeys.length);
		if (error !== undefined) throw error;
		return this.values.delete(key);
	}

	async reload(options?: ReloadOptions): Promise<void> {
		this.reloadCount += 1;
		this.reloadOptions.push(options === undefined ? undefined : { ...options });
		if (this.failNextReload !== undefined) {
			const error = this.failNextReload;
			this.failNextReload = undefined;
			throw error;
		}
		if (!this.fileExists) {
			throw Object.assign(new Error('No such file or directory'), { code: 'ENOENT' });
		}
		if (options?.ignoreDefaults === true) {
			this.copyValues(this.persistedValues, this.values);
			return;
		}
		for (const [key, value] of this.persistedValues) {
			this.values.set(key, structuredClone(value));
		}
	}

	async save(): Promise<void> {
		this.saveCount += 1;
		if (this.nextSaveGate !== undefined) {
			const gate = this.nextSaveGate;
			this.nextSaveGate = undefined;
			gate.started.resolve();
			await gate.release.promise;
		}
		if (this.failNextSave !== undefined) {
			const error = this.failNextSave;
			this.failNextSave = undefined;
			throw error;
		}
		this.copyValues(this.values, this.persistedValues);
		this.fileExists = true;
	}

	deferNextSave(): { started: Promise<void>; release(): void } {
		const started = createDeferred<void>();
		const release = createDeferred<void>();
		this.nextSaveGate = { started, release };
		return {
			started: started.promise,
			release: () => release.resolve()
		};
	}

	failSetOnCall(call: number, error: unknown): void {
		this.setFailures.set(call, error);
	}

	failDeleteOnCall(call: number, error: unknown): void {
		this.deleteFailures.set(call, error);
	}

	seedPersisted(key: string, value: unknown): void {
		this.fileExists = true;
		this.persistedValues.set(key, structuredClone(value));
		this.values.set(key, structuredClone(value));
	}

	private copyValues(source: Map<string, unknown>, target: Map<string, unknown>): void {
		target.clear();
		for (const [key, value] of source) {
			target.set(key, structuredClone(value));
		}
	}
}

describe('Tauri scenario repository', () => {
	it('models plugin-store reload merging unless defaults are ignored', async () => {
		const missingStore = new FakeStore();
		const store = new FakeStore();
		store.values.set('cache-only', 'pending');
		store.seedPersisted('durable', 'saved');

		await expect(missingStore.reload({ ignoreDefaults: true })).rejects.toMatchObject({
			code: 'ENOENT'
		});
		await store.reload();

		expect(store.values.get('cache-only')).toBe('pending');
		expect(store.values.get('durable')).toBe('saved');

		await store.reload({ ignoreDefaults: true });

		expect(store.values.has('cache-only')).toBe(false);
		expect(store.values.get('durable')).toBe('saved');
	});

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

	it('reports a stored null scenario value as invalid data', async () => {
		const store = new FakeStore();
		store.values.set(SCENARIO_STORE_KEY, null);
		const repository = createTauriScenarioRepositoryFromStore(Promise.resolve(store));

		const summary = await repository.getSummary();

		expect(summary.activeRunsByScenarioId).toEqual({});
		expect(summary.bestResultsByDefinitionKey).toEqual({});
		expect(summary.diagnostics).toMatchObject([{ code: 'invalid-store', path: 'scenarioStore' }]);
		expect(store.getKeys).toEqual([SCENARIO_STORE_KEY]);
	});

	it('rolls back a failed first save when no store file exists and allows the next save', async () => {
		const store = new FakeStore();
		const saveError = new Error('disk unavailable');
		store.failNextSave = saveError;
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		);

		await expect(repository.saveActiveRun(createFixtureScenarioRun())).rejects.toBe(saveError);
		const summary = await repository.getSummary();
		await repository.removeActiveRun('local-lifeline');

		const persisted = store.persistedValues.get(SCENARIO_STORE_KEY) as ScenarioStoreSnapshot;
		expect(summary.activeRunsByScenarioId).toEqual({});
		expect(summary.diagnostics).toEqual([]);
		expect(persisted.activeRunsByScenarioId['first-profit']).toBeUndefined();
		expect(persisted.activeRunsByScenarioId['local-lifeline']).toBeUndefined();
		expect(store.deleteKeys).toEqual([SCENARIO_STORE_KEY]);
		expect(store.reloadCount).toBe(0);
		expect(store.saveCount).toBe(3);
	});

	it('restores an existing prior value directly after a failed save', async () => {
		const store = new FakeStore();
		const priorRun = createFixtureScenarioRun();
		await createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		).saveActiveRun(priorRun);
		const saveError = new Error('disk unavailable');
		store.failNextSave = saveError;
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		);

		await expect(repository.removeActiveRun('first-profit')).rejects.toBe(saveError);

		const loaded = await repository.loadActiveRun('first-profit');
		expect(loaded).toEqual(priorRun);
		expect(store.setKeys).toEqual([SCENARIO_STORE_KEY, SCENARIO_STORE_KEY, SCENARIO_STORE_KEY]);
		expect(store.reloadCount).toBe(0);
		expect(store.saveCount).toBe(3);
	});

	it('persists the rolled-back baseline to disk after a failed save so a restart loads durable state', async () => {
		const store = new FakeStore();
		const priorRun = createFixtureScenarioRun();
		await createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		).saveActiveRun(priorRun);
		const saveError = new Error('disk unavailable');
		store.failNextSave = saveError;
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		);

		await expect(repository.removeActiveRun('first-profit')).rejects.toBe(saveError);

		const persisted = store.persistedValues.get(SCENARIO_STORE_KEY) as ScenarioStoreSnapshot;
		expect(persisted.activeRunsByScenarioId['first-profit']?.run.definition.scenarioId).toBe(
			priorRun.definition.scenarioId
		);
		expect(persisted.activeRunsByScenarioId['first-profit']?.run.seed).toBe(priorRun.seed);
	});

	it('rolls back a partially mutating set failure before allowing reads', async () => {
		const store = new FakeStore();
		const setError = new Error('cache mutation failed');
		store.failNextSet = setError;
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		);

		await expect(repository.saveActiveRun(createFixtureScenarioRun())).rejects.toBe(setError);

		expect(await repository.loadActiveRun('first-profit')).toBeNull();
		expect(store.deleteKeys).toEqual([SCENARIO_STORE_KEY]);
		expect(store.reloadCount).toBe(0);
		expect(store.saveCount).toBe(1);
	});

	it('falls back to replacement reload when restoring the prior value fails', async () => {
		const store = new FakeStore();
		const priorRun = createFixtureScenarioRun();
		await createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		).saveActiveRun(priorRun);
		const saveError = new Error('disk unavailable');
		const rollbackError = new Error('cache rollback unavailable');
		store.failNextSave = saveError;
		store.failSetOnCall(3, rollbackError);
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		);

		await expect(repository.removeActiveRun('first-profit')).rejects.toBe(saveError);

		expect(await repository.loadActiveRun('first-profit')).toEqual(priorRun);
		expect(store.setKeys).toEqual([SCENARIO_STORE_KEY, SCENARIO_STORE_KEY, SCENARIO_STORE_KEY]);
		expect(store.reloadOptions).toEqual([{ ignoreDefaults: true }]);
		expect(store.saveCount).toBe(2);
	});

	it('keeps reads pending behind a failed save and returns only durable state after recovery', async () => {
		const store = new FakeStore();
		const saveGate = store.deferNextSave();
		const saveError = new Error('disk unavailable');
		store.failNextSave = saveError;
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		);

		const savePromise = repository.saveActiveRun(createFixtureScenarioRun());
		await saveGate.started;
		const summaryPromise = repository.getSummary();
		const loadPromise = repository.loadActiveRun('first-profit');

		await expectPending(summaryPromise);
		await expectPending(loadPromise);

		const saveExpectation = expect(savePromise).rejects.toBe(saveError);
		saveGate.release();
		await saveExpectation;

		const [summary, loaded] = await Promise.all([summaryPromise, loadPromise]);
		expect(summary.activeRunsByScenarioId).toEqual({});
		expect(summary.diagnostics).toEqual([]);
		expect(loaded).toBeNull();
		expect(store.deleteKeys).toEqual([SCENARIO_STORE_KEY]);
		expect(store.reloadOptions).toEqual([]);
	});

	it('keeps reads pending behind a successful save and then returns the committed run', async () => {
		const store = new FakeStore();
		const saveGate = store.deferNextSave();
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		);
		const run = createFixtureScenarioRun();

		const savePromise = repository.saveActiveRun(run);
		await saveGate.started;
		const summaryPromise = repository.getSummary();
		const loadPromise = repository.loadActiveRun('first-profit');

		await expectPending(summaryPromise);
		await expectPending(loadPromise);

		saveGate.release();
		await savePromise;

		const [summary, loaded] = await Promise.all([summaryPromise, loadPromise]);
		expect(summary.activeRunsByScenarioId['first-profit']).toEqual(run);
		expect(loaded).toEqual(run);
		expect(store.reloadCount).toBe(0);
	});

	it('preserves the write error while a queued read retries failed recovery', async () => {
		const store = new FakeStore();
		const saveGate = store.deferNextSave();
		const saveError = new Error('disk unavailable');
		store.failNextSave = saveError;
		store.failDeleteOnCall(1, new Error('delete unavailable'));
		store.failDeleteOnCall(2, new Error('delete still unavailable'));
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		);

		const savePromise = repository.saveActiveRun(createFixtureScenarioRun());
		await saveGate.started;
		const summaryPromise = repository.getSummary();
		await expectPending(summaryPromise);

		const saveExpectation = expect(savePromise).rejects.toBe(saveError);
		saveGate.release();
		await saveExpectation;

		const summary = await summaryPromise;
		expect(summary.activeRunsByScenarioId).toEqual({});
		expect(summary.diagnostics).toEqual([]);
		expect(store.reloadOptions).toEqual([{ ignoreDefaults: true }]);
		expect(store.deleteKeys).toEqual([SCENARIO_STORE_KEY, SCENARIO_STORE_KEY, SCENARIO_STORE_KEY]);
	});

	it('restores the baseline when reload fails with ENOENT on a first save and the second delete succeeds', async () => {
		const store = new FakeStore();
		const saveError = new Error('disk unavailable');
		store.failNextSave = saveError;
		// First delete (restoreBaseline) fails, reload fails with ENOENT,
		// second delete (restoreBaseline retry) succeeds.
		store.failDeleteOnCall(1, new Error('delete unavailable'));
		store.fileExists = false;
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		);

		await expect(repository.saveActiveRun(createFixtureScenarioRun())).rejects.toBe(saveError);

		const summary = await repository.getSummary();
		expect(summary.activeRunsByScenarioId).toEqual({});
		expect(store.reloadOptions).toEqual([{ ignoreDefaults: true }]);
		expect(store.deleteKeys).toEqual([SCENARIO_STORE_KEY, SCENARIO_STORE_KEY]);
	});

	it('detects a missing-store-file error from a plain Error message without a code property', async () => {
		const store = new FakeStore();
		const saveError = new Error('disk unavailable');
		store.failNextSave = saveError;
		store.failDeleteOnCall(1, new Error('delete unavailable'));
		// A plain Error with 'No such file or directory' in the message (no code)
		// exercises the string-message branch of isMissingStoreFileError.
		store.failNextReload = new Error('No such file or directory');
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		);

		await expect(repository.saveActiveRun(createFixtureScenarioRun())).rejects.toBe(saveError);

		const summary = await repository.getSummary();
		expect(summary.activeRunsByScenarioId).toEqual({});
		expect(store.deleteKeys).toEqual([SCENARIO_STORE_KEY, SCENARIO_STORE_KEY]);
	});
});
