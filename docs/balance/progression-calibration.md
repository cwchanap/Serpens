# Progression calibration (HPA-318 Step 4)

Measured reachability of the five-tier sandbox ladder, produced by the opt-in
`progression` balance-harness bot (HPA-318 Step 4) before any UI, translation,
persistence-fixture or E2E work. This is the **blocking calibration gate**
from the design's "Crucial calibration finding": every numeric goal below is
**frozen as measured** and later steps (UI copy, save fixtures, E2E) must
match these values.

- Design: `docs/superpowers/specs/2026-10-28-sandbox-long-game-design.md` §2
  and acceptance item 4.
- Implementation under test: `src/lib/game/progression.ts` (steps 1–3) at
  commit `8a79c323`, plus the Step-4 revision documented below.
- Harness: `tests/balance/bots.ts` (`runProgressionBot`),
  `tests/balance/progressionCalibration.ts` (aggregation),
  `tests/balance/progressionRun.ts` (CLI).
- Regenerate both artifacts (git-ignored, deterministic, byte-identical):

```bash
bun run tests/balance/progressionRun.ts --seeds 20260501,...,20260550 --days 365
bun run tests/balance/progressionRun.ts --seeds 20260503 --days 365 \
  --archetypes convenience --trace docs/balance/generated/progression-reference-20260503.json
```

## 1. Bot policy (as run)

The `progression` bot is the fourth `BotId` in `tests/balance/bots.ts`; the
three HPA-502 bots (`idle`, `retail-steady`, `advisor`) are byte-identical to
their HPA-502 state. It uses only legal `applyGameCommand` operations plus the
real `setManagerDelegation` transition (same as every harness bot), and calls
the production `claimEarnedTiers(transition.game)` after **every** successfully
applied command **including `advanceDay`** — never reproducing claim rules.
Specs prove this via the production fixed-point property
(`claimEarnedTiers(finalGame) === finalGame`).

Daily (every day, in order):

1. **Delegation (once)**: identical to `retail-steady` — first manager by id,
   `protect-availability`, city scope, inventory authority; followed by
   `claimEarnedTiers` on the changed state.
2. **Staffing**: identical to `retail-steady` — hire (first candidate by id,
   roles manager → general) and assign until every store's shortage is zero,
   through the claim-wrapping command path.
3. **Weekly planner** (days where `(day − 1) % 7 === 0`, day 1 included), each
   step re-reading the post-previous-step state:
   1. `selectWorldCity('industry-city')` — supply planning always targets the
      starter industry city.
   2. **Working-capital floor**: while `cash < $2,000`, `borrow` the exact
      whole-dollar shortfall (rounded up to the $1,000 working-capital
      minimum, 84-day term) up to the engine's own `assessCredit` limit.
      Without this the measured runs sit at negative cash for months and even
      an $80 rail stays blocked (`railRequiresCash`).
   3. **Supply chains**: `buildSupplyPlan` per product, executing one
      recommendation per planner day (`build-producer` / `build-warehouse` /
      `upgrade-building` / `connect-rail` via the engine's own rail preview;
      route suggestions recorded `unsupported`, exactly like the advisor).
      Products: the archetype's first two industry-linked stocked products —
      convenience `[bottled-water, snacks]`, grocery `[produce, pantry]`,
      boutique `[gifts]`, electronics `[]`. The primary chain plans from week
      1; secondary chains start at week 13 or when the primary plan can no
      longer reduce a shortage (`surplus` / `no-demand` / `ineffective`),
      keeping the measured first-quarter trough shallow. Convenience's
      secondary chain (snacks) and boutique's only chain (gifts) are also the
      legal reveal paths for quarry-works (their materials are in the
      `reveal-quarry-works` finished set).
   4. **City opening**: the revealed-but-unopened city with the lowest
      `openingCost` (tie: lexicographic id), cash-first with the debt-service
      reserve (below), borrowing only to close the gap to
      `openingCost + reserve`. One per planner day. Reveal eligibility is
      never forced — reveals are earned by the bot's own builds/stores/
      reports.
   5. **Store upgrade**: lowest-id store below level 4, cost
      `getStoreUpgradeCost(level)`, cash-only and reserve-gated, one per
      planner day. (One level-4 ladder satisfies both the tier-2 and tier-4
      level goals; concentrating on the lowest id minimizes cash at risk.)
   6. **Expansion**: while `stores.length < storeCap`, best legal tile across
      **all opened retail cities** by `demand + footTraffic` (tie: lowest city
      id, then lowest tile id), `selectWorldCity` to the target city, then
      `openStore`, funded cash-first with borrowing to close the gap to
      `setupCost + reserve`. One per planner day.
   7. **Repayment**: smallest outstanding principal (tie: lowest loan id);
      `payOffLoan` when `cash > payoff + reserve`, one per planner day.
4. **Reserve**: `max($0, sum of every outstanding loan's next installment)`
   (≈ next 7 days of scheduled debt service). The originally proposed
   `$20,000` floor was recalibrated away during measurement: founding cash
   ($24k–$38k) minus a $9k–$30k store setup can never clear it, which starved
   all growth (measured: 1 store all year, zero claims).

**Deterministic tie-breaks**: tiles by max `demand + footTraffic` then lowest
id; stores/staff/candidates/loans by lowest id; cities by lowest
`openingCost` then lexicographic id; products in archetype catalog order. No
RNG outside the engine's seeded draws. Every command outcome (including
rejections and deferrals) is recorded in the ledger.

**Post-review harness correction:** `bestExpansionCandidate` originally kept
the first equal-score tile in `city.tiles` array order instead of the lowest
tile id promised above. The §3–§9 figures are re-measured under the
implemented tie-break: idle controls, the seed-20260503 reference
trajectory, T2/T3 reach and every archetype split are unchanged; tier-1
reach moved 183 → 184 and a few tail distributions shifted slightly.

## 2. Seed definitions

- **Reference seed `20260503`** (the ticket seed): convenience archetype,
  365 days, full action log + claim/credit events committed as the
  acceptance trace summary in §4 and dumped to
  `docs/balance/generated/progression-reference-20260503.json`.
- **50-seed sweep**: the approved HPA-502 seed sequence `SWEEP_SEEDS`
  (`20260501`–`20260550`, `tests/balance/measure.ts`) × four archetypes
  (`convenience`, `boutique`, `electronics`, `grocery`) = **200 progression
  runs**, plus the **idle negative-control set**: the same 50 seeds × four
  archetypes through the untouched `idle` bot = **200 idle runs**.
- Quantile method: linear interpolation on the `(n − 1)` positional grid;
  claim-day quantiles are computed **among reached runs only**.

## 3. Per-tier completion distribution (200 progression runs, 365 days)

Actual runtime of the final sweep: **437.4 s** for all 400 runs
(progression + idle) on the dev machine; a single reference trace takes ~1 s.

| Tier | Reached | Rate | p10 | Median | p90 | Min | Max | Never claimed |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 Local Shop | 184/200 | 92% | day 30 | day 56.5 | day 240 | 30 | 360 | 16 (all convenience) |
| 2 Neighborhood Chain | 172/200 | 86% | day 50 | day 57 | day 267 | 50 | 358 | 28 (convenience 21, grocery 7) |
| 3 Regional Supplier | 72/200 | 36% | day 85 | day 232 | day 329 | 58 | 358 | 128 (boutique 50, electronics 50, convenience 21, grocery 7) |
| 4 Multi-City Operator | 0/200 | 0% | — | — | — | — | — | 200 (see §6) |
| 5 Market Leader | 0/200 | 0% | — | — | — | — | — | 200 (see §6) |

Seed-level outliers (claim day strictly above the tier's p90) are listed in
`docs/balance/generated/progression-calibration.json` (`tiers[].outliers`);
the extreme late tail is convenience-only (e.g. seed 20260503 T1 at day 327,
20260506 at day 359) — boutique claims T1 in days 30–45, electronics in
47–82, grocery in 58–209.

Final-state aggregates over progression runs: book value min −$23,416 /
median $84,634 / max $1,132,586; store count min 2 / median 4 / max 8.

## 4. Reference trace summary — seed `20260503`, convenience, 365 days

- Founding: tile `harbor-city-25-32`, cash $32,000 (founding store free;
  founding loan $8,000 ⇒ founding book value $24,000).
- Claims: `local-shop` day **327**, `neighborhood-chain` day **358**,
  `regional-supplier` day **358**. `multi-city-operator`/`market-leader`
  never (see §6).
- Final state: 3 stores (store-1 level 2), 4 opened cities
  (harbor-city, industry-city, breadbasket-basin, campus-junction), 5 of 6
  city milestones revealed, storeCap 8 (3 base + campus +1 + positive-income
  milestone +1 + 3 claims), cash −$23,825, book value $52,153, 336
  bottled-water local units delivered (≥25 goal met at 13.4×), full
  bottled-water chain (water-pump, water-bottler, warehouse) served by rails.
- Action log: 577 recorded actions over days 1–365 —
  106 `selectWorldCity`, 53 each of `openWorldCity`/`upgradeStore`/
  `openStore`/`payOffLoan` planner evaluations, 13 `borrow`, 137
  `defer-credit`, 88 planner `none` outcomes, 2 `build-producer`, 1
  `build-warehouse`, 2 `connect-rail`, 6 `hireStaff`, 6 `assignStaff`,
  1 `setManagerDelegation`, 3 `claimEarnedTiers`. Full log in
  `docs/balance/generated/progression-reference-20260503.json`.

## 5. Idle negative controls

- **200/200 idle runs finished with zero claims** (`progression.claims`
  empty and `claimEarnedTiers(game) === game`); the sweep CLI aborts on any
  violation, and a focused spec pins the property for the reference seed.
  The CLI's check is now the non-vacuous form: the idle bot never calls
  `claimEarnedTiers`, so `claims.length` is structurally zero — the abort
  instead measures `totalEarnedUnclaimed` (tiers the idle state earned but
  never claimed), which must also stay 0.
- Idle founding book value: min $24,224 / median $31,236 / max $37,180.
- Idle **peak** report book value: min $24,697 / median $36,319 /
  max $42,218 (idle cash strictly decays: final book value −$48,992 to
  −$124,106).
- **Tier-1 non-decorative check passes**: $70,000 target vs measured
  no-management peak maximum **$42,218** across all 200 idle runs — a
  $27,782 margin. Founding/no-management play can never auto-claim tier 1.

## 6. Blockers and upper-tier reachability (draft status retained)

- **Tier 3 (72/200).** Blockers among never-claimed runs:
  `regional-supplier-local-units` 100, `regional-supplier-opened-cities` 12,
  `regional-supplier-peak-book-value` 12.
  (The 60k peak goal was measured here but has since been removed from the
  catalog — see §7. It could never be the binding constraint: any run that
  claims tier 1 already holds a peak ≥ $70k.)
  - **Electronics (0/50): structural.** No electronics catalog product is
    industry-linked (`productionMaterialId` null), so no legal supply chain
    can ever deliver local units to its stores. No product-set or target
    revision can fix this; it is a content gap, not a tuning gap.
  - **Boutique (0/50): measured flow blocker.** The gifts chain builds fully
    (chemical-feedstock-well, pulpwood-grove, pulp-mill, plastic-plant,
    packaging-plant, gift-workshop, warehouse + rails), produces (70 gift
    units sitting in the workshop buffer at day 365), and stores sell
    30,995 gift units — but every unit is served by **imports**; the trickle
    of chain output never transfers into the warehouse/city inventory, so
    local deliveries stay 0. Flagged for engine follow-up (rail surplus-push
    vs slow trickle production); out of scope for this step, whose mandate
    forbids economy changes.
  - Convenience (29/50) and grocery (43/50) reach tier 3; their failures are
    the peak/city goals in weak seeds.
- **Tier 4 (0/200) and tier 5 (0/200) — draft status retained per design.**
  Two independent blockers:
  1. **Contiguous-prefix gate.** `claimEarnedTiers` claims only the
     contiguous prefix, so runs whose tier-4/tier-5 goals *pass* cannot claim
     them while tier-3 is unsatisfied. Measured: all 50 boutique runs finish
     with **8 stores**, and 45/50 hold every tier-4 and tier-5 goal metric at
     day 365 (all 6 cities opened, a level-4 store, peak book value
     $244,665–$1,223,497) — but the boutique tier-3 blocker (above) pins the
     ladder at tier 2.
  2. **Goal shortfalls in the remaining archetypes.** Convenience/grocery
     runs max out at 2–4 stores, ≤5 cities and store level 2–3 (convenience
     peaks ≤ $111,267; grocery peaks ≤ $166,003, two runs above the $150k
     tier-5 bar) (blocker counts: tier-4 store-count 115, opened-cities 126,
     max-store-level 154 of 200; tier-5 store-count 129, opened-cities 155,
     peak 112). The measured marginal economics are the cause: each extra
     store adds ≈ +$12–28/day against a $22.4k setup, and cumulative
     tier-4/5 spend (≈ $190k+) exceeds the ≈ $50k/year measured operating
     surplus.
- **Pacing hypotheses.** Tier-3 at ~day 120: **not supported** — p10 day 85,
  median day 232 (only fast grocery/convenience runs land near day ~85–120).
  Tier-5 in days 250–365: **not supported** — zero claimable runs. Per the
  gate, upper-tier pacing is *not* declared and UI must not present tier-4/5
  as reachable within the first year.
- **Credit impact of the tier reward (measured).** The +$25k/claim
  underwriting-base/hard-bound reward is wired in **Step 5**; `assessCredit`
  still uses the static $15,000/$100,000 terms, so no loan in this sweep
  could have "borrowed more" because of it. What the sweep measured under
  current terms: all 200 progression runs used credit
  (2,182 borrows, $22.14M total principal advanced, max single borrow
  $39,000, 988 `payOffLoan` closures totaling $4.02M repaid). Borrow count by
  claims held at borrow time: 854 at 0 claims, 346 at 1, 947 at 2, 35 at 3 —
  i.e. credit is used before and after claims, and the reference bot's
  borrowing is working-capital churn (the $2,000 floor) plus tier-critical
  gap-closing, never speculation. Step 5 must re-derive the counterfactual
  (static-limit vs claim-raised-limit) borrowing comparison.

## 7. Frozen goal table (authored numeric targets unchanged)

| # | Tier | Goals (metric ≥ target) | Frozen targets |
| --- | --- | --- | --- |
| 1 | Local Shop | stores ≥ 2; peak book value ≥ $70k | unchanged |
| 2 | Neighborhood Chain | stores ≥ 3; max store level ≥ 2; cities ≥ 3 | unchanged |
| 3 | Regional Supplier | cities ≥ 4; local units ≥ 25 | $60k peak goal **removed** (dead goal — could never block after tier 1's ≥ $70k prefix claim) |
| 4 | Multi-City Operator | stores ≥ 5; cities ≥ 5; max store level ≥ 4 | unchanged (draft-blocked) |
| 5 | Market Leader | stores ≥ 7; cities ≥ 6; peak book value ≥ $150k | unchanged (draft-blocked) |

**One revision — tier-3 product set.** The authored set
`[bottled-water, produce, pantry]` is widened in `progression.ts` to every
industry-linked product. The set is now **derived** from the catalog —
`Object.values(PRODUCTS).filter(p => p.productionMaterialId !== null)` —
rather than a hand-written list, so new industry-linked products extend the
goal automatically.

Corrected rationale (post-review re-measurement): the trio was never
convenience-only — grocery stocks `produce`/`pantry`, which always counted.
Re-running this exact sweep with the trio restored produces
**byte-identical** claims and final local units in all 200 runs (tier-3
72/200; convenience 29/50 and grocery 43/50; local-units ≥ 25 in all 100
convenience + grocery runs): the widening moved *no* measured outcome,
because the widened-only chains delivered 0 local units everywhere —
boutique's `gifts` stall at the workshop buffer (the §6 flow blocker) and
convenience's `snacks`/`soft-drinks`/`essentials` secondaries produce no
countable deliveries inside 365 days. The earlier draft's "raised measured
reach to 72/200 (grocery's produce/pantry chains qualify)" was wrong on both
counts; the 29 → 72 reach change seen during Step-4 calibration came from
mid-calibration bot revisions, not from the product set.

The widened set is kept for goal correctness, not reach: the bot builds
supply chains only for products its stores stock, so under the trio a
boutique run stocks no countable product at all and the goal is
unsatisfiable for it even if the §6 delivery blocker were fixed. The widened
set makes the goal attainable in principle for every archetype stocking at
least one industry-linked product (electronics still stocks none). Locale
copy updated to match (see below); all numeric targets and the
`store-count`/`level`/`city` goals are byte-identical to the pre-calibration
authored values, and `progression.spec.ts` pins the frozen numbers.

**Locale note.** The `progression.goals.*` strings across
`src/lib/i18n/messages/{en,ja,zh-Hant}.ts` now interpolate the evaluated
target via `{target}` (passed by `conditionViews` from the goal evidence) —
the numeric source is the goal catalog itself, so no locale string can drift
from a retuned target. The `regionalSupplierPeakBookValue` keys were removed
with the dead goal, and `progression.panel.reward` interpolates the shared
`PROGRESSION_TIER_REWARD` fields instead of hard-coding +1/+$25,000.

## 8. Verification

- `tests/balance/progressionBots.spec.ts`: claim fixed point after every
  applied command, reference-seed tier-1 claim ≤ day 365, seed determinism,
  legal-vocabulary-only traces, store-cap/opened-city legality, idle zero
  claims, quantile math.
- Existing HPA-502 suites (`bots.spec.ts`, `measure.spec.ts`, `run.spec.ts`)
  and the scenario pack are untouched and passing; `SWEEP_BOTS` and the
  Gate A 450-run official matrix are unchanged (`progression` is selected
  explicitly, never via `botsForArchetype`).
- Full gate: `bun run test:unit -- --run` and `bun run check` green at the
  calibration commit.

## 9. Step-5 credit counterfactual (wired claim-raised terms, measured)

Step 5 wired the tier reward into `finance.ts:assessCredit`:
`underwritingBase = 15_000 + PROGRESSION_TIER_REWARD.creditUnderwritingBaseBonus * claims.length`
and
`hardLimit = 100_000 + PROGRESSION_TIER_REWARD.creditGrossPrincipalHardBoundBonus * claims.length`
(both bonuses currently $25,000), health/history,
repayment-service, outstanding-principal, delinquency and payment-headroom
checks unchanged. This section re-measures the §4/§6 credit numbers under the
wired terms (carry-over acceptance item 4 from the Step-4 calibration). The
§3–§6 numbers above remain the committed **static-terms** record
(`15_000`/`100_000` at any claim count).

What was run (harness unchanged, `tests/balance/progressionRun.ts`):

- Reference seed `20260503`, convenience, 365 days, `--trace` — ~1 s per
  terms variant.
- Focused sample: seeds `20260501`–`20260510` × `convenience`, `grocery`
  (the two archetypes that reach tier 3) — 20 progression + 20 idle runs per
  terms variant, 58.6 s static / 65.8 s wired. Not a full 200-run re-sweep;
  actual seeds and runtime recorded here per the carry-over requirement.

Reference seed `20260503` (static vs wired):

| Metric | Static (§4) | Wired |
| --- | --- | --- |
| Claims | T1 day 327, T2 day 358, T3 day 358 | T1 day 327 (T2/T3 slip past day 365) |
| Borrows | 13 totaling $56,000, max $15,000 | 13 totaling $62,000, max $21,000 |
| Highest `grossPrincipalLimit` observed | $18,895 | $34,931 |
| Final cash / book value / storeCap | −$23,825 / $52,153 / 8 | −$16,370 / $62,101 / 7 |

**Direct claim-raised-limit evidence (same seed, same claim day):** tier 1 is
claimed on day 327 in both runs; on day 330 the wired bot borrows **$21,000
at `claimsAtBorrow: 1`** (`grossPrincipalLimit` $34,931, available credit
$27,419) — $6,000 more than any loan the static terms ever allowed in this
run (static max $15,000, limit ≤ $18,895). So yes: at least one real loan
borrowed more **because** a claim raised the underwriting base. The bot still
only ever borrows its exact working-capital/expansion shortfall up to the
engine's own `assessCredit` ceiling — never a guaranteed $25k.

Focused sample (10 seeds × 2 archetypes, static vs wired):

| Metric | Static | Wired |
| --- | --- | --- |
| Borrows | 156 | 158 |
| Total principal advanced | $1,004,000 | $1,199,000 (+19%) |
| Max single borrow | $21,000 | $28,000 |
| Claims reached (T1–T3) | 46 | 40 |

15 of the 20 sampled runs changed borrowing outcomes; several borrowed
strictly more per loan after a claim (e.g. seed 20260502 grocery max single
$14,000 → $27,000), while others shifted the other way purely through seeded
trajectory divergence (any credit change reshuffles later RNG draws), which
also moved claim days/counts (e.g. reference T2/T3). Delinquent/service-limited
runs still cannot borrow: the wired terms only move the two ceiling terms, so
denial behavior (delinquency refusal, exhausted debt-service capacity) is
unchanged by construction and pinned by spec. Copy rule for the UI stands: a
claimed tier grants an **underwriting-base increase / higher possible
credit**, never guaranteed available credit.
