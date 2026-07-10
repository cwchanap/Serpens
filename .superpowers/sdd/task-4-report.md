# Task 4 Report: Update decision generators in world.ts

## What I Implemented

1. **`src/lib/game/world.ts`** — Updated decision generators to emit `DecisionContext`:
   - Imported `decisionContextWorldCityNotAvailableYet`, `decisionContextWorldCityOpeningCost`, `decisionContextWorldCityUnknown` and the `DecisionContext` type from `./decisionContext`.
   - Widened `WorldCityStatus.blockedReason` from `string | null` to `DecisionContext | null`.
   - Updated `getWorldCityStatus` to emit `DecisionContext` for `blockedReason`: `decisionContextWorldCityNotAvailableYet(city.id)` for locked cities, `decisionContextWorldCityOpeningCost(city.openingCost)` for revealed-but-unaffordable cities.
   - Updated `worldDecision` signature from `(game, title, context: string)` to `(game, title, context: DecisionContext)`. Decision id is now derived from `context.code` (observable id format change — acceptable for unreleased game).
   - Updated `openWorldCity` calls: `worldCityUnknown`, `worldCityNotAvailableYet(city.id)`, `worldCityOpeningCost(city.openingCost)`. The "not available yet" branch now carries the stable `cityId` enum, NOT the English `unlockRequirement` string.

2. **`src/routes/+page.svelte`** (~line 251) — Replaced hand-built `blockedReason: city.unlockRequirement` (raw English string) with `decisionContextWorldCityNotAvailableYet(city.id)` for the locked-city fallback case (when `game` is null). Added the import for `decisionContextWorldCityNotAvailableYet`.

3. **`src/lib/components/game/WorldMap.svelte.spec.ts`** — Updated `blockedReason` fixtures from strings to `DecisionContext` objects: `decisionContextWorldCityNotAvailableYet(city.id)` for locked cities, `decisionContextWorldCityOpeningCost(18_000)` for the unaffordable revealed-city test.

4. **`src/lib/game/world.spec.ts`** — Updated the existing "blocked city openings" test assertions from string contexts to `DecisionContext` objects. Added two new TDD tests per the plan.

## What I Tested and Test Results

- `bun run test:unit -- src/lib/game/world.spec.ts --run` → **27/27 PASS** (GREEN)
- `bun run test:unit -- src/lib/components/game/WorldMap.svelte.spec.ts --run --project client` → 6 PASS, 4 FAIL (expected — `localizeWorldCityStatus` in `gameCopy.ts` still expects `string | null`; fixed in Task 6)
- `bun run check` → 50 errors in 9 files, **ZERO in `world.ts`, `+page.svelte`, or `WorldMap.svelte`**. All errors are in `gameCopy.ts`, `gameCopy.spec.ts`, `events.ts`, `events.spec.ts`, `industryPlacement.ts`, `alerts.spec.ts`, `simulateDay.spec.ts`, `DecisionQueue.svelte.spec.ts`, `saveRepository.spec.ts` — all expected (Tasks 5-6).

## TDD Evidence (RED/GREEN)

**RED:** Before implementing, ran the new test:
```
bun run test:unit -- src/lib/game/world.spec.ts --run -t "structured openingCost"
→ 1 failed | expected { code: 'worldCityOpeningCost', cash: 18000 } but received "Opening this city requires 18,000 cash."
```

**GREEN:** After implementing, ran the full suite:
```
bun run test:unit -- src/lib/game/world.spec.ts --run
→ 27 passed (27)
```

## Files Changed

- `src/lib/game/world.ts` — DecisionContext imports, widened `WorldCityStatus.blockedReason`, updated `getWorldCityStatus`, `worldDecision`, `openWorldCity`.
- `src/lib/game/world.spec.ts` — Updated context assertions + 2 new TDD tests.
- `src/routes/+page.svelte` — Replaced `city.unlockRequirement` string with `decisionContextWorldCityNotAvailableYet(city.id)`.
- `src/lib/components/game/WorldMap.svelte.spec.ts` — Updated `blockedReason` fixtures to `DecisionContext` objects.

## Self-Review Findings

- **Completeness:** All plan steps completed. `world.ts` has zero type errors from the widening. The `cityId` (not English string) is carried in the "not available yet" branch per the critical constraint.
- **Quality:** Preserved existing comments and code style. Decision id format change flagged (now derived from `context.code`).
- **Discipline (YAGNI):** No extra changes. Did not touch `gameCopy.ts` or `WorldMap.svelte` render logic (Task 6).
- **Testing:** TDD followed (RED → GREEN). Expected failures in `WorldMap.svelte.spec.ts` and `gameCopy.spec.ts` are deferred to Task 6.

## Issues or Concerns

- The `+page.svelte` fallback (when `game` is null) now emits `decisionContextWorldCityNotAvailableYet(city.id)` for non-starter cities. For starter cities (`initiallyOpened: true`), `blockedReason` is `null` and state is `'opened'`, which is correct.
- `WorldMap.svelte.spec.ts` has 4 runtime failures due to `localizeWorldCityStatus` expecting strings — expected and fixed in Task 6.
- 50 type errors remain in `gameCopy.ts`, `events.ts`, `industryPlacement.ts`, and various spec files with string `DecisionItem.context` fixtures — all expected (Tasks 5-6).
