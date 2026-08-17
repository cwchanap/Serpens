# Richer Product Types and Archetype-Specific Dynamics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Use test-driven development for each behavior change. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement HPA-38 so concrete products have stable data-driven identities, explicit production mappings, deterministic optional dynamics, and player-visible archetype differentiation without introducing SKU inventory or separate archetype simulation engines.

**Architecture:** `products.ts` becomes the authoritative static product catalog. `ProductId` is the retail identity across store state, reports, product art, persistence, and future HPA-39 brand attachment; `ProductFamilyId` is grouping metadata only. `StoreProduct` holds FIFO stock lots so age-dependent mechanics have one exact quantity source. `productDynamics.ts` owns pure deterministic aging, trend, obsolescence, markdown, shrink, and stockout/reputation arithmetic. `stock.ts` and `retailSupply.ts` remain the sales/replenishment owners and consume the catalog instead of embedded archetype categories. Save schema 17 is strict; schema 16 is rejected.

**Tech Stack:** TypeScript 6, SvelteKit / Svelte 5 runes, Vitest 4, Playwright, Bun, existing deterministic game state machine.

## Global constraints

- Keep HPA-38 as one Linear ticket; do not create a second product subsystem or child architecture.
- Product families are metadata, never a second inventory layer.
- Concrete `ProductId` is the only final retail identity; no persisted `categoryId` alias or dual-write.
- Preserve current product economic tuning during the identity migration before adding new dynamics.
- Preserve current finished `MaterialId` values. Map retail products explicitly to them.
- Current retail `drinks` becomes product `soft-drinks`; finished material `drinks` remains and maps to it.
- Store inventory has one quantity source. After the lot migration, do not keep both `stock` and `lots` persisted.
- FIFO lots are inventory batches, not SKUs; there is no brand/model/shelf identity in HPA-38.
- No new daily/global RNG draws. Existing sales jitter remains where it is.
- Product trends use authored deterministic wave parameters.
- Waste/shrink are non-cash inventory loss expense; markdown reduces revenue and is not also expensed.
- Replenishment stays weekly and after sales; new lots are stamped with the closing day.
- Reuse existing warning/detail/report UI; no product-management dashboard.
- Reuse existing product images. No image-generation work is required.
- Schema 17 rejects schema 16. Do not add a pre-release migration.
- Brands and competitors remain HPA-39.
- Before editing any Svelte file, follow repository `AGENTS.md`: use the official Svelte MCP `list-sections`, fetch all relevant docs with `get-documentation`, and run `svelte-autofixer` on every changed Svelte snippet until clean.

---

## File structure

### New focused files

- `src/lib/game/products.ts` — product families, product catalog, lookup helpers, catalog/archetype validation.
- `src/lib/game/products.spec.ts` — identity, mapping, validation, and no-duplicate coverage.
- `src/lib/game/productDynamics.ts` — pure lot-aging and deterministic product-dynamics arithmetic/evidence.
- `src/lib/game/productDynamics.spec.ts` — spoilage, shrink, trend, obsolescence, markdown, stockout/reputation arithmetic.

### Existing owners to extend

- Domain/config: `src/lib/game/types.ts`, `src/lib/game/archetypes.ts`, `src/lib/game/leveling.ts` only for category-oriented naming/call sites if required.
- Retail simulation: `src/lib/game/stock.ts`, `stock.spec.ts`, `retailSupply.ts`, `retailSupply.spec.ts`, `simulateDay.ts`, relevant `simulateDay*.spec.ts`.
- Production views: `productChainGraph.ts`, `productChainGraph.spec.ts`, `productChainTree.ts`, `productChainTree.spec.ts`.
- Art: `src/lib/assets/gameArt.ts`, `gameArt.spec.ts`.
- Reports/read models: `reports.ts` and focused specs only where aggregation requires the new fields.
- Persistence: `src/lib/persistence/saveTypes.ts`, `saveCodec.ts`, `saveCodec.spec.ts`, current-schema repository fixtures/specs.
- UI: `StoreStockTable.svelte`, `StoreStockTable.svelte.spec.ts`, `StoreDetailModal.svelte`, focused modal spec, `ReportsPanel.svelte`, `ReportsPanel.svelte.spec.ts`.
- Route-level integration: `src/routes/+page.svelte` only if a new prop/read model must be wired; `src/routes/retail-sim.e2e.ts` for one representative end-to-end proof.

---

### Task 1: Introduce the authoritative product catalog without changing runtime identity yet

**Files:**
- Create: `src/lib/game/products.ts`
- Create: `src/lib/game/products.spec.ts`
- Modify: `src/lib/game/types.ts`
- Read/reference: `src/lib/game/archetypes.ts`, `src/lib/game/industry.ts`

**Interfaces:**

```ts
export type ProductFamilyId =
  | 'beverages'
  | 'convenience-goods'
  | 'fashion'
  | 'electronics'
  | 'grocery-food';

export type ProductId =
  | 'bottled-water'
  | 'soft-drinks'
  | 'snacks'
  | 'essentials'
  | 'household'
  | 'apparel'
  | 'home-goods'
  | 'gifts'
  | 'fashion-accessories'
  | 'games'
  | 'accessories'
  | 'devices'
  | 'peripherals'
  | 'produce'
  | 'pantry'
  | 'prepared'
  | 'bakery';

export interface ProductDefinition {
  id: ProductId;
  familyId: ProductFamilyId;
  name: string;
  baseDemand: number;
  margin: number;
  demandWeight: number;
  importCost: number;
  defaultSellingPrice: number;
  priceSensitivity: number;
  productionMaterialId: MaterialId | null;
  dynamics: ProductDynamics;
}
```

- [ ] **Step 1: Write catalog validation tests**

Cover:

- every `ProductId` appears exactly once;
- family IDs resolve;
- economic values are finite and in the same valid ranges current category data expects;
- production mappings resolve to existing `finished` materials;
- duplicate product IDs fail;
- missing family/product references fail;
- invalid dynamic parameters fail.

Use injectable/test-only validation input rather than mutating the exported frozen production registry.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
bun run test:unit -- --run src/lib/game/products.spec.ts
```

Expected: product catalog/types do not exist.

- [ ] **Step 3: Implement the minimum frozen catalog and helpers**

Expose:

```ts
export const PRODUCT_FAMILIES: Readonly<Record<ProductFamilyId, ProductFamilyDefinition>>;
export const PRODUCTS: Readonly<Record<ProductId, ProductDefinition>>;
export function getProductDefinition(id: ProductId): ProductDefinition;
export function getProductDefinitions(ids: readonly ProductId[]): ProductDefinition[];
export function validateProductCatalog(/* optional test input */): void;
```

Carry current `ProductCategory` economic values from `archetypes.ts` without balancing changes. Map at least:

```text
bottled-water -> bottled-water
soft-drinks   -> drinks
snacks        -> snacks
essentials    -> essentials
gifts         -> gifts
produce       -> produce
pantry        -> pantry
```

Unproduced retail products use `productionMaterialId: null`.

- [ ] **Step 4: Add the first richer family relation**

Assert both `bottled-water` and `soft-drinks` resolve to the `beverages` family while keeping separate concrete IDs and material mappings.

- [ ] **Step 5: Keep dynamics empty/baseline in this task**

All definitions may initially use `dynamics: {}`. Do not mix identity migration with balance changes.

- [ ] **Step 6: Run focused tests/check and commit**

```bash
bun run test:unit -- --run src/lib/game/products.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/products.ts src/lib/game/products.spec.ts
git commit -m "feat(products): add product catalog"
```

---

### Task 2: Migrate archetypes, store state, reports, production mapping, and art to `ProductId`

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/archetypes.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/retailSupply.ts`
- Modify: `src/lib/game/productChainGraph.ts`
- Modify: `src/lib/game/productChainTree.ts`
- Modify: `src/lib/assets/gameArt.ts`
- Modify focused specs for each owner
- Modify any direct fixtures/call sites surfaced by TypeScript/check

**Final identity shapes for this task:**

```ts
export interface StoreArchetype {
  // existing fields
  startingProductIds: readonly ProductId[];
}

export interface StoreProduct {
  productId: ProductId;
  stock: number; // temporary until Task 3
  reorderThreshold: number;
  targetStock: number;
  sellingPrice: number;
}

export interface DailyProductReport {
  productId: ProductId;
  // existing fields unchanged for now
}
```

- [ ] **Step 1: Write migration-focused tests first**

Prove:

- all four archetypes list valid catalog product IDs in their existing unlock order;
- convenience contains both `bottled-water` and `soft-drinks`;
- initialization uses catalog definitions for defaults;
- `soft-drinks` replenishes from finished material `drinks`;
- product-chain support uses `productionMaterialId`, not string equality;
- product reports carry `productId`.

- [ ] **Step 2: Run the focused tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/products.spec.ts src/lib/game/stock.spec.ts src/lib/game/retailSupply.spec.ts src/lib/game/productChainGraph.spec.ts src/lib/game/productChainTree.spec.ts
```

- [ ] **Step 3: Replace embedded archetype category definitions**

Change `archetypes.ts` to `startingProductIds`. `products.ts` owns name/economics/dynamics. Preserve assortment ordering and existing milestone unlock counts.

Do not introduce per-archetype product copies or override maps in this ticket unless a current behavior truly requires one.

- [ ] **Step 4: Rename runtime identity**

Move `StoreProduct.categoryId -> productId`, function parameters from `categoryId` to `productId`, and `DailyProductReport.categoryId -> productId`.

Temporary source-code helper aliases are allowed only while this task is in progress. Remove them before the final step.

- [ ] **Step 5: Replace category lookup with catalog lookup**

`stock.ts` should resolve `ProductDefinition` from `ProductId`. Delete duplicated `findStoreCategory` / `getCityStoreCategories` logic that exists only because definitions were embedded in archetypes; replace it with product-definition lookups plus archetype assortment membership.

- [ ] **Step 6: Replace implicit material identity**

Delete `getFinishedMaterialIdForCategory`. `retailSupply.ts`, graph/tree builders, and any production/read-model code use `ProductDefinition.productionMaterialId`.

- [ ] **Step 7: Retarget import-cost rule IDs**

Where the existing `retail-product` simulation-rule scope stores a target string, that string now means `ProductId`. Keep the rule engine shape unchanged; only replace category terminology/call sites.

- [ ] **Step 8: Retarget product art**

Make product art addressable by `ProductId`. Reuse the current drinks image:

```ts
'soft-drinks': {
  productId: 'soft-drinks',
  path: '/assets/game/products/drinks.png',
  alt: 'Product icon for soft drinks'
}
```

Do not generate new art.

- [ ] **Step 9: Use `bun run check` as the exhaustive call-site finder**

Fix all old `startingCategories`, `categoryId`, and `ProductCategory` call sites. Do not leave a legacy identity type exported just to make compilation easy.

```bash
bun run check
```

- [ ] **Step 10: Run focused/full unit coverage and commit**

```bash
bun run test:unit -- --run src/lib/game/products.spec.ts src/lib/game/stock.spec.ts src/lib/game/retailSupply.spec.ts src/lib/game/productChainGraph.spec.ts src/lib/game/productChainTree.spec.ts src/lib/assets/gameArt.spec.ts
bun run check
git add src/lib/game src/lib/assets/gameArt.ts
git commit -m "refactor(products): use stable product ids"
```

---

### Task 3: Replace scalar stock with FIFO lots and land strict schema 17

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/retailSupply.ts`
- Modify: any store/read-model code that reads `.stock`
- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify current-schema repository fixtures/specs as required

**Final inventory shape:**

```ts
export interface ProductStockLot {
  receivedDay: number;
  quantity: number;
}

export interface StoreProduct {
  productId: ProductId;
  lots: ProductStockLot[];
  reorderThreshold: number;
  targetStock: number;
  sellingPrice: number;
}
```

**Helpers in `stock.ts`:**

```ts
export function getStoreProductStock(product: Pick<StoreProduct, 'lots'>): number;
export function consumeStoreProductStock(product: StoreProduct, quantity: number): StoreProduct;
export function addStoreProductStockLot(product: StoreProduct, lot: ProductStockLot): StoreProduct;
```

- [ ] **Step 1: Write FIFO lot tests**

Cover total calculation, oldest-first partial/full consumption, zero-quantity cleanup, deterministic lot ordering, and replenishment lot addition.

- [ ] **Step 2: Run stock tests and verify RED**

```bash
bun run test:unit -- --run src/lib/game/stock.spec.ts src/lib/game/retailSupply.spec.ts
```

- [ ] **Step 3: Implement lot helpers and migrate stock reads/writes**

Initialize founding stock as one lot stamped with the game's current/founding day. Sales consume FIFO. Stock health/status/reorder checks use `getStoreProductStock`.

Do not persist a mirrored `stock` scalar.

- [ ] **Step 4: Make replenishment append a lot**

On replenishment day, add exactly the replenished quantity as a lot with `receivedDay = game.day`. Keep warehouse/import accounting unchanged.

- [ ] **Step 5: Write schema-17 round-trip and rejection tests**

Cover:

- `SAVE_SCHEMA_VERSION === 17`;
- valid lots round-trip;
- schema 16 rejected;
- unknown product ID rejected;
- duplicate product IDs per store rejected;
- product not allowed by its archetype/unlock state rejected;
- negative/non-safe quantity rejected;
- invalid/future `receivedDay` rejected;
- zero-quantity lots rejected or normalized consistently with the chosen validator rule.

- [ ] **Step 6: Bump and validate schema 17**

```ts
export const SAVE_SCHEMA_VERSION = 17;
```

Do not add schema-16 migration logic. Preserve the existing current-schema retail-city normalization safety net.

- [ ] **Step 7: Run persistence + stock suites/check and commit**

```bash
bun run test:unit -- --run src/lib/game/stock.spec.ts src/lib/game/retailSupply.spec.ts src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveRepository.spec.ts
bun run check
git add src/lib/game src/lib/persistence
git commit -m "feat(products): track fifo product stock lots"
```

---

### Task 4: Implement pure deterministic product-dynamics resolvers

**Files:**
- Create: `src/lib/game/productDynamics.ts`
- Create: `src/lib/game/productDynamics.spec.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/products.ts`
- Test: `src/lib/game/products.spec.ts`

**Interfaces:**

```ts
export interface ProductInventoryAgingResult {
  product: StoreProduct;
  wasteUnits: number;
  wasteValue: number;
  shrinkUnits: number;
  shrinkValue: number;
  averageAgeDays: number | null;
  freshnessPercent: number | null;
}

export interface ProductMarketDynamics {
  trendMultiplier: number;
  obsolescenceMultiplier: number;
  markdownMultiplier: number;
  reputationMultiplier: number;
}

export function applyProductInventoryAging(input: {
  product: StoreProduct;
  definition: ProductDefinition;
  closingDay: number;
}): ProductInventoryAgingResult;

export function resolveProductMarketDynamics(input: {
  product: StoreProduct;
  definition: ProductDefinition;
  day: number;
  storeReputation: number;
}): ProductMarketDynamics;
```

- [ ] **Step 1: Write exact shelf-life boundary tests**

A lot expires when:

```text
closingDay - receivedDay >= shelfLifeDays
```

Assert expired lots are removed, waste units/value are exact, and non-perishable products do not change.

- [ ] **Step 2: Write shrink tests**

```text
shrinkUnits = min(remainingStock, floor(remainingStock * shrinkRate))
```

Assert no RNG use, bounds, and zero behavior.

- [ ] **Step 3: Write freshness/age read-model tests**

Derive quantity-weighted average age and freshness percent from remaining lots. Do not persist either value on `StoreProduct`.

- [ ] **Step 4: Write trend-wave tests**

Implement an authored triangle wave with finite deterministic output. Test beginning/peak/trough/period wrap and that output is independent of object iteration order/RNG state.

- [ ] **Step 5: Write obsolescence tests**

Use oldest/weighted inventory age according to the normative spec; demand stays 1 before the threshold and declines to but never below `demandFloor` after it.

- [ ] **Step 6: Write markdown tests**

At/after the configured age threshold return the authored price multiplier; before threshold return 1. Never mutate `StoreProduct.sellingPrice`.

- [ ] **Step 7: Write reputation sensitivity tests**

Verify neutral products return 1 and reputation-sensitive products alter store scoring through a bounded multiplier without branching on archetype.

- [ ] **Step 8: Implement minimal explicit arithmetic**

Use ordinary pure functions/switch-free optional-field checks. Do not add a generic effect list, visitor, registry, or expression evaluator.

- [ ] **Step 9: Add initial production tuning for representative products**

Add conservative authored dynamics for the four archetype examples, but keep balance values small enough that identity migration remains recognizable. Tests should assert validity/behavior, not arbitrary exact balance constants unless those constants are contractually meaningful.

- [ ] **Step 10: Run focused tests/check and commit**

```bash
bun run test:unit -- --run src/lib/game/products.spec.ts src/lib/game/productDynamics.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/products.ts src/lib/game/products.spec.ts src/lib/game/productDynamics.ts src/lib/game/productDynamics.spec.ts
git commit -m "feat(products): add deterministic product dynamics"
```

---

### Task 5: Integrate aging, trends, markdowns, stockout attribution, and accounting into the daily simulation

**Files:**
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/reports.ts` only if aggregation needs explicit fields
- Modify: `src/lib/game/retailSupply.ts` report merge/default fields
- Test: `stock.spec.ts`, relevant `simulateDay*.spec.ts`, `retailSupply.spec.ts`, report specs

**Daily product report additions:**

```ts
wasteUnits: number;
wasteValue: number;
shrinkUnits: number;
shrinkValue: number;
stockoutLostDemand: number;
averageAgeDays: number | null;
freshnessPercent: number | null;
trendMultiplier: number;
obsolescenceMultiplier: number;
baseSellingPrice: number;
effectiveSellingPrice: number;
markdownAmount: number;
```

- [ ] **Step 1: Write an integration test for pre-sales aging**

Build a store with one expiring lot. On the closing day, assert spoilage happens before sales, expired units cannot be sold, and report waste matches removed stock.

- [ ] **Step 2: Add one pure store-aging pass before city sales**

Do not put dynamics mutation inside Svelte/UI or persistence code. Build a map of per-store/per-product aging evidence consumed later by report assembly.

- [ ] **Step 3: Write sales tests for trend/obsolescence demand**

Assert the city/product demand calculation uses the product resolver and remains deterministic for a fixed game/day.

Keep the existing sales jitter RNG call count/order stable.

- [ ] **Step 4: Write markdown revenue tests**

Use configured `sellingPrice` as base price, dynamics multiplier as effective price, and actual effective price for revenue. Calculate `markdownAmount` once from the delta; do not expense it again.

- [ ] **Step 5: Write stockout attribution tests**

Separate `stockoutLostDemand` from broader `demandMissed` by comparing desired sales with stock, capacity, and remaining city demand. A capacity-limited miss must not be labeled stockout loss.

- [ ] **Step 6: Apply reputation sensitivity in store scoring**

Use product definition data to adjust the existing reputation contribution. No `if (store.archetypeId === 'boutique')` branch is allowed.

- [ ] **Step 7: Add inventory-loss accounting tests before changing totals**

Add `inventoryLossExpense` to the appropriate store/daily report shapes. Assert:

```text
inventoryLossExpense == sum(product wasteValue + shrinkValue)
operatingIncome == grossMargin - operatingCosts - inventoryLossExpense
```

and separately assert operating cash flow does not subtract that same historical inventory purchase a second time.

- [ ] **Step 8: Integrate report defaults/replenishment merge**

Every `DailyProductReport` construction path must provide zero/null neutral dynamics fields, including products with replenishment activity but zero sales.

- [ ] **Step 9: Add fixed-seed regression**

Run the same starting game twice and assert complete relevant daily product/store evidence is identical.

- [ ] **Step 10: Run focused suites/check and commit**

```bash
bun run test:unit -- --run src/lib/game/productDynamics.spec.ts src/lib/game/stock.spec.ts src/lib/game/retailSupply.spec.ts src/lib/game/simulateDay.spec.ts
bun run check
git add src/lib/game
git commit -m "feat(products): apply product dynamics in daily simulation"
```

If `simulateDay` behavior is split across multiple spec files, include all touched focused files rather than relying on the single example path above.

---

### Task 6: Extend persistence validation for complete dynamics report evidence

**Files:**
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify: repository persistence specs/fixtures surfaced by the current schema

- [ ] **Step 1: Write malformed-report tests**

Reject unknown product IDs, negative unit/value fields, invalid freshness percentage, non-finite multipliers/prices, negative markdown amount, and impossible lot data.

- [ ] **Step 2: Verify RED**

```bash
bun run test:unit -- --run src/lib/persistence/saveCodec.spec.ts
```

- [ ] **Step 3: Extend current-schema validators only**

Validate schema-17 state/report contracts with focused helper functions. Do not create schema-16 decode branches.

- [ ] **Step 4: Preserve cross-field invariants where cheap and valuable**

At minimum:

- store product IDs are unique and valid for the archetype/unlock state;
- `freshnessPercent` is null or within `[0, 100]`;
- multipliers/prices are finite and non-negative/positive according to runtime contracts;
- `inventoryLossExpense` is finite and non-negative;
- product report values use safe numeric bounds already established by current save validation style.

Do not attempt to replay the entire daily simulation during decode.

- [ ] **Step 5: Run persistence suite/check and commit**

```bash
bun run test:unit -- --run src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveRepository.spec.ts
bun run check
git add src/lib/persistence
git commit -m "test(persistence): validate product dynamics state"
```

---

### Task 7: Surface product pressure in the existing stock/detail/report UI

**Files:**
- Modify: `src/lib/components/game/StoreStockTable.svelte`
- Modify: `src/lib/components/game/StoreStockTable.svelte.spec.ts`
- Modify: `src/lib/components/game/StoreDetailModal.svelte`
- Modify focused modal spec
- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- Modify: existing report-warning builder/types in `src/lib/game/simulateDay.ts` / `types.ts` as required
- Modify i18n messages only where these surfaces already use message keys

- [ ] **Step 1: Load required Svelte docs before editing**

Per `AGENTS.md`, call Svelte MCP `list-sections`, then `get-documentation` for every relevant section. Keep a note of the sections used in implementation work.

- [ ] **Step 2: Write component tests for compact pressure states**

Cover representative rows/summaries:

- fresh/perishable;
- freshness risk / waste;
- markdown/obsolescence;
- stockout-sensitive lost demand;
- neutral product with no pressure badge/no noise.

- [ ] **Step 3: Extend store report warnings in game logic**

Add focused warning variants/fields only as needed by the existing warning architecture. Thresholds are derived from product evidence; do not create a second alert engine.

- [ ] **Step 4: Update `StoreStockTable.svelte`**

Show concrete product name, stock, configured price, and at most one compact highest-priority pressure label per row. Do not expose FIFO lots.

- [ ] **Step 5: Update `StoreDetailModal.svelte`**

Surface the store's active product-pressure warning summary using existing modal composition. Avoid a new product tab unless current component structure makes it unavoidable.

- [ ] **Step 6: Update `ReportsPanel.svelte`**

Expose daily waste/shrink/markdown/stockout-lost-demand evidence in the existing product/store reporting area. Keep totals legible and avoid a new analytics dashboard.

- [ ] **Step 7: Run `svelte-autofixer` on every changed Svelte snippet until no issues remain**

This is mandatory repository guidance.

- [ ] **Step 8: Run client component tests/check and commit**

```bash
bun run test:unit -- --project client --run src/lib/components/game/StoreStockTable.svelte.spec.ts src/lib/components/game/StoreDetailModal.svelte.spec.ts src/lib/components/game/ReportsPanel.svelte.spec.ts
bun run check
git add src/lib/components/game src/lib/game/types.ts src/lib/game/simulateDay.ts src/lib/i18n
git commit -m "feat(ui): surface product dynamics pressure"
```

Use the actual focused modal spec filename present at implementation time.

---

### Task 8: Tune one visible mechanic per archetype and add one stable end-to-end proof

**Files:**
- Modify: `src/lib/game/products.ts`
- Modify: `src/lib/game/products.spec.ts`
- Modify representative simulation specs
- Modify: `src/routes/retail-sim.e2e.ts`

- [ ] **Step 1: Add one archetype-differentiation integration test each**

Use focused deterministic fixtures rather than long UI scenarios:

- grocery: produce/prepared stock ages into waste;
- electronics: devices age into obsolescence/markdown pressure;
- convenience: stockout of sensitive beverage produces attributed lost demand and warning;
- boutique: apparel trend + reputation sensitivity changes demand share.

- [ ] **Step 2: Tune production definitions conservatively**

Adjust only product catalog data. Do not branch on archetype in simulation code.

- [ ] **Step 3: Add one targeted Playwright scenario**

Choose the cheapest stable representative pressure to observe through existing UI controls. Prefer a deterministic seeded game/store and text/report assertion. Do not add pixel comparisons, sleeps, or a four-archetype e2e matrix.

- [ ] **Step 4: Run focused e2e and commit**

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "product pressure"
git add src/lib/game/products.ts src/lib/game/products.spec.ts src/lib/game/*.spec.ts src/routes/retail-sim.e2e.ts
git commit -m "test(products): cover archetype dynamics"
```

---

### Task 9: Remove migration scaffolding, verify contracts, and run the full gate

**Files:**
- Search all touched production/test files
- No new architecture expected

- [ ] **Step 1: Prove legacy identity is gone**

Search for final forbidden/legacy terms in retail-product context:

```bash
rg "startingCategories|categoryId|getFinishedMaterialIdForCategory|ProductCategory" src
```

Expected: no retail product identity usage remains. If a non-retail concept legitimately uses `categoryId`, verify it is unrelated before leaving it.

- [ ] **Step 2: Prove scalar store stock is gone**

Inspect `StoreProduct` call sites and ensure no persisted `.stock` field remains; UI/read models must use the stock helper/derived value.

- [ ] **Step 3: Verify no archetype branches implement dynamics**

```bash
rg "archetypeId.*(grocery|electronics|convenience|boutique)|case '(grocery|electronics|convenience|boutique)'" src/lib/game
```

Review matches. Existing unrelated archetype configuration switches are fine; HPA-38 dynamics arithmetic must be product-data-driven.

- [ ] **Step 4: Run formatting/lint/type/unit/build gates**

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run build
```

- [ ] **Step 5: Run the full test gate**

```bash
bun run test
```

Expected: unit + e2e green.

- [ ] **Step 6: Review persisted/accounting invariants**

Confirm:

- schema 17 only;
- no schema-16 migration;
- store lots are sole quantity source;
- waste/shrink reduce inventory once;
- inventory loss expense affects operating income but is not double-charged to cash;
- markdown affects actual revenue once;
- product reports and store/daily totals reconcile.

- [ ] **Step 7: Commit cleanup if needed**

```bash
git add -A
git commit -m "chore(products): finalize HPA-38 product model"
```

Skip the commit if verification required no changes.

---

## Implementation notes

### Keep commits green, but do not preserve legacy architecture

The Linear ticket explicitly permits compatibility helpers during incremental migration. Use them only when required to keep a task boundary testable. Delete them before Task 9.

### Use existing names as call-site clues, not as contracts

The current repo has many `category` names because `ProductCategory` was the original sellable unit. When the semantics are clearly product identity, rename them. Do not perform unrelated terminology cleanup.

### Preserve deterministic RNG behavior

Do not add RNG calls for trend, shrink, spoilage, or markdown. Existing city sales jitter remains the only stochastic sales variation in this slice. If an implementation change accidentally moves/adds RNG consumption, treat it as a regression unless a test proves the change is intentional.

### Do not solve HPA-39 early

`ProductId` is deliberately a stable seam that HPA-39 can reference. Do not add `BrandId`, competitor assortment, market share, brand reputation, brand modifiers, or competitor sales in this implementation.

## Definition of done

- HPA-38 acceptance criteria are represented by executable tests.
- `ProductId` is authoritative across archetypes, store state, reports, persistence, product art, and production mapping.
- Product families group concrete products without owning stock.
- FIFO lots support deterministic age-dependent mechanics with no SKU system.
- Product dynamics are optional, authored, deterministic, and shared across archetypes.
- Grocery, electronics, convenience, and boutique each have one visible differentiated mechanic.
- Waste/shrink/markdown/stockout attribution reconciles with inventory, income, and cash semantics.
- Schema 17 is strict and schema 16 is rejected.
- Existing Svelte surfaces present pressure without a broad redesign.
- `bun run check`, `bun run lint`, `bun run test`, and `bun run build` pass.
