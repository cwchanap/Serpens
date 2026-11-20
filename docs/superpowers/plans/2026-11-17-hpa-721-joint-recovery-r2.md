# Joint Recovery R2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans after the user selects an execution method. Implement this plan task-by-task; steps use checkbox syntax.

**Goal:** Evaluate the approved fixed R2 bundle without adopting it, and restore all temporary gameplay/test edits.

**Architecture:** Reconstruct the pinned R1 runtime/fixtures, then apply the approved 33-field delta manifest. Reuse native commands, progression observers and reconciled cash accounting. The lead authors all measurement/configuration/verdict artifacts; mechanical execution can be delegated.

**Tech Stack:** TypeScript, Bun, Vitest, Python 3 and the existing deterministic game.

**Spec:** `docs/superpowers/specs/2026-11-17-hpa-721-joint-recovery-r2-design.md`.

**Approval:** Exact values and bounded trial approved on 2026-11-17. User reviewed this plan, selected Subagent-driven execution and requested continuation. Execution progress lives in this plan's SDD ledger.

## Global Constraints

- Restored HEAD: `95ff7dfb5be9ddc04241029aeb01286eeba3002c`; preserve the 475 source/test preimages, existing dirty docs and ignored evidence.
- Authoritative numeric manifest: `docs/balance/generated/hpa-721-joint-recovery-r2-final-design.json`, SHA-256 `ee6cf95f4848ec243b3cfa60eb629c7155fb7354c2301c307868f0a7d6680e1d`. Never regenerate its values.
- Apply exactly 33 deltas relative to R1: five runtime files only (`products.ts`, `worldCatalog.ts`, `leveling.ts`, `industry.ts`, `rail.ts`); no unapproved value retry.
- Retain the full R1 treatment, founding quotes, revenue coefficient 0.05 and scenario offsets. Keep bot/manager policy, ladder/claim rules, scoring semantics/bands, exact First Profit pins, deadlines, recipe inputs/outputs, throughput, buffers and capacities unchanged. Other numeric observations may change only after lead review of all 14 native plays; frozen historical results remain immutable.
- Four archetypes, seeds 20260503/20260515, 365 days. Maximum annual matrix: eight progression + eight idle + conditional 32 component arms = 48. Fourteen short scenario plays run first.
- A partial matrix never earns official coverage or acceptance. No official sweep, full engineering/E2E/platform run, save certification, commit/push, new branch, deployment or PR action.
- New ignored artifacts use `docs/balance/generated/hpa-721-joint-recovery-r2-*`, exclusive writes and source/input/recipe hashes. Do not execute old R1 controllers or overwrite old artifacts.
- The lead owns analysis, financial/physical formulas, phase decisions and all measurement/threshold/recipe authoring. Freeze those artifacts before handing off execution; never delegate their composition.

## Review Focus

- Cheap capital must not bypass cash-only commands or change upgrade/refund/asset formulas: pin purchase boundaries and shared quotes in Task 1.
- Recipe-fee rounding must still charge flat cost when stalled and avoid fractional daily cash: pin full/half/clipped/stalled production in Task 1.
- Native L4 stock grants must not become manufactured receipts: pin inventory conservation and zero-local-sales counterexamples in Task 4.
- Retail upgrade cash and opening-day finance must not be omitted/double-counted: pin command/report reconciliation in Task 4.
- Missing rows, forks, entry commands or partial coverage must never be silently substituted or certified: pin phase/cardinality blockers in Tasks 2-4.

---

## File And Artifact Map

- Temporary runtime changes: the five R2 files above, on top of the recorded R1 diff. No runtime function/signature changes.
- Temporary tests: create `src/lib/game/hpa721R2.spec.ts`; extend existing industry placement/production and rail placement cases; adjust only lead-reviewed catalog arithmetic fixtures in affected specs.
- Lead-authored ignored recipes: `r2-control.py` (ownership/restore), `r2-structural.ts` (temporary test template), `r2-scenarios.ts` (native fixture extraction), `r2-measure.ts` and versioned `r2-screen-v2-measure.ts` (capture/self-check), `r2-scenario-evaluate.py`, versioned screen analyzers and conditional `r2-components.ts`/`r2-component-analyze.py`. Phase-specific/versioned files keep executed recipes immutable.
- Reference implementations, read-only: `hpa-721-joint-recovery-r1-control.py`, `-structural.ts`, `-scenarios.ts`, `-measure.ts`, `-analyze.py`; cash/staffing source `hpa-721-expansion-stock-cash.ts`.
- Retained evidence: before/preimage manifests, candidate diffs/locks, scenario rows, progression/idle reports and traces, eight forks, arm reports/command journals, analyses, logs/exits and restoration receipts.
- Final documentation only: this plan, R2 spec, `docs/balance/economy-pass.md`, `docs/balance/tuning-changelog.md`. Do not rewrite historical R1 results.

### Task 1: Reconstruct And Test The Exact Temporary Treatment

**Files:** Create ignored control/template/locks and temporary test; modify five runtime files plus affected test fixtures/numeric comments.

**Interfaces:** `python3 .../hpa-721-joint-recovery-r2-control.py prepare|apply-r1|install-test|apply-r2|record|restore|check`. Consume the approval/33-delta manifest; produce byte preimages and per-write owned postimages. Preserve every runtime export.

- [ ] **Step 1: Author and freeze the R2 ownership controller.**
      `prepare` verifies HEAD, all baseline hashes, the approval digest, archived corrected patch SHA `0ef2cd75774efdc3f0246e2e1cb1169c7cdecfcb528bc854cbbc353a73f5fd73`, frozen R1 inputs and helper hashes. Assert all new artifact/test destinations absent. Capture original bytes for every owned file; log current unrelated dirty paths without adopting them.
- [ ] **Step 2: Reconstruct final R1 once, not two overlapping patches.**
      `apply-r1` applies `hpa-721-joint-recovery-r1-review.diff`, SHA `907fadfa62594f075c23c6e72dc5bb315eafb9ca17baf3440a015d3461487dbe`, after `git apply --check`. Execution found this reaches R1's initial apply state, before its two archived fixture-only passes. The lead-authored `r2-recover-r1.py` completes those exact frozen passes without invoking historical writers. Do not reapply either earlier patch. Verify all 475 resulting tracked source/tests against `r1-pilot-lock.json`, excluding only its absent temporary `hpa721R1.spec.ts`.
- [ ] **Step 3: Add the named `HPA-721 R2` tests before changing R2 values.**
      Copy the lead-authored structural template to `hpa721R2.spec.ts`. Assert all 33 manifest values and unchanged recipe/building shapes outside that allowlist, using an R1 catalog snapshot captured in a separate process before R2 application. Add these behavioral assertions:

  ```ts
  expect([1, 2, 3].map(getStoreUpgradeCost)).toEqual([1000, 2000, 3000]);
  expect([1, 2, 3].map(getBuildingUpgradeCost)).toEqual([250, 500, 750]);
  expect([1, 2, 3, 4].map(getStoreRevenueMultiplier)).toEqual([1, 1.05, 1.1, 1.1]);
  expect([1, 2].map(getBuildingThroughputMultiplier)).toEqual([1, 1.2]);
  expect(PRODUCTS.gifts.importCost).toBe(14);
  expect(PRODUCTS.gifts.defaultSellingPrice).toBe(19);
  ```

  In `industryPlacement.spec.ts`, reuse `findWarehouseAnchor` and `createNewGame`: cash 49 rejects warehouse cost 50 unchanged; cash 50 builds it, leaving 0 and unchanged debt; warehouse capacity stays 200 at L1. Warehouses have no recipe and remain non-upgradable. In an independent fresh fixture, build only a native grain farm (unchanged cost 600): cash 249 rejects `upgradeBuilding`, cash 250 upgrades it to L2 leaving 0 and unchanged debt. Assert `getCompanyBookValue(upgraded).industryAssets === 850`. Do not manufacture an unsupported L2 warehouse.

  In `industryProduction.spec.ts`, reuse `makeProductionGame`, `makeIndustryCity`, `makeIndustryBuilding` for one level-1 gift workshop, no rails, no free inputs. Parameterize initial gifts/output/operating cost:

  ```ts
  // Starting gift buffer, output quantity, total operating fee.
  [
  	[0, 6, 2],
  	[67, 3, 2],
  	[68, 2, 1],
  	[70, 0, 1]
  ];
  ```

  Assert produced quantity, unchanged imported-input charging, integer operating cost and exact cash subtraction. The full buffer must import nothing.

  In `railPlacement.spec.ts`, reuse `makeCity`, `makeGame`, `straightRails`: build preview costs `2 * newCellKeys.length`; at quote-1 cash building is unchanged, at exact quote cash becomes 0. A four-cell level-1 segment costs 8 to upgrade and `getSegmentDemolishRefund(4) === 4`; capacity factor 10, cap 5, ordering and refund ratio 0.5 remain unchanged.

- [ ] **Step 4: Run focused RED against pinned R1.**
      `bunx vitest run src/lib/game/hpa721R2.spec.ts src/lib/game/industryPlacement.spec.ts src/lib/game/industryProduction.spec.ts src/lib/game/railPlacement.spec.ts -t 'HPA-721 R2'`
      Expected: intended old-price/cost assertion failures, never unresolved imports or invalid fixtures. Persist full log/exit before proceeding.
- [ ] **Step 5: Apply only approved R2 values and run the same command GREEN.**
      `apply-r2` uses exact-match replacements/literal patches for the manifest's five files and numeric comments. No multiplier framework or algorithm edit. Expected: all new tagged tests pass. Record owned postimages after each write; an exception still leaves a known reversible state.
- [ ] **Step 6: Run the affected guard inventory and review the entire temporary diff.**
      Run exactly:

  ```bash
  bunx vitest run \
    src/lib/game/hpa721R2.spec.ts src/lib/game/leveling.spec.ts \
    src/lib/game/products.spec.ts src/lib/game/worldCatalog.spec.ts \
    src/lib/game/state.spec.ts src/lib/game/placement.spec.ts \
    src/lib/game/stock.spec.ts src/lib/game/retailSupply.spec.ts \
    src/lib/game/retailUnitEconomics.spec.ts src/lib/game/companyBookValue.spec.ts \
    src/lib/game/industry.spec.ts src/lib/game/industryPlacement.spec.ts \
    src/lib/game/industryProduction.spec.ts src/lib/game/rail.spec.ts \
    src/lib/game/railPlacement.spec.ts src/lib/game/railShipping.spec.ts \
    src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts \
    src/lib/scenarios/runtime.spec.ts
  ```

  Expected: no failures/skips. The lead classifies failures before authoring any fixture change: catalog arithmetic may change; semantic assertions, scoring/medal bands, deadlines and exact First Profit pins may not. Other numeric observations require all 14 native plays and explicit lead review before any temporary fixture update, as the approved spec permits. Reject/restore on semantic failure rather than repin. Verify bot, ladder, claim, production and shipping algorithm hashes remain identical to pinned R1.

### Task 2: Capture And Judge The Fourteen Scenario Plays

**Files:** Lead authors `r2-scenarios.ts`, generated `r2-scenario-native.ts`, and `r2-scenario-evaluate.py`; retain raw/meta/evaluation outputs.

**Interfaces:** `bun docs/balance/generated/hpa-721-joint-recovery-r2-scenarios.ts`; `python3 docs/balance/generated/hpa-721-joint-recovery-r2-scenario-evaluate.py`. Produce `r2-scenario-evaluation.json` with `decision: PASS|REJECTED|BLOCKED`, reasons and `officialAcceptanceEvaluated: false`.

- [ ] **Step 1: Freeze extraction and semantic checks.**
      Reuse R1's exact `runtime.spec.ts` reference-constant/helper extraction, changing artifact prefix and source pins only. Retain all command schedules. Assert seven distinct IDs x reference/no-action exactly once, existing day limits and complete report/RNG capture. Self-check that a duplicate/missing row or a reference downgraded from gold blocks/rejects, never passes.
- [ ] **Step 2: Execute the fourteen native plays and analyze their frozen outputs.**
      Expected: First Profit day 4/682/bronze vs day 4/862/gold, with positive reference COGS operating income; every other reference completes gold, all no-action outcomes/medals preserve R1 teaching within unchanged deadlines. Record numeric drift without changing authoritative pins or score bands.
- [ ] **Step 3: Lead reviews the verdict and locks candidate inputs.**
      Only `PASS` plus Task1 guards permits Task3. Otherwise skip all annual phases and go directly to Task5 restoration. Freeze the complete candidate source, test fixtures, recipes, manifest, scenario outputs and accounting-body hashes before annual execution.

### Task 3: One Sixteen-Run Progression/Idle Screen

**Files:** Lead authors `r2-measure.ts` capture mode and `r2-screen-analyze.py`; use existing `tests/balance/{bots,progressionCalibration,progressionClaimTrace}.ts` unchanged.

**Interfaces:** `bun docs/balance/generated/hpa-721-joint-recovery-r2-measure.ts capture candidate`; `python3 docs/balance/generated/hpa-721-joint-recovery-r2-screen-analyze.py`. Produce progression/idle/raw/trace/pacing files, `r2-forks.json` and `r2-screening.json`; no extra capture trajectories.

- [ ] **Step 1: Author the capture/key/continuation assertions and self-check them.**
      Reuse R1's `runProgressionBot`/`runBot('idle', ...)` and trace collector. Exactly eight `(archetype, seed)` keys per bot, 365 reports each; last report day 365 and final game day 366. Capture applied native commands, before-command cash/debt, claims, SKU/market rows, build levels/buffers, deferrals and exact first day-1 pre-finance/opening states from these same runs.
      Before annual capture run `bunx vitest run tests/balance/progressionBots.spec.ts tests/balance/progressionRun.spec.ts tests/balance/progressionClaimTrace.spec.ts`; require all observer/noninterference checks pass without skips or harness-policy edits.
- [ ] **Step 2: Generalize R1 fork capture to all four archetypes.**
      Primary products: convenience `bottled-water`, boutique `gifts`, electronics `accessories`, grocery `produce`. Preserve slot/order and first-entry-before-secondary-contamination rules. Retain opening JSON round-trip/replay hashes and exact primary command schedule through first local raw consumption plus finished retail warehouse receipt. Record missing day1 opening/entry as blockers; never substitute another day or product.
- [ ] **Step 3: Execute the eight progression and eight idle runs once.**
      Store raw outputs before analysis, with source/recipe/input stamps. Do not rerun a missing/failed row automatically or generate more tuning arms.
- [ ] **Step 4: Apply the existing evaluator without editing it.**
      Require idle earned/claimed counters 0, all four archetypes' `tier3Passed`, `tier5Passed`, `spacingPassed`, and `equityPassed`. Assert `coverageComplete === false` and `allPassed === false`; do not mutate those official flags.
      Self-check continuation rejects an omitted/duplicated key, one false row flag, equity failure, idle claim, or missing fork/entry. Only an intact partial matrix with every selected flag true yields `r2-screening.json: decision=PASS`. Otherwise skip Task4 and restore.

### Task 4: Conditional Thirty-Two-Arm Cash/Physical Screen

**Files:** Lead authors conditional `r2-components.ts` and `r2-component-analyze.py`; retain per-arm reports, commands, finance, unlock receipts and snapshots. Keep the already-executed capture recipe immutable.

**Interfaces:** `bun docs/balance/generated/hpa-721-joint-recovery-r2-components.ts self-check candidate`; then `... components candidate`; then `python3 docs/balance/generated/hpa-721-joint-recovery-r2-component-analyze.py`. Reuse R1's `Fork`/`Step` data shape and `fund`, `staffed`, store-accounting bodies; add no runtime observer API.

- [ ] **Step 1: Freeze the complete actor/accounting recipe before execution.**
      Copy R1's `inventory`/`summarize`/`windows` accounting body verbatim and assert its source-slice hash against `hpa-721-expansion-stock-cash.ts`. Keep `fund`'s native 84-day credit, 2,000 reserve and 1,000 rounding; keep `staffed`/manager playbook and existing tie-breaks. `fundingNeutralCash` remains `cash - getTotalDebt(game)`, including its existing interest semantics.
- [ ] **Step 2: Specify exactly four arms for each of eight captured keys.**
      Expansion: no opening vs exact day1 opening, existing R1 staffing/window protocol, no later retail upgrades or expansion.
      Local: recreate the cold day-1 two-store retail-only fixture; exclude captured industry commands/borrowing. Bring both stores to L2 with paid commands before branching; then both arms pay for L3 on day 8 and L4 on day 15, staff native role gaps after upgrades, and run no later retail expansion/upgrade. Run common retail commands before local construction on each day.
      Import arm has no industrial construction. Local arm alone replays the captured primary schedule through first entry, then stops construction. Whitelist native `selectWorldCity`, `buildIndustrialBuilding`, `upgradeIndustrialBuilding`, `buildRail`, `upgradeRail`, `setRetailSupplySource`; quote using current native helpers. Reject unknown commands, missing IDs, changed building identities, unavailable credit or invalid/no-op actions except the existing world-selection allowance. Do not remap IDs or invent replacement actions.
- [ ] **Step 3: Extend only internal conservation and command-cash journals.**
      Record each native upgrade's newly materialized product lots as `nativeUnlockUnits`; never count them as produced or warehouse-delivered. Initial day1 L2 stock remains ordinary opening stock. Keep the conservative local-sales lower bound unchanged:

  ```text
  opening + nativeUnlockUnits + delivered + imported
    - sold - waste - shrink == closing
  localSalesLowerBound = max(0, delivered - waste - shrink - closing)
  ```

  Journal all non-report non-financing cash deltas, including common retail upgrades, industry and rail. Native borrowing/repayment stays in report financing; include any separate after-command claim cash delta once, never twice. Retain R1's opening-day pre-snapshot finance exclusion:

  ```text
  finalCash - initialCash
    == sum(report.netCashChange) - preSnapshotFinancingCashFlow
       + nonReportCommandCashDelta
  ```

- [ ] **Step 4: Run pure self-checks before advancing any component arm.**
      Pin inventory cases `(opening,unlock,delivered,imported,sold,waste,shrink,closing)`:
      `(0,53,4,3,56,0,0,4)` conserves with local lower bound 0;
      `(0,53,10,3,60,2,1,3)` conserves with lower bound 4.
      Reject omitted unlock receipts or one-unit imbalance. Pin cash example:
      initial 1,000/final 1,300/reportNet 500/preSnapshot 100/commandDelta -100 reconciles; omitting or double-counting upgrade cash or financing must fail.
      Assert exactly 32 distinct `(archetype,seed,arm)` keys, separate source/cash replay evidence and no finished-good imports into warehouse masquerading as local production.
- [ ] **Step 5: Execute each arm at most once and analyze frozen outputs.**
      Reuse saved day1 fixtures; no extra annual “preflight” replays. An infeasible setup or mid-arm command blocks the candidate; preserve the truncated evidence rather than retrying.
      At days 90/365 record cash/debt/interest/arrears, command capital, imports, payroll, stock/losses and physical receipts. Debit actual entrant stock gifts: convenience 1,092/boutique 1,970/electronics 3,180/grocery 2,149. Compute unchanged annual expansion gap `opened.fundingNeutralCash - none.fundingNeutralCash - openingGift` and local gap `local.fundingNeutralCash - imports.fundingNeutralCash`.
- [ ] **Step 6: Lead checks every paired result and states the bounded verdict.**
      Require strictly positive annual adjusted expansion and local cash, plus delivered>0 and local-sales lower bound>0 for every primary pair. Reconcile all cash/physical identities; no book/inventory/salvage offsets or invented 90-day deadline. Clearly distinguish the changed post-L4 local fixture from R1 and truncated-entry cash evidence from the full progression bot's later factory purchases.

### Task 5: Restore On Every Exit And Record Evidence

**Files:** Restore only owned runtime/test bytes; retain generated evidence and update the four documentation paths in the file map.

**Interfaces:** Controller `restore` and `check`, plus lead-authored `r2-final-audit.json`. Classify phases as passed/rejected/blocked/skipped, never official acceptance.

- [ ] **Step 1: Restore after success, rejection, exception or interrupted execution.**
      Compare current owned hashes with recorded postimages before writing preimages. Unknown concurrent edits block blind restoration and require lead reconciliation; never adopt them with a blanket `record`. Remove only temporary files created by this trial, preserving their exact diffs/logs. Do not revert existing docs/evidence or user edits.
- [ ] **Step 2: Verify restored source and frozen-input closure.**
      Require the original 475-file manifest, no source/test diff and unchanged historical evidence/recipes. Verify candidate outputs against their recorded hashes without rerunning derivations. Keep analysis/sizing snapshots immutable, including historical pre-approval status text.
- [ ] **Step 3: Run restored affected guards and observer noninterference checks.**
      Repeat Task1's explicit affected-file inventory without the removed temporary test; run `bunx vitest run tests/balance/progressionBots.spec.ts tests/balance/progressionRun.spec.ts tests/balance/progressionClaimTrace.spec.ts`.
      Expected: all selected tests pass, no skips; retain actual counts rather than assuming R1 totals. Correctness-test checks are separate from the bounded captured matrix; do not use them as extra tuning evidence.
- [ ] **Step 4: Record and format the final report.**
      Preserve failures, skipped phases, counts and source stamps; never claim an unevaluated gate passed. Format only owned docs with `bunx prettier --ignore-path /dev/null --write <owned-doc-paths>` (the normal ignore file excludes docs), then the matching `--check` and `git diff --check`.
- [ ] **Step 5: Lead reviews the complete surviving diff and receipts.**
      Report whether the candidate is rejected/blocked or merely clears this bounded screen. Full acceptance/save/platform work remains unauthorized. No commit or push.

## Execution Record

**Result: REJECTED, fully restored.** Tasks 1/2/3 receive fresh APPROVE
spec/quality reviews; Task3's measured verdict is REJECTED, not acceptance.
Task 4 is skipped in full. Restoration and the final narrow correctness
gate complete; documentation formatting/final review are recorded in the
SDD ledger and final audit rather than inferred from this historical checklist.

- Task 1: 43 intended RED failures, 45 focused GREEN, 775 affected candidate
  guards pass without skips. R1 recovery reaches all 475 frozen hashes;
  warehouse no-upgrade remains intact, with native grain-farm upgrade coverage.
- Task 2: 14 native plays pass teaching semantics, exact First Profit pins
  and positive reference COGS 1,222. Import Squeeze score 680->665 is reviewed
  numeric observation drift, not a band/medal/deadline change.
- Task 3: initial observer 22/23 mismatch is only the historical electronics
  claim-day 162 observation. All local-source/goal assertions pass. One
  separately owned temporary observation becomes 141; V2 passes 23/23.
  V1 artifacts are preserved, V2 differs only in artifact-prefix constants.
  The 16-case matrix then runs once and rejects on eight flags; ratio
  3.105090812722131>3, boutique/electronics spacing 0. All 8 idles earn/claim 0.
- Task 4: all 32 conditional arms SKIPPED. No component recipe is implemented
  or run; no matched cash-payback/local-sales certification follows.
- Task 5: separately owned observer bytes restore FIRST with hash guard,
  then controller restores all other owned paths. All 475 original source/
  test hashes match, source/test diff empty, temporary test removed,
  all 268 frozen input hashes intact. Restored 718 guards +23 observers pass
  without failures/skips. Approved R2 design/spec remains an unmodified
  historical sizing/approval snapshot; execution is documented here and
  in the main report/changelog.

One retention error is explicitly recovered: candidate-patch regeneration
overwrites a scenario-locked artifact. Lead reconstruction matches all 476
capture-source hashes and restores the exact original patch SHA; the updated
patch is archived separately. Native raw/meta files and historical inputs
remain intact. No acceptance threshold, bot/ladder policy or approved runtime
value is changed to hide any failure.

Final evidence: `hpa-721-joint-recovery-r2-screen-v2-screening.json`,
`-screen-v2-lead-review.json`, `-restoration-audit.json` and `-final-audit.json`
under ignored `docs/balance/generated/`. Only 16 of the maximum 48 annual matrix
attempts are used; no annual row rerun or extra capture occurs. Correctness
tests remain separate. No official/full engineering/E2E/platform/save checks,
commit/push/PR/deployment or acceptance/merge-readiness claim.
