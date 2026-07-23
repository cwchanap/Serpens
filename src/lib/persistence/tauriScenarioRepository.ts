import { load } from '@tauri-apps/plugin-store';
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
	get<T>(key: string): Promise<T | null | undefined>;
	set(key: string, value: unknown): Promise<void>;
	save(): Promise<void>;
}

class TauriScenarioStoreDriver implements ScenarioStoreDriver {
	constructor(
		private readonly storePromise: Promise<ScenarioStoreLike>,
		private readonly resolveDefinition: ScenarioDefinitionResolver
	) {}

	async read(): Promise<DecodeScenarioStoreResult> {
		const store = await this.storePromise;
		const snapshot = await store.get<unknown>(SCENARIO_STORE_KEY);
		return snapshot == null
			? { snapshot: createEmptyScenarioStore(), diagnostics: [] }
			: decodeScenarioStoreSnapshot(snapshot, this.resolveDefinition);
	}

	async write(snapshot: ScenarioStoreSnapshot): Promise<void> {
		const store = await this.storePromise;
		await store.set(
			SCENARIO_STORE_KEY,
			validateScenarioStoreSnapshot(snapshot, this.resolveDefinition)
		);
		await store.save();
	}
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
