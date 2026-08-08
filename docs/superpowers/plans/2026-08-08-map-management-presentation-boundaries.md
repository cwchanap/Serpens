# Map and Management Presentation Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the existing map surfaces, map inspectors, and control-tower panel composition from `src/routes/+page.svelte` into three concrete presentation hosts without changing game behavior or introducing another state/controller abstraction.

**Architecture:** `+page.svelte` remains the cross-feature composition root and the sole owner of route state, derivations, command handlers, global shortcuts, and overlay ordering. Each new `$lib/components/game` host receives already-derived values plus explicit callbacks and only composes existing child components. No host imports `src/routes` code or calls `GameRouteController` directly.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest browser mode with `vitest-browser-svelte`, Playwright, Phaser 4, existing Serpens game/i18n contracts.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-08-map-management-presentation-boundaries-design.md` exactly.
- Extract exactly `MapSurfaceHost.svelte`, `MapInspectorHost.svelte`, and `ManagementPanelHost.svelte`; do not create `MapWorkspace`, a generic registry, a new controller, or a Svelte store/context layer.
- `src/routes/+page.svelte` remains the owner of `GameRouteController`, route state, selected IDs, derived snapshots/read models, domain command handlers, active panel state, global shortcuts, and Escape ordering.
- `$lib/components/game` must not import `src/routes/gameRouteController.ts` or any other route file.
- Do not modify simulation, persistence, save schema, scenarios, finance rules, map rules, logistics domain contracts, or localization copy.
- Preserve the current world-city inspector inside `WorldMap.svelte`.
- Preserve the current `{#key activeManagementPanel.id}` remount boundary in `+page.svelte`.
- Move scoped CSS with the markup it controls; do not introduce a shared overlay stylesheet.
- Add component tests only for behavior that moves behind a host boundary; keep existing child-component tests authoritative for child behavior.
- Retain `src/routes/retail-sim.e2e.ts` as the cross-feature route smoke; do not create a new E2E suite unless a real uncovered regression is found during implementation.
- No backward-compatibility, hostile-state, multi-tab, recovery, or speculative HPA-574 logistics work.

---

## File Structure

### Create

- `src/lib/components/game/MapSurfaceHost.svelte` — mounted/visible world, retail, and industry map composition only.
- `src/lib/components/game/MapSurfaceHost.svelte.spec.ts` — keep-alive/active-surface and callback wiring coverage.
- `src/lib/components/game/MapInspectorHost.svelte` — retail, rail, and industry inspector overlay composition only.
- `src/lib/components/game/MapInspectorHost.svelte.spec.ts` — inspector visibility, precedence, and callback forwarding coverage.
- `src/lib/components/game/ManagementPanelHost.svelte` — control-tower shell, focus trap, and existing eight-panel switch.
- `src/lib/components/game/ManagementPanelHost.svelte.spec.ts` — shell, panel composition, close, and finance-focus metadata coverage.

### Modify

- `src/routes/+page.svelte` — replace moved markup with the three hosts; retain all orchestration/state/handlers; remove only imports and CSS now owned by hosts.
- `vite.config.ts` — replace the stale `+page.svelte` line-count comment with a testing-boundary explanation; keep the coverage exclude list unchanged.

### Verify without planned edits

- `src/routes/gameRouteController.ts` — must remain unchanged.
- `src/routes/retail-sim.e2e.ts` — run as the cross-feature smoke; edit only if execution proves the existing test misses a behavior required by HPA-568.

---

### Task 1: Extract the map surface host

**Files:**
- Create: `src/lib/components/game/MapSurfaceHost.svelte`
- Create: `src/lib/components/game/MapSurfaceHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte` — the `.map-surfaces` block and its three map children; remove the map-surface CSS that moves with it.

**Interfaces:**
- Consumes: `MapViewId`, `VisitedMapViews`, `CityMapSnapshot`, `IndustryMapSnapshot`, `WorldCityStatus[]`, `I18nBundle`, explicit route callbacks/availability booleans.
- Produces: one presentation component that preserves the current map keep-alive, active visibility, Phaser pause, industry keyboard, and world-map callback contracts.

Use this explicit prop direction; do not replace it with a route view-model object:

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

- [ ] **Step 1: Write the failing map-host component spec**

Create `MapSurfaceHost.svelte.spec.ts`. Reuse the same minimal `phaser`, `$lib/phaser/cityMapScene`, and `$lib/phaser/industryMapScene` mocks already used by `CityMap.svelte.spec.ts` and `IndustryMap.svelte.spec.ts`; keep those mocks local to this spec.

The first characterization test should prove the keep-alive boundary rather than retesting Phaser internals:

```ts
it('mounts visited surfaces and exposes only the active surface', async () => {
  const { rerender } = render(MapSurfaceHost, props({
    activeMapView: 'world',
    visitedMapViews: { world: true, retail: true, industry: false }
  }));

  expect(document.querySelectorAll('.map-surface')).toHaveLength(2);
  expect(document.querySelector('.map-surface[aria-hidden="false"]')).toBeTruthy();
  await expect.element(page.getByRole('region', { name: /world map/i })).toBeVisible();

  await rerender(props({
    activeMapView: 'retail',
    visitedMapViews: { world: true, retail: true, industry: true }
  }));

  expect(document.querySelectorAll('.map-surface')).toHaveLength(3);
  expect(document.querySelectorAll('.active-map-surface')).toHaveLength(1);
});
```

Add one callback test that clicks a world-city button and verifies `onSelectWorldCity`, plus one pass-through assertion for `isMapPaused`/`railKeyboardEnabled` using the same mock call signals already used by the child map specs. Do not duplicate all `WorldMap`, `CityMap`, or `IndustryMap` behavior.

- [ ] **Step 2: Run the new spec and verify it fails because the host does not exist**

Run:

```bash
bun run test:unit -- --run src/lib/components/game/MapSurfaceHost.svelte.spec.ts
```

Expected: FAIL resolving `./MapSurfaceHost.svelte`.

- [ ] **Step 3: Implement the minimal map host**

Create `MapSurfaceHost.svelte` by moving the current map-surface markup nearly verbatim. Keep `shouldRenderMapView` as the only host-side helper; the parent still mutates `visitedMapViews`.

Core structure:

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

Move exactly these route styles into the host:

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

Do not move `TopBar`, scenario status, `ControlDesk`, placement status, inspectors, or any route handler.

- [ ] **Step 4: Replace only the map-surface block in `+page.svelte`**

Import `MapSurfaceHost` and replace the current `<div class="map-surfaces">...</div>` with one host invocation that passes the existing route variables and handlers directly.

The route must still own:

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

Delete only the now-unused `WorldMap`, `CityMap`, and `IndustryMap` imports from `+page.svelte`.

- [ ] **Step 5: Run the focused host spec and Svelte type check**

Run:

```bash
bun run test:unit -- --run src/lib/components/game/MapSurfaceHost.svelte.spec.ts
bun run check
```

Expected: both PASS.

- [ ] **Step 6: Commit the map-surface extraction**

```bash
git add src/lib/components/game/MapSurfaceHost.svelte \
  src/lib/components/game/MapSurfaceHost.svelte.spec.ts \
  src/routes/+page.svelte
git commit -m "refactor(ui): extract map surface host"
```

---

### Task 2: Extract the map inspector host

**Files:**
- Create: `src/lib/components/game/MapInspectorHost.svelte`
- Create: `src/lib/components/game/MapInspectorHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte` — retail/rail/industry inspector blocks and `.inspector-overlay` responsive CSS only.

**Interfaces:**
- Consumes: concrete selected objects from the route, `GameState`, `CityTile`, `Store`, `DailyStoreReport`, `IndustryTile`, `IndustrialBuilding`, `RailSegment[]`, `I18nBundle`, explicit mutation booleans, explicit callbacks.
- Produces: one presentational inspector host; selected IDs/lookups remain in `+page.svelte`.

Use a concrete interface like:

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

Use `createNewGame` plus minimal concrete tile/building/rail fixtures rather than building a generic inspector fixture library.

Cover the moved conditional behavior explicitly:

```ts
it('prefers the rail inspector over the industry building inspector', async () => {
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

Also cover a retail inspector close/detail callback and the industry-building fallback when `selectedRailSegments` is `null`.

- [ ] **Step 2: Run the new spec and verify it fails because the host does not exist**

```bash
bun run test:unit -- --run src/lib/components/game/MapInspectorHost.svelte.spec.ts
```

Expected: FAIL resolving `./MapInspectorHost.svelte`.

- [ ] **Step 3: Implement the inspector host by moving existing markup**

Preserve the exact current branch structure:

```svelte
{#if selectedRetailTile && showRetailInspector}
  <div class="inspector-overlay paper" role="dialog" aria-modal="false" aria-label={...}>
    <TileInspector ... />
  </div>
{/if}

{#if selectedRailSegments && showIndustryInspector}
  <div class="inspector-overlay paper" role="dialog" aria-modal="false" aria-label={...}>
    <RailSegmentInspector ... />
  </div>
{:else if selectedIndustryTile && showIndustryInspector}
  <div class="inspector-overlay paper" role="dialog" aria-modal="false" aria-label={...}>
    <IndustryTileInspector ... />
  </div>
{/if}
```

Move the current `.inspector-overlay` base rule and both existing responsive rules into the host unchanged except for formatting required by Prettier.

Do not move `StoreDetailModal`; it is a separate route-level overlay and remains in `+page.svelte`.

- [ ] **Step 4: Replace only the inspector blocks in `+page.svelte`**

The route continues to derive:

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

Pass `game ?? starterMapState` as the concrete `game` prop exactly as the existing inspectors currently receive it. Remove only the three inspector component imports now owned by the host.

- [ ] **Step 5: Run focused inspector tests and type check**

```bash
bun run test:unit -- --run src/lib/components/game/MapInspectorHost.svelte.spec.ts
bun run check
```

Expected: both PASS.

- [ ] **Step 6: Commit the inspector extraction**

```bash
git add src/lib/components/game/MapInspectorHost.svelte \
  src/lib/components/game/MapInspectorHost.svelte.spec.ts \
  src/routes/+page.svelte
git commit -m "refactor(ui): extract map inspector host"
```

---

### Task 3: Extract the management panel host

**Files:**
- Create: `src/lib/components/game/ManagementPanelHost.svelte`
- Create: `src/lib/components/game/ManagementPanelHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte` — active-management-panel dialog block and its owned CSS only.

**Interfaces:**
- Consumes: `ManagementPanelId`, panel label, concrete fallback/live `GameState`, `ReportSummary`, `FinanceMetrics`, `RetailCitySupplyView[]`, i18n, current finance focus, explicit mutation booleans, and existing callbacks.
- Produces: the same control-tower dialog shell and panel switch; active-panel state and keyboard behavior stay in `+page.svelte`.

Do **not** import `MutationAvailability` from `src/routes/gameRouteController.ts`. Define explicit booleans corresponding to current child props.

A representative prop contract is:

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

- [ ] **Step 1: Write the failing management-host component spec**

Build the fixture with existing helpers:

```ts
const game = createNewGame('convenience', 20260808);
const summary = summarizeReports(game.reports);
const financeMetrics = getFinanceMetrics(game);
```

Cover the shell and moved panel switch rather than re-testing each child component's internals:

```ts
it('renders the selected panel in the existing control-tower shell and closes from the backdrop', async () => {
  const onClose = vi.fn();
  render(ManagementPanelHost, managementProps({
    panelId: 'dashboard',
    panelLabel: 'Dashboard',
    onClose
  }));

  await expect.element(page.getByRole('dialog', { name: 'Dashboard' })).toBeVisible();
  await expect.element(page.getByText(/day/i)).toBeVisible();

  await page.getByRole('button', { name: /dismiss dashboard/i }).click();
  expect(onClose).toHaveBeenCalledTimes(1);
});
```

Add focused composition tests for:

- `stores`: both retail supply sources and store overview are mounted;
- `decisions`: both decision queue and active modifiers are mounted;
- `finance`: dialog keeps `data-focused-finance-loan` for the supplied loan ID.

Do not add eight copies of child component tests if an existing child spec already covers the internal UI.

- [ ] **Step 2: Run the new spec and verify it fails because the host does not exist**

```bash
bun run test:unit -- --run src/lib/components/game/ManagementPanelHost.svelte.spec.ts
```

Expected: FAIL resolving `./ManagementPanelHost.svelte`.

- [ ] **Step 3: Implement the control-tower host**

Move the existing backdrop/dialog/header and panel switch into `ManagementPanelHost.svelte`.

Preserve the shell behavior:

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
    <!-- existing header and concrete panel switch -->
  </div>
</div>
```

The switch stays concrete:

```svelte
{#if panelId === 'dashboard'}
  <Scorecard ... />
{:else if panelId === 'policies'}
  <PolicyPanel ... />
{:else if panelId === 'staff'}
  <StaffPanel ... />
{:else if panelId === 'stores'}
  <div class="stores-surfaces">...</div>
{:else if panelId === 'decisions'}
  <div class="decisions-surfaces">...</div>
{:else if panelId === 'reports'}
  <ReportsPanel ... />
{:else if panelId === 'productChains'}
  <ProductChainsPanel ... />
{:else if panelId === 'finance'}
  <FinancePanel ... />
{/if}
```

Do not replace this with a dynamic component registry or callback map.

Move the existing control-tower/stores/decisions CSS and the management-only `h2`/ticker styles into this host. Scope the heading style to the host shell rather than introducing a global style.

- [ ] **Step 4: Keep the active panel and keyed reset in `+page.svelte`**

Replace the existing block with:

```svelte
{#if activeManagementPanel}
  {#key activeManagementPanel.id}
    <ManagementPanelHost
      panelId={activeManagementPanel.id}
      panelLabel={activeManagementPanel.label}
      panelGame={game ?? starterMapState}
      ...
      onClose={closeManagementPanel}
    />
  {/key}
{/if}
```

Keep `activeManagementPanelId`, `openManagementPanel`, `closeManagementPanel`, keyboard toggles, and Escape handling in `+page.svelte`.

Keep these derivations in the route and pass their results:

```ts
summary
financeMetrics
focusedFinanceLoanId
mutationDisabledReason
scenarioCommandPending
```

Compute `retailSupplyViews` in the route from the same `panelGame` and `i18n` immediately before/through the host boundary; do not move a new state owner into the host.

Remove only the management child imports now owned solely by `ManagementPanelHost`.

- [ ] **Step 5: Run focused management tests and type check**

```bash
bun run test:unit -- --run src/lib/components/game/ManagementPanelHost.svelte.spec.ts
bun run check
```

Expected: both PASS.

- [ ] **Step 6: Commit the management extraction**

```bash
git add src/lib/components/game/ManagementPanelHost.svelte \
  src/lib/components/game/ManagementPanelHost.svelte.spec.ts \
  src/routes/+page.svelte
git commit -m "refactor(ui): extract management panel host"
```

---

### Task 4: Correct the coverage boundary and run regression gates

**Files:**
- Modify: `vite.config.ts`
- Verify: `src/routes/+page.svelte`
- Verify: `src/routes/gameRouteController.ts`
- Verify: `src/routes/retail-sim.e2e.ts`

**Interfaces:**
- Consumes: the three completed host boundaries.
- Produces: accurate coverage documentation and evidence that the extraction did not alter route behavior.

- [ ] **Step 1: Replace the stale route-size coverage comment**

Keep the existing coverage exclusion entry for `src/routes/+page.svelte`, but replace the line-count wording with a boundary explanation such as:

```ts
// +page.svelte is the route-level orchestration/composition root and is
// exercised end-to-end by retail-sim.e2e.ts. Extracted presentation hosts in
// src/lib/components/game have browser component specs, so excluding the route
// keeps unit coverage focused without using route line count as an architecture target.
'src/routes/+page.svelte',
```

Do not change coverage thresholds, provider, include patterns, or other exclusions.

- [ ] **Step 2: Run all three new browser component specs together**

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

Expected: `svelte-check` reports 0 errors/0 warnings; lint exits 0.

- [ ] **Step 4: Run the route-level Playwright smoke**

Use Playwright directly so the file selection is unambiguous and does not depend on npm argument forwarding:

```bash
bunx playwright test src/routes/retail-sim.e2e.ts --workers=1
```

Expected: all tests in `retail-sim.e2e.ts` PASS.

If the environment requires the repository script to install browser binaries first, run:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts --workers=1
```

Use the first command that matches the local environment; do not add a new package script solely for HPA-568.

- [ ] **Step 5: Run the complete regression suite**

```bash
bun run test
```

Expected: all unit/component and Playwright tests PASS.

- [ ] **Step 6: Perform the architecture/scope audit**

Inspect the branch diff and confirm all of the following before committing:

```text
src/routes/gameRouteController.ts is unchanged
src/lib/game simulation/persistence files are unchanged
no $lib component imports from src/routes
no new Svelte store/context/event bus/registry exists
no new MapWorkspace or generic host framework exists
+page.svelte still owns handleKeydown and the Escape priority chain
+page.svelte still owns activeManagementPanelId and the keyed panel remount
WorldMap still owns its existing world-city inspector
retail-sim.e2e.ts is unchanged unless a demonstrated missing smoke assertion required a minimal addition
```

Run the mechanical dependency-direction check:

```bash
rg "\$routes|src/routes|gameRouteController" src/lib/components/game/MapSurfaceHost.svelte \
  src/lib/components/game/MapInspectorHost.svelte \
  src/lib/components/game/ManagementPanelHost.svelte
```

Expected: no matches.

- [ ] **Step 7: Commit the coverage-comment correction and final cleanup**

```bash
git add vite.config.ts src/routes/+page.svelte \
  src/lib/components/game/MapSurfaceHost.svelte \
  src/lib/components/game/MapInspectorHost.svelte \
  src/lib/components/game/ManagementPanelHost.svelte
git commit -m "chore(ui): document route presentation test boundary"
```

If the final audit required no cleanup to the component/route files, stage only `vite.config.ts`.

---

## Final Review Checklist

Before marking HPA-568 ready for review:

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
- [ ] The PR description lists what moved, what deliberately stayed in the route, and that no new canonical state owner/framework was added.
