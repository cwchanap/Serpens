# HPA-721 Expansion Working-Stock Screen

**Status: COMPLETE, REJECTED AND RESTORED. No screen gameplay is retained.**
The user selected "Approve bounded screen" after reviewing the exact defaults,
unchanged founding/opening inventory, and matched cash/payback boundary.
The result and six matched cash cases are recorded in `docs/balance/economy-pass.md`.
The restored source matches all pre-trial hashes and passes 279 focused tests.
This extends Step 2 of the existing HPA-721 design, not its acceptance targets.
Source baseline: `3250caea0cc70eda4d592ad4406fe8fdf5c75cb1`.
The rejected 6,000 upgrade-cost setting stays restored to 8,000.

## Intent And Approaches

Make an additional convenience/grocery store earn operating cash and recover its
paid setup, payroll, imports and financing costs. First prove the entrant can
support itself; only then combine retained economics with local-chain and ladder
tuning. This screen cannot establish final progression acceptance by itself.

The implementation choice here is mine, not a previously approved user value:

- **Global stock increase plus premium-margin compression:** rejected as the next
  screen. Earlier global target arms enriched boutique/electronics much more,
  failed electronics income headroom, and broke scenario contracts.
- **City-demand bonus with existing defaults:** insufficient on its own. Existing
  measured demand already exceeds the weekly shelf target; more empty-shelf
  demand cannot be sold.
- **Expansion-only staple targets:** recommended. Correct the paid working-stock
  gap for the two low-margin entrants without giving more free opening goods,
  changing the founding tutorial, increasing perishable grocery orders, or
  directly enriching the premium controls.

This is a narrow new per-format/per-product default, not another global scalar
or the previously rejected archetype-wide initial-stock multiplier. The older
stock-default report explicitly leaves this axis untested and requiring approval.

## Exact Proposed Intervention

Apply only when constructing a nonfounding store:

| Product | Existing reorder / target | Proposed reorder / target | Free initial lot |
| --- | --- | --- | --- |
| bottled-water | 30 / 108 | 1,000 / 1,000 | 84, unchanged |
| pantry | 55 / 198 | 1,000 / 1,000 | 154, unchanged |

All other products retain their existing defaults, including snacks 25/90 and
produce 50/180. The founding store retains every existing default. Prices, brands,
product weights and perishability stay unchanged.

The targets size approximately a week of the previously observed L1 sellable
volume, not all possible demand at every level. Reorder equals target so the
existing weekly rule tops up consumed units rather than waiting an extra week
when a larger shelf remains above the old low threshold. Equality is already
legal in `updateStoreProduct`; no replenishment algorithm change is needed.

With empty shelves, baseline Common Ground costs are:

| Expansion | Entire L1 target fill | Free opening inventory value |
| --- | ---: | ---: |
| convenience | 1,000 water + 90 snacks = 1,180 | 224, unchanged |
| grocery | 180 produce + 1,000 pantry = 1,680 | 371, unchanged |

These are per-store catalog costs, **not** a company cash-runway guarantee. The
2,000 working-cash floor is company-wide; other stores, payroll, debt service and
industry still compete for it. Imports can draw cash negative under existing
rules. No new credit, cash subsidy or free stock is introduced.
Sizing inputs/assertions are frozen in ignored
`docs/balance/generated/hpa-721-staple-working-stock-sizing.json`.

## Smallest Implementation Boundary

Use `buildStore` in `src/lib/game/state.ts`, the shared constructor for live store
creation and `projectExpansionEntrant` in `placement.ts`. Its existing ID contract
identifies the founding store as `store-1`; live expansion and its forecast both
use `store-${game.stores.length + 1}`. Apply the two stock defaults to products of
nonfounding stores there, without changing any exported signature.

Keep `createStoreProduct`, `initializeStoreProducts`, RNG draw order, actual
opening lots and product-unlock creation unchanged. Water and pantry are already
L1 products, so later milestone initialization needs no new branch. Existing saved
stores are not rewritten. No new persisted field, schema, type option, policy
engine, manager behavior, cadence, city profile or forecast math is introduced.

This shared boundary matters: changing only the live opening path would leave the
opening estimator using the old shelf targets and risk the forecast gate.

## Bounded Evidence Recipe

All gameplay edits are temporary. Preserve a source patch, test patch, source
manifests, raw logs and exit codes; restore the initial source at the end.
Do not repin any test or scenario to admit the screen.

1. **RED/GREEN behavior:** assert the new water/pantry settings on real expansion
   stores, unchanged opening lots and setup charge, unchanged founding settings,
   and unchanged other products. Assert projected/live entrant inventory matches
   and projection does not mutate the game/RNG. Under an empty warehouse and no
   import modifiers, actual weekly replenishment must report paid import spend
   1,180/1,680 for empty L1 shelves, not grant these units free. The existing
   stock, retail-supply, state, placement, book-value, economics and scenario
   suites remain guards.
2. **Frozen-bot screen:** seeds 20260503/20260515, all four archetypes, 365 days;
   eight progression and eight idle runs. Reuse `progressionRun.ts` and the
   frozen current-source rows. Boutique/electronics summaries must remain
   identical to their baseline rows; idle earned/claimed must stay zero.
3. **Matched entrant economics:** capture fresh current-source states immediately
   before the first expansion's financing in those convenience/grocery runs.
   The existing `ProgressionClaimProbe` observes every applied command: retain
   the preceding post-claim states and use the final action ledger to identify
   the expansion's `selectWorldCity`, borrowing and `openStore` boundary.
   Assert replayed opening commands reproduce the captured pre-claim game;
   do not substitute a guessed day-start state. No bot hook/change is needed.
   The founding path is unchanged up to that opening. Reuse legal opening and
   incremental staffing, with opening-specific borrowing in the open branch
   only; no free cash, shared purchase loan, or absent entrant payroll.
   Compare open/no-open from the identical state, with no later manual actions.
   Report the 90-day diagnostic and the cash window whose last simulated report
   is day 365 separately; never count a longer diagnostic as first-year payback.
   Progression receipt reach independently requires `claimedOnDay <= 365`.
   Apply the same method to the candidate's first new-city opening if it occurs.
4. **Cash verdict:** report incremental operating cash flow, setup, payroll,
   imports, interest, principal and arrears separately. The funding-neutral
   liquidity comparison is delta cash minus delta outstanding principal.
   Report terminal inventory and paid factory instances separately; do not add
   inventory/book value to cash recovery. Also show the conservative result after
   debiting the unchanged opening gift at import cost.
5. **Guardrails:** run the two-seed 18-row Gate A diagnostic and existing scenario
   reference/no-action guards. Reuse `chainEvidence.ts` for actual local delivery,
   imports and all building instances if the candidate improves the cash screen.
   More local units or more plants do not establish positive local-chain benefit.

Reject the screen if guardrails fail, controls change, idle earns, losses move
into debt/arrears or terminal inventory, or expansion does not improve its
financing-neutral cash contribution. No official sweep follows merely because
reach or book value rises.

Only a candidate with positive measured operating contribution and within-year
cash recovery on the actual affected expansion paths can advance as an expansion
component. A late fixed-state diagnostic that cannot recover setup by day 365
must be labelled a failed first-year case, even if a longer window is positive.

## What Remains Open

Boutique timing/spacing, electronics upgrade liquidity and local-chain payback
remain separate measured problems. This screen deliberately leaves premium
controls unchanged and therefore cannot clear the whole progression gate.
After a positive expansion component, author a justified joint candidate before
another pilot; do not silently append salary, price, rail or threshold changes.
No full 50-seed matrix, acceptance exception, PR-readiness claim or platform smoke
is authorized by this bounded screen.
