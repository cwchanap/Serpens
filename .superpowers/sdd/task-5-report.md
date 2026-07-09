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

## Review fix: world-city currency formatting

### What changed

- Added focused regression coverage in `src/lib/i18n/gameCopy.spec.ts` for the world-city cash requirement path used by both `localizeDecision` and `localizeWorldCityStatus`.
- Updated `src/lib/i18n/gameCopy.ts` so the known world-city opening-cost sentence parses the numeric amount and passes it through `i18n.format.currency(amount)` before inserting it into localized copy.
- Kept the fix narrow to the existing helper path. I did not introduce structured `openingCost` into `DecisionItem`, because the status helper already has access to `status.city.openingCost` and the decision helper can safely parse the stable world-city sentence emitted by `world.ts`.

### RED evidence

Command:

```bash
bun run test:unit -- src/lib/i18n/gameCopy.spec.ts --run
```

Expected failure:

```text
FAIL  |server| src/lib/i18n/gameCopy.spec.ts > game copy builders > formats world-city cash requirements with the active locale currency formatter
AssertionError: expected 'この都市を開くには 18,000 の資金が必要です。' to contain '$18,000'

Test Files  1 failed (1)
Tests       1 failed | 7 passed (8)
```

Why it failed as expected:

- The existing helper matched `Opening this city requires 18,000 cash.` but reinserted the regex-captured `18,000` string directly, so non-English localized copy did not use `i18n.format.currency`.

### GREEN evidence

Focused i18n spec:

```bash
bun run test:unit -- src/lib/i18n/gameCopy.spec.ts --run
```

Output:

```text
Test Files  1 passed (1)
Tests       8 passed (8)
```

Task 5 placement/i18n command:

```bash
bun run test:unit -- src/lib/game/placementPreview.spec.ts src/lib/i18n/gameCopy.spec.ts --run
```

Output:

```text
Test Files  2 passed (2)
Tests       36 passed (36)
```

Project check:

```bash
bun run check
```

Output:

```text
svelte-check found 0 errors and 0 warnings
```

### Save-error minor finding

- Deferred. `src/routes/+page.svelte` still maps `Error.message` through `describeSaveError`; cleaning that up properly needs a route-level seam for repository failures or a route-adjacent harness that can drive the async save repository wiring without becoming brittle.
- The existing practical tests are at the persistence layer and the `SavePanel` component boundary. They do not cover the route-owned `describeSaveError` flow where the raw message is assigned.
- I kept this review fix scoped to the blocking helper bug and documented the route-save item for a later route-harness pass.

### Self-review

- Verified both helper users now share the same parsing/formatting path.
- Verified the helper only localizes the known world-city opening-cost sentence and leaves unknown historical copy unchanged.
- Verified `localizeWorldCityStatus` can fall back to `status.city.openingCost` if the parsed amount is unavailable after the sentence match.
