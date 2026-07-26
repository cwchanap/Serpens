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
import {
	type ScenarioRepository,
	type ScenarioRemoveOutcome,
	type ScenarioSaveOutcome
} from './scenarioRepository';

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

	async saveActiveRun(
		run: ScenarioRun,
		options?: { replace?: boolean }
	): Promise<ScenarioSaveOutcome> {
		return this.mutate(async () => {
			const record = encodeScenarioRunRecord(run, this.resolveDefinition);
			if (record.run.status !== 'active' || record.run.result !== null) {
				throw new TypeError('saveActiveRun requires an active run without a terminal result.');
			}
			const decoded = await this.driver.read();
			const existing = decoded.snapshot.activeRunsByScenarioId[run.definition.scenarioId];
			// Compare-and-swap: refuse to silently overwrite a different active
			// run. A stale catalog, second browser tab, or results dialog can
			// call save when a newer run is already persisted. Same-runId saves
			// (normal in-run evolution) and explicit `replace: true` (restart,
			// confirmed import) proceed. The check is best-effort across tabs
			// — it serializes within this repository's mutation queue but two
			// tabs have separate queues, so cross-tab races are last-write-wins
			// at the storage layer; the guard still catches the common case
			// where a stale in-memory catalog drives a start against a run that
			// was started elsewhere in this tab.
			if (existing && existing.run.runId !== run.runId && !options?.replace) {
				return {
					status: 'conflict' as const,
					activeRun: runFromRecord(existing)
				};
			}
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

	async removeActiveRun(scenarioId: ScenarioId, runId?: string): Promise<ScenarioRemoveOutcome> {
		return this.mutate(async () => {
			const decoded = await this.driver.read();
			const existing = decoded.snapshot.activeRunsByScenarioId[scenarioId];
			// Compare-and-swap on abandon: only delete when the stored run is
			// the one the caller is abandoning. A stale results dialog or second
			// tab could otherwise delete a newer replacement run. Without a
			// `runId` the removal stays unconditional for backwards-compatible
			// callers that have already verified identity.
			if (runId && existing && existing.run.runId !== runId) {
				return { status: 'conflict' as const, activeRun: runFromRecord(existing) };
			}
			const activeRunsByScenarioId = { ...decoded.snapshot.activeRunsByScenarioId };
			delete activeRunsByScenarioId[scenarioId];
			await this.driver.write({ ...decoded.snapshot, activeRunsByScenarioId });
			return { status: 'removed' as const };
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
			// Only clear the active run when it is the same run instance that just
			// terminated. The map is keyed by scenarioId, so a replacement run
			// started between termination and commit (e.g. user clicked restart on
			// a stale results dialog) would otherwise be silently deleted. Match on
			// runId — a unique identity generated per startScenario call. Restart
			// preserves (version, seed) but produces a fresh runId, so a stale
			// commit cannot remove the resumable replacement.
			const existingActive = activeRunsByScenarioId[terminal.definition.scenarioId];
			let preservedActiveRun: ScenarioRun | null = null;
			if (existingActive && existingActive.run.runId === terminal.runId) {
				delete activeRunsByScenarioId[terminal.definition.scenarioId];
			} else if (existingActive) {
				// A replacement run started between termination and this stale
				// commit. It survives in storage; surface it as the outcome's
				// activeRun so the controller's in-memory state stays consistent
				// with the persisted catalog instead of being cleared to null.
				preservedActiveRun = runFromRecord(existingActive);
			}
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
				activeRun: preservedActiveRun,
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
