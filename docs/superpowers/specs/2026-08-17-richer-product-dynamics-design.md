# Richer Product Types and Archetype-Specific Dynamics Design

**Date:** 2026-08-17  
**Linear:** HPA-38 — Archetype-specific product dynamics and richer product types  
**Status:** Normative; revised after two codebase-review passes

## Outcome

Use one static `PRODUCTS` catalog and one concrete `ProductId` identity to make the four store archetypes play differently without SKU inventory, brands/competitors, a rules DSL, or per-archetype simulation engines.

Keep:
- explicit `productionMaterialId`;
- FIFO lots as the sole runtime store quantity source;
- deterministic optional spoilage/shrink/trend/obsolescence/markdown/stockout/reputation data;
- the fixed 7-day after-sales replenishment cadence;
- strict schema 17, rejecting 16;
- existing stock/detail/report/warning UI seams.

## Review resolution

Accepted:
- define lot semantics for `store-stock-adjust-by-target-percent`;
- keep `buildCityDemandPools` trend-free because `supplyPlanner.ts` reuses it;
- expand the scalar-stock blast radius to level-up, scenarios, alerts/copy/UI/test fixtures, save invariants, and clone/restore paths;
- drop runtime `validateProductCatalog()`; use TypeScript + CI invariants;
- make store/daily inventory-loss reconciliation unconditional;
- derive freshness instead of persisting `freshnessPercent`;
- split semantic ProductId migration from scenario vocabulary cleanup;
- strengthen verification and name determinism/planner/event-lot risks.

Refinements:
- Event stock decreases are **not** waste/shrink expense. Existing stock-adjustment events are paired with explicit event cash effects, so HPA-38 only makes their lot mutation deterministic; operating `inventoryLossExpense` remains spoilage + shrink.
- Keep `familyId` as one typed catalog metadata field because HPA-38 explicitly asks for product families/category relationships. No family registry, runtime logic, UI, or DoD bullet.

## Product catalog

```ts
export type ProductFamilyId =
  | 'beverages' | 'convenience-goods' | 'fashion' | 'electronics' | 'grocery-food';

export type ProductId =
  | 'bottled-water' | 'soft-drinks' | 'snacks' | 'essentials' | 'household'
  | 'apparel' | 'home-goods' | 'gifts' | 'fashion-accessories'
  | 'games' | 'accessories' | 'devices' | 'peripherals'
  | 'produce' | 'pantry' | 'prepared' | 'bakery';

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

export const PRODUCTS: Readonly<Record<ProductId, ProductDefinition>> = { /* authored data */ };
export const getProductDefinition = (id: ProductId) => PRODUCTS[id];
```

Drop old unused `baseDemand` and `margin`.

No runtime catalog validator. TypeScript enforces key/ID completeness. `products.spec.ts` enforces only relational invariants:
- every non-null production material is `kind: 'finished'`;
- no archetype repeats a product ID;
- production age thresholds obey the 7-day rule;
- convenience contains `bottled-water` + `soft-drinks`;
- shared-product economics always come from `PRODUCTS`.

## Identity cut

`ProductId` is authoritative across `StoreProduct`, reports, archetypes, city demand, retail supply, product chains, supply planning, simulation-rule targets, scenarios, art, and persistence.

Breaking rename:
```text
retail soft-drinks -> finished material drinks
retail bottled-water -> finished material bottled-water
```

Delete `getFinishedMaterialIdForCategory`; all consumers use `getProductDefinition(productId).productionMaterialId`.

`RetailDemandProfile` becomes `Partial<Record<ProductId, number>>`; Garden Borough `drinks: 1.08` becomes `soft-drinks: 1.08`.

Scenario values become `ProductId` in the atomic semantic cut. A separate follow-up commit renames scenario field vocabulary:
```text
categoryId -> productId
categoryIds -> productIds
productCategoryIds -> productIds
```
This explicitly includes `src/lib/scenarios/validation/**` and `scenarioCodec.ts`.

## FIFO stock

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

`stock.ts` owns:
```ts
getStoreProductStock(product)
consumeStoreProductStock(product, quantity) // oldest first
addStoreProductStockLot(product, lot)
```

No persisted scalar `stock`. Every product clone deep-copies `lots`.

Explicit lot creation:
1. founding stock -> one lot at current/founding day;
2. level-up unlock -> one lot at `game.day`;
3. weekly replenishment -> one lot at closing/current day after sales;
4. scenario scalar stock override -> one runtime lot at scenario day (authoring input only, not `StoreProduct.stock`);
5. positive event stock adjustment -> append one new lot at `game.day`.

Negative event stock adjustment consumes FIFO:
```text
units = abs(round(targetStock * percent * 0.01))
next = consumeStoreProductStock(product, units)
```
It is not classified as waste/shrink expense.

All scalar readers use `getStoreProductStock` or a derived read model.

## Seven-day age contract

Keep `REPLENISHMENT_INTERVAL_DAYS = 7`. No emergency restock.

For HPA-38 production tuning:
```text
shelfLifeDays > 7
markdown.startsAtAgeDays > 7
obsolescence.startsAfterDays > 7
```

Age pressure is leftover-overstock pressure. Grocery proof: an old produce lot can expire while a newer lot remains sellable.

## Dynamics

```ts
export interface ProductDynamics {
  shelfLifeDays?: number;
  shrinkRate?: number;
  trend?: { amplitude: number; periodDays: number; phaseDays: number };
  obsolescence?: { startsAfterDays: number; demandFloor: number };
  markdown?: { startsAtAgeDays: number; priceMultiplier: number };
  reputationSensitivity?: number;
}
```

No new RNG draws. Existing per-seller sales jitter stays in the same call site/order.

A lot expires when `closingDay - receivedDay >= shelfLifeDays`.

Shrink:
```text
min(stockAfterSpoilage, floor(stockAfterSpoilage * shrinkRate))
```

Markdown and obsolescence both use **oldest sellable lot age**.

## Demand/revenue composition

`buildCityDemandPools` remains trend-free:
```text
base pool =
  city demand
  * product.demandWeight
  * marketing policy
  * pricing policy
  * retail city product multiplier
```

Only `simulateProductSalesForCity` applies trend once:
```text
sales pool = base pool * trendMultiplier(productId, game.day)
```

The supply planner therefore remains based on stable baseline demand. Add a regression that changing only `game.day` does not change planner potential demand.

Seller score with default sensitivity 1 exactly preserves today:
```text
reputationTerm =
  50 * 0.55
  + (reputation - 50) * 0.55 * reputationSensitivity

score = max(1,
  reputationTerm
  + staffCapacity * 0.25
  + (100 - competition) * 0.2)
```

Desired units:
```text
sales pool
* seller share
* obsolescenceMultiplier(oldestSellableAge)
* priceDemandMultiplier(product, baseSellingPrice)
* existing jitter
```

Catalog lookup replaces first-seller archetype economics lookup.

Markdown is revenue-only:
```text
effectivePrice = basePrice * markdownMultiplier(oldestSellableAge)
markdownAmount = max(0, baseRevenue - actualRevenue)
```
It never feeds price demand and never overwrites configured price.

Stockout attribution:
```text
sellableDemand = min(desiredUnits, remainingCapacity, remainingCityDemand)
stockoutLostDemand = max(0, sellableDemand - availableStock)
unitsSold = min(sellableDemand, availableStock)
demandMissed = max(0, desiredUnits - unitsSold)
```

The convenience proof uses this exact beverage stockout attribution; no
product-specific multiplier changes the reported lost demand.

## Report/accounting contract

Persist product evidence:
```ts
productId: ProductId;
wasteUnits: number;
wasteValue: number;
shrinkUnits: number;
shrinkValue: number;
stockoutLostDemand: number;
averageAgeDays: number | null;
oldestSellableAgeDays: number | null;
trendMultiplier: number;
obsolescenceMultiplier: number;
baseSellingPrice: number;
effectiveSellingPrice: number;
markdownAmount: number;
```

Do **not** persist `freshnessPercent`. Derive it from `averageAgeDays` + catalog `shelfLifeDays`.

Value operating inventory loss at `importCost`:
```text
wasteValue = wasteUnits * importCost
shrinkValue = shrinkUnits * importCost
storeInventoryLossExpense = sum(product wasteValue + shrinkValue)
dailyInventoryLossExpense = sum(store inventoryLossExpense)
```

Store internal `netIncome` becomes:
```text
grossMargin - operatingCosts - inventoryLossExpense
```
`importSpend` remains cash evidence. This correction is not a user-visible DoD item.

Daily:
```text
operatingIncome = grossMargin - operatingCosts - inventoryLossExpense
```
Operating cash flow does not subtract inventory loss again. Markdown lowers revenue once.

## Persistence

Bump `SAVE_SCHEMA_VERSION` to 17 and reject 16; no migration.

Validate product IDs, lot quantities/order/dates, report ranges, age fields, multipliers/prices, and inventory-loss totals.

Reconciliation is unconditional:
```text
store.inventoryLossExpense == sum(product.wasteValue + product.shrinkValue)
daily.inventoryLossExpense == sum(store.inventoryLossExpense)
```

No persisted `freshnessPercent`.

## UI

Reuse `StoreStockTable`, `StoreDetailModal`, `StoreOverview`, `ReportsPanel`, and existing warnings. Show derived stock, configured price, at most one pressure badge, derived freshness, and report waste/shrink/markdown/stockout/inventory-loss evidence. Do not expose lots or add a dashboard.

`soft-drinks` reuses `/assets/game/products/drinks.png`.

## Risks

- seeded determinism drift if RNG calls move/add;
- supply-planner day sensitivity if trend leaks into reusable baseline demand;
- event/lot bugs at positive/negative stock adjustments;
- shared-array mutation if lot clones remain shallow.

Each risk gets a focused regression.

## Definition of done

- one `ProductId` identity and one `PRODUCTS` catalog;
- explicit product -> finished-material mapping;
- FIFO lots are the only runtime store quantity source;
- event stock effects are deterministic and lot-safe;
- baseline city demand remains trend-free; sales apply trend once;
- four archetypes each expose one data-driven mechanic;
- product/store/daily evidence and inventory-loss accounting reconcile;
- freshness is derived, not persisted;
- schema 17 strict, schema 16 rejected;
- existing UI surfaces show the pressure;
- full verification passes.
