# Inter-City Transfer and Recurring-Route Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one deterministic logistics core for manual inter-city transfers and recurring routes with strict persistence, daily simulation integration, reconciled accounting, and derived operational read models.

**Architecture:** Add one authoritative `LogisticsState` to `GameState`. Keep all stock removal, transport charging, transfer-order creation, and identity allocation behind one dispatch path; layer recurring-route cadence over that path; derive transit/history/metrics/alerts instead of persisting duplicate ledgers or caches.

**Tech Stack:** TypeScript 6, SvelteKit game core, Vitest, strict current-schema save codec, existing city-inventory and daily-simulation modules.

## Global Constraints

- Implement HPA-294 only; no Svelte, Phaser, route-controller, localization, or world-map behavior.
- Use transfer orders as the only authoritative in-transit and transfer-history record.
- Use one shared dispatch primitive for manual transfers and recurring routes.
- Keep lead time at least one day; no same-tick arrival.
- Process arrivals before production and recurring dispatches after retail replenishment.
- Derive recurring-route destination need from free destination warehouse capacity minus all inbound reservations.
- Manual transfers reject insufficient stock or cash and never dispatch partially.
- Scheduled quantity is exactly `min(destination need, route capacity, available origin stock)`; cash is not a fourth quantity cap.
- Reuse existing overflow semantics; add no arrival-specific overflow ledger or second overflow charge.
- Bump to save schema 15 with no schema-14 migration or stale-reference repair.
- Add no pending/rejected/failed/delayed/recall/reroute states, reliability model, queue, generic scheduler, route-policy DSL, planner rule, or UI layer.
- Keep each task green before moving to the next checkpoint.

---

## Task 1: Add authoritative logistics state and schema-15 validation

**Files:**

- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify schema fixtures where the existing schema-14 literal or direct current-game payload appears, including:
  - `src/lib/persistence/scenarioCodec.spec.ts`
  - `src/lib/persistence/scenarioRepository.testUtils.ts`
  - `src/lib/persistence/scenarioRepository.spec.ts`
  - `src/lib/persistence/saveRepository.spec.ts`
  - `src/lib/persistence/tauriSaveRepository.spec.ts`
  - any direct serialized current-save fixture returned by `rg -n "schemaVersion:\s*14|SAVE_SCHEMA_VERSION" src`

**Interfaces:**

- Produces:

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

export interface LogisticsState {
  transferOrders: TransferOrder[];
  recurringRoutes: RecurringRoute[];
  nextTransferSequence: number;
  nextRouteSequence: number;
}
```

- `GameState` gains `logistics: LogisticsState`.
- `createNewGame` initializes:

```ts
logistics: {
  transferOrders: [],
  recurringRoutes: [],
  nextTransferSequence: 1,
  nextRouteSequence: 1
}
```

### Step 1: Add failing initialization and schema tests

- [ ] Add a `state.spec.ts` assertion that a new game has empty logistics collections and both counters at `1`.
- [ ] Update the save round-trip fixture to include one delivered manual order, one in-transit route order, and one paused route.
- [ ] Add strict rejection tests for:
  - missing `logistics`;
  - duplicate transfer IDs;
  - duplicate route IDs;
  - malformed `transfer-N` / `route-N` IDs;
  - IDs at or above the next sequence;
  - invalid endpoint, material, quantity, day, cost, status, frequency, lead time, state, or priority;
  - in-transit order arriving before `game.day`;
  - delivered order arriving on or after `game.day`;
  - active route scheduled before `game.day`.
- [ ] Add a retained-behavior test proving a route-sourced order may reference a removed route.
- [ ] Add a stale-schema test proving schema 14 is rejected rather than migrated.

### Step 2: Run the focused tests and confirm failure

- [ ] Run:

```bash
bun run test:unit -- --run \
  src/lib/game/state.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  --maxWorkers=1
```

Expected: type/fixture failures because `GameState.logistics` and schema 15 validation do not exist yet.

### Step 3: Add types, initialization, and schema version

- [ ] Add the interfaces above to `types.ts` near city inventory and report domain types.
- [ ] Add `logistics` to `GameState`.
- [ ] Initialize empty logistics state in `createNewGame`.
- [ ] Set `SAVE_SCHEMA_VERSION = 15` in `saveTypes.ts`.
- [ ] Do not add `MIGRATABLE_SCHEMA_VERSIONS`, a schema-14 wire type, or any migration branch.

### Step 4: Validate current logistics state strictly

- [ ] Add `invariant-logistics` to `SaveDataErrorCode`.
- [ ] Call `validateCurrentLogisticsState(currentGame)` from `validateCurrentGameStateInternal` after current city inventories are validated.
- [ ] Validate safe positive counters and unique canonical numeric IDs.
- [ ] Validate orders with these exact rules:
  - origin and destination are distinct opened, materialized industry cities with inventories;
  - material is in `MATERIAL_ID_SET`;
  - requested and dispatched quantities are positive safe integers;
  - dispatched quantity does not exceed requested quantity;
  - manual requested and dispatched quantities are equal;
  - `createdOnDay <= dispatchedOnDay < arrivalOnDay`;
  - transport cost is a nonnegative safe integer;
  - in-transit arrival is `>= game.day`;
  - delivered arrival is `< game.day`;
  - recurring source route ID is canonical but need not exist in current routes.
- [ ] Validate routes with distinct valid endpoints, material, positive safe capacity/frequency/lead-time/per-unit-cost, nonnegative safe priority, valid state, and nonnegative safe schedule day.
- [ ] Require active routes to have `nextDispatchOnDay >= game.day`; permit paused routes to retain an overdue day.
- [ ] Normalize transfer orders and routes by numeric sequence, not insertion order.

### Step 5: Update schema fixtures without widening scope

- [ ] Update every current-save fixture to schema 15 and include empty logistics state unless the test specifically exercises logistics.
- [ ] Do not add scenario logistics authoring fields. Scenario setup continues to receive empty logistics state from `createNewGame`.
- [ ] Permit schema-only fixture edits in existing E2E or scenario files if the strict schema bump requires them; add no logistics UI behavior or Playwright scenario in this task.

### Step 6: Verify and commit

- [ ] Run:

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

- [ ] Commit:

```bash
git add src/lib/game/types.ts src/lib/game/state.ts src/lib/persistence src/lib/scenarios src/routes
git commit -m "feat(logistics): add authoritative transfer state"
```

Checkpoint: a schema-15 game can persist empty or seeded valid logistics state, and invalid current logistics state rejects atomically.

---

## Task 2: Implement manual quotes, shared dispatch, and arrivals

**Files:**

- Create: `src/lib/game/interCityLogistics.ts`
- Create: `src/lib/game/interCityLogistics.spec.ts`
- Modify only if a shared fixture is useful: `src/lib/game/cityInventory.testUtils.ts`

**Consumes:**

- `GameState.logistics`, `TransferOrder`, and schema-15 state from Task 1.
- `getCityInventory`, `addCityInventoryMaterial`, `removeCityInventoryMaterial`, and world catalog coordinates.

**Produces:**

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

export interface TransferArrivalResult {
  game: GameState;
  arrivals: DailyTransferArrival[];
  deliveredUnits: number;
}

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
): TransferArrivalResult;
```

`DailyTransferArrival` may be introduced in this task or Task 4; if introduced here, Task 4 adds it to `DailyLogisticsReport` without changing the shape.

### Step 1: Write quote and manual-dispatch tests

- [ ] Test world-distance terms with two opened industry cities:

```ts
expect(quote).toEqual({
  leadTimeDays: expectedBand,
  transportCostPerUnit: expectedBand,
  transportCost: expectedBand * quantity
});
```

- [ ] Test successful manual dispatch:
  - origin stock decreases by the full requested quantity;
  - destination stock does not change yet;
  - cash decreases by total quoted cost;
  - one `transfer-1` in-transit order is appended;
  - requested and dispatched quantities are equal;
  - arrival day is `game.day + leadTimeDays`;
  - `nextTransferSequence` becomes `2`.
- [ ] Parameterize rejection coverage for invalid origin, invalid destination, same city, invalid material, non-integer/zero/negative quantity, insufficient stock, and insufficient cash.
- [ ] For every rejection, assert:

```ts
expect(result.ok).toBe(false);
expect(game).toEqual(before);
expect(game.logistics.nextTransferSequence).toBe(before.logistics.nextTransferSequence);
```

### Step 2: Write arrival tests

- [ ] Assert an order does not arrive before `arrivalOnDay`.
- [ ] Assert due orders are processed by numeric transfer ID regardless of collection insertion order.
- [ ] Assert arrival adds material to the destination, changes only status to `delivered`, preserves all immutable order fields, and reports delivered units.
- [ ] Assert multiple due orders aggregate `deliveredUnits` exactly.
- [ ] Assert arrival may take destination inventory above capacity; do not charge or store overflow in this function.

### Step 3: Run focused tests and confirm failure

- [ ] Run:

```bash
bun run test:unit -- --run src/lib/game/interCityLogistics.spec.ts --maxWorkers=1
```

Expected: FAIL because the module and functions do not exist.

### Step 4: Implement endpoint validation and quoting

- [ ] Resolve both endpoints through `getCityInventory`; map failures to origin/destination typed reasons.
- [ ] Reject equal resolved city IDs.
- [ ] Resolve coordinates from `getWorldCityDefinition` and calculate:

```ts
const distance = Math.hypot(destination.worldX - origin.worldX, destination.worldY - origin.worldY);
const distanceBand = Math.max(1, Math.ceil(distance / INTER_CITY_DISTANCE_PER_BAND));
```

- [ ] Use `distanceBand` for both lead time and per-unit cost.
- [ ] Return `null` for invalid endpoints or non-positive/non-safe quantity; the dispatch command still returns the precise typed failure.

### Step 5: Implement one internal dispatch primitive

- [ ] Add one private `dispatchTransferOrder(...)` that receives validated source, endpoints, material, requested/dispatched quantities, day, lead time, cost per unit, and manual affordability behavior.
- [ ] Make it the only production path that:
  - removes origin stock;
  - subtracts transport cost;
  - appends a transfer order;
  - increments `nextTransferSequence`.
- [ ] Use checked safe-integer multiplication for total cost and reject invalid manual input before calling the primitive.
- [ ] Do not export a second mutation helper for recurring routes; Task 3 calls the same private primitive inside this module.

### Step 6: Implement deterministic arrivals

- [ ] Select only `status === 'in-transit' && arrivalOnDay === day`.
- [ ] Sort due orders by numeric transfer sequence.
- [ ] Add each quantity with `addCityInventoryMaterial`.
- [ ] Replace the destination inventory by its validated index.
- [ ] Map the matching order to `{ ...order, status: 'delivered' }`; do not mutate source, quantity, day, or cost fields.
- [ ] Return factual arrival rows and the exact delivered-unit sum.

### Step 7: Verify and commit

- [ ] Run:

```bash
bun run test:unit -- --run \
  src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/cityInventory.spec.ts \
  --maxWorkers=1
bun run check
```

- [ ] Commit:

```bash
git add src/lib/game/interCityLogistics.ts src/lib/game/interCityLogistics.spec.ts src/lib/game/cityInventory.testUtils.ts src/lib/game/types.ts
git commit -m "feat(logistics): add manual transfer lifecycle"
```

Checkpoint: manual transfers quote, reject, dispatch, and arrive through one deterministic order lifecycle.

---

## Task 3: Add recurring-route commands and deterministic scheduling

**Files:**

- Modify: `src/lib/game/interCityLogistics.ts`
- Modify: `src/lib/game/interCityLogistics.spec.ts`

**Consumes:**

- The internal dispatch primitive and arrival/order contracts from Task 2.

**Produces:**

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

export type RecurringRouteResult =
  | { ok: true; game: GameState; route: RecurringRoute }
  | { ok: false; reason: RecurringRouteFailure };

export interface RouteDispatchResult {
  game: GameState;
  attempts: DailyRouteDispatchAttempt[];
  scheduledTransportCost: number;
}

export function createRecurringRoute(
  game: GameState,
  input: RecurringRouteInput
): RecurringRouteResult;

export function updateRecurringRoute(
  game: GameState,
  routeId: string,
  input: RecurringRouteInput
): RecurringRouteResult;

export function pauseRecurringRoute(game: GameState, routeId: string): RecurringRouteResult;
export function resumeRecurringRoute(game: GameState, routeId: string): RecurringRouteResult;
export function reprioritizeRecurringRoute(
  game: GameState,
  routeId: string,
  priority: number
): RecurringRouteResult;
export function removeRecurringRoute(
  game: GameState,
  routeId: string
): { ok: true; game: GameState } | { ok: false; reason: 'route-not-found' };

export function compareRecurringRoutes(left: RecurringRoute, right: RecurringRoute): number;

export function getDestinationTransferNeed(
  game: GameState,
  destinationCityId: WorldCityId
): number;

export function processRecurringRouteDispatches(
  game: GameState,
  closingDay: number
): RouteDispatchResult;
```

### Step 1: Write route-command tests

- [ ] Test create validation for every endpoint/material/numeric failure.
- [ ] Test successful creation uses `route-1`, increments the route sequence, sets `state: 'active'`, and sets `nextDispatchOnDay: game.day`.
- [ ] Test failed creation preserves the entire game and sequence.
- [ ] Test update changes future settings but preserves ID, state, priority, next scheduled day, and every existing transfer order.
- [ ] Test pause preserves schedule; repeated pause is an idempotent successful no-op.
- [ ] Test resume:
  - preserves a future schedule;
  - moves an overdue schedule to `game.day`;
  - repeated resume is an idempotent successful no-op.
- [ ] Test reprioritization validates a nonnegative safe integer and changes no other route field.
- [ ] Test removal deletes only the route and leaves route-sourced in-transit/delivered orders unchanged.

### Step 2: Write destination-need tests

- [ ] Use a destination with known warehouse capacity and current used units.
- [ ] Assert all in-transit units to that destination reserve shared capacity regardless of material or source.
- [ ] Assert delivered orders and orders to other destinations do not reserve capacity.
- [ ] Assert the result floors at zero rather than becoming negative.

### Step 3: Write scheduled-attempt tests

- [ ] Test quantity equals the minimum of destination need, route capacity, and available origin stock.
- [ ] Test competing due routes consume origin stock and destination reservation sequentially.
- [ ] Test lower numeric priority runs first and equal priority uses numeric route ID.
- [ ] Test a paused route never attempts or advances its schedule.
- [ ] Test a future active route never attempts.
- [ ] Test a due route attempts once even when `nextDispatchOnDay` is several intervals overdue.
- [ ] Test every attempted route advances to `closingDay + frequencyDays`.
- [ ] Test a zero-quantity attempt:
  - returns evidence;
  - advances route cadence;
  - appends no transfer order;
  - does not increment the transfer sequence;
  - charges zero cost.
- [ ] Test scheduled dispatch uses the shared path, creates a route-sourced order, removes exact stock, charges exact cost, and may make cash negative.

### Step 4: Run tests and confirm failure

- [ ] Run:

```bash
bun run test:unit -- --run src/lib/game/interCityLogistics.spec.ts --maxWorkers=1
```

Expected: new route-command and scheduler tests fail.

### Step 5: Implement focused route commands

- [ ] Reuse one route-input validator for create and update; return field-specific typed failures.
- [ ] Create IDs from `nextRouteSequence` and increment only after successful creation.
- [ ] Make pause/resume idempotent instead of adding already-paused/already-active failure codes.
- [ ] Preserve `nextDispatchOnDay` on update and pause.
- [ ] On resume, set `nextDispatchOnDay` to `Math.max(route.nextDispatchOnDay, game.day)`.
- [ ] Remove by filtering only `recurringRoutes`; never scan or rewrite orders.

### Step 6: Implement need, ordering, and attempts

- [ ] Calculate destination need from `getCityInventoryStats(game, destination).capacity`, current used units, and all in-transit destination reservations.
- [ ] Sort due active routes with:

```ts
left.priority - right.priority || compareNumericRouteIds(left.id, right.id)
```

- [ ] For each route, re-read destination need and origin stock from the latest accumulated game state.
- [ ] Set:

```ts
const dispatchedQuantity = Math.min(destinationNeed, route.capacity, availableOriginStock);
```

- [ ] For positive quantities, call the shared dispatch primitive with `requestedQuantity: destinationNeed`, route lead time, route per-unit cost, and no affordability rejection.
- [ ] Record exact factual attempt evidence before advancing the route schedule.
- [ ] Advance only the attempted route to `closingDay + frequencyDays`.
- [ ] Sum scheduled cost from created orders; assert it equals the attempt cost sum in tests.

### Step 7: Verify and commit

- [ ] Run:

```bash
bun run test:unit -- --run src/lib/game/interCityLogistics.spec.ts --maxWorkers=1
bun run check
```

- [ ] Commit:

```bash
git add src/lib/game/interCityLogistics.ts src/lib/game/interCityLogistics.spec.ts
git commit -m "feat(logistics): add recurring route scheduler"
```

Checkpoint: route lifecycle and scheduling are deterministic automation over the same transfer-order dispatch path.

---

## Task 4: Integrate logistics into daily simulation and reports

**Files:**

- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveCodec.spec.ts`
- Modify any report fixture that directly constructs `DailyReport`, found with:

```bash
rg -l "DailyReport|productionReport:" src --glob "*.spec.ts" --glob "*.testUtils.ts"
```

**Consumes:**

- `processTransferArrivals` and `processRecurringRouteDispatches` from Tasks 2–3.

**Produces:**

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

### Step 1: Write simulation-order tests

- [ ] Add a due-arrival test where delivered input is consumed by same-day industry production, proving arrival runs before production.
- [ ] Add a same-day-local-priority test where production/replenishment consumes origin inventory before a due recurring route, proving scheduled export runs after local operations.
- [ ] Add a no-logistics day test with an empty logistics report.
- [ ] Add a route-cost reconciliation test asserting:

```ts
report.logistics.scheduledTransportCost === sum(attempt.transportCost)
report.operatingCosts === priorOperatingCosts + scheduledTransportCost
report.operatingCashFlow === priorOperatingCashFlow - scheduledTransportCost
report.netCashChange === report.operatingCashFlow + report.financingCashFlow
report.cashAfter === report.cashBefore + report.netCashChange
```

- [ ] Add an arrival-overflow test proving the existing production-close overflow summary/cost is the only charge path.

### Step 2: Write persistence tests for report evidence

- [ ] Round-trip one report containing one arrival, one successful route attempt, and one zero-quantity attempt.
- [ ] Reject malformed current-schema report rows with invalid quantities, route IDs, transfer IDs, endpoints, materials, or inconsistent null order/cost combinations.
- [ ] Keep historical validation structural only: a report may reference a removed route or an order no longer present in a deliberately isolated report fixture without semantic replay.

### Step 3: Run tests and confirm failure

- [ ] Run:

```bash
bun run test:unit -- --run \
  src/lib/game/simulateDay.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  --maxWorkers=1
```

Expected: tests fail because `DailyReport.logistics` and simulation hooks do not exist.

### Step 4: Integrate arrivals before production

- [ ] At the start of `simulateDay`, after ownership validation and before industry production, call:

```ts
const arrivalResult = processTransferArrivals(game, closingDay);
const arrivalGame = arrivalResult.game;
```

- [ ] Use `arrivalGame` for active event modifier lookup, production, sales, replenishment, and later transitions.
- [ ] Do not create a second arrival loop in `simulateDay`.

### Step 5: Integrate recurring dispatch after replenishment

- [ ] Calculate normal revenue, costs, import spend, and the pre-logistics operating cash flow as today.
- [ ] Build the post-local-operation state with stores, inventories, staff, hiring market, RNG, and cash equal to original cash plus pre-logistics operating cash flow.
- [ ] Call `processRecurringRouteDispatches(postLocalOperations, closingDay)`.
- [ ] Define final accounting:

```ts
const operatingCosts = baseOperatingCosts + routeResult.scheduledTransportCost;
const operatingCashFlow = preLogisticsOperatingCashFlow - routeResult.scheduledTransportCost;
```

- [ ] Assert the scheduler-returned cash equals `game.cash + operatingCashFlow` before finance service.
- [ ] Service finance from the scheduler-returned state so route costs participate in final cash and finance reconciliation.

### Step 6: Build and persist daily logistics evidence

- [ ] Add:

```ts
logistics: {
  arrivals: arrivalResult.arrivals,
  routeDispatchAttempts: routeResult.attempts,
  deliveredUnits: arrivalResult.deliveredUnits,
  scheduledTransportCost: routeResult.scheduledTransportCost
}
```

- [ ] Update empty/current report fixtures with the same four fields.
- [ ] Extend historical report decoding with structural validation only.
- [ ] Do not add manual command costs to a later daily report; aggregate manual and scheduled cost remains derivable from transfer orders.

### Step 7: Verify and commit

- [ ] Run:

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

- [ ] Commit:

```bash
git add src/lib/game/types.ts src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts src/lib/persistence/saveCodec.ts src/lib/persistence/saveCodec.spec.ts src
git commit -m "feat(logistics): integrate daily transfers and routes"
```

Checkpoint: arrival timing, local-operation priority, scheduled route cost, daily reports, inventory, and cash reconcile through the real simulation order.

---

## Task 5: Add derived logistics read models and actionable alerts

**Files:**

- Create: `src/lib/game/logisticsReadModels.ts`
- Create: `src/lib/game/logisticsReadModels.spec.ts`
- Modify: `src/lib/game/alerts.ts`
- Modify: `src/lib/game/alerts.spec.ts`

**Consumes:**

- Authoritative orders/routes and immutable daily attempt evidence from Tasks 1–4.

**Produces:**

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

export interface LogisticsTotals {
  deliveredUnits: number;
  transportCost: number;
}

export function selectInTransitInventory(game: GameState): InTransitInventorySummary[];
export function selectRecentTransfers(game: GameState, limit?: number): TransferOrder[];
export function selectRouteOperations(game: GameState): RouteOperationalSummary[];
export function selectLogisticsTotals(game: GameState): LogisticsTotals;

export const ROUTE_CAPACITY_SHORTFALL_ATTEMPTS = 3;
```

### Step 1: Write read-model tests

- [ ] Test in-transit grouping by destination and material, exact order IDs, earliest arrival, and stable catalog/material/order ordering.
- [ ] Test recent transfers sort by dispatch day descending and numeric transfer ID descending; default limit is 20 and an explicit limit is respected.
- [ ] Test route summaries derive:
  - route-sourced in-transit units;
  - latest attempt across reports;
  - `utilization = dispatchedQuantity / capacity` when an attempt exists;
  - latest unused capacity and unmet demand;
  - all-time delivered units and all-time order cost.
- [ ] Test removed routes disappear from current route summaries but remain in recent transfer history and aggregate totals.
- [ ] Test aggregate totals count only delivered quantities but include transport cost from every dispatched order.

### Step 2: Write alert tests

- [ ] Extend `GameAlertKind` with `route-origin-stock` and `route-capacity-shortfall` and add optional `routeId` to `GameAlert`.
- [ ] Test origin-stock alert when the latest attempt has positive need and:

```ts
availableOriginStock < Math.min(destinationNeed, capacity)
```

- [ ] Test no origin-stock alert when destination need is zero.
- [ ] Test capacity-shortfall alert only when the latest three attempts all satisfy:

```ts
destinationNeed > capacity && availableOriginStock >= capacity
```

- [ ] Test two attempts are insufficient and a stock-constrained attempt breaks the capacity-shortfall streak.
- [ ] Test alerts are emitted only for current routes and sorted by route priority then numeric route ID.
- [ ] Assert logistics alerts contain route/city identity but no management-panel, navigation, recommendation, or presentation payload.

### Step 3: Run tests and confirm failure

- [ ] Run:

```bash
bun run test:unit -- --run \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/alerts.spec.ts \
  --maxWorkers=1
```

Expected: FAIL because selectors and logistics alerts do not exist.

### Step 4: Implement selectors as pure derivations

- [ ] Never write derived values back into `game.logistics` or reports.
- [ ] Use numeric ID comparison rather than `localeCompare`.
- [ ] Scan reports from newest to oldest when resolving each route’s latest attempt; stop once every current route has an attempt.
- [ ] Return cloned/snapshot values where an existing selector convention requires immutability; do not introduce a memoization/cache layer.

### Step 5: Integrate alerts

- [ ] Implement a focused `collectLogisticsAlerts(game)` helper in `logisticsReadModels.ts` or `alerts.ts` and call it once from `collectGameAlerts`.
- [ ] Reuse route operational/report evidence instead of recalculating dispatches.
- [ ] Do not persist alert state or shortfall counters.

### Step 6: Verify and commit

- [ ] Run:

```bash
bun run test:unit -- --run \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/alerts.spec.ts \
  --maxWorkers=1
bun run check
```

- [ ] Commit:

```bash
git add src/lib/game/logisticsReadModels.ts src/lib/game/logisticsReadModels.spec.ts src/lib/game/alerts.ts src/lib/game/alerts.spec.ts
git commit -m "feat(logistics): derive route operations and alerts"
```

Checkpoint: HPA-574, HPA-296, and HPA-297 can consume focused normal-operation truth without another ledger, cache, scheduler, or planner rule.

---

## Task 6: Add one headless multi-day lifecycle test

**Files:**

- Create: `src/lib/game/interCityLogistics.integration.spec.ts`
- Modify test fixture only if necessary: `src/lib/game/cityInventory.testUtils.ts`

**Consumes:**

- Public domain commands, `simulateDay`, read models, and persistence contracts from Tasks 1–5.

### Step 1: Build one realistic two-industry-city fixture

- [ ] Start from `createNewGame`.
- [ ] Reveal and open `breadbasket-basin` through the real world transition.
- [ ] Add warehouse capacity to both industry cities using valid `IndustrialBuilding` fixtures.
- [ ] Seed origin inventory and enough cash.
- [ ] Keep retail stores and normal production deterministic; disable unrelated stock changes only through fixture inputs, not production feature flags.

### Step 2: Exercise manual transfer through real days

- [ ] Dispatch a manual transfer through `dispatchManualTransfer`.
- [ ] Assert command-time origin and cash changes.
- [ ] Simulate until the quoted arrival day.
- [ ] Assert it remains unavailable before arrival and appears at destination on the exact day.
- [ ] Assert the order is delivered and immutable afterward.

### Step 3: Exercise a recurring route through real days

- [ ] Create a route due immediately with a short cadence and lead time.
- [ ] Simulate multiple days until at least two dispatch attempts and one scheduled arrival occur.
- [ ] Assert:
  - route cadence advances from actual attempt days;
  - route orders use the same ID sequence and lifecycle as manual orders;
  - origin stock, in-transit reservations, destination stock, delivered units, and costs reconcile;
  - daily report attempt cost equals the scheduled cash-flow reduction;
  - read models match authoritative orders and reports.

### Step 4: Prove future-only route mutation

- [ ] While a route order is in transit, edit the route’s capacity, frequency, lead time, and cost.
- [ ] Assert the in-transit order retains original quantity, arrival day, and total cost.
- [ ] Assert the next dispatch uses edited values.
- [ ] Remove the route while another order is in transit and assert that order still arrives normally.

### Step 5: Run and commit

- [ ] Run:

```bash
bun run test:unit -- --run \
  src/lib/game/interCityLogistics.integration.spec.ts \
  src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  --maxWorkers=1
```

- [ ] Commit:

```bash
git add src/lib/game/interCityLogistics.integration.spec.ts src/lib/game/cityInventory.testUtils.ts
git commit -m "test(logistics): cover multi-day transfer lifecycle"
```

Checkpoint: one headless test proves the complete manual-plus-recurring lifecycle through the actual daily simulation.

---

## Task 7: Audit scope and run full verification

### Step 1: Audit authoritative state and forbidden abstractions

- [ ] Run:

```bash
rg -n "inTransitLedger|transferHistoryStore|routeMetricsCache|cachedRoute|pendingTransfer|rejectedOrder" src
rg -n "reliab|shipmentFailure|failed-shipment|recall|rerout|customs|vehicle|pathfind|route-policy|generic scheduler|workflow queue" src/lib/game src/lib/persistence
rg -n "migrateV|MIGRATABLE_SCHEMA_VERSIONS|LegacyV14|schema 14.*15" src
```

Expected production matches: none, except ordinary prose in tests that explicitly asserts forbidden concepts are absent. Do not add suppression lists; delete the accidental abstraction or compatibility path.

### Step 2: Audit dispatch and accounting uniqueness

- [ ] Run:

```bash
rg -n "nextTransferSequence|transferOrders:\s*\[|removeCityInventoryMaterial\(" src/lib/game
rg -n "scheduledTransportCost|processRecurringRouteDispatches|processTransferArrivals" src/lib/game
```

- [ ] Confirm:
  - one production function creates/increments transfer orders;
  - one arrival function adds delivered material;
  - one scheduler calls the shared dispatch path;
  - no read model mutates game state;
  - no second overflow charge exists.

### Step 3: Audit UI and scenario boundaries

- [ ] Run:

```bash
git diff --name-only main...HEAD
```

- [ ] Confirm there are no behavioral changes under `src/lib/components`, Phaser map modules, `gameRouteController.ts`, or localization files.
- [ ] Permit only strict-schema fixture updates in an existing route/E2E/scenario file when required by schema 15.
- [ ] Confirm no scenario logistics authoring type, parser, or DSL was added.

### Step 4: Run static checks and all focused tests

- [ ] Run:

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

### Step 5: Run the complete suite

- [ ] Run:

```bash
bun run test:unit -- --run --maxWorkers=1
bun run test:e2e -- --workers=1
git diff --check main...HEAD
```

### Step 6: Review acceptance coverage

- [ ] Map each HPA-294 acceptance criterion to at least one named test.
- [ ] Confirm manual rejection tests prove no persistence or sequence mutation.
- [ ] Confirm the integration test covers real daily arrival and recurring scheduling.
- [ ] Confirm route removal/edit tests prove dispatched-order immutability.
- [ ] Confirm save tests prove schema-15 round-trip and schema-14 rejection.
- [ ] Confirm read-model tests cover transit, history, utilization, unused capacity, unmet demand, delivered units, cost, and alerts.

### Step 7: Commit final verification adjustments

- [ ] Commit only if audit/test fixture changes were needed:

```bash
git add src
git commit -m "test(logistics): verify deterministic route core"
```

## Completion criteria

- All seven checkpoints land in one implementation PR.
- Manual and recurring movement share one dispatch/order lifecycle.
- Inventory and cash reconcile across origin, transit, destination, overflow, and transport cost.
- Transfer orders and routes are the only mutable logistics domain collections.
- Current schema 15 validates strictly and schema 14 is unsupported.
- Read models and normal-operation alerts are derived and UI-agnostic.
- Focused, full unit, E2E, static, lint, and diff checks pass.
- The implementation contains no migration, repair path, duplicate ledger, cached metrics, reliability model, generic scheduling abstraction, planner behavior, or UI feature.
