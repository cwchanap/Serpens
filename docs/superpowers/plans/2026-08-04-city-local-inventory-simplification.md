# City-Local Inventory Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the HPA-292 city-local inventory implementation by deleting pre-release compatibility, persisting only authoritative inventory facts, deriving report outcomes, and removing duplicated validation and impossible-state recovery in one implementation PR.

**Architecture:** Bump directly to save schema 14 and support that schema only. Keep `CityInventory` as city ownership plus material quantities, derive inventory statistics through one selector, retain immutable daily summaries, and derive replenishment outcome labels from numerical facts and store-level source context. Built-in scenarios rely on the existing definition validator, normal setup transitions, and one final current-state validation.

**Tech Stack:** TypeScript, Svelte 5, Vitest, Vitest Browser, Playwright, Bun, existing repository/save abstractions.

## Global Constraints

- Start the implementation branch from `main` after the documentation PR is merged.
- Deliver all cleanup phases in one implementation PR with ordered reviewable commits.
- Keep every task green before moving to the next task.
- Follow KISS and YAGNI; deletion is preferred over abstraction.
- Do not preserve pre-release save compatibility.
- Do not add compatibility wrappers or deprecated aliases.
- Do not add a generic migration, validation, serialization, or recovery framework.
- Preserve HPA-292 city isolation, replenishment quantities, cash reconciliation, and report timing.
- Keep `DailyCityInventorySummary` as the production-close historical snapshot.
- Keep aggregate report fields `warehouseCapacity`, `warehouseUsed`, `overflowUnits`, and `overflowCost` unchanged.
- Normalize harmless collection order instead of rejecting it.
- Do not begin HPA-294 implementation in this branch.
- Finish with a meaningful net deletion in production code and durable tests, measured against the implementation branch only.

## Schema lifecycle

Schema 14 is the only accepted version throughout this implementation PR. Task 1 establishes `SAVE_SCHEMA_VERSION = 14` and removes persistence migrations before Tasks 2 and 4 change the inventory and report shapes.

Intermediate commits may therefore encode the former schema-13 shape under version 14. This is intentional and acceptable because the branch is unreleased, schema 13 is rejected at every commit, no 13-to-14 migration exists, and later tasks complete the final schema-14 shape before merge.

Rename schema-specific fixture helpers to current/schema-14 names in Task 1. Do not leave helpers named `createCurrentV13*` after schema 14 becomes current.

---

## File map

### Repository doctrine and persistence

- Modify `CLAUDE.md`: replace the legacy-save migration paragraph with the current-only pre-release policy.
- Modify `src/lib/persistence/saveTypes.ts`: set schema 14.
- Modify `src/lib/persistence/saveCodec.ts`: current-schema-only decoding, authoritative validation, and report-row filtering.
- Modify `src/lib/persistence/saveStoreRepository.ts`: rethrow `unsupported-version` instead of silently clearing it.
- Modify `src/lib/persistence/scenarioCodec.ts`: remove embedded historical migration expectations.
- Modify persistence repository and codec specs.

### Authoritative state and domain logic

- Modify `src/lib/game/types.ts`: shrink `CityInventory`; remove persisted replenishment outcome.
- Modify `src/lib/game/cityInventory.ts`: add `CityInventoryStats` and `getCityInventoryStats`; remove pressure cache, synchronization, and domain legacy-allocation helpers.
- Modify `src/lib/game/industryProduction.ts`: derive production-close summaries and overflow charges.
- Modify `src/lib/game/railShipping.ts`: mutate material records without pressure recalculation.
- Modify `src/lib/game/retailSupply.ts`: report facts only and simplify live assignment failures.
- Modify `src/lib/game/stock.ts` and `src/lib/game/simulateDay.ts`: remove `replenishmentOutcome` initializers and consume facts-only reports.

### Readers and UI

- Modify `src/lib/game/productChainGraph.ts`, `productChainTree.ts`, and `supplyAdvisor.ts`: use derived stats and derived report outcomes where needed.
- Modify `src/lib/components/game/IndustryTileInspector.svelte`, `ProductChainsPanel.svelte`, `ReportsPanel.svelte`, `RetailSupplySources.svelte`, and `retailSupplySources.ts`: remove stale/missing recovery and derive display values.
- Modify `src/routes/+page.svelte`: map `unsupported-version` to dedicated localized copy.
- Modify `src/routes/gameRouteController.ts` only where live retail failure plumbing can be simplified without adding a new result framework.
- Modify localization files to remove unused recovery copy and add the unsupported-save message.

### Scenarios

- Modify `src/lib/scenarios/setup.ts` and `validation/start.ts`: normalize collections and keep meaningful setup checks.
- Delete `src/lib/scenarios/validation/cityInventory.ts` and `cityInventory.spec.ts`.
- Keep path-specific setup diagnostics separate from collapsed live command errors.

### E2E and durable tests

- Modify `src/routes/retail-sim.e2e.ts`: remove `recalculateCityInventoryPressure`, build schema-14 material-only inventory fixtures, and retain the logistics lifecycle flow.
- Delete migration suites and malformed-state matrices that no longer protect supported behavior.

---

### Task 1: Make save schema 14 current-only and surface unsupported saves

**Files:**
- Modify: `CLAUDE.md`
- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify: `src/lib/persistence/saveStoreRepository.ts`
- Modify: `src/lib/persistence/saveRepository.spec.ts`
- Modify: `src/lib/persistence/tauriSaveRepository.spec.ts`
- Modify: `src/lib/persistence/scenarioCodec.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/page.svelte.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`

**Interfaces:**
- Produces: `SAVE_SCHEMA_VERSION = 14`
- Produces: existing public save decode functions that accept schema 14 only
- Produces: `SaveDataErrorCode` member `unsupported-version`
- Produces: localized `route.save.errorUnsupportedVersion`
- Removes: persistence migration-stage exports and migratable-version table
- Keeps temporarily: domain allocation/synchronization helpers still needed until Task 2

- [ ] **Step 1: Rename current-schema fixtures**

Rename helpers such as:

```ts
createCurrentV13MultiCityGame
createCurrentV13Report
```

to neutral or schema-14 names:

```ts
createCurrentMultiCityGame
createCurrentReport
```

Update their call sites in the persistence specs before adding new expectations.

- [ ] **Step 2: Write codec, repository, and page error tests**

In `saveCodec.spec.ts`, add:

```ts
it('rejects a pre-release save from an older schema', () => {
  const record = createManualSaveRecord({ game: createCurrentMultiCityGame() });

  expect(() => validateSaveRecord({ ...record, schemaVersion: 13 })).toThrowError(
    expect.objectContaining({ code: 'unsupported-version' })
  );
});
```

In `saveRepository.spec.ts`, preserve ordinary corruption recovery but require unsupported versions to surface:

```ts
it('rethrows unsupported development versions instead of replacing them with an empty store', async () => {
  const driver = driverWhoseReadThrows(
    new SaveDataError('unsupported', 'unsupported-version')
  );
  const repository = new SaveRepositoryFromDriver(driver);

  await expect(repository.getSummary()).rejects.toMatchObject({
    code: 'unsupported-version'
  });
});
```

In `page.svelte.spec.ts`, assert that `describeSaveErrorKey` behavior reaches the dedicated copy through save initialization or panel refresh:

```ts
expect(screen.getByText('This save was created by an unsupported development version.')).toBeVisible();
```

- [ ] **Step 3: Run focused tests and confirm failure**

```bash
bun run test:unit -- --run \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/persistence/saveRepository.spec.ts \
  src/lib/persistence/tauriSaveRepository.spec.ts \
  src/lib/persistence/scenarioCodec.spec.ts \
  src/routes/page.svelte.spec.ts \
  --maxWorkers=1
```

Expected: FAIL because schema 13 is still current/migratable and unsupported versions are silently cleared or mapped to generic corrupt copy.

- [ ] **Step 4: Bump the schema and reject every mismatch at the decode boundary**

In `saveTypes.ts`:

```ts
export const SAVE_SCHEMA_VERSION = 14;
```

In save-record and save-store decode entry points:

```ts
if (record.schemaVersion !== SAVE_SCHEMA_VERSION) {
  throw new SaveDataError(
    'This save was created by an unsupported development version.',
    'unsupported-version'
  );
}
```

Apply the same current-only policy to embedded scenario games. Do not call a migration function.

- [ ] **Step 5: Make unsupported-version observable without adding a new framework**

In `SaveRepositoryFromDriver.readSnapshot`, keep empty-store recovery for ordinary malformed current data and rethrow only the unsupported version:

```ts
if (error instanceof SaveDataError) {
  if (error.code === 'unsupported-version') throw error;
  return createEmptySaveStore();
}
```

In `describeSaveErrorKey`:

```ts
case 'unsupported-version':
  return 'route.save.errorUnsupportedVersion';
```

Add the localized message in all three locale files. `GameRouteController.initializeSaves` already propagates repository errors to the page wrapper; do not introduce another controller result union.

- [ ] **Step 6: Delete persistence migration implementation only**

Remove from `saveCodec.ts`:

- `MIGRATABLE_SCHEMA_VERSIONS`
- migration dispatch loops/tables
- `migrateV4*` through `migrateV12*`
- `LegacyV12*` interfaces and raw wire types
- historical attribution reconstruction
- persistence calls into legacy allocation/conservation
- migration-only exported helpers

Do **not** delete `allocateLegacyWarehouseMaterials`, `normalizeCityInventoryDerivedState`, or synchronization functions from `cityInventory.ts` in this task. Task 2 owns those domain deletions after all remaining consumers are ready.

Delete migration-only persistence tests rather than rewriting them for schema 14.

- [ ] **Step 7: Update repository doctrine**

Replace the `CLAUDE.md` legacy-save paragraph with:

```md
**Pre-release save policy:** Only the current save schema is supported. The game has no production users, so old development autosaves are rejected rather than migrated. Do not add migration paths, compatibility wrappers, or legacy-size regeneration unless a released version creates a real compatibility requirement.
```

Remove the stale statement that the 28×24 regeneration safety net remains supported if Task 1 deletes that path.

- [ ] **Step 8: Run focused persistence and page tests**

Run the command from Step 3.

Expected: PASS; current schema round-trips, older versions surface `unsupported-version`, ordinary corrupt data retains existing cheap recovery, and page copy is dedicated.

- [ ] **Step 9: Commit**

```bash
git add CLAUDE.md src/lib/persistence src/routes/+page.svelte src/routes/page.svelte.spec.ts src/lib/i18n/messages

git commit -m "refactor(persistence): drop pre-release save migrations"
```

---

### Task 2: Persist only authoritative city inventory facts

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/cityInventory.ts`
- Modify: `src/lib/game/cityInventory.spec.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/state.spec.ts`
- Modify: `src/lib/game/world.ts`
- Modify: `src/lib/game/world.spec.ts`
- Modify: `src/lib/game/industryPlacement.ts`
- Modify: `src/lib/game/industryPlacement.spec.ts`

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
- Removes: pressure recalculation, synchronization, normalization, and domain legacy-allocation APIs

- [ ] **Step 1: Write selector behavior tests**

Add:

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

Add one test confirming a material mutation returns an inventory containing only `cityId` and `materials`.

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

Update new-game, starter-map, scenario, and city-opening fixtures to stop setting derived fields.

- [ ] **Step 4: Implement the single derived-stat selector**

Implement `getCityInventoryStats` by combining `getCityInventory`, same-city warehouse-building capacity, and material totals. Keep one safe-integer guard for stored quantities and checked aggregate calculations; do not preserve historical migration checks.

- [ ] **Step 5: Simplify material mutation helpers**

`addCityInventoryMaterial` and `removeCityInventoryMaterial` return material-only records. Remove calls to `recalculateCityInventoryPressure`.

- [ ] **Step 6: Delete derived-state and domain migration helpers**

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
bun run test:unit -- --run \
  src/lib/game/cityInventory.spec.ts \
  src/lib/game/world.spec.ts \
  src/lib/game/industryPlacement.spec.ts \
  src/lib/game/state.spec.ts \
  --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/cityInventory.ts src/lib/game/cityInventory.spec.ts src/lib/game/state.ts src/lib/game/state.spec.ts src/lib/game/world.ts src/lib/game/world.spec.ts src/lib/game/industryPlacement.ts src/lib/game/industryPlacement.spec.ts

git commit -m "refactor(inventory): derive city capacity and pressure"
```

---

### Task 3: Move simulation, E2E fixtures, and readers to derived inventory stats

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
- Modify: `src/routes/retail-sim.e2e.ts`

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
expect(result.game.cash).toBe(
  cashBefore - result.report.operatingCost - result.report.importSpend - 10
);
```

Keep the second industry city below capacity and assert its cost is zero.

- [ ] **Step 2: Run simulation tests and confirm failures from the type change**

```bash
bun run test:unit -- --run \
  src/lib/game/industryProduction.spec.ts \
  src/lib/game/railShipping.spec.ts \
  src/lib/game/railShipping.edge.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  --maxWorkers=1
```

Expected: compile/test failures where code reads or writes persisted pressure fields.

- [ ] **Step 3: Simplify rail working inventories**

Rail state maps continue to hold `CityInventory` material records. Remove pressure recalculation after pulls and pushes. `foldRailCityInventories` only replaces material records in canonical game order.

- [ ] **Step 4: Derive production-close summaries with an explicit invariant**

After production and rail pushes:

```ts
const gameAtProductionClose = { ...normalizedGame, cityInventories };
const cityInventorySummaries = cityInventories.map((inventory) => {
  const stats = getCityInventoryStats(gameAtProductionClose, inventory.cityId);
  if (!stats) {
    throw new Error(
      `Missing current city inventory stats for ${inventory.cityId} at production close`
    );
  }
  return { cityId: inventory.cityId, ...stats };
});
```

Do not use `!` and do not silently filter an orphan inventory. Current-state validation treats it as a hard invariant failure.

Aggregate and charge overflow from these summaries. Remove the entry-time all-city synchronization call.

- [ ] **Step 5: Update retail replenishment and readers**

Retail replenishment continues debiting material records. Remove assumptions that returned inventories contain recalculated pressure. Keep exact local/import quantities and contention order unchanged.

Replace direct `.capacity`, `.overflowUnits`, and `.overflowCost` reads in product chains and supply advice with `getCityInventoryStats`. Do not add per-view caches.

- [ ] **Step 6: Update Playwright fixtures explicitly**

In `src/routes/retail-sim.e2e.ts`:

- remove the `recalculateCityInventoryPressure` import;
- construct `CityInventory` fixtures with `cityId` and `materials` only;
- leave production-close report summaries with their historical derived fields;
- update saved snapshot fixtures to schema 14.

- [ ] **Step 7: Run domain, static, and targeted E2E checks**

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
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "city-local inventory lifecycle" --workers=1
```

Expected: PASS with existing city-isolation/shared-source behavior and the updated E2E fixture.

- [ ] **Step 8: Commit**

```bash
git add src/lib/game src/routes/retail-sim.e2e.ts

git commit -m "refactor(logistics): use derived inventory statistics"
```

---

### Task 4: Store replenishment facts and derive outcome labels

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/retailSupply.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/reports.ts`
- Modify: `src/lib/game/productChainGraph.ts`
- Modify: associated game specs
- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- Modify: `src/lib/i18n/gameCopy.ts`

**Interfaces:**
- Removes: persisted property `DailyProductReport.replenishmentOutcome`
- Keeps: `RetailReplenishmentOutcome` as a presentation-domain return type
- Produces:

```ts
export function getRetailReplenishmentOutcome(
  context: RetailReplenishmentContext | null,
  report: Pick<DailyProductReport, 'warehouseUnits' | 'importedUnits'>
): RetailReplenishmentOutcome | null;
```

- Keeps: store-level `RetailReplenishmentContext` and numerical report facts

- [ ] **Step 1: Add the complete derived-outcome table**

```ts
it.each([
  [null, 0, 0, null],
  [null, 4, 2, null],
  [
    {
      retailCityId: 'harbor-city',
      configuredSupplyCityId: 'industry-city',
      resolvedSupplyCityId: 'industry-city'
    },
    4,
    0,
    'city-inventory'
  ],
  [
    {
      retailCityId: 'harbor-city',
      configuredSupplyCityId: 'industry-city',
      resolvedSupplyCityId: 'industry-city'
    },
    2,
    3,
    'mixed'
  ],
  [
    {
      retailCityId: 'harbor-city',
      configuredSupplyCityId: null,
      resolvedSupplyCityId: null
    },
    2,
    3,
    'mixed'
  ],
  [
    {
      retailCityId: 'harbor-city',
      configuredSupplyCityId: 'industry-city',
      resolvedSupplyCityId: 'industry-city'
    },
    0,
    5,
    'import-only'
  ],
  [
    {
      retailCityId: 'harbor-city',
      configuredSupplyCityId: null,
      resolvedSupplyCityId: null
    },
    0,
    5,
    'unassigned-import'
  ],
  [
    {
      retailCityId: 'harbor-city',
      configuredSupplyCityId: 'industry-city',
      resolvedSupplyCityId: null
    },
    0,
    5,
    'source-unavailable-import'
  ]
])(
  'derives replenishment outcome',
  (context, warehouseUnits, importedUnits, expected) => {
    expect(
      getRetailReplenishmentOutcome(context, { warehouseUnits, importedUnits })
    ).toBe(expected);
  }
);
```

This locks two edge decisions:

- nonzero quantities with `context === null` return `null` rather than inventing source evidence;
- local plus imported quantities return `mixed` before inspecting configured-source fields.

- [ ] **Step 2: Run report tests and confirm failure**

```bash
bun run test:unit -- --run \
  src/lib/game/reports.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/components/game/ReportsPanel.svelte.spec.ts \
  --maxWorkers=1
```

Expected: FAIL because the helper does not exist and constructors/components still use the persisted field.

- [ ] **Step 3: Remove the persisted outcome field everywhere**

Delete `replenishmentOutcome` from:

- `DailyProductReport` in `types.ts`;
- base product report construction in `stock.ts`;
- daily report merging/construction in `simulateDay.ts`;
- `mergeReplenishmentReport` in `retailSupply.ts`;
- product/report fixtures and persistence fixtures;
- readers that access `product.replenishmentOutcome`.

Keep source context once on `DailyStoreReport.replenishment`.

- [ ] **Step 4: Implement the exact precedence helper**

```ts
export function getRetailReplenishmentOutcome(
  context: RetailReplenishmentContext | null,
  report: Pick<DailyProductReport, 'warehouseUnits' | 'importedUnits'>
): RetailReplenishmentOutcome | null {
  if (report.warehouseUnits <= 0 && report.importedUnits <= 0) return null;
  if (!context) return null;
  if (report.warehouseUnits > 0 && report.importedUnits > 0) return 'mixed';
  if (report.warehouseUnits > 0) return 'city-inventory';
  if (context.configuredSupplyCityId === null) return 'unassigned-import';
  if (context.resolvedSupplyCityId === null) return 'source-unavailable-import';
  return 'import-only';
}
```

Do not persist the helper result.

- [ ] **Step 5: Update presentation consumers**

Update `ReportsPanel`, product-chain copy, and localization builders to pass the parent store's `replenishment` context plus each product's quantities.

- [ ] **Step 6: Delete semantic outcome-reconciliation tests**

Remove tests that mutate persisted outcome labels and expect save rejection. Retain the complete helper table and component copy tests.

- [ ] **Step 7: Run focused tests**

Run the command from Step 2.

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/game src/lib/components/game/ReportsPanel.svelte src/lib/components/game/ReportsPanel.svelte.spec.ts src/lib/i18n/gameCopy.ts

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

- [ ] **Step 1: Add surviving-order and total-drop tests**

Create two malformed rows around one valid row:

```ts
it('drops malformed historical rows and preserves valid sibling order', () => {
  const game = createCurrentMultiCityGame();
  const validReport = createCurrentReport(game);
  const record = createManualSaveRecord({
    game: {
      ...game,
      reports: [
        { day: 'bad-before' } as never,
        validReport,
        { day: 'bad-after' } as never
      ]
    }
  });

  const validated = validateSaveRecord(record);

  expect(validated.game.reports).toEqual([validReport]);
});
```

Add:

```ts
it('accepts an empty report history when every historical row is malformed', () => {
  const game = createCurrentMultiCityGame();
  const record = createManualSaveRecord({
    game: {
      ...game,
      reports: [{ day: 'bad' } as never]
    }
  });

  expect(validateSaveRecord(record).game.reports).toEqual([]);
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

`decodeSavedReportShape` validates only structure and primitive values required by current UI. It does not call `getCityInventory`, replay source accessibility, recompute historical values, compare report summaries to current state, or fill missing fields.

- [ ] **Step 5: Delete obsolete semantic validators**

Remove helpers whose only purpose is:

- persisted outcome reconciliation;
- exact historical warehouse-value reconciliation;
- current-access validation for historical configured/resolved city IDs;
- historical aggregate-to-city-summary reconciliation;
- historical movement ownership against the current opened-city set.

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
- Keeps: path- and city-specific setup diagnostics
- Removes: post-setup malformed-state diagnostic matrix

- [ ] **Step 1: Add setup behavior tests**

Add one successful scenario test with:

- all warehouse buildings authored in `start.industrialBuildings`;
- one city inventory material override;
- one explicit supply assignment;
- authored assignment order reversed from catalog order.

Assert the returned game is normalized:

```ts
expect(result.game.retailSupplyAssignments.map((entry) => entry.retailCityId)).toEqual([
  'harbor-city',
  'campus-junction'
]);
```

Add one failure test where starting material quantity exceeds capacity derived from the already materialized starting warehouses. Assert the diagnostic includes the authored path and city value.

- [ ] **Step 2: Run scenario tests and confirm failure**

```bash
bun run test:unit -- --run \
  src/lib/scenarios/setup.spec.ts \
  src/lib/scenarios/validation.spec.ts \
  src/lib/scenarios/validation/cityInventory.spec.ts \
  --maxWorkers=1
```

Expected: FAIL because authored ordering is rejected or post-setup validation owns the behavior.

- [ ] **Step 3: Preserve and document setup ordering**

Keep `buildScenarioGame` in this order:

1. definition validation;
2. city/store materialization;
3. all authored industrial buildings;
4. rails;
5. general overrides;
6. city inventory materials and derived-capacity check;
7. retail supply assignments;
8. normalization;
9. one final current-state validation.

Do not run the capacity check before all authored warehouse buildings are placed.

- [ ] **Step 4: Move meaningful checks into setup application**

When applying inventory materials:

```ts
const stats = getCityInventoryStats(game, cityId);
if (!stats || used > stats.capacity) {
  return transitionFailure(
    path,
    { cityId, materials },
    `Starting city inventory for ${cityId} exceeds city capacity.`
  );
}
```

When applying assignments, require `null` or a current opened supply inventory. Keep the diagnostic path and invalid city value. This diagnostic remains richer than the live UI command failure from Task 7.

- [ ] **Step 5: Normalize collections**

Sort `game.cityInventories` and `game.retailSupplyAssignments` with `compareWorldCityIds` after applying overrides. Remove authored canonical-order rejection from `validation/start.ts`.

- [ ] **Step 6: Delete the duplicate validator module**

Remove both `validation/cityInventory.ts` and its malformed-state test file. Remove imports and calls from `setup.ts` and validation barrels.

- [ ] **Step 7: Keep one final current-state gate**

Continue calling `validateCurrentGameState(game)` once after setup. Do not add a replacement post-setup validator.

- [ ] **Step 8: Run scenario tests**

```bash
bun run test:unit -- --run src/lib/scenarios/setup.spec.ts src/lib/scenarios/validation.spec.ts src/lib/persistence/scenarioCodec.spec.ts --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/scenarios

git commit -m "refactor(scenarios): remove duplicate inventory validation"
```

---

### Task 7: Remove impossible-state UI and collapse live assignment failures

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
- Does not change: path-specific scenario setup diagnostics from Task 6

- [ ] **Step 1: Rewrite component tests around valid current state**

Keep tests for:

- available sources;
- explicit Imports only;
- disabled controls while mutations are unavailable;
- unchanged selection suppression;
- zero-capacity and overflow display.

Delete tests for missing assignment, stale source, synthetic unavailable option, and per-reason rejected copy.

- [ ] **Step 2: Run focused UI/controller tests and confirm expected failures**

```bash
bun run test:unit -- --run \
  src/lib/components/game/RetailSupplySources.svelte.spec.ts \
  src/lib/components/game/retailSupplySources.spec.ts \
  src/routes/gameRouteController.spec.ts \
  src/lib/scenarios/runtime.spec.ts \
  --maxWorkers=1
```

- [ ] **Step 3: Collapse live command failures**

Map all invalid retail-owner cases to `invalid-retail-city` and all invalid non-null source cases to `invalid-supply-city`. Preserve `{ ok: true, changed: false }` for unchanged selections.

Update route/scenario command plumbing to carry only the collapsed live result or existing generic rejected status. Do not reuse this collapsed type for scenario setup diagnostics.

- [ ] **Step 4: Simplify the view model**

```ts
export type RetailSupplySelection = WorldCityId | null;
```

Assume every opened retail city has an assignment after save/setup validation. Build options from current accessible industry inventories plus Imports only. Remove:

- `RETAIL_SUPPLY_MISSING_CONFIGURATION_VALUE`;
- `'missing'`;
- `createUnavailableSourceOption`;
- missing/stale labels and branches.

- [ ] **Step 5: Update inventory-stat readers**

Industry inspector, product chains, and source option summaries derive capacity and pressure through `getCityInventoryStats`.

- [ ] **Step 6: Run focused UI/controller tests**

Run the command from Step 2 plus:

```bash
bun run test:unit -- --run \
  src/lib/components/game/IndustryTileInspector.svelte.spec.ts \
  src/lib/components/game/ProductChainsPanel.svelte.spec.ts \
  --maxWorkers=1
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
- Verify: `src/routes/retail-sim.e2e.ts` schema-14 fixture updates from Task 3
- Modify: HPA-554 docs only if implementation proves a concrete contract correction

**Interfaces:**
- Produces: final durable behavior-focused test set
- Produces: evidence of implementation-only net code deletion

- [ ] **Step 1: Audit removed migration and pressure contracts**

```bash
rg -n "MIGRATABLE_SCHEMA_VERSIONS|migrateV[0-9]|LegacyV|allocateLegacyWarehouseMaterials|recalculateCityInventoryPressure|synchronizeCityInventoryCapacity|synchronizeAllCityInventoryCapacities|normalizeCityInventoryDerivedState|RETAIL_SUPPLY_MISSING_CONFIGURATION_VALUE|configuration-unavailable" src
```

Expected: no production matches. Test/documentation matches are allowed only when explicitly asserting absence.

- [ ] **Step 2: Audit removal of the persisted outcome field without banning the type**

```bash
rg -n "replenishmentOutcome\s*:|\.replenishmentOutcome" src/lib src/routes
```

Expected: no production declaration, initializer, or property read for a persisted `replenishmentOutcome` field. The `RetailReplenishmentOutcome` type alias and `getRetailReplenishmentOutcome` helper are allowed and should remain.

- [ ] **Step 3: Run static checks**

```bash
bun run check
bun run lint
```

Expected: PASS with zero Svelte/TypeScript errors and no lint failures.

- [ ] **Step 4: Run focused logistics and persistence tests**

```bash
bun run test:unit -- --run \
  src/lib/game/cityInventory.spec.ts \
  src/lib/game/industryProduction.spec.ts \
  src/lib/game/railShipping.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/productChainGraph.spec.ts \
  src/lib/game/productChainTree.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/persistence/saveRepository.spec.ts \
  src/lib/persistence/scenarioCodec.spec.ts \
  src/lib/scenarios/setup.spec.ts \
  src/routes/page.svelte.spec.ts \
  --maxWorkers=1
```

Expected: PASS.

- [ ] **Step 5: Run full unit and browser suites**

```bash
bun run test:unit -- --run --maxWorkers=1
bun run test:e2e -- --workers=1
```

Expected: PASS, including `retail-sim.e2e.ts` with no pressure-helper import.

- [ ] **Step 6: Verify implementation-only code reduction**

Because the implementation branch starts after this docs PR merges, use:

```bash
git diff --stat main...HEAD
git diff --numstat main...HEAD | awk '{ added += $1; removed += $2 } END { print "added", added, "removed", removed, "net", added-removed }'
```

Expected: total removed lines exceed added lines. The result measures the implementation PR only; do not include the approximately 1.2k lines introduced by the documentation PR.

If removed lines do not exceed added lines, inspect whether obsolete tests, migration code, or recovery branches remain before adding abstractions.

- [ ] **Step 7: Run diff hygiene checks**

```bash
git diff --check main...HEAD
rg -n "FIXME|PLACEHOLDER|deprecated|compatibility wrapper" docs/superpowers/specs/2026-08-04-city-local-inventory-simplification-design.md docs/superpowers/plans/2026-08-04-city-local-inventory-simplification.md src
```

Expected: clean diff; no unfinished implementation markers or compatibility wrappers introduced by HPA-554.

- [ ] **Step 8: Commit final fixture/test cleanup**

```bash
git add -A

git commit -m "test(logistics): retain simplification behavior gates"
```

- [ ] **Step 9: Prepare the implementation PR description**

The PR description must include:

- schema 14 current-only lifecycle and unsupported-version presentation;
- authoritative `CityInventory` shape;
- derived stats and explicit production-close invariant handling;
- historical snapshot timing and unchanged aggregate field names;
- facts-only replenishment reports and outcome precedence;
- removed scenario/UI recovery paths;
- retained path-specific scenario diagnostics;
- retained behavior tests;
- exact static/unit/e2e results;
- implementation-only added/removed/net line counts;
- confirmation that HPA-294 remains blocked until merge.
