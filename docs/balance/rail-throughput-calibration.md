# HPA-679 rail-throughput calibration (Step 6 blocking gate)

**Status: measured.** This report captures the multi-seed economy, cost and
progression calibration for the rail-throughput rebalance
(`RAIL_UNITS_PER_LEVEL = 10`, the free-warehouse-space rail surplus-push cap,
and the Step 4 scenario re-pins), measured on HEAD `922c37ee` of
`docs/hpa-679-rail-throughput-balance`. It is the comparison partner for
`baseline.md` and `after.md` (both untouched, measured-only HPA-502 records).

- **Gate A overall: PASS (5/5)** at both k=1 (control) and k=10 (candidate) on
  the full approved matrix — 50 seeds × 9 bot/archetype combos × 365 days.
- **All 400 non-advisor runs are byte-identical between the two factors** —
  the k factor cannot be reached without building rail, so every
  idle/retail-steady measurement is an unchanged control.
- **Provisional ≥3% local-to-import target: met** — 4.34% aggregate,
  3.70%–5.78% per seed, on the historical-compatible
  post-rail-local / whole-run-all-product-imports definition only.
- **Profitability, honestly:** k=10 does not make the advisor's convenience
  operation profitable (median end cash ≈ −46k both factors). The isolated
  rail-supply effect is modestly cash-*positive* (+$1,680/seed), but
  expansion-timing side effects (earlier store-3 openings) dominate end-cash
  deltas exactly as the review warned — see §5.
- **Progression: hard pass** — zero idle claims, zero earned-unclaimed at both
  factors; modest bidirectional pacing shifts fully disclosed in §7 for
  review accept/reject.

## 1. Runs, exact commands, determinism

Both factors use the **same committed extended harness** (`tests/balance/`),
unchanged HPA-502 bot code, and the same warehouse-cap code path. The k=1
control was produced by temporarily editing the single committed literal
`RAIL_UNITS_PER_LEVEL = 10` → `1` in `src/lib/game/rail.ts`, running the
artifacts, then reversing that exact edit; `git diff` was empty and HEAD
unchanged (`922c37ee`) immediately after — the tracked tree contains no
control hack.

**Sweep (per factor, 450 runs — 400 idle/retail-steady + 50 advisor):**

```bash
bun tests/balance/run.ts --seeds 20260501,20260502,20260503,20260504,20260505,20260506,20260507,20260508,20260509,20260510,20260511,20260512,20260513,20260514,20260515,20260516,20260517,20260518,20260519,20260520,20260521,20260522,20260523,20260524,20260525,20260526,20260527,20260528,20260529,20260530,20260531,20260532,20260533,20260534,20260535,20260536,20260537,20260538,20260539,20260540,20260541,20260542,20260543,20260544,20260545,20260546,20260547,20260548,20260549,20260550 --days 365 --bots idle,retail-steady,advisor --output docs/balance/generated/rail-sweep
```

**Progression matrix (per factor, 200 progression + 200 idle-control runs):**

```bash
bun tests/balance/progressionRun.ts --seeds <same 50 seeds> --days 365 --output docs/balance/generated/rail-progression
```

**Scenario suite and affected E2E (committed k=10 tree only):**

```bash
bun run test:unit -- src/lib/scenarios/runtime.spec.ts --run
bunx playwright test src/routes/retail-sim.e2e.ts -g "player builds convenience production and refills from city inventory|rail-fed production connects two industrial buildings|challenge completes Two-City Supply Run|challenge fails at the deadline and shows objective evidence"
```

**Determinism:** the k=10 candidate sweep was run twice under **byte-identical
CLI arguments**; JSON and Markdown are byte-identical across the two runs
(`cmp` clean). Artifact SHA-256:

| artifact | SHA-256 |
| --- | --- |
| k=1 sweep JSON | `1e5db455efb75eb8a818f9c3e2ed57c064775a00470f89ee14682d7e24c804ca` |
| k=10 sweep JSON (both runs) | `4316864215fa3a071515deebf7d8acd5d48cca3065e96a4c620ac0eb50f36f6c` |
| regenerated HPA-502 after-sweep @ `0ce5db7e` | `c1b627bca4cbc5dff359ae7f599aa6e1107556cd269bc130a4aebc8761c1b426` |
| regenerated sweep @ `5a13a1e8` (HPA-502 tip) | `3cf0fbdf10fe235df27a5659c0a1779eaee738dc67e06bd4e5bdec951296e11e` |

Artifacts (git-ignored):
`.superpowers/sdd/2026-10-31-rail-throughput-balance/step6/evidence/` —
`sweep-k1.{json,md}`, `sweep-k10.{json,md}` + `sweep-k10-run1.{json,md}`,
`buckets-{k1,k10}.json`, `progression-{k1,k10}.json`,
`legacy-0ce5db7e-sweep.*`, `legacy-5a13a1e8-sweep.*`, and the comparison
outputs (`analyze-k1-vs-k10.txt`, `buckets-compare.txt`,
`progression-compare.txt`, `gate-eval-legacy-k1.txt`,
`legacy-*-vs-k1.diff.txt`).

## 2. Historical-comparison method (legacy projection)

The HPA-502 after-sweep JSON was **regenerated and hash-verified**: `git
archive 0ce5db7e` into a scratch snapshot inside the ignored plan workspace
(no branch/worktree, no checkout of real history, `node_modules` symlinked),
then the same sweep command. The output's SHA-256 equals the `c1b627bc…`
value documented in `after.md` — the regenerated file **is** the frozen
legacy per-run artifact, not an approximation.

Two schema-era comparisons were then computed field-by-field:

| comparison | result |
| --- | --- |
| new-schema k=1 control vs `5a13a1e8`-era sweep (legacy projection: drop the five Step-5 `advisorChain` fields) | **450/450 runs identical, 0 value mismatches** |
| new-schema k=1 control vs documented `0ce5db7e` artifact (additionally projects `operatingIncomeByDay`, `postRailObservedDays`, and the pre-`5a13a1e8` `localDeliveryUnits` definition) | 315/450 identical; **135 managed runs differ** — all HPA-502 *post-docs review fixes* landed between `0ce5db7e` and `5a13a1e8` (`e4a928f8` capped-availability yield, `cf79f5c0` staffing/forecast, `1c5244e9`, etc.). Deltas are small (e.g. cumulative import spend +38 on ~101k, cash ±100–300, missedDemandShare ~±0.0002); **no gate item flips**. |

**Disclosed consequence:** the current-HEAD k=1 control reproduces the
HPA-502 *branch-tip* measured economy exactly, and reproduces the *documented*
`after.md` economy modulo HPA-502's own post-docs review fixes — nothing in
HPA-318 or the HPA-679 implementation itself moved any shared measured field.
Raw cross-schema JSON bytes were never compared; every claim above projects
the legacy field set explicitly.

## 3. Non-advisor byte-identity (the control's validity check)

Per the plan: the 400 idle/retail-steady runs (no bot builds rail) were
compared run-object-by-run-object between the k=1 and k=10 sweep JSONs under
the identical new schema.

**Result: 400/400 byte-identical, zero mismatches.** Every Gate A input that
is not rail-adjacent is provably unchanged; all differences below are
confined to the 50 convenience/advisor runs.

## 4. Gate A repeat (HPA-502 5/5) — both factors

| # | item | k=1 control | k=10 candidate | rail-sensitive? |
| --- | --- | --- | --- | --- |
| 1 | viability (30d positive operating-income window ending ≤ day 90, retail-steady) | PASS — convenience 42/50 (84.0%), boutique 50/50, electronics 41/50 (82.0%), grocery 50/50 | **identical** | no — byte-identical inputs |
| 2 | boundedness (<1e9 on max \|cash\|, principal, cumulative imports, waste) | PASS — max \|cash\| 722,959; principal 14,000; imports 1,582,909; waste 5,336u/5,336 (seed 20260532 electronics/retail-steady worst) | **identical** | no |
| 3 | managed-vs-idle (days 61–90 operating income) | PASS — 200/200 pairs (50/50 each archetype) | **identical** | no |
| 4 | forecast ±25% of realized | PASS — 712/712/716 eligible (excl. 4 incomplete, 200 idle) | PASS — **714/714/717** eligible (excl. 3 incomplete, 200 idle) | yes — advisor openings only; detail below |
| 5 | advisor served-chain composite | PASS — 50/50; 50 construction-sequencing pauses days 18–29; 0 repeated unapplied | PASS — **identical shape** (50/50; same pause windows; 0 unapplied) | yes — see §5 |
| 6 | scenario guardrails | measured by scenario suite | **79/79 spec tests** — all 14 reference/no-action intents | yes — see §6 |

Gate-A item-level notes:

- **Forecast (item 4) is the only metric whose counts moved:** advisor store-3
  openings shifted earlier — seed 20260526 day 360→329 and 20260533 day
  357→328 now complete the 14-day observation window (+2 complete), and seed
  20260532 gained a store-3 opening day 357 (+1 eligible, still incomplete).
  Pass share stays 100%.
- **Advisor (item 5) legs are unchanged in verdict:** every run still builds
  producer day 1 / day 8, warehouse day 15, applies `connect-rail` days 22
  and 29 (`lastRailDay` uniformly 29 at both factors), produces with **0
  zero-output days after the last rail** over uniformly 336 post-rail
  observed days, delivers ≥1 local unit, and repeats 0 unapplied
  recommendations. What changed is delivery *volume* (§5), not the composite.
- **First positive 30-day windows (advisor runs, informational):** 42/50
  window values shifted — 38 keep the same window days with operating income
  ~$72–144 lower (the extra production operating cost is inside
  operatingIncome while operatingCashFlow rises ~$136–240 on the import
  savings), and 4 seeds' windows slide one day later (20260506, 20260508,
  20260544 end 56/57→57/58; one window start 28→29). All 50 still produce a
  positive 30-day window.

## 5. Advisor rail share and cost buckets

### 5.1 Local deliveries vs the three import denominators

| measure | k=1 | k=10 |
| --- | --- | --- |
| post-rail local bottled-water deliveries (summed over 50 advisor runs) | 16,800u (336/seed, uniform) | **168,000u (3,360/seed, uniform)** |
| retail imported units — all products, whole run | 4,018,937u | 3,874,400u (−144,537) |
| retail imported units — bottled water, whole run | 2,498,622u | 2,339,807u (−158,815) |
| retail imported units — bottled water, post-rail window | 2,380,054u | 2,221,239u (−158,815) |
| **local-to-all-import ratio** (historical-compatible: local / all-product imports) | 0.4180% | **4.3362%** |
| **matched post-rail bottled-water local fraction** (local / (local + post-rail water imports)) | 0.7009% | **7.0315%** |
| rail shipments (count / units) | 33,650 / 33,650u | 33,650 / **336,500u** |

Per-seed spread (all 50 advisor runs): `localDeliveryUnits` is uniform
3,360/seed (exactly the level-1 bottler's 10/day recipe over 336 post-rail
days — the chain is output-capped, not rail-capped, at k=10). Per-seed
local-to-all-import ratio **3.70%–5.78%** (median 4.28%); per-seed matched
water fraction **6.44%–11.11%** (median 6.69%). The named review seed
20260503 reproduces exactly: 336→3,360 local units, all-product imports
80,233→77,207, water imports 52,725→49,734, post-rail 50,317→47,326 —
byte-equal to the Step-0 probe values.

**Provisional ≥3% target: met on the aggregate and on every seed.** Note the
scope per the plan ruling: the ratio is post-rail local units over
*whole-run all-product imports* — an import-only denominator, never total
supply; the honest matched-window water fraction is 7.03%. Side effect worth
disclosing: non-water imports *rose* ~14.3k units at k=10 (all-product drop
144,537 < water drop 158,815); every produced unit is still consumed and no
run overflowed.

### 5.2 Cost buckets, same seed/window (50 advisor runs, summed)

| bucket (365d sum) | k=1 | k=10 | Δ |
| --- | --- | --- | --- |
| gross retail revenue | 26,804,152 | 26,868,228 | +64,076 |
| retail `importSpend` | 5,539,252 | 5,408,993 | −130,259 |
| industrial `importSpend` | 5,000 | 5,000 | 0 |
| `productionReport.operatingCost` | 272,700 | 339,900 | +67,200 |
| `productionReport.overflowCost` / units | 0 / 0u | 0 / 0u | 0 |
| payroll | 14,746,745 | 14,895,196 | +148,451 |
| operating income | −1,266,733 | −1,490,290 | −223,557 |
| interest accrued | 10,654 | 10,603 | −50 |
| end cash (sum of final-day cash) | −2,080,686 | −2,176,648 | −95,962 |
| end debt (outstanding principal) | 41,429 | 41,033 | −396 |
| first negative-cash day | identical on all 50 seeds | | |
| produced bottled water | 21,800u | 173,000u | +151,200 |
| warehouse-overflow cost | 0 | 0 | 0 |

### 5.3 Timing attribution — the review's F5 trap, at scale

End-cash deltas are **not** a clean rail-savings signal, and are decomposed
here exactly as the review required:

- **23/50 seeds: identical opening days.** Every one of them improves end
  cash by **+$1,548…+$1,681** (dominantly +$1,680) — the *isolated* rail
  economy effect: −$3,024 retail import spend vs +$1,344 production
  operating cost per seed (payroll Δ = 0). This is the "~+$1.7k" effect the
  review predicted, and it is **positive**, not a deficit.
- **27/50 seeds: store-3 opens earlier at k=10** (1–31 days; e.g. 20260503
  300→299, 20260517 143→119, 20260526 360→329), and **20260532 opens a
  store-3 that never existed at k=1** (day 357). Earlier openings add
  payroll days immediately (per-seed payroll deltas −8,393…+21,674;
  +$10–11k on the common −1-day cases like 20260503 +11,108), which swamps
  the +$1.7k: per-seed end-cash deltas on shifted seeds span
  **−32,376 (20260532, the new opening) to +8,043**. 36 seeds end better, 14
  worse; median Δ +1,680, mean Δ −1,919.
- Cause: the ~$3k/yr import saving lifts the cash trajectory just enough for
  the expansion playbook's cash-safety check to pass earlier — a real
  pacing side effect, priced here honestly. On the named review seed:
  end cash −35,970→−45,611 (−9,641) = payroll +11,108 (day-299 opening) +
  operating −12,670 vs import savings −3,061 — matching the review's
  day-299-vs-300 mechanism exactly.

### 5.4 Profitability verdict (volume, not assumed profit)

- **Import replacement vs production cost:** the extra 151,200 delivered
  local units displace 158,815 imported water units (−$130,259 net import
  spend after the +14.3k-unit non-water rise) against +$67,200 production
  operating cost — net external-spend effect ≈ **+$63k over 50 runs**, i.e.
  local supply is cheaper at the margin in this configuration.
- **But k=10 does not make the operation profitable:** median advisor end
  cash −46,386 → −46,750; aggregate operating income −1,266,733 → −1,490,290
  (driven by expansion timing + payroll, not by the chain itself; on
  unchanged-timing seeds the chain's operating-income delta is −$1,344/seed
  while operatingCashFlow improves). The ticket promised local-supply
  volume; it did not promise a profitable industry chain, and the measured
  deficit-vs-savings split is recorded here rather than inferred from end
  cash.

## 6. Scenario guardrails (14 intents) and affected E2E

`bun run test:unit -- src/lib/scenarios/runtime.spec.ts --run` → **79/79
pass** on the committed tree: all seven scenarios' reference traces stay
gold, all seven no-action traces stay below silver, and both no-action
failures fire on the authored `dayLimit` with `negative-cash` inactive (no
early runaway-overflow failure). The two Step-4 re-pins are load-bearing and
verified again here: local-lifeline reference completes day 8, score 1,000,
gold; two-city no-action fails at the day-21 deadline with **$0 overflow and
0 pushes** (the seeded-full warehouse blocks every push under the cap — vs
the k=1-era $2,100 trickle). Unrelated scenarios are unchanged.

Focused Playwright re-verification of the four rail-sensitive journeys →
**4/4 pass** (Two-City logistics-panel gold 960; local-lifeline deadline
journey; sandbox production-and-refill; rail-fed pull-producer journey with
`postRailImportedFlour = 0` and `Produced` status).

## 7. Progression matrix (hard pass + disclosed pacing shift)

50 seeds × 4 archetypes × {progression, idle} = 400 runs per factor.

**Hard gates (both factors):**
- idle: **200/200 zero-claim runs, 0 earned-unclaimed** (the control's real
  check), identical peak book value max 42,218.
- tier-1 non-decorative: idle peak 42,218 < 70,000 target at both factors.
- Every progression run's claims are contiguous, unique, in tier order with
  nondecreasing claim days at both factors (0 violations in 400 runs).
- Claim/save invariants unchanged — no claim-count anomalies.

**Per-tier claim distributions (reached runs; unreached reported
distinctly):**

| tier | reached k1→k10 | p10 | median | p90 | max |
| --- | --- | --- | --- | --- | --- |
| local-shop | 184/200 → 184/200 | 30 → 30 | 56.5 → 56.5 | 240 → 238.7 | 360 → 358 |
| neighborhood-chain | 161/200 → **163/200** | 43 → 43 | 50 → 52 | 295 → 267 | 358 → 358 |
| regional-supplier | 61/200 → **63/200** | 85 → 85 | 204 → 204 | 330 → 328.6 | 358 → 358 |
| multi-city-operator | 0/200 → 0/200 (never claimed) | — | — | — | — |
| market-leader | 0/200 → 0/200 (never claimed) | — | — | — | — |

Never-claimed by archetype: local-shop convenience 16 (unchanged);
neighborhood-chain convenience 35→33, grocery 4→4; regional-supplier
convenience 35→33, boutique 50→50, electronics 50→50, grocery 4→4; tiers 4–5
never claimed by any run at either factor (365-day ceiling, unchanged).

**Disclosed pacing shift (for reviewer accept/reject):** 48/200 runs have
claim-day differences — small (mostly ±1–30 days), bidirectional, and
explainable: `finalLocalUnits` rises 336→3,360 (convenience) / 2,760
(grocery) at k=10, so tier-2/3 goals fed by local deliveries land slightly
earlier where the run was near the boundary (four runs gain
neighborhood-chain + regional-supplier: 20260501-grocery@232,
20260502-convenience@239, 20260504-convenience@260,
20260516-convenience@281), while two runs lose them because store-3 pacing
shifted their book-value/store goals differently
(20260538-grocery, 20260550-convenience). Credit usage is materially
unchanged (2,144→2,142 borrows; $26.78M→$26.73M). No progression threshold,
goal, or bot policy was touched — the shift is a downstream read of the
same authored ladder under more local units.

## 8. Limitations and disclosures

1. The frozen `0ce5db7e` artifact predates HPA-502's own post-docs review
   fixes; comparisons to `after.md`'s documented numbers use it, while the
   authoritative same-schema control is the HEAD k=1 run (identical to the
   `5a13a1e8`-era economy on every shared field).
2. `localDeliveryUnits` changed definition at `5a13a1e8` (all-products
   whole-run → bottled-water post-rail); measured values coincide on this
   matrix (only post-rail bottled water is ever delivered), so projected
   comparisons remain valid and are labeled.
3. The import denominator is import-only; neither ratio claims a share of
   total supply. The 3% bar is provisional for that single definition.
4. Advisor findings are one chain shape (convenience bottled water on the
   authored advisor policy): an output-capped level-1 chain where k=10
   saturates the recipe. The +$1,680/seed margin effect is measured, not
   extrapolated to other chains.
5. End-cash deltas are reported with timing attribution per F5; no profit
   claim was inferred from them.
6. Progression pacing deltas are recorded for independent reviewer
   acceptance; no thresholds or bots were retuned, and tiers 4–5 remain
   unreached at both factors under the 365-day matrix.
