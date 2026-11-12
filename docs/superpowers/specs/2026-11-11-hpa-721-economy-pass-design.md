# HPA-721 — Economy and Progression Pacing: Design Spec

**Linear:** https://linear.app/cwchanap/issue/HPA-721/balance-make-expansion-and-local-production-pay-so-every-store-type
**Roadmap:** HPA-717 (after HPA-718, HPA-719 and HPA-720)
**Implementation plan:** `docs/superpowers/plans/2026-11-11-hpa-721-economy-pass.md`
**Inspected baseline:** `main@b50c90c3788eed3a00e757593d9df13ab8534e4a` (November 11, 2026)
**Status:** Proposed, planning-only checkpoint. **Hapadona must sign off the targets below before any gameplay constant changes.** No sweep on this revision, approved targets, passing tests, or balance improvements are claimed.

## 1. Desired player outcome

Any of the four starting archetypes—convenience, grocery, electronics, boutique—can grow from a local shop to a five-tier, multi-city business in the first 365 days. Expansion and building a local supply chain should create a rational economic advantage, not merely satisfy a goal at an unsustainable cost. Tier claims should feel sequential rather than collapse into one late-day stack.

**Keep this a numbers-and-data pass, not a new feature.** Reuse the existing world, store, staffing, finance, production, progression and deterministic balance harness. Do not add a demand engine, store resale, bankruptcy, save migrations, UI screens, or bespoke archetype rules.

## 2. What the existing evidence says (not a new baseline)

- HPA-679's recorded progression sweep had **107/200** tier-3 claims and **44/200** tier-4/5 claims; all 44 upper-tier runs were boutique. In that era, electronics had no industry-linked retail product.
- HPA-720 added the electronics accessories chain. Its addendum in `docs/balance/progression-calibration.md` §10 reports electronics **47/50** tier-3 claims (median **day 183**) and **0/50** tier-4/5 claims; the total 200-run tier-3 count rises to **154/200** while tier 4 and 5 remain **44/200**. These are **historically measured**, not rerun for this plan.
- The ticket's estimate is roughly **$22.4k** to open a store against **$12–28/day** incremental operating contribution, with upper-tier spending **$190k+** against about **$50k/year** operating surplus. Multiple stores in one city largely divide the same demand pool (`stock.ts`).
- `getExpansionSetupCost` in `state.ts` currently starts at 9,000 plus rent, archetype base-rent and tile-demand terms. `staffing.ts` hires use manager/general base monthly salaries of 4,300/2,700 plus seeded variance; grocery, electronics and boutique require more general coverage than convenience.
- `leveling.ts` intentionally gives +10% store revenue for **non-milestone** levels only: levels 4, 7 and 10 unlock categories/capacity but are excluded from the bonus count. Do **not** use an `(level - 1) * 0.1` formula or inadvertently make milestone bonuses compound.
- `progression.ts` currently gates T1 on two stores and $70k peak book value; T2 on three stores, level 2 and three open cities; T3 on four cities and 25 locally delivered retail units; T4 on five stores, five cities and level 4; T5 on seven stores, six cities and $150k peak book value. `claimEarnedTiers` claims a contiguous eligible prefix, so an already-satisfied T4/T5 may be claimed immediately after a delayed T3.

**Baseline discipline:** measure the *same* frozen 50-seed × four-archetype × 365-day progression/idle matrix and the HPA-502 Gate A matrix on the exact implementation base before tuning, then on the candidate head. Old `baseline.md`, `after.md`, `progression-calibration.md` and `rail-throughput-calibration.md` remain immutable provenance. The HPA-720 addendum is context, not a substitute for a fresh same-version control.

## 3. Proposed targets — explicit approval gate

These values restate and make measurable the HPA-721 proposal. They are **not yet approved**, and implementation must not change constants until they are.

| Measure | Proposed pass target | Definition |
| --- | --- | --- |
| Tier 3 reach | **≥40/50 (80%) for each archetype** | Count each unique seed that claimed T3 by day 365 |
| Tier 3 timing | **Median day 90–150 for each archetype** | Median among that archetype's T3-reaching runs; report reached population and p10/p90 |
| Tier 5 reach | **≥25/50 (50%) for each archetype** | Count each unique seed that claimed T5 by day 365 |
| Tier 4 → 5 spacing | **≥30 days between pooled median T4 and pooled median T5 claim days** | Each median is over its respective reached runs; also report per-run paired gaps and the count of same-day T4/T5 pairs so a pooled median cannot hide stacking |
| Archetype equity | **max/min median peak company book value ≤3×** | One median per archetype over all 50 progression runs, including unsuccessful runs; min must be positive |
| Idle negative control | **0/200 idle claims AND 0 earned-but-unclaimed tiers** | The latter is essential: idle never invokes the claim function itself |
| Earlier economic guardrails | **All five HPA-502 Gate A sweep checks still pass**, plus the scenario guardrail suite | Recheck rather than assume past PASS means current PASS |

**Additional diagnostic, not a separate invented gate:** report same-day T4/T5 counts and per-run gap distribution. Aim for no same-day upper-tier stacks; if a nonzero count remains despite ≥30-day median separation, present it explicitly for sign-off. Do not change the claim algorithm or add artificial per-tier cooldowns under this ticket.

The Gate A suite is: (1) ≥80%/archetype retail-steady positive 30-day operating-income window completed by day 90; (2) cash/debt/import/waste extrema below 1e9; (3) retail-steady days-61–90 operating income beats paired idle in all 200 seed/archetype pairs; (4) opening-forecast relative error within ±25% under the existing eligibility rule; (5) the advisor served-chain composite. Scenario medal/no-action/reference invariants are a separate required check.

### Human decision required

Approve or amend **the seven target rows**, particularly the T3 90–150-day window, T4/T5 30-day median spacing, and book-value 3× bound. A target miss is not a silent pass: publish the cause, the seed/archetype failures and a proposed exception, and obtain Hapadona's explicit acceptance before marking the draft ready.

## 4. Smallest viable lever sequence

Prefer making growth worthwhile *before* making the ladder easier. Change only existing values, preserving deterministic order, data ownership and all player commands.

1. **Store unit economics and expansion:** first inspect per-archetype per-store income, staffing payroll, setup cost and repay period. Candidate levers are the `state.ts` expansion-cost terms, base salaries or archetype requirement counts in `staffing.ts`, and the existing per-level non-milestone revenue bonus in `leveling.ts`. Make the smallest observed necessary adjustments; keep costs and salaries legible. Test that adding a store improves modeled daily contribution without an unrealistic free-building effect.
2. **New-city growth:** inspect `worldCatalog.ts` retail demand profiles and `stock.ts` city-wide pools. Prefer the existing per-city demand multipliers if they yield measurable additional demand for new-city openings. Do not make every same-city store independently spawn a new market.
3. **Industry profitability:** compare realized retail-import savings and local deliveries to production recipes' `operatingCost`, buildings' `dailyOperatingCost`, transfer/rail and warehouse overhead, and any incremental imports. Candidate catalog levers live in `industry.ts`: recipe and daily running costs, `localValue` / `importCost`. **`localValue` is valuation, not cash profit**; a local-supply advantage requires real cash/operating-income evidence. Keep HPA-679 rail throughput and warehouse caps unchanged unless an actual regression proves a bug.
4. **Progression thresholds and rewards—last:** adjust numeric goals in `progression.ts` only if healthier economics still cannot produce appropriately spaced claims. Distinguish a threshold that is structurally impossible from a merely slow one; changing thresholds alone is not evidence expansion pays. Optionally tune existing claim store-capacity/credit reward sizes, but do not add rewards or change contiguous-prefix behavior without a separately approved scope change.

Avoid simultaneous broad edits; record each lever's before → after value, rationale, affected archetypes and effect on the fixed matrix. Use small representative-seed trials to reject bad candidates cheaply, then rerun the full 50-seed official matrix. The final acceptance is **on the settled final combination**, not on isolated successful trial runs.

## 5. Measurement and artifacts

Reuse `tests/balance/run.ts`, `tests/balance/progressionRun.ts`, `tests/balance/progressionCalibration.ts`, `tests/balance/bots.ts` and existing scenario tests. Aggregate missing **per-archetype** rates, per-run T4/T5 gaps, and median peak book value with a small pure helper in `tests/balance/` only if the existing JSON run rows cannot be summarized clearly. No generic tuning framework or synthetic player simulation.

Commit a new `docs/balance/economy-pass.md` with:

- Exact base/head commit SHAs, explicit seeds **20260501–20260550**, 365 days, four archetypes, bots, commands, deterministic artifact paths and quantile method.
- Before/after progression table **per archetype**: T1–T5 reached counts, T3 and T4/T5 claim-day distribution, T4→T5 same-day count, median peak book value, day-365 cash, store/city count and local units.
- Cash rationale: comparable store contribution/payback and realized local-versus-import cost on named representative seeds; do not infer profitability from `localValue` or merely from volume.
- Five Gate A results, 200 idle checks, first-year reference seed `20260503` convenience claim days and complete failing-goal evidence.
- Scenario names, original reference/no-action medals, new observed results and each approved threshold re-pin. Include a table of any failed targets and explicit sign-off exceptions.

Add a concise append-only entry to `docs/balance/tuning-changelog.md`. Leave the four historical calibration reports unchanged. Generated large JSON/trace files remain git-ignored; ensure regeneration commands are runnable and the committed report has the measured summaries needed for review.

## 6. Boundaries and risks

- **No save migration**; no persisted fields should change. No extra production chain, art, city, price model, financing product, manager AI or new UX.
- Do not retune forecast math as a planned lever. If existing forecast acceptance breaks, fix only the coupling introduced by an approved lever or reject that lever.
- Scenario difficulty must be preserved, not blindly loosened: re-pin only tests/medals demonstrably affected by the new economy, comparing reference and no-action on the same seed.
- Keep tests and bot action policy stable unless correcting an independently demonstrated measurement bug. Document and re-baseline any such correction symmetrically.
- The official success matrix can be compute-heavy; pilot on fewer explicit seeds, but never claim a pass without the official 50-seed sweep.
- No new UI is planned. If numbers appear in UI copy, update all existing English, Japanese and Traditional Chinese strings. Keep the approved gameplay HUD style; HPA-721 has no new attached mockup.

## 7. Acceptance decision

HPA-721 is complete only when the targets (or explicitly accepted deviations) are measured on the final branch; Gate A, idle controls and scenario semantics pass; fixed-seed 20260503 evidence is captured; all cost/threshold changes are documented; and check, lint, unit and affected E2E checks pass. The implementation stays on **the same draft PR**, not a separate coding PR.
