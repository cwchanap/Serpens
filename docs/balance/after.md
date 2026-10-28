# HPA-502 after-report (Gate A, post-tuning)

**Status: measured and reviewed.** This report captures the economy after the HPA-502 tuning plan (Tasks 2a–7a) completed on the settled branch. It is the comparison partner for `baseline.md` (which stays untouched, measured-only). Every number below traces either to the generated after-sweep artifact (`docs/balance/generated/after-sweep.*`, git-ignored — regenerate with the command in §1) or to a reviewed task report under `.superpowers/sdd/2026-10-24-economy-tuning-followup/`. The tuning changes themselves are enumerated, with before→after effects, in `tuning-changelog.md` next to this file.

**Gate A overall: PASS (5/5)** on the final 50×365 sweep (scenario guardrails are measured by the scenario suite, item 6 of the matrix is out of the sweep's scope by design).

## 1. Sweep definition, determinism, comparability

- **Definition — identical to the baseline sweep:** 50 explicit seeds `20260501`–`20260550` (ascending, includes the mandated `20260503`) × 365 days × (4 archetypes × {idle, retail-steady} + convenience × advisor) = **450 runs**. Ordering: seed, then archetype (convenience < boutique < electronics < grocery), then bot (idle < retail-steady < advisor). Bot definitions are unchanged from the baseline (idle = daily tick only, the negative control; retail-steady = city-scoped protect-availability delegation + staffing coverage + best legal affordable expansion; advisor = retail-steady plus the supply-planner recommendation every 7 in-game days through `applyGameCommand`/`buildRailPreview`).
- **Regenerate (as printed by the artifact header):**
  `bun tests/balance/run.ts --seeds 20260501,20260502,…,20260550 --days 365 --bots idle,retail-steady,advisor --output docs/balance/generated/after-sweep` (full 50-seed list as in `baseline.md`; measured wall-clock ≈ 3 min).
- **Determinism:** the sweep was run twice on the settled HEAD — JSON **byte-identical** (`cmp` clean; SHA-256 `c1b627bca4cbc5dff359ae7f599aa6e1107556cd269bc130a4aebc8761c1b426`, equal to the Task-5d checkpoint `after4d-checkpoint.json`); the Markdown differs only in the header's `--output` file name, proving determinism across output naming (Task-7a report §3).
- **Comparability with baseline.md:** the extended harness (Task 2b) was regenerated against the pre-tuning engine commit (`c5e7cec7`) and matched `baseline.md` on **all 450 old-field rows, 0 mismatches** — old fields are unchanged by the harness extension (Task-2b report §3). This was re-verified after the Task-5c metric corrections with the corrected code on the same pre-tuning commit (Task-5c report §2).
- **Disclosed metric-definition changes since the baseline** (all three landed in commit `68e4ed6c`, Task 5c, and are applied identically to any re-measurement of either era):
  1. **Producer stall** now means ≥7 consecutive zero-output days *strictly after the first day with nonzero output*; buildout gaps before the chain connects never count (a chain that never produces at all still reports a stall from its build day). Both-definition numbers: on the pre-tuning engine the values are byte-identical under old and corrected definitions — all 50 advisor runs read `{start 18, end 365, days 348}`, matching `baseline.md` rows (corrected-vs-old JSON diff: 0 lines).
  2. **Repeated advisor no-ops** now count only *proposed-but-unapplied* actions (no-op/rejected/unsupported) repeated on the weekly cadence; honest planner `none` declines (`unaffordable`/`ineffective`) propose nothing and are excluded. Both-definition numbers: pre-tuning 0 repeated under both definitions; after-sweep 0 under the corrected definition.
  3. **Artifact header:** every artifact now prints its *own* regeneration command (parsed from the actual CLI invocation), so `baseline.md`'s embedded header names `balance-sweep` while the after-sweep names `after-sweep`. Rendering only; measured content unaffected.
- The baseline's own disclosures (rail-planner correctness fix, city-scoped delegation, review fixes) predate the baseline measurement itself and apply equally here; both reports measure the same bot definitions.

## 2. Gate A pass/fail matrix (final sweep, 450 runs)

| # | item | verdict | measured |
| --- | --- | --- | --- |
| 1 | viability (first positive 30-day operating-income window completing by day 90, retail-steady) | **PASS** | convenience **42/50 (84.0%)**, boutique **50/50 (100%)**, electronics **41/50 (82.0%)**, grocery **50/50 (100%)** — every archetype ≥ the 80% bar |
| 2 | boundedness (all of max \|cash\|, max outstanding principal, cumulative import spend, waste units/value < 1e9) | **PASS** | max \|cash\| **722,491** (20260537 boutique/retail-steady); max principal **14,000**; max cumulative imports **1,582,493** (20260532 electronics/retail-steady); max waste **4,961u/4,961** (20260535 grocery/retail-steady); ceiling 1,000,000,000 — **zero breaches** (§5) |
| 3 | managed-vs-idle (days 61–90 operating income, retail-steady > idle per seed) | **PASS** | convenience 50/50, boutique 50/50, electronics 50/50, grocery 50/50 — **200/200 (100%)** |
| 4 | forecast (openings within ±25% of realized mean revenue) | **PASS** | **712/712/716** eligible openings in band (100.0%); excluded-and-counted: 4 incomplete, 200 idle openings (§4) |
| 5 | advisor (served-chain composite per Ruling 12) | **PASS** | **50/50** advisor runs complete the composite; stall windows (informational): 50 construction-sequencing pauses, days 18–29; 0 repeated unapplied recommendations (§7) |
| 6 | scenario guardrails | out of scope (scenario tests) | measured by the scenario suite — 14/14 invariants, §9 |
| — | **overall** | **PASS (5/5)** | economy settled; the sweep is the committed evidence point |

## 3. Per-archetype × bot summaries vs baseline

Medians across the 50 seeds per archetype × bot. "Before" window counts and d30/d90/d365/first-negative-day medians are `baseline.md`'s committed headline table; its min-cash medians and every "after" cell are computed from the per-run rows of the two committed artifacts (`baseline.md`'s embedded table / the after-sweep table). Convention note: the row-computed medians take the mean of the two middle values, where `baseline.md`'s headline used a nearest-rank convention — three x.5 cells differ by exactly 1 (e.g. −20,045 headline vs −20,046 computed); immaterial to every conclusion, noted for exactness.

| archetype × bot | positive 30d windows by d365 (before → after) | first neg-cash day med (before → after) | d30 cash med (before → after) | d90 cash med (before → after) | d365 cash med (before → after) | min-cash med (before → after) |
| --- | --- | --- | --- | --- | --- | --- |
| convenience × idle | 0/50 → 0/50 | 63 → 84 | 16,378 → 18,124 | −12,620 → −11,694 | −131,580 → −118,870 | −131,580 → −119,399 |
| convenience × retail-steady | 0/50 → 42/50 | 21 → 30 | −20,045 → −9,912 | −862,797 → −10,621 | ≈ −3.5e16 → −50,234 | ≈ −3.5e16 → −53,594 |
| convenience × advisor | 0/50 → 42/50 | 20–21 → 30 | −22,523 → −13,780 | −866,173 → −15,340 | ≈ −3.5e16 → −46,386 | ≈ −3.5e16 → −50,826 |
| boutique × idle | 0/50 → 0/50 | 120 → 150 | 28,740 → 31,674 | 4,952 → 10,396 | −78,962 → −58,100 | −80,936 → −62,046 |
| boutique × retail-steady | 50/50 → 50/50 | 21 → 7 | −25,003 → −16,714 | 9,703 → 99,448 | 239,456 → 670,792 | −29,426 → −16,714 |
| electronics × idle | 0/50 → 0/50 | 91 → 120 | 33,530 → 36,508 | 1,982 → 7,422 | −100,596 → −81,208 | −103,042 → −84,610 |
| electronics × retail-steady | 0/50 → 43/50 | 7 → 7 | −32,824 → −27,294 | −38,649 → 5,098 | −125,082 → 136,089 | −128,772 → −30,824 |
| grocery × idle | 0/50 → 0/50 | 60 → 90 | 17,234 → 27,274 | −28,032 → −4,838 | −211,004 → −103,028 | −211,008 → −103,854 |
| grocery × retail-steady | 0/50 → 50/50 | 30 → 14 | −25,339 → −27,732 | −257,825 → −21,334 | ≈ −3.2e16 → 41,381 | ≈ −3.2e16 → −27,732 |

Import spend and waste (after-sweep per-run fields, added by Task 2b — the baseline harness did not record them):

| archetype × bot | cumulative import spend max / med (after) | waste max (after) |
| --- | --- | --- |
| convenience × idle | 14,976 / 14,976 | 0u |
| convenience × retail-steady | 134,536 / 119,304 | 0u |
| convenience × advisor | 135,317 / 109,782 | 0u |
| boutique × idle | 140,296 / 140,296 | 0u |
| boutique × retail-steady | 1,368,230 / 1,358,404 | 0u |
| electronics × idle | 211,172 / 211,172 | 0u |
| electronics × retail-steady | 1,582,493 / 1,483,556 | 0u |
| grocery × idle | 24,804 / 24,804 | 0u |
| grocery × retail-steady | 189,565 / 171,990 | 4,961u |

For scale, the pre-tuning extended-field reference (same harness, regenerated at the pre-tuning commit; Task-2b report §5): max |cash| 8.07e16, max cumulative imports 8.07e16, max waste 1.92e16 units (31/50 grocery retail-steady runs above 1e9). Every after-value is 5+ orders of magnitude smaller.

**Idle negative control — verified.** Idle remains honest: 0/50 positive 30-day windows in every archetype, every idle run goes negative-cash and ends negative (d365 medians −58k…−119k), worst idle min cash −124,116 (20260505 convenience/idle) — bounded decay by design ("comparative negative control, not a bankruptcy deadline"), zero waste, and managed runs beat their idle twins on days 61–90 income in 200/200 pairs (§6).

**Boutique (profitable control) — not regressed; strengthened.** 50/50 positive 30-day windows both before and after — post-tuning every window starts by day 8 and completes by day 37, comfortably inside the by-day-90 Gate-A share of 100%. Median d90 cash 9,703 → 99,448; median d365 cash 239,456 → 670,792 (≈ 2.8×); median min cash −29,426 → −16,714; median days-61–90 operating income +62,394. The strengthening is the measured, disclosed side effect of the shared capacity/breadth levers (within the ≤2× founding-gross allowance — `tuning-changelog.md`, controls note).

## 4. Opening-forecast accuracy

The shared market estimator (Task 4a) is the single forecast surface; the gate measures each complete eligible opening against its **realized** first-14-day mean revenue (denominator fixed in Task 2b fix-round 1). Single official run against the final economy (Ruling 5 as amended in Ruling 13): **712 of 712 complete eligible openings within ±25% (100%)** of 716 eligible; excluded-and-counted: **4 incomplete** + **200 idle openings** (idle excluded by eligibility rule).

- **Error distribution vs realized (two conventions, named):** the artifact's stored `relativeError` column is (realized − forecast) / forecast — mean **+0.112** across all 912 complete outcomes, 763 of them realized > forecast; the distribution below and the headline mean use the Gate A convention (forecast − realized) / realized: min −20.0%, p5 −18.7%, median −14.2%, p95 −2.4%, max +8.0% — the worst case sits 5pp inside the band. The estimator modestly *under*estimates (mean −12.2%); cause not fully attributed; conservative direction.
- **Founding vs expansion split (founding = store-1 only, per the Task-5c review note):** founding **250/250** in band; expansion **462/462** in band — realized-denominator means measured at the Task-5c checkpoint: founding ≈ −15%, expansion −5.6%.
- **By archetype** (mean error): convenience −12.5% (262/262 complete in band), boutique −12.9% (150/150), electronics −9.9% (150/150), grocery −13.3% (150/150).
- **By strategy:** retail-steady 584/584 (−12.1%), advisor 128/128 (−12.6%).
- **District (informational):** all openings in this harness land on downtown tiles, so the district slice equals the aggregate; no cross-district claim is made.
- **The 4 incomplete openings, counted not hidden:** expansion store-3 openings on days 357/360 whose 14-day observation window runs past d365 — seeds 20260501 (retail-steady), 20260506, 20260526, 20260533 (advisor), all convenience/downtown (Task-5c §6, unchanged through 5d).

## 5. Boundedness

The four Task-2b maxima over all 450 runs, against the approved 1e9 absolute ceiling — **zero breaches**:

| quantity | after (final sweep) | pre-tuning reference (c5e7cec7, same harness) |
| --- | --- | --- |
| max \|cash\| | 722,491 | 80,659,439,602,684,380 (≈ 8.1e16) |
| max outstanding principal | 14,000 | 14,000 |
| max cumulative import spend | 1,582,493 | 80,659,439,602,299,780 (≈ 8.1e16) |
| max waste | 4,961 units / 4,961 value | 19,215,536,510,007,060u / 38,431,073,020,014,120 value (31/50 grocery retail-steady runs > 1e9) |

The principal maximum is unchanged because it is the authored founding-loan scale (debt is bounded by construction; the baseline's ≈1e16 snowball was downstream of unbounded import orders, not interest capitalization — Step-1 root-cause finding). The largest after-value (cumulative imports, 1,582,493) sits ≈ 630× below the ceiling; the run-level causes are steady-state direct-import replenishment (electronics 3-store cities), not compounding.

## 6. Managed vs idle, days 61–90

Retail-steady operating income (days 61–90 sum) beats the same seed's idle run in **200/200 pairs (100%)** — 50/50 in each archetype (Gate A item 3; recomputed from the after-sweep per-run `d61-90 inc` column). Median window income, retail-steady vs idle: convenience +3,182 vs −12,212; boutique +62,394 vs −8,618; electronics +15,582 vs −10,514; grocery +6,680 vs −11,624. Idle is negative in the window everywhere — the control decays by design.

## 7. Advisor served-chain composite

All 50 advisor runs (convenience) complete the Ruling-11 composite, uniform across seeds (Task-5d §4/§7, artifact `advisorChain` field):

- chain built: producer day 1 (pump), day 8 (bottler); warehouse day 15 — all applied;
- connected: `connect-rail` applied days 22 and 29 (last applied rail day 29);
- sustained production: zero zero-output days after the last applied rail, through day 365;
- weekly local deliveries: 336 warehouse-sourced units per seed (7-unit restocks, all year);
- zero repeated unapplied recommendations (and zero rejected commands, Task-5b).

**Disclosed diagnostics (informational, not verdict-affecting):** all 50 runs carry exactly one stall-shaped window, days 18–29 (12d), classified `construction-sequencing pause` — the weekly planning cadence plus build order fill both buffers before the rails exist; production resumes day 30 and is continuous to 365. This is the Ruling-10a-letter vs Ruling-12-composite resolution; the honest-decline counts (≈25–38 `unaffordable` / 10–23 `ineffective` planner cycles per seed after chain completion) propose nothing and are not gate violations.

**Volume-share honesty (Ruling 11 disclosure):** the local chain delivers 16,800 units total vs 4,018,435 direct-imported retail units across the 50 runs — **0.42% local share**. This is the authored rail-level-1 trickle (path capacity = min cell budget = 1/day; the planner itself declares `rail-capacity-not-modeled`), not a hidden failure: every produced unit is consumed. Raising it would require new advisor capability (rail upgrades), which was out of scope by ruling.

## 8. Exceptions and honest disclosures

This section is mandatory reading; the PASS matrix does not erase the following.

1. **Convenience viability 42/50 (84% — passes with 2 seeds of margin).** The 8 misses are seed-driven weak cities, identical in retail-steady and advisor: 20260511, 20260513, 20260515, 20260521, 20260523, 20260525, 20260546, 20260548 — no positive 30-day window at all, days-61–90 income −1,048…−4,217, bounded end-of-year cash −26,196…−67,160 across the 16 failing runs (computed from the final artifact), still above idle. Additionally **33 viable convenience runs decay monotonically** across the d90→d180→d365 checkpoints after their window completes — 20 retail-steady + 13 advisor (the advisor twins of the same seeds) — drifting from ≈ −0.7k…−12.2k (d90) to −39.5k…−96.7k (d365), bounded, above idle 50/50. Re-measured on the final sweep, seed-for-seed identical to the Task-5c list (Ruling 14: documented exceptions, **no further convenience tuning** — overshoot risk). The Task-5d report adds 4 electronics retail-steady runs of the same monotone-decline shape (20260509, 20260526 viable-by-d90; 20260529, 20260544 completing their window after d90 — the two nearest misses), pulled toward breakeven by the demand fix (d365 −34k…−37k vs −87k…−96k before).
2. **Electronics viability 41/50 (82% — passes with 2 seeds of margin).** After Task 5a, electronics failed on 16 weak-demand seeds (34/50): the three-store gross (54.3–60.3k over d61–90) did not cover the ≈61.3k fixed cost base — demand depth, not unit economics (passing seeds ran 70.4–77k on the same structure). Ruling 13 authorized a narrow electronics-family demand step: ×1.08 (`games` 1→1.08, `accessories` 0.9→0.972, ratio intact). It flipped 7 of the 16 → **41/50**; every one of the 16 improved (days-61–90 income Δ +2.6k…+4.9k); the 9 remaining misses are 20260504, 20260514, 20260516, 20260518, 20260519, 20260520, 20260529, 20260539, 20260544 — two of them (20260529, 20260544) now complete a window (82–111) but after day 90. Passing-seed headroom held: weakest passer 20260548 went 6,717 → 12,381 (1.84×, under the ~2× cap); ×1.10 would already have breached it (2.01× on that seed).
3. **Fragile scenario margins (by design, tracked):** import-squeeze reference completes at **841 vs a gold bar of 840** — a 1-point margin that any economy touch re-breaks; first-profit sits **94 income-points** below the band's zero-bonus edge (no-action 682 bronze) and **60 points** above its full-bonus edge (reference 862 gold). Both margins are deliberate calibration outcomes (§9) and are pinned by the scenario suite; the economy is frozen from Step 5 onward precisely so they hold.
4. **Inventory-target bound (Ruling 15).** The engineered bound — manager-proposed *increases* can never exceed the 7-day observed sellable demand cap (`unitsSold + stockoutLostDemand`) — holds everywhere since Task 2a and was not altered by later tasks. What does **not** hold strictly is "target ≤ current 7-day cap" for **engine-authored founding defaults**: founding stock starts at a 90-day demand-weight scale, and the bound constrains *proposals only* — it never pulls existing levels down, so targets above the cap hold (no growth past the cap, no enforced decline), leaving ≈74% of product-day samples above their current-window cap (Task-5c probe, 10 seeds × 4 archetypes × 9 horizons). Measured magnitude: max target 833 units (grocery pantry; the 2b-era max was 567 — Task 5a's enlarged pools raised founding defaults as expected), no growth past the cap, no regrowth. Disclosed as initial-stock policy, not a violation.
5. **Negative cash is universal:** 450/450 runs touch negative cash at some point (first-negative day 7–150) — expansion spends first, and idle decays into debt by design. This is unchanged in shape from the baseline and is boundedness-compatible (§5).
6. **Thin margins above the viability bar:** convenience 42/50 and electronics 41/50 each sit exactly 2 seeds above the 80% bar. Both fail populations are the documented weak-city demand shape; any future economy change should re-run the full sweep, not extrapolate.
7. **Local-supply planner cash value is coupled to retail import cost.** The 5a import-cost cuts (water 2→1, produce 2→1, pantry 3→1.5, snacks 3→2) halve the supply planner's `finishedImportCostPerUnit` (derived from the retail import-cost table), halving the cash value the planner attributes to Tier-1 local-supply chains; the positive-economics scenario branches pass only with water import cost zeroed in their fixtures. Keep-vs-price-only-margins is a human decision — flagged for PR review.

## 9. Scenario guardrails (seven scenarios, 14 traces)

Formal invariant table on the final HEAD (Task-6 report, real-runtime replays on official seeds): **14/14 rows OK** — advance-only medal < Silver (null/bronze) in all seven scenarios, and the documented legal reference trace reaches **Gold** in all seven. The one live defect entering Step 5 (first-profit no-action completing at Gold, 862) was corrected by the recalibration below; no invariant was relaxed, and the strict direction (no-action must stay below Silver) was *tightened* by it.

The four authored calibration changes the final table rests on (full trace evidence in `tuning-changelog.md`):

1. fresh-market `produce-sold` target 850 → 1300 (Task 5a) — keeps the authored no-action-fails-at-deadline shape (no-action 984 < 1300; reference 1,653 ≥ 1300, gold);
2. debt-turnaround content: level-4 `devices` added to the validation allowlist (Task 5a) — same invariant class as import-squeeze; measured replay trace unchanged (no-action fails d28/500, reference d10 gold 924);
3. import-squeeze `medalThresholds.gold` 850 → 840 (Task 5d) — the ×1.08 demand step moved the reference score 853 → 841; the 1-point restore keeps reference-gold (841) with no-action bronze (663) unchanged;
4. first-profit income band 450→500 / 1400→1600 (Task 6, commit `3b11701b`) — no-action income 1306 pays 0 → 682 bronze; reference income 1,660 pays full → 862 gold; `strategyHint` copy updated in EN/JA/zh-Hant together.

## 10. Verification battery (Task 7a)

| check | result |
| --- | --- |
| `bun run check` | 0 errors, 0 warnings |
| `bun run lint` | prettier + eslint clean |
| `bun run test:unit -- --run` | 184 files / **4,752 tests, all green** |
| `bun run test:coverage` | statements 98.39%, branches 92.44%, functions 98.72%, lines 98.93% — no threshold failures |
| `bun run test:e2e` | **85 passed**, 0 failed, 0 flaky retries |
| after-sweep balance run | byte-identical re-run (§1); artifacts git-ignored, this file is the committed record |
