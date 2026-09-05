# Gameplay HUD and Management Panel Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implement every task in the single HPA-304 PR.

**Goal:** Ship the approved art-forward Serpens gameplay HUD, reserved map layout, inspector treatment, and parchment management workspace without changing game-domain behavior or introducing a new UI/state framework.

**Architecture:** Keep `+page.svelte` as the route composition/shortcut/command owner, `GameRouteController` as the command/persistence coordinator, HPA-568's route-local hosts as the presentation boundaries, and Phaser as the map renderer. Add one typed local icon/navigation module, reserve map space for the new gameplay rail/dock, remove duplicate compact management navigation from the hamburger, and keep the management dialog shell mounted while only its body changes.

**Tech Stack:** Svelte 5.55 runes, TypeScript 6, SvelteKit 2.57, Vitest 4 browser mode, Playwright 1.59, Phaser 4.1, existing Serpens i18n and parchment/brass CSS.

**Spec:** `docs/superpowers/specs/2026-09-01-gameplay-ui-revamp-design.md`

## Global constraints

- One HPA-304 implementation PR only; task commits are review checkpoints inside that PR.
- `GameState` remains authoritative domain state.
- `GameRouteController` remains the route command/persistence coordinator.
- `+page.svelte` keeps active map view, active management panel, selections, command handlers, global shortcuts, and Escape priority.
- Reuse `MapSurfaceHost.svelte`, `MapInspectorHost.svelte`, and `ManagementPanelHost.svelte`; do not add `MapWorkspace` or a replacement host framework.
- Do not add Svelte context/global state, an event bus, generic modal/panel/inspector registry, second controller, or design-system package.
- Do not modify simulation rules, persistence/save schema, scenario semantics, game-domain types, map tile coordinates, or Phaser snapshots for presentation convenience.
- Do not add historical cash/trend/analytics data solely to imitate decorative mock values.
- Reuse `.btn-icon` as the brass circular control and `.seal` as the wax-red badge/attention pill.
- Put root layout custom properties in `tokens.css`; put reusable visual classes in `frames.css`.
- Preserve existing keyboard shortcuts and route-owned Escape ordering.
- Preserve `route.mapEyebrow.*` as direct map-button accessible names.
- Keep `1×`, `2×`, `5×` as text controls.
- Treat 1920×1080 as reference parity and 1280×800 as desktop regression; use 760×800 and 414×800 for compact evidence.
- Update route E2E helpers/contracts in the same task that invalidates their old UI assumptions.
- Run the full E2E suite at the rail/map-reservation cutover and at final verification.

---

## File map

### Create

- `src/lib/components/game/gameNavigation.ts`
- `src/lib/components/game/GameIcon.svelte`
- `src/lib/components/game/GameIcon.svelte.spec.ts`

### Modify

- `src/lib/styles/tokens.css`
- `src/lib/styles/frames.css`
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
- `src/routes/MapSurfaceHost.svelte`
- `src/routes/MapInspectorHost.svelte`
- `src/routes/ManagementPanelHost.svelte`
- `src/routes/ManagementPanelHost.svelte.spec.ts`
- `src/routes/+page.svelte`
- `src/routes/retail-sim.e2e.ts`

### Verification-only route file

- `src/routes/time-flow.e2e.ts` — run it because it drives Menu, Pause/Resume, and speed controls; do not edit it unless a real accessibility contract changes.

### Must remain behaviorally unchanged

- `src/routes/gameRouteController.ts`
- `src/lib/game/**`
- `src/lib/persistence/**`
- Phaser scene/snapshot/domain logic under `src/lib/phaser/**` and `src/lib/game/*MapRender.ts`
- scenario lifecycle and save semantics

---

## Task 1: Add one exhaustive icon vocabulary and one shared management item type

**Files:**
- Create: `src/lib/components/game/gameNavigation.ts`
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

- [ ] **Step 1: Write the exhaustive icon spec first**

Create `src/lib/components/game/GameIcon.svelte.spec.ts`:

```ts
import { expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import GameIcon from './GameIcon.svelte';
import { ICON_PATHS, type GameIconName } from './gameNavigation';

for (const name of Object.keys(ICON_PATHS) as GameIconName[]) {
  it(`renders ${name} as a decorative SVG`, () => {
    expect.assertions(3);

    render(GameIcon, { name });
    const svg = document.querySelector(`svg[data-icon="${name}"]`);

    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
    expect(svg?.querySelectorAll('path').length).toBeGreaterThan(0);
  });
}
```

Run:

```bash
bun run test:unit -- src/lib/components/game/GameIcon.svelte.spec.ts --run
```

Expected: FAIL because `GameIcon.svelte` and `gameNavigation.ts` do not exist.

- [ ] **Step 2: Create `gameNavigation.ts` with an exhaustive path table**

Create:

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

export const ICON_PATHS: Record<GameIconName, readonly string[]> = {
  build: ['M3 20h18', 'M6 20V9l6-4 6 4v11', 'M10 20v-6h4v6'],
  dashboard: ['M4 4h7v7H4z', 'M13 4h7v4h-7z', 'M13 10h7v10h-7z', 'M4 13h7v7H4z'],
  policies: ['M6 3h9l3 3v15H6z', 'M15 3v4h4', 'm9 13 2 2 4-4'],
  staff: ['M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M3 21c0-4 12-4 12 0', 'M17 8a3 3 0 0 1 0 6', 'M18 16c2.5.4 3 1.8 3 4'],
  stores: ['M4 9h16l-2-5H6z', 'M5 9v11h14V9', 'M9 20v-6h6v6'],
  decisions: ['M12 3v6', 'M12 9 5-5', 'M17 4v4', 'M12 9 7 4', 'M19 13v5', 'M19 18l-2 3'],
  reports: ['M5 20V10', 'M10 20V4', 'M15 20v-7', 'M20 20V7', 'M3 20h19'],
  productChains: ['M6 6h.01', 'M18 12h.01', 'M7 18h.01', 'M8 7.4 15.8 11', 'M16.2 13.8 9 17'],
  finance: ['M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3Z', 'M5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7', 'M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3'],
  logistics: ['M3 6h11v10H3z', 'M14 10h4l3 3v3h-7z', 'M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M18 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
  retail: ['M6 8h12l-1-4H7z', 'M7 8v12h10V8', 'M10 20v-6h4v6'],
  industry: ['M3 20V9l6 3V9l6 3V5h4v15Z', 'M3 20h18'],
  world: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M3 12h18', 'M12 3c3 3 3 15 0 18', 'M12 3c-3 3-3 15 0 18'],
  rail: ['M6 3h12v13H6z', 'M8 20l2-4', 'M16 20l-2-4', 'M6 8h12', 'M9 6h6'],
  pause: ['M8 5v14', 'M16 5v14'],
  resume: ['M8 5l11 7-11 7Z'],
  shortcuts: ['M3 6h18v12H3z', 'M6 10h.01', 'M9 10h.01', 'M12 10h.01', 'M15 10h.01', 'M18 10h.01', 'M7 14h10'],
  alerts: ['M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z', 'M10 20a2 2 0 0 0 4 0'],
  menu: ['M4 7h16', 'M4 12h16', 'M4 17h16'],
  day: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z', 'M12 7v5l3 2'],
  cash: ['M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z', 'M4 7v10c0 1.7 3.6 3 8 3s8-1.3 8-3V7', 'M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  close: ['M6 6l12 12', 'M18 6L6 18']
};
```

The `Record` annotation is the exhaustiveness guarantee.

- [ ] **Step 3: Create `GameIcon.svelte` with base styling**

```svelte
<script lang="ts">
  import { ICON_PATHS, type GameIconName } from './gameNavigation';

  let { name }: { name: GameIconName } = $props();
</script>

<svg viewBox="0 0 24 24" aria-hidden="true" data-icon={name}>
  {#each ICON_PATHS[name] as d}
    <path {d} />
  {/each}
</svg>

<style>
  svg {
    display: block;
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
```

This style is required because Day/Cash and workspace-header icons are not necessarily descendants of `.btn-icon`.

- [ ] **Step 4: Type the route's existing menu config once**

Delete the route-local `ManagementPanelMenuItem` interface. Import the shared type and type the existing list:

```ts
const managementPanelMenuConfig: Array<Omit<ManagementPanelMenuItem, 'label'>> = [
  { id: 'dashboard', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.dashboard, icon: 'dashboard' },
  { id: 'policies', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.policies, icon: 'policies' },
  { id: 'staff', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.staff, icon: 'staff' },
  { id: 'stores', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.stores, icon: 'stores' },
  { id: 'decisions', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.decisions, icon: 'decisions' },
  { id: 'reports', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.reports, icon: 'reports' },
  { id: 'productChains', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.productChains, icon: 'productChains' },
  { id: 'finance', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.finance, icon: 'finance' },
  { id: 'logistics', shortcut: MANAGEMENT_PANEL_SHORTCUT_KEY.logistics, icon: 'logistics' }
];
```

Keep the current derived localization mapping and return `ManagementPanelMenuItem[]`.

- [ ] **Step 5: Make `ControlDesk` consume the shared type**

Delete its local `ManagementItem` interface, import `ManagementPanelMenuItem`, and type `managementItems` as `ManagementPanelMenuItem[]`.

Every current destination has a shortcut. Remove the optional-shortcut rendering branch and delete the component test that only covers a shortcut-less hypothetical item. Update all fixtures with `icon` values.

- [ ] **Step 6: Verify Task 1**

Run:

```bash
bun run test:unit -- \
  src/lib/components/game/GameIcon.svelte.spec.ts \
  src/lib/components/game/ControlDesk.svelte.spec.ts \
  --run
bun run check
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add \
  src/lib/components/game/gameNavigation.ts \
  src/lib/components/game/GameIcon.svelte \
  src/lib/components/game/GameIcon.svelte.spec.ts \
  src/lib/components/game/ControlDesk.svelte \
  src/lib/components/game/ControlDesk.svelte.spec.ts \
  src/routes/+page.svelte
git commit -m "feat(ui): add shared game navigation metadata"
```

---

## Task 2: Replace the footer with a reserved gameplay rail/dock and migrate old layout contracts

**Files:**
- Modify: `src/lib/styles/tokens.css`
- Modify: `src/lib/styles/frames.css`
- Modify: `src/lib/components/game/ControlDesk.svelte`
- Modify: `src/lib/components/game/ControlDesk.svelte.spec.ts`
- Modify: `src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts`
- Modify: `src/routes/MapSurfaceHost.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

**Consumes:** `GameIcon`, `ManagementPanelMenuItem` from Task 1.

**Preserves callbacks:** `onBuild`, `onOpenManagement`, `onToggleRailBuild`, `onTogglePause`, `onSelectSpeed`, `onOpenShortcuts`.

- [ ] **Step 1: Rewrite the three ControlDesk test assumptions that the new chrome invalidates**

Update the hotkey-name test from accessible names containing the key to label + title:

```ts
it('keeps management labels accessible and exposes their hotkeys in titles', async () => {
  expect.assertions(4);
  render(ControlDesk, baseProps());

  const dashboard = page.getByRole('button', { name: /^dashboard$/i });
  const policies = page.getByRole('button', { name: /^policies$/i });

  await expect.element(dashboard).toBeVisible();
  await expect.element(dashboard).toHaveAttribute('title', 'Dashboard (O)');
  await expect.element(policies).toBeVisible();
  await expect.element(policies).toHaveAttribute('title', 'Policies (P)');
});
```

Replace the visible `?` keycap test with icon/callback behavior:

```ts
it('opens shortcut help from the icon launcher', async () => {
  expect.assertions(2);
  const onOpenShortcuts = vi.fn();
  render(ControlDesk, { ...baseProps(), onOpenShortcuts });

  const button = page.getByRole('button', { name: /shortcuts/i });
  await expect.element(page.locator('svg[data-icon="shortcuts"]')).toBeVisible();
  await button.click();
  expect(onOpenShortcuts).toHaveBeenCalledOnce();
});
```

Delete the shortcut-less management-item test from Task 1's type cutover; every current destination has a shortcut.

Add real compact evidence:

```ts
it('keeps management destinations reachable in the compact dock', async () => {
  expect.assertions(3);
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

Expected: FAIL on the new icon/title/compact contract.

- [ ] **Step 2: Put shared layout dimensions in `tokens.css`**

Add inside the existing `:root` block:

```css
--control-desk-rail-width: 5rem;
--control-desk-compact-height: 5.75rem;
```

Do not create a second `:root` block in `frames.css`.

- [ ] **Step 3: Reuse `.btn-icon` and add only the Build modifier**

Add to `frames.css` after the existing `.btn-icon` rules:

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

Do not change `.seal`.

- [ ] **Step 4: Implement the 5rem desktop rail and 5.75rem compact dock**

Change `ControlDesk` from the current full-width footer to a left rail. The component-specific CSS must use these exact targets:

```css
.control-desk {
  position: fixed;
  top: 5.5rem;
  bottom: 1rem;
  left: 0;
  width: var(--control-desk-rail-width);
  padding: 0.75rem;
}

.control-desk .btn-icon {
  width: 3.5rem;
  height: 3.5rem;
}

.manage {
  gap: 0.625rem;
  overflow-y: auto;
}
```

Use `GameIcon` for Build, Rail Build, management destinations, Pause/Resume, and shortcut help. Keep `1×`, `2×`, `5×` as text.

At `max-width: 980px`, remove the old `.manage { display: none; }` behavior and turn the same action set into a horizontal fixed bottom dock:

```css
@media (max-width: 980px) {
  .control-desk {
    top: auto;
    right: 0;
    bottom: 0;
    width: auto;
    min-height: var(--control-desk-compact-height);
    padding: 0.75rem;
    overflow-x: auto;
    overflow-y: hidden;
  }
}
```

Keep safe-area padding inside the declared occupied height rather than creating an untracked extra overlap zone.

- [ ] **Step 5: Reserve map space in `MapSurfaceHost` in the same commit**

Split the current combined `.map-surfaces, .map-surface` rule so the host can reserve the HUD footprint while each child still fills its host:

```css
.map-surfaces {
  position: absolute;
  inset: 0 0 0 var(--control-desk-rail-width);
  min-width: 0;
  min-height: 0;
}

.map-surface {
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
  pointer-events: none;
  visibility: hidden;
}

@media (max-width: 980px) {
  .map-surfaces {
    inset: 0 0 var(--control-desk-compact-height) 0;
  }
}
```

Keep `.active-map-surface` behavior unchanged.

Do not alter map snapshots, camera code, tile coordinates, or the canvas click helper. Existing click math is relative to the actual canvas bounding box and should remain valid after the canvas rectangle changes.

- [ ] **Step 6: Remove duplicate Management navigation from the hamburger**

In `+page.svelte`'s `TopBar` `menuContent`, delete the complete Management section that currently renders `managementPanelMenuItems` inside `GameMenu`.

Do not replace it with another compact-only menu list. The compact dock is now the single management-navigation surface.

Keep Saves, scenario actions, audio, language, and other non-management menu content unchanged.

- [ ] **Step 7: Replace the footer-only E2E helper with rectangle non-overlap**

Rename `expectActionAboveControlDesk` to `expectActionDoesNotOverlapControlDesk`:

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

Update the dedicated route/retail/industry clearance test to call the renamed helper and rename the test to:

```text
inspector clearance keeps route, retail, and industry actions clear of gameplay controls
```

Keep its existing 1000×800 fixture and nine-management-button count.

- [ ] **Step 8: Delete old inline footer geometry instead of migrating duplicates**

In the existing store-detail route test, remove the inline `openDetailsBottom <= controlDeskBox.y` bounding-box block. Keep the following `openStoreDetail(page)` click; Playwright itself verifies the control is pointer-reachable.

Delete the entire test named:

```text
store card Open Details clears the three-row control desk just above compact mode
```

That test exists solely for the 981–1023px footer-wrap layout that Task 2 removes.

Keep the existing 960×720 `store card Open Details stays reachable above control desk...` journey as a real click-based compact regression, updating wording only if it still says “above” rather than “clear of”.

- [ ] **Step 9: Rewrite the 960px hamburger-management fallback test as dock reachability**

Replace the old test with:

```ts
test('keeps management panels reachable from the compact dock', async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 720 });
  await page.goto('/');
  await expectRetailMapReady(page);

  const desk = page.getByLabel('Control desk');
  const management = desk.getByRole('group', { name: /management/i });
  await expect(management).toBeVisible();

  await management.getByRole('button', { name: /^policies$/i }).click();
  await expect(page.getByRole('dialog', { name: /^policies$/i })).toBeVisible();
  await expect(page.getByRole('dialog', { name: /^menu$/i })).toHaveCount(0);
});
```

- [ ] **Step 10: Run the high-risk cutover gate, including `time-flow.e2e.ts`**

Run:

```bash
bun run test:unit -- \
  src/lib/components/game/ControlDesk.svelte.spec.ts \
  src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts \
  --run
bun run check
bun run test:e2e
```

Expected: PASS. The full E2E run is required here because `time-flow.e2e.ts` directly drives Menu, Pause/Resume, and speeds while `retail-sim.e2e.ts` exercises canvas clicks and inspectors.

- [ ] **Step 11: Commit Task 2**

```bash
git add \
  src/lib/styles/tokens.css \
  src/lib/styles/frames.css \
  src/lib/components/game/ControlDesk.svelte \
  src/lib/components/game/ControlDesk.svelte.spec.ts \
  src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts \
  src/routes/MapSurfaceHost.svelte \
  src/routes/+page.svelte \
  src/routes/retail-sim.e2e.ts
git commit -m "feat(ui): reserve gameplay rail and compact dock"
```

---

## Task 3: Move map switching into `TopBar` and migrate menu-owned E2E helpers

**Files:**
- Modify: `src/lib/components/game/TopBar.svelte`
- Modify: `src/lib/components/game/TopBar.svelte.spec.ts`
- Modify: `src/lib/components/game/GameMenu.svelte`
- Modify: `src/lib/components/game/GameMenu.svelte.spec.ts`
- Modify: `src/routes/retail-sim.e2e.ts`

**Preserves in `TopBar`:** active map view, `onSelectView`, location/day/cash, alerts, locale/menu wiring.

**Removes from `GameMenu`:** active map view, `onSelectView`, map-view list/markup/CSS.

- [ ] **Step 1: Write direct-map TopBar coverage with exact existing names**

Add:

```ts
it('switches map views directly from the top HUD', async () => {
  expect.assertions(4);
  const onSelectView = vi.fn();
  render(TopBar, { ...baseProps(), activeMapView: 'retail', onSelectView });

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

Run the focused TopBar spec and confirm RED before implementation.

- [ ] **Step 2: Change the GameMenu component contract test**

Open Menu and assert language/menu content remains, but the Menu dialog contains no buttons named `Retail City Map`, `Industry City Map`, or `World Map`.

Use explicit `expect.assertions(n)` consistent with the current browser specs.

- [ ] **Step 3: Implement direct map controls and shared icons in `TopBar`**

Use these exact entries:

```ts
const mapViews = [
  { id: 'retail', icon: 'retail', label: i18n.t('route.mapEyebrow.retail') },
  { id: 'industry', icon: 'industry', label: i18n.t('route.mapEyebrow.industry') },
  { id: 'world', icon: 'world', label: i18n.t('route.mapEyebrow.world') }
] as const;
```

Each button uses `.btn-icon`, `aria-label={view.label}`, `aria-pressed={activeMapView === view.id}`, and `onclick={() => onSelectView(view.id)}`.

Use `GameIcon` for map controls, Day, Cash, and Alerts. Day/Cash icons are decorative only; keep existing values and formatters.

- [ ] **Step 4: Remove map switching from `GameMenu` and reuse `GameIcon` for hamburger**

Delete the menu's `MapViewId` dependency, map props, `views` list, `selectView`, view-tab section, and view-tab CSS.

Replace the inline hamburger SVG with:

```svelte
<GameIcon name="menu" />
```

Keep language selection, route-provided menu content, focus trap, outside-click dismissal, and Escape behavior.

- [ ] **Step 5: Replace `openMapMenuItem` in route E2E**

Use one direct helper:

```ts
async function selectMapView(page: Page, itemName: RegExp): Promise<void> {
  await page.getByRole('button', { name: itemName }).click();
}
```

Rename all existing call sites and remove comments that say map tabs live in the popover.

- [ ] **Step 6: Rewrite menu-state assertions that used map-button presence**

After shortcut `2`, assert the always-visible Industry control has `aria-pressed="true"`.

For “Escape toggles hamburger”, use Menu itself:

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

Change logistics-navigation setup that currently locates World inside the Menu dialog to `selectMapView(page, /world map/i)`.

- [ ] **Step 7: Verify Task 3 against both route files that exercise Menu/HUD**

Run:

```bash
bun run test:unit -- \
  src/lib/components/game/TopBar.svelte.spec.ts \
  src/lib/components/game/GameMenu.svelte.spec.ts \
  --run
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts src/routes/time-flow.e2e.ts
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

## Task 4: Recompose inspectors and bind compact clearance to the dock token

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

- [ ] **Step 1: Keep inspector behavior tests as characterization, then add only new accessible visual structure**

For `TileInspector.svelte.spec.ts`, retain current callback/disabled/detail assertions and add evidence that a selected store renders its existing art and its three existing vitals. Use existing store fixtures/read data; do not add a mock history model.

For industry/rail/logistics specs, preserve all existing action/callback assertions. Add shell-level assertions only for markup actually introduced, such as the shared close control accessible name or stable region heading.

Run these four focused specs before markup changes and record the green characterization baseline.

- [ ] **Step 2: Recompose retail inspector around existing data**

Use the existing `getStoreArt` / `asset()` path and current store/report values. The selected-store order is:

```text
220px art region at reference desktop
store identity + location overlay/header
revenue / stock health / staff morale vitals
attention callout when present
level + next benefit
Upgrade + Details actions
```

At 1920×1080, target 392px width, 96px top, 16px right. Empty-tile content keeps its current demand/rent/foot-traffic/customer-fit values.

No new domain/read-model field is permitted.

- [ ] **Step 3: Apply the same outer language to industry, rail, and logistics inspectors**

Use paper frame, compact header/close treatment, existing metrics, and existing action hierarchy. Do not merge them into a generic inspector component and do not change callback contracts.

- [ ] **Step 4: Remove obsolete desktop footer offsets in `MapInspectorHost`**

Replace the footer-wrap geometry with the reference desktop geometry:

```css
.inspector-overlay {
  position: absolute;
  top: 6rem;
  right: 1rem;
  bottom: 1rem;
  width: min(24.5rem, calc(100% - 2rem));
}
```

Delete the 981–1023px special bottom offset entirely.

At compact widths, keep the existing fixed/bottom-sheet concept but use the shared dock token:

```css
@media (max-width: 980px) {
  .inspector-overlay {
    position: fixed;
    inset: auto 0 calc(var(--control-desk-compact-height) + 0.5rem) 0;
    width: auto;
    max-height: calc(100dvh - var(--control-desk-compact-height) - 6.5rem);
  }
}
```

Do not introduce another compact-height constant.

- [ ] **Step 5: Add one compact route clearance journey at 760×800**

Reuse `logisticsRouteNavigationGame()` so the fixture definitely contains a retail store:

```ts
test('keeps retail inspector actions clear of the compact gameplay dock', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 800 });
  await installSandboxAutoSave(page, logisticsRouteNavigationGame());

  const canvas = await expectRetailMapReady(page);
  const game = await readAutoSaveGame(page);
  const store = game.stores[0];

  if (!store) throw new Error('Missing starter store for compact inspector test');

  await clickCanvasTile(page, canvas, store.mapX, store.mapY);
  const inspector = page.getByRole('dialog', { name: /tile details/i });
  const details = inspector.getByRole('button', { name: /open details/i });

  await expect(details).toBeVisible();
  await expectActionDoesNotOverlapControlDesk(page, details);
  await details.click();
  await expect(page.locator('[role="dialog"][aria-modal="true"]')).toBeVisible();
});
```

Do not create a geometry-only game fixture.

- [ ] **Step 6: Verify Task 4**

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

- [ ] **Step 7: Commit Task 4**

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

## Task 5: Build a stable parchment management workspace and centralize generic panel entry

**Files:**
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte.spec.ts`
- Modify: `src/lib/components/game/Scorecard.svelte`
- Modify: `src/lib/components/game/Scorecard.svelte.spec.ts`
- Modify: `src/routes/retail-sim.e2e.ts`

**Consumes:** the shared `ManagementPanelMenuItem[]` and `GameIcon` from Task 1.

- [ ] **Step 1: Write failing management-rail component coverage**

Add to `ManagementPanelHost.svelte.spec.ts`:

```ts
it('delegates shared workspace navigation without owning panel state', async () => {
  expect.assertions(3);
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
  await expect.element(page.locator('svg[data-icon="finance"]')).toBeVisible();
});
```

Keep current shell/backdrop/close, stores/decisions composition, finance invariant, and mutation callback coverage.

Run the focused host spec and confirm RED.

- [ ] **Step 2: Centralize generic Logistics entry semantics in `openManagementPanel`**

Change the route function so generic panel selection always clears logistics focus/preset before selecting the panel:

```ts
function openManagementPanel(panelId: ManagementPanelId): void {
  isGameMenuOpen = false;
  isSavePanelOpen = false;
  isBuildMenuOpen = false;
  focusedLogisticsRouteId = null;
  logisticsRoutePreset = null;
  if (panelId !== 'stores') {
    focusedRetailSupplyCityId = null;
  }
  activeManagementPanelId = panelId;
}
```

Keep the focused Logistics entry point:

```ts
function openLogisticsManagement(
  routeId: string | null = null,
  preset: RecurringRouteInput | null = null
): void {
  openManagementPanel('logistics');
  focusedLogisticsRouteId = routeId;
  logisticsRoutePreset = preset;
}
```

Route-specific inspector/alert flows that intentionally focus a route continue to call `openLogisticsManagement`.

- [ ] **Step 3: Delete generic-UI Logistics ternaries**

Use `openManagementPanel` directly for route management shortcuts and `ControlDesk`:

```ts
openManagementPanel(action.panel);
```

and:

```svelte
<ControlDesk onOpenManagement={openManagementPanel} />
```

The hamburger management list was removed in Task 2, so there is no menu ternary to preserve.

The new workspace rail also receives:

```svelte
onSelectPanel={openManagementPanel}
```

- [ ] **Step 4: Remove the route-level management `{#key}`**

Mount one stable host while a panel is open. Preserve the current `panelGame`, `retailSupplyViews`, finance metrics, mutation bag, focused route/store inputs, and all callbacks. Add only:

```svelte
managementItems={managementPanelMenuItems}
onSelectPanel={openManagementPanel}
```

Do not key `ManagementPanelHost` by panel ID.

- [ ] **Step 5: Build the numeric workspace shell in `ManagementPanelHost`**

Use:

```css
.control-tower-overlay {
  width: min(74rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
}

.workspace-grid {
  display: grid;
  grid-template-columns: 5rem minmax(0, 1fr);
  min-height: 0;
}

.workspace-rail {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  padding: 0.75rem;
  overflow-y: auto;
}

.workspace-content {
  min-width: 0;
  min-height: 0;
  padding: 1rem;
  overflow: auto;
}
```

Render each shared item as `.btn-icon` + `GameIcon`, with `aria-pressed={item.id === panelId}`, `aria-label={item.label}`, and `title={`${item.label} (${item.shortcut})`}`.

Keep one modal dialog, backdrop, focus trap, header/day/cash, and close control mounted.

- [ ] **Step 6: Key only the complete existing body switch**

Wrap the **entire current explicit panel conditional block** in `{#key panelId}` inside `.workspace-content`. Move every current branch—dashboard, policies, staff, stores, decisions, reports, product chains, finance, logistics—inside that keyed body without converting it to dynamic components or omitting any current child/callback.

The dialog shell, workspace rail, header, and focus trap stay outside the key.

- [ ] **Step 7: Upgrade only `Scorecard` body presentation**

Keep its existing `Scorecard` prop and four values:

```text
profit
customerSatisfaction
staffMorale
marketPosition
```

Restyle the four summaries as parchment/gauge cards. Preserve accessible labels and meter/value semantics so the existing `Scorecard.svelte.spec.ts` continues to prove all four numeric values. Do not add history or a new score model.

- [ ] **Step 8: Scope the E2E helper that initially opens management panels to ControlDesk**

Change the current test-local helper to:

```ts
async function openManagementPanel(page: Page, panelName: RegExp): Promise<Locator> {
  const desk = page.getByLabel('Control desk');
  await desk.getByRole('button', { name: panelName }).click();
  const dialog = page.getByRole('dialog', { name: panelName });
  await expect(dialog).toBeVisible();
  return dialog;
}
```

This prevents duplicate names from the gameplay rail and workspace rail from making page-level locators ambiguous.

Once the workspace is open, all internal destination clicks are dialog-scoped.

- [ ] **Step 9: Add route E2E for in-place panel switching and focus containment**

Open Dashboard through the scoped helper, then switch inside the dialog:

```ts
let dialog = await openManagementPanel(page, /^dashboard$/i);
await dialog.getByRole('button', { name: /^finance$/i }).click();

dialog = page.getByRole('dialog', { name: /^finance$/i });
await expect(dialog).toBeVisible();
await expect(dialog.getByRole('button', { name: /^finance$/i })).toHaveAttribute(
  'aria-pressed',
  'true'
);

await expect
  .poll(() =>
    page.evaluate(() => {
      const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
      return Boolean(modal && document.activeElement && modal.contains(document.activeElement));
    })
  )
  .toBe(true);
```

Do not use page-level Dashboard/Finance locators after the workspace is open.

- [ ] **Step 10: Verify Task 5**

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

- [ ] **Step 11: Commit Task 5**

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

## Task 6: Pin final viewport parity and run the complete verification ladder

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify only a HPA-304 file above if final verification exposes a scoped defect.

**Reuse these helpers; do not create another geometry/navigation system:**

```text
selectMapView(...)
expectActionDoesNotOverlapControlDesk(...)
openManagementPanel(...) scoped to ControlDesk
```

- [ ] **Step 1: Add explicit 1920×1080 and 1280×800 HUD journeys**

Use the existing `logisticsRouteNavigationGame()` autosave fixture already present in `retail-sim.e2e.ts`:

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

Do not create a new viewport-only game fixture.

- [ ] **Step 2: Reuse the one non-overlap helper at 1280×800**

Switch back to Retail, open the starter-store inspector from the same fixture, and call `expectActionDoesNotOverlapControlDesk` on `Open details` before clicking it.

Do not add an “above rail” or a second bounding-box helper.

- [ ] **Step 3: Reuse dialog-scoped workspace navigation**

Open Dashboard through the scoped test helper and switch to Reports inside the dialog. Assert the Reports rail button is pressed and the dialog remains visible.

- [ ] **Step 4: Run the complete focused browser suite**

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

- [ ] **Step 5: Run project checks and the full unit suite**

```bash
bun run check
bun run lint
bun run test:unit -- --run
```

Expected: PASS.

- [ ] **Step 6: Run the full E2E suite**

```bash
bun run test:e2e
```

Expected: PASS, including `retail-sim.e2e.ts` and `time-flow.e2e.ts`.

- [ ] **Step 7: Perform the self-contained visual/layout review**

No external mock file is required. Verify the numeric contract from the design spec at 1920×1080 and 1280×800:

```text
rail reserved width        80px
rail medallion              56px
rail gap                    10px
TopBar alert/menu           44px
retail inspector            392px wide, 96px top, 16px right at reference size
workspace columns           80px + flexible content
compact dock                92px occupied height
```

Also verify visually:

- the map begins outside the left rail and above the compact dock footprint;
- Build is the only moss-primary gameplay medallion;
- Day/Cash have no fabricated trend/history;
- store inspector is art-led but actions remain obvious;
- workspace rail/header/body hierarchy is stable during panel switching;
- all content remains operable at 1280×800.

- [ ] **Step 8: Commit final integration only if Task 6 added/adjusted code**

```bash
git add src/routes/retail-sim.e2e.ts
git commit -m "test(ui): pin gameplay revamp integration"
```

If Task 6 produced no diff, skip the empty commit.

---

## Final PR checklist

- [ ] HPA-304 is the only Linear ticket and implementation PR for this revamp.
- [ ] `MapSurfaceHost` reserves the desktop rail and compact dock footprint; Phaser/domain coordinates remain unchanged.
- [ ] `tokens.css` owns `--control-desk-rail-width` and `--control-desk-compact-height`.
- [ ] `.btn-icon` remains the shared brass primitive; `.btn-icon-primary` is the small Build modifier.
- [ ] `gameNavigation.ts` owns `GameIconName`, exhaustive `ICON_PATHS`, and `ManagementPanelMenuItem`.
- [ ] `GameIcon` has its own base SVG size/stroke style and every icon key is tested.
- [ ] `ControlDesk` exposes all nine management destinations at desktop and compact widths.
- [ ] The hamburger no longer duplicates management navigation.
- [ ] Old inline footer-geometry assertions and the obsolete three-row-footer test are removed.
- [ ] The compact route test proves management is available from the dock rather than the hamburger.
- [ ] TopBar owns Retail / Industry / World switching with `route.mapEyebrow.*` names.
- [ ] Menu-state E2E no longer uses map-tab presence/absence.
- [ ] Inspector clearance uses one non-overlap helper and the shared compact-dock height.
- [ ] The route-level management `{#key}` is removed; only the complete host body switch is keyed.
- [ ] Generic management entry clears logistics focus/preset; route-focused entry still uses `openLogisticsManagement`.
- [ ] Initial management E2E launchers are scoped to ControlDesk; internal launchers are scoped to the dialog.
- [ ] Only Scorecard receives deliberate panel-body redesign; no fabricated analytics exist.
- [ ] 414×800, 760×800, 1280×800, and 1920×1080 evidence is present.
- [ ] `bun run check` passes.
- [ ] `bun run lint` passes.
- [ ] Focused browser tests pass.
- [ ] Full unit suite passes.
- [ ] Full E2E suite passes, including `time-flow.e2e.ts`.