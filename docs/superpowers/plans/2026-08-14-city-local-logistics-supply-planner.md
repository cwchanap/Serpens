# City-Local Logistics Supply Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend HPA-281 with deterministic dated logistics while preserving its no-logistics projection, local recommendation behavior, ranking architecture, and explicit player-confirmed mutation boundaries.

**Architecture:** `buildSupplyPlan` remains the only public planner entry point and `projectSupplySnapshot` remains the one projection entry point used by baseline and candidate paths. No-logistics snapshots use today's closed-form HPA-281 projection. Logistics-relevant snapshots use one 30-day trace that interleaves due integer arrivals, a prepared one-day HPA-281 expected-value step for the selected supply city, explicit integer canonicalization at the route boundary, and HPA-294-compatible route dispatch. `supplyPlannerLogistics.ts` owns copied remote logistics state and pure route-day mechanics; `supplyPlanner.ts` owns the integrated trace.

**Tech Stack:** TypeScript 6, Svelte 5, Vitest 4 server/client projects, Playwright, existing HPA-281/HPA-294/HPA-574 contracts.

## Global Constraints

- No `simulateDay` replay, RNG, report writes, save writes, autosave, or persistence changes in planner code.
- No generic scheduler, optimizer, DSL, causal graph, event bus, planner store, or remote-production recursion.
- Preserve current no-logistics `projectSupplySnapshot` output exactly.
- Keep one projection entry point so current baseline and hypothetical call sites cannot bypass logistics.
- Selected-city HPA-281 expected inventory may be fractional; live-compatible `CityInventory` remains safe non-negative integers only.
- Cross expected-value → logistics stock only through the existing `canonicalQuantity` floor/safe-integer behavior.
- Selected supply city is not duplicated in the remote logistics snapshot.
- Remote origins use integer copied inventory + projected arrivals/dispatches only.
- Preserve HPA-294 reservation, priority/raw-ID ordering, zero-attempt cadence advancement, dispatch quantity, lead time, arrival, and safe transport-cost behavior.
- Reuse `CityInventory`, `TransferOrder`, `RecurringRoute`, `RecurringRouteInput`, `RouteOperationalCondition`, `selectInTransitInventory`, and `compareRecurringRoutes`; do not add parallel payload/vocabulary types.
- Preserve `viabilityTier` as the first candidate-ranking dimension.
- Normal logistics actions must reduce 30-day shortage and have positive complete net benefit before they block local fallback.
- City-scoped warehouse remains the existing HPA-281 prerequisite exception; do not invent warehouse ROI merely to raise its viability tier.
- Every recommendation stays non-mutating until explicit player confirmation in the existing UI.
- HPA-296 remains deferred to route values supplied at the snapshot boundary.
- New/changed branches remain covered by the repository's 95% Codecov policy.

## File Structure

- `src/lib/game/cityInventory.ts` — authoritative integer inventory helpers; export existing canonicalization behavior.
- `src/lib/game/interCityLogistics.ts` — live HPA-294 owner; share reservation/destination/dispatch arithmetic and narrow route input IDs.
- `src/lib/game/logisticsReadModels.ts` — operational read models; reuse exported route comparator.
- `src/lib/game/supplyPlannerLogistics.ts` — new planner-only remote snapshot + pure arrival/dispatch day mechanics/evidence.
- `src/lib/game/supplyPlanner.ts` — existing closed-form path + prepared one-day local flow + integrated 30-day trace.
- `src/lib/game/supplyPlannerActions.ts` — guard ladder, bounded families, value gate, local fallback, economics/ranking/action identity.
- `src/lib/components/game/logisticsPanel.ts` — existing pure Logistics view-model plus route-preset conversion/apply-once helper.
- Existing `SupplyAdvisor`, `LogisticsPanel`, `RetailSupplySources`, `ManagementPanelHost`, `supplyPlannerRoute`, and `+page.svelte` remain UI/composition owners.

## Risks to Keep Visible

- **Future-arrival backward credit:** never inject dated arrivals into the closed-form horizon as starting inventory.
- **Fractional inventory leak:** never write fractional expected values into `CityInventory`.
- **Selected-city outbound false uncertainty:** selected local day runs before route dispatch.
- **Live/planner route drift:** share reservation/destination/dispatch arithmetic, reuse route comparator, and pin one-day parity.
- **Stale warehouse headroom:** route warehouse used is recomputed from integer logistics-visible inventory only.
- **30x projection cost:** prepare allocation/reachability once per projection, not per day.
- **Preset overwrite:** pure apply-once helper keyed by canonical route input.

---

### Task 1: Tighten and Share the Existing Logistics Contracts

**Files:**
- Modify: `src/lib/game/cityInventory.ts`
- Modify: `src/lib/game/cityInventory.spec.ts`
- Modify: `src/lib/game/interCityLogistics.ts`
- Modify: `src/lib/game/interCityLogistics.spec.ts`
- Verify: `src/lib/game/interCityLogistics.integration.spec.ts`
- Verify: `src/lib/game/interCityLogistics.invariants.spec.ts`
- Modify: `src/lib/game/logisticsReadModels.ts`
- Modify: `src/lib/game/logisticsReadModels.spec.ts`
- Modify minimally for narrowed route IDs: `src/lib/components/game/LogisticsPanel.svelte`
- Modify: `src/lib/components/game/LogisticsPanel.svelte.spec.ts`

**Interfaces:**

Produces:

```ts
export function canonicalQuantity(quantity: number): number;

export function sumReservedInTransitUnits(
	orders: readonly TransferOrder[],
	destinationCityId: WorldCityId
): number;

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

#### RED

- [ ] **Step 1: Pin canonical integer crossing behavior**

Add `cityInventory.spec.ts` cases:

```ts
expect(canonicalQuantity(4.75)).toBe(4);
expect(canonicalQuantity(0.99)).toBe(0);
expect(canonicalQuantity(-1)).toBe(0);
expect(canonicalQuantity(Number.NaN)).toBe(0);
expect(canonicalQuantity(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
```

Run:

```bash
bun run test:unit -- src/lib/game/cityInventory.spec.ts --run --project server
```

Expected: FAIL because `canonicalQuantity` is private.

- [ ] **Step 2: Write shared reservation/destination/dispatch tests**

Add tests equivalent to:

```ts
const orders: TransferOrder[] = [
	{
		id: 'transfer-1',
		source: { kind: 'manual' },
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'grain',
		quantity: 7,
		createdOnDay: 1,
		dispatchedOnDay: 1,
		arrivalOnDay: 2,
		transportCost: 7,
		status: 'in-transit'
	},
	{
		id: 'transfer-2',
		source: { kind: 'manual' },
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		quantity: 5,
		createdOnDay: 1,
		dispatchedOnDay: 1,
		arrivalOnDay: 1,
		transportCost: 5,
		status: 'delivered'
	}
];

expect(sumReservedInTransitUnits(orders, 'breadbasket-basin')).toBe(7);
expect(
	getDestinationTransferNeedFromCapacity({
		warehouseCapacity: 100,
		warehouseUsed: 60,
		reservedInTransitUnits: 25
	})
).toBe(15);
expect(
	getRecurringDispatchQuantity({
		destinationNeed: 30,
		routeCapacity: 20,
		availableOriginStock: 12
	})
).toBe(12);
```

Also cover zero/overflow/safe-add behavior.

Run:

```bash
bun run test:unit -- src/lib/game/interCityLogistics.spec.ts --run --project server
```

Expected: FAIL because helper exports do not exist.

- [ ] **Step 3: Add route-order reuse regression**

In `logisticsReadModels.spec.ts`, create equal/unequal-priority routes and pin `selectRouteOperations(game).map((row) => row.route.id)` to the same order as `[...routes].sort(compareRecurringRoutes)`.

Run:

```bash
bun run test:unit -- src/lib/game/logisticsReadModels.spec.ts --run --project server
```

Expected: current test may pass behaviorally; the implementation cleanup is verified in GREEN by removing the duplicate comparator.

- [ ] **Step 4: Pin narrowed `RecurringRouteInput` form construction**

In `LogisticsPanel.svelte.spec.ts`, mount the current route form and assert a valid selected origin/destination/material still submits a typed `RecurringRouteInput`; blank/unavailable selects do not submit.

#### GREEN

- [ ] **Step 5: Export existing canonicalization without changing behavior**

Change only:

```ts
export function canonicalQuantity(quantity: number): number {
	if (!Number.isFinite(quantity)) return 0;
	const wholeUnits = Math.floor(quantity);
	return Number.isSafeInteger(wholeUnits) ? Math.max(0, wholeUnits) : 0;
}
```

Keep all current `addCityInventoryMaterial` / `removeCityInventoryMaterial` calls using it.

- [ ] **Step 6: Extract three logistics helpers**

`getDestinationTransferNeed(game, cityId)` becomes:

```ts
const destinationStats = getCityInventoryStats(game, destinationCityId);
return getDestinationTransferNeedFromCapacity({
	warehouseCapacity: destinationStats.capacity,
	warehouseUsed: destinationStats.used,
	reservedInTransitUnits: sumReservedInTransitUnits(
		game.logistics.transferOrders,
		destinationCityId
	)
});
```

`processRecurringRouteDispatches` replaces only its inline dispatch `Math.min` with `getRecurringDispatchQuantity`.

Do not move due-route filtering, transfer creation, cadence advancement, or cost application into a framework.

- [ ] **Step 7: Reuse `compareRecurringRoutes` in read models**

Import it in `logisticsReadModels.ts`, replace:

```ts
.sort(compareCurrentRoutes)
```

with:

```ts
.sort(compareRecurringRoutes)
```

and delete `compareCurrentRoutes`.

- [ ] **Step 8: Narrow route input IDs**

Change the three ID fields to `WorldCityId` / `MaterialId`. Runtime validation remains.

In `LogisticsPanel.svelte`, guard empty selection before returning typed input:

```ts
if (!routeOriginCityId || !routeDestinationCityId || !routeMaterialId) return null;
```

Keep invalid runtime tests by explicitly casting malformed fixtures where required.

- [ ] **Step 9: Run all live logistics suites, not only unit extraction tests**

```bash
bun run test:unit -- \
  src/lib/game/cityInventory.spec.ts \
  src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/interCityLogistics.integration.spec.ts \
  src/lib/game/interCityLogistics.invariants.spec.ts \
  src/lib/game/logisticsReadModels.spec.ts \
  --run --project server
bun run test:unit -- src/lib/components/game/LogisticsPanel.svelte.spec.ts --run --project client
bun run check
bun run lint
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add \
  src/lib/game/cityInventory.ts src/lib/game/cityInventory.spec.ts \
  src/lib/game/interCityLogistics.ts src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/logisticsReadModels.ts src/lib/game/logisticsReadModels.spec.ts \
  src/lib/components/game/LogisticsPanel.svelte src/lib/components/game/LogisticsPanel.svelte.spec.ts
git commit -m "refactor(logistics): share planner route primitives"
```

---

### Task 2: Build the Integrated Trace with an Explicit Fractional/Integer Boundary

**Files:**
- Create: `src/lib/game/supplyPlannerLogistics.ts`
- Create: `src/lib/game/supplyPlannerLogistics.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`

**Interfaces:**

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

interface SupplyMaterialDayStep {
	materialId: MaterialId;
	startingInventoryUnits: number;
	localAvailableUnits: number;
	importRequiredUnits: number;
	endingInventoryUnits: number;
}
```

#### RED — Preserve the Existing Fast Path

- [ ] **Step 1: Pin current no-logistics projection before refactoring**

Use a current HPA-281 fixture with no routes/in-transit orders and assert:

```ts
expect({
	materials: projection.materials,
	warehouse: projection.warehouse,
	bottleneck: projection.bottleneck,
	limitations: projection.limitations
}).toEqual(EXISTING_EXPECTED_PROJECTION);
```

Use concrete values already produced by the fixture; do not rewrite them after implementation.

- [ ] **Step 2: Add remote-only snapshot test**

For a selected `industry-city` supply city plus opened `breadbasket-basin`:

```ts
expect(snapshot.logistics.remoteCities.map((row) => row.inventory.cityId)).toEqual([
	'breadbasket-basin'
]);
expect(snapshot.logistics.remoteCities.some((row) => row.inventory.cityId === snapshot.supplyCityId)).toBe(false);
expect(snapshot.inventory).toEqual(game.cityInventories.find((row) => row.cityId === 'industry-city')!.materials);
```

Also assert orders/routes are copied and later source mutation does not affect snapshot values.

#### RED — Route-Day Parity and Fractional Crossing

- [ ] **Step 3: Write the live-vs-planner one-day parity fixture**

Fixture requirements:

```text
one due in-transit arrival
selected supply city expected stock becomes fractional (e.g. 4.75)
canonical route-visible selected stock is 4
two active due routes contend
one zero-quantity attempt
```

The live logistics phase uses an equivalent integer starting city inventory:

```ts
const arrived = processTransferArrivals(game);
const live = processRecurringRouteDispatches(arrived.game);
```

The planner phase starts from copied route/order/remote state plus canonical selected-city integer logistics stock and calls pure arrive/dispatch-one-day helpers.

Assert parity after the documented expected→integer crossing:

```ts
expect(planner.integerInventories).toEqual(live.game.cityInventories);
expect(planner.attempts).toEqual(live.attempts);
expect(planner.scheduledTransportCost).toBe(live.scheduledTransportCost);
expect(planner.nextDispatchByRoute).toEqual(
	Object.fromEntries(live.game.logistics.recurringRoutes.map((r) => [r.id, r.nextDispatchOnDay]))
);
```

Also explicitly assert:

```ts
expect(canonicalQuantity(4.75)).toBe(4);
expect(Number.isSafeInteger(planner.selectedWarehouseUsed)).toBe(true);
```

Run:

```bash
bun run test:unit -- src/lib/game/supplyPlannerLogistics.spec.ts --run --project server
```

Expected: FAIL until the new planner route-day mechanics exist.

#### RED — Dated Material Semantics

- [ ] **Step 4: Add day-20 arrival and selected outbound cases**

Pin:

```text
arrivalOnDay=20 cannot remove day-5 import/stockout
arrivalOnDay=20 can reduce import/stockout after day 20
selected-city local step runs before selected-city outbound route
selected outbound dispatch sees floor(expected stock) at route boundary
selected expected fractional remainder survives after whole-unit dispatch
selected-city outbound does not emit remote-origin-production-not-modeled
```

Add a raw/intermediate case that still respects warehouse-connected processor caps.

Run:

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerLogistics.spec.ts --run --project server
```

Expected: FAIL on the new logistics cases.

#### GREEN — Pure Logistics Day Mechanics

- [ ] **Step 5: Implement copied remote logistics state**

`buildSupplyPlannerLogisticsSnapshot(game, selectedSupplyCityId)` copies:

```ts
{
	currentDay: game.day,
	remoteCities: openedIndustryCities
		.filter((city) => city.id !== selectedSupplyCityId)
		.map((city) => ({
			inventory: structuredClone(authoritativeInventory),
			warehouseCapacity: getCityInventoryStats(game, city.id).capacity
		})),
	inTransitOrders: structuredClone(
		game.logistics.transferOrders.filter((order) => order.status === 'in-transit')
	),
	routes: structuredClone(game.logistics.recurringRoutes),
	nextRouteSequence: game.logistics.nextRouteSequence
}
```

Do not create planner-specific route/order interfaces.

- [ ] **Step 6: Implement pure arrival and route-dispatch day helpers**

The helper state has:

```ts
{
	selectedIntegerInventory: CityInventory;
	remoteIntegerInventories: CityInventory[];
	inTransitOrders: TransferOrder[];
	routes: RecurringRoute[];
}
```

Arrival helper:

```text
find arrivalOnDay <= day
add integer quantity to integer destination inventory
remove/mark delivered reservation in copied orders
return arrival evidence
```

Dispatch helper:

```text
filter active+due
sort compareRecurringRoutes
sumReservedInTransitUnits
getDestinationTransferNeedFromCapacity
getRecurringDispatchQuantity
non-zero -> remove origin + append copied in-transit TransferOrder
zero -> attempt evidence only
all due -> nextDispatchOnDay = day + frequencyDays
```

Use HPA-294 safe-integer multiplication/addition behavior for cost/order sequencing.

#### GREEN — Prepared One-Day HPA-281 Flow

- [ ] **Step 7: Refactor local material projection into prepared facts + one-day step**

Create private prepared data once per projection call; it contains requirements, usable producer sets, branch allocations, processor reachability, and warehouse-connected caps.

The one-day helper consumes prepared facts + current fractional inventory:

```ts
function projectPreparedMaterialDay(
	prepared: PreparedSupplyMaterial,
	currentInventoryUnits: number
): SupplyMaterialDayStep
```

For raw/intermediate processor graphs use:

```ts
localSupplyOverHorizon(prepared.allocation, 1, currentInventoryUnits)
```

For finished/fallback rows reuse the same one-day form of current HPA-281 formulas.

Do not call `allocateCapacityByBranch` inside the day loop.

#### GREEN — One Projection Entry Point

- [ ] **Step 8: Make `projectSupplySnapshot` choose the projection path**

Structure:

```ts
export function projectSupplySnapshot(snapshot: SupplyPlannerSnapshot): SupplyPlannerProjection {
	return hasRelevantPlannerLogistics(snapshot)
		? projectSupplySnapshotWithLogistics(snapshot)
		: projectSupplySnapshotClosedForm(snapshot);
}
```

`projectSupplySnapshotClosedForm` is the current implementation moved without semantic changes.

No baseline/candidate call site in `supplyPlannerActions.ts` changes projection function.

- [ ] **Step 9: Implement the 30-day selected-city trace**

Initialize:

```ts
let selectedExpectedInventory = { ...snapshot.inventory };
let selectedIntegerInventory: CityInventory = {
	cityId: snapshot.supplyCityId,
	materials: structuredClone(snapshot.inventory)
};
```

Initial live values are integers, so the initial `CityInventory` is valid.

For each day:

```text
1. arrive due integer orders
   - selected required arrival: add to expected + integer ledgers
2. project each selected required material for one day from expected ledger
3. store fractional endingInventoryUnits in expected ledger
4. selectedIntegerInventory.requiredMaterial = canonicalQuantity(expected)
5. selectedWarehouseUsed = getCityInventoryUsed(selectedIntegerInventory)
6. dispatch due routes using integer inventories/reservations
7. selected outbound required q: subtract q from expected ledger too
8. record trace evidence
```

Do not write expected fractional values into `CityInventory` directly.

- [ ] **Step 10: Keep 7-day values as a slice of the same 30-day trace**

Do not run a second 7-day schedule.

- [ ] **Step 11: Emit remote-origin uncertainty only for remote origins**

A required-material route from a non-selected origin that becomes stock-constrained may emit `remote-origin-production-not-modeled`. Selected-city origins never emit it solely due to day-zero stock because selected local flow is modeled before dispatch.

#### Performance Gate

- [ ] **Step 12: Add a warmed representative timing smoke**

In `supplyPlanner.spec.ts`:

```ts
buildSupplyPlan(game, request, availability); // warm
const started = performance.now();
buildSupplyPlan(game, request, availability);
expect(performance.now() - started).toBeLessThan(2_000);
```

Use a deterministic fixture with at least two routes, one in-transit order, and the multi-stage pantry chain. The 2-second threshold is deliberately broad; it guards accidental per-day BFS/allocation rebuilding rather than benchmarking hardware.

- [ ] **Step 13: Run GREEN projection tests**

```bash
bun run test:unit -- \
  src/lib/game/supplyPlannerLogistics.spec.ts \
  src/lib/game/supplyPlanner.spec.ts \
  --run --project server
bun run check
bun run lint
```

Expected: PASS.

- [ ] **Step 14: Commit**

```bash
git add \
  src/lib/game/supplyPlannerLogistics.ts src/lib/game/supplyPlannerLogistics.spec.ts \
  src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(supply): interleave logistics with daily forecasts"
```

---

### Task 3: Insert Logistics into the Existing Planning Ladder and Rank Only Worthwhile Actions

**Files:**
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`
- Modify: `src/lib/game/supplyPlannerActions.ts`
- Modify: `src/lib/game/supplyPlannerActions.spec.ts`

**Interfaces:**

Extend action availability:

```ts
canManageLogistics: boolean;
canSetRetailSupplySource: boolean;
```

Extend action union:

```ts
| { kind: 'build-warehouse'; cityId: WorldCityId; buildingTypeId: 'warehouse'; cost: number }
| { kind: 'create-route'; input: RecurringRouteInput }
| { kind: 'edit-route'; routeId: string; field: 'capacity' | 'frequencyDays' | 'priority'; from: number; to: number }
| { kind: 'resume-route'; routeId: string }
| { kind: 'change-supply-source'; retailCityId: WorldCityId; fromSupplyCityId: WorldCityId; toSupplyCityId: WorldCityId }
```

Extend comparison:

```ts
projectedDeliveredUnits7: number;
projectedDeliveredUnits30: number;
incrementalTransportCost30: number;
firstShortageImprovementDays: number;
```

#### RED — Guard Order

- [ ] **Step 1: Prove no-demand and missing-producer still win before logistics**

Add fixtures containing active/inbound logistics and assert:

```ts
expect(buildSupplyPlan(zeroDemandGame, request, availability).plan.recommendation.action).toEqual({
	kind: 'none',
	reason: 'no-demand'
});

expect(buildSupplyPlan(missingProducerGame, request, availability).plan.recommendation.action.kind).toBe(
	'build-producer'
);
```

The missing-producer assertion should pin the same upstream-first material HPA-281 currently chooses.

#### RED — Shared Condition Vocabulary

- [ ] **Step 2: Add logistics cause tests using existing condition names**

Cover:

```text
paused route -> route-paused
full/reserved destination -> destination-full
origin stock binds -> origin-stock-constrained
route capacity binds -> route-capacity-constrained
priority loser -> route-priority-constrained
post-arrival gap -> route-frequency
first useful arrival too late -> route-lead-time
no useful inbound + stocked remote origin -> destination-configuration
otherwise -> existing local HPA-281 bottleneck
```

Every applicable cause carries city/route/material/day/amount evidence.

#### RED — Bounded Families and Positive-Value Fallback

- [ ] **Step 3: Add exact cause→candidate tests**

Pin:

```text
route-paused -> one resume-route
destination-full -> one city-scoped warehouse candidate
route-capacity-constrained -> one capacity edit
route-priority-constrained -> one priority edit only if blocker can be preceded
route-frequency -> one frequency edit (current - 1, minimum 1)
route-lead-time -> no invented lead-time edit; local fallback allowed
destination-configuration -> <=1 create-route per stocked open remote origin + open source choices
origin-stock-constrained remote with unknown production -> no unsafe larger/faster route
```

Create candidate capacity:

```ts
const capacity = Math.min(
	Math.ceil(peakDailyImportNeed),
	availableWholeOriginStock
);
if (!Number.isSafeInteger(capacity) || capacity < 1) {
	// do not emit create-route
}
```

- [ ] **Step 4: Add the value-gate regression**

Create a route edit that reduces shortage but costs more in incremental transport than the avoided imports. Also provide a valid local producer/upgrade candidate.

Assert the negative-benefit logistics action does **not** block the local recommendation.

Create a second case with positive shortage reduction + positive complete net benefit and assert the logistics family may win.

#### RED — Warehouse Tier Exception

- [ ] **Step 5: Pin the destination-full warehouse behavior**

Assert:

```text
warehouse candidate has positive warehouseFreeGain
warehouse candidate may keep netCashBenefit30 === null / viability tier 1
it is returned only in destination-full family when affordable+feasible
it is not pooled against a positive-complete route action
```

Do not expand `compareCandidate` into invented warehouse savings.

#### RED — Stable Action Keys

- [ ] **Step 6: Add identity tests for every new action**

Expected shapes:

```ts
expect(actionKey({ kind: 'build-warehouse', cityId: 'industry-city', buildingTypeId: 'warehouse', cost: 1 }))
	.toBe('build-warehouse:industry-city');

expect(actionKey({ kind: 'resume-route', routeId: 'route-2' })).toBe('resume-route:route-2');
```

Add concrete assertions for create-route, edit-route, and change-supply-source. Add two warehouse actions in different cities and assert distinct keys/order.

#### GREEN — Guard Ladder

- [ ] **Step 7: Replace the old early logistics bail with explicit ladder placement**

`makePlan` starts:

```ts
if (snapshot.demandPerDay <= 0) return planWithNoop(snapshot, baseline, 'no-demand');

const scopedGame = { ...clone(game), activeIndustryCityId: snapshot.supplyCityId };
const missing = missingProducerMaterials(snapshot);
if (missing.length > 0) {
	return makeExistingMissingProducerPlan(...);
}

const logisticsCause = diagnoseLogistics(...);
if (logisticsCause) {
	const logisticsPlan = makeBoundedLogisticsPlan(...);
	if (logisticsPlan) return logisticsPlan;
}

return makeExistingLocalPlan(...);
```

Delete `activeOutboundRouteIds` and `logistics-contention-not-modeled`; no alias.

#### GREEN — Economics and Tier Semantics

- [ ] **Step 8: Compute complete economics for normal logistics actions**

```text
importSpendReduction30 = baselineImportSpend30 - candidateImportSpend30
incrementalTransportCost30 = candidateTransportCost30 - baselineTransportCost30
netCashBenefit30 = importSpendReduction30 - incrementalTransportCost30 - knownUpfrontCost
```

For create/edit/resume/source-change, `knownUpfrontCost = 0`.

Normal logistics candidate blocks fallback only when:

```ts
candidate.comparison.shortageReduction30 > 0 &&
candidate.comparison.netCashBenefit30 !== null &&
candidate.comparison.netCashBenefit30 > 0
```

City warehouse remains the documented prerequisite exception.

- [ ] **Step 9: Preserve existing `viabilityTier`**

Do not rewrite it. Positive complete route/source actions naturally return tier 4; non-positive complete actions remain tier 1 and fail the value gate; warehouse remains tier 1 prerequisite.

Extend `compareCandidates` only after current tier/benefit/shortage/import/stockout fields:

```ts
right.comparison.firstShortageImprovementDays - left.comparison.firstShortageImprovementDays ||
right.comparison.projectedDeliveredUnits30 - left.comparison.projectedDeliveredUnits30 ||
left.comparison.incrementalTransportCost30 - right.comparison.incrementalTransportCost30 ||
compareCodeUnits(actionKey(left.action), actionKey(right.action))
```

Delivered units are populated only as evidence and never substitute for shortage/import improvement.

- [ ] **Step 10: Extend stable `actionKey`**

Implement exactly:

```text
build-warehouse:${cityId}
create-route:${origin}:${destination}:${material}:${capacity}:${frequency}:${leadTime}:${cost}:${priority}
edit-route:${routeId}:${field}:${to}
resume-route:${routeId}
change-supply-source:${retailCityId}:${toSupplyCityId}
```

Keep current build-producer/upgrade/connect-rail/no-op keys unchanged except the intentional city-scoped warehouse break.

- [ ] **Step 11: Keep all candidate projections behind `projectSupplySnapshot`**

Do not add `projectLogisticsCandidate` or bypass the entry point. Existing producer/upgrade/warehouse candidate calls and new route/source candidates all call `projectSupplySnapshot(candidateSnapshot)`.

- [ ] **Step 12: Run focused planner/action tests**

```bash
bun run test:unit -- \
  src/lib/game/supplyPlanner.spec.ts \
  src/lib/game/supplyPlannerActions.spec.ts \
  --run --project server
bun run check
bun run lint
```

Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add \
  src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts \
  src/lib/game/supplyPlannerActions.ts src/lib/game/supplyPlannerActions.spec.ts
git commit -m "feat(supply): rank bounded logistics actions"
```

---

### Task 4: Wire Handoffs and Put Route-Preset State Logic in the Existing Pure View-Model

**Files:**
- Modify: `src/lib/components/game/logisticsPanel.ts`
- Modify: `src/lib/components/game/logisticsPanel.spec.ts`
- Modify: `src/lib/components/game/LogisticsPanel.svelte`
- Modify: `src/lib/components/game/LogisticsPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/RetailSupplySources.svelte`
- Modify: `src/lib/components/game/RetailSupplySources.svelte.spec.ts`
- Modify: `src/routes/supplyPlannerRoute.ts`
- Modify: `src/routes/supplyPlannerRoute.spec.ts`
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/page.svelte.spec.ts`

**Interfaces:**

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

#### RED — Pure Preset Behavior

- [ ] **Step 1: Test numeric→form conversion in `logisticsPanel.spec.ts`**

```ts
const preset: RecurringRouteInput = {
	originCityId: 'breadbasket-basin',
	destinationCityId: 'industry-city',
	materialId: 'grain',
	capacity: 12,
	frequencyDays: 1,
	leadTimeDays: 2,
	transportCostPerUnit: 2,
	priority: 0
};

const applied = applyRoutePreset(emptyRouteForm(), preset, null);
expect(applied.values.capacity).toBe('12');
expect(applied.values.leadTimeDays).toBe('2');
```

Then mutate `applied.values.capacity` to `'9'`, call the helper with the same preset/key, and assert `'9'` is preserved. A different preset key must apply new values.

Run:

```bash
bun run test:unit -- src/lib/components/game/logisticsPanel.spec.ts --run --project server
```

Expected: FAIL until helper exists.

#### RED — Component Uses Pure Helper Without Auto-Submit

- [ ] **Step 2: Add thin component tests**

Assert a preset:

```text
appears in current existing form
focuses form
never calls onCreateRecurringRoute during apply
same preset rerender does not overwrite user edits
distinct preset applies again
```

Do not duplicate conversion/apply-once matrix already tested in server view-model tests.

#### RED — Close/Open/Focus Ordering

- [ ] **Step 3: Extend `SupplyPlannerHandoffHost` tests**

Host exposes explicit destination actions:

```ts
openLogistics(routeId: string | null, preset: RecurringRouteInput | null): void;
openStores(retailCityId: WorldCityId): void;
```

Spy call order for `create-route`:

```ts
expect(calls).toEqual([
	'closeOverlays',
	'openLogistics:preset'
]);
```

For `resume-route` / `edit-route`:

```ts
expect(calls).toEqual([
	'closeOverlays',
	'openLogistics:route-2'
]);
```

For source:

```ts
expect(calls).toEqual([
	'closeOverlays',
	'openStores:harbor-city'
]);
```

Warehouse must close, switch to `action.cityId`, then arm placement.

#### GREEN — View-Model Preset Helper

- [ ] **Step 4: Implement `routePresetKey` + `applyRoutePreset` in `logisticsPanel.ts`**

Use a stable key from every typed preset field. On same key, return current values untouched. On new key, return string-converted fields.

- [ ] **Step 5: Keep component thin**

`LogisticsPanel.svelte` stores `appliedRoutePresetKey`. On preset change, call the pure helper and assign returned field values/key once. Existing `submitRoute` remains the only create/update command path.

#### GREEN — Route-Local Destination State

- [ ] **Step 6: Extend `openLogisticsManagement` rather than create a new router/store**

A minimal route-local shape is acceptable:

```ts
function openLogisticsManagement(
	routeId: string | null = null,
	preset: RecurringRouteInput | null = null
): void {
	openManagementPanel('logistics');
	focusedLogisticsRouteId = routeId;
	logisticsRoutePreset = preset;
}
```

`closePlannerOverlays()` runs before this function from planner handoff, so it cannot clobber the new focus/preset.

Existing non-planner callers can continue passing only route ID/null.

- [ ] **Step 7: Add source focus only**

`focusedRetailSupplyCityId` is route-local. `RetailSupplySources` scrolls/focuses the matching row/select and never calls `onChange` because focus changed.

- [ ] **Step 8: Re-check action availability immediately before handoff**

If route/source capability is stale/unavailable, handoff is a no-op and no panel state is changed after close.

- [ ] **Step 9: Run focused server/client tests**

```bash
bun run test:unit -- \
  src/lib/components/game/logisticsPanel.spec.ts \
  src/routes/supplyPlannerRoute.spec.ts \
  --run --project server
bun run test:unit -- \
  src/lib/components/game/LogisticsPanel.svelte.spec.ts \
  src/lib/components/game/RetailSupplySources.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  src/routes/page.svelte.spec.ts \
  --run --project client
bun run check
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add \
  src/lib/components/game/logisticsPanel.ts src/lib/components/game/logisticsPanel.spec.ts \
  src/lib/components/game/LogisticsPanel.svelte src/lib/components/game/LogisticsPanel.svelte.spec.ts \
  src/lib/components/game/RetailSupplySources.svelte src/lib/components/game/RetailSupplySources.svelte.spec.ts \
  src/routes/supplyPlannerRoute.ts src/routes/supplyPlannerRoute.spec.ts \
  src/routes/ManagementPanelHost.svelte src/routes/ManagementPanelHost.svelte.spec.ts \
  src/routes/+page.svelte src/routes/page.svelte.spec.ts
git commit -m "feat(supply): hand off logistics recommendations"
```

---

### Task 5: Surface Route-Aware Evidence with Existing Logistics Vocabulary

**Files:**
- Modify: `src/lib/components/game/SupplyAdvisor.svelte`
- Modify: `src/lib/components/game/SupplyAdvisor.svelte.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/i18n/locales.spec.ts`

#### RED

- [ ] **Step 1: Add component evidence tests**

Cover:

```text
configured supply city
integer logistics-visible current warehouse stock/capacity
current in-transit row from selectInTransitInventory vocabulary
route next dispatch + 7/30 projected delivered units + transport cost
RouteOperationalCondition-aligned destination-full/origin-stock-constrained/route-capacity-constrained copy
planner-only route-paused/route-frequency/route-lead-time/route-priority-constrained/destination-configuration copy
remote-origin-production-not-modeled only when present
baseline-vs-candidate shortage/import/delivery/cost changes
city-scoped warehouse target
new action labels
```

Assert old strings/keys for `active-logistics-not-modeled` and `logistics-contention-not-modeled` are absent once implementation references are removed.

- [ ] **Step 2: Add locale parity tests**

Every new `supplyAdvisor` key exists in EN, JA, zh-Hant. Use existing number/day/currency/list helpers; do not embed English `/ day` or `/ unit` suffixes.

Run:

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts --run --project client
bun run test:unit -- src/lib/i18n/locales.spec.ts --run --project server
```

Expected: FAIL until new copy is implemented.

#### GREEN

- [ ] **Step 3: Add one compact Logistics evidence section to `SupplyAdvisor.svelte`**

Do not embed/reimplement `LogisticsPanel`. Reuse current plan/evidence/candidate presentation structures.

- [ ] **Step 4: Reuse current day-zero in-transit selector output**

The route/controller layer can supply current `selectInTransitInventory(game)` evidence or the planner can attach the selector result at snapshot build time; do not duplicate its grouping implementation.

- [ ] **Step 5: Add localized condition/action/metric strings in all three catalogs**

Align overlapping names with `RouteOperationalCondition`.

- [ ] **Step 6: Run component/localization/static gates**

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts --run --project client
bun run test:unit -- src/lib/i18n/locales.spec.ts --run --project server
bun run check
bun run lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add \
  src/lib/components/game/SupplyAdvisor.svelte src/lib/components/game/SupplyAdvisor.svelte.spec.ts \
  src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts \
  src/lib/i18n/locales.spec.ts
git commit -m "feat(supply): show logistics forecast evidence"
```

---

### Task 6: Verify the Player Lifecycle and Full Regression Surface

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify only if HPA-297 regression requires it: files already owned by Tasks 1–5

#### E2E RED

- [ ] **Step 1: Add deterministic current-schema save fixture**

Fixture contains:

```text
selected retail category with destination shortage
configured selected supply city
another opened industry city with positive whole stock of shortage material
no useful inbound route
enough cash and route-management capability
```

- [ ] **Step 2: Add one browser lifecycle**

```text
1. open Supply Advisor
2. assert route-aware destination-configuration evidence
3. choose create-route recommendation
4. assert Logistics opens with proposed form values
5. assert no route exists yet
6. edit one prefilled value to prove normal form ownership
7. explicitly submit existing HPA-574 form
8. assert route exists through normal controller/autosave boundary
9. close Logistics and reopen Supply Advisor
10. assert category/horizon retained and route evidence updated
```

Run:

```bash
bunx playwright test src/routes/retail-sim.e2e.ts -g "supply planner logistics"
```

Expected: FAIL before final wiring is complete.

#### GREEN / Focused Regression

- [ ] **Step 3: Fix only HPA-297 wiring exposed by the E2E and rerun it**

- [ ] **Step 4: Run all touched live logistics suites again**

```bash
bun run test:unit -- \
  src/lib/game/cityInventory.spec.ts \
  src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/interCityLogistics.integration.spec.ts \
  src/lib/game/interCityLogistics.invariants.spec.ts \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/supplyPlannerLogistics.spec.ts \
  src/lib/game/supplyPlanner.spec.ts \
  src/lib/game/supplyPlannerActions.spec.ts \
  src/lib/components/game/logisticsPanel.spec.ts \
  src/routes/supplyPlannerRoute.spec.ts \
  --run --project server
```

- [ ] **Step 5: Run focused client suites**

```bash
bun run test:unit -- \
  src/lib/components/game/SupplyAdvisor.svelte.spec.ts \
  src/lib/components/game/LogisticsPanel.svelte.spec.ts \
  src/lib/components/game/RetailSupplySources.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  src/routes/page.svelte.spec.ts \
  --run --project client
```

- [ ] **Step 6: Run static/build gates**

```bash
bun run check
bun run lint
bun run build
git diff --check main...HEAD
```

- [ ] **Step 7: Run complete unit and browser suites**

```bash
bun run test:unit -- --run
bun run test:e2e
```

#### Scope / Symbol Audits

- [ ] **Step 8: Confirm no persistence/schema change**

```bash
git diff --name-only main...HEAD | grep -E 'saveCodec|saveTypes|saveRepository|migration' && exit 1 || true
```

- [ ] **Step 9: Confirm obsolete guards are gone from non-test production code**

```bash
rg "activeOutboundRouteIds|active-logistics-not-modeled|logistics-contention-not-modeled" \
  src \
  -g '!*.spec.ts' \
  -g '!*.test.ts'
```

Expected: no production-code match.

- [ ] **Step 10: Confirm no parallel route/order/preset types were introduced**

```bash
rg "SupplyPlannerTransferSnapshot|SupplyPlannerRouteSnapshot|LogisticsRoutePreset" src
```

Expected: no match.

- [ ] **Step 11: Confirm route comparator reuse**

```bash
rg "compareCurrentRoutes" src/lib/game/logisticsReadModels.ts
```

Expected: no match.

- [ ] **Step 12: Review final diff for architecture/performance boundaries**

Confirm:

```text
projectSupplySnapshot is the only baseline/candidate projection entry point
allocateCapacityByBranch / rail reachability are not called from inside the 30-day loop
selected expected inventory never becomes CityInventory
remote city snapshot excludes snapshot.supplyCityId
normal logistics actions require positive value before blocking local fallback
warehouse prerequisite exception is destination-full only
no remote production recursion
no HPA-296 modifier implementation
```

- [ ] **Step 13: Commit final lifecycle/cleanup changes**

```bash
git add src/routes/retail-sim.e2e.ts
git commit -m "test(supply): cover logistics planner lifecycle"
```

---

## Definition of Done

- [ ] HPA-281 no longer suppresses recommendations merely because active logistics exists.
- [ ] `projectSupplySnapshot` internally chooses closed-form vs integrated trace; existing baseline/candidate call sites do not fork projection architecture.
- [ ] No-logistics public projection output remains pinned to HPA-281 behavior.
- [ ] Dated arrivals cannot retroactively repair earlier shortages.
- [ ] Selected expected-value inventory remains fractional-capable and separate from integer `CityInventory` route stock.
- [ ] Expected→route crossing uses exported existing `canonicalQuantity` behavior and warehouse used remains integer/live-compatible.
- [ ] Selected city is not duplicated in remote logistics snapshot state.
- [ ] Reservation sum, destination need, dispatch quantity, and route ordering reuse HPA-294 contracts.
- [ ] One-day parity plus live integration/invariant suites protect route lifecycle behavior.
- [ ] `RecurringRouteInput` uses `WorldCityId` / `MaterialId` IDs while runtime validation remains intact.
- [ ] Create-route candidate capacity is always a positive safe integer.
- [ ] No-demand and missing-producer guards run before logistics diagnosis.
- [ ] Overlapping planner condition copy reuses `RouteOperationalCondition` terminology.
- [ ] Normal logistics actions must reduce shortage and have positive complete net benefit; otherwise planner falls through once to existing local HPA-281 action logic.
- [ ] Warehouse remains an isolated HPA-281-style destination-capacity prerequisite and does not receive invented ROI.
- [ ] `actionKey` is stable for every new arm and distinguishes city-scoped warehouses.
- [ ] Existing `viabilityTier` remains the first comparator dimension.
- [ ] Branch/reachability preparation is hoisted outside the 30-day loop and the representative warmed planner smoke stays under 2,000 ms.
- [ ] Route preset conversion/apply-once behavior lives in `logisticsPanel.ts`; component never auto-submits or overwrites edits on same preset.
- [ ] Handoffs close first, then open/focus the target panel.
- [ ] Route/source/warehouse recommendations mutate only through existing player-confirmed UI.
- [ ] Category/horizon context survives handoff/reopen.
- [ ] No save schema, migration, compatibility layer, optimizer, generic scheduler, recursive remote planner, or HPA-296 implementation is added.
- [ ] Focused tests, live logistics integration/invariant suites, full unit suite, static gates, build, targeted lifecycle E2E, and full E2E pass.