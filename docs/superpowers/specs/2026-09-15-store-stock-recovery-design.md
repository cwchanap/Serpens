# Store Stock Recovery Flow Design

**Date:** 2026-09-15
**Linear:** HPA-293 — Make store stock shortages actionable with truthful replenishment feedback
**Status:** Normative planning checkpoint
**Baseline:** `main` at `9a1d1d4d7393d50a1abd8b9a71bc396ffe071f10`

## Outcome

Turn the existing store-stock warning into a complete recovery loop without adding another notification or repair system:

1. a store has one stock alert that names every affected product;
2. selecting the alert opens the correct retail city, store, Stock tab, and deterministic primary product row;
3. that row explains the current shelf state, reorder rule, target, supply source, and next scheduled replenishment check;
4. the player edits the existing reorder/target controls through the existing controller/autosave path;
5. the UI acknowledges only the values that were actually stored;
6. after time advances, the UI shows dated report evidence for warehouse/import receipts separately from the current shelf condition.

This is one HPA-293 delivery PR. The planning checkpoint and runtime implementation remain on the same branch/PR.

## Constraints

- Reuse the existing one-alert-per-store model; no notification inbox or per-product alert spam.
- Keep `GameState`, `updateStoreProduct`, `GameRouteController`, `simulateDay`, and `DailyReport` authoritative.
- Reuse the seven-day cadence and supply resolution in `retailSupply.ts`; Svelte must not duplicate replenishment formulas.
- Replenishment is evaluated after sales on the closing day. Saving settings does not move stock and does not mean a delivery happened.
- Inter-city logistics delivers into city inventory. Retail replenishment consumes its assigned supply-city inventory and imports any shortage; it never treats a route arrival as a direct shelf delivery.
- Read models are pure: no RNG consumption, state mutation, autosave, or speculative simulation.
- No save-schema changes or migration work.
- No new buying command, emergency refill, automatic repair, forecast engine, global store, or route refactor.
- Reuse existing store/product art and the current parchment/brass UI. No image-generation task is required.

## Existing seams

The feature can stay narrow because the necessary ownership already exists:

- `src/lib/game/alerts.ts` already emits one `store-stock` alert per unhealthy store.
- `src/lib/game/stock.ts` owns live shelf quantity, `Out of stock` / `Needs import` / `Healthy`, and normalized inventory-target edits.
- `src/lib/game/retailSupply.ts` owns the seven-day cadence, supply-city assignment, import fallback, replenishment execution, and local/mixed/import outcome classification.
- `src/lib/game/simulateDay.ts` runs sales before replenishment and persists `DailyStoreReport` / `DailyProductReport` evidence under the closing day.
- `src/routes/+page.svelte` already owns async alert-city switching, selected store/tile state, planner handoffs, management-panel handoffs, and controller mutations.
- `src/routes/gameRouteController.ts` already owns inventory-target commands and autosave.
- `StoreDetailModal.svelte` already defaults to the Stock tab and contains `StoreStockTable.svelte`.
- `StoreStockTable.svelte` already renders product rows and the existing reorder/target controls.
- the existing `retail-sim.e2e.ts` fixture already proves a stock alert can originate from a non-active retail city.

## 1. Alert contract: one store alert, richer product identity

Extend the derived `GameAlert` shape with stock-specific product identity:

```ts
export interface GameAlert {
  // existing fields...
  productId?: ProductId;
  affectedProductIds?: readonly ProductId[];
}
```

For each store, derive affected products from `store.products` in two stable groups:

```text
1. Out of stock
2. Needs import
```

Within each group, preserve the existing `store.products` order. The first ID is `productId`; the full stable list is `affectedProductIds`.

This gives deterministic focus without creating one alert per product. `localizeAlert` uses the affected IDs to name the products. If a hand-written/legacy test alert omits the new derived fields, localization may derive the current affected products from the store rather than fail.

Do not persist alerts or product-focus state.

## 2. Keep generic alert routing small

`resolveAlertNavigation` remains the pure resolver for generic management-panel and world-route destinations. Do not turn it into a new all-purpose router just for HPA-293.

The existing store-stock fallback in `+page.svelte` already owns the behavior that requires route state and an asynchronous city-selection command. Extend that existing branch to:

1. switch to the alert's retail city through `gameRouteController.selectAlertCity(...)` when necessary;
2. show the retail map;
3. select the alert's tile;
4. verify the selected store still matches `alert.storeId` after the city/tile handoff;
5. set a transient `focusedStockProductId` from `alert.productId`;
6. open the existing `StoreDetailModal`.

The existing panel/world-route branches remain unchanged except for regression tests. This avoids widening the router union and keeps the async command boundary in the route where it already lives.

## 3. Product-row focus is transient presentation state

Add an optional `focusedProductId` handoff through `StoreDetailModal` to `StoreStockTable`.

The matching row:

- has a stable DOM identifier/data attribute;
- is programmatically focusable with `tabindex="-1"`;
- scrolls into view and receives focus once when the focus request changes;
- keeps all existing inputs in the normal tab order.

Manual store-detail opening clears the alert focus. Closing the modal also clears it. Nothing is written to `GameState` or save data.

Because pointer and keyboard alert activation already share the same `onSelectAlert` callback, both interaction methods use the same navigation path.

## 4. Centralize replenishment timing and supply context

Promote the existing retail-supply helpers instead of reproducing their rules in UI code.

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

`resolveRetailSupplyContext` is the current private resolver made reusable; replenishment execution continues to call the same function.

## 5. Add one pure stock-recovery read model

Create `src/lib/game/stockRecovery.ts`. It composes existing stock, retail-supply, archetype, world-city, and report APIs; it does not own new simulation rules.

```ts
export type StockRecoveryEligibility =
  | 'eligible-at-current-stock'
  | 'not-below-threshold'
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

Use the live rule:

```text
stock < reorderThreshold
```

with the existing starting-product eligibility check. Equality is not eligible. In particular, an empty shelf with threshold `0` is not below its threshold and therefore will not refill under current rules.

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

## 6. Render recovery context in the existing stock surface

`StoreDetailModal` has full `GameState`, so it derives `buildStoreStockRecoveryViews(game, store.id)` and passes the read models into `StoreStockTable`. `StoreStockTable` does not need to own a second copy of simulation logic or a global game store.

For an unhealthy product, and always for the explicitly focused product, render a compact recovery detail directly with its existing row. It shows:

- current shelf quantity;
- reorder threshold;
- target stock;
- supply source/import-fallback description;
- next scheduled check day;
- current-eligibility explanation;
- most recent dated receipt evidence, if any;
- current shelf status separately from the historical receipt.

The detail should fit the existing scrollable table on narrow screens; do not add another modal or a wide set of new columns.

## 7. Existing edits, truthful acknowledgement

Keep the current reorder/target inputs. Do not add a dedicated “repair” command.

Change the route's `changeStoreProduct(...)` handler to await the existing controller command and return whether the mutation actually committed. `StoreStockTable` awaits the callback for inventory-target edits and, after the reactive props update, records a local transient acknowledgement from the updated recovery view:

```text
Saved: reorder X, target Y. Next check: closing day N after sales.
```

The acknowledgement is presentation-only and uses the actual stored values after `updateStoreProduct` normalization. It never says “restocked”, “recovered”, or otherwise treats a successful save as inventory movement.

Stock quantity must remain unchanged immediately after saving target settings.

## 8. Contextual supply and planner handoffs

The recovery detail exposes two existing destinations rather than inventing repair actions:

- **Manage supply source** -> close store detail and call the existing Stores management handoff for `store.cityId` (`openStoresManagement`).
- **Plan supply** -> close store detail and call the existing Supply Planner handoff for that `productId` (`planSupplyProduct`).

The alert path has already selected the store's retail city before either action is available, so the planner remains scoped to the correct city. Reuse the route's current `plannerProductIds` to disable/omit a planner handoff when the product is not currently supported.

The Stores panel remains city-level because retail supply assignment is city-level in the authoritative model.

## 9. Localization and accessibility

Add matching copy to English, Japanese, and Traditional Chinese message catalogs.

Accessibility requirements:

- alert activation works from pointer and keyboard through the existing control;
- the focused product row receives programmatic focus without removing input tab stops;
- recovery status/acknowledgement uses appropriate status text, not animation-only feedback;
- product names in alert copy use existing localized product labels;
- recovery content remains readable in the stock table's narrow horizontal-scroll layout;
- no focus trap or pause/speed ownership changes.

No new animation is required. Existing modal/focus treatment is sufficient for this slice.

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

- one alert per store with all affected IDs and deterministic OOS-first primary selection;
- localized product names in alert copy;
- next-check behavior immediately before/on/after a boundary;
- equality (`stock === threshold`) and empty-stock/zero-threshold behavior;
- current eligibility can differ from the eventual post-sales check without forecasting sales;
- assigned-city, mixed, import-only, and unassigned-import receipt evidence;
- historical receipt vs current shelf status;
- read-model purity;
- committed edit acknowledgement uses normalized stored values and does not alter stock;
- focused row behavior and contextual handoffs;
- existing finance, decision, manager, logistics, and factory alert destinations remain unchanged;
- the existing non-active-city Playwright stock-alert journey becomes the end-to-end recovery journey.

Final runtime verification is defined in the implementation plan.