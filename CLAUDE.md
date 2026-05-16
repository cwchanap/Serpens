# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` is a symlink to this file — keep them in sync by editing `CLAUDE.md` only.

## Project Configuration

- **Language**: TypeScript
- **Package Manager**: bun
- **Stack**: SvelteKit (Svelte 5, runes mode forced) + Vite + Tailwind v4 + Phaser 4 + Tauri 2
- **Adapter**: `@sveltejs/adapter-static` with SPA fallback (`index.html`); the app is a single-page client build that doubles as the Tauri frontend.

## Commands

Run via `bun run <script>` (or `npm run` — both work):

- `dev` — Vite dev server (port 5173).
- `build` / `preview` — production build / preview server (port 4173, used by Playwright).
- `check` — `svelte-kit sync && svelte-check` for type/diagnostics.
- `lint` — `prettier --check . && eslint .`. `format` writes Prettier fixes.
- `test:unit` — Vitest. Two projects are configured in `vite.config.ts`:
  - `client` — browser project (Playwright/Chromium headless), matches `src/**/*.svelte.{test,spec}.{js,ts}`.
  - `server` — node, matches the rest of `src/**/*.{test,spec}.{js,ts}`.
  - Run a single file: `bun run test:unit -- src/lib/game/city.spec.ts --run`. Filter by name with `-t "<pattern>"`. `--project client` / `--project server` restricts to one environment.
- `test:e2e` — Playwright (`testMatch: **/*.e2e.{ts,js}`). It builds + previews the app first; expect a slow first run. Single test: `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "<name>"`.
- `test` — runs unit (`--run`) then e2e.
- `tauri:dev` / `tauri:build` — desktop app via `src-tauri/`. Tauri's `beforeDevCommand` invokes `bun run dev`.

`vite.config.ts` enforces `expect: { requireAssertions: true }` — every Vitest test must contain an `expect`.

## Architecture

### Game = pure logic in `src/lib/game/` + Svelte UI in `src/routes/+page.svelte` + Phaser map renderer

The retail-simulation game is a deterministic, seed-driven state machine. The single source of truth is a `GameState` object (see `src/lib/game/types.ts`); every interaction is a pure transition that returns a new `GameState`.

Key modules in `src/lib/game/`:

- `types.ts` — domain types (`GameState`, `City`, `Store`, `CompanyPolicy`, archetypes, terrain, industry types, etc.) and constants like `MAX_STORES`.
- `rng.ts` — seeded RNG; `state.rngState` is advanced through transitions to keep simulations reproducible from a `seed`.
- `city.ts` — city/tile generation and tile placement validation (`generateCity`, `getTileById`, `getTilePlacementBlockReason`).
- `archetypes.ts` — store archetype definitions and tuning knobs.
- `placement.ts` — opening forecast and store-creation transitions (`forecastOpening`, `getRecommendedArchetypes`, `createFoundingGameAtTile`, `openStoreAtTile`).
- `placementPreview.ts` — drives the **building-first** UX: builds `RetailBuildMenuOption[]` / industry equivalents with valid/invalid tile sets, setup-cost and revenue ranges, and disabled reasons. The map highlights valid tiles before the user clicks. This is the active placement workflow — prefer it over calling `forecastOpening` directly from UI code.
- `simulateDay.ts` — daily tick: applies policy, generates events, produces a `DailyReport`, advances RNG/day.
- `events.ts` / `reports.ts` — event sampling and report aggregation (`summarizeReports`).
- `state.ts` — policy and decision transitions (`DEFAULT_POLICY`, `updatePolicy`, `resolveDecision`).
- `staffing.ts` — staff requirements per archetype, hiring candidate market (refreshed every 7 days), and hiring/firing transitions.
- `stock.ts` — store product catalog, warehouse imports (7-day cycle), daily product sales resolution, and `StoreProductStatus` (`Out of stock` / `Needs import` / `Healthy`).
- `industry.ts`, `industryPlacement.ts`, `industryProduction.ts` — parallel industry simulation: deterministic district-based `IndustryCity`, raw resources (farmland/forest/mine anchors), `MaterialDefinition` + `ProductionRecipe`, industrial building placement, and daily production chain that feeds warehouses consumed by `stock.ts`.
- `mapRender.ts` / `industryMapRender.ts` — convert `GameState` / `IndustryCity` into `CityMapSnapshot` / `IndustryMapSnapshot` for the renderers. Tests live as `*.spec.ts` next to each module.

The Svelte page (`src/routes/+page.svelte`) holds reactive state (`$state`, `$derived`) for `game`, `selectedTileId`, save panel/control-tower toggles, etc. After every transition it calls `setGameAndAutosave`, which assigns the new state and triggers an autosave. The map snapshot is `$derived` from `game` (or the starter city when `game` is null) and passed to `<CityMap>`.

### Map rendering: Phaser scenes driven by snapshots

Two parallel renderers follow the same pattern:

- `CityMap.svelte` + `src/lib/phaser/cityMapScene.ts` — the retail city.
- `IndustryMap.svelte` + `src/lib/phaser/industryMapScene.ts` — the industry city.

Each scene is **snapshot-driven**: it never reaches into game state, only renders the latest snapshot and emits `tileSelected` events back to the Svelte component. Tile size is `32` px (used by both the scene and e2e tile-click math). When adding map features that apply to both maps, mirror the change across both scenes.

- `src/lib/assets/gameArt.ts` enumerates terrain/store image assets and is the single place to register new sprites; tests in `gameArt.spec.ts` enforce that every asset path under `static/assets/game/` is wired up.
- PNG sprites for the industry city are generated by `tools/generate_industry_assets.mjs` (uses `pngjs`). Run with `bun tools/generate_industry_assets.mjs` after editing the script's terrain/asset tables, then register the new paths in `gameArt.ts`.
- The canvas exposes `data-*` attributes (`data-store-sprite-count`, `data-terrain-asset-mode`, `data-terrain-base-sprite-count`, etc.) that e2e tests read to assert the renderer settled — see `src/routes/retail-sim.e2e.ts` for expected counts (e.g. base sprites = `width * height` = 400 on the 20×20 starter city). Update those asserts when changing terrain generation.

### Persistence: pluggable repository + factory

`src/lib/persistence/` defines `SaveRepository` with three backends and a runtime factory:

- `browserSaveRepository.ts` — `localStorage`-backed (default in the browser/preview).
- `tauriSaveRepository.ts` — uses `@tauri-apps/plugin-store`; loaded **dynamically** in `saveRepositoryFactory.ts` only when `isTauri()` is true. Don't statically import it from non-Tauri code paths.
- `saveStoreRepository.ts` — in-memory implementation used by tests.
- `saveCodec.ts` handles serialization; `saveTypes.ts` defines slot metadata. There is one auto-save plus N named manual slots.

When introducing a new persisted field, update `saveCodec.ts` and the repository tests together.

### Tauri shell

`src-tauri/` is the Rust desktop wrapper. `tauri.conf.json` points `frontendDist` at `../build` (output of `bun run build`) and uses `bun run dev` as the dev command. Capabilities live in `src-tauri/capabilities/`.

## Testing conventions

- Unit specs live next to their source as `<name>.spec.ts`.
- Svelte component specs use the `.svelte.spec.ts` suffix and run in the `client` (browser) Vitest project; non-Svelte specs run in `server` (node).
- E2e specs use the `*.e2e.ts` suffix and live alongside the route they exercise (`src/routes/retail-sim.e2e.ts`, `src/routes/demo/playwright/page.svelte.e2e.ts`). Playwright awaits the canvas's `data-*` attributes before clicking — preserve that pattern when adding map-related e2e tests.
- Because runes mode is forced (`svelte.config.js`), component code and `.svelte.spec.ts` tests must use `$state` / `$derived` / `$effect` rather than legacy `let` reactivity.

## Svelte MCP tools (mandatory for Svelte work)

You have access to the official Svelte MCP server. When writing or modifying Svelte code:

1. **`list-sections`** — call FIRST to discover relevant docs sections; analyze the `use_cases` field.
2. **`get-documentation`** — fetch ALL relevant sections identified above before writing code.
3. **`svelte-autofixer`** — run on every Svelte snippet you produce; keep calling it until it returns no issues. This is required before delivering Svelte code.
4. **`playground-link`** — only after user confirmation, and never for code already written to project files.

## Other notes

- `prettier-plugin-tailwindcss` orders class lists; don't fight it.
- ESLint config (`eslint.config.js`) extends typescript-eslint + `eslint-plugin-svelte` and uses `includeIgnoreFile(.gitignore)` — files ignored by git are also lint-ignored.
- `tsconfig.json` extends `.svelte-kit/tsconfig.json`; if path-alias issues appear after pulling, run `bun run prepare` (which calls `svelte-kit sync`).
