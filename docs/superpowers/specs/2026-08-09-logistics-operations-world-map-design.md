# Logistics Operations and World-Route UI Design

**Date:** 2026-08-09
**Status:** Proposed for HPA-574
**Prerequisites:** HPA-294 / PR #35 and HPA-568 / PR #38 are merged
**Delivery:** One player-facing implementation PR after this design/plan PR

## Summary

HPA-574 makes the HPA-294 inter-city logistics core playable without creating a second logistics system in the UI.

The implementation extends the route-local presentation boundaries introduced by HPA-568 and consumes the typed commands, immutable transfer/attempt evidence, and pure read models delivered by HPA-294. `+page.svelte` remains the transient selection/navigation root. `GameRouteController` remains the only command/persistence coordinator.

The player gets four concrete capabilities:

1. quote and dispatch a one-off industry-to-industry transfer;
2. create and manage recurring logistics routes;
3. inspect current routes, in-transit material, recent transfer history, and daily logistics evidence;
4. see and select simple operational route connections on the existing world map.

The design deliberately avoids a generic operations framework, map graph engine, route animation layer, new persistence, or scenario logistics authoring.

## Stable decisions

Keep these decisions unchanged through implementation:

- HPA-574 is presentation/command adaptation over HPA-294; it owns no transport arithmetic, scheduler, inventory accounting, persistence, or scenario command semantics.
- Add exactly three logistics-specific components: `LogisticsPanel.svelte`, `WorldLogisticsRoutes.svelte`, and `LogisticsRouteInspector.svelte`.
- Extend `ManagementPanelHost`, `MapSurfaceHost`, and `MapInspectorHost`; do not introduce another route controller, store/context layer, event bus, form engine, graph engine, or router-within-the-route.
- Render world routes with DOM/SVG over the existing world map coordinates; do not add a Phaser world scene, pathfinding, vehicles, or animation infrastructure.
- Add one `manageLogistics` capability rather than seven duplicated mutation flags.
- Preserve typed logistics rejection as `{ status: 'logistics-rejected'; reason }`; do not collapse command failures to bare `rejected` and do not persist rejected commands solely to create HUD alerts.
- Derive logistics alerts only from HPA-294 attempt evidence. Capacity pressure requires two consecutive constrained attempts. Paused routes emit no normal-operation logistics alerts. No counters are persisted.
- `destinationNeed === 0` classifies as `destination-full` before any origin/capacity interpretation.
- Historical utilization comes from HPA-294 attempt-recorded capacity and is never recomputed from current route settings.
- No save-schema change and no scenario logistics commands.

## Existing contracts remain authoritative

### HPA-294 commands

The UI consumes the existing APIs in `src/lib/game/interCityLogistics.ts`:

```ts
quoteInterCityTransfer(game, input)
dispatchManualTransfer(game, input)
createRecurringRoute(game, input)
updateRecurringRoute(game, routeId, input)
pauseRecurringRoute(game, routeId)
resumeRecurringRoute(game, routeId)
reprioritizeRecurringRoute(game, routeId, priority)
removeRecurringRoute(game, routeId)
```

Typed failures remain the source of truth for invalid endpoints, same-city transfers, materials, quantities, capacity, frequency, lead time, transport cost, priority, stock, cash, and missing routes.

### HPA-294 read models

The UI consumes `src/lib/game/logisticsReadModels.ts`:

```ts
selectInTransitInventory(game)
selectRecentTransfers(game)
selectRouteOperations(game)
selectLogisticsTotals(game)
```

`RouteOperationalSummary.utilization` already uses the latest attempt's recorded capacity. HPA-574 may add small pure evidence-classification helpers beside these selectors when several presentation surfaces need the same interpretation. It must not add a mutable/cached logistics projection.

## State ownership

### Persisted state

No new persisted state is required. HPA-574 reads:

```ts
game.logistics.transferOrders
game.logistics.recurringRoutes
game.reports[*].logistics
```

There is no save-schema bump and no migration.

### Transient route state

`+page.svelte` adds only presentation state:

```ts
let selectedLogisticsRouteId = $state<string | null>(null);
let focusedLogisticsRouteId = $state<string | null>(null);
let focusedLogisticsTransferId = $state<string | null>(null);
```

The selected route drives the world-route inspector. Focus IDs let reports and management navigation open the existing Logistics surface at the relevant route or transfer.

These IDs are not gameplay state and are never persisted.

### Selection exclusivity

World-city and world-route inspection are mutually exclusive:

- selecting a city clears `selectedLogisticsRouteId`;
- selecting a route clears `selectedWorldCityId`;
- retail/industry selection clears route selection alongside sibling map selections;
- leaving the world map hides the route inspector;
- reset/load/scenario-transition paths that clear sibling map selections also clear logistics route/focus state where appropriate;
- removing the selected current route leaves no stale inspector because the selected summary is derived from current route operations, and the successful removal handler clears matching focus state.

Do not add a generic selection store or navigation reducer.

## Route command boundary

### First-class logistics rejection arm

The live `GameRouteController` transition machinery currently understands successful game transitions, finance-shaped failures, and decision failures. HPA-294 logistics failures are `{ ok: false; reason }`, so HPA-574 must explicitly adapt them instead of relying on an ambiguous “reuse `commitMutation`” instruction.

Extend the internal transition type in `src/routes/gameRouteController.ts`:

```ts
type RouteTransitionResult<TReceipt = undefined> =
  | { ok: true; game: GameState; receipt: TReceipt }
  | { ok: false; code: FinanceFailureCode; context: Record<string, string | number> }
  | { ok: false; decisionFailure: Extract<DecisionResolutionResult, { ok: false }> }
  | { ok: false; logisticsFailure: LogisticsFailureCode };
```

Add to the public route result in `src/lib/game/commandResult.ts`:

```ts
export type LogisticsFailureCode = ManualTransferFailure | RecurringRouteFailure;

export type GameRouteCommitResult =
  | existing variants
  | { status: 'logistics-rejected'; reason: LogisticsFailureCode };
```

Each public logistics controller method wraps the HPA-294 domain result before it reaches `normalizeRouteTransition`:

```ts
const result = dispatchManualTransferTransition(game!, input);
return result.ok
  ? { ok: true, game: result.game, receipt: result.order }
  : { ok: false, logisticsFailure: result.reason };
```

The sandbox rejection branch in `commitMutation` checks `logisticsFailure` before falling through to finance `domain-rejected`, returning the exact typed reason without publishing or autosaving.

Do not mirror the existing retail-supply preflight path that loses typed detail. Do not create a second sandbox mutation pipeline.

### Scenario boundary

The seven logistics methods omit `scenarioCommand`. In scenario mode `commitMutation` therefore returns `unavailable` before any logistics transition executes. No scenario-side logistics rejection plumbing is needed in HPA-574.

This preserves current scenario definitions and avoids adding commands merely to make the controller type symmetric.

## Mutation availability

Add one capability:

```ts
interface MutationAvailability {
  // existing fields
  manageLogistics: boolean;
}
```

Its contract is exactly:

```ts
manageLogistics: input.playMode === 'sandbox'
```

Do not add an invented sandbox pending gate. The existing `pending` field is scenario-only (`input.playMode === 'scenario' && input.pending`). Logistics inspection remains available in all modes, while the panel disables mutation controls when `manageLogistics` is false.

## Logistics management surface

Add `logistics` to `ManagementPanelId` and bind shortcut **L**.

`LogisticsPanel` contains four concrete responsive sections rather than tabs or nested routing:

1. **Manual transfer**
2. **Recurring routes**
3. **In transit**
4. **Recent transfers / totals**

The panel receives `GameState`, i18n, mutation availability, focus IDs, and explicit command callbacks. It calls HPA-294 selectors/quote helpers; it never computes dispatch quantity, destination reservations, transport cost, or historical utilization.

### Endpoint option filtering

Presentation should avoid obviously invalid endpoint choices without replacing HPA-294 validation.

Origin/destination selects contain only city IDs that are all of:

- opened in `game.world.openedCityIds`;
- industry cities in the world catalog/current generated industry-city set;
- materialized in `game.industryCities`;
- backed by an entry in `game.cityInventories`.

HPA-294 still validates every submitted quote/command.

Do **not** filter the material catalog by current positive origin stock. A recurring route may validly be configured before future production creates stock, and a manual transfer should surface `insufficient-origin-stock` through the authoritative quote instead of silently hiding a material.

### Manual transfer flow

Fields:

- origin industry city;
- destination industry city;
- material;
- quantity.

Use `quoteInterCityTransfer` for quote evidence. A successful quote shows lead time, per-unit cost, and total cost. A failed quote shows the localized typed reason.

Dispatch submits the same input through `GameRouteController`. A command-time rejection replaces inline status with the returned typed reason. No rejected transfer is added to history.

Browser constraints are convenience only; HPA-294 validation is authoritative.

### Recurring-route flow

Creation fields match the existing domain contract exactly:

- origin;
- destination;
- material;
- capacity;
- frequency days;
- lead time days;
- transport cost per unit;
- priority.

#### Best-effort quote-assisted defaults

The explicit lead-time and per-unit-cost fields remain authoritative inputs. Add one optional **Use quote** convenience that reuses `quoteInterCityTransfer` rather than duplicating distance/cost arithmetic.

When origin, destination, and material are selected, request a minimal manual quote with `quantity: 1`. If it succeeds, **Use quote** fills:

```ts
leadTimeDays = quote.leadTimeDays;
transportCostPerUnit = quote.transportCostPerUnit;
```

This is a presentation default only.

`quoteInterCityTransfer` also validates current origin stock and cash, while `createRecurringRoute` does not. Therefore:

- `insufficient-origin-stock` or `insufficient-cash` from the quote helper must **not** mark the recurring-route form invalid;
- the player may still enter lead time/cost manually and create the route;
- do not copy `INTER_CITY_DISTANCE_PER_BAND` or reproduce quote arithmetic in Svelte to bypass this limitation;
- other quote failures remain useful inline diagnostics, but final route validity comes from `createRecurringRoute`.

Each current route exposes active/paused state, endpoints/material, capacity/frequency/next dispatch, priority, in-transit quantity, latest attempt interpretation, delivered units, and accumulated transport cost.

Actions remain explicit: pause/resume, edit future settings excluding priority, separate reprioritize, and remove. Editing never rewrites dispatched orders or historical attempts.

## Operational-condition classification

Add a small pure helper in `logisticsReadModels.ts`:

```ts
export type RouteOperationalCondition =
  | 'awaiting-dispatch'
  | 'destination-full'
  | 'origin-stock-constrained'
  | 'route-capacity-constrained'
  | 'normal';
```

Classification is based only on the attempt fields HPA-294 records, in this normative order:

1. no attempt → `awaiting-dispatch`;
2. `destinationNeed === 0` → `destination-full`;
3. `availableOriginStock < Math.min(destinationNeed, capacity)` → `origin-stock-constrained`;
4. `unmetDestinationNeed > 0 && dispatchedQuantity === capacity` → `route-capacity-constrained`;
5. otherwise → `normal`.

Tests must include the ambiguous-looking zero-dispatch case:

```ts
availableOriginStock === 0
destinationNeed > 0
dispatchedQuantity === 0
```

It is `origin-stock-constrained`, not capacity-constrained.

This helper interprets evidence; it does not become a simulation rule.

## World-map route presentation

### Rendering

`WorldLogisticsRoutes` receives current `RouteOperationalSummary[]` plus world-city status/definition coordinates.

For each current route:

- draw one straight SVG connection between existing `worldX`/`worldY` coordinates;
- show direction with an arrow marker;
- solid line = active, dashed line = paused;
- visibly mark selection;
- show condition/utilization text in the associated route selector.

The geometry is presentation-only. No pathfinding, distance calculation, vehicle position, animation, or graph layout is added.

### Accessible selection

SVG is not the only interaction path. Render native route buttons with origin → destination, material, active/paused state, and operational condition. Selecting a route calls `onSelectRoute(routeId)` and opens the route inspector.

Pointer selection on a visual line is optional if it remains simple. Keyboard route discovery is required.

## Route inspector and host gating

`LogisticsRouteInspector` is composed by `MapInspectorHost`; the existing world-city inspector remains inside `WorldMap`.

The host contract is explicit:

```ts
showLogisticsRouteInspector: boolean;
selectedLogisticsRoute: RouteOperationalSummary | null;
onManageLogisticsRoute: (routeId: string) => void;
onCloseLogisticsRouteInspector: () => void;
```

`+page.svelte` computes:

```ts
showLogisticsRouteInspector =
  activeMapView === 'world' && selectedLogisticsRoute !== null;
```

`MapInspectorHost` renders no logistics overlay chrome unless both the show guard and selected summary are present.

The route inspector uses HPA-568's `.inspector-overlay` chrome/clearance. The world-city inspector does **not** share that chrome and is not moved in HPA-574. Route/city mutual exclusion prevents both inspectors remaining open for one selection.

The inspector shows route identity, endpoints/material, state, capacity/frequency, next dispatch, lead time/cost, in-transit/delivered totals, total transport cost, latest attempt facts, historical utilization, and derived condition.

Its one mutation-adjacent action is **Manage route**, which opens Logistics focused on that route. The inspector itself remains read-only.

## Actionable logistics alerts

Alerts are derived from persisted facts on each collection pass. No alert counters/history are added.

### Origin-stock alert

For each active current route, emit an alert when its latest attempt classifies as `origin-stock-constrained`.

### Repeated capacity alert

Use:

```ts
export const LOGISTICS_CAPACITY_PRESSURE_ATTEMPTS = 2;
```

Emit only when the two most recent persisted attempts for an active route are both `route-capacity-constrained`.

Pausing a route suppresses both types on the next derived pass.

### Invalid commands stay inline

Rejected transfer/route commands are not persisted by HPA-294. Keep their localized typed reason in `LogisticsPanel`; do not invent a rejected-order/event history solely for a HUD alert.

### Alert navigation

Rename the currently panel-specific helper to `resolveAlertNavigation` and return a narrow union:

```ts
export type AlertNavigation =
  | {
      kind: 'panel';
      panelId: 'finance' | 'decisions';
      focusedFinanceLoanId: string | null;
    }
  | { kind: 'world-route'; routeId: string };
```

Store/factory alerts continue through existing tile navigation when this helper returns null.

The existing `page.svelte.spec.ts` tests that directly own `resolveAlertPanelNavigation` move to `alertNavigation.spec.ts` when the helper is renamed. `page.svelte.spec.ts` should not retain duplicate unit ownership of the helper.

## Reports and navigation

Extend `ReportsPanel` with a compact latest-day **Logistics** section using only HPA-294 report evidence:

- arrivals;
- route dispatch attempts;
- delivered units;
- scheduled transport cost;
- attempt capacity, unused capacity, unmet destination need, and dispatched quantity.

Use attempt-recorded capacity for utilization text.

Navigation remains explicit:

```ts
onOpenLogisticsRoute?: (routeId: string) => void;
onOpenLogisticsTransfer?: (transferOrderId: string) => void;
```

A route attempt can open the current world-route inspector. An arrival can open Logistics focused on the transfer. Do not add a generic report-link protocol.

## Localization

Add English, Japanese, and Traditional Chinese copy together for:

- management panel label/shortcut;
- manual/route form labels and actions;
- every typed logistics failure;
- route state and operational-condition labels;
- optional quote-assist status;
- route inspector labels/actions;
- latest-day report rows;
- logistics alert messages.

`localizeGameAlert` must resolve logistics alerts to non-empty copy. No player-facing string is persisted.

## Accessibility and layout

- Logistics inherits the focus-trapped management dialog.
- Fields have visible labels; error/status text uses `role="status"` or `aria-live` as appropriate.
- Route actions are native buttons.
- World-route discovery is keyboard accessible through the route button list.
- Direction/state/condition are not conveyed by color alone.
- Route inspector uses `MapInspectorHost` non-modal overlay semantics.
- The ninth management launcher must not cover route/retail/industry inspector actions at the existing HPA-568 laptop widths.
- Selecting a route must clear the `WorldMap` city inspector; do not “solve” the chrome asymmetry by moving the city inspector in this ticket.

## Testing and delivery shape

Component/pure work remains independently testable. Route composition is split from the expensive full lifecycle E2E work.

The current `src/routes/page.svelte.spec.ts` does not mount `+page.svelte`; it primarily owns controller/availability and route-local pure helper tests. Do not introduce a new navigation reducer/store solely to manufacture unit coverage for transient Svelte route state.

Instead:

1. wire route selection/focus/host props and run static/host tests;
2. run an early, focused Playwright navigation smoke proving route/city exclusivity, Manage-route navigation, and stale-inspector cleanup;
3. only then run the longer manual-transfer and recurring-route lifecycle Playwright flows plus ninth-launcher clearance.

The deterministic E2E setup should reuse the existing `retail-sim.e2e.ts` helpers:

- `cityLocalInventoryLifecycleGame()` for two opened/materialized industry cities with warehouses, material stock, and ample cash;
- `installSandboxAutoSave(page, game)` to load the fixture through the real save/resume UI;
- existing `openManagementPanel(...)` / map-menu helpers for UI navigation.

If a pre-seeded route is needed for the navigation smoke, create it in a **test-local helper** by calling HPA-294 `createRecurringRoute` on `cityLocalInventoryLifecycleGame()`. Do not add production-only fixtures.

## Non-goals

- Transfer/route domain, scheduling, accounting, or persistence changes.
- Industry-to-retail timed replenishment.
- Scenario logistics commands or authored scenario logistics state.
- Event-driven delays, suspension, exceptional costs, attribution, or recovery (HPA-296).
- Planner forecasts/recommendations/automatic route changes (HPA-297).
- Generic operations/form/modal/graph/router infrastructure.
- Fancy route animation, vehicles, geographic pathfinding, or new map runtime.
- Moving the existing world-city inspector into `MapInspectorHost`.
- Hiding otherwise-valid materials merely because current origin stock is zero.

## Acceptance criteria

- A valid manual transfer can be quoted, dispatched, observed in transit, delivered, and found in reports/history.
- Typed quote/command failures remain localized inline and create no rejected persistent record.
- Controller logistics failures return `logistics-rejected` through a first-class `RouteTransitionResult` arm; they never masquerade as finance `domain-rejected` and never use a second sandbox pipeline.
- `manageLogistics` is sandbox availability only; no artificial sandbox pending rule is introduced.
- Recurring routes can be created, inspected, paused/resumed, edited, reprioritized, and removed.
- Recurring-route lead time/cost can optionally be seeded from a successful HPA-294 quote without making current stock/cash a prerequisite for route creation.
- Endpoint selects omit locked/revealed/non-industry/unmaterialized cities while HPA-294 remains final validator.
- Materials are not hidden solely because current origin stock is zero.
- Historical utilization uses attempt capacity and remains stable after edits.
- `destinationNeed === 0` is destination-full; zero-stock positive-need attempts classify as origin-stock-constrained.
- Active/paused routes are directional, selectable, and keyboard discoverable on the world map.
- `MapInspectorHost` shows a logistics inspector only on the world map with a current selected route; world-city inspection remains in `WorldMap` and is mutually exclusive.
- Alerts derive from persisted evidence with no counter/history state and navigate to the correct current route.
- Report rows navigate to the correct current route or transfer.
- Existing `resolveAlertPanelNavigation` unit ownership is migrated cleanly to `alertNavigation.spec.ts` when renamed.
- Route composition gets an early focused navigation smoke before the longer lifecycle E2E flows.
- Ninth-launcher layout coverage protects route/retail/industry inspector actions without preemptive control-desk redesign.
- Existing retail replenishment, finance, events, scenarios, save, map, and shortcut flows remain unchanged.
- Focused tests, `bun run check`, `bun run lint`, targeted E2E, and full `bun run test` pass in the implementation PR.