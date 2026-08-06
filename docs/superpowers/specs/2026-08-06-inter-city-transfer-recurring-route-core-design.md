# Inter-City Transfer and Recurring-Route Core Design

**Date:** 2026-08-06  
**Status:** Proposed for HPA-294  
**Prerequisite:** HPA-554 / PR #33 is merged  
**Delivery:** One domain-focused implementation PR

## Summary

HPA-294 adds one deterministic industry-to-industry logistics core on top of the simplified city-local inventory model.

Manual transfers and recurring routes share one transfer-order lifecycle. Mutable logistics state contains only transfer orders, recurring-route definitions, and monotonic identity counters. Transit totals, history, utilization, destination shortfall, delivered units, and costs are derived from authoritative orders plus immutable daily attempt evidence.

Priorities are:

1. One authoritative state path for inter-city material movement.
2. Deterministic daily timing and accounting.
3. Small domain APIs that later UI, event, and planner work can consume.
4. KISS and YAGNI over generic scheduling, recovery, retention, or alert frameworks.

There is no schema-14 migration, reliability model, second transit ledger, cached route metrics, or player-facing UI work.

## Scope boundary

HPA-294 moves material between opened, materialized **industry-city inventories**.

It does not replace weekly retail replenishment with transfer orders. `applyWeeklyReplenishment` continues to debit the configured industry-city inventory immediately and import any shortage. Converting industry-to-retail replenishment into timed transit requires a separate ticket.

This resolves the older HPA-292 narrative that mentioned HPA-294 replacing immediate retail debit. The first logistics slice establishes industry-to-industry movement only.

## Current architecture fit

The merged HPA-554 state provides stable boundaries:

- `CityInventory` stores only `cityId` and material quantities.
- `getCityInventory` validates opened, materialized industry cities.
- `addCityInventoryMaterial` and `removeCityInventoryMaterial` are the stock mutation path.
- `getCityInventoryStats` derives warehouse capacity and overflow.
- production closes before weekly retail replenishment.
- current-schema persistence is strict.
- historical reports are non-authoritative evidence.
- `simulateDay` owns daily ordering and the single operating-cash write.

HPA-294 extends these contracts rather than creating another inventory or accounting model.

## Module structure

Use two focused modules:

- `src/lib/game/interCityLogistics.ts` — validation, quotes, commands, transfer creation, arrivals, route cadence, and ordering/quantity helpers.
- `src/lib/game/logisticsReadModels.ts` — transit/history selectors, route operational summaries, and totals.

Persisted and report wire types remain in `src/lib/game/types.ts`, matching existing repository conventions.

Do not add a generic scheduler, queue, workflow engine, route-policy DSL, or logistics service layer.

## Authoritative state

Add one nested state object:

```ts
export interface LogisticsState {
  transferOrders: TransferOrder[];
  recurringRoutes: RecurringRoute[];
  nextTransferSequence: number;
  nextRouteSequence: number;
}
```

The counters follow the existing finance/event identity pattern and prevent ID reuse after route removal.

Generated IDs are:

- `transfer-${nextTransferSequence}`
- `route-${nextRouteSequence}`

Successful creation increments the matching sequence. Rejected commands and zero-quantity scheduled attempts consume no sequence.

### Transfer order

```ts
export type TransferOrderSource =
  | { kind: 'manual' }
  | { kind: 'recurring-route'; routeId: string };

export interface TransferOrder {
  id: string;
  source: TransferOrderSource;
  originCityId: WorldCityId;
  destinationCityId: WorldCityId;
  materialId: MaterialId;
  quantity: number;
  createdOnDay: number;
  dispatchedOnDay: number;
  arrivalOnDay: number;
  transportCost: number;
  status: 'in-transit' | 'delivered';
}
```

An order stores only what actually moved. Manual requested quantity is already equal to shipped quantity; scheduled destination need and capacity constraints belong to `DailyRouteDispatchAttempt`, not the order.

Rules:

- Append an order only for a positive dispatch.
- `createdOnDay === dispatchedOnDay` in this first slice; there is no pending state.
- ID, source, endpoints, material, quantity, days, and cost are immutable after dispatch.
- Arrival changes only `status` from `in-transit` to `delivered`.
- Route edit or removal cannot rewrite an order.

### Recurring route

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

## Stable ordering and identity

Engine tie-breaks use plain string comparison, matching existing rail, production, and alert conventions:

```ts
function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
```

Consequences:

- equal-priority routes sort by raw route ID;
- same-day arrivals sort by raw transfer ID;
- read-model ties use the same rule;
- no runtime comparator parses numeric suffixes or calls `localeCompare`.

The save codec may parse the generated suffix in one validation helper solely to prove that `nextTransferSequence` and `nextRouteSequence` cannot generate an existing ID. Numeric parsing is not an ordering primitive and is not duplicated elsewhere.

## Transport quote

Manual transfer UI under HPA-574 supplies origin, destination, material, and quantity. HPA-294 owns one deterministic quote contract.

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

Pin the current catalog behavior in tests:

- Industry City ↔ Breadbasket Basin: band 2.
- Breadbasket Basin ↔ Quarry Works: band 2.
- Industry City ↔ Quarry Works: band 3.

A coordinate change therefore produces an explicit balance-test failure.

## Manual command contracts

```ts
export interface ManualTransferInput {
  originCityId: string;
  destinationCityId: string;
  materialId: string;
  quantity: number;
}

export type ManualTransferValidationFailure =
  | 'invalid-origin'
  | 'invalid-destination'
  | 'same-city'
  | 'invalid-material'
  | 'invalid-quantity';

export type ManualTransferFailure =
  | ManualTransferValidationFailure
  | 'insufficient-origin-stock'
  | 'insufficient-cash';

export type ManualTransferQuoteResult =
  | { ok: true; quote: InterCityTransferQuote }
  | { ok: false; reason: ManualTransferValidationFailure };

export type ManualTransferResult =
  | { ok: true; game: GameState; order: TransferOrder }
  | { ok: false; reason: ManualTransferFailure };

export function quoteInterCityTransfer(
  game: GameState,
  input: ManualTransferInput
): ManualTransferQuoteResult;

export function dispatchManualTransfer(
  game: GameState,
  input: ManualTransferInput
): ManualTransferResult;
```

`dispatchManualTransfer` calls `quoteInterCityTransfer` rather than re-deriving endpoint/material/quantity validation. After a valid quote it checks full origin stock and affordability.

On success it creates the transfer, then subtracts the quoted cost exactly once. Rejection preserves inventories, cash, collections, and identity counters.

## Route command contracts

Creation includes priority; normal edits deliberately do not:

```ts
export interface RecurringRouteInput {
  originCityId: string;
  destinationCityId: string;
  materialId: string;
  capacity: number;
  frequencyDays: number;
  leadTimeDays: number;
  transportCostPerUnit: number;
  priority: number;
}

export type RecurringRouteUpdateInput = Omit<RecurringRouteInput, 'priority'>;

createRecurringRoute(game, input: RecurringRouteInput)
updateRecurringRoute(game, routeId, input: RecurringRouteUpdateInput)
pauseRecurringRoute(game, routeId)
resumeRecurringRoute(game, routeId)
reprioritizeRecurringRoute(game, routeId, priority)
removeRecurringRoute(game, routeId)
```

Creation sets `state: 'active'` and `nextDispatchOnDay: game.day`.

Update may change endpoints, material, capacity, frequency, lead time, and per-unit cost after validating the complete candidate. It preserves ID, state, priority, and next scheduled day. Reprioritization remains separate so contention changes are explicit and cannot be silently ignored.

Pause preserves `nextDispatchOnDay`. Resume keeps a future day or moves an overdue day to `game.day`. Paused time is not replayed as catch-up dispatches.

Removal deletes only the route definition. Existing orders and historical report evidence remain.

## Shared transfer-creation path

Manual and scheduled movement call one private `createDispatchedTransfer` primitive.

It receives validated source, endpoints, material, quantity, dispatch day, lead time, and per-unit cost. It is the only production path that:

- removes origin stock;
- creates and appends the immutable order;
- increments `nextTransferSequence`;
- returns the concrete order and cost.

It does not mutate cash.

Cash ownership is split only by transaction boundary:

- `dispatchManualTransfer` applies manual cost immediately once.
- `processRecurringRouteDispatches` returns scheduled cost evidence without changing cash.
- `simulateDay` includes scheduled cost once in its existing operating-cost formula and remains the only scheduled-cash writer.

Safe transport-cost multiplication stays private and domain-specific in `interCityLogistics.ts`. Do not move HPA-554 inventory helpers or introduce a generic arithmetic module for one additional operation.

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
- competing routes consume need sequentially in priority/raw-ID order;
- HPA-297 can reuse pure quantity/order helpers without importing planner demand into live logistics.

## Scheduled route attempt

For each active route due on the closing day:

```text
destinationNeed = getDestinationTransferNeed(...)
availableOriginStock = current origin material quantity
dispatchedQuantity = min(destinationNeed, route capacity, availableOriginStock)
```

Positive quantity uses `createDispatchedTransfer`.

Zero quantity appends no order and consumes no sequence, but still records immutable daily attempt evidence.

After one positive or zero attempt:

```ts
nextDispatchOnDay = closingDay + frequencyDays;
```

A due route attempts at most once per simulated day. Missed intervals are not replayed. Scheduled cost is not an affordability cap and may make end-of-day cash negative.

## Daily simulation integration

`simulateDay` uses this order:

1. Validate current ownership invariants.
2. Deliver orders with `arrivalOnDay === closingDay`, sorted by raw transfer ID.
3. Run industry production and production-close overflow accounting.
4. Run retail sales.
5. Run weekly retail replenishment.
6. Call `processRecurringRouteDispatches` with a game containing the replenished city inventories.
7. Build reports and operating totals from the route result.
8. Service finance, write the daily report, increment the day, and continue existing event/world transitions.

Scheduled transport cost becomes one additional addend in the existing formula:

```ts
const operatingCosts =
  sum(storeReports, 'operatingCosts') +
  payrollCost +
  productionReport.operatingCost +
  productionReport.overflowCost +
  routeResult.scheduledTransportCost;

const operatingCashFlow = Math.round(revenue - operatingCosts - importSpend);

const afterOperations = {
  ...routeResult.game,
  cash: game.cash + operatingCashFlow,
  // existing updated fields
};
```

The scheduler never writes cash. Existing reconciliation remains authoritative:

```ts
report.logistics.scheduledTransportCost === sum(attempt.transportCost)
report.cashAfter === report.cashBefore + report.netCashChange
```

Manual command costs happen outside the tick and are never inserted into a later daily report.

Arrivals precede production so day-N delivery is usable on day N. Scheduled exports follow production and replenishment so local operations receive first access to same-day stock.

## Arrival and overflow

Arrival uses `addCityInventoryMaterial` without a capacity clamp and changes the order status to delivered.

There is no logistics overflow ledger or arrival fee. Existing production-close `getCityInventoryStats` remains the only overflow calculation and charge path. An arrival may create overflow, while same-day production may consume delivered material before that snapshot.

## Daily logistics evidence

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
  unmetDestinationNeed: number;
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
- `unmetDestinationNeed = destinationNeed - dispatchedQuantity`;
- zero dispatch uses `transportCost: 0` and `transferOrderId: null`.

`unmetDestinationNeed === 0` with `destinationNeed === 0` means the destination currently has no receiving capacity; it is not a demand shortfall. Consumers can distinguish that state from origin or route-capacity constraints using the persisted raw facts without another persisted reason field.

## Read models

`logisticsReadModels.ts` derives views without caches.

### In-transit inventory

Group in-transit orders by destination city and material. Return quantity, order IDs, and earliest arrival day. Sort by world-city catalog order, material ID, then raw order ID.

### Recent transfers

Sort by dispatch day descending and raw transfer ID descending. Default limit: 20.

### Route operations

For each current route expose:

- route definition;
- route-sourced in-transit quantity;
- latest dispatch attempt;
- latest utilization;
- unused capacity;
- unmet destination need;
- delivered units;
- transport cost.

Utilization always uses the attempt’s recorded capacity:

```ts
utilization = latestAttempt
  ? latestAttempt.dispatchedQuantity / latestAttempt.capacity
  : null;
```

A later route edit therefore cannot reinterpret historical utilization with the new capacity.

Sort current routes by priority then raw route ID. Removed routes remain visible through order history and historical reports only.

### Aggregate totals and retention

Derive exact delivered units and transport cost from transfer orders. Do not persist duplicate counters.

Transfer orders are intentionally unbounded in this pre-release slice because expected volume is small, reports are already larger and unbounded, and counters plus a retained window would duplicate accounting state. Any future retention change requires measured save-growth evidence and an explicit schema/selector decision.

## Alert boundary

HPA-294 persists the raw route-attempt evidence needed for future alerts. It does not define `LogisticsAlert`, a three-attempt threshold, or `collectLogisticsAlerts`.

HPA-574 owns actionable alert heuristics together with copy, navigation, and presentation. This avoids shipping an unwired collector or guessing thresholds before the operations UI exists.

## Persistence and validation

Set `SAVE_SCHEMA_VERSION = 15`. Schema 14 is unsupported; add no migration.

Current-state validation requires:

- a plain structured-cloneable `logistics` object;
- positive safe next sequences;
- unique generated transfer and route IDs;
- one codec-local generated-ID suffix check proving each next sequence exceeds existing generated IDs;
- valid source payloads, endpoints, materials, quantities, days, costs, route state, and schedules;
- `createdOnDay === dispatchedOnDay < arrivalOnDay`;
- in-transit arrival on or after `game.day`;
- delivered arrival before `game.day`;
- active route schedule on or after `game.day`;
- paused route may retain an overdue day;
- route-sourced orders may reference removed routes.

Normalize harmless collection order with raw ID comparison. Do not parse IDs for runtime ordering.

Historical `DailyLogisticsReport` rows receive structural validation only. Do not replay them against current routes, orders, inventories, or cash. Removed or edited routes must not invalidate historical evidence.

## Scenario boundary

Do not add scenario logistics authoring fields. Existing scenarios initialize empty logistics state through `createNewGame` and may exercise logistics in tests by calling domain commands after setup.

Add scenario schema only when a real authored scenario requires seeded logistics state.

## Main implementation files

Core:

- `src/lib/game/types.ts`
- `src/lib/game/state.ts`
- `src/lib/game/interCityLogistics.ts` — new
- `src/lib/game/logisticsReadModels.ts` — new
- `src/lib/game/simulateDay.ts`

Persistence:

- `src/lib/persistence/saveTypes.ts`
- `src/lib/persistence/saveCodec.ts`

Focused tests:

- `src/lib/game/interCityLogistics.spec.ts` — new
- `src/lib/game/logisticsReadModels.spec.ts` — new
- `src/lib/game/interCityLogistics.integration.spec.ts` — new
- `src/lib/game/simulateDay.spec.ts`
- `src/lib/persistence/saveCodec.spec.ts`
- fixtures that construct `GameState` or `DailyReport` directly

No behavior change belongs in Svelte, Phaser, route-controller, localization, or Playwright code. Strict schema fixture updates are allowed where schema 15 requires them.

## Verification matrix

Focused tests cover:

- typed quote validation and the three concrete distance bands;
- manual dispatch, exact stock removal, one cash charge, and arrival day;
- invalid endpoints/material/quantity, insufficient stock, and insufficient cash with no mutation;
- arrival timing and existing overflow behavior;
- route cadence, destination need, inbound reservations, capacity, and origin constraint;
- deterministic contention by priority and raw ID;
- pause, resume, edit, reprioritize, and removal affecting future attempts only;
- route deletion while an order is in transit;
- zero-quantity evidence without an empty order or sequence gap;
- scheduled cash and inventory reconciliation through `simulateDay`;
- schema-15 round-trip and stale-schema rejection;
- transit, recent history, attempt-capacity utilization, unmet destination need, delivered-unit, and cost selectors.

One headless multi-day integration test covers manual dispatch/arrival plus recurring attempts and delivery through the real daily simulation.

## Non-goals

- industry-to-retail timed replenishment;
- mutable transit totals, history stores, or lifetime counters;
- pending, rejected, recalled, rerouted, delayed, failed, or cancelled orders;
- reliability, event suspension, vehicle, pathfinding, customs, or taxation;
- route alerts, recommendation heuristics, or planner ranking;
- generic schedulers, queues, workflows, or policy languages;
- player-facing forms, panels, inspectors, navigation, or map visuals;
- pre-release migration or stale-reference repair.

## Acceptance criteria

- Manual and scheduled movement share one cash-free transfer-creation primitive.
- Transfer orders store one authoritative shipped quantity and remain the sole transit/history record.
- Manual quote and dispatch use one typed validation path.
- Invalid, insufficient-stock, or unaffordable manual commands persist nothing.
- Arrivals become available before production on their documented day.
- Recurring routes run after local production/replenishment and respect destination need, inbound reservations, capacity, stock, frequency, priority, and raw-ID ordering.
- Route edit/removal cannot mutate dispatched orders.
- Existing overflow calculation remains the only overflow charge path.
- Scheduled cost is one addend in the existing daily operating-cost formula and is applied once.
- Schema 15 round-trips strictly with no schema-14 migration.
- Read models are pure, uncached, and use attempt capacity for historical utilization.
- Production code introduces no duplicate ledger, generic scheduler, alert heuristic, reliability framework, repair path, or UI layer.
