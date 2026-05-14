# Industry Map District Tiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Industry City Map terrain read as planned districts rather than random patchwork.

**Architecture:** Keep the existing industry-map architecture. Modify only the pure generator in `src/lib/game/industry.ts` and lock the behavior with focused tests in `src/lib/game/industry.spec.ts`.

**Tech Stack:** TypeScript, Vitest, SvelteKit/Bun.

---

### Task 1: Test Planned District Terrain

**Files:**

- Modify: `src/lib/game/industry.spec.ts`

- [ ] **Step 1: Add tests for the district layout**

Add assertions to the existing `industry city generation` block that count terrain by coordinate region. Assert that the north crop belt is mostly farmland, deposit neighborhoods remain deposit-heavy, the lower utility belt has coherent water/forest regions, the southeast industrial park is mostly industrial, and internal blocked tiles are sparse.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `bun run test:unit -- src/lib/game/industry.spec.ts --run`

Expected: the new district-layout test fails against the existing random filler terrain.

### Task 2: Implement District-Based Filler Terrain

**Files:**

- Modify: `src/lib/game/industry.ts`

- [ ] **Step 1: Replace random filler terrain with coordinate districts**

Keep resource anchors and border blocking. Replace the random `getFillerTerrain` logic with deterministic district rules for farmland, deposits, water, forest, industrial lots, and sparse internal blocked separators.

- [ ] **Step 2: Run the focused test and verify it passes**

Run: `bun run test:unit -- src/lib/game/industry.spec.ts --run`

Expected: all tests in `industry.spec.ts` pass.

### Task 3: Verify The Map Path

**Files:**

- Existing verification only.

- [ ] **Step 1: Run related unit tests**

Run: `bun run test:unit -- src/lib/game/industry.spec.ts src/lib/game/industryMapRender.spec.ts --run`

Expected: both suites pass.

- [ ] **Step 2: Run type diagnostics**

Run: `bun run check`

Expected: SvelteKit sync and Svelte diagnostics pass.

- [ ] **Step 3: Smoke-test the browser-facing map**

Start the Vite dev server and inspect the Industry City Map route with the existing app flow. Confirm the canvas settles with industry terrain image assets and the district layout is visually calmer.
