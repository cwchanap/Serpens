import { describe, expect, it } from 'vitest';
import { createNewGame } from '$lib/game/state';
import type { GameState } from '$lib/game/types';
import type {
	ScenarioDefinition,
	ScenarioDefinitionRef,
	ScenarioEvaluation,
	ScenarioId,
	ScenarioRun,
	ScenarioRunRecord,
	ScenarioStoreSnapshot
} from '$lib/scenarios/types';
import { SAVE_SCHEMA_VERSION } from './saveTypes';
import {
	SCENARIO_RUN_SCHEMA_VERSION,
	SCENARIO_STORE_SCHEMA_VERSION,
	createEmptyScenarioStore,
	decodeScenarioStoreSnapshot,
	parseScenarioStoreSnapshot,
	scenarioDefinitionKey
} from './scenarioCodec';

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
		game?: GameState;
	} = {}
): ScenarioRun {
	const definition = fixtureDefinition(ref);
	const seed = options.seed ?? definition.officialSeed;
	const game = options.game ?? createNewGame('convenience', seed);
	const status = options.status ?? 'active';
	const score = options.score ?? 500;
	const evaluation = fixtureEvaluation(game.day, score);
	const result =
		status === 'active'
			? null
			: {
					definition: ref,
					seed,
					eligibility:
						seed === definition.officialSeed ? ('ranked' as const) : ('unranked' as const),
					outcome: status,
					completionDay: game.day,
					score,
					medal: status === 'completed' ? evaluation.projection.medal : null,
					evaluation
				};

	return {
		definition: ref,
		seed,
		eligibility: seed === definition.officialSeed ? 'ranked' : 'unranked',
		status,
		game,
		evaluation,
		result
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

describe('scenario codec', () => {
	it('creates and decodes the empty current snapshot', () => {
		const empty = createEmptyScenarioStore();

		expect(SCENARIO_STORE_SCHEMA_VERSION).toBe(1);
		expect(SCENARIO_RUN_SCHEMA_VERSION).toBe(1);
		expect(decodeScenarioStoreSnapshot(empty, resolveFixtureDefinition)).toEqual({
			snapshot: empty,
			diagnostics: []
		});
		expect(parseScenarioStoreSnapshot(JSON.stringify(empty), resolveFixtureDefinition)).toEqual({
			snapshot: empty,
			diagnostics: []
		});
	});

	it('decodes active runs and ranked completed best results', () => {
		const active = fixtureRun();
		const completed = fixtureRun(
			{ scenarioId: 'import-squeeze', version: 1 },
			{
				status: 'completed',
				score: 725
			}
		);
		const decoded = decodeScenarioStoreSnapshot(
			snapshot(
				{ 'first-profit': runRecord(active) },
				{
					'import-squeeze@1': {
						scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
						result: completed.result!
					}
				}
			),
			resolveFixtureDefinition
		);

		expect(decoded.diagnostics).toEqual([]);
		expect(decoded.snapshot.activeRunsByScenarioId['first-profit']).toEqual(runRecord(active));
		expect(decoded.snapshot.bestResultsByDefinitionKey['import-squeeze@1']?.result).toEqual(
			completed.result
		);
	});

	it.each(['completed', 'failed', 'abandoned'] as const)(
		'isolates a %s run incorrectly stored as active',
		(status) => {
			const decoded = decodeScenarioStoreSnapshot(
				snapshot({ 'first-profit': runRecord(fixtureRun(undefined, { status })) }),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.activeRunsByScenarioId).toEqual({});
			expect(decoded.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
				'invalid-active-run'
			);
		}
	);

	it('isolates scenario-store and record envelope version mismatches', () => {
		const active = fixtureRun();
		const wrongStore = decodeScenarioStoreSnapshot(
			{ ...snapshot({ 'first-profit': runRecord(active) }), schemaVersion: 2 },
			resolveFixtureDefinition
		);
		const wrongRecord = decodeScenarioStoreSnapshot(
			snapshot({
				'first-profit': { ...runRecord(active), scenarioSchemaVersion: 2 }
			}),
			resolveFixtureDefinition
		);

		expect(wrongStore.snapshot).toEqual(createEmptyScenarioStore());
		expect(wrongStore.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			'unsupported-store-schema'
		]);
		expect(wrongRecord.snapshot.activeRunsByScenarioId).toEqual({});
		expect(wrongRecord.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
			'unsupported-scenario-schema'
		);
	});

	it('isolates unsupported embedded-game schema versions', () => {
		const active = fixtureRun();
		const decoded = decodeScenarioStoreSnapshot(
			snapshot({
				'first-profit': { ...runRecord(active), gameSchemaVersion: SAVE_SCHEMA_VERSION + 1 }
			}),
			resolveFixtureDefinition
		);

		expect(decoded.snapshot.activeRunsByScenarioId).toEqual({});
		expect(decoded.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
			'unsupported-game-schema'
		);
	});

	it('rejects best-result keys that do not match their embedded definition', () => {
		const completed = fixtureRun(undefined, { status: 'completed', score: 800 });
		const decoded = decodeScenarioStoreSnapshot(
			snapshot(
				{},
				{
					'first-profit@2': {
						scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
						result: completed.result!
					}
				}
			),
			resolveFixtureDefinition
		);

		expect(scenarioDefinitionKey(completed.definition)).toBe('first-profit@1');
		expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
		expect(decoded.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
			'definition-key-mismatch'
		);
	});

	it('isolates records for unsupported definition versions', () => {
		const unsupported = fixtureRun({ scenarioId: 'first-profit', version: 3 });
		const decoded = decodeScenarioStoreSnapshot(
			snapshot({ 'first-profit': runRecord(unsupported) }),
			resolveFixtureDefinition
		);

		expect(decoded.snapshot.activeRunsByScenarioId).toEqual({});
		expect(decoded.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
			'unsupported-definition'
		);
	});

	it('preserves valid scenarios when another entry is corrupt', () => {
		const valid = fixtureRun({ scenarioId: 'import-squeeze', version: 1 });
		const corrupt = runRecord(fixtureRun());
		corrupt.run = { ...corrupt.run, seed: 'not-a-seed' } as never;
		const decoded = decodeScenarioStoreSnapshot(
			snapshot({ 'first-profit': corrupt, 'import-squeeze': runRecord(valid) }),
			resolveFixtureDefinition
		);

		expect(decoded.snapshot.activeRunsByScenarioId['first-profit']).toBeUndefined();
		expect(decoded.snapshot.activeRunsByScenarioId['import-squeeze']).toEqual(runRecord(valid));
		expect(decoded.diagnostics.length).toBeGreaterThan(0);
	});

	it('keeps current-schema games exactly equal and rejects states sandbox normalization would repair', () => {
		const exactGame = Object.assign(createNewGame('convenience', OFFICIAL_SEEDS['first-profit']), {
			scenarioMarker: { exact: true }
		});
		const exactRun = fixtureRun(undefined, { game: exactGame });
		const exact = decodeScenarioStoreSnapshot(
			snapshot({ 'first-profit': runRecord(exactRun) }),
			resolveFixtureDefinition
		);
		const staleGame = { ...exactGame, day: 7 };
		const staleRun = fixtureRun(undefined, { game: staleGame });
		const stale = decodeScenarioStoreSnapshot(
			snapshot({ 'first-profit': runRecord(staleRun) }),
			resolveFixtureDefinition
		);

		expect(exact.diagnostics).toEqual([]);
		expect(exact.snapshot.activeRunsByScenarioId['first-profit']?.game).toEqual(exactGame);
		expect(exact.snapshot.activeRunsByScenarioId['first-profit']?.game).not.toBe(exactGame);
		expect(stale.snapshot.activeRunsByScenarioId).toEqual({});
		expect(stale.diagnostics.map((diagnostic) => diagnostic.code)).toContain('invalid-game');
	});

	it('migrates an older embedded game but never applies sandbox normalization', () => {
		const active = fixtureRun();
		const legacyRecord = runRecord(active);
		const legacyGame = structuredClone(active.game) as GameState;
		for (const city of legacyGame.industryCities) {
			delete (city as unknown as Record<string, unknown>).rails;
		}
		legacyRecord.gameSchemaVersion = 9;
		legacyRecord.game = legacyGame;
		const migrated = decodeScenarioStoreSnapshot(
			snapshot({ 'first-profit': legacyRecord }),
			resolveFixtureDefinition
		);

		const staleLegacyRecord = structuredClone(legacyRecord);
		staleLegacyRecord.game = { ...(staleLegacyRecord.game as GameState), day: 7 };
		staleLegacyRecord.run = {
			...staleLegacyRecord.run,
			evaluation: fixtureEvaluation(7)
		};
		const stale = decodeScenarioStoreSnapshot(
			snapshot({ 'first-profit': staleLegacyRecord }),
			resolveFixtureDefinition
		);

		expect(migrated.diagnostics).toEqual([]);
		expect(migrated.snapshot.activeRunsByScenarioId['first-profit']?.gameSchemaVersion).toBe(
			SAVE_SCHEMA_VERSION
		);
		expect(
			(
				migrated.snapshot.activeRunsByScenarioId['first-profit']?.game as GameState
			).industryCities.every((city) => Array.isArray(city.rails))
		).toBe(true);
		expect(stale.snapshot.activeRunsByScenarioId).toEqual({});
		expect(stale.diagnostics.map((diagnostic) => diagnostic.code)).toContain('invalid-game');
	});
});
