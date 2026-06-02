# World Map Assets Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real bitmap assets to the world map and make the map menu expose all options without pre-game disabling.

**Architecture:** World-map art is a small registered asset catalog in `gameArt.ts`, consumed by `WorldMap.svelte` without changing campaign state. The existing SVG world-map overlay remains responsible for stateful city interaction, while the PNG background and markers provide visual polish.

**Tech Stack:** Svelte 5 runes, SvelteKit `$app/paths`, TypeScript, Vitest browser specs, generated PNG assets in `static/assets/game/world/`.

---

## Task 1: World Art Registry

**Files:**

- Modify: `src/lib/assets/gameArt.ts`
- Modify: `src/lib/assets/gameArt.spec.ts`
- Create: `static/assets/game/world/regional-map.png`
- Create: `static/assets/game/world/city-retail.png`
- Create: `static/assets/game/world/city-industry.png`
- Create: `static/assets/game/world/city-locked.png`

- [ ] **Step 1: Write failing asset registry test**

Add an assertion that `WORLD_MAP_ART.background.path` is `/assets/game/world/regional-map.png`, that every marker path exists under `/assets/game/world/`, and that the images are non-empty PNGs with expected dimensions.

- [ ] **Step 2: Run the asset test red**

Run: `bun run test:unit -- src/lib/assets/gameArt.spec.ts --run`
Expected: fail because `WORLD_MAP_ART` does not exist.

- [ ] **Step 3: Generate and save bitmap assets**

Use the built-in image generation path to create a hand-painted regional map and three transparent-marker style assets. Save the selected outputs to `static/assets/game/world/` and normalize dimensions if needed.

- [ ] **Step 4: Register world art constants**

Export `WORLD_MAP_ART` and `WORLD_MAP_ART_LIST` from `src/lib/assets/gameArt.ts`.

- [ ] **Step 5: Run the asset test green**

Run: `bun run test:unit -- src/lib/assets/gameArt.spec.ts --run`
Expected: pass.

## Task 2: World Map Rendering

**Files:**

- Modify: `src/lib/components/game/WorldMap.svelte`
- Modify: `src/lib/components/game/WorldMap.svelte.spec.ts`

- [ ] **Step 1: Write failing component test**

Assert that the world map renders the regional background image and marker images for retail, industry, and locked states.

- [ ] **Step 2: Run the component test red**

Run: `bun run test:unit -- src/lib/components/game/WorldMap.svelte.spec.ts --run --project client`
Expected: fail because image assets are not rendered.

- [ ] **Step 3: Render assets in `WorldMap.svelte`**

Import `asset` and `WORLD_MAP_ART`, add a decorative background image, and place per-city marker images at the existing `worldX/worldY` coordinates while preserving button/list accessibility.

- [ ] **Step 4: Run Svelte autofixer**

Run `svelte-autofixer` on the full updated `WorldMap.svelte` contents until it reports no issues.

- [ ] **Step 5: Run the component test green**

Run: `bun run test:unit -- src/lib/components/game/WorldMap.svelte.spec.ts --run --project client`
Expected: pass.

## Task 3: Menu Availability

**Files:**

- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

- [ ] **Step 1: Write failing e2e assertion**

Update the menu e2e coverage so that opening the menu before founding a store shows all route and management options enabled.

- [ ] **Step 2: Run the targeted e2e red**

Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "management panels open from the map menu and close as overlays"`
Expected: fail while menu items still have `disabled={!game}`.

- [ ] **Step 3: Remove menu disabling checks**

Remove `disabled={!game}` from the World Map and management panel menu buttons. Keep existing downstream guards so panels that require a game do not render invalid state.

- [ ] **Step 4: Run Svelte autofixer**

Run `svelte-autofixer` on the full updated `+page.svelte` contents until it reports no issues.

- [ ] **Step 5: Run targeted verification**

Run: `bun run check`
Run: `bun run test:unit -- src/lib/assets/gameArt.spec.ts src/lib/components/game/WorldMap.svelte.spec.ts src/lib/components/game/BuildMenu.svelte.spec.ts --run`
Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "management panels open from the map menu and close as overlays|player opens a revealed retail city from the world map and builds there"`
Expected: all pass.
