# Gameplay HUD and Management Panel Revamp Design

**Date:** 2026-09-01  
**Status:** Approved direction, ready for implementation planning  
**Linear:** HPA-304 — Revamp gameplay HUD and management panels from approved mockups  
**Design references:** `Serpens UI Revamp HUD.html` and `Serpens UI Revamp Panels.html` supplied with HPA-304 planning.

## Summary

HPA-304 is a presentation-only revamp of the existing Serpens gameplay shell.

The approved visual direction is the **Vitrine / brass-medallion, art-forward language** from the HUD mock combined with the **parchment management workspace and left navigation rail** from the management-panel mock. The goal is to make the game read more like a cohesive management simulation: the map stays visually dominant, frequently used actions become icon-forward, selected stores become art-led inspector cards, and management screens gain stronger hierarchy without changing their behavior.

This is not a new UI architecture. HPA-568 already established the correct presentation boundaries:

```text
src/routes/+page.svelte
├─ MapSurfaceHost.svelte
├─ TopBar.svelte
├─ ControlDesk.svelte
├─ MapInspectorHost.svelte
└─ ManagementPanelHost.svelte
```

Those boundaries remain authoritative. `GameState` remains the domain state owner, `GameRouteController` remains the route command/persistence coordinator, and Phaser remains responsible for map rendering.

No simulation, persistence, scenario, save-schema, or game-domain changes are required.

## Source direction and approved interpretation

The HUD reference describes two icon/art-forward directions using the existing parchment, brass, walnut, wax-red, moss, and typography tokens. The approved treatment takes the Vitrine direction's circular brass medallions and art-led inspector as the visual vocabulary.

For the shipped desktop composition, those medallions are arranged as a **left-side gameplay management rail** rather than introducing a second selectable HUD theme. This aligns the gameplay shell with the management-panel reference, removes the current bottom management-launcher wrap pressure, and frees the bottom edge for compact time controls without changing any command ownership.

This is a single canonical UI direction. There is no runtime 1a/1b switch and no alternate theme state.

## Existing architecture to preserve

### Route composition

`src/routes/+page.svelte` remains responsible for:

- creating and synchronizing `GameRouteController`;
- canonical route/game state and cross-feature derivations;
- active map view and active management-panel ID;
- selected map objects and inspector visibility;
- command handlers and mutation availability;
- global keyboard shortcuts and Escape priority;
- save/scenario/audio/locale orchestration;
- mounting the concrete HUD, inspector host, and management host.

The revamp may add presentation props to those existing mounts, but it must not move command or state ownership into the visual components.

### Map rendering

`MapSurfaceHost.svelte`, `CityMap.svelte`, `IndustryMap.svelte`, `WorldMap.svelte`, and the Phaser scenes remain behaviorally unchanged except for any surrounding layout space needed by the new HUD.

No game rules move into Phaser or into HUD components.

### Management composition

`ManagementPanelHost.svelte` continues to compose the existing concrete panels:

- Dashboard / `Scorecard`;
- Policies;
- Staff and manager delegation;
- Stores and retail supply;
- Decisions and active modifiers;
- Reports;
- Product Chains;
- Logistics;
- Finance.

The host receives the active panel and callbacks from the route. The panel components remain authoritative for their internal actions.

## Shared visual vocabulary

The existing CSS tokens remain the design source of truth:

- parchment: `--paper-*`;
- ink: `--ink-*`;
- stage: `--walnut-*`;
- brass: `--brass-*`;
- warning/accent: `--wax-red*`, `--moss*`, `--royal-ink`;
- existing display/body/UI/mono font stacks;
- existing paper grain and paper shadow.

`frames.css` already provides `.paper`, `.plaque`, `.seal`, `.btn-*`, `.btn-icon`, `.keycap`, and reduced-motion behavior. HPA-304 extends those primitives only where a repeated motif is real.

### Icon primitive

Add one small local `GameIcon.svelte` backed by inline SVG paths and a typed `GameIconName` vocabulary. It exists to avoid duplicating the same SVG markup across `TopBar`, `ControlDesk`, and `ManagementPanelHost`.

The vocabulary covers only icons needed by this ticket: map views, Build, the current management destinations, rail build, pause/resume, simulation speed, shortcuts, alerts, menu, and close where needed.

Do not add an icon package, icon registry service, runtime asset loader, or generic design-system dependency.

## Gameplay HUD

### Top status bar

`TopBar.svelte` remains the owner of the map-level status header.

The new desktop composition contains:

1. **Location plaque** — current eyebrow + map/city title.
2. **Direct map-view selector** — Retail, Industry, World are first-class icon controls in the top HUD.
3. **Day and cash readouts** — compact icon-led readouts using the existing formatted values.
4. **Alerts** — the existing alert button/count/popover behavior.
5. **Menu** — hamburger remains the home for locale and route-provided menu content.

The map-view selector moves out of `GameMenu.svelte`. `GameMenu` no longer owns map switching after this change.

Do not add a cash trend, historical delta, or other mock-only metric unless it already exists in the current route model. Current cash is sufficient for HPA-304.

### Gameplay management rail

`ControlDesk.svelte` keeps its name and behavioral responsibility but changes presentation.

On desktop it becomes a left-side rail with:

- Build as the primary moss action;
- one icon button for every current management destination;
- current keyboard shortcuts shown in tooltip/title treatment and preserved in keyboard handling;
- conditional Rail Build on the industry map;
- pause/resume, simulation speed, and shortcut help grouped separately at the lower edge of the rail or adjacent compact control area.

The exact visual treatment uses the Vitrine circular brass-medallion language for management actions. Build retains stronger moss emphasis.

The rail remains a dumb callback surface. It does not own active management state, map state, or keyboard listeners.

### Shared management item data

The route's existing `managementPanelMenuConfig` / `managementPanelMenuItems` remains the source of the destination list and labels. Add an icon identifier to that existing presentation config, then pass the same item shape to both `ControlDesk` and `ManagementPanelHost`.

This prevents a second hardcoded panel menu without introducing a registry or new state abstraction.

Conceptually:

```ts
interface ManagementPanelMenuItem {
  id: ManagementPanelId;
  label: string;
  shortcut: string;
  icon: GameIconName;
}
```

## Map inspector revamp

### Retail store inspector

`TileInspector.svelte` already has the data needed for the approved art-forward card:

- existing store artwork from `getStoreArt`;
- store name and location;
- daily revenue;
- stock health;
- staff morale;
- attention/warning copy;
- level, next benefit, upgrade cost/state;
- Details action.

HPA-304 recomposes those existing values into a stronger hierarchy:

```text
store artwork
store identity + location
three compact vitals / gauges
attention callout when present
level / next benefit
Upgrade + Details actions
```

No new store read model is needed.

Empty-tile inspection retains its existing demand/rent/foot-traffic/customer-fit information, restyled to the same shell rather than acquiring new behavior.

### Other inspectors

`IndustryTileInspector`, `RailSegmentInspector`, and `LogisticsRouteInspector` receive the same outer presentation language: consistent paper frame, compact header/close treatment, spacing, metric cards, and action hierarchy.

Their domain-specific internals and callback contracts stay intact. Do not rewrite all inspector markup into a generic inspector framework.

### Inspector host geometry

`MapInspectorHost.svelte` currently reserves large bottom offsets because the desktop `ControlDesk` can wrap into multiple rows. After management navigation moves to the left rail, remove the desktop offsets that exist only for that wrapping footer.

The host still owns inspector placement. `+page.svelte` does not gain per-inspector CSS.

## Management workspace

### Shell

`ManagementPanelHost.svelte` changes from a centered generic control-tower dialog into a larger parchment workspace matching the supplied panel reference.

Desktop structure:

```text
┌─────────────────────────────────────────────────────────────┐
│ left icon rail │ panel header + day/cash + close           │
│                ├────────────────────────────────────────────┤
│                │                                            │
│                │ existing active management panel content   │
│                │                                            │
└─────────────────────────────────────────────────────────────┘
```

The existing backdrop, modal semantics, focus trap, close button, and Escape ownership remain.

### In-place panel switching

The host receives the same management item list as `ControlDesk` plus one new callback:

```ts
managementItems: ManagementPanelMenuItem[];
onSelectPanel: (id: ManagementPanelId) => void;
```

Clicking another rail icon updates the route-owned active panel ID and keeps the management workspace open.

`+page.svelte` remains the state owner. `ManagementPanelHost` does not introduce local navigation state.

### Panel bodies

The existing panel components remain mounted by the current explicit `if`/`else-if` switch. Do not introduce dynamic component registries.

The shell change may normalize panel spacing and cards where necessary for visual coherence, but HPA-304 does not require rewriting every panel internally.

### Dashboard

`Scorecard.svelte` is the only panel body that intentionally receives a focused visual upgrade in this ticket. Its four existing score values become richer gauge/card summaries consistent with the mock.

Do not fabricate time-series data or financial history for decorative charts. Existing Reports data remains in `ReportsPanel` unless a current value can be reused without changing domain/read-model ownership.

## Responsive behavior

### Desktop reference

Use two explicit verification sizes:

- **1920×1080** — mock/reference composition;
- **1280×800** — practical laptop regression target.

At both sizes:

- the map remains the dominant background surface;
- top HUD controls do not collide with the left rail;
- inspectors remain fully usable and do not sit underneath controls;
- management workspace fits within the viewport and scrolls its content region when necessary.

### Compact layout

Below the existing compact breakpoint, preserving access is more important than matching desktop composition.

The management rail may become a horizontally scrollable bottom dock or equivalent compact strip. Time controls remain reachable. Inspector positioning may remain bottom-sheet-like as today.

Do not build a separate mobile architecture or duplicate action set.

## Accessibility and keyboard behavior

The redesign changes visible composition, not interaction ownership.

Requirements:

- every icon-only button has a localized accessible name;
- management buttons continue to expose their label and hotkey through `title`/tooltip treatment;
- existing keyboard shortcuts still resolve through the route's central shortcut handler;
- `TopBar` alerts keep current outside-click dismissal and live status behavior;
- `GameMenu` keeps its focus trap and Escape behavior;
- `ManagementPanelHost` remains `aria-modal="true"` and focus trapped;
- map inspectors remain non-modal dialogs;
- global Escape priority remains in `+page.svelte`;
- `prefers-reduced-motion` behavior remains respected.

No component in this ticket adds a new global key listener.

## Data flow

The intended flow stays one-way:

```text
GameState / route derived state
          │
          ▼
      +page.svelte
       │   │   │
       │   │   ├── TopBar / ControlDesk
       │   ├────── MapInspectorHost
       └────────── ManagementPanelHost
                      │
                      └── existing panel components

user action
   │
   ▼
existing callback
   │
   ▼
+page.svelte command handler
   │
   ▼
GameRouteController / pure game modules
```

No mutable game state is copied into a UI store or context.

## Testing strategy

### Component tests

Update focused browser component specs for changed ownership and presentation contracts:

- `TopBar.svelte.spec.ts` — direct map-view controls, existing alerts/menu/readouts;
- `GameMenu.svelte.spec.ts` — map-view tabs removed, locale/menu-content behavior retained;
- `ControlDesk.svelte.spec.ts` and `ControlDesk.timeControls.svelte.spec.ts` — icon navigation, hotkeys/accessibility, disabled states, rail build, pause/speed;
- `TileInspector.svelte.spec.ts` — store art, vitals, attention, upgrade/details behavior;
- existing industry/rail/logistics inspector specs — shell changes do not alter action callbacks;
- `ManagementPanelHost.svelte.spec.ts` — rail, active state, in-place switch callback, modal/focus/close behavior, existing child composition;
- `Scorecard.svelte` coverage — four current scores remain represented and accessible.

Tests should assert behavior and accessible structure, not brittle CSS implementation details.

### Route E2E

Use existing route E2E as the integration boundary. Add only assertions required to prove the new composition:

- direct Retail / Industry / World switching from the top HUD;
- management rail opens a panel;
- management workspace switches panel in place;
- an inspector remains interactable at desktop laptop size;
- existing keyboard shortcut path still opens the expected destination.

`retail-sim.e2e.ts` remains the primary cross-feature smoke. Existing time-flow E2E remains authoritative for automatic simulation timing; HPA-304 must not rewrite it just because controls move visually.

## Implementation surface

### Create

Expected minimal new presentation files:

- `src/lib/components/game/GameIcon.svelte`
- `src/lib/components/game/gameIcon.ts` — `GameIconName` type only, if needed for cross-component typing.

Do not add additional wrappers unless duplication becomes concrete during implementation.

### Modify

Primary files:

- `src/lib/components/game/TopBar.svelte`
- `src/lib/components/game/TopBar.svelte.spec.ts`
- `src/lib/components/game/GameMenu.svelte`
- `src/lib/components/game/GameMenu.svelte.spec.ts`
- `src/lib/components/game/ControlDesk.svelte`
- `src/lib/components/game/ControlDesk.svelte.spec.ts`
- `src/lib/components/game/ControlDesk.timeControls.svelte.spec.ts`
- `src/lib/components/game/TileInspector.svelte`
- `src/lib/components/game/TileInspector.svelte.spec.ts`
- focused industry/rail/logistics inspector files/specs as required by the shared shell changes;
- `src/lib/components/game/Scorecard.svelte`
- `src/routes/MapInspectorHost.svelte`
- `src/routes/ManagementPanelHost.svelte`
- `src/routes/ManagementPanelHost.svelte.spec.ts`
- `src/routes/+page.svelte`
- `src/routes/retail-sim.e2e.ts`
- `src/lib/styles/frames.css`

Translation files change only if implementation discovers genuinely new user-facing copy. Reuse current labels wherever possible.

## Risks and controls

### Icon-only controls reduce discoverability

**Control:** keep localized accessible labels, hover/focus title/tooltips, and the existing shortcut cheat sheet. Build remains visually stronger than management destinations.

### HUD rail collides with Phaser content

**Control:** the rail overlays the map presentation without changing snapshots or tile coordinates. Verify 1920×1080 and 1280×800; do not add game-world padding or mutate map generation.

### Inspector geometry regresses at laptop widths

**Control:** remove only bottom offsets tied to the old wrapping footer, then exercise the inspector at 1280×800 in E2E.

### Management panel rewrite grows too large

**Control:** revamp the shell first. Keep existing panel bodies and mutation contracts. Only `Scorecard` gets a deliberate body-level visual upgrade in this ticket.

### Mock-only data leaks into domain scope

**Control:** render only values already exposed by current state/read models. Omit decorative trend/history values that do not exist.

### Route becomes a UI detail owner again

**Control:** route changes are limited to shared management item metadata and callback wiring. CSS stays with `TopBar`, `ControlDesk`, `MapInspectorHost`, and `ManagementPanelHost`.

## Non-goals

- simulation, balance, economy, or event-rule changes;
- persistence/save-schema changes or migrations;
- Phaser map-renderer rewrite;
- a UI framework, runtime theme selector, generic component registry, or global state store;
- a new icon dependency;
- fabricated chart history or cash trends;
- full internal redesign of every management panel;
- a separate mobile UI system;
- backward-compatibility work.

## Acceptance criteria

- [ ] Gameplay HUD follows the approved Vitrine/art-forward language at 1920×1080 and remains usable at 1280×800.
- [ ] Retail / Industry / World switching is directly available from the top HUD and preserves existing map behavior.
- [ ] Build and every current management destination remain reachable with existing keyboard shortcuts.
- [ ] Pause/resume, simulation speed, shortcut help, conditional rail build, alerts, menu, and localization still work.
- [ ] Retail inspector is art-forward and uses only existing store state/read data.
- [ ] Industry, rail, and logistics inspectors share the revised presentation language without behavior regressions.
- [ ] Management overlay uses the parchment workspace + left icon rail and switches panels in place.
- [ ] Existing management panel components remain the behavior owners; no replacement framework is introduced.
- [ ] Existing parchment/brass tokens remain authoritative; no parallel theme system is added.
- [ ] Accessible names, focus handling, Escape/backdrop close behavior, and keyboard shortcuts remain covered.
- [ ] Targeted component tests and critical route E2E cover the new shell/navigation interactions.
- [ ] `bun run check`, `bun run lint`, relevant focused unit/component tests, and targeted E2E pass.
