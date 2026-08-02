# City-Local Inventory, Production, and Replenishment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the global warehouse with deterministic city-owned inventories, city-scoped production and replenishment, strict v13 persistence, and player-facing city inventory controls without introducing HPA-294 transfer mechanics.

**Architecture:** `GameState` owns canonical arrays of `CityInventory` and `RetailSupplyAssignment`. Pure helpers in `cityInventory.ts` own catalog narrowing, stock mutation, capacity synchronization, pressure derivation, ownership validation, and migration allocation; `retailSupply.ts` owns source assignment and weekly replenishment. Persistence treats materials and ownership as authoritative, normalizes derived capacity/pressure on load, and distributes v12 stock across aggregate eligible capacity. The implementation remains one end-to-end feature PR with seven reviewer gates and late additive UI/e2e commits.

**Tech Stack:** TypeScript, SvelteKit/Svelte 5, Vitest, Playwright, Bun, Tauri save repositories, strict custom save/scenario codecs.

## Normative sources

Read these before implementation:

1. `docs/superpowers/specs/2026-08-02-city-local-inventory-production-replenishment-design.md`
2. `docs/superpowers/specs/2026-08-02-city-local-inventory-production-replenishment-third-pass-amendments.md`
3. `docs/superpowers/specs/2026-05-30-multi-cities-design.md`

The third-pass amendment takes precedence where it conflicts with the base design.

## Execution preflight

Implementation starts after PR #30 is merged or the implementation branch is rebased onto its final base. Do not implement production code on the documentation branch.

```bash
git fetch origin
git worktree add ../Serpens-hpa-292 -b agent/hpa-292-city-local-inventory origin/main
cd ../Serpens-hpa-292
bun install --frozen-lockfile
bun run check
bun run lint
bun run test
```

Expected: the clean baseline passes before HPA-292 edits. Record any pre-existing failure in the implementation PR before continuing.

## Global constraints

- Remove `GameState.warehouse` and `WarehouseInventory`; retain no aliases or compatibility wrappers.
- Remove the five global warehouse helper exports from `industryProduction.ts`.
- `cityInventories` and `retailSupplyAssignments` are canonical arrays; `materials` remains `Partial<Record<MaterialId, number>>`.
- Authoritative persisted truth is ownership, collection ordering, assignments, and material quantities.
- `capacity`, `overflowUnits`, and `overflowCost` are derived cache fields normalized on load with current constants.
- Every persisted `Store.cityId` resolves to an opened generated retail city.
- Every persisted `IndustrialBuilding.cityId` resolves to an opened generated industry city.
- One-retail-city allocation remains bit-identical to current global traversal.
- Multi-retail-city contention groups by world-catalog city order, then original store/product array order.
- V12 migration conserves each material and creates no overflow beyond aggregate capacity.
- Pre-v13 product reports retain numerical fields but use null new replenishment attribution.
- New reports store replenishment context once on `DailyStoreReport` and only the outcome on `DailyProductReport`.
- Reports label production-close/pre-replenishment inventory; inspectors label current/post-replenishment inventory.
- No transfer orders, in-transit stock, ETAs, recurring routes, route cost, or route capacity are added.
- Every changed Svelte component follows the repository-required Svelte MCP documentation and autofixer workflow.
- Every Vitest test executes at least one `expect`.
- Each reviewer gate ends with focused tests and a commit.

---

## File structure map

### New files

- `src/lib/game/cityInventory.ts` — narrowing, capability, access/mutation, pressure, synchronization, ownership validation, migration allocation.
- `src/lib/game/cityInventory.spec.ts` — inventory, normalization, allocation, and ownership tests.
- `src/lib/game/cityInventory.testUtils.ts` — shared deterministic fixtures and parity projections.
- `src/lib/game/retailSupply.ts` — assignment command, source resolution, weekly replenishment, report context/outcomes.
- `src/lib/game/retailSupply.spec.ts` — assignment, fallback, contention, import-cost, and report-evidence tests.
- `src/lib/components/game/RetailSupplySources.svelte` — source management for opened retail cities.
- `src/lib/components/game/RetailSupplySources.svelte.spec.ts` — behavior and accessibility tests.

### Primary modified files

- Domain: `src/lib/game/types.ts`, `state.ts`, `world.ts`, `industryPlacement.ts`, `industryProduction.ts`, `railShipping.ts`, `stock.ts`, `simulateDay.ts`, `reports.ts`, `productChainGraph.ts`, `productChainTree.ts`, `supplyAdvisor.ts`, plus their existing specs.
- Persistence: `src/lib/persistence/saveTypes.ts`, `saveCodec.ts`, `scenarioCodec.ts`, repositories, and their specs.
- Scenarios: `src/lib/scenarios/types.ts`, `setup.ts`, `metrics.ts`, `catalog.ts`, validation modules, and their specs.
- Route/UI: `src/routes/gameRouteController.ts`, `src/routes/+page.svelte`, `src/routes/retail-sim.e2e.ts`, `IndustryTileInspector.svelte`, `ReportsPanel.svelte`, `ProductChainsPanel.svelte`, and their specs.
- Localization: `src/lib/i18n/messages/en.ts`, `ja.ts`, `zh-Hant.ts`, and locale completeness tests.

# Reviewer Gate 1 — Characterization and core inventory contract

### Task 1: Lock current one-city behavior

**Files:**
- Create: `src/lib/game/cityInventory.testUtils.ts`
- Modify: `src/lib/game/industryProduction.spec.ts`
- Modify: `src/lib/game/stock.spec.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/game/railShipping.edge.spec.ts`

**Interfaces:**
- Produces `createOneCityInventoryFixture()`, `createOpenedMultiCityFixture()`, and `projectOneCityParity(game)`.
- Uses the current global warehouse only in this characterization commit.

- [ ] **Step 1: Add deterministic fixtures and a parity projection**

```ts
export function projectOneCityParity(game: GameState) {
	const latest = game.reports.at(-1);
	return {
		cash: game.cash,
		warehouse: game.warehouse,
		stores: game.stores.map((store) => ({
			id: store.id,
			products: store.products.map((product) => ({
				categoryId: product.categoryId,
				stock: product.stock
			}))
		})),
		report: latest
			? {
					importSpend: latest.importSpend,
					netCashChange: latest.netCashChange,
					production: latest.productionReport
				}
			: null
	};
}
```

- [ ] **Step 2: Capture a one-city daily inline snapshot**

```ts
it('preserves one-city production, retail, report, and cash behavior', () => {
	const after = simulateDay(createOneCityInventoryFixture());
	expect(projectOneCityParity(after)).toMatchInlineSnapshot();
});
```

Review the generated snapshot on the pre-refactor model. It must include production movements, rail shipments, local/import product quantities, pressure, and cash.

- [ ] **Step 3: Characterize store/product allocation order**

Create at least ten stores in one retail city, place `store-2` before `store-10` in `game.stores`, deplete the source, and assert the earlier array entry receives local stock first.

- [ ] **Step 4: Characterize production precedence**

Assert own buffer → same-city producer → warehouse → import, including current movement/shipment order.

- [ ] **Step 5: Run and commit**

```bash
bun run test -- \
  src/lib/game/industryProduction.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/railShipping.edge.spec.ts

git add src/lib/game/cityInventory.testUtils.ts src/lib/game/*.spec.ts
git commit -m "test(logistics): lock one-city inventory parity"
```

### Task 2: Add city inventory types and pure helpers

**Files:**
- Create: `src/lib/game/cityInventory.ts`
- Create: `src/lib/game/cityInventory.spec.ts`
- Modify: `src/lib/game/types.ts`

**Interfaces produced:**

```ts
export interface CityInventory {
	cityId: WorldCityId;
	capacity: number;
	materials: Partial<Record<MaterialId, number>>;
	overflowUnits: number;
	overflowCost: number;
}

export interface RetailSupplyAssignment {
	retailCityId: WorldCityId;
	supplyCityId: WorldCityId | null;
}

export interface RetailReplenishmentContext {
	retailCityId: WorldCityId;
	configuredSupplyCityId: WorldCityId | null;
	resolvedSupplyCityId: WorldCityId | null;
}

export type RetailReplenishmentOutcome =
	| 'city-inventory'
	| 'mixed'
	| 'import-only'
	| 'unassigned-import'
	| 'source-unavailable-import';
```

- [ ] **Step 1: Write typed access and sparse-material tests**

Cover success plus `unknown-city`, `city-closed`, `unsupported-city`, and `inventory-missing`. Assert missing material keys read as zero.

- [ ] **Step 2: Replace the state/report type shape**

Remove `WarehouseInventory` and `GameState.warehouse`. Add `cityInventories`, `retailSupplyAssignments`, `DailyStoreReport.replenishment`, and `DailyProductReport.replenishmentOutcome`.

- [ ] **Step 3: Implement catalog narrowing and canonical comparison**

```ts
export function resolveWorldCityId(cityId: string): WorldCityId | undefined;
export function compareWorldCityIds(left: WorldCityId, right: WorldCityId): number;
```

Use catalog position then plain code-unit comparison; never `localeCompare`.

- [ ] **Step 4: Implement inventory access/mutation and pressure**

```ts
export function getCityInventory(game: GameState, cityId: string): CityInventoryAccessResult;
export function getCityInventoryUsed(inventory: CityInventory): number;
export function addCityInventoryMaterial(inventory: CityInventory, materialId: MaterialId, quantity: number): CityInventory;
export function removeCityInventoryMaterial(inventory: CityInventory, materialId: MaterialId, quantity: number): RemoveCityInventoryMaterialResult;
export function recalculateCityInventoryPressure(inventory: CityInventory): CityInventory;
```

Move `WAREHOUSE_OVERFLOW_COST_PER_UNIT` into this module.

- [ ] **Step 5: Implement capacity and derived-state helpers**

```ts
export function getCityWarehouseCapacity(game: GameState, cityId: string): number;
export function synchronizeCityInventoryCapacity(game: GameState, cityId: string): GameState;
export function synchronizeAllCityInventoryCapacities(game: GameState): GameState;
export function normalizeCityInventoryDerivedState(game: GameState): GameState;
```

- [ ] **Step 6: Implement strict ownership discovery**

```ts
export type EntityCityOwnershipIssue =
	| { kind: 'store'; entityId: string; cityId: string; reason: 'unknown' | 'closed' | 'wrong-kind' | 'ungenerated' }
	| { kind: 'industrial-building'; entityId: string; cityId: string; reason: 'unknown' | 'closed' | 'wrong-kind' | 'ungenerated' };

export function findEntityCityOwnershipIssues(game: GameState): EntityCityOwnershipIssue[];
```

- [ ] **Step 7: Run and commit**

```bash
bun run test -- src/lib/game/cityInventory.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/cityInventory.ts src/lib/game/cityInventory.spec.ts
git commit -m "feat(logistics): add city inventory domain contract"
```

# Reviewer Gate 2 — State lifecycle, production, and rail

### Task 3: Initialize and synchronize city inventories

**Files:** `state.ts`, `state.spec.ts`, `world.ts`, `world.spec.ts`, `industryPlacement.ts`, `industryPlacement.spec.ts`, and `cityInventory.testUtils.ts`.

- [ ] **Step 1: Add failing new-game/open-city/build-warehouse tests**

New game must contain one empty `industry-city` inventory and one `harbor-city -> industry-city` assignment. Opening an industry city adds exactly one synchronized record. Opening a retail city adds one deterministic assignment. Building in city A cannot change city B pressure.

- [ ] **Step 2: Update new-game creation**

Remove all global warehouse construction. Use shared constructors for canonical inventories and assignments so `state.ts` and route fixtures cannot diverge.

- [ ] **Step 3: Update city opening**

Industry city: append one empty synchronized inventory. Retail city: select default source by greatest capacity, active city tie, catalog order, plain ID; use `null` when none exists.

- [ ] **Step 4: Synchronize after warehouse construction**

```ts
return synchronizeCityInventoryCapacity(nextGame, building.cityId);
```

- [ ] **Step 5: Run and commit**

```bash
bun run test -- src/lib/game/state.spec.ts src/lib/game/world.spec.ts src/lib/game/industryPlacement.spec.ts
git add src/lib/game/state* src/lib/game/world* src/lib/game/industryPlacement* src/lib/game/cityInventory.testUtils.ts
git commit -m "feat(logistics): initialize city inventory lifecycle"
```

### Task 4: Scope production and rail to the owning city

**Files:** `industryProduction.ts`, `industryProduction.spec.ts`, `railShipping.ts`, `railShipping.edge.spec.ts`.

- [ ] **Step 1: Add two-city isolation tests**

Stock and producers in city B are invisible to a city A producer. Output from city A never deposits into city B.

- [ ] **Step 2: Delete the old global exports**

Remove `getWarehouseUsed`, `recalculateWarehousePressure`, `addWarehouseMaterial`, `removeWarehouseMaterial`, `getWarehouseCapacity`, and the overflow constant from `industryProduction.ts`. Update all imports.

- [ ] **Step 3: Normalize at production entry**

```ts
const normalizedGame = normalizeCityInventoryDerivedState(game);
```

Use `normalizedGame` for all subsequent production and rail work.

- [ ] **Step 4: Replace the rail working warehouse**

```ts
interface RailTickState {
	// existing fields...
	cityInventoriesByCityId: Map<WorldCityId, CityInventory>;
}
```

Seed/access only after successful narrowing; require same-city consumer, producer, access warehouse, and inventory.

- [ ] **Step 5: Add `cityId` to movements and shipments**

Validate shipment endpoints belong to the same industry city.

- [ ] **Step 6: Capture production-close city summaries**

Build summaries after production/rail pushes and before retail replenishment. Aggregate compatibility fields are sums of these summaries.

- [ ] **Step 7: Run parity and commit**

```bash
bun run test -- src/lib/game/industryProduction.spec.ts src/lib/game/railShipping.edge.spec.ts src/lib/game/simulateDay.spec.ts
git add src/lib/game/industryProduction* src/lib/game/railShipping*
git commit -m "feat(logistics): scope production and rail by city"
```

# Reviewer Gate 3 — Retail assignment, replenishment, and reports

### Task 5: Implement retail assignment and weekly replenishment

**Files:**
- Create: `src/lib/game/retailSupply.ts`
- Create: `src/lib/game/retailSupply.spec.ts`
- Modify: `src/lib/game/stock.ts`, `stock.spec.ts`

**Interfaces produced:**

```ts
export const REPLENISHMENT_INTERVAL_DAYS = 7;
export function isReplenishmentDay(day: number): boolean;
export function setRetailSupplySource(game: GameState, retailCityId: string, supplyCityId: string | null): RetailSupplyAssignmentResult;
export function applyWeeklyReplenishment(game: GameState, modifiers: CompiledModifiers): WeeklyReplenishmentResult;
```

- [ ] **Step 1: Test assignment success, null, unchanged, and every rejection**

Invalid commands return the original object. Assigning the current value returns `changed: false`.

- [ ] **Step 2: Test all five outcomes**

Assert exact `warehouseUnits`, `warehouseValue`, `importedUnits`, `importCost`, `importSpend`, store context, and product outcome.

- [ ] **Step 3: Test contention order**

Global order `harbor A, campus B, harbor C` must debit `harbor A, harbor C, campus B`, while returned stores remain globally ordered. Preserve `store-2` before `store-10` and authored product order.

- [ ] **Step 4: Move and rename weekly import code**

Remove `IMPORT_INTERVAL_DAYS`, `isImportDay`, `WeeklyImportResult`, and `applyWeeklyImports` from `stock.ts`; do not keep aliases. Product creation/sales/stock-health helpers remain in `stock.ts`.

- [ ] **Step 5: Resolve a source once per retail city**

Reuse the resolved assignment/capability across that city's stores; only the per-product material availability/outcome varies.

- [ ] **Step 6: Run and commit**

```bash
bun run test -- src/lib/game/retailSupply.spec.ts src/lib/game/stock.spec.ts
bun run check
git add src/lib/game/retailSupply* src/lib/game/stock*
git commit -m "feat(logistics): add retail city replenishment"
```

### Task 6: Integrate replenishment into the daily tick and reports

**Files:** `simulateDay.ts`, `simulateDay.spec.ts`, `reports.ts`, `types.ts`.

- [ ] **Step 1: Test the exact daily order**

Production/rail → production-close summary → retail sales → replenishment → report merge → cash reconciliation → post-replenishment inventories.

- [ ] **Step 2: Add a report/current divergence test**

Create a replenishment day where production-close used stock differs from ending current stock; assert both values are retained.

- [ ] **Step 3: Replace weekly import calls**

Use `isReplenishmentDay` and `applyWeeklyReplenishment`; fold returned stores and inventories into final game.

- [ ] **Step 4: Preserve pressure timing and cash**

Merging replenishment movements must not modify production-close capacity/used/overflow snapshots. Only externally imported units contribute to `importSpend`.

- [ ] **Step 5: Run and commit**

```bash
bun run test -- src/lib/game/simulateDay.spec.ts src/lib/game/retailSupply.spec.ts src/lib/game/industryProduction.spec.ts
git add src/lib/game/simulateDay* src/lib/game/reports.ts src/lib/game/types.ts
git commit -m "feat(logistics): integrate replenishment reports"
```

### Task 7: Remove global assumptions from world rules and planning views

**Files:** `world.ts/spec`, `productChainGraph.ts/spec`, `productChainTree.ts/spec`, `supplyAdvisor.ts/spec`.

- [ ] **Step 1: Add scope tests**

Test any-city finished-material progression, active-industry graph isolation, configured retail source, null/unavailable source states, and advisor isolation.

- [ ] **Step 2: Replace global warehouse readers**

World progression scans canonical city inventories. Graphs/advisor use active city and configured source; no operational aggregate warehouse node remains.

- [ ] **Step 3: Run and commit**

```bash
bun run test -- src/lib/game/world.spec.ts src/lib/game/productChainGraph.spec.ts src/lib/game/productChainTree.spec.ts src/lib/game/supplyAdvisor.spec.ts
git add src/lib/game/world* src/lib/game/productChainGraph* src/lib/game/productChainTree* src/lib/game/supplyAdvisor*
git commit -m "refactor(logistics): scope inventory readers by city"
```

# Reviewer Gate 4 — V13 persistence and migration

### Task 8: Add v13 decoding with derived-field normalization

**Files:** `saveTypes.ts`, `saveCodec.ts`, `saveCodec.spec.ts`, `saveCodec.railValidation.spec.ts`.

- [ ] **Step 1: Add v13 multi-city round-trip tests**

Cover inventories, assignments, store context, product outcomes, attributed movements, and normalized serialization.

- [ ] **Step 2: Add stale-derived and malformed-type tests**

Valid numeric but stale capacity/overflow values normalize on load. String, negative, fractional, unsafe, or nonfinite fields reject according to authoritative/derived rules.

- [ ] **Step 3: Bump schema**

Set `SAVE_SCHEMA_VERSION = 13` and add `12` to `MIGRATABLE_SCHEMA_VERSIONS`.

- [ ] **Step 4: Implement load order**

Structural decode → authoritative ownership/material validation → `normalizeCityInventoryDerivedState` → normalized invariant validation. Do not reject solely for old balance-derived cached values.

- [ ] **Step 5: Reject invalid store/building ownership**

Convert `findEntityCityOwnershipIssues` into dedicated `SaveDataError` codes before capacity or simulation logic runs.

- [ ] **Step 6: Run and commit**

```bash
bun run test -- src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveCodec.railValidation.spec.ts
git add src/lib/persistence/saveTypes.ts src/lib/persistence/saveCodec*
git commit -m "feat(persistence): add city inventory schema v13"
```

### Task 9: Implement v12 distributed allocation and honest report migration

**Files:** `cityInventory.ts/spec`, `saveCodec.ts/spec`.

**Interface:**

```ts
export function allocateLegacyWarehouseMaterials(
	game: GameState,
	eligible: readonly CityInventory[],
	legacyMaterials: Partial<Record<MaterialId, number>>
): CityInventory[];
```

- [ ] **Step 1: Test allocation**

Required cases: 300 units over two 200-capacity cities gives zero overflow; aggregate excess gives exact unavoidable overflow; per-material conservation; primary-city and tie-break ordering; empty/no-city success; nonempty/no-city rejection.

- [ ] **Step 2: Implement deterministic allocation**

Destination order is primary city then remaining canonical cities. Material order is catalog order. Fill remaining aggregate capacity, then place residual in the primary city.

- [ ] **Step 3: Assert conservation**

For every material, v13 sum equals v12 quantity. Total overflow equals only total units minus aggregate capacity.

- [ ] **Step 4: Migrate default assignments**

One canonical assignment per opened retail city, using primary source or `null`.

- [ ] **Step 5: Keep legacy replenishment attribution null**

Pre-v13 `DailyStoreReport.replenishment = null` and `DailyProductReport.replenishmentOutcome = null`; preserve all existing numeric and financial fields exactly.

- [ ] **Step 6: Attribute recoverable movements only**

Resolve production/rail city IDs from building references. Primary city may be migration provenance, never invented historical retail source evidence.

- [ ] **Step 7: Run and commit**

```bash
bun run test -- src/lib/persistence/saveCodec.spec.ts src/lib/game/cityInventory.spec.ts
git add src/lib/game/cityInventory* src/lib/persistence/saveCodec*
git commit -m "feat(persistence): migrate global stock across cities"
```

### Task 10: Verify all repositories normalize and persist v13

**Files:** `saveRepository.spec.ts`, `tauriSaveRepository.spec.ts`, and any browser/in-memory repository specs affected by fixtures.

- [ ] **Step 1: Replace warehouse fixtures**
- [ ] **Step 2: Add load-normalize-resave coverage**
- [ ] **Step 3: Run and commit**

```bash
bun run test -- src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts
git add src/lib/persistence/*Repository*.spec.ts
git commit -m "test(persistence): cover city inventory repositories"
```

# Reviewer Gate 5 — Scenarios and command plumbing

### Task 11: Replace scenario global warehouse overrides and metrics

**Files:** scenario types/setup/metrics/catalog/validation modules and their specs.

- [ ] **Step 1: Replace `warehouseMaterials`**

Use:

```ts
overrides: {
	cityInventoryMaterials: [
		{ cityId: 'industry-city', materials: { bread: 20 } }
	],
	retailSupplyAssignments: [
		{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }
	]
}
```

Remove the old field from types, exact-key validation, setup, catalog fixtures, and tests. No runtime dual read.

- [ ] **Step 2: Materialize starts in safe order**

Create/open cities and buildings → synchronize capacity → apply city materials → recalculate pressure → apply assignments → validate complete state.

- [ ] **Step 3: Replace validators**

```ts
validateCityInventoryCapacities(game, blueprint)
validateRetailSupplyAssignments(game, blueprint)
```

- [ ] **Step 4: Replace metric**

Remove `warehouse-quantity`; add `city-inventory-quantity` with `cityId` and `materialId`. Keep `completed-retail-import-cycles` stable while switching its implementation to `isReplenishmentDay`.

- [ ] **Step 5: Scan and run**

```bash
rg "warehouseMaterials|warehouse-quantity|isImportDay|applyWeeklyImports" src/lib/scenarios src/lib/persistence
bun run test -- src/lib/scenarios/setup.spec.ts src/lib/scenarios/metrics.spec.ts src/lib/scenarios/validation.spec.ts src/lib/scenarios/runtime.spec.ts
git add src/lib/scenarios
git commit -m "feat(scenarios): add city inventory contracts"
```

### Task 12: Update scenario persistence and preserve share codes

**Files:** `scenarioCodec.ts/spec`, `scenarioRepository.spec.ts`, `scenarioRepository.testUtils.ts`.

- [ ] **Step 1: Test embedded v12 game migration**
- [ ] **Step 2: Update the metric allowlist and hard-reject the removed metric**
- [ ] **Step 3: Prove existing share-code bytes remain unchanged**
- [ ] **Step 4: Run and commit**

```bash
bun run test -- src/lib/persistence/scenarioCodec.spec.ts src/lib/persistence/scenarioRepository.spec.ts
git add src/lib/persistence/scenario*
git commit -m "feat(persistence): migrate scenario games to v13"
```

### Task 13: Add route-controller mutation plumbing

**Files:** `gameRouteController.ts/spec`, `+page.svelte`.

- [ ] **Step 1: Test allowed, unchanged, invalid, and scenario-disallowed commands**
- [ ] **Step 2: Add `setRetailSupplySource` to shared mutation availability**
- [ ] **Step 3: Add typed controller payload**

```ts
{
	command: 'setRetailSupplySource',
	retailCityId: string,
	supplyCityId: string | null
}
```

Commit only when the result is `ok && changed`.

- [ ] **Step 4: Wire the page handler through the controller**
- [ ] **Step 5: Run and commit**

```bash
bun run test -- src/routes/gameRouteController.spec.ts
bun run check
git add src/routes/gameRouteController* src/routes/+page.svelte
git commit -m "feat(logistics): add retail supply command plumbing"
```

# Reviewer Gate 6 — UI and localization

### Task 14: Add retail source management UI

**Files:** create `RetailSupplySources.svelte` and its spec; modify `+page.svelte`.

- [ ] **Step 1: Read Svelte 5 documentation using the required MCP workflow**
- [ ] **Step 2: Test one section per retail city, Imports only, canonical source order, stale source, pending disable, unchanged selection, and accessible labels**
- [ ] **Step 3: Implement a data/callback component**

```ts
interface Props {
	retailCities: readonly RetailCitySupplyView[];
	disabled: boolean;
	onChange: (retailCityId: string, supplyCityId: string | null) => void;
}
```

- [ ] **Step 4: Compose beside `StoreOverview`; keep persisted state in `GameState`**
- [ ] **Step 5: Run Svelte autofix, tests, check, and commit**

```bash
bun run test -- src/lib/components/game/RetailSupplySources.svelte.spec.ts
bun run check
git add src/lib/components/game/RetailSupplySources* src/routes/+page.svelte
git commit -m "feat(ui): add retail supply source controls"
```

### Task 15: Update inventory/report/product-chain UI and locales

**Files:** `IndustryTileInspector.svelte/spec`, `ReportsPanel.svelte/spec`, `ProductChainsPanel.svelte/spec`, all locale message files and locale tests.

- [ ] **Step 1: Test selected-city inventory isolation and empty/zero/overflow/unavailable states**
- [ ] **Step 2: Test report/current divergence labels**

Visible copy must distinguish:

- **Production-close inventory (before retail replenishment)**
- **Current city inventory (after the latest replenishment)**

- [ ] **Step 3: Test configured source, Imports only, and unavailable source product-chain states**
- [ ] **Step 4: Use player terminology**

Visible text uses City inventory, Local supply, External imports, and Warehouse building. Internal fields such as `warehouseUnits` do not leak into copy.

- [ ] **Step 5: Add identical key sets in English, Japanese, and Traditional Chinese**
- [ ] **Step 6: Run Svelte autofix, component/i18n tests, check, and commit**

```bash
bun run test -- src/lib/components/game/IndustryTileInspector.svelte.spec.ts src/lib/components/game/ReportsPanel.svelte.spec.ts src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/lib/i18n
bun run check
git add src/lib/components/game/IndustryTileInspector* src/lib/components/game/ReportsPanel* src/lib/components/game/ProductChainsPanel* src/lib/i18n
git commit -m "feat(ui): present city inventory attribution"
```

# Reviewer Gate 7 — E2E and full verification

### Task 16: Add deterministic pre-unlocked multi-city e2e

**Files:** `src/routes/retail-sim.e2e.ts` and its existing fixture helper.

- [ ] **Step 1: Create a fixture with two opened generated industry cities, two retail cities, independent stocks, and a near replenishment day**
- [ ] **Step 2: Exercise source selection, replenishment, exact local/import units, other-city isolation, timing labels, save, reload, and persisted assignment/inventory**
- [ ] **Step 3: Use semantic accessible selectors**
- [ ] **Step 4: Run and commit**

```bash
bunx playwright test src/routes/retail-sim.e2e.ts --grep "city-local inventory"
git add src/routes/retail-sim.e2e.ts
git commit -m "test(e2e): cover city inventory lifecycle"
```

### Task 17: Remove residual global paths and verify the full repository

- [ ] **Step 1: Run forbidden-symbol scans**

```bash
rg "game\.warehouse|WarehouseInventory" src
rg "addWarehouseMaterial|removeWarehouseMaterial|recalculateWarehousePressure|getWarehouseCapacity|getWarehouseUsed" src
rg "applyWeeklyImports|isImportDay|IMPORT_INTERVAL_DAYS|WeeklyImportResult" src
rg "warehouseMaterials|warehouse-quantity" src
```

Expected: no production references; historical migration fixtures/comments may retain explicit legacy terminology.

- [ ] **Step 2: Run focused feature suites**

```bash
bun run test -- src/lib/game/cityInventory.spec.ts src/lib/game/retailSupply.spec.ts src/lib/game/industryProduction.spec.ts src/lib/game/railShipping.edge.spec.ts src/lib/game/simulateDay.spec.ts src/lib/persistence/saveCodec.spec.ts src/lib/persistence/scenarioCodec.spec.ts src/lib/scenarios src/lib/components/game src/routes/gameRouteController.spec.ts
```

- [ ] **Step 3: Run complete verification**

```bash
bun run check
bun run lint
bun run test
bunx playwright test src/routes/retail-sim.e2e.ts
```

All commands must exit 0 before claiming completion.

- [ ] **Step 4: Manually verify acceptance**

Independent stock/capacity/overflow; no cross-city production/rail; exact replenishment/import fallback; strict entity ownership; v12 conservation/no avoidable overflow; balance-safe normalization; null legacy attribution; compact evidence; clear timing labels; UI/save-reload lifecycle; no HPA-294 transfer features.

- [ ] **Step 5: Commit any final cleanup**

```bash
git add -A
git commit -m "chore(logistics): complete city inventory verification"
```

Skip only when `git status --short` is empty.

- [ ] **Step 6: Prepare implementation PR evidence**

Include seven gate commits, migration/conservation evidence, one-city parity, intentional multi-city order divergence, command outputs, UI screenshots, and explicit confirmation that transfers/routes remain HPA-294 scope.

---

## Self-review checklist

- [ ] Domain types/helper ownership and no global wrappers
- [ ] String-to-`WorldCityId` narrowing
- [ ] Strict store/building ownership
- [ ] New game/open-city/build lifecycle
- [ ] Capacity synchronization and load normalization
- [ ] Same-city production and rail
- [ ] Assignment and all five replenishment outcomes
- [ ] One-city parity and multi-city contention
- [ ] Daily order and cash reconciliation
- [ ] Attributed movements and production-close summaries
- [ ] World/product-chain/advisor scoping
- [ ] V13 codec and distributed v12 allocation
- [ ] Null pre-v13 replenishment attribution
- [ ] Scenario override/metric/codec changes
- [ ] Route-controller enforcement
- [ ] UI terminology, timing labels, accessibility, and locales
- [ ] Save/reload e2e
- [ ] No HPA-294 scope leakage

## Execution handoff

Recommended: **subagent-driven development**, one fresh agent per task with specification and code-quality review after each reviewer gate.

Alternative: **inline execution** with `superpowers:executing-plans`, stopping after each reviewer gate for review before continuing.
