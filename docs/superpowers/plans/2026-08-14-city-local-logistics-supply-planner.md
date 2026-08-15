# City-Local Logistics Supply Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the HPA-281 Supply Planner with deterministic city-inventory, in-transit, recurring-route, logistics bottleneck, and player-confirmed logistics action planning for HPA-297.

**Architecture:** Keep `buildSupplyPlan` as the single planner entry point. HPA-281 continues to own local category/production projection. Add one pure `supplyPlannerLogistics.ts` overlay that snapshots HPA-294 logistics state, runs one 30-day immutable route ledger, and feeds dated inventory deltas/evidence back into the existing planner. Share only the two HPA-294 arithmetic helpers that must remain identical. All recommendations mutate cloned planner state and hand off to existing HPA-574/HPA-292 UI; no planner action mutates live game state.

**Tech Stack:** TypeScript 6, Svelte 5, Vitest 4 server/client projects, Playwright, existing Serpens HPA-281/HPA-294/HPA-574 domain and route composition.

## Global Constraints

- No `simulateDay` replay, RNG, reports, save writes, or autosave in planner code.
- No generic scheduler/optimizer/DSL/causal graph/planner store.
- No remote production planner recursion. Remote route origins use current inventory plus projected arrivals; surface/gate `remote-origin-production-not-modeled` when stock exhaustion matters.
- No event/disruption integration in HPA-297. HPA-296 can later change snapshot inputs without changing the ledger architecture.
- No persistence or save-schema change.
- No compatibility alias for `activeOutboundRouteIds` or `logistics-contention-not-modeled`; delete the temporary HPA-281 guard when the route-aware projection lands.
- Preserve HPA-281 no-logistics behavior exactly.
- Preserve HPA-294 priority/raw-ID ordering, destination reservation, dispatch quantity, timing, and cost behavior.
- Keep every planner action non-mutating until the player confirms in the existing UI.
- New/changed branches must remain covered by the repository's 95% Codecov policy.

---

## Task 1: Extract the two shared HPA-294 arithmetic seams

**Files:**
- Modify: `src/lib/game/interCityLogistics.ts`
- Modify: `src/lib/game/interCityLogistics.spec.ts`

### RED

- [ ] Add focused tests for a pure destination-need helper:
  - capacity minus used minus all in-transit reservations;
  - never below zero;
  - overflowed destination remains zero need.
- [ ] Add focused tests for a pure dispatch-quantity helper:
  - destination need binds;
  - route capacity binds;
  - origin stock binds;
  - zero in any input yields zero.
- [ ] Add one parity test proving `processRecurringRouteDispatches` still produces the same dispatched quantity after the extraction.
- [ ] Run and observe the new helper tests fail because the exports do not exist:

```bash
bun run test:unit -- src/lib/game/interCityLogistics.spec.ts --run --project server
```

### GREEN

- [ ] Add:

```ts
getDestinationTransferNeedFromCapacity({ warehouseCapacity, warehouseUsed, reservedInTransitUnits })
getRecurringDispatchQuantity({ destinationNeed, routeCapacity, availableOriginStock })
```

- [ ] Make `getDestinationTransferNeed(game, cityId)` delegate to the capacity helper.
- [ ] Make `processRecurringRouteDispatches` delegate to the dispatch-quantity helper.
- [ ] Keep `compareRecurringRoutes`, due-route selection, transfer creation, cost application, and schedule advancement otherwise unchanged.
- [ ] Re-run the focused test file.
- [ ] Run:

```bash
bun run check
```

### Commit

- [ ] Commit:

```text
refactor(logistics): share route planning arithmetic
```

---

## Task 2: Add the immutable logistics snapshot and 30-day ledger

**Files:**
- Create: `src/lib/game/supplyPlannerLogistics.ts`
- Create: `src/lib/game/supplyPlannerLogistics.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`

### RED — snapshot contract

- [ ] Add tests that `buildSupplyPlannerSnapshot` captures a nested logistics snapshot containing:
  - current day;
  - all opened industry-city inventory/capacity rows;
  - all current in-transit orders, including unrelated materials for warehouse reservation;
  - all recurring routes;
  - `nextRouteSequence`.
- [ ] Assert snapshot arrays/records are copied: later mutation of the source game does not change the snapshot.
- [ ] Replace test fixture uses of `activeOutboundRouteIds` with the new logistics snapshot; do not add a compatibility field.

### RED — ledger behavior

- [ ] In `supplyPlannerLogistics.spec.ts`, add a minimal factory for logistics snapshots and test:
  - an in-transit order is not in destination inventory before `arrivalOnDay`;
  - it arrives on the correct day and stops reserving capacity;
  - a due route dispatch removes origin stock immediately;
  - projected arrival is dispatch day + lead time;
  - next dispatch is projected day + frequency;
  - paused routes do not dispatch;
  - zero-quantity attempts create evidence but no projected order;
  - due routes use `compareRecurringRoutes` priority/raw-ID order;
  - two routes contend for the same destination capacity deterministically;
  - two routes contend for the same origin material deterministically;
  - an arrival into an intermediate city can feed a later existing route without route-path search;
  - transport cost accumulates from dispatched whole units only.
- [ ] Add a test that route quantities remain whole units even when the selected planner's expected demand is fractional.
- [ ] Add a relevant-route stock-exhaustion test that records the `remote-origin-production-not-modeled` limitation instead of inventing new stock.
- [ ] Run and observe failure:

```bash
bun run test:unit -- src/lib/game/supplyPlannerLogistics.spec.ts src/lib/game/supplyPlanner.spec.ts --run --project server
```

### GREEN

- [ ] Implement the contracts from the design:
  - `SupplyPlannerLogisticsCitySnapshot`;
  - `SupplyPlannerTransferSnapshot`;
  - `SupplyPlannerRouteSnapshot`;
  - `SupplyPlannerLogisticsSnapshot`;
  - route/city forecast evidence types.
- [ ] Implement `buildSupplyPlannerLogisticsSnapshot(game)` using `getCityInventoryStats` only for valid opened industry cities.
- [ ] Implement one pure `projectSupplyPlannerLogistics(snapshot, requiredMaterialIds)` that runs at most 30 projected days once and returns:
  - per-day selected-material inventory deltas by city/material;
  - route dispatch/arrival/cost evidence;
  - city/in-transit evidence;
  - precise remote-origin limitation evidence.
- [ ] Use the shared HPA-294 helpers from Task 1 for destination need and dispatch quantity.
- [ ] Do not construct or mutate `GameState` inside the ledger.
- [ ] Add `logistics` to `SupplyPlannerSnapshot`.
- [ ] Delete `activeOutboundRouteIds` from snapshot construction and fixtures.
- [ ] Re-run focused tests.
- [ ] Run:

```bash
bun run check
bun run lint
```

### Commit

- [ ] Commit:

```text
feat(supply): project city logistics state
```

---

## Task 3: Feed dated logistics inventory into the HPA-281 material projection

**Files:**
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`
- Modify: `src/lib/game/supplyPlannerLogistics.ts`
- Modify: `src/lib/game/supplyPlannerLogistics.spec.ts`

### RED — preserve local behavior

- [ ] Add a fixture with no routes/in-transit orders and pin the existing HPA-281 material 7/30 outputs, bottleneck, and limitations.
- [ ] Add an inbound-order case where:
  - stockout occurs before arrival;
  - the arrival removes only later imports/stockout pressure;
  - no retroactive supply is credited.
- [ ] Add an outbound-route case where selected-supply-city inventory decreases on the projected dispatch day.
- [ ] Add a route-arrival case for a raw/intermediate material that still respects HPA-281 warehouse-connected inventory-consumer limits.
- [ ] Run focused tests and observe the arrival/outbound expectations fail:

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerLogistics.spec.ts --run --project server
```

### GREEN — extend, do not replace, the allocator

- [ ] Add a private per-day inventory-delta input to the existing local-supply horizon calculation.
- [ ] Thread the 30-day logistics delta series into the existing branch/reachability allocator; do not add another material flow algorithm.
- [ ] Derive 7-day output from the same 30-day trace/schedule.
- [ ] Ensure:
  - in-transit stock is unavailable until arrival;
  - outbound dispatch is removed on dispatch day;
  - inventory additions still pass through existing warehouse-connected consumer caps;
  - no-logistics output is byte-for-byte/equality-equivalent at the public projection level except for the intentional new logistics evidence field.
- [ ] Replace the old `active-logistics-not-modeled` limitation with route/city forecast evidence.
- [ ] Keep `rail-capacity-not-modeled` and `store-sales-capacity-not-modeled` unchanged.
- [ ] Add `remote-origin-production-not-modeled` only when a required-material route is actually stock-constrained in the projection.
- [ ] Re-run focused tests.

### Commit

- [ ] Commit:

```text
feat(supply): integrate route arrivals into forecasts
```

---

## Task 4: Diagnose logistics bottlenecks and generate bounded candidates

**Files:**
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`
- Modify: `src/lib/game/supplyPlannerActions.ts`
- Modify: `src/lib/game/supplyPlannerActions.spec.ts`

### RED — bottleneck evidence

- [ ] Add projection tests for:
  - paused matching route → `route-paused`;
  - full destination/reserved capacity blocks a dispatch → `route-destination-capacity`;
  - origin stock binds → `origin-inventory`;
  - dispatch at route capacity with unmet destination need → `route-capacity`;
  - first useful arrival after first stockout → `route-lead-time`;
  - later stockout between successful deliveries → `route-frequency`;
  - no useful route plus alternate opened city stock → `destination-configuration`;
  - no logistics cause → existing HPA-281 local bottleneck.
- [ ] Assert each logistics bottleneck carries route/city/material/day/amount evidence where applicable.

### RED — action family

- [ ] Update action fixtures to require `build-warehouse.cityId`; confirm old no-city fixtures fail and then remove them.
- [ ] Add candidate tests:
  - paused route → one `resume-route` candidate using `max(nextDispatchOnDay, currentDay)`;
  - capacity bottleneck → one `edit-route` capacity candidate with `current + ceil(peakUnmet)`;
  - cadence bottleneck → one `edit-route` frequency candidate with exactly one-day tightening;
  - priority contention → one priority candidate only when the blocker can be beaten numerically;
  - missing useful route → at most one create candidate per stocked open origin;
  - create route uses `quoteInterCityRates`, frequency `1`, priority `0`, bounded capacity, and hypothetical `route-${nextRouteSequence}` identity;
  - alternate supply source evaluates a cloned assignment and does not recursively generate nested candidates;
  - warehouse bottleneck targets the correct city;
  - remote-origin unknown production prevents a larger/faster route candidate that requires stock not present in the ledger.
- [ ] Add availability tests for `canManageLogistics` and `canSetRetailSupplySource`.

### RED — comparison/ranking

- [ ] Add tests pinning:
  - projected delivered units 7/30;
  - incremental transport cost 30;
  - first-shortage improvement;
  - import-spend reduction from the integrated projection;
  - logistics net benefit = avoided import spend - incremental transport cost - known upfront cost;
  - no-op when a route change moves stock but does not reduce shortage/import;
  - no-op when added transport cost exceeds the avoided import value;
  - stable action-key tie break.
- [ ] Add deep-equality immutability checks for the input game, route arrays, orders, sequences, reports, and RNG before/after every candidate family.
- [ ] Run and observe failures:

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts --run --project server
```

### GREEN

- [ ] Add logistics bottleneck union members and evidence-first diagnosis after integrated projection.
- [ ] Extend `SupplyPlannerActionAvailability` with:

```ts
canManageLogistics: boolean;
canSetRetailSupplySource: boolean;
```

- [ ] Extend `SupplyPlannerAction` with:
  - city-scoped `build-warehouse`;
  - `create-route`;
  - field-scoped `edit-route`;
  - `resume-route`;
  - `change-supply-source`.
- [ ] Remove `logistics-contention-not-modeled` from no-op reasons.
- [ ] Implement exactly the bounded candidate recipes in the design; do not loop over arbitrary capacities/frequencies/priorities.
- [ ] Apply route candidates only to cloned logistics snapshot state.
- [ ] Implement supply-source comparison through a cloned game assignment and a projection-only path that has logistics candidate generation disabled.
- [ ] Extend `SupplyPlannerComparison` with delivery/transport/shortage-timing evidence and fold transport cost into existing net-benefit ranking.
- [ ] Preserve existing local producer/upgrade/rail economics unchanged.
- [ ] Re-run focused tests.
- [ ] Run:

```bash
bun run check
bun run lint
```

### Commit

- [ ] Commit:

```text
feat(supply): rank logistics planner actions
```

---

## Task 5: Wire non-mutating planner handoffs into existing operations UI

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

### RED — route handoff contracts

- [ ] Extend `SupplyPlannerHandoffHost` tests so:
  - `edit-route`/`resume-route` close planner overlays and open Logistics focused on the correct route;
  - `create-route` opens Logistics with a route preset and does not call any mutation callback;
  - `change-supply-source` opens Stores focused on the selected retail city and does not change the assignment;
  - city-scoped warehouse switches to the action's target city before placement;
  - stale/unavailable action capability causes a no-op handoff.

### RED — create-route preset

- [ ] Add `LogisticsPanel.svelte.spec.ts` coverage for a `LogisticsRoutePreset`:
  - seeds origin/destination/material/capacity/frequency/lead-time/cost/priority;
  - focuses the existing route form;
  - does not submit/create a route;
  - applies a new preset once;
  - reactive view rerenders do not overwrite player edits after the preset was applied;
  - a distinct later preset can be applied.
- [ ] Add a stable preset identity/key rather than comparing mutable form state.

### RED — source focus

- [ ] Add `RetailSupplySources.svelte.spec.ts` coverage for optional `focusedRetailCityId`:
  - focuses/scrolls the correct existing row/select;
  - does not call `onChange` merely because focus changed.

### GREEN

- [ ] Define route-local transient state in `+page.svelte` only:
  - `focusedLogisticsRouteId` stays for existing-route actions;
  - add `logisticsRoutePreset: LogisticsRoutePreset | null` for create-route handoff;
  - add `focusedRetailSupplyCityId: WorldCityId | null` for source handoff.
- [ ] Thread those props only through `ManagementPanelHost` to the existing concrete components.
- [ ] Update `LogisticsPanel` to seed/focus the current create form once; do not create a second form or command path.
- [ ] Update `RetailSupplySources` with focus-only behavior.
- [ ] Extend `plannerHandoffHost()` to call route-local open/focus functions; do not expose `GameRouteController` commands to planner code.
- [ ] Keep `SupplyPlannerUiContext` untouched when planner overlays close so category/horizon survive.
- [ ] Re-run:

```bash
bun run test:unit -- src/routes/supplyPlannerRoute.spec.ts --run --project server
bun run test:unit -- src/lib/components/game/LogisticsPanel.svelte.spec.ts src/lib/components/game/RetailSupplySources.svelte.spec.ts src/routes/ManagementPanelHost.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client
bun run check
```

### Commit

- [ ] Commit:

```text
feat(supply): hand off logistics recommendations
```

---

## Task 6: Surface route-aware evidence and localized copy in Supply Advisor

**Files:**
- Modify: `src/lib/components/game/SupplyAdvisor.svelte`
- Modify: `src/lib/components/game/SupplyAdvisor.svelte.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/i18n/locales.spec.ts`

### RED

- [ ] Add component tests for:
  - configured supply city and current warehouse stock/capacity;
  - in-transit quantity + earliest arrival;
  - route state/next dispatch/projected 7/30 delivery/transport cost;
  - route capacity/frequency/lead-time/origin/destination/paused bottleneck copy;
  - remote-origin limitation copy only when present;
  - logistics action labels for create/edit/resume/source change;
  - baseline-vs-action delivered units, shortage/import improvement, and incremental transport cost;
  - city-scoped warehouse action label still reuses existing warehouse copy with target-city context;
  - no old `active logistics not modeled` / `logistics contention not modeled` text.
- [ ] Add locale parity expectations for every new `supplyAdvisor` key in EN/JA/zh-Hant.
- [ ] Run and observe failures:

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts --run --project client
bun run test:unit -- src/lib/i18n/locales.spec.ts --run --project server
```

### GREEN

- [ ] Keep one Supply Advisor dialog and current category/horizon controls.
- [ ] Add one compact logistics evidence section; do not embed/reimplement the Logistics panel.
- [ ] Add action/bottleneck/metric/limitation copy in all three locale files.
- [ ] Remove old active-logistics limitation/no-op keys only after all code/tests stop referencing them.
- [ ] Keep all `/ day`, `/ unit`, day/currency/list formatting through the existing i18n helpers.
- [ ] Re-run component/localization tests.
- [ ] Run:

```bash
bun run check
bun run lint
```

### Commit

- [ ] Commit:

```text
feat(supply): show logistics forecast evidence
```

---

## Task 7: Add the shortage-to-route browser lifecycle and full verification

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify only if a regression requires it: files already touched in Tasks 1–6

### E2E RED

- [ ] Add one targeted deterministic save-injection fixture containing:
  - selected retail category with a destination shortage;
  - configured destination supply city;
  - another opened industry city with current stock of the shortage material;
  - no useful inbound route;
  - enough cash/capability for route management.
- [ ] Add one lifecycle test:
  1. open Supply Advisor;
  2. assert route-aware shortage/configuration evidence;
  3. choose the recommended create-route action;
  4. assert Logistics opens with all proposed route fields prefilled;
  5. assert no route exists before explicit form submission;
  6. submit through the existing HPA-574 form;
  7. assert the created route appears and normal controller commit completes;
  8. close Logistics and reopen Supply Advisor;
  9. assert category/horizon context is retained and route evidence now reflects the created route.
- [ ] Run the targeted browser test and observe the initial failure before completing any last wiring:

```bash
bunx playwright test src/routes/retail-sim.e2e.ts -g "supply planner logistics"
```

### GREEN / regression

- [ ] Fix only HPA-297 wiring exposed by the E2E; do not broaden scope.
- [ ] Re-run the targeted E2E.
- [ ] Run focused planner/logistics server tests:

```bash
bun run test:unit -- src/lib/game/interCityLogistics.spec.ts src/lib/game/supplyPlannerLogistics.spec.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts src/routes/supplyPlannerRoute.spec.ts --run --project server
```

- [ ] Run focused client tests:

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/components/game/LogisticsPanel.svelte.spec.ts src/lib/components/game/RetailSupplySources.svelte.spec.ts src/routes/ManagementPanelHost.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client
```

- [ ] Run all static/build gates:

```bash
bun run check
bun run lint
bun run build
git diff --check main...HEAD
```

- [ ] Run the complete unit suite:

```bash
bun run test:unit -- --run
```

- [ ] Run the complete route/browser suite required by the repository before ready-for-review:

```bash
bun run test:e2e
```

### Scope audits

- [ ] Confirm no persistence/schema file changed:

```bash
git diff --name-only main...HEAD | grep -E 'saveCodec|saveTypes|saveRepository|migration' && exit 1 || true
```

- [ ] Confirm the temporary HPA-281 guard is gone:

```bash
rg "activeOutboundRouteIds|active-logistics-not-modeled|logistics-contention-not-modeled" src docs/superpowers/specs/2026-08-14-city-local-logistics-supply-planner-design.md
```

Expected: no production-code match; the design may mention deleted legacy names only in explanatory/removal text.

- [ ] Review `git diff main...HEAD` for unrelated refactors, generic abstractions, accidental live mutations, or HPA-296 event work.
- [ ] Verify the new logistics module is planner-only and no second live scheduler has been introduced.

### Commit

- [ ] Commit final E2E/cleanup changes:

```text
test(supply): cover logistics planner lifecycle
```

---

## Definition of Done

- [ ] HPA-281 no longer suppresses recommendations merely because active logistics exists.
- [ ] The 7/30 planner includes dated in-transit arrivals and recurring-route movements.
- [ ] Projected route dispatches use HPA-294 destination-need, capacity, origin-stock, priority/raw-ID, cadence, lead-time, and cost contracts.
- [ ] Required shortages diagnose concrete local/logistics causes with city/route/material/day evidence.
- [ ] Candidate generation is bounded and deterministic; no search optimizer exists.
- [ ] Transport cost participates in economic ranking.
- [ ] Remote origin production uncertainty is explicit and cannot justify unsafe throughput recommendations.
- [ ] Route/source/warehouse recommendations hand off to existing UI without planner-owned mutations.
- [ ] Route creation is prefilled but requires explicit player submission.
- [ ] Supply Planner category/horizon context survives handoff and reopen.
- [ ] No save-schema or compatibility layer is added.
- [ ] Focused tests, full unit suite, static gates, build, targeted lifecycle E2E, and full E2E all pass.
