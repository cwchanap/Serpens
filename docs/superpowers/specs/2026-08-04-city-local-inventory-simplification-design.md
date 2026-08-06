# City-Local Inventory Simplification Design

**Date:** 2026-08-04
**Status:** Proposed for HPA-554
**Prerequisite:** HPA-292 / PR #31 is merged
**Delivery:** One deletion-focused implementation PR

## Summary

HPA-292 correctly introduced city-owned inventory and retail supply assignments, but it also retained pre-release migrations, persisted derived inventory pressure, duplicated report outcomes, repeated scenario validation, and UI recovery for states normal gameplay cannot create.

HPA-554 removes that maintenance cost before HPA-294 builds transfers and routes on top of these contracts.

Priorities are:

1. Development speed and low maintenance cost.
2. Clear domain boundaries for future logistics work.
3. Correct current gameplay behavior.
4. KISS and YAGNI over defensive completeness.

Backward compatibility, hostile-save hardening, external scenario authoring, and polished recovery from impossible state are out of scope.

## Core decisions

### 1. Current save schema only

Task 1 deletes migration support while schema 13 remains current. The first wire-shape change in Task 2 bumps `SAVE_SCHEMA_VERSION` to 14. There is no 13-to-14 migration.

Any non-current schema is handled through the existing corrupt/empty-store path. HPA-554 does not add a new error code, localization copy, or controller result.

Remove:

- `MIGRATABLE_SCHEMA_VERSIONS`
- `migrateV4*` through `migrateV12*`
- `LegacyV12*` wire types
- legacy warehouse allocation and conservation code
- historical city-attribution reconstruction
- migration-only tests and exports

Rename schema-specific fixtures such as `createCurrentV13*` to neutral `createCurrent*` names.

Update `CLAUDE.md` so the repository doctrine says pre-release saves are unsupported rather than migrated.

### 2. Authoritative inventory state only

Mutable inventory becomes:

```ts
export interface CityInventory {
  cityId: WorldCityId;
  materials: Partial<Record<MaterialId, number>>;
}
```

Remove persisted:

- `capacity`
- `overflowUnits`
- `overflowCost`

Add one selector:

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
): CityInventoryStats;
```

The selector:

1. Resolves the validated current inventory.
2. Sums same-city warehouse-building capacity.
3. Sums material quantities.
4. Derives overflow and overflow cost.
5. Throws a clear invariant error if the current state is invalid.

Callers operate on validated `GameState`; they do not repeat nullable recovery branches.

Keep material mutation helpers, but make them modify only `materials`. Remove:

- `recalculateCityInventoryPressure`
- `synchronizeCityInventoryCapacity`
- `synchronizeAllCityInventoryCapacities`
- `normalizeCityInventoryDerivedState`
- transition calls whose only purpose is synchronizing derived values

### 3. Historical inventory summaries stay immutable

Keep `DailyCityInventorySummary` unchanged as production-close history:

```ts
export interface DailyCityInventorySummary {
  cityId: WorldCityId;
  capacity: number;
  used: number;
  overflowUnits: number;
  overflowCost: number;
}
```

`industryProduction.ts` derives each summary from the post-production, post-rail material state before weekly retail replenishment.

Keep aggregate report fields unchanged in HPA-554:

- `warehouseCapacity`
- `warehouseUsed`
- `overflowUnits`
- `overflowCost`

### 4. Replenishment reports store facts, not labels

Keep store-level context:

```ts
export interface RetailReplenishmentContext {
  retailCityId: WorldCityId;
  configuredSupplyCityId: WorldCityId | null;
  resolvedSupplyCityId: WorldCityId | null;
}
```

Keep product facts:

- `warehouseUnits`
- `warehouseValue`
- `importedUnits`
- `importCost`
- `importSpend`

Remove persisted `DailyProductReport.replenishmentOutcome`.

Presentation derives the outcome only when store-level context exists:

```ts
export function getRetailReplenishmentOutcome(
  context: RetailReplenishmentContext,
  report: Pick<DailyProductReport, 'warehouseUnits' | 'importedUnits'>
): RetailReplenishmentOutcome | null;
```

Rules, in order:

1. No local or imported units: `null`.
2. Both local and imported units: `mixed`.
3. Local units only: `city-inventory`.
4. Imported units with `configuredSupplyCityId === null`: `unassigned-import`.
5. Imported units with unresolved configured source: `source-unavailable-import`.
6. Otherwise: `import-only`.

If `DailyStoreReport.replenishment` is `null`, the caller presents no outcome and does not call the helper. Malformed historical rows without required context are dropped during decoding.

### 5. Historical reports are non-authoritative

Current state remains strict. Historical report rows are decoded independently.

For each report row:

- preserve surviving chronological order;
- drop structurally malformed rows;
- emit one `console.warn` with the row index and error;
- do not repair fields;
- allow `game.reports` to become empty when all rows are invalid.

Remove semantic replay against current state, including current source accessibility, historical outcome reconciliation, and current-city membership checks.

### 6. Scenario validation has one path

Delete:

- `src/lib/scenarios/validation/cityInventory.ts`
- `src/lib/scenarios/validation/cityInventory.spec.ts`

Keep this setup sequence:

1. Validate the TypeScript scenario definition.
2. Materialize cities and stores.
3. Materialize every authored industrial building.
4. Install authored rails.
5. Apply general overrides.
6. Apply city-inventory material overrides.
7. Check material totals against capacity derived from already-materialized warehouses.
8. Apply and normalize retail supply assignments.
9. Run one final `validateCurrentGameState(game)`.

Setup failures remain path- and value-specific. Collapsing live UI assignment errors does not remove useful authored-scenario diagnostics.

### 7. Remove impossible-state UI recovery

Current save/setup validation guarantees one assignment per opened retail city and valid non-null sources.

Remove:

- the `'missing'` selection sentinel
- `RETAIL_SUPPLY_MISSING_CONFIGURATION_VALUE`
- synthetic stale-source options
- missing/stale recovery copy and tests
- detailed live assignment failure variants

Keep:

- `null` as Imports only
- normal available-source display
- zero-capacity and overflow display
- unchanged-selection no-op behavior

Live assignment failures collapse to:

```ts
export type RetailSupplyAssignmentFailure =
  | 'invalid-retail-city'
  | 'invalid-supply-city';
```

## Main implementation files

Production and persistence:

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
- `src/lib/persistence/scenarioCodec.ts`
- `src/lib/scenarios/setup.ts`
- `src/lib/scenarios/validation/start.ts`
- `src/lib/components/game/IndustryTileInspector.svelte`
- `src/lib/components/game/ProductChainsPanel.svelte`
- `src/lib/components/game/ReportsPanel.svelte`
- `src/lib/components/game/RetailSupplySources.svelte`
- `src/lib/components/game/retailSupplySources.ts`
- `src/routes/gameRouteController.ts`
- `src/routes/retail-sim.e2e.ts`

Likely fixture/spec updates also include:

- `StoreOverview.svelte.spec.ts`
- `StoreStockTable.svelte.spec.ts`
- `TileInspector.svelte.spec.ts`
- `scenarios/metrics.spec.ts`
- `productChainTree.spec.ts`

The final symbol audit is authoritative if additional references exist.

## Retained tests

Retain behavior-focused coverage for:

- production cannot consume another city's stock;
- retail uses its configured source;
- partial local supply imports the exact shortage;
- shared-source contention remains deterministic;
- derived capacity uses same-city warehouses only;
- overflow cost is charged from production-close summaries;
- current-schema save/load round-trips;
- scenario setup applies inventory and assignments;
- one E2E covers selection, daily simulation, reports, and save/load.

Delete migration matrices, malformed internal-object matrices, stale UI recovery tests, and tests that exist only for defensive error-code branches.

## Acceptance criteria

- Migrations and legacy reconstruction are removed.
- Schema 14 is introduced with the first wire-shape change, with no migration from 13.
- Mutable `CityInventory` contains only `cityId` and `materials`.
- `getCityInventoryStats` is the only capacity/pressure derivation path and is non-nullable.
- No synchronization helper remains.
- Daily city summaries and report timing remain correct.
- `DailyProductReport` no longer persists `replenishmentOutcome`.
- Outcome presentation uses factual quantities and store context.
- Malformed historical rows are warned and dropped without invalidating current state.
- Duplicate post-setup scenario validation is deleted.
- Missing/stale retail-source recovery UI is deleted.
- Core HPA-292 behavior and the logistics E2E pass.
- The implementation PR removes more production/test code than it adds.
- No replacement migration, cache, validation, or recovery framework is introduced.
