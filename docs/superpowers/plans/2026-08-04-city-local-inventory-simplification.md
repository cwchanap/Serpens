# City-Local Inventory Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the HPA-292 city-local inventory implementation by deleting pre-release compatibility, persisting only authoritative inventory facts, deriving report outcomes, and removing duplicated validation and impossible-state recovery in one implementation PR.

**Architecture:** Bump directly to save schema 14 and support that schema only. Keep `CityInventory` as city ownership plus material quantities, derive inventory statistics through one selector, retain immutable daily summaries, and derive replenishment outcome labels from numerical facts and store-level source context. Built-in scenarios rely on the existing definition validator, normal setup transitions, and one final current-state validation.

**Tech Stack:** TypeScript, Svelte 5, Vitest, Vitest Browser, Playwright, Bun, existing repository/save abstractions.

## Global Constraints

- Deliver all cleanup phases in one implementation PR with ordered reviewable commits.
- Follow KISS and YAGNI; deletion is preferred over abstraction.
- Do not preserve pre-release save compatibility.
- Do not add compatibility wrappers or deprecated aliases.
- Do not add a generic migration, validation, serialization, or recovery framework.
- Preserve HPA-292 city isolation, replenishment quantities, cash reconciliation, and report timing.
- Keep `DailyCityInventorySummary` as the production-close historical snapshot.
- Normalize harmless collection order instead of rejecting it.
- Do not begin HPA-294 implementation in this branch.
- Finish with a meaningful net deletion in production code and durable tests.

---

## File map

### Authoritative state and domain logic

- Modify `src/lib/game/types.ts`: shrink `CityInventory`; remove persisted replenishment outcome.
- Modify `src/lib/game/cityInventory.ts`: add `CityInventoryStats` and `getCityInventoryStats`; remove pressure cache, synchronization, and migration allocation helpers.
- Modify `src/lib/game/industryProduction.ts`: derive production-close summaries and overflow charges.
- Modify `src/lib/game/railShipping.ts`: mutate material records without pressure recalculation.
- Modify `src/lib/game/retailSupply.ts`: report facts only and simplify assignment failures.
- Modify `src/lib/game/simulateDay.ts`: consume derived production summaries without synchronized inventory state.

### Readers and UI

- Modify `src/lib/game/productChainGraph.ts`, `productChainTree.ts`, and `supplyAdvisor.ts`: use derived stats.
- Modify `src/lib/components/game/IndustryTileInspector.svelte`, `ProductChainsPanel.svelte`, `ReportsPanel.svelte`, `RetailSupplySources.svelte`, and `retailSupplySources.ts`: remove stale/missing recovery and derive display values.
- Modify localization files only to delete unused recovery copy or add the unsupported-save message.

### Persistence and scenarios

- Modify `src/lib/persistence/saveTypes.ts`: schema 14.
- Modify `src/lib/persistence/saveCodec.ts`: current-schema-only decoding, authoritative validation, report-row filtering.
- Modify `src/lib/persistence/scenarioCodec.ts` and repository tests: remove embedded historical migration expectations.
- Modify `src/lib/scenarios/setup.ts` and `validation/start.ts`: normalize collections and keep meaningful setup checks.
- Delete `src/lib/scenarios/validation/cityInventory.ts` and `cityInventory.spec.ts`.

### Tests

- Retain focused tests in existing domain/component/e2e files.
- Delete migration suites and malformed-state matrices that no longer protect supported behavior.

---

### Task 1: Make save schema 14 current-only

**Files:**
- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify: `src/lib/persistence/saveRepository.spec.ts`
- Modify: `src/lib/persistence/tauriSaveRepository.spec.ts`
- Modify: `src/lib/persistence/scenarioCodec.spec.ts`

**Interfaces:**
- Produces: `SAVE_SCHEMA_VERSION = 14`
- Produces: existing public save decode functions that accept schema 14 only
- Produces: `SaveDataErrorCode` member `unsupported-version`
- Removes: every migration-stage export and migratable-version table

- [ ] **Step 1: Replace migration expectations with one unsupported-version test**

In `saveCodec.spec.ts`, add a representative test using a valid current record with only `schemaVersion` changed:

```ts
it('rejects a pre-release save from an older schema', () => {
  const record = createManualSaveRecord({ game: createCurrentV13MultiCityGame() });

  expect(() =>
    validateSaveRecord({ ...record, schemaVersion: 13 })
  ).toThrowError(
    expect.objectContaining({ code: 'unsupported-version' })
  );
});
```

Update browser/Tauri/scenario repository tests to expect the same unsupported-version result instead of successful migration.

- [ ] **Step 2: Run focused persistence tests and confirm the new test fails**

Run:

```bash
bun run test:unit -- --run src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts src/lib/persistence/scenarioCodec.spec.ts --maxWorkers=1
```

Expected: FAIL because schema 13 is still current or migratable.

- [ ] **Step 3: Bump the schema and reject all mismatches at the decode boundary**

In `saveTypes.ts`:

```ts
export const SAVE_SCHEMA_VERSION = 14;
```

In the save-record and save-store decode entry points, use one check:

```ts
if (record.schemaVersion !== SAVE_SCHEMA_VERSION) {
  throw new SaveDataError(
    'This save was created by an unsupported development version.',
    'unsupported-version'
  );
}
```

Apply the same policy to embedded scenario games. Do not call any migration function.

- [ ] **Step 4: Delete the migration implementation**

Remove from `saveCodec.ts`:

- `MIGRATABLE_SCHEMA_VERSIONS`
- migration dispatch loops/tables
- `migrateV4*` through `migrateV12*`
- `LegacyV12*` interfaces and raw types
- historical attribution reconstruction
- legacy allocation/conservation calls
- migration-only exported helpers

Delete migration-only tests rather than rewriting them for schema 14.

- [ ] **Step 5: Run focused persistence tests**

Run the command from Step 2.

Expected: PASS; current schema round-trips, and all older versions reject with `unsupported-version`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/persistence

git commit -m "refactor(persistence): drop pre-release save migrations"
```

---

### Task 2: Persist only authoritative city inventory facts

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/cityInventory.ts`
- Modify: `src/lib/game/cityInventory.spec.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/world.ts`
- Modify: `src/lib/game/industryPlacement.ts`

**Interfaces:**
- Produces:

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
): CityInventoryStats | null;
```

- Keeps: `getCityInventory`, `addCityInventoryMaterial`, `removeCityInventoryMaterial`
- Removes: pressure recalculation, synchronization, normalization, and legacy allocation APIs

- [ ] **Step 1: Write selector behavior tests**

Add focused tests:

```ts
it('derives capacity and pressure from same-city buildings and materials', () => {
  const game = gameWithTwoIndustryCities({
    industryCityWarehouses: 2,
    breadbasketWarehouses: 1,
    industryCityMaterials: { snacks: 410 }
  });

  expect(getCityInventoryStats(game, 'industry-city')).toEqual({
    capacity: 400,
    used: 410,
    overflowUnits: 10,
    overflowCost: 20
  });

  expect(getCityInventoryStats(game, 'breadbasket-basin')).toEqual({
    capacity: 200,
    used: 0,
    overflowUnits: 0,
    overflowCost: 0
  });
});
```

Add one test confirming material mutation returns an inventory containing only `cityId` and `materials`.

- [ ] **Step 2: Run city inventory tests and confirm failure**

```bash
bun run test:unit -- --run src/lib/game/cityInventory.spec.ts --maxWorkers=1
```

Expected: FAIL because `CityInventory` still stores derived fields and the selector does not exist.

- [ ] **Step 3: Change the type and initialization paths**

Update `CityInventory` and `createEmptyCityInventory`:

```ts
export function createEmptyCityInventory(cityId: WorldCityId): CityInventory {
  return { cityId, materials: {} };
}
```

Update new-game and city-opening initialization fixtures to stop setting derived fields.

- [ ] **Step 4: Implement the single derived-stat selector**

Implement `getCityInventoryStats` by combining `getCityInventory`, same-city warehouse-building capacity, and material totals. Keep one safe-integer guard for stored quantities and one checked aggregate calculation; do not preserve every historical migration boundary check.

- [ ] **Step 5: Simplify material mutation helpers**

`addCityInventoryMaterial` and `removeCityInventoryMaterial` return material-only records. Remove calls to `recalculateCityInventoryPressure`.

- [ ] **Step 6: Delete derived-state and migration helpers**

Remove:

- `recalculateCityInventoryPressure`
- `synchronizeCityInventoryCapacity`
- `synchronizeAllCityInventoryCapacities`
- `normalizeCityInventoryDerivedState`
- `LegacyMaterialAllocationInput`
- `allocateLegacyWarehouseMaterials`
- legacy-primary, material-order, and conservation helpers
- tests dedicated only to those removed functions

Remove synchronization calls from `world.ts` and `industryPlacement.ts`; building a warehouse no longer mutates inventory records.

- [ ] **Step 7: Run domain tests**

```bash
bun run test:unit -- --run src/lib/game/cityInventory.spec.ts src/lib/game/world.spec.ts src/lib/game/industryPlacement.spec.ts src/lib/game/state.spec.ts --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/cityInventory.ts src/lib/game/cityInventory.spec.ts src/lib/game/state.ts src/lib/game/state.spec.ts src/lib/game/world.ts src/lib/game/world.spec.ts src/lib/game/industryPlacement.ts src/lib/game/industryPlacement.spec.ts

git commit -m "refactor(inventory): derive city capacity and pressure"
```

---

### Task 3: Move simulation and domain readers to derived inventory stats

**Files:**
- Modify: `src/lib/game/industryProduction.ts`
- Modify: `src/lib/game/industryProduction.spec.ts`
- Modify: `src/lib/game/railShipping.ts`
- Modify: `src/lib/game/railShipping.spec.ts`
- Modify: `src/lib/game/railShipping.edge.spec.ts`
- Modify: `src/lib/game/retailSupply.ts`
- Modify: `src/lib/game/retailSupply.spec.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/game/productChainGraph.ts`
- Modify: `src/lib/game/productChainTree.ts`
- Modify: `src/lib/game/supplyAdvisor.ts`

**Interfaces:**
- Consumes: `getCityInventoryStats(game, cityId)` from Task 2
- Produces: unchanged player-visible production and replenishment quantities
- Produces: `DailyProductionReport.cityInventories` derived at production close

- [ ] **Step 1: Add a production-close regression test**

Create a test that produces enough stock to overflow one city and verifies:

```ts
expect(result.report.cityInventories).toContainEqual({
  cityId: 'industry-city',
  capacity: 200,
  used: 205,
  overflowUnits: 5,
  overflowCost: 10
});
expect(result.game.cash).toBe(cashBefore - result.report.operatingCost - result.report.importSpend - 10);
```

Keep the second industry city below capacity and assert its cost is zero.

- [ ] **Step 2: Run simulation tests and confirm failures from the type change**

```bash
bun run test:unit -- --run src/lib/game/industryProduction.spec.ts src/lib/game/railShipping.spec.ts src/lib/game/railShipping.edge.spec.ts src/lib/game/retailSupply.spec.ts src/lib/game/simulateDay.spec.ts --maxWorkers=1
```

Expected: compile/test failures where code reads or writes persisted pressure fields.

- [ ] **Step 3: Simplify rail working inventories**

Rail state maps continue to hold `CityInventory` material records. Remove pressure recalculation after pulls and pushes. `foldRailCityInventories` only replaces material records in canonical game order.

- [ ] **Step 4: Derive production-close summaries once**

After production and rail pushes:

```ts
const gameAtProductionClose = { ...normalizedGame, cityInventories };
const cityInventorySummaries = cityInventories.map((inventory) => ({
  cityId: inventory.cityId,
  ...getCityInventoryStats(gameAtProductionClose, inventory.cityId)!
}));
```

Aggregate and charge overflow from these summaries. Remove the entry-time all-city synchronization call.

- [ ] **Step 5: Update retail replenishment**

Retail replenishment continues debiting material records. Remove assumptions that the returned inventory contains recalculated pressure. Keep exact local/import quantities and contention order unchanged.

- [ ] **Step 6: Update domain readers**

Replace direct `.capacity`, `.overflowUnits`, and `.overflowCost` reads in product chains and supply advice with `getCityInventoryStats`. Do not add per-view caches.

- [ ] **Step 7: Run domain and simulation tests**

Run the command from Step 2 plus:

```bash
bun run test:unit -- --run src/lib/game/productChainGraph.spec.ts src/lib/game/productChainTree.spec.ts src/lib/game/supplyAdvisor.spec.ts --maxWorkers=1
```

Expected: PASS with the existing city-isolation and shared-source tests retained.

- [ ] **Step 8: Commit**

```bash
git add src/lib/game

git commit -m "refactor(logistics): use derived inventory statistics"
```

---

### Task 4: Store replenishment facts and derive outcome labels

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/retailSupply.ts`
- Modify: `src/lib/game/reports.ts`
- Modify or create focused helper in: `src/lib/game/reports.ts` or `src/lib/game/retailSupply.ts`
- Modify: `src/lib/game/reports.spec.ts`
- Modify: `src/lib/game/retailSupply.spec.ts`
- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- Modify: `src/lib/i18n/gameCopy.ts`

**Interfaces:**
- Removes: `DailyProductReport.replenishmentOutcome`
- Produces:

```ts
export function getRetailReplenishmentOutcome(
  context: RetailReplenishmentContext | null,
  report: Pick<DailyProductReport, 'warehouseUnits' | 'importedUnits'>
): RetailReplenishmentOutcome | null;
```

- Keeps: store-level `RetailReplenishmentContext` and numerical report facts

- [ ] **Step 1: Add derived-outcome unit tests**

Use a table covering the six meaningful results:

```ts
it.each([
  [null, 0, 0, null],
  [{ retailCityId: 'harbor-city', configuredSupplyCityId: 'industry-city', resolvedSupplyCityId: 'industry-city' }, 4, 0, 'city-inventory'],
  [{ retailCityId: 'harbor-city', configuredSupplyCityId: 'industry-city', resolvedSupplyCityId: 'industry-city' }, 2, 3, 'mixed'],
  [{ retailCityId: 'harbor-city', configuredSupplyCityId: 'industry-city', resolvedSupplyCityId: 'industry-city' }, 0, 5, 'import-only'],
  [{ retailCityId: 'harbor-city', configuredSupplyCityId: null, resolvedSupplyCityId: null }, 0, 5, 'unassigned-import'],
  [{ retailCityId: 'harbor-city', configuredSupplyCityId: 'industry-city', resolvedSupplyCityId: null }, 0, 5, 'source-unavailable-import']
])('derives replenishment outcome', (context, warehouseUnits, importedUnits, expected) => {
  expect(getRetailReplenishmentOutcome(context, { warehouseUnits, importedUnits })).toBe(expected);
});
```

- [ ] **Step 2: Run report tests and confirm failure**

```bash
bun run test:unit -- --run src/lib/game/reports.spec.ts src/lib/game/retailSupply.spec.ts src/lib/components/game/ReportsPanel.svelte.spec.ts --maxWorkers=1
```

Expected: FAIL because the helper does not exist and report components still read the persisted field.

- [ ] **Step 3: Remove the persisted outcome field**

Delete `replenishmentOutcome` from `DailyProductReport`, report builders, fixtures, and `mergeReplenishmentReport`. Keep source context once on `DailyStoreReport.replenishment`.

- [ ] **Step 4: Implement and consume the derived helper**

Add the helper to the existing report/domain module with no additional state. Update `ReportsPanel`, product-chain summary copy, and any localization builder to derive the outcome from the parent store context and product quantities.

- [ ] **Step 5: Delete semantic outcome-reconciliation tests**

Remove tests that mutate persisted outcomes and expect save rejection. Retain the derived helper table and component copy tests.

- [ ] **Step 6: Run focused tests**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/retailSupply.ts src/lib/game/retailSupply.spec.ts src/lib/game/reports.ts src/lib/game/reports.spec.ts src/lib/components/game/ReportsPanel.svelte src/lib/components/game/ReportsPanel.svelte.spec.ts src/lib/i18n/gameCopy.ts

git commit -m "refactor(reports): derive replenishment outcomes"
```

---

### Task 5: Simplify current save validation and historical report decoding

**Files:**
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify: `src/lib/persistence/scenarioCodec.ts`
- Modify: `src/lib/persistence/scenarioCodec.spec.ts`

**Interfaces:**
- Consumes: schema-14 `CityInventory` and facts-only reports
- Produces: authoritative current-state validation plus report-row filtering
- Removes: historical semantic reconciliation with current game state

- [ ] **Step 1: Add a malformed-history tolerance test**

Create a valid current game containing one valid report and one malformed historical report:

```ts
it('drops a malformed historical report without rejecting current game state', () => {
  const game = createCurrentV13MultiCityGame();
  const validReport = createCurrentV13Report(game);
  const record = createManualSaveRecord({
    game: {
      ...game,
      reports: [validReport, { day: 'bad-history' } as never]
    }
  });

  const validated = validateSaveRecord(record);

  expect(validated.game.reports).toEqual([validReport]);
});
```

Add a separate test proving malformed authoritative inventory still rejects.

- [ ] **Step 2: Run save codec tests and confirm failure**

```bash
bun run test:unit -- --run src/lib/persistence/saveCodec.spec.ts src/lib/persistence/scenarioCodec.spec.ts --maxWorkers=1
```

Expected: FAIL because historical reports are validated as part of the entire save.

- [ ] **Step 3: Validate and normalize authoritative collections**

Update current-state validation for the new inventory shape. Validate unique owners and quantities, then sort inventories and assignments by `compareWorldCityIds`. Remove persisted pressure checks and canonical-order rejection.

- [ ] **Step 4: Replace semantic report validation with independent decoding**

Create one local helper:

```ts
function decodeSavedReports(value: unknown): DailyReport[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    try {
      return [decodeSavedReportShape(candidate)];
    } catch {
      return [];
    }
  });
}
```

`decodeSavedReportShape` validates only the structure and primitive values required by current UI. It does not call `getCityInventory`, replay source accessibility, recompute historical values, or compare report summaries to current state.

- [ ] **Step 5: Delete obsolete semantic validators**

Remove helpers whose only purpose is:

- `expectedReplenishmentOutcome`
- exact historical warehouse-value reconciliation
- current-access validation for historical configured/resolved city IDs
- historical aggregate-to-city-summary reconciliation
- historical movement ownership against the current opened-city set

Keep current authoritative entity-city ownership checks.

- [ ] **Step 6: Run persistence tests**

Run the command from Step 2 and the repository tests from Task 1.

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/persistence

git commit -m "refactor(persistence): validate current state only"
```

---

### Task 6: Remove duplicate scenario validation and normalize setup

**Files:**
- Delete: `src/lib/scenarios/validation/cityInventory.ts`
- Delete: `src/lib/scenarios/validation/cityInventory.spec.ts`
- Modify: `src/lib/scenarios/setup.ts`
- Modify: `src/lib/scenarios/setup.spec.ts`
- Modify: `src/lib/scenarios/validation.ts`
- Modify: `src/lib/scenarios/validation/start.ts`
- Modify: `src/lib/scenarios/validation.spec.ts`

**Interfaces:**
- Keeps: authored definition validation in `validation/start.ts`
- Keeps: final `validateCurrentGameState(game)` after setup
- Produces: catalog-ordered inventory and assignment collections
- Removes: post-setup diagnostic matrix

- [ ] **Step 1: Add setup behavior tests**

Add one successful scenario test with:

- one city inventory material override
- one explicit supply assignment
- authored assignment order reversed from catalog order

Assert the returned game is normalized:

```ts
expect(result.game.retailSupplyAssignments.map((entry) => entry.retailCityId)).toEqual([
  'harbor-city',
  'campus-junction'
]);
```

Add one failure test where starting material quantity exceeds derived city capacity.

- [ ] **Step 2: Run scenario tests and confirm the normalization test fails**

```bash
bun run test:unit -- --run src/lib/scenarios/setup.spec.ts src/lib/scenarios/validation.spec.ts src/lib/scenarios/validation/cityInventory.spec.ts --maxWorkers=1
```

Expected: FAIL because authored ordering is rejected or post-setup validation owns the behavior.

- [ ] **Step 3: Move meaningful checks into setup application**

When applying inventory materials:

```ts
const stats = getCityInventoryStats(game, cityId);
if (!stats || used > stats.capacity) {
  return transitionFailure(path, materials, 'Starting city inventory exceeds city capacity.');
}
```

When applying assignments, require `null` or a current opened supply inventory. Return one concise setup diagnostic.

- [ ] **Step 4: Normalize collections**

Sort `game.cityInventories` and `game.retailSupplyAssignments` with `compareWorldCityIds` after applying overrides. Remove authored canonical-order rejection from `validation/start.ts`.

- [ ] **Step 5: Delete the duplicate validator module**

Remove both `validation/cityInventory.ts` and its large malformed-state test file. Remove imports and calls from `setup.ts` and validation barrels.

- [ ] **Step 6: Keep one final current-state gate**

Continue calling `validateCurrentGameState(game)` once after setup. Do not add a replacement post-setup validator.

- [ ] **Step 7: Run scenario tests**

```bash
bun run test:unit -- --run src/lib/scenarios/setup.spec.ts src/lib/scenarios/validation.spec.ts src/lib/persistence/scenarioCodec.spec.ts --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/scenarios

git commit -m "refactor(scenarios): remove duplicate inventory validation"
```

---

### Task 7: Remove impossible-state UI and collapse assignment failures

**Files:**
- Modify: `src/lib/game/retailSupply.ts`
- Modify: `src/lib/game/commandResult.ts`
- Modify: `src/lib/scenarios/runtime.ts`
- Modify: `src/routes/gameRouteController.ts`
- Modify: `src/lib/components/game/retailSupplySources.ts`
- Modify: `src/lib/components/game/RetailSupplySources.svelte`
- Modify: associated specs and localization files
- Modify: `src/lib/components/game/IndustryTileInspector.svelte`
- Modify: `src/lib/components/game/ProductChainsPanel.svelte`

**Interfaces:**
- Produces:

```ts
export type RetailSupplyAssignmentFailure =
  | 'invalid-retail-city'
  | 'invalid-supply-city';
```

- Produces: `RetailSupplySelection = WorldCityId | null`
- Removes: missing-configuration sentinel and stale synthetic source options

- [ ] **Step 1: Rewrite component tests around valid current state**

Keep tests for:

- available sources
- explicit Imports only
- disabled controls while mutations are unavailable
- unchanged selection suppression
- zero-capacity and overflow display

Delete tests for missing assignment, stale source, synthetic unavailable option, and per-reason rejected copy.

- [ ] **Step 2: Run focused UI/controller tests and confirm compile failures after the expected type edits**

```bash
bun run test:unit -- --run src/lib/components/game/RetailSupplySources.svelte.spec.ts src/lib/components/game/retailSupplySources.spec.ts src/routes/gameRouteController.spec.ts src/lib/scenarios/runtime.spec.ts --maxWorkers=1
```

- [ ] **Step 3: Collapse command failures**

Map all invalid retail-owner cases to `invalid-retail-city` and all invalid non-null source cases to `invalid-supply-city`. Preserve `{ ok: true, changed: false }` for unchanged selections.

Update route/scenario plumbing to pass only the collapsed result or one generic `rejected` status; do not add new wrapper types.

- [ ] **Step 4: Simplify the view model**

Use:

```ts
export type RetailSupplySelection = WorldCityId | null;
```

Assume every opened retail city has an assignment after save/setup validation. Build options from current accessible industry inventories plus Imports only. Remove:

- `RETAIL_SUPPLY_MISSING_CONFIGURATION_VALUE`
- `'missing'`
- `createUnavailableSourceOption`
- missing/stale labels and branches

- [ ] **Step 5: Update inventory-stat readers**

Industry inspector, product chains, and source option summaries derive capacity and pressure through `getCityInventoryStats`.

- [ ] **Step 6: Run focused UI/controller tests**

Run the command from Step 2 plus:

```bash
bun run test:unit -- --run src/lib/components/game/IndustryTileInspector.svelte.spec.ts src/lib/components/game/ProductChainsPanel.svelte.spec.ts --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/retailSupply.ts src/lib/game/commandResult.ts src/lib/scenarios/runtime.ts src/routes/gameRouteController.ts src/lib/components/game src/lib/i18n

git commit -m "refactor(logistics-ui): remove invalid-state recovery"
```

---

### Task 8: Trim tests and complete the single-PR verification gate

**Files:**
- Modify/delete: migration-only persistence tests
- Modify/delete: malformed-state scenario and UI tests
- Modify: `src/routes/retail-sim.e2e.ts` only if fixtures require schema-14 shape changes
- Modify: HPA-554 docs if implementation reveals a concrete contract correction

**Interfaces:**
- Produces: final durable behavior-focused test set
- Produces: evidence of net code deletion

- [ ] **Step 1: Audit removed contracts**

Run:

```bash
rg -n "MIGRATABLE_SCHEMA_VERSIONS|migrateV[0-9]|LegacyV|allocateLegacyWarehouseMaterials|recalculateCityInventoryPressure|synchronize(All|City)CityInventory|normalizeCityInventoryDerivedState|replenishmentOutcome|RETAIL_SUPPLY_MISSING_CONFIGURATION_VALUE|configuration-unavailable" src
```

Expected: no production matches. Test or documentation matches are allowed only when explicitly asserting absence.

- [ ] **Step 2: Run static checks**

```bash
bun run check
bun run lint
```

Expected: PASS with zero Svelte/TypeScript errors and no lint failures.

- [ ] **Step 3: Run focused logistics and persistence tests**

```bash
bun run test:unit -- --run \
  src/lib/game/cityInventory.spec.ts \
  src/lib/game/industryProduction.spec.ts \
  src/lib/game/railShipping.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/productChainGraph.spec.ts \
  src/lib/game/productChainTree.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/persistence/scenarioCodec.spec.ts \
  src/lib/scenarios/setup.spec.ts \
  --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 4: Run full unit and browser suites**

```bash
bun run test:unit -- --run --maxWorkers=1
bun run test:e2e -- --workers=1
```

Expected: PASS.

- [ ] **Step 5: Verify code reduction**

```bash
git diff --stat main...HEAD
git diff --numstat main...HEAD | awk '{ added += $1; removed += $2 } END { print "added", added, "removed", removed, "net", added-removed }'
```

Expected: total removed lines exceed added lines. If not, inspect whether obsolete tests or compatibility helpers remain before adding abstractions.

- [ ] **Step 6: Run diff hygiene checks**

```bash
git diff --check main...HEAD
rg -n "FIXME|PLACEHOLDER|deprecated|compatibility wrapper" docs/superpowers/specs/2026-08-04-city-local-inventory-simplification-design.md docs/superpowers/plans/2026-08-04-city-local-inventory-simplification.md src
```

Expected: clean diff; no unfinished implementation markers or compatibility wrappers introduced by HPA-554.

- [ ] **Step 7: Commit final fixture/test cleanup**

```bash
git add -A

git commit -m "test(logistics): retain simplification behavior gates"
```

- [ ] **Step 8: Prepare the implementation PR description**

The PR description must include:

- schema 14 current-only policy
- authoritative `CityInventory` shape
- derived stats and historical snapshot timing
- facts-only replenishment reports
- removed scenario/UI recovery paths
- retained behavior tests
- exact static/unit/e2e results
- added/removed/net line counts
- confirmation that HPA-294 remains blocked until merge
