## Task 3 Report: Structured Placement Reasons

### What I implemented

- Converted retail and industry placement-preview block reasons in `src/lib/game/placementPreview.ts` from English strings to a structured `PlacementBlockReason` discriminated union.
- Changed `RetailBuildMenuOption.disabledReason`, `getRetailPlacementBlockReason(...)`, and `getIndustryBuildPlacementBlockReason(...)` to use structured reasons.
- Mapped existing retail footprint strings at the `placementPreview.ts` boundary into stable reason codes:
  - `retail.unknownCityTile`
  - `retail.storeLimitReached`
  - `retail.requiresCash`
  - `retail.occupiedLocation`
  - `retail.lockedLocation`
  - `retail.roadLocation`
  - `retail.riverLocation`
  - `retail.noValidTiles`
- Kept industrial placement validation strings wrapped as `{ code: 'industry.rawPlacementBlocked', message }` without rewriting `industryPlacement.ts`.
- Added `formatPlacementBlockReason(reason, i18n)` to `src/lib/i18n/gameCopy.ts`.
- Added `placement.*` message catalog entries in:
  - `src/lib/i18n/messages/en.ts`
  - `src/lib/i18n/messages/ja.ts`
  - `src/lib/i18n/messages/zh-Hant.ts`
- Updated `placementPreview.spec.ts` and `gameCopy.spec.ts` to assert structured reasons and localized formatting.

### What I tested and exact results

#### RED evidence

Command:

```bash
rtk bun run test:unit -- src/lib/game/placementPreview.spec.ts --run
```

Result:

```text
FAIL |server| src/lib/game/placementPreview.spec.ts (28 tests | 9 failed)
- expected 'Road location' to deeply equal { code: 'retail.roadLocation' }
- expected 'Occupied location' to deeply equal { code: 'retail.occupiedLocation' }
- expected 'Locked location' to deeply equal { code: 'retail.lockedLocation' }
- expected 'Store limit reached' strings to deeply equal structured reason objects
- expected 'Requires 15,200 cash' to deeply equal { code: 'retail.requiresCash', amount: 15200 }
- expected 'Found a retail store to unlock construction.' to deeply equal { code: 'industry.lockedUntilRetail' }
```

Command:

```bash
rtk bun run test:unit -- src/lib/i18n/gameCopy.spec.ts --run
```

Result:

```text
FAIL |server| src/lib/i18n/gameCopy.spec.ts (6 tests | 1 failed)
TypeError: formatPlacementBlockReason is not a function
```

#### GREEN evidence

Command:

```bash
rtk bun run test:unit -- src/lib/game/placementPreview.spec.ts --run
```

Result:

```text
Test Files  1 passed (1)
Tests      28 passed (28)
```

Command:

```bash
rtk bun run test:unit -- src/lib/i18n/gameCopy.spec.ts --run
```

Result:

```text
Test Files  1 passed (1)
Tests       6 passed (6)
```

Command:

```bash
rtk bun run test:unit -- src/lib/game/placementPreview.spec.ts src/lib/i18n/gameCopy.spec.ts --run
```

Result:

```text
Test Files  2 passed (2)
Tests      34 passed (34)
```

#### Additional verification

Command:

```bash
rtk bun run lint
```

Result:

```text
PASS
All matched files use Prettier code style!
```

Command:

```bash
rtk bun run check
```

Result:

```text
FAIL
/Users/chanwaichan/workspace/Serpens/src/lib/components/game/BuildMenu.svelte.spec.ts:240:6
Error: Type 'string' is not assignable to type 'PlacementBlockReason | null'.

/Users/chanwaichan/workspace/Serpens/src/routes/+page.svelte:824:4
Error: Type 'PlacementBlockReason' is not assignable to type 'string | null'.

/Users/chanwaichan/workspace/Serpens/src/routes/+page.svelte:877:4
Error: Type 'PlacementBlockReason' is not assignable to type 'string | null'.
```

### Files changed

- `src/lib/game/placementPreview.ts`
- `src/lib/game/placementPreview.spec.ts`
- `src/lib/i18n/gameCopy.ts`
- `src/lib/i18n/gameCopy.spec.ts`
- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`

### Self-review findings

- Retail footprint strings are converted only at the `placementPreview.ts` boundary, so `storeFootprint.ts` and other existing string-based flows are untouched.
- Industrial raw placement errors remain readable via `industry.rawPlacementBlocked`, matching the task requirement to avoid rewriting `industryPlacement.ts`.
- Cash formatting uses `i18n.format.currency(amount)` in the new formatter.
- Message catalogs were updated for all locales to preserve key parity.

### Concerns

- `bun run check` still fails because downstream consumers outside this task’s ownership still assume placement reasons are plain strings:
  - `src/lib/components/game/BuildMenu.svelte.spec.ts`
  - `src/routes/+page.svelte`
- Those callers need a follow-up migration to `PlacementBlockReason` and `formatPlacementBlockReason(...)`.
