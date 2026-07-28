import { shouldReplaceBestResult } from '$lib/scenarios/scoring';
import type {
	LoadedScenarioRun,
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
	type ScenarioCommitRunOutcome,
	type ScenarioCommitTerminalOptions,
	type ScenarioRemoveOptions,
	type ScenarioRepository,
	type ScenarioRemoveOutcome,
	type ScenarioSaveOptions,
	type ScenarioSaveOutcome,
	type ScenarioTerminalConflict
} from './scenarioRepository';
import {
	NoopScenarioStoreLock,
	SCENARIO_STORE_LOCK_NAME,
	type LockContext,
	type ScenarioStoreLock
} from './scenarioStoreLock';

export interface ScenarioStoreDriver {
	read(): Promise<DecodeScenarioStoreResult>;
	/**
	 * Durable write. On platforms that issue a fencing token, `context`
	 * carries the acquisition ID and the driver routes the write through
	 * the Rust-side fenced write command; on other platforms `context`
	 * is empty and the driver writes directly. The driver must not
	 * silently fall back to an unfenced write when an acquisition ID is
	 * present but the fenced write rejects — that error must propagate
	 * so the caller surfaces a conflict instead of clobbering.
	 */
	write(snapshot: ScenarioStoreSnapshot, context: LockContext): Promise<void>;
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
		private readonly resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition,
		private readonly lock: ScenarioStoreLock = new NoopScenarioStoreLock()
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

	async loadActiveRunWithRevision(scenarioId: ScenarioId): Promise<LoadedScenarioRun | null> {
		const record = (await this.driver.read()).snapshot.activeRunsByScenarioId[scenarioId];
		if (!record) return null;
		return { run: runFromRecord(record), revision: record.revision };
	}

	async saveActiveRun(
		run: ScenarioRun,
		options?: ScenarioSaveOptions
	): Promise<ScenarioSaveOutcome> {
		return this.mutate(async (context) => {
			const decoded = await this.driver.read();
			const existing = decoded.snapshot.activeRunsByScenarioId[run.definition.scenarioId];
			// Compare-and-swap: refuse to silently overwrite a different active
			// run. A stale catalog, second browser tab, or results dialog can
			// call save when a newer run is already persisted. Same-runId saves
			// (normal in-run evolution) and explicit `replace: true` (restart,
			// confirmed import) proceed. `mutate` wraps this read-modify-write
			// in `withLock`, whose critical section serializes cross-tab reads
			// and writes (browser Web Locks or the Tauri named mutex), so the
			// second tab's read happens after the first tab's write and this
			// compare-and-swap guard observes the committed run and refuses the
			// clobber instead of last-write-wins. The per-instance
			// `mutationQueue` is a secondary guard that serializes overlapping
			// calls within this repository even when the lock is a no-op.
			if (existing && existing.run.runId !== run.runId && !options?.replace) {
				return {
					status: 'conflict' as const,
					activeRun: runFromRecord(existing),
					revision: existing.revision
				};
			}
			// Identity-bound replacement: when the caller supplies an
			// `expectedRunId`, the save is refused unless the stored run
			// matches that identity. `null` means the caller inspected an
			// empty slot, so any run that appeared since is a conflict. This
			// binds restart/confirmed-import writes to the run the caller
			// actually saw, so a newer run written between the caller's read
			// and this save is not silently clobbered — even with
			// `replace: true`, which only bypasses the runId-difference guard
			// above, not this identity check.
			if (options && options.expectedRunId !== undefined) {
				const expected = options.expectedRunId;
				const storedRunId = existing?.run.runId ?? null;
				if (storedRunId !== expected) {
					// Identity mismatch. When a run is stored but its runId
					// differs, surface it so the caller can reconcile. When no
					// run is stored but the caller expected one (expected is a
					// string), the expected run is gone — surface null so the
					// caller refreshes its catalog. Expecting absence
					// (`expected === null`) with no stored run is the happy
					// path and falls through to the write.
					return {
						status: 'conflict' as const,
						activeRun: existing ? runFromRecord(existing) : null,
						revision: existing ? existing.revision : null
					};
				}
			}
			// Revision compare-and-swap: when the caller supplies an
			// `expectedRevision`, the save is refused unless the stored
			// record's revision matches. This closes the same-`runId` race
			// that the runId guard cannot: two tabs resuming the same run
			// share its `runId`, so without a revision check the second tab's
			// save (computed from stale game state) silently rolls back the
			// first tab's progress. `0` means the caller expects no stored run
			// (or a pre-revision record). On a matching write the stored
			// revision is incremented, so the next stale write is refused.
			const storedRevision = existing?.revision ?? 0;
			if (options && options.expectedRevision !== undefined) {
				if (storedRevision !== options.expectedRevision) {
					return {
						status: 'conflict' as const,
						activeRun: existing ? runFromRecord(existing) : null,
						revision: existing ? existing.revision : null
					};
				}
			}
			const nextRevision = storedRevision + 1;
			const record = encodeScenarioRunRecord(run, this.resolveDefinition, nextRevision);
			if (record.run.status !== 'active' || record.run.result !== null) {
				throw new TypeError('saveActiveRun requires an active run without a terminal result.');
			}
			const next: ScenarioStoreSnapshot = {
				...decoded.snapshot,
				activeRunsByScenarioId: {
					...decoded.snapshot.activeRunsByScenarioId,
					[run.definition.scenarioId]: record
				}
			};
			await this.driver.write(next, context);
			return {
				activeRun: runFromRecord(record),
				terminalResult: null,
				bestUpdated: false
			};
		});
	}

	async removeActiveRun(
		scenarioId: ScenarioId,
		options?: ScenarioRemoveOptions
	): Promise<ScenarioRemoveOutcome> {
		return this.mutate(async (context) => {
			const decoded = await this.driver.read();
			const existing = decoded.snapshot.activeRunsByScenarioId[scenarioId];
			// Compare-and-swap on abandon: only delete when the stored run is
			// the one the caller is abandoning. A stale results dialog or second
			// tab could otherwise delete a newer replacement run. Without
			// options the removal stays unconditional for backwards-compatible
			// callers that have already verified identity.
			if (options && options.expectedRunId !== undefined) {
				const expected = options.expectedRunId;
				const storedRunId = existing?.run.runId ?? null;
				if (storedRunId !== expected) {
					return {
						status: 'conflict' as const,
						activeRun: existing ? runFromRecord(existing) : null,
						revision: existing ? existing.revision : null
					};
				}
			}
			if (options && options.expectedRevision !== undefined) {
				const storedRevision = existing?.revision ?? 0;
				if (storedRevision !== options.expectedRevision) {
					return {
						status: 'conflict' as const,
						activeRun: existing ? runFromRecord(existing) : null,
						revision: existing ? existing.revision : null
					};
				}
			}
			const activeRunsByScenarioId = { ...decoded.snapshot.activeRunsByScenarioId };
			delete activeRunsByScenarioId[scenarioId];
			await this.driver.write({ ...decoded.snapshot, activeRunsByScenarioId }, context);
			return { status: 'removed' as const };
		});
	}

	async commitTerminalRun(
		run: ScenarioRun,
		options?: ScenarioCommitTerminalOptions
	): Promise<ScenarioCommitRunOutcome> {
		return this.mutate(async (context) => {
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
			// Revision compare-and-swap: when the caller supplies an
			// `expectedRevision`, the commit is refused unless the stored active
			// run's revision matches. This prevents a stale terminal result
			// (computed from obsolete game state) from clearing the active entry
			// or recording a best result when another tab has since advanced the
			// same run. The check applies only when the stored run is the same
			// instance (same `runId`) being terminated — a replacement run with a
			// different `runId` is already preserved by the identity check below,
			// and the revision mismatch is irrelevant there.
			//
			// When the caller supplied an `expectedRevision` but the active entry
			// is gone (another tab abandoned or removed the run before this
			// commit), refuse with a conflict whose `activeRun` is `null`. The
			// public contract says a missing expected run produces a conflict,
			// and that a terminal commit with `expectedRevision` must be refused
			// unless the stored active revision matches. Without this guard the
			// stale terminal result would still be recorded, potentially
			// becoming the stored best result.
			if (options && options.expectedRevision !== undefined && !existingActive) {
				const conflict: ScenarioTerminalConflict = {
					status: 'conflict',
					activeRun: null,
					revision: null
				};
				return conflict;
			}
			if (
				options &&
				options.expectedRevision !== undefined &&
				existingActive &&
				existingActive.run.runId === terminal.runId &&
				existingActive.revision !== options.expectedRevision
			) {
				const conflict: ScenarioTerminalConflict = {
					status: 'conflict',
					activeRun: runFromRecord(existingActive),
					revision: existingActive.revision
				};
				return conflict;
			}
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

			await this.driver.write(
				{
					...decoded.snapshot,
					activeRunsByScenarioId,
					bestResultsByDefinitionKey
				},
				context
			);
			return {
				activeRun: preservedActiveRun,
				terminalResult: structuredClone(terminal.result) as ScenarioResult,
				bestUpdated
			};
		});
	}

	protected mutate<T>(operation: (context: LockContext) => Promise<T>): Promise<T> {
		// The lock wraps the read-modify-write critical section so two
		// repository instances on the same origin (browser tabs, Tauri
		// windows) cannot interleave: the second tab's read happens after
		// the first tab's write, so the compare-and-swap guard sees the
		// committed run and refuses the clobber instead of last-write-wins.
		// The per-instance mutationQueue is a secondary guard that
		// serializes overlapping calls within this repository even when the
		// lock is a no-op (tests, SSR, environments without Web Locks).
		//
		// The lock's `withLock` passes a `LockContext` carrying the fencing
		// token (acquisition ID on Tauri) into the operation, which threads
		// it through to `driver.write` so the durable write is fenced.
		const run = () => this.lock.withLock(SCENARIO_STORE_LOCK_NAME, operation);
		const result = this.mutationQueue.then(run, run);
		this.mutationQueue = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}
}
