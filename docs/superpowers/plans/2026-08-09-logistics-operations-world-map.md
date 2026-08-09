# Logistics Operations and World-Route UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HPA-294 inter-city logistics playable and inspectable through one management surface, read-only reports, simple selectable world routes, a route inspector, and actionable alerts without duplicating logistics rules or persisted state.

**Architecture:** Keep `GameRouteController` as the only mutation/persistence coordinator and `+page.svelte` as the transient navigation/selection root. Extract one small geometry-rate helper inside HPA-294's domain module, extend existing logistics read models, keep panel derivation in a pure `.ts` sibling, and extend the three HPA-568 route hosts with logistics-specific presentation only.

**Tech Stack:** TypeScript 6, Svelte 5/SvelteKit, DOM/SVG world map, Vitest node/browser projects, Playwright E2E, existing i18n catalogs, existing sandbox autosave pipeline.

## Global constraints

- HPA-294 / PR #35 and HPA-568 / PR #38 are the implementation baseline.
- Deliver HPA-574 in one implementation PR with staged commits.
- Do not change dispatch quantity, destination reservations, route cadence, inventory conservation, transport accounting, arrival timing, or persistence semantics.
- The only domain-core edit is extracting existing world-coordinate rate arithmetic into `quoteInterCityRates`; manual-transfer behavior remains unchanged.
- No save-schema bump, migration, persisted UI state, rejected-order record, alert-history store, or persisted alert counter.
- No scenario logistics commands or scenario authoring.
- `manageLogistics` is exactly `playMode === 'sandbox'`.
- Command failures are localized inline, not HUD alerts.
- Reports are read-only in HPA-574; no report-row navigation callbacks.
- `destinationNeed === 0` is destination-full before any stock/capacity classification.
- Historical utilization uses attempt-recorded capacity.
- Zero-stock materials remain selectable for route planning.
- Route state must not rely on color alone.
- No new route controller, Svelte store/context layer, event bus, generic command bus, form engine, modal registry, graph framework, Phaser world scene, route animation layer, vehicle simulation, or pathfinding.

## Risks and controls

1. **Reactive report scans:** `game.reports` is append-only and alerts are route-level derived state. Use one `selectRouteOperations` report pass plus one grouped recent-attempt pass; never rescan reports once per route.
2. **Browser-suite runtime:** recent `main` work specifically stabilized browser concurrency. Keep endpoint/row/label derivation in node-tested `logisticsPanel.ts`; keep Svelte specs interaction-focused.
3. **Ninth launcher layout:** add regression evidence before changing `MapInspectorHost` clearance.
4. **Narrow world map:** route buttons share the existing `.world-node-list`, inheriting its ≤820px bottom placement and `max-height: 45%` scrolling.

## New files

- `src/lib/components/game/logisticsPanel.ts`
- `src/lib/components/game/logisticsPanel.spec.ts`
- `src/lib/components/game/LogisticsPanel.svelte`
- `src/lib/components/game/LogisticsPanel.svelte.spec.ts`
- `src/lib/components/game/WorldLogisticsRoutes.svelte`
- `src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts`
- `src/lib/components/game/LogisticsRouteInspector.svelte`
- `src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts`
- `src/routes/alertNavigation.spec.ts`

---

## Task 1: Extract route rates and shared logistics read models

**Files:**

- Modify: `src/lib/game/interCityLogistics.ts`
- Modify: `src/lib/game/interCityLogistics.spec.ts`
- Modify: `src/lib/game/logisticsReadModels.ts`
- Modify: `src/lib/game/logisticsReadModels.spec.ts`

**Add these interfaces/functions:**

```ts
export interface InterCityRates {
  leadTimeDays: number;
  transportCostPerUnit: number;
}

export function quoteInterCityRates(
  originCityId: string,
  destinationCityId: string
): InterCityRates | null;

export type RouteOperationalCondition =
  | 'awaiting-dispatch'
  | 'destination-full'
  | 'origin-stock-constrained'
  | 'route-capacity-constrained'
  | 'normal';

export function selectRecentRouteDispatchAttempts(
  game: GameState,
  limit?: number
): ReadonlyMap<string, readonly DailyRouteDispatchAttempt[]>;
```

Append `condition: RouteOperationalCondition` to the current `RouteOperationalSummary` interface.

- [ ] Test `quoteInterCityRates` for all three industry-city pairs plus invalid, same-city, and retail endpoints.
- [ ] Move the current `Math.hypot` / `INTER_CITY_DISTANCE_PER_BAND` calculation into `quoteInterCityRates`.
- [ ] Make `validateManualTransfer` call `quoteInterCityRates` after its existing inventory/material/quantity validation; preserve every current manual failure reason and quote value.
- [ ] Test every route condition.
- [ ] Add this zero-dispatch fixture and assert `origin-stock-constrained`:

```ts
{
  destinationNeed: 10,
  capacity: 5,
  availableOriginStock: 0,
  dispatchedQuantity: 0,
  unusedCapacity: 5,
  unmetDestinationNeed: 10
}
```

- [ ] Test `availableOriginStock === capacity < destinationNeed` as `route-capacity-constrained`.
- [ ] Populate `RouteOperationalSummary.condition` from the already-selected `latestAttempt`.
- [ ] Test grouped recent attempts across multiple reports/routes, newest-first with a per-route limit.
- [ ] Implement `selectRecentRouteDispatchAttempts(game, limit = 2)` as one reverse report pass; do not add a per-route report-scanning selector.

**Verify:**

```bash
bun run test:unit -- --run src/lib/game/interCityLogistics.spec.ts src/lib/game/logisticsReadModels.spec.ts
bun run check
```

**Commit:**

```bash
git add src/lib/game/interCityLogistics.ts src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/logisticsReadModels.ts src/lib/game/logisticsReadModels.spec.ts
git commit -m "refactor(logistics): expose shared route evidence"
```

---

## Task 2: Add typed controller rejection and the Logistics shortcut

**Files:**

- Modify: `src/lib/game/commandResult.ts`
- Modify: `src/lib/game/keyboardShortcuts.ts`
- Modify: `src/lib/game/keyboardShortcuts.spec.ts`
- Modify: `src/routes/gameRouteController.ts`
- Modify: `src/routes/gameRouteController.spec.ts`

Add:

```ts
export type LogisticsFailureCode = ManualTransferFailure | RecurringRouteFailure;
```

Append this arm to the existing `GameRouteCommitResult` union without changing its current arms:

```ts
{ status: 'logistics-rejected'; reason: LogisticsFailureCode }
```

Append this arm to the existing internal `RouteTransitionResult<TReceipt>` union without changing its current arms:

```ts
{ ok: false; logisticsFailure: LogisticsFailureCode }
```

Add these controller methods:

```ts
dispatchManualTransfer(input: ManualTransferInput): Promise<GameRouteCommitResult>;
createRecurringRoute(input: RecurringRouteInput): Promise<GameRouteCommitResult>;
updateRecurringRoute(routeId: string, input: RecurringRouteUpdateInput): Promise<GameRouteCommitResult>;
pauseRecurringRoute(routeId: string): Promise<GameRouteCommitResult>;
resumeRecurringRoute(routeId: string): Promise<GameRouteCommitResult>;
reprioritizeRecurringRoute(routeId: string, priority: number): Promise<GameRouteCommitResult>;
removeRecurringRoute(routeId: string): Promise<GameRouteCommitResult>;
```

- [ ] Test `L`/`l` opening `logistics`, including existing typing/modifier/blocking-overlay rules and soft-panel switching.
- [ ] Test successful manual dispatch: one publish and autosave of the committed game.
- [ ] Test exact `logistics-rejected` reason with no publish/autosave.
- [ ] Cover create/edit/pause/resume/reprioritize/remove plus one `route-not-found` rejection.
- [ ] Prove scenario-mode logistics writes return `unavailable` and add no `ScenarioCommand`.
- [ ] Add `'logistics'` to `ManagementPanelId`, `l: 'logistics'` to `MANAGEMENT_PANEL_SHORTCUTS`, and `manageLogistics: input.playMode === 'sandbox'` to `MutationAvailability`.
- [ ] Alias imported HPA-294 functions with `...Transition` names.
- [ ] Adapt every HPA-294 `{ ok: false; reason }` to `{ ok: false, logisticsFailure: reason }` before `normalizeRouteTransition`.
- [ ] Handle `logisticsFailure` in sandbox `commitMutation` before finance `domain-rejected`.
- [ ] Reuse `commitMutation` for all seven methods and omit `scenarioCommand`.

**Verify:**

```bash
bun run test:unit -- --run src/lib/game/keyboardShortcuts.spec.ts src/routes/gameRouteController.spec.ts
bun run check
```

**Commit:**

```bash
git add src/lib/game/commandResult.ts src/lib/game/keyboardShortcuts.ts \
  src/lib/game/keyboardShortcuts.spec.ts src/routes/gameRouteController.ts src/routes/gameRouteController.spec.ts
git commit -m "feat(logistics): expose route command boundary"
```

---

## Task 3: Build the pure Logistics view model and thin panel

**Files:**

- Create: `src/lib/components/game/logisticsPanel.ts`
- Create: `src/lib/components/game/logisticsPanel.spec.ts`
- Create: `src/lib/components/game/LogisticsPanel.svelte`
- Create: `src/lib/components/game/LogisticsPanel.svelte.spec.ts`
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/gameCopy.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/components/game/ShortcutCheatSheet.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte.spec.ts`

**Pure view interface:**

```ts
export interface LogisticsPanelView {
  cityOptions: readonly LogisticsCityOption[];
  materialOptions: readonly LogisticsMaterialOption[];
  routes: readonly LogisticsRouteView[];
  inTransit: readonly LogisticsInTransitView[];
  recentTransfers: readonly LogisticsTransferView[];
  totals: LogisticsTotalsView;
}

export function buildLogisticsPanelView(
  game: GameState,
  i18n: I18nBundle
): LogisticsPanelView;
```

- [ ] Node-test endpoint options in world-catalog order: only supported current industry cities with authoritative inventory access.
- [ ] Use `supportsCityInventory` and `getCityInventory`; do not repeat world-kind/opened/materialized predicates in Svelte.
- [ ] Node-test all material options remain present with zero current stock.
- [ ] Node-test route, in-transit, recent-transfer, totals, and localized condition rows from existing selectors.
- [ ] Add exhaustive `localizeLogisticsFailure(reason, i18n)` and non-empty copy in all three locales.
- [ ] Browser-test manual form submission and successful `quoteInterCityTransfer` evidence.
- [ ] Browser-test one manual `logistics-rejected` response with no fake history row.
- [ ] Browser-test recurring endpoint changes seed lead time/cost from `quoteInterCityRates`; fields remain editable.
- [ ] Browser-test create/edit/reprioritize/pause-resume/remove callbacks.
- [ ] Keep empty/read-only row assertions in `logisticsPanel.spec.ts`, not the browser spec.
- [ ] Add `L` to `ShortcutCheatSheet`.
- [ ] Add a `logistics` branch to `ManagementPanelHost` receiving `panelGame`, one `logisticsView`, `manageLogistics`, `focusedLogisticsRouteId`, and explicit callbacks.
- [ ] Do not add transfer-focus state or report-navigation callbacks.

**Verify:**

```bash
bun run test:unit -- --run \
  src/lib/components/game/logisticsPanel.spec.ts \
  src/lib/components/game/LogisticsPanel.svelte.spec.ts \
  src/lib/i18n/gameCopy.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts
bun run check
```

**Commit:**

```bash
git add src/lib/components/game/logisticsPanel.ts src/lib/components/game/logisticsPanel.spec.ts \
  src/lib/components/game/LogisticsPanel.svelte src/lib/components/game/LogisticsPanel.svelte.spec.ts \
  src/lib/components/game/ShortcutCheatSheet.svelte src/lib/i18n/gameCopy.ts src/lib/i18n/gameCopy.spec.ts \
  src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts \
  src/routes/ManagementPanelHost.svelte src/routes/ManagementPanelHost.svelte.spec.ts
git commit -m "feat(logistics): add operations management panel"
```

---

## Task 4: Render latest-day Logistics reports read-only

**Files:**

- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`

- [ ] Test empty/zero latest-day logistics evidence.
- [ ] Render arrival rows with transfer ID, endpoints, material, and quantity.
- [ ] Render attempt rows with route ID, destination need, attempt capacity, dispatched quantity, unused capacity, unmet destination need, and transport cost.
- [ ] Render `destinationNeed === 0` as destination-full.
- [ ] Use attempt-recorded capacity for utilization text.
- [ ] Add report copy in all three locales.
- [ ] Add no click handlers, route/transfer callbacks, transfer-focus state, or generic report-link contract.

**Verify:**

```bash
bun run test:unit -- --run src/lib/components/game/ReportsPanel.svelte.spec.ts
bun run check
```

**Commit:**

```bash
git add src/lib/components/game/ReportsPanel.svelte src/lib/components/game/ReportsPanel.svelte.spec.ts \
  src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts
git commit -m "feat(logistics): expose daily logistics reports"
```

---

## Task 5: Add world-route SVG and keyboard discovery

**Files:**

- Create: `src/lib/components/game/WorldLogisticsRoutes.svelte`
- Create: `src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts`
- Modify: `src/lib/components/game/WorldMap.svelte`
- Modify: `src/lib/components/game/WorldMap.svelte.spec.ts`
- Modify: `src/routes/MapSurfaceHost.svelte`
- Modify: `src/routes/MapSurfaceHost.svelte.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`

- [ ] Test active/paused SVG connections, dashed paused semantics, arrow direction, selected highlight, and optional pointer callback.
- [ ] Mount `WorldLogisticsRoutes` inside `.world-map-viewport`; use only existing percentage coordinates.
- [ ] Wrap current city buttons in a labelled city group inside `.world-node-list`.
- [ ] Append a labelled route group in the same `.world-node-list`; each native button includes origin → destination, material, state, and `summary.condition`.
- [ ] Test keyboard route selection calling `onSelectRoute(routeId)`.
- [ ] Preserve `.world-node-list` desktop placement and existing ≤820px bottom/max-height behavior.
- [ ] Forward route summaries, selected route ID, and callback through `MapSurfaceHost`.
- [ ] Add no distance arithmetic, graph layout, pathfinding, animation, or vehicle state.

**Verify:**

```bash
bun run test:unit -- --run \
  src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts \
  src/lib/components/game/WorldMap.svelte.spec.ts \
  src/routes/MapSurfaceHost.svelte.spec.ts
bun run check
```

**Commit:**

```bash
git add src/lib/components/game/WorldLogisticsRoutes.svelte src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts \
  src/lib/components/game/WorldMap.svelte src/lib/components/game/WorldMap.svelte.spec.ts \
  src/routes/MapSurfaceHost.svelte src/routes/MapSurfaceHost.svelte.spec.ts \
  src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts
git commit -m "feat(logistics): render selectable world routes"
```

---

## Task 6: Add the gated route inspector

**Files:**

- Create: `src/lib/components/game/LogisticsRouteInspector.svelte`
- Create: `src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts`
- Modify: `src/routes/MapInspectorHost.svelte`
- Modify: `src/routes/MapInspectorHost.svelte.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`

Add host props:

```ts
showLogisticsRouteInspector: boolean;
selectedLogisticsRoute: RouteOperationalSummary | null;
onManageLogisticsRoute: (routeId: string) => void;
onCloseLogisticsRouteInspector: () => void;
```

- [ ] Test endpoints/material, state, schedule, latest attempt, delivered/in-transit totals, attempt-capacity utilization, and condition.
- [ ] Test **Manage route** callback.
- [ ] Render the host branch only when `showLogisticsRouteInspector && selectedLogisticsRoute`.
- [ ] Reuse `.inspector-overlay` chrome.
- [ ] Keep the world-city inspector inside `WorldMap`.

**Verify:**

```bash
bun run test:unit -- --run src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts src/routes/MapInspectorHost.svelte.spec.ts
bun run check
```

**Commit:**

```bash
git add src/lib/components/game/LogisticsRouteInspector.svelte src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts \
  src/routes/MapInspectorHost.svelte src/routes/MapInspectorHost.svelte.spec.ts \
  src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts
git commit -m "feat(logistics): add world route inspector"
```

---

## Task 7: Compose route state/navigation and run an early smoke

**Files:**

- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

Add route state:

```ts
let selectedLogisticsRouteId = $state<string | null>(null);
let focusedLogisticsRouteId = $state<string | null>(null);
```

Derive current route operations, selected route, and `LogisticsPanelView` from the current game.

- [ ] Add `logistics`/`L` to `managementPanelMenuConfig` and wire the panel view/callbacks through `ManagementPanelHost`.
- [ ] Add `selectLogisticsRoute(routeId)` that switches to world view, clears city/retail/industry selections, and selects the current route.
- [ ] Add `openLogisticsManagement(routeId?: string)` that opens Logistics and sets only `focusedLogisticsRouteId`.
- [ ] Selecting a city clears route selection; retail/industry selection, reset, save load, scenario transition, and Escape clear route selection alongside sibling selections.
- [ ] Compute `showLogisticsRouteInspector = activeMapView === 'world' && selectedLogisticsRoute !== null`.
- [ ] Manage route opens Logistics focused on the route.
- [ ] Successful removal clears matching selected/focused route IDs.
- [ ] Do not add a navigation reducer/store.

Add this test-local E2E helper:

```ts
function logisticsRouteNavigationGame(): GameState {
  const base = cityLocalInventoryLifecycleGame();
  const created = createRecurringRoute(base, {
    originCityId: 'industry-city',
    destinationCityId: 'breadbasket-basin',
    materialId: 'bottled-water',
    capacity: 2,
    frequencyDays: 2,
    leadTimeDays: 2,
    transportCostPerUnit: 2,
    priority: 0
  });
  if (!created.ok) throw new Error(`Could not create route fixture: ${created.reason}`);
  return created.game;
}
```

- [ ] Add Playwright test `logistics route navigation` using `installSandboxAutoSave(page, logisticsRouteNavigationGame())`.
- [ ] Prove city → route selection leaves only route inspector; switching away hides it; Manage route focuses Logistics; route removal leaves no stale inspector.

**Verify:**

```bash
bun run check
bun run test:unit -- --run src/routes/MapSurfaceHost.svelte.spec.ts src/routes/MapInspectorHost.svelte.spec.ts src/routes/ManagementPanelHost.svelte.spec.ts
bun run test:e2e -- --workers=1 src/routes/retail-sim.e2e.ts --grep "logistics route navigation"
```

**Commit:**

```bash
git add src/routes/+page.svelte src/routes/retail-sim.e2e.ts
git commit -m "feat(logistics): integrate route navigation"
```

---

## Task 8: Add actionable logistics alerts and alert navigation

**Files:**

- Modify: `src/lib/game/alerts.ts`
- Modify: `src/lib/game/alerts.spec.ts`
- Modify: `src/lib/i18n/gameCopy.ts`
- Modify: `src/lib/i18n/gameCopy.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/routes/alertNavigation.ts`
- Create: `src/routes/alertNavigation.spec.ts`
- Modify: `src/routes/page.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

Append two alert kinds to `GameAlertKind`:

```ts
'logistics-origin-stock'
'logistics-route-capacity'
```

Append `routeId?: string` to `GameAlert` and add:

```ts
export const LOGISTICS_CAPACITY_PRESSURE_ATTEMPTS = 2;
```

- [ ] Test origin alert requires latest condition `origin-stock-constrained` and current stock below `Math.min(latestAttempt.destinationNeed, route.capacity)`.
- [ ] Refill current origin stock to that threshold without adding a report and assert the origin alert disappears.
- [ ] Use one grouped `selectRecentRouteDispatchAttempts(game, 2)` result for capacity streaks: one constrained attempt does not alert; two newest constrained attempts do; a later normal attempt breaks the streak.
- [ ] Test destination-full, paused, and deleted-route no-alert cases.
- [ ] Keep capacity pressure historical until a later non-constrained attempt, pause, or removal.
- [ ] Add non-empty localized alert copy in all three locales.
- [ ] Rename `resolveAlertPanelNavigation` to `resolveAlertNavigation` and add `{ kind: 'world-route'; routeId }` alongside the current finance/decision panel result.
- [ ] Move direct helper tests from `page.svelte.spec.ts` to `alertNavigation.spec.ts`.
- [ ] Update `handleSelectAlert` to select the world route while preserving store/factory fallback.
- [ ] Extend `logistics route navigation` E2E with one alert → route assertion.
- [ ] Do not create command-rejection alerts.

**Verify:**

```bash
bun run test:unit -- --run src/lib/game/alerts.spec.ts src/lib/i18n/gameCopy.spec.ts src/routes/alertNavigation.spec.ts src/routes/page.svelte.spec.ts
bun run check
bun run test:e2e -- --workers=1 src/routes/retail-sim.e2e.ts --grep "logistics route navigation"
```

**Commit:**

```bash
git add src/lib/game/alerts.ts src/lib/game/alerts.spec.ts src/lib/i18n/gameCopy.ts src/lib/i18n/gameCopy.spec.ts \
  src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts \
  src/routes/alertNavigation.ts src/routes/alertNavigation.spec.ts src/routes/page.svelte.spec.ts \
  src/routes/+page.svelte src/routes/retail-sim.e2e.ts
git commit -m "feat(logistics): derive actionable route alerts"
```

---

## Task 9: Add lifecycle E2E and launcher-clearance evidence

**Files:**

- Modify: `src/routes/retail-sim.e2e.ts`
- Modify only if overlap is proven: `src/routes/MapInspectorHost.svelte`
- Modify only with that fix: `src/routes/MapInspectorHost.svelte.spec.ts`

Use `cityLocalInventoryLifecycleGame()` plus `installSandboxAutoSave(page, game)`.

### Manual transfer

- [ ] Open Logistics and select `industry-city` → `breadbasket-basin`, `bottled-water`, quantity `2`.
- [ ] Assert the real quote, dispatch, in-transit row, arrival day/cost, delivery, destination inventory, and Reports evidence.
- [ ] Submit one insufficient-stock transfer and assert inline rejection with no extra order.

### Recurring route

- [ ] Create a route between the same industry cities and assert endpoint selection seeds lead time/per-unit cost from `quoteInterCityRates`.
- [ ] Advance through one scheduled dispatch and delivery.
- [ ] Select the route from the native world list and assert inspector evidence.
- [ ] Use Manage route and exercise pause/resume or reprioritize.
- [ ] Assert active/paused presentation is not color-only.

### Clearance

- [ ] At the existing HPA-568 laptop viewport, assert route inspector Manage action is not covered by the desk.
- [ ] Repeat retail and industry inspector actionability with the ninth launcher present.
- [ ] Change `MapInspectorHost` spacing only if these assertions demonstrate overlap.

**Verify:**

```bash
bun run test:e2e -- --workers=1 src/routes/retail-sim.e2e.ts --grep "logistics|inspector clearance"
bun run check
```

**Commit:**

```bash
git add src/routes/retail-sim.e2e.ts
git diff -- src/routes/MapInspectorHost.svelte src/routes/MapInspectorHost.svelte.spec.ts
```

If the clearance fix changed those host files:

```bash
git add src/routes/MapInspectorHost.svelte src/routes/MapInspectorHost.svelte.spec.ts
```

Then:

```bash
git commit -m "test(logistics): cover operations UI lifecycles"
```

---

## Task 10: Full verification and scope audit

- [ ] Run focused tests:

```bash
bun run test:unit -- --run \
  src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/alerts.spec.ts \
  src/lib/game/keyboardShortcuts.spec.ts \
  src/lib/components/game/logisticsPanel.spec.ts \
  src/lib/components/game/LogisticsPanel.svelte.spec.ts \
  src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts \
  src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts \
  src/lib/components/game/WorldMap.svelte.spec.ts \
  src/lib/components/game/ReportsPanel.svelte.spec.ts \
  src/lib/i18n/gameCopy.spec.ts \
  src/routes/gameRouteController.spec.ts \
  src/routes/alertNavigation.spec.ts \
  src/routes/MapSurfaceHost.svelte.spec.ts \
  src/routes/MapInspectorHost.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  src/routes/page.svelte.spec.ts
```

- [ ] Run static and targeted E2E gates:

```bash
bun run check
bun run lint
bun run test:e2e -- --workers=1 src/routes/retail-sim.e2e.ts --grep "logistics|inspector clearance"
```

- [ ] Run the repository gate:

```bash
bun run test
```

- [ ] Confirm no persistence/scenario drift:

```bash
git diff main...HEAD -- src/lib/persistence src/lib/scenarios
```

Expected: no HPA-574 changes.

- [ ] Confirm geometry arithmetic has one production owner:

```bash
rg "INTER_CITY_DISTANCE_PER_BAND|Math\.hypot" src/lib/components src/routes src/lib/game/interCityLogistics.ts
```

Expected: UI has no copied distance arithmetic.

- [ ] Confirm no per-route report rescans:

```bash
rg "selectRecentRouteDispatchAttempts\([^\n]*route" src
```

Expected: zero matches.

- [ ] Confirm report-navigation/transfer-focus scope stayed out:

```bash
rg "onOpenLogistics(Route|Transfer)|focusedLogisticsTransferId" src
```

Expected: zero matches.

- [ ] Confirm old alert helper is gone:

```bash
rg "resolveAlertPanelNavigation" src
```

Expected: zero matches.

- [ ] Confirm explicit inspector gating:

```bash
rg "showLogisticsRouteInspector|selectedLogisticsRoute" src/routes src/lib/components/game
```

- [ ] Confirm no forbidden generic infrastructure:

```bash
rg "Logistics(Store|Controller|Router|Registry|EventBus)|GraphEngine|RouteAnimation|Vehicle" src
```

Expected: no new generic runtime abstraction matching these concepts.

- [ ] Check diff hygiene:

```bash
git diff --check main...HEAD
git status --short
```

### Whole-branch review

- [ ] Logistics failures cannot fall through to finance `domain-rejected`.
- [ ] No second sandbox mutation/autosave path or invented sandbox pending behavior.
- [ ] `quoteInterCityRates` is reused; no UI rate arithmetic exists.
- [ ] Endpoint options reuse city-inventory helpers; zero-stock materials stay visible.
- [ ] `RouteOperationalSummary.condition` is shared rather than recalculated in presentation surfaces.
- [ ] Alert history is grouped once, not scanned per route.
- [ ] Origin alert self-clears after current stock/capacity correction; capacity alert keeps intentional two-attempt history semantics.
- [ ] Reports are read-only and no transfer-focus state exists.
- [ ] Route buttons share the world discovery scroll container and remain reachable at ≤820px.
- [ ] Route inspector cannot render off world view or with a null route.
- [ ] City and route inspectors cannot remain open simultaneously after route selection.
- [ ] Logistics alert/failure copy is never empty.
- [ ] Destination-full and zero-stock-origin classify correctly.
- [ ] Historical utilization never uses current route capacity.
- [ ] Route discovery is not SVG-only.
- [ ] Ninth launcher does not cover inspector actions.

### Final-fix commit only if needed

```bash
git diff --name-only
git diff
git add -p
git diff --cached --check
git diff --cached
```

Commit only when staged changes exist:

```bash
git diff --cached --quiet || git commit -m "fix(logistics): complete operations UI integration"
```

## Completion criteria

HPA-574 is complete only when all design acceptance criteria are satisfied and every Task 10 verification command passes on the implementation head.
