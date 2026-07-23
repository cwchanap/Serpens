import { resolveScenarioDefinition } from '$lib/scenarios/catalog';
import type { ScenarioStoreSnapshot } from '$lib/scenarios/types';
import {
	createEmptyScenarioStore,
	parseScenarioStoreSnapshot,
	validateScenarioStoreSnapshot,
	type DecodeScenarioStoreResult,
	type ScenarioDefinitionResolver
} from './scenarioCodec';
import type { ScenarioRepository } from './scenarioRepository';
import { ScenarioRepositoryFromDriver, type ScenarioStoreDriver } from './scenarioStoreRepository';

export const BROWSER_SCENARIO_STORAGE_KEY = 'serpens.scenarios.v1';

export interface ScenarioStorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

class BrowserScenarioStoreDriver implements ScenarioStoreDriver {
	constructor(
		private readonly storage: ScenarioStorageLike,
		private readonly resolveDefinition: ScenarioDefinitionResolver
	) {}

	async read(): Promise<DecodeScenarioStoreResult> {
		const serialized = this.storage.getItem(BROWSER_SCENARIO_STORAGE_KEY);
		return serialized === null
			? { snapshot: createEmptyScenarioStore(), diagnostics: [] }
			: parseScenarioStoreSnapshot(serialized, this.resolveDefinition);
	}

	async write(snapshot: ScenarioStoreSnapshot): Promise<void> {
		const cleanSnapshot = validateScenarioStoreSnapshot(snapshot, this.resolveDefinition);
		this.storage.setItem(BROWSER_SCENARIO_STORAGE_KEY, JSON.stringify(cleanSnapshot));
	}
}

export function createBrowserScenarioRepository(
	storage: ScenarioStorageLike | undefined = globalThis.localStorage,
	resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
): ScenarioRepository {
	if (!storage) {
		throw new Error('Browser scenario storage is unavailable');
	}

	return new ScenarioRepositoryFromDriver(
		new BrowserScenarioStoreDriver(storage, resolveDefinition),
		resolveDefinition
	);
}
