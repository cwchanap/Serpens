# Living Market Brands and Lightweight Competitors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Implement each behavior change test-first. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement HPA-39 in one PR: one supported brand selection per existing store product, deterministic lightweight competitors for each opened retail city, an explicit player-versus-rival market-share split, typed rival event actions, transparent reports, existing-surface UI, and schema-19 persistence.

**Architecture:** Keep the existing retail simulation authoritative. `brands.ts` owns static brand compatibility and economics; `competitors.ts` owns deterministic persisted rival identity/lifecycle; `marketCompetition.ts` is a pure read model that converts player seller attraction plus rival attraction into market shares. `stock.ts` continues to own live seller allocation, with the market split applied before HPA-41 per-seller policy demand. Rival state never enters inventory, staffing, finance, factories, logistics, placement ownership, or manager delegation. Existing event target/effect/modifier machinery handles rival actions, and existing store detail, Reports, and retail-map surfaces expose the result.

**Tech Stack:** TypeScript 6, SvelteKit/Svelte 5, Phaser 4, Vitest 4, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-08-20-living-market-brands-competitors-design.md`

## Global Constraints

- One implementation PR for HPA-39; the six tasks below are commit/review checkpoints, not separate PRs.
- Keep one brand per existing `StoreProduct`. Do not add per-brand lots, prices, reorder rows, or SKU-level inventory.
- `ProductDefinition.defaultBrandId` is the only brand inheritance rule in this ticket. New stores and level-unlocked products inherit it through `createStoreProduct`.
- Brand editing is sandbox-only. Do not add a `ScenarioCommand`, scenario capability, or scenario-specific brand state.
- Delete `Store.competition` and its random initialization. Do not preserve the old penalty, compatibility alias, or ghost RNG draw.
- Competitors are `MarketCompetitor`, never `Store`; exactly two are generated for each opened retail city.
- Competitor generation uses a local RNG derived from game seed + world-city seed and never changes `GameState.rngState`.
- Competitor map locations are presentation coordinates only. They never reserve tiles or participate in placement validity.
- Apply explicit market share before HPA-41's existing player seller split. Do not reintroduce the shared residual-demand allocation cap removed by HPA-41.
- Supply Planner uses the same current market-share and brand terms against its existing trend-free demand model. It still excludes future trend/jitter/obsolescence/future rival actions.
- Keep the existing single live jitter draw per eligible player seller in its current canonical order.
- Rival timed promotion is read directly from active event modifiers by `marketCompetition.ts`; do not widen `SimulationRules` with competitor state.
- Use closed unions for rival targets/effects; do not add a generic entity-patch effect or market rules DSL.
- No new dashboard, modal, management panel, rival storefront art, or industry-map work.
- Schema 19 is current and rejects schema 18. Pre-release saves have no migration/alias path.
- Persist authored/stateful identity only; brand economics and current market shares stay derived except completed report evidence.
- Treat removal of hidden competition penalties and introduction of explicit rival/brand economics as declared balance changes. Pin new invariants rather than old seed totals.
- Run a full unit gate after the market allocation checkpoint and after rival event integration, plus final full verification.
- Before any Svelte edit, follow `AGENTS.md`: use the Svelte MCP `list-sections`, fetch all relevant documentation, and run the Svelte autofixer until clean.

## Risks

1. **Double competition:** named rivals must replace, not stack with, the old `Store.competition` seller/market/operating-cost penalties.
2. **RNG drift:** competitor generation must not consume the main simulation stream; removing the legacy competition draw intentionally changes old exact seeds.
3. **Accounting drift:** selected brand unit cost must reconcile COGS, weekly retail import spend, report `importCost`, and event import-cost multipliers.
4. **Demand ordering:** rival share is applied to the city/product pool before seller policy/brand/price dynamics; applying it per store would distort market share.
5. **Planner/live divergence:** planner remains trend-free and jitter-free but must reuse current rival share, brand attraction, seller eligibility, and policy terms.
6. **Closed rival history:** a closed competitor remains resolvable for event/history validation even though it contributes no demand pressure and has no map marker.
7. **Report evidence:** day-over-day share delta compares completed reports by city + product; missing prior evidence yields `null`, never fabricated zero change.
8. **Map scope:** competitor markers are non-interactive presentation state. Accidentally putting them into occupied-tile calculations would change placement semantics.
9. **Fixture blast radius:** `StoreProduct.brandId`, `GameState.competitors`, schema 19, and removal of `Store.competition` affect many complete fixtures. Audit constructors immediately rather than deferring type failures.
10. **E2E flakiness:** use save injection and deterministic event-seed selection already present in `retail-sim.e2e.ts`; never advance until an event happens.

---

### Task 1: Add the brand/competitor domain cut, remove hidden competition, and move persistence to schema 19

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
- Modify: complete `GameState`, `Store`, and `StoreProduct` fixtures/factories found by the constructor audit

**Interfaces:**

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
  quality: number;
  loyaltyMultiplier: number;
  availabilityMultiplier: number;
  priceMultiplier: number;
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
  productFocus: ProductFamilyId[];
  brandIds: BrandId[];
  status: 'active' | 'closed';
}
```

`ProductDefinition` gains required `defaultBrandId: BrandId`.

`StoreProduct` gains required `brandId: BrandId`.

`StoreProductPatch` gains optional `brandId?: BrandId`.

`GameState` gains required `competitors: MarketCompetitor[]`.

- [ ] **Step 1: Write RED brand-catalog tests**

Pin the authored catalog from the design:

```text
Common Ground -> all current products, neutral multipliers
Budget Bay -> value grocery/convenience support
Northstar Select -> premium fashion/electronics support
Fresh Field -> premium grocery-food support
```

Assert:

```text
all BrandIds unique and resolvable
every supported ProductId exists
every ProductDefinition.defaultBrandId is supported
multipliers finite and > 0
quality in 0..100
at least one product exposes 3 compatible brands
at least one known unsupported pair is rejected
```

- [ ] **Step 2: Write RED competitor-generation tests**

For a fixed new game/city, assert:

```text
exactly 2 competitors for opened Harbor City
same game seed + city seed -> deep-equal competitor list
competitor generation does not change game.rngState
IDs are competitor-harbor-city-1 / -2
all generated competitors are active and canonically sorted
location resolves to a valid city tile but does not become player-owned
calling initialization twice is idempotent
opening a second retail city initializes exactly 2 for that city and keeps existing rivals unchanged
```

- [ ] **Step 3: Add brand catalog + compatibility helpers**

Create `BRANDS` and:

```ts
export function getBrandDefinition(id: BrandId): BrandDefinition;
export function getSupportedBrands(productId: ProductId): readonly BrandDefinition[];
export function isBrandSupported(productId: ProductId, brandId: BrandId): boolean;
```

Add `defaultBrandId: 'common-ground'` to all current products.

Keep brand names/catalog data authored in one place; do not duplicate supported lists in UI or persistence.

- [ ] **Step 4: Make brand identity part of the existing product row**

`createStoreProduct` returns:

```ts
{
  productId,
  brandId: product.defaultBrandId,
  lots: ...,
  reorderThreshold: ...,
  targetStock: ...,
  sellingPrice: product.defaultSellingPrice
}
```

Extend `updateStoreProduct` so a supplied brand applies only when `isBrandSupported(productId, patch.brandId)`. An unsupported brand returns the original game unchanged; it does not coerce to default.

Write focused state/stock tests for default inheritance, level-unlock inheritance, valid change, and invalid no-op.

- [ ] **Step 5: Add deterministic competitor initialization**

Create `competitors.ts` with a pure generator and idempotent initializer:

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

Use:

```text
normalizeSeed(game.seed + worldCity.seed * 37 + 39_039)
```

and a local `createRng(...)` only.

Generation rules:

```text
2 rivals per retail city
stable fixed-name pool
reputation 45..75
existing PricingPosture
1-2 product-family focuses compatible with chosen archetype
common-ground + at most one compatible specialist brand
prefer a currently unowned buildable tile as approximate location
canonical competitor ID order
```

Call it from `createNewGame` after the founding store exists and from `openWorldCity` after a retail city map is materialized. Financing city opening already reuses `openWorldCity`; do not fork the lifecycle.

- [ ] **Step 6: Delete the hidden `Store.competition` scalar**

Remove the type field and random initialization. Change the only live formulas to:

```text
seller score = reputation term + staffCapacity * 0.25
market position = 35 + localDemand / 5 + reputation / 3 + marketing.market
operating costs = baseRent * 0.92 + marketing.cost
```

Do not add a replacement scalar or consume a dummy RNG call.

Add regression tests proving `Store` no longer carries the field and fixed state no longer changes output through a hidden competition input.

- [ ] **Step 7: Move persistence to schema 19**

Set:

```ts
export const SAVE_SCHEMA_VERSION = 19;
```

Extend validation for:

```text
StoreProduct.brandId exists, is known, and supports its ProductId
competitor IDs unique
competitor city opened + materialized + retail
competitor location resolves to that city
known archetype, pricing posture, family IDs, brand IDs, status
reputation finite 0..100
non-empty brand mix and each brand compatible with at least one product supported by the rival archetype
competitor array normalized by ID
brand/productFocus arrays normalized when order is not semantic
```

Delete `competition` validation. Schema 18 must fail with the existing wrong-schema path; do not migrate it.

- [ ] **Step 8: Audit complete fixtures immediately**

Run:

```bash
rg -n "GameState\s*=\s*\{|satisfies\s+GameState|as\s+GameState" src
rg -n "Store\s*=\s*\{|satisfies\s+Store|as\s+Store" src
rg -n "StoreProduct\s*=\s*\{|satisfies\s+StoreProduct|as\s+StoreProduct" src
rg -n "competition:" src
```

Add only genuinely required fields to complete literals/builders. Do not duplicate fields into objects that spread a complete state.

- [ ] **Step 9: Verify checkpoint 1**

```bash
bun run test:unit -- --run \
  src/lib/game/brands.spec.ts \
  src/lib/game/competitors.spec.ts \
  src/lib/game/state.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/world.spec.ts \
  src/lib/persistence/saveCodec.spec.ts
bun run check
bun run test:unit -- --run
```

Expected: PASS. Exact legacy seeded values may need intentional fixture updates because the removed competition draw is not preserved.

- [ ] **Step 10: Commit**

```bash
git add src/lib/game src/lib/persistence src/routes

git commit -m "feat(market): add brand and competitor domain"
```

---

### Task 2: Apply brand economics through live sales, replenishment, reports, and Supply Planner

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
  customerPrice: number;
  unitCost: number;
  demandMultiplier: number;
  marketAttractionMultiplier: number;
  customerResponse: number;
}

export function resolveBrandEconomics(
  product: ProductDefinition,
  brandId: BrandId,
  configuredPrice: number
): BrandEconomics;
```

`DailyProductReport` gains:

```ts
brandId: BrandId;
brandCustomerPrice: number;
brandUnitCost: number;
brandDemandMultiplier: number;
brandMarketAttractionMultiplier: number;
brandCustomerResponse: number;
```

- [ ] **Step 1: Write RED economics tests with fixed numbers**

For representative neutral/value/premium combinations, assert the exact formulas:

```text
customerPrice = configuredSellingPrice * brand.priceMultiplier
unitCost = product.importCost * brand.unitCostMultiplier
marketAttractionMultiplier = loyaltyMultiplier * availabilityMultiplier
customerResponse = clamp(-3, 3, round((quality - 50) / 10))
```

Also assert unsupported product-brand input is rejected rather than silently normalized.

- [ ] **Step 2: Write RED sales tests**

For one fixed high-stock seller and fixed RNG:

```text
Common Ground preserves neutral brand terms
Budget Bay lowers customer price and unit cost and raises direct brand demand
premium brand raises customer price/unit cost and attraction according to catalog
DailyProductReport records selected brand economics
grossMargin = revenue - branded COGS
changing brand does not add/move RNG draws
```

Do not make a brittle assertion that all final units must rank in the same direction across arbitrary prices; pin the individual explicit terms and one controlled fixture.

- [ ] **Step 3: Implement brand economics in seller scoring and live sales**

After Task 1's hidden-competition removal, compute:

```ts
const brand = resolveBrandEconomics(definition, product.brandId, product.sellingPrice);
const brandedSellerScore = baseSellerScore(store, productId) * brand.marketAttractionMultiplier;
```

Inside the existing live seller loop:

```text
seller share = brandedSellerScore / total branded player score
policyDemand = sellerPolicyDemand(city pool, share, effective policy)

desiredUnits = policyDemand
  * brand.demandMultiplier
  * obsolescenceMultiplier
  * priceDemandMultiplier(definition, brand.customerPrice)
  * existing jitter

effective customer price = brand.customerPrice * markdownMultiplier
revenue = unitsSold * effective customer price * store revenue multiplier
costOfGoods = unitsSold * brand.unitCost
```

Keep the current canonical seller order and exactly one existing jitter call per eligible seller.

- [ ] **Step 4: Compose brand unit cost with weekly retail replenishment**

In `retailSupply.ts` resolve the store product's selected brand before calculating imported baseline cost:

```text
baselineCost = importedUnits * brand.unitCost
event-adjusted spend = round(baselineCost * resolved import-cost multiplier)
```

`DailyProductReport.importCost` becomes the selected brand unit cost for that row. Local warehouse quantity/value semantics are unchanged.

Add a focused fixture where a non-neutral brand and an active supplier import-cost modifier both apply, and assert the multiplier is composed once, not twice.

- [ ] **Step 5: Add brand report evidence and customer response**

Every sales/replenishment-created `DailyProductReport` must populate all new brand fields, including rows with zero sales but replenishment activity.

At store close:

```text
weightedBrandResponse = round(
  sum(unitsSold * brandCustomerResponse) / max(1, totalUnitsSold)
)
```

When `totalUnitsSold === 0`, use `0` response. Add this response to the ending store reputation before normal clamping. The company scorecard already consumes store reputation; do not add another loyalty/customer state.

- [ ] **Step 6: Make Supply Planner brand-aware without live-only dynamics**

Extend the existing `getPolicyAdjustedCityProductDemand`/planner seam so seller share uses branded attraction and the seller contribution includes `brand.demandMultiplier`.

Planner still excludes:

```text
trend
jitter
obsolescence
markdown
future rival actions
```

Do not copy the live sales loop. Reuse the same seller eligibility, branded seller-score helper, and policy-demand arithmetic.

- [ ] **Step 7: Run focused verification**

```bash
bun run test:unit -- --run \
  src/lib/game/brands.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/supplyPlanner.spec.ts
bun run check
```

- [ ] **Step 8: Commit**

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

### Task 3: Add explicit rival market share to live sales, planner demand, and daily reports

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
- Modify: `src/lib/game/reports.ts`
- Modify: `src/lib/game/reports.spec.ts`
- Modify: persistence report validators/tests in `src/lib/persistence/saveCodec.ts` and `src/lib/persistence/saveCodec.spec.ts`

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

`DailyReport` gains `marketReports: DailyMarketReport[]` using the structures from the design spec.

- [ ] **Step 1: Write RED pure market-share tests**

Construct hand-authored competitors so every factor is controlled. Pin:

```text
no eligible competitor -> player share 1
closed competitor -> excluded
wrong city -> excluded
archetype/product incompatibility -> excluded
brand/product incompatibility -> excluded
higher rival reputation lowers player share
focused product family lowers player share versus unfocused
more aggressive price posture lowers player share for price-sensitive product
compatible high-attraction rival brand lowers player share
all returned shares sum to 1 within floating tolerance
competitors in report are sorted by ID
```

Use the exact rival attraction formula from the design, including product `priceSensitivity`.

- [ ] **Step 2: Implement `marketCompetition.ts` as a pure read model**

For each eligible rival:

```text
base = 25 + reputation * 0.5
focus = focused ? 1.20 : 0.85
postureBase = discount 1.12 | competitive 1.06 | standard 1.00 | premium 0.90
price = clamp(0.5, 1.5, 1 + (postureBase - 1) * product.priceSensitivity)
brand = average(compatible brand loyalty * availability)
promotion = active rival-attraction event modifier product, default 1
score = base * focus * price * brand * promotion
```

Normalize against `playerAttractionScore + sum(rival scores)`. If the denominator is zero, return player share `0`; normal game states with an eligible player seller will have positive player attraction.

Do not simulate rival units, stock, capacity, cash, or revenue.

- [ ] **Step 3: Write RED live allocation tests**

For a fixed city/product fixture:

```text
trend-adjusted city pool is known
market resolver produces known player share
company demand pool = trend pool * player share
player seller shares are computed inside that company pool
changing rival score changes company demand pool but not player seller scoring rules
remainingDemand, if retained, is diagnostic only and never constrains a later seller
```

Also pin that no-rival behavior is equivalent to `playerShare === 1` under the new no-hidden-competition model.

- [ ] **Step 4: Feed market share into live sales before per-seller allocation**

In `simulateProductSalesForCity`:

```text
trendPool = raw city demand * trend multiplier
playerAttraction = sum(branded eligible player seller scores)
market = resolveProductMarketShare(game, city.id, productId, playerAttraction, game.day)
companyDemandPool = trendPool * market.playerShare
sellerShare = seller branded score / playerAttraction
policyDemand = sellerPolicyDemand(companyDemandPool, sellerShare, effectivePolicy)
```

Then retain Task 2 brand demand/price and existing product dynamics/jitter/capacity/stock flow.

Return current-day market evidence alongside `productReports` and `productAging`.

- [ ] **Step 5: Make Supply Planner reuse current market share**

For the planner's trend-free raw pool:

```text
playerAttraction = current branded player seller scores
currentShare = resolveProductMarketShare(..., snapshot day)
companyRawPool = rawPool * currentShare.playerShare
potentialDemandPerDay = sum sellerPolicyDemand(companyRawPool, sellerShare, policy) * brand.demandMultiplier
```

Do not include live jitter, trend, obsolescence, markdown, or future event forecasts.

Add a planner regression where one current active rival reduces the planned product demand by the expected market-share factor while seller policy and brand contribution remain structurally shared.

- [ ] **Step 6: Persist daily market evidence and day-over-day delta**

`simulateDay` collects city market reports and compares them to the latest completed report by `(cityId, productId)`:

```text
no prior row -> playerShareDelta = null
prior row -> current playerShare - prior playerShare
```

Keep report ordering canonical by city ID then product ID; competitor rows stay ID-sorted.

Extend `reports.ts` only for aggregation/read-model helpers actually needed by UI; do not create historical market analytics beyond the ticket acceptance criteria.

- [ ] **Step 7: Extend report save validation**

Validate market report IDs, shares/ranges, finite scores, known postures/brands, canonical ordering, and that a competitor report references an existing persisted competitor ID. Completed historical reports may reference a competitor that is now closed; status must not invalidate history.

- [ ] **Step 8: Run the full market checkpoint gate**

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

- [ ] **Step 9: Commit**

```bash
git add src/lib/game src/lib/persistence/saveCodec.ts src/lib/persistence/saveCodec.spec.ts

git commit -m "feat(market): allocate demand against rivals"
```

---

### Task 4: Extend the typed event framework for rival actions and a timed promotion lifecycle

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
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: persistence event validators/tests in `src/lib/persistence/saveCodec.ts` / `.spec.ts`

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

- [ ] **Step 1: Write RED event-target tests**

Pin:

```text
active selector returns only active competitors in opened retail cities
closed selector returns closed competitors
selection ordering is competitor ID order
competitor target remains resolvable after closure
unknown competitor is not resolvable
clone/equality/copy params support competitor target
```

Copy params should include at least competitor ID, competitor name, and city ID so event text can explain the target without another lookup in the UI.

- [ ] **Step 2: Write RED immediate-effect tests**

Use synthetic event decisions resolved through the normal `resolveDecision` path. Assert:

```text
active -> closed via competitor-status-set
closed -> active via competitor-status-set
price posture changes only the targeted competitor
product focus replacement is canonical and validates known family IDs
wrong target kind rejects atomically
unknown competitor rejects atomically
invalid status/posture/focus payload rejects atomically
```

Do not expose a generic `Partial<MarketCompetitor>` mutation effect.

- [ ] **Step 3: Write RED timed-modifier tests**

Pin:

```text
competitor-attraction-multiplier valid only on competitor target
multiplier must be finite and > 0
activation uses existing replace stacking rule
active multiplier changes marketCompetition score/share
expiry restores unmodified share
history/lifecycle stores cloned target + explanation evidence
```

`marketCompetition.ts` filters `game.events.activeModifiers` with the existing active-on-day helper and multiplies all matching competitor-attraction modifiers for the specific competitor.

Do not add this effect to `SimulationRules`.

- [ ] **Step 4: Extend event target/effect validation and clone logic**

Update all exhaustive switches in target/effect/definition/modifier/persistence code. Keep target legality explicit:

```text
company -> import-cost multiplier only
recurring-route -> route effects only
competitor -> competitor-attraction multiplier only
```

Immediate competitor effects also require `decision.target.kind === 'competitor'`.

- [ ] **Step 5: Author one production `rival-promotion` event**

Add exactly this first catalog entry shape:

```ts
{
  id: 'rival-promotion',
  version: 1,
  selection: { kind: 'weighted', weight: 1 },
  condition: { kind: 'always' },
  target: { kind: 'competitor', status: 'active' },
  expiresAfterDays: 2,
  cooldownDays: 7,
  copy: { key: 'events.rivalPromotion', params: {} },
  options: [
    {
      id: 'counter-promote',
      effects: [
        { kind: 'cash-adjust', amount: -1_200 },
        { kind: 'score-adjust', score: 'marketPosition', amount: 2 }
      ],
      modifiers: [sharedPromotionModifier]
    },
    {
      id: 'differentiate',
      effects: [{ kind: 'score-adjust', score: 'customerSatisfaction', amount: 2 }],
      modifiers: [sharedPromotionModifier]
    },
    {
      id: 'hold-course',
      effects: [],
      modifiers: [sharedPromotionModifier]
    }
  ]
}
```

The shared modifier is:

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

All three options carry the same rival promotion because the rival action has already occurred; options only change the player's response.

Do not add launch/closure/reposition production catalog entries yet. Their typed effects are covered by unit tests and available for later events.

- [ ] **Step 6: Add localized target/event copy**

Add English/Japanese/Traditional Chinese copy for the new production event, three options, modifier explanation, and competitor target labels using the existing game-copy structure. Do not persist localized strings in event or market state.

- [ ] **Step 7: Run event integration gates**

```bash
bun run test:unit -- --run \
  src/lib/game/eventTargets.spec.ts \
  src/lib/game/eventEffects.spec.ts \
  src/lib/game/eventDefinitions.spec.ts \
  src/lib/game/eventModifiers.spec.ts \
  src/lib/game/eventSelection.spec.ts \
  src/lib/game/marketCompetition.spec.ts \
  src/lib/persistence/saveCodec.spec.ts
bun run check
bun run test:unit -- --run
```

Expected: PASS before UI work starts.

- [ ] **Step 8: Commit**

```bash
git add src/lib/game src/lib/i18n src/lib/persistence/saveCodec.ts src/lib/persistence/saveCodec.spec.ts

git commit -m "feat(events): add rival market actions"
```

---

### Task 5: Expose brands, market evidence, and rival presence through existing UI/map surfaces

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
- Modify: `src/routes/gameRouteController.ts` only if the current product-update transition needs an explicit brand capability flag; otherwise keep using the existing product patch route
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`

- [ ] **Step 1: Run the required Svelte MCP documentation workflow before editing Svelte**

Per `AGENTS.md`:

```text
1. list-sections
2. fetch all relevant Svelte 5/runes/form-control/component documentation
3. edit components using runes-mode patterns
4. run svelte-autofixer on every changed Svelte snippet until no issues remain
```

Do not start the Svelte edit first and backfill this step later.

- [ ] **Step 2: Write RED brand-control component tests**

For `StoreStockTable` / `StoreDetailModal`, assert:

```text
Brand column renders current brand
select options exactly equal getSupportedBrands(productId)
known unsupported brand is absent
changing brand emits onUpdate(storeId, productId, { brandId })
scenario-disabled state disables the control and does not emit
latest-report evidence shows selected brand, branded customer price, per-unit cost, and gross margin
```

Use the existing `StoreProductPatch` callback; do not add a parallel brand-specific route mutation if the current callback is sufficient.

- [ ] **Step 3: Add the Brand column to existing stock detail**

Keep one row per product. Add a compact select beside the existing configured price/inventory controls. Resolve labels from brand catalog/i18n helpers, not a component-local brand table.

In sandbox, the existing `setGameAndAutosave` mutation path persists the change. During an active scenario, thread an explicit `canUpdateBrand`/existing disabled reason from the route so brand control is inert without adding a scenario command.

Do not add a new Store Detail tab.

- [ ] **Step 4: Write RED Reports component tests**

Pin two new derived sections from the latest report:

```text
Brand performance -> grouped units, revenue, gross margin, weighted customer response
Market -> city/product player share, delta, strongest rival, reputation, price posture, focus, compatible brands, active promotion multiplier
no market report -> section omitted/neutral without fabricated data
closed historical rival remains explainable by report + current rival lookup fallback
```

- [ ] **Step 5: Add the two Reports sections**

Use typed `DailyProductReport` / `DailyMarketReport` evidence and the existing optional `game` prop to resolve current brand/rival names. Keep localization in UI/game-copy helpers; do not preformat explanation strings in the game domain.

Do not add historical charting, filters, or another report dashboard in HPA-39.

- [ ] **Step 6: Write RED retail-map snapshot/renderer tests**

Extend `CityMapSnapshot` with:

```ts
export interface CityMapCompetitorRender {
  id: string;
  name: string;
  archetypeId: ArchetypeId;
  x: number;
  y: number;
  status: 'active' | 'closed';
}
```

Assert:

```text
active-city snapshot includes only that city's competitors
closed competitors may remain in snapshot only if renderer contract needs status; renderer emits no marker for closed
competitor coordinates do not mark tiles owned
placement preview valid/invalid sets are unchanged when rivals exist
Phaser canvas exposes data-competitor-marker-count
2 active starter rivals -> marker count 2
closing one rival -> marker count 1
terrain key/camera key does not include competitor state
```

- [ ] **Step 7: Render lightweight non-interactive rival markers**

Reuse Phaser graphics (`markerGraphics` or a dedicated rival graphics object) to draw a small visually distinct marker at rival coordinates. Use archetype/name only for accessible/debug metadata; do not load new image assets and do not add pointer interaction.

Rivals must not enter:

```text
getOccupiedStoreTileIds
ownership outlines
placement previews
store sprite lists
terrain key
```

No change to `IndustryMapSnapshot` or `industryMapScene.ts`.

- [ ] **Step 8: Complete localization and route wiring**

Add brand names/position labels, Brand column/input labels, brand evidence, market section labels/factors, and any accessible rival-marker copy to all three locales.

Keep the route change minimal: pass the brand-update capability and current game/report data through existing component props. Avoid a new top-level state variable unless the current route truly needs one.

- [ ] **Step 9: Run focused UI/map gates**

```bash
bun run test:unit -- --run --project client \
  src/lib/components/game/StoreStockTable.svelte.spec.ts \
  src/lib/components/game/StoreDetailModal.svelte.spec.ts \
  src/lib/components/game/ReportsPanel.svelte.spec.ts \
  src/lib/components/game/CityMap.svelte.spec.ts
bun run test:unit -- --run \
  src/lib/game/mapRender.spec.ts \
  src/lib/phaser/cityMapScene.spec.ts
bun run check
```

Run the Svelte autofixer again after the final component edits and address every reported issue before committing.

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

- [ ] **Step 1: Add a deterministic rival-promotion fixture helper**

Mirror the existing `selectProductionSupplierEvent` pattern. Add a helper that scans event seeds to select the production `rival-promotion` decision against a known starter competitor, with a bounded fixed search performed in test setup.

The helper may inject a prepared `GameState`/save record directly through existing browser-save helpers. It must not advance the UI until an event happens.

- [ ] **Step 2: Add the brand + rival visibility E2E flow**

Using the normal sandbox UI and current save storage:

```text
start/load a deterministic game
wait for retail canvas settled attributes
assert data-competitor-marker-count = 2
open Store Detail stock tab
change bottled-water from Common Ground to Budget Bay
assert autosave contains brandId budget-bay
reload
assert the selected brand persisted
advance exactly one day
open Reports
assert brand performance and market factor evidence are visible
```

Use stable accessible labels/test IDs. Do not inspect Phaser internals beyond the established canvas `data-*` contract.

- [ ] **Step 3: Add the fixed rival-promotion lifecycle E2E**

Inject/select a deterministic `rival-promotion` decision and capture the baseline market share for the targeted product/rival.

Then:

```text
resolve one known option
advance exactly one closing day -> modifier active and market report shows event multiplier 1.18 / reduced player share
advance the remaining fixed days through the 3-day duration
assert modifier lifecycle reports expiry
assert subsequent market report has event multiplier 1 and share recovers relative to the promoted state
```

Do not assert exact share equality if another authored state term changed between days; use a fixture with stable rival/player state and assert the deterministic expected direction/numeric share for that fixture where practical.

- [ ] **Step 4: Run targeted E2E first**

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "living market|rival promotion"
```

Expected: PASS repeatedly without polling/advance-until-trigger behavior.

- [ ] **Step 5: Run full final verification**

```bash
bun run test:unit -- --run
bun run check
bun run lint
bun run test:e2e -- src/routes/retail-sim.e2e.ts
bun run test
```

If a full-suite failure is caused by declared balance changes (removed hidden competition or brand/rival economics), update the fixture/expectation to the new explicit model and document the reason in the test. Do not restore legacy behavior to make an old number green.

- [ ] **Step 6: Audit the final scope and diff**

```bash
rg -n "competition:" src
rg -n "SAVE_SCHEMA_VERSION" src/lib/persistence
rg -n "competitor-attraction-multiplier|competitor-status-set|competitor-price-posture-set|competitor-product-focus-set" src
rg -n "brandId" src/lib/game src/lib/components src/lib/persistence

git diff --check
git status --short
git diff --stat main...HEAD
```

Expected:

```text
no persisted/live Store.competition remains
schema 19 is the only current save schema
all competitor event unions have production validators/tests
brand identity flows state -> simulation -> persistence -> UI
no new rival inventory/staffing/finance/logistics subsystem
no new game-art asset files
```

- [ ] **Step 7: Commit final tests/fixes**

```bash
git add src

git commit -m "test(market): cover living market flows"
```

- [ ] **Step 8: Prepare the one HPA-39 PR for review**

Update the existing planning draft PR rather than opening another PR. Summarize:

```text
brand catalog + per-product assortment
explicit brand price/demand/cost/customer response
hidden competition scalar removed
2 deterministic lightweight rivals per retail city
live/planner market-share integration
rival typed events + timed promotion lifecycle
schema 19 strict persistence
existing store/report/map UI
unit/component/E2E verification results
```

Mark the same PR ready only after all commands in Step 5 pass and the diff still matches HPA-39 non-goals.
