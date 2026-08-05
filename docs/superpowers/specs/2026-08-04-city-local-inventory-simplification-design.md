# City-Local Inventory Simplification Design

**Date:** 2026-08-04  
**Status:** Proposed for HPA-554  
**Prerequisite:** HPA-292 / PR #31 is merged  
**Delivery:** One deletion-focused implementation PR

## Summary

HPA-292 correctly introduced city-owned inventory and retail supply assignments, but it also retained pre-release save migration, persisted derived inventory fields, duplicated report outcomes, exhaustive malformed-state validation, and UI recovery paths for states normal gameplay cannot create.

HPA-554 simplifies those contracts before inter-city transfers and routes build on them. The cleanup intentionally breaks old development saves, removes compatibility and recovery code, keeps only authoritative mutable state, derives cheap values on demand, and retains a small set of gameplay-focused tests.

The implementation is delivered in one PR with eight ordered review checkpoints. It must produce a meaningful net reduction in production and durable test code. Deleting complexity is the feature; replacing it with a generic framework is out of scope.

## Priorities

In descending order:

1. Development speed and low maintenance cost.
2. Clear domain boundaries that support future logistics work.
3. Correct current gameplay behavior.
4. Reviewability through focused commits and retained behavior tests.
5. Defensive handling of malformed or historical data only where it is cheap and necessary.

Backward compatibility, hostile-input hardening, and graceful recovery from impossible internal state are not priorities for this pre-release hobby project.

## Goals

- Accept only one current save schema and remove all production migration code.
- Persist only authoritative city inventory ownership and material quantities.
- Derive capacity, used units, overflow units, and overflow cost through one domain selector.
- Keep production-close inventory summaries as historical report snapshots.
- Persist replenishment facts once and derive human-readable outcomes.
- Remove semantic replay of historical simulation equations from save validation.
- Remove duplicated post-setup scenario validation.
- Normalize deterministic ordering rather than reject harmless order differences.
- Remove UI states and failure variants that exist only for malformed current state.
- Preserve HPA-292 city isolation, replenishment, cash, and report behavior.

## Non-goals

- Preserving save schemas 4 through 13.
- Providing an in-product migration path for developer saves.
- Supporting manually edited, malicious, or third-party save files.
- Supporting external scenario or mod authoring.
- Adding transfer orders, route capacity, in-transit inventory, or logistics-city kinds.
- Redesigning production, retail demand, import pricing, or world progression.
- Generalizing validation or serialization into a new framework.
- Refactoring unrelated finance, events, or route-controller architecture.

## Design principles

### Authoritative state only

Mutable persisted state stores facts the player owns. Values that can be cheaply calculated from current facts are not persisted.

### Current schema only

A pre-release schema mismatch is an unsupported save, not a migration request. The error path is simple and explicit.

### Facts over labels

Reports store quantities and source context. Labels such as “mixed” or “source unavailable” are derived when reports are presented.

### Normalize instead of reject

Where collection order has no gameplay meaning, domain constructors and decoders sort it. Canonical-order validation is reserved only for algorithms whose ordering changes allocation behavior.

### Fail at boundaries

Current-state corruption is rejected when loading or constructing a game. Domain and UI code then operate on valid state without repeating missing/stale recovery branches.

## State model

### Persisted city inventory

Replace the mutable inventory shape with:

```ts
export interface CityInventory {
  cityId: WorldCityId;
  materials: Partial<Record<MaterialId, number>>;
}
```

Remove these fields from mutable `GameState` inventory records:

- `capacity`
- `overflowUnits`
- `overflowCost`

`used` was already derived and remains derived.

### Derived inventory statistics

Add one selector in `src/lib/game/cityInventory.ts`:

```ts
export interface CityInventoryStats {
  capacity: number;
  used: number;
  overflowUnits: number;
  overflowCost: number;
}

export function getCityInventoryStats(
  game: GameState,
  cityId: string
): CityInventoryStats | null;
```

The `string` parameter intentionally matches the existing `getCityInventory` boundary; HPA-554 does not churn callers merely to narrow the parameter type.

Behavior:

1. Resolve a known opened industry city with a materialized `IndustryCity` and `CityInventory`.
2. Sum warehouse-building capacity for that city.
3. Sum material quantities for `used`.
4. Compute `overflowUnits = max(0, used - capacity)`.
5. Compute `overflowCost = overflowUnits * WAREHOUSE_OVERFLOW_COST_PER_UNIT`.
6. Return `null` when the city cannot resolve to a current inventory.

The selector is cheap because the game contains few cities and buildings. No memoization or cache invalidation is introduced.

### Inventory mutations

Keep pure material operations:

```ts
addCityInventoryMaterial(inventory, materialId, quantity): CityInventory
removeCityInventoryMaterial(inventory, materialId, quantity): RemoveCityInventoryMaterialResult
```

They modify materials only. They do not calculate or persist pressure.

Remove:

- `recalculateCityInventoryPressure`
- `synchronizeCityInventoryCapacity`
- `synchronizeAllCityInventoryCapacities`
- `normalizeCityInventoryDerivedState`
- `hasSameDerivedState`
- transition calls whose only purpose is synchronizing those fields

### Historical inventory snapshots

Retain `DailyCityInventorySummary` unchanged:

```ts
export interface DailyCityInventorySummary {
  cityId: WorldCityId;
  capacity: number;
  used: number;
  overflowUnits: number;
  overflowCost: number;
}
```

This is not mutable game state. It records production-close values for a report day. `industryProduction.ts` creates summaries by calling `getCityInventoryStats` against the production-close game state.

The existing aggregate report fields remain unchanged because finance and report UI already use them:

- `warehouseCapacity`
- `warehouseUsed`
- `overflowUnits`
- `overflowCost`

HPA-554 will not rename or remove these aggregate report fields.

## Persistence

### Schema policy

Bump `SAVE_SCHEMA_VERSION` from 13 to 14 because the final implementation changes the current `CityInventory` and report wire shapes.

A record is accepted only when:

```ts
record.schemaVersion === SAVE_SCHEMA_VERSION
```

Any other version throws:

```ts
new SaveDataError(
  'This save was created by an unsupported development version.',
  'unsupported-version'
)
```

Remove:

- `MIGRATABLE_SCHEMA_VERSIONS`
- the migration dispatch tables
- `migrateV4*` through `migrateV12*`
- `LegacyV12*` wire types
- legacy warehouse allocation and conservation helpers
- historical city-attribution reconstruction
- exports used only to test individual migration stages

Repositories continue calling one current-schema decode/validate entry point. Do not retain deprecated migration wrappers.

### Schema lifecycle inside the implementation PR

Schema 14 is the only accepted version for the entire implementation branch. The first implementation commit may temporarily advertise schema 14 while the in-memory and encoded shapes still match former schema 13; later commits change those shapes under schema 14.

This temporary state is acceptable because:

- the implementation is one unreleased PR;
- every commit rejects schema 13;
- no 13-to-14 migration exists at any point;
- no intermediate commit is shipped as a release.

Fixtures and helper names must switch to neutral or schema-14 naming as soon as Task 1 establishes schema 14. Do not retain names such as `createCurrentV13MultiCityGame` after the bump.

### Unsupported-version presentation

`unsupported-version` is a real save API result, not just a codec test code.

Current `SaveRepositoryFromDriver.readSnapshot` turns ordinary malformed save data into an empty store. HPA-554 keeps that cheap recovery for `corrupt`, but it must rethrow `unsupported-version` so the route can explain why an old development save was not loaded.

The existing page-level save error mapping handles the surfaced error:

- add `route.save.errorUnsupportedVersion` in English, Japanese, and Traditional Chinese;
- map `SaveDataError.code === 'unsupported-version'` in `describeSaveErrorKey`;
- keep generic current-schema corruption mapped to `route.save.errorCorrupt`;
- add repository and page/controller tests proving the unsupported-version code is not silently collapsed to an empty save store.

No new save-error framework or controller result union is introduced.

### Current-state validation

Strictly validate authoritative current state:

- required top-level fields and current schema version
- known/opened/materialized city ownership
- exactly one inventory per opened inventory-capable city
- unique inventory and assignment owners
- nonnegative safe-integer material quantities
- one supply assignment per opened retail city
- non-null supply IDs reference opened inventory-capable industry cities
- stores and industrial buildings belong to opened generated cities of the correct kind

Normalize inventory and assignment arrays into world-catalog order after validating uniqueness and ownership. Do not reject a valid collection solely because its input order differs.

Do not validate persisted capacity or pressure because those fields no longer exist.

### Historical reports

Reports are non-authoritative history. Save loading must not reject an otherwise playable game because a historical row no longer reconciles with current balance constants or current city access.

Keep structural decoding for fields the UI reads. Remove current-state semantic replay such as:

- recomputing every historical `warehouseValue`
- requiring persisted outcome enums to match quantities
- requiring historical configured/resolved sources to be currently accessible
- comparing historical aggregate fields to current game inventory
- requiring historical city membership to match the current opened-city set

Decode report entries independently with these exact rules:

1. Valid surviving rows preserve their original chronological order.
2. If every row is malformed, `game.reports` becomes an empty array and the save remains playable.
3. The decoder never fills, rewrites, or soft-repairs malformed report fields.

A structurally invalid report entry is omitted from `game.reports`; valid siblings remain.

## Replenishment reports

### Persisted facts

Keep store-level source context:

```ts
export interface RetailReplenishmentContext {
  retailCityId: WorldCityId;
  configuredSupplyCityId: WorldCityId | null;
  resolvedSupplyCityId: WorldCityId | null;
}
```

Keep numerical product facts:

- `warehouseUnits`
- `warehouseValue`
- `importedUnits`
- `importCost`
- `importSpend`

Remove `DailyProductReport.replenishmentOutcome` from persisted reports.

### Derived outcome

The presentation layer derives an outcome:

```ts
export type RetailReplenishmentOutcome =
  | 'city-inventory'
  | 'mixed'
  | 'import-only'
  | 'unassigned-import'
  | 'source-unavailable-import';

export function getRetailReplenishmentOutcome(
  context: RetailReplenishmentContext | null,
  report: Pick<DailyProductReport, 'warehouseUnits' | 'importedUnits'>
): RetailReplenishmentOutcome | null;
```

Apply the rules in this order:

1. If both quantities are zero, return `null`.
2. If `context === null`, return `null` even when a malformed historical row contains nonzero quantities; presentation must not invent missing source evidence.
3. If both local and imported quantities are positive, return `mixed`.
4. If only local quantity is positive, return `city-inventory`.
5. If only imported quantity is positive and `configuredSupplyCityId === null`, return `unassigned-import`.
6. If only imported quantity is positive and `resolvedSupplyCityId === null`, return `source-unavailable-import`.
7. Otherwise return `import-only`.

Quantity evidence wins before source classification once context exists. Therefore local plus imported units are `mixed` even if a malformed context has `configuredSupplyCityId === null`.

The helper belongs with report presentation or retail report helpers, not persistence validation.

## Scenario simplification

Built-in scenario definitions are TypeScript and already pass through the definition validator in `src/lib/scenarios/validation/start.ts`.

Remove the duplicated post-setup module:

- `src/lib/scenarios/validation/cityInventory.ts`
- `src/lib/scenarios/validation/cityInventory.spec.ts`

`buildScenarioGame` follows this exact sequence:

1. Validate the authored definition with the existing schema/content validator.
2. Materialize cities, stores, all authored industrial buildings, and rails through normal transitions.
3. Apply general overrides.
4. Apply city-inventory material overrides after warehouse buildings already exist.
5. Check inventory totals against capacity derived from those materialized buildings.
6. Apply and normalize retail supply assignments.
7. Sort inventories and assignments by catalog order.
8. Run one final `validateCurrentGameState(game)`.

A scenario cannot add another starting warehouse after the capacity gate; the gate runs only after all authored starting buildings have been materialized.

Meaningful setup failures remain path- and value-specific:

- target city exists and is open
- inventory total does not exceed derived city capacity
- supply source is an opened inventory-capable industry city or `null`

Do not maintain a second diagnostic matrix for malformed post-setup `GameState` values.

## Domain failure handling

### Inventory access

Keep `getCityInventory` as a non-throwing lookup because UI selectors and command boundaries benefit from optional access. Collapse callers that do not need reason-specific behavior to `CityInventory | undefined` or an `ok` result without propagating every reason.

The detailed four-reason taxonomy may remain internally only where it materially improves a current user-facing error. It must not drive separate UI states for impossible current state.

### Retail assignment command

Simplify live assignment failure to the minimum useful result:

```ts
export type RetailSupplyAssignmentFailure =
  | 'invalid-retail-city'
  | 'invalid-supply-city';
```

The command still returns `changed: false` for selecting the existing value. The live UI displays one generic rejected-selection message. It does not distinguish unknown, closed, unsupported, and unmaterialized variants.

This collapse applies only to live command plumbing. Scenario setup diagnostics remain path-scoped and include the invalid city value so authored scenario failures are actionable.

## UI simplification

Current-state validation guarantees one assignment per opened retail city and valid non-null sources. Therefore:

- remove the `'missing'` selection sentinel
- remove `RETAIL_SUPPLY_MISSING_CONFIGURATION_VALUE`
- remove synthetic stale-source options
- remove copy and tests dedicated to missing/stale recovery
- retain `null` as the explicit Imports-only selection
- retain normal available-source and zero-capacity display states

The UI is not responsible for repairing invalid saves.

Product-chain and inspector panels read `getCityInventoryStats` rather than persisted pressure fields.

## Data flow

### Production close

1. Production and rail mutate city material records.
2. `industryProduction.ts` builds a temporary game with the resulting inventories.
3. For every inventory row, it requests derived stats.
4. If a row cannot produce stats, throw a clear current-state invariant error; do not use a non-null assertion or silently skip the row.
5. Store the derived stats in `DailyProductionReport.cityInventories`.
6. Charge aggregate overflow cost from those summaries.

### Weekly replenishment

1. Resolve each retail city's selected source.
2. Debit materials from the source inventory.
3. Store local/import quantities and store-level source context.
4. UI/report helpers derive the outcome label.

### Save load

1. Require schema 14.
2. Decode and validate authoritative current game state.
3. Sort inventory and assignment arrays.
4. Decode historical report rows independently and discard malformed rows.
5. Return the playable game.

## Testing strategy

### Retain

- independent city inventory mutation
- production cannot read another city's inventory
- retail replenishment uses the configured city
- partial supply imports the exact shortage
- shared-source contention remains deterministic
- derived capacity includes only same-city warehouse buildings
- derived overflow and charged overflow cost are correct
- report timing remains production-close before replenishment
- current-schema save and repository round trips
- unsupported schema produces the dedicated user-facing save error
- historical report filtering preserves valid siblings and permits an empty result
- scenario setup with one inventory override and one assignment override
- one browser E2E covering source selection, daily advancement, report attribution, and save/load

### Remove or consolidate

- all historical migration tests
- direct tests of migration helper stages
- malformed-input matrices for internal TypeScript scenario values
- safe-integer boundary permutations beyond one representative invariant test
- every individual inventory-access and assignment-failure UI variant
- stale-source and missing-assignment component recovery tests
- semantic historical-report reconciliation tests

Tests must assert player behavior or an authoritative state invariant. Branch coverage alone is not a reason to retain a test.

## Implementation boundaries

Primary production files expected to change:

- `CLAUDE.md`
- `src/lib/game/types.ts`
- `src/lib/game/cityInventory.ts`
- `src/lib/game/industryProduction.ts`
- `src/lib/game/railShipping.ts`
- `src/lib/game/retailSupply.ts`
- `src/lib/game/stock.ts`
- `src/lib/game/simulateDay.ts`
- `src/lib/game/productChainGraph.ts`
- `src/lib/game/productChainTree.ts`
- `src/lib/game/supplyAdvisor.ts`
- `src/lib/persistence/saveTypes.ts`
- `src/lib/persistence/saveCodec.ts`
- `src/lib/persistence/saveStoreRepository.ts`
- `src/lib/persistence/scenarioCodec.ts`
- `src/lib/scenarios/setup.ts`
- `src/lib/scenarios/validation/start.ts`
- `src/lib/components/game/IndustryTileInspector.svelte`
- `src/lib/components/game/ProductChainsPanel.svelte`
- `src/lib/components/game/ReportsPanel.svelte`
- `src/lib/components/game/RetailSupplySources.svelte`
- `src/lib/components/game/retailSupplySources.ts`
- `src/routes/+page.svelte`
- `src/routes/gameRouteController.ts`
- `src/routes/retail-sim.e2e.ts`

The implementation may touch associated tests and localization keys. It must not introduce a broad repository, validation, or state-management refactor.

## Single-PR delivery

The cleanup is one implementation PR with eight internal review checkpoints matching the implementation plan:

1. Current-schema-only persistence, unsupported-version presentation, and migration deletion.
2. Authoritative-only city inventory state and derived statistics.
3. Simulation, E2E fixtures, and domain readers cut over to derived statistics.
4. Facts-only replenishment reports and derived outcome presentation.
5. Current-state-only save validation and independent historical report filtering.
6. Scenario validation consolidation and normalized setup.
7. Live command and UI recovery-path deletion.
8. Durable test reduction, full verification, and implementation-only net-deletion audit.

Each checkpoint is a coherent green commit or small green commit group. Domain migration helpers that are still referenced remain until checkpoint 2; checkpoint 1 deletes persistence migration code only. No checkpoint is a separately mergeable feature PR.

The implementation branch must start from `main` after this documentation PR is merged. Therefore `git diff main...HEAD` in checkpoint 8 measures the implementation cleanup only, not these specification documents.

## Acceptance criteria

- `SAVE_SCHEMA_VERSION` is 14 and schemas below 14 are rejected without migration.
- `unsupported-version` is surfaced through repository and page save-error handling with localized copy.
- `CLAUDE.md` describes the current-only pre-release save policy and no longer documents retained migration safety nets.
- No `migrateV*`, `LegacyV*`, migration allocation, or historical attribution reconstruction remains in production code.
- Mutable `CityInventory` stores only `cityId` and `materials`.
- One selector derives capacity, used units, overflow units, and overflow cost.
- No capacity/pressure synchronization helper or transition obligation remains.
- Daily production reports retain accurate immutable city summaries without unsafe non-null assertions.
- `DailyProductReport` no longer persists `replenishmentOutcome`.
- Outcome copy is derived from quantities and store source context using the defined precedence rules.
- Save loading validates authoritative state but does not replay historical report equations.
- Malformed historical report rows are dropped, surviving order is preserved, and total drop yields an empty history.
- Duplicated post-setup scenario inventory/supply validation is removed.
- Scenario capacity checks run after all authored warehouse buildings are materialized.
- Live retail-source failures are collapsed while scenario diagnostics remain path-specific.
- Retail source UI has no missing-assignment or stale-source synthetic state.
- Core HPA-292 behavior tests and the logistics E2E pass.
- The implementation has a meaningful net deletion in production code and durable tests, measured independently of this docs PR.
- No new migration, generic validation, cache, compatibility, or recovery framework is introduced.
