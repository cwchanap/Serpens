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
- **Why:** Ruling 8. Measured at Task 5a round 1: fresh grocery/electronics entrants took only ~0.445/0.468 player share on rival-bound seeds vs 1.0 for convenience/boutique in the same city — a market-calibration defect that made *any* price/cost/breadth/capacity stack land ≤ 1.21× of costs on rival-bound seeds (the 1.2× sizing bar unreachable).
- **Intended effect:** collapse the rival-bound/rival-free share bimodality into one capacity-bound regime so the other levers can land in the 1.2–2.0× band.
- **Observed:** grocery rival-bound founding gross/costs 0.15–0.16× → 1.30–1.62× live (rival-bound seeds); all-seed live founding band 1.47–1.86×, 10/10 replay seeds, all inside [1.2, 2.0]; replay positive-30-day windows grocery 0/10 → 10/10. `dw ×1.5` measured 8/10 (min 1.18×) — ×2 was the minimal magnitude that met the ≥8/10 objective.

### 3. Low-price founding price/cost data — Task 5a (same commit, `src/lib/game/products.ts`)

One lever, four products (prices ≤ the 2× cap; import costs narrowed within the authorized data menu):

| product | defaultSellingPrice | importCost | intended | observed |
| --- | --- | --- | --- | --- |
| bottled-water | 3 → 6 | 2 → 1 | lead convenience's capacity-bound margin (×2 price / ×0.5 cost caps) | convenience founding ratio 0.16–0.19× → 1.32–1.64×, windows 0/10 → 10/10; margin 1 → 5/u — the table default price moved with the authored price (3→6), so `priceDemandMultiplier` stays 1.0 and demand is unpunished. **Coupled cost side:** these import-cost cuts also halve the supply planner's `finishedImportCostPerUnit` (derived from the retail import-cost table), halving the planner's cash value of Tier-1 local-supply chains; keep-vs-price-only-margins is a human decision flagged for PR review (after.md §8.7) |
| snacks | 5 → 8 | 3 → 2 | breadth-2 founding tail margin for convenience | contributes to the convenience band above; forecast ±25% gate holds |
| produce | 4 → 6 | 2 → 1 | grocery founding lead margin | grocery rival-bound ≥ 1.30× live |
| pantry | 6 → 9 | 3 → 1.5 | grocery founding tail + family volume | +0.17–0.25× vs a pantry-8 trial; replay windows 5/10 → 10/10 |

### 4. Level-1 product breadth 1 → 2 — Task 5a (same commit, `src/lib/game/leveling.ts`)

- **What:** the founding/unlock curve moves to two categories at L1 (L1:2, L4:3, L7:4, L10:5), so founding stores stock and sell a second product.
- **Why:** Task 3 measured that L1 stores carried exactly one low-margin product (convenience bottled-water 1/u, grocery produce 2/u) while fixed costs ran 444–695/day per store — the decisive structural gap. A second category fills the same shared sales capacity with additional margin.
- **Intended effect:** roughly double the capacity-bound gross ceiling for the tuned archetypes without touching capacity or wages alone.
- **Observed:** convenience+grocery ceilings ≈ ×2 (with lever 6 below); L10 unlock budget 5 (household now reachable for convenience; preview null-guarded for 4-product archetypes). Founding staffing follows the milestone curve (see lever 6).
- **Disclosure:** the milestone staffing curve adds one required general at every level for 3+-product archetypes — including L10, where boutique/electronics/grocery unlock no new product (the milestone count is not capped by the catalog).

### 5. Inventory-policy sales capacity ×2 — Task 5a (same commit, `src/lib/game/simulateDay.ts` INVENTORY table)

- **What:** the capacity column doubled with relative gaps kept: lean 0.78 → 1.56, balanced 1 → 2, generous 1.18 → 2.36.
- **Why:** Task 3/5a measured founding capacity ≈ 72 units/day/store — below desired demand for every archetype — capping gross at `capacity × margin` while fixed costs ran 444–695/day.
- **Intended effect:** let the breadth-2 mix actually sell; absorb the second category.
- **Observed:** founding capacity 72 → 144–174 u/d. Controls verified, not assumed: electronics is a true no-op (desired 60 < capacity) and boutique *is* affected (it was capacity-bound at L1 founding, contrary to the round-1 assumption — disclosed and counted in the controls note below).

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

Boutique is the strengthen-never-weaken control; electronics was protected until its dedicated lever. Boutique was **strengthened** by the shared capacity/breadth levers (measured, disclosed, within the ≤2× allowance: seed-20260503 perfect-stock founding gross 2,180 → 2,762 = 1.27× like-for-like; vs round-1 real gross ≈ 1.9×; sweep-level d365 median 239,456 → 670,792, after.md §3) and never weakened. Electronics saw no electronics-*specific* data change from levers 2–6, but it was not untouched by them: breadth-2 (lever 4) gives every electronics store the accessories category at L1, and the capacity ×2 (lever 5) applies to its stores (a measured no-op at founding: desired 60 < capacity). Its trajectory: 0/50 → 34/50 after the 5a shared levers → 41/50 after 5d's ×1.08 (lever 7). Neither control's demand family was rescaled by any other archetype's lever (disjoint `startingProductIds`; family-scoped weights).

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

(a) stall = ≥7 zero-output days strictly after first nonzero output (buildout gaps excluded, all-zero chains still counted); (b) repeated advisor no-ops = repeated *proposed-but-unapplied* actions only — planner `none` declines excluded; (c) every artifact prints its own regeneration command. Disclosure with both-definition numbers in after.md §1; pre-tuning values byte-identical under old and corrected definitions.

### 15. Advisor served-chain composite — Task 5d (commit `100ae3a8`, `tests/balance/measure.ts`)

New `advisorChain` metric (producer/warehouse built, rails applied + last rail day, zero-output days after last rail, local delivery units, stall shape, served). Gate A's advisor item consumes the Ruling-11 composite (built ∧ connected ∧ sustained after last rail ∧ ≥1 local delivery ∧ zero repeated unapplied); stall windows remain informational with the `construction-sequencing pause` classification (after.md §7). Additive field only; all other field semantics frozen.
