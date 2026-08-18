import { describe, expect, it, vi } from 'vitest';
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
import type { SupplyPlannerSnapshot } from '$lib/game/supplyPlanner';
import {
	buildSupplyPlan,
	type SupplyPlannerAction,
	type SupplyPlannerActionAvailability,
	type SupplyPlannerResult
} from '$lib/game/supplyPlannerActions';
import {
	handoffSupplyPlannerAction,
	resolveSupplyPlannerProductId,
	deriveSupplyPlannerResult,
	getSupplyPlannerProductIds,
	type SupplyPlannerHandoffHost,
	type SupplyPlannerUiContext
} from './supplyPlannerRoute';
import {
	GameRouteController,
	createMutationAvailability,
	type GameRouteControllerOptions
} from './gameRouteController';
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
		loadActiveRunWithRevision: vi.fn(async () => (run ? { run, revision: 0 } : null)),
		saveActiveRun: vi.fn(async (nextRun) => ({
			activeRun: nextRun,
			terminalResult: null,
			bestUpdated: false
		})),
		removeActiveRun: vi.fn(async () => ({ status: 'removed' as const })),
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
	const preview = createIndustryPlacementPreview({
		game,
		buildingTypeId: typeId,
		financeCommandAvailable: true
	});
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
		kind: 'event',
		id: 'route-test-decision',
		eventId: 'route-test-decision',
		definitionVersion: 1,
		generatedOnDay: 1,
		expiresOnDay: 10,
		target: { kind: 'company' },
		copy: { key: 'events.routeTestDecision', params: {} },
		options: [
			{
				id: 'accept',
				effects: [{ kind: 'cash-adjust', amount: 123 }],
				modifiers: []
			}
		]
	};
}

function scenarioDefinition(overrides: Partial<ScenarioDefinition> = {}): ScenarioDefinition {
	const run = createFixtureScenarioRun();
	const base = resolveFixtureDefinition(run.definition)!;
	return {
		...base,
		start: {
			...base.start,
			overrides: { ...base.start.overrides, storeCap: 1 }
		},
		content: {
			...base.content,
			// upgradeStore is included below, so the founding convenience store
			// can reach MAX and materialize its full category set — allowlist all
			// of it to satisfy the bidirectional content boundary check.
			productIds: ['bottled-water', 'snacks', 'soft-drinks', 'essentials'],
			retailPlacements: [
				{
					cityId: base.start.foundingStore.cityId,
					tileId: base.start.foundingStore.tileId,
					archetypeId: base.start.foundingStore.archetypeId
				}
			]
		},
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
		definition: { scenarioId: definition.id, version: definition.version },
		seed: definition.officialSeed,
		eligibility: 'ranked',
		evaluation: evaluateScenario(definition, fixture.game, false)
	};
}

function controllerOptions(input: {
	saveRepository?: SaveRepository;
	scenarioRepository?: ScenarioRepository;
	definition?: ScenarioDefinition;
	definitions?: ScenarioDefinition[];
	events?: string[];
	onReadOnlySelection?: (kind: 'retail' | 'industry', tileId: string) => void;
	onScenarioSummary?: (summary: ScenarioPersistenceSummary) => void;
}): GameRouteControllerOptions {
	const events = input.events ?? [];
	return {
		createSaveRepository: async () =>
			input.saveRepository ?? createSaveRepositoryHarness().repository,
		createScenarioRepository: async () =>
			input.scenarioRepository ?? createScenarioRepositoryHarness(),
		resolveScenarioDefinition: (ref) =>
			[input.definition, ...(input.definitions ?? [])]
				.filter((definition): definition is ScenarioDefinition => Boolean(definition))
				.find(
					(definition) => ref.scenarioId === definition.id && ref.version === definition.version
				),
		playSfx: (cueId) => events.push(`sfx:${cueId}`),
		onStateChange: () => events.push('publish'),
		onReadOnlySelection: input.onReadOnlySelection,
		onScenarioSummary: input.onScenarioSummary
	};
}

function plannerSnapshot(overrides: Partial<SupplyPlannerSnapshot> = {}): SupplyPlannerSnapshot {
	return {
		retailCityId: 'harbor-city',
		supplyCityId: 'industry-city',
		finishedMaterialId: 'bottled-water',
		cash: 10_000,
		demandContributors: [],
		demandPerDay: 1,
		finishedImportCostPerUnit: 1,
		inventory: {},
		warehouseCapacity: 100,
		warehouseUsed: 0,
		buildings: [],
		usableBuildingIds: [],
		disconnectedBuildingIds: [],
		usableSinkBuildingIdsByMaterial: {},
		reachableDemandByMaterial: {},
		reachableDemandByBuildingAndMaterial: {},
		reachableBranchesByBuildingAndMaterial: {},
		reachableProcessorsByBuildingAndMaterial: {},
		warehouseConnectedConsumerCapacityByMaterial: {},
		warehouseConnectedProcessorsByMaterial: {},
		...overrides
	};
}

function plannerResult(
	action: SupplyPlannerAction,
	snapshotOverrides: Partial<SupplyPlannerSnapshot> = {}
): SupplyPlannerResult {
	const snapshot = plannerSnapshot(snapshotOverrides);
	return {
		status: 'ready',
		plan: {
			snapshot,
			baseline: {} as never,
			recommendation: { action } as never,
			alternatives: []
		}
	};
}

function handoffHost(game = createNewGame('convenience', 20260810)): SupplyPlannerHandoffHost {
	return {
		getGame: () => game,
		closeOverlays: vi.fn(),
		switchToSupplyCity: vi.fn(async () => true),
		armIndustryPlacement: vi.fn(),
		selectIndustryTile: vi.fn(),
		openLogistics: vi.fn(),
		openStores: vi.fn(),
		enterRailBuildMode: vi.fn(),
		canBuildRail: true,
		canManageLogistics: true,
		canSetRetailSupplySource: true
	};
}

describe('supply planner route composition', () => {
	it('limits planner categories to products carried by the active retail city', () => {
		const base = createNewGame('convenience', 20260810);
		const harbor = base.cities[0]!;
		const campus = {
			...harbor,
			id: 'campus-junction',
			name: 'Campus Junction',
			tiles: harbor.tiles.map((tile) => ({
				...tile,
				id: tile.id.replace('harbor-city', 'campus-junction'),
				cityId: 'campus-junction'
			}))
		};
		const bottledWater = base.stores[0]!.products.find(
			(product) => product.productId === 'bottled-water'
		)!;
		const snacks = base.stores[0]!.products.find((product) => product.productId === 'snacks')!;
		const game: GameState = {
			...base,
			cities: [harbor, campus],
			stores: [
				{ ...base.stores[0]!, products: [bottledWater] },
				{
					...base.stores[0]!,
					id: 'store-campus',
					cityId: 'campus-junction',
					tileId: campus.tiles[0]!.id,
					products: [snacks]
				}
			],
			world: {
				...base.world,
				revealedCityIds: [...base.world.revealedCityIds, 'campus-junction'],
				openedCityIds: [...base.world.openedCityIds, 'campus-junction']
			},
			retailSupplyAssignments: [
				{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
				{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
			]
		};

		const plannerProductIds = getSupplyPlannerProductIds(game, 'harbor-city', [
			'bottled-water',
			'snacks'
		]);
		expect(plannerProductIds).toEqual(['bottled-water']);
		expect(
			resolveSupplyPlannerProductId({ productId: 'snacks', horizonDays: 7 }, plannerProductIds)
		).toBe('bottled-water');
	});

	it('plans from reactive route state without structured-clone errors', () => {
		const game = new Proxy(boostedGame(20260811), {});
		const snapshot = boostedGame(20260811);
		const snapshotGame = vi.fn(() => snapshot);
		const availability: SupplyPlannerActionAvailability = {
			canBuildIndustry: true,
			canUpgradeIndustry: true,
			canBuildRail: true,
			canManageLogistics: true,
			canSetRetailSupplySource: true,
			allowedIndustryBuildingTypeIds: [
				'water-pump',
				'water-filtration-plant',
				'drink-bottling-plant',
				'warehouse'
			]
		};

		expect(() =>
			deriveSupplyPlannerResult(
				{
					isOpen: true,
					game,
					retailCityId: 'harbor-city',
					productId: 'bottled-water',
					availability
				},
				buildSupplyPlan,
				snapshotGame
			)
		).not.toThrow();
		expect(snapshotGame).toHaveBeenCalledWith(game);
	});

	it('gates planner derivation while closed and preserves category/horizon context', () => {
		expect.assertions(6);
		const buildPlan = vi.fn(() => plannerResult({ kind: 'none', reason: 'surplus' }));
		const availability = {
			canBuildIndustry: true,
			canUpgradeIndustry: true,
			canBuildRail: true,
			canManageLogistics: true,
			canSetRetailSupplySource: true,
			allowedIndustryBuildingTypeIds: []
		};
		const game = createNewGame('convenience', 20260810);

		expect(
			deriveSupplyPlannerResult(
				{
					isOpen: false,
					game,
					retailCityId: 'harbor-city',
					productId: 'bottled-water',
					availability
				},
				buildPlan
			)
		).toBeNull();
		expect(buildPlan).not.toHaveBeenCalled();
		expect(
			deriveSupplyPlannerResult(
				{
					isOpen: true,
					game,
					retailCityId: 'harbor-city',
					productId: 'bottled-water',
					availability
				},
				buildPlan
			)
		).not.toBeNull();
		expect(buildPlan).toHaveBeenCalledOnce();
		const context: SupplyPlannerUiContext = { productId: 'snacks', horizonDays: 7 };
		expect(resolveSupplyPlannerProductId(context, ['bottled-water', 'snacks'])).toBe('snacks');
		expect(resolveSupplyPlannerProductId(context, ['bottled-water'])).toBe('bottled-water');
	});

	it.each([
		[
			'producer',
			{
				kind: 'build-producer',
				materialId: 'bottled-water',
				buildingTypeId: 'water-pump',
				cost: 500
			}
		],
		[
			'warehouse',
			{ kind: 'build-warehouse', cityId: 'industry-city', buildingTypeId: 'warehouse', cost: 500 }
		]
	] as const)('hands off %s builds through placement only', async (_label, action) => {
		expect.assertions(4);
		const host = handoffHost();
		await handoffSupplyPlannerAction(action, plannerResult(action), host);
		expect(host.closeOverlays).toHaveBeenCalledOnce();
		expect(host.switchToSupplyCity).toHaveBeenCalledWith('industry-city');
		expect(host.armIndustryPlacement).toHaveBeenCalledWith(action.buildingTypeId);
		expect(host.selectIndustryTile).not.toHaveBeenCalled();
	});

	it('hands off upgrades to the current inspector tile without upgrading directly', async () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260810);
		const building = {
			id: 'water-pump-1',
			cityId: 'industry-city',
			tileId: 'industry-city-1',
			typeId: 'water-pump'
		} as never;
		const host = handoffHost({ ...game, industrialBuildings: [building] });
		const action = {
			kind: 'upgrade-building',
			materialId: 'bottled-water',
			buildingId: 'water-pump-1',
			buildingTypeId: 'water-pump',
			fromLevel: 1,
			toLevel: 2,
			cost: 500
		} as const;

		await handoffSupplyPlannerAction(
			action,
			plannerResult(action, { buildings: [building] }),
			host
		);
		expect(host.closeOverlays).toHaveBeenCalledOnce();
		expect(host.switchToSupplyCity).toHaveBeenCalledWith('industry-city');
		expect(host.selectIndustryTile).toHaveBeenCalledWith('industry-city-1');
		expect(host.armIndustryPlacement).not.toHaveBeenCalled();
	});

	it('hands off rail routing for a disconnected building without building rail', async () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260810);
		const building = {
			id: 'water-pump-1',
			cityId: 'industry-city',
			tileId: 'industry-city-1',
			typeId: 'water-pump'
		} as never;
		const host = handoffHost({ ...game, industrialBuildings: [building] });
		const action = {
			kind: 'connect-rail',
			buildingId: 'water-pump-1',
			materialId: 'bottled-water'
		} as const;

		await handoffSupplyPlannerAction(
			action,
			plannerResult(action, {
				buildings: [building],
				disconnectedBuildingIds: ['water-pump-1']
			}),
			host
		);
		expect(host.closeOverlays).toHaveBeenCalledOnce();
		expect(host.switchToSupplyCity).toHaveBeenCalledWith('industry-city');
		expect(host.enterRailBuildMode).toHaveBeenCalledWith({
			step: 'routing',
			originBuildingId: 'water-pump-1',
			waypoints: []
		});
		expect(host.armIndustryPlacement).not.toHaveBeenCalled();
	});

	it('does not mutate for stale or no-op recommendations', async () => {
		expect.assertions(7);
		const host = handoffHost();
		const action = {
			kind: 'build-warehouse',
			cityId: 'industry-city',
			buildingTypeId: 'warehouse',
			cost: 500
		} as const;
		await handoffSupplyPlannerAction(
			action,
			plannerResult({ kind: 'none', reason: 'surplus' }),
			host
		);
		await handoffSupplyPlannerAction(
			{ kind: 'none', reason: 'surplus' },
			plannerResult({ kind: 'none', reason: 'surplus' }),
			host
		);
		expect(host.closeOverlays).not.toHaveBeenCalled();
		expect(host.switchToSupplyCity).not.toHaveBeenCalled();
		expect(host.armIndustryPlacement).not.toHaveBeenCalled();
		expect(host.selectIndustryTile).not.toHaveBeenCalled();
		expect(host.enterRailBuildMode).not.toHaveBeenCalled();
		expect(host.canBuildRail).toBe(true);
		expect(action.kind).toBe('build-warehouse');
	});
});

describe('GameRouteController sandbox handlers', () => {
	it('derives sandbox, challenge, and pending mutation availability independently', () => {
		expect.assertions(7);
		const definition = scenarioDefinition({
			allowedCommands: ['advanceDay', 'updateStoreSellingPrice', 'openStore']
		});

		const sandbox = createMutationAvailability({
			playMode: 'sandbox',
			pending: false,
			definition: null
		});
		expect(sandbox.pending).toBe(false);
		expect(
			Object.entries(sandbox)
				.filter(([key]) => key !== 'pending')
				.every(([, value]) => value)
		).toBe(true);

		const challenge = createMutationAvailability({
			playMode: 'scenario',
			pending: false,
			definition
		});
		expect(challenge.advanceDay).toBe(true);
		expect(challenge.updateStoreSellingPrice).toBe(true);
		expect(challenge.updateStoreInventoryTargets).toBe(false);
		expect(challenge.buildRail).toBe(false);

		const pending = createMutationAvailability({
			playMode: 'scenario',
			pending: true,
			definition
		});
		expect(pending.pending && !pending.advanceDay && !pending.openStore).toBe(true);
	});

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
				controller.updateStoreSellingPrice(storeId, product.productId, product.sellingPrice + 7),
			(_before, after) =>
				expect(after.stores[0]!.products[0]!.sellingPrice).toBe(product.sellingPrice + 7)
		);
		await assertChanged(
			'sfx.stock.edit',
			() =>
				controller.updateStoreInventoryTargets(
					storeId,
					product.productId,
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
	it('persists starts before publication and can replace an older run with the selected current definition', async () => {
		expect.assertions(8);
		const current = scenarioDefinition({ version: 1 });
		const olderDefinition = scenarioDefinition({ version: 0 });
		const olderRun = runForDefinition(olderDefinition);
		const write = deferred<ScenarioCommitOutcome>();
		const repository = createScenarioRepositoryHarness(olderRun, {
			saveActiveRun: vi.fn(() => write.promise)
		});
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition: current })
		);
		await controller.initializeScenarios();

		// Pass confirmed=true with the older run's identity so the
		// read-first CAS proceeds to the write instead of returning
		// confirmation-required.
		const pending = controller.startScenarioRun(
			current,
			current.officialSeed,
			true,
			olderRun.runId
		);
		expect(controller.state.activeScenarioRun).toBe(olderRun);
		// startScenarioRun awaits loadActiveRun before calling saveActiveRun,
		// so flush the microtask queue to let the save call land.
		await Promise.resolve();
		const nextRun = vi.mocked(repository.saveActiveRun).mock.calls[0]![0];
		expect(nextRun.definition).toEqual({ scenarioId: current.id, version: 1 });
		expect(nextRun.seed).toBe(current.officialSeed);
		expect(nextRun.eligibility).toBe('ranked');
		write.resolve({ activeRun: nextRun, terminalResult: null, bestUpdated: false });
		expect(await pending).toMatchObject({ status: 'committed' });
		expect(controller.state.activeScenarioRun).toBe(nextRun);
		expect(controller.state.lastScenarioResult).toBeNull();
		expect(controller.state.lastScenarioBestUpdated).toBe(false);
	});

	it('resumes the exact stored run and restarts its exact version and selected seed', async () => {
		expect.assertions(7);
		const definition = scenarioDefinition({ version: 1 });
		const stored = { ...runForDefinition(definition), seed: 999, eligibility: 'unranked' as const };
		const repository = createScenarioRepositoryHarness(stored);
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);
		await controller.initializeScenarios();

		controller.returnToSandbox();
		expect(await controller.resumeScenarioRun(definition.id)).toMatchObject({
			status: 'committed'
		});
		expect(controller.state.activeScenarioRun).toBe(stored);
		expect(repository.saveActiveRun).not.toHaveBeenCalled();

		const restarted = await controller.restartScenarioRun(stored.definition);
		const saved = vi.mocked(repository.saveActiveRun).mock.calls[0]![0];
		expect(restarted).toMatchObject({ status: 'committed' });
		expect(saved.definition).toEqual(stored.definition);
		expect(saved.seed).toBe(999);
		expect(saved.eligibility).toBe('unranked');
	});

	it('restarts the selected saved scenario instead of the currently displayed run', async () => {
		expect.assertions(9);
		const displayedDefinition = scenarioDefinition();
		const selectedDefinition = scenarioDefinition({ id: 'import-squeeze' });
		const displayed = runForDefinition(displayedDefinition);
		const selected = {
			...runForDefinition(selectedDefinition),
			seed: 999,
			eligibility: 'unranked' as const
		};
		const write = deferred<ScenarioCommitOutcome>();
		const repository = createScenarioRepositoryHarness(displayed, {
			getSummary: vi.fn(async () => ({
				activeRunsByScenarioId: {
					'first-profit': displayed,
					'import-squeeze': selected
				},
				bestResultsByDefinitionKey: {},
				diagnostics: []
			})),
			loadActiveRun: vi.fn(async (id) => (id === selectedDefinition.id ? selected : displayed)),
			loadActiveRunWithRevision: vi.fn(async (id) =>
				id === selectedDefinition.id
					? { run: selected, revision: 0 }
					: { run: displayed, revision: 0 }
			),
			saveActiveRun: vi.fn(() => write.promise)
		});
		const controller = new GameRouteController(
			controllerOptions({
				scenarioRepository: repository,
				definitions: [displayedDefinition, selectedDefinition]
			})
		);
		await controller.initializeScenarios();

		const pending = controller.restartScenarioRun(selected.definition);
		expect(repository.loadActiveRunWithRevision).toHaveBeenCalledWith('import-squeeze');
		expect(controller.state.activeScenarioRun).toBe(displayed);
		await Promise.resolve();
		const restarted = vi.mocked(repository.saveActiveRun).mock.calls[0]![0];
		expect(restarted.definition).toEqual(selected.definition);
		expect(restarted.seed).toBe(999);
		expect(restarted.eligibility).toBe('unranked');
		expect(displayed.definition.scenarioId).toBe('first-profit');
		expect(repository.removeActiveRun).not.toHaveBeenCalled();
		write.resolve({ activeRun: restarted, terminalResult: null, bestUpdated: false });
		expect(await pending).toMatchObject({ status: 'committed' });
		expect(controller.state.activeScenarioRun).toBe(restarted);
	});

	it('confirms imports only for a persisted run of the decoded scenario', async () => {
		expect.assertions(13);
		const displayedDefinition = scenarioDefinition();
		const importedDefinition = scenarioDefinition({ id: 'import-squeeze' });
		const displayed = runForDefinition(displayedDefinition);
		const imported = runForDefinition(importedDefinition);
		const repository = createScenarioRepositoryHarness(displayed, {
			getSummary: vi.fn(async () => ({
				activeRunsByScenarioId: { 'first-profit': displayed },
				bestResultsByDefinitionKey: {},
				diagnostics: []
			})),
			loadActiveRun: vi.fn(async (id) => (id === importedDefinition.id ? null : displayed)),
			loadActiveRunWithRevision: vi.fn(async (id) =>
				id === importedDefinition.id ? null : { run: displayed, revision: 0 }
			)
		});
		const controller = new GameRouteController(
			controllerOptions({
				scenarioRepository: repository,
				definitions: [displayedDefinition, importedDefinition]
			})
		);
		await controller.initializeScenarios();

		expect(await controller.importScenarioRun(importedDefinition, 999, false)).toMatchObject({
			status: 'committed'
		});
		expect(repository.loadActiveRunWithRevision).toHaveBeenLastCalledWith('import-squeeze');
		expect(repository.saveActiveRun).toHaveBeenCalledTimes(1);
		expect(displayed.definition.scenarioId).toBe('first-profit');

		const replacementRepository = createScenarioRepositoryHarness(displayed, {
			getSummary: vi.fn(async () => ({
				activeRunsByScenarioId: {
					'first-profit': displayed,
					'import-squeeze': imported
				},
				bestResultsByDefinitionKey: {},
				diagnostics: []
			})),
			loadActiveRun: vi.fn(async (id) => (id === importedDefinition.id ? imported : displayed)),
			loadActiveRunWithRevision: vi.fn(async (id) =>
				id === importedDefinition.id
					? { run: imported, revision: 0 }
					: { run: displayed, revision: 0 }
			)
		});
		const replacementController = new GameRouteController(
			controllerOptions({
				scenarioRepository: replacementRepository,
				definitions: [displayedDefinition, importedDefinition]
			})
		);
		await replacementController.initializeScenarios();
		expect(replacementController.state.activeScenarioRun).toBe(displayed);
		expect(
			await replacementController.importScenarioRun(importedDefinition, 999, false)
		).toMatchObject({
			status: 'confirmation-required'
		});
		expect(replacementRepository.saveActiveRun).not.toHaveBeenCalled();
		expect(replacementController.state.activeScenarioRun).toBe(displayed);
		expect(
			await replacementController.importScenarioRun(importedDefinition, 999, true)
		).toMatchObject({
			status: 'committed'
		});
		expect(replacementRepository.saveActiveRun).toHaveBeenCalledTimes(1);
		expect(vi.mocked(replacementRepository.saveActiveRun).mock.calls[0]![0].definition).toEqual(
			imported.definition
		);
		expect(replacementRepository.removeActiveRun).not.toHaveBeenCalled();
		expect(displayed.definition.scenarioId).toBe('first-profit');
	});

	it('keeps prior state on lifecycle write failure and retries the exact start', async () => {
		expect.assertions(7);
		const definition = scenarioDefinition();
		const oldRun = runForDefinition(definition);
		const repository = createScenarioRepositoryHarness(oldRun);
		vi.mocked(repository.saveActiveRun)
			.mockRejectedValueOnce(new Error('disk'))
			.mockImplementationOnce(async (run) => ({
				activeRun: run,
				terminalResult: null,
				bestUpdated: false
			}));
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);
		await controller.initializeScenarios();

		expect(await controller.startScenarioRun(definition, 999, true, oldRun.runId)).toMatchObject({
			status: 'failed'
		});
		expect(controller.state.activeScenarioRun).toBe(oldRun);
		expect(controller.state.scenarioOperationError?.code).toBe('persistence-write-failed');
		expect(controller.state.retryScenarioOperation).not.toBeNull();
		await controller.state.retryScenarioOperation!();
		const attempts = vi.mocked(repository.saveActiveRun).mock.calls.map(([run]) => run);
		expect(attempts[1]?.seed).toBe(attempts[0]?.seed);
		expect(controller.state.activeScenarioRun?.seed).toBe(999);
		expect(controller.state.scenarioOperationError).toBeNull();
	});

	it('publishes a terminal result and best flag only after the terminal commit resolves', async () => {
		expect.assertions(7);
		const base = scenarioDefinition();
		const definition = scenarioDefinition({
			requiredObjectives: [{ ...base.requiredObjectives[0]!, target: 0 }]
		});
		const run = runForDefinition(definition);
		const terminalWrite = deferred<ScenarioCommitOutcome>();
		const repository = createScenarioRepositoryHarness(run, {
			commitTerminalRun: vi.fn(() => terminalWrite.promise)
		});
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);
		await controller.initializeScenarios();

		const pending = controller.updatePolicy({ pricing: 'premium' });
		expect(controller.state.lastScenarioResult).toBeNull();
		expect(controller.state.lastScenarioBestUpdated).toBe(false);
		expect(controller.state.activeScenarioRun).toBe(run);
		await Promise.resolve();
		const terminalRun = vi.mocked(repository.commitTerminalRun).mock.calls[0]![0];
		expect(terminalRun.result?.outcome).toBe('completed');
		terminalWrite.resolve({
			activeRun: null,
			terminalResult: terminalRun.result,
			bestUpdated: true
		});
		expect(await pending).toMatchObject({ status: 'committed' });
		expect(controller.state.lastScenarioResult).toBe(terminalRun.result);
		expect(controller.state.lastScenarioBestUpdated).toBe(true);
	});

	it('refreshes the scenario summary after a terminal commit so the catalog reflects the deleted active run and new best', async () => {
		const base = scenarioDefinition();
		const definition = scenarioDefinition({
			requiredObjectives: [{ ...base.requiredObjectives[0]!, target: 0 }]
		});
		const run = runForDefinition(definition);
		const refreshedSummary: ScenarioPersistenceSummary = {
			activeRunsByScenarioId: {},
			bestResultsByDefinitionKey: {},
			diagnostics: []
		};
		const repository = createScenarioRepositoryHarness(run, {
			commitTerminalRun: vi.fn(async (terminalRun) => ({
				activeRun: null,
				terminalResult: terminalRun.result,
				bestUpdated: true
			})),
			getSummary: vi
				.fn(async () => refreshedSummary)
				.mockImplementationOnce(async () => emptyScenarioSummary(run))
		});
		const summaries: ScenarioPersistenceSummary[] = [];
		const controller = new GameRouteController(
			controllerOptions({
				scenarioRepository: repository,
				definition,
				onScenarioSummary: (summary) => summaries.push(summary)
			})
		);
		await controller.initializeScenarios();

		await controller.updatePolicy({ pricing: 'premium' });

		expect(vi.mocked(repository.commitTerminalRun)).toHaveBeenCalledTimes(1);
		expect(vi.mocked(repository.getSummary)).toHaveBeenCalledTimes(2);
		expect(summaries.length).toBeGreaterThanOrEqual(2);
		expect(summaries[summaries.length - 1]).toBe(refreshedSummary);
		expect(
			summaries[summaries.length - 1]!.activeRunsByScenarioId[run.definition.scenarioId]
		).toBeUndefined();
	});

	it('keeps a terminal result visible when restart persistence fails and retries the exact restart once', async () => {
		expect.assertions(16);
		const base = scenarioDefinition();
		const definition = scenarioDefinition({
			requiredObjectives: [{ ...base.requiredObjectives[0]!, target: 0 }]
		});
		const run = runForDefinition(definition);
		const restartWrite = deferred<ScenarioCommitOutcome>();
		const repository = createScenarioRepositoryHarness(run, {
			saveActiveRun: vi
				.fn()
				.mockImplementationOnce(() => restartWrite.promise)
				.mockImplementationOnce(async (nextRun: ScenarioRun) => ({
					activeRun: nextRun,
					terminalResult: null,
					bestUpdated: false
				}))
		});
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);
		await controller.initializeScenarios();
		await controller.updatePolicy({ pricing: 'premium' });
		const committedResult = controller.state.lastScenarioResult;
		expect(committedResult?.outcome).toBe('completed');

		const pendingRestart = controller.startScenarioRun(
			definition,
			committedResult!.seed,
			true,
			run.runId
		);
		expect(controller.state.scenarioCommandPending).toBe(true);
		expect(controller.state.lastScenarioResult).toBe(committedResult);
		expect(controller.state.activeScenarioRun).toBeNull();
		restartWrite.reject(new Error('raw storage failure must not be exposed'));
		expect(await pendingRestart).toMatchObject({ status: 'failed' });
		expect(controller.state.scenarioCommandPending).toBe(false);
		expect(controller.state.lastScenarioResult).toBe(committedResult);
		expect(controller.state.scenarioOperationError?.code).toBe('persistence-write-failed');
		expect(controller.state.retryScenarioOperation).not.toBeNull();

		await controller.state.retryScenarioOperation!();
		expect(repository.saveActiveRun).toHaveBeenCalledTimes(2);
		const [firstAttempt, retryAttempt] = vi
			.mocked(repository.saveActiveRun)
			.mock.calls.map(([attempt]) => attempt);
		expect(retryAttempt.definition).toEqual(firstAttempt.definition);
		expect(retryAttempt.seed).toBe(firstAttempt.seed);
		expect(controller.state.activeScenarioRun).toBe(retryAttempt);
		expect(controller.state.lastScenarioResult).toBeNull();
		expect(controller.state.scenarioOperationError).toBeNull();
		expect(controller.state.retryScenarioOperation).toBeNull();
	});

	it('dismisses a terminal restart error without changing the committed result', async () => {
		expect.assertions(6);
		const base = scenarioDefinition();
		const definition = scenarioDefinition({
			requiredObjectives: [{ ...base.requiredObjectives[0]!, target: 0 }]
		});
		const run = runForDefinition(definition);
		const repository = createScenarioRepositoryHarness(run, {
			saveActiveRun: vi.fn().mockRejectedValue(new Error('raw storage failure must not be exposed'))
		});
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);
		await controller.initializeScenarios();
		await controller.updatePolicy({ pricing: 'premium' });
		const committedResult = controller.state.lastScenarioResult;

		expect(
			await controller.startScenarioRun(definition, committedResult!.seed, true, run.runId)
		).toMatchObject({
			status: 'failed'
		});
		expect(controller.state.lastScenarioResult).toBe(committedResult);
		expect(controller.state.scenarioOperationError?.code).toBe('persistence-write-failed');
		controller.dismissScenarioOperationError();
		expect(controller.state.lastScenarioResult).toBe(committedResult);
		expect(controller.state.scenarioOperationError).toBeNull();
		expect(controller.state.retryScenarioOperation).toBeNull();
	});

	it('keeps committed objective progress on an in-run write error and retries the exact command once', async () => {
		expect.assertions(8);
		const definition = scenarioDefinition();
		const run = runForDefinition(definition);
		const repository = createScenarioRepositoryHarness(run);
		vi.mocked(repository.saveActiveRun)
			.mockRejectedValueOnce(new Error('disk'))
			.mockImplementationOnce(async (nextRun) => ({
				activeRun: nextRun,
				terminalResult: null,
				bestUpdated: false
			}));
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);
		await controller.initializeScenarios();

		expect(await controller.updatePolicy({ pricing: 'premium' })).toMatchObject({
			status: 'failed'
		});
		expect(controller.state.activeScenarioRun).toBe(run);
		expect(controller.state.activeScenarioRun?.evaluation).toBe(run.evaluation);
		expect(controller.state.scenarioOperationError?.code).toBe('persistence-write-failed');
		await controller.state.retryScenarioOperation!();
		expect(repository.saveActiveRun).toHaveBeenCalledTimes(2);
		const attempts = vi.mocked(repository.saveActiveRun).mock.calls.map(([attempt]) => attempt);
		expect(attempts[0]?.game.policy.pricing).toBe('premium');
		expect(attempts[1]?.game.policy.pricing).toBe('premium');
		expect(controller.state.scenarioOperationError).toBeNull();
	});

	it('invalidates an in-run retry when returning to the sandbox', async () => {
		expect.assertions(11);
		const definition = scenarioDefinition();
		const run = runForDefinition(definition);
		const sandbox = boostedGame(12_099);
		const repository = createScenarioRepositoryHarness(run, {
			saveActiveRun: vi.fn().mockRejectedValueOnce(new Error('disk'))
		});
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);
		await controller.initializeScenarios();

		expect(await controller.updatePolicy({ pricing: 'premium' })).toMatchObject({
			status: 'failed'
		});
		expect(controller.state.activeScenarioRun).toBe(run);
		expect(controller.state.activeScenarioRun?.game.policy).toEqual(run.game.policy);
		expect(controller.state.scenarioOperationError?.code).toBe('persistence-write-failed');
		const staleRetry = controller.state.retryScenarioOperation;
		expect(staleRetry).not.toBeNull();

		controller.returnToSandbox();
		controller.loadSandboxGame(sandbox);
		expect(controller.state.playMode).toBe('sandbox');
		expect(controller.state.scenarioOperationError).toBeNull();
		expect(controller.state.retryScenarioOperation).toBeNull();

		await staleRetry!();
		expect(controller.state.sandboxGame).toBe(sandbox);
		expect(controller.state.sandboxGame?.policy.pricing).toBe(sandbox.policy.pricing);
		expect(repository.saveActiveRun).toHaveBeenCalledTimes(1);
	});

	it('abandons by committing a terminal run without replacing the best and returns to sandbox losslessly', async () => {
		expect.assertions(7);
		const definition = scenarioDefinition();
		const run = runForDefinition(definition);
		const repository = createScenarioRepositoryHarness(run);
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);
		await controller.initializeScenarios();

		controller.returnToSandbox();
		expect(controller.state.playMode).toBe('sandbox');
		expect(controller.state.activeScenarioRun).toBe(run);
		expect(repository.removeActiveRun).not.toHaveBeenCalled();
		expect(repository.saveActiveRun).not.toHaveBeenCalled();

		expect(await controller.abandonScenarioRun()).toMatchObject({ status: 'committed' });
		expect(repository.commitTerminalRun).toHaveBeenCalledWith(
			expect.objectContaining({
				definition: run.definition,
				status: 'abandoned',
				result: expect.objectContaining({ outcome: 'abandoned' })
			}),
			{ expectedRevision: 0 }
		);
		expect(repository.removeActiveRun).not.toHaveBeenCalled();
	});

	it('startScenarioRun surfaces a save conflict as confirmation-required and exposes the persisted run', async () => {
		const definition = scenarioDefinition();
		const run = runForDefinition(definition);
		const stored = runForDefinition(definition);
		expect(stored.runId).not.toBe(run.runId);
		const repository = createScenarioRepositoryHarness(stored, {
			saveActiveRun: vi.fn(async () => ({
				status: 'conflict' as const,
				activeRun: stored,
				revision: 0
			}))
		});
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);
		await controller.initializeScenarios();

		const result = await controller.startScenarioRun(definition, definition.officialSeed);

		// The read-first CAS detects the stored run (different runId than
		// the new run) and returns confirmation-required with the stored
		// run's identity, so the caller can bind the confirmed write to it.
		expect(result).toEqual({
			status: 'confirmation-required',
			expectedRunId: stored.runId,
			expectedRevision: 0
		});
		// The conflict surfaces the actually-persisted run so the UI can offer
		// Resume instead of silently overwriting it.
		expect(controller.state.activeScenarioRun).toBe(stored);
	});

	it('abandonScenarioRun surfaces the preserved run when commitTerminalRun reports a conflict', async () => {
		const definition = scenarioDefinition();
		const run = runForDefinition(definition);
		const stored = runForDefinition(definition);
		expect(stored.runId).not.toBe(run.runId);
		// `run` is the in-memory state the user is abandoning; `stored` is the
		// newer replacement that survives in storage. getSummary returns `run`
		// on the initializeScenarios call, then `stored` after the abandon
		// refresh so the catalog picks up the surviving replacement.
		let summaryCall = 0;
		const summaries: ScenarioPersistenceSummary[] = [];
		const repository = createScenarioRepositoryHarness(run, {
			commitTerminalRun: vi.fn(async () => ({
				status: 'conflict' as const,
				activeRun: stored,
				revision: 1
			})),
			getSummary: vi.fn(async () => {
				summaryCall += 1;
				return emptyScenarioSummary(summaryCall === 1 ? run : stored);
			})
		});
		const controller = new GameRouteController(
			controllerOptions({
				scenarioRepository: repository,
				definition,
				onScenarioSummary: (summary) => summaries.push(summary)
			})
		);
		await controller.initializeScenarios();
		expect(controller.state.activeScenarioRun).toBe(run);

		const result = await controller.abandonScenarioRun();

		expect(result).toEqual({ status: 'confirmation-required' });
		expect(repository.commitTerminalRun).toHaveBeenCalledWith(
			expect.objectContaining({
				definition: run.definition,
				status: 'abandoned'
			}),
			{ expectedRevision: 0 }
		);
		expect(controller.state.activeScenarioRun).toBe(stored);
		expect(controller.state.playMode).toBe('scenario');
		// The summary refresh surfaces the surviving replacement run so the
		// catalog can offer Resume on it instead of hiding it.
		expect(summaries.at(-1)?.activeRunsByScenarioId[definition.id]).toBe(stored);
	});

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

	it('marks scenariosReady false until initializeScenarios loads the summary successfully', async () => {
		expect.assertions(4);
		const definition = scenarioDefinition();
		const run = runForDefinition(definition);
		const repository = createScenarioRepositoryHarness(run);
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);

		expect(controller.state.scenariosReady).toBe(false);
		await controller.initializeScenarios();
		expect(controller.state.scenariosReady).toBe(true);
		expect(controller.state.activeScenarioRun).toBe(run);
		expect(controller.state.scenarioOperationError).toBeNull();
	});

	it('preserves an explicit sandbox selection when initializeScenarios resumes a run', async () => {
		expect.assertions(4);
		const definition = scenarioDefinition();
		const run = runForDefinition(definition);
		const sandbox = boostedGame(12_099);
		const repository = createScenarioRepositoryHarness(run);
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);

		controller.loadSandboxGame(sandbox);
		await controller.initializeScenarios();

		expect(controller.state.playMode).toBe('sandbox');
		expect(controller.state.sandboxGame).toBe(sandbox);
		expect(controller.state.activeScenarioRun).toBe(run);
		expect(controller.state.scenariosReady).toBe(true);
	});

	it('keeps scenariosReady false when initializeScenarios throws', async () => {
		expect.assertions(3);
		const definition = scenarioDefinition();
		const repository = createScenarioRepositoryHarness(undefined, {
			getSummary: vi.fn().mockRejectedValue(new Error('storage unavailable'))
		});
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);

		await controller.initializeScenarios();
		expect(controller.state.scenariosReady).toBe(false);
		expect(controller.state.scenarioOperationError?.code).toBe('persistence-read-failed');
		expect(controller.state.retryScenarioOperation).not.toBeNull();
	});

	it('keeps scenariosReady true and surfaces diagnostics when the summary reports partial corruption', async () => {
		expect.assertions(4);
		const definition = scenarioDefinition();
		const repository = createScenarioRepositoryHarness(undefined, {
			getSummary: vi.fn(async () => ({
				activeRunsByScenarioId: {},
				bestResultsByDefinitionKey: {},
				diagnostics: [
					{ code: 'corrupt-record', path: 'runs/alpha', value: null, detail: 'partial read' }
				]
			}))
		});
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);

		await controller.initializeScenarios();
		// Valid siblings remain usable despite the corrupt sibling record.
		expect(controller.state.scenariosReady).toBe(true);
		expect(controller.state.scenarioOperationError?.code).toBe('persistence-read-failed');
		expect(controller.state.retryScenarioOperation).not.toBeNull();
		expect(controller.state.activeScenarioRun).toBeNull();
	});

	it('flips scenariosReady to true after a failed init is retried successfully', async () => {
		expect.assertions(3);
		const definition = scenarioDefinition();
		const run = runForDefinition(definition);
		const goodSummary = emptyScenarioSummary(run);
		const repository = createScenarioRepositoryHarness(undefined, {
			getSummary: vi
				.fn()
				.mockRejectedValueOnce(new Error('storage unavailable'))
				.mockResolvedValueOnce(goodSummary),
			// The retry re-reads the run via loadActiveRunWithRevision to get an
			// atomic run/revision pair. The harness is built with no run, so
			// override the re-read to return the same run the summary reports —
			// otherwise the controller correctly refuses to stage a stale
			// summary run whose re-read came back empty.
			loadActiveRunWithRevision: vi.fn(async () => ({ run, revision: 0 }))
		});
		const controller = new GameRouteController(
			controllerOptions({ scenarioRepository: repository, definition })
		);

		await controller.initializeScenarios();
		expect(controller.state.scenariosReady).toBe(false);
		await controller.state.retryScenarioOperation!();
		expect(controller.state.scenariosReady).toBe(true);
		expect(controller.state.activeScenarioRun).toBe(run);
	});
});
