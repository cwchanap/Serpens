# Inter-City Transfer and Recurring-Route Core Design

**Date:** 2026-08-06  
**Status:** Proposed for HPA-294  
**Prerequisite:** HPA-554 / PR #33 is merged  
**Delivery:** One domain-focused implementation PR

## Summary

HPA-294 adds one deterministic inter-city logistics core on top of the simplified city-local inventory model.

Manual transfers and recurring routes use the same transfer-order lifecycle. Mutable logistics state contains only transfer orders, recurring-route definitions, and monotonic identity counters. In-transit totals, history, utilization, unmet demand, delivered units, costs, and normal-operation alert evidence are derived from orders, routes, and immutable daily reports.

Priorities are:

1. One authoritative state path for inter-city material movement.
2. Deterministic daily timing and accounting.
3. Small domain APIs that HPA-574, HPA-296, and HPA-297 can consume.
4. KISS and YAGNI over generic scheduling, recovery, retention, or simulation infrastructure.

There is no compatibility path from schema 14, no reliability model, no second transit ledger, no cached route metrics, and no player-facing UI work.

## Scope boundary

HPA-294 moves material **between opened, materialized industry-city inventories**.

It does not replace weekly retail replenishment with transfer orders. `applyWeeklyReplenishment` continues to debit the configured industry-city inventory immediately and import any shortage. Converting industry-to-retail replenishment into timed transit is deferred until a separate ticket explicitly owns that gameplay change.

This boundary resolves the older HPA-292 narrative that mentioned HPA-294 replacing immediate retail debit. The first logistics slice establishes industry-to-industry routes only.

## Current architecture fit

The merged HPA-554 state provides stable boundaries:

- `CityInventory` stores only `cityId` and material quantities.
- `getCityInventory` validates opened, materialized industry cities.
- `getCityInventoryStats` derives shared warehouse capacity, used units, overflow, and overflow cost.
- production closes before weekly retail replenishment;
- current-schema persistence is strict;
- historical reports are non-authoritative evidence;
- `simulateDay` owns daily ordering and cash reconciliation.

HPA-294 extends these contracts rather than creating another inventory model.

## Module structure

Use two focused modules:

- `src/lib/game/interCityLogistics.ts` — identity, validation, quotes, commands, transfer creation, arrivals, route cadence, and reusable ordering/quantity helpers.
- `src/lib/game/logisticsReadModels.ts` — transit/history selectors, route operational summaries, totals, and pure normal-operation alert evidence.

Persisted and report wire types remain in `src/lib/game/types.ts`, matching existing repository conventions.

Rejected alternatives:

- separate manual and recurring shipment systems;
- a generic scheduler, queue, or workflow engine;
- a route-policy or demand DSL;
- one cross-feature service mixing domain transitions, UI alerts, planner rules, and future disruptions.

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

The counters are identity metadata, not accounting state. They follow the existing finance/event pattern and prevent ID reuse after route removal.

IDs are deterministic:

- `transfer-${nextTransferSequence}`
- `route-${nextRouteSequence}`

Successful creation increments the matching sequence. Rejected commands and zero-quantity scheduled attempts consume no sequence.

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

- Append an order only for a positive dispatch.
- `createdOnDay === dispatchedOnDay` in this first slice; there is no pending state.
- Manual orders have `requestedQuantity === dispatchedQuantity`.
- Scheduled orders retain destination need in `requestedQuantity` and actual shipment size in `dispatchedQuantity`.
- ID, source, endpoints, material, quantities, days, and cost are immutable after dispatch.
- Arrival changes only `status` from `in-transit` to `delivered`.
- Route edit or removal cannot rewrite an order.

### Recurring routes

```ts
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
  state: 'active' | 'paused';
  nextDispatchOnDay: number;
}
```

Validation requires:

- distinct opened, materialized industry cities with inventories;
- a catalog `MaterialId`;
- positive safe integers for capacity, frequency, lead time, and per-unit cost;
- a nonnegative safe integer priority.

Every industry-city inventory may hold every current material. Resource specialties do not become a material-compatibility matrix.

Lower numeric priority dispatches first. Equal priority uses the numeric sequence embedded in `route-N`, so `route-2` precedes `route-10`.

## Transport quote

Manual transfer UI under HPA-574 supplies origin, destination, material, and quantity. HPA-294 owns a deterministic quote helper.

Use straight-line world coordinates only; this is not pathfinding:

```ts
export const INTER_CITY_DISTANCE_PER_BAND = 25;

const distance = Math.hypot(
  destination.worldX - origin.worldX,
  destination.worldY - origin.worldY
);
const distanceBand = Math.max(
  1,
  Math.ceil(distance / INTER_CITY_DISTANCE_PER_BAND)
);

leadTimeDays = distanceBand;
transportCostPerUnit = distanceBand;
transportCost = quantity * transportCostPerUnit;
```

Dispatched orders persist concrete arrival day and total cost, so future tuning cannot rewrite history.

Recurring routes persist explicit positive `leadTimeDays` and `transportCostPerUnit`. HPA-574 may seed forms from the quote helper, but route commands accept the supplied values.

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
```

The command validates the complete request before mutation and never dispatches partially.

On success it atomically:

1. creates the dispatched transfer through the shared internal path;
2. subtracts the quoted total cost from cash exactly once;
3. returns the updated game and order.

Rejection preserves inventories, cash, collections, and identity counters.

### Route lifecycle

Expose focused commands:

```ts
createRecurringRoute(game, input)
updateRecurringRoute(game, routeId, input)
pauseRecurringRoute(game, routeId)
resumeRecurringRoute(game, routeId)
reprioritizeRecurringRoute(game, routeId, priority)
removeRecurringRoute(game, routeId)
```

Creation sets `state: 'active'` and `nextDispatchOnDay: game.day`.

Update may change endpoints, material, capacity, frequency, lead time, and per-unit cost after validating the complete candidate. It preserves ID, state, priority, and next scheduled day. Reprioritization remains separate so contention changes are explicit.

Pause preserves `nextDispatchOnDay`. Resume keeps a future day or moves an overdue day to `game.day`. Paused time is not replayed as catch-up dispatches.

Removal deletes only the route definition. Existing orders and historical report evidence remain.

## Shared transfer-creation path

Manual and scheduled movement call one internal transfer-creation primitive.

The primitive receives validated source, endpoints, material, requested/dispatched quantities, dispatch day, lead time, and per-unit cost. It is the only production path that:

- removes origin stock;
- creates and appends the immutable transfer order;
- increments `nextTransferSequence`;
- returns the concrete `transportCost`.

It **does not mutate cash**.

Cash ownership is intentionally split by transaction boundary:

- `dispatchManualTransfer` checks affordability and applies the returned cost immediately once.
- `processRecurringRouteDispatches` records orders and returns `scheduledTransportCost` without changing cash.
- `simulateDay` is the only writer that applies scheduled transport cost to daily cash and reports.

This preserves one order lifecycle without two competing scheduled-cash writers.

## Destination need

HPA-294 has no per-material destination target or forecast policy. Recurring-route need is warehouse receiving capacity, not speculative retail or production demand.

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
       - all in-transit units reserved for that destination)
```

Reservations include every material because warehouse capacity is shared.

Consequences:

- recurring automation does not knowingly overfill current receiving capacity;
- manual transfers may intentionally overflow;
- local production or consumption before arrival can still change final overflow;
- competing routes consume need sequentially in priority/numeric-ID order;
- HPA-297 can reuse the pure quantity/order helpers without importing planner demand into live logistics.

## Scheduled route attempt

For each active route due on the closing day:

```text
destinationNeed = getDestinationTransferNeed(...)
availableOriginStock = current origin material quantity
dispatchedQuantity = min(destinationNeed, route capacity, availableOriginStock)
```

Positive quantity uses the shared transfer-creation path.

Zero quantity appends no transfer order and consumes no transfer sequence, but still records immutable daily attempt evidence.

After one positive or zero attempt:

```ts
nextDispatchOnDay = closingDay + frequencyDays;
```

A due route attempts at most once per simulated day. Missed intervals are not replayed.

Scheduled cost is not an affordability cap. Like other daily operating costs, it may make cash negative when `simulateDay` settles the day.

## Daily simulation order and cash ownership

`simulateDay` uses this explicit order:

1. Validate current ownership invariants.
2. Deliver orders with `arrivalOnDay === closingDay`, sorted by numeric transfer sequence.
3. Run industry production and production-close overflow accounting.
4. Run retail sales.
5. Run weekly retail replenishment.
6. Build the post-local-operation game state and base operating cash flow.
7. Attempt due active routes, sorted by priority then numeric route sequence. The scheduler changes inventory/orders/routes but not cash.
8. Sum `scheduledTransportCost` from attempt evidence.
9. Calculate final `operatingCosts`, `operatingCashFlow`, and game cash exactly once in `simulateDay`.
10. Service finance, write the daily report, increment the day, and continue existing event/world transitions.

The required invariant is:

```ts
finalOperatingCashFlow = baseOperatingCashFlow - scheduledTransportCost;
preFinanceCash = startingCash + finalOperatingCashFlow;
```

`simulateDay` writes `preFinanceCash` once. The scheduler must not subtract transport cost, and no later formula may subtract it again.

Tests must assert:

```ts
report.logistics.scheduledTransportCost === sum(attempt.transportCost)
report.operatingCosts === baseOperatingCosts + scheduledTransportCost
report.operatingCashFlow === baseOperatingCashFlow - scheduledTransportCost
preFinanceCash === startingCash + report.operatingCashFlow
cashAfter === cashBefore + netCashChange
```

Manual command costs happen outside the tick and are never inserted into a later daily report.

Arrivals precede production so day-N delivery is usable on day N. Scheduled exports follow production and retail replenishment so local operations receive first access to same-day stock.

## Arrival and overflow

Arrival uses `addCityInventoryMaterial` without a capacity clamp and changes the order status to delivered.

There is no logistics overflow ledger or arrival fee. Existing production-close `getCityInventoryStats` remains the only overflow calculation and charge path. An arrival may create overflow, while same-day production may consume delivered material before that snapshot.

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

Report rows are immutable facts, not mutable route state and not a source for rebuilding inventory.

For every attempt:

- `unusedCapacity = capacity - dispatchedQuantity`;
- `unmetDemand = destinationNeed - dispatchedQuantity`;
- zero dispatch uses `transportCost: 0` and `transferOrderId: null`.

## Read models

`logisticsReadModels.ts` derives views without caches.

### In-transit inventory

Group in-transit orders by destination city and material. Return quantity, order IDs, and earliest arrival day. Sort by world-city catalog order, material ID, then numeric transfer sequence.

### Recent transfers

Sort by dispatch day descending and numeric transfer sequence descending. Default limit: 20.

### Route operations

For each current route expose:

- route definition;
- route-sourced in-transit quantity;
- latest dispatch attempt;
- latest utilization ratio;
- unused capacity;
- unmet demand;
- delivered units;
- transport cost.

Sort current routes by priority then numeric route sequence. Removed routes remain visible through order history and historical reports only.

### Aggregate totals and retention decision

Derive exact delivered units and transport cost from transfer orders. Do not persist duplicate counters.

Transfer orders are intentionally unbounded in this pre-release slice. This is a deliberate KISS choice because:

- current reports are already unbounded and materially larger;
- expected route/order volume is small;
- adding counters plus a retained window creates duplicate accounting state;
- pruning now would weaken the authoritative-history contract before save growth is measured.

HPA-294 does not promise transparent future compaction. Any retention change requires a separate measured design/schema change that explicitly redefines historical selectors and totals.

## Normal-operation alert evidence

Expose a pure logistics alert collector from `logisticsReadModels.ts`:

```ts
export type LogisticsAlert =
  | {
      kind: 'route-origin-stock';
      routeId: string;
      originCityId: WorldCityId;
      destinationCityId: WorldCityId;
    }
  | {
      kind: 'route-capacity-shortfall';
      routeId: string;
      originCityId: WorldCityId;
      destinationCityId: WorldCityId;
    };

export function collectLogisticsAlerts(game: GameState): LogisticsAlert[];
```

Rules:

- origin-stock: latest due attempt had positive destination need and origin stock below `min(destinationNeed, capacity)`;
- capacity-shortfall: latest three due attempts all had `destinationNeed > capacity` with enough origin stock to fill capacity.

Export the threshold constant for tests. Sort alerts by current route priority then numeric route sequence.

HPA-294 **does not add these kinds to `collectGameAlerts`** and does not change localization. HPA-574 maps the pure evidence into live `GameAlert`, copy, navigation, and presentation together, preventing blank HUD alerts.

## Persistence and validation

Set `SAVE_SCHEMA_VERSION = 15`. Schema 14 is unsupported; add no migration.

Current-state validation requires:

- a plain structured-cloneable `logistics` object;
- positive safe next sequences;
- unique canonical `transfer-N` and `route-N` IDs below their next sequence;
- valid transfer source payloads;
- valid distinct industry endpoints and material IDs;
- positive safe quantities with `dispatchedQuantity <= requestedQuantity`;
- manual equality between requested and dispatched quantities;
- `createdOnDay <= dispatchedOnDay < arrivalOnDay`;
- nonnegative safe total cost;
- in-transit arrival on or after `game.day`;
- delivered arrival before `game.day`;
- unique valid current route definitions;
- active routes scheduled on or after `game.day`;
- paused routes may retain an overdue day;
- route-sourced orders may reference removed routes.

Normalize stored orders/routes by numeric sequence. Runtime scheduling uses priority then numeric route sequence.

Historical `DailyLogisticsReport` rows receive structural validation only. Do not replay them against current routes, orders, inventories, or cash. Removed or edited routes cannot invalidate historical evidence.

## Scenario boundary

Do not add logistics authoring fields to scenarios in HPA-294. Existing scenarios initialize empty logistics state through `createNewGame`. Tests may call domain commands after setup.

Add scenario logistics schema only when an actual authored scenario requires seeded orders or routes.

## Main implementation files

Core:

- `src/lib/game/types.ts`
- `src/lib/game/state.ts`
- `src/lib/game/interCityLogistics.ts` (new)
- `src/lib/game/logisticsReadModels.ts` (new)
- `src/lib/game/simulateDay.ts`

Persistence:

- `src/lib/persistence/saveTypes.ts`
- `src/lib/persistence/saveCodec.ts`

Focused tests:

- `src/lib/game/interCityLogistics.spec.ts` (new)
- `src/lib/game/logisticsReadModels.spec.ts` (new)
- `src/lib/game/interCityLogistics.integration.spec.ts` (new)
- `src/lib/game/simulateDay.spec.ts`
- `src/lib/persistence/saveCodec.spec.ts`
- fixtures that construct `GameState` or `DailyReport` directly

No logistics UI, Phaser/map, route-controller, localization, or Playwright behavior belongs in this implementation. Strict schema-fixture edits are allowed where schema 15 requires them.

## Verification matrix

Focused tests cover:

- manual quote, dispatch, stock removal, cost, and arrival day;
- invalid endpoints/material/quantity, insufficient stock, and insufficient cash with no mutation;
- arrival timing and existing overflow semantics;
- cadence, destination need, inbound reservations, capacity, and origin constraints;
- deterministic contention by priority and numeric ID;
- pause/resume/edit/reprioritize/removal affecting future attempts only;
- route deletion while an order is in transit;
- zero-quantity evidence without an empty order or sequence gap;
- single-owner scheduled cash reconciliation;
- schema-15 round-trip and stale-schema rejection;
- transit, recent history, route operations, exact totals, retention contract, and pure logistics alerts.

One headless multi-day integration test uses the real `simulateDay` flow for a manual transfer plus recurring route through dispatch, arrival, route edit/removal, inventory reconciliation, reports, and cash.

## Non-goals

- timed industry-to-retail replenishment transit;
- mutable transit totals or a second history store;
- transfer retention windows or lifetime counters;
- pending, rejected, recalled, rerouted, delayed, failed, or cancelled orders;
- random reliability or event disruption semantics;
- route target DSLs, queues, generic schedulers, or workflow engines;
- city closure, customs, taxation, vehicles, pathfinding, or animation;
- planner forecasts, recommendations, or automatic route changes;
- live alert copy/navigation or any player-facing UI;
- pre-release save migration or stale-reference repair.

## Acceptance criteria

- Manual and scheduled movement share one transfer-creation path.
- Manual commands atomically apply stock, order, sequence, and immediate cost or reject without mutation.
- Scheduled transport cost is applied exactly once by `simulateDay` and reconciles with report evidence.
- Transfer orders are the only transit/history record.
- Arrivals are available before production on their documented day.
- Routes respect destination capacity need, inbound reservations, capacity, stock, frequency, priority, and numeric stable ordering.
- Route lifecycle commands cannot mutate dispatched orders.
- Existing production-close overflow remains the only overflow charge.
- Schema 15 round-trips strictly with no schema-14 migration.
- Read models and alert evidence are pure, exact, uncached, and UI-agnostic.
- Weekly retail replenishment remains unchanged and outside this slice.
- Production code introduces no duplicate ledger, cached metric, generic scheduler, reliability framework, repair path, blank live alert, planner rule, or UI layer.
