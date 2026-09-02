# Gameplay HUD and Management Panel Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implement all tasks in the single HPA-304 PR.

**Goal:** Ship the approved art-forward Serpens gameplay HUD, map inspector treatment, and parchment management workspace without changing game-domain behavior or introducing a new UI/state framework.

**Architecture:** Keep `+page.svelte` as the route composition/shortcut/command owner, `GameRouteController` as the command/persistence coordinator, the HPA-568 route-local hosts as the presentation boundaries, and Phaser as the map renderer. Add only a small typed inline-SVG icon primitive; reuse one typed management item list in both gameplay and management navigation. HPA-304 removes the old route-level management `{#key}` so the workspace shell remains mounted while only its body changes.

**Tech Stack:** Svelte 5.55 runes, TypeScript 6, SvelteKit 2.57, Vitest 4 browser mode, Playwright 1.59, Phaser 4.1, existing Serpens i18n and parchment/brass CSS tokens.

**Spec:** `docs/superpowers/specs/2026-09-01-gameplay-ui-revamp-design.md`

## Global Constraints

- Follow the approved Vitrine/brass-medallion + art-forward direction documented in the spec.
- One HPA-304 implementation PR only; task commits are checkpoints inside that PR.
- `GameState` remains authoritative domain state.
- `GameRouteController` remains the route command/persistence coordinator.
- `+page.svelte` keeps active map view, active management panel, selections, command handlers, global shortcuts, and Escape priority.
- Reuse `MapSurfaceHost.svelte`, `MapInspectorHost.svelte`, and `ManagementPanelHost.svelte`; do not add `MapWorkspace` or a replacement host framework.
- Do not add Svelte context/global state, an event bus, generic modal/panel/inspector registry, second controller, or design-system package.
- Do not modify simulation rules, persistence/save schema, scenario semantics, game-domain types, or Phaser snapshots for presentation convenience.
- Do not add historical cash/trend/analytics data solely to imitate decorative mock values.
- Reuse existing i18n labels before adding translation keys.
- Reuse existing `tokens.css` values and `frames.css` primitives; no parallel theme system and no runtime HUD-variant selector.
- Reuse `.btn-icon` as the circular brass medallion and `.seal` as the wax-red badge/attention pill.
- Preserve existing keyboard shortcuts and route-owned Escape ordering.
- Keep icon-only actions accessible with localized names and label/hotkey `title` or tooltip text.
- Preserve `route.mapEyebrow.retail`, `route.mapEyebrow.industry`, and `route.mapEyebrow.world` as the map button accessible labels.
- Keep `1×`, `2×`, and `5×` as numeric text controls; do not add speed icons.
- Treat 1920×1080 as reference parity and 1280×800 as the desktop regression target.
- Add real compact evidence around ~414px rather than inferring compact behavior from a desktop viewport.
- Run focused tests after each task and `retail-sim.e2e.ts` after every route-visible cutover.
- Update route E2E helpers in the same task that invalidates their old UI assumptions.

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
- `src/lib/components/game/IndustryTileInspector.svelte` and its spec only where the shared shell treatment requires it
- `src/lib/components/game/RailSegmentInspector.svelte` and its spec only where the shared shell treatment requires it
- `src/lib/components/game/LogisticsRouteInspector.svelte` and its spec only where the shared shell treatment requires it
- `src/lib/components/game/Scorecard.svelte` and focused coverage
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

**Interfaces:**

Create one closed presentation vocabulary in `gameIcon.ts`:

```ts
import type { ManagementPanelId } from '$lib/game/keyboardShortcuts';

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

Every current management destination has a shortcut. Remove `ControlDesk`'s local `ManagementItem` interface and its optional-shortcut branch; do not add a third copy of the type later in `ManagementPanelHost`.

`GameIcon.svelte` accepts only:

```ts
let { name }: { name: GameIconName } = $props();
```

It renders one inline SVG with `aria-hidden="true"`, `data-icon={name}`, a common `viewBox="0 0 24 24"`, and explicit `{#if}` / `{:else if}` path branches.

- [ ] **Step 1: Write the failing icon contract test**

Create `GameIcon.svelte.spec.ts`:

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

Use local static SVG paths only. Do not add dynamic imports, an icon class/registry service, external SVG assets, or a package.

The component owns no accessible label and no click behavior.

- [ ] **Step 3: Type the existing route management config once**

Change the route config to include semantic icons while preserving order, IDs, labels, and shortcuts:

```ts
const managementPanelMenuConfig: Array<
  Omit<ManagementPanelMenuItem, 'label'>
> = [
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

let managementPanelMenuItems = $derived.by<ManagementPanelMenuItem[]>(() =>
  managementPanelMenuConfig.map((item) => ({
    ...item,
    label: i18n.labels.managementPanel(item.id)
  }))
);
```

Delete the route-local `ManagementPanelMenuItem` interface.

- [ ] **Step 4: Make `ControlDesk` consume the shared type before visual work**

Replace its local `ManagementItem` with:

```ts
import type { ManagementPanelMenuItem } from './gameIcon';

interface Props {
  managementItems: ManagementPanelMenuItem[];
  // existing remaining props unchanged
}
```

Update test fixtures to include icons and delete the test that exists only to prove a missing shortcut can omit a keycap. There is no current shortcut-less destination.

- [ ] **Step 5: Verify the shared type cutover**

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

## Task 2: Replace the footer with the gameplay rail and move the clearance E2E contract

**Files:**
- Modify: `src/lib/components/game/ControlDesk.svelte`
- Modify: `src/lib/components/game/ControlDesk.svelte.spec.ts`
- Modify: `src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts`
- Modify: `src/lib/styles/frames.css`
- Modify: `src/routes/retail-sim.e2e.ts`

**Interfaces:**

Keep every existing callback:

```text
Build -> onBuild
management item -> onOpenManagement(id)
Rail Build -> onToggleRailBuild
Pause/Resume -> onTogglePause
1×/2×/5× -> onSelectSpeed
Shortcuts -> onOpenShortcuts
```

No action or shortcut ownership moves into `ControlDesk`.

- [ ] **Step 1: Write the failing rail/component expectations**

Update `ControlDesk.svelte.spec.ts` so the desktop fixture expects:

```ts
const dashboard = page.getByRole('button', { name: /^dashboard$/i });
await expect.element(dashboard).toBeVisible();
await expect.element(dashboard).toHaveAttribute('title', 'Dashboard (O)');
```

Also assert:

- Build remains accessible and calls `onBuild`;
- Dashboard click calls `onOpenManagement('dashboard')`;
- management icons render via `data-icon`;
- Rail Build keeps `aria-pressed` and disabled behavior.

Add a real compact test in the same file:

```ts
it('keeps management destinations reachable in the compact dock', async () => {
  await page.viewport(414, 800);
  render(ControlDesk, baseProps());

  await expect.element(page.getByRole('button', { name: /^dashboard$/i })).toBeVisible();
  await expect.element(page.getByRole('button', { name: /^policies$/i })).toBeVisible();
  await expect.element(page.getByRole('button', { name: /^finance$/i })).toBeVisible();
});
```

The existing suite-level desktop viewport may stay at 1280×800; this test explicitly overrides it to 414×800.

Run:

```bash
bun run test:unit -- \
  src/lib/components/game/ControlDesk.svelte.spec.ts \
  src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts \
  --run
```

Expected: FAIL on new rail/title/compact expectations.

- [ ] **Step 2: Reuse `.btn-icon` and add only the Build modifier**

Do not add a duplicate medallion style. Use existing `.btn-icon` for icon buttons.

Add one shared modifier in `frames.css`, for example:

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
```

Do not change `.seal`; alert counts and inspector attention continue to use it.

- [ ] **Step 3: Implement the desktop left rail**

Change `.control-desk` from a full-width bottom footer into a left-side fixed rail below the top HUD.

Use `GameIcon` for:

- Build;
- management destinations;
- Rail Build;
- Pause/Resume;
- shortcut help.

Keep speeds as their existing `1×`, `2×`, `5×` text buttons.

Each management button uses the localized label as `aria-label` and:

```svelte
title={`${item.label} (${item.shortcut})`}
```

Do not add local active-panel state.

- [ ] **Step 4: Implement compact dock with one shared height contract**

Remove the existing compact rule that hides `.manage`.

At `max-width: 980px`, lay out the same action set as a horizontally scrollable bottom dock. Avoid a second markup tree unless CSS cannot express the layout.

In `frames.css`, define the one cross-component layout constant used later by the inspector host:

```css
:root {
  --control-desk-compact-height: 5.75rem;
}
```

The compact `.control-desk` uses that value as its occupied/minimum block size. Keep safe-area padding inside that footprint or account for it consistently in the inspector calculation.

- [ ] **Step 5: Replace the old footer-specific E2E helper before running the route suite**

In `retail-sim.e2e.ts`, rename:

```ts
expectActionAboveControlDesk
```

to:

```ts
expectActionDoesNotOverlapControlDesk
```

and replace the y-only assertion with rectangle separation:

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

Update all existing helper call sites.

Rename the test:

```text
inspector clearance keeps route, retail, and industry actions clear of the gameplay controls
```

Keep its current 1000×800 viewport and its assertion that the management group contains all nine destinations. It now verifies rail clearance rather than footer wrapping.

This helper is the geometry contract reused in Tasks 4 and 6; do not create another non-overlap helper later.

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

Expected: PASS after the helper is migrated with the chrome.

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

**Interfaces:**

`TopBar` already receives:

```ts
activeMapView: MapViewId;
onSelectView: (view: MapViewId) => void;
```

Keep and consume them directly.

`GameMenu` loses:

```ts
activeMapView: MapViewId;
onSelectView: (view: MapViewId) => void;
```

It keeps locale selection, route menu content, open state, focus trap, outside-click dismissal, and its local Escape handler.

- [ ] **Step 1: Write failing direct-map tests using the exact existing accessible names**

In `TopBar.svelte.spec.ts`:

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

The button labels must come from `route.mapEyebrow.*`; do not substitute short map names.

Run:

```bash
bun run test:unit -- src/lib/components/game/TopBar.svelte.spec.ts --run
```

Expected: FAIL because map controls are still inside the menu.

- [ ] **Step 2: Update the GameMenu test contract before changing it**

Change `GameMenu.svelte.spec.ts` so opening the menu proves:

- locale selector is present;
- route-provided menu content is present when supplied;
- no map-view group/buttons are inside the dialog.

The test should fail until the old map section is removed.

- [ ] **Step 3: Implement top HUD map buttons with `GameIcon`**

Add three direct buttons using:

```ts
const mapViews = [
  { id: 'retail', icon: 'retail', label: i18n.t('route.mapEyebrow.retail') },
  { id: 'industry', icon: 'industry', label: i18n.t('route.mapEyebrow.industry') },
  { id: 'world', icon: 'world', label: i18n.t('route.mapEyebrow.world') }
] as const;
```

Each button:

- uses `class="btn-icon"`;
- uses `aria-label={view.label}`;
- uses `aria-pressed={activeMapView === view.id}`;
- calls `onSelectView(view.id)`;
- renders `<GameIcon name={view.icon} />`.

Keep current pointer-event behavior so the rest of the map remains interactive.

Add `GameIcon name="day"` / `cash` as decorative readout icons only; do not add new data props.

Replace the existing alert inline SVG with `<GameIcon name="alerts" />`.

- [ ] **Step 4: Remove map ownership from `GameMenu` and reuse `GameIcon` for menu**

Delete:

- `MapViewId` import used only by the menu;
- `activeMapView`/`onSelectView` props;
- the `views` list;
- `selectView`;
- the view-tab section/CSS.

Replace the current hamburger SVG with:

```svelte
<GameIcon name="menu" />
```

Update the `GameMenu` mount in `TopBar` accordingly.

- [ ] **Step 5: Migrate the route map-selection helper in the same task**

The old helper opens the hamburger first. Replace it with a direct HUD helper:

```ts
async function selectMapView(page: Page, itemName: RegExp): Promise<void> {
  await page.getByRole('button', { name: itemName }).click();
}
```

Update all `openMapMenuItem(...)` call sites to `selectMapView(...)`.

Do not leave comments saying map tabs live in a popover.

- [ ] **Step 6: Rewrite Escape/menu assertions so always-visible map buttons are not used as menu state**

For the number-key test, after pressing `2`, assert the TopBar control directly:

```ts
await expect(page.getByRole('button', { name: /industry city map/i })).toHaveAttribute(
  'aria-pressed',
  'true'
);
```

For the hamburger Escape test, use the menu trigger/dialog contract:

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

Update logistics navigation that currently finds World inside the menu dialog to call `selectMapView(page, /world map/i)` instead.

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

Expected: PASS with no route test depending on map tabs being inside the menu.

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

## Task 4: Recompose inspectors and make compact clearance follow the dock

**Files:**
- Modify: `src/lib/components/game/TileInspector.svelte`
- Modify: `src/lib/components/game/TileInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/IndustryTileInspector.svelte` and spec only where shell styling changes it
- Modify: `src/lib/components/game/RailSegmentInspector.svelte` and spec only where shell styling changes it
- Modify: `src/lib/components/game/LogisticsRouteInspector.svelte` and spec only where shell styling changes it
- Modify: `src/routes/MapInspectorHost.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

**Interfaces:**

Do not add store/industry/rail/logistics state. Existing props and callbacks remain authoritative.

- [ ] **Step 1: Strengthen existing inspector characterization before restyling**

In `TileInspector.svelte.spec.ts`, keep or add assertions for the existing behavior the new hierarchy must preserve:

```ts
await expect.element(page.getByTestId(`store-art-${store.archetypeId}`)).toBeVisible();
await expect.element(page.getByText(/revenue per day/i)).toBeVisible();
await expect.element(page.getByText(/stock health/i)).toBeVisible();
await expect.element(page.getByText(/staff morale/i)).toBeVisible();
await expect.element(page.getByRole('button', { name: /upgrade/i })).toBeVisible();
await expect.element(page.getByRole('button', { name: /open details/i })).toBeVisible();
```

Keep callback assertions for upgrade/details/close and existing disabled/attention behavior.

Run:

```bash
bun run test:unit -- src/lib/components/game/TileInspector.svelte.spec.ts --run
```

Expected: PASS before visual changes; these are characterization tests, not an artificial red step.

- [ ] **Step 2: Recompose retail inspector using existing data only**

Make store artwork visually primary, then identity/location, three vitals, attention, level/next benefit, and Upgrade/Details actions.

Do not add cash history, stock projections, new read models, or inspector-local business rules.

Keep empty-tile demand/rent/foot-traffic/customer-fit behavior.

- [ ] **Step 3: Normalize other inspector shells only where concrete duplication exists**

For industry, rail, and logistics inspectors:

- align paper/header/close spacing;
- use `GameIcon name="close"` if the close action is converted to icon-only;
- retain current domain-specific sections and callbacks.

Do not extract a generic inspector component.

- [ ] **Step 4: Remove desktop footer-specific `MapInspectorHost` offsets**

Delete the desktop values that exist for wrapping management rows:

```css
bottom: 8.5rem;
```

and the 981–1023px special `11.5rem` override.

Keep right-side desktop placement with enough ordinary edge spacing for the left rail to remain unrelated to inspector clearance.

- [ ] **Step 5: Make compact inspector inset use the compact dock height contract**

Replace the old hardcoded compact `bottom: 5rem` assumption with the shared value from `frames.css`:

```css
@media (max-width: 980px) {
  .inspector-overlay {
    position: fixed;
    inset:
      auto
      0
      calc(var(--control-desk-compact-height) + 0.5rem)
      0;
    width: auto;
    max-height: 60dvh;
  }
}
```

Tune the small gap only if the real dock dimensions require it. Do not copy a second independent dock-height number into this file.

- [ ] **Step 6: Add compact route evidence using the Task 2 non-overlap helper**

Add a focused route test at 760×800 using the existing `cityLocalInventoryLifecycleGame()` fixture:

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

Do not introduce a new game fixture solely for geometry.

- [ ] **Step 7: Verify Task 4**

Run:

```bash
bun run test:unit -- src/lib/components/game/TileInspector.svelte.spec.ts --run
```

If `IndustryTileInspector.svelte`, `RailSegmentInspector.svelte`, or `LogisticsRouteInspector.svelte` changed in Step 3, run their existing adjacent `*.svelte.spec.ts` files in the same command before continuing.

Then run:

```bash
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: PASS at desktop and compact clearance paths.

- [ ] **Step 8: Commit Task 4**

Stage the required retail/host/E2E files:

```bash
git add \
  src/lib/components/game/TileInspector.svelte \
  src/lib/components/game/TileInspector.svelte.spec.ts \
  src/routes/MapInspectorHost.svelte \
  src/routes/retail-sim.e2e.ts
```

If Step 3 changed an industry, rail, or logistics inspector, add that component and its adjacent spec to the same commit. Then commit:

```bash
git commit -m "feat(ui): revamp map inspector presentation"
```

---

## Task 5: Build the stable parchment management workspace with body-only remounting

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte.spec.ts`
- Modify: `src/lib/components/game/Scorecard.svelte`
- Modify: `src/lib/components/game/Scorecard.svelte.spec.ts` if it exists; otherwise create it beside `Scorecard.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

**Interfaces:**

`ManagementPanelHost` adds exactly:

```ts
import type { ManagementPanelMenuItem } from '$lib/components/game/gameIcon';

interface Props {
  managementItems: ManagementPanelMenuItem[];
  onSelectPanel: (id: ManagementPanelId) => void;
  // all current props/callbacks remain
}
```

Do not define another management item interface.

- [ ] **Step 1: Write failing management rail tests**

In `ManagementPanelHost.svelte.spec.ts`, add:

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

Also retain current shell/backdrop/close, stores/decisions, finance invariant, and callback-forwarding coverage.

Run:

```bash
bun run test:unit -- src/routes/ManagementPanelHost.svelte.spec.ts --run
```

Expected: FAIL because the host does not yet expose internal navigation.

- [ ] **Step 2: Remove the route-level `{#key activeManagementPanel.id}`**

Change the route from:

```svelte
{#if activeManagementPanel}
  {#key activeManagementPanel.id}
    {@const panelGame = game ?? starterMapState}
    <ManagementPanelHost ... />
  {/key}
{/if}
```

to a stable host:

```svelte
{#if activeManagementPanel}
  {@const panelGame = game ?? starterMapState}
  {@const retailSupplyViews = buildRetailCitySupplyViews(panelGame, i18n)}
  <ManagementPanelHost
    panelId={activeManagementPanel.id}
    panelLabel={activeManagementPanel.label}
    managementItems={managementPanelMenuItems}
    onSelectPanel={openManagementPanel}
    {panelGame}
    {summary}
    {financeMetrics}
    {retailSupplyViews}
    mutations={mutationAvailability}
    retailSupplyDisabled={game === null || !mutationAvailability.setRetailSupplySource}
    {focusedFinanceLoanId}
    {focusedRetailSupplyCityId}
    logisticsView={logisticsPanelView}
    manageLogistics={mutationAvailability.manageLogistics}
    {focusedLogisticsRouteId}
    {logisticsRoutePreset}
    {i18n}
    disabledReason={mutationDisabledReason}
    onClose={closeManagementPanel}
    onChangePolicy={changePolicy}
    onSetPolicyOverride={setPolicyOverride}
    onClearPolicyOverrideField={clearPolicyOverrideField}
    onResetPolicyOverrideScope={resetPolicyOverrideScope}
    onSetManagerDelegation={setManagerDelegation}
    onRemoveManagerDelegation={removeManagerDelegation}
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
    onPlanProduct={planSupplyProduct}
    {plannerProductIds}
    onDispatchManualTransfer={dispatchManualTransfer}
    onCreateRecurringRoute={createRecurringRoute}
    onUpdateRecurringRoute={updateRecurringRoute}
    onPauseRecurringRoute={pauseRecurringRoute}
    onResumeRecurringRoute={resumeRecurringRoute}
    onReprioritizeRecurringRoute={reprioritizeRecurringRoute}
    onRemoveRecurringRoute={removeRecurringRoute}
  />
{/if}
```

Keep the existing `financeMetrics` derivation. It already reacts to `activeManagementPanelId === 'finance'`; do not calculate finance metrics eagerly or introduce a new store.

- [ ] **Step 3: Build the stable workspace shell**

Inside `ManagementPanelHost`:

- keep one `role="dialog"`, focus trap, backdrop, and close control mounted;
- add the left rail from `managementItems` using `.btn-icon` + `GameIcon`;
- use `aria-pressed={item.id === panelId}`;
- use `title={`${item.label} (${item.shortcut})`}`;
- call `onSelectPanel(item.id)`;
- keep day/cash in the header;
- use `GameIcon name="close"` if close becomes icon-only.

Do not install a local navigation store or key handler.

- [ ] **Step 4: Key only the content region**

Wrap the existing explicit panel switch, not the dialog shell:

```svelte
<div class="workspace-body">
  {#key panelId}
    {#if panelId === 'dashboard'}
      <Scorecard {i18n} scorecard={panelGame.scorecard} />
    {:else if panelId === 'policies'}
      <PolicyPanel
        {i18n}
        game={panelGame}
        onChange={onChangePolicy}
        onSetPolicyOverride={onSetPolicyOverride}
        onClearPolicyOverrideField={onClearPolicyOverrideField}
        onResetPolicyOverrideScope={onResetPolicyOverrideScope}
        canUpdate={mutations.updatePolicy}
        canUpdateScoped={mutations.scopedPolicy}
        {disabledReason}
      />
    {:else if panelId === 'staff'}
      <div class="staff-surfaces">
        <StaffPanel ... />
        <ManagerDelegationPanel ... />
      </div>
    {:else if panelId === 'finance'}
      <FinancePanel
        game={panelGame}
        metrics={requireFinanceMetrics()}
        {i18n}
        focusedLoanId={focusedFinanceLoanId}
        mutationPending={mutations.pending}
        {onBorrow}
        {onRepay}
        {onPayoff}
        {onRefinance}
      />
    {/if}
  {/key}
</div>
```

For the unchanged staff/stores/decisions/reports/product-chains/logistics branches, move their existing current markup into this same keyed body without changing props/callbacks. Do not introduce dynamic components.

- [ ] **Step 5: Upgrade `Scorecard` only with current four values**

Retain:

```text
profit
customerSatisfaction
staffMorale
marketPosition
```

Add/adjust `Scorecard.svelte.spec.ts` to assert all four localized labels and values remain represented. Then render richer cards/gauges using the same numeric values. Do not add trend history, chart data, or a new score model.

Run the focused scorecard spec before and after the markup change.

- [ ] **Step 6: Add route E2E for in-place rail switching using dialog-scoped locators**

Open the initial panel through the existing page-level management launcher/shortcut. Once the dialog exists, scope all repeated destination names to it:

```ts
const dialog = page.getByRole('dialog', { name: /^dashboard$/i });
await dialog.getByRole('button', { name: /^finance$/i }).click();

const financeDialog = page.getByRole('dialog', { name: /^finance$/i });
await expect(financeDialog).toBeVisible();
await expect(
  financeDialog.getByRole('button', { name: /^finance$/i })
).toHaveAttribute('aria-pressed', 'true');
```

Do not use page-level `getByRole('button', { name: /dashboard|finance/ })` after the workspace is open because the gameplay rail exposes the same labels.

Also assert focus remains within the dialog after switching. Prefer a descendant check over pinning one exact focused button:

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

- [ ] **Step 7: Verify Task 5**

Run:

```bash
bun run test:unit -- src/routes/ManagementPanelHost.svelte.spec.ts --run
bun run test:unit -- src/lib/components/game/Scorecard.svelte.spec.ts --run
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: PASS with one stable modal shell and route-owned panel state.

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

## Task 6: Pin final responsive/integration parity using the migrated helpers

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify focused component/spec files only if final verification exposes a scoped HPA-304 defect

**Interfaces:**

Do not add new geometry or map-navigation helper systems. Reuse:

```text
selectMapView(...)
expectActionDoesNotOverlapControlDesk(...)
```

and scope management workspace locators to the dialog after it is open.

- [ ] **Step 1: Add explicit 1920×1080 and 1280×800 route checks**

Use the existing `logisticsRouteNavigationGame()` fixture because it already provides a retail store plus opened industry/logistics state used elsewhere in this suite:

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

Do not add a new fixture solely for viewport testing.

- [ ] **Step 2: Extend the existing non-overlap helper checks rather than creating a second layout contract**

At 1280×800, switch back to retail, read the existing starter store from the saved `logisticsRouteNavigationGame()` state, click its tile, and call:

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

Use the same helper for any route-inspector geometry assertion needed here.

- [ ] **Step 3: Verify internal management navigation with dialog-scoped locators**

Open Dashboard through the page-level rail, then:

```ts
let dialog = page.getByRole('dialog', { name: /^dashboard$/i });
await dialog.getByRole('button', { name: /^reports$/i }).click();

dialog = page.getByRole('dialog', { name: /^reports$/i });
await expect(dialog).toBeVisible();
await expect(dialog.getByRole('button', { name: /^reports$/i })).toHaveAttribute(
  'aria-pressed',
  'true'
);
```

The page may legitimately contain another Dashboard/Reports launcher outside the dialog; never use an unscoped locator for internal switching.

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
  src/lib/components/game/Scorecard.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  --run
```

If an industry/rail/logistics inspector changed in Task 4, include that component's existing adjacent spec in this focused run.

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

Do not expand HPA-304 to unrelated pre-existing failures. If one appears, capture the exact command/failure in the PR instead of refactoring unrelated code.

- [ ] **Step 6: Perform manual visual comparison against both supplied mockups**

At 1920×1080 and 1280×800 verify:

- map remains the dominant surface;
- the Vitrine `.btn-icon` brass language is consistent between gameplay and management navigation;
- Build is visually primary/moss;
- TopBar exposes direct Retail/Industry/World switching, Day, Cash, Alerts, and Menu without text clutter;
- store inspector is art-led and Upgrade/Details hierarchy is clear;
- management workspace keeps its shell stable while switching panel bodies;
- compact behavior was not achieved by hiding management access;
- no decorative value was invented where current game state lacks data.

Fix only HPA-304 scope defects.

- [ ] **Step 7: Commit final integration if verification changed tracked files**

Stage the route E2E if Step 1–3 changed it:

```bash
git add src/routes/retail-sim.e2e.ts
```

If final verification required a scoped HPA-304 fix in a component/spec, stage that exact file too. Then commit:

```bash
git commit -m "test(ui): pin gameplay revamp integration"
```

If verification produces no tracked changes after the previous task commits, skip this commit.

---

## Final PR Checklist

- [ ] HPA-304 is the only Linear ticket for this implementation.
- [ ] All implementation commits stay on the same HPA-304 branch/PR.
- [ ] No new domain state, save fields, migration, controller, store, registry, or icon dependency was added.
- [ ] `GameIconName` is closed and includes every icon actually mounted by HPA-304; speeds remain numeric text.
- [ ] `ControlDesk`, route config, and `ManagementPanelHost` use one `ManagementPanelMenuItem` type.
- [ ] `.btn-icon` is the brass medallion; `.seal` remains the wax-red badge.
- [ ] `ControlDesk` keeps all existing actions and exposes management at a real ~414px compact viewport.
- [ ] The old footer-specific E2E geometry helper is replaced in Task 2, before route verification.
- [ ] `GameMenu` no longer owns map switching.
- [ ] TopBar map controls keep `route.mapEyebrow.*` accessible names.
- [ ] Route E2E no longer opens the hamburger to switch maps or treats map-tab absence as menu state.
- [ ] `MapInspectorHost` removes desktop footer-wrap offsets and derives compact clearance from the compact dock height.
- [ ] Compact inspector actions are proven not to overlap the dock.
- [ ] Route-level `{#key activeManagementPanel.id}` is removed.
- [ ] `ManagementPanelHost` stays mounted; only its panel body may be keyed by `panelId`.
- [ ] Internal workspace navigation uses dialog-scoped locators in tests.
- [ ] Existing panel bodies remain behavior owners; only `Scorecard` receives a deliberate body-level visual upgrade.
- [ ] 1920×1080 and 1280×800 layouts are manually reviewed against the supplied references.
- [ ] `bun run check` passes.
- [ ] `bun run lint` passes.
- [ ] focused component tests pass.
- [ ] full unit suite passes.
- [ ] targeted `retail-sim.e2e.ts` passes.