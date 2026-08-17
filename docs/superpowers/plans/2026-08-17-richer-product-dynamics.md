# Richer Product Types and Archetype-Specific Dynamics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Implement each behavior change test-first. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement HPA-38 with stable `ProductId`, explicit product→material mapping, FIFO stock lots, deterministic product dynamics, and visible archetype pressure without SKU inventory or per-archetype engines.

**Architecture:** `PRODUCTS` is one typed static catalog. `ProductId` is the runtime identity. `stock.ts`/`retailSupply.ts` keep sales/replenishment ownership; `productDynamics.ts` adds pure arithmetic. `buildCityDemandPools` stays trend-free for planning; sales applies trend once. Schema 17 rejects 16.

**Tech Stack:** TypeScript 6, SvelteKit/Svelte 5, Vitest 4, Playwright, Bun.

## Global constraints

- No runtime `validateProductCatalog()`; TypeScript + `products.spec.ts` enforce authored invariants.
- Keep only catalog `familyId`; no family registry/behavior/UI.
- Drop unused `baseDemand`/`margin`.
- Retail `drinks` -> `soft-drinks`; finished material `drinks` stays.
- After Task 3, no runtime/persisted `StoreProduct.stock`; lots are the quantity source.
- Deep-copy every `lots` array.
- Replenishment remains every 7 days after sales; production age thresholds are >7.
- Positive event stock adjustment appends a lot at `game.day`; negative adjustment consumes FIFO. Neither is HPA-38 waste/shrink expense.
- `buildCityDemandPools` remains trend-free; sales applies trend once.
- Preserve the existing per-seller RNG call site/order.
- Markdown is revenue-only; markdown + obsolescence use oldest sellable lot age.
- Waste/shrink use `importCost`; freshness is derived, not persisted.
- Store/daily inventory-loss reconciliation is unconditional.
- Schema 17 rejects 16; no migration.
- Reuse existing UI/warnings/art.
- Follow `AGENTS.md` Svelte MCP + `svelte-autofixer` before Svelte edits.

## Risks

1. seeded determinism drift if RNG calls move/add;
2. supply-planner day sensitivity if trend leaks into baseline demand;
3. event/lot bugs at immediate stock adjustment;
4. clone bleed from shared lot arrays.

---

### Task 1: Add the typed product catalog

**Files:** create `products.ts`, `products.spec.ts`; modify `types.ts`.

**Produces**
```ts
ProductId
ProductFamilyId
ProductDefinition
PRODUCTS
getProductDefinition(productId)
```

- [ ] Write RED tests: finished-material mapping, no duplicate archetype product IDs, convenience beverage pair, age thresholds >7.
- [ ] Run:
```bash
bun run test:unit -- --run src/lib/game/products.spec.ts
```
- [ ] Add closed ID unions +:
```ts
export const PRODUCTS: Readonly<Record<ProductId, ProductDefinition>> = { ... };
export function getProductDefinition(id: ProductId): ProductDefinition {
  return PRODUCTS[id];
}
```
Carry only `demandWeight`, `importCost`, `defaultSellingPrice`, `priceSensitivity`; no runtime validator.
- [ ] Start with `dynamics: {}`.
- [ ] Verify/commit:
```bash
bun run test:unit -- --run src/lib/game/products.spec.ts
bun run check
git add src/lib/game/types.ts src/lib/game/products*
git commit -m "feat(products): add typed product catalog"
```

---

### Task 2A: Atomic semantic `ProductId` cut

**Files:** `types.ts`, `archetypes.ts`, `stock.ts`, `retailSupply.ts`, `state.ts`, `worldCatalog.ts`, `world.ts`, product-chain files, `supplyPlanner.ts`, `supplyPlannerActions.ts`, `simulateDay.ts`, retail simulation-rule consumers, `gameArt.ts`, semantic scenario consumers (`setup.ts`, `metrics.ts`, `types.ts`) and focused specs.

**Final semantic shapes**
```ts
StoreArchetype.startingProductIds: readonly ProductId[];
StoreProduct.productId: ProductId; // scalar stock remains until Task 3
DailyProductReport.productId: ProductId;
RetailDemandProfile = Partial<Record<ProductId, number>>;
```

- [ ] Write RED tests for `soft-drinks -> drinks`, Garden Borough `soft-drinks`, supply/product-chain mapping, and global catalog economics independent of seller/archetype order.
- [ ] Replace embedded category definitions with product IDs/unlock order.
- [ ] Rename runtime identity to `productId`; delete `ProductCategory` and first-seller archetype economics lookup.
- [ ] Delete `getFinishedMaterialIdForCategory`; use `productionMaterialId`.
- [ ] Retarget demand/art; reuse `drinks.png`.
- [ ] Scenario field names may temporarily remain `categoryId(s)`, but values/types must already be `ProductId` and runtime lookup must use `productId`.
- [ ] Scan:
```bash
rg "startingCategories|getFinishedMaterialIdForCategory|ProductCategory" src
rg "categoryId" src/lib/game src/lib/assets
bun run check
```
- [ ] Verify/commit:
```bash
bun run test:unit -- --run src/lib/game/products.spec.ts src/lib/game/stock.spec.ts \
  src/lib/game/retailSupply.spec.ts src/lib/game/productChainGraph.spec.ts \
  src/lib/game/productChainTree.spec.ts src/lib/game/supplyPlanner.spec.ts \
  src/lib/assets/gameArt.spec.ts
git add src/lib/game src/lib/assets src/lib/scenarios
git commit -m "refactor(products): use ProductId runtime identity"
```

---

### Task 2B: Rename scenario product vocabulary

**Files:** `src/lib/scenarios/{types,catalog,setup,metrics}.ts`, `src/lib/scenarios/validation/**`, scenario codec/specs.

Rename:
```text
categoryId -> productId
categoryIds -> productIds
productCategoryIds -> productIds
```

- [ ] Adjust scenario validation/codec tests without changing ProductId values/behavior.
- [ ] Rename definitions, diagnostics, query fields, setup overrides, metrics, content allowlists and codec fields. No alias/dual-read path.
- [ ] Verify:
```bash
rg "productCategoryIds|categoryIds|categoryId" src/lib/scenarios src/lib/persistence
bun run test:unit -- --run src/lib/scenarios src/lib/persistence
bun run check
```
- [ ] Commit:
```bash
git add src/lib/scenarios src/lib/persistence
git commit -m "refactor(scenarios): use product vocabulary"
```

---

### Task 3: Replace scalar stock with FIFO lots + schema 17

**Files:** `types.ts`, `stock.ts`, `retailSupply.ts`, `state.ts`, `eventEffects.ts`, `simulateDay.ts`, `alerts.ts`, `gameCopy.ts`, `scenarios/setup.ts`, `cityInventory.testUtils.ts`, scalar-stock Svelte readers including `StoreStockTable.svelte`, e2e fixtures, `saveTypes.ts`, `saveCodec.ts`, focused specs.

**Produces**
```ts
ProductStockLot
getStoreProductStock
consumeStoreProductStock // FIFO
addStoreProductStockLot
SAVE_SCHEMA_VERSION = 17
```

- [ ] RED tests: FIFO totals/partial consume/cleanup, deep-clone independence, stock-health derivation.
- [ ] Implement lot helpers; remove runtime scalar stock.
- [ ] Cover all lot creation sites:
  1. founding -> current/founding day;
  2. level-up unlock -> `game.day`;
  3. replenishment -> `game.day`;
  4. scenario scalar override -> one runtime lot at scenario day;
  5. event positive adjustment -> new lot at `game.day`.
- [ ] Event negative adjustment uses FIFO `consumeStoreProductStock`; add one RED test per sign. Do not add waste/shrink expense.
- [ ] Migrate scalar readers, policy-price/restore clones, test/e2e builders and save stock-health invariants to derived stock/deep lot copies.
- [ ] Before Svelte edits, perform required Svelte MCP docs/autofixer workflow.
- [ ] Bump schema 17; validate positive safe lot quantities, order, dates, product IDs/unlocks; reject 16.
- [ ] Verify risky paths:
```bash
bun run test:unit -- --run src/lib/game/stock.spec.ts src/lib/game/retailSupply.spec.ts \
  src/lib/game/eventEffects.spec.ts src/lib/game/simulateDay.spec.ts \
  src/lib/game/simulateDay.invariants.spec.ts src/lib/persistence/saveCodec.spec.ts \
  src/lib/persistence/saveRepository.spec.ts
bun run check
```
- [ ] Scan/commit:
```bash
rg "\.stock\b|stock:" src/lib/game src/lib/components src/lib/scenarios src/routes
git add src
git commit -m "feat(products): track FIFO stock lots"
```
Inspect matches; unrelated industrial/city inventory or scenario-authoring scalars may remain.

---

### Task 4: Add pure deterministic dynamics

**Files:** create `productDynamics.ts`, `productDynamics.spec.ts`; modify `types.ts`, `products.ts`, `products.spec.ts`.

- [ ] RED tests: shelf-life boundary, shrink, weighted average age, oldest sellable age, triangle trend, obsolescence, markdown, reputation sensitivity.
- [ ] Implement pure optional-field arithmetic; no RNG/DSL/archetype switch.
- [ ] Add conservative representative product dynamics; every production age threshold >7.
- [ ] Verify/commit:
```bash
bun run test:unit -- --run src/lib/game/products.spec.ts src/lib/game/productDynamics.spec.ts
bun run check
git add src/lib/game
git commit -m "feat(products): add deterministic product dynamics"
```

---

### Task 5: Integrate sales trend, aging, stockout and accounting

**Files:** `stock.ts`, `simulateDay.ts`, `retailSupply.ts`, `types.ts`, `supplyPlanner.spec.ts`, relevant report/simulation specs.

- [ ] RED: old lot expires before sales while newer lot remains.
- [ ] Keep `buildCityDemandPools` trend-free.
- [ ] In `simulateProductSalesForCity`, build sales-effective pool = baseline × product/day trend once; initialize `remainingDemand` from it.
- [ ] Add planner regression: changing only `game.day` across trend phase does not change `potentialDemandPerDay`.
- [ ] Apply seller formula: reputation-deviation sensitivity + oldest-lot obsolescence + base-price demand + unchanged jitter.
- [ ] RED markdown: revenue changes, configured/base price and price-demand input do not.
- [ ] RED stockout:
```text
sellableDemand = min(desired, capacity, remainingCityDemand)
stockoutLostDemand = max(0, sellableDemand - stock)
```
- [ ] Add report evidence: waste/shrink/stockout/average age/oldest age/trend/obsolescence/base+effective price/markdown. Do **not** persist freshness.
- [ ] Accounting:
```text
inventoryLossExpense = sum(wasteValue + shrinkValue)
store netIncome = grossMargin - operatingCosts - inventoryLossExpense
daily operatingIncome = grossMargin - operatingCosts - inventoryLossExpense
```
Operating cash flow does not subtract inventory loss. Event stock adjustments remain outside this operating loss.
- [ ] Add fixed-seed same-state/same-report regression.
- [ ] Verify/commit:
```bash
bun run test:unit -- --run src/lib/game/productDynamics.spec.ts src/lib/game/stock.spec.ts \
  src/lib/game/supplyPlanner.spec.ts src/lib/game/simulateDay.spec.ts \
  src/lib/game/simulateDay.invariants.spec.ts
bun run check
git add src/lib/game
git commit -m "feat(products): apply product dynamics to daily sales"
```

---

### Task 6: Tighten schema-17 report validation

**Files:** `saveCodec.ts`, `saveCodec.spec.ts`, persistence fixtures/specs.

- [ ] RED malformed reports: invalid product IDs, negative values, invalid ages, non-finite multipliers/prices, negative markdown, persisted `freshnessPercent`.
- [ ] Add unconditional:
```text
store.inventoryLossExpense == sum(product.wasteValue + product.shrinkValue)
daily.inventoryLossExpense == sum(store.inventoryLossExpense)
```
No conditional “where evidence exists” branch.
- [ ] Verify/commit:
```bash
bun run test:unit -- --run src/lib/persistence/saveCodec.spec.ts src/lib/persistence/saveRepository.spec.ts
bun run check
git add src/lib/persistence
git commit -m "test(persistence): validate product dynamics reports"
```

---

### Task 7: Surface pressure in existing UI

**Files:** `StoreStockTable.svelte`, `StoreDetailModal.svelte`, `ReportsPanel.svelte` + specs; `StoreOverview.svelte` only for final product report vocabulary/read models if needed; warning/i18n files as required.

- [ ] Load required Svelte MCP docs.
- [ ] RED component tests: freshness/waste, markdown/obsolescence, stockout loss, neutral product.
- [ ] Derive historical freshness:
```text
clamp(round((1 - averageAgeDays / shelfLifeDays) * 100), 0, 100)
```
No persisted field.
- [ ] Stock table: derived stock/configured price/one pressure label. Detail: warning summary. Reports: waste/shrink/markdown/stockout/inventory-loss evidence.
- [ ] Run `svelte-autofixer`, then:
```bash
bun run test:unit -- --project client --run \
  src/lib/components/game/StoreStockTable.svelte.spec.ts \
  src/lib/components/game/StoreDetailModal.svelte.spec.ts \
  src/lib/components/game/ReportsPanel.svelte.spec.ts
bun run check
```
- [ ] Commit `feat(ui): surface product pressure`.

---

### Task 8: Tune archetype proofs + one e2e

- [ ] Unit/integration proof:
  - grocery: old produce waste + newer sellable lot;
  - electronics: device obsolescence + markdown;
  - convenience: beverage stockout attribution;
  - boutique: reputation sensitivity changes seller share.
- [ ] Tune catalog data only; no archetype branches.
- [ ] Run unit proof **before** e2e:
```bash
bun run test:unit -- --run src/lib/game/products.spec.ts src/lib/game/productDynamics.spec.ts \
  src/lib/game/stock.spec.ts src/lib/game/simulateDay.spec.ts
```
- [ ] Add/run one deterministic grocery-oriented e2e:
```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "product pressure"
```
- [ ] Commit `test(products): cover archetype dynamics`.

---

### Task 9: Final audit and gate

- [ ] Identity scan:
```bash
rg "startingCategories|getFinishedMaterialIdForCategory|ProductCategory|productCategoryIds" src
```
- [ ] Scalar-stock scan:
```bash
rg "\.stock\b|stock:" src/lib/game src/lib/components src/lib/scenarios src/routes
```
Inspect unrelated/config-only matches.
- [ ] Dynamics branch scan:
```bash
rg "archetypeId.*(grocery|electronics|convenience|boutique)|case '(grocery|electronics|convenience|boutique)'" src/lib/game
```
- [ ] Confirm passing tests for the four named risks.
- [ ] Full gate:
```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run build
bun run test
```
- [ ] Final invariants: schema 17 only; lots sole runtime store quantity; trend sales-only; waste/shrink product→store→daily reconciliation; derived freshness; markdown revenue once.
- [ ] Commit cleanup only if needed.

## Definition of done

- `ProductId` authoritative across runtime, planning, scenarios, art, reports, persistence.
- One catalog owns economics/dynamics and explicit material mapping.
- FIFO lots are the sole runtime store quantity source.
- Event stock effects are deterministic/lot-safe.
- Planner baseline is trend-free; retail sales applies trend once.
- Four archetypes each expose one visible data-driven pressure.
- Waste/shrink/markdown/stockout evidence and store/daily accounting reconcile.
- Freshness is derived, not persisted.
- Schema 17 strict; schema 16 rejected.
- Existing Svelte surfaces expose pressure without a new dashboard.
- `bun run check`, `bun run lint`, `bun run test`, and `bun run build` pass.
