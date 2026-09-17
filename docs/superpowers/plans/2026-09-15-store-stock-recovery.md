# Store Stock Recovery Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement HPA-293 in this single PR so one store-stock warning opens the live affected store/product, explains the real weekly replenishment path, and shows truthful command/report evidence without duplicating derived state.

**Architecture:** Keep simulation, persistence, alert ownership, and route ownership unchanged. Add one affected-product selector in `stock.ts`, derive stock-alert destination from the live `GameState`, export the existing retail-supply context plus next-check helper, and add one minimal pure `stockRecovery.ts` read model. `StoreStockTable` keeps owning live shelf/threshold/target/status values; only inventory-target edits await `GameRouteCommitResult`, while selling-price edits retain their current UX.

**Tech Stack:** TypeScript 6, SvelteKit/Svelte 5, Vitest 4, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-09-15-store-stock-recovery-design.md`

## Global constraints

- One HPA-293 PR. All implementation commits stay on the current draft PR.
- No schema/migration, compatibility layer, new command, notification inbox, repair system, forecast engine, global store, or broad route refactor.
- No `GameAlert.productId`, `affectedProductIds`, persisted focus, or persisted acknowledgement.
- Keep one store-stock alert per store.
- Keep `resolveAlertNavigation(...)` unchanged for panel/world-route destinations.
- `resolveStockAlertDestination(alert, game)` derives store/city/tile/live primary product from `game.stores`; it never reads `selectedStore`.
- `localizeStockTrouble(...)` stays count-based for `TileInspector`; product naming is alert-only.
- `StockRecoveryView` must not copy product ID, shelf stock, live status, reorder threshold, or target stock.
- Export `getNextReplenishmentCheckDay(...)` and the existing `resolveRetailSupplyContext(...)`; do not duplicate either rule in Svelte.
- Supply Planner replaces only its assignment/source preamble. Keep `getIndustryInventoryScope(...)` and downstream planner snapshot logic.
- `not-replenishable-product` remains read-model/test-only defensive state; do not add dedicated locale copy or repair/handoff chrome.
- Inventory-target edits preserve `GameRouteCommitResult`; selling-price edits do not show inventory acknowledgement copy.
- Receipt evidence comes only from completed reports after simulation; a saved threshold/target never means stock moved.
- No new art/image-generation work.

## Risks to pin with tests

1. **False recovery:** alert disappearance or a saved threshold does not prove receipt.
2. **Closing-day semantics:** replenishment runs after sales on the closing day.
3. **Threshold equality:** `stock === reorderThreshold` is not currently eligible.
4. **Zero-threshold dead end:** empty shelf + threshold `0` can never satisfy `stock < threshold`.
5. **Historical truth:** a previous receipt can coexist with a currently empty shelf.
6. **Normalization:** acknowledgement must read committed store values after `updateStoreProduct` normalization.
7. **Cross-city navigation:** modal opening must not depend on reactive `selectedStore` settling before the route decides to open.
8. **Focus trap:** deep-link row focus must happen after initial modal focus and remain outside the Tab cycle.
9. **Price/inventory callback sharing:** price edits must never emit reorder/target save copy.
10. **Planner scope:** exporting retail context must not replace `getIndustryInventoryScope(...)` or broaden planner semantics.

---

### Task 1: Centralize live stock/replenishment rules and build the minimal recovery read model

**Files:**
- Create: `src/lib/game/stockRecovery.ts`
- Create: `src/lib/game/stockRecovery.spec.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/stock.spec.ts`
- Modify: `src/lib/game/alerts.ts`
- Modify: `src/lib/game/alerts.spec.ts`
- Modify: `src/lib/game/retailSupply.ts`
- Modify: `src/lib/game/retailSupply.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`

**Interfaces:**
- Produces: `getAffectedStockProductIds(products) -> readonly ProductId[]`.
- Preserves: `GameAlert` store-stock identity as `storeId/cityId/tileId` only.
- Produces: `getNextReplenishmentCheckDay(currentDay) -> number`.
- Exports existing: `resolveRetailSupplyContext(game, retailCityId) -> RetailReplenishmentContext`.
- Produces: `buildStoreStockRecoveryViews(game, storeId) -> ReadonlyMap<ProductId, StockRecoveryView>` where the view contains only eligibility, next check, supply context/mode, and last receipt.

- [ ] **Step 1: Write failing affected-product ordering tests**

Add to `stock.spec.ts`:

```ts
it('orders affected products OOS first and preserves store order', () => {
  const ids = getAffectedStockProductIds(products);
  expect(ids).toEqual([outOfStockFirstId, outOfStockSecondId, needsImportId]);
});

it('omits healthy products', () => {
  expect(getAffectedStockProductIds(healthyProducts)).toEqual([]);
});
```

Use fixtures with concrete `ProductId`s; do not alphabetize.

Run:

```bash
bun run test:unit -- --run src/lib/game/stock.spec.ts
```

Expected: FAIL because `getAffectedStockProductIds` does not exist.

- [ ] **Step 2: Implement the helper and keep alerts subject-only**

Implement beside `summarizeStockTrouble`:

```ts
export function getAffectedStockProductIds(
  products: readonly Pick<StoreProduct, 'productId' | 'lots' | 'reorderThreshold'>[]
): readonly ProductId[] {
  const outOfStock: ProductId[] = [];
  const needsImport: ProductId[] = [];
  for (const product of products) {
    const status = getStoreProductStatus(product);
    if (status === 'Out of stock') outOfStock.push(product.productId);
    else if (status === 'Needs import') needsImport.push(product.productId);
  }
  return [...outOfStock, ...needsImport];
}
```

Change `collectGameAlerts(...)` to call the helper only to decide whether the store is affected. The emitted alert remains:

```ts
{
  id: `store-stock:${store.id}`,
  kind: 'store-stock',
  cityId: store.cityId,
  storeId: store.id,
  tileId: store.tileId
}
```

In `alerts.spec.ts`, assert no stock-specific product field is required and multiple affected products still emit one alert.

Run:

```bash
bun run test:unit -- --run src/lib/game/stock.spec.ts src/lib/game/alerts.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Write failing cadence/context and planner-parity tests**

In `retailSupply.spec.ts` pin:

```text
6 -> 7
7 -> 7
8 -> 14
assigned context -> configured/resolved city
unassigned -> configured/resolved null
configured unavailable -> configured ID + resolved null
```

In `supplyPlanner.spec.ts` pin current behavior for:

```text
unassigned -> supply-city-unavailable
assigned/resolved -> planner available
configured but unavailable -> supply-city-unavailable
```

Run:

```bash
bun run test:unit -- --run src/lib/game/retailSupply.spec.ts src/lib/game/supplyPlanner.spec.ts
```

Expected: cadence/export tests fail before implementation; existing planner behavior remains the oracle.

- [ ] **Step 4: Export the retail seams and replace only the planner preamble**

Add beside `isReplenishmentDay(...)`:

```ts
export function getNextReplenishmentCheckDay(currentDay: number): number {
  if (isReplenishmentDay(currentDay)) return currentDay;
  return currentDay + (REPLENISHMENT_INTERVAL_DAYS - (currentDay % REPLENISHMENT_INTERVAL_DAYS));
}
```

Export the existing private `resolveRetailSupplyContext(...)` unchanged.

In `supplyPlanner.ts`, replace only the direct `retailSupplyAssignments.find(...)` / configured-source availability preamble:

```ts
const context = resolveRetailSupplyContext(game, retailCity.id);
if (context.configuredSupplyCityId === null || context.resolvedSupplyCityId === null) {
  return { status: 'unavailable', reason: 'supply-city-unavailable' };
}

const industry = getIndustryInventoryScope(game, context.resolvedSupplyCityId);
if (!industry) {
  return { status: 'unavailable', reason: 'supply-city-unavailable' };
}
const inventoryStats = getCityInventoryStats(game, industry.cityId);
```

Keep every downstream industry/building/inventory calculation. Do not edit `productChainTree.ts` or `retailSupplySources.ts`.

Re-run the focused retail/planner specs and require PASS.

- [ ] **Step 5: Write failing minimal `stockRecovery` tests**

Target type:

```ts
export interface StockRecoveryView {
  eligibility: StockRecoveryEligibility;
  nextCheckDay: number;
  supplyContext: RetailReplenishmentContext;
  supplyMode: StockRecoverySupplyMode;
  lastReceipt: StockReceiptEvidence | null;
}
```

Test:

```text
stock < threshold -> eligible-at-current-stock
stock === threshold -> not-below-threshold
stock 0 + threshold 0 -> blocked-by-zero-threshold
unsupported-by-archetype fixture -> not-replenishable-product
assigned/unassigned/unavailable supply mode
newest positive warehouse/import receipt wins
historical receipt survives when current shelf is empty again
zero receipt quantities -> lastReceipt null
view does not expose productId/currentStock/status/reorderThreshold/targetStock
read leaves GameState deeply unchanged
```

Also keep one `stock.spec.ts` invariant proving normalized target stock stays `>= ceil(reorderThreshold)`.

Run:

```bash
bun run test:unit -- --run src/lib/game/stock.spec.ts src/lib/game/stockRecovery.spec.ts
```

Expected: FAIL before the read model exists.

- [ ] **Step 6: Implement `buildStoreStockRecoveryViews(...)` by composition**

Use existing helpers only:

```ts
getStoreProductStock(...)
getArchetype(...).startingProductIds
getNextReplenishmentCheckDay(...)
resolveRetailSupplyContext(...)
getRetailReplenishmentOutcome(...)
```

Eligibility order:

```text
not supported by archetype -> not-replenishable-product
stock <= 0 && reorderThreshold === 0 -> blocked-by-zero-threshold
stock < reorderThreshold -> eligible-at-current-stock
else -> not-below-threshold
```

Search `game.reports` from newest to oldest and emit `lastReceipt` only when the matching completed store/product report has replenishment context and a positive warehouse/import quantity.

Do not copy row-owned values into the view.

- [ ] **Step 7: Pin sales-before-replenishment closing-day semantics**

In `simulateDay.spec.ts`, create one day-7 case where pre-advance stock is at/above threshold, sales reduce it below threshold, and same-day replenishment then produces report receipt evidence.

Do not modify `simulateDay.ts` unless this test reveals a real defect.

- [ ] **Step 8: Verify Task 1 and commit**

```bash
bun run test:unit -- --run \
  src/lib/game/stock.spec.ts \
  src/lib/game/alerts.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/supplyPlanner.spec.ts \
  src/lib/game/stockRecovery.spec.ts \
  src/lib/game/simulateDay.spec.ts
bun run check
git diff --check
```

Commit:

```bash
git add src/lib/game
 git commit -m "feat: derive store stock recovery context"
```

---

### Task 2: Resolve stock-alert destination from live game state and focus the row

**Files:**
- Modify: `src/routes/alertNavigation.ts`
- Modify: `src/routes/alertNavigation.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/components/game/StoreDetailModal.svelte`
- Modify: `src/lib/components/game/StoreDetailModal.svelte.spec.ts`
- Modify: `src/lib/components/game/StoreStockTable.svelte`
- Modify: `src/lib/components/game/StoreStockTable.svelte.spec.ts`

**Interfaces:**
- Produces: `resolveStockAlertDestination(alert, game) -> StockAlertDestination | null`.
- Adds transient route state: `focusedStockProductId: ProductId | null`.
- Does not change: `resolveAlertNavigation(...)`.

- [ ] **Step 1: Write failing destination tests**

Add to `alertNavigation.spec.ts`:

```ts
expect(resolveStockAlertDestination(nonStockAlert, game)).toBeNull();
expect(resolveStockAlertDestination(missingStoreAlert, game)).toBeNull();
expect(resolveStockAlertDestination(stockAlert, game)).toEqual({
  cityId: liveStore.cityId,
  tileId: liveStore.tileId,
  storeId: liveStore.id,
  productId: expectedLivePrimaryProductId
});
```

Also mutate the fixture so the alert's original primary product is healthy and another product is OOS; the helper must choose from current `game.stores`, not alert snapshot data.

Run:

```bash
bun run test:unit -- --run src/routes/alertNavigation.spec.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 2: Implement the pure live destination helper**

Implement in `alertNavigation.ts`:

```ts
export function resolveStockAlertDestination(
  alert: GameAlert,
  game: GameState
): StockAlertDestination | null {
  if (alert.kind !== 'store-stock' || !alert.storeId) return null;
  const store = game.stores.find((candidate) => candidate.id === alert.storeId);
  if (!store) return null;
  return {
    cityId: store.cityId,
    tileId: store.tileId,
    storeId: store.id,
    productId: getAffectedStockProductIds(store.products)[0] ?? null
  };
}
```

Do not add city selection, modal state, `tick()`, or `selectedStore` to this helper.

Re-run `alertNavigation.spec.ts` and require PASS.

- [ ] **Step 3: Change the route to open directly after the city commit**

Add:

```ts
let focusedStockProductId = $state<ProductId | null>(null);
```

In `handleSelectAlert(...)`, preserve existing generic navigation first. For stock alerts:

```ts
const destination = game ? resolveStockAlertDestination(alert, game) : null;
if (!destination) return;

if (destination.cityId !== game.activeCityId) {
  // keep existing world-city guard
  const result = await gameRouteController.selectAlertCity(destination.cityId);
  if (result.status !== 'committed' && result.status !== 'sandbox-committed') return;
}

showRetailMap();
selectedTileId = destination.tileId;
focusedStockProductId = destination.productId;
isStoreDetailOpen = true;
```

Do not `await tick()` here, do not read `selectedStore`, and do not call `openStoreDetail()`.

Manual `openStoreDetail()` clears `focusedStockProductId`; `closeStoreDetail()` clears it too.

- [ ] **Step 4: Write failing modal/table focus tests**

Pass `focusedProductId` through `StoreDetailModal` into `StoreStockTable` and test:

```text
matching row receives focus after mount settles
row has tabindex=-1
Tab proceeds to normal modal controls rather than the row
changed focus request moves focus to the new matching row
null/unmatched focus does not choose another row
manual detail works with null focus
```

Run:

```bash
bun run test:unit -- --run \
  src/lib/components/game/StoreDetailModal.svelte.spec.ts \
  src/lib/components/game/StoreStockTable.svelte.spec.ts
```

Expected: FAIL before focus wiring.

- [ ] **Step 5: Implement focus after the existing focus trap**

In `StoreStockTable`, identify the requested row by stable product data/ID and use a focus effect that awaits Svelte `tick()` before `scrollIntoView()` / `focus()`.

Keep `tabindex="-1"`; do not modify `focusTrap.ts` unless this focused test proves the existing ordering insufficient.

- [ ] **Step 6: Verify Task 2 and commit**

```bash
bun run test:unit -- --run \
  src/routes/alertNavigation.spec.ts \
  src/routes/page.svelte.spec.ts \
  src/lib/components/game/StoreDetailModal.svelte.spec.ts \
  src/lib/components/game/StoreStockTable.svelte.spec.ts
bun run check
git diff --check
```

Commit:

```bash
git add src/routes src/lib/components/game
 git commit -m "feat: deep link stock alerts to live store rows"
```

---

### Task 3: Render compact recovery context and truthful inventory acknowledgements

**Files:**
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/gameCopy.spec.ts`
- Modify: `src/lib/components/game/StoreDetailModal.svelte`
- Modify: `src/lib/components/game/StoreStockTable.svelte`
- Modify: `src/lib/components/game/StoreStockTable.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Regression run only: `src/lib/components/game/TileInspector.svelte.spec.ts`

**Interfaces:**
- Keeps: `localizeStockTrouble(...)` count-based.
- Adds: alert-only live affected-product naming in `localizeAlert(...)`.
- Changes `StoreStockTable.onUpdate` / `StoreDetailModal.onUpdateStoreProduct` return type to `Promise<GameRouteCommitResult | null>`.
- Only reorder/target branches interpret that result.

- [ ] **Step 1: Write failing alert-copy tests without changing inspector copy**

In `gameCopy.spec.ts`, pin both surfaces:

```text
store-stock alert names all live affected localized products in OOS-first stable order
healthy products are absent
hand-written stock alert needs only storeId to derive names
localizeStockTrouble still returns the existing count summary
existing "Store #1: 1 product out of stock" count-path assertion remains valid for the inspector helper
```

Implement an alert-only helper using `getAffectedStockProductIds(...)` + `i18n.labels.productCategory(...)` + `i18n.format.list(...)`.

Do not repurpose `localizeStockTrouble(...)`.

Run:

```bash
bun run test:unit -- --run src/lib/i18n/gameCopy.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts
```

- [ ] **Step 2: Derive and render only missing row context**

`StoreDetailModal` derives:

```ts
const recoveryViews = $derived(buildStoreStockRecoveryViews(game, store.id));
```

Pass it to the stock table.

For unhealthy/focused products render:

```text
supply context/import fallback
next closing-day check
actionable eligibility explanation
latest historical dated receipt when present
```

Do not render another stock/status/threshold/target value. Do not add UI for `not-replenishable-product`; that state remains read-model/test-only defensive coverage.

- [ ] **Step 3: Write failing inventory-result vs selling-price split tests**

In `StoreStockTable.svelte.spec.ts`, mock `onUpdate` and pin:

```text
sellingPrice invokes callback but never shows inventory saved/no-change/not-saved copy
reorder/target awaits committed result
committed acknowledgement reads normalized values from updated store props
unchanged result shows neutral no-change copy
busy/rejected/unavailable/failed/null shows not-saved copy
successful settings edit does not alter shelf stock by itself
```

Use `GameRouteCommitResult` fixtures matching `FinancePanel` semantics instead of booleans.

- [ ] **Step 4: Preserve the shared callback but branch its use by field**

Change route handler to:

```ts
async function changeStoreProduct(
  storeId: string,
  productId: ProductId,
  patch: StoreProductPatch
): Promise<GameRouteCommitResult | null> {
  // validate live game/product/capability first
  // sellingPrice -> return updateStoreSellingPrice(...)
  // inventory -> return updateStoreInventoryTargets(...)
}
```

In `StoreStockTable.updateNumber(...)`:

```text
sellingPrice -> void onUpdate(...); return
reorderThreshold/targetStock -> await onUpdate(...); interpret result
```

After an inventory commit, await `tick()`, then read the product from updated `store.products` and `nextCheckDay` from the updated recovery map. Never echo unnormalized input as committed truth.

- [ ] **Step 5: Wire only existing contextual handoffs**

Add recovery callbacks:

```text
Manage supply source -> close detail -> openStoresManagement(store.cityId)
Plan supply -> close detail -> planSupplyProduct(productId)
```

Use the existing planner-supported product IDs. `blocked-by-zero-threshold` points first to the row's reorder input.

No buy/repair/logistics-to-shelf action. No handoff chrome for defensive `not-replenishable-product`.

- [ ] **Step 6: Add only player-reachable locale copy**

Add parallel English/Japanese/Traditional-Chinese keys for:

```text
assigned/unassigned/unavailable import fallback
eligible/not-below-threshold/blocked-zero-threshold
closing-day after-sales timing
historical receipt evidence/outcome
inventory saved/no-change/not-saved
Manage supply source / Plan supply
```

Do not add `not-replenishable-product` player explanation keys. Alert naming reuses existing product labels and `copy.alerts.storeStock`.

- [ ] **Step 7: Verify Task 3 and commit**

```bash
bun run test:unit -- --run \
  src/lib/i18n/gameCopy.spec.ts \
  src/lib/components/game/TileInspector.svelte.spec.ts \
  src/lib/components/game/StoreStockTable.svelte.spec.ts \
  src/lib/components/game/StoreDetailModal.svelte.spec.ts
bun run check
bun run lint
git diff --check
```

Commit:

```bash
git add src/lib/i18n src/lib/components/game src/routes/+page.svelte
 git commit -m "feat: explain store stock recovery truthfully"
```

---

### Task 4: Extend the two existing browser journeys and run the final gate

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify only if a concrete regression requires it: `src/routes/time-flow.e2e.ts`

**Interfaces:**
- Fast journey proves cross-city alert/navigation/focus/edit acknowledgement without advancing days.
- Existing slow weekly-import journey proves completed receipt evidence.
- No second seven-day browser flow.

- [ ] **Step 1: Extend the existing fast cross-city stock-alert journey**

Reuse the current `cross-city stock alert deep-links to the origin city and tile` setup.

Assert:

```text
active retail city switches to the alert store city
correct Store detail opens directly
Stock tab is active
live OOS-first primary row owns focus after mount settles
alert copy names all affected live products
inventory target edit reports committed acknowledgement
acknowledgement uses committed normalized values
shelf quantity is unchanged immediately after save
no receipt/recovery success appears from the save alone
```

Do not advance time in this journey.

- [ ] **Step 2: Extend the existing weekly-import journey**

Reuse `manage selected store stock and see weekly imports`.

After its existing seven-day advance, assert:

```text
reopened stock row shows the actual completed report day
warehouse/import quantities equal the recorded product report
historical receipt wording is separate from current live shelf status
```

Keep local/mixed/import permutations in unit tests.

- [ ] **Step 3: Run targeted E2E**

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts src/routes/time-flow.e2e.ts
```

Expected: PASS. If `time-flow.e2e.ts` remains unchanged, it still runs as the time/modal regression gate.

- [ ] **Step 4: Run the full repository gate**

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e -- src/routes/retail-sim.e2e.ts src/routes/time-flow.e2e.ts
git diff --check main...HEAD
```

Expected: all commands exit 0.

- [ ] **Step 5: Audit the final diff against the design**

Require all of these before marking the PR ready:

```text
one PR for HPA-293
one store-stock alert per store
no GameAlert.productId or affectedProductIds
one getAffectedStockProductIds rule
alert names products but TileInspector keeps compact count copy
stock destination derives from game.stores, not selectedStore
route opens modal directly after city commit; no settlement wait/openStoreDetail dependency
focused row is transient, tabindex=-1, and focused after modal trap initialization
one exported retail supply-context resolver and one cadence helper
Supply Planner keeps getIndustryInventoryScope and downstream snapshot logic
StockRecoveryView omits row-owned stock/status/threshold/target/productId
not-replenishable-product has no player copy/handoff chrome
inventory edits preserve GameRouteCommitResult
selling-price edit never emits inventory acknowledgement
no new schema/migration/repair/buying/logistics-to-shelf subsystem
receipt evidence comes only from completed reports
existing fast alert E2E stays fast
existing slow weekly-import E2E owns receipt evidence
```

Then update the PR summary/testing section and mark ready only after runtime implementation and fresh verification.