# Gameplay HUD and Management Panel Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implement every task in the single HPA-304 PR.

**Goal:** Ship the approved art-forward Serpens gameplay HUD, map inspector treatment, and parchment management workspace without changing game-domain behavior or introducing a new UI/state framework.

**Architecture:** Keep `+page.svelte` as the route composition/shortcut/command owner, `GameRouteController` as the command/persistence coordinator, the HPA-568 route-local hosts as the presentation boundaries, and Phaser as the map renderer. Add one small typed inline-SVG icon primitive and one shared management-menu item type. Remove the route-level management `{#key}` so the workspace shell remains mounted while only its body changes.

**Tech Stack:** Svelte 5.55 runes, TypeScript 6, SvelteKit 2.57, Vitest 4 browser mode, Playwright 1.59, Phaser 4.1, existing Serpens i18n and parchment/brass CSS tokens.

**Spec:** `docs/superpowers/specs/2026-09-01-gameplay-ui-revamp-design.md`

## Global Constraints

- One HPA-304 implementation PR only; task commits are checkpoints inside that PR.
- `GameState` remains authoritative domain state.
- `GameRouteController` remains the route command/persistence coordinator.
- `+page.svelte` keeps active map view, active management panel, selections, command handlers, global shortcuts, and Escape priority.
- Reuse `MapSurfaceHost.svelte`, `MapInspectorHost.svelte`, and `ManagementPanelHost.svelte`; do not add `MapWorkspace` or a replacement host framework.
- Do not add Svelte context/global state, an event bus, generic modal/panel/inspector registry, second controller, or design-system package.
- Do not modify simulation rules, persistence/save schema, scenario semantics, game-domain types, or Phaser snapshots for presentation convenience.
- Do not add historical cash/trend/analytics data solely to imitate decorative mock values.
- Reuse existing i18n labels before adding translation keys.
- Reuse `.btn-icon` as the circular brass medallion and `.seal` as the wax-red badge/attention pill.
- Preserve existing keyboard shortcuts and route-owned Escape ordering.
- Preserve `route.mapEyebrow.retail`, `route.mapEyebrow.industry`, and `route.mapEyebrow.world` as the map button accessible labels.
- Keep `1×`, `2×`, and `5×` as numeric text controls; do not add speed icons.
- Treat 1920×1080 as reference parity and 1280×800 as the desktop regression target.
- Add real compact evidence at 414×800 for management access and 760×800 for map/inspector clearance.
- Update route E2E helpers in the same task that invalidates their old UI assumptions.
- Run `retail-sim.e2e.ts` after every route-visible cutover.

---

## File Map

### Create

- `src/lib/components/game/gameIcon.ts`
- `src/lib/components/game/GameIcon.svelte`
- `src/lib/components/game/GameIcon.svelte.spec.ts`

### Modify

- `src/routes/+page.svelte`
- `src/routes/MapInspectorHost.svelte`
- `src/routes/ManagementPanelHost.svelte`
- `src/routes/ManagementPanelHost.svelte.spec.ts`
- `src/routes/retail-sim.e2e.ts`
- `src/lib/components/game/TopBar.svelte`
- `src/lib/components/game/TopBar.svelte.spec.ts`
- `src/lib/components/game/GameMenu.svelte`
- `src/lib/components/game/GameMenu.svelte.spec.ts`
- `src/lib/components/game/ControlDesk.svelte`
- `src/lib/components/game/ControlDesk.svelte.spec.ts`
- `src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts`
- `src/lib/components/game/TileInspector.svelte`
- `src/lib/components/game/TileInspector.svelte.spec.ts`
- `src/lib/components/game/IndustryTileInspector.svelte`
- `src/lib/components/game/IndustryTileInspector.svelte.spec.ts`
- `src/lib/components/game/RailSegmentInspector.svelte`
- `src/lib/components/game/RailSegmentInspector.svelte.spec.ts`
- `src/lib/components/game/LogisticsRouteInspector.svelte`
- `src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts`
- `src/lib/components/game/Scorecard.svelte`
- `src/lib/components/game/Scorecard.svelte.spec.ts`
- `src/lib/styles/frames.css`

### Must remain behaviorally unchanged

- `src/routes/gameRouteController.ts`
- `src/lib/game/**`
- `src/lib/persistence/**`
- Phaser scene/snapshot logic under `src/lib/phaser/**` and `src/lib/game/*MapRender.ts`
- scenario lifecycle and save semantics

---

## Task 1: Add one icon vocabulary and one management item type

**Files:**
- Create: `src/lib/components/game/gameIcon.ts`
- Create: `src/lib/components/game/GameIcon.svelte`
- Create: `src/lib/components/game/GameIcon.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/components/game/ControlDesk.svelte`
- Modify: `src/lib/components/game/ControlDesk.svelte.spec.ts`

**Produces:**

```ts
export type GameIconName =
  | 'build'
  | 'dashboard'
  | 'policies'
  | 'staff'
  | 'stores'
  | 'decisions'
  | 'reports'
  | 'productChains'
  | 'finance'
  | 'logistics'
  | 'retail'
  | 'industry'
  | 'world'
  | 'rail'
  | 'pause'
  | 'resume'
  | 'shortcuts'
  | 'alerts'
  | 'menu'
  | 'day'
  | 'cash'
  | 'close';

export interface ManagementPanelMenuItem {
  id: ManagementPanelId;
  label: string;
  shortcut: string;
  icon: GameIconName;
}
```

- [ ] **Step 1: Write the failing icon contract test**

Create `src/lib/components/game/GameIcon.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GameIcon from './GameIcon.svelte';

for (const name of ['dashboard', 'retail', 'pause', 'alerts', 'cash', 'close'] as const) {
  it(`renders ${name} as decorative SVG`, async () => {
    render(GameIcon, { name });
    const icon = page.locator(`svg[data-icon="${name}"]`);
    await expect.element(icon).toBeInTheDocument();
    await expect.element(icon).toHaveAttribute('aria-hidden', 'true');
  });
}
```

Run:

```bash
bun run test:unit -- src/lib/components/game/GameIcon.svelte.spec.ts --run
```

Expected: FAIL because `GameIcon.svelte` does not exist.

- [ ] **Step 2: Implement `gameIcon.ts` and `GameIcon.svelte`**

`gameIcon.ts` imports `ManagementPanelId` from `$lib/game/keyboardShortcuts` and exports the exact union/interface above.

`GameIcon.svelte` accepts `{ name: GameIconName }`, renders one inline `<svg viewBox="0 0 24 24" aria-hidden="true" data-icon={name}>`, and uses explicit Svelte branches for the closed union. Keep paths local/static. Do not add dynamic imports, icon classes/registries, external SVG assets, or a package.

- [ ] **Step 3: Type the existing route management config once**

Delete the route-local `ManagementPanelMenuItem` interface. Type the existing config as:

```ts
const managementPanelMenuConfig: Array<Omit<ManagementPanelMenuItem, 'label'>> = [
  { id: 'dashboard', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.dashboard, icon: 'dashboard' },
  { id: 'policies', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.policies, icon: 'policies' },
  { id: 'staff', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.staff, icon: 'staff' },
  { id: 'stores', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.stores, icon: 'stores' },
  { id: 'decisions', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.decisions, icon: 'decisions' },
  { id: 'reports', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.reports, icon: 'reports' },
  {
    id: 'productChains',
    shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.productChains,
    icon: 'productChains'
  },
  { id: 'finance', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.finance, icon: 'finance' },
  { id: 'logistics', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.logistics, icon: 'logistics' }
];
```

Keep the localized derived list:

```ts
let managementPanelMenuItems = $derived.by<ManagementPanelMenuItem[]>(() =>
  managementPanelMenuConfig.map((item) => ({
    ...item,
    label: i18n.labels.managementPanel(item.id)
  }))
);
```

- [ ] **Step 4: Make `ControlDesk` consume the shared type**

Delete its local `ManagementItem`. Import `ManagementPanelMenuItem` from `./gameIcon` and change only the current property to:

```ts
managementItems: ManagementPanelMenuItem[];
```

Every current destination has a shortcut, so remove the optional-shortcut rendering branch and the test that exists solely for a shortcut-less item. Update all fixtures with `icon` fields.

- [ ] **Step 5: Verify Task 1**

Run:

```bash
bun run test:unit -- \
  src/lib/components/game/GameIcon.svelte.spec.ts \
  src/lib/components/game/ControlDesk.svelte.spec.ts \
  --run
bun run check
```

Expected: PASS.

- [ ] **Step 6: Commit Task 1**

```bash
git add \
  src/lib/components/game/gameIcon.ts \
  src/lib/components/game/GameIcon.svelte \
  src/lib/components/game/GameIcon.svelte.spec.ts \
  src/lib/components/game/ControlDesk.svelte \
  src/lib/components/game/ControlDesk.svelte.spec.ts \
  src/routes/+page.svelte
git commit -m "feat(ui): add shared game navigation metadata"
```

---

## Task 2: Replace the footer with the gameplay rail and migrate the clearance E2E contract

**Files:**
- Modify: `src/lib/components/game/ControlDesk.svelte`
- Modify: `src/lib/components/game/ControlDesk.svelte.spec.ts`
- Modify: `src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts`
- Modify: `src/lib/styles/frames.css`
- Modify: `src/routes/retail-sim.e2e.ts`

**Consumes:** `GameIcon`, `ManagementPanelMenuItem` from Task 1.  
**Preserves:** `onBuild`, `onOpenManagement`, `onToggleRailBuild`, `onTogglePause`, `onSelectSpeed`, `onOpenShortcuts`.

- [ ] **Step 1: Write failing desktop/compact rail expectations**

Update the desktop fixture to expect icon navigation and hotkey titles:

```ts
const dashboard = page.getByRole('button', { name: /^dashboard$/i });
await expect.element(dashboard).toBeVisible();
await expect.element(dashboard).toHaveAttribute('title', 'Dashboard (O)');
await expect.element(page.locator('svg[data-icon="dashboard"]')).toBeVisible();
```

Keep existing callback/disabled/rail-build assertions.

Add a real compact test:

```ts
it('keeps management destinations reachable in the compact dock', async () => {
  await page.viewport(414, 800);
  render(ControlDesk, baseProps());

  await expect.element(page.getByRole('button', { name: /^dashboard$/i })).toBeVisible();
  await expect.element(page.getByRole('button', { name: /^policies$/i })).toBeVisible();
  await expect.element(page.getByRole('button', { name: /^finance$/i })).toBeVisible();
});
```

Run:

```bash
bun run test:unit -- \
  src/lib/components/game/ControlDesk.svelte.spec.ts \
  src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts \
  --run
```

Expected: FAIL on the new visual/compact contract.

- [ ] **Step 2: Reuse `.btn-icon`; add one primary modifier and one compact-height variable**

Add to `frames.css` after `.btn-icon`:

```css
.btn-icon-primary {
  color: var(--paper-50);
  background-color: var(--moss);
  border-color: var(--ink-900);
  box-shadow:
    inset 0 0 0 1px var(--moss-2),
    var(--shadow-paper);
}

.btn-icon-primary:hover,
.btn-icon-primary:focus-visible {
  background-color: var(--moss-2);
}

:root {
  --control-desk-compact-height: 5.75rem;
}
```

Do not change `.seal`.

- [ ] **Step 3: Implement the desktop left rail**

Change `.control-desk` from a full-width bottom footer into a fixed left rail below the top HUD.

Use `GameIcon` for Build, Rail Build, management destinations, Pause/Resume, and shortcut help. Keep speed buttons as text `1×`, `2×`, `5×`.

Each management button uses:

```svelte
aria-label={item.label}
title={`${item.label} (${item.shortcut})`}
```

Build uses `.btn-icon.btn-icon-primary`. Management and utility actions use `.btn-icon`. Do not add local active-panel state.

- [ ] **Step 4: Implement the compact bottom dock without hiding management**

Remove the current `@media (max-width: 980px) { .manage { display: none; } }` rule.

At `max-width: 980px`, place the same action set in a horizontally scrollable fixed bottom dock. Set its occupied/minimum block size from `var(--control-desk-compact-height)`. Keep safe-area padding inside that height contract.

- [ ] **Step 5: Replace the old footer-specific E2E helper before running E2E**

Rename `expectActionAboveControlDesk` to `expectActionDoesNotOverlapControlDesk` and use rectangle separation:

```ts
async function expectActionDoesNotOverlapControlDesk(
  page: Page,
  action: Locator
): Promise<void> {
  await action.scrollIntoViewIfNeeded();
  const [actionBox, controlDeskBox] = await Promise.all([
    action.boundingBox(),
    page.getByLabel('Control desk').boundingBox()
  ]);

  if (!actionBox || !controlDeskBox) {
    throw new Error('Inspector action or control desk has no bounding box');
  }

  const actionRight = actionBox.x + actionBox.width;
  const actionBottom = actionBox.y + actionBox.height;
  const deskRight = controlDeskBox.x + controlDeskBox.width;
  const deskBottom = controlDeskBox.y + controlDeskBox.height;

  expect(
    actionRight <= controlDeskBox.x ||
      actionBox.x >= deskRight ||
      actionBottom <= controlDeskBox.y ||
      actionBox.y >= deskBottom
  ).toBe(true);
}
```

Update every existing call site.

Rename the current test to:

```text
inspector clearance keeps route, retail, and industry actions clear of the gameplay controls
```

Keep its 1000×800 viewport and its `9` management-button count. It now proves rail clearance rather than footer wrapping.

- [ ] **Step 6: Verify Task 2**

Run:

```bash
bun run test:unit -- \
  src/lib/components/game/ControlDesk.svelte.spec.ts \
  src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts \
  --run
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add \
  src/lib/components/game/ControlDesk.svelte \
  src/lib/components/game/ControlDesk.svelte.spec.ts \
  src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts \
  src/lib/styles/frames.css \
  src/routes/retail-sim.e2e.ts
git commit -m "feat(ui): revamp gameplay control rail"
```

---

## Task 3: Move map switching into `TopBar` and migrate menu-owned E2E helpers

**Files:**
- Modify: `src/lib/components/game/TopBar.svelte`
- Modify: `src/lib/components/game/TopBar.svelte.spec.ts`
- Modify: `src/lib/components/game/GameMenu.svelte`
- Modify: `src/lib/components/game/GameMenu.svelte.spec.ts`
- Modify: `src/routes/retail-sim.e2e.ts`

**Preserves in `TopBar`:** `activeMapView`, `onSelectView`, alerts, day, cash, locale/menu wiring.  
**Removes from `GameMenu`:** `activeMapView`, `onSelectView`, map-view list/markup/CSS.

- [ ] **Step 1: Write failing direct-map tests using current accessible names**

Add to `TopBar.svelte.spec.ts`:

```ts
it('switches map views directly from the top HUD', async () => {
  const onSelectView = vi.fn();
  render(TopBar, {
    ...baseProps(),
    activeMapView: 'retail',
    onSelectView
  });

  const retail = page.getByRole('button', { name: /retail city map/i });
  const industry = page.getByRole('button', { name: /industry city map/i });
  const world = page.getByRole('button', { name: /world map/i });

  await expect.element(retail).toHaveAttribute('aria-pressed', 'true');
  await expect.element(industry).toHaveAttribute('aria-pressed', 'false');
  await expect.element(world).toBeVisible();

  await industry.click();
  expect(onSelectView).toHaveBeenCalledWith('industry');
});
```

Run:

```bash
bun run test:unit -- src/lib/components/game/TopBar.svelte.spec.ts --run
```

Expected: FAIL because map controls are still inside `GameMenu`.

- [ ] **Step 2: Change `GameMenu` tests to the new ownership contract**

Update `GameMenu.svelte.spec.ts` so an open menu still exposes language selection and route-provided menu content, but contains no buttons named `Retail City Map`, `Industry City Map`, or `World Map`.

Run:

```bash
bun run test:unit -- src/lib/components/game/GameMenu.svelte.spec.ts --run
```

Expected: FAIL until the map section is removed.

- [ ] **Step 3: Implement direct map buttons in `TopBar`**

Create the three entries with exact current route labels:

```ts
const mapViews = [
  { id: 'retail', icon: 'retail', label: i18n.t('route.mapEyebrow.retail') },
  { id: 'industry', icon: 'industry', label: i18n.t('route.mapEyebrow.industry') },
  { id: 'world', icon: 'world', label: i18n.t('route.mapEyebrow.world') }
] as const;
```

Each button uses `.btn-icon`, `aria-label={view.label}`, `aria-pressed={activeMapView === view.id}`, and `onclick={() => onSelectView(view.id)}`.

Use `GameIcon` for each map control, Day, Cash, and Alerts. Day/Cash icons are decorative only; keep existing values/formatters.

- [ ] **Step 4: Remove map switching from `GameMenu` and reuse `GameIcon`**

Delete `MapViewId`, the map props/list/select function, the view-tab markup, and view-tab CSS. Keep locale selection, `menuContent`, focus trap, outside click, and Escape behavior.

Replace the existing hamburger SVG with:

```svelte
<GameIcon name="menu" />
```

Update the `GameMenu` mount in `TopBar` to its reduced prop contract.

- [ ] **Step 5: Replace the route map-selection helper in the same task**

Replace `openMapMenuItem` with:

```ts
async function selectMapView(page: Page, itemName: RegExp): Promise<void> {
  await page.getByRole('button', { name: itemName }).click();
}
```

Rename all current call sites to `selectMapView` and remove comments that say map tabs live in the menu.

- [ ] **Step 6: Rewrite menu/Escape assertions so they do not depend on map-button presence**

After the `2` shortcut, assert:

```ts
await expect(page.getByRole('button', { name: /industry city map/i })).toHaveAttribute(
  'aria-pressed',
  'true'
);
```

For the “Escape toggles hamburger” test, use:

```ts
const menu = page.getByRole('button', { name: /^menu$/i });
await expect(menu).toHaveAttribute('aria-expanded', 'false');

await page.keyboard.press('Escape');
await expect(menu).toHaveAttribute('aria-expanded', 'true');
await expect(page.getByRole('dialog', { name: /^menu$/i })).toBeVisible();

await page.keyboard.press('Escape');
await expect(menu).toHaveAttribute('aria-expanded', 'false');
await expect(page.getByRole('dialog', { name: /^menu$/i })).toHaveCount(0);
```

Change the logistics-navigation setup that currently clicks World inside the menu dialog to:

```ts
await selectMapView(page, /world map/i);
```

- [ ] **Step 7: Verify Task 3**

Run:

```bash
bun run test:unit -- \
  src/lib/components/game/TopBar.svelte.spec.ts \
  src/lib/components/game/GameMenu.svelte.spec.ts \
  --run
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add \
  src/lib/components/game/TopBar.svelte \
  src/lib/components/game/TopBar.svelte.spec.ts \
  src/lib/components/game/GameMenu.svelte \
  src/lib/components/game/GameMenu.svelte.spec.ts \
  src/routes/retail-sim.e2e.ts
git commit -m "feat(ui): move map navigation into top hud"
```

---

## Task 4: Recompose inspectors and tie compact clearance to the dock

**Files:**
- Modify: `src/lib/components/game/TileInspector.svelte`
- Modify: `src/lib/components/game/TileInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/IndustryTileInspector.svelte`
- Modify: `src/lib/components/game/IndustryTileInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/RailSegmentInspector.svelte`
- Modify: `src/lib/components/game/RailSegmentInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/LogisticsRouteInspector.svelte`
- Modify: `src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts`
- Modify: `src/routes/MapInspectorHost.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

**Preserves:** all current inspector props/callbacks and current selected-object ownership.

- [ ] **Step 1: Run and strengthen retail inspector characterization**

Ensure `TileInspector.svelte.spec.ts` asserts the existing store art, revenue, stock health, staff morale, Upgrade, Details, attention, disabled behavior, and callbacks.

Use these core assertions:

```ts
await expect.element(page.getByTestId(`store-art-${store.archetypeId}`)).toBeVisible();
await expect.element(page.getByText(/revenue per day/i)).toBeVisible();
await expect.element(page.getByText(/stock health/i)).toBeVisible();
await expect.element(page.getByText(/staff morale/i)).toBeVisible();
await expect.element(page.getByRole('button', { name: /upgrade/i })).toBeVisible();
await expect.element(page.getByRole('button', { name: /open details/i })).toBeVisible();
```

Run:

```bash
bun run test:unit -- src/lib/components/game/TileInspector.svelte.spec.ts --run
```

Expected: PASS before restyling.

- [ ] **Step 2: Recompose the retail inspector using existing data only**

Make the existing store art visually primary. Follow with store identity/location, three vitals, attention, level/next benefit, then Upgrade + Details. Keep empty-tile demand/rent/foot-traffic/customer-fit behavior.

No new read model, stock projection, history, or local business rule.

- [ ] **Step 3: Normalize industry/rail/logistics inspector shells**

Apply the same paper/header/action hierarchy to all three existing inspectors. Use `GameIcon name="close"` when their close button becomes icon-only. Preserve every existing domain-specific section, button callback, disabled rule, and accessible dialog name.

Do not extract a generic inspector component.

- [ ] **Step 4: Remove desktop footer-wrap offsets from `MapInspectorHost`**

Delete:

```css
bottom: 8.5rem;
```

and delete the 981–1023px override that sets `bottom: 11.5rem`.

Keep desktop inspector placement at the right side with ordinary top/right/bottom edge spacing.

- [ ] **Step 5: Make compact inspector clearance use the dock height variable**

Replace the compact hardcoded `5rem` bottom inset with:

```css
@media (max-width: 980px) {
  .inspector-overlay {
    position: fixed;
    inset: auto 0 calc(var(--control-desk-compact-height) + 0.5rem) 0;
    width: auto;
    max-height: 60dvh;
  }
}
```

Do not duplicate the `5.75rem` dock height in `MapInspectorHost`.

- [ ] **Step 6: Add compact route evidence using the Task 2 helper**

Add this test using the existing `cityLocalInventoryLifecycleGame()` fixture:

```ts
test('compact retail inspector actions stay clear of the control dock', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 800 });
  await installSandboxAutoSave(page, cityLocalInventoryLifecycleGame());

  const canvas = await expectRetailMapReady(page);
  const game = await readAutoSaveGame(page);
  const store = game.stores[0];
  if (!store) throw new Error('Missing starter store');

  await clickCanvasTile(page, canvas, store.mapX, store.mapY);
  const inspector = page.getByRole('dialog', { name: /tile details/i });
  const details = inspector.getByRole('button', { name: /open details/i });

  await expectActionDoesNotOverlapControlDesk(page, details);
});
```

- [ ] **Step 7: Verify Task 4**

Run:

```bash
bun run test:unit -- \
  src/lib/components/game/TileInspector.svelte.spec.ts \
  src/lib/components/game/IndustryTileInspector.svelte.spec.ts \
  src/lib/components/game/RailSegmentInspector.svelte.spec.ts \
  src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts \
  --run
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add \
  src/lib/components/game/TileInspector.svelte \
  src/lib/components/game/TileInspector.svelte.spec.ts \
  src/lib/components/game/IndustryTileInspector.svelte \
  src/lib/components/game/IndustryTileInspector.svelte.spec.ts \
  src/lib/components/game/RailSegmentInspector.svelte \
  src/lib/components/game/RailSegmentInspector.svelte.spec.ts \
  src/lib/components/game/LogisticsRouteInspector.svelte \
  src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts \
  src/routes/MapInspectorHost.svelte \
  src/routes/retail-sim.e2e.ts
git commit -m "feat(ui): revamp map inspector presentation"
```

---

## Task 5: Build a stable parchment management workspace and key only its body

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte.spec.ts`
- Modify: `src/lib/components/game/Scorecard.svelte`
- Modify: `src/lib/components/game/Scorecard.svelte.spec.ts`
- Modify: `src/routes/retail-sim.e2e.ts`

**Consumes:** the `ManagementPanelMenuItem` and `GameIcon` from Task 1.  
**Produces:** `managementItems: ManagementPanelMenuItem[]` and `onSelectPanel: (id: ManagementPanelId) => void` on `ManagementPanelHost`.

- [ ] **Step 1: Write failing internal-navigation tests**

Add to `ManagementPanelHost.svelte.spec.ts`:

```ts
it('renders shared management navigation and delegates panel changes', async () => {
  const onSelectPanel = vi.fn();
  render(ManagementPanelHost, hostProps({
    panelId: 'dashboard',
    panelLabel: 'Dashboard',
    managementItems,
    onSelectPanel
  }));

  const dialog = page.getByRole('dialog', { name: /dashboard/i });
  const dashboard = dialog.getByRole('button', { name: /^dashboard$/i });
  const finance = dialog.getByRole('button', { name: /^finance$/i });

  await expect.element(dashboard).toHaveAttribute('aria-pressed', 'true');
  await finance.click();
  expect(onSelectPanel).toHaveBeenCalledWith('finance');
});
```

Keep current close/backdrop, stores/decisions, finance invariant, and callback-forwarding tests.

Run:

```bash
bun run test:unit -- src/routes/ManagementPanelHost.svelte.spec.ts --run
```

Expected: FAIL because internal navigation does not exist.

- [ ] **Step 2: Remove the route-level `{#key activeManagementPanel.id}`**

In the current management block, delete only the `{#key activeManagementPanel.id}` and matching `{/key}` wrapper. Keep the existing `{@const panelGame}`, `{@const retailSupplyViews}`, and every existing `ManagementPanelHost` prop/callback.

Add these two props to the existing host mount:

```svelte
managementItems={managementPanelMenuItems}
onSelectPanel={openManagementPanel}
```

Keep the existing lazy finance derivation:

```ts
let financeMetrics = $derived(
  activeManagementPanelId === 'finance' ? getFinanceMetrics(game ?? starterMapState) : null
);
```

Do not make finance metrics eager.

- [ ] **Step 3: Build the stable workspace shell**

Add these properties to the current host `Props` interface:

```ts
managementItems: ManagementPanelMenuItem[];
onSelectPanel: (id: ManagementPanelId) => void;
```

Keep one backdrop, one `role="dialog"`, and one `focusTrap` attachment mounted. Add the left navigation rail from `managementItems` using `.btn-icon` + `GameIcon`.

Each rail button uses:

```svelte
aria-label={item.label}
aria-pressed={item.id === panelId}
title={`${item.label} (${item.shortcut})`}
onclick={() => onSelectPanel(item.id)}
```

Keep the existing day/cash header. Convert Close to `GameIcon name="close"` only if the button becomes icon-only; preserve its localized accessible name.

- [ ] **Step 4: Key only the current panel-switch body**

Identify the existing switch that starts with:

```svelte
{#if panelId === 'dashboard'}
```

and ends at the matching `{/if}` after the Finance branch. Wrap that complete existing switch with:

```svelte
<div class="workspace-body">
  {#key panelId}
```

before the switch, and:

```svelte
  {/key}
</div>
```

after the switch.

Do not rewrite the panel branches into dynamic components. Do not change branch props/callbacks while moving them inside the keyed body.

- [ ] **Step 5: Upgrade `Scorecard` using only its four current values**

`Scorecard.svelte.spec.ts` already exists. Keep its current meter/value/label coverage and extend it only where the new card/gauge structure needs accessible assertions.

Preserve these values:

```text
profit
customerSatisfaction
staffMorale
marketPosition
```

Do not add history, trend data, or a new score model.

Run:

```bash
bun run test:unit -- src/lib/components/game/Scorecard.svelte.spec.ts --run
```

Expected: PASS after the visual rewrite.

- [ ] **Step 6: Add route E2E for in-place switching with dialog-scoped locators**

Open Dashboard through the page-level gameplay rail/shortcut. Then scope duplicate labels to the dialog:

```ts
const dashboardDialog = page.getByRole('dialog', { name: /^dashboard$/i });
await dashboardDialog.getByRole('button', { name: /^finance$/i }).click();

const financeDialog = page.getByRole('dialog', { name: /^finance$/i });
await expect(financeDialog).toBeVisible();
await expect(
  financeDialog.getByRole('button', { name: /^finance$/i })
).toHaveAttribute('aria-pressed', 'true');
```

Assert focus remains inside the stable modal after switching:

```ts
await expect
  .poll(() =>
    page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
      return Boolean(dialog && document.activeElement && dialog.contains(document.activeElement));
    })
  )
  .toBe(true);
```

Do not use unscoped page-level Dashboard/Finance locators once the workspace is open.

- [ ] **Step 7: Verify Task 5**

Run:

```bash
bun run test:unit -- \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  src/lib/components/game/Scorecard.svelte.spec.ts \
  --run
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: PASS.

- [ ] **Step 8: Commit Task 5**

```bash
git add \
  src/routes/+page.svelte \
  src/routes/ManagementPanelHost.svelte \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  src/lib/components/game/Scorecard.svelte \
  src/lib/components/game/Scorecard.svelte.spec.ts \
  src/routes/retail-sim.e2e.ts
git commit -m "feat(ui): revamp management workspace"
```

---

## Task 6: Pin final responsive and integration parity using the migrated helpers

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`

**Consumes:** `selectMapView` from Task 3 and `expectActionDoesNotOverlapControlDesk` from Task 2. Do not create parallel geometry/navigation helpers.

- [ ] **Step 1: Add explicit 1920×1080 and 1280×800 HUD checks**

Use the existing `logisticsRouteNavigationGame()` fixture:

```ts
for (const viewport of [
  { width: 1920, height: 1080 },
  { width: 1280, height: 800 }
]) {
  test(`revamped HUD remains usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await installSandboxAutoSave(page, logisticsRouteNavigationGame());

    await expectRetailMapReady(page);
    await expect(page.getByRole('button', { name: /retail city map/i })).toBeVisible();
    await expect(page.getByLabel('Control desk')).toBeVisible();

    await selectMapView(page, /industry city map/i);
    await expect(page.getByRole('button', { name: /industry city map/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });
}
```

- [ ] **Step 2: Reuse the non-overlap helper at 1280×800**

Within the 1280×800 path, switch back to Retail and inspect the fixture's starter store:

```ts
await selectMapView(page, /retail city map/i);
const retailCanvas = await expectRetailMapReady(page);
const game = await readAutoSaveGame(page);
const store = game.stores[0];
if (!store) throw new Error('Missing starter store for HUD layout verification');

await clickCanvasTile(page, retailCanvas, store.mapX, store.mapY);
const inspector = page.getByRole('dialog', { name: /tile details/i });
await expectActionDoesNotOverlapControlDesk(
  page,
  inspector.getByRole('button', { name: /open details/i })
);
```

- [ ] **Step 3: Reuse dialog-scoped management navigation**

Open Dashboard through the page-level rail, then switch inside the dialog:

```ts
const dashboardDialog = page.getByRole('dialog', { name: /^dashboard$/i });
await dashboardDialog.getByRole('button', { name: /^reports$/i }).click();

const reportsDialog = page.getByRole('dialog', { name: /^reports$/i });
await expect(reportsDialog).toBeVisible();
await expect(
  reportsDialog.getByRole('button', { name: /^reports$/i })
).toHaveAttribute('aria-pressed', 'true');
```

- [ ] **Step 4: Run the complete focused component suite**

Run:

```bash
bun run test:unit -- \
  src/lib/components/game/GameIcon.svelte.spec.ts \
  src/lib/components/game/TopBar.svelte.spec.ts \
  src/lib/components/game/GameMenu.svelte.spec.ts \
  src/lib/components/game/ControlDesk.svelte.spec.ts \
  src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts \
  src/lib/components/game/TileInspector.svelte.spec.ts \
  src/lib/components/game/IndustryTileInspector.svelte.spec.ts \
  src/lib/components/game/RailSegmentInspector.svelte.spec.ts \
  src/lib/components/game/LogisticsRouteInspector.svelte.spec.ts \
  src/lib/components/game/Scorecard.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  --run
```

Expected: PASS.

- [ ] **Step 5: Run project verification**

Run:

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: PASS.

If an unrelated pre-existing failure appears, record the exact command/failure in PR #53 rather than broadening HPA-304.

- [ ] **Step 6: Perform manual visual comparison**

At 1920×1080 and 1280×800 verify:

- map remains dominant;
- `.btn-icon` brass language is consistent between gameplay and management navigation;
- Build is visually primary/moss;
- TopBar exposes Retail/Industry/World, Day, Cash, Alerts, and Menu without text clutter;
- store inspector is art-led and Upgrade/Details hierarchy is clear;
- management workspace shell remains stable while panel bodies switch;
- compact management access is not hidden;
- no mock-only analytics/value was invented.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/routes/retail-sim.e2e.ts
git commit -m "test(ui): pin gameplay revamp integration"
```

If Tasks 1–5 already left the final E2E file in the required state and Step 1–3 produce no additional tracked changes, skip this empty commit.

---

## Final PR Checklist

- [ ] HPA-304 is the only Linear ticket for this implementation.
- [ ] All implementation commits stay on the same HPA-304 branch/PR.
- [ ] No new domain state, save fields, migration, controller, store, registry, or icon dependency was added.
- [ ] `GameIconName` is closed and includes every icon HPA-304 renders; speeds remain numeric text.
- [ ] `ControlDesk`, route config, and `ManagementPanelHost` use one `ManagementPanelMenuItem` type.
- [ ] `.btn-icon` is the brass medallion; `.seal` remains the wax-red badge.
- [ ] `ControlDesk` exposes all management destinations at 414×800.
- [ ] The old footer-specific E2E geometry helper is replaced in Task 2 before route verification.
- [ ] `GameMenu` no longer owns map switching.
- [ ] TopBar map controls keep `route.mapEyebrow.*` accessible names.
- [ ] Route E2E no longer opens the hamburger to switch maps or treats map-tab absence as menu state.
- [ ] `MapInspectorHost` removes desktop footer-wrap offsets and derives compact clearance from the dock-height variable.
- [ ] Compact inspector actions are proven not to overlap the dock at 760×800.
- [ ] Route-level `{#key activeManagementPanel.id}` is removed.
- [ ] `ManagementPanelHost` stays mounted; only its complete panel body switch is keyed by `panelId`.
- [ ] Internal workspace navigation uses dialog-scoped locators in tests.
- [ ] Existing panel bodies remain behavior owners; only `Scorecard` receives a deliberate body-level visual upgrade.
- [ ] 1920×1080 and 1280×800 layouts are manually reviewed against the supplied references.
- [ ] `bun run check` passes.
- [ ] `bun run lint` passes.
- [ ] focused component tests pass.
- [ ] full unit suite passes.
- [ ] targeted `retail-sim.e2e.ts` passes.