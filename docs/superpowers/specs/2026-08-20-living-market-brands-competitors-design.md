# Living Market: Product Brands and Lightweight Competitors Design

**Date:** 2026-08-20
**Linear:** HPA-39 — Living market: product brands and lightweight competitors
**Status:** Normative planning spec

## Outcome

Add a visible market around the existing retail simulation without creating a second simulation stack:

1. every existing `StoreProduct` carries one supported brand selection;
2. static brand data changes customer price, direct demand, market attraction, unit cost, and customer response through explicit calculations;
3. each opened retail city owns two deterministic lightweight competitors with persisted identity and posture but no inventory, staffing, finance, factories, or logistics;
4. city/product demand is split visibly between the player company and competitors before HPA-41's existing per-seller allocation runs;
5. the old random `Store.competition` scalar is removed so named competitors replace hidden competition penalties rather than stack on top of them;
6. competitor promotions use timed event modifiers, while typed immediate effects support launch/closure and repositioning;
7. existing store-detail, reports, retail-map, save, and event surfaces expose the feature.

This remains one HPA-39 implementation PR. Do not add multi-brand SKU inventory, a rival economy, a generic market engine, a new dashboard, multiplayer, acquisitions, or franchising.

## Why HPA-39 is next

The issue's two blockers are now complete:

- HPA-38 provides concrete product identities, richer product dynamics, FIFO lots, and product-level reporting;
- HPA-278 provides typed targets/effects/modifiers and event lifecycle reporting.

HPA-41 is also merged, so live retail demand now has the clean policy-free city pool and explicit per-seller allocation seam HPA-39 needs. The remaining HPA-276/HPA-279 backlog parents are administrative tracking closeout for already-shipped Supply Planner/logistics work, not implementation blockers.

## Existing seams

HPA-39 extends current code rather than replacing it:

- `src/lib/game/products.ts`: static `PRODUCTS` catalog and product economics;
- `src/lib/game/productDynamics.ts`: trend, obsolescence, aging, markdown, and shrink calculations;
- `src/lib/game/stock.ts`: raw city demand, seller eligibility/scoring, policy-adjusted demand, sales, and product reports;
- `src/lib/game/retailSupply.ts`: weekly retail replenishment and retail import-cost accounting;
- `src/lib/game/simulateDay.ts`: deterministic daily ordering and report composition;
- `src/lib/game/state.ts` / `world.ts`: new-game and retail-city lifecycle;
- `src/lib/game/eventTargets.ts`, `eventEffects.ts`, `eventCatalog.ts`: event extension points;
- `src/lib/game/mapRender.ts` + `src/lib/phaser/cityMapScene.ts`: snapshot-only retail map rendering;
- `StoreStockTable.svelte`, `StoreDetailModal.svelte`, `ReportsPanel.svelte`: existing player-facing homes;
- `src/lib/persistence/saveCodec.ts`: strict current-schema validation.

## Scope decisions

- **One brand per existing product row.** `Store.products` already has one inventory/configuration row per `ProductId`. A second brand dimension would require per-brand lots, reorder targets, prices, replenishment, and reporting and would turn HPA-39 into SKU simulation. The store's brand assortment/mix is the set of selected brands across its current products.
- **Defaults are inheritance.** New stores and newly unlocked products inherit `ProductDefinition.defaultBrandId`; the player may override the brand for that store/product when supported. Do not add company/city brand inheritance in this ticket.
- **Brand control is sandbox-only.** Scenarios receive deterministic default brands and competitor pressure but do not gain a new scenario command/capability in HPA-39.
- **Competitors are not `Store`.** They never enter staffing, inventory, rent, finance, supply, placement, or manager-delegation flows.
- **Competitor locations are non-blocking map presence.** They are approximate city-map locations for visibility only and never reserve tiles or affect placement validity.
- **Competitor generation uses a derived RNG.** It must not consume or reorder the main `GameState.rngState` stream.
- **Remove `Store.competition`.** Today it is a hidden random scalar that depresses seller score and market position and raises operating cost. HPA-39 replaces it with explicit market share. Do not retain a compatibility alias or shadow penalty.
- **No new management surface.** Brand controls stay in stock/detail, market evidence stays in Reports, and rivals appear on the existing retail map.
- **No new image asset is required.** Rival map presence uses simple Phaser marker graphics and existing archetype labels; do not create competitor storefront art in this ticket.
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
  availabilityMultiplier: number;  // market attraction / brand reach
  priceMultiplier: number;         // customer-facing configured price
  demandMultiplier: number;        // direct seller demand
  unitCostMultiplier: number;      // explicit margin input
}
```

Initial authored profiles:

| Brand | Positioning | Quality | Loyalty | Availability | Price | Demand | Unit cost | Support |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Common Ground | mainstream | 50 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | all current products |
| Budget Bay | value | 42 | 0.95 | 1.08 | 0.90 | 1.10 | 0.84 | bottled water, soft drinks, snacks, essentials, household, produce, pantry, prepared, bakery |
| Northstar Select | premium | 82 | 1.12 | 0.92 | 1.18 | 0.94 | 1.10 | apparel, home goods, gifts, fashion accessories, games, accessories, devices, peripherals |
| Fresh Field | premium | 74 | 1.08 | 0.98 | 1.08 | 1.06 | 1.04 | produce, pantry, prepared, bakery |

`ProductDefinition` gains required `defaultBrandId`; all current products default to `common-ground`. The other brands provide strategically distinct alternatives without requiring every category to have the same number of choices.

`brands.ts` owns:

```ts
getBrandDefinition(brandId): BrandDefinition
getSupportedBrands(productId): readonly BrandDefinition[]
isBrandSupported(productId, brandId): boolean
resolveBrandEconomics(product, brandId, configuredPrice): BrandEconomics
```

Catalog tests pin:

- every brand ID is unique and resolves;
- every supported product exists;
- every product's default brand is supported;
- every multiplier is finite and positive;
- quality is 0..100;
- at least one product has 3 supported brands;
- at least one deliberately unsupported combination exists and is rejected.

### Store assortment

`StoreProduct` gains:

```ts
brandId: BrandId;
```

`StoreProductPatch` gains optional `brandId`. `createStoreProduct` assigns the product default. `updateStoreProduct` accepts a brand change only when `isBrandSupported(productId, brandId)`; an unsupported brand returns the original game unchanged rather than silently falling back.

New stores and level-unlocked products therefore inherit defaults automatically through the existing `createStoreProduct` path.

### Explicit brand economics

`resolveBrandEconomics` returns:

```ts
interface BrandEconomics {
  customerPrice: number;
  unitCost: number;
  demandMultiplier: number;
  marketAttractionMultiplier: number;
  customerResponse: number;
}
```

with:

```text
customerPrice = configuredSellingPrice * priceMultiplier
unitCost = product.importCost * unitCostMultiplier
marketAttractionMultiplier = loyaltyMultiplier * availabilityMultiplier
customerResponse = clamp(-3, 3, round((quality - 50) / 10))
```

Margin is an outcome, not a synthetic input: the brand's margin effect is modeled as an explicit unit-cost multiplier plus its customer-price multiplier.

For a live seller after the competitor split:

```text
brandedSellerScore = existingSellerScoreWithoutHiddenCompetition
                   * brand.marketAttractionMultiplier
sellerShare = brandedSellerScore / totalPlayerSellerScore
policyDemand = sellerPolicyDemand(companyDemandPool, sellerShare, effectivePolicy)

desiredUnits = policyDemand
             * brand.demandMultiplier
             * obsolescenceMultiplier
             * priceDemandMultiplier(product, brand.customerPrice)
             * existingJitter

revenue = unitsSold * brand.customerPrice * markdownMultiplier * storeRevenueMultiplier
costOfGoods = unitsSold * brand.unitCost
```

The current sales RNG call remains exactly where it is; brand and competitor calculations add no RNG.

Weekly imported retail replenishment uses `brand.unitCost` as the baseline import cost, then composes existing event import-cost multipliers on top. Warehouse/local-material consumption is unchanged. This keeps cash import spend, `DailyProductReport.importCost`, and retail COGS aligned with the selected brand.

`DailyProductReport` carries enough evidence to explain the outcome:

```ts
brandId: BrandId;
brandCustomerPrice: number;
brandUnitCost: number;
brandDemandMultiplier: number;
brandMarketAttractionMultiplier: number;
brandCustomerResponse: number;
```

At store close, sold units weight the brand customer-response values. The resulting rounded response adjusts the ending store reputation before the normal company scorecard consumes that report. No separate customer cohort or persistent loyalty ledger is added.

## Remove the hidden competition scalar

Delete `Store.competition` from the domain and persistence shape.

The two current hidden uses become:

```text
seller score = reputation term + staffCapacity * 0.25
market position base = 35 + localDemand / 5 + reputation / 3 + marketing.market
operating cost = baseRent * 0.92 + marketing.cost
```

Explicit competitor pressure is applied only through the visible market-share split below. This is a declared balance change. Exact legacy seeded outputs do not require compatibility; deterministic behavior for the new model is the invariant.

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
  productFocus: ProductFamilyId[];
  brandIds: BrandId[];
  status: CompetitorStatus;
}
```

`GameState` gains:

```ts
competitors: MarketCompetitor[];
```

### Deterministic generation

`competitors.ts` owns an idempotent initializer and pure generator. Every opened retail city gets exactly two competitors.

Generation seed:

```text
normalizeSeed(game.seed + worldCity.seed * 37 + 39_039)
```

Use a local RNG created from that derived seed; never touch `game.rngState`.

Generation rules:

- stable IDs: `competitor-${cityId}-1` / `-2`;
- names selected from a fixed small fictional-name list;
- archetype selected from current retail archetypes;
- reputation 45..75;
- price posture selected from the existing four pricing postures;
- one or two product-family focuses selected from products supported by that archetype;
- brand mix contains `common-ground` plus at most one compatible specialist brand;
- location is selected from deterministic buildable city tiles, preferring an unowned tile at generation time;
- all generated competitors start `active`;
- output is canonical by competitor ID.

`createNewGame` initializes Harbor City competitors after the founding store exists. `openWorldCity` initializes competitors immediately after a new retail city map is materialized. Financing city opening already flows through `openWorldCity`, so it gets the same lifecycle.

Competitors never occupy land. A later player store may use the same tile; this affects only marker overlap, not simulation or placement legality.

## Explicit market-share calculation

Create `marketCompetition.ts`. It is a pure read model and does not simulate rival sales.

### Player attraction

`stock.ts` keeps seller eligibility and the base seller score. After removing `Store.competition`, multiply each eligible seller's score by its selected brand's `marketAttractionMultiplier`.

```text
playerAttraction = sum(brandedSellerScore)
```

### Competitor attraction

A competitor is eligible for a product only when:

- it is `active`;
- it belongs to the current city;
- its archetype supports the product;
- at least one brand in its brand mix supports the product.

For each eligible competitor:

```text
base = 25 + reputation * 0.5
focus = 1.20 when product.familyId is focused, otherwise 0.85
postureBase = discount 1.12 | competitive 1.06 | standard 1.00 | premium 0.90
price = clamp(0.5, 1.5, 1 + (postureBase - 1) * product.priceSensitivity)
brand = average(loyaltyMultiplier * availabilityMultiplier) of compatible brands
promotion = product of active competitor-attraction event modifiers, default 1

competitorAttraction = base * focus * price * brand * promotion
```

No rival inventory, capacity, staffing, price-per-product, or RNG is modeled.

### Demand split

```text
denominator = playerAttraction + sum(competitorAttraction)
playerMarketShare = denominator > 0 ? playerAttraction / denominator : 0
competitorShare_i = competitorAttraction_i / denominator
companyDemandPool = cityProductDemandPool * playerMarketShare
```

For live sales, `cityProductDemandPool` is the existing trend-adjusted pool. The company pool then enters the existing HPA-41 per-seller policy allocation and brand demand/price dynamics. Do not reintroduce the removed shared `remainingDemand` allocation cap; `remainingDemand` remains diagnostic only if retained.

For Supply Planner, use the same current market-share calculation against the existing trend-free raw city pool, then the same seller/policy/brand-demand terms. Planner still excludes future trends, jitter, obsolescence, and future rival actions; an already-active rival promotion is current state and therefore does affect the snapshot.

### Daily market evidence

Add one report per city/product where the player has an eligible seller:

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

`simulateProductSalesForCity` returns market reports alongside store/product reports. `simulateDay` compares each result with the previous completed day's matching city/product report to populate `playerShareDelta` and appends `marketReports` to `DailyReport`.

The report stores the primary factors needed by the UI; it does not persist preformatted explanation strings.

## Rival event actions

Extend the existing event framework instead of adding a rival scheduler.

### Targets

```ts
EventTarget |= { kind: 'competitor'; competitorId: string };
EventTargetSelector |= { kind: 'competitor'; status: CompetitorStatus };
```

Selection considers only competitors in opened retail cities. A closed competitor remains resolvable for history and can be targeted by a selector asking for `closed`.

### Immediate effects

Add closed effect kinds:

```ts
{ kind: 'competitor-status-set'; status: CompetitorStatus }
{ kind: 'competitor-price-posture-set'; pricePosture: CompetitorPricePosture }
{ kind: 'competitor-product-focus-set'; productFocus: ProductFamilyId[] }
```

These cover launches/re-openings, closures, and repositioning without a generic patch payload. They validate target kind and authored values before mutation.

### Timed promotion effect

```ts
EventTimedEffect |= {
  kind: 'competitor-attraction-multiplier';
  multiplier: number;
};
```

It is legal only on a competitor target. `marketCompetition.ts` reads active modifiers directly from `game.events.activeModifiers`; do not add competitor pressure to `SimulationRules`, which remains the import/route rule bridge.

Author one production `rival-promotion` weighted event against an active competitor. Every response option carries the same three-day competitor attraction modifier (the rival action happened); player options differ only in the player's response/cost. Existing modifier lifecycle reporting shows activation/expiry, while the market report shows the multiplier's actual share effect.

Do not author separate production events for every launch/closure/repositioning permutation in this ticket. Unit tests exercise those typed effects through the normal event resolution path so future catalog entries can use them safely.

## UI and map presentation

### Store detail

`StoreStockTable` adds a Brand column with a select containing only `getSupportedBrands(productId)`. It uses the existing product-update callback with `StoreProductPatch.brandId`.

In sandbox, changing brand autosaves through the existing route transition. During an active scenario the select is disabled with the existing scenario-disabled explanation; no new scenario command is added.

The existing Latest column shows selected brand, effective customer price, per-unit cost, and gross margin evidence after a report exists. Do not add a new modal tab.

### Reports

`ReportsPanel` adds two derived sections:

- **Brand performance:** group latest `DailyProductReport`s by brand and show units, revenue, gross margin, and weighted customer response;
- **Market:** show each reported city/product's player share, day-over-day delta, strongest rival, and the rival's reputation / price posture / focus / compatible-brand / active-promotion factors.

Use the existing `game` prop to resolve rival/brand names. Keep the report domain typed and localization in UI/game-copy helpers.

### Retail city map

`CityMapSnapshot` gains lightweight competitor render records (`id`, `name`, `archetypeId`, `x`, `y`, `status`). `cityMapScene.ts` draws active rivals as a small, visually distinct non-interactive marker using Phaser graphics. Closed rivals are omitted.

Rival markers:

- do not own tiles;
- do not participate in placement preview;
- do not alter camera or terrain keys;
- do not require image assets;
- expose `data-competitor-marker-count` on the canvas beside the existing renderer test attributes.

No industry-map change is required because competitors exist only in retail cities.

## Persistence

Bump `SAVE_SCHEMA_VERSION` to 19 and reject 18.

Save validation covers:

- known `brandId` on every `StoreProduct`;
- product-brand compatibility;
- unique competitor IDs;
- competitor city is an opened/materialized retail city;
- location coordinates/neighborhood are valid for that city;
- known archetype, pricing posture, product-family IDs, brand IDs, and status;
- reputation is finite and 0..100;
- non-empty compatible brand mix;
- event targets/modifiers/effects accept the new competitor variants;
- reports validate brand and market evidence.

Do not persist derived brand economics, market attraction, or market-share state outside completed reports. They are recomputed from current state.

## Determinism and ordering

- Brand calculation consumes no RNG.
- Rival generation uses only the derived city seed and does not touch `rngState`.
- Market scoring consumes no RNG and sorts competitors by ID before scoring/reporting.
- Existing seller canonical ordering remains authoritative for the single live jitter draw per seller.
- Removing the old `competition` initialization draw intentionally changes exact legacy seed fixtures; do not add a ghost RNG draw for compatibility.
- Save decode normalizes competitor order by ID and brand/product-family arrays by code-unit order where order is not semantic.

## Testing contract

### Unit

Pin:

- brand catalog closure and unsupported combinations;
- default/inherited brand creation and valid/invalid brand mutation;
- price/demand/unit-cost/customer-response calculations;
- branded replenishment cost composed with event import-cost multiplier;
- hidden `Store.competition` field removed from state and save contract;
- derived competitor generation repeats exactly for the same game/city seed and does not change `rngState`;
- city opening initializes rivals exactly once;
- competitor scores and normalized market shares;
- no competitor -> player share 1;
- closed/incompatible competitor -> excluded;
- brand/posture/focus/reputation changes move share in the expected direction;
- live sales use `trend pool * player share` before HPA-41 seller allocation;
- Supply Planner uses trend-free current market share;
- event launch/close/reposition immediate effects;
- rival promotion activation, replacement/expiry, and market-share recovery;
- schema 19 round trip and schema 18 rejection.

### Component

Pin:

- brand select shows only supported brands and emits the patch;
- unsupported brands never appear;
- scenario-disabled brand control is inert;
- Reports brand/market evidence renders localized values;
- retail map snapshot/scene renders the expected active competitor count and no closed marker.

### Targeted E2E

Reuse the existing `retail-sim.e2e.ts` save-injection and deterministic event-selection helpers; never advance-until-trigger.

One bounded flow proves:

1. starter city renders competitor markers;
2. changing a supported brand survives autosave/reload and appears in the next report;
3. Reports shows current market-share factors;
4. an injected deterministic `rival-promotion` decision activates the modifier, changes the reported share, and returns after the fixed three-day expiry.

## Declared balance changes

HPA-39 intentionally changes balance in three places:

1. the old hidden `Store.competition` seller/market-position/operating-cost penalties disappear;
2. explicit rivals take a visible share of city/product demand;
3. brand price and unit cost alter revenue, import spend, COGS, and margin.

Tests should pin the new invariants rather than preserve old numeric seed outputs.

## Non-goals

- multiple brands simultaneously inside one store/product inventory row;
- competitor stock, capacity, staffing, cash, loans, warehouses, factories, routes, or managers;
- competitor land ownership or placement blocking;
- competitor-specific product prices or daily transaction history;
- company/city brand hierarchy;
- scenario commands for brand selection;
- generic market/brand DSLs or plugin registries;
- AI-controlled rivals;
- new competitor art assets;
- multiplayer, acquisition, or franchising.
