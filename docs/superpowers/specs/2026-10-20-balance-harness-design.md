# HPA-502 — Headless Balance Harness & Sandbox Pacing Design

**Linear:** https://linear.app/cwchanap/issue/HPA-502/balance-measure-and-tune-sandbox-pacing-with-a-headless-balance  
**Parent:** HPA-534  
**Status:** proposed design; this PR contains planning documents only  
**Code baseline:** Serpens `main` reviewed on 2026-10-20 (including HPA-295; latest inspected commit `e4f2bf7`)

## Outcome and delivery boundary

Make long-term Serpens economy behavior reproducible, fix pacing problems supported by measured evidence, and re-calibrate the existing challenge scenarios **in the same HPA-502 implementation PR**. The implementation will have a human readiness gate after the measured baseline and before tuning, but **not** a second issue or PR.

Player-visible consequences are corrected numbers and reliable advisor recommendations, not new UI or mechanics. Preserve deterministic state transitions, the existing save model and scenario runtime, and the three-language forecast presentation.

## Verified current-code facts

- `createNewGame(archetypeId, seed)` in `src/lib/game/state.ts` constructs deterministic retail and industry cities, staffing, finance and competitors. Its optional default is `Date.now()`; the harness must **always pass a seed**. `createFoundingGameAtTile({ archetypeId, city, tileId, seed })` in `placement.ts` builds the founding state from a legal tile.
- `forecastOpening(tile, archetypeId)` is a separate heuristic, currently `(baseTraffic * 7 + demand * 10 + footTraffic * 6) * fit / 100`. It reports `tile.rent` as projected daily rent, while `simulateDay.ts` currently computes per-store operating cost from archetype `baseRent * 0.92` plus marketing cost; tile rent influences setup cost.
- `simulateDay(game)` applies existing replenishment, production, transfer, finance, market and event systems; advances the day and appends a `DailyReport` to `game.reports`. Retail replenishment is every seven closing days (`REPLENISHMENT_INTERVAL_DAYS = 7`).
- `DailyReport` already supplies `operatingIncome`, `operatingCashFlow`, `netCashChange`, `cashAfter`, `outstandingPrincipalAfter`, `storeReports`, and `productionReport`. Product reports supply `unitsSold`, `demandMissed`, `endingStock`, `wasteUnits` and `wasteValue`. No new persistence fields are needed.
- `summarizeReports` in `reports.ts` produces seven- and thirty-day windows, but accepts partial windows. The harness must demand a **full** window before declaring a positive-window milestone.
- The scenario dispatcher in `src/lib/scenarios/runtime.ts` is private, applies scenario capability rules, and wraps outcomes in `ScenarioRun`. `startScenario` also creates a random run UUID. Reusing that runtime as the sandbox harness would add unrelated ceremony and non-reportable randomness.
- `buildSupplyPlan(game, request, availability)` in `supplyPlannerActions.ts` returns a ready plan or an unavailable result. Its `connect-rail` action carries `buildingId` and `materialId`, **not** a destination or a route. `buildRailPreview` and `buildRail` in `railPlacement.ts` are the command authority. They reject a fully existing connection.
- Current scenario calibration tests in `src/lib/scenarios/runtime.spec.ts` pin no-action First Profit **Gold on day 4**, Import Squeeze Bronze on day 18, and Local Lifeline failure on day 21. The current Import Squeeze reference trace reaches **Silver**, not Gold. The requested no-action-below-Silver and reference-Gold target therefore requires **all affected launch calibration assertions and possibly definitions**, not just Import Squeeze.
- The normal Vitest projects collect `src/**/*.{spec,test}.{ts,js}` and apply a 10 s test timeout. Codecov enforces 90% for new source. A long sweep cannot live under `src/..spec.ts`.

The Linear issue's initial observations were from a **throwaway probe** at `200bc7b`. They are hypotheses to reproduce, **not accepted baseline numbers**.

## Minimal architecture

Use a self-contained tool under `scripts/balance/` with `bun run balance` for the CLI and **mandatory** `bun run balance:test` (`bun test scripts/balance/`) for the scoped deterministic regression suite. Keep it outside `src/`, regular Vitest discovery and Codecov coverage automatically; do not edit `vite.config.ts` or `codecov.yml` solely to exclude it. Wire `bun run balance:test` into `.github/workflows/ci.yml`'s existing `unit-tests` job; the full sweep remains local-only. CI currently skips draft PRs, so the tests will execute there once the PR is ready (and can be run locally during planning).

Type-check the harness explicitly: add a small `tsconfig.balance.json` extending the root `tsconfig.json`, with `include: ["scripts/balance/**/*.ts"]`, and a `balance:check` script running `tsc --noEmit -p tsconfig.balance.json`. Run `bun run balance:check` in the existing CI `unit-tests` job alongside `balance:test`. The root `tsconfig.json` extends SvelteKit's generated config, whose `include` covers app files; **do not** replace the root `include` with only `scripts/**/*.ts`, which could silently drop SvelteKit files. One dedicated TS project is the smallest safe type-check boundary; it does not add an engine module or runtime layer.

Proposed small files, merged if easier to maintain:

- `scripts/balance/run.ts` — CLI argument parsing, seed/archetype/bot matrix, deterministic output to requested directory.
- `scripts/balance/simulator.ts` — founding helper, day loop, action execution, event/metric recorder.
- `scripts/balance/bots.ts` — three explicit rule lists; no class hierarchy, search algorithm, agent framework or strategy DSL.
- `scripts/balance/report.ts` — metric projection, stable JSON serialization, compact Markdown aggregation.
- `scripts/balance/*.test.ts` — targeted reproducibility, command/no-op and metric tests.
- `tsconfig.balance.json`, `package.json`, and `.github/workflows/ci.yml` — minimal build/test wiring; two package commands and two CI unit-job steps, without touching application Vitest/coverage configuration.

Do **not** move generic engine transitions out of `src/lib/game`, export the scenario-specific dispatcher, add engine hooks, extend `GameState`, store harness metadata in save files or create a second simulation model.

### Setup and action dispatch

1. For every `(seed, archetype, bot)`, call `createNewGame(archetype, seed)` to obtain the generated city, select the legal founding tile with the highest `forecastOpening(...).projectedDailyRevenue` (tie-break by tile id), and call `createFoundingGameAtTile` with the **same seed and generated city**. Record the forecast before the opening. A seed sweep intentionally uses different generated worlds; the normal sandbox UI still uses its fixed default seed.
2. Use one small `executeBalanceAction(game, action)` adapter for exactly the actions the bots need: update stock targets, hire and assign staff, open a store, build/upgrade industry, connect rail, and advance day. Each case delegates to the authoritative `src/lib/game` transition.
3. Normalize into `{ game, outcome: 'applied' | 'unchanged' | 'rejected', reason? }`. A decision appended by a failed `openStoreAtTile` is **rejected**, not a successful opening; a returned unchanged game or `{ok:false}` is not successful either. Record attempted action kind/key, opening/rail postconditions and any rejection as run-local evidence. Do not silently count a no-op as progress. Reuse `deeplyEqual` only where appropriate for value-equivalent transitions.
4. Keep bot choice deterministic: stable sort by ids, explicit tie breaks, no unseeded RNG, wall clock, UUID, process timings, localized text or nondeterministic map iteration in emitted reports. Bots may advance the engine RNG legitimately when they perform different real actions; compare across seeds, not by pretending different strategies consume identical RNG streams.

### Three explicit bots

- **Idle:** legal founding store, then `simulateDay` only. This is a negative-control calibration, not the target profitable strategy.
- **Retail steady:** maintain sensible `targetStock` and `reorderThreshold` from real demand/weekly replenishment, hire/assign only to satisfy actual role shortages, and open another store only when the legal placement preview, the forecast, cash and store cap permit it. No hidden cash injection, finance shortcut or forced outcomes. Use stable candidate and tile ordering.
- **Advisor follower:** start with retail-steady basics; on one fixed day each week call `buildSupplyPlan` for an explicitly selected bottled-water product/category with availability matching the bot's supported operations. Apply producer/warehouse/upgrade/rail actions through the real transitions, picking legal industry tiles using `createIndustryPlacementPreview`. For rail, enumerate installed downstream consumer/warehouse candidates deterministically, use `buildRailPreview` with those actual endpoints and `waypoints: []`, then commit only a viable novel path. Unsupported inter-city route actions remain reported as unsupported; do not secretly perform them or add logistics-bot scope to this ticket.

If no rail destination can be identified, report the blocked step instead of fabricating a connection. A repeat of the same recommendation that cannot change the intended domain outcome is a stall. Fix the **planner's** false recommendation separately; do not hide it with a bot-level ignore list.

### Measurements and denominator rules

Collect incremental, run-local observations while processing real daily reports; avoid serializing the full evolving `GameState` or all 365 daily reports into the committed baseline.

| Metric | Contract |
| --- | --- |
| Positive 7/30-day window | First completed day with **7/30 actual reports** and **positive summed `operatingIncome`**; also display operating cash flow and net cash change for diagnosis, but do not conflate loan proceeds with profit |
| Negative cash / minimum cash | First day `cashAfter < 0`, plus minimum observed cash (include founding cash); never treat opening principal as operating profit |
| Checkpoints | Cash, outstanding debt, store count and store levels at days 30/60/90/180/365 when the run reaches them |
| Missed demand | `sum(demandMissed) / sum(unitsSold + demandMissed)` across recorded product-days; mark denominator-zero as `null` |
| Stockout share | Product-days with `endingStock === 0` divided by all active product-days; separate from missed demand and from stock-health percentage |
| Waste | Sum `wasteUnits` and `wasteValue` from product reports; avoid counting `inventoryLossExpense` twice |
| Forecast error | For each new store, snapshot forecast on its actual opening tile/archetype and compare to the **first 14 completed operating days** of that store's revenue. Return null/incomplete instead of using a shorter period |
| Advisor stall | Same actionable `actionKey` recommended on subsequent weekly checks after an unchanged/rejected attempt, with a recorded reason; also flag buildings whose authoritative `status` stays `stalled` for 7 consecutive completed days |
| Summary | By bot and archetype: number of seeds passing each target, median and meaningful low/high values; stable machine-readable failures and a short Markdown narrative |

Use reports rather than intermediate product stock snapshots for post-day evidence. Track store opening days in a **runner-local ledger**. Record attempted actions separately from daily report figures.

### Modes, reproducibility and output

- `bun run balance --mode quick [--output <dir>]`: fixed 3 seeds including 20260503, representative archetypes and all 3 bots over 120 days; intended for local regression, **not** mandatory CI (the focused scoped `balance:test` suite runs in CI).
- `bun run balance --mode full [--output <dir>]`: fixed documented 50-seed set × all 4 archetypes × all 3 bots over 365 days. No CI requirement for a full sweep.
- Support an explicit `--seeds`, `--days` and `--bots` override for debugging; reject invalid inputs, never substitute `Date.now()`.
- Stable, version-tagged, sorted JSON with input parameters, per-run metrics, action outcomes and aggregate summaries; corresponding Markdown renders those same values. No timestamps, file paths, benchmark durations, random IDs, locale-dependent number formatting or volatile commit SHA in deterministic files.
- `docs/balance/baseline.json`, `baseline.md`, `after.json` and `after.md` are committed artifacts from the same fixed full matrix; add a concise `tuning-changelog.md`. Keep per-day traces opt-in/debug-only to avoid enormous diffs.
- Two runs with the same config and same source revision must produce byte-identical JSON and Markdown, verified with a file-byte/hash comparison test.

### Readiness gate and target policy

**Gate A: measurements before tuning.** Commit baseline artifacts, reproduction commands, runtime cost observations and proposed target thresholds to the **same branch and draft PR**. Request explicit sign-off in its discussion before changing economic constants. This does not split HPA-502 into separate PRs.

**Proposed thresholds, subject to Gate A:** retail steady has a positive full 30-day operating-income window by day 30 on seed 20260503 and on at least 80% of sweep seeds, with nonnegative cash for its first 90 days; first-14-day opening forecasts are within ±25% of actual average revenue **per completed opening**, with a reported percentage of openings in range and breakdowns by archetype and district (agree the required coverage percentage at Gate A); advisor follower completes a real bottled-water local chain without stalls. Use **idle as a comparative negative control**: measure its 45/90-day cash, profit windows and viability against retail steady, and decide at Gate A what meaningful disadvantage idle should exhibit. The initial probe shows idle cash negativity around day 60–120, so mere survival through day 45 is too weak; do not impose an arbitrary bankruptcy-by-day-30 condition just to make idle worse. Capture per-archetype breakdowns and sample counts to avoid hiding failures in an aggregate.

Do not silently loosen targets to fit the baseline. If data proves a threshold inappropriate, document the tradeoff and obtain sign-off **before** tuning.

### Tuning boundaries, prioritized by evidence

1. **Fix truthful opening forecasts.** Prefer a light, explainable correction tied to the demand/stock/capacity the real engine can serve, not a second daily simulator embedded in `forecastOpening`. Resolve the `projectedDailyRent` discrepancy **by default with a truthful projected value/label** using existing archetype recurring costs; only consider a new district-rent-driven daily charge if Gate A evidence and a separate gameplay rationale justify changing every store's and scenario's recurring economy. Check labels across EN, JA and zh-Hant when user-facing meaning changes.
2. **Make intentional retail operation viable.** Tune existing stock defaults, replenishment cadence, pricing/economic multipliers, payroll and operating costs as needed. Do not make idle play optimal.
3. **Fix already-satisfied rail recommendation.** At the `rail-disconnected` planner branch, verify the actual rail connectivity/usable sink before recommending `connect-rail`; use existing graph/path helpers and never recommend a connection that `buildRailPreview` reports as already connected. A focused regression recreates pump → bottler and pump → warehouse.
4. **Scale actual production buffers if measured stalls justify it**, consistently with existing level throughput.
5. Keep changes to existing gameplay formulas and constants; no new mechanics or save fields.

### Scenario regression and pre-release policy

After tuning, rerun the three existing scenarios with their **official seeds** and real command traces. Preserve the existing command/evaluation pipeline. Recalibrate thresholds, start setup, medal score boundaries or reference actions as the evidence requires, so **every no-action run earns below Silver** and each documented reference trace earns **Gold** (including Import Squeeze). These are acceptance criteria, **not** invitations to weaken/remove the tests. Keep scenario version **1** and replace obsolete expected score/day values in tests: pre-release scores are not backward-compatible contracts.

Only change scenario text when values or outcome messaging become inaccurate; update EN/JA/zh-Hant together. Do not introduce new scenarios, new goals, or migrate persisted runs.

## Verification

- Harness unit checks (mandatory `bun run balance:test` in CI, scoped to `scripts/balance/`): same seed/bot/config => byte-identical output; distinct seeds produce distinct generated worlds; full-window positivity waits until 7/30 observations; denominator-zero/null; store first-14-day attribution; invalid commands/decision append/railAlreadyConnected count as failed progress; fixed advisor weekly cadence. Mandatory `bun run balance:check` verifies harness TypeScript independently from `bun run check`.
- Game unit checks: planner stops recommending already-connected rail; forecast matches actual calibrated range; stocking/finances/production unchanged outside intended tuning.
- Scenarios: all no-action below Silver, all documented reference runs Gold with real transitions; full runtime and catalog validation.
- Run before PR ready: `bun run check`, `bun run balance:check`, `bun run lint`, `bun run test:unit -- --run`, `bun run balance:test`, local quick/full sweeps with deterministic report verification, `retail-sim.e2e.ts` and scenario flow E2E tests.
- Acceptance files show baseline versus after on the same config, with target status and precise exceptions.

## Explicit exclusions

No bankruptcy or closing mechanics, UI panel, save schema change, telemetry, headless browser, alternate game engine, AI/search bots, new audio/art, backend, compatibility migrations, or scenario pack/progression work belonging to HPA-511/HPA-318.
