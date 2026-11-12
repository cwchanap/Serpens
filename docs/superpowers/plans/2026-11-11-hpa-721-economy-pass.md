# HPA-721 — Single-PR Economy Pass Implementation Plan

**Linear:** https://linear.app/cwchanap/issue/HPA-721/balance-make-expansion-and-local-production-pay-so-every-store-type
**Design:** `docs/superpowers/specs/2026-11-11-hpa-721-economy-pass-design.md`
**Roadmap:** HPA-717
**Branch:** `docs/hpa-721-economy-pass`
**Inspected base:** `main@b50c90c3788eed3a00e757593d9df13ab8534e4a`
**Delivery:** One ticket, **one draft PR** throughout design review, constants, measurement, tests and final review. No second implementation PR.
**Current checkpoint:** Design and plan only. **Do not implement/tune constants before Hapadona signs off the proposed targets.** No tests, sweeps, or economy gains are asserted by this document.

## Review gate 0 — Approve target definitions (blocking)

- [ ] Have Hapadona explicitly approve or edit the design's proposed targets: T3 ≥40/50 and median day 90–150 **per archetype**; T5 ≥25/50 **per archetype**; pooled T4/T5 median spacing ≥30 days; median peak book-value max/min ≤3×; idle 0 claims/earned-unclaimed; all HPA-502 Gate A and scenario guardrails.
- [ ] Confirm whether *zero same-day* T4/T5 pairs is a strict condition or an informational diagnostic in addition to the median gap. The issue says both “about 30 days” and “no same-day stacks”; do not silently conflate them.
- [ ] Record approval and any negotiated exception on this PR **before changing runtime numbers**. If no approval, leave the PR documentation-only.

**Gate:** approved numeric criteria and semantics; no constants changed beforehand.

## Step 1 — Freeze exact before measurements

- [ ] Refresh `main` and confirm HPA-720's electronics chain is already merged. If main moved after the inspected SHA, record the new base and check for overlapping economy changes; keep the same PR.
- [ ] Read `docs/balance/after.md` Gate A table, `progression-calibration.md` §10, `rail-throughput-calibration.md`, `tuning-changelog.md`, `leveling.ts` header, `progression.ts` and existing scenario medal tests. Keep the four historical calibration Markdown files frozen.
- [ ] On the untuned implementation base run the unchanged full official **50 seeds × 4 archetypes × 365 days** progression + idle sweep, the **450-run** Gate A sweep and the seed `20260503` convenience reference trace. Run current scenario reference and no-action cases; preserve their exact results.
- [ ] Store generated JSON and trace in ignored `docs/balance/generated/` (do not commit thousands of rows). Pin source SHA and each exact CLI command in the later `economy-pass.md`. Double-run a representative slice byte-for-byte before asserting determinism.

Use the exact official seeds (no `…` placeholder):

```sh
SEEDS=20260501,20260502,20260503,20260504,20260505,20260506,20260507,20260508,20260509,20260510,20260511,20260512,20260513,20260514,20260515,20260516,20260517,20260518,20260519,20260520,20260521,20260522,20260523,20260524,20260525,20260526,20260527,20260528,20260529,20260530,20260531,20260532,20260533,20260534,20260535,20260536,20260537,20260538,20260539,20260540,20260541,20260542,20260543,20260544,20260545,20260546,20260547,20260548,20260549,20260550

bun tests/balance/progressionRun.ts --seeds "$SEEDS" --days 365 --output docs/balance/generated/hpa-721-progression-before
bun tests/balance/run.ts --seeds "$SEEDS" --days 365 --bots idle,retail-steady,advisor --output docs/balance/generated/hpa-721-gate-before
bun tests/balance/progressionRun.ts --seeds 20260503 --days 365 --archetypes convenience --trace docs/balance/generated/hpa-721-reference-20260503-before.json
```

**Gate:** measured before values; HPA-720's 154/200 and 44/200 historical totals are *context*, not blindly substituted for a same-commit baseline.

## Step 2 — Identify actual losses and tune minimal constants

Proceed **only after Gate 0**; use a small explicit seed subset for cheap initial trials, but validate final values against the full fixed matrix.

- [ ] **Expansion:** inspect per-store `DailyStoreReport` / daily operating-income evidence and cash flows, plus store costs. Compare an otherwise equivalent next-store decision against not opening it; disclose setup payback and whether the extra outlet merely divides city demand. Try the smallest relevant existing changes in `state.ts` (`getExpansionSetupCost`) and `staffing.ts` (base salaries/requirements) that improve contribution. Preserve valid seeded salary variance and staffing coverage. Avoid arbitrary fee waivers.
- [ ] **Cities and levels:** evaluate cross-city demand and store revenue with the existing `worldCatalog.ts` demand profiles and `leveling.ts`'s non-milestone revenue multiplier. Never accidentally grant milestone levels 4/7/10 the non-milestone bonus. Avoid a new city/demand system or changed stock pool semantics.
- [ ] **Industry:** with actual delivered-local retail units, compare import-spend savings against all recipe costs, building overhead, transfers and warehouse/rail costs. Tune only necessary `industry.ts` numbers (`operatingCost`, `dailyOperatingCost`, material `importCost`/`localValue`). Do not claim profitability based on `localValue` alone and do not retune the rail cap by default. Check electronics, convenience, grocery and boutique chains, not just one success seed.
- [ ] **Ladder last:** if the resulting economy still produces same-day T4/T5 stacks or unattainable thresholds, propose exact numeric `progression.ts` goal/reward changes **with measured failed-goal evidence** and re-obtain approval for material departures. Keep the contiguous-prefix claim rule; do not add cooldown timers, new goal types or new player actions.
- [ ] After each coherent change group, note before → proposed → observed deltas. Reject lever changes that improve a headline rate but violate forecast, boundedness or scenarios. Do not duplicate pricing logic in UI or harness.

**Gate:** preliminary runs show all archetypes trending toward reachability *through viable decisions*, and the exact proposed final constants are independently reviewable. Do not claim an official pass based on a pilot.

## Step 3 — Official full sweep and evidence

- [ ] Re-run `progressionRun.ts` on all 50 seeds × four archetypes, plus the **same** idle controls, using `--output docs/balance/generated/hpa-721-progression-after`. Run `run.ts` on the 450 Gate A cases using `--output docs/balance/generated/hpa-721-gate-after`. Re-run the 20260503 convenience trace with the `after` filename.
- [ ] Use the existing `ProgressionCalibrationReport.runs` rows to aggregate per-archetype reach rates, T3 median/p10/p90, pooled T4 and T5 medians, paired claim gaps, same-day T4/T5 counts and peak-book-value ratios. Add the smallest deterministic pure analyzer/test under `tests/balance/` **only if needed**; do not build a generic parameter search tool.
- [ ] Re-run at least one output twice from identical source/flags and compare serialized artifacts byte-for-byte. Never commit timestamps, elapsed wall times, machine paths or generated megabyte traces into the report.
- [ ] Commit **new** `docs/balance/economy-pass.md`: comparable before/after tables, seeds/commands/source SHAs, decision/economy justification, all target results (including misses), four-archetype breakdown, Gate A 5/5, idle evidence, 20260503 claim days, and named scenario re-pins.
- [ ] Append the full numeric lever list and rationale to `docs/balance/tuning-changelog.md`; do not edit historical `baseline.md`, `after.md`, `progression-calibration.md` or `rail-throughput-calibration.md`.

**Gate:** final settled combined numbers meet all approved criteria, or each miss has a documented root cause and explicit Hapadona acceptance.

## Step 4 — Focused tests and scenario re-pins

- [ ] Add focused deterministic checks around each **changed** existing cost/catalog rule, including the milestone revenue exclusion, valid staffing, industry costs and authored progression thresholds. Assert seed-order independence and nonmutation where applicable; prefer existing test modules over broad new fixtures.
- [ ] Keep the progression bot, idle bot and seed matrix stable to preserve before/after comparability. If a genuine harness bug needs correction, disclose it and remeasure both sides with the *same* fixed code.
- [ ] Re-run scenario reference and no-action pairs for all affected scenarios (including first-profit, local-lifeline, fresh-market, rival-next-door, two-city-supply-run and the advanced pack when their economy inputs changed). Re-pin only affected medals/assertions to observed outcomes and preserve challenge intent. Record the old/new result per scenario in `economy-pass.md`; no silent blanket threshold inflation.
- [ ] Run `bun run check`, `bun run lint`, `bun run test:unit -- --run`, the balance sweeps and the affected Playwright E2E tests. CI must pass when the PR is marked ready. No save migration or new persistence field is expected.
- [ ] If any displayed numeric copy changes, update all three locales (`en`, `ja`, `zh-Hant`) and existing message tests.

**Gate:** deterministic results, unchanged harness semantics, tests and scenario evidence align with the final values.

## Step 5 — End-to-end player acceptance (macOS and Windows)

- [ ] On **macOS** and **Windows** builds/browsers supported by Serpens, start fresh seeded sandboxes for the four archetypes. Verify an affordable store opens with the intended setup-cost preview; hires/payroll and upgrades charge the shown values; local output actually enters retail stock and changes cash consequences; claims T1–T5 appear with accurate goal text/rewards, rather than jumping tiers due to stale copy.
- [ ] Visually check the existing gameplay HUD, store/industry detail views, progression ladder and end-of-day reports on both platforms. **HPA-721 has no attached UI mockup**; retain the currently approved Vitrine/HPA-304 layout and compare to its mockups if available. No redesign is authorized. Check that text truncation, number formatting and controls remain usable after any changed values.
- [ ] Use the fixed-seed CLI and affected Playwright flows for the 365-day reachability guarantee; manual sessions are smoke checks, not substitutes for 200-run statistical evidence.
- [ ] No separate iOS app scope is identified for this ticket; Android and Linux need no manual acceptance (CI coverage only).

## Completion / merge criteria

1. Approved targets or signed, documented exceptions are linked in the same draft PR.
2. Per-archetype Tier 3 ≥40/50 with median day 90–150, Tier 5 ≥25/50, Tier 4-to-5 median gap ≥30 days, and peak-book-value median ratio ≤3× (or accepted deviations) are measured for exactly the official first-year matrix; same-day tier stacks are disclosed.
3. Idle = 0 claims and 0 earned-but-unclaimed in all 200 controls; Gate A passes 5/5 and scenario reference/no-action intent is retained.
4. Seed `20260503` convenience claim dates and failing-goal evidence are in `docs/balance/economy-pass.md`; every changed number and scenario re-pin appears in the tuning changelog/report.
5. Check, lint, full unit tests, affected E2E, and macOS/Windows end-to-end visual smoke pass. No new subsystem, migration, art or UI redesign.
6. **One PR only:** design, code, measurements and acceptance evidence are added to `docs/hpa-721-economy-pass` before marking the existing draft ready.
