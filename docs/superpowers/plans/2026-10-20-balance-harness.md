# HPA-502 — Balance Harness & Pacing Implementation Plan

> **One Linear ticket / one PR (#65).** The PR remains draft for design, measured baseline and Gate A approval, then implementation and verification on **the same branch**. This is a plan, not a claim that any tests or simulation sweeps have run.

**Design:** `docs/superpowers/specs/2026-10-20-balance-harness-design.md`  
**Base:** Serpens `main` at `27fc3fa`; recheck when executing.  
**Technology:** existing TypeScript game engine, Bun CLI, **existing server Vitest**, SvelteKit type checking and existing CI.  
**Principles:** YAGNI/KISS; avoid new engine hooks, new state fields, additional test runtimes, extra CI steps or new features.

## Decisions from the latest review

- **Use `tests/balance/`**, not `scripts/balance/`; add its spec glob to the existing server Vitest project. SvelteKit's generated tsconfig is reported to include `tests/**/*.ts`; **verify locally with `bun run prepare && bun run check`** before relying on it. Do not add a second `tsconfig.balance.json` / `balance:check` or `bun test` / `balance:test` by default. The existing test:coverage CI step then runs the harness specs.
- **Use real player operation**: set `protect-availability` manager delegation, hire/assign and expand. No bot-only rolling-stock formula. Repair the manager's unlimited 10% growth in production **after the baseline gate**, not before.
- **Reuse command dispatch**, with one definition-free `applyGameCommand` extraction inside `src/lib/scenarios/runtime.ts`; leave `startScenario`, UUIDs, capability gate and medal logic out of the harness. No `BalanceAction` clone.
- **Repair rail diagnosis first** in `supplyPlanner.ts`, expose a concrete pairwise destination in `connect-rail` and reuse the real preview. Do not mistake a globally usable producer for being connected to all required sinks.
- **Forecast follows actual city-wide market + stock model**, rather than a retuned tile-only heuristic; game-aware signatures are allowed. Preserve the nullable pre-founding placement preview.
- **Pin the founding tile independently of forecasts** so a tuning pass doesn't change the test's starting state.
- **Only convenience runs the bottled-water advisor**. Use one default full matrix plus CLI overrides, not quick/full modes.
- **Commit Markdown balance reports only**; generate JSON on demand. Keep byte-identical serialization tests without an extra file-hashing workflow.
- **Interleave scenario calibration with economy changes**: update obsolete exact pins as the tuned economy changes, while enforcing real outcome/medal behavior.

## Stage 0 — Rail connectivity bug first (TDD; no economics tuning)

**Production:** `src/lib/game/supplyPlanner.ts`, `supplyPlannerActions.ts`, existing planner tests, and any action/UI model consumers that require the new destination.

1. Reproduce the reported pump → bottler and pump → warehouse false `connect-rail` loop on the current source. Assert `buildRailPreview` says the recommended producer/destination pair is already connected.
2. Inspect `primaryBottleneck`'s disconnected, reachability-gap and `findConnectivityDeficit` branches. A usable producer may have residual capacity **but lack an edge to a specific consumer**; preserve that valid case. Select a real missing producer→sink edge using existing reachability evidence rather than global disconnected/usable membership alone.
3. Add `destinationBuildingId` to the `rail-disconnected` bottleneck and `connect-rail` action; propagate through `actionKey` and narrow planner UI formatting/actions (no new UI component). Retain determinism through id tie-breakers.
4. Assert a recommended edge is unsatisfied and actionable with the existing rail preflight. When no missing viable edge exists, classify the true shortage instead of repeating an already-connected recommendation.
5. Pass targeted rail/planner tests before continuing.

**Important:** This is a correctness prerequisite for a measurable advisor follower, **not** a balance-constant adjustment. The baseline report must record that the rail loop had already been repaired, so baseline/after comparisons use the same repaired logic.

## Stage 1 — Reuse scenario commands and fix false success classification

**Production:** `src/lib/scenarios/runtime.ts` and existing scenario command tests. **Harness:** `tests/balance/run.ts`.

1. Extract existing transition dispatch + normalization as definition-free `applyGameCommand(game, command: ScenarioCommand, rules?)`, returning a simple success/changed/game or rejected outcome without creating `ScenarioRun`. Keep the public `executeScenarioCommand`'s permission/evaluation/results unchanged except the fix below.
2. Detect an unsuccessful `openStore` by comparing expected new store count, new tile and archetype; a system decision append is **not** a successful opening. Keep the failure reason if available. Add scenario regression for blocked placement and harmless semantic no-ops.
3. Call this helper from both the existing scenario evaluator and balance harness. Do **not** introduce a second action enum/dispatcher or add delegation-only scenario commands.
4. Add only `"balance": "bun tests/balance/run.ts"` to `package.json`. CLI flags: `--seeds`, `--days`, `--bots` and `--output`; invalid flag/seed errors are explicit. Every seed is provided; never rely on the game default `Date.now()`.

**Tests:** scenarios remain deterministic, valid commands unchanged, command rejection cannot masquerade as progress. Avoid changing scenario scoring here.

## Stage 2 — Bots and repeatable founding setup

**Files:** `tests/balance/bots.ts`, `tests/balance/*.spec.ts`; use existing `managerDelegation.ts`, staffing and placement transitions.

1. Generate the city with explicit `createNewGame(archetype, seed)`; select a legal founding tile with the **highest `tile.demand + tile.footTraffic`**, tie-break by id (not by `forecastOpening`). Call `createFoundingGameAtTile` with the generated city and the same seed.
2. **Idle:** no actions; just advance days.
3. **Retail steady:** once a qualifying manager exists, use the actual `setManagerDelegation` for `protect-availability` with a store/city scope and enabled inventory authority. Exercise the current player playbook on each day; bot logic is limited to staff hiring/assignment and legal cash-safe store expansion. Record refusal/no-op outcomes; no custom target-stock algorithm or hidden cash injections.
4. **Advisor follower:** only for convenience, layer one weekly `buildSupplyPlan` for bottled water over retail-steady. Handle producer builds/upgrades, warehouse builds and revised `connect-rail {buildingId,destinationBuildingId,...}` using existing placement/rail previews and `applyGameCommand`. No bespoke sink enumeration/pathfinder. Unsupported route/source-change actions are evidence, not silent successes.
5. Keep action order, candidate order and tie-breaks stable. Record bot action outcomes and opening forecasts in a small runner-local ledger.

**Tests:** one seed/bot is reproducible; founding site invariant before/after forecast changes; the manager is a real eligible staff member; unexpected suggestions produce recorded failures; weekly advisor cadence; advisor is not evaluated for the other three archetypes.

## Stage 3 — One measurement pass, existing Vitest, baseline Gate A

**Files:** `tests/balance/measure.ts`, `tests/balance/*.spec.ts`, `vite.config.ts`, `docs/balance/baseline.md`.

1. Add `'tests/**/*.spec.ts'` to the **server project's** `include` in `vite.config.ts` only. Leave the browser project, Codecov `src/**` coverage, and `.github/workflows/ci.yml` alone; normal `bun run test:coverage` discovers these tests. Verify generated SvelteKit typechecking includes `tests/**/*.ts` after `bun run prepare`; if it doesn't, document and fix the narrow config issue, not a second toolchain.
2. Run real transitions and the whole daily sim; use `game.reports` *afterward* in a pure `measureRun(game, openingLedger)`. Keep an opening ledger and action results only; no per-day mirror recorder. Compute:
   - first **full** positive 7-/30-day operating-income window; operating cash flow shown separately;
   - first negative cash day, minimum cash including founding cash, day 30/60/90/180/365 cash/debt/store counts/levels;
   - missed-demand share, zero-stock product-day share, waste units and value, with null denominators where appropriate;
   - forecast versus first **14 complete days** of revenue **for each opened store**, by district and archetype, not median-only;
   - repeated weekly recommendation after rejected/no-op attempt, and producer stalled seven consecutive days.
3. The default sweep is **50 explicit seeds × 365 days**, four archetypes × idle/retail steady plus convenience × advisor. Override via CLI for focused local runs. Default deterministic seeds and ordering are recorded in baseline Markdown.
4. CLI emits **JSON and Markdown** to the chosen `--output` path, ordered by seed/archetype/bot, with no timestamp, UUID, runtime metric or machine path. Commit **only `docs/balance/baseline.md`**, recording the seed list, bot definitions, command to regenerate JSON and all measured exceptions. Store verbose JSON locally, not in git.
5. Test the pure aggregation with fake daily reports: 6/29 days never satisfy a 7/30 full window, zero denominator is null, store-specific forecast attribution requires all 14 days, and report output serialized twice from the same seed/config is **byte-identical** using ordinary Vitest `expect`. No file hash/second test framework.
6. **Gate A (human approval in this same PR):** present baseline and proposed specific targets; do not start economic tuning until approved. Retail steady seeks a positive full 30-day operating-income window by day 30, 90-day cash survival, per-opening forecasts within ±25% at an **agreed coverage threshold**, and an advisor that builds a local chain without no-op stalls. Idle is a meaningful **comparative** negative control, not an imposed bankruptcy deadline. Disclose that rail correctness was fixed before the baseline.

**Verification:** `bun run check`, `bun run lint`, `bun run test:unit -- --run`, `bun run test:coverage` and default local sweep. Existing CI only runs for non-draft PRs, so run checks locally while still draft.

## Stage 4 — Tune the real economy after Gate A, with scenarios interleaved

**Production candidates (only as supported by data):** `src/lib/game/managerDelegation.ts`, `placement.ts`, `simulateDay.ts` (shared cost helper), `stock.ts`, `retailSupply.ts`, `leveling.ts` / production buffer, and focused tests. **Scenario:** `src/lib/scenarios/catalog.ts`, `runtime.spec.ts`, relevant i18n.

1. **Cap the existing playbook:** tie `protect-availability`'s target/reorder cap to observed demand over the seven-day replenishment interval (with a small buffer), stop indefinite daily compounding, keep `reorderThreshold <= targetStock` and handle zero observations without abrupt destructive resets. Add boundedness and 90-day pressure tests. Do not paper over the bug with a bot stock formula.
2. **Replace the opening heuristic structurally:** use the *real* city-wide demand, player market share, per-store seller score and pricing/policy multipliers, unlocked products, target stock / interval, and capacity; expose only the narrow pure helper(s) needed. Do not sum whole-company demand and attribute it to one candidate. Keep the projection deterministic and cheap for a full-map menu. Handle nullable `game` in pre-founding previews explicitly rather than assuming one is available.
3. Replace setup-cost-only `forecastOpening` call sites (route, preview, finance, tests) with `getExpansionSetupCost`. Update the revenue-dependent placement preview and source tests; adapt the actual forecast API. Fix `projectedDailyRent` by sharing the relevant existing base operating-cost/rent calculation with `simulateDay`; **do not introduce a new district-based recurring rent charge** just to correct the display.
4. Other costs/replenishment/producer-buffer constants change only if the newly measured evidence demonstrates a gap. No new inventory mechanic, bankruptcy system or save field.
5. **After every balancing commit**, replay all three official-seed scenario traces through `replayLaunchCalibration`. Replace obsolete exact day/score pins where necessary, but enforce behavioral requirements: no-action cannot reach Silver, and a documented real-action reference trace earns Gold. First Profit currently gives no-action Gold, and Import Squeeze reference currently earns Silver; update authoring/scoring with evidence, never weaken the intent of the checks.
6. Keep scenario `version: 1`, no migration. Update EN/JA/zh-Hant copy only if visible meaning changes. Run scenario unit/regression tests alongside each tuning commit to avoid a permanently failing main suite.

## Stage 5 — Final comparison and review

**Docs:** `docs/balance/after.md` and `tuning-changelog.md`. Keep the baseline data under the same measurement definitions, pinned founding tile rule, seeds and bot behavior. If economic changes modify the bot's real playbook, disclose that as part of the changed production behavior (do not quietly swap bot logic).

1. Run the identical 50-seed matrix after tuning, and compare all agreed targets per archetype/district and advisor no-op traces. Generate local JSON again and commit only `after.md` plus a small change log with rationale and notable exceptions.
2. Run duplicate complete local sweeps and compare serialized JSON/Markdown bytes; do not commit giant data artifacts. Verify the normal server Vitest tests run in CI and are type-checked by SvelteKit.
3. Run `bun run check`, `bun run lint`, `bun run test:coverage`, affected `retail-sim.e2e.ts` and scenario E2E tests, then the full E2E suite as feasible. Record results rather than claiming unrun checks pass.
4. Re-review for redundant helpers and speculative compatibility work; keep **this same PR #65**. Mark ready for review only once the acceptance evidence is present.

## Acceptance checklist

- [ ] Rail recommendation points to a real missing producer–destination connection; cannot repeat a satisfied pair.
- [ ] No forked command dispatcher; scenario and harness share normalized semantic command results.
- [ ] Retail-steady uses actual manager delegation; playbook targets are capped after Gate A in production.
- [ ] Founding tile selection independent of the forecast being tuned.
- [ ] Forecast reuses relevant actual demand/stock logic, preserves no-game previews and shows truthful rent.
- [ ] All four archetypes have idle/retail results; convenience alone runs bottled-water advisor.
- [ ] Existing Vitest + SvelteKit typecheck + CI discover harness checks, with no second runtime/CI job.
- [ ] Baseline before economic tuning; explicit Gate A sign-off in PR #65.
- [ ] Local JSON and Markdown deterministic; `baseline.md`, `after.md` and rationale committed.
- [ ] Scenario no-action below Silver and reference Gold for all three; version 1 unchanged.
- [ ] Full relevant tests and E2E pass, no extra save fields or new mechanics.

**Deferred:** HPA-511 new challenge content and HPA-318 long-game progression.
