import { describe, expect, it, vi } from 'vitest';
import type { ReloadOptions } from '@tauri-apps/plugin-store';
import type { ScenarioStoreSnapshot } from '$lib/scenarios/types';
import { createFixtureScenarioRun, resolveFixtureDefinition } from './scenarioRepository.testUtils';
import { SAVE_STORE_FILE, SAVE_STORE_KEY } from './tauriSaveRepository';
import { TauriScenarioStoreLock, NoopScenarioStoreLock } from './scenarioStoreLock';

const { tauriLoadMock, tauriInvokeMock } = vi.hoisted(() => ({
	tauriLoadMock: vi.fn(),
	tauriInvokeMock: vi.fn(async (command: string, args?: Record<string, unknown>) => {
		void command;
		void args;
	})
}));

vi.mock('@tauri-apps/plugin-store', () => ({ load: tauriLoadMock }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: tauriInvokeMock }));

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
	private readonly reloadFailureQueue: unknown[] = [];
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
		if (this.reloadFailureQueue.length > 0) {
			throw this.reloadFailureQueue.shift();
		}
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

	queueReloadFailures(...errors: unknown[]): void {
		this.reloadFailureQueue.push(...errors);
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

	it('acquires and releases the Rust mutex around each mutating operation', async () => {
		// The Tauri factory defaults to TauriScenarioStoreLock, which invokes
		// the Rust-side acquire_scenario_lock / release_scenario_lock commands.
		// A mutating operation (saveActiveRun) must call acquire before the
		// read-modify-write and release after — even on the success path.
		const store = new FakeStore();
		tauriInvokeMock.mockClear();
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		);

		await repository.saveActiveRun(createFixtureScenarioRun());

		const calls = tauriInvokeMock.mock.calls.map((call) => ({
			command: call[0] as string,
			name: (call[1] as { name: string }).name
		}));
		expect(calls).toEqual([
			{ command: 'acquire_scenario_lock', name: 'serpens.scenarios' },
			{ command: 'release_scenario_lock', name: 'serpens.scenarios' }
		]);
	});

	it('releases the Rust mutex even when the operation rejects', async () => {
		// A failed save must not orphan the lock — the finally block in
		// TauriScenarioStoreLock.withLock must call release_scenario_lock
		// so other windows are not blocked.
		const store = new FakeStore();
		store.failNextSave = new Error('disk unavailable');
		tauriInvokeMock.mockClear();
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition
		);

		await expect(repository.saveActiveRun(createFixtureScenarioRun())).rejects.toThrow(
			'disk unavailable'
		);

		const releaseCalls = tauriInvokeMock.mock.calls.filter(
			(call) => call[0] === 'release_scenario_lock'
		);
		expect(releaseCalls).toHaveLength(1);
	});
});

describe('TauriScenarioStoreLock lease renewal', () => {
	it('renews the lease periodically while the operation is pending and clears renewal before release', async () => {
		vi.useFakeTimers();
		try {
			const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
				void command;
				void args;
			});
			const lock = new TauriScenarioStoreLock(invoke);
			let releaseOperation!: () => void;
			const operationPromise = new Promise<string>((resolve) => {
				releaseOperation = () => resolve('done');
			});

			const withLockPromise = lock.withLock('serpens.scenarios', () => operationPromise);
			// Flush microtasks so acquire_scenario_lock resolves and the
			// renewal interval is registered.
			await vi.advanceTimersByTimeAsync(0);
			expect(invoke).toHaveBeenCalledWith('acquire_scenario_lock', {
				name: 'serpens.scenarios'
			});

			// Advance past one renewal interval while the operation is still
			// pending; the lease must be renewed.
			await vi.advanceTimersByTimeAsync(10_000);
			expect(invoke).toHaveBeenCalledWith('renew_scenario_lock', {
				name: 'serpens.scenarios'
			});

			// Complete the operation so the finally block runs.
			releaseOperation();
			await withLockPromise;

			const renewCallsBefore = invoke.mock.calls.filter(
				(call) => call[0] === 'renew_scenario_lock'
			).length;
			// Advance well past another renewal interval; the interval must
			// have been cleared before release so no further renew calls fire.
			await vi.advanceTimersByTimeAsync(30_000);
			const renewCallsAfter = invoke.mock.calls.filter(
				(call) => call[0] === 'renew_scenario_lock'
			).length;
			expect(renewCallsAfter).toBe(renewCallsBefore);
			expect(invoke).toHaveBeenCalledWith('release_scenario_lock', {
				name: 'serpens.scenarios'
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('clears the renewal interval even when the operation rejects', async () => {
		vi.useFakeTimers();
		try {
			const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
				void command;
				void args;
			});
			const lock = new TauriScenarioStoreLock(invoke);

			const withLockPromise = lock.withLock('serpens.scenarios', async () => {
				throw new Error('boom');
			});
			await expect(withLockPromise).rejects.toThrow('boom');

			const renewCallsBefore = invoke.mock.calls.filter(
				(call) => call[0] === 'renew_scenario_lock'
			).length;
			// Advance well past a renewal interval; the interval must have
			// been cleared in the finally block so no renew calls fire after
			// the failed operation.
			await vi.advanceTimersByTimeAsync(30_000);
			const renewCallsAfter = invoke.mock.calls.filter(
				(call) => call[0] === 'renew_scenario_lock'
			).length;
			expect(renewCallsAfter).toBe(renewCallsBefore);
			expect(invoke).toHaveBeenCalledWith('release_scenario_lock', {
				name: 'serpens.scenarios'
			});
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('TauriScenarioStoreLock fencing token', () => {
	it('threads the acquisition ID from acquire into renew, release, and the operation context', async () => {
		vi.useFakeTimers();
		try {
			const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
				void args;
				// acquire_scenario_lock returns a unique acquisition ID;
				// renew/release return void.
				if (command === 'acquire_scenario_lock') return 42;
			});
			const lock = new TauriScenarioStoreLock(invoke);

			let releaseOperation!: () => void;
			const operationPromise = new Promise<void>((resolve) => {
				releaseOperation = () => resolve();
			});
			let observedAcquisitionId: number | undefined;
			const withLockPromise = lock.withLock('serpens.scenarios', async (context) => {
				observedAcquisitionId = context.acquisitionId;
				await operationPromise;
			});

			// Flush acquire, then advance past the renewal interval so the
			// renew call fires while the operation is still pending.
			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(10_000);
			expect(invoke).toHaveBeenCalledWith('renew_scenario_lock', {
				name: 'serpens.scenarios',
				acquisitionId: 42
			});

			releaseOperation();
			await withLockPromise;

			expect(observedAcquisitionId).toBe(42);
			// release must carry the acquisition ID so Rust can reject stale
			// calls from a previous acquisition of the same window.
			expect(invoke).toHaveBeenCalledWith('release_scenario_lock', {
				name: 'serpens.scenarios',
				acquisitionId: 42
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('surfaces a renewal failure into the operation instead of swallowing it', async () => {
		// A renewal that rejects means the acquisition is no longer current
		// on the Rust side. The operation must see that error (raced via
		// the renewal-failure deferred) instead of proceeding to a fenced
		// write against a stale acquisition ID.
		vi.useFakeTimers();
		try {
			const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
				void args;
				if (command === 'acquire_scenario_lock') return 7;
				if (command === 'renew_scenario_lock') {
					throw new Error('not owner');
				}
			});
			const lock = new TauriScenarioStoreLock(invoke);

			let operationReachedEnd = false;
			const withLockPromise = lock.withLock('serpens.scenarios', async () => {
				// Block long enough for the renewal interval to fire.
				await new Promise<void>((resolve) => {
					setTimeout(resolve, 60_000);
				});
				operationReachedEnd = true;
				return 'done';
			});

			// Attach the rejection handler BEFORE advancing timers so the
			// rejection is not "handled asynchronously" (the race rejects
			// inside advanceTimersByTimeAsync's microtask flush; attaching
			// the handler after that flush triggers Node's
			// PromiseRejectionHandledWarning).
			const rejectionAssertion = expect(withLockPromise).rejects.toThrow('not owner');

			// Flush acquire, then advance past the renewal interval so the
			// failing renew fires.
			await vi.advanceTimersByTimeAsync(0);
			await vi.advanceTimersByTimeAsync(10_000);
			await rejectionAssertion;
			expect(operationReachedEnd).toBe(false);

			// The finally block still attempts a best-effort release.
			const releaseCalls = invoke.mock.calls.filter((c) => c[0] === 'release_scenario_lock');
			expect(releaseCalls).toHaveLength(1);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('TauriScenarioStoreDriver fenced write', () => {
	it('routes the durable write through write_scenario_store_locked when an acquisition ID is present', async () => {
		const store = new FakeStore();
		let acquisitionIdCounter = 0;
		const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
			void args;
			if (command === 'acquire_scenario_lock') {
				acquisitionIdCounter += 1;
				return acquisitionIdCounter;
			}
		});
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition,
			new TauriScenarioStoreLock(invoke),
			invoke
		);

		await repository.saveActiveRun(createFixtureScenarioRun());

		// The fenced write command must be invoked with the acquisition ID
		// and the lock name, and the store.set/store.save fallback must NOT
		// have been called.
		const fencedWriteCalls = invoke.mock.calls.filter(
			(c) => c[0] === 'write_scenario_store_locked'
		);
		expect(fencedWriteCalls).toHaveLength(1);
		expect(fencedWriteCalls[0]![1]).toMatchObject({
			name: 'serpens.scenarios',
			acquisitionId: 1
		});
		expect(store.setKeys).toEqual([]);
		expect(store.saveCount).toBe(0);
	});

	it('falls back to store.set/store.save when no acquisition ID is present (browser/in-process lock)', async () => {
		const store = new FakeStore();
		const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
			void args;
			// acquire returns undefined — simulates a non-Tauri lock or a
			// mock that does not issue acquisition IDs.
		});
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition,
			new TauriScenarioStoreLock(invoke),
			invoke
		);

		await repository.saveActiveRun(createFixtureScenarioRun());

		const fencedWriteCalls = invoke.mock.calls.filter(
			(c) => c[0] === 'write_scenario_store_locked'
		);
		expect(fencedWriteCalls).toHaveLength(0);
		expect(store.setKeys).toEqual([SCENARIO_STORE_KEY]);
		expect(store.saveCount).toBe(1);
	});

	it('propagates a fencing rejection as an error instead of falling back to an unfenced write', async () => {
		const store = new FakeStore();
		const fencingError = new Error('fencing rejected: not the current lock owner');
		let acquisitionIdCounter = 0;
		const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
			void args;
			if (command === 'acquire_scenario_lock') {
				acquisitionIdCounter += 1;
				return acquisitionIdCounter;
			}
			if (command === 'write_scenario_store_locked') {
				throw fencingError;
			}
		});
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition,
			new TauriScenarioStoreLock(invoke),
			invoke
		);

		await expect(repository.saveActiveRun(createFixtureScenarioRun())).rejects.toBe(fencingError);
		// A fencing rejection means the caller is no longer the lock owner
		// and the native command made no mutation. The driver must NOT
		// restore the pre-write baseline through the unfenced store API —
		// that baseline is obsolete (another acquisition wrote a newer
		// revision after this lease expired) and restoring it would
		// clobber that newer revision. Neither store.set nor store.delete
		// may receive the scenario key from the rejected fenced write;
		// the driver reloads the durable store instead.
		expect(store.setKeys).toEqual([]);
		expect(store.deleteKeys).toEqual([]);
	});

	it('does not overwrite a newer revision after a fencing rejection (P1 rollback bug)', async () => {
		const store = new FakeStore();
		// Seed revision 1 through the unfenced path so the store has a
		// non-empty baseline for the fenced write to capture.
		const revision1Run = createFixtureScenarioRun();
		const seedRepo = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition,
			new NoopScenarioStoreLock(),
			vi.fn()
		);
		await seedRepo.saveActiveRun(revision1Run);
		const seedSaveCount = store.saveCount;
		const seedSetKeys = [...store.setKeys];

		const fencingError = new Error('fencing rejected: not the current lock owner');
		let acquisitionIdCounter = 0;
		const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
			void args;
			if (command === 'acquire_scenario_lock') {
				acquisitionIdCounter += 1;
				return acquisitionIdCounter;
			}
			if (command === 'write_scenario_store_locked') {
				// Simulate acquisition B having written revision 2 to the
				// shared store cache (and durable file) before A's fenced
				// write is rejected. The cache and durable state now hold
				// the newer revision, not A's baseline.
				store.values.set(SCENARIO_STORE_KEY, { newerRevision: true });
				store.persistedValues.set(SCENARIO_STORE_KEY, { newerRevision: true });
				store.fileExists = true;
				throw fencingError;
			}
		});
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition,
			new TauriScenarioStoreLock(invoke),
			invoke
		);

		await expect(repository.removeActiveRun('first-profit')).rejects.toBe(fencingError);

		// The newer revision (B's write) must survive — A's obsolete
		// baseline must not have been restored through the unfenced store
		// API. The reload syncs the cache to the durable newer revision.
		expect(store.persistedValues.get(SCENARIO_STORE_KEY)).toEqual({ newerRevision: true });
		expect(store.values.get(SCENARIO_STORE_KEY)).toEqual({ newerRevision: true });
		// No unfenced recovery write: store.set/store.save must not have
		// been called beyond the seed.
		expect(store.setKeys).toEqual(seedSetKeys);
		expect(store.saveCount).toBe(seedSaveCount);
		// The driver reloaded the durable store to discard stale cache
		// state instead of restoring the baseline.
		expect(store.reloadOptions).toEqual([{ ignoreDefaults: true }]);
	});

	it('restores the baseline through the fenced write command after a native save failure (not unfenced store.save)', async () => {
		const store = new FakeStore();
		// Seed revision 1 through the unfenced path.
		const revision1Run = createFixtureScenarioRun();
		const seedRepo = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition,
			new NoopScenarioStoreLock(),
			vi.fn()
		);
		await seedRepo.saveActiveRun(revision1Run);
		const revision1Snapshot = structuredClone(store.values.get(SCENARIO_STORE_KEY));
		const seedSaveCount = store.saveCount;
		const seedSetKeys = [...store.setKeys];

		const saveError = new Error('disk unavailable');
		let writeCalls = 0;
		let acquisitionIdCounter = 0;
		const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
			void args;
			if (command === 'acquire_scenario_lock') {
				acquisitionIdCounter += 1;
				return acquisitionIdCounter;
			}
			if (command === 'write_scenario_store_locked') {
				writeCalls += 1;
				if (writeCalls === 1) {
					// First call: the durable save fails (Rust mutated the
					// cache then store.save errored).
					throw saveError;
				}
				// Second call: the fenced baseline restore succeeds.
			}
		});
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition,
			new TauriScenarioStoreLock(invoke),
			invoke
		);

		await expect(repository.removeActiveRun('first-profit')).rejects.toBe(saveError);

		// The recovery must have routed the baseline restore through the
		// fenced write command, not through unfenced store.set/store.save.
		const fencedWriteCalls = invoke.mock.calls.filter(
			(c) => c[0] === 'write_scenario_store_locked'
		);
		expect(fencedWriteCalls).toHaveLength(2);
		expect(fencedWriteCalls[1]![1]).toMatchObject({
			name: 'serpens.scenarios',
			acquisitionId: 1
		});
		// The restore must have written the baseline (revision 1) back.
		expect((fencedWriteCalls[1]![1] as { snapshot: unknown }).snapshot).toEqual(revision1Snapshot);
		// No unfenced recovery write: store.set/store.save must not have
		// been called beyond the seed.
		expect(store.setKeys).toEqual(seedSetKeys);
		expect(store.saveCount).toBe(seedSaveCount);
	});

	it('abandons the baseline and reloads when the fenced restore itself is fencing-rejected', async () => {
		const store = new FakeStore();
		const revision1Run = createFixtureScenarioRun();
		const seedRepo = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition,
			new NoopScenarioStoreLock(),
			vi.fn()
		);
		await seedRepo.saveActiveRun(revision1Run);
		const seedSaveCount = store.saveCount;

		const saveError = new Error('disk unavailable');
		const fencingError = new Error('fencing rejected: not the current lock owner');
		let writeCalls = 0;
		let acquisitionIdCounter = 0;
		const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
			void args;
			if (command === 'acquire_scenario_lock') {
				acquisitionIdCounter += 1;
				return acquisitionIdCounter;
			}
			if (command === 'write_scenario_store_locked') {
				writeCalls += 1;
				if (writeCalls === 1) {
					// Initial write fails with a non-fencing error (cache
					// mutated, save failed) — enters the native-save-failure
					// recovery path, which attempts a fenced baseline
					// restore.
					throw saveError;
				}
				// Second call: the fenced baseline restore is itself
				// fencing-rejected — ownership was lost (lease expired)
				// during recovery. The driver must abandon the baseline
				// and reload instead of falling back to an unfenced write.
				throw fencingError;
			}
		});
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition,
			new TauriScenarioStoreLock(invoke),
			invoke
		);

		// The original save error propagates (the fencing rejection during
		// recovery is swallowed — the caller sees the durable-write
		// failure, not the recovery failure).
		await expect(repository.removeActiveRun('first-profit')).rejects.toBe(saveError);

		// Two fenced write calls: the initial write and the fenced restore
		// attempt. The restore was fencing-rejected, so the baseline is
		// abandoned and the durable store is reloaded — no unfenced
		// store.set/store.save beyond the seed.
		const fencedWriteCalls = invoke.mock.calls.filter(
			(c) => c[0] === 'write_scenario_store_locked'
		);
		expect(fencedWriteCalls).toHaveLength(2);
		expect(store.saveCount).toBe(seedSaveCount);
		expect(store.reloadOptions).toEqual([{ ignoreDefaults: true }]);
	});

	it('keeps recovery pending when the fenced restore and reload both fail so the dirty cache is not readable (P2 ghost-snapshot bug)', async () => {
		// Regression: recoverFenced previously cleared this.recovery
		// before attempting the reload and swallowed reload errors. If
		// the original native write mutated the plugin-store cache
		// before failing, and the fenced baseline restore also failed,
		// a failed reload left the uncommitted snapshot in the cache
		// and a later read returned it as persisted state. Recovery must
		// stay in reload-required mode and block reads until reload
		// succeeds.
		const store = new FakeStore();
		// Seed revision 1 through the unfenced path so the durable store
		// holds a known baseline.
		const revision1Run = createFixtureScenarioRun();
		const seedRepo = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition,
			new NoopScenarioStoreLock(),
			vi.fn()
		);
		await seedRepo.saveActiveRun(revision1Run);
		const revision1Snapshot = structuredClone(store.persistedValues.get(SCENARIO_STORE_KEY));
		const seedSaveCount = store.saveCount;
		const seedSetKeys = [...store.setKeys];

		const saveError = new Error('disk unavailable');
		const restoreError = new Error('fenced restore failed');
		const reloadError1 = new Error('reload unavailable');
		const reloadError2 = new Error('reload still unavailable');
		const dirtyGhostSnapshot = { ghostRevision: true, uncommitted: true };

		// Queue two reload failures: the first fires during recovery
		// (inside removeActiveRun), the second fires on the next read.
		// The third reload succeeds.
		store.queueReloadFailures(reloadError1, reloadError2);

		let writeCalls = 0;
		let acquisitionIdCounter = 0;
		const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
			void args;
			if (command === 'acquire_scenario_lock') {
				acquisitionIdCounter += 1;
				return acquisitionIdCounter;
			}
			if (command === 'write_scenario_store_locked') {
				writeCalls += 1;
				if (writeCalls === 1) {
					// First call: the native command mutates the shared
					// cache to an uncommitted revision 2 but the durable
					// save fails. persistedValues still holds revision 1.
					store.values.set(SCENARIO_STORE_KEY, structuredClone(dirtyGhostSnapshot));
					throw saveError;
				}
				// Second call: the fenced baseline restore fails with a
				// non-fencing native error — recovery enters the
				// reload-required path.
				throw restoreError;
			}
		});
		const repository = createTauriScenarioRepositoryFromStore(
			Promise.resolve(store),
			resolveFixtureDefinition,
			new TauriScenarioStoreLock(invoke),
			invoke
		);

		// The original save error propagates; the recovery's reload
		// attempt (reloadError1) is swallowed inside the write's catch
		// block so the caller sees the durable-write failure.
		await expect(repository.removeActiveRun('first-profit')).rejects.toBe(saveError);

		// The cache holds the uncommitted ghost snapshot; the durable
		// store still holds revision 1.
		expect(store.values.get(SCENARIO_STORE_KEY)).toEqual(dirtyGhostSnapshot);
		expect(store.persistedValues.get(SCENARIO_STORE_KEY)).toEqual(revision1Snapshot);
		// No unfenced recovery write beyond the seed.
		expect(store.setKeys).toEqual(seedSetKeys);
		expect(store.saveCount).toBe(seedSaveCount);
		// One reload was attempted during recovery (it failed).
		expect(store.reloadOptions).toEqual([{ ignoreDefaults: true }]);

		// The next read must NOT return the dirty cache. Recovery is in
		// reload-required mode, so the read retries the reload; the
		// second queued reload failure (reloadError2) propagates and
		// blocks the read.
		await expect(repository.getSummary()).rejects.toBe(reloadError2);
		// The cache still holds the ghost — it was not returned as
		// persisted state.
		expect(store.values.get(SCENARIO_STORE_KEY)).toEqual(dirtyGhostSnapshot);
		expect(store.reloadOptions).toEqual([{ ignoreDefaults: true }, { ignoreDefaults: true }]);

		// After reload succeeds, recovery clears and the durable
		// baseline (revision 1) is returned — not the ghost.
		const summary = await repository.getSummary();
		expect(summary.activeRunsByScenarioId['first-profit']).toEqual(revision1Run);
		expect(summary.diagnostics).toEqual([]);
		// The cache is now synced to the durable state.
		expect(store.values.get(SCENARIO_STORE_KEY)).toEqual(revision1Snapshot);
		expect(store.reloadOptions).toEqual([
			{ ignoreDefaults: true },
			{ ignoreDefaults: true },
			{ ignoreDefaults: true }
		]);
	});
});
