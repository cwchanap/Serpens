# City-Local Logistics Supply Planner — Design

**Linear:** HPA-297 — Extend the Supply Planner with city-local inventory and logistics

## Outcome

Extend the HPA-281 Supply Planner so a selected retail category can explain and compare the logistics that feed its configured supply city:

1. current city-local stock and warehouse headroom;
2. stock already in transit and the day it becomes usable;
3. recurring-route dispatch, arrival, capacity, cadence, priority, origin-stock, and transport-cost effects;
4. whether the remaining shortage is local production, route configuration, route timing, origin stock, warehouse capacity, or supply-source configuration;
5. the best focused player-confirmed logistics or existing local action over the current 7-day and 30-day horizons.

The planner remains advisory. It never dispatches a transfer, creates or edits a route, changes a retail supply assignment, builds a warehouse, advances the game clock, consumes RNG, or autosaves. Every recommendation is evaluated on copied planning state and then handed off to the existing HPA-574/HPA-292 UI for explicit player confirmation.

## Why HPA-297 is next

The required seams are now on `main`:

- HPA-281 owns `buildSupplyPlan`, local demand/production projection, bottlenecks, comparison, ranking, Supply Advisor, and non-mutating handoffs.
- HPA-294 owns authoritative `TransferOrder` / `RecurringRoute` state, arrival timing, destination reservations, route ordering, dispatch quantity, cadence, and transport costs.
- HPA-574 owns Logistics forms, route focus, route management, and world-map route selection.

HPA-297 is therefore unblocked. HPA-296 remains later additive work; this slice uses normal base-route values only.

---

## Architecture decision

### Reject: replay `simulateDay`

Do not clone the full daily simulation. It would pull unrelated sales, staffing, finance, events, reports, RNG, and persistence into an advisory feature.

### Reject: a decoupled 30-day logistics ledger followed by a lumped HPA-281 projection

HPA-281's current horizon math is deliberately closed-form: production/processor/demand capacities are multiplied by the whole horizon, and the supplied starting inventory is available from day zero. A day-20 arrival cannot be passed into that helper after the fact without either crediting it too early or replacing the allocator.

That contradicts HPA-297's required dated-arrival behavior. Do not implement a logistics-only trace first and then inject `SupplyPlannerInventoryDelta[]` into the existing 7/30 helper.

### Choose: one integrated 30-day planning stepper only when logistics is relevant

Keep `buildSupplyPlan` as the single public entry point.

```text
GameState
  ↓
HPA-281 SupplyPlannerSnapshot
  + copied HPA-294 logistics state
  ↓
if no relevant routes/in-transit:
  existing projectSupplySnapshot unchanged

if logistics is relevant:
  one 30-day planning trace
    day D:
      1. arrive due transfer orders
      2. run one-day HPA-281 expected-value step for selected supply city
      3. update that city's required-material inventory/warehouse used
      4. dispatch due recurring routes in HPA-294 order
      5. record route/city/material evidence
  ↓
7-day slice + 30-day result
  ↓
logistics diagnosis → bounded candidate family
  ↓ if no viable logistics candidate
existing HPA-281 local bottleneck/candidate path
  ↓
existing comparison/ranking → Supply Advisor → existing action UI
```

This is still one planner. The new `supplyPlannerLogistics.ts` module owns copied logistics state and pure route-day mechanics; `supplyPlanner.ts` owns the integrated day loop because it is the only place that can interleave dated logistics with HPA-281 local material flow correctly.

---

## Reuse map

Reuse existing contracts rather than parallel planner copies:

- `CityInventory` from `types.ts` for city material quantities;
- `TransferOrder` for current/projected in-transit orders;
- `RecurringRoute` for current/projected routes;
- `RecurringRouteInput` for the route-creation form preset;
- `compareRecurringRoutes` for priority/raw-ID order;
- `quoteInterCityRates` for create-route defaults;
- live resume rule: `max(route.nextDispatchOnDay, currentDay)`;
- HPA-281 `viabilityTier` + `compareCandidates`; extend them, do not replace them.

Only one small city wrapper is new because warehouse capacity is derived rather than stored on `CityInventory`:

```ts
export interface SupplyPlannerLogisticsCitySnapshot {
	inventory: Readonly<CityInventory>;
	warehouseCapacity: number;
}
```

Do **not** add `SupplyPlannerTransferSnapshot`, `SupplyPlannerRouteSnapshot`, or a duplicate route-input payload type.

---

## Shared HPA-294 arithmetic

HPA-297 must not fork the arithmetic that decides destination need or dispatched quantity.

Keep `compareRecurringRoutes` unchanged and extract exactly two small pure helpers from `interCityLogistics.ts`:

```ts
export function getDestinationTransferNeedFromCapacity(input: {
	warehouseCapacity: number;
	warehouseUsed: number;
	reservedInTransitUnits: number;
}): number;

export function getRecurringDispatchQuantity(input: {
	destinationNeed: number;
	routeCapacity: number;
	availableOriginStock: number;
}): number;
```

`getDestinationTransferNeed(game, cityId)` delegates to the first. `processRecurringRouteDispatches` delegates to the second.

Do not extract a generic scheduler. The planner keeps a small pure route-day implementation, then pins it to live HPA-294 behavior with a one-day parity test covering arrivals, due routes, zero-quantity cadence advancement, reservations, attempts, next-dispatch dates, and transport cost.

---

## Planner logistics snapshot

`SupplyPlannerSnapshot` gains one nested logistics value:

```ts
export interface SupplyPlannerLogisticsSnapshot {
	currentDay: number;
	cities: readonly SupplyPlannerLogisticsCitySnapshot[];
	inTransitOrders: readonly Readonly<TransferOrder>[];
	routes: readonly Readonly<RecurringRoute>[];
	nextRouteSequence: number;
}
```

The snapshot builder:

- copies every opened industry city's `CityInventory` and derived warehouse capacity;
- copies current in-transit `TransferOrder`s, including unrelated materials because they reserve shared destination capacity;
- copies all current `RecurringRoute`s because unrelated routes can contend for origin stock/destination headroom/order;
- records `currentDay` and `nextRouteSequence` for deterministic hypothetical route IDs.

Delete `activeOutboundRouteIds`. HPA-297 replaces that temporary HPA-281 guard; do not keep a compatibility alias.

No save-schema or persistence change is involved.

---

## Modeling boundary

### Selected supply city

For the selected configured supply city, HPA-297 may use HPA-281's expected-value local model because that is already the planner's authoritative abstraction for this category.

On each traced day, only the selected category's **required materials** are advanced through the existing HPA-281 flow logic. Unrelated materials remain at their copied quantities except for explicit transfer arrivals/dispatches.

This is intentionally not a full-company replay.

### Remote route origins

Do not recursively run production planners for every remote origin.

Remote origins evolve only from:

- copied current inventory;
- current/projected transfer arrivals;
- current/projected route dispatches.

When a relevant route becomes origin-stock constrained and extra future supply would require unmodeled remote production, emit `remote-origin-production-not-modeled` and reject route-throughput candidates that assume that stock will appear.

### Selected-city outbound routes are not remote uncertainty

If the selected supply city is a route origin, run the selected-city one-day HPA-281 step **before** route dispatch. Its projected required-material inventory is therefore authoritative for that day's outbound quantity. Do not emit `remote-origin-production-not-modeled` merely because selected-city day-zero stock was exhausted.

### Existing exclusions

Keep HPA-281's current limitations:

- shared rail throughput allocation;
- per-category store sales-capacity allocation.

Do not add probabilistic reliability, route failure, rerouting, vehicle/path simulation, optimizer search, or event-modified routes.

---

## Integrated 30-day stepper

Run at most 30 days once. The 7-day result is a slice of the same trace.

### Day order

For projected closing day `D`:

1. **Arrive due orders.** Every in-transit order with `arrivalOnDay <= D` adds its full quantity to destination inventory and stops reserving destination warehouse capacity. Do not clamp overflow.
2. **Run one selected-city local day.** For each required material, reuse/refactor the existing HPA-281 branch/reachability flow with `horizonDays = 1` and the ledger's current selected-city inventory.
3. **Update selected-city inventory.** Apply the one-day result's ending required-material inventory back to the copied city inventory, then recompute warehouse used as the sum of copied material quantities. This makes later destination reservations and outbound routes see the same dated inventory state the planner just projected.
4. **Select due routes.** `state === 'active' && nextDispatchOnDay <= D`.
5. **Sort due routes.** Use `compareRecurringRoutes` unchanged.
6. **Dispatch sequentially.** For each route:
   - compute reserved in-transit units for its destination;
   - derive destination need with `getDestinationTransferNeedFromCapacity`;
   - read current copied origin stock;
   - derive whole-unit quantity with `getRecurringDispatchQuantity`;
   - remove dispatched stock immediately;
   - compute transport cost with the same safe-integer rules as HPA-294;
   - create a copied projected `TransferOrder` only for a non-zero dispatch;
   - record a zero-quantity attempt when quantity is zero;
   - advance `nextDispatchOnDay` to `D + frequencyDays` for every due attempt.
7. **Record evidence.** Capture selected-city material state, route attempts, arrivals, reservations, costs, and constraints for diagnosis and UI.

The planner does not construct a live `GameState`, report, save record, or event during this loop.

### One-day HPA-281 reuse

Do not add a second material allocator.

Refactor the current private material projection so the same allocation/topology facts can produce a one-day result from arbitrary current inventory. `localSupplyOverHorizon(..., 1, inventory)` remains the raw/intermediate flow primitive where processor data exists; finished/fallback material behavior reuses the same formulas that currently produce HPA-281's 7/30 outputs.

The one-day step must expose at least:

```ts
interface SupplyMaterialDayStep {
	materialId: MaterialId;
	startingInventoryUnits: number;
	localAvailableUnits: number;
	importRequiredUnits: number;
	endingInventoryUnits: number;
}
```

No-logistics planning does **not** go through the stepper. It calls today's `projectSupplySnapshot` path unchanged; a regression test pins equality.

### Whole-unit transfer boundary

HPA-281 demand may be fractional expected value. HPA-294 inventory/transfer quantities remain whole units.

Only the route boundary canonicalizes to non-negative whole units. Do not allow fractional projected transfer orders.

---

## Live-vs-planner route parity

Before candidate work, add one deterministic fixture with:

- at least one due in-transit arrival;
- two due routes that contend;
- one zero-quantity attempt;
- no selected-city local-flow change in the compared route phase.

Run the live route lifecycle (`processTransferArrivals` then `processRecurringRouteDispatches`) and the planner's equivalent route-day operations from the same starting logistics facts.

Assert parity for:

- resulting city inventories relevant to logistics;
- still-reserved in-transit quantities;
- attempt ordering and quantities;
- zero-attempt evidence;
- `nextDispatchOnDay` values;
- projected/new order arrival dates;
- scheduled transport cost.

This test is the drift guard for the lifecycle pieces that are intentionally not extracted into a shared scheduler.

---

## Forecast evidence

Keep concrete evidence rather than a generic causal graph.

```ts
export interface SupplyPlannerRouteForecast {
	routeId: string;
	materialId: MaterialId;
	originCityId: WorldCityId;
	destinationCityId: WorldCityId;
	projectedDispatchedUnits7: number;
	projectedDispatchedUnits30: number;
	projectedDeliveredUnits7: number;
	projectedDeliveredUnits30: number;
	projectedTransportCost30: number;
	firstProjectedArrivalDay: number | null;
	peakUnmetDestinationNeed: number;
	firstOriginStockConstraintDay: number | null;
	firstDestinationCapacityConstraintDay: number | null;
}

export interface SupplyPlannerCityLogisticsForecast {
	cityId: WorldCityId;
	materialId: MaterialId;
	startingInventoryUnits: number;
	inTransitUnits: number;
	earliestArrivalDay: number | null;
	endingInventoryUnits7: number;
	endingInventoryUnits30: number;
}
```

Evidence used in copy/recommendations identifies city, route when applicable, material, day, and amount.

---

## Bottleneck diagnosis

Preserve existing HPA-281 local bottleneck kinds and add only these logistics causes:

```ts
export type SupplyLogisticsBottleneck =
	| { kind: 'origin-inventory'; routeId: string; cityId: WorldCityId; materialId: MaterialId; day: number; deficitUnits: number }
	| { kind: 'route-capacity'; routeId: string; cityId: WorldCityId; materialId: MaterialId; day: number; unmetUnits: number }
	| { kind: 'route-frequency'; routeId: string; cityId: WorldCityId; materialId: MaterialId; stockoutDay: number; nextArrivalDay: number }
	| { kind: 'route-lead-time'; routeId: string; cityId: WorldCityId; materialId: MaterialId; stockoutDay: number; firstArrivalDay: number }
	| { kind: 'route-paused'; routeId: string; cityId: WorldCityId; materialId: MaterialId }
	| { kind: 'route-destination-capacity'; routeId: string; cityId: WorldCityId; materialId: MaterialId; day: number; blockedUnits: number }
	| { kind: 'destination-configuration'; retailCityId: WorldCityId; supplyCityId: WorldCityId; materialId: MaterialId };
```

Diagnosis order for a required material that still imports/stocks out:

1. matching paused route;
2. destination capacity/reservation block;
3. origin stock block;
4. route capacity;
5. route frequency;
6. route lead time;
7. no useful inbound route but another opened industry city has current stock → destination configuration;
8. otherwise existing HPA-281 local bottleneck.

`remote-origin-production-not-modeled` is a limitation, not a bottleneck.

---

## Candidate actions

Keep all current HPA-281 local actions and add focused logistics actions.

`build-warehouse` gains `cityId` because the constrained city may not be `snapshot.supplyCityId`. This is an internal breaking change; no compatibility arm.

```ts
export type SupplyPlannerAction =
	| /* existing local actions */
	| { kind: 'build-warehouse'; cityId: WorldCityId; buildingTypeId: 'warehouse'; cost: number }
	| { kind: 'create-route'; input: RecurringRouteInput }
	| { kind: 'edit-route'; routeId: string; field: 'capacity' | 'frequencyDays' | 'priority'; from: number; to: number }
	| { kind: 'resume-route'; routeId: string }
	| { kind: 'change-supply-source'; retailCityId: WorldCityId; fromSupplyCityId: WorldCityId; toSupplyCityId: WorldCityId }
	| { kind: 'none'; reason: SupplyPlannerNoopReason };
```

### Bounded logistics recipes

No optimizer loop.

- **Resume:** same route active with `nextDispatchOnDay = max(route.nextDispatchOnDay, currentDay)`.
- **Capacity:** exactly one candidate, `currentCapacity + ceil(peakUnmetDestinationNeed)`, rejected if copied origin stock cannot support the additional dispatch and remote production is unknown.
- **Frequency:** exactly one candidate, `max(1, currentFrequencyDays - 1)`, only when the trace shows a post-first-arrival shortage between successful deliveries.
- **Priority:** exactly one candidate only when moving immediately before the observed blocker is numerically possible.
- **Create route:** at most one candidate per other opened industry city with positive current stock. Use `quoteInterCityRates`, `frequencyDays = 1`, `priority = 0`, capacity bounded by `ceil(peakDailyImportNeed)` and available copied stock, and hypothetical ID `route-${nextRouteSequence}` for comparison ordering.
- **Supply source:** only already-open industry cities; rebuild from a cloned assignment with nested logistics candidate generation disabled.
- **Warehouse:** existing warehouse feasibility/economics, targeted to the bottleneck city.

### Logistics → local fallthrough

Do not let a diagnosed logistics family force an avoidable no-op.

1. Diagnose one logistics cause.
2. Generate only that bounded logistics family.
3. If at least one candidate survives availability, feasibility, affordability, and remote-production safety gates, rank/return within that family.
4. If the family has no viable candidate, continue to the existing HPA-281 local bottleneck/candidate path.

Do **not** merge every local and logistics action into one optimizer pool. This is a single bounded fallback, not global search.

---

## Comparison and ranking

Extend `SupplyPlannerComparison`:

```ts
export interface SupplyPlannerComparison {
	// existing fields remain
	projectedDeliveredUnits7: number;
	projectedDeliveredUnits30: number;
	incrementalTransportCost30: number;
	firstShortageImprovementDays: number;
}
```

For logistics actions:

```text
importSpendReduction30 = baseline import spend - candidate import spend
incrementalTransportCost30 = candidate transport cost - baseline transport cost
netCashBenefit30 = importSpendReduction30 - incrementalTransportCost30 - known upfront cost
```

Route create/edit/resume/source changes get no invented setup/switching fee. Warehouse keeps its real build cost.

### Preserve `viabilityTier`

Do not replace HPA-281's existing ranking architecture.

`compareCandidates` continues to rank `viabilityTier` first so positive-complete, positive-pre-rail, unresolved-rail-ROI, and known-non-positive behavior stays intact. Logistics fields are appended as secondary evidence/tie-breaks after the existing benefit/shortage/import semantics.

A representative comparator order is:

1. existing `viabilityTier`;
2. existing complete/pre-rail benefit comparison;
3. 30-day shortage reduction;
4. 7-day shortage reduction;
5. import reduction;
6. existing stockout improvement;
7. first-shortage improvement;
8. projected delivered units where they actually reduce shortage/import;
9. lower incremental transport/known action cost;
10. stable action key.

Do not make delivered units a goal by themselves.

---

## Availability

Extend `SupplyPlannerActionAvailability` only with existing route-level capabilities:

```ts
canManageLogistics: boolean;
canSetRetailSupplySource: boolean;
```

Re-check availability immediately before handoff.

---

## UI and handoff

Keep one `SupplyAdvisor.svelte`; do not embed a second logistics dashboard.

Show compact route-aware evidence:

- configured supply city;
- current stock/capacity;
- in-transit quantity + earliest arrival;
- route state/next dispatch/7/30 delivery/unmet demand/transport cost;
- bottleneck city/route/material/day/amount;
- baseline vs candidate shortage/import/delivery/cost;
- remote-origin limitation only when it changes safe recommendation behavior.

Delete old `active-logistics-not-modeled` and `logistics-contention-not-modeled` copy once references are gone.

### Existing route actions

`edit-route` / `resume-route` use HPA-574's existing `focusedLogisticsRouteId`.

Handoff order is explicit because `closePlannerOverlays()` currently clears management-panel/focus state:

1. close planner/other overlays;
2. open `activeManagementPanelId = 'logistics'`;
3. set `focusedLogisticsRouteId` for existing-route actions.

Never set focus before `closePlannerOverlays()`.

### Create route

Do not define a duplicate `LogisticsRoutePreset` payload. Reuse `RecurringRouteInput` as transient route-local form input.

Store:

```ts
let logisticsRoutePreset: RecurringRouteInput | null;
let logisticsRoutePresetKey: string | null;
```

The key can use stable planner action identity. Thread both through `ManagementPanelHost` to `LogisticsPanel`.

Handoff order:

1. close overlays;
2. set/open Logistics panel;
3. set new preset + key.

`LogisticsPanel` applies a new key once, seeds the existing create form, focuses it, and never submits automatically. Reactive rerenders must not overwrite player edits.

### Supply-source change

Reuse the existing Stores panel / `RetailSupplySources` row. Handoff order:

1. close overlays;
2. open Stores panel;
3. set `focusedRetailSupplyCityId`.

Focus alone never calls `setRetailSupplySource`.

### Warehouse

Close overlays, switch to `action.cityId`, then arm the existing warehouse placement. Do not always use `snapshot.supplyCityId`.

### Planner context retention

Keep `SupplyPlannerUiContext` unchanged when overlays close. Reopening restores category/horizon; no navigation stack/store.

---

## HPA-296 seam

Do not add event types or modifier providers now.

At one snapshot boundary HPA-296 can later supply deterministic effective route capacity/lead-time/state/cost values plus attribution. HPA-297's daily stepper and candidate structure should not need a second event subsystem.

---

## Risks and mitigations

### Future-arrival credit leaks backward in time

**Risk:** passing dated arrivals into HPA-281's lumped horizon math would let future stock prevent earlier shortages.

**Mitigation:** integrated daily stepper; inbound-before-arrival regression; 7-day view sliced from same 30-day trace.

### Selected-city outbound route is mistaken for remote-origin uncertainty

**Risk:** if logistics runs before selected-city expected production/draw, day-zero inventory can appear exhausted and incorrectly gate route recommendations.

**Mitigation:** selected-city one-day HPA-281 step occurs before due-route dispatch; explicit outbound regression.

### Planner route lifecycle drifts from HPA-294

**Risk:** due selection, zero attempts, reservations, next-dispatch dates, or costs can diverge even if two arithmetic helpers are shared.

**Mitigation:** one-day live-vs-planner parity fixture before candidate work.

### Warehouse headroom becomes stale during trace

**Risk:** arrivals/local required-material consumption/outbound routes alter used capacity, affecting later destination need.

**Mitigation:** copied city inventory is the source of truth; recompute used capacity after arrival/local step/dispatch rather than freezing day-zero `warehouseUsed`.

### Transient form preset overwrites player edits

**Risk:** Svelte rerenders can reapply a planner proposal.

**Mitigation:** stable preset key; apply each key once; component tests edit fields then rerender.

---

## File map

### Domain

- `src/lib/game/interCityLogistics.ts` — two shared arithmetic helpers only.
- `src/lib/game/interCityLogistics.spec.ts` — extraction parity.
- `src/lib/game/supplyPlannerLogistics.ts` **new** — copied logistics snapshot + pure arrival/route-day operations/evidence helpers; no independent 30-day planner.
- `src/lib/game/supplyPlannerLogistics.spec.ts` **new** — route-day mechanics + live parity fixture.
- `src/lib/game/supplyPlanner.ts` — nested logistics snapshot, remove old guard, integrated 30-day selected-city stepper, logistics bottlenecks.
- `src/lib/game/supplyPlanner.spec.ts` — no-logistics equality, dated arrivals, selected-city outbound, daily material flow.
- `src/lib/game/supplyPlannerActions.ts` — bounded logistics candidates, local fallback, comparison extension.
- `src/lib/game/supplyPlannerActions.spec.ts` — candidate/economics/ranking/immutability.

### UI/navigation

- `src/lib/components/game/SupplyAdvisor.svelte` + spec.
- `src/lib/components/game/LogisticsPanel.svelte` + spec.
- `src/lib/components/game/RetailSupplySources.svelte` + spec.
- `src/routes/supplyPlannerRoute.ts` + spec.
- `src/routes/ManagementPanelHost.svelte` + spec.
- `src/routes/+page.svelte` + `page.svelte.spec.ts`.
- `src/routes/retail-sim.e2e.ts`.

### Localization

- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`
- `src/lib/i18n/locales.spec.ts`

No persistence/schema file changes.

---

## Required verification

### Domain

- no-logistics public projection equals current HPA-281 behavior;
- arrival on day N cannot affect day `< N`;
- selected-city local step updates stock/headroom before outbound dispatch;
- remote origins do not receive invented production;
- whole-unit route quantities;
- route priority/raw-ID order;
- zero attempts advance cadence;
- arrival reservations release on arrival;
- one-day live/planner logistics parity;
- route capacity/frequency/lead-time/paused/origin/destination evidence;
- logistics family falls through to existing local actions when no logistics candidate is viable;
- `viabilityTier` behavior remains pinned while new logistics tie-breaks are added.

### UI/route

- route focus/preset/source focus happen **after** overlay clearing;
- `RecurringRouteInput` preset applied once, no auto-submit, edits survive rerender;
- city-scoped warehouse switches to action city;
- planner context survives handoff/reopen;
- route/scenario capability gates suppress unavailable recommendations.

### E2E

Use deterministic current-schema save injection:

1. selected-category shortage;
2. stocked remote origin; no useful inbound route;
3. planner recommends create route;
4. Logistics opens with `RecurringRouteInput` fields prefilled and no route created;
5. player explicitly submits existing HPA-574 form;
6. route is committed through normal controller/autosave;
7. reopen planner and see retained category/horizon plus updated route evidence.

---

## KISS / YAGNI guardrails

- no `simulateDay` replay;
- no second live scheduler;
- no logistics-first ledger followed by dated-delta injection into lumped horizon math;
- no recursive remote production planner;
- no generic optimizer/DSL/causal graph/event bus/planner store;
- no new persisted planner/effective-route state;
- no save migration/compatibility layer;
- no automatic mutations;
- no chart dependency;
- one new planner-only logistics helper module;
- two shared HPA-294 arithmetic helpers;
- reuse `CityInventory`, `TransferOrder`, `RecurringRoute`, and `RecurringRouteInput`;
- unknown remote production is explicit and safely gated.

## Final decision

HPA-297 keeps the existing Supply Planner boundary but changes the core composition from “logistics ledger then horizon math” to an honest daily interleave. No-logistics cases retain HPA-281's current closed-form path. Logistics cases run one 30-day trace that applies arrivals, one selected-city HPA-281 day, then HPA-294-compatible route dispatch. Logistics recommendations remain bounded; if a diagnosed logistics action is not viable, the planner falls through once to the existing local action path. Existing viability ranking and player-confirmed UI remain the owners of final selection and mutation.