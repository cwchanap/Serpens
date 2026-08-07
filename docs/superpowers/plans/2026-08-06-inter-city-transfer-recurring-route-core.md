# Inter-City Transfer and Recurring-Route Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one deterministic industry-to-industry logistics core for manual transfers and recurring routes with strict persistence, explicit daily timing, single-owner cash accounting, and pure operational read models.

**Architecture:** Add one authoritative `LogisticsState` to `GameState`. Keep stock removal, transfer creation, and sequence allocation behind one shared internal path; apply manual cost in the manual command and scheduled cost exactly once in `simulateDay`; derive transit, history, and pure operational metrics without duplicate ledgers, counters, or caches.

**Tech Stack:** TypeScript 6, SvelteKit game core, Vitest, strict current-schema save codec, existing city-inventory and daily-simulation modules.

## Global constraints

- HPA-294 covers industry-city inventory to industry-city inventory only.
- Weekly retail replenishment remains the existing immediate inventory-debit/import flow.
- Transfer orders are the only transit/history record and remain unbounded in this first slice.
- Do not add lifetime counters, a retention window, or transparent compaction.
- Manual transfers reject partial stock and insufficient cash.
- Scheduled quantity is exactly `min(destination need, route capacity, origin stock)`; cash is not a fourth cap.
- Arrivals run before production; scheduled exports run after production and retail replenishment.
- Destination need is free destination warehouse capacity minus all inbound reservations.
- Existing production-close overflow semantics remain the only overflow charge path.
- Scheduled route helpers do not mutate cash; `simulateDay` applies scheduled cost exactly once.
- Persist dispatch-attempt facts and expose pure non-alert read models only; HPA-574 owns alert heuristics, copy, localization, navigation, and presentation.
- Save schema 15 only; no schema-14 migration or stale-reference repair.
- No Svelte/Phaser behavior, route-controller integration, localization, planner rules, generic scheduler, queue, reliability model, route-policy DSL, or cached route metrics.

## Risks and controls

1. **Scheduled cash double-charge:** the scheduler returns cost evidence without changing cash; `simulateDay` is the only scheduled-cost writer and asserts cash/report reconciliation.
2. **Schema-15 fixture blast radius:** use `rg` to enumerate current-schema fixtures and run all persistence/scenario repository suites before broader tests.
3. **Arrival-before-production semantics:** retain named tests proving same-day consumption and production-close overflow behavior.

---

## Task 1: Authoritative logistics state and schema-15 validation

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

- [ ] Add failing tests that a new game initializes empty logistics collections and both sequences at `1`.
- [ ] Add one save round-trip fixture containing a delivered manual order, an in-transit route order, and a paused route.
- [ ] Add rejection tests for missing state, duplicate/malformed IDs, counters not beyond existing IDs, invalid endpoints/materials/numbers/days/status, and active routes scheduled before `game.day`.
- [ ] Prove a route-sourced order may reference a removed route.
- [ ] Prove schema 14 is rejected rather than migrated.
- [ ] Add `GameState.logistics` and initialize:

```ts
logistics: {
  transferOrders: [],
  recurringRoutes: [],
  nextTransferSequence: 1,
  nextRouteSequence: 1
}
```

- [ ] Set `SAVE_SCHEMA_VERSION = 15` and add `invariant-logistics` to `SaveDataErrorCode`.
- [ ] Implement `validateCurrentLogisticsState(game)`:
  - sequences are positive safe integers;
  - IDs are unique canonical `transfer-N` / `route-N` values below their next sequence;
  - endpoints are distinct opened, materialized industry cities with inventories;
  - materials are catalog IDs;
  - order quantity, route capacity, frequency, lead time, and per-unit cost are positive safe integers;
  - route priority and total order cost are nonnegative safe integers;
  - `createdOnDay <= dispatchedOnDay < arrivalOnDay`;
  - in-transit arrival is `>= game.day`; delivered arrival is `< game.day`;
  - active route schedule is `>= game.day`; paused routes may retain an overdue day.
- [ ] Use one save-codec validation helper that parses a canonical numeric suffix only to prove the next generated sequence cannot collide with an existing ID. Do not normalize collections with it; every runtime ID tie-break uses `left.id < right.id ? -1 : left.id > right.id ? 1 : 0`.
- [ ] Update current-schema fixtures to schema 15 with empty logistics state unless the test exercises logistics.
- [ ] Do not add scenario logistics authoring fields. Schema-only fixture edits in existing scenario/E2E files are acceptable.

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

## Task 2: Typed manual quote, shared transfer creation, and arrival lifecycle

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

export type InterCityTransferQuoteResult =
  | { ok: true; quote: InterCityTransferQuote }
  | { ok: false; reason: ManualTransferFailure };

export type ManualTransferResult =
  | { ok: true; game: GameState; order: TransferOrder }
  | { ok: false; reason: ManualTransferFailure };

export function quoteInterCityTransfer(
  game: GameState,
  input: ManualTransferInput
): InterCityTransferQuoteResult;

export function dispatchManualTransfer(
  game: GameState,
  input: ManualTransferInput
): ManualTransferResult;

export function processTransferArrivals(
  game: GameState,
  day: number
): { game: GameState; arrivals: DailyTransferArrival[]; deliveredUnits: number };
```

- [ ] Write quote tests using complete manual inputs for two opened industry cities; assert typed failures for every manual-transfer failure reason and dispatch's reuse of the same validation path.
- [ ] Calculate one distance band:

```ts
const distance = Math.hypot(destination.worldX - origin.worldX, destination.worldY - origin.worldY);
const band = Math.max(1, Math.ceil(distance / INTER_CITY_DISTANCE_PER_BAND));
```

`leadTimeDays` and `transportCostPerUnit` equal `band`; total cost is `band * quantity`.

- [ ] Pin the current industry-city distance bands to `2`, `2`, and `3`.

- [ ] Test successful manual dispatch removes the full quantity, charges full cost once, appends `transfer-1`, sets arrival to `game.day + leadTimeDays`, and advances only `nextTransferSequence`.
- [ ] Parameterize invalid endpoint/material/quantity, insufficient stock, and insufficient cash; assert the entire input game remains equal to a pre-command clone.
- [ ] Implement one private `createDispatchedTransfer(...)` as the only production path that:
  - removes origin stock;
  - creates/appends the order;
  - increments `nextTransferSequence`;
  - returns the concrete order and cost;
  - does **not** mutate cash.
- [ ] In `dispatchManualTransfer`, check affordability before transfer creation and subtract the returned cost exactly once from the successful game.
- [ ] Use safe-integer multiplication and validate before mutation.
- [ ] Write arrival tests for not-yet-due orders, raw transfer-ID ordering, exact destination addition, immutable order fields, and aggregated delivered units.
- [ ] Implement arrivals with `addCityInventoryMaterial`; change only `status` to delivered.
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

## Task 3: Recurring-route commands, cadence, raw-ID contention, and zero-attempt evidence

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

export type RecurringRouteUpdateInput = Omit<RecurringRouteInput, 'priority'>;

export function createRecurringRoute(game: GameState, input: RecurringRouteInput): RecurringRouteResult;
export function updateRecurringRoute(game: GameState, routeId: string, input: RecurringRouteUpdateInput): RecurringRouteResult;
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

- [ ] Test create validation, deterministic `route-1` allocation, active state, immediate schedule, and no sequence consumption on failure.
- [ ] Test normal update accepts `RecurringRouteUpdateInput`, changes endpoints/material/capacity/frequency/lead time/cost, and preserves ID, state, priority, schedule, and existing orders.
- [ ] Make pause/resume idempotent. Pause preserves schedule; resume uses `Math.max(route.nextDispatchOnDay, game.day)`.
- [ ] Test reprioritization changes only priority.
- [ ] Test removal deletes only the route and never rewrites route-sourced orders.
- [ ] Implement destination need as free destination capacity minus every in-transit reservation to that destination, regardless of material.
- [ ] Test delivered orders and other destinations do not reserve capacity.
- [ ] Sort due active routes by lower priority then the raw ID comparator `left.id < right.id ? -1 : left.id > right.id ? 1 : 0`; prove `route-10` precedes `route-2` without numeric suffix parsing or `localeCompare`.
- [ ] Re-read origin stock and destination need from accumulated state before each attempt.
- [ ] Dispatch exactly:

```ts
Math.min(destinationNeed, route.capacity, availableOriginStock)
```

- [ ] Positive attempts call Task 2’s `createDispatchedTransfer` with `quantity: dispatchedQuantity`; `destinationNeed` stays on the attempt evidence rather than the order.
- [ ] `processRecurringRouteDispatches` must not mutate cash. It sums cost from created orders and returns `scheduledTransportCost`.
- [ ] Zero attempts append evidence, advance cadence, create no order, consume no sequence, and return zero cost. When `destinationNeed === 0`, record `unmetDestinationNeed === 0` and let consumers distinguish the full/no-need case from the raw fields.
- [ ] Advance every attempted route once to `closingDay + frequencyDays`; do not replay missed intervals.
- [ ] Test competing routes, raw-ID ties, paused/future routes, destination reservations, origin constraint, and that identical input cash is returned unchanged by the scheduler.

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

## Task 4: Daily simulation, existing-formula cash integration, reports, and overflow reconciliation

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

`DailyReport` gains `logistics: DailyLogisticsReport`.

- [ ] Add a test proving a due arrival is available to same-day production.
- [ ] Add a test proving production/replenishment receives origin stock before a due route exports it.
- [ ] Add an empty-logistics-day report test.
- [ ] Test `unmetDestinationNeed = destinationNeed === 0 ? 0 : destinationNeed - dispatchedQuantity`; assert that a full destination reports both fields as zero and consumers use the explicit full/no-need case rather than treating raw zeros as unmet demand.
- [ ] Add explicit single-owner cash assertions:

```ts
report.logistics.scheduledTransportCost === sumAttemptCosts
report.operatingCosts === baseOperatingCosts + sumAttemptCosts
report.operatingCashFlow === baseOperatingCashFlow - sumAttemptCosts
preFinanceCash === startingCash + report.operatingCashFlow
report.cashAfter === report.cashBefore + report.netCashChange
```

- [ ] Add an audit assertion/test that no production path outside `dispatchManualTransfer` and `simulateDay` evaluates `cash - transportCost`.
- [ ] Add an arrival-overflow test proving production-close overflow remains the only charge.
- [ ] At the start of `simulateDay`, after ownership validation, call `processTransferArrivals(game, closingDay)` and use its game for later phases.
- [ ] Keep production, sales, and replenishment behavior unchanged.
- [ ] Calculate `baseOperatingCosts` and `baseOperatingCashFlow` from local operations without scheduled transport.
- [ ] Run `processRecurringRouteDispatches` after replenishment. Confirm its returned cash equals its input cash.
- [ ] Calculate exactly once:

```ts
const operatingCosts = baseOperatingCosts + routeResult.scheduledTransportCost;
const operatingCashFlow = baseOperatingCashFlow - routeResult.scheduledTransportCost;
const preFinanceGame = {
  ...routeResult.game,
  cash: game.cash + operatingCashFlow
};
```

- [ ] Service finance from `preFinanceGame`; do not subtract scheduled cost anywhere else.
- [ ] Populate `DailyReport.logistics` from arrival and route results.
- [ ] Do not insert command-time manual transfer costs into a later daily report.
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

## Task 5: Pure logistics read models using attempt-capacity utilization

**Files**

- Create: `src/lib/game/logisticsReadModels.ts`
- Create: `src/lib/game/logisticsReadModels.spec.ts`

Do not modify presentation, localization, or other HPA-574-owned behavior in this task.

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
  unmetDestinationNeed: number;
  deliveredUnits: number;
  transportCost: number;
}

export function selectInTransitInventory(game: GameState): InTransitInventorySummary[];
export function selectRecentTransfers(game: GameState, limit?: number): TransferOrder[];
export function selectRouteOperations(game: GameState): RouteOperationalSummary[];
export function selectLogisticsTotals(game: GameState): { deliveredUnits: number; transportCost: number };
```

- [ ] Test transit grouping by destination/material, order IDs, earliest arrival, and stable catalog/material/raw-ID sorting.
- [ ] Test recent history sorts by dispatch day then raw transfer ID descending, default limit 20.
- [ ] Test route summaries derive route-sourced in-transit units, latest attempt, attempt-capacity utilization (`dispatchedQuantity / capacity`), unused capacity, unmet destination need, delivered units, and total order cost.
- [ ] Test that a full destination's `destinationNeed === 0` and `unmetDestinationNeed === 0` remain distinct from an unmet-demand interpretation.
- [ ] Test removed routes disappear from current summaries but remain in order history and exact aggregate totals.
- [ ] Count delivered units only from delivered orders; count cost from every dispatched order.
- [ ] Keep transfer orders unbounded. Add no `TRANSFER_ORDER_LIMIT`, aggregate lifetime counters, or pruning logic.
- [ ] Document in a test name that totals are exact over the authoritative full order collection.
- [ ] Sort current routes by priority then the raw ID comparator `left.id < right.id ? -1 : left.id > right.id ? 1 : 0`.
- [ ] Keep selectors pure, uncached, and non-alert. Do not add HPA-574-owned classification or presentation behavior.

**Verify**

```bash
bun run test:unit -- --run src/lib/game/logisticsReadModels.spec.ts --maxWorkers=1
bun run check
```

**Commit**

```bash
git add src/lib/game/logisticsReadModels.ts src/lib/game/logisticsReadModels.spec.ts
git commit -m "feat(logistics): add logistics read models"
```

---

## Task 6: One headless multi-day lifecycle test, scope audits, full verification, and acceptance-criterion-to-test mapping

**Files**

- Create: `src/lib/game/interCityLogistics.integration.spec.ts`
- Modify fixture only if needed: `src/lib/game/cityInventory.testUtils.ts`

- [ ] Start from `createNewGame`, reveal/open `breadbasket-basin` through the real transition, add valid warehouse fixtures to both industry cities, and seed origin inventory/cash.
- [ ] Keep retail replenishment unchanged; the test does not route material directly to retail-city inventory.
- [ ] Dispatch a manual transfer through the public command.
- [ ] Simulate until the quoted day; prove it is unavailable before arrival and available on the exact day.
- [ ] Create a due recurring route and simulate until at least two attempts and one scheduled arrival occur.
- [ ] Reconcile cadence, origin stock, inbound reservations, destination stock, delivered units, IDs, report costs, and cash.
- [ ] Explicitly assert scheduled cost changed cash exactly once.
- [ ] Edit capacity/frequency/lead time/cost while an order is in transit; prove the order keeps original quantity/day/cost and the next dispatch uses edited settings.
- [ ] Remove the route with an order in transit; prove the order still arrives and history remains visible.

### Scope audits

- [ ] Audit forbidden duplicate state, retention, and abstractions:

```bash
rg -n "inTransitLedger|transferHistoryStore|routeMetricsCache|cachedRoute|pendingTransfer|rejectedOrder" src
rg -n "TRANSFER_ORDER_LIMIT|deliveredUnitsTotal|transportCostTotal|prune.*Transfer" src
rg -n "reliab|shipmentFailure|failed-shipment|recall|rerout|customs|vehicle|pathfind|route-policy|workflow queue" src/lib/game src/lib/persistence
rg -n "migrateV|MIGRATABLE_SCHEMA_VERSIONS|LegacyV14" src
```

Expected production matches: none.

- [ ] Audit one transfer path, the two deliberate cash owners, and the raw-ID runtime ordering boundary:

```bash
rg -n "nextTransferSequence|transferOrders:\s*\[|removeCityInventoryMaterial\(" src/lib/game
rg -n "transportCost|scheduledTransportCost|processRecurringRouteDispatches|processTransferArrivals" src/lib/game
rg -n "localeCompare|parseInt|parseFloat" src/lib/game
```

Confirm:

- one production transfer-creation path;
- manual wrapper applies manual cost once;
- `simulateDay` applies scheduled cost once through its existing operating-cost/cash-flow formula;
- scheduler does not mutate cash;
- one arrival path;
- no second overflow charge;
- engine comparators use only `left.id < right.id ? -1 : left.id > right.id ? 1 : 0`, while a single save-codec validation helper alone may parse an ID suffix to prevent sequence collision.

- [ ] Inspect changed files:

```bash
git diff --name-only main...HEAD
```

No behavioral changes belong under components, Phaser/map modules, route controller, localization, or retail replenishment. Permit only schema-fixture edits where schema 15 requires them.

### Full verification and acceptance mapping

- [ ] Run focused checks:

```bash
bun run check
bun run lint
bun run test:unit -- --run \
  src/lib/game/interCityLogistics.integration.spec.ts \
  src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  --maxWorkers=1
```

- [ ] Run the full suite:

```bash
bun run test:unit -- --run --maxWorkers=1
bun run test:e2e -- --workers=1
git diff --check main...HEAD
```

- [ ] Map every HPA-294 acceptance criterion to a named test, especially typed quote/dispatch atomicity, single-owner scheduled cash, daily timing, raw-ID contention, full/no-need attempt facts, route future-only edits/removal, schema-15 round-trip, unbounded authoritative history, and each requested non-alert read model.

**Commit**

```bash
git add src/lib/game/interCityLogistics.integration.spec.ts src/lib/game/cityInventory.testUtils.ts
git commit -m "test(logistics): cover multi-day transfer lifecycle"
```

## Completion criteria

- Six green checkpoints in one implementation PR.
- Manual and recurring movement share one transfer-creation lifecycle.
- Manual cost and scheduled cost each have one explicit writer.
- Inventory and cash reconcile across origin, transit, destination, overflow, and transport cost.
- Orders/routes are the only mutable logistics collections; orders remain unbounded.
- Schema 15 round-trips; schema 14 is unsupported.
- Read models are pure, exact, uncached, non-alert, and UI-agnostic.
- Retail replenishment behavior remains unchanged.
- No migration, repair path, duplicate ledger, aggregate counter, retention window, cached metric, reliability model, generic scheduler, planner behavior, or UI feature is introduced.
