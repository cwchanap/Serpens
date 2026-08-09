# Logistics Operations and World-Route UI Design

**Date:** 2026-08-09
**Status:** Proposed for HPA-574
**Prerequisites:** HPA-294 / PR #35 and HPA-568 / PR #38 are merged
**Delivery:** One player-facing implementation PR after this design/plan PR

## Summary

HPA-574 makes the inter-city logistics core playable without creating a second logistics system in the UI.

The implementation extends the route-local presentation boundaries introduced by HPA-568 and consumes the typed commands, immutable transfer/attempt evidence, and pure read models delivered by HPA-294. The route remains the composition and navigation root; `GameRouteController` remains the only command/persistence coordinator.

The player gets four concrete capabilities:

1. quote and dispatch a one-off industry-to-industry transfer;
2. create and manage recurring logistics routes;
3. inspect current routes, in-transit material, recent transfer history, and daily logistics evidence;
4. see and select simple operational route connections on the existing world map.

The design deliberately avoids a generic operations framework, map graph engine, route animation layer, new persistence, or scenario logistics authoring.

## Why HPA-574 is the next slice

The two explicit prerequisites are now stable on `main`:

- HPA-294 / PR #35 owns authoritative transfer orders, recurring routes, validation, dispatch scheduling, transport accounting, persistence, immutable daily attempt evidence, and logistics read models.
- HPA-568 / PR #38 owns `MapSurfaceHost`, `MapInspectorHost`, and `ManagementPanelHost`, while preserving `+page.svelte` as the route state/navigation root.

HPA-574 can therefore remain a presentation and command-adapter feature instead of reopening domain or route architecture.

It also unlocks the next logistics work:

- HPA-296 can add disruption-specific route modifiers and recovery presentation after normal route operations exist.
- HPA-297 can extend the Supply Planner after route operations are visible and usable.

## Chosen approach

### Recommended: extend the existing route hosts with logistics-specific components

Add three focused player-facing components:

- `LogisticsPanel.svelte` — one management surface for manual transfers, recurring-route operations, in-transit summaries, and transfer history;
- `WorldLogisticsRoutes.svelte` — one logistics-specific SVG overlay plus an accessible route selector on the existing DOM world map;
- `LogisticsRouteInspector.svelte` — one read-only world-map route inspector with a direct “Manage route” action.

Extend the existing HPA-568 hosts rather than adding another controller or workspace abstraction:

- `ManagementPanelHost` gets one `logistics` branch;
- `MapSurfaceHost` passes route presentation data into `WorldMap`;
- `MapInspectorHost` gets one world-route inspector branch.

`+page.svelte` owns only transient selection/focus/navigation state and callback composition. `GameRouteController` owns all successful mutations and autosave coordination.

### Rejected: render routes in Phaser

The world map is already a DOM/static-image surface with percentage-based city coordinates. Adding a Phaser scene only for logistics lines would create a second rendering runtime, new lifecycle/pause behavior, and duplicated coordinate integration for no gameplay benefit.

A plain SVG overlay is sufficient for straight-line operational connections.

### Rejected: generic operations/router/graph infrastructure

A generic form engine, modal registry, operations framework, route graph renderer, event bus, or router-within-the-route would increase indirection before a second consumer exists. HPA-574 has concrete forms and one concrete route visual.

Keep the implementation logistics-specific and extract only when later features prove a reusable boundary.

## Existing contracts remain authoritative

HPA-574 does not recalculate or persist logistics facts.

### Commands from `interCityLogistics.ts`

The UI consumes the existing APIs:

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

### Read models from `logisticsReadModels.ts`

The UI consumes:

```ts
selectInTransitInventory(game)
selectRecentTransfers(game)
selectRouteOperations(game)
selectLogisticsTotals(game)
```

`RouteOperationalSummary.utilization` already uses the attempt-recorded capacity, so historical utilization remains stable after route edits.

HPA-574 may add small pure evidence-classification helpers to this module when the same condition is needed by the panel, map, inspector, and alert collector. It must not introduce a cached logistics projection or second ledger.

## State ownership

### Persisted state

No new persisted state is required.

HPA-574 reads the existing:

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

The selected route drives the world-map inspector. Focus IDs let alerts/reports open the existing logistics management surface at the relevant object.

These IDs are not gameplay state and are never persisted.

### Selection exclusivity

World-city and world-route inspection are mutually exclusive:

- selecting a city clears `selectedLogisticsRouteId`;
- selecting a route clears `selectedWorldCityId`;
- selecting retail/industry tiles or leaving the world map clears or hides the world-route inspector consistently with existing map selection behavior;
- Escape/reset/load flows clear route selection alongside the existing transient selections.

Do not add a generic selection store.

## Route command boundary

### Controller integration

`GameRouteController` gets focused wrapper methods for the seven mutating logistics operations.

Each wrapper adapts the HPA-294 typed result into the existing route mutation pipeline so successful sandbox mutations still receive:

- one state publish;
- one autosave attempt;
- normal busy/unavailable handling;
- no partial state on rejection.

Add one route-level rejection result rather than widening finance failures:

```ts
export type LogisticsFailureCode = ManualTransferFailure | RecurringRouteFailure;

export type GameRouteCommitResult =
  | existing variants
  | { status: 'logistics-rejected'; reason: LogisticsFailureCode };
```

`route-not-found` is already part of the recurring-route failure family and also covers route removal.

The controller wraps HPA-294 failures as a logistics rejection and never publishes/autosaves rejected state.

### Scenario boundary

Do not add logistics `ScenarioCommand` variants in HPA-574.

The current scenario definitions do not author logistics state or allow logistics commands. The new controller methods therefore return unavailable in scenario mode through the existing mutation-availability/command boundary.

This preserves existing scenario outcomes and avoids silently widening challenge-mode capabilities.

## Logistics management surface

Add `logistics` to `ManagementPanelId` and bind shortcut **L**.

The existing control-desk/menu configuration automatically renders the new management item; `ShortcutCheatSheet` adds the matching localized row.

### Layout

`LogisticsPanel` contains four concrete sections, stacked responsively rather than introducing tabs or a nested router:

1. **Manual transfer**
2. **Recurring routes**
3. **In transit**
4. **Recent transfers / totals**

The panel receives `GameState`, i18n, mutation availability, focus IDs, and command callbacks. It calls pure HPA-294 selectors/quote helpers; it never computes logistics rules itself.

### Manual transfer flow

Fields:

- origin industry city;
- destination industry city;
- material;
- quantity.

The panel uses `quoteInterCityTransfer` for the live/explicit quote. A successful quote shows:

- lead time;
- transport cost per unit;
- total transport cost.

A failed quote shows the localized typed reason.

Dispatch submits the same input through `GameRouteController`. A command-time rejection replaces the inline quote/status message with the returned typed reason. No rejected transfer is added to history.

Browser field constraints are convenience only. HPA-294 validation remains authoritative.

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

Do not derive or duplicate distance/cost rules for recurring routes. HPA-294 intentionally accepts explicit route lead time and per-unit cost.

Each current route exposes:

- active/paused state;
- endpoints and material;
- capacity/frequency/next dispatch;
- priority;
- current in-transit quantity;
- latest utilization/constraint evidence;
- delivered units and accumulated transport cost.

Actions:

- pause/resume;
- edit future settings except priority;
- reprioritize through its separate command;
- remove.

Editing does not rewrite already-dispatched orders or historical attempts.

No generic CRUD/form abstraction is introduced.

## Operational condition classification

The same latest-attempt vocabulary should be used across the panel, world map, inspector, reports, and alerts.

Add a small pure helper beside the logistics read models:

```ts
export type RouteOperationalCondition =
  | 'awaiting-dispatch'
  | 'destination-full'
  | 'origin-stock-constrained'
  | 'route-capacity-constrained'
  | 'normal';
```

Classification for an active or paused current route is based only on `latestAttempt`:

1. no attempt → `awaiting-dispatch`;
2. `destinationNeed === 0` → `destination-full`;
3. `availableOriginStock < Math.min(destinationNeed, capacity)` → `origin-stock-constrained`;
4. `unmetDestinationNeed > 0 && dispatchedQuantity === capacity` → `route-capacity-constrained`;
5. otherwise → `normal`.

This is evidence interpretation, not a new simulation rule.

It ensures a destination with no receiving capacity is never mislabeled as an origin or route-capacity shortage.

## World-map route presentation

### Rendering

`WorldLogisticsRoutes` receives `RouteOperationalSummary[]` and world-city statuses.

For each current route:

- look up origin/destination `worldX`/`worldY` from the existing city definitions carried by world status;
- draw one straight SVG line between them;
- use an arrow marker to show direction;
- use a solid line for active and dashed line for paused;
- visually emphasize the selected route;
- expose condition/utilization text in the associated route selector.

The geometry is presentation-only. No pathfinding, map distance calculation, vehicle position, animation, or graph layout is added.

### Accessible selection

Do not rely on clickable SVG paths for keyboard access.

Alongside the decorative/select-highlight SVG layer, render an accessible route button list. Each button includes enough text to identify:

- origin → destination;
- material;
- active/paused state;
- current condition.

Selecting a button calls `onSelectRoute(routeId)`, which highlights the associated line and opens the route inspector.

Pointer selection on the visual line may be added with a generous hit target if it stays simple, but the button list is the required keyboard path.

State is never conveyed by color alone: direction, solid/dashed state, text labels, and selected semantics remain available.

## Route inspector

`LogisticsRouteInspector` is rendered through `MapInspectorHost` only while the world map is active and a current route is selected.

It shows domain/read-model facts only:

- route ID;
- localized origin/destination names;
- material;
- active/paused state;
- capacity and frequency;
- next dispatch day;
- lead time and cost per unit;
- in-transit units;
- delivered units;
- total transport cost;
- latest attempt destination need, available origin stock, dispatched units, unused capacity, unmet destination need, and utilization;
- derived operational condition.

The inspector has one primary action:

**Manage route** → opens the `logistics` management panel focused on the selected route.

The inspector itself does not mutate route state.

## Actionable logistics alerts

Alerts remain derived from persisted facts on every collection pass. No counter/history state is added.

### Origin-stock alert

For each **active** route, emit an alert when its latest attempt is `origin-stock-constrained`.

This is immediately actionable: the player can increase source inventory/production or lower route expectations.

### Repeated route-capacity alert

Use a fixed, tested threshold:

```ts
export const LOGISTICS_CAPACITY_PRESSURE_ATTEMPTS = 2;
```

Emit the capacity alert only when the two most recent persisted attempts for an **active** route are both `route-capacity-constrained`.

This avoids alerting on one transient capacity hit without adding a persisted streak counter.

Pausing a route removes both alert types on the next derived collection pass.

### Invalid command feedback is not a HUD alert

A rejected manual transfer or route command is not persisted by HPA-294, so there is no durable fact for `collectGameAlerts` to derive later.

Keep those failures as immediate localized inline feedback in `LogisticsPanel`. Do not invent rejected-order state or an alert-history store solely to surface them in the HUD.

### Alert identity and navigation

Add logistics alert kinds/route identity to `GameAlert`, for example:

```ts
'logistics-origin-stock'
'logistics-route-capacity'

routeId?: string;
```

Selecting either alert:

1. closes the alert popover;
2. switches to the world map;
3. clears city/tile selections;
4. selects the route;
5. opens the route inspector through `MapInspectorHost`.

This is direct route-owned navigation, not a nested router.

## Reports and navigation

Extend the existing Reports panel with a compact **Logistics** section for the latest day.

Render only facts already emitted by HPA-294:

- transfer arrivals;
- route dispatch attempts;
- delivered units;
- scheduled transport cost;
- attempt capacity, unused capacity, unmet destination need, and dispatched quantity.

Navigation is explicit and narrow:

- a route-attempt row can open the matching world route inspector;
- an arrival/transfer row can open the Logistics panel focused on its transfer order;
- city names may use the existing world navigation helper when a city action is useful.

Do not add a generic report-link protocol. Pass focused logistics callbacks through `ManagementPanelHost` to `ReportsPanel`.

## Localization

Add English, Japanese, and Traditional Chinese copy together for:

- management panel label and shortcut;
- form labels/buttons/statuses;
- every `ManualTransferFailure` and `RecurringRouteFailure` reason;
- route state and operational-condition labels;
- inspector labels/actions;
- logistics report section/rows;
- logistics alert messages.

`localizeGameAlert` resolves route/city/material labels from the current game and i18n label helpers. Live alerts must never fall through to an empty string.

No player-facing domain string is persisted.

## Accessibility

- The Logistics management panel inherits the existing focus-trapped management dialog.
- All fields have visible labels and errors/status text is announced with `role="status"` or `aria-live` as appropriate.
- Route actions are native buttons.
- World route discovery is keyboard accessible through route buttons; SVG is not the only interaction path.
- Active/paused and constrained/full/normal conditions are communicated in text, not only color.
- The route inspector uses the existing non-modal inspector overlay semantics.
- Adding the ninth management launcher must not cover inspector actions at desktop/laptop breakpoints; targeted route E2E verifies clearance before changing layout CSS.

## Testing strategy

### Pure/unit tests

Cover:

- route operational-condition classification;
- last-two-attempt capacity alert derivation;
- paused-route alert suppression;
- no false capacity alert for `destinationNeed === 0`;
- controller success/rejection/autosave behavior for logistics mutations;
- scenario-mode logistics mutation unavailability;
- shortcut resolution for `L`.

### Component tests

Cover:

- manual quote success and every typed quote/rejection family;
- no fake transfer/history row on rejection;
- route create/edit/reprioritize/pause/resume/remove callbacks;
- focused route/transfer states;
- SVG route state and accessible route selectors;
- route inspector latest-attempt evidence and Manage route action;
- Reports logistics rows/navigation;
- localized alert copy.

### Playwright

Add two targeted real-UI flows:

1. quote and dispatch one manual transfer, verify in-transit state, advance to delivery, and verify history/report evidence;
2. create one recurring route, advance through a scheduled dispatch and delivery, select it on the world map, inspect evidence, and manage it from the inspector.

Use existing deterministic game/test setup; do not add production-only fixtures or hidden debug routes.

## Non-goals

HPA-574 does not add:

- logistics domain rules, scheduling, transfer accounting, or persistence;
- save migrations or compatibility logic;
- scenario logistics commands or scenario authoring;
- industry-to-retail timed replenishment;
- event disruption/delay/suspension/recovery visuals;
- Supply Planner route recommendations or hypothetical route changes;
- persisted alert counters/history;
- route animation or simulated vehicles;
- geographic/tile pathfinding;
- generic graph, form, operations, modal, or navigation frameworks;
- redesigns of unrelated HUD/map/report surfaces.

## Implementation boundary

A successful implementation should primarily touch:

- HPA-294 command/read-model consumers;
- HPA-568 route hosts;
- the existing world map, alert, report, shortcut, i18n, and route-controller seams;
- focused tests and targeted E2E.

If implementation requires changing logistics persistence, dispatch math, scheduling cadence, inventory conservation, or transport-cost calculation, the change has crossed the HPA-574 boundary and should be reconsidered before proceeding.
