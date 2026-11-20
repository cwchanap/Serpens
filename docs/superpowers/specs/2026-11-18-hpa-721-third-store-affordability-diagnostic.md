# HPA-721 Third-Store Affordability Diagnostic

**Status:** Proposed, not run. This is an isolated economy experiment, not
adoption of R2 or approval for an official sweep.

## Why Start With Expansion

The restored economy with the Tier 5 operating-month rule leaves convenience
at two stores in both seeds and grocery at three (third stores on days
169/204). Neither archetype claims Tier 4. R2's cheaper upgrades already
get both convenience and both grocery founders to level 4, but convenience's
third stores still arrive on days 295/239 and grocery's on day 106/never.
Another upgrade cut does not directly address that bottleneck. R1's four
matched convenience/grocery openings recover their financing-neutral adjusted
outlay by day 365, but none has paid back by day 90. Annual payback and the
cash needed for a third store in time for progression are different questions.

The frozen R2 ledger records the actual setup quote, reserve, cash and native
credit offered when the third-store purchase was deferred. At each deferred
attempt through day 150 with two stores, the frozen-state coverable setup quote
is `cash - reserve + floor(availableCredit / 1000) * 1000`: the bot rounds the
required 84-day draw up to a multiple of 1,000. The following are the best
observed opportunities, not forecasts of a changed run:

| Archetype / Seed       | Day | Setup quote | Coverable quote |   Gap | Room with 6,000 cut |
| ---------------------- | --: | ----------: | --------------: | ----: | ------------------: |
| Convenience / 20260503 |  15 |      18,987 |          13,772 | 5,215 |                 785 |
| Convenience / 20260515 |   8 |      18,724 |          13,211 | 5,513 |                 487 |
| Grocery / 20260503     |  85 |      19,184 |          13,966 | 5,218 |                 782 |
| Grocery / 20260515     |  29 |      19,184 |          14,320 | 4,864 |               1,136 |

Reject a shared discount or more generous credit: they also help premium
chains expand, or change the cash/finance contract. Reject an additional
broad R2-style bundle: it would not identify why expansion moved. Prefer a
single targeted quote delta, with matched native trajectories.

## Exact Treatment

Compare two temporary sources on the same reviewed Tier 5 implementation:

- **Control:** the archived R2 runtime overlay, including its retained R1
  inputs and scenario calibration, reconstructed and verified against the
  R2 capture lock before layering in the reviewed Tier 5 change.
- **Treatment:** same source, except the fixed base term in
  `getExpansionSetupCost` (`src/lib/game/state.ts`) is **3,000 instead of
  9,000 for convenience and grocery only**. Boutique and electronics retain
  9,000. Do not change quote coefficients, terrain premiums, city access,
  recurring rent, debt terms, starting capital, stock, or industry.

Use the unchanged shared quote path for actual cash paid, previews, financing,
scenario setup and book value. Do not add a second, undiscounted asset value.
Holding a state fixed, every affected nonfounder store also values 6,000 lower;
on a native purchase the lower asset addition is offset by paying 6,000 less
cash, before financing or other effects. Prices, asset mix, debt and later
decisions can still defer the unchanged 70,000 and 150,000 book-value goals.
Revalue existing saves under current catalog semantics; this trial does not
certify existing-save economics.

The R2 overlay is an experimental control because it supplies the states used
to size the lever. R2 was rejected and is not a replacement baseline. No
historical R2 receipt is a native receipt for this two-arm test. Leave the
operating month, all progression targets, claim rewards, bot and manager
policy, score and acceptance evaluator unchanged.

## Bounded Check

Use a temporary isolated checkout for both arms; leave the current reviewed
worktree untouched. Recover and verify the exact R2 capture source/fixture
pin first (archived patch and companion observer pin). Overlay the reviewed
Tier 5 diff without changing its semantics. Stop if either source cannot be
reconstructed or an overlap cannot be reconciled with byte/semantic evidence.
Pin both resulting manifests, the recipe and the historical inputs before
capturing any runs. Do not overwrite previous captures.

1. Before annual runs, verify on canonical tiles that the treatment subtracts
   exactly 6,000 for each targeted archetype, leaves both other quotes and
   existing tile ordering unchanged, and propagates consistently through
   native purchase debit and retail asset valuation. Run the same 14 scenario
   plays on **each** arm, using the approved scenario guardrails and frozen
   R2 comparison. Preserve reference/no-action teaching and medal separation,
   and the First Profit pins. Review or disclose numeric drift as the existing
   guard requires; do not fix failed teaching by changing scoring, rules, or
   fixture outcomes. Stop before the long runs if these checks fail.
2. Run exactly **eight 365-day progression trajectories**: convenience and
   grocery, seeds `20260503` and `20260515`, in both arms. Reuse the native bot
   and claim observer. Capture legal openings and their prices, attempted
   quotes/cash/reserve/credit, cash and debt at matched horizons, days of
   stores three/five/seven, all tier receipts, reported peak book value, and
   operating-month evidence if reached. Apply normal by-day-365 receipt
   counting, not the terminal day-366 check. From each matched pair distinguish
   buying store three sooner from clearing earlier-tier book value and then
   Tier 3; also flag Tier 3 reached before day 90. Effects are diagnostic, not
   a new acceptance gate or proof of financing-neutral payback.
3. If the opening does not advance on one or more blocked paths, or earlier
   openings do not resolve the earlier-tier blockers, do not increase the
   rebate or proceed automatically to a joint bundle. Report the binding
   constraint. If the lever works, seek separate approval for matched cash
   payback, scenario/idle/full-archetype coverage and a joint screen. Restore
   temporary candidate edits and verify input hashes on every exit.

## Other Upstream Blockers

- **Electronics:** both restored runs finish with six stores and max level 2;
  level 4 is the only missing Tier 4 goal. The frozen R1/R2 bundles do reach
  level 4, but also change product and supply economics. The R2 control
  already includes its 1,000 upgrade base. Do not vary upgrades again in this
  trial or infer that the upgrade price alone fixes electronics or equity.
- **Boutique:** under R2, workshops first produce gifts on days 113/120,
  before the warehouse on days 120/141. Retail first receives local units
  on days 175/210; the last rail links before those receipts apply on days
  169/204. Before first receipt, four/six post-warehouse
  rail attempts fail at prices of only 8 to 64 with deeply negative cash.
  The captured days from warehouse build until first receipt also contain
  69,482/86,282 of gift import spend, within 296,455/392,191 of total import
  spend. Those are gross purchases, not lost margin or a clean counterfactual.
  A workshop discount is not a remedy for those cash failures. Before
  proposing a SKU change, inspect lost demand and paid refill sizes/timing
  separately for gifts and the founding products; do not skip the cash gate
  or change planner behavior.

Evidence: source-pinned `hpa-721-tier5-operating-month-screen.json`, R1
aggregate and matched cash report, and R2 per-run ledgers and capture
metadata under `docs/balance/generated/`. The guaranteed 30-day gap is a
rule check, not independent evidence of improved pacing. No idle, payback
arms, official matrices, or PR actions are approved by this proposal.
