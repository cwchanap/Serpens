# HPA-502 — Headless Balance Harness & Pacing Implementation Plan

> **Single-ticket/single-PR rule:** keep the design, baseline instrumentation, sign-off gate, tuning, scenario recalibration, tests and final reports together in HPA-502. The **current draft PR is planning-only**; implement on this same branch/PR after design review, not in a separate implementation PR.

**Goal:** Measure and improve economy pacing without adding mechanics, migrating saves or changing player UI beyond calibrated displayed forecasts.

**Design:** `docs/superpowers/specs/2026-10-20-balance-harness-design.md`

**Code baseline:** reviewed against Serpens `main` as of 2026-10-20 (post-HPA-295). Recheck `main` for changes when implementation starts.

**Tools:** Bun/TypeScript, existing pure `src/lib/game` simulation, Vitest (normal game tests), Playwright (affected E2E); isolated Bun tests for the long-running tool.

## Global guardrails

- No ticket split, no parallel PR, no new persistent fields, no new UI system, no generalized bot/action framework and no compatibility shims for pre-release saves.
- All bot work must call real engine transitions and `simulateDay`, with explicit seeds.
- Do not import the scenario runtime into the sandbox harness: `ScenarioRun` includes scoring/capability plumbing and a generated UUID.
- `src/lib/game` stays production code; `scripts/balance` owns test-only orchestration/report generation. A fix to the planner/forecast belongs in the production module rather than a bot workaround.
- Do not run full 50-seed sweeps in normal unit tests or Codecov. `scripts/balance/**` is already outside their `src/**` discovery/coverage inclusion. Add only a package script, unless verification proves extra configuration necessary.
- Deterministic files have no runtime, machine, timestamp, absolute path, random run ID or locale-derived field.
- Stop **between Task 3 and Task 4** for baseline and target sign-off in this same draft PR. Do not retune to unapproved thresholds.
- Any changed visible forecast copy must remain consistent across EN, JA and zh-Hant.

## Task 1 — Stand up the narrow deterministic runner

**Files:** `scripts/balance/run.ts`, `scripts/balance/simulator.ts`, `scripts/balance/runner.test.ts`, `package.json`.

1. Expose a CLI: `bun run balance --mode quick` and `bun run balance --mode full`, with `--output` and debug seed/bot/day overrides. Use Bun's built-in argument/file APIs rather than adding command-parser or reporting dependencies.
2. Define explicit readonly config and a compact `RunResult` containing the seed, archetype, bot id, checkpoint snapshots, opening projections, action attempts, aggregate metrics and stall incidents. Do not store entire GameState snapshots.
3. Build each start state with `createNewGame(archetype, seed)` only to generate the candidate city; choose the best legal founding tile via `createRetailPlacementPreview` (or the same existing placement check) and `forecastOpening`. Tie-break by tile id. Call `createFoundingGameAtTile({ city, tileId, archetypeId, seed })` and verify the placed store matches the chosen tile.
4. Add a local `BalanceAction` union limited to actual bot verbs. Call existing `updateStoreProduct`, `hireCandidate`, `assignStaffToStore`, `openStoreAtTile`, `buildIndustrialBuilding`, `upgradeBuilding`, `buildRail`, and `simulateDay`. Use `buildRailPreview` for route preflight, never generate rails directly.
5. Normalize successful versus rejected/unchanged transitions. An `openStoreAtTile` failed command can add a system decision; test with a blocked tile and verify that it does not increment `openedStoreCount`. Check semantic postconditions for builds and rail; an `unchanged` return is not progress. Preserve and record causes when available.
6. Run day by day, calling the active bot once before each tick and `simulateDay` once. No manual calling of replenishment, finance or event logic.

**Tests:** run twice with identical options and verify identical result data; different seeds select generated cities deterministically; a store-open failure is recorded as rejected; a no-op policy/product edit is not counted as an applied action; simulation reports advance by exactly one close per tick.

**Implementation note:** `createNewGame` currently accepts a default `Date.now()` seed, so requiring `seed` in the runner factory is essential. Exclude any `startScenario` UUID from this output.

## Task 2 — Add explicit, rule-based bot strategies

**Files:** `scripts/balance/bots.ts`, `scripts/balance/bots.test.ts`.

### 2A. Idle

Start and advance day, with zero mutating actions. Verify that the bot's action ledger is empty.

### 2B. Retail steady

- Read each store/product's recent `DailyProductReport`, weekly replenishment interval and existing `StoreProduct.targetStock` / `reorderThreshold`.
- Adjust targets to a documented conservative rolling-demand formula with min/max bounds based on available game fields. The formula is part of the bot, not a new production balancing mechanic. It must avoid oracle access to future RNG/demand.
- Read staffing shortages from game/report/staffing utilities; hire a compatible available candidate in stable order and assign only where a role deficit exists. No arbitrary candidate creation.
- For expansion, use `createRetailPlacementPreview`, `forecastOpening`, cash and `storeCap`. Choose the legal highest-forecast tile, stable by id, only if a simple payback/cash-reserve rule passes; record any abstention.
- No autopilot for events, buying loans, policy inheritance or finance tricks.

### 2C. Advisor follower

- Add the retail-steady actions, then once every seven days run `buildSupplyPlan` for the target store's selected bottled-water product and real supply city.
- Use `SupplyPlannerActionAvailability` describing the exact actions the bot implements. Do not falsely advertise inter-city routes or source switching if unimplemented.
- Handle `build-producer`, `build-warehouse` and `upgrade-building` by selecting legal `createIndustryPlacementPreview` tile ids and calling authoritative transitions. Avoid building if available cash/feasibility says no.
- Handle `connect-rail`: resolve candidate sinks from **installed buildings in the same city** that consume the recommended material or act as warehouse sinks. Sort by id. Call `buildRailPreview({ originBuildingId, destinationBuildingId, waypoints: [] })` for each; commit the first with no `blockReason` and nonzero `newCellKeys`. Do not construct imaginary paths or retry the same blocked pair every day.
- Save recommendation `actionKey`, attempt outcome and domain postcondition. Repeated weekly identical no-op recommendation => stall. A producer with 7 consecutive `status === 'stalled'` closing snapshots => stall. Any unhandled action is explicit `unsupported`, never considered satisfied.
- Running a few real scenarios is more useful than sophisticated bots; if the automatic rail destination is not well-defined, record a failed step so the planner can be fixed rather than writing a bespoke logistics search system.

**Tests:** each bot has deterministic stable choice order, only idle has no actions; weekly planner calls exactly on schedule; a successful action changes the intended domain field; already-connected rail and missing sink are failures with evidence, not loops masked by retry suppression.

## Task 3 — Reports, baseline measurement and gate A

**Files:** `scripts/balance/report.ts`, `scripts/balance/report.test.ts`, baseline `docs/balance/{baseline.json,baseline.md}`.

1. After each `simulateDay`, consume the new `DailyReport`. For milestone days, use `report.cashAfter`, `outstandingPrincipalAfter`, `game.stores` and levels. For profitability use **full** 7-day/30-day sums of `operatingIncome`, not `netIncome` or finance inflows. Show `operatingCashFlow` as a companion diagnostic.
2. Use product-level `demandMissed`, `unitsSold`, `endingStock`, `wasteUnits`, `wasteValue`. Define denominators as in the design. A missing denominator is `null`, not zero-percent success.
3. Keep a run-local store-opening ledger with `storeId`, `openingDay` and `forecastOpening` at the committed tile. Compare revenue from that specific store over its next 14 completed days. Incomplete windows stay null.
4. Include day 1 founding cash in minimum cash, plus all completed days. Record first cash-negative day and first strictly positive full 7/30 operating-income windows.
5. Build stable JSON using a documented schema version, fixed property order and ordered `(archetype, bot, seed)` run order. Derive Markdown from this JSON representation. Aggregate pass ratios by archetype and overall; show failures explicitly. Avoid volatile timing details in saved files.
6. Quick run: document and freeze seed sample (including 20260503), 120-day horizon and bot/archetype subset. Full run: document and freeze a 50-seed set, all 4 archetypes, all 3 bots, 365 days. CLI `--output` permits local scratch runs without modifying committed baselines.
7. Run on unmodified gameplay main logic and commit `baseline.json` + `baseline.md` with config and reproduction commands. Reproduce/deny the ticket's reported negative cash, ~10× forecast and connect-rail stall instead of assuming their old figures still hold. Record run time **outside** deterministic artifacts for performance sanity.

**Gate A — required user review:** Summarize the baseline per bot/archetype, identify proposed changes and their likely knock-on effects, and request agreement on the thresholds in the same draft PR. Pay special attention to whether the ±25% target applies per opening versus aggregate coverage and whether the retail-steady strategy is actually feasible under current hiring/stock rules. **Do not tune before this gate is approved.**

**Tests:** byte-identical JSON and Markdown when rerun with the same config; stable grouping/sorting; 6 vs 7 and 29 vs 30 reports cannot prematurely pass window targets; null zero denominator; founding vs expansion store forecast attribution; per-seed output has no timestamps/UUIDs.

## Task 4 — Evidence-driven economy and forecast tuning (after Gate A)

**Production files are conditional on baseline findings:**

- `src/lib/game/stock.ts`, `retailSupply.ts`: initial/reorder/target stock and seven-day cadence, only where measured stockouts explain losses.
- `src/lib/game/placement.ts`: fix opening revenue projection to reflect real attainable demand/capacity without embedding `simulateDay`.
- `src/lib/game/simulateDay.ts`, `archetypes.ts`, `staffing.ts`: only tested changes to recurring rent, marketing, staffing or margin costs.
- `src/lib/game/industryProduction.ts` / `leveling.ts`: capacity/buffer change only if producer stall evidence warrants it.
- `src/lib/i18n/messages/{en,ja,zh-Hant}.ts`: only if semantics/copy of a displayed projection changes.
- Corresponding focused `*.spec.ts` under `src/lib/game/` / `src/lib/i18n/`.

Make small, logically grouped commits **on the same branch**: stock/pacing, truthful forecast/rent, and producer level buffers only if necessary. For each, run quick balance and affected unit tests; note improvement or regression in the tuning changelog. Avoid blanket multiplier inflation that makes idle strategy optimal.

**Forecast/rent decision:** Today `projectedDailyRent = tile.rent` and actual per-store operating cost uses archetype `baseRent`, so the forecast is misleading. Do not blindly add raw tile rent as a new daily cost. Compare the value ranges and choose a normalized actual rent charge or a corrected projection label/value, with evidence. Preserve the opening function's public shape unless evidence forces a documented change.

## Task 5 — Fix the Supply Planner's satisfied-rail loop

**Files:** `src/lib/game/supplyPlannerActions.ts`, its existing focused `*.spec.ts`, and possibly a small existing rail helper if reuse requires it.

1. Construct the exact reported graph: pump → bottler, pump → warehouse. Ensure those rail paths actually exist and `buildRailPreview` reports a completed path as already satisfied.
2. Call `buildSupplyPlan` with matching bottled-water request and relevant `SupplyPlannerActionAvailability`. Confirm that `connect-rail` is erroneously repeated, or document where the current code already prevents it.
3. Fix `rail-disconnected` candidate selection by checking the actual graph/usable sink relationship before issuing an action. Do not change `buildRail` semantics to accept a no-op and do not silence repeated recommendation only in the bot.
4. Assert the next recommendation is either an actually buildable other missing rail action or a truthfully non-actionable `none` result. Preserve existing valid disconnected-case behavior.

**Tests:** connected two-leg chain never yields an already-connected action; disconnected case still requests a viable connection; same input gives stable recommendation; existing planner tests pass.

## Task 6 — Recalibrate the three built-in challenges

**Files:** `src/lib/scenarios/catalog.ts`, `src/lib/scenarios/runtime.spec.ts`, related catalog/setup/scoring tests and any scenario i18n changed by actual values.

1. Re-run existing calibration fixture `replayLaunchCalibration` on the three official seeds after economy tuning. Record final days, scores, outcomes and medals. Preserve the real scenario runtime.
2. Update scenario start conditions, objectives and/or scoring thresholds only as justified by the tuned model. Check the task's non-negotiable rule **no-action cannot achieve Silver**, including First Profit which currently grants **Gold to no-action on day 4**.
3. Update/extend the documented real command reference traces. First Profit, Import Squeeze and Local Lifeline must complete and earn Gold; Import Squeeze currently gets only Silver. Never change a test to assert a weaker medal as a shortcut.
4. Maintain `version: 1` for all three as the pre-release policy; do not create migration code for old runs. Document the changed official-seed scoring/calibration contract in the PR.
5. Run scenario catalog validation, setup, runtime and solvability suites. Update English, Japanese and Traditional Chinese copy only where changed scenario facts make it inaccurate.

**Tests:** parameterized no-action and official reference cases for all three; explicit Gold and below-Silver assertions; real command validation and reproducibility; unchanged schema contract.

## Task 7 — Final full sweep and PR verification

**Files:** `docs/balance/{after.json,after.md,tuning-changelog.md}`, any needed test fixes.

1. Run the *same* matrix, seed list and metrics as Task 3 with the tuned code. Emit after artifacts and a concise per-change explanation and before/after comparison.
2. Check Gate A agreed targets per archetype, including cash survival, profit windows, forecast, and advisor chain/no-stall. Show individual exceptions rather than just a single passing mean.
3. Byte-compare two full reruns to verify identical JSON and Markdown. Verify no wall-clock/UUID/path fields and that artifacts do not include full raw game states.
4. Run `bun run check`, `bun run lint`, `bun run test:unit -- --run`, `bun run balance --mode quick`, the dedicated harness test command, focused `retail-sim.e2e.ts`, relevant scenario E2E flows, then the full E2E suite if feasible. Record actual command results, not assumed passes.
5. Review diff scope and remove speculative helpers/config adjustments. Only then mark the **same** HPA-502 PR ready for code review.

## Suggested commit checkpoints inside this PR

1. `docs(HPA-502): design and implementation plan` **(this draft PR now)**
2. `test(HPA-502): add deterministic balance runner and baseline report` **(Gate A review)**
3. `fix(HPA-502): tune measured retail economics and opening forecast`
4. `fix(HPA-502): avoid satisfied supply rail recommendations`
5. `test(HPA-502): recalibrate challenge scenario reference traces`
6. `docs(HPA-502): publish after report and tuning rationale`

Commit grouping can be combined if doing so reduces review overhead. There must be **one branch and one PR** throughout.

## Acceptance checklist

- [ ] No additional persisted fields, new mechanics, new panels or UI scaffolding.
- [ ] Explicit-seed reproducibility and identical report bytes proven.
- [ ] Headless bots use authoritative production transitions and report no-ops.
- [ ] Baseline JSON/Markdown measured before gameplay tuning.
- [ ] Gate A targets explicitly reviewed before tuning.
- [ ] Full after report meets agreed pacing/forecast/chain targets or records and resolves approved exceptions.
- [ ] Supply Planner no longer repeats already-satisfied rail advice; focused regression proves it.
- [ ] No-action below Silver and documented reference Gold for **all three** launch challenges.
- [ ] No scenario version bump and no save compatibility paths.
- [ ] Check, lint, relevant unit, harness, and E2E checks pass; reports and change log committed.

## Deferred to subsequent roadmap work

HPA-511 owns additional debt/freshness/rival/logistics challenge content. HPA-318 owns company value and long-game ladder. Do not let either leak into this balancing PR.
