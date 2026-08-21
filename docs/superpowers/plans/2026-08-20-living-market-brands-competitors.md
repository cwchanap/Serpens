# Living Market Brands and Lightweight Competitors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Implement each behavior change test-first. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement HPA-39 in one PR: one supported brand selection per existing store product, deterministic lightweight competitors for each opened retail city, an explicit player-versus-rival market-share split, typed rival event actions, transparent reports, existing-surface UI, and schema-19 persistence.

**Architecture:** Keep the existing retail simulation authoritative. `brands.ts` owns static brand compatibility and non-price live economics; `competitors.ts` owns deterministic persisted rival identity/lifecycle; `marketCompetition.ts` is a pure read model that converts the shared branded player seller score plus rival attraction into visible market shares. `StoreProduct.sellingPrice` remains the one shelf-price contract. `stock.ts` continues to own live seller allocation, with the market split applied before HPA-41 per-seller policy demand. Rival state never enters inventory, staffing, finance, factories, logistics, placement ownership, or manager delegation.

**Tech Stack:** TypeScript 6, SvelteKit/Svelte 5, Phaser 4, Vitest 4, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-08-20-living-market-brands-competitors-design.md`

## Global Constraints

- One implementation PR for HPA-39; the six tasks below are commit/review checkpoints, not separate PRs.
- Keep one brand per existing `StoreProduct`. Do not add per-brand lots, prices, reorder rows, or SKU-level inventory.
- `ProductDefinition.defaultBrandId` is the only brand inheritance rule. New stores and level-unlocked products inherit it through `createStoreProduct`.
- `StoreProduct.sellingPrice` remains the sole customer-facing shelf price. Brand `priceMultiplier` only writes a default on product creation/brand change; never multiply it again during live sales.
- Brand editing is sandbox-only. Add `GameRouteController.updateStoreProductBrand(...)` with no `ScenarioCommand`; do not reuse the selling-price command.
- Delete `Store.competition` and its random initialization. Do not preserve the old penalty, compatibility alias, or ghost RNG draw.
- Competitors are `MarketCompetitor`, never `Store`; exactly two are generated for each opened retail city.
- `ensureCompetitorsForRetailCity` is a no-op for industry, unopened, or non-materialized cities.
- Competitor generation uses a local RNG derived from game seed + world-city seed and never changes `GameState.rngState`.
- Competitor `productFocus` is exactly 1–2 unique known `ProductFamilyId` values.
- Competitor map locations are presentation coordinates only. They never reserve tiles or participate in placement validity.
- Apply explicit market share before HPA-41's existing player seller split. Do not reintroduce the shared residual-demand allocation cap removed by HPA-41.
- Export and reuse one `brandedSellerScore(store, productId)` from `stock.ts` in live sales, planner demand, and `marketCompetition.ts`.
- Supply Planner uses the same current market-share and brand terms against its existing trend-free demand model. It still excludes future trend/jitter/obsolescence/future rival actions.
- Keep the existing single live jitter draw per eligible player seller in its current canonical order.
- Rival timed promotion is read directly from active event modifiers by `marketCompetition.ts`; do not widen `SimulationRules` with competitor state.
- Update every exhaustive timed-effect consumer, including `ActiveModifiers.svelte` and `cloneTimedEffect`.
- Rival immediate effects mutate only through existing `eventEffects.ts::applyEffect` and must explicitly validate `decision.target.kind === 'competitor'`.
- No new dashboard, modal, management panel, rival storefront art, or industry-map work.
- Schema 19 is current and rejects schema 18. Update both save and scenario persistence paths; pre-release saves have no migration/alias path.
- Persist authored/stateful identity only; brand economics and current market shares stay derived except completed report evidence.
- Treat removal of hidden competition penalties and introduction of explicit rival/brand economics as declared balance changes. Pin new invariants rather than old seed totals.
- Task 2 brand-only numeric sales fixtures use `competitors: []` so Task 3 wraps them rather than rewriting their expected units.
- Run a full unit gate after the market allocation checkpoint and after rival event integration, plus final full verification.
- Before any Svelte edit, follow `AGENTS.md`: use Svelte MCP `list-sections`, fetch all relevant documentation, and run the Svelte autofixer until clean.

## Risks

1. **Double price:** multiplying a brand price in the live loop would make manager/scenario `sellingPrice` writes lie. Brand price is write-through only.
2. **Double competition:** named rivals must replace, not stack with, the old `Store.competition` seller/market/operating-cost penalties.
3. **RNG drift:** competitor generation must not consume the main simulation stream; removing the legacy competition draw intentionally changes old exact seeds.
4. **Accounting drift:** selected brand unit cost must reconcile COGS, weekly retail import spend, report `importCost`, and event import-cost multipliers.
5. **Demand ordering:** rival share is applied to the city/product pool before seller policy/brand/price dynamics; applying it per store would distort market share.
6. **Planner/live divergence:** planner remains trend-free and jitter-free but must reuse current rival share, brand attraction, seller eligibility, and policy terms.
7. **Market-position drift:** removing `Store.competition` without feeding visible share into `DailyStoreReport.marketPosition` would make reports disagree.
8. **Closed rival history:** a closed competitor remains resolvable for event/history validation even though it contributes no demand pressure and has no map marker.
9. **Exhaustive effect switches:** adding `competitor-attraction-multiplier` can break `ActiveModifiers.svelte`, modifier cloning, and validators if any switch is missed.
10. **Scenario persistence:** scenario run records embed current `GameState` and `SAVE_SCHEMA_VERSION`; schema 19 must flow through `scenarioCodec.ts` even though brand editing is not a scenario command.
11. **Map scope:** competitor markers are non-interactive presentation state. Accidentally putting them into occupied-tile calculations would change placement semantics.
12. **Fixture blast radius:** `StoreProduct.brandId`, `GameState.competitors`, schema 19, and removal of `Store.competition` affect many complete fixtures. Audit constructors immediately.
13. **E2E flakiness:** use save injection and deterministic event-seed selection already present in `retail-sim.e2e.ts`; never advance until an event happens.

---

### Task 1: Add brand/competitor identity, remove hidden competition, and move all current-game persistence to schema 19

**Files:**
- Create: `src/lib/game/brands.ts`
- Create: `src/lib/game/brands.spec.ts`
- Create: `src/lib/game/competitors.ts`
- Create: `src/lib/game/competitors.spec.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/products.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/world.ts`
- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify: `src/lib/persistence/scenarioCodec.ts`
- Modify: `src/lib/persistence/scenarioCodec.spec.ts`
- Modify: scenario repository fixtures that explicitly carry `SAVE_SCHEMA_VERSION`
- Modify: complete `GameState`, `Store`, and `StoreProduct` fixtures/factories found by the constructor audit

**Interfaces:**

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
  supportedProductIds: readonly ProductId[];
  quality: number;
  loyaltyMultiplier: number;
  availabilityMultiplier: number;
  priceMultiplier: number;      // default write-through only
  demandMultiplier: number;
  unitCostMultiplier: number;
}

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

`ProductDefinition` gains required `defaultBrandId: BrandId`.

`StoreProduct` gains required `brandId: BrandId`.

`StoreProductPatch` gains internal optional `brandId?: BrandId`.

`GameState` gains required `competitors: MarketCompetitor[]`.

- [ ] **Step 1: Write RED brand-catalog tests**

Pin the four authored profiles and assert:

```text
all BrandIds are unique and resolvable
every supported ProductId exists
every ProductDefinition.defaultBrandId is supported
all multipliers finite and > 0
quality is 0..100
at least one product exposes 3 compatible brands
at least one known unsupported pair is rejected
```

Run:

```bash
bun run test:unit -- --run src/lib/game/brands.spec.ts
```

Expected: FAIL because brand contracts do not exist.

- [ ] **Step 2: Write RED competitor-generation tests**

For a fixed new game/city, assert:

```text
exactly 2 competitors for opened Harbor City
same game seed + city seed -> deep-equal competitor list
competitor generation does not change game.rngState
IDs are competitor-harbor-city-1 / -2
all generated competitors are active and canonically sorted
productFocus length is 1 or 2, unique, and known
location resolves to a valid city tile but does not become player-owned
calling initialization twice is idempotent
industry city -> initializer returns original game
opening a second retail city initializes exactly 2 for that city and keeps existing rivals unchanged
```

Run:

```bash
bun run test:unit -- --run src/lib/game/competitors.spec.ts
```

Expected: FAIL because competitor contracts do not exist.

- [ ] **Step 3: Implement brand catalog and write-through default-price helper**

Create:

```ts
export function getBrandDefinition(id: BrandId): BrandDefinition;
export function getSupportedBrands(productId: ProductId): readonly BrandDefinition[];
export function isBrandSupported(productId: ProductId, brandId: BrandId): boolean;
export function getBrandDefaultSellingPrice(
  product: ProductDefinition,
  brandId: BrandId
): number;
```

Formula:

```ts
Math.max(1, Math.round(product.defaultSellingPrice * brand.priceMultiplier));
```

Add `defaultBrandId: 'common-ground'` to all current products.

- [ ] **Step 4: Make brand identity part of the existing product row**

`createStoreProduct` initializes both fields:

```ts
brandId: product.defaultBrandId,
sellingPrice: getBrandDefaultSellingPrice(product, product.defaultBrandId),
```

Extend `updateStoreProduct` so:

```text
unsupported brand -> original game
valid changed brand -> update brandId
brand changed + patch has no explicit sellingPrice -> sellingPrice becomes new brand default
explicit sellingPrice patch -> existing selling-price normalization wins
```

Add focused `stock.spec.ts` tests for default inheritance, level-unlock inheritance, valid brand change + price write-through, subsequent direct selling-price edit, and invalid no-op.

- [ ] **Step 5: Implement deterministic competitor initialization**

Create:

```ts
export function generateCompetitorsForRetailCity(
  game: Pick<GameState, 'seed' | 'stores'>,
  city: City,
  worldCity: WorldCityDefinition
): MarketCompetitor[];

export function ensureCompetitorsForRetailCity(
  game: GameState,
  cityId: WorldCityId
): GameState;
```

Use only a local RNG:

```text
normalizeSeed(game.seed + worldCity.seed * 37 + 39_039)
```

Call from `createNewGame` after founding-store placement and from `openWorldCity` after a retail city map is materialized. Financing already flows through `openWorldCity`.

- [ ] **Step 6: Delete the hidden `Store.competition` scalar**

Remove the type field and random initialization. Change the existing formulas to:

```text
base seller score = reputation term + staffCapacity * 0.25
base market position = 35 + localDemand / 5 + reputation / 3 + marketing.market
operating costs = baseRent * 0.92 + marketing.cost
```

Do not add a replacement scalar or consume a dummy RNG call. The visible share adjustment lands in Task 3.

- [ ] **Step 7: Move save and scenario persistence to schema 19**

Set:

```ts
export const SAVE_SCHEMA_VERSION = 19;
```

`saveCodec.ts` validates:

```text
StoreProduct.brandId known + supported
competitor IDs unique and canonical
competitor city opened/materialized/retail
competitor location valid for city
known archetype/posture/status/brand IDs
reputation finite 0..100
productFocus exactly 1-2 unique known family IDs, canonical
non-empty rival brand mix compatible with rival archetype
```

Delete `competition` validation. Schema 18 fails through the existing wrong-schema path.

Update `scenarioCodec.ts`/`.spec.ts` and scenario record fixtures so embedded current `GameState` and `SAVE_SCHEMA_VERSION` use schema 19. Do not add a scenario brand command.

- [ ] **Step 8: Audit complete fixtures immediately**

Run:

```bash
rg -n "GameState\s*=\s*\{|satisfies\s+GameState|as\s+GameState" src
rg -n "Store\s*=\s*\{|satisfies\s+Store|as\s+Store" src
rg -n "StoreProduct\s*=\s*\{|satisfies\s+StoreProduct|as\s+StoreProduct" src
rg -n "competition:" src
rg -n "SAVE_SCHEMA_VERSION" src/lib/persistence
```

Add only required fields to complete literals/builders; do not duplicate fields into objects that spread a complete state.

- [ ] **Step 9: Verify checkpoint 1**

```bash
bun run test:unit -- --run \
  src/lib/game/brands.spec.ts \
  src/lib/game/competitors.spec.ts \
  src/lib/game/state.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/world.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/persistence/scenarioCodec.spec.ts
bun run check
bun run test:unit -- --run
```

Expected: PASS. Exact legacy seeded values may intentionally change because the removed competition draw is not preserved.

- [ ] **Step 10: Commit**

```bash
git add src/lib/game src/lib/persistence src/routes

git commit -m "feat(market): add brand and competitor identity"
```

---

### Task 2: Apply brand economics while preserving the existing shelf-price contract

**Files:**
- Modify: `src/lib/game/brands.ts`
- Modify: `src/lib/game/brands.spec.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/stock.spec.ts`
- Modify: `src/lib/game/retailSupply.ts`
- Modify: `src/lib/game/retailSupply.spec.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`

**Interfaces:**

```ts
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

export function brandedSellerScore(store: Store, productId: ProductId): number;
```

`DailyProductReport` gains:

```ts
brandId: BrandId;
brandUnitCost: number;
brandDemandMultiplier: number;
brandMarketAttractionMultiplier: number;
brandCustomerResponse: number;
```

Existing `baseSellingPrice` and `effectiveSellingPrice` remain the only price evidence.

- [ ] **Step 1: Write RED brand-economics tests**

Pin:

```text
unitCost = product.importCost * brand.unitCostMultiplier
marketAttractionMultiplier = loyaltyMultiplier * availabilityMultiplier
customerResponse = clamp(-3, 3, round((quality - 50) / 10))
unsupported product-brand input is rejected
```

Do **not** add a `customerPrice` assertion.

- [ ] **Step 2: Write RED brand-only sales tests with rivals explicitly disabled**

Build controlled fixtures with:

```ts
competitors: []
```

or use a helper that clears competitors before the sales call.

Pin:

```text
Common Ground preserves neutral brand terms
Budget Bay changes unit cost/direct demand/attraction but sellingPrice remains the row value
premium brand changes cost/attraction/customer response but does not multiply sellingPrice in the live loop
priceDemandMultiplier receives StoreProduct.sellingPrice
base/effective report prices equal existing configured/markdowned sellingPrice semantics
DailyProductReport records selected brand economics
grossMargin = revenue - branded COGS
changing brand does not add/move RNG draws
```

These exact unit fixtures must stay rival-free so Task 3 is an additive market-share wrapper.

- [ ] **Step 3: Export and use one branded seller-score helper**

Refactor the current private seller score into:

```ts
export function brandedSellerScore(store: Store, productId: ProductId): number {
  const product = store.products.find((candidate) => candidate.productId === productId);
  if (!product) return 0;
  const base = /* existing reputation-sensitive score without Store.competition */;
  return base * resolveBrandEconomics(getProductDefinition(productId), product.brandId)
    .marketAttractionMultiplier;
}
```

Use it in:

```text
getEligibleProductSellers ordering
simulateProductSalesForCity seller share
getPolicyAdjustedCityProductDemand planner contribution
```

Task 3's `marketCompetition.ts` imports the same function rather than copying score arithmetic.

- [ ] **Step 4: Apply brand terms without a second live price**

Inside the existing seller loop:

```text
seller share = brandedSellerScore / total branded player score
policyDemand = sellerPolicyDemand(city pool, share, effective policy)

desiredUnits = policyDemand
  * brand.demandMultiplier
  * obsolescenceMultiplier
  * priceDemandMultiplier(definition, product.sellingPrice)
  * existing jitter

baseRevenue = unitsSold * product.sellingPrice * storeRevenueMultiplier
effectiveSellingPrice = product.sellingPrice * markdownMultiplier
revenue = unitsSold * effectiveSellingPrice * storeRevenueMultiplier
costOfGoods = unitsSold * brand.unitCost
```

No `brandCustomerPrice` field or runtime multiplier exists.

- [ ] **Step 5: Compose brand unit cost with weekly retail replenishment**

Resolve the selected brand for each store product:

```text
baselineCost = importedUnits * brand.unitCost
event-adjusted spend = round(baselineCost * resolved import-cost multiplier)
```

`DailyProductReport.importCost` becomes selected brand unit cost. Local warehouse quantity/value semantics stay unchanged.

Add a fixture with a non-neutral brand + active supplier import-cost modifier and assert the event multiplier composes exactly once.

- [ ] **Step 6: Add brand report evidence and customer response**

Every sales/replenishment-created product report populates the five brand fields, including zero-sales replenishment rows.

At store close:

```text
weightedBrandResponse = totalUnitsSold > 0
  ? round(sum(unitsSold * brandCustomerResponse) / totalUnitsSold)
  : 0
```

Apply that response to ending reputation before normal clamping. Do not create a loyalty ledger.

- [ ] **Step 7: Keep Supply Planner structurally shared**

`getPolicyAdjustedCityProductDemand` continues to use `brandedSellerScore` and includes `brand.demandMultiplier` in the seller contribution.

Planner still excludes:

```text
trend
jitter
obsolescence
markdown
future rival actions
```

No rival share is applied until Task 3.

- [ ] **Step 8: Run focused verification**

```bash
bun run test:unit -- --run \
  src/lib/game/brands.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/supplyPlanner.spec.ts
bun run check
```

Expected: PASS with Task 2 numeric fixtures still using `competitors: []`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/game/brands.ts src/lib/game/brands.spec.ts \
  src/lib/game/types.ts \
  src/lib/game/stock.ts src/lib/game/stock.spec.ts \
  src/lib/game/retailSupply.ts src/lib/game/retailSupply.spec.ts \
  src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts \
  src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts

git commit -m "feat(market): apply brand economics"
```

---

### Task 3: Add explicit rival market share to live sales, planner demand, daily reports, and market position

**Files:**
- Create: `src/lib/game/marketCompetition.ts`
- Create: `src/lib/game/marketCompetition.spec.ts`
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/stock.spec.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`
- Modify: `src/lib/game/reports.ts` only for read helpers actually needed by UI
- Modify: `src/lib/game/reports.spec.ts` when those helpers are added
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`

**Interfaces:**

```ts
export interface MarketShareResolution {
  playerShare: number;
  playerAttractionScore: number;
  competitors: DailyMarketCompetitorReport[];
}

export function resolveProductMarketShare(
  game: GameState,
  cityId: WorldCityId,
  productId: ProductId,
  playerAttractionScore: number,
  day: number
): MarketShareResolution;
```

`DailyReport` gains canonical `marketReports: DailyMarketReport[]`.

- [ ] **Step 1: Write RED pure market-share tests**

Hand-author rivals and pin:

```text
no eligible rival -> player share 1
closed rival -> excluded
wrong city -> excluded
archetype/product incompatibility -> excluded
brand/product incompatibility -> excluded
higher rival reputation lowers player share
focused product family lowers player share versus unfocused
more aggressive posture lowers player share for price-sensitive product
compatible high-attraction rival brand lowers player share
all returned shares sum to 1 within floating tolerance
competitor rows sorted by ID
```

Use the exact attraction formula from the spec.

- [ ] **Step 2: Implement `marketCompetition.ts` as a pure read model**

For each eligible rival:

```text
base = 25 + reputation * 0.5
focus = focused ? 1.20 : 0.85
postureBase = discount 1.12 | competitive 1.06 | standard 1.00 | premium 0.90
price = clamp(0.5, 1.5, 1 + (postureBase - 1) * product.priceSensitivity)
brand = average(compatible brand loyalty * availability)
promotion = active rival-attraction modifier product, default 1
score = base * focus * price * brand * promotion
```

Normalize against caller-provided `playerAttractionScore`, which is calculated only from shared `brandedSellerScore`.

- [ ] **Step 3: Write RED live allocation tests around the Task 2 fixtures**

Keep the Task 2 brand-only fixtures unchanged with `competitors: []`. Add new Task 3 fixtures with controlled rivals and pin:

```text
trend-adjusted city pool is known
market resolver produces known player share
company demand pool = trend pool * player share
player seller shares are computed inside that company pool
changing rival score changes company demand pool but not branded seller scoring
remainingDemand remains diagnostic only
no-rival behavior has playerShare 1 under the new no-hidden-competition model
```

- [ ] **Step 4: Feed market share into live sales before per-seller allocation**

In `simulateProductSalesForCity`:

```text
trendPool = raw city demand * trend multiplier
playerAttraction = sum(brandedSellerScore(...))
market = resolveProductMarketShare(game, city.id, productId, playerAttraction, game.day)
companyDemandPool = trendPool * market.playerShare
sellerShare = brandedSellerScore / playerAttraction
policyDemand = sellerPolicyDemand(companyDemandPool, sellerShare, effectivePolicy)
```

Then retain Task 2 brand demand + existing configured-price/product-dynamics/jitter/capacity/stock flow.

Return market evidence alongside product reports and aging.

- [ ] **Step 5: Make Supply Planner reuse current market share**

Against its existing trend-free raw pool:

```text
playerAttraction = current branded player seller scores
currentShare = resolveProductMarketShare(..., snapshot day)
companyRawPool = rawPool * currentShare.playerShare
potentialDemandPerDay = sum(
  sellerPolicyDemand(companyRawPool, sellerShare, policy) * brand.demandMultiplier
)
```

No live trend/jitter/obsolescence/markdown/future-event forecast.

- [ ] **Step 6: Persist daily market evidence and day-over-day delta**

`simulateDay` compares current market rows to the latest completed report by `(cityId, productId)`:

```text
no prior row -> playerShareDelta = null
prior row -> current.playerShare - prior.playerShare
```

Sort market reports by city ID then product ID; rival rows by competitor ID.

- [ ] **Step 7: Fold visible share into `DailyStoreReport.marketPosition`**

Keep `buildStoreOperationProfile`'s competition-free base value from Task 1. During `buildDailyStoreReport`, pass/lookup the current city market rows for that store's actual product rows:

```text
shares = playerShare for current market rows matching store.products
meanPlayerShare = shares.length > 0 ? mean(shares) : null
shareAdjustment = meanPlayerShare === null
  ? 0
  : round((meanPlayerShare - 0.50) * 20)
finalMarketPosition = clampScore(profile.marketPosition + shareAdjustment)
```

Pin direction:

```text
stronger rival attraction -> lower playerShare -> lower store report marketPosition
same store/profile + higher playerShare -> higher marketPosition
no market rows -> base marketPosition unchanged
```

This keeps HPA-41 Grow Market Share report evidence truthful.

- [ ] **Step 8: Extend report save validation**

Validate market report references, share ranges, finite scores, known postures/brands, canonical ordering, and competitor existence. Historical rows may reference a competitor now closed.

- [ ] **Step 9: Run the full market checkpoint gate**

```bash
bun run test:unit -- --run \
  src/lib/game/marketCompetition.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/supplyPlanner.spec.ts \
  src/lib/game/reports.spec.ts \
  src/lib/persistence/saveCodec.spec.ts
bun run check
bun run test:unit -- --run
```

Expected: PASS before event integration begins.

- [ ] **Step 10: Commit**

```bash
git add src/lib/game src/lib/persistence/saveCodec.ts src/lib/persistence/saveCodec.spec.ts

git commit -m "feat(market): allocate demand against rivals"
```

---

### Task 4: Extend the typed event framework and every exhaustive consumer for rival actions

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/eventTargets.ts`
- Modify: `src/lib/game/eventTargets.spec.ts`
- Modify: `src/lib/game/eventEffects.ts`
- Modify: `src/lib/game/eventEffects.spec.ts`
- Modify: `src/lib/game/eventDefinitions.ts`
- Modify: `src/lib/game/eventDefinitions.spec.ts`
- Modify: `src/lib/game/eventModifiers.ts`
- Modify: `src/lib/game/eventModifiers.spec.ts`
- Modify: `src/lib/game/eventSelection.ts`
- Modify: `src/lib/game/eventSelection.spec.ts`
- Modify: `src/lib/game/eventCatalog.ts`
- Modify: `src/lib/game/marketCompetition.ts`
- Modify: `src/lib/game/marketCompetition.spec.ts`
- Modify: `src/lib/components/game/ActiveModifiers.svelte`
- Modify: `src/lib/components/game/ActiveModifiers.svelte.spec.ts`
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Re-run: `src/lib/persistence/scenarioCodec.spec.ts` because event-bearing scenario `GameState` uses current schema

**Type cut:**

```ts
export type EventTarget =
  | { kind: 'company' }
  | { kind: 'recurring-route'; routeId: string }
  | { kind: 'competitor'; competitorId: string };

export type EventTargetSelector =
  | { kind: 'company' }
  | { kind: 'recurring-route'; state: 'active' }
  | { kind: 'competitor'; status: 'active' | 'closed' };

export type EventImmediateEffect =
  | ExistingImmediateEffects
  | { kind: 'competitor-status-set'; status: 'active' | 'closed' }
  | { kind: 'competitor-price-posture-set'; pricePosture: PricingPosture }
  | { kind: 'competitor-product-focus-set'; productFocus: ProductFamilyId[] };

export type EventTimedEffect =
  | ExistingTimedEffects
  | { kind: 'competitor-attraction-multiplier'; multiplier: number };
```

- [ ] **Step 1: Before Svelte edits, run the required Svelte MCP docs workflow**

For `ActiveModifiers.svelte`, use `list-sections`, fetch all relevant Svelte 5/runes docs, and run `svelte-autofixer` after edits until clean.

- [ ] **Step 2: Write RED event-target tests**

Pin active/closed selector behavior, ID ordering, closure resolvability, unknown rejection, clone/equality, and target copy params including competitor ID/name/city.

- [ ] **Step 3: Write RED immediate-effect tests through normal `resolveDecision`**

Assert:

```text
active -> closed
closed -> active
price posture changes targeted rival only
product focus replacement accepts exactly 1-2 unique known families and stores canonical order
empty focus rejected
3+ families rejected
duplicate families rejected
unknown family rejected
wrong target kind rejects atomically
unknown competitor rejects atomically
invalid status/posture rejects atomically
```

- [ ] **Step 4: Mutate competitor state at the actual `applyEffect` site**

For each competitor immediate effect, explicitly require:

```ts
if (decision.target.kind !== 'competitor') return rejected();
```

Resolve the target rival from `tentativeGame.competitors`; unknown target returns the existing atomic `effect-rejected` result. Do not add a generic patch effect.

- [ ] **Step 5: Write RED timed-modifier tests**

Pin:

```text
competitor-attraction-multiplier valid only on competitor target
multiplier finite and > 0
existing replace stacking behavior retained
active multiplier changes market share
expiry restores unmodified share
history/lifecycle clones competitor target + explanation
```

- [ ] **Step 6: Update every exhaustive timed-effect consumer**

At minimum:

```text
src/lib/game/eventModifiers.ts::cloneTimedEffect
modifier/definition/save validators
src/lib/components/game/ActiveModifiers.svelte routeEffectValue/render branches
```

`ActiveModifiers.svelte` should show competitor target + localized structured modifier copy/multiplier without trying to resolve route-effective values. Do not hide the modifier merely to satisfy exhaustiveness.

Do not add the effect to `SimulationRules`.

- [ ] **Step 7: Author exactly one production `rival-promotion` event**

Use one weighted active-competitor event with three player responses and the same already-occurring 3-day rival promotion modifier:

```ts
{
  durationDays: 3,
  stackingKey: 'rival-promotion:market-attraction',
  stackingRule: 'replace',
  effect: { kind: 'competitor-attraction-multiplier', multiplier: 1.18 },
  explanation: { key: 'events.rivalPromotion.modifier', params: {} },
  importance: 'important'
}
```

Do not add production launch/closure/reposition events yet; typed effects are unit-tested extension points only.

- [ ] **Step 8: Add localized event/target/modifier copy**

Add English/Japanese/Traditional Chinese copy for the new event, options, competitor target label, and modifier explanation/value. Do not persist localized strings.

- [ ] **Step 9: Run event integration gates**

```bash
bun run test:unit -- --run \
  src/lib/game/eventTargets.spec.ts \
  src/lib/game/eventEffects.spec.ts \
  src/lib/game/eventDefinitions.spec.ts \
  src/lib/game/eventModifiers.spec.ts \
  src/lib/game/eventSelection.spec.ts \
  src/lib/game/marketCompetition.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/persistence/scenarioCodec.spec.ts
bun run test:unit -- --run --project client src/lib/components/game/ActiveModifiers.svelte.spec.ts
bun run check
bun run test:unit -- --run
```

Expected: PASS before remaining UI work starts.

- [ ] **Step 10: Commit**

```bash
git add src/lib/game src/lib/components/game/ActiveModifiers.svelte* \
  src/lib/i18n src/lib/persistence

git commit -m "feat(events): add rival market actions"
```

---

### Task 5: Add explicit sandbox brand mutation and expose brand/market/rival evidence through existing UI/map surfaces

**Files:**
- Modify: `src/lib/components/game/StoreStockTable.svelte`
- Modify: `src/lib/components/game/StoreStockTable.svelte.spec.ts`
- Modify: `src/lib/components/game/StoreDetailModal.svelte`
- Modify: `src/lib/components/game/StoreDetailModal.svelte.spec.ts`
- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- Modify: `src/lib/game/mapRender.ts`
- Modify: `src/lib/game/mapRender.spec.ts`
- Modify: `src/lib/components/game/CityMap.svelte.spec.ts`
- Modify: `src/lib/phaser/cityMapScene.ts`
- Modify: `src/lib/phaser/cityMapScene.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/gameRouteController.ts`
- Modify: `src/routes/gameRouteController.spec.ts`
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`

**Controller interface:**

```ts
updateStoreProductBrand(
  storeId: string,
  productId: ProductId,
  brandId: BrandId
): Promise<GameRouteCommitResult> {
  return this.commitMutation({
    transition: (game) => updateStoreProduct(game!, storeId, productId, { brandId }),
    cueId: 'sfx.stock.edit'
  });
}
```

No `scenarioCommand` is supplied.

- [ ] **Step 1: Run required Svelte MCP documentation workflow**

Before editing any Svelte component:

```text
1. list-sections
2. fetch all relevant Svelte 5/runes/form-control/component documentation
3. edit components using runes-mode patterns
4. run svelte-autofixer on every changed Svelte snippet until no issues remain
```

- [ ] **Step 2: Write RED controller tests for brand mutation**

Pin:

```text
sandbox mutation changes brand and writes brand default sellingPrice
autosave/commit path is the normal controller mutation path
unsupported brand returns unchanged state through transition semantics
active scenario cannot use this mutation because no ScenarioCommand exists / capability is disabled
selling-price command remains independent and direct after brand change
```

Do not route brand changes through `updateStoreSellingPrice`.

- [ ] **Step 3: Write RED brand-control component tests**

For `StoreStockTable` / `StoreDetailModal`, assert:

```text
Brand column renders current brand
select options exactly equal getSupportedBrands(productId)
known unsupported brand absent
changing brand emits explicit brand callback with store/product/brand IDs
canUpdateBrand=false disables control and does not emit
latest report shows selected brand + existing base/effective selling price + branded unit cost + gross margin
```

Do not assert a removed `brandCustomerPrice` field.

- [ ] **Step 4: Thread the explicit brand route**

Wire:

```text
StoreStockTable
  -> StoreDetailModal explicit onUpdateBrand callback
  -> +page.svelte
  -> gameRouteController.updateStoreProductBrand
```

Thread `canUpdateBrand` beside the current selling-price/inventory capability flags and reuse the existing disabled reason during scenarios.

Do not add a new Store Detail tab or scenario command.

- [ ] **Step 5: Write RED Reports component tests**

Pin latest-report sections:

```text
Brand performance -> brand, units, revenue, gross margin, weighted customer response
Market -> city/product player share, delta, strongest rival, reputation, posture, focus, compatible brands, active promotion multiplier
no market report -> omitted/neutral without fabricated values
closed historical rival remains explainable by report + current rival lookup fallback
```

- [ ] **Step 6: Add Reports sections**

Use typed product/market report evidence and existing optional `game` prop. Keep localization in UI/game-copy helpers. Do not add charting, filters, or another dashboard.

- [ ] **Step 7: Write RED retail-map snapshot/renderer tests**

Extend snapshot with competitor renders and assert:

```text
active-city snapshot includes only that city's competitors
closed rivals produce no marker
competitor coordinates do not mark tiles owned
placement preview valid/invalid sets unchanged
canvas data-competitor-marker-count is exposed
2 active starter rivals -> count 2
closing one -> count 1
terrain/camera key excludes competitor state
```

- [ ] **Step 8: Render lightweight non-interactive rival markers**

Reuse Phaser graphics or one dedicated rival graphics object. Do not load new image assets and do not add pointer interaction.

Rivals must not enter:

```text
getOccupiedStoreTileIds
ownership outlines
placement previews
store sprite lists
terrain key
```

No industry-map changes.

- [ ] **Step 9: Complete localization and focused verification**

Add brand names/position labels, Brand control labels, brand evidence, market labels/factors, and rival marker accessibility/debug copy to all three locales.

Run:

```bash
bun run test:unit -- --run --project client \
  src/lib/components/game/StoreStockTable.svelte.spec.ts \
  src/lib/components/game/StoreDetailModal.svelte.spec.ts \
  src/lib/components/game/ReportsPanel.svelte.spec.ts \
  src/lib/components/game/CityMap.svelte.spec.ts
bun run test:unit -- --run \
  src/routes/gameRouteController.spec.ts \
  src/lib/game/mapRender.spec.ts \
  src/lib/phaser/cityMapScene.spec.ts
bun run check
```

Run Svelte autofixer again after final component edits and address every issue before committing.

- [ ] **Step 10: Commit**

```bash
git add src/lib/components src/lib/game/mapRender* src/lib/phaser/cityMapScene* \
  src/lib/i18n src/routes

git commit -m "feat(ui): expose brands and rival market"
```

---

### Task 6: Add bounded end-to-end living-market coverage and run final verification

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify only production/test files found by final failures; do not broaden scope for cleanup

- [ ] **Step 1: Add deterministic rival-promotion fixture helper**

Mirror the existing `selectProductionSupplierEvent` pattern. Scan a bounded event-seed range against a prepared game with known starter rivals and select `rival-promotion` without advancing the UI until something happens.

- [ ] **Step 2: Add brand + rival visibility E2E**

Using deterministic sandbox save injection:

```text
load game
wait for retail canvas settled attributes
assert competitor marker count = 2
open Store Detail stock tab
change bottled-water from Common Ground to Budget Bay
assert shelf-price control becomes the Budget Bay write-through default
assert autosave contains brandId budget-bay + that sellingPrice
reload
assert brand + sellingPrice persisted
manually edit selling price and assert it remains direct/not re-multiplied
advance exactly one day
open Reports
assert brand performance + market factor evidence visible
```

- [ ] **Step 3: Add fixed rival-promotion lifecycle E2E**

Inject/select a deterministic rival-promotion decision, capture baseline market share, resolve one known option, and advance exact fixed days:

```text
modifier active -> event multiplier 1.18 and lower player share
3-day duration expires -> lifecycle reports expiry
next stable market row -> multiplier 1 and share recovers
```

Use a fixture with stable player/rival terms; do not poll or advance-until-trigger.

- [ ] **Step 4: Run targeted E2E first**

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "living market|rival promotion"
```

Expected: PASS repeatedly.

- [ ] **Step 5: Run full final verification**

```bash
bun run test:unit -- --run
bun run check
bun run lint
bun run test:e2e -- src/routes/retail-sim.e2e.ts
bun run test
```

If an old exact-value fixture fails because hidden competition or brand/rival economics were deliberately replaced, update the fixture to the explicit new model and document the reason. Do not restore legacy behavior.

- [ ] **Step 6: Audit final scope and diff**

```bash
rg -n "competition:" src
rg -n "brandCustomerPrice|customerPrice.*brand|priceMultiplier.*sellingPrice" src/lib/game src/lib/components
rg -n "SAVE_SCHEMA_VERSION" src/lib/persistence
rg -n "competitor-attraction-multiplier|competitor-status-set|competitor-price-posture-set|competitor-product-focus-set" src
rg -n "brandId" src/lib/game src/lib/components src/lib/persistence src/routes
rg -n "updateStoreProductBrand" src/routes

git diff --check
git status --short
git diff --stat main...HEAD
```

Expected:

```text
no persisted/live Store.competition remains
no second live customer-price lens exists
schema 19 reaches both normal and scenario persistence
all competitor event unions have validators/tests/render coverage
brand identity flows state -> simulation -> persistence -> explicit controller -> UI
marketPosition direction follows visible player share
no rival inventory/staffing/finance/logistics subsystem
no new game-art assets
```

- [ ] **Step 7: Commit final tests/fixes**

```bash
git add src

git commit -m "test(market): cover living market flows"
```

- [ ] **Step 8: Prepare the same HPA-39 PR for review**

Update the existing PR summary with:

```text
one brand per existing product row
sellingPrice remains sole shelf price; brand price only writes defaults
explicit sandbox-only updateStoreProductBrand controller mutation
hidden competition scalar removed
2 deterministic lightweight rivals per retail city
shared branded seller-score helper
live/planner market-share integration
marketPosition tied to visible player share
rival typed events + timed promotion lifecycle
schema 19 normal + scenario persistence
existing Store Detail/Reports/retail-map UI
unit/component/E2E verification results
```

Mark the same PR ready only after all Step 5 commands pass and the diff still matches HPA-39 non-goals.
