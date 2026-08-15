# City-Local Logistics Supply Planner — Design

**Linear:** HPA-297 — Extend the Supply Planner with city-local inventory and logistics

## Outcome

Extend the HPA-281 Supply Planner so a selected retail category can explain and compare the logistics that feed its configured supply city:

1. current city-local stock and warehouse headroom;
2. stock already in transit and the day it becomes usable;
3. recurring-route dispatch, arrival, capacity, cadence, priority, origin-stock, and transport-cost effects;
4. whether a remaining shortage is local production, route state/configuration/timing, origin stock, warehouse capacity, or supply-source configuration;
5. the best focused player-confirmed logistics action, falling back to the existing local HPA-281 action path when the logistics family has no worthwhile candidate.

The planner remains advisory. It never dispatches a live transfer, creates or edits a live route, changes a retail supply assignment, builds a warehouse, advances the game clock, consumes RNG, writes a report/save, or autosaves.

## Architecture decision

### Keep one public planner entry point

`buildSupplyPlan` in `supplyPlannerActions.ts` remains the only public planning entry point. `projectSupplySnapshot` remains the projection entry point used by baseline and every existing hypothetical call site.

`projectSupplySnapshot` chooses internally:

- **no relevant logistics:** current HPA-281 closed-form projection unchanged;
- **relevant routes/in-transit:** one integrated 30-day trace.

This matters because `supplyPlannerActions.ts` already calls `projectSupplySnapshot` for baseline and candidate projections. Logistics awareness must live behind that entry point so route-aware candidates cannot accidentally use the old closed-form path.

### Reject `simulateDay` replay

Do not clone the full daily simulation. That would pull sales, staffing, finance, events, reports, RNG, and persistence into an advisory feature.

### Reject a decoupled logistics ledger followed by a lumped HPA-281 horizon

HPA-281's current material projection multiplies production/processor/demand capacities across the whole horizon and treats the passed inventory as available from day zero. A day-20 arrival cannot be injected afterward without backward-crediting it into days 1–19.

Therefore do not build a 30-day logistics-only ledger and feed dated deltas into the existing horizon helper.

### Choose one integrated trace only when logistics matters

```text
GameState
  ↓
HPA-281 SupplyPlannerSnapshot
  + copied HPA-294 routes/orders/remote inventories
  ↓
projectSupplySnapshot
  ├─ no relevant logistics → current closed-form HPA-281 path
  └─ relevant logistics → one 30-day trace
       day D:
         1. arrive due integer transfer orders
         2. run one-day HPA-281 expected-value step for selected supply city
         3. canonicalize selected-city expected stock at the logistics boundary
         4. dispatch due routes in HPA-294 priority/raw-ID order
         5. record route/city/material evidence
       ↓
       7-day slice + 30-day result
  ↓
makePlan guard ladder
  no demand → missing producers → logistics diagnosis → local HPA-281 fallback
  ↓
existing comparison/ranking → Supply Advisor → existing action UI
```

`supplyPlannerLogistics.ts` owns copied logistics state plus pure one-day arrival/dispatch mechanics. `supplyPlanner.ts` owns the integrated trace because only it can interleave dated logistics with HPA-281 material flow.

---

## Reuse map

Prefer existing contracts and vocabulary:

- selected-city starting stock/capacity/used: existing `SupplyPlannerSnapshot.inventory`, `warehouseCapacity`, `warehouseUsed`;
- remote city material quantities: `CityInventory`;
- current/projected orders: `TransferOrder`;
- current/projected routes: `RecurringRoute`;
- route creation action/form payload: `RecurringRouteInput` after narrowing its three ID fields to `WorldCityId` / `MaterialId`;
- current day-zero in-transit evidence: `selectInTransitInventory`;
- route operational condition vocabulary: `RouteOperationalCondition`;
- route ordering: exported `compareRecurringRoutes`;
- create-route defaults: `quoteInterCityRates`;
- resume rule: `max(route.nextDispatchOnDay, currentDay)`;
- ranking: existing `viabilityTier` and `compareCandidates`;
- form/view-model seam: existing `logisticsPanel.ts`.

Do not add planner copies of `TransferOrder`, `RecurringRoute`, or `RecurringRouteInput`.

---

## Integer logistics vs fractional expected-value inventory

This boundary is explicit and testable.

### Why two representations are required

HPA-281 demand and material flow are expected values and may be fractional. `CityInventory` is live-domain stock: its helpers require safe non-negative integers and throw on fractional current quantities.

The integrated trace therefore maintains two selected-city ledgers:

```ts
type SelectedExpectedInventory = Partial<Record<MaterialId, number>>;

interface SelectedLogisticsInventory {
	inventory: CityInventory; // integer-only, logistics-visible stock
	warehouseCapacity: number;
}
```

- `SelectedExpectedInventory` is initialized from `snapshot.inventory` and is authoritative for the selected category's HPA-281 material flow.
- `SelectedLogisticsInventory` is trace-local, initialized once from the same live starting inventory, and is authoritative only for HPA-294-compatible route stock/reservation/headroom arithmetic.
- The selected city is **not** duplicated in `SupplyPlannerLogisticsSnapshot.remoteCities`.

### Canonical crossing rule

Export the existing `canonicalQuantity` behavior from `cityInventory.ts` without changing it: finite values floor to a non-negative safe integer; invalid/unsafe values canonicalize to `0`.

After each selected-city one-day HPA-281 step, for every required material:

```text
selectedLogisticsInventory[material] = canonicalQuantity(selectedExpectedInventory[material])
```

Non-required selected-city materials remain integer quantities changed only by explicit transfer arrivals/dispatches.

`warehouseUsed` for route destination need is always recomputed with `getCityInventoryUsed(selectedLogisticsInventory.inventory)`, so it is an integer live-compatible value. Fractional expected remainder does not reserve warehouse capacity until it becomes a whole unit.

### Synchronization rules

- An integer transfer arrival into the selected city is added to both ledgers for a required material.
- The one-day HPA-281 step changes only the expected ledger.
- Canonicalization refreshes the required-material values visible to routes.
- An outbound selected-city dispatch of whole quantity `q` subtracts `q` from both ledgers for a required material. Because route stock is `floor(expected)`, the subtraction cannot make expected stock negative.
- Remote cities use integer `CityInventory` only; they do not run HPA-281 production.

A parity test must include a case where selected expected inventory is fractional and canonicalization changes the logistics-visible quantity. This prevents the route parity fixture from accidentally avoiding the boundary.

---

## Shared HPA-294 primitives

The parity fixture remains the main drift guard, but share the small route arithmetic that already exists.

### Reservation sum

Extract the real reservation scan:

```ts
export function sumReservedInTransitUnits(
	orders: readonly TransferOrder[],
	destinationCityId: WorldCityId
): number;
```

It includes only `status === 'in-transit'` orders for the destination and preserves HPA-294 safe-integer addition.

### Destination need

```ts
export function getDestinationTransferNeedFromCapacity(input: {
	warehouseCapacity: number;
	warehouseUsed: number;
	reservedInTransitUnits: number;
}): number;
```

`getDestinationTransferNeed(game, cityId)` becomes a thin adapter using `getCityInventoryStats` + `sumReservedInTransitUnits` + this helper.

### Dispatch quantity

```ts
export function getRecurringDispatchQuantity(input: {
	destinationNeed: number;
	routeCapacity: number;
	availableOriginStock: number;
}): number;
```

`processRecurringRouteDispatches` delegates to it.

### Route ordering reuse

`logisticsReadModels.ts` deletes its private byte-equivalent `compareCurrentRoutes` and imports `compareRecurringRoutes`.

Do not extract a generic scheduler framework.

---

## Narrow `RecurringRouteInput`

The current input uses `string` IDs even though successful validation immediately narrows them to closed game IDs. Change only the type contract:

```ts
export interface RecurringRouteInput {
	originCityId: WorldCityId;
	destinationCityId: WorldCityId;
	materialId: MaterialId;
	capacity: number;
	frequencyDays: number;
	leadTimeDays: number;
	transportCostPerUnit: number;
	priority: number;
}
```

`RecurringRouteUpdateInput` inherits the narrowing. Runtime validation remains because callers are not trusted at runtime; invalid-input tests may cast malformed fixtures explicitly.

The existing Logistics form validates non-empty selected values before constructing the typed input.

Create-route candidates are emitted only when computed capacity is a positive safe integer. The bounded recipe is:

```text
candidateCapacity = min(ceil(peakDailyImportNeed), availableWholeOriginStock)
```

If that value is `< 1`, do not emit the candidate.

---

## Planner logistics snapshot

Only remote cities need a new city wrapper because the selected city already exists in HPA-281's snapshot.

```ts
export interface SupplyPlannerRemoteLogisticsCitySnapshot {
	inventory: Readonly<CityInventory>;
	warehouseCapacity: number;
}

export interface SupplyPlannerLogisticsSnapshot {
	currentDay: number;
	remoteCities: readonly SupplyPlannerRemoteLogisticsCitySnapshot[];
	inTransitOrders: readonly Readonly<TransferOrder>[];
	routes: readonly Readonly<RecurringRoute>[];
	nextRouteSequence: number;
}
```

The snapshot builder:

- excludes `snapshot.supplyCityId` from `remoteCities`;
- copies every other opened industry city's `CityInventory` + derived capacity;
- copies all current in-transit orders, including unrelated materials because they reserve shared destination capacity;
- copies all routes because unrelated routes can contend for stock/headroom/order;
- records current day and `nextRouteSequence`.

Delete `activeOutboundRouteIds`; no compatibility alias.

No persistence/schema change.

---

## Integrated 30-day trace

Run at most 30 days once; the 7-day result is a slice of the same trace.

### Prepared local flow is hoisted once

Before the day loop, compute the selected snapshot's required-material requirements, usable buildings, branch allocations, processor/warehouse reachability, and other topology facts once. Reuse those prepared facts for all 30 day steps.

Do not call `allocateCapacityByBranch` once per day.

A producer/upgrade/rail hypothetical gets its own prepared facts once because its snapshot topology differs. Route/source/warehouse-only hypotheticals reuse the topology implied by their candidate snapshot projection call.

### Day order

For projected closing day `D`:

1. **Arrive due orders.** Add full integer quantity to the destination's integer logistics inventory and release the reservation. If the destination is the selected city and the material is required, add the same integer quantity to the expected ledger.
2. **Run one selected-city local day.** Reuse the prepared HPA-281 flow facts with `horizonDays = 1` and the current fractional expected inventory.
3. **Update the expected ledger.** Store each required material's fractional `endingInventoryUnits`.
4. **Canonicalize the logistics crossing.** Refresh required-material integer selected-city stock with `canonicalQuantity` and recompute selected-city `warehouseUsed` through `getCityInventoryUsed`.
5. **Select due routes.** Active routes with `nextDispatchOnDay <= D`.
6. **Sort due routes.** `compareRecurringRoutes`.
7. **Dispatch sequentially.** For each route:
   - compute reservations with `sumReservedInTransitUnits`;
   - compute destination need with the shared helper;
   - read integer current origin stock;
   - compute whole-unit dispatch quantity with the shared helper;
   - remove dispatched quantity immediately from the integer origin inventory;
   - if selected origin + required material, subtract the same whole units from expected inventory;
   - create a projected in-transit `TransferOrder` only for non-zero quantity;
   - preserve zero-quantity attempt evidence;
   - advance `nextDispatchOnDay = D + frequencyDays` for every due attempt;
   - use HPA-294 safe-integer transport-cost behavior.
8. **Record evidence.** Capture material state, arrivals, conditions, attempts, reservations, dispatch/delivery totals, and cost.

The trace never constructs a live `GameState`, report, event, save record, or RNG.

### No-logistics fast path

If routes/orders cannot affect required-material projection or destination capacity, call today's closed-form `projectSupplySnapshot` implementation internally. A regression pins the public output.

---

## Live-vs-planner route parity

Before candidate work, one deterministic fixture compares:

```text
live: processTransferArrivals → processRecurringRouteDispatches
planner: pure arrive-one-day → pure dispatch-one-day
```

The fixture includes:

- a due arrival;
- two due contended routes;
- a zero-quantity attempt;
- reservation release;
- a selected-city fractional expected-inventory crossing where canonicalization floors the route-visible stock.

Assert parity for the integer logistics phase:

- logistics-visible inventories;
- reserved in-transit totals;
- attempt ordering and whole quantities;
- zero-attempt evidence;
- `nextDispatchOnDay` values;
- projected order arrival dates;
- scheduled transport cost.

The expected-value ledger itself is planner-only; parity applies after its explicitly documented canonical crossing.

---

## Evidence vocabulary

### Current in-transit row

Use `selectInTransitInventory(game)` for current destination/material/quantity/order IDs/earliest-arrival evidence shown in Supply Advisor. Do not reimplement that day-zero aggregation.

### Projected route evidence

Keep a planner forecast type because it is future evidence, but reuse `RouteOperationalCondition` names for overlapping states:

```ts
export interface SupplyPlannerRouteForecast {
	route: Readonly<RecurringRoute>;
	projectedCondition: RouteOperationalCondition | 'route-paused';
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
```

No alternate names such as `origin-inventory` or `route-destination-capacity` for states already called `origin-stock-constrained` / `destination-full` elsewhere.

Planner-only timing/configuration causes may still use distinct names: `route-frequency`, `route-lead-time`, `route-priority-constrained`, `route-paused`, `destination-configuration`.

---

## Guard and diagnosis ladder

Logistics does not outrank basic HPA-281 guards.

`makePlan` order becomes:

1. `demandPerDay <= 0` → existing `no-demand`;
2. `missingProducerMaterials(snapshot)` → existing upstream-first structural producer path;
3. diagnose a logistics cause for a required material that still imports/stocks out;
4. generate only that cause's bounded logistics family;
5. if a worthwhile logistics candidate survives, rank/return within that family;
6. otherwise continue once into today's local HPA-281 bottleneck path (`rail-disconnected`, warehouse, producer/upgrade, no-op).

The old `activeOutboundRouteIds` early bail is deleted rather than replaced in place.

### Logistics cause names

```ts
export type SupplyLogisticsBottleneck =
	| { kind: 'destination-full'; routeId: string; cityId: WorldCityId; materialId: MaterialId; day: number; blockedUnits: number }
	| { kind: 'origin-stock-constrained'; routeId: string; cityId: WorldCityId; materialId: MaterialId; day: number; deficitUnits: number }
	| { kind: 'route-capacity-constrained'; routeId: string; cityId: WorldCityId; materialId: MaterialId; day: number; unmetUnits: number }
	| { kind: 'route-priority-constrained'; routeId: string; blockingRouteId: string; cityId: WorldCityId; materialId: MaterialId; day: number }
	| { kind: 'route-frequency'; routeId: string; cityId: WorldCityId; materialId: MaterialId; stockoutDay: number; nextArrivalDay: number }
	| { kind: 'route-lead-time'; routeId: string; cityId: WorldCityId; materialId: MaterialId; stockoutDay: number; firstArrivalDay: number }
	| { kind: 'route-paused'; routeId: string; cityId: WorldCityId; materialId: MaterialId }
	| { kind: 'destination-configuration'; retailCityId: WorldCityId; supplyCityId: WorldCityId; materialId: MaterialId };
```

`remote-origin-production-not-modeled` remains a limitation, not a bottleneck. It never applies to the selected supply city's own outbound stock because selected-city local flow is modeled before dispatch.

---

## Bounded candidate families

No optimizer pool.

Cause → family mapping:

- `route-paused` → one `resume-route`;
- `destination-full` → existing city-scoped `build-warehouse` prerequisite candidate only;
- `origin-stock-constrained` → no larger/faster route if stock would require unmodeled remote production; fall through to local HPA-281 when no safe logistics action exists;
- `route-capacity-constrained` → one capacity edit;
- `route-priority-constrained` → one priority edit only if it can numerically precede the observed blocker;
- `route-frequency` → one `max(1, current - 1)` frequency edit;
- `route-lead-time` → no invented faster-route parameter; fall through unless another existing bounded family is evidence-backed;
- `destination-configuration` → at most one create-route candidate per stocked opened remote origin plus already-open supply-source candidates.

Create-route uses `quoteInterCityRates`, `frequencyDays = 1`, `priority = 0`, positive-safe-integer capacity, and hypothetical ID `route-${nextRouteSequence}` for projected ordering.

---

## Action contracts and stable identity

`build-warehouse` becomes city-scoped; no compatibility arm.

```ts
export type SupplyPlannerAction =
	| /* current build-producer / upgrade-building / connect-rail arms */
	| { kind: 'build-warehouse'; cityId: WorldCityId; buildingTypeId: 'warehouse'; cost: number }
	| { kind: 'create-route'; input: RecurringRouteInput }
	| { kind: 'edit-route'; routeId: string; field: 'capacity' | 'frequencyDays' | 'priority'; from: number; to: number }
	| { kind: 'resume-route'; routeId: string }
	| { kind: 'change-supply-source'; retailCityId: WorldCityId; fromSupplyCityId: WorldCityId; toSupplyCityId: WorldCityId }
	| { kind: 'none'; reason: SupplyPlannerNoopReason };
```

Extend `actionKey` for every new arm. Required identities:

```text
build-warehouse:${cityId}
create-route:${origin}:${destination}:${material}:${capacity}:${frequency}:${leadTime}:${cost}:${priority}
edit-route:${routeId}:${field}:${to}
resume-route:${routeId}
change-supply-source:${retailCityId}:${toSupplyCityId}
```

This prevents city-scoped warehouse ties from collapsing to the current constant `build-warehouse` key.

---

## Comparison, value gate, and viability tiers

Extend `SupplyPlannerComparison` with:

```ts
projectedDeliveredUnits7: number;
projectedDeliveredUnits30: number;
incrementalTransportCost30: number;
firstShortageImprovementDays: number;
```

For create/edit/resume/source-change actions:

```text
importSpendReduction30 = baseline import spend - candidate import spend
incrementalTransportCost30 = candidate transport cost - baseline transport cost
netCashBenefit30 = importSpendReduction30 - incrementalTransportCost30 - known upfront cost
```

### Value gate before blocking local fallback

A normal logistics candidate is worthwhile only when:

```text
shortageReduction30 > 0
AND netCashBenefit30 !== null
AND netCashBenefit30 > 0
```

Moving stock without reducing the shortage is not value. Reducing shortage at a transport cost greater than avoided import value also does not block the local HPA-281 fallback.

`build-warehouse` is the one explicit prerequisite exception: preserve HPA-281 behavior. It stays tier 1 / ROI-uncomputed and is accepted only in the `destination-full` family when it is affordable, feasible, and increases warehouse headroom. It never competes in the same family with a positive-complete route edit.

### Tier behavior for new actions

- create/edit/resume/source-change with positive complete `netCashBenefit30` naturally use existing `viabilityTier = 4`;
- the same actions with non-positive complete benefit are tier 1 and fail the value gate;
- city-scoped warehouse remains tier 1 prerequisite by design;
- existing rail/pre-rail/unknown tiers are unchanged.

Do not replace `viabilityTier`.

`compareCandidates` keeps current tier/benefit/shortage/import/stockout ordering and appends first-shortage improvement, useful delivered units, transport cost, and stable `actionKey` afterward.

---

## Availability

Extend `SupplyPlannerActionAvailability` only with existing route-level capabilities:

```ts
canManageLogistics: boolean;
canSetRetailSupplySource: boolean;
```

Re-check availability immediately before handoff.

---

## UI handoff

### Close first, then focus

`closePlannerOverlays()` clears `activeManagementPanelId` and `focusedLogisticsRouteId`, so every handoff does:

1. close overlays;
2. open the destination panel;
3. set destination-specific focus/preset state.

Never set focus before close.

### Existing route actions

Reuse/extend `openLogisticsManagement(...)` and existing `focusedLogisticsRouteId` for edit/resume.

### Create-route preset lives in the pure view-model

Reuse `RecurringRouteInput` as the transient preset payload. Do not add `LogisticsRoutePreset`.

Add pure helpers in `logisticsPanel.ts`, for example:

```ts
export interface LogisticsRouteFormValues {
	originCityId: string;
	destinationCityId: string;
	materialId: string;
	capacity: string;
	frequencyDays: string;
	leadTimeDays: string;
	transportCostPerUnit: string;
	priority: string;
}

export function routePresetKey(input: RecurringRouteInput): string;

export function applyRoutePreset(
	current: LogisticsRouteFormValues,
	preset: RecurringRouteInput,
	appliedKey: string | null
): { values: LogisticsRouteFormValues; appliedKey: string };
```

If the same preset key is already applied, return the current edited values unchanged. A distinct preset converts numeric fields to strings once. `LogisticsPanel.svelte` only calls the helper and assigns returned values; the pure behavior is primarily tested in `logisticsPanel.spec.ts`.

The form still requires explicit submit.

### Supply-source focus

Open Stores after cleanup, then set a route-local `focusedRetailSupplyCityId`. `RetailSupplySources` focuses/scrolls that row without calling `onChange`.

### Warehouse

`build-warehouse.cityId` selects the target industry city before existing placement handoff.

Planner category/horizon context is not cleared by handoffs.

---

## Performance constraint

The logistics trace multiplies daily work, so keep the expensive topology work outside the 30-day loop.

Requirements:

- branch/reachability allocation prepared once per `projectSupplySnapshot` call;
- 7-day values sliced from the same 30-day trace;
- route/source/warehouse candidate projection uses the same projection entry point, not a second logistics function;
- no per-day BFS/branch-allocation rebuild;
- add a warmed focused server test on a representative logistics fixture asserting `buildSupplyPlan` completes within a generous **2,000 ms** wall-time budget. This is a regression smoke, not a microbenchmark target.

---

## HPA-296 seam

Do not add event types/provider frameworks now. HPA-296 can later change the snapshot builder to supply effective deterministic route capacity/lead-time/state/cost plus attribution. The trace architecture does not change.

---

## File map

### Domain

- `src/lib/game/cityInventory.ts` / `.spec.ts` — export/pin existing `canonicalQuantity` behavior.
- `src/lib/game/interCityLogistics.ts` / `.spec.ts` / `.integration.spec.ts` / `.invariants.spec.ts` — narrow route IDs, share reservation/destination/quantity arithmetic, preserve live behavior.
- `src/lib/game/logisticsReadModels.ts` / `.spec.ts` — reuse `compareRecurringRoutes`.
- `src/lib/game/supplyPlannerLogistics.ts` **new** / `.spec.ts` **new** — remote copied state + pure route-day mechanics/evidence.
- `src/lib/game/supplyPlanner.ts` / `.spec.ts` — projection entry-point branching, prepared one-day flow, dual selected-city ledgers, integrated trace, logistics bottlenecks.
- `src/lib/game/supplyPlannerActions.ts` / `.spec.ts` — guard order, bounded families, value gate, local fallback, comparison/ranking, stable action keys.

### UI/navigation

- `src/lib/components/game/logisticsPanel.ts` / `.spec.ts` — pure preset conversion/apply-once.
- `src/lib/components/game/LogisticsPanel.svelte` / `.spec.ts` — call pure preset helper + existing explicit form submit.
- `src/lib/components/game/RetailSupplySources.svelte` / `.spec.ts` — focus only.
- `src/routes/supplyPlannerRoute.ts` / `.spec.ts` — non-mutating handoff ordering.
- `src/routes/ManagementPanelHost.svelte` / `.spec.ts`.
- `src/routes/+page.svelte` / `page.svelte.spec.ts`.
- `src/lib/components/game/SupplyAdvisor.svelte` / `.spec.ts`.
- `src/routes/retail-sim.e2e.ts`.

### Localization

- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`
- `src/lib/i18n/locales.spec.ts`

No persistence/schema file changes.

---

## Testing requirements

### Shared/live logistics

- canonical quantity floor/safe boundaries;
- reserved-order sum and release-on-arrival behavior;
- destination need and dispatch quantity;
- live dispatcher integration/invariant suites remain green;
- `logisticsReadModels` route ordering still matches HPA-294.

### Integrated projection

- no-logistics public parity;
- day-20 arrival cannot fix a day-5 shortage;
- selected expected inventory fractional crossing floors route-visible stock without throwing;
- warehouse used remains integer/live-compatible;
- inbound/outbound selected-city synchronization;
- remote origin stock exhaustion limitation;
- selected-city outbound does not emit remote-production uncertainty;
- route priority/capacity/frequency/lead-time/paused/destination-full evidence;
- prepared allocations are not rebuilt inside the day loop;
- warmed 2-second planning smoke.

### Planning/actions

- no-demand and missing-producer guards precede logistics diagnosis;
- logistics family with no positive-worth route candidate falls through to local HPA-281 action;
- warehouse prerequisite exception is isolated to destination-full;
- every new `actionKey` arm is stable and city-scoped where needed;
- transport cost participates in complete logistics economics;
- `viabilityTier` behavior remains unchanged for existing local actions.

### Handoff/UI

- close → open panel → focus/preset ordering;
- pure preset conversion/apply-once/new-key behavior in `logisticsPanel.spec.ts`;
- component does not overwrite user edits or submit automatically;
- source focus does not mutate assignment;
- city-scoped warehouse targets correct city;
- current `RouteOperationalCondition` terminology is reused in planner copy.

### E2E

Deterministic save injection:

1. selected destination shortage;
2. stocked remote origin;
3. no useful inbound route;
4. planner recommends create route;
5. Logistics opens with one-shot prefill;
6. no route exists before explicit submit;
7. submit through current HPA-574 command path;
8. reopen planner and retain category/horizon plus new route evidence.

---

## Risks

- **Future-arrival backward credit:** logistics cases use daily trace, never dated deltas into lumped horizon.
- **Fractional stock crossing:** expected and logistics-visible selected stock are separate typed ledgers; only `canonicalQuantity` crosses them.
- **Selected-city outbound false uncertainty:** selected local step precedes route dispatch.
- **Live/planner route drift:** three shared helpers + one-day parity + live integration/invariant suites.
- **Stale warehouse headroom:** integer logistics inventory is the only source for route warehouse used.
- **30x projection cost:** prepared branch/reachability facts hoisted once; one entry point; timing smoke.
- **Preset overwrite:** pure apply-once helper keyed by canonical route input.

---

## KISS / YAGNI

- no `simulateDay` replay;
- no recursive remote production planner;
- no generic route scheduler/optimizer/DSL/causal graph;
- no planner store/event bus;
- no automatic mutation;
- no random reliability/failure model;
- no save schema/migration/compatibility aliases;
- no duplicate route/order/preset types;
- one new planner-only logistics module;
- one integrated daily trace only when logistics matters;
- explicit integer/fractional boundary instead of hidden conversion;
- HPA-296 stays deferred to snapshot input.

## Final decision

HPA-297 removes HPA-281's temporary logistics suppression with one route-aware projection entry point. No-logistics behavior stays on the current closed-form path. Logistics cases interleave dated arrivals, a prepared one-day selected-city HPA-281 expected-value step, explicit integer canonicalization, and HPA-294-compatible route dispatch. The planner reuses existing domain/read-model vocabulary, keeps candidate search bounded, preserves HPA-281 ranking, falls back to local actions when logistics is not worthwhile, and hands every mutation to existing UI.