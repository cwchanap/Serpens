# HPA-721 Joint Economy Recovery Proposal

**Status:** Human-approved diagnostic completed. All eight progression/trace
pairs and six component arms match their frozen results; the source is restored.
No new numeric candidate is specified, applied, or approved. The corrected linked
candidate remains rejected; this document does not authorize certification or adoption.

**Inspected HEAD:** `95ff7dfb5be9ddc04241029aeb01286eeba3002c`.
Its application and test hashes match the restored `18a6f846` snapshot.
The intervening commit records the rejected screen; it is not a new economy.

## Goal And Approach

Find one joint, numbers-only candidate that makes expansion and productive
local supply worthwhile while meeting the existing progression/equity targets.
Do not keep testing price bundles that leave upgrade affordability and stacked
claims unexplained.

Three approaches were considered:

1. **Another immediate price/stock or upgrade-cost bundle:** small to implement,
   but the frozen evidence does not justify its values. Grocery's two seeds
   have radically different product mixes; an isolated 6,000 upgrade-base
   screen already failed. Reject this as the next experiment.
2. **Fixed-source diagnosis, then a joint existing-control bundle:** recommended.
   Capture only missing decision and product evidence at the exact rejected
   source, verify observational equivalence, then propose exact tuning values.
   This costs a bounded diagnostic run rather than an ungrounded tuning pilot.
3. **A claim cooldown, new profit metric, or changed borrowing/bot policy:**
   changes the approved gameplay or measurement contract. Not selected.

The human subsequently approved this fourteen-trajectory diagnostic. That approval
does not extend to a new numeric candidate, certification, or adoption.

## What The Frozen Evidence Establishes

These are new derivations from existing captures, not new simulations.

### Grocery Needs Recurring Contribution, Not Only A Smaller Entry Bill

The financing-neutral, gift-debited annual cash bridge reconciles exactly:

```text
adjusted cash gap =
  marginal operating cash flow - marginal interest paid
  - setup cash - opening-stock gift debit
```

| Seed     | Marginal Annual Operating Cash | Setup Cash | Gift Debit | Adjusted Cash Gap |
| -------- | -----------------------------: | ---------: | ---------: | ----------------: |
| 20260503 |                          4,710 |     19,233 |      2,149 |           -16,672 |
| 20260515 |                          5,324 |     18,995 |      2,149 |           -15,820 |

Marginal paid interest is zero in both grocery cases. Borrowed principal and
book-value changes contribute nothing to this bridge. Closing at zero would
still not satisfy the existing strictly positive cash gate.

The product mix prevents treating one seed as representative:

| Additional Units Versus No Opening | Seed 20260503 | Seed 20260515 |
| ---------------------------------- | ------------: | ------------: |
| Produce sold                       |        13,626 |           197 |
| Pantry sold                        |        25,991 |        38,160 |
| Produce waste                      |           382 |         6,679 |
| Produce shrink                     |         1,514 |         1,122 |

Every arm's opening stock, receipts, sales, losses, and closing stock reconcile.
This establishes a mix/loss problem worth diagnosing, not its particular cause.
Capacity competition, stock timing, policy, and market share must be separated
before changing Harbor demand or increasing production throughput.

### Tier 4 And Boutique Spacing Are Different Problems

All six non-boutique traces finish at maximum store level 2 and fail Tier 4's
level-4 goal. The bot upgrades cash-only, after supply/city spending and before
expansion; expansion can borrow. That is the executed policy, not a proposal
to change it. The frozen captures do not retain the complete attempted-action
ledger needed to select a new joint upgrade price.

Boutique's own Tier-5 requirements are satisfied before its Tier-4 requirements:

| Seed     | T5 Own Goals First Observed | T4 Own Goals First Observed | T3/T4/T5 Receipt Day |
| -------- | --------------------------: | --------------------------: | -------------------: |
| 20260503 |                         106 |                         176 |                  225 |
| 20260515 |                          78 |                         197 |                  253 |

The two claim evaluations append Tiers 3-5 together, with eight stores and peak
values 435,484 / 473,468. The late local-delivery requirement releases an
already-eligible prefix. Faster local deliveries alone do not establish a
30-day T4-to-T5 gap. Earlier receipts also change rewards and later decisions:
these eligibility dates are observations, not counterfactual forecasts.

Tune the remaining shared Tier-5 numeric requirements only after viable
economics, with new approval and seed-level evidence. Do not add a timer, change
the contiguous-prefix algorithm, or choose a threshold merely to exclude these
two observations.

### Local Sales Remain Unproven, Not Proven Absent

The frozen grocery local arm delivers 2,760 produce units, with 4,042 waste,
2,207 shrink, and 401 closing units across mixed imported/local stock. Its
conservative local-sales lower bound remains zero.

`ProductStockLot` records received day and quantity, not source. FIFO does not
recover provenance when receipts are mixed. Do not label every delivery a sale,
assign all losses to imports, or replace the established lower bound after
seeing the failed result. Diagnose sales and losses before producing more.

## Proposed Fixed-Source Diagnostic

Approval of this checkpoint would permit only the following work:

1. Author and freeze a separate lead-owned capture recipe before execution.
   Reapply the exact corrected patch
   `0ef2cd75774efdc3f0246e2e1cb1169c7cdecfcb528bc854cbbc353a73f5fd73`
   to the verified restored application tree. This is a diagnostic treatment,
   not revival of the rejected candidate for certification.
2. Run eight 365-day progression trajectories: the four archetypes on seeds
   `20260503` and `20260515`. Retain the existing action ledger, claim trace,
   report series, and chain summaries for water/snacks, gifts, accessories,
   and produce/pantry as applicable. Reuse `runProgressionBot`,
   `summarizeProgressionRun`, the claim collector, and `summarizeChainEvidence`.
   Do not alter the bot or add another observer API.
3. Compare all eight summaries and claim traces exactly with their frozen
   counterparts before interpreting the extra fields. Disagreement blocks the
   diagnostic; do not repair pins, remap IDs, or substitute another seed.
4. Replay only the two grocery expansion comparisons and the existing
   seed-20260503 grocery local/import comparison, preserving their archived
   forks, commands, funding, gift debits, construction dates, and 90/365-day
   boundaries. This adds six component trajectories, for fourteen trajectories
   total. Retain their daily reports instead of throwing them away at summary
   time. Require exact equality of every previously captured component field.
5. Explain attempted upgrade deferrals using their existing ledger details
   (actual cost, reserve, cash), alongside city/industry/opening expenditure.
   Preserve failed attempts; successful commands alone omit the constraint.
6. For both grocery expansion arms, retain store/product/day sales, lost
   demand, stockout-lost demand, receipts, import spend, losses, and closing
   inventory. In the current sales code, `demandMissed - stockoutLostDemand`
   is demand excluded by remaining shared sales capacity. Keep it distinct
   from stockouts and from reductions already applied by price/policy/share.
   Join the native product/city market reports to inspect player share.
7. For boutique and electronics, inspect actual primary-chain building counts,
   build dates, output, imported inputs, rail flow, and planner no-op details
   before attributing late local delivery to cost or throughput. Their primary
   chains were not among the retained corrected-pilot chain summaries.
8. Restore the exact application/test preimages even on failure, verify the
   frozen archives and helper hashes, and run the restored focused guards.
   Keep only the diagnosis and documentation; no commit or push is authorized.

Use fresh exclusive-write outputs under
`docs/balance/generated/hpa-721-joint-recovery-diagnostic-*`. Do not edit or
overwrite the old measurement recipe, frozen evaluation, or previous captures.
No idle, scenario, Gate A, or official matrix is rerun at this diagnostic stage;
their old results remain historical evidence, not fresh certifications.

## How This Leads To A Joint Candidate

The diagnostic must produce one approval packet, not an automatic parameter
search. It must identify exact before/after values and their measured basis for:

- Grocery product mix, loss exposure, and paid working capital, with both seeds
  reconciled; no extra free stock or cash.
- An affordable upgrade path alongside expansion and production spending,
  preserving cash-only bot upgrades and real finance rules.
- Boutique-down midgame contribution/equity and timely primary local delivery,
  without making the other archetypes artificially rich.
- Shared ladder thresholds only if viable economics still pre-earn Tier 5;
  acceptance targets and metric meanings remain unchanged.

Use existing `products.ts`, `archetypes.ts`, `worldCatalog.ts`, `state.ts`,
`leveling.ts`, and, only when justified by actual chain evidence, `industry.ts`.
No field in those files is authorized to change by this proposal. Preserve the
founding 1.2/2.0 bands and boutique 2.4 floor, forecast contract, milestone revenue
exclusions, FIFO/spoilage, rail/overflow, and explicit saved selling prices.
No schema, dependency, UI, new city/chain, or bespoke archetype engine rule.

The next numeric packet must list affected callers, fixtures, scenario price
offsets/reference commands, narrow RED/GREEN tests, source/recipe hashes, and
restoration instructions. Obtain approval before its bounded scenario,
cash/local-sales, and two-seed progression pilot. No automatic value changes
after seeing results.

Existing final gates remain: Tier 3 at least 40/50 with median day 90-150 per
archetype; Tier 5 at least 25/50; per-archetype paired T4-to-T5 median gap at least
30 days; peak-median ratio at most 3; zero idle earned/claimed tiers; full Gate A,
scenario, cash/payback, and engineering/platform checks on a settled source.
The two-seed screen cannot certify official reach rates.

## Provenance And Current Verification

The lead-authored local analysis
`docs/balance/generated/hpa-721-joint-recovery-constraints.py` reads frozen JSON
only. Its assert-based checks verify the old input hashes, all tracked
application/test hashes, archive/helper integrity, trace/summary agreement,
stock conservation, and the four exact cash bridges. It does not run the game
or reevaluate acceptance.

Frozen output:
`docs/balance/generated/hpa-721-joint-recovery-constraints.json`.
Analysis script SHA-256:
`ee0398a065ce42469ef15b20d1aecf05aad6ab28020266f392ccdafcfa77d238`.
The rejected evaluation remains
`f45ab741164701e036e66b9bb354f4246e67bf33c173ce13a60512351732418a`.
The ignored archive is local-only and must accompany reproduction; use fresh
output names. Render or document these captured derivations without rerunning
their source simulations.

The proposal-stage analysis above remains frozen. The subsequent approved
diagnostic runs fourteen trajectories with exact old-field equality and restores
all source/test preimages. Fresh restored checks pass 504 guards plus 19 observers.
Its complete findings and cleanup-incident record are in `docs/balance/economy-pass.md`,
under "Joint Recovery Diagnostic"; frozen evidence uses the
`hpa-721-joint-recovery-diagnostic-*` prefix.

No new tuning, official matrix, full-unit/build/E2E/platform suite, existing-save
certification, commit, or push is performed. Existing-save economics remain uncertified.
