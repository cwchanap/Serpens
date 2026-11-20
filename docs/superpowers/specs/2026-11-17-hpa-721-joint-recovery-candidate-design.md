# HPA-721 Joint Recovery Candidate R1

**Status:** Exact values and one bounded trial approved and executed on
2026-11-17. **R1 rejected; all temporary source/test edits restored.**
Execution is recorded in `../plans/2026-11-17-hpa-721-joint-recovery-r1.md`;
runtime results are in `../../balance/economy-pass.md`.
This design is not an accepted economy or authorization for an official sweep.

**Source:** Restored `95ff7dfb5be9ddc04241029aeb01286eeba3002c`.
Application/tests still match the 475-file diagnostic baseline. Existing
documentation edits and ignored historical evidence must be preserved.

## Intent And Approach

Make the next experiment a joint repair, not another isolated price or upgrade
discount. Grocery must sell a healthier mix instead of wasting produce behind
pantry's capacity priority. The other archetypes need a reachable upgrade path
without making boutique's already-strong later revenue curve stronger.

Considered approaches:

1. **Cheaper upgrades alone:** rejected. It leaves grocery's mix/loss problem
   intact and makes boutique's unlocks cheaper without damping later revenue.
2. **Five existing numeric controls together:** recommended below. Keep the
   deterministic sales/claim/bot algorithms and all acceptance targets intact;
   test the coupled price, demand, working-capital and leveling hypothesis.
3. **Fair-share SKU allocation, a claim cooldown, or a new upgrade-borrowing
   policy:** not selected. Those change the approved gameplay/harness contract.

This is one falsifiable bundle, not a parameter search. It may still fail
scenario intent, grocery pacing, Tier-5 spacing, or equity. Such a failure
rejects the bundle; it is not permission to change a gate.

## Exact Five-Control Delta

These deltas are relative to the rejected corrected linked candidate, not the
restored checkout. Reapply archived patch
`0ef2cd75774efdc3f0246e2e1cb1169c7cdecfcb528bc854cbbc353a73f5fd73`
only after approval, then make only the following numeric changes and the
explicit scenario price adjustments in this document:

| Existing Control                                    | Rejected Candidate |   Proposed R1 |
| --------------------------------------------------- | -----------------: | ------------: |
| `PRODUCTS.produce.defaultSellingPrice`              |                 11 |        **13** |
| Harbor `retailDemandProfile.pantry`                 |         implicit 1 |       **0.4** |
| Nonfounder pantry paid target and reorder threshold |      1,000 / 1,000 | **500 / 500** |
| `RETAIL_UPGRADE_BASE_COST`                          |              8,000 |     **2,000** |
| `STORE_REVENUE_BONUS_PER_LEVEL`                     |               0.10 |      **0.05** |

Locations: `products.ts`, `worldCatalog.ts`, the existing
`EXPANSION_STAPLE_STOCK_TARGET` entry in `state.ts`, and `leveling.ts`.
The stock entry keeps the existing nonfounder override; no new predicate.
Update the leveling header's numeric examples with the approved constants,
without changing pre-upgrade-level pricing or milestone exclusions.

Everything else in the archived runtime treatment remains fixed:

- Retail water import/shelf 3/8, snacks 12/18, produce import 6, pantry 8.5/16.
- Harbor snacks profile 1.4; all other city/product profiles unchanged.
- Grocery rent 120 and setup tile-rent coefficient 1, versus restored HEAD's
  165 and 2.5. No further setup, rent, traffic or access-fee change.
- Nonfounder water target/threshold 700/700, produce 180/180, and snacks 90/25.
- Founding stock/default targets, opening lot quantities, existing saved prices,
  cash/debt, finance rules, salaries, staffing, explicit inventory orders and
  seven-day replenishment timing.
- Material quotes, recipes, building costs/fixed costs/throughput, warehouse,
  rail, world reveals, store caps, unlock levels 4/7/10 and all ladder goals.
  Retail pantry import 8.5 remains distinct from material import 8.

There is no migration, schema, dependency, UI, metric, observer API, new branch,
bot-policy, scoring, medal, day-limit or claim-algorithm change.

## Why These Values

### Grocery Mix And Paid Working Capital

The diagnostic's rival-free seed already has share 1, but pantry's full pool
uses shared selling capacity before produce. The Harbor-only 0.4 profile
reduces that earlier pool rather than creating more demand or changing order.
It gives a 108-unit native pantry pool in both frozen diagnostic cities.
Produce's whole price 13 gives actual common-ground gross 7/unit, near pantry's
7.5, rather than the rejected produce margin 5.

A fractional equal-margin sketch is explicitly rejected: configured 13.5 is
rounded to actual shelf 14 by `getBrandDefaultSellingPrice`, yielding gross 8,
not 7.5. Its worst canonical founding ratio is 2.02344, above the unchanged 2.0
cap. Do not adopt it or modify rounding to make it fit.

The final whole-price-13 preview has ten new native canonical grocery rows:
all sell both products and lie between **1.59325 and 1.93250** gross/cost.
Thirty unaffected founding rows are reused from the frozen design, not rerun.
The existing 1.2/2.0 bands and boutique 2.4 floor remain unchanged. This is
perfect-stock founding arithmetic, not runtime/scenario/forecast certification.
In the price-13 preview, shelf/default ratio is exactly 1.

The 500 paid pantry target covers conservative rolling-seven-day demand bounds
of **282 / 419** in the two frozen opening arms. These bounds rescale each
observed unconstrained desired quantity, with rounding headroom, for the new
108-unit pool while holding old share, policy, split, jitter and state fixed.
They exclude the initial pre-order week. They are not predictions after
reputation, staffing, spending, inventory or placement changes.

An empty grocery target fill changes **9,580 -> 5,330**, releasing 4,250 of
paid inventory requirement versus the rejected treatment. This is not that
much extra yearly profit or a cash grant. The actual opening gift debit
remains **2,149**, with unchanged 140 produce / 154 pantry units. Founder
pantry targets remain 55/198. The new paid target is still higher than HEAD's
default, not an inventory reduction relative to an untuned new game.

### Upgrade Access And Later Revenue

| Transition / Level           | Rejected Cost / Multiplier | R1 Cost / Multiplier |
| ---------------------------- | -------------------------: | -------------------: |
| L1 -> L2 cost                |                      8,000 |                2,000 |
| L2 -> L3 cost                |                     16,000 |                4,000 |
| L3 -> L4 cost                |                     24,000 |                6,000 |
| Total L1 -> L4 cost          |                     48,000 |               12,000 |
| L1 revenue multiplier        |                       1.00 |                 1.00 |
| L2 revenue multiplier        |                       1.10 |                 1.05 |
| L3 and L4 revenue multiplier |                       1.20 |                 1.10 |
| L7 revenue multiplier        |                       1.40 |                 1.20 |
| L10 revenue multiplier       |                       1.60 |                 1.30 |

The quarter-cost/half-bonus pairing improves the nominal incremental revenue
per upgrade dollar without granting the full old revenue at the cheaper
price. It is a deliberately substantial affordability test after the failed
6,000-base screen, not a claimed optimum. It leaves 6,000 more cash after the
first upgrade in isolation, but later decisions make that no forecast of the
actual path.

Lower bonuses affect every upgraded archetype, not only boutique. The intended
boutique-down effect is a hypothesis: cheaper unlocks can offset it, and other
archetypes can lose operating cash. Measure the new paths rather than applying
percentage overlays to frozen progression.

`companyBookValue.ts` values upgrades at current catalog cost, not historical
receipts. New upgrade cost and asset value change together; no instant wealth
is created by paying less. Existing upgraded saves would be revalued, with
possible credit/goal effects, while saved selling prices remain explicit.
Existing-save economics are uncertified; no compensating migration is allowed.
Existing unlock stock may arrive sooner: report it rather than calling it
earned cash or adding free quantities.

## Scope And Guard Inventory

Direct runtime numeric edits are limited to the four files above plus the
listed scenario price offsets. Inspect/update the affected tests and numeric
comments, not the algorithms. Callers of the changed leveling helpers are
`state.ts`, `placement.ts`, `stock.ts`, `companyBookValue.ts`,
`scenarios/setup.ts`, and `tests/balance/bots.ts`. Only their legitimate
catalog-derived fixture arithmetic may change; the bot implementation does not.
Existing exports and persistence shape remain unchanged.

The approved implementation plan must specify focused RED/GREEN cases for:

- Actual common-ground produce shelf 13, gross 7, and demand ratio 1; no
  fractional-price or brand-rounding workaround.
- Harbor pantry 0.4/snacks 1.4, other profiles unchanged; canonical founding
  guards unchanged.
- Nonfounder pantry 500/500 with unchanged lots, founder 55/198, paid imports
  totaling 5,330 from empty grocery shelves, and unchanged weekly timing.
- Upgrade costs 2,000/4,000/6,000, cash-only rejection without enough cash,
  unchanged cap and product/capacity milestones.
- Revenue 1/1.05/1.10/1.10 through L4, no bonus at L4/L7/L10, unchanged industry
  upgrade/throughput coefficients; consistent forecast and book-value math.

Use existing leveling, products, worldCatalog, state, placement, stock,
retailSupply, retailUnitEconomics, companyBookValue, supplyPlanner and
supplyPlannerActions guards plus scenario runtime/setup coverage. Inventory
all failures; import errors are not a valid RED gate. Lead reviews changed
arithmetic expectations. Semantic failures are not repinned.

## Scenario Boundary: First Gate, Not An Afterthought

Keep all starting stock, cash/debt, policies, targets, objectives, bands and
medal thresholds unchanged. Mirrored unit/E2E reference fixtures must agree:

| Scenario        | Opening / Reference Prices In R1                            |
| --------------- | ----------------------------------------------------------- |
| First Profit    | water/snacks opening 3/8; reference explicitly 8/18         |
| Local Lifeline  | water opening 8; reference 6, as in corrected candidate     |
| Fresh Market    | produce opening **13** rather than candidate 11             |
| Rival Next Door | produce opening **13**; reference **14**, rather than 11/12 |

Do not add reference commands or scenario policy/inventory changes beyond
these retained/updated price actions. All seven scenarios require fresh
reference/no-action plays: fourteen plays, not reused runtime certification.
This includes Import Squeeze, Debt Turnaround and Two City Supply Run.

Require reference gold and preserved no-action teaching/separation, outcomes
and deadlines. First Profit must remain day 4 / 682 bronze versus day 4 / 862
gold, with positive reference COGS-based operating income. Keep cash-based
scoring and its exact bands unchanged. Other numeric score differences need
lead review against fresh raw reports; no automatic pin updates.

**Specific stop risk:** less pantry competition may let Fresh Market's produce
sell before spoiling, removing its intended no-action failure. Do not fix that
by raising waste/income thresholds, changing opening lots, or adding a new
scenario-specific mechanic. If the specified price corrections cannot retain
its teaching/guard shape, stop this R1 trial and return evidence.

## Bounded Trial After Approval

1. Freeze a lead-authored candidate patch, source/fixture preimages, helper
   hashes, recipe and all input hashes. Use new exclusive-write outputs under
   `docs/balance/generated/hpa-721-joint-recovery-r1-*`. No old archive changes.
2. Demonstrate focused structural RED/GREEN and run all affected correctness
   guards, then the fourteen fresh scenario plays. Stop on semantic regression.
3. Only if those pass, capture **eight progression plus eight idle** trajectories:
   four archetypes, seeds **20260503/20260515**, **365 days**. Retain native
   summaries, claim traces, reports, full ledgers, cash at deferrals, commands
   and all applicable primary/secondary chain evidence in the same run.
4. From the new candidate's actual captured forks, run **twelve** 365-day
   component arms: four first-expansion opening/no-opening pairs plus the
   seed-20260503 water and produce local/import pairs. Require each first
   opening opportunity on day 1; missing cases are blocked, not moved/reseeded.
   Do not replay old treatment funding or assume the same store sites.
5. Total bounded economy scope: **28 year-long trajectories**, plus fourteen
   scenario plays. This is not the earlier fourteen-trajectory observation-only
   diagnostic. No new Gate A or official matrix is authorized here.
6. Restore every owned preimage even on failure, verify complete source/test,
   frozen archive, recipe and helper hashes, then run restored affected guards.
   Keep only evidence/docs and any explicitly identified measurement artifacts.
   No live save, deployment, commit, push, or PR lifecycle action.

### Unchanged Verdicts

- All four expansion cases need positive days-61-90 marginal operating cash
  and strictly positive day-365 financing-neutral, opening-gift-debited cash.
  Report 90-day payback; do not invent a 90-day payback gate.
- Both primary local cases need positive day-365 cash benefit after incremental
  investment and a positive conservative local-sales lower bound. Preserve
  physical conservation and disclose imports, delivered units, sales, waste,
  shrink and closing inventory; FIFO alone is not provenance.
- Idle earned/claimed tiers remain zero. Use unchanged
  `evaluateProgressionPacing`: per-archetype Tier-3 share >=0.8 and median day
  90-150, Tier-5 share >=0.5, paired T4-to-T5 median >=30 days, and peak-median
  equity ratio <=3. Do not alter its coverage check: `coverageComplete` and
  `allPassed` remain false for this pilot even if diagnostic rows improve.
- Any failed diagnostic row/monetary gate keeps the bundle blocked. No
  official sweep follows automatically. Even a promising pilot still needs
  secondary/boutique/electronics local-chain cash evidence, broader seeds,
  official progression/idle/Gate A matrices and final engineering/platform
  checks on a settled source.

The old grocery Tier-3 median is already too early (71), so cheaper upgrades
and healthier cash could worsen that pacing. L4 `prepared` also precedes
produce in the unchanged SKU order; electronics `devices` precedes games.
Watch actual post-unlock mix/paid inventory, not just L1 arithmetic.
Boutique may still pre-earn Tier 5 and claim stacked tiers. None of these
risks is waived: if they occur, record failure. Shared ladder numbers are
not part of R1 and require a separate justified proposal only after viable
economics; a cooldown or changed bot remains out of scope.

## Evidence And Approval

Frozen design inputs: the corrected-candidate archive, the completed
`2026-11-16-hpa-721-joint-recovery-design.md` diagnostic, and its analysis
`a09a3108ed2e0c69ca4caf3e5131dcdcb197967107ce40e5cb880dec6084e0a5`.

The ignored local files
`hpa-721-joint-recovery-candidate-design-{preview,final-preview}.{ts,json}`
retain both the rejected fractional-price sketch and final whole-price
calculation. No daily tick or year-long candidate run accompanied that
analytical design stage; the later runtime trial has its own R1 evidence.
The final output reuses prior stock-sizing/level arithmetic rather than
recomputing it to regenerate a table.

- Final preview script SHA-256:
  `07e395f36beb78dd9b9c91dbb3e894c736eb113aa477b4a3a1fd0172f50baaae`.
- Final preview output SHA-256:
  `5f2c7c9d89c767e44cda72b4661483719f592baa373d6509eae477e326469d99`.

Approval must cover the five exact control values, listed scenario price
adjustments and one bounded trial. It does not approve adoption, threshold
changes, automatic numeric retries, official matrices, or commits/pushes.

## Executed Trial Outcome (2026-11-17)

The approved fourteen scenario plays and 28 year-long trajectories are
complete, under the ignored `hpa-721-joint-recovery-r1-*` prefix. References
retain gold/days and no-actions retain outcome/medal/failure-deadline separation.
Import Squeeze no-action d15/663 -> d16/680 is disclosed: the approved L4
multiplier is 1.10 rather than 1.20, still within the unchanged day-21 limit.
Other reviewed numeric scenario observations are listed in the report;
this is not a claim that historical result pins are identical.

All four expansion annual cash screens pass: convenience +8,129/+8,996
and grocery +43,673/+1,412, with positive days-61-90 marginal operating
cash and unchanged opening-gift debits. Day-90 payback is not reached.
Water local cash +1,652 has a positive productive lower bound; produce
cash +6,244 does not prove productive local sales (lower bound zero).

Pacing/equity reject the bundle. Convenience/grocery Tier-5 reach stays
0/2; boutique still claims Tiers 3-5 together; electronics reaches Tier 5
in 2/2 but its T4-to-T5 median is 24.5 days, below 30. The peak-median
ratio is 9.98290755984483, above 3. Full SKU reports also preserve the
uneven grocery post-`prepared` mix; no allocation or ladder workaround is
introduced. Eight idle controls earn/claim zero tiers.

Independent checks cover 10,220 daily reports, cash/COGS equations, component
conservation and raw-claim pacing. All 475 baseline source/test hashes are
restored; 514 restored guards and 19 observer tests pass without skips.
Only docs/evidence remain. The analysis hash is
`881121e6169d3ddca6bbb9924e0139b6783d37f5c8f4f06c6f4b2058a414ce06`.
No official matrices, full engineering/E2E/platform checks, save certification,
commit, push or PR action is performed. Any next treatment needs a new
justified proposal; this approval does not authorize another tuning retry.
