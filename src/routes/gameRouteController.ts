import type { SfxCueId } from '$lib/audio/audioCatalog';
import { deeplyEqual } from '$lib/game/equality';
import { isDecisionFailureCode } from '$lib/game/eventEffects';
import {
	borrow,
	payOffLoan,
	refinanceLoan,
	repayLoan,
	type FinanceFailureCode
} from '$lib/game/finance';
import {
	buildIndustrialBuilding,
	financeIndustrialBuilding,
	upgradeBuilding
} from '$lib/game/industryPlacement';
import {
	createFoundingGameAtTile,
	financeRetailStoreOpening,
	openStoreAtTile
} from '$lib/game/placement';
import { buildRail, demolishRailSegment, upgradeRailSegment } from '$lib/game/railPlacement';
import {
	setRetailSupplySource as setRetailSupplySourceTransition,
	type RetailSupplyAssignmentFailure
} from '$lib/game/retailSupply';
import { simulateDay } from '$lib/game/simulateDay';
import { assignStaffToStore, hireCandidate, promoteStaff, unassignStaff } from '$lib/game/staffing';
import {
	resolveDecision,
	updatePolicy,
	upgradeStore,
	type DecisionResolutionResult
} from '$lib/game/state';
import { updateStoreProduct } from '$lib/game/stock';
import type {
	ArchetypeId,
	City,
	CompanyPolicy,
	GameState,
	IndustrialBuildingTypeId,
	LoanTermDays,
	WorldCityId
} from '$lib/game/types';
import {
	openWorldCity as openWorldCityTransition,
	financeWorldCityOpening,
	selectWorldCity as selectWorldCityTransition
} from '$lib/game/world';
import type { SaveRepository } from '$lib/persistence/saveRepository';
import type { SaveSlotMetadata, SaveSummary } from '$lib/persistence/saveTypes';
import type {
	ScenarioCommitRunOutcome,
	ScenarioRepository,
	ScenarioSaveOutcome,
	ScenarioTerminalConflict
} from '$lib/persistence/scenarioRepository';
import {
	ScenarioCommandGate,
	runImmediateSandboxOperation,
	runPersistenceGatedOperation
} from '$lib/scenarios/commandGate';
import {
	abandonScenario as abandonScenarioTransition,
	executeScenarioCommand,
	restartScenario as restartScenarioTransition,
	startScenario as startScenarioTransition
} from '$lib/scenarios/runtime';
import type {
	ScenarioCommand,
	ScenarioCommitOutcome,
	ScenarioDefinition,
	ScenarioDefinitionRef,
	ScenarioId,
	ScenarioOperationError,
	ScenarioPersistenceSummary,
	ScenarioResult,
	ScenarioRun
} from '$lib/scenarios/types';

export interface GameRouteControllerState {
	sandboxGame: GameState | null;
	activeScenarioRun: ScenarioRun | null;
	/**
	 * The persisted `revision` of the currently active scenario run, tracked
	 * alongside `activeScenarioRun` so `commitMutation` can bind writes to it
	 * via `ScenarioSaveOptions.expectedRevision` /
	 * `ScenarioCommitTerminalOptions.expectedRevision`. `null` when no run is
	 * active or when the revision is unknown (e.g. a conflict surfaced a run
	 * whose revision has not been re-read). The repository increments the
	 * stored revision on every successful write, so two tabs resuming the same
	 * run (which share its `runId`) cannot silently roll back each other's
	 * progress: the first tab's write advances the revision, and the second
	 * tab's save (bound to the stale revision it loaded) is refused.
	 */
	activeScenarioRevision: number | null;
	lastScenarioResult: ScenarioResult | null;
	lastScenarioBestUpdated: boolean;
	scenarioOperationError: ScenarioOperationError | null;
	retryScenarioOperation: (() => Promise<void>) | null;
	playMode: 'sandbox' | 'scenario';
	scenarioCommandPending: boolean;
	scenariosReady: boolean;
}

export interface MutationAvailability {
	pending: boolean;
	advanceDay: boolean;
	resolveDecision: boolean;
	updatePolicy: boolean;
	openWorldCity: boolean;
	setRetailSupplySource: boolean;
	openStore: boolean;
	upgradeStore: boolean;
	hireStaff: boolean;
	assignStaff: boolean;
	unassignStaff: boolean;
	promoteStaff: boolean;
	updateStoreSellingPrice: boolean;
	updateStoreInventoryTargets: boolean;
	buildIndustrialBuilding: boolean;
	upgradeIndustrialBuilding: boolean;
	buildRail: boolean;
	upgradeRail: boolean;
	demolishRail: boolean;
	borrow: boolean;
	repayLoan: boolean;
	payOffLoan: boolean;
	refinanceLoan: boolean;
	financeWorldCity: boolean;
	financeRetailStore: boolean;
	financeIndustrialBuilding: boolean;
}

export function createMutationAvailability(input: {
	playMode: 'sandbox' | 'scenario';
	pending: boolean;
	definition: ScenarioDefinition | null;
}): MutationAvailability {
	const available = (kind: ScenarioCommand['kind']) =>
		input.playMode === 'sandbox' ||
		(!input.pending &&
			input.definition !== null &&
			input.definition.allowedCommands.includes(kind));
	return {
		pending: input.playMode === 'scenario' && input.pending,
		advanceDay: available('advanceDay'),
		resolveDecision: available('resolveDecision'),
		updatePolicy: available('updatePolicy'),
		openWorldCity: available('openWorldCity'),
		setRetailSupplySource: available('setRetailSupplySource'),
		openStore: available('openStore'),
		upgradeStore: available('upgradeStore'),
		hireStaff: available('hireStaff'),
		assignStaff: available('assignStaff'),
		unassignStaff: available('unassignStaff'),
		promoteStaff: available('promoteStaff'),
		updateStoreSellingPrice: available('updateStoreSellingPrice'),
		updateStoreInventoryTargets: available('updateStoreInventoryTargets'),
		buildIndustrialBuilding: available('buildIndustrialBuilding'),
		upgradeIndustrialBuilding: available('upgradeIndustrialBuilding'),
		buildRail: available('buildRail'),
		upgradeRail: available('upgradeRail'),
		demolishRail: available('demolishRail'),
		borrow: available('borrow'),
		repayLoan: available('repayLoan'),
		payOffLoan: available('payOffLoan'),
		refinanceLoan: available('refinanceLoan'),
		financeWorldCity: available('financeWorldCity'),
		financeRetailStore: available('financeRetailStore'),
		financeIndustrialBuilding: available('financeIndustrialBuilding')
	};
}

export type { GameRouteCommitResult } from '$lib/game/commandResult';
import type { GameRouteCommitResult } from '$lib/game/commandResult';

export type SandboxLoadResult = 'loaded' | 'missing' | 'unavailable';

export interface GameRouteControllerOptions {
	createSaveRepository(): Promise<SaveRepository>;
	createScenarioRepository(): Promise<ScenarioRepository>;
	resolveScenarioDefinition(ref: ScenarioDefinitionRef): ScenarioDefinition | undefined;
	playSfx(cueId: SfxCueId): void;
	onStateChange?(state: Readonly<GameRouteControllerState>): void;
	onSaveRepositoryReady?(repository: SaveRepository): void;
	onSaveSummary?(summary: SaveSummary): void;
	onScenarioSummary?(summary: import('$lib/scenarios/types').ScenarioPersistenceSummary): void;
	onScenarioTerminalRun?(run: ScenarioRun): void;
	onAutoSave?(metadata: SaveSlotMetadata): void;
	onAutoSaveError?(error: unknown): void;
	onReadOnlySelection?(kind: 'retail' | 'industry', tileId: string): void;
}

type RouteTransitionResult<TReceipt = undefined> =
	| { ok: true; game: GameState; receipt: TReceipt }
	| { ok: false; code: FinanceFailureCode; context: Record<string, string | number> }
	| {
			ok: false;
			decisionFailure: Extract<DecisionResolutionResult, { ok: false }>;
	  };

interface RouteGameMutation {
	transition(
		currentGame: GameState | null
	): GameState | RouteTransitionResult<unknown> | DecisionResolutionResult;
	scenarioCommand?: ScenarioCommand;
	cueId?: SfxCueId;
	allowMissingSandboxGame?: boolean;
}

function normalizeRouteTransition(
	result: GameState | RouteTransitionResult<unknown> | DecisionResolutionResult
): RouteTransitionResult<unknown> {
	if ('ok' in result) {
		if (result.ok && 'decisionKind' in result) {
			return { ok: true, game: result.game, receipt: undefined };
		}
		if (!result.ok && 'game' in result && isDecisionFailureCode(result.code)) {
			return {
				ok: false,
				decisionFailure: result as Extract<DecisionResolutionResult, { ok: false }>
			};
		}
		return result as RouteTransitionResult<unknown>;
	}
	return { ok: true, game: result, receipt: undefined };
}

interface FoundStoreInput {
	archetypeId: ArchetypeId;
	city: City;
	tileId: string;
	seed: number;
}

interface RailInput {
	originBuildingId: string;
	waypoints: Array<{ x: number; y: number }>;
	destinationBuildingId: string;
}

/**
 * The prepared value carried from `commitMutation`'s prepare step to its
 * persist step. It pairs the executed `ScenarioRun` with the scenario
 * revision the controller observed at prepare time, so the persist step can
 * bind its `saveActiveRun` / `commitTerminalRun` write to that revision via
 * `expectedRevision`. This is what prevents two tabs resuming the same run
 * (which share its `runId`) from silently rolling back each other's
 * progress: the first tab's write advances the stored revision, and the
 * second tab's save (bound to the stale revision it loaded) is refused.
 * `null` means the revision is unknown (e.g. a conflict surfaced a run whose
 * revision has not been re-read); the persist step then omits the CAS option
 * rather than bind a stale token.
 */
interface PreparedScenarioRun {
	run: ScenarioRun;
	expectedRevision: number | null;
}

const INITIAL_STATE: GameRouteControllerState = {
	sandboxGame: null,
	activeScenarioRun: null,
	activeScenarioRevision: null,
	lastScenarioResult: null,
	lastScenarioBestUpdated: false,
	scenarioOperationError: null,
	retryScenarioOperation: null,
	playMode: 'sandbox',
	scenarioCommandPending: false,
	scenariosReady: false
};

function scenarioError(code: ScenarioOperationError['code']): ScenarioOperationError {
	return { code, diagnostics: [] };
}

function isSaveConflict(
	outcome: ScenarioSaveOutcome
): outcome is { status: 'conflict'; activeRun: ScenarioRun | null; revision: number | null } {
	return (
		typeof outcome === 'object' &&
		outcome !== null &&
		'status' in outcome &&
		outcome.status === 'conflict'
	);
}

function isTerminalConflict(
	outcome: ScenarioCommitRunOutcome
): outcome is ScenarioTerminalConflict {
	return (
		typeof outcome === 'object' &&
		outcome !== null &&
		'status' in outcome &&
		outcome.status === 'conflict'
	);
}

export class GameRouteController {
	private currentState: GameRouteControllerState = { ...INITIAL_STATE };
	private saveRepository: SaveRepository | null = null;
	private scenarioRepository: ScenarioRepository | null = null;
	private readonly scenarioCommandGate = new ScenarioCommandGate();
	private scenarioRetryEpoch = 0;
	private lastScenarioSummary: ScenarioPersistenceSummary | null = null;

	constructor(private readonly options: GameRouteControllerOptions) {}

	get state(): Readonly<GameRouteControllerState> {
		return this.currentState;
	}

	get game(): GameState | null {
		return this.currentState.playMode === 'scenario'
			? (this.currentState.activeScenarioRun?.game ?? null)
			: this.currentState.sandboxGame;
	}

	async initializeSaves(): Promise<void> {
		const repository = await this.options.createSaveRepository();
		this.saveRepository = repository;
		this.options.onSaveRepositoryReady?.(repository);

		if (this.currentState.sandboxGame) {
			await this.saveAuto(this.currentState.sandboxGame);
			return;
		}

		this.options.onSaveSummary?.(await repository.getSummary());
	}

	async initializeScenarios(): Promise<void> {
		try {
			const repository = await this.options.createScenarioRepository();
			this.scenarioRepository = repository;
			const summary = await repository.getSummary();
			this.publishScenarioSummary(summary);
			if (summary.diagnostics.length > 0) {
				// One or more persisted records were malformed, but the codec and
				// repository return the valid siblings alongside diagnostics. Gate
				// the catalog on those valid records rather than locking every
				// start/resume/restart/import action — retry stays available for
				// transient read errors, and the diagnostics surface to the user.
				this.patchState({
					scenarioOperationError: {
						code: 'persistence-read-failed',
						diagnostics: summary.diagnostics
					},
					retryScenarioOperation: this.createScenarioRetry(() => this.initializeScenarios())
				});
			} else {
				this.dismissScenarioOperationError();
			}

			const resumedEntry = Object.entries(summary.activeRunsByScenarioId)
				.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
				.map(([scenarioId, run]) => (run ? { scenarioId: scenarioId as ScenarioId, run } : null))
				.find((entry): entry is { scenarioId: ScenarioId; run: ScenarioRun } => entry !== null);
			if (resumedEntry) {
				// If the user has already loaded a sandbox save while scenario
				// initialization was awaiting persistence, preserve that explicit
				// selection — only stage the resumed run for later scenario resume
				// without overriding playMode or the sandbox game.
				const sandboxAlreadySelected = this.currentState.sandboxGame !== null;
				// Re-read the single record to get an atomic run/revision pair.
				// The summary does not carry revisions, and — more importantly —
				// the summary's run was read in a separate earlier `getSummary()`
				// call. Another browser tab or Tauri window sharing this run's
				// `runId` can advance it between that summary read and this
				// re-read. Staging the summary's (stale) run alongside the
				// re-read's (newer) revision would let the next command bind the
				// new revision while computing its transition from stale state,
				// silently rolling back the other tab's progress. Use the run and
				// revision from the same `loadActiveRunWithRevision()` result so
				// they are consistent. When the re-read returns null the run was
				// removed between the two reads; do not stage a stale run — fall
				// through to the no-resumed-run path. A failed read is
				// best-effort: stage the summary's run with a null revision so
				// the first command's CAS is skipped (no regression from
				// pre-revision behavior) and a later save sets it.
				let stagedRun: ScenarioRun | null = resumedEntry.run;
				let stagedRevision: number | null = null;
				try {
					const loaded = await repository.loadActiveRunWithRevision(resumedEntry.scenarioId);
					if (loaded) {
						stagedRun = loaded.run;
						stagedRevision = loaded.revision;
					} else {
						stagedRun = null;
					}
				} catch {
					// Leave stagedRun as the summary's run and stagedRevision null.
				}
				if (stagedRun) {
					this.patchState({
						activeScenarioRun: stagedRun,
						activeScenarioRevision: stagedRevision,
						lastScenarioResult: null,
						lastScenarioBestUpdated: false,
						playMode: sandboxAlreadySelected ? this.currentState.playMode : 'scenario',
						scenariosReady: true
					});
				} else {
					// The re-read returned no record: the run was removed between
					// the summary read and this re-read (another tab abandoned it,
					// or a terminal commit cleared it). Clear any previously active
					// run staged by a prior initialization attempt — pairing a
					// stale in-memory run with a null revision would let a later
					// command's re-read resurrect it or clobber a replacement.
					this.patchState({
						scenariosReady: true,
						activeScenarioRun: null,
						activeScenarioRevision: null
					});
				}
			} else {
				// No active runs in the summary. Clear any previously active run
				// staged by a prior initialization attempt so a stale in-memory
				// run is not paired with a null revision.
				this.patchState({
					scenariosReady: true,
					activeScenarioRun: null,
					activeScenarioRevision: null
				});
			}
		} catch {
			this.patchState({
				scenarioOperationError: scenarioError('persistence-read-failed'),
				retryScenarioOperation: this.createScenarioRetry(() => this.initializeScenarios())
			});
		}
	}

	loadSandboxGame(game: GameState, cueId?: SfxCueId): void {
		this.patchState({
			sandboxGame: game,
			playMode: 'sandbox',
			scenarioOperationError: null,
			retryScenarioOperation: null
		});
		if (cueId) {
			this.options.playSfx(cueId);
		}
	}

	async resumeAutoSave(): Promise<SandboxLoadResult> {
		if (!this.saveRepository) return 'unavailable';
		const saved = await this.saveRepository.getAutoSave();
		if (!saved) return 'missing';
		this.loadSandboxGame(saved.game, 'sfx.save.loaded');
		return 'loaded';
	}

	async loadManualSave(slotId: string): Promise<SandboxLoadResult> {
		if (!this.saveRepository) return 'unavailable';
		const saved = await this.saveRepository.loadManualSlot(slotId);
		if (!saved) return 'missing';
		this.loadSandboxGame(saved.game, 'sfx.save.loaded');
		return 'loaded';
	}

	selectReadOnlyTile(kind: 'retail' | 'industry', tileId: string): void {
		this.options.onReadOnlySelection?.(kind, tileId);
	}

	dismissScenarioOperationError(): void {
		if (
			this.currentState.scenarioOperationError === null &&
			this.currentState.retryScenarioOperation === null
		) {
			return;
		}
		this.patchState({ scenarioOperationError: null, retryScenarioOperation: null });
	}

	async startScenarioRun(
		definition: ScenarioDefinition,
		seed: number,
		confirmed?: boolean,
		expectedRunId?: string | null,
		expectedRevision?: number | null
	): Promise<GameRouteCommitResult> {
		if (this.currentState.scenarioCommandPending) return { status: 'busy' };

		const started = startScenarioTransition(definition, seed);
		if (!started.ok) {
			this.patchState({
				scenarioOperationError: started.error,
				retryScenarioOperation: null
			});
			return { status: 'rejected' };
		}
		const repository = this.scenarioRepository;
		if (!repository) {
			this.patchState({
				scenarioOperationError: scenarioError('persistence-write-failed'),
				retryScenarioOperation: null
			});
			return { status: 'unavailable' };
		}

		this.patchState({ scenarioCommandPending: true });
		let phase: 'read' | 'write' = 'read';
		try {
			const existingRecord = await repository.loadActiveRunWithRevision(definition.id);
			const existing = existingRecord?.run ?? null;
			if (existing && !confirmed) {
				this.patchState({
					scenarioCommandPending: false,
					scenarioOperationError: null,
					retryScenarioOperation: null
				});
				// Surface the existing run's identity AND the revision observed
				// at this read so the caller can bind the confirmed write to
				// both. Binding only the runId would let a concurrent tab
				// advance the same run (runId unchanged, revision bumped)
				// between this dialog opening and the confirm click: the
				// confirmed call re-reads the now-bumped revision, the runId
				// check passes, the fresh-revision check passes, and the
				// replacement silently clobbers the other tab's progress.
				// Carrying the revision through the token makes the confirmed
				// write bind to the stale revision, so the CAS refuses and
				// re-surfaces confirmation with the newer token.
				return {
					status: 'confirmation-required',
					expectedRunId: existing.runId,
					expectedRevision: existingRecord?.revision ?? null
				};
			}
			phase = 'write';
			// Determine the compare-and-swap identity for the write. When the
			// caller confirmed replacement, bind to the (runId, revision) pair
			// they confirmed against (passed back from the
			// confirmation-required result). When the caller did not supply an
			// expectedRunId (programmatic callers / fresh start), fall back to
			// the identity just read so the narrow read-to-write race is still
			// protected. When there was no existing run, expect absence (null)
			// so a run appearing between the read and the write is not silently
			// clobbered.
			const casExpectedRunId =
				confirmed && expectedRunId !== undefined ? expectedRunId : (existing?.runId ?? null);
			// Bind the write to the revision the caller confirmed against when
			// supplied; otherwise bind to the revision just read. `0` means no
			// run was stored. When the caller confirmed against a stale
			// revision (another tab advanced the same run between dialog-open
			// and confirm-click), the CAS fails and re-surfaces confirmation
			// with the newer revision instead of silently clobbering.
			const casExpectedRevision =
				confirmed && expectedRevision !== undefined && expectedRevision !== null
					? expectedRevision
					: (existingRecord?.revision ?? 0);
			const outcome = await repository.saveActiveRun(started.value, {
				replace: true,
				expectedRunId: casExpectedRunId,
				expectedRevision: casExpectedRevision
			});
			if (isSaveConflict(outcome)) {
				this.patchState({
					activeScenarioRun: outcome.activeRun,
					activeScenarioRevision: outcome.revision,
					scenarioCommandPending: false,
					scenarioOperationError: null,
					retryScenarioOperation: null
				});
				await this.refreshScenarioSummary();
				return {
					status: 'confirmation-required',
					expectedRunId: outcome.activeRun?.runId ?? null,
					expectedRevision: outcome.revision
				};
			}
			// The repository incremented the stored revision on the matching
			// write; track it so the next command's CAS binds to it.
			const nextRevision = casExpectedRevision + 1;
			this.patchState({
				activeScenarioRun: outcome.activeRun,
				activeScenarioRevision: nextRevision,
				lastScenarioResult: null,
				lastScenarioBestUpdated: false,
				playMode: 'scenario',
				scenarioCommandPending: false,
				scenarioOperationError: null,
				retryScenarioOperation: null
			});
			// Refresh the catalog summary so previously-started active runs
			// remain resumable after a new run is started in the same session.
			await this.refreshScenarioSummary();
			return { status: 'committed' };
		} catch {
			this.patchState({
				scenarioCommandPending: false,
				scenarioOperationError: scenarioError(
					phase === 'read' ? 'persistence-read-failed' : 'persistence-write-failed'
				),
				retryScenarioOperation: this.createScenarioRetry(async () => {
					await this.startScenarioRun(definition, seed, confirmed, expectedRunId, expectedRevision);
				})
			});
			return { status: 'failed' };
		}
	}

	async resumeScenarioRun(
		scenarioId: ScenarioRun['definition']['scenarioId']
	): Promise<GameRouteCommitResult> {
		const repository = this.scenarioRepository;
		if (!repository) {
			this.patchState({
				scenarioOperationError: scenarioError('persistence-read-failed'),
				retryScenarioOperation: null
			});
			return { status: 'unavailable' };
		}
		if (this.currentState.scenarioCommandPending) return { status: 'busy' };

		this.patchState({ scenarioCommandPending: true });
		try {
			const loaded = await repository.loadActiveRunWithRevision(scenarioId);
			if (!loaded) {
				this.patchState({
					scenarioCommandPending: false,
					scenarioOperationError: scenarioError('missing-run'),
					retryScenarioOperation: null
				});
				return { status: 'unavailable' };
			}
			const run = loaded.run;
			// If the loaded run is content-identical to the currently active one,
			// keep the ScenarioRun object reference stable while reactivating scenario
			// mode. The route synchronizer keys transient-view-state resets on the run
			// reference, so preserving it means resume-same-run keeps armed placements,
			// open inspectors, and selection state intact. Preserve the freshly-read
			// revision so the next command's CAS binds to the persisted revision
			// instead of a stale in-memory one.
			const current = this.currentState.activeScenarioRun;
			if (current && deeplyEqual(current, run)) {
				this.patchState({
					activeScenarioRevision: loaded.revision,
					playMode: 'scenario',
					scenarioCommandPending: false,
					scenarioOperationError: null,
					retryScenarioOperation: null
				});
				return { status: 'committed' };
			}
			this.patchState({
				activeScenarioRun: run,
				activeScenarioRevision: loaded.revision,
				lastScenarioResult: null,
				lastScenarioBestUpdated: false,
				playMode: 'scenario',
				scenarioCommandPending: false,
				scenarioOperationError: null,
				retryScenarioOperation: null
			});
			return { status: 'committed' };
		} catch {
			this.patchState({
				scenarioCommandPending: false,
				scenarioOperationError: scenarioError('persistence-read-failed'),
				retryScenarioOperation: this.createScenarioRetry(async () => {
					await this.resumeScenarioRun(scenarioId);
				})
			});
			return { status: 'failed' };
		}
	}

	async restartScenarioRun(ref: ScenarioDefinitionRef): Promise<GameRouteCommitResult> {
		const repository = this.scenarioRepository;
		if (!repository) {
			this.patchState({
				scenarioOperationError: scenarioError('persistence-read-failed'),
				retryScenarioOperation: null
			});
			return { status: 'unavailable' };
		}
		if (this.currentState.scenarioCommandPending) return { status: 'busy' };

		this.patchState({ scenarioCommandPending: true });
		let phase: 'read' | 'write' = 'read';
		try {
			const loaded = await repository.loadActiveRunWithRevision(ref.scenarioId);
			const run = loaded?.run ?? null;
			const loadedRevision = loaded?.revision ?? null;
			if (
				!run ||
				run.definition.scenarioId !== ref.scenarioId ||
				run.definition.version !== ref.version
			) {
				this.patchState({
					activeScenarioRevision: loadedRevision,
					scenarioCommandPending: false,
					scenarioOperationError: scenarioError(run ? 'stale-definition' : 'missing-run'),
					retryScenarioOperation: null
				});
				return { status: 'unavailable' };
			}
			const definition = this.options.resolveScenarioDefinition(ref);
			if (!definition) {
				this.patchState({
					scenarioCommandPending: false,
					scenarioOperationError: scenarioError('stale-definition'),
					retryScenarioOperation: null
				});
				return { status: 'rejected' };
			}
			const restarted = restartScenarioTransition(run, definition);
			if (!restarted.ok) {
				this.patchState({
					scenarioCommandPending: false,
					scenarioOperationError: restarted.error,
					retryScenarioOperation: null
				});
				return { status: 'rejected' };
			}
			phase = 'write';
			// Bind the replacement to the run the user actually inspected by
			// passing its runId as the compare-and-swap identity. If another
			// tab replaced or removed this run between the read above and the
			// write, the save is refused with a conflict instead of silently
			// clobbering the newer run. `replace: true` is still needed because
			// the restarted run has a fresh runId (restart preserves version and
			// seed but generates a new identity), so the runId-difference guard
			// would otherwise refuse the save. Bind the revision too so a
			// concurrent tab that advanced the same run between read and write
			// is refused instead of clobbering the newer state.
			const expectedRevision = loadedRevision ?? 0;
			const outcome = await repository.saveActiveRun(restarted.value, {
				replace: true,
				expectedRunId: run.runId,
				expectedRevision
			});
			if (isSaveConflict(outcome)) {
				this.patchState({
					activeScenarioRun: outcome.activeRun,
					activeScenarioRevision: outcome.revision,
					scenarioCommandPending: false,
					scenarioOperationError: null,
					retryScenarioOperation: null
				});
				await this.refreshScenarioSummary();
				return { status: 'confirmation-required' };
			}
			// The repository incremented the stored revision on the matching write.
			const nextRevision = expectedRevision + 1;
			this.patchState({
				activeScenarioRun: outcome.activeRun,
				activeScenarioRevision: nextRevision,
				lastScenarioResult: null,
				lastScenarioBestUpdated: false,
				playMode: 'scenario',
				scenarioCommandPending: false,
				scenarioOperationError: null,
				retryScenarioOperation: null
			});
			await this.refreshScenarioSummary();
			return { status: 'committed' };
		} catch {
			this.patchState({
				scenarioCommandPending: false,
				scenarioOperationError: scenarioError(
					phase === 'read' ? 'persistence-read-failed' : 'persistence-write-failed'
				),
				retryScenarioOperation: this.createScenarioRetry(async () => {
					await this.restartScenarioRun(ref);
				})
			});
			return { status: 'failed' };
		}
	}

	async importScenarioRun(
		definition: ScenarioDefinition,
		seed: number,
		confirmed: boolean,
		expectedRunId?: string | null,
		expectedRevision?: number | null
	): Promise<GameRouteCommitResult> {
		const repository = this.scenarioRepository;
		if (!repository) return { status: 'unavailable' };
		if (this.currentState.scenarioCommandPending) return { status: 'busy' };

		this.patchState({ scenarioCommandPending: true });
		let phase: 'read' | 'write' = 'read';
		try {
			const existingRecord = await repository.loadActiveRunWithRevision(definition.id);
			const existing = existingRecord?.run ?? null;
			if (existing && !confirmed) {
				this.patchState({
					scenarioCommandPending: false,
					scenarioOperationError: null,
					retryScenarioOperation: null
				});
				// Surface the existing run's identity AND the revision observed
				// at this read so the caller can bind the confirmed write to
				// both. See startScenarioRun for the same-runId race rationale.
				return {
					status: 'confirmation-required',
					expectedRunId: existing.runId,
					expectedRevision: existingRecord?.revision ?? null
				};
			}
			const started = startScenarioTransition(definition, seed);
			if (!started.ok) {
				this.patchState({
					scenarioCommandPending: false,
					scenarioOperationError: started.error,
					retryScenarioOperation: null
				});
				return { status: 'rejected' };
			}
			phase = 'write';
			// Determine the compare-and-swap identity for the write. When the
			// caller confirmed replacement, bind to the (runId, revision) pair
			// they confirmed against (passed back from the
			// confirmation-required result). When the caller did not supply an
			// expectedRunId (backwards-compatible programmatic callers), fall
			// back to the identity just read so the narrow read-to-write race
			// is still protected. When there was no existing run, expect
			// absence (null) so a run appearing between the read and the write
			// is not silently clobbered.
			const casExpectedRunId =
				confirmed && expectedRunId !== undefined ? expectedRunId : (existing?.runId ?? null);
			// Bind the write to the revision the caller confirmed against when
			// supplied; otherwise bind to the revision just read. `0` means no
			// run was stored. See startScenarioRun for the stale-revision
			// race rationale.
			const casExpectedRevision =
				confirmed && expectedRevision !== undefined && expectedRevision !== null
					? expectedRevision
					: (existingRecord?.revision ?? 0);
			const outcome = await repository.saveActiveRun(started.value, {
				replace: true,
				expectedRunId: casExpectedRunId,
				expectedRevision: casExpectedRevision
			});
			if (isSaveConflict(outcome)) {
				this.patchState({
					activeScenarioRun: outcome.activeRun,
					activeScenarioRevision: outcome.revision,
					scenarioCommandPending: false,
					scenarioOperationError: null,
					retryScenarioOperation: null
				});
				await this.refreshScenarioSummary();
				return {
					status: 'confirmation-required',
					expectedRunId: outcome.activeRun?.runId ?? null,
					expectedRevision: outcome.revision
				};
			}
			// The repository incremented the stored revision on the matching write.
			const nextRevision = casExpectedRevision + 1;
			this.patchState({
				activeScenarioRun: outcome.activeRun,
				activeScenarioRevision: nextRevision,
				lastScenarioResult: null,
				lastScenarioBestUpdated: false,
				playMode: 'scenario',
				scenarioCommandPending: false,
				scenarioOperationError: null,
				retryScenarioOperation: null
			});
			await this.refreshScenarioSummary();
			return { status: 'committed' };
		} catch {
			this.patchState({
				scenarioCommandPending: false,
				scenarioOperationError: scenarioError(
					phase === 'read' ? 'persistence-read-failed' : 'persistence-write-failed'
				),
				retryScenarioOperation: this.createScenarioRetry(async () => {
					await this.importScenarioRun(
						definition,
						seed,
						confirmed,
						expectedRunId,
						expectedRevision
					);
				})
			});
			return { status: 'failed' };
		}
	}

	returnToSandbox(): void {
		this.patchState({
			playMode: 'sandbox',
			scenarioOperationError: null,
			retryScenarioOperation: null
		});
	}

	async abandonScenarioRun(): Promise<GameRouteCommitResult> {
		const run = this.currentState.activeScenarioRun;
		const repository = this.scenarioRepository;
		if (!run || !repository) return { status: 'unavailable' };
		if (this.currentState.scenarioCommandPending) return { status: 'busy' };

		this.patchState({ scenarioCommandPending: true });
		try {
			// Abandonment is a terminal transition: it freezes pending
			// objectives as missed, produces a ScenarioResult with outcome
			// 'abandoned', and removes the run from resumable persistence via
			// the same revision-bound terminal commit path as completed/failed
			// runs. The domain transition produces the terminal run; the
			// repository's commitTerminalRun clears the active entry and
			// records the result (best-result replacement is refused for
			// non-completed outcomes by shouldReplaceBestResult, so abandoned
			// runs never replace a best record).
			//
			// When the tracked revision is null (init read failure,
			// post-terminal replacement, or re-init after removal), do NOT
			// call commitTerminalRun with an undefined expectedRevision — that
			// would omit the revision CAS and clear the active entry on runId
			// alone. Another tab can advance the same run (same runId, bumped
			// revision, different game state) between this tab's last
			// observation and the abandon; the runId check passes and the
			// stale tab clobbers the newer revision. Mirror the atomic reread
			// used by commitMutation's slow path: re-read an atomic
			// run/revision pair, verify the runId AND the full run state still
			// match the in-memory run, then bind the terminal commit to the
			// loaded revision. If the reread fails or differs, preserve and
			// surface the stored run rather than committing a stale terminal.
			let casExpectedRevision: number | undefined =
				this.currentState.activeScenarioRevision ?? undefined;
			if (casExpectedRevision === undefined) {
				const reloaded = await repository.loadActiveRunWithRevision(run.definition.scenarioId);
				if (!reloaded) {
					// The run was removed between this tab's last observation
					// and the reread (another tab abandoned it, or a terminal
					// commit cleared it). Surface the absence as a conflict
					// so the UI reconciles to the stored state instead of
					// claiming a successful abandon that did nothing.
					this.patchState({
						activeScenarioRun: null,
						activeScenarioRevision: null,
						lastScenarioResult: null,
						lastScenarioBestUpdated: false,
						scenarioCommandPending: false,
						scenarioOperationError: null,
						retryScenarioOperation: null
					});
					await this.refreshScenarioSummary();
					return { status: 'confirmation-required' };
				}
				if (reloaded.run.runId !== run.runId || !deeplyEqual(reloaded.run, run)) {
					// Another tab advanced the same run (same runId, newer
					// revision, different game state) or replaced it (different
					// runId). Surface the preserved stored run so the UI can
					// offer Resume instead of silently committing a stale
					// terminal over newer progress.
					this.patchState({
						activeScenarioRun: reloaded.run,
						activeScenarioRevision: reloaded.revision,
						lastScenarioResult: null,
						lastScenarioBestUpdated: false,
						scenarioCommandPending: false,
						scenarioOperationError: null,
						retryScenarioOperation: null
					});
					await this.refreshScenarioSummary();
					return { status: 'confirmation-required' };
				}
				casExpectedRevision = reloaded.revision ?? 0;
			}
			const abandoned = abandonScenarioTransition(run);
			const outcome = await repository.commitTerminalRun(abandoned, {
				expectedRevision: casExpectedRevision
			});
			if (isTerminalConflict(outcome)) {
				// On conflict the stored run is either a different run (e.g. a
				// newer replacement) or the same runId but a newer revision
				// (another tab advanced it). In both cases the repository
				// refused the terminal commit — committing would either
				// destroy that progress or record a stale terminal result.
				// Surface the preserved stored run so the UI can offer Resume
				// instead of silently clearing it. Mirror the conflict
				// handling in startScenarioRun and commitMutation.
				this.patchState({
					activeScenarioRun: outcome.activeRun,
					activeScenarioRevision: outcome.revision,
					lastScenarioResult: null,
					lastScenarioBestUpdated: false,
					scenarioCommandPending: false,
					scenarioOperationError: null,
					retryScenarioOperation: null
				});
				await this.refreshScenarioSummary();
				return { status: 'confirmation-required' };
			}
			// On success the terminal commit cleared the active entry (or
			// preserved a replacement) and recorded the abandoned result.
			// Publish the terminal outcome through the same path as
			// completed/failed runs so the UI surfaces the abandoned result
			// and the catalog reconciles to the stored state.
			this.publishScenarioOutcome(outcome);
			this.options.onScenarioTerminalRun?.(abandoned);
			this.patchState({
				playMode: 'sandbox',
				scenarioCommandPending: false
			});
			try {
				this.publishScenarioSummary(await repository.getSummary());
			} catch {
				// Summary refresh failed. The terminal run was already
				// persisted. When the repository cleared the active entry
				// (`activeRun === null`), drop its summary entry to avoid
				// leaving a stale Resume action whose `loadActiveRun` would
				// return null. When the repository retained a replacement
				// active run (`activeRun !== null`), update the summary entry
				// so the catalog keeps offering Resume on the valid run.
				if (outcome.activeRun === null) {
					this.dropTerminalRunFromSummary(abandoned.definition.scenarioId);
				} else {
					this.updateTerminalRunInSummary(outcome.activeRun);
				}
			}
			return { status: 'committed' };
		} catch {
			this.patchState({
				scenarioCommandPending: false,
				scenarioOperationError: scenarioError('persistence-write-failed'),
				retryScenarioOperation: this.createScenarioRetry(async () => {
					await this.abandonScenarioRun();
				})
			});
			return { status: 'failed' };
		}
	}

	foundStore(input: FoundStoreInput): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			allowMissingSandboxGame: true,
			transition: () =>
				createFoundingGameAtTile({
					archetypeId: input.archetypeId,
					city: input.city,
					tileId: input.tileId,
					seed: input.seed
				}),
			cueId: 'sfx.build.retail-place'
		});
	}

	openStore(tileId: string, archetypeId: ArchetypeId): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => openStoreAtTile(game!, { tileId, archetypeId }),
			scenarioCommand: { kind: 'openStore', tileId, archetypeId },
			cueId: 'sfx.build.retail-place'
		});
	}

	upgradeStore(storeId: string): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => upgradeStore(game!, storeId),
			scenarioCommand: { kind: 'upgradeStore', storeId },
			cueId: 'sfx.store.upgrade'
		});
	}

	buildIndustrialBuilding(
		tileId: string,
		buildingTypeId: IndustrialBuildingTypeId
	): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => buildIndustrialBuilding(game!, { tileId, buildingTypeId }),
			scenarioCommand: { kind: 'buildIndustrialBuilding', tileId, buildingTypeId },
			cueId: 'sfx.build.industry-place'
		});
	}

	upgradeIndustrialBuilding(buildingId: string): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => upgradeBuilding(game!, buildingId),
			scenarioCommand: { kind: 'upgradeIndustrialBuilding', buildingId },
			cueId: 'sfx.industry.upgrade'
		});
	}

	buildRail(input: RailInput): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => buildRail(game!, input),
			scenarioCommand: { kind: 'buildRail', ...input },
			cueId: 'sfx.build.industry-place'
		});
	}

	upgradeRail(cityId: string, segmentId: string): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => upgradeRailSegment(game!, cityId, segmentId),
			scenarioCommand: { kind: 'upgradeRail', cityId, segmentId },
			cueId: 'sfx.industry.upgrade'
		});
	}

	demolishRail(cityId: string, segmentId: string): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => demolishRailSegment(game!, cityId, segmentId),
			scenarioCommand: { kind: 'demolishRail', cityId, segmentId }
		});
	}

	advanceDay(): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => simulateDay(game!),
			scenarioCommand: { kind: 'advanceDay' },
			cueId: 'sfx.time.advance-day'
		});
	}

	updatePolicy(patch: Partial<CompanyPolicy>): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => updatePolicy(game!, patch),
			scenarioCommand: { kind: 'updatePolicy', patch },
			cueId: 'sfx.policy.change'
		});
	}

	resolveDecision(decisionId: string, optionId: string): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => resolveDecision(game!, decisionId, optionId),
			scenarioCommand: { kind: 'resolveDecision', decisionId, optionId },
			cueId: 'sfx.decision.resolve'
		});
	}

	hireStaff(candidateId: string): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => hireCandidate(game!, candidateId),
			scenarioCommand: { kind: 'hireStaff', candidateId },
			cueId: 'sfx.staff.hire'
		});
	}

	assignStaff(staffId: string, storeId: string): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => assignStaffToStore(game!, staffId, storeId),
			scenarioCommand: { kind: 'assignStaff', staffId, storeId },
			cueId: 'sfx.staff.assign'
		});
	}

	unassignStaff(staffId: string): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => unassignStaff(game!, staffId),
			scenarioCommand: { kind: 'unassignStaff', staffId },
			cueId: 'sfx.staff.unassign'
		});
	}

	promoteStaff(staffId: string): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => promoteStaff(game!, staffId),
			scenarioCommand: { kind: 'promoteStaff', staffId },
			cueId: 'sfx.staff.promote'
		});
	}

	updateStoreSellingPrice(
		storeId: string,
		categoryId: string,
		sellingPrice: number
	): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => updateStoreProduct(game!, storeId, categoryId, { sellingPrice }),
			scenarioCommand: { kind: 'updateStoreSellingPrice', storeId, categoryId, sellingPrice },
			cueId: 'sfx.stock.edit'
		});
	}

	updateStoreInventoryTargets(
		storeId: string,
		categoryId: string,
		reorderThreshold: number,
		targetStock: number
	): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) =>
				updateStoreProduct(game!, storeId, categoryId, { reorderThreshold, targetStock }),
			scenarioCommand: {
				kind: 'updateStoreInventoryTargets',
				storeId,
				categoryId,
				reorderThreshold,
				targetStock
			},
			cueId: 'sfx.stock.edit'
		});
	}

	openWorldCity(cityId: WorldCityId): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => openWorldCityTransition(game!, cityId),
			scenarioCommand: { kind: 'openWorldCity', cityId },
			cueId: 'sfx.world.city-unlock'
		});
	}

	selectWorldCity(cityId: WorldCityId): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => selectWorldCityTransition(game!, cityId),
			scenarioCommand: { kind: 'selectWorldCity', cityId }
		});
	}

	setRetailSupplySource(
		retailCityId: string,
		supplyCityId: string | null
	): Promise<GameRouteCommitResult> {
		if (this.currentState.playMode === 'sandbox') {
			// setRetailSupplySourceTransition returns ok/changed/game, which
			// normalizeRouteTransition cannot classify — so this method uniquely
			// preflights the sandbox transition before delegating to
			// commitMutation. Without this, unchanged results would be reported
			// as sandbox-committed and failures as domain-rejected with no code.
			const game = this.currentState.sandboxGame;
			if (!game) return Promise.resolve({ status: 'unavailable' });

			const result = setRetailSupplySourceTransition(game, retailCityId, supplyCityId);
			if (!result.ok) return Promise.resolve({ status: 'rejected' });
			if (!result.changed) return Promise.resolve({ status: 'unchanged' });

			return this.commitMutation({ transition: () => result.game });
		}

		return this.commitMutation({
			transition: (game) => game!,
			scenarioCommand: { kind: 'setRetailSupplySource', retailCityId, supplyCityId }
		});
	}

	borrowWorkingCapital(amount: number, termDays: LoanTermDays): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => borrow(game!, { purpose: 'workingCapital', amount, termDays }),
			scenarioCommand: { kind: 'borrow', amount, termDays }
		});
	}

	repayFinanceLoan(loanId: string, amount: number): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => repayLoan(game!, { loanId, amount }),
			scenarioCommand: { kind: 'repayLoan', loanId, amount }
		});
	}

	payOffFinanceLoan(loanId: string): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => payOffLoan(game!, loanId),
			scenarioCommand: { kind: 'payOffLoan', loanId }
		});
	}

	refinanceFinanceLoan(loanId: string, termDays: LoanTermDays): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => refinanceLoan(game!, { loanId, termDays }),
			scenarioCommand: { kind: 'refinanceLoan', loanId, termDays }
		});
	}

	financeWorldCity(cityId: WorldCityId, expectedCost: number): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => financeWorldCityOpening(game!, { cityId, expectedCost }),
			scenarioCommand: { kind: 'financeWorldCity', cityId, expectedCost },
			cueId: 'sfx.world.city-unlock'
		});
	}

	financeRetailStore(
		tileId: string,
		archetypeId: ArchetypeId,
		expectedCost: number
	): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) => financeRetailStoreOpening(game!, { tileId, archetypeId, expectedCost }),
			scenarioCommand: { kind: 'financeRetailStore', tileId, archetypeId, expectedCost },
			cueId: 'sfx.build.retail-place'
		});
	}

	financeIndustrialBuilding(
		tileId: string,
		buildingTypeId: IndustrialBuildingTypeId,
		expectedCost: number
	): Promise<GameRouteCommitResult> {
		return this.commitMutation({
			transition: (game) =>
				financeIndustrialBuilding(game!, { tileId, buildingTypeId, expectedCost }),
			scenarioCommand: { kind: 'financeIndustrialBuilding', tileId, buildingTypeId, expectedCost },
			cueId: 'sfx.build.industry-place'
		});
	}

	selectAlertCity(cityId: WorldCityId): Promise<GameRouteCommitResult> {
		return this.selectWorldCity(cityId);
	}

	private createScenarioRetry(
		operation: () => Promise<void>,
		isValid: () => boolean = () => true
	): () => Promise<void> {
		const epoch = ++this.scenarioRetryEpoch;
		return async () => {
			if (epoch !== this.scenarioRetryEpoch || !isValid()) return;
			await operation();
		};
	}

	private patchState(patch: Partial<GameRouteControllerState>): void {
		if (
			Object.prototype.hasOwnProperty.call(patch, 'retryScenarioOperation') &&
			patch.retryScenarioOperation === null
		) {
			this.scenarioRetryEpoch += 1;
		}
		this.currentState = { ...this.currentState, ...patch };
		this.options.onStateChange?.(this.currentState);
	}

	private async saveAuto(game: GameState): Promise<void> {
		if (!this.saveRepository) return;
		try {
			const metadata = await this.saveRepository.saveAuto(game);
			this.options.onAutoSave?.(metadata);
		} catch (error) {
			this.options.onAutoSaveError?.(error);
		}
	}

	private publishScenarioOutcome(outcome: ScenarioCommitOutcome): void {
		this.patchState({
			activeScenarioRun: outcome.activeRun,
			// Drop the tracked revision on a terminal commit. When the active
			// entry was cleared the revision is gone; when a replacement run
			// was preserved (stale commit against a restarted run) the
			// controller does not know the replacement's revision. In both
			// cases binding the next command to the terminated run's revision
			// would either CAS-fail against a different stored revision or,
			// worse, silently pass against a coincidentally matching one and
			// roll back the replacement. Setting `null` makes the next
			// command skip the CAS until a resume/re-read repopulates the
			// revision. For an active save (`terminalResult === null`) the
			// tracked revision is retained here; the caller increments it
			// after mirroring the repository's revision bump.
			activeScenarioRevision: outcome.terminalResult
				? null
				: this.currentState.activeScenarioRevision,
			lastScenarioResult: outcome.terminalResult,
			lastScenarioBestUpdated: outcome.bestUpdated,
			scenarioOperationError: null,
			retryScenarioOperation: null
		});
	}

	private publishScenarioSummary(summary: ScenarioPersistenceSummary): void {
		this.lastScenarioSummary = summary;
		this.options.onScenarioSummary?.(summary);
	}

	// Best-effort summary refresh after a lifecycle write (start/restart/import).
	// Refreshing keeps earlier active runs visible in the catalog — without it,
	// only the just-started run is published via `activeScenarioRun` and prior
	// runs disappear from the catalog until reload.
	private async refreshScenarioSummary(): Promise<void> {
		const repository = this.scenarioRepository;
		if (!repository) return;
		try {
			this.publishScenarioSummary(await repository.getSummary());
		} catch {
			// Best-effort: leave the last known summary in place.
		}
	}

	// Drop a terminal run's entry from the last known summary when the
	// post-terminal `getSummary` refresh fails, so the catalog doesn't keep
	// offering a stale Resume action whose `loadActiveRun` would return null.
	private dropTerminalRunFromSummary(scenarioId: ScenarioId): void {
		const base = this.lastScenarioSummary;
		if (!base) return;
		if (!(scenarioId in base.activeRunsByScenarioId)) return;
		const { [scenarioId]: _removed, ...rest } = base.activeRunsByScenarioId;
		void _removed;
		this.publishScenarioSummary({ ...base, activeRunsByScenarioId: rest });
	}

	// Update a terminal run's entry in the last known summary when the
	// post-terminal `getSummary` refresh fails but the repository retained a
	// replacement active run (returned as `outcome.activeRun`). Without this,
	// dropping the entry would hide a valid resumable run and expose a
	// misleading Start action.
	private updateTerminalRunInSummary(run: ScenarioRun): void {
		const base = this.lastScenarioSummary;
		if (!base) return;
		this.publishScenarioSummary({
			...base,
			activeRunsByScenarioId: {
				...base.activeRunsByScenarioId,
				[run.definition.scenarioId]: run
			}
		});
	}

	private async commitMutation(request: RouteGameMutation): Promise<GameRouteCommitResult> {
		if (this.currentState.playMode === 'sandbox') {
			if (!this.currentState.sandboxGame && !request.allowMissingSandboxGame) {
				return { status: 'unavailable' };
			}
			const transition = normalizeRouteTransition(
				request.transition(this.currentState.sandboxGame)
			);
			if (!transition.ok) {
				if ('decisionFailure' in transition) {
					return {
						status: 'decision-rejected',
						code: transition.decisionFailure.code,
						context: transition.decisionFailure.context,
						...(transition.decisionFailure.financeFailure === undefined
							? {}
							: { financeFailure: transition.decisionFailure.financeFailure })
					};
				}
				return {
					status: 'domain-rejected',
					code: transition.code,
					context: transition.context
				};
			}
			const result = runImmediateSandboxOperation({
				current: this.currentState.sandboxGame,
				transition: () => transition.game,
				publish: (sandboxGame) => this.patchState({ sandboxGame }),
				autosave: (game) => {
					void this.saveAuto(game);
				},
				afterPublish: request.cueId ? () => this.options.playSfx(request.cueId!) : undefined
			});
			return { status: 'sandbox-committed', changed: result.changed };
		}

		const repository = this.scenarioRepository;
		const scenarioCommand = request.scenarioCommand;
		if (!this.currentState.activeScenarioRun || !repository || !scenarioCommand) {
			return { status: 'unavailable' };
		}
		// The scenarioCommandGate below guards re-entrant game commands, but lifecycle
		// ops (start/resume/restart/import/abandon) gate on scenarioCommandPending
		// instead and do not hold the gate. Reject here so a game command cannot race
		// an in-flight lifecycle write. The UI also disables buttons while pending,
		// but the controller is the authoritative guard.
		if (this.currentState.scenarioCommandPending) return { status: 'busy' };

		let rejectedCode: ScenarioOperationError['code'] | null = null;
		// Object wrapper so TypeScript's closure control-flow analysis can
		// observe mutations made inside the runPersistenceGatedOperation
		// callback — a bare `let` would be narrowed back to its initial type
		// at the post-callback read site.
		const domainRejection: {
			value: { code: FinanceFailureCode; context: Record<string, string | number> } | null;
		} = { value: null };
		const decisionRejection: {
			value: Extract<DecisionResolutionResult, { ok: false }> | null;
		} = { value: null };
		const retailSupplyRejection: { value: RetailSupplyAssignmentFailure | null } = { value: null };
		let attemptedRun: ScenarioRun | null = null;
		let preparedRun: ScenarioRun | null = null;
		let terminalScenarioId: ScenarioId | null = null;
		// Captured when the persist step detects a compare-and-swap conflict.
		// Throwing to escape `runPersistenceGatedOperation` would land in the
		// generic catch below, which classifies the error as
		// `persistence-write-failed` and arms a retry whose `isValid` requires
		// `activeScenarioRun === attemptedRun` — already false because the
		// conflict branch replaced `activeScenarioRun`. Instead, capture the
		// conflict here and handle it after the gated operation returns, as an
		// explicit `confirmation-required` result that mirrors `startScenarioRun`.
		let conflictOutcome: {
			status: 'conflict';
			activeRun: ScenarioRun | null;
			revision: number | null;
		} | null = null;
		// Captured when the persist step re-reads an atomic run/revision pair
		// (because the tracked revision was null) so the publish step mirrors
		// the actual stored revision bump instead of computing it from the
		// (null) tracked revision.
		let usedCasRevision: number | null = null;
		try {
			const result = await runPersistenceGatedOperation<PreparedScenarioRun, ScenarioCommitOutcome>(
				this.scenarioCommandGate,
				{
					prepare: () => {
						const run = this.currentState.activeScenarioRun;
						if (!run) {
							rejectedCode = 'missing-run';
							return { status: 'rejected' as const };
						}
						attemptedRun = run;
						terminalScenarioId = run.definition.scenarioId;
						const definition = this.options.resolveScenarioDefinition(run.definition);
						if (!definition) {
							rejectedCode = 'stale-definition';
							return { status: 'rejected' as const };
						}
						const execution = executeScenarioCommand(run, definition, scenarioCommand);
						if (!execution.ok) {
							if (execution.financeFailure) domainRejection.value = execution.financeFailure;
							if (execution.decisionFailure) {
								decisionRejection.value = {
									ok: false,
									game: run.game,
									code: execution.decisionFailure.code,
									context: execution.decisionFailure.context,
									...(execution.decisionFailure.financeFailure === undefined
										? {}
										: { financeFailure: execution.decisionFailure.financeFailure })
								};
							}
							if (execution.retailSupplyFailure) {
								retailSupplyRejection.value = execution.retailSupplyFailure.reason;
							}
							rejectedCode = execution.code;
							return { status: 'rejected' as const };
						}
						if (!execution.changed) return { status: 'unchanged' as const };
						preparedRun = execution.run;
						// Capture the tracked revision at prepare time so the
						// persist step can bind its write to it. The repository
						// increments the stored revision on a matching write; the
						// publish step mirrors that locally. `null` means the
						// revision is unknown (init read failure, post-terminal
						// replacement, or re-init after removal); the persist step
						// then re-reads an atomic run/revision pair and binds the
						// write to that, refusing to write without CAS.
						return {
							status: 'changed' as const,
							value: {
								run: execution.run,
								expectedRevision: this.currentState.activeScenarioRevision
							}
						};
					},
					persist: (prepared) => {
						const { run, expectedRevision } = prepared;
						// Fast path: when the tracked revision is known, bind the
						// write to it directly (no async re-read) so the persist
						// step calls saveActiveRun/commitTerminalRun synchronously,
						// preserving the microtask timing callers and tests rely on.
						usedCasRevision = expectedRevision;
						const writeWith = (resolvedRevision: number) =>
							run.status === 'active'
								? repository
										.saveActiveRun(run, { expectedRevision: resolvedRevision })
										.then((outcome) => {
											if (isSaveConflict(outcome)) {
												// Another tab replaced or advanced this run
												// between the command's prepare and persist.
												// Capture the conflict and surface the stored
												// replacement so the UI can reconcile. Do not
												// throw — throwing lands in the generic catch,
												// which misclassifies this as a persistence-
												// write failure and arms a dead retry (its
												// isValid requires the old run still be
												// active, but we just replaced it). Return a
												// synthetic outcome the gated operation treats
												// as committed; the conflict is handled below.
												conflictOutcome = outcome;
												return {
													activeRun: outcome.activeRun,
													terminalResult: null,
													bestUpdated: false
												};
											}
											return outcome;
										})
								: repository
										.commitTerminalRun(run, { expectedRevision: resolvedRevision })
										.then((outcome) => {
											if (isTerminalConflict(outcome)) {
												// A stale terminal result (computed from
												// obsolete game state) lost the revision CAS:
												// another tab advanced the same run after this
												// command's prepare. Capture the conflict and
												// surface the stored run so the UI can
												// reconcile. Same synthetic-outcome pattern as
												// the save-conflict branch above.
												conflictOutcome = outcome;
												return {
													activeRun: outcome.activeRun,
													terminalResult: null,
													bestUpdated: false
												};
											}
											return outcome;
										});
						if (expectedRevision !== null) {
							return writeWith(expectedRevision);
						}
						// Slow path: the tracked revision is null (init read
						// failure, post-terminal replacement, or re-init after
						// removal). Do NOT write without CAS — that would risk
						// clobbering newer progress or resurrecting a run removed
						// by another tab. Re-read an atomic run/revision pair and
						// bind the write to it. If the re-read throws, the error
						// propagates to the outer catch (no write lands). If the
						// re-read returns no record or a different runId, surface
						// a conflict so the UI can reconcile instead of writing
						// blindly.
						return repository
							.loadActiveRunWithRevision(run.definition.scenarioId)
							.then((reloaded) => {
								if (!reloaded) {
									conflictOutcome = { status: 'conflict', activeRun: null, revision: null };
									return { activeRun: null, terminalResult: null, bestUpdated: false };
								}
								if (reloaded.run.runId !== run.runId) {
									conflictOutcome = {
										status: 'conflict',
										activeRun: reloaded.run,
										revision: reloaded.revision
									};
									return {
										activeRun: reloaded.run,
										terminalResult: null,
										bestUpdated: false
									};
								}
								// Content compare-and-swap: the re-read returned the
								// same runId, but another tab may have advanced the
								// same run (same runId, bumped revision, different
								// game state) between this tab's prepare and persist.
								// The prepare step computed `execution.run` from the
								// stale in-memory `attemptedRun`; writing it would
								// clobber the other tab's progress. Compare the
								// re-read run against `attemptedRun` (the in-memory
								// run captured at prepare time) — if they differ,
								// surface a conflict instead of calling `writeWith`.
								if (attemptedRun && !deeplyEqual(reloaded.run, attemptedRun)) {
									conflictOutcome = {
										status: 'conflict',
										activeRun: reloaded.run,
										revision: reloaded.revision
									};
									return {
										activeRun: reloaded.run,
										terminalResult: null,
										bestUpdated: false
									};
								}
								const resolvedRevision = reloaded.revision ?? 0;
								usedCasRevision = resolvedRevision;
								return writeWith(resolvedRevision);
							});
					},
					publish: (outcome) => {
						if (conflictOutcome) {
							// Surface the persisted replacement (or clear the
							// active run when the expected run is gone) without
							// claiming a successful command commit. Track the
							// conflict's revision so a subsequent confirmed
							// write can bind to it.
							this.patchState({
								activeScenarioRun: conflictOutcome.activeRun,
								activeScenarioRevision: conflictOutcome.revision,
								scenarioOperationError: null,
								retryScenarioOperation: null
							});
							return;
						}
						this.publishScenarioOutcome(outcome);
						// Advance the tracked revision on a successful active
						// save. The repository incremented the stored revision;
						// mirror it so the next command's CAS binds to it. On a
						// terminal commit, publishScenarioOutcome already dropped
						// the revision (the active entry was cleared or a
						// replacement whose revision is unknown was preserved).
						// When the persist step re-read an atomic run/revision pair
						// (because the tracked revision was null), use the actual
						// CAS revision captured by the persist step instead of
						// computing from the stale tracked value.
						if (outcome.terminalResult === null && this.currentState.activeScenarioRun) {
							const base = usedCasRevision ?? this.currentState.activeScenarioRevision ?? 0;
							this.patchState({ activeScenarioRevision: base + 1 });
						}
						if (outcome.terminalResult && preparedRun) {
							this.options.onScenarioTerminalRun?.(preparedRun);
						}
					},
					// P3: Suppress the success sound effect when the persist step
					// detected a compare-and-swap conflict. The gated operation
					// calls afterPublish unconditionally (it treats the synthetic
					// conflict outcome as committed), so without this guard a
					// rejected command would play its success cue — misleading the
					// user into thinking the command landed.
					afterPublish: request.cueId
						? () => {
								if (conflictOutcome) return;
								this.options.playSfx(request.cueId!);
							}
						: undefined,
					onPendingChange: (scenarioCommandPending) => this.patchState({ scenarioCommandPending })
				}
			);

			if (result.status === 'rejected' && domainRejection.value) {
				return {
					status: 'domain-rejected',
					code: domainRejection.value.code,
					context: domainRejection.value.context
				};
			}
			if (result.status === 'rejected' && decisionRejection.value) {
				return {
					status: 'decision-rejected',
					code: decisionRejection.value.code,
					context: decisionRejection.value.context,
					...(decisionRejection.value.financeFailure === undefined
						? {}
						: { financeFailure: decisionRejection.value.financeFailure })
				};
			}
			if (result.status === 'rejected' && retailSupplyRejection.value) {
				return {
					status: 'retail-supply-rejected',
					reason: retailSupplyRejection.value
				};
			}
			if (result.status === 'rejected' && rejectedCode) {
				this.patchState({
					scenarioOperationError: scenarioError(rejectedCode),
					retryScenarioOperation: null
				});
			}
			if (result.status === 'committed' && result.value.terminalResult) {
				try {
					this.publishScenarioSummary(await repository.getSummary());
				} catch {
					// Summary refresh failed. The terminal run was already
					// persisted. When the repository cleared the active entry
					// (`activeRun === null`), drop its summary entry to avoid
					// leaving a stale Resume action whose `loadActiveRun` would
					// return null. When the repository retained a replacement
					// active run (`activeRun !== null`), update the summary
					// entry so the catalog keeps offering Resume on the valid
					// run instead of hiding it and exposing a misleading Start.
					if (terminalScenarioId) {
						if (result.value.activeRun === null) {
							this.dropTerminalRunFromSummary(terminalScenarioId);
						} else {
							this.updateTerminalRunInSummary(result.value.activeRun);
						}
					}
				}
			}
			if (conflictOutcome) {
				// The compare-and-swap lost: another tab replaced the run (or
				// the expected run is gone). Refresh the catalog so it reflects
				// the actual stored state and return confirmation-required so
				// the UI can offer Resume on the surfaced run — mirroring
				// startScenarioRun's conflict handling. Do not classify this
				// as a persistence-write failure or arm a retry.
				await this.refreshScenarioSummary();
				return { status: 'confirmation-required' };
			}
			return { status: result.status };
		} catch {
			this.patchState({
				scenarioOperationError: scenarioError('persistence-write-failed'),
				retryScenarioOperation: this.createScenarioRetry(
					async () => {
						await this.commitMutation(request);
					},
					() =>
						this.currentState.playMode === 'scenario' &&
						this.currentState.activeScenarioRun === attemptedRun
				)
			});
			return { status: 'failed' };
		}
	}
}
