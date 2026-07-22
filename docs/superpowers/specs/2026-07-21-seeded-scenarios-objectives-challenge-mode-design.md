# Seeded Scenarios, Objectives, and Challenge Mode — Design

**Date:** 2026-07-21
**Status:** Approved 2026-07-22; implementation plan drafted
**Linear:** HPA-280

## Summary

Add a challenge mode around Serpens' existing deterministic simulation. A
challenge selects an immutable, versioned scenario definition and seed, builds
a curated starting `GameState` through the normal domain factories, restricts
the available actions and content, applies typed simulation rules, and evaluates
typed objectives and failures after each day.

Scenario runs are wrappers around `GameState`, not a new simulation. They have
their own lifecycle, autosaves, objective evidence, score, medal, share code,
and best-result persistence. Scenario data is isolated from sandbox autosaves
and manual saves.

The first release ships three immediately available scenarios:

1. early profitability;
2. an import-cost shock; and
3. local bottled-water manufacturing.

## Decisions made during brainstorming

| Question | Decision |
| --- | --- |
| Long-term results | Keep one best ranked result per immutable `(scenarioId, version)`, including the full result breakdown; the catalog foregrounds the current version |
| Resumable progress | Keep at most one active run per built-in scenario |
| Ranked seeds | The published seed is ranked; altered/custom seeds are playable but unranked |
| Starting setup | Fully curated state; the player enters the live scenario without a founding-placement step |
| Medals | Successful completion establishes Bronze; deterministic score thresholds award Silver and Gold |
| Catalog availability | All three launch scenarios are available immediately |
| Architecture | Separate `ScenarioRun` wrapper and `ScenarioRepository`; do not add scenario state to `GameState` |
| Manual challenge saves | None; active challenge runs autosave after every committed transition |
| Normal saves | Existing sandbox autosave and manual slots remain unchanged and isolated |

## Goals

- Reuse the same deterministic factories and simulation used by sandbox play.
- Make the same definition version, seed, and player commands produce the same
  game state, objective evidence, outcome, score, and medal.
- Reject invalid definitions before play with structured, useful diagnostics.
- Keep normal games, other scenarios, and challenge results isolated.
- Explain every objective pass, objective miss, and failure with evidence.
- Support stable, human-shareable official and custom-seed codes.
- Exercise the framework with at least three scenarios that contain no
  scenario-specific branches in the daily simulation.

## Non-goals

- Online leaderboards, multiplayer competition, or server verification.
- A visual scenario editor.
- Loading arbitrary external scenario definitions.
- Executable callbacks or unsafe runtime scripting in scenario data.
- Full attempt history. Only active runs and best ranked results are retained.
- Debt, freshness, logistics, competitor, or timed-event scenarios before the
  corresponding simulation systems exist.

## Architecture

`GameState` remains the single source of truth for the business simulation. A
scenario run owns the challenge-specific context around it:

```ts
interface ScenarioDefinitionRef {
	scenarioId: ScenarioId;
	version: number;
}

type ScenarioRunStatus = 'active' | 'completed' | 'failed' | 'abandoned';
type ScenarioEligibility = 'ranked' | 'unranked';

interface ScenarioRun {
	definition: ScenarioDefinitionRef;
	seed: number;
	eligibility: ScenarioEligibility;
	status: ScenarioRunStatus;
	game: GameState;
	evaluation: ScenarioEvaluation;
	result: ScenarioResult | null;
}
```

Absence of a stored run is the catalog's not-started state. `startScenario`
creates an active run; `resumeScenario` loads one without applying gameplay
transitions or repair normalization (an explicit older-schema migration may
change its representation to the current schema);
`restartScenario` replaces it with a fresh active run using the selected seed;
`abandonScenario` produces the terminal `abandoned` transition and removes the
run from resumable persistence. Completed and failed runs produce terminal
results and are no longer resumable.

An active run retains its exact `ScenarioDefinitionRef` even after a newer
version becomes current. Resume and Restart keep using that stored version;
neither silently upgrades or abandons it. Starting the catalog's current
version while an older-version run is active requires explicit replacement
confirmation. Supported older definitions remain resolvable for active runs,
stored best results, and imported share codes.

### Definition contract

A `ScenarioDefinition` is immutable catalog data containing:

- stable ID and positive integer definition version;
- localized title, summary, briefing, and strategy-hint keys;
- official seed and day limit;
- curated starting-state blueprint;
- allowed cities, archetypes, products, materials, buildings, and commands;
- static typed simulation modifiers;
- required objectives, optional objectives, and failure conditions;
- score components plus configurable Silver and Gold thresholds; Bronze is the
  fixed global clear floor.

Published `(scenarioId, version)` pairs never change meaning. Balance or content
changes publish a new version. The catalog presents only the current version,
while versions referenced by supported saves and share codes remain resolvable.

### Module boundaries

| Module | Responsibility |
| --- | --- |
| `src/lib/scenarios/types.ts` | Scenario definitions, runs, evaluations, evidence, results, commands, diagnostics, and persistence types |
| `src/lib/scenarios/catalog.ts` | Immutable built-in definitions and lookup by ID/version |
| `src/lib/scenarios/validation.ts` | Catalog and definition validation, including cross-reference and supported-combination checks |
| `src/lib/scenarios/setup.ts` | Deterministic construction from normal factories plus typed overrides |
| `src/lib/scenarios/metrics.ts` | Registered metric evaluation and evidence collection |
| `src/lib/scenarios/scoring.ts` | Score calculation, medal derivation, and best-result comparison |
| `src/lib/scenarios/runtime.ts` | Start/restart/abandon and scenario command execution |
| `src/lib/scenarios/capabilities.ts` | Shared allowed-content/action queries used by domain guards and disabled UI states |
| `src/lib/scenarios/shareCode.ts` | Versioned code encoding, decoding, checksum, and eligibility classification |
| `src/lib/persistence/scenarioRepository.ts` | Dedicated challenge persistence interface |
| `src/lib/persistence/scenarioCodec.ts` | Scenario-store validation plus independently versioned embedded-game validation/migration |
| `src/lib/persistence/scenarioStoreRepository.ts` | Queued repository implementation over a scenario store driver |
| `src/lib/persistence/browserScenarioRepository.ts` | Browser-storage driver under a scenario-only key |
| `src/lib/persistence/tauriScenarioRepository.ts` | Tauri-store driver under a scenario-only key |
| `src/lib/persistence/scenarioRepositoryFactory.ts` | Runtime selection of browser versus dynamically imported Tauri repository |
| `src/lib/persistence/scenarioMemoryRepository.ts` | In-memory driver used by domain/component tests |

The scenario modules may depend on game-domain modules. Game-domain modules do
not depend on the scenario catalog or current run. The only shared extension is
an explicit simulation-rules input described below.

## Curated deterministic setup

Starting blueprints are typed factory inputs, references, and narrow overrides;
they are not serialized `GameState` blobs or `Partial<GameState>` patches. The
V1 shape is closed to unknown fields:

```ts
interface ScenarioStartBlueprint {
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
	rails: readonly {
		cityId: WorldCityId;
		x: number;
		y: number;
		level: number;
	}[];
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

Definitions represent unused arrays with `[]` and unused overrides with `{}`;
they cannot add another override without extending this interface and its
validator. Authored store/building `ref` values are setup-local stable
references, not persisted replacements for domain-generated IDs.

`buildScenarioGame` follows this order:

1. Normalize the scenario seed through the same RNG seed contract as sandbox.
2. Call the normal new-game/city/industry/store/staff factories.
3. Calculate a deterministic transient setup reserve covering every authored
   placement and target-level upgrade, then make that reserve available only
   while the ordinary economic transitions run.
4. Place curated stores/buildings and replay each store's normal upgrade
   transition until its validated `targetLevel` is reached. This is what adds
   milestone products, adjusts staff capacity, and recalculates stock health.
5. Install validated authored rail cells in stable coordinate order.
6. Apply product/inventory/policy/world overrides, recalculate stock health for
   every overridden store, then restore the pre-setup cash/debt or replace them
   with the authored cash/debt values. Setup costs and the transient reserve
   never enter the persisted challenge economy.
7. Recalculate warehouse capacity/pressure from the placed warehouse buildings.
8. Validate the completed `GameState` and all starting invariants.
9. Evaluate initial objective/failure evidence without advancing the day.

The setup reserve is calculated from existing forecast/cost helpers; it is not a
magic persisted cash value. A transition that still fails after funding makes
the definition invalid. Product overrides apply only after target-level
materialization and may target only categories unlocked at that level. Thus a
level-4 electronics start has the same `games`/`accessories`, milestone staff
capacity, and stock-health semantics as normal level 1 → 4 play, while its
authored starting cash does not pretend the player paid those historical setup
costs.

Setup consumes RNG only through normal factories and transitions in a fixed
order. It cannot read wall-clock time. Ranked and unranked runs differ only in
seed and result eligibility. Scenario setup always passes its normalized seed
to `createNewGame`; it never uses that function's `Date.now()` default.

## Definition validation

Validation returns all `ScenarioDiagnostic` entries in stable path/code order.
Every diagnostic contains a code, definition path, rejected value, and
developer-facing detail. Player-facing UI maps diagnostic codes to localized
copy.

Validation covers:

- unique scenario and objective IDs;
- scenario IDs matching lowercase kebab case and containing no `.` separator;
- supported definition versions and canonical integer seeds in the existing RNG
  range `1..2_147_483_646`;
- positive day limits and valid objective windows;
- the exact closed `ScenarioStartBlueprint` field set, unique setup-local refs,
  and overrides that target content created earlier in setup;
- valid city, archetype, product, material, recipe, and building references;
- valid placements, footprints, resources, and non-overlap in the built start;
- rail coordinates, levels in `1..5`, topology, and the required
  producer-to-consumer-to-warehouse reachability/capacity for authored starts;
- starting content being allowed by the same definition;
- every `targetLevel` being an integer in the normal store-level range, every
  replayed setup upgrade succeeding, and the calculated reserve being finite;
- every starting/allowlisted product being unlocked at its store's materialized
  target level or by an explicitly permitted gameplay upgrade;
- warehouse contents not exceeding capacity derived from placed warehouse
  buildings, with no starting overflow charge;
- an integer `storeCap` no lower than the starting store count; when `openStore`
  is forbidden, the cap must equal that count so domain previews and decision
  generation agree with the scenario capability boundary;
- supported command and modifier kinds, scopes, finite values, and targets;
- at least one required objective;
- failure/objective metrics supported by the registered metric catalog;
- scoring components whose maximum bonuses total 500 points;
- Bronze fixed at the 500-point clear floor, with
  `500 < Silver < Gold <= 1_000`;
- objectives that reference content excluded by the allowlist;
- unsupported combinations such as a local-production objective with no
  permitted producer/warehouse path.

All built-in versions are compiled and validated in tests. Production marks an
invalid definition unavailable and shows a concise diagnostic; it never starts
a partially valid challenge.

## Allowed content and commands

Scenario definitions combine typed content allowlists with permissions for
individual command kinds. V1 inventories every current route-level game
mutation and keeps independently useful commands separate:

- `advanceDay`;
- `resolveDecision`;
- `updatePolicy`;
- `openWorldCity` and `selectWorldCity`;
- `openStore` and `upgradeStore`;
- `hireStaff`, `assignStaff`, `unassignStaff`, and `promoteStaff`;
- `updateStoreSellingPrice` and `updateStoreInventoryTargets`;
- `buildIndustrialBuilding` and `upgradeIndustrialBuilding`;
- `buildRail`, `upgradeRail`, and `demolishRail`.

Splitting decision resolution from day advancement and selling-price edits
from reorder/target edits lets a scenario prohibit the exploitable half of a
feature without disabling the useful half. Adding a new route-level game
mutation requires adding a command kind and catalog validation before challenge
mode may call it.

Map and panel navigation that lives outside `GameState` is never blocked.
`selectWorldCity` is inventoried because it changes the active city IDs inside
`GameState`; it is always permitted for already-opened allowed cities, but it
still passes through the same typed commit seam so persistence and replay stay
deterministic. Each other mutating UI handler constructs a typed
`ScenarioCommand` while challenge mode is active. The runtime validates the
command against `capabilities.ts` before delegating to the existing pure game
transition. The build menus use the same capability queries to hide or disable
content, so UI guidance and runtime enforcement cannot drift.

Sandbox handlers continue to call the existing transitions directly. There is
no global current-scenario variable and no catalog check inside ordinary game
functions.

`refreshWorldProgress` continues to run unchanged inside the daily simulation,
so scenario state may reveal cities and claim milestones exactly as sandbox
state does. The three launch scenarios disallow `openWorldCity`; revealed nodes
remain read-only and are labelled unavailable in this challenge. Capability-
based UI also suppresses sandbox-oriented unlock prompts while preserving the
underlying deterministic `world` state and reports.

V1 does not add decision-generation suppression rules. All three launch
scenarios accept the existing deterministic `generateDecisions` stream and
allow `resolveDecision`. Their `storeCap` equals their one starting store, so
the existing expansion-opportunity guard remains false. A cash-pressure
decision can only be generated on the same simulated transition that triggers
the terminal negative-cash failure, while supplier-terms decisions remain part
of the playable challenge and calibration fixtures.

## Simulation rules and modifiers

Scenario modifiers compile into an immutable `SimulationRules` value passed to
the daily simulation. Sandbox play supplies `DEFAULT_SIMULATION_RULES`.

The simulation boundary is explicit and source-compatible for existing callers:

```ts
simulateDay(
	game: GameState,
	rules: SimulationRules = DEFAULT_SIMULATION_RULES
): GameState
```

`simulateDay` passes the rules to `simulateIndustryProduction` and
`applyWeeklyImports`. It does not pass them to `simulateProductSalesForCity`:
that function retains the base sales-time COGS behavior documented below. The
default parameter keeps every existing sandbox and test caller unchanged, and
a deep-equality fixture proves explicit default rules match omission.

V1 supports a static scoped import-cost multiplier with:

- a `retail-product` or `industrial-material` scope;
- an explicit target ID list or all IDs in that scope;
- a positive finite multiplier.

The two scopes remain distinct even when a product category ID and finished
`MaterialId` use the same string. `retail-product` targets are validated against
the selected archetype's unlocked `ProductCategory.id` values and are threaded
to `applyWeeklyImports`. `industrial-material` targets are validated against
`MaterialId` and are threaded to the paid-input fallback in
`simulateIndustryProduction`.

The multiplier is applied before rounding and is reflected in actual
`importSpend`, cash, net income, and import evidence. It does not rewrite the
existing sales-time `costOfGoods` estimate, so gross margin continues to show
the base merchandising estimate while the challenge modifier/import report
shows the purchase-price shock. This preserves the current cash-accounting
model instead of inventing per-inventory-lot landed costs inside HPA-280.

Static scenario modifiers are not persisted event instances and do not
duplicate HPA-290's timed lifecycle. Future timed event modifiers and static
scenario modifiers will both resolve into `SimulationRules` inputs at the
simulation boundary. No scenario ID appears in `simulateDay`, stock, industry,
or reporting branches.

## Objectives, failures, and evidence

Definitions cannot supply arbitrary predicates. Required objectives, optional
objectives, failures, and scoring use a discriminated, registered metric
catalog. Initial metrics include:

- current and ending cash;
- daily and cumulative net income;
- consecutive positive-income days;
- completed retail import cycles, counted from daily reports whose report day
  satisfies the shared `isImportDay` rule;
- import spend and imported units over a report window;
- locally supplied/warehouse-pulled units and local-supply share, where share is
  `warehouseUnits / (warehouseUnits + importedUnits)` over the same inclusive
  report window and is `0` when that denominator is `0`;
- units sold and demand missed;
- scorecard values;
- store/building counts and building-type counts;
- warehouse quantities.

Each condition declares a metric, comparator, target, and a window kind that the
registered metric explicitly supports:

```ts
type ScenarioMetricWindow =
	| { kind: 'current' }
	| { kind: 'run-to-date' }
	| { kind: 'trailing-reports'; count: number }
	| { kind: 'fixed-report-days'; startDay: number; endDay: number };

interface ObjectiveEvidence {
	metric: ScenarioMetricId;
	comparator: ScenarioComparator;
	target: number;
	actual: number;
	day: number;
	window: ScenarioMetricWindow;
	contributingIds: string[];
}

type ObjectiveConditionStatus = 'pending' | 'satisfied' | 'missed';
type FailureConditionStatus = 'inactive' | 'triggered';
```

`run-to-date` means the first simulated report through the latest report at the
current evaluation. `trailing-reports` uses at most the declared count and stays
`pending` until a metric that requires a complete window has enough reports.
Fixed report days are inclusive and cannot extend beyond the scenario day
limit. Definition validation rejects a metric/window pairing the metric does
not support; there is no arbitrary activation predicate or executable window.

Contributing IDs are sorted stable store, building, material, and report IDs.
Before terminal evaluation, an unsatisfied objective is `pending`, never
`missed`. Empty aggregate/report windows produce their metric's neutral value
and empty contributing IDs; for example, First Profit starts with evidence
`actual: 0` against the three-day positive-income target and displays `0 / 3`.
An objective becomes `missed` only when a terminal result freezes it without
satisfaction. Failure conditions remain `inactive` until their predicate is
triggered. Evidence is recorded for every current status. UI components only
format this domain result; they never recalculate progress.

Reports do not gain persisted ID fields. Scenario evidence derives canonical
IDs as `report:<day>`, `report:<day>/store:<storeId>`, and
`report:<day>/store:<storeId>/product:<categoryId>`. Runtime and codec
validation require strictly increasing unique report days, unique store IDs per
daily report, and unique product-category IDs per store report. String segments
use one canonical percent-encoding helper before concatenation, so separators in
an ID cannot make two evidence IDs collide. Those composite IDs are therefore
stable without changing the saved `GameState` schema.

V1 deliberately measures demand missed rather than historical stockout
incidence: weekly import merging overwrites the pre-refill ending-stock value.
Adding a persisted pre-refill field and game-save migration is deferred until a
scenario actually requires exact stockout history.

### Command evaluation order

For every accepted command that changes `GameState`:

1. Apply the existing pure transition. For `advanceDay`, supply static rules and
   run the normal deterministic daily simulation.
2. If the transition is a no-op, return without evaluation or persistence.
3. Evaluate every required objective, optional objective, and failure, then
   build evidence from the resulting state/report history.
4. If any failure passes, fail immediately. Failure wins if success and failure
   become true on the same command.
5. Otherwise, if every required objective passes, complete immediately.
6. Otherwise, only for `advanceDay`, if the inclusive day limit is exhausted,
   fail with a synthetic `deadline-exceeded` condition and evidence.
7. Otherwise, persist the refreshed active evaluation.

Forbidden/rejected commands never transition, evaluate, or write. Non-day
commands can still complete or fail a run: for example, resolving a decision
may change cash immediately. Report-window metrics simply retain their existing
value until a later `advanceDay` appends another report.

Hard failures are terminal. Failure-risk indicators are pure projections of
distance to configured failure targets or the deadline; they never mutate the
run.

## Scoring, medals, and best results

Only successful runs receive medals. Score is a deterministic integer clamped
to 0–1000:

```text
score = 500 clear points
      + fixed optional-objective bonuses
      + normalized performance bonuses
      + normalized remaining-time bonus
```

Each definition allocates exactly 500 possible bonus points. Performance and
time components declare zero-bonus and full-bonus anchors; values between them
are linearly normalized and rounded with one shared integer-rounding function.
Values outside the anchors clamp to the component range.

Bronze is global and not configurable: every successful run receives the
500-point clear floor. Definitions configure only Silver and Gold, subject to
the validation ordering above. Launch thresholds are:

- Bronze: 500;
- Silver: 700;
- Gold: 850.

Failed or abandoned runs have no medal. Their result/evaluation remains
available to the current results UI but is not added to a history.

A ranked completion replaces
`bestResultsByDefinitionKey[definitionKey]` only when its score is strictly
greater. Because medal is derived from score, score is the complete ordering
within one immutable definition version. Equal scores retain the existing
record. Results from different versions are retained separately and never
compared. Custom-seed results never update best results.

Every stored best result includes definition reference, seed, completion day,
score, medal, objective states, and evidence. Wall-clock metadata is excluded
from score and deterministic equality.

## Launch scenarios

The numeric factory inputs, placements, and bonus allocations live in the
validated catalog. Calibration must satisfy two invariant fixtures per
scenario: a no-action command sequence cannot earn Silver, and a documented
competent reference sequence can earn Gold.

### First Profit — 14 days

- Curated convenience store in a weak but viable Harbor City location.
- Opening policy intentionally carries avoidable cost/demand trade-offs.
- Additional stores and all industry construction are disabled.
- Required objectives:
  - run-to-date cumulative net income is positive; and
  - the three-report trailing window is complete and all three reports have
    positive net income.
- Failures:
  - cash falls below zero; or
  - the deadline expires before both required objectives pass.
- Bonus dimensions:
  - earlier completion;
  - cumulative net income; and
  - customer satisfaction.
- Lesson: stabilize a young store through pricing, inventory, staffing,
  marketing, and service policy choices.

### Import Squeeze — 21 days

- Curated electronics store materialized through `targetLevel: 4`, producing the
  level-valid `games` and `accessories` products plus the milestone staff-capacity
  bonus without debiting the authored challenge cash; further store upgrades
  are disabled.
- A `2x` `retail-product` import-cost rule targets those two unlocked products.
- Additional stores and industry construction are disabled.
- Required objectives:
  - run-to-date completed retail import cycles are at least 2; and
  - run-to-date cumulative net income is positive.
  Success occurs only when both conditions are true in the same evaluation;
  no activation predicate is required.
- Failures:
  - cash falls below zero; or
  - the deadline expires before both required objectives pass.
- Bonus dimensions:
  - lower import spend;
  - higher ending cash; and
  - fewer demand-missed units/reports.
- Lesson: respond to external cost pressure using pricing, inventory, and cash
  management rather than local production.

### Local Lifeline — 21 days

- Curated level-1 convenience store whose only product is `bottled-water`.
  Reorder threshold and target stock are fixed by the blueprint;
  `updateStoreInventoryTargets` is disabled while selling-price edits remain
  available.
- The blueprint includes a water pump, an empty warehouse, and two disjoint
  level-5 rail corridors sized so a water bottler placed on the authored build
  site can pull water and push output without the two shipments exhausting the
  same rail cells. The corridors terminate at the future bottler footprint's
  legal connection cells without occupying its build tiles.
- Industrial construction is limited to one `water-bottler` on the authored
  valid placement tile. Additional stores, warehouses, raw producers,
  unrelated buildings, and rail mutations are disabled.
- The authored topology and fixed stock settings must pass a deterministic
  reference trace proving the objective is reachable before day 21; the
  no-action trace must fail because no water bottler exists.
- Required objectives:
  - retail replenishment reports include at least 40 locally supplied
    `bottled-water` units; and
  - cumulative bottled-water local-supply share reaches at least 50% over the
    same `run-to-date` window, from the first simulated report through the
    current evaluation day.
- Failures:
  - cash falls below zero; or
  - the deadline expires before both local-supply objectives pass.
- Bonus dimensions:
  - higher local-supply share;
  - fewer imported bottled-water units; and
  - earlier completion.
- Lesson: connect industry production, shared warehouse inventory, and retail
  replenishment through the existing simulation.

Later debt-turnaround, grocery-freshness, industrial-bottleneck, logistics,
competitor, and timed-event scenarios require only new catalog definitions and
registered generic metrics/rules after their systems exist.

## Share codes

Share codes use one canonical, human-readable format:

```text
SC1.<scenario-id>.<definition-version>.<base36-seed>.<checksum>
```

- `SC1` versions the code format independently from scenario definitions.
- Scenario IDs match `[a-z0-9]+(?:-[a-z0-9]+)*`; `.` is forbidden because it is
  the field separator.
- The seed is an integer in `1..2_147_483_646`, represented canonically in
  lowercase base36.
- The checksum preimage is exactly
  `SC1.<lowercase-scenario-id>.<decimal-version>.<lowercase-base36-seed>`,
  including the three separators.
- The checksum is unsigned 32-bit FNV-1a over the UTF-8 bytes of that preimage,
  represented as lowercase base36 and left-padded with zeroes to exactly seven
  characters. It catches transcription errors; it is not a security signature.
- Decoding trims surrounding whitespace, accepts input letters in either case,
  normalizes each field to the canonical representation above, and then checks
  the checksum. It rejects malformed field counts, unknown IDs, unsupported
  versions, out-of-range/non-integer seeds, and checksum mismatches before
  persistence. In particular, textual seed `0` is rejected rather than passed
  through the RNG's defensive normalization to `1`. Re-encoding always returns
  the canonical form.
- A decoded seed equal to that definition version's official seed is ranked.
  Any other valid seed is unranked.
- Codes reference catalog definitions only. They cannot carry arbitrary
  objectives, modifiers, or executable behavior.

Importing a code never mutates a run until the decoded definition is validated.
If that scenario already has an active run, replacement requires explicit
confirmation.

## Persistence and isolation

Challenges use a separate schema and repository:

```ts
type ScenarioDefinitionKey = `${ScenarioId}@${number}`;

interface ScenarioStoreSnapshot {
	schemaVersion: typeof SCENARIO_STORE_SCHEMA_VERSION;
	activeRunsByScenarioId: Partial<Record<ScenarioId, ScenarioRunRecord>>;
	bestResultsByDefinitionKey: Partial<
		Record<ScenarioDefinitionKey, ScenarioBestResultRecord>
	>;
}

interface ScenarioRunRecord {
	scenarioSchemaVersion: number;
	gameSchemaVersion: number;
	run: Omit<ScenarioRun, 'game'>;
	game: unknown;
}

interface ScenarioCommitOutcome {
	activeRun: ScenarioRun | null;
	terminalResult: ScenarioResult | null;
	bestUpdated: boolean;
}
```

The repository interface exposes catalog summary, active-run load/save/remove,
and serialized terminal completion returning `ScenarioCommitOutcome`.
`ScenarioDefinitionKey` is canonically
`${scenarioId}@${decimalVersion}`; codec validation proves that the key matches
the result's embedded definition reference. Active runs remain keyed only by
scenario ID to preserve the one-active-run decision, while best results are
keyed by immutable definition version so differently balanced versions are
never compared. Browser and Tauri adapters use keys distinct from the existing
sandbox save key. `SCENARIO_STORE_SCHEMA_VERSION` and each record's
`scenarioSchemaVersion` version scenario envelopes independently from the
embedded game's `gameSchemaVersion`.

`saveCodec.ts` separates three bare-game responsibilities instead of exporting
the current repairing validator as one combined boundary:

```ts
migrateSavedGame(value: unknown, sourceGameSchemaVersion: number): unknown;
normalizeSandboxSavedGame(value: unknown): unknown;
validateCurrentGameState(value: unknown): GameState;
```

Sandbox loading calls migrate → sandbox normalization/repair → strict current
validation, preserving today's world refresh, placement repair, and inventory
clamping. Scenario loading calls migrate → strict current validation → scenario
run-invariant validation. It never calls sandbox repair normalization. A
current-schema scenario game must deep-equal the validated game or the record is
rejected as corrupt; only an explicit older-schema migration may transform it.
Game migrations therefore run once without pretending the scenario envelope is
a sandbox save record. Bumping the sandbox/game schema does not invalidate
active scenario runs merely because `SCENARIO_STORE_SCHEMA_VERSION` stayed
unchanged. This extraction must preserve existing sandbox behavior and tests.

Persistence rules:

- at most one active run per built-in scenario, regardless of seed;
- no normal manual slots for challenge runs;
- every committed scenario mutation updates its active record;
- completion uses one serialized snapshot mutation to remove the active run and
  conditionally update the best ranked result for that exact definition key,
  then returns the terminal result whether or not it became the best;
- failure uses one serialized snapshot mutation to remove the active run and
  returns its result in `ScenarioCommitOutcome`, but does not retain it as
  history;
- abandon removes the active run and never changes the best result;
- restart replaces only the selected scenario's active run and keeps that run's
  definition version unless the player separately confirms starting another
  version;
- custom results cannot update best-result records;
- invalid entries are rejected independently so one corrupt scenario cannot
  erase other scenarios or sandbox data.

Scenario schema/version mismatches and corrupt records return typed diagnostics.
They never fall through into sandbox saves. The app has not launched, so no
additional legacy-size or pre-scenario migration path is introduced.

## Transaction semantics

Challenge mutations are persistence-gated rather than fire-and-forget:

1. Compute the next immutable run.
2. Validate run and game invariants.
3. Persist the active or terminal mutation through the repository queue.
4. After the write succeeds, publish the returned active run or route-owned
   terminal result to Svelte, then play audio feedback.

“Serialized terminal completion” means one repository-queue operation reads the
scenario snapshot, removes the active run, conditionally replaces the matching
versioned best result, and performs one snapshot write. It does not introduce a
new database/platform transaction primitive. The UI still treats the operation
as committed only after that write promise resolves. A failed, unranked, or
non-best terminal result is returned to the route but is not stored in the
snapshot.

One mode-aware route seam accepts each discrete typed command, transition, and
audio cue. In sandbox mode it preserves today's immediate assignment plus
fire-and-forget autosave. In challenge mode it permits only one command in
flight: capability check, transition, scenario evaluation, full snapshot write,
then publication. Further mutating commands are disabled/rejected until that
write resolves; read-only navigation remains available. The repository queue is
a second ordering guard for tests and re-entrant callers.

Store number fields currently emit on `change`, not per keystroke, so each
accepted edit is one command/write. No optimistic challenge mutation or rollback
path is introduced. Focused tests use a delayed repository and full-size city
snapshot to verify single-flight behavior and that serialization does not cause
duplicate/lost commands.

If a write fails, the visible run remains at its prior committed state and the
UI offers retry. This prevents a displayed completion or score that cannot be
resumed after reload. Sandbox autosave behavior is not changed by this work.

## Route state and player experience

The route owns two persistence-backed game states, a route-only terminal
result, and a mode selector:

```ts
let sandboxGame: GameState | null;
let activeScenarioRun: ScenarioRun | null;
let lastScenarioResult: ScenarioResult | null;
let lastScenarioBestUpdated: boolean;
let playMode: 'sandbox' | 'scenario';
```

The displayed `game` is a read-only `$derived` value selected from
`sandboxGame` or `activeScenarioRun.game`; no handler assigns to it. A dedicated
route-foundation slice replaces every direct `game = ...`,
`setGameAndAutosave`, world-city mutation, rail mutation, placement mutation,
staff/product/policy mutation, and save-load assignment with the mode-aware
commit/load seam before challenge UI is added. Existing sandbox semantics remain
the regression baseline. The same map and management components continue to
receive the derived `GameState`.

Starting, resuming, or restarting a run clears `lastScenarioResult` and
`lastScenarioBestUpdated`. Closing a results dialog may keep them only for the
current route session; they are never loaded as resumable state or used as the
displayed game.

### Catalog

A new Challenges item in the game menu opens a full catalog overlay without
mutating or saving the current sandbox game. Each card shows:

- premise and day limit;
- required goals and allowed-content summary;
- official seed and ranked/custom status;
- current-version best medal and score, with prior-version results retained but
  never compared against it;
- active-run status including its definition version when it is not current;
- Start or Resume as the primary action;
- Restart, share-code copy, and code import where applicable.

All three launch cards are available immediately. Resume and Restart preserve
the active run's version. Starting the current version over an older active run,
or replacing an active run with an imported code, requires confirmation. A
prior-version result is shown only when inspecting that version through an old
active run or supported share code; it never substitutes for the current card's
best.

### In-run challenge UI

A compact challenge strip below the top bar shows:

- scenario name and ranked/unranked label;
- current day and remaining days;
- required and optional progress;
- projected score/medal;
- active static modifiers;
- failure-risk indicators.

The strip expands into an objective panel containing exact targets, current
values, evidence summaries, and contributing stores/buildings. It formats
`ScenarioEvaluation`; it does not calculate metrics.

While challenge mode is active, the game menu replaces sandbox save controls
with Challenge details, Restart, Return to catalog, and Abandon. Returning to
the catalog preserves the active run. Returning to sandbox switches modes and
leaves both persistence domains intact.

### Terminal results

Completion and failure open a blocking results dialog with:

- outcome, medal, and score;
- whether a new best was recorded;
- points required for the next medal;
- every required and optional objective with evidence;
- failure/deadline evidence;
- Restart, Challenge catalog, and Return to sandbox actions.

The dialog uses route-owned `lastScenarioResult` and
`lastScenarioBestUpdated`, published from the `ScenarioCommitOutcome` only
after the serialized terminal snapshot write completes. It therefore never
claims a completion or best result before commit, but
failed/unranked/non-best results intentionally disappear on reload instead of
becoming attempt history.

All challenge text is localized through stable i18n keys. Required accessibility
includes dialog focus management, keyboard operation, focus restoration,
screen-reader status announcements, text equivalents for color states, and
copy-code success/failure feedback that does not assume clipboard access.

## Error handling

Expected player/runtime failures use discriminated results, not user-facing
thrown exceptions:

- invalid or unavailable definition;
- invalid/unsupported share code;
- forbidden command or content;
- stale run/definition version;
- persistence read/write failure;
- run already terminal or missing;
- setup invariant failure.

Programming invariants may still throw in tests/development, but production
entry points translate them into stable diagnostic codes. Errors never cause a
fallback from scenario persistence to sandbox persistence.

## Determinism guarantees

- Definitions and published versions are immutable.
- Setup and command dispatch have fixed iteration order.
- Simulation-state ordering uses locale-independent numeric or plain UTF-16
  code-unit comparisons. In particular, the seller tie-break in `stock.ts` must
  replace `localeCompare` before challenge determinism relies on it;
  presentation-only graph/advisor sorting does not enter deterministic state.
- Scenario evaluation consumes no RNG.
- Evidence IDs and diagnostics are stably sorted.
- Simulation rules are explicit immutable inputs.
- Scoring uses one integer-normalization/rounding implementation.
- Wall-clock timestamps, locale formatting, and persistence metadata do not
  enter state, evidence, outcome, score, medal, or share codes.
- A determinism fixture replays the same typed command sequence twice and
  deep-compares final `GameState`, evaluation, terminal result, and medal.

## Testing and verification

### Domain unit tests

- Definition validation, including every invalid reference and unsupported
  combination class.
- Catalog completeness and validity for all shipped versions.
- Deterministic setup, every closed blueprint override field, unknown-field
  rejection, placement refs, transient-reserve restoration, target-level parity
  with normal upgrade transitions, and RNG state.
- Explicit-seed enforcement, rail-blueprint topology/capacity, product unlocks,
  and warehouse-content/capacity invariants.
- Share-code round trips, canonicalization, checksum errors, official/custom
  eligibility, mixed-case input, separator rejection, explicit seed-zero
  rejection, and unsupported versions.
- Capability queries and runtime rejection for every individual command kind,
  including independent day/decision, world-city, and product-field controls.
- Objective comparators and all four window kinds, invalid metric/window
  rejection, initial `pending` state with neutral empty-window evidence,
  terminal `missed` state, derived composite evidence IDs, and stable ordering.
- Failure precedence and completion after day/non-day commands, no-op/rejected
  command behavior, advance-day-only deadlines, abandon, restart, and resume
  semantics.
- Score normalization, rounding, medals, ties, and best-result replacement.
- Static import-cost rules and proof that default sandbox results are unchanged.
- Omitted versus explicit `DEFAULT_SIMULATION_RULES` deep equality, plus proof
  that rules reach the two import paths without changing sales-time base COGS.
- Separate retail-product and industrial-material rule targeting, plus the
  documented import-spend versus base-COGS reporting behavior.
- Automatic world reveals remaining deterministic while disallowed city-opening
  commands and challenge unlock prompts stay unavailable.
- `storeCap`/`openStore` validation and default decision-stream behavior,
  including suppressed expansion and deterministic supplier terms.
- Equal-score multi-store seller ordering uses a plain code-unit ID tie-break and
  produces the same store state/RNG state regardless of input order.
- Same definition/seed/commands deep-equality replay.
- No-action below-Silver and reference-action Gold calibration fixtures for
  each launch scenario.

The calibration fixtures are intentional balance contracts. Their test names
and comments state that a failure after shared simulation constants change must
be resolved by deliberately re-tuning the scenario or updating its documented
reference command sequence; deleting or weakening the fixtures is not an
acceptable repair.

### Persistence tests

- Empty, active, completed, failed, abandoned, restarted, and resumed states.
- One active run per scenario and isolation between scenarios.
- Older-version active-run Resume/Restart behavior, confirmed replacement by a
  current version, and separate best-result comparison per definition key.
- Sandbox/scenario key and schema isolation.
- Independent scenario-envelope and embedded-game migrations across a game
  schema bump, with unchanged sandbox migration behavior.
- Current-schema scenario loads deep-equal their committed game, reject records
  that would require repair, and remain isolated from sandbox normalization;
  sandbox fixtures continue to refresh/relocate/clamp as before.
- Ranked versus custom best-result behavior.
- One-operation/one-write terminal removal plus versioned-best update, and
  queued mutation ordering, with terminal outcomes returned for failure,
  unranked completion, non-best completion, and new-best completion.
- Corrupt-entry isolation and unsupported definition versions.
- In-memory, browser, and Tauri repository parity.

### Component tests

- Catalog Start/Resume/Restart/import states and confirmations.
- Older-version active-run labeling, same-version Restart, and confirmed start
  of the current version, including prior-version result detail without current
  card substitution.
- Best medal/score and Unranked presentation.
- Challenge strip progress, remaining time, modifier, and risk states.
- Objective evidence details and projected medal.
- Completion/failure result breakdown and focus behavior.
- Route-owned terminal results publish only after commit, clear on the next
  start/resume/restart, and intentionally disappear after reload.
- Persistence errors leave the previously committed UI state visible.
- Delayed full-size writes enforce one in-flight command without blocking
  read-only navigation or emitting duplicate feedback.

### Targeted Playwright tests

- Start an official scenario from the catalog.
- Advance and observe objective/deadline progress.
- Leave to sandbox/catalog and resume the isolated run.
- Complete a deterministic scenario and record a best result.
- Fail on a hard condition/deadline and show evidence.
- Resolve a non-day decision into a terminal cash failure and show the
  post-commit result.
- Restart and verify the official starting state is restored.
- Import a custom seed and verify its Unranked result cannot replace the best.

### Final verification

- `bun run check`
- `bun run lint`
- `bun run test:unit -- --run`
- targeted `bun run test:e2e` scenario coverage
- `bun run build`

## Delivery sequence

1. Deterministic engine prerequisite: replace the stock seller `localeCompare`
   tie-break with a plain code-unit comparator and lock it with a focused test.
2. Scenario types, validation, catalog, closed deterministic setup blueprint
   (including target-level replay, transient funding, authored rails, and
   `storeCap`), and share codes.
3. Metrics, explicit windows, derived evidence IDs, scoring, all-command
   evaluation, lifecycle, per-command capabilities, and both simulation-rule
   injection paths, including pending initial evaluation and the
   source-compatible `simulateDay` default.
4. Split game migration/strict validation/sandbox normalization plus the
   independently versioned scenario repository, definition-version-keyed best
   results, returned terminal outcomes, serialized terminal mutation,
   browser/Tauri adapters, factory, and memory driver.
5. Route foundation: read-only derived active game, route-owned terminal result,
   complete mutation-site inventory, and the single mode-aware commit/load seam
   with sandbox regression tests.
6. Catalog, challenge strip, objective details, confirmations, and terminal
   results UI.
7. Three calibrated launch definitions and end-to-end verification.

Each slice remains generic. A launch scenario may add catalog data and fixtures,
but it may not add a scenario-ID conditional to shared simulation or UI code.
