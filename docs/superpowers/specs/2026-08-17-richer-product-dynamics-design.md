# Richer Product Types and Archetype-Specific Dynamics Design

**Date:** 2026-08-17

**Linear:** HPA-38 — Archetype-specific product dynamics and richer product types

**Status:** Normative design for implementation

## Outcome

Make convenience, boutique, electronics, and grocery stores feel materially different through one richer, data-driven retail product model.

The implementation keeps the existing deterministic retail simulation and extends it in place:

- one authoritative static product catalog;
- stable concrete `ProductId` values as the retail inventory, report, persistence, and future brand attachment identity;
- product families as grouping/display metadata only;
- explicit product-to-finished-material mappings instead of the current implicit `category.id === MaterialId` coupling;
- FIFO stock lots only where the simulation needs age evidence, without SKU-level inventory;
- optional, authored product dynamics for freshness/spoilage, shrink, trends, obsolescence, markdown pressure, and stockout sensitivity;
- deterministic mechanics that do not add new daily RNG draws;
- product-level report evidence and store warnings;
- strict save schema 17, with schema 16 rejected under the existing pre-release save policy;
- no brands, competitors, shelf placement, customer agents, generic rules DSL, or separate per-archetype simulation engines.

## Why HPA-38 is actionable

HPA-38 has no blockers and blocks HPA-39, which needs a stable product identity before brands and competitors can be layered on top.

The codebase already contains the required seams:

- `types.ts` owns `ProductCategory`, `StoreProduct`, `StoreArchetype`, and daily report contracts;
- `archetypes.ts` already holds the current product/economic tuning, but embeds complete category definitions per archetype;
- `stock.ts` owns product initialization, city demand pools, stock consumption, pricing demand, and product reports;
- `retailSupply.ts` owns weekly replenishment and currently infers finished material identity from category strings;
- `productChainGraph.ts` and `productChainTree.ts` already connect retail products to production chains;
- `simulateDay.ts` already has a deterministic daily ordering and accounting reconciliation points;
- `StoreStockTable.svelte`, `StoreDetailModal.svelte`, and `ReportsPanel.svelte` already expose stock and report evidence;
- `saveCodec.ts` already enforces strict current-schema invariants, and the repository explicitly does not preserve pre-release saves.

HPA-38 should extend these seams instead of creating another retail subsystem.

## Current coupling to remove

Today `ProductCategory` is simultaneously:

1. product identity (`category.id`);
2. display metadata (`name`);
3. demand/price/import-cost tuning;
4. archetype assortment configuration;
5. a production material key when the string happens to match a finished `MaterialId`.

`StoreProduct.categoryId`, `DailyProductReport.categoryId`, `getFinishedMaterialIdForCategory`, `retailSupply.ts`, and product-chain builders all depend on this shape.

That works for one category = one sellable item, but it cannot express a family such as `drinks` containing both bottled water and soft drinks without either SKU simulation or more string conventions.

## Selected approach

### Approach A — static product catalog + concrete product identity + focused dynamics

Create a single static catalog and make concrete `ProductId` the retail identity everywhere. Archetypes list product IDs rather than embedding full definitions. Product definitions contain economic tuning, family metadata, explicit production linkage, and optional dynamics.

This is the selected approach because it removes the existing duplicated/coupled data while preserving the pure-state-machine architecture.

### Approach B — keep categories and add optional subtype strings

Rejected. This leaves reports, persistence, production mapping, and future brand attachment ambiguous about whether the category or subtype is authoritative.

### Approach C — generic product/effect rules engine

Rejected. HPA-38 has a closed set of mechanics and only four starting archetypes. A generic expression/effect DSL would add configuration and validation complexity without current reuse.

### Approach D — separate simulation path per archetype

Rejected. The Linear outcome explicitly calls for data-driven differentiation, and per-archetype branches would make later tuning and HPA-39 harder to maintain.

## Product identity model

Add `src/lib/game/products.ts` as the authoritative product registry.

The core contracts are deliberately small:

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
  demandWeight: number;
  importCost: number;
  defaultSellingPrice: number;
  priceSensitivity: number;
  productionMaterialId: MaterialId | null;
  dynamics: ProductDynamics;
}
```

The exact tuning values remain balance data, not architecture. Existing category values should be carried over first so the identity migration does not silently rebalance the game.

### Families are not inventory

`ProductFamilyId` is grouping metadata for UI, future assortment logic, and HPA-39. It never owns stock, price, demand, reports, or persistence.

For example:

```text
beverages
├── bottled-water -> material bottled-water
└── soft-drinks   -> material drinks
```

This satisfies the richer `drinks → bottled water / soft drinks` requirement without inventing brands or SKUs.

### Preserve existing product IDs where possible

Most current category IDs already represent sensible concrete products and should remain stable. The intentional breaking rename is current `drinks` retail identity → `soft-drinks`; the existing finished material `drinks` remains unchanged and is linked explicitly.

Because the project is pre-release, no persisted alias or schema migration is required. Compatibility helpers mentioned in HPA-38 are only temporary source-code migration aids while call sites are converted; they must not survive as a second public identity system.

## Product catalog validation

`products.ts` exposes explicit lookup and validation helpers:

```ts
export function getProductDefinition(id: ProductId): ProductDefinition;
export function getProductDefinitions(ids: readonly ProductId[]): ProductDefinition[];
export function validateProductCatalog(): void;
```

Validation must reject:

- duplicate product IDs;
- unknown family IDs;
- non-finite or invalid economic values;
- missing archetype product IDs;
- `productionMaterialId` values that do not exist or are not `finished` materials;
- invalid dynamic parameters;
- duplicate product IDs within one archetype assortment.

Do not require a one-to-one product/material relation. The mapping is explicit so future products may share a finished material without changing the inventory model.

## Archetype configuration

`StoreArchetype` changes from embedding `startingCategories: ProductCategory[]` to listing stable product IDs:

```ts
export interface StoreArchetype {
  // existing fields...
  startingProductIds: readonly ProductId[];
}
```

`archetypes.ts` remains the owner of which products an archetype sells and their unlock order. Product economics and dynamics move to `products.ts`.

Milestone leveling continues to unlock the first N entries. Rename category-oriented helpers only where the new name improves correctness; do not redesign store leveling in this ticket.

## Store product state

`StoreProduct` becomes concrete-product state:

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

Do not persist both `stock` and lots. Total stock is derived with one helper:

```ts
export function getStoreProductStock(product: StoreProduct): number;
```

Keeping one quantity source prevents scalar stock and age data from drifting.

### Why FIFO lots are justified

Shelf life, freshness, spoilage, aging, and markdown pressure need to know how old inventory is. An average-age scalar would produce unrealistic all-at-once spoilage and cannot consume oldest stock correctly. FIFO lots are the smallest state shape that gives exact age evidence while remaining far below SKU-level inventory.

A weekly replenishment adds at most one new lot per replenished product. Sales consume oldest lots first. Zero-quantity lots are removed immediately.

## Explicit production mapping

Delete `getFinishedMaterialIdForCategory` after the migration.

Retail supply resolves the product definition and uses `productionMaterialId`:

```text
StoreProduct.productId
  -> ProductDefinition.productionMaterialId
  -> source city inventory material
```

If `productionMaterialId` is null, replenishment imports the product exactly as today.

Product-chain views use the same explicit mapping rather than comparing product IDs to `MaterialId` strings. This is important for `soft-drinks -> drinks` and makes the production relation authoritative in one place.

## Product dynamics model

Keep dynamics as optional authored fields on `ProductDefinition`. Do not model arbitrary effects.

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

All fields are optional. A product with `{}` behaves like the current simulation apart from identity/lot representation.

Create `src/lib/game/productDynamics.ts` as the only owner of dynamics arithmetic and evidence. It is a focused helper module, not a registry or rule engine.

## Deterministic daily order

Preserve the existing `simulateDay` high-level sequence. Add product aging immediately before city retail sales:

1. transfer arrivals;
2. event rules and industry production;
3. build store profiles;
4. **age retail stock and apply spoilage/shrink for the closing day**;
5. simulate city sales using trend/obsolescence/markdown/stockout rules;
6. weekly replenishment, if due, adding a new lot stamped with the closing day;
7. build reports and reconcile accounting;
8. existing route/finance/event lifecycle work.

This ordering means inventory that expires on a day cannot be sold that day, while replenishment received after sales becomes available on the next sales day, matching the current replenish-after-sales behavior.

No new global RNG draws are introduced. Existing sales jitter keeps using the current RNG stream exactly where it already does.

## Freshness and spoilage

For products with `shelfLifeDays`:

```text
ageDays = closingDay - lot.receivedDay
expired when ageDays >= shelfLifeDays
```

Expired units are removed before sales and reported as `wasteUnits`.

Freshness is read-model evidence, not additional mutable state. Derive an integer `freshnessPercent` from the remaining shelf life of current lots, weighted by quantity. Products without shelf life report no freshness pressure.

## Shrink

`shrinkRate` is a deterministic fraction of available units removed before sales:

```text
shrinkUnits = min(stockAfterSpoilage, floor(stockAfterSpoilage × shrinkRate))
```

Tune production definitions so shrink is visible only where wanted. Do not add a hidden fractional carry accumulator or a new RNG stream in this ticket.

Tests may use larger fixture stock to exercise small shrink rates.

## Trend volatility

Trend is a deterministic authored triangle wave using `periodDays`, `phaseDays`, and `amplitude`.

The resolver returns a bounded demand multiplier. It must not use `Math.random`, the game RNG, dates, locale, or object iteration order.

A triangle wave is preferred over adding random trend events because it is inspectable, reproducible, and cheap to test.

## Obsolescence

Obsolescence is based on the age of stock being offered, not a global product-launch simulation.

For products with obsolescence:

- demand is unchanged until `startsAfterDays`;
- older inventory progressively reduces the product demand multiplier;
- the multiplier never falls below `demandFloor`.

This gives electronics an aging-inventory pressure without introducing model years, release calendars, or SKU generations.

## Markdown pressure

Markdown is an automatic effective sale-price adjustment when the oldest sellable lot reaches `startsAtAgeDays`.

The player's configured `StoreProduct.sellingPrice` remains the base price. Dynamics compute an `effectiveSellingPrice` for the day; they do not overwrite the configured price.

Reports include:

- `baseSellingPrice`;
- `effectiveSellingPrice`;
- `markdownAmount` = revenue at base price minus actual revenue, clamped to non-negative.

This keeps player settings stable while making aged inventory pressure visible.

## Stockout sensitivity and lost demand

The current report has one broad `demandMissed`. HPA-38 needs actionable attribution.

During sales, derive at least:

- `stockoutLostDemand`: units that could have sold within store capacity and city demand but were unavailable because product stock was insufficient;
- existing `demandMissed` remains the total missed demand.

`stockoutSensitivity` scales the customer/reputation penalty derived from `stockoutLostDemand`; it does not manufacture extra units of demand.

This makes convenience stores meaningfully care about availability while preserving the current demand-pool architecture.

## Boutique reputation pressure

`reputationSensitivity` is another product-level tuning value used by the existing store scoring path. It adjusts a product's store score around the existing reputation component; it is not an archetype branch.

Boutique products can combine `trend` + `reputationSensitivity`, so high-reputation stores capture more of a volatile fashion demand pool.

## Starting archetype mechanics

The first tuning pass must make one mechanic clearly visible per starting archetype:

| Archetype | Representative product pressure | Required player-visible evidence |
| --- | --- | --- |
| Grocery | `produce` / `prepared` shelf life | freshness warning + waste units/value |
| Electronics | `devices` trend + obsolescence + markdown | trend/aging pressure + markdown amount |
| Convenience | bottled water / soft drinks stockout sensitivity | stockout lost demand + availability warning |
| Boutique | apparel trend + reputation sensitivity | trend pressure and reputation-sensitive demand share |

Other optional fields can be present on definitions, but the implementation should avoid trying to make every mechanic equally strong in every archetype.

## Reports and accounting

Extend `DailyProductReport` with concrete `productId` and focused dynamics evidence:

```ts
productId: ProductId;
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

Use zero/null defaults so aggregation stays simple.

Waste and shrink are inventory losses, not new same-day cash purchases. Add a clearly named `inventoryLossExpense` to store/daily accounting so operating income recognizes destroyed inventory while operating cash flow continues to reflect the original replenishment/import spend only once.

Required reconciliation:

```text
inventoryLossExpense = sum(product wasteValue + shrinkValue)
operatingIncome = grossMargin - operatingCosts - inventoryLossExpense
operatingCashFlow remains revenue - cash operating costs - import spend - transport cost
```

Markdown is already reflected by lower actual revenue and must not also be booked as an expense.

## Warnings and presentation

Reuse existing store report warnings and current detail/report surfaces. Add focused warnings instead of a new alert subsystem:

- freshness/spoilage risk;
- active markdown/obsolescence pressure;
- high stockout-sensitive lost demand;
- material shrink when non-zero.

`StoreStockTable.svelte` should show product name, stock, price, and compact pressure state. `StoreDetailModal.svelte` can surface the active warning summary. `ReportsPanel.svelte` should expose daily waste/shrink/markdown/lost-demand evidence.

Do not add a product-management screen, forecasting dashboard, brand UI, or per-lot UI.

## Product art

Move product art identity from the old category terminology to `ProductId`. Reuse existing files; for `soft-drinks`, the existing `/assets/game/products/drinks.png` is sufficient for this ticket.

No new image asset is required to complete HPA-38.

## Persistence

The first persisted `StoreProduct` / report shape change bumps:

```ts
SAVE_SCHEMA_VERSION = 17
```

Schema 16 is rejected. Do not add a schema-16 migration.

`saveCodec.ts` validates:

- product IDs exist in the catalog;
- each store product is allowed by its archetype and current unlock count;
- no duplicate product IDs per store;
- stock lots contain safe non-negative integer quantities and valid `receivedDay` values;
- no zero-quantity lots after normalization/validation;
- product settings remain finite and valid;
- daily product report IDs and dynamics evidence are finite and internally sane.

The existing current-schema city normalization safety net is unrelated and remains unchanged.

## Compatibility during implementation

HPA-38 asks for compatibility helpers during incremental migration. Interpret this narrowly:

- it is acceptable for an intermediate green commit to expose a temporary `getProductDefinitionForCategoryId` or type alias while call sites move;
- temporary compatibility code is deleted before the schema-17 commit is considered complete;
- no persisted `categoryId` alias, dual-write, fallback decode, or old-save migration remains in final code.

This keeps incremental implementation safe without preserving a legacy architecture.

## Testing strategy

### Catalog and identity

- duplicate/missing/invalid definition validation;
- every archetype product resolves;
- `soft-drinks -> drinks` and other finished-material mappings resolve explicitly;
- product-chain support no longer depends on string equality.

### Inventory and dynamics

- FIFO sale consumption;
- lot aging and exact spoilage boundary;
- deterministic shrink;
- deterministic triangle-wave trend;
- obsolescence floor;
- markdown threshold and actual revenue;
- stockout-lost-demand attribution;
- no-dynamics product preserves baseline behavior.

### Simulation/accounting

- fixed seed remains reproducible;
- inventory loss expense reconciles without double-charging cash;
- replenishment adds new lots and consumes explicit production material mappings;
- each starting archetype demonstrates its representative mechanic.

### Persistence

- schema 17 round-trip;
- schema 16 rejection;
- invalid product IDs, duplicate store products, malformed lots, and invalid evidence rejected.

### UI/E2E

- store stock table renders richer product identity and pressure state;
- report panel renders waste/markdown/lost-demand evidence;
- one targeted e2e scenario proves a representative archetype pressure without relying on unstable pixel/layout details.

## Non-goals

- brand identities or competitor stores — HPA-39;
- SKU-level inventory, individual shelf slots, customer pathfinding, product variants, or model-year catalogs;
- dynamic player-created products;
- generic modifier/effect DSL;
- stochastic trend or shrink RNG;
- supplier contracts, procurement lead times, or a second warehouse model;
- new product artwork;
- persistence migration for schema 16;
- broad UI redesign.

## Acceptance mapping

HPA-38 is complete when:

- stable `ProductId` is authoritative across archetypes, store state, reports, save data, art lookup, and production linkage;
- existing products are represented deterministically, with `drinks` split at retail identity into bottled water and soft drinks;
- optional dynamics are deterministic and data-driven;
- grocery, electronics, convenience, and boutique each expose one visible differentiated mechanic;
- waste/shrink/markdown/stockout evidence reconciles with stock and accounting;
- schema 17 enforces the richer model under the project's pre-release policy;
- unit, persistence, component, and targeted e2e coverage prove the new contracts.
