# HPA-502 — Economy Tuning Completion (Design Delta)

**Linear:** https://linear.app/cwchanap/issue/HPA-502/balance-measure-and-tune-sandbox-pacing-with-a-headless-balance  
**Roadmap:** HPA-534  
**Starting point:** Serpens `main@4cc858e` (after merged PRs #65 and #66)  
**Companion plan:** `docs/superpowers/plans/2026-10-24-economy-tuning-followup.md`  
**Prior design:** `docs/superpowers/specs/2026-10-20-balance-harness-design.md`  
**Status:** proposed; Gate A approval has **not** been established

## Why this follow-up PR exists

PR #65 was merged with the deterministic balance harness and `docs/balance/baseline.md`, but without the promised economy changes, after-report, or scenario recalibration. Linear HPA-502 was reopened. This is the **only follow-up implementation PR** for its unfinished work; the previously merged PR cannot be extended. Do not split the follow-up into more PRs or tickets.

Keep the original spec's architecture and measurement definitions. Its statements that PR #65 remains open and that only three scenarios exist are historical, not current. The four HPA-511 scenarios merged in PR #66, so the calibration target is now **seven** scenarios.

## Evidence and problem statement

The committed baseline measured **50 explicit seeds × 365 days × nine archetype/bot combinations = 450 runs**, with an independently pinned founding tile, shared command execution, real manager delegation, and repaired pairwise rail advice. Preserve this baseline unchanged for comparison unless a demonstrable measurement bug demands a clearly documented re-baseline.

- All 50 convenience retail-steady runs, all 50 grocery retail-steady runs, and all 50 electronics retail-steady runs lacked a positive full 30-day operating-income window. Boutique managed runs succeeded in 50/50, so do not blindly make all stores more profitable.
- First-14-day opening revenue forecasts overestimated by roughly 60–98% depending on archetype/bot. `forecastOpening` uses tile demand/foot-traffic; sales are allocated from a city-wide pool in `stock.ts`. The engine nevertheless changes placed-store `reputation` and `staffCapacity` by tile (`placeStoreOnTile`), and both influence realized sales. Do **not** assume tile-invariant revenue.
- The existing `protect-availability` manager playbook applies `max(value + 1, ceil(value * 1.1))` repeatedly without a demand-based bound, producing huge stock targets, import spend, debt and grocery waste. Its trigger also incorrectly accepts `demandMissed`, which includes demand lost to insufficient staff/sales capacity; inventory cannot recover that loss. In `stock.ts`, **`stockoutLostDemand`** isolates lost *sellable* demand. Treat the extreme debt figures as an engine behavior to diagnose, not a justification for arbitrary global finance caps.
- The convenience advisor run reports producer stalls in 50/50 seeds; the harness's city-level stall signal is coarse. Diagnose whether this reflects full producer buffers, missing downstream demand/rail, or a planner/bot failure before changing industry capacity.
- Three original scenario calibration tests still permit a no-action Gold in First Profit and only Silver for Import Squeeze's documented reference. Four newer HPA-511 scenarios also need replay after tuning.
- Round-2 review's short-run probes suggest the convenience/grocery demand pool is too small for low-price products to cover rent even under perfect stock: reported first-14-day revenues were roughly 56–65/day, versus `baseRent × 0.92` of about 106/day for convenience and 152/day for grocery, before wages. This is a **diagnostic lead to verify against the full harness**, not an approved constant or a fresh project baseline.

These observations are from `docs/balance/baseline.md`, not from a new sweep on this branch. Verify a small reproducibility sample on current main before editing economic behavior.

## Gate A: explicit approval before tuning

**Do not implement gameplay/economy changes until a human approves the baseline and success thresholds in the draft PR.** Documentation and baseline verification are allowed before approval. An earlier merge is not evidence of Gate A sign-off.

Proposed targets for that decision (adjust from measured evidence rather than treating them as already accepted):

1. **Retail viability / low-price volume:** for each of the four archetypes, at least 80% of the 50 retail-steady seeds have completed a **full positive 30-day operating-income window by day 90**. A single positive day or `netIncome` cash-flow spike does not count. **Gate A must explicitly authorize a narrow demand-volume adjustment for convenience/grocery products if the observed low unit pool cannot cover unavoidable rent and wage costs.** This is a targeted existing economy-calibration change, *not* a pricing-system redesign, new demand mechanic, or preapproved multiplier. Tune volume after the manager fix **and before** validating the revenue forecast; recheck all seven scenarios after changing it.
2. **Cash and stock sanity:** across all 450 runs, every daily cash balance and outstanding loan principal, plus per-run cumulative import spending, waste units and waste value, must be finite with absolute magnitude **below 1,000,000,000** (proposed Gate A ceiling, not a runtime clamp). Compute maxima and cumulative totals in the **existing `measureRun` loop**, and trace every breach by seed, archetype and strategy. Inventory targets must be bounded by **seven days of observed sellable demand** (`unitsSold + stockoutLostDemand`) with a modest margin and stable zero-history behavior; staff-capacity loss must not trigger a stock increase. For each archetype, compare **the sum of operating income on days 61–90** for retail-steady versus idle on the same seed; managed should outperform idle in at least 80% of seeds. This measures operations rather than penalizing cash used for expansion. Note that electronics may still require genuine unit-economics improvement.
3. **Opening forecast:** at least 80% of eligible **fully observed** first-14-day openings are within ±25% of realized mean revenue. **Eligible means openings in replenishing strategies only** (`retail-steady` and `advisor`), **including founding stores**; exclude/count `idle` openings separately and exclude/count incomplete windows. Forecast every opening from its **pre-command** state with one shared, deterministic market estimator: for founding use the explicit seed/city to derive the prospective founding state, and for expansion derive the prospective entrant without requiring that an unaffordable build succeed. Never use the already-opened expansion state as input (self-competition). Report totals/errors **by archetype, district and bot/strategy**. District is informational rather than its own pass/fail gate; a pre-founding forecast shares the accuracy promise, so do not introduce a second uncalibrated heuristic or a new 'rough preview' copy branch.
4. **Advisor:** convenience's scripted reference should build and serve a bottled-water local-supply chain in at least 80% of seeds, without repeated rejected recommendations. Record genuinely full buffers separately from incorrectly classified stalls.
5. **Scenario guardrails:** every one of seven official-seed scenarios has an advance-only reference below Silver and a documented legal-action reference that reaches Gold (where the scenario is intended to be winnable); never weaken this rule to make a numeric fixture pass.
6. **Reproducibility:** the same seeds, runner behavior, and metrics produce byte-identical artifacts across repeated runs. Clearly disclose any necessary legitimate bot or measurement changes.

Do not turn these thresholds into new mechanics or a general economy optimization framework. Gate A must record whether the targeted low-price demand-volume tuning is authorized, confirm founding-store forecast eligibility, and acknowledge the engine's limited tile-specific sales differentiation. The numeric ceiling is a measurable 365-day simulation acceptance target, **not** a new hard engine limit. Run the full 50-seed × 365-day boundedness checkpoint **after the manager fix and again after remaining economy/industry tuning**, before final scenario calibration; keep generated files local. If a target proves structurally unrealistic, present the measured exception for a revised Gate A decision instead of silently changing it.

## Design decisions and reuse survey

### Reuse the existing harness and command path

- `tests/balance/run.ts`, `bots.ts`, `measure.ts` and their existing server Vitest specs remain the sole harness. `bun run balance` drives the real `applyGameCommand` / `simulateDay` transitions.
- Reuse `docs/balance/baseline.md`; keep generated JSON local and publish only a curated `docs/balance/after.md` and short tuning rationale. Extend the existing `tests/balance/measure.ts` aggregation with **`maxAbsCash`, `maxOutstandingPrincipal`, `cumulativeImportSpend`, and `operatingIncomeDays61To90`** using the already retained daily reports, then add a small pure `evaluateGateA(report, agreedThresholds)` and rendered pass/fail table with one focused spec. Use the same evaluator at the full-day checkpoints instead of ad hoc scripts; retain the original baseline report unchanged, and compare common historical fields if regenerating extended metrics. Do not add CI jobs, a second runner, saved game fields, or telemetry.
- Reuse `buildSupplyPlan`, existing rail preflight, city-local inventory and market-demand logic. PR #65 already repaired the original connect-rail loop; regressions should be tests, not another advisory engine.

### Fix player-visible stock behavior, not a bot-specific workaround

- In `src/lib/game/managerDelegation.ts`, **trigger inventory action only when `stockoutLostDemand > 0`**. Size the bounded stock target from recent **`unitsSold + stockoutLostDemand`** over the seven-day replenishment interval plus a modest safety margin; do **not** include capacity-lost `demandMissed` in the inventory cap. The existing staffing/hiring path owns capacity pressure. Read existing daily product reports rather than introducing a persistent demand history. Add a regression: full shelves + capacity-lost demand cannot produce an inventory proposal.
- Preserve the `reorderThreshold <= targetStock` invariant and hysteresis so repeated missed-demand reports do not compound forever. For zero/short history, preserve a sensible current/default target rather than forcing stock to zero. Preserve existing player inventory authority and proposal/receipt semantics.
- Diagnose retail unit economics (prices, costs, import cadence, staffing/marketing cost) with measured deltas, and only adjust existing parameters when necessary; the successful boutique case is a useful control.

### Make one placement revenue estimate and truthful rent, after volume tuning

- Reuse `buildCityDemandPools`, market-share/policy primitives and the existing pure `getPolicyAdjustedCityProductDemand` flow, extracting only a **per-entrant** calculation when necessary. Forecast the new store's demand, pricing, opening products, availability and capacity, rather than allocating the company's whole share to it. Do **not** run a daily simulation from the UI or multiply the tile-only heuristic by a fixed factor.
- Use the existing pure founding/expansion transitions as sources of prospective store state **where their preconditions hold**. `openStoreAtTile` rejects unaffordable/blocked openings, so a preview may need a small pure prospective-store projection instead of fabricating money or mutating state. The estimator consumes the state **before** the command plus a prospective entrant; never accidentally include the newly opened store twice. For founding, thread the already available explicit `starterMapState.seed` through preview inputs and use `createFoundingGameAtTile`; count founding forecasts in Gate A. Prefer this shared path over a separate null-game heuristic, without adding localized 'rough' copy.
- **Tile effect is small but real:** `placeStoreOnTile` adjusts reputation and staff capacity, affecting `brandedSellerScore` and available sales capacity even though the base city demand pool has no tile-specific volume. Preserve differences, test two legal tiles with distinct fit/capacity, and avoid claiming the projected revenue range must collapse to a single value. The harness's deterministic high-scoring tile preference may give little district diversity; keep the district breakdown informative, not a standalone pass/fail target. New tile-local demand mechanics are out of scope.
- Keep `getExpansionSetupCost` as the setup-cost authority, replacing forecast calls used only to retrieve setup cost. Display archetype base operating rent/cost rather than claiming district tile rent is a recurring daily charge; do not introduce new daily district rent just to correct copy. Compute forecasts after any Gate-A-approved demand-volume tuning so the accuracy gate is measured once against the tuned economy.

### Diagnose production, then change the smallest real cause

Trace the advisor's earliest stall for seed 20260503 using existing bot action receipts, rail/warehouse connectivity, material buffer occupancy and delivered local units. Determine whether the stall is normal full-buffer backpressure, unmet supply linkage or an actionable engine defect. Address proven producer-buffer scaling or planning defects only if they block usable local supply; avoid a new logistics subsystem. If the coarse harness stall flag is misleading, correct the measurement with a regression and disclose the changed definition.

### Recalibrate seven scenarios against tuned rules

Use the current scenario catalog and official seeds: First Profit, Import Squeeze, Local Lifeline, Debt Turnaround, Fresh Market, Rival Next Door and Two-City Supply Run. Reuse the HPA-511 authored traces/metrics and the existing launch and scheduled-calibration tests. Interleave the replay after each economic change; adjust scenario thresholds or scripted actions only when grounded by successful legal in-game behavior. Keep versions at 1 (pre-release); do not change metric contracts to hide bad outcomes. Only touch EN/JA/zh-Hant copy when player-visible meaning changes.

## Rejected approaches / non-goals

- No bot-only inventory targeting, special cash injections, or `if (balanceRun)` production branches.
- No new strategy search/AI, Monte Carlo, backend, analytics, extra cities, achievement system, or additional test pipeline.
- No blanket bankruptcy prevention, arbitrary finance clamping, or broad redesign of retail pricing.
- No new art or SFX and no compatibility layer for unreleased saves.
- No new ticket for separate forecast, stock, production or medal fixes: they are parts of this coherent follow-up PR.

## Evidence to require at completion

Retain an unchanged-baseline vs after comparison by archetype/bot with all 50 seeds, forecast-error breakdowns by archetype/district/strategy (with idle/incomplete exclusions counted), daily and cumulative boundedness exceptions with traced causes, and stalls; record before/after rationale for every economy constant/formula touched and seven scenario advance-only/reference outcomes. Include focused deterministic regression tests, `bun run check`, `bun run lint`, `bun run test:coverage`, and affected retail/scenario Playwright flows. Test results are claims only after they are actually run.
