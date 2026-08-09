# Logistics Operations and World-Route UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make HPA-294 inter-city logistics fully playable and inspectable through one management surface, simple selectable world-map route visuals, route/report navigation, and evidence-derived alerts without duplicating logistics rules or persisted state.

**Architecture:** Keep `GameRouteController` as the only mutation/persistence coordinator and `+page.svelte` as the transient navigation/selection root. Extend the three HPA-568 route hosts with three logistics-specific components. Consume HPA-294 commands and read models directly; add only small pure evidence-classification helpers where multiple presentation surfaces need the same interpretation.

**Tech Stack:** TypeScript 6, Svelte 5/SvelteKit, existing DOM world map plus SVG, Vitest browser/unit tests, Playwright E2E, existing i18n catalogs, existing sandbox autosave pipeline.

## Global constraints

- HPA-294 / PR #35 and HPA-568 / PR #38 are the implementation baseline.
- Do not change transfer dispatch math, route scheduling, inventory conservation, transport accounting, or persistence.
- Do not add a save-schema bump, migration, cached logistics projection, rejected-order record, alert-history store, or persisted alert counter.
- Do not add scenario logistics commands or scenario authoring. Logistics mutations remain sandbox-only in HPA-574.
- Do not add a new route controller, store/context layer, event bus, generic command bus, form engine, modal registry, graph framework, Phaser world scene, route animation layer, vehicle simulation, or pathfinding.
- Manual quote failures and command rejections are inline panel feedback, not HUD alerts.
- HUD logistics alerts derive only from persisted route-attempt evidence.
- Route-capacity pressure requires two consecutive capacity-constrained attempts; the threshold is a constant, not state.
- Paused routes do not emit normal-operation logistics alerts.
- `destinationNeed === 0` is a destination-full state, never an origin/capacity shortage.
- Route historical utilization continues to use attempt-recorded capacity from HPA-294.
- World-route state must not rely on color alone; preserve direction, solid/dashed active state, labels, and keyboard discovery.
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

---

## Task 1: Add the route-level logistics command and shortcut contracts

**Files**

- Modify: `src/lib/game/commandResult.ts`
- Modify: `src/lib/game/keyboardShortcuts.ts`
- Modify: `src/lib/game/keyboardShortcuts.spec.ts`
- Modify: `src/routes/gameRouteController.ts`
- Modify: `src/routes/gameRouteController.spec.ts`

**Interfaces**

Add one typed route rejection without widening finance failure codes:

```ts
import type {
  ManualTransferFailure,
  RecurringRouteFailure,
  ManualTransferInput,
  RecurringRouteInput,
  RecurringRouteUpdateInput
} from '$lib/game/interCityLogistics';

export type LogisticsFailureCode = ManualTransferFailure | RecurringRouteFailure;

export type GameRouteCommitResult =
  | existing variants
  | { status: 'logistics-rejected'; reason: LogisticsFailureCode };
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

Add one capability flag because all seven writes share the same HPA-574 boundary:

```ts
interface MutationAvailability {
  // existing fields
  manageLogistics: boolean;
}
```

`manageLogistics` is true only for sandbox mode when route mutations are not pending. Do not add seven identical capability booleans.

### Tests first

- [ ] Add shortcut tests proving `L`/`l` toggles the `logistics` management panel, still respects typing/modifier/blocking-overlay rules, and remains a panel-toggle key while another soft panel is open.
- [ ] Add controller tests for successful manual dispatch through the route controller: state publishes once and sandbox autosave receives the committed game.
- [ ] Add a typed manual-transfer rejection test proving no state publish/autosave occurs and the exact HPA-294 reason is returned as `logistics-rejected`.
- [ ] Add route lifecycle controller coverage for create, edit, pause, resume, reprioritize, and remove using a compact table where behavior is identical.
- [ ] Add one missing-route rejection assertion.
- [ ] Add one scenario-mode test proving logistics mutations return unavailable and do not widen `ScenarioCommand`.

### Implementation

- [ ] Add `'logistics'` to `ManagementPanelId` and `l: 'logistics'` to `MANAGEMENT_PANEL_SHORTCUTS`.
- [ ] Add `manageLogistics` to `createMutationAvailability`; do not touch scenario allowed-command definitions.
- [ ] Import HPA-294 transitions into `gameRouteController.ts` with `...Transition` aliases to avoid method-name collisions.
- [ ] Extend the internal route-transition result with a dedicated logistics-failure branch. Normalize HPA-294 `{ ok: false; reason }` results into that branch.
- [ ] In the sandbox rejection path return `{ status: 'logistics-rejected', reason }` before publish/autosave.
- [ ] Implement the seven public methods by reusing `commitMutation`; omit `scenarioCommand` so scenario mode remains unavailable.
- [ ] Do not add a second sandbox mutation/persistence helper.

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

## Task 2: Build the Logistics management panel with typed feedback

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

**Panel contract**

Keep callbacks explicit; do not introduce a generic command bus:

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

### Tests first

- [ ] Render the panel with two opened industry inventories and prove origin/destination/material/quantity fields submit the exact `ManualTransferInput`.
- [ ] Add a successful quote test showing HPA-294 lead time, per-unit cost, and total cost.
- [ ] Parameterize manual quote failure rendering for the HPA-294 reason family; assert the localized message is non-empty.
- [ ] Add a dispatch-time `logistics-rejected` test proving the same typed reason replaces the inline status and no fake transfer row appears.
- [ ] Add empty-state coverage for no in-transit inventory, no transfer history, and no routes.
- [ ] Add route creation coverage for all HPA-294 fields.
- [ ] Add one focused route test covering edit, reprioritize, pause/resume, and remove callbacks with current route values.
- [ ] Add focused transfer coverage proving the requested transfer is marked/current in history.
- [ ] Add disabled-state coverage proving scenario/no-game mode leaves inspection available but prevents mutation callbacks.

### Implementation

- [ ] Add `localizeLogisticsFailure(reason, i18n)` in `gameCopy.ts` with an exhaustive switch over the combined typed failure union.
- [ ] Add all corresponding copy in English, Japanese, and Traditional Chinese in the same commit.
- [ ] Build one `LogisticsPanel` with four responsive sections: Manual transfer, Recurring routes, In transit, Recent transfers/totals.
- [ ] Use `quoteInterCityTransfer` directly for quote evidence; never reconstruct lead time/cost in Svelte.
- [ ] Use `selectInTransitInventory`, `selectRecentTransfers`, `selectRouteOperations`, and `selectLogisticsTotals` for displayed operational facts.
- [ ] Build industry-city options from existing current game/world/inventory identities; leave final validity to HPA-294.
- [ ] Use native number/select controls with visible labels. Browser `min`/`step` values are convenience only.
- [ ] Keep route edit UI in the same panel; do not create a nested modal/router or generic CRUD form.
- [ ] Preserve priority as a separate reprioritize action; route edit submits `RecurringRouteUpdateInput` without priority.
- [ ] Add `logistics` to `ShortcutCheatSheet` with key `L`.
- [ ] Add one `panelId === 'logistics'` branch in `ManagementPanelHost` and pass explicit callbacks/focus IDs/capability.

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

## Task 3: Add shared route-evidence classification, world route visuals, and the inspector

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

**Pure evidence helpers**

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

1. `null` → awaiting dispatch;
2. `destinationNeed === 0` → destination full;
3. `availableOriginStock < Math.min(destinationNeed, capacity)` → origin stock constrained;
4. `unmetDestinationNeed > 0 && dispatchedQuantity === capacity` → route capacity constrained;
5. normal.

### Tests first: read models

- [ ] Add one test for every condition.
- [ ] Add the overlap boundary where `availableOriginStock === capacity < destinationNeed`; assert capacity-constrained, not origin-constrained.
- [ ] Add `destinationNeed === 0` with unused capacity and no stock; assert destination-full wins.
- [ ] Add recent-attempt ordering across multiple reports and routes; prove the helper returns newest matching evidence only.

### Tests first: world routes

- [ ] Render one active and one paused route; assert two SVG connections exist and paused state has a non-color dashed semantic/class.
- [ ] Assert direction is present through the arrow marker/visual contract.
- [ ] Assert each route also has a native keyboard-focusable selector with origin, destination, material, state, and condition in accessible text.
- [ ] Select a route and assert `onSelectRoute(routeId)` fires and selected semantics move to that route.
- [ ] Add a no-route empty rendering test with no orphan layer/list chrome.

### Tests first: inspector

- [ ] Render latest-attempt evidence and assert historical utilization comes from `RouteOperationalSummary.utilization` rather than current capacity math.
- [ ] Assert destination-full, origin-stock, capacity, normal, and awaiting states use localized condition copy.
- [ ] Assert active/paused state is textual.
- [ ] Assert Manage route calls the supplied callback with the route ID.

### Implementation

- [ ] Add the two small helpers to `logisticsReadModels.ts`; no state/cache changes.
- [ ] Build `WorldLogisticsRoutes` as a domain-specific component: plain SVG straight lines over percentage coordinates plus a native route selector list.
- [ ] Resolve coordinates only from `WorldCityStatus.city.worldX/worldY`; do not use HPA-294 distance bands or add route geometry to game state.
- [ ] Use solid versus dashed visuals plus text; color may reinforce but never be the sole active/paused distinction.
- [ ] Compose `WorldLogisticsRoutes` inside the existing `WorldMap` viewport/list surface.
- [ ] Extend `WorldMap` props with route summaries, selected route ID, and `onSelectRoute`.
- [ ] Extend `MapSurfaceHost` only to forward those world-route props.
- [ ] Build `LogisticsRouteInspector` from one `RouteOperationalSummary` plus i18n and `onManageRoute`.
- [ ] Extend `MapInspectorHost` with a world-route inspector branch. Keep it inside `.map-layout` so HPA-568 overlay positioning remains authoritative.
- [ ] Do not move the existing world-city inspector out of `WorldMap` in this ticket.

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

## Task 4: Derive actionable logistics alerts and route them to the world inspector

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

Replace the panel-only navigation return with one narrow union:

```ts
export type AlertNavigation =
  | {
      kind: 'panel';
      panelId: 'finance' | 'decisions';
      focusedFinanceLoanId: string | null;
    }
  | { kind: 'world-route'; routeId: string };
```

Store/factory alerts continue through the existing tile navigation path when `resolveAlertNavigation` returns null.

### Tests first

- [ ] Latest active-route attempt is origin-stock-constrained → one origin-stock alert with route ID.
- [ ] Latest attempt is destination-full → no origin/capacity alert.
- [ ] One capacity-constrained attempt → no repeated-capacity alert.
- [ ] Two most recent attempts both capacity-constrained → one capacity alert.
- [ ] A normal attempt after a constrained attempt breaks the two-attempt condition.
- [ ] Paused route suppresses both logistics alert kinds without changing history.
- [ ] Deleted route history does not emit an alert because there is no current operational object to act on.
- [ ] Localized logistics alert messages are non-empty and include the relevant route/city/material context.
- [ ] `resolveAlertNavigation` preserves finance/decision behavior and returns `world-route` for both logistics alert kinds.

### Implementation

- [ ] Add `collectLogisticsAlerts(game)` inside `alerts.ts`; keep it derived and small rather than creating persisted alert state.
- [ ] Iterate current routes, use `selectRecentRouteDispatchAttempts` plus `classifyRouteDispatchAttempt`, and skip paused routes.
- [ ] Emit origin-stock immediately from the latest classified attempt.
- [ ] Emit capacity pressure only when the newest two attempts are both capacity-constrained.
- [ ] Add logistics alerts to `collectGameAlerts` after current domain alert groups; preserve deterministic current-route ordering.
- [ ] Extend `localizeGameAlert` exhaustively so logistics alerts cannot fall through to `''`.
- [ ] Add all three locales in the same commit.
- [ ] Rename `resolveAlertPanelNavigation` to `resolveAlertNavigation` and return the narrow union above.
- [ ] Do not turn inline command rejection into a `GameAlert`.

**Verify**

```bash
bun run test:unit -- --run \
  src/lib/game/alerts.spec.ts \
  src/lib/i18n/gameCopy.spec.ts \
  src/routes/alertNavigation.spec.ts \
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
  src/routes/alertNavigation.spec.ts
git commit -m "feat(logistics): derive actionable route alerts"
```

---

## Task 5: Render daily logistics evidence in Reports and add focused navigation

**Files**

- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`

**Callbacks**

Use two explicit callbacks rather than a generic report navigation protocol:

```ts
onOpenLogisticsRoute?: (routeId: string) => void;
onOpenLogisticsTransfer?: (transferOrderId: string) => void;
```

### Tests first

- [ ] Latest report with no logistics activity shows a compact empty logistics state or zero totals without inventing rows.
- [ ] Arrival rows show transfer ID, endpoints, material, and quantity from `DailyTransferArrival`.
- [ ] Attempt rows show route ID, destination need, attempt capacity, dispatched quantity, unused capacity, unmet destination need, and transport cost.
- [ ] A `destinationNeed === 0` attempt renders destination-full copy rather than shortage copy.
- [ ] Clicking an attempt invokes `onOpenLogisticsRoute(routeId)`.
- [ ] Clicking an arrival invokes `onOpenLogisticsTransfer(transferOrderId)`.
- [ ] Existing finance/inventory/event report sections retain their current assertions.

### Implementation

- [ ] Add one Logistics section to the latest-day Reports panel; consume only `summary.latest.logistics` evidence.
- [ ] Use attempt-recorded `capacity` for any utilization text in report rows; do not look up the current route capacity.
- [ ] Pass the two callbacks through `ManagementPanelHost` only for the Reports branch.
- [ ] Add report copy in all three locales.
- [ ] Do not create a generic report-link object or URL scheme.

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

## Task 6: Compose route selection, focus/navigation, management actions, and real UI flows

**Files**

- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/page.svelte.spec.ts`
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify if the new ninth launcher demonstrably changes inspector clearance: `src/routes/MapInspectorHost.svelte`
- Modify only with a regression test if needed: `src/routes/MapInspectorHost.svelte.spec.ts`

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
```

### Route behavior tests first

- [ ] Add `logistics` with shortcut `L` to `managementPanelMenuConfig`; assert menu/control-desk composition receives it.
- [ ] Selecting a world route clears world-city selection and opens the route inspector.
- [ ] Selecting a world city clears route selection.
- [ ] Retail/industry selection, transient reset, save load, scenario transition, and Escape clear route selection wherever they already clear sibling selections.
- [ ] Manage route from the inspector opens the Logistics management panel with `focusedLogisticsRouteId`.
- [ ] Report transfer navigation opens Logistics and focuses the transfer ID.
- [ ] Report route navigation closes/switches the management surface, opens world view, and selects the route.
- [ ] Logistics alert navigation opens world view and selects the route through the new alert-navigation union.
- [ ] Removing the currently selected route leaves no stale inspector; the derived selection becomes null and the focus ID is cleared after successful removal.
- [ ] Logistics mutations are disabled with the existing route disabled reason outside sandbox/no-game state.

### Implementation

- [ ] Import `selectRouteOperations` and wire the three transient IDs/derived selected summary.
- [ ] Add a small `selectLogisticsRoute(routeId)` route handler that clears world-city/tile selections and switches to world view when needed.
- [ ] Add `openLogisticsManagement({ routeId?, transferOrderId? })` as a concrete route helper; do not generalize management navigation.
- [ ] Wire all seven panel callbacks directly to `GameRouteController` methods.
- [ ] Pass `routeOperations`, selected route ID, and route-selection callback through `MapSurfaceHost`.
- [ ] Pass selected route summary and Manage callback through `MapInspectorHost`.
- [ ] Pass Logistics panel data/callbacks/focus IDs through `ManagementPanelHost`.
- [ ] Update `handleSelectAlert` to switch on the `AlertNavigation` union before preserving existing store/factory tile navigation.
- [ ] Update transient reset and Escape logic alongside existing selected world/retail/industry IDs.
- [ ] Keep the existing world-city inspector inside `WorldMap`; mutual exclusion is route-owned.

### Playwright: manual transfer lifecycle

- [ ] Create/load deterministic sandbox state with two opened industry cities, source stock, destination capacity, and enough cash through existing test setup.
- [ ] Open Logistics with `L` or the management launcher.
- [ ] Fill origin, destination, material, quantity and assert the rendered quote.
- [ ] Dispatch and assert the transfer appears in transit with the expected arrival day/cost.
- [ ] Advance days to arrival and assert the transfer is delivered and current destination inventory/report evidence updates.
- [ ] Verify no rejected transfer is created by one invalid/insufficient input path.

### Playwright: recurring route and world inspector

- [ ] Create one recurring route through the real panel.
- [ ] Advance through one scheduled attempt and delivery.
- [ ] Switch to world map and discover/select the route through the accessible route control.
- [ ] Assert the route inspector shows schedule, in-transit/delivery totals, and latest attempt facts.
- [ ] Use Manage route and assert the Logistics panel opens focused on that route.
- [ ] Exercise pause/resume or reprioritize through the real focused route UI.
- [ ] Verify active/paused route UI is distinguishable without relying on color.

### Layout regression

- [ ] At the existing desktop/laptop E2E viewport that previously required HPA-568 inspector clearance, assert the ninth management launcher does not cover the world/retail/industry inspector action area.
- [ ] Change `MapInspectorHost` bottom spacing only if this test demonstrates an overlap. Do not preemptively redesign the control desk.

**Verify**

```bash
bun run test:unit -- --run \
  src/routes/page.svelte.spec.ts \
  src/routes/MapSurfaceHost.svelte.spec.ts \
  src/routes/MapInspectorHost.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  --maxWorkers=1
bun run test:e2e -- --workers=1 src/routes/retail-sim.e2e.ts
bun run check
```

**Commit**

```bash
git add \
  src/routes/+page.svelte \
  src/routes/page.svelte.spec.ts \
  src/routes/retail-sim.e2e.ts \
  src/routes/MapInspectorHost.svelte \
  src/routes/MapInspectorHost.svelte.spec.ts
git commit -m "feat(logistics): integrate operations UI navigation"
```

If `MapInspectorHost` files did not need a layout fix, omit them from the commit instead of touching them gratuitously.

---

## Task 7: Full verification and scope audit

**Files**

- No intended production behavior changes beyond fixes required by the verification findings.

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

- [ ] Run the repository regression gate:

```bash
bun run test
```

### Scope audits

- [ ] Prove no save schema or migration was added:

```bash
git diff main...HEAD -- src/lib/persistence src/lib/scenarios
```

Expected: no HPA-574 persistence/scenario feature change. Existing fixture-only changes should not be needed.

- [ ] Prove UI did not duplicate the HPA-294 scheduling/quantity formula:

```bash
rg "Math\.min\(|destinationNeed|transportCostPerUnit.*quantity|INTER_CITY_DISTANCE_PER_BAND" \
  src/lib/components src/routes
```

Review every hit. Presentation of evidence/inputs is allowed; copied dispatch/distance arithmetic is not.

- [ ] Prove no forbidden generic infrastructure appeared:

```bash
rg "Logistics(Store|Controller|Router|Registry|EventBus)|GraphEngine|RouteAnimation|Vehicle" src
```

Expected: no new generic runtime abstraction matching these concepts.

- [ ] Check diff hygiene:

```bash
git diff --check main...HEAD
git status --short
```

- [ ] Perform one whole-branch review specifically for:
  - duplicate logistics state/calculation;
  - scenario capability drift;
  - stale route selection after removal/load;
  - empty localized alert/failure copy;
  - destination-full misclassification;
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
- recurring routes can be created, edited, reprioritized, paused/resumed, removed, and inspected;
- all route operational facts come from HPA-294 orders/attempts/read models;
- historical utilization remains stable after route edits;
- destination-full is distinct from origin-stock and route-capacity constraints;
- active/paused routes are visible, directional, selectable, and keyboard discoverable on the world map;
- route inspector navigation reaches the focused management actions;
- logistics alerts are derived from persisted evidence with no counter/history state;
- report rows navigate to the correct current route or transfer;
- existing scenarios and retail replenishment behavior are unchanged;
- focused tests, `bun run check`, `bun run lint`, targeted E2E, and full `bun run test` pass.
