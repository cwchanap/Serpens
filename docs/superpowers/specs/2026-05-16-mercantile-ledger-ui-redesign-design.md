# Mercantile Ledger — UI Redesign

**Status:** Design approved, ready for implementation plan
**Date:** 2026-05-16
**Scope:** Skin-only restyle of the existing game UI to match a "mercantile tycoon ledger" aesthetic. No game-logic changes, no markup restructuring beyond class names and a few decorative spans.

## Motivation

The current UI is a generic dark blue-grey SaaS dashboard (`#11110f` body, `#5f8fd0` navy accents, Inter typography, flat 1px-bordered cards). The actual game is a retail + industry tycoon set in "Harbor City" with hand-drawn pixel-art shopfronts and factories — closer in spirit to *Anno*, *Two Point Hospital*, and cozy shopkeeper sims. The chrome and the content disagree.

The chosen aesthetic — **Mercantile Ledger** — frames the game as flipping through a tycoon's account book: warm parchment panels, brass hardware, aged-ink typography, occasional wax-seal accents, all floating on a deep walnut stage that preserves the map's tile legibility.

## Constraints

- Skin-only. No changes to `src/lib/game/*` logic. No prop/API changes on components.
- All existing unit specs and e2e specs must continue to pass without modification. The e2e suite reads `data-*` attributes on the canvas (e.g. `data-store-sprite-count`) — we do not touch those.
- Tailwind v4 + Svelte 5 runes-mode + scoped `<style>` blocks remain the styling model.
- Performance: first paint must not regress by more than ~100 ms with the four Google Fonts added.

## Aesthetic direction

**Mercantile Ledger.** Warm tycoon-trading-house feel. Dark walnut stage for the map. Parchment + brass + ink for all overlays. Wax-red and moss-green reserved for state colors (urgent/healthy). Display serif + body serif + UI sans + ledger-mono typography.

Layout direction: **dark stage with parchment overlays.** Phaser map renders on a deep walnut backdrop. All HUD/inspector/build/tower/save overlays are parchment panels.

## Design tokens

A single `src/lib/styles/tokens.css` defines CSS custom properties. Components reference `var(--…)`; no hex literals remain inside component `<style>` blocks.

### Palette

```css
/* Parchment */
--paper-50:   #FBF3DC;
--paper-100:  #F4E8CE;
--paper-200:  #E9DBB5;
--paper-300:  #D7C28C;
--paper-edge: #B8A271;

/* Ink */
--ink-900:    #1B130A;
--ink-700:    #2A1F12;
--ink-500:    #4A3B27;
--ink-400:    #6E5C42;

/* Walnut stage */
--walnut-900: #14100A;
--walnut-800: #1F1810;
--walnut-700: #2C2316;

/* Brass */
--brass-700:  #8E6420;
--brass-500:  #B8862F;
--brass-300:  #D4A852;
--brass-100:  #EFD79A;

/* State colors */
--wax-red:    #8E2A1F;  /* urgent, errors, cancel */
--wax-red-2:  #B53B2E;
--moss:       #4B5A2B;  /* healthy, approve, primary action */
--moss-2:     #6B7E3A;
--royal-ink:  #1E3A5F;  /* links, info */

/* Paper grain (inlined SVG, ~200×200 noise tile, ~6% opacity overlay) */
--grain-svg:  url("data:image/svg+xml;…");
```

### Typography

```css
--font-display: 'DM Serif Display', 'Cormorant Garamond', Georgia, serif;
--font-body:    'Spectral', 'IBM Plex Serif', Georgia, serif;
--font-ui:      'IBM Plex Sans', system-ui, sans-serif;
--font-mono:    'JetBrains Mono', 'IBM Plex Mono', monospace;
```

Usage rules:

- **Display serif** — `h1` and `h2` only. Map title, modal titles, tile inspector header, build menu header.
- **Body serif** — paragraph copy and descriptions inside panels.
- **UI sans** — buttons, labels, chips, dropdown options.
- **Mono** — all numeric values (cash, day counter, currency, stock counts). `font-variant-numeric: tabular-nums lining-nums` so columns of cash align.
- `.eyebrow` class: UI sans, uppercase, `letter-spacing: 0.18em`, brass color.
- `h1` map title: a 2.5rem brass hairline rule sits above it.

Fonts are loaded from Google Fonts in `+layout.svelte` with one `<link rel="preconnect">` and `display=swap`.

## Frames and hardware

A small named family of reusable patterns; most components map onto exactly one.

### `.paper` — default parchment panel

- Background: `--paper-100` plus the grain SVG overlay at ~6% opacity.
- Border treatment: 1px solid `--ink-700` outer, then 3px parchment gap, then 1px `--brass-500` inner. Implemented via `border` + `box-shadow: inset 0 0 0 2px var(--paper-100), inset 0 0 0 3px var(--brass-500);`.
- Corner radius: 2px.
- Drop shadow: `0 16px 36px rgba(15,10,3,0.45)`.
- **Applied to:** `Scorecard`, `DecisionQueue`, `PolicyPanel`, `StaffPanel`, `ReportsPanel`, `StoreOverview`, `TileInspector`, `IndustryTileInspector`, `SavePanel`, `BuildMenu`, the Control Tower modal.

### `.plaque` — small floating HUD chips

- Background: `--paper-50` with stronger grain.
- Brass top + bottom hairline only (no full border).
- **Applied to:** map title block, day/cash HUD chip, placement-status bar.

### `.stage` — map shell

- Background: `--walnut-900` with a subtle radial vignette darkening corners.
- No border.
- **Applied to:** `.map-layout`.

### Hardware accents

1. **Brass corner brackets** — tiny ◢◣ marks at the four corners of `.paper`, made with `::before`/`::after` CSS borders. No assets needed.
2. **`.seal`** — circular `--wax-red` chip for urgent states (expiring decisions, build-blocked tiles, error rows). Replaces blunt red text.
3. **`.bookmark`** — narrow vertical `--wax-red` ribbon clipped with a notch, marks the active tab in `TileInspector` (Details / Stock / Staff).
4. **`.ledger-rule`** — 1px brass horizontal line with 6px end-caps, replaces existing `<hr>` and visually separates `h2` from body inside panels.

### Buttons

- **Default**: parchment fill, ink border, brass top hairline. Hover → 1px lift, fill darkens to `--paper-200`.
- **Primary** (Advance Day): solid `--moss` ink-stamp look, slight tilt (`transform: rotate(-0.6deg)`), inset stamped-edge shadow.
- **Danger** (placement cancel, save delete): wax-red ink stamp.
- **Icon buttons** (map HUD): 2.75rem brass-rimmed circles on parchment, ink stroke.

## Component-by-component layout treatment

The skin pass keeps existing structure. Markup changes are limited to adding class names and a handful of decorative `<span>` elements (corner brackets, bookmark ribbons). No prop/API changes.

### Map HUD (`+page.svelte`)

- Title block → `.plaque`. Eyebrow `HARBOR CITY MAP — VOL. I`, city name in display serif, `Day N · $cash` in mono. Decorative wax-red bookmark drops from top-left corner.
- Three icon buttons stay (brass-rimmed circles, ink-stroke SVGs).
- Primary "advance day" button → moss ink-stamp variant, slight tilt, mono day counter pinned below.
- HUD status chip → mono numerals, brass underline, parchment background.

### Placement status bar

- Bottom-left, `.plaque` frame.
- Leading brass compass icon.
- Status text in body serif, italic when hint, upright when error.
- Cancel button: wax-red, small-caps `CANCEL`.

### Phaser placement preview tints

Both `cityMapScene.ts` and `industryMapScene.ts`:

- `PLACEMENT_PREVIEW_VALID_COLOR` → `0x6B7E3A` (moss).
- `PLACEMENT_PREVIEW_INVALID_COLOR` → `0x8E2A1F` (wax-red).

One-line constant changes each, no other Phaser logic touched.

### BuildMenu

- `.paper` frame, width bumped from 31rem to 36rem.
- Heavy ledger rule under the header.
- Each option row: sprite thumbnail on a `--paper-200` square with 1px brass border, name in display serif, ranges in mono, valid-tile count in brass small-caps.
- Hover state: row fill → `--paper-200` with a 1px wax-red left edge.
- Disabled rows: 50% opacity + small `UNAVAILABLE` wax-stamp overlay at top-right (CSS pseudo-element).

### TileInspector / IndustryTileInspector

- Right-side overlay (~360 px), `.paper` frame.
- Header: tile coordinates in mono (`No. 47 · col 12 / row 3`), tile type label in display serif.
- Three tabs (Details / Stock / Staff) become bookmark-style chips; the active tab gets a wax-red `.bookmark` ribbon.
- Store sprite rendered with a parchment-stamp halo behind it.
- All numbers → mono tabular.

### Control Tower modal

- Backdrop: `rgba(20,16,10,0.74)` (warmer than today's blue-black) with `blur(4px)`.
- Modal: single `.paper` frame, 1180 px wide.
- Header: eyebrow `MANAGEMENT VIEW`, h2 "Control Tower" in display serif, brass ledger-rule below.
- Action row (`Day 142 · $14,920 cash · Close`) becomes a brass-bordered ribbon across the top.
- Each child panel (`Scorecard`, `PolicyPanel`, etc.) uses an inset variant of `.paper`, reading as sections of one open spread.

### SavePanel

- `.paper` frame.
- Each save slot: parchment row with a small wax-seal date stamp on the left, slot name in display serif, timestamp in mono, `LOAD` / `DELETE` ink-stamp buttons.
- Auto-save row gets a brass `AUTO` chip.

## Motion

Restraint by design. Three patterns only.

1. **Page-load ink-set** — `.paper` panels fade in with a 120 ms opacity tween + 4 px upward translate. Staggered by `animation-delay`: HUD plaque (0 ms), inspector (80 ms), control tower (160 ms). Pure CSS, no JS.
2. **Button press** — `:active` translates 1 px down and drops the box-shadow. No bounce.
3. **Wax-seal pulse** — only on actively expiring decisions, the wax-seal corner-mark pulses its box-shadow over a 2 s loop.

All three are disabled under `prefers-reduced-motion: reduce`.

## File plan

### New files (3)

- `src/lib/styles/tokens.css` — palette and typography custom properties.
- `src/lib/styles/frames.css` — `.paper`, `.plaque`, `.stage`, `.seal`, `.bookmark`, `.ledger-rule`, `.eyebrow`, button variants. Global, imported once.
- `src/lib/assets/paper-grain.svg` — single 200×200 noise tile. Base64-inlined as `--grain-svg`.

### Modified (15)

- `src/routes/layout.css` — imports tokens + frames, replaces body gradient with walnut wash, switches default `font-family` to UI sans.
- `src/routes/+layout.svelte` — adds Google Fonts `<link>` with preconnect (DM Serif Display, Spectral, IBM Plex Sans, JetBrains Mono).
- `src/routes/+page.svelte` — `<style>` block only: hex → vars, `.map-title` → `.plaque`, `.control-tower-overlay` → `.paper`, button classes, ribbon header. Markup change limited to a few wrapper class names.
- `src/lib/components/game/*.svelte` — 12 component files. `<style>` blocks restyled to reference tokens and adopt the appropriate frame. No script changes. No prop changes. Markup changes limited to adding class names and decorative spans (corner brackets, bookmark ribbons, seal chips).

### Map renderers (2 one-line edits)

- `src/lib/phaser/cityMapScene.ts` — retune two color constants.
- `src/lib/phaser/industryMapScene.ts` — same.

### Untouched

- All `src/lib/game/*` (pure logic).
- All `*.spec.ts` and `*.e2e.ts` files. Specs assert behavior and `data-*` attributes, not visual styling.
- `src-tauri/` and Tauri configuration.
- `src/lib/assets/gameArt.ts` (no new sprite registration; brass corners and wax seals are CSS-only).

## Acceptance criteria

- `grep -rn '#[0-9a-fA-F]\{3,6\}' src/lib/components/game/ src/routes/` returns zero hits inside `<style>` blocks (excluding the two scene files which keep hex constants for Phaser).
- `bun run lint` clean.
- `bun run check` clean.
- `bun run test:unit` green.
- `bun run test:e2e` green.
- Manual smoke: load `/`, build a retail store, advance a day, open Control Tower, open Save panel. Everything legible and on-theme on the walnut stage.
- Lighthouse first-paint regression ≤ 100 ms vs. current baseline.

## Out of scope

- Recoloring Phaser terrain tile fills (commercial/residential/etc.). Light pastels read fine on walnut; revisit only if we ever want full-parchment mode.
- Restructuring Control Tower into tabbed pages.
- Reshaping BuildMenu into a 2-page catalog spread.
- Replacing icon SVGs with custom engraved-brass versions.
- New sprite art for any store / industry building / terrain.
- Touch-device gesture changes.
- Internationalization of small-caps / display-serif labels (current UI is English-only).
