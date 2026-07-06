# Game UX — Control-Desk HUD, Shop Basic/Detail Split, Shortcuts & Industry Supply Advisor

**Status:** Implemented — shipped design deviates from the original draft in three places (noted inline below); see the "Shipped deviations" notes in Parts 1 and 3.
**Date:** 2026-07-01
**Scope:** A UX overhaul of the in-game HUD and information architecture, in four connected parts:

1. **Bottom "Control Desk" HUD** + a slim top resource/alerts bar (builder-sim layout).
2. **Shop info split** — a compact glanceable *Basic* card plus a large *Detail* popup.
3. **Keyboard shortcuts** with discoverable on-button keycaps and a cheat-sheet.
4. **Industry "what to build" Supply Advisor** + recipe-card build menu.

This is primarily a presentation/information-architecture change. Parts 1–3 restructure existing markup and reuse existing overlay patterns. Part 4 adds one new pure-logic module (`supplyAdvisor.ts`) plus a build-menu redesign. No changes to the core simulation transitions (`simulateDay`, placement, staffing, stock, production).

## Motivation

The current UI works but does not read like a building-simulation game and hides its own depth:

- **Controls are jammed top-right** (`+page.svelte` `.map-hud`) and every management panel (Dashboard, Policies, Staff, Stores, Decisions, Reports, Product Chains) hides behind one hamburger dropdown. There is no persistent command surface — nothing like the bottom toolbar players expect from SimCity / Cities: Skylines / Anno.
- **The shop popup does too much.** `TileInspector.svelte` crams four tabs (Details, Stock, Product Chain, Staff) into a `min(360px)`-wide right rail up to `37rem` tall. The Stock table and Product Chain view are genuinely hard to read at that width.
- **Almost nothing is keyboard-driven.** `handleKeydown` only handles `Escape` (plus audio-unlock on any key). Frequent actions — build, advance day, switch map — all require pointer travel to the top-right.
- **The industry city is illegible.** The production chain is deep (raw resource → intermediate → finished retail good), but `BuildMenu.svelte` presents industrial buildings as a flat list behind a text product-filter. It never shows a building's inputs/output, what is missing upstream, or which building to build next. The chain graph that *would* explain this is buried inside a management panel.

## Constraints

- Svelte 5 runes-mode (forced), Tailwind v4, scoped `<style>` blocks. Component code and `.svelte.spec.ts` use `$state` / `$derived` / `$effect`.
- Keep the **Mercantile Ledger** aesthetic (see `2026-05-16-mercantile-ledger-ui-redesign-design.md`): warm parchment `.paper`/`.plaque` panels, brass inner-rule, grain texture, aged-ink typography (`--font-display` / `--font-ui` / `--font-body` / `--font-mono`), wax-red accents, moss primary. **No new visual language.**
- The map renderers are snapshot-driven and read `data-*` attributes in e2e (`data-store-sprite-count`, etc.). **Do not change** renderer contracts or those attributes. HUD chrome sits above the canvas as it does today.
- Preserve the `isMapPaused` optimization: the Phaser loop pauses when an overlay covers the map. New overlays (Detail popup, Advisor) must feed into `isMapPaused` the same way existing panels do.
- Existing unit + e2e specs must keep passing; e2e HUD interactions may need selector updates where markup moves, but the underlying flows (build → place, advance day, open panel) stay intact.
- All new pure logic (`supplyAdvisor.ts`) ships with `*.spec.ts` in the `server` Vitest project. New Svelte behavior gets `.svelte.spec.ts` in the `client` project. `vite.config.ts` requires every test to contain an `expect`.

## Aesthetic direction

The bottom command strip is framed as the shopkeeper's **control desk** — a parchment strip with a brass top-rule, seated at the base of the map like a ledger laid open on a desk. The top bar is a thin brass **rule-line** carrying the location plaque, day/cash tickers, and a wax-seal **alerts bell**. Keycaps are rendered as small engraved brass tiles, consistent with the plaque hardware already in use. Nothing here introduces a new palette or font.

---

## Part 1 — Bottom "Control Desk" HUD + top resource/alerts bar

### Layout

```text
┌───────────────────────────────────────────────────────────────────────┐
│  [◈ Harbor City]                                  Day 42 · $128,400  🔔3 │  top bar (slim)
│                                                                         │
│                          ( MAP CANVAS )                                 │
│                                                                         │
├───────────────────────────────────────────────────────────────────────┤
│  ⌂ BUILD (B) │ ▦ Retail  ⚙ Industry  ◎ World │ ▤ Stores ♟ Staff ⛁ Policies … │ ▶ ADVANCE DAY │
└───────────────────────────────────────────────────────────────────────┘
```

**Top bar** (`.top-bar`, slim, `pointer-events` only on its chips):
- Left: current **map-title plaque** (moved from today's `.map-title`) — eyebrow + city name. Keeps "where am I."
- Right: **Day** and **Cash** tickers (moved from `.hud-status` / `.map-title` status line) + an **alerts bell** with a count badge.

**Bottom desk** (`.control-desk`, `.paper` strip with brass top-rule, full width, `z-index` above canvas below modals):
- **Build** button (disabled on World view, as today). Primary-ish, carries its `B` keycap.
- **View switcher** as segmented brass tabs: Retail / Industry / World (replaces the hamburger's map list). Active tab uses the existing `.active-view` treatment.
- **Management launchers**: labeled icon buttons for the seven `managementPanelMenuItems` (Dashboard, Policies, Staff, Stores, Decisions, Reports, Product Chains). On narrow widths these collapse into a single "Manage ▾" popover that lists them (reuses today's dropdown styling).
- **Advance Day** as the moss primary at the far right (thumb-reachable "end turn"), carrying its `Space` keycap.
- **⚙ Menu** button on the desk (or top-bar far right) opens Saves + Audio settings (today's `openSavePanel` + `AudioSettings`).

> **Shipped deviation (Part 1):** The view switcher and ⚙ Menu did **not** land on the Control Desk. They moved to the top bar's `GameMenu.svelte` hamburger (top-right), which holds the Retail/Industry/World tabs and the Saves/Audio menu content. The desk retains Build, the seven management launchers, and Advance Day. This was a deliberate UX call (one consolidated menu in the top bar rather than splitting view switching between two surfaces) and is accepted; acceptance criterion #1 below is read as "Build, all seven management panels, and Advance Day" — view switching lives in the top bar.

### Alerts (new)

A `$derived` `alerts` array computed from existing state — no new persisted fields:
- Stores with any product `Out of stock` / `Needs import` (from `StoreProductStatus` in `stock.ts`).
- Pending `game.decisions`.
- Industrial buildings with `blockedDays > 0` or status indicating starved inputs (from `IndustrialBuilding`).

The bell shows the count; clicking it opens a lightweight **alerts list** popover whose rows deep-link to the relevant surface (select the store / open Decisions / select the blocked building). Alerts are the mechanism that pulls attention to problems the player would otherwise miss.

### Responsive

Below ~980px the desk wraps: Build + Advance Day stay pinned; view switcher + management collapse into "View ▾" and "Manage ▾" popovers. The top bar drops the cash ticker if space is tight (cash still visible via the alerts/menu area), matching today's `@media (max-width: 980px)` approach.

### Alternative considered

Keep controls top and add only a bottom build-tray. Rejected — the request is explicitly for a builder-sim bottom menu, and one consolidated desk is more legible than two competing control zones.

---

## Part 2 — Shop info: compact **Basic** card → large **Detail** popup

Reuse two existing patterns: the small right-rail `inspector-overlay` becomes the **Basic** card; the large centered `control-tower` modal (already `min(1180px)`) hosts the **Detail** popup.

### Basic card (`TileInspector` store view, ~320px, glanceable)

- Header: archetype thumbnail + store name + neighborhood + **level badge**.
- Three **vital gauges**: Revenue/day (from `latestStoreReport`), Stock health, Staff morale — rendered as compact pip/meter chips.
- **Attention flag** shown only when relevant (e.g. "2 products out of stock", "understaffed"), derived from the same signals feeding Part 1 alerts.
- Primary actions: **Upgrade — $cost** (existing `onUpgradeStore` + `getStoreUpgradeCost` / affordability logic) and **Open Details ▸**.

Empty tiles keep today's compact stat card (Demand / Rent / Foot traffic / Customer fit). No detail popup for empty tiles.

### Detail popup (large centered modal)

- The current four tabs (Details / Stock / Product Chain / Staff) move here, using the **same bookmark-tab styling** but in the wide surface, so `StoreStockTable` and `StoreProductChainPanel` finally get horizontal room.
- **Shipped deviation (Part 2 — three tabs):** The Details tab stays in the Basic card (identity, level badge, vital gauges, Upgrade, attention flag) rather than duplicating inside the modal. `StoreDetailModal.svelte` therefore hosts **three** tabs (Stock / Product Chain / Staff). The Basic card's "Open Details" opens the modal for the heavy tabs only. See the plan doc (`docs/superpowers/plans/2026-07-01-shop-basic-detail-split.md`) for the explicit decision.
- Opened from the Basic card's "Open Details"; closed via `Esc` / backdrop / close button. Feeds `isMapPaused` like the control-tower does today.

### Component split

- `TileInspector.svelte` slims to the **Basic** card + tile stats (keeps its map-interaction blocking attachment and close affordance).
- A new `StoreDetailModal.svelte` hosts the three heavy tabs (Stock/Chain/Staff) in the large surface; the Details content remains in the Basic card (see the shipped-deviation note above). It receives the same props `TileInspector` passes to its tab panels today (`game`, `store`, `staff`, `hiringCandidates`, `latestStoreReport`, the `onUpdate*` / `onHire*` / `onAssign*` / `onUpgradeStore` callbacks). Tab markup moves out of `TileInspector` into this modal largely as-is.
- `+page.svelte` gains a `isStoreDetailOpen` `$state` toggle and renders `StoreDetailModal` next to the control-tower overlay.

### Alternative considered

A slide-over drawer instead of a centered modal. Rejected — the centered control-tower modal already exists, is proven, and keeps the two large surfaces (management + store detail) visually consistent.

---

## Part 3 — Keyboard shortcuts

Discoverable, not hidden: each shortcut-bearing button renders a small brass **keycap** glyph, and `?` opens a cheat-sheet overlay.

| Key | Action | Wiring |
|-----|--------|--------|
| `B` | Open Build menu | `openBuildMenu()` (guard: not World view) |
| `Space` | Advance Day | `advanceDay()` (guard: game exists, no text input focused) |
| `1 / 2 / 3` | Retail / Industry / World view | `showRetailMap` / `showIndustryMap` / `showWorldMap` |
| `Esc` | Cancel / close | existing `handleKeydown` chain |
| `?` | Toggle shortcut cheat-sheet | new overlay |

- Extend `handleKeydown` in `+page.svelte`. Ignore shortcuts when focus is in an `input` / `textarea` / `select` or when a modal owns focus (Build menu already traps focus; respect that).
- Management letter keys (`P` Policies, `R` Reports, `C` Chains) are **optional in the first pass** — add once the desk layout settles and collisions are confirmed clear.
- Cheat-sheet is a small `.paper` overlay listing the table above; also reachable from the ⚙ Menu.

> **Shipped deviation (Part 3 — letter keys):** All seven management letter shortcuts shipped in the first pass, not just the deferred `P`/`R`/`C` set. The final mapping (in `keyboardShortcuts.ts`) is `D` Dashboard, `P` Policies, `S` Staff, `T` Stores, `C` Decisions, `R` Reports, `G` Product Chains. Note the non-obvious mnemonics forced by collisions: `C`→Decisions (not Chains, since "Chains" lost to "Decisions"), `G`→Product Chains, `T`→Stores (because `S` went to Staff). The cheat-sheet (`?`) lists the full set so the mapping is discoverable.
>
> **Shipped deviation (Part 3 — Escape):** Escape does more than cancel/close. When nothing else is open or selected, Escape **opens** the top-bar `GameMenu` hamburger (so the menu is reachable from the keyboard without a pointer). The close chain still runs first: open overlays/tile selections close in priority order before Escape falls through to opening the menu.

---

## Part 4 — Industry "what to build": Supply Advisor + recipe cards

The frame: **start from retail demand, walk the chain, name the next building.** Chosen scope for the first pass: **Advisor + recipe cards** (the fuller fix), with the existing chain graph retained as the deep view.

### 4a. Recipe-card build menu (`BuildMenu.svelte`, industry side)

Replace the flat industry option rows with **recipe cards**. Each card shows, for a building type:
- Building art + name + **tier** badge (Tier 1 chains flagged as **"Starter"** — bottled water, produce, pantry).
- **`inputs → output`** with material icons, read from `PRODUCTION_RECIPES[type.recipeId]` (inputs list) and the recipe's produced material (`getIndustryMaterialArt` for icons).
- **Availability status** per input: *Available* (a placed building already produces it, or the warehouse holds it) vs *Missing — needs a {Building}*. Raw-resource buildings (empty `inputs`) show their required tile resource (farmland/forest/mine anchor) instead.
- Build cost + daily operating cost (as today).

Keep the existing product-chain filter, but sort/group by **tier** so the starter chains are the obvious on-ramp.

### 4b. Supply Advisor (new panel + new pure module)

A **"Supply Advisor"** surface (reachable from the bottom desk on the Industry view, and/or the industry inspector's empty state) that answers "what should I build next?"

- **Input:** the set of product categories the player's stores want to sell (retail demand), current placed industrial buildings, and the recipe graph.
- **Output:** for each wanted finished good, a **checklist** of the chain with each step marked *built* / *build-next* / *blocked*, e.g.:

  > **To stock Snacks:** ✓ Grain Farm · ✗ Flour Mill *(Build)* · ✗ Snack Factory *(Build)*

- The first missing, buildable step for each chain is the **"build this next"** call to action; clicking it arms placement for that building type (reuses `armIndustryPlacement`).
- Starter (Tier 1) chains are surfaced first for new players.

**New pure module `src/lib/game/supplyAdvisor.ts`:**
- Reads: store product categories (via `archetypes.startingCategories` / store `products`), `INDUSTRIAL_BUILDING_TYPES`, `PRODUCTION_RECIPES`, and existing chain helpers in `productChainGraph.ts` / `productChainTree.ts`.
- Maps a finished-good category → its producing recipe/building → walks input materials recursively to their producing buildings, terminating at raw-resource buildings.
- For each chain node, determines state from placed buildings: `built` (a building of that type exists), `buildable` (all inputs are `built` or raw), or `blocked` (an upstream input is still missing).
- Returns an ordered list of `{ category, steps: [{ buildingTypeId, name, tier, state }] }`, with the first `buildable && !built` step per chain flagged as the recommended next build.
- Deterministic, no RNG. Fully unit-tested (`supplyAdvisor.spec.ts`), including: a fresh industry city (recommends a Tier-1 starter), a partially-built chain (recommends the next missing step, not a blocked one), and a fully-supplied category (chain shows all `built`).

**New component `SupplyAdvisor.svelte`** renders the advisor output as the checklist above, with per-step "Build" actions wired to `armIndustryPlacement`.

### Why this shape

The Advisor says **what** to build next, the recipe cards say **why** (inputs/output + what's missing), and the Tier-1 "Starter" tags say **where to start** — directly addressing "the player can't figure out what to build." The chain graph remains for players who want the full picture.

---

## File plan

### New files
- `src/lib/game/supplyAdvisor.ts` — pure demand-driven chain planner.
- `src/lib/game/supplyAdvisor.spec.ts` — unit tests (server project).
- `src/lib/components/game/ControlDesk.svelte` — bottom command strip.
- `src/lib/components/game/ControlDesk.svelte.spec.ts` — component tests (client project).
- `src/lib/components/game/TopBar.svelte` — slim top resource/alerts bar (incl. alerts bell + popover).
- `src/lib/components/game/StoreDetailModal.svelte` — large three-tab store detail popup (Stock/Chain/Staff); Details stay in the Basic card.
- `src/lib/components/game/SupplyAdvisor.svelte` — industry advisor checklist.
- `src/lib/components/game/ShortcutCheatSheet.svelte` — `?` overlay.

### Modified
- `src/routes/+page.svelte` — replace `.map-hud` with `TopBar` + `ControlDesk`; add `isStoreDetailOpen` and Advisor toggles; extend `handleKeydown` with `B` / `Space` / `1-3` / `?`; fold new overlays into `isMapPaused`; add `alerts` `$derived`.
- `src/lib/components/game/TileInspector.svelte` — slim to Basic card + tile stats; move the three heavy tab panels into `StoreDetailModal`; add "Open Details" + vital gauges + attention flag.
- `src/lib/components/game/BuildMenu.svelte` — industry side becomes recipe cards (inputs→output, availability, tier/Starter grouping).
- Possibly `src/lib/components/game/IndustryTileInspector.svelte` — empty/no-building state links to the Supply Advisor.

### Untouched
- Core sim logic: `simulateDay.ts`, `placement.ts`, `industryPlacement.ts`, `industryProduction.ts`, `staffing.ts`, `stock.ts`, `state.ts`, `leveling.ts`, `world.ts`.
- Map renderers and their `data-*` contracts (`cityMapScene.ts`, `industryMapScene.ts`, `mapRender.ts`, `industryMapRender.ts`).
- Persistence (`saveCodec.ts` et al.) — no new persisted fields; alerts and advisor output are derived.

## Testing

- `supplyAdvisor.spec.ts`: fresh city, partial chain, fully-supplied, and blocked-vs-buildable ordering.
- `ControlDesk.svelte.spec.ts`: renders build/view/manage/advance affordances; disables Build on World view; alert count reflects derived alerts.
- `StoreDetailModal.svelte.spec.ts`: tab switching; renders Stock/Chain/Staff panels with room; close via Esc/backdrop.
- `+page.svelte` / e2e (`retail-sim.e2e.ts`): update selectors where HUD markup moved; verify `B` opens build, `Space` advances day, `1/2/3` switch views, store click → Basic card → "Open Details" → large modal. Preserve the existing pattern of awaiting canvas `data-*` before clicking.
- `lint`, `check`, `test:unit`, `test:e2e` all green.

## Acceptance criteria

1. A persistent bottom control desk exposes Build, all seven management panels, and Advance Day; a slim top bar shows location, Day, Cash, an alerts bell with a live count, **and** the view switcher + ⚙ Menu via the `GameMenu` hamburger. (View switching moved off the desk to the top bar — see the Part 1 shipped-deviation note.)
2. Clicking a store shows a compact Basic card (vitals + Upgrade + Open Details); "Open Details" opens a large three-tab popup (Stock / Product Chain / Staff) where Stock and Product Chain are comfortably readable. The Details content lives in the Basic card itself (shipped deviation — see Part 2 note).
3. `B`, `Space`, `1/2/3`, `Esc`, and `?` work as specified, are ignored while typing in inputs, and each shortcut-bearing button shows its keycap; `?` opens a cheat-sheet. Additionally all seven management letter keys (`D`/`P`/`S`/`T`/`C`/`R`/`G`) toggle their panels (shipped beyond the first-pass set — see the Part 3 shipped-deviation note), and Escape opens the `GameMenu` when nothing else is open.
4. The industry build menu shows each building's inputs→output with availability and tier/Starter grouping; a Supply Advisor lists, per wanted retail good, the chain checklist with a one-click "build this next."
5. No regression to map rendering, the `isMapPaused` optimization, save/load, or the core simulation. Existing suites pass (with selector-only e2e updates).

## Open questions (for review)

- **Visual companion:** offered but not yet accepted — do you want browser mockups of the desk + shop panels before we lock layout?
- ~~**Management letter keys** (`P`/`R`/`C`) in the first pass, or defer?~~ **Resolved — shipped all seven** (`D`/`P`/`S`/`T`/`C`/`R`/`G`); see Part 3 deviation note.
- **Advisor placement:** a dedicated desk button on the Industry view, the industry inspector's empty state, or both?
- **Alerts depth:** first pass = out-of-stock stores + pending decisions + blocked factories. Enough, or include more (low cash, unfilled staff slots)?

## Out of scope

- Any change to simulation balance or transition logic.
- New art assets beyond reusing existing material/building/store sprites and hardware motifs (per CLAUDE.md, raster art must come from the image-generation workflow, not scripts — none is required here).
- Making the chain graph itself the primary build tool (the ambitious "chain map as build tool" option) — deferred; the graph stays as the deep view.
