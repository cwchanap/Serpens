import { describe, expect, it } from 'vitest';
import { simulateDay } from '$lib/game/simulateDay';
import { createNewGame } from '$lib/game/state';
import type { GameState } from '$lib/game/types';
import { abandonScenario, evaluateScenario, startScenario } from '$lib/scenarios/runtime';
import type {
	ScenarioDefinition,
	ScenarioDefinitionRef,
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
	encodeScenarioRunRecord,
	parseScenarioStoreSnapshot,
	scenarioDefinitionKey,
	validateScenarioRun
} from './scenarioCodec';
import { ScenarioMemoryRepository } from './scenarioMemoryRepository';

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

type TerminalLookingStartCase = 'required-satisfied' | 'failure-triggered' | 'day-limit';

function terminalLookingStartDefinition(startCase: TerminalLookingStartCase): ScenarioDefinition {
	const base = fixtureDefinition({ scenarioId: 'first-profit', version: 1 });
	return {
		...base,
		start: {
			...base.start,
			overrides: { ...base.start.overrides, storeCap: 1 }
		},
		content: {
			...base.content,
			retailPlacements: [
				{
					cityId: 'harbor-city',
					tileId: 'harbor-city-1-1',
					archetypeId: 'convenience'
				}
			]
		},
		dayLimit: startCase === 'day-limit' ? 1 : base.dayLimit,
		requiredObjectives:
			startCase === 'day-limit'
				? [{ ...base.requiredObjectives[0]!, target: 1_000_000_000 }]
				: base.requiredObjectives,
		failures:
			startCase === 'failure-triggered'
				? [{ ...base.failures[0]!, comparator: 'gte', target: 0 }]
				: base.failures
	};
}

function fixtureRun(
	ref: ScenarioDefinitionRef = { scenarioId: 'first-profit', version: 1 },
	options: {
		status?: ScenarioRun['status'];
		seed?: number;
		score?: number;
		game?: GameState;
		advanceDays?: number;
	} = {}
): ScenarioRun {
	const definition = fixtureDefinition(ref);
	const seed = options.seed ?? definition.officialSeed;
	const status = options.status ?? 'active';
	let game = options.game ?? createNewGame('convenience', seed);
	if (!options.game) {
		for (let day = 0; day < (options.advanceDays ?? 0); day += 1) game = simulateDay(game);
		game = {
			...game,
			cash: Math.max(0, Math.min(1000, (options.score ?? 500) - 500) * 2),
			scorecard: status === 'failed' ? { ...game.scorecard, profit: -1 } : game.scorecard
		};
	}
	const eligibility =
		seed === definition.officialSeed ? ('ranked' as const) : ('unranked' as const);
	const active: ScenarioRun = {
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
				snapshot({
					'first-profit': runRecord(
						fixtureRun(undefined, { status, score: status === 'completed' ? 700 : undefined })
					)
				}),
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

	it.each(['prototype', 'non-enumerable', 'symbol', 'accessor', 'cycle', 'deep'] as const)(
		'isolates a game with a %s extra without laundering or executing it',
		(propertyCase) => {
			const corrupt = runRecord(fixtureRun());
			const game = corrupt.game as GameState & Record<PropertyKey, unknown>;
			let invoked = false;
			if (propertyCase === 'prototype') {
				Object.setPrototypeOf(game, { inherited: true });
			} else if (propertyCase === 'non-enumerable') {
				Object.defineProperty(game, 'hidden', { value: true, enumerable: false });
			} else if (propertyCase === 'symbol') {
				game[Symbol('hidden')] = true;
			} else if (propertyCase === 'accessor') {
				Object.defineProperty(game, 'trap', {
					enumerable: true,
					get() {
						invoked = true;
						throw new Error('scenario getter must not run');
					}
				});
			} else if (propertyCase === 'cycle') {
				const cyclic: Record<string, unknown> = {};
				cyclic.self = cyclic;
				game.cyclic = cyclic;
			} else {
				let deep: Record<string, unknown> = {};
				for (let depth = 0; depth < 520; depth += 1) deep = { next: deep };
				game.deep = deep;
			}
			const valid = fixtureRun({ scenarioId: 'import-squeeze', version: 1 });
			let decoded!: ReturnType<typeof decodeScenarioStoreSnapshot>;

			expect(() => {
				decoded = decodeScenarioStoreSnapshot(
					snapshot({ 'first-profit': corrupt, 'import-squeeze': runRecord(valid) }),
					resolveFixtureDefinition
				);
			}).not.toThrow();
			expect(invoked).toBe(false);
			expect(decoded.snapshot.activeRunsByScenarioId['first-profit']).toBeUndefined();
			expect(decoded.snapshot.activeRunsByScenarioId['import-squeeze']).toEqual(runRecord(valid));
			expect(decoded.diagnostics.length).toBeGreaterThan(0);
		}
	);

	it.each(['accessor', 'non-enumerable', 'symbol'] as const)(
		'isolates an invalid %s entry descriptor while preserving valid siblings',
		(propertyCase) => {
			const valid = fixtureRun({ scenarioId: 'import-squeeze', version: 1 });
			const activeRuns: Record<PropertyKey, unknown> = {
				'import-squeeze': runRecord(valid)
			};
			let invoked = false;
			if (propertyCase === 'accessor') {
				Object.defineProperty(activeRuns, 'first-profit', {
					enumerable: true,
					get() {
						invoked = true;
						throw new Error('entry getter must not run');
					}
				});
			} else if (propertyCase === 'non-enumerable') {
				Object.defineProperty(activeRuns, 'first-profit', {
					value: runRecord(fixtureRun()),
					enumerable: false
				});
			} else {
				activeRuns[Symbol('first-profit')] = runRecord(fixtureRun());
			}
			const raw = snapshot();
			raw.activeRunsByScenarioId = activeRuns as ScenarioStoreSnapshot['activeRunsByScenarioId'];
			const decoded = decodeScenarioStoreSnapshot(raw, resolveFixtureDefinition);

			expect(invoked).toBe(false);
			expect(decoded.snapshot.activeRunsByScenarioId['import-squeeze']).toEqual(runRecord(valid));
			expect(decoded.diagnostics.length).toBeGreaterThan(0);
		}
	);

	it('rejects a prototype-bearing store envelope before cloning it', () => {
		const raw = snapshot({ 'first-profit': runRecord(fixtureRun()) });
		Object.setPrototypeOf(raw, { inherited: true });

		const decoded = decodeScenarioStoreSnapshot(raw, resolveFixtureDefinition);

		expect(decoded.snapshot).toEqual(createEmptyScenarioStore());
		expect(decoded.diagnostics.map((entry) => entry.code)).toContain('invalid-store');
	});

	it('keeps memory decoding descriptor-safe and reports corrupt entries without invoking accessors', async () => {
		const valid = fixtureRun({ scenarioId: 'import-squeeze', version: 1 });
		const activeRuns: Record<string, unknown> = { 'import-squeeze': runRecord(valid) };
		let invoked = false;
		Object.defineProperty(activeRuns, 'first-profit', {
			enumerable: true,
			get() {
				invoked = true;
				throw new Error('memory entry getter must not run');
			}
		});
		const raw = snapshot();
		raw.activeRunsByScenarioId = activeRuns as ScenarioStoreSnapshot['activeRunsByScenarioId'];
		let repository!: ScenarioMemoryRepository;

		expect(() => {
			repository = new ScenarioMemoryRepository(raw, resolveFixtureDefinition);
		}).not.toThrow();
		const summary = await repository.getSummary();
		expect(invoked).toBe(false);
		expect(summary.activeRunsByScenarioId['import-squeeze']).toEqual(valid);
		expect(summary.diagnostics.length).toBeGreaterThan(0);
	});

	it('rejects an active evaluation whose objective identities do not match the definition', () => {
		const active = fixtureRun();
		const record = runRecord(active);
		record.run = {
			...record.run,
			evaluation: {
				...record.run.evaluation,
				required: [...record.run.evaluation.required].reverse()
			}
		};

		const decoded = decodeScenarioStoreSnapshot(
			snapshot({ 'first-profit': record }),
			resolveFixtureDefinition
		);

		expect(decoded.snapshot.activeRunsByScenarioId).toEqual({});
		expect(decoded.diagnostics.map((entry) => entry.code)).toContain('evaluation-mismatch');
	});

	it.each(['objective-order', 'component-shape', 'score-formula', 'completed-failure'] as const)(
		'rejects a best result with a fabricated %s',
		(fabrication) => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			if (fabrication === 'objective-order') {
				result.evaluation.required.reverse();
			} else if (fabrication === 'component-shape') {
				result.evaluation.projection.componentPoints = [];
			} else if (fabrication === 'score-formula') {
				result.score = 900;
				result.medal = 'gold';
				result.evaluation.projection = {
					...result.evaluation.projection,
					score: 900,
					medal: 'gold',
					componentPoints: [100]
				};
			} else {
				result.evaluation.failures[0] = {
					...result.evaluation.failures[0]!,
					status: 'triggered'
				};
			}
			const decoded = decodeScenarioStoreSnapshot(
				snapshot(
					{},
					{
						'first-profit@1': {
							scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
							result
						}
					}
				),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.length).toBeGreaterThan(0);
		}
	);

	it.each(['required-status', 'optional-status', 'failure-status', 'future-evidence'] as const)(
		'rejects a best result with semantically fabricated %s evidence',
		(fabrication) => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			if (fabrication === 'required-status') {
				result.evaluation.required[0] = {
					...result.evaluation.required[0]!,
					status: 'satisfied',
					evidence: { ...result.evaluation.required[0]!.evidence, actual: 0 }
				};
			} else if (fabrication === 'optional-status') {
				result.evaluation.optional[0] = {
					...result.evaluation.optional[0]!,
					status: 'satisfied',
					evidence: { ...result.evaluation.optional[0]!.evidence, actual: 0 }
				};
			} else if (fabrication === 'failure-status') {
				result.evaluation.failures[0] = {
					...result.evaluation.failures[0]!,
					status: 'inactive',
					evidence: { ...result.evaluation.failures[0]!.evidence, actual: -1 }
				};
			} else {
				result.evaluation.required[0] = {
					...result.evaluation.required[0]!,
					evidence: {
						...result.evaluation.required[0]!.evidence,
						day: result.evaluation.day + 1
					}
				};
			}

			const decoded = decodeScenarioStoreSnapshot(
				snapshot(
					{},
					{
						'first-profit@1': {
							scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
							result
						}
					}
				),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((entry) => entry.code)).toContain('evaluation-mismatch');
		}
	);

	it('requires contributing evidence ids to be unique and code-unit sorted', () => {
		const canonical = fixtureRun(undefined, { status: 'completed', score: 750 });
		const canonicalResult = structuredClone(canonical.result!);
		canonicalResult.evaluation.required[0]!.evidence.contributingIds = ['a', 'z'];
		const canonicalDecoded = decodeScenarioStoreSnapshot(
			snapshot(
				{},
				{
					'first-profit@1': {
						scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
						result: canonicalResult
					}
				}
			),
			resolveFixtureDefinition
		);

		const nonCanonicalResult = structuredClone(canonical.result!);
		nonCanonicalResult.evaluation.required[0]!.evidence.contributingIds = ['z', 'a', 'a'];
		const nonCanonicalDecoded = decodeScenarioStoreSnapshot(
			snapshot(
				{},
				{
					'first-profit@1': {
						scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
						result: nonCanonicalResult
					}
				}
			),
			resolveFixtureDefinition
		);

		expect(canonicalDecoded.diagnostics).toEqual([]);
		expect(nonCanonicalDecoded.snapshot.bestResultsByDefinitionKey).toEqual({});
		expect(nonCanonicalDecoded.diagnostics.map((entry) => entry.code)).toContain(
			'evaluation-mismatch'
		);
	});

	it('requires condition window completeness evidence to be boolean', () => {
		const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
		const result = structuredClone(completed.result!);
		(result.evaluation.required[0]!.evidence as unknown as Record<string, unknown>).windowComplete =
			'yes';
		const decoded = decodeScenarioStoreSnapshot(
			snapshot(
				{},
				{
					'first-profit@1': {
						scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
						result
					}
				}
			),
			resolveFixtureDefinition
		);

		expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
		expect(decoded.diagnostics.length).toBeGreaterThan(0);
	});

	it('recomputes game-less metric score components from canonical component evidence', () => {
		const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
		const result = structuredClone(completed.result!);
		result.score = 1000;
		result.medal = 'gold';
		result.evaluation.projection = {
			...result.evaluation.projection,
			score: 1000,
			medal: 'gold',
			componentPoints: [500]
		};

		const decoded = decodeScenarioStoreSnapshot(
			snapshot(
				{},
				{
					'first-profit@1': {
						scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
						result
					}
				}
			),
			resolveFixtureDefinition
		);

		expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
		expect(decoded.diagnostics.map((entry) => entry.code)).toContain('evaluation-mismatch');
	});

	it('rejects forged canonical metric component evidence even when legacy objective evidence matches', () => {
		const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
		const result = structuredClone(completed.result!);
		(result.evaluation.projection as unknown as Record<string, unknown>).componentEvidence = [
			{
				kind: 'metric',
				query: { metric: 'warehouse-quantity', materialId: 'water' },
				window: { kind: 'current' },
				actual: 500,
				day: result.evaluation.day,
				windowComplete: true
			}
		];
		const decoded = decodeScenarioStoreSnapshot(
			snapshot(
				{},
				{
					'first-profit@1': {
						scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
						result
					}
				}
			),
			resolveFixtureDefinition
		);

		expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
		expect(decoded.diagnostics.map((entry) => entry.code)).toContain('evaluation-mismatch');
	});

	it.each(['actual', 'day', 'window-completeness'] as const)(
		'rejects fabricated metric component %s evidence',
		(fabrication) => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			const evidence = result.evaluation.projection.componentEvidence[0]!;
			if (fabrication === 'actual') evidence.actual = 1000;
			if (fabrication === 'day') evidence.day += 1;
			if (fabrication === 'window-completeness') evidence.windowComplete = false;
			const decoded = decodeScenarioStoreSnapshot(
				snapshot(
					{},
					{
						'first-profit@1': {
							scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
							result
						}
					}
				),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((entry) => entry.code)).toContain('evaluation-mismatch');
		}
	);

	it('rejects component evidence whose identity does not match a standalone metric definition', () => {
		const definition: ScenarioDefinition = {
			...fixtureDefinition({ scenarioId: 'first-profit', version: 1 }),
			scoreComponents: [
				{
					kind: 'metric',
					query: { metric: 'warehouse-quantity', materialId: 'water' },
					window: { kind: 'current' },
					zeroBonusAt: 0,
					fullBonusAt: 1,
					points: 500
				}
			]
		};
		const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
		const result = structuredClone(completed.result!);
		result.score = 1000;
		result.medal = 'gold';
		result.evaluation.projection = {
			...result.evaluation.projection,
			score: 1000,
			medal: 'gold',
			componentPoints: [500]
		};
		const decoded = decodeScenarioStoreSnapshot(
			snapshot(
				{},
				{
					'first-profit@1': {
						scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
						result
					}
				}
			),
			() => definition
		);

		expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
		expect(decoded.diagnostics.map((entry) => entry.code)).toContain('evaluation-mismatch');
	});

	it('uses canonical component evidence instead of ambiguous objective evidence', () => {
		const definition: ScenarioDefinition = {
			...fixtureDefinition({ scenarioId: 'first-profit', version: 1 }),
			scoreComponents: [
				{
					kind: 'metric',
					query: { metric: 'scorecard', score: 'profit' },
					window: { kind: 'current' },
					zeroBonusAt: 0,
					fullBonusAt: 124,
					points: 500
				}
			]
		};
		const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
		const result = structuredClone(completed.result!);
		const decoded = decodeScenarioStoreSnapshot(
			snapshot(
				{},
				{
					'first-profit@1': {
						scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
						result
					}
				}
			),
			() => definition
		);

		expect(result.evaluation.projection.componentPoints).toEqual([250]);
		expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
		expect(decoded.diagnostics.map((entry) => entry.code)).toContain('evaluation-mismatch');
	});

	it('persists report-gap window completeness for active and terminal evaluations', () => {
		const base = fixtureDefinition({ scenarioId: 'first-profit', version: 1 });
		const incompleteCondition = {
			id: 'three-day-income',
			labelKey: 'store.defaultName' as const,
			query: { metric: 'daily-net-income' as const },
			comparator: 'gte' as const,
			target: -1_000_000_000,
			window: { kind: 'trailing-reports' as const, count: 3 },
			requiresCompleteWindow: true
		};
		const activeDefinition: ScenarioDefinition = {
			...base,
			requiredObjectives: [incompleteCondition],
			optionalObjectives: [],
			failures: [],
			scoreComponents: []
		};
		let activeGame = createNewGame('convenience', activeDefinition.officialSeed);
		for (let day = 0; day < 3; day += 1) activeGame = simulateDay(activeGame);
		activeGame = {
			...activeGame,
			cash: 500,
			reports: activeGame.reports.filter((report) => report.day !== 1)
		};
		const active: ScenarioRun = {
			definition: { scenarioId: 'first-profit', version: 1 },
			seed: activeDefinition.officialSeed,
			eligibility: 'ranked',
			status: 'active',
			game: activeGame,
			evaluation: evaluateScenario(activeDefinition, activeGame, false),
			result: null
		};
		const activeDecoded = decodeScenarioStoreSnapshot(
			snapshot({ 'first-profit': runRecord(active) }),
			() => activeDefinition
		);

		const terminalDefinition: ScenarioDefinition = {
			...base,
			optionalObjectives: [incompleteCondition],
			scoreComponents: []
		};
		const terminalEvaluation = evaluateScenario(terminalDefinition, activeGame, true);
		const terminalResult = {
			definition: { scenarioId: 'first-profit' as const, version: 1 },
			seed: terminalDefinition.officialSeed,
			eligibility: 'ranked' as const,
			outcome: 'completed' as const,
			completionDay: activeGame.day,
			score: terminalEvaluation.projection.score,
			medal: terminalEvaluation.projection.medal,
			evaluation: terminalEvaluation
		};
		const terminalDecoded = decodeScenarioStoreSnapshot(
			snapshot(
				{},
				{
					'first-profit@1': {
						scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
						result: terminalResult
					}
				}
			),
			() => terminalDefinition
		);

		expect(active.evaluation.required[0]?.status).toBe('pending');
		expect(active.evaluation.required[0]?.evidence.windowComplete).toBe(false);
		expect(activeDecoded.diagnostics).toEqual([]);
		expect(terminalEvaluation.optional[0]?.status).toBe('missed');
		expect(terminalEvaluation.optional[0]?.evidence.windowComplete).toBe(false);
		expect(terminalDecoded.diagnostics).toEqual([]);
	});

	it('requires every evidence day to equal its containing evaluation day', () => {
		const completed = fixtureRun(undefined, {
			status: 'completed',
			score: 750,
			advanceDays: 1
		});
		const result = structuredClone(completed.result!);
		result.evaluation.required[0] = {
			...result.evaluation.required[0]!,
			evidence: { ...result.evaluation.required[0]!.evidence, day: 1 }
		};
		const decoded = decodeScenarioStoreSnapshot(
			snapshot(
				{},
				{
					'first-profit@1': {
						scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
						result
					}
				}
			),
			resolveFixtureDefinition
		);

		expect(result.evaluation.day).toBe(2);
		expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
		expect(decoded.diagnostics.map((entry) => entry.code)).toContain('evaluation-mismatch');
	});

	it.each(['activeRunsByScenarioId', 'bestResultsByDefinitionKey'] as const)(
		'diagnoses an explicitly undefined %s envelope field',
		(field) => {
			const raw = snapshot() as unknown as Record<string, unknown>;
			raw[field] = undefined;
			const decoded = decodeScenarioStoreSnapshot(raw, resolveFixtureDefinition);

			expect(decoded.diagnostics.map((entry) => entry.path)).toContain(`scenarioStore.${field}`);
		}
	);

	it('accepts the runtime finite fallback for an overflowing failure-risk distance', () => {
		const definition: ScenarioDefinition = {
			...fixtureDefinition({ scenarioId: 'first-profit', version: 1 }),
			failures: [
				{
					id: 'cash-impossibly-low',
					labelKey: 'store.defaultName',
					query: { metric: 'cash' },
					comparator: 'lt',
					target: -Number.MAX_VALUE,
					window: { kind: 'current' }
				}
			],
			scoreComponents: []
		};
		const game = {
			...createNewGame('convenience', definition.officialSeed),
			cash: Number.MAX_VALUE
		};
		const evaluation = evaluateScenario(definition, game, true);
		const result = {
			definition: { scenarioId: 'first-profit' as const, version: 1 },
			seed: definition.officialSeed,
			eligibility: 'ranked' as const,
			outcome: 'completed' as const,
			completionDay: game.day,
			score: evaluation.projection.score,
			medal: evaluation.projection.medal,
			evaluation
		};
		const decoded = decodeScenarioStoreSnapshot(
			snapshot(
				{},
				{
					'first-profit@1': {
						scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
						result
					}
				}
			),
			() => definition
		);

		expect(evaluation.risks[0]).toMatchObject({ distance: 0 });
		expect(decoded.diagnostics).toEqual([]);
	});

	it('recomputes remaining-day points from the definition day limit', () => {
		const definition: ScenarioDefinition = {
			...fixtureDefinition({ scenarioId: 'first-profit', version: 1 }),
			scoreComponents: [
				{
					kind: 'remaining-days',
					zeroBonusAt: 0,
					fullBonusAt: 14,
					points: 500
				}
			]
		};
		const completed = fixtureRun(undefined, {
			status: 'completed',
			score: 750,
			advanceDays: 13
		});
		const evaluation = evaluateScenario(definition, completed.game, true);
		const result = {
			...completed.result!,
			completionDay: completed.game.day,
			score: 1000,
			medal: 'gold' as const,
			evaluation: {
				...evaluation,
				projection: {
					...evaluation.projection,
					score: 1000,
					medal: 'gold' as const,
					componentPoints: [500]
				}
			}
		};

		const decoded = decodeScenarioStoreSnapshot(
			snapshot(
				{},
				{
					'first-profit@1': {
						scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
						result
					}
				}
			),
			() => definition
		);

		expect(completed.game.day).toBe(14);
		expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
		expect(decoded.diagnostics.map((entry) => entry.code)).toContain('evaluation-mismatch');
	});

	it('rejects terminal pending objectives at and beyond the deadline', () => {
		const completed = fixtureRun(undefined, {
			status: 'completed',
			score: 700,
			advanceDays: 14
		});
		const result = structuredClone(completed.result!);
		result.evaluation.optional[0] = {
			...result.evaluation.optional[0]!,
			status: 'pending'
		};
		const decoded = decodeScenarioStoreSnapshot(
			snapshot(
				{},
				{
					'first-profit@1': {
						scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION,
						result
					}
				}
			),
			resolveFixtureDefinition
		);

		expect(completed.game.day).toBe(15);
		expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
		expect(decoded.diagnostics.map((entry) => entry.code)).toContain('evaluation-mismatch');
	});

	it.each(['required-satisfied', 'failure-triggered', 'day-limit'] as const)(
		'round-trips the runtime-produced active start when %s initially',
		(startCase) => {
			const definition = terminalLookingStartDefinition(startCase);
			const started = startScenario(definition, definition.officialSeed);
			if (!started.ok) {
				throw new Error(
					`Scenario start failed: ${started.error.code} ${JSON.stringify(started.error.diagnostics)}`
				);
			}

			const record = encodeScenarioRunRecord(started.value, () => definition);
			const decoded = decodeScenarioStoreSnapshot(
				snapshot({ 'first-profit': record }),
				() => definition
			);

			expect(started.value.status).toBe('active');
			if (startCase === 'required-satisfied') {
				expect(
					started.value.evaluation.required.every((objective) => objective.status === 'satisfied')
				).toBe(true);
			} else if (startCase === 'failure-triggered') {
				expect(
					started.value.evaluation.failures.some((failure) => failure.status === 'triggered')
				).toBe(true);
			} else {
				expect(started.value.evaluation.deadline?.triggered).toBe(true);
			}
			expect(decoded.diagnostics).toEqual([]);
			expect(decoded.snapshot.activeRunsByScenarioId['first-profit']).toEqual(record);
		}
	);

	it('rejects a later terminal-looking active state that is not the canonical start', () => {
		const definition = terminalLookingStartDefinition('failure-triggered');
		const started = startScenario(definition, definition.officialSeed);
		if (!started.ok) throw new Error(`Scenario start failed: ${started.error.code}`);
		const laterGame = simulateDay(started.value.game);
		const laterActive: ScenarioRun = {
			...started.value,
			game: laterGame,
			evaluation: evaluateScenario(definition, laterGame, false)
		};

		expect(laterActive.evaluation.failures.some((failure) => failure.status === 'triggered')).toBe(
			true
		);
		expect(() => validateScenarioRun(laterActive, () => definition)).toThrow(
			/Run status must match runtime failure, completion, then deadline selection/
		);
	});

	it('round-trips an immediate abandoned canonical terminal-looking start', () => {
		const definition = terminalLookingStartDefinition('required-satisfied');
		const started = startScenario(definition, definition.officialSeed);
		if (!started.ok) throw new Error(`Scenario start failed: ${started.error.code}`);
		const abandoned = abandonScenario(started.value);

		const encoded = encodeScenarioRunRecord(abandoned, () => definition);
		const decoded = validateScenarioRun({ ...encoded.run, game: encoded.game }, () => definition);

		expect(decoded).toEqual(abandoned);
	});

	it('rejects both active and abandoned forms of a later terminal-looking state', () => {
		const definition = terminalLookingStartDefinition('failure-triggered');
		const started = startScenario(definition, definition.officialSeed);
		if (!started.ok) throw new Error(`Scenario start failed: ${started.error.code}`);
		const laterGame = simulateDay(started.value.game);
		const laterActive: ScenarioRun = {
			...started.value,
			game: laterGame,
			evaluation: evaluateScenario(definition, laterGame, false)
		};
		const laterAbandoned = abandonScenario(laterActive);

		const lifecycleMismatch =
			/Run status must match runtime failure, completion, then deadline selection/;
		expect(() => validateScenarioRun(laterActive, () => definition)).toThrow(lifecycleMismatch);
		expect(() => validateScenarioRun(laterAbandoned, () => definition)).toThrow(lifecycleMismatch);
	});

	it('accepts abandonment from a later nonterminal active predecessor', () => {
		const definition = {
			...terminalLookingStartDefinition('day-limit'),
			dayLimit: 14
		};
		const started = startScenario(definition, definition.officialSeed);
		if (!started.ok) throw new Error(`Scenario start failed: ${started.error.code}`);
		const laterGame = simulateDay(started.value.game);
		const laterActive: ScenarioRun = {
			...started.value,
			game: laterGame,
			evaluation: evaluateScenario(definition, laterGame, false)
		};
		const laterAbandoned = abandonScenario(laterActive);

		expect(laterActive.evaluation.required[0]?.status).toBe('pending');
		expect(laterActive.evaluation.failures.some((failure) => failure.status === 'triggered')).toBe(
			false
		);
		expect(validateScenarioRun(laterAbandoned, () => definition)).toEqual(laterAbandoned);
	});

	it('retains terminal outcome precedence validation', () => {
		const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
		const wrongOutcome = structuredClone(completed);
		wrongOutcome.result = {
			...wrongOutcome.result!,
			outcome: 'failed',
			medal: null
		};

		expect(() => validateScenarioRun(wrongOutcome, resolveFixtureDefinition)).toThrow(
			/Terminal outcome must follow failure, completion, then deadline precedence/
		);
	});

	it('accepts the maximum canonical run and result seed', () => {
		const maximumSeed = 2_147_483_646;
		const completed = fixtureRun(undefined, {
			status: 'completed',
			score: 750,
			seed: maximumSeed
		});

		expect(validateScenarioRun(completed, resolveFixtureDefinition)).toEqual(completed);
	});

	it.each(['run', 'result'] as const)(
		'rejects a seed above the canonical maximum in a %s',
		(kind) => {
			const maximumSeed = 2_147_483_646;
			const completed = fixtureRun(undefined, {
				status: 'completed',
				score: 750,
				seed: maximumSeed
			});
			const oversized = structuredClone(completed);
			if (kind === 'run') {
				oversized.seed = maximumSeed + 1;
				oversized.game.seed = maximumSeed + 1;
			} else {
				oversized.result = { ...oversized.result!, seed: maximumSeed + 1 };
			}

			expect(() => validateScenarioRun(oversized, resolveFixtureDefinition)).toThrow(
				/must be an integer from 1 through 2147483646/
			);
		}
	);

	it.each([
		['null-prototype', () => Object.create(null)],
		[
			'throwing proxy',
			() =>
				new Proxy(Object.create(null), {
					getPrototypeOf: () => {
						throw new Error('trap');
					}
				})
		],
		['function', () => function invalidSchemaVersion() {}]
	] as const)(
		'returns clone-safe diagnostics for a %s schema version',
		async (_name, createSchemaVersion) => {
			const raw = snapshot() as ScenarioStoreSnapshot & { schemaVersion: unknown };
			raw.schemaVersion = createSchemaVersion();
			let decoded!: ReturnType<typeof decodeScenarioStoreSnapshot>;
			let repository!: ScenarioMemoryRepository;

			expect(() => {
				decoded = decodeScenarioStoreSnapshot(raw, resolveFixtureDefinition);
				repository = new ScenarioMemoryRepository(raw, resolveFixtureDefinition);
			}).not.toThrow();
			expect(() => structuredClone(decoded.diagnostics)).not.toThrow();
			await expect(repository.getSummary()).resolves.toMatchObject({
				activeRunsByScenarioId: {},
				bestResultsByDefinitionKey: {}
			});
		}
	);

	it('contains a hostile object thrown while inspecting the store envelope', () => {
		const thrown = new Proxy(Object.create(null), {
			getPrototypeOf() {
				throw new Error('thrown-value prototype must not be inspected');
			}
		});
		const raw = new Proxy(Object.create(null), {
			getPrototypeOf() {
				throw thrown;
			}
		});
		let decoded!: ReturnType<typeof decodeScenarioStoreSnapshot>;

		expect(() => {
			decoded = decodeScenarioStoreSnapshot(raw, resolveFixtureDefinition);
		}).not.toThrow();
		expect(decoded.snapshot).toEqual(createEmptyScenarioStore());
		expect(() => structuredClone(decoded.diagnostics)).not.toThrow();
	});

	it('keeps current-schema games exactly equal and rejects states sandbox normalization would repair', () => {
		const exactGame = Object.assign(createNewGame('convenience', OFFICIAL_SEEDS['first-profit']), {
			cash: 0,
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
		const staleLegacyGame = { ...(staleLegacyRecord.game as GameState), day: 7 };
		staleLegacyRecord.game = staleLegacyGame;
		staleLegacyRecord.run = {
			...staleLegacyRecord.run,
			evaluation: evaluateScenario(
				fixtureDefinition(staleLegacyRecord.run.definition),
				staleLegacyGame,
				false
			)
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
