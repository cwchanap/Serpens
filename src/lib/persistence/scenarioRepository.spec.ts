import { describe, expect, it } from 'vitest';
import { createNewGame } from '$lib/game/state';
import type {
	ScenarioDefinition,
	ScenarioDefinitionRef,
	ScenarioEvaluation,
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
		requiredObjectives: [],
		optionalObjectives: [],
		failures: [],
		scoreComponents: [],
		medalThresholds: { silver: 700, gold: 850 }
	};
}

function resolveFixtureDefinition(ref: ScenarioDefinitionRef): ScenarioDefinition | undefined {
	if (ref.version !== 1 && !(ref.scenarioId === 'first-profit' && ref.version === 2)) {
		return undefined;
	}
	return fixtureDefinition(ref);
}

function fixtureEvaluation(day: number, score = 500): ScenarioEvaluation {
	return {
		day,
		required: [],
		optional: [],
		failures: [],
		deadline: null,
		risks: [],
		projection: {
			score,
			medal: score >= 850 ? 'gold' : score >= 700 ? 'silver' : 'bronze',
			componentPoints: []
		}
	};
}

function fixtureRun(
	ref: ScenarioDefinitionRef = { scenarioId: 'first-profit', version: 1 },
	options: {
		status?: ScenarioRun['status'];
		seed?: number;
		score?: number;
	} = {}
): ScenarioRun {
	const definition = fixtureDefinition(ref);
	const seed = options.seed ?? definition.officialSeed;
	const game = createNewGame('convenience', seed);
	const status = options.status ?? 'active';
	const score = options.score ?? 500;
	const evaluation = fixtureEvaluation(game.day, score);
	const eligibility =
		seed === definition.officialSeed ? ('ranked' as const) : ('unranked' as const);
	return {
		definition: ref,
		seed,
		eligibility,
		status,
		game,
		evaluation,
		result:
			status === 'active'
				? null
				: {
						definition: ref,
						seed,
						eligibility,
						outcome: status,
						completionDay: game.day,
						score,
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

describe('scenario repository', () => {
	it('keeps one active run per scenario while isolating other scenarios', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const first = fixtureRun();
		const other = fixtureRun({ scenarioId: 'import-squeeze', version: 1 });
		const replacement = fixtureRun(undefined, { seed: first.seed + 50 });

		await repository.saveActiveRun(first);
		await repository.saveActiveRun(other);
		await repository.saveActiveRun(replacement);
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
		await repository.saveActiveRun(fixtureRun());
		const failed = fixtureRun(undefined, { status: 'failed', score: 610 });

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
		await repository.saveActiveRun(fixtureRun(undefined, { seed: custom.seed }));

		const outcome = await repository.commitTerminalRun(custom);

		expect(outcome).toEqual({ activeRun: null, terminalResult: custom.result, bestUpdated: false });
		expect((await repository.getSummary()).bestResultsByDefinitionKey).toEqual({});
	});

	it('updates a ranked best only for a strictly greater score and retains equal scores', async () => {
		const driver = new CountingDriver();
		const repository = new ScenarioRepositoryFromDriver(driver, resolveFixtureDefinition);
		const existing = fixtureRun(undefined, { status: 'completed', score: 750 });
		await repository.saveActiveRun(fixtureRun());
		const firstOutcome = await repository.commitTerminalRun(existing);
		await repository.saveActiveRun(fixtureRun());
		const equal = fixtureRun(undefined, { status: 'completed', score: 750 });
		equal.evaluation = {
			...equal.evaluation,
			risks: [{ kind: 'deadline', daysRemaining: 3, triggered: false }]
		};
		equal.result = { ...equal.result!, evaluation: equal.evaluation };

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
		await repository.saveActiveRun(fixtureRun({ scenarioId: 'first-profit', version: 2 }));

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
		const secondSave = repository.saveActiveRun(second);
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
});
