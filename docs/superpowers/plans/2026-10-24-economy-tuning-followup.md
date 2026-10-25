# HPA-502 — Economy Tuning Completion Implementation Plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-502/balance-measure-and-tune-sandbox-pacing-with-a-headless-balance  
**Design delta:** `docs/superpowers/specs/2026-10-24-economy-tuning-followup-design.md`  
**Previous implementation:** merged PR #65; its `docs/superpowers/plans/2026-10-20-balance-harness.md` stages 0–3 are **complete**; stages 4–5 were **not** delivered.  
**Base:** `main@4cc858e` after HPA-511 PR #66. Re-read HEAD before editing.
**Delivery:** one **follow-up PR**, planning commits followed by implementation on the **same branch**; no additional task/PR splitting.

## Gate 0 — approve the measurement and targets before coding

- [ ] Review `docs/balance/baseline.md` (50 seeds × 365 days × nine strategy/archetype combinations, 450 runs). Confirm no `after.md` exists and that the bot, founding selection, rail correction and command normalization already merged.
- [ ] Re-run a **small current-main seed sample** with the existing `bun run balance --seeds 20260503 --days 120 --bots idle,retail-steady,advisor --output docs/balance/generated/spot-check`. Compare same-duration measurements carefully; this is a provenance smoke check, **not** a replacement for the committed 365-day baseline.
- [ ] Review known anomalies: no profitable convenience/electronics/grocery managed cohort, runaway manager targets/debt/waste, forecast errors, city-level producer stall and the First Profit / Import Squeeze medal discrepancies. Confirm that HPA-511 now owns four additional catalog entries, not a separate calibration task.
- [ ] Obtain explicit human **Gate A** approval in this PR for the design's numerical acceptance criteria, including the 80%-per-archetype viability, forecast eligibility limited to replenishing bots (`retail-steady`/`advisor`), the proposed <1e9 daily/cumulative boundedness ceiling, and advisor success proposals. **Do not begin engine/economy changes without that approval.** If changed, record agreed targets in both docs before continuing.

## Step 1 — targeted reproducibility and root-cause tests (no new harness)

**Read:** `tests/balance/bots.ts`, `measure.ts`, `src/lib/game/managerDelegation.ts`, `stock.ts`, `retailSupply.ts`, `finance.ts`, `simulateDay.ts`.  

1. Reproduce stock target growth in a real delegated store: repeated availability pressure inflates `targetStock` and `reorderThreshold` despite bounded realized demand. Verify city-scoped delegation covers later stores; retain the existing manager/bot behavior.
2. From the same fixture trace import spending, waste and debt. Identify whether the huge numbers are downstream of inventory orders versus a separate finance arithmetic error. Record which path is actually responsible before changing a finance formula.
3. For convenience/advisor seed 20260503 inspect one water pump through first full buffer, subsequent weekly planner receipts, rail reachability, downstream demand and actual local retail deliveries. Do not confuse a legitimate full buffer with a broken production network. Check if `measure.ts`'s city-summed stall flag overstates failure.
4. Add focused failing specs in the existing `*.spec.ts` files only; avoid helper packages and new global runners.

**Gate:** evidence identifies the faulty player-visible rule, not simply bad bot numbers. No balancing constant is adjusted without this causal explanation.

## Step 2 — bound the existing availability playbook

**Edit:** `src/lib/game/managerDelegation.ts` and its unit specs; only touch `retailSupply.ts` / `stock.ts` if a shared demand calculation genuinely requires it.

1. Derive the product's recent daily requested units from retained reports (sold plus missed demand), over the existing seven-day replenishment cadence. Use a documented small stock safety margin; respect short/missing history. No new `GameState` fields.
2. Stop daily exponential growth. Bound both targets, keep `reorderThreshold <= targetStock`, and avoid oscillating or abruptly resetting a healthy store when a day has zero demand.
3. Verify receipts and player updates still pass through existing delegation/inventory transitions. Cover no-report state, sustained pressure for 90 days, multi-store city delegation, stockouts and repeated idempotent updates.
4. Run a 20260503 120-day local smoke sweep and compare inventory targets/import spend and operating-income trends. If convenience/grocery still collapse, diagnose demand, costs and waste using the actual reports before changing further values.
5. **Before moving to forecast work**, run the unchanged full **50-seed × 365-day** matrix as a boundedness checkpoint. Inspect daily cash and debt, cumulative import spend/waste units/waste value and demand-bounded inventory targets; derive missing sums or extrema from the existing `DailyReport` history without new engine fields. Check the proposed **absolute <1e9** numerical ceiling and count any breaches by seed/archetype/bot. Keep artifacts local; no additional committed report or runner.

**Gate:** behavior is bounded **through day 365** on the full matrix, not merely a 120-day single-seed smoke check. Investigate every exception or revisit the proposed threshold at Gate A; preserve actual player semantics (not just bot behavior).

## Step 3 — replace the mismatched opening revenue estimate

**Edit:** `src/lib/game/placement.ts`; reuse `src/lib/game/stock.ts` market-demand/price helpers; update existing placement-preview, route and finance call sites and tests as necessary.

1. Write a fixture with two otherwise legal tiles and nearby competitors showing current `forecastOpening` projected revenue unrelated to actual 14-day sales; avoid tuning to a single seed.
2. Build a synchronous, pure `GameState`-aware revenue estimate from city demand/product supply, expected entrant market allocation, policy/price, stock/replenishment limit and sales capacity. Do not duplicate the entire sales simulator or mutate active state. Call out approximations explicitly.
3. Continue using `getExpansionSetupCost` for setup price; display base operating rent (from the production `getArchetype(...).baseRent` rule) truthfully, not tile rent. Keep nullable `game` supported for founding preview; do not promise a calibrated preview without game context.
4. Verify number formatting and forecast language in EN, JA and zh-Hant. Add per-opening seed fixtures against **14 complete days**, plus game-null and no-side-effects tests.
5. Re-run the small matrix and compare forecast coverage **only for fully observed retail-steady/advisor openings**. Count idle-strategy openings and incomplete windows as excluded, preserve idle as the negative control, and break down included forecast errors by **archetype, district and bot/strategy**. If the 80% target is missed, correct the narrowest real cause—not a global magic multiplier.

**Gate:** projection is directionally grounded in the same market model as gameplay and does not regress pre-founding or placement affordances.

## Step 4 — address any remaining economy or advisor defects

**Candidate modules only when evidence points there:** `simulateDay.ts`, `stock.ts`, `retailSupply.ts`, `industry.ts`, `leveling.ts`, `supplyPlanner.ts`, `finance.ts`, focused specs.

1. After Steps 2–3, inspect per-archetype income and cash deltas. Fix only demonstrably problematic recurring unit economics / replenishment behavior. Preserve boutique's existing positive control. Do not add district daily rent merely to patch the preview.
2. For advisor: first make the documented local water chain possible with existing warehouse/rail/production actions. If a producer buffer is merely full because nothing consumes it, improve the planner's next feasible action or clarify the stall measurement; if a production capacity/buffer defect genuinely blocks connected demand, fix that smallest engine rule and test it.
3. When changing an economic constant, rerun targeted simulation + regression specs and record the change's intended and observed impact for the final changelog.
4. Avoid changing the harness bot policy or metric definitions. If correcting a proved harness measurement bug is unavoidable, preserve/label comparability and remeasure both baseline and after with the **same** corrected definition.
5. Repeat the **full 50-seed × 365-day boundedness checkpoint** after the remaining economy/industry changes; explicitly check the numeric cash/debt/import-spend/waste ceiling, demand-bounded inventory targets and adverse long-run trends before calibrating scenario medals. Reuse the existing reports/CLI, keep intermediate artifacts local, and trace every exception.

**Gate:** viability and local-supply targets are supported by focused seed runs, and boundedness is independently checked through **day 365** across the full sweep—not deferred until Step 6.

## Step 5 — replay and recalibrate **all seven** scenarios

**Edit when necessary:** `src/lib/scenarios/catalog.ts`, authored schedules/reference cases in `src/lib/scenarios/runtime.spec.ts`, existing localized scenario copy.

1. Keep the seven existing scenario IDs and `version: 1` definitions. Preserve the new HPA-511 debt, freshness, rival and logistics metrics/contracts.
2. Run advance-only and documented legal-reference traces after each meaningful economic edit; don't defer failures to the end. Confirm the reference uses real commands rather than injected state or score.
3. Correct First Profit's no-action Gold and Import Squeeze's reference Silver where still reproduced; recalibrate all remaining scenarios affected by tuned cash, demand, waste, debt or transfer behavior.
4. Assert **no-action below Silver** and **legal reference Gold** for each official seed; prefer behavioral assertions plus only essential stable numeric pins. If legal references cannot earn Gold, adjust authored calibration with trace evidence, never relax the invariant.
5. Run targeted scenario unit and E2E tests; verify scenario saves/capability gating remain unchanged.

## Step 6 — full measured comparison, verification and review

1. Run exactly the baseline's documented 50 seeds, 365 days, four archetypes × idle/retail-steady and convenience × advisor. Use `bun run balance` with the committed seed range and `--output docs/balance/generated/after-sweep`. Generated JSON stays ignored; repeat and compare byte-for-byte output.
2. Commit `docs/balance/after.md` containing per-archetype/strategy summaries, Gate A target pass/fail, forecast errors by archetype/district/strategy (with excluded idle/incomplete counts), daily/cumulative boundedness ceiling breaches, advisor completion, exceptions, and strict baseline comparability notes. Add `docs/balance/tuning-changelog.md` describing each production change and why it affected results.
3. Verify that idle still behaves as an honest negative control and that profitable boutique runs have not regressed. If any target fails, document and resolve the cause instead of declaring an arbitrary successful sweep.
4. Run and record: `bun run check`, `bun run lint`, `bun run test:unit -- --run`, `bun run test:coverage`, and affected Playwright `retail-sim.e2e.ts` and scenario flows. No tests are claimed passed in this planning-only commit.
5. Review final diff for speculative abstraction, duplicated market formulas, misleading copy and unrelated scope. Complete tuning, reports, scenario calibration and review **inside this PR**, then mark ready and close HPA-502 only after acceptance is verified. HPA-318 stays blocked until then.

## Expected file boundary

- **Existing**: `managerDelegation.ts`, `placement.ts`, scenario catalog/tests, relevant market/industry modules as evidence requires, existing locale strings and tests.
- **Reused unchanged wherever possible**: `tests/balance/`, `docs/balance/baseline.md`, Svelte components, persistence, scenarios runtime and command dispatch.
- **New final evidence only**: `docs/balance/after.md` and `docs/balance/tuning-changelog.md`.
- **Not part of this work**: HPA-318 progression, scenario pack content, art/SFX, migrations, CI runner redesign, fresh framework/library, server-side telemetry.

## Final acceptance checklist

- [ ] Gate A explicitly approved and threshold decisions preserved in PR.
- [ ] Retail-steady viability meets agreed full 30-day income criteria across each archetype.
- [ ] Stock targets stay demand-bounded and all daily/cumulative cash, debt, import spend and waste values meet the approved explicit numerical ceiling through day 365 for the full matrix; policy is shared with live play.
- [ ] At least the agreed fraction of fully observed **retail-steady/advisor** opening forecasts is within ±25%; idle/incomplete exclusions are counted and archetype/district/strategy breakdowns are provided.
- [ ] Advisor accomplishes meaningful local supply without repeated rejected recommendations; stalls correctly classified.
- [ ] Seven official-seed scenarios: advance-only below Silver, legal reference Gold.
- [ ] Identical, reproducible baseline/after definitions and committed after-report/changelog.
- [ ] Targeted domain/unit, typecheck/lint, coverage and retail/scenario E2E evidence.
- [ ] No additional PRs for HPA-502.
