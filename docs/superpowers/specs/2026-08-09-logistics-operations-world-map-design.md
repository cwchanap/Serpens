# Logistics Operations and World-Route UI Design

**Date:** 2026-08-09
**Status:** Proposed for HPA-574
**Prerequisites:** HPA-294 / PR #35 and HPA-568 / PR #38 are merged
**Delivery:** One player-facing implementation PR with staged, independently testable commits

## Summary

HPA-574 makes the HPA-294 inter-city logistics core playable and inspectable without creating a second logistics system in Svelte or Phaser.

The implementation extends the route-local HPA-568 presentation hosts, keeps `GameRouteController` as the only command/persistence coordinator, and consumes HPA-294 transfer orders, recurring routes, commands, daily attempt evidence, and read models.

The player gets four concrete capabilities:

1. quote and dispatch a one-off industry-to-industry transfer;
2. create and manage recurring logistics routes;
3. inspect current routes, in-transit material, recent history, and latest-day logistics reports;
4. see and select simple operational route connections on the existing world map.

The design deliberately avoids a save bump, scenario logistics commands, generic operations/form/graph infrastructure, vehicle/path simulation, and report-row navigation.

## Delivery decision

Keep HPA-574 in **one implementation PR**, but split it into small reviewable commits.

A two-PR split at the map seam was considered and rejected. The final alert behavior navigates directly to a world route, so splitting panel/alerts from world-route selection either creates temporary alert navigation that must be rewritten or leaves an incomplete alert action in the first PR. That adds merge/review overhead and churn without reducing architectural coupling.

Reviewability instead comes from explicit checkpoints:

- domain/read-model groundwork;
- controller contract;
- management panel;
- read-only reports;
- world-route presentation;
- route inspector;
- route composition/navigation;
- alerts;
- lifecycle E2E/layout validation;
- full verification.

## Existing contracts remain authoritative

HPA-294 continues to own:

- authoritative `LogisticsState`;
- manual transfer and recurring-route validation;
- dispatch quantity and destination reservation rules;
- transport accounting;
- scheduling and arrivals;
- persistence;
- immutable daily route-attempt evidence.

HPA-574 does not copy those rules into UI code.

### Small domain extraction: geometric route rates

The current manual quote computes geometric rates inside `validateManualTransfer`, after stock and cash validation. Recurring-route defaults need those same geometry-derived values even when the route is configured before stock exists.

Extract the existing calculation inside `src/lib/game/interCityLogistics.ts`:

```ts
export interface InterCityRates {
  leadTimeDays: number;
  transportCostPerUnit: number;
}

export function quoteInterCityRates(
  originCityId: string,
  destinationCityId: string
): InterCityRates | null;
```

`quoteInterCityRates`:

- resolves the two world-city definitions;
- requires distinct industry-city definitions;
- calculates the existing distance band from `worldX` / `worldY` and `INTER_CITY_DISTANCE_PER_BAND`;
- returns that band for both `leadTimeDays` and `transportCostPerUnit`;
- returns `null` for invalid/same/non-industry endpoints.

`validateManualTransfer` calls this helper after its authoritative inventory/material/quantity checks, so manual quote behavior does not change.

The recurring-route form calls the same helper to seed lead-time/per-unit-cost fields when endpoints change. The fields remain editable and `createRecurringRoute` remains the final validator.

No distance arithmetic moves into Svelte.

## Shared route read models

Add the shared operational vocabulary beside the existing logistics selectors:

```ts
export type RouteOperationalCondition =
  | 'awaiting-dispatch'
  | 'destination-full'
  | 'origin-stock-constrained'
  | 'route-capacity-constrained'
  | 'normal';
```

Classification order is normative:

1. no attempt → `awaiting-dispatch`;
2. `destinationNeed === 0` → `destination-full`;
3. `availableOriginStock < Math.min(destinationNeed, capacity)` → `origin-stock-constrained`;
4. `unmetDestinationNeed > 0 && dispatchedQuantity === capacity` → `route-capacity-constrained`;
5. otherwise → `normal`.

The zero-dispatch case below is explicitly origin-stock constrained:

```ts
availableOriginStock === 0
destinationNeed > 0
dispatchedQuantity === 0
```

Extend the existing summary rather than making every consumer reclassify the same evidence:

```ts
export interface RouteOperationalSummary {
  // existing fields
  condition: RouteOperationalCondition;
}
```

`selectRouteOperations(game)` computes `condition` from its already-selected `latestAttempt`.

For alert streak evidence, use one grouped report pass rather than one scan per route:

```ts
export function selectRecentRouteDispatchAttempts(
  game: GameState,
  limit?: number
): ReadonlyMap<string, readonly DailyRouteDispatchAttempt[]>;
```

The values are newest-first and capped to `limit` per route. There is no persisted cache or projection.

## Route command boundary

### First-class logistics rejection arm

The live controller transition type currently understands success, finance-shaped failures, and decision failures. HPA-294 logistics commands return `{ ok: false; reason }`.

Extend the internal transition contract explicitly:

```ts
type RouteTransitionResult<TReceipt = undefined> =
  | { ok: true; game: GameState; receipt: TReceipt }
  | { ok: false; code: FinanceFailureCode; context: Record<string, string | number> }
  | { ok: false; decisionFailure: Extract<DecisionResolutionResult, { ok: false }> }
  | { ok: false; logisticsFailure: LogisticsFailureCode };
```

Add the public result:

```ts
export type LogisticsFailureCode = ManualTransferFailure | RecurringRouteFailure;

export type GameRouteCommitResult =
  | existing variants
  | { status: 'logistics-rejected'; reason: LogisticsFailureCode };
```

Each public logistics method adapts the HPA-294 result before it reaches `normalizeRouteTransition`. The sandbox rejection branch handles `logisticsFailure` before the finance `domain-rejected` fallback.

Successful logistics mutations still use the existing `commitMutation` path for one publish and autosave attempt. Rejections publish/persist nothing.

Do not mirror the existing retail-supply sandbox preflight that loses typed detail. Do not create a second sandbox mutation pipeline.

### Scenario and availability boundary

The seven logistics methods omit `scenarioCommand`, so scenario mode returns `unavailable` before the transition executes.

Add one capability flag:

```ts
manageLogistics: input.playMode === 'sandbox'
```

There is no invented sandbox pending gate. The existing `pending` flag remains scenario-only.

## Logistics panel architecture

Add a pure sibling module following the existing `retailSupplySources.ts` pattern:

- `src/lib/components/game/logisticsPanel.ts`
- `src/lib/components/game/logisticsPanel.spec.ts`

It owns render-only option/row construction and keeps the large browser component spec focused on actual UI interaction.

```ts
export interface LogisticsPanelView {
  cityOptions: readonly LogisticsCityOption[];
  materialOptions: readonly LogisticsMaterialOption[];
  routes: readonly LogisticsRouteView[];
  inTransit: readonly LogisticsInTransitView[];
  recentTransfers: readonly LogisticsTransferView[];
  totals: LogisticsTotalsView;
}

export function buildLogisticsPanelView(
  game: GameState,
  i18n: I18nBundle
): LogisticsPanelView;
```

The view builder consumes `selectRouteOperations`, `selectInTransitInventory`, `selectRecentTransfers`, and `selectLogisticsTotals` and localizes labels only. It does not own form state or mutations.

### Endpoint options reuse existing inventory eligibility

Do not hand-roll the endpoint predicate in Svelte.

Follow the existing retail-supply source-option pattern:

- iterate `WORLD_CITY_CATALOG` in catalog order;
- require `supportsCityInventory(game, city.id)`;
- confirm the current inventory invariant with `getCityInventory(game, city.id)` before exposing the option;
- localize the city label.

`supportsCityInventory` is the established opened + industry-kind + materialized-industry-city helper. `getCityInventory` is the authoritative access that also verifies the inventory entry exists.

Do **not** filter material options by current positive stock. Future recurring routes are valid before production creates stock, and manual transfers should surface authoritative `insufficient-origin-stock` feedback.

### Svelte component responsibility

`LogisticsPanel.svelte` owns only:

- manual-transfer form state;
- recurring-route form/edit state;
- inline quote/rejection status;
- callback invocation;
- focus/expanded route presentation.

It receives `game`, one `LogisticsPanelView`, `canMutate`, `disabledReason`, `focusedRouteId`, and explicit mutation callbacks.

Manual transfers use `quoteInterCityTransfer(game, input)` for full stock/cash-aware quote evidence.

Recurring-route endpoint selection uses `quoteInterCityRates(origin, destination)` to seed `leadTimeDays` and `transportCostPerUnit`. There is no “Use quote” button, phantom quantity-1 quote, stock/cash workaround, or duplicated rate arithmetic.

## World-map route presentation

### SVG overlay

`WorldLogisticsRoutes.svelte` is a focused SVG renderer mounted **inside `.world-map-viewport`** so percentage coordinates align with existing city markers.

It receives route summaries, city coordinates, selected route ID, and optional pointer selection callback.

For each current route:

- draw one straight line between origin/destination `worldX` / `worldY`;
- arrow marker shows direction;
- solid line = active;
- dashed line = paused;
- selected route receives explicit highlight semantics.

No pathfinding, route-distance calculation, graph layout, animation, or vehicle position exists.

### Accessible route selectors have a concrete home

Native route buttons live in `WorldMap.svelte`, not inside the SVG renderer.

Keep the existing `.world-node-list` as the single scrollable discovery column:

1. existing city buttons are wrapped in a labelled city group;
2. a labelled route group is rendered immediately below them when routes exist.

At `max-width: 820px`, the existing `.world-node-list` bottom placement and `max-height: 45%` applies to both groups, so route discovery remains keyboard reachable in the same scroll container.

Each route button identifies origin → destination, material, active/paused state, and `RouteOperationalSummary.condition`. Selecting a route calls `onSelectRoute(routeId)`.

SVG may support pointer selection, but native buttons are the required keyboard path.

## Route inspector

`LogisticsRouteInspector.svelte` renders through `MapInspectorHost` only when:

```ts
showLogisticsRouteInspector =
  activeMapView === 'world' && selectedLogisticsRoute !== null;
```

Host props are explicit:

```ts
showLogisticsRouteInspector: boolean;
selectedLogisticsRoute: RouteOperationalSummary | null;
onManageLogisticsRoute: (routeId: string) => void;
onCloseLogisticsRouteInspector: () => void;
```

The inspector uses HPA-568 `.inspector-overlay` chrome/clearance and shows the current summary, latest attempt, schedule, historical utilization, delivered/in-transit totals, and condition.

The existing world-city inspector stays inside `WorldMap`. Selecting a route clears city selection and selecting a city clears route selection. Do not move the city inspector in HPA-574.

**Manage route** opens Logistics focused on the current route. The inspector itself is read-only.

## Transient route state

`+page.svelte` needs only two new IDs:

```ts
let selectedLogisticsRouteId = $state<string | null>(null);
let focusedLogisticsRouteId = $state<string | null>(null);
```

There is no `focusedLogisticsTransferId`: report rows are read-only, so no external feature needs to focus a historical transfer.

Selection/reset/load/Escape behavior follows existing sibling-selection conventions. No navigation reducer/store is introduced solely for testability.

## Actionable logistics alerts

Alerts remain derived; no dismissal state, counters, or alert-history persistence is added.

### Origin-stock alert self-clears after action

Historical evidence alone would leave an alert visible until the next scheduled attempt. Gate it with current stock as well.

For each active route whose latest summary condition is `origin-stock-constrained`, emit the alert only while current origin material stock is still below:

```ts
Math.min(latestAttempt.destinationNeed, route.capacity)
```

Current stock is read through `getCityInventory`. Refilling enough stock or lowering current route capacity clears the alert immediately without waiting for the next dispatch.

### Repeated route-capacity pressure

Keep the tested historical threshold:

```ts
export const LOGISTICS_CAPACITY_PRESSURE_ATTEMPTS = 2;
```

Use `selectRecentRouteDispatchAttempts(game, 2)` once, then emit a capacity alert when the two newest attempts for an active route both classify as `route-capacity-constrained`.

This alert is deliberately historical/sticky until a later non-constrained attempt, pause, or removal. It represents repeated observed pressure, not an instantaneous stock condition.

Paused routes emit neither logistics alert.

### Invalid commands stay inline

Rejected manual/route commands are immediate form feedback only. They are not persisted facts and do not become HUD alerts.

### Alert navigation

Rename the panel-specific helper to `resolveAlertNavigation` and return:

```ts
export type AlertNavigation =
  | {
      kind: 'panel';
      panelId: 'finance' | 'decisions';
      focusedFinanceLoanId: string | null;
    }
  | { kind: 'world-route'; routeId: string };
```

Existing helper tests move from `page.svelte.spec.ts` to `alertNavigation.spec.ts`.

Logistics alert selection switches to world view and selects the route. Store/factory tile navigation remains unchanged when the helper returns `null`.

## Reports are read-only in HPA-574

Extend `ReportsPanel` with one latest-day Logistics section containing only HPA-294 evidence:

- arrivals;
- route dispatch attempts;
- delivered units;
- scheduled transport cost;
- attempt capacity, dispatched quantity, unused capacity, and unmet destination need.

Use attempt-recorded capacity for utilization text.

Do **not** add interactive report rows or thread report-navigation callbacks through `ManagementPanelHost` / `+page.svelte`. Players already reach logistics through the Logistics panel, world-route list, route inspector, and actionable alerts. Report-row navigation can be added later in the report component alone if real usage proves it valuable.

## Localization

Add English, Japanese, and Traditional Chinese copy together for:

- management label and `L` shortcut;
- forms and actions;
- all typed logistics failures;
- route state/condition labels;
- route inspector;
- route selector group;
- latest-day logistics reports;
- logistics alerts.

`localizeGameAlert` must produce non-empty logistics messages. No player-facing domain string is persisted.

## Testing strategy

### Node/pure tests

Prefer node-project tests for:

- `quoteInterCityRates`;
- operational classification;
- `RouteOperationalSummary.condition`;
- grouped recent-attempt selection;
- panel endpoint/material/read-only view models;
- zero-stock material visibility;
- typed failure localization;
- alert derivation where DOM is irrelevant.

### Browser/component tests

Keep browser specs focused on behavior that requires DOM interaction:

- manual form submission and inline quote/rejection status;
- recurring route form defaulting/callbacks;
- route actions;
- SVG rendering semantics;
- world-route native button selection;
- inspector Manage action;
- host branch wiring;
- report rendering.

### Playwright

Reuse existing `retail-sim.e2e.ts` helpers:

- `cityLocalInventoryLifecycleGame()`;
- `installSandboxAutoSave(page, game)`;
- existing management/map navigation helpers.

Add:

1. an early route-navigation smoke for city/route exclusivity, route inspector, Manage route, reset/removal cleanup, and alert → route navigation;
2. one manual-transfer lifecycle;
3. one recurring-route scheduled dispatch/delivery lifecycle;
4. ninth-launcher route/retail/industry inspector clearance.

Do not add production-only fixtures.

## Risks and controls

### Reactive report scanning

`collectGameAlerts` runs from route-level derived state and `game.reports` is append-only. Avoid per-route report scans. `selectRouteOperations` and grouped `selectRecentRouteDispatchAttempts` each make one pass.

### Browser-test runtime/flakiness

Recent main-branch work specifically constrained browser-test concurrency. Keep derivation/formatting in `logisticsPanel.ts` and domain/read-model specs so `LogisticsPanel.svelte.spec.ts` remains interaction-focused. Keep the long Playwright work to the targeted flows above and run them serially.

### Ninth management launcher

Existing inspector CSS already documents launcher wrapping. Add regression evidence first and change spacing only if the ninth launcher actually overlaps route/retail/industry inspector actions.

## KISS and YAGNI guardrails

- No duplicate logistics state, scheduler, reconciliation, capacity, utilization, or transport arithmetic in UI.
- No save migration or new persisted state.
- No scenario logistics commands.
- No generic operations framework, form engine, modal/inspector registry, router, graph engine, or event bus.
- No individual vehicles, pathfinding, route animation, disruption presentation, or planner automation.
- No material-by-current-stock filtering.
- No report-row navigation in this slice.
- No new selection reducer/store solely for tests.
- Do not move the existing world-city inspector.

## Acceptance criteria

- [ ] Manual transfer can be quoted, dispatched, observed in transit, delivered, and seen in history/reports.
- [ ] Typed quote/command failures are localized inline and create no rejected persistent record.
- [ ] `quoteInterCityRates` is the single geometric rate helper used by manual validation and recurring-route defaults.
- [ ] Recurring routes can be created, edited, reprioritized, paused/resumed, removed, and inspected.
- [ ] Endpoint options reuse current city-inventory eligibility; zero-stock materials remain selectable.
- [ ] `RouteOperationalSummary.condition` is shared across panel/map/inspector and historical utilization remains attempt-capacity based.
- [ ] Recent attempt streak evidence is grouped in one report pass rather than rescanned once per route.
- [ ] Destination-full and zero-stock-origin cases classify correctly.
- [ ] Origin-stock alert self-clears when current stock/capacity no longer leaves the prior shortage actionable.
- [ ] Capacity pressure requires two recent constrained attempts and no persisted streak counter.
- [ ] Reports show latest-day logistics evidence read-only.
- [ ] Active/paused routes are directional, selectable, keyboard discoverable, and not color-only.
- [ ] Route buttons share the existing world discovery scroll column and remain reachable at ≤820px.
- [ ] Route inspector is explicitly gated to world view + current route; city inspector remains in `WorldMap` and selection is mutually exclusive.
- [ ] Alert navigation selects the correct world route; existing store/factory/finance/decision navigation remains unchanged.
- [ ] Existing retail replenishment, scenarios, save behavior, map keep-alive, and management flows remain unchanged.
- [ ] Focused node/browser tests, `bun run check`, `bun run lint`, targeted E2E, and full `bun run test` pass before implementation completion.
