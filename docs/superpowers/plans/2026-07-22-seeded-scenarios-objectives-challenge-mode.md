# Seeded Scenarios, Objectives, and Challenge Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three deterministic, resumable challenge scenarios with typed objectives, per-command restrictions, ranked official seeds, custom unranked share codes, isolated persistence, medals, and accessible challenge UI without changing sandbox semantics.

**Architecture:** A `ScenarioRun` wraps the existing immutable `GameState`; scenario modules build curated starts through normal domain transitions, compile static modifiers into explicit `SimulationRules`, execute typed commands, and evaluate registered metrics after each accepted state change. A dedicated queued `ScenarioRepository` stores active runs and version-keyed best results separately from sandbox saves. The route derives its displayed game from sandbox or scenario state and publishes challenge mutations only after persistence succeeds.

**Tech Stack:** TypeScript, SvelteKit, Svelte 5 runes, Bun, Vitest server/browser projects, Playwright, browser `localStorage`, Tauri Store.

**Spec:** `docs/superpowers/specs/2026-07-21-seeded-scenarios-objectives-challenge-mode-design.md` — read it before starting any task.

## Global Constraints

- Run repository commands through `rtk`; use `rtk bun run ...` for package scripts.
- Use TDD for every behavior change: add the focused failing test, confirm the expected failure, implement the minimum behavior, then rerun the focused test.
- Every Vitest test must contain an `expect` because `requireAssertions` is enabled.
- Preserve `GameState` as the simulation source of truth. Scenario state must remain in `ScenarioRun`, never in `GameState`.
- Game-domain modules must not import the scenario catalog or inspect a scenario ID. The only game-domain extension is the explicit `SimulationRules` input.
- Preserve sandbox behavior. Existing callers must continue to use `simulateDay(game)` and the existing save repository without scenario dependencies.
- Deterministic state ordering must use numeric comparisons or plain UTF-16 code-unit string comparisons. Do not use `localeCompare` in state-changing paths.
- Evaluation consumes no RNG and never changes `GameState`.
- A rejected or no-op scenario command must not evaluate or persist.
- Failure wins when failure and success become true on the same command. Deadlines are checked only after `advanceDay`.
- Challenge writes are pessimistic and single-flight: publish the new run/result and play its SFX only after the repository write succeeds.
- Current-schema scenario loads must not use sandbox repair normalization. Older embedded games may change only through an explicit game-schema migration.
- Scenario browser and Tauri keys must remain distinct from `serpens.saves.v2` and `serpens-saves.json`/`saves`.
- All player-facing challenge copy must be added to `src/lib/i18n/messages/en.ts`, `src/lib/i18n/messages/zh-Hant.ts`, and `src/lib/i18n/messages/ja.ts`.
- Before changing any Svelte file, use the required Svelte MCP sequence: `list-sections`, fetch every relevant section with `get-documentation`, then run `svelte-autofixer` on every changed Svelte file until it reports no issues.
- Keep built-in `(scenarioId, version)` meanings immutable. Balance changes after publication require a new definition version.
- Commit after each task with the conventional-commit message specified by that task.

---

### Task 1: Replace the seller tie-break with a locale-independent comparator

**Files:**
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/stock.spec.ts`

**Interfaces:**
- Add a private `compareCodeUnitStrings(left: string, right: string): number` in `stock.ts`.
- Keep `simulateProductSalesForCity`'s public signature unchanged in this task.

- [ ] **Step 1: Write the failing regression test**

Add a `stock.spec.ts` test that creates two equal-scoring stores with IDs `store-z` and `store-a`, simulates the same city twice with reversed input-store order and identical RNG state, and asserts both the returned stores and final RNG state are deeply equal. Also assert that the lower code-unit ID is processed first by comparing the per-store product reports.

```ts
it('uses a code-unit seller tie-break independent of input order', () => {
	const ascending = createEqualSellerGame(['store-a', 'store-z']);
	const descending = createEqualSellerGame(['store-z', 'store-a']);
	const firstRng = createRngFromState(ascending.rngState);
	const secondRng = createRngFromState(descending.rngState);

	const first = simulateProductSalesForCity({
		game: ascending,
		city: ascending.cities[0]!,
		rng: firstRng,
		storeCapacity: equalSellerCapacity(ascending)
	});
	const second = simulateProductSalesForCity({
		game: descending,
		city: descending.cities[0]!,
		rng: secondRng,
		storeCapacity: equalSellerCapacity(descending)
	});

	expect(first.stores).toEqual(second.stores);
	expect(firstRng.getState()).toBe(secondRng.getState());
	expect([...first.productReports.keys()]).toEqual(['store-a', 'store-z']);
});
```

- [ ] **Step 2: Confirm the test fails for the intended reason**

Run:

```bash
rtk bun run test:unit -- src/lib/game/stock.spec.ts --run -t "code-unit seller tie-break"
```

Expected: the reversed input produces a different report/store result or RNG state while `localeCompare` controls the tie-break.

- [ ] **Step 3: Implement the comparator**

```ts
function compareCodeUnitStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}
```

Replace only the seller tie-break:

```ts
.sort(
	(left, right) =>
		scoreStoreForCategory(right, categoryId) - scoreStoreForCategory(left, categoryId) ||
		compareCodeUnitStrings(left.id, right.id)
);
```

- [ ] **Step 4: Verify the focused and full stock specs**

```bash
rtk bun run test:unit -- src/lib/game/stock.spec.ts --run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/game/stock.ts src/lib/game/stock.spec.ts
rtk git commit -m "fix: stabilize seller ordering"
```

---

### Task 2: Define the closed scenario contracts and test fixtures

**Files:**
- Create: `src/lib/scenarios/types.ts`
- Create: `src/lib/scenarios/types.spec.ts`
- Create: `src/lib/scenarios/catalog.ts` (typed empty registry; Task 16 publishes the definitions)

**Interfaces:**
- Produces every shared definition, run, command, evaluation, result, diagnostic, rules-source, scoring, and persistence type used by later tasks.
- Imports stable domain IDs and data shapes from `src/lib/game/types.ts` and `TranslationKey` from `src/lib/i18n/translate.ts`.

- [ ] **Step 1: Write the compile-time/runtime contract test**

The test must construct one fully closed fixture definition, one active run, and one command of every kind. It must assert the command-kind list exactly matches the route mutation inventory and that the blueprint has no catch-all index signature.

```ts
export const SCENARIO_COMMAND_KINDS = [
	'advanceDay',
	'resolveDecision',
	'updatePolicy',
	'openWorldCity',
	'selectWorldCity',
	'openStore',
	'upgradeStore',
	'hireStaff',
	'assignStaff',
	'unassignStaff',
	'promoteStaff',
	'updateStoreSellingPrice',
	'updateStoreInventoryTargets',
	'buildIndustrialBuilding',
	'upgradeIndustrialBuilding',
	'buildRail',
	'upgradeRail',
	'demolishRail'
] as const;
```

```ts
it('inventories every route-level game mutation', () => {
	expect(SCENARIO_COMMAND_KINDS).toEqual([
		'advanceDay',
		'resolveDecision',
		'updatePolicy',
		'openWorldCity',
		'selectWorldCity',
		'openStore',
		'upgradeStore',
		'hireStaff',
		'assignStaff',
		'unassignStaff',
		'promoteStaff',
		'updateStoreSellingPrice',
		'updateStoreInventoryTargets',
		'buildIndustrialBuilding',
		'upgradeIndustrialBuilding',
		'buildRail',
		'upgradeRail',
		'demolishRail'
	]);
});
```

- [ ] **Step 2: Confirm the test fails because the module does not exist**

```bash
rtk bun run test:unit -- src/lib/scenarios/types.spec.ts --run
```

Expected: module resolution fails for `./types`.

- [ ] **Step 3: Add the exact command and blueprint contracts**

```ts
export type ScenarioId = 'first-profit' | 'import-squeeze' | 'local-lifeline';
export type ScenarioDefinitionKey = `${ScenarioId}@${number}`;
export type ScenarioRunStatus = 'active' | 'completed' | 'failed' | 'abandoned';
export type ScenarioEligibility = 'ranked' | 'unranked';
export type ScenarioMedal = 'bronze' | 'silver' | 'gold';
export type ObjectiveConditionStatus = 'pending' | 'satisfied' | 'missed';
export type FailureConditionStatus = 'inactive' | 'triggered';

export type ScenarioCommand =
	| { kind: 'advanceDay' }
	| { kind: 'resolveDecision'; decisionId: string; optionId: string }
	| { kind: 'updatePolicy'; patch: Partial<CompanyPolicy> }
	| { kind: 'openWorldCity'; cityId: WorldCityId }
	| { kind: 'selectWorldCity'; cityId: WorldCityId }
	| { kind: 'openStore'; tileId: string; archetypeId: ArchetypeId }
	| { kind: 'upgradeStore'; storeId: string }
	| { kind: 'hireStaff'; candidateId: string }
	| { kind: 'assignStaff'; staffId: string; storeId: string }
	| { kind: 'unassignStaff'; staffId: string }
	| { kind: 'promoteStaff'; staffId: string }
	| { kind: 'updateStoreSellingPrice'; storeId: string; categoryId: string; sellingPrice: number }
	| {
			kind: 'updateStoreInventoryTargets';
			storeId: string;
			categoryId: string;
			reorderThreshold: number;
			targetStock: number;
	  }
	| { kind: 'buildIndustrialBuilding'; tileId: string; buildingTypeId: IndustrialBuildingTypeId }
	| { kind: 'upgradeIndustrialBuilding'; buildingId: string }
	| {
			kind: 'buildRail';
			originBuildingId: string;
			waypoints: readonly { x: number; y: number }[];
			destinationBuildingId: string;
	  }
	| { kind: 'upgradeRail'; cityId: string; segmentId: string }
	| { kind: 'demolishRail'; cityId: string; segmentId: string };
```

```ts
export interface ScenarioStartBlueprint {
	foundingStore: {
		ref: string;
		archetypeId: ArchetypeId;
		cityId: WorldCityId;
		tileId: string;
	};
	industrialBuildings: readonly {
		ref: string;
		typeId: IndustrialBuildingTypeId;
		cityId: WorldCityId;
		tileId: string;
	}[];
	rails: readonly { cityId: WorldCityId; x: number; y: number; level: number }[];
	overrides: {
		cash?: number;
		debt?: number;
		policy?: CompanyPolicy;
		storeCap?: number;
		stores?: readonly {
			storeRef: string;
			targetLevel?: number;
			products?: readonly {
				categoryId: string;
				stock: number;
				reorderThreshold: number;
				targetStock: number;
				sellingPrice: number;
			}[];
		}[];
		buildingInventories?: readonly {
			buildingRef: string;
			materials: Partial<Record<MaterialId, number>>;
		}[];
		warehouseMaterials?: Partial<Record<MaterialId, number>>;
		world?: {
			revealedCityIds: readonly WorldCityId[];
			openedCityIds: readonly WorldCityId[];
			activeRetailCityId: WorldCityId;
			activeIndustryCityId: WorldCityId;
		};
	};
}
```

- [ ] **Step 4: Add metric, scoring, run, and persistence contracts**

Use a discriminated metric query so product/material/building filters are typed rather than stored in an untyped parameter map:

```ts
export type ScenarioMetricWindow =
	| { kind: 'current' }
	| { kind: 'run-to-date' }
	| { kind: 'trailing-reports'; count: number }
	| { kind: 'fixed-report-days'; startDay: number; endDay: number };

export type ScenarioMetricQuery =
	| { metric: 'cash' }
	| { metric: 'daily-net-income' }
	| { metric: 'cumulative-net-income' }
	| { metric: 'consecutive-positive-net-income-reports' }
	| { metric: 'completed-retail-import-cycles' }
	| { metric: 'retail-import-spend'; categoryIds: readonly string[] }
	| { metric: 'retail-imported-units'; categoryIds: readonly string[] }
	| { metric: 'retail-local-units'; categoryIds: readonly string[] }
	| { metric: 'retail-local-share'; categoryIds: readonly string[] }
	| { metric: 'units-sold'; categoryIds: readonly string[] }
	| { metric: 'demand-missed'; categoryIds: readonly string[] }
	| { metric: 'scorecard'; score: ScoreKey }
	| { metric: 'store-count' }
	| { metric: 'industrial-building-count'; buildingTypeIds: readonly IndustrialBuildingTypeId[] }
	| { metric: 'warehouse-quantity'; materialId: MaterialId };

export type ScenarioComparator = 'lt' | 'lte' | 'eq' | 'gte' | 'gt';

export interface ScenarioCondition {
	id: string;
	labelKey: TranslationKey;
	query: ScenarioMetricQuery;
	comparator: ScenarioComparator;
	target: number;
	window: ScenarioMetricWindow;
	requiresCompleteWindow?: boolean;
}

export interface ObjectiveEvidence {
	conditionId: string;
	metric: ScenarioMetricQuery['metric'];
	comparator: ScenarioComparator;
	target: number;
	actual: number;
	day: number;
	window: ScenarioMetricWindow;
	contributingIds: string[];
}
```

Add the definition and scoring shapes:

```ts
export interface ScenarioDefinitionRef {
	scenarioId: ScenarioId;
	version: number;
}

export type ScenarioModifier = {
	kind: 'import-cost-multiplier';
	scope: 'retail-product' | 'industrial-material';
	target: { kind: 'all' } | { kind: 'ids'; ids: readonly string[] };
	multiplier: number;
};

export interface ScenarioContentRules {
	cityIds: readonly WorldCityId[];
	archetypeIds: readonly ArchetypeId[];
	productCategoryIds: readonly string[];
	materialIds: readonly MaterialId[];
	buildingTypeIds: readonly IndustrialBuildingTypeId[];
	retailPlacements: readonly {
		cityId: WorldCityId;
		tileId: string;
		archetypeId: ArchetypeId;
	}[];
	industrialPlacements: readonly {
		cityId: WorldCityId;
		tileId: string;
		buildingTypeId: IndustrialBuildingTypeId;
	}[];
}

export type ScenarioScoreComponent =
	| { kind: 'optional-objective'; objectiveId: string; points: number }
	| {
			kind: 'metric';
			query: ScenarioMetricQuery;
			window: ScenarioMetricWindow;
			zeroBonusAt: number;
			fullBonusAt: number;
			points: number;
	  }
	| {
			kind: 'remaining-days';
			zeroBonusAt: number;
			fullBonusAt: number;
			points: number;
	  };

export interface ScenarioDefinition {
	id: ScenarioId;
	version: number;
	titleKey: TranslationKey;
	summaryKey: TranslationKey;
	briefingKey: TranslationKey;
	strategyHintKey: TranslationKey;
	officialSeed: number;
	dayLimit: number;
	start: ScenarioStartBlueprint;
	content: ScenarioContentRules;
	allowedCommands: readonly ScenarioCommand['kind'][];
	modifiers: readonly ScenarioModifier[];
	requiredObjectives: readonly ScenarioCondition[];
	optionalObjectives: readonly ScenarioCondition[];
	failures: readonly ScenarioCondition[];
	scoreComponents: readonly ScenarioScoreComponent[];
	medalThresholds: { silver: number; gold: number };
}
```

Add the evaluated/run/result shapes. A result does not store wall-clock metadata:

```ts
export interface ScenarioObjectiveEvaluation {
	conditionId: string;
	status: ObjectiveConditionStatus;
	evidence: ObjectiveEvidence;
}

export interface ScenarioFailureEvaluation {
	conditionId: string;
	status: FailureConditionStatus;
	evidence: ObjectiveEvidence;
}

export interface ScenarioDeadlineEvidence {
	conditionId: 'deadline-exceeded';
	day: number;
	dayLimit: number;
}

export type ScenarioRiskProjection =
	| { kind: 'condition'; conditionId: string; distance: number; triggered: boolean }
	| { kind: 'deadline'; daysRemaining: number; triggered: boolean };

export interface ScenarioScoreProjection {
	score: number;
	medal: ScenarioMedal;
	componentPoints: number[];
}

export interface ScenarioEvaluation {
	day: number;
	required: ScenarioObjectiveEvaluation[];
	optional: ScenarioObjectiveEvaluation[];
	failures: ScenarioFailureEvaluation[];
	deadline: { triggered: boolean; evidence: ScenarioDeadlineEvidence } | null;
	risks: ScenarioRiskProjection[];
	projection: ScenarioScoreProjection;
}

export interface ScenarioResult {
	definition: ScenarioDefinitionRef;
	seed: number;
	eligibility: ScenarioEligibility;
	outcome: 'completed' | 'failed' | 'abandoned';
	completionDay: number;
	score: number;
	medal: ScenarioMedal | null;
	evaluation: ScenarioEvaluation;
}

export interface ScenarioRun {
	definition: ScenarioDefinitionRef;
	seed: number;
	eligibility: ScenarioEligibility;
	status: ScenarioRunStatus;
	game: GameState;
	evaluation: ScenarioEvaluation;
	result: ScenarioResult | null;
}

export interface ScenarioDiagnostic {
	code: string;
	path: string;
	value: unknown;
	detail: string;
}

export type ScenarioOperationErrorCode =
	| 'invalid-definition'
	| 'invalid-share-code'
	| 'forbidden-command'
	| 'forbidden-content'
	| 'stale-definition'
	| 'persistence-read-failed'
	| 'persistence-write-failed'
	| 'terminal-run'
	| 'missing-run'
	| 'setup-invariant-failed';

export interface ScenarioOperationError {
	code: ScenarioOperationErrorCode;
	diagnostics: ScenarioDiagnostic[];
}

export type ScenarioOperationResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: ScenarioOperationError };
```

Add the independently versioned persistence envelope:

```ts
export interface ScenarioRunRecord {
	scenarioSchemaVersion: number;
	gameSchemaVersion: number;
	run: Omit<ScenarioRun, 'game'>;
	game: unknown;
}

export interface ScenarioBestResultRecord {
	scenarioSchemaVersion: number;
	result: ScenarioResult;
}

export interface ScenarioStoreSnapshot {
	schemaVersion: number;
	activeRunsByScenarioId: Partial<Record<ScenarioId, ScenarioRunRecord>>;
	bestResultsByDefinitionKey: Partial<Record<ScenarioDefinitionKey, ScenarioBestResultRecord>>;
}

export interface ScenarioPersistenceSummary {
	activeRunsByScenarioId: Partial<Record<ScenarioId, ScenarioRun>>;
	bestResultsByDefinitionKey: Partial<Record<ScenarioDefinitionKey, ScenarioResult>>;
	diagnostics: ScenarioDiagnostic[];
}

export interface ScenarioCommitOutcome {
	activeRun: ScenarioRun | null;
	terminalResult: ScenarioResult | null;
	bestUpdated: boolean;
}
```

Add the stable catalog seam now so share-code, route, and component tasks can compile before Task 16 publishes data:

```ts
export const SCENARIO_CATALOG = [] as const satisfies readonly ScenarioDefinition[];

export interface ScenarioCatalogEntry {
	definition: ScenarioDefinition;
	available: boolean;
	diagnostics: ScenarioDiagnostic[];
}

export function listScenarioCatalogEntries(): readonly ScenarioCatalogEntry[] {
	return [];
}

export function listCurrentScenarioDefinitions(): readonly ScenarioDefinition[] {
	return SCENARIO_CATALOG;
}

export function resolveScenarioDefinition(
	_ref: ScenarioDefinitionRef
): ScenarioDefinition | undefined {
	return undefined;
}

export function currentScenarioDefinition(_scenarioId: ScenarioId): ScenarioDefinition | undefined {
	return undefined;
}
```

- [ ] **Step 5: Run the contract spec and typecheck**

```bash
rtk bun run test:unit -- src/lib/scenarios/types.spec.ts --run
rtk bun run check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/lib/scenarios/types.ts src/lib/scenarios/types.spec.ts src/lib/scenarios/catalog.ts
rtk git commit -m "feat: define scenario domain contracts"
```

---

### Task 3: Implement canonical share codes

**Files:**
- Create: `src/lib/scenarios/shareCode.ts`
- Create: `src/lib/scenarios/shareCode.spec.ts`

**Interfaces:**

```ts
export interface DecodedScenarioShareCode {
	definition: ScenarioDefinitionRef;
	seed: number;
	eligibility: ScenarioEligibility;
	canonicalCode: string;
}

export type ShareCodeDecodeResult =
	| { ok: true; value: DecodedScenarioShareCode }
	| { ok: false; code: 'malformed' | 'unknown-scenario' | 'unsupported-version' | 'invalid-seed' | 'checksum-mismatch' };

export function encodeScenarioShareCode(definition: ScenarioDefinitionRef, seed: number): string;
export function decodeScenarioShareCode(
	input: string,
	resolveDefinition?: (ref: ScenarioDefinitionRef) => ScenarioDefinition | undefined
): ShareCodeDecodeResult;
```

- [ ] **Step 1: Write failing table tests**

Cover canonical round-trip, mixed-case and surrounding whitespace, official/custom eligibility, scenario IDs containing dots, non-canonical decimal/base36 input, seed `0`, max+1 seed, unsupported versions, altered checksum, and malformed field counts. Include an independent FNV-1a vector so encode/decode cannot share the same bug unnoticed.

The independent vector is `FNV-1a-32("hello") === 0x4f9f2cab`.

```ts
it.each([
	['first-profit', 1, 280_001],
	['import-squeeze', 1, 280_002],
	['local-lifeline', 1, 2_147_483_646]
])('round-trips %s version %i seed %i', (scenarioId, version, seed) => {
	const code = encodeScenarioShareCode({ scenarioId: scenarioId as ScenarioId, version }, seed);
	const decoded = decodeScenarioShareCode(code, resolveFixtureDefinition);
	expect(decoded).toEqual({
		ok: true,
		value: {
			definition: { scenarioId, version },
			seed,
			eligibility: seed === resolveFixtureDefinition({ scenarioId, version })!.officialSeed ? 'ranked' : 'unranked',
			canonicalCode: code
		}
	});
});
```

- [ ] **Step 2: Confirm the module-not-found failure**

```bash
rtk bun run test:unit -- src/lib/scenarios/shareCode.spec.ts --run
```

- [ ] **Step 3: Implement the exact format**

- Canonical preimage: `SC1.<lowercase-id>.<decimal-version>.<lowercase-base36-seed>`.
- Checksum: unsigned 32-bit FNV-1a over UTF-8 bytes, lowercase base36, left-padded to seven characters.
- Decoder: trim, lowercase input fields for parsing, require five fields, validate before persistence, then re-encode and compare the canonical checksum.
- Accept mixed case but reject seed `0` instead of normalizing it.

```ts
function fnv1a32(value: string): number {
	let hash = 0x811c9dc5;
	for (const byte of new TextEncoder().encode(value)) {
		hash ^= byte;
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash >>> 0;
}
```

- [ ] **Step 4: Verify**

```bash
rtk bun run test:unit -- src/lib/scenarios/shareCode.spec.ts --run
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/scenarios/shareCode.ts src/lib/scenarios/shareCode.spec.ts
rtk git commit -m "feat: add scenario share codes"
```

---

### Task 4: Validate definitions and closed blueprints

**Files:**
- Create: `src/lib/scenarios/validation.ts`
- Create: `src/lib/scenarios/validation.spec.ts`

**Interfaces:**

```ts
export function validateScenarioDefinition(definition: unknown): ScenarioDiagnostic[];
export function assertValidScenarioDefinition(definition: unknown): asserts definition is ScenarioDefinition;
export function sortScenarioDiagnostics(diagnostics: readonly ScenarioDiagnostic[]): ScenarioDiagnostic[];
```

- [ ] **Step 1: Write the failing validator matrix**

Use one valid inline definition and mutate one field per test. Cover all validation groups from the spec: ID/version/seed/day limit, unknown blueprint keys, duplicate refs, invalid content references, target-level range, product unlocks, store cap, rail level/topology, warehouse capacity, command/modifier support, metric/window support, missing required objectives, duplicate objective IDs, score bonus total, medal thresholds, excluded referenced content, and unavailable local-production paths.

```ts
it('returns every diagnostic in stable path/code order', () => {
	const invalid = {
		...validDefinition(),
		id: 'Bad.Id',
		officialSeed: 0,
		dayLimit: 0
	};

	expect(validateScenarioDefinition(invalid).map(({ path, code }) => ({ path, code }))).toEqual([
		{ path: 'dayLimit', code: 'invalid-positive-integer' },
		{ path: 'id', code: 'invalid-scenario-id' },
		{ path: 'officialSeed', code: 'invalid-seed' }
	]);
});
```

- [ ] **Step 2: Confirm the failure**

```bash
rtk bun run test:unit -- src/lib/scenarios/validation.spec.ts --run
```

Expected: module resolution fails.

- [ ] **Step 3: Implement closed-object and reference validation**

Define exact allowed-key sets for the definition, blueprint, every override record, content rules, modifier variants, metric-query variants, and score variants. Reject rather than ignore unknown fields. Use catalog maps from `archetypes.ts`, `industry.ts`, `leveling.ts`, and `world.ts`; do not duplicate their ID registries.

Every diagnostic must have:

```ts
interface ScenarioDiagnostic {
	code: string;
	path: string;
	value: unknown;
	detail: string;
}
```

Sort by `path` using the plain code-unit comparator and then by `code` with the same comparator.

- [ ] **Step 4: Implement metric/window and score validation**

Maintain one registry that states the windows supported by each metric. Enforce complete trailing windows only for metrics whose condition sets `requiresCompleteWindow: true`. Validate fixed windows as inclusive, positive report days not beyond `dayLimit`.

Enforce:

```ts
const BRONZE_SCORE = 500;
const MAX_SCORE = 1_000;
// Sum of every score component's points must equal 500.
// 500 < silver < gold <= 1_000.
```

- [ ] **Step 5: Verify the full matrix**

```bash
rtk bun run test:unit -- src/lib/scenarios/validation.spec.ts --run
```

Expected: PASS with all diagnostics asserted by exact path and code.

- [ ] **Step 6: Commit**

```bash
rtk git add src/lib/scenarios/validation.ts src/lib/scenarios/validation.spec.ts
rtk git commit -m "feat: validate scenario definitions"
```

---

### Task 5: Build deterministic curated starting games

**Files:**
- Create: `src/lib/scenarios/setup.ts`
- Create: `src/lib/scenarios/setup.spec.ts`
- Modify: `src/lib/scenarios/validation.ts`
- Modify: `src/lib/scenarios/validation.spec.ts`

**Interfaces:**

```ts
export type BuildScenarioGameResult =
	| { ok: true; game: GameState; refs: ScenarioSetupRefs }
	| { ok: false; diagnostics: ScenarioDiagnostic[] };

export interface ScenarioSetupRefs {
	storeIdsByRef: Readonly<Record<string, string>>;
	buildingIdsByRef: Readonly<Record<string, string>>;
}

export function buildScenarioGame(
	definition: ScenarioDefinition,
	seed: number
): BuildScenarioGameResult;
```

- [ ] **Step 1: Write failing setup tests**

Cover explicit seed forwarding, repeatability, RNG state, every override field, unknown refs, transient reserve restoration, target-level parity, authored rail ordering, overlapping/invalid rail cells, inventory/capacity checks, and initial evaluation input remaining at day 1 with no reports.

The level parity regression must compare against ordinary upgrades:

```ts
it('materializes a level-4 electronics store through normal upgrades', () => {
	const result = buildScenarioGame(importSqueezeFixture(), 280_002);
	expect(result.ok).toBe(true);
	if (!result.ok) return;

	let ordinary = createFoundingFixtureGame('electronics', 280_002);
	ordinary = { ...ordinary, cash: 1_000_000 };
	ordinary = upgradeStore(ordinary, 'store-1');
	ordinary = upgradeStore(ordinary, 'store-1');
	ordinary = upgradeStore(ordinary, 'store-1');

	const scenarioStore = result.game.stores[0]!;
	const ordinaryStore = ordinary.stores[0]!;
	expect(scenarioStore.level).toBe(4);
	expect(scenarioStore.products.map((product) => product.categoryId)).toEqual(['games', 'accessories']);
	expect(scenarioStore.staffCapacity).toBe(ordinaryStore.staffCapacity);
	expect(scenarioStore.stockHealth).toBe(ordinaryStore.stockHealth);
});
```

- [ ] **Step 2: Confirm the failure**

```bash
rtk bun run test:unit -- src/lib/scenarios/setup.spec.ts --run
```

- [ ] **Step 3: Implement the ordered setup pipeline**

Implement the nine setup stages in the spec in the same order. The transient reserve must be calculated from existing setup/upgrade cost helpers, temporarily added, and then removed by restoring authored cash/debt. Do not hard-code a reserve amount.

Use normal transitions:

- `createFoundingGameAtTile` for the founding store;
- `buildIndustrialBuilding` for authored buildings;
- repeated `upgradeStore` for `targetLevel`;
- direct rail-cell installation only after placement validation, sorted by city ID, then `y`, then `x`;
- `calculateStockHealth` after product overrides;
- `getWarehouseCapacity` plus warehouse pressure recalculation after building placement.

Map setup refs immediately after each normal transition by comparing the appended store/building ID.

- [ ] **Step 4: Add built-state validation**

After construction, call `validateCurrentGameState` once that export exists in Task 9. Until Task 9 lands, keep the final state invariant check local to `setup.ts`; Task 9 replaces it with the shared strict validator. Validate store/building refs, placement footprints, rail reachability, store cap, product unlocks, stock health, and warehouse capacity before returning `ok: true`.

- [ ] **Step 5: Verify setup and definition tests**

```bash
rtk bun run test:unit -- src/lib/scenarios/setup.spec.ts src/lib/scenarios/validation.spec.ts --run
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/lib/scenarios/setup.ts src/lib/scenarios/setup.spec.ts src/lib/scenarios/validation.ts src/lib/scenarios/validation.spec.ts
rtk git commit -m "feat: build curated scenario starts"
```

---

### Task 6: Thread explicit simulation rules into both import paths

**Files:**
- Create: `src/lib/game/simulationRules.ts`
- Create: `src/lib/game/simulationRules.spec.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/game/industryProduction.ts`
- Modify: `src/lib/game/industryProduction.spec.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/stock.spec.ts`

**Interfaces:**

```ts
export type ImportCostScope = 'retail-product' | 'industrial-material';

export interface ImportCostMultiplierRule {
	scope: ImportCostScope;
	target: { kind: 'all' } | { kind: 'ids'; ids: readonly string[] };
	multiplier: number;
}

export interface SimulationRules {
	importCostMultipliers: readonly ImportCostMultiplierRule[];
}

export const DEFAULT_SIMULATION_RULES: Readonly<SimulationRules>;
export function getImportCostMultiplier(
	rules: SimulationRules,
	scope: ImportCostScope,
	targetId: string
): number;
```

Change signatures to:

```ts
export function simulateDay(
	game: GameState,
	rules: SimulationRules = DEFAULT_SIMULATION_RULES
): GameState;

export function simulateIndustryProduction(
	game: GameState,
	rules: SimulationRules = DEFAULT_SIMULATION_RULES
): { game: GameState; report: DailyProductionReport };

export function applyWeeklyImports(input: {
	game: GameState;
	storeReports: Map<string, DailyProductReport[]>;
	rules?: SimulationRules;
}): WeeklyImportResult;
```

- [ ] **Step 1: Write failing rules and default-equivalence tests**

Tests must prove:

- omitted rules deep-equal explicit `DEFAULT_SIMULATION_RULES`;
- `retail-product` doubles actual import spend for `games`/`accessories` only;
- `industrial-material` doubles paid-input fallback for selected materials only;
- the same text ID in the other scope does not match;
- sales-time `costOfGoods` is unchanged;
- multipliers combine in definition order only if validation permits that combination; V1 validation should reject overlapping matching rules, so runtime returns one matched multiplier.

```ts
it('keeps omitted and explicit defaults deeply equal', () => {
	const game = createNewGame('electronics', 280_002);
	expect(simulateDay(game)).toEqual(simulateDay(game, DEFAULT_SIMULATION_RULES));
});
```

- [ ] **Step 2: Confirm the focused failures**

```bash
rtk bun run test:unit -- src/lib/game/simulationRules.spec.ts src/lib/game/simulateDay.spec.ts src/lib/game/industryProduction.spec.ts src/lib/game/stock.spec.ts --run
```

- [ ] **Step 3: Implement immutable rules and retail import cost**

Freeze the default object and its empty array. In `applyWeeklyImports`, compute:

```ts
const multiplier = getImportCostMultiplier(rules, 'retail-product', category.id);
const spend = Math.round(importedUnits * category.importCost * multiplier);
```

Keep `warehouseValue`, `costOfGoods`, and local material valuation unchanged.

- [ ] **Step 4: Implement industrial paid-input cost**

For each paid input shortage, compute the movement value from the whole quantity so the multiplier is applied before rounding:

```ts
const multiplier = getImportCostMultiplier(rules, 'industrial-material', input.materialId);
const importValue = Math.round(shortage * MATERIALS[input.materialId].importCost * multiplier);
const importMovement = createMovementWithValue(input.materialId, shortage, importValue, 'import');
```

Pass `rules` from `simulateDay` only to `simulateIndustryProduction` and `applyWeeklyImports`, never to `simulateProductSalesForCity`.

- [ ] **Step 5: Verify all affected game specs**

```bash
rtk bun run test:unit -- src/lib/game/simulationRules.spec.ts src/lib/game/simulateDay.spec.ts src/lib/game/industryProduction.spec.ts src/lib/game/stock.spec.ts --run
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/lib/game/simulationRules.ts src/lib/game/simulationRules.spec.ts src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts src/lib/game/industryProduction.ts src/lib/game/industryProduction.spec.ts src/lib/game/stock.ts src/lib/game/stock.spec.ts
rtk git commit -m "feat: add explicit simulation rules"
```

---

### Task 7: Evaluate registered metrics and canonical evidence

**Files:**
- Create: `src/lib/scenarios/metrics.ts`
- Create: `src/lib/scenarios/metrics.spec.ts`

**Interfaces:**

```ts
export interface MetricEvaluation {
	actual: number;
	contributingIds: string[];
	windowComplete: boolean;
}

export function evaluateMetric(
	game: GameState,
	query: ScenarioMetricQuery,
	window: ScenarioMetricWindow,
	requiresCompleteWindow?: boolean
): MetricEvaluation;

export function evaluateScenarioConditions(
	definition: ScenarioDefinition,
	game: GameState,
	terminal: boolean
): Omit<ScenarioEvaluation, 'projection'>;

export function encodeEvidenceSegment(value: string): string;
export function validateScenarioReportInvariants(reports: readonly DailyReport[]): ScenarioDiagnostic[];
```

- [ ] **Step 1: Write failing metric/window tests**

Cover every comparator, every metric query, all four windows, empty-window neutral values, incomplete trailing windows, strictly increasing report days, duplicate store/product IDs, local share with zero denominator, exact import-cycle counting through `isImportDay`, current cash after non-day commands, terminal pending-to-missed conversion, and stable contributing-ID sorting.

Also cover pure failure-risk projections: distance to every configured failure boundary plus deadline days remaining. Projections must consume the same evidence as evaluation, contain no locale formatting, and never mutate the run.

```ts
it('derives collision-safe canonical product evidence IDs', () => {
	expect(productEvidenceId(7, 'store/a', 'water/large')).toBe(
		'report:7/store:store%2Fa/product:water%2Flarge'
	);
});

it('keeps an incomplete three-report objective pending', () => {
	const evaluation = evaluateScenarioConditions(
		firstProfitFixture(),
		gameWithReportIncome([40, 30]),
		false
	);
	expect(evaluation.required[1]).toMatchObject({
		status: 'pending',
		evidence: { actual: 2, target: 3 }
	});
});
```

- [ ] **Step 2: Confirm the module-not-found failure**

```bash
rtk bun run test:unit -- src/lib/scenarios/metrics.spec.ts --run
```

- [ ] **Step 3: Implement one registered metric catalog**

Each registry entry owns supported windows, neutral value, completeness behavior, and evaluator. Filter reports inclusively and derive IDs without mutating reports. Use `encodeURIComponent` through one exported helper for every string segment. Sort contributing IDs with plain `<`/`>` comparison.

Emit only these canonical report evidence forms:

```text
report:<day>
report:<day>/store:<percent-encoded-store-id>
report:<day>/store:<percent-encoded-store-id>/product:<percent-encoded-category-id>
```

Do not add a report ID or pre-refill stockout field to `GameState`; V1 has no stockout-history metric.

Use this local-supply formula over the same selected reports/categories:

```ts
const denominator = warehouseUnits + importedUnits;
const localShare = denominator === 0 ? 0 : warehouseUnits / denominator;
```

- [ ] **Step 4: Implement status semantics**

- Objective condition: `satisfied` when comparator passes; otherwise `pending` until terminal; then `missed`.
- Failure condition: `triggered` when comparator passes; otherwise `inactive`.
- Evidence is emitted for every condition status.
- Evaluation order follows definition order, but every contributing-ID list and report-derived traversal is stable.

- [ ] **Step 5: Verify**

```bash
rtk bun run test:unit -- src/lib/scenarios/metrics.spec.ts --run
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/lib/scenarios/metrics.ts src/lib/scenarios/metrics.spec.ts
rtk git commit -m "feat: evaluate scenario metrics"
```

---

### Task 8: Score runs and execute every typed scenario command

**Files:**
- Create: `src/lib/scenarios/scoring.ts`
- Create: `src/lib/scenarios/scoring.spec.ts`
- Create: `src/lib/scenarios/capabilities.ts`
- Create: `src/lib/scenarios/capabilities.spec.ts`
- Create: `src/lib/scenarios/runtime.ts`
- Create: `src/lib/scenarios/runtime.spec.ts`

**Interfaces:**

```ts
export function calculateScenarioScore(
	definition: ScenarioDefinition,
	game: GameState,
	evaluation: Omit<ScenarioEvaluation, 'projection'>
): number;
export function calculateScenarioScoreProjection(
	definition: ScenarioDefinition,
	game: GameState,
	evaluation: Omit<ScenarioEvaluation, 'projection'>
): ScenarioScoreProjection;
export function medalForScore(
	definition: ScenarioDefinition,
	status: ScenarioRunStatus,
	score: number
): ScenarioMedal | null;
export function pointsToNextMedal(
	definition: ScenarioDefinition,
	score: number
): { medal: 'silver' | 'gold'; points: number } | null;
export function shouldReplaceBestResult(
	existing: ScenarioResult | null,
	candidate: ScenarioResult
): boolean;

export function isScenarioCommandAllowed(
	definition: ScenarioDefinition,
	run: ScenarioRun,
	command: ScenarioCommand
): ScenarioCapabilityResult;
export function isScenarioContentAllowed(
	definition: ScenarioDefinition,
	query: ScenarioContentQuery
): boolean;

export type ExecuteScenarioCommandResult =
	| { ok: true; changed: false; run: ScenarioRun }
	| { ok: true; changed: true; run: ScenarioRun }
	| { ok: false; code: 'forbidden-command' | 'forbidden-content' | 'terminal-run' | 'stale-definition' };

export function startScenario(definition: ScenarioDefinition, seed: number): ScenarioStartResult;
export function restartScenario(run: ScenarioRun, definition: ScenarioDefinition): ScenarioStartResult;
export function abandonScenario(run: ScenarioRun): ScenarioRun;
export function executeScenarioCommand(
	run: ScenarioRun,
	definition: ScenarioDefinition,
	command: ScenarioCommand
): ExecuteScenarioCommandResult;
export function evaluateScenario(
	definition: ScenarioDefinition,
	game: GameState,
	terminal: boolean
): ScenarioEvaluation;
```

Use these exact content/capability query results:

```ts
export type ScenarioContentQuery =
	| { kind: 'city'; cityId: WorldCityId }
	| { kind: 'archetype'; archetypeId: ArchetypeId }
	| { kind: 'product'; categoryId: string }
	| { kind: 'material'; materialId: MaterialId }
	| { kind: 'building'; buildingTypeId: IndustrialBuildingTypeId }
	| { kind: 'retail-placement'; cityId: WorldCityId; tileId: string; archetypeId: ArchetypeId }
	| {
			kind: 'industrial-placement';
			cityId: WorldCityId;
			tileId: string;
			buildingTypeId: IndustrialBuildingTypeId;
	  };

export type ScenarioCapabilityResult =
	| { allowed: true }
	| { allowed: false; code: 'forbidden-command' | 'forbidden-content'; path: string };
```

- [ ] **Step 1: Write failing scoring tests**

Cover integer rounding, clamping, inverse/lower-is-better anchors, fixed optional points, remaining-days points, 500 clear floor, 700/850 medals, failed/abandoned no-medal behavior, equal-score best retention, cross-version non-comparison, and unranked best rejection.

- [ ] **Step 2: Write failing capability/runtime tests**

Use one test per command kind. Prove price and inventory-target permissions are independent, `selectWorldCity` is allowed only for opened allowlisted cities, exact industrial placement is enforced, automatic world reveals still occur after `advanceDay`, and all launch definitions can accept the normal deterministic decision stream.

Add command-order tests for:

- no-op and rejection: unchanged run, no refreshed evaluation;
- non-day decision causing negative cash: immediate failure;
- simultaneous success/failure: failure wins;
- completion after policy/product/staff commands;
- deadline only after `advanceDay`;
- restart preserves the active run's stored version and selected seed;
- abandon creates no medal or best-eligible result;
- replaying the same command sequence twice deep-equals game, evaluation, result, score, and medal.

- [ ] **Step 3: Confirm both suites fail**

```bash
rtk bun run test:unit -- src/lib/scenarios/scoring.spec.ts src/lib/scenarios/capabilities.spec.ts src/lib/scenarios/runtime.spec.ts --run
```

- [ ] **Step 4: Implement scoring**

Use one normalization helper:

```ts
function normalizePoints(actual: number, zeroAt: number, fullAt: number, points: number): number {
	if (zeroAt === fullAt) return actual >= fullAt ? points : 0;
	const ratio = (actual - zeroAt) / (fullAt - zeroAt);
	return Math.round(Math.min(1, Math.max(0, ratio)) * points);
}
```

For lower-is-better components, the definition supplies `zeroBonusAt > fullBonusAt`; the same formula handles the reversed denominator. Clamp the final score to `0..1000`.

- [ ] **Step 5: Implement capabilities and command dispatch**

Map every command to the existing pure transition. Split `updateStoreProduct` calls so each command constructs only its permitted patch. Compile definition modifiers to `SimulationRules` for `advanceDay`.

`evaluateScenario` combines `evaluateScenarioConditions` with `calculateScenarioScoreProjection`; components consume the stored projection and never recalculate score or medal.

After a changed transition:

1. evaluate conditions;
2. freeze failure if any failure triggered;
3. otherwise freeze completion if every required objective is satisfied;
4. otherwise apply the deadline only for `advanceDay`;
5. otherwise keep the active run with refreshed evaluation.

Terminal runs include a `ScenarioResult`; active runs keep `result: null`.

- [ ] **Step 6: Verify all scenario-domain suites**

```bash
rtk bun run test:unit -- src/lib/scenarios --run
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add src/lib/scenarios/scoring.ts src/lib/scenarios/scoring.spec.ts src/lib/scenarios/capabilities.ts src/lib/scenarios/capabilities.spec.ts src/lib/scenarios/runtime.ts src/lib/scenarios/runtime.spec.ts
rtk git commit -m "feat: execute and score scenario runs"
```

---

### Task 9: Split game migration, sandbox normalization, and strict validation

**Files:**
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify: `src/lib/persistence/saveCodec.railValidation.spec.ts`
- Modify: `src/lib/scenarios/setup.ts`
- Modify: `src/lib/scenarios/setup.spec.ts`

**Interfaces:**

```ts
export function migrateSavedGame(value: unknown, sourceGameSchemaVersion: number): unknown;
export function normalizeSandboxSavedGame(value: unknown): unknown;
export function validateCurrentGameState(value: unknown): GameState;
```

Sandbox record validation becomes:

```ts
const migratedGame = migrateSavedGame(record.game, schemaVersion);
const normalizedGame = normalizeSandboxSavedGame(migratedGame);
const game = validateCurrentGameState(normalizedGame);
```

- [ ] **Step 1: Write failing boundary tests**

Add three paired fixtures:

1. a current game with stale world progress;
2. a store whose placement needs the existing 28x24 sandbox repair path;
3. an over-capacity building inventory that sandbox loading clamps.

For each fixture, assert sandbox record loading preserves today's repair behavior while `validateCurrentGameState` alone either returns the exact valid state or rejects the repair-requiring state.

```ts
it('does not repair current-schema scenario games', () => {
	const current = createCurrentGameFixture();
	const stale = { ...current, world: staleWorldProgress() };
	expect(() => validateCurrentGameState(stale)).toThrow(SaveDataError);
	expect(validateSaveRecord(createSaveRecordFixture(stale)).game.world).toEqual(
		refreshWorldProgress(stale).world
	);
});
```

Also add one migration-chain test per existing versions 4 through 9 to prove extraction does not skip a step.

- [ ] **Step 2: Confirm the failures**

```bash
rtk bun run test:unit -- src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveCodec.railValidation.spec.ts --run
```

- [ ] **Step 3: Extract bare-game migrations without changing schema 10**

Keep `SAVE_SCHEMA_VERSION = 10`. Refactor each existing record migration so its game transformation is callable by `migrateSavedGame`; retain record metadata migration in the record pipeline. Reject unsupported source versions with `SaveDataError`.

- [ ] **Step 4: Separate repair normalization from strict validation**

Move `normalizeSavedGame`, `refreshWorldProgress`, placement relocation, and `clampInventoryToRecipe` into `normalizeSandboxSavedGame`. `validateCurrentGameState` must validate the supplied state without changing it and must return a deep clone/equivalent current `GameState`.

Add strict invariants for report day ordering, unique store IDs per report, and unique product category IDs per store report so scenario evidence is safe.

- [ ] **Step 5: Switch scenario setup to strict validation**

Replace Task 5's local final-state validation with `validateCurrentGameState`. Assert the returned game deep-equals the built game.

- [ ] **Step 6: Verify persistence and setup suites**

```bash
rtk bun run test:unit -- src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveCodec.railValidation.spec.ts src/lib/scenarios/setup.spec.ts --run
```

Expected: PASS and existing sandbox fixtures remain unchanged.

- [ ] **Step 7: Commit**

```bash
rtk git add src/lib/persistence/saveCodec.ts src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveCodec.railValidation.spec.ts src/lib/scenarios/setup.ts src/lib/scenarios/setup.spec.ts
rtk git commit -m "refactor: split strict game validation"
```

---

### Task 10: Add the scenario codec and queued repository

**Files:**
- Create: `src/lib/persistence/scenarioRepository.ts`
- Create: `src/lib/persistence/scenarioCodec.ts`
- Create: `src/lib/persistence/scenarioCodec.spec.ts`
- Create: `src/lib/persistence/scenarioStoreRepository.ts`
- Create: `src/lib/persistence/scenarioRepository.spec.ts`
- Create: `src/lib/persistence/scenarioMemoryRepository.ts`

**Interfaces:**

```ts
export interface ScenarioRepository {
	getSummary(): Promise<ScenarioPersistenceSummary>;
	loadActiveRun(scenarioId: ScenarioId): Promise<ScenarioRun | null>;
	saveActiveRun(run: ScenarioRun): Promise<ScenarioCommitOutcome>;
	removeActiveRun(scenarioId: ScenarioId): Promise<void>;
	commitTerminalRun(run: ScenarioRun): Promise<ScenarioCommitOutcome>;
}

export interface ScenarioStoreDriver {
	read(): Promise<DecodeScenarioStoreResult>;
	write(snapshot: ScenarioStoreSnapshot): Promise<void>;
}

export const SCENARIO_STORE_SCHEMA_VERSION = 1;
export const SCENARIO_RUN_SCHEMA_VERSION = 1;
```

- [ ] **Step 1: Write failing codec tests**

Cover empty snapshot, active/completed/failed/abandoned records, scenario-envelope mismatch, embedded-game version mismatch, definition-key mismatch, unsupported definition version, corrupt-entry isolation, exact current-schema deep equality, and an older embedded-game migration that does not call sandbox normalization.

The codec result must preserve valid entries and return diagnostics for invalid entries:

```ts
export interface DecodeScenarioStoreResult {
	snapshot: ScenarioStoreSnapshot;
	diagnostics: ScenarioDiagnostic[];
}
```

- [ ] **Step 2: Write failing repository tests**

Cover one active run per scenario, isolation between scenarios, save/load/resume, restart replacement, abandon removal, ranked/custom result handling, per-version best keys, equal-score retention, queued ordering, and terminal outcomes for failed, unranked, non-best, and new-best runs.

Use a counting driver to assert terminal commit performs exactly one read, one write, and one queued mutation.

- [ ] **Step 3: Confirm both suites fail**

```bash
rtk bun run test:unit -- src/lib/persistence/scenarioCodec.spec.ts src/lib/persistence/scenarioRepository.spec.ts --run
```

- [ ] **Step 4: Implement codec boundaries**

Scenario loading must call:

```ts
const migrated = migrateSavedGame(record.game, record.gameSchemaVersion);
const game = validateCurrentGameState(migrated);
```

If `record.gameSchemaVersion === SAVE_SCHEMA_VERSION`, reject unless `game` deep-equals `record.game`. Then validate definition/run invariants. Never call `normalizeSandboxSavedGame`.

Canonical best key:

```ts
export function scenarioDefinitionKey(ref: ScenarioDefinitionRef): ScenarioDefinitionKey {
	return `${ref.scenarioId}@${ref.version}`;
}
```

- [ ] **Step 5: Implement the queued repository**

Mirror the proven mutation-queue pattern in `SaveRepositoryFromDriver`, but keep the class scenario-specific. `commitTerminalRun` must remove the active run, conditionally update only the matching ranked best, write once, and return the terminal result even when it is not persisted as best.

```ts
return {
	activeRun: null,
	terminalResult: run.result,
	bestUpdated
};
```

- [ ] **Step 6: Implement the memory driver and verify**

```bash
rtk bun run test:unit -- src/lib/persistence/scenarioCodec.spec.ts src/lib/persistence/scenarioRepository.spec.ts --run
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add src/lib/persistence/scenarioRepository.ts src/lib/persistence/scenarioCodec.ts src/lib/persistence/scenarioCodec.spec.ts src/lib/persistence/scenarioStoreRepository.ts src/lib/persistence/scenarioRepository.spec.ts src/lib/persistence/scenarioMemoryRepository.ts
rtk git commit -m "feat: persist scenario runs and results"
```

---

### Task 11: Add browser, Tauri, and runtime repository adapters

**Files:**
- Create: `src/lib/persistence/browserScenarioRepository.ts`
- Create: `src/lib/persistence/browserScenarioRepository.spec.ts`
- Create: `src/lib/persistence/tauriScenarioRepository.ts`
- Create: `src/lib/persistence/tauriScenarioRepository.spec.ts`
- Create: `src/lib/persistence/scenarioRepositoryFactory.ts`
- Create: `src/lib/persistence/scenarioRepositoryFactory.spec.ts`

**Constants:**

```ts
export const BROWSER_SCENARIO_STORAGE_KEY = 'serpens.scenarios.v1';
export const SCENARIO_STORE_FILE = 'serpens-scenarios.json';
export const SCENARIO_STORE_KEY = 'scenarios';
```

- [ ] **Step 1: Write failing adapter parity tests**

Run the same repository contract against memory, browser, and Tauri drivers. Assert browser writes never touch `serpens.saves.v2`; Tauri writes never touch the `saves` key; malformed scenario data never falls back to sandbox data.

- [ ] **Step 2: Write the failing factory tests**

Mirror `saveRepositoryFactory.spec.ts`: browser by default, dynamically imported Tauri repository only when Tauri is detected, and no static Tauri-store import in the browser path.

- [ ] **Step 3: Confirm failures**

```bash
rtk bun run test:unit -- src/lib/persistence/browserScenarioRepository.spec.ts src/lib/persistence/tauriScenarioRepository.spec.ts src/lib/persistence/scenarioRepositoryFactory.spec.ts --run
```

- [ ] **Step 4: Implement adapters by following existing save drivers**

- Browser driver parses JSON, decodes entries independently, and writes a validated snapshot.
- Tauri driver uses `load(SCENARIO_STORE_FILE, { defaults: {}, autoSave: false })`, stores under `SCENARIO_STORE_KEY`, and calls `save()` after `set()`.
- Factory uses `$app/environment` plus `isTauri()` and dynamically imports `tauriScenarioRepository.ts`.

- [ ] **Step 5: Verify all persistence tests**

```bash
rtk bun run test:unit -- src/lib/persistence --run
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
rtk git add src/lib/persistence/browserScenarioRepository.ts src/lib/persistence/browserScenarioRepository.spec.ts src/lib/persistence/tauriScenarioRepository.ts src/lib/persistence/tauriScenarioRepository.spec.ts src/lib/persistence/scenarioRepositoryFactory.ts src/lib/persistence/scenarioRepositoryFactory.spec.ts
rtk git commit -m "feat: add scenario persistence adapters"
```

---

### Task 12: Refactor the route onto a mode-aware persistence-gated commit seam

**Files:**
- Create: `src/lib/scenarios/commandGate.ts`
- Create: `src/lib/scenarios/commandGate.spec.ts`
- Modify: `src/routes/+page.svelte`
- Create: `src/routes/page.svelte.spec.ts`

**Interfaces:**

```ts
export class ScenarioCommandGate {
	get busy(): boolean;
	run<T>(operation: () => Promise<T>): Promise<{ accepted: true; value: T } | { accepted: false; code: 'busy' }>;
}
```

Route state becomes:

```ts
let sandboxGame = $state<GameState | null>(null);
let activeScenarioRun = $state<ScenarioRun | null>(null);
let lastScenarioResult = $state<ScenarioResult | null>(null);
let lastScenarioBestUpdated = $state(false);
let scenarioOperationError = $state<ScenarioOperationError | null>(null);
let retryScenarioOperation = $state<(() => Promise<void>) | null>(null);
let playMode = $state<'sandbox' | 'scenario'>('sandbox');
let scenarioCommandPending = $state(false);
let game = $derived(playMode === 'scenario' ? activeScenarioRun?.game ?? null : sandboxGame);
```

- [ ] **Step 1: Follow the Svelte MCP documentation flow**

Fetch the sections relevant to runes state/derived values, event handlers, snippets, bindings, and component testing. Record the selected sections in the task notes. Do not edit `+page.svelte` before this step is complete.

- [ ] **Step 2: Write failing command-gate and route-foundation tests**

Use a deferred promise and a full `createNewGame` city snapshot. Assert a second mutation is rejected while the first write is pending, read-only map selection remains callable, publication/SFX happen only after resolution, and write failure leaves the previous committed state visible.

Add sandbox regression tests proving founding placement, autosave resume/manual load, day advance, policy, decision, staff, product, upgrades, retail/industry placement, rail mutation, world selection/opening, and alert-driven city selection still update `sandboxGame` immediately and call the sandbox autosave path.

- [ ] **Step 3: Confirm focused failures**

```bash
rtk bun run test:unit -- src/lib/scenarios/commandGate.spec.ts src/routes/page.svelte.spec.ts --run
```

- [ ] **Step 4: Add the route state and initialization seams**

Initialize both repositories independently. Sandbox auto/manual load publishes only `sandboxGame` and sets `playMode = 'sandbox'`. Scenario resume publishes only `activeScenarioRun`, clears `lastScenarioResult`/`lastScenarioBestUpdated`, and sets `playMode = 'scenario'`.

Keep `game` read-only. Remove every direct `game = ...` assignment.

- [ ] **Step 5: Replace every mutation site with one typed seam**

Inventory and replace all current sites:

- founding/open store and store upgrade;
- industry building/upgrade;
- rail build/upgrade/demolish;
- `advanceDay`, policy, decision;
- hire/assign/unassign/promote;
- selling-price and inventory-target edits as separate commands;
- world select/open and alert-driven city switching;
- sandbox auto/manual load assignments.

In sandbox mode, dispatch the existing pure transition, publish immediately to `sandboxGame`, fire-and-forget autosave, then play SFX on a changed state.

In scenario mode:

1. reject while the gate is busy;
2. call `executeScenarioCommand`;
3. return without write for rejection/no-op;
4. save active or commit terminal through `ScenarioRepository`;
5. publish `activeScenarioRun`, `lastScenarioResult`, and `lastScenarioBestUpdated` only from `ScenarioCommitOutcome`;
6. then play SFX.

Catch repository rejections at this route entry point and translate them to `ScenarioOperationError`; do not expose thrown error text to components. On a write failure, keep the previously committed run visible and store one route-only retry closure that repeats the same command/lifecycle write. Clear the error and retry closure after a successful write or an explicit dismissal.

- [ ] **Step 6: Run the Svelte autofixer and verify**

Run `svelte-autofixer` on the complete changed `+page.svelte` until it returns no issues, then:

```bash
rtk bun run test:unit -- src/lib/scenarios/commandGate.spec.ts src/routes/page.svelte.spec.ts --run
rtk bun run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add src/lib/scenarios/commandGate.ts src/lib/scenarios/commandGate.spec.ts src/routes/+page.svelte src/routes/page.svelte.spec.ts
rtk git commit -m "refactor: add mode-aware game commits"
```

---

### Task 13: Apply capability and pending states to every existing game control

**Files:**
- Modify: `src/lib/components/game/BuildMenu.svelte`
- Modify: `src/lib/components/game/BuildMenu.svelte.spec.ts`
- Modify: `src/lib/components/game/ControlDesk.svelte`
- Modify: `src/lib/components/game/ControlDesk.svelte.spec.ts`
- Modify: `src/lib/components/game/PolicyPanel.svelte`
- Modify: `src/lib/components/game/PolicyPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/DecisionQueue.svelte`
- Modify: `src/lib/components/game/DecisionQueue.svelte.spec.ts`
- Modify: `src/lib/components/game/StaffPanel.svelte`
- Modify: `src/lib/components/game/StaffPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/StoreDetailModal.svelte`
- Modify: `src/lib/components/game/StoreDetailModal.svelte.spec.ts`
- Modify: `src/lib/components/game/StoreStaffPanel.svelte`
- Modify: `src/lib/components/game/StoreStaffPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/StoreStockTable.svelte`
- Modify: `src/lib/components/game/StoreStockTable.svelte.spec.ts`
- Modify: `src/lib/components/game/TileInspector.svelte`
- Modify: `src/lib/components/game/TileInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/IndustryTileInspector.svelte`
- Modify: `src/lib/components/game/IndustryTileInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/RailSegmentInspector.svelte`
- Modify: `src/lib/components/game/RailSegmentInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/WorldMap.svelte`
- Modify: `src/lib/components/game/WorldMap.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/page.svelte.spec.ts`

**Capability contract:**

Every component receives explicit booleans or allowed-ID lists from the route. Components do not import the current scenario or catalog. Sandbox supplies the all-enabled values subject to existing affordability/domain rules; scenario mode derives values through `capabilities.ts` and combines them with `!scenarioCommandPending`.

- [ ] **Step 1: Follow the Svelte MCP documentation flow**

Fetch the runes props/derived state, form-control disabled semantics, event handling, snippets, and component-testing sections before editing any component.

- [ ] **Step 2: Write failing component capability tests**

Add focused tests proving:

- `BuildMenu` hides or disables disallowed retail archetypes and industrial building types and cannot arm a forbidden placement;
- `ControlDesk` disables advance/build/rail commands independently while leaving management/map navigation available;
- `PolicyPanel` and `DecisionQueue` disable their mutating controls while preserving readable content;
- `StaffPanel`/`StoreStaffPanel` independently disable hire, assign, unassign, and promote;
- `StoreStockTable` independently disables selling-price versus reorder/target inputs;
- `TileInspector`, `IndustryTileInspector`, and `RailSegmentInspector` combine permission, pending, affordability, and normal level constraints;
- `WorldMap` suppresses the challenge unlock prompt and disables `openWorldCity`, while opened allowlisted city selection remains enabled;
- a disabled control never invokes its callback.

Use text explanations for disabled challenge actions; do not rely on color or the HTML disabled state alone.

- [ ] **Step 3: Confirm the focused failures**

```bash
rtk bun run test:unit -- src/lib/components/game/BuildMenu.svelte.spec.ts src/lib/components/game/ControlDesk.svelte.spec.ts src/lib/components/game/PolicyPanel.svelte.spec.ts src/lib/components/game/DecisionQueue.svelte.spec.ts src/lib/components/game/StaffPanel.svelte.spec.ts src/lib/components/game/StoreDetailModal.svelte.spec.ts src/lib/components/game/StoreStaffPanel.svelte.spec.ts src/lib/components/game/StoreStockTable.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts src/lib/components/game/IndustryTileInspector.svelte.spec.ts src/lib/components/game/RailSegmentInspector.svelte.spec.ts src/lib/components/game/WorldMap.svelte.spec.ts --run --project client
```

- [ ] **Step 4: Add explicit component props**

Use these prop boundaries rather than passing a `ScenarioRun` into presentation components:

```ts
interface MutationAvailability {
	pending: boolean;
	advanceDay: boolean;
	resolveDecision: boolean;
	updatePolicy: boolean;
	openWorldCity: boolean;
	openStore: boolean;
	upgradeStore: boolean;
	hireStaff: boolean;
	assignStaff: boolean;
	unassignStaff: boolean;
	promoteStaff: boolean;
	updateStoreSellingPrice: boolean;
	updateStoreInventoryTargets: boolean;
	buildIndustrialBuilding: boolean;
	upgradeIndustrialBuilding: boolean;
	buildRail: boolean;
	upgradeRail: boolean;
	demolishRail: boolean;
}
```

The route also derives allowed archetype/building/placement IDs through `isScenarioContentAllowed`. Keep map/panel open/close, selection, tab, locale, audio, and catalog navigation outside this mutation object.

- [ ] **Step 5: Wire every current control and keyboard path**

Apply the same permission to click handlers and keyboard shortcuts. A hidden/disabled control remains protected by the runtime command check from Task 8. Ensure alert-driven city selection goes through `selectWorldCity`, and challenge unlock prompts do not advertise `openWorldCity` when forbidden.

Preserve the existing `change` emission for product number fields; do not switch to per-keystroke input events.

- [ ] **Step 6: Autofix and verify route/component regressions**

Run `svelte-autofixer` on every changed Svelte file until clean, then:

```bash
rtk bun run test:unit -- src/lib/components/game/BuildMenu.svelte.spec.ts src/lib/components/game/ControlDesk.svelte.spec.ts src/lib/components/game/PolicyPanel.svelte.spec.ts src/lib/components/game/DecisionQueue.svelte.spec.ts src/lib/components/game/StaffPanel.svelte.spec.ts src/lib/components/game/StoreDetailModal.svelte.spec.ts src/lib/components/game/StoreStaffPanel.svelte.spec.ts src/lib/components/game/StoreStockTable.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts src/lib/components/game/IndustryTileInspector.svelte.spec.ts src/lib/components/game/RailSegmentInspector.svelte.spec.ts src/lib/components/game/WorldMap.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client
rtk bun run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add src/lib/components/game/BuildMenu.svelte src/lib/components/game/BuildMenu.svelte.spec.ts src/lib/components/game/ControlDesk.svelte src/lib/components/game/ControlDesk.svelte.spec.ts src/lib/components/game/PolicyPanel.svelte src/lib/components/game/PolicyPanel.svelte.spec.ts src/lib/components/game/DecisionQueue.svelte src/lib/components/game/DecisionQueue.svelte.spec.ts src/lib/components/game/StaffPanel.svelte src/lib/components/game/StaffPanel.svelte.spec.ts src/lib/components/game/StoreDetailModal.svelte src/lib/components/game/StoreDetailModal.svelte.spec.ts src/lib/components/game/StoreStaffPanel.svelte src/lib/components/game/StoreStaffPanel.svelte.spec.ts src/lib/components/game/StoreStockTable.svelte src/lib/components/game/StoreStockTable.svelte.spec.ts src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts src/lib/components/game/IndustryTileInspector.svelte src/lib/components/game/IndustryTileInspector.svelte.spec.ts src/lib/components/game/RailSegmentInspector.svelte src/lib/components/game/RailSegmentInspector.svelte.spec.ts src/lib/components/game/WorldMap.svelte src/lib/components/game/WorldMap.svelte.spec.ts src/routes/+page.svelte src/routes/page.svelte.spec.ts
rtk git commit -m "feat: enforce challenge capabilities in UI"
```

---

### Task 14: Add the catalog, share-code import, and challenge menu states

**Files:**
- Create: `src/lib/components/game/ScenarioCatalog.svelte`
- Create: `src/lib/components/game/ScenarioCatalog.svelte.spec.ts`
- Create: `src/lib/components/game/ScenarioMenuSection.svelte`
- Create: `src/lib/components/game/ScenarioMenuSection.svelte.spec.ts`
- Create: `src/lib/i18n/scenarioCopy.ts`
- Create: `src/lib/i18n/scenarioCopy.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Follow the Svelte MCP documentation flow**

Fetch dialog/focus, event, form, runes, and component-composition sections before editing.

- [ ] **Step 2: Write failing component tests**

Cover:

- three available cards;
- current-version best score/medal;
- ranked versus unranked seed labels;
- Start and Resume primary actions;
- same-version Restart;
- older-version active-run label and confirmed current-version replacement;
- imported-code replacement confirmation;
- prior-version result detail without substituting for current best;
- copy success/failure without assuming clipboard support;
- malformed/unsupported/checksum share-code errors;
- an invalid built-in definition rendered unavailable with localized diagnostic copy;
- persistence failure keeping the prior card/run state and exposing a retry action;
- opening the catalog without mutating or saving sandbox state;
- scenario-mode menu replacing sandbox save controls with details/restart/catalog/abandon.

- [ ] **Step 3: Confirm failures**

```bash
rtk bun run test:unit -- src/lib/components/game/ScenarioCatalog.svelte.spec.ts src/lib/components/game/ScenarioMenuSection.svelte.spec.ts src/lib/i18n/scenarioCopy.spec.ts --run
```

- [ ] **Step 4: Implement localized catalog view models**

`scenarioCopy.ts` formats definition copy keys, official/custom seed labels, objective summaries, diagnostic codes, score/medal labels, and active version differences. Components receive already-evaluated domain data and do not calculate metrics.

Use one stable definition-copy namespace in all three message catalogs:

```text
scenarioDefinitions.firstProfit.title
scenarioDefinitions.firstProfit.summary
scenarioDefinitions.firstProfit.briefing
scenarioDefinitions.firstProfit.strategyHint
scenarioDefinitions.firstProfit.objectives.cumulativeNetIncome
scenarioDefinitions.firstProfit.objectives.positiveIncomeStreak
scenarioDefinitions.firstProfit.failures.negativeCash
scenarioDefinitions.importSqueeze.title
scenarioDefinitions.importSqueeze.summary
scenarioDefinitions.importSqueeze.briefing
scenarioDefinitions.importSqueeze.strategyHint
scenarioDefinitions.importSqueeze.objectives.completedImportCycles
scenarioDefinitions.importSqueeze.objectives.cumulativeNetIncome
scenarioDefinitions.importSqueeze.failures.negativeCash
scenarioDefinitions.localLifeline.title
scenarioDefinitions.localLifeline.summary
scenarioDefinitions.localLifeline.briefing
scenarioDefinitions.localLifeline.strategyHint
scenarioDefinitions.localLifeline.objectives.localUnits
scenarioDefinitions.localLifeline.objectives.localShare
scenarioDefinitions.localLifeline.failures.negativeCash
```

Add separate `scenarioCatalog`, `scenarioStatus`, `scenarioObjectives`, `scenarioResults`, `scenarioDiagnostics`, and `scenarioModifiers` UI namespaces; keep definition data limited to the keys above.

Use the existing `focusTrap` attachment, semantic dialog roles, Escape handling, focus restoration to the opener, keyboard-operable confirmation actions, and an `aria-live` status for copy/import feedback.

- [ ] **Step 5: Wire lifecycle actions**

- Start official: `startScenario(definition, definition.officialSeed)` then `saveActiveRun` before route publication.
- Start custom/import: decoded seed and unranked eligibility.
- Resume: load exact stored definition version and run without gameplay transition or normalization.
- Restart: rebuild exact stored version and selected seed, then replace only that scenario's active run.
- Start current over older/import over active: require confirmation before persistence.
- Return to catalog: preserve active run.
- Return to sandbox: set `playMode = 'sandbox'` without changing either repository.
- Abandon: remove active record; do not update best.

Every start/resume/restart clears `lastScenarioResult` and `lastScenarioBestUpdated` only after the persistence operation succeeds.

Pass `scenarioOperationError` and `retryScenarioOperation` to the catalog so failed start/resume/restart/abandon writes can be retried without changing the displayed state.

- [ ] **Step 6: Autofix and verify**

Run `svelte-autofixer` on both new components and the route until clean, then:

```bash
rtk bun run test:unit -- src/lib/components/game/ScenarioCatalog.svelte.spec.ts src/lib/components/game/ScenarioMenuSection.svelte.spec.ts src/lib/i18n/scenarioCopy.spec.ts --run
rtk bun run check
```

- [ ] **Step 7: Commit**

```bash
rtk git add src/lib/components/game/ScenarioCatalog.svelte src/lib/components/game/ScenarioCatalog.svelte.spec.ts src/lib/components/game/ScenarioMenuSection.svelte src/lib/components/game/ScenarioMenuSection.svelte.spec.ts src/lib/i18n/scenarioCopy.ts src/lib/i18n/scenarioCopy.spec.ts src/lib/i18n/messages/en.ts src/lib/i18n/messages/zh-Hant.ts src/lib/i18n/messages/ja.ts src/routes/+page.svelte
rtk git commit -m "feat: add scenario catalog"
```

---

### Task 15: Add the in-run objective UI and post-commit terminal dialog

**Files:**
- Create: `src/lib/components/game/ScenarioStatusStrip.svelte`
- Create: `src/lib/components/game/ScenarioStatusStrip.svelte.spec.ts`
- Create: `src/lib/components/game/ScenarioObjectivePanel.svelte`
- Create: `src/lib/components/game/ScenarioObjectivePanel.svelte.spec.ts`
- Create: `src/lib/components/game/ScenarioResultsDialog.svelte`
- Create: `src/lib/components/game/ScenarioResultsDialog.svelte.spec.ts`
- Modify: `src/lib/i18n/scenarioCopy.ts`
- Modify: `src/lib/i18n/scenarioCopy.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Follow the Svelte MCP documentation flow**

Fetch dialog/focus restoration, transitions if used, runes, dynamic lists, and accessibility sections before editing.

- [ ] **Step 2: Write failing strip/panel/dialog tests**

Cover ranked/unranked labels, current/remaining day, pending/satisfied/missed text equivalents, required/optional progress, projected score/medal, static modifiers, risk indicators, evidence actual/target/window, contributing IDs resolved to names, and expansion/collapse keyboard behavior.

Dialog tests must cover completed and failed outcomes, best-updated flag, next-medal points, all evidence, deadline evidence, Restart/Catalog/Sandbox actions, focus trap/restoration, and the absence of a dialog before a deferred terminal commit resolves.

Also test the in-run persistence error notice: it keeps the last committed progress visible, announces the localized failure, and retries the exact rejected write once.

- [ ] **Step 3: Confirm failures**

```bash
rtk bun run test:unit -- src/lib/components/game/ScenarioStatusStrip.svelte.spec.ts src/lib/components/game/ScenarioObjectivePanel.svelte.spec.ts src/lib/components/game/ScenarioResultsDialog.svelte.spec.ts --run
```

- [ ] **Step 4: Implement presentation-only components**

`ScenarioStatusStrip` and `ScenarioObjectivePanel` format `ScenarioEvaluation`; they must not import `metrics.ts`. `ScenarioResultsDialog` renders route-owned `lastScenarioResult` plus `lastScenarioBestUpdated`, both published from the same commit outcome.

Provide visible text for every color state, `aria-live` announcements for progress/result publication, modal focus management, Escape behavior only where the dialog is allowed to close, and focus restoration.

- [ ] **Step 5: Wire route placement**

- Render the compact strip immediately below `TopBar` only in scenario mode with an active run.
- Disable every mutating control while `scenarioCommandPending`; leave map/panel navigation enabled.
- Render `scenarioOperationError` with Retry/Dismiss actions without recalculating or publishing the uncommitted run.
- Open the blocking result dialog only after the terminal repository promise resolves.
- Closing the dialog retains the result only in route memory; reload does not restore it.

- [ ] **Step 6: Autofix and verify**

Run `svelte-autofixer` on all three components and the route until clean, then:

```bash
rtk bun run test:unit -- src/lib/components/game/ScenarioStatusStrip.svelte.spec.ts src/lib/components/game/ScenarioObjectivePanel.svelte.spec.ts src/lib/components/game/ScenarioResultsDialog.svelte.spec.ts --run
rtk bun run check
```

- [ ] **Step 7: Commit**

```bash
rtk git add src/lib/components/game/ScenarioStatusStrip.svelte src/lib/components/game/ScenarioStatusStrip.svelte.spec.ts src/lib/components/game/ScenarioObjectivePanel.svelte src/lib/components/game/ScenarioObjectivePanel.svelte.spec.ts src/lib/components/game/ScenarioResultsDialog.svelte src/lib/components/game/ScenarioResultsDialog.svelte.spec.ts src/lib/i18n/scenarioCopy.ts src/lib/i18n/scenarioCopy.spec.ts src/lib/i18n/messages/en.ts src/lib/i18n/messages/zh-Hant.ts src/lib/i18n/messages/ja.ts src/routes/+page.svelte
rtk git commit -m "feat: show scenario progress and results"
```

---

### Task 16: Publish and calibrate the three version-1 definitions

**Files:**
- Modify: `src/lib/scenarios/catalog.ts`
- Create: `src/lib/scenarios/catalog.spec.ts`
- Modify: `src/lib/scenarios/shareCode.ts`
- Modify: `src/lib/scenarios/shareCode.spec.ts`
- Modify: `src/lib/scenarios/validation.spec.ts`
- Modify: `src/lib/scenarios/setup.spec.ts`
- Modify: `src/lib/scenarios/runtime.spec.ts`

**Catalog API:**

```ts
export const SCENARIO_CATALOG: readonly ScenarioDefinition[];
export interface ScenarioCatalogEntry {
	definition: ScenarioDefinition;
	available: boolean;
	diagnostics: ScenarioDiagnostic[];
}
export function compileScenarioCatalogEntries(
	definitions: readonly ScenarioDefinition[]
): readonly ScenarioCatalogEntry[];
export function listScenarioCatalogEntries(): readonly ScenarioCatalogEntry[];
export function listCurrentScenarioDefinitions(): readonly ScenarioDefinition[];
export function resolveScenarioDefinition(ref: ScenarioDefinitionRef): ScenarioDefinition | undefined;
export function currentScenarioDefinition(scenarioId: ScenarioId): ScenarioDefinition | undefined;
```

**Immutable version-1 IDs and seeds:**

| Scenario | ID | Version | Official seed | Day limit | Founding tile | Canonical share code |
| --- | --- | ---: | ---: | ---: | --- | --- |
| First Profit | `first-profit` | 1 | `280001` | 14 | `harbor-city-29-35` | `SC1.first-profit.1.601t.04d9xyn` |
| Import Squeeze | `import-squeeze` | 1 | `280002` | 21 | `harbor-city-29-35` | `SC1.import-squeeze.1.601u.12s7q19` |
| Local Lifeline | `local-lifeline` | 1 | `280003` | 21 | `harbor-city-29-35` | `SC1.local-lifeline.1.601v.0455cvi` |

- [ ] **Step 1: Write failing catalog completeness tests**

Assert exactly three current definitions, unique IDs/versions, deep-frozen data, successful validation/setup for official seeds, current/old-version lookup semantics, official share-code ranked classification, and no scenario-ID conditional in shared game modules. Also pass a cross-reference-invalid fixture to `compileScenarioCatalogEntries` and assert it remains visible as `available: false` with stable diagnostics rather than starting a partial run.

```ts
it('ships three valid immutable current definitions', () => {
	expect(listCurrentScenarioDefinitions().map(({ id }) => id)).toEqual([
		'first-profit',
		'import-squeeze',
		'local-lifeline'
	]);
	for (const definition of SCENARIO_CATALOG) {
		expect(validateScenarioDefinition(definition)).toEqual([]);
		expect(Object.isFrozen(definition)).toBe(true);
	}
});
```

- [ ] **Step 2: Encode First Profit exactly**

- Convenience store, `storeRef: 'founding-store'`, weak residential tile above.
- Authored cash `9_000`, debt `8_000`, `storeCap: 1`.
- Starting policy: premium pricing, generous inventory, minimal staffing, no marketing, speed service.
- Content: cities `harbor-city`/`industry-city`, archetype `convenience`, product `bottled-water`, no materials/buildings/gameplay placements.
- Allowed commands, in canonical order: `advanceDay`, `resolveDecision`, `updatePolicy`, `selectWorldCity`, `hireStaff`, `assignStaff`, `unassignStaff`, `promoteStaff`, `updateStoreSellingPrice`, `updateStoreInventoryTargets`. Disallow expansion, upgrades, industry, and rail commands.
- Required: run-to-date cumulative net income `> 0`; complete trailing 3-report consecutive-positive count `>= 3`.
- Use objective/failure label keys `scenarioDefinitions.firstProfit.objectives.cumulativeNetIncome`, `scenarioDefinitions.firstProfit.objectives.positiveIncomeStreak`, and `scenarioDefinitions.firstProfit.failures.negativeCash`.
- Fail cash `< 0`; deadline is runtime-synthetic.
- Bonus allocation: remaining days 200 points (`0` at 0 days, full at 9), cumulative net income 180 points (`0` at 0, full at 5,000), customer satisfaction 120 points (`0` at 50, full at 85).
- Silver 700, Gold 850.

- [ ] **Step 3: Encode Import Squeeze exactly**

- Electronics store at the founding tile, `targetLevel: 4`, authored cash `30_000`, debt `12_000`, `storeCap: 1`.
- Product overrides: `games` stock 50/reorder 20/target 70/price 48; `accessories` stock 60/reorder 24/target 80/price 22.
- Add one `2x` `retail-product` rule targeting `games` and `accessories`.
- Content: cities `harbor-city`/`industry-city`, archetype `electronics`, products `games`/`accessories`, no materials/buildings/gameplay placements.
- Allowed commands, in canonical order: `advanceDay`, `resolveDecision`, `updatePolicy`, `selectWorldCity`, `hireStaff`, `assignStaff`, `unassignStaff`, `promoteStaff`, `updateStoreSellingPrice`, `updateStoreInventoryTargets`. Disallow store/building/rail construction and all upgrades.
- Required: run-to-date completed retail import cycles `>= 2`; run-to-date cumulative net income `> 0`.
- Use objective/failure label keys `scenarioDefinitions.importSqueeze.objectives.completedImportCycles`, `scenarioDefinitions.importSqueeze.objectives.cumulativeNetIncome`, and `scenarioDefinitions.importSqueeze.failures.negativeCash`.
- Fail cash `< 0`.
- Bonus allocation: retail import spend 180 points (`0` at 12,000, full at 2,000), ending cash 180 points (`0` at 0, full at 35,000), demand missed 140 points (`0` at 1,000, full at 0).
- Silver 700, Gold 850.

- [ ] **Step 4: Encode Local Lifeline exactly**

- Level-1 convenience store with only unlocked `bottled-water`: stock 10, reorder 25, target 50, price 3; authored cash `12_000`, debt `8_000`, `storeCap: 1`.
- Prebuild `water-pump` ref `pump` at `industry-city-3-19` and empty `warehouse` ref `warehouse` at `industry-city-26-20`.
- Content: cities `harbor-city`/`industry-city`, archetype `convenience`, product `bottled-water`, materials `water`/`bottled-water`, buildings `water-pump`/`water-bottler`/`warehouse`, no retail placements, and exactly one industrial placement for `water-bottler` at `industry-city-26-8`.
- Allowed commands, in canonical order: `advanceDay`, `resolveDecision`, `updatePolicy`, `selectWorldCity`, `hireStaff`, `assignStaff`, `unassignStaff`, `promoteStaff`, `updateStoreSellingPrice`, `buildIndustrialBuilding`. Disallow every rail mutation, store construction/upgrade, building upgrade, and inventory-target edit.
- Install the first level-5 corridor with these cells in order:

```text
4,18 4,17 4,16 4,15 4,14 4,13 4,12 5,12 6,12 7,12 8,12 9,12
10,12 11,12 12,12 13,12 14,12 15,12 16,12 17,12 18,12 19,12 20,12
21,12 22,12 23,12 24,12 25,12 26,12 26,11 26,10
```

- Install the disjoint second level-5 corridor:

```text
28,9 29,9 29,10 29,11 29,12 29,13 29,14 29,15 29,16 29,17 29,18
29,19 29,20 28,20
```

- Required over `run-to-date`, filtered to `bottled-water`: local units `>= 40`; local share `>= 0.5`.
- Use objective/failure label keys `scenarioDefinitions.localLifeline.objectives.localUnits`, `scenarioDefinitions.localLifeline.objectives.localShare`, and `scenarioDefinitions.localLifeline.failures.negativeCash`.
- Fail cash `< 0`.
- Bonus allocation: local share 200 points (`0` at 0.5, full at 1), imported units 150 points (`0` at 80, full at 0), remaining days 150 points (`0` at 0 days, full at 10).
- Silver 700, Gold 850.

- [ ] **Step 5: Add explicit calibration fixtures**

For each scenario, add:

1. a no-action trace that issues only `advanceDay` and deterministic decision acknowledgements until terminal and asserts the run does not earn Silver;
2. a documented reference trace that applies the intended policy/price/inventory choices, builds the Local Lifeline bottler at its single allowed tile, resolves supplier decisions deterministically, and asserts Gold.

Store reference traces as typed `ScenarioCommand[]` built by test helpers, never as callbacks in catalog data. If the starting values or score anchors above do not satisfy both contracts under the current simulation, tune only the numeric values and command sequence in this task, keep the scenario lessons/objectives/medal thresholds unchanged, and record the final values in the test names/comments before commit.

Start calibration from these exact competent traces:

```ts
const FIRST_PROFIT_REFERENCE_OPENING: ScenarioCommand[] = [
	{
		kind: 'updatePolicy',
		patch: {
			pricing: 'competitive',
			inventory: 'lean',
			staffing: 'service',
			marketing: 'promotions',
			service: 'highTouch'
		}
	},
	{
		kind: 'updateStoreSellingPrice',
		storeId: 'store-1',
		categoryId: 'bottled-water',
		sellingPrice: 4
	},
	{
		kind: 'updateStoreInventoryTargets',
		storeId: 'store-1',
		categoryId: 'bottled-water',
		reorderThreshold: 20,
		targetStock: 55
	}
];

const IMPORT_SQUEEZE_REFERENCE_OPENING: ScenarioCommand[] = [
	{
		kind: 'updatePolicy',
		patch: {
			pricing: 'premium',
			inventory: 'lean',
			staffing: 'service',
			marketing: 'loyalty',
			service: 'balanced'
		}
	},
	{
		kind: 'updateStoreSellingPrice',
		storeId: 'store-1',
		categoryId: 'games',
		sellingPrice: 72
	},
	{
		kind: 'updateStoreSellingPrice',
		storeId: 'store-1',
		categoryId: 'accessories',
		sellingPrice: 32
	},
	{
		kind: 'updateStoreInventoryTargets',
		storeId: 'store-1',
		categoryId: 'games',
		reorderThreshold: 10,
		targetStock: 45
	},
	{
		kind: 'updateStoreInventoryTargets',
		storeId: 'store-1',
		categoryId: 'accessories',
		reorderThreshold: 12,
		targetStock: 50
	}
];

const LOCAL_LIFELINE_REFERENCE_OPENING: ScenarioCommand[] = [
	{
		kind: 'buildIndustrialBuilding',
		tileId: 'industry-city-26-8',
		buildingTypeId: 'water-bottler'
	},
	{
		kind: 'updatePolicy',
		patch: {
			pricing: 'competitive',
			inventory: 'balanced',
			staffing: 'service',
			marketing: 'loyalty',
			service: 'balanced'
		}
	},
	{
		kind: 'updateStoreSellingPrice',
		storeId: 'store-1',
		categoryId: 'bottled-water',
		sellingPrice: 4
	}
];
```

After the opening commands, append `advanceDay` until terminal. Whenever `supplier-terms` exists, append `resolveDecision` with `negotiate-credit`; ignore other absent/expired decisions. The no-action trace appends only `advanceDay` and intentionally lets optional decisions expire.

- [ ] **Step 6: Verify catalog, setup, runtime, and share codes**

```bash
rtk bun run test:unit -- src/lib/scenarios/catalog.spec.ts src/lib/scenarios/shareCode.spec.ts src/lib/scenarios/validation.spec.ts src/lib/scenarios/setup.spec.ts src/lib/scenarios/runtime.spec.ts --run
```

Expected: PASS, including all six calibration fixtures.

- [ ] **Step 7: Scan shared engine code for scenario branches**

```bash
rtk rg -n "first-profit|import-squeeze|local-lifeline" src/lib/game src/lib/persistence src/routes
```

Expected: no matches outside scenario catalog/tests and localized presentation files.

- [ ] **Step 8: Commit**

```bash
rtk git add src/lib/scenarios/catalog.ts src/lib/scenarios/catalog.spec.ts src/lib/scenarios/shareCode.ts src/lib/scenarios/shareCode.spec.ts src/lib/scenarios/validation.spec.ts src/lib/scenarios/setup.spec.ts src/lib/scenarios/runtime.spec.ts
rtk git commit -m "feat: publish launch scenarios"
```

---

### Task 17: Add end-to-end coverage and perform whole-feature verification

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`

This is a test-and-verification slice. If it exposes a production defect, return to the exact owning task above, add a focused regression there, and rerun that task before continuing; do not hide a product fix inside the E2E commit.

- [ ] **Step 1: Write the failing Playwright scenarios**

Add targeted tests for:

- starting First Profit from the catalog with the official ranked seed;
- advancing a day and observing objective/deadline progress;
- returning to sandbox/catalog and resuming the isolated run;
- completing a deterministic reference run and persisting a best result;
- failing on cash/deadline and seeing evidence;
- resolving a non-day decision into terminal negative cash and seeing the result only after commit;
- restarting and restoring the official state;
- importing a custom seed, completing unranked, and retaining the ranked best;
- reloading after failed/unranked/non-best terminal results and confirming no attempt history appears.

Use stable `data-testid` locators and existing canvas settled attributes. Do not encode click coordinates when a semantic control is available.

- [ ] **Step 2: Confirm the targeted E2E tests fail before final wiring fixes**

```bash
rtk bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "challenge"
```

- [ ] **Step 3: Run focused domain and persistence suites**

```bash
rtk bun run test:unit -- src/lib/scenarios src/lib/persistence --run
```

Expected: PASS.

- [ ] **Step 4: Run all component and route tests**

```bash
rtk bun run test:unit -- src/lib/components/game src/routes/page.svelte.spec.ts --run --project client
```

Expected: PASS.

- [ ] **Step 5: Run the full verification stack**

```bash
rtk bun run check
rtk bun run lint
rtk bun run test:unit -- --run
rtk bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "challenge"
rtk bun run build
```

Expected: every command exits 0.

- [ ] **Step 6: Run determinism and placeholder audits**

```bash
rtk rg -n "localeCompare" src/lib/game src/lib/scenarios
rtk rg -n "TODO|TBD|FIXME|placeholder|similar to|appropriate error|handle edge cases" src/lib/scenarios src/lib/persistence src/lib/components/game src/routes/+page.svelte
rtk git diff --check
```

Expected:

- only presentation-only `localeCompare` sites remain, with none in scenario/state-changing paths;
- no placeholder phrases in the new implementation;
- no whitespace errors.

- [ ] **Step 7: Self-review against the approved spec**

Check each final design resolution explicitly:

1. target-level setup parity and transient cash restoration;
2. exact scenario resume without sandbox normalization;
3. returned post-commit terminal results for failed/unranked/non-best runs;
4. evaluation after every accepted state-changing command;
5. all launch objectives expressible through registered metrics/windows;
6. canonical evidence without a persisted report-ID migration;
7. locale-independent deterministic seller ordering.

Also verify every current `+page.svelte` mutation site is either route-only navigation or passes through the mode-aware seam.

- [ ] **Step 8: Commit final verification fixes**

```bash
rtk git add src/routes/retail-sim.e2e.ts
rtk git commit -m "test: verify challenge mode end to end"
```
