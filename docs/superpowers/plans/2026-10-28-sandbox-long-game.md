# HPA-318 — Sandbox Long Game Implementation Plan

**Issue:** https://linear.app/cwchanap/issue/HPA-318/progression-give-the-sandbox-a-long-game-with-company-value-and-a-goal  
**Design:** `docs/superpowers/specs/2026-10-28-sandbox-long-game-design.md`  
**Branch / PR:** `docs/hpa-318-sandbox-long-game` · **single PR for this ticket**  
**Status:** planning checkpoint — runtime work has not started; no test outcomes implied

## Goal and scope discipline

Deliver one vertical sandbox progression feature, end to end: book-value calculation, five metric-backed tiers, persistent claims and earned cap/credit rewards, Dashboard UI, tri-language copy, deterministic calibration and tests. The PR remains draft until the complete implementation passes verification; do not create extra PRs per phase.

Do not install a new state machine, telemetry/achievement framework, asset ledger or backend. No new art, audio, city or resale path. Pre-release saves do not receive compatibility adapters.

## Step 0 — Baseline invariants and calibration feasibility (first checkpoint)

Read at implementation HEAD, not only the original HPA-318 baseline (`200bc7b`): `world.ts`, `state.ts`, `finance.ts`, `simulateDay.ts`, `scenarios/metrics.ts`, `saveCodec.ts`, `scenarioCodec.ts`, `scenarios/setup.ts`, Dashboard host, `tests/balance/bots.ts` and `docs/balance/after.md`.

Write a focused fixture to prove why the existing advisor bot cannot hit city-opening/level conditions: it never runs `openWorldCity` or `upgradeStore`, and HPA-502 after-sweep shows negative median convenience/advisor cash at d365. Avoid tuning goals to a bot that lacks the necessary action vocabulary. Identify existing legal `applyGameCommand` cases for city opening, upgrades and city selection, then extend the **test-only scripted strategy**, never a second command adapter or engine.

**Gate:** agree on exactly which bot actions are needed, preserve the HPA-502 reference bot unchanged, and commit an explicit candidate goal table; neither five-tier reachability nor the proposed 120/250–365 days is claimed yet.

## Step 1 — Pure company book value + hand fixture

**Files:** `src/lib/game/companyBookValue.ts`, `companyBookValue.spec.ts`; existing cost catalog modules (read-only).

Implement `getCompanyBookValue(game)` returning `{ total, cash, retailAssets, industryAssets, railAssets, inventory, debt }`. Reuse `getExpansionSetupCost`, `getStoreUpgradeCost`, `getBuildingUpgradeCost`, `INDUSTRIAL_BUILDING_TYPES`, `RAIL_*_COST*`, `MATERIALS`, and canonical branded product unit-cost calculation; make no new price tables.

- Treat `store-1` setup as zero; recompute nonfounding setup from location/tile; sum prior upgrade levels.
- Value only surviving buildings and rail cells. Inventory from on-hand store lots, city materials and building buffers; check authoritative transfer order status/quantity before including any remaining in-transit goods so a unit is counted once.
- Subtract `getTotalDebt` once; keep negative totals. Lending +cash/−debt alone is net-neutral.
- Test the $55,705 sample from the design plus fully empty assets, max levels, multiple cities, removed rails/buildings and a partially delivered transfer. Assert no input mutation and repeatability.

**Gate:** unit tests show the breakdown is recomputed solely from `GameState`, with no floating-value surprises or double counting.

## Step 2 — Report snapshots and shared metric registry

**Files:** `src/lib/game/types.ts`, `src/lib/game/simulateDay.ts`, `src/lib/scenarios/types.ts`, `src/lib/scenarios/metrics.ts`, affected metric/report specs and `persistence/saveCodec.ts`.

Add `DailyReport.companyBookValueAfter`, computed on the **closing-day post-finance game** alongside `cashAfter` and `outstandingPrincipalAfter`. Ensure the value is not computed prematurely before inventory transfers, sales, finance service or deferred events. Add finite-integer report validation to the existing report decoder; update current test fixtures. No second historical value array.

Extend the existing exhaustive `METRIC_REGISTRY` / `ScenarioMetricQuery` with `max-store-level`, `opened-city-count`, `company-book-value` and `peak-company-book-value`. Current metrics read the live state; peak reads completed report snapshots using run-to-date only. Reuse existing format/window validation and canonical contribution IDs (report evidence for the peak day), without adding standalone metrics registries.

**Gate:** metrics return expected numerical results and windows, unknown metric remains invalid, previous seven scenario definitions still validate and score identically.

## Step 3 — Immutable authored tiers and claims

**Files:** `src/lib/game/progression.ts`, `progression.spec.ts`, `types.ts`.

Implement a five-entry, typed `PROGRESSION_TIERS` catalog, an `evaluateProgression(game)` pure selector that calls `evaluateMetric`, and an idempotent `claimEarnedTiers(game)` transition. Each tier contains 2–3 monotonic goals and a uniform +1 store capacity / +$25k principal ceiling bonus. Keep stable IDs and translation keys; avoid a configurable/JSON authoring format.

- Define contiguous catalog-prefix claim order; a tier is awarded only after preceding tiers.
- Return the original state on repeat evaluation; no RNG consumed, no duplicate system notices.
- Use persistent claim receipts `{tierId,claimedOnDay}`; keep goal results and historical peak derived.
- Note that a claim can follow real purchases or simulation, so refresh claimed tiers at the shared sandbox commit boundary; model no required mutation of each individual store/finance command.
- When all tiers claimed, return summary information from receipts/reports and allow ongoing play.

**Gate:** mid-day action followed by command commit, multi-tier eligible state, replay, repeat call and no-op/reference-stability all pass.

## Step 4 — Rewards, save invariants and explicit scenario isolation

**Files:** `src/lib/game/world.ts` or a focused cap helper, `finance.ts`, `state.ts`, `persistence/saveCodec.ts`, `persistence/scenarioCodec.ts`, `scenarios/setup.ts`, `routes/gameRouteController.ts` and `routes/+page.svelte` (only when needed); corresponding specs/repository fixtures.

- Make `GameState.progression.claims` a required initial field. Derive the maximum store cap from opened-city bonuses, existing world positive-income claim and tier count; verify upgrades/opens never apply a bonus twice. Keep `refreshWorldProgress` existing behavior and fixed-point guarantee.
- Replace `finance.ts:assessCredit` `100_000` ceiling with `getCreditCeiling(game)`. Do not modify the repayment-service or delinquency constraints; test no borrowing windfall.
- In sandbox, refresh progression after every committed mutation and advance-day result, *before* save. Extend strict game save validation for IDs, ordering, valid dates, earned monotone evidence and cap/claim coherence. Validate against **decoded** reports. Reject an unearned tier rather than repairing it silently.
- Scenario runs share `GameState` and strict validation but use authored store cap and command constraints. Supply an explicit **scenario context** to save validation where needed, initialize empty claims in scenario setup, and prevent progression claims in scenario `advanceDay` or any scenario command. Do not store a redundant `playMode` field in `GameState`. Scenario codec round-trip must continue to accept scenario-specific `storeCap` overrides.
- Update all required mock `GameState` literals and repository tests without migrations or compatibility fallback.

**Gate:** sandbox save→reload same claims/cap/final completion day; unknown/duplicate/skipped/unearned claims fail; scenario setup, scenario save and resume remain valid, no unlock notices or reward cap changes in scenario.

## Step 5 — Dashboard UI and three-language copy

**Files:** `src/lib/components/game/SandboxProgression.svelte` and component spec; `src/routes/ManagementPanelHost.svelte`, `src/routes/+page.svelte`, locale message files, existing `i18n` helpers.

Place live book value and next tier in Dashboard beside `DailyResultSummary` and `Scorecard`. Render honest current/target rows, completion state and the next store-cap/credit-ceiling rewards, using the current objective evidence typography and `i18n.format`. Extract a shared evidence row only if meaningful reuse emerges; do not send fake scenario objective records into `ScenarioObjectivePanel`.

- Explicitly pass `showSandboxProgression = (playMode === 'sandbox')` to the host. A scenario dashboard, scenario status strip and scenario results must never show ladder UI.
- Reuse the existing system decision/acknowledgement presentation for a once-only tier notice; final tier adds a succinct summary with continue-playing interaction, not a new modal workflow.
- Add en, ja and zh-Hant strings for tier labels, goals, book value, earned rewards, notices and summary.
- Component tests for narrow layout, keyboard/focus order, actual vs target formatting, tier transition and scenario hidden behavior. Prefer existing tokens; no new assets.

**Gate:** manual / component evidence that statuses do not depend on color and that the Dashboard remains navigable at desktop and compact sizes.

## Step 6 — Goal calibration using the *existing* harness

**Files:** `tests/balance/bots.ts` (minimal extra opt-in strategy helper), `tests/balance/*.spec.ts`, `docs/balance/progression-calibration.md`.

Run seed **20260503** through 365 days with an explicit deterministic progression-capable advisor script that uses only legal world opening/store upgrades and existing actions. Preserve original `advisor`, `idle`, and HPA-502 after-sweep behavior. Record all five claim days, failed attempts, ending company value, and the primary blocker if unreachable.

Calibration sequence:
1. Check that idle cannot claim Local Shop (requires a second store).
2. Check that the legal reference can claim Local Shop and progress into manufacturing/cities.
3. Adjust **authored tier conditions/thresholds**, not simulation costs, to obtain a meaningful, nontrivial goal sequence with no forced build order.
4. Compare measured tier-3/day-120 and final-tier/day-250–365 targets. If not feasible, document the exact divergence and a revised range based on traces; never assert PASS based on a synthetic state edit.
5. Run a small additional fixed-seed sanity sample across archetypes, if cheap, to avoid one-seed exploits. Do not rerun a costly full 50×365 matrix unless changing the economy (which is out of scope).

**Gate:** committed calibration summary explicitly distinguishes proposed vs measured goals, and negative control stays negative. If the reference cannot reach the final tier at all, the PR remains draft with a documented blocker.

## Step 7 — End-to-end integration, docs and verification

**Files:** `src/routes/retail-sim.e2e.ts` / `time-flow.e2e.ts` (extend closest existing journey), `CLAUDE.md`, affected tests.

- E2E: create sandbox, obtain real first-tier claim via legal actions and daily settlement, observe the notice and +1 cap, save/reopen and assert earned tier; start a scenario and assert the ladder is absent and no claims are issued.
- Verify world city unlock and store-cap progression combination, all authored scenario modes, company-value report snapshots, finance credit ceilings, after-report regression, and copy parity.
- Fix `CLAUDE.md` stale `MAX_STORES` reference to documented derived-cap rules.
- Full final quality gate:

```bash
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e
git diff --check main...HEAD
```

Run focused specs and a targeted E2E after each risky integration, then full suite at the end. **No tests have been executed as part of this planning-only draft.**

## Review/implementation risks and resolutions

| Risk | Containment |
| --- | --- |
| Existing advisor bot lacks world-opening and upgrading; tuned convenience advisor loses cash by d365 | Separate opt-in progression script, legal command evidence, provisional thresholds, no claim of current passing pacing |
| Cap counted twice across a world milestone/city opening/tier claim | Single derived cap invariant + combination fixture; retain current world transition fixed-point behavior |
| Scenario save has authored `storeCap` and uses same `GameState` | Explicit sandbox/scenario codec context and scenario progression opt-out; no new stored mode flag |
| Claims made after a transient high value become unverifiable later | Only monotone criteria / peak from validated historical reports; no current-cash/market-share claim goals |
| Historical malformed reports are dropped by decoder | Validate claim proof after decoding; reject claims with missing evidence |
| Valuation double counts stock moving between cities | Consult existing authoritative transfer order lifecycle, distinguish on-hand/in-transit once; hand fixture |
| Expansion setup costs are not historically persisted | Call result an estimated current-cost **book-value proxy**, founder free; no new historical ledger |
| Asset UI refactor spreads scope | Keep one small Dashboard card, reuse evidence idiom and i18n, no new management tab |

## PR review checkpoints, not extra PRs

1. **Current:** two docs reviewed; no runtime modifications.
2. **Domain:** book value, metrics, tiers and invariant tests land as commits on this branch.
3. **Integration:** claims/save/scenario isolation, cap/finance, Dashboard/locales.
4. **Calibration and readiness:** documented trace, browser tests and full verification; mark this same PR ready only when goals are demonstrably reachable.

The work is complete only when every acceptance gate in the design document holds; do not split design/domain/UI into separate tickets or PRs.
