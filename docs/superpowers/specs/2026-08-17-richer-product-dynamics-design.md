# Richer Product Types and Archetype-Specific Dynamics Design

**Date:** 2026-08-17

**Linear:** HPA-38 — Archetype-specific product dynamics and richer product types

**Status:** Revised after codebase review; normative design for implementation

## Outcome

Make convenience, boutique, electronics, and grocery stores feel materially different through one richer, data-driven retail product model.

The implementation extends the existing retail simulation in place:

- one authoritative static product catalog;
- stable concrete `ProductId` values as the retail inventory, report, scenario, persistence, art, and future brand-attachment identity;
- one minimal product-family relationship as metadata only, because HPA-38 explicitly asks for product families, but no family registry, family UI, family inventory, or family simulation behavior;
- explicit product-to-finished-material mappings instead of the current implicit `category.id === MaterialId` coupling;
- FIFO stock lots as the sole store-product quantity source once age mechanics land;
- optional, authored dynamics for shelf life/freshness, shrink, trends, obsolescence, markdown pressure, stockout sensitivity, and reputation sensitivity;
- a locked seven-day replenishment/age contract so perishables do not silently rebalance grocery into mid-week stockouts;
- one explicit demand/revenue composition shared by every seller;
- deterministic mechanics that add no new daily RNG draws;
- product-level report evidence, store warnings, and explicit inventory-loss accounting;
- strict save schema 17, with schema 16 rejected under the existing pre-release save policy;
- no brands, competitors, SKU/model identity, shelf placement, customer agents, generic rules DSL, or separate per-archetype simulation engines.

## Review resolution

The codebase review is accepted with two refinements:

1. The missing replenishment, sales-composition, identity-blast-radius, age, stockout, and accounting contracts are real and are locked below.
2. Product families are **not removed entirely**. HPA-38 explicitly requires product families/category relationships, so each product keeps one `familyId` field. The proposed `PRODUCT_FAMILIES` registry and any family-driven behavior are removed as YAGNI. A family field has no runtime simulation reader in this ticket.

The review's proposed `existing score × reputationSensitivity` formula is also refined: multiplying every seller by the same product-level constant cancels out of market share. Sensitivity therefore scales the **reputation deviation component** while preserving today's score exactly at sensitivity `1`.

## Why HPA-38 is actionable

HPA-38 has no blockers and blocks HPA-39, which needs a stable product identity before brands and competitors can be layered on top.

The codebase already contains the right owners:

- `types.ts` owns `ProductCategory`, `StoreProduct`, `StoreArchetype`, `RetailDemandProfile`, and daily report contracts;
- `archetypes.ts` embeds the current product/economic tuning;
- `stock.ts` owns initialization, city demand pools, seller share, price demand, stock consumption, and product reports;
- `retailSupply.ts` owns the fixed seven-day replenishment cadence and warehouse/import fallback;
- `productChainGraph.ts` / `productChainTree.ts` own retail-to-production read models;
- `worldCatalog.ts` owns product-keyed city demand profiles;
- `supplyPlanner.ts` / `supplyPlannerActions.ts` consume retail-product-to-material mapping;
- `src/lib/scenarios/**` and `scenarioCodec.ts` persist/query current category IDs;
- `simulateDay.ts` owns daily ordering and the store/company accounting reconciliation points;
- `StoreStockTable.svelte`, `StoreDetailModal.svelte`, and `ReportsPanel.svelte` already expose stock/report evidence;
- `saveCodec.ts` already enforces strict current-schema invariants and the repository explicitly does not preserve pre-release saves.

HPA-38 extends these owners instead of creating another subsystem.

## Current coupling to remove

Today `ProductCategory` combines:

1. sellable identity (`category.id`);
2. display metadata (`name`);
3. demand/price/import-cost tuning;
4. archetype assortment/unlock configuration;
5. a production material key when the string happens to equal a finished `MaterialId`.

The coupling leaks into store state, reports, city demand profiles, supply planning, scenario queries/commands, product art, persistence, and production-chain views.

The `drinks -> soft-drinks` rename proves string equality is not a valid production contract: the retail product becomes `soft-drinks`, while the finished material remains `drinks`.

## Selected approach

### Approach A — static product catalog + concrete product identity + focused dynamics

Create one static catalog and make concrete `ProductId` the authoritative retail identity. Archetypes list product IDs rather than embedding complete product definitions. Product definitions contain display/economic tuning, a minimal family relation, explicit production linkage, and optional dynamics.

This preserves the pure-state-machine architecture and removes duplicated/stringly identity without introducing a generic engine.

### Approach B — keep categories and add subtype strings

Rejected. Reports, persistence, production mapping, scenarios, and future brand attachment would still have two competing identities.

### Approach C — generic product/effect DSL

Rejected. HPA-38 has a closed mechanic set and four starting archetypes. An expression/effect system adds configuration and validation work with no current reuse.

### Approach D — separate archetype simulation paths

Rejected. Differentiation is authored through product data; simulation code must not branch on grocery/electronics/convenience/boutique for HPA-38 mechanics.

## Product identity model

Define the stable ID types with the domain contracts in `types.ts`; keep the registry in `products.ts`.

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
```

`products.ts` owns:

```ts
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

Do **not** copy `ProductCategory.baseDemand` or `margin` into the new model. Current sales do not consume them. HPA-38 must not invent a new meaning for dead fields merely to preserve the old blob.

### Family metadata is intentionally minimal

`familyId` is the smallest model that satisfies HPA-38's product-family/category-relationship requirement. It may later support grouping or HPA-39, but HPA-38 adds:

- no `PRODUCT_FAMILIES` registry;
- no family inventory;
- no family demand pool;
- no family report totals;
- no family UI grouping;
- no family-level dynamics.

For HPA-38, `bottled-water` and `soft-drinks` are simply sibling concrete products with `familyId: 'beverages'`.

## Product catalog validation

Expose focused lookup/validation:

```ts
export const PRODUCTS: Readonly<Record<ProductId, ProductDefinition>>;
export function getProductDefinition(id: ProductId): ProductDefinition;
export function getProductDefinitions(ids: readonly ProductId[]): ProductDefinition[];
export function validateProductCatalog(/* optional raw test input */): void;
```

Validation rejects:

- duplicate product IDs in injected/raw validation input;
- invalid family IDs;
- non-finite/invalid demand, cost, price, and sensitivity values;
- missing archetype product IDs;
- duplicate product IDs within one archetype assortment;
- `productionMaterialId` values that are missing or not `finished` materials;
- invalid dynamic parameters;
- any HPA-38 production tuning whose age-gated threshold violates the seven-day contract below.

Do not require one-to-one product/material mapping. Multiple retail products may map to one finished material later without changing store inventory identity.

## Archetype configuration

`StoreArchetype` lists product IDs in unlock order:

```ts
export interface StoreArchetype {
  // existing fields...
  startingProductIds: readonly ProductId[];
}
```

`archetypes.ts` owns only assortment/unlock order plus existing store-level tuning. `products.ts` owns product economics/dynamics.

Milestone leveling continues to unlock the first N IDs. Do not redesign leveling.

## Identity migration is one breaking cut

The project is pre-release. Do not dual-write `categoryId` and `productId`, persist aliases, or decode schema 16.

The identity cut includes all semantic category-ID users, not only the stock modules:

- `types.ts`: `StoreProduct.productId`, `DailyProductReport.productId`, typed `RetailDemandProfile = Partial<Record<ProductId, number>>`;
- `archetypes.ts`, `stock.ts`, `retailSupply.ts`;
- `productChainGraph.ts` / `productChainTree.ts`;
- `worldCatalog.ts`: rename Garden Borough `drinks: 1.08` to `'soft-drinks': 1.08` and let `ProductId` typing catch future stale keys;
- `supplyPlanner.ts` / `supplyPlannerActions.ts`: replace `getFinishedMaterialIdForCategory` with `ProductDefinition.productionMaterialId`;
- `simulateDay.ts`: product report defaults and production/replenishment movement mapping also use `productionMaterialId`;
- `simulationRules.ts` and scenario modifier targets: retail-product IDs mean `ProductId`;
- `src/lib/scenarios/types.ts`, `metrics.ts`, command/application code, definitions, codecs, and fixtures: rename category-oriented product identity/query fields to product terminology in the same cut;
- `src/lib/persistence/scenarioCodec.ts` and specs;
- `gameArt.ts`: product art is keyed by `ProductId`; `'soft-drinks'` reuses `/assets/game/products/drinks.png`.

Use `bun run check` plus an explicit `rg` audit; do not rely on a short handwritten file list to find every stale stringly identity.

## Explicit production mapping

Delete `getFinishedMaterialIdForCategory` after the identity migration.

The only retail-to-industry mapping is:

```text
StoreProduct.productId
  -> ProductDefinition.productionMaterialId
  -> finished MaterialId (or null)
```

Examples:

```text
bottled-water -> bottled-water
soft-drinks   -> drinks
snacks        -> snacks
essentials    -> essentials
gifts         -> gifts
produce       -> produce
pantry        -> pantry
```

`getSupportedStoreChainProducts` (renamed from category terminology) checks the **mapped finished material**, never `supported.has(productId)`.

If `productionMaterialId` is null, replenishment imports the retail product as today.

## Store product state and FIFO lots

After the lot migration:

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

Do not persist a parallel `stock` scalar.

```ts
export function getStoreProductStock(product: Pick<StoreProduct, 'lots'>): number;
export function consumeStoreProductStock(product: StoreProduct, quantity: number): StoreProduct;
export function addStoreProductStockLot(product: StoreProduct, lot: ProductStockLot): StoreProduct;
```

Sales consume oldest lots first. Zero-quantity lots are removed immediately. Replenishment appends at most one lot per replenished product.

### Clone/purity contract

Once lots exist, every store/product cloning path must clone `lots` as well. In particular review:

- `cloneStoreForStock`;
- policy-pricing clones;
- restore-product-settings clones;
- test fixture builders and `structuredClone` substitutes.

A shallow `{ ...product }` that shares the lots array is forbidden. Dynamics/stock helpers return new arrays rather than mutating a shared lot array.

## Seven-day replenishment and age contract

`REPLENISHMENT_INTERVAL_DAYS` remains 7 and replenishment remains after sales. HPA-38 does **not** change cadence or add emergency replenishment.

Age-gated mechanics are deliberately **leftover-overstock mechanics** on top of the seven-day cycle:

- production `shelfLifeDays` must be greater than `REPLENISHMENT_INTERVAL_DAYS`;
- production `markdown.startsAtAgeDays` must be greater than the interval;
- production `obsolescence.startsAfterDays` must be greater than the interval.

Therefore a fresh weekly lot is still sellable through the next scheduled sales day before replenishment, while older leftover stock may cross the threshold.

This is a first-slice balance constraint, not a universal product-model law. A future ticket may change replenishment cadence and then relax these parameters deliberately.

The grocery proof is explicit: an **old leftover produce lot** can spoil while a **newer lot remains sellable**. HPA-38 must not tune produce so a normal fresh weekly lot disappears mid-cycle.

## Product dynamics model

```ts
export interface ProductDynamics {
  shelfLifeDays?: number;
  shrinkRate?: number;
  trend?: {
    amplitude: number;
    periodDays: number;
    phaseDays: number;
  };
  obsolescence?: {
    startsAfterDays: number;
    demandFloor: number;
  };
  markdown?: {
    startsAtAgeDays: number;
    priceMultiplier: number;
  };
  stockoutSensitivity?: number;
  reputationSensitivity?: number;
}
```

All fields are optional. `{}` preserves baseline behavior apart from identity/lot representation.

Create `productDynamics.ts` as a focused pure arithmetic module. It is not a registry, generic rule evaluator, or second simulation engine.

## Deterministic daily order

Keep the existing high-level day order:

1. transfer arrivals;
2. event rules + industry production;
3. build store operation profiles;
4. age retail stock and apply spoilage/shrink for the closing day;
5. simulate city sales with the locked demand/revenue composition below;
6. weekly replenishment, if due, adding a lot stamped with the closing day;
7. build store/company reports and reconcile accounting;
8. existing route, finance, event expiry/history, decision generation.

No new global RNG draws are introduced. Existing sales jitter remains in its current per-seller call site/order.

## Shelf life, freshness, shrink, and age evidence

For a lot:

```text
ageDays = closingDay - receivedDay
expired when ageDays >= shelfLifeDays
```

Expired units are removed before sales.

For shrink:

```text
shrinkUnits = min(stockAfterSpoilage, floor(stockAfterSpoilage * shrinkRate))
```

No fractional carry and no shrink RNG.

`averageAgeDays` and `freshnessPercent` are derived report/read-model evidence; they are not persisted on `StoreProduct`.

### One authoritative age for markdown + obsolescence

Both markdown and obsolescence use the **oldest sellable lot age** after spoilage/shrink. Do not use weighted age for one mechanic and oldest age for the other.

If no sellable stock exists, the age is `null` and both age-driven multipliers are neutral.

This keeps one intuitive "old stock" definition in sales, reports, and tests.

## Trend volatility

Trend is a deterministic authored triangle wave over the game day. It is product/day global, not store-specific.

The resolver uses no RNG, wall clock, locale, or object iteration order.

## Locked demand and revenue composition

HPA-38 must not let each seller invent where modifiers apply.

### 1. City product pool

For each `ProductId`, build one city pool:

```text
cityProductDemand =
  cityDemandBase
  * product.demandWeight
  * marketingPolicyMultiplier
  * pricingPolicyMultiplier
  * retailDemandProfile[productId]
  * trendMultiplier(day)
```

`trendMultiplier` belongs here because it is day/product global. It must not be applied separately per store after the pool is split.

### 2. Store share

Preserve the current score at `reputationSensitivity = 1`:

```text
reputationTerm =
  50 * 0.55
  + (store.reputation - 50) * 0.55 * reputationSensitivity

storeScore = max(
  1,
  reputationTerm
  + store.staffCapacity * 0.25
  + (100 - store.competition) * 0.2
)

share = storeScore / sum(scores of sellers for this product)
```

Default sensitivity is `1`. Values above 1 make deviations from neutral reputation matter more; values below 1 flatten them. Multiplying the whole score by one product-level constant is forbidden because it cancels out of share.

### 3. Store desired units

`baseSellingPrice` means the existing policy-adjusted configured selling price **before markdown**. Keep the current pricing-policy flow; HPA-38 does not redesign it.

```text
desiredUnits = round(
  cityProductDemand
  * share
  * obsolescenceMultiplier(oldestSellableAge)
  * priceDemandMultiplier(productDefinition, baseSellingPrice)
  * existingSalesJitter
)
```

Obsolescence is store-specific because it depends on that store's old stock.

### 4. Markdown and revenue

Markdown does **not** feed `priceDemandMultiplier`. This prevents an aged/obsolete product from receiving an automatic clearance-demand boost that hides the pressure.

```text
effectiveSellingPrice = baseSellingPrice * markdownMultiplier(oldestSellableAge)
actualRevenue = round(unitsSold * effectiveSellingPrice * existingStoreRevenueMultiplier)
baseRevenue = round(unitsSold * baseSellingPrice * existingStoreRevenueMultiplier)
markdownAmount = max(0, baseRevenue - actualRevenue)
```

The configured product price is never overwritten by markdown.

## Stockout attribution

Use one exact stockout formula. Let:

```text
sellableDemand = min(desiredUnits, remainingStoreCapacity, remainingCityDemand)
stockoutLostDemand = max(0, sellableDemand - availableStock)
unitsSold = min(sellableDemand, availableStock)
demandMissed = max(0, desiredUnits - unitsSold)
```

Capacity misses and already-consumed city demand are therefore not mislabeled as stockouts.

`stockoutSensitivity` scales the existing reputation/customer penalty derived from `stockoutLostDemand`; it never creates demand.

## Waste/shrink valuation and accounting

Use the same unit-cost basis already used by sales COGS:

```text
wasteValue = wasteUnits * productDefinition.importCost
shrinkValue = shrinkUnits * productDefinition.importCost
inventoryLossExpense = sum(wasteValue + shrinkValue)
```

Do not value destroyed retail stock at selling price or at `margin`.

Waste/shrink remove inventory, but they are **not** a second same-day cash purchase. Replenishment/import cash was already recognized when inventory was acquired.

### Store report

Add `inventoryLossExpense` to `DailyStoreReport`.

Correct the existing store `netIncome` into an accrual-style store operating result:

```text
storeGrossMargin = storeRevenue - storeCostOfGoods
storeInventoryLossExpense = sum(product wasteValue + shrinkValue)
storeNetIncome = storeGrossMargin - storeOperatingCosts - storeInventoryLossExpense
```

`importSpend` remains separate cash-flow evidence and is not subtracted again from store income.

This is an intentional pre-release semantic correction; no compatibility layer is required.

### Daily company report

Add `inventoryLossExpense` to `DailyReport`:

```text
inventoryLossExpense = sum(store inventoryLossExpense)
operatingIncome = grossMargin - operatingCosts - inventoryLossExpense
```

Keep operating cash flow on the existing cash basis:

```text
operatingCashFlow = revenue - cash operating costs - import spend - scheduled transport cost
```

Do not subtract `inventoryLossExpense` from operating cash flow.

HPA-38 does not redefine the legacy `DailyReport.netIncome` field or finance-interest semantics; new UI/reconciliation should use the explicit `operatingIncome`, `operatingCashFlow`, and `inventoryLossExpense` fields.

Markdown is reflected once through lower actual revenue and is never booked as an expense.

## Daily product report evidence

Replace `categoryId` with `productId` and add:

```ts
productId: ProductId;
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

Every construction path supplies neutral zero/null defaults.

## Starting archetype mechanics

Tune at least one clearly visible mechanic per starting archetype, through product data only:

| Archetype | Representative pressure | Required visible proof |
| --- | --- | --- |
| Grocery | `produce` shelf life/freshness | old leftover lot wastes while newer lot remains sellable; waste value reported |
| Electronics | `devices` trend + obsolescence + markdown | old devices show lower demand + markdown evidence |
| Convenience | bottled water / soft drinks stockout sensitivity | exact stockout-lost-demand attribution + warning |
| Boutique | apparel trend + reputation sensitivity | same city pool, but high-vs-low reputation share diverges more than sensitivity 1 |

The first tuning pass must obey the seven-day threshold constraint for age-gated fields.

## Warnings and presentation

Reuse existing report-warning and UI surfaces:

- freshness/spoilage risk;
- markdown/obsolescence pressure;
- stockout-sensitive lost demand;
- material shrink when non-zero.

`StoreStockTable.svelte` shows product name, derived stock, configured price, and at most one highest-priority pressure label. Do not expose lots.

`StoreDetailModal.svelte` surfaces the store's active product-pressure summary.

`ReportsPanel.svelte` exposes waste/shrink/markdown/stockout evidence and company `inventoryLossExpense` alongside operating income/cash flow.

No new product dashboard, per-lot UI, brand UI, or forecasting screen.

## Product art

Key art by `ProductId`. Reuse the current image:

```ts
'soft-drinks': {
  productId: 'soft-drinks',
  path: '/assets/game/products/drinks.png',
  alt: 'Product icon for soft drinks'
}
```

No new image asset is required.

## Persistence

The first persisted store-product change bumps:

```ts
SAVE_SCHEMA_VERSION = 17
```

Schema 16 is rejected; there is no migration.

`saveCodec.ts` validates at least:

- product IDs are valid, unique per store, and allowed by archetype/unlock state;
- lot quantities are positive safe integers and `receivedDay` is valid/not future;
- lot ordering is canonical;
- product report numeric fields are finite and within their contract ranges;
- `freshnessPercent` is null or `[0, 100]`;
- age fields are null or non-negative safe integers;
- multipliers/prices are finite and valid;
- `inventoryLossExpense` is finite/non-negative and reconciles cheaply with product rows where the full evidence is present;
- world/scenario product IDs use the same `ProductId` domain.

Do not replay the whole simulation during decode.

Scenario persistence/codec is updated in the same identity cut; there is no category-ID compatibility path.

## Test strategy

### Unit

- product catalog/mapping validation;
- product-family metadata relation without family behavior;
- world demand profile `ProductId` completeness;
- explicit product -> finished-material mapping, including `soft-drinks -> drinks`;
- FIFO lot consumption and deep-clone purity;
- seven-day age threshold validation;
- spoilage/shrink/freshness/oldest-age arithmetic;
- deterministic trend wave;
- obsolescence/markdown using oldest sellable lot age;
- exact demand composition and reputation sensitivity;
- exact stockout attribution;
- waste/shrink valuation and store/daily accounting reconciliation;
- scenario/supply-planner identity call sites;
- schema 17 round-trip + malformed rejection.

### Component

Focused existing-surface tests for stock pressure, store warning summary, and report evidence.

### E2E

One deterministic representative product-pressure flow, not a four-archetype matrix.

## Non-goals

- brands or brand assortment;
- competitor simulation/market share;
- SKU/model/year identity;
- customer agents/pathfinding;
- shelf placement;
- product-family demand or inventory;
- changing the seven-day replenishment cadence;
- automatic emergency restocking;
- stochastic shrink/trend events;
- generic rules/effect DSL;
- broad accounting/finance redesign outside the explicit inventory-loss/store-income correction above;
- save migration/backward compatibility.

## Definition of done

HPA-38 is complete when:

- `ProductId` is authoritative across archetypes, state, reports, world demand, supply planning, scenarios, art, persistence, and production mapping;
- the minimal `familyId` relation exists without an unused family subsystem;
- `soft-drinks` retains the Garden Borough boost and maps to finished material `drinks`;
- FIFO lots are the sole store quantity source and clone safely;
- age-gated production tuning cannot invalidate the seven-day replenishment contract;
- every seller uses the same pool/share/desired/revenue formula;
- markdown is revenue-only and does not alter price-demand calculation;
- obsolescence and markdown use oldest sellable lot age;
- stockout attribution excludes capacity/city-demand misses;
- waste/shrink use import-cost valuation and reconcile store/company income without double-charging cash;
- each starting archetype has one player-visible data-driven mechanic;
- schema 17 is strict and schema 16 is rejected;
- existing UI surfaces show compact pressure evidence;
- focused tests plus `bun run check`, `bun run lint`, `bun run test`, and `bun run build` pass.
