# Map and Management Presentation Boundaries Design

**Date:** 2026-08-08  
**Status:** Revised after second design review  
**Linear:** HPA-568 — Extract map and management presentation boundaries from the Serpens route  
**Dependency:** HPA-554 is complete; HPA-568 prepares the presentation surfaces HPA-574 will extend.

## Summary

HPA-568 is a focused **presentation-layout and testability cleanup** for `src/routes/+page.svelte`.

It extracts exactly three route-composition hosts:

- `src/routes/MapSurfaceHost.svelte` — world, retail, and industry map surface composition;
- `src/routes/MapInspectorHost.svelte` — retail, rail, and industry-building inspector composition;
- `src/routes/ManagementPanelHost.svelte` — the existing control-tower shell and concrete management-panel switch.

The ticket does **not** claim to remove most future HPA-574 edits from `+page.svelte`. HPA-574 still needs route-script changes for route selection state, management-panel IDs/shortcuts, Escape ordering, map pause/keyboard participation, and alert/report navigation. HPA-568 only removes the three high-change presentation regions and moves their scoped CSS/tests to clearer homes.

`+page.svelte` remains the cross-feature composition and command root. `GameRouteController` remains the sole route command/persistence coordinator.

No simulation, persistence, save-schema, scenario semantics, finance rules, localization copy, map behavior, or player-visible workflow changes.

## Why this cut

The useful boundary is presentation composition, not another state architecture.

The route currently mixes:

- three map renderers and keep-alive visibility markup;
- retail, rail, and industry inspector overlay markup/CSS;
- the complete control-tower modal shell and concrete panel switch;
- controller/state/selection logic;
- shortcuts and Escape priority;
- saves, scenarios, finance review, alerts, build/advisor flows, and navigation.

The first three are cohesive presentation regions that can move mechanically. The remaining script-side responsibilities are intentionally retained because HPA-568 is not a route-state rewrite.

A fourth extraction for selection/Escape/overlay state is rejected for this ticket. It would materially broaden the scope, alter ownership rules already stated by HPA-568, and create a second refactor immediately before HPA-574 without proven need. If HPA-574 exposes a concrete route-script collision, that work can be extracted then.

## Decisions

1. Keep exactly three concrete hosts. No `MapWorkspace`, generic inspector/panel registry, Svelte context/store, event bus, or second controller.
2. Put the hosts in `src/routes/`, beside the existing `FinancePurchaseReviewHost.svelte` route-composition precedent.
3. Do **not** relocate `MutationAvailability` as part of HPA-568. `ManagementPanelHost` may consume the existing route-local type because it is also route-local.
4. Keep `+page.svelte` as the owner of selections, snapshots, active panel ID, route commands, shortcuts, Escape priority, map pause/keyboard derivations, and navigation.
5. Preserve the world-city inspector inside `WorldMap.svelte`.
6. Preserve `{#key activeManagementPanel.id}` in `+page.svelte`.
7. Move scoped CSS with the markup it controls.
8. Model `financeMetrics` as `FinanceMetrics | null` at the host boundary; no route-side `financeMetrics!` assertion.
9. Move inspector template branches structurally unchanged. Boundary prop names may clarify retail/industry meaning, but the host keeps the current truthiness and `if`/`else-if` behavior.
10. Use route E2E after every route-template cutover. Component specs cover host composition; existing child specs remain authoritative for child internals.
11. HPA-574 still has explicit route-owned touch points; the three hosts are presentation extension points, not a claim that the route stops changing.

## Current and target mount topology

The mount topology is a behavioral contract because `.inspector-overlay` is absolutely positioned relative to `.map-layout`.

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

- `MapSurfaceHost` replaces only the existing `.map-surfaces` block inside `.map-layout`.
- `MapInspectorHost` remains the final map presentation child inside `.map-layout`, after the existing map controls/overlays.
- `ManagementPanelHost` remains outside `.map-layout`, where the current fixed control-tower backdrop is mounted.

## Ownership after the change

### `src/routes/+page.svelte`

Keeps:

- `GameRouteController` construction/synchronization;
- sandbox/scenario/save state;
- `activeMapView` and visited-map mutation;
- selected world-city/tile/building/rail IDs and selected-object derivations;
- city/industry map snapshots;
- report summaries and finance-metric derivation;
- build, placement, rail, finance-review, and store-detail state;
- domain command handlers;
- active management-panel ID and menu configuration;
- global shortcuts and Escape priority;
- `isMapPaused` and `railKeyboardEnabled`;
- `TopBar`, `ControlDesk`, `BuildMenu`, `SupplyAdvisor`, store detail, saves, scenarios, shortcut sheet, and finance purchase review;
- alert/report navigation and cross-feature route selection.

### `src/routes/MapSurfaceHost.svelte`

Owns only the mounted map surface stack and its scoped surface CSS.

Conceptual props:

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

The host may use `shouldRenderMapView`; it does not mutate visited state, derive snapshots, or own route navigation.

### `src/routes/MapInspectorHost.svelte`

Owns the existing inspector overlay markup and responsive CSS.

The route passes concrete selected objects plus existing visibility flags. The host preserves the template structure:

```svelte
{#if selectedRetailTile && showRetailInspector}
  <!-- TileInspector -->
{/if}

{#if selectedRailSegments && showIndustryInspector}
  <!-- RailSegmentInspector -->
{:else if selectedIndustryTile && showIndustryInspector}
  <!-- IndustryTileInspector -->
{/if}
```

The route continues to own the placement-mode logic inside `shouldShowRetailInspector` / `shouldShowIndustryInspector`; the host only combines those flags with the same selected-object truthiness checks used today.

The host does not resolve IDs, query reports, choose maps, or own `StoreDetailModal`.

### `src/routes/ManagementPanelHost.svelte`

Owns:

- fixed backdrop and focus-trapped dialog shell;
- localized header, day/cash ticker, close actions;
- existing concrete switch for dashboard, policies, staff, stores, decisions, reports, product chains, and finance;
- stores/decisions two-column composition;
- control-tower responsive CSS.

It consumes the existing route-local `MutationAvailability` type as a capability bag and maps it to current child APIs. No duplicate availability shape and no availability-module relocation are required.

Core contract:

```ts
interface Props {
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

  onClose: () => void;
  onChangePolicy: (patch: Partial<CompanyPolicy>) => void;
  onHireStaff: (candidateId: string) => void;
  onAssignStaff: (staffId: string, storeId: string) => void;
  onUnassignStaff: (staffId: string) => void;
  onPromoteStaff: (staffId: string) => void;
  onSetRetailSupplySource: (retailCityId: string, supplyCityId: string | null) => void;
  onChooseDecision: (decisionId: string, optionId: string) => void;
  onBorrow: (amount: number, termDays: LoanTermDays) => Promise<GameRouteCommitResult>;
  onRepay: (loanId: string, amount: number) => Promise<GameRouteCommitResult>;
  onPayoff: (loanId: string) => Promise<GameRouteCommitResult>;
  onRefinance: (loanId: string, termDays: LoanTermDays) => Promise<GameRouteCommitResult>;
}
```

`MutationAvailability` is imported as a route-local type from `./gameRouteController`. `GameRouteCommitResult` is imported directly from `$lib/game/commandResult`, not through the route-controller re-export.

For `panelId === 'finance'`, non-null finance metrics are a programmer invariant checked locally in the finance branch. The host does not calculate metrics itself.

## Styling ownership

`MapSurfaceHost` moves:

- `.map-surfaces`;
- `.map-surface`;
- `.active-map-surface`.

`MapInspectorHost` moves:

- `.inspector-overlay`;
- the existing 981–1023px bottom offset;
- the existing max-width 980px fixed-overlay rule.

`ManagementPanelHost` moves:

- `.tower-backdrop` / backdrop button;
- `.control-tower-overlay`;
- `.tower-header`, `.tower-actions`, `.close-tower`;
- `.stores-surfaces`, `.decisions-surfaces`;
- control-tower `h2` styling;
- route-local `.ticker` styling;
- current compact control-tower/stores/decisions responsive rules.

The two route-local `.ticker` usages are both inside the current control-tower header, so the route `.ticker` rule moves completely with `ManagementPanelHost`. `TopBar.svelte` has its own scoped ticker rule and is unaffected.

No shared overlay stylesheet is introduced.

## Accessibility and keyboard behavior

Behavior remains unchanged:

- management dialog remains `aria-modal="true"` with `focusTrap`;
- map inspectors remain non-modal dialogs with current localized names;
- backdrop/close labels use existing translation keys;
- `+page.svelte` remains the global shortcut/Escape owner;
- `isMapPaused` and `railKeyboardEnabled` remain route derivations;
- hosts install no new global keyboard listeners.

## Testing strategy

### `MapSurfaceHost.svelte.spec.ts`

Test only host-owned behavior:

- unvisited surfaces are not mounted;
- visited surfaces remain mounted while inactive;
- exactly one surface has the active class;
- world-city selection callback remains wired.

Use the smallest local Phaser/scene stubs necessary to allow the real `CityMap` / `IndustryMap` children to mount. Do **not** rebuild child-level pause/keyboard tests in the host spec. `CityMap.svelte.spec.ts` and `IndustryMap.svelte.spec.ts` remain authoritative for those child prop semantics, and route E2E runs immediately after the cutover.

No generic component-mock framework or extra test-child files are introduced.

### `MapInspectorHost.svelte.spec.ts`

Cover:

- retail close/detail callback forwarding;
- rail inspector precedence over industry-building inspector;
- industry-building fallback with no rail selection;
- mutation disabled state reaching current inspector controls.

The existing route E2E gains one topology assertion when an inspector is open. Assert `toHaveCount(1)` **before** `toBeVisible()` so duplication reports as a count failure rather than strict-mode ambiguity.

### `ManagementPanelHost.svelte.spec.ts`

Cover:

- modal shell, label, day/cash status, backdrop/close callback;
- representative stores and decisions compositions;
- finance focus metadata;
- finance branch with non-null metrics;
- existing mutation bag fields reaching child controls.

Existing child-panel specs remain authoritative for internal behavior.

### Route verification

Every route-template cutover runs the existing route E2E before commit:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

This is intentionally heavier than a type check because `page.svelte.spec.ts` does not render `+page.svelte` and the route E2E is the repository's integration net for map/panel markup.

No artificial RED step is required merely to prove a host file does not exist. These are move refactors: characterization + cutover + integration verification is the useful cycle.

## Coverage configuration

`vite.config.ts` keeps the existing `+page.svelte` coverage exclusion but replaces the stale route line-count comment with a testing-boundary explanation:

- `+page.svelte` is the route orchestration/composition root exercised by route E2E;
- route-local host components have focused browser component specs;
- line count is not an architecture target.

No provider/threshold/include/exclude behavior changes.

## Risks and controls

### Inspector containing block

**Risk:** moving the inspector host outside `.map-layout` changes absolute positioning.  
**Control:** explicit topology plus route E2E descendant assertion.

### Route integration after mechanical moves

**Risk:** a component spec passes while the route mount/callback wiring breaks.  
**Control:** run `retail-sim.e2e.ts` after each cutover task.

### Finance metric nullability

**Risk:** a route-side non-null assertion hides the actual conditional metric lifecycle.  
**Control:** nullable host prop and local finance-branch invariant.

### Mechanical extraction drift

**Risk:** rewritten conditions or rename-only logic changes behavior during a refactor ticket.  
**Control:** preserve the current branch structure and current route-derived flags; only boundary names may clarify retail/industry meaning.

### Svelte scoped CSS drift

**Risk:** moved markup loses its scoped styles.  
**Control:** move each scoped selector with its markup and verify via route E2E.

## HPA-574 handoff

HPA-568 improves presentation ownership/testability but intentionally does not remove most script-side route edits.

| HPA-574 change | Expected owner after HPA-568 |
| --- | --- |
| World-map logistics route drawing | `src/routes/MapSurfaceHost.svelte` / `WorldMap` |
| Route inspector chrome/content | `src/routes/MapInspectorHost.svelte` |
| Logistics management panel body/shell branch | `src/routes/ManagementPanelHost.svelte` |
| New management panel ID + shortcut mnemonic | `keyboardShortcuts.ts` + route menu configuration |
| Route selection state / open-close / Escape rank | `+page.svelte` |
| Map pause / rail-keyboard overlay participation | `+page.svelte` |
| Alert/report → route selection / map navigation | `+page.svelte` handlers/navigation helpers |
| Quote, dispatch, scheduling, utilization | HPA-294 domain/read-model APIs |

If HPA-574 later demonstrates that the remaining script responsibilities create a concrete maintenance problem, extract that problem then rather than pre-building another route state layer in HPA-568.

## Scope audit

Out of scope:

- selection/Escape/overlay state extraction;
- a second controller/state owner;
- generic panel/inspector/workspace registries;
- Svelte context/global stores;
- `MutationAvailability` relocation;
- simulation or persistence changes;
- speculative logistics components;
- unrelated UI redesign;
- compatibility layers.

## Acceptance criteria

- [ ] `src/routes/MapSurfaceHost.svelte` owns the three map surfaces and their scoped layout CSS.
- [ ] `src/routes/MapInspectorHost.svelte` owns retail/rail/industry inspector composition and stays inside `.map-layout`.
- [ ] `src/routes/ManagementPanelHost.svelte` owns the control-tower shell/switch and stays outside `.map-layout`.
- [ ] `+page.svelte` remains the route state/command/navigation/shortcut root.
- [ ] `GameRouteController` remains unchanged.
- [ ] `MutationAvailability` remains the existing route-local capability model; no duplicate shape or relocation is introduced.
- [ ] `financeMetrics` is nullable at the host boundary and no route-side `financeMetrics!` remains.
- [ ] Inspector branches preserve current truthiness and `if`/`else-if` precedence.
- [ ] World-city inspection remains inside `WorldMap`.
- [ ] `{#key activeManagementPanel.id}`, `handleKeydown`, Escape ordering, map pause, and rail-keyboard derivations remain in `+page.svelte`.
- [ ] Existing `retail-sim.e2e.ts` proves inspector-within-map-layout topology and passes after every route cutover.
- [ ] Focused browser host specs, `bun run check`, `bun run lint`, route E2E, and final `bun run test` pass.
- [ ] `vite.config.ts` describes the testing boundary without a route line-count claim.
- [ ] No generic framework or new canonical state owner is added.
