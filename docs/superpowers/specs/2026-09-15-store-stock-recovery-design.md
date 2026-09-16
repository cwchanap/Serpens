# Store Stock Recovery Flow Design

**Date:** 2026-09-15
**Linear:** HPA-293 — Make store stock shortages actionable with truthful replenishment feedback
**Status:** Normative planning checkpoint; revised after codebase review
**Baseline:** `main` at `9a1d1d4d7393d50a1abd8b9a71bc396ffe071f10`

## Outcome

Turn the existing store-stock warning into a complete recovery loop without adding another notification or repair system:

1. a store has one stock alert whose copy names every currently affected product;
2. selecting the alert opens the correct retail city, store, Stock tab, and deterministic primary product row;
3. the existing row keeps showing shelf stock, reorder threshold, target stock, and live status while a compact recovery detail adds supply source, next check, eligibility, and dated receipt evidence;
4. the player edits the existing reorder/target controls through the existing controller/autosave path;
5. the UI distinguishes a committed change, a no-op edit, and a non-success result without claiming that stock moved;
6. after time advances, the UI shows dated report evidence for warehouse/import receipts separately from the current shelf condition.

This is one HPA-293 delivery PR. The planning checkpoint and runtime implementation remain on the same branch/PR.

## Review resolution

Accepted:

- keep only the deterministic primary `productId` on `GameAlert`; derive the full affected-product list from current store state through one shared stock helper;
- return the existing `GameRouteCommitResult` to the stock table instead of collapsing command outcomes to `boolean`;
- add one pure stock-focus decision helper to `alertNavigation.ts` while leaving the async route effects in `+page.svelte`;
- order deep-link row focus after the modal focus trap's initial focus;
- reuse the existing slow weekly-import E2E for receipt evidence instead of building a second seven-day journey;
- do not repeat stock/reorder/target/status inside the recovery detail because the existing row already renders them;
- distinguish an empty shelf with zero reorder threshold as an actionable blocked state;
- converge the Supply Planner onto the exported retail-supply-context resolver;
- use the repository's `bun run test:e2e -- ...` script for targeted browser verification.

Partially accepted:

- `not-replenishable-product` remains a defensive read-model state because `applyWeeklyReplenishment` has that guard, but current save validation requires store products to belong to the archetype/unlocked set. Do not add extra repair UI for a state that valid current gameplay should not normally produce.
- do not force component-local stock-alert effects into `page.svelte.spec.ts` through a new route abstraction solely for testing. The pure store/product decision is unit-tested in `alertNavigation.spec.ts`; the existing `selectAlertCity` controller coverage remains; the fast stock-alert Playwright test owns the route effect sequence.

## Constraints

- Reuse the existing one-alert-per-store model; no notification inbox or per-product alert spam.
- Keep `GameState`, `updateStoreProduct`, `GameRouteController`, `simulateDay`, and `DailyReport` authoritative.
- Reuse the seven-day cadence and supply resolution in `retailSupply.ts`; Svelte must not duplicate replenishment formulas.
- Replenishment is evaluated after sales on the closing day. Saving settings does not move stock and does not mean a delivery happened.
- Inter-city logistics delivers into city inventory. Retail replenishment consumes its assigned supply-city inventory and imports any shortage; it never treats a route arrival as a direct shelf delivery.
- Read models are pure: no RNG consumption, state mutation, autosave, or speculative simulation.
- No save-schema changes or migration work.
- No new buying command, emergency refill, automatic repair, forecast engine, global store, or broad route refactor.
- Reuse existing store/product art and the current parchment/brass UI. No image-generation task is required.

## Existing seams

The feature can stay narrow because the necessary ownership already exists:

- `src/lib/game/alerts.ts` already emits one `store-stock` alert per unhealthy store.
- `src/lib/game/stock.ts` owns live shelf quantity, `Out of stock` / `Needs import` / `Healthy`, and normalized inventory-target edits.
- `src/lib/game/retailSupply.ts` owns the seven-day cadence, supply-city assignment, import fallback, replenishment execution, and local/mixed/import outcome classification.
- `src/lib/game/supplyPlanner.ts` currently repeats the retail supply assignment/source resolution and should consume the exported authoritative helper.
- `src/lib/game/simulateDay.ts` runs sales before replenishment and persists `DailyStoreReport` / `DailyProductReport` evidence under the closing day.
- `src/lib/game/commandResult.ts` already defines the shared `GameRouteCommitResult` consumed by route and UI components.
- `src/routes/+page.svelte` already owns async alert-city switching, selected store/tile state, planner handoffs, management-panel handoffs, and controller mutations.
- `src/routes/gameRouteController.ts` already owns inventory-target commands and autosave.
- `src/routes/alertNavigation.ts` already owns pure alert-destination decisions.
- `StoreDetailModal.svelte` already defaults to the Stock tab and contains `StoreStockTable.svelte`.
- `StoreStockTable.svelte` already renders product rows plus stock, reorder, target, status, and the existing controls.
- `focusTrap.ts` intentionally excludes `[tabindex="-1"]` from the Tab cycle but synchronously moves focus to the first focusable element when the modal attaches.
- `retail-sim.e2e.ts` already contains both a non-active-city stock-alert journey and a separate slow weekly-import journey.

## 1. Alert contract: one store alert, one primary focus field

Add one shared ordered helper next to the stock-status rules:

```ts
export function getAffectedStockProductIds(
  products: readonly StoreProduct[]
): readonly ProductId[];
```

Ordering is:

```text
1. Out of stock
2. Needs import
```

Within each group, preserve the existing `store.products` order. Healthy products are omitted.

Extend the derived `GameAlert` shape only with the primary focus target:

```ts
export interface GameAlert {
  // existing fields...
  productId?: ProductId;
}
```

`collectGameAlerts` calls `getAffectedStockProductIds(store.products)` and uses the first ID as `productId`. It still emits exactly one alert per store.

Do **not** add `affectedProductIds` to `GameAlert`. Alerts are derived from live state, and `localizeAlert` already has the current `GameState`; duplicating the full affected list on the alert would create a second derived representation plus a fallback branch.

`localizeStockTrouble` uses the same ordered helper to name the affected localized products. Hand-written test alerts may omit `productId`; copy still derives from the store state.

Do not persist alerts or product-focus state.

## 2. Keep generic alert routing small, extract only the focus decision

`resolveAlertNavigation` remains the pure resolver for generic management-panel and world-route destinations. Do not widen its union just for HPA-293.

Add a narrow helper beside it:

```ts
export function resolveStockAlertFocus(
  alert: GameAlert,
  selectedStore: Store | null
): { productId: ProductId | null } | null;
```

Rules:

- return `null` unless `alert.kind === 'store-stock'`, `alert.storeId` exists, and `selectedStore.id === alert.storeId`;
- when `alert.productId` still exists in that store, return it as the focus target;
- when the store matches but the alert has no usable `productId`, return `{ productId: null }` so the correct detail can still open without focusing a wrong row.

The route keeps the existing effects that require async state:

1. switch to the alert's retail city through `gameRouteController.selectAlertCity(...)` when necessary;
2. show the retail map;
3. select the alert's tile;
4. await reactive settlement;
5. call `resolveStockAlertFocus(alert, selectedStore)`;
6. if it returns non-null, set transient `focusedStockProductId` and open `StoreDetailModal`.

The existing panel/world-route branches remain unchanged. This gives the risky store-identity/missing-product decision a unit-test home without creating a second router or moving route effects out of `+page.svelte`.

## 3. Product-row focus is transient presentation state and follows the focus trap

Add an optional `focusedProductId` handoff through `StoreDetailModal` to `StoreStockTable`.

The matching row:

- has a stable DOM identifier/data attribute;
- is programmatically focusable with `tabindex="-1"`;
- scrolls into view and receives focus once when the focus request changes;
- keeps all existing inputs in the normal tab order.

The initial deep-link focus must happen **after** `focusTrap` performs its synchronous initial focus. Use the existing Svelte `tick()` boundary before focusing/scrolling the row; do not add a new focus-manager abstraction or modify `focusTrap` unless implementation proves the tick ordering insufficient.

Tests pin both:

- the requested product row owns focus after modal mount settles;
- because the row is `tabindex="-1"`, subsequent Tab navigation still cycles through the modal's normal focusable controls rather than the row itself.

Manual store-detail opening clears the alert focus. Closing the modal also clears it. Nothing is written to `GameState` or save data.

Because pointer and keyboard alert activation already share the same `onSelectAlert` callback, both interaction methods use the same navigation path.

## 4. Centralize replenishment timing and supply context completely

Promote the existing retail-supply helpers instead of reproducing their rules in UI or planner code.

`retailSupply.ts` exposes:

```ts
export function getNextReplenishmentCheckDay(currentDay: number): number;

export function resolveRetailSupplyContext(
  game: GameState,
  retailCityId: WorldCityId
): RetailReplenishmentContext;
```

`getNextReplenishmentCheckDay` follows `isReplenishmentDay` / `REPLENISHMENT_INTERVAL_DAYS`:

- current day 7 -> check on closing day 7;
- current day 8 -> next check on closing day 14;
- the helper is the only place added for this calculation.

`resolveRetailSupplyContext` is the current private resolver made reusable. It is consumed by:

- `applyWeeklyReplenishment`;
- `stockRecovery.ts`;
- `supplyPlanner.ts` instead of its current assignment/source-resolution copy.

The planner keeps its existing unavailable result semantics when the returned context has no configured or resolved supply city. Existing planner tests pin behavior parity.

## 5. Add one pure stock-recovery read model

Create `src/lib/game/stockRecovery.ts`. It composes existing stock, retail-supply, archetype, world-city, and report APIs; it does not own new simulation rules.

```ts
export type StockRecoveryEligibility =
  | 'eligible-at-current-stock'
  | 'not-below-threshold'
  | 'blocked-by-zero-threshold'
  | 'not-replenishable-product';

export type StockRecoverySupplyMode =
  | 'assigned-city-with-import-fallback'
  | 'unassigned-import-fallback'
  | 'unavailable-source-import-fallback';

export interface StockReceiptEvidence {
  day: number;
  warehouseUnits: number;
  importedUnits: number;
  outcome: RetailReplenishmentOutcome;
}

export interface StockRecoveryView {
  productId: ProductId;
  currentStock: number;
  status: StoreProductStatus;
  reorderThreshold: number;
  targetStock: number;
  eligibility: StockRecoveryEligibility;
  nextCheckDay: number;
  configuredSupplyCityId: WorldCityId | null;
  resolvedSupplyCityId: WorldCityId | null;
  supplyMode: StockRecoverySupplyMode;
  lastReceipt: StockReceiptEvidence | null;
}

export function buildStoreStockRecoveryViews(
  game: GameState,
  storeId: string
): ReadonlyMap<ProductId, StockRecoveryView>;
```

### Current eligibility

The read model describes what the current shelf state would do at a replenishment check; it does not promise the same state will still exist when that check runs.

Use the live rule and guard order:

```text
if product is not replenishable by the store archetype -> not-replenishable-product
else if currentStock <= 0 && reorderThreshold === 0 -> blocked-by-zero-threshold
else if currentStock < reorderThreshold -> eligible-at-current-stock
else -> not-below-threshold
```

`blocked-by-zero-threshold` is actionable: copy points the player at the existing reorder-threshold input because an empty shelf with threshold `0` can never satisfy `stock < reorderThreshold`.

`not-replenishable-product` mirrors the authoritative replenishment guard defensively, but valid current saves already restrict store products to the archetype/unlocked set. Do not expose supply/planner actions as if they can repair this state.

`neededUnits === 0` does not need another eligibility member: `updateStoreProduct` normalizes `targetStock >= ceil(reorderThreshold)`, so a UI-reachable below-threshold product has positive target headroom. Pin that invariant once in tests.

UI copy explicitly says the actual check occurs after that closing day's sales, so stock that is currently at/above the threshold can still become eligible later that day.

### Supply source

Describe the real replenishment path:

- assigned/resolved supply city: consume matching city inventory first, imports cover shortage;
- no configured supply city: imports are the fallback source;
- configured but unavailable source: imports cover the replenishment.

Do not describe an inter-city route as delivering directly to the store shelf.

### Historical receipt evidence

Search completed reports newest-first for the same store/product. A receipt exists only when `warehouseUnits > 0` or `importedUnits > 0` and the store report carries replenishment context.

Classify it with the existing `getRetailReplenishmentOutcome(...)`. Preserve the report's `day`, `warehouseUnits`, and `importedUnits`.

This evidence remains explicitly historical. `currentStock` and live `status` come from current state, so the UI can truthfully say “received on day 7” even if the product has sold out again afterward.

Do not persist a repair/action log.

## 6. Render only the missing recovery context in the existing stock row

`StoreDetailModal` has full `GameState`, so it derives `buildStoreStockRecoveryViews(game, store.id)` and passes the read models into `StoreStockTable`. `StoreStockTable` does not own a second copy of simulation logic or a global game store.

The existing row already shows:

- current shelf quantity;
- reorder threshold;
- target stock;
- live stock/status.

Do not repeat those values in a second detail block.

For an unhealthy product, and always for the explicitly focused product, add a compact detail region that shows only what the row does not already provide:

- configured/resolved supply source or import fallback;
- next scheduled closing-day check;
- current-eligibility explanation and direct zero-threshold fix when applicable;
- most recent **historical** dated receipt evidence, if any.

The row's existing live status remains visibly separate from the historical receipt. The detail fits inside the existing table scroll surface; do not add another modal or new duplicate columns.

## 7. Existing edits, truthful command-result acknowledgement

Keep the current reorder/target inputs. Do not add a dedicated “repair” command.

The route's `changeStoreProduct(...)` awaits the existing controller command and returns:

```ts
Promise<GameRouteCommitResult | null>
```

`null` is reserved for pre-command cases such as missing game/product or command unavailability. Do not collapse the controller's shared union to `boolean`.

For inventory-target edits, `StoreStockTable` awaits the callback and handles the result truthfully:

- `committed` or `sandbox-committed` with `changed: true`: after the reactive prop update, read the updated recovery view and show `Saved: reorder X, target Y. Next check: closing day N after sales.`;
- `unchanged` or `sandbox-committed` with `changed: false`: show neutral no-change copy using the current stored values and next check;
- any busy/rejected/unavailable/failed/confirmation result: show one localized non-success status and make no success/recovery claim.

The acknowledgement is presentation-only and uses the actual stored values after `updateStoreProduct` normalization. It never says “restocked”, “recovered”, or otherwise treats a successful save as inventory movement.

Stock quantity must remain unchanged immediately after saving target settings.

Selling-price behavior remains otherwise unchanged; callers that do not need the result may ignore the returned union.

## 8. Contextual supply and planner handoffs

The recovery detail exposes two existing destinations rather than inventing repair actions:

- **Manage supply source** -> close store detail and call the existing Stores management handoff for `store.cityId` (`openStoresManagement`).
- **Plan supply** -> close store detail and call the existing Supply Planner handoff for that `productId` (`planSupplyProduct`).

The alert path has already selected the store's retail city before either action is available, so the planner remains scoped to the correct city. Reuse the route's current `plannerProductIds` to disable/omit a planner handoff when the product is not currently supported.

For `blocked-by-zero-threshold`, keep the reorder input as the primary fix; the handoffs remain secondary context. For defensive `not-replenishable-product`, do not imply either handoff can make shelf replenishment occur.

The Stores panel remains city-level because retail supply assignment is city-level in the authoritative model.

## 9. Localization and accessibility

Add matching copy to English, Japanese, and Traditional Chinese message catalogs.

Accessibility requirements:

- alert activation works from pointer and keyboard through the existing control;
- deep-link focus is applied after the modal focus trap's initial focus;
- the focused product row is `tabindex="-1"`, receives programmatic focus, and remains outside the normal Tab cycle;
- all existing row inputs remain normal tab stops;
- recovery status/acknowledgement uses appropriate status text, not animation-only feedback;
- product names in alert copy use existing localized product labels;
- recovery content remains readable in the stock table's narrow horizontal-scroll layout;
- no pause/speed ownership changes.

No new animation is required.

## 10. Determinism, persistence, and ownership invariants

HPA-293 must preserve these invariants:

- `buildStoreStockRecoveryViews` is referentially pure for a given state.
- Calling it does not change `rngState`, `cash`, reports, stock, assignments, or autosave state.
- Alert derivation consumes no RNG and does not mutate product order.
- A settings edit goes through `GameRouteController.updateStoreInventoryTargets` and the existing save path.
- `simulateDay` remains the only mechanism that can produce replenishment receipt evidence.
- no new persisted fields, schema version, migration, compatibility alias, or save converter.

## Verification shape

Focused tests should pin:

- one alert per store and deterministic OOS-first primary selection from the shared affected-product helper;
- localized names for all affected products in alert copy without duplicating the list on `GameAlert`;
- next-check behavior immediately before/on/after a boundary;
- Supply Planner behavior parity after it switches to `resolveRetailSupplyContext`;
- equality (`stock === threshold`), empty-stock/zero-threshold blocked behavior, and target/threshold normalization;
- current eligibility can differ from the eventual post-sales check without forecasting sales;
- assigned-city, mixed, import-only, and unassigned-import receipt evidence;
- historical receipt vs current shelf status;
- read-model purity;
- stock-focus decision for matching store, mismatched store, missing product, and missing focus ID;
- deep-linked row keeps focus after modal mount and stays outside the Tab cycle;
- command-result acknowledgement distinguishes changed, unchanged, and non-success outcomes and never alters stock by itself;
- contextual handoffs and existing non-stock alert destinations remain unchanged;
- the existing fast non-active-city stock-alert E2E proves alert -> exact focus -> edit acknowledgement without advancing time;
- the existing slow weekly-import E2E gains the dated receipt/current-status assertions instead of creating a second seven-day journey.

Final runtime verification is defined in the implementation plan.
