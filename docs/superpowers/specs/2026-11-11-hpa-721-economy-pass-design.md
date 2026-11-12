# HPA-721 — Economy and Progression Pacing: Design Spec

**Linear:** https://linear.app/cwchanap/issue/HPA-721/balance-make-expansion-and-local-production-pay-so-every-store-type
**Roadmap:** HPA-717 (after HPA-718, HPA-719 and HPA-720)
**Implementation plan:** `docs/superpowers/plans/2026-11-11-hpa-721-economy-pass.md`
**Inspected baseline:** `main@b50c90c3788eed3a00e757593d9df13ab8534e4a` (November 11, 2026)
**Status:** Gate 0 explicitly approved in [PR #73 review](https://github.com/cwchanap/Serpens/pull/73#pullrequestreview-5879497911). Minimal measurement-tool groundwork is committed; **economy constants and the Tier-5 goal remain unchanged until an official untuned baseline is captured**. Reviewer-reported sweep results are attributed, not independently re-run.

## 1. Desired player outcome

Any of the four starting archetypes—convenience, grocery, electronics, boutique—can grow from a local shop to a five-tier, multi-city business in the first 365 days. Expansion and building a local supply chain should create a rational economic advantage, not merely satisfy a goal at an unsustainable cost. Tier claims should feel sequential rather than collapse into one late-day stack.

**Keep this a numbers-and-data pass, not a new feature.** Reuse the existing world, store, staffing, finance, production, progression and deterministic balance harness. Do not add a demand engine, store resale, bankruptcy, save migrations, UI screens, or bespoke archetype rules.

## 2. Current evidence and blocked paths

The PR reviewer reports running the **unchanged official 50-seed × 4-archetype × 365-day progression matrix** against the inspected `main@b50c90c3`, reproducing the HPA-720 historical totals (T3 **154/200**, T4/T5 **44/200**). These are **reviewer-provided measurements**, useful for design but not yet an independently collected HPA-721 before artifact; capture the identical matrix locally before implementation. Exact numbers, including unsuccessful runs, from [the review](https://github.com/cwchanap/Serpens/pull/73#pullrequestreview-5870552687):

| Archetype | Tier 1 | Tier 3 / median reached day | Tier 4 | Tier 5 | Median peak book value (all 50) | Most cities opened |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| Convenience | 34/50 | **17/50**, day **267** | 0 | 0 | **$77,654** | 5 |
| Boutique | 50/50 | **44/50**, day **197** | 44/50 | 44/50 | **$912,294** | 6 |
| Electronics | 50/50 | **47/50**, day **183** | 0 | 0 | **$222,646** | 6 |
| Grocery | 50/50 | **46/50**, day **204** | 0 | 0 | **$106,558** | 5 |

The reviewer also reports 200/200 idle runs with zero claimed **and zero earned-but-unclaimed** tiers; the latter is already a hard failure in `tests/balance/progressionRun.ts`. The approximate boutique/convenience median peak value ratio is **11.7×**, well above the desired **≤3×**. All 44 boutique upper-tier runs claim T4/T5 on the **same day** because T3's delayed local-units gate releases an already-eligible contiguous prefix. Higher boutique income is not solved by making every other archetype artificially profitable: the prior measured day-61–90 median income was about **+$62,394** for boutique vs **+$3,182** for convenience (`docs/balance/after.md`).

**Structural T5 blocker for the frozen grocery bot:** The existing T5 goal `market-leader-opened-cities` requires **6 cities**, all cities in `WORLD_CITY_CATALOG`. `world.ts` reveals Quarry Works only after city-attributed production/inventory of an item in `QUARRY_WORKS_FINISHED_MATERIALS`; the grocery bot's industry-linked starting products are `produce` and `pantry`, neither in this allowlist. The bot does not deliberately produce another advanced finished material or bypass city reveals. The review measured **0/50** grocery runs opening city 6. With the bot frozen, adjusting store setup costs, demand, salaries or those two chain margins does not remove this blocker. This is a **bot-policy/matrix reachability** statement, not a claim that a human grocery player could never make another product chain.

**City demand and rival-share constraint:** `buildCityDemandPools` in `stock.ts` computes the city's product demand independent of the number of stores. The company earns `playerShare = playerAttraction / (playerAttraction + rivalAttraction)` (from `marketCompetition.ts`); same-city stores share the resulting player demand. If rivals do not sell overlapping products, player share is already ~1 and an additional same-city store cannot create a fresh demand pool. At seven stores across only three retail cities, some same-city overlap is unavoidable. This needs a measured marginal-store case before lowering setup costs or tuning rival attraction.

**Important code contracts:** `leveling.ts` grants +10% revenue on **non-milestone** upgrade levels only (levels 4/7/10 are excluded). `state.ts` expansion cost starts at 9,000 plus tile/rent terms; `staffing.ts` manager/general starting monthly wages are 4,300/2,700 plus seeded variance. `localValue` is inventory valuation, **not** evidence of operational cash profit. The HPA-720 electronics chain now makes the local-product goal legally reachable, but its median tier-3 day of 183 is later than the desired window.

## 3. Approved pacing targets and structural decision

The [latest review](https://github.com/cwchanap/Serpens/pull/73#pullrequestreview-5879497911) **approves these targets**, the boutique-first lever order and existing controls. It also approves removing the sixth-city blocker, with the important refinement below: do **not** replace a six-city Tier-5 goal with a redundant five-city Tier-5 goal.

| Measure | Candidate gate | How to evaluate |
| --- | --- | --- |
| Tier 3 reach | **≥40/50 (80%) per archetype** | Distinct official seeds claiming T3 by day 365 |
| Tier 3 pacing | **Median claim day 90–150 per archetype** | Median among T3-reaching seeds; report the denominator, p10/p90 and remaining blockers |
| Tier 5 reach | **≥25/50 (50%) per archetype** | Distinct official seeds claiming T5 by day 365; Tier 5 will retain store-count and peak-book-value goals |
| Tier 4 → 5 pacing | **Per-archetype median of paired per-run gaps ≥30 days** | For each run reaching T5, calculate `T5.claimedOnDay − T4.claimedOnDay`, then the median *within that archetype*. Missing T5 cannot pass as an empty median |
| Archetype balance | **Maximum ÷ minimum median peak book value ≤3×** | One peak-value median per archetype across **all 50** progression seeds, reached or not; minimum must be positive |
| Idle control | **0/200 claimed and 0 earned-but-unclaimed** | Already enforced by the existing progression CLI, not a manually repeated test |
| Other regressions | **All five HPA-502 Gate A checks pass, with official coverage; scenario guardrails pass** | Use `evaluateGateA(...).allPassed`, not just item ratios from a partial run |

Report the **same-day T4/T5 pair count per archetype** and paired gap distribution as diagnostics; it is **not** a strict zero-count gate. A pooled median T5 minus pooled median T4 compares mismatched populations and is not an acceptance metric.

### Approved decisions (implementation after baseline capture)

1. **Remove the Tier-5 city goal entirely (approved Option A):** the existing Tier-4 five-city requirement is monotone and already a prerequisite of Tier 5. Reducing Tier 5 from six to five would create a dead duplicate `opened-city-count ≥ 5` goal; **remove** `market-leader-opened-cities` from `PROGRESSION_TIERS` instead. Keep Tier 4's five-city goal intact, and leave Tier 5 with **store-count ≥ 7 and peak-company-book-value ≥ $150k** (until separately measured threshold tuning). Delete the unused `marketLeaderOpenedCities` translation key from **en, ja, zh-Hant** and update catalog/i18n tests. No changes to the Quarry Works reveal allowlist, grocery bot, claim algorithm or other cities.
2. **Equity:** approved ≤3× bound with an explicit **boutique-down** tuning lever; the reviewed starting ratio is ~11.7×. Treat measured economic sustainability and prior Gate A viability as guards against overcorrecting boutique.
3. **Spacing:** approved **per-archetype paired-gap median ≥30 days** with same-day counts diagnostic, not pooled median differences or a brittle zero-same-day gate.
4. **Lever order:** approved boutique normalization first, then affordable/positive-contribution expansion, rival-share and city demand, local industry, then numeric ladder thresholds. Specific constant values still need measured justification.

As before, any missed target must be reported with exact seed/archetype causes and explicitly accepted before marking the PR ready. The Gate A suite is: (1) ≥80% viability by day 90, (2) boundedness under 1e9, (3) managed vs idle on days 61–90, (4) opening-forecast error within ±25% under current eligibility rules, and (5) advisor served-chain composite. Scenarios are a separate suite.

## 4. Smallest existing-data lever sequence (after Gate 0)

0. **Normalize boutique first:** inspect `archetypes.ts` boutique `baseTraffic`, `baseRent`, `baseWage` and boutique `products.ts` demand, price and margin definitions to identify *why* its per-store contribution is much larger. Adjust the smallest proven boutique-specific input(s) that narrow the early-income and year-end peak-book-value gap without removing its premium identity or failing Gate A. Avoid balancing other archetypes by inflating their revenue fourfold. Record per-store opening and 61–90-day income deltas.
1. **Make actual expansion worthwhile:** use existing `state.ts` `getExpansionSetupCost`, `staffing.ts` requirements/seeded salary bases, and `leveling.ts`'s **non-milestone-only** revenue bonus. Examine marginal revenue, payroll and payback for one more store with and without nearby rival overlap; do not claim a store is viable merely because it is cheaper to open.
2. **Measure rival share, then city demand:** `stock.ts` already reports `playerShare`, `playerShareDelta` and attraction per product/city, so measure the before/after incremental `playerShare` and sales for a same-city second store. `worldCatalog.ts` has existing city-specific demand multipliers; `marketCompetition.ts` has existing posture/base-attraction constants as a **conditional** global lever if the reports demonstrate a share problem. Do not mint extra demand per store or change market/share formulas. Do not change rival attraction blindly (it can affect all four archetypes and scenarios).
3. **Improve real local-supply economics:** reuse `tests/balance/chainEvidence.ts` on `bottled-water` (convenience), `gifts` (boutique), `accessories` (electronics), and `produce`/`pantry` (grocery). Read actual retail-local units and import spend, recipe `operatingCost`, per-building `fixedOperatingCost`/`recipeOperatingEstimate`, rail movement and consumed local/imported material. Inspect **per-building `typeId` counts** as new retail cities share the `industry-city` warehouse assignment: the planner aggregates multi-city demand and may build several parallel bottleneck processors, multiplying fixed overhead and producing `railRequiresCash` stalls. If this is the cause, prefer measured **`baseThroughput` or `PRODUCTION_RECIPES.outputs[].quantity`** corrections in `industry.ts` before nearly eliminating `dailyOperatingCost`. Only then change necessary existing recipe, building and material costs. `localValue` alone never proves a cash advantage. Preserve HPA-679 rail and overflow rules.
4. **Adjust the single shared progression ladder last:** the **approved removal of the dead Tier-5 city goal** is the known structural correction. Apply it only **after** capturing the untouched official baseline, then measure the real Tier-4→5 gaps. If viable economics still stack claims, tune remaining existing Tier-5 store-count/peak-value thresholds with seed-level blocker evidence. Keep the contiguous-prefix algorithm, bot policy and existing goal metrics.

Use small fixed-seed pilots to reject bad candidates, then rerun the official full matrix on the settled combination. Keep a per-lever before → after record. Numeric changes are not automatically successful if a more profitable store merely captures rival demand that was already fully captured.

## 5. Reuse of measurement and evidence, without another framework

Existing tools cover almost all measurement:

- `tests/balance/progressionRun.ts`, `progressionCalibration.ts` and `bots.ts`: official 50-seed × four-archetype × 365-day progression + idle matrix. `ProgressionCalibrationReport.runs` contains each seed/archetype's claims, blockers, book value, local units, credit events and store count. The CLI already **aborts on earned-but-unclaimed idle tiers**.
- **Implemented measurement groundwork:** `PROGRESSION_PACING_TARGETS` and pure `evaluateProgressionPacing(report)` are now in `tests/balance/progressionCalibration.ts` with `progressionPacing.spec.ts` coverage; verification by CI remains pending. Reuse `calibrateTier`, `median`, `quantile`; add only per-archetype aggregation, paired T4/T5 gaps, peak-book-value median ratio and official coverage (correct seed set, four archetypes, 365 days, no missing/duplicate rows). Print the verdict in `progressionRun.ts`. Partial pilots may print metrics but **must never report an official PASS**; fail no CLI run on a pacing miss because signed exceptions are allowed. This helper is necessary to prevent error-prone hand calculations, **not** a new parameter-tuning subsystem.
- `tests/balance/chainEvidence.ts`: existing per-archetype industry chain costs, flows, revenue inputs and failure explanations; do not write a replacement analyzer.
- `tests/balance/progressionDiff.ts`: existing before/after seed/config coverage and changed-run explanations. The review-identified false failure is now fixed: normal diffs report differing idle book-value aggregates **informationally**; `--require-identical` retains strict idle comparison. Independently evaluate both snapshots' zero-idle-earning controls.
- `tests/balance/run.ts` and `measure.ts`: Gate A verdict `evaluateGateA(...).allPassed` **includes** `coverage.complete`; use it for the official 450-run sweep.
- `SWEEP_SEEDS` / `SWEEP_REGENERATION_COMMAND` in `tests/balance/measure.ts` are the official reproducible seed definitions. CLI commands in the plan use the explicit list rather than `seq`: macOS `seq` can emit scientific notation; all three CLI `parsePositiveInteger` functions in `run.ts`, `progressionRun.ts` and `chainEvidence.ts` currently accept it via `Number(raw)`. Add a digits-only validation + focused rejected-input specs **before** baseline capture, on the same harness code for before and after.

Write the final measured narrative to a **new** `docs/balance/economy-pass.md`, with same-commit before/after base/head SHA, official seed/matrix and commands, per-archetype gates, T4/T5 paired gaps and same-day diagnostics, named store/rival/industry cash comparisons, five Gate A results, scenario reference/no-action shifts, 20260503 convenience claim trace and any explicit exceptions. Append numeric levers to `docs/balance/tuning-changelog.md`; keep `baseline.md`, `after.md`, `progression-calibration.md`, `rail-throughput-calibration.md` frozen. Generated JSON/trace files stay git-ignored.

Existing determinism specs (e.g. `tests/balance/progressionBots.spec.ts`) cover deterministic runs; do **not** add a repetitive manual full-sweep double-run solely for this ticket. If the harness itself is changed, compare both versions using the identical corrected harness and disclose any metric-definition change.

## 6. Scope and verification boundaries

- No save migration or new persisted data; no extra production chain, sprites, cities, wholesale economic engine, store resale, bankruptcy, manager AI or redesigned HUD.
- Every gameplay constant change must have Gate-0 sign-off of its **target and permitted lever**; future specific values require measured justification, and larger departures need renewed approval.
- Forecast math is not a planned lever; reject/fix a balancing value if it breaks the existing ±25% forecast Gate A requirement.
- Re-pin only demonstrably affected scenarios against matched seed/reference/no-action runs, with disclosed medal changes. Do not automatically soften challenge requirements.
- One short end-to-end player/visual smoke on **macOS and Windows** remains in scope, plus affected Playwright E2E; no repeated manual 365-day runs or redundant four-archetype full manual matrix. Serpens has no iOS deliverable in this ticket. Android/Linux are CI-only.
- When removing the now-dead Tier-5 city goal, **delete** its unused translation key in all three locales (no replacement five-city copy). Verify the two remaining Tier-5 goals render on macOS/Windows against the approved HPA-304 UI mockup if available. No new mockup or art task.

## 7. Acceptance

HPA-721 is complete when signed targets (or documented exceptions) are satisfied on the **same final commit's complete seeded matrix**, the official coverage verdict is complete, Gate A passes 5/5, idle earned-but-unclaimed stays 0, all scenario reference/no-action guardrails pass, and seed 20260503's claim days are recorded. The new report and append-only changelog explain every lever and goal/copy re-pin. Check, lint, full unit tests, affected E2E, and concise macOS/Windows player/visual smoke pass. **One ticket / one draft PR**: implementation and results remain on this branch, not another PR.
