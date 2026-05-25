# Test Coverage: Reach 70% Lines on Codecov

**Date:** 2026-05-24
**Status:** Approved
**Target:** 70% line coverage (Codecov reports 58.3%, local v8 reports 64.08%)

## Current State

```text
Statements   : 69.5% (2988/4299)
Branches     : 57.15% (1006/1760)
Functions    : 77.58% (803/1035)
Lines        : 64.08% (2184/3408)
```

Target 70% lines = 2386 covered lines. Gap: ~202 lines.

## Approach: Quick Wins First

Start with trivial/medium files that give the best coverage-per-effort ratio. Phaser scenes and `+page.svelte` are insurance if the Codecov number differs from local.

## Tier 1 — Trivial Wins (~45 lines)

### `saveRepositoryFactory.ts` (0%, ~10 lines)

- **Type:** Server-side spec (`saveRepositoryFactory.spec.ts`)
- **Strategy:** Mock `$app/environment` `browser` flag and `@tauri-apps/api/core` `isTauri`. Test both branches: Tauri path returns Tauri repo, browser path returns browser repo. Test `isTauriRuntime()` with `__TAURI_INTERNALS__` window property.

### `+layout.svelte` (0%, ~13 lines)

- **Type:** Client-side spec (`+layout.svelte.spec.ts`)
- **Strategy:** Render component with slot children, verify `<link>` elements for favicon and fonts are present, confirm children render.

### `Scorecard.svelte` (0%, ~22 lines)

- **Type:** Client-side spec (`Scorecard.svelte.spec.ts`)
- **Strategy:** Render with a fixed `Scorecard` prop (all four scores set). Assert four `<meter>` elements with correct `value` attributes, correct labels, and correct ARIA labels.

## Tier 2 — Medium Components (~168 lines)

### `DecisionQueue.svelte` (0%, ~30 lines)

- **Type:** Client-side spec (`DecisionQueue.svelte.spec.ts`)
- **Strategy:** Test two states:
  1. Empty `decisions` array — shows "No urgent decisions today" message.
  2. Populated array — renders decision cards with titles, context, expiry, and option buttons.
  3. Click an option button — verify `onResolve(decisionId, optionId)` fires with correct IDs.

### `PolicyPanel.svelte` (0%, ~46 lines)

- **Type:** Client-side spec (`PolicyPanel.svelte.spec.ts`)
- **Strategy:** Render with a `CompanyPolicy` prop. Assert five `<select>` elements render with correct current values. Fire `change` event on a select, verify `onChange` receives the correct partial policy patch.

### `CityMap.svelte` / `IndustryMap.svelte` (0%, ~70 lines each)

- **Type:** Client-side spec (`CityMap.svelte.spec.ts`, `IndustryMap.svelte.spec.ts`)
- **Strategy:** Mock the `phaser` and scene module dynamic imports at the test level. Test:
  1. Mount triggers `startPhaser` — scene is created with correct config.
  2. Snapshot `$effect` propagation — `updateSnapshot` called on scene.
  3. Tile selection — `onTileSelected` fires when scene emits `tileSelected` event.
  4. Destroy — game is destroyed, scene reference cleared.
  5. Error path — Phaser import failure sets `loadFailed`, shows fallback message.

## Tier 3 — Phaser Scenes (Insurance, ~1533 lines)

### `cityMapScene.ts` / `industryMapScene.ts` (0%, ~700 lines each)

- **Type:** Server-side specs (`cityMapScene.spec.ts`, `industryMapScene.spec.ts`)
- **Strategy:** Create a Phaser mock factory that stubs `Phaser.Game`, `Phaser.Scene`, `add.group()`, `add.sprite()`, `input.on()`, `scale.on()`, `cameras.main`, etc. Test:
  1. `init`/`create` lifecycle — scene sets up groups and input handlers.
  2. `updateSnapshot` — sprites added/removed based on tile data, data attributes set on canvas.
  3. `tileSelected` event emission on pointer click with correct tile coordinates.
  4. Highlight state management — valid tiles highlighted, previous highlights cleared.
  5. `setEventHandler` — event handler receives events, null handler is safe.

## Tier 4 — `+page.svelte` (Insurance, ~800 lines)

### `+page.svelte` (0%)

- **Type:** Client-side spec (`+page.svelte.spec.ts`)
- **Strategy:** Mock all game transition functions and persistence layer. Test:
  1. Initial render — shows start screen / empty state.
  2. Game creation — state transitions, reactive updates.
  3. Tile selection — selected tile ID updates, inspector shows.
  4. Day advance — `simulateDay` called, daily report generated.
  5. Panel toggles — control tower tabs switch correctly.
  6. Autosave — `setGameAndAutosave` writes to repository after transitions.

## Execution Order

1. Tier 1 (trivial) — quick, validates test infrastructure works for new file types.
2. Tier 2 (medium) — covers the bulk of the gap.
3. **Measure coverage** — if >= 70% lines, stop. Otherwise continue.
4. Tier 3 (Phaser scenes) — if still short.
5. Tier 4 (`+page.svelte`) — last resort.

## Testing Conventions

- Svelte component specs use `.svelte.spec.ts` suffix, run in `client` Vitest project (Playwright/Chromium headless).
- Non-Svelte specs run in `server` (node) project.
- Every test must contain an `expect` assertion (`requireAssertions: true`).
- Follow existing patterns from neighboring `.spec.ts` files.
