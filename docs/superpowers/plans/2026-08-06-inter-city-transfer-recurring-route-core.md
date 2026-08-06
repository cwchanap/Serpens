# Inter-City Transfer and Recurring-Route Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one deterministic logistics core for manual inter-city transfers and recurring routes with strict persistence, daily simulation integration, reconciled accounting, and derived operational read models.

**Architecture:** Add one authoritative `LogisticsState` to `GameState`. Keep stock removal, transport charging, transfer creation, and sequence allocation behind one dispatch path; layer recurring cadence over it; derive transit, history, metrics, and alerts instead of persisting duplicate ledgers or caches.

**Tech Stack:** TypeScript 6, SvelteKit game core, Vitest, strict current-schema save codec, existing city-inventory and daily-simulation modules.

## Global constraints

- HPA-294 only: no Svelte/Phaser behavior, route-controller integration, localization, planner rules, or world-map work.
- Transfer orders are the only transit/history record.
- Manual transfers reject partial stock and insufficient cash.
- Scheduled quantity is exactly `min(destination need, route capacity, origin stock)`; cash is not a fourth cap.
- Arrivals run before production; scheduled exports run after production and retail replenishment.
- Destination need is free destination warehouse capacity minus all inbound reservations.
- Existing production-close overflow semantics remain the only overflow charge path.
- Save schema 15 only; no schema-14 migration or stale-reference repair.
- No pending/rejected/failed/delayed/recall/reroute states, reliability model, queue, generic scheduler, route-policy DSL, or cached route metrics.

---

## Task 1: Add authoritative logistics state and schema-15 validation

**Files**

- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Update existing schema fixtures returned by:

```bash
rg -l "schemaVersion:\s*14|SAVE_SCHEMA_VERSION" src
```

**Interfaces**

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

export interface LogisticsState {
  transferOrders: TransferOrder[];
  recurringRoutes: RecurringRoute[];
  nextTransferSequence: number;
  nextRouteSequence: number;
}
```

- [ ] Add failing tests that a new game initializes empty collections and both sequences at `1`.
- [ ] Add one save round-trip fixture containing a delivered manual order, an in-transit route order, and a paused route.
- [ ] Add rejection tests for missing logistics state, duplicate/malformed IDs, counters not beyond existing IDs, invalid endpoints/materials/numbers/days/status, and active routes scheduled before `game.day`.
- [ ] Prove a route-sourced order may reference a removed route.
- [ ] Prove schema 14 is rejected rather than migrated.
- [ ] Add the types and `GameState.logistics`.
- [ ] Initialize in `createNewGame`:

```ts
logistics: {
  transferOrders: [],
  recurringRoutes: [],
  nextTransferSequence: 1,
  nextRouteSequence: 1
}
```

- [ ] Set `SAVE_SCHEMA_VERSION = 15` and add `invariant-logistics` to `SaveDataErrorCode`.
- [ ] Implement `validateCurrentLogisticsState(game)` with these rules:
  - sequences are positive safe integers;
  - IDs are unique canonical `transfer-N` / `route-N` values below their next sequence;
  - endpoints are distinct opened, materialized industry cities with inventories;
  - materials are catalog IDs;
  - quantities/capacity/frequency/lead time/per-unit cost are positive safe integers;
  - route priority and total order cost are nonnegative safe integers;
  - `dispatchedQuantity <= requestedQuantity`, with equality for manual orders;
  - `createdOnDay <= dispatchedOnDay < arrivalOnDay`;
  - in-transit arrival is `>= game.day`; delivered arrival is `< game.day`;
  - active route schedule is `>= game.day`; paused routes may retain an overdue day.
- [ ] Normalize orders/routes by numeric ID sequence; runtime priority order remains separate.
- [ ] Update strict-schema fixtures to schema 15 with empty logistics state unless the test exercises logistics.
- [ ] Do not add scenario logistics authoring fields. Schema-only fixture edits in an existing E2E/scenario file are acceptable.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/game/state.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  src/lib/persistence/saveRepository.spec.ts \
  src/lib/persistence/tauriSaveRepository.spec.ts \
  src/lib/persistence/scenarioCodec.spec.ts \
  src/lib/persistence/scenarioRepository.spec.ts \
  --maxWorkers=1
bun run check
```

**Commit**

```bash
git commit -am "feat(logistics): add authoritative transfer state"
```

---

## Task 2: Implement manual transfer quotes, dispatch, and arrivals

**Files**

- Create: `src/lib/game/interCityLogistics.ts`
- Create: `src/lib/game/interCityLogistics.spec.ts`
- Modify fixture only when useful: `src/lib/game/cityInventory.testUtils.ts`

**Interfaces**

```ts
export const INTER_CITY_DISTANCE_PER_BAND = 25;

export interface InterCityTransferQuote {
  leadTimeDays: number;
  transportCostPerUnit: number;
  transportCost: number;
}

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

export function quoteInterCityTransfer(
  game: GameState,
  input: Pick<ManualTransferInput, 'originCityId' | 'destinationCityId' | 'quantity'>
): InterCityTransferQuote | null;

export function dispatchManualTransfer(
  game: GameState,
  input: ManualTransferInput
): ManualTransferResult;

export function processTransferArrivals(
  game: GameState,
  day: number
): { game: GameState; arrivals: DailyTransferArrival[]; deliveredUnits: number };
```

- [ ] Write quote tests using two opened industry cities.
- [ ] Calculate one distance band as:

```ts
const distance = Math.hypot(destination.worldX - origin.worldX, destination.worldY - origin.worldY);
const band = Math.max(1, Math.ceil(distance / INTER_CITY_DISTANCE_PER_BAND));
```

`leadTimeDays` and `transportCostPerUnit` both equal `band`; total cost is `band * quantity`.

- [ ] Test successful manual dispatch removes the full quantity, charges the full cost, appends `transfer-1`, sets arrival to `game.day + leadTimeDays`, and advances only `nextTransferSequence`.
- [ ] Parameterize invalid endpoint/material/quantity, insufficient stock, and insufficient cash tests; assert the entire input game remains equal to a pre-command clone.
- [ ] Implement one private `dispatchTransferOrder(...)` as the only production path that removes origin stock, subtracts cost, appends an order, and advances the sequence.
- [ ] Use safe-integer multiplication and validate before mutation.
- [ ] Write arrival tests for not-yet-due orders, stable numeric ID ordering, exact destination addition, immutable order fields, and aggregated delivered units.
- [ ] Implement arrivals with `addCityInventoryMaterial`; change only `status` to `delivered`.
- [ ] Allow arrival to exceed capacity. Do not calculate or charge overflow here.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/cityInventory.spec.ts \
  --maxWorkers=1
bun run check
```

**Commit**

```bash
git add src/lib/game/interCityLogistics.ts src/lib/game/interCityLogistics.spec.ts src/lib/game/types.ts src/lib/game/cityInventory.testUtils.ts
git commit -m "feat(logistics): add manual transfer lifecycle"
```

---

## Task 3: Add recurring-route commands and scheduler

**Files**

- Modify: `src/lib/game/interCityLogistics.ts`
- Modify: `src/lib/game/interCityLogistics.spec.ts`

**Interfaces**

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

export type RecurringRouteFailure =
  | 'route-not-found'
  | 'invalid-origin'
  | 'invalid-destination'
  | 'same-city'
  | 'invalid-material'
  | 'invalid-capacity'
  | 'invalid-frequency'
  | 'invalid-lead-time'
  | 'invalid-cost'
  | 'invalid-priority';

export function createRecurringRoute(game: GameState, input: RecurringRouteInput): RecurringRouteResult;
export function updateRecurringRoute(game: GameState, routeId: string, input: RecurringRouteInput): RecurringRouteResult;
export function pauseRecurringRoute(game: GameState, routeId: string): RecurringRouteResult;
export function resumeRecurringRoute(game: GameState, routeId: string): RecurringRouteResult;
export function reprioritizeRecurringRoute(game: GameState, routeId: string, priority: number): RecurringRouteResult;
export function removeRecurringRoute(game: GameState, routeId: string): RouteRemovalResult;
export function compareRecurringRoutes(left: RecurringRoute, right: RecurringRoute): number;
export function getDestinationTransferNeed(game: GameState, destinationCityId: WorldCityId): number;
export function processRecurringRouteDispatches(
  game: GameState,
  closingDay: number
): { game: GameState; attempts: DailyRouteDispatchAttempt[]; scheduledTransportCost: number };
```

- [ ] Test create validation, deterministic `route-1` allocation, active state, immediate `nextDispatchOnDay`, and no sequence consumption on failure.
- [ ] Test update changes endpoints/material/capacity/frequency/lead time/cost while preserving ID, state, priority, next scheduled day, and all existing orders.
- [ ] Make pause/resume idempotent. Pause preserves schedule; resume uses `Math.max(route.nextDispatchOnDay, game.day)`.
- [ ] Test reprioritization changes only priority.
- [ ] Test removal deletes only the route and never rewrites route-sourced orders.
- [ ] Implement destination need as:

```ts
Math.max(
  0,
  getCityInventoryStats(game, destinationCityId).capacity -
    getCityInventoryStats(game, destinationCityId).used -
    inTransitUnitsReservedForDestination
)
```

Reservations include every material because destination warehouse capacity is shared.

- [ ] Test delivered orders and other destinations do not reserve capacity.
- [ ] Sort due active routes by lower priority then numeric route ID.
- [ ] Re-read origin stock and destination need from the accumulated game before every attempt.
- [ ] Dispatch exactly:

```ts
Math.min(destinationNeed, route.capacity, availableOriginStock)
```

- [ ] Positive attempts call the Task 2 shared dispatch primitive with `requestedQuantity: destinationNeed` and no cash rejection.
- [ ] Zero attempts append evidence, advance cadence, create no order, consume no transfer sequence, and charge zero.
- [ ] Advance every attempted route once to `closingDay + frequencyDays`; do not replay missed intervals.
- [ ] Test competing routes, priority/ID ties, paused/future routes, destination reservations, origin constraint, and negative cash after an automated dispatch.

**Verify**

```bash
bun run test:unit -- --run src/lib/game/interCityLogistics.spec.ts --maxWorkers=1
bun run check
```

**Commit**

```bash
git add src/lib/game/interCityLogistics.ts src/lib/game/interCityLogistics.spec.ts
git commit -m "feat(logistics): add recurring route scheduler"
```

---

## Task 4: Integrate daily simulation and report evidence

**Files**

- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Update direct report fixtures returned by:

```bash
rg -l "DailyReport|productionReport:" src --glob "*.spec.ts" --glob "*.testUtils.ts"
```

**Report interfaces**

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

`DailyReport` gains `logistics: DailyLogisticsReport`.

- [ ] Add a test proving a due arrival is available to same-day production.
- [ ] Add a test proving local production/replenishment receives origin stock before a due route exports it.
- [ ] Add an empty-logistics-day report test.
- [ ] Add scheduled-cost reconciliation assertions:

```ts
report.logistics.scheduledTransportCost === sumAttemptCosts
report.operatingCosts === priorOperatingCosts + sumAttemptCosts
report.operatingCashFlow === priorOperatingCashFlow - sumAttemptCosts
report.cashAfter === report.cashBefore + report.netCashChange
```

- [ ] Add an arrival-overflow test proving production-close overflow remains the only charge.
- [ ] At the start of `simulateDay`, after ownership validation, call `processTransferArrivals(game, closingDay)` and use its game for all later phases.
- [ ] Keep current local operations intact through production, sales, and replenishment.
- [ ] Build post-local-operation cash using the existing operating cash flow, then call `processRecurringRouteDispatches`.
- [ ] Add scheduled cost to `operatingCosts` and subtract it from `operatingCashFlow`; assert the scheduler-returned cash equals the recalculated cash before finance service.
- [ ] Service finance from the scheduler-returned state.
- [ ] Populate `DailyReport.logistics` from arrival and route results.
- [ ] Do not put command-time manual transfer costs into a later daily report; all order costs remain available through order selectors.
- [ ] Extend report decoding structurally. Historical rows may reference removed/edited routes; do not replay them against current state.
- [ ] Round-trip one successful attempt, one zero attempt, and one arrival; reject malformed quantities/IDs/endpoints/materials and inconsistent null-order/cost pairs.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/industryProduction.spec.ts \
  src/lib/game/retailSupply.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  --maxWorkers=1
bun run check
```

**Commit**

```bash
git add src/lib/game/types.ts src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts src/lib/persistence/saveCodec.ts src/lib/persistence/saveCodec.spec.ts
git commit -m "feat(logistics): integrate daily transfers and routes"
```

---

## Task 5: Add derived read models and alerts

**Files**

- Create: `src/lib/game/logisticsReadModels.ts`
- Create: `src/lib/game/logisticsReadModels.spec.ts`
- Modify: `src/lib/game/alerts.ts`
- Modify: `src/lib/game/alerts.spec.ts`

**Interfaces**

```ts
export interface InTransitInventorySummary {
  destinationCityId: WorldCityId;
  materialId: MaterialId;
  quantity: number;
  orderIds: string[];
  earliestArrivalOnDay: number;
}

export interface RouteOperationalSummary {
  route: RecurringRoute;
  inTransitQuantity: number;
  latestAttempt: DailyRouteDispatchAttempt | null;
  utilization: number | null;
  unusedCapacity: number;
  unmetDemand: number;
  deliveredUnits: number;
  transportCost: number;
}

export function selectInTransitInventory(game: GameState): InTransitInventorySummary[];
export function selectRecentTransfers(game: GameState, limit?: number): TransferOrder[];
export function selectRouteOperations(game: GameState): RouteOperationalSummary[];
export function selectLogisticsTotals(game: GameState): { deliveredUnits: number; transportCost: number };

export const ROUTE_CAPACITY_SHORTFALL_ATTEMPTS = 3;
```

- [ ] Test transit grouping by destination/material, order IDs, earliest arrival, and stable catalog/material/order ordering.
- [ ] Test recent history sorts by dispatch day then numeric transfer ID descending, with default limit 20.
- [ ] Test route summaries derive route-sourced in-transit units, latest attempt, utilization, unused capacity, unmet demand, delivered units, and all-time transport cost.
- [ ] Test removed routes disappear from current route summaries but remain in transfer history/totals.
- [ ] Count delivered units only from delivered orders; count cost from every dispatched order.
- [ ] Add `route-origin-stock` and `route-capacity-shortfall` alert kinds plus optional `routeId` on `GameAlert`.
- [ ] Emit origin-stock alert when the latest attempt has positive need and:

```ts
availableOriginStock < Math.min(destinationNeed, capacity)
```

- [ ] Emit capacity-shortfall only when the latest three attempts all have `destinationNeed > capacity` and enough origin stock to fill capacity.
- [ ] Test fewer attempts, zero need, or a stock-constrained attempt do not produce capacity-shortfall.
- [ ] Emit alerts only for current routes, sorted by priority then numeric route ID.
- [ ] Carry route/city identity only; HPA-574 owns navigation and presentation.
- [ ] Keep all selectors pure with no memoization or persisted counters.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/alerts.spec.ts \
  --maxWorkers=1
bun run check
```

**Commit**

```bash
git add src/lib/game/logisticsReadModels.ts src/lib/game/logisticsReadModels.spec.ts src/lib/game/alerts.ts src/lib/game/alerts.spec.ts
git commit -m "feat(logistics): derive route operations and alerts"
```

---

## Task 6: Add one headless multi-day integration test

**Files**

- Create: `src/lib/game/interCityLogistics.integration.spec.ts`
- Modify fixture only if needed: `src/lib/game/cityInventory.testUtils.ts`

- [ ] Start from `createNewGame`, reveal/open `breadbasket-basin` through the real world transition, add valid warehouse fixtures to both industry cities, and seed origin inventory/cash.
- [ ] Dispatch a manual transfer through the public command.
- [ ] Simulate until the quoted day; prove it is unavailable before arrival and available on the exact day.
- [ ] Create a due recurring route and simulate until at least two attempts and one scheduled arrival occur.
- [ ] Reconcile route cadence, origin stock, inbound reservations, destination stock, delivered units, transfer IDs, report costs, and cash.
- [ ] Edit capacity/frequency/lead time/cost while an order is in transit; prove the existing order keeps its original quantity/day/cost and the next dispatch uses edited settings.
- [ ] Remove the route with an order in transit; prove the order still arrives and history remains visible.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/game/interCityLogistics.integration.spec.ts \
  src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  --maxWorkers=1
```

**Commit**

```bash
git add src/lib/game/interCityLogistics.integration.spec.ts src/lib/game/cityInventory.testUtils.ts
git commit -m "test(logistics): cover multi-day transfer lifecycle"
```

---

## Task 7: Audit scope and run full verification

- [ ] Audit forbidden duplicate state and abstractions:

```bash
rg -n "inTransitLedger|transferHistoryStore|routeMetricsCache|cachedRoute|pendingTransfer|rejectedOrder" src
rg -n "reliab|shipmentFailure|failed-shipment|recall|rerout|customs|vehicle|pathfind|route-policy|workflow queue" src/lib/game src/lib/persistence
rg -n "migrateV|MIGRATABLE_SCHEMA_VERSIONS|LegacyV14" src
```

Expected production matches: none.

- [ ] Audit one dispatch/arrival path:

```bash
rg -n "nextTransferSequence|transferOrders:\s*\[|removeCityInventoryMaterial\(" src/lib/game
rg -n "processRecurringRouteDispatches|processTransferArrivals|scheduledTransportCost" src/lib/game
```

Confirm one production order-creation path, one arrival path, one scheduler caller, pure read models, and no second overflow charge.

- [ ] Inspect changed files:

```bash
git diff --name-only main...HEAD
```

No behavioral changes belong under components, Phaser/map modules, route controller, or localization. Permit only schema-fixture updates where schema 15 requires them.

- [ ] Run focused checks:

```bash
bun run check
bun run lint
bun run test:unit -- --run \
  src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/interCityLogistics.integration.spec.ts \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/game/alerts.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  --maxWorkers=1
```

- [ ] Run the full suite:

```bash
bun run test:unit -- --run --maxWorkers=1
bun run test:e2e -- --workers=1
git diff --check main...HEAD
```

- [ ] Map every HPA-294 acceptance criterion to a named test, especially command atomicity, daily timing, route future-only edits/removal, schema-15 round-trip, and every requested read model.

**Optional final commit only when audit changes files**

```bash
git add src
git commit -m "test(logistics): verify deterministic route core"
```

## Completion criteria

- Seven green checkpoints in one implementation PR.
- Manual and recurring movement share one order lifecycle.
- Inventory and cash reconcile across origin, transit, destination, overflow, and transport cost.
- Orders/routes are the only mutable logistics collections.
- Schema 15 round-trips; schema 14 is unsupported.
- Read models and alerts are derived and UI-agnostic.
- No migration, repair path, duplicate ledger, cached metric, reliability model, generic scheduler, planner behavior, or UI feature is introduced.
