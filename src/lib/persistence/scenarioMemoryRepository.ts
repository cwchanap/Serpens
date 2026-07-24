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

export class ScenarioMemoryStoreDriver implements ScenarioStoreDriver {
	// this.value is always an already-decoded, validated ScenarioStoreSnapshot:
	// the constructor decodes the initial input, and write() validates before
	// storing. read() therefore returns it directly instead of re-decoding on
	// every call — the redundant re-validation was flagged in code review
	// (scenarioMemoryRepository.ts:27 re-decoded an already-valid value).
	private value: ScenarioStoreSnapshot;
	private diagnostics: DecodeScenarioStoreResult['diagnostics'];

	constructor(
		initial: unknown = createEmptyScenarioStore(),
		private readonly resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
	) {
		const decoded = decodeScenarioStoreSnapshot(initial, resolveDefinition);
		this.value = decoded.snapshot;
		this.diagnostics = decoded.diagnostics;
	}

	async read(): Promise<DecodeScenarioStoreResult> {
		return {
			snapshot: this.value,
			diagnostics: structuredClone([...this.diagnostics])
		};
	}

	async write(snapshot: ScenarioStoreSnapshot): Promise<void> {
		this.value = validateScenarioStoreSnapshot(snapshot, this.resolveDefinition);
		this.diagnostics = [];
	}
}

export class ScenarioMemoryRepository extends ScenarioRepositoryFromDriver {
	readonly memoryDriver: ScenarioMemoryStoreDriver;

	constructor(
		initial: unknown = createEmptyScenarioStore(),
		resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
	) {
		const memoryDriver = new ScenarioMemoryStoreDriver(initial, resolveDefinition);
		super(memoryDriver, resolveDefinition);
		this.memoryDriver = memoryDriver;
	}
}

export function createScenarioMemoryRepository(
	initial: unknown = createEmptyScenarioStore(),
	resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
): ScenarioRepository {
	return new ScenarioMemoryRepository(initial, resolveDefinition);
}
