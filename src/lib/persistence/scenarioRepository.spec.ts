import { describe, expect, it } from 'vitest';
import { simulateDay } from '$lib/game/simulateDay';
import { createNewGame } from '$lib/game/state';
import { abandonScenario, evaluateScenario } from '$lib/scenarios/runtime';
import type {
	ScenarioDefinition,
	ScenarioDefinitionRef,
	ScenarioId,
	ScenarioRun,
	ScenarioRunRecord,
	ScenarioStoreSnapshot
} from '$lib/scenarios/types';
import {
	SCENARIO_RUN_SCHEMA_VERSION,
	SCENARIO_STORE_SCHEMA_VERSION,
	createEmptyScenarioStore,
	decodeScenarioStoreSnapshot,
	scenarioDefinitionKey,
	type DecodeScenarioStoreResult
} from './scenarioCodec';
import { createScenarioMemoryRepository } from './scenarioMemoryRepository';
import { ScenarioRepositoryFromDriver, type ScenarioStoreDriver } from './scenarioStoreRepository';
import { SAVE_SCHEMA_VERSION } from './saveTypes';

const OFFICIAL_SEEDS: Record<ScenarioId, number> = {
	'first-profit': 280_001,
	'import-squeeze': 280_002,
	'local-lifeline': 280_003
};

function fixtureDefinition(ref: ScenarioDefinitionRef): ScenarioDefinition {
	return {
		id: ref.scenarioId,
		version: ref.version,
		titleKey: 'store.defaultName',
		summaryKey: 'store.defaultName',
		briefingKey: 'store.defaultName',
		strategyHintKey: 'store.defaultName',
		officialSeed: OFFICIAL_SEEDS[ref.scenarioId] + ref.version - 1,
		dayLimit: 14,
		start: {
			foundingStore: {
				ref: 'founder',
				archetypeId: 'convenience',
				cityId: 'harbor-city',
				tileId: 'harbor-city-1-1'
			},
			industrialBuildings: [],
			rails: [],
			overrides: {}
		},
		content: {
			cityIds: ['harbor-city'],
			archetypeIds: ['convenience'],
			productCategoryIds: ['bottled-water'],
			materialIds: [],
			buildingTypeIds: [],
			retailPlacements: [],
			industrialPlacements: []
		},
		allowedCommands: ['advanceDay'],
		modifiers: [],
		requiredObjectives: [
			{
				id: 'cash-nonnegative',
				labelKey: 'store.defaultName',
				query: { metric: 'cash' },
				comparator: 'gte',
				target: 100,
				window: { kind: 'current' }
			},
			{
				id: 'store-open',
				labelKey: 'store.defaultName',
				query: { metric: 'store-count' },
				comparator: 'gte',
				target: 1,
				window: { kind: 'current' }
			}
		],
		optionalObjectives: [
			{
				id: 'cash-rich',
				labelKey: 'store.defaultName',
				query: { metric: 'scorecard', score: 'profit' },
				comparator: 'gte',
				target: 500,
				window: { kind: 'current' }
			}
		],
		failures: [
			{
				id: 'cash-negative',
				labelKey: 'store.defaultName',
				query: { metric: 'scorecard', score: 'profit' },
				comparator: 'lt',
				target: 0,
				window: { kind: 'current' }
			}
		],
		scoreComponents: [
			{
				kind: 'metric',
				query: { metric: 'cash' },
				window: { kind: 'current' },
				zeroBonusAt: 0,
				fullBonusAt: 1000,
				points: 500
			}
		],
		medalThresholds: { silver: 700, gold: 850 }
	};
}

function resolveFixtureDefinition(ref: ScenarioDefinitionRef): ScenarioDefinition | undefined {
	if (ref.version !== 1 && !(ref.scenarioId === 'first-profit' && ref.version === 2)) {
		return undefined;
	}
	return fixtureDefinition(ref);
}

function fixtureRun(
	ref: ScenarioDefinitionRef = { scenarioId: 'first-profit', version: 1 },
	options: {
		status?: ScenarioRun['status'];
		seed?: number;
		score?: number;
		advanceDays?: number;
	} = {}
): ScenarioRun {
	const definition = fixtureDefinition(ref);
	const seed = options.seed ?? definition.officialSeed;
	const status = options.status ?? 'active';
	let game = createNewGame('convenience', seed);
	for (let day = 0; day < (options.advanceDays ?? 0); day += 1) game = simulateDay(game);
	game = {
		...game,
		cash: Math.max(0, Math.min(1000, (options.score ?? 500) - 500) * 2),
		scorecard: status === 'failed' ? { ...game.scorecard, profit: -1 } : game.scorecard
	};
	const eligibility =
		seed === definition.officialSeed ? ('ranked' as const) : ('unranked' as const);
	const active: ScenarioRun = {
		runId: crypto.randomUUID(),
		definition: ref,
		seed,
		eligibility,
		status: 'active',
		game,
		evaluation: evaluateScenario(definition, game, false),
		result: null
	};
	if (status === 'active') return active;
	if (status === 'abandoned') return abandonScenario(active);
	const evaluation = evaluateScenario(definition, game, true);
	return {
		...active,
		status,
		evaluation,
		result: {
			definition: ref,
			seed,
			eligibility,
			outcome: status,
			completionDay: game.day,
			score: evaluation.projection.score,
			medal: status === 'completed' ? evaluation.projection.medal : null,
			evaluation
		}
	};
}

function runRecord(run: ScenarioRun): ScenarioRunRecord {
	const { game, ...runEnvelope } = structuredClone(run);
	return {
		scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
		gameSchemaVersion: SAVE_SCHEMA_VERSION,
		run: runEnvelope,
		game
	};
}

function snapshot(
	activeRunsByScenarioId: ScenarioStoreSnapshot['activeRunsByScenarioId'] = {},
	bestResultsByDefinitionKey: ScenarioStoreSnapshot['bestResultsByDefinitionKey'] = {}
): ScenarioStoreSnapshot {
	return {
		schemaVersion: SCENARIO_STORE_SCHEMA_VERSION,
		activeRunsByScenarioId,
		bestResultsByDefinitionKey
	};
}

interface Deferred {
	started: Promise<void>;
	release(): void;
}

class CountingDriver implements ScenarioStoreDriver {
	readCount = 0;
	writeCount = 0;
	events: string[] = [];
	private storedValue: unknown;
	private blockedWrite:
		| {
				started: () => void;
				startedPromise: Promise<void>;
				releasePromise: Promise<void>;
				release: () => void;
		  }
		| undefined;

	constructor(initial: unknown = createEmptyScenarioStore()) {
		this.storedValue = structuredClone(initial);
	}

	async read(): Promise<DecodeScenarioStoreResult> {
		this.readCount += 1;
		this.events.push('read');
		return decodeScenarioStoreSnapshot(this.storedValue, resolveFixtureDefinition);
	}

	async write(next: ScenarioStoreSnapshot): Promise<void> {
		this.writeCount += 1;
		this.events.push('write');
		const blocker = this.blockedWrite;
		if (blocker) {
			this.blockedWrite = undefined;
			blocker.started();
			await blocker.releasePromise;
		}
		const decoded = decodeScenarioStoreSnapshot(next, resolveFixtureDefinition);
		if (decoded.diagnostics.length > 0) {
			throw new Error(JSON.stringify(decoded.diagnostics));
		}
		this.storedValue = structuredClone(decoded.snapshot);
	}

	setSnapshot(next: unknown): void {
		this.storedValue = structuredClone(next);
	}

	decodeStored(): DecodeScenarioStoreResult {
		return decodeScenarioStoreSnapshot(this.storedValue, resolveFixtureDefinition);
	}

	resetCounts(): void {
		this.readCount = 0;
		this.writeCount = 0;
		this.events = [];
	}

	blockNextWrite(): Deferred {
		let started!: () => void;
		let release!: () => void;
		const startedPromise = new Promise<void>((resolve) => {
			started = resolve;
		});
		const releasePromise = new Promise<void>((resolve) => {
			release = resolve;
		});
		this.blockedWrite = { started, startedPromise, releasePromise, release };
		return { started: startedPromise, release };
	}
}

class CountingRepository extends ScenarioRepositoryFromDriver {
	mutationCount = 0;

	protected override mutate<T>(operation: () => Promise<T>): Promise<T> {
		this.mutationCount += 1;
		return super.mutate(operation);
	}
}

describe('scenario repository', { timeout: 30_000 }, () => {
	it('keeps one active run per scenario while isolating other scenarios', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const first = fixtureRun();
		const other = fixtureRun({ scenarioId: 'import-squeeze', version: 1 });
		const replacement = fixtureRun(undefined, { seed: first.seed + 50 });

		await repository.saveActiveRun(first);
		await repository.saveActiveRun(other);
		await repository.saveActiveRun(replacement, { replace: true });
		const summary = await repository.getSummary();

		expect(Object.keys(summary.activeRunsByScenarioId).sort()).toEqual([
			'first-profit',
			'import-squeeze'
		]);
		expect(summary.activeRunsByScenarioId['first-profit']).toEqual(replacement);
		expect(summary.activeRunsByScenarioId['import-squeeze']).toEqual(other);
	});

	it('saves, loads, and resumes an active run through a new repository instance', async () => {
		const driver = new CountingDriver();
		const run = fixtureRun();
		await new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition).saveActiveRun(run);

		const resumed = await new ScenarioRepositoryFromDriver(
			driver,
			resolveFixtureDefinition
		).loadActiveRun('first-profit');

		expect(resumed).toEqual(run);
		expect(resumed).not.toBe(run);
	});

	it('removes an abandoned run without changing a prior best result', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const first = fixtureRun();
		await repository.saveActiveRun(first);
		await repository.commitTerminalRun(fixtureRun(undefined, { status: 'completed', score: 700 }));
		await repository.saveActiveRun(fixtureRun(undefined, { seed: first.seed + 1 }));

		await repository.removeActiveRun('first-profit');
		const summary = await repository.getSummary();

		expect(summary.activeRunsByScenarioId['first-profit']).toBeUndefined();
		expect(summary.bestResultsByDefinitionKey['first-profit@1']?.score).toBe(700);
	});

	it('returns a failed terminal result while removing it from resumable persistence', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const active = fixtureRun();
		await repository.saveActiveRun(active);
		const failed = fixtureRun(undefined, { status: 'failed', score: 610 });
		failed.runId = active.runId;

		const outcome = await repository.commitTerminalRun(failed);
		const summary = await repository.getSummary();

		expect(outcome).toEqual({ activeRun: null, terminalResult: failed.result, bestUpdated: false });
		expect(summary.activeRunsByScenarioId).toEqual({});
		expect(summary.bestResultsByDefinitionKey).toEqual({});
	});

	it('returns an unranked completion without storing it as a best result', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const custom = fixtureRun(undefined, {
			status: 'completed',
			seed: OFFICIAL_SEEDS['first-profit'] + 99,
			score: 900
		});
		const customActive = fixtureRun(undefined, { seed: custom.seed });
		await repository.saveActiveRun(customActive);
		custom.runId = customActive.runId;

		const outcome = await repository.commitTerminalRun(custom);

		expect(outcome).toEqual({ activeRun: null, terminalResult: custom.result, bestUpdated: false });
		expect((await repository.getSummary()).bestResultsByDefinitionKey).toEqual({});
	});

	it('updates a ranked best only for a strictly greater score and retains equal scores', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const existing = fixtureRun(undefined, { status: 'completed', score: 750 });
		const existingActive = fixtureRun();
		await repository.saveActiveRun(existingActive);
		existing.runId = existingActive.runId;
		const firstOutcome = await repository.commitTerminalRun(existing);
		const equalActive = fixtureRun();
		await repository.saveActiveRun(equalActive);
		const equal = fixtureRun(undefined, {
			status: 'completed',
			score: 750,
			advanceDays: 1
		});
		equal.runId = equalActive.runId;

		const equalOutcome = await repository.commitTerminalRun(equal);
		const summary = await repository.getSummary();

		expect(firstOutcome.bestUpdated).toBe(true);
		expect(equalOutcome).toEqual({
			activeRun: null,
			terminalResult: equal.result,
			bestUpdated: false
		});
		expect(summary.bestResultsByDefinitionKey['first-profit@1']).toEqual(existing.result);
	});

	it('rejects a fabricated terminal evaluation before it can replace the persisted best', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		await repository.saveActiveRun(fixtureRun());
		const existing = fixtureRun(undefined, { status: 'completed', score: 750 });
		await repository.commitTerminalRun(existing);
		const active = fixtureRun();
		await repository.saveActiveRun(active, { replace: true });
		const fabricated = fixtureRun(undefined, { status: 'completed', score: 700 });
		fabricated.evaluation = {
			...fabricated.evaluation,
			projection: {
				...fabricated.evaluation.projection,
				score: 1000,
				medal: 'gold',
				componentPoints: [500]
			}
		};
		fabricated.result = {
			...fabricated.result!,
			score: 1000,
			medal: 'gold',
			evaluation: fabricated.evaluation
		};

		await expect(repository.commitTerminalRun(fabricated)).rejects.toThrow();
		const summary = await repository.getSummary();
		expect(summary.bestResultsByDefinitionKey['first-profit@1']).toEqual(existing.result);
		expect(summary.activeRunsByScenarioId['first-profit']).toEqual(active);
	});

	it('preserves a replacement active run when committing a stale terminal run', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const original = fixtureRun(undefined, { seed: OFFICIAL_SEEDS['first-profit'] });
		await repository.saveActiveRun(original);
		// User restarts mid-results-dialog: a new active run replaces the original.
		const replacement = fixtureRun(undefined, { seed: original.seed + 50 });
		await repository.saveActiveRun(replacement, { replace: true });
		// The stale results dialog then commits the original (now terminal) run.
		const staleTerminal = fixtureRun(undefined, {
			status: 'completed',
			seed: original.seed,
			score: 750
		});

		const outcome = await repository.commitTerminalRun(staleTerminal);
		const summary = await repository.getSummary();

		// The replacement active run must survive — it is the user's current run.
		expect(summary.activeRunsByScenarioId['first-profit']).toEqual(replacement);
		// The outcome must surface the preserved replacement as the active run so
		// the controller's in-memory state stays consistent with storage.
		expect(outcome.activeRun).toEqual(replacement);
		// The terminal run's best result is still recorded.
		expect(outcome.bestUpdated).toBe(true);
		expect(summary.bestResultsByDefinitionKey['first-profit@1']).toEqual(staleTerminal.result);
	});

	it('preserves a restart-produced replacement when a stale commit shares the same seed', async () => {
		// restartScenario preserves the seed but produces a fresh runId. A stale
		// terminal commit for the original run must not delete the replacement,
		// even though both share (version, seed). The runId identity check
		// prevents the stale commit from clearing the resumable replacement.
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const original = fixtureRun(undefined, { seed: OFFICIAL_SEEDS['first-profit'] });
		await repository.saveActiveRun(original);
		// User restarts mid-results-dialog: restartScenario calls startScenario
		// with the same seed, producing a new run with a fresh runId.
		const replacement = fixtureRun(undefined, { seed: original.seed });
		expect(replacement.runId).not.toBe(original.runId);
		await repository.saveActiveRun(replacement, { replace: true });
		// The stale results dialog commits the original (now terminal) run.
		// It carries the original's runId, not the replacement's.
		const staleTerminal = fixtureRun(undefined, {
			status: 'completed',
			seed: original.seed,
			score: 750
		});
		staleTerminal.runId = original.runId;

		const outcome = await repository.commitTerminalRun(staleTerminal);
		const summary = await repository.getSummary();

		// The replacement active run must survive — it is the user's current run.
		expect(summary.activeRunsByScenarioId['first-profit']).toEqual(replacement);
		// The outcome must surface the preserved replacement as the active run so
		// the controller's in-memory state stays consistent with storage.
		expect(outcome.activeRun).toEqual(replacement);
		// The terminal run's best result is still recorded.
		expect(outcome.bestUpdated).toBe(true);
		expect(summary.bestResultsByDefinitionKey['first-profit@1']).toEqual(staleTerminal.result);
	});

	it('clears the active entry when the terminal run is the same run instance', async () => {
		// In the normal flow (no restart), the terminal run carries the same
		// runId as the active run that was saved. The commit must clear the
		// active entry so the scenario is no longer resumable.
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const active = fixtureRun();
		await repository.saveActiveRun(active);
		const terminal = fixtureRun(undefined, { status: 'completed', score: 750 });
		terminal.runId = active.runId;

		const outcome = await repository.commitTerminalRun(terminal);
		const summary = await repository.getSummary();

		expect(summary.activeRunsByScenarioId['first-profit']).toBeUndefined();
		// The active entry was cleared, so the outcome must report no active run.
		expect(outcome.activeRun).toBeNull();
		expect(summary.bestResultsByDefinitionKey['first-profit@1']).toEqual(terminal.result);
	});

	it('commits and reloads a ranked best with a standalone customer-satisfaction score metric', async () => {
		const definition: ScenarioDefinition = {
			...fixtureDefinition({ scenarioId: 'first-profit', version: 1 }),
			scoreComponents: [
				{
					kind: 'metric',
					query: { metric: 'scorecard', score: 'customerSatisfaction' },
					window: { kind: 'current' },
					zeroBonusAt: 0,
					fullBonusAt: 100,
					points: 500
				}
			]
		};
		const resolveStandalone = () => definition;
		const repository = createScenarioMemoryRepository(undefined, resolveStandalone);
		const seed = definition.officialSeed;
		const activeGame = { ...createNewGame('convenience', seed), cash: 0 };
		const active: ScenarioRun = {
			runId: crypto.randomUUID(),
			definition: { scenarioId: 'first-profit', version: 1 },
			seed,
			eligibility: 'ranked',
			status: 'active',
			game: activeGame,
			evaluation: evaluateScenario(definition, activeGame, false),
			result: null
		};
		const terminalGame = { ...activeGame, cash: 200 };
		const evaluation = evaluateScenario(definition, terminalGame, true);
		const terminal: ScenarioRun = {
			...active,
			status: 'completed',
			game: terminalGame,
			evaluation,
			result: {
				definition: active.definition,
				seed,
				eligibility: 'ranked',
				outcome: 'completed',
				completionDay: terminalGame.day,
				score: evaluation.projection.score,
				medal: evaluation.projection.medal,
				evaluation
			}
		};

		await repository.saveActiveRun(active);
		const committed = await repository.commitTerminalRun(terminal);
		const summary = await repository.getSummary();

		expect(committed.bestUpdated).toBe(true);
		expect(summary.activeRunsByScenarioId['first-profit']).toBeUndefined();
		expect(summary.bestResultsByDefinitionKey['first-profit@1']).toEqual(terminal.result);
	});

	it('stores best results separately for each immutable definition version', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const versionOne = fixtureRun(undefined, { status: 'completed', score: 700 });
		const versionTwo = fixtureRun(
			{ scenarioId: 'first-profit', version: 2 },
			{ status: 'completed', score: 800 }
		);
		await repository.saveActiveRun(fixtureRun());
		await repository.commitTerminalRun(versionOne);
		await repository.saveActiveRun(fixtureRun({ scenarioId: 'first-profit', version: 2 }), {
			replace: true
		});

		const outcome = await repository.commitTerminalRun(versionTwo);
		const summary = await repository.getSummary();

		expect(outcome.bestUpdated).toBe(true);
		expect(Object.keys(summary.bestResultsByDefinitionKey).sort()).toEqual([
			'first-profit@1',
			'first-profit@2'
		]);
		expect(
			summary.bestResultsByDefinitionKey[scenarioDefinitionKey(versionOne.definition)]
		).toEqual(versionOne.result);
		expect(
			summary.bestResultsByDefinitionKey[scenarioDefinitionKey(versionTwo.definition)]
		).toEqual(versionTwo.result);
	});

	it('serializes queued mutations in call order', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const first = fixtureRun();
		const second = fixtureRun(undefined, { seed: first.seed + 5 });
		const blocker = driver.blockNextWrite();

		const firstSave = repository.saveActiveRun(first);
		const secondSave = repository.saveActiveRun(second, { replace: true });
		await blocker.started;

		expect(driver.readCount).toBe(1);
		expect(driver.writeCount).toBe(1);
		blocker.release();
		await Promise.all([firstSave, secondSave]);

		expect(driver.events).toEqual(['read', 'write', 'read', 'write']);
		expect((await repository.loadActiveRun('first-profit'))?.seed).toBe(second.seed);
	});

	it('commits a terminal run with one queued mutation, one read, and one write', async () => {
		const active = fixtureRun();
		const driver = new CountingDriver(snapshot({ 'first-profit': runRecord(active) }));
		const repository = new CountingRepository(driver, resolveFixtureDefinition);
		const terminal = fixtureRun(undefined, { status: 'completed', score: 850 });
		terminal.runId = active.runId;
		driver.resetCounts();

		const outcome = await repository.commitTerminalRun(terminal);

		expect(outcome.bestUpdated).toBe(true);
		expect(repository.mutationCount).toBe(1);
		expect(driver.readCount).toBe(1);
		expect(driver.writeCount).toBe(1);
		expect(driver.decodeStored().snapshot.activeRunsByScenarioId).toEqual({});
		expect(
			driver.decodeStored().snapshot.bestResultsByDefinitionKey['first-profit@1']?.result
		).toEqual(terminal.result);
	});

	it('provides an in-memory repository with the same persistence contract', async () => {
		const repository = createScenarioMemoryRepository(undefined, resolveFixtureDefinition);
		const active = fixtureRun({ scenarioId: 'local-lifeline', version: 1 });

		const saved = await repository.saveActiveRun(active);
		const loaded = await repository.loadActiveRun('local-lifeline');

		expect(saved).toEqual({ activeRun: active, terminalResult: null, bestUpdated: false });
		expect(loaded).toEqual(active);
	});

	it('saveActiveRun refuses to silently overwrite a different active run (CAS)', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const first = fixtureRun();
		await repository.saveActiveRun(first);

		// A second start in another tab produces a different runId for the same
		// scenario. Without `replace: true` the save must be refused so the
		// first run is not silently clobbered.
		const stale = fixtureRun(undefined, { seed: first.seed + 100 });
		expect(stale.runId).not.toBe(first.runId);
		const outcome = await repository.saveActiveRun(stale);

		expect(outcome).toEqual({ status: 'conflict', activeRun: first });
		const summary = await repository.getSummary();
		expect(summary.activeRunsByScenarioId['first-profit']).toEqual(first);
	});

	it('saveActiveRun with replace:true overwrites a different active run', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const first = fixtureRun();
		await repository.saveActiveRun(first);

		const replacement = fixtureRun(undefined, { seed: first.seed + 100 });
		const outcome = await repository.saveActiveRun(replacement, { replace: true });

		expect(outcome).toEqual({
			activeRun: replacement,
			terminalResult: null,
			bestUpdated: false
		});
		const summary = await repository.getSummary();
		expect(summary.activeRunsByScenarioId['first-profit']).toEqual(replacement);
	});

	it('saveActiveRun allows same-runId saves (in-game evolution)', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const run = fixtureRun();
		await repository.saveActiveRun(run);

		// Re-saving the same run (same runId, e.g. after a command advanced its
		// game state) must succeed without `replace: true`. The CAS guard only
		// refuses saves whose runId differs from the stored one.
		const outcome = await repository.saveActiveRun(run);

		expect(outcome).toEqual({
			activeRun: run,
			terminalResult: null,
			bestUpdated: false
		});
	});

	it('removeActiveRun refuses to delete a different run when runId is provided (CAS)', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const stored = fixtureRun();
		await repository.saveActiveRun(stored);

		// A stale results dialog tries to abandon a run that is no longer the
		// stored one. The removal must be refused so the replacement survives.
		const stale = fixtureRun(undefined, { seed: stored.seed + 100 });
		expect(stale.runId).not.toBe(stored.runId);
		const outcome = await repository.removeActiveRun('first-profit', stale.runId);

		expect(outcome).toEqual({ status: 'conflict', activeRun: stored });
		const summary = await repository.getSummary();
		expect(summary.activeRunsByScenarioId['first-profit']).toEqual(stored);
	});

	it('removeActiveRun without runId is unconditional (backwards-compatible)', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const stored = fixtureRun();
		await repository.saveActiveRun(stored);

		const outcome = await repository.removeActiveRun('first-profit');

		expect(outcome).toEqual({ status: 'removed' });
		const summary = await repository.getSummary();
		expect(summary.activeRunsByScenarioId['first-profit']).toBeUndefined();
	});

	it('removeActiveRun with matching runId removes the run', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const stored = fixtureRun();
		await repository.saveActiveRun(stored);

		const outcome = await repository.removeActiveRun('first-profit', stored.runId);

		expect(outcome).toEqual({ status: 'removed' });
		const summary = await repository.getSummary();
		expect(summary.activeRunsByScenarioId['first-profit']).toBeUndefined();
	});

	it('removeActiveRun with runId on a missing entry reports removed', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);

		const outcome = await repository.removeActiveRun('first-profit', 'never-stored');

		expect(outcome).toEqual({ status: 'removed' });
	});
});
