# Living Market: Product Brands and Lightweight Competitors Design

**Date:** 2026-08-20
**Linear:** HPA-39 — Living market: product brands and lightweight competitors
**Status:** Normative planning spec; revised after codebase review

## Outcome

Add a visible market around the existing retail simulation without creating a second simulation stack:

1. each existing `StoreProduct` carries one supported brand;
2. brand data changes attraction, demand, unit cost, and customer response while `StoreProduct.sellingPrice` remains the only shelf price;
3. sandbox retail cities own two deterministic lightweight competitors that are not `Store` objects;
4. explicit player-versus-rival market share reduces the city/product pool before HPA-41 seller allocation;
5. named rivals replace the hidden `Store.competition` penalty in the same market-integration checkpoint;
6. `DailyStoreReport.marketPosition` follows visible player share;
7. rival promotion uses the existing timed-modifier lifecycle and closed event unions;
8. existing Store Detail, Reports, retail map, persistence, Supply Planner, and event surfaces expose the feature.

This stays one HPA-39 implementation PR. Do not add multi-brand SKU inventory, a rival economy, rival land ownership, a generic market engine, a second shelf-price lens, a new dashboard, new rival art, multiplayer, acquisitions, or franchising.

## Review resolution

### Already resolved before this review

Two findings in the latest review describe an older revision and require no further design change:

- there is **no** live `customerPrice`; brand `priceMultiplier` only writes a default into `StoreProduct.sellingPrice` on product creation or brand change;
- `marketPosition` already has an explicit bounded player-share adjustment.

### Accepted

- **Scenario scope must be explicit.** Existing authored scenarios stay rival-free to preserve their curated challenge scope. They still receive default brands. Scenario setup preserves `brandId` when applying product overrides and explicitly normalizes `competitors: []` once competitor state exists. After hidden competition is removed, the three authored scenario reference/objective suites are rerun and catalog thresholds change only if a failing reference trace proves a balance adjustment is needed.
- **Brand response converges instead of ratcheting.** Brand quality pulls reputation toward a weighted quality target rather than adding a fixed positive/negative constant every day.
- **Brand support is family-based.** `BrandDefinition.supportedFamilyIds` reuses `ProductFamilyId`; product additions inherit support automatically.
- **Market resolver takes state slices.** `resolveProductMarketShare` takes city competitors, active modifiers, a `ProductDefinition`, player attraction, and day. It never takes `GameState` and never imports `stock.ts`.
- **Report payload is thinner.** `DailyProductReport` adds only `brandId`; existing price, import-cost, revenue, COGS, and margin fields already carry the day-specific economics. Rival report rows keep only day-specific market evidence.
- **Hidden competition deletion moves beside its replacement.** `Store.competition` remains through the brand-only checkpoint and is removed in the market-share checkpoint, so RNG/fixture churn happens once.
- **Compiler drives fixture discovery.** `bun run check` is the authoritative required-field audit. A narrow `stock.testUtils.ts` helper may centralize repeated `StoreProduct` fixtures; do not introduce a generic `makeGameState` factory that masks future required-field failures.
- **Drop dominated event choice.** `rival-promotion` has two meaningful player responses; there is no zero-benefit `hold-course` option.

### Not adopted

- **Split HPA-39 into two PRs.** Project workflow is one PR per ticket unless explicitly approved otherwise. Brands also feed rival compatibility and player attraction directly, so a split would add a temporary schema/integration boundary without reducing implementation work. The six checkpoints below remain review gates inside one PR.
- **Put `canUpdateBrand` in scenario capabilities.** Brand mutation deliberately has no `ScenarioCommand`; its capability belongs in route `MutationAvailability` as a sandbox-only boolean, beside scoped policy/delegation controls. `src/lib/scenarios/capabilities.ts` therefore does not gain a fake command capability.
- **Add authored scenario brand fields.** Scenario product overrides should spread the materialized `StoreProduct` and replace stock/targets/price, preserving its default `brandId`. `ScenarioStartBlueprint` and catalog rows do not need another brand dimension.

## Existing seams

HPA-39 extends current contracts:

- `src/lib/game/products.ts`: product catalog and `ProductFamilyId` ownership;
- `src/lib/game/stock.ts`: seller eligibility/scoring, policy demand, live sales, price sensitivity, product reports;
- `src/lib/game/retailSupply.ts`: weekly replenishment and retail import accounting;
- `src/lib/game/simulateDay.ts`: store operation profile, report composition, scorecard;
- `src/lib/game/state.ts` / `world.ts`: sandbox new-game and retail-city lifecycle;
- `src/lib/game/logisticsRouteModifiers.ts`: precedent for “base state + active modifiers + day -> derived values”;
- `src/lib/game/eventTargets.ts`, `eventEffects.ts`, `eventModifiers.ts`, `eventCatalog.ts`: typed event extension points;
- `src/routes/gameRouteController.ts`: mutation/autosave boundary and `MutationAvailability`;
- `src/lib/scenarios/setup.ts`: scenario materialization/override normalization;
- `src/lib/scenarios/catalog.ts`: three authored challenge balances to re-verify after the competition cut;
- `src/lib/components/game/ActiveModifiers.svelte`: exhaustive timed-effect presentation;
- `src/lib/game/mapRender.ts` + `src/lib/phaser/cityMapScene.ts`: snapshot-driven retail map rendering;
- `StoreStockTable.svelte`, `StoreDetailModal.svelte`, `ReportsPanel.svelte`: existing player-facing homes;
- `src/lib/persistence/saveCodec.ts`: strict current-game validation;
- `src/lib/persistence/scenarioCodec.ts`: already imports `SAVE_SCHEMA_VERSION` and delegates embedded game validation to `validateCurrentGameState`.

## Scope decisions

- One brand per existing product row. The store’s brand mix is the set of selected brands across its products.
- Default brand is product-level only; no company/city brand inheritance.
- `sellingPrice` remains the only player/manager/scenario shelf-price contract.
- Brand editing is sandbox-only and has no `ScenarioCommand`.
- Existing authored scenarios remain rival-free; they are not a second market-balance surface in HPA-39.
- Competitors are never `Store`, never occupy tiles, and never enter staffing, finance, inventory, production, logistics, managers, or placement legality.
- Sandbox competitor generation consumes a derived local RNG only; `GameState.rngState` is untouched.
- No compatibility alias or ghost RNG draw is kept when `Store.competition` is removed.
- Pre-release persistence remains strict: schema 19 rejects schema 18; no migration.

## Brand domain

### Identity and family compatibility

```ts
export type BrandId =
  | 'common-ground'
  | 'budget-bay'
  | 'northstar-select'
  | 'fresh-field';

export interface BrandDefinition {
  id: BrandId;
  name: string;
  positioning: 'value' | 'mainstream' | 'premium';
  supportedFamilyIds: readonly ProductFamilyId[];
  quality: number;                 // 0..100
  loyaltyMultiplier: number;       // player/rival attraction
  availabilityMultiplier: number;  // player/rival attraction
  priceMultiplier: number;         // default write-through only
  demandMultiplier: number;        // live/planner seller demand
  unitCostMultiplier: number;      // retail COGS/import cost
}
```

Authored profiles:

| Brand | Positioning | Quality | Loyalty | Availability | Default price | Demand | Unit cost | Supported families |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Common Ground | mainstream | 50 | 1.00 | 1.00 | 1.00 | 1.00 | 1.00 | all five current families |
| Budget Bay | value | 42 | 0.95 | 1.08 | 0.90 | 1.10 | 0.84 | beverages, convenience-goods, grocery-food |
| Northstar Select | premium | 82 | 1.12 | 0.92 | 1.18 | 0.94 | 1.10 | fashion, electronics |
| Fresh Field | premium | 74 | 1.08 | 0.98 | 1.08 | 1.06 | 1.04 | grocery-food |

`ProductDefinition` gains required `defaultBrandId`; all current products default to `common-ground`.

`brands.ts` owns:

```ts
getBrandDefinition(brandId): BrandDefinition
getSupportedBrands(productId): readonly BrandDefinition[]
isBrandSupported(productId, brandId): boolean
getBrandDefaultSellingPrice(product, brandId): number
resolveBrandEconomics(product, brandId): BrandEconomics
```

`isBrandSupported` resolves the product’s `familyId` and checks `supportedFamilyIds`; there are no hand-maintained product lists in the brand catalog.

```ts
export interface BrandEconomics {
  unitCost: number;
  demandMultiplier: number;
  marketAttractionMultiplier: number;
}
```

```text
brandDefaultSellingPrice = max(1, round(product.defaultSellingPrice * brand.priceMultiplier))
unitCost = product.importCost * brand.unitCostMultiplier
marketAttractionMultiplier = brand.loyaltyMultiplier * brand.availabilityMultiplier
```

### Store assortment and price write-through

`StoreProduct` gains required `brandId`.

`createStoreProduct` uses:

```text
brandId = product.defaultBrandId
sellingPrice = getBrandDefaultSellingPrice(product, product.defaultBrandId)
```

`updateStoreProduct`:

1. rejects an unsupported brand without changing the game;
2. changes `brandId` when supported;
3. if that patch did not also provide `sellingPrice`, writes the new brand default selling price once;
4. all later player/manager/scenario price edits mutate `sellingPrice` directly and are never multiplied again.

Scenario product overrides spread the existing materialized product before replacing lots, targets, and selling price, so default `brandId` survives without adding scenario-authored brand fields.

## Brand economics in live retail

### Shared player seller score

Task 2 exports:

```ts
export function brandedSellerScore(store: Store, productId: ProductId): number;
```

During the brand-only checkpoint it is the current seller score (including the legacy hidden competition term) multiplied by brand attraction. In Task 3 the legacy competition term is removed from the same helper when explicit rival share lands.

Live sales and planner demand call `brandedSellerScore`. `marketCompetition.ts` does **not** import it; callers sum it into a number and pass that number to the market resolver, preserving one-directional dependencies.

### Sales and replenishment

Final live formula:

```text
sellerShare = brandedSellerScore / totalPlayerAttraction
policyDemand = sellerPolicyDemand(companyDemandPool, sellerShare, effectivePolicy)

desiredUnits = policyDemand
             * brand.demandMultiplier
             * obsolescenceMultiplier
             * priceDemandMultiplier(productDefinition, storeProduct.sellingPrice)
             * existingJitter

effectiveSellingPrice = storeProduct.sellingPrice * markdownMultiplier
revenue = unitsSold * effectiveSellingPrice * storeRevenueMultiplier
costOfGoods = unitsSold * brand.unitCost
```

Weekly imported replenishment uses `brand.unitCost` as the baseline before existing event import-cost multipliers. Local warehouse value semantics stay unchanged.

`DailyProductReport` adds only:

```ts
brandId: BrandId;
```

Existing `baseSellingPrice`, `effectiveSellingPrice`, `importCost`, `revenue`, `costOfGoods`, and `grossMargin` already persist the day-specific economic outcomes.

### Reputation convergence

Do not store a constant per-brand daily reputation delta. At store close:

```text
totalSold = sum(productReport.unitsSold)
weightedBrandQuality = totalSold > 0
  ? sum(productReport.unitsSold * brand(productReport.brandId).quality) / totalSold
  : null
brandReputationAdjustment = weightedBrandQuality === null
  ? 0
  : clamp(-3, 3, round((weightedBrandQuality - profile.reputation) / 10))
endingReputation = clampScore(profile.reputation + brandReputationAdjustment)
```

This pulls reputation toward what customers actually bought instead of ratcheting premium brands to 100. `DailyStoreReport` adds `brandReputationAdjustment` as the single day-specific customer-response evidence field.

## Lightweight competitors

```ts
export interface MarketCompetitor {
  id: string;
  name: string;
  cityId: WorldCityId;
  location: StoreLocation;
  archetypeId: ArchetypeId;
  reputation: number;
  pricePosture: CompanyPolicy['pricing'];
  productFocus: ProductFamilyId[]; // exactly 1-2 unique values
  brandIds: BrandId[];
  status: 'active' | 'closed';
}
```

Sandbox generation is deterministic and idempotent:

```text
seed = normalizeSeed(game.seed + worldCity.seed * 37 + 39_039)
```

Rules:

- exactly two rivals per opened/materialized sandbox retail city;
- stable IDs `competitor-${cityId}-1` and `-2`;
- fixed fictional name pool;
- existing retail archetypes and pricing postures;
- reputation 45..75;
- exactly 1–2 unique compatible family focuses;
- `common-ground` plus at most one compatible specialist brand;
- deterministic buildable-tile marker location, preferring currently unowned tiles;
- active by default; canonical ID order.

`createNewGame` initializes Harbor rivals after the founding store exists. `openWorldCity` initializes rivals after a sandbox retail map is materialized. `ensureCompetitorsForRetailCity` is a no-op for industry, unopened, or non-materialized cities.

Scenario setup explicitly normalizes `competitors: []`; scenarios do not call the sandbox competitor initializer.

## Explicit market share

### Resolver boundary

```ts
export function resolveProductMarketShare(
  cityCompetitors: readonly MarketCompetitor[],
  modifiers: readonly ActiveEventModifier[],
  product: ProductDefinition,
  playerAttractionScore: number,
  day: number
): MarketShareResolution;
```

`stock.ts` and Supply Planner:

1. filter the current city’s competitors;
2. sum player attraction with `brandedSellerScore`;
3. pass only those state slices to `marketCompetition.ts`.

This mirrors `resolveEffectiveRecurringRoute(route, modifiers, day)` and avoids full-`GameState` test fixtures or a `stock.ts` import cycle.

### Rival attraction

A rival contributes only when active, its archetype supports the product, and at least one rival brand supports the product family.

```text
base = 25 + reputation * 0.5
focus = product.familyId in productFocus ? 1.20 : 0.85
postureBase = discount 1.12 | competitive 1.06 | standard 1.00 | premium 0.90
price = clamp(0.5, 1.5, 1 + (postureBase - 1) * product.priceSensitivity)
brand = average(loyaltyMultiplier * availabilityMultiplier) of compatible rival brands
event = product of active competitor-attraction modifiers for this rival, default 1
attraction = base * focus * price * brand * event
```

```text
playerShare = playerAttraction / (playerAttraction + rivalAttractionTotal)
companyDemandPool = cityProductDemandPool * playerShare
```

The company pool is calculated before HPA-41 seller allocation. The removed residual-demand cap stays removed.

Supply Planner uses the same current share against its existing trend-free pool and excludes future events, jitter, obsolescence, and markdown.

### Replace hidden competition in the same checkpoint

When explicit share lands, delete `Store.competition` from type, initialization, persistence, fixtures, seller score, `marketPosition`, and operating-cost formulas. Do not retain a dummy RNG draw.

Final base formulas:

```text
base seller score = reputation term + staffCapacity * 0.25
base market position = 35 + localDemand / 5 + reputation / 3 + marketing.market
operating cost = baseRent * 0.92 + marketing.cost
```

Then derive final store market position from current market rows:

```text
meanPlayerShare = mean(playerShare for this store's eligible product rows)
shareAdjustment = meanPlayerShare exists
  ? round((meanPlayerShare - 0.50) * 20)
  : 0
marketPosition = clampScore(baseMarketPosition + clamp(-10, 10, shareAdjustment))
```

## Thin daily market evidence

```ts
export interface DailyMarketCompetitorReport {
  competitorId: string;
  share: number;
  attractionScore: number;
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

Do not repeat rival reputation, posture, focus, or brand IDs into every daily/product report row. Latest-report UI may resolve the current rival profile from `game.competitors`; the persisted day-specific facts remain share, attraction score, and event multiplier. Historical charts are a non-goal.

`simulateDay` fills `playerShareDelta` from the latest completed report by `(cityId, productId)` and passes current market rows into store-report composition for `marketPosition`.

## Scenario policy

Existing authored scenarios are curated challenge content, not sandbox market simulations.

- Product rows inherit neutral default brands through normal product creation.
- `applyAuthoredOverrides` preserves the materialized `brandId`; `ScenarioStartBlueprint` and `catalog.ts` do not gain brand fields.
- Scenario setup explicitly sets `competitors: []` after materializing the starting world. No rival event can select a target in those runs.
- `GameRouteController.MutationAvailability.updateStoreProductBrand` is `true` only in sandbox; `src/lib/scenarios/capabilities.ts` is unchanged because no brand `ScenarioCommand` exists.
- `scenarioCodec.ts` production code is expected to require no change: it already imports `SAVE_SCHEMA_VERSION` and delegates embedded game validation to `validateCurrentGameState`. Tests/fixtures still move with schema 19.
- After Task 3 removes hidden competition, rerun `catalog.spec.ts`, `setup.spec.ts`, `runtime.spec.ts`, and `validation.spec.ts` for all three authored scenarios. Adjust catalog thresholds only when an existing approved reference trace actually fails or becomes nonsensical; do not add rivals merely to recover old numbers.

## Rival event actions

Extend existing closed unions:

```ts
EventTarget |= { kind: 'competitor'; competitorId: string };
EventTargetSelector |= { kind: 'competitor'; status: 'active' | 'closed' };

EventImmediateEffect |=
  | { kind: 'competitor-status-set'; status: 'active' | 'closed' }
  | { kind: 'competitor-price-posture-set'; pricePosture: CompanyPolicy['pricing'] }
  | { kind: 'competitor-product-focus-set'; productFocus: ProductFamilyId[] };

EventTimedEffect |= {
  kind: 'competitor-attraction-multiplier';
  multiplier: number;
};
```

Immediate competitor effects require `decision.target.kind === 'competitor'` at the real `applyEffect` mutation site. Focus replacement accepts exactly 1–2 unique known families.

Timed rival promotion is read directly from active event modifiers with `isModifierActiveOnDay`; `SimulationRules` does not gain competitor state. Update every exhaustive timed-effect consumer, including `cloneTimedEffect`, validation/persistence, and `ActiveModifiers.svelte`.

Author one production `rival-promotion` event with exactly two responses:

- `counter-promote`: cash -$1,200, company `marketPosition` +2;
- `differentiate`: customer satisfaction +2.

Both carry the same 3-day `competitor-attraction-multiplier: 1.18` because the rival promotion has already happened. Launch/closure/reposition effects remain unit-tested extension points, not additional production events.

## Persistence

Final schema 19 validates:

- known/supported `StoreProduct.brandId` via family compatibility;
- unique canonical competitor IDs;
- competitor city opened/materialized/retail for persisted sandbox games that contain competitors;
- valid rival location, archetype, posture, status, reputation, brands;
- exactly 1–2 unique known product-focus families;
- thin market report ranges, finite scores, known competitor references, canonical ordering;
- competitor event targets/effects/modifiers;
- removal of legacy `Store.competition` in the final shape.

Schema 18 is rejected; there is no migration.

## UI and map

### Brand control

`StoreStockTable` adds one brand select per existing product row. Options come from `getSupportedBrands(productId)`.

Explicit mutation chain:

```text
StoreStockTable
  -> StoreDetailModal onUpdateBrand
  -> +page.svelte
  -> GameRouteController.updateStoreProductBrand
```

`MutationAvailability` gains sandbox-only `updateStoreProductBrand`. Active scenarios disable the control with the existing reason.

### Reports

Latest report adds:

- Brand performance grouped by `brandId`, using existing units/revenue/gross-margin fields and store-level `brandReputationAdjustment`;
- Market rows with player share/delta and strongest rival share/attraction/event multiplier; current rival profile may be shown from `game.competitors` as current context, not duplicated report state.

No historical charts, filters, or new dashboard.

### Retail map

`CityMapSnapshot` carries active-city competitor render rows. Phaser draws non-interactive markers and exposes `data-competitor-marker-count` using the existing dataset convention.

Rivals never enter ownership, `getOccupiedStoreTileIds`, placement previews, store sprites, or terrain/camera keys. Closed rivals render no marker. No industry-map or art changes.

## Testing strategy

Six checkpoints remain inside one PR:

1. brand identity/family compatibility + schema 19 + scenario brand preservation;
2. brand economics/reputation convergence + shared branded seller scoring while legacy competition is still present;
3. competitor state/generation + explicit market share + hidden-competition removal + marketPosition + scenario re-verification;
4. rival event lifecycle + exhaustive effect consumers;
5. explicit sandbox brand mutation + Store Detail/Reports/retail-map presentation;
6. deterministic E2E + final full verification.

Important invariants:

- one shelf price;
- family-based brand support;
- brand reputation converges toward weighted purchased quality;
- market resolver takes slices, not `GameState`;
- `marketCompetition.ts` never imports `stock.ts`;
- no hidden competition remains after Task 3;
- higher rival attraction lowers player share and market position;
- no-rival player share is 1;
- sandbox rival generation never changes main RNG state;
- authored scenarios are rival-free and remain valid after the balance cut;
- daily reports persist IDs/outcomes, not repeated catalog/state fields;
- map rivals never affect placement;
- no rival simulation subsystem appears.

## Non-goals

- per-brand inventory/SKUs;
- second customer-facing price;
- company/city brand inheritance;
- scenario-authored brands or rivals;
- rival staffing, inventory, finance, production, logistics, managers, or land;
- rival interactive inspector;
- generic market/event DSL;
- historical market charts;
- new rival art;
- pre-release migration/backward compatibility;
- multiplayer, acquisitions, franchising.
