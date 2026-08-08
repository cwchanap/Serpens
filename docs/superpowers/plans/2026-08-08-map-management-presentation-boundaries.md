# Map and Management Presentation Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing map surfaces, map inspectors, and control-tower panel composition out of `src/routes/+page.svelte` into three route-local presentation hosts without changing game behavior.

**Architecture:** `+page.svelte` remains the route state/command/navigation/shortcut root. `MapSurfaceHost`, `MapInspectorHost`, and `ManagementPanelHost` live in `src/routes/` beside the existing `FinancePurchaseReviewHost` precedent and compose existing child components only. `GameRouteController` and `MutationAvailability` stay where they are; no new state abstraction or cross-layer relocation is required.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest browser mode, Playwright, Phaser 4, existing Serpens route/game/i18n contracts.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-08-map-management-presentation-boundaries-design.md` exactly.
- Create exactly three new hosts: `MapSurfaceHost.svelte`, `MapInspectorHost.svelte`, and `ManagementPanelHost.svelte` in `src/routes/`.
- Do not create `MapWorkspace`, a generic panel/inspector registry, a new controller, a Svelte context/store, event bus, or second canonical state owner.
- Do not extract selection/Escape/overlay-priority state in HPA-568.
- `+page.svelte` keeps selected IDs, map snapshots, report/finance derivations, domain command handlers, active panel ID, global shortcuts, Escape ordering, `isMapPaused`, `railKeyboardEnabled`, and navigation.
- `GameRouteController` stays unchanged.
- `MutationAvailability` and `createMutationAvailability` stay in `src/routes/gameRouteController.ts`; no relocation or duplicate shape.
- `MapSurfaceHost` replaces only `.map-surfaces` inside `.map-layout`.
- `MapInspectorHost` stays inside `.map-layout` as the final map presentation child.
- `ManagementPanelHost` stays outside `.map-layout` where the current fixed management backdrop lives.
- Preserve the world-city inspector inside `WorldMap.svelte`.
- Preserve `{#key activeManagementPanel.id}` in `+page.svelte`.
- Move inspector branches structurally unchanged; do not invent alternate precedence helpers.
- `financeMetrics` is `FinanceMetrics | null` at the host boundary; no route-side `financeMetrics!`.
- Move scoped CSS with its markup; do not create a shared overlay stylesheet.
- Run `retail-sim.e2e.ts` after every route-template cutover.
- Do not add compatibility, recovery, persistence, simulation, balance, localization, or speculative HPA-574 work.

---

## File Map

### Create

- `src/routes/MapSurfaceHost.svelte`
- `src/routes/MapSurfaceHost.svelte.spec.ts`
- `src/routes/MapInspectorHost.svelte`
- `src/routes/MapInspectorHost.svelte.spec.ts`
- `src/routes/ManagementPanelHost.svelte`
- `src/routes/ManagementPanelHost.svelte.spec.ts`

### Modify

- `src/routes/+page.svelte`
- `src/routes/retail-sim.e2e.ts` — one inspector-topology assertion only.
- `vite.config.ts` — coverage comment only.

### Must remain unchanged

- `src/routes/gameRouteController.ts`
- `src/routes/gameRouteController.spec.ts`
- `src/routes/page.svelte.spec.ts`
- `src/lib/game/**` simulation/persistence/domain contracts.

---

## Task 1: Extract `MapSurfaceHost`

**Files:**
- Create: `src/routes/MapSurfaceHost.svelte`
- Create: `src/routes/MapSurfaceHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes current route values: `activeMapView`, `visitedMapViews`, `mapSnapshot`, `industryMapSnapshot`, world-city status/selection values, pause/keyboard booleans, and current callbacks.
- Produces the same three map mounts with the same keep-alive and active-surface behavior.

Use this prop contract:

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

- [ ] **Step 1: Write the focused host characterization spec**

Create `src/routes/MapSurfaceHost.svelte.spec.ts`.

Use the smallest local Phaser/scene stubs required to let the real `CityMap` and `IndustryMap` components mount. Do not reconstruct child-level pause/keyboard assertions here; those remain covered by `CityMap.svelte.spec.ts` and `IndustryMap.svelte.spec.ts`.

Cover only host-owned behavior:

```ts
it('keeps visited surfaces mounted and exposes only the active surface', async () => {
  const result = render(MapSurfaceHost, surfaceProps({
    activeMapView: 'world',
    visitedMapViews: { world: true, retail: true, industry: false }
  }));

  expect(document.querySelectorAll('.map-surface')).toHaveLength(2);
  expect(document.querySelectorAll('.active-map-surface')).toHaveLength(1);
  await expect.element(page.getByRole('region', { name: /world map/i })).toBeVisible();

  await result.rerender(surfaceProps({
    activeMapView: 'retail',
    visitedMapViews: { world: true, retail: true, industry: true }
  }));

  expect(document.querySelectorAll('.map-surface')).toHaveLength(3);
  expect(document.querySelectorAll('.active-map-surface')).toHaveLength(1);
});
```

Add:

- one assertion that an unvisited surface is absent;
- one world-city button click that reaches `onSelectWorldCity`.

`surfaceProps` returns complete small snapshots, one valid world-city status, `createI18n('en')`, and `vi.fn()` callbacks. Keep all test stubs in this spec; do not add a shared mock framework.

- [ ] **Step 2: Implement `MapSurfaceHost.svelte` as a mechanical move**

Move the current `.map-surfaces` block nearly verbatim. Preserve current child props, including:

```text
CityMap.active <- activeMapView === 'retail'
CityMap.paused <- isMapPaused
IndustryMap.active <- activeMapView === 'industry'
IndustryMap.paused <- isMapPaused
IndustryMap.keyboardEnabled <- railKeyboardEnabled
```

The host may import `shouldRenderMapView` from `$lib/game/mapViewKeepAlive`.

Move exactly these styles from `+page.svelte`:

```css
.map-surfaces,
.map-surface {
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
}

.map-surface {
  pointer-events: none;
  visibility: hidden;
}

.active-map-surface {
  pointer-events: auto;
  visibility: visible;
}
```

- [ ] **Step 3: Cut over only the current `.map-surfaces` mount**

Inside the existing `<section class="map-layout">`, replace only the `.map-surfaces` block with `MapSurfaceHost`.

Keep `TopBar`, scenario status, `ControlDesk`, placement status, finance review, build menu, advisor, and inspectors in their current route positions.

Remove direct `WorldMap`, `CityMap`, and `IndustryMap` imports from `+page.svelte`.

- [ ] **Step 4: Verify the component and real route before committing**

Run:

```bash
bun run test:unit -- src/routes/MapSurfaceHost.svelte.spec.ts --run
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: focused host spec, Svelte diagnostics, and the full route smoke pass.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/routes/MapSurfaceHost.svelte src/routes/MapSurfaceHost.svelte.spec.ts src/routes/+page.svelte
git commit -m "refactor(ui): extract map surface host"
```

---

## Task 2: Extract `MapInspectorHost` and lock its containing block

**Files:**
- Create: `src/routes/MapInspectorHost.svelte`
- Create: `src/routes/MapInspectorHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

**Interfaces:**
- Consumes concrete selected objects, route-derived visibility flags, mutation booleans, and current callbacks.
- Produces the same retail and rail/industry inspector branches with unchanged truthiness and precedence.

Use this prop contract:

```ts
interface Props {
  game: GameState;
  i18n: I18nBundle;
  disabledReason: string | null;

  showRetailInspector: boolean;
  selectedRetailTile: CityTile | null;
  selectedStore: Store | null;
  latestStoreReport: DailyStoreReport | null;
  canUpgradeStore: boolean;
  onUpgradeStore: (storeId: string) => void;
  onOpenStoreDetails: () => void;
  onRetailClickFeedback: () => void;
  onCloseRetailInspector: () => void;

  showIndustryInspector: boolean;
  selectedIndustryTile: IndustryTile | null;
  selectedIndustryBuilding: IndustrialBuilding | null;
  selectedRailSegments: RailSegment[] | null;
  allIndustryRailSegments: RailSegment[];
  industryCityId: string;
  canUpgradeIndustryBuilding: boolean;
  canUpgradeRail: boolean;
  canDemolishRail: boolean;
  onUpgradeIndustryBuilding: (buildingId: string) => void;
  onUpgradeRailSegment: (segmentId: string) => void;
  onDemolishRailSegment: (segmentId: string) => void;
  onCloseIndustryInspector: () => void;
}
```

- [ ] **Step 1: Write inspector characterization tests**

Create `src/routes/MapInspectorHost.svelte.spec.ts` with lightweight concrete fixtures.

Cover:

```text
retail selected + visible -> TileInspector renders
Open Details -> onOpenStoreDetails called once
Close -> onCloseRetailInspector called once
rail selection + industry visible -> RailSegmentInspector renders
rail selection + industry tile -> IndustryTileInspector does not render
no rail selection + industry tile -> IndustryTileInspector renders
disabled upgrade capability -> existing child control remains disabled
```

Lock the branch precedence directly:

```ts
it('prefers rail details over industry building details', async () => {
  render(MapInspectorHost, inspectorProps({
    showIndustryInspector: true,
    selectedIndustryTile: industryTile,
    selectedIndustryBuilding: warehouse,
    selectedRailSegments: [railSegment]
  }));

  await expect.element(page.getByRole('dialog', { name: /rail segment/i })).toBeVisible();
  await expect
    .element(page.getByRole('dialog', { name: /industry details/i }))
    .not.toBeInTheDocument();
});
```

- [ ] **Step 2: Implement the host by moving the current branches structurally unchanged**

Do not create alternate `showRail` / `showIndustryBuilding` helpers. Preserve:

```svelte
{#if selectedRetailTile && showRetailInspector}
  <!-- existing TileInspector wrapper -->
{/if}

{#if selectedRailSegments && showIndustryInspector}
  <!-- existing RailSegmentInspector wrapper -->
{:else if selectedIndustryTile && showIndustryInspector}
  <!-- existing IndustryTileInspector wrapper -->
{/if}
```

Boundary renames such as `selectedTile -> selectedRetailTile` are allowed only to clarify the host API; the conditional behavior inside the host must match the current route exactly.

Move the existing `.inspector-overlay` base rule plus both current responsive rules into the host unchanged in dimensions/breakpoints.

- [ ] **Step 3: Mount the host in the exact current layout position**

Inside `.map-layout`, keep this order:

```text
MapSurfaceHost
TopBar
scenario status
ControlDesk
placement status
FinancePurchaseReviewHost
BuildMenu
SupplyAdvisor
MapInspectorHost
```

`MapInspectorHost` must remain inside `.map-layout` immediately before its closing `</section>`.

Keep `StoreDetailModal` outside `.map-layout`.

Pass current route values directly:

```text
selectedTile -> selectedRetailTile
shouldShowRetailInspector -> showRetailInspector
selectedStore
latestSelectedStoreReport -> latestStoreReport
selectedIndustryTile
selectedIndustryBuilding
selectedRailSegments
industryRailSegments -> allIndustryRailSegments
industryCity.id -> industryCityId
```

- [ ] **Step 4: Add the containing-block assertion to the existing route smoke**

In the existing retail inspector flow, once the inspector is open:

```ts
const inspector = page.locator('.map-layout .inspector-overlay');
await expect(inspector).toHaveCount(1);
await expect(inspector).toBeVisible();
```

Count first so duplicate overlays fail with the intended count diagnostic rather than a strict-mode visibility error.

Do not add a new E2E file.

- [ ] **Step 5: Verify the component and real route before committing**

```bash
bun run test:unit -- src/routes/MapInspectorHost.svelte.spec.ts --run
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: all pass.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/routes/MapInspectorHost.svelte src/routes/MapInspectorHost.svelte.spec.ts src/routes/+page.svelte src/routes/retail-sim.e2e.ts
git commit -m "refactor(ui): extract map inspector host"
```

---

## Task 3: Extract `ManagementPanelHost` without relocating route capabilities

**Files:**
- Create: `src/routes/ManagementPanelHost.svelte`
- Create: `src/routes/ManagementPanelHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes the active panel identity/label, current/fallback game, report summary, nullable finance metrics, retail supply views, existing `MutationAvailability`, and current callbacks.
- Produces the same focus-trapped control-tower shell and concrete eight-panel switch.

Import types explicitly:

```ts
import type { MutationAvailability } from './gameRouteController';
import type { GameRouteCommitResult } from '$lib/game/commandResult';
```

Use this core prop contract:

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

- [ ] **Step 1: Write the focused management composition spec**

Create `src/routes/ManagementPanelHost.svelte.spec.ts` using existing game/read-model helpers.

Cover:

```text
dashboard -> modal shell renders correct label/day/cash
backdrop close -> onClose called
stores -> RetailSupplySources + StoreOverview render
decisions -> DecisionQueue + ActiveModifiers render
finance -> data-focused-finance-loan preserved
finance + non-null financeMetrics -> FinancePanel renders
mutation bag -> representative policy/staff/decision controls reflect capability fields
```

Do not retest every child panel behavior already covered by its own spec.

- [ ] **Step 2: Implement `ManagementPanelHost.svelte` by moving the current shell/switch**

Move the current backdrop, focus-trapped dialog, header, day/cash ticker, close control, and concrete panel switch.

Keep child APIs unchanged. Map the existing bag fields directly:

```text
PolicyPanel.canUpdate <- mutations.updatePolicy
StaffPanel.canHire <- mutations.hireStaff
StaffPanel.canAssign <- mutations.assignStaff
StaffPanel.canUnassign <- mutations.unassignStaff
StaffPanel.canPromote <- mutations.promoteStaff
DecisionQueue.canResolve <- mutations.resolveDecision
FinancePanel.mutationPending <- mutations.pending
RetailSupplySources.disabled <- retailSupplyDisabled
```

Do not move `createMutationAvailability`; the host only consumes the route's already-derived bag.

For finance metrics:

```ts
function requireFinanceMetrics(): FinanceMetrics {
  if (financeMetrics === null) {
    throw new Error('ManagementPanelHost invariant: financeMetrics required for finance panel');
  }
  return financeMetrics;
}
```

Call `requireFinanceMetrics()` only in the finance branch.

Move the current control-tower CSS into this host:

```text
.tower-backdrop
.tower-backdrop-button
.control-tower-overlay
.stores-surfaces
.decisions-surfaces
.tower-header
.tower-actions
.close-tower
control-tower h2 rule
.ticker
management-specific compact responsive rules
```

The two route-local `.ticker` usages are both in this shell, so move the route `.ticker` rule completely. `TopBar.svelte` owns its separate scoped ticker style.

- [ ] **Step 3: Cut over the route while retaining active-panel/key/shortcut ownership**

Keep:

```svelte
{#if activeManagementPanel}
  {#key activeManagementPanel.id}
    {@const panelGame = game ?? starterMapState}
    {@const retailSupplyViews = buildRetailCitySupplyViews(panelGame, i18n)}
    <ManagementPanelHost
      panelId={activeManagementPanel.id}
      panelLabel={activeManagementPanel.label}
      {panelGame}
      {summary}
      {financeMetrics}
      {retailSupplyViews}
      mutations={mutationAvailability}
      retailSupplyDisabled={game === null || !mutationAvailability.setRetailSupplySource}
      {focusedFinanceLoanId}
      {i18n}
      disabledReason={mutationDisabledReason}
      onClose={closeManagementPanel}
      onChangePolicy={changePolicy}
      onHireStaff={hireStaff}
      onAssignStaff={assignStaff}
      onUnassignStaff={unassignStoreStaff}
      onPromoteStaff={promoteStaffMember}
      onSetRetailSupplySource={setRetailSupplySource}
      onChooseDecision={chooseDecision}
      onBorrow={borrowWorkingCapital}
      onRepay={repayFinanceLoan}
      onPayoff={payOffFinanceLoan}
      onRefinance={refinanceFinanceLoan}
    />
  {/key}
{/if}
```

Do not use `financeMetrics!`.

Keep `activeManagementPanelId`, menu config, open/close handlers, global `handleKeydown`, Escape priority, `isMapPaused`, and `railKeyboardEnabled` in `+page.svelte`.

Remove only direct child panel imports now owned solely by `ManagementPanelHost`.

- [ ] **Step 4: Verify the component and real route before committing**

```bash
bun run test:unit -- src/routes/ManagementPanelHost.svelte.spec.ts --run
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: all pass.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/routes/ManagementPanelHost.svelte src/routes/ManagementPanelHost.svelte.spec.ts src/routes/+page.svelte
git commit -m "refactor(ui): extract management panel host"
```

---

## Task 4: Correct coverage documentation and run final gates

**Files:**
- Modify: `vite.config.ts`
- Verify: all Task 1–3 files.

- [ ] **Step 1: Replace only the stale route-size comment**

Keep the existing coverage exclusion and replace its line-count wording with:

```ts
// +page.svelte is the route-level state/orchestration/composition root and is
// exercised end-to-end by retail-sim.e2e.ts. Route-local presentation hosts
// have focused browser component specs, so route line count is not a coverage target.
'src/routes/+page.svelte',
```

Do not change coverage provider, include/exclude behavior, thresholds, or other config.

- [ ] **Step 2: Run all new host specs together**

```bash
bun run test:unit -- src/routes/MapSurfaceHost.svelte.spec.ts src/routes/MapInspectorHost.svelte.spec.ts src/routes/ManagementPanelHost.svelte.spec.ts --run
```

Expected: PASS.

- [ ] **Step 3: Run static checks**

```bash
bun run check
bun run lint
```

Expected: `svelte-check` reports 0 errors/0 warnings; lint exits 0.

- [ ] **Step 4: Run the route smoke again**

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full regression suite**

```bash
bun run test
```

Expected: all unit/component and Playwright tests pass.

- [ ] **Step 6: Run the architecture/topology audit**

Confirm:

```text
MapSurfaceHost is inside .map-layout and replaces only .map-surfaces
MapInspectorHost is inside .map-layout after route-level map overlays
ManagementPanelHost is outside .map-layout
WorldMap still owns the world-city inspector
+page.svelte still owns handleKeydown / Escape ordering / activeManagementPanelId / isMapPaused / railKeyboardEnabled
GameRouteController is unchanged
MutationAvailability remains defined only in gameRouteController.ts
financeMetrics is passed to ManagementPanelHost without financeMetrics!
inspector branches preserve selected-object truthiness and rail if/else-if precedence
no generic workspace/registry/context/store/event bus exists
src/lib/game simulation/persistence files are unchanged
```

Mechanical checks:

```bash
rg "financeMetrics!" src/routes/+page.svelte
rg "class=\"ticker\"" src/routes/+page.svelte
rg "MapWorkspace|InspectorRegistry|PanelRegistry" src/routes src/lib
```

Expected:

```text
financeMetrics!: no matches
route-local ticker markup: no matches after management extraction
forbidden generic abstractions: no new production matches
```

- [ ] **Step 7: Commit the coverage comment / formatting-only cleanup**

```bash
git add vite.config.ts
git commit -m "chore(ui): document route presentation test boundary"
```

If Prettier touched an already-modified host/route file, stage only those formatting changes alongside `vite.config.ts`.

---

## Final Review Checklist

- [ ] Exactly three route-local presentation hosts were added.
- [ ] No selection/Escape/overlay state module was added.
- [ ] `MapSurfaceHost` owns only map surface composition/CSS.
- [ ] `MapInspectorHost` owns only map inspector composition/CSS and stays inside `.map-layout`.
- [ ] `ManagementPanelHost` owns only the control-tower shell/switch/CSS and stays outside `.map-layout`.
- [ ] `FinancePurchaseReviewHost` remains the route-local host precedent; no generic host framework was introduced.
- [ ] `+page.svelte` still owns route state, selections, handlers, navigation, shortcuts, Escape ordering, map pause, and rail-keyboard derivations.
- [ ] `GameRouteController` and `MutationAvailability` are unchanged.
- [ ] `GameRouteCommitResult` is imported by the management host from `$lib/game/commandResult`.
- [ ] `financeMetrics` is nullable at the host boundary and no route-side non-null assertion remains.
- [ ] Inspector branches were moved structurally unchanged.
- [ ] Route E2E count-then-visible assertion proves the inspector remains under `.map-layout`.
- [ ] `retail-sim.e2e.ts` passes after Tasks 1, 2, 3, and final cleanup.
- [ ] Focused host specs pass.
- [ ] `bun run check` passes.
- [ ] `bun run lint` passes.
- [ ] `bun run test` passes.
- [ ] `vite.config.ts` no longer uses route line count as an architecture/coverage explanation.
- [ ] The implementation PR describes HPA-568 as presentation/layout/testability cleanup and lists the HPA-574 route-script touch points that deliberately remain.
