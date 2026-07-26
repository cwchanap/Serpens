import type {
	LoadedScenarioRun,
	ScenarioCommitOutcome,
	ScenarioId,
	ScenarioPersistenceSummary,
	ScenarioRun
} from '$lib/scenarios/types';

/**
 * Returned by `saveActiveRun` when a different active run already exists for
 * the same scenario and the caller did not opt into replacement, or when an
 * `expectedRunId` or `expectedRevision` compare-and-swap did not match. The
 * run is left untouched; `activeRun` is the conflicting persisted run so
 * callers can surface it (e.g. refresh a stale catalog) without a separate
 * read. When the conflict is because the caller expected a specific run that
 * is no longer stored, `activeRun` is `null`. `revision` is the stored
 * record's revision (or `null` when no run is stored) so the caller can bind
 * a subsequent confirmed write to it via `expectedRevision`.
 */
export interface ScenarioSaveConflict {
	status: 'conflict';
	activeRun: ScenarioRun | null;
	revision: number | null;
}

/**
 * Returned by `removeActiveRun`. When `expectedRunId` or `expectedRevision`
 * was provided and the stored run does not match, the removal is refused with
 * `status: 'conflict'` and `activeRun` is the persisted run so the caller can
 * reconcile. When the expected run is gone, `activeRun` is `null`. `revision`
 * is the stored record's revision (or `null` when no run is stored) so the
 * caller can bind a subsequent confirmed write to it via `expectedRevision`.
 */
export type ScenarioRemoveOutcome =
	| { status: 'removed' }
	| { status: 'conflict'; activeRun: ScenarioRun | null; revision: number | null };

export type ScenarioSaveOutcome = ScenarioCommitOutcome | ScenarioSaveConflict;

/**
 * Returned by `commitTerminalRun` when an `expectedRevision` compare-and-swap
 * did not match the stored active run's revision. The terminal result is not
 * recorded and the active run is left untouched; `activeRun` is the persisted
 * run so the caller can reconcile (refresh a stale results dialog). When the
 * expected run is gone, `activeRun` is `null`. `revision` is the stored
 * record's revision (or `null` when no run is stored).
 */
export interface ScenarioTerminalConflict {
	status: 'conflict';
	activeRun: ScenarioRun | null;
	revision: number | null;
}

export type ScenarioCommitRunOutcome = ScenarioCommitOutcome | ScenarioTerminalConflict;

export interface ScenarioSaveOptions {
	/**
	 * Overwrite a different active run (by `runId`) without returning a
	 * conflict. Without this flag, a save whose `runId` differs from the
	 * stored run's is refused. Same-`runId` saves always proceed.
	 */
	replace?: boolean;
	/**
	 * Compare-and-swap identity. When provided, the save is refused with a
	 * `ScenarioSaveConflict` unless the currently stored run matches this
	 * identity: `null` means the scenario must have no stored active run,
	 * a string means the stored run's `runId` must equal it. This check is
	 * independent of `replace` — `replace: true` alone no longer bypasses
	 * identity verification when `expectedRunId` is supplied. Use this to
	 * bind a replacement to the run the caller actually inspected (restart,
	 * confirmed import) so a newer run written between the caller's read
	 * and this save is not silently clobbered.
	 */
	expectedRunId?: string | null;
	/**
	 * Compare-and-swap revision. When provided, the save is refused with a
	 * `ScenarioSaveConflict` unless the stored record's `revision` equals
	 * this value. `0` means the caller expects no stored run (or a
	 * pre-revision record); `N > 0` means the caller expects the stored run
	 * at revision `N`. This guards against the same-`runId` race where two
	 * tabs resume the same run: the first tab's write advances the stored
	 * revision, so the second tab's save (bound to the stale revision it
	 * loaded) is refused instead of silently rolling back the first tab's
	 * progress. On a matching write the stored revision is incremented.
	 */
	expectedRevision?: number;
}

export interface ScenarioCommitTerminalOptions {
	/**
	 * Compare-and-swap revision for the active run being terminated. When
	 * provided, the commit is refused with a `ScenarioTerminalConflict`
	 * unless the stored active run's `revision` equals this value. This
	 * prevents a stale terminal result (computed from obsolete game state)
	 * from clearing the active entry or recording a best result when another
	 * tab has since advanced the same run. The revision is read alongside
	 * the run via `loadActiveRunWithRevision`.
	 */
	expectedRevision?: number;
}

export interface ScenarioRemoveOptions {
	/**
	 * Compare-and-swap identity. See ScenarioSaveOptions.expectedRunId.
	 */
	expectedRunId?: string | null;
	/**
	 * Compare-and-swap revision. See ScenarioSaveOptions.expectedRevision.
	 */
	expectedRevision?: number;
}

export interface ScenarioRepository {
	getSummary(): Promise<ScenarioPersistenceSummary>;
	loadActiveRun(scenarioId: ScenarioId): Promise<ScenarioRun | null>;
	/**
	 * Load an active run together with its stored `revision`, so the caller
	 * can bind subsequent writes to the revision it observed via
	 * `ScenarioSaveOptions.expectedRevision` /
	 * `ScenarioCommitTerminalOptions.expectedRevision`. Returns `null` when
	 * the scenario has no stored active run.
	 */
	loadActiveRunWithRevision(scenarioId: ScenarioId): Promise<LoadedScenarioRun | null>;
	/**
	 * Persist an active run. When a different active run (by `runId`) already
	 * exists for the scenario, the call returns a `ScenarioSaveConflict`
	 * unless `options.replace` is `true`, in which case the existing run is
	 * overwritten. Same-`runId` saves always proceed (normal in-game evolution).
	 * When `options.expectedRunId` is provided, the save is additionally
	 * refused unless the stored run matches that identity, even with
	 * `replace: true`. When `options.expectedRevision` is provided, the save
	 * is additionally refused unless the stored record's revision matches,
	 * and the stored revision is incremented on a matching write.
	 */
	saveActiveRun(run: ScenarioRun, options?: ScenarioSaveOptions): Promise<ScenarioSaveOutcome>;
	/**
	 * Remove the active run for a scenario. When `options.expectedRunId` is
	 * provided, the removal is refused if the stored run's `runId` does not
	 * match, returning `{ status: 'conflict', activeRun, revision }`. When
	 * `options.expectedRevision` is provided, the removal is additionally
	 * refused unless the stored record's `revision` matches, preventing a
	 * stale tab from deleting a newer revision of the same run written by
	 * another tab. Without options the removal is unconditional
	 * (backwards-compatible with callers that have already verified identity
	 * or accept best-effort cleanup).
	 */
	removeActiveRun(
		scenarioId: ScenarioId,
		options?: ScenarioRemoveOptions
	): Promise<ScenarioRemoveOutcome>;
	/**
	 * Commit a terminal run: clear the active entry when it is the same run
	 * instance (by `runId`) and record the best result when eligible. When
	 * `options.expectedRevision` is provided, the commit is refused with a
	 * `ScenarioTerminalConflict` unless the stored active run's revision
	 * matches, preventing a stale terminal result from clobbering a run that
	 * another tab has since advanced.
	 */
	commitTerminalRun(
		run: ScenarioRun,
		options?: ScenarioCommitTerminalOptions
	): Promise<ScenarioCommitRunOutcome>;
}
