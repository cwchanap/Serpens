# Store Stock Recovery Flow Design

**Date:** 2026-09-15
**Linear:** HPA-293 — Make store stock shortages actionable with truthful replenishment feedback
**Status:** Normative planning checkpoint; revised after codebase review
**Baseline:** `main` at `9a1d1d4d7393d50a1abd8b9a71bc396ffe071f10`

## Outcome

Turn the existing store-stock warning into a complete recovery loop without adding another notification, repair, or inventory system:

1. one store-stock alert identifies the affected store without snapshotting a derived product choice;
2. selecting it opens the correct retail city, store, Stock tab, and a deterministic live primary product row;
3. the existing row keeps owning shelf stock, reorder threshold, target stock, and live status while a compact recovery detail adds only supply context, next check, eligibility, and dated receipt evidence;
4. existing reorder/target controls continue through the current controller/autosave path;
5. inventory-target edits distinguish committed, unchanged, and non-success command outcomes without claiming that stock moved;
6. after time advances, completed reports provide dated receipt evidence separately from the current shelf condition.

This remains one HPA-293 delivery PR. Planning and runtime implementation stay on the same branch/PR.

## Review resolution

The revised design removes duplicated derived state rather than adding new abstractions:

- `GameAlert` does **not** gain `productId` or `affectedProductIds`; the live store remains the source for affected-product ordering and primary focus.
- Add `getAffectedStockProductIds(...)` beside the stock-status rules and reuse it for alert derivation, alert copy, and deep-link focus.
- Replace `resolveStockAlertFocus(alert, selectedStore)` with `resolveStockAlertDestination(alert, game)`. The helper finds the live store by `alert.storeId`, derives its live primary product, and returns the city/tile/store destination without reading reactive UI state.
- The route sets `selectedTileId`, `focusedStockProductId`, and `isStoreDetailOpen` directly after any required city commit. It does not call `openStoreDetail()` and does not wait for `selectedStore` before deciding whether to open.
- `StockRecoveryView` contains only data the existing stock row cannot already show: eligibility, next check, supply context/mode, and historical receipt evidence.
- Keep `localizeStockTrouble(...)` as the existing count-based inspector helper. Add an alert-only affected-product namer so naming products does not silently change `TileInspector` copy.
- Only inventory-target edits await and interpret `GameRouteCommitResult`. Selling-price edits continue to use the same callback but do not show reorder/target acknowledgement copy.
- Supply Planner reuses `resolveRetailSupplyContext(...)` only for its assignment/source preamble; it keeps `getIndustryInventoryScope(...)` for building and inventory snapshots. `productChainTree.ts` and `retailSupplySources.ts` remain untouched.
- `not-replenishable-product` stays in the pure read model to mirror the authoritative guard, but valid saves already constrain store products to the archetype/unlocked set. Do not add player copy or disabled-handoff chrome for that defensive state.

## Constraints

- One alert per store; no inbox or per-product alert spam.
- No `GameAlert.productId`, `affectedProductIds`, persisted focus, or acknowledgement state.
- Keep `GameState`, `updateStoreProduct`, `GameRouteController`, `simulateDay`, and completed `DailyReport` data authoritative.
- Reuse the seven-day cadence and supply resolution in `retailSupply.ts`; Svelte must not duplicate replenishment formulas.
- Replenishment is evaluated after sales on the closing day. Saving settings does not move stock and is not receipt evidence.
- Inter-city logistics delivers into city inventory; retail replenishment consumes assigned supply-city inventory and imports shortages. Routes never deliver directly to a shelf.
- Read models are pure: no RNG, mutation, autosave, or speculative future simulation.
- No save-schema changes, migration, buying command, emergency refill, repair workflow, forecast engine, global store, or broad route refactor.
- Reuse existing art and current UI treatment. No image-generation task is required.

## Existing seams

- `src/lib/game/alerts.ts` already emits one `store-stock` alert per unhealthy store.
- `src/lib/game/stock.ts` owns shelf quantity, live stock status, and normalized inventory-target edits.
- `src/lib/game/retailSupply.ts` owns the seven-day cadence, supply-city assignment, import fallback, replenishment, and receipt classification.
- `src/lib/game/supplyPlanner.ts` currently duplicates only the assignment/source preamble before using `getIndustryInventoryScope(...)` for its real planner snapshot.
- `src/lib/game/simulateDay.ts` runs sales before replenishment and stores completed report evidence.
- `src/lib/game/commandResult.ts` owns `GameRouteCommitResult`.
- `src/routes/+page.svelte` owns async city switching, route selection, modal state, planner handoffs, and controller mutations.
- `src/routes/alertNavigation.ts` owns pure alert-destination decisions.
- `StoreDetailModal.svelte` already defaults to Stock and contains `StoreStockTable.svelte`.
- `StoreStockTable.svelte` already renders stock, reorder, target, status, and edit controls.
- `TileInspector.svelte` also consumes `localizeStockTrouble(...)`, so that helper must retain its compact count copy.
- `focusTrap.ts` synchronously moves focus when the modal attaches and excludes `[tabindex="-1"]` from its Tab cycle.
- `retail-sim.e2e.ts` already has the fast cross-city alert journey and the slow weekly-import journey needed by this ticket.

## 1. One live affected-product rule; no product snapshot on alerts

Add one ordered helper beside `getStoreProductStatus` / `summarizeStockTrouble`:

```ts
export function getAffectedStockProductIds(
  products: readonly Pick<StoreProduct, 'productId' | 'lots' | 'reorderThreshold'>[]
): readonly ProductId[];
```

Ordering is:

```text
1. Out of stock
2. Needs import
```

Within each severity group preserve `store.products` order. Healthy products are omitted.

`collectGameAlerts` uses the helper only to decide whether the store is affected. The alert stays subject identity only:

```ts
{
  id: `store-stock:${store.id}`,
  kind: 'store-stock',
  cityId: store.cityId,
  storeId: store.id,
  tileId: store.tileId
}
```

Do not add `productId` or `affectedProductIds` to `GameAlert`.

### Alert copy vs inspector copy

Keep `localizeStockTrouble(...)` count-based because `TileInspector` uses it for its compact attention line.

Add a separate alert-only helper in `gameCopy.ts`, for example:

```ts
function localizeAffectedStockProducts(
  products: readonly Pick<StoreProduct, 'productId' | 'lots' | 'reorderThreshold'>[],
  i18n: I18nBundle
): string | null;
```

It calls `getAffectedStockProductIds(...)`, maps those IDs through existing localized product labels, and formats the ordered list. `localizeAlert(...)` already re-reads the live store, so it uses this helper and the existing `copy.alerts.storeStock` template.

This gives alerts named products while leaving inspector count copy unchanged.

## 2. Resolve the stock destination from live game state, not reactive selection

Keep `resolveAlertNavigation(...)` unchanged for panel/world-route destinations. Add beside it:

```ts
export interface StockAlertDestination {
  cityId: string;
  tileId: string;
  storeId: string;
  productId: ProductId | null;
}

export function resolveStockAlertDestination(
  alert: GameAlert,
  game: GameState
): StockAlertDestination | null;
```

Rules:

- return `null` unless `alert.kind === 'store-stock'` and `alert.storeId` resolves to a live store;
- use the live store's `cityId`, `tileId`, and `id` rather than trusting duplicated alert routing fields;
- derive `productId` as `getAffectedStockProductIds(store.products)[0] ?? null`;
- if the store is still present but no product is currently affected, return the destination with `productId: null` so the store still opens without focusing a stale row.

The generic `resolveAlertNavigation(...)` union does not change.

### Route effects

`handleSelectAlert(...)` keeps the existing generic branches first. For store stock:

1. resolve `resolveStockAlertDestination(alert, game)` before changing UI state;
2. when its city is not active, call the existing `gameRouteController.selectAlertCity(...)` and stop on any non-commit result;
3. call `showRetailMap()`;
4. set `selectedTileId = destination.tileId`;
5. set `focusedStockProductId = destination.productId`;
6. set `isStoreDetailOpen = true` directly.

Do **not** read `selectedStore`, await route-side reactive settlement, or call `openStoreDetail()`. The existing `{#if isStoreDetailOpen && selectedStore}` render condition naturally waits until the active city/tile derivation catches up.

This removes the cross-city race and makes the full destination decision unit-testable with a `GameState` fixture.

## 3. Product-row focus remains transient presentation state

Add route-local:

```ts
let focusedStockProductId = $state<ProductId | null>(null);
```

Manual store-detail opening and closing clear it. It is never persisted.

Pass optional `focusedProductId` through `StoreDetailModal` to `StoreStockTable`.

The matching row:

- has a stable DOM identifier/data attribute;
- is programmatically focusable with `tabindex="-1"`;
- after modal mount, awaits `tick()` so the modal focus trap has completed its synchronous initial focus;
- then scrolls/focuses the requested row once;
- leaves its existing inputs in the normal Tab order.

No new focus manager and no focus-trap change unless the focused component test proves `tick()` insufficient.

## 4. Export the cadence and supply-context seams; preserve planner scope

`retailSupply.ts` exposes:

```ts
export function getNextReplenishmentCheckDay(currentDay: number): number;

export function resolveRetailSupplyContext(
  game: GameState,
  retailCityId: WorldCityId
): RetailReplenishmentContext;
```

`getNextReplenishmentCheckDay` is defined next to `isReplenishmentDay` from the same interval convention:

```text
day 6 -> 7
day 7 -> 7
day 8 -> 14
```

`resolveRetailSupplyContext` is the current private function exported without changing its semantics. `applyWeeklyReplenishment` keeps using it.

### Supply Planner convergence is preamble-only

In `supplyPlanner.ts`, replace only the direct assignment lookup / configured-source availability preamble with `resolveRetailSupplyContext(...)`.

Unassigned or unresolved supply context remains planner `supply-city-unavailable` exactly as today.

After that preamble, keep:

```ts
const industry = getIndustryInventoryScope(game, context.resolvedSupplyCityId);
const inventoryStats = getCityInventoryStats(game, industry.cityId);
```

and the existing downstream building/inventory/demand snapshot logic.

Do not refactor `getIndustryInventoryScope`, `productChainTree.ts`, or `retailSupplySources.ts`; they solve different problems.

## 5. Pure stock-recovery read model emits only missing row context

Create `src/lib/game/stockRecovery.ts`:

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
  eligibility: StockRecoveryEligibility;
  nextCheckDay: number;
  supplyContext: RetailReplenishmentContext;
  supplyMode: StockRecoverySupplyMode;
  lastReceipt: StockReceiptEvidence | null;
}

export function buildStoreStockRecoveryViews(
  game: GameState,
  storeId: string
): ReadonlyMap<ProductId, StockRecoveryView>;
```

The map key is the product identity. Do not copy `productId`, current stock, live status, reorder threshold, or target stock into the view; the row already owns those values from the live `StoreProduct`.

### Eligibility

For each live product:

```text
if product is not replenishable by the store archetype -> not-replenishable-product
else if currentStock <= 0 && reorderThreshold === 0 -> blocked-by-zero-threshold
else if currentStock < reorderThreshold -> eligible-at-current-stock
else -> not-below-threshold
```

`blocked-by-zero-threshold` is player-actionable and points at the row's existing reorder input.

`not-replenishable-product` remains a defensive mirror of the authoritative replenishment guard. Valid current saves already constrain store products to the archetype/unlocked set, so do not add player-facing explanation or disabled-handoff chrome for it. Unit tests pin it only.

`updateStoreProduct` already normalizes `targetStock >= ceil(reorderThreshold)`, so no extra `neededUnits === 0` eligibility member is required.

### Supply context

Use `resolveRetailSupplyContext(...)` directly and derive the three UI supply modes from it. Do not describe a logistics route as direct shelf delivery.

### Historical receipt evidence

Scan `game.reports` newest-first. For the matching store/product, emit `lastReceipt` only when the completed store report has replenishment context and `warehouseUnits > 0 || importedUnits > 0`.

Use the report's day/quantities and existing `getRetailReplenishmentOutcome(...)`. This historical receipt can coexist with a currently empty shelf; the latest report's sold/missed values are not a substitute for finding the latest actual receipt.

No repair/action log is persisted.

## 6. Render only missing recovery context in the existing stock row

`StoreDetailModal` derives:

```ts
buildStoreStockRecoveryViews(game, store.id)
```

and passes the map into `StoreStockTable`.

The existing row remains authoritative for:

- current shelf quantity;
- reorder threshold;
- target stock;
- live status.

For an unhealthy product, and for an explicitly focused product whose status changed, render only:

- configured/resolved supply or import fallback;
- next scheduled closing-day check;
- current eligibility explanation;
- latest historical dated receipt, if any.

Do not add duplicate stock/threshold/target/status fields or columns.

`blocked-by-zero-threshold` points directly to raising the existing reorder-threshold input. The defensive `not-replenishable-product` state receives no dedicated locale copy or repair/handoff chrome.

## 7. Inventory acknowledgement uses command results; selling price does not

Keep the current `StoreStockTable` `onUpdate(...)` surface to avoid callback churn, but change its return type to:

```ts
(
  storeId: string,
  productId: ProductId,
  patch: StoreProductPatch
) => Promise<GameRouteCommitResult | null>
```

The route's `changeStoreProduct(...)` returns the controller result unchanged. `null` is only for pre-command cases such as missing game/product or unavailable mutation capability.

### Pin the field split

`StoreStockTable.updateNumber(...)` must branch by field:

- `sellingPrice`: invoke `onUpdate(...)` and ignore the returned result for acknowledgement purposes, preserving today's price-edit UX;
- `reorderThreshold` / `targetStock`: await `onUpdate(...)`, interpret `GameRouteCommitResult`, then acknowledge only this inventory edit.

Never let a selling-price edit produce `Saved: reorder X, target Y` or `not saved` inventory copy.

For inventory edits:

- `committed`, or `sandbox-committed` with `changed: true`: after `tick()`, read the committed product from the updated `store.products` prop plus `nextCheckDay` from the recovery view and show saved copy;
- `unchanged`, or `sandbox-committed` with `changed: false`: show neutral no-change copy from the current stored product values;
- any other status or `null`: show localized not-saved copy and no recovery claim.

The acknowledgement never says restocked/recovered and never treats a save as stock movement. Shelf quantity must remain unchanged immediately after the edit.

## 8. Reuse existing contextual handoffs

The recovery detail may expose only the existing destinations:

- **Manage supply source** -> close detail and call `openStoresManagement(store.cityId)`;
- **Plan supply** -> close detail and call `planSupplyProduct(productId)`.

Use the current planner-supported product set for the planner handoff. Do not add buy/repair/logistics-to-shelf actions.

For `blocked-by-zero-threshold`, the reorder input is the primary fix. The defensive `not-replenishable-product` state does not get handoff chrome.

## 9. Localization and accessibility

Add English, Japanese, and Traditional Chinese copy only for player-reachable recovery states/actions:

- assigned/unassigned/unavailable import-fallback explanations;
- eligible / not-below-threshold / blocked-zero-threshold explanations;
- closing-day/after-sales timing;
- historical receipt outcomes/evidence;
- saved / no-change / not-saved inventory-setting statuses;
- Manage supply source / Plan supply actions.

Do **not** add dedicated `not-replenishable-product` player copy.

Alert product naming uses existing localized product labels and the existing `copy.alerts.storeStock` template; keep `localizeStockTrouble` count keys unchanged for the inspector.

Accessibility requirements:

- existing alert activation remains pointer/keyboard accessible;
- deep-link row focus happens after focus-trap initialization via `tick()`;
- focused row is `tabindex="-1"` and outside normal Tab order;
- row inputs stay normal tab stops;
- status/acknowledgement is textual, not animation-only;
- no pause/speed ownership changes.

## 10. Determinism, persistence, and ownership invariants

- `buildStoreStockRecoveryViews` is pure for a given `GameState`.
- Calling it changes neither RNG nor state/reports/assignments/autosave.
- Alerts and destination resolution consume no RNG and do not mutate product order.
- Inventory settings still go through `GameRouteController.updateStoreInventoryTargets` and existing autosave.
- `simulateDay` remains the only mechanism that can produce replenishment receipt evidence.
- no persisted fields, schema version, migration, compatibility alias, or save converter.

## Verification shape

Focused tests pin:

- one alert per store, with no stock-specific product snapshot on `GameAlert`;
- `getAffectedStockProductIds(...)` OOS-first stable ordering;
- alert-only localized product names while `localizeStockTrouble(...)` and `TileInspector` retain count copy;
- `resolveStockAlertDestination(alert, game)` for live store, missing store, live primary product, and no-longer-affected store;
- no route-side dependency on `selectedStore` settlement before opening a cross-city store detail;
- focus after modal focus-trap initialization and outside Tab order;
- next-check behavior around the weekly boundary;
- Supply Planner parity after only its assignment/source preamble switches to `resolveRetailSupplyContext(...)`;
- equality, zero-threshold blocked behavior, and normalized target/threshold invariant;
- minimal recovery-view shape and purity;
- newest historical receipt vs current shelf status;
- inventory command acknowledgement for changed/unchanged/non-success outcomes;
- selling-price edits never emit inventory acknowledgement copy;
- contextual handoffs and all non-stock alert destinations remain unchanged;
- existing fast cross-city alert E2E proves alert -> store/product focus -> truthful inventory-edit acknowledgement without time advance;
- existing slow weekly-import E2E gains dated receipt/current-status assertions rather than creating another seven-day journey.

Final runtime verification remains defined in the implementation plan.