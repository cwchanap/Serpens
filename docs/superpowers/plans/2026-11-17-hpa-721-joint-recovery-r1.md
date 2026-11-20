# Joint Recovery R1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Evaluate the user-approved fixed R1 treatment without adopting it.

**Architecture:** Reapply the frozen corrected candidate, then the five approved
numeric deltas and specified scenario offsets. The lead authors and judges all
configuration, measurement recipes and verdicts; delegate mechanical application
and execution. Restore preimages regardless of outcome.

**Tech Stack:** TypeScript, Bun, Vitest, Python 3, existing deterministic game.

**Spec:** `docs/superpowers/specs/2026-11-17-hpa-721-joint-recovery-candidate-design.md`.
User approved the exact bundle and bounded trial on 2026-11-17.

**Execution:** Runtime trial complete and rejected; all temporary source/test
edits restored. Documentation formatting, checks and final review pass.

## Global Constraints

- Restored HEAD is `95ff7dfb5be9ddc04241029aeb01286eeba3002c`.
- Preserve all pre-existing docs edits/untracked files and ignored evidence.
- Five deltas from the corrected candidate: produce shelf 13; Harbor pantry
  profile 0.4; nonfounder pantry threshold/target 500; retail upgrade base 2,000;
  revenue bonus 0.05 per non-milestone level.
- First Profit opening 3/8 and reference 8/18; Local Lifeline water 8/6 retained;
  Fresh Market produce opening 13; Rival Next Door opening/reference 13/14.
- No scoring, targets, thresholds, borrowing, bot, recipe, FIFO/spoilage,
  rail/overflow, persistence, dependencies, UI or acceptance-contract changes.
- No official matrices, live saves, commits, pushes, deployments or PR actions.
- Freeze exclusive-write artifacts under `docs/balance/generated/hpa-721-joint-recovery-r1-*`.
- No automatic parameter changes or arithmetic/scenario-result repinning.

## Review Focus

- Real brand construction must produce whole shelf 13, not fractional 13.5
  rounded to 14; assert shelf/default demand ratio 1.
- Lower paid defaults must not overwrite founding settings or add free stock.
- Upgrade affordability must remain cash-only and milestones revenue-neutral.
- Fresh Market must retain its no-action failure and reference teaching.
- Partial pilot coverage must never become official `allPassed` certification.

---

### Task 1: Freeze And Verify The Temporary Treatment

**Files:** New ignored `r1-control.py`, `r1-before.json`, `r1-structural` test
artifact and reversible patch; temporary source/test edits owned by the control.
Existing corrected patch:
`hpa-721-linked-corrected-pilot-prepared-final.patch`.

**Interfaces:** Preserve all runtime exports. Control consumes archived patch
SHA-256 `0ef2cd75774efdc3f0246e2e1cb1169c7cdecfcb528bc854cbbc353a73f5fd73`;
produces complete source/test manifests, preimages and apply/restore receipts.

- [x] Lead authors source-lock/control recipe; verify the 475 baseline hashes,
      frozen inputs and helper/recipe hashes before writing application files.
- [x] Author focused behavior assertions before runtime edits: actual produce
      shelf 13/import 6, demand ratio 1; native pantry pool under profile 0.4;
      legal upgrade costs 2,000/4,000/6,000 and revenue multipliers
      1/1.05/1.10/1.10, with no milestone bump.
- [x] Reuse existing nonfounder/founder/weekly-import cases for 500/500,
      unchanged founder 55/198 and quantities, and empty paid grocery fill 5,330.
- [x] Run structural RED on restored runtime; intended assertion failures only,
      never unresolved imports. Persist command, exit and full log.
- [x] Apply the archived patch, then only the lead-authored exact five numeric
      edits and scenario price changes. Include numeric header corrections.
- [x] Run structural GREEN. Inventory all affected leveling, products,
      worldCatalog, state, placement, stock, retailSupply, retailUnitEconomics,
      companyBookValue, supplyPlanner, supplyPlannerActions and scenario guards.
      Lead classifies failures before any fixture change.
- [x] Review complete temporary diff and hashes. No commit.

### Task 2: Fresh Scenario Gate

**Files:** Lead-authored ignored `r1-scenarios.ts` and raw/meta/verdict outputs.
Reuse existing replay constants/helpers extracted from the candidate
`src/lib/scenarios/runtime.spec.ts`; do not change command schedules.

**Interfaces:** Consume candidate runtime plus exact unit reference fixtures.
Produce fourteen native result/report/RNG rows with source, fixture and recipe
hashes: seven scenarios, no-action/reference each.

- [x] Author and freeze extraction/runner before execution; retain full reports
      for cash/COGS review, not only scores.
- [x] Execute fourteen plays. No year-long run before this gate is reviewed.
- [x] Judge outcomes/deadlines/no-action separation and all reference gold.
      First Profit must remain day 4, 682 bronze versus 862 gold, with positive
      reference COGS-based operating income.
- [x] Evaluate the semantic stop rule; no teaching-contract failure occurred.
      A failure would stop without repinning, skip Task 3, and restore.
      Catalog-only arithmetic differences still need explicit lead review.

### Task 3: Conditional Bounded Economic Screen

**Files:** Lead-authored ignored R1 capture/accounting/analysis recipes and outputs.
Reuse existing progression/claim/chain helpers and matched component accounting.

**Interfaces:** Fresh candidate captures, never old candidate funding/site forks.
Eight progression plus eight idle runs: four archetypes, seeds
20260503/20260515, horizon 365. Twelve component arms: four day-1 expansion
pairs and seed-20260503 water/produce local/import pairs.

- [x] Only after Task 2 and correctness guards pass, author and hash the exact
      capture/accounting recipe before handing off execution.
- [x] Capture the sixteen runs, retaining daily SKU/market/chain reports,
      ledgers, deferrals, claim traces and exact pre-finance forks.
- [x] Execute twelve component arms from those forks, with legal native
      financing. Missing day-1 opportunities are blocked, not substituted.
- [x] Lead verifies cash identities and physical conservation; judge strictly
      positive annual adjusted expansion/local cash and productive local sales.
      Report 90-day payback without inventing a new payback deadline.
- [x] Apply unchanged pacing diagnostic rows and idle-zero controls; retain
      false official coverage/allPassed for this partial matrix. Assess grocery
      Tier-3 timing, post-L4 mix and boutique stacking without waivers.
- [x] No automatic official sweep or value retry, even if promising.

### Task 4: Restore And Record The Verdict

**Files:** Restore all owned runtime/test preimages. Update only evidence/docs
in `economy-pass.md`, `tuning-changelog.md`, the spec and this plan.

**Interfaces:** Complete restore receipt, source/frozen/helper hash closure,
fresh restored guard output and honest accepted/rejected/blocked classification.

- [x] Restore even after exceptions. Remove only temporary test files created
      in this trial; never remove or revert pre-existing work.
- [x] Verify byte-for-byte source/test and frozen-input/helper/recipe equality.
- [x] Run restored focused guards and the existing 19 observer checks; preserve
      full logs/exits. Do not re-run unchanged official or broad suites.
- [x] Document all failures and skipped phases. Format touched docs using
      `prettier --ignore-path /dev/null`, check formatting and `git diff --check`.
- [x] Lead reviews complete diff and integrity receipts before reporting.
      No commit or push; existing-save and full acceptance remain uncertified.
