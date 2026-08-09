# Logistics Operations and World-Route UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HPA-294 inter-city logistics playable and inspectable through one management surface, simple selectable world-map route visuals, route/report navigation, and evidence-derived alerts without duplicating logistics rules or persisted state.

**Architecture:** Keep `GameRouteController` as the only mutation/persistence coordinator and `+page.svelte` as the transient navigation/selection root. Extend the three HPA-568 route hosts with three logistics-specific components. Consume HPA-294 commands/read models directly; add only small pure evidence-classification helpers shared by presentation and alerts.

**Tech Stack:** TypeScript 6, Svelte 5/SvelteKit, existing DOM world map plus SVG, Vitest browser/unit tests, Playwright E2E, existing i18n catalogs, existing sandbox autosave pipeline.

## Global constraints

- HPA-294 / PR #35 and HPA-568 / PR #38 are the implementation baseline.
- Do not change transfer dispatch math, route scheduling, destination reservations, inventory conservation, transport accounting, or persistence.
- Do not add a save-schema bump, migration, cached logistics projection, rejected-order record, alert-history store, or persisted alert counter.
- Do not add scenario logistics commands or scenario authoring. Logistics mutations remain sandbox-only in HPA-574.
- Do not add a new route controller, state store/context layer, event bus, command bus, form engine, modal registry, graph framework, Phaser world scene, route animation layer, vehicle simulation, or pathfinding.
- Manual quote failures and command rejections are inline panel feedback, not HUD alerts.
- HUD logistics alerts derive only from persisted route-attempt evidence.
- Route-capacity pressure requires two consecutive capacity-constrained attempts; the threshold is a constant, not state.
- Paused routes do not emit normal-operation logistics alerts.
- `destinationNeed === 0` is a destination-full state, never an origin/capacity shortage.
- Route historical utilization continues to use attempt-recorded capacity from HPA-294.
- Endpoint selects may filter obviously invalid cities, but HPA-294 remains the final validator.
- Do not hide valid materials merely because current origin stock is zero.
- Recurring-route quote assistance is optional presentation defaulting only. A manual-quote stock/cash failure must not invalidate a recurring route.
- Existing retail replenishment, finance, events, scenarios, map keep-alive, save, report, and shortcut flows must remain unchanged.

## File map

### New production files

- `src/lib/components/game/LogisticsPanel.svelte`
- `src/lib/components/game/WorldLogisticsRoutes.svelte`
- `src/lib/components/game/LogisticsRouteInspector.svelte`

### New focused tests

- `src/lib/components/game/LogisticsPanel.svelte.spec.ts`
- `src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts`
- `src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts`
- `src/routes/alertNavigation.spec.ts`

### Existing boundaries to extend

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
- `src/lib/components/game/WorldMap.svelte`
- `src/lib/components/game/WorldMap.svelte.spec.ts`
- `src/lib/components/game/ReportsPanel.svelte`
- `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- `src/lib/components/game/ShortcutCheatSheet.svelte`
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

### Existing test utilities to reuse

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

## Task 1: Add the route-level logistics command/rejection contract and `L` shortcut

**Files**

- Modify: `src/lib/game/commandResult.ts`
- Modify: `src/lib/game/keyboardShortcuts.ts`
- Modify: `src/lib/game/keyboardShortcuts.spec.ts`
- Modify: `src/routes/gameRouteController.ts`
- Modify: `src/routes/gameRouteController.spec.ts`
- Test imports only: `src/lib/game/interCityLogistics.testUtils.ts`

**Interfaces**

In `commandResult.ts`:

```ts
import type {
  ManualTransferFailure,
  RecurringRouteFailure
} from './interCityLogistics';

export type LogisticsFailureCode =
  | ManualTransferFailure
  | RecurringRouteFailure;

export type GameRouteCommitResult =
  | existing variants
  | { status: 'logistics-rejected'; reason: LogisticsFailureCode };
```

In `gameRouteController.ts`, widen the internal transition union explicitly:

```ts
type RouteTransitionResult<TReceipt = undefined> =
  | { ok: true; game: GameState; receipt: TReceipt }
  | { ok: false; code: FinanceFailureCode; context: Record<string, string | number> }
  | {
      ok: false;
      decisionFailure: Extract<DecisionResolutionResult, { ok: false }>;
    }
  | { ok: false; logisticsFailure: LogisticsFailureCode };
```

Add controller methods:

```ts
dispatchManualTransfer(input: ManualTransferInput): Promise<GameRouteCommitResult>;
createRecurringRoute(input: RecurringRouteInput): Promise<GameRouteCommitResult>;
updateRecurringRoute(
  routeId: string,
  input: RecurringRouteUpdateInput
): Promise<GameRouteCommitResult>;
pauseRecurringRoute(routeId: string): Promise<GameRouteCommitResult>;
resumeRecurringRoute(routeId: string): Promise<GameRouteCommitResult>;
reprioritizeRecurringRoute(routeId: string, priority: number): Promise<GameRouteCommitResult>;
removeRecurringRoute(routeId: string): Promise<GameRouteCommitResult>;
```

Add one availability flag:

```ts
interface MutationAvailability {
  // existing fields
  manageLogistics: boolean;
}
```

Its exact implementation is:

```ts
manageLogistics: input.playMode === 'sandbox'
```

Do not add a sandbox pending gate. `MutationAvailability.pending` remains scenario-only.

### Tests first

- [ ] Use `createTwoIndustryCityGame()` plus `withWarehouses(...)` / `withCityMaterials(...)` as needed to create a deterministic controller fixture with two valid industry endpoints.
- [ ] Add shortcut tests proving `L`/`l` toggles `logistics`, respects typing/modifier/blocking-overlay rules, and remains a panel-toggle key while another soft panel is open.
- [ ] Add `createMutationAvailability` assertions: sandbox → `manageLogistics === true`; scenario → `false` regardless of scenario allowed-command contents; scenario pending semantics remain unchanged.
- [ ] Add successful manual-dispatch controller coverage: one state publish, one sandbox autosave of the committed game, and no second persistence path.
- [ ] Add a manual-transfer typed rejection (`insufficient-origin-stock` or another HPA-294 reason) and assert `{ status: 'logistics-rejected', reason }`, no state publish, and no autosave.
- [ ] Add compact route lifecycle controller coverage for create, edit, pause, resume, reprioritize, and remove.
- [ ] Add `route-not-found` coverage for a current-route action.
- [ ] Add scenario-mode coverage proving all seven methods return `unavailable` and no `ScenarioCommand` variant is added.

### Implementation

- [ ] Add `'logistics'` to `ManagementPanelId` and `l: 'logistics'` to `MANAGEMENT_PANEL_SHORTCUTS`.
- [ ] Add `manageLogistics: input.playMode === 'sandbox'` to `createMutationAvailability`.
- [ ] Import HPA-294 transitions with aliases such as `dispatchManualTransferTransition` to avoid class-method name collisions.
- [ ] Extend `RouteTransitionResult` with `{ ok: false; logisticsFailure: LogisticsFailureCode }`.
- [ ] Keep `normalizeRouteTransition` as the single normalization entry point; widen its accepted union so a pre-adapted logistics-failure arm passes through unchanged.
- [ ] At **each public logistics method**, adapt the HPA-294 result before returning it from the `commitMutation` transition callback. Example:

```ts
transition: (game) => {
  const result = dispatchManualTransferTransition(game!, input);
  return result.ok
    ? { ok: true, game: result.game, receipt: result.order }
    : { ok: false, logisticsFailure: result.reason };
}
```

- [ ] In the sandbox rejection branch of `commitMutation`, check logistics before the finance fallback:

```ts
if ('logisticsFailure' in transition) {
  return {
    status: 'logistics-rejected',
    reason: transition.logisticsFailure
  };
}
```

- [ ] Leave finance `domain-rejected` and decision rejection unchanged.
- [ ] Omit `scenarioCommand` from all logistics wrappers. Scenario mode returns `unavailable` before a logistics transition runs; do not add a scenario logistics failure arm or duplicate scenario rejection plumbing.
- [ ] Do not mirror the retail-supply sandbox preflight that returns bare `rejected`.
- [ ] Do not add another sandbox mutation/autosave helper.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/game/keyboardShortcuts.spec.ts \
  src/routes/gameRouteController.spec.ts \
  --maxWorkers=1
bun run check
```

**Commit**

```bash
git add \
  src/lib/game/commandResult.ts \
  src/lib/game/keyboardShortcuts.ts \
  src/lib/game/keyboardShortcuts.spec.ts \
  src/routes/gameRouteController.ts \
  src/routes/gameRouteController.spec.ts
git commit -m "feat(logistics): expose route command boundary"
```

---

## Task 2: Build the Logistics management panel with filtered endpoints and best-effort quote defaults

**Files**

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
- Test imports only: `src/lib/game/interCityLogistics.testUtils.ts`

**Panel contract**

Keep callbacks explicit:

```ts
interface Props {
  game: GameState;
  i18n: I18nBundle;
  canMutate: boolean;
  disabledReason: string | null;
  focusedRouteId: string | null;
  focusedTransferOrderId: string | null;

  onDispatchManualTransfer: (
    input: ManualTransferInput
  ) => Promise<GameRouteCommitResult>;
  onCreateRecurringRoute: (
    input: RecurringRouteInput
  ) => Promise<GameRouteCommitResult>;
  onUpdateRecurringRoute: (
    routeId: string,
    input: RecurringRouteUpdateInput
  ) => Promise<GameRouteCommitResult>;
  onPauseRecurringRoute: (routeId: string) => Promise<GameRouteCommitResult>;
  onResumeRecurringRoute: (routeId: string) => Promise<GameRouteCommitResult>;
  onReprioritizeRecurringRoute: (
    routeId: string,
    priority: number
  ) => Promise<GameRouteCommitResult>;
  onRemoveRecurringRoute: (routeId: string) => Promise<GameRouteCommitResult>;
}
```

No generic form/command abstraction is introduced.

### Endpoint option contract

The component derives selectable endpoints by intersecting current state:

```ts
opened industry world city
&& materialized game.industryCities entry
&& game.cityInventories entry
```

HPA-294 remains the final validator.

Do **not** filter materials by `inventory.materials[materialId] > 0`; zero stock is meaningful for recurring-route planning and manual-transfer failure feedback.

### Tests first

- [ ] Render with `createTwoIndustryCityGame()` and prove only opened/materialized industry endpoints appear.
- [ ] Inject/reuse a revealed-but-unopened city and prove it is absent.
- [ ] Prove retail city IDs are absent from origin/destination selects.
- [ ] Prove a valid material with zero origin stock remains in the material selector.
- [ ] Submit manual origin/destination/material/quantity and assert the exact `ManualTransferInput` callback payload.
- [ ] Add successful manual quote coverage showing HPA-294 lead time, per-unit cost, and total cost.
- [ ] Parameterize manual quote failures and assert localized non-empty copy.
- [ ] Add dispatch-time `logistics-rejected` coverage; the same typed reason replaces inline status and no fake transfer row appears.
- [ ] Add empty-state coverage for no in-transit inventory/history/routes.
- [ ] Add recurring-route creation coverage for all HPA-294 fields.
- [ ] Add **Use quote** coverage: with a successful `quoteInterCityTransfer(game, { originCityId, destinationCityId, materialId, quantity: 1 })`, clicking the action fills exactly `quote.leadTimeDays` and `quote.transportCostPerUnit`.
- [ ] Add a zero-stock or insufficient-cash quote-assist case: quote assistance is unavailable/diagnostic, but manually entered lead time/cost can still submit `onCreateRecurringRoute`.
- [ ] Add focused-route coverage for edit, reprioritize, pause/resume, and remove callbacks.
- [ ] Add focused-transfer coverage proving the requested transfer is marked/current in history.
- [ ] Add disabled-state coverage: inspection remains usable when `canMutate === false`, but mutation callbacks cannot fire.

### Implementation

- [ ] Add `localizeLogisticsFailure(reason, i18n)` with an exhaustive switch over the combined HPA-294 failure union.
- [ ] Add all matching copy in English, Japanese, and Traditional Chinese in the same commit.
- [ ] Build four sections: Manual transfer, Recurring routes, In transit, Recent transfers/totals.
- [ ] Use `quoteInterCityTransfer` directly for manual quote evidence; never reconstruct distance/cost in Svelte.
- [ ] Use HPA-294 selectors directly for transit/history/route/totals display.
- [ ] Build endpoint options from opened materialized industry cities with inventories. Keep HPA-294 validation on submit.
- [ ] Keep the full material catalog visible; do not hide zero-stock materials.
- [ ] For recurring-route **Use quote**, call the existing quote helper with `quantity: 1` only after origin/destination/material are selected.
- [ ] On successful quote, copy only `leadTimeDays` and `transportCostPerUnit` into the form.
- [ ] On `insufficient-origin-stock` or `insufficient-cash`, do not mark recurring-route input invalid; leave explicit fields editable and explain only that the optional quote default is unavailable for current state.
- [ ] Do not import/use `INTER_CITY_DISTANCE_PER_BAND` or duplicate its arithmetic in the component.
- [ ] Keep priority separate from route edit (`RecurringRouteUpdateInput`).
- [ ] Add `logistics` / `L` to `ShortcutCheatSheet`.
- [ ] Add one `panelId === 'logistics'` branch in `ManagementPanelHost` and pass explicit props/callbacks.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/components/game/LogisticsPanel.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  src/lib/i18n/gameCopy.spec.ts \
  --maxWorkers=1
bun run check
```

**Commit**

```bash
git add \
  src/lib/components/game/LogisticsPanel.svelte \
  src/lib/components/game/LogisticsPanel.svelte.spec.ts \
  src/lib/components/game/ShortcutCheatSheet.svelte \
  src/lib/i18n/gameCopy.ts \
  src/lib/i18n/gameCopy.spec.ts \
  src/lib/i18n/messages/en.ts \
  src/lib/i18n/messages/ja.ts \
  src/lib/i18n/messages/zh-Hant.ts \
  src/routes/ManagementPanelHost.svelte \
  src/routes/ManagementPanelHost.svelte.spec.ts
git commit -m "feat(logistics): add operations management panel"
```

---

## Task 3: Add shared attempt classification, world-route visuals, and explicitly gated route inspector

**Files**

- Modify: `src/lib/game/logisticsReadModels.ts`
- Modify: `src/lib/game/logisticsReadModels.spec.ts`
- Create: `src/lib/components/game/WorldLogisticsRoutes.svelte`
- Create: `src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts`
- Create: `src/lib/components/game/LogisticsRouteInspector.svelte`
- Create: `src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/WorldMap.svelte`
- Modify: `src/lib/components/game/WorldMap.svelte.spec.ts`
- Modify: `src/routes/MapSurfaceHost.svelte`
- Modify: `src/routes/MapSurfaceHost.svelte.spec.ts`
- Modify: `src/routes/MapInspectorHost.svelte`
- Modify: `src/routes/MapInspectorHost.svelte.spec.ts`

**Pure helpers**

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

Normative classification order:

1. `null` → awaiting dispatch;
2. `destinationNeed === 0` → destination full;
3. `availableOriginStock < Math.min(destinationNeed, capacity)` → origin stock constrained;
4. `unmetDestinationNeed > 0 && dispatchedQuantity === capacity` → route capacity constrained;
5. normal.

**MapInspectorHost logistics props**

```ts
showLogisticsRouteInspector: boolean;
selectedLogisticsRoute: RouteOperationalSummary | null;
onManageLogisticsRoute: (routeId: string) => void;
onCloseLogisticsRouteInspector: () => void;
```

The page later computes:

```ts
showLogisticsRouteInspector =
  activeMapView === 'world' && selectedLogisticsRoute !== null;
```

### Tests first: read models

- [ ] Add one fixture for each condition.
- [ ] Add the overlap `availableOriginStock === capacity < destinationNeed`; assert capacity-constrained.
- [ ] Add `destinationNeed === 0` with unused capacity and no stock; assert destination-full wins.
- [ ] Add the named zero-dispatch origin-empty case:

```ts
availableOriginStock: 0,
destinationNeed: 10,
capacity: 5,
dispatchedQuantity: 0,
unmetDestinationNeed: 10
```

Assert `origin-stock-constrained`.

- [ ] Add recent-attempt ordering across multiple reports/routes; return newest matching evidence only.

### Tests first: world routes

- [ ] Render one active and one paused route; assert two SVG connections and a dashed paused semantic/class.
- [ ] Assert direction through arrow marker/visual contract.
- [ ] Assert a native keyboard-focusable route selector includes origin, destination, material, state, and condition text.
- [ ] Select a route and assert `onSelectRoute(routeId)` plus selected semantics.
- [ ] No routes → no orphan route layer/list chrome.

### Tests first: inspector/host

- [ ] Inspector renders latest attempt facts and uses `RouteOperationalSummary.utilization` directly.
- [ ] Condition/state copy is textual/localized.
- [ ] Manage route calls the supplied route ID.
- [ ] `MapInspectorHost` with `showLogisticsRouteInspector === false` and a non-null summary renders no logistics overlay.
- [ ] `showLogisticsRouteInspector === true` plus a current summary renders exactly one route inspector.
- [ ] A null selected summary never renders empty inspector chrome.
- [ ] Existing retail/industry/rail branches retain current behavior.

### Implementation

- [ ] Add the two pure helpers to `logisticsReadModels.ts`; no state/cache.
- [ ] Build `WorldLogisticsRoutes` as plain SVG straight lines plus native route selector list.
- [ ] Resolve coordinates only from existing world city definitions/statuses; no HPA-294 distance arithmetic in UI.
- [ ] Use solid/dashed and text semantics; color may reinforce only.
- [ ] Compose routes inside existing `WorldMap` viewport/list surface.
- [ ] Extend `WorldMap` and `MapSurfaceHost` with summaries/selection callback only.
- [ ] Build `LogisticsRouteInspector` from one `RouteOperationalSummary`.
- [ ] Extend `MapInspectorHost` with the explicit four logistics props above.
- [ ] Guard render on `showLogisticsRouteInspector && selectedLogisticsRoute`.
- [ ] Reuse `.inspector-overlay` for the logistics inspector so HPA-568 clearance remains the route-inspector chrome.
- [ ] Keep the existing `.world-inspector` city inspector in `WorldMap`; do not port it in HPA-574.

**Verify**

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

**Commit**

```bash
git add \
  src/lib/game/logisticsReadModels.ts \
  src/lib/game/logisticsReadModels.spec.ts \
  src/lib/components/game/WorldLogisticsRoutes.svelte \
  src/lib/components/game/WorldLogisticsRoutes.svelte.spec.ts \
  src/lib/components/game/LogisticsRouteInspector.svelte \
  src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts \
  src/lib/components/game/WorldMap.svelte \
  src/lib/components/game/WorldMap.svelte.spec.ts \
  src/routes/MapSurfaceHost.svelte \
  src/routes/MapSurfaceHost.svelte.spec.ts \
  src/routes/MapInspectorHost.svelte \
  src/routes/MapInspectorHost.svelte.spec.ts
git commit -m "feat(logistics): show selectable world routes"
```

---

## Task 4: Derive actionable logistics alerts and move alert-navigation unit ownership

**Files**

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

**Alert contracts**

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

Replace the panel-only return with:

```ts
export type AlertNavigation =
  | {
      kind: 'panel';
      panelId: 'finance' | 'decisions';
      focusedFinanceLoanId: string | null;
    }
  | { kind: 'world-route'; routeId: string };
```

### Tests first

- [ ] Latest active-route attempt origin-stock-constrained → one origin-stock alert with route ID.
- [ ] Destination-full latest attempt → no logistics constraint alert.
- [ ] One capacity-constrained attempt → no repeated-capacity alert.
- [ ] Two newest attempts capacity-constrained → one capacity alert.
- [ ] A normal newest attempt breaks the two-attempt streak.
- [ ] Paused route suppresses both types without modifying history.
- [ ] Removed route history emits no alert because no current route is actionable.
- [ ] Localized logistics alert messages are non-empty and include route/city/material context.
- [ ] `resolveAlertNavigation` preserves finance/decision behavior and returns `world-route` for both logistics kinds.
- [ ] Move the current direct `resolveAlertPanelNavigation` tests out of `page.svelte.spec.ts` into `alertNavigation.spec.ts`; remove the old import/duplicate assertions from `page.svelte.spec.ts`.

### Implementation

- [ ] Add small derived `collectLogisticsAlerts(game)` in `alerts.ts`.
- [ ] Iterate current routes; skip paused; use `selectRecentRouteDispatchAttempts` and `classifyRouteDispatchAttempt`.
- [ ] Emit origin-stock immediately from latest classification.
- [ ] Emit capacity pressure only when newest two classifications are capacity-constrained.
- [ ] Preserve deterministic current-route ordering.
- [ ] Extend `localizeGameAlert` exhaustively; no empty fallthrough for logistics.
- [ ] Add all three locales in the same commit.
- [ ] Rename `resolveAlertPanelNavigation` → `resolveAlertNavigation` and return the narrow union.
- [ ] Update all direct imports/tests, including `page.svelte.spec.ts`, in this same task.
- [ ] Do not turn command rejection into `GameAlert`.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/game/alerts.spec.ts \
  src/lib/i18n/gameCopy.spec.ts \
  src/routes/alertNavigation.spec.ts \
  src/routes/page.svelte.spec.ts \
  --maxWorkers=1
bun run check
```

**Commit**

```bash
git add \
  src/lib/game/alerts.ts \
  src/lib/game/alerts.spec.ts \
  src/lib/i18n/gameCopy.ts \
  src/lib/i18n/gameCopy.spec.ts \
  src/lib/i18n/messages/en.ts \
  src/lib/i18n/messages/ja.ts \
  src/lib/i18n/messages/zh-Hant.ts \
  src/routes/alertNavigation.ts \
  src/routes/alertNavigation.spec.ts \
  src/routes/page.svelte.spec.ts
git commit -m "feat(logistics): derive actionable route alerts"
```

---

## Task 5: Render latest-day logistics evidence in Reports with focused navigation

**Files**

- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`

**Callbacks**

```ts
onOpenLogisticsRoute?: (routeId: string) => void;
onOpenLogisticsTransfer?: (transferOrderId: string) => void;
```

### Tests first

- [ ] No logistics activity → compact zero/empty state with no invented rows.
- [ ] Arrival row renders transfer ID, endpoints, material, quantity from `DailyTransferArrival`.
- [ ] Attempt row renders route ID, destination need, attempt capacity, dispatched quantity, unused capacity, unmet destination need, and transport cost.
- [ ] `destinationNeed === 0` renders destination-full copy rather than shortage copy.
- [ ] Any utilization text uses attempt-recorded capacity, not current route capacity.
- [ ] Attempt click invokes `onOpenLogisticsRoute(routeId)`.
- [ ] Arrival click invokes `onOpenLogisticsTransfer(transferOrderId)`.
- [ ] Existing finance/inventory/event report assertions remain green.

### Implementation

- [ ] Add one latest-day Logistics section consuming only `summary.latest.logistics` evidence.
- [ ] Reuse classification copy where useful; do not derive new simulation facts.
- [ ] Pass the two explicit callbacks through `ManagementPanelHost` only for Reports.
- [ ] Add report copy in all three locales.
- [ ] Do not create a generic report-link object/URL scheme.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/components/game/ReportsPanel.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  --maxWorkers=1
bun run check
```

**Commit**

```bash
git add \
  src/lib/components/game/ReportsPanel.svelte \
  src/lib/components/game/ReportsPanel.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  src/lib/i18n/messages/en.ts \
  src/lib/i18n/messages/ja.ts \
  src/lib/i18n/messages/zh-Hant.ts
git commit -m "feat(logistics): expose daily logistics reports"
```

---

## Task 6: Compose route state/navigation and run an early focused navigation smoke

**Files**

- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/page.svelte.spec.ts` only for existing pure/controller ownership affected by new imports/availability
- Modify: `src/routes/retail-sim.e2e.ts`
- Re-run: `src/routes/MapSurfaceHost.svelte.spec.ts`
- Re-run: `src/routes/MapInspectorHost.svelte.spec.ts`
- Re-run: `src/routes/ManagementPanelHost.svelte.spec.ts`

**Transient route state**

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

### Why this task uses a small E2E smoke

`page.svelte.spec.ts` currently does not mount `+page.svelte`; it owns controller/availability and route-local pure helper behavior. Do not extract a generic navigation reducer/store solely to manufacture unit coverage for transient page state.

Instead, keep this integration checkpoint small and prove the page-owned exclusivity/navigation with one focused Playwright smoke before the full logistics lifecycle tests in Task 7.

### Test-local E2E fixture

Reuse current `retail-sim.e2e.ts` helpers. Add only this test-local helper if a pre-existing route is needed:

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

Load it using:

```ts
await installSandboxAutoSave(page, logisticsOperationsGame());
```

Do not add production fixture code.

### Composition checks

- [ ] Add `logistics` / `L` to `managementPanelMenuConfig` and prove existing shortcut/menu tests remain green.
- [ ] Wire `routeOperations`, selected route ID, and route-selection callback through `MapSurfaceHost`.
- [ ] Wire `showLogisticsRouteInspector`, selected summary, close/manage callbacks through `MapInspectorHost`.
- [ ] Wire Logistics panel data/callbacks/focus IDs through `ManagementPanelHost`.
- [ ] Wire all seven controller callbacks directly; no route command wrapper object.
- [ ] Add `selectLogisticsRoute(routeId)` that switches to world view as needed and clears world-city/retail/industry selections.
- [ ] Selecting a world city clears route selection.
- [ ] Add `openLogisticsManagement({ routeId?, transferOrderId? })` as a concrete helper; do not generalize management navigation.
- [ ] Report route navigation closes/switches management surface, selects world view, and focuses route.
- [ ] Report transfer navigation opens Logistics focused on transfer.
- [ ] `handleSelectAlert` switches on the new `AlertNavigation` union before preserving existing store/factory navigation.
- [ ] Reset/load/scenario-transition/Escape paths clear logistics route/focus state alongside sibling transient selections where the current behavior requires a clean map state.
- [ ] Successful removal of a focused/selected route clears matching focus state; derived selected summary becomes null even if an ID were briefly stale.

### Focused navigation Playwright smoke

Using `logisticsOperationsGame()`:

- [ ] switch to world map and select the pre-seeded route through the accessible route control;
- [ ] assert exactly one logistics route inspector is visible;
- [ ] assert no world-city inspector remains open after route selection;
- [ ] use **Manage route** and assert Logistics opens focused on that route;
- [ ] close Logistics, select a world city, and assert the route inspector is gone;
- [ ] reopen/select route, remove it through Logistics, return to world view, and assert no stale route inspector remains.

### Verification

```bash
bun run test:unit -- --run \
  src/routes/page.svelte.spec.ts \
  src/routes/MapSurfaceHost.svelte.spec.ts \
  src/routes/MapInspectorHost.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  --maxWorkers=1
bun run check
bun run test:e2e -- --workers=1 src/routes/retail-sim.e2e.ts --grep "logistics route navigation"
```

Use the exact final test title/grep text chosen in the test file; keep this smoke separate from the longer lifecycle tests below.

**Commit**

```bash
git add \
  src/routes/+page.svelte \
  src/routes/page.svelte.spec.ts \
  src/routes/retail-sim.e2e.ts
git commit -m "feat(logistics): wire route navigation"
```

---

## Task 7: Add real manual/recurring lifecycle E2E and ninth-launcher clearance

**Files**

- Modify: `src/routes/retail-sim.e2e.ts`
- Modify only if a failing clearance test proves it necessary: `src/routes/MapInspectorHost.svelte`
- Modify only with the matching regression assertion if needed: `src/routes/MapInspectorHost.svelte.spec.ts`

### Deterministic fixture path

For both flows start from:

```ts
const game = cityLocalInventoryLifecycleGame();
await installSandboxAutoSave(page, game);
```

That existing helper already creates two opened/materialized industry cities (`industry-city`, `breadbasket-basin`), warehouses, city inventories, deterministic bottled-water stock, and ample cash.

Use a fresh fixture per test. Do not make the two lifecycle tests depend on each other's localStorage state.

### Manual transfer lifecycle

- [ ] Load `cityLocalInventoryLifecycleGame()` with `installSandboxAutoSave`.
- [ ] Open Logistics with `L` or `openManagementPanel(page, /logistics/i)`.
- [ ] Choose `breadbasket-basin` → `industry-city`, `bottled-water`, and a quantity that is <= the fixture's origin stock (for example `5`).
- [ ] Assert the rendered HPA-294 quote (lead time, per-unit cost, total cost).
- [ ] Dispatch and assert an in-transit transfer row with expected origin/destination/material/quantity.
- [ ] Advance days until arrival using the real UI.
- [ ] Assert delivered history and latest-day report evidence; verify destination inventory increased by the transferred quantity.
- [ ] Exercise one invalid/insufficient manual input and prove no extra transfer row is created.

### Recurring route lifecycle

- [ ] Freshly load `cityLocalInventoryLifecycleGame()`.
- [ ] Open Logistics and create one route `breadbasket-basin` → `industry-city` for `bottled-water`.
- [ ] Use **Use quote** if available; otherwise enter the explicit known route fields and prove form validity is independent of quote-assist stock/cash.
- [ ] Advance through one scheduled attempt and eventual delivery.
- [ ] Switch to world map and discover/select the route through its native accessible route control.
- [ ] Assert inspector schedule, in-transit/delivered totals, latest attempt facts, and condition.
- [ ] Use Manage route and assert focus lands on the route in Logistics.
- [ ] Exercise pause/resume or reprioritize through the focused real UI.
- [ ] Verify active/paused state is distinguishable by text/solid-vs-dashed semantics, not color only.

### Ninth-launcher layout regression

At the existing HPA-568 laptop/desktop width coverage:

- [ ] with a logistics route inspector open, assert its action area sits above the fixed control desk and is clickable;
- [ ] retain existing retail/industry inspector clearance assertions;
- [ ] assert selecting a route has closed any world-city inspector, rather than assuming the two world inspector types share chrome;
- [ ] change `MapInspectorHost` bottom spacing only if the E2E demonstrates overlap after adding the ninth management launcher;
- [ ] do not move/rewrite `WorldMap` city inspector or redesign ControlDesk preemptively.

**Verify**

```bash
bun run test:e2e -- --workers=1 src/routes/retail-sim.e2e.ts
bun run check
```

**Commit**

```bash
git add src/routes/retail-sim.e2e.ts
```

If and only if clearance required a real fix, also add:

```bash
git add src/routes/MapInspectorHost.svelte src/routes/MapInspectorHost.svelte.spec.ts
```

Then:

```bash
git commit -m "test(logistics): cover operations UI lifecycle"
```

---

## Task 8: Full verification and scope audit

**Files**

- No intended production behavior changes beyond fixes required by verification findings.

### Focused regression gate

- [ ] Run the HPA-574 unit/component set:

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
```

- [ ] Run static gates:

```bash
bun run check
bun run lint
```

- [ ] Run targeted route E2E serially:

```bash
bun run test:e2e -- --workers=1 src/routes/retail-sim.e2e.ts
```

- [ ] Run repository regression:

```bash
bun run test
```

### Scope audits

- [ ] No save/scenario feature changes:

```bash
git diff main...HEAD -- src/lib/persistence src/lib/scenarios
```

Expected: no HPA-574 persistence/scenario feature diff.

- [ ] No copied HPA-294 logistics arithmetic in UI:

```bash
rg "INTER_CITY_DISTANCE_PER_BAND|Math\.min\(|destinationNeed|transportCostPerUnit.*quantity" \
  src/lib/components src/routes
```

Review every hit. Evidence display/input binding is allowed; copied dispatch/distance arithmetic is not.

- [ ] Quote assistance still delegates to HPA-294:

```bash
rg "quoteInterCityTransfer|INTER_CITY_DISTANCE_PER_BAND" \
  src/lib/components/game/LogisticsPanel.svelte src/routes
```

Expected: quote helper use is present; distance-band constant/arithmetic is absent from UI.

- [ ] No material-by-stock filtering introduced:

```bash
rg "materials\[.*\].*>\s*0|stock.*material.*filter|material.*stock.*filter" \
  src/lib/components/game/LogisticsPanel.svelte
```

Review any hit; zero-stock materials must remain selectable.

- [ ] No forbidden generic infrastructure:

```bash
rg "Logistics(Store|Controller|Router|Registry|EventBus)|GraphEngine|RouteAnimation|Vehicle" src
```

Expected: no new generic runtime abstraction matching these concepts.

- [ ] No orphan old alert helper references:

```bash
rg "resolveAlertPanelNavigation" src
```

Expected: zero matches after rename.

- [ ] Inspector gating audit:

```bash
rg "showLogisticsRouteInspector|selectedLogisticsRoute" src/routes src/lib/components/game
```

Confirm the host branch is explicitly gated and the existing `WorldMap` city inspector was not moved.

- [ ] Diff hygiene:

```bash
git diff --check main...HEAD
git status --short
```

- [ ] Whole-branch review for:
  - logistics failures accidentally routed as finance `domain-rejected`;
  - duplicate sandbox mutation/autosave path;
  - invented sandbox pending semantics;
  - recurring-route creation incorrectly blocked by quote-assist stock/cash;
  - invalid endpoint options shown despite easy presentation filtering;
  - zero-stock materials hidden from otherwise-valid route planning;
  - duplicate logistics state/calculation;
  - scenario capability drift;
  - stale route selection after removal/load;
  - route inspector visible off the world map or with null current route;
  - simultaneous world-city and route inspectors after route selection;
  - empty localized alert/failure copy;
  - destination-full misclassification;
  - zero-dispatch origin-empty misclassification;
  - historical utilization recomputed from current route settings;
  - inaccessible SVG-only route selection;
  - inspector/control-desk overlap after the ninth management launcher.

**Final commit if verification requires fixes**

```bash
git add <only-files-changed-by-final-fixes>
git commit -m "fix(logistics): complete operations UI integration"
```

Do not create an empty final commit.

## Completion criteria

HPA-574 is complete when:

- a valid manual transfer can be quoted, dispatched, observed in transit, delivered, and found in reports/history;
- typed quote/command failures are localized inline and create no rejected persistent record;
- controller logistics rejection uses a first-class `RouteTransitionResult.logisticsFailure` arm and returns `logistics-rejected` with the exact HPA-294 reason;
- logistics mutations reuse `commitMutation`; no second sandbox pipeline exists;
- `manageLogistics` is exactly sandbox availability, without an invented sandbox pending gate;
- recurring routes can be created, edited, reprioritized, paused/resumed, removed, and inspected;
- optional **Use quote** fills lead time/cost from HPA-294 when a minimal quote succeeds, but quote-assist stock/cash failure does not block route creation;
- endpoint selects omit unopened/non-industry/unmaterialized cities while HPA-294 remains authoritative;
- zero-stock materials remain selectable;
- all operational facts come from HPA-294 orders/attempts/read models;
- historical utilization remains stable after route edits;
- destination-full is distinct from origin-stock/capacity, including the zero-dispatch origin-empty fixture;
- active/paused routes are visible, directional, selectable, and keyboard discoverable;
- route inspector is explicitly gated to world view + current selected summary;
- world-city inspector remains in `WorldMap` and route/city selection is mutually exclusive;
- logistics alerts are evidence-derived with no persisted counter/history;
- alert helper unit ownership lives in `alertNavigation.spec.ts` after rename;
- report rows navigate to the correct current route/transfer;
- route composition gets an early focused navigation E2E before the longer lifecycle flows;
- the two full lifecycle E2E tests reuse `cityLocalInventoryLifecycleGame()` + `installSandboxAutoSave(...)` rather than production-only fixtures;
- ninth-launcher clearance protects route/retail/industry inspector actions without preemptive UI redesign;
- existing scenarios and retail replenishment behavior are unchanged;
- focused tests, `bun run check`, `bun run lint`, targeted E2E, and full `bun run test` pass.