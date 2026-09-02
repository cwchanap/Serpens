# Gameplay HUD and Management Panel Revamp Design

**Date:** 2026-09-01  
**Status:** Revised after design-plan review  
**Linear:** HPA-304 — Revamp gameplay HUD and management panels from approved mockups  
**Design references:** `Serpens UI Revamp HUD.html` and `Serpens UI Revamp Panels.html` supplied with HPA-304 planning.

## Summary

HPA-304 is a presentation-only revamp of the existing Serpens gameplay shell.

The approved visual direction is the **Vitrine / brass-medallion, art-forward language** from the HUD mock combined with the **parchment management workspace and left navigation rail** from the management-panel mock. The map stays dominant, frequent actions become icon-forward, selected stores become art-led inspector cards, and management screens gain stronger hierarchy without changing game-domain behavior.

This is not a new UI architecture. HPA-568 already established the correct presentation boundaries:

```text
src/routes/+page.svelte
├─ MapSurfaceHost.svelte
├─ TopBar.svelte
├─ ControlDesk.svelte
├─ MapInspectorHost.svelte
└─ ManagementPanelHost.svelte
```

Those boundaries remain authoritative. `GameState` remains the domain state owner, `GameRouteController` remains the route command/persistence coordinator, Phaser remains responsible for map rendering, and `+page.svelte` remains the shortcut/Escape/state composition owner.

HPA-304 intentionally supersedes one HPA-568 implementation detail: the route-level `{#key activeManagementPanel.id}` remount. The new workspace must stay mounted while its panel body changes so rail navigation is genuinely in-place.

No simulation, persistence, scenario, save-schema, or game-domain changes are required.

## Decisions locked by this revision

1. Ship one visual direction only: Vitrine circular brass controls + parchment workspace. No runtime 1a/1b theme.
2. Keep the HPA-568 hosts. Do not add `MapWorkspace`, a UI controller, global Svelte store, context state, event bus, panel registry, or inspector registry.
3. Use one route-owned management destination list and one shared `ManagementPanelMenuItem` type.
4. Keep the explicit `if`/`else-if` management-panel switch. No dynamic component registry.
5. Only `Scorecard` receives a deliberate panel-body visual redesign. Other panel bodies keep behavior and receive shell/spacing normalization only where needed.
6. Do not create cash history, trends, or analytics merely to fill decorative mock charts.
7. Keep all keyboard shortcuts and global Escape priority in `+page.svelte`.
8. Treat 1920×1080 as the reference composition, 1280×800 as the desktop regression size, and compact access as more important than pixel parity.
9. Route-visible chrome changes must update existing E2E helpers in the same task that invalidates them. A task is not complete while `retail-sim.e2e.ts` still encodes the old UI ownership.

## Existing architecture to preserve

### `src/routes/+page.svelte`

Keeps:

- `GameRouteController` construction and synchronization;
- canonical route/game state and cross-feature derivations;
- `activeMapView` and `activeManagementPanelId`;
- selected map objects and inspector visibility;
- command handlers and mutation availability;
- global keyboard shortcuts and Escape priority;
- save, scenario, audio, and locale orchestration;
- mounting the HUD, map inspector host, and management host.

The route may add presentation metadata and pass callbacks to the revised surfaces, but no UI component becomes a second state owner.

### Map rendering

`MapSurfaceHost.svelte`, `CityMap.svelte`, `IndustryMap.svelte`, `WorldMap.svelte`, and the Phaser scenes remain behaviorally unchanged except for normal resizing caused by surrounding HUD composition.

No game rules move into Phaser or HUD components.

### Management composition

`ManagementPanelHost.svelte` continues to compose:

- Dashboard / `Scorecard`;
- Policies;
- Staff and manager delegation;
- Stores and retail supply;
- Decisions and active modifiers;
- Reports;
- Product Chains;
- Logistics;
- Finance.

The host receives the active panel and callbacks from the route. Existing panel components remain authoritative for their internal actions.

## Shared presentation vocabulary

The existing CSS remains the source of truth:

- parchment: `--paper-*`;
- ink: `--ink-*`;
- walnut stage: `--walnut-*`;
- brass: `--brass-*`;
- wax/moss/royal state accents;
- existing display/body/UI/mono font stacks;
- existing paper grain and paper shadow.

`frames.css` already provides `.paper`, `.plaque`, `.seal`, `.btn-*`, `.btn-icon`, `.keycap`, and reduced-motion behavior.

### Brass medallion

Reuse `.btn-icon` as the circular brass medallion. Do not create a competing medallion class with duplicate border/radius/shadow rules.

Add only a small moss/primary modifier needed by Build. `.seal` remains the wax-red count/attention pill; it is not repurposed as a navigation medallion.

### Local icon primitive

Add one small local `GameIcon.svelte`, backed by inline SVG paths and a closed `GameIconName` union in `gameIcon.ts`.

Freeze the vocabulary to icons HPA-304 will actually render:

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

Simulation speeds remain the current numeric text controls (`1×`, `2×`, `5×`). Do not create decorative speed icons.

`TopBar` and `GameMenu` replace their existing ad-hoc alert/menu SVG markup with `GameIcon`, so there is one icon vocabulary rather than two parallel styles.

`GameIcon` never owns accessible naming. Its SVG is decorative (`aria-hidden="true"`); the owning button/span retains the localized label.

### Shared management item type

Export exactly one presentation shape beside `GameIconName`:

```ts
export interface ManagementPanelMenuItem {
  id: ManagementPanelId;
  label: string;
  shortcut: string;
  icon: GameIconName;
}
```

The route's existing `managementPanelMenuConfig` remains the only destination list. It gains `icon`; the localized `managementPanelMenuItems` derived value uses the shared type. `ControlDesk` and `ManagementPanelHost` consume that type instead of defining local variants.

Every current management destination has a shortcut, so `shortcut` is required. Do not preserve an optional shortcut branch solely for a hypothetical future item.

## Gameplay HUD

### Top status bar

`TopBar.svelte` remains the map-level status header.

Desktop composition contains:

1. current location/map plaque;
2. direct Retail / Industry / World controls;
3. Day and Cash readouts;
4. Alerts;
5. Menu.

The direct map buttons use `GameIcon` and preserve the **existing route eyebrow accessible names**:

```text
route.mapEyebrow.retail
route.mapEyebrow.industry
route.mapEyebrow.world
```

That means the button names remain “Retail City Map”, “Industry City Map”, and “World Map” in English rather than switching tests/accessibility to the shorter `Retail` / `Industry` / `World` labels.

The map-view selector moves out of `GameMenu.svelte`. `GameMenu` keeps locale selection, route-provided menu content, focus trap, outside-click dismissal, and Escape behavior.

Day/Cash may use decorative `day`/`cash` icons but do not gain historical values or trend props.

### Gameplay management rail

`ControlDesk.svelte` keeps its behavioral responsibility but changes presentation.

Desktop becomes a fixed left rail using `.btn-icon`:

- Build is primary/moss;
- conditional Rail Build remains available on the industry map;
- every current management destination is an icon button;
- pause/resume, numeric speed controls, and shortcut help remain available;
- localized labels stay as accessible names;
- label + shortcut remain discoverable through `title`/tooltip treatment.

No shortcut listener moves into `ControlDesk`.

### Compact dock

At widths below the existing compact breakpoint, do not hide management navigation. The same actions become a horizontally scrollable bottom dock/strip.

The dock uses one explicit shared CSS custom property for its occupied height/clearance (`--control-desk-compact-height`) in shared frame CSS. `ControlDesk` and `MapInspectorHost` both consume that same value. This is a layout constant, not a state abstraction.

A real compact component test uses a 414×800 viewport and proves management destinations remain reachable.

## E2E contracts that must move with the HUD

The existing route E2E contains two helpers/contracts tied to the old chrome. HPA-304 updates them at the same cutover that invalidates them.

### Inspector clearance helper

The current helper assumes the Control Desk is a bottom footer and asserts:

```text
action bottom <= control desk top
```

That is invalid for a left rail. Replace it during the ControlDesk task with rectangle non-overlap:

```ts
const separated =
  actionRight <= deskLeft ||
  actionLeft >= deskRight ||
  actionBottom <= deskTop ||
  actionTop >= deskBottom;

expect(separated).toBe(true);
```

Rename the helper/test to describe non-overlap rather than “above the desk”. The existing ninth-launcher test remains valuable but becomes a rail/dock clearance test. Later 1280×800 checks reuse this helper rather than creating a second geometry contract.

### Map-view helper and Escape assertions

The current `openMapMenuItem` helper opens the hamburger and then clicks a map tab. Once map views move to `TopBar`, replace it with `selectMapView`, which clicks the always-visible top HUD map button directly.

Likewise, Escape tests must stop using map-tab presence/absence as evidence that the hamburger is open. Assert the menu trigger's `aria-expanded` state or the menu dialog itself.

The logistics-navigation test that currently finds World inside the menu dialog also switches through the top HUD after this cutover.

## Map inspector revamp

### Retail store inspector

`TileInspector.svelte` already has all required data:

- existing store artwork;
- store name/location;
- daily revenue;
- stock health;
- staff morale;
- attention/warning copy;
- level/next benefit/upgrade state;
- Details action.

Recompose those values into the approved art-forward hierarchy. Do not add a new store read model.

Empty-tile inspection keeps demand, rent, foot traffic, and customer fit.

### Other inspectors

`IndustryTileInspector`, `RailSegmentInspector`, and `LogisticsRouteInspector` receive the same presentation language—paper frame, compact header/close treatment, metric/action hierarchy—without a generic inspector framework or callback changes.

### Inspector geometry

`MapInspectorHost.svelte` currently reserves large desktop bottom offsets because the old footer can wrap. Remove those desktop footer-specific offsets after the left rail lands.

Compact behavior remains bottom-sheet-like, but its bottom inset is derived from the same explicit compact dock height/clearance used by `ControlDesk`, not the old hardcoded `5rem` assumption.

Add compact regression evidence at a 760×800 route viewport that an inspector action and the dock do not overlap.

## Management workspace

### Shell

`ManagementPanelHost.svelte` becomes the parchment workspace from the supplied panel mock:

```text
┌─────────────────────────────────────────────────────────────┐
│ left icon rail │ panel header + day/cash + close           │
│                ├────────────────────────────────────────────┤
│                │ active panel body                          │
└─────────────────────────────────────────────────────────────┘
```

The backdrop, `aria-modal="true"`, focus trap, close behavior, and route-owned Escape priority remain.

The rail uses the same `ManagementPanelMenuItem[]` and `.btn-icon`/`GameIcon` presentation as `ControlDesk`.

### In-place switching and HPA-568 override

The route currently wraps the whole host in:

```svelte
{#key activeManagementPanel.id}
  <ManagementPanelHost />
{/key}
```

HPA-304 removes that route-level key. Keeping it would tear down/recreate the dialog/focus trap on every internal rail click and contradict in-place navigation.

The shell stays mounted while `activeManagementPanelId !== null`. Key **only the complete content/body switch** inside `ManagementPanelHost` by `panelId` so panel-local UI state resets without remounting the rail/header/dialog/focus trap.

The route continues to own `activeManagementPanelId`. The host receives:

```ts
managementItems: ManagementPanelMenuItem[];
onSelectPanel: (id: ManagementPanelId) => void;
```

and calls the existing route `openManagementPanel` callback.

The current lazy `financeMetrics` derivation remains valid because it already derives metrics only when `activeManagementPanelId === 'finance'`; no host remount is required for that invariant.

After the workspace is open, tests scope duplicate destination names to the management dialog (`dialog.getByRole(...)`) rather than page-level locators.

### Panel bodies

Keep the explicit `if`/`else-if` switch. No dynamic components.

`Scorecard.svelte` gets the focused body-level visual upgrade. Existing Reports/Finance/etc. data remains where it is; do not fabricate mock-only history.

## Responsive behavior

### Desktop

Verify:

- 1920×1080 reference composition;
- 1280×800 practical laptop composition.

At both sizes:

- map remains dominant;
- top HUD and left rail do not collide;
- inspector actions do not overlap the Control Desk;
- management workspace fits the viewport and scrolls its content region as necessary.

Use the shared E2E non-overlap helper for geometry checks.

### Compact

Use real compact evidence rather than desktop-only assertions:

- component test at 414×800 proves all management actions remain accessible in the dock;
- inspector clearance is exercised at 760×800 after the dock/inspector geometry is updated.

Do not create a separate mobile component tree or mobile state architecture.

## Accessibility and keyboard behavior

Requirements:

- every icon-only button has a localized accessible name;
- management buttons expose label + hotkey through `title`/tooltip treatment;
- map buttons keep `route.mapEyebrow.*` accessible names;
- existing keyboard shortcuts stay in the route's central handler;
- alerts and menu keep current dismissal/focus behavior;
- management workspace stays modal/focus trapped while switching bodies;
- map inspectors stay non-modal;
- global Escape priority stays in `+page.svelte`;
- reduced-motion behavior remains respected.

No component adds a global key listener.

## Testing strategy

### Component tests

- `GameIcon.svelte.spec.ts`: closed icon primitive, decorative SVG semantics.
- `ControlDesk.svelte.spec.ts`: icon navigation, callbacks, hotkey titles, disabled states, rail build, and 414×800 compact dock access.
- `ControlDesk.timeControls.svelte.spec.ts`: pause/resume and numeric speed semantics unchanged.
- `TopBar.svelte.spec.ts`: direct map controls with `route.mapEyebrow.*` names, active `aria-pressed`, day/cash, alerts/menu.
- `GameMenu.svelte.spec.ts`: no map controls; locale/menu content/focus behavior retained.
- inspector specs: art/shell changes preserve current callbacks and data.
- `ManagementPanelHost.svelte.spec.ts`: shared rail, active state, `onSelectPanel`, dialog/focus/close behavior, concrete panel composition.
- `Scorecard.svelte.spec.ts`: four existing score values remain represented and accessible.

### Route E2E

`retail-sim.e2e.ts` remains the cross-feature integration boundary.

Update old helper contracts in the task that changes their UI owner:

- ControlDesk task: rectangle non-overlap helper + ninth-launcher test;
- TopBar task: direct `selectMapView` helper/call sites + Escape assertions + logistics World navigation;
- Inspector task: compact dock/inspector clearance at 760×800;
- Workspace task: internal rail switch scoped to the dialog and stable modal focus.

Final 1920/1280 checks build on those helpers; do not introduce parallel geometry/navigation helpers.

## Risks and controls

### Existing E2E encodes old chrome

**Control:** migrate the footer-geometry helper in the ControlDesk task and the menu-map helper/Escape assertions in the TopBar task before demanding a green route suite.

### Compact dock covers inspector actions

**Control:** one shared compact dock-height custom property plus a 760×800 route non-overlap assertion.

### Workspace remount defeats in-place navigation

**Control:** remove the route-level `{#key}`; key only the complete body switch. Keep the focus trap on the stable shell.

### Icon vocabulary drifts

**Control:** one closed `GameIconName` union containing every icon mounted by HPA-304. Speeds stay text. Alerts/menu use the same primitive.

### Mock-only data leaks into domain scope

**Control:** render only values already exposed by current state/read models.

### Route becomes a UI detail owner again

**Control:** route changes are limited to shared management metadata, callback wiring, E2E-owned helper migrations, and removal of the shell-remount key. CSS stays with presentation components/hosts.

## Non-goals

- simulation, balance, economy, or event-rule changes;
- persistence/save-schema changes or migrations;
- Phaser map-renderer rewrite;
- UI framework, runtime theme selector, generic registry, or global state store;
- external icon dependency;
- fabricated chart history or cash trends;
- full internal redesign of every management panel;
- separate mobile UI architecture;
- backward-compatibility work.

## Acceptance criteria

- [ ] Gameplay HUD follows the approved Vitrine/art-forward language at 1920×1080 and remains usable at 1280×800.
- [ ] Retail / Industry / World controls are directly available in `TopBar` with existing `route.mapEyebrow.*` accessible names.
- [ ] Existing route E2E no longer opens the hamburger to switch maps or uses map-tab presence as menu-open state.
- [ ] Build and every current management destination remain reachable with existing keyboard shortcuts.
- [ ] ControlDesk exposes management destinations at 414×800.
- [ ] Inspector actions do not overlap the desktop rail or compact dock using one shared non-overlap contract.
- [ ] Pause/resume, numeric simulation speed, shortcut help, conditional rail build, alerts, menu, and localization still work.
- [ ] Retail inspector is art-forward and uses only existing data.
- [ ] Industry, rail, and logistics inspectors share the revised presentation language without behavior regressions.
- [ ] Management workspace uses the parchment shell + left rail and switches panels without remounting the shell/focus trap.
- [ ] Route-level `{#key activeManagementPanel.id}` is removed; only the complete panel-body switch is keyed by `panelId`.
- [ ] `ControlDesk` and `ManagementPanelHost` consume one shared `ManagementPanelMenuItem` type/list.
- [ ] `.btn-icon` remains the brass medallion primitive; `.seal` remains the wax-red badge.
- [ ] Existing panel components remain behavior owners; only `Scorecard` receives a deliberate body-level visual upgrade.
- [ ] Accessible names, focus handling, Escape/backdrop close behavior, and keyboard shortcuts remain covered.
- [ ] `bun run check`, `bun run lint`, focused component tests, full unit tests, and targeted route E2E pass.