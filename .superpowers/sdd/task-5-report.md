# Task 5 Report: Build, Inspectors, World, Saves, and Decisions

## What I implemented

- Localized `BuildMenu.svelte`, `TileInspector.svelte`, `IndustryTileInspector.svelte`, `WorldMap.svelte`, `SavePanel.svelte`, and `DecisionQueue.svelte` through the existing `I18nBundle` runtime.
- Updated `src/routes/+page.svelte` to:
  - keep `placementFeedback` as `PlacementBlockReason | null`
  - render placement feedback through `formatPlacementBlockReason(placementFeedback, i18n)`
  - fall back to `i18n.t('placement.chooseHighlightedTile')`
  - pass `i18n` into BuildMenu, WorldMap, both inspectors, DecisionQueue, and SavePanel
  - localize the route-level inspector dialog labels
- Replaced component-local English formatters and label builders with existing i18n helpers:
  - `i18n.format.currency`
  - `i18n.format.integer`
  - `i18n.format.dateTime`
  - `i18n.labels.*`
  - `localizeDecision`
  - `localizeWorldCityStatus`
  - `localizeStockTrouble`
  - `formatPlacementBlockReason`
- Added and updated representative localized component specs so each touched spec now passes `i18n` and asserts at least one fixed non-English label.
- Added the required message keys in `en`, `ja`, and `zh-Hant` for the touched surfaces.
- Localized two extra fixed-copy leftovers found during self-review:
  - Build-menu disabled badge (`Unavailable`) moved out of CSS pseudo-content into localized markup
  - Route wrapper inspector `aria-label`s moved into message catalogs

## TDD evidence

### RED

Command:

```bash
bun run test:unit -- src/lib/components/game/BuildMenu.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts src/lib/components/game/IndustryTileInspector.svelte.spec.ts src/lib/components/game/WorldMap.svelte.spec.ts src/lib/components/game/SavePanel.svelte.spec.ts src/lib/components/game/DecisionQueue.svelte.spec.ts --run --project client
```

Observed failure summary:

- The touched localized assertions failed because the components were still rendering English/fixed copy and had not fully adopted `i18n`.
- Failures were in:
  - `DecisionQueue.svelte.spec.ts`
  - `WorldMap.svelte.spec.ts`
  - `IndustryTileInspector.svelte.spec.ts`
  - `TileInspector.svelte.spec.ts`
  - `SavePanel.svelte.spec.ts`

Why that failure was expected:

- Step 1 changed the touched specs to require `i18n` and verify localized labels before the implementation existed, so the client-spec run correctly went red first.

### GREEN

Touched client specs:

```bash
bun run test:unit -- src/lib/components/game/BuildMenu.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts src/lib/components/game/IndustryTileInspector.svelte.spec.ts src/lib/components/game/WorldMap.svelte.spec.ts src/lib/components/game/SavePanel.svelte.spec.ts src/lib/components/game/DecisionQueue.svelte.spec.ts --run --project client
```

Output:

```text
Test Files  6 passed (6)
Tests       80 passed (80)
```

Placement/i18n specs:

```bash
bun run test:unit -- src/lib/game/placementPreview.spec.ts src/lib/i18n/gameCopy.spec.ts --run
```

Output:

```text
Test Files  2 passed (2)
Tests       35 passed (35)
```

Project verification:

```bash
bun run check
bun run lint
```

Output:

```text
svelte-check found 0 errors and 0 warnings
All matched files use Prettier code style!
```

Note:

- `bun run lint` initially failed on Prettier formatting only. I ran targeted Prettier writes on the named touched files, then reran `bun run check` and `bun run lint` successfully.

## Svelte MCP/autofixer evidence

Docs workflow completed earlier in the task:

- `list-sections`
- `get-documentation` for:
  - `svelte/$props`
  - `svelte/$state`
  - `svelte/$derived`
  - `svelte/basic-markup`
  - `svelte/if`
  - `svelte/each`
  - `kit/accessibility`
  - `svelte/typescript`

Autofixer runs with no remaining issues:

- `DecisionQueue.svelte` -> `issues: []`
- `SavePanel.svelte` -> `issues: []`
- `WorldMap.svelte` -> `issues: []`
- `TileInspector.svelte` -> `issues: []`
- `IndustryTileInspector.svelte` -> `issues: []`
- `BuildMenu.svelte` -> `issues: []`
- `+page.svelte` changed sections validated through a standalone valid route snippet -> `issues: []`

## Files changed

- `src/routes/+page.svelte`
- `src/lib/components/game/BuildMenu.svelte`
- `src/lib/components/game/BuildMenu.svelte.spec.ts`
- `src/lib/components/game/TileInspector.svelte`
- `src/lib/components/game/TileInspector.svelte.spec.ts`
- `src/lib/components/game/IndustryTileInspector.svelte`
- `src/lib/components/game/IndustryTileInspector.svelte.spec.ts`
- `src/lib/components/game/WorldMap.svelte`
- `src/lib/components/game/WorldMap.svelte.spec.ts`
- `src/lib/components/game/SavePanel.svelte`
- `src/lib/components/game/SavePanel.svelte.spec.ts`
- `src/lib/components/game/DecisionQueue.svelte`
- `src/lib/components/game/DecisionQueue.svelte.spec.ts`
- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`

## Self-review findings

- Verified the task stayed on the existing `src/lib/i18n/` path rather than introducing a parallel localization mechanism.
- Verified route/component integration uses existing helpers for decision, world-city, stock-trouble, and placement-copy localization.
- Verified no remaining touched-test failures.
- Verified route-level fixed English inspector labels were removed.
- Verified the build-menu disabled badge no longer depends on hardcoded CSS `content`.

## Issues or concerns

- No blocking issues.
- The i18n message files grew substantially because this task added full coverage for six previously English-only game panels across three locales. That is expected for the task scope.
