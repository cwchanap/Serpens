import { shouldReplaceBestResult } from '$lib/scenarios/scoring';
import type {
	ScenarioCommitOutcome,
	ScenarioDefinitionKey,
	ScenarioDiagnostic,
	ScenarioId,
	ScenarioPersistenceSummary,
	ScenarioResult,
	ScenarioRun,
	ScenarioRunRecord,
	ScenarioStoreSnapshot
} from '$lib/scenarios/types';
import { resolveScenarioDefinition } from '$lib/scenarios/catalog';
import {
	encodeScenarioBestResultRecord,
	encodeScenarioRunRecord,
	scenarioDefinitionKey,
	validateScenarioRun,
	type DecodeScenarioStoreResult,
	type ScenarioDefinitionResolver
} from './scenarioCodec';
import type { ScenarioRepository } from './scenarioRepository';

export interface ScenarioStoreDriver {
	read(): Promise<DecodeScenarioStoreResult>;
	write(snapshot: ScenarioStoreSnapshot): Promise<void>;
}

function runFromRecord(record: ScenarioRunRecord): ScenarioRun {
	return structuredClone({ ...record.run, game: record.game }) as ScenarioRun;
}

function cloneDiagnostics(diagnostics: readonly ScenarioDiagnostic[]): ScenarioDiagnostic[] {
	return [...structuredClone(diagnostics)];
}

export class ScenarioRepositoryFromDriver implements ScenarioRepository {
	private mutationQueue: Promise<void> = Promise.resolve();

	constructor(
		private readonly driver: ScenarioStoreDriver,
		private readonly resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
	) {}

	async getSummary(): Promise<ScenarioPersistenceSummary> {
		const decoded = await this.driver.read();
		const activeRunsByScenarioId: ScenarioPersistenceSummary['activeRunsByScenarioId'] = {};
		const bestResultsByDefinitionKey: ScenarioPersistenceSummary['bestResultsByDefinitionKey'] = {};

		for (const [scenarioId, record] of Object.entries(decoded.snapshot.activeRunsByScenarioId)) {
			if (record) activeRunsByScenarioId[scenarioId as ScenarioId] = runFromRecord(record);
		}
		for (const [key, record] of Object.entries(decoded.snapshot.bestResultsByDefinitionKey)) {
			if (record) {
				bestResultsByDefinitionKey[key as ScenarioDefinitionKey] = structuredClone(record.result);
			}
		}

		return {
			activeRunsByScenarioId,
			bestResultsByDefinitionKey,
			diagnostics: cloneDiagnostics(decoded.diagnostics)
		};
	}

	async loadActiveRun(scenarioId: ScenarioId): Promise<ScenarioRun | null> {
		const record = (await this.driver.read()).snapshot.activeRunsByScenarioId[scenarioId];
		return record ? runFromRecord(record) : null;
	}

	async saveActiveRun(run: ScenarioRun): Promise<ScenarioCommitOutcome> {
		return this.mutate(async () => {
			const record = encodeScenarioRunRecord(run, this.resolveDefinition);
			if (record.run.status !== 'active' || record.run.result !== null) {
				throw new TypeError('saveActiveRun requires an active run without a terminal result.');
			}
			const decoded = await this.driver.read();
			const next: ScenarioStoreSnapshot = {
				...decoded.snapshot,
				activeRunsByScenarioId: {
					...decoded.snapshot.activeRunsByScenarioId,
					[run.definition.scenarioId]: record
				}
			};
			await this.driver.write(next);
			return {
				activeRun: runFromRecord(record),
				terminalResult: null,
				bestUpdated: false
			};
		});
	}

	async removeActiveRun(scenarioId: ScenarioId): Promise<void> {
		return this.mutate(async () => {
			const decoded = await this.driver.read();
			const activeRunsByScenarioId = { ...decoded.snapshot.activeRunsByScenarioId };
			delete activeRunsByScenarioId[scenarioId];
			await this.driver.write({ ...decoded.snapshot, activeRunsByScenarioId });
		});
	}

	async commitTerminalRun(run: ScenarioRun): Promise<ScenarioCommitOutcome> {
		return this.mutate(async () => {
			const terminal = validateScenarioRun(run, this.resolveDefinition);
			if (terminal.status === 'active' || terminal.result === null) {
				throw new TypeError('commitTerminalRun requires a completed, failed, or abandoned run.');
			}

			const decoded = await this.driver.read();
			const activeRunsByScenarioId = { ...decoded.snapshot.activeRunsByScenarioId };
			delete activeRunsByScenarioId[terminal.definition.scenarioId];
			const bestResultsByDefinitionKey = {
				...decoded.snapshot.bestResultsByDefinitionKey
			};
			const key = scenarioDefinitionKey(terminal.definition);
			const existing = bestResultsByDefinitionKey[key]?.result ?? null;
			const bestUpdated = shouldReplaceBestResult(existing, terminal.result);
			if (bestUpdated) {
				bestResultsByDefinitionKey[key] = encodeScenarioBestResultRecord(
					terminal.result,
					this.resolveDefinition
				);
			}

			await this.driver.write({
				...decoded.snapshot,
				activeRunsByScenarioId,
				bestResultsByDefinitionKey
			});
			return {
				activeRun: null,
				terminalResult: structuredClone(terminal.result) as ScenarioResult,
				bestUpdated
			};
		});
	}

	protected mutate<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.mutationQueue.then(operation, operation);
		this.mutationQueue = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}
}
