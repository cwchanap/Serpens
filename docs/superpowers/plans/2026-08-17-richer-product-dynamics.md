# Richer Product Types and Archetype-Specific Dynamics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Implement every behavior change test-first. Checkbox steps are the execution log.

**Goal:** Implement HPA-38 so concrete products have stable data-driven identities, explicit production mappings, deterministic optional dynamics, and visible archetype differentiation without SKU inventory or separate archetype simulation engines.

**Architecture:** `ProductId` is the one retail identity. `products.ts` is one static catalog; `familyId` is minimal metadata only, with no family registry/engine/UI. `StoreProduct` moves to FIFO lots as the sole quantity source. `productDynamics.ts` owns pure aging/trend/obsolescence/markdown/shrink arithmetic. `stock.ts` and `retailSupply.ts` remain the sales/replenishment owners. The seven-day replenishment cadence stays fixed. Schema 17 is strict and rejects 16.

**Tech stack:** TypeScript 6, SvelteKit/Svelte 5 runes, Vitest 4, Playwright, Bun, existing deterministic game-state machine.

## Global constraints

- Keep HPA-38 as one Linear ticket.
- Concrete `ProductId` is the only retail identity; no persisted `categoryId` alias or dual-write.
- Keep `ProductFamilyId` + `ProductDefinition.familyId` only because HPA-38 requires product families/category relationships. Do **not** add `PRODUCT_FAMILIES`, family inventory, family demand, family reports, or family UI.
- Do not carry unused `ProductCategory.baseDemand` or `margin` into the new catalog. Do not give them new jobs.
- Preserve current live economic tuning that is actually consumed: `demandWeight`, `importCost`, `defaultSellingPrice`, `priceSensitivity`.
- Preserve finished `MaterialId` values. Retail `drinks` becomes `soft-drinks`; finished material `drinks` remains.
- All product-to-production consumers use `productionMaterialId`; no string equality between `ProductId` and `MaterialId`.
- After Task 3, store inventory has one quantity source: FIFO `lots`; no mirrored persisted `stock` scalar.
- Every clone of a lot-backed product deep-copies `lots`; no shared mutable lot array.
- Replenishment remains every 7 days and after sales. HPA-38 does not change cadence or add emergency restocking.
- Production age thresholds (`shelfLifeDays`, markdown start, obsolescence start) must be **greater than** `REPLENISHMENT_INTERVAL_DAYS` so a normal fresh weekly lot remains sellable through the next scheduled sales day.
- Age-gated mechanics are leftover-overstock mechanics in this slice.
- Markdown uses oldest sellable lot age and changes revenue only. It never feeds `priceDemandMultiplier` and never mutates configured selling price.
- Obsolescence uses the same oldest sellable lot age as markdown.
- Trend is product/day-global and applies once to the city product pool.
- Reputation sensitivity scales the reputation-deviation term, not the whole seller score; sensitivity `1` exactly reproduces the current score.
- No new daily/global RNG draws. Existing sales jitter remains in the same per-seller call site/order.
- `wasteValue` / `shrinkValue` use `units * ProductDefinition.importCost`.
- Inventory loss affects operating income, not operating cash flow. Do not double-charge replenishment cash.
- Correct `DailyStoreReport.netIncome` to `grossMargin - operatingCosts - inventoryLossExpense`; keep `importSpend` separate cash evidence.
- Do not redefine legacy `DailyReport.netIncome`/finance semantics in this ticket; use explicit `operatingIncome`, `operatingCashFlow`, and `inventoryLossExpense` for HPA-38 reporting.
- Reuse `StoreStockTable`, `StoreDetailModal`, `ReportsPanel`; no product-management dashboard.
- Reuse existing product images; no image work.
- Schema 17 rejects schema 16; no pre-release migration.
- Brands and competitors remain HPA-39.
- Before editing Svelte, follow `AGENTS.md`: official Svelte MCP `list-sections`, fetch relevant docs, and run `svelte-autofixer` until clean.

---

## File structure

### New focused files

- `src/lib/game/products.ts` — authoritative product catalog, lookup, validation.
- `src/lib/game/products.spec.ts` — identity, family metadata, mapping, validation.
- `src/lib/game/productDynamics.ts` — pure aging, shrink, trend, oldest-age, obsolescence, markdown helpers.
- `src/lib/game/productDynamics.spec.ts` — exact arithmetic/boundaries.

### Existing owner groups to extend

- Domain/config: `src/lib/game/types.ts`, `archetypes.ts`, `leveling.ts` only where product terminology is semantic.
- Retail: `stock.ts`, `retailSupply.ts`, `simulateDay.ts`, focused specs.
- Production/read models: `productChainGraph.ts`, `productChainTree.ts`, `simulationRules.ts`, supply-planner files.
- World: `worldCatalog.ts`, `world.ts` and focused specs.
- Scenario domain: `src/lib/scenarios/**` and `src/lib/persistence/scenarioCodec.ts` + specs.
- Art: `src/lib/assets/gameArt.ts`, `gameArt.spec.ts`.
- Reports: `reports.ts` only where aggregation requires new explicit fields.
- Saves: `saveTypes.ts`, `saveCodec.ts`, current-schema repository fixtures/specs.
- UI: existing stock/detail/report Svelte components and focused specs.
- E2E: `src/routes/retail-sim.e2e.ts` for one representative proof.

---

## Task 1: Add the authoritative product catalog without changing runtime identity

**Files**

- Create `src/lib/game/products.ts`
- Create `src/lib/game/products.spec.ts`
- Modify `src/lib/game/types.ts`
- Read/reference `archetypes.ts`, `industry.ts`

**Contracts**

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
  demandWeight: number;
  importCost: number;
  defaultSellingPrice: number;
  priceSensitivity: number;
  productionMaterialId: MaterialId | null;
  dynamics: ProductDynamics;
}
```

- [ ] **1.1 RED: catalog validation tests**

Cover unique IDs, allowed family IDs, finite consumed economic values, finished-material mapping, invalid dynamic parameters, missing archetype references, and duplicate assortment IDs. Use injectable raw validation input; do not mutate the production registry.

- [ ] **1.2 Verify RED**

```bash
bun run test:unit -- --run src/lib/game/products.spec.ts
```

- [ ] **1.3 Implement the minimum frozen `PRODUCTS` registry**

No `PRODUCT_FAMILIES` registry. Family is one field on each product.

Carry only currently consumed category economics. Explicitly **omit** old unused `baseDemand` and `margin`.

Initial material mappings include:

```text
bottled-water -> bottled-water
soft-drinks   -> drinks
snacks        -> snacks
essentials    -> essentials
gifts         -> gifts
produce       -> produce
pantry        -> pantry
```

Unproduced products map to null.

- [ ] **1.4 Prove the minimal family relation**

Assert `bottled-water` and `soft-drinks` both have `familyId: 'beverages'`, but there is no family lookup/aggregation behavior.

- [ ] **1.5 Keep dynamics neutral**

Use `dynamics: {}` initially. No balance change in Task 1.

- [ ] **1.6 GREEN/check/commit**

```bash
bun run test:unit -- --run src/lib/game/products.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/products.ts src/lib/game/products.spec.ts
git commit -m "feat(products): add product catalog"
```

---

## Task 2: Make `ProductId` the one identity across the full blast radius

This is one breaking identity cut. Do not split it into category/product dual-write phases.

**Primary files**

- `src/lib/game/types.ts`
- `src/lib/game/archetypes.ts`
- `src/lib/game/stock.ts`
- `src/lib/game/retailSupply.ts`
- `src/lib/game/productChainGraph.ts`
- `src/lib/game/productChainTree.ts`
- `src/lib/game/worldCatalog.ts`
- `src/lib/game/world.ts`
- `src/lib/game/supplyPlanner.ts`
- `src/lib/game/supplyPlannerActions.ts`
- `src/lib/game/simulateDay.ts`
- `src/lib/game/simulationRules.ts`
- `src/lib/assets/gameArt.ts`
- `src/lib/scenarios/**`
- `src/lib/persistence/scenarioCodec.ts`
- focused specs/fixtures for all owners

**Final temporary pre-lot state**

```ts
export interface StoreArchetype {
  // existing fields
  startingProductIds: readonly ProductId[];
}

export interface StoreProduct {
  productId: ProductId;
  stock: number; // removed in Task 3
  reorderThreshold: number;
  targetStock: number;
  sellingPrice: number;
}

export interface DailyProductReport {
  productId: ProductId;
  // existing fields for now
}

export type RetailDemandProfile = Partial<Record<ProductId, number>>;
```

- [ ] **2.1 RED: identity integration tests**

Prove:

- all four archetypes reference valid product IDs in existing unlock order;
- convenience contains `bottled-water` + `soft-drinks`;
- initialization uses catalog definitions;
- `soft-drinks` replenishes from material `drinks`;
- product-chain support checks mapped material, not product-ID string equality;
- Garden Borough retains its old `drinks: 1.08` demand boost under `'soft-drinks': 1.08`;
- supply-planner snapshot/action paths resolve `productionMaterialId`;
- scenario metric/command/override product IDs survive the rename;
- product art resolves `soft-drinks` to the existing PNG;
- product reports carry `productId`.

- [ ] **2.2 Verify RED across focused owners**

```bash
bun run test:unit -- --run \
  src/lib/game/products.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/productChainGraph.spec.ts \
  src/lib/game/productChainTree.spec.ts \
  src/lib/game/world.spec.ts \
  src/lib/assets/gameArt.spec.ts
```

Include focused supply-planner/scenario specs present in the repo.

- [ ] **2.3 Replace embedded archetype definitions**

`archetypes.ts` becomes `startingProductIds`; `products.ts` owns product name/economics/dynamics. Preserve ordering and milestone unlock counts.

- [ ] **2.4 Rename runtime/report identity**

Convert semantic retail-product `categoryId -> productId`, including update commands and fixtures. Do not keep legacy exported identity types.

- [ ] **2.5 Type city demand profiles by `ProductId`**

Change `RetailDemandProfile` to `Partial<Record<ProductId, number>>` and update `worldCatalog.ts`:

```ts
'soft-drinks': 1.08
```

This must compile-time reject future stale `drinks` retail keys.

- [ ] **2.6 Replace implicit material identity everywhere**

Delete `getFinishedMaterialIdForCategory`.

Update:

- `retailSupply.ts`;
- `getSupportedStoreChainCategories` -> product terminology and `productionMaterialId` lookup;
- product-chain tree/graph callers;
- `supplyPlanner.ts`;
- `supplyPlannerActions.ts`;
- `simulateDay.ts` production/replenishment movement derivation.

No `supported.has(productId)` against `MaterialId` sets.

- [ ] **2.7 Retype retail-product rule targets**

Where simulation/scenario rules identify retail products, use `ProductId` rather than generic category strings. Keep the rule engine architecture unchanged.

- [ ] **2.8 Migrate scenario product identity in the same cut**

At minimum inspect/rename:

- `ScenarioCommand` selling-price/inventory-target payload fields;
- start blueprint product overrides;
- metric `categoryIds` -> `productIds`;
- `metrics.ts` report lookup/evidence IDs;
- `ScenarioContentRules.productCategoryIds` -> product terminology;
- scenario definitions/fixtures;
- `scenarioCodec.ts` validation and specs.

No compatibility alias: scenarios are pre-release too.

- [ ] **2.9 Retarget product art**

Key by `ProductId`; reuse `/assets/game/products/drinks.png` for `soft-drinks`.

- [ ] **2.10 Exhaustive identity audit**

```bash
bun run check
rg "startingCategories|categoryId|getFinishedMaterialIdForCategory|ProductCategory|productCategoryIds|categoryIds" src
```

Review every match. Leave only genuinely non-retail uses. Do not use `bun run check` as the *only* audit.

- [ ] **2.11 GREEN/commit**

Run all touched focused specs plus `bun run check`, then:

```bash
git add src/lib/game src/lib/assets src/lib/scenarios src/lib/persistence/scenarioCodec* 
git commit -m "refactor(products): use stable product ids"
```

---

## Task 3: Replace scalar store stock with FIFO lots and land schema 17

**Files**

- `src/lib/game/types.ts`
- `src/lib/game/stock.ts`
- `src/lib/game/retailSupply.ts`
- `src/lib/game/simulateDay.ts` clone/restore paths
- any read model/UI helper that reads `.stock`
- `src/lib/persistence/saveTypes.ts`
- `src/lib/persistence/saveCodec.ts`
- persistence specs/current-schema fixtures

**Final state**

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

- [ ] **3.1 RED: FIFO behavior**

Test total stock, oldest-first full/partial consumption, zero cleanup, canonical order, replenishment addition.

- [ ] **3.2 RED: clone isolation**

Build a store with multiple lots, clone it through the sales/policy/restore path, mutate/replace the clone's lots through the production helper, and assert the source store lots remain unchanged.

Explicitly cover `cloneStoreForStock`; review `applyPolicyPricingToStores` and `restoreProductSettings` after the shape change.

- [ ] **3.3 Implement pure lot helpers**

```ts
getStoreProductStock(...)
consumeStoreProductStock(...)
addStoreProductStockLot(...)
cloneStoreProduct(...)
```

Use the clone helper where practical so lot-copy semantics are not repeatedly hand-written.

- [ ] **3.4 Stamp founding/replenishment lots**

Founding stock is one lot at founding/current day. Replenishment appends one lot with `receivedDay = game.day` after sales.

- [ ] **3.5 RED: schema 17**

Test:

- `SAVE_SCHEMA_VERSION === 17`;
- valid lots round-trip;
- schema 16 rejected;
- invalid/unknown/duplicate product IDs rejected;
- product not allowed by archetype/unlock state rejected;
- lot quantity positive safe integer;
- received day valid/not future;
- canonical lot ordering;
- zero lots rejected or normalized consistently with the chosen canonical rule.

- [ ] **3.6 Implement strict schema 17**

No schema-16 branch. Preserve only the existing same-schema retail-city normalization safety net.

- [ ] **3.7 GREEN/commit**

```bash
bun run test:unit -- --run src/lib/game/stock.spec.ts src/lib/game/retailSupply.spec.ts src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveRepository.spec.ts
bun run check
git add src/lib/game src/lib/persistence
git commit -m "feat(products): track fifo product stock lots"
```

---

## Task 4: Add pure product-dynamics arithmetic and lock the seven-day age contract

**Files**

- Create `src/lib/game/productDynamics.ts`
- Create `src/lib/game/productDynamics.spec.ts`
- Modify `types.ts`, `products.ts`, `products.spec.ts`

**Interfaces**

```ts
export interface ProductInventoryAgingResult {
  product: StoreProduct;
  wasteUnits: number;
  wasteValue: number;
  shrinkUnits: number;
  shrinkValue: number;
  averageAgeDays: number | null;
  freshnessPercent: number | null;
  oldestSellableAgeDays: number | null;
}

export interface ProductMarketDynamics {
  trendMultiplier: number;
  obsolescenceMultiplier: number;
  markdownMultiplier: number;
}
```

- [ ] **4.1 RED: seven-day production tuning validation**

For authored production definitions, reject:

```text
shelfLifeDays <= REPLENISHMENT_INTERVAL_DAYS
markdown.startsAtAgeDays <= REPLENISHMENT_INTERVAL_DAYS
obsolescence.startsAfterDays <= REPLENISHMENT_INTERVAL_DAYS
```

Do not make this a generic runtime prohibition on arbitrary future content; it is HPA-38 production-catalog validation.

- [ ] **4.2 RED: exact shelf-life boundary**

```text
closingDay - receivedDay >= shelfLifeDays
```

Expired lots are removed before sales.

- [ ] **4.3 RED: leftover-overstock proof**

Use two produce lots: one older than shelf life, one new enough to sell. Assert only the old leftover lot wastes.

- [ ] **4.4 RED: shrink and valuation**

```text
shrinkUnits = min(stockAfterSpoilage, floor(stockAfterSpoilage * shrinkRate))
wasteValue = wasteUnits * definition.importCost
shrinkValue = shrinkUnits * definition.importCost
```

No RNG/fractional carry/selling-price valuation.

- [ ] **4.5 RED: age evidence**

Derive quantity-weighted average age/freshness plus **oldest sellable lot age**. Do not persist these on `StoreProduct`.

- [ ] **4.6 RED: trend**

Authored deterministic triangle wave; test beginning/peak/trough/wrap and RNG independence.

- [ ] **4.7 RED: obsolescence + markdown use the same oldest age**

Neutral before threshold; bounded after threshold. Empty stock -> null age + neutral multipliers.

- [ ] **4.8 Implement focused pure helpers**

No generic effect list/registry/DSL.

- [ ] **4.9 Add conservative production tuning**

Age-gated values must obey the interval constraint. Keep values data-only and easily testable.

- [ ] **4.10 GREEN/commit**

```bash
bun run test:unit -- --run src/lib/game/products.spec.ts src/lib/game/productDynamics.spec.ts
bun run check
git add src/lib/game
git commit -m "feat(products): add deterministic product dynamics"
```

---

## Task 5: Integrate one demand/revenue composition, exact stockouts, and accounting

**Files**

- `src/lib/game/stock.ts`
- `src/lib/game/simulateDay.ts`
- `src/lib/game/types.ts`
- `src/lib/game/retailSupply.ts`
- `src/lib/game/reports.ts` if aggregation requires it
- focused stock/simulate/replenishment/report specs

**Daily product evidence**

```ts
wasteUnits: number;
wasteValue: number;
shrinkUnits: number;
shrinkValue: number;
stockoutLostDemand: number;
averageAgeDays: number | null;
freshnessPercent: number | null;
oldestSellableAgeDays: number | null;
trendMultiplier: number;
obsolescenceMultiplier: number;
baseSellingPrice: number;
effectiveSellingPrice: number;
markdownAmount: number;
```

- [ ] **5.1 RED: pre-sales aging integration**

Expired stock cannot sell; aging evidence carries into the same product report.

- [ ] **5.2 Add one pre-sales aging pass**

Keep evidence keyed by store/product for report assembly. Do not put product mutation in UI/persistence.

- [ ] **5.3 RED: city pool formula**

Assert exactly:

```text
cityDemandBase
* demandWeight
* marketing policy
* pricing policy
* retailDemandProfile[productId]
* trend(day)
```

Trend applies once at pool construction.

- [ ] **5.4 RED: reputation-sensitive share**

Use:

```text
reputationTerm = 50 * 0.55 + (reputation - 50) * 0.55 * sensitivity
score = max(1, reputationTerm + staffCapacity * 0.25 + (100 - competition) * 0.2)
```

Test sensitivity `1` equals today's score. Test >1 increases separation between high/low reputation stores. Never multiply the full score by one product-level sensitivity constant.

- [ ] **5.5 RED: desired-units formula and RNG stability**

```text
desired = round(
  cityPool
  * share
  * obsolescence(oldestSellableAge)
  * priceDemandMultiplier(baseSellingPrice)
  * existingSalesJitter
)
```

`baseSellingPrice` is the existing policy-adjusted configured price before markdown. Preserve jitter call count/order.

- [ ] **5.6 RED: markdown is revenue-only**

`priceDemandMultiplier` receives base price, never markdown price.

```text
effectivePrice = basePrice * markdownMultiplier
actualRevenue = round(unitsSold * effectivePrice * existing store-level revenue multiplier)
baseRevenue = round(unitsSold * basePrice * existing store-level revenue multiplier)
markdownAmount = max(0, baseRevenue - actualRevenue)
```

Do not mutate configured price or add markdown expense.

- [ ] **5.7 RED: exact stockout attribution**

```text
sellableDemand = min(desiredUnits, remainingStoreCapacity, remainingCityDemand)
stockoutLostDemand = max(0, sellableDemand - availableStock)
unitsSold = min(sellableDemand, availableStock)
demandMissed = max(0, desiredUnits - unitsSold)
```

Test capacity misses and exhausted city demand are not stockouts.

- [ ] **5.8 Apply stockout sensitivity through existing reputation/customer penalties**

No demand creation and no archetype branch.

- [ ] **5.9 RED: store accounting**

Add `DailyStoreReport.inventoryLossExpense` and assert:

```text
inventoryLossExpense = sum(product wasteValue + shrinkValue)
grossMargin = revenue - costOfGoods
netIncome = grossMargin - operatingCosts - inventoryLossExpense
```

`importSpend` remains separate cash evidence and is not subtracted in store income.

- [ ] **5.10 RED: company accounting**

Add `DailyReport.inventoryLossExpense`:

```text
inventoryLossExpense = sum(store inventoryLossExpense)
operatingIncome = grossMargin - operatingCosts - inventoryLossExpense
```

Operating cash flow remains on the current cash basis and does not subtract inventory loss.

Do not alter legacy `DailyReport.netIncome` or finance-interest semantics here.

- [ ] **5.11 Neutral report defaults**

Every `DailyProductReport` construction/merge path provides zero/null dynamics fields, including replenishment-with-zero-sales paths.

- [ ] **5.12 Fixed-seed regression**

Same game/seed/day produces identical complete product/store evidence.

- [ ] **5.13 GREEN/commit**

```bash
bun run test:unit -- --run src/lib/game/productDynamics.spec.ts src/lib/game/stock.spec.ts src/lib/game/retailSupply.spec.ts src/lib/game/simulateDay.spec.ts
bun run check
git add src/lib/game
git commit -m "feat(products): apply product dynamics in daily simulation"
```

Include all touched split `simulateDay*.spec.ts` files.

---

## Task 6: Extend strict persistence validation for the complete HPA-38 state/report shape

**Files**

- `src/lib/persistence/saveCodec.ts`
- `src/lib/persistence/saveCodec.spec.ts`
- current-schema repository fixtures/specs
- scenario codec/spec only if Task 2 left current-schema checks to this checkpoint

- [ ] **6.1 RED: malformed report/state cases**

Reject unknown product IDs, invalid lots, negative units/value, invalid freshness/age, non-finite multipliers/prices, negative markdown, invalid `inventoryLossExpense`.

- [ ] **6.2 Add cheap cross-field invariants**

At minimum:

- product IDs unique/valid for archetype unlock state;
- lots canonical and positive;
- freshness null or `[0,100]`;
- age null or non-negative safe integer;
- multipliers/prices finite and contract-valid;
- `inventoryLossExpense` finite/non-negative;
- where all product rows exist, store inventory loss equals sum of product waste/shrink values;
- daily inventory loss equals sum store inventory losses.

Do not replay the simulation during decode.

- [ ] **6.3 Confirm schema-16 rejection remains direct**

No decode/migration branch.

- [ ] **6.4 GREEN/commit**

```bash
bun run test:unit -- --run src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveRepository.spec.ts
bun run check
git add src/lib/persistence
git commit -m "test(persistence): validate product dynamics state"
```

---

## Task 7: Surface compact pressure through existing UI

**Files**

- `StoreStockTable.svelte` + spec
- `StoreDetailModal.svelte` + spec
- `ReportsPanel.svelte` + spec
- game warning types/builder
- i18n messages as required

- [ ] **7.1 Load mandatory Svelte docs**

Use official Svelte MCP `list-sections` then fetch all relevant documentation before edits.

- [ ] **7.2 RED: component pressure states**

Cover perishable/freshness, waste, markdown/obsolescence, stockout-sensitive demand, neutral product.

- [ ] **7.3 Extend existing warning union/builder**

Focused variants only; no alert subsystem.

- [ ] **7.4 Stock table**

Show product name, derived stock, configured price, and at most one highest-priority pressure label. No lot UI and no family grouping.

- [ ] **7.5 Store detail**

Surface compact active product-pressure summary; do not add a new product tab unless existing composition makes it unavoidable.

- [ ] **7.6 Reports**

Show daily waste/shrink/markdown/stockout evidence and `inventoryLossExpense` near operating income/cash-flow evidence so non-cash inventory loss is legible.

- [ ] **7.7 Run `svelte-autofixer` until clean for every changed Svelte snippet**

- [ ] **7.8 GREEN/commit**

```bash
bun run test:unit -- --project client --run \
  src/lib/components/game/StoreStockTable.svelte.spec.ts \
  src/lib/components/game/StoreDetailModal.svelte.spec.ts \
  src/lib/components/game/ReportsPanel.svelte.spec.ts
bun run check
git add src/lib/components/game src/lib/game src/lib/i18n
git commit -m "feat(ui): surface product dynamics pressure"
```

---

## Task 8: Tune one visible mechanic per archetype and add one targeted E2E proof

**Files**

- `src/lib/game/products.ts`
- `products.spec.ts`
- representative simulation specs
- `src/routes/retail-sim.e2e.ts`

- [ ] **8.1 Grocery proof**

Fixture contains an old leftover produce lot plus a newer lot. Assert the old lot wastes while the newer lot remains sellable. Production shelf-life threshold must be >7 days.

- [ ] **8.2 Electronics proof**

Old devices cross the >7-day obsolescence/markdown threshold. Assert same oldest-age input drives both; markdown does not increase price-demand multiplier.

- [ ] **8.3 Convenience proof**

Sensitive beverage stockout produces the exact `stockoutLostDemand` amount and warning; capacity-limited demand is excluded.

- [ ] **8.4 Boutique proof**

For the same city pool/product/day, two stores with different reputations have greater share separation at authored sensitivity >1 than at sensitivity 1.

- [ ] **8.5 Tune only catalog data**

No archetype branches. Keep values conservative and tests focused on behavior/contracts rather than arbitrary balance numbers.

- [ ] **8.6 One targeted Playwright flow**

Choose the cheapest stable pressure observable through existing controls/report UI. Do not create a four-archetype E2E matrix, pixel assertions, or sleeps.

- [ ] **8.7 GREEN/commit**

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "product pressure"
git add src/lib/game/products.ts src/lib/game/products.spec.ts src/lib/game/*.spec.ts src/routes/retail-sim.e2e.ts
git commit -m "test(products): cover archetype dynamics"
```

---

## Task 9: Remove migration scaffolding and run the full gate

- [ ] **9.1 Prove old retail identity is gone**

```bash
rg "startingCategories|categoryId|getFinishedMaterialIdForCategory|ProductCategory|productCategoryIds|categoryIds" src
```

Review all matches. Non-retail `category` terminology may remain only if semantically unrelated.

- [ ] **9.2 Prove scalar store stock is gone**

Inspect `StoreProduct` call sites. No persisted `.stock`; all reads derive from lots.

- [ ] **9.3 Prove lot cloning is safe**

Audit shallow product copies:

```bash
rg "\.\.\.product|lots:" src/lib/game src/lib/scenarios src/lib/persistence
```

Verify every lot-backed clone either uses the canonical clone helper or explicitly clones lots.

- [ ] **9.4 Prove production mapping is explicit**

```bash
rg "ProductId|productionMaterialId|getSupportedStoreChain" src/lib/game
```

No retail-product/material equality shortcut remains.

- [ ] **9.5 Prove dynamics are not archetype branches**

```bash
rg "archetypeId.*(grocery|electronics|convenience|boutique)|case '(grocery|electronics|convenience|boutique)'" src/lib/game
```

Review matches; unrelated existing config is fine.

- [ ] **9.6 Verify accounting invariants**

Confirm:

- waste/shrink reduce inventory once;
- value basis is `importCost`;
- store net income includes inventory loss but not replenishment cash spend;
- daily operating income includes inventory loss;
- operating cash flow does not double-charge it;
- markdown affects revenue once;
- product -> store -> daily totals reconcile.

- [ ] **9.7 Full verification**

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run build
bun run test
```

- [ ] **9.8 Cleanup commit if needed**

```bash
git add -A
git commit -m "chore(products): finalize HPA-38 product model"
```

Skip if verification required no changes.

---

## Implementation notes

### Keep checkpoints green without preserving obsolete architecture

Temporary source-only helpers are allowed inside a task if needed for a green midpoint. Delete them before Task 9. Do not add persistence compatibility.

### Use old names only as search clues

The existing repo has many `category` names because category was the sellable identity. Rename only semantic retail-product uses; avoid unrelated vocabulary cleanup.

### Preserve RNG behavior

Do not add RNG for trend, shrink, spoilage, markdown, or obsolescence. Existing city-sales jitter stays at the same per-seller point and order. Treat RNG movement as a regression unless explicitly proven necessary.

### Do not solve HPA-39

No `BrandId`, brand assortment, competitor entity, competitor market share, rival event action, or brand modifier belongs here.

## Definition of done

- HPA-38 acceptance criteria are represented by executable tests.
- `ProductId` is authoritative across archetypes, stores, reports, city demand profiles, supply planning, scenarios, art, persistence, and production mapping.
- One minimal `familyId` relation exists, but no family subsystem exists.
- `soft-drinks` retains Garden Borough demand tuning and maps to finished `drinks`.
- FIFO lots are sole store quantity state and clone safely.
- Production age thresholds respect the seven-day replenishment contract.
- Trend applies once to the city pool; seller share/obsolescence/price apply at their locked sites.
- Reputation sensitivity is mathematically effective and baseline-preserving at 1.
- Markdown is revenue-only and uses oldest sellable age with obsolescence.
- Stockout attribution excludes capacity/city-demand misses.
- Waste/shrink use import-cost valuation and reconcile income/cash semantics.
- Grocery/electronics/convenience/boutique each have one visible data-driven mechanic.
- Schema 17 is strict and schema 16 is rejected.
- Existing Svelte surfaces present compact pressure evidence without a broad redesign.
- `bun run check`, `bun run lint`, `bun run test`, and `bun run build` pass.
