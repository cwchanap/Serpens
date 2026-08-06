# Inter-City Transfer and Recurring-Route Core Design

**Date:** 2026-08-06  
**Status:** Proposed for HPA-294  
**Prerequisite:** HPA-554 / PR #33 is merged  
**Delivery:** One domain-focused implementation PR

## Summary

HPA-294 adds one deterministic inter-city logistics core on top of the simplified city-local inventory model.

Manual transfers and recurring routes use the same dispatch and arrival lifecycle. Mutable state contains only transfer orders, route definitions, and monotonic identity counters. In-transit totals, history, utilization, unmet demand, delivered units, costs, and alerts are derived from transfer orders, route definitions, and immutable daily report evidence.

The design prioritizes:

1. One authoritative state path for all inter-city material movement.
2. Deterministic daily behavior and accounting.
3. Small, explicit domain APIs that HPA-574, HPA-296, and HPA-297 can consume.
4. KISS and YAGNI over generic scheduling, recovery, or simulation infrastructure.

There is no compatibility path from schema 14, no route reliability model, no separate in-transit ledger, no cached route metrics, and no UI work.

## Current architecture fit

The merged HPA-554 state gives HPA-294 stable boundaries:

- `CityInventory` stores only `cityId` and material quantities.
- `getCityInventory` validates opened, materialized industry cities.
- `getCityInventoryStats` derives shared warehouse capacity, used units, overflow, and overflow cost.
- production closes before weekly retail replenishment;
- current-schema save validation is strict and historical reports are non-authoritative;
- `simulateDay` owns the explicit daily order and cash reconciliation.

HPA-294 extends those boundaries rather than creating a second inventory or simulation model.

## Chosen structure

Use two focused modules:

- `src/lib/game/interCityLogistics.ts` — identity, validation, commands, manual quotes, dispatch, arrivals, route scheduling, and reusable ordering/quantity helpers.
- `src/lib/game/logisticsReadModels.ts` — in-transit/history selectors, route operational summaries, totals, and actionable normal-operation alerts.

Persisted and report wire types remain in `src/lib/game/types.ts`, matching the existing repository convention.

Rejected alternatives:

- **Separate manual and scheduled shipment systems:** duplicates validation, inventory mutation, cost accounting, persistence, and future event integration.
- **Generic scheduler or workflow queue:** HPA-294 needs one integer-day cadence and deterministic route ordering only.
- **One large cross-feature logistics service:** would mix authoritative transitions, presentation metrics, alerts, planner rules, and future disruption semantics.

## Authoritative state

Add one nested state object to `GameState`:

```ts
export interface LogisticsState {
  transferOrders: TransferOrder[];
  recurringRoutes: RecurringRoute[];
  nextTransferSequence: number;
  nextRouteSequence: number;
}
```

The counters are identity metadata, not a second ledger. They follow the existing finance/event pattern and prevent route-ID reuse after a route is removed.

IDs are deterministic:

- `transfer-${nextTransferSequence}`
- `route-${nextRouteSequence}`

A successful creation increments the corresponding counter. Rejected commands and zero-quantity scheduled attempts do not consume a sequence.

### Transfer orders

```ts
export type TransferOrderSource =
  | { kind: 'manual' }
  | { kind: 'recurring-route'; routeId: string };

export type TransferOrderStatus = 'in-transit' | 'delivered';

export interface TransferOrder {
  id: string;
  source: TransferOrderSource;
  originCityId: WorldCityId;
  destinationCityId: WorldCityId;
  materialId: MaterialId;
  requestedQuantity: number;
  dispatchedQuantity: number;
  createdOnDay: number;
  dispatchedOnDay: number;
  arrivalOnDay: number;
  transportCost: number;
  status: TransferOrderStatus;
}
```

Rules:

- An order is appended only when a positive quantity is dispatched.
- `createdOnDay` and `dispatchedOnDay` are equal in this first slice because there is no queued/pending order state.
- Manual orders have `requestedQuantity === dispatchedQuantity`.
- Scheduled orders preserve destination need in `requestedQuantity` and the actual capped amount in `dispatchedQuantity`.
- Identity, source, endpoints, material, quantities, days, and cost never change after dispatch.
- Arrival changes only `status` from `in-transit` to `delivered`.
- Removing or editing a source route cannot rewrite an order.

### Recurring routes

```ts
export type RecurringRouteState = 'active' | 'paused';

export interface RecurringRoute {
  id: string;
  originCityId: WorldCityId;
  destinationCityId: WorldCityId;
  materialId: MaterialId;
  capacity: number;
  frequencyDays: number;
  leadTimeDays: number;
  transportCostPerUnit: number;
  priority: number;
  state: RecurringRouteState;
  nextDispatchOnDay: number;
}
```

Validation requires:

- distinct opened, materialized industry cities with valid city inventories;
- a catalog `MaterialId`;
- positive safe integers for capacity, frequency, lead time, and per-unit cost;
- a nonnegative safe integer priority.

All industry-city inventories may hold every existing material. HPA-294 does not invent a city/material compatibility matrix from resource specialties.

Lower numeric priority dispatches first. Equal priorities use plain stable route-ID ordering.

## Transport terms

Manual transfer forms under HPA-574 provide only origin, destination, material, and quantity, so HPA-294 owns a deterministic quote helper.

Use straight-line world-map distance only; this is not pathfinding:

```ts
const INTER_CITY_DISTANCE_PER_BAND = 25;

distanceBand = Math.max(
  1,
  Math.ceil(Math.hypot(destination.worldX - origin.worldX, destination.worldY - origin.worldY) / 25)
);

leadTimeDays = distanceBand;
transportCostPerUnit = distanceBand;
transportCost = quantity * transportCostPerUnit;
```

The constants are exported for focused balance tests. Already-dispatched orders persist their concrete arrival day and total cost, so later tuning does not rewrite history.

Recurring routes persist explicit positive `leadTimeDays` and `transportCostPerUnit` values. HPA-574 may seed route forms from the same quote helper, but the domain command accepts the values supplied by the route form.

## Command contracts

### Manual transfer

```ts
export interface ManualTransferInput {
  originCityId: string;
  destinationCityId: string;
  materialId: string;
  quantity: number;
}

export type ManualTransferFailure =
  | 'invalid-origin'
  | 'invalid-destination'
  | 'same-city'
  | 'invalid-material'
  | 'invalid-quantity'
  | 'insufficient-origin-stock'
  | 'insufficient-cash';

export type ManualTransferResult =
  | { ok: true; game: GameState; order: TransferOrder }
  | { ok: false; reason: ManualTransferFailure };

export function dispatchManualTransfer(
  game: GameState,
  input: ManualTransferInput
): ManualTransferResult;
```

The command validates the complete request before mutation. It never partially dispatches. On success it atomically:

1. removes the requested material from the origin inventory;
2. subtracts the quoted total cost from cash;
3. appends one in-transit order;
4. advances `nextTransferSequence`.

A rejection returns a typed reason and preserves object state, collections, counters, inventory, and cash.

### Route lifecycle

Expose focused commands rather than one generic patch dispatcher:

```ts
createRecurringRoute(game, input)
updateRecurringRoute(game, routeId, input)
pauseRecurringRoute(game, routeId)
resumeRecurringRoute(game, routeId)
reprioritizeRecurringRoute(game, routeId, priority)
removeRecurringRoute(game, routeId)
```

Creation sets:

- `state: 'active'`;
- `nextDispatchOnDay: game.day`.

Update may change endpoints, material, capacity, frequency, lead time, and per-unit cost after validating the full candidate. It preserves ID, state, priority, and next scheduled day. Reprioritization is separate so list ordering changes are explicit.

Pause preserves `nextDispatchOnDay`. Resume keeps a future scheduled day, or moves an overdue day to `game.day`. Paused time is never replayed as multiple catch-up dispatches.

Removal deletes only the route definition. Existing transfer orders and historical report evidence remain.

Route command failures are typed and include `route-not-found` plus the same endpoint/material/numeric validation reasons where applicable.

## Shared dispatch path

Both manual and scheduled movement call one internal dispatch primitive.

The primitive receives already-validated terms:

- source;
- requested quantity;
- dispatched quantity;
- dispatch day;
- lead time;
- per-unit cost;
- whether insufficient cash must reject.

It performs the only origin-stock removal, cost subtraction, order creation, and transfer-sequence increment in production code.

Manual dispatch requires full stock and affordable cash. Scheduled dispatch passes its already-capped quantity and does not add cash as a fourth quantity cap. Like production operating costs, an automated route may push cash negative. This preserves the ticket’s exact scheduled quantity rule and leaves cash planning to existing finance alerts and HPA-297.

## Destination need

HPA-294 has no per-material destination target or forecast policy. The first-slice recurring-route need is therefore warehouse receiving capacity, not speculative retail or production demand.

```ts
export function getDestinationTransferNeed(
  game: GameState,
  destinationCityId: WorldCityId
): number;
```

It returns:

```text
max(0, destination warehouse capacity
       - current used units
       - all in-transit units already reserved for that destination)
```

Reservations include every material because warehouse capacity is shared across materials.

Consequences:

- recurring automation does not knowingly dispatch beyond currently available destination capacity;
- manual transfers may intentionally overflow;
- arrivals may still overflow because local production, warehouse removal, or other state changes can occur before arrival;
- competing routes consume destination need sequentially in priority/ID order;
- HPA-297 can reuse this pure helper for the live-rule baseline without introducing planner demand policy into HPA-294.

## Scheduled route attempt

For each active route due on the closing day:

```text
destinationNeed = getDestinationTransferNeed(...)
availableOriginStock = current origin quantity
dispatchedQuantity = min(destinationNeed, capacity, availableOriginStock)
```

If the quantity is positive, dispatch through the shared primitive.

If the quantity is zero, append no transfer order and consume no transfer sequence. The attempt still produces immutable daily report evidence.

After one attempt, successful or zero-quantity:

```ts
nextDispatchOnDay = closingDay + frequencyDays;
```

The scheduler processes a due route at most once per simulated day. It does not replay missed intervals.

## Daily simulation order

HPA-294 makes the order explicit in `simulateDay`:

1. Validate current ownership invariants.
2. Deliver in-transit orders whose `arrivalOnDay === closingDay`, sorted by transfer ID.
3. Run industry production and production-close inventory/overflow accounting.
4. Run retail sales.
5. Run weekly retail replenishment.
6. Build the normal post-operation game state.
7. Attempt active recurring routes with `nextDispatchOnDay <= closingDay`, sorted by priority then route ID.
8. Include scheduled transport cost in daily operating cost and cash flow.
9. Service finance, write the daily report, increment the day, and continue existing event/world transitions.

Arrivals precede production so delivered material is available on its documented day. Scheduled exports follow local production and retail replenishment so normal city-local operations receive first access to same-day stock.

A day may contain arrivals and new dispatches. Arrival ordering is stable by transfer ID; dispatch ordering is stable by priority and route ID. Lead time is at least one day, so a newly dispatched order never re-enters the arrival phase on the same tick.

## Arrival and overflow

Arrival uses `addCityInventoryMaterial` without a capacity clamp, then marks the order delivered.

No logistics-specific overflow ledger or charge is added. The existing production-close `getCityInventoryStats` summary remains the single overflow calculation and charge path. An arrival can therefore create overflow, and same-day production can consume material before the production-close overflow snapshot.

This preserves current overflow semantics rather than charging a second arrival fee.

## Daily logistics report evidence

Add to `DailyReport`:

```ts
export interface DailyTransferArrival {
  transferOrderId: string;
  originCityId: WorldCityId;
  destinationCityId: WorldCityId;
  materialId: MaterialId;
  quantity: number;
}

export interface DailyRouteDispatchAttempt {
  routeId: string;
  originCityId: WorldCityId;
  destinationCityId: WorldCityId;
  materialId: MaterialId;
  destinationNeed: number;
  capacity: number;
  availableOriginStock: number;
  dispatchedQuantity: number;
  unusedCapacity: number;
  unmetDemand: number;
  transportCost: number;
  transferOrderId: string | null;
}

export interface DailyLogisticsReport {
  arrivals: DailyTransferArrival[];
  routeDispatchAttempts: DailyRouteDispatchAttempt[];
  deliveredUnits: number;
  scheduledTransportCost: number;
}
```

Report rows are facts captured during the daily transition. They are not mutable route state and are not used to reconstruct inventories.

For an attempt:

- `unusedCapacity = capacity - dispatchedQuantity`;
- `unmetDemand = destinationNeed - dispatchedQuantity`;
- `transportCost = 0` and `transferOrderId = null` when nothing dispatched.

Manual transfer costs are immediate player-command cash changes, like other purchases between daily reports. They remain fully explainable through transfer orders and aggregate cost selectors; they are not retroactively inserted into a later daily operating report.

Scheduled route cost is part of that day’s `operatingCosts`, `operatingCashFlow`, and `netCashChange`, and must reconcile with `DailyLogisticsReport.scheduledTransportCost`.

## Read models

`logisticsReadModels.ts` derives normal-operation views without caches.

### In-transit inventory

Group in-transit orders by destination city and material. Return quantity, order IDs, and earliest arrival day. Sort by world-city catalog order, material ID, then order ID.

### Recent transfers

Return transfer orders sorted by dispatch day descending and transfer ID descending, with a caller-supplied limit defaulting to 20.

### Route operations

For each current route, expose:

- route definition;
- in-transit quantity sourced from the route;
- latest dispatch attempt;
- latest utilization ratio;
- unused capacity;
- unmet demand;
- all-time delivered units;
- all-time transport cost.

Current route ordering is priority then route ID. Removed routes remain visible only through transfer history and historical reports.

### Aggregate totals

Derive delivered units and transport cost from transfer orders. Do not persist totals.

## Normal-operation alerts

Extend the existing alert contract with route identity but no UI behavior:

- `route-origin-stock` — the latest due attempt had positive destination need and origin stock below `min(destinationNeed, capacity)`.
- `route-capacity-shortfall` — the latest three due attempts all had `destinationNeed > capacity` and enough origin stock to fill capacity.

Three attempts is the only persistence threshold. Export it as a constant for tests.

Alerts are derived from current routes plus daily attempt evidence, sorted by route priority/ID. They contain `routeId` and relevant city IDs. HPA-574 owns navigation and presentation. HPA-294 does not add planner recommendations, auto-resizing, or event attribution.

## Persistence and validation

Set `SAVE_SCHEMA_VERSION = 15`. Schema 14 is unsupported; add no migration.

Current-state validation requires:

- a plain structured-cloneable `logistics` object;
- safe positive next sequences;
- unique, canonical `transfer-N` and `route-N` IDs below their next sequence;
- valid transfer source payloads;
- valid current logistics endpoints and material IDs;
- positive safe quantities with `dispatchedQuantity <= requestedQuantity`;
- manual equality between requested and dispatched quantity;
- `createdOnDay <= dispatchedOnDay < arrivalOnDay`;
- nonnegative safe total cost;
- status/day coherence: in-transit arrival is on or after `game.day`, delivered arrival is before `game.day`;
- unique valid current route definitions;
- active routes scheduled on or after `game.day`; paused routes may retain an overdue day;
- route-source orders may reference removed routes.

Normalize transfer orders by numeric transfer sequence and routes by numeric route sequence. Runtime scheduling still sorts current routes by priority/ID.

Historical `DailyLogisticsReport` rows are structurally validated as part of their parent daily report. Do not replay them against current routes, transfer orders, inventories, or cash. A removed route and an edited route must not invalidate historical evidence.

## Scenario boundary

Do not add scenario logistics authoring fields in HPA-294. Existing scenarios initialize empty logistics state through `createNewGame` and may exercise logistics in tests by calling domain commands after setup.

Add scenario schema only when a real authored scenario requires seeded transfers or routes.

## Main implementation files

Core:

- `src/lib/game/types.ts`
- `src/lib/game/state.ts`
- `src/lib/game/interCityLogistics.ts` (new)
- `src/lib/game/logisticsReadModels.ts` (new)
- `src/lib/game/simulateDay.ts`
- `src/lib/game/alerts.ts`

Persistence:

- `src/lib/persistence/saveTypes.ts`
- `src/lib/persistence/saveCodec.ts`

Focused tests:

- `src/lib/game/interCityLogistics.spec.ts` (new)
- `src/lib/game/logisticsReadModels.spec.ts` (new)
- `src/lib/game/interCityLogistics.integration.spec.ts` (new)
- `src/lib/game/simulateDay.spec.ts`
- `src/lib/game/alerts.spec.ts`
- `src/lib/persistence/saveCodec.spec.ts`
- fixtures that construct `GameState` or `DailyReport` directly

No Svelte, Phaser, route-controller, localization, or Playwright file belongs in this implementation.

## Verification matrix

Focused domain tests cover:

- manual quote, dispatch, exact stock removal, cost, and arrival day;
- invalid endpoints/material/quantity, insufficient stock, and insufficient cash with no mutation;
- arrival on the documented day and existing overflow behavior;
- route cadence, capacity, destination need, inbound reservations, and origin constraint;
- deterministic contention by priority and ID;
- pause, resume, edit, reprioritize, and removal affecting only future attempts;
- route deletion while an order is in transit;
- zero-quantity attempt evidence without an empty order or sequence gap;
- inventory and scheduled cash reconciliation;
- schema-15 round-trip and strict stale-schema rejection;
- in-transit, history, utilization, unused capacity, unmet demand, delivered-unit, cost, and alert selectors.

One headless multi-day integration test uses the real `simulateDay` flow to:

1. dispatch a manual transfer;
2. deliver it on its quoted day;
3. create a recurring route;
4. run multiple route attempts;
5. observe a scheduled arrival;
6. reconcile origin, transit, destination, transfer costs, reports, and route cadence.

## Non-goals

- mutable in-transit totals or transfer-history storage;
- pending, rejected, recalled, rerouted, delayed, failed, or cancelled orders;
- random reliability or route suspension from events;
- route target DSLs, queue abstractions, generic schedulers, or workflow engines;
- city closure, customs, taxation, vehicles, pathfinding, or map animation;
- material-demand forecasting or route recommendations;
- player-facing forms, panels, inspectors, navigation, or world-map visuals;
- pre-release save migration or stale-reference repair.

## Acceptance criteria

- Manual and scheduled movement share one dispatch primitive.
- Transfer orders are the only authoritative transit/history record.
- Manual commands reject invalid, insufficient-stock, or unaffordable requests without mutation.
- Arrivals become available before production on their documented day.
- Recurring routes dispatch after local production/replenishment and respect destination capacity need, inbound reservations, route capacity, origin stock, frequency, priority, and stable IDs.
- Route lifecycle commands cannot mutate existing transfer orders.
- Existing overflow calculation remains the only overflow charge path.
- Scheduled route costs reconcile through the daily report and cash flow; all logistics costs derive from orders.
- Schema 15 round-trips strictly with no schema-14 migration.
- Read models and alerts are derived, focused, and UI-agnostic.
- Production code introduces no duplicate ledger, cached metrics, generic scheduler, reliability framework, repair path, or UI layer.
