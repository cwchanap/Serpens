# Gameplay HUD and Management Panel Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Implement all tasks in the single HPA-304 PR.

**Goal:** Ship the approved art-forward Serpens gameplay HUD, map inspector treatment, and parchment management workspace without changing game-domain behavior or introducing a new UI/state framework.

**Architecture:** Keep `+page.svelte` as the route composition/shortcut/command owner, `GameRouteController` as the command/persistence coordinator, the HPA-568 route-local hosts as the presentation boundaries, and Phaser as the map renderer. Add only a small typed inline-SVG icon primitive; reuse the current management item list in both gameplay and management navigation.

**Tech Stack:** Svelte 5.55 runes, TypeScript 6, SvelteKit 2.57, Vitest 4 browser mode, Playwright 1.59, Phaser 4.1, existing Serpens i18n and parchment/brass CSS tokens.

**Spec:** `docs/superpowers/specs/2026-09-01-gameplay-ui-revamp-design.md`

## Global Constraints

- Follow the approved Vitrine/brass-medallion + art-forward direction documented in the spec.
- One HPA-304 implementation PR only; task commits are checkpoints inside that PR.
- `GameState` remains authoritative domain state.
- `GameRouteController` remains the route command/persistence coordinator.
- `+page.svelte` keeps active map view, active management panel, selections, command handlers, global shortcuts, and Escape priority.
- Reuse `MapSurfaceHost.svelte`, `MapInspectorHost.svelte`, and `ManagementPanelHost.svelte`; do not add `MapWorkspace` or a replacement host framework.
- Do not add a Svelte context/global store, event bus, generic modal/panel/inspector registry, second controller, or design-system package.
- Do not modify simulation rules, persistence/save schema, scenario semantics, game-domain types, or Phaser snapshots to make the UI easier to render.
- Do not add historical cash/trend/analytics data solely to imitate decorative mock values.
- Reuse existing i18n labels before adding new translation keys.
- Reuse existing `tokens.css` values and `frames.css` primitives; no parallel theme system and no runtime HUD-variant selector.
- Preserve existing keyboard shortcuts and route-owned Escape ordering.
- Keep icon-only actions accessible with localized names and discoverable with label/hotkey title or tooltip text.
- Treat 1920×1080 as reference parity and 1280×800 as the desktop regression target.
- At compact widths, favor complete action access over pixel parity; do not build a separate mobile architecture.
- Run focused tests after each task and `retail-sim.e2e.ts` after every route-visible cutover.

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
- `src/lib/components/game/IndustryTileInspector.svelte` and its spec only where shared shell treatment requires it
- `src/lib/components/game/RailSegmentInspector.svelte` and its spec only where shared shell treatment requires it
- `src/lib/components/game/LogisticsRouteInspector.svelte` and its spec only where shared shell treatment requires it
- `src/lib/components/game/Scorecard.svelte`
- `src/lib/styles/frames.css`

### Must remain behaviorally unchanged

- `src/routes/gameRouteController.ts`
- `src/lib/game/**`
- `src/lib/persistence/**`
- Phaser scene/snapshot logic under `src/lib/phaser/**` and `src/lib/game/*MapRender.ts`
- scenario lifecycle and save semantics

---

## Task 1: Add the typed local icon vocabulary and shared management metadata

**Files:**
- Create: `src/lib/components/game/gameIcon.ts`
- Create: `src/lib/components/game/GameIcon.svelte`
- Create: `src/lib/components/game/GameIcon.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`

**Interfaces:**

Use one closed icon-name union. Keep it presentation-only:

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
  | 'menu';
```

`GameIcon.svelte` accepts only `{ name: GameIconName }`, renders one inline SVG, and marks the SVG `aria-hidden="true"`; accessible naming stays on the owning button.

Extend the route-local management item shape:

```ts
interface ManagementPanelMenuItem {
  id: ManagementPanelId;
  label: string;
  shortcut: string;
  icon: GameIconName;
}
```

Add the icon to the existing `managementPanelMenuConfig`; do not create a second management destination list.

- [ ] **Step 1: Write the icon contract test**

Create `GameIcon.svelte.spec.ts` before the component exists. Render representative names from each family (`dashboard`, `retail`, `pause`) and assert:

- one SVG is rendered per component;
- the SVG is `aria-hidden="true"`;
- the rendered SVG exposes a stable `data-icon={name}` marker for debugging/test selection.

Example:

```ts
it('renders the requested decorative icon without owning accessible text', async () => {
  render(GameIcon, { name: 'dashboard' });
  const icon = page.locator('svg[data-icon="dashboard"]');
  await expect.element(icon).toBeInTheDocument();
  await expect.element(icon).toHaveAttribute('aria-hidden', 'true');
});
```

Run:

```bash
bun run test:unit -- src/lib/components/game/GameIcon.svelte.spec.ts --run
```

Expected: FAIL because `GameIcon.svelte` does not exist yet.

- [ ] **Step 2: Implement the smallest local icon primitive**

Create the union in `gameIcon.ts` and the Svelte component with explicit `{#if}` / `{:else if}` SVG path branches. Keep paths local and static. Do not add dynamic imports, an icon registry class, external assets, or dependencies.

Each branch uses the same view box and stroke/fill conventions so button CSS controls size/color.

- [ ] **Step 3: Add icon IDs to the existing route menu config**

In `+page.svelte`, import `type GameIconName` and extend the existing `managementPanelMenuConfig` entries with the matching semantic icon.

Do not change ordering, IDs, labels, or shortcuts.

- [ ] **Step 4: Verify**

Run:

```bash
bun run test:unit -- src/lib/components/game/GameIcon.svelte.spec.ts --run
bun run check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/components/game/gameIcon.ts src/lib/components/game/GameIcon.svelte src/lib/components/game/GameIcon.svelte.spec.ts src/routes/+page.svelte
git commit -m "feat(ui): add shared game icon vocabulary"
```

---

## Task 2: Revamp `ControlDesk` into the Vitrine gameplay rail

**Files:**
- Modify: `src/lib/components/game/ControlDesk.svelte`
- Modify: `src/lib/components/game/ControlDesk.svelte.spec.ts`
- Modify: `src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts`
- Modify: `src/lib/styles/frames.css`

**Interfaces:**

Extend `ControlDesk`'s existing internal management item shape with `icon: GameIconName`. Keep all existing props/callbacks:

```text
Build -> onBuild
management item -> onOpenManagement(id)
Rail Build -> onToggleRailBuild
Pause/Resume -> onTogglePause
1x/2x/5x -> onSelectSpeed
Shortcuts -> onOpenShortcuts
```

No action moves into the component.

- [ ] **Step 1: Update the component specs to describe the new interaction surface**

Before changing markup, update `ControlDesk.svelte.spec.ts` fixtures to include icons and add assertions that:

- Build is still reachable by accessible name and calls `onBuild`;
- each management destination is an icon button reachable by its localized label;
- each management button exposes its shortcut in `title` text (for example `Dashboard (O)`), rather than relying on permanently visible keycap text;
- management callbacks still receive the same `ManagementPanelId`;
- Rail Build keeps `aria-pressed` and disabled behavior;
- compact layout still contains management navigation instead of hiding it entirely.

Update `ControlDesk.timeControls.svelte.spec.ts` only as needed for new accessible names/markup while preserving existing pause/speed semantics.

Run:

```bash
bun run test:unit -- src/lib/components/game/ControlDesk.svelte.spec.ts src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts --run
```

Expected: FAIL on the new icon/title/compact-navigation expectations.

- [ ] **Step 2: Implement the desktop rail**

Change the fixed footer into a fixed left rail below the top HUD. Use `GameIcon` for Build and management destinations.

Keep three visual groups:

```text
primary: Build (+ Rail Build when applicable)
management: current management items
simulation: pause/resume, speed, shortcut help
```

Use the Vitrine brass-medallion treatment for management buttons and moss emphasis for Build. Extend `frames.css` with only repeated rail/medallion primitives if both gameplay and management workspace will reuse them; otherwise keep component-specific layout CSS in `ControlDesk.svelte`.

Do not add local open-panel state.

- [ ] **Step 3: Implement compact behavior without hiding navigation**

Replace the old `@media (max-width: 980px) { .manage { display: none; } }` behavior.

At compact widths, turn the same action set into a horizontally scrollable bottom dock/strip. Reuse the same buttons and callbacks; do not duplicate a second markup tree unless CSS alone cannot express the layout.

At short desktop heights, allow the management group itself to scroll rather than shrinking hit targets below a usable size.

- [ ] **Step 4: Keep disabled-copy behavior local and readable**

Preserve `disabledReason` behavior, but position it so it does not create a large permanent footer. A compact status bubble/line adjacent to the rail is sufficient.

- [ ] **Step 5: Verify focused behavior and route integration**

Run:

```bash
bun run test:unit -- src/lib/components/game/ControlDesk.svelte.spec.ts src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts --run
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: all pass; existing route keyboard and game actions still work even though the visible chrome moved.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/lib/components/game/ControlDesk.svelte src/lib/components/game/ControlDesk.svelte.spec.ts src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts src/lib/styles/frames.css
git commit -m "feat(ui): revamp gameplay control rail"
```

---

## Task 3: Move map switching into the top HUD and simplify `GameMenu`

**Files:**
- Modify: `src/lib/components/game/TopBar.svelte`
- Modify: `src/lib/components/game/TopBar.svelte.spec.ts`
- Modify: `src/lib/components/game/GameMenu.svelte`
- Modify: `src/lib/components/game/GameMenu.svelte.spec.ts`

**Interfaces:**

`TopBar` already receives:

```ts
activeMapView: MapViewId;
onSelectView: (view: MapViewId) => void;
```

Keep those props and consume them directly in `TopBar`.

Remove map-view ownership from `GameMenu`:

```diff
- activeMapView: MapViewId;
- onSelectView: (view: MapViewId) => void;
```

`GameMenu` continues to own locale selection, route-provided menu content, open state, focus trap, outside-click dismissal, and Escape dismissal.

- [ ] **Step 1: Write failing TopBar tests for direct map controls**

In `TopBar.svelte.spec.ts`, add one test that renders all three map-view buttons without opening the menu, asserts the current view with `aria-pressed="true"`, clicks Industry, and expects `onSelectView('industry')`.

Keep the existing location/day/cash and alert tests.

Run:

```bash
bun run test:unit -- src/lib/components/game/TopBar.svelte.spec.ts --run
```

Expected: FAIL because direct view buttons are not currently in `TopBar`.

- [ ] **Step 2: Update the GameMenu contract test**

Change `GameMenu.svelte.spec.ts` to assert that opening the menu exposes locale/menu content but no Retail / Industry / World view-tab group.

This should fail until the map-view markup and props are removed.

- [ ] **Step 3: Implement the compact top status composition**

In `TopBar.svelte`:

- keep location plaque/title;
- add a three-button map-view group using `GameIcon` and current localized map labels;
- keep Day and Cash using existing formatters and add decorative icons only;
- keep alerts and menu exactly as interactive features;
- use `aria-pressed` for the active map view;
- keep pointer-event behavior so the HUD does not block the rest of the map.

Do not add cash-history/trend props.

- [ ] **Step 4: Remove map controls from `GameMenu`**

Delete the `views` list, map-view props, `selectView`, and view-tab markup/CSS. Keep language selection and `menuContent` unchanged.

Update the `GameMenu` call inside `TopBar` accordingly.

- [ ] **Step 5: Verify focused tests and route navigation**

Run:

```bash
bun run test:unit -- src/lib/components/game/TopBar.svelte.spec.ts src/lib/components/game/GameMenu.svelte.spec.ts --run
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/lib/components/game/TopBar.svelte src/lib/components/game/TopBar.svelte.spec.ts src/lib/components/game/GameMenu.svelte src/lib/components/game/GameMenu.svelte.spec.ts
git commit -m "feat(ui): promote map navigation into top hud"
```

---

## Task 4: Recompose the map inspectors and remove old footer-dependent geometry

**Files:**
- Modify: `src/lib/components/game/TileInspector.svelte`
- Modify: `src/lib/components/game/TileInspector.svelte.spec.ts`
- Modify: `src/lib/components/game/IndustryTileInspector.svelte` and spec if needed
- Modify: `src/lib/components/game/RailSegmentInspector.svelte` and spec if needed
- Modify: `src/lib/components/game/LogisticsRouteInspector.svelte` and spec if needed
- Modify: `src/routes/MapInspectorHost.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

**Interfaces:** No domain/callback interface changes are required for the inspectors. Keep their current props.

This task is primarily a presentation refactor. Do not manufacture test-only DOM just to force a RED step; characterize the existing behavior first, then add a route-level geometry assertion for the new layout.

- [ ] **Step 1: Run and preserve existing inspector characterization tests**

Run the existing focused specs before editing:

```bash
bun run test:unit -- src/lib/components/game/TileInspector.svelte.spec.ts --run
```

If focused specs exist for industry/rail/logistics inspectors, run those in the same command. Record a green baseline before restyling.

- [ ] **Step 2: Add one behavioral structure assertion only where it improves accessibility**

In `TileInspector.svelte.spec.ts`, ensure the owned-store path exposes:

- store art;
- `storeVitals` group;
- Revenue, Stock Health, and Staff Morale values;
- attention message when present;
- Upgrade and Details buttons.

Do not assert pixel sizes, CSS class names, SVG coordinates, or exact visual spacing.

- [ ] **Step 3: Recompose `TileInspector` using existing data**

Move the store art to the visual lead and arrange existing content in this order:

```text
art
identity / location
vitals
attention
level / next benefit
actions
```

Render the three current vitals as compact metric/gauge cards. Keep `store.stockHealth` and `store.staffMorale` semantics unchanged; do not invent normalization rules beyond the current display values unless an existing type already exposes one.

Keep empty-tile stats and all upgrade/Details callbacks unchanged.

- [ ] **Step 4: Normalize the other inspector shells without building a generic inspector component**

Apply the same paper/header/close/action hierarchy to `IndustryTileInspector`, `RailSegmentInspector`, and `LogisticsRouteInspector` where their existing markup benefits from it.

Do not extract a generic `InspectorShell` unless two or more components end up with substantial identical markup beyond CSS classes. Prefer shared CSS tokens first.

- [ ] **Step 5: Remove desktop offsets tied only to the old wrapping control footer**

In `MapInspectorHost.svelte`, remove the current special desktop bottom reservations (`8.5rem` and the 981–1023px `11.5rem` workaround) that existed to stay above wrapped `ControlDesk` rows.

Keep the inspector inside `.map-layout` and preserve compact bottom-sheet behavior below the compact breakpoint. Give the desktop inspector a simple top/right/bottom inset that avoids the new top HUD and compact simulation controls.

- [ ] **Step 6: Add a 1280×800 non-overlap E2E assertion**

In `retail-sim.e2e.ts`, use the existing inspector-open flow at a 1280×800 viewport. Compare `boundingBox()` values for the inspector and the relevant HUD/rail elements and assert they do not overlap.

Keep this to one focused layout contract; do not create screenshot-golden infrastructure.

- [ ] **Step 7: Verify**

Run:

```bash
bun run test:unit -- src/lib/components/game/TileInspector.svelte.spec.ts --run
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Add the focused industry/rail/logistics specs to the first command if those files were changed.

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts src/routes/MapInspectorHost.svelte src/routes/retail-sim.e2e.ts src/lib/components/game/IndustryTileInspector.svelte src/lib/components/game/RailSegmentInspector.svelte src/lib/components/game/LogisticsRouteInspector.svelte
git commit -m "feat(ui): revamp map inspector presentation"
```

Only stage inspector files actually modified; do not create no-op churn.

---

## Task 5: Turn `ManagementPanelHost` into the parchment workspace with in-place navigation

**Files:**
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/routes/ManagementPanelHost.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/lib/components/game/Scorecard.svelte`
- Modify: `src/lib/styles/frames.css` only if the gameplay rail's shared medallion primitive is reused

**Interfaces:**

Add to `ManagementPanelHost`:

```ts
interface ManagementItem {
  id: ManagementPanelId;
  label: string;
  shortcut?: string;
  icon: GameIconName;
}

managementItems: ManagementItem[];
onSelectPanel: (id: ManagementPanelId) => void;
```

All existing panel-specific props/callbacks remain.

`+page.svelte` continues to own `activeManagementPanelId`; pass:

```svelte
managementItems={managementPanelMenuItems}
onSelectPanel={openManagementPanel}
```

Keep the existing `{#key activeManagementPanel.id}` unless a focused test proves it conflicts with the new navigation. Switching panels may remount the host, but it must not close the management overlay or introduce separate local navigation state.

- [ ] **Step 1: Write the failing management navigation spec**

In `ManagementPanelHost.svelte.spec.ts`, render Dashboard with at least Dashboard, Policies, and Finance navigation items. Assert:

- the dialog remains present;
- Dashboard is marked current (`aria-current="page"` or `aria-pressed="true"` — choose one convention and use it consistently);
- clicking Policies invokes `onSelectPanel('policies')`;
- close/backdrop behavior still invokes `onClose`;
- existing day/cash status remains visible.

Run:

```bash
bun run test:unit -- src/routes/ManagementPanelHost.svelte.spec.ts --run
```

Expected: FAIL because the host has no navigation rail yet.

- [ ] **Step 2: Implement the workspace shell**

Replace the centered single-column paper dialog with a two-region parchment workspace:

```text
workspace
├─ navigation rail
└─ main
   ├─ header: panel label + day/cash + close
   └─ scrollable active panel body
```

Use `GameIcon` and the same `managementItems` metadata as `ControlDesk`.

Keep:

- backdrop button;
- `role="dialog"` and `aria-modal="true"`;
- `focusTrap` attachment;
- current finance focus metadata;
- explicit panel `if`/`else-if` composition;
- all existing mutation callbacks.

Do not turn panel IDs into a dynamic component registry.

- [ ] **Step 3: Wire route-owned panel switching**

Update the `ManagementPanelHost` call in `+page.svelte` with `managementPanelMenuItems` and `openManagementPanel`.

Do not add a new `managementWorkspaceOpen` boolean; `activeManagementPanelId !== null` remains the open-state source.

- [ ] **Step 4: Give `Scorecard` the mock's richer gauge/card treatment using existing values**

Keep the current four `ScoreKey`s and `meter` semantics. Recompose each score as an art-forward metric card with clearer number + label + gauge hierarchy.

Do not add trend lines or historical data.

If no `Scorecard.svelte.spec.ts` exists, add a focused test only if needed to preserve accessible meter names/values; otherwise rely on the existing host coverage plus `bun run check`.

- [ ] **Step 5: Make the workspace responsive without duplicating panel content**

At 1280×800 the workspace must fit within viewport padding and scroll its body rather than the whole page. At compact widths the navigation rail may become a top/bottom horizontally scrollable strip inside the modal.

Keep one panel body mount.

- [ ] **Step 6: Verify focused and route behavior**

Run:

```bash
bun run test:unit -- src/routes/ManagementPanelHost.svelte.spec.ts --run
bun run check
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 5**

```bash
git add src/routes/ManagementPanelHost.svelte src/routes/ManagementPanelHost.svelte.spec.ts src/routes/+page.svelte src/lib/components/game/Scorecard.svelte src/lib/styles/frames.css
git commit -m "feat(ui): revamp management workspace"
```

---

## Task 6: Pin cross-surface parity, responsive contracts, and finish the single PR

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify focused component specs only where final integration exposes a missing contract

**Interfaces:** No new production interfaces should be introduced in this task.

- [ ] **Step 1: Add the minimal route E2E coverage for the new shell**

Extend `retail-sim.e2e.ts` with focused flows that prove:

1. Retail / Industry / World can be selected directly from the top HUD.
2. A gameplay management icon opens the expected management workspace.
3. Clicking another management icon inside the open workspace switches to that panel without dismissing the dialog.
4. An existing keyboard shortcut still opens the same management destination.
5. A retail inspector remains interactive at 1280×800 and does not overlap the navigation rail/top status controls.

Reuse existing fixture helpers and route bootstrapping. Do not create a second E2E fixture system.

- [ ] **Step 2: Exercise both required desktop sizes**

Use Playwright viewport changes for:

```text
1920 × 1080
1280 × 800
```

Assert structural layout contracts (visible controls, bounding-box non-overlap, usable inspector/workspace), not screenshot pixels.

A manual visual comparison against the supplied HUD/panel references is still required before marking the PR ready, because the mock's value is primarily visual hierarchy.

- [ ] **Step 3: Run the complete focused component suite for touched surfaces**

Run:

```bash
bun run test:unit -- \
  src/lib/components/game/GameIcon.svelte.spec.ts \
  src/lib/components/game/TopBar.svelte.spec.ts \
  src/lib/components/game/GameMenu.svelte.spec.ts \
  src/lib/components/game/ControlDesk.svelte.spec.ts \
  src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts \
  src/lib/components/game/TileInspector.svelte.spec.ts \
  src/routes/ManagementPanelHost.svelte.spec.ts \
  --run
```

Add focused inspector/Scorecard specs if those files were changed/created.

Expected: PASS.

- [ ] **Step 4: Run project verification**

Run:

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e -- src/routes/retail-sim.e2e.ts
```

Expected: PASS.

Do not expand HPA-304 to unrelated failures; if an unrelated pre-existing failure appears, record it in the PR with evidence rather than refactoring around it.

- [ ] **Step 5: Manual visual review against the supplied mockups**

Check at 1920×1080 and 1280×800:

- map remains the dominant surface;
- brass medallion navigation reads consistently between gameplay and management workspace;
- Build is visually primary;
- top status bar exposes map switch, day, cash, alerts, and menu without text clutter;
- store inspector is art-led and action hierarchy is clear;
- management workspace has clear rail/header/content hierarchy;
- no decorative value was invented where the game lacks data.

Fix visual parity issues only within the approved scope.

- [ ] **Step 6: Commit final integration**

```bash
git add src/routes/retail-sim.e2e.ts
# Add only any focused files legitimately adjusted during final verification.
git commit -m "test(ui): pin gameplay revamp integration"
```

If Step 6 produced no changes after Task 5, skip the empty commit.

---

## Final PR Checklist

- [ ] HPA-304 is the only Linear ticket for this implementation.
- [ ] All implementation commits are on the same HPA-304 branch/PR.
- [ ] No new domain state, save fields, migration, controller, store, registry, or icon dependency was added.
- [ ] `GameMenu` no longer owns map-view switching.
- [ ] `ControlDesk` keeps all existing actions and no longer hides management access at compact widths.
- [ ] `MapInspectorHost` no longer reserves desktop space for the removed wrapping footer.
- [ ] `ManagementPanelHost` uses shared management metadata and switches panels through route-owned state.
- [ ] Existing panel bodies remain behavior owners.
- [ ] 1920×1080 and 1280×800 layouts are manually reviewed against the supplied references.
- [ ] `bun run check` passes.
- [ ] `bun run lint` passes.
- [ ] focused component tests pass.
- [ ] full unit suite passes.
- [ ] targeted `retail-sim.e2e.ts` passes.
