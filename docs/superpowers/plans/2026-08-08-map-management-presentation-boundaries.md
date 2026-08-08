# Map and Management Presentation Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the existing map surfaces, map inspectors, and control-tower panel composition from `src/routes/+page.svelte` into three concrete presentation hosts without changing game behavior or introducing another state/controller abstraction.

**Architecture:** `+page.svelte` remains the cross-feature composition root and sole owner of route state, derivations, command handlers, global shortcuts, and overlay ordering. Each new `$lib/components/game` host receives already-derived values plus explicit callbacks and composes existing child components only. No host imports route code or calls `GameRouteController` directly.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest browser mode with `vitest-browser-svelte`, Playwright, Phaser 4, existing Serpens game/i18n contracts.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-08-map-management-presentation-boundaries-design.md` exactly.
- Extract exactly `MapSurfaceHost.svelte`, `MapInspectorHost.svelte`, and `ManagementPanelHost.svelte`.
- Do not create `MapWorkspace`, a generic registry, a new controller, a Svelte store/context layer, or another canonical state owner.
- `src/routes/+page.svelte` keeps `GameRouteController`, selected IDs, derived snapshots/read models, domain command handlers, active panel state, global shortcuts, and Escape ordering.
- `$lib/components/game` must not import `src/routes/gameRouteController.ts` or any other route file.
- Do not modify simulation, persistence, save schema, scenarios, finance rules, map rules, logistics domain contracts, or localization copy.
- Preserve the world-city inspector inside `WorldMap.svelte`.
- Preserve the `{#key activeManagementPanel.id}` remount boundary in `+page.svelte`.
- Move scoped CSS with the markup it controls; do not introduce a shared overlay stylesheet.
- Add component tests only for behavior that moves behind a new boundary.
- Retain `src/routes/retail-sim.e2e.ts` as the cross-feature route smoke.
- No compatibility, recovery, multi-tab, hostile-state, or speculative HPA-574 work.

---

## File Map

### Create

- `src/lib/components/game/MapSurfaceHost.svelte`
- `src/lib/components/game/MapSurfaceHost.svelte.spec.ts`
- `src/lib/components/game/MapInspectorHost.svelte`
- `src/lib/components/game/MapInspectorHost.svelte.spec.ts`
- `src/lib/components/game/ManagementPanelHost.svelte`
- `src/lib/components/game/ManagementPanelHost.svelte.spec.ts`

### Modify

- `src/routes/+page.svelte`
- `vite.config.ts`

### Must remain unchanged unless a demonstrated test gap requires otherwise

- `src/routes/gameRouteController.ts`
- `src/routes/retail-sim.e2e.ts`
- `src/lib/game/**` simulation and persistence contracts

---

### Task 1: Extract `MapSurfaceHost`

**Files:**
- Create: `src/lib/components/game/MapSurfaceHost.svelte`
- Create: `src/lib/components/game/MapSurfaceHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte` at the current `.map-surfaces` block and its scoped CSS.

**Interfaces:**
- Consumes: `MapViewId`, `VisitedMapViews`, `CityMapSnapshot`, `IndustryMapSnapshot`, `WorldCityStatus[]`, `I18nBundle`, existing route callbacks, and current mutation booleans.
- Produces: the same three mounted map surfaces with unchanged keep-alive, active, pause, keyboard, and callback behavior.

The host prop contract should be explicit:

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

- [ ] **Step 1: Write the failing component spec**

Create `MapSurfaceHost.svelte.spec.ts`. Copy the minimal `phaser`, `$lib/phaser/cityMapScene`, and `$lib/phaser/industryMapScene` mocks used by the existing map component specs; keep them local to this file.

Add a keep-alive test:

```ts
it('keeps visited map surfaces mounted and exposes only the active surface', async () => {
  const result = render(MapSurfaceHost, props({
    activeMapView: 'world',
    visitedMapViews: { world: true, retail: true, industry: false }
  }));

  expect(document.querySelectorAll('.map-surface')).toHaveLength(2);
  expect(document.querySelectorAll('.active-map-surface')).toHaveLength(1);
  await expect.element(page.getByRole('region', { name: /world map/i })).toBeVisible();

  await result.rerender(props({
    activeMapView: 'retail',
    visitedMapViews: { world: true, retail: true, industry: true }
  }));

  expect(document.querySelectorAll('.map-surface')).toHaveLength(3);
  expect(document.querySelectorAll('.active-map-surface')).toHaveLength(1);
});
```

Add one world-city selection callback assertion and one pass-through assertion proving `isMapPaused` and `railKeyboardEnabled` reach the child map mocks. Do not duplicate child-map behavior already covered by `WorldMap.svelte.spec.ts`, `CityMap.svelte.spec.ts`, or `IndustryMap.svelte.spec.ts`.

- [ ] **Step 2: Run the new test and confirm the expected red state**

```bash
bun run test:unit -- --run src/lib/components/game/MapSurfaceHost.svelte.spec.ts
```

Expected: FAIL resolving `./MapSurfaceHost.svelte`.

- [ ] **Step 3: Implement the host by moving the current map block**

Create `MapSurfaceHost.svelte` with the explicit props above. Import `shouldRenderMapView`, `WorldMap`, `CityMap`, and `IndustryMap`.

Use the existing map composition unchanged:

```svelte
<div class="map-surfaces">
  {#if shouldRenderMapView(visitedMapViews, 'world')}
    <div
      class={{ 'map-surface': true, 'active-map-surface': activeMapView === 'world' }}
      aria-hidden={activeMapView !== 'world'}
    >
      <WorldMap
        statuses={worldCityStatuses}
        {i18n}
        selectedCityId={selectedWorldCityId}
        onSelectCity={onSelectWorldCity}
        onOpenCity={onOpenWorldCity}
        onFinanceCity={onFinanceWorldCity}
        onCloseInspector={onCloseWorldInspector}
        {canOpenWorldCity}
        {canFinanceWorldCity}
        allowedCityIds={allowedWorldCityIds}
        disabledReason={mutationDisabledReason}
      />
    </div>
  {/if}

  {#if shouldRenderMapView(visitedMapViews, 'retail')}
    <div
      class={{ 'map-surface': true, 'active-map-surface': activeMapView === 'retail' }}
      aria-hidden={activeMapView !== 'retail'}
    >
      <CityMap
        snapshot={mapSnapshot}
        onTileSelected={onSelectRetailTile}
        active={activeMapView === 'retail'}
        paused={isMapPaused}
        {i18n}
      />
    </div>
  {/if}

  {#if shouldRenderMapView(visitedMapViews, 'industry')}
    <div
      class={{ 'map-surface': true, 'active-map-surface': activeMapView === 'industry' }}
      aria-hidden={activeMapView !== 'industry'}
    >
      <IndustryMap
        snapshot={industryMapSnapshot}
        onTileSelected={onSelectIndustryTile}
        onBuildCancelled={onCancelRailBuild}
        active={activeMapView === 'industry'}
        paused={isMapPaused}
        keyboardEnabled={railKeyboardEnabled}
        {i18n}
      />
    </div>
  {/if}
</div>
```

Move these styles from `+page.svelte` into the host:

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

- [ ] **Step 4: Cut `+page.svelte` over to the host**

Replace only the current map-surface block. Keep all of these route-owned values and handlers in place and pass them to the host:

```ts
activeMapView
visitedMapViews
worldCityStatuses
selectedWorldCityId
mapSnapshot
industryMapSnapshot
isMapPaused
railKeyboardEnabled
selectWorldCityNode
openSelectedWorldCity
reviewSelectedWorldCityFinancing
closeWorldInspector
selectTile
selectIndustryTile
cancelRailBuildStep
```

Remove the direct `WorldMap`, `CityMap`, and `IndustryMap` imports from `+page.svelte`. Do not move `TopBar`, `ControlDesk`, placement state, inspectors, or route handlers.

- [ ] **Step 5: Verify and commit**

```bash
bun run test:unit -- --run src/lib/components/game/MapSurfaceHost.svelte.spec.ts
bun run check
git add src/lib/components/game/MapSurfaceHost.svelte src/lib/components/game/MapSurfaceHost.svelte.spec.ts src/routes/+page.svelte
git commit -m "refactor(ui): extract map surface host"
```

Expected: tests and `bun run check` PASS before the commit.

---

### Task 2: Extract `MapInspectorHost`

**Files:**
- Create: `src/lib/components/game/MapInspectorHost.svelte`
- Create: `src/lib/components/game/MapInspectorHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte` at the current retail/rail/industry inspector blocks and `.inspector-overlay` CSS.

**Interfaces:**
- Consumes: concrete selected objects already derived by the route, `GameState`, `I18nBundle`, explicit mutation booleans, and existing callbacks.
- Produces: the same inspector overlays with rail-before-industry-building precedence.

Use this contract:

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

- [ ] **Step 1: Write failing inspector-host characterization tests**

Use `createNewGame` plus lightweight concrete tile/building/rail fixtures. Do not create a generic inspector registry or shared fixture framework.

Lock the precedence contract:

```ts
it('shows rail details instead of building details when a rail segment is selected', async () => {
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

Also add:

- a retail inspector test that exercises the existing close and open-details callbacks;
- an industry-building test with `selectedRailSegments: null`;
- one disabled mutation assertion to prove the existing `disabledReason`/availability reaches the child control.

- [ ] **Step 2: Run the test and confirm the expected red state**

```bash
bun run test:unit -- --run src/lib/components/game/MapInspectorHost.svelte.spec.ts
```

Expected: FAIL resolving `./MapInspectorHost.svelte`.

- [ ] **Step 3: Implement the host by moving the three current inspector branches verbatim**

The implementation must preserve these exact conditions:

```ts
const showRetail = selectedRetailTile !== null && showRetailInspector;
const showRail = selectedRailSegments !== null && showIndustryInspector;
const showIndustryBuilding =
  selectedRailSegments === null && selectedIndustryTile !== null && showIndustryInspector;
```

Render the same existing child components under those conditions:

```text
showRetail -> TileInspector
showRail -> RailSegmentInspector
showIndustryBuilding -> IndustryTileInspector
```

Keep the existing dialog roles, `aria-modal="false"`, localized labels, child props, and callbacks unchanged. Move the current `.inspector-overlay` base rule, the `981px–1023px` rule, and the `max-width: 980px` rule into `MapInspectorHost.svelte`.

`StoreDetailModal` remains in `+page.svelte`.

- [ ] **Step 4: Cut `+page.svelte` over to the host**

The route must continue to derive and own:

```ts
selectedTile
selectedStore
latestSelectedStoreReport
selectedIndustryTile
selectedIndustryBuilding
selectedRailSegments
industryRailSegments
shouldShowRetailInspector
shouldShowIndustryInspector
```

Pass `game ?? starterMapState` exactly as the existing inspectors receive it today. Remove the direct `TileInspector`, `IndustryTileInspector`, and `RailSegmentInspector` imports from the route.

- [ ] **Step 5: Verify and commit**

```bash
bun run test:unit -- --run src/lib/components/game/MapInspectorHost.svelte.spec.ts
bun run check
git add src/lib/components/game/MapInspectorHost.svelte src/lib/components/game/MapInspectorHost.svelte.spec.ts src/routes/+page.svelte
git commit -m "refactor(ui): extract map inspector host"
```

Expected: tests and `bun run check` PASS before the commit.

---

### Task 3: Extract `ManagementPanelHost`

**Files:**
- Create: `src/lib/components/game/ManagementPanelHost.svelte`
- Create: `src/lib/components/game/ManagementPanelHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte` at the active-management-panel block and control-tower CSS.

**Interfaces:**
- Consumes: `ManagementPanelId`, panel label, concrete `GameState`, `ReportSummary`, `FinanceMetrics`, `RetailCitySupplyView[]`, i18n, explicit mutation booleans, finance focus, and existing callbacks.
- Produces: the same control-tower shell and concrete eight-panel switch.

Do not import route-layer `MutationAvailability`. Use explicit booleans:

```ts
interface Props {
  panelId: ManagementPanelId;
  panelLabel: string;
  panelGame: GameState;
  summary: ReportSummary;
  financeMetrics: FinanceMetrics;
  retailSupplyViews: RetailCitySupplyView[];
  i18n: I18nBundle;
  disabledReason: string | null;
  focusedFinanceLoanId: string | null;
  mutationPending: boolean;
  retailSupplyDisabled: boolean;

  canUpdatePolicy: boolean;
  canHireStaff: boolean;
  canAssignStaff: boolean;
  canUnassignStaff: boolean;
  canPromoteStaff: boolean;
  canResolveDecision: boolean;

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

`GameRouteCommitResult` is imported from `$lib/game/commandResult`, not from the route controller.

- [ ] **Step 1: Write the failing management-host spec**

Build the fixture from existing helpers:

```ts
const game = createNewGame('convenience', 20260808);
const summary = summarizeReports(game.reports);
const financeMetrics = getFinanceMetrics(game);
```

Test the shell and close behavior:

```ts
it('renders the selected panel in the control tower and closes from the backdrop', async () => {
  const onClose = vi.fn();
  render(ManagementPanelHost, managementProps({
    panelId: 'dashboard',
    panelLabel: 'Dashboard',
    onClose
  }));

  await expect.element(page.getByRole('dialog', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('button', { name: /dismiss dashboard/i }).click();
  expect(onClose).toHaveBeenCalledTimes(1);
});
```

Add focused composition coverage for:

- `stores`: both `RetailSupplySources` and `StoreOverview` content are present;
- `decisions`: both `DecisionQueue` and `ActiveModifiers` content are present;
- `finance`: the dialog carries the supplied `data-focused-finance-loan` value.

Do not duplicate all internal tests of the existing child panels.

- [ ] **Step 2: Run the test and confirm the expected red state**

```bash
bun run test:unit -- --run src/lib/components/game/ManagementPanelHost.svelte.spec.ts
```

Expected: FAIL resolving `./ManagementPanelHost.svelte`.

- [ ] **Step 3: Implement the control-tower shell and concrete panel switch**

Move the existing focus-trapped dialog shell verbatim. The critical shell remains:

```svelte
<div class="tower-backdrop">
  <button
    type="button"
    class="tower-backdrop-button"
    aria-label={i18n.t('route.controlTower.dismiss', { panel: panelLabel })}
    onclick={onClose}
  ></button>
  <div
    class="control-tower-overlay paper"
    role="dialog"
    aria-modal="true"
    aria-label={panelLabel}
    data-focused-finance-loan={panelId === 'finance' ? (focusedFinanceLoanId ?? undefined) : undefined}
    {@attach focusTrap}
  >
    <div class="tower-header">
      <div>
        <p class="eyebrow">{i18n.t('route.controlTower.eyebrow')}</p>
        <h2>{panelLabel}</h2>
      </div>
      <div
        class="tower-actions"
        role="group"
        aria-label={i18n.t('route.controlTower.panelStatus', { panel: panelLabel })}
      >
        <span class="ticker">{i18n.t('topBar.day', { day: i18n.format.integer(panelGame.day) })}</span>
        <strong class="ticker">{i18n.format.currency(panelGame.cash)}</strong>
        <button
          type="button"
          class="close-tower btn-danger"
          aria-label={i18n.t('route.controlTower.closePanel', { panel: panelLabel })}
          onclick={onClose}
        >
          {i18n.t('route.controlTower.close')}
        </button>
      </div>
    </div>
  </div>
</div>
```

Inside the existing `.control-tower-overlay`, move the current route switch unchanged:

```text
dashboard -> Scorecard
policies -> PolicyPanel
staff -> StaffPanel
stores -> RetailSupplySources + StoreOverview in .stores-surfaces
decisions -> DecisionQueue + ActiveModifiers in .decisions-surfaces
reports -> ReportsPanel
productChains -> ProductChainsPanel
finance -> FinancePanel
```

Keep every child prop/callback exactly as currently wired in `+page.svelte`, replacing only route-local variable names with host props. Do not convert the switch to a component registry.

Move the current `.tower-backdrop`, `.tower-backdrop-button`, `.control-tower-overlay`, `.stores-surfaces`, `.decisions-surfaces`, `.tower-header`, `.tower-actions`, `.close-tower`, management heading/ticker styles, and their current compact responsive rules into the host.

- [ ] **Step 4: Keep active-panel state and keyed remount in `+page.svelte`**

The route keeps this boundary:

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
      financeMetrics={financeMetrics!}
      {retailSupplyViews}
      {i18n}
      disabledReason={mutationDisabledReason}
      {focusedFinanceLoanId}
      mutationPending={scenarioCommandPending}
      retailSupplyDisabled={game === null || !mutationAvailability.setRetailSupplySource}
      canUpdatePolicy={mutationAvailability.updatePolicy}
      canHireStaff={mutationAvailability.hireStaff}
      canAssignStaff={mutationAvailability.assignStaff}
      canUnassignStaff={mutationAvailability.unassignStaff}
      canPromoteStaff={mutationAvailability.promoteStaff}
      canResolveDecision={mutationAvailability.resolveDecision}
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

Keep `activeManagementPanelId`, `openManagementPanel`, `closeManagementPanel`, `handleKeydown`, and the Escape priority chain in the route. Remove only child panel imports now owned solely by `ManagementPanelHost`.

- [ ] **Step 5: Verify and commit**

```bash
bun run test:unit -- --run src/lib/components/game/ManagementPanelHost.svelte.spec.ts
bun run check
git add src/lib/components/game/ManagementPanelHost.svelte src/lib/components/game/ManagementPanelHost.svelte.spec.ts src/routes/+page.svelte
git commit -m "refactor(ui): extract management panel host"
```

Expected: tests and `bun run check` PASS before the commit.

---

### Task 4: Correct the coverage boundary and run regression gates

**Files:**
- Modify: `vite.config.ts`
- Verify: all files changed in Tasks 1–3
- Verify unchanged: `src/routes/gameRouteController.ts`, `src/routes/retail-sim.e2e.ts`, simulation/persistence files.

**Interfaces:**
- Consumes: the three completed host boundaries.
- Produces: accurate coverage documentation plus regression evidence.

- [ ] **Step 1: Replace the stale route-size coverage comment**

Keep the coverage exclusion itself unchanged and replace only its explanatory comment with:

```ts
// +page.svelte is the route-level orchestration/composition root and is
// exercised end-to-end by retail-sim.e2e.ts. Extracted presentation hosts in
// src/lib/components/game have browser component specs, so excluding the route
// keeps unit coverage focused without using route line count as an architecture target.
'src/routes/+page.svelte',
```

Do not modify the coverage provider, include pattern, thresholds, or other exclusions.

- [ ] **Step 2: Run all new component specs together**

```bash
bun run test:unit -- --run \
  src/lib/components/game/MapSurfaceHost.svelte.spec.ts \
  src/lib/components/game/MapInspectorHost.svelte.spec.ts \
  src/lib/components/game/ManagementPanelHost.svelte.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run static checks**

```bash
bun run check
bun run lint
```

Expected: `svelte-check` reports 0 errors and 0 warnings; lint exits 0.

- [ ] **Step 4: Run the existing route-level Playwright smoke**

```bash
bun x playwright test src/routes/retail-sim.e2e.ts --workers=1
```

Expected: all tests in `src/routes/retail-sim.e2e.ts` PASS.

If browser binaries are absent, install them with the repository's existing Playwright dependency and rerun the same selected file:

```bash
bun x playwright install
bun x playwright test src/routes/retail-sim.e2e.ts --workers=1
```

Do not add a package script solely for HPA-568.

- [ ] **Step 5: Run the full regression suite**

```bash
bun run test
```

Expected: all unit/component and Playwright tests PASS.

- [ ] **Step 6: Perform the scope/dependency audit**

Confirm:

```text
src/routes/gameRouteController.ts is unchanged
src/lib/game simulation/persistence files are unchanged
no new host imports src/routes or gameRouteController
no new Svelte store/context/event bus/registry exists
no MapWorkspace or generic presentation framework exists
+page.svelte still owns handleKeydown and the Escape priority chain
+page.svelte still owns activeManagementPanelId and the keyed remount
WorldMap still owns the world-city inspector
retail-sim.e2e.ts is unchanged unless a demonstrated missing assertion required a minimal addition
```

Run:

```bash
rg "\$routes|src/routes|gameRouteController" \
  src/lib/components/game/MapSurfaceHost.svelte \
  src/lib/components/game/MapInspectorHost.svelte \
  src/lib/components/game/ManagementPanelHost.svelte
```

Expected: no matches.

- [ ] **Step 7: Commit the coverage comment and any final formatting-only cleanup**

If only `vite.config.ts` changed during this task:

```bash
git add vite.config.ts
git commit -m "chore(ui): document route presentation test boundary"
```

If Prettier required formatting changes in the three host files or `+page.svelte`, stage those exact formatting-only files together with `vite.config.ts` before using the same commit message.

---

## Final Review Checklist

- [ ] `MapSurfaceHost.svelte` owns only map surface composition and layout CSS.
- [ ] `MapInspectorHost.svelte` owns only retail/rail/industry inspector composition and overlay CSS.
- [ ] `ManagementPanelHost.svelte` owns only the control-tower shell and current panel switch.
- [ ] `+page.svelte` still owns route/controller state, handlers, global shortcuts, Escape order, and top-level overlay decisions.
- [ ] No host imports route code or calls `GameRouteController`.
- [ ] No generic registry/workspace/store/context abstraction was introduced.
- [ ] The world-city inspector remains inside `WorldMap.svelte`.
- [ ] `vite.config.ts` no longer describes the route by a line-count target.
- [ ] New component specs pass.
- [ ] `bun run check` passes.
- [ ] `bun run lint` passes.
- [ ] `src/routes/retail-sim.e2e.ts` passes.
- [ ] `bun run test` passes.
- [ ] The implementation PR description lists what moved, what deliberately stayed in the route, and confirms no new canonical state owner/framework was added.
