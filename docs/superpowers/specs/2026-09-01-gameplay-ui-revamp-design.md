# Gameplay HUD and Management Panel Revamp Design

**Date:** 2026-09-01  
**Status:** Revised after second design-plan review  
**Linear:** HPA-304 — Revamp gameplay HUD and management panels from approved mockups

## Summary

HPA-304 is a presentation-only revamp of the existing Serpens gameplay shell.

The approved visual direction combines the HUD mock's **Vitrine / brass-medallion, art-forward language** with the management mock's **parchment workspace and left navigation rail**. The map remains the primary gameplay surface, frequently used controls become icon-forward, selected stores become art-led inspector cards, and management screens gain a stable navigation shell.

This is not a new UI architecture. HPA-568's existing presentation boundaries remain authoritative:

```text
src/routes/+page.svelte
├─ MapSurfaceHost.svelte
├─ TopBar.svelte
├─ ControlDesk.svelte
├─ MapInspectorHost.svelte
└─ ManagementPanelHost.svelte
```

`GameState` remains the domain state owner. `GameRouteController` remains the route command/persistence coordinator. Phaser remains the map renderer. `+page.svelte` remains the cross-feature composition, shortcut, selection, and Escape-priority owner.

HPA-304 supersedes one HPA-568 implementation detail: the route-level `{#key activeManagementPanel.id}` remount. The management dialog shell must stay mounted while only its body changes so workspace-rail navigation is genuinely in-place.

No simulation, persistence, scenario, save-schema, or game-domain changes are required.

## Reference direction and self-contained layout contract

The original planning inputs were the supplied bundled HTML mockups `Serpens UI Revamp HUD.html` and `Serpens UI Revamp Panels.html`. They are design inputs, not runtime assets, and are intentionally not checked into the repository because the bundled files carry embedded image/font payloads unrelated to implementation.

The numeric contract below is therefore authoritative for HPA-304 implementation and review. An implementer does not need access to the original HTML files.

### Desktop HUD dimensions

```text
Gameplay rail reserved width      5rem / 80px
Gameplay rail outer padding       0.75rem / 12px
Gameplay management medallion     3.5rem / 56px
Gameplay rail item gap            0.625rem / 10px
Top HUD alert/menu button          existing .btn-icon = 2.75rem / 44px
Compact gameplay dock height      5.75rem / 92px
```

The 56px gameplay medallion and 10px gap preserve the Vitrine reference proportions while still reusing `.btn-icon`; `ControlDesk` may override only width/height for its own buttons. Top-bar alert/menu controls keep the existing 44px `.btn-icon` size.

### Inspector dimensions

At the 1920×1080 reference viewport, the retail inspector targets:

```text
Top offset       6rem / 96px
Right offset     1rem / 16px
Desktop width    24.5rem / 392px
Art height       13.75rem / 220px
```

At narrower widths, the existing host remains responsible for fitting/scrolling the inspector. Compact bottom clearance is derived from the shared dock-height token rather than a separate magic number.

### Management workspace dimensions

```text
Workspace width          min(74rem, calc(100vw - 2rem))
Workspace max height     calc(100vh - 2rem)
Workspace grid columns   5rem minmax(0, 1fr)
Workspace rail gap       0.625rem / 10px
Workspace content pad    1rem / 16px
```

The content region scrolls; the modal shell, left rail, header, and focus trap remain mounted while panel bodies change.

### CSS ownership

Layout custom properties live with the repository's other root custom properties in `src/lib/styles/tokens.css`:

```css
--control-desk-rail-width: 5rem;
--control-desk-compact-height: 5.75rem;
```

Reusable visual classes such as `.btn-icon-primary` stay in `src/lib/styles/frames.css`.

Do not add a second theme file or a runtime visual-style selector.

## Existing architecture to preserve

### `src/routes/+page.svelte`

Keeps:

- `GameRouteController` construction/synchronization;
- canonical route/game state and cross-feature derivations;
- `activeMapView` and `activeManagementPanelId`;
- selected map objects and inspector visibility;
- route command handlers and mutation availability;
- global shortcuts and Escape priority;
- save/scenario/audio/locale orchestration;
- mounting the concrete HUD, inspectors, and management workspace.

The revamp adds presentation metadata and layout wiring only. It does not move mutable game state into components.

### Phaser / map rendering

`CityMap`, `IndustryMap`, `WorldMap`, and their Phaser scenes keep their existing snapshots and rendering semantics.

The new left rail **does change the available canvas rectangle**. This is deliberate layout composition, not a Phaser-domain change. `MapSurfaceHost` reserves HUD space around the map surfaces so the fixed rail/dock never covers clickable world content:

```css
.map-surfaces {
  inset: 0 0 0 var(--control-desk-rail-width);
}

@media (max-width: 980px) {
  .map-surfaces {
    inset: 0 0 var(--control-desk-compact-height) 0;
  }
}
```

Each `.map-surface` remains `inset: 0` inside that host rectangle. Phaser continues to cover-fit to the actual canvas size and use its existing tile/snapshot model.

Do not mutate tile coordinates, map generation, snapshots, or camera rules to compensate for HUD geometry.

## Shared presentation vocabulary

The existing tokens remain the source of truth for parchment, ink, walnut, brass, wax red, moss, typography, grain, and paper shadow.

`frames.css` already provides `.paper`, `.plaque`, `.seal`, `.btn-*`, `.btn-icon`, `.keycap`, and reduced-motion behavior.

### Brass medallions

Reuse `.btn-icon` as the circular brass control primitive. Do not create another medallion class with duplicate border/radius/shadow rules.

Add only one moss/primary modifier for Build:

```css
.btn-icon-primary {
  color: var(--paper-50);
  background-color: var(--moss);
  border-color: var(--ink-900);
  box-shadow:
    inset 0 0 0 1px var(--moss-2),
    var(--shadow-paper);
}
```

`.seal` remains the wax-red count/attention pill and is not reused as navigation chrome.

### Exhaustive local icon primitive

Add `src/lib/components/game/gameNavigation.ts` and `GameIcon.svelte`. No icon dependency is needed.

`gameNavigation.ts` exports the closed vocabulary:

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
```

and an exhaustive data table:

```ts
export const ICON_PATHS: Record<GameIconName, readonly string[]> = { /* all keys */ };
```

The `Record` is the exhaustiveness gate: adding an icon name without data is a TypeScript error. `GameIcon.svelte` simply iterates the selected path list rather than maintaining a second 22-branch mapping.

`GameIcon` owns safe base SVG styling because some icons render outside `.btn-icon`:

```css
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
```

The SVG is always `aria-hidden="true"`. Accessible text stays on its owning control/readout.

Simulation speeds remain numeric text controls (`1×`, `2×`, `5×`). No speed icons are introduced.

### One shared management item type

`gameNavigation.ts` also exports:

```ts
export interface ManagementPanelMenuItem {
  id: ManagementPanelId;
  label: string;
  shortcut: string;
  icon: GameIconName;
}
```

The route's existing `managementPanelMenuConfig` remains the one destination list and gains `icon`. `ControlDesk` and `ManagementPanelHost` consume the same localized `ManagementPanelMenuItem[]`.

Every current destination has a shortcut, so `shortcut` is required. No hypothetical shortcut-less branch remains.

## Gameplay HUD

### Top status bar

`TopBar.svelte` remains the map-level status header.

Desktop composition contains:

1. current location/map plaque;
2. direct Retail / Industry / World controls;
3. Day and Cash readouts;
4. Alerts;
5. Menu.

Direct map buttons preserve the existing route-eyebrow accessible names:

```text
route.mapEyebrow.retail     → Retail City Map
route.mapEyebrow.industry   → Industry City Map
route.mapEyebrow.world      → World Map
```

Map switching moves out of `GameMenu`. Day/Cash may use decorative `GameIcon` glyphs but do not gain history/trend props. Alerts and Menu reuse `GameIcon` instead of keeping separate inline-SVG styles.

### Gameplay management rail

`ControlDesk.svelte` keeps its name and dumb-callback responsibility.

Desktop becomes a fixed left rail using the reserved 5rem footprint:

- Build uses `.btn-icon.btn-icon-primary`;
- Rail Build remains conditional on Industry;
- all nine management destinations remain available;
- pause/resume remains available;
- speeds remain `1×`, `2×`, `5×` text;
- shortcut help remains available;
- management labels stay as accessible names;
- label + hotkey remain discoverable through `title`.

No shortcut listener or active-panel state moves into `ControlDesk`.

### Compact dock

At `max-width: 980px`, the same actions become a horizontally scrollable bottom dock occupying `--control-desk-compact-height`.

Management navigation is **not hidden** at compact widths.

Because the dock now supplies the compact management path, the duplicate Management section is removed from the hamburger menu at all widths. `GameMenu` remains responsible for locale, Saves/scenario content, audio settings, its focus trap, outside-click dismissal, and local Escape dismissal.

There is one management destination list on screen, not a desk list plus a menu list.

## Route-level management entry semantics

### Generic panel navigation

`openManagementPanel(panelId)` becomes the generic management-navigation entry point used by:

- route management shortcuts;
- `ControlDesk` management buttons;
- the management workspace rail.

Generic navigation clears logistics-specific focus before selecting the new panel:

```ts
focusedLogisticsRouteId = null;
logisticsRoutePreset = null;
activeManagementPanelId = panelId;
```

`openLogisticsManagement(routeId, preset)` remains the focused-route entry point and deliberately assigns its context **after** calling the generic function:

```ts
openManagementPanel('logistics');
focusedLogisticsRouteId = routeId;
logisticsRoutePreset = preset;
```

This removes UI-call-site ternaries and gives future generic Logistics buttons one predictable meaning: open the Logistics panel without an old focused route/preset. It is a simplification/preservation rule; HPA-304 does not claim an existing user-visible stale-route defect is already reproducible.

Route-specific inspector/alert actions that intentionally focus a logistics route continue to call `openLogisticsManagement(...)`.

## Map inspector revamp

### Retail inspector

`TileInspector.svelte` already exposes the required data:

- existing store artwork;
- store identity/location;
- daily revenue;
- stock health;
- staff morale;
- attention/warning copy;
- level/next benefit/upgrade state;
- Details action.

Recompose those existing values into an art-first hierarchy. No new store read model is required.

Empty-tile inspection retains demand, rent, foot traffic, and customer fit.

### Other inspectors

`IndustryTileInspector`, `RailSegmentInspector`, and `LogisticsRouteInspector` receive consistent paper/header/action treatment without a generic inspector framework or callback rewrite.

### Inspector geometry

Desktop footer-specific `bottom: 8.5rem` / 981–1023px wrap compensation is removed after the left rail lands.

Compact placement derives its bottom clearance from `--control-desk-compact-height`:

```css
@media (max-width: 980px) {
  .inspector-overlay {
    bottom: calc(var(--control-desk-compact-height) + 0.5rem);
  }
}
```

The exact compact positioning mode may preserve the existing bottom-sheet treatment, but it must not introduce another dock-height constant.

## Management workspace

### Stable shell

`ManagementPanelHost.svelte` becomes the parchment workspace:

```text
┌─────────────────────────────────────────────────────────────┐
│ left rail       │ header + day/cash + close               │
│                 ├───────────────────────────────────────────┤
│                 │ active management panel body             │
└─────────────────────────────────────────────────────────────┘
```

The backdrop, `aria-modal="true"`, focus trap, close behavior, and route-owned Escape priority remain.

The rail uses the same `ManagementPanelMenuItem[]`, `.btn-icon`, and `GameIcon` primitives as the gameplay rail.

### In-place switching

Remove the route-level:

```svelte
{#key activeManagementPanel.id}
  <ManagementPanelHost />
{/key}
```

Keep the shell mounted while `activeManagementPanelId !== null`. Key only the complete body switch inside `ManagementPanelHost`:

```svelte
<div class="workspace-body">
  {#key panelId}
    {#if panelId === 'dashboard'}
      <Scorecard ... />
    {:else if panelId === 'policies'}
      <PolicyPanel ... />
    {:else if panelId === 'staff'}
      <StaffPanel ... />
    {:else if panelId === 'stores'}
      <!-- existing stores composition -->
    {:else if panelId === 'decisions'}
      <!-- existing decisions composition -->
    {:else if panelId === 'reports'}
      <ReportsPanel ... />
    {:else if panelId === 'productChains'}
      <ProductChainsPanel ... />
    {:else if panelId === 'finance'}
      <FinancePanel ... />
    {:else if panelId === 'logistics'}
      <LogisticsPanel ... />
    {/if}
  {/key}
</div>
```

The explicit switch remains; no dynamic-component registry is added.

The route's lazy `financeMetrics` derivation remains valid because it already keys off `activeManagementPanelId === 'finance'`.

### Dashboard body scope

`Scorecard.svelte` is the only management body deliberately redesigned in HPA-304. Its existing profit, customer satisfaction, staff morale, and market position values become richer visual cards/gauges without new time-series or analytics state.

Other panel bodies remain behavior owners and receive shell-level spacing only where necessary.

## E2E contracts that move with the chrome

### Canvas reservation

The map-surface inset lands in the same task as the fixed rail. Existing tile-click helpers remain canvas-box-relative; they must not be rewritten around the rail.

### One non-overlap helper

The old helper assumes a bottom footer and asserts `action bottom <= desk top`. Replace it with rectangle separation:

```ts
const separated =
  actionRight <= deskLeft ||
  actionLeft >= deskRight ||
  actionBottom <= deskTop ||
  actionTop >= deskBottom;
```

Keep one helper for this contract.

Two inline copies of the old footer geometry are deleted rather than migrated. The dedicated 981–1023px three-row-footer test is also deleted because that layout no longer exists. Existing real clicks plus the shared non-overlap test are sufficient interception evidence.

The 960px hamburger-management test is rewritten to prove management destinations are reachable from the compact dock.

### Map-view helper and menu assertions

The existing `openMapMenuItem` helper is replaced by direct TopBar selection. Escape tests assert Menu's `aria-expanded`/dialog state rather than map-tab presence/absence.

### Management locator scoping

The E2E helper that opens a management panel scopes its initial launcher to the gameplay controls:

```ts
const desk = page.getByLabel('Control desk');
await desk.getByRole('button', { name: panelName }).click();
```

Once the modal is open, repeated Dashboard/Finance/etc. locators are scoped to the management dialog. The gameplay rail remains mounted behind the modal and is allowed to expose the same accessible names.

### Full E2E coverage at risky cutovers

`time-flow.e2e.ts` directly exercises Menu, Resume/Pause, and speed buttons, so HPA-304 cannot verify only `retail-sim.e2e.ts` after replacing ControlDesk.

Run the full route E2E suite at:

- the Task 2 rail/map-reservation cutover;
- final Task 6 verification.

Targeted `retail-sim.e2e.ts` runs remain appropriate after Tasks 3–5.

## Component-test contracts

`ControlDesk.svelte.spec.ts` explicitly updates these old assumptions:

- management accessible names stop embedding hotkeys (`Dashboard O` → `Dashboard` with `title="Dashboard (O)"`);
- the visible `?` keycap assertion becomes an icon/accessibility/callback assertion;
- the hypothetical shortcut-less management item test is deleted;
- a real 414×800 test proves compact management actions remain reachable.

New browser specs follow the repository's existing explicit `expect.assertions(n)` style.

`GameIcon.svelte.spec.ts` iterates every key in `ICON_PATHS`, proving every declared icon produces at least one path and decorative SVG semantics.

## Responsive verification

Use:

- 1920×1080 — reference composition;
- 1280×800 — practical desktop regression;
- 760×800 — compact route/inspector/dock clearance;
- 414×800 — compact ControlDesk component access.

At desktop sizes:

- map content starts outside the reserved gameplay rail;
- TopBar and rail do not collide;
- inspector actions do not overlap gameplay controls;
- management workspace fits and scrolls its body.

At compact sizes:

- map surfaces reserve the dock footprint;
- all management destinations remain reachable;
- inspector actions remain clickable above the dock.

## Accessibility and keyboard behavior

- Every icon-only button has a localized accessible name.
- Management buttons expose label + hotkey via `title`/tooltip treatment.
- Direct map controls retain `route.mapEyebrow.*` names.
- Existing global shortcuts remain route-owned.
- `GameMenu` retains focus/dismissal behavior.
- `ManagementPanelHost` stays modal and focus-trapped while switching bodies.
- Map inspectors remain non-modal.
- Global Escape priority remains in `+page.svelte`.
- Reduced-motion behavior remains respected.
- No component adds a global key listener.

## Implementation surface

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
- focused industry/rail/logistics inspector files/specs only when their shell is actually changed;
- `src/lib/components/game/Scorecard.svelte`
- `src/lib/components/game/Scorecard.svelte.spec.ts`
- `src/routes/MapSurfaceHost.svelte`
- `src/routes/MapInspectorHost.svelte`
- `src/routes/ManagementPanelHost.svelte`
- `src/routes/ManagementPanelHost.svelte.spec.ts`
- `src/routes/+page.svelte`
- `src/routes/retail-sim.e2e.ts`

`src/routes/time-flow.e2e.ts` is a required verification target but does not need source changes unless implementation reveals a genuine accessibility-name regression.

## Non-goals

- simulation, balance, economy, or event-rule changes;
- persistence/save-schema changes or migrations;
- Phaser snapshot/tile/world-coordinate changes;
- a UI framework, runtime theme selector, registry, context/global store, or second controller;
- an icon dependency;
- fabricated cash/history/trend data;
- a full internal redesign of every management panel;
- a second compact/mobile navigation system;
- backward-compatibility work.

## Acceptance criteria

- [ ] Gameplay rail never overlays the Phaser canvas; desktop/compact map surfaces reserve its footprint.
- [ ] Retail / Industry / World switching is directly available from TopBar with existing accessible names.
- [ ] Build, Rail Build, all nine management destinations, Pause/Resume, speeds, and shortcut help remain reachable.
- [ ] Compact management access comes from the dock; the duplicate hamburger Management section is removed.
- [ ] Retail inspector is art-forward using current data only; other inspectors retain behavior.
- [ ] Inspector geometry uses one shared dock-height token and one E2E non-overlap helper.
- [ ] Management workspace shell stays mounted while only its explicit body switch is keyed.
- [ ] Generic management navigation clears logistics focus; focused route entry still uses `openLogisticsManagement`.
- [ ] One `ManagementPanelMenuItem` type and one `ICON_PATHS` table cover all shared navigation.
- [ ] Layout tokens live in `tokens.css`; `.btn-icon-primary` lives in `frames.css`.
- [ ] `ControlDesk` component coverage includes 414×800; route coverage includes 760×800, 1280×800, and 1920×1080.
- [ ] Full E2E passes after the rail/map cutover and at final verification, including `time-flow.e2e.ts`.
- [ ] `bun run check`, `bun run lint`, focused component tests, full unit tests, and full E2E pass before the implementation PR leaves draft.