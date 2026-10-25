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
- First-14-day opening revenue forecasts overestimated by roughly 60–98% depending on archetype/bot. `forecastOpening` uses tile demand/foot-traffic; sales are allocated from a city-wide pool in `stock.ts`.
- The existing `protect-availability` manager playbook applies `max(value + 1, ceil(value * 1.1))` repeatedly without a demand-based bound, producing huge stock targets, import spend, debt and grocery waste. Treat the extreme debt figures as an engine behavior to diagnose, not a justification for arbitrary global finance caps.
- The convenience advisor run reports producer stalls in 50/50 seeds; the harness's city-level stall signal is coarse. Diagnose whether this reflects full producer buffers, missing downstream demand/rail, or a planner/bot failure before changing industry capacity.
- Three original scenario calibration tests still permit a no-action Gold in First Profit and only Silver for Import Squeeze's documented reference. Four newer HPA-511 scenarios also need replay after tuning.

These observations are from `docs/balance/baseline.md`, not from a new sweep on this branch. Verify a small reproducibility sample on current main before editing economic behavior.

## Gate A: explicit approval before tuning

**Do not implement gameplay/economy changes until a human approves the baseline and success thresholds in the draft PR.** Documentation and baseline verification are allowed before approval. An earlier merge is not evidence of Gate A sign-off.

Proposed targets for that decision (adjust from measured evidence rather than treating them as already accepted):

1. **Retail viability:** for each of the four archetypes, at least 80% of the 50 retail-steady seeds have completed a **full positive 30-day operating-income window by day 90**. A single positive day or `netIncome` cash-flow spike does not count.
2. **Cash and stock sanity:** across all 450 runs, every daily cash balance and outstanding loan principal, plus per-run cumulative import spending, waste units and waste value, must be finite with absolute magnitude **below 1,000,000,000** (proposed Gate A ceiling, not a runtime clamp). Calculate any missing maxima/totals from existing daily reports; count and trace every breach by seed, archetype and strategy. Independently, inventory targets must remain bounded by the observed-demand playbook cap instead of compounding daily. Managed strategies should improve the day-90 cash/operating trend over their own idle comparator in at least 80% of seeds. Early expansion can temporarily lower cash, so do not enforce zero negative-cash days. Note: electronics presently trails idle at day 90, so this comparison explicitly requires actual economics tuning, not only snowball removal.
3. **Opening forecast:** at least 80% of eligible **fully observed** first-14-day openings are within ±25% of realized mean revenue. **Eligible means openings in replenishing strategies only** (`retail-steady` and `advisor`); exclude and count `idle` openings separately because their deliberate refusal to replenish is not a forecastable default operating policy. Exclude and count incomplete windows as well. Report totals and relative errors **by archetype, district and bot/strategy**, not just a pooled average. A pre-founding `game: null` preview is an explicitly rough estimate, not part of this accuracy promise.
4. **Advisor:** convenience's scripted reference should build and serve a bottled-water local-supply chain in at least 80% of seeds, without repeated rejected recommendations. Record genuinely full buffers separately from incorrectly classified stalls.
5. **Scenario guardrails:** every one of seven official-seed scenarios has an advance-only reference below Silver and a documented legal-action reference that reaches Gold (where the scenario is intended to be winnable); never weaken this rule to make a numeric fixture pass.
6. **Reproducibility:** the same seeds, runner behavior, and metrics produce byte-identical artifacts across repeated runs. Clearly disclose any necessary legitimate bot or measurement changes.

Do not turn these thresholds into new mechanics or a general economy optimization framework. The numeric ceiling is a measurable 365-day simulation acceptance target, **not** a new hard engine limit. Run the full 50-seed × 365-day boundedness checkpoint **after the manager fix and again after remaining economy/industry tuning**, before final scenario calibration; keep generated files local. If a target proves structurally unrealistic, present the measured exception for a revised Gate A decision instead of silently changing it.

## Design decisions and reuse survey

### Reuse the existing harness and command path

- `tests/balance/run.ts`, `bots.ts`, `measure.ts` and their existing server Vitest specs remain the sole harness. `bun run balance` drives the real `applyGameCommand` / `simulateDay` transitions.
- Reuse `docs/balance/baseline.md`; keep generated JSON local and publish only a curated `docs/balance/after.md` and short tuning rationale. Do not add CI jobs, a second runner, saved game fields, or telemetry.
- Reuse `buildSupplyPlan`, existing rail preflight, city-local inventory and market-demand logic. PR #65 already repaired the original connect-rail loop; regressions should be tests, not another advisory engine.

### Fix player-visible stock behavior, not a bot-specific workaround

- In `src/lib/game/managerDelegation.ts`, use a bounded target based on recent observed product demand over the **seven-day replenishment interval** plus a modest safety margin. Read existing daily product reports rather than introducing a persistent demand history.
- Preserve the `reorderThreshold <= targetStock` invariant and hysteresis so repeated missed-demand reports do not compound forever. For zero/short history, preserve a sensible current/default target rather than forcing stock to zero. Preserve existing player inventory authority and proposal/receipt semantics.
- Diagnose retail unit economics (prices, costs, import cadence, staffing/marketing cost) with measured deltas, and only adjust existing parameters when necessary; the successful boutique case is a useful control.

### Make placement revenue and rent truthful

- Replace the *revenue* branch of `forecastOpening` with a bounded game-aware estimate that reflects the engine's **city-wide product demand pool**, the new entrant's seller share against competing/player stores, pricing/policy, initial inventory and replenishment limit, and store sales capacity. Extract a small pure helper only if existing market helpers cannot be reused cleanly. **Do not run a daily simulation** from the UI or simply multiply the old tile heuristic by a tuning constant.
- Preserve synchronous/null-game pre-founding placement; explicitly label its lower-confidence preview. Avoid using future information or mutating game/RNG state in a forecast.
- Keep `getExpansionSetupCost` as the setup-cost authority. Display actual archetype base operating rent/cost rather than claiming district tile rent is a recurring daily charge. Do not introduce new daily district rent unless evidence and a separate scope decision justify that mechanic.

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
