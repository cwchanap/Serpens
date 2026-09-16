# Store Stock Recovery Flow Implementation Plan

**Goal:** Implement HPA-293 in this single PR so a stock warning leads from the affected store/product to truthful replenishment settings, timing, contextual supply actions, and report-backed recovery evidence.

**Architecture:** Keep simulation and persistence unchanged. Add one shared affected-product selector in `stock.ts`, keep only the deterministic primary `productId` on the derived store alert, centralize replenishment timing/context in `retailSupply.ts`, and add one pure `stockRecovery.ts` read model over current `GameState` plus completed reports. The route keeps async city selection and command/autosave ownership; `alertNavigation.ts` gains only a pure store/product focus decision. The existing store modal/table render the read model and consume the existing `GameRouteCommitResult` union for truthful transient feedback.

**Tech Stack:** TypeScript 6, SvelteKit/Svelte 5, Vitest 4, Playwright, Bun.

**Spec:** `docs/superpowers/specs/2026-09-15-store-stock-recovery-design.md`

## Global constraints

- One HPA-293 PR. These tasks are implementation/review checkpoints, not separate PRs.
- No save-schema change, migration, compatibility layer, new command, new notification system, global store, or broad route refactor.
- No new art; reuse current product/store assets and HUD/modal treatment.
- Keep one stock alert per store.
- Keep only `productId` as stock-specific alert focus state; derive the full affected list from current store state.
- Reuse `updateStoreProduct`, `GameRouteController.updateStoreInventoryTargets`, `GameRouteCommitResult`, existing autosave, `retailSupply.ts`, and persisted daily reports.
- Keep the existing `resolveAlertNavigation` panel/world-route contract; stock navigation remains in the existing route-owned fallback because it performs async city selection and modal state changes.
- Add only a narrow pure `resolveStockAlertFocus(...)` helper for store/product identity validation.
- The UI and Supply Planner must not reimplement retail supply-context resolution or the seven-day cadence.
- A saved inventory setting is an acknowledgement only. Only completed report quantities count as receipt evidence.
- Retail supply assignment is city-level. Inter-city route arrivals are not direct shelf deliveries.
- Read-model calls must not consume RNG, mutate state, save, or simulate future days.
- Preserve automatic time, pause/speed behavior, modal ownership, and the existing focus trap.
- Localize every new player-facing string in English, Japanese, and Traditional Chinese.

## Risks to pin with tests

1. **False recovery:** lowering a threshold can make an alert disappear without any receipt. Never use alert disappearance as success evidence.
2. **Closing-day semantics:** `game.day` is the next day to close; day 7 replenishment is evaluated during the advance that closes day 7, after sales.
3. **Threshold equality:** live replenishment uses `stock < reorderThreshold`; equality is not eligible.
4. **Zero-threshold dead end:** an empty shelf with reorder threshold `0` can never satisfy the replenishment condition. Name the fix instead of merely reporting “not eligible.”
5. **Current vs eventual eligibility:** stock can be at/above threshold before day-7 sales and below it afterward. The read model describes current eligibility and copy explains reevaluation after sales; it does not forecast sales.
6. **Historical truth:** an earlier receipt can be valid evidence while current stock is empty again. Show both separately.
7. **Normalization:** `updateStoreProduct` may normalize target values. Acknowledgement must read the committed state rather than echo the input.
8. **Command-result loss:** `GameRouteCommitResult` distinguishes committed, no-op, busy/rejected/unavailable, and failure states. Do not collapse it to `boolean`.
9. **City/focus timing:** non-active-city alert navigation requires the city commit and selected-store derivation to settle before opening/focusing the modal row.
10. **Focus-trap race:** the modal trap synchronously focuses the first control. Deep-linked row focus must run after that initial focus, and the `tabindex="-1"` row must stay out of the Tab cycle.
11. **Regression blast radius:** finance, decision, manager, logistics, event-modifier, and factory alerts share the same top-level alert UI and must keep their destinations.
12. **Planner scope:** planner state is derived from the active retail city. Alert navigation must select the store city before exposing the product planner handoff.

---

## Task 1: Share affected-product and retail-supply rules, then add the pure recovery read model

**Create:**
- `src/lib/game/stockRecovery.ts`
- `src/lib/game/stockRecovery.spec.ts`

**Modify:**
- `src/lib/game/stock.ts`
- `src/lib/game/stock.spec.ts`
- `src/lib/game/alerts.ts`
- `src/lib/game/alerts.spec.ts`
- `src/lib/game/retailSupply.ts`
- `src/lib/game/retailSupply.spec.ts`
- `src/lib/game/supplyPlanner.ts`
- `src/lib/game/supplyPlanner.spec.ts`
- `src/lib/game/simulateDay.spec.ts`
- `src/lib/game/types.ts` only if an existing exported domain type needs a narrow type import; do not add persisted state

### Step 1: Write RED affected-product ordering tests

In `stock.spec.ts`, add deterministic cases for:

```text
healthy products are excluded
Out of stock products precede Needs import products
each severity group preserves existing store product order
all returned IDs are concrete ProductId values
```

Target interface:

```ts
export function getAffectedStockProductIds(
  products: readonly StoreProduct[]
): readonly ProductId[];
```

Run:

```bash
bun run test:unit -- --run src/lib/game/stock.spec.ts
```

Expected: FAIL because the shared helper does not exist.

### Step 2: Use the shared helper for one alert + one primary focus ID

In `alerts.spec.ts`, pin:

```text
one store -> one store-stock alert
alert keeps city/store/tile identity
alert.productId is the first ID from getAffectedStockProductIds
one alert remains even when multiple products are affected
```

Add optional `productId?: ProductId` to `GameAlert`. Do **not** add `affectedProductIds`.

Implement `getAffectedStockProductIds` in `stock.ts` and have `collectGameAlerts` use `[0]` as the primary focus product. Do not sort alphabetically and do not create per-product alert IDs.

Re-run:

```bash
bun run test:unit -- --run src/lib/game/stock.spec.ts src/lib/game/alerts.spec.ts
```

### Step 3: Write RED cadence/context and planner-parity tests

In `retailSupply.spec.ts`, pin:

```text
current day 6 -> next check 7
current day 7 -> next check 7
current day 8 -> next check 14
assigned context resolves configured + available supply city
unassigned context resolves null configured/resolved city
configured unavailable source keeps configured ID but resolved ID is null
```

Export the existing private `resolveRetailSupplyContext` without changing its behavior.

In `supplyPlanner.spec.ts`, pin the current planner unavailable/available outcomes around:

```text
no supply assignment
assigned/resolved supply city
configured but unavailable supply city
```

These are behavior-parity tests for replacing the planner's hand-rolled assignment/source resolution.

Run:

```bash
bun run test:unit -- --run \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/supplyPlanner.spec.ts
```

### Step 4: Centralize next-check and supply-context resolution

Add to `retailSupply.ts`:

```ts
export function getNextReplenishmentCheckDay(currentDay: number): number;
export function resolveRetailSupplyContext(
  game: GameState,
  retailCityId: WorldCityId
): RetailReplenishmentContext;
```

Requirements:

- `getNextReplenishmentCheckDay` is defined from the existing interval/check convention; no equivalent calculation lands in Svelte.
- `applyWeeklyReplenishment` continues to call `resolveRetailSupplyContext`.
- replace `supplyPlanner.ts`'s direct `retailSupplyAssignments.find(...)` + source resolution with the exported helper while preserving the planner's existing `supply-city-unavailable` outcomes.

Re-run the focused retail/planner specs.

### Step 5: Write RED `stockRecovery` tests

Cover the pure view model:

```text
current stock/status/threshold/target are copied from live product state
stock < threshold -> eligible-at-current-stock
stock === threshold -> not-below-threshold
stock 0 + threshold 0 -> blocked-by-zero-threshold
not-replenishable authoritative guard -> not-replenishable-product
assigned supply city reports assigned-city-with-import-fallback
unassigned supply reports unassigned-import-fallback
configured unavailable source reports unavailable-source-import-fallback
latest receipt is selected newest-first by report day
local-only receipt -> city-inventory
mixed receipt -> mixed
assigned import-only receipt -> import-only
unassigned import receipt -> unassigned-import
historical receipt remains visible when current stock is empty again
no receipt quantities -> lastReceipt null
```

Add a normalization invariant test in `stock.spec.ts` proving UI-reachable target edits keep:

```text
targetStock >= ceil(reorderThreshold)
```

so `neededUnits === 0` does not require another recovery eligibility state.

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
bun run test:unit -- --run \
  src/lib/game/stock.spec.ts \
  src/lib/game/stockRecovery.spec.ts
```

### Step 6: Implement `buildStoreStockRecoveryViews`

Compose, do not reproduce:

- `getStoreProductStock` / `getStoreProductStatus`;
- `getArchetype(...).startingProductIds`;
- `getNextReplenishmentCheckDay`;
- `resolveRetailSupplyContext`;
- `getRetailReplenishmentOutcome`;
- `DailyReport.storeReports[].productReports`.

Eligibility order:

```text
not authoritative replenishable product -> not-replenishable-product
empty shelf + reorderThreshold 0 -> blocked-by-zero-threshold
stock < reorderThreshold -> eligible-at-current-stock
otherwise -> not-below-threshold
```

Search report evidence newest-first. Require positive warehouse/import quantities before producing `lastReceipt`.

Keep `not-replenishable-product` defensive; do not add extra workflow for it.

### Step 7: Pin sales-before-check semantics

Add one deterministic `simulateDay.spec.ts` case on a replenishment boundary where sales take stock from at/above the threshold to below it and the same closing-day replenishment then runs.

The test should prove the UI wording rather than duplicate the whole replenishment suite:

```text
pre-advance current eligibility is not-below-threshold
sales happen
replenishment uses the post-sales shelf quantity
completed day report contains receipt evidence
```

Do not move production RNG calls or change `simulateDay.ts` unless the test exposes a real defect.

### Step 8: Verify checkpoint 1

```bash
bun run test:unit -- --run \
  src/lib/game/stock.spec.ts \
  src/lib/game/alerts.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/supplyPlanner.spec.ts \
  src/lib/game/stockRecovery.spec.ts \
  src/lib/game/simulateDay.spec.ts
bun run check
```

Commit the domain/read-model checkpoint.

---

## Task 2: Make the stock alert open and focus the exact store product

**Modify:**
- `src/routes/alertNavigation.ts`
- `src/routes/alertNavigation.spec.ts`
- `src/routes/+page.svelte`
- `src/lib/components/game/StoreDetailModal.svelte`
- `src/lib/components/game/StoreDetailModal.svelte.spec.ts`
- `src/lib/components/game/StoreStockTable.svelte`
- `src/lib/components/game/StoreStockTable.svelte.spec.ts`

`src/routes/page.svelte.spec.ts` remains a regression run for the existing `selectAlertCity` controller path; do not create a new route abstraction solely to make the component-local effects unit-testable.

### Step 1: Add RED stock-focus decision tests

Add to `alertNavigation.spec.ts` for:

```text
non-stock alert -> null
missing storeId -> null
selectedStore null -> null
selectedStore ID mismatch -> null
matching store + matching alert.productId -> returns that product
matching store + productId no longer in store -> returns productId null
matching store + no productId -> returns productId null
```

Target helper:

```ts
export function resolveStockAlertFocus(
  alert: GameAlert,
  selectedStore: Store | null
): { productId: ProductId | null } | null;
```

Preserve all existing `resolveAlertNavigation` cases for finance, decision, manager, logistics, and event-modifier navigation.

### Step 2: Implement only the pure decision in `alertNavigation.ts`

Do not put city selection, modal state, `tick()`, or tile assignment into the helper. It only validates store identity and the optional focus product.

Run:

```bash
bun run test:unit -- --run src/routes/alertNavigation.spec.ts
```

### Step 3: Add transient route focus state

Add:

```ts
let focusedStockProductId = $state<ProductId | null>(null);
```

Clear it when:

- manually opening a store detail;
- closing the store detail;
- resetting route/transient view state.

Do not persist it.

### Step 4: Extend the existing `store-stock` branch in `handleSelectAlert`

Keep the current async city-selection command. After a successful city switch:

```text
show retail map
select alert tile
await reactive settlement
const focus = resolveStockAlertFocus(alert, selectedStore)
if focus is null -> stop without opening the wrong detail
focusedStockProductId = focus.productId
open StoreDetailModal
```

Do not add a new navigation subsystem.

The existing `page.svelte.spec.ts` coverage for `GameRouteController.selectAlertCity` remains unchanged and is run as a regression. The full component-local effect sequence is intentionally owned by the fast Playwright alert test in Task 4.

### Step 5: Pass focus through the existing modal/table after focus-trap initialization

`StoreDetailModal` gets optional `focusedProductId` and forwards it to `StoreStockTable`.

`StoreStockTable` gives each product row a stable identifier/data attribute and `tabindex="-1"`.

For a new `(storeId, focusedProductId)` request:

1. let the modal mount;
2. await Svelte `tick()` so `focusTrap` has completed its synchronous initial focus;
3. focus and scroll the requested row once.

Do not change the focus-trap implementation unless this ordering fails under the component test.

Pin in component tests:

```text
matching row has focus after mount settles
row remains tabindex=-1
Tab moves through normal modal controls rather than treating the row as a tab stop
changed focus request moves focus once to the new matching row
unmatched product focus does not choose another row
manual detail usage works with no focused product
```

### Step 6: Verify checkpoint 2

```bash
bun run test:unit -- --run \
  src/routes/alertNavigation.spec.ts \
  src/routes/page.svelte.spec.ts \
  src/lib/components/game/StoreDetailModal.svelte.spec.ts \
  src/lib/components/game/StoreStockTable.svelte.spec.ts
bun run check
```

Commit the navigation/focus checkpoint.

---

## Task 3: Render truthful recovery context, command feedback, and existing handoffs

**Modify:**
- `src/lib/components/game/StoreDetailModal.svelte`
- `src/lib/components/game/StoreStockTable.svelte`
- `src/lib/components/game/StoreStockTable.svelte.spec.ts`
- `src/routes/+page.svelte`
- `src/lib/i18n/gameCopy.ts`
- `src/lib/i18n/gameCopy.spec.ts`
- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`

### Step 1: Write RED localized affected-product alert tests

Refactor `localizeStockTrouble` to consume `getAffectedStockProductIds` and name the affected localized product labels rather than only returning counts.

Pin:

```text
OOS names precede Needs import names
within each group store product order is retained
healthy product names are absent
hand-written stock alert without productId still localizes from current store state
```

No fallback for `affectedProductIds` exists because that field is not added.

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

### Step 3: Add only the recovery fields missing from the existing row

Do **not** re-render:

```text
current shelf stock
reorder threshold
target stock
current live status
```

Those already exist as columns/controls on the same row.

For each unhealthy product, and for the explicitly focused product even if its status changed, add a compact detail region showing only:

```text
supply city/import fallback
next scheduled closing-day check
current eligibility explanation
latest historical dated receipt quantities/outcome if present
```

Copy requirements:

- the scheduled check runs after sales and is not a guaranteed delivery;
- `blocked-by-zero-threshold` points directly to raising the reorder threshold in this row;
- historical receipt wording never implies current stock is healthy;
- defensive `not-replenishable-product` does not advertise Manage supply / Plan supply as fixes.

Keep the detail inside the existing table scroll surface; do not add another modal or duplicate columns.

### Step 4: Preserve and consume `GameRouteCommitResult`

Change the route `changeStoreProduct(...)` handler to return:

```ts
Promise<GameRouteCommitResult | null>
```

`null` is for pre-command cases such as missing game/product or unavailable mutation command. Otherwise return the controller result unchanged.

In `StoreStockTable`, make inventory-target handling async and branch:

```text
committed -> success acknowledgement
sandbox-committed + changed true -> success acknowledgement
unchanged -> neutral no-change acknowledgement
sandbox-committed + changed false -> neutral no-change acknowledgement
all other result statuses / null -> localized not-saved status, never success
```

For a committed change:

1. await `onUpdate`;
2. await reactive prop settlement;
3. read the updated `StockRecoveryView`;
4. show transient status text containing the **actual stored** reorder/target values and next check day.

Example success meaning:

```text
Saved: reorder X, target Y. Next check: closing day N after sales.
```

A no-change edit uses current stored values but says no settings changed. A non-success result says settings were not saved and must not claim recovery.

Assert shelf quantity is unchanged by the edit itself.

Selling-price behavior remains otherwise unchanged; the caller may ignore the returned result where no acknowledgement needs it.

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

For `blocked-by-zero-threshold`, keep the reorder input as the primary fix. For defensive `not-replenishable-product`, omit/disable the misleading handoffs.

### Step 6: Add all three locales

Add matching keys for:

- affected-product stock alert;
- assigned/unassigned/unavailable import-fallback explanations;
- eligible / not-below-threshold / blocked-zero-threshold / defensive non-replenishable explanations;
- closing-day/after-sales timing text;
- receipt outcome/evidence text and historical qualifier;
- saved / no-change / not-saved inventory-setting statuses;
- Manage supply source / Plan supply actions.

Do not add duplicate labels for stock/reorder/target/status; existing table headings already own them.

English, Japanese, and Traditional Chinese must stay structurally complete.

### Step 7: Add Svelte tests

Cover:

```text
focused unhealthy row shows supply/timing/eligibility context without duplicating stock/reorder/target columns
zero-threshold copy points to the existing reorder input
assigned source says imports cover shortages
unassigned source says import fallback
historical local/mixed/import receipt is labeled with day and quantities
committed acknowledgement uses updated normalized values
unchanged result gives neutral no-change text
failed/busy/rejected/unavailable/null result gives no success claim
successful edit does not change displayed shelf stock by itself
Manage supply source callback carries current retail city
Plan supply callback carries focused product
not-replenishable defensive state does not expose misleading fix actions
narrow rendered structure keeps actions/context inside the table scroll surface
```

### Step 8: Verify checkpoint 3

```bash
bun run test:unit -- --run \
  src/lib/i18n/gameCopy.spec.ts \
  src/lib/components/game/StoreStockTable.svelte.spec.ts \
  src/lib/components/game/StoreDetailModal.svelte.spec.ts
bun run check
bun run lint
```

Commit the player-facing recovery checkpoint.

---

## Task 4: Split browser coverage along the two journeys that already exist

**Modify:**
- `src/routes/retail-sim.e2e.ts`
- `src/routes/time-flow.e2e.ts` only if a focused regression is needed; prefer preserving it unchanged when current assertions already cover modal/time ownership

Do not create a second seven-day browser journey.

### Step 1: Extend the existing fast cross-city stock-alert test only through acknowledgement

Reuse `cross-city stock alert deep-links to the origin city and tile`.

The fixture already:

- returns the active city to Harbor City;
- starves the Campus Junction store;
- produces a `store-stock` alert from the non-active city.

Update its expected endpoint from the basic tile-details dialog to the new Store detail deep link.

Keep this test fast: do **not** advance simulation days.

Assert:

```text
active retail city becomes Campus Junction
correct store detail opens directly
Stock tab is active
expected primary product row owns focus after mount settles
all affected products remain discoverable through the table/alert copy
valid reorder/target edit returns truthful committed acknowledgement
shelf quantity is unchanged immediately after edit
no receipt/recovery success is shown from the save alone
```

Keyboard/pointer activation share the same alert button callback; keep one browser activation path and rely on component/control accessibility tests rather than duplicating this whole browser setup for a second input modality.

### Step 2: Extend the existing slow weekly-import test with receipt evidence

Reuse `manage selected store stock and see weekly imports`, which already:

- opens the Store detail Stock tab;
- edits target/reorder settings;
- advances seven days;
- asserts external imports.

Add after the existing advance:

```text
reopen/inspect the store Stock row
historical receipt evidence names the completed report day
warehouse/import quantities match the recorded product report
current shelf status remains visibly separate from the historical receipt
```

Do not duplicate local/mixed/import permutations here; those remain unit tests.

### Step 3: Verify contextual handoffs and alert regressions without another week-long flow

Use focused component/route assertions where possible:

- Manage supply source opens Stores management focused on the correct retail city;
- Plan supply opens the planner on the correct product/city;
- unit tests keep the full non-stock alert resolver matrix.

Only add a small browser assertion for a handoff if implementation wiring is not otherwise exercised; do not extend either journey unnecessarily.

### Step 4: Run final verification

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e -- src/routes/retail-sim.e2e.ts src/routes/time-flow.e2e.ts
git diff --check main...HEAD
```

Expected: all pass.

### Step 5: Final review gate

Before marking HPA-293 ready for review, inspect the whole branch for:

```text
no schema/migration changes
no duplicated affected-product list on GameAlert
one shared getAffectedStockProductIds ordering rule
one shared retail supply-context resolver used by replenishment/planner/recovery
no duplicated seven-day cadence formula in Svelte
no new notification/repair subsystem
no direct shelf delivery from logistics routes
no persisted acknowledgement/focus state
no GameRouteCommitResult -> boolean information loss
no RNG consumption from read models
focus happens after focus-trap initialization and row stays outside Tab order
recovery detail does not duplicate stock/reorder/target/status columns
one alert per store
all three locales complete
existing fast alert E2E stays fast; existing slow weekly-import E2E owns receipt evidence
one PR for the ticket
```

Then update the draft PR summary/testing section and move it to review only after runtime implementation and verification are complete.
