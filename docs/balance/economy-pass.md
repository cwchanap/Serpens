# HPA-721 Economy And Progression Acceptance

**Status: BLOCKED. This is an evidence checkpoint, not acceptance or merge approval.**
No pacing exception is approved. The targets, original progression-bot policy,
contiguous-prefix claim behavior, and Quarry Works reveal rules remain unchanged.
Work stays in [PR #73](https://github.com/cwchanap/Serpens/pull/73).

Latest bounded trial: the linked-price rebase is stopped at the scenario guard
and fully restored. First-profit no-action earns gold, matching its reference;
no candidate progression or cash-payback sweep follows that semantic failure.
The follow-up two-replay diagnosis identifies cash-flow scoring of repriced free
opening stock and the premium-price multiplier; no fix is applied.

## Source And Evidence Identity

| Evidence                         | Source                                                  | Meaning                                                                                                   |
| -------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Untuned gameplay                 | `b50c90c3788eed3a00e757593d9df13ab8534e4a`              | Gameplay-equivalent to the original capture at `4608b4f994c48deab432095ce38f37aa03d2e642`; not tuned HEAD |
| Current source under measurement | `3250caea0cc70eda4d592ad4406fe8fdf5c75cb1`              | Existing retained tuning, before any further accepted lever                                               |
| Rejected import-margin pilot     | `3250caea` plus the two-line patch described below      | Temporary experiment, restored; not the current economy                                                   |
| Rejected linked-price rebase     | `3250caea` plus `hpa-721-linked-screen-candidate.patch` | Scenario guard stop; restored before candidate economy measurement                                        |
| Final accepted source            | Not established                                         | Tuning and acceptance remain open                                                                         |

Generated JSON, logs, patches, and source manifests live in ignored
`docs/balance/generated/`. The four historical reports `baseline.md`, `after.md`,
`progression-calibration.md`, and `rail-throughput-calibration.md` remain frozen.

The saved `hpa-721-fix-progression.json` and `hpa-721-fix-gate.json` are **older
economy evidence**, not current-HEAD certification. Commit `3250caea` restored
`flour-mill.dailyOperatingCost` from 14 to 24. A comparison against the new pilot
exposed a non-boutique difference: grocery seed `20260515` had peak book value
110,545 in the older artifact versus 109,640 in the current-source pilot.
Do not attribute that difference to boutique tuning. The completed source-pinned
refresh uses the distinct `hpa-721-head-3250caea-*` prefix. It changes 49 saved
progression rows relative to the older tuned artifact, all grocery.

## Approved Gates

| Dimension                | Requirement                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Tier 3 reach             | At least 40/50 seeds per archetype                                                         |
| Tier 3 timing            | Median receipt day 90-150 among reached runs                                               |
| Tier 5 reach             | At least 25/50 seeds per archetype, by receipt day 365                                     |
| Tier 4 to Tier 5 spacing | Median of same-run receipt-day differences at least 30, separately per archetype           |
| Equity                   | Maximum/minimum archetype median peak book value at most 3; include all 50 runs            |
| Idle                     | 200 runs, zero claims and zero earned-but-unclaimed tiers                                  |
| Gate A                   | All five checks and complete 450-run coverage                                              |
| Scenarios                | Preserve reference/no-action challenge and medal separation; disclose any measured re-pins |

Same-day Tier-4/Tier-5 counts are diagnostics, not a separate zero-count gate.
A missing Tier-5 sample cannot pass spacing. Partial pilots cannot establish an
official progression or Gate A PASS.

## Untuned Reference

The preserved `hpa-721-progression-before.json` contains 200 progression and 200
idle runs. Re-evaluating that saved evidence with the current pacing evaluator
gives complete coverage and **FAIL**, not a new simulation.

| Archetype   | Tier 3 reached | Tier 3 median day | Tier 5 reached | Paired Tier 4 to 5 median | Same-day pairs | Median peak book value |
| ----------- | -------------: | ----------------: | -------------: | ------------------------- | -------------: | ---------------------: |
| convenience |          17/50 |               267 |           0/50 | unavailable               |              0 |              77,653.50 |
| boutique    |          44/50 |               197 |          44/50 | 0 days                    |             44 |             912,293.50 |
| electronics |          47/50 |               183 |           0/50 | unavailable               |              0 |             222,645.50 |
| grocery     |          46/50 |               204 |           0/50 | unavailable               |              0 |             106,557.50 |

Peak-median ratio: **11.748259898137238**. Idle claims and earned-but-unclaimed:
**0 and 0 across 200 runs**. The preserved untuned Gate A artifact has complete
450-run coverage and passes all five checks. This is historical baseline
evidence, not a claim that current-source sweeps or final acceptance pass.

## Current-Source Results

Fresh captures at `3250caea` cover all 50 seeds, all four archetypes, and 365
simulated days: **200 progression + 200 idle runs**, plus the separate **450-run
Gate A matrix**. Both coded coverage verdicts are complete. The source manifest
is identical before and after capture; only this report and the tuning changelog
change during the runs. The progression verdict is **FAIL**.

| Archetype   | Tier 3 reached | Tier 3 median day | Tier 3 gate | Tier 5 reached | Paired Tier 4 to 5 median | Same-day pairs | Median peak book value |
| ----------- | -------------: | ----------------: | ----------- | -------------: | ------------------------- | -------------: | ---------------------: |
| convenience |          18/50 |               274 | FAIL        |           0/50 | unavailable               |              0 |                 78,418 |
| boutique    |          42/50 |               211 | FAIL        |          42/50 | 0 days                    |             42 |             784,758.50 |
| electronics |          50/50 |               169 | FAIL        |           0/50 | unavailable               |              0 |             233,657.50 |
| grocery     |          48/50 |             144.5 | PASS        |           0/50 | unavailable               |              0 |             106,867.50 |

Only boutique passes Tier-5 reach. No archetype passes spacing. Peak-median
ratio is **10.007377132801142**, above 3. Grocery's previous 49/50 at median
day 120 is superseded by **48/50 at day 144.5**; the other archetypes' headline
values are unchanged from the older tuned artifact.

All **200/200 idle controls** have zero claims; earned-but-unclaimed is also zero.
Maximum idle report peak book value is 42,218, below Tier 1's 70,000 target.
Absence of Tier-5 receipts is a failure, not an empty passing spacing sample.

### Gate A

The current-source official verdict is **PASS, 5/5**, with complete coverage.
It does not override the progression FAIL.

| Check                | Current-source evidence                                                                                                                  | Verdict |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| Viability by day 90  | convenience 42/50, boutique 50/50, electronics 41/50, grocery 50/50                                                                      | PASS    |
| Boundedness          | maximum absolute cash 678,780; principal 14,000; cumulative imports 1,582,909; waste 5,336 units/value, all below 1e9                    | PASS    |
| Managed versus idle  | days 61-90 operating income wins in 50/50 seeds for each archetype                                                                       | PASS    |
| Opening forecast     | 716/716 complete eligible observations within 25% of realized revenue; one incomplete opening and 200 idle openings excluded and counted | PASS    |
| Advisor served chain | 50/50 served; zero repeated unapplied recommendations                                                                                    | PASS    |

### Reference Trace And Industry Diagnostic

Seed **20260503 convenience** claims only `local-shop`, on **day 299**;
Tiers 2-5 remain unclaimed. The untuned reference claims only `local-shop` on
day 325. Current trace and matrix agree: final cash -13,728, debt 18,170,
book value 65,581, two stores, maximum store level 2, five opened cities,
and 3,360 local units. Tier 2's three-store requirement still fails; Tier 3
cannot bypass that inherited prerequisite even though its own goals pass.

The fresh grocery/pantry chain diagnostic on the same seed delivers **zero**
local pantry units against **69,565 imported units** costing **104,376**.
It builds one grain-farm and one flour-mill, but no pantry-works.
Their fixed cost is **5,952**, with recipe operating estimate **202.5**;
these are partial-chain expenses, not cash saved. The whole industrial program,
including the produce chain, costs 12,941 in production operations and 546 in
imported inputs. There is no pantry payback claim. This measured construction
contradicted the earlier `industry.ts` comment that no evidence run builds
a flour-mill; that rationale must not justify a new cost change or acceptance.

All six non-boutique seed/archetype controls in the rejected import-margin pilot
exactly match the corresponding fresh current-source summaries. Thus its
boutique reach loss is not being compared against the stale grocery economy.
The current boutique controls reach all five tiers on days 253 and 337
respectively; the pilot loses both upper-tier paths.

### Upgrade-Affordability Decision

Every non-boutique run fails Tier 4's maximum-level-four goal:

| Archetype   | Maximum level 2 | Maximum level 3 | Maximum level 4 |
| ----------- | --------------: | --------------: | --------------: |
| convenience |              50 |               0 |               0 |
| electronics |              42 |               8 |               0 |
| grocery     |              50 |               0 |               0 |

This is a measured prerequisite failure, not proof that an upgrade-cost reduction
will solve the economy. The current bot uses cash-only, reserve-gated upgrades,
but can borrow for expansion. The current convenience reference records its day-8
upgrade deferral explicitly: level 2 costs 16,000 plus reserve 931, versus cash
2,092. Changing Tier 5 alone cannot repair those missing Tier-4 prerequisites.

An isolated store-upgrade base-cost pilot **8,000 -> 6,000** would reduce the
level-2-to-3 bill 16,000 -> 12,000, level-3-to-4 24,000 -> 18,000, and total
level-1-to-4 capital 48,000 -> 36,000. The user explicitly **approved this bounded
pilot for measurement**, not adoption or acceptance. This expands the
leveling-lever scope beyond the non-milestone revenue bonus. The completed pilot
keeps bot policy, financing, receipts, starting cash, and thresholds fixed;
its rejected result is recorded below.
Prior combined salary/upgrade experiments do not establish this isolated effect.
These failures do not prove all remaining approved combinations are exhausted.

### Verification And Evidence Files

At restored `3250caea`, the focused leveling, state, book-value, founding-economics,
and scenario-runtime suites pass **154/154 tests across five files**. No scenario
goal, medal threshold, reference/no-action pin, or locale is re-pinned in this
continuation. The two report files pass Prettier and the diff whitespace check.

The ordinary `progressionDiff.ts` comparison of the preserved untuned artifact
against the fresh current artifact exits 0 over all **200 matched seed/archetype
pairs**. Every pair differs, as expected across economy changes. Idle book-value
aggregate drift is informational in ordinary mode; both artifacts still have
200 controls with zero earned or claimed tiers. The CLI's `require-identical:
PASS` line in this mode is not a claim of byte-identical economies or an
acceptance pass. This comparison is distinct from the 49-row historical-tuned
versus current-tuned source-drift check above.

Under `docs/balance/generated/`, retain:

- `hpa-721-head-3250caea-provenance.txt`: source SHA, runtime versions, and pre/post source manifests.
- `hpa-721-head-3250caea-progression.json` and `.log`: complete progression/idle capture and coded pacing verdict.
- `hpa-721-head-3250caea-gate.json` and `.md`: complete Gate A capture and all five checks.
- `hpa-721-head-3250caea-reference-20260503.json`: claim-aligned convenience reference trace.
- `hpa-721-head-3250caea-grocery-pantry.json`: named partial-chain costs, instances, and import evidence.
- `hpa-721-head-3250caea-evaluation.json`: frozen current verdicts, input SHA-256 hashes, all 49 changed historical rows, six unchanged pilot controls, and trace/matrix agreement.
- `hpa-721-head-3250caea-upgrade-blockers.json`: all 150 non-boutique maximum levels and Tier-4 own-goal blocker counts, aggregated per archetype.
- `hpa-721-head-3250caea-progression-diff.log`: ordinary untuned/current coverage and row comparison, not strict identity.

Command logs and `.exit` files accompany the captures. Every capture command
exits 0; a successful CLI exit is **not** a pacing pass. The progression CLI
deliberately permits a failed pacing verdict so signed exceptions can be reported;
none is accepted here.

## Retained Changes Under Evaluation

Boutique shelf price/import cost pairs, compared with untuned gameplay:

| Product             | Shelf price | Import cost |
| ------------------- | ----------- | ----------- |
| apparel             | 38 -> 36    | 18 -> 17    |
| home-goods          | 28 -> 27    | 14 -> 13    |
| gifts               | 20 -> 19    | 9 -> 9      |
| fashion-accessories | 26 -> 25    | 12 -> 11    |

These are approximately proportional price/cost normalization, **not uniform
margin-rate compression**. Rounding increases the nominal margin rate of apparel,
home-goods, and fashion-accessories.

Fixed industrial operating costs:

| Building type            | Untuned daily cost | Current daily cost |
| ------------------------ | -----------------: | -----------------: |
| grain-farm               |                 10 |                  6 |
| water-pump               |                  8 |                  5 |
| fruit-farm               |                 14 |                  8 |
| pulpwood-grove           |                 10 |                  6 |
| chemical-feedstock-well  |                 20 |                 12 |
| copper-mine              |                 12 |                  7 |
| pulp-mill                |                 24 |                 14 |
| plastic-plant            |                 30 |                 18 |
| packaging-plant          |                 28 |                 17 |
| circuit-board-plant      |                 24 |                 14 |
| gift-workshop            |                 30 |                 18 |
| accessory-assembly-plant |                 26 |                 16 |
| water-bottler            |                  6 |                  4 |
| produce-packhouse        |                  8 |                  5 |

The flour-mill and pantry-works cuts were restored: current daily costs are 24
and 10 respectively, matching untuned gameplay. No throughput, rail, setup,
salary, store-upgrade-cost, or numeric ladder threshold change is retained here.

The approved structural correction removes Tier 5's six-city goal entirely,
without replacing it with a duplicate five-city goal. Tier 4 still requires five
cities. Tier 5 still requires seven stores and peak book value 150,000. The unused
Tier-5 city-goal translation key is removed in English, Japanese, and Traditional
Chinese. Claim rewards remain one store slot and 25,000 credit-underwriting
base/hard-bound per tier; they are not a cash grant.

## Rejected Import-Margin Pilot

This continuation tested only apparel import cost **17 -> 23** and home-goods
import cost **13 -> 18**, with shelf prices held at 36/27. All other gameplay and
bot policy stayed at `3250caea`. The hypothesis was to compress ordinary boutique
gross margin without reducing the dollar revenue benefit of upgrades.

Seeds were **20260503 and 20260515**, four archetypes, 365 days: eight progression
and eight idle runs. The separate Gate A diagnostic had 18 runs, not 450.
The exact patch, provenance, logs, and exit codes use
`hpa-721-import-margin-*`.

| Boutique outcome        | 20260503 | 20260515 |
| ----------------------- | -------: | -------: |
| Tier 3 / Tier 5 claimed |  neither |  neither |
| Maximum store level     |        3 |        3 |
| Local retail units      |        0 |        0 |
| Store count             |        7 |        7 |
| Peak book value         |  232,451 |  228,634 |
| Final cash              |  -61,385 |  -59,506 |
| Outstanding principal   |   48,842 |   59,000 |

Reject the pilot: it eliminates upper-tier reach on both measured boutique
paths. The smaller four-archetype peak ratio, **4.5553576972951255**, still misses
the equity target and is not a success when reach disappears.
Both boutique paths meet Tier 5's own goals but cannot claim through the earlier
tiers. An empty Tier-5 own-goal blocker list is not evidence of reachability.

The pilot passes all 80 scenario-runtime tests, but fails the boutique founding
ratio regression (observed 1.6342765079045414 versus the existing 2.4 floor).
No test or scenario is re-pinned. Boutique retail-steady viability is 2/2; the
partial Gate A diagnostic's convenience viability is 1/2. That partial sample
cannot establish a full-matrix Gate A regression or pass.
All eight idle controls earn and claim zero tiers.

The two cost edits are restored. No pilot gameplay is retained.

## Rejected Isolated Upgrade-Cost Pilot

Following explicit scope approval, the only production edit is
`RETAIL_UPGRADE_BASE_COST` **8,000 -> 6,000**. This is not a salary/upgrade/boutique
combination. The exact production patch, temporary test patch, provenance, and
raw evidence use `hpa-721-upgrade6k-*`.

The same **20260503/20260515** seeds, four archetypes, and 365 days produce eight
progression and eight idle runs. Compare these with the same rows in the fresh
`3250caea` matrix, not the 50-seed aggregates:

| Archetype   | Untouched Tier 3 reach / median | Trial Tier 3 reach / median | Untouched -> trial Tier 5 reach | Trial median peak book value |
| ----------- | ------------------------------- | --------------------------- | ------------------------------- | ---------------------------: |
| convenience | 0/2 / unavailable               | 0/2 / unavailable           | 0/2 -> 0/2                      |                       54,749 |
| boutique    | 2/2 / 295                       | 2/2 / 204                   | 2/2 -> 2/2                      |                   760,882.50 |
| electronics | 2/2 / 165.5                     | 2/2 / 165.5                 | 0/2 -> 0/2                      |                   256,999.50 |
| grocery     | 2/2 / 186.5                     | 2/2 / 281                   | 0/2 -> 0/2                      |                   107,183.50 |

The two-seed peak-median ratio worsens **12.279665041184957 ->
13.897651098650204**. Boutique's same-day Tier-4/Tier-5 pairs remain 2/2 with
median gap zero. All six non-boutique paths still miss level 4: convenience and
grocery both remain level 2; electronics ends at levels 2 and 3.

The boutique receipt days improve 253 -> 197 and 337 -> 211, but still miss the
Tier-3 timing window. Grocery seed 20260503's Tier-2/Tier-3 claim moves 169 ->
358; seed 20260515 remains at 204. Convenience's reference still claims only
Tier 1 on day 299, with two stores and maximum level 2. Better cash or debt in
some paths does not establish sustainable marginal expansion.

**Reject the isolated 6,000 setting and do not widen it to an official sweep.**
It does not unlock the measured non-boutique Tier-4 bottleneck, preserve grocery
pacing, compress equity, or create a later Tier-5 claim. This finite screen is
not proof that every combination containing a lower upgrade cost must fail.

### Behavioral And Guardrail Evidence

Two temporary behavioral tests first fail at the original price for the expected
reasons (36,000 cannot buy all three upgrades; the level-2 quote is 16,000), then
pass at 6,000:

- Three paid upgrades reach level 4, spend exactly 36,000, unlock soft-drinks,
  and capitalize exactly 36,000 in retail assets.
- The level-2 quote is 12,000, exactly 12,000 cash buys level 3 with zero cash
  remaining, and 11,999 is an identity no-op.

These use unit-test cash fixtures only; the simulated founding cash is unchanged.
The 18 Gate A diagnostic rows are **identical** to the corresponding untouched
rows, not a new official Gate A pass. All eight idle controls earn and claim zero
tiers. All 80 runtime/scenario tests, the six founding-economics tests, and the
two new behavioral tests pass under the candidate.

The wider five-file unit run reports **152 passed / 4 failed**. Every existing
failure is left visible and unmodified:

| Existing assertion                      | Untouched expectation              | Trial result                       |
| --------------------------------------- | ---------------------------------- | ---------------------------------- |
| Book-value design hand fixture          | total 55,705; retail assets 20,000 | total 53,705; retail assets 18,000 |
| Maximum-level completed upgrade capital | 360,000                            | 270,000                            |
| Level 2 -> 3 preview cost               | 16,000                             | 12,000                             |
| Level 3 -> 4 preview cost               | 24,000                             | 18,000                             |

These are price-dependent numeric pins, not demonstrated scenario-semantic or
accounting regressions. They are not re-pinned because the candidate already
fails the economic screen. The cost edit, temporary tests, and test-only import
are restored; both source hashes match their pre-pilot values.
The restored five-file batch passes 154/154, including all four original numeric
pins. The fresh full `3250caea` matrices remain the current-source evidence.

## Expansion-Only Working-Stock Screen: Rejected

The user approved a temporary per-product/per-format screen: nonfounding stores
only, water reorder/target 30/108 -> 1,000/1,000 and pantry 55/198 ->
1,000/1,000. Founding stores, opening lots (84/154), all other products, prices,
payroll, bot, financing, cadence and progression targets stay unchanged.
The shared `buildStore` constructor supplies both real and forecast entrants.
The candidate production hash is
`dc04400ed4226cd3d89274e24161492cb7d98f64d1bfa888418e4853fc444749`;
its base is `3250caea`, with the upgrade base still 8,000.

This is not another free-opening-inventory multiplier. Empty L1 shelves require
paid imports of 1,180 for convenience or 1,680 for grocery, while opening
inventory remains worth only 224/371. These are per-store costs, not a guarantee
that the company-wide 2,000 cash floor covers every simultaneous order.

Six behavioral tests cover actual opening/defaults/book inventory, paid weekly
imports and projected/live inventory agreement. Four new-default assertions fail
RED at baseline; all six pass GREEN. The seven-file candidate batch passes
285/285, including existing economics and scenario guards; no pins are changed.

### Frozen-Bot Diagnostic

Seeds 20260503/20260515 produce eight progression and eight idle runs:

- Convenience still reaches Tier 3 in 0/2 and Tier 5 in 0/2.
- Grocery reaches Tier 3 in 2/2, but its median worsens 186.5 -> 239 days.
  Seed 20260503 slips 169 -> 358; seed 20260515 improves 204 -> 120.
  Both stop at max level 2 and Tier 5 remains 0/2.
- All four boutique/electronics rows are exactly identical to the frozen current
  baseline subset. The peak-median ratio improves 12.2797 -> approximately 11.49,
  still far above 3.
- All eight idle controls earn and claim zero tiers. Forecast agreement is 28/28.
  The 18-row Gate A diagnostic retains the baseline subset's convenience
  viability 1/2; other item verdicts are unchanged. This is incomplete coverage,
  `allPassed: false`, not a new official Gate A pass.

### Matched Cash, Not Inventory Valuation

The existing read-only claim probe captures actual planner boundaries. Replayed
borrowing/opening/claim commands must exactly reproduce observed states.
Each comparison starts before opening-specific financing and has three arms:
no opening, an old-default entrant, and the approved-default entrant.
Only opening arms borrow and hire; they hire the same actual candidate IDs to
full staffing and pay actual salaries through the engine. No further manual
actions occur. Existing city-access investment is shared/sunk, so a new-city
store case is **not** a complete city-plus-store payback claim.

The conservative cash metric is
`delta(cash - outstanding principal) - unchanged opening gift at import cost`,
relative to no opening. Terminal inventory is not liquidated or added back.
Day-365 results include only reports through day 365:

| Archetype / Seed       | Opening         | Cash Window | Incremental Operating Cash | Conservative Cash Metric |
| ---------------------- | --------------- | ----------- | -------------------------: | -----------------------: |
| convenience / 20260503 | Harbor, day 1   | 365 days    |                    +34,341 |                  +11,421 |
| convenience / 20260515 | Harbor, day 1   | 365 days    |                    -39,703 |                  -62,314 |
| grocery / 20260503     | Harbor, day 1   | 365 days    |                     -6,776 |                  -30,738 |
| grocery / 20260515     | Harbor, day 1   | 365 days    |                    +35,432 |                  +11,921 |
| grocery / 20260503     | Campus, day 358 | 8 days      |                    -13,367 |                  -37,170 |
| grocery / 20260515     | Campus, day 120 | 246 days    |                    +39,476 |                  +15,092 |

Only 2/4 first expansions recover costs within the year. All six conservative
90-day metrics remain negative. The late Campus case's 90-day diagnostic ends
on report day 447 and cannot count as first-year evidence. The early Campus
case is a genuine positive conditional store result, not proof that its already
paid 18,000 city access also pays back. Convenience seed 20260515 and the late
Campus case additionally carry incremental arrears versus no opening.

The initial cash helper correctly stopped on unreconciled borrowed-opening
windows: daily reports include financing already performed before the snapshot.
The corrected helper removes that pre-snapshot activity from window totals.
It reuses the four validated zero-prefix-finance results unchanged and reruns
only the two blocked cases from frozen inputs. All six reconciliations now pass;
the initial failed output is preserved, not substituted for valid evidence.

**Verdict: reject and restore.** The trial has real cash benefits in some cases,
but does not make expansion reliably self-funding or solve progression.
The negative screen does not establish that every per-product combination fails.
No new chain or official matrix is justified by this result.

Artifacts use `docs/balance/generated/hpa-721-expansion-stock-*`: production/test
patches, source hashes, RED/GREEN/unit logs, progression/Gate A diagnostics,
frozen evaluation, exact input cases, initial and reconciled cash outputs, and
the final verdict. All four source/spec hashes restore exactly to their pre-trial
values; `git diff -- src tests` is empty. The fresh restored seven-file batch
passes 279/279, including all existing guards, and the four historical reports
remain unchanged. No gameplay from this screen is retained.

### Post-Screen Constraints for the Joint Design

The next step is a joint design discussion, not a fourth isolated tuning attempt.
Additional observations capture the previously unretained market/store reports
from eight controlled 90-day windows (four cases, no-open and candidate opening).
Every resulting cash/debt/inventory tuple must equal the frozen cash evidence.
All eight checks pass. This is new explanatory data from the same inputs, not
another tuning sweep or a redefinition of the delivered cash results.

The days 61-90 observations separate availability from shared-city demand:

| Case                   | No-Open Player Share        | Two-Store Player Share      | Candidate Stockout Loss       | Incremental Operating Cash, 30 Days |
| ---------------------- | --------------------------- | --------------------------- | ----------------------------- | ----------------------------------: |
| convenience / 20260515 | water 46.2%, snacks 54.5%   | water 63.1%, snacks 70.4%   | zero for both products        |                              -2,997 |
| grocery / 20260503     | pantry 46.0%, produce 45.7% | pantry 63.3%, produce 63.1% | pantry zero; produce 16.2/day |                              -1,131 |

Adding a store does win rival share in these cases, but not enough contribution
to cover its actual costs. In the convenience case, all sellable demand is served
with no reported missed demand during this window; still more inventory cannot
create customers. Rival-free comparison cases have share 1 in both arms, so
reducing rival attraction cannot help those cases. Existing city demand remains
shared, not an independently minted pool per store.

There is also a separate prospective production constraint. Current pantry
recipes imply steady/full-batch recipe operating expense of
`(18 / 8) * (6 / 8) + 8 / 8 = 2.6875` per finished retail unit, versus observed
direct retail import cost 1.50. This estimate is before daily currency rounding,
40/day combined fixed building costs, raw-material costs, rail and capital.
Increasing a building throughput multiplier does not change the recipe ratios.
Recipe yields/costs or the retail import/shelf-price scale therefore need a
coherent reconciliation; increasing `localValue` is not a cash fix.

This prospective constraint is **not** asserted as the observed cause in the
current reference run: that run never builds `pantry-works`, produces zero
pantry, and incurs 5,952 of grain/flour fixed costs while construction stalls.
Do not substitute a theoretical completed-chain explanation for that evidence.
Nor does the rail's 10-units-per-level constant prove a global company-throughput
ceiling; actual routes, shared bottlenecks and factory instances still matter.

Frozen explanatory artifacts are `hpa-721-coupled-market-observations.json`,
`hpa-721-coupled-market-summary.json` and `hpa-721-coupled-pantry-feasibility.json`.
The exact initial and reconciled cash helpers are preserved separately; the
current helper additionally exports its unchanged staffing routine for the
market observation script. No new gameplay candidate is active.

## Approved Linked-Price Rebase, Stopped At Scenario Guard

**2026-11-16 verdict: stop and restore, not an economic payback or pacing
verdict.** The approved temporary bundle reaches the existing scenario guard
but does not clear it. No candidate progression/component/Gate A run is made,
and no existing assertion, scoring band, objective or medal threshold is repinned.
The approved design and revised recipe remain in
`docs/superpowers/specs/2026-11-15-hpa-721-linked-economy-screen-design.md` and
`docs/superpowers/plans/2026-11-15-hpa-721-linked-economy-screen.md`.

### Exact Temporary Scope

All changes are relative to `3250caea0cc70eda4d592ad4406fe8fdf5c75cb1`.

| Product       | Import / Shelf | Nonfounder Reorder / Target | Unchanged Free Opening Units |
| ------------- | -------------- | --------------------------- | ---------------------------: |
| bottled-water | 3 / 8          | 700 / 700                   |                           84 |
| snacks        | 12 / 18        | 25 / 90                     |                           70 |
| produce       | 6 / 11         | 180 / 180                   |                          140 |
| pantry        | 8.5 / 16       | 1,000 / 1,000               |                          154 |

Setup tile-rent coefficient is temporarily 2.5 -> 1, grocery base rent
165 -> 120, and Harbor snacks demand 1 -> 1.4. Pantry demand, industrial
costs/recipe yields, founding stock defaults, financing, bot policy, progression
thresholds and save schema stay unchanged. Empty paid target fills are
3,180 / 9,580; opening gifts at the new import values are 1,092 / 2,149.
Neither is evidence of earned profit.

The only authored scenario price offsets are first-profit start/reference
3/6 -> 5/8, local-lifeline 6/4 -> 8/6, fresh-market produce start 6 -> 11,
and rival-next-door produce start/reference 6/7 -> 11/12. Two-city-supply-run
receives no new authored offset but remains affected by catalog prices.

The exact reversible nine-file source/test patch has SHA-256
`06bf7d17d48be5254a8522faac84c18ad822284d56915f57efe0e21b62d190d3`.
The separately retained observer-only patch has SHA-256
`abb9f717f657e50f0ffd6ce126414a557c992590afe0319faa57fbdfa8aaf2c2`.
Pre-existing dirty docs/plans and observer code are recorded in
`hpa-721-linked-screen-candidate-manifest.txt`; none is restored from HEAD.

### HEAD Recipe Validation, Not Candidate Evidence

Before any gameplay edit, the optional command-context probe passes its intended
missing-context RED and the existing noninterference/progression/chain suites,
19/19. Its callback replays an observed command, checks input preservation and
undefined daily context, and keeps digest/ledger/RNG/summary comparisons.
The runProgressionBot interface and three-argument observers remain supported.

Each of eight progression runs and eight idle controls runs once at HEAD,
seeds 20260503/20260515 across all four archetypes for 365 days. Native
`diffProgressionArtifacts` requires all eight selected progression rows to be
identical to the frozen full baseline; all eight match. The actual pilot report
retains its eight idle controls, all earning/claiming zero tiers. No idle
aggregate is fabricated from the full baseline's 200 controls. Native pacing
evaluation is diagnostic at this coverage, not an official PASS.

All four day-1 Harbor pre-finance forks match the archived opening states,
including zero captured expansion-borrow commands, and survive strict JSON round trips.
All four no-opening day-90/day-365 monetary and physical summaries match the
archived cash evidence. The first components preflight stops because the latest
copied accounting helper adds `excludedPreSnapshotFinance`, absent from the four
cached legacy rows. The HEAD-only comparison bridge checks an exact all-zero
day-1 finance literal and field absence, then adds that diagnostic metadata to
expected rows. It changes no financial value or archived file.

Only that failed components step is rerun. The prior capture and all frozen
inputs remain intact; an exact prefix comparison and complete small diff prove
the capture/actor code and tracked model source are unchanged. The original
capture's whole-script hash remains recorded rather than relabeled as the later
script. The successful final recipe hash is
`447926baa328877fe7997565915dcb62209b9069e7472e34303149c65b32d504`;
the metadata repair and reuse proof is in
`hpa-721-linked-screen-head-reference-shape-proof.json`. This narrowly bridges
a known legacy schema, not arbitrary future schema differences.

The two primary local pairs (convenience/water and grocery/produce, seed 20260503) use a controlled fully staffed two-store common fixture, not an
on-policy fork. They execute their captured schedules with exact building identity, cash/
capital/financing reconciliation and same-SKU stock conservation. Both exercise
raw rail input and finished retail deliveries. Grocery's conservative local-sales
lower bound is zero: that is unproven local sales, not proof that none sold.
The component artifact's `productive` boolean means positive lower-bound proof,
not a complete attribution of mixed stock. These HEAD results test the recipe,
not the candidate's cash viability.

All eight on-policy runs are also summarized in memory for claim traces and
applicable primary/secondary chain evidence. Full 365-day terminal game results
are not persisted. Shared warehouse costs must not be summed across overlapping
product scopes, and secondary diagnostics are not cash payback.

The reused c7 scenario runner captures all 14 HEAD rows: seven gold references,
two bronze no-action results and five failed/no-medal no-action results. Its
paths are phase-specific/exclusive; the historical helper is not overwritten.
Eight helper hashes and ten HEAD artifact hashes are frozen in
`hpa-721-linked-screen-recipe-lock.json`.

### Candidate Guard Failure And Validation Limits

The candidate new-test RED has five intended old-value assertion failures and
three import errors, not eight intended failures. Production is applied before
those import errors are corrected. The later 10/10 new-test GREEN does not repair
that test-first gap; the planned clean RED gate is **not satisfied**.
The temporary saved-price test changes a price after construction, so it is
not an existing-save lifecycle certificate. The new forecast immutability
check covers RNG and store reference, not full-game deep equality.

The full candidate guard inventory is **490 passed / 24 failed, 514 tests across
11 files**, before any repins. The decisive semantic failure is independently
reproduced by the unchanged scenario replay:

| First-Profit Trace              | HEAD         | Temporary Candidate |
| ------------------------------- | ------------ | ------------------- |
| no-action completion            | day 4        | day 4               |
| no-action cumulative net income | 1,306        | 2,795               |
| no-action score / medal         | 682 / bronze | 862 / gold          |
| reference score / medal         | 862 / gold   | 862 / gold          |

The frozen evaluation evidence shows the unchanged net-income component,
zero/full bonus at 1,400/1,600, switching from 0 to all 180 points for no-action.
The score mechanism is confirmed; contributions of individual bundled levers
are not isolated. Preserving catalog-level gross profit per unit in an analytical
preview does not certify this scenario's authored no-action separation.
Repinning bronze to gold would erase that guard, not fix the candidate.

All seven candidate references still earn gold. Rival-next-door reference
changes score 949 -> 951, but even a permissible arithmetic pin is not changed
once first-profit fails semantically. The runner and extracted replay helper
hashes match HEAD. All 14 rows and all 24 guard failures remain preserved;
the remaining failures are not treated as approved repins.

### Restoration And Coverage

Reverse-patch check and application both exit 0. All 16 candidate/guard files
match their pre-candidate bytes; both dirty observer files remain unchanged.
All eight locked helper hashes still match, and `git diff HEAD -- src` is empty.
The fresh combined restored guard/observer run passes **523/523 across 14 files**,
exit 0. These are actual counts from `hpa-721-linked-screen-restored-unit.log`,
not the older screen's 279/285 counts.

Artifacts use `docs/balance/generated/hpa-721-linked-screen-*`, including the
lead-authored `verdict.json`, preflight/failed/candidate outputs, exact patches,
hashes and restoration receipts. Historical reports and prior failed outputs
remain unchanged. No gameplay from this trial is retained; only the validated
observer instrumentation remains in test source.

No candidate progression/idle sweep, matched-cash run, 18-row Gate A diagnostic
or official 450-run matrix follows the guard stop. Full check/lint/full-unit/
affected E2E and macOS/Windows smoke are not run in this screen. Existing-save
economics remain uncertified. No commit, push, PR or Linear action is made.
The next candidate must preserve below-silver first-profit no-action behavior
without weakening its scoring/medal contract, and establish clean test-first
and compatibility evidence before economy measurement.

### First-Profit Follow-Up: Two Diagnostic Replays

The user approves two short diagnostic replays, not another tuning screen or
an income/scoring change. Both reuse `replayLaunchCalibration` verbatim with
no opening commands and no supplier-term resolution. Each returns exactly three
native reports (days 1-3), completes on day 4, and matches its frozen c7 result
and RNG exactly: HEAD 682/bronze and 1,306 income; candidate 862/gold and 2,795.
The same capture-script and native-helper hashes are used in both phases.
An independent zero-day setup supplies only the opening snapshot, not another
simulated trajectory. No complete terminal game is persisted.

For the candidate replay only the five app blocks are extracted unchanged from
the preserved rejected patch. Temporary tests and reference-command edits are
not reintroduced: no-action uses an empty command list. Source is immediately
reverse-checked/restored before analysis. All 16 source/guard preimages and
eight helper locks still match, and `git diff HEAD -- src` is empty.

The first-profit fixture has 250 water and 70 snacks, not the ordinary
convenience expansion's 84 water/70 snacks. Both replays sell all of those free
opening units by report 3, with no imports, warehouse supply, waste or shrink.
Per-SKU stock conservation and report sums reconcile.

| Three-Report Total                            |  HEAD | Candidate | Change |
| --------------------------------------------- | ----: | --------: | -----: |
| revenue                                       | 1,624 |     3,113 | +1,489 |
| cost of goods sold (COGS)                     |   390 |     1,590 | +1,200 |
| operating costs                               |   318 |       318 |      0 |
| payroll (already included in operating costs) |     0 |         0 |      0 |
| paid imports                                  |     0 |         0 |      0 |
| reported operating income after COGS          |   916 |     1,205 |   +289 |
| operating cash flow / reported net income     | 1,306 |     2,795 | +1,489 |

Financing cash flow is zero in both. Starting cash is 9,000 in both; there is
no cash injection, additional sale volume or operating-cost saving to explain
the increase.

| Product       | Units Sold, HEAD / Candidate | Configured Price, HEAD -> Candidate | Effective Premium Price | Revenue Increase | COGS Increase |
| ------------- | ---------------------------- | ----------------------------------- | ----------------------- | ---------------: | ------------: |
| bottled-water | 250 / 250                    | 3 -> 5                              | 3.72 -> 6.20            |             +620 |          +500 |
| snacks        | 70 / 70                      | 8 -> 18                             | 9.92 -> 22.32           |             +869 |          +700 |

**Confirmed accounting path:** `simulateDay.ts` computes operating cash flow
from revenue minus operating costs and paid imports; it reports that value as
`netIncome`. Separately, `scenarios/metrics.ts` implements
`cumulative-net-income` by summing `report.operatingCashFlow` directly.
Changing only the report's `netIncome` assignment would not change this metric.
COGS is recognized in `operatingIncome`, but it is not a cash purchase during
these three reports. The nominal price rebase therefore raises cash proceeds
from free initial goods without a matching within-window import payment.
That accounts for all 1,489 of the score-metric increase, activating the existing
180-point income bonus. This is not evidence of stronger recurring cash margins.

**Confirmed policy interaction:** this fixture uses premium pricing at 1.24
times configured shelf price. The policy scales price, not import cost.
Preserving `P - C` does not preserve `1.24 * P - C`: paired price/cost increases
of `d` add `0.24 * d` to effective unit margin. That produces the separate
289 operating-income increase here (120 water, 169 snacks, including daily
currency rounding). The analytical table-margin invariant is not an invariant
under every pricing policy.

Daily sales allocation and missed demand also change, but three-report sold
totals do not. The diagnosis does not claim isolated causal effects of the
Harbor demand change on all trajectories or on later paid-stock operation.

Frozen new artifacts use `hpa-721-first-profit-rebase-trace-*`: capture source,
both opening summaries/native reports/results, input/source hashes, the
lead-executed frozen `analysis.json`, preserved derivation source and exact
apply/restore receipts. Both capture exits are 0. Analysis and presentation
read frozen captures; neither the original 8+8 pilot nor the 14-row scenario
matrix is recaptured for this diagnosis.

No starting-price correction is tested yet. Any follow-up must preserve the
cash-based goal/scoring contract or explicitly obtain a separate scope change;
it must not silently substitute accrual income or raise the bonus band.
Scenario-specific price authoring must cover both opening SKUs and preserve
a meaningful reference/no-action separation. A later reference should also
demonstrate positive COGS-based operating income, not only cash from opening
goods. New numeric presets/reference actions require approval before a pilot.
Candidate sandbox payback and progression remain unmeasured.

## Corrected Linked Candidate: Bounded Screen Rejected

This approved follow-up supersedes the earlier “not yet measured” status; it
does not replace the official `3250caea` checkpoint or turn it into acceptance.
The temporary linked bundle was reapplied at `18a6f846`, with First Profit
opening water/snacks explicitly priced at 3/8 and its reference repricing both
to 8/18 before any reports. Cash-based objectives, scoring bands, medal
thresholds, bot policy and progression goals were unchanged.

The frozen correction guard completes on day 4: no action scores 682/bronze,
reference 862/gold. Cash-based income is 1,306/2,812; COGS-based operating
income is -284/+1,222. No-action satisfaction is 46 rather than the original
48, with the same zero satisfaction bonus. These three-report opening-stock
results establish the teaching separation, not recurring cash payback.
Both native captures and the focused two-test RED/GREEN evidence are retained
under `hpa-721-first-profit-correction-guard-*`.

The six other scenario pairs reuse the frozen linked-candidate captures only
after exact global-runtime hashes, unchanged native helper/reference bodies
and the complete scenario definitions are checked. All references remain
gold with the original no-action outcome/medal/day separation. Rival's frozen
reference share is `0.5295667447306791`, cash-based income 2,693 and score 951
instead of 949; no target or scoring rule is repinned. The candidate guard
run passes 510 tests across 11 files; six First Profit tests are deliberately
excluded because their corrected evidence is already frozen. This is not a
new standalone 14-row replay capture.

The original linked assertions now have a clean test-first receipt: eight
old-value assertion failures/two passes before production changes, then all
ten pass. Reviewed arithmetic/fixture corrections preserve fractional and
negative-zero rounding, local-versus-import valuation and brand modifiers.
The price-elasticity fixture requires positive uncapped sales and a strict
price effect; the planner cost-table guard distinguishes pantry retail 8.5
from material import 8 rather than comparing equal water/snacks import prices.

### Matched Cash Results

Four day-one expansion opportunities use the locked real-financing recipe.
Year-end cash is financing-neutral and debited for the actual free opening
inventory gift: 1,092 for convenience and 2,149 for grocery. Neither book-value
revaluation nor borrowed principal is counted as cash benefit.

| Archetype   | Seed     | Days 61–90 marginal operating cash | Day-90 adjusted cash gap | Day-365 adjusted cash gap | Cash gate |
| ----------- | -------- | ---------------------------------: | -----------------------: | ------------------------: | --------- |
| convenience | 20260503 |                             +5,323 |                  -17,908 |                   +12,703 | pass      |
| convenience | 20260515 |                             +5,387 |                  -18,407 |                   +12,769 | pass      |
| grocery     | 20260503 |                             +1,330 |                  -18,724 |                   -16,672 | fail      |
| grocery     | 20260515 |                             +2,396 |                  -19,169 |                   -15,820 | fail      |

All four mature operating gaps are positive, but grocery still fails the
required positive day-365 adjusted cash gap. All four day-90 gaps are negative;
90-day payback is reported, not introduced as a new acceptance gate.
These isolated store arms have zero year-end arrears and unpaid interest.

The two primary local-chain cash comparisons use seed 20260503 only:

| Chain             | Day-90 financing-neutral gap | Day-365 financing-neutral gap | Local deliveries | Conservative local-sales lower bound | Gate                      |
| ----------------- | ---------------------------: | ----------------------------: | ---------------: | -----------------------------------: | ------------------------- |
| convenience water |                       -3,019 |                        +1,523 |            3,360 |                                2,260 | pass                      |
| grocery produce   |                       -1,971 |                        +6,244 |            2,760 |                                    0 | productive sales unproven |

The produce arm records 4,042 waste units, 2,207 shrink units and 401 closing
units across mixed local/imported supply. A zero conservative bound does not
prove all local goods were wasted; it means the frozen recipe cannot establish
productive local retail sales. Positive cash alone does not clear that gate.
Eight progression chain summaries are diagnostic only; overlapping warehouse
cost scopes must not be summed, and secondary-chain or second-seed local cash
payback is not certified. The combined component screen therefore fails.

### Bounded Progression And Engineering Result

The locked capture produces eight progression runs and eight idle controls:
two seeds × four archetypes × 365 days, compared with the already validated
matched HEAD subset rather than rerunning the baseline.

| Archetype   | Tier 3 reach | Tier 3 median day | Tier 5 reach | Paired T4→T5 median gap |
| ----------- | ------------ | ----------------: | ------------ | ----------------------: |
| convenience | 2/2          |             249.5 | 0/2          |             not reached |
| boutique    | 2/2          |               239 | 2/2          |                       0 |
| electronics | 2/2          |               148 | 0/2          |             not reached |
| grocery     | 2/2          |                71 | 0/2          |             not reached |

Native pacing evaluation fails; coverage is explicitly incomplete. The sample
median-peak ratio is `6.023274937283728`, above 3×, not an official 50-seed
equity result. Convenience/boutique Tier 3 is late, grocery is early, and the
non-boutique Tier-5 and boutique spacing blockers remain. All eight progression
runs end with negative cash. All eight idle controls earn and claim zero
tiers; idle book-value aggregates do differ from HEAD, so behavioral controls
must not be described as numerically identical.

The separate Gate A diagnostic captures 18 rows and passes all five check
items, but the native report explicitly says partial sweep: 432 combinations
are missing. This is not an official Gate A certification or a reason to
launch the full acceptance matrix.

All 14 temporary gameplay/fixture/test paths are restored byte-for-byte to
`18a6f846`; every tracked `src`/`tests` hash matches the pre-screen snapshot.
Fresh restored verification passes 504 focused guards plus 19 retained-observer
tests, with no exclusions. Closure verifies the frozen archives, eight locked
helpers and measurement recipe are unchanged. Only this report and the tuning
log are retained as tracked edits; no candidate gameplay, commit or push is
retained.

Evidence uses the ignored local archive prefix
`docs/balance/generated/hpa-721-linked-corrected-pilot-*`: `before.json`,
`scenario-proof.json`, `candidate-{progression,pacing,diff,traces,chains,forks,components}.json`,
`gate.{json,md}`, `evaluation.json`, `audit.json`, `closure.json`, command/test
logs and `prepared-final.patch`. The original frozen recipe is untouched;
the executed copy changes only the source-SHA assertion, output prefix and
lock-file path. Preflight proves the intervening industry edit emits identical
runtime code with comments removed. SHA-256:

- candidate patch: `0ef2cd75774efdc3f0246e2e1cb1169c7cdecfcb528bc854cbbc353a73f5fd73`;
- executed recipe: `6dfd7cbee0db8f6bd91a2675ad828f199a37605fb139b6059723915317e65f4a`;
- frozen evaluation: `f45ab741164701e036e66b9bb354f4246e67bf33c173ce13a60512351732418a`.

The archive is not committed; obtain it from the generating workspace before
attempting reproduction, and use fresh output names. Do not recompute frozen
captures merely to regenerate a table. This candidate is rejected for further
certification: grocery capital recovery, productive local-sales evidence,
archetype pacing/equity and spacing need a separately reviewed joint design.
Existing-save economics remain uncertified. No official matrix, final
check/lint/full-unit/build/affected E2E or macOS/Windows smoke is run.

## Reproduction

Run from a clean checkout of the source identified for the evidence. Never run
the tuned checkout as the untuned baseline. To regenerate untuned evidence with
the same current harness, use a separate checkout of `3250caea` containing
`src/lib/game/{products,industry,progression}.ts` and `src/lib/i18n/messages/`
from `b50c90c3`; leave the harness and bot policy unchanged.

```sh
SEEDS=20260501,20260502,20260503,20260504,20260505,20260506,20260507,20260508,20260509,20260510,20260511,20260512,20260513,20260514,20260515,20260516,20260517,20260518,20260519,20260520,20260521,20260522,20260523,20260524,20260525,20260526,20260527,20260528,20260529,20260530,20260531,20260532,20260533,20260534,20260535,20260536,20260537,20260538,20260539,20260540,20260541,20260542,20260543,20260544,20260545,20260546,20260547,20260548,20260549,20260550

bun tests/balance/progressionRun.ts --seeds "$SEEDS" --days 365 \
  --output docs/balance/generated/hpa-721-head-3250caea-progression-rerun
bun run balance --seeds "$SEEDS" --days 365 --bots idle,retail-steady,advisor \
  --output docs/balance/generated/hpa-721-head-3250caea-gate-rerun
bun tests/balance/progressionRun.ts --seeds 20260503 --days 365 \
  --archetypes convenience \
  --trace docs/balance/generated/hpa-721-head-3250caea-reference-20260503-rerun.json
bun tests/balance/chainEvidence.ts --seeds 20260503 --days 365 \
  --archetype grocery --product pantry \
  --output docs/balance/generated/hpa-721-head-3250caea-grocery-pantry-rerun
bun run test:unit -- --run src/lib/game/retailUnitEconomics.spec.ts \
  src/lib/scenarios/runtime.spec.ts
```

The `*-rerun` names keep a rerun from overwriting the retained
`hpa-721-head-3250caea-*` evidence; compare rerun outputs against the retained
files and never write to the retained names. For the untuned checkout use
distinct `*-before` output names; preserve existing artifacts instead of
overwriting them. The rejected import-margin pilot uses the same
progression and Gate A commands with `--seeds 20260503,20260515` and its own
`hpa-721-import-margin-*` output prefix, while its two-line patch is active.
The isolated upgrade-cost pilot uses that seed subset with its single-constant
patch and the `hpa-721-upgrade6k-*` prefix. Its reference trace also uses seed
20260503 convenience. Frozen evaluations are `hpa-721-upgrade6k-evaluation.json`
and `.log`; they include input hashes, paired rows, and the unchanged Gate A
diagnostic comparison.

The expansion-stock screen uses the same two-seed diagnostic commands with the
saved `hpa-721-expansion-stock-production.patch` active and its distinct prefix.
Its lead-authored `hpa-721-expansion-stock-cash.ts capture` freezes exact opening
inputs; `cash` reads those inputs and the preserved initial cash output, retaining
already validated cases and correcting only the borrowed-opening boundaries.
Do not overwrite the preserved outputs. Raw snapshots and cached result hashes
are part of this diagnostic recipe, not an independent official certification.
The patch, helper, frozen inputs and preserved outputs are not committed; they
exist only in the generating workspace's ignored `docs/balance/generated/` and
must be obtained from that archive before a rerun. SHA-256:
`hpa-721-expansion-stock-production.patch`
`7fc21f1e2b681edc80bfcf0f4774e9745bc3b76bb8d8ea3c4d2b5b229f37776e`,
`hpa-721-expansion-stock-cash.ts`
`36a4d44e30793b308ff3d45062255382a53a5ebfaa43c16956285fc24a68a575`,
`hpa-721-expansion-stock-cases.json`
`5b645dc73a8092568584c0606118ad180e74a0ebbfbe8a32c19fe32cad3fb08c`,
`hpa-721-expansion-stock-cash.json`
`d7308ab2a3b8e815544a5f03ce41e3f162093cbce434ba17e684e02f5cd4c91d`.

## Remaining Acceptance Work

Current-source matrices and the reference trace are captured and judged above.
The next change must address the measured progression and economic failures,
not weaken coverage, idle, or spacing checks. A final accepted source and
same-harness before/after certification are not established by this checkpoint.
Robust marginal-store and local-chain cash/payback evidence for a settled joint
candidate, final
`progressionDiff`, any scenario re-pins, check/lint/full-unit/affected E2E, and
macOS/Windows visual smoke remain required. Do not substitute inventory
valuation for cash benefit, or passing correctness tests for economy acceptance.

No exceptions, human readiness approval, or platform-smoke pass are claimed.
