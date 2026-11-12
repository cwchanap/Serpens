# HPA-721 — Single-PR Economy Pass Implementation Plan

**Linear:** https://linear.app/cwchanap/issue/HPA-721/balance-make-expansion-and-local-production-pay-so-every-store-type
**Design:** `docs/superpowers/specs/2026-11-11-hpa-721-economy-pass-design.md`
**Roadmap:** HPA-717
**Branch:** `docs/hpa-721-economy-pass`
**Inspected base:** `main@b50c90c3788eed3a00e757593d9df13ab8534e4a`
**Delivery:** One ticket, **one draft PR** throughout design review, constants, measurement, tests and final review. No second implementation PR.
**Current checkpoint:** Gate 0 approved in [latest review](https://github.com/cwchanap/Serpens/pull/73#pullrequestreview-5879497911). Step-1 **harness code and focused specs have started** (pacing verdict, CLI numeric parsing and non-strict idle diff); no official untuned baseline captured, no gameplay economy/ladder constants changed, and no test/sweep pass is claimed.

## Review gate 0 — Approved in PR review

- [x] Approved: **T3 ≥40/50 and median day 90–150; T5 ≥25/50 per archetype; max/min median peak book value ≤3×** over the official 50 seeds × four archetypes × 365 days, including failed runs in equity medians.
- [x] Approved in principle: remove the sixth-city Tier-5 blocker **without introducing a redundant five-city goal**. Use **Option A (less work)** from the latest review: **delete the Tier-5 `market-leader-opened-cities` goal** (Tier 4 already requires five cities, so a Tier-5 five-city goal is never independently binding). Keep Tier 4 unchanged; keep Tier 5's store-count and peak-book-value goals. Remove unused `marketLeaderOpenedCities` keys from **en/ja/zh-Hant** and update catalog/i18n tests. No grocery exception or Quarry Works reveal/bot changes.
- [x] Approved: **per-archetype median of paired `T5.claimedOnDay − T4.claimedOnDay` ≥30 days** across T5-reaching runs; same-day count is diagnostic, not an all-zero gate.
- [x] Approved lever order: boutique normalization → sustainable expansion → measured rival share/city demand → local-industry throughput and costs → remaining numeric thresholds. Measured rationale and an additional review are needed for materially changing approved goals.
- [ ] Preserve existing hard idle **0 earned-but-unclaimed**, all five `evaluateGateA(...).allPassed` checks including full coverage, and scenario guardrails. Record any accepted exception explicitly in this PR before readiness.

**Gate result: PASSED.** The latest review explicitly approves targets and lever order; it selects structural cleanup (remove Tier-5 city goal rather than duplicating Tier 4). Capture untuned baseline **before** applying the approved gameplay change.

## Step 1 — Approved harness groundwork, then exact before matrix

The committed Step-1 code affects only the optional balance harness, not gameplay economics. A full same-commit baseline still needs to be captured before implementing the structural Tier-5 goal change or other tuning.

- [ ] Refresh `main` and recheck the merged HPA-720 electronics chain. Record the actual baseline source SHA and any newer economy changes.
- [x] Follow the HPA-502 `GATE_A_THRESHOLDS` precedent: add **one small typed** `PROGRESSION_PACING_TARGETS` and pure `evaluateProgressionPacing(report)` to `tests/balance/progressionCalibration.ts`, plus focused spec tests. Reuse `calibrateTier`, `median`, `quantile`. It should report per-archetype T3/T5 reach and T3 median, same-run paired T4→T5 gaps, same-day counts, and the ratio between per-archetype median peaks (all 50 seeds). Missing T5 is a failed/unavailable spacing metric, never “passed”.
- [x] Coverage is part of **official** pacing PASS: the exact `SWEEP_SEEDS` set (20260501–20260550), four archetypes, 365 days, exactly one run per seed/archetype, no missing/extra/duplicate rows. A partial pilot may print measured diagnostic rows but must not claim an official PASS. Print concise verdicts in `tests/balance/progressionRun.ts`; pacing failures do not abort the CLI, because Hapadona may accept documented exceptions. The existing idle check **continues to abort** on earned-but-unclaimed.
- [x] Correct the confirmed scientific-notation seed-input trap in the existing `parsePositiveInteger` functions of `tests/balance/run.ts`, `progressionRun.ts` and `chainEvidence.ts`: require literal decimal **digits only** before `Number(raw)`, retaining positive safe-integer checks. Add narrow invalid-seed/invalid-days specs (`2.02605e+07`, decimal, negative and empty strings). Do not create a new shared CLI framework.
- [ ] Capture a **fresh same-implementation-base** official progression+idle matrix, 450-run Gate A matrix, seed `20260503` convenience reference trace, and affected scenario reference/no-action baseline. The reviewer reports matching T3 154/200 and upper-tier 44/200 on `main@b50c90c3`, but **this is contextual review evidence**, not a substitute for our own captured artifacts. Use identical measurement helper and parser validation on both before and after, even when running against the untuned gameplay baseline. Preserve engine, bot decisions and seed order.
- [ ] Keep historical `docs/balance/baseline.md`, `after.md`, `progression-calibration.md`, `rail-throughput-calibration.md` unchanged. Generated JSON/trace stays under ignored `docs/balance/generated/`.

**Official commands (literal numeric seeds; do not use macOS `seq`, which may emit scientific notation):**

```sh
SEEDS=20260501,20260502,20260503,20260504,20260505,20260506,20260507,20260508,20260509,20260510,20260511,20260512,20260513,20260514,20260515,20260516,20260517,20260518,20260519,20260520,20260521,20260522,20260523,20260524,20260525,20260526,20260527,20260528,20260529,20260530,20260531,20260532,20260533,20260534,20260535,20260536,20260537,20260538,20260539,20260540,20260541,20260542,20260543,20260544,20260545,20260546,20260547,20260548,20260549,20260550

bun tests/balance/progressionRun.ts --seeds "$SEEDS" --days 365 --output docs/balance/generated/hpa-721-progression-before
bun tests/balance/run.ts --seeds "$SEEDS" --days 365 --bots idle,retail-steady,advisor --output docs/balance/generated/hpa-721-gate-before
bun tests/balance/progressionRun.ts --seeds 20260503 --days 365 --archetypes convenience --trace docs/balance/generated/hpa-721-reference-20260503-before.json
```

**Gate:** the coded baseline verdict has exact coverage and reproducible reference evidence. `evaluateGateA(...).allPassed` must be evaluated on the **complete** sweep, not on standalone successful sub-items. Existing `tests/balance/progressionBots.spec.ts` already checks deterministic reruns; no extra manual twice-run requirement.

## Step 2 — Diagnose economics, then adjust the smallest existing levers

Do **not** broaden this into a new economy architecture or a generic search/tuning system. Use a small explicit seed subset for pilot tuning, then the complete official matrix to validate the settled combination.

- [ ] **Boutique normalization first**: explain the reviewer-measured boutique vs convenience median peak book-value spread (**$912,294 vs $77,654, ~11.7×**) using actual per-store income and 61–90-day windows. Inspect `archetypes.ts` (boutique `baseTraffic`, `baseWage`, `baseRent`) and boutique-specific `products.ts` price, demand, margin. Change only grounded inputs to shrink the gap without erasing the boutique archetype or violating the previously approved boutique viability Gate A.
- [ ] **Expansion with positive marginal contribution**: compare the next-store decision to doing nothing (same seed, city and product demand). Use `state.ts:getExpansionSetupCost`, `staffing.ts` base salaries/requirements and `leveling.ts` non-milestone revenue multiplier only when justified. Costs/payroll still have to be paid; do not make stores nearly free or give milestone levels 4/7/10 the non-milestone revenue bonus.
- [ ] **Same-city market share and new-city demand**: before tuning costs, inspect `stock.ts` `playerShare`, `playerShareDelta`, city demand pools and existing rival attraction from `marketCompetition.ts`; one more store may steal player share from rivals but cannot generate new city demand when company share is already 1. Consider the existing `worldCatalog.ts` retail demand multipliers and, **only if supported by real overlap/share measurements**, existing `marketCompetition.ts` rival-posture/base-attraction constants. Do not invent separate demand per store or change the market-share algorithm.
- [ ] **Local-industry cash economics**: use the **existing `tests/balance/chainEvidence.ts`**, not a new collector, for representative industry-linked products: convenience `bottled-water` (and optionally `snacks`), boutique `gifts`, electronics `accessories`, grocery `produce`/`pantry`. Compare local deliveries/import spend to `productionTotals.operatingCost`, building `fixedOperatingCost`/`recipeOperatingEstimate`, warehouse, rail and imported inputs. **Count factory instances per `typeId`**: assigning newly opened retail cities to an industry city aggregates their demand and can trigger multiple parallel bottleneck factories, high fixed overhead and `railRequiresCash`. Where supported by evidence, tune existing `baseThroughput` / recipe output quantities before cutting `dailyOperatingCost` toward zero. Adjust only existing `industry.ts` catalog data as justified; `localValue` is valuation, not cash saved.

The existing chain evidence CLI syntax is:

```sh
bun tests/balance/chainEvidence.ts --seeds 20260503 --days 365 --archetype convenience --product bottled-water --output docs/balance/generated/hpa-721-convenience-water
bun tests/balance/chainEvidence.ts --seeds 20260503 --days 365 --archetype boutique --product gifts --output docs/balance/generated/hpa-721-boutique-gifts
bun tests/balance/chainEvidence.ts --seeds 20260503 --days 365 --archetype electronics --product accessories --output docs/balance/generated/hpa-721-electronics-accessories
bun tests/balance/chainEvidence.ts --seeds 20260503 --days 365 --archetype grocery --product produce --output docs/balance/generated/hpa-721-grocery-produce
```

- [ ] **Numeric ladder last**: after capturing the untuned baseline, implement **approved Option A**: remove the redundant Tier-5 `market-leader-opened-cities` goal entirely (no replacement Tier-5 five-city goal), preserving Tier 4's five-city prerequisite. The Tier-5 two-goal catalog then depends on store count and peak book value. Measure T4→T5 gaps on the final matrix; any further numeric threshold changes need seed-level evidence and sign-off. Preserve pure progression/claim code and the frozen bot.
- [ ] On Tier-5 city-goal removal, **delete** the now-unused `marketLeaderOpenedCities` key in **English, Japanese and Traditional Chinese**, and update focused catalog/i18n tests. No replacement wording is necessary.
- [ ] For each small lever group, record old→new numeric values, controlled pilot results, per-archetype verdict movements and adverse forecast/scenario effects. Reject a choice that gains Tier 5 reach but breaks the already-approved Gate A or makes extra stores cash-negative.

**Gate:** measured pilots show plausible benefit, not just progress from relaxed thresholds. No “pass” declaration before an official final matrix.

## Step 3 — Final sweep and evidence, using existing tools

- [ ] Run the complete `progressionRun.ts` sweep again with `--output docs/balance/generated/hpa-721-progression-after`, the 450 Gate A runs with `--output docs/balance/generated/hpa-721-gate-after`, and seed-20260503 convenience with `--trace docs/balance/generated/hpa-721-reference-20260503-after.json` on the exact settled head commit.
- [ ] Read the **coded** per-archetype pacing verdict and `evaluateGateA(...).allPassed` (which already requires `coverage.complete`). Report all seven gate dimensions, paired-gap median and same-day T4/T5 diagnostics, and explicitly disclose every miss.
- [ ] Reuse the now-fixed `tests/balance/progressionDiff.ts` with `--base ...before.json --head ...after.json` to check matrix/config coverage and seed-level diffs. No `--require-identical`: normal comparisons now **report** idle aggregate/book-value changes without exiting 1 solely for those changes, while strict mode still enforces identity. Separately assert both before and after idle earned-but-unclaimed remain zero. The dedicated `progressionDiff.spec.ts` pins this behavior. Do not force byte-identical *cross-economy* idle artifacts.
- [ ] Commit `docs/balance/economy-pass.md` with base and head SHA, exact seed list and commands, full before/after per-archetype reach, T3 pacing, T4→T5 paired gaps and same-day counts, median peaks (all runs), T5 city-reveal decision, per-store and local-chain economics, five Gate A verdicts, 20260503 reference claims and complete scenario re-pin details.
- [ ] Append numeric changes and reasons to `docs/balance/tuning-changelog.md`. Leave four older reports frozen and keep large generated JSON untracked. The existing determinism spec is sufficient unless a changed harness or serialization rule reveals a gap.

**Gate:** every approved target passes on the complete official matrix, or each failure has explicit Hapadona sign-off, with complete before/after evidence.

## Step 4 — Focused correctness, scenario and localization verification

- [ ] Write/update focused tests for **changed** cost/catalog rules, including boutique inputs, salary/setup, level milestone exclusion, city/rival share, industry margin and the approved *removal* of the redundant Tier-5 city goal. Test the pure pacing verdict on: all archetypes passing, a partial matrix not claiming official PASS, missing/duplicate seed rows, no T5 claims, T4/T5 same-day pairing, and cross-archetype median ratio. Check CLI scientific-notation rejection.
- [ ] Keep `runProgressionBot` action policy and fixed seeds stable. Correct any discovered measurement bug **symmetrically** for before and after and disclose its impact. Idle's hard non-earning check remains authoritative.
- [ ] Re-run the relevant scenario reference/no-action cases (including first-profit, local-lifeline, fresh-market, rival-next-door, two-city-supply-run and the advanced scenarios if affected). Re-pin exact numbers only when gameplay data change moves the observed outcome; preserve intended reference > no-action medal separation and document named shifts.
- [ ] Run `bun run check`, `bun run lint`, `bun run test:unit -- --run`, the full official balance sweeps, and the **affected** Playwright E2E. Keep the same draft PR until coverage and CI pass. No save migration or new persisted fields.

**Gate:** approval, measured data, scenario semantics, locales and tests align with the final values.

## Step 5 — Concise end-to-end player/visual acceptance (macOS and Windows)

- [ ] On **macOS** and **Windows**, perform **one short fresh-sandbox smoke each** on the supported browser/desktop build: confirm representative store opening/upgrade costs, one local-stock delivery and the five-tier progression UI's wording/rewards behave consistently. The statistical five-tier reachability requirement is proven by the official seeded CLI, **not** by manual playthroughs.
- [ ] **Visually compare** the existing HUD, progression ladder, industry/store detail and report copy to the previously approved **HPA-304 / Vitrine mockup if available**; no new mockup is attached to HPA-721 and no visual redesign is planned. Focus on the removed duplicate Tier-5 goal row, value formatting and clipping; do not run a four-archetype/365-day manual matrix on two platforms.
- [ ] Only macOS and Windows are player-acceptance targets for this desktop/web task; Android and Linux rely on CI. No iOS deliverable is in scope.

## Completion / merge criteria

1. Gate 0 explicitly approves the targets, **paired** per-archetype T4→T5 gaps, boutique lever and grocery city-goal choice; any actual deviations have separate written sign-off.
2. The same final source commit passes official `SWEEP_SEEDS` × four archetypes × 365 days coverage: T3 ≥40/50 and median day 90–150, T5 ≥25/50, paired T4→T5 median gap ≥30 days per archetype, peak-value ratio ≤3×, or individually accepted failures. Same-day counts are published as diagnostics.
3. All 200 idle runs earn/claim zero tiers; `evaluateGateA(...).allPassed` is true on complete 450-run coverage; scenarios retain reference/no-action gameplay integrity.
4. Source SHA, exact seeds, detailed per-archetype before/after, store/industry contributions, approved Tier-5 goal/key removal, 20260503 claim trace, scenario re-pins, and signed exceptions appear in `economy-pass.md` and the append-only tuning log.
5. Check/lint/unit/affected E2E pass; short end-to-end visual QA passes on macOS and Windows against the approved HPA-304 mockup when available.
6. **One ticket, one PR**: the same `docs/hpa-721-economy-pass` draft receives design, code, measured results and final acceptance; no second PR or separate implementation ticket.
