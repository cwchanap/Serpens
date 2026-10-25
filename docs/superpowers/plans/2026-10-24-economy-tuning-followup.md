# HPA-502 — Economy Tuning Completion Implementation Plan

**Ticket:** https://linear.app/cwchanap/issue/HPA-502/balance-measure-and-tune-sandbox-pacing-with-a-headless-balance  
**Design delta:** `docs/superpowers/specs/2026-10-24-economy-tuning-followup-design.md`  
**Previous implementation:** merged PR #65; its `docs/superpowers/plans/2026-10-20-balance-harness.md` stages 0–3 are **complete**; stages 4–5 were **not** delivered.  
**Base:** `main@4cc858e` after HPA-511 PR #66. Re-read HEAD before editing.
**Delivery:** one **follow-up PR**, planning commits followed by implementation on the **same branch**; no additional task/PR splitting.

## Gate 0 — approve the measurement and targets before coding

- [x] Review `docs/balance/baseline.md` (50 seeds × 365 days × nine strategy/archetype combinations, 450 runs). Confirm no `after.md` exists and that the bot, founding selection, rail correction and command normalization already merged.
- [x] Re-run a **small current-main seed sample** with the existing `bun run balance --seeds 20260503 --days 120 --bots idle,retail-steady,advisor --output docs/balance/generated/spot-check`. Compare same-duration measurements carefully; this is a provenance smoke check, **not** a replacement for the committed 365-day baseline.
- [x] Review known anomalies: no profitable convenience/electronics/grocery managed cohort, runaway manager targets/debt/waste, forecast errors, city-level producer stall and the First Profit / Import Squeeze medal discrepancies. Confirm that HPA-511 now owns four additional catalog entries, not a separate calibration task.
- [x] Obtain explicit human **Gate A** approval in this PR for the design's numerical acceptance criteria, including the 80%-per-archetype viability, forecast eligibility covering **founding and expansion** openings of replenishing bots (`retail-steady`/`advisor`), the proposed <1e9 daily/cumulative boundedness ceiling, **days 61–90 operating-income vs idle** comparison, and advisor success proposals. Explicitly decide whether a **small low-price-category demand-volume calibration** is in scope and accept that tile differences in the current market may be modest (district breakdown informational). **Do not begin engine/economy changes without that approval.** If changed, record agreed targets in both docs before continuing.

**Gate A: approved 2026-10-25, thresholds unchanged** — see the design delta's "Gate A decision record" (`docs/superpowers/specs/2026-10-24-economy-tuning-followup-design.md`).

## Step 1 — targeted reproducibility and root-cause tests (no new harness)

**Read:** `tests/balance/bots.ts`, `measure.ts`, `src/lib/game/managerDelegation.ts`, `stock.ts`, `retailSupply.ts`, `finance.ts`, `simulateDay.ts`.  

1. Reproduce stock target growth in a real delegated store: repeated availability pressure inflates `targetStock` and `reorderThreshold` despite bounded realized demand. Split `stockoutLostDemand` from capacity-lost `demandMissed`; the latter cannot be solved by more inventory. Add a failing spec where a staff-limited store has full shelves and missed demand but must receive **no inventory proposal**. Verify city-scoped delegation covers later stores; retain the existing manager/bot behavior.
2. From the same fixture trace import spending, waste and debt. Identify whether the huge numbers are downstream of inventory orders versus a separate finance arithmetic error. Record which path is actually responsible before changing a finance formula.
3. For convenience/advisor seed 20260503 inspect one water pump through first full buffer, subsequent weekly planner receipts, rail reachability, downstream demand and actual local retail deliveries. Do not confuse a legitimate full buffer with a broken production network. Check if `measure.ts`'s city-summed stall flag overstates failure.
4. Add focused failing specs in the existing `*.spec.ts` files only; avoid helper packages and new global runners.

**Gate:** evidence identifies the faulty player-visible rule, not simply bad bot numbers. No balancing constant is adjusted without this causal explanation.

## Step 2 — bound the existing availability playbook

**Edit:** `src/lib/game/managerDelegation.ts` and its unit specs; only touch `retailSupply.ts` / `stock.ts` if a shared demand calculation genuinely requires it.

1. **Trigger only on `stockoutLostDemand > 0`**, not `demandMissed > 0`. Demand lost to staffing/sales capacity belongs to the existing staffing action path, never an inventory proposal. Select availability products using the stockout metric without confusing it with all missed demand.
2. Derive the product's recent **sellable** daily requested units from retained reports (`unitsSold + stockoutLostDemand`), over the existing seven-day replenishment cadence plus a documented small stock margin; respect short/missing history. Do not use `unitsSold + demandMissed`, which includes impossible-to-serve capacity demand. No new `GameState` fields.
3. Stop daily exponential growth. Bound both targets, keep `reorderThreshold <= targetStock`, and avoid oscillating or abruptly resetting a healthy store when a day has zero demand.
4. Verify receipts and player updates still pass through existing delegation/inventory transitions. Cover staff-limited/full-shelf no-inventory case, no-report state, sustained pressure for 90 days, multi-store city delegation, true stockouts and repeated idempotent updates.
5. Extend the **existing** `tests/balance/measure.ts` report: compute `maxAbsCash` (including founding cash), `maxOutstandingPrincipal`, `cumulativeImportSpend`, and `operatingIncomeDays61To90` from existing daily reports, alongside existing waste totals. Add a **pure `evaluateGateA(report, agreedThresholds)`** in the same harness, render its computed pass/fail summary in the generated Markdown, and write one deterministic fixture spec for exclusions, thresholds and paired retail-steady/idle income comparison. This is a small reuse of the current runner, **not** a new runner or per-day recorder.
6. Run a 20260503 120-day local smoke sweep and compare inventory targets/import spend and operating-income trends. If convenience/grocery still collapse, diagnose demand, costs and waste using the actual reports before changing further values.
7. **Before volume or forecast work**, run the unchanged full **50-seed × 365-day** matrix as a boundedness checkpoint; inspect computed Gate A evidence, demand-bounded targets and violations by seed/archetype/bot. Store artifacts locally and preserve the original baseline. If extended fields require historical comparison, regenerate the *extended* fields on the pinned pre-tuning baseline and compare shared old fields unchanged, rather than editing `docs/balance/baseline.md` silently.

**Gate:** behavior is bounded **through day 365** on the full matrix, not merely a 120-day single-seed smoke check. Investigate every exception or propose a revised Gate A threshold; preserve actual player semantics (not just bot behavior).

## Step 2b — calibrate low-price product demand **only if approved at Gate A**

**Candidates:** existing `src/lib/game/products.ts` demand weights or minimal reuse of existing archetype traffic in `stock.ts`; no new economic subsystem and no selling-price redesign.

1. Reproduce the short-probe concern on the repaired-stock model: for convenience/grocery, compare sold unit volume, price, achievable gross margin, base operating rent and wages. If even perfect stocking cannot cover unavoidable costs, a stock-target-only fix cannot satisfy retail viability.
2. With explicit Gate A approval, adjust the smallest **existing** demand-volume data/rule that restores viable low-price retail; choose between narrow product-level `demandWeight` changes and reusing the existing archetype traffic signal **from the measured evidence**. Check shared-product / competitor / supply-planner interactions before choosing; do not precommit to an arbitrary multiplier.
3. Replay targeted retail runs and all seven scenario references right after the change (the final medal calibration remains Step 5). Preserve boutique/electronics as controls, and document the exact volume rationale.
4. Run the first focused volume comparison before forecasting; future forecast accuracy is measured against the resulting tuned pool, not an old pool that will be changed in Step 4.

**Gate:** the volume correction is supported by the original model's economics and Gate A approval; otherwise leave volume alone and document the viability exception.

## Step 3 — replace the mismatched opening revenue estimate

**Edit:** `src/lib/game/placement.ts`; reuse `src/lib/game/stock.ts` market-demand/price helpers; update existing placement-preview, route and finance call sites and tests as necessary.

1. Write fixtures varying **city competitor strength and two legal tile placements**, not fictional nearby competitors: competing stores are city-scoped, but `placeStoreOnTile` changes **reputation and staff capacity** by tile, so seller share and capacity can differ. Test correct tile effects and document when district diversity is sparse in the harness.
2. Implement **one shared pure market-based estimate** for the prospective entrant using existing `buildCityDemandPools`, policy/brand/market-share logic and, if useful, a per-seller extraction from `getPolicyAdjustedCityProductDemand`. Include initial stock/replenishment, selling price and sales capacity. No daily simulation or duplicate tile-only revenue heuristic.
3. Derive a hypothetical **founding** store using `createFoundingGameAtTile` with the UI's existing explicit seed (`starterMapState.seed`, threaded through the preview API). For **expansion**, use `openStoreAtTile` only when its actual affordability/cap checks permit it; otherwise reuse a minimal pure prospective-store projection. All forecasts must use the **pre-command game** and must not compete against the store twice. Record expansion forecasts **before** applying `openStore` in `tests/balance/bots.ts`; founding's first-14-day forecast is counted in the promised denominator.
4. Replace setup-cost-only callers (`+page.svelte`, `placement.ts`, `placementPreview.ts`) with `getExpansionSetupCost`. Display archetype base operating rent (`getArchetype(...).baseRent` logic), not tile rent; preserve all existing preview blocking/affordability behavior without inventing player cash or changing RNG.
5. Verify values/copy in EN, JA and zh-Hant **without adding a separate 'rough preview' localization branch**. Add 14-complete-day founding and expansion cases, multiple tiles, game-null seeded preview and no-side-effects tests.
6. Run the forecast accuracy gate **once after Step 2b**, over fully observed retail-steady/advisor founding + expansion openings. Count excluded idle/incomplete observations, report by archetype/district/bot, and treat district as informational. If 80% is missed, use the breakdown to correct the narrowest true market-model discrepancy—not a magic multiplier.

**Gate:** one seeded market forecast serves founding and expansion and the agreed completeness/eligibility target is testable; tile-dependent seller stats are preserved.

## Step 4 — address any remaining economy or advisor defects

**Candidate modules only when evidence points there:** `simulateDay.ts`, `stock.ts`, `retailSupply.ts`, `industry.ts`, `leveling.ts`, `supplyPlanner.ts`, `finance.ts`, focused specs.

1. After Steps 2–3, inspect per-archetype income and cash deltas. Fix only demonstrably problematic recurring unit economics / replenishment behavior. Preserve boutique's existing positive control. Do not add district daily rent merely to patch the preview.
2. For advisor: first make the documented local water chain possible with existing warehouse/rail/production actions. If a producer buffer is merely full because nothing consumes it, improve the planner's next feasible action or clarify the stall measurement; if a production capacity/buffer defect genuinely blocks connected demand, fix that smallest engine rule and test it.
3. When changing an economic constant, rerun targeted simulation + regression specs and record the change's intended and observed impact for the final changelog.
4. Avoid changing the harness bot policy or metric definitions. If correcting a proved harness measurement bug is unavoidable, preserve/label comparability and remeasure both baseline and after with the **same** corrected definition.
5. Repeat the **full 50-seed × 365-day boundedness checkpoint** after the remaining economy/industry changes; use the existing `evaluateGateA` report for the numeric cash/debt/import-spend/waste ceiling, operating-income pairing, demand-bounded inventory targets and adverse long-run trends before calibrating scenario medals. Reuse the existing reports/CLI, keep intermediate artifacts local, and trace every exception.

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
2. Commit `docs/balance/after.md` containing the **generated and reviewed** Gate A pass/fail matrix, per-archetype/strategy summaries, forecast errors by archetype/district/strategy (with excluded idle/incomplete and founding counts), daily/cumulative boundedness ceiling breaches, days 61–90 operating-income comparison, advisor completion, exceptions, and strict baseline comparability notes. Add `docs/balance/tuning-changelog.md` describing each production change and why it affected results.
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
- [ ] Stock targets are based on *sellable* rather than capacity-lost demand; all daily/cumulative cash, debt, import spend and waste values meet approved numeric ceiling through day 365 in the existing harness's generated gate report.
- [ ] Gate A explicitly resolves low-price demand-volume tuning and current tile-driven seller-stat effects; any approved volume adjustment precedes forecast calibration.
- [ ] At least the agreed fraction of fully observed **retail-steady/advisor founding + expansion** forecasts is within ±25%; idle/incomplete exclusions are counted, and archetype/district/strategy breakdowns are provided.
- [ ] Advisor accomplishes meaningful local supply without repeated rejected recommendations; stalls correctly classified.
- [ ] Seven official-seed scenarios: advance-only below Silver, legal reference Gold.
- [ ] Identical, reproducible baseline/after definitions and committed after-report/changelog.
- [ ] Targeted domain/unit, typecheck/lint, coverage and retail/scenario E2E evidence.
- [ ] No additional PRs for HPA-502.
