# Store Stock Recovery Flow Implementation Plan

**Goal:** Implement HPA-293 in this single PR so a stock warning leads from the affected store/product to truthful replenishment settings, timing, contextual supply actions, and report-backed recovery evidence.

**Architecture:** Keep simulation and persistence unchanged. Enrich the existing derived store alert with product identity, expose the existing replenishment cadence/context from `retailSupply.ts`, and add one pure `stockRecovery.ts` read model over current `GameState` plus completed reports. The route keeps async city selection and command/autosave ownership; the existing store modal/table render the read model and transient edit acknowledgement.

**Tech Stack:** TypeScript 6, SvelteKit/Svelte 5, Vitest 4, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-09-15-store-stock-recovery-design.md`

## Global constraints

- One HPA-293 PR. These tasks are implementation/review checkpoints, not separate PRs.
- No save-schema change, migration, compatibility layer, new command, new notification system, global store, or broad route refactor.
- No new art; reuse current product/store assets and HUD/modal treatment.
- Keep one stock alert per store.
- Reuse `updateStoreProduct`, `GameRouteController.updateStoreInventoryTargets`, existing autosave, `retailSupply.ts`, and persisted daily reports.
- Keep the existing `resolveAlertNavigation` panel/world-route contract; stock navigation remains in the existing route-owned fallback because it performs async city selection and modal state changes.
- The UI must never recompute the seven-day cadence independently.
- A saved inventory setting is an acknowledgement only. Only completed report quantities count as receipt evidence.
- Retail supply assignment is city-level. Inter-city route arrivals are not direct shelf deliveries.
- Read-model calls must not consume RNG, mutate state, save, or simulate future days.
- Preserve automatic time, pause/speed behavior, modal ownership, and focus trapping.
- Localize every new player-facing string in English, Japanese, and Traditional Chinese.

## Risks to pin with tests

1. **False recovery:** lowering a threshold can make an alert disappear without any receipt. Never use alert disappearance as success evidence.
2. **Closing-day semantics:** `game.day` is the next day to close; day 7 replenishment is evaluated during the advance that closes day 7, after sales.
3. **Threshold equality:** live replenishment uses `stock < reorderThreshold`; equality is not eligible. Empty stock with threshold `0` therefore remains ineligible.
4. **Current vs eventual eligibility:** stock can be at/above threshold before day-7 sales and below it afterward. The read model describes current eligibility and copy explains reevaluation after sales; it does not forecast sales.
5. **Historical truth:** an earlier receipt can be valid evidence while current stock is empty again. Show both separately.
6. **Normalization:** `updateStoreProduct` may normalize target values. Acknowledgement must read the committed state rather than echo the input.
7. **Focus timing:** non-active-city alert navigation requires the city commit and selected-store derivation to settle before opening/focusing the modal row.
8. **Regression blast radius:** finance, decision, manager, logistics, event-modifier, and factory alerts share the same top-level alert UI and must keep their destinations.
9. **Planner scope:** planner state is derived from the active retail city. Alert navigation must select the store city before exposing the product planner handoff.

---

## Task 1: Enrich stock alerts and add the pure recovery read model

**Create:**
- `src/lib/game/stockRecovery.ts`
- `src/lib/game/stockRecovery.spec.ts`

**Modify:**
- `src/lib/game/alerts.ts`
- `src/lib/game/alerts.spec.ts`
- `src/lib/game/retailSupply.ts`
- `src/lib/game/retailSupply.spec.ts`
- `src/lib/game/simulateDay.spec.ts`
- `src/lib/game/types.ts` only if an existing exported domain type needs a narrow type import; do not add persisted state

### Step 1: Write RED alert tests

Add cases that construct a store with products in a deliberate order and assert:

```text
one store -> one store-stock alert
healthy products are excluded
all affected product IDs are retained
Out of stock products precede Needs import products
each severity group preserves existing store product order
alert.productId is the first affected product
```

Also retain the existing assertions for city/store/tile identity.

Run:

```bash
bun run test:unit -- --run src/lib/game/alerts.spec.ts
```

Expected: FAIL because the product fields are not present yet.

### Step 2: Implement derived product identity on `GameAlert`

Add optional:

```ts
productId?: ProductId;
affectedProductIds?: readonly ProductId[];
```

In `collectGameAlerts`, perform one stable OOS-first partition per store. Do not sort alphabetically and do not create per-product alert IDs.

Re-run the focused alert spec.

### Step 3: Write RED cadence/context tests

In `retailSupply.spec.ts`, pin:

```text
current day 6 -> next check 7
current day 7 -> next check 7
current day 8 -> next check 14
```

Export `resolveRetailSupplyContext` without changing its behavior and test assigned/unassigned contexts through the public helper.

Run:

```bash
bun run test:unit -- --run src/lib/game/retailSupply.spec.ts
```

### Step 4: Implement centralized next-check helper

Add to `retailSupply.ts`:

```ts
export function getNextReplenishmentCheckDay(currentDay: number): number;
```

It must be defined in terms of the existing replenishment interval/check convention. No equivalent calculation is allowed in Svelte.

### Step 5: Write RED `stockRecovery` tests

Cover the pure view model:

```text
current stock/status/threshold/target are copied from live product state
stock < threshold -> eligible-at-current-stock
stock === threshold -> not-below-threshold
stock 0 + threshold 0 -> not-below-threshold
non-replenishable product -> not-replenishable-product
assigned supply city reports assigned-city-with-import-fallback
unassigned supply reports unassigned-import-fallback
latest receipt is selected newest-first by report day
local-only receipt -> city-inventory
mixed receipt -> mixed
assigned import-only receipt -> import-only
unassigned import receipt -> unassigned-import
historical receipt remains visible when current stock is empty again
no receipt quantities -> lastReceipt null
```

Add a purity test that deep-clones the fixture and asserts a read leaves at least these unchanged:

```text
GameState deep equality
rngState
cash
reports
store lots
retailSupplyAssignments
```

Run:

```bash
bun run test:unit -- --run src/lib/game/stockRecovery.spec.ts
```

### Step 6: Implement `buildStoreStockRecoveryViews`

Compose, do not reproduce:

- `getStoreProductStock` / `getStoreProductStatus`;
- `getArchetype(...).startingProductIds`;
- `getNextReplenishmentCheckDay`;
- `resolveRetailSupplyContext`;
- `getRetailReplenishmentOutcome`;
- `DailyReport.storeReports[].productReports`.

Search report evidence newest-first. Require positive warehouse/import quantities before producing `lastReceipt`.

### Step 7: Pin sales-before-check semantics

Add one deterministic `simulateDay.spec.ts` case on a replenishment boundary where sales take stock from at/above the threshold to below it and the same closing-day replenishment then runs.

The test should prove the UI wording rather than duplicate the whole replenishment suite:

```text
pre-advance current eligibility can be not-below-threshold
sales happen
replenishment uses the post-sales shelf quantity
completed day report contains receipt evidence
```

Do not move any production RNG calls or change `simulateDay.ts` unless the test exposes a real defect.

### Step 8: Verify checkpoint 1

```bash
bun run test:unit -- --run \
  src/lib/game/alerts.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/stockRecovery.spec.ts \
  src/lib/game/simulateDay.spec.ts
bun run check
```

Commit the domain/read-model checkpoint.

---

## Task 2: Make the stock alert open and focus the exact store product

**Modify:**
- `src/routes/+page.svelte`
- `src/routes/alertNavigation.spec.ts`
- `src/lib/components/game/StoreDetailModal.svelte`
- `src/lib/components/game/StoreDetailModal.svelte.spec.ts`
- `src/lib/components/game/StoreStockTable.svelte`
- `src/lib/components/game/StoreStockTable.svelte.spec.ts`

### Step 1: Add RED route/component expectations

Pin these behaviors before wiring them:

```text
stock alert still does not hijack generic panel/world-route resolution
focusedProductId reaches the stock table
matching product row is programmatically focusable
a changed focus request focuses/scrolls the matching row
unmatched focus does not throw or focus another product
manual detail usage works with no focused product
```

Preserve the existing `alertNavigation.spec.ts` cases for finance, decision, manager, logistics, and event-modifier navigation.

### Step 2: Add transient route focus state

Add:

```ts
let focusedStockProductId = $state<ProductId | null>(null);
```

Clear it when:

- manually opening a store detail;
- closing the store detail;
- resetting route/transient view state.

Do not persist it.

### Step 3: Extend the existing `store-stock` branch in `handleSelectAlert`

Keep the current async city-selection command. After a successful city switch:

```text
show retail map
select alert tile
await reactive settlement
verify selectedStore.id === alert.storeId
set focusedStockProductId = alert.productId
open StoreDetailModal
```

Do not add a new navigation subsystem.

### Step 4: Pass focus through the existing modal/table

`StoreDetailModal` gets optional `focusedProductId` and forwards it to `StoreStockTable`.

`StoreStockTable` gives each product row a stable identifier/data attribute and `tabindex="-1"`. Focus/scroll only once per new `(storeId, focusedProductId)` request.

Keep input controls and tab order unchanged.

### Step 5: Verify checkpoint 2

```bash
bun run test:unit -- --run \
  src/routes/alertNavigation.spec.ts \
  src/lib/components/game/StoreDetailModal.svelte.spec.ts \
  src/lib/components/game/StoreStockTable.svelte.spec.ts
bun run check
```

Commit the navigation/focus checkpoint.

---

## Task 3: Render truthful recovery context, acknowledgement, and existing handoffs

**Modify:**
- `src/lib/components/game/StoreDetailModal.svelte`
- `src/lib/components/game/StoreStockTable.svelte`
- `src/lib/components/game/StoreStockTable.svelte.spec.ts`
- `src/routes/+page.svelte`
- `src/routes/page.svelte.spec.ts` if route helper coverage belongs there
- `src/lib/i18n/gameCopy.ts`
- `src/lib/i18n/gameCopy.spec.ts`
- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`

### Step 1: Write RED localization/alert-copy tests

Update stock-alert copy expectations so the message names the affected localized product(s), not only a count/status summary.

Pin fallback behavior for a manually-created stock alert that omits `affectedProductIds`.

Run:

```bash
bun run test:unit -- --run src/lib/i18n/gameCopy.spec.ts
```

### Step 2: Derive recovery views in `StoreDetailModal`

Because the modal already receives full `GameState`, derive:

```ts
buildStoreStockRecoveryViews(game, store.id)
```

and pass the result into `StoreStockTable`.

Do not give the table another simulation implementation or persistent store.

### Step 3: Render compact recovery detail with unhealthy/focused rows

For each unhealthy product, and for the explicitly focused product even if its status changed, show:

```text
current shelf stock
reorder threshold
target stock
supply city/import fallback
next scheduled closing-day check
current eligibility explanation
latest dated receipt quantities/outcome if present
current shelf condition separately
```

Use a compact detail row/region inside the existing scrollable stock table instead of adding a second modal or many new columns.

Copy must say that the check occurs after sales and is not a guaranteed delivery.

### Step 4: Make inventory-target update acknowledgement commit-aware

Change the route `changeStoreProduct(...)` handler to return `Promise<boolean>`:

- `false` when the command is unavailable, the product is missing, or the controller does not commit;
- `true` only for committed/sandbox-committed mutations.

In `StoreStockTable`, make inventory-target change handling async:

1. await `onUpdate`;
2. if not committed, show no success acknowledgement;
3. await the reactive prop update;
4. read the updated `StockRecoveryView`;
5. show transient status text containing the actual stored reorder/target values and next check day.

Do not show a receipt/recovery success message here. Assert the stock quantity is unchanged by the edit itself.

Selling-price behavior remains otherwise unchanged.

### Step 5: Wire existing supply/planner destinations

Add modal/table callbacks for:

```text
Manage supply source
Plan supply
```

Route ownership:

- supply source -> close detail, `openStoresManagement(store.cityId)`;
- planner -> close detail, `planSupplyProduct(productId)`.

Pass the route's current `plannerProductIds` so the table only enables the planner action for supported products. Do not create direct logistics-to-shelf actions.

### Step 6: Add all three locales

Add matching keys for:

- affected-product stock alert;
- recovery detail labels;
- assigned/unassigned/unavailable import-fallback explanations;
- current eligibility explanations;
- closing-day/after-sales timing text;
- receipt outcome/evidence text;
- historical-receipt qualifier;
- edit acknowledgement;
- Manage supply source / Plan supply actions.

English, Japanese, and Traditional Chinese must stay structurally complete.

### Step 7: Add Svelte tests

Cover:

```text
focused unhealthy row shows complete context
zero-threshold explanation is truthful
assigned source says imports cover shortages
unassigned source says import fallback
historical local/mixed/import receipt is labeled with day and quantities
saved acknowledgement uses updated normalized values
successful edit does not change displayed shelf stock by itself
failed update callback produces no success acknowledgement
Manage supply source callback carries current retail city
Plan supply callback carries focused product
narrow rendered structure keeps actions/context inside the table scroll surface
```

### Step 8: Verify checkpoint 3

```bash
bun run test:unit -- --run \
  src/lib/i18n/gameCopy.spec.ts \
  src/lib/components/game/StoreStockTable.svelte.spec.ts \
  src/lib/components/game/StoreDetailModal.svelte.spec.ts \
  src/routes/page.svelte.spec.ts
bun run check
bun run lint
```

Commit the player-facing recovery checkpoint.

---

## Task 4: Extend the existing non-active-city E2E into a full recovery journey

**Modify:**
- `src/routes/retail-sim.e2e.ts`
- `src/routes/time-flow.e2e.ts` only if a focused regression is needed; prefer preserving the existing file unchanged when its current assertions already cover modal/time ownership

### Step 1: Reuse the existing stock-alert fixture

Do not create a separate browser harness. Extend the current scenario that:

- returns the active city to Harbor City;
- starves the Campus Junction store;
- produces a `store-stock` alert from the non-active city.

Make the fixture deterministic around a known replenishment boundary and pause automatic time before editing.

### Step 2: Assert alert -> exact product focus

Activate the alert once by pointer and cover the shared keyboard activation path with the existing alert control semantics.

Assert:

```text
active retail city becomes Campus Junction
correct store detail opens
Stock tab is active
expected primary product row has focus
all affected products remain visible/discoverable
```

### Step 3: Assert edit acknowledgement is not recovery

Edit valid reorder/target values and assert:

```text
acknowledgement shows actual stored values
next check day is shown
shelf quantity has not changed
no receipt/recovery success is shown from the save alone
```

### Step 4: Advance through the scheduled check

Advance deterministically through the closing day. Assert:

```text
new shelf state reflects the actual simulation
receipt evidence names the completed report day
warehouse/import quantities match the report fixture
current shelf status is shown separately
```

Use one concrete receipt path in E2E; local/mixed/import variants stay in unit tests.

### Step 5: Verify contextual handoffs and alert regressions

In the same journey or focused route tests, assert:

- Manage supply source opens Stores management focused on the correct retail city;
- Plan supply opens the planner on the correct product/city;
- at least one representative non-stock alert destination still works, while unit tests cover the full resolver matrix.

### Step 6: Run final verification

```bash
bun run check
bun run lint
bun run test:unit -- --run
bunx playwright test src/routes/retail-sim.e2e.ts src/routes/time-flow.e2e.ts
git diff --check main...HEAD
```

Expected: all pass.

### Step 7: Final review gate

Before marking HPA-293 ready for review, inspect the whole branch for:

```text
no schema/migration changes
no duplicated replenishment formula in Svelte
no new notification/repair subsystem
no direct shelf delivery from logistics routes
no persisted acknowledgement/focus state
no RNG consumption from read models
one alert per store
all three locales complete
one PR for the ticket
```

Then update the draft PR summary/testing section and move it to review only after runtime implementation and verification are complete.