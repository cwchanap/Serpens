# HPA-721 Tier 5 Operating Month Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Execute task by task without commits. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a profitable post-Tier-4 operating month for new Market Leader claims.

**Architecture:** Add one report-backed goal through the existing metric, progression and objective-panel path. Reuse the same evaluation for claim, display, save validation and the passive balance trace.

**Tech Stack:** TypeScript, Svelte 5, Bun, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-17-hpa-721-tier5-operating-month-design.md`

## Global Constraints

- Implement on the restored baseline (`95ff7dfb5be9ddc04241029aeb01286eeba3002c` at planning), not R2. Snapshot and preserve pre-existing dirty files.
- Keep Tiers 1-4, the other two Tier-5 goals, claim order, rewards, finance, manager/bot policy, economy values, manufacturing, scenario rules/scoring and all acceptance thresholds unchanged.
- Use existing reports and receipts; no new save fields or migration. Preserve the sandbox save loader's earned-claim checks.
- A complete window is 30 consecutive reports. Both signed sums must be strictly positive. No partial credit, timer, rounding, or alternative financial field.
- Do not rewrite frozen evidence, run a candidate/official matrix, run component arms, or take commit, push, PR or deployment actions under this plan.
- Do not stage files. Pass the no-commit constraint to every implementer and review each task's owned uncommitted diff against its pre-task snapshot. Do not use a commit-based review package.

## Review Focus

1. An all-eligible company without a Tier 4 receipt claims only through Tier 4, even with profitable pre-claim history.
2. Missing or duplicated report days do not create a complete window. The codec already rejects non-finite financial fields.
3. Cash-positive/COGS-negative and cash-negative/COGS-positive windows both fail; zero fails too.
4. Later losses do not undo a qualifying month, and later profits cannot validate a backdated Tier 5 receipt.
5. The player sees the actual financial requirement, and the trace can distinguish it from the two existing goals without changing the acceptance evaluator.

### Task 1: Report Metric And Shared Claim Rule

**Files:** `src/lib/scenarios/{types,metrics,metrics.spec}.ts`,
`src/lib/game/{progression,progression.spec}.ts`, and the translation key in
`src/lib/i18n/messages/{en,ja,zh-Hant}.ts`.

**Interfaces:** Add `ScenarioMetricQuery` member
`{ metric: 'post-tier4-profitable-operating-month' }`. Register it for
`run-to-date`, non-product-scoped, decimal, neutral `0`, with the ordinary
state-completeness convention: having no complete qualifying month is an
actual of `0`, not an incomplete query for the run-to-date total.
`evaluateMetric` returns actual `0` or `1` and no contributor IDs or the two
endpoint report IDs, respectively. Add Tier 5 goal
`market-leader-profitable-operating-month`, key
`progression.goals.marketLeaderProfitableOperatingMonth`, comparator `gte`,
target `1`, `RUN_TO_DATE_WINDOW`. No change to the claim loop.

- [ ] Add RED metric tests using Tier 4 claim on day 100. A report day 99
      can never contribute. With days 100-128 on game day 129, assert
      `actual === 0`. With days 100-129 on game day 130, assert
      `actual === 1` and contributor IDs `['report:100', 'report:129']`.
      No Tier 4 receipt yields `0` even with those same reports.
- [ ] Add RED metric cases with 30 complete reports of cash/income
      `(1, -1)`, `(-1, 1)`, `(0, 1)`, `(1, 0)` and large positive financing
      cash flow; all yield `0`. A month with `(2, 2)` on day 100,
      `(-1, -1)` on day 129 and zero on the other days yields `1`.
      To exercise same-window logic, give 61 reports with
      `(1, -2)` for days 100-129, `(0, 0)` for day 130, and `(-2, 1)` for
      days 131-160; no window qualifies.
- [ ] Add RED cases with day 115 missing or with two versions of day 129;
      neither qualifies using days 100-129. Duplicating the last day checks
      that the first occurrence cannot slip through before the scan sees its
      duplicate. Include clean days 130-159 after the gap to prove recovery;
      make days 116-129 losing enough that no bridging window passes.
      A passing days 100-129 window survives later losing reports, but is
      ineligible as evidence for a Tier 5 receipt backdated to day 129.
      A report equal to `game.day` is not yet closed.
- [ ] In `progression.spec.ts`, assert exactly the intended extra Tier 5
      goal. Convert the existing all-tier case to claim Tier 4 on day 100
      despite profitable prior reports and both old Tier 5 goals passing.
      With 29 eligible reports, claim remains unchanged. With the 30th,
      append one Market Leader receipt on day 130, one system notice and
      one store slot; repeat returns the same state. Parameterize a missing
      seventh store and a below-150,000 peak to prove neither was replaced.
- [ ] Run `bun run test:unit -- --run src/lib/game/progression.spec.ts src/lib/scenarios/metrics.spec.ts`;
      expect the new metric calls to throw a `TypeError` at
      `registration.supportedWindows` because the metric is not registered
      yet. The catalog and claim assertions fail separately on the old rule.
      Do not fix the fixtures to make RED pass.
- [ ] Implement the metric in `metrics.ts` as a bounded-width rolling sum
      over the existing sorted report input. Start at the Tier 4 receipt;
      stop before the earlier of the game day and the Tier 5 receipt (if any).
      Reset on a gap. In that same pass, skip and reset on any report whose
      sorted predecessor or successor has the same day; no counting pass.
      Return the first qualifying window. Reuse `reportIds` for the two
      endpoints and avoid a fresh sort or 30-report slice per candidate.
- [ ] Add the goal and translations. Use the English label below and translate meaning in Japanese and
      Traditional Chinese. Do not change any previous label or scenario
      definition.

  `Complete a 30-day operating month after Multi-City Operator with positive operating cash flow and operating income`

- [ ] Repeat the focused command plus `src/lib/scenarios/validation.spec.ts`;
      require all tests to pass, including registry parity.

### Task 2: Dashboard, Save Boundary, And Passive Trace

**Files:** `src/lib/components/game/SandboxProgression.svelte.spec.ts`,
`src/lib/persistence/saveCodec.spec.ts`,
`tests/balance/progressionClaimTrace{,.spec}.ts`. Production component and
codec should not require edits: the existing objective and earned-claim
projections already consume the goal list. Before modifying the Svelte spec,
follow the workspace's Svelte MCP and editor instructions.

**Interfaces:** `ProgressionClaimEvaluation.marketLeaderOperatingMonthPassed:
boolean` records the native condition result from the same pre-claim state as
the other actuals. Locate its catalog goal by id and call `evaluateCondition`;
no observer state or runtime probe changes. Native summary blocker IDs are
already derived from `evaluateProgression`.

- [ ] Extend the dashboard spec to render a Tier-4-complete game with the
      other two Tier 5 goals passing and only 29 eligible reports. Assert
      the Market Leader heading, the exact new English label and the
      `Actual 0 · Target 1` row. Render a qualifying month before store seven;
      assert the same row has `Actual 1 · Target 1` and the existing store
      goal remains pending.
- [ ] Add `validateSaveRecord` coverage under sandbox earned-claim
      invariants. Build a current-schema game with the pre-change ladder
      goals satisfied, Tier 4 day 100, and genuine report shape for days
      100-129. Round-trip a day-130 Tier 5 receipt and verify it remains
      exactly-once. In independent variants, change only the Tier 5 receipt
      to day 129, or keep it on day 130 and set the eligible reports' operating
      income to zero (no qualifying window anywhere). Both reject with
      `no longer satisfies its goals: market-leader`. Use the same decodable
      fixture for the passing and failing cases.
- [ ] In the trace spec, compare the new field to the native metric on a
      pre-claim observation without Tier 4 and one with the qualifying
      window (fixtures using the native collector). Assert false/true
      and confirm the static ladder exports the new goal. Add the trace
      field and run the observer suite. Do not repin unrelated outcomes.
- [ ] Run the affected integration and correctness checks:

  ```bash
  bun run test:unit -- --run \
    src/lib/game/progression.spec.ts \
    src/lib/scenarios/metrics.spec.ts src/lib/scenarios/validation.spec.ts \
    src/lib/scenarios/runtime.spec.ts \
    src/lib/persistence/saveCodec.spec.ts src/lib/persistence/scenarioCodec.spec.ts \
    src/lib/i18n/scenarioCopy.spec.ts src/lib/components/game/SandboxProgression.svelte.spec.ts \
    src/routes/gameRouteController.spec.ts \
    tests/balance/progressionClaimTrace.spec.ts tests/balance/progressionCalibration.spec.ts \
    tests/balance/progressionBots.spec.ts tests/balance/progressionRun.spec.ts
  bun run check
  bun run lint
  git diff --check
  ```

  Require no failures or skips. Keep scenario teaching and score pins intact.
  Confirm the diff does not touch acceptance thresholds, bot or manager
  policy, economy values, receipt schema, or history files.

- [ ] Report what passed and any save limitation separately from candidate
      acceptance. Any live save compatibility work or economy replay is a
      separate decision. Follow the Approved Gates note in
      `docs/balance/economy-pass.md`: report the rule-enforced gap separately
      from financial-month results and Tier 5 reach. Using the rule for
      official progression acceptance is pending explicit sign-off in PR #73.
      Do not count pre-existing receipts or the R2 overlay as new evidence.
