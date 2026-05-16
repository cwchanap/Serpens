# Mercantile Ledger UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the entire Serpens game UI to a "mercantile ledger" aesthetic (parchment + brass + ink overlays on a deep walnut stage), without changing any game logic, prop APIs, or markup beyond class names and decorative spans.

**Architecture:** Two new global CSS files (`tokens.css`, `frames.css`) define design tokens and a small named family of frame/hardware patterns. Every component's scoped `<style>` block is rewritten to reference `var(--…)` tokens and apply a frame class. Two Phaser scene files get one-line color-constant retunes. No game-logic or test code is touched.

**Tech Stack:** SvelteKit + Svelte 5 (runes mode) + Tailwind v4 + Phaser 4. Existing scoped-CSS-per-component styling model is preserved.

**Spec:** `docs/superpowers/specs/2026-05-16-mercantile-ledger-ui-redesign-design.md`

---

## File Structure

**New files (3):**
- `src/lib/styles/tokens.css` — CSS custom properties (palette, typography, grain).
- `src/lib/styles/frames.css` — `.paper`, `.plaque`, `.stage`, `.seal`, `.bookmark`, `.ledger-rule`, `.eyebrow`, button variants. All global.
- `src/lib/assets/paper-grain.svg` — single 200×200 noise tile (referenced inline as data URI from tokens.css).

**Modified (16):**
- `src/routes/layout.css` — import tokens + frames, swap body background to walnut, default `font-family` to UI sans.
- `src/routes/+layout.svelte` — Google Fonts preconnect + `<link>` for DM Serif Display, Spectral, IBM Plex Sans, JetBrains Mono.
- `src/routes/+page.svelte` — `<style>` block only: replace hex with vars, swap class names. A few decorative `<span>` elements in markup for HUD plaque ornament.
- `src/lib/components/game/Scorecard.svelte`
- `src/lib/components/game/DecisionQueue.svelte`
- `src/lib/components/game/PolicyPanel.svelte`
- `src/lib/components/game/ReportsPanel.svelte`
- `src/lib/components/game/StoreOverview.svelte`
- `src/lib/components/game/StaffPanel.svelte`
- `src/lib/components/game/TileInspector.svelte`
- `src/lib/components/game/IndustryTileInspector.svelte`
- `src/lib/components/game/StoreStaffPanel.svelte`
- `src/lib/components/game/StoreStockTable.svelte`
- `src/lib/components/game/BuildMenu.svelte`
- `src/lib/components/game/SavePanel.svelte`
- `src/lib/components/game/CityMap.svelte`
- `src/lib/components/game/IndustryMap.svelte`
- `src/lib/phaser/cityMapScene.ts` — two constants only.
- `src/lib/phaser/industryMapScene.ts` — same.

**Untouched:**
- All `src/lib/game/*` (pure logic).
- All `*.spec.ts` and `*.e2e.ts` files.
- `src-tauri/` and Tauri config.
- `src/lib/assets/gameArt.ts`.

---

## Task 1: Design tokens + paper grain

**Files:**
- Create: `src/lib/styles/tokens.css`
- Create: `src/lib/assets/paper-grain.svg`

- [ ] **Step 1: Create the paper grain SVG**

Write the file `src/lib/assets/paper-grain.svg` (this exists as a reference; the actual grain is inlined as data URI in tokens.css — keeping the SVG file on disk lets designers iterate):

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
  <filter id="n">
    <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
    <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0"/>
  </filter>
  <rect width="100%" height="100%" filter="url(#n)" opacity="0.55"/>
</svg>
```

- [ ] **Step 2: Create tokens.css with palette, type, and inlined grain**

Write `src/lib/styles/tokens.css`:

```css
:root {
	/* Parchment */
	--paper-50: #FBF3DC;
	--paper-100: #F4E8CE;
	--paper-200: #E9DBB5;
	--paper-300: #D7C28C;
	--paper-edge: #B8A271;

	/* Ink */
	--ink-900: #1B130A;
	--ink-700: #2A1F12;
	--ink-500: #4A3B27;
	--ink-400: #6E5C42;

	/* Walnut stage */
	--walnut-900: #14100A;
	--walnut-800: #1F1810;
	--walnut-700: #2C2316;

	/* Brass */
	--brass-700: #8E6420;
	--brass-500: #B8862F;
	--brass-300: #D4A852;
	--brass-100: #EFD79A;

	/* State colors */
	--wax-red: #8E2A1F;
	--wax-red-2: #B53B2E;
	--moss: #4B5A2B;
	--moss-2: #6B7E3A;
	--royal-ink: #1E3A5F;

	/* Typography */
	--font-display: 'DM Serif Display', 'Cormorant Garamond', Georgia, serif;
	--font-body: 'Spectral', 'IBM Plex Serif', Georgia, serif;
	--font-ui: 'IBM Plex Sans', system-ui, sans-serif;
	--font-mono: 'JetBrains Mono', 'IBM Plex Mono', monospace;

	/* Paper grain (200x200 noise tile, semi-transparent, inlined as data URI) */
	--grain-svg: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/></svg>");

	/* Shared shadow */
	--shadow-paper: 0 16px 36px rgba(15, 10, 3, 0.45);
}
```

- [ ] **Step 3: Lint & check**

Run: `bun run lint && bun run check`
Expected: PASS — no new files referenced yet, but lint must stay green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/styles/tokens.css src/lib/assets/paper-grain.svg
git commit -m "feat(ui): add mercantile-ledger design tokens"
```

---

## Task 2: Frames stylesheet

**Files:**
- Create: `src/lib/styles/frames.css`

- [ ] **Step 1: Write frames.css**

Write `src/lib/styles/frames.css`:

```css
/* --- Frames ------------------------------------------------------------- */

.paper {
	position: relative;
	border: 1px solid var(--ink-700);
	border-radius: 2px;
	background-color: var(--paper-100);
	background-image: var(--grain-svg);
	background-blend-mode: multiply;
	background-size: 200px 200px;
	color: var(--ink-700);
	box-shadow:
		inset 0 0 0 2px var(--paper-100),
		inset 0 0 0 3px var(--brass-500),
		var(--shadow-paper);
}

.paper::before,
.paper::after {
	content: '';
	position: absolute;
	width: 10px;
	height: 10px;
	border: 1.5px solid var(--brass-500);
	pointer-events: none;
}

.paper::before {
	top: 6px;
	left: 6px;
	border-right: 0;
	border-bottom: 0;
}

.paper::after {
	bottom: 6px;
	right: 6px;
	border-left: 0;
	border-top: 0;
}

.plaque {
	border: 0;
	border-top: 1px solid var(--brass-500);
	border-bottom: 1px solid var(--brass-500);
	background-color: var(--paper-50);
	background-image: var(--grain-svg);
	background-blend-mode: multiply;
	background-size: 200px 200px;
	color: var(--ink-700);
	box-shadow: var(--shadow-paper);
}

.stage {
	background:
		radial-gradient(ellipse at center, var(--walnut-800) 0%, var(--walnut-900) 75%),
		var(--walnut-900);
}

/* --- Hardware accents --------------------------------------------------- */

.eyebrow {
	margin: 0 0 0.35rem;
	color: var(--brass-700);
	font-family: var(--font-ui);
	font-size: 0.7rem;
	font-weight: 700;
	letter-spacing: 0.18em;
	text-transform: uppercase;
}

.ledger-rule {
	display: block;
	height: 1px;
	margin: 0.6rem 0;
	border: 0;
	background: linear-gradient(to right, transparent, var(--brass-500) 8%, var(--brass-500) 92%, transparent);
}

.seal {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 1.6rem;
	height: 1.6rem;
	padding: 0 0.4rem;
	border-radius: 999px;
	background: var(--wax-red);
	color: var(--paper-50);
	font-family: var(--font-ui);
	font-size: 0.7rem;
	font-weight: 700;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

.bookmark {
	position: absolute;
	top: 0;
	width: 0.7rem;
	height: 1.4rem;
	background: var(--wax-red);
	clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 75%, 0 100%);
	pointer-events: none;
}

/* --- Buttons ------------------------------------------------------------ */

.btn,
.paper button:not(.btn-primary):not(.btn-danger):not(.btn-icon):not(.bookmark-tab),
.plaque button:not(.btn-primary):not(.btn-danger):not(.btn-icon):not(.bookmark-tab) {
	font-family: var(--font-ui);
	font-size: 0.86rem;
	font-weight: 600;
	color: var(--ink-700);
	background: var(--paper-50);
	border: 1px solid var(--ink-700);
	border-top-color: var(--brass-500);
	border-radius: 2px;
	padding: 0.55rem 0.75rem;
	transition: transform 60ms ease-out;
}

.btn:hover,
.paper button:not(.btn-primary):not(.btn-danger):not(.btn-icon):not(.bookmark-tab):hover,
.plaque button:not(.btn-primary):not(.btn-danger):not(.btn-icon):not(.bookmark-tab):hover {
	background: var(--paper-200);
}

.btn:active,
.paper button:active,
.plaque button:active {
	transform: translateY(1px);
	box-shadow: none;
}

.btn-primary {
	font-family: var(--font-ui);
	font-weight: 700;
	color: var(--paper-50);
	background: var(--moss);
	border: 1px solid var(--ink-900);
	border-radius: 2px;
	padding: 0.6rem 0.95rem;
	transform: rotate(-0.6deg);
	box-shadow: inset 0 0 0 1px var(--moss-2);
	letter-spacing: 0.04em;
}

.btn-primary:hover,
.btn-primary:focus-visible {
	background: var(--moss-2);
}

.btn-danger {
	font-family: var(--font-ui);
	font-weight: 700;
	color: var(--paper-50);
	background: var(--wax-red);
	border: 1px solid var(--ink-900);
	border-radius: 2px;
	padding: 0.55rem 0.8rem;
	letter-spacing: 0.04em;
}

.btn-danger:hover,
.btn-danger:focus-visible {
	background: var(--wax-red-2);
}

.btn-icon {
	display: grid;
	place-items: center;
	width: 2.75rem;
	height: 2.75rem;
	padding: 0;
	color: var(--ink-700);
	background: var(--paper-50);
	background-image: var(--grain-svg);
	background-blend-mode: multiply;
	border: 1.5px solid var(--brass-500);
	border-radius: 999px;
	box-shadow: var(--shadow-paper);
}

.btn-icon:hover,
.btn-icon:focus-visible {
	background-color: var(--paper-200);
}

.btn-icon svg {
	width: 1.25rem;
	height: 1.25rem;
	fill: none;
	stroke: currentColor;
	stroke-linecap: round;
	stroke-linejoin: round;
	stroke-width: 2;
}

/* --- Motion ------------------------------------------------------------- */

@keyframes ink-set {
	from {
		opacity: 0;
		transform: translateY(4px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@keyframes seal-pulse {
	0%, 100% {
		box-shadow: 0 0 0 0 rgba(142, 42, 31, 0.5);
	}
	50% {
		box-shadow: 0 0 0 6px rgba(142, 42, 31, 0);
	}
}

.paper,
.plaque {
	animation: ink-set 120ms ease-out both;
}

.seal[data-urgent='true'] {
	animation: seal-pulse 2s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
	.paper,
	.plaque,
	.seal {
		animation: none;
	}
	.btn-primary {
		transform: none;
	}
}
```

- [ ] **Step 2: Lint & check**

Run: `bun run lint && bun run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/styles/frames.css
git commit -m "feat(ui): add mercantile-ledger frame, hardware, and motion styles"
```

---

## Task 3: Wire fonts and base layout

**Files:**
- Modify: `src/routes/+layout.svelte`
- Modify: `src/routes/layout.css`

- [ ] **Step 1: Add Google Fonts to `+layout.svelte`**

Replace the entire contents of `src/routes/+layout.svelte` with:

```svelte
<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
	<link
		rel="stylesheet"
		href="https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=IBM+Plex+Sans:wght@400;600;700&family=JetBrains+Mono:wght@400;700&family=Spectral:wght@400;500;700&display=swap"
	/>
</svelte:head>
{@render children()}
```

- [ ] **Step 2: Replace `layout.css` to import tokens + frames and apply walnut wash**

Replace the entire contents of `src/routes/layout.css` with:

```css
@import 'tailwindcss';
@import '../lib/styles/tokens.css';
@import '../lib/styles/frames.css';

:root {
	color: var(--paper-50);
	background: var(--walnut-900);
	font-family: var(--font-ui);
}

body {
	margin: 0;
	min-width: 320px;
	min-height: 100vh;
	overflow: hidden;
	background:
		radial-gradient(ellipse at top, var(--walnut-800) 0%, var(--walnut-900) 60%),
		var(--walnut-900);
	color: var(--paper-50);
	font-family: var(--font-ui);
	font-feature-settings: 'liga' 1, 'kern' 1;
}

html,
body,
#svelte {
	min-height: 100%;
}

button,
select,
input {
	font: inherit;
}

button {
	cursor: pointer;
}

* {
	box-sizing: border-box;
}
```

- [ ] **Step 3: Lint & check**

Run: `bun run lint && bun run check`
Expected: PASS.

- [ ] **Step 4: Visual smoke check**

Run: `bun run dev` (in another shell if needed), open http://localhost:5173.
Expected: The page loads, the body background is a deep walnut radial wash, the existing UI is still functional (chrome will look temporarily broken because components are still using their old hex values — that's normal until later tasks land).

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/routes/+layout.svelte src/routes/layout.css
git commit -m "feat(ui): wire fonts and walnut-stage base layout"
```

---

## Task 4: Phaser placement preview colors

**Files:**
- Modify: `src/lib/phaser/cityMapScene.ts:22-23`
- Modify: `src/lib/phaser/industryMapScene.ts` (corresponding constants)

- [ ] **Step 1: Update `cityMapScene.ts`**

In `src/lib/phaser/cityMapScene.ts`, find the two constants near line 22:

```ts
const PLACEMENT_PREVIEW_VALID_COLOR = 0x22c55e;
const PLACEMENT_PREVIEW_INVALID_COLOR = 0xef4444;
```

Replace with:

```ts
const PLACEMENT_PREVIEW_VALID_COLOR = 0x6b7e3a;
const PLACEMENT_PREVIEW_INVALID_COLOR = 0x8e2a1f;
```

- [ ] **Step 2: Update `industryMapScene.ts`**

In `src/lib/phaser/industryMapScene.ts`, find the equivalent constants. Run: `grep -n 'PLACEMENT_PREVIEW_VALID_COLOR\|PLACEMENT_PREVIEW_INVALID_COLOR' src/lib/phaser/industryMapScene.ts` to locate.

Replace both hex values with `0x6b7e3a` (valid) and `0x8e2a1f` (invalid) respectively, matching the names used in that file.

- [ ] **Step 3: Run scene-related unit tests**

Run: `bun run test:unit -- src/lib/game/mapRender.spec.ts src/lib/game/industryMapRender.spec.ts --run`
Expected: PASS (these tests check snapshot shape, not colors).

- [ ] **Step 4: Commit**

```bash
git add src/lib/phaser/cityMapScene.ts src/lib/phaser/industryMapScene.ts
git commit -m "feat(ui): retune Phaser placement preview tints to mercantile palette"
```

---

## Task 5: Map shell components

**Files:**
- Modify: `src/lib/components/game/CityMap.svelte:85-124`
- Modify: `src/lib/components/game/IndustryMap.svelte` (style block)

- [ ] **Step 1: Replace `<style>` block in `CityMap.svelte`**

In `src/lib/components/game/CityMap.svelte`, replace the existing `<style>` block (lines 85 through end of style) with:

```svelte
<style>
	.map-shell {
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		border: 0;
		background: var(--walnut-900);
	}

	.map-canvas {
		position: relative;
		height: 100%;
		min-height: 0;
		background: var(--walnut-900);
	}

	.map-canvas :global(canvas) {
		display: block;
	}

	.map-fallback {
		position: absolute;
		inset: 1rem auto auto 1rem;
		margin: 0;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		padding: 0.65rem 0.8rem;
		font-family: var(--font-body);
		font-size: 0.86rem;
		box-shadow: var(--shadow-paper);
	}

	@media (max-width: 820px) {
		.map-shell,
		.map-canvas {
			min-height: 0;
		}
	}
</style>
```

- [ ] **Step 2: Update Phaser game background color**

In the same file, find:

```ts
backgroundColor: '#101418',
```

Replace with:

```ts
backgroundColor: '#14100A',
```

(Keeping the literal here because `Phaser.Game` config does not have access to CSS vars.)

- [ ] **Step 3: Mirror the same two edits in `IndustryMap.svelte`**

Apply the same `<style>` block replacement and the same `backgroundColor` change in `src/lib/components/game/IndustryMap.svelte`.

- [ ] **Step 4: Lint & check**

Run: `bun run lint && bun run check`
Expected: PASS.

- [ ] **Step 5: Run e2e for the map components**

Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts`
Expected: PASS — the canvas `data-*` attributes are unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/game/CityMap.svelte src/lib/components/game/IndustryMap.svelte
git commit -m "feat(ui): swap map shell to walnut-stage colors"
```

---

## Task 6: Page HUD restyle

**Files:**
- Modify: `src/routes/+page.svelte` (markup additions + `<style>` block)

This is the largest task — the main page HUD has the most styling. We do it in one task because the changes are tightly coupled.

- [ ] **Step 1: Update HUD markup with decorative spans and class swaps**

In `src/routes/+page.svelte`, locate the `<main class="app">` block (around line 589) and apply these markup changes only:

1. **Map title block.** Find the `<div class="map-title">` element (around line 597) and replace its opening tag with:
   ```svelte
   <div class="map-title plaque" aria-label="Map title">
     <span class="bookmark map-title-bookmark" aria-hidden="true"></span>
   ```
   The `<p class="eyebrow">` and `<h1>` already inside remain unchanged. Update the trailing `<p class="status">` to use a `<span class="ticker">` wrapper around any monospace numerals.

   Specifically the day/cash status line becomes:
   ```svelte
   <p class="status">Day <span class="ticker">{game.day}</span> · <span class="ticker">${game.cash.toLocaleString('en-US')}</span> cash</p>
   ```
   Make the equivalent edit for the industry status line ("Day N · {count} industrial buildings"), wrapping `{game.day}` and `{game.industrialBuildings.length}` in `<span class="ticker">…</span>`.

2. **Icon buttons.** For each of the three icon buttons (Build, Open menu, Advance day) change `class="map-icon-button"` → `class="map-icon-button btn-icon"`. Keep the existing `primary` class on the Advance Day button (it now stacks with `btn-icon`).

3. **HUD status chip.** Replace the existing `<div class="hud-status">` opening with:
   ```svelte
   <div class="hud-status plaque" role="status" aria-label="Company status">
   ```
   Inside, wrap the `<strong>` cash value as a ticker:
   ```svelte
   <strong class="ticker">${game.cash.toLocaleString('en-US')}</strong>
   ```

4. **Placement status bar.** Change `<div class="placement-status" …>` to `<div class="placement-status plaque" …>`. Change the inner Cancel button class from default to `class="btn-danger"`.

5. **HUD dropdown.** Change `<div class="hud-dropdown" …>` to `<div class="hud-dropdown paper" …>`.

6. **Control Tower modal wrapper.** Change `<div class="control-tower-overlay" …>` to `<div class="control-tower-overlay paper" …>`.

   Inside the tower header, change the Close button from `<button class="close-tower">` to `<button class="close-tower btn-danger">` (kept as a class to preserve existing aria + selectors), and the day/cash action span should wrap numbers in `<span class="ticker">`.

7. **Tile inspector overlay.** Change `<div class="inspector-overlay" …>` (both occurrences for retail and industry) to `<div class="inspector-overlay paper" …>`.

No other markup changes.

- [ ] **Step 2: Replace the page `<style>` block**

In the same file, replace the entire `<style>` block at the bottom (starting at line 811) with:

```svelte
<style>
	.app {
		width: 100vw;
		height: 100dvh;
		min-height: 100vh;
		overflow: hidden;
		display: block;
	}

	h1 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 400;
		line-height: 1.05;
		color: var(--ink-700);
	}

	h1::before {
		content: '';
		display: block;
		width: 2.5rem;
		height: 1px;
		margin-bottom: 0.5rem;
		background: var(--brass-500);
	}

	h2 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 400;
		line-height: 1.1;
		color: var(--ink-700);
	}

	.map-layout {
		position: relative;
		width: 100%;
		height: 100%;
		min-height: 100vh;
		overflow: hidden;
	}

	.map-hud {
		position: absolute;
		inset: 1rem 1rem auto;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		pointer-events: none;
	}

	.map-actions {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		pointer-events: auto;
	}

	.map-title {
		position: relative;
		max-width: min(24rem, calc(100vw - 8rem));
		padding: 0.75rem 0.95rem;
	}

	.map-title-bookmark {
		left: 1rem;
	}

	.status {
		margin: 0;
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.9rem;
	}

	.ticker {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		color: var(--ink-700);
	}

	.placement-status {
		position: absolute;
		left: 1rem;
		bottom: 1rem;
		z-index: 22;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		max-width: min(32rem, calc(100vw - 2rem));
		padding: 0.65rem 0.8rem;
	}

	.placement-status span {
		min-width: 0;
		color: var(--ink-700);
		font-family: var(--font-body);
		font-size: 0.9rem;
		font-style: italic;
	}

	.hud-menu {
		position: relative;
	}

	.hud-status {
		display: grid;
		gap: 0.05rem;
		min-width: 7.5rem;
		padding: 0.55rem 0.75rem;
	}

	.hud-status strong {
		font-family: var(--font-mono);
		font-size: 1rem;
		color: var(--ink-700);
		white-space: nowrap;
	}

	.hud-status span {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.hud-dropdown {
		position: absolute;
		top: calc(100% + 0.45rem);
		right: 0;
		z-index: 30;
		min-width: 200px;
		padding: 0.45rem;
		animation: none; /* dropdown should appear instantly */
	}

	.hud-dropdown button {
		width: 100%;
		padding: 0.6rem 0.7rem;
		border: 0;
		background: transparent;
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.88rem;
		text-align: left;
		border-radius: 2px;
	}

	.hud-dropdown button:hover,
	.hud-dropdown button:focus-visible {
		background: var(--paper-200);
	}

	.hud-dropdown button:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.hud-dropdown button.active-view {
		background: var(--paper-300);
		color: var(--ink-900);
		font-weight: 700;
	}

	.primary {
		/* On the icon button row, primary = moss ink-stamp */
		background-color: var(--moss) !important;
		border-color: var(--ink-900) !important;
		color: var(--paper-50) !important;
		transform: rotate(-0.6deg);
	}

	.primary:hover,
	.primary:focus-visible {
		background-color: var(--moss-2) !important;
	}

	.inspector-overlay {
		position: absolute;
		top: 5.9rem;
		right: 1rem;
		z-index: 10;
		width: min(360px, calc(100% - 2rem));
		max-height: calc(100dvh - 6.9rem);
		overflow: auto;
		padding: 0;
	}

	.tower-backdrop {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(20, 16, 10, 0.74);
		backdrop-filter: blur(4px);
	}

	.tower-backdrop-button {
		position: absolute;
		inset: 0;
		padding: 0;
		border: 0;
		background: transparent;
	}

	.control-tower-overlay {
		position: relative;
		z-index: 1;
		width: min(1180px, 100%);
		max-height: calc(100vh - 2rem);
		overflow: auto;
		display: grid;
		gap: 1rem;
		padding: 1.25rem;
		animation-delay: 160ms;
	}

	.tower-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--brass-500);
	}

	.tower-actions {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}

	.tower-actions span,
	.tower-actions strong {
		color: var(--ink-700);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		white-space: nowrap;
	}

	.tower-actions strong {
		font-weight: 700;
	}

	.close-tower {
		white-space: nowrap;
	}

	.grid {
		display: grid;
		grid-template-columns: minmax(0, 1.35fr) minmax(280px, 0.85fr);
		gap: 1rem;
		align-items: start;
	}

	@media (max-width: 980px) {
		.grid {
			grid-template-columns: 1fr;
		}

		.map-hud {
			align-items: flex-start;
			inset: 0.75rem 0.75rem auto;
		}

		.inspector-overlay {
			position: fixed;
			inset: auto 0 0;
			width: auto;
			max-height: 60dvh;
		}

		.map-title {
			max-width: min(18rem, calc(100vw - 7rem));
			padding: 0.65rem 0.7rem;
		}

		.map-actions {
			gap: 0.5rem;
		}

		.hud-status {
			display: none;
		}

		.control-tower-overlay {
			max-height: calc(100vh - 1rem);
			padding: 0.85rem;
		}

		.tower-header {
			align-items: stretch;
			flex-direction: column;
		}

		.tower-actions {
			align-items: stretch;
			flex-direction: column;
		}

		h1 {
			font-size: 1.5rem;
		}
	}
</style>
```

- [ ] **Step 3: Lint & check**

Run: `bun run lint && bun run check`
Expected: PASS.

- [ ] **Step 4: Run page e2e**

Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts`
Expected: PASS — aria labels and data-* attributes preserved.

- [ ] **Step 5: Visual smoke check**

Run: `bun run dev`, open http://localhost:5173.
Expected: Title block, HUD chips, icon buttons, placement bar all read as parchment/brass on walnut. Inspector overlay (when a tile is selected) shows paper frame. Control Tower modal (after founding a store and opening it) shows brass ledger-rule below header.

Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat(ui): restyle page HUD to mercantile-ledger plaques and frames"
```

---

## Task 7: Scorecard.svelte

**Files:**
- Modify: `src/lib/components/game/Scorecard.svelte`

- [ ] **Step 1: Apply `.paper` class to root and restyle**

In `src/lib/components/game/Scorecard.svelte`, change the `<section class="panel" …>` to `<section class="panel paper" …>` (keep both classes so existing selectors continue to work).

Then replace the entire `<style>` block with:

```svelte
<style>
	.panel {
		padding: 1.1rem 1.2rem;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.score-grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 1rem;
	}

	.score-item {
		display: grid;
		min-width: 0;
		gap: 0.4rem;
	}

	.score-label {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.5rem;
	}

	span {
		min-width: 0;
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	strong {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 1.4rem;
		color: var(--ink-700);
		line-height: 1;
	}

	meter {
		width: 100%;
		height: 0.45rem;
		border-radius: 0;
	}

	@media (max-width: 760px) {
		.score-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
```

- [ ] **Step 2: Lint, check, and run Scorecard spec**

Run: `bun run lint && bun run check && bun run test:unit --run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/game/Scorecard.svelte
git commit -m "feat(ui): restyle Scorecard to parchment paper frame"
```

---

## Task 8: DecisionQueue.svelte

**Files:**
- Modify: `src/lib/components/game/DecisionQueue.svelte`

- [ ] **Step 1: Apply `.paper` and seal styling**

In the template, change `<section class="panel" …>` to `<section class="panel paper" …>`. Inside the article, wrap the `<span>Expires day N</span>` like this:

```svelte
<span class="expires"><span class="seal" data-urgent="true">Day {decision.expiresOnDay}</span></span>
```

Replace the `<style>` block with:

```svelte
<style>
	.panel {
		padding: 1.1rem 1.2rem;
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	h2 {
		margin-bottom: 0.75rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	h3 {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.empty,
	p,
	.decision-copy span,
	button span {
		color: var(--ink-500);
		font-family: var(--font-body);
	}

	.queue,
	article,
	.decision-copy,
	.options {
		display: grid;
		gap: 0.65rem;
	}

	article {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.85rem;
	}

	.decision-copy {
		gap: 0.4rem;
	}

	.decision-copy p {
		font-size: 0.92rem;
	}

	.expires {
		display: inline-flex;
	}

	button {
		display: grid;
		gap: 0.25rem;
		padding: 0.75rem;
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		font-family: var(--font-ui);
		text-align: left;
	}

	button:hover,
	button:focus-visible {
		background: var(--paper-200);
	}

	button strong {
		font-weight: 700;
	}

	button span {
		font-size: 0.85rem;
	}
</style>
```

- [ ] **Step 2: Lint, check, run unit tests**

Run: `bun run lint && bun run check && bun run test:unit --run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/game/DecisionQueue.svelte
git commit -m "feat(ui): restyle DecisionQueue with paper frame and wax-seal expiry"
```

---

## Task 9: PolicyPanel.svelte

**Files:**
- Modify: `src/lib/components/game/PolicyPanel.svelte`

- [ ] **Step 1: Apply `.paper` and restyle**

Change `<section class="panel" …>` to `<section class="panel paper" …>`. Replace the `<style>` block with:

```svelte
<style>
	.panel {
		padding: 1.1rem 1.2rem;
	}

	h2 {
		margin: 0 0 0.75rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.policy-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.85rem;
	}

	label {
		display: grid;
		min-width: 0;
		gap: 0.35rem;
	}

	span {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	select {
		width: 100%;
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		padding: 0.55rem 0.7rem;
		font-family: var(--font-ui);
		font-size: 0.9rem;
	}

	@media (max-width: 980px) {
		.policy-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 520px) {
		.policy-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
```

- [ ] **Step 2: Lint, check, unit tests**

Run: `bun run lint && bun run check && bun run test:unit --run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/game/PolicyPanel.svelte
git commit -m "feat(ui): restyle PolicyPanel to parchment paper frame"
```

---

## Task 10: ReportsPanel.svelte

**Files:**
- Modify: `src/lib/components/game/ReportsPanel.svelte`

- [ ] **Step 1: Apply `.paper` and restyle**

Change `<section class="panel" …>` to `<section class="panel paper" …>`. Wrap the warnings list with a class for ink styling — change `<ul aria-label="Daily warnings">` to `<ul class="warnings" aria-label="Daily warnings">`. Replace the `<style>` block with:

```svelte
<style>
	.panel {
		padding: 1.1rem 1.2rem;
	}

	h2,
	p {
		margin: 0;
	}

	h2 {
		margin-bottom: 0.75rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 0.85rem;
	}

	.metrics div {
		display: grid;
		min-width: 0;
		gap: 0.3rem;
	}

	span,
	p {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	p {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.92rem;
		font-weight: 400;
		letter-spacing: 0;
		text-transform: none;
	}

	strong {
		overflow-wrap: anywhere;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 1.05rem;
		color: var(--ink-700);
	}

	.warnings {
		margin: 0.9rem 0 0;
		padding-left: 1rem;
		color: var(--wax-red);
		font-family: var(--font-body);
		font-size: 0.92rem;
	}

	@media (max-width: 980px) {
		.metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 520px) {
		.metrics {
			grid-template-columns: 1fr;
		}
	}
</style>
```

- [ ] **Step 2: Lint, check, unit tests**

Run: `bun run lint && bun run check && bun run test:unit --run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/game/ReportsPanel.svelte
git commit -m "feat(ui): restyle ReportsPanel with parchment paper and mono numerals"
```

---

## Task 11: StoreOverview.svelte

**Files:**
- Modify: `src/lib/components/game/StoreOverview.svelte`

- [ ] **Step 1: Apply `.paper` and restyle**

Change `<section class="panel" …>` to `<section class="panel paper" …>`. Replace the `<style>` block with:

```svelte
<style>
	.panel {
		padding: 1.1rem 1.2rem;
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	h2 {
		margin-bottom: 0.75rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.stores {
		display: grid;
		gap: 0.8rem;
	}

	.store {
		display: grid;
		gap: 0.75rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.9rem;
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
	}

	h3 {
		font-family: var(--font-display);
		font-size: 1.05rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	p,
	dt,
	header span {
		color: var(--brass-700);
		font-family: var(--font-ui);
	}

	p {
		font-family: var(--font-body);
		font-size: 0.92rem;
		color: var(--ink-500);
	}

	header span,
	dt {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 0.7rem;
		margin: 0;
	}

	dl div {
		min-width: 0;
	}

	dd {
		margin: 0.2rem 0 0;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-weight: 700;
		color: var(--ink-700);
		overflow-wrap: anywhere;
	}

	ul {
		margin: 0;
		padding-left: 1rem;
		color: var(--wax-red);
		font-family: var(--font-body);
		font-size: 0.9rem;
	}

	.product-sources {
		display: grid;
		gap: 0.35rem;
		padding-left: 0;
		color: var(--ink-700);
		list-style: none;
	}

	.product-sources li {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.65rem;
		align-items: baseline;
	}

	.product-sources span {
		font-family: var(--font-body);
		font-weight: 700;
		color: var(--ink-700);
	}

	.product-sources small {
		color: var(--ink-500);
		font-family: var(--font-mono);
		font-size: 0.78rem;
	}

	.quiet {
		font-family: var(--font-body);
		font-size: 0.88rem;
		color: var(--ink-500);
	}

	@media (max-width: 640px) {
		dl {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
```

- [ ] **Step 2: Lint, check, unit tests**

Run: `bun run lint && bun run check && bun run test:unit --run`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/game/StoreOverview.svelte
git commit -m "feat(ui): restyle StoreOverview with parchment frame and mono numerals"
```

---

## Task 12: StaffPanel.svelte

**Files:**
- Modify: `src/lib/components/game/StaffPanel.svelte`

- [ ] **Step 1: Apply `.paper` and restyle**

Change `<section class="panel" …>` to `<section class="panel paper" …>`. Replace the `<style>` block (from line 197 to end of style) with:

```svelte
<style>
	.panel {
		display: grid;
		gap: 1rem;
		padding: 1.1rem 1.2rem;
	}

	.panel-heading,
	.store-heading,
	.person-heading,
	.assigned-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		min-width: 0;
	}

	.panel-heading > *,
	.store-heading > *,
	.person-heading > *,
	.assigned-row > * {
		min-width: 0;
	}

	h2,
	h3,
	h4,
	p {
		margin: 0;
	}

	h2,
	h3,
	h4 {
		font-family: var(--font-display);
		font-weight: 400;
		color: var(--ink-700);
	}

	h2 {
		font-size: 1.1rem;
	}

	h3 {
		font-size: 0.95rem;
	}

	h4 {
		font-size: 0.92rem;
	}

	p,
	dt {
		color: var(--ink-500);
		font-family: var(--font-body);
	}

	dt {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	dd {
		margin: 0.2rem 0 0;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-weight: 700;
		color: var(--ink-700);
	}

	dl.metrics {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		margin: 0;
	}

	.section-group {
		display: grid;
		gap: 0.75rem;
	}

	.people-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 0.75rem;
	}

	.person-card,
	.store-card {
		display: grid;
		gap: 0.6rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.85rem;
	}

	strong {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		color: var(--ink-700);
	}

	button,
	select {
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.86rem;
		padding: 0.55rem 0.75rem;
	}

	button:hover,
	button:focus-visible,
	select:hover,
	select:focus-visible {
		background: var(--paper-200);
		outline: none;
	}

	button.secondary {
		background: transparent;
		color: var(--wax-red);
		border-color: var(--wax-red);
	}

	button.secondary:hover {
		background: var(--paper-200);
	}

	.people-list {
		display: grid;
		gap: 0.5rem;
	}

	.empty {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-style: italic;
	}

	.assignment-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	@media (max-width: 720px) {
		.assigned-row,
		.store-heading,
		.person-heading {
			flex-direction: column;
			align-items: stretch;
		}
	}
</style>
```

- [ ] **Step 2: Lint, check, unit tests**

Run: `bun run lint && bun run check && bun run test:unit --run`
Expected: PASS (including `StaffPanel.svelte.spec.ts`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/game/StaffPanel.svelte
git commit -m "feat(ui): restyle StaffPanel with parchment cards and ink-stamp buttons"
```

---

## Task 13: TileInspector.svelte (overlay + bookmark tabs)

**Files:**
- Modify: `src/lib/components/game/TileInspector.svelte`

- [ ] **Step 1: Add bookmark span to active tab**

In the template, locate the three `<button class="store-tab" …>` elements (Details / Stock / Staff). For each, after the opening tag's `onclick`, add:

```svelte
{#if activeStoreTab === '<TAB-ID>'}<span class="bookmark tab-bookmark" aria-hidden="true"></span>{/if}
```

Replace `<TAB-ID>` with `details`, `stock`, `staff` respectively for each button.

- [ ] **Step 2: Replace the `<style>` block**

Replace the entire `<style>` block (starting line 248) with:

```svelte
<style>
	.inspector {
		position: relative;
		display: grid;
		align-content: start;
		gap: 1rem;
		min-width: 0;
		padding: 1rem 1.1rem 1.1rem;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background-color: var(--paper-100);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		color: var(--ink-700);
		box-shadow:
			inset 0 0 0 2px var(--paper-100),
			inset 0 0 0 3px var(--brass-500),
			var(--shadow-paper);
	}

	.inspector.store-inspector {
		grid-template-rows: auto auto minmax(0, 1fr);
		height: min(37rem, calc(100dvh - 6.9rem));
		overflow: hidden;
	}

	.close {
		position: absolute;
		top: 0.7rem;
		right: 0.7rem;
		width: 1.9rem;
		height: 1.9rem;
		padding: 0;
		border: 1px solid var(--ink-700);
		border-radius: 999px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-weight: 700;
		text-align: center;
	}

	.close:hover {
		background: var(--paper-200);
	}

	.heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		padding-right: 2.2rem;
	}

	h2,
	h3,
	p,
	dl {
		margin: 0;
	}

	h2 {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 400;
		line-height: 1.1;
		color: var(--ink-700);
	}

	h3 {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.heading p {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.location,
	dt {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.86rem;
	}

	dt {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	.heading span {
		flex: 0 0 auto;
		border: 1px solid var(--brass-500);
		border-radius: 999px;
		color: var(--ink-700);
		background: var(--paper-50);
		padding: 0.2rem 0.55rem;
		font-family: var(--font-ui);
		font-size: 0.74rem;
		font-weight: 600;
	}

	dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 0.6rem;
	}

	dd {
		margin: 0.2rem 0 0;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-weight: 700;
		color: var(--ink-700);
		overflow-wrap: anywhere;
	}

	.store-tabs {
		display: flex;
		gap: 0.4rem;
		border-bottom: 1px solid var(--brass-500);
	}

	.store-tab {
		position: relative;
		flex: 1 1 auto;
		padding: 0.55rem 0.75rem 0.7rem;
		border: 1px solid var(--paper-edge);
		border-bottom: 0;
		border-radius: 2px 2px 0 0;
		background: var(--paper-50);
		color: var(--ink-500);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: 600;
	}

	.store-tab.active {
		color: var(--ink-900);
		background: var(--paper-200);
		border-color: var(--brass-500);
	}

	.tab-bookmark {
		left: 50%;
		top: -2px;
		transform: translateX(-50%);
		width: 0.6rem;
		height: 1.2rem;
	}

	.store-tab-panels {
		position: relative;
		flex: 1 1 auto;
		min-height: 0;
		overflow: auto;
	}

	.store-panel {
		display: none;
	}

	.store-panel.active {
		display: grid;
		gap: 0.85rem;
	}

	.store-art {
		display: grid;
		place-items: center;
		padding: 0.5rem;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
	}

	.store-art img {
		width: min(160px, 100%);
		height: auto;
	}
</style>
```

- [ ] **Step 3: Lint, check, run TileInspector spec**

Run: `bun run lint && bun run check && bun run test:unit -- src/lib/components/game/TileInspector.svelte.spec.ts --run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/game/TileInspector.svelte
git commit -m "feat(ui): restyle TileInspector with paper frame and bookmark tabs"
```

---

## Task 14: IndustryTileInspector.svelte

**Files:**
- Modify: `src/lib/components/game/IndustryTileInspector.svelte`

- [ ] **Step 1: Read the current file to understand its tab/section structure**

Run: `cat src/lib/components/game/IndustryTileInspector.svelte | head -120`

(Read enough to confirm whether it uses the same `.store-tab` / panel pattern as `TileInspector.svelte`. If it does, mirror the bookmark-span addition.)

- [ ] **Step 2: Apply the same treatment**

In the template, change the root `<aside class="inspector" …>` to keep its class — it will be styled identically to `TileInspector.svelte`'s root.

Replace its `<style>` block with the same content as Task 13's style block (the inspector structure is identical). If the markup differs (different tab names, additional sections), keep the existing markup; only the style block changes.

If `IndustryTileInspector` has tab buttons, add the same conditional `<span class="bookmark tab-bookmark" aria-hidden="true"></span>` decorator for the active tab.

- [ ] **Step 3: Lint, check, run IndustryTileInspector spec**

Run: `bun run lint && bun run check && bun run test:unit -- src/lib/components/game/IndustryTileInspector.svelte.spec.ts --run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/game/IndustryTileInspector.svelte
git commit -m "feat(ui): restyle IndustryTileInspector to match TileInspector frame"
```

---

## Task 15: StoreStockTable.svelte and StoreStaffPanel.svelte (nested in TileInspector)

**Files:**
- Modify: `src/lib/components/game/StoreStockTable.svelte`
- Modify: `src/lib/components/game/StoreStaffPanel.svelte`

These components render inside the TileInspector tabs, so they should NOT use `.paper` (already inside a paper frame). They use a flat ink-on-parchment treatment.

- [ ] **Step 1: Read the current `StoreStockTable.svelte` style block**

Run: `cat src/lib/components/game/StoreStockTable.svelte`

Identify hex literals and replace them with ledger equivalents using this mapping:

- Backgrounds `#111823`, `#151f2d`, `#1a1a18` → `var(--paper-50)`
- Borders `#26374d`, `#253244`, `#345172` → `var(--paper-edge)` (or `var(--brass-500)` for emphasis)
- Text body `#edf2f7`, `#d8e2ef` → `var(--ink-700)`
- Muted `#a7b4c8`, `#b8b3a7` → `var(--ink-500)` for body or `var(--brass-700)` for labels
- Warnings `#f4c56f`, `#d59b45` → `var(--wax-red)` for errors, `var(--brass-500)` for callouts
- Numeric strong values → `font-family: var(--font-mono); font-variant-numeric: tabular-nums lining-nums; color: var(--ink-700);`
- Body `font-family` defaults → `var(--font-body)` for paragraphs, `var(--font-ui)` for buttons/labels, `var(--font-display)` for headings
- Border radii → `2px` everywhere

Apply the same mapping to `StoreStaffPanel.svelte`.

- [ ] **Step 2: Lint, check, unit tests**

Run: `bun run lint && bun run check && bun run test:unit --run`
Expected: PASS.

- [ ] **Step 3: Visual smoke check**

Run: `bun run dev`, open http://localhost:5173, found a store, open the TileInspector for that store, click through Details / Stock / Staff tabs. Confirm the nested content reads on parchment.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/game/StoreStockTable.svelte src/lib/components/game/StoreStaffPanel.svelte
git commit -m "feat(ui): restyle nested store stock/staff panels for parchment context"
```

---

## Task 16: BuildMenu.svelte (catalog rows)

**Files:**
- Modify: `src/lib/components/game/BuildMenu.svelte`

- [ ] **Step 1: Apply `.paper` and widen modal**

In the template, change `<div class="build-menu" …>` to `<div class="build-menu paper" …>`. Change the close button class from default to `class="close btn-icon"` removed — actually keep `close` simple. Change `<button type="button" class="close" …>` to `<button type="button" class="close btn-danger" …>` and replace the inner `x` text with `×`.

For each `<button type="button" class="build-option" …>`, change to `<button type="button" class="build-option" disabled={…} onclick={…}>` (no class change — we'll style via the existing class).

- [ ] **Step 2: Replace the `<style>` block**

Replace the entire `<style>` block (starting at line 367) with:

```svelte
<style>
	.build-backdrop {
		position: fixed;
		inset: 0;
		z-index: 45;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(20, 16, 10, 0.7);
		backdrop-filter: blur(4px);
	}

	.backdrop-button {
		position: absolute;
		inset: 0;
		border: 0;
		border-radius: 0;
		background: transparent;
		padding: 0;
	}

	.build-menu {
		position: relative;
		z-index: 1;
		display: grid;
		gap: 0.85rem;
		width: min(36rem, 100%);
		max-height: calc(100dvh - 2rem);
		overflow: auto;
		padding: 1.1rem 1.2rem;
		color: var(--ink-700);
	}

	header,
	.product-filter {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	header {
		justify-content: space-between;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--brass-500);
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	h2 {
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	header p,
	small,
	.disabled-copy,
	.muted {
		color: var(--ink-500);
		font-family: var(--font-body);
	}

	header p {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	small {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--ink-500);
	}

	.disabled-copy,
	.muted {
		font-family: var(--font-body);
		font-size: 0.86rem;
	}

	.option-list,
	.filter-popup,
	.filter-list,
	label {
		display: grid;
		gap: 0.55rem;
	}

	.build-option {
		display: flex;
		align-items: center;
		gap: 0.85rem;
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--paper-edge);
		border-left: 0;
		border-radius: 0 2px 2px 0;
		background: var(--paper-50);
		color: var(--ink-700);
		font: inherit;
		text-align: left;
		position: relative;
	}

	.build-option:hover:not(:disabled),
	.build-option:focus-visible:not(:disabled) {
		background: var(--paper-200);
		border-color: var(--brass-500);
		box-shadow: inset 3px 0 0 var(--wax-red);
		outline: none;
	}

	.build-option:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.build-option:disabled::after {
		content: 'UNAVAILABLE';
		position: absolute;
		top: 0.3rem;
		right: 0.5rem;
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		color: var(--wax-red);
		border: 1px solid var(--wax-red);
		padding: 0.1rem 0.3rem;
		transform: rotate(-3deg);
	}

	.build-option img {
		flex: 0 0 auto;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--paper-200);
		padding: 0.2rem;
		object-fit: cover;
	}

	.build-option > span {
		display: grid;
		gap: 0.22rem;
		min-width: 0;
	}

	.build-option strong {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.close {
		flex: 0 0 auto;
		width: 2rem;
		height: 2rem;
		padding: 0;
		text-align: center;
	}

	.filter-clear,
	.filter-close {
		flex: 0 0 auto;
		width: 2rem;
		height: 2rem;
		padding: 0;
		text-align: center;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
	}

	.filter-trigger {
		flex: 1 1 auto;
		padding: 0.6rem 0.75rem;
		text-align: left;
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
	}

	.filter-trigger:hover,
	.filter-trigger:focus-visible {
		background: var(--paper-200);
	}

	.filter-popup {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.8rem;
	}

	.filter-popup-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	h3 {
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	input {
		min-width: 0;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		padding: 0.55rem 0.7rem;
		font-family: var(--font-ui);
	}

	label span {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.filter-list button {
		display: grid;
		gap: 0.18rem;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		text-align: left;
	}

	.filter-list button:hover:not(:disabled) {
		background: var(--paper-200);
		border-color: var(--brass-500);
	}

	.filter-list button[aria-pressed='true'] {
		background: var(--paper-200);
		border-color: var(--brass-500);
		box-shadow: inset 3px 0 0 var(--wax-red);
	}

	.filter-list button:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}
</style>
```

- [ ] **Step 3: Lint, check, run BuildMenu spec**

Run: `bun run lint && bun run check && bun run test:unit -- src/lib/components/game/BuildMenu.svelte.spec.ts --run`
Expected: PASS.

- [ ] **Step 4: Visual smoke check**

Run: `bun run dev`, click the Build icon. Confirm the catalog rows have brass thumbnails, hover shows wax-red left edge, disabled rows show the `UNAVAILABLE` stamp.

Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/game/BuildMenu.svelte
git commit -m "feat(ui): restyle BuildMenu as parchment catalog with brass thumbnails"
```

---

## Task 17: SavePanel.svelte (wax-seal slots)

**Files:**
- Modify: `src/lib/components/game/SavePanel.svelte`

- [ ] **Step 1: Apply `.paper` and seal markup**

In the template, change `<div class="save-panel" …>` to `<div class="save-panel paper" …>`. Inside the auto-save section's `<h3>Auto-save</h3>`, append a brass `AUTO` chip:

```svelte
<h3>Auto-save <span class="auto-chip">AUTO</span></h3>
```

Inside each manual slot `<article>`, add a wax-seal date stamp before the `<div>` containing `<h4>{slot.name}</h4>`:

```svelte
<article>
	<span class="slot-seal" aria-hidden="true">{slot.day}</span>
	<div>
		<h4>{slot.name}</h4>
		…
```

- [ ] **Step 2: Replace the `<style>` block**

Replace the entire `<style>` block (starting at line 145) with:

```svelte
<style>
	.save-backdrop {
		position: fixed;
		inset: 0;
		z-index: 60;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(20, 16, 10, 0.74);
		backdrop-filter: blur(4px);
	}

	.save-backdrop-button {
		position: absolute;
		inset: 0;
		padding: 0;
		border: 0;
		background: transparent;
	}

	.save-panel {
		position: relative;
		z-index: 1;
		display: grid;
		width: min(760px, 100%);
		max-height: calc(100vh - 2rem);
		gap: 1rem;
		overflow: auto;
		padding: 1.1rem 1.25rem;
		color: var(--ink-700);
	}

	header,
	.auto-save,
	article,
	.slot-actions,
	.new-slot {
		display: flex;
		gap: 0.75rem;
	}

	header,
	.auto-save,
	article {
		align-items: center;
		justify-content: space-between;
	}

	header {
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--brass-500);
	}

	h2,
	h3,
	h4,
	p {
		margin: 0;
	}

	h2,
	h3,
	h4 {
		font-family: var(--font-display);
		font-weight: 400;
		color: var(--ink-700);
	}

	h2 {
		font-size: 1.35rem;
	}

	h3 {
		font-size: 1rem;
	}

	h4 {
		font-size: 0.98rem;
	}

	section,
	article {
		display: grid;
		gap: 0.75rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.9rem;
	}

	.auto-save,
	article {
		display: flex;
	}

	.slots {
		display: grid;
		gap: 0.65rem;
	}

	.new-slot {
		align-items: end;
	}

	label {
		display: grid;
		flex: 1;
		min-width: 0;
		gap: 0.35rem;
	}

	label span {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	input,
	button {
		font: inherit;
	}

	input {
		width: 100%;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		padding: 0.65rem 0.75rem;
		font-family: var(--font-ui);
	}

	button {
		border: 1px solid var(--ink-700);
		border-top-color: var(--brass-500);
		border-radius: 2px;
		background: var(--paper-100);
		color: var(--ink-700);
		padding: 0.6rem 0.85rem;
		font-family: var(--font-ui);
		font-size: 0.86rem;
		text-align: center;
		white-space: nowrap;
	}

	button:disabled {
		cursor: not-allowed;
		opacity: 0.48;
	}

	button:hover:not(:disabled),
	button:focus-visible:not(:disabled) {
		background: var(--paper-200);
		outline: none;
	}

	.close,
	.slot-actions button,
	.auto-save button,
	.new-slot button {
		flex: 0 0 auto;
	}

	.eyebrow {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.18em;
		text-transform: uppercase;
	}

	.auto-chip {
		display: inline-flex;
		align-items: center;
		margin-left: 0.4rem;
		padding: 0.1rem 0.45rem;
		border: 1px solid var(--brass-500);
		border-radius: 2px;
		background: var(--brass-100);
		color: var(--ink-700);
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.18em;
	}

	.slot-seal {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 999px;
		background: var(--wax-red);
		color: var(--paper-50);
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 0.78rem;
		font-weight: 700;
	}

	.status {
		color: var(--moss);
		font-family: var(--font-body);
	}

	.error {
		color: var(--wax-red);
		font-family: var(--font-body);
	}

	.empty,
	section p,
	article p,
	label span {
		color: var(--ink-500);
		font-family: var(--font-body);
	}

	@media (max-width: 700px) {
		header,
		.auto-save,
		article,
		.slot-actions,
		.new-slot {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>
```

- [ ] **Step 3: Lint, check, run SavePanel spec**

Run: `bun run lint && bun run check && bun run test:unit -- src/lib/components/game/SavePanel.svelte.spec.ts --run`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/game/SavePanel.svelte
git commit -m "feat(ui): restyle SavePanel with wax-seal slot stamps and brass auto chip"
```

---

## Task 18: Final verification

**Files:** none modified

- [ ] **Step 1: Scan for stray hex literals in component style blocks**

Run:
```bash
grep -rn '#[0-9a-fA-F]\{3,6\}' src/lib/components/game src/routes/+page.svelte src/routes/layout.css 2>/dev/null | grep -v '/\*' | grep -v '//' || echo "CLEAN"
```

Expected: Either `CLEAN`, or only hits that are inside Phaser config objects (e.g., `backgroundColor: '#14100A'` in `CityMap.svelte` and `IndustryMap.svelte`) which are intentional. No hits inside `<style>` blocks.

If you find unintended hits, replace them with the appropriate `var(--…)` token using the mapping from Task 15 Step 1.

- [ ] **Step 2: Run the full unit suite**

Run: `bun run test:unit --run`
Expected: PASS — all specs.

- [ ] **Step 3: Run the full e2e suite**

Run: `bun run test:e2e`
Expected: PASS — all e2e specs. (The retail-sim.e2e.ts is the bulk; the canvas `data-*` attributes are unchanged.)

- [ ] **Step 4: Run lint and check**

Run: `bun run lint && bun run check`
Expected: PASS.

- [ ] **Step 5: Visual smoke pass**

Run: `bun run dev`.

Manually walk through:
1. Initial load — walnut stage, parchment title plaque (top-left) with bookmark, parchment HUD chips (top-right), brass-rimmed icon buttons.
2. Open Build menu via the brass-rimmed Build button — catalog rows with brass-bordered sprite thumbs, wax-red hover edge.
3. Found a retail store on a highlighted tile (moss-green preview tiles); placement bar at bottom-left reads as parchment plaque with brass compass styling.
4. Click the new store tile — TileInspector slides into the right side as paper frame with brass corner brackets and bookmark tab on the active section.
5. Click the menu icon → Control Tower → modal opens as a wide paper frame on a warm walnut backdrop. Scorecard, Policies, Staff, Stores, Decisions, Reports all read as parchment sections inside one ledger spread.
6. Open Saves panel — wax-seal day stamps next to slot names, brass `AUTO` chip.
7. Advance day — moss-green ink-stamp button responds with `:active` translate.
8. Switch to Industry City Map (menu) — same walnut stage, same plaque, same paper frames.

Confirm no visual regressions, no console errors. Stop the dev server.

- [ ] **Step 6: Final commit if any cleanup was needed**

If any hex-literal cleanup or follow-up tweaks happened in Step 1, commit them:

```bash
git add -A
git commit -m "chore(ui): final token cleanup pass on mercantile-ledger redesign"
```

If nothing changed in this task, simply mark complete — no commit needed.

---

## Self-Review (run inline; not a subagent dispatch)

**1. Spec coverage:**

- Palette + typography tokens — Task 1 ✓
- Frames `.paper`, `.plaque`, `.stage`, hardware accents — Task 2 ✓
- Fonts wired, body walnut wash — Task 3 ✓
- Phaser preview tints retuned — Task 4 ✓
- Map shell colors — Task 5 ✓
- Map HUD (plaque, icon buttons, status chip, placement bar, dropdown, control tower wrapper, inspector overlay wrapper) — Task 6 ✓
- Scorecard / PolicyPanel / ReportsPanel / DecisionQueue / StoreOverview / StaffPanel restyle — Tasks 7–12 ✓
- TileInspector + IndustryTileInspector + nested store panels — Tasks 13–15 ✓
- BuildMenu catalog rows — Task 16 ✓
- SavePanel wax-seal slots — Task 17 ✓
- Final verification (grep, full suite, smoke) — Task 18 ✓
- Acceptance criteria from spec — Task 18 enforces them ✓

**2. Placeholder scan:** No TBDs, every step ships full code. Step 2 of Task 14 references the same style block as Task 13 — the engineer is told explicitly to mirror it (with the caveat that if markup differs, only style swaps). Step 1 of Task 15 explicitly enumerates the hex→var mapping rather than waving hands.

**3. Type consistency:** Class names introduced in Task 2 (`paper`, `plaque`, `eyebrow`, `seal`, `bookmark`, `btn-icon`, `btn-primary`, `btn-danger`, `ledger-rule`) are used consistently in later tasks. CSS custom property names match between `tokens.css` (Task 1) and all consumer style blocks.

**4. Ambiguity check:** Step instructions specify exact files, line ranges, and replacement strings. No "etc." or "and so on" in any step.

No issues found; plan ready for execution.
