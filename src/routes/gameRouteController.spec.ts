import { describe, expect, it, vi } from 'vitest';
import { resolveScenarioDefinition } from '$lib/scenarios/catalog';
import { createNewGame } from '$lib/game/state';
import type { WorldCityId } from '$lib/game/types';
import { createEmptySaveStore } from '$lib/persistence/saveCodec';
import {
	SaveRepositoryFromDriver,
	type SaveStoreDriver
} from '$lib/persistence/saveStoreRepository';
import type { SaveRepository } from '$lib/persistence/saveRepository';
import { createScenarioMemoryRepository } from '$lib/persistence/scenarioMemoryRepository';
import type { ScenarioMemoryRepository } from '$lib/persistence/scenarioMemoryRepository';
import type { ScenarioRepository, ScenarioSaveOutcome } from '$lib/persistence/scenarioRepository';
import type {
	ScenarioDefinition,
	ScenarioDefinitionRef,
	ScenarioPersistenceSummary,
	ScenarioRun
} from '$lib/scenarios/types';
import {
	GameRouteController,
	createMutationAvailability,
	type GameRouteControllerOptions,
	type GameRouteControllerState
} from './gameRouteController';

class MemorySaveStoreDriver implements SaveStoreDriver {
	constructor(private snapshot: unknown = createEmptySaveStore()) {}

	async read(): Promise<never> {
		return structuredClone(this.snapshot) as never;
	}

	async write(snapshot: never): Promise<void> {
		this.snapshot = structuredClone(snapshot);
	}
}

function createSaveRepository(): SaveRepository {
	return new SaveRepositoryFromDriver(new MemorySaveStoreDriver());
}

const FIRST_PROFIT_REF: ScenarioDefinitionRef = { scenarioId: 'first-profit', version: 1 };

function firstProfitDefinition(): ScenarioDefinition {
	const definition = resolveScenarioDefinition(FIRST_PROFIT_REF);
	if (!definition) throw new Error('first-profit definition missing from catalog');
	return definition;
}

/** A definition based on first-profit but with objectives that complete on day 1. */
function completingDefinition(): ScenarioDefinition {
	const base = firstProfitDefinition();
	return {
		...base,
		requiredObjectives: [
			{
				id: 'cash-nonnegative',
				labelKey: 'scenarioDefinitions.firstProfit.objectives.cumulativeNetIncome',
				query: { metric: 'cash' },
				comparator: 'gte',
				target: 0,
				window: { kind: 'current' }
			}
		],
		failures: []
	};
}

/** A definition based on first-profit but with a failure that triggers immediately. */
function failingDefinition(): ScenarioDefinition {
	const base = firstProfitDefinition();
	return {
		...base,
		requiredObjectives: [
			{
				id: 'cash-nonnegative',
				labelKey: 'scenarioDefinitions.firstProfit.objectives.cumulativeNetIncome',
				query: { metric: 'cash' },
				comparator: 'gte',
				target: 0,
				window: { kind: 'current' }
			}
		],
		failures: [
			{
				id: 'always-fails',
				labelKey: 'scenarioDefinitions.firstProfit.failures.negativeCash',
				query: { metric: 'cash' },
				comparator: 'lt',
				target: 1_000_000_000,
				window: { kind: 'current' }
			}
		]
	};
}

function flushMicrotasks(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

interface ControllerHarness {
	controller: GameRouteController;
	states: GameRouteControllerState[];
	sfx: ReturnType<typeof vi.fn>;
	saveRepository: SaveRepository;
	scenarioRepository: ScenarioMemoryRepository;
	onStateChange: ReturnType<typeof vi.fn>;
	onSaveRepositoryReady: ReturnType<typeof vi.fn>;
	onSaveSummary: ReturnType<typeof vi.fn>;
	onScenarioSummary: ReturnType<typeof vi.fn>;
	onScenarioTerminalRun: ReturnType<typeof vi.fn>;
	onAutoSave: ReturnType<typeof vi.fn>;
	onAutoSaveError: ReturnType<typeof vi.fn>;
	onReadOnlySelection: ReturnType<typeof vi.fn>;
}

function createHarness(options?: {
	scenarioRepository?: ScenarioRepository;
	createScenarioRepository?: () => Promise<ScenarioRepository>;
	resolveDefinition?: (ref: ScenarioDefinitionRef) => ScenarioDefinition | undefined;
}): ControllerHarness {
	const states: GameRouteControllerState[] = [];
	const sfx = vi.fn();
	const onSaveRepositoryReady = vi.fn();
	const onSaveSummary = vi.fn();
	const onScenarioSummary = vi.fn();
	const onScenarioTerminalRun = vi.fn();
	const onAutoSave = vi.fn();
	const onAutoSaveError = vi.fn();
	const onReadOnlySelection = vi.fn();
	const onStateChange = vi.fn((state: Readonly<GameRouteControllerState>) => {
		states.push({ ...state });
	});

	const saveRepository = createSaveRepository();
	const resolveDefinition = options?.resolveDefinition ?? resolveScenarioDefinition;
	const scenarioRepository =
		options?.scenarioRepository ?? createScenarioMemoryRepository(undefined, resolveDefinition);

	const controllerOptions: GameRouteControllerOptions = {
		createSaveRepository: async () => saveRepository,
		createScenarioRepository: async () =>
			options?.createScenarioRepository
				? await options.createScenarioRepository()
				: (scenarioRepository as ScenarioRepository),
		resolveScenarioDefinition: resolveDefinition,
		playSfx: sfx,
		onStateChange,
		onSaveRepositoryReady,
		onSaveSummary,
		onScenarioSummary,
		onScenarioTerminalRun,
		onAutoSave,
		onAutoSaveError,
		onReadOnlySelection
	};

	const controller = new GameRouteController(controllerOptions);
	return {
		controller,
		states,
		sfx,
		saveRepository,
		scenarioRepository: scenarioRepository as ScenarioMemoryRepository,
		onStateChange,
		onSaveRepositoryReady,
		onSaveSummary,
		onScenarioSummary,
		onScenarioTerminalRun,
		onAutoSave,
		onAutoSaveError,
		onReadOnlySelection
	};
}

async function startScenario(
	controller: GameRouteController,
	definition: ScenarioDefinition = firstProfitDefinition(),
	seed: number = definition.officialSeed
): Promise<ScenarioRun> {
	const result = await controller.startScenarioRun(definition, seed);
	expect(result).toEqual({ status: 'committed' });
	const run = controller.state.activeScenarioRun;
	if (!run) throw new Error('scenario run not active after start');
	return run;
}

function failingScenarioRepository(
	overrides: Partial<ScenarioRepository> = {}
): ScenarioRepository {
	const base: ScenarioPersistenceSummary = {
		activeRunsByScenarioId: {},
		bestResultsByDefinitionKey: {},
		diagnostics: []
	};
	return {
		getSummary: async () => base,
		loadActiveRun: async () => null,
		loadActiveRunWithRevision: async () => null,
		saveActiveRun: async () => {
			throw new Error('write failed');
		},
		removeActiveRun: async () => ({ status: 'removed' as const }),
		commitTerminalRun: async () => {
			throw new Error('no terminal');
		},
		...overrides
	} as ScenarioRepository;
}

describe('createMutationAvailability', () => {
	it('enables every command in sandbox mode regardless of pending state or definition', () => {
		const availability = createMutationAvailability({
			playMode: 'sandbox',
			pending: true,
			definition: null
		});
		expect(availability).toMatchObject({
			pending: false,
			advanceDay: true,
			resolveDecision: true,
			updatePolicy: true,
			openWorldCity: true,
			openStore: true,
			upgradeStore: true,
			hireStaff: true,
			assignStaff: true,
			unassignStaff: true,
			promoteStaff: true,
			updateStoreSellingPrice: true,
			updateStoreInventoryTargets: true,
			buildIndustrialBuilding: true,
			upgradeIndustrialBuilding: true,
			buildRail: true,
			upgradeRail: true,
			demolishRail: true
		});
	});

	it('disables commands not in the definition allowedCommands in scenario mode', () => {
		const definition = firstProfitDefinition();
		const availability = createMutationAvailability({
			playMode: 'scenario',
			pending: false,
			definition
		});
		expect(availability.pending).toBe(false);
		expect(availability.advanceDay).toBe(true);
		expect(availability.updatePolicy).toBe(true);
		expect(availability.openStore).toBe(false);
		expect(availability.buildRail).toBe(false);
	});

	it('marks pending and disables all commands while a scenario command is pending', () => {
		const definition = firstProfitDefinition();
		const availability = createMutationAvailability({
			playMode: 'scenario',
			pending: true,
			definition
		});
		expect(availability.pending).toBe(true);
		expect(availability.advanceDay).toBe(false);
	});

	it('disables every command in scenario mode when the definition is null', () => {
		const availability = createMutationAvailability({
			playMode: 'scenario',
			pending: false,
			definition: null
		});
		expect(availability.pending).toBe(false);
		const values = Object.entries(availability).filter(([key]) => key !== 'pending');
		expect(values.every(([, value]) => value === false)).toBe(true);
	});
});

describe('GameRouteController', () => {
	describe('initializeSaves', () => {
		it('notifies save repository ready and publishes the summary when no sandbox game is loaded', async () => {
			const harness = createHarness();
			await harness.controller.initializeSaves();
			expect(harness.onSaveRepositoryReady).toHaveBeenCalledWith(harness.saveRepository);
			expect(harness.onSaveSummary).toHaveBeenCalledTimes(1);
		});

		it('autosaves an already-loaded sandbox game instead of publishing the summary', async () => {
			const harness = createHarness();
			const game = createNewGame('convenience', 42);
			harness.controller.loadSandboxGame(game);
			harness.onAutoSave.mockClear();
			await harness.controller.initializeSaves();
			await flushMicrotasks();
			expect(harness.onAutoSave).toHaveBeenCalledTimes(1);
			expect(harness.onSaveSummary).not.toHaveBeenCalled();
		});
	});

	describe('initializeScenarios', () => {
		it('marks scenarios ready and publishes the summary when the store is empty', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			expect(harness.controller.state.scenariosReady).toBe(true);
			expect(harness.controller.state.activeScenarioRun).toBeNull();
			expect(harness.onScenarioSummary).toHaveBeenCalledTimes(1);
			expect(harness.controller.state.scenarioOperationError).toBeNull();
		});

		it('resumes an active run and switches to scenario mode when no sandbox is selected', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			harness.onScenarioSummary.mockClear();

			// A fresh controller sharing the same repository should resume the run.
			const harness2 = createHarness({ scenarioRepository });
			await harness2.controller.initializeScenarios();
			expect(harness2.controller.state.scenariosReady).toBe(true);
			expect(harness2.controller.state.activeScenarioRun).not.toBeNull();
			expect(harness2.controller.state.playMode).toBe('scenario');
		});

		it('preserves an already-loaded sandbox game when resuming an active run', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);

			const harness2 = createHarness({ scenarioRepository });
			harness2.controller.loadSandboxGame(createNewGame('convenience', 7));
			await harness2.controller.initializeScenarios();
			expect(harness2.controller.state.activeScenarioRun).not.toBeNull();
			expect(harness2.controller.state.playMode).toBe('sandbox');
		});

		it('surfaces a persistence-read-failed error with a retry when getSummary throws', async () => {
			const harness = createHarness({
				createScenarioRepository: async () =>
					failingScenarioRepository({
						getSummary: async () => {
							throw new Error('storage down');
						}
					})
			});
			await harness.controller.initializeScenarios();
			expect(harness.controller.state.scenariosReady).toBe(false);
			expect(harness.controller.state.scenarioOperationError?.code).toBe('persistence-read-failed');
			expect(harness.controller.state.retryScenarioOperation).not.toBeNull();
		});

		it('surfaces diagnostics as a persistence-read-failed error while still marking scenarios ready', async () => {
			// Build a raw store with a valid run plus an unknown scenario id key.
			// The codec emits a diagnostic for the unknown key but still returns
			// the valid run, so scenariosReady stays true.
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const driver = (scenarioRepository as ScenarioMemoryRepository).memoryDriver;
			const raw = await driver.read();
			const validRecord = raw.snapshot.activeRunsByScenarioId['first-profit']!;
			const corruptInitial = {
				schemaVersion: raw.snapshot.schemaVersion,
				activeRunsByScenarioId: {
					'first-profit': validRecord,
					'unknown-scenario': validRecord
				},
				bestResultsByDefinitionKey: raw.snapshot.bestResultsByDefinitionKey
			};
			const corruptRepository = createScenarioMemoryRepository(corruptInitial);

			const harness2 = createHarness({ scenarioRepository: corruptRepository });
			await harness2.controller.initializeScenarios();
			expect(harness2.controller.state.scenariosReady).toBe(true);
			expect(harness2.controller.state.scenarioOperationError?.code).toBe(
				'persistence-read-failed'
			);
			expect(harness2.controller.state.scenarioOperationError?.diagnostics.length).toBeGreaterThan(
				0
			);
			expect(harness2.controller.state.retryScenarioOperation).not.toBeNull();
		});
	});

	it('clears a previously staged active run when re-initialization finds no active runs in the summary', async () => {
		const scenarioRepository = createScenarioMemoryRepository();
		const harness = createHarness({ scenarioRepository });
		await harness.controller.initializeScenarios();
		await startScenario(harness.controller);
		expect(harness.controller.state.activeScenarioRun).not.toBeNull();

		// Another tab abandons the run, removing it from the store.
		await harness.controller.abandonScenarioRun();

		// Re-initialize. The summary no longer lists any active run, so
		// the outer else path clears the previously staged activeScenarioRun
		// instead of leaving it paired with a null revision.
		await harness.controller.initializeScenarios();
		expect(harness.controller.state.activeScenarioRun).toBeNull();
		expect(harness.controller.state.activeScenarioRevision).toBeNull();
		expect(harness.controller.state.scenariosReady).toBe(true);
	});

	it('clears a previously staged active run when the re-read returns no record during re-initialization', async () => {
		const scenarioRepository = createScenarioMemoryRepository();
		const harness = createHarness({ scenarioRepository });
		await harness.controller.initializeScenarios();
		await startScenario(harness.controller);
		const run = harness.controller.state.activeScenarioRun!;
		expect(harness.controller.state.activeScenarioRevision).toBe(1);

		// Simulate the race: the summary still lists the run, but the
		// re-read returns null (the run was removed between the summary
		// read and the re-read). Mock getSummary to return the stale
		// summary and loadActiveRunWithRevision to return null.
		const staleSummary: ScenarioPersistenceSummary = {
			activeRunsByScenarioId: { 'first-profit': run },
			bestResultsByDefinitionKey: {},
			diagnostics: []
		};
		vi.spyOn(harness.scenarioRepository, 'getSummary').mockResolvedValue(staleSummary);
		vi.spyOn(harness.scenarioRepository, 'loadActiveRunWithRevision').mockResolvedValue(null);

		await harness.controller.initializeScenarios();
		expect(harness.controller.state.activeScenarioRun).toBeNull();
		expect(harness.controller.state.activeScenarioRevision).toBeNull();
		expect(harness.controller.state.scenariosReady).toBe(true);
	});

	describe('sandbox load and resume', () => {
		it('loadSandboxGame switches to sandbox mode and clears scenario errors', () => {
			const harness = createHarness();
			const game = createNewGame('convenience', 5);
			harness.controller.loadSandboxGame(game, 'sfx.save.loaded');
			expect(harness.controller.state.sandboxGame).toBe(game);
			expect(harness.controller.state.playMode).toBe('sandbox');
			expect(harness.sfx).toHaveBeenCalledWith('sfx.save.loaded');
		});

		it('resumeAutoSave returns unavailable before initialization, missing when empty, and loaded when present', async () => {
			const harness = createHarness();
			expect(await harness.controller.resumeAutoSave()).toBe('unavailable');
			await harness.controller.initializeSaves();
			expect(await harness.controller.resumeAutoSave()).toBe('missing');
			const game = createNewGame('convenience', 9);
			await harness.saveRepository.saveAuto(game);
			const result = await harness.controller.resumeAutoSave();
			expect(result).toBe('loaded');
			expect(harness.controller.state.sandboxGame).not.toBeNull();
		});

		it('loadManualSave returns unavailable, missing, and loaded appropriately', async () => {
			const harness = createHarness();
			expect(await harness.controller.loadManualSave('slot-1')).toBe('unavailable');
			await harness.controller.initializeSaves();
			expect(await harness.controller.loadManualSave('slot-1')).toBe('missing');
			const game = createNewGame('convenience', 11);
			await harness.saveRepository.createManualSlot('my save', game);
			const summary = await harness.saveRepository.getSummary();
			const slotId = summary.manualSlots[0]!.id;
			const result = await harness.controller.loadManualSave(slotId);
			expect(result).toBe('loaded');
		});
	});

	describe('selectReadOnlyTile', () => {
		it('forwards the kind and tile id to the callback', () => {
			const harness = createHarness();
			harness.controller.selectReadOnlyTile('industry', 'industry-city-2-3');
			expect(harness.onReadOnlySelection).toHaveBeenCalledWith('industry', 'industry-city-2-3');
		});

		it('is a no-op when no callback is configured', () => {
			const controller = new GameRouteController({
				createSaveRepository: async () => createSaveRepository(),
				createScenarioRepository: async () => createScenarioMemoryRepository(),
				resolveScenarioDefinition: resolveScenarioDefinition,
				playSfx: vi.fn()
			});
			expect(() => controller.selectReadOnlyTile('retail', 't-1')).not.toThrow();
		});
	});

	describe('dismissScenarioOperationError', () => {
		it('clears the error and retry when present', async () => {
			const harness = createHarness({
				createScenarioRepository: async () =>
					failingScenarioRepository({
						getSummary: async () => {
							throw new Error('storage down');
						}
					})
			});
			await harness.controller.initializeScenarios();
			expect(harness.controller.state.scenarioOperationError).not.toBeNull();
			harness.controller.dismissScenarioOperationError();
			expect(harness.controller.state.scenarioOperationError).toBeNull();
			expect(harness.controller.state.retryScenarioOperation).toBeNull();
		});

		it('is a no-op when there is no error or retry', () => {
			const harness = createHarness();
			const before = harness.controller.state;
			harness.controller.dismissScenarioOperationError();
			expect(harness.controller.state).toBe(before);
		});
	});

	describe('startScenarioRun', () => {
		it('persists the run, switches to scenario mode, and refreshes the summary', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			const definition = firstProfitDefinition();
			const result = await harness.controller.startScenarioRun(definition, definition.officialSeed);
			expect(result).toEqual({ status: 'committed' });
			expect(harness.controller.state.playMode).toBe('scenario');
			expect(harness.controller.state.activeScenarioRun).not.toBeNull();
			expect(harness.controller.state.activeScenarioRun?.eligibility).toBe('ranked');
		});

		it('returns rejected and surfaces the error when the definition cannot start', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			const definition = firstProfitDefinition();
			const broken: ScenarioDefinition = {
				...definition,
				start: {
					...definition.start,
					foundingStore: {
						...definition.start.foundingStore,
						cityId: 'does-not-exist' as WorldCityId
					}
				}
			};
			const result = await harness.controller.startScenarioRun(broken, definition.officialSeed);
			expect(result).toEqual({ status: 'rejected' });
			expect(harness.controller.state.scenarioOperationError).not.toBeNull();
		});

		it('returns unavailable when the scenario repository is missing', async () => {
			const harness = createHarness();
			const definition = firstProfitDefinition();
			const result = await harness.controller.startScenarioRun(definition, definition.officialSeed);
			expect(result).toEqual({ status: 'unavailable' });
			expect(harness.controller.state.scenarioOperationError?.code).toBe(
				'persistence-write-failed'
			);
		});

		it('returns confirmation-required with the existing runId when an active run exists and confirmed is false', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const firstRunId = harness.controller.state.activeScenarioRun!.runId;

			// Starting with a different seed creates a new run that conflicts.
			const definition = firstProfitDefinition();
			const result = await harness.controller.startScenarioRun(
				definition,
				definition.officialSeed + 1
			);
			expect(result).toEqual({
				status: 'confirmation-required',
				expectedRunId: firstRunId,
				expectedRevision: 1
			});
			expect(harness.controller.state.activeScenarioRun?.runId).toBe(firstRunId);
		});

		it('starts and persists when confirmed is true with the expected runId', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const originalRunId = harness.controller.state.activeScenarioRun!.runId;
			const definition = firstProfitDefinition();
			const result = await harness.controller.startScenarioRun(
				definition,
				definition.officialSeed + 1,
				true,
				originalRunId
			);
			expect(result).toEqual({ status: 'committed' });
			expect(harness.controller.state.activeScenarioRun?.runId).not.toBe(originalRunId);
		});

		it('returns confirmation-required when a confirmed start loses the compare-and-swap', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const definition = firstProfitDefinition();

			// Step 1: unconfirmed start discovers the existing run and returns
			// its runId as the expected identity.
			const confirmResult = await harness.controller.startScenarioRun(
				definition,
				definition.officialSeed + 1,
				false
			);
			expect(confirmResult).toEqual({
				status: 'confirmation-required',
				expectedRunId: harness.controller.state.activeScenarioRun!.runId,
				expectedRevision: 1
			});
			if (confirmResult.status !== 'confirmation-required') {
				throw new Error('Expected confirmation-required');
			}
			const expectedRunId = confirmResult.expectedRunId!;

			// Another tab replaces the run between confirmation and commit.
			const replacementStarted = await import('$lib/scenarios/runtime').then((m) =>
				m.startScenario(definition, definition.officialSeed + 5)
			);
			if (!replacementStarted.ok) throw new Error('replacement start failed');
			const replacement = replacementStarted.value;
			await scenarioRepository.saveActiveRun(replacement, { replace: true });

			// Step 2: confirmed start with the stale expectedRunId. The
			// compare-and-swap detects the identity mismatch and refuses the
			// write instead of silently clobbering the newer run.
			const result = await harness.controller.startScenarioRun(
				definition,
				definition.officialSeed + 1,
				true,
				expectedRunId
			);
			expect(result).toEqual({
				status: 'confirmation-required',
				expectedRunId: replacement.runId,
				expectedRevision: 2
			});
			expect(harness.controller.state.activeScenarioRun?.runId).toBe(replacement.runId);
			expect(harness.controller.state.scenarioOperationError).toBeNull();
			expect(harness.controller.state.retryScenarioOperation).toBeNull();
		});

		it('returns failed and arms a retry when saveActiveRun throws', async () => {
			const harness = createHarness({
				createScenarioRepository: async () => failingScenarioRepository()
			});
			await harness.controller.initializeScenarios();
			const definition = firstProfitDefinition();
			const result = await harness.controller.startScenarioRun(definition, definition.officialSeed);
			expect(result).toEqual({ status: 'failed' });
			expect(harness.controller.state.scenarioOperationError?.code).toBe(
				'persistence-write-failed'
			);
			expect(harness.controller.state.retryScenarioOperation).not.toBeNull();
		});
	});

	it('returns confirmation-required when another tab advances the same run between dialog-open and confirm-click', async () => {
		const scenarioRepository = createScenarioMemoryRepository();
		const harness = createHarness({ scenarioRepository });
		await harness.controller.initializeScenarios();
		await startScenario(harness.controller);
		const existingRun = harness.controller.state.activeScenarioRun!;
		const definition = firstProfitDefinition();

		// Step 1: unconfirmed start discovers the existing run and returns
		// its (runId, revision) pair as the confirmation token.
		const confirmResult = await harness.controller.startScenarioRun(
			definition,
			definition.officialSeed + 1,
			false
		);
		expect(confirmResult.status).toBe('confirmation-required');
		if (confirmResult.status !== 'confirmation-required') {
			throw new Error('Expected confirmation-required');
		}
		const expectedRunId = confirmResult.expectedRunId!;
		const expectedRevision = confirmResult.expectedRevision!;
		expect(expectedRunId).toBe(existingRun.runId);
		expect(expectedRevision).toBe(1);

		// Another tab advances the SAME run (runId unchanged, revision
		// bumped from 1 to 2) between dialog-open and confirm-click. This
		// is the race the revision token closes: without binding the
		// confirmed write to the stale revision, the confirmed call would
		// re-read the now-bumped revision, the runId check would pass, the
		// fresh-revision check would pass, and the replacement would
		// silently clobber the other tab's progress.
		await scenarioRepository.saveActiveRun(existingRun, { expectedRevision: 1 });

		// Step 2: confirmed start with the stale (runId, revision) token.
		// The CAS detects the revision mismatch and refuses the write,
		// re-surfacing confirmation with the newer revision.
		const result = await harness.controller.startScenarioRun(
			definition,
			definition.officialSeed + 1,
			true,
			expectedRunId,
			expectedRevision
		);
		expect(result).toEqual({
			status: 'confirmation-required',
			expectedRunId: existingRun.runId,
			expectedRevision: 2
		});
		expect(harness.controller.state.activeScenarioRun?.runId).toBe(existingRun.runId);
		expect(harness.controller.state.activeScenarioRevision).toBe(2);
		expect(harness.controller.state.scenarioOperationError).toBeNull();
		expect(harness.controller.state.retryScenarioOperation).toBeNull();
	});

	describe('resumeScenarioRun', () => {
		it('returns unavailable before scenarios are initialized', async () => {
			const harness = createHarness();
			const result = await harness.controller.resumeScenarioRun('first-profit');
			expect(result).toEqual({ status: 'unavailable' });
			expect(harness.controller.state.scenarioOperationError?.code).toBe('persistence-read-failed');
		});

		it('returns unavailable when no run is stored', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			const result = await harness.controller.resumeScenarioRun('first-profit');
			expect(result).toEqual({ status: 'unavailable' });
			expect(harness.controller.state.scenarioOperationError?.code).toBe('missing-run');
		});

		it('loads the run and switches to scenario mode', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			harness.controller.returnToSandbox();
			const result = await harness.controller.resumeScenarioRun('first-profit');
			expect(result).toEqual({ status: 'committed' });
			expect(harness.controller.state.playMode).toBe('scenario');
			expect(harness.controller.state.activeScenarioRun).not.toBeNull();
		});

		it('keeps the run reference stable when resuming a content-identical active run', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const before = harness.controller.state.activeScenarioRun;
			harness.controller.returnToSandbox();
			const result = await harness.controller.resumeScenarioRun('first-profit');
			expect(result).toEqual({ status: 'committed' });
			expect(harness.controller.state.activeScenarioRun).toBe(before);
		});

		it('returns failed and arms a retry when loadActiveRun throws', async () => {
			const harness = createHarness({
				createScenarioRepository: async () =>
					failingScenarioRepository({
						loadActiveRun: async () => {
							throw new Error('read failed');
						},
						loadActiveRunWithRevision: async () => {
							throw new Error('read failed');
						}
					})
			});
			await harness.controller.initializeScenarios();
			const result = await harness.controller.resumeScenarioRun('first-profit');
			expect(result).toEqual({ status: 'failed' });
			expect(harness.controller.state.scenarioOperationError?.code).toBe('persistence-read-failed');
			expect(harness.controller.state.retryScenarioOperation).not.toBeNull();
		});
	});

	describe('restartScenarioRun', () => {
		it('returns unavailable before scenarios are initialized', async () => {
			const harness = createHarness();
			const result = await harness.controller.restartScenarioRun(FIRST_PROFIT_REF);
			expect(result).toEqual({ status: 'unavailable' });
		});

		it('returns unavailable when no run is stored', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			const result = await harness.controller.restartScenarioRun(FIRST_PROFIT_REF);
			expect(result).toEqual({ status: 'unavailable' });
			expect(harness.controller.state.scenarioOperationError?.code).toBe('missing-run');
		});

		it('returns unavailable when the stored run version does not match the ref', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const result = await harness.controller.restartScenarioRun({
				scenarioId: 'first-profit',
				version: 99
			});
			expect(result).toEqual({ status: 'unavailable' });
			expect(harness.controller.state.scenarioOperationError?.code).toBe('stale-definition');
		});

		it('returns rejected when the definition cannot be resolved', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			// Use a controller whose resolver returns undefined for every ref,
			// so the run matches the ref but the definition is unresolvable.
			const controller2 = new GameRouteController({
				createSaveRepository: async () => createSaveRepository(),
				createScenarioRepository: async () => scenarioRepository,
				resolveScenarioDefinition: () => undefined,
				playSfx: vi.fn()
			});
			await controller2.initializeScenarios();
			const result = await controller2.restartScenarioRun(FIRST_PROFIT_REF);
			expect(result).toEqual({ status: 'rejected' });
			expect(controller2.state.scenarioOperationError?.code).toBe('stale-definition');
		});

		it('restarts the run with the stored seed and refreshes the summary', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const originalRunId = harness.controller.state.activeScenarioRun!.runId;
			const result = await harness.controller.restartScenarioRun(FIRST_PROFIT_REF);
			expect(result).toEqual({ status: 'committed' });
			expect(harness.controller.state.activeScenarioRun?.runId).not.toBe(originalRunId);
		});

		it('returns failed with a read-phase error when loadActiveRun throws', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const failing = failingScenarioRepository({
				loadActiveRun: async () => {
					throw new Error('read failed');
				},
				loadActiveRunWithRevision: async () => {
					throw new Error('read failed');
				}
			});
			const harness2 = createHarness({
				createScenarioRepository: async () => failing
			});
			await harness2.controller.initializeScenarios();
			const result = await harness2.controller.restartScenarioRun(FIRST_PROFIT_REF);
			expect(result).toEqual({ status: 'failed' });
			expect(harness2.controller.state.scenarioOperationError?.code).toBe(
				'persistence-read-failed'
			);
		});

		it('returns failed with a write-phase error when saveActiveRun throws', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const storedRun = harness.controller.state.activeScenarioRun!;

			const failing = failingScenarioRepository({
				loadActiveRun: async () => storedRun,
				loadActiveRunWithRevision: async () => ({ run: storedRun, revision: 0 }),
				saveActiveRun: async () => {
					throw new Error('write failed');
				}
			});
			const harness2 = createHarness({
				createScenarioRepository: async () => failing
			});
			await harness2.controller.initializeScenarios();
			const result = await harness2.controller.restartScenarioRun(FIRST_PROFIT_REF);
			expect(result).toEqual({ status: 'failed' });
			expect(harness2.controller.state.scenarioOperationError?.code).toBe(
				'persistence-write-failed'
			);
		});

		it('returns confirmation-required when another tab replaced the run between read and write', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);

			// Simulate another tab replacing the run between the controller's
			// loadActiveRun read and the saveActiveRun write. The controller
			// passes the loaded run's runId as the compare-and-swap identity;
			// the repository's internal read finds a different runId and
			// refuses the save. Mock saveActiveRun to return that conflict.
			const definition = firstProfitDefinition();
			const replacementStarted = await import('$lib/scenarios/runtime').then((m) =>
				m.startScenario(definition, definition.officialSeed + 5)
			);
			if (!replacementStarted.ok) throw new Error('replacement start failed');
			const replacement = replacementStarted.value;
			const conflictOutcome: ScenarioSaveOutcome = {
				status: 'conflict',
				activeRun: replacement,
				revision: 0
			};
			vi.spyOn(harness.scenarioRepository, 'saveActiveRun').mockResolvedValue(conflictOutcome);

			const result = await harness.controller.restartScenarioRun(FIRST_PROFIT_REF);
			expect(result).toEqual({ status: 'confirmation-required' });
			expect(harness.controller.state.activeScenarioRun?.runId).toBe(replacement.runId);
			expect(harness.controller.state.scenarioOperationError).toBeNull();
			expect(harness.controller.state.retryScenarioOperation).toBeNull();
		});
	});

	describe('importScenarioRun', () => {
		it('returns unavailable before scenarios are initialized', async () => {
			const harness = createHarness();
			const definition = firstProfitDefinition();
			const result = await harness.controller.importScenarioRun(
				definition,
				definition.officialSeed,
				false
			);
			expect(result).toEqual({ status: 'unavailable' });
		});

		it('returns confirmation-required with the existing runId when an active run exists and confirmed is false', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const existingRunId = harness.controller.state.activeScenarioRun!.runId;
			const definition = firstProfitDefinition();
			const result = await harness.controller.importScenarioRun(
				definition,
				definition.officialSeed + 1,
				false
			);
			expect(result).toEqual({
				status: 'confirmation-required',
				expectedRunId: existingRunId,
				expectedRevision: 1
			});
		});

		it('starts and persists when confirmed is true', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const originalRunId = harness.controller.state.activeScenarioRun!.runId;
			const definition = firstProfitDefinition();
			const result = await harness.controller.importScenarioRun(
				definition,
				definition.officialSeed + 1,
				true
			);
			expect(result).toEqual({ status: 'committed' });
			expect(harness.controller.state.activeScenarioRun?.runId).not.toBe(originalRunId);
		});

		it('returns rejected when the definition cannot start', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			const definition = firstProfitDefinition();
			const broken: ScenarioDefinition = {
				...definition,
				start: {
					...definition.start,
					foundingStore: {
						...definition.start.foundingStore,
						cityId: 'missing-city' as WorldCityId
					}
				}
			};
			const result = await harness.controller.importScenarioRun(
				broken,
				definition.officialSeed,
				false
			);
			expect(result).toEqual({ status: 'rejected' });
		});

		it('returns failed with a read-phase error when loadActiveRun throws', async () => {
			const harness = createHarness({
				createScenarioRepository: async () =>
					failingScenarioRepository({
						loadActiveRun: async () => {
							throw new Error('read failed');
						},
						loadActiveRunWithRevision: async () => {
							throw new Error('read failed');
						}
					})
			});
			await harness.controller.initializeScenarios();
			const definition = firstProfitDefinition();
			const result = await harness.controller.importScenarioRun(
				definition,
				definition.officialSeed,
				false
			);
			expect(result).toEqual({ status: 'failed' });
			expect(harness.controller.state.scenarioOperationError?.code).toBe('persistence-read-failed');
		});

		it('returns failed with a write-phase error when saveActiveRun throws', async () => {
			const harness = createHarness({
				createScenarioRepository: async () => failingScenarioRepository()
			});
			await harness.controller.initializeScenarios();
			const definition = firstProfitDefinition();
			const result = await harness.controller.importScenarioRun(
				definition,
				definition.officialSeed,
				false
			);
			expect(result).toEqual({ status: 'failed' });
			expect(harness.controller.state.scenarioOperationError?.code).toBe(
				'persistence-write-failed'
			);
		});

		it('returns confirmation-required when a confirmed import loses the compare-and-swap', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const definition = firstProfitDefinition();

			// Step 1: unconfirmed import discovers the existing run and returns
			// its runId as the expected identity.
			const confirmResult = await harness.controller.importScenarioRun(
				definition,
				definition.officialSeed + 1,
				false
			);
			expect(confirmResult).toEqual({
				status: 'confirmation-required',
				expectedRunId: harness.controller.state.activeScenarioRun!.runId,
				expectedRevision: 1
			});
			if (confirmResult.status !== 'confirmation-required') {
				throw new Error('Expected confirmation-required');
			}
			const expectedRunId = confirmResult.expectedRunId!;

			// Another tab replaces the run between confirmation and commit.
			const replacementStarted = await import('$lib/scenarios/runtime').then((m) =>
				m.startScenario(definition, definition.officialSeed + 5)
			);
			if (!replacementStarted.ok) throw new Error('replacement start failed');
			const replacement = replacementStarted.value;
			await scenarioRepository.saveActiveRun(replacement, { replace: true });

			// Step 2: confirmed import with the stale expectedRunId. The
			// compare-and-swap detects the identity mismatch and refuses the
			// write instead of silently clobbering the newer run.
			const result = await harness.controller.importScenarioRun(
				definition,
				definition.officialSeed + 1,
				true,
				expectedRunId
			);
			expect(result).toEqual({
				status: 'confirmation-required',
				expectedRunId: replacement.runId,
				expectedRevision: 2
			});
			expect(harness.controller.state.activeScenarioRun?.runId).toBe(replacement.runId);
			expect(harness.controller.state.scenarioOperationError).toBeNull();
			expect(harness.controller.state.retryScenarioOperation).toBeNull();
		});

		it('returns confirmation-required when an import into an empty slot loses the compare-and-swap', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			const definition = firstProfitDefinition();

			// No existing run — the unconfirmed import proceeds to save with
			// expectedRunId: null (expecting absence). Before the write lands,
			// another tab starts a run. Mock saveActiveRun to return the
			// conflict the repository would produce.
			const other = await import('$lib/scenarios/runtime').then((m) =>
				m.startScenario(definition, definition.officialSeed + 5)
			);
			if (!other.ok) throw new Error('other start failed');
			const conflictOutcome: ScenarioSaveOutcome = {
				status: 'conflict',
				activeRun: other.value,
				revision: 0
			};
			vi.spyOn(harness.scenarioRepository, 'saveActiveRun').mockResolvedValue(conflictOutcome);

			const result = await harness.controller.importScenarioRun(
				definition,
				definition.officialSeed + 1,
				false
			);
			expect(result).toEqual({
				status: 'confirmation-required',
				expectedRunId: other.value.runId,
				expectedRevision: 0
			});
			expect(harness.controller.state.activeScenarioRun?.runId).toBe(other.value.runId);
			expect(harness.controller.state.scenarioOperationError).toBeNull();
		});
	});

	it('returns confirmation-required when another tab advances the same run between dialog-open and confirm-click', async () => {
		const scenarioRepository = createScenarioMemoryRepository();
		const harness = createHarness({ scenarioRepository });
		await harness.controller.initializeScenarios();
		await startScenario(harness.controller);
		const existingRun = harness.controller.state.activeScenarioRun!;
		const definition = firstProfitDefinition();

		// Step 1: unconfirmed import discovers the existing run and returns
		// its (runId, revision) pair as the confirmation token.
		const confirmResult = await harness.controller.importScenarioRun(
			definition,
			definition.officialSeed + 1,
			false
		);
		expect(confirmResult.status).toBe('confirmation-required');
		if (confirmResult.status !== 'confirmation-required') {
			throw new Error('Expected confirmation-required');
		}
		const expectedRunId = confirmResult.expectedRunId!;
		const expectedRevision = confirmResult.expectedRevision!;
		expect(expectedRunId).toBe(existingRun.runId);
		expect(expectedRevision).toBe(1);

		// Another tab advances the SAME run (runId unchanged, revision
		// bumped from 1 to 2) between dialog-open and confirm-click.
		await scenarioRepository.saveActiveRun(existingRun, { expectedRevision: 1 });

		// Step 2: confirmed import with the stale (runId, revision) token.
		// The CAS detects the revision mismatch and refuses the write.
		const result = await harness.controller.importScenarioRun(
			definition,
			definition.officialSeed + 1,
			true,
			expectedRunId,
			expectedRevision
		);
		expect(result).toEqual({
			status: 'confirmation-required',
			expectedRunId: existingRun.runId,
			expectedRevision: 2
		});
		expect(harness.controller.state.activeScenarioRun?.runId).toBe(existingRun.runId);
		expect(harness.controller.state.activeScenarioRevision).toBe(2);
		expect(harness.controller.state.scenarioOperationError).toBeNull();
		expect(harness.controller.state.retryScenarioOperation).toBeNull();
	});

	describe('abandonScenarioRun', () => {
		it('returns unavailable when no run is active', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			const result = await harness.controller.abandonScenarioRun();
			expect(result).toEqual({ status: 'unavailable' });
		});

		it('removes the run and returns to sandbox mode', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const result = await harness.controller.abandonScenarioRun();
			expect(result).toEqual({ status: 'committed' });
			expect(harness.controller.state.activeScenarioRun).toBeNull();
			expect(harness.controller.state.playMode).toBe('sandbox');
		});

		it('returns failed and arms a retry when commitTerminalRun throws', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			vi.spyOn(harness.scenarioRepository, 'commitTerminalRun').mockRejectedValue(
				new Error('commit failed')
			);
			const result = await harness.controller.abandonScenarioRun();
			expect(result).toEqual({ status: 'failed' });
			expect(harness.controller.state.scenarioOperationError?.code).toBe(
				'persistence-write-failed'
			);
			expect(harness.controller.state.retryScenarioOperation).not.toBeNull();
		});

		it('refuses to commit a terminal over a run advanced by another tab and surfaces the preserved run', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness1 = createHarness({ scenarioRepository });
			await harness1.controller.initializeScenarios();
			await startScenario(harness1.controller);
			const run = harness1.controller.state.activeScenarioRun!;

			// harness2 resumes the same run (gets revision 1).
			const harness2 = createHarness({ scenarioRepository });
			await harness2.controller.initializeScenarios();
			expect(harness2.controller.state.activeScenarioRun?.runId).toBe(run.runId);
			expect(harness2.controller.state.activeScenarioRevision).toBe(1);

			// harness1 advances the run (revision becomes 2, game state
			// changes). harness2's in-memory run is now stale.
			await harness1.controller.advanceDay();
			expect(harness1.controller.state.activeScenarioRevision).toBe(2);

			// harness2 abandons. The repository must refuse the terminal
			// commit because the stored revision (2) no longer matches
			// harness2's tracked revision (1). The preserved run is surfaced
			// so the UI can offer Resume instead of silently destroying
			// progress.
			const commitSpy = vi.spyOn(harness2.scenarioRepository, 'commitTerminalRun');
			const result = await harness2.controller.abandonScenarioRun();
			expect(result).toEqual({ status: 'confirmation-required' });
			expect(harness2.controller.state.activeScenarioRun?.runId).toBe(run.runId);
			expect(harness2.controller.state.activeScenarioRun?.game.day).toBe(run.game.day + 1);
			expect(harness2.controller.state.activeScenarioRevision).toBe(2);
			// The run is still in storage.
			const stored = await scenarioRepository.loadActiveRun(run.definition.scenarioId);
			expect(stored?.runId).toBe(run.runId);
			expect(commitSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					definition: run.definition,
					status: 'abandoned'
				}),
				{ expectedRevision: 1 }
			);
		});

		it('rereads an atomic run/revision pair when the tracked revision is null and refuses to commit a terminal over a run advanced by another tab', async () => {
			// When the tracked revision is null (init read failure,
			// post-terminal replacement, or re-init after removal), the
			// abandon must NOT call commitTerminalRun with an undefined
			// expectedRevision — that would omit the revision CAS and clear
			// the active entry on runId alone. Another tab can advance the
			// same run (same runId, bumped revision) between this tab's last
			// observation and the abandon; the runId check passes and the
			// stale tab commits a stale terminal over the newer revision.
			// The reread catches this: it re-reads an atomic run/revision
			// pair, compares the full run state, and surfaces a conflict if
			// they differ.
			const scenarioRepository = createScenarioMemoryRepository();
			const harness1 = createHarness({ scenarioRepository });
			await harness1.controller.initializeScenarios();
			await startScenario(harness1.controller);
			const run = harness1.controller.state.activeScenarioRun!;

			// harness2 resumes the same run but simulates a null tracked
			// revision (init read failure path).
			const harness2 = createHarness({ scenarioRepository });
			await harness2.controller.initializeScenarios();
			// Force the tracked revision to null to exercise the reread path.
			harness2.controller['patchState']({
				activeScenarioRevision: null
			});
			expect(harness2.controller.state.activeScenarioRevision).toBeNull();

			// harness1 advances the run (revision becomes 2, game state
			// changes). harness2's in-memory run is now stale.
			await harness1.controller.advanceDay();
			expect(harness1.controller.state.activeScenarioRevision).toBe(2);

			// harness2 abandons with a null revision. The reread must
			// detect the content difference and surface a conflict instead
			// of calling commitTerminalRun with an undefined expectedRevision.
			const commitSpy = vi.spyOn(harness2.scenarioRepository, 'commitTerminalRun');
			const result = await harness2.controller.abandonScenarioRun();
			expect(result).toEqual({ status: 'confirmation-required' });
			expect(harness2.controller.state.activeScenarioRun?.runId).toBe(run.runId);
			expect(harness2.controller.state.activeScenarioRun?.game.day).toBe(run.game.day + 1);
			// commitTerminalRun must NOT have been called — the reread
			// detected the content difference and refused before reaching
			// the terminal commit call.
			expect(commitSpy).not.toHaveBeenCalled();
		});

		it('rereads and successfully commits the terminal when the tracked revision is null and the stored run still matches', async () => {
			// When the tracked revision is null but the reread confirms the
			// stored run is identical to the in-memory run, the abandon
			// proceeds with the reread's revision bound to the terminal
			// commit's CAS.
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const run = harness.controller.state.activeScenarioRun!;
			expect(harness.controller.state.activeScenarioRevision).toBe(1);

			// Force the tracked revision to null to exercise the reread path.
			harness.controller['patchState']({ activeScenarioRevision: null });

			const commitSpy = vi.spyOn(harness.scenarioRepository, 'commitTerminalRun');
			const result = await harness.controller.abandonScenarioRun();
			expect(result).toEqual({ status: 'committed' });
			expect(harness.controller.state.activeScenarioRun).toBeNull();
			// commitTerminalRun must have been called with the reread's
			// revision (1), not undefined, and the abandoned terminal run.
			expect(commitSpy).toHaveBeenCalledWith(
				expect.objectContaining({
					definition: run.definition,
					status: 'abandoned',
					result: expect.objectContaining({ outcome: 'abandoned' })
				}),
				{ expectedRevision: 1 }
			);
		});

		it('rereads and surfaces confirmation-required when the run was removed by another tab and the tracked revision is null', async () => {
			// When the tracked revision is null and the reread returns no
			// record (another tab abandoned the run between this tab's last
			// observation and the reread), surface the absence as a
			// confirmation-required so the UI reconciles instead of
			// claiming a successful abandon that did nothing.
			const scenarioRepository = createScenarioMemoryRepository();
			const harness1 = createHarness({ scenarioRepository });
			await harness1.controller.initializeScenarios();
			await startScenario(harness1.controller);

			const harness2 = createHarness({ scenarioRepository });
			await harness2.controller.initializeScenarios();
			harness2.controller['patchState']({ activeScenarioRevision: null });

			// harness1 abandons first, removing the run from storage.
			await harness1.controller.abandonScenarioRun();

			const commitSpy = vi.spyOn(harness2.scenarioRepository, 'commitTerminalRun');
			const result = await harness2.controller.abandonScenarioRun();
			expect(result).toEqual({ status: 'confirmation-required' });
			expect(harness2.controller.state.activeScenarioRun).toBeNull();
			expect(harness2.controller.state.activeScenarioRevision).toBeNull();
			// commitTerminalRun must NOT have been called — the reread
			// returned no record and the abandon refused.
			expect(commitSpy).not.toHaveBeenCalled();
		});
	});

	describe('commitMutation sandbox paths', () => {
		it('returns unavailable when no sandbox game is loaded and the mutation requires one', async () => {
			const harness = createHarness();
			const result = await harness.controller.advanceDay();
			expect(result).toEqual({ status: 'unavailable' });
		});

		it('commits a sandbox mutation and plays the cue', async () => {
			const harness = createHarness();
			await harness.controller.initializeSaves();
			const game = createNewGame('convenience', 3);
			harness.controller.loadSandboxGame(game);
			const result = await harness.controller.advanceDay();
			expect(result.status).toBe('sandbox-committed');
			expect((result as { changed: boolean }).changed).toBe(true);
			expect(harness.controller.state.sandboxGame?.day).toBe(game.day + 1);
			expect(harness.sfx).toHaveBeenCalledWith('sfx.time.advance-day');
			await flushMicrotasks();
			expect(harness.onAutoSave).toHaveBeenCalled();
		});

		it('reports unchanged when the transition returns the same game reference', async () => {
			const harness = createHarness();
			const game = createNewGame('convenience', 3);
			harness.controller.loadSandboxGame(game);
			// upgradeStore returns the same reference when the store id does not exist.
			const result = await harness.controller.upgradeStore('nonexistent-store');
			expect(result).toEqual({ status: 'sandbox-committed', changed: false });
		});

		it('foundStore allows a missing sandbox game', async () => {
			const harness = createHarness();
			const game = createNewGame('convenience', 1);
			const result = await harness.controller.foundStore({
				archetypeId: 'convenience',
				city: game.cities[0]!,
				tileId: 'harbor-city-1-1',
				seed: 123
			});
			expect(result.status).toBe('sandbox-committed');
			expect(harness.controller.state.sandboxGame).not.toBeNull();
		});
	});

	describe('commitMutation scenario paths', () => {
		it('commits an allowed scenario command and persists the run', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const before = harness.controller.state.activeScenarioRun!;
			const result = await harness.controller.advanceDay();
			expect(result).toEqual({ status: 'committed' });
			expect(harness.controller.state.activeScenarioRun?.game.day).toBe(before.game.day + 1);
			expect(harness.sfx).toHaveBeenCalledWith('sfx.time.advance-day');
		});

		it('returns rejected when the command is not allowed by the definition', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			// openStore is not in STANDARD_RETAIL_COMMANDS.
			const result = await harness.controller.openStore('harbor-city-2-2', 'convenience');
			expect(result).toEqual({ status: 'rejected' });
			expect(harness.controller.state.scenarioOperationError?.code).toBe('forbidden-command');
		});

		it('returns unchanged when a no-op command targets a missing entity', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			// resolveDecision is allowed but returns the same game for a missing decision id.
			const result = await harness.controller.resolveDecision('no-such-decision', 'no-such-option');
			expect(result).toEqual({ status: 'unchanged' });
		});

		it('returns rejected when the definition can no longer be resolved', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);

			const controller2 = new GameRouteController({
				createSaveRepository: async () => createSaveRepository(),
				createScenarioRepository: async () => scenarioRepository,
				resolveScenarioDefinition: () => undefined,
				playSfx: vi.fn()
			});
			await controller2.initializeScenarios();
			const result = await controller2.advanceDay();
			expect(result).toEqual({ status: 'rejected' });
			expect(controller2.state.scenarioOperationError?.code).toBe('stale-definition');
		});

		it('returns failed and arms a retry when persistence throws', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			vi.spyOn(harness.scenarioRepository, 'saveActiveRun').mockRejectedValue(
				new Error('write failed')
			);
			const result = await harness.controller.advanceDay();
			expect(result).toEqual({ status: 'failed' });
			expect(harness.controller.state.scenarioOperationError?.code).toBe(
				'persistence-write-failed'
			);
			expect(harness.controller.state.retryScenarioOperation).not.toBeNull();
		});

		it('surfaces the stored run and returns confirmation-required on a save conflict', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			// Build a replacement run directly via the runtime (not the controller,
			// which would conflict with the already-persisted run).
			const definition = firstProfitDefinition();
			const started = await import('$lib/scenarios/runtime').then((m) =>
				m.startScenario(definition, definition.officialSeed + 5)
			);
			if (!started.ok) throw new Error('replacement start failed');
			const replacement = started.value;
			const conflictOutcome: ScenarioSaveOutcome = {
				status: 'conflict',
				activeRun: replacement,
				revision: 0
			};
			vi.spyOn(harness.scenarioRepository, 'saveActiveRun').mockResolvedValue(conflictOutcome);
			const result = await harness.controller.advanceDay();
			// The conflict is not a persistence-write failure — the write was
			// refused by compare-and-swap. Surface the stored replacement and
			// return confirmation-required so the UI can offer Resume. No retry
			// is armed (it would be dead: the conflict already replaced
			// activeScenarioRun, so the retry's isValid guard is false).
			expect(result).toEqual({ status: 'confirmation-required' });
			expect(harness.controller.state.activeScenarioRun?.runId).toBe(replacement.runId);
			expect(harness.controller.state.scenarioOperationError).toBeNull();
			expect(harness.controller.state.retryScenarioOperation).toBeNull();
		});

		it('suppresses the success sound effect when a save conflict refuses the command (P3)', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			const definition = firstProfitDefinition();
			const started = await import('$lib/scenarios/runtime').then((m) =>
				m.startScenario(definition, definition.officialSeed + 5)
			);
			if (!started.ok) throw new Error('replacement start failed');
			const replacement = started.value;
			const conflictOutcome: ScenarioSaveOutcome = {
				status: 'conflict',
				activeRun: replacement,
				revision: 0
			};
			vi.spyOn(harness.scenarioRepository, 'saveActiveRun').mockResolvedValue(conflictOutcome);
			harness.sfx.mockClear();
			const result = await harness.controller.advanceDay();
			expect(result).toEqual({ status: 'confirmation-required' });
			// The command was refused by compare-and-swap, so the success
			// sound effect must NOT play — playing it would mislead the user
			// into thinking the advance-day command landed.
			expect(harness.sfx).not.toHaveBeenCalled();
		});

		it('returns unchanged when the command produces an identical game', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			const run = await startScenario(harness.controller);
			// updatePolicy with the same values is a no-op (deeplyEqual detects it).
			const result = await harness.controller.updatePolicy(run.game.policy);
			expect(result).toEqual({ status: 'unchanged' });
		});
	});

	it('re-reads an atomic run/revision pair when the tracked revision is null and binds the write to the fresh revision', async () => {
		const scenarioRepository = createScenarioMemoryRepository();
		const harness = createHarness({ scenarioRepository });
		await harness.controller.initializeScenarios();
		await startScenario(harness.controller);
		const run = harness.controller.state.activeScenarioRun!;

		// Stage the run with a null revision by failing the init re-read
		// on a second controller sharing the same repository. The summary
		// still lists the run, so the controller stages it with a null
		// revision (the documented init-failure fallback).
		const harness2 = createHarness({ scenarioRepository });
		const loadSpy = vi.spyOn(harness2.scenarioRepository, 'loadActiveRunWithRevision');
		loadSpy.mockRejectedValueOnce(new Error('transient read failure'));
		await harness2.controller.initializeScenarios();
		expect(harness2.controller.state.activeScenarioRun?.runId).toBe(run.runId);
		expect(harness2.controller.state.activeScenarioRevision).toBeNull();

		// Issue a command. The persist step must re-read (because the
		// tracked revision is null) and bind the write to the fresh
		// revision instead of writing without CAS.
		const saveSpy = vi.spyOn(harness2.scenarioRepository, 'saveActiveRun');
		const result = await harness2.controller.advanceDay();
		expect(result).toEqual({ status: 'committed' });
		expect(saveSpy).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ expectedRevision: 1 })
		);
		expect(harness2.controller.state.activeScenarioRevision).toBe(2);
	});

	it('surfaces a conflict when the re-read returns the same runId but a different game state and the tracked revision is null', async () => {
		const scenarioRepository = createScenarioMemoryRepository();
		const harness1 = createHarness({ scenarioRepository });
		await harness1.controller.initializeScenarios();
		await startScenario(harness1.controller);
		const run = harness1.controller.state.activeScenarioRun!;

		// Stage the run with a null revision on a second controller sharing
		// the same repository. The summary still lists the run, so the
		// controller stages it with a null revision (the documented
		// init-failure fallback).
		const harness2 = createHarness({ scenarioRepository });
		const loadSpy = vi.spyOn(harness2.scenarioRepository, 'loadActiveRunWithRevision');
		loadSpy.mockRejectedValueOnce(new Error('transient read failure'));
		await harness2.controller.initializeScenarios();
		expect(harness2.controller.state.activeScenarioRun?.runId).toBe(run.runId);
		expect(harness2.controller.state.activeScenarioRevision).toBeNull();

		// Another tab advances the same run (same runId, bumped revision,
		// different game state) between harness2's prepare and persist.
		// harness2's in-memory run is now stale (day-1) while the stored
		// run is day-2.
		await harness1.controller.advanceDay();
		expect(harness1.controller.state.activeScenarioRun?.game.day).toBe(run.game.day + 1);

		// harness2 issues a command computed from its stale in-memory run.
		// The persist step re-reads (because the tracked revision is null)
		// and must detect that the re-read run differs from the in-memory
		// run it prepared against — surfacing a conflict instead of writing
		// the stale-state-derived result over the other tab's progress.
		const saveSpy = vi.spyOn(harness2.scenarioRepository, 'saveActiveRun');
		const result = await harness2.controller.advanceDay();
		expect(result).toEqual({ status: 'confirmation-required' });
		expect(harness2.controller.state.activeScenarioRun?.runId).toBe(run.runId);
		expect(harness2.controller.state.activeScenarioRun?.game.day).toBe(run.game.day + 1);
		expect(harness2.controller.state.scenarioOperationError).toBeNull();
		expect(harness2.controller.state.retryScenarioOperation).toBeNull();
		expect(saveSpy).not.toHaveBeenCalled();
	});

	it('surfaces a conflict when the re-read returns no record and the tracked revision is null', async () => {
		const scenarioRepository = createScenarioMemoryRepository();
		const harness = createHarness({ scenarioRepository });
		await harness.controller.initializeScenarios();
		await startScenario(harness.controller);

		// Stage the run with a null revision on a second controller.
		const harness2 = createHarness({ scenarioRepository });
		const loadSpy = vi.spyOn(harness2.scenarioRepository, 'loadActiveRunWithRevision');
		loadSpy.mockRejectedValueOnce(new Error('transient read failure'));
		await harness2.controller.initializeScenarios();
		expect(harness2.controller.state.activeScenarioRevision).toBeNull();

		// Another tab removes the run between init and the next command.
		// The persist step's re-read returns null — surface a conflict
		// instead of writing without CAS (which would resurrect the run).
		loadSpy.mockResolvedValueOnce(null);
		const result = await harness2.controller.advanceDay();
		expect(result).toEqual({ status: 'confirmation-required' });
		expect(harness2.controller.state.activeScenarioRun).toBeNull();
		expect(harness2.controller.state.scenarioOperationError).toBeNull();
		expect(harness2.controller.state.retryScenarioOperation).toBeNull();
	});

	it('surfaces a conflict when the re-read returns a different runId and the tracked revision is null', async () => {
		const scenarioRepository = createScenarioMemoryRepository();
		const harness = createHarness({ scenarioRepository });
		await harness.controller.initializeScenarios();
		await startScenario(harness.controller);

		// Stage the run with a null revision on a second controller.
		const harness2 = createHarness({ scenarioRepository });
		const loadSpy = vi.spyOn(harness2.scenarioRepository, 'loadActiveRunWithRevision');
		loadSpy.mockRejectedValueOnce(new Error('transient read failure'));
		await harness2.controller.initializeScenarios();
		expect(harness2.controller.state.activeScenarioRevision).toBeNull();

		// Another tab replaces the run between init and the next command.
		// The persist step's re-read returns a different runId — surface
		// the replacement as a conflict instead of writing without CAS.
		const definition = firstProfitDefinition();
		const replacementStarted = await import('$lib/scenarios/runtime').then((m) =>
			m.startScenario(definition, definition.officialSeed + 5)
		);
		if (!replacementStarted.ok) throw new Error('replacement start failed');
		const replacement = replacementStarted.value;
		loadSpy.mockResolvedValueOnce({ run: replacement, revision: 1 });
		const result = await harness2.controller.advanceDay();
		expect(result).toEqual({ status: 'confirmation-required' });
		expect(harness2.controller.state.activeScenarioRun?.runId).toBe(replacement.runId);
		expect(harness2.controller.state.scenarioOperationError).toBeNull();
		expect(harness2.controller.state.retryScenarioOperation).toBeNull();
	});

	describe('terminal scenario commands', () => {
		// The completing/failing definitions modify first-profit's objectives/failures.
		// The repository's resolver must return these modified definitions so the run
		// encodes/decodes consistently.
		function completingResolver(ref: ScenarioDefinitionRef): ScenarioDefinition | undefined {
			if (ref.scenarioId === 'first-profit' && ref.version === 1) return completingDefinition();
			return resolveScenarioDefinition(ref);
		}

		function failingResolver(ref: ScenarioDefinitionRef): ScenarioDefinition | undefined {
			if (ref.scenarioId === 'first-profit' && ref.version === 1) return failingDefinition();
			return resolveScenarioDefinition(ref);
		}

		it('publishes a completed result, notifies the terminal-run callback, and refreshes the summary', async () => {
			const harness = createHarness({ resolveDefinition: completingResolver });
			await harness.controller.initializeScenarios();
			const run = await startScenario(harness.controller, completingDefinition());
			// The completing definition satisfies its sole objective at start, so the
			// next advanceDay completes the scenario.
			const result = await harness.controller.advanceDay();
			expect(result).toEqual({ status: 'committed' });
			expect(harness.controller.state.lastScenarioResult).not.toBeNull();
			expect(harness.controller.state.lastScenarioResult?.outcome).toBe('completed');
			expect(harness.onScenarioTerminalRun).toHaveBeenCalledWith(
				expect.objectContaining({ runId: run.runId })
			);
		});

		it('publishes a failed result when a failure condition triggers', async () => {
			const harness = createHarness({ resolveDefinition: failingResolver });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller, failingDefinition());
			const result = await harness.controller.advanceDay();
			expect(result).toEqual({ status: 'committed' });
			expect(harness.controller.state.lastScenarioResult?.outcome).toBe('failed');
		});

		it('drops the terminal run from the summary when the post-terminal refresh fails', async () => {
			const harness = createHarness({ resolveDefinition: completingResolver });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller, completingDefinition());
			harness.onScenarioSummary.mockClear();
			vi.spyOn(harness.scenarioRepository, 'getSummary').mockRejectedValue(
				new Error('refresh failed')
			);
			await harness.controller.advanceDay();
			expect(harness.controller.state.lastScenarioResult?.outcome).toBe('completed');
			// The summary was updated in-memory to drop the terminal run.
			expect(harness.onScenarioSummary).toHaveBeenCalled();
			const lastSummary = harness.onScenarioSummary.mock.calls.at(
				-1
			)![0] as ScenarioPersistenceSummary;
			expect(lastSummary.activeRunsByScenarioId['first-profit']).toBeUndefined();
		});

		it('updates the summary with the replacement run when the post-terminal refresh fails but a run is retained', async () => {
			const harness = createHarness({ resolveDefinition: completingResolver });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller, completingDefinition());
			// Make getSummary fail, but have commitTerminalRun return a replacement
			// active run alongside the actual terminal result from the completing run.
			const storedRun = harness.controller.state.activeScenarioRun!;
			const replacementRun: ScenarioRun = {
				...storedRun,
				runId: crypto.randomUUID(),
				result: null,
				status: 'active'
			};
			vi.spyOn(harness.scenarioRepository, 'commitTerminalRun').mockImplementation(async (run) => ({
				activeRun: replacementRun,
				terminalResult: run.result,
				bestUpdated: false
			}));
			vi.spyOn(harness.scenarioRepository, 'getSummary').mockRejectedValue(
				new Error('refresh failed')
			);
			await harness.controller.advanceDay();
			expect(harness.controller.state.lastScenarioResult?.outcome).toBe('completed');
			const lastSummary = harness.onScenarioSummary.mock.calls.at(
				-1
			)![0] as ScenarioPersistenceSummary;
			expect(lastSummary.activeRunsByScenarioId['first-profit']?.runId).toBe(replacementRun.runId);
		});
	});

	describe('retry behavior', () => {
		it('invalidates an earlier retry when a new operation arms a fresh retry', async () => {
			const harness = createHarness({
				createScenarioRepository: async () =>
					failingScenarioRepository({
						getSummary: async () => {
							throw new Error('storage down');
						},
						loadActiveRun: async () => {
							throw new Error('read failed');
						},
						loadActiveRunWithRevision: async () => {
							throw new Error('read failed');
						}
					})
			});
			await harness.controller.initializeScenarios();
			const firstRetry = harness.controller.state.retryScenarioOperation!;
			// Trigger a second failure to arm a new retry.
			await harness.controller.resumeScenarioRun('first-profit');
			const secondRetry = harness.controller.state.retryScenarioOperation!;
			expect(secondRetry).not.toBe(firstRetry);
			// Invoking the first retry should be a no-op (epoch mismatch).
			await firstRetry();
			expect(harness.controller.state.scenarioOperationError?.code).toBe('persistence-read-failed');
		});

		it('a valid retry re-attempts the operation', async () => {
			const scenarioRepository = createScenarioMemoryRepository();
			const harness = createHarness({ scenarioRepository });
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			// First attempt fails.
			vi.spyOn(harness.scenarioRepository, 'saveActiveRun').mockRejectedValueOnce(
				new Error('transient')
			);
			await harness.controller.advanceDay();
			expect(harness.controller.state.scenarioOperationError?.code).toBe(
				'persistence-write-failed'
			);
			const retry = harness.controller.state.retryScenarioOperation!;
			expect(retry).not.toBeNull();
			await retry();
			expect(harness.controller.state.scenarioOperationError).toBeNull();
		});
	});

	describe('returnToSandbox', () => {
		it('switches playMode to sandbox and clears scenario errors', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			harness.controller.returnToSandbox();
			expect(harness.controller.state.playMode).toBe('sandbox');
			expect(harness.controller.state.scenarioOperationError).toBeNull();
			expect(harness.controller.state.activeScenarioRun).not.toBeNull();
		});
	});

	describe('game getter', () => {
		it('returns the sandbox game in sandbox mode', () => {
			const harness = createHarness();
			const game = createNewGame('convenience', 2);
			harness.controller.loadSandboxGame(game);
			expect(harness.controller.game).toBe(game);
		});

		it('returns the active scenario run game in scenario mode', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			await startScenario(harness.controller);
			expect(harness.controller.game).toBe(harness.controller.state.activeScenarioRun!.game);
		});

		it('returns null in scenario mode with no active run', async () => {
			const harness = createHarness();
			await harness.controller.initializeScenarios();
			expect(harness.controller.game).toBeNull();
		});
	});
});
