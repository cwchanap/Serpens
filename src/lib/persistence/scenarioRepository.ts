import type {
	ScenarioCommitOutcome,
	ScenarioId,
	ScenarioPersistenceSummary,
	ScenarioRun
} from '$lib/scenarios/types';

/**
 * Returned by `saveActiveRun` when a different active run already exists for
 * the same scenario and the caller did not opt into replacement. The run is
 * left untouched; `activeRun` is the conflicting persisted run so callers can
 * surface it (e.g. refresh a stale catalog) without a separate read.
 */
export interface ScenarioSaveConflict {
	status: 'conflict';
	activeRun: ScenarioRun;
}

/**
 * Returned by `removeActiveRun`. When `runId` was provided and the stored run
 * has a different identity, the removal is refused with `status: 'conflict'`
 * and `activeRun` is the persisted run so the caller can reconcile.
 */
export type ScenarioRemoveOutcome =
	| { status: 'removed' }
	| { status: 'conflict'; activeRun: ScenarioRun };

export type ScenarioSaveOutcome = ScenarioCommitOutcome | ScenarioSaveConflict;

export interface ScenarioRepository {
	getSummary(): Promise<ScenarioPersistenceSummary>;
	loadActiveRun(scenarioId: ScenarioId): Promise<ScenarioRun | null>;
	/**
	 * Persist an active run. When a different active run (by `runId`) already
	 * exists for the scenario, the call returns a `ScenarioSaveConflict`
	 * unless `options.replace` is `true`, in which case the existing run is
	 * overwritten. Same-`runId` saves always proceed (normal in-run evolution).
	 */
	saveActiveRun(run: ScenarioRun, options?: { replace?: boolean }): Promise<ScenarioSaveOutcome>;
	/**
	 * Remove the active run for a scenario. When `runId` is provided, the
	 * removal is refused if the stored run has a different `runId`, returning
	 * `{ status: 'conflict', activeRun }`. Without `runId` the removal is
	 * unconditional (backwards-compatible with callers that have already
	 * verified identity or accept best-effort cleanup).
	 */
	removeActiveRun(scenarioId: ScenarioId, runId?: string): Promise<ScenarioRemoveOutcome>;
	commitTerminalRun(run: ScenarioRun): Promise<ScenarioCommitOutcome>;
}
