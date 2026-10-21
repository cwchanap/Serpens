# HPA-502 — Headless Sandbox Balance Harness Design

**Linear:** https://linear.app/cwchanap/issue/HPA-502/balance-measure-and-tune-sandbox-pacing-with-a-headless-balance  
**Roadmap:** HPA-534 · **PR:** #65 · **Status:** revised design, planning only  
**Reviewed baseline:** Serpens main at `27fc3fa`, with feedback on PR #65

## Goal and boundaries

Measure deterministic multi-seed sandbox behavior; correct existing gameplay defects affecting stock, forecasts and supply recommendations; tune the same economy used by players; recalibrate the three launch scenarios. Keep **all design, implementation, baseline measurement, Gate A approval, tuning, tests and final reports in HPA-502 / PR #65**.

No new mechanics, persistence fields, save migrations, UI panels, services, scenario packs, AI/search bots, or art/SFX. Engine transitions remain the sole authority. The review's one-seed scratch figures are diagnostic leads, **not** the accepted baseline.

## Verified facts and review decisions

1. `stock.ts:296` builds a **city-wide** demand pool from the average of buildable tiles. `simulateProductSalesForCity` allocates that pool via market share/seller scores, policy and price, caps sales by capacity and available stock, then replenishes on the seven-day cadence. `forecastOpening` instead uses tile-local demand/foot traffic, so simply changing its coefficients cannot reliably track realized sales. A scratch probe reports 1,229–2,428 projected vs 41/day actual across five convenience locations in seed 20260503; reproduce this, do not generalize one seed.
2. `managerDelegation.ts:202`'s `protect-availability` playbook increments both inventory targets whenever missed demand persists; `increaseStockValue` is `max(value + 1, ceil(value * 1.1))` with **no demand-based cap**. An observed target of 543,495 by day 90 is a one-seed probe only. Retail-steady must use this *actual player action* rather than a bot-only stock formula. Fix the unbounded behavior in the production playbook **after Gate A**.
3. `src/lib/scenarios/runtime.ts:218` already dispatches scenario commands to real engine transitions and `executeScenarioCommand` interprets failures. Only `startScenario` requires a random UUID/scenario lifecycle. Reuse the **definition-free command application**, not the scenario runner or a second `BalanceAction` adapter. The existing command evaluator may misclassify a failed `openStoreAtTile` as successful because it appends a system decision; add semantic postcondition checking once, for both callers.
4. Rail diagnosis happens in `src/lib/game/supplyPlanner.ts`, not just `supplyPlannerActions.ts`. `primaryBottleneck` can select a globally usable producer for a reachability/branch deficit. That producer may be connected to *one* sink while lacking a connection to *another*: **global “usable” is not proof that a specific producer→sink edge is satisfied**. Identify a concrete missing producer–destination connection, or return a truthful non-rail bottleneck. Reuse the existing reachability graph; do not create a bot-side sink/pathfinder.
5. `createRetailPlacementPreview` and `getRetailBuildMenuOptions` accept `game: GameState | null`. A richer game-aware forecast **must not break pre-founding/no-game previews**. Replace setup-cost-only `forecastOpening(...).setupCost` calls with `getExpansionSetupCost`, and explicitly handle null game context for projected ranges. The UI currently assumes a synchronous projection; no hidden Monte Carlo simulator.
6. Only convenience starts with bottled water (see `archetypes.ts`). The advisor-follower bot only covers convenience; all four archetypes get idle and retail-steady runs.
7. Existing tests run in Vitest: the server project includes `src/**/*.{test,spec}.{js,ts}`; coverage includes `src/**/*.{ts,svelte}`. Put the harness under `tests/balance/` and add its `*.spec.ts` glob to the existing server-project include. `.svelte-kit/tsconfig.json` is generated/untracked; verify after `bun run prepare` that it includes `tests/**/*.ts` as reported in review and that `bun run check` type-checks the harness. If not, make a minimal fix *then*, rather than prespecifying a second runner/tsconfig/CI job.
8. Scenario runtime tests currently pin First Profit **no-action Gold day 4**, while Import Squeeze's reference wins only **Silver**. Recalibration must enforce no-action below Silver and real documented reference Gold for all three, on official seeds; versions remain `1`.

## Lean implementation architecture

```text
tests/balance/
  run.ts          Bun CLI, optional --seeds/--days/--bots/--output
  bots.ts         idle, delegated retail-steady, convenience advisor
  measure.ts      pure report metrics + deterministic JSON/Markdown
  *.spec.ts       normal server Vitest (10 s small fixtures only)

src/lib/scenarios/runtime.ts       extracted applyGameCommand + command outcomes
src/lib/game/supplyPlanner.ts      paired rail diagnosis + destination
src/lib/game/supplyPlannerActions.ts
src/lib/game/managerDelegation.ts  bound availability playbook
src/lib/game/placement.ts          game-aware, stock-aware forecast
src/lib/game/simulateDay.ts        shared recurring-rent calculation
```

One new `package.json` command, e.g. `balance: bun tests/balance/run.ts`. One server test glob added to `vite.config.ts`. **No new CI steps**, separate typecheck config, Bun test runner, Codecov exclusions or benchmark framework.

### Command execution: reuse, don't fork

Extract the private scenario dispatcher + normalization into an exported, definition-free `applyGameCommand(game, command: ScenarioCommand, rules?)` *in the existing runtime module*, called by both the scenario evaluator and the balance harness. It returns game plus applied/unchanged/rejected evidence; preserve the existing scenario error mapping and capability checks at their current caller boundary. `advanceDay` accepts explicit simulation rules only where the caller supplies them. It must detect a failed store opening via actual store count and expected tile/archetype, even when a system decision was appended. Avoid a separate command abstraction or `ScenarioRun` dependency.

A one-time bot setup call to `setManagerDelegation` uses the actual exported game transition directly. Do not add scenario command kinds or broaden scenario capabilities solely for the harness.

### Bots and matrix

- **Idle:** found a store and advance days with no actions; compare against active operation instead of requiring artificial early bankruptcy.
- **Retail steady:** enable a `protect-availability` manager delegation on an actual qualified manager, give it inventory authority, then hire/assign staff for genuine shortages and expand only with real legal placement/cash checks. The bot must not invent a private reorder formula or override the playbook's targets. Measure baseline *with the original uncapped playbook*, then apply the production cap after Gate A; this is the primary baseline/after comparison.
- **Advisor follower:** convenience-only retail steady plus a single weekly `buildSupplyPlan` call for bottled water. The revised `connect-rail` action carries both `buildingId` and a verified `destinationBuildingId`. Use `buildRailPreview` then the real command; report blocked/unchanged outcomes, do not search sinks in bot code. Unsupported logistics advice is recorded, never treated as fulfilled.

Run a default deterministic **50-seed × 365-day** matrix for four archetypes × idle/steady and convenience × advisor; permit reduced debug sweeps via flags. Fix a documented 50-seed sequence (including 20260503). Never use implicit `Date.now()`. **Founding tile selection is a fixed, forecast-independent rule:** among legal tiles choose maximum `tile.demand + tile.footTraffic`, then lowest tile id. This rule stays identical before/after changing the forecast; later expansions may use the new forecast.

### Forecast: use the real demand model

Replace the tile-local revenue heuristic with a **game-aware, deterministic projection** grounded in the engine's actual city demand pool, effective market/seller share and policies, available starting products, inventory target divided by `REPLENISHMENT_INTERVAL_DAYS`, store capacity and actual effective selling prices. Use the existing pure demand/market helpers where possible and extract only a narrow pure helper if needed; do not call `simulateDay` or duplicate its full tick.

The projection must be **per candidate store**, not the current *total* company demand returned by `getPolicyAdjustedCityProductDemand`. City-level demand can be computed once per preview/archetype and reused for valid tiles; do not make repeated expensive cloning/policy calculations per tile. The pre-founding `game: null` preview remains a supported, tested path: explicitly choose the smallest deterministic way to supply its generated city and founding store context (or adjust the API at the preview boundary), with no invented/random seed and no unhandled null. Favor `forecastOpening(game, tile, archetypeId)` where game context is available; change signature as needed rather than preserving a misleading public shape.

Replace setup-cost-only forecast calls with `getExpansionSetupCost`, including current call sites/tests. Extract the existing actual base recurring rent calculation from `simulateDay` and use it for `projectedDailyRent`. **Do not charge tile.rent every day** merely to fix the label; district rent already influences setup cost. Keep EN/JA/zh-Hant copy aligned if meaning changes. Validate the new projection against first-14-day realized store revenue, per completed opening and district, rather than only an aggregate median.

### Rail: fix classification + destination once

Make `SupplyBottleneck` / `SupplyPlannerAction`'s `connect-rail` contain the specific reachable or potentially routable `destinationBuildingId` chosen by the graph. For *each candidate producer/sink pair*, ensure that the current rail network does not already satisfy that edge and that the recommendation is actionable using the authoritative rail preview; if no viable missing edge remains, fall through to the real bottleneck (`production-capacity`, `import-reliance`, etc.), not another `connect-rail`. A producer attached to a warehouse may still be disconnected from a particular downstream processor: preserve the multi-branch case.

Fix with TDD **before implementing the harness**. This is a production **correctness fix**, not economic-constant tuning. Baseline measurements are taken on this repaired planner, and the baseline report must explicitly disclose that; do not compare advisor results against an unrepaired planner without labeling the difference. Update related planner UI/action-key consumers and tests as required, without a new UI system.

### Manager: cap player-visible behavior, after Gate A

After baseline approval, cap `protect-availability`'s proposed `targetStock` and `reorderThreshold` using **observed recent demand over a replenishment interval**, subject to a small documented safety margin and meaningful hysteresis; do not reset to a fixed magic number or permit 10% daily compounding indefinitely. Preserve `reorderThreshold <= targetStock`, idempotence at the cap, and stock availability semantics. Test with pressure over 90 days, multiple products and no-demand observations. This is a production fix, not bot policy.

## Measurement and evidence

Compute metrics in **one pure `measureRun(game, openingLedger)` after simulation** from existing `game.reports`, which already retains daily history; do not add an incremental recorder or persistent fields. Keep only a small runner-local store-opening ledger and action/rejection observations.

- First positive **full** 7- and 30-day *`operatingIncome`* windows; show operating cash flow separately and never count loan proceeds as profit.
- First negative `cashAfter` day, minimum cash including founding cash, and cash/debt/store levels at days 30, 60, 90, 180, 365.
- Missed-demand ratio = sum missed / sum(missed + sold); stockout share = product-days ending at zero / active product-days; sum `wasteUnits` and `wasteValue`; use `null` for missing denominators.
- Forecast error per opening using that store's *14 complete days* after founding/expansion, with in-range fraction (±25%) per archetype/district; short observations are incomplete, not passes.
- Repeated weekly no-op advisor recommendation and 7 consecutive stalled production days, with command outcome and reason.

The CLI writes deterministic JSON + Markdown locally under `--output`; commit only concise, reproducible **`docs/balance/baseline.md`, `after.md` and `tuning-changelog.md`**. Include seeds/config, sample counts, thresholds, per-archetype results and reproduction commands. Do not maintain versioned serialized report schemas or commit large JSON datasets. Assert determinism by running the same config twice and comparing **the serialized outputs byte-for-byte** in a focused Vitest test (no filesystem hash machinery). Reports contain no timestamps, UUIDs, machine paths or durations.

### Gate A: mandatory pause before economics

Measure the unchanged economy first (with only the labeled rail correctness repair), then review per-archetype results and agree thresholds **in this same draft PR**. Proposals: retail steady positive full 30-day operating-income window by day 30 on fixed seed and >=80% of other sweep seeds; nonnegative cash through first 90 days; ±25% *per-opening* revenue error with a coverage percentage to approve; no stalls in the convenience advisor; idle must be meaningfully less effective than managed operation, judged comparatively rather than by a new arbitrary failure day.

**Do not fix the unbounded manager playbook, adjust forecast formula or tune constants before measuring and approving Gate A.** One-seed scratch probes establish hypotheses, not targets.

## Scenario calibration and verification

Economy edits and launch scenario calibration are **interleaved** after Gate A: the current `runtime.spec.ts` pins exact scores/days, which will become obsolete. Replace those pins with outcome and medal **behavioral contracts** after checking the official traces: every no-action run below Silver, every documented reference trace Gold, all three scenarios, without weakening gameplay intent. Rerun the launch traces after each tuning commit. Maintain version `1` and update translated content if facts change.

CI remains the existing `bun run check`, `bun run lint` and `bun run test:coverage`, with harness specs picked up by the server Vitest project's single new include glob. Run the full matrix locally twice and compare output bytes; run the affected Playwright scenario and retail tests before marking the single PR ready. No new CI jobs/steps and no full sweep in CI.

## Exclusions

No bankruptcy/closure system, additional challenge scenarios, sandbox goal ladder, new analytics backend, graphics, telemetry, save migration, separate PR or task split.
