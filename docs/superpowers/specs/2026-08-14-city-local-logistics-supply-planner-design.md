# City-Local Logistics Supply Planner — Design

**Linear:** HPA-297 — Extend the Supply Planner with city-local inventory and logistics

## Outcome

Extend the HPA-281 Supply Planner so a selected retail category can explain and compare the logistics that feed its configured supply city:

1. current city-local stock and warehouse headroom;
2. stock already in transit and the day it becomes usable;
3. recurring-route dispatch, arrival, capacity, cadence, priority, origin-stock, and transport-cost effects;
4. whether the remaining shortage is local production, route configuration, route timing, origin stock, warehouse capacity, or supply-source configuration;
5. the best focused player-confirmed logistics/local action over the existing 7-day and 30-day horizons.

The planner remains advisory. It never dispatches a transfer, creates or edits a route, changes a retail supply assignment, builds a warehouse, advances the game clock, consumes RNG, or autosaves. Every recommended change is applied only to an immutable hypothetical snapshot and then handed off to HPA-574/HPA-292's existing player-facing workflow.

## Why HPA-297 is next

The ticket's required seams are now present on `main`:

- HPA-281 owns the local expected-value Supply Planner and explicitly stops at `active-logistics-not-modeled`.
- HPA-294 owns authoritative transfer orders, recurring routes, ordering, dispatch quantity, arrival timing, transport cost, and route commands.
- HPA-574 owns the Logistics panel, route creation/edit/state/priority controls, route focus, and world-map route selection.

HPA-297 is therefore unblocked without waiting for HPA-296. Event-modified route values remain a later additive integration; this slice uses normal base-route state only.

---

## Design decision

### Considered options

#### A. Clone or replay `simulateDay`

Reject.

It would make the planner depend on unrelated store sales, staffing, events, finance, reports, RNG, persistence, and command behavior. It also creates a second simulation contract that will drift from the live game.

#### B. Put route arithmetic directly into `supplyPlanner.ts`

Reject.

The HPA-281 module already owns demand, production-chain reachability, material projection, and local bottlenecks. Adding transfer ledgers, route schedules, route evidence, and logistics candidate mutations directly would make that file the new all-purpose simulation module.

#### C. Add one focused logistics overlay to the existing planner

Choose this.

Use HPA-281 for local category demand/production projection and a new pure `supplyPlannerLogistics.ts` helper for only inter-city inventory movement. Share the small HPA-294 arithmetic that must stay identical with the live route core.

```text
GameState
  ├─ HPA-281 local SupplyPlannerSnapshot
  └─ HPA-294 logistics state
            ↓
SupplyPlannerLogisticsSnapshot
  - opened industry-city inventory/capacity
  - all current in-transit orders
  - all current recurring routes
            ↓
pure 30-day logistics ledger
  arrivals → destination reservations → due routes by priority/id
            ↓
per-day inventory deltas + route/city evidence
            ↓
existing HPA-281 material allocator/projection
            ↓
integrated bottleneck + focused candidates
            ↓
existing SupplyAdvisor → existing Logistics / Stores / placement flows
```

This is not a second planner. `buildSupplyPlan` remains the only public planning entry point and composes local + logistics evidence.

---

## First-slice modeling boundary

### Exact logistics state

Snapshot and project:

- every opened industry city's authoritative `CityInventory` quantities and current warehouse capacity;
- every current in-transit `TransferOrder` because all materials reserve shared destination warehouse capacity;
- every current `RecurringRoute` because routes can compete through shared destination capacity and stable ordering;
- base route fields exactly as persisted by HPA-294;
- the current game day and `nextRouteSequence` so hypothetical route IDs are deterministic.

### Local production remains HPA-281-owned

Do not recursively run a production planner for every remote route origin.

For the selected configured supply city, keep HPA-281's current expected-value production/requirement model. The logistics overlay contributes only dated inventory additions/removals to that model.

For other route origins, future route dispatches use:

- current city inventory;
- already in-transit arrivals into that city;
- prior projected route arrivals/dispatches.

They do **not** invent future local production at that remote origin.

This is intentionally conservative. When a required-material route becomes constrained because the remote origin's snapshotted stock is exhausted, surface `remote-origin-production-not-modeled` and do not recommend a larger/faster route as though production replenishment were guaranteed. Remote production can be planned from that city's own Supply Planner context later without recursively embedding planners inside planners.

This keeps HPA-297 inventory/schedule accurate and explainable while avoiding a company-wide production optimizer.

### What remains outside the model

Keep the existing HPA-281 limitations:

- shared rail throughput allocation;
- per-category store sales-capacity allocation.

Add only the precise remote-origin limitation above when it materially affects the required-material forecast.

Do not add probabilistic reliability, shipment failure, rerouting, vehicle/path simulation, arbitrary optimizer search, or event-modified routes.

---

## Shared HPA-294 arithmetic

HPA-297 must not fork the rules that decide recurring-route contention or quantity.

Keep `compareRecurringRoutes` as the ordering owner and extract only two small pure arithmetic helpers from `interCityLogistics.ts` so live and planner code call the same functions:

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

`getDestinationTransferNeed(game, cityId)` becomes a thin live-state adapter around the first helper. `processRecurringRouteDispatches` uses the second helper instead of its inline `Math.min`.

Do not extract a generic scheduler framework. Route due-state and next-dispatch math are already trivial and remain explicit at the two call sites, with parity tests.

---

## Planner logistics contracts

Create `src/lib/game/supplyPlannerLogistics.ts`.

```ts
export interface SupplyPlannerLogisticsCitySnapshot {
	cityId: WorldCityId;
	warehouseCapacity: number;
	inventory: Partial<Record<MaterialId, number>>;
}

export interface SupplyPlannerTransferSnapshot {
	id: string;
	sourceRouteId: string | null;
	originCityId: WorldCityId;
	destinationCityId: WorldCityId;
	materialId: MaterialId;
	quantity: number;
	arrivalOnDay: number;
	transportCost: number;
}

export interface SupplyPlannerRouteSnapshot {
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

export interface SupplyPlannerLogisticsSnapshot {
	currentDay: number;
	cities: readonly SupplyPlannerLogisticsCitySnapshot[];
	inTransitOrders: readonly SupplyPlannerTransferSnapshot[];
	routes: readonly SupplyPlannerRouteSnapshot[];
	nextRouteSequence: number;
}
```

`SupplyPlannerSnapshot` gains one immutable `logistics` field instead of adding route arrays and city maps directly to the HPA-281 top-level contract.

Delete `activeOutboundRouteIds`. HPA-297 replaces that temporary guard rather than preserving a compatibility alias.

No save-schema change is involved; these are derived planner-only snapshots.

---

## Logistics projection

### One 30-day pass

Project a maximum of 30 days once. The 7-day view is a slice of the same trace, not a second schedule run.

The ledger is a compact derived structure containing:

- current per-city material quantities;
- current per-city warehouse used/capacity;
- current and projected in-transit orders;
- copied route schedule state;
- projected route attempts/evidence;
- selected-supply-city per-material inventory deltas by day.

### Daily ordering

For each projected closing day `D`:

1. **Arrive due orders** — orders with `arrivalOnDay <= D` add their full quantity to destination inventory and stop reserving destination capacity. Existing HPA-294 behavior allows inventory to exceed capacity, so the planner does not silently clamp arrivals.
2. **Apply HPA-281 local expected-value step for the selected supply city** through the existing material allocator, not by replaying live production. Logistics supplies only the inventory delta for that day.
3. **Select due recurring routes** — `state === 'active' && nextDispatchOnDay <= D`.
4. **Sort due routes** using `compareRecurringRoutes` (priority, then raw route ID).
5. **Dispatch sequentially**:
   - destination need comes from current warehouse used/capacity minus all still-reserved in-transit units;
   - origin stock comes from the ledger's current authoritative inventory for that material;
   - dispatch quantity comes from `getRecurringDispatchQuantity`;
   - dispatch removes origin stock immediately;
   - transport cost is `quantity × transportCostPerUnit`;
   - a non-zero dispatch adds a projected in-transit order arriving on `D + leadTimeDays`;
   - zero-quantity attempts still create evidence but no projected order;
   - route next dispatch becomes `D + frequencyDays`.
6. Record the selected supply city's inbound/outbound inventory deltas for HPA-281's material projection.

The planner never creates a `GameState`, report, event, or save record during this loop.

### Whole-unit boundary

HPA-281 demand can be fractional expected value. HPA-294 route quantities are whole inventory units.

At the route-dispatch boundary, available origin stock and destination need use non-negative whole units; planner demand/import metrics remain numeric expected values. Do not allow fractional transfer quantities to leak into hypothetical orders.

---

## Integrating logistics with HPA-281 material projection

Do not replace HPA-281's branch/reachability allocator.

Extend the private local-supply horizon helper to accept an optional per-day city-inventory delta series for the material:

```ts
interface SupplyPlannerInventoryDelta {
	dayOffset: number; // 1...30
	quantity: number; // positive arrival, negative dispatch
}
```

The same allocator continues to determine how much inventory and local usable production can satisfy the selected category's required material flow. Logistics only changes when inventory is present.

Required behavior:

- in-transit units do not contribute before their arrival day;
- an arrival can prevent a later stockout/import but cannot retroactively prevent an earlier one;
- outbound route dispatch reduces inventory on its dispatch day;
- no-logistics snapshots produce the same HPA-281 7/30 results as before;
- projection remains immutable and deterministic.

---

## Logistics evidence

Return concrete route/city evidence rather than a generic causal graph.

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

Evidence used in copy/recommendations must identify the city, route when applicable, material, day, and amount.

---

## Bottleneck diagnosis

Preserve the existing local bottleneck kinds and add only logistics-specific causes:

```ts
export type SupplyLogisticsBottleneck =
	| {
			kind: 'origin-inventory';
			routeId: string;
			cityId: WorldCityId;
			materialId: MaterialId;
			day: number;
			deficitUnits: number;
	  }
	| {
			kind: 'route-capacity';
			routeId: string;
			cityId: WorldCityId;
			materialId: MaterialId;
			day: number;
			unmetUnits: number;
	  }
	| {
			kind: 'route-frequency';
			routeId: string;
			cityId: WorldCityId;
			materialId: MaterialId;
			stockoutDay: number;
			nextArrivalDay: number;
	  }
	| {
			kind: 'route-lead-time';
			routeId: string;
			cityId: WorldCityId;
			materialId: MaterialId;
			stockoutDay: number;
			firstArrivalDay: number;
	  }
	| {
			kind: 'route-paused';
			routeId: string;
			cityId: WorldCityId;
			materialId: MaterialId;
	  }
	| {
			kind: 'route-destination-capacity';
			routeId: string;
			cityId: WorldCityId;
			materialId: MaterialId;
			day: number;
			blockedUnits: number;
	  }
	| {
			kind: 'destination-configuration';
			retailCityId: WorldCityId;
			supplyCityId: WorldCityId;
			materialId: MaterialId;
	  };
```

Diagnosis is evidence-first:

1. start from a selected-city material that still imports/stocks out in the integrated projection;
2. if a matching paused route would otherwise contribute, report `route-paused`;
3. if a projected relevant dispatch is blocked by destination headroom, report destination capacity;
4. if it is blocked by origin stock, report origin inventory;
5. if it dispatches at capacity with unmet destination need, report route capacity;
6. if successful deliveries are too far apart after the first arrival, report route frequency;
7. if the first possible arrival is after the initial stockout, report route lead time;
8. if no useful inbound route exists but another opened industry city has current stock, report destination configuration;
9. otherwise fall back to HPA-281's local bottleneck.

Do not infer hidden causal relationships beyond recorded projection evidence.

`remote-origin-production-not-modeled` is a limitation, not a bottleneck. If it applies to the same route/material, it prevents recommendations that assume additional future origin supply.

---

## Candidate actions

Keep current HPA-281 local actions and add focused logistics actions.

`build-warehouse` gains a `cityId` because a logistics capacity bottleneck may be outside the currently selected industry city. This is an internal breaking change; do not keep the old no-city variant.

```ts
export type SupplyPlannerAction =
	| /* existing local actions */
	| {
			kind: 'build-warehouse';
			cityId: WorldCityId;
			buildingTypeId: 'warehouse';
			cost: number;
	  }
	| {
			kind: 'create-route';
			originCityId: WorldCityId;
			destinationCityId: WorldCityId;
			materialId: MaterialId;
			capacity: number;
			frequencyDays: number;
			leadTimeDays: number;
			transportCostPerUnit: number;
			priority: number;
	  }
	| {
			kind: 'edit-route';
			routeId: string;
			field: 'capacity' | 'frequencyDays' | 'priority';
			from: number;
			to: number;
	  }
	| { kind: 'resume-route'; routeId: string }
	| {
			kind: 'change-supply-source';
			retailCityId: WorldCityId;
			fromSupplyCityId: WorldCityId;
			toSupplyCityId: WorldCityId;
	  }
	| { kind: 'none'; reason: SupplyPlannerNoopReason };
```

### Candidate generation is bounded

No search/optimizer loop.

#### Resume route

When a paused route matches a shortage material and destination, simulate that same route active with the live resume rule:

```text
nextDispatchOnDay = max(route.nextDispatchOnDay, currentDay)
```

#### Increase route capacity

Only for a forecasted capacity-constrained route.

Generate one candidate:

```text
newCapacity = currentCapacity + ceil(peakUnmetDestinationNeed)
```

Reject it if current/projected origin stock cannot support the added dispatch and remote production is unknown.

#### Increase route frequency

Only when the trace demonstrates a post-first-arrival stockout between successful deliveries.

Generate one step tighter:

```text
newFrequencyDays = max(1, currentFrequencyDays - 1)
```

Do not scan every possible cadence.

#### Raise route priority

Only when a required-material route loses available origin stock to an earlier conflicting route in the same projected day.

If the blocking route priority is greater than `0`, generate one candidate with priority `blockingPriority - 1`. If the blocker is already priority `0`, do not fabricate a priority that cannot beat it; allow another action/no-op to win.

#### Create route

Only when a destination shortage has no useful inbound route.

Generate at most one candidate per other opened industry city with positive current stock of the shortage material.

Use:

- `quoteInterCityRates(origin, destination)` for lead time and transport cost per unit;
- `frequencyDays = 1`;
- `capacity = max(1, ceil(peakDailyImportNeed))`, capped by stock that is actually available to the candidate projection;
- `priority = 0`;
- hypothetical ID `route-${nextRouteSequence}` for deterministic tie behavior.

This is a concrete first proposal, not a route optimizer. The existing form lets the player edit it before confirming.

#### Change retail supply source

Generate only for already-open industry cities. Build a copied `GameState` with the selected retail city's assignment changed, then rebuild the planner projection with logistics candidate generation disabled for that nested comparison.

Do not open cities, edit other retail assignments, or recursively optimize source cities.

#### Build warehouse

Reuse the existing warehouse placement/economic candidate but scope it to the city identified by the logistics capacity bottleneck.

---

## Hypothetical mutation boundary

Every logistics candidate mutates a cloned planner snapshot/ledger only.

- `create-route` appends one copied route and increments only the copied `nextRouteSequence`;
- `edit-route` changes only the copied route field;
- `resume-route` changes copied state/next dispatch;
- `build-warehouse` changes copied warehouse capacity;
- `change-supply-source` rebuilds from a cloned game assignment;
- current `GameState`, autosave repository, route sequences, transfer sequences, reports, and RNG are untouched.

Add explicit immutability tests that compare the input `GameState` and logistics arrays before/after baseline and every candidate family.

---

## Comparison and ranking

Extend the existing comparison rather than add a logistics ranking engine.

```ts
export interface SupplyPlannerComparison {
	// existing fields...
	projectedDeliveredUnits7: number;
	projectedDeliveredUnits30: number;
	incrementalTransportCost30: number;
	firstShortageImprovementDays: number;
}
```

For logistics actions:

```text
importSpendReduction30 =
  baseline import spend - candidate import spend

incrementalTransportCost30 =
  candidate scheduled transport cost - baseline scheduled transport cost

netCashBenefit30 =
  importSpendReduction30
  - incrementalTransportCost30
  - known upfront action cost
```

Route edits/resume have no invented upfront fee. Route creation has no invented setup fee; only projected transport cost is counted. Warehouse keeps its real build cost. Supply-source change has no invented switching fee.

Existing producer operating/input-cost calculations remain unchanged for local producer actions.

### Deterministic ranking

After feasibility/availability/affordability gates:

1. positive complete `netCashBenefit30`;
2. larger 30-day shortage reduction;
3. larger 7-day shortage reduction;
4. larger import reduction;
5. larger first-shortage improvement;
6. larger delivered units;
7. lower incremental transport cost / known action cost;
8. stable action key.

If every complete candidate is non-positive or ineffective, keep no-op.

Do not make `deliveredUnits` a goal by itself; moving stock that does not reduce shortage/import is not valuable.

---

## Availability

Extend `SupplyPlannerActionAvailability` with only the existing route-level capabilities needed to avoid recommending inaccessible workflows:

```ts
export interface SupplyPlannerActionAvailability {
	// existing fields...
	canManageLogistics: boolean;
	canSetRetailSupplySource: boolean;
}
```

The planner does not need per-command logistics booleans because HPA-574 gates all route management behind the same `manageLogistics` capability.

Re-check availability immediately before handoff.

---

## UI

Keep `SupplyAdvisor.svelte`. Do not build a second logistics dashboard.

Add a compact logistics evidence section for the selected category:

- configured supply city;
- current city stock/capacity;
- in-transit quantity and earliest arrival;
- route state, next dispatch, projected 7/30 delivered units, utilization/unmet demand, and projected transport cost;
- the concrete bottleneck city/route/material/day/amount;
- baseline vs candidate shortage/import/delivery/transport-cost changes;
- `remote-origin-production-not-modeled` only when it affects the forecast.

Remove:

- `active-logistics-not-modeled` copy;
- `logistics-contention-not-modeled` no-op copy.

Reuse existing Supply Advisor empty/error/evidence/candidate presentation and localization structure.

No chart dependency.

---

## Handoff and planner context

### Existing route actions

Use HPA-574's existing `focusedLogisticsRouteId`. `edit-route` and `resume-route` open the Logistics management panel focused on that route. The planner does not invoke the update/resume command.

### Route creation

Add one route-local transient preset, not a global store/router:

```ts
export interface LogisticsRoutePreset {
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

Thread it through `+page.svelte` → `ManagementPanelHost` → `LogisticsPanel`.

`LogisticsPanel` applies a new preset once, seeds the existing route-creation form, and focuses that form. It never submits automatically. Repeated reactive renders must not overwrite player edits.

### Supply-source change

Open the existing Stores management panel and focus the selected retail city's `RetailSupplySources` row. Do not pre-commit the proposed source.

### Warehouse

Reuse industry-city switching + placement. `build-warehouse.cityId` chooses the target city.

### Context retention

Keep the existing `SupplyPlannerUiContext` (`categoryId`, `horizonDays`) as route-local state. Handoffs close the planner but do not clear that context. Reopening Supply Advisor returns to the same category/horizon; do not add a navigation stack or planner store.

---

## HPA-296 integration seam

Do not add event types, provider interfaces, or generic modifier hooks in HPA-297.

The logistics snapshot copies route values at one boundary. HPA-296 can later change that snapshot builder to copy deterministic **effective** capacity/lead-time/state/cost plus attribution instead of base values. The logistics ledger and action comparison need not change shape.

No preemptive abstraction is required now.

---

## File map

### Domain

- `src/lib/game/interCityLogistics.ts`
  - extract shared destination-need and dispatch-quantity arithmetic;
  - keep live route lifecycle authoritative.
- `src/lib/game/interCityLogistics.spec.ts`
  - parity for extracted helpers/live dispatch.
- `src/lib/game/supplyPlanner.ts`
  - add logistics snapshot field;
  - remove active-route guard contract;
  - accept per-day logistics inventory deltas in the existing local allocator;
  - integrate logistics bottleneck evidence.
- `src/lib/game/supplyPlannerLogistics.ts` **new**
  - immutable logistics snapshot/30-day ledger/evidence only.
- `src/lib/game/supplyPlannerLogistics.spec.ts` **new**
  - schedule, arrival, capacity reservation, priority, stock, and trace tests.
- `src/lib/game/supplyPlanner.spec.ts`
  - no-logistics parity and integrated material projection tests.
- `src/lib/game/supplyPlannerActions.ts`
  - logistics candidate families, cloned hypotheticals, comparison/ranking.
- `src/lib/game/supplyPlannerActions.spec.ts`
  - candidate generation, economics, no-op, immutability.

### UI/navigation

- `src/lib/components/game/SupplyAdvisor.svelte`
- `src/lib/components/game/SupplyAdvisor.svelte.spec.ts`
- `src/lib/components/game/LogisticsPanel.svelte`
- `src/lib/components/game/LogisticsPanel.svelte.spec.ts`
- `src/lib/components/game/RetailSupplySources.svelte`
- `src/lib/components/game/RetailSupplySources.svelte.spec.ts`
- `src/routes/supplyPlannerRoute.ts`
- `src/routes/supplyPlannerRoute.spec.ts`
- `src/routes/ManagementPanelHost.svelte`
- `src/routes/ManagementPanelHost.svelte.spec.ts`
- `src/routes/+page.svelte`
- `src/routes/page.svelte.spec.ts`
- `src/routes/retail-sim.e2e.ts`

### Localization

- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`
- `src/lib/i18n/locales.spec.ts`

No persistence/schema files should change.

---

## Testing requirements

### HPA-294 parity

Cover:

- priority then raw-ID ordering;
- destination need subtracts all current/projected in-transit reservations;
- dispatch quantity is exactly `min(destination need, route capacity, origin stock)`;
- zero dispatch creates evidence but no projected order;
- paused route does not dispatch;
- next dispatch day is current projected day + frequency;
- arrival day is dispatch day + lead time;
- transport cost matches HPA-294 arithmetic.

### Logistics projection

Cover:

- in-transit stock unavailable before arrival and available on arrival;
- an early arrival prevents only later imports/stockouts;
- outbound route removes selected-city inventory on dispatch;
- two routes contend deterministically for destination headroom;
- two routes contend deterministically for origin stock;
- route capacity, frequency, lead-time, paused, origin-stock, destination-capacity evidence;
- multi-hop existing routes work naturally through projected arrivals without route-path search;
- remote origin stock exhaustion emits the limitation and blocks unsafe throughput recommendations;
- no-logistics result matches HPA-281 baseline.

### Candidates

Cover:

- resume uses live resume schedule rule;
- capacity candidate uses one peak-unmet increment;
- frequency candidate tightens one day only;
- priority candidate only when it can actually beat the blocker;
- create-route uses canonical quote, stable hypothetical ID, one-day cadence, bounded capacity;
- source reassignment rebuilds on a cloned assignment and never recurses into candidate generation;
- destination warehouse targets the correct city;
- transport cost participates in net cash ranking;
- no-op wins when logistics improvement is not worth its cost;
- baseline/candidates do not mutate `GameState`, route sequences, transfer sequences, reports, RNG, or autosave state.

### Component/route

Cover:

- city/in-transit/route evidence;
- all logistics bottleneck copy families;
- logistics comparisons and limitation copy;
- route edit/resume focus;
- create-route preset is applied once and never submits;
- user edits are not overwritten by reactive rerenders;
- supply-source focus;
- planner context survives handoff/reopen;
- route/scenario capability gates suppress unavailable recommendations.

### E2E

Use the existing deterministic current-schema browser-save injection.

Required flow:

1. inject a destination shortage with stocked remote origin and no useful route;
2. open Supply Advisor and observe a route-aware shortage/configuration diagnosis;
3. choose the recommended `create-route` action;
4. verify Logistics opens with the proposed route fields prefilled and no route exists yet;
5. explicitly submit the existing HPA-574 route form;
6. verify the route is created through the normal controller/autosave boundary;
7. close Logistics, reopen Supply Advisor, and verify category/horizon context plus updated route evidence.

This tests planner → existing action workflow without giving the planner mutation ownership.

---

## KISS / YAGNI guardrails

- no `simulateDay` replay;
- no second route scheduler in live state;
- no route/path optimizer;
- no production planner recursively embedded per remote city;
- no generic solver, DSL, causal graph, event bus, or planner store;
- no random reliability/failure model;
- no automatic route/source/build mutations;
- no copied persistent effective-route state;
- no save-schema change or compatibility layer;
- no chart library;
- one new focused logistics projection module;
- two tiny shared HPA-294 arithmetic helpers only;
- unknown remote production is labeled/safely gated instead of guessed.

## Final decision

HPA-297 should remove HPA-281's temporary active-logistics suppression by composing a small immutable logistics ledger with the existing local planner. Exact transfer/route state and schedule rules are modeled; remote production is not recursively simulated. Candidate generation stays bounded to evidence-backed route/source/warehouse changes, and every action still requires explicit confirmation in the existing UI.