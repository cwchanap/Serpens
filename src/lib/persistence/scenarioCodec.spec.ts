import { describe, expect, it } from 'vitest';
import { recalculateCityInventoryPressure } from '$lib/game/cityInventory';
import { simulateDay } from '$lib/game/simulateDay';
import { createNewGame } from '$lib/game/state';
import type { GameState } from '$lib/game/types';
import {
	abandonScenario,
	evaluateScenario,
	executeScenarioCommand,
	startScenario
} from '$lib/scenarios/runtime';
import type {
	ScenarioDefinition,
	ScenarioDefinitionRef,
	ScenarioId,
	ScenarioResult,
	ScenarioRiskProjection,
	ScenarioRun,
	ScenarioRunRecord,
	ScenarioStoreSnapshot
} from '$lib/scenarios/types';
import { SAVE_SCHEMA_VERSION } from './saveTypes';
import {
	type ScenarioDefinitionResolver,
	SCENARIO_RUN_SCHEMA_VERSION,
	SCENARIO_STORE_SCHEMA_VERSION,
	createEmptyScenarioStore,
	decodeScenarioStoreSnapshot,
	encodeScenarioBestResultRecord,
	encodeScenarioRunRecord,
	parseScenarioStoreSnapshot,
	scenarioDefinitionKey,
	validateScenarioRun
} from './scenarioCodec';
import { ScenarioMemoryRepository } from './scenarioMemoryRepository';
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

function v11RunRecord(run: ScenarioRun, revision = 0): ScenarioRunRecord {
	const record = runRecord(run, revision);
	const legacyGame = toLegacyV12WarehouseWireGame(run.game) as unknown as Record<string, unknown>;
	delete legacyGame.events;
	legacyGame.decisions = [
		{
			id: 'supplier-terms',
			title: 'Supplier terms',
			context: { code: 'supplierTerms' },
			expiresOnDay: run.game.day + 2,
			options: [
				{
					id: 'negotiate-credit',
					label: 'Negotiate credit',
					description: 'Ask for short-term supplier credit.',
					effects: {
						finance: {
							kind: 'borrow',
							purpose: 'supplierCredit',
							amount: 4_000,
							termDays: 28
						},
						profit: -2
					}
				},
				{
					id: 'bulk-discount',
					label: 'Bulk discount',
					description: 'Commit to a larger order.',
					effects: { cash: -2_500, profit: 3, stockHealth: 6 }
				}
			]
		}
	];
	legacyGame.reports = run.game.reports.map((report) => {
		const {
			modifierImpacts: _modifierImpacts,
			modifierLifecycle: _modifierLifecycle,
			...legacyReport
		} = structuredClone(report);
		void _modifierImpacts;
		void _modifierLifecycle;
		return legacyReport;
	});

	return {
		...record,
		gameSchemaVersion: 11,
		game: legacyGame as unknown as GameState
	};
}

function toLegacyV12WarehouseWireGame(game: GameState): GameState {
	const legacyGame = structuredClone(game) as unknown as Record<string, unknown>;
	const activeInventory =
		game.cityInventories.find((inventory) => inventory.cityId === game.activeIndustryCityId) ??
		game.cityInventories[0];

	legacyGame.warehouse = {
		capacity: activeInventory?.capacity ?? 0,
		materials: { ...(activeInventory?.materials ?? {}) },
		overflowUnits: activeInventory?.overflowUnits ?? 0,
		overflowCost: activeInventory?.overflowCost ?? 0
	};
	delete legacyGame.cityInventories;
	delete legacyGame.retailSupplyAssignments;

	return legacyGame as unknown as GameState;
}

function cityInventoryMetricDefinition(): ScenarioDefinition {
	const definition = fixtureDefinition({ scenarioId: 'first-profit', version: 1 });
	const query = {
		metric: 'city-inventory-quantity' as const,
		cityId: 'industry-city' as const,
		materialId: 'water' as const
	};

	return {
		...definition,
		requiredObjectives: [
			{
				id: 'city-water',
				labelKey: 'store.defaultName',
				query,
				comparator: 'gte',
				target: 4,
				window: { kind: 'current' }
			}
		],
		optionalObjectives: [],
		failures: [],
		scoreComponents: [
			{
				kind: 'metric',
				query,
				window: { kind: 'current' },
				zeroBonusAt: 0,
				fullBonusAt: 6,
				points: 500
			}
		]
	};
}

function createCityInventoryMetricGame(seed: number): GameState {
	let game = createNewGame('convenience', seed);
	for (let day = 0; day < 7; day += 1) game = simulateDay(game);

	const cityInventories = game.cityInventories.map((inventory) =>
		inventory.cityId === 'industry-city'
			? recalculateCityInventoryPressure({
					...inventory,
					materials: { ...inventory.materials, water: 3, grain: 2 }
				})
			: inventory
	);

	return {
		...game,
		cityInventories
	};
}

function createCityInventoryMetricRun(definition: ScenarioDefinition): ScenarioRun {
	const game = createCityInventoryMetricGame(definition.officialSeed);
	return {
		runId: crypto.randomUUID(),
		definition: { scenarioId: definition.id, version: definition.version },
		seed: definition.officialSeed,
		eligibility: 'ranked',
		status: 'active',
		game,
		evaluation: evaluateScenario(definition, game, false),
		result: null
	};
}

function v12CityInventoryMetricRunRecord(run: ScenarioRun, revision: number): ScenarioRunRecord {
	const record = runRecord(run, revision);
	const legacyGame = structuredClone(run.game) as unknown as Record<string, unknown>;
	const sourceInventory = run.game.cityInventories[0]!;
	legacyGame.warehouse = {
		capacity: sourceInventory.capacity,
		materials: { ...sourceInventory.materials },
		overflowUnits: sourceInventory.overflowUnits,
		overflowCost: sourceInventory.overflowCost
	};
	delete legacyGame.cityInventories;
	delete legacyGame.retailSupplyAssignments;
	for (const report of legacyGame.reports as Array<Record<string, unknown>>) {
		delete (report.productionReport as Record<string, unknown>).cityInventories;
		for (const storeReport of report.storeReports as Array<Record<string, unknown>>) {
			delete storeReport.replenishment;
			for (const productReport of storeReport.productReports as Array<Record<string, unknown>>) {
				delete productReport.replenishmentOutcome;
			}
		}
	}

	return {
		...record,
		gameSchemaVersion: 12,
		game: legacyGame as unknown as GameState
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

	it('emits an unknown-scenario diagnostic for an activeRunsByScenarioId key that is not a known scenario id', () => {
		const valid = fixtureRun();
		const decoded = decodeScenarioStoreSnapshot(
			snapshot({ 'first-profit': runRecord(valid), 'unknown-scenario': runRecord(valid) }),
			resolveFixtureDefinition
		);

		expect(decoded.snapshot.activeRunsByScenarioId['first-profit']).toEqual(runRecord(valid));
		expect(
			(decoded.snapshot.activeRunsByScenarioId as Record<string, ScenarioRunRecord | undefined>)[
				'unknown-scenario'
			]
		).toBeUndefined();
		expect(decoded.diagnostics.map((diagnostic) => diagnostic.code)).toContain('unknown-scenario');
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
				query: {
					metric: 'city-inventory-quantity',
					cityId: 'industry-city',
					materialId: 'water'
				},
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
					query: {
						metric: 'city-inventory-quantity',
						cityId: 'industry-city',
						materialId: 'water'
					},
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
			runId: crypto.randomUUID(),
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

	it('accepts a deadline-deferred active run produced by a non-advanceDay command', () => {
		// The runtime keeps a run active when the deadline triggers via a
		// non-advanceDay command (runtime.ts: executeScenarioCommand only
		// terminates on deadline when command.kind === 'advanceDay'). With
		// dayLimit: 1 the initial game already sits at the deadline day, so
		// any non-advanceDay command produces a deadline-deferred active run
		// that is not the canonical initial state. The codec must accept it
		// so it can be autosaved.
		const base = fixtureDefinition({ scenarioId: 'first-profit', version: 1 });
		const definition: ScenarioDefinition = {
			...base,
			dayLimit: 1,
			allowedCommands: ['advanceDay', 'updatePolicy'],
			start: { ...base.start, overrides: { storeCap: 1 } },
			requiredObjectives: [
				{
					id: 'unreachable-cash',
					labelKey: 'store.defaultName',
					query: { metric: 'cash' },
					comparator: 'gt',
					target: 2_000_000_000,
					window: { kind: 'current' }
				}
			],
			failures: [
				{
					id: 'catastrophic-cash',
					labelKey: 'store.defaultName',
					query: { metric: 'cash' },
					comparator: 'lt',
					target: -2_000_000_000,
					window: { kind: 'current' }
				}
			]
		};
		const started = startScenario(definition, definition.officialSeed);
		if (!started.ok) throw new Error(`Scenario start failed: ${started.error.code}`);
		expect(started.value.evaluation.deadline?.triggered).toBe(true);
		expect(started.value.status).toBe('active');

		// Execute a non-advanceDay command at the deadline day — the runtime
		// keeps the run active (deadline is deferred to the next advanceDay).
		const result = executeScenarioCommand(started.value, definition, {
			kind: 'updatePolicy',
			patch: { pricing: 'premium' }
		});
		if (!result.ok || !result.changed) {
			throw new Error('Expected updatePolicy to change the run.');
		}
		expect(result.run.status).toBe('active');
		expect(result.run.evaluation.deadline?.triggered).toBe(true);
		expect(result.run.result).toBeNull();

		// The codec must accept this deadline-deferred active run.
		const encoded = encodeScenarioRunRecord(result.run, () => definition);
		const decoded = validateScenarioRun({ ...encoded.run, game: encoded.game }, () => definition);
		expect(decoded).toEqual(result.run);
	});

	it('accepts abandonment from a deadline-deferred active state', () => {
		const base = fixtureDefinition({ scenarioId: 'first-profit', version: 1 });
		const definition: ScenarioDefinition = {
			...base,
			dayLimit: 1,
			allowedCommands: ['advanceDay', 'updatePolicy'],
			start: { ...base.start, overrides: { storeCap: 1 } },
			requiredObjectives: [
				{
					id: 'unreachable-cash',
					labelKey: 'store.defaultName',
					query: { metric: 'cash' },
					comparator: 'gt',
					target: 2_000_000_000,
					window: { kind: 'current' }
				}
			],
			failures: [
				{
					id: 'catastrophic-cash',
					labelKey: 'store.defaultName',
					query: { metric: 'cash' },
					comparator: 'lt',
					target: -2_000_000_000,
					window: { kind: 'current' }
				}
			]
		};
		const started = startScenario(definition, definition.officialSeed);
		if (!started.ok) throw new Error(`Scenario start failed: ${started.error.code}`);
		const result = executeScenarioCommand(started.value, definition, {
			kind: 'updatePolicy',
			patch: { pricing: 'premium' }
		});
		if (!result.ok || !result.changed) {
			throw new Error('Expected updatePolicy to change the run.');
		}
		const abandoned = abandonScenario(result.run);
		expect(abandoned.status).toBe('abandoned');
		expect(abandoned.evaluation.deadline?.triggered).toBe(true);

		const encoded = encodeScenarioRunRecord(abandoned, () => definition);
		const decoded = validateScenarioRun({ ...encoded.run, game: encoded.game }, () => definition);
		expect(decoded).toEqual(abandoned);
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
		const legacyGame = toLegacyV12WarehouseWireGame(active.game);
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

	it('accepts city-scoped metric evidence and hard-rejects removed warehouse evidence', () => {
		const definition = cityInventoryMetricDefinition();
		const run = createCityInventoryMetricRun(definition);
		const resolver: ScenarioDefinitionResolver = (ref) =>
			ref.scenarioId === definition.id && ref.version === definition.version
				? definition
				: undefined;
		const accepted = decodeScenarioStoreSnapshot(
			snapshot({ 'first-profit': runRecord(run) }),
			resolver
		);

		expect(accepted.diagnostics).toEqual([]);
		expect(
			accepted.snapshot.activeRunsByScenarioId['first-profit']?.run.evaluation.required[0]?.evidence
		).toMatchObject({
			metric: 'city-inventory-quantity',
			actual: 3,
			contributingIds: ['city-inventory:industry-city/material:water']
		});

		const removedMetricRun = structuredClone(run);
		removedMetricRun.evaluation.required[0]!.evidence.metric = 'warehouse-quantity' as never;
		const removedMetricSnapshot = snapshot({ 'first-profit': runRecord(removedMetricRun) });
		const originalSnapshot = structuredClone(removedMetricSnapshot);
		const rejected = decodeScenarioStoreSnapshot(removedMetricSnapshot, resolver);

		expect(rejected.snapshot.activeRunsByScenarioId).toEqual({});
		expect(rejected.diagnostics.map((diagnostic) => diagnostic.code)).toContain('invalid-value');
		expect(removedMetricSnapshot).toEqual(originalSnapshot);
	});

	it('migrates a v12 embedded game once through the shared city-inventory migration', () => {
		const definition = cityInventoryMetricDefinition();
		const run = createCityInventoryMetricRun(definition);
		const resolver: ScenarioDefinitionResolver = (ref) =>
			ref.scenarioId === definition.id && ref.version === definition.version
				? definition
				: undefined;
		const legacyRecord = v12CityInventoryMetricRunRecord(run, 17);
		const originalEnvelope = structuredClone(legacyRecord.run);
		const legacyProduct = (legacyRecord.game as GameState).reports.at(-1)!.storeReports[0]!
			.productReports[0]!;
		const decoded = decodeScenarioStoreSnapshot(
			snapshot({ 'first-profit': legacyRecord }),
			resolver
		);

		expect(decoded.diagnostics).toEqual([]);
		const migrated = decoded.snapshot.activeRunsByScenarioId['first-profit']!;
		const migratedGame = migrated.game as GameState;
		const migratedProduct = migratedGame.reports.at(-1)!.storeReports[0]!.productReports[0]!;
		expect(legacyProduct.importedUnits).toBeGreaterThan(0);
		expect(legacyProduct.importSpend).toBeGreaterThan(0);
		expect(migrated.scenarioSchemaVersion).toBe(SCENARIO_RUN_SCHEMA_VERSION);
		expect(migrated.gameSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(migrated.revision).toBe(17);
		expect(migrated.run).toEqual(originalEnvelope);
		expect(migratedGame.cityInventories).toEqual([
			{
				cityId: 'industry-city',
				capacity: 0,
				materials: { water: 3, grain: 2 },
				overflowUnits: 5,
				overflowCost: 10
			}
		]);
		expect(migratedGame.retailSupplyAssignments).toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }
		]);
		expect(migratedGame).not.toHaveProperty('warehouse');
		expect(
			migratedGame.cityInventories.reduce(
				(totals, inventory) => ({
					water: totals.water + (inventory.materials.water ?? 0),
					grain: totals.grain + (inventory.materials.grain ?? 0)
				}),
				{ water: 0, grain: 0 }
			)
		).toEqual({ water: 3, grain: 2 });
		expect(migratedGame.reports.at(-1)!.storeReports[0]!.replenishment).toBeNull();
		expect(migratedProduct.replenishmentOutcome).toBeNull();
		expect({
			warehouseUnits: migratedProduct.warehouseUnits,
			warehouseValue: migratedProduct.warehouseValue,
			importedUnits: migratedProduct.importedUnits,
			importCost: migratedProduct.importCost,
			importSpend: migratedProduct.importSpend,
			unitsSold: migratedProduct.unitsSold,
			demandMissed: migratedProduct.demandMissed,
			revenue: migratedProduct.revenue,
			costOfGoods: migratedProduct.costOfGoods,
			grossMargin: migratedProduct.grossMargin,
			endingStock: migratedProduct.endingStock
		}).toEqual({
			warehouseUnits: legacyProduct.warehouseUnits,
			warehouseValue: legacyProduct.warehouseValue,
			importedUnits: legacyProduct.importedUnits,
			importCost: legacyProduct.importCost,
			importSpend: legacyProduct.importSpend,
			unitsSold: legacyProduct.unitsSold,
			demandMissed: legacyProduct.demandMissed,
			revenue: legacyProduct.revenue,
			costOfGoods: legacyProduct.costOfGoods,
			grossMargin: legacyProduct.grossMargin,
			endingStock: legacyProduct.endingStock
		});

		const reencoded = encodeScenarioRunRecord(
			{ ...migrated.run, game: migratedGame },
			resolver,
			migrated.revision
		);
		const redecoded = decodeScenarioStoreSnapshot(
			snapshot({ 'first-profit': reencoded }),
			resolver
		);

		expect(redecoded.diagnostics).toEqual([]);
		expect(reencoded.gameSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(redecoded.snapshot.activeRunsByScenarioId['first-profit']).toEqual(reencoded);
	});

	it('migrates an embedded v11 event game while preserving the scenario envelope', () => {
		const active = fixtureRun(undefined, { advanceDays: 1 });
		const legacyRecord = v11RunRecord(active, 7);
		const originalEnvelope = structuredClone(legacyRecord.run);

		const decoded = decodeScenarioStoreSnapshot(
			snapshot({ 'first-profit': legacyRecord }),
			resolveFixtureDefinition
		);
		const migrated = decoded.snapshot.activeRunsByScenarioId['first-profit'];
		const migratedGame = migrated?.game as GameState;

		expect(decoded.diagnostics).toEqual([]);
		expect(migrated?.gameSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(migrated?.revision).toBe(7);
		expect(migrated?.run).toEqual(originalEnvelope);
		expect(migratedGame.decisions[0]).toMatchObject({
			kind: 'event',
			id: 'event-instance-1',
			eventId: 'supplier-terms',
			definitionVersion: 1,
			generatedOnDay: active.game.day,
			target: { kind: 'company' }
		});
		expect(migratedGame.events).toMatchObject({
			selectionSchemaVersion: 1,
			nextInstanceSequence: 2,
			nextModifierSequence: 1,
			activeModifiers: []
		});
		expect(migratedGame.reports[0]).toMatchObject({
			modifierImpacts: [],
			modifierLifecycle: []
		});
	});
});

// ---------------------------------------------------------------------------
// Defensive validation branch coverage.
//
// The codec validates every persisted field with `fail()` branches that are
// only reached by malformed input. The tests below construct valid fixtures
// and apply a single targeted mutation so each defensive branch fires in
// isolation, then decode via `decodeScenarioStoreSnapshot` (which collects
// diagnostics instead of throwing) and assert the expected diagnostic code.
// ---------------------------------------------------------------------------

function bestResultEntry(result: ScenarioResult): {
	scenarioSchemaVersion: number;
	result: ScenarioResult;
} {
	return { scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION, result };
}

function decodeBestResult(
	result: ScenarioResult,
	resolver: ScenarioDefinitionResolver = resolveFixtureDefinition,
	key: string = scenarioDefinitionKey(result.definition)
): ReturnType<typeof decodeScenarioStoreSnapshot> {
	return decodeScenarioStoreSnapshot(snapshot({}, { [key]: bestResultEntry(result) }), resolver);
}

function buildResult(
	definition: ScenarioDefinition,
	game: GameState,
	outcome: 'completed' | 'failed' = 'completed'
): ScenarioResult {
	const evaluation = evaluateScenario(definition, game, true);
	return {
		definition: { scenarioId: definition.id, version: definition.version },
		seed: definition.officialSeed,
		eligibility: 'ranked',
		outcome,
		completionDay: game.day,
		score: evaluation.projection.score,
		medal: outcome === 'completed' ? evaluation.projection.medal : null,
		evaluation
	};
}

describe('scenario codec defensive validation branches', () => {
	describe('primitive require guards', () => {
		it('rejects an empty runId string in an active run', () => {
			const active = fixtureRun();
			const record = runRecord(active);
			record.run = { ...record.run, runId: '' } as never;
			const decoded = decodeScenarioStoreSnapshot(
				snapshot({ 'first-profit': record }),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.activeRunsByScenarioId).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-string');
		});

		it('rejects a non-integer evaluation day in a best result', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			(result.evaluation as unknown as Record<string, unknown>).day = 1.5;
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-integer');
		});

		it('rejects an unsupported eligibility value in a best result', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			(result as unknown as Record<string, unknown>).eligibility = 'bogus';
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-value');
		});
	});

	describe('definition resolution', () => {
		it('rejects an unknown scenario id in a result definition ref', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			result.definition = { scenarioId: 'bogus-scenario' as ScenarioId, version: 1 };
			const decoded = decodeBestResult(result, resolveFixtureDefinition, 'bogus-scenario@1');

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('unknown-scenario');
		});

		it('rejects a result whose definition resolver throws', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			const throwing: ScenarioDefinitionResolver = () => {
				throw new Error('resolver boom');
			};
			const decoded = decodeBestResult(result, throwing);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('unsupported-definition');
		});
	});

	describe('evidence and window validation', () => {
		it('rejects a fixed-report-days window with a non-integer startDay', () => {
			const base = fixtureDefinition({ scenarioId: 'first-profit', version: 1 });
			const definition: ScenarioDefinition = {
				...base,
				requiredObjectives: [
					{
						id: 'fixed-window-obj',
						labelKey: 'store.defaultName',
						query: { metric: 'daily-net-income' },
						comparator: 'gte',
						target: -1_000_000_000,
						window: { kind: 'fixed-report-days', startDay: 1, endDay: 5 }
					}
				],
				optionalObjectives: [],
				failures: [],
				scoreComponents: []
			};
			let game = createNewGame('convenience', definition.officialSeed);
			for (let day = 0; day < 5; day += 1) game = simulateDay(game);
			const result = buildResult(definition, game);
			result.evaluation.required[0]!.evidence.window = {
				kind: 'fixed-report-days',
				startDay: 0.5,
				endDay: 5
			};
			const decoded = decodeBestResult(result, () => definition);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-integer');
		});

		it('rejects evidence whose conditionId does not match its containing objective', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			result.evaluation.required[0]!.evidence.conditionId = 'wrong-condition';
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('condition-id-mismatch');
		});

		it('rejects deadline evidence with the wrong condition id', () => {
			const completed = fixtureRun(undefined, {
				status: 'completed',
				score: 750,
				advanceDays: 14
			});
			const result = structuredClone(completed.result!);
			result.evaluation.deadline!.evidence.conditionId = 'not-deadline' as never;
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-deadline');
		});

		it('accepts a run-to-date window kind in an objective', () => {
			const base = fixtureDefinition({ scenarioId: 'first-profit', version: 1 });
			const definition: ScenarioDefinition = {
				...base,
				requiredObjectives: [
					{
						id: 'cumulative-income',
						labelKey: 'store.defaultName',
						query: { metric: 'cumulative-net-income' },
						comparator: 'gte',
						target: -1_000_000_000,
						window: { kind: 'run-to-date' }
					}
				],
				optionalObjectives: [],
				failures: [],
				scoreComponents: []
			};
			let game = createNewGame('convenience', definition.officialSeed);
			for (let day = 0; day < 3; day += 1) game = simulateDay(game);
			const result = buildResult(definition, game);
			const decoded = decodeBestResult(result, () => definition);

			expect(result.evaluation.required[0]?.evidence.window).toEqual({ kind: 'run-to-date' });
			expect(decoded.diagnostics).toEqual([]);
		});

		it('rejects a trailing-reports window with a non-integer count', () => {
			const base = fixtureDefinition({ scenarioId: 'first-profit', version: 1 });
			const definition: ScenarioDefinition = {
				...base,
				requiredObjectives: [
					{
						id: 'trailing-income',
						labelKey: 'store.defaultName',
						query: { metric: 'daily-net-income' },
						comparator: 'gte',
						target: -1_000_000_000,
						window: { kind: 'trailing-reports', count: 3 }
					}
				],
				optionalObjectives: [],
				failures: [],
				scoreComponents: []
			};
			let game = createNewGame('convenience', definition.officialSeed);
			for (let day = 0; day < 3; day += 1) game = simulateDay(game);
			const result = buildResult(definition, game);
			result.evaluation.required[0]!.evidence.window = {
				kind: 'trailing-reports',
				count: 0.5
			};
			const decoded = decodeBestResult(result, () => definition);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-integer');
		});

		it('validates the window of metric component evidence', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			const evidence = result.evaluation.projection.componentEvidence[0]!;
			(evidence as unknown as Record<string, unknown>).window = {
				kind: 'trailing-reports',
				count: 0
			};
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-integer');
		});
	});

	describe('evaluation structural validation', () => {
		it('rejects an unsupported risk kind', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			(result.evaluation.risks[0] as unknown as Record<string, unknown>).kind = 'bogus';
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-risk');
		});

		it('rejects a projection score above 1000', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			result.evaluation.projection.score = 1001;
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-score');
		});

		it('rejects score component evidence with a non-metric kind', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			const evidence = result.evaluation.projection.componentEvidence[0]!;
			(evidence as unknown as Record<string, unknown>).kind = 'bogus';
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-value');
		});
	});

	describe('evaluation contract cardinality and identity', () => {
		it('rejects a required-objective cardinality mismatch', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			result.evaluation.required = [];
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('evaluation-mismatch');
		});

		it('rejects a deadline evaluation that disagrees with the evaluation day', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			result.evaluation.deadline = {
				triggered: true,
				evidence: {
					conditionId: 'deadline-exceeded',
					day: result.evaluation.day,
					dayLimit: 14
				}
			};
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('evaluation-mismatch');
		});

		it('rejects a risk projection with the wrong cardinality', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			result.evaluation.risks = [];
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('evaluation-mismatch');
		});

		it('rejects a failure risk with the wrong condition id', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			(
				result.evaluation.risks[0] as Extract<ScenarioRiskProjection, { kind: 'condition' }>
			).conditionId = 'wrong-failure';
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('evaluation-mismatch');
		});

		it('rejects a deadline risk with the wrong daysRemaining', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			(
				result.evaluation.risks[1] as Extract<ScenarioRiskProjection, { kind: 'deadline' }>
			).daysRemaining = 999;
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('evaluation-mismatch');
		});

		it('rejects component evidence with the wrong cardinality', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			result.evaluation.projection.componentEvidence = [];
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('evaluation-mismatch');
		});

		it('rejects score component points exceeding the component maximum', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			result.evaluation.projection.componentPoints[0] = 501;
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('evaluation-mismatch');
		});

		it('rejects a projection score that does not match the component sum', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			result.score = 751;
			result.evaluation.projection.score = 751;
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('evaluation-mismatch');
		});
	});

	describe('optional-objective and remaining-day score components', () => {
		it('rejects metric evidence on an optional-objective score component', () => {
			const base = fixtureDefinition({ scenarioId: 'first-profit', version: 1 });
			const definition: ScenarioDefinition = {
				...base,
				scoreComponents: [{ kind: 'optional-objective', objectiveId: 'cash-rich', points: 500 }]
			};
			const game = createNewGame('convenience', definition.officialSeed);
			const result = buildResult(definition, game);
			result.evaluation.projection.componentEvidence[0] = {
				kind: 'metric',
				query: { metric: 'cash' },
				window: { kind: 'current' },
				actual: 0,
				day: result.evaluation.day,
				windowComplete: true
			};
			const decoded = decodeBestResult(result, () => definition);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('evaluation-mismatch');
		});

		it('rejects optional-objective points that do not match the objective state', () => {
			const base = fixtureDefinition({ scenarioId: 'first-profit', version: 1 });
			const definition: ScenarioDefinition = {
				...base,
				scoreComponents: [{ kind: 'optional-objective', objectiveId: 'cash-rich', points: 500 }]
			};
			const game = createNewGame('convenience', definition.officialSeed);
			const result = buildResult(definition, game);
			const expected = result.evaluation.optional[0]?.status === 'satisfied' ? 500 : 0;
			result.evaluation.projection.componentPoints[0] = expected === 0 ? 500 : 0;
			const decoded = decodeBestResult(result, () => definition);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('evaluation-mismatch');
		});

		it('rejects metric evidence on a remaining-days score component', () => {
			const base = fixtureDefinition({ scenarioId: 'first-profit', version: 1 });
			const definition: ScenarioDefinition = {
				...base,
				scoreComponents: [{ kind: 'remaining-days', zeroBonusAt: 0, fullBonusAt: 14, points: 500 }]
			};
			const game = createNewGame('convenience', definition.officialSeed);
			const result = buildResult(definition, game);
			result.evaluation.projection.componentEvidence[0] = {
				kind: 'metric',
				query: { metric: 'cash' },
				window: { kind: 'current' },
				actual: 0,
				day: result.evaluation.day,
				windowComplete: true
			};
			const decoded = decodeBestResult(result, () => definition);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('evaluation-mismatch');
		});

		it('computes full metric points when zeroBonusAt equals fullBonusAt and actual meets the threshold', () => {
			const base = fixtureDefinition({ scenarioId: 'first-profit', version: 1 });
			const definition: ScenarioDefinition = {
				...base,
				requiredObjectives: [
					{
						id: 'cash-nonnegative',
						labelKey: 'store.defaultName',
						query: { metric: 'cash' },
						comparator: 'gte',
						target: 0,
						window: { kind: 'current' }
					},
					base.requiredObjectives[1]!
				],
				scoreComponents: [
					{
						kind: 'metric',
						query: { metric: 'cash' },
						window: { kind: 'current' },
						zeroBonusAt: 100,
						fullBonusAt: 100,
						points: 500
					}
				]
			};
			const game = { ...createNewGame('convenience', definition.officialSeed), cash: 100 };
			const result = buildResult(definition, game);
			const decoded = decodeBestResult(result, () => definition);

			expect(result.evaluation.projection.componentPoints).toEqual([500]);
			expect(decoded.diagnostics).toEqual([]);
		});

		it('computes zero metric points when zeroBonusAt equals fullBonusAt and actual is below the threshold', () => {
			const base = fixtureDefinition({ scenarioId: 'first-profit', version: 1 });
			const definition: ScenarioDefinition = {
				...base,
				requiredObjectives: [
					{
						id: 'cash-nonnegative',
						labelKey: 'store.defaultName',
						query: { metric: 'cash' },
						comparator: 'gte',
						target: 0,
						window: { kind: 'current' }
					},
					base.requiredObjectives[1]!
				],
				scoreComponents: [
					{
						kind: 'metric',
						query: { metric: 'cash' },
						window: { kind: 'current' },
						zeroBonusAt: 100,
						fullBonusAt: 100,
						points: 500
					}
				]
			};
			const game = { ...createNewGame('convenience', definition.officialSeed), cash: 50 };
			const result = buildResult(definition, game);
			const decoded = decodeBestResult(result, () => definition);

			expect(result.evaluation.projection.componentPoints).toEqual([0]);
			expect(decoded.diagnostics).toEqual([]);
		});
	});

	describe('result-level validation', () => {
		it('rejects an eligibility that does not match the official seed', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			result.eligibility = 'unranked';
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('eligibility-mismatch');
		});

		it('rejects a result score above 1000', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			result.score = 1001;
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-score');
		});

		it('rejects a completion day that does not match the evaluation day', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			result.completionDay = result.evaluation.day + 1;
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('result-evaluation-mismatch');
		});

		it('rejects a completed result medal that does not match the projection', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const result = structuredClone(completed.result!);
			result.medal = 'bronze';
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('medal-mismatch');
		});

		it('rejects a medal on a failed result', () => {
			const failed = fixtureRun(undefined, { status: 'failed' });
			const result = structuredClone(failed.result!);
			result.medal = 'silver';
			const decoded = decodeBestResult(result);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-medal');
		});
	});

	describe('run-with-game validation', () => {
		it('rejects an active run eligibility that does not match the official seed', () => {
			const active = fixtureRun();
			const record = runRecord(active);
			record.run = { ...record.run, eligibility: 'unranked' } as never;
			const decoded = decodeScenarioStoreSnapshot(
				snapshot({ 'first-profit': record }),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.activeRunsByScenarioId).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('eligibility-mismatch');
		});

		it('rejects an active run whose seed does not match the embedded game', () => {
			const active = fixtureRun();
			const record = runRecord(active);
			record.run = {
				...record.run,
				seed: active.seed + 1,
				eligibility: 'unranked'
			} as never;
			const decoded = decodeScenarioStoreSnapshot(
				snapshot({ 'first-profit': record }),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.activeRunsByScenarioId).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('run-game-mismatch');
		});

		it('rejects an active run evaluation that does not match the embedded game', () => {
			const active = fixtureRun();
			const record = runRecord(active);
			const mutated = structuredClone(record.run);
			mutated.evaluation.required[0]!.evidence.contributingIds = ['x', 'y'];
			record.run = mutated;
			const decoded = decodeScenarioStoreSnapshot(
				snapshot({ 'first-profit': record }),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.activeRunsByScenarioId).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('evaluation-mismatch');
		});

		it('rejects an active run that carries a result', () => {
			const active = fixtureRun();
			const record = runRecord(active);
			record.run = { ...record.run, result: {} } as never;
			const decoded = decodeScenarioStoreSnapshot(
				snapshot({ 'first-profit': record }),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.activeRunsByScenarioId).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-active-run');
		});

		it('rejects a terminal run that lacks a result', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const record = runRecord(completed);
			record.run = { ...record.run, result: null } as never;
			const decoded = decodeScenarioStoreSnapshot(
				snapshot({ 'first-profit': record }),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.activeRunsByScenarioId).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-terminal-run');
		});

		it('rejects a terminal run whose result evaluation diverges from the run evaluation', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const record = runRecord(completed);
			const mutated = structuredClone(record.run);
			mutated.result!.evaluation = structuredClone(mutated.evaluation);
			mutated.result!.evaluation.required[0]!.evidence.contributingIds = ['x', 'y'];
			record.run = mutated;
			const decoded = decodeScenarioStoreSnapshot(
				snapshot({ 'first-profit': record }),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.activeRunsByScenarioId).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('terminal-run-mismatch');
		});
	});

	describe('envelope and best-result record decoding', () => {
		it('rejects an active run envelope that embeds a game property', () => {
			const active = fixtureRun();
			const record = runRecord(active);
			record.run = { ...record.run, game: record.game } as never;
			const decoded = decodeScenarioStoreSnapshot(
				snapshot({ 'first-profit': record }),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.activeRunsByScenarioId).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-run-envelope');
		});

		it('rejects an active run whose definition scenario id does not match its key', () => {
			const active = fixtureRun({ scenarioId: 'import-squeeze', version: 1 });
			const decoded = decodeScenarioStoreSnapshot(
				snapshot({ 'first-profit': runRecord(active) }),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.activeRunsByScenarioId).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('definition-key-mismatch');
		});

		it('rejects a best-result record with an unsupported scenario schema version', () => {
			const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
			const decoded = decodeScenarioStoreSnapshot(
				snapshot(
					{},
					{
						'first-profit@1': {
							scenarioSchemaVersion: SCENARIO_RUN_SCHEMA_VERSION + 1,
							result: completed.result!
						}
					}
				),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('unsupported-scenario-schema');
		});

		it('rejects a best-result record whose result is not a ranked completed run', () => {
			const failed = fixtureRun(undefined, { status: 'failed' });
			const decoded = decodeScenarioStoreSnapshot(
				snapshot(
					{},
					{
						'first-profit@1': bestResultEntry(failed.result!)
					}
				),
				resolveFixtureDefinition
			);

			expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
			expect(decoded.diagnostics.map((d) => d.code)).toContain('invalid-best-result');
		});
	});

	describe('encode guards', () => {
		it('validateScenarioRun rejects an embedded game that fails strict validation', () => {
			const active = fixtureRun();
			const stale = {
				...active,
				game: { ...active.game, day: active.game.day + 99 }
			};

			expect(() => validateScenarioRun(stale, resolveFixtureDefinition)).toThrow(
				/Run game failed strict current validation/
			);
		});

		it('encodeScenarioBestResultRecord rejects a failed result', () => {
			const failed = fixtureRun(undefined, { status: 'failed' });

			expect(() =>
				encodeScenarioBestResultRecord(failed.result!, resolveFixtureDefinition)
			).toThrow(/Only ranked completed results can be stored as best results/);
		});

		it('encodeScenarioBestResultRecord rejects an unranked completed result', () => {
			const completed = fixtureRun(undefined, {
				status: 'completed',
				score: 750,
				seed: 999_999
			});

			expect(completed.eligibility).toBe('unranked');
			expect(() =>
				encodeScenarioBestResultRecord(completed.result!, resolveFixtureDefinition)
			).toThrow(/Only ranked completed results can be stored as best results/);
		});
	});

	describe('diagnostic value sanitization', () => {
		it.each([
			['non-finite number', Number.POSITIVE_INFINITY, 'non-finite number'],
			['NaN', Number.NaN, 'non-finite number'],
			['bigint', 1n, '1'],
			['object', { foo: 'bar' }, '[object]']
		] as const)(
			'sanitizes a %s diagnostic value via safeDescribe',
			(_name, corruptValue, expected) => {
				const completed = fixtureRun(undefined, { status: 'completed', score: 750 });
				const result = structuredClone(completed.result!);
				(result.evaluation.required[0]!.evidence as unknown as Record<string, unknown>).target =
					corruptValue as unknown;
				const decoded = decodeBestResult(result);

				expect(decoded.snapshot.bestResultsByDefinitionKey).toEqual({});
				const diagnostic = decoded.diagnostics.find((d) => d.code === 'invalid-number');
				expect(diagnostic).toBeDefined();
				expect(diagnostic!.value).toBe(expected);
				expect(() => structuredClone(decoded.diagnostics)).not.toThrow();
			}
		);
	});
});
