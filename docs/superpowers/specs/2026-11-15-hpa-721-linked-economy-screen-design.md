# HPA-721 Linked Economy Basis Screen

**Status:** Approved for the temporary screen. The human selected
**Approve Temporary Screen** for this exact design. No gameplay change is active.
The subsequent human "Ship with changes" review amends measurement/preflight and
opening-finance controls below, without changing gameplay values. Approval does
not authorize adoption, another official matrix, a commit or a push.

## Intent and Approaches

Make expansion and productive local supply worthwhile without buying a pass by
raising starting cash, relaxing financing, changing the bot or weakening the
ladder. Three isolated screens failed. Another stock-only or upgrade-cost-only
trial would leave known coupled constraints unresolved.

The user selected **linked price/cost rebasing** over keeping the earlier retail
price bounds. Paired changes preserve founding gross profit per sold unit while
restoring room for local production to compete with direct imports. The cost is
more inventory working capital and changed values of the same free opening lots.
Only L1 gross per sold unit is invariant. At higher levels the existing
absolute-price-based revenue multiplier changes dollar margins; measure this
effect rather than claiming all-level invariance.
Keeping the old bounds would instead require more aggressive production-side
cost/yield changes; that was not the selected approach.

The proposed joint basis screen couples this basis to the observed operating
deficits, weekly ordering gaps and construction cash needs. It does not redesign
the economic engine. Global capacity/share changes, non-milestone revenue bonus
changes, premium-product changes and nearly free industrial operating costs are
deliberately excluded.

This is not a claim that the bundle solves all four archetypes or the final
Tier-4-to-5 spacing problem. Those remain subject to the original acceptance plan.

## Exact Proposed Bundle

### Prices and Manufacturing

| Product / Field              | Current | Candidate | Preserved         |
| ---------------------------- | ------: | --------: | ----------------- |
| bottled-water import / shelf |   1 / 6 |     3 / 8 | L1 gross 5/unit   |
| snacks import / shelf        |   2 / 8 |   12 / 18 | L1 gross 6/unit   |
| produce import / shelf       |   1 / 6 |    6 / 11 | L1 gross 5/unit   |
| pantry import / shelf        | 1.5 / 9 |  8.5 / 16 | L1 gross 7.5/unit |

These four founding products cover the two chains the unchanged bot actually
plans for convenience/grocery. The industrial finished-snacks quote is 12:
omitting snacks would leave the convenience secondary/reveal chain outside the
rebase. This deliberately extends the earlier three-product arithmetic preview.

All other product prices, demand weights, recipes, material import/local values,
throughput and industrial building costs stay unchanged. In particular, the retail pantry
import cost is 8.5; the industrial material import cost remains 8. This is not a
claim that two different purchasing channels must have identical quotes.

The current completed-pantry recipe estimate is 2.6875/unit before fixed costs.
All 40/day of grain/flour/pantry fixed costs remain. The linked-price basis
corrects the inverted retail/recipe scale, but does not establish capital
payback. Do not choose a pantry/snack yield multiplier from that arithmetic
alone: first capture actual completed-chain cash, imported inputs, type counts,
construction timing and route throughput. Recipe changes need a subsequent
measured design and approval. No global 10-unit rail-throughput ceiling is assumed.

Soft-drinks and essentials also have retail quotes below their industrial
material quotes; they are later unlocks, not these first two planned chains.
Their local economics are not certified by this bounded screen. Do not expand
their prices or claim that every optional production chain is solved.

### Paid Stock and Shared Demand

Use the shared `buildStore` initializer so live openings and projections agree.
For nonfounding stores only:

| Product       | Reorder Threshold | Target | Free Opening Quantity |
| ------------- | ----------------: | -----: | --------------------: |
| bottled-water |               700 |    700 |         84, unchanged |
| pantry        |             1,000 |  1,000 |        154, unchanged |
| produce       |               180 |    180 |        140, unchanged |

Founding defaults stay unchanged. Produce's target stays at its existing 180:
the change is weekly reorder protection, not a larger perishable stock lot.
Snacks and all other products retain their defaults. Existing regional-manager
behavior is not changed.

These quantities are sized from frozen entrant-level paid stock cycles, not
blindly copied from the rejected screen. The largest observed seven-day
`unitsSold + stockoutLostDemand` load is 571 water and 931 pantry. A 700 water
target has more than one extra day's cover; 1,000 pantry covers its measured
peak with 69 units left. Do not spend another 850 merely to give pantry a full
extra day. First paid deliveries arrived after day-7 sales in all four captures,
so these loads start at day 8; the unchanged free lots still leave initial
stockouts. These are historical sizing inputs, not candidate affordability or
availability guarantees.

Set Harbor City's existing `retailDemandProfile.snacks` from its implicit 1 to
1.4. Leave every other city/product profile unchanged, especially pantry and
produce. This is one shared city pool, not extra demand minted per store.

The failed convenience case serves all available demand but loses 2,997 of
marginal operating cash in days 61-90. Additional inventory alone cannot close
that gap. Snack demand tests unused two-store capacity without increasing water
priority or changing premium/electronics demand families.

Do not increase pantry demand: in the frozen windows the single grocery store
sells zero produce, and one two-store case also sells zero. Further increasing
the alphabetically earlier pantry product would worsen this allocation issue.
The earlier analytical pantry-1.4 preview is not this candidate.

### Capital and Fixed Costs

In `getExpansionSetupCost`, change only the tile-rent coefficient from 2.5 to 1:

```text
round(9000 + tile.rent * 1 + archetype.baseRent * 18
      + clampedDemandScore * 24 + existingTerrainPremium)
```

Keep the base, demand and terrain terms unchanged. This exchanges some upfront
setup cash for the larger paid inventory requirement; it is not higher starting
cash, a loan subsidy or a free store. Setup costs are fully capitalized. Lower
construction cost changes liquidity, not new-game wealth at the instant of
purchase.

Change grocery `baseRent` from 165 to 120. Under the existing balanced occupancy
and awareness cost basis, the rounded daily nonpayroll cost falls from 232 to 190. The marginal 42/day reduction addresses the measured 37.7/day operating
deficit; stock availability and capital recovery must supply the remaining case
for investment. Payroll requirements, salaries and all other archetype rents
stay unchanged.

The shared setup change intentionally affects boutique and electronics too.
They are comparison cohorts, not unchanged control rows. Report their actual
progression and peak-value shifts; do not reuse the old stock screen's claim
that premium/electronics results must be identical.

At the four frozen historical sites, the exact proposed setup quotes are:

| Archetype / Seed       | Current Setup | Candidate Setup | Cash Released |
| ---------------------- | ------------: | --------------: | ------------: |
| convenience / 20260503 |        22,691 |          19,143 |         3,548 |
| convenience / 20260515 |        22,240 |          18,905 |         3,335 |
| grocery / 20260503     |        23,591 |          19,233 |         4,358 |
| grocery / 20260515     |        23,140 |          18,995 |         4,145 |

These are fixed-site quotes, not predictions of candidate placements. The
convenience release exceeds its 2,000 increase in empty target-fill cost versus
the old trial. Grocery's 7,900 increase still exceeds setup relief by
3,542-3,755, before sales, gifts or credit. Do not claim the setup change alone
funds grocery working capital. Real legal funding and paid orders must settle
that question.

## Analytical Evidence and Cash Boundaries

The earlier three-product preview preserves every field in its 40 price-only
rows. The current four-product/snack-demand preview also checks 40 rows, with
an explicit analytical grocery-rent cost overlay. Convenience's founding ratio
stays 1.32134-1.62483; grocery becomes 1.59437-1.97797, inside the unchanged
1.2-2.0 sizing guard. Boutique/electronics founding rows remain exactly identical
to the frozen input. This is canonical founding arithmetic, not runtime cash,
forecast or progression evidence.

The same free quantities have different import values: convenience 224 to 1,092,
grocery 371 to 2,149. Debit the candidate's actual opening gift in cash payback
comparisons. Do not call its value unchanged or confuse it with earned income.

An empty candidate L1 target fill costs 3,180 for convenience and 9,580 for
grocery, versus the prior trial's 1,180/1,680. The intermediate four-SKU 4,080
convenience estimate used a 1,000 water target; sizing it to 700 releases 900.
These exclude setup, payroll,
interest and access. The bot's 2,000 reserve does not guarantee that orders are
funded. Real loans, unpaid orders, arrears, inventory and operating cash must be
captured; affordability remains an experimental question.

Evidence is frozen under `docs/balance/generated/`:

- `hpa-721-coupled-market-observations.json` and `...-summary.json`:
  eight explanatory windows, all matching the delivered cash tuples.
- `hpa-721-coupled-pantry-feasibility.json`: current-source prospective costs,
  explicitly not the cause in the run that never completes pantry-works.
- `hpa-721-linked-price-founding-preview.json`: exact price-only 40-row invariance,
  opening quantities and paid budgets, with source/script hashes.
- `hpa-721-linked-joint-founding-preview.json`: an exploratory snacks/pantry-1.4
  calculation; pantry-1.4 is explicitly excluded from this proposal.
- `hpa-721-linked-screen-design-preview.json`: the current four-product price
  basis, snack-demand profile and analytical rent overlay; its intermediate
  1,000-water stock budget is superseded.
- `hpa-721-linked-screen-stock-sizing.json`: all entrant rolling seven-day
  demand windows and exact historical-site setup quotes, from frozen inputs.
- `hpa-721-linked-screen-sized-design.json`: current 700-water/1,000-pantry
  budget, with founding rows copied unchanged from the checked preview.

## Verification and Measurement Contract

The lead authors and judges all balance measurements, cash reconciliation and
calibration pins. Implementation and execution may be delegated; selecting
different parameters, controls or pass thresholds may not.

1. Add focused failing assertions for nonfounding paid-stock defaults, unchanged
   founding/opening quantities and paid weekly imports. Reuse the existing
   state/placement/retail-supply suites. Preserve
   deterministic ordering, FIFO, spoilage, rail and overflow assertions.
2. Run the existing founding economics and relevant forecast/planner/book-value
   guards with the candidate. Do not repin the 1.2/2.0 bounds or boutique's 2.4
   floor. Verify actual costs against the analytical rent calculation.
   First inventory all candidate failures at RED. Lead reviews catalog-derived
   arithmetic and synthetic budget pins, including stock, retail-supply and
   book-value fixtures; every changed test enters the reversible patch.
   Semantic failures stop the screen rather than becoming new expectations.
3. Preserve scenario intent with paired authored price offsets, not new medal
   thresholds: first-profit water start 3->5/reference 6->8; local-lifeline
   water start 6->8/reference 4->6; fresh-market produce start 6->11;
   rival-next-door produce start 6->11/reference 7->12. No other scenario
   policy, stock, money, rule or command sequence changes are proposed.
   Price-policy/demand ratios are not algebraically identical after rebasing,
   so rerun matched reference/no-action plays. Preserve reference gold and
   existing no-action separation. Numeric result pins require lead review of
   fresh raw evidence; do not automatically soften medals, goals or day limits.
   Reuse the existing c7 replay logic for all 14 reference/no-action rows at HEAD
   and candidate, under new exclusive-write paths. Include two-city-supply-run:
   its water/snack catalog prices change despite having no authored offset.
4. Run the unchanged progression bot for all four archetypes on seeds 20260503
   and 20260515 for 365 days, with its idle controls. Compare with the captured
   current-HEAD rows. Compute report, claim traces and chain evidence in the same
   process using existing helpers. Persist summaries and necessary pre-investment
   states/commands, not full terminal runs or serialized planner Sets.
5. Measure convenience/grocery x seeds 20260503/20260515: exactly four
   first-expansion opportunities, each opening in Harbor on simulation day 1.
   Fork no-opening/opening cases before investment-specific financing, in the
   SAME candidate environment. If a candidate run does not offer its first
   opening on day 1, report the missing case as blocked; do not substitute a
   later day or another seed. Any already-paid common primary producer is sunk
   in both branches; this is incremental store payback, not chain payback.
   Validate captured city-selection replay, then fork AFTER that selection/claims
   and BEFORE opening financing, as in the archive. Replay the opening branch's
   exact captured borrow/open prefix, not a replacement cost+2,000 calculation:
   the bot protects next loan installments for opening. A captured selection
   no-op is valid. No-opening receives none of that financing.
   Include setup, hiring, paid stock, payroll, operating costs, interest,
   arrears, inventories and principal. Use `cash - principal`, debit the actual
   new opening gift, and retain the corrected pre-snapshot financing
   reconciliation. Record after reports 90 and 365 from one trajectory
   (game days 91 and 366), and reports 61-90 for mature operating contribution.
   These are absolute simulation days, not a moving elapsed window. Do not
   rerun the old conditional Campus cases or imply full new-city payback.
6. Separately test entry-level primary local supply for two predetermined
   reference cases: convenience/bottled-water/20260503 and
   grocery/produce/20260503. Start each from a legal two-store day-1 fixture:
   replay the candidate's day-1 common retail setup, policy, delegation,
   level/opening and hiring commands, excluding industry and source borrowing.
   This reordered fixture is a controlled player choice, not an on-policy
   snapshot. Clone it into continue-importing and add-primary-chain branches.
   Replay the candidate's primary construction/rail commands on their captured
   days through its first fully flowing entry chain: raw local input reaches
   the processor and finished product reaches retail. Include the raw producer,
   warehouse, processor and all connecting rails/access; no terminal-factory-only
   comparison. If that entry sequence is not observed before secondary-chain
   construction, report blocked rather than inventing a layout. No later chain
   expansion is replayed. Both branches retain their two stores through day 365.
   Common retail opening gifts cancel in this pair. No secondary pantry/snack
   treatment and no four-arm interaction claim are included.
7. After component setup, run normal `simulateDay` only, including its existing
   replenishment, regional management, events, payroll, spoilage and scheduled
   debt service. Do not run later progression-bot commands, extra hiring,
   upgrades, openings, manual decisions, discretionary repayment or rescue
   borrowing. The local treatment alone may execute its listed construction
   schedule. Only subsequent startup staffing and local construction use the
   live-cost + 2,000 rule, not the captured opening prefix. Hiring currently has
   zero upfront fee; its reserve is working capital, not an invented hiring
   charge. Borrow only a positive shortfall, rounded
   up to a multiple of 1,000, on the existing 84-day term. Require the engine's
   assessment to cover that request and the real command to succeed; otherwise
   report infeasible. Do not cap/substitute the loan or inject cash. This
   treatment funding rule copies the existing bot's minimum/term; it does not
   change the official bot, loan limits or rates.
   Copy the validated store summarize/windows accounting unchanged. For local
   mid-window construction, additionally reconcile actual nonfinancing command
   cash deltas: those capital outflows are outside daily report net cash changes.
   Borrow flows already appear in reports and must not be added twice.
8. Reuse `chainEvidence.ts` for convenience/bottled-water and snacks, and
   grocery/produce and pantry, on both pilot seeds. Inspect actual retail-local deliveries,
   sales, waste, per-instance type counts, fixed/recipe costs, imported inputs,
   route flows and construction dates. A delivery or `localValue` is not cash
   saved; a replacement-import-value proxy is not the matched cash comparison.
   Do not describe manufacturing unsold/spoiled goods as productive supply.
   Secondary-chain evidence is diagnostic, not a cash-payback pass for pantry
   or snacks individually or together. Do not allocate shared prerequisites
   to make either appear profitable. Their actual cash viability remains
   required before a full candidate can be adopted.
9. Run bounded Gate A diagnostics with the existing CLI and bot set. Partial
   coverage is never an official PASS. Run affected scenario guards and narrow
   unit suites; no full check/lint/unit/E2E/platform pass or official matrix yet.

Use a new `hpa-721-linked-screen-*` artifact prefix. Record HEAD, exact patch and
modified-file hashes, source-dirty status, commands and exit codes. The HEAD
alone cannot identify an uncommitted candidate. Preserve failed outputs too.

### Change Reach

Gameplay scope is the four price pairs in `products.ts`, grocery rent in
`archetypes.ts`, Harbor's snack profile in `worldCatalog.ts`, and the shared store
constructor/setup quote in `state.ts`. Review every constructor/quote caller,
including placement forecasts, planner quotes and book-value recomputation.
Scenario scope is the four authored prices in `scenarios/catalog.ts`, their
reference commands and affected numeric assertions in `runtime.spec.ts`.
Focused state, placement, stock/supply, product, planner, book-value and scenario
suites cover these effects. There is no UI, package, build/config or dependency
change. The only new exported measurement surface is the optional probe context
below; ordinary application exports and persisted types stay unchanged.

### Command Capture

Use the existing claim probe, with one measurement-only, lead-authored extension:
an optional fourth argument of type
`Readonly<{ beforeCommand: GameState; command: ScenarioCommand }>`.
`runProgressionCommand` supplies it to the following claim evaluation; evaluations
not attached to a command receive `undefined`. Existing three-argument probes,
the synchronous/void guard, bot policy and metric definitions stay unchanged.
Capture command objects rather than reconstructing rail paths from state diffs.

Extend the existing trace noninterference test rather than adding another digest
comparison. Before gameplay changes, write and exercise the complete two-mode
capture/components recipe against HEAD application source with this observer:
all eight progression rows equal the frozen selected rows; all four preFinance
states equal archived first-expansion states; all four no-opening90/365 summaries
equal the reconciled archive. Assert serialized fork round-trip equality.
Use identity assertions for replayed building IDs/type/city/tile; block mismatch,
not a remapping layer. These dry-run results are validation, not tuning evidence.

Reuse native calibration/pacing/idle/diff functions. The full baseline's200-run
idle aggregates cannot be filtered to8; validate selected progression rows against
the frozen source, then use the actual validated HEAD8+8 report as the matched
candidate baseline. Freeze recipe/helper hashes before the candidate; no repairs
after seeing candidate numbers. Keep measurement-only code separate from the
temporary gameplay patch. Do not overwrite historical reports or run a full
determinism sweep.

## Decision and Restoration

For this component screen, require positive days 61-90 marginal operating cash
and positive day-365 financing-neutral, gift-debited expansion cash versus
no opening in all four day-one opportunities. Report 90-day payback, but do not
invent a 90-day payback gate. The two primary local cases must show positive
day-365 cash benefit after all incremental investment costs, with actual
productive sales/waste disclosed. They do not certify the second pilot seed
or secondary chains. Secondary cash viability remains an unresolved full-candidate
gate even if this basis screen is positive;
unfinished or cash-negative chains remain failures/blocked, not waived passes.

Even a positive component result is insufficient if progression has no credible
path to the approved Tier-3/Tier-5 goals. Report the remaining seed-level
blockers. Do not launch the complete official matrix or claim adoption from this
screen. Boutique balance, electronics progression and paired T4->T5 spacing
remain explicit obligations.

Restore all candidate gameplay, fixtures and candidate-specific tests after the bounded screen,
using only saved candidate patches; verify exact pre-screen hashes and the
restored focused guards. Retain the evidence and append the verdict to the
economy report/tuning log. The validated measurement-only probe extension and
its tests may remain, with their hashes explicitly identified; do not claim the
whole `tests/` tree is pristine if they remain. Do not overwrite historical
baseline reports.

## Compatibility and Non-Goals

No new schema, saved fields, migration, claim algorithm, bot policy, goal metric,
ladder threshold, starting cash/debt, loan rule, rail rule or city reveal rule.
No live player app, save-file writes or deployment during this temporary screen.

Certification here is for newly initialized sandbox/scenario runs. Existing
saved selling-price overrides are intentionally not rewritten: higher catalog
import costs can squeeze those older prices. Existing store/inventory book
values can also revalue because the catalog is live. This screen does not claim
legacy-save economic equivalence. Surface that limitation before any eventual
adoption; broader save repricing/migration needs separate approval.
In particular, the lower setup formula revalues existing nonfounding retail
assets downward without a cash refund.

No numeric medal/scoring-policy changes are approved. If the proposed scenario
offsets cannot preserve their teaching/guardrail shape, stop and return the
evidence rather than expanding scope silently.
