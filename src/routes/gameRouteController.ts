import type { SfxCueId } from '$lib/audio/audioCatalog';
import { buildIndustrialBuilding, upgradeBuilding } from '$lib/game/industryPlacement';
import { createFoundingGameAtTile, openStoreAtTile } from '$lib/game/placement';
import { buildRail, demolishRailSegment, upgradeRailSegment } from '$lib/game/railPlacement';
import { simulateDay } from '$lib/game/simulateDay';
import { assignStaffToStore, hireCandidate, promoteStaff, unassignStaff } from '$lib/game/staffing';
import { resolveDecision, updatePolicy, upgradeStore } from '$lib/game/state';
import { updateStoreProduct } from '$lib/game/stock';
import type {
	ArchetypeId,
	City,
	CompanyPolicy,
	GameState,
	IndustrialBuildingTypeId,
	WorldCityId
} from '$lib/game/types';
import {
	openWorldCity as openWorldCityTransition,
	selectWorldCity as selectWorldCityTransition
} from '$lib/game/world';
import type { SaveRepository } from '$lib/persistence/saveRepository';
import type { SaveSlotMetadata, SaveSummary } from '$lib/persistence/saveTypes';
import type { ScenarioRepository } from '$lib/persistence/scenarioRepository';
import {
	ScenarioCommandGate,
	runImmediateSandboxOperation,
	runPersistenceGatedOperation
} from '$lib/scenarios/commandGate';
import { executeScenarioCommand } from '$lib/scenarios/runtime';
import type {
	ScenarioCommand,
	ScenarioCommitOutcome,
	ScenarioDefinition,
	ScenarioDefinitionRef,
	ScenarioOperationError,
	ScenarioResult,
	ScenarioRun
} from '$lib/scenarios/types';

export interface GameRouteControllerState {
	sandboxGame: GameState | null;
	activeScenarioRun: ScenarioRun | null;
	lastScenarioResult: ScenarioResult | null;
	lastScenarioBestUpdated: boolean;
	scenarioOperationError: ScenarioOperationError | null;
	retryScenarioOperation: (() => Promise<void>) | null;
	playMode: 'sandbox' | 'scenario';
	scenarioCommandPending: boolean;
}

export type GameRouteCommitResult =
	| { status: 'sandbox-committed'; changed: boolean }
	| { status: 'committed' }
	| { status: 'busy' }
	| { status: 'rejected' }
	| { status: 'unchanged' }
	| { status: 'unavailable' }
	| { status: 'failed' };

export type SandboxLoadResult = 'loaded' | 'missing' | 'unavailable';

export interface GameRouteControllerOptions {
	createSaveRepository(): Promise<SaveRepository>;
	createScenarioRepository(): Promise<ScenarioRepository>;
	resolveScenarioDefinition(ref: ScenarioDefinitionRef): ScenarioDefinition | undefined;
	playSfx(cueId: SfxCueId): void;
	onStateChange?(state: Readonly<GameRouteControllerState>): void;
	onSaveRepositoryReady?(repository: SaveRepository): void;
	onSaveSummary?(summary: SaveSummary): void;
	onAutoSave?(metadata: SaveSlotMetadata): void;
	onAutoSaveError?(error: unknown): void;
	onReadOnlySelection?(kind: 'retail' | 'industry', tileId: string): void;
}

interface RouteGameMutation {
	transition(currentGame: GameState | null): GameState;
	scenarioCommand?: ScenarioCommand;
	cueId?: SfxCueId;
	allowMissingSandboxGame?: boolean;
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

const INITIAL_STATE: GameRouteControllerState = {
	sandboxGame: null,
	activeScenarioRun: null,
	lastScenarioResult: null,
	lastScenarioBestUpdated: false,
	scenarioOperationError: null,
	retryScenarioOperation: null,
	playMode: 'sandbox',
	scenarioCommandPending: false
};

function scenarioError(code: ScenarioOperationError['code']): ScenarioOperationError {
	return { code, diagnostics: [] };
}

export class GameRouteController {
	private currentState: GameRouteControllerState = { ...INITIAL_STATE };
	private saveRepository: SaveRepository | null = null;
	private scenarioRepository: ScenarioRepository | null = null;
	private readonly scenarioCommandGate = new ScenarioCommandGate();

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
			if (summary.diagnostics.length > 0) {
				this.patchState({
					scenarioOperationError: {
						code: 'persistence-read-failed',
						diagnostics: summary.diagnostics
					},
					retryScenarioOperation: () => this.initializeScenarios()
				});
				return;
			}

			this.dismissScenarioOperationError();
			const resumedRun = Object.entries(summary.activeRunsByScenarioId)
				.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
				.map(([, run]) => run)
				.find((run): run is ScenarioRun => run !== undefined);
			if (resumedRun) {
				this.patchState({
					activeScenarioRun: resumedRun,
					lastScenarioResult: null,
					lastScenarioBestUpdated: false,
					playMode: 'scenario'
				});
			}
		} catch {
			this.patchState({
				scenarioOperationError: scenarioError('persistence-read-failed'),
				retryScenarioOperation: () => this.initializeScenarios()
			});
		}
	}

	loadSandboxGame(game: GameState, cueId?: SfxCueId): void {
		this.patchState({ sandboxGame: game, playMode: 'sandbox' });
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

	selectAlertCity(cityId: WorldCityId): Promise<GameRouteCommitResult> {
		return this.selectWorldCity(cityId);
	}

	private patchState(patch: Partial<GameRouteControllerState>): void {
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
			lastScenarioResult: outcome.terminalResult,
			lastScenarioBestUpdated: outcome.bestUpdated,
			scenarioOperationError: null,
			retryScenarioOperation: null
		});
	}

	private async commitMutation(request: RouteGameMutation): Promise<GameRouteCommitResult> {
		if (this.currentState.playMode === 'sandbox') {
			if (!this.currentState.sandboxGame && !request.allowMissingSandboxGame) {
				return { status: 'unavailable' };
			}
			const result = runImmediateSandboxOperation({
				current: this.currentState.sandboxGame,
				transition: request.transition,
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

		let rejectedCode: ScenarioOperationError['code'] | null = null;
		try {
			const result = await runPersistenceGatedOperation<ScenarioRun, ScenarioCommitOutcome>(
				this.scenarioCommandGate,
				{
					prepare: () => {
						const run = this.currentState.activeScenarioRun;
						if (!run) {
							rejectedCode = 'missing-run';
							return { status: 'rejected' as const };
						}
						const definition = this.options.resolveScenarioDefinition(run.definition);
						if (!definition) {
							rejectedCode = 'stale-definition';
							return { status: 'rejected' as const };
						}
						const execution = executeScenarioCommand(run, definition, scenarioCommand);
						if (!execution.ok) {
							rejectedCode = execution.code;
							return { status: 'rejected' as const };
						}
						return execution.changed
							? { status: 'changed' as const, value: execution.run }
							: { status: 'unchanged' as const };
					},
					persist: (run) =>
						run.status === 'active'
							? repository.saveActiveRun(run)
							: repository.commitTerminalRun(run),
					publish: (outcome) => this.publishScenarioOutcome(outcome),
					afterPublish: request.cueId ? () => this.options.playSfx(request.cueId!) : undefined,
					onPendingChange: (scenarioCommandPending) => this.patchState({ scenarioCommandPending })
				}
			);

			if (result.status === 'rejected' && rejectedCode) {
				this.patchState({
					scenarioOperationError: scenarioError(rejectedCode),
					retryScenarioOperation: null
				});
			}
			return { status: result.status };
		} catch {
			this.patchState({
				scenarioOperationError: scenarioError('persistence-write-failed'),
				retryScenarioOperation: async () => {
					await this.commitMutation(request);
				}
			});
			return { status: 'failed' };
		}
	}
}
