# HPA-502 baseline report (Gate A)

**Status: measured only.** This baseline captures the economy exactly as it stood after Tasks 1–3 of the balance-harness plan. **No economic tuning has been applied before or within this baseline**, and none may start until a human approves Gate A in this PR.

- Branch: `hpa-502-balance-harness-plan`, re-measured after the PR-review delegation-scope fix (see disclosure below).
- **Disclosure (required):** the rail planner *correctness* fix (Task 1, commit `ce28bb9` — connect-rail advice grounded in a concrete missing rail edge) landed **before** this baseline. The measured economy is otherwise untouched; advisor results below are measured on the repaired planner, and must not be compared against an unrepaired planner without labeling that difference.
- **Disclosure (bot fix):** the retail-steady/advisor `protect-availability` delegation originally used founding-store scope, so stores opened by the expansion playbook never entered the manager's target set. The delegation now uses **city scope** (`tests/balance/bots.ts`), covering all same-city stores. This baseline was regenerated on the corrected bot and supersedes the earlier store-scope sweep from this PR's history; idle runs are unchanged (idle takes no actions), but every managed metric moved.
- **Disclosure (review fixes):** this baseline was re-measured after three PR-review correctness fixes — the rail planner now excludes warehouses a producer already reaches when naming a missing rail edge (`src/lib/game/supplyPlanner.ts`), and the advisor bot executes the exact tile the planner evaluated instead of the lowest-id legal tile (`tests/balance/bots.ts`; `build-producer`/`build-warehouse` actions now carry `tileId`). The regenerated 450-run output is byte-identical to the prior baseline except the now-executable regenerate command, confirming these fixes do not shift the measured economy.
- Sweep: 50 explicit seeds × 365 days × (4 archetypes × {idle, retail-steady} + convenience × advisor) = **450 runs** (seeds `20260501`–`20260550`, includes the mandated `20260503`).
- Artifacts: the verbose JSON stays local under `docs/balance/generated/` (git-ignored); only this curated `baseline.md` is committed. The full generated Markdown (config, aggregates, all 450 per-run rows, and the complete exception list) is embedded below verbatim.

## Seeds, bots, and reproduction

- **Seeds (50, deterministic, ascending):** `20260501` through `20260550` inclusive (consecutive integers; `20260503` included as required). Ordering of runs: seed ascending, then archetype (`convenience < boutique < electronics < grocery`), then bot (`idle < retail-steady < advisor`).
- **Bot definitions** (all actions go through real engine transitions — `applyGameCommand`, `setManagerDelegation`, `buildRailPreview`):
  - `idle`: takes no actions; only the daily `advanceDay` tick runs (comparative negative control, not a bankruptcy deadline).
  - `retail-steady`: delegates `protect-availability` (city scope, so expansion stores stay managed) to the first eligible manager, hires/assigns staff to cover every store shortage, and opens the best legal, cash-safe tile while under the store cap.
  - `advisor` (convenience only): retail-steady plus the supply planner's recommendation every 7 in-game days, executed through `applyGameCommand` / `buildRailPreview` (build producer or warehouse, upgrade building, connect rail).
- **Regenerate the JSON + Markdown artifacts:**
  `bun tests/balance/run.ts --seeds 20260501,20260502,20260503,20260504,20260505,20260506,20260507,20260508,20260509,20260510,20260511,20260512,20260513,20260514,20260515,20260516,20260517,20260518,20260519,20260520,20260521,20260522,20260523,20260524,20260525,20260526,20260527,20260528,20260529,20260530,20260531,20260532,20260533,20260534,20260535,20260536,20260537,20260538,20260539,20260540,20260541,20260542,20260543,20260544,20260545,20260546,20260547,20260548,20260549,20260550 --days 365 --bots idle,retail-steady,advisor --output docs/balance/generated/balance-sweep`
  (seed list is `20260501`–`20260550`; measured wall-clock ≈ 3 min). Determinism is asserted by spec (`tests/balance/measure.spec.ts`: same seed/config serializes byte-identically).

## Headline measured results (medians across 50 seeds)

| archetype | bot | positive 7d / 30d window by d365 | first negative-cash day (median) | cash d30 | cash d90 | cash d365 | missed demand | stockout share | forecast error (median) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| convenience | idle | 0/50, 0/50 | day 63 | 16,378 | −12,620 | −131,580 | 90.0% | 71.2% | −98.3% |
| convenience | retail-steady | 0/50, 0/50 | day 21 | −20,045 | −862,797 | ≈ −3.5e16 | 26.9% | 2.8% | −97.6% |
| convenience | advisor | 0/50, 0/50 | day 20–21 | −22,523 | −866,173 | ≈ −3.5e16 | 26.9% | 2.8% | −97.6% |
| boutique | idle | 50/50, 0/50 | day 120 | 28,740 | 4,952 | −78,962 | 90.0% | 71.5% | −77.3% |
| boutique | retail-steady | 50/50, 50/50 | day 21 | −25,003 | 9,703 | 239,456 | 5.4% | 3.4% | −65.1% |
| electronics | idle | 21/50, 0/50 | day 91 | 33,530 | 1,982 | −100,596 | 80.2% | 71.2% | −70.7% |
| electronics | retail-steady | 50/50, 0/50 | day 7 | −32,824 | −38,649 | −125,082 | 2.1% | 1.6% | −59.7% |
| grocery | idle | 0/50, 0/50 | day 60 | 17,234 | −28,032 | −211,004 | 90.1% | 71.5% | −97.9% |
| grocery | retail-steady | 0/50, 0/50 | day 30 | −25,339 | −257,825 | ≈ −3.2e16 | 38.4% | 26.3% | −97.0% |

Negative forecast error = the opening forecast **overestimates** the store's realized first-14-day mean revenue.

## Measured anomalies (engine-side, for Gate A triage — not fixed here)

1. **Debt-interest snowball (convenience retail-steady + advisor, 43/50 runs; grocery retail-steady, 31/50):** cash collapses to ≈ −3.5e16 (convenience median) / ≈ −3.2e16 (grocery median) by day 365 — roughly double the magnitude measured under the store-scoped delegation, consistent with the unbounded inventory-target compounding now applying to both stores' import spend. Suggests capitalized/compounding interest on unrecoverable negative cash is numerically unbounded.
2. **Grocery waste explosion (31/50 retail-steady runs — the same runs that snowball into debt):** cumulative `wasteUnits` reach ≈ 1.0e16 (median of exploded runs) up to 1.9e16; the other 19 runs waste nothing. A stock/waste-path numeric blowup, not a measurement artifact (values are summed straight from `DailyProductReport.wasteUnits`).
3. **Convenience advisor production stall (50/50 runs):** total industrial output is zero from **day 18 through day 365 in every run** after the advisor's applied producer build (buffer-full/missing-sink shape; no repeated advisor no-op recommendations — the planner keeps proposing, output stays zero). Unchanged by the delegation fix — it is industry-side.
4. **Inverted idle control (now partial):** boutique retail-steady beats idle outright — positive 30-day operating-income windows in 50/50 runs and median +2.4e5 cash at d365 vs −7.9e4 idle — and electronics is near parity (−1.3e5 managed vs −1.0e5 idle, all 50 runs bounded). Convenience and grocery managed runs still collapse into the snowball far below idle, and first-negative-cash day remains earlier under management everywhere (day 7–30 vs 60–120) because expansion spends first.

## Measurement limitations

- Producer-stall detection aggregates `productionReport.produced` per city per day, counted from the first applied producer build; a partial stall beside a still-producing building is invisible at this level.
- Store levels at checkpoints come from the opening ledger; harness bots never upgrade stores, so levels are always 1 at opening and thereafter.
- Runs are single-process sequential; wall-clock ≈ 3 min for the default sweep (no timing data is written to artifacts).

---

<!-- Everything below this line is the deterministic CLI-generated sweep report (docs/balance/generated/balance-sweep.md). -->
# HPA-502 balance sweep

- Seeds (50): 20260501, 20260502, 20260503, 20260504, 20260505, 20260506, 20260507, 20260508, 20260509, 20260510, 20260511, 20260512, 20260513, 20260514, 20260515, 20260516, 20260517, 20260518, 20260519, 20260520, 20260521, 20260522, 20260523, 20260524, 20260525, 20260526, 20260527, 20260528, 20260529, 20260530, 20260531, 20260532, 20260533, 20260534, 20260535, 20260536, 20260537, 20260538, 20260539, 20260540, 20260541, 20260542, 20260543, 20260544, 20260545, 20260546, 20260547, 20260548, 20260549, 20260550
- Days per run: 365
- Ordering: seed, then archetype (convenience < boutique < electronics < grocery), then bot (idle < retail-steady < advisor).
- Regenerate JSON/Markdown: `bun tests/balance/run.ts --seeds 20260501,20260502,20260503,20260504,20260505,20260506,20260507,20260508,20260509,20260510,20260511,20260512,20260513,20260514,20260515,20260516,20260517,20260518,20260519,20260520,20260521,20260522,20260523,20260524,20260525,20260526,20260527,20260528,20260529,20260530,20260531,20260532,20260533,20260534,20260535,20260536,20260537,20260538,20260539,20260540,20260541,20260542,20260543,20260544,20260545,20260546,20260547,20260548,20260549,20260550 --days 365 --bots idle,retail-steady,advisor --output docs/balance/generated/balance-sweep`
- Bot: idle: takes no actions; only the daily advanceDay tick runs (negative control).
- Bot: retail-steady: delegates protect-availability (city scope, so expansion stores stay managed) to the first eligible manager, hires/assigns to cover every staffing shortage, and opens the best legal affordable tile while under the store cap.
- Bot: advisor (convenience only): retail-steady plus the supply planner recommendation every 7 in-game days, executed through applyGameCommand / buildRailPreview (build producer or warehouse, upgrade building, connect rail).
- Disclosure: the rail planner correctness fix (HPA-502 Task 1, connect-rail advice grounded in a concrete missing rail edge) landed BEFORE this baseline. The measured economy is otherwise untouched; advisor results are measured on the repaired planner.

## Per-archetype × bot aggregates

| archetype | bot | runs | positive 30d window by day 365 | first negative cash day | forecast within ±25% / complete / openings | stalls ≥7d | repeated advisor no-ops |
| --- | --- | --- | --- | --- | --- | --- | --- |
| convenience | idle | 50 | 0/50 | 50/50 | 0/50/50 -98.3% | 0 | 0 |
| convenience | retail-steady | 50 | 0/50 | 50/50 | 0/100/100 -97.6% | 0 | 0 |
| convenience | advisor | 50 | 0/50 | 50/50 | 0/100/100 -97.6% | 50 | 0 |
| boutique | idle | 50 | 0/50 | 50/50 | 0/50/50 -77.3% | 0 | 0 |
| boutique | retail-steady | 50 | 50/50 | 50/50 | 0/150/150 -65.1% | 0 | 0 |
| electronics | idle | 50 | 0/50 | 50/50 | 0/50/50 -70.7% | 0 | 0 |
| electronics | retail-steady | 50 | 0/50 | 50/50 | 0/150/150 -59.7% | 0 | 0 |
| grocery | idle | 50 | 0/50 | 50/50 | 0/50/50 -97.9% | 0 | 0 |
| grocery | retail-steady | 50 | 0/50 | 50/50 | 0/100/100 -97.0% | 0 | 0 |

## Per-run results

| seed | archetype | bot | pos7 | pos30 | negCash | minCash (day) | d30 cash | d90 cash | d365 cash | missed | stockout | waste | forecast in±25% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 20260501 | convenience | idle | - | - | 65 | -129266 (365) | 16583 | -12146 | -129266 | 90.0% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260501 | convenience | retail-steady | - | - | 21 | -35082390868658744 (365) | -21223 | -1233180 | -35082390868658744 | 29.6% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260501 | convenience | advisor | - | - | 20 | -35082390868666044 (365) | -23812 | -1236609 | -35082390868666044 | 29.6% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260501 | boutique | idle | 2-8 | - | 120 | -79490 (364) | 28860 | 5314 | -77566 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.1% |
| 20260501 | boutique | retail-steady | 2-8 | 11-40 | 21 | -36358 (35) | -20058 | 11614 | 244745 | 5.4% | 3.2% | 0u/0 | 0/3/3 -65.3% |
| 20260501 | electronics | idle | 16-22 | - | 91 | -101596 (364) | 33652 | 2344 | -99126 | 79.8% | 71.2% | 0u/0 | 0/1/1 -70.4% |
| 20260501 | electronics | retail-steady | 4-10 | - | 7 | -130356 (364) | -33209 | -38891 | -126546 | 2.1% | 1.8% | 0u/0 | 0/3/3 -60.1% |
| 20260501 | grocery | idle | - | - | 60 | -211586 (365) | 17187 | -28173 | -211586 | 80.7% | 71.2% | 0u/0 | 0/1/1 -97.7% |
| 20260501 | grocery | retail-steady | - | - | 30 | -442031 (365) | -26005 | -100789 | -442031 | 3.1% | 2.3% | 0u/0 | 0/2/2 -97.0% |
| 20260502 | convenience | idle | - | - | 60 | -135960 (364) | 16012 | -13716 | -135951 | 90.0% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260502 | convenience | retail-steady | - | - | 21 | -35082390868664810 (365) | -21373 | -912694 | -35082390868664810 | 29.5% | 2.5% | 0u/0 | 0/2/2 -97.6% |
| 20260502 | convenience | advisor | - | - | 17 | -35082390868671990 (365) | -23857 | -916018 | -35082390868671990 | 29.5% | 2.5% | 0u/0 | 0/2/2 -97.6% |
| 20260502 | boutique | idle | 2-8 | - | 120 | -86306 (364) | 28292 | 3610 | -84230 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260502 | boutique | retail-steady | 2-8 | 8-37 | 21 | -24915 (35) | -24579 | 6495 | 243359 | 5.4% | 3.3% | 0u/0 | 0/3/3 -64.5% |
| 20260502 | electronics | idle | - | - | 91 | -108412 (364) | 33084 | 640 | -105750 | 80.5% | 71.2% | 0u/0 | 0/1/1 -70.7% |
| 20260502 | electronics | retail-steady | 4-10 | - | 7 | -113210 (364) | -31868 | -35248 | -109352 | 2.2% | 1.7% | 0u/0 | 0/3/3 -58.6% |
| 20260502 | grocery | idle | - | - | 60 | -217786 (364) | 16669 | -29727 | -217774 | 80.8% | 71.2% | 0u/0 | 0/1/1 -97.8% |
| 20260502 | grocery | retail-steady | - | - | 30 | -439458 (365) | -25825 | -100183 | -439458 | 3.2% | 2.3% | 0u/0 | 0/2/2 -97.0% |
| 20260503 | convenience | idle | - | - | 65 | -128678 (365) | 16643 | -12083 | -128678 | 90.1% | 64.4% | 0u/0 | 0/1/1 -98.3% |
| 20260503 | convenience | retail-steady | - | - | 21 | -35082390868657164 (365) | -21463 | -1288685 | -35082390868657164 | 31.2% | 2.6% | 0u/0 | 0/2/2 -97.5% |
| 20260503 | convenience | advisor | - | - | 16 | -35082390868664196 (365) | -23834 | -1291896 | -35082390868664196 | 31.2% | 2.6% | 0u/0 | 0/2/2 -97.5% |
| 20260503 | boutique | idle | 2-8 | - | 120 | -78710 (364) | 28925 | 5509 | -76862 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260503 | boutique | retail-steady | 2-8 | 8-37 | 21 | -28501 (35) | -25393 | 5923 | 232954 | 5.3% | 3.3% | 0u/0 | 0/3/3 -65.2% |
| 20260503 | electronics | idle | 9-15 | - | 91 | -100816 (364) | 33717 | 2539 | -98442 | 80.8% | 71.2% | 0u/0 | 0/1/1 -70.6% |
| 20260503 | electronics | retail-steady | 4-10 | - | 7 | -111491 (364) | -33065 | -36197 | -107537 | 2.3% | 1.6% | 0u/0 | 0/3/3 -59.3% |
| 20260503 | grocery | idle | - | - | 60 | -209618 (365) | 17352 | -27678 | -209618 | 80.6% | 71.2% | 0u/0 | 0/1/1 -97.9% |
| 20260503 | grocery | retail-steady | - | - | 30 | -437773 (365) | -25731 | -99803 | -437773 | 3.1% | 2.3% | 0u/0 | 0/2/2 -97.2% |
| 20260504 | convenience | idle | - | - | 65 | -129431 (364) | 16574 | -12245 | -129362 | 90.0% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260504 | convenience | retail-steady | - | - | 21 | -17541195434460018 (364) | -19168 | -674685 | -17541195434460008 | 18.6% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260504 | convenience | advisor | - | - | 21 | -17541195434467152 (365) | -21611 | -677968 | -17541195434467152 | 18.6% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260504 | boutique | idle | 2-8 | - | 120 | -79514 (364) | 28858 | 5308 | -77362 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260504 | boutique | retail-steady | 2-8 | 8-37 | 21 | -30696 (35) | -25132 | 15101 | 192424 | 6.6% | 4.4% | 0u/0 | 0/3/3 -65.6% |
| 20260504 | electronics | idle | 73-79 | - | 91 | -101620 (364) | 33266 | 2338 | -99774 | 70.0% | 59.5% | 0u/0 | 0/1/1 -70.7% |
| 20260504 | electronics | retail-steady | 5-11 | - | 7 | -241706 (364) | -34733 | -63195 | -239096 | 1.5% | 1.0% | 0u/0 | 0/3/3 -61.8% |
| 20260504 | grocery | idle | - | - | 60 | -209782 (364) | 17336 | -27726 | -209766 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.8% |
| 20260504 | grocery | retail-steady | - | - | 30 | -41216182518834590 (364) | -25013 | -358079 | -41216182518834580 | 39.0% | 27.1% | 9978000637471822u/19956001274943644 | 0/2/2 -97.0% |
| 20260505 | convenience | idle | - | - | 60 | -136083 (365) | 16003 | -13743 | -136083 | 90.1% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260505 | convenience | retail-steady | - | - | 21 | -35082390868659212 (365) | -20736 | -855437 | -35082390868659212 | 24.6% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260505 | convenience | advisor | - | - | 20 | -35082390868666540 (365) | -23364 | -858905 | -35082390868666540 | 24.6% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260505 | boutique | idle | 2-8 | - | 120 | -86330 (364) | 28290 | 3604 | -84330 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260505 | boutique | retail-steady | 2-8 | 12-41 | 21 | -38786 (35) | -21156 | 10973 | 234257 | 5.7% | 3.5% | 0u/0 | 0/3/3 -65.1% |
| 20260505 | electronics | idle | - | - | 91 | -108436 (364) | 33082 | 634 | -105870 | 81.9% | 71.2% | 0u/0 | 0/1/1 -70.6% |
| 20260505 | electronics | retail-steady | 4-10 | - | 7 | -112921 (364) | -32782 | -37056 | -109063 | 2.3% | 1.6% | 0u/0 | 0/3/3 -58.6% |
| 20260505 | grocery | idle | - | - | 60 | -215998 (364) | 16818 | -29280 | -215990 | 80.7% | 71.2% | 0u/0 | 0/1/1 -97.9% |
| 20260505 | grocery | retail-steady | - | - | 30 | -444812 (365) | -26238 | -101434 | -444812 | 3.1% | 2.3% | 0u/0 | 0/2/2 -97.1% |
| 20260506 | convenience | idle | - | - | 65 | -128762 (365) | 16634 | -12089 | -128762 | 90.1% | 63.0% | 0u/0 | 0/1/1 -98.3% |
| 20260506 | convenience | retail-steady | - | - | 21 | -35082390868653984 (365) | -20791 | -1287510 | -35082390868653984 | 30.6% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260506 | convenience | advisor | - | - | 21 | -35082390868661320 (365) | -23419 | -1290978 | -35082390868661320 | 30.6% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260506 | boutique | idle | 2-8 | - | 120 | -78734 (364) | 28923 | 5503 | -77000 | 80.7% | 71.2% | 0u/0 | 0/1/1 -77.3% |
| 20260506 | boutique | retail-steady | 2-8 | 41-70 | 21 | -42456 (60) | -31098 | -36372 | -6479 | 4.7% | 3.2% | 0u/0 | 0/3/3 -66.6% |
| 20260506 | electronics | idle | - | - | 91 | -100840 (364) | 33715 | 2533 | -98610 | 80.5% | 71.2% | 0u/0 | 0/1/1 -70.7% |
| 20260506 | electronics | retail-steady | 4-10 | - | 7 | -119942 (364) | -32085 | -36667 | -116084 | 2.1% | 1.6% | 0u/0 | 0/3/3 -58.9% |
| 20260506 | grocery | idle | - | - | 60 | -207814 (365) | 17502 | -27228 | -207814 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.9% |
| 20260506 | grocery | retail-steady | - | - | 30 | -71579080739784696 (365) | -25198 | -429338 | -71579080739784696 | 42.3% | 27.7% | 14624107486333842u/29248214972667684 | 0/2/2 -97.0% |
| 20260507 | convenience | idle | - | - | 60 | -135339 (365) | 16064 | -13560 | -135339 | 90.1% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260507 | convenience | retail-steady | - | - | 28 | -35082390868658784 (365) | -20107 | -889189 | -35082390868658784 | 29.2% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260507 | convenience | advisor | - | - | 21 | -35082390868665840 (365) | -22488 | -892410 | -35082390868665840 | 29.2% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260507 | boutique | idle | 2-8 | - | 120 | -85538 (364) | 28356 | 3802 | -83424 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.2% |
| 20260507 | boutique | retail-steady | 2-8 | 6-35 | 14 | -25260 (30) | -25260 | 27654 | 251036 | 4.7% | 3.2% | 0u/0 | 0/3/3 -63.9% |
| 20260507 | electronics | idle | - | - | 91 | -107644 (364) | 33148 | 832 | -104934 | 81.8% | 71.2% | 0u/0 | 0/1/1 -70.6% |
| 20260507 | electronics | retail-steady | 4-10 | - | 7 | -106529 (364) | -31743 | -34668 | -102431 | 2.3% | 1.7% | 0u/0 | 0/3/3 -58.6% |
| 20260507 | grocery | idle | - | - | 60 | -213994 (364) | 16985 | -28779 | -213986 | 80.9% | 71.2% | 0u/0 | 0/1/1 -97.8% |
| 20260507 | grocery | retail-steady | - | - | 30 | -447360 (365) | -25717 | -101457 | -447360 | 3.1% | 2.5% | 0u/0 | 0/2/2 -97.0% |
| 20260508 | convenience | idle | - | - | 65 | -128149 (365) | 16695 | -12040 | -128149 | 90.1% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260508 | convenience | retail-steady | - | - | 21 | -35082390868649396 (365) | -20096 | -1124353 | -35082390868649396 | 26.3% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260508 | convenience | advisor | - | - | 19 | -35082390868656724 (365) | -22724 | -1127821 | -35082390868656724 | 26.3% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260508 | boutique | idle | 2-8 | - | 120 | -77942 (364) | 28989 | 5701 | -76094 | 82.2% | 71.2% | 0u/0 | 0/1/1 -77.3% |
| 20260508 | boutique | retail-steady | 2-8 | 38-67 | 21 | -39325 (60) | -30946 | -32574 | 31499 | 4.3% | 2.8% | 0u/0 | 0/3/3 -65.8% |
| 20260508 | electronics | idle | - | - | 91 | -100048 (364) | 33781 | 2731 | -97674 | 81.3% | 71.2% | 0u/0 | 0/1/1 -70.6% |
| 20260508 | electronics | retail-steady | 4-10 | - | 7 | -97618 (364) | -31907 | -33042 | -93616 | 2.3% | 1.7% | 0u/0 | 0/3/3 -58.5% |
| 20260508 | grocery | idle | - | - | 60 | -205798 (364) | 17668 | -26730 | -205798 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.8% |
| 20260508 | grocery | retail-steady | - | - | 30 | -54518466396604990 (364) | -24829 | -299075 | -54518466396604990 | 39.9% | 26.6% | 7511982971740512u/15023965943481024 | 0/2/2 -96.9% |
| 20260509 | convenience | idle | - | - | 61 | -134616 (364) | 16124 | -13380 | -134604 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260509 | convenience | retail-steady | - | - | 21 | -35082390868655764 (365) | -19930 | -795133 | -35082390868655764 | 26.9% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260509 | convenience | advisor | - | - | 19 | -35082390868663080 (365) | -22558 | -798601 | -35082390868663080 | 26.9% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260509 | boutique | idle | 2-8 | - | 120 | -84758 (364) | 28421 | 3997 | -82606 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.4% |
| 20260509 | boutique | retail-steady | 2-8 | 8-37 | 21 | -29987 (35) | -24303 | 6827 | 239747 | 5.6% | 3.6% | 0u/0 | 0/3/3 -65.7% |
| 20260509 | electronics | idle | - | - | 91 | -106864 (364) | 33213 | 1027 | -104970 | 72.0% | 69.6% | 0u/0 | 0/1/1 -70.8% |
| 20260509 | electronics | retail-steady | 5-11 | - | 7 | -227360 (364) | -34274 | -59190 | -224606 | 1.7% | 1.1% | 0u/0 | 0/3/3 -61.6% |
| 20260509 | grocery | idle | - | - | 60 | -212002 (364) | 17151 | -28281 | -211994 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.9% |
| 20260509 | grocery | retail-steady | - | - | 30 | -36917609083783970 (364) | -25394 | -266544 | -36917609083783960 | 39.4% | 26.8% | 7290408181620470u/14580816363240940 | 0/2/2 -97.0% |
| 20260510 | convenience | idle | - | - | 60 | -135459 (365) | 16055 | -13587 | -135459 | 90.0% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260510 | convenience | retail-steady | - | - | 21 | -35082390868663590 (365) | -20681 | -870948 | -35082390868663590 | 27.2% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260510 | convenience | advisor | - | - | 21 | -35082390868670904 (365) | -23309 | -874416 | -35082390868670904 | 27.2% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260510 | boutique | idle | 2-8 | - | 120 | -85562 (364) | 28354 | 3796 | -83638 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.5% |
| 20260510 | boutique | retail-steady | 2-8 | 11-40 | 21 | -37291 (35) | -22785 | 7855 | 207977 | 6.2% | 3.8% | 0u/0 | 0/3/3 -65.3% |
| 20260510 | electronics | idle | 163-169 | - | 91 | -107668 (364) | 33146 | 826 | -105582 | 74.0% | 71.2% | 0u/0 | 0/1/1 -70.9% |
| 20260510 | electronics | retail-steady | 5-11 | - | 7 | -222936 (364) | -35413 | -59575 | -219990 | 1.8% | 1.2% | 0u/0 | 0/3/3 -61.7% |
| 20260510 | grocery | idle | - | - | 60 | -218218 (364) | 16633 | -29835 | -218218 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.0% |
| 20260510 | grocery | retail-steady | - | - | 30 | -59712747085761130 (365) | -25511 | -336003 | -59712747085761130 | 42.2% | 26.8% | 10326167655224072u/20652335310448144 | 0/2/2 -97.2% |
| 20260511 | convenience | idle | - | - | 65 | -128248 (365) | 16674 | -12031 | -128248 | 78.1% | 58.1% | 0u/0 | 0/1/1 -98.3% |
| 20260511 | convenience | retail-steady | - | - | 23 | -284307 (365) | -17830 | -65327 | -284307 | 2.5% | 2.3% | 0u/0 | 0/2/2 -97.7% |
| 20260511 | convenience | advisor | - | - | 16 | -291424 (365) | -20257 | -68594 | -291424 | 2.5% | 2.3% | 0u/0 | 0/2/2 -97.7% |
| 20260511 | boutique | idle | 2-8 | - | 120 | -77954 (364) | 28988 | 5698 | -76144 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.2% |
| 20260511 | boutique | retail-steady | 2-8 | 8-37 | 21 | -35044 (35) | -20794 | 11286 | 233383 | 6.3% | 4.0% | 0u/0 | 0/3/3 -65.1% |
| 20260511 | electronics | idle | - | - | 91 | -100060 (364) | 33780 | 2728 | -97734 | 80.8% | 71.2% | 0u/0 | 0/1/1 -70.6% |
| 20260511 | electronics | retail-steady | 4-10 | - | 7 | -116960 (364) | -32375 | -36861 | -113246 | 2.2% | 1.6% | 0u/0 | 0/3/3 -58.6% |
| 20260511 | grocery | idle | - | - | 60 | -210022 (365) | 17317 | -27783 | -210022 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.8% |
| 20260511 | grocery | retail-steady | - | - | 30 | -68496646643788160 (365) | -26009 | -418961 | -68496646643788160 | 42.1% | 27.0% | 13339121221609010u/26678242443218020 | 0/2/2 -97.0% |
| 20260512 | convenience | idle | - | - | 61 | -134727 (365) | 16115 | -13407 | -134727 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260512 | convenience | retail-steady | - | - | 21 | -35082390868662596 (365) | -20336 | -796946 | -35082390868662596 | 29.6% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260512 | convenience | advisor | - | - | 18 | -35082390868669920 (365) | -22964 | -800414 | -35082390868669920 | 29.6% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260512 | boutique | idle | 2-8 | - | 120 | -84782 (364) | 28419 | 3991 | -82744 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.2% |
| 20260512 | boutique | retail-steady | 2-8 | 8-37 | 21 | -27245 (35) | -25621 | 4942 | 243316 | 5.4% | 3.3% | 0u/0 | 0/3/3 -65.2% |
| 20260512 | electronics | idle | - | - | 91 | -106888 (364) | 33211 | 1021 | -104274 | 81.1% | 71.2% | 0u/0 | 0/1/1 -70.5% |
| 20260512 | electronics | retail-steady | 4-10 | - | 7 | -114310 (364) | -32120 | -36108 | -110356 | 2.1% | 1.7% | 0u/0 | 0/3/3 -58.4% |
| 20260512 | grocery | idle | - | - | 60 | -216226 (364) | 16799 | -29337 | -216222 | 81.3% | 71.2% | 0u/0 | 0/1/1 -97.8% |
| 20260512 | grocery | retail-steady | - | - | 30 | -446569 (365) | -26423 | -101913 | -446569 | 3.2% | 2.5% | 0u/0 | 0/2/2 -97.1% |
| 20260513 | convenience | idle | - | - | 65 | -127645 (365) | 16746 | -11995 | -127645 | 82.0% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260513 | convenience | retail-steady | - | - | 23 | -33874723 (365) | -17632 | -68418 | -33874723 | 3.9% | 2.7% | 0u/0 | 0/2/2 -97.7% |
| 20260513 | convenience | advisor | - | - | 18 | -33881786 (365) | -20005 | -71631 | -33881786 | 3.9% | 2.7% | 0u/0 | 0/2/2 -97.7% |
| 20260513 | boutique | idle | 2-8 | - | 120 | -77174 (364) | 29053 | 5893 | -75212 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260513 | boutique | retail-steady | 2-8 | 8-37 | 21 | -28082 (35) | -25088 | 7122 | 224043 | 6.2% | 4.0% | 0u/0 | 0/3/3 -64.9% |
| 20260513 | electronics | idle | - | - | 91 | -99280 (364) | 33845 | 2923 | -96762 | 81.5% | 71.2% | 0u/0 | 0/1/1 -70.7% |
| 20260513 | electronics | retail-steady | 4-10 | - | 7 | -102314 (364) | -32701 | -34203 | -98456 | 2.3% | 1.8% | 0u/0 | 0/3/3 -58.7% |
| 20260513 | grocery | idle | - | - | 60 | -208026 (365) | 17483 | -27285 | -208026 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.0% |
| 20260513 | grocery | retail-steady | - | - | 30 | -64213202633021880 (365) | -25671 | -419347 | -64213202633021880 | 41.0% | 27.0% | 12494662865377616u/24989325730755230 | 0/2/2 -97.1% |
| 20260514 | convenience | idle | - | - | 61 | -133992 (364) | 16176 | -13224 | -133992 | 90.0% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260514 | convenience | retail-steady | - | - | 21 | -35082390868660572 (365) | -20788 | -890119 | -35082390868660572 | 29.6% | 2.6% | 0u/0 | 0/2/2 -97.6% |
| 20260514 | convenience | advisor | - | - | 19 | -35082390868667904 (365) | -23416 | -893587 | -35082390868667904 | 29.6% | 2.6% | 0u/0 | 0/2/2 -97.6% |
| 20260514 | boutique | idle | 2-8 | - | 120 | -83990 (364) | 28485 | 4189 | -81990 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.2% |
| 20260514 | boutique | retail-steady | 2-8 | 8-37 | 21 | -26676 (30) | -26676 | 4778 | 216088 | 6.0% | 3.7% | 0u/0 | 0/3/3 -65.4% |
| 20260514 | electronics | idle | - | - | 91 | -106096 (364) | 33133 | 1219 | -104106 | 70.4% | 61.1% | 0u/0 | 0/1/1 -70.6% |
| 20260514 | electronics | retail-steady | 5-11 | - | 7 | -248131 (364) | -35037 | -63937 | -245329 | 1.4% | 1.1% | 0u/0 | 0/3/3 -61.5% |
| 20260514 | grocery | idle | - | - | 60 | -214234 (364) | 16965 | -28839 | -214234 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.0% |
| 20260514 | grocery | retail-steady | - | - | 30 | -47400323244530370 (365) | -25782 | -414104 | -47400323244530370 | 39.7% | 27.0% | 10914326340321504u/21828652680643010 | 0/2/2 -97.0% |
| 20260515 | convenience | idle | - | - | 60 | -134850 (365) | 16106 | -13434 | -134850 | 80.6% | 71.0% | 0u/0 | 0/1/1 -98.3% |
| 20260515 | convenience | retail-steady | - | - | 23 | -285246 (365) | -18118 | -65731 | -285246 | 2.9% | 2.3% | 0u/0 | 0/2/2 -97.7% |
| 20260515 | convenience | advisor | - | - | 20 | -291945 (365) | -20127 | -68580 | -291945 | 2.9% | 2.3% | 0u/0 | 0/2/2 -97.7% |
| 20260515 | boutique | idle | 3-9 | - | 120 | -84794 (364) | 28418 | 3988 | -82870 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.4% |
| 20260515 | boutique | retail-steady | 2-8 | 11-40 | 21 | -37306 (35) | -19414 | 13040 | 239165 | 6.2% | 3.9% | 0u/0 | 0/3/3 -65.4% |
| 20260515 | electronics | idle | - | - | 91 | -106900 (364) | 33210 | 1018 | -104430 | 80.1% | 71.2% | 0u/0 | 0/1/1 -70.8% |
| 20260515 | electronics | retail-steady | 4-10 | - | 7 | -126554 (364) | -32330 | -37210 | -122744 | 2.0% | 1.6% | 0u/0 | 0/3/3 -58.8% |
| 20260515 | grocery | idle | - | - | 60 | -214434 (365) | 16949 | -28887 | -214434 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.8% |
| 20260515 | grocery | retail-steady | - | - | 30 | -74142814496751360 (365) | -25773 | -502775 | -74142814496751360 | 43.2% | 26.8% | 15692861127618120u/31385722255236240 | 0/2/2 -96.9% |
| 20260516 | convenience | idle | - | - | 65 | -127729 (365) | 16737 | -11989 | -127729 | 90.1% | 64.4% | 0u/0 | 0/1/1 -98.3% |
| 20260516 | convenience | retail-steady | - | - | 21 | -18489722671851292 (364) | -19727 | -792505 | -18489722671851284 | 19.7% | 2.7% | 0u/0 | 0/2/2 -97.5% |
| 20260516 | convenience | advisor | - | - | 21 | -18489722671858600 (365) | -22355 | -795973 | -18489722671858600 | 19.7% | 2.7% | 0u/0 | 0/2/2 -97.5% |
| 20260516 | boutique | idle | 3-9 | - | 120 | -77198 (364) | 29051 | 5887 | -75388 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.5% |
| 20260516 | boutique | retail-steady | 2-8 | 12-41 | 21 | -37574 (35) | -19906 | 11320 | 242565 | 5.7% | 3.7% | 0u/0 | 0/3/3 -65.1% |
| 20260516 | electronics | idle | 66-72 | - | 91 | -99304 (364) | 33555 | 2917 | -97602 | 69.1% | 57.3% | 0u/0 | 0/1/1 -70.9% |
| 20260516 | electronics | retail-steady | 6-12 | - | 7 | -242220 (364) | -33593 | -62347 | -239658 | 1.3% | 1.1% | 0u/0 | 0/3/3 -61.7% |
| 20260516 | grocery | idle | - | - | 60 | -206242 (365) | 17632 | -26838 | -206242 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.7% |
| 20260516 | grocery | retail-steady | - | - | 30 | -35729601317338504 (364) | -24724 | -257698 | -35729601317338500 | 39.9% | 27.1% | 5852031308148130u/11704062616296260 | 0/2/2 -97.0% |
| 20260517 | convenience | idle | - | - | 61 | -134100 (364) | 16167 | -13251 | -134091 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260517 | convenience | retail-steady | - | - | 28 | -34092428762819384 (364) | -19602 | -693001 | -34092428762819360 | 16.5% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260517 | convenience | advisor | - | - | 21 | -34092428762826004 (364) | -21549 | -695788 | -34092428762825990 | 16.5% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260517 | boutique | idle | 2-8 | - | 120 | -84002 (364) | 28484 | 4186 | -80976 | 89.9% | 71.5% | 0u/0 | 0/1/1 -77.0% |
| 20260517 | boutique | retail-steady | 2-8 | 7-36 | 14 | -25316 (30) | -25316 | 14760 | 251398 | 4.6% | 3.0% | 0u/0 | 0/3/3 -64.4% |
| 20260517 | electronics | idle | 107-113 | - | 91 | -106108 (364) | 33276 | 1216 | -103206 | 80.5% | 71.2% | 0u/0 | 0/1/1 -70.3% |
| 20260517 | electronics | retail-steady | 4-10 | - | 7 | -117215 (364) | -31595 | -35651 | -113357 | 2.1% | 1.7% | 0u/0 | 0/3/3 -58.1% |
| 20260517 | grocery | idle | - | - | 60 | -212434 (364) | 17115 | -28389 | -212386 | 81.3% | 71.2% | 0u/0 | 0/1/1 -97.9% |
| 20260517 | grocery | retail-steady | - | - | 30 | -435325 (365) | -24791 | -98579 | -435325 | 3.1% | 2.5% | 0u/0 | 0/2/2 -97.0% |
| 20260518 | convenience | idle | - | - | 65 | -127131 (365) | 16798 | -11934 | -127131 | 90.0% | 69.9% | 0u/0 | 0/1/1 -98.3% |
| 20260518 | convenience | retail-steady | - | - | 21 | -17541195434464280 (364) | -18542 | -672848 | -17541195434464264 | 17.4% | 3.3% | 0u/0 | 0/2/2 -97.5% |
| 20260518 | convenience | advisor | - | - | 21 | -17541195434471322 (364) | -20921 | -676067 | -17541195434471320 | 17.4% | 3.3% | 0u/0 | 0/2/2 -97.5% |
| 20260518 | boutique | idle | 2-8 | - | 120 | -76406 (364) | 29117 | 6085 | -74520 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260518 | boutique | retail-steady | 2-8 | 6-35 | 14 | -24528 (30) | -24528 | 30350 | 278160 | 3.9% | 2.7% | 0u/0 | 0/3/3 -64.0% |
| 20260518 | electronics | idle | 80-86 | - | 98 | -98512 (364) | 33813 | 3115 | -96666 | 69.8% | 57.8% | 0u/0 | 0/1/1 -70.7% |
| 20260518 | electronics | retail-steady | 5-11 | - | 7 | -240399 (364) | -34122 | -62408 | -237789 | 1.5% | 1.1% | 0u/0 | 0/3/3 -61.5% |
| 20260518 | grocery | idle | - | - | 60 | -204234 (365) | 17799 | -26337 | -204234 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.9% |
| 20260518 | grocery | retail-steady | - | - | 30 | -22095480518363176 (360) | -25011 | -171631 | -22095480518363164 | 38.1% | 26.0% | 2430687358262460u/4861374716524920 | 0/2/2 -97.0% |
| 20260519 | convenience | idle | - | - | 62 | -133386 (365) | 16227 | -13071 | -133386 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260519 | convenience | retail-steady | - | - | 21 | -35082390868653668 (365) | -19845 | -909354 | -35082390868653668 | 27.4% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260519 | convenience | advisor | - | - | 21 | -35082390868660870 (365) | -22373 | -912722 | -35082390868660870 | 27.4% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260519 | boutique | idle | 2-8 | - | 120 | -83234 (364) | 28548 | 4378 | -81082 | 90.1% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260519 | boutique | retail-steady | 2-8 | 8-37 | 21 | -29463 (35) | -23527 | 12010 | 262390 | 5.6% | 3.6% | 0u/0 | 0/3/3 -64.7% |
| 20260519 | electronics | idle | 16-22 | - | 91 | -105340 (364) | 33100 | 1408 | -103446 | 69.9% | 58.1% | 0u/0 | 0/1/1 -70.7% |
| 20260519 | electronics | retail-steady | 6-12 | - | 7 | -238874 (364) | -33971 | -61645 | -236216 | 1.4% | 1.1% | 0u/0 | 0/3/3 -61.7% |
| 20260519 | grocery | idle | - | - | 60 | -210454 (364) | 17280 | -27894 | -210434 | 90.2% | 71.5% | 0u/0 | 0/1/1 -97.9% |
| 20260519 | grocery | retail-steady | - | - | 30 | -25013667819960536 (360) | -25147 | -163449 | -25013667819960484 | 38.0% | 26.3% | 2746073386862061u/5492146773724122 | 0/2/2 -97.0% |
| 20260520 | convenience | idle | - | - | 61 | -134220 (365) | 16158 | -13278 | -134220 | 90.0% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260520 | convenience | retail-steady | - | - | 28 | -35082390868660116 (365) | -19585 | -458531 | -35082390868660116 | 23.5% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260520 | convenience | advisor | - | - | 21 | -35082390868666770 (365) | -21532 | -461318 | -35082390868666770 | 23.5% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260520 | boutique | idle | 2-8 | - | 120 | -84026 (364) | 28482 | 4180 | -82102 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260520 | boutique | retail-steady | 2-8 | 7-36 | 14 | -26112 (30) | -26112 | 18910 | 188918 | 5.1% | 3.4% | 0u/0 | 0/3/3 -64.6% |
| 20260520 | electronics | idle | 94-100 | - | 91 | -106132 (364) | 32938 | 1210 | -104286 | 68.9% | 57.3% | 0u/0 | 0/1/1 -70.6% |
| 20260520 | electronics | retail-steady | 6-12 | - | 7 | -274739 (364) | -35712 | -70082 | -272033 | 1.4% | 1.0% | 0u/0 | 0/3/3 -61.5% |
| 20260520 | grocery | idle | - | - | 60 | -216662 (365) | 16763 | -29445 | -216662 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.9% |
| 20260520 | grocery | retail-steady | - | - | 30 | -58459185289121060 (365) | -26293 | -394775 | -58459185289121060 | 42.3% | 27.4% | 11860277586593286u/23720555173186572 | 0/2/2 -96.9% |
| 20260521 | convenience | idle | - | - | 62 | -132648 (364) | 16288 | -12888 | -132600 | 83.8% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260521 | convenience | retail-steady | - | - | 23 | -316274835408 (365) | -18022 | -80466 | -316274835408 | 4.8% | 2.7% | 0u/0 | 0/2/2 -97.7% |
| 20260521 | convenience | advisor | - | - | 16 | -316274842716 (365) | -20640 | -83924 | -316274842716 | 4.8% | 2.7% | 0u/0 | 0/2/2 -97.7% |
| 20260521 | boutique | idle | 2-8 | - | 120 | -82442 (364) | 28614 | 4576 | -79682 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.5% |
| 20260521 | boutique | retail-steady | 2-8 | 8-37 | 21 | -26365 (35) | -25573 | 6023 | 244730 | 5.6% | 3.4% | 0u/0 | 0/3/3 -65.4% |
| 20260521 | electronics | idle | 9-15 | - | 91 | -104548 (364) | 33406 | 1606 | -101454 | 80.4% | 71.2% | 0u/0 | 0/1/1 -70.9% |
| 20260521 | electronics | retail-steady | 4-10 | - | 7 | -122075 (364) | -32916 | -36878 | -118121 | 2.1% | 1.6% | 0u/0 | 0/3/3 -58.8% |
| 20260521 | grocery | idle | - | - | 60 | -214474 (365) | 16946 | -28896 | -214474 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.9% |
| 20260521 | grocery | retail-steady | - | - | 30 | -28146940194832756 (365) | -25578 | -257952 | -28146940194832756 | 39.3% | 27.1% | 3997812869120784u/7995625738241568 | 0/2/2 -97.1% |
| 20260522 | convenience | idle | - | - | 62 | -133494 (365) | 16218 | -13098 | -133494 | 90.0% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260522 | convenience | retail-steady | - | - | 21 | -35082390868660144 (365) | -20238 | -889519 | -35082390868660144 | 28.6% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260522 | convenience | advisor | - | - | 21 | -35082390868667384 (365) | -22796 | -892917 | -35082390868667384 | 28.6% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260522 | boutique | idle | 2-8 | - | 120 | -83246 (364) | 28547 | 4375 | -81208 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260522 | boutique | retail-steady | 2-8 | 6-35 | 14 | -25915 (30) | -25915 | 25651 | 247543 | 4.6% | 3.0% | 0u/0 | 0/3/3 -64.7% |
| 20260522 | electronics | idle | - | - | 91 | -105352 (364) | 33339 | 1405 | -102738 | 81.4% | 71.2% | 0u/0 | 0/1/1 -70.6% |
| 20260522 | electronics | retail-steady | 4-10 | - | 7 | -106153 (364) | -31171 | -34700 | -102295 | 2.3% | 1.7% | 0u/0 | 0/3/3 -58.6% |
| 20260522 | grocery | idle | - | - | 60 | -214666 (364) | 16929 | -28947 | -214654 | 80.3% | 71.2% | 0u/0 | 0/1/1 -97.9% |
| 20260522 | grocery | retail-steady | - | - | 30 | -436704 (365) | -25020 | -99010 | -436704 | 3.1% | 2.3% | 0u/0 | 0/2/2 -97.0% |
| 20260523 | convenience | idle | - | - | 65 | -126594 (365) | 16850 | -11874 | -126594 | 80.1% | 69.0% | 0u/0 | 0/1/1 -98.3% |
| 20260523 | convenience | retail-steady | - | - | 23 | -278155 (365) | -17484 | -63928 | -278155 | 2.8% | 2.3% | 0u/0 | 0/2/2 -97.7% |
| 20260523 | convenience | advisor | - | - | 19 | -284991 (365) | -19630 | -66914 | -284991 | 2.8% | 2.3% | 0u/0 | 0/2/2 -97.7% |
| 20260523 | boutique | idle | 2-8 | - | 120 | -75638 (364) | 29181 | 6277 | -73714 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260523 | boutique | retail-steady | 2-8 | 11-40 | 21 | -37312 (35) | -19530 | 11670 | 242456 | 5.5% | 3.5% | 0u/0 | 0/3/3 -64.2% |
| 20260523 | electronics | idle | - | - | 112 | -97744 (364) | 33973 | 3307 | -95274 | 79.6% | 71.2% | 0u/0 | 0/1/1 -70.6% |
| 20260523 | electronics | retail-steady | 4-10 | - | 7 | -129187 (364) | -32143 | -38423 | -125569 | 2.1% | 1.6% | 0u/0 | 0/3/3 -58.6% |
| 20260523 | grocery | idle | - | - | 60 | -206462 (365) | 17614 | -26892 | -206462 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.8% |
| 20260523 | grocery | retail-steady | - | - | 30 | -71432973818207500 (365) | -25263 | -506011 | -71432973818207500 | 43.1% | 26.8% | 15504396899747788u/31008793799495576 | 0/2/2 -97.0% |
| 20260524 | convenience | idle | - | - | 62 | -132756 (364) | 16279 | -12915 | -132663 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260524 | convenience | retail-steady | - | - | 21 | -17541195434462386 (364) | -19322 | -675177 | -17541195434462364 | 18.9% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260524 | convenience | advisor | - | - | 21 | -17541195434469474 (364) | -21731 | -678426 | -17541195434469468 | 18.9% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260524 | boutique | idle | 2-8 | - | 120 | -82454 (364) | 28613 | 4573 | -80340 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.4% |
| 20260524 | boutique | retail-steady | 2-8 | 5-34 | 14 | -24251 (30) | -24251 | 30795 | 264710 | 4.6% | 3.2% | 0u/0 | 0/3/3 -64.4% |
| 20260524 | electronics | idle | 16-22 | - | 91 | -104560 (364) | 33405 | 1603 | -102570 | 72.5% | 70.7% | 0u/0 | 0/1/1 -70.8% |
| 20260524 | electronics | retail-steady | 5-11 | - | 7 | -211073 (364) | -32714 | -55412 | -208271 | 1.6% | 1.1% | 0u/0 | 0/3/3 -61.7% |
| 20260524 | grocery | idle | - | - | 60 | -212662 (364) | 17096 | -28446 | -212646 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.9% |
| 20260524 | grocery | retail-steady | - | - | 30 | -43926736348697150 (364) | -25337 | -365847 | -43926736348697150 | 38.7% | 26.3% | 10226849670914720u/20453699341829440 | 0/2/2 -97.1% |
| 20260525 | convenience | idle | - | - | 62 | -133614 (365) | 16209 | -13125 | -133614 | 82.4% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260525 | convenience | retail-steady | - | - | 23 | -280778 (365) | -17909 | -64745 | -280778 | 3.1% | 2.6% | 0u/0 | 0/2/2 -97.7% |
| 20260525 | convenience | advisor | - | - | 18 | -287926 (365) | -20367 | -68043 | -287926 | 3.1% | 2.6% | 0u/0 | 0/2/2 -97.7% |
| 20260525 | boutique | idle | 2-8 | - | 120 | -83270 (364) | 28545 | 4369 | -81194 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.4% |
| 20260525 | boutique | retail-steady | 2-8 | 12-41 | 21 | -37208 (35) | -21030 | 9666 | 242510 | 5.7% | 3.5% | 0u/0 | 0/3/3 -65.4% |
| 20260525 | electronics | idle | - | - | 91 | -105376 (364) | 33337 | 1399 | -102714 | 80.3% | 71.2% | 0u/0 | 0/1/1 -70.8% |
| 20260525 | electronics | retail-steady | 4-10 | - | 7 | -134879 (364) | -33396 | -40518 | -131069 | 2.2% | 1.6% | 0u/0 | 0/3/3 -59.5% |
| 20260525 | grocery | idle | - | - | 60 | -212878 (364) | 17078 | -28500 | -212866 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.8% |
| 20260525 | grocery | retail-steady | - | - | 30 | -80659439602684380 (365) | -27330 | -929536 | -80659439602684380 | 42.2% | 27.3% | 19215536510007060u/38431073020014120 | 0/2/2 -96.9% |
| 20260526 | convenience | idle | - | - | 63 | -132063 (365) | 16339 | -12735 | -132063 | 90.0% | 68.5% | 0u/0 | 0/1/1 -98.3% |
| 20260526 | convenience | retail-steady | - | - | 28 | -17541242446655812 (364) | -19350 | -684576 | -17541242446655782 | 18.2% | 2.9% | 0u/0 | 0/2/2 -97.5% |
| 20260526 | convenience | advisor | - | - | 21 | -17541242446662796 (364) | -21658 | -687724 | -17541242446662780 | 18.2% | 2.9% | 0u/0 | 0/2/2 -97.5% |
| 20260526 | boutique | idle | 3-9 | - | 120 | -81674 (364) | 28678 | 4768 | -79864 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260526 | boutique | retail-steady | 2-8 | 6-35 | 14 | -25020 (30) | -25020 | 27348 | 263912 | 3.9% | 2.7% | 0u/0 | 0/3/3 -64.2% |
| 20260526 | electronics | idle | - | - | 91 | -103780 (364) | 33470 | 1798 | -101790 | 71.2% | 64.7% | 0u/0 | 0/1/1 -70.7% |
| 20260526 | electronics | retail-steady | 5-11 | - | 7 | -228289 (364) | -33812 | -59666 | -225391 | 1.6% | 1.1% | 0u/0 | 0/3/3 -61.6% |
| 20260526 | grocery | idle | - | - | 60 | -210682 (365) | 17262 | -27948 | -210682 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.9% |
| 20260526 | grocery | retail-steady | - | - | 30 | -55829756471969520 (365) | -25028 | -276916 | -55829756471969520 | 39.9% | 26.6% | 8058625554657064u/16117251109314128 | 0/2/2 -97.0% |
| 20260527 | convenience | idle | - | - | 62 | -132882 (365) | 16270 | -12942 | -132882 | 90.1% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260527 | convenience | retail-steady | - | - | 21 | -35082390868656496 (365) | -20626 | -1232266 | -35082390868656496 | 31.0% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260527 | convenience | advisor | - | - | 21 | -35082390868663824 (365) | -23254 | -1235734 | -35082390868663824 | 31.0% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260527 | boutique | idle | 2-8 | - | 120 | -82478 (364) | 28611 | 4567 | -80478 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.4% |
| 20260527 | boutique | retail-steady | 2-8 | 8-37 | 21 | -29223 (30) | -29223 | -12 | 236739 | 5.4% | 3.4% | 0u/0 | 0/3/3 -64.9% |
| 20260527 | electronics | idle | - | - | 91 | -104584 (364) | 33403 | 1597 | -102018 | 81.3% | 71.2% | 0u/0 | 0/1/1 -70.8% |
| 20260527 | electronics | retail-steady | 4-10 | - | 7 | -114764 (364) | -32077 | -35735 | -110906 | 2.2% | 1.6% | 0u/0 | 0/3/3 -58.1% |
| 20260527 | grocery | idle | - | - | 60 | -210874 (364) | 17245 | -27999 | -210870 | 80.3% | 71.2% | 0u/0 | 0/1/1 -97.8% |
| 20260527 | grocery | retail-steady | - | - | 30 | -445703 (365) | -25952 | -101426 | -445703 | 3.1% | 2.3% | 0u/0 | 0/2/2 -97.1% |
| 20260528 | convenience | idle | - | - | 66 | -125976 (365) | 16901 | -11721 | -125976 | 90.0% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260528 | convenience | retail-steady | - | - | 21 | -35082390868644930 (365) | -19379 | -1173571 | -35082390868644930 | 25.1% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260528 | convenience | advisor | - | - | 21 | -35082390868652260 (365) | -22007 | -1177039 | -35082390868652260 | 25.1% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260528 | boutique | idle | 2-8 | - | 120 | -74870 (364) | 29245 | 6469 | -72984 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.5% |
| 20260528 | boutique | retail-steady | 2-8 | 11-40 | 21 | -37068 (35) | -18564 | 15194 | 235665 | 6.1% | 4.1% | 0u/0 | 0/3/3 -65.6% |
| 20260528 | electronics | idle | 9-15 | - | 120 | -96976 (364) | 34037 | 3499 | -94554 | 80.1% | 71.2% | 0u/0 | 0/1/1 -70.9% |
| 20260528 | electronics | retail-steady | 4-10 | - | 7 | -117306 (364) | -31509 | -34995 | -113640 | 2.1% | 1.6% | 0u/0 | 0/3/3 -58.7% |
| 20260528 | grocery | idle | - | - | 60 | -202674 (365) | 17929 | -25947 | -202674 | 80.1% | 71.2% | 0u/0 | 0/1/1 -97.8% |
| 20260528 | grocery | retail-steady | - | - | 30 | -429083 (365) | -24354 | -97104 | -429083 | 2.9% | 2.3% | 0u/0 | 0/2/2 -97.1% |
| 20260529 | convenience | idle | - | - | 63 | -132144 (364) | 16330 | -12762 | -132138 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260529 | convenience | retail-steady | - | - | 21 | -35082390868650716 (364) | -19752 | -819572 | -35082390868650716 | 24.3% | 3.2% | 0u/0 | 0/2/2 -97.6% |
| 20260529 | convenience | advisor | - | - | 18 | -35082390868658056 (365) | -22380 | -823040 | -35082390868658056 | 24.3% | 3.2% | 0u/0 | 0/2/2 -97.6% |
| 20260529 | boutique | idle | 2-8 | - | 120 | -81698 (364) | 28676 | 4762 | -79470 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.4% |
| 20260529 | boutique | retail-steady | 2-8 | 8-37 | 21 | -31424 (35) | -25776 | 9372 | 232208 | 5.9% | 3.7% | 0u/0 | 0/3/3 -65.4% |
| 20260529 | electronics | idle | 16-22 | - | 91 | -103804 (364) | 33468 | 1792 | -101670 | 72.0% | 70.1% | 0u/0 | 0/1/1 -70.8% |
| 20260529 | electronics | retail-steady | 5-11 | - | 7 | -223661 (364) | -34746 | -59116 | -220859 | 1.6% | 1.1% | 0u/0 | 0/3/3 -61.7% |
| 20260529 | grocery | idle | - | - | 60 | -208882 (364) | 17411 | -27501 | -208862 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.8% |
| 20260529 | grocery | retail-steady | - | - | 30 | -29047489002608612 (364) | -25792 | -215380 | -29047489002608596 | 38.0% | 27.7% | 4971775064831315u/9943550129662630 | 0/2/2 -97.0% |
| 20260530 | convenience | idle | - | - | 62 | -132987 (365) | 16261 | -12969 | -132987 | 90.1% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260530 | convenience | retail-steady | - | - | 21 | -35082390868659588 (365) | -20753 | -1182384 | -35082390868659588 | 27.0% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260530 | convenience | advisor | - | - | 21 | -35082390868666910 (365) | -23381 | -1185852 | -35082390868666910 | 27.0% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260530 | boutique | idle | 2-8 | - | 120 | -82490 (364) | 28610 | 4564 | -80604 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.4% |
| 20260530 | boutique | retail-steady | 2-8 | 11-40 | 21 | -28452 (35) | -25494 | 4104 | 222518 | 5.5% | 3.3% | 0u/0 | 0/3/3 -65.2% |
| 20260530 | electronics | idle | - | - | 91 | -104596 (364) | 33402 | 1594 | -102174 | 80.8% | 71.2% | 0u/0 | 0/1/1 -70.8% |
| 20260530 | electronics | retail-steady | 4-10 | - | 7 | -128357 (364) | -32893 | -39789 | -124595 | 2.2% | 1.7% | 0u/0 | 0/3/3 -58.4% |
| 20260530 | grocery | idle | - | - | 60 | -215086 (364) | 16894 | -29052 | -215086 | 79.8% | 71.2% | 0u/0 | 0/1/1 -97.9% |
| 20260530 | grocery | retail-steady | - | - | 30 | -440041 (365) | -25318 | -99820 | -440041 | 3.0% | 2.3% | 0u/0 | 0/2/2 -97.2% |
| 20260531 | convenience | idle | - | - | 63 | -131430 (365) | 16391 | -12579 | -131430 | 90.1% | 69.3% | 0u/0 | 0/1/1 -98.3% |
| 20260531 | convenience | retail-steady | - | - | 21 | -35082390868658692 (365) | -20789 | -1177185 | -35082390868658692 | 29.3% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260531 | convenience | advisor | - | - | 20 | -35082390868666000 (365) | -23417 | -1180653 | -35082390868666000 | 29.3% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260531 | boutique | idle | 2-8 | - | 120 | -80906 (364) | 28742 | 4960 | -79020 | 83.0% | 71.2% | 0u/0 | 0/1/1 -77.3% |
| 20260531 | boutique | retail-steady | 2-8 | 40-69 | 21 | -40340 (60) | -31513 | -33331 | 36383 | 4.5% | 2.8% | 0u/0 | 0/3/3 -65.8% |
| 20260531 | electronics | idle | 9-15 | - | 91 | -103012 (364) | 33534 | 1990 | -100590 | 81.4% | 71.2% | 0u/0 | 0/1/1 -70.7% |
| 20260531 | electronics | retail-steady | 4-10 | - | 7 | -117846 (364) | -32947 | -37493 | -113844 | 2.2% | 1.6% | 0u/0 | 0/3/3 -58.7% |
| 20260531 | grocery | idle | - | - | 60 | -212922 (365) | 17076 | -28506 | -212922 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.0% |
| 20260531 | grocery | retail-steady | - | - | 30 | -23852367830459624 (364) | -25002 | -157076 | -23852367830459612 | 25.6% | 15.5% | 2806357084056103u/5612714168112206 | 0/2/2 -97.1% |
| 20260532 | convenience | idle | - | - | 63 | -132252 (364) | 16321 | -12789 | -132249 | 90.0% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260532 | convenience | retail-steady | - | - | 21 | -35082390868659170 (365) | -20313 | -869973 | -35082390868659170 | 29.8% | 2.6% | 0u/0 | 0/2/2 -97.6% |
| 20260532 | convenience | advisor | - | - | 19 | -35082390868666484 (365) | -22941 | -873441 | -35082390868666484 | 29.8% | 2.6% | 0u/0 | 0/2/2 -97.6% |
| 20260532 | boutique | idle | 2-8 | - | 120 | -81722 (364) | 28674 | 4756 | -79722 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.2% |
| 20260532 | boutique | retail-steady | 2-8 | 11-40 | 21 | -31477 (35) | -24063 | 7199 | 243925 | 5.9% | 3.7% | 0u/0 | 0/3/3 -65.3% |
| 20260532 | electronics | idle | - | - | 91 | -103828 (364) | 33466 | 1786 | -101262 | 82.5% | 71.2% | 0u/0 | 0/1/1 -70.6% |
| 20260532 | electronics | retail-steady | 4-10 | - | 7 | -97577 (364) | -32663 | -34092 | -93527 | 2.3% | 1.8% | 0u/0 | 0/3/3 -58.3% |
| 20260532 | grocery | idle | - | - | 60 | -213106 (364) | 17059 | -28557 | -213102 | 79.7% | 71.2% | 0u/0 | 0/1/1 -97.9% |
| 20260532 | grocery | retail-steady | - | - | 30 | -446206 (365) | -26230 | -101678 | -446206 | 2.9% | 2.3% | 0u/0 | 0/2/2 -97.2% |
| 20260533 | convenience | idle | - | - | 63 | -130704 (365) | 16452 | -12396 | -130704 | 90.1% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260533 | convenience | retail-steady | - | - | 21 | -35082390868656384 (365) | -21251 | -1288301 | -35082390868656384 | 29.1% | 2.6% | 0u/0 | 0/2/2 -97.6% |
| 20260533 | convenience | advisor | - | - | 20 | -35082390868663640 (365) | -23824 | -1291714 | -35082390868663640 | 29.1% | 2.6% | 0u/0 | 0/2/2 -97.6% |
| 20260533 | boutique | idle | 2-8 | - | 120 | -80114 (364) | 28808 | 5158 | -78152 | 82.2% | 71.2% | 0u/0 | 0/1/1 -77.5% |
| 20260533 | boutique | retail-steady | 2-8 | 40-69 | 21 | -40324 (60) | -30427 | -33919 | 22396 | 4.2% | 2.8% | 0u/0 | 0/3/3 -66.0% |
| 20260533 | electronics | idle | - | - | 91 | -102220 (364) | 33600 | 2188 | -99702 | 80.5% | 71.2% | 0u/0 | 0/1/1 -70.9% |
| 20260533 | electronics | retail-steady | 4-10 | - | 7 | -130304 (364) | -32606 | -40378 | -126542 | 2.1% | 1.6% | 0u/0 | 0/3/3 -59.0% |
| 20260533 | grocery | idle | - | - | 60 | -210902 (365) | 17243 | -28005 | -210902 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.8% |
| 20260533 | grocery | retail-steady | - | - | 30 | -58260017029645470 (365) | -25974 | -432998 | -58260017029645470 | 43.4% | 27.5% | 12275291091157068u/24550582182314136 | 0/2/2 -97.0% |
| 20260534 | convenience | idle | - | - | 63 | -131523 (365) | 16382 | -12606 | -131523 | 90.0% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260534 | convenience | retail-steady | - | - | 27 | -35082390868655244 (365) | -19781 | -835070 | -35082390868655244 | 27.3% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260534 | convenience | advisor | - | - | 21 | -35082390868662092 (365) | -21942 | -838071 | -35082390868662092 | 27.3% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260534 | boutique | idle | 2-8 | - | 120 | -80930 (364) | 28740 | 4954 | -78854 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.1% |
| 20260534 | boutique | retail-steady | 2-8 | 6-35 | 14 | -24511 (30) | -24511 | 28507 | 251602 | 4.7% | 3.2% | 0u/0 | 0/3/3 -65.0% |
| 20260534 | electronics | idle | 10-16 | - | 91 | -103036 (364) | 33532 | 1984 | -100854 | 73.3% | 71.0% | 0u/0 | 0/1/1 -70.4% |
| 20260534 | electronics | retail-steady | 5-11 | - | 7 | -205885 (364) | -32203 | -53495 | -202843 | 1.7% | 1.1% | 0u/0 | 0/3/3 -61.4% |
| 20260534 | grocery | idle | - | - | 60 | -211114 (364) | 17225 | -28059 | -211106 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.8% |
| 20260534 | grocery | retail-steady | - | - | 30 | -40665236471703840 (364) | -25184 | -303524 | -40665236471703820 | 38.8% | 26.8% | 8828327241089653u/17656654482179306 | 0/2/2 -96.9% |
| 20260535 | convenience | idle | - | - | 63 | -132378 (365) | 16312 | -12816 | -132378 | 90.1% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260535 | convenience | retail-steady | - | - | 21 | -35082390868654924 (365) | -20368 | -1125641 | -35082390868654924 | 26.8% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260535 | convenience | advisor | - | - | 20 | -35082390868662252 (365) | -22996 | -1129109 | -35082390868662252 | 26.8% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260535 | boutique | idle | 2-8 | - | 120 | -81734 (364) | 28673 | 4753 | -79810 | 83.2% | 71.2% | 0u/0 | 0/1/1 -77.0% |
| 20260535 | boutique | retail-steady | 2-8 | 30-59 | 21 | -36491 (60) | -30363 | -28259 | 45443 | 5.1% | 3.6% | 0u/0 | 0/3/3 -64.9% |
| 20260535 | electronics | idle | - | - | 91 | -103840 (364) | 33465 | 1783 | -101370 | 81.1% | 71.2% | 0u/0 | 0/1/1 -70.3% |
| 20260535 | electronics | retail-steady | 4-10 | - | 7 | -107138 (364) | -31415 | -34178 | -103328 | 2.2% | 1.6% | 0u/0 | 0/3/3 -58.2% |
| 20260535 | grocery | idle | - | - | 60 | -211310 (365) | 17209 | -28107 | -211310 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.9% |
| 20260535 | grocery | retail-steady | - | - | 30 | -66349123968735580 (365) | -26225 | -771933 | -66349123968735580 | 42.6% | 26.3% | 15955451528371936u/31910903056743870 | 0/2/2 -97.1% |
| 20260536 | convenience | idle | - | - | 63 | -130818 (365) | 16442 | -12426 | -130818 | 90.1% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260536 | convenience | retail-steady | - | - | 21 | -35082390868653170 (365) | -20307 | -1175738 | -35082390868653170 | 28.1% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260536 | convenience | advisor | - | - | 20 | -35082390868660492 (365) | -22935 | -1179206 | -35082390868660492 | 28.1% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260536 | boutique | idle | 2-8 | - | 120 | -80150 (364) | 28805 | 5149 | -78302 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260536 | boutique | retail-steady | 2-8 | 12-41 | 21 | -38012 (35) | -19056 | 11578 | 238690 | 5.5% | 3.6% | 0u/0 | 0/3/3 -64.3% |
| 20260536 | electronics | idle | - | - | 91 | -102256 (364) | 33597 | 2179 | -99882 | 81.7% | 71.2% | 0u/0 | 0/1/1 -70.7% |
| 20260536 | electronics | retail-steady | 4-10 | - | 7 | -99489 (364) | -32640 | -33404 | -95535 | 2.2% | 1.8% | 0u/0 | 0/3/3 -58.6% |
| 20260536 | grocery | idle | - | - | 60 | -209126 (365) | 17391 | -27561 | -209126 | 81.8% | 71.2% | 0u/0 | 0/1/1 -97.9% |
| 20260536 | grocery | retail-steady | - | - | 30 | -433997 (365) | -25325 | -98705 | -433997 | 3.1% | 2.6% | 0u/0 | 0/2/2 -97.2% |
| 20260537 | convenience | idle | - | - | 63 | -131637 (365) | 16373 | -12633 | -131637 | 90.0% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260537 | convenience | retail-steady | - | - | 21 | -35082390868653300 (365) | -20326 | -1231462 | -35082390868653300 | 28.4% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260537 | convenience | advisor | - | - | 21 | -35082390868660640 (365) | -22954 | -1234930 | -35082390868660640 | 28.4% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260537 | boutique | idle | 2-8 | - | 120 | -80942 (364) | 28739 | 4951 | -78904 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260537 | boutique | retail-steady | 2-8 | 12-41 | 21 | -28010 (35) | -24218 | 4193 | 237240 | 5.6% | 3.6% | 0u/0 | 0/3/3 -65.3% |
| 20260537 | electronics | idle | - | - | 91 | -103048 (364) | 33531 | 1981 | -100434 | 81.6% | 71.2% | 0u/0 | 0/1/1 -70.7% |
| 20260537 | electronics | retail-steady | 4-10 | - | 7 | -92685 (364) | -30271 | -32516 | -88779 | 2.3% | 1.7% | 0u/0 | 0/3/3 -58.6% |
| 20260537 | grocery | idle | - | - | 60 | -209314 (364) | 17375 | -27609 | -209310 | 81.6% | 71.2% | 0u/0 | 0/1/1 -97.9% |
| 20260537 | grocery | retail-steady | - | - | 30 | -425586 (365) | -24313 | -96289 | -425586 | 3.1% | 2.6% | 0u/0 | 0/2/2 -97.1% |
| 20260538 | convenience | idle | - | - | 64 | -130086 (365) | 16503 | -12243 | -130086 | 90.1% | 69.0% | 0u/0 | 0/1/1 -98.3% |
| 20260538 | convenience | retail-steady | - | - | 21 | -35082390868651510 (365) | -20001 | -909245 | -35082390868651510 | 29.3% | 2.7% | 0u/0 | 0/2/2 -97.5% |
| 20260538 | convenience | advisor | - | - | 20 | -35082390868658812 (365) | -22629 | -912713 | -35082390868658812 | 29.3% | 2.7% | 0u/0 | 0/2/2 -97.5% |
| 20260538 | boutique | idle | 3-9 | - | 120 | -79358 (364) | 28871 | 5347 | -77548 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260538 | boutique | retail-steady | 2-8 | 8-37 | 21 | -25731 (35) | -22513 | 9739 | 254100 | 5.4% | 3.5% | 0u/0 | 0/3/3 -64.3% |
| 20260538 | electronics | idle | - | - | 91 | -101464 (364) | 33663 | 2377 | -99138 | 80.6% | 71.2% | 0u/0 | 0/1/1 -70.7% |
| 20260538 | electronics | retail-steady | 4-10 | - | 7 | -117383 (364) | -31812 | -36758 | -113621 | 2.1% | 1.6% | 0u/0 | 0/3/3 -58.6% |
| 20260538 | grocery | idle | - | - | 60 | -207126 (365) | 17558 | -27060 | -207126 | 79.3% | 71.2% | 0u/0 | 0/1/1 -97.8% |
| 20260538 | grocery | retail-steady | - | - | 30 | -434656 (365) | -24958 | -98524 | -434656 | 2.8% | 2.3% | 0u/0 | 0/2/2 -97.0% |
| 20260539 | convenience | idle | - | - | 63 | -130908 (364) | 16433 | -12453 | -130899 | 90.0% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260539 | convenience | retail-steady | - | - | 21 | -35082390868650810 (365) | -19289 | -849977 | -35082390868650810 | 28.3% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260539 | convenience | advisor | - | - | 21 | -35082390868657948 (365) | -21737 | -853265 | -35082390868657948 | 28.3% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260539 | boutique | idle | 2-8 | - | 120 | -80162 (364) | 28804 | 5146 | -78010 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260539 | boutique | retail-steady | 2-8 | 8-37 | 21 | -30989 (35) | -23137 | 10706 | 239129 | 6.5% | 4.4% | 0u/0 | 0/3/3 -65.6% |
| 20260539 | electronics | idle | 10-16 | - | 91 | -102268 (364) | 33596 | 2176 | -100374 | 70.8% | 63.3% | 0u/0 | 0/1/1 -70.7% |
| 20260539 | electronics | retail-steady | 5-11 | - | 7 | -230611 (364) | -33911 | -59727 | -227761 | 1.6% | 1.1% | 0u/0 | 0/3/3 -61.6% |
| 20260539 | grocery | idle | - | - | 60 | -207322 (364) | 17541 | -27111 | -207298 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.9% |
| 20260539 | grocery | retail-steady | - | - | 30 | -40759438475195120 (364) | -25754 | -339856 | -40759438475195100 | 38.8% | 26.8% | 8839710675900888u/17679421351801776 | 0/2/2 -96.9% |
| 20260540 | convenience | idle | - | - | 63 | -131754 (365) | 16364 | -12660 | -131754 | 90.1% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260540 | convenience | retail-steady | - | - | 21 | -35082390868656560 (365) | -20090 | -1075186 | -35082390868656560 | 25.0% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260540 | convenience | advisor | - | - | 21 | -35082390868663550 (365) | -22405 | -1078341 | -35082390868663550 | 25.0% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260540 | boutique | idle | 2-8 | - | 120 | -80966 (364) | 28737 | 4945 | -79042 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260540 | boutique | retail-steady | 2-8 | 12-41 | 21 | -27002 (35) | -25640 | 3799 | 223206 | 5.5% | 3.5% | 0u/0 | 0/3/3 -65.2% |
| 20260540 | electronics | idle | - | - | 91 | -103072 (364) | 33529 | 1975 | -100602 | 81.6% | 71.2% | 0u/0 | 0/1/1 -70.7% |
| 20260540 | electronics | retail-steady | 4-10 | - | 7 | -124140 (364) | -33273 | -38875 | -120090 | 2.3% | 1.7% | 0u/0 | 0/3/3 -58.4% |
| 20260540 | grocery | idle | - | - | 60 | -213538 (364) | 17023 | -28665 | -213538 | 79.7% | 71.2% | 0u/0 | 0/1/1 -97.8% |
| 20260540 | grocery | retail-steady | - | - | 30 | -448159 (365) | -25736 | -101624 | -448159 | 2.9% | 2.3% | 0u/0 | 0/2/2 -97.0% |
| 20260541 | convenience | idle | - | - | 63 | -130203 (365) | 16494 | -12270 | -130203 | 90.0% | 68.8% | 0u/0 | 0/1/1 -98.3% |
| 20260541 | convenience | retail-steady | - | - | 21 | -35082390868657668 (365) | -20738 | -1232610 | -35082390868657668 | 30.8% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260541 | convenience | advisor | - | - | 21 | -35082390868664990 (365) | -23366 | -1236078 | -35082390868664990 | 30.8% | 2.7% | 0u/0 | 0/2/2 -97.6% |
| 20260541 | boutique | idle | 2-8 | - | 120 | -79370 (364) | 28870 | 5344 | -77484 | 81.4% | 71.2% | 0u/0 | 0/1/1 -77.5% |
| 20260541 | boutique | retail-steady | 2-8 | 41-70 | 21 | -42736 (60) | -31563 | -36347 | 3413 | 4.3% | 2.9% | 0u/0 | 0/3/3 -66.3% |
| 20260541 | electronics | idle | - | - | 91 | -101476 (364) | 33662 | 2374 | -99054 | 82.1% | 71.2% | 0u/0 | 0/1/1 -70.9% |
| 20260541 | electronics | retail-steady | 4-10 | - | 7 | -98185 (364) | -32867 | -34284 | -94375 | 2.3% | 1.8% | 0u/0 | 0/3/3 -58.5% |
| 20260541 | grocery | idle | - | - | 60 | -211342 (365) | 17207 | -28113 | -211342 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.0% |
| 20260541 | grocery | retail-steady | - | - | 30 | -63851201203306260 (365) | -25235 | -354759 | -63851201203306260 | 42.9% | 27.7% | 11402556351558800u/22805112703117600 | 0/2/2 -97.0% |
| 20260542 | convenience | idle | - | - | 63 | -131034 (365) | 16424 | -12480 | -131034 | 90.0% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260542 | convenience | retail-steady | - | - | 21 | -35082390868659016 (365) | -20525 | -1182227 | -35082390868659016 | 33.0% | 2.5% | 0u/0 | 0/2/2 -97.5% |
| 20260542 | convenience | advisor | - | - | 21 | -35082390868666320 (365) | -23153 | -1185695 | -35082390868666320 | 33.0% | 2.5% | 0u/0 | 0/2/2 -97.5% |
| 20260542 | boutique | idle | 2-8 | - | 120 | -80186 (364) | 28802 | 5140 | -78300 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260542 | boutique | retail-steady | 2-8 | 12-41 | 21 | -38481 (35) | -20357 | 7246 | 204507 | 6.2% | 3.9% | 0u/0 | 0/3/3 -65.1% |
| 20260542 | electronics | idle | - | - | 91 | -102292 (364) | 33594 | 2170 | -99870 | 80.1% | 71.2% | 0u/0 | 0/1/1 -70.6% |
| 20260542 | electronics | retail-steady | 4-10 | - | 7 | -134241 (364) | -33865 | -39897 | -130527 | 2.2% | 1.7% | 0u/0 | 0/3/3 -60.2% |
| 20260542 | grocery | idle | - | - | 60 | -211558 (365) | 17189 | -28167 | -211558 | 81.5% | 71.2% | 0u/0 | 0/1/1 -97.8% |
| 20260542 | grocery | retail-steady | - | - | 30 | -439818 (365) | -25608 | -99936 | -439818 | 3.1% | 2.6% | 0u/0 | 0/2/2 -97.1% |
| 20260543 | convenience | idle | - | - | 65 | -129549 (365) | 16555 | -12180 | -129549 | 90.1% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260543 | convenience | retail-steady | - | - | 21 | -35082390868654000 (365) | -20576 | -1231792 | -35082390868654000 | 28.6% | 2.6% | 0u/0 | 0/2/2 -97.5% |
| 20260543 | convenience | advisor | - | - | 21 | -35082390868661320 (365) | -23204 | -1235260 | -35082390868661320 | 28.6% | 2.6% | 0u/0 | 0/2/2 -97.5% |
| 20260543 | boutique | idle | 2-8 | - | 120 | -78578 (364) | 28936 | 5542 | -76616 | 81.4% | 71.2% | 0u/0 | 0/1/1 -77.3% |
| 20260543 | boutique | retail-steady | 2-8 | 40-69 | 21 | -40709 (60) | -30791 | -34531 | 6437 | 4.1% | 2.8% | 0u/0 | 0/3/3 -66.0% |
| 20260543 | electronics | idle | 9-15 | - | 91 | -100684 (364) | 33728 | 2572 | -98166 | 81.0% | 71.2% | 0u/0 | 0/1/1 -70.7% |
| 20260543 | electronics | retail-steady | 4-10 | - | 7 | -115195 (364) | -32226 | -35768 | -111337 | 2.2% | 1.7% | 0u/0 | 0/3/3 -58.7% |
| 20260543 | grocery | idle | - | - | 60 | -209334 (365) | 17374 | -27612 | -209334 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.9% |
| 20260543 | grocery | retail-steady | - | - | 30 | -63514142080012940 (364) | -25240 | -374538 | -63514142080012940 | 42.2% | 28.2% | 12203242779544266u/24406485559088532 | 0/2/2 -97.1% |
| 20260544 | convenience | idle | - | - | 63 | -130284 (364) | 16485 | -12297 | -130275 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260544 | convenience | retail-steady | - | - | 21 | -35082390868652720 (365) | -19229 | -783079 | -35082390868652720 | 26.9% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260544 | convenience | advisor | - | - | 21 | -35082390868660030 (365) | -21831 | -786521 | -35082390868660030 | 26.9% | 2.9% | 0u/0 | 0/2/2 -97.6% |
| 20260544 | boutique | idle | 2-8 | - | 120 | -79394 (364) | 28868 | 5338 | -77280 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260544 | boutique | retail-steady | 2-8 | 6-35 | 14 | -24446 (30) | -24446 | 29760 | 274345 | 3.9% | 2.6% | 0u/0 | 0/3/3 -65.1% |
| 20260544 | electronics | idle | - | - | 91 | -101500 (364) | 33612 | 2368 | -99702 | 70.9% | 64.9% | 0u/0 | 0/1/1 -70.7% |
| 20260544 | electronics | retail-steady | 5-11 | - | 7 | -225590 (364) | -33041 | -58191 | -222836 | 1.5% | 1.1% | 0u/0 | 0/3/3 -61.6% |
| 20260544 | grocery | idle | - | - | 60 | -209542 (364) | 17356 | -27666 | -209518 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.0% |
| 20260544 | grocery | retail-steady | - | - | 30 | -6360440231744666 (364) | -24129 | -170439 | -6360440231744630 | 35.6% | 25.9% | 766986022363024u/1533972044726048 | 0/2/2 -97.1% |
| 20260545 | convenience | idle | - | - | 60 | -137151 (365) | 15914 | -14010 | -137151 | 90.1% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260545 | convenience | retail-steady | - | - | 21 | -35082390868659612 (365) | -20543 | -1126596 | -35082390868659612 | 27.9% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260545 | convenience | advisor | - | - | 20 | -35082390868666936 (365) | -23171 | -1130064 | -35082390868666936 | 27.9% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260545 | boutique | idle | 3-9 | - | 120 | -86222 (364) | 28299 | 3631 | -84298 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.4% |
| 20260545 | boutique | retail-steady | 2-8 | 6-35 | 14 | -24987 (30) | -24987 | 28911 | 271358 | 3.8% | 2.7% | 0u/0 | 0/3/3 -64.3% |
| 20260545 | electronics | idle | 156-162 | - | 91 | -108328 (364) | 33091 | 661 | -106194 | 74.3% | 71.2% | 0u/0 | 0/1/1 -70.8% |
| 20260545 | electronics | retail-steady | 5-11 | - | 7 | -204113 (364) | -33528 | -55438 | -200927 | 1.8% | 1.2% | 0u/0 | 0/3/3 -61.5% |
| 20260545 | grocery | idle | - | - | 60 | -215782 (365) | 16837 | -29223 | -215782 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.8% |
| 20260545 | grocery | retail-steady | - | - | 30 | -52487824413174760 (365) | -25605 | -392841 | -52487824413174760 | 42.0% | 27.0% | 11414234213950196u/22828468427900390 | 0/2/2 -97.0% |
| 20260546 | convenience | idle | - | - | 65 | -129643 (365) | 16545 | -12178 | -129643 | 80.8% | 70.1% | 0u/0 | 0/1/1 -98.3% |
| 20260546 | convenience | retail-steady | - | - | 23 | -277097 (365) | -17457 | -63771 | -277097 | 3.0% | 2.3% | 0u/0 | 0/2/2 -97.7% |
| 20260546 | convenience | advisor | - | - | 19 | -284013 (365) | -19683 | -66837 | -284013 | 3.0% | 2.3% | 0u/0 | 0/2/2 -97.7% |
| 20260546 | boutique | idle | 2-8 | - | 120 | -78614 (364) | 28933 | 5533 | -76804 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.5% |
| 20260546 | boutique | retail-steady | 2-8 | 8-37 | 21 | -27254 (35) | -25626 | 6784 | 247264 | 5.6% | 3.4% | 0u/0 | 0/3/3 -65.5% |
| 20260546 | electronics | idle | 9-15 | - | 91 | -100720 (364) | 33725 | 2563 | -98394 | 79.3% | 71.2% | 0u/0 | 0/1/1 -70.9% |
| 20260546 | electronics | retail-steady | 4-10 | - | 7 | -136007 (364) | -33295 | -41087 | -132389 | 2.1% | 1.7% | 0u/0 | 0/3/3 -59.4% |
| 20260546 | grocery | idle | - | - | 60 | -207558 (365) | 17522 | -27168 | -207558 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.0% |
| 20260546 | grocery | retail-steady | - | - | 30 | -58260017029640960 (365) | -25312 | -431640 | -58260017029640960 | 42.9% | 27.0% | 12275291091157356u/24550582182314710 | 0/2/2 -97.1% |
| 20260547 | convenience | idle | - | - | 63 | -130392 (364) | 16476 | -12324 | -130389 | 90.0% | 71.5% | 0u/0 | 0/1/1 -98.3% |
| 20260547 | convenience | retail-steady | - | - | 28 | -17768265313697106 (364) | -18251 | -212748 | -17768265313697076 | 16.5% | 3.3% | 0u/0 | 0/2/2 -97.6% |
| 20260547 | convenience | advisor | - | - | 21 | -17768265313703724 (364) | -20198 | -215535 | -17768265313703708 | 16.5% | 3.3% | 0u/0 | 0/2/2 -97.6% |
| 20260547 | boutique | idle | 2-8 | - | 120 | -79418 (364) | 28866 | 5332 | -76240 | 89.9% | 76.2% | 0u/0 | 0/1/1 -77.3% |
| 20260547 | boutique | retail-steady | 2-8 | 8-37 | 21 | -30017 (35) | -24121 | 9825 | 249313 | 5.8% | 3.8% | 0u/0 | 0/3/3 -65.5% |
| 20260547 | electronics | idle | 261-267 | - | 91 | -101524 (364) | 33658 | 2362 | -98670 | 79.5% | 71.2% | 0u/0 | 0/1/1 -70.7% |
| 20260547 | electronics | retail-steady | 4-10 | - | 7 | -129916 (364) | -31654 | -38378 | -126490 | 2.2% | 1.8% | 0u/0 | 0/3/3 -60.5% |
| 20260547 | grocery | idle | - | - | 60 | -207754 (364) | 17505 | -27219 | -207702 | 82.8% | 71.2% | 0u/0 | 0/1/1 -97.9% |
| 20260547 | grocery | retail-steady | - | - | 30 | -430260 (365) | -24633 | -97509 | -430260 | 3.3% | 2.6% | 0u/0 | 0/2/2 -97.1% |
| 20260548 | convenience | idle | - | - | 65 | -129084 (364) | 16606 | -12186 | -129045 | 83.0% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260548 | convenience | retail-steady | - | - | 23 | -271585 (365) | -17181 | -62504 | -271585 | 3.3% | 2.6% | 0u/0 | 0/2/2 -97.7% |
| 20260548 | convenience | advisor | - | - | 20 | -278383 (365) | -19289 | -65452 | -278383 | 3.3% | 2.6% | 0u/0 | 0/2/2 -97.7% |
| 20260548 | boutique | idle | 2-8 | - | 120 | -77822 (364) | 28999 | 5731 | -75176 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.3% |
| 20260548 | boutique | retail-steady | 2-8 | 5-34 | 14 | -24675 (30) | -24675 | 29835 | 276345 | 3.9% | 2.7% | 0u/0 | 0/3/3 -64.3% |
| 20260548 | electronics | idle | - | - | 91 | -99928 (364) | 33791 | 2761 | -97170 | 78.4% | 71.2% | 0u/0 | 0/1/1 -70.7% |
| 20260548 | electronics | retail-steady | 4-10 | - | 7 | -135438 (364) | -32045 | -39987 | -131868 | 2.1% | 1.6% | 0u/0 | 0/3/3 -60.4% |
| 20260548 | grocery | idle | - | - | 60 | -205558 (364) | 17688 | -26670 | -205490 | 90.1% | 71.5% | 0u/0 | 0/1/1 -97.9% |
| 20260548 | grocery | retail-steady | - | - | 30 | -41646017447692390 (365) | -24778 | -363762 | -41646017447692390 | 26.0% | 15.3% | 10224064858304704u/20448129716609410 | 0/2/2 -97.0% |
| 20260549 | convenience | idle | - | - | 65 | -129751 (364) | 16536 | -12223 | -129751 | 90.1% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260549 | convenience | retail-steady | - | - | 21 | -35082390868647024 (365) | -19425 | -852242 | -35082390868647024 | 25.0% | 2.9% | 0u/0 | 0/2/2 -97.7% |
| 20260549 | convenience | advisor | - | - | 20 | -35082390868654336 (365) | -22053 | -855710 | -35082390868654336 | 25.0% | 2.9% | 0u/0 | 0/2/2 -97.7% |
| 20260549 | boutique | idle | 2-8 | - | 120 | -78638 (364) | 28931 | 5527 | -76410 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.5% |
| 20260549 | boutique | retail-steady | 2-8 | 8-37 | 21 | -29390 (30) | -29390 | 3980 | 247699 | 5.4% | 3.4% | 0u/0 | 0/3/3 -64.9% |
| 20260549 | electronics | idle | 9-15 | - | 91 | -100744 (364) | 33723 | 2557 | -98466 | 73.7% | 71.2% | 0u/0 | 0/1/1 -70.9% |
| 20260549 | electronics | retail-steady | 5-11 | - | 7 | -203499 (364) | -33384 | -55738 | -200505 | 1.8% | 1.1% | 0u/0 | 0/3/3 -61.5% |
| 20260549 | grocery | idle | - | - | 60 | -205762 (364) | 17671 | -26721 | -205738 | 90.1% | 71.5% | 0u/0 | 0/1/1 -98.0% |
| 20260549 | grocery | retail-steady | - | - | 30 | -42398249655880020 (364) | -25341 | -406445 | -42398249655880000 | 39.8% | 27.0% | 10534483347847596u/21068966695695190 | 0/2/2 -97.2% |
| 20260550 | convenience | idle | - | - | 60 | -136527 (365) | 15966 | -13854 | -136527 | 90.1% | 71.2% | 0u/0 | 0/1/1 -98.3% |
| 20260550 | convenience | retail-steady | - | - | 28 | -35082390868661452 (365) | -20324 | -855621 | -35082390868661452 | 26.1% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260550 | convenience | advisor | - | - | 21 | -35082390868668460 (365) | -22620 | -858757 | -35082390868668460 | 26.1% | 3.0% | 0u/0 | 0/2/2 -97.6% |
| 20260550 | boutique | idle | 2-8 | - | 120 | -85442 (364) | 28364 | 3826 | -83556 | 90.0% | 71.5% | 0u/0 | 0/1/1 -77.5% |
| 20260550 | boutique | retail-steady | 2-8 | 6-35 | 14 | -25225 (30) | -25225 | 27229 | 260547 | 4.5% | 3.0% | 0u/0 | 0/3/3 -64.5% |
| 20260550 | electronics | idle | - | - | 91 | -107548 (364) | 33156 | 856 | -105126 | 79.8% | 71.2% | 0u/0 | 0/1/1 -70.9% |
| 20260550 | electronics | retail-steady | 4-10 | - | 7 | -134478 (364) | -33256 | -41148 | -130572 | 2.1% | 1.6% | 0u/0 | 0/3/3 -59.9% |
| 20260550 | grocery | idle | - | - | 60 | -217978 (364) | 16653 | -29775 | -217970 | 80.8% | 71.2% | 0u/0 | 0/1/1 -97.8% |
| 20260550 | grocery | retail-steady | - | - | 30 | -441591 (365) | -25208 | -100052 | -441591 | 3.2% | 2.5% | 0u/0 | 0/2/2 -97.0% |

## Measured exceptions

- seed 20260501 convenience/idle: negative cash from day 65
- seed 20260501 convenience/retail-steady: negative cash from day 21
- seed 20260501 convenience/advisor: negative cash from day 20; producer stalled 348d (days 18-365)
- seed 20260501 boutique/idle: negative cash from day 120
- seed 20260501 boutique/retail-steady: negative cash from day 21
- seed 20260501 electronics/idle: negative cash from day 91
- seed 20260501 electronics/retail-steady: negative cash from day 7
- seed 20260501 grocery/idle: negative cash from day 60
- seed 20260501 grocery/retail-steady: negative cash from day 30
- seed 20260502 convenience/idle: negative cash from day 60
- seed 20260502 convenience/retail-steady: negative cash from day 21
- seed 20260502 convenience/advisor: negative cash from day 17; producer stalled 348d (days 18-365)
- seed 20260502 boutique/idle: negative cash from day 120
- seed 20260502 boutique/retail-steady: negative cash from day 21
- seed 20260502 electronics/idle: negative cash from day 91
- seed 20260502 electronics/retail-steady: negative cash from day 7
- seed 20260502 grocery/idle: negative cash from day 60
- seed 20260502 grocery/retail-steady: negative cash from day 30
- seed 20260503 convenience/idle: negative cash from day 65
- seed 20260503 convenience/retail-steady: negative cash from day 21
- seed 20260503 convenience/advisor: negative cash from day 16; producer stalled 348d (days 18-365)
- seed 20260503 boutique/idle: negative cash from day 120
- seed 20260503 boutique/retail-steady: negative cash from day 21
- seed 20260503 electronics/idle: negative cash from day 91
- seed 20260503 electronics/retail-steady: negative cash from day 7
- seed 20260503 grocery/idle: negative cash from day 60
- seed 20260503 grocery/retail-steady: negative cash from day 30
- seed 20260504 convenience/idle: negative cash from day 65
- seed 20260504 convenience/retail-steady: negative cash from day 21
- seed 20260504 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260504 boutique/idle: negative cash from day 120
- seed 20260504 boutique/retail-steady: negative cash from day 21
- seed 20260504 electronics/idle: negative cash from day 91
- seed 20260504 electronics/retail-steady: negative cash from day 7
- seed 20260504 grocery/idle: negative cash from day 60
- seed 20260504 grocery/retail-steady: negative cash from day 30
- seed 20260505 convenience/idle: negative cash from day 60
- seed 20260505 convenience/retail-steady: negative cash from day 21
- seed 20260505 convenience/advisor: negative cash from day 20; producer stalled 348d (days 18-365)
- seed 20260505 boutique/idle: negative cash from day 120
- seed 20260505 boutique/retail-steady: negative cash from day 21
- seed 20260505 electronics/idle: negative cash from day 91
- seed 20260505 electronics/retail-steady: negative cash from day 7
- seed 20260505 grocery/idle: negative cash from day 60
- seed 20260505 grocery/retail-steady: negative cash from day 30
- seed 20260506 convenience/idle: negative cash from day 65
- seed 20260506 convenience/retail-steady: negative cash from day 21
- seed 20260506 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260506 boutique/idle: negative cash from day 120
- seed 20260506 boutique/retail-steady: negative cash from day 21
- seed 20260506 electronics/idle: negative cash from day 91
- seed 20260506 electronics/retail-steady: negative cash from day 7
- seed 20260506 grocery/idle: negative cash from day 60
- seed 20260506 grocery/retail-steady: negative cash from day 30
- seed 20260507 convenience/idle: negative cash from day 60
- seed 20260507 convenience/retail-steady: negative cash from day 28
- seed 20260507 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260507 boutique/idle: negative cash from day 120
- seed 20260507 boutique/retail-steady: negative cash from day 14
- seed 20260507 electronics/idle: negative cash from day 91
- seed 20260507 electronics/retail-steady: negative cash from day 7
- seed 20260507 grocery/idle: negative cash from day 60
- seed 20260507 grocery/retail-steady: negative cash from day 30
- seed 20260508 convenience/idle: negative cash from day 65
- seed 20260508 convenience/retail-steady: negative cash from day 21
- seed 20260508 convenience/advisor: negative cash from day 19; producer stalled 348d (days 18-365)
- seed 20260508 boutique/idle: negative cash from day 120
- seed 20260508 boutique/retail-steady: negative cash from day 21
- seed 20260508 electronics/idle: negative cash from day 91
- seed 20260508 electronics/retail-steady: negative cash from day 7
- seed 20260508 grocery/idle: negative cash from day 60
- seed 20260508 grocery/retail-steady: negative cash from day 30
- seed 20260509 convenience/idle: negative cash from day 61
- seed 20260509 convenience/retail-steady: negative cash from day 21
- seed 20260509 convenience/advisor: negative cash from day 19; producer stalled 348d (days 18-365)
- seed 20260509 boutique/idle: negative cash from day 120
- seed 20260509 boutique/retail-steady: negative cash from day 21
- seed 20260509 electronics/idle: negative cash from day 91
- seed 20260509 electronics/retail-steady: negative cash from day 7
- seed 20260509 grocery/idle: negative cash from day 60
- seed 20260509 grocery/retail-steady: negative cash from day 30
- seed 20260510 convenience/idle: negative cash from day 60
- seed 20260510 convenience/retail-steady: negative cash from day 21
- seed 20260510 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260510 boutique/idle: negative cash from day 120
- seed 20260510 boutique/retail-steady: negative cash from day 21
- seed 20260510 electronics/idle: negative cash from day 91
- seed 20260510 electronics/retail-steady: negative cash from day 7
- seed 20260510 grocery/idle: negative cash from day 60
- seed 20260510 grocery/retail-steady: negative cash from day 30
- seed 20260511 convenience/idle: negative cash from day 65
- seed 20260511 convenience/retail-steady: negative cash from day 23
- seed 20260511 convenience/advisor: negative cash from day 16; producer stalled 348d (days 18-365)
- seed 20260511 boutique/idle: negative cash from day 120
- seed 20260511 boutique/retail-steady: negative cash from day 21
- seed 20260511 electronics/idle: negative cash from day 91
- seed 20260511 electronics/retail-steady: negative cash from day 7
- seed 20260511 grocery/idle: negative cash from day 60
- seed 20260511 grocery/retail-steady: negative cash from day 30
- seed 20260512 convenience/idle: negative cash from day 61
- seed 20260512 convenience/retail-steady: negative cash from day 21
- seed 20260512 convenience/advisor: negative cash from day 18; producer stalled 348d (days 18-365)
- seed 20260512 boutique/idle: negative cash from day 120
- seed 20260512 boutique/retail-steady: negative cash from day 21
- seed 20260512 electronics/idle: negative cash from day 91
- seed 20260512 electronics/retail-steady: negative cash from day 7
- seed 20260512 grocery/idle: negative cash from day 60
- seed 20260512 grocery/retail-steady: negative cash from day 30
- seed 20260513 convenience/idle: negative cash from day 65
- seed 20260513 convenience/retail-steady: negative cash from day 23
- seed 20260513 convenience/advisor: negative cash from day 18; producer stalled 348d (days 18-365)
- seed 20260513 boutique/idle: negative cash from day 120
- seed 20260513 boutique/retail-steady: negative cash from day 21
- seed 20260513 electronics/idle: negative cash from day 91
- seed 20260513 electronics/retail-steady: negative cash from day 7
- seed 20260513 grocery/idle: negative cash from day 60
- seed 20260513 grocery/retail-steady: negative cash from day 30
- seed 20260514 convenience/idle: negative cash from day 61
- seed 20260514 convenience/retail-steady: negative cash from day 21
- seed 20260514 convenience/advisor: negative cash from day 19; producer stalled 348d (days 18-365)
- seed 20260514 boutique/idle: negative cash from day 120
- seed 20260514 boutique/retail-steady: negative cash from day 21
- seed 20260514 electronics/idle: negative cash from day 91
- seed 20260514 electronics/retail-steady: negative cash from day 7
- seed 20260514 grocery/idle: negative cash from day 60
- seed 20260514 grocery/retail-steady: negative cash from day 30
- seed 20260515 convenience/idle: negative cash from day 60
- seed 20260515 convenience/retail-steady: negative cash from day 23
- seed 20260515 convenience/advisor: negative cash from day 20; producer stalled 348d (days 18-365)
- seed 20260515 boutique/idle: negative cash from day 120
- seed 20260515 boutique/retail-steady: negative cash from day 21
- seed 20260515 electronics/idle: negative cash from day 91
- seed 20260515 electronics/retail-steady: negative cash from day 7
- seed 20260515 grocery/idle: negative cash from day 60
- seed 20260515 grocery/retail-steady: negative cash from day 30
- seed 20260516 convenience/idle: negative cash from day 65
- seed 20260516 convenience/retail-steady: negative cash from day 21
- seed 20260516 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260516 boutique/idle: negative cash from day 120
- seed 20260516 boutique/retail-steady: negative cash from day 21
- seed 20260516 electronics/idle: negative cash from day 91
- seed 20260516 electronics/retail-steady: negative cash from day 7
- seed 20260516 grocery/idle: negative cash from day 60
- seed 20260516 grocery/retail-steady: negative cash from day 30
- seed 20260517 convenience/idle: negative cash from day 61
- seed 20260517 convenience/retail-steady: negative cash from day 28
- seed 20260517 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260517 boutique/idle: negative cash from day 120
- seed 20260517 boutique/retail-steady: negative cash from day 14
- seed 20260517 electronics/idle: negative cash from day 91
- seed 20260517 electronics/retail-steady: negative cash from day 7
- seed 20260517 grocery/idle: negative cash from day 60
- seed 20260517 grocery/retail-steady: negative cash from day 30
- seed 20260518 convenience/idle: negative cash from day 65
- seed 20260518 convenience/retail-steady: negative cash from day 21
- seed 20260518 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260518 boutique/idle: negative cash from day 120
- seed 20260518 boutique/retail-steady: negative cash from day 14
- seed 20260518 electronics/idle: negative cash from day 98
- seed 20260518 electronics/retail-steady: negative cash from day 7
- seed 20260518 grocery/idle: negative cash from day 60
- seed 20260518 grocery/retail-steady: negative cash from day 30
- seed 20260519 convenience/idle: negative cash from day 62
- seed 20260519 convenience/retail-steady: negative cash from day 21
- seed 20260519 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260519 boutique/idle: negative cash from day 120
- seed 20260519 boutique/retail-steady: negative cash from day 21
- seed 20260519 electronics/idle: negative cash from day 91
- seed 20260519 electronics/retail-steady: negative cash from day 7
- seed 20260519 grocery/idle: negative cash from day 60
- seed 20260519 grocery/retail-steady: negative cash from day 30
- seed 20260520 convenience/idle: negative cash from day 61
- seed 20260520 convenience/retail-steady: negative cash from day 28
- seed 20260520 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260520 boutique/idle: negative cash from day 120
- seed 20260520 boutique/retail-steady: negative cash from day 14
- seed 20260520 electronics/idle: negative cash from day 91
- seed 20260520 electronics/retail-steady: negative cash from day 7
- seed 20260520 grocery/idle: negative cash from day 60
- seed 20260520 grocery/retail-steady: negative cash from day 30
- seed 20260521 convenience/idle: negative cash from day 62
- seed 20260521 convenience/retail-steady: negative cash from day 23
- seed 20260521 convenience/advisor: negative cash from day 16; producer stalled 348d (days 18-365)
- seed 20260521 boutique/idle: negative cash from day 120
- seed 20260521 boutique/retail-steady: negative cash from day 21
- seed 20260521 electronics/idle: negative cash from day 91
- seed 20260521 electronics/retail-steady: negative cash from day 7
- seed 20260521 grocery/idle: negative cash from day 60
- seed 20260521 grocery/retail-steady: negative cash from day 30
- seed 20260522 convenience/idle: negative cash from day 62
- seed 20260522 convenience/retail-steady: negative cash from day 21
- seed 20260522 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260522 boutique/idle: negative cash from day 120
- seed 20260522 boutique/retail-steady: negative cash from day 14
- seed 20260522 electronics/idle: negative cash from day 91
- seed 20260522 electronics/retail-steady: negative cash from day 7
- seed 20260522 grocery/idle: negative cash from day 60
- seed 20260522 grocery/retail-steady: negative cash from day 30
- seed 20260523 convenience/idle: negative cash from day 65
- seed 20260523 convenience/retail-steady: negative cash from day 23
- seed 20260523 convenience/advisor: negative cash from day 19; producer stalled 348d (days 18-365)
- seed 20260523 boutique/idle: negative cash from day 120
- seed 20260523 boutique/retail-steady: negative cash from day 21
- seed 20260523 electronics/idle: negative cash from day 112
- seed 20260523 electronics/retail-steady: negative cash from day 7
- seed 20260523 grocery/idle: negative cash from day 60
- seed 20260523 grocery/retail-steady: negative cash from day 30
- seed 20260524 convenience/idle: negative cash from day 62
- seed 20260524 convenience/retail-steady: negative cash from day 21
- seed 20260524 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260524 boutique/idle: negative cash from day 120
- seed 20260524 boutique/retail-steady: negative cash from day 14
- seed 20260524 electronics/idle: negative cash from day 91
- seed 20260524 electronics/retail-steady: negative cash from day 7
- seed 20260524 grocery/idle: negative cash from day 60
- seed 20260524 grocery/retail-steady: negative cash from day 30
- seed 20260525 convenience/idle: negative cash from day 62
- seed 20260525 convenience/retail-steady: negative cash from day 23
- seed 20260525 convenience/advisor: negative cash from day 18; producer stalled 348d (days 18-365)
- seed 20260525 boutique/idle: negative cash from day 120
- seed 20260525 boutique/retail-steady: negative cash from day 21
- seed 20260525 electronics/idle: negative cash from day 91
- seed 20260525 electronics/retail-steady: negative cash from day 7
- seed 20260525 grocery/idle: negative cash from day 60
- seed 20260525 grocery/retail-steady: negative cash from day 30
- seed 20260526 convenience/idle: negative cash from day 63
- seed 20260526 convenience/retail-steady: negative cash from day 28
- seed 20260526 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260526 boutique/idle: negative cash from day 120
- seed 20260526 boutique/retail-steady: negative cash from day 14
- seed 20260526 electronics/idle: negative cash from day 91
- seed 20260526 electronics/retail-steady: negative cash from day 7
- seed 20260526 grocery/idle: negative cash from day 60
- seed 20260526 grocery/retail-steady: negative cash from day 30
- seed 20260527 convenience/idle: negative cash from day 62
- seed 20260527 convenience/retail-steady: negative cash from day 21
- seed 20260527 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260527 boutique/idle: negative cash from day 120
- seed 20260527 boutique/retail-steady: negative cash from day 21
- seed 20260527 electronics/idle: negative cash from day 91
- seed 20260527 electronics/retail-steady: negative cash from day 7
- seed 20260527 grocery/idle: negative cash from day 60
- seed 20260527 grocery/retail-steady: negative cash from day 30
- seed 20260528 convenience/idle: negative cash from day 66
- seed 20260528 convenience/retail-steady: negative cash from day 21
- seed 20260528 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260528 boutique/idle: negative cash from day 120
- seed 20260528 boutique/retail-steady: negative cash from day 21
- seed 20260528 electronics/idle: negative cash from day 120
- seed 20260528 electronics/retail-steady: negative cash from day 7
- seed 20260528 grocery/idle: negative cash from day 60
- seed 20260528 grocery/retail-steady: negative cash from day 30
- seed 20260529 convenience/idle: negative cash from day 63
- seed 20260529 convenience/retail-steady: negative cash from day 21
- seed 20260529 convenience/advisor: negative cash from day 18; producer stalled 348d (days 18-365)
- seed 20260529 boutique/idle: negative cash from day 120
- seed 20260529 boutique/retail-steady: negative cash from day 21
- seed 20260529 electronics/idle: negative cash from day 91
- seed 20260529 electronics/retail-steady: negative cash from day 7
- seed 20260529 grocery/idle: negative cash from day 60
- seed 20260529 grocery/retail-steady: negative cash from day 30
- seed 20260530 convenience/idle: negative cash from day 62
- seed 20260530 convenience/retail-steady: negative cash from day 21
- seed 20260530 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260530 boutique/idle: negative cash from day 120
- seed 20260530 boutique/retail-steady: negative cash from day 21
- seed 20260530 electronics/idle: negative cash from day 91
- seed 20260530 electronics/retail-steady: negative cash from day 7
- seed 20260530 grocery/idle: negative cash from day 60
- seed 20260530 grocery/retail-steady: negative cash from day 30
- seed 20260531 convenience/idle: negative cash from day 63
- seed 20260531 convenience/retail-steady: negative cash from day 21
- seed 20260531 convenience/advisor: negative cash from day 20; producer stalled 348d (days 18-365)
- seed 20260531 boutique/idle: negative cash from day 120
- seed 20260531 boutique/retail-steady: negative cash from day 21
- seed 20260531 electronics/idle: negative cash from day 91
- seed 20260531 electronics/retail-steady: negative cash from day 7
- seed 20260531 grocery/idle: negative cash from day 60
- seed 20260531 grocery/retail-steady: negative cash from day 30
- seed 20260532 convenience/idle: negative cash from day 63
- seed 20260532 convenience/retail-steady: negative cash from day 21
- seed 20260532 convenience/advisor: negative cash from day 19; producer stalled 348d (days 18-365)
- seed 20260532 boutique/idle: negative cash from day 120
- seed 20260532 boutique/retail-steady: negative cash from day 21
- seed 20260532 electronics/idle: negative cash from day 91
- seed 20260532 electronics/retail-steady: negative cash from day 7
- seed 20260532 grocery/idle: negative cash from day 60
- seed 20260532 grocery/retail-steady: negative cash from day 30
- seed 20260533 convenience/idle: negative cash from day 63
- seed 20260533 convenience/retail-steady: negative cash from day 21
- seed 20260533 convenience/advisor: negative cash from day 20; producer stalled 348d (days 18-365)
- seed 20260533 boutique/idle: negative cash from day 120
- seed 20260533 boutique/retail-steady: negative cash from day 21
- seed 20260533 electronics/idle: negative cash from day 91
- seed 20260533 electronics/retail-steady: negative cash from day 7
- seed 20260533 grocery/idle: negative cash from day 60
- seed 20260533 grocery/retail-steady: negative cash from day 30
- seed 20260534 convenience/idle: negative cash from day 63
- seed 20260534 convenience/retail-steady: negative cash from day 27
- seed 20260534 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260534 boutique/idle: negative cash from day 120
- seed 20260534 boutique/retail-steady: negative cash from day 14
- seed 20260534 electronics/idle: negative cash from day 91
- seed 20260534 electronics/retail-steady: negative cash from day 7
- seed 20260534 grocery/idle: negative cash from day 60
- seed 20260534 grocery/retail-steady: negative cash from day 30
- seed 20260535 convenience/idle: negative cash from day 63
- seed 20260535 convenience/retail-steady: negative cash from day 21
- seed 20260535 convenience/advisor: negative cash from day 20; producer stalled 348d (days 18-365)
- seed 20260535 boutique/idle: negative cash from day 120
- seed 20260535 boutique/retail-steady: negative cash from day 21
- seed 20260535 electronics/idle: negative cash from day 91
- seed 20260535 electronics/retail-steady: negative cash from day 7
- seed 20260535 grocery/idle: negative cash from day 60
- seed 20260535 grocery/retail-steady: negative cash from day 30
- seed 20260536 convenience/idle: negative cash from day 63
- seed 20260536 convenience/retail-steady: negative cash from day 21
- seed 20260536 convenience/advisor: negative cash from day 20; producer stalled 348d (days 18-365)
- seed 20260536 boutique/idle: negative cash from day 120
- seed 20260536 boutique/retail-steady: negative cash from day 21
- seed 20260536 electronics/idle: negative cash from day 91
- seed 20260536 electronics/retail-steady: negative cash from day 7
- seed 20260536 grocery/idle: negative cash from day 60
- seed 20260536 grocery/retail-steady: negative cash from day 30
- seed 20260537 convenience/idle: negative cash from day 63
- seed 20260537 convenience/retail-steady: negative cash from day 21
- seed 20260537 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260537 boutique/idle: negative cash from day 120
- seed 20260537 boutique/retail-steady: negative cash from day 21
- seed 20260537 electronics/idle: negative cash from day 91
- seed 20260537 electronics/retail-steady: negative cash from day 7
- seed 20260537 grocery/idle: negative cash from day 60
- seed 20260537 grocery/retail-steady: negative cash from day 30
- seed 20260538 convenience/idle: negative cash from day 64
- seed 20260538 convenience/retail-steady: negative cash from day 21
- seed 20260538 convenience/advisor: negative cash from day 20; producer stalled 348d (days 18-365)
- seed 20260538 boutique/idle: negative cash from day 120
- seed 20260538 boutique/retail-steady: negative cash from day 21
- seed 20260538 electronics/idle: negative cash from day 91
- seed 20260538 electronics/retail-steady: negative cash from day 7
- seed 20260538 grocery/idle: negative cash from day 60
- seed 20260538 grocery/retail-steady: negative cash from day 30
- seed 20260539 convenience/idle: negative cash from day 63
- seed 20260539 convenience/retail-steady: negative cash from day 21
- seed 20260539 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260539 boutique/idle: negative cash from day 120
- seed 20260539 boutique/retail-steady: negative cash from day 21
- seed 20260539 electronics/idle: negative cash from day 91
- seed 20260539 electronics/retail-steady: negative cash from day 7
- seed 20260539 grocery/idle: negative cash from day 60
- seed 20260539 grocery/retail-steady: negative cash from day 30
- seed 20260540 convenience/idle: negative cash from day 63
- seed 20260540 convenience/retail-steady: negative cash from day 21
- seed 20260540 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260540 boutique/idle: negative cash from day 120
- seed 20260540 boutique/retail-steady: negative cash from day 21
- seed 20260540 electronics/idle: negative cash from day 91
- seed 20260540 electronics/retail-steady: negative cash from day 7
- seed 20260540 grocery/idle: negative cash from day 60
- seed 20260540 grocery/retail-steady: negative cash from day 30
- seed 20260541 convenience/idle: negative cash from day 63
- seed 20260541 convenience/retail-steady: negative cash from day 21
- seed 20260541 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260541 boutique/idle: negative cash from day 120
- seed 20260541 boutique/retail-steady: negative cash from day 21
- seed 20260541 electronics/idle: negative cash from day 91
- seed 20260541 electronics/retail-steady: negative cash from day 7
- seed 20260541 grocery/idle: negative cash from day 60
- seed 20260541 grocery/retail-steady: negative cash from day 30
- seed 20260542 convenience/idle: negative cash from day 63
- seed 20260542 convenience/retail-steady: negative cash from day 21
- seed 20260542 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260542 boutique/idle: negative cash from day 120
- seed 20260542 boutique/retail-steady: negative cash from day 21
- seed 20260542 electronics/idle: negative cash from day 91
- seed 20260542 electronics/retail-steady: negative cash from day 7
- seed 20260542 grocery/idle: negative cash from day 60
- seed 20260542 grocery/retail-steady: negative cash from day 30
- seed 20260543 convenience/idle: negative cash from day 65
- seed 20260543 convenience/retail-steady: negative cash from day 21
- seed 20260543 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260543 boutique/idle: negative cash from day 120
- seed 20260543 boutique/retail-steady: negative cash from day 21
- seed 20260543 electronics/idle: negative cash from day 91
- seed 20260543 electronics/retail-steady: negative cash from day 7
- seed 20260543 grocery/idle: negative cash from day 60
- seed 20260543 grocery/retail-steady: negative cash from day 30
- seed 20260544 convenience/idle: negative cash from day 63
- seed 20260544 convenience/retail-steady: negative cash from day 21
- seed 20260544 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260544 boutique/idle: negative cash from day 120
- seed 20260544 boutique/retail-steady: negative cash from day 14
- seed 20260544 electronics/idle: negative cash from day 91
- seed 20260544 electronics/retail-steady: negative cash from day 7
- seed 20260544 grocery/idle: negative cash from day 60
- seed 20260544 grocery/retail-steady: negative cash from day 30
- seed 20260545 convenience/idle: negative cash from day 60
- seed 20260545 convenience/retail-steady: negative cash from day 21
- seed 20260545 convenience/advisor: negative cash from day 20; producer stalled 348d (days 18-365)
- seed 20260545 boutique/idle: negative cash from day 120
- seed 20260545 boutique/retail-steady: negative cash from day 14
- seed 20260545 electronics/idle: negative cash from day 91
- seed 20260545 electronics/retail-steady: negative cash from day 7
- seed 20260545 grocery/idle: negative cash from day 60
- seed 20260545 grocery/retail-steady: negative cash from day 30
- seed 20260546 convenience/idle: negative cash from day 65
- seed 20260546 convenience/retail-steady: negative cash from day 23
- seed 20260546 convenience/advisor: negative cash from day 19; producer stalled 348d (days 18-365)
- seed 20260546 boutique/idle: negative cash from day 120
- seed 20260546 boutique/retail-steady: negative cash from day 21
- seed 20260546 electronics/idle: negative cash from day 91
- seed 20260546 electronics/retail-steady: negative cash from day 7
- seed 20260546 grocery/idle: negative cash from day 60
- seed 20260546 grocery/retail-steady: negative cash from day 30
- seed 20260547 convenience/idle: negative cash from day 63
- seed 20260547 convenience/retail-steady: negative cash from day 28
- seed 20260547 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260547 boutique/idle: negative cash from day 120
- seed 20260547 boutique/retail-steady: negative cash from day 21
- seed 20260547 electronics/idle: negative cash from day 91
- seed 20260547 electronics/retail-steady: negative cash from day 7
- seed 20260547 grocery/idle: negative cash from day 60
- seed 20260547 grocery/retail-steady: negative cash from day 30
- seed 20260548 convenience/idle: negative cash from day 65
- seed 20260548 convenience/retail-steady: negative cash from day 23
- seed 20260548 convenience/advisor: negative cash from day 20; producer stalled 348d (days 18-365)
- seed 20260548 boutique/idle: negative cash from day 120
- seed 20260548 boutique/retail-steady: negative cash from day 14
- seed 20260548 electronics/idle: negative cash from day 91
- seed 20260548 electronics/retail-steady: negative cash from day 7
- seed 20260548 grocery/idle: negative cash from day 60
- seed 20260548 grocery/retail-steady: negative cash from day 30
- seed 20260549 convenience/idle: negative cash from day 65
- seed 20260549 convenience/retail-steady: negative cash from day 21
- seed 20260549 convenience/advisor: negative cash from day 20; producer stalled 348d (days 18-365)
- seed 20260549 boutique/idle: negative cash from day 120
- seed 20260549 boutique/retail-steady: negative cash from day 21
- seed 20260549 electronics/idle: negative cash from day 91
- seed 20260549 electronics/retail-steady: negative cash from day 7
- seed 20260549 grocery/idle: negative cash from day 60
- seed 20260549 grocery/retail-steady: negative cash from day 30
- seed 20260550 convenience/idle: negative cash from day 60
- seed 20260550 convenience/retail-steady: negative cash from day 28
- seed 20260550 convenience/advisor: negative cash from day 21; producer stalled 348d (days 18-365)
- seed 20260550 boutique/idle: negative cash from day 120
- seed 20260550 boutique/retail-steady: negative cash from day 14
- seed 20260550 electronics/idle: negative cash from day 91
- seed 20260550 electronics/retail-steady: negative cash from day 7
- seed 20260550 grocery/idle: negative cash from day 60
- seed 20260550 grocery/retail-steady: negative cash from day 30
