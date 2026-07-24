import { load, type ReloadOptions } from '@tauri-apps/plugin-store';
import { resolveScenarioDefinition } from '$lib/scenarios/catalog';
import type { ScenarioStoreSnapshot } from '$lib/scenarios/types';
import {
	createEmptyScenarioStore,
	decodeScenarioStoreSnapshot,
	validateScenarioStoreSnapshot,
	type DecodeScenarioStoreResult,
	type ScenarioDefinitionResolver
} from './scenarioCodec';
import type { ScenarioRepository } from './scenarioRepository';
import { ScenarioRepositoryFromDriver, type ScenarioStoreDriver } from './scenarioStoreRepository';

export const SCENARIO_STORE_FILE = 'serpens-scenarios.json';
export const SCENARIO_STORE_KEY = 'scenarios';

export interface ScenarioStoreLike {
	get<T>(key: string): Promise<T | undefined>;
	set(key: string, value: unknown): Promise<void>;
	delete(key: string): Promise<boolean>;
	reload(options?: ReloadOptions): Promise<void>;
	save(): Promise<void>;
}

type ScenarioStoreBaseline = { hadValue: false } | { hadValue: true; value: unknown };

class TauriScenarioStoreDriver implements ScenarioStoreDriver {
	private accessQueue: Promise<void> = Promise.resolve();
	private recoveryBaseline: ScenarioStoreBaseline | undefined;

	constructor(
		private readonly storePromise: Promise<ScenarioStoreLike>,
		private readonly resolveDefinition: ScenarioDefinitionResolver
	) {}

	read(): Promise<DecodeScenarioStoreResult> {
		return this.enqueue(() => this.readUnqueued());
	}

	write(snapshot: ScenarioStoreSnapshot): Promise<void> {
		return this.enqueue(() => this.writeUnqueued(snapshot));
	}

	private async readUnqueued(): Promise<DecodeScenarioStoreResult> {
		const store = await this.storePromise;
		await this.ensureRecovered(store);
		const snapshot = await store.get<unknown>(SCENARIO_STORE_KEY);
		return snapshot === undefined
			? { snapshot: createEmptyScenarioStore(), diagnostics: [] }
			: decodeScenarioStoreSnapshot(snapshot, this.resolveDefinition);
	}

	private async writeUnqueued(snapshot: ScenarioStoreSnapshot): Promise<void> {
		const store = await this.storePromise;
		await this.ensureRecovered(store);
		const validated = validateScenarioStoreSnapshot(snapshot, this.resolveDefinition);
		const previousValue = await store.get<unknown>(SCENARIO_STORE_KEY);
		const baseline: ScenarioStoreBaseline =
			previousValue === undefined
				? { hadValue: false }
				: { hadValue: true, value: structuredClone(previousValue) };
		try {
			await store.set(SCENARIO_STORE_KEY, validated);
			await store.save();
		} catch (error) {
			this.recoveryBaseline = baseline;
			try {
				await this.ensureRecovered(store);
			} catch {
				// Preserve the original write error. A later operation retries recovery before access.
			}
			throw error;
		}
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.accessQueue.then(operation);
		this.accessQueue = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	private async ensureRecovered(store: ScenarioStoreLike): Promise<void> {
		const baseline = this.recoveryBaseline;
		if (baseline === undefined) return;

		try {
			await this.restoreBaseline(store, baseline);
			await store.save();
			this.recoveryBaseline = undefined;
			return;
		} catch {
			// Replacement reload is the fallback when direct cache rollback fails.
		}

		try {
			await store.reload({ ignoreDefaults: true });
			this.recoveryBaseline = undefined;
		} catch (reloadError) {
			if (!baseline.hadValue && isMissingStoreFileError(reloadError)) {
				try {
					await this.restoreBaseline(store, baseline);
					this.recoveryBaseline = undefined;
					return;
				} catch {
					// Keep recovery pending; no later operation may access the rejected cache.
				}
			}
			throw reloadError;
		}
	}

	private async restoreBaseline(
		store: ScenarioStoreLike,
		baseline: ScenarioStoreBaseline
	): Promise<void> {
		if (baseline.hadValue) {
			await store.set(SCENARIO_STORE_KEY, baseline.value);
			return;
		}
		await store.delete(SCENARIO_STORE_KEY);
	}
}

function isMissingStoreFileError(error: unknown): boolean {
	if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
		return true;
	}
	const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
	return message.includes('ENOENT') || message.includes('No such file or directory');
}

export function createTauriScenarioRepository(
	resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
): ScenarioRepository {
	return createTauriScenarioRepositoryFromStore(
		load(SCENARIO_STORE_FILE, { defaults: {}, autoSave: false }),
		resolveDefinition
	);
}

export function createTauriScenarioRepositoryFromStore(
	storePromise: Promise<ScenarioStoreLike>,
	resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
): ScenarioRepository {
	return new ScenarioRepositoryFromDriver(
		new TauriScenarioStoreDriver(storePromise, resolveDefinition),
		resolveDefinition
	);
}
