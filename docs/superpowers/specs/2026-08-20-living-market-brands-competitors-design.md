# Living Market: Product Brands and Lightweight Competitors Design

**Date:** 2026-08-20
**Linear:** HPA-39 — Living market: product brands and lightweight competitors
**Status:** Normative planning spec; revised after codebase review

## Outcome

Add a visible market around the existing retail simulation without creating a second simulation stack:

1. every existing `StoreProduct` carries one supported brand selection;
2. brand data changes attraction, direct demand, unit cost, and customer response while `StoreProduct.sellingPrice` remains the one customer-facing shelf price;
3. each opened retail city owns two deterministic lightweight competitors with persisted identity and posture but no inventory, staffing, finance, factories, or logistics;
4. city/product demand is split visibly between the player company and competitors before HPA-41's existing per-seller allocation runs;
5. the old random `Store.competition` scalar is removed so named competitors replace hidden competition penalties rather than stack on top of them;
6. daily store `marketPosition` explicitly incorporates the visible player market share instead of silently dropping competition pressure;
7. competitor promotions use timed event modifiers, while typed immediate effects support launch/closure and repositioning;
8. existing Store Detail, Reports, retail map, persistence, Supply Planner, and event surfaces expose the feature.

This remains one HPA-39 implementation PR. Do not add multi-brand SKU inventory, a rival economy, a generic market engine, a second shelf-price lens, a new dashboard, multiplayer, acquisitions, or franchising.

## Review resolution

The codebase review identified six integration gaps. All are accepted:

- **Single shelf-price contract:** `priceMultiplier` is a write-through default used when a product row is created or its brand changes. Live simulation continues to read `StoreProduct.sellingPrice`; no `brandCustomerPrice` or second live price is introduced.
- **Explicit brand mutation route:** `GameRouteController` gains sandbox-only `updateStoreProductBrand(...)` with no `ScenarioCommand`, following the same no-scenario mutation pattern as scoped policy overrides.
- **Visible share drives market position:** after removing `Store.competition`, store report `marketPosition` receives a bounded adjustment from the store's mean eligible-product player share.
- **One seller-score seam:** `stock.ts` exports `brandedSellerScore(store, productId)` and live sales, planner demand, and market-share resolution reuse it rather than copying attraction arithmetic.
- **Complete blast radius:** schema work includes `scenarioCodec.ts`/`.spec.ts`; timed-effect work includes `ActiveModifiers.svelte` and every exhaustive effect switch; competitor immediate effects read and validate `decision.target` at the actual `applyEffect` mutation site.
- **Stable checkpoint fixtures:** Task 2 brand-only numeric sales fixtures explicitly use `competitors: []`; Task 3 adds market pressure around those already-pinned brand terms.

Two smaller refinements are also adopted:

- `ensureCompetitorsForRetailCity` is an explicit no-op for industry cities and non-materialized retail cities.
- competitor `productFocus` is always 1–2 unique known `ProductFamilyId` values; persisted/event-provided focus outside that bound is rejected.

## Existing seams

HPA-39 extends current code rather than replacing it:

- `src/lib/game/products.ts`: static `PRODUCTS` catalog and product economics;
- `src/lib/game/productDynamics.ts`: trend, obsolescence, aging, markdown, and shrink calculations;
- `src/lib/game/stock.ts`: raw city demand, seller eligibility/scoring, policy-adjusted demand, sales, and product reports;
- `src/lib/game/retailSupply.ts`: weekly retail replenishment and retail import-cost accounting;
- `src/lib/game/simulateDay.ts`: deterministic daily ordering, store profile calculation, and report composition;
- `src/lib/game/state.ts` / `src/lib/game/world.ts`: new-game and retail-city lifecycle;
- `src/routes/gameRouteController.ts`: explicit command/autosave boundary for selling price and inventory target edits;
- `src/lib/game/eventTargets.ts`, `eventEffects.ts`, `eventModifiers.ts`, `eventCatalog.ts`: event extension points;
- `src/lib/components/game/ActiveModifiers.svelte`: player-visible timed-modifier rendering with an exhaustive effect switch;
- `src/lib/game/mapRender.ts` + `src/lib/phaser/cityMapScene.ts`: snapshot-only retail map rendering;
- `StoreStockTable.svelte`, `StoreDetailModal.svelte`, `ReportsPanel.svelte`: existing player-facing homes;
- `src/lib/persistence/saveCodec.ts` and `scenarioCodec.ts`: current-game persistence and scenario-run embedding of current `GameState`/save schema.

## Scope decisions

- **One brand per existing product row.** `Store.products` already has one inventory/configuration row per `ProductId`. A second brand dimension would require per-brand lots, reorder targets, prices, replenishment, and reporting and would turn HPA-39 into SKU simulation. The store's brand assortment/mix is simply the selected brands across its current product rows.
- **Defaults are inheritance.** New stores and newly unlocked products inherit `ProductDefinition.defaultBrandId`; the player may override the brand for that store/product when supported. Do not add company/city brand inheritance.
- **One shelf price.** `StoreProduct.sellingPrice` remains what customers pay before existing markdown. Brand `priceMultiplier` only chooses a recommended/default price when a row is created or brand is changed.
- **Brand control is sandbox-only.** Scenarios receive deterministic default brands and competitor pressure but do not gain a new scenario command/capability in HPA-39.
- **Competitors are not `Store`.** They never enter staffing, inventory, rent, finance, supply, placement, or manager-delegation flows.
- **Competitor locations are non-blocking map presence.** They are approximate city-map locations for visibility only and never reserve tiles or affect placement validity.
- **Competitor generation uses a derived RNG.** It must not consume or reorder the main `GameState.rngState` stream.
- **Remove `Store.competition`.** Today it is a hidden random scalar that depresses seller score and market position and raises operating cost. HPA-39 replaces it with explicit market share. Do not retain a compatibility alias, shadow penalty, or dummy RNG draw.
- **No new management surface.** Brand controls stay in stock/detail, market evidence stays in Reports, and rivals appear on the existing retail map.
- **No new image asset is required.** Rival map presence uses lightweight Phaser graphics and existing labels; do not create competitor storefront art.
- **Pre-release save policy stays strict.** Schema 19 rejects schema 18; no migration or alias path.

## Brand domain

### Catalog and identity

Add closed brand identity to `types.ts` and a static catalog in `brands.ts`:

```ts
export type BrandId =
  | 'common-ground'
  | 'budget-bay'
  | 'northstar-select'
  | 'fresh-field';

export type BrandPositioning = 'value' | 'mainstream' | 'premium';

export interface BrandDefinition {
  id: BrandId;
  name: string;
  positioning: BrandPositioning;
  supportedProductIds: readonly ProductId[];
  quality: number;                 // 0..100
  loyaltyMultiplier: number;       // market attraction
  availabilityMultiplier: number;  // market attraction / reach
  priceMultiplier: number;         // write-through default only
  demandMultiplier: number;        // live/planner seller demand
  unitCostMultiplier: number;      // retail COGS/import cost
}
```

Initial authored profiles remain deliberately small:

| Brand | Positioning | Quality | Loyalty | Availability | Default price | Demand | Unit cost | Support |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Common Ground | mainstream | 50 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | all current products |
| Budget Bay | value | 42 | 0.95 | 1.08 | 0.90 | 1.10 | 0.84 | bottled water, soft drinks, snacks, essentials, household, produce, pantry, prepared, bakery |
| Northstar Select | premium | 82 | 1.12 | 0.92 | 1.18 | 0.94 | 1.10 | apparel, home goods, gifts, fashion accessories, games, accessories, devices, peripherals |
| Fresh Field | premium | 74 | 1.08 | 0.98 | 1.08 | 1.06 | 1.04 | produce, pantry, prepared, bakery |

`ProductDefinition` gains required `defaultBrandId`; all current products default to `common-ground`.

`brands.ts` owns:

```ts
export function getBrandDefinition(brandId: BrandId): BrandDefinition;
export function getSupportedBrands(productId: ProductId): readonly BrandDefinition[];
export function isBrandSupported(productId: ProductId, brandId: BrandId): boolean;

export interface BrandEconomics {
  unitCost: number;
  demandMultiplier: number;
  marketAttractionMultiplier: number;
  customerResponse: number;
}

export function resolveBrandEconomics(
  product: ProductDefinition,
  brandId: BrandId
): BrandEconomics;

export function getBrandDefaultSellingPrice(
  product: ProductDefinition,
  brandId: BrandId
): number;
```

Formulas:

```text
brandDefaultSellingPrice = max(1, round(product.defaultSellingPrice * brand.priceMultiplier))
unitCost = product.importCost * brand.unitCostMultiplier
marketAttractionMultiplier = brand.loyaltyMultiplier * brand.availabilityMultiplier
customerResponse = clamp(-3, 3, round((brand.quality - 50) / 10))
```

There is intentionally no live `customerPrice` field. Existing `StoreProduct.sellingPrice` and existing `DailyProductReport.baseSellingPrice` / `effectiveSellingPrice` remain the price contract and evidence.

Catalog tests pin unique IDs, known product support, positive finite multipliers, quality bounds, supported defaults, at least one three-brand product, and at least one rejected combination.

### Store assortment and price write-through

`StoreProduct` gains:

```ts
brandId: BrandId;
```

`StoreProductPatch` gains optional `brandId` for the shared domain transition, but UI routing does not assume a generic controller command.

`createStoreProduct` initializes:

```text
brandId = product.defaultBrandId
sellingPrice = getBrandDefaultSellingPrice(product, product.defaultBrandId)
```

`updateStoreProduct` rules:

1. unsupported `brandId` => return original game unchanged;
2. valid brand change updates `brandId`;
3. when a brand changes and the same internal patch does not explicitly provide `sellingPrice`, write through the new brand default price;
4. later player, manager, and scenario selling-price edits continue to mutate `StoreProduct.sellingPrice` directly and are not multiplied again by brand data.

This keeps manager/scenario price semantics unchanged and avoids a second price lens.

### Explicit controller mutation

`GameRouteController` gains:

```ts
updateStoreProductBrand(
  storeId: string,
  productId: ProductId,
  brandId: BrandId
): Promise<GameRouteCommitResult>
```

It calls the existing `updateStoreProduct(game, storeId, productId, { brandId })`, carries normal stock-edit feedback/audio if appropriate, and deliberately has **no** `ScenarioCommand`. The route threads `canUpdateBrand` next to the existing selling-price/inventory capabilities; active scenarios disable brand editing instead of inventing scenario semantics.

## Live brand economics

### One branded seller-score seam

After removing hidden competition, `stock.ts` exports:

```ts
export function brandedSellerScore(store: Store, productId: ProductId): number;
```

It:

1. verifies the product row exists;
2. calculates the existing reputation-sensitive base score using reputation + staff capacity only;
3. resolves the row's selected brand;
4. multiplies by `marketAttractionMultiplier`.

Live sales, `getPolicyAdjustedCityProductDemand`, and `marketCompetition.ts` all use this function. Do not copy the base score or brand-attraction arithmetic into another module.

### Sales formula

For a live seller after the competitor split:

```text
sellerShare = brandedSellerScore / totalPlayerAttraction
policyDemand = sellerPolicyDemand(companyDemandPool, sellerShare, effectivePolicy)

desiredUnits = policyDemand
             * brand.demandMultiplier
             * obsolescenceMultiplier
             * priceDemandMultiplier(productDefinition, storeProduct.sellingPrice)
             * existingJitter

base revenue = unitsSold * storeProduct.sellingPrice * storeRevenueMultiplier
effective selling price = storeProduct.sellingPrice * markdownMultiplier
revenue = unitsSold * effective selling price * storeRevenueMultiplier
costOfGoods = unitsSold * brand.unitCost
```

The current sales RNG call remains exactly where it is; brand and competitor calculations add no RNG.

Weekly imported retail replenishment uses `brand.unitCost` as baseline import cost, then composes existing event import-cost multipliers exactly once. Warehouse/local-material consumption is unchanged.

`DailyProductReport` adds only brand evidence that is not already represented by existing price fields:

```ts
brandId: BrandId;
brandUnitCost: number;
brandDemandMultiplier: number;
brandMarketAttractionMultiplier: number;
brandCustomerResponse: number;
```

At store close, sold units weight `brandCustomerResponse`. The resulting rounded response adjusts ending store reputation before the normal company scorecard consumes that report. No persistent loyalty ledger or customer cohort is added.

## Remove hidden competition and connect visible share to market position

Delete `Store.competition` from the type, initialization, persistence, fixtures, and formulas.

The store operation profile becomes competition-free:

```text
base seller score = reputation term + staffCapacity * 0.25
base market position = 35 + localDemand / 5 + reputation / 3 + marketing.market
operating cost = baseRent * 0.92 + marketing.cost
```

The final `DailyStoreReport.marketPosition` then incorporates visible market evidence. For the products the store actually sells, take the current day's matching `DailyMarketReport.playerShare` values:

```text
meanPlayerShare = mean(playerShare for this store's eligible product rows)
shareAdjustment = round((meanPlayerShare - 0.50) * 20)  // bounded -10..+10
marketPosition = clampScore(baseMarketPosition + shareAdjustment)
```

If no eligible market row exists, use adjustment `0` rather than fabricating share. This keeps the existing operational health inputs while making the direction truthful: more rival pressure lowers `marketPosition`, stronger player share raises it.

This is a declared balance change. Exact legacy seeded totals are not compatibility requirements.

## Lightweight competitor state

Add:

```ts
export type CompetitorStatus = 'active' | 'closed';
export type CompetitorPricePosture = CompanyPolicy['pricing'];

export interface MarketCompetitor {
  id: string;
  name: string;
  cityId: WorldCityId;
  location: StoreLocation;
  archetypeId: ArchetypeId;
  reputation: number;
  pricePosture: CompetitorPricePosture;
  productFocus: ProductFamilyId[]; // exactly 1-2 unique values
  brandIds: BrandId[];
  status: CompetitorStatus;
}
```

`GameState` gains required `competitors: MarketCompetitor[]`.

### Deterministic generation

`competitors.ts` owns a pure generator and idempotent initializer. Every opened **retail** city gets exactly two competitors.

Generation seed:

```text
normalizeSeed(game.seed + worldCity.seed * 37 + 39_039)
```

Use a local RNG created from that seed; never touch `game.rngState`.

Generation rules:

- stable IDs `competitor-${cityId}-1` / `-2`;
- fixed small fictional-name list;
- existing retail archetypes;
- reputation 45..75;
- existing four pricing postures;
- exactly 1–2 unique product-family focuses compatible with the selected archetype;
- `common-ground` plus at most one compatible specialist brand;
- deterministic approximate buildable-tile location, preferring an unowned tile at generation time;
- status starts `active`;
- output canonical by competitor ID.

`ensureCompetitorsForRetailCity(game, cityId)` returns the original game when the city is industry, unopened, or not materialized. `createNewGame` calls it for Harbor City after the founding store exists. `openWorldCity` calls it after a new retail map is materialized; financed opening already reuses that transition.

Competitors never occupy land. A later player store may use the same tile.

## Explicit market-share calculation

Create `marketCompetition.ts` as a pure read model. It does not simulate rival sales.

### Player attraction

For the current city/product:

```text
playerAttraction = sum(brandedSellerScore(store, productId))
```

### Competitor attraction

A competitor is eligible only when active, in the current opened retail city, its archetype supports the product, and at least one rival brand supports the product.

For each eligible competitor:

```text
base = 25 + reputation * 0.5
focus = 1.20 when product.familyId is focused, otherwise 0.85
postureBase = discount 1.12 | competitive 1.06 | standard 1.00 | premium 0.90
price = clamp(0.5, 1.5, 1 + (postureBase - 1) * product.priceSensitivity)
brand = average(loyaltyMultiplier * availabilityMultiplier) of compatible brands
promotion = product of active competitor-attraction modifiers, default 1
competitorAttraction = base * focus * price * brand * promotion
```

No rival inventory, capacity, staffing, per-product price, cash, or revenue is modeled.

### Demand split

```text
denominator = playerAttraction + sum(competitorAttraction)
playerMarketShare = denominator > 0 ? playerAttraction / denominator : 0
competitorShare_i = competitorAttraction_i / denominator
companyDemandPool = cityProductDemandPool * playerMarketShare
```

For live sales, the pool is trend-adjusted first, then split, then passed into HPA-41 seller policy allocation and the brand/direct-price dynamics above. Do not restore shared residual-demand capping.

For Supply Planner, use the same current attraction/share and brand-demand terms against the existing trend-free raw pool. Planner still excludes future trend, jitter, obsolescence, markdown, and future rival actions; already-active rival promotion is current state and therefore affects the snapshot.

### Daily market evidence

Add:

```ts
export interface DailyMarketCompetitorReport {
  competitorId: string;
  share: number;
  attractionScore: number;
  reputation: number;
  pricePosture: CompetitorPricePosture;
  focused: boolean;
  brandIds: BrandId[];
  eventMultiplier: number;
}

export interface DailyMarketReport {
  cityId: WorldCityId;
  productId: ProductId;
  cityDemandPool: number;
  playerDemandPool: number;
  playerShare: number;
  playerShareDelta: number | null;
  playerAttractionScore: number;
  competitors: DailyMarketCompetitorReport[];
}
```

`simulateProductSalesForCity` returns current market rows alongside product reports. `simulateDay` fills delta from the latest completed report by `(cityId, productId)`, passes those rows into store-report composition for `marketPosition`, and appends canonical `marketReports` to `DailyReport`.

## Rival event actions

Extend the existing event framework instead of adding a rival scheduler.

### Targets

```ts
EventTarget |= { kind: 'competitor'; competitorId: string };
EventTargetSelector |= { kind: 'competitor'; status: CompetitorStatus };
```

Selection considers only competitors in opened retail cities. Closed rivals remain resolvable for historical decisions/lifecycle evidence.

### Immediate effects

Add closed effect kinds:

```ts
{ kind: 'competitor-status-set'; status: CompetitorStatus }
{ kind: 'competitor-price-posture-set'; pricePosture: CompetitorPricePosture }
{ kind: 'competitor-product-focus-set'; productFocus: ProductFamilyId[] }
```

`competitor-product-focus-set` accepts exactly 1–2 unique known families and stores them canonically.

The mutation site is the existing `applyEffect(...)` path in `eventEffects.ts`. Competitor effects must explicitly require `decision.target.kind === 'competitor'`, resolve that competitor, and reject the whole decision atomically on wrong/unknown target or invalid payload.

### Timed promotion effect

```ts
EventTimedEffect |= {
  kind: 'competitor-attraction-multiplier';
  multiplier: number;
};
```

It is legal only on a competitor target. `marketCompetition.ts` reads active modifiers with the existing active-on-day helper; do not widen `SimulationRules`.

All exhaustive timed-effect consumers must be updated, including:

- `cloneTimedEffect` and modifier snapshot/validation code;
- persistence event validation;
- `ActiveModifiers.svelte`, which must render the competitor target and localized modifier copy without falling through the existing route-only switch.

Author exactly one production `rival-promotion` weighted event in this ticket. Launch/closure/reposition effect kinds remain unit-tested extension points; do not add more production events yet.

## Persistence

Schema 19 is strict and schema 18 is unsupported.

`saveCodec.ts` validates:

- `StoreProduct.brandId` known and supported;
- unique competitor IDs;
- competitor city opened, materialized, and retail;
- competitor location belongs to that city;
- known archetype/posture/family/brand/status values;
- reputation finite 0..100;
- `productFocus` exactly 1–2 unique known families, canonically ordered;
- non-empty brand mix with product compatibility for the competitor archetype;
- competitor array canonical by ID;
- market report ranges, finite scores, known references, and canonical ordering;
- competitor event targets/effects/modifiers.

`scenarioCodec.ts` and its tests are part of the schema-19 blast radius because scenario run records embed current `GameState` and reference `SAVE_SCHEMA_VERSION`. HPA-39 adds no scenario command, but scenario encode/decode must accept the new current game shape and reject stale schema-18 records consistently.

Historical market rows may reference a competitor now `closed`; current existence is enough to retain attribution.

## UI and map

### Brand control

`StoreStockTable` keeps one row per product and adds one Brand select using `getSupportedBrands(productId)`.

The component chain gets explicit brand wiring:

```text
StoreStockTable -> StoreDetailModal -> +page.svelte -> GameRouteController.updateStoreProductBrand
```

Thread `canUpdateBrand` beside existing selling-price/inventory capabilities. In active scenarios it is disabled with the existing disabled reason. Do not reuse the selling-price scenario command and do not add a scenario brand command.

Brand evidence reuses existing `baseSellingPrice`/`effectiveSellingPrice` plus new brand cost/demand/attraction/customer-response fields. There is no duplicate brand price field.

### Reports

Add two latest-report sections:

- Brand performance: selected brand, units, revenue, gross margin, weighted customer response.
- Market: city/product player share, delta, strongest rival, rival posture/focus/brands, and active promotion multiplier.

No charting, historical filter UI, or new dashboard.

### Retail map

Extend `CityMapSnapshot` with active-city competitor render rows and draw lightweight non-interactive Phaser markers. Rivals never enter `getOccupiedStoreTileIds`, ownership outlines, placement previews, store sprite lists, or terrain/camera keys. Closed rivals render no marker.

No industry-map changes and no new art assets.

## Testing strategy

Use six implementation checkpoints in one PR:

1. type/catalog/competitor lifecycle/schema-19 cut and hidden-competition deletion;
2. brand economics while fixtures explicitly use `competitors: []`;
3. explicit market share + market-position integration;
4. rival event lifecycle plus exhaustive switch/scenario-codec coverage;
5. existing-surface UI/map integration with explicit controller brand mutation;
6. deterministic E2E and final full verification.

Important invariants:

- `sellingPrice` remains the sole shelf-price field;
- brand change writes a default price once; later price edits are direct;
- no hidden competition scalar remains;
- higher rival attraction lowers player share and store `marketPosition` directionally;
- no-rival market share is 1 for a valid player seller;
- rival generation never changes main RNG state;
- live/planner share and branded seller scoring reuse the same pure helpers;
- Task 2 brand-only numeric fixtures stay rival-free until Task 3;
- rival `productFocus` is always 1–2 unique families;
- scenario persistence moves with schema 19 even though scenario commands do not gain brand mutation;
- timed-effect exhaustive switches compile after competitor promotion is added;
- map rivals never affect placement ownership;
- no rival inventory/staffing/finance/logistics subsystem appears.

## Non-goals

- per-brand inventory/SKU rows;
- a second customer-facing price field;
- company/city brand inheritance;
- rival staffing, inventory, cash, debt, production, logistics, or full stores;
- rival land occupancy or interactive rival inspectors;
- autonomous competitor AI beyond typed event effects;
- additional production rival event families beyond one promotion lifecycle;
- historical market charts or a new dashboard;
- new competitor art assets;
- pre-release save migration/backward compatibility;
- multiplayer, acquisitions, or franchising.
