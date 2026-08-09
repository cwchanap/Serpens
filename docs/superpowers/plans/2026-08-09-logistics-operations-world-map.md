# Logistics Operations and World-Route UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HPA-294 inter-city logistics playable and inspectable through one management surface, read-only reports, simple selectable world routes, a route inspector, and actionable alerts without duplicating logistics rules or persisted state.

**Architecture:** Keep `GameRouteController` as the only mutation/persistence coordinator and `+page.svelte` as the transient navigation/selection root. Extract one small geometry-rate helper inside HPA-294's domain module, extend existing logistics read models, keep panel derivation in a pure `.ts` sibling, and extend the three HPA-568 route hosts with logistics-specific presentation only.

**Tech Stack:** TypeScript 6, Svelte 5/SvelteKit, existing DOM world map plus SVG, Vitest node/browser projects, Playwright E2E, existing i18n catalogs, existing sandbox autosave pipeline.

## Global constraints

- HPA-294 / PR #35 and HPA-568 / PR #38 are the implementation baseline.
- Keep one HPA-574 implementation PR with staged commits; do not split panel/map delivery into separate PRs.
- Do not change dispatch quantity, destination reservations, route cadence, inventory conservation, transport accounting, arrival timing, or persistence semantics.
- The only domain-core edit is extracting existing world-coordinate rate arithmetic into `quoteInterCityRates`; manual transfer behavior remains unchanged.
- Do not add a save-schema bump, migration, persisted UI state, rejected-order record, alert-history store, or persisted alert counter.
- Do not add scenario logistics commands or scenario authoring.
- `manageLogistics` is exactly `playMode === 'sandbox'`.
- Command failures remain localized inline; they are not HUD alerts.
- Reports are read-only in HPA-574; do not add report-row navigation callbacks.
- `destinationNeed === 0` is destination-full before any stock/capacity classification.
- Historical utilization continues to use attempt-recorded capacity.
- Zero-stock materials remain selectable for route planning.
- Route state must not rely on color alone.
- No new route controller, Svelte store/context layer, event bus, generic command bus, form engine, modal registry, graph framework, Phaser world scene, route animation layer, vehicle simulation, or pathfinding.

## Risks and controls

1. **Reactive report scans:** `collectGameAlerts` runs in route-level derived state while `game.reports` is append-only. Use one `selectRouteOperations` report pass plus one grouped recent-attempt pass; never rescan all reports once per route.
2. **Browser-suite runtime:** recent `main` work specifically stabilized/serialized browser tests. Put endpoint/row/label derivation in `logisticsPanel.ts` node tests and keep Svelte browser specs focused on form/callback/DOM behavior.
3. **Ninth launcher layout:** keep the existing control-desk layout until a targeted E2E assertion demonstrates overlap; only then adjust `MapInspectorHost` clearance.
4. **Map discovery on narrow screens:** route buttons live in the existing `.world-node-list` scroll container, so the existing ≤820px bottom placement and `max-height: 45%` apply to both city and route discovery.

## File map

### New production files

- `src/lib/components/game/logisticsPanel.ts`
- `src/lib/components/game/LogisticsPanel.svelte`
- `src/lib/components/game/WorldLogisticsRoutes.svelte`
- `src/lib/components/game/LogisticsRouteInspector.svelte`

### New focused tests

- `src/lib/components/game/logisticsPanel.spec.ts`
- `src/lib/components/game/LogisticsPanel.svelte.spec.ts`
- `src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts`
- `src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts`
- `src/routes/alertNavigation.spec.ts`

### Existing boundaries to extend

- `src/lib/game/interCityLogistics.ts`
- `src/lib/game/interCityLogistics.spec.ts`
- `src/lib/game/logisticsReadModels.ts`
- `src/lib/game/logisticsReadModels.spec.ts`
- `src/lib/game/commandResult.ts`
- `src/lib/game/alerts.ts`
- `src/lib/game/alerts.spec.ts`
- `src/lib/game/keyboardShortcuts.ts`
- `src/lib/game/keyboardShortcuts.spec.ts`
- `src/lib/i18n/gameCopy.ts`
- `src/lib/i18n/gameCopy.spec.ts`
- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`
- `src/lib/components/game/ShortcutCheatSheet.svelte`
- `src/lib/components/game/ReportsPanel.svelte`
- `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- `src/lib/components/game/WorldMap.svelte`
- `src/lib/components/game/WorldMap.svelte.spec.ts`
- `src/routes/gameRouteController.ts`
- `src/routes/gameRouteController.spec.ts`
- `src/routes/alertNavigation.ts`
- `src/routes/MapSurfaceHost.svelte`
- `src/routes/MapSurfaceHost.svelte.spec.ts`
- `src/routes/MapInspectorHost.svelte`
- `src/routes/MapInspectorHost.svelte.spec.ts`
- `src/routes/ManagementPanelHost.svelte`
- `src/routes/ManagementPanelHost.svelte.spec.ts`
- `src/routes/+page.svelte`
- `src/routes/page.svelte.spec.ts`
- `src/routes/retail-sim.e2e.ts`

---

## Task 1: Extract route rates and shared logistics read models

**Files:**

- Modify: `src/lib/game/interCityLogistics.ts`
- Modify: `src/lib/game/interCityLogistics.spec.ts`
- Modify: `src/lib/game/logisticsReadModels.ts`
- Modify: `src/lib/game/logisticsReadModels.spec.ts`

**Interfaces:**

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

export interface RouteOperationalSummary {
  // existing fields remain unchanged
  condition: RouteOperationalCondition;
}

export function selectRecentRouteDispatchAttempts(
  game: GameState,
  limit?: number
): ReadonlyMap<string, readonly DailyRouteDispatchAttempt[]>;
```

- [ ] Add `quoteInterCityRates` tests for the three current industry-city pairs, invalid IDs, retail IDs, and same-city endpoints.
- [ ] Move the existing `Math.hypot` / `INTER_CITY_DISTANCE_PER_BAND` calculation into `quoteInterCityRates` without changing expected manual quote values.
- [ ] Change `validateManualTransfer` to call `quoteInterCityRates` after its existing inventory/material/quantity validation and preserve all current failure reasons.
- [ ] Add one test for each operational condition using real `DailyRouteDispatchAttempt` fields.
- [ ] Add the exact zero-dispatch fixture below and assert `origin-stock-constrained`:

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

- [ ] Add the overlap boundary `availableOriginStock === capacity < destinationNeed` and assert `route-capacity-constrained`.
- [ ] Add `condition` to every `selectRouteOperations` result from the already-selected latest attempt.
- [ ] Add grouped recent-attempt tests across multiple reports/routes; assert newest-first values and per-route `limit` behavior.
- [ ] Implement `selectRecentRouteDispatchAttempts(game, limit = 2)` as one reverse report pass. Do not expose a per-route function that rescans reports.

**Verify:**

```bash
bun run test:unit -- --run \
  src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/logisticsReadModels.spec.ts
bun run check
```

**Commit:**

```bash
git add src/lib/game/interCityLogistics.ts src/lib/game/interCityLogistics.spec.ts \
  src/lib/game/logisticsReadModels.ts src/lib/game/logisticsReadModels.spec.ts
git commit -m "refactor(logistics): expose shared route evidence"
```

---

## Task 2: Add the route-level logistics command and shortcut contracts

**Files:**

- Modify: `src/lib/game/commandResult.ts`
- Modify: `src/lib/game/keyboardShortcuts.ts`
- Modify: `src/lib/game/keyboardShortcuts.spec.ts`
- Modify: `src/routes/gameRouteController.ts`
- Modify: `src/routes/gameRouteController.spec.ts`

**Interfaces:**

```ts
export type LogisticsFailureCode = ManualTransferFailure | RecurringRouteFailure;

export type GameRouteCommitResult =
  | existing variants
  | { status: 'logistics-rejected'; reason: LogisticsFailureCode };

type RouteTransitionResult<TReceipt = undefined> =
  | existing variants
  | { ok: false; logisticsFailure: LogisticsFailureCode };
```

Controller methods:

```ts
dispatchManualTransfer(input: ManualTransferInput): Promise<GameRouteCommitResult>;
createRecurringRoute(input: RecurringRouteInput): Promise<GameRouteCommitResult>;
updateRecurringRoute(routeId: string, input: RecurringRouteUpdateInput): Promise<GameRouteCommitResult>;
pauseRecurringRoute(routeId: string): Promise<GameRouteCommitResult>;
resumeRecurringRoute(routeId: string): Promise<GameRouteCommitResult>;
reprioritizeRecurringRoute(routeId: string, priority: number): Promise<GameRouteCommitResult>;
removeRecurringRoute(routeId: string): Promise<GameRouteCommitResult>;
```

- [ ] Add `L`/`l` shortcut tests for the new `logistics` management panel, including soft-menu switching and existing typing/modifier/blocking-overlay suppression.
- [ ] Add a successful manual dispatch controller test proving one publish and one autosave with the committed game.
- [ ] Add a manual rejection test proving exact `logistics-rejected` reason with no publish/autosave.
- [ ] Add compact lifecycle coverage for create/edit/pause/resume/reprioritize/remove and one `route-not-found` rejection.
- [ ] Add scenario-mode coverage proving all logistics writes return `unavailable` and no `ScenarioCommand` is added.
- [ ] Add `'logistics'` to `ManagementPanelId` and `l: 'logistics'` to `MANAGEMENT_PANEL_SHORTCUTS`.
- [ ] Add `manageLogistics: input.playMode === 'sandbox'` to `MutationAvailability`.
- [ ] Alias imported HPA-294 transitions with `...Transition` names to avoid controller method collisions.
- [ ] Wrap every `{ ok: false; reason }` as `{ ok: false, logisticsFailure: reason }` before `normalizeRouteTransition`.
- [ ] Handle `logisticsFailure` in sandbox `commitMutation` before finance `domain-rejected`.
- [ ] Reuse `commitMutation` for all seven methods and omit `scenarioCommand`.

**Verify:**

```bash
bun run test:unit -- --run \
  src/lib/game/keyboardShortcuts.spec.ts \
  src/routes/gameRouteController.spec.ts
bun run check
```

**Commit:**

```bash
git add src/lib/game/commandResult.ts src/lib/game/keyboardShortcuts.ts \
  src/lib/game/keyboardShortcuts.spec.ts src/routes/gameRouteController.ts \
  src/routes/gameRouteController.spec.ts
git commit -m "feat(logistics): expose route command boundary"
```

---

## Task 3: Build the pure Logistics panel view and thin interactive panel

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

**Pure view contract:**

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

- [ ] Node-test endpoint options in world-catalog order: opened/materialized industry cities with valid inventory only; retail/revealed/locked/nonmaterialized IDs absent.
- [ ] Build endpoint eligibility with `supportsCityInventory` plus authoritative `getCityInventory` access; do not repeat world-kind/opened/materialized predicates in Svelte.
- [ ] Node-test that all catalog materials remain selectable when current origin stock is zero.
- [ ] Node-test route, in-transit, recent-transfer, totals, and localized condition rows from existing selectors.
- [ ] Add `localizeLogisticsFailure(reason, i18n)` with an exhaustive combined failure switch and non-empty copy in all three locales.
- [ ] Browser-test manual form submission and successful `quoteInterCityTransfer` display.
- [ ] Browser-test one manual `logistics-rejected` response and assert no fake history row appears.
- [ ] Browser-test recurring endpoint changes seed `leadTimeDays` / `transportCostPerUnit` from `quoteInterCityRates`; fields remain editable.
- [ ] Browser-test route create/edit/reprioritize/pause-resume/remove callbacks using current values.
- [ ] Keep empty/read-only row assertions in `logisticsPanel.spec.ts`, not the browser spec.
- [ ] Add `L` to `ShortcutCheatSheet`.
- [ ] Add a `panelId === 'logistics'` branch in `ManagementPanelHost` with one `logisticsView` prop, `panelGame`, `manageLogistics`, `focusedLogisticsRouteId`, and explicit callbacks.
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
  src/lib/components/game/ShortcutCheatSheet.svelte src/lib/i18n/gameCopy.ts \
  src/lib/i18n/gameCopy.spec.ts src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts \
  src/lib/i18n/messages/zh-Hant.ts src/routes/ManagementPanelHost.svelte \
  src/routes/ManagementPanelHost.svelte.spec.ts
git commit -m "feat(logistics): add operations management panel"
```

---

## Task 4: Render latest-day logistics reports read-only

**Files:**

- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`

- [ ] Add a compact empty/zero logistics state when the latest report has no arrivals or attempts.
- [ ] Render arrival rows with transfer ID, endpoints, material, and quantity.
- [ ] Render attempt rows with route ID, destination need, attempt capacity, dispatched quantity, unused capacity, unmet destination need, and transport cost.
- [ ] Render `destinationNeed === 0` as destination-full rather than shortage copy.
- [ ] Use attempt-recorded `capacity` for utilization text.
- [ ] Add all report copy in English, Japanese, and Traditional Chinese.
- [ ] Do not add click handlers, route/transfer callbacks, focused transfer state, or a generic report-link contract.

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

## Task 5: Add world-route SVG presentation and a concrete keyboard discovery list

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

- [ ] Browser-test one active and one paused SVG connection; paused has a dashed non-color distinction and both show arrow direction.
- [ ] Browser-test selected-line semantics and optional pointer selection callback.
- [ ] Mount `WorldLogisticsRoutes` inside `.world-map-viewport` and resolve geometry only from existing world-city percentage coordinates.
- [ ] In `WorldMap`, wrap existing city buttons in a labelled city group inside `.world-node-list`.
- [ ] Append a labelled route group inside the same `.world-node-list`; each native button includes origin → destination, material, state, and `summary.condition`.
- [ ] Test keyboard-focusable route buttons and `onSelectRoute(routeId)`.
- [ ] Keep `.world-node-list` as the shared desktop scroll column and preserve its existing ≤820px bottom placement / `max-height: 45%` behavior.
- [ ] Forward route summaries/selected route/callback through `MapSurfaceHost`; do not add another map wrapper.
- [ ] Keep SVG as presentation only: no distance-band math, graph layout, pathfinding, animation, or vehicle state.

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
git add src/lib/components/game/WorldLogisticsRoutes.svelte \
  src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts \
  src/lib/components/game/WorldMap.svelte src/lib/components/game/WorldMap.svelte.spec.ts \
  src/routes/MapSurfaceHost.svelte src/routes/MapSurfaceHost.svelte.spec.ts \
  src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts
git commit -m "feat(logistics): render selectable world routes"
```

---

## Task 6: Add the route inspector through the HPA-568 inspector host

**Files:**

- Create: `src/lib/components/game/LogisticsRouteInspector.svelte`
- Create: `src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts`
- Modify: `src/routes/MapInspectorHost.svelte`
- Modify: `src/routes/MapInspectorHost.svelte.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`

**Host contract:**

```ts
showLogisticsRouteInspector: boolean;
selectedLogisticsRoute: RouteOperationalSummary | null;
onManageLogisticsRoute: (routeId: string) => void;
onCloseLogisticsRouteInspector: () => void;
```

- [ ] Browser-test schedule, endpoints/material, current state, latest attempt, delivered/in-transit totals, attempt-capacity utilization, and `summary.condition`.
- [ ] Browser-test **Manage route** callback with the current route ID.
- [ ] Add the `MapInspectorHost` branch only when `showLogisticsRouteInspector && selectedLogisticsRoute`.
- [ ] Reuse `.inspector-overlay` chrome and existing responsive clearance.
- [ ] Keep the world-city inspector inside `WorldMap`; do not move or duplicate it.

**Verify:**

```bash
bun run test:unit -- --run \
  src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts \
  src/routes/MapInspectorHost.svelte.spec.ts
bun run check
```

**Commit:**

```bash
git add src/lib/components/game/LogisticsRouteInspector.svelte \
  src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts \
  src/routes/MapInspectorHost.svelte src/routes/MapInspectorHost.svelte.spec.ts \
  src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts
git commit -m "feat(logistics): add world route inspector"
```

---

## Task 7: Compose route state and navigation, then run an early navigation smoke

**Files:**

- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

**Transient state:**

```ts
let selectedLogisticsRouteId = $state<string | null>(null);
let focusedLogisticsRouteId = $state<string | null>(null);

let routeOperations = $derived(game ? selectRouteOperations(game) : []);
let selectedLogisticsRoute = $derived(
  selectedLogisticsRouteId
    ? routeOperations.find((summary) => summary.route.id === selectedLogisticsRouteId) ?? null
    : null
);

let logisticsPanelView = $derived(
  game ? buildLogisticsPanelView(game, i18n) : buildLogisticsPanelView(starterMapState, i18n)
);
```

- [ ] Add `logistics` with shortcut `L` to `managementPanelMenuConfig` and pass the pure panel view/callbacks through `ManagementPanelHost`.
- [ ] Add `selectLogisticsRoute(routeId)` that switches to world view, clears world-city/retail/industry selections, and selects the current route.
- [ ] Add `openLogisticsManagement(routeId?: string)` that opens the Logistics panel and sets only `focusedLogisticsRouteId`.
- [ ] Selecting a world city clears `selectedLogisticsRouteId`; selecting retail/industry tiles and leaving/resetting/loading maps clears it alongside sibling selections.
- [ ] Compute `showLogisticsRouteInspector = activeMapView === 'world' && selectedLogisticsRoute !== null` and pass it to `MapInspectorHost`.
- [ ] Manage route opens Logistics focused on that route.
- [ ] Successful removal of the selected/focused route clears matching IDs; the derived selected summary must become null immediately.
- [ ] Extend Escape/reset/load/scenario-transition cleanup alongside existing selection IDs; do not extract a reducer/store.

Add a test-local E2E fixture helper:

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

- [ ] Add one Playwright test named `logistics route navigation` using `installSandboxAutoSave(page, logisticsRouteNavigationGame())`.
- [ ] In that smoke, select a city then a route and prove only the route inspector remains; switch away from world and prove route inspector hides; return/select route and use Manage route; remove it and prove no stale inspector remains.

**Verify:**

```bash
bun run check
bun run test:unit -- --run \
  src/routes/MapSurfaceHost.svelte.spec.ts \
  src/routes/MapInspectorHost.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts
bun run test:e2e -- --workers=1 src/routes/retail-sim.e2e.ts --grep "logistics route navigation"
```

**Commit:**

```bash
git add src/routes/+page.svelte src/routes/retail-sim.e2e.ts
git commit -m "feat(logistics): integrate route navigation"
```

---

## Task 8: Add actionable logistics alerts and alert-to-route navigation

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

**Alert contracts:**

```ts
export const LOGISTICS_CAPACITY_PRESSURE_ATTEMPTS = 2;

export type GameAlertKind =
  | existing kinds
  | 'logistics-origin-stock'
  | 'logistics-route-capacity';

export interface GameAlert {
  // existing fields
  routeId?: string;
}
```

- [ ] Add origin-stock alert coverage where latest summary condition is origin-constrained and current origin stock remains below `Math.min(latestAttempt.destinationNeed, route.capacity)`.
- [ ] Add a self-clear test: refill current origin material to that threshold without adding a new report and assert the origin alert disappears.
- [ ] Add a route-capacity test using one grouped `selectRecentRouteDispatchAttempts(game, 2)` result: one constrained attempt does not alert; two newest constrained attempts do.
- [ ] Add a normal attempt after a constrained attempt and assert it breaks the capacity streak.
- [ ] Add destination-full, paused-route, and deleted-route no-alert cases.
- [ ] Keep capacity pressure deliberately historical/sticky until a later non-constrained attempt, pause, or removal.
- [ ] Add non-empty localized logistics alert copy in all three locales.
- [ ] Rename `resolveAlertPanelNavigation` to `resolveAlertNavigation` with the existing panel branch plus `{ kind: 'world-route'; routeId }`.
- [ ] Move direct helper assertions out of `page.svelte.spec.ts` into `alertNavigation.spec.ts`; keep page tests focused on controller/availability behavior.
- [ ] Update `handleSelectAlert` to select the current world route for the world-route branch while preserving existing store/factory tile fallback.
- [ ] Extend the existing `logistics route navigation` Playwright test with one alert → route assertion using deterministic persisted attempt evidence.
- [ ] Do not create HUD alerts for command rejection.

**Verify:**

```bash
bun run test:unit -- --run \
  src/lib/game/alerts.spec.ts \
  src/lib/i18n/gameCopy.spec.ts \
  src/routes/alertNavigation.spec.ts \
  src/routes/page.svelte.spec.ts
bun run check
bun run test:e2e -- --workers=1 src/routes/retail-sim.e2e.ts --grep "logistics route navigation"
```

**Commit:**

```bash
git add src/lib/game/alerts.ts src/lib/game/alerts.spec.ts src/lib/i18n/gameCopy.ts \
  src/lib/i18n/gameCopy.spec.ts src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts \
  src/lib/i18n/messages/zh-Hant.ts src/routes/alertNavigation.ts src/routes/alertNavigation.spec.ts \
  src/routes/page.svelte.spec.ts src/routes/+page.svelte src/routes/retail-sim.e2e.ts
git commit -m "feat(logistics): derive actionable route alerts"
```

---

## Task 9: Add real transfer/route lifecycle E2E and evidence-driven launcher clearance

**Files:**

- Modify: `src/routes/retail-sim.e2e.ts`
- Modify only if the regression proves overlap: `src/routes/MapInspectorHost.svelte`
- Modify only with that fix: `src/routes/MapInspectorHost.svelte.spec.ts`

Use `cityLocalInventoryLifecycleGame()` plus `installSandboxAutoSave(page, game)`; do not add a production fixture.

### Manual transfer lifecycle

- [ ] Open Logistics with `L` or the management launcher.
- [ ] Select `industry-city` → `breadbasket-basin`, material `bottled-water`, quantity `2`; assert the real manual quote.
- [ ] Dispatch and assert the order appears in transit with HPA-294 arrival/cost evidence.
- [ ] Advance to arrival and assert delivered history, destination inventory, and latest-day Reports evidence.
- [ ] Submit one insufficient-stock transfer and assert inline typed rejection with no extra order.

### Recurring route lifecycle

- [ ] Create one recurring route between the same industry cities; changing endpoints must seed lead time/per-unit cost from `quoteInterCityRates` without a stock/cash branch.
- [ ] Advance through one scheduled dispatch and delivery.
- [ ] Switch to world, select the route from the native route list, and assert route inspector evidence.
- [ ] Use Manage route and exercise pause/resume or reprioritize through the focused panel.
- [ ] Assert active/paused presentation remains distinguishable without color alone.

### Ninth-launcher clearance

- [ ] At the existing HPA-568 desktop/laptop viewport, assert the route inspector Manage action is not covered by the control desk.
- [ ] Repeat the existing retail and industry inspector actionability assertions with the ninth launcher present.
- [ ] Change `MapInspectorHost` bottom spacing only if an assertion demonstrates overlap; otherwise leave its CSS untouched.

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

If the clearance fix changed host files, stage them explicitly:

```bash
git add src/routes/MapInspectorHost.svelte src/routes/MapInspectorHost.svelte.spec.ts
```

Then commit:

```bash
git commit -m "test(logistics): cover operations UI lifecycles"
```

---

## Task 10: Full verification and scope audit

### Focused regression gate

- [ ] Run the HPA-574 node/browser set:

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

- [ ] Run static gates:

```bash
bun run check
bun run lint
```

- [ ] Run the targeted route E2E serially:

```bash
bun run test:e2e -- --workers=1 src/routes/retail-sim.e2e.ts --grep "logistics|inspector clearance"
```

- [ ] Run the repository regression gate:

```bash
bun run test
```

### Scope audits

- [ ] No persistence/scenario feature drift:

```bash
git diff main...HEAD -- src/lib/persistence src/lib/scenarios
```

Expected: no HPA-574 changes.

- [ ] Geometry arithmetic has one owner:

```bash
rg "INTER_CITY_DISTANCE_PER_BAND|Math\.hypot" src/lib/components src/routes src/lib/game/interCityLogistics.ts
```

Expected: production arithmetic remains only in `interCityLogistics.ts`; UI calls `quoteInterCityRates`.

- [ ] No per-route report rescan:

```bash
rg "selectRecentRouteDispatchAttempts\([^\n]*route" src
```

Expected: zero matches.

- [ ] No report navigation/focused transfer scope:

```bash
rg "onOpenLogistics(Route|Transfer)|focusedLogisticsTransferId" src
```

Expected: zero matches.

- [ ] No orphan old alert helper:

```bash
rg "resolveAlertPanelNavigation" src
```

Expected: zero matches.

- [ ] Inspector gating is explicit:

```bash
rg "showLogisticsRouteInspector|selectedLogisticsRoute" src/routes src/lib/components/game
```

Confirm the host guard exists and the world-city inspector remains in `WorldMap`.

- [ ] No forbidden generic infrastructure:

```bash
rg "Logistics(Store|Controller|Router|Registry|EventBus)|GraphEngine|RouteAnimation|Vehicle" src
```

Expected: no new generic runtime abstraction matching these concepts.

- [ ] Diff hygiene:

```bash
git diff --check main...HEAD
git status --short
```

### Whole-branch review checklist

- [ ] Logistics failures cannot fall through to finance `domain-rejected`.
- [ ] No second sandbox mutation/autosave path or invented sandbox pending semantics.
- [ ] `quoteInterCityRates` is reused by manual validation and recurring form defaults; no UI rate arithmetic exists.
- [ ] Endpoint options reuse city-inventory helpers; zero-stock materials remain visible.
- [ ] `RouteOperationalSummary.condition` is shared rather than recalculated in each presentation surface.
- [ ] Alert history is grouped once rather than scanned per route.
- [ ] Origin alert self-clears after current stock/capacity correction; capacity alert retains the intentional historical two-attempt behavior.
- [ ] Reports are read-only and no transfer-focus state exists.
- [ ] Route buttons share the world discovery scroll container and remain reachable at ≤820px.
- [ ] Route inspector cannot render off world view or with a null current route.
- [ ] World-city and world-route inspectors cannot remain open simultaneously after route selection.
- [ ] Logistics alert/failure copy never becomes empty.
- [ ] Destination-full and zero-stock-origin cases classify correctly.
- [ ] Historical utilization never uses current route capacity.
- [ ] Route discovery is not SVG-only.
- [ ] Ninth launcher does not cover inspector actions.

### Final-fix commit, only when needed

Inspect changes:

```bash
git diff --name-only
git diff
```

Interactively stage only verification fixes:

```bash
git add -p
git diff --cached --check
git diff --cached
```

Commit only if the index is non-empty:

```bash
git diff --cached --quiet || git commit -m "fix(logistics): complete operations UI integration"
```

## Completion criteria

HPA-574 is complete when all acceptance criteria in the design are satisfied and every Task 10 verification command passes on the implementation head.
