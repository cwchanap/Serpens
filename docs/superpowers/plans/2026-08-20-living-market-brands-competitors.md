# Living Market Brands and Lightweight Competitors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Implement behavior changes test-first. The six tasks below are checkpoints inside one HPA-39 PR, not separate PRs.

**Goal:** Implement one brand per existing store-product row plus deterministic lightweight sandbox competitors, explicit market share, rival event actions, existing-surface UI, and strict schema-19 persistence without a second simulator or second shelf-price contract.

**Architecture:** `brands.ts` owns static family compatibility and brand economics. `stock.ts` owns the shared branded player-seller score. `competitors.ts` owns deterministic sandbox rival identity. `marketCompetition.ts` is a pure slice-based resolver over city competitors + active modifiers + product + player-attraction number + day. `StoreProduct.sellingPrice` stays authoritative. Existing authored scenarios keep default brands but explicitly stay rival-free.

**Tech:** TypeScript 6, SvelteKit/Svelte 5, Phaser 4, Vitest 4, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-08-20-living-market-brands-competitors-design.md`

## Global constraints

- One implementation PR for HPA-39.
- One brand per existing `StoreProduct`; no per-brand lots/SKUs.
- Brand support is by `ProductFamilyId`, not hand-maintained product arrays.
- `sellingPrice` is the sole shelf price. Brand `priceMultiplier` writes a default only on create/brand-change.
- Brand editing is sandbox-only through an explicit route-controller mutation with no `ScenarioCommand`.
- Existing authored scenarios preserve default brands and use `competitors: []`.
- Do not modify `src/lib/scenarios/capabilities.ts` just to represent a non-command brand mutation; use route `MutationAvailability`.
- Keep legacy `Store.competition` through Task 2; remove it in Task 3 in the same checkpoint that explicit rival share replaces it.
- No ghost RNG draw for compatibility.
- Sandbox rival generation uses a derived local RNG and never changes `GameState.rngState`.
- Market resolver takes state slices, not `GameState`, and must not import `stock.ts`.
- Callers compute `playerAttractionScore` using the exported `brandedSellerScore`.
- Apply rival share to the city/product pool before HPA-41 per-seller policy demand.
- Do not restore HPA-41 residual-demand capping.
- Timed rival promotion reads active modifiers directly; do not widen `SimulationRules`.
- Use closed target/effect unions only.
- Daily reports persist IDs and day-specific outcomes, not repeated static catalog/current-state fields.
- Schema 19 rejects 18; no migration.
- `scenarioCodec.ts` production code is expected to remain unchanged because it already imports `SAVE_SCHEMA_VERSION` and delegates current-game validation; update tests/fixtures unless implementation proves a real production edit is required.
- `bun run check` is the primary required-field/fixture audit.
- Before any Svelte edit, follow `AGENTS.md`: Svelte MCP `list-sections`, relevant docs, then autofixer until clean.

## Risks to pin

1. **Double price:** never multiply player-entered `sellingPrice` by brand price at sale time.
2. **Premium ratchet:** brand quality must pull reputation toward a target, not add +2/+3 forever.
3. **Double competition:** legacy hidden pressure must disappear exactly when named rival share lands.
4. **RNG churn:** removing the legacy competition draw shifts downstream seeded values; pay that churn once in Task 3.
5. **Import accounting:** branded unit cost must reconcile retail COGS, report `importCost`, weekly import spend, and event import multipliers.
6. **Planner/live drift:** planner stays trend/jitter/obsolescence/markdown-free but reuses branded seller score and current rival share.
7. **Scenario drift:** scenario setup must preserve brand identity and explicitly clear rivals; approved scenario reference/objective tests rerun after Task 3.
8. **Dependency cycle:** `stock.ts` may import `marketCompetition.ts`; `marketCompetition.ts` therefore receives player-attraction as a number and never imports `stock.ts`.
9. **Report growth:** avoid repeated reputation/posture/focus/brand arrays in daily market rows.
10. **Map leakage:** rival marker coordinates never affect occupied tiles or placement validity.

---

## Task 1 — Brand identity, family compatibility, scenario preservation, schema 19

**Create:**
- `src/lib/game/brands.ts`
- `src/lib/game/brands.spec.ts`
- optionally `src/lib/game/stock.testUtils.ts` as the narrow shared store-product fixture helper described below

**Modify:**
- `src/lib/game/types.ts`
- `src/lib/game/products.ts`
- `src/lib/game/stock.ts`
- `src/lib/game/stock.spec.ts`
- `src/lib/scenarios/setup.ts`
- `src/lib/scenarios/setup.spec.ts`
- `src/lib/persistence/saveTypes.ts`
- `src/lib/persistence/saveCodec.ts`
- `src/lib/persistence/saveCodec.spec.ts`
- `src/lib/persistence/scenarioCodec.spec.ts` and scenario persistence fixtures only where schema expectations are explicit
- additional compile-failing fixtures found by `bun run check`

Do **not** change `scenarioCodec.ts` production code unless implementation proves it necessary; it already imports `SAVE_SCHEMA_VERSION` and delegates embedded game validation to `validateCurrentGameState`.

### Interfaces

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
  quality: number;
  loyaltyMultiplier: number;
  availabilityMultiplier: number;
  priceMultiplier: number;      // default write-through only
  demandMultiplier: number;
  unitCostMultiplier: number;
}
```

`ProductDefinition` gains required `defaultBrandId: BrandId`.

`StoreProduct` gains required `brandId: BrandId`.

`StoreProductPatch` gains internal optional `brandId?: BrandId`.

### Step 1: Write RED brand-catalog tests

Pin:

```text
Common Ground -> all current families, neutral multipliers
Budget Bay -> beverages + convenience-goods + grocery-food
Northstar Select -> fashion + electronics
Fresh Field -> grocery-food
all supported families are known and unique
default brand supports every current product family
at least one product family exposes 3 brands
known unsupported pair is rejected
all multipliers finite and > 0
quality in 0..100
```

```bash
bun run test:unit -- --run src/lib/game/brands.spec.ts
```

Expected RED: brand contracts do not exist.

### Step 2: Implement family compatibility and default-price helper

`brands.ts`:

```ts
getBrandDefinition(id): BrandDefinition
getSupportedBrands(productId): readonly BrandDefinition[]
isBrandSupported(productId, brandId): boolean
getBrandDefaultSellingPrice(product, brandId): number
```

`isBrandSupported` resolves the product definition and checks its `familyId` against `supportedFamilyIds`.

```ts
Math.max(1, Math.round(product.defaultSellingPrice * brand.priceMultiplier));
```

All current products use `defaultBrandId: 'common-ground'`.

### Step 3: Make brand identity part of the existing row

`createStoreProduct`:

```ts
brandId: product.defaultBrandId,
sellingPrice: getBrandDefaultSellingPrice(product, product.defaultBrandId),
```

`updateStoreProduct` rules:

```text
unsupported brand -> original game
supported brand -> update brandId
brand changed and no explicit sellingPrice in same patch -> write new brand default once
later price-only patches remain direct
```

Pin default inheritance, level-unlock inheritance, brand-change write-through, later direct price edit, and unsupported no-op.

### Step 4: Preserve scenario default brands without new authored fields

Current scenario overrides reconstruct product rows. Change that path to spread the already-materialized product and replace only the authored fields:

```ts
{
  ...product,
  lots: patch.stock > 0 ? [{ receivedDay: game.day, quantity: patch.stock }] : [],
  reorderThreshold: patch.reorderThreshold,
  targetStock: patch.targetStock,
  sellingPrice: patch.sellingPrice
}
```

Do not add `brandId` to `ScenarioStartBlueprint`, catalog product rows, or `ScenarioCommand`.

Add `setup.spec.ts` coverage that a product override preserves the materialized default brand.

### Step 5: Move save schema to 19 for brand identity

Set `SAVE_SCHEMA_VERSION = 19`.

Validate:

```text
brandId exists and is known
brand supports product.familyId
```

Schema 18 rejects through the existing wrong-schema path.

Update scenario-codec/repository tests only where they assert the embedded save schema or construct raw current-game records.

### Step 6: Let the compiler drive the fixture blast radius

Do not rely on typed-literal greps as the primary audit.

Run:

```bash
bun run check
```

Fix every required `brandId` error. Prefer existing production creators (`createStoreProduct`, `initializeStoreProducts`) in tests.

If repeated raw `StoreProduct` literals dominate failures, add a **narrow** `src/lib/game/stock.testUtils.ts` helper built from `createStoreProduct(productId, receivedDay)` plus overrides. Keep malformed persistence tests explicit. Do not add a generic `makeGameState` factory solely to silence required-field checks.

Secondary inventory scan:

```bash
rg -n "reorderThreshold:" src --glob '*spec.ts' --glob '*test.ts'
```

### Step 7: Verify checkpoint

```bash
bun run test:unit -- --run \
  src/lib/game/brands.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/scenarios/setup.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/persistence/scenarioCodec.spec.ts
bun run check
bun run test:unit -- --run
```

### Step 8: Commit

```bash
git add src
git commit -m "feat(market): add product brands"
```

---

## Task 2 — Brand economics, shared seller score, convergent customer response

**Modify:**
- `src/lib/game/brands.ts`
- `src/lib/game/brands.spec.ts`
- `src/lib/game/stock.ts`
- `src/lib/game/stock.spec.ts`
- `src/lib/game/retailSupply.ts`
- `src/lib/game/retailSupply.spec.ts`
- `src/lib/game/simulateDay.ts`
- `src/lib/game/simulateDay.spec.ts`
- `src/lib/game/supplyPlanner.ts`
- `src/lib/game/supplyPlanner.spec.ts`
- `src/lib/game/types.ts`

Keep `Store.competition` intact in this checkpoint.

### Interfaces

```ts
export interface BrandEconomics {
  unitCost: number;
  demandMultiplier: number;
  marketAttractionMultiplier: number;
}

export function resolveBrandEconomics(
  product: ProductDefinition,
  brandId: BrandId
): BrandEconomics;

export function brandedSellerScore(store: Store, productId: ProductId): number;
```

`DailyProductReport` gains only:

```ts
brandId: BrandId;
```

`DailyStoreReport` gains:

```ts
brandReputationAdjustment: number;
```

### Step 1: RED exact brand-economics tests

Pin:

```text
unitCost = product.importCost * unitCostMultiplier
marketAttraction = loyaltyMultiplier * availabilityMultiplier
demandMultiplier from catalog
no customerPrice output
```

### Step 2: Export one branded seller score while retaining legacy competition for now

Refactor current private seller scoring so Task 2 behavior is:

```text
existing seller score, including Store.competition
* selected brand marketAttractionMultiplier
```

Use it in:

- `simulateProductSalesForCity`;
- `getPolicyAdjustedCityProductDemand` / Supply Planner path.

Do not add a market resolver yet.

### Step 3: Apply brand demand/cost without a second price

Live:

```text
seller share = branded score / total branded score
policyDemand = sellerPolicyDemand(raw/trend pool, share, policy)
desiredUnits = policyDemand
  * brand.demandMultiplier
  * obsolescenceMultiplier
  * priceDemandMultiplier(definition, storeProduct.sellingPrice)
  * existing jitter
revenue uses storeProduct.sellingPrice + existing markdown
COGS uses brand.unitCost
```

Exactly one existing jitter draw remains per eligible seller.

### Step 4: Compose branded retail import cost once

Weekly replenishment:

```text
baselineCost = importedUnits * brand.unitCost
actualSpend = round(baselineCost * existing event import-cost multiplier)
```

`DailyProductReport.importCost` is the selected brand unit cost. Local warehouse value stays material-based.

Pin a non-neutral brand + active supplier modifier fixture to prove one composition.

### Step 5: Persist only brand identity and derive a convergent reputation response

Every created product report gets `brandId`; existing price/import/margin fields carry the rest.

At store close:

```text
totalSold = sum(unitsSold)
weightedBrandQuality = totalSold > 0
  ? sum(unitsSold * getBrandDefinition(brandId).quality) / totalSold
  : null
brandReputationAdjustment = weightedBrandQuality === null
  ? 0
  : clamp(-3, 3, round((weightedBrandQuality - profile.reputation) / 10))
endingReputation = clampScore(profile.reputation + brandReputationAdjustment)
```

Tests:

```text
premium quality above current reputation -> small positive delta
quality below current reputation -> negative delta
reputation near quality -> zero/small convergence, no ratchet
zero sales -> zero delta
repeated stable fixture approaches quality rather than pinning to 100
```

### Step 6: Make planner brand-aware without live-only dynamics

Planner seller share uses the same `brandedSellerScore`; seller contribution includes brand `demandMultiplier`.

Planner still excludes trend, jitter, obsolescence, markdown, and future events.

### Step 7: Verify

```bash
bun run test:unit -- --run \
  src/lib/game/brands.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/supplyPlanner.spec.ts
bun run check
bun run test:unit -- --run
```

### Step 8: Commit

```bash
git add src/lib/game
git commit -m "feat(market): apply brand economics"
```

---

## Task 3 — Competitors, explicit market share, hidden-competition replacement, scenario re-verification

**Create:**
- `src/lib/game/competitors.ts`
- `src/lib/game/competitors.spec.ts`
- `src/lib/game/marketCompetition.ts`
- `src/lib/game/marketCompetition.spec.ts`

**Modify:**
- `src/lib/game/types.ts`
- `src/lib/game/state.ts`
- `src/lib/game/world.ts`
- `src/lib/game/stock.ts`
- `src/lib/game/stock.spec.ts`
- `src/lib/game/simulateDay.ts`
- `src/lib/game/simulateDay.spec.ts`
- `src/lib/game/supplyPlanner.ts`
- `src/lib/game/supplyPlanner.spec.ts`
- `src/lib/game/reports.ts` / `.spec.ts` only if a latest-report helper is actually needed
- `src/lib/persistence/saveCodec.ts`
- `src/lib/persistence/saveCodec.spec.ts`
- `src/lib/scenarios/setup.ts`
- `src/lib/scenarios/setup.spec.ts`
- `src/lib/scenarios/catalog.spec.ts`
- `src/lib/scenarios/runtime.spec.ts`
- `src/lib/scenarios/validation.spec.ts`
- `src/lib/scenarios/catalog.ts` only if a failing approved reference trace proves a balance threshold must change
- compile-failing fixtures discovered by `bun run check`

`scenarioCodec.ts` production code is not on the expected edit list.

### Step 1: RED deterministic competitor tests

Pin:

```text
2 rivals for opened/materialized sandbox Harbor
same seed/city -> deep equal
main rngState unchanged
stable IDs + canonical order
1-2 unique known family focuses
compatible brand mix
location valid but never player-owned
initializer idempotent
industry/unopened/non-materialized -> same game
opening second sandbox retail city adds only its 2 rivals
```

Generation seed:

```text
normalizeSeed(game.seed + worldCity.seed * 37 + 39_039)
```

### Step 2: Add `GameState.competitors` and sandbox lifecycle

`createNewGame` initializes Harbor rivals after founding-store placement.

`openWorldCity` initializes after a new sandbox retail map is materialized.

Update save validation for competitor identity/canonical ordering, but do not require scenarios to contain rivals.

### Step 3: RED pure market resolver tests with no full GameState fixture

Signature:

```ts
resolveProductMarketShare(
  cityCompetitors: readonly MarketCompetitor[],
  modifiers: readonly ActiveEventModifier[],
  product: ProductDefinition,
  playerAttractionScore: number,
  day: number
): MarketShareResolution
```

Hand-author only rivals/modifiers/product. Pin:

```text
[] rivals -> playerShare 1 when player attraction > 0
closed rival excluded
higher reputation lowers player share
focus lowers player share versus unfocused
aggressive price posture responds to priceSensitivity
compatible specialist brand changes attraction
shares sum to 1 within tolerance
rival rows ID-sorted
```

`marketCompetition.ts` may import brands/archetypes/event-modifier helpers; it must not import `stock.ts`.

### Step 4: Wrap live/planner demand with current market share

Caller flow:

```text
cityCompetitors = game.competitors.filter(city)
playerAttraction = sum(brandedSellerScore)
market = resolveProductMarketShare(cityCompetitors, activeModifiers, productDefinition, playerAttraction, day)
companyPool = existing pool * market.playerShare
sellerShare = brandedSellerScore / playerAttraction
```

Live retains Task 2 brand/price/jitter logic. Planner uses current share over its existing trend-free pool.

### Step 5: Delete hidden competition now, beside its replacement

Remove `Store.competition` from:

- `Store` type;
- `createStore` random draw;
- `brandedSellerScore` base term;
- store `marketPosition` base;
- operating-cost formula;
- save validation;
- fixtures.

No dummy RNG draw.

Run `bun run check` immediately and update seeded fixtures once here rather than in Task 1 and again here.

### Step 6: Add visible-share marketPosition

`buildDailyStoreReport` receives/looks up current market rows for products the store actually sells:

```text
shares = matching current market playerShare values
meanPlayerShare = shares.length ? mean(shares) : null
shareAdjustment = meanPlayerShare === null ? 0 : clamp(-10, 10, round((meanPlayerShare - 0.50) * 20))
marketPosition = clampScore(profile.marketPosition + shareAdjustment)
```

Pin direction and bounds.

### Step 7: Persist thin market evidence

```ts
interface DailyMarketCompetitorReport {
  competitorId: string;
  share: number;
  attractionScore: number;
  eventMultiplier: number;
}

interface DailyMarketReport {
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

Do not copy competitor reputation, posture, focus, or brand IDs into every report row.

`playerShareDelta` compares the latest completed row with matching `(cityId, productId)`; missing prior row -> `null`.

Save validation checks ranges, finite scores, references, and canonical order only for persisted fields.

### Step 8: Normalize authored scenarios to rival-free and re-verify balance

Because `createFoundingGameAtTile` flows through `createNewGame`, scenario setup must explicitly clear sandbox rivals after materializing the scenario world:

```ts
game = { ...game, competitors: [] };
```

Pin in `setup.spec.ts` that all three authored scenario starts have no competitors.

Then run the authored scenario gates after hidden competition is removed:

```bash
bun run test:unit -- --run \
  src/lib/scenarios/setup.spec.ts \
  src/lib/scenarios/catalog.spec.ts \
  src/lib/scenarios/runtime.spec.ts \
  src/lib/scenarios/validation.spec.ts
```

Verify first-profit, import-squeeze, and local-lifeline reference/objective paths remain reachable/sensible. Only if a current approved reference trace fails because the hidden competition balance changed, minimally update `catalog.ts` threshold/fixture and pin the new number. Do not introduce scenario rivals to recover legacy results.

### Step 9: Full market checkpoint

```bash
bun run test:unit -- --run \
  src/lib/game/competitors.spec.ts \
  src/lib/game/marketCompetition.spec.ts \
  src/lib/game/stock.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/supplyPlanner.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/scenarios/setup.spec.ts \
  src/lib/scenarios/catalog.spec.ts \
  src/lib/scenarios/runtime.spec.ts
bun run check
bun run test:unit -- --run
```

### Step 10: Commit

```bash
git add src
git commit -m "feat(market): add lightweight competitors"
```

---

## Task 4 — Typed rival events and timed promotion

**Modify:**
- `src/lib/game/types.ts`
- `src/lib/game/eventTargets.ts` / `.spec.ts`
- `src/lib/game/eventEffects.ts` / `.spec.ts`
- `src/lib/game/eventDefinitions.ts` / `.spec.ts`
- `src/lib/game/eventModifiers.ts` / `.spec.ts`
- `src/lib/game/eventSelection.ts` / `.spec.ts`
- `src/lib/game/eventCatalog.ts`
- `src/lib/game/marketCompetition.ts` / `.spec.ts`
- `src/lib/components/game/ActiveModifiers.svelte` / `.spec.ts`
- `src/lib/i18n/gameCopy.ts`
- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`
- `src/lib/persistence/saveCodec.ts` / `.spec.ts`
- scenario persistence tests if new event union fixtures require updates

### Step 1: Required Svelte workflow before editing ActiveModifiers

Run Svelte MCP documentation discovery first; autofix final component until clean.

### Step 2: RED competitor target tests

Pin active/closed selectors, ID order, closure resolvability, unknown rejection, target cloning/equality, and target copy params.

### Step 3: RED immediate effect tests

Closed unions:

```ts
{ kind: 'competitor-status-set'; status: 'active' | 'closed' }
{ kind: 'competitor-price-posture-set'; pricePosture: CompanyPolicy['pricing'] }
{ kind: 'competitor-product-focus-set'; productFocus: ProductFamilyId[] }
```

Resolve synthetic decisions through normal `resolveDecision`.

Assert wrong target kind/unknown rival/invalid posture/focus rejects atomically. Focus must be exactly 1–2 unique known families and stored canonically.

### Step 4: RED timed modifier tests

```ts
{ kind: 'competitor-attraction-multiplier'; multiplier: number }
```

Pin:

```text
valid only for competitor target
finite positive multiplier
replace stacking works per concrete rival target
active multiplier changes resolver share
expiry restores unmodified share
```

### Step 5: Extend every exhaustive consumer

At minimum:

```text
event target clone/equality/copy
modifier clone/snapshot/validation
definition validation
save validation
ActiveModifiers.svelte presentation
```

`ActiveModifiers` shows competitor target + localized structured explanation/multiplier and does not attempt route-effective-value resolution.

Do not add competitor state to `SimulationRules`.

### Step 6: Author one two-option production event

`rival-promotion` weighted event, active competitor target, 7-day cooldown.

Both options carry the same 3-day modifier:

```ts
{
  durationDays: 3,
  stackingKey: 'rival-promotion:market-attraction',
  stackingRule: 'replace',
  effect: { kind: 'competitor-attraction-multiplier', multiplier: 1.18 },
  importance: 'important',
  ...
}
```

Responses:

```text
counter-promote -> cash -1200, company marketPosition +2
differentiate -> customerSatisfaction +2
```

No dominated hold-course option. Launch/closure/reposition remain unit-tested effect primitives only.

### Step 7: Localize and verify

```bash
bun run test:unit -- --run \
  src/lib/game/eventTargets.spec.ts \
  src/lib/game/eventEffects.spec.ts \
  src/lib/game/eventDefinitions.spec.ts \
  src/lib/game/eventModifiers.spec.ts \
  src/lib/game/eventSelection.spec.ts \
  src/lib/game/marketCompetition.spec.ts \
  src/lib/persistence/saveCodec.spec.ts
bun run test:unit -- --run --project client src/lib/components/game/ActiveModifiers.svelte.spec.ts
bun run check
bun run test:unit -- --run
```

### Step 8: Commit

```bash
git add src
git commit -m "feat(events): add rival promotion"
```

---

## Task 5 — Brand mutation, Reports, and rival map markers

**Modify:**
- `src/routes/gameRouteController.ts` / `.spec.ts`
- `src/routes/+page.svelte`
- `src/routes/page.svelte.spec.ts` if route availability/wiring coverage lives there
- `src/lib/components/game/StoreStockTable.svelte` / `.spec.ts`
- `src/lib/components/game/StoreDetailModal.svelte` / `.spec.ts`
- `src/lib/components/game/ReportsPanel.svelte` / `.spec.ts`
- `src/lib/game/mapRender.ts` / `.spec.ts`
- `src/lib/components/game/CityMap.svelte.spec.ts`
- `src/lib/phaser/cityMapScene.ts` / `.spec.ts`
- `src/lib/i18n/gameCopy.ts`
- three locale message files

### Step 1: Required Svelte workflow

Before Svelte edits: `list-sections`, relevant docs, then autofixer after each final component edit.

### Step 2: Add explicit sandbox brand mutation and availability

`MutationAvailability` gains:

```ts
updateStoreProductBrand: boolean;
```

`createMutationAvailability` sets it to `input.playMode === 'sandbox'`.

Controller:

```ts
updateStoreProductBrand(storeId, productId, brandId) {
  return this.commitMutation({
    transition: (game) => updateStoreProduct(game!, storeId, productId, { brandId }),
    cueId: 'sfx.stock.edit'
  });
}
```

No `ScenarioCommand`; no change to `src/lib/scenarios/capabilities.ts`.

### Step 3: Brand UI tests + implementation

Explicit callback chain:

```text
StoreStockTable -> StoreDetailModal -> +page.svelte -> controller.updateStoreProductBrand
```

Pin:

```text
current brand renders
options exactly match getSupportedBrands(productId)
unsupported family brand absent
change emits explicit brand callback
scenario mode disables brand selector
report row still shows existing shelf/effective price and margin
```

Keep one table row per product; no new detail tab.

### Step 4: Reports UI over thin evidence

Brand section groups latest `DailyProductReport`s by `brandId` and uses existing units/revenue/grossMargin. Show store-level `brandReputationAdjustment` as the day’s customer-response evidence.

Market section shows player share/delta and strongest rival `competitorId` + share + attraction + event multiplier. If the current rival still exists, resolve its name/profile from `game.competitors` as **current context**; do not require duplicated historical profile fields.

No charts/history filters.

### Step 5: Map snapshot/renderer RED tests

Add `CityMapCompetitorRender` with ID/name/archetype/coordinates/status only as required for rendering.

Pin:

```text
snapshot includes current retail city's active rivals
closed rivals render no marker
rivals do not mark tiles owned
placement preview unchanged
terrain/camera key unchanged by rivals
canvas data-competitor-marker-count
starter sandbox 2 -> count 2
close one -> count 1
scenario competitors [] -> count 0
```

### Step 6: Render non-interactive rival markers

Reuse marker/dataset patterns. Do not add sprites/assets, selection, inspector, ownership, or placement participation.

### Step 7: Focused verification

```bash
bun run test:unit -- --run src/routes/gameRouteController.spec.ts src/routes/page.svelte.spec.ts
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

Run Svelte autofixer again and resolve all findings.

### Step 8: Commit

```bash
git add src
git commit -m "feat(ui): expose brands and rival market"
```

---

## Task 6 — Deterministic E2E and final verification

**Modify:**
- `src/routes/retail-sim.e2e.ts`
- only production/test files required by real final failures

### Step 1: Add deterministic rival-event helper

Mirror existing bounded event-seed selection helpers. Select `rival-promotion` against a known starter sandbox competitor; never advance until random selection occurs.

### Step 2: Brand + rival sandbox flow

```text
load deterministic sandbox
canvas rival-marker count = 2
open Store Detail
change bottled-water brand
assert autosave brandId + write-through sellingPrice
reload -> brand and sellingPrice persist
advance one fixed day
Reports show brand and market evidence
```

### Step 3: Rival promotion lifecycle

Prepare deterministic game/event selection, resolve one response, then advance fixed days through the three-day modifier.

Pin:

```text
active modifier multiplier 1.18
promoted rival lowers player share in controlled fixture
expiry lifecycle appears
next stable report returns to unmodified market share
```

### Step 4: Scenario regression smoke

Run the existing scenario browser/reference flow(s) needed to prove scenario mode remains brand-read-only and rival-free. Do not add scenario rival UI expectations.

### Step 5: Targeted E2E

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "living market|rival promotion|scenario"
```

### Step 6: Full verification

```bash
bun run test:unit -- --run
bun run check
bun run lint
bun run test:e2e -- src/routes/retail-sim.e2e.ts
bun run test
git diff --check
```

### Step 7: Final scope audit

```bash
rg -n "competition:" src
rg -n "customerPrice|brandCustomerPrice" src
rg -n "supportedProductIds" src/lib/game/brands.ts
rg -n "supportedFamilyIds" src/lib/game/brands.ts
rg -n "resolveProductMarketShare" src/lib/game
rg -n "competitor-attraction-multiplier|competitor-status-set|competitor-price-posture-set|competitor-product-focus-set" src
rg -n "updateStoreProductBrand" src/routes
rg -n "SAVE_SCHEMA_VERSION" src/lib/persistence
```

Expected final shape:

```text
no Store.competition
no second shelf-price field
family-based brand support
market resolver takes slices and marketCompetition.ts does not import stock.ts
scenario starts have competitors []
DailyProductReport adds brandId only
thin market competitor rows
no rival inventory/staffing/finance/logistics/land
no new art
schema 19 only
```

### Step 8: Commit and keep the same PR

```bash
git add src
git commit -m "test(market): cover living market flows"
```

Update the existing HPA-39 PR summary and keep it as the one implementation PR. Do not open a second PR.
