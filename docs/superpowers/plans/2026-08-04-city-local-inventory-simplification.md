# City-Local Inventory Simplification Implementation Plan

> **For agentic workers:** Implement this plan task-by-task in one PR. Keep each checkpoint green before continuing.

**Goal:** Delete pre-release compatibility and duplicated derived state while preserving HPA-292 city-isolation and replenishment behavior.

**Architecture:** Support one current save schema, persist only city ownership and material quantities, derive inventory statistics through one non-null selector, keep immutable daily summaries, derive replenishment labels from facts, and remove duplicate scenario/UI recovery paths.

**Constraints:** KISS, YAGNI, no backward compatibility, no replacement framework, no HPA-294 work, and a net reduction in production/test code.

---

## Task 1: Delete pre-release save migrations

**Files**

- `CLAUDE.md`
- `src/lib/persistence/saveCodec.ts`
- `src/lib/persistence/saveCodec.spec.ts`
- `src/lib/persistence/scenarioCodec.ts`
- `src/lib/persistence/scenarioCodec.spec.ts`
- persistence repository specs that currently expect migration

**Work**

- [ ] Rename `createCurrentV13*` fixtures to neutral `createCurrent*` names.
- [ ] Keep schema 13 current for this task.
- [ ] Make decode accept only `SAVE_SCHEMA_VERSION`; non-current versions use the existing corrupt/empty-store behavior.
- [ ] Delete `MIGRATABLE_SCHEMA_VERSIONS`, migration dispatch, `migrateV4*`–`migrateV12*`, `LegacyV12*`, historical attribution reconstruction, and migration-only exports/tests.
- [ ] Limit deletion to persistence migration code. Domain allocation/synchronization helpers remain until Task 2.
- [ ] Update `CLAUDE.md` to state that pre-release saves are unsupported and no migration paths should be added before release.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/persistence/saveRepository.spec.ts \
  src/lib/persistence/tauriSaveRepository.spec.ts \
  src/lib/persistence/scenarioCodec.spec.ts \
  --maxWorkers=1
```

Checkpoint: `refactor(persistence): drop pre-release save migrations`

---

## Task 2: Make city inventory authoritative-only and bump schema 14

**Files**

- `src/lib/persistence/saveTypes.ts`
- `src/lib/persistence/saveCodec.ts`
- `src/lib/game/types.ts`
- `src/lib/game/cityInventory.ts`
- `src/lib/game/state.ts`
- `src/lib/game/world.ts`
- `src/lib/game/industryPlacement.ts`
- `src/routes/+page.svelte`
- `src/routes/retail-sim.e2e.ts`
- affected fixtures/specs, including `StoreOverview.svelte.spec.ts`, `StoreStockTable.svelte.spec.ts`, and `TileInspector.svelte.spec.ts`

**Interfaces**

```ts
export interface CityInventory {
  cityId: WorldCityId;
  materials: Partial<Record<MaterialId, number>>;
}

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

**Work**

- [ ] Set `SAVE_SCHEMA_VERSION = 14`; schema 13 is now unsupported with no migration.
- [ ] Remove `capacity`, `overflowUnits`, and `overflowCost` from mutable `CityInventory` records and all fixtures.
- [ ] Implement `getCityInventoryStats` from current inventory materials plus same-city warehouse buildings.
- [ ] Throw a clear invariant error when the city/inventory cannot resolve; do not return `null`.
- [ ] Make add/remove material helpers mutate materials only.
- [ ] Delete pressure synchronization/normalization helpers and domain legacy-allocation helpers.
- [ ] Remove synchronization calls from world opening and warehouse placement.
- [ ] Convert E2E and page starter fixtures to schema-14 material-only inventories.

**Focused tests**

- two warehouses produce capacity 400;
- 410 units produce overflow 10 and cost 20;
- another city's warehouse does not contribute;
- material mutation returns only authoritative fields;
- invalid current inventory access throws an invariant error.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/game/cityInventory.spec.ts \
  src/lib/game/state.spec.ts \
  src/lib/game/world.spec.ts \
  src/lib/game/industryPlacement.spec.ts \
  --maxWorkers=1
bun run check
```

Checkpoint: `refactor(inventory): derive city capacity and pressure`

---

## Task 3: Cut simulation and readers over to derived stats

**Files**

- `src/lib/game/industryProduction.ts`
- `src/lib/game/railShipping.ts`
- `src/lib/game/retailSupply.ts`
- `src/lib/game/simulateDay.ts`
- `src/lib/game/productChainGraph.ts`
- `src/lib/game/productChainTree.ts`
- `src/lib/game/supplyAdvisor.ts`
- associated specs, including `productChainTree.spec.ts` and `scenarios/metrics.spec.ts`

**Work**

- [ ] Keep rail and replenishment working inventories as material-only records.
- [ ] Remove all pressure recalculation after material pulls/pushes.
- [ ] After production and rail complete, build a temporary game with final material records.
- [ ] Derive every `DailyCityInventorySummary` using `getCityInventoryStats`.
- [ ] Aggregate and charge overflow from those summaries.
- [ ] Replace direct reads of persisted capacity/overflow in product chains and supply advice.
- [ ] Keep contention order, local/import quantities, and production-close-before-replenishment timing unchanged.

**Regression test**

Create one two-city production-close case where only Industry City overflows. Assert its summary and cash charge, and assert the sibling city's overflow cost is zero.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/game/industryProduction.spec.ts \
  src/lib/game/railShipping.spec.ts \
  src/lib/game/railShipping.edge.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/productChainGraph.spec.ts \
  src/lib/game/productChainTree.spec.ts \
  src/lib/game/supplyAdvisor.spec.ts \
  --maxWorkers=1
```

Checkpoint: `refactor(logistics): use derived inventory statistics`

---

## Task 4: Store replenishment facts and derive labels

**Files**

- `src/lib/game/types.ts`
- `src/lib/game/retailSupply.ts`
- `src/lib/game/stock.ts`
- `src/lib/game/simulateDay.ts`
- `src/lib/game/reports.ts`
- `src/lib/components/game/ReportsPanel.svelte`
- product-chain/report copy helpers and associated specs

**Interface**

```ts
export function getRetailReplenishmentOutcome(
  context: RetailReplenishmentContext,
  report: Pick<DailyProductReport, 'warehouseUnits' | 'importedUnits'>
): RetailReplenishmentOutcome | null;
```

**Work**

- [ ] Remove persisted `DailyProductReport.replenishmentOutcome` from types, builders, fixtures, stock initialization, and simulation output.
- [ ] Keep numerical facts and store-level `DailyStoreReport.replenishment` context.
- [ ] Add the derived helper with this precedence: zero → null, mixed, local-only, unassigned import, unavailable-source import, import-only.
- [ ] Call the helper only when store-level context exists. A null context presents no outcome.
- [ ] Update Reports and product-chain presentation to use the helper.
- [ ] Remove save tests that mutate a persisted outcome and expect semantic rejection.

**Outcome table**

Cover six reachable cases: zero, local, mixed, import-only, imports-only configuration, and unavailable configured source. Do not add malformed null-context quantity rows; Task 5 drops those rows before presentation.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/game/reports.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/components/game/ReportsPanel.svelte.spec.ts \
  --maxWorkers=1
```

Checkpoint: `refactor(reports): derive replenishment outcomes`

---

## Task 5: Validate current state and filter historical reports

**Files**

- `src/lib/persistence/saveCodec.ts`
- `src/lib/persistence/saveCodec.spec.ts`
- `src/lib/persistence/scenarioCodec.ts`
- `src/lib/persistence/scenarioCodec.spec.ts`

**Work**

- [ ] Validate authoritative schema-14 game state: city ownership, unique inventories/assignments, material quantities, and valid supply sources.
- [ ] Normalize inventory and assignment arrays by world-catalog order instead of rejecting harmless input order.
- [ ] Remove persisted pressure validation and historical simulation-equation reconciliation.
- [ ] Decode report rows independently.
- [ ] On a malformed row, emit `console.warn('Dropping malformed historical report', { index, error })` and omit the row.
- [ ] Preserve surviving order, allow all rows to be dropped, and never soft-repair fields.

**Tests**

- bad row, good row, bad row → only the good row survives in place;
- all rows bad → empty `reports` and playable game;
- warning emitted for each dropped row;
- malformed authoritative inventory still rejects.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/persistence/saveRepository.spec.ts \
  src/lib/persistence/tauriSaveRepository.spec.ts \
  src/lib/persistence/scenarioCodec.spec.ts \
  --maxWorkers=1
```

Checkpoint: `refactor(persistence): validate current state only`

---

## Task 6: Remove duplicate scenario validation

**Files**

- delete `src/lib/scenarios/validation/cityInventory.ts`
- delete `src/lib/scenarios/validation/cityInventory.spec.ts`
- modify `src/lib/scenarios/setup.ts`
- modify `src/lib/scenarios/setup.spec.ts`
- modify `src/lib/scenarios/validation.ts`
- modify `src/lib/scenarios/validation/start.ts`
- modify `src/lib/scenarios/validation.spec.ts`

**Required setup order**

1. Validate the definition.
2. Materialize cities and stores.
3. Materialize all authored industrial buildings.
4. Install authored rails.
5. Apply general overrides.
6. Apply city inventory materials.
7. Check totals against capacity derived from materialized warehouses.
8. Apply and normalize retail supply assignments.
9. Run `validateCurrentGameState(game)` once.

**Work**

- [ ] Move the capacity and source checks into the override application path.
- [ ] Keep diagnostics path- and value-specific.
- [ ] Remove authored canonical-order rejection; normalize collections instead.
- [ ] Delete the duplicate post-setup validator and malformed-state matrix.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/scenarios/setup.spec.ts \
  src/lib/scenarios/validation.spec.ts \
  src/lib/persistence/scenarioCodec.spec.ts \
  --maxWorkers=1
```

Checkpoint: `refactor(scenarios): remove duplicate inventory validation`

---

## Task 7: Remove impossible-state UI and collapse live failures

**Files**

- `src/lib/game/retailSupply.ts`
- `src/lib/game/commandResult.ts`
- `src/lib/scenarios/runtime.ts`
- `src/routes/gameRouteController.ts`
- `src/lib/components/game/retailSupplySources.ts`
- `src/lib/components/game/RetailSupplySources.svelte`
- `src/lib/components/game/IndustryTileInspector.svelte`
- `src/lib/components/game/ProductChainsPanel.svelte`
- associated specs and localization files

**Work**

- [ ] Collapse live assignment failures to `invalid-retail-city` and `invalid-supply-city`.
- [ ] Keep path-specific scenario setup diagnostics unchanged.
- [ ] Change `RetailSupplySelection` to `WorldCityId | null`.
- [ ] Delete missing-configuration sentinel, stale synthetic options, copy, and tests.
- [ ] Keep Imports only, valid sources, zero-capacity/overflow display, disabled controls, and unchanged-selection no-op behavior.
- [ ] Use `getCityInventoryStats` directly in inventory/source view models.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/components/game/RetailSupplySources.svelte.spec.ts \
  src/lib/components/game/retailSupplySources.spec.ts \
  src/lib/components/game/IndustryTileInspector.svelte.spec.ts \
  src/lib/components/game/ProductChainsPanel.svelte.spec.ts \
  src/routes/gameRouteController.spec.ts \
  src/lib/scenarios/runtime.spec.ts \
  --maxWorkers=1
```

Checkpoint: `refactor(logistics-ui): remove invalid-state recovery`

---

## Task 8: Final audit and verification

- [ ] Remove migration-only, malformed-state, and stale-recovery tests no longer protecting supported behavior.
- [ ] Run symbol audits:

```bash
rg -n "MIGRATABLE_SCHEMA_VERSIONS|migrateV[0-9]|LegacyV|allocateLegacyWarehouseMaterials|recalculateCityInventoryPressure|synchronizeCityInventoryCapacity|synchronizeAllCityInventoryCapacities|normalizeCityInventoryDerivedState|RETAIL_SUPPLY_MISSING_CONFIGURATION_VALUE|configuration-unavailable" src
rg -n "replenishmentOutcome\s*:|\.replenishmentOutcome" src
```

Expected production matches: none. The `RetailReplenishmentOutcome` type and derived helper may remain.

- [ ] Run static and full tests:

```bash
bun run check
bun run lint
bun run test:unit -- --run --maxWorkers=1
bun run test:e2e -- --workers=1
git diff --check main...HEAD
```

- [ ] Inspect the implementation PR statistics. If additions exceed deletions, re-check for leftover compatibility helpers or defensive test matrices before adding new abstractions.

Checkpoint: `test(logistics): retain simplification behavior gates`

## Completion criteria

- All eight checkpoints are in one implementation PR.
- HPA-292 gameplay behavior is retained.
- HPA-294 remains blocked until merge.
- The PR is deletion-heavy and introduces no replacement framework.
