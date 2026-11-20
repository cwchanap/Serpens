# HPA-721 Joint Recovery R2 Proposal

**Status:** User approved these exact values and this bounded trial in
conversation on 2026-11-17. Gameplay remains **unapplied**; implementation-plan
review and execution-method selection are pending. R1 remains rejected.
No economy acceptance or official sweep is authorized.

**Source:** Restored `95ff7dfb5be9ddc04241029aeb01286eeba3002c`, with the
existing documentation changes preserved. All 475 baseline source/test hashes
remain unchanged. Deltas below are relative to the **temporary R1 runtime**,
not the restored checkout. The R1 design and pilot lock define that treatment.

### Required Local Inputs

All paths here are relative to the current Serpens workspace root. R1 means:
restored source above, plus
`docs/balance/generated/hpa-721-linked-corrected-pilot-prepared-final.patch`
(SHA-256 `0ef2cd75774efdc3f0246e2e1cb1169c7cdecfcb528bc854cbbc353a73f5fd73`),
then the five R1 deltas and scenario offsets specified in
`docs/superpowers/specs/2026-11-17-hpa-721-joint-recovery-candidate-design.md`.
The corrected archived patch is still required; baseline plus R2 alone is
not this candidate. Use
`docs/superpowers/plans/2026-11-17-hpa-721-joint-recovery-r1.md` for the
recorded R1 application recipe.

The restored preimage manifest is
`docs/balance/generated/hpa-721-joint-recovery-r1-before.json`; candidate
runtime/input pins are in
`docs/balance/generated/hpa-721-joint-recovery-r1-pilot-lock.json`.
These files and the R1 captures/analysis are present locally but **git-ignored**,
so a clean clone or isolated review workspace may not contain them. Stop if
they are absent or mismatched; do not reconstruct evidence from memory or
substitute a different baseline.

## Intent And Chosen Approach

Make expansion and productive local manufacturing financially useful while
preserving the cash game, scenario teaching, progression ladder, bot policy,
and acceptance gates. Fix the different economic mechanisms together rather
than applying another universal revenue buff.

Approaches discussed before this document:

1. Retry R1's five controls only. Not selected: those controls do not directly
   change the newly identified industrial running-cost/import-quote mismatch.
2. Add warehouse headroom or utilization only. Not selected: boutique's
   captured six production buildings cost 85/day before recipe fees, while
   its level-1 workshop can produce at most six gifts, avoiding at most
   54/day of imports at quote 9. This cannot repair that configuration.
3. Broaden existing economic data controls to unlocked SKUs and industrial
   costs/import quotes. **User selected this scope.** The exact proposal
   below is my design choice, not a user-approved numeric bundle.

Do not change planner ranking, SKU ordering, manager playbooks, bot cadence,
claim evaluation, reveal rules, recipe quantities, or factory/rail capacities.
There is no new economic setting, multiplier, wrapper, schema or dependency:
apply literal values to existing fields only after separate approval.

## Evidence And Its Limits

Frozen R1 evidence separates four problems:

- Convenience seed 20260503 meets Tier 3's own conditions on day 113 but
  clears Tier 1's book-value condition only on day 240. Grocery seed
  20260515 meets Tier 3's own conditions on day 36 but never opens store 3.
- Boutique has Tier 5's own conditions ready on days 113/78, before Tier 3
  claims on days 169/197. Earlier deliveries alone do not establish spacing.
- Devices contribute 1,191,540/935,844 of electronics SKU COGS-based gross
  margin. That is not fully loaded profit or a measured causal cash delta.
- Grocery produce inventory losses are 52,818/98,136. After L4, prepared
  joins pantry ahead of produce in shared sales-capacity order. On the
  final day of seed 20260515, the founder sells pantry 62/prepared 64/
  produce 0, despite produce stock 555 and desired quantity 127.

The captured industrial networks are also expensive relative to their
finished output. Even crediting every produced gift as an avoided import,
R1 gift output covers at most 5,643/4,968 against running/import costs
32,499/30,375, before construction. These are recorded-activity bounds,
**not matched local/import cash results**. Static capacity bounds hold the
captured building sets/levels fixed, not every possible layout.

Evidence files, all under `docs/balance/generated/`:

- `hpa-721-post-r1-mechanisms.json`
- `hpa-721-post-r1-sku-details.json`
- `hpa-721-post-r1-capacity-bound.json`
- `hpa-721-joint-recovery-r2-design-preview.json`
- `hpa-721-joint-recovery-r2-final-design.json`

The last file is the exact 33-delta manifest. Its input hashes bind the
immutable sizing output; no frozen trajectories are rerun for presentation.
It already exists locally, authored during this design, with SHA-256
`ee6cf95f4848ec243b3cfa60eb629c7155fb7354c2301c307868f0a7d6680e1d`.
Freeze that existing manifest rather than regenerating its values during the
trial. It and this document must agree; a discrepancy blocks application,
not permission to choose one set of numbers over the other.
The manifest retains its historical pre-approval status text; the subsequent
approval is recorded in `hpa-721-joint-recovery-r2-approval.json`.

## Exact R2 Values

Retain the full R1 treatment except these **33 numeric fields in five files**:
`products.ts`, `worldCatalog.ts`, `leveling.ts`, `industry.ts`, and `rail.ts`.

### Retail And Upgrades

| Existing Field                      |         R1 | Proposed R2 |
| ----------------------------------- | ---------: | ----------: |
| Soft-drinks default shelf price     |          4 |           8 |
| Devices default shelf price         |        240 |         200 |
| Gifts retail import cost            |          9 |          14 |
| Harbor prepared-food demand profile | implicit 1 |         0.1 |
| Retail upgrade base cost            |      2,000 |       1,000 |
| Industrial upgrade base cost        |      5,000 |         250 |

Gifts shelf price stays 19. Accessories stay import/shelf 11/22; games,
apparel and home goods are unchanged. Do not inflate founding quotes to
subsidize manufacturing: that would also recalibrate Import Squeeze's
authored x2 import shock and fixed import-spending score bands.

At neutral L4, before daily revenue rounding, unit gross changes:

| Unlocked SKU |    R1 | Proposed R2 |
| ------------ | ----: | ----------: |
| Soft drinks  |  2.40 |        6.80 |
| Devices      | 84.00 |       40.00 |
| Gifts        | 11.90 |        6.90 |

Soft drinks should better support the extra category/staffing cost.
Devices should no longer supply the same large compounding margin. Gift
imports become less attractive, while local gift production gains an
actual avoided-import incentive. Harbor prepared 0.1 leaves nonzero demand
but reduces its priority claim on capacity needed by produce. These are
mechanism hypotheses, not runtime results.

L1->L4 retail upgrades cost 1,000/2,000/3,000, totaling 6,000 rather than
12,000. Keep the R1 revenue coefficient 0.05: multipliers remain
1/1.05/1.10/1.10 at L1/L2/L3/L4. Keep milestone exclusions, level caps,
product unlocks 4/7/10 and industry throughput +20% per level unchanged.
Industrial upgrade price still uses the pre-upgrade level.

### Industrial Construction And Flat Costs

| Building Type            | R1 Build | R2 Build | R1 Flat/Day | R2 Flat/Day |
| ------------------------ | -------: | -------: | ----------: | ----------: |
| Chemical feedstock well  |    1,100 |       55 |          12 |           1 |
| Pulpwood grove           |      650 |       33 |           6 |           1 |
| Copper mine              |      750 |       38 |           7 |           1 |
| Pulp mill                |    1,250 |       63 |          14 |           1 |
| Plastic plant            |    1,500 |       75 |          18 |           1 |
| Circuit-board plant      |    1,500 |       75 |          14 |           1 |
| Packaging plant          |    1,450 |       73 |          17 |           1 |
| Gift workshop            |    1,500 |       75 |          18 |           1 |
| Accessory assembly plant |    1,750 |       88 |          16 |           1 |
| Warehouse                |    1,000 |       50 |   unchanged |   unchanged |

Construction values are the listed whole-currency ceilings of R1/20.
They are literal catalog values, not a new runtime scaling function.
Warehouse capacity stays 200. Its declared flat cost stays 18; the current
engine skips operating charges for recipe-less buildings. Do not bundle a
fix to that existing behavior into this trial.

The nine recipe-bearing types above retain positive flat cost 1 even
when stalled. All other building definitions remain unchanged, including
water, produce and pantry production types.

### Recipe Fees And Rail Prices

| Recipe                   | R1 Operating Fee | R2 Operating Fee |
| ------------------------ | ---------------: | ---------------: |
| Pulp milling             |               16 |                1 |
| Plastic production       |               24 |                1 |
| Circuit-board production |               12 |                1 |
| Packaging production     |               18 |                1 |
| Gift production          |               26 |                1 |
| Accessory assembly       |               15 |                1 |

Only those fees change. Inputs, outputs, stages, buffers, raw recipe fees,
material import/local values and production rounding remain unchanged.

Rail construction changes **40->2 per new cell**. Rail upgrade price changes
**30->2 per cell per pre-upgrade level**; refund ratio remains 0.5. Leave
rail capacity 10 per level, maximum level 5, budgets, paths, ordering,
reserve behavior and shipping rules unchanged. Industrial upgrade base
250 and rail upgrade coefficient 2 keep related capital prices in the
same reduced-cost direction, without changing the upgrade formulas.

These are deliberately large cost changes, not a claimed optimum or a
cosmetic adjustment. Manufacturing still pays positive construction,
flat fees, productive recipe fees and any imported inputs. No cash is
granted and no debt forgiven.

## Analytical Sizing, Not Runtime Proof

The preview holds R1 building dates/counts/levels, output events, industrial
imports, rail cells and warehouse deliveries fixed. It substitutes the
proposed costs and finished retail quotes. Each old daily operating-cost
report must fit the rounding envelope inferred from its actual output.
The engine's original rounding is unchanged.

| Copied Activity |     Seed | Net Sizing Range Before Financing |
| --------------- | -------: | --------------------------------: |
| Gifts           | 20260503 |                  +3,552 to +3,681 |
| Gifts           | 20260515 |                  +2,635 to +2,745 |
| Accessories     | 20260503 |                      +837 to +878 |
| Accessories     | 20260515 |                      +772 to +811 |

These ranges debit the proposed building/rail construction, bounded
operating costs, and recorded imported inputs; credit only the copied
warehouse deliveries times the proposed retail import quote. They exclude
financing/interest, retail-path changes, inventory paper value and salvage.
**They are not measured payback, predicted company cash, or productive-sales
proof.** Electronics' margin of safety is particularly small.

The later upgrade-price additions do not occur in those frozen level-1
activities, so the final manifest references the original sizing rather
than deriving it again.

All 40 canonical L1 founding rows are reused from the frozen R1 design:
their first two SKUs, prices/costs, profiles, staffing, rent and method do
not change. The unchanged convenience/grocery 1.2-2.0 bands, electronics
floor and boutique 2.4 floor remain binding.

## Contracts And Risks

Retain R1 produce price 13, Harbor pantry 0.4/snacks 1.4, pantry paid
target/threshold 500/500, other paid targets, grocery rent 120 and the
R1 setup formula. Keep all starting quantities, cash/debt, finance rules,
salaries, inventory policies, saved prices, replenishment timing, scenario
objectives, score semantics/bands, medals and deadlines unchanged.

No additional scenario price-offset edit is proposed. Keep R1's explicit
produce offsets and First Profit opening 3/8, reference 8/18. Defaults
newly affected by devices/soft-drinks prices remain visible in scenarios;
do not hide them with fixtures that restore old defaults.

Principal risks:

- Cheaper upgrades/capital may accelerate growth enough to preserve stacked
  boutique claims or make grocery Tier 3 too early.
- The planner may build more parallel circuit-board plants at cheaper
  prices. Record all full-bot purchases, costs and buffers; do not change
  ranking, add a cap, or silently remove those plants.
- Lower devices margin may break Import Squeeze/ Debt Turnaround reference
  golds, despite unchanged founding quotes. Those failures reject this
  bundle before long trajectories; no medal/recipe repinning.
- Gift import margin narrows. Test the integrated chain rather than
  presenting a lower retail margin as an upgrade or cash benefit.
- Shared warehouse/rail prices affect other chains. Existing upgraded
  saves would be revalued through current catalog-based book value,
  refunds and credit; existing-save economics remain uncertified.

## Verification And Bounded Approval Scope

An approval must cover this entire exact bundle and the following **maximum
48 year-long trajectories**, not an open-ended search.
The 14 authoritative scenario replays are additional short plays bounded by
their existing scenario day limits (at most 28 days), not part of the
48 year-long trajectories. Focused correctness tests are separate checks.

1. Freeze restored source/test preimages, all evidence/recipe inputs and
   the exact 33-field allowlist. Reconstruct the source-pinned R1 runtime,
   then apply only these deltas plus focused tests/numeric comments.
   Keep bot/progression/claim code byte-identical. Abort on a source or
   recipe surprise rather than selecting another number.
2. Establish focused RED/GREEN and classify affected guard failures.
   Inspect shared consumers of costs in placement, stock, book value,
   industry production, rail/refunds, planner forecasts and scenario setup.
   Require unchanged-input/output/throughput/capacity assertions, full/stalled/
   partial-production fee rounding, cash-only purchase rejection, and
   consistent forecasts/asset values. Do not weaken semantic guards.
3. Replay all 14 scenario plays first. First Profit must retain day4
   682/bronze vs day4 862/gold and positive reference COGS operating income.
   Every other reference must complete gold; no-action outcomes/medals and
   failure deadlines must preserve the R1 teaching separation. Record
   numeric drift instead of claiming historical identity. Stop on failure.
4. Run eight progression plus eight idle trajectories: all four archetypes,
   seeds 20260503/20260515, 365 days. Use the existing evaluator unchanged.
   Capture every later component fork and primary-entry schedule during
   these same eight progression trajectories; no extra capture trajectories
   or year-long reruns are authorized.
   Idle earned/claimed counts must remain zero. Before proceeding, every
   archetype's `tier3Passed`, `tier5Passed`, `spacingPassed`, and the
   evaluator's `equityPassed` must pass. This is an early-stop selection
   screen, not official acceptance: `coverageComplete` and `allPassed`
   must still be false for these partial runs. Stop and restore if a row
   fails; do not spend the remaining component budget automatically.
5. Only if that screen passes, run 32 matched component arms, specified
   below. Use fresh candidate captures, native financing and full reports.
   All existing annual adjusted-expansion and primary-local cash/productive
   sales gates remain binding. No inventory/asset value offsets.
6. Restore every owned source/test file byte-for-byte. Verify all baseline
   and frozen-input hashes, run the affected restored guards and 19 observer
   checks, then format/check only new/owned documentation and `git diff
--check`. Record passed, rejected, blocked and skipped phases separately.
   Remove only newly created temporary source/test files, including focused
   test files; preserve their exact candidate diffs and execution logs as
   evidence. Keep generated recipes/data/logs, before/after manifests,
   restore receipts and owned documentation. No gameplay/test edit persists.

### Component Matrix And Common Retail Recipe

Four archetypes x two seeds x four arms = **32**, with 365 days per arm:

- Expansion pair: no opening versus the captured first day-1 opening, using
  the existing R1 staffing/accounting protocol. Require the native opening
  fork/replay hash to match. If an archetype/seed has no successful day-1
  first opening, the whole candidate is blocked; do not choose another day.
  No later expansion or extra upgrades.
- Local pair: two-store import-only versus two-store primary production,
  both with the same declared retail calendar and manager settings.

Primary products are water, gifts, electronic accessories and produce.
For the local pair, replay candidate day-1 retail-only commands into a cold
two-store state, excluding industrial commands and their borrowing. Use
native paid commands/funding to bring both stores to L2 on day1, L3 on day8,
and L4 on day15; staff minimum role gaps with the existing deterministic
staffing helper after upgrades. No further retail expansion/upgrade.
This deliberately tests post-unlock produce competition as well as gifts.
It differs from R1's static local fixture; do not label the results a
like-for-like R1 local-cash comparison.

Both arms share that common fixture/retail calendar. Only the local arm
replays the candidate's captured primary construction/rail/supply-source
schedule through its first completed raw-to-retail entry. Then both
continue natively without additional industrial construction. Do not
force levels, inject staff/cash/materials, import finished warehouse goods
and call them local, or cherry-pick a later opening/entry. A missing/legal
funding/command/entry preflight blocks the candidate, not just that row.

All capital and operation funding must use real native credit decisions;
retain the frozen cash-reconciled accounting semantics. Show borrowing,
repayment, interest, remaining debt, setup/upgrade/rail/import costs and
opening gifts separately. Debit actual entrant stock at current quotes:
convenience 1,092; boutique 1,970; electronics 3,180; grocery 2,149.
No new quantities are granted.

For every local pair, reconcile produced/received/sold/closing/loss units
and require positive productive local-sales evidence using the existing
conservative lower-bound method. A positive cash gap alone is insufficient.
Record native L4 unlock-stock grants as separate non-production receipts in
that conservation ledger; never count those units as local deliveries.
Include the scheduled paid retail upgrades in command-cash reconciliation.
Full progression reports continue to include any late parallel plants:
the truncated-entry component is not proof that every full-bot industrial
purchase pays back.

## Deliverables And Explicit Exclusions

If approved, the next step is a source-pinned implementation plan and
lead-authored measurement/recipe artifacts, not immediate gameplay editing.
Retain raw reports, applied command/cash journals, claim evaluations, SKU
windows, chain builds/buffers and all restoration receipts.

No official matrices, Gate A certification, full engineering/E2E/platform
checks, save certification, commit, push, PR update or merge is included.
Passing this pilot would justify discussing the next acceptance stage,
not declaring the balance pass accepted.
