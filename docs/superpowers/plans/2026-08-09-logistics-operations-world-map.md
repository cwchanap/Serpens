# Logistics Operations and World-Route UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HPA-294 inter-city logistics playable and inspectable through one management surface, selectable world-map route visuals, focused navigation, latest-day reports, and evidence-derived alerts without duplicating logistics rules or persisted state.

**Architecture:** Keep `GameRouteController` as the only mutation/persistence coordinator and `+page.svelte` as the transient navigation/selection root. Extend the three HPA-568 route hosts with `LogisticsPanel`, `WorldLogisticsRoutes`, and `LogisticsRouteInspector`. Consume HPA-294 commands/read models directly and add only small pure evidence-classification helpers.

**Tech Stack:** TypeScript 6, Svelte 5/SvelteKit, existing DOM world map + SVG, Vitest browser/unit tests, Playwright, existing i18n catalogs, existing sandbox autosave pipeline.

## Global constraints

- HPA-294 / PR #35 and HPA-568 / PR #38 are the baseline.
- No transfer/scheduler/reservation/inventory/cost/persistence math in UI code.
- No save-schema bump or migration.
- No scenario logistics commands or scenario logistics authoring.
- No cached logistics projection, rejected-order record, alert history, or persisted alert counter.
- No new controller, state store/context, event bus, command bus, form engine, modal registry, graph engine, Phaser world scene, route animation, vehicles, or pathfinding.
- Command/quote failures stay inline; HUD logistics alerts derive only from persisted attempts.
- Capacity-pressure alert threshold is exactly two consecutive capacity-constrained attempts.
- Paused routes emit no normal-operation logistics alerts.
- `destinationNeed === 0` always means destination full.
- Historical utilization uses attempt-recorded capacity.
- `manageLogistics` is sandbox availability only.
- Endpoint selects omit obviously invalid cities, but HPA-294 remains final validator.
- Zero-stock materials remain selectable.
- Recurring-route quote assistance is optional defaulting only; manual-quote stock/cash failure never invalidates route creation.
- Existing retail replenishment, finance, events, scenarios, saves, map keep-alive, reports, and shortcuts stay behaviorally unchanged.

## Files

### Create

- `src/lib/components/game/LogisticsPanel.svelte`
- `src/lib/components/game/LogisticsPanel.svelte.spec.ts`
- `src/lib/components/game/WorldLogisticsRoutes.svelte`
- `src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts`
- `src/lib/components/game/LogisticsRouteInspector.svelte`
- `src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts`
- `src/routes/alertNavigation.spec.ts`

### Modify

- `src/lib/game/commandResult.ts`
- `src/lib/game/logisticsReadModels.ts`
- `src/lib/game/logisticsReadModels.spec.ts`
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
- `src/lib/components/game/WorldMap.svelte`
- `src/lib/components/game/WorldMap.svelte.spec.ts`
- `src/lib/components/game/ReportsPanel.svelte`
- `src/lib/components/game/ReportsPanel.svelte.spec.ts`
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

### Reuse in tests

- `src/lib/game/interCityLogistics.testUtils.ts`
  - `createTwoIndustryCityGame()`
  - `withCityMaterials(...)`
  - `withWarehouses(...)`
- `src/routes/retail-sim.e2e.ts`
  - `cityLocalInventoryLifecycleGame()`
  - `installSandboxAutoSave(page, game)`
  - `openManagementPanel(page, panelName)`
  - existing map-menu helpers

---

## Task 1: Route-level logistics rejection, controller methods, availability, and `L`

**Files:** `commandResult.ts`, `keyboardShortcuts.ts`, `keyboardShortcuts.spec.ts`, `gameRouteController.ts`, `gameRouteController.spec.ts`.

### Interfaces

In `commandResult.ts`:

```ts
import type { ManualTransferFailure, RecurringRouteFailure } from './interCityLogistics';

export type LogisticsFailureCode = ManualTransferFailure | RecurringRouteFailure;

export type LogisticsRejectedCommitResult = {
  status: 'logistics-rejected';
  reason: LogisticsFailureCode;
};
```

Add `LogisticsRejectedCommitResult` to the existing `GameRouteCommitResult` union.

In `gameRouteController.ts` extend the existing internal union with:

```ts
| { ok: false; logisticsFailure: LogisticsFailureCode }
```

Add methods:

```ts
dispatchManualTransfer(input: ManualTransferInput): Promise<GameRouteCommitResult>;
createRecurringRoute(input: RecurringRouteInput): Promise<GameRouteCommitResult>;
updateRecurringRoute(routeId: string, input: RecurringRouteUpdateInput): Promise<GameRouteCommitResult>;
pauseRecurringRoute(routeId: string): Promise<GameRouteCommitResult>;
resumeRecurringRoute(routeId: string): Promise<GameRouteCommitResult>;
reprioritizeRecurringRoute(routeId: string, priority: number): Promise<GameRouteCommitResult>;
removeRecurringRoute(routeId: string): Promise<GameRouteCommitResult>;
```

Add to `MutationAvailability`:

```ts
manageLogistics: boolean;
```

Implement exactly:

```ts
manageLogistics: input.playMode === 'sandbox'
```

### RED

- [ ] Use `createTwoIndustryCityGame()` plus `withWarehouses(...)`/`withCityMaterials(...)` for deterministic controller state.
- [ ] Add shortcut tests for `L`/`l`, typing/modifier/blocking-overlay suppression, and soft-panel switching.
- [ ] Add availability tests: sandbox `true`; scenario `false`; existing scenario pending behavior unchanged.
- [ ] Add successful manual dispatch: publish once, autosave once, committed game passed to autosave.
- [ ] Add rejected manual dispatch and assert exact `{ status: 'logistics-rejected', reason }`, no publish, no autosave.
- [ ] Table-test create/edit/pause/resume/reprioritize/remove successful controller wrappers.
- [ ] Add `route-not-found` rejection.
- [ ] Add scenario-mode test: all seven methods return `unavailable`; no new `ScenarioCommand` kind.

Run and confirm RED where new APIs are missing:

```bash
bun run test:unit -- --run \
  src/lib/game/keyboardShortcuts.spec.ts \
  src/routes/gameRouteController.spec.ts \
  --maxWorkers=1
```

### GREEN

- [ ] Add `'logistics'` to `ManagementPanelId` and `l: 'logistics'` to `MANAGEMENT_PANEL_SHORTCUTS`.
- [ ] Add `manageLogistics: input.playMode === 'sandbox'`; do not combine it with `input.pending`.
- [ ] Import HPA-294 functions with `...Transition` aliases.
- [ ] Add the `logisticsFailure` arm to `RouteTransitionResult` and its accepted `normalizeRouteTransition` input union.
- [ ] Adapt each HPA-294 result inside the public method's `commitMutation` transition callback:

```ts
const result = dispatchManualTransferTransition(game!, input);
return result.ok
  ? { ok: true, game: result.game, receipt: result.order }
  : { ok: false, logisticsFailure: result.reason };
```

- [ ] In sandbox `commitMutation`, before finance `domain-rejected`:

```ts
if ('logisticsFailure' in transition) {
  return { status: 'logistics-rejected', reason: transition.logisticsFailure };
}
```

- [ ] Leave finance/decision handling unchanged.
- [ ] Omit `scenarioCommand` from all logistics wrappers. Scenario mode becomes unavailable before transition execution; do not add scenario logistics rejection plumbing.
- [ ] Do not copy the retail-supply bare-`rejected` preflight and do not add a second sandbox persistence path.

### Verify

```bash
bun run test:unit -- --run \
  src/lib/game/keyboardShortcuts.spec.ts \
  src/routes/gameRouteController.spec.ts \
  --maxWorkers=1
bun run check
```

### Commit

```bash
git add src/lib/game/commandResult.ts src/lib/game/keyboardShortcuts.ts \
  src/lib/game/keyboardShortcuts.spec.ts src/routes/gameRouteController.ts \
  src/routes/gameRouteController.spec.ts
git commit -m "feat(logistics): expose route command boundary"
```

---

## Task 2: Logistics panel, valid endpoint options, typed feedback, and optional quote defaults

**Files:** new `LogisticsPanel` + spec, `gameCopy`, three locale catalogs, `ShortcutCheatSheet`, `ManagementPanelHost` + spec.

### Panel props

```ts
interface Props {
  game: GameState;
  i18n: I18nBundle;
  canMutate: boolean;
  disabledReason: string | null;
  focusedRouteId: string | null;
  focusedTransferOrderId: string | null;
  onDispatchManualTransfer: (input: ManualTransferInput) => Promise<GameRouteCommitResult>;
  onCreateRecurringRoute: (input: RecurringRouteInput) => Promise<GameRouteCommitResult>;
  onUpdateRecurringRoute: (routeId: string, input: RecurringRouteUpdateInput) => Promise<GameRouteCommitResult>;
  onPauseRecurringRoute: (routeId: string) => Promise<GameRouteCommitResult>;
  onResumeRecurringRoute: (routeId: string) => Promise<GameRouteCommitResult>;
  onReprioritizeRecurringRoute: (routeId: string, priority: number) => Promise<GameRouteCommitResult>;
  onRemoveRecurringRoute: (routeId: string) => Promise<GameRouteCommitResult>;
}
```

### Endpoint rule

A selectable endpoint must be:

```text
opened world city
AND industry-kind/current industry city
AND materialized in game.industryCities
AND represented in game.cityInventories
```

Do not filter materials by positive stock.

### RED

- [ ] Render `createTwoIndustryCityGame()` and assert only opened/materialized industry endpoints appear.
- [ ] Assert revealed/unopened and retail city IDs are absent.
- [ ] Assert a valid zero-stock material remains selectable.
- [ ] Manual form submits exact `ManualTransferInput`.
- [ ] Successful quote renders HPA-294 lead time/per-unit/total cost.
- [ ] Parameterize manual quote failures; every localized message is non-empty.
- [ ] `logistics-rejected` from dispatch replaces inline status and creates no fake history row.
- [ ] Empty states: no routes, no in-transit summary, no transfer history.
- [ ] Route create submits all HPA-294 fields.
- [ ] Focused route invokes edit/reprioritize/pause-resume/remove callbacks with current values.
- [ ] Focused transfer is visibly identified in history.
- [ ] `canMutate === false` leaves read-only data usable and blocks mutations.
- [ ] **Use quote** test: a successful quantity-1 manual quote fills exactly `leadTimeDays` and `transportCostPerUnit`.
- [ ] Quote-assist failure due zero stock or insufficient cash does **not** block manually entering those fields and submitting `onCreateRecurringRoute`.

### GREEN

- [ ] Add exhaustive `localizeLogisticsFailure(reason, i18n)` and all three locale entries.
- [ ] Build four responsive sections: Manual transfer, Recurring routes, In transit, Recent transfers/totals.
- [ ] Use HPA-294 `quoteInterCityTransfer` for quote evidence; never import/copy `INTER_CITY_DISTANCE_PER_BAND` arithmetic.
- [ ] Use `selectInTransitInventory`, `selectRecentTransfers`, `selectRouteOperations`, `selectLogisticsTotals` for displayed facts.
- [ ] Build endpoint options using the rule above; keep final command validation in HPA-294.
- [ ] Keep full material catalog visible even when stock is zero.
- [ ] For recurring route defaults, call:

```ts
quoteInterCityTransfer(game, {
  originCityId,
  destinationCityId,
  materialId,
  quantity: 1
});
```

- [ ] On success copy only `leadTimeDays` and `transportCostPerUnit`.
- [ ] On `insufficient-origin-stock`/`insufficient-cash`, explain only that optional quote defaults are unavailable; leave explicit route fields valid/editable.
- [ ] Keep priority as a separate action; edit uses `RecurringRouteUpdateInput`.
- [ ] Add Logistics / `L` to `ShortcutCheatSheet`.
- [ ] Add one explicit `panelId === 'logistics'` branch to `ManagementPanelHost`.

### Verify

```bash
bun run test:unit -- --run \
  src/lib/components/game/LogisticsPanel.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  src/lib/i18n/gameCopy.spec.ts \
  --maxWorkers=1
bun run check
```

### Commit

```bash
git add src/lib/components/game/LogisticsPanel.svelte \
  src/lib/components/game/LogisticsPanel.svelte.spec.ts \
  src/lib/components/game/ShortcutCheatSheet.svelte src/lib/i18n/gameCopy.ts \
  src/lib/i18n/gameCopy.spec.ts src/lib/i18n/messages/en.ts \
  src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts \
  src/routes/ManagementPanelHost.svelte src/routes/ManagementPanelHost.svelte.spec.ts
git commit -m "feat(logistics): add operations management panel"
```

---

## Task 3: Shared attempt classification, SVG routes, and explicitly gated route inspector

**Files:** `logisticsReadModels` + spec, new `WorldLogisticsRoutes` + spec, new `LogisticsRouteInspector` + spec, `WorldMap` + spec, `MapSurfaceHost` + spec, `MapInspectorHost` + spec.

### Pure interfaces

```ts
export type RouteOperationalCondition =
  | 'awaiting-dispatch'
  | 'destination-full'
  | 'origin-stock-constrained'
  | 'route-capacity-constrained'
  | 'normal';

export function classifyRouteDispatchAttempt(
  attempt: DailyRouteDispatchAttempt | null
): RouteOperationalCondition;

export function selectRecentRouteDispatchAttempts(
  game: GameState,
  routeId: string,
  limit: number
): DailyRouteDispatchAttempt[];
```

Classification order is normative:

1. null → awaiting;
2. `destinationNeed === 0` → destination full;
3. `availableOriginStock < Math.min(destinationNeed, capacity)` → origin constrained;
4. `unmetDestinationNeed > 0 && dispatchedQuantity === capacity` → capacity constrained;
5. normal.

### MapInspectorHost props

```ts
showLogisticsRouteInspector: boolean;
selectedLogisticsRoute: RouteOperationalSummary | null;
onManageLogisticsRoute: (routeId: string) => void;
onCloseLogisticsRouteInspector: () => void;
```

### RED

- [ ] One test for every classification.
- [ ] `availableOriginStock === capacity < destinationNeed` → capacity constrained.
- [ ] `destinationNeed === 0`, no stock, unused capacity → destination full.
- [ ] Explicit zero-dispatch origin-empty fixture:

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

Assert origin-stock-constrained.

- [ ] Recent-attempt selector returns newest matching route attempts across reports.
- [ ] Active and paused routes render straight SVG connections; paused has dashed non-color semantics; direction has arrow marker.
- [ ] Every route has a native keyboard-focusable selector with origin/destination/material/state/condition text.
- [ ] Route selection invokes exact ID and selected semantics.
- [ ] No routes → no orphan route layer/list chrome.
- [ ] Inspector renders `RouteOperationalSummary.utilization` directly and latest attempt facts.
- [ ] `showLogisticsRouteInspector === false` + non-null summary → no overlay.
- [ ] show true + summary → exactly one inspector.
- [ ] null summary → no empty overlay chrome.
- [ ] Existing retail/rail/industry host branches remain green.

### GREEN

- [ ] Add the two pure helpers to `logisticsReadModels.ts`; no cache/state.
- [ ] Build `WorldLogisticsRoutes`: percentage-coordinate straight SVG + native route button list.
- [ ] Resolve geometry only from existing world city `worldX/worldY`.
- [ ] Solid active / dashed paused + text labels; color is supplementary.
- [ ] Compose inside the existing `WorldMap` viewport/list.
- [ ] `WorldMap`/`MapSurfaceHost` forward route summaries, selected route ID, and selection callback only.
- [ ] Build read-only `LogisticsRouteInspector` from one `RouteOperationalSummary`.
- [ ] `MapInspectorHost` renders logistics only when:

```ts
showLogisticsRouteInspector && selectedLogisticsRoute
```

- [ ] Reuse `.inspector-overlay` for route inspector clearance.
- [ ] Keep the existing `.world-inspector` city inspector in `WorldMap`; do not move it.

### Verify

```bash
bun run test:unit -- --run \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts \
  src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts \
  src/lib/components/game/WorldMap.svelte.spec.ts \
  src/routes/MapSurfaceHost.svelte.spec.ts \
  src/routes/MapInspectorHost.svelte.spec.ts \
  --maxWorkers=1
bun run check
```

### Commit

```bash
git add src/lib/game/logisticsReadModels.ts src/lib/game/logisticsReadModels.spec.ts \
  src/lib/components/game/WorldLogisticsRoutes.svelte \
  src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts \
  src/lib/components/game/LogisticsRouteInspector.svelte \
  src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts \
  src/lib/components/game/WorldMap.svelte src/lib/components/game/WorldMap.svelte.spec.ts \
  src/routes/MapSurfaceHost.svelte src/routes/MapSurfaceHost.svelte.spec.ts \
  src/routes/MapInspectorHost.svelte src/routes/MapInspectorHost.svelte.spec.ts
git commit -m "feat(logistics): show selectable world routes"
```

---

## Task 4: Evidence-derived alerts and alert-navigation test ownership

**Files:** `alerts` + spec, `gameCopy` + spec, three locale catalogs, `alertNavigation.ts`, new `alertNavigation.spec.ts`, `page.svelte.spec.ts`.

### Interfaces

```ts
export const LOGISTICS_CAPACITY_PRESSURE_ATTEMPTS = 2;
```

Add alert kinds:

```ts
'logistics-origin-stock'
'logistics-route-capacity'
```

Add optional `routeId` to `GameAlert`.

Replace panel-only navigation with:

```ts
export type AlertNavigation =
  | {
      kind: 'panel';
      panelId: 'finance' | 'decisions';
      focusedFinanceLoanId: string | null;
    }
  | { kind: 'world-route'; routeId: string };
```

### RED

- [ ] Latest active attempt origin constrained → one route alert.
- [ ] Destination full → no constraint alert.
- [ ] One capacity hit → no capacity alert.
- [ ] Two newest capacity hits → one capacity alert.
- [ ] Newest normal attempt breaks streak.
- [ ] Paused route suppresses both.
- [ ] Removed-route history emits none.
- [ ] Localized logistics alerts are non-empty and include route/city/material context.
- [ ] `resolveAlertNavigation` preserves finance/decision navigation and returns world-route for logistics.
- [ ] Move existing `resolveAlertPanelNavigation` tests/import from `page.svelte.spec.ts` into `alertNavigation.spec.ts`; do not duplicate them.

### GREEN

- [ ] Add small derived `collectLogisticsAlerts(game)`.
- [ ] Iterate current routes in deterministic route order; skip paused routes.
- [ ] Use `selectRecentRouteDispatchAttempts` + `classifyRouteDispatchAttempt`.
- [ ] Origin alert uses latest attempt immediately.
- [ ] Capacity alert requires newest two attempts both capacity constrained.
- [ ] Add complete localization in all three locales; logistics must not fall through to empty alert text.
- [ ] Rename helper to `resolveAlertNavigation` and update all imports in this task.
- [ ] Do not create HUD alerts for inline command failures.

### Verify

```bash
bun run test:unit -- --run \
  src/lib/game/alerts.spec.ts src/lib/i18n/gameCopy.spec.ts \
  src/routes/alertNavigation.spec.ts src/routes/page.svelte.spec.ts \
  --maxWorkers=1
bun run check
```

### Commit

```bash
git add src/lib/game/alerts.ts src/lib/game/alerts.spec.ts \
  src/lib/i18n/gameCopy.ts src/lib/i18n/gameCopy.spec.ts \
  src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts \
  src/lib/i18n/messages/zh-Hant.ts src/routes/alertNavigation.ts \
  src/routes/alertNavigation.spec.ts src/routes/page.svelte.spec.ts
git commit -m "feat(logistics): derive actionable route alerts"
```

---

## Task 5: Latest-day logistics reports and narrow navigation callbacks

**Files:** `ReportsPanel` + spec, `ManagementPanelHost` + spec, three locale catalogs.

### Callbacks

```ts
onOpenLogisticsRoute?: (routeId: string) => void;
onOpenLogisticsTransfer?: (transferOrderId: string) => void;
```

### RED

- [ ] No logistics activity → compact zero/empty state without invented rows.
- [ ] Arrival row renders transfer ID/endpoints/material/quantity.
- [ ] Attempt row renders route ID/destination need/attempt capacity/dispatched/unused/unmet/cost.
- [ ] `destinationNeed === 0` uses destination-full copy.
- [ ] Utilization text uses attempt-recorded capacity only.
- [ ] Attempt click invokes route callback; arrival click invokes transfer callback.
- [ ] Existing report sections remain green.

### GREEN

- [ ] Add one latest-day Logistics section using only `summary.latest.logistics` evidence.
- [ ] Pass the two explicit callbacks through the Reports branch of `ManagementPanelHost`.
- [ ] Add all locale copy.
- [ ] Do not add a generic report-link object or URL protocol.

### Verify

```bash
bun run test:unit -- --run \
  src/lib/components/game/ReportsPanel.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  --maxWorkers=1
bun run check
```

### Commit

```bash
git add src/lib/components/game/ReportsPanel.svelte \
  src/lib/components/game/ReportsPanel.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte src/routes/ManagementPanelHost.svelte.spec.ts \
  src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts
git commit -m "feat(logistics): expose daily logistics reports"
```

---

## Task 6: Page composition and early route-navigation smoke

**Files:** `+page.svelte`, `page.svelte.spec.ts` only for affected existing pure/controller coverage, `retail-sim.e2e.ts`; re-run all three route-host specs.

### Transient state

```ts
let selectedLogisticsRouteId = $state<string | null>(null);
let focusedLogisticsRouteId = $state<string | null>(null);
let focusedLogisticsTransferId = $state<string | null>(null);

let routeOperations = $derived(game ? selectRouteOperations(game) : []);
let selectedLogisticsRoute = $derived(
  selectedLogisticsRouteId
    ? routeOperations.find((summary) => summary.route.id === selectedLogisticsRouteId) ?? null
    : null
);
let showLogisticsRouteInspector = $derived(
  activeMapView === 'world' && selectedLogisticsRoute !== null
);
```

`page.svelte.spec.ts` does not mount `+page.svelte`; do not extract a navigation reducer/store solely for unit coverage. Prove page-owned exclusivity with a small early Playwright smoke instead of waiting for the full lifecycles.

### Test-local fixture

In `retail-sim.e2e.ts`, add:

```ts
function logisticsOperationsGame(): GameState {
  const base = cityLocalInventoryLifecycleGame();
  const created = createRecurringRoute(base, {
    originCityId: 'breadbasket-basin',
    destinationCityId: 'industry-city',
    materialId: 'bottled-water',
    capacity: 5,
    frequencyDays: 2,
    leadTimeDays: 2,
    transportCostPerUnit: 2,
    priority: 0
  });
  if (!created.ok) {
    throw new Error(`Could not create logistics E2E route: ${created.reason}`);
  }
  return created.game;
}
```

Name the focused test exactly:

```ts
test('logistics route navigation', async ({ page }) => {
  // assertions below
});
```

Load state through the real save/resume path:

```ts
await installSandboxAutoSave(page, logisticsOperationsGame());
```

### Wire composition

- [ ] Add Logistics / `L` to `managementPanelMenuConfig`.
- [ ] Wire route summaries/selection through `MapSurfaceHost`.
- [ ] Wire explicit `showLogisticsRouteInspector`, selected summary, close/manage through `MapInspectorHost`.
- [ ] Wire Logistics panel props/callbacks/focus through `ManagementPanelHost`.
- [ ] Directly bind all seven panel mutations to controller methods.
- [ ] Add concrete `selectLogisticsRoute(routeId)`: world view, clear city/retail/industry selections, select route.
- [ ] World-city selection clears route selection.
- [ ] Add concrete `openLogisticsManagement({ routeId?, transferOrderId? })`; do not generalize management navigation.
- [ ] Report route → world route selection; report transfer → focused Logistics panel.
- [ ] `handleSelectAlert` switches on `AlertNavigation` before existing store/factory fallback.
- [ ] Reset/load/scenario-transition/Escape clear logistics transient state wherever sibling selections are cleared.
- [ ] Successful removal clears matching selected/focused route state.

### Early Playwright smoke

- [ ] Load `logisticsOperationsGame()`.
- [ ] Open world map and select the route through its accessible route button.
- [ ] Assert exactly one logistics route inspector is visible.
- [ ] Assert no world-city inspector remains open.
- [ ] Use Manage route; assert Logistics opens focused on that route.
- [ ] Close Logistics, select a world city; assert route inspector is gone.
- [ ] Re-select route, remove it via Logistics, return to world view; assert no stale route inspector.

### Verify

```bash
bun run test:unit -- --run \
  src/routes/page.svelte.spec.ts src/routes/MapSurfaceHost.svelte.spec.ts \
  src/routes/MapInspectorHost.svelte.spec.ts src/routes/ManagementPanelHost.svelte.spec.ts \
  --maxWorkers=1
bun run check
bun run test:e2e -- --workers=1 src/routes/retail-sim.e2e.ts --grep "logistics route navigation"
```

### Commit

```bash
git add src/routes/+page.svelte src/routes/page.svelte.spec.ts src/routes/retail-sim.e2e.ts
git commit -m "feat(logistics): wire route navigation"
```

---

## Task 7: Full manual/recurring UI lifecycles and ninth-launcher clearance

**Files:** `retail-sim.e2e.ts`; modify `MapInspectorHost.svelte` + spec only if the clearance test first demonstrates overlap.

Each lifecycle starts fresh with:

```ts
await installSandboxAutoSave(page, cityLocalInventoryLifecycleGame());
```

That existing helper already provides two opened/materialized industry cities, warehouses, bottled-water stock, city inventories, and ample cash.

### Manual transfer E2E

- [ ] Open Logistics (`L` or `openManagementPanel(page, /logistics/i)`).
- [ ] Select `breadbasket-basin` → `industry-city`, material `bottled-water`, quantity `5`.
- [ ] Assert rendered HPA-294 quote.
- [ ] Dispatch; assert in-transit route/history facts and expected quantity.
- [ ] Advance real UI until arrival.
- [ ] Assert delivered history/latest-day report evidence and destination inventory increase.
- [ ] Try one invalid/insufficient manual input and prove transfer count does not increase.

### Recurring route E2E

- [ ] Fresh fixture; create `breadbasket-basin` → `industry-city` bottled-water route.
- [ ] Use quote defaults if available; if quote assistance is unavailable because current manual quote eligibility fails, enter explicit lead/cost and prove route creation remains usable.
- [ ] Advance through scheduled attempt and delivery.
- [ ] World map: discover/select route through native route control.
- [ ] Inspector: assert schedule, totals, latest attempt facts, condition.
- [ ] Manage route opens focused Logistics.
- [ ] Exercise pause/resume or reprioritize.
- [ ] Assert active/paused distinction is textual + solid/dashed, not color-only.

### Layout regression

At the existing HPA-568 laptop/desktop width:

- [ ] Logistics route inspector actions are above/clickable despite ninth launcher.
- [ ] Existing retail/industry inspector clearance remains covered.
- [ ] Selecting route leaves no world-city inspector open; do not assume the two inspector types share chrome.
- [ ] Only if this test fails from real overlap, adjust `MapInspectorHost` bottom clearance and add/retain a matching component assertion.
- [ ] Do not move `WorldMap` city inspector or redesign `ControlDesk` preemptively.

### Verify

```bash
bun run test:e2e -- --workers=1 src/routes/retail-sim.e2e.ts
bun run check
```

### Commit

Stage the E2E file first:

```bash
git add src/routes/retail-sim.e2e.ts
```

If the failing clearance test required a host fix, also stage:

```bash
git add src/routes/MapInspectorHost.svelte src/routes/MapInspectorHost.svelte.spec.ts
```

Then:

```bash
git commit -m "test(logistics): cover operations UI lifecycle"
```

---

## Task 8: Full verification and scope audit

### Focused regression

```bash
bun run test:unit -- --run \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/game/alerts.spec.ts \
  src/lib/game/keyboardShortcuts.spec.ts \
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
  src/routes/page.svelte.spec.ts \
  --maxWorkers=1
bun run check
bun run lint
bun run test:e2e -- --workers=1 src/routes/retail-sim.e2e.ts
bun run test
```

### Scope audits

No persistence/scenario feature changes:

```bash
git diff main...HEAD -- src/lib/persistence src/lib/scenarios
```

No copied logistics arithmetic in UI:

```bash
rg "INTER_CITY_DISTANCE_PER_BAND|Math\.min\(|destinationNeed|transportCostPerUnit.*quantity" \
  src/lib/components src/routes
```

Review every hit. Evidence display/input binding is allowed; copied dispatch/distance arithmetic is not.

Quote assist delegates to HPA-294:

```bash
rg "quoteInterCityTransfer|INTER_CITY_DISTANCE_PER_BAND" \
  src/lib/components/game/LogisticsPanel.svelte src/routes
```

Expected: quote helper use; no UI distance-band constant/arithmetic.

No material-by-stock filtering:

```bash
rg "materials\[.*\].*>\s*0|stock.*material.*filter|material.*stock.*filter" \
  src/lib/components/game/LogisticsPanel.svelte
```

No forbidden generic infrastructure:

```bash
rg "Logistics(Store|Controller|Router|Registry|EventBus)|GraphEngine|RouteAnimation|Vehicle" src
```

No orphan old helper:

```bash
rg "resolveAlertPanelNavigation" src
```

Expected: zero matches.

Explicit inspector gating:

```bash
rg "showLogisticsRouteInspector|selectedLogisticsRoute" src/routes src/lib/components/game
```

Confirm route host guard exists and `WorldMap` city inspector was not moved.

Diff hygiene:

```bash
git diff --check main...HEAD
git status --short
```

### Whole-branch review checklist

- [ ] Logistics failure cannot fall through to finance `domain-rejected`.
- [ ] No second sandbox mutation/autosave path.
- [ ] No invented sandbox pending behavior.
- [ ] Quote assistance cannot block otherwise-valid recurring-route creation due current stock/cash.
- [ ] Endpoint selects omit easy invalid city choices.
- [ ] Zero-stock materials remain selectable.
- [ ] No duplicate logistics state/math.
- [ ] No scenario capability drift.
- [ ] No stale route selection after remove/load/reset.
- [ ] Route inspector cannot render off world view or with null current route.
- [ ] Route selection cannot leave world-city inspector simultaneously open.
- [ ] Logistics alert/failure copy never becomes empty.
- [ ] Destination-full and zero-stock-origin cases classify correctly.
- [ ] Historical utilization never uses current route capacity.
- [ ] Route discovery is not SVG-only.
- [ ] Ninth launcher does not cover inspector actions.

### Final-fix commit, only when needed

Inspect changed files first:

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

Then commit:

```bash
git commit -m "fix(logistics): complete operations UI integration"
```

Do not create an empty final commit.

## Completion criteria

- Manual transfer: quote → dispatch → transit → delivery → reports/history works through real UI.
- Typed failures remain localized inline and create no rejected persistent record.
- Controller uses a first-class `logisticsFailure` transition arm and exact `logistics-rejected` reason.
- All logistics mutations reuse `commitMutation`; no second sandbox pipeline.
- `manageLogistics` is exactly sandbox availability.
- Recurring routes support create/edit/reprioritize/pause-resume/remove/inspect.
- Optional quote defaults come from HPA-294 only and never make stock/cash a route-creation prerequisite.
- Endpoint selects omit unopened/non-industry/unmaterialized cities; zero-stock materials remain selectable.
- All operational facts come from HPA-294 orders/attempts/read models.
- Historical utilization remains stable after route edits.
- Destination-full and zero-dispatch origin-empty conditions are distinct/correct.
- World routes are directional, selectable, keyboard discoverable, and state is not color-only.
- Route inspector is explicitly gated to world view + current route; city inspector remains in `WorldMap` and is mutually exclusive.
- Alerts are evidence-derived with no persisted counter/history.
- Alert navigation tests live in `alertNavigation.spec.ts` after rename.
- Report rows navigate to the correct current route/transfer.
- Route composition gets the early `logistics route navigation` smoke before full lifecycles.
- Full E2E reuses `cityLocalInventoryLifecycleGame()` + `installSandboxAutoSave(...)`; no production-only fixture.
- Ninth-launcher clearance is evidence-driven, not preemptive redesign.
- Existing scenario and retail-replenishment behavior stays unchanged.
- Focused tests, `bun run check`, `bun run lint`, targeted E2E, and full `bun run test` pass before implementation completion.