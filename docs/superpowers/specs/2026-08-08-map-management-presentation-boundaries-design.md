# Map and Management Presentation Boundaries Design

**Date:** 2026-08-08  
**Status:** Approved for implementation planning  
**Linear:** HPA-568 — Extract map and management presentation boundaries from the Serpens route  
**Dependency:** HPA-554 is complete; this ticket unblocks HPA-574.

## Summary

HPA-568 reduces change collisions in `src/routes/+page.svelte` before the inter-city logistics UI expands the map, inspectors, and management surfaces.

The route remains the explicit cross-feature composition root. It continues to own `GameRouteController`, canonical route state, cross-feature derivations, command handlers, overlay ordering, keyboard shortcuts, save/scenario orchestration, and navigation decisions.

This ticket extracts exactly three concrete presentation components:

- `MapSurfaceHost.svelte` for the retail, industry, and world map surface stack;
- `MapInspectorHost.svelte` for retail, industry-building, and rail inspectors;
- `ManagementPanelHost.svelte` for the control-tower shell and existing panel switch.

The extraction is intentionally mechanical. No domain behavior, persistence shape, simulation rule, controller contract, shortcut behavior, or player-visible flow changes.

## Why now

HPA-294 has established the domain contracts that HPA-574 will expose. HPA-574 will add a logistics management panel, route inspector, world-map route presentation, alert navigation, and report navigation. Adding those directly to the current route would increase collisions in the same large markup and CSS regions.

The current route already coordinates:

- all three map renderers and their keep-alive visibility;
- world-city selection/opening/financing presentation;
- retail, industry-building, and rail inspector overlays;
- the complete control-tower modal shell and eight-panel switch;
- global shortcuts and Escape precedence;
- build/advisor/save/scenario/finance overlays;
- route command orchestration and persistence.

The useful maintenance boundary is therefore presentation composition, not another controller or state abstraction.

## Goals

1. Give map-surface changes one concrete home.
2. Give map-attached inspector changes one concrete home.
3. Give management-dialog and panel-composition changes one concrete home.
4. Keep `+page.svelte` as the single route orchestration and cross-feature state owner.
5. Prepare stable presentation extension points for HPA-574 without designing a generic extension framework.
6. Preserve behavior and visuals exactly.

## Non-goals

- Making `+page.svelte` meet a target line count.
- Replacing `GameRouteController` or changing its mutation/persistence responsibilities.
- Adding a route-level view model, Svelte context, store, event bus, dependency injection, modal registry, inspector registry, panel registry, or generic workspace abstraction.
- Moving `TopBar`, `ControlDesk`, `BuildMenu`, `SupplyAdvisor`, scenario surfaces, save surfaces, finance purchase review, or global shortcut handling.
- Reworking map snapshots, placement, rail routing, world-city rules, finance, scenarios, alerts, or localization.
- Adding logistics UI itself; HPA-574 consumes these boundaries later.
- Adding compatibility, migration, recovery, or defensive-state work.

## Ownership after the change

### `src/routes/+page.svelte`

The route keeps ownership of:

- constructing and synchronizing `GameRouteController`;
- `sandboxGame`, `activeScenarioRun`, play mode, scenario persistence state, and save state;
- all cross-feature derived state and map snapshots;
- selected tile/building/rail/world-city IDs and active map view;
- build, placement, rail-build, and finance-review state;
- all domain command handlers;
- active management-panel ID and menu configuration;
- global keyboard shortcuts and Escape priority;
- top-level overlay composition and navigation;
- `TopBar`, `ControlDesk`, `BuildMenu`, `SupplyAdvisor`, store detail, saves, scenarios, shortcut sheet, and finance purchase review.

The route passes already-derived values and callbacks into the new hosts. The hosts do not reach back into route state.

### `src/lib/components/game/MapSurfaceHost.svelte`

Own only the mounted map surface stack and its layout CSS.

Responsibilities:

- render `WorldMap`, `CityMap`, and `IndustryMap` according to `VisitedMapViews`;
- preserve the keep-alive contract: a visited surface remains mounted, while only the active surface is visible and pointer-interactive;
- pass snapshots, paused/active state, keyboard enablement, mutation availability, world-city selection, and callbacks through to existing map components;
- own `.map-surfaces`, `.map-surface`, and active-surface positioning/visibility CSS.

It does **not** own:

- `activeMapView` transitions;
- visited-map mutation;
- selection state;
- map snapshots;
- world-city eligibility or command handling;
- rail-build state;
- any route/domain command.

The host may import domain/view types such as `MapViewId`, `VisitedMapViews`, `CityMapSnapshot`, `IndustryMapSnapshot`, `WorldCityStatus`, and `I18nBundle`. It must not import anything from `src/routes`.

The world-city inspector stays inside `WorldMap`; HPA-568 does not split that existing component.

### `src/lib/components/game/MapInspectorHost.svelte`

Own the map-attached inspector overlay markup and responsive overlay CSS.

Responsibilities:

- render the existing retail `TileInspector` when the route says the retail inspector should be visible;
- render `RailSegmentInspector` before `IndustryTileInspector` when rail segments are selected, preserving the current precedence;
- pass already-resolved tile, store, building, report, rail-segment, mutation-availability, and callback values into the existing inspector components;
- own `.inspector-overlay` desktop and compact-breakpoint CSS.

It does **not** own:

- selected IDs;
- tile/building/store lookup;
- latest-report lookup;
- determining the active map;
- upgrade/demolish/open-detail commands;
- store-detail modal state;
- world-city inspection.

The route remains responsible for deriving concrete selected objects. This avoids turning the host into a second selector/view-model layer.

### `src/lib/components/game/ManagementPanelHost.svelte`

Own the existing control-tower shell and concrete eight-panel switch.

Responsibilities:

- render the backdrop, focus trap, dialog shell, header, day/cash status, and close controls;
- switch among the existing `Scorecard`, `PolicyPanel`, `StaffPanel`, `RetailSupplySources`, `StoreOverview`, `DecisionQueue`, `ActiveModifiers`, `ReportsPanel`, `ProductChainsPanel`, and `FinancePanel` content;
- preserve the existing two-column stores/decisions layouts and responsive collapse;
- preserve `data-focused-finance-loan` on the dialog;
- own control-tower, stores/decisions composition, header/action, and responsive CSS.

It does **not** own:

- which management panel is active;
- opening/closing decisions beyond invoking the supplied `onClose` callback;
- finance-loan focus state;
- report summarization, finance metric calculation, retail supply view derivation, or any other cross-feature selector;
- domain commands or mutation gating;
- keyboard shortcut handling.

`MutationAvailability` currently belongs to the route layer. The `$lib` host must not import it from `src/routes/gameRouteController.ts`. Instead the route passes the explicit booleans and callbacks the child panels already consume. This preserves dependency direction without creating a new shared availability abstraction solely for this extraction.

## Component contract shape

The contracts should remain explicit rather than introducing prop-bag view models solely to make signatures look smaller.

### Map surface contract

Conceptually:

```ts
interface MapSurfaceHostProps {
  activeMapView: MapViewId;
  visitedMapViews: VisitedMapViews;
  paused: boolean;
  i18n: I18nBundle;

  worldCityStatuses: WorldCityStatus[];
  selectedWorldCityId: string | null;
  onSelectWorldCity: (cityId: string) => void;
  onOpenWorldCity: (cityId: string) => void;
  onFinanceWorldCity: (cityId: string) => void;
  onCloseWorldInspector: () => void;
  canOpenWorldCity: boolean;
  canFinanceWorldCity: boolean;
  allowedWorldCityIds: string[];
  mutationDisabledReason: string | null;

  retailSnapshot: CityMapSnapshot;
  onSelectRetailTile: (tileId: string) => void;

  industrySnapshot: IndustryMapSnapshot;
  onSelectIndustryTile: (tileId: string) => void;
  onCancelRailBuild: () => void;
  railKeyboardEnabled: boolean;
}
```

Names may follow the implementation's local conventions, but ownership must remain as above.

### Inspector contract

The route passes concrete `GameState`, `CityTile`, `Store`, `DailyStoreReport`, `IndustryTile`, `IndustrialBuilding`, and `RailSegment` values plus explicit visibility flags and mutation callbacks. The host does not accept selected IDs and then re-resolve them.

### Management contract

The route mounts the host only when a panel is active and retains the existing keyed reset boundary:

```svelte
{#if activeManagementPanel}
  {#key activeManagementPanel.id}
    <ManagementPanelHost
      panelId={activeManagementPanel.id}
      panelLabel={activeManagementPanel.label}
      ...
    />
  {/key}
{/if}
```

The host receives `panelGame`, `summary`, `financeMetrics`, already-derived retail-supply views, current mutation booleans, and the existing callbacks. It may import `GameRouteCommitResult` from `$lib/game/commandResult` because that is already a library-level command result contract; it must not import route controller state.

## Data and command flow

The direction remains one-way:

```text
GameRouteController / route state
        |
        v
+page.svelte derivations and handlers
        |
        +-------------------+------------------------+
        |                   |                        |
        v                   v                        v
MapSurfaceHost       MapInspectorHost       ManagementPanelHost
        |                   |                        |
        v                   v                        v
existing map          existing inspector       existing panel
components             components               components
        |                   |                        |
        +--------- callbacks to +page.svelte -------+
                            |
                            v
                  GameRouteController/domain
```

No host writes canonical state. No host calls `GameRouteController` directly.

## Styling and responsive behavior

Move styles with the markup they control so Svelte's scoped CSS remains effective after extraction.

`MapSurfaceHost.svelte` owns:

- `.map-surfaces`;
- `.map-surface`;
- `.active-map-surface`.

`MapInspectorHost.svelte` owns:

- `.inspector-overlay`;
- the `981px–1023px` inspector bottom offset;
- the `max-width: 980px` fixed inspector layout.

`ManagementPanelHost.svelte` owns:

- `.tower-backdrop` and backdrop button;
- `.control-tower-overlay`;
- `.tower-header`, `.tower-actions`, and close button;
- `.decisions-surfaces` and `.stores-surfaces`;
- management dialog heading/ticker styling used only by the extracted shell;
- compact control-tower/stores/decisions responsive rules.

`+page.svelte` retains styles for the route shell, scenario progress, placement status, menu content, TopBar/ControlDesk-adjacent composition, and other unmoved overlays.

Do not create a shared CSS module or generic overlay stylesheet for these three one-use boundaries.

## Accessibility and keyboard behavior

Behavior must remain unchanged:

- the management dialog remains `aria-modal="true"` and uses the existing `focusTrap` attachment;
- inspector dialogs remain non-modal and retain their current accessible names;
- backdrop and close controls retain accessible labels from existing localization keys;
- `+page.svelte` remains the only global shortcut and Escape-priority owner;
- `IndustryMap.keyboardEnabled` is still derived by the route and passed through the surface host so page-level overlays do not double-handle Escape;
- no host installs global keyboard listeners.

## Testing strategy

Add tests only for behavior that moves behind a new boundary.

### `MapSurfaceHost.svelte.spec.ts`

Cover:

- unvisited maps are not mounted;
- visited maps remain mounted when inactive;
- exactly the active surface is visible/pointer-active through the existing class/`aria-hidden` contract;
- world/retail/industry callbacks remain wired;
- paused and industry keyboard-enabled values are passed through without re-derivation.

Reuse the small Phaser mocks already used by `CityMap.svelte.spec.ts` and `IndustryMap.svelte.spec.ts`; do not extract a new generic test framework for three host tests.

### `MapInspectorHost.svelte.spec.ts`

Cover:

- retail inspector visibility and close/detail callback forwarding;
- rail inspector wins over industry-building inspector when both rail and industry tile data are present;
- industry-building inspector renders when no rail segment selection is present;
- mutation availability and disabled reason reach the existing inspector controls.

Use concrete lightweight game fixtures. Do not add a generic inspector test registry.

### `ManagementPanelHost.svelte.spec.ts`

Cover:

- the dialog shell, label, day/cash status, focus-trap shell, backdrop, and close callback;
- representative panel switching, including the two-surface `stores` and `decisions` compositions;
- finance focus metadata is preserved;
- explicit mutation booleans/callbacks reach interactive child panels.

Existing child-panel specs remain authoritative for their internal behavior; the host spec verifies composition, not every child feature again.

### Route-level smoke

Retain `src/routes/retail-sim.e2e.ts` as the cross-feature smoke for map navigation, panel toggles, inspector flows, and route-level keyboard/overlay behavior. No new E2E suite is required unless the existing smoke exposes a genuine missing route behavior during implementation.

Run:

- focused new browser component specs;
- `bun run check`;
- `bun run lint`;
- `bun run test:e2e -- src/routes/retail-sim.e2e.ts` where Playwright forwarding supports the path, otherwise the repository's configured targeted Playwright invocation;
- final `bun run test` after focused gates are green.

## Coverage configuration

`vite.config.ts` currently explains the exclusion of `+page.svelte` using a stale line-count description. Update the comment so it describes the testing boundary instead:

- `+page.svelte` is the route-level orchestration/composition root and remains covered by `retail-sim.e2e.ts`;
- extracted `$lib/components/game` hosts are covered by browser component specs and remain inside normal component coverage;
- do not replace the old number with a new line-count target.

The coverage exclude list itself does not change.

## Implementation sequence

1. Extract and cut over `MapSurfaceHost` with focused component coverage.
2. Extract and cut over `MapInspectorHost` with focused component coverage.
3. Extract and cut over `ManagementPanelHost` with focused component coverage.
4. Update the stale coverage-boundary comment and run route/full regression gates.

Each extraction is independently reviewable and should preserve behavior before proceeding to the next.

## Scope audit

The implementation is out of scope if it introduces any of the following:

- a second controller or canonical state owner;
- new global Svelte state/context;
- a generic `MapWorkspace` or broad shell wrapper;
- generic panel/inspector registries;
- domain/read-model calculations moved into Svelte hosts;
- route commands called directly from `$lib` components;
- changes to `src/lib/game` simulation or persistence contracts;
- redesigns of map, panel, inspector, scenario, save, finance, or shortcut behavior;
- speculative logistics components for HPA-574.

## Acceptance criteria

- Map surfaces have one clear home in `MapSurfaceHost.svelte`.
- Retail, industry, and rail inspector presentation has one clear home in `MapInspectorHost.svelte`.
- Control-tower shell and existing panel composition have one clear home in `ManagementPanelHost.svelte`.
- `+page.svelte` remains the explicit cross-feature composition/command root.
- `GameRouteController` remains the only route command/persistence coordinator.
- Global shortcut and Escape ordering remains in `+page.svelte` and behaves exactly as before.
- No new generic presentation/state framework is introduced.
- No domain or persistence behavior changes.
- Existing visuals and player flows remain unchanged.
- Focused component tests cover only the newly moved boundary behavior.
- Existing `retail-sim.e2e.ts` remains the route-level cross-feature smoke.
- `vite.config.ts` describes the testing boundary without a route line-count claim.
- `bun run check`, `bun run lint`, focused browser component tests, targeted E2E, and final full tests pass.

## HPA-574 handoff

After HPA-568 lands, HPA-574 can extend these concrete boundaries without reopening route architecture:

- add logistics route rendering to `MapSurfaceHost`/the world-map surface;
- add a concrete route inspector to `MapInspectorHost`;
- add a concrete logistics management panel to `ManagementPanelHost`;
- keep logistics state, validation, scheduling, quotes, and utilization in HPA-294 domain/read-model APIs;
- keep route selection/navigation commands and global shortcut/overlay ownership in `+page.svelte`.

No generic extension mechanism is needed in advance. HPA-574 should add the concrete props and composition only when its UI exists.
