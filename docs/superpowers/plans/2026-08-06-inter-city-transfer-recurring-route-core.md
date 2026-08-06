# Inter-City Transfer and Recurring-Route Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one deterministic industry-to-industry logistics core for manual transfers and recurring routes with strict persistence, explicit daily timing, one scheduled-cash writer, and pure operational read models.

**Architecture:** Add one authoritative `LogisticsState` to `GameState`. Keep stock removal, transfer creation, and sequence allocation behind one cash-free internal path; apply manual cost in the manual command and scheduled cost as one addend in the existing `simulateDay` formula; derive transit, history, utilization, destination shortfall, and totals without duplicate ledgers or caches.

**Tech Stack:** TypeScript 6, SvelteKit game core, Vitest, strict current-schema save codec, existing city-inventory and daily-simulation modules.

## Global constraints

- HPA-294 covers industry-city inventory to industry-city inventory only.
- Weekly retail replenishment remains the existing immediate inventory-debit/import flow.
- Transfer orders store one shipped quantity and remain the only transit/history record.
- Transfer orders remain unbounded in this first slice; add no lifetime counters or retention window.
- Manual transfers reject partial stock and insufficient cash.
- Scheduled quantity is exactly `min(destination need, route capacity, origin stock)`; cash is not a fourth cap.
- Arrivals run before production; scheduled exports run after production and retail replenishment.
- Destination need is free destination warehouse capacity minus all inbound reservations.
- Existing production-close overflow semantics remain the only overflow charge path.
- Scheduled route helpers do not mutate cash; `simulateDay` applies scheduled cost once through its existing formula.
- Use plain string ID comparison for deterministic runtime ordering; never use `localeCompare` or numeric suffix parsing in comparators.
- Persist raw attempt evidence but defer logistics alert heuristics to HPA-574.
- Save schema 15 only; no schema-14 migration or stale-reference repair.
- No Svelte/Phaser behavior, route-controller integration, localization, planner rules, generic scheduler, queue, reliability model, route-policy DSL, or cached route metrics.

The repository pre-commit hook runs `lint-staged` for changed files. Keep focused tests and `bun run check` at each checkpoint; run the full `bun run lint` in Task 6 rather than repeating a full-repository lint after every small task.

## Risks and controls

1. **Scheduled cash double-charge:** the scheduler never changes cash; route cost is one addend in the existing `operatingCosts` calculation.
2. **Schema-15 fixture blast radius:** enumerate current-schema fixtures with `rg` and run persistence/scenario repository suites in Task 1.
3. **Arrival-before-production semantics:** retain named tests proving same-day consumption and production-close overflow behavior.
4. **Historical utilization drift after route edit:** calculate utilization from `latestAttempt.capacity`, never the current route capacity.

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
- [ ] Add rejection tests for missing state, duplicate IDs, stale sequence counters, invalid source/endpoints/material/quantity/days/costs/route numbers/state, and active routes scheduled before `game.day`.
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
  - IDs are unique generated `transfer-N` / `route-N` values;
  - one codec-local suffix parser verifies next sequences exceed all existing generated IDs;
  - endpoints are distinct opened, materialized industry cities with inventories;
  - materials are catalog IDs;
  - order quantity, route capacity/frequency/lead time/per-unit cost are positive safe integers;
  - route priority and total order cost are nonnegative safe integers;
  - `createdOnDay === dispatchedOnDay < arrivalOnDay`;
  - in-transit arrival is `>= game.day`; delivered arrival is `< game.day`;
  - active route schedule is `>= game.day`; paused routes may retain an overdue day.
- [ ] Normalize harmless collection order with plain string ID comparison. Do not expose or reuse the suffix parser for runtime ordering.
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

## Task 2: Implement typed quote, shared transfer creation, and arrivals

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

export function processTransferArrivals(
  game: GameState,
  day: number
): { game: GameState; arrivals: DailyTransferArrival[]; deliveredUnits: number };
```

- [ ] Write typed quote-failure tests for invalid origin, destination, same city, material, and quantity.
- [ ] Pin current distance bands:

```ts
expect(industryToBreadbasket.leadTimeDays).toBe(2);
expect(breadbasketToQuarry.leadTimeDays).toBe(2);
expect(industryToQuarry.leadTimeDays).toBe(3);
```

- [ ] Make `dispatchManualTransfer` call `quoteInterCityTransfer`; do not duplicate base validation.
- [ ] Test successful manual dispatch removes the full quantity, charges full cost once, appends `transfer-1`, sets the quoted arrival day, and advances only `nextTransferSequence`.
- [ ] Test insufficient stock/cash after a valid quote; assert the entire input game remains equal to a pre-command clone.
- [ ] Implement one private `createDispatchedTransfer(...)` as the only production path that:
  - removes origin stock;
  - creates/appends the order with one `quantity` field;
  - increments `nextTransferSequence`;
  - returns the order and cost;
  - does not mutate cash.
- [ ] Validate `Number.isSafeInteger(quantity * transportCostPerUnit)` before mutation with a small private logistics-specific check. Do not extract a generic arithmetic module or move HPA-554 inventory helpers.
- [ ] In `dispatchManualTransfer`, check affordability before transfer creation and subtract the returned cost exactly once from the successful game.
- [ ] Write arrival tests for not-yet-due orders, raw string ID ordering, exact destination addition, immutable order fields, and aggregated delivered units.
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
- [ ] Test update changes endpoints/material/capacity/frequency/lead time/cost while preserving ID, state, priority, schedule, and existing orders.
- [ ] Compile-time test or `satisfies` fixture must show `priority` is not accepted by `RecurringRouteUpdateInput`.
- [ ] Make pause/resume idempotent. Pause preserves schedule; resume uses `Math.max(route.nextDispatchOnDay, game.day)`.
- [ ] Test reprioritization changes only priority.
- [ ] Test removal deletes only the route and never rewrites route-sourced orders.
- [ ] Implement destination need as free destination capacity minus every in-transit reservation to that destination, regardless of material.
- [ ] Test delivered orders and other destinations do not reserve capacity.
- [ ] Sort due active routes by lower priority then plain string route ID. Never parse the suffix or use `localeCompare`.
- [ ] Re-read origin stock and destination need from accumulated state before each attempt.
- [ ] Dispatch exactly:

```ts
Math.min(destinationNeed, route.capacity, availableOriginStock)
```

- [ ] Positive attempts call Task 2’s `createDispatchedTransfer`.
- [ ] `processRecurringRouteDispatches` must not mutate cash. It sums cost from created orders and returns `scheduledTransportCost`.
- [ ] Zero attempts append evidence, advance cadence, create no order, consume no sequence, and return zero cost.
- [ ] Attempt evidence stores `destinationNeed`, attempt `capacity`, `availableOriginStock`, `dispatchedQuantity`, `unusedCapacity`, and `unmetDestinationNeed`.
- [ ] Define `unmetDestinationNeed = destinationNeed - dispatchedQuantity`. A full destination has zero need and therefore zero unmet destination need; its unused capacity remains visible separately.
- [ ] Advance every attempted route once to `closingDay + frequencyDays`; do not replay missed intervals.
- [ ] Test competing routes, raw ID ties, paused/future routes, destination reservations, origin constraint, and unchanged scheduler cash.

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
- [ ] After replenishment, create the scheduler input by combining `productionGame` with `replenishmentResult.stores` and `replenishmentResult.cityInventories`.
- [ ] Call `processRecurringRouteDispatches` once; use `routeResult.game` as the spread base for `afterOperations`.
- [ ] Add `routeResult.scheduledTransportCost` as one addend in the existing `operatingCosts` sum.
- [ ] Keep the existing `operatingCashFlow = revenue - operatingCosts - importSpend` and `cash: game.cash + operatingCashFlow` paths; do not add base/final cash-flow variables or another scheduled-cost subtraction.
- [ ] Assert:

```ts
report.logistics.scheduledTransportCost === sumAttemptCosts
report.operatingCosts === existingCostAddends + sumAttemptCosts
report.cashAfter === report.cashBefore + report.netCashChange
```

- [ ] Add an arrival-overflow test proving production-close overflow remains the only charge.
- [ ] Populate `DailyReport.logistics` from arrival and route results.
- [ ] Do not put command-time manual costs into a later report; order selectors expose them.
- [ ] Extend report decoding structurally. Historical rows may reference removed or edited routes; do not replay them against current state.
- [ ] Round-trip one successful attempt, one zero attempt, and one arrival; reject malformed facts and inconsistent null-order/cost pairs.

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

## Task 5: Add derived logistics read models

**Files**

- Create: `src/lib/game/logisticsReadModels.ts`
- Create: `src/lib/game/logisticsReadModels.spec.ts`

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

- [ ] Test transit grouping by destination/material, order IDs, earliest arrival, and stable catalog/material/raw-ID ordering.
- [ ] Test recent history sorts by dispatch day then raw transfer ID descending, with default limit 20.
- [ ] Test route summaries derive route-sourced in-transit units, latest attempt, unused capacity, unmet destination need, delivered units, and total transport cost.
- [ ] Calculate historical utilization from attempt evidence only:

```ts
latestAttempt === null
  ? null
  : latestAttempt.dispatchedQuantity / latestAttempt.capacity
```

- [ ] Add a route-edit regression test proving current route capacity does not reinterpret the prior attempt’s utilization.
- [ ] Test removed routes disappear from current route summaries but remain in transfer history/totals.
- [ ] Count delivered units only from delivered orders; count cost from every dispatched order.
- [ ] Keep selectors pure, uncached, and free of alert thresholds or presentation copy.
- [ ] Do not modify `alerts.ts`, `collectGameAlerts`, localization, or components in HPA-294.

**Verify**

```bash
bun run test:unit -- --run src/lib/game/logisticsReadModels.spec.ts --maxWorkers=1
bun run check
```

**Commit**

```bash
git add src/lib/game/logisticsReadModels.ts src/lib/game/logisticsReadModels.spec.ts
git commit -m "feat(logistics): derive route operations"
```

---

## Task 6: Add the multi-day lifecycle test and run final verification

**Files**

- Create: `src/lib/game/interCityLogistics.integration.spec.ts`
- Modify fixture only if needed: `src/lib/game/cityInventory.testUtils.ts`

- [ ] Start from `createNewGame`, reveal/open `breadbasket-basin` through the real world transition, add valid warehouses to both industry cities, and seed origin inventory/cash.
- [ ] Dispatch a manual transfer through the public command.
- [ ] Simulate until the quoted day; prove it is unavailable before arrival and available on the exact day.
- [ ] Create a due recurring route and simulate until at least two attempts and one scheduled arrival occur.
- [ ] Reconcile route cadence, origin stock, inbound reservations, destination stock, delivered units, transfer IDs, report costs, and cash.
- [ ] Edit capacity/frequency/lead time/cost while an order is in transit; prove the existing order keeps original quantity/day/cost and the next dispatch uses edited settings.
- [ ] Reprioritize separately and prove contention changes only through that command.
- [ ] Remove the route with an order in transit; prove the order still arrives and history remains visible.

**Focused verification**

```bash
bun run test:unit -- --run \
  src/lib/game/interCityLogistics.integration.spec.ts \
  src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/simulateDay.spec.ts \
  src/lib/persistence/saveCodec.spec.ts \
  --maxWorkers=1
bun run check
bun run lint
```

**Scope audits**

```bash
rg -n "requestedQuantity|routeMetricsCache|inTransitLedger|transferHistoryStore|collectLogisticsAlerts|route-capacity-shortfall" src
rg -n "localeCompare|parse.*route|parse.*transfer" src/lib/game/interCityLogistics.ts src/lib/game/logisticsReadModels.ts
rg -n "migrateV|MIGRATABLE_SCHEMA_VERSIONS|LegacyV14" src
```

Expected production matches: none. Generated-ID suffix parsing may remain only inside save validation.

```bash
git diff --name-only main...HEAD
```

No behavioral changes belong under components, Phaser/map modules, route controller, localization, or alerts. Permit only schema-fixture changes where schema 15 requires them.

**Complete verification**

```bash
bun run test:unit -- --run --maxWorkers=1
bun run test:e2e -- --workers=1
git diff --check main...HEAD
```

- [ ] Map every HPA-294 acceptance criterion to a named test.
- [ ] Confirm manual quote/dispatch atomicity, real daily timing, future-only route edits/removal, schema-15 round-trip, and every requested read model.

**Commit**

```bash
git add src
git commit -m "test(logistics): verify multi-day route lifecycle"
```

## Completion criteria

- Six green checkpoints in one implementation PR.
- Manual and recurring movement share one cash-free transfer-creation lifecycle.
- Each transfer order stores one shipped quantity.
- Inventory and cash reconcile across origin, transit, destination, overflow, and transport cost.
- Runtime ordering uses plain string IDs without numeric parser duplication.
- Schema 15 round-trips; schema 14 is unsupported.
- Read models are pure and historical utilization uses attempt capacity.
- No migration, repair path, duplicate ledger, cached metric, alert heuristic, reliability model, generic scheduler, planner behavior, or UI feature is introduced.
