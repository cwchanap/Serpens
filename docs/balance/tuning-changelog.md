# HPA-502 tuning changelog

What changed in this branch, why, and what it measurably did. Companion to `after.md` (the measured end state) and `baseline.md` (the untouched pre-tuning record). Every entry traces to a reviewed task report under `.superpowers/sdd/2026-10-24-economy-tuning-followup/` and to the generated sweep artifacts; "before → after" figures cite those sources. Changes are grouped: **economy changes** (affect the simulated economy), **scenario calibrations** (authored scenario targets/thresholds restored against the new economy — no engine change), and **measurement-side changes** (harness/estimator/UI work that changed how results are measured or forecast, not what the economy does).

## Economy changes

### 1. Manager availability-playbook bound — Task 2a (commit `d2e06dc2`, `src/lib/game/managerDelegation.ts`)

- **What:** the delegation playbook that ratchets store inventory targets up can no longer grow without bound: proposals trigger only on availability (stockout-side) signals, are capped at a **7-day observed sellable demand** cap (`unitsSold + stockoutLostDemand` via `getSellableDemandCap`), and hold/idempotence rules prevent repeated growth on already-satisfied targets.
- **Why (measured cause):** pre-tuning, capacity-loss `demandMissed` triggered target increases compounding to ≈ 8.8e15–8.8e16 units of target stock (Step-1 root cause A), which drove unbounded import orders (Step-1 root cause B) and the baseline's ≈ −3.5e16 cash / 1.9e16-unit waste explosions. Finance was innocent (no interest capitalization).
- **Intended effect:** make manager targets demand-bounded so cash, imports, and waste cannot compound.
- **Observed:** max target stock 8,770,597,717,095,512 (pre-tuning) → **567** at the post-2a checkpoint (Task-2b §6); max |cash| 8.07e16 → 448,989; max cumulative imports 8.07e16 → 1,133,024; waste 1.92e16u → 0. Smoke at day 120: convenience min cash −1.78e7 → −8.8e4 (still bounded-negative — rent/wages ≈ 3× revenue, which routed the remaining gap to Step 4 levers). This bound is the reason every later sweep is bounded (after.md §5); it still governs the final sweep (Ruling 15, after.md §8.4).

### 2. Grocery-food family `demandWeight` ×2 — Task 5a (commit `d61b8e0a`, `src/lib/game/products.ts`)

- **What:** `produce` → 2, `pantry` 1.1 → 2.2, `prepared` → 1.5, `bakery` → 1.4 — the whole grocery-food family scaled ×2, relative ratios intact.
- **Why:** Ruling 8. Measured at Task 5a round 1: fresh grocery/electronics entrants took only ~0.445/0.468 player share on rival-bound seeds vs 1.0 for convenience/boutique in the same city — a market-calibration defect that made _any_ price/cost/breadth/capacity stack land ≤ 1.21× of costs on rival-bound seeds (the 1.2× sizing bar unreachable).
- **Intended effect:** collapse the rival-bound/rival-free share bimodality into one capacity-bound regime so the other levers can land in the 1.2–2.0× band.
- **Observed:** grocery rival-bound founding gross/costs 0.15–0.16× → 1.30–1.62× live (rival-bound seeds); all-seed live founding band 1.47–1.86×, 10/10 replay seeds, all inside [1.2, 2.0]; replay positive-30-day windows grocery 0/10 → 10/10. `dw ×1.5` measured 8/10 (min 1.18×) — ×2 was the minimal magnitude that met the ≥8/10 objective.

### 3. Low-price founding price/cost data — Task 5a (same commit, `src/lib/game/products.ts`)

One lever, four products (prices ≤ the 2× cap; import costs narrowed within the authorized data menu):

| product       | defaultSellingPrice | importCost | intended                                                             | observed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------- | ------------------- | ---------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| bottled-water | 3 → 6               | 2 → 1      | lead convenience's capacity-bound margin (×2 price / ×0.5 cost caps) | convenience founding ratio 0.16–0.19× → 1.32–1.64×, windows 0/10 → 10/10; margin 1 → 5/u — demand is unpunished at the table price (`priceDemandMultiplier` 1.0), but the authored scenario overrides did NOT track the default: scenario stores kept selling at the pre-change prices (bottled-water 3, produce 4) with a demand multiplier of ~1.23–1.35 until the review pass realigned them (local-lifeline, fresh-market, rival-next-door now price at the table default). first-profit deliberately keeps its authored 3 — its medal shape is built on the underprice (measured: at the default price the passive baseline out-earns every documented play, 2236 vs ≤2139, and no income band restores the no-action < silver / reference ≥ gold split). **Coupled cost side:** these import-cost cuts also halve the supply planner's `finishedImportCostPerUnit` (derived from the retail import-cost table), halving the planner's cash value of Tier-1 local-supply chains; keep-vs-price-only-margins is a human decision flagged for PR review (after.md §8.7) |
| snacks        | 5 → 8               | 3 → 2      | breadth-2 founding tail margin for convenience                       | contributes to the convenience band above; forecast ±25% gate holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| produce       | 4 → 6               | 2 → 1      | grocery founding lead margin                                         | grocery rival-bound ≥ 1.30× live                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| pantry        | 6 → 9               | 3 → 1.5    | grocery founding tail + family volume                                | +0.17–0.25× vs a pantry-8 trial; replay windows 5/10 → 10/10                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

### 4. Level-1 product breadth 1 → 2 — Task 5a (same commit, `src/lib/game/leveling.ts`)

- **What:** the founding/unlock curve moves to two categories at L1 (L1:2, L4:3, L7:4, L10:5), so founding stores stock and sell a second product.
- **Why:** Task 3 measured that L1 stores carried exactly one low-margin product (convenience bottled-water 1/u, grocery produce 2/u) while fixed costs ran 444–695/day per store — the decisive structural gap. A second category fills the same shared sales capacity with additional margin.
- **Intended effect:** roughly double the capacity-bound gross ceiling for the tuned archetypes without touching capacity or wages alone.
- **Observed:** convenience+grocery ceilings ≈ ×2 (with lever 6 below); L10 unlock budget 5 (household now reachable for convenience; preview null-guarded for 4-product archetypes). Founding staffing follows the milestone curve (see lever 6).
- **Disclosure:** the milestone staffing curve adds one required general at every level for 3+-product archetypes — including L10, where boutique/electronics/grocery unlock no new product. Review pass: the staffing requirement is now catalog-capped via the shared `getUnlockedProductIds` helper (no phantom sixth general at L10 for four-product archetypes); the milestone-based staff-capacity bonus stays level-keyed by design — it is the only thing L10 grants those archetypes.

### 5. Inventory-policy sales capacity ×2 — Task 5a (same commit, `src/lib/game/simulateDay.ts` INVENTORY table)

- **What:** the capacity column doubled with relative gaps kept: lean 0.78 → 1.56, balanced 1 → 2, generous 1.18 → 2.36.
- **Why:** Task 3/5a measured founding capacity ≈ 72 units/day/store — below desired demand for every archetype — capping gross at `capacity × margin` while fixed costs ran 444–695/day.
- **Intended effect:** let the breadth-2 mix actually sell; absorb the second category.
- **Observed:** founding capacity 72 → 144–174 u/d. Controls verified, not assumed: electronics is a true no-op (desired 60 < capacity) and boutique _is_ affected (it was capacity-bound at L1 founding, contrary to the round-1 assumption — disclosed and counted in the controls note below).

### 6. Grocery base staffing 3 → 2 generals — Task 5a (same commit, `src/lib/game/staffing.ts`, Ruling 9 wording)

- **What:** grocery's base staffing requirement drops one general — exactly cancelling the +1 general that breadth-2 would otherwise add at L1, so `getStaffingRequirement('grocery', level)` is identical to pre-tuning at every level.
- **Why:** the literal payroll relief would have pushed rival-free seeds past the 2.0× hard cap (Ruling 9); the net-zero form prevents the breadth tax instead of cutting wages.
- **Intended effect:** hold grocery payroll at pre-tuning parity while breadth-2 opens the second category.
- **Observed:** replay windows grocery 3/10 (with breadth but without the staffing hold) → **10/10**; founding ratios stay ≤ 1.86× < 2.0.

### 7. Electronics-family demand depth ×1.08 — Task 5d (commit `4768b7f0`, `src/lib/game/products.ts`)

- **What:** `games` demandWeight 1 → **1.08**, `accessories` 0.9 → **0.972** (0.9 × 1.08 — the 1 : 0.9 family ratio frozen, the same family-step pattern as lever 2). Prices, import costs, sensitivities, dynamics untouched.
- **Why:** Ruling 13. At the Task-5c checkpoint electronics failed 16 weak-demand seeds (34/50 < the 80% bar): 3-store gross 54.3–60.3k over days 61–90 vs a ≈61.3k fixed cost base — demand depth, not unit defects (single-store economics 1.66×, expansion share-split diagnosed at Task 5a). Authorized sizing: smallest family step flipping ≥6 of the 16, target ≥40/50, passing-seed headroom ≤ ~2×.
- **Intended effect:** lift weak-city electronics gross over the 3-store cost line without overshooting passers.
- **Observed (full 50-seed real-engine grid before the edit):** ×1.08 flipped **7** of 16 → **41/50 (82%)**; every one of the 16 improved (days-61–90 income Δ +2.6k…+4.9k); worst passer 20260548 6,717 → 12,381 (**1.84×**, cap held); ×1.10 would have breached (2.01×), ×1.15 breached 17×. Estimator tracked automatically (electronics forecast mean error −11.0% → −9.9%; forecast gate re-run 712/712, after.md §4).

### Controls note — boutique and electronics

Boutique is the strengthen-never-weaken control; electronics was protected until its dedicated lever. Boutique was **strengthened** by the shared capacity/breadth levers (measured, disclosed, within the ≤2× allowance: seed-20260503 perfect-stock founding gross 2,180 → 2,762 = 1.27× like-for-like; vs round-1 real gross ≈ 1.9×; sweep-level d365 median 239,456 → 670,792, after.md §3) and never weakened. Electronics saw no electronics-_specific_ data change from levers 2–6, but it was not untouched by them: breadth-2 (lever 4) gives every electronics store the accessories category at L1, and the capacity ×2 (lever 5) applies to its stores (a measured no-op at founding: desired 60 < capacity). Its trajectory: 0/50 → 34/50 after the 5a shared levers → 41/50 after 5d's ×1.08 (lever 7). Neither control's demand family was rescaled by any other archetype's lever (disjoint `startingProductIds`; family-scoped weights).

## Scenario calibrations (authored targets/thresholds — no engine change)

Each restores an authored scenario invariant that the tuned economy broke; each is loud, measured, and pinned by the scenario suite. Final table: 14/14 invariants (after.md §9).

### 8. fresh-market `produce-sold` target 850 → 1300 — Task 5a (commit `fbe5a8e0`, `src/lib/scenarios/catalog.ts`)

- **Trace evidence:** under the round-2 economy the no-action trace sells 984 produce over the objective's trailing-14 window — at 850 it would have met both required objectives and completed, breaking the authored no-action-fails-at-deadline shape. At 1300: no-action 984 < 1300 still fails at deadline (no medal); reference 1,653 ≥ 1300 completes d15 gold (score 1000), unchanged.
- **Disclosure:** under the tuned economy the no-action run sells its oversized opening produce lot before expiry, so the waste objective is passively met on the documented traces (zero spoilage); the scenario now binds via the raised volume target (1300).

### 9. debt-turnaround content: level-4 `devices` allowlist entry — Task 5a (same commit)

- **Trace evidence:** same invariant class as import-squeeze — the target level-4 unlock adds a third electronics category under the breadth-2 curve, so the validation allowlist must list it. Measured replay trace unchanged: no-action fails d28/500; reference completes d10 gold 924, identical to the pre-change trace.

### 10. import-squeeze `medalThresholds.gold` 850 → 840 — Task 5d (commit `4768b7f0`, `src/lib/scenarios/catalog.ts`)

- **Trace evidence:** the ×1.08 demand step raised the reference's demand-missed to 910 units by d15 (fixed founding targets under the ×2 import-cost squeeze), collapsing the demand-missed score component to 13/140 and moving the reference 853 → 841 — under the 850 gold bar, a genuine invariant break. At 840: reference completes d15 **gold 841**; no-action 663 bronze unchanged; completion day unchanged; the other six scenarios' traces byte-identical. Known fragility: 1-point margin (after.md §8.3).

### 11. first-profit income band 450→500 / 1400→1600 — Task 6 (commit `3b11701b`, `src/lib/scenarios/catalog.ts` + EN/JA/zh-Hant `strategyHint`)

- **Trace evidence:** the one live defect entering Step 5 — no-action reached cumulative net income 1306 by its day-4 completion, the old band paid full 180 points → 862 **gold** for doing nothing (invariant violation). New band: passive 1306 < 1400 → 0 points → **682 bronze** (94 income-points of headroom below the zero-bonus edge); reference income 1,660 ≥ 1600 → full points → **862 gold** (60 points of headroom above the full-bonus edge). Strict direction tightened, medal thresholds (700/850) untouched; the strategy hint no longer claims "no setting change is required" (all three locales updated together). Supplier-terms resolved/unresolved reference flows both score 862.

## Measurement-side changes (not economy)

These changed how results are measured, forecast, or built-for — they do not move the simulated economy. Listed here so no reader mistakes them for tuning.

### 12. Gate A evaluator + boundedness fields — Task 2b (commits `8e93c47a`, `665bd297`, `tests/balance/measure.ts`)

Per-run `maxAbsCash` / `maxOutstandingPrincipal` / `cumulativeImportSpend` / `operatingIncomeDays61To90`, pure `evaluateGateA` with the approved thresholds, and the Gate A verdict section in the artifacts. Fix round: forecast accuracy measured against **realized** revenue (denominator = observed mean), the gate's stated semantics. Comparability: pre-tuning regen matched all 450 `baseline.md` old-field rows byte-for-byte (after.md §1).

### 13. Shared market-based opening estimator — Task 4a (commits `0437c50f`, `8f4b947a`; legacy removal `76050bfb`)

`src/lib/game/placement.ts`: one shared estimator replaces the tile heuristic for founding + expansion forecasts (±0.3% vs real windows in fixtures; perf round made build-menu pools per-archetype, golden values byte-identical); build menu and placement preview consume it (UI/UX side, Svelte work in Task 4b); the deprecated `forecastOpening` was removed in 4b. Production code, forecast surface only — the estimator reads the same demand tables, so economy changes flow through it by construction (which is why the forecast gate re-ran after 5d).

### 14. Metric corrections — Task 5c (commit `68e4ed6c`, `tests/balance/measure.ts`, + 3 lines of `run.ts` to thread the parsed CLI)

(a) stall = ≥7 zero-output days strictly after first nonzero output (buildout gaps excluded, all-zero chains still counted); (b) repeated advisor no-ops = repeated _proposed-but-unapplied_ actions only — planner `none` declines excluded; (c) every artifact prints its own regeneration command. Disclosure with both-definition numbers in after.md §1; pre-tuning values byte-identical under old and corrected definitions.

### 15. Advisor served-chain composite — Task 5d (commit `100ae3a8`, `tests/balance/measure.ts`)

New `advisorChain` metric (producer/warehouse built, rails applied + last rail day, zero-output days after last rail, local delivery units, stall shape, served). Gate A's advisor item consumes the Ruling-11 composite (built ∧ connected ∧ sustained after last rail ∧ ≥1 local delivery ∧ zero repeated unapplied); stall windows remain informational with the `construction-sequencing pause` classification (after.md §7). Additive field only; all other field semantics frozen.

## HPA-721 Acceptance Checkpoint (2026-11-15, Not Accepted)

Current measured source: `3250caea0cc70eda4d592ad4406fe8fdf5c75cb1`.
Untuned gameplay: `b50c90c3788eed3a00e757593d9df13ab8534e4a`.
Full context, targets, artifact provenance, and reproduction commands:
[`economy-pass.md`](economy-pass.md). This entry records existing retained edits
and a rejected pilot; it does not claim the economy meets acceptance.

- **Boutique normalization, retained from `b49a0f0f`:** shelf price/import cost
  pairs apparel 38/18 -> 36/17, home-goods 28/14 -> 27/13, gifts 20/9 -> 19/9,
  fashion-accessories 26/12 -> 25/11. The intent is to reduce boutique's absolute
  income advantage. These rounded pairs do not uniformly reduce margin rates.
- **Industry fixed overhead, retained from `b49a0f0f`:** grain-farm 10 -> 6,
  water-pump 8 -> 5, fruit-farm 14 -> 8, pulpwood-grove 10 -> 6,
  chemical-feedstock-well 20 -> 12, copper-mine 12 -> 7, pulp-mill 24 -> 14,
  plastic-plant 30 -> 18, packaging-plant 28 -> 17, circuit-board-plant 24 -> 14,
  gift-workshop 30 -> 18, accessory-assembly-plant 26 -> 16,
  water-bottler 6 -> 4, produce-packhouse 8 -> 5. Intended to reduce measured
  local-chain cash overhead, not establish profitability from inventory value.
- **Unsupported cuts restored:** pantry-works 6 -> 10 in `8984df16`;
  flour-mill 14 -> 24 in `3250caea`. Both now match untuned costs. The older
  `hpa-721-fix-*` full matrices predate the flour-mill restoration and cannot
  certify `3250caea`; current-source artifacts use `hpa-721-head-3250caea-*`.
- **Tier-5 correction, retained from `b49a0f0f`:** delete the six-city goal and
  its unused English/Japanese/Traditional Chinese key, rather than replacing it
  with a redundant five-city goal. Tier 4 still requires five cities; Tier 5
  remains seven stores and 150,000 peak book value. Rewards and claim rules stay
  unchanged. This removes a reachability blocker, not the remaining pacing gap.
- **Import-margin pilot, rejected and restored in this continuation:** apparel
  import cost 17 -> 23 and home-goods 13 -> 18, shelf prices unchanged. On seeds
  20260503/20260515, both boutique runs stop at level 3 with zero local units and
  no Tier-3/Tier-5 claims. Four-archetype peak-median ratio is still 4.5554,
  above 3. Runtime scenario tests pass 80/80; the boutique founding-floor
  regression fails (1.6343 versus 2.4). No test or scenario is re-pinned, and
  no pilot gameplay is retained.

No new setup/payroll/upgrade-cost, throughput, stock-policy, numeric progression
threshold, save-schema, or bot-policy change is retained by this checkpoint.
No acceptance exception or PR-readiness approval is recorded.

The fresh `3250caea` full matrices confirm progression **FAIL** and Gate A
**5/5 PASS**, with complete coverage and all 200 idle controls earning/claiming
zero tiers. Tier-3 reach/median day is convenience 18/50 at 274, boutique 42/50
at 211, electronics 50/50 at 169, grocery 48/50 at 144.5. Tier 5 remains
0/50, 42/50, 0/50, 0/50 respectively; boutique's paired gap is zero and the
peak-median ratio is 10.0074. The flour-mill restoration changes 49 historical
grocery rows and supersedes the older grocery 49/50 at day 120 result.
At restored source, the focused economics/runtime suites pass 86/86.

### Approved Bounded Upgrade-Cost Pilot, Rejected

Explicit user approval permits measuring isolated `RETAIL_UPGRADE_BASE_COST`
8,000 -> 6,000, not adopting it. Bot policy, financing, starting cash and
progression thresholds stay fixed. On the same two seeds 20260503/20260515:

- Boutique Tier-3 median improves 295 -> 204, with Tier 5 unchanged at 2/2 and
  the paired Tier-4/Tier-5 gap still zero.
- Non-boutique Tier 5 stays 0/6; all six runs still fail level 4.
  Grocery Tier-3 median regresses 186.5 -> 281.
- The four-archetype peak-median ratio worsens 12.2797 -> 13.8977.
  All eight idle controls earn/claim zero, and all 18 Gate A diagnostic rows
  are identical to the corresponding untouched rows.
- Two behavioral affordability/accounting tests fail at 8,000 and pass at 6,000.
  The five-file candidate unit run is 152 passed / 4 failed: existing book-value
  hand-fixture, maximum-upgrade-capital and two preview-cost numeric pins.
  All 80 scenario tests and six founding-economics tests pass; no pins change.

The pilot is rejected without widening to an official sweep. Exact patches and
raw evidence use `docs/balance/generated/hpa-721-upgrade6k-*`. The constant and
temporary tests are restored, with source hashes unchanged; no new gameplay
is retained. This does not establish that all lower-cost combinations fail.

After restoring 8,000 and removing the temporary tests, the affected five-file
batch passes 154/154, including all four original numeric pins. Both report
files pass Prettier; source/tests and the four historical reports are unchanged.

### Approved Expansion-Only Working-Stock Screen, Rejected

Temporary data/default scope approved explicitly: new expansion stores only,
water reorder/target 30/108 -> 1,000/1,000 and pantry 55/198 -> 1,000/1,000;
free opening lots remain 84/154 and founding defaults stay unchanged.
No prices, payroll, credit, starting cash, upgrade cost, bot, cadence, industry,
save or progression target change accompanies the screen. Source base is
3250caea; the saved production patch changes only the shared `buildStore`.

- Empty L1 target fills cost actual imports of 1,180 convenience / 1,680 grocery,
  versus unchanged free opening inventory 224/371.
- Six behavioral tests: four intended RED failures, all six GREEN.
  Candidate guards pass 285/285 across seven files; no existing pins change.
- On seeds 20260503/20260515, affected Tier 5 stays 0/4. Grocery Tier-3 median
  worsens 186.5 -> 239 (169 -> 358 and 204 -> 120); convenience stays 0/2.
  All four premium rows are exactly baseline-identical; peak ratio approximately
  11.49 versus 12.2797. Idle earning/claiming remains zero in 8/8 controls.
- Matched, fully staffed three-arm cash cases use exact pre-financing snapshots.
  At day 365, conservative funding-neutral cash after the original gift debit
  is +11,421 / -62,314 for the two convenience first expansions and
  -30,738 / +11,921 for grocery. Only 2/4 repay within the year.
- Campus grocery opened day 358 has only eight first-year reports and a -37,170
  conservative result; its longer 90-day diagnostic reaches day 447.
  Campus opened day 120 returns +15,092 by day 365, conditional on shared/sunk
  city access, not proof of full city-investment payback. All six 90-day cash
  payback metrics remain negative. Inventory value is never counted as cash.
- The initial helper stops on two financing-window reconciliation errors.
  Corrected totals exclude opening-day finance activity predating the snapshot;
  four validated cases are reused unchanged and only two blocked cases rerun.
  All six now reconcile; both outputs remain preserved.
- The 18-row Gate A diagnostic retains the baseline subset's convenience
  viability 1/2 and the other item verdicts; forecasts are 28/28.
  Incomplete coverage remains `allPassed: false`, not official acceptance.

The screen is rejected for adoption; restoration and its fresh checks are a
separate final step. Evidence and exact patches use
`docs/balance/generated/hpa-721-expansion-stock-*`. No new official sweep or
candidate chain run is justified. This is not a proof that the remaining
per-product/coupled space is exhausted.

Restoration is verified: the four source/spec hashes match pre-trial values
exactly, source/tests have no diff, and the fresh restored seven-file batch
passes 279/279. The four historical reports remain unchanged. The two reports,
screen design and child plan pass formatting checks; no screen gameplay is
retained and no commit or push is made.

### Approved Linked-Price Rebase, Stopped And Restored

2026-11-16, base `3250caea0cc70eda4d592ad4406fe8fdf5c75cb1`. This is a
scenario-guard rejection, **not** a candidate pacing or cash-payback result.

- Temporary import/shelf pairs: water 3/8, snacks 12/18, produce 6/11, pantry
  8.5/16. Nonfounder reorder/targets: water 700/700, pantry 1,000/1,000,
  produce 180/180. Free opening quantities and founder defaults stay unchanged.
  Empty fills are 3,180/9,580; import-valued opening gifts are 1,092/2,149.
- Setup tile-rent coefficient 2.5 -> 1, grocery base rent 165 -> 120, Harbor
  snacks demand 1 -> 1.4. No pantry-demand, recipe/industrial-cost, financing,
  bot, progression or save-schema change. Scenario offsets are only first-profit
  start/reference 3/6 -> 5/8, local-lifeline 6/4 -> 8/6, fresh-market start
  6 -> 11 and rival-next-door 6/7 -> 11/12; two-city has no authored offset.
- HEAD preflight captures eight progression/eight idle runs once: all eight
  progression rows match the frozen selected baseline, all idle controls earn/
  claim zero, four archived forks/no-opening cases match, two local replay/
  accounting paths execute, and all 14 scenario rows are retained. A strict
  zero-finance metadata bridge fixes only the legacy cached-row shape; no money
  is repinned, no archived data changes, and only failed components are rerun.
- Initial candidate RED is invalid as a clean test-first gate: five old-value
  assertions plus three import errors. After import fixes the ten new tests pass,
  but the full existing guard inventory has 490 passed/24 failed (514 total).
  The saved-price/forecast tests also fall short of full lifecycle/deep-state
  compatibility proof. No existing test assertion is changed.
- First-profit no-action net income rises 1,306 -> 2,795, crossing the unchanged
  1,400/1,600 scoring band and activating all 180 income points. It earns
  day-4 gold 862 instead of bronze 682, exactly matching the reference. This is
  a semantic guard failure, not a numeric-pin update. All seven candidate
  references remain gold; rival-next-door's 949 -> 951 pin is left untouched.
- The full candidate is reverse-checked/applied back, all 16 source/guard
  preimages match, all eight helper locks hold and gameplay source has no diff.
  Fresh restored guards plus observer suites pass 523/523 across 14 files.
  Only the validated optional command-context observer remains in test source.

Exact patches/hashes, source/dirty manifest, frozen recipe, all outputs and the
lead-authored verdict use `docs/balance/generated/hpa-721-linked-screen-*`.
The final frozen recipe hash is
`447926baa328877fe7997565915dcb62209b9069e7472e34303149c65b32d504`;
the candidate patch hash is
`06bf7d17d48be5254a8522faac84c18ad822284d56915f57efe0e21b62d190d3`.
The older capture-script hash and unchanged-code reuse proof remain explicit in
the metadata, not overwritten. See `economy-pass.md` for the complete distinction
between analytical preview, HEAD validation, temporary results and acceptance.

Candidate progression/components/Gate A diagnostics, the official matrix,
full check/lint/full-unit/E2E and macOS/Windows smoke do not run after this stop.
Acceptance remains blocked and existing-save economics uncertified. No gameplay
from this screen is retained; no commit or push is made.

### First-Profit Diagnosis: Cash Flow And Premium Pricing

Two approved no-action replays reproduce the frozen HEAD/candidate results
exactly, including RNG, with only three daily reports each. The candidate's
five app blocks are temporarily replayed and immediately restored; all 16
source/guard preimages and eight frozen helper hashes still match.

- Both sell the same free opening 250 water/70 snacks, with zero imports,
  warehouse supply, waste or shrink. Operating costs stay 318 and financing
  cash flow zero.
- Revenue rises 1,624 -> 3,113: +620 water and +869 snacks. This explains all
  1,489 of the reported income increase, not increased aggregate unit sales.
- The scenario's `cumulative-net-income` query directly sums operating cash
  flow; the daily report also aliases that as `netIncome`. Higher COGS does not
  offset free-stock cash proceeds in this no-import window. COGS rises
  390 -> 1,590, while COGS-based operating income rises only 916 -> 1,205.
- Premium pricing multiplies configured prices by 1.24. Preserving catalog
  `price - cost` does not preserve `1.24 * price - cost`; the latter explains
  the separate +289 operating-income change, including daily currency rounding.

Frozen captures, the lead-executed decomposition/derivation source and restore
receipts use `docs/balance/generated/hpa-721-first-profit-rebase-trace-*`.
No metric, band or objective is changed; no new preset or reference action is
introduced. The known rejected app values are only reproduced temporarily.
The next proposal must address both tutorial SKUs and retain a meaningful
pricing lesson; no new numeric pilot is approved or run by this diagnosis.
No new unit/matrix/E2E/smoke run follows this observation-only exercise; the
prior 523-test receipt is not presented as a fresh test run.

### Corrected Linked Candidate: Bounded Screen Rejected

The approved First Profit correction keeps opening water/snacks at 3/8 and
reprices both to 8/18 in the reference before reports. Frozen day-4 outcomes
are 682/bronze without actions and 862/gold for the reference; reference
COGS-based operating income is +1,222. Scoring, thresholds and cash semantics
stay unchanged. Source-identity proof preserves the other six scenario pairs;
the candidate's reviewed guard run passes 510 tests with six explicit First
Profit exclusions. A genuine structural RED/GREEN cycle now has eight intended
failures/two passes, then all ten passing.

- Four matched expansion cases have positive days 61–90 operating gaps.
  Financing-neutral, gift-debited day-365 cash gaps are +12,703/+12,769 for
  convenience, but -16,672/-15,820 for grocery: the expansion cash gate fails.
- Primary seed-20260503 local cash gaps are +1,523 water and +6,244 produce.
  Water has a conservative local-sales lower bound of 2,260 units; produce's
  bound is zero, so productive local sales remain unproven, not waived.
- Eight progression/eight idle runs use the fixed two-seed/365-day recipe.
  Non-boutique Tier 5 remains 0/2 each; boutique reaches 2/2 with a zero-day
  T4→T5 gap. Tier-3 median days are 249.5/239/148/71 in
  convenience/boutique/electronics/grocery order; sample peak-value ratio
  6.023× still exceeds 3×. All eight progression runs finish cash-negative.
  Idle earned/claimed tiers remain zero, but valuation aggregates differ.
- Eighteen Gate A diagnostic rows pass five check items with incomplete
  coverage; no official 450-run verdict is claimed.

The component screen and credible progression-path check fail. Do not run the
full acceptance matrix or adopt this bundle. All 14 temporary source/test
paths are restored to `18a6f846`; fresh restored checks pass 504 focused plus
19 observer tests without exclusions. Frozen archive/helper/recipe integrity
passes. Only these evidence notes remain as tracked changes; no commit/push.
Artifacts, hashes, precise cash boundaries and remaining obligations are in
`economy-pass.md` and the ignored local
`docs/balance/generated/hpa-721-linked-corrected-pilot-*` archive. Obtain that
archive before reproduction; it is not committed. Full
check/lint/unit/build/E2E, official matrices, existing-save certification and
macOS/Windows smoke remain outstanding.

### Joint Recovery: Fixed-Source Diagnostic, No New Tuning

The approved fourteen-trajectory diagnostic temporarily reuses the exact
rejected corrected candidate at documentation HEAD `95ff7dfb`. Eight native
progression summaries/claim traces and six grocery component arms match their
frozen counterparts exactly. The additional reports, complete action ledgers,
commands and boutique/electronics chain summaries are retained; no new observer,
policy, numeric lever or acceptance definition is introduced.

- Rival-free grocery/20260515 already has player share 1. In reports 61-90,
  pantry consumes shared capacity and both stores sell zero produce with zero
  produce stockout-lost demand; capacity-excluded produce demand is 3,953/3,827.
  The entrant sells only 138 produce units all year, with 362 zero-sale days,
  6,581 waste and 1,120 shrink. More stock/production is not the sole remedy.
- Every non-boutique run records 52 level-2 upgrade deferrals after its day-1
  upgrade. Convenience/20260503's best observed cash above reserve is only
  3,160 versus the 16,000 bill. Other-price liquidity arithmetic is not a
  counterfactual run and does not justify an isolated upgrade-price choice.
- Boutique first stocks its level-4 gifts on days 113/78 and first receives
  local gifts on days 210/238; Tier 3 arrives 225/253. Electronics builds its
  first assembly plant on day 57 in both seeds but first local flow is 119/147.
  Unlock, actual construction, funding and route timing must not be conflated
  with a terminal recipe throughput problem.
- The produce local-sales lower bound remains zero. No source-allocation,
  threshold, cash-accounting or scoring change is used to make it pass.

All 475 tracked application/test hashes return to baseline; restored checks
pass 504 guards plus 19 observers without exclusions. The preliminary cleanup
trap's early apply/restore is preserved separately; no captures ran before it
and no simulation was duplicated. Final restore/closure and immutable input/
recipe hashes pass.

The candidate is still rejected. The evidence narrows the required joint design
but does not select or approve a new numeric bundle. Frozen evidence, the
lead-executed analysis and hashes use the ignored local
`hpa-721-joint-recovery-diagnostic-*` prefix; see `economy-pass.md`.
No official/idle/scenario/Gate A matrix, final full checks/build/E2E, save
certification, platform smoke, commit or push is performed.

### Joint Recovery R1 Design: Pre-Trial Analytical Record

At this design-only checkpoint, proposed but not yet applied: relative to the rejected corrected candidate, produce
shelf 11 -> 13; Harbor pantry profile 1 -> 0.4; nonfounder pantry target/
threshold 1,000 -> 500; retail upgrade base 8,000 -> 2,000; non-milestone
revenue bonus 10% -> 5%. Preserve other linked controls and update the listed
scenario produce price offsets to opening/reference 13/14 as applicable.
No bot, ladder, scoring, recipe or throughput adjustment.

Ten new native canonical grocery rows lie at 1.59325-1.93250 gross/cost,
with both products sold. Thirty unaffected L1 rows are reused, not rerun.
The fractional-price sketch 13.5 is explicitly rejected: brand rounding
makes actual shelf 14 and breaches the unchanged 2.0 cap at 2.02344.
Conditional pantry-demand peaks are 282/419, supporting a 500 target only
under frozen share/policy/state assumptions. Empty fill is 5,330 versus
9,580, and the opening gift debit stays 2,149.

The exact approval packet, scenario teaching/guard stop risks, and proposed
fourteen scenario plays plus 28 year-long bounded trajectories are in
`docs/superpowers/specs/2026-11-17-hpa-721-joint-recovery-candidate-design.md`.
Design evidence uses the ignored local
`hpa-721-joint-recovery-candidate-design-*` prefix. No source edit, runtime
pilot, new app-suite/platform run, acceptance, commit or push accompanied that
design step. The approved runtime outcome follows.

### Joint Recovery R1 Runtime Trial: Rejected And Restored (2026-11-17)

- **Treatment:** user-approved exact five-control bundle on restored
  `95ff7dfb`, with the frozen corrected candidate and specified scenario price
  offsets. No further parameter search, bot/ladder/scoring/recipe/throughput
  change. All temporary gameplay/test edits are restored; no R1 lever is retained.
- **Scope:** fourteen fresh scenario plays, then eight progression + eight
  idle + twelve matched component arms, all 365-day economy trajectories.
  Source/recipes and 10,220 native report days are independently checked.
- **Scenario disclosure:** references retain gold/days; no-action
  outcomes/medals/failure deadlines stay intact. Import Squeeze no-action moves
  d15/663 -> d16/680 under the smaller preset-L4 revenue multiplier, still
  bronze within day 21. Rival scores/share/income and Fresh Market reference
  volume are reviewed numeric fixture changes, not identical historical pins.
  First Profit stays d4/682 bronze vs d4/862 gold, reference COGS income +1,222.
  No objective, score band or medal threshold changes.
- **Cash:** all four expansion annual screens pass, after financing and
  opening-gift adjustments: convenience +8,129/+8,996; grocery
  +43,673/+1,412 for seeds 20260503/20260515. Days-61-90 marginal operating
  cash is positive in all four; day-90 payback is not reached. Water local
  cash is +1,652 with a 2,260-unit productive lower bound. Produce cash is
  +6,244, but its conservative local-sales bound is zero/unproven, not proof
  of zero actual local sales.
- **Pacing/equity:** Tier-3 reach is 1/2, 2/2, 2/2, 1/2 for
  convenience/boutique/electronics/grocery; medians 239/183/137.5/106.
  Tier-5 reach is 0/2, 2/2, 2/2, 0/2. Boutique spacing remains 0;
  electronics spacing is 24.5 (<30); other spacing is unavailable.
  Peak-median ratio is **9.98290755984483**, not <=3. Five progression runs
  end cash-negative; eight idle controls have zero earned/claimed tiers.
- **Evidence/verification:** full SKU/market/chain reports are retained,
  including post-third-SKU grocery mix. No opening-SKU omissions or gaps
  within observed additional-SKU spans. Five behavior tests RED/GREEN;
  candidate 531 guards + 19 observers pass without skips; restored 514
  guards + 19 observers pass, all 475 baseline source hashes match.

Full tables, calibration disclosure and hashes are in `economy-pass.md`,
using ignored `hpa-721-joint-recovery-r1-*` evidence. R1 is **rejected**, not
an accepted economy or official matrix result. No new Gate A/official
matrices, full engineering/E2E/platform checks, save certification, commit,
push or PR action is performed.

### HPA-721 Joint Recovery R2 — Rejected, Restored

The approved 33-field bundle is a temporary measurement trial, not an adopted
economy change. It includes retail upgrade base 1,000, soft-drinks price 8,
devices price 200, gifts import cost 14/shelf 19, Harbor prepared demand 0.1,
and the approved industrial/rail cost and fee reset. Founding-product prices,
bot policy, ladder, scoring and production rates stay fixed.

- **Scenarios:** all 14 native plays preserve R1 outcomes, medals and completion
  days; every reference is gold. First Profit remains day 4/682/bronze versus
  day 4/862/gold, reference COGS operating income +1,222. Import Squeeze
  no-action score 680->665 is disclosed numeric drift, still day 16/bronze.
  Cash/COGS drift remains recorded even where result pins match.
- **Pacing:** eight progression and eight idle trajectories run once.
  Tier-3 reach/median is convenience 2/2/day 267, boutique 2/2/day 211,
  electronics 2/2/day 148, grocery 1/2/day 106. Tier-5 reach is 0/2, 2/2, 2/2, 1/2.
  Boutique/electronics T4->T5 gaps are 0; grocery 56; convenience unavailable.
  Sample peak-median ratio **3.105090812722131** exceeds 3. Idle earned/claimed: 0.
  Native `coverageComplete`/`allPassed` remain false.
- **Stop:** R2 is **REJECTED** on eight native pacing/equity flags.
  All 32 conditional component arms are skipped, leaving 16/48 maximum annual
  matrix trajectories used. No R2 cash-payback or conservative local-sales
  acceptance is claimed, despite all 8 primary entry schedules being captured.
- **Checks/provenance:** focused 43 expected RED failures ->45 GREEN;
  candidate 775 guards and 23 observers pass without skips. The first observer
  preflight22/23 failure and temporary day162->141 observation are preserved
  in separate V1/V2 artifacts, without any bot/ladder change or annual rerun.
  An overwritten capture patch is recovered to its exact pinned hash and
  the updated patch is separately retained.
- **Restored:** all 475 baseline source/test hashes and 268 frozen inputs match;
  source/test diff empty, temporary test removed. Restored 718 guards plus 23
  observers pass, zero failures/skips; original day162 pin passes again.

Full rows, numeric-drift disclosure and source/output/restoration receipts are
in `economy-pass.md` and ignored `hpa-721-joint-recovery-r2-*` artifacts.
The approved design's sizing/pre-trial text remains historical, not rewritten
as payback proof. No official matrices/Gate A, full engineering/E2E/platform
checks, save certification, commit/push/PR, adoption or merge approval occurs.
