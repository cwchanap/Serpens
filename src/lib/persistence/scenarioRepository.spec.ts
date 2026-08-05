import { describe, expect, it } from 'vitest';
import { simulateDay } from '$lib/game/simulateDay';
import { createNewGame } from '$lib/game/state';
import { abandonScenario, evaluateScenario } from '$lib/scenarios/runtime';
import type {
	ScenarioCommitOutcome,
	ScenarioDefinition,
	ScenarioDefinitionRef,
	ScenarioId,
	ScenarioRun,
	ScenarioStoreSnapshot
} from '$lib/scenarios/types';
import {
	SCENARIO_STORE_SCHEMA_VERSION,
	createEmptyScenarioStore,
	decodeScenarioStoreSnapshot,
	scenarioDefinitionKey,
	type DecodeScenarioStoreResult
} from './scenarioCodec';
import { createScenarioMemoryRepository } from './scenarioMemoryRepository';
import { ScenarioRepositoryFromDriver, type ScenarioStoreDriver } from './scenarioStoreRepository';
import type { LockContext } from './scenarioStoreLock';
import {
	InProcessScenarioStoreLock,
	NoopScenarioStoreLock,
	SCENARIO_STORE_LOCK_NAME
} from './scenarioStoreLock';
import { runRecord, snapshot } from './scenarioRepository.testUtils';

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

	protected override mutate<T>(operation: (context: LockContext) => Promise<T>): Promise<T> {
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
		const firstOutcome = (await repository.commitTerminalRun(existing)) as ScenarioCommitOutcome;
		const equalActive = fixtureRun();
		await repository.saveActiveRun(equalActive);
		const equal = fixtureRun(undefined, {
			status: 'completed',
			score: 750,
			advanceDays: 1
		});
		equal.runId = equalActive.runId;

		const equalOutcome = (await repository.commitTerminalRun(equal)) as ScenarioCommitOutcome;
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

		const outcome = (await repository.commitTerminalRun(staleTerminal)) as ScenarioCommitOutcome;
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

		const outcome = (await repository.commitTerminalRun(staleTerminal)) as ScenarioCommitOutcome;
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

		const outcome = (await repository.commitTerminalRun(terminal)) as ScenarioCommitOutcome;
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
		const committed = (await repository.commitTerminalRun(terminal)) as ScenarioCommitOutcome;
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

		const outcome = (await repository.commitTerminalRun(versionTwo)) as ScenarioCommitOutcome;
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

		const outcome = (await repository.commitTerminalRun(terminal)) as ScenarioCommitOutcome;

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

		expect(outcome).toEqual({ status: 'conflict', activeRun: first, revision: 1 });
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

	it('saveActiveRun with expectedRunId matching the stored run proceeds with replace:true', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const first = fixtureRun();
		await repository.saveActiveRun(first);

		// Restart produces a fresh runId but the caller binds the write to the
		// runId it inspected. The stored run still matches, so the save proceeds.
		const restarted = fixtureRun(undefined, { seed: first.seed });
		const outcome = await repository.saveActiveRun(restarted, {
			replace: true,
			expectedRunId: first.runId
		});
		expect(outcome).toEqual({
			activeRun: restarted,
			terminalResult: null,
			bestUpdated: false
		});
		const summary = await repository.getSummary();
		expect(summary.activeRunsByScenarioId['first-profit']).toEqual(restarted);
	});

	it('saveActiveRun with expectedRunId mismatching the stored run returns conflict', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const first = fixtureRun();
		await repository.saveActiveRun(first);

		// Another tab replaced the run between the caller's read and write.
		const replacement = fixtureRun(undefined, { seed: first.seed + 100 });
		await repository.saveActiveRun(replacement, { replace: true });

		// The caller tries to write with the stale expectedRunId. Even with
		// replace:true, the identity mismatch refuses the save.
		const restarted = fixtureRun(undefined, { seed: first.seed });
		const outcome = await repository.saveActiveRun(restarted, {
			replace: true,
			expectedRunId: first.runId
		});
		expect(outcome).toEqual({ status: 'conflict', activeRun: replacement, revision: 2 });
		const summary = await repository.getSummary();
		expect(summary.activeRunsByScenarioId['first-profit']).toEqual(replacement);
	});

	it('saveActiveRun with expectedRunId:null refuses when a run appeared', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);

		// The caller inspected an empty slot (expectedRunId: null). Before the
		// write, another tab started a run. The save must be refused.
		const other = fixtureRun();
		await repository.saveActiveRun(other);

		const started = fixtureRun(undefined, { seed: other.seed + 100 });
		const outcome = await repository.saveActiveRun(started, {
			replace: true,
			expectedRunId: null
		});
		expect(outcome).toEqual({ status: 'conflict', activeRun: other, revision: 1 });
	});

	it('saveActiveRun with expectedRunId:null proceeds when no run is stored', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);

		const started = fixtureRun();
		const outcome = await repository.saveActiveRun(started, {
			replace: true,
			expectedRunId: null
		});
		expect(outcome).toEqual({
			activeRun: started,
			terminalResult: null,
			bestUpdated: false
		});
	});

	it('saveActiveRun with expectedRunId for a gone run returns conflict with null activeRun', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const first = fixtureRun();
		await repository.saveActiveRun(first);

		// The expected run was abandoned between the caller's read and write.
		await repository.removeActiveRun('first-profit');

		const restarted = fixtureRun(undefined, { seed: first.seed });
		const outcome = await repository.saveActiveRun(restarted, {
			replace: true,
			expectedRunId: first.runId
		});
		expect(outcome).toEqual({ status: 'conflict', activeRun: null, revision: null });
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
		const outcome = await repository.removeActiveRun('first-profit', {
			expectedRunId: stale.runId
		});

		expect(outcome).toEqual({ status: 'conflict', activeRun: stored, revision: 1 });
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

		const outcome = await repository.removeActiveRun('first-profit', {
			expectedRunId: stored.runId
		});

		expect(outcome).toEqual({ status: 'removed' });
		const summary = await repository.getSummary();
		expect(summary.activeRunsByScenarioId['first-profit']).toBeUndefined();
	});

	it('removeActiveRun with expectedRunId on a missing entry reports conflict (expected run is gone)', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);

		const outcome = await repository.removeActiveRun('first-profit', {
			expectedRunId: 'never-stored'
		});

		expect(outcome).toEqual({ status: 'conflict', activeRun: null, revision: null });
	});

	it('removeActiveRun refuses to delete when expectedRevision does not match (CAS)', async () => {
		// Two tabs resume the same run (same runId). Tab A saves first,
		// advancing the stored revision from 1 to 2. Tab B, which loaded
		// the run at revision 1, then calls removeActiveRun with
		// expectedRevision: 1. Without the revision CAS, tab B's abandon
		// would delete tab A's newer revision of the same run. The
		// revision guard refuses the delete and surfaces the stored run.
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const run = fixtureRun();
		await repository.saveActiveRun(run);
		const loaded = await repository.loadActiveRunWithRevision('first-profit');
		expect(loaded).not.toBeNull();
		expect(loaded!.revision).toBe(1);

		// Tab A advances the run (same runId, new game state) and saves.
		const advancedGame = simulateDay(run.game);
		const advancedRun: ScenarioRun = {
			...run,
			game: advancedGame,
			evaluation: evaluateScenario(resolveFixtureDefinition(run.definition)!, advancedGame, false)
		};
		await repository.saveActiveRun(advancedRun, { expectedRevision: 1 });
		const afterA = await repository.loadActiveRunWithRevision('first-profit');
		expect(afterA!.revision).toBe(2);

		// Tab B (stale, still at revision 1) tries to abandon the same run.
		// The revision CAS refuses the delete.
		const outcome = await repository.removeActiveRun('first-profit', {
			expectedRunId: run.runId,
			expectedRevision: 1
		});
		expect(outcome).toEqual({
			status: 'conflict',
			activeRun: advancedRun,
			revision: 2
		});
		// The run is still in storage.
		const stored = await repository.loadActiveRun('first-profit');
		expect(stored?.game.day).toBe(advancedRun.game.day);
	});

	describe('cross-tab lock', () => {
		it('without a lock, two concurrent saves silently clobber (last-write-wins)', async () => {
			// Two repository instances share the same driver but hold
			// independent mutation queues, so their read-modify-write
			// windows interleave. Without a cross-tab lock the second
			// write lands after the first and overwrites it — the
			// compare-and-swap guard never sees the first run because
			// both reads happened before either write.
			const driver = new CountingDriver();
			const repoA = new ScenarioRepositoryFromDriver(
				driver,
				resolveFixtureDefinition,
				new NoopScenarioStoreLock()
			);
			const repoB = new ScenarioRepositoryFromDriver(
				driver,
				resolveFixtureDefinition,
				new NoopScenarioStoreLock()
			);
			const runA = fixtureRun();
			const runB = fixtureRun(undefined, { seed: runA.seed + 1 });

			// Drive the interleaving manually: both read before either
			// writes, so each sees an empty slot and proceeds to write.
			// The driver's read/write are synchronous-resolved, so to
			// force the race we call saveActiveRun concurrently.
			const [outcomeA, outcomeB] = await Promise.all([
				repoA.saveActiveRun(runA),
				repoB.saveActiveRun(runB)
			]);

			// Both saves "succeed" (no conflict) because each read an
			// empty slot. The second write clobbered the first.
			expect('status' in outcomeA && outcomeA.status === 'conflict').toBe(false);
			expect('status' in outcomeB && outcomeB.status === 'conflict').toBe(false);
			const stored = driver.decodeStored().snapshot.activeRunsByScenarioId['first-profit'];
			expect(stored?.run.runId).toBe(runB.runId);
		});

		it('with a shared lock, the second concurrent save sees the first and returns a conflict', async () => {
			// Same setup as above, but both repositories share an
			// InProcessScenarioStoreLock. The lock serializes the
			// read-modify-write critical sections: the first save
			// completes (read empty, write runA, release) before the
			// second begins (read runA, see a different runId, refuse
			// with a conflict instead of clobbering).
			const driver = new CountingDriver();
			const lock = new InProcessScenarioStoreLock();
			const repoA = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition, lock);
			const repoB = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition, lock);
			const runA = fixtureRun();
			const runB = fixtureRun(undefined, { seed: runA.seed + 1 });

			const [outcomeA, outcomeB] = await Promise.all([
				repoA.saveActiveRun(runA),
				repoB.saveActiveRun(runB)
			]);

			expect('status' in outcomeA && outcomeA.status === 'conflict').toBe(false);
			expect('status' in outcomeB && outcomeB.status === 'conflict').toBe(true);
			if ('status' in outcomeB && outcomeB.status === 'conflict') {
				expect(outcomeB.activeRun?.runId).toBe(runA.runId);
			}
			const stored = driver.decodeStored().snapshot.activeRunsByScenarioId['first-profit'];
			expect(stored?.run.runId).toBe(runA.runId);
		});

		it('uses the shared SCENARIO_STORE_LOCK_NAME so all instances on the origin compete for one lock', () => {
			// The lock name is a constant so two tabs acquire the same
			// named lock instead of each inventing an independent one.
			// This is a static guarantee — assert the constant exists
			// and is a non-empty string so a refactor cannot silently
			// split the lock namespace.
			expect(SCENARIO_STORE_LOCK_NAME).toBe('serpens.scenarios');
		});
	});

	describe('revision compare-and-swap', () => {
		it('refuses a same-runId save whose expectedRevision is stale (cross-tab rollback guard)', async () => {
			// Two tabs resume the same run (same runId). Tab A saves first,
			// advancing the stored revision from 1 to 2. Tab B, which loaded
			// the run at revision 1, then saves with expectedRevision: 1.
			// Without the revision CAS, tab B's save (computed from stale
			// game state) would silently roll back tab A's progress. The
			// revision guard refuses the write and surfaces the stored run.
			const driver = new CountingDriver();
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
			const run = fixtureRun();
			await repository.saveActiveRun(run);
			const loaded = await repository.loadActiveRunWithRevision('first-profit');
			expect(loaded).not.toBeNull();
			expect(loaded!.revision).toBe(1);

			// Tab A advances the run (same runId, new game state) and saves.
			const advancedGame = simulateDay(run.game);
			const advancedRun: ScenarioRun = {
				...run,
				game: advancedGame,
				evaluation: evaluateScenario(resolveFixtureDefinition(run.definition)!, advancedGame, false)
			};
			await repository.saveActiveRun(advancedRun, { expectedRevision: 1 });
			const afterA = await repository.loadActiveRunWithRevision('first-profit');
			expect(afterA!.revision).toBe(2);

			// Tab B (stale, still at revision 1) tries to save its version
			// of the same run. The revision CAS refuses the write.
			const staleRun: ScenarioRun = {
				...run,
				game: simulateDay(run.game)
			};
			const outcome = await repository.saveActiveRun(staleRun, { expectedRevision: 1 });
			expect(outcome).toEqual({
				status: 'conflict',
				activeRun: advancedRun,
				revision: 2
			});
			// The stored run is still tab A's version.
			const stored = await repository.loadActiveRun('first-profit');
			expect(stored?.game.day).toBe(advancedRun.game.day);
		});

		it('accepts a same-runId save whose expectedRevision matches', async () => {
			const driver = new CountingDriver();
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
			const run = fixtureRun();
			await repository.saveActiveRun(run);
			const loaded = await repository.loadActiveRunWithRevision('first-profit');
			expect(loaded!.revision).toBe(1);

			const advancedGame = simulateDay(run.game);
			const advancedRun: ScenarioRun = {
				...run,
				game: advancedGame,
				evaluation: evaluateScenario(resolveFixtureDefinition(run.definition)!, advancedGame, false)
			};
			const outcome = await repository.saveActiveRun(advancedRun, { expectedRevision: 1 });
			expect('status' in outcome && outcome.status === 'conflict').toBe(false);
			const after = await repository.loadActiveRunWithRevision('first-profit');
			expect(after!.revision).toBe(2);
		});

		it('increments revision on each same-runId save', async () => {
			const driver = new CountingDriver();
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
			const run = fixtureRun();
			await repository.saveActiveRun(run);

			for (let i = 1; i <= 3; i++) {
				const loaded = await repository.loadActiveRunWithRevision('first-profit');
				expect(loaded!.revision).toBe(i);
				// This repository-CAS test is intentionally decision-agnostic. Event
				// persistence validation is covered by the event save-codec task.
				const nextGame = { ...simulateDay(loaded!.run.game), decisions: [] };
				const next: ScenarioRun = {
					...run,
					game: nextGame,
					evaluation: evaluateScenario(resolveFixtureDefinition(run.definition)!, nextGame, false)
				};
				await repository.saveActiveRun(next, { expectedRevision: i });
			}
			const final = await repository.loadActiveRunWithRevision('first-profit');
			expect(final!.revision).toBe(4);
		});

		it('commitTerminalRun refuses when expectedRevision is stale', async () => {
			const driver = new CountingDriver();
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
			const run = fixtureRun();
			await repository.saveActiveRun(run);
			const loaded = await repository.loadActiveRunWithRevision('first-profit');
			expect(loaded!.revision).toBe(1);

			// Another tab advances the run before this tab commits.
			const advancedGame = simulateDay(run.game);
			const advancedRun: ScenarioRun = {
				...run,
				game: advancedGame,
				evaluation: evaluateScenario(resolveFixtureDefinition(run.definition)!, advancedGame, false)
			};
			await repository.saveActiveRun(advancedRun, { expectedRevision: 1 });

			// This tab (stale, at revision 1) tries to commit a terminal
			// result computed from the old game state. The revision CAS
			// refuses — the stored run has since advanced to revision 2.
			const terminal = abandonScenario(run);
			const outcome = await repository.commitTerminalRun(terminal, { expectedRevision: 1 });
			expect(outcome).toEqual({
				status: 'conflict',
				activeRun: advancedRun,
				revision: 2
			});
			// The active entry is still the advanced run.
			const stored = await repository.loadActiveRun('first-profit');
			expect(stored?.runId).toBe(advancedRun.runId);
		});

		it('commitTerminalRun refuses when expectedRevision is supplied but the active entry is gone', async () => {
			// The public contract says a missing expected run produces a
			// conflict with `activeRun: null`, and that a terminal commit
			// with `expectedRevision` must be refused unless the stored
			// active revision matches. If another tab abandons or removes
			// the run before this terminal commit, the stored entry no
			// longer exists; without this guard the stale terminal result
			// is still recorded, potentially becoming the stored best
			// result. The revision CAS must refuse and surface null so the
			// caller refreshes its catalog instead of recording a stale
			// best result.
			const driver = new CountingDriver();
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
			const run = fixtureRun();
			await repository.saveActiveRun(run);
			const loaded = await repository.loadActiveRunWithRevision('first-profit');
			expect(loaded!.revision).toBe(1);

			// Another tab removes the run before this tab commits.
			await repository.removeActiveRun('first-profit', { expectedRunId: run.runId });
			expect(await repository.loadActiveRun('first-profit')).toBeNull();

			const terminal = abandonScenario(run);
			const outcome = await repository.commitTerminalRun(terminal, { expectedRevision: 1 });
			expect(outcome).toEqual({
				status: 'conflict',
				activeRun: null,
				revision: null
			});
			// No best result was recorded for the stale terminal commit.
			const bestKey = scenarioDefinitionKey(run.definition);
			const driverSnapshot = driver.decodeStored().snapshot;
			expect(driverSnapshot.bestResultsByDefinitionKey[bestKey]).toBeUndefined();
			// The active entry is still absent.
			expect(driverSnapshot.activeRunsByScenarioId['first-profit']).toBeUndefined();
		});
	});

	describe('scenario repository validation and edge cases', () => {
		it('saveActiveRun throws a TypeError when passed an abandoned run', async () => {
			const driver = new CountingDriver();
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
			const abandoned = abandonScenario(fixtureRun());

			await expect(repository.saveActiveRun(abandoned)).rejects.toThrow(
				'saveActiveRun requires an active run without a terminal result.'
			);
		});

		it('commitTerminalRun throws a TypeError when passed an active run', async () => {
			const driver = new CountingDriver();
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
			const active = fixtureRun();

			await expect(repository.commitTerminalRun(active)).rejects.toThrow(
				'commitTerminalRun requires a completed, failed, or abandoned run.'
			);
		});

		it('loadActiveRunWithRevision returns null when no run is stored', async () => {
			const driver = new CountingDriver();
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);

			const loaded = await repository.loadActiveRunWithRevision('first-profit');
			expect(loaded).toBeNull();
		});

		it('getSummary skips null entries in activeRunsByScenarioId and bestResultsByDefinitionKey', async () => {
			const driver = new CountingDriver({
				schemaVersion: SCENARIO_STORE_SCHEMA_VERSION,
				activeRunsByScenarioId: { 'first-profit': null as unknown as undefined },
				bestResultsByDefinitionKey: { 'first-profit@1': null as unknown as undefined }
			});
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
			const summary = await repository.getSummary();

			expect(summary.activeRunsByScenarioId['first-profit']).toBeUndefined();
			expect(summary.bestResultsByDefinitionKey['first-profit@1']).toBeUndefined();
		});

		it('saveActiveRun with expectedRunId on an empty slot proceeds when expected is null', async () => {
			const driver = new CountingDriver();
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
			const run = fixtureRun();

			const outcome = await repository.saveActiveRun(run, { expectedRunId: null });
			expect('status' in outcome && outcome.status === 'conflict').toBe(false);
		});

		it('saveActiveRun with expectedRunId mismatch on an empty slot surfaces a null conflict', async () => {
			const driver = new CountingDriver();
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
			const run = fixtureRun();

			const outcome = await repository.saveActiveRun(run, { expectedRunId: 'some-other-id' });
			expect(outcome).toEqual({ status: 'conflict', activeRun: null, revision: null });
		});

		it('saveActiveRun with expectedRevision: 0 on an empty slot proceeds', async () => {
			const driver = new CountingDriver();
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
			const run = fixtureRun();

			const outcome = await repository.saveActiveRun(run, { expectedRevision: 0 });
			expect('status' in outcome && outcome.status === 'conflict').toBe(false);
			const loaded = await repository.loadActiveRunWithRevision('first-profit');
			expect(loaded!.revision).toBe(1);
		});

		it('saveActiveRun with an empty options object proceeds without CAS checks', async () => {
			const driver = new CountingDriver();
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
			const run = fixtureRun();

			const outcome = await repository.saveActiveRun(run, {});
			expect('status' in outcome && outcome.status === 'conflict').toBe(false);
		});

		it('removeActiveRun with expectedRunId: null on an empty slot proceeds', async () => {
			const driver = new CountingDriver();
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);

			const outcome = await repository.removeActiveRun('first-profit', { expectedRunId: null });
			expect(outcome).toEqual({ status: 'removed' });
		});

		it('removeActiveRun with expectedRevision: 0 on an empty slot proceeds', async () => {
			const driver = new CountingDriver();
			const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);

			const outcome = await repository.removeActiveRun('first-profit', { expectedRevision: 0 });
			expect(outcome).toEqual({ status: 'removed' });
		});
	});
});
