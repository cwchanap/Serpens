# Map and Management Presentation Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the existing map surfaces, map inspectors, and control-tower panel composition from `src/routes/+page.svelte` into three concrete presentation hosts while preserving layout, command ownership, keyboard behavior, and player-visible flows.

**Architecture:** `+page.svelte` remains the cross-feature composition root and sole owner of route state, selected IDs, derived snapshots/read models, command handlers, global shortcuts, Escape ordering, and navigation. `MapSurfaceHost`, `MapInspectorHost`, and `ManagementPanelHost` compose existing children only. The already-existing pure `MutationAvailability` type/factory moves from `gameRouteController.ts` to `$lib/scenarios/mutationAvailability.ts` so the management host can reuse the canonical capability bag without importing route code or inventing a duplicate shape.

**Tech Stack:** Svelte 5 runes, TypeScript, Vitest browser mode with `vitest-browser-svelte`, Playwright, Phaser 4, existing Serpens game/i18n/scenario contracts.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-08-map-management-presentation-boundaries-design.md` exactly.
- Extract exactly `MapSurfaceHost.svelte`, `MapInspectorHost.svelte`, and `ManagementPanelHost.svelte`.
- Do not create `MapWorkspace`, a generic panel/inspector registry, a new controller, a Svelte context/store layer, event bus, or second canonical state owner.
- `src/routes/+page.svelte` keeps selections, map snapshots, report/finance derivations, domain command handlers, active management-panel ID, global shortcuts, Escape ordering, and navigation.
- `MapSurfaceHost` replaces only the existing `.map-surfaces` block inside `.map-layout`.
- `MapInspectorHost` must stay inside `.map-layout`; its absolute-positioned overlays depend on that containing block.
- `ManagementPanelHost` must stay outside `.map-layout` where the current fixed control-tower backdrop is mounted.
- Preserve the world-city inspector inside `WorldMap.svelte`.
- Preserve `{#key activeManagementPanel.id}` in `+page.svelte`.
- Move scoped CSS with its moved markup; do not create a shared overlay stylesheet.
- Move inspector `if` / `else if` branches structurally unchanged; do not introduce parallel boolean helpers for rail/building precedence.
- Move `MutationAvailability` and `createMutationAvailability` to `$lib/scenarios/mutationAvailability.ts` unchanged in behavior. Do not leave a compatibility re-export in `gameRouteController.ts`.
- `ManagementPanelHost` accepts the existing `MutationAvailability` bag and maps it to current child props; do not refactor child panel APIs in this ticket.
- `financeMetrics` is `FinanceMetrics | null` at the host boundary. The route call site must not use `financeMetrics!`.
- Do not modify simulation, persistence, save schema, balance, localization copy, or HPA-294 logistics domain behavior.
- Retain `src/routes/retail-sim.e2e.ts` as the route smoke and add only the minimal inspector-topology assertion required by this extraction.

---

## File Map

### Create

- `src/lib/components/game/MapSurfaceHost.svelte`
- `src/lib/components/game/MapSurfaceHost.svelte.spec.ts`
- `src/lib/components/game/MapInspectorHost.svelte`
- `src/lib/components/game/MapInspectorHost.svelte.spec.ts`
- `src/lib/components/game/ManagementPanelHost.svelte`
- `src/lib/components/game/ManagementPanelHost.svelte.spec.ts`
- `src/lib/scenarios/mutationAvailability.ts`

### Modify

- `src/routes/+page.svelte`
- `src/routes/gameRouteController.ts` — delete only the relocated availability interface/factory.
- `src/routes/gameRouteController.spec.ts` — import `createMutationAvailability` from the new library module.
- `src/routes/page.svelte.spec.ts` — import `createMutationAvailability` from the new library module.
- `src/routes/retail-sim.e2e.ts` — add one map-inspector-within-map-layout structural assertion.
- `vite.config.ts` — replace only the stale route-size coverage comment.

### Must remain behaviorally unchanged

- `GameRouteController` class and command/persistence behavior.
- `src/lib/game/**` simulation/persistence/domain contracts.
- existing child map, inspector, panel, scenario, save, and finance behavior.

---

## Task 1: Extract `MapSurfaceHost`

**Files:**
- Create: `src/lib/components/game/MapSurfaceHost.svelte`
- Create: `src/lib/components/game/MapSurfaceHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: current route identifiers `activeMapView`, `visitedMapViews`, `mapSnapshot`, `industryMapSnapshot`, world status/selection values, pause/keyboard booleans, and existing callbacks.
- Produces: the same three mounted map children with unchanged keep-alive, active visibility, pause, keyboard, and callback behavior.

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

- [ ] **Step 1: Create the characterization spec with real child components and local scene mocks**

In `MapSurfaceHost.svelte.spec.ts`, define the same observable scene signals used by the existing child specs:

```ts
const mockCityPause = vi.fn();
const mockIndustryPause = vi.fn();
const mockSetKeyboardEnabled = vi.fn();
const mockCitySetEventHandler = vi.fn();
const mockIndustrySetEventHandler = vi.fn();

vi.mock('$lib/phaser/cityMapScene', () => ({
  CityMapScene: vi.fn().mockImplementation(function () {
    return {
      setEventHandler: mockCitySetEventHandler,
      updateSnapshot: vi.fn()
    };
  })
}));

vi.mock('$lib/phaser/industryMapScene', () => ({
  IndustryMapScene: vi.fn().mockImplementation(function () {
    return {
      setEventHandler: mockIndustrySetEventHandler,
      setKeyboardEnabled: mockSetKeyboardEnabled,
      updateSnapshot: vi.fn()
    };
  })
}));
```

Mock Phaser so the first created game uses `mockCityPause` and the industry game uses `mockIndustryPause`; expose `pause`, `resume`, `destroy`, and `canvas.dataset` exactly as the child specs require. Use actual `WorldMap`, `CityMap`, and `IndustryMap` Svelte components rather than mocking those components.

Add these assertions:

```ts
it('keeps visited map surfaces mounted and exposes only the active surface', async () => {
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

Add a world-city click test that verifies the supplied `onSelectWorldCity` callback.

Add two explicit pass-through tests using the real child side effects:

```ts
it('passes map pause state to the active retail child', async () => {
  render(MapSurfaceHost, surfaceProps({
    activeMapView: 'retail',
    visitedMapViews: { world: false, retail: true, industry: false },
    isMapPaused: true
  }));

  await waitForMock(mockCityPause);
  expect(mockCityPause).toHaveBeenCalled();
});

it('passes rail keyboard availability to the industry child', async () => {
  render(MapSurfaceHost, surfaceProps({
    activeMapView: 'industry',
    visitedMapViews: { world: false, retail: false, industry: true },
    railKeyboardEnabled: false
  }));

  await waitForMock(mockSetKeyboardEnabled);
  expect(mockSetKeyboardEnabled).toHaveBeenLastCalledWith(false);
});
```

`surfaceProps` must return complete real props with small `CityMapSnapshot` / `IndustryMapSnapshot` fixtures, `createI18n('en')`, one valid `WorldCityStatus`, and `vi.fn()` callbacks. Do not introduce shared test infrastructure outside this spec.

- [ ] **Step 2: Run the new spec in its initial RED state**

```bash
bun run test:unit -- src/lib/components/game/MapSurfaceHost.svelte.spec.ts --run
```

Expected: the host module does not exist yet. This RED step is only the extraction wiring scaffold; the characterization assertions are the regression contract.

- [ ] **Step 3: Implement `MapSurfaceHost.svelte` by moving the current map block**

Import `shouldRenderMapView`, `WorldMap`, `CityMap`, and `IndustryMap`. Preserve current route identifiers and child props:

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

Move exactly these scoped styles from the route:

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

- [ ] **Step 4: Cut over only the map surface mount site**

Inside the existing `<section class="map-layout">`, replace only `<div class="map-surfaces">...</div>` with `<MapSurfaceHost ... />`. Keep `TopBar`, scenario status, `ControlDesk`, placement/finance/build/advisor overlays, and inspectors in their existing route positions.

Remove direct `WorldMap`, `CityMap`, and `IndustryMap` imports from the route.

- [ ] **Step 5: Verify and commit Task 1**

```bash
bun run test:unit -- src/lib/components/game/MapSurfaceHost.svelte.spec.ts --run
bun run check
git add src/lib/components/game/MapSurfaceHost.svelte src/lib/components/game/MapSurfaceHost.svelte.spec.ts src/routes/+page.svelte
git commit -m "refactor(ui): extract map surface host"
```

Expected: focused component spec and `bun run check` pass.

---

## Task 2: Extract `MapInspectorHost` without changing its containing block

**Files:**
- Create: `src/lib/components/game/MapInspectorHost.svelte`
- Create: `src/lib/components/game/MapInspectorHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

**Interfaces:**
- Consumes: concrete selected objects already derived by the route, existing visibility flags, mutation booleans, and existing callbacks.
- Produces: the same three inspector branches with the same truthiness and rail-before-building precedence.

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

Create `MapInspectorHost.svelte.spec.ts` with `createNewGame('convenience', 20260808)` and small concrete tile/building/rail fixtures.

Lock the current branch precedence directly:

```ts
it('renders rail details instead of industry building details when rail segments are selected', async () => {
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

Also cover:

```text
retail selected + visible -> TileInspector is present
retail Open Details -> onOpenStoreDetails called once
retail Close -> onCloseRetailInspector called once
industry selected + no rail selection -> IndustryTileInspector is present
disabled upgrade capability -> existing child upgrade control stays disabled
```

- [ ] **Step 2: Run the initial RED state**

```bash
bun run test:unit -- src/lib/components/game/MapInspectorHost.svelte.spec.ts --run
```

Expected: host module does not exist yet.

- [ ] **Step 3: Implement the host by moving the route branches verbatim**

Do not create intermediate `showRail` or `showIndustryBuilding` variables. Preserve the current template structure:

```svelte
{#if selectedRetailTile && showRetailInspector}
  <div
    class="inspector-overlay paper"
    role="dialog"
    aria-modal="false"
    aria-label={i18n.t('route.inspectors.retailDetails')}
  >
    <TileInspector
      {game}
      tile={selectedRetailTile}
      store={selectedStore}
      latestStoreReport={latestStoreReport}
      {i18n}
      onUpgradeStore={onUpgradeStore}
      {canUpgradeStore}
      {disabledReason}
      onOpenDetails={onOpenStoreDetails}
      onClickFeedback={onRetailClickFeedback}
      onClose={onCloseRetailInspector}
    />
  </div>
{/if}

{#if selectedRailSegments && showIndustryInspector}
  <div
    class="inspector-overlay paper"
    role="dialog"
    aria-modal="false"
    aria-label={i18n.t('railSegmentInspector.title')}
  >
    <RailSegmentInspector
      {game}
      cityId={industryCityId}
      segments={selectedRailSegments}
      allSegments={allIndustryRailSegments}
      {i18n}
      onClose={onCloseIndustryInspector}
      onUpgradeSegment={onUpgradeRailSegment}
      onDemolishSegment={onDemolishRailSegment}
      {canUpgradeRail}
      {canDemolishRail}
      {disabledReason}
    />
  </div>
{:else if selectedIndustryTile && showIndustryInspector}
  <div
    class="inspector-overlay paper"
    role="dialog"
    aria-modal="false"
    aria-label={i18n.t('route.inspectors.industryDetails')}
  >
    <IndustryTileInspector
      {game}
      tile={selectedIndustryTile}
      building={selectedIndustryBuilding}
      {i18n}
      onUpgradeBuilding={onUpgradeIndustryBuilding}
      canUpgradeBuilding={canUpgradeIndustryBuilding}
      {disabledReason}
      onClose={onCloseIndustryInspector}
    />
  </div>
{/if}
```

Move the existing `.inspector-overlay` base style plus both existing responsive rules into the host without changing dimensions or breakpoints.

- [ ] **Step 4: Mount `MapInspectorHost` in the exact current layout position**

Inside `<section class="map-layout">`, keep the order:

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

`MapInspectorHost` must be the last presentation child before `</section>` and must remain inside `.map-layout`.

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

Keep `StoreDetailModal` outside `.map-layout` as it is today.

- [ ] **Step 5: Add one route E2E topology assertion**

In the existing retail inspector flow in `src/routes/retail-sim.e2e.ts`, after the inspector becomes visible, add:

```ts
const mapLayout = page.locator('.map-layout');
const inspector = mapLayout.locator('.inspector-overlay');
await expect(inspector).toBeVisible();
await expect(inspector).toHaveCount(1);
```

This asserts the inspector is still a descendant of `.map-layout`; do not create a separate E2E test file.

- [ ] **Step 6: Verify and commit Task 2**

```bash
bun run test:unit -- src/lib/components/game/MapInspectorHost.svelte.spec.ts --run
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts
git add src/lib/components/game/MapInspectorHost.svelte src/lib/components/game/MapInspectorHost.svelte.spec.ts src/routes/+page.svelte src/routes/retail-sim.e2e.ts
git commit -m "refactor(ui): extract map inspector host"
```

Expected: focused component spec, type check, and selected route E2E pass.

---

## Task 3: Relocate mutation availability and extract `ManagementPanelHost`

**Files:**
- Create: `src/lib/scenarios/mutationAvailability.ts`
- Create: `src/lib/components/game/ManagementPanelHost.svelte`
- Create: `src/lib/components/game/ManagementPanelHost.svelte.spec.ts`
- Modify: `src/routes/gameRouteController.ts`
- Modify: `src/routes/gameRouteController.spec.ts`
- Modify: `src/routes/page.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Produces one canonical `MutationAvailability` library type/factory reused by route and management presentation.
- `ManagementPanelHost` consumes that bag plus current panel data/callbacks.
- `financeMetrics` is explicitly nullable and is required only in the finance branch.

- [ ] **Step 1: Move the existing availability contract unchanged**

Create `src/lib/scenarios/mutationAvailability.ts` with the existing interface and factory:

```ts
import type { ScenarioCommand, ScenarioDefinition } from './types';

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

export function createMutationAvailability(input: {
  playMode: 'sandbox' | 'scenario';
  pending: boolean;
  definition: ScenarioDefinition | null;
}): MutationAvailability {
  const available = (kind: ScenarioCommand['kind']) =>
    input.playMode === 'sandbox' ||
    (!input.pending &&
      input.definition !== null &&
      input.definition.allowedCommands.includes(kind));

  return {
    pending: input.playMode === 'scenario' && input.pending,
    advanceDay: available('advanceDay'),
    resolveDecision: available('resolveDecision'),
    updatePolicy: available('updatePolicy'),
    openWorldCity: available('openWorldCity'),
    setRetailSupplySource: available('setRetailSupplySource'),
    openStore: available('openStore'),
    upgradeStore: available('upgradeStore'),
    hireStaff: available('hireStaff'),
    assignStaff: available('assignStaff'),
    unassignStaff: available('unassignStaff'),
    promoteStaff: available('promoteStaff'),
    updateStoreSellingPrice: available('updateStoreSellingPrice'),
    updateStoreInventoryTargets: available('updateStoreInventoryTargets'),
    buildIndustrialBuilding: available('buildIndustrialBuilding'),
    upgradeIndustrialBuilding: available('upgradeIndustrialBuilding'),
    buildRail: available('buildRail'),
    upgradeRail: available('upgradeRail'),
    demolishRail: available('demolishRail'),
    borrow: available('borrow'),
    repayLoan: available('repayLoan'),
    payOffLoan: available('payOffLoan'),
    refinanceLoan: available('refinanceLoan'),
    financeWorldCity: available('financeWorldCity'),
    financeRetailStore: available('financeRetailStore'),
    financeIndustrialBuilding: available('financeIndustrialBuilding')
  };
}
```

Delete only the interface/factory from `gameRouteController.ts`. Do not re-export them there.

Update imports in `+page.svelte`, `page.svelte.spec.ts`, and `gameRouteController.spec.ts` to `$lib/scenarios/mutationAvailability`.

- [ ] **Step 2: Run existing availability/controller tests immediately after the move**

```bash
bun run test:unit -- src/routes/page.svelte.spec.ts src/routes/gameRouteController.spec.ts --run
bun run check
```

Expected: PASS with unchanged assertions and no behavioral changes.

- [ ] **Step 3: Write the failing `ManagementPanelHost` spec**

Use:

```ts
const panelGame = createNewGame('convenience', 20260808);
const summary = summarizeReports(panelGame.reports);
const financeMetrics = getFinanceMetrics(panelGame);
const mutations = createMutationAvailability({
  playMode: 'sandbox',
  pending: false,
  definition: null
});
```

Add these composition tests:

```ts
it('renders the selected panel in the control-tower shell and closes from the backdrop', async () => {
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

Also assert:

```text
stores panel -> RetailSupplySources and StoreOverview both render
decisions panel -> DecisionQueue and ActiveModifiers both render
finance panel + focusedFinanceLoanId -> dialog data-focused-finance-loan matches
finance panel + financeMetrics -> FinancePanel renders
policy/staff/decision controls receive the corresponding fields from mutations
```

- [ ] **Step 4: Run the host spec in its initial RED state**

```bash
bun run test:unit -- src/lib/components/game/ManagementPanelHost.svelte.spec.ts --run
```

Expected: host module does not exist yet.

- [ ] **Step 5: Implement `ManagementPanelHost.svelte` using the canonical mutation bag**

Use this core prop shape:

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

Keep child APIs unchanged. Examples:

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

For finance metrics, add a programmer invariant helper:

```ts
function requireFinanceMetrics(): FinanceMetrics {
  if (financeMetrics === null) {
    throw new Error('ManagementPanelHost invariant: financeMetrics required for finance panel');
  }
  return financeMetrics;
}
```

Use `metrics={requireFinanceMetrics()}` only inside the `panelId === 'finance'` branch. Do not compute finance metrics inside the host.

Move the current control-tower shell and concrete panel switch, not a dynamic registry. Preserve `aria-modal="true"`, `focusTrap`, localized labels, `data-focused-finance-loan`, and all current child callbacks.

Move these scoped styles from the route:

```text
.tower-backdrop
.tower-backdrop-button
.control-tower-overlay
.stores-surfaces
.decisions-surfaces
.tower-header
.tower-actions
.close-tower
control-tower h2 styling
.ticker
management-specific compact responsive rules
```

Before deleting route `.ticker`, search the route and confirm no route-local `.ticker` elements remain.

- [ ] **Step 6: Cut over the route while keeping the keyed remount and nullable finance contract**

Keep the route block:

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

Keep `activeManagementPanelId`, menu configuration, `openManagementPanel`, `closeManagementPanel`, `handleKeydown`, Escape ordering, `isMapPaused`, and `railKeyboardEnabled` in `+page.svelte`.

- [ ] **Step 7: Verify and commit Task 3**

```bash
bun run test:unit -- src/lib/components/game/ManagementPanelHost.svelte.spec.ts src/routes/page.svelte.spec.ts src/routes/gameRouteController.spec.ts --run
bun run check
git add src/lib/scenarios/mutationAvailability.ts src/lib/components/game/ManagementPanelHost.svelte src/lib/components/game/ManagementPanelHost.svelte.spec.ts src/routes/gameRouteController.ts src/routes/gameRouteController.spec.ts src/routes/page.svelte.spec.ts src/routes/+page.svelte
git commit -m "refactor(ui): extract management panel host"
```

Expected: focused host plus existing route/controller specs and `bun run check` pass.

---

## Task 4: Correct coverage documentation and run full regression/audit gates

**Files:**
- Modify: `vite.config.ts`
- Verify: every file changed in Tasks 1–3

**Interfaces:**
- Produces: accurate coverage documentation and evidence that HPA-568 remained a presentation-boundary refactor.

- [ ] **Step 1: Replace only the stale route-size comment in `vite.config.ts`**

Use:

```ts
// +page.svelte is the route-level orchestration/composition root and is
// exercised end-to-end by retail-sim.e2e.ts. Extracted presentation hosts in
// src/lib/components/game have browser component specs, so excluding the route
// keeps unit coverage focused without using route line count as an architecture target.
'src/routes/+page.svelte',
```

Do not change provider, include/exclude behavior, thresholds, or other config.

- [ ] **Step 2: Run all new browser component specs together**

```bash
bun run test:unit -- src/lib/components/game/MapSurfaceHost.svelte.spec.ts src/lib/components/game/MapInspectorHost.svelte.spec.ts src/lib/components/game/ManagementPanelHost.svelte.spec.ts --run
```

Expected: PASS.

- [ ] **Step 3: Run static checks**

```bash
bun run check
bun run lint
```

Expected: `svelte-check` reports 0 errors and 0 warnings; lint exits 0.

- [ ] **Step 4: Run the repository-supported selected route smoke**

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: all selected route tests pass using the configured build/preview web server.

- [ ] **Step 5: Run the full suite**

```bash
bun run test
```

Expected: all unit/component and Playwright tests pass.

- [ ] **Step 6: Run the architecture and mount-topology audit**

Check the branch diff and confirm:

```text
MapSurfaceHost is inside .map-layout and replaces only .map-surfaces
MapInspectorHost is inside .map-layout after route-level map overlays
ManagementPanelHost is outside .map-layout
WorldMap still owns the world-city inspector
+page.svelte still owns handleKeydown, Escape ordering, activeManagementPanelId, isMapPaused, and railKeyboardEnabled
MutationAvailability has exactly one production definition in $lib/scenarios/mutationAvailability.ts
gameRouteController.ts contains no MutationAvailability definition or compatibility re-export
no $lib component imports src/routes or gameRouteController
financeMetrics is passed without a route-side non-null assertion
inspector branches retain selectedRetailTile truthiness and selectedRailSegments if/else-if precedence
no generic MapWorkspace/registry/context/store/event-bus abstraction was introduced
src/lib/game simulation/persistence files are unchanged
```

Run mechanical checks:

```bash
rg "src/routes|gameRouteController" src/lib/components/game/MapSurfaceHost.svelte src/lib/components/game/MapInspectorHost.svelte src/lib/components/game/ManagementPanelHost.svelte
rg "interface MutationAvailability|function createMutationAvailability" src
rg "financeMetrics!" src/routes/+page.svelte
rg "class=\"ticker\"" src/routes/+page.svelte
```

Expected:

```text
first command: no matches
second command: matches only src/lib/scenarios/mutationAvailability.ts
third command: no matches
fourth command: no route-local ticker markup after management extraction
```

- [ ] **Step 7: Commit the coverage-comment correction and formatting-only cleanup**

If only `vite.config.ts` changed during Task 4:

```bash
git add vite.config.ts
git commit -m "chore(ui): document route presentation test boundary"
```

If Prettier changed one of the already-touched host/route files, stage only those formatting changes with `vite.config.ts` under the same commit.

---

## Final Review Checklist

- [ ] Exactly three presentation hosts were added.
- [ ] `MapSurfaceHost` owns only map composition/layout CSS.
- [ ] `MapInspectorHost` owns only retail/rail/industry inspector composition/overlay CSS and remains inside `.map-layout`.
- [ ] `ManagementPanelHost` owns only the control-tower shell/current panel switch and remains outside `.map-layout`.
- [ ] `+page.svelte` still owns route/controller state, selections, handlers, navigation, shortcuts, Escape order, map pause, and rail-keyboard derivations.
- [ ] `MutationAvailability` and `createMutationAvailability` moved to `$lib/scenarios` with no compatibility re-export or duplicate shape.
- [ ] Child panels still receive their existing explicit booleans/callbacks from the management host.
- [ ] `financeMetrics` is nullable at the host boundary and no `financeMetrics!` remains at the route call site.
- [ ] Inspector branches were moved structurally unchanged.
- [ ] World-city inspection remains inside `WorldMap`.
- [ ] Route E2E proves `.inspector-overlay` remains under `.map-layout`.
- [ ] No generic registry/workspace/context/store abstraction was added.
- [ ] `vite.config.ts` describes the testing boundary without a line-count target.
- [ ] Focused component specs pass.
- [ ] Existing availability/controller specs pass after the module move.
- [ ] `bun run check` passes.
- [ ] `bun run lint` passes.
- [ ] `bun run test:e2e -- src/routes/retail-sim.e2e.ts` passes.
- [ ] `bun run test` passes.
- [ ] The implementation PR description states what moved, what remains route-owned for HPA-574, and that no new framework or canonical state owner was introduced.
