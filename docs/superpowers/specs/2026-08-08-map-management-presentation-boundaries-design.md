# Map and Management Presentation Boundaries Design

**Date:** 2026-08-08  
**Status:** Revised after design review  
**Linear:** HPA-568 — Extract map and management presentation boundaries from the Serpens route  
**Dependency:** HPA-554 is complete; HPA-568 unblocks HPA-574.

## Summary

HPA-568 reduces change collisions in `src/routes/+page.svelte` before inter-city logistics UI adds route drawing, route inspection, management actions, and navigation.

The route remains the explicit cross-feature composition root. It still owns `GameRouteController`, route state, selections, cross-feature derivations, domain command handlers, global shortcut/Escape ordering, saves, scenarios, and navigation decisions.

The ticket extracts exactly three concrete presentation hosts:

- `MapSurfaceHost.svelte` — world, retail, and industry map surface composition;
- `MapInspectorHost.svelte` — retail, rail, and industry-building inspector composition;
- `ManagementPanelHost.svelte` — the existing control-tower shell and concrete management-panel switch.

One existing pure capability helper is also relocated out of `gameRouteController.ts`: `MutationAvailability` and `createMutationAvailability` move to `$lib/scenarios/mutationAvailability.ts`. This is not a new abstraction; it corrects an existing dependency-placement accident so `$lib` presentation code can consume the established capability bag without importing route code or duplicating a second boolean shape.

No simulation, persistence, save-schema, scenario semantics, finance rules, localization copy, map behavior, or player-visible workflow changes.

## Decisions

1. Keep exactly three concrete hosts. No `MapWorkspace`, generic inspector/panel registry, context store, event bus, or second controller.
2. Keep `+page.svelte` as the owner of selections, snapshots, active panel ID, route commands, global shortcuts, Escape priority, and top-level overlay decisions.
3. Preserve the world-city inspector inside `WorldMap.svelte`.
4. Preserve the route-owned `{#key activeManagementPanel.id}` remount boundary.
5. Move scoped CSS with the markup it controls.
6. Relocate the existing `MutationAvailability` type/factory into `$lib/scenarios`; do not create compatibility re-exports from `gameRouteController.ts`.
7. Pass the existing mutation capability bag to `ManagementPanelHost`; child panels keep their current explicit boolean/callback APIs.
8. Model `financeMetrics` as `FinanceMetrics | null` at the host boundary. Only the finance branch requires it; no route-side non-null assertion is allowed.
9. Move inspector conditionals verbatim rather than translating them into new boolean algebra.
10. HPA-574 extends the concrete hosts but still has route-owned touch points; HPA-568 does not pretend to eliminate all future route edits.

## Current and target mount topology

The mount topology is a behavioral contract because inspector positioning uses an absolute overlay inside the relatively positioned `.map-layout` container.

Current shape:

```text
main.app
├─ section.map-layout (position: relative)
│  ├─ div.map-surfaces
│  │  ├─ WorldMap
│  │  ├─ CityMap
│  │  └─ IndustryMap
│  ├─ TopBar
│  ├─ scenario status
│  ├─ ControlDesk
│  ├─ placement / finance-review / build / advisor overlays
│  └─ retail / rail / industry inspector overlays (position: absolute)
├─ StoreDetailModal
├─ control-tower management backdrop (position: fixed)
├─ SavePanel
├─ ScenarioCatalog / results
└─ ShortcutCheatSheet
```

After HPA-568:

```text
main.app
├─ section.map-layout (position: relative)
│  ├─ MapSurfaceHost
│  ├─ TopBar
│  ├─ scenario status
│  ├─ ControlDesk
│  ├─ placement / finance-review / build / advisor overlays
│  └─ MapInspectorHost
├─ StoreDetailModal
├─ ManagementPanelHost (fixed backdrop)
├─ SavePanel
├─ ScenarioCatalog / results
└─ ShortcutCheatSheet
```

Non-negotiable placement rules:

- `MapSurfaceHost` replaces only the existing `.map-surfaces` element inside `.map-layout`.
- `MapInspectorHost` remains inside `.map-layout`, after the route-level map controls/overlays. Its `.inspector-overlay` keeps the current absolute positioning and offsets, so `.map-layout` remains the containing block.
- `ManagementPanelHost` remains outside `.map-layout`, exactly where the current fixed control-tower backdrop is mounted.

## Ownership after the change

### `src/routes/+page.svelte`

Keeps:

- `GameRouteController` construction and synchronization;
- sandbox/scenario/save state;
- `activeMapView` and visited-map mutation;
- selected world-city/tile/building/rail IDs and all selected-object lookups;
- city/industry map snapshots;
- report summaries and finance-metric derivation;
- build, placement, rail, finance-review, and store-detail state;
- all domain command handlers;
- active management-panel ID/menu configuration;
- global keyboard shortcuts and Escape priority;
- `TopBar`, `ControlDesk`, `BuildMenu`, `SupplyAdvisor`, store detail, saves, scenarios, shortcut sheet, and finance purchase review;
- alert/report navigation and cross-feature route selection.

### `$lib/scenarios/mutationAvailability.ts`

Owns the existing pure capability contract currently colocated in `gameRouteController.ts`:

```ts
export interface MutationAvailability {
  pending: boolean;
  advanceDay: boolean;
  resolveDecision: boolean;
  updatePolicy: boolean;
  openWorldCity: boolean;
  setRetailSupplySource: boolean;
  openStore: boolean;
  upgradeStore: boolean;
  hireStaff: boolean;
  assignStaff: boolean;
  unassignStaff: boolean;
  promoteStaff: boolean;
  updateStoreSellingPrice: boolean;
  updateStoreInventoryTargets: boolean;
  buildIndustrialBuilding: boolean;
  upgradeIndustrialBuilding: boolean;
  buildRail: boolean;
  upgradeRail: boolean;
  demolishRail: boolean;
  borrow: boolean;
  repayLoan: boolean;
  payOffLoan: boolean;
  refinanceLoan: boolean;
  financeWorldCity: boolean;
  financeRetailStore: boolean;
  financeIndustrialBuilding: boolean;
}
```

`createMutationAvailability` moves with the interface unchanged. It remains a pure mapping from sandbox/scenario state plus `ScenarioDefinition.allowedCommands` to booleans.

No re-export remains in `gameRouteController.ts`; call sites update to the new library import because this is a pre-release internal refactor and backward compatibility is not required.

### `MapSurfaceHost.svelte`

Owns only the mounted map surface stack and its layout CSS.

It receives the route's existing identifiers directly, including `mapSnapshot` and `industryMapSnapshot`, rather than introducing rename-only view models.

Conceptual contract:

```ts
interface Props {
  activeMapView: MapViewId;
  visitedMapViews: VisitedMapViews;
  isMapPaused: boolean;
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

  mapSnapshot: CityMapSnapshot;
  onSelectRetailTile: (tileId: string) => void;

  industryMapSnapshot: IndustryMapSnapshot;
  onSelectIndustryTile: (tileId: string) => void;
  onCancelRailBuild: () => void;
  railKeyboardEnabled: boolean;
}
```

The host may call `shouldRenderMapView`, but it does not mutate visited state or derive snapshots/capabilities.

### `MapInspectorHost.svelte`

Owns the existing inspector overlay markup and responsive overlay CSS.

The route continues to derive concrete selected objects and the existing visibility flags. The host moves the current template branches structurally unchanged:

```svelte
{#if selectedRetailTile && showRetailInspector}
  <!-- TileInspector branch -->
{/if}

{#if selectedRailSegments && showIndustryInspector}
  <!-- RailSegmentInspector branch -->
{:else if selectedIndustryTile && showIndustryInspector}
  <!-- IndustryTileInspector branch -->
{/if}
```

There are no new `showRail` / `showIndustryBuilding` helper booleans. The route-owned visibility flags continue to encode placement-mode rules; the host keeps the same null/truthiness checks the route template has today.

The host does not resolve IDs, query reports, choose active maps, or own `StoreDetailModal`.

### `ManagementPanelHost.svelte`

Owns:

- fixed backdrop and focus-trapped dialog shell;
- localized header, day/cash ticker, close actions;
- existing concrete switch for dashboard, policies, staff, stores, decisions, reports, product chains, and finance;
- stores/decisions two-column composition;
- control-tower responsive CSS.

It receives the existing `MutationAvailability` bag instead of a new set of duplicate availability props:

```ts
interface CorePresentationProps {
  panelId: ManagementPanelId;
  panelLabel: string;
  panelGame: GameState;
  summary: ReportSummary;
  financeMetrics: FinanceMetrics | null;
  retailSupplyViews: RetailCitySupplyView[];
  mutations: MutationAvailability;
  retailSupplyDisabled: boolean;
  focusedFinanceLoanId: string | null;
  i18n: I18nBundle;
  disabledReason: string | null;
}
```

The implementation plan defines the existing command callbacks individually; there is no generic callback bag.

The host maps `mutations.updatePolicy`, `mutations.hireStaff`, `mutations.resolveDecision`, and related fields to the child components' existing explicit APIs. This does not trigger a drive-by child-panel refactor.

For `panelId === 'finance'`, `financeMetrics` is a required programmer invariant. The prop remains nullable because the route intentionally derives metrics only while the finance panel is active. The finance branch asserts that invariant locally; the route call site must not use `financeMetrics!`.

The host does not calculate finance metrics, report summaries, or retail supply views.

## Data flow

```text
GameRouteController / GameState
          |
          v
      +page.svelte
  derivations + handlers
          |
          +--------------------+----------------------+----------------------+
          |                    |                      |                      |
          v                    v                      v                      v
 MutationAvailability   MapSurfaceHost        MapInspectorHost      ManagementPanelHost
 ($lib/scenarios)              |                      |                      |
                               v                      v                      v
                         existing maps          existing inspectors      existing panels
                               |                      |                      |
                               +---------- callbacks to +page.svelte ------+
                                                   |
                                                   v
                                      GameRouteController / domain
```

No host writes canonical state or calls `GameRouteController` directly.

## Styling

Move styles with their markup so Svelte scoped CSS remains effective.

`MapSurfaceHost` owns:

- `.map-surfaces`;
- `.map-surface`;
- `.active-map-surface`.

`MapInspectorHost` owns:

- `.inspector-overlay`;
- the existing 981–1023px bottom offset;
- the existing compact fixed-overlay rule at max-width 980px.

`ManagementPanelHost` owns:

- `.tower-backdrop` and backdrop button;
- `.control-tower-overlay`;
- `.tower-header`, `.tower-actions`, `.close-tower`;
- `.stores-surfaces` and `.decisions-surfaces`;
- the control-tower `h2` and `.ticker` styles;
- the existing compact control-tower/stores/decisions responsive rules.

Before deleting `.ticker` from `+page.svelte`, verify there are no remaining route-local `.ticker` elements. `TopBar.svelte` has its own scoped ticker styling and is unaffected.

No shared overlay stylesheet is introduced.

## Accessibility and keyboard behavior

Behavior remains unchanged:

- management dialog remains modal and uses the existing `focusTrap` attachment;
- map inspectors remain non-modal dialogs with the same localized accessible names;
- backdrop/close labels use the same translation keys;
- `+page.svelte` remains the only global shortcut and Escape-priority owner;
- `isMapPaused` and `railKeyboardEnabled` remain route derivations;
- `MapSurfaceHost` only passes those values through to the existing maps;
- no host installs a global keyboard listener.

## Testing strategy

### Map surface host

Use real `WorldMap`, `CityMap`, and `IndustryMap` children with the same local Phaser/scene mocks already used in the child component specs.

Cover:

- unvisited surfaces are not mounted;
- visited surfaces remain mounted while inactive;
- exactly one surface receives the active class;
- world-city selection callback wiring;
- `isMapPaused` pass-through by observing the mocked Phaser `pause` call on the active real map child;
- `railKeyboardEnabled` pass-through by observing `mockSetKeyboardEnabled(false)` in the mocked industry scene.

No generic child-component mock framework is needed.

### Map inspector host

Component tests cover:

- retail close/detail callback forwarding;
- rail inspector precedence over the industry-building inspector;
- industry-building fallback when there is no rail selection;
- mutation availability/disabled reason reaching existing controls.

A targeted assertion is added to the existing `retail-sim.e2e.ts` route smoke when a map inspector is open: the inspector must be a descendant of `.map-layout`. That locks the containing-block topology which a host-only test cannot prove.

### Management panel host

Cover:

- fixed modal shell, localized label, day/cash status, backdrop/close callback;
- representative `stores` and `decisions` multi-surface composition;
- finance `data-focused-finance-loan` metadata;
- finance branch with non-null metrics;
- existing mutation bag fields reach child panel controls.

Existing child-panel tests remain authoritative for internal child behavior.

### Commands

Follow repository guidance with these concrete checks:

```bash
bun run test:unit -- src/lib/components/game/MapSurfaceHost.svelte.spec.ts --run
bun run test:unit -- src/lib/components/game/MapInspectorHost.svelte.spec.ts --run
bun run test:unit -- src/lib/components/game/ManagementPanelHost.svelte.spec.ts --run
bun run check
bun run lint
bun run test:e2e -- src/routes/retail-sim.e2e.ts
bun run test
```

Do not replace the package-script E2E path with an ad-hoc Playwright invocation; the repository script owns the normal build/preview setup.

The initial RED step for each extracted component is only a TDD wiring scaffold: the test fails because the host does not exist yet. Behavioral confidence comes from characterization assertions before and after the mechanical cutover, not from pretending this is greenfield behavior.

## Coverage configuration

`vite.config.ts` keeps the existing `+page.svelte` coverage exclusion but replaces the stale route line-count comment with a testing-boundary explanation:

- `+page.svelte` is the route orchestration/composition root exercised by route E2E;
- extracted `$lib/components/game` hosts have browser component specs;
- route line count is not an architecture target.

No coverage provider/threshold/include/exclude behavior changes.

## Risks and controls

### Inspector containing block

**Risk:** moving `MapInspectorHost` outside `.map-layout` changes absolute positioning and can cover HUD/Desk controls without obvious logical failures.  
**Control:** explicit mount topology plus route E2E descendant assertion.

### Capability dependency direction

**Risk:** `$lib` host imports route-layer `MutationAvailability`, or the host duplicates it as a second shape.  
**Control:** relocate the existing pure type/factory to `$lib/scenarios/mutationAvailability.ts`; update imports directly; no compatibility re-export.

### Finance metric nullability

**Risk:** forcing `financeMetrics!` through a non-finance host call hides a real nullable contract.  
**Control:** nullable host prop and finance-branch invariant assertion.

### Mechanical extraction drift

**Risk:** rewriting inspector conditions or renaming unrelated props changes behavior during a refactor-only ticket.  
**Control:** preserve current route identifiers and move conditionals verbatim.

### Svelte scoped CSS drift

**Risk:** moving markup without matching CSS makes selectors stop applying.  
**Control:** each host owns exactly the CSS that styles its moved markup; final diff audit checks no orphan selectors remain.

## HPA-574 handoff

HPA-568 reduces three high-change presentation regions but intentionally leaves cross-feature orchestration in the route.

| HPA-574 change | Expected owner after HPA-568 |
| --- | --- |
| World-map logistics route drawing | `MapSurfaceHost` / `WorldMap` |
| Route inspector chrome/content composition | `MapInspectorHost` |
| Logistics management panel body/shell branch | `ManagementPanelHost` |
| New management panel ID and shortcut mnemonic | `keyboardShortcuts.ts` plus route menu configuration |
| Route selection state, open/close, Escape rank | `+page.svelte` |
| Map pause / rail-keyboard overlay participation | `+page.svelte` |
| Alert/report → route selection and map navigation | `+page.svelte` handlers/navigation helpers |
| Quote, dispatch, scheduling, utilization | HPA-294 domain/read-model APIs |

No additional extraction is required in HPA-568 merely to remove these remaining route-owned touch points.

## Scope audit

Out of scope:

- a second controller or state owner;
- generic panel/inspector/workspace registries;
- Svelte context/global stores;
- changes to simulation or persistence;
- logistics components for HPA-574;
- route/vehicle animation or pathfinding;
- unrelated UI redesign;
- compatibility layers for the relocated internal availability helper.

## Acceptance criteria

- [ ] `MapSurfaceHost.svelte` owns the three map surfaces and their scoped layout CSS.
- [ ] `MapInspectorHost.svelte` owns retail/rail/industry inspector composition and stays inside `.map-layout`.
- [ ] `ManagementPanelHost.svelte` owns the control-tower shell/switch and stays outside `.map-layout`.
- [ ] `+page.svelte` remains the cross-feature state/command/navigation/shortcut root.
- [ ] `MutationAvailability` and `createMutationAvailability` live in `$lib/scenarios`, with existing call sites updated and no route-layer re-export.
- [ ] Management UI reuses the existing mutation bag; no duplicate availability shape is created.
- [ ] `financeMetrics` is nullable at the host boundary and no route call-site non-null assertion hides that contract.
- [ ] Inspector template branches preserve current truthiness and `if`/`else-if` precedence.
- [ ] World-city inspection remains inside `WorldMap`.
- [ ] The route still owns `{#key activeManagementPanel.id}`, global `handleKeydown`, and Escape ordering.
- [ ] Existing visuals/player flows remain unchanged.
- [ ] Existing `retail-sim.e2e.ts` includes a minimal inspector-within-map-layout topology assertion.
- [ ] Focused browser specs, `bun run check`, `bun run lint`, targeted route E2E, and `bun run test` pass.
- [ ] `vite.config.ts` describes the testing boundary without a route line-count claim.
- [ ] The implementation PR lists what moved, what stayed route-owned, and confirms no new framework or canonical state owner was added.
