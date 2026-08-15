# City-Local Logistics Supply Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the HPA-281 Supply Planner with deterministic dated logistics while preserving the existing no-logistics projection, recommendation architecture, and player-confirmed mutation boundaries.

**Architecture:** `buildSupplyPlan` remains the only public planner entry point. No-logistics snapshots continue through today's `projectSupplySnapshot`. When logistics matters, `supplyPlanner.ts` runs one 30-day trace that interleaves HPA-294-compatible arrivals/route dispatch with a one-day HPA-281 expected-value step for the selected supply city; `supplyPlannerLogistics.ts` owns copied logistics state and pure route-day mechanics, not an independent horizon planner. Logistics diagnosis generates one bounded candidate family and falls through to the existing HPA-281 local path only when that family has no viable candidate.

**Tech Stack:** TypeScript 6, Svelte 5, Vitest 4 server/client projects, Playwright, existing HPA-281/HPA-294/HPA-574 contracts.

## Global Constraints

- No `simulateDay` replay, RNG, reports, save writes, or autosave in planner code.
- No generic scheduler, optimizer, DSL, causal graph, event bus, or planner store.
- No remote production recursion. Remote origins use copied inventory + projected arrivals/dispatches only.
- Selected supply city runs its HPA-281 one-day expected-value step before due-route dispatch.
- No HPA-296 event/disruption implementation; later effective route values enter at the snapshot boundary.
- No persistence/save-schema change.
- No compatibility alias for `activeOutboundRouteIds` or `logistics-contention-not-modeled`.
- Preserve the current no-logistics public `projectSupplySnapshot` behavior exactly.
- Preserve HPA-294 priority/raw-ID order, arrival reservation, zero-attempt cadence advancement, dispatch quantity, lead time, and cost behavior.
- Reuse `CityInventory`, `TransferOrder`, `RecurringRoute`, and `RecurringRouteInput`; do not add parallel payload types.
- Preserve `viabilityTier` as the first ranking dimension.
- Every recommendation remains non-mutating until explicit player confirmation in existing UI.
- New/changed branches must remain covered by the repository's 95% Codecov policy.

## File Structure

- `src/lib/game/interCityLogistics.ts` — live HPA-294 owner; expose only destination-need and dispatch-quantity arithmetic.
- `src/lib/game/supplyPlannerLogistics.ts` — new planner-only copied logistics state plus pure arrive/dispatch-one-day helpers and route/city evidence.
- `src/lib/game/supplyPlanner.ts` — selected-category local material model, no-logistics closed-form path, integrated 30-day logistics path, bottleneck evidence.
- `src/lib/game/supplyPlannerActions.ts` — bounded candidate generation, one local fallback, economics, existing ranking extension.
- `src/routes/supplyPlannerRoute.ts` — recommendation handoff only; never mutation commands.
- Existing `SupplyAdvisor`, `LogisticsPanel`, `RetailSupplySources`, `ManagementPanelHost`, and `+page.svelte` remain the concrete UI/composition owners.

## Risks to keep visible while implementing

- **Future-arrival backward credit:** never pass day-N arrivals into a lumped horizon as starting inventory.
- **Selected-city outbound false uncertainty:** selected-city local step must happen before route dispatch so its own projected stock is not treated as remote unknown production.
- **Live/planner route drift:** due selection, zero attempts, reservation release, schedule advancement, and safe arithmetic are pinned by one-day parity before candidate work.
- **Stale warehouse used:** recompute from copied material quantities after arrivals, selected-city local step, and dispatches.
- **Preset overwrite:** route form proposal is applied once per stable preset key; rerenders cannot reset player edits.

---

### Task 1: Share HPA-294 arithmetic and pin one-day route parity

**Files:**
- Modify: `src/lib/game/interCityLogistics.ts`
- Modify: `src/lib/game/interCityLogistics.spec.ts`
- Create: `src/lib/game/supplyPlannerLogistics.ts`
- Create: `src/lib/game/supplyPlannerLogistics.spec.ts`

**Interfaces:**
- Produces:

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

export interface SupplyPlannerLogisticsCitySnapshot {
	inventory: Readonly<CityInventory>;
	warehouseCapacity: number;
}

export interface SupplyPlannerLogisticsSnapshot {
	currentDay: number;
	cities: readonly SupplyPlannerLogisticsCitySnapshot[];
	inTransitOrders: readonly Readonly<TransferOrder>[];
	routes: readonly Readonly<RecurringRoute>[];
	nextRouteSequence: number;
}
```

- `supplyPlannerLogistics.ts` may expose pure one-day arrive/dispatch helpers for Task 2, but no 30-day public planner entry point.

- [ ] **Step 1: Write failing helper extraction tests**

In `interCityLogistics.spec.ts`, add cases that pin:

```ts
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

Also cover zero/overflow boundaries.

- [ ] **Step 2: Run RED helper tests**

```bash
bun run test:unit -- src/lib/game/interCityLogistics.spec.ts --run --project server
```

Expected: FAIL because the helper exports do not exist.

- [ ] **Step 3: Extract exactly the two helpers**

Make `getDestinationTransferNeed(game, cityId)` delegate to the first helper and replace the live route `Math.min(...)` with `getRecurringDispatchQuantity`. Leave `compareRecurringRoutes`, due-route filtering, order creation, zero-attempt evidence, schedule advancement, and cost handling structurally unchanged.

- [ ] **Step 4: Add planner one-day route mechanics and the parity fixture**

In `supplyPlannerLogistics.spec.ts`, build one fixture with:

- one due in-transit order;
- two active due routes contending for the same destination headroom or origin stock;
- one route that yields a zero-quantity attempt;
- no selected-city local-flow change during the compared phase.

The live side runs:

```ts
const arrived = processTransferArrivals(game);
const live = processRecurringRouteDispatches(arrived.game);
```

The planner side starts from copied `CityInventory[]`, in-transit `TransferOrder[]`, and `RecurringRoute[]`, then applies its pure arrive + dispatch-one-day helpers.

Assert equality/parity for:

```ts
{
	inventories,
	reservedInTransitByDestination,
	attemptOrderAndQuantities,
	zeroAttemptCount,
	nextDispatchOnDayByRoute,
	newOrderArrivalDays,
	scheduledTransportCost
}
```

- [ ] **Step 5: Run RED parity test**

```bash
bun run test:unit -- src/lib/game/supplyPlannerLogistics.spec.ts --run --project server
```

Expected: FAIL until the planner helpers exist.

- [ ] **Step 6: Implement the minimal pure route-day helpers**

Planner helpers must:

```text
arrivals: add quantity → mark/remove reservation
routes: filter active+due → compareRecurringRoutes → destination need → whole-unit quantity
non-zero: remove origin + append projected TransferOrder
zero: evidence only
all due attempts: nextDispatchOnDay = day + frequencyDays
```

Use the two shared arithmetic helpers. Match HPA-294 safe-integer cost behavior; do not create a generic scheduler abstraction.

- [ ] **Step 7: Run GREEN tests and static check**

```bash
bun run test:unit -- src/lib/game/interCityLogistics.spec.ts src/lib/game/supplyPlannerLogistics.spec.ts --run --project server
bun run check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/game/interCityLogistics.ts src/lib/game/interCityLogistics.spec.ts src/lib/game/supplyPlannerLogistics.ts src/lib/game/supplyPlannerLogistics.spec.ts
git commit -m "refactor(logistics): share planner route arithmetic"
```

---

### Task 2: Build the integrated selected-city 30-day trace

**Files:**
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`
- Modify: `src/lib/game/supplyPlannerLogistics.ts`
- Modify: `src/lib/game/supplyPlannerLogistics.spec.ts`

**Interfaces:**
- Consumes Task 1 logistics snapshot and one-day route helpers.
- Produces one integrated projection path used by `buildSupplyPlan` when logistics is relevant.
- No-logistics inputs continue to call today's `projectSupplySnapshot` behavior.

- [ ] **Step 1: Pin current no-logistics output before refactoring**

Add a fixture with no routes/in-transit orders and assert the public projection's existing:

```ts
{
	materials: projection.materials,
	warehouse: projection.warehouse,
	bottleneck: projection.bottleneck,
	limitations: projection.limitations
}
```

Do not update expected values after implementation except for removal of the intentionally obsolete active-logistics-only contract from logistics cases.

- [ ] **Step 2: Add RED dated-arrival and selected-outbound tests**

Add cases proving:

```text
inbound arrivalOnDay=20 cannot prevent a day-5 shortage/import
inbound arrival can reduce shortage/import after day 20
selected supply city local expected-value step runs before its outbound due route
selected-city outbound uses the post-local-step stock rather than day-zero stock
selected-city outbound does not emit remote-origin-production-not-modeled solely because day-zero stock is exhausted
```

Also add raw/intermediate arrival coverage that preserves the current warehouse-connected processor caps.

- [ ] **Step 3: Run RED projection tests**

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerLogistics.spec.ts --run --project server
```

Expected: new logistics cases FAIL with the current closed-form-only implementation.

- [ ] **Step 4: Refactor the existing material math to expose a one-day step without adding a second allocator**

Keep current branch/reachability allocation ownership. Add a private one-day result shape:

```ts
interface SupplyMaterialDayStep {
	materialId: MaterialId;
	startingInventoryUnits: number;
	localAvailableUnits: number;
	importRequiredUnits: number;
	endingInventoryUnits: number;
}
```

For raw/intermediate flow with processor data, reuse:

```ts
localSupplyOverHorizon(allocation, 1, currentInventory)
```

For finished/fallback cases, reuse/refactor the same formulas currently used by `horizonProjection` so one-day and 7/30 semantics cannot diverge.

- [ ] **Step 5: Build `SupplyPlannerSnapshot.logistics` from existing domain types**

Snapshot:

```ts
{
	currentDay: game.day,
	cities: openedIndustryCities.map((city) => ({
		inventory: structuredClone(authoritativeCityInventory),
		warehouseCapacity: getCityInventoryStats(game, city.id).capacity
	})),
	inTransitOrders: structuredClone(game.logistics.transferOrders.filter((order) => order.status === 'in-transit')),
	routes: structuredClone(game.logistics.recurringRoutes),
	nextRouteSequence: game.logistics.nextRouteSequence
}
```

Delete `activeOutboundRouteIds`; do not add `SupplyPlannerTransferSnapshot` or `SupplyPlannerRouteSnapshot`.

- [ ] **Step 6: Implement the integrated 30-day loop in `supplyPlanner.ts`**

For each day:

```text
1. apply due copied TransferOrder arrivals
2. project one HPA-281 day for selected-city required materials using current copied inventory
3. write each required material's endingInventoryUnits back to selected copied CityInventory
4. recompute selected warehouse used from copied material quantities
5. dispatch due copied RecurringRoute values with Task 1 helpers/order
6. recompute affected city used/reservations as needed
7. record day evidence
```

Remote cities skip step 2 and change only through arrivals/dispatches.

7-day metrics are derived from the first seven trace days; 30-day metrics from all thirty. Do not run an independent seven-day schedule.

- [ ] **Step 7: Preserve the old fast path**

If the selected plan has no logistics facts that can affect the required-material projection, call the existing closed-form `projectSupplySnapshot` path. The no-logistics regression from Step 1 must pass without changing expected values.

- [ ] **Step 8: Add precise remote-origin limitation**

Emit `remote-origin-production-not-modeled` only when a required-material route from a non-selected origin becomes stock-constrained and a throughput recommendation would need unmodeled replenishment. Do not emit it for selected-city origins.

- [ ] **Step 9: Run GREEN tests**

```bash
bun run test:unit -- src/lib/game/supplyPlannerLogistics.spec.ts src/lib/game/supplyPlanner.spec.ts --run --project server
bun run check
bun run lint
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerLogistics.ts src/lib/game/supplyPlannerLogistics.spec.ts
git commit -m "feat(supply): interleave logistics with daily forecasts"
```

---

### Task 3: Add logistics diagnosis, bounded candidates, and local fallback

**Files:**
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`
- Modify: `src/lib/game/supplyPlannerActions.ts`
- Modify: `src/lib/game/supplyPlannerActions.spec.ts`

**Interfaces:**
- Extends `SupplyBottleneck`/planner evidence with logistics causes.
- Extends `SupplyPlannerActionAvailability` with:

```ts
canManageLogistics: boolean;
canSetRetailSupplySource: boolean;
```

- Extends `SupplyPlannerAction` with existing-domain payloads:

```ts
| { kind: 'build-warehouse'; cityId: WorldCityId; buildingTypeId: 'warehouse'; cost: number }
| { kind: 'create-route'; input: RecurringRouteInput }
| { kind: 'edit-route'; routeId: string; field: 'capacity' | 'frequencyDays' | 'priority'; from: number; to: number }
| { kind: 'resume-route'; routeId: string }
| { kind: 'change-supply-source'; retailCityId: WorldCityId; fromSupplyCityId: WorldCityId; toSupplyCityId: WorldCityId }
```

- Extends `SupplyPlannerComparison` with:

```ts
projectedDeliveredUnits7: number;
projectedDeliveredUnits30: number;
incrementalTransportCost30: number;
firstShortageImprovementDays: number;
```

- [ ] **Step 1: Write RED bottleneck tests**

Cover exactly:

```text
paused matching route -> route-paused
full/reserved destination -> route-destination-capacity
origin stock binds -> origin-inventory
capacity with unmet destination need -> route-capacity
post-first-arrival gap -> route-frequency
first arrival after initial shortage -> route-lead-time
no useful inbound route + stocked opened origin -> destination-configuration
no logistics explanation -> current HPA-281 local bottleneck
```

Assert city/route/material/day/amount evidence where applicable.

- [ ] **Step 2: Write RED bounded candidate tests**

Pin:

```text
resume -> max(nextDispatchOnDay, currentDay)
capacity -> current + ceil(peakUnmet), one candidate only
frequency -> max(1, current - 1), one candidate only
priority -> blockerPriority - 1 only when >= 0 and actually precedes blocker
create -> one per stocked open origin, quoteInterCityRates, frequency=1, priority=0
create input type -> RecurringRouteInput
hypothetical ID -> route-${nextRouteSequence}
source -> cloned assignment only, nested candidate generation disabled
warehouse -> action.cityId is bottleneck city
remote unknown -> larger/faster route requiring absent remote stock is rejected
```

- [ ] **Step 3: Write RED local-fallback tests**

Create at least two cases:

```text
logistics bottleneck diagnosed + route management unavailable + feasible existing local producer/upgrade action -> local action returned
logistics bottleneck diagnosed + route candidate blocked by remote-origin-production-not-modeled + useful local action -> local action returned
```

Assert the planner does not merge logistics and local candidates into one global pool.

- [ ] **Step 4: Write RED ranking regression tests**

Pin current `viabilityTier` behavior before adding logistics fields:

```text
unknown-ROI rail candidate still outranks known-negative rail-ready candidate
positive complete still outranks lower tiers
```

Then add logistics comparison expectations:

```text
netCashBenefit30 = avoidedImportSpend - incrementalTransportCost - knownUpfrontCost
new delivery fields default to 0 for old local candidates
new logistics tie-breaks do not replace viabilityTier
moving stock without reducing shortage/import can select no-op
transport cost greater than avoided import value can select no-op
```

- [ ] **Step 5: Run RED domain/action tests**

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts --run --project server
```

Expected: new unions/actions/fallbacks are missing.

- [ ] **Step 6: Implement evidence-first logistics diagnosis**

Use the design order and keep `remote-origin-production-not-modeled` as a limitation, not a bottleneck.

- [ ] **Step 7: Implement one-family logistics generation plus one local fallback**

Control flow in `makePlan` should remain explicit:

```ts
const logisticsCause = diagnoseLogistics(...);
if (logisticsCause) {
	const logistics = generateBoundedLogisticsCandidates(...);
	const viable = logistics.candidates.filter(candidateIsViable);
	if (viable.length > 0) return chooseWithinFamily(viable);
}
return makeExistingLocalPlan(...);
```

Do not create a combined optimizer pool.

- [ ] **Step 8: Extend comparison and `compareCandidates` without replacing `viabilityTier`**

Keep the existing comparator prefix:

```ts
rightTier - leftTier || compareBenefit || shortage30 || shortage7 || importReduction || ...
```

Append first-shortage/delivery/transport evidence after existing viability/benefit/shortage/import semantics. Keep stable `actionKey` final.

- [ ] **Step 9: Add immutability assertions**

For each logistics family, deep-clone before planning and assert unchanged after:

```ts
game
logistics.transferOrders
logistics.recurringRoutes
logistics.nextTransferSequence
logistics.nextRouteSequence
reports
rngState
```

- [ ] **Step 10: Run GREEN tests and static checks**

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts --run --project server
bun run check
bun run lint
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.ts src/lib/game/supplyPlannerActions.spec.ts
git commit -m "feat(supply): rank bounded logistics actions"
```

---

### Task 4: Wire handoffs after overlay clearing

**Files:**
- Modify: `src/routes/supplyPlannerRoute.ts`
- Modify: `src/routes/supplyPlannerRoute.spec.ts`
- Modify: `src/lib/components/game/LogisticsPanel.svelte`
- Modify: `src/lib/components/game/LogisticsPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/RetailSupplySources.svelte`
- Modify: `src/lib/components/game/RetailSupplySources.svelte.spec.ts`
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/page.svelte.spec.ts`

**Interfaces:**
- Reuse `RecurringRouteInput` for route form preset.
- Route-local state:

```ts
let logisticsRoutePreset: RecurringRouteInput | null = $state(null);
let logisticsRoutePresetKey: string | null = $state(null);
let focusedRetailSupplyCityId: WorldCityId | null = $state(null);
```

- Extend `SupplyPlannerHandoffHost` with explicit UI-open methods rather than command methods, e.g.:

```ts
openLogisticsManagement(input: {
	focusedRouteId?: string;
	routePreset?: RecurringRouteInput;
	routePresetKey?: string;
}): void;
openStoresManagement(focusedRetailCityId: WorldCityId): void;
```

- [ ] **Step 1: Write RED handoff ordering tests**

In `supplyPlannerRoute.spec.ts`, record host call order and assert:

```text
edit/resume: closeOverlays -> openLogisticsManagement(focusedRouteId)
create: closeOverlays -> openLogisticsManagement(routePreset + stable key)
source: closeOverlays -> openStoresManagement(retailCityId)
warehouse: closeOverlays -> switchToSupplyCity(action.cityId) -> armIndustryPlacement('warehouse')
```

Also assert stale availability returns without UI/mutation action.

- [ ] **Step 2: Run RED route tests**

```bash
bun run test:unit -- src/routes/supplyPlannerRoute.spec.ts --run --project server
```

Expected: FAIL because host methods/actions are not wired.

- [ ] **Step 3: Write RED `LogisticsPanel` preset tests**

Pass `RecurringRouteInput` + key and assert:

```text
all existing create-route fields are seeded
existing route form receives focus
no create callback is called on preset application
same key rerender does not overwrite user-edited capacity/frequency/etc.
new key applies a later proposal once
```

Do not define a second route payload interface.

- [ ] **Step 4: Write RED retail-source focus tests**

Add optional `focusedRetailCityId`; focus/scroll the existing row/select and assert focus itself never calls `onChange`.

- [ ] **Step 5: Implement route-local state and post-close ordering**

`closePlannerOverlays()` may continue clearing current panel/focus. The handoff must set the destination panel/focus **after** that call. Do not weaken the general cleanup behavior merely to support HPA-297.

- [ ] **Step 6: Keep planner context**

Do not reset `SupplyPlannerUiContext.categoryId` or `.horizonDays` while closing/opening destination UI.

- [ ] **Step 7: Run GREEN route/component tests**

```bash
bun run test:unit -- src/routes/supplyPlannerRoute.spec.ts --run --project server
bun run test:unit -- src/lib/components/game/LogisticsPanel.svelte.spec.ts src/lib/components/game/RetailSupplySources.svelte.spec.ts src/routes/ManagementPanelHost.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client
bun run check
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/routes/supplyPlannerRoute.ts src/routes/supplyPlannerRoute.spec.ts src/lib/components/game/LogisticsPanel.svelte src/lib/components/game/LogisticsPanel.svelte.spec.ts src/lib/components/game/RetailSupplySources.svelte src/lib/components/game/RetailSupplySources.svelte.spec.ts src/routes/ManagementPanelHost.svelte src/routes/ManagementPanelHost.svelte.spec.ts src/routes/+page.svelte src/routes/page.svelte.spec.ts
git commit -m "feat(supply): hand off logistics recommendations"
```

---

### Task 5: Surface route-aware evidence and localization

**Files:**
- Modify: `src/lib/components/game/SupplyAdvisor.svelte`
- Modify: `src/lib/components/game/SupplyAdvisor.svelte.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/i18n/locales.spec.ts`

**Interfaces:**
- Consumes integrated projection/evidence/actions from Tasks 2–3.
- Produces no new domain state.

- [ ] **Step 1: Write RED component tests**

Cover:

```text
configured supply city + warehouse stock/capacity
in-transit quantity + earliest arrival
route state/next dispatch/7-day + 30-day delivery/transport cost
paused/capacity/frequency/lead-time/origin/destination bottleneck copy
remote-origin limitation only when present
create/edit/resume/source action labels
baseline-vs-action shortage/import/delivery/transport delta
city-scoped warehouse target context
no active-logistics-not-modeled or logistics-contention-not-modeled copy
```

- [ ] **Step 2: Write RED locale parity tests**

Every new `supplyAdvisor` key must exist in EN/JA/zh-Hant. Keep day/currency/list and `/ day` / `/ unit` formatting through current helpers.

- [ ] **Step 3: Run RED UI/i18n tests**

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts --run --project client
bun run test:unit -- src/lib/i18n/locales.spec.ts --run --project server
```

Expected: FAIL on missing evidence/copy.

- [ ] **Step 4: Implement one compact logistics section**

Extend the current Supply Advisor layout; do not embed `LogisticsPanel`, add charts, or add another modal/store.

- [ ] **Step 5: Remove obsolete HPA-281 guard copy**

Delete old localization keys only after all code/tests stop referencing them.

- [ ] **Step 6: Run GREEN tests/static checks**

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts --run --project client
bun run test:unit -- src/lib/i18n/locales.spec.ts --run --project server
bun run check
bun run lint
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/game/SupplyAdvisor.svelte src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts src/lib/i18n/locales.spec.ts
git commit -m "feat(supply): show logistics forecast evidence"
```

---

### Task 6: Add browser lifecycle and run final verification

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify only for HPA-297 regressions: files already listed in Tasks 1–5

- [ ] **Step 1: Add deterministic RED E2E fixture**

Inject current-schema state with:

```text
selected retail category shortage
configured destination supply city
second opened industry city with current shortage-material stock
no useful inbound route
enough cash and route-management capability
```

- [ ] **Step 2: Add shortage → route → explicit submit → reopen lifecycle**

```text
1. open Supply Advisor
2. assert route-aware diagnosis
3. click recommended create-route action
4. assert Logistics opens with RecurringRouteInput fields prefilled
5. assert no route exists yet
6. submit the existing HPA-574 route form
7. assert route creation/controller commit completes
8. close Logistics
9. reopen Supply Advisor
10. assert category/horizon retained and created-route evidence appears
```

- [ ] **Step 3: Run targeted RED E2E**

```bash
bunx playwright test src/routes/retail-sim.e2e.ts -g "supply planner logistics"
```

Expected: FAIL before final wiring is complete.

- [ ] **Step 4: Fix only HPA-297 integration gaps and rerun targeted E2E**

```bash
bunx playwright test src/routes/retail-sim.e2e.ts -g "supply planner logistics"
```

Expected: PASS.

- [ ] **Step 5: Run focused server suites**

```bash
bun run test:unit -- src/lib/game/interCityLogistics.spec.ts src/lib/game/supplyPlannerLogistics.spec.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts src/routes/supplyPlannerRoute.spec.ts --run --project server
```

Expected: PASS.

- [ ] **Step 6: Run focused client suites**

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/components/game/LogisticsPanel.svelte.spec.ts src/lib/components/game/RetailSupplySources.svelte.spec.ts src/routes/ManagementPanelHost.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client
```

Expected: PASS.

- [ ] **Step 7: Run static/build gates**

```bash
bun run check
bun run lint
bun run build
git diff --check main...HEAD
```

Expected: PASS.

- [ ] **Step 8: Run full unit and E2E suites**

```bash
bun run test:unit -- --run
bun run test:e2e
```

Expected: PASS.

- [ ] **Step 9: Run scope audits**

```bash
git diff --name-only main...HEAD | grep -E 'saveCodec|saveTypes|saveRepository|migration' && exit 1 || true
rg "activeOutboundRouteIds|active-logistics-not-modeled|logistics-contention-not-modeled" src
```

Expected: no persistence/schema change and no production-code legacy guard match.

Review the final diff for:

```text
no simulateDay replay
no second live scheduler
o remote production recursion
no combined optimizer pool
no replacement of viabilityTier
no HPA-296 event framework work
no planner-owned mutations
```

- [ ] **Step 10: Commit final test changes**

```bash
git add src/routes/retail-sim.e2e.ts
git commit -m "test(supply): cover logistics planner lifecycle"
```

---

## Definition of Done

- [ ] HPA-281 no longer suppresses planning merely because active logistics exists.
- [ ] No-logistics results still use and match the current closed-form HPA-281 projection.
- [ ] Logistics results use one 30-day trace with arrivals → selected-city HPA-281 day → HPA-294-compatible route dispatch.
- [ ] Future arrivals cannot retroactively fix earlier shortages.
- [ ] Selected-city outbound routes use post-local-step inventory and are not mislabeled as remote-production uncertainty.
- [ ] Remote origin production uncertainty is explicit and blocks unsafe throughput proposals.
- [ ] One-day planner route mechanics are parity-tested against live HPA-294 arrival/dispatch behavior.
- [ ] Planner snapshot/preset payloads reuse `CityInventory`, `TransferOrder`, `RecurringRoute`, and `RecurringRouteInput`.
- [ ] Logistics candidate generation is bounded and falls through once to existing local actions if no logistics candidate is viable.
- [ ] `viabilityTier` remains the first candidate-ranking dimension.
- [ ] Handoff focus/preset/source state is applied after `closePlannerOverlays()`.
- [ ] Route/source/warehouse recommendations use existing UI and require explicit player confirmation.
- [ ] Supply Planner category/horizon survives handoff and reopen.
- [ ] No persistence/schema or compatibility layer is added.
- [ ] Focused tests, full unit suite, static gates, build, targeted E2E, and full E2E pass.