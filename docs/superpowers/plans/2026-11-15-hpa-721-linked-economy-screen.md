# HPA-721 Linked Economy Basis Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the measurement recipe at HEAD, run the approved temporary
economy screen, then restore gameplay without claiming adoption.

**Architecture:** Keep the shared constructor and engine. Extend the existing
synchronous probe for command capture; summarize each run in memory with existing
calibration, diff and chain helpers. Validate the complete two-mode recipe against
frozen references before applying any candidate; lock its source afterward.

**Tech Stack:** TypeScript, Bun, Vitest, existing pure game/scenario transitions.

**Spec:** `docs/superpowers/specs/2026-11-15-hpa-721-linked-economy-screen-design.md`

**Review:** Revised for the human's eight findings and "Ship with changes"
verdict. The reviewed v1 is preserved at
`docs/balance/generated/hpa-721-linked-screen-plan-review-v1.md`.
Lead authors measurements/calibration; delegate ordinary app implementation and
check execution. No additional numeric design choice is delegated.

## Global Constraints

- HEAD is `3250caea0cc70eda4d592ad4406fe8fdf5c75cb1`; preserve existing dirty docs.
- Import/shelf: water3/8, snacks12/18, produce6/11, pantry8.5/16.
- Expansion reorder/target: water700/700, pantry1000/1000, produce180/180.
- Free quantities remain water84/snacks70/produce140/pantry154; founding defaults unchanged.
- Grocery baseRent165->120; setup tile-rent coefficient2.5->1; Harbor snack demand1->1.4 only.
- No recipe/material/throughput/rail/premium-price/wage/start-money/loan-rule/bot/ladder change.
- No schema, saved fields, migration, dependency, UI, live player app, save writes or deployment.
- Replay captured store-opening financing; use the 2,000 reserve only for subsequent startup staffing and local construction, not a replacement opening-loan calculation.
- Capture source patches/hashes, HEAD/dirty status, commands and exit codes; use exclusive new `hpa-721-linked-screen-*` artifacts.
- No source changes during measurements; source/helper hash changes invalidate the locked run.
- No later strategic actions, rescue borrowing, discretionary repayments or inventory liquidation.
- All4 store mature operating gaps>0 and gift-debited funding-neutral365 gaps>0; both primary local365 gaps>0 with productive-flow evidence.
- No 90-day payback gate. Secondary cash viability and full four-archetype pacing remain unresolved.
- No medal/goal/guard softening, official matrix, adoption, commit, push or external action.
- A failed semantic guard or recipe assertion skips dependent runs and reaches restoration/reporting.
- Complete candidate-active work and restoration before any optional human-feedback checkpoint.

## Review Focus

- Higher gift values must not create extra free stock or earned cash; Task3 tests quantities/book value and Task2 debits actual gifts.
- Live/projected and non-Harbor defaults must agree without RNG mutation; Task3 tests shared initialization and store-10.
- Saved explicit prices and scenario teaching must survive; Task3 tests untouched overrides and all14 existing reference/no-action traces, including two-city-supply-run.
- Opening/staffing loans and pre-snapshot finance must not be conflated; Task2 proves captured-prefix replay, baseline none equality and cash conservation.
- IDs, mid-window capital and spoilage must not fabricate local benefit; Task2 checks identity, actual command cash deltas and same-SKU stock conservation.

---

### Task 1: Probe Context, Existing Noninterference Test

**Files:** `tests/balance/bots.ts:659-664,730-778`;
`tests/balance/progressionClaimTrace.spec.ts:55`.

**Interfaces:** preserve runProgressionBot's signature. Add only optional fourth
ProgressionClaimProbe argument
`Readonly<{ beforeCommand: GameState; command: ScenarioCommand }>`.
Private claimNewlyEarnedTiers forwards it; runProgressionCommand supplies original
game/command. Other evaluations receive undefined. Preserve synchronous/void,
nested-probe restoration, throwing-probe cleanup and action-index timing.

- [ ] Lead extends existing `leaves the run byte-identical: digest, RNG and summary match an untraced run`.
      Wrap/forward collector.probe, require observed command context and an undefined
      daily context. Replay an applied observed command through applyGameCommand and
      compare its game to callback pre-claim `before`; assert input unchanged.
      Keep all existing digest/ledger/RNG/summary checks; no new five-day comparison.
- [ ] RED:
      `bun run test:unit -- --run tests/balance/progressionClaimTrace.spec.ts -t 'leaves the run byte-identical'`.
      Expect missing-context failure, not imports/types.
- [ ] Lead adds forwarding only; delegate identical GREEN command, then
      `bun run test:unit -- --run tests/balance/progressionClaimTrace.spec.ts tests/balance/progressionRun.spec.ts tests/balance/chainEvidence.spec.ts`.
      Require zero failures; save full output and observer-only patch/hashes.

### Task 2: Two-Mode Recipe and HEAD Preflight (Lead-Authored)

**Files:** create ignored
`docs/balance/generated/hpa-721-linked-screen-measure.ts` and
`docs/balance/generated/hpa-721-linked-screen-scenarios-runner.ts`.

**Interfaces:** measure.ts has only `capture` and `components`; each accepts the
fixed phase label `head` or `candidate` for artifact naming/reference validation.
Seeds03/15, four archetypes,365 days and actor/math rules are identical across
phases. Capture persists native summaries/traces/chain evidence and necessary
fork states/command schedules only: no full terminal runs, Sets or render/reload.

- [ ] Reuse archived stock-cash.ts capture/replay method without rerunning bots
      to recapture states. Collect each of8 progression runs once with the probe and
      existing claim collector; run8 idle controls. Build the native report using
      buildProgressionCalibrationReport; call evaluateProgressionPacing and enforce
      the existing progressionRun.ts idle control. Partial coverage stays diagnostic.
- [ ] While each result remains in memory, build its claim trace and call
      summarizeChainEvidence for water/snacks or produce/pantry as applicable.
      Include actual instances, recipe/fixed/import costs, routes, construction
      dates, deliveries/sales/waste and separately disclosed warehouse/shared costs.
      Never sum overlapping per-product scopes or call secondary evidence cash payback.
- [ ] Persist four day1 Harbor pre-finance forks and exact command schedules;
      assert JSON round-trip deep equality. Replay/verify the source select command,
      allowing its captured no-op. The fork is AFTER that selection/claims, BEFORE
      investment financing, matching the archive. Only opening replays its exact
      captured borrow/open commands and production claims. Do not re-quote its loan.
- [ ] For required staffing after opening, fund the positive shortfall to actual
      upfront staffing cost+2,000, rounded upward to1,000, term84, only if engine
      assessment covers it. Current hireCandidate has zero upfront fee: do not invent
      one. Reuse exported staff()'s lexical required hire/assign loop. No-opening
      inherits neither this loan nor entrant goods/staff.
- [ ] Copy summarize()/windows() verbatim from archived
      hpa-721-expansion-stock-cash.ts and record source/copy hashes. Use them unchanged
      for store arms: they already reconcile pre-snapshot finance and capture90/365
      from one trajectory. Assert initial.day1 and reports90/365 boundaries.
- [ ] Local pairs remain conv/water03 and groc/produce03. Legally replay common
      day1 retail setup/delegation in a fresh createFoundingGame, without industry or
      source borrowing. Complete required startup staffing before cloning. This is
      a controlled, fully staffed two-store fixture, not an on-policy snapshot.
      Block unaffordable setup; never compensate cash or remove buildings.
- [ ] Local alone replays observed primary entry commands on captured days until
      raw input reaches processing and finished goods reach retail. Entry must be
      observed before secondary construction. Include all raw/warehouse/processor/
      rail/access costs; no later chain expansion. Assert each replayed created
      building's captured id/type/city/tile; block mismatch, never remap IDs or layout.
      Replay exact rail objects (current bot waypoints are empty).
- [ ] Local construction uses live cost+2,000 shortfall funding, rounded1,000,
      term84, with full engine assessment/command success. No loan capping, cash
      injection, later rescue or strategic commands. Ordinary simulateDay automation
      continues for both arms through absolute365; snapshot after90 and365.
- [ ] Local's scheduled construction needs an explicit accounting extension:
      reconcile end.cash-initial.cash to report net changes minus already-applied
      pre-snapshot finance PLUS observed nonfinancing command cash deltas.
      Borrowing is already in reports; do not add it twice. Store reconciliation
      remains the untouched archived function. Verify this local-only term at HEAD.
- [ ] Store gap is `(opening.cash-opening.principal) - (none.cash-none.principal) - actualOpeningGiftImportValue`.
      Local gap is the funding-neutral difference without a common gift debit.
      Report90/365 and days61-90 operating deltas, payroll/imports/interest/arrears,
      inventory and investment/funding prefixes. Never liquidate inventory.
      Check same-SKU physical conservation and disclose a conservative local-sales
      bound max(0,local deliveries-all waste-all shrink-closing retail units).
      Blocked gaps are null, never zero-valued passes.
- [ ] Reuse c7-scenarios-runner.ts's constants/helpers/replay loops verbatim.
      Change only generated helper/output paths to phase-specific exclusive writes;
      never overwrite historical c7-scenario-replay.ts. Preserve/expose slice hashes.
      The existing runtime suite, not a new scenario evaluator, remains the guard.
- [ ] Run before ANY candidate source change:
      `bun docs/balance/generated/hpa-721-linked-screen-measure.ts capture head`
      and `bun docs/balance/generated/hpa-721-linked-screen-measure.ts components head`.
      Require8 HEAD progression rows to match the frozen full baseline's selected8
      via diffProgressionArtifacts with all4 archetypes require-identical.
      Compare only same-shaped pilot-config/runs views here: full baseline's200-run
      idle aggregates cannot be filtered. Preserve the actual HEAD8+8 report.
- [ ] Assert four captured preFinance states deepEqual first-expansion states in
      hpa-721-expansion-stock-cases.json, and every no-opening90/365 summary deepEqual
      `.none` in hpa-721-expansion-stock-cash-reconciled.json. All4 archived openings
      are day1 Harbor with zero opening loans. No different day/seed substitution.
      Exercise local replay/accounting before lock; unexercised required paths are
      not a validated recipe. HEAD economics are preflight, not a tuning verdict.
- [ ] Run
      `bun docs/balance/generated/hpa-721-linked-screen-scenarios-runner.ts head`;
      retain all14 rows. Fix recipe/schema bugs only before candidate; repeat only
      affected preflight work under new artifact prefixes. Lead reviews evidence
      and freezes exact recipe/helper hashes after successful preflight.

### Task 3: Candidate, Failure Inventory, Reviewed Pins, GREEN

**Files:** app `src/lib/game/{products,archetypes,worldCatalog,state}.ts`;
`src/lib/scenarios/catalog.ts`; tests
`src/lib/game/{state,placement,retailSupply,stock,companyBookValue}.spec.ts`
and `src/lib/scenarios/runtime.spec.ts`.
Other guard-pin files may change only after lead classification; every changed
file enters the pre-byte/hash manifest and reversible candidate patch.

**Interfaces:** existing buildStore/getExpansionSetupCost signatures and callers.
Nonfounding identity remains input.id !== 'store-1'; preserve lots/RNG/schema.

- [ ] Snapshot all candidate/guard files BEFORE edits, preserving Task1
      instrumentation and existing dirty docs separately.
- [ ] Add HPA-721 linked economy assertions: exact expansion targets/original
      free quantities; gift values1,092/2,149; paid fills3,180/9,580; founder defaults
      water30/108, pantry55/198, produce50/180, snacks25/90 unchanged.
      Test explicit saved prices untouched, live/projected/non-Harbor equality,
      input/RNG immutability and store-10. Inline zero-demand green rent2365 fixture
      quotes13,435 convenience/13,525 grocery; no ignored-artifact test imports.
- [ ] RED:
      `bun run test:unit -- --run src/lib/game/state.spec.ts src/lib/game/placement.spec.ts src/lib/game/retailSupply.spec.ts -t 'HPA-721 linked economy'`.
      Require old-value failures, not broken imports/fixtures.
- [ ] Delegate only approved app parameters and authored price offsets:
      first-profit start3->5/reference6->8; local-lifeline start6->8/reference4->6;
      fresh-market produce6->11; rival-next-door start6->11/reference7->12.
      two-city-supply-run gets no new price offset but IS affected by catalog prices.
- [ ] Repeat new assertions; run the FULL focused guard set below against the
      candidate BEFORE repinning. Preserve every failure as the RED inventory.
      Constant/arithmetic/fixture-budget pins require lead-authored changes included
      in the candidate patch. Semantic failures stop the candidate. Never blanket
      repin all exact numbers or relax FIFO/spoilage/rail/forecast/rounding semantics.
- [ ] In particular preserve companyBookValue's negative-zero purpose by changing
      its synthetic budget when necessary, not its expected zero. Pantry8.5 and
      brand cost12/10.08 are changed inputs, not permission to weaken behavior.
- [ ] Run the unchanged scenario runner with phase candidate; retain all14 rows.
      Lead reviews those and actual guard failures before authoring numeric pins.
      Preserve reference gold and no-action separation, including two-city-supply-run.
      No scenario policy/stock/money/goal/medal/day-limit changes.
- [ ] GREEN after lead-reviewed pin edits: rerun affected failing files, then the
      focused set; require zero failures and unchanged1.2/2.0/boutique2.4 guards.
      Lead reads full app/test diff and saves exact reversible patch/file hashes.
      No measurement source change is allowed to repair candidate results.

**Focused guard command:**
`bun run test:unit -- --run src/lib/game/products.spec.ts src/lib/game/worldCatalog.spec.ts src/lib/game/state.spec.ts src/lib/game/placement.spec.ts src/lib/game/retailSupply.spec.ts src/lib/game/stock.spec.ts src/lib/game/retailUnitEconomics.spec.ts src/lib/game/companyBookValue.spec.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts src/lib/scenarios/runtime.spec.ts`.

### Task 4: Locked Candidate Run, Native Diff, Restoration

**Files:** new generated evidence; append verdict to balance report/changelog;
restore Task3 candidate files only.

- [ ] Verify locked recipe/helper/source hashes; run the unchanged
      `bun docs/balance/generated/hpa-721-linked-screen-measure.ts capture candidate`
      then `bun docs/balance/generated/hpa-721-linked-screen-measure.ts components candidate`.
      Use native report/pacing/idle functions and diffProgressionArtifacts against
      the validated HEAD8+8 report. Do not synthesize filtered idle aggregates or
      demand premium identity when the shared setup quote intentionally changes.
- [ ] Run
      `bun run balance --seeds 20260503,20260515 --days 365 --bots idle,retail-steady,advisor --output docs/balance/generated/hpa-721-linked-screen-gate`.
      Retain18 diagnostic rows, not an official450-run PASS. No duplicate progression
      sweep or separate chain CLI reruns for presentation.
- [ ] Lead judges four store and two primary local gaps/productive flows plus
      native pacing/blocker/paired-gap/peak/idle differences. Secondary evidence
      remains diagnostic. Missing/unfinished/cash-negative cases are not waived.
      A positive component screen is insufficient without a credible full-goal path.
- [ ] On error, stop dependent jobs; do not repair the locked recipe after seeing
      candidate numbers. Preserve failures, reverse-check/apply only candidate patch,
      and report any conflict instead of overwriting concurrent edits.
- [ ] Verify exact pre-candidate hashes; keep validated Task1 instrumentation
      identified separately. Rerun restored focused guards and Task1 suites,
      recording actual counts/logs/exits rather than historical279/285 totals.
- [ ] Append source/dirty hashes, exact tuning, coverage, verdict and unresolved
      blockers to economy-pass.md/tuning-changelog.md. Preserve historical outputs.
      Force changed-doc Prettier with --ignore-path /dev/null, inspect its full diff,
      and run whitespace checks. No commit/push/PR/Linear action.
- [ ] Final report separates preflight, temporary evidence and official acceptance;
      state full check/lint/unit/E2E, official matrix and macOS/Windows smoke not run.
