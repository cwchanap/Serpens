import { describe, expect, it, vi } from 'vitest';
import { decisionContextLocationGeneric } from '$lib/game/decisionContext';
import { buildIndustrialBuilding } from '$lib/game/industryPlacement';
import {
	createIndustryPlacementPreview,
	createRetailPlacementPreview
} from '$lib/game/placementPreview';
import { buildRailNetwork, deriveRailSegments } from '$lib/game/rail';
import { buildRailPreview } from '$lib/game/railPlacement';
import { createNewGame } from '$lib/game/state';
import type {
	DecisionItem,
	GameState,
	IndustrialBuildingTypeId,
	WorldCityId
} from '$lib/game/types';
import type { SaveRepository } from '$lib/persistence/saveRepository';
import {
	SAVE_SCHEMA_VERSION,
	type SaveRecord,
	type SaveSlotMetadata
} from '$lib/persistence/saveTypes';
import type { ScenarioRepository } from '$lib/persistence/scenarioRepository';
import {
	createFixtureScenarioRun,
	resolveFixtureDefinition
} from '$lib/persistence/scenarioRepository.testUtils';
import { evaluateScenario } from '$lib/scenarios/runtime';
import type {
	ScenarioCommitOutcome,
	ScenarioDefinition,
	ScenarioPersistenceSummary,
	ScenarioRun
} from '$lib/scenarios/types';
import { GameRouteController, type GameRouteControllerOptions } from './gameRouteController';

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

function metadata(game: GameState, id = 'autosave'): SaveSlotMetadata {
	return {
		id,
		name: id,
		kind: id === 'autosave' ? 'auto' : 'manual',
		updatedAt: '2026-07-22T00:00:00.000Z',
		day: game.day,
		cash: game.cash,
		storeCount: game.stores.length,
		activeCityId: game.activeCityId
	};
}

function record(game: GameState, id = 'autosave'): SaveRecord {
	return { schemaVersion: SAVE_SCHEMA_VERSION, metadata: metadata(game, id), game };
}

function createSaveRepositoryHarness(
	input: {
		autoGame?: GameState;
		manualGame?: GameState;
		events?: string[];
	} = {}
) {
	const events = input.events ?? [];
	const repository: SaveRepository = {
		getSummary: vi.fn(async () => ({ autoSave: null, manualSlots: [] })),
		getAutoSave: vi.fn(async () => (input.autoGame ? record(input.autoGame) : null)),
		saveAuto: vi.fn(async (game) => {
			events.push('autosave');
			return metadata(game);
		}),
		createManualSlot: vi.fn(async (_name, game) => metadata(game, 'manual-1')),
		overwriteManualSlot: vi.fn(async (_slotId, _name, game) => metadata(game, 'manual-1')),
		loadManualSlot: vi.fn(async () =>
			input.manualGame ? record(input.manualGame, 'manual-1') : null
		),
		deleteManualSlot: vi.fn(async () => {})
	};
	return { repository, events };
}

function emptyScenarioSummary(run?: ScenarioRun): ScenarioPersistenceSummary {
	return {
		activeRunsByScenarioId: run ? { [run.definition.scenarioId]: run } : {},
		bestResultsByDefinitionKey: {},
		diagnostics: []
	};
}

function createScenarioRepositoryHarness(
	run?: ScenarioRun,
	overrides: Partial<ScenarioRepository> = {}
): ScenarioRepository {
	return {
		getSummary: vi.fn(async () => emptyScenarioSummary(run)),
		loadActiveRun: vi.fn(async () => run ?? null),
		saveActiveRun: vi.fn(async (nextRun) => ({
			activeRun: nextRun,
			terminalResult: null,
			bestUpdated: false
		})),
		removeActiveRun: vi.fn(async () => {}),
		commitTerminalRun: vi.fn(async (nextRun) => ({
			activeRun: null,
			terminalResult: nextRun.result,
			bestUpdated: true
		})),
		...overrides
	};
}

function boostedGame(seed = 12_001): GameState {
	const game = createNewGame('convenience', seed);
	return { ...game, cash: 5_000_000, storeCap: 10 };
}

function validRetailTile(game: GameState): string {
	const city = game.cities.find((candidate) => candidate.id === game.activeCityId)!;
	const preview = createRetailPlacementPreview({ game, city, archetypeId: 'convenience' });
	return preview.validTileIds[0]!;
}

function validIndustryTile(game: GameState, typeId: IndustrialBuildingTypeId): string {
	const preview = createIndustryPlacementPreview({ game, buildingTypeId: typeId });
	return preview.validTileIds[0]!;
}

function withTwoWarehouses(game: GameState): GameState {
	const first = buildIndustrialBuilding(game, {
		tileId: validIndustryTile(game, 'warehouse'),
		buildingTypeId: 'warehouse'
	});
	return buildIndustrialBuilding(first, {
		tileId: validIndustryTile(first, 'warehouse'),
		buildingTypeId: 'warehouse'
	});
}

function decision(): DecisionItem {
	return {
		id: 'route-test-decision',
		title: 'Route test decision',
		context: decisionContextLocationGeneric(),
		expiresOnDay: 10,
		options: [
			{
				id: 'accept',
				label: 'Accept',
				description: 'Take the cash',
				effects: { cash: 123 }
			}
		]
	};
}

function scenarioDefinition(overrides: Partial<ScenarioDefinition> = {}): ScenarioDefinition {
	const run = createFixtureScenarioRun();
	const base = resolveFixtureDefinition(run.definition)!;
	return {
		...base,
		allowedCommands: [
			'advanceDay',
			'updatePolicy',
			'selectWorldCity',
			'openWorldCity',
			'upgradeStore'
		],
		requiredObjectives: [
			{
				...base.requiredObjectives[0]!,
				target: 1_000_000_000
			}
		],
		...overrides
	};
}

function runForDefinition(definition: ScenarioDefinition): ScenarioRun {
	const fixture = createFixtureScenarioRun();
	return {
		...fixture,
		evaluation: evaluateScenario(definition, fixture.game, false)
	};
}

function controllerOptions(input: {
	saveRepository?: SaveRepository;
	scenarioRepository?: ScenarioRepository;
	definition?: ScenarioDefinition;
	events?: string[];
	onReadOnlySelection?: (kind: 'retail' | 'industry', tileId: string) => void;
}): GameRouteControllerOptions {
	const events = input.events ?? [];
	return {
		createSaveRepository: async () =>
			input.saveRepository ?? createSaveRepositoryHarness().repository,
		createScenarioRepository: async () =>
			input.scenarioRepository ?? createScenarioRepositoryHarness(),
		resolveScenarioDefinition: (ref) =>
			input.definition &&
			ref.scenarioId === input.definition.id &&
			ref.version === input.definition.version
				? input.definition
				: undefined,
		playSfx: (cueId) => events.push(`sfx:${cueId}`),
		onStateChange: () => events.push('publish'),
		onReadOnlySelection: input.onReadOnlySelection
	};
}

describe('GameRouteController sandbox handlers', () => {
	it('runs every sandbox handler through real domain transitions with immediate publish/autosave/SFX ordering', async () => {
		const events: string[] = [];
		const save = createSaveRepositoryHarness({ events });
		const controller = new GameRouteController(
			controllerOptions({ saveRepository: save.repository, events })
		);
		await controller.initializeSaves();

		const assertChanged = async (
			cueId: string | null,
			act: () => Promise<unknown>,
			verify: (before: GameState, after: GameState) => void
		) => {
			const before = controller.state.sandboxGame!;
			const savesBefore = vi.mocked(save.repository.saveAuto).mock.calls.length;
			events.length = 0;
			const pending = act();
			const after = controller.state.sandboxGame!;

			expect(after).not.toBe(before);
			expect(vi.mocked(save.repository.saveAuto)).toHaveBeenCalledTimes(savesBefore + 1);
			expect(vi.mocked(save.repository.saveAuto)).toHaveBeenLastCalledWith(after);
			expect(events).toEqual(['publish', 'autosave', ...(cueId ? [`sfx:${cueId}`] : [])]);
			verify(before, after);
			await pending;
		};

		const foundingSource = boostedGame();
		const foundingCity = foundingSource.cities[0]!;
		const foundingTile = foundingCity.tiles.find((tile) => !tile.locked && !tile.feature)!;
		events.length = 0;
		const founding = controller.foundStore({
			archetypeId: 'convenience',
			city: foundingCity,
			tileId: foundingTile.id,
			seed: foundingSource.seed
		});
		expect(controller.state.sandboxGame?.stores).toHaveLength(1);
		expect(events).toEqual(['publish', 'autosave', 'sfx:sfx.build.retail-place']);
		await founding;

		controller.loadSandboxGame({
			...controller.state.sandboxGame!,
			cash: 5_000_000,
			storeCap: 10
		});
		events.length = 0;

		await assertChanged(
			'sfx.build.retail-place',
			() => controller.openStore(validRetailTile(controller.state.sandboxGame!), 'convenience'),
			(before, after) => expect(after.stores).toHaveLength(before.stores.length + 1)
		);
		await assertChanged(
			'sfx.store.upgrade',
			() => controller.upgradeStore(controller.state.sandboxGame!.stores[0]!.id),
			(before, after) => expect(after.stores[0]!.level).toBe(before.stores[0]!.level + 1)
		);
		await assertChanged(
			'sfx.build.industry-place',
			() =>
				controller.buildIndustrialBuilding(
					validIndustryTile(controller.state.sandboxGame!, 'flour-mill'),
					'flour-mill'
				),
			(before, after) =>
				expect(after.industrialBuildings).toHaveLength(before.industrialBuildings.length + 1)
		);
		await assertChanged(
			'sfx.industry.upgrade',
			() =>
				controller.upgradeIndustrialBuilding(
					controller.state.sandboxGame!.industrialBuildings[0]!.id
				),
			(before, after) =>
				expect(after.industrialBuildings[0]!.level).toBe(before.industrialBuildings[0]!.level + 1)
		);

		controller.loadSandboxGame(withTwoWarehouses(boostedGame(12_002)));
		const railBuildings = controller.state.sandboxGame!.industrialBuildings;
		const railInput = {
			originBuildingId: railBuildings[0]!.id,
			waypoints: [],
			destinationBuildingId: railBuildings[1]!.id
		};
		expect(buildRailPreview(controller.state.sandboxGame!, railInput).blockReason).toBeNull();
		events.length = 0;
		await assertChanged(
			'sfx.build.industry-place',
			() => controller.buildRail(railInput),
			(before, after) =>
				expect(after.industryCities[0]!.rails.length).toBeGreaterThan(
					before.industryCities[0]!.rails.length
				)
		);
		let segment = deriveRailSegments(
			buildRailNetwork(controller.state.sandboxGame!.industryCities[0]!),
			controller.state.sandboxGame!.industrialBuildings
		)[0]!;
		await assertChanged(
			'sfx.industry.upgrade',
			() => controller.upgradeRail(controller.state.sandboxGame!.activeIndustryCityId, segment.id),
			(_before, after) =>
				expect(after.industryCities[0]!.rails.some((cell) => cell.level > 1)).toBe(true)
		);
		segment = deriveRailSegments(
			buildRailNetwork(controller.state.sandboxGame!.industryCities[0]!),
			controller.state.sandboxGame!.industrialBuildings
		)[0]!;
		await assertChanged(
			null,
			() => controller.demolishRail(controller.state.sandboxGame!.activeIndustryCityId, segment.id),
			(before, after) =>
				expect(after.industryCities[0]!.rails.length).toBeLessThan(
					before.industryCities[0]!.rails.length
				)
		);

		await assertChanged(
			'sfx.time.advance-day',
			() => controller.advanceDay(),
			(before, after) => expect(after.day).toBe(before.day + 1)
		);
		await assertChanged(
			'sfx.policy.change',
			() => controller.updatePolicy({ pricing: 'premium' }),
			(_before, after) => expect(after.policy.pricing).toBe('premium')
		);

		controller.loadSandboxGame({
			...controller.state.sandboxGame!,
			decisions: [decision()]
		});
		events.length = 0;
		await assertChanged(
			'sfx.decision.resolve',
			() => controller.resolveDecision('route-test-decision', 'accept'),
			(before, after) => {
				expect(after.decisions).toHaveLength(0);
				expect(after.cash).toBe(before.cash + 123);
			}
		);

		const candidateId = controller.state.sandboxGame!.hiringCandidates[0]!.id;
		await assertChanged(
			'sfx.staff.hire',
			() => controller.hireStaff(candidateId),
			(_before, after) =>
				expect(after.staff.some((staff) => staff.id === `staff-${candidateId}`)).toBe(true)
		);
		const hiredId = `staff-${candidateId}`;
		const storeId = controller.state.sandboxGame!.stores[0]!.id;
		await assertChanged(
			'sfx.staff.assign',
			() => controller.assignStaff(hiredId, storeId),
			(_before, after) =>
				expect(after.staff.find((staff) => staff.id === hiredId)?.assignedStoreId).toBe(storeId)
		);
		await assertChanged(
			'sfx.staff.unassign',
			() => controller.unassignStaff(hiredId),
			(_before, after) =>
				expect(after.staff.find((staff) => staff.id === hiredId)?.assignedStoreId).toBeNull()
		);
		controller.loadSandboxGame({
			...controller.state.sandboxGame!,
			staff: controller.state.sandboxGame!.staff.map((staff) =>
				staff.id === hiredId ? { ...staff, xp: 100_000 } : staff
			)
		});
		events.length = 0;
		await assertChanged(
			'sfx.staff.promote',
			() => controller.promoteStaff(hiredId),
			(before, after) =>
				expect(after.staff.find((staff) => staff.id === hiredId)?.level).toBe(
					before.staff.find((staff) => staff.id === hiredId)!.level + 1
				)
		);

		const product = controller.state.sandboxGame!.stores[0]!.products[0]!;
		await assertChanged(
			'sfx.stock.edit',
			() =>
				controller.updateStoreSellingPrice(storeId, product.categoryId, product.sellingPrice + 7),
			(_before, after) =>
				expect(after.stores[0]!.products[0]!.sellingPrice).toBe(product.sellingPrice + 7)
		);
		await assertChanged(
			'sfx.stock.edit',
			() =>
				controller.updateStoreInventoryTargets(
					storeId,
					product.categoryId,
					product.reorderThreshold + 2,
					product.targetStock + 4
				),
			(_before, after) => {
				expect(after.stores[0]!.products[0]!.reorderThreshold).toBe(product.reorderThreshold + 2);
				expect(after.stores[0]!.products[0]!.targetStock).toBe(product.targetStock + 4);
			}
		);

		controller.loadSandboxGame({
			...boostedGame(12_003),
			world: {
				...boostedGame(12_003).world,
				revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction']
			}
		});
		events.length = 0;
		await assertChanged(
			'sfx.world.city-unlock',
			() => controller.openWorldCity('campus-junction'),
			(_before, after) => {
				expect(after.world.openedCityIds).toContain('campus-junction');
				expect(after.activeCityId).toBe('campus-junction');
			}
		);
		await assertChanged(
			null,
			() => controller.selectWorldCity('harbor-city'),
			(_before, after) => expect(after.activeCityId).toBe('harbor-city')
		);
		await controller.selectWorldCity('campus-junction');
		await assertChanged(
			null,
			() => controller.selectAlertCity('harbor-city'),
			(_before, after) => expect(after.activeCityId).toBe('harbor-city')
		);
	});

	it('loads auto/manual saves through the controller and suppresses SFX for unchanged sandbox transitions', async () => {
		const events: string[] = [];
		const autoGame = boostedGame(12_101);
		const manualGame = boostedGame(12_102);
		const save = createSaveRepositoryHarness({ autoGame, manualGame, events });
		const controller = new GameRouteController(
			controllerOptions({ saveRepository: save.repository, events })
		);
		await controller.initializeSaves();

		expect(await controller.resumeAutoSave()).toBe('loaded');
		expect(controller.state.sandboxGame).toBe(autoGame);
		expect(controller.state.playMode).toBe('sandbox');
		expect(events.at(-1)).toBe('sfx:sfx.save.loaded');

		expect(await controller.loadManualSave('manual-1')).toBe('loaded');
		expect(controller.state.sandboxGame).toBe(manualGame);
		expect(events.at(-1)).toBe('sfx:sfx.save.loaded');

		events.length = 0;
		const savesBefore = vi.mocked(save.repository.saveAuto).mock.calls.length;
		await controller.selectWorldCity(manualGame.activeCityId as WorldCityId);
		expect(controller.state.sandboxGame).toBe(manualGame);
		expect(vi.mocked(save.repository.saveAuto)).toHaveBeenCalledTimes(savesBefore + 1);
		expect(events).toEqual(['publish', 'autosave']);
	});
});

describe('GameRouteController scenario integration', () => {
	it('resumes independently, rejects busy commands, and keeps read-only selection callable', async () => {
		const definition = scenarioDefinition();
		const run = runForDefinition(definition);
		const write = deferred<ScenarioCommitOutcome>();
		const repository = createScenarioRepositoryHarness(run, {
			saveActiveRun: vi.fn(() => write.promise)
		});
		const selected = vi.fn();
		const events: string[] = [];
		const controller = new GameRouteController(
			controllerOptions({
				scenarioRepository: repository,
				definition,
				events,
				onReadOnlySelection: selected
			})
		);

		await controller.initializeScenarios();
		expect(controller.state.activeScenarioRun).toBe(run);
		expect(controller.state.playMode).toBe('scenario');

		const first = controller.updatePolicy({ pricing: 'premium' });
		expect(controller.state.scenarioCommandPending).toBe(true);
		const second = await controller.updatePolicy({ pricing: 'discount' });
		controller.selectReadOnlyTile('retail', run.game.cities[0]!.tiles[0]!.id);

		expect(second).toMatchObject({ status: 'busy' });
		expect(selected).toHaveBeenCalledOnce();
		expect(controller.state.activeScenarioRun).toBe(run);
		expect(events).not.toContain('sfx:sfx.policy.change');

		const persistedRun = vi.mocked(repository.saveActiveRun).mock.calls[0]![0];
		write.resolve({ activeRun: persistedRun, terminalResult: null, bestUpdated: false });
		await first;
		expect(controller.state.activeScenarioRun).toBe(persistedRun);
		expect(controller.state.scenarioCommandPending).toBe(false);
		expect(events).toContain('sfx:sfx.policy.change');
		expect(events.indexOf('sfx:sfx.policy.change')).toBeGreaterThan(events.indexOf('publish'));
	});

	it('skips writes for rejected and unchanged scenario commands', async () => {
		const definition = scenarioDefinition({ allowedCommands: ['selectWorldCity'] });
		const run = runForDefinition(definition);
		const repository = createScenarioRepositoryHarness(run);
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);
		await controller.initializeScenarios();

		const rejected = await controller.updatePolicy({ pricing: 'premium' });
		expect(rejected).toMatchObject({ status: 'rejected' });
		expect(controller.state.scenarioOperationError?.code).toBe('forbidden-command');
		expect(repository.saveActiveRun).not.toHaveBeenCalled();

		controller.dismissScenarioOperationError();
		const unchanged = await controller.selectWorldCity(run.game.activeCityId as WorldCityId);
		expect(unchanged).toMatchObject({ status: 'unchanged' });
		expect(repository.saveActiveRun).not.toHaveBeenCalled();
		expect(controller.state.scenarioOperationError).toBeNull();
	});

	it('publishes terminal outcomes and best flags only after terminal persistence resolves', async () => {
		const base = scenarioDefinition();
		const definition = scenarioDefinition({
			requiredObjectives: [{ ...base.requiredObjectives[0]!, target: 0 }]
		});
		const run = runForDefinition(definition);
		const write = deferred<ScenarioCommitOutcome>();
		const repository = createScenarioRepositoryHarness(run, {
			commitTerminalRun: vi.fn(() => write.promise)
		});
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);
		await controller.initializeScenarios();

		const pending = controller.updatePolicy({ pricing: 'premium' });
		const terminalRun = vi.mocked(repository.commitTerminalRun).mock.calls[0]![0];
		expect(terminalRun.status).toBe('completed');
		expect(controller.state.activeScenarioRun).toBe(run);
		expect(controller.state.lastScenarioResult).toBeNull();

		write.resolve({ activeRun: null, terminalResult: terminalRun.result, bestUpdated: true });
		await pending;
		expect(controller.state.activeScenarioRun).toBeNull();
		expect(controller.state.lastScenarioResult).toBe(terminalRun.result);
		expect(controller.state.lastScenarioBestUpdated).toBe(true);
	});

	it('preserves committed state on write failure and retries the exact command with typed errors', async () => {
		const definition = scenarioDefinition();
		const run = runForDefinition(definition);
		const writeError = new Error('sensitive disk path');
		const repository = createScenarioRepositoryHarness(run);
		vi.mocked(repository.saveActiveRun)
			.mockRejectedValueOnce(writeError)
			.mockImplementationOnce(async (nextRun) => ({
				activeRun: nextRun,
				terminalResult: null,
				bestUpdated: false
			}));
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);
		await controller.initializeScenarios();

		const result = await controller.updatePolicy({ pricing: 'premium' });
		expect(result).toMatchObject({ status: 'failed' });
		expect(controller.state.activeScenarioRun).toBe(run);
		expect(controller.state.scenarioOperationError).toEqual({
			code: 'persistence-write-failed',
			diagnostics: []
		});
		expect(controller.state.retryScenarioOperation).not.toBeNull();

		await controller.state.retryScenarioOperation!();
		const [firstAttempt, retryAttempt] = vi
			.mocked(repository.saveActiveRun)
			.mock.calls.map(([nextRun]) => nextRun);
		expect(retryAttempt.game.policy).toEqual(firstAttempt.game.policy);
		expect(controller.state.activeScenarioRun?.game.policy.pricing).toBe('premium');
		expect(controller.state.scenarioOperationError).toBeNull();
		expect(controller.state.retryScenarioOperation).toBeNull();

		controller.dismissScenarioOperationError();
		expect(controller.state.scenarioOperationError).toBeNull();
		expect(controller.state.retryScenarioOperation).toBeNull();
	});
});
