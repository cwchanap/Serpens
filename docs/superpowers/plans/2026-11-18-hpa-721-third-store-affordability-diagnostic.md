# HPA-721 Third-Store Affordability Diagnostic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Use uncommitted snapshots, not commits.

**Goal:** Determine whether a 6,000 reduction in convenience and grocery setup quotes advances the third store and Tier 3 on matched native runs.

**Architecture:** Reconstruct R2 in a disposable export of the pinned commit. Overlay the identical reviewed Tier 5 diff on both arms; change only the fixed setup term in the treatment. Use native scenario and progression paths and retain separate immutable evidence for each arm.

**Tech Stack:** Bun 1.3.14, TypeScript, Vitest, Python 3, Git.

**Spec:** `docs/superpowers/specs/2026-11-18-hpa-721-third-store-affordability-diagnostic.md`

## Global Constraints

- R2 remains rejected; it is a control, not an adoption candidate. No new changes to the ladder, month rule, bot/manager policy, credit, rewards, scenario definitions or score bands, or acceptance thresholds.
- Treatment only: the fixed base of `getExpansionSetupCost` is 3,000 for convenience and grocery, 9,000 for boutique and electronics. Keep the R2 coefficients, terrain premiums and catalog values. Keep cash debit and book value on the same quote.
- At most 14 scenario plays per arm and eight 365-day progression trajectories total. No idle, component, payback, repeat trials, full unit/E2E invocation (would launch extra trajectories), official matrices, or platform certification.
- The lead authors and verifies all capture, gate and analysis recipes. No staged files, commits, push, PR updates, deployments, or writes to frozen evidence. The current worktree's source and existing docs stay unchanged.
- Store new evidence in a fresh, ignored `docs/balance/generated/hpa-721-third-store-diagnostic/` directory in the current workspace. Commands must create outputs exclusively; an existing run, partial or complete, is not permission to retry.

## Review Focus

- Wrong archived fixture generation: reconstruct and match the full 476-file R2 inventory before applying Tier 5 (Task 1).
- Discount leaks to premium stores or overrides terrain differences: pin all four quotes and terrain premiums; exercise exact cash and retail assets (Task 2).
- Missing, duplicated or degraded scenario result: stop before any annual run (Task 3).
- Extra/duplicate annual rows, wrong seed, mismatched command debit, or a day-366 receipt counted as reach: reject capture/analysis (Task 4).
- Partial failure leaves a changed source or overwrites an old run: preserve logs and restore or remove only the owned scratch tree (Tasks 1 and 4).

---

### Task 1: Reconstruct and lock the two-arm control

**Consumes:** `docs/balance/generated/` R2 artifacts and `.superpowers/sdd/2026-11-17-hpa-721-tier5-operating-month/final-source.diff`.

**Produces:** A private scratch root with `control/` and `treatment/` exports, a control manifest, and a frozen-input manifest. Scratch paths are never written into runtime state.

- [ ] Record current worktree HEAD, source/test diff, index diff and existing dirty/untracked doc hashes. Verify it matches the reviewed Tier 5 diff. Pin `package.json`, `bun.lock`, the TS/Vite/Svelte configs, and exact copies of the historical inputs listed below. Set a cleanup path before applying any scratch changes. The current workspace is already linked; do not create another linked worktree or alter Git metadata. Export `95ff7dfb5be9ddc04241029aeb01286eeba3002c` with `git archive <sha> | tar -xf - -C "$scratch/control"` under a verified fresh temp directory. Use a private frozen Bun install (`bun install --frozen-lockfile --ignore-scripts`) and `./node_modules/.bin/svelte-kit sync` there; do not run `prepare` or share a writable `.svelte-kit` or `node_modules` with the current worktree.
- [ ] Apply `hpa-721-joint-recovery-r2-candidate-after-fixtures.patch` in `control/`, using `git apply --check` first. SHA-256 is `676338323dc286759f248d56afbade220d36395387166fbc76ac9ed824cbfe31`. **Do not substitute** `hpa-721-joint-recovery-r2-task1-candidate.patch`: it leaves eight files at earlier fixture revisions.
- [ ] Apply only `hpa-721-joint-recovery-r2-observer-fixture.json`'s `afterBase64` to its `path`, `tests/balance/progressionBots.spec.ts`, after checking `beforeHash`, decoded `afterHash` and the JSON's own pinned hash in `hpa-721-joint-recovery-r2-screen-v2-capture-lock.json`. Confirm the exact `src/` and `tests/` file set and all 476 hashes against that lock (`d743f7a98b1b80e94a6b8469bf187d2b36dadf4c03116587ee52da14fa2e5833`), including the added R2 spec. Stop on any missing, extra or mismatched file.
- [ ] Apply `final-source.diff` after `git apply --check`; verify SHA-256 `71de5c47239fcdc7dcc87fdff9bb18ad3be6aa956b34c7ae95b1da1aab038c62`. Verify its twelve source/test paths against the corresponding hashes in `hpa-721-tier5-operating-month-screen-lock.json`, and verify every other `src/` and `tests/` path remains R2-exact. Copy this source to `treatment/` with its own local setup. Freeze source manifests before preparing treatment tests.
- [ ] Run the control's short guards: `bun run test:unit -- --run src/lib/game/state.spec.ts src/lib/game/companyBookValue.spec.ts src/lib/game/progression.spec.ts src/lib/scenarios/metrics.spec.ts`. Require exit 0 and no skips. Do not run `progressionBots.spec.ts` (includes full years) or `runtime.spec.ts` (includes the scenario plays) as preflight.

### Task 2: Prove and apply the single quote delta

**Files:** Scratch `treatment/src/lib/game/state.ts`, `state.spec.ts`, `companyBookValue.spec.ts`. No new runtime API.

- [ ] Write the failing tests first. In `state.spec.ts`, extend the terrain quote test to four archetypes. With zero rent/demand/traffic/fit on green, expect convenience **5,070**, grocery **5,160**, boutique **11,430**, and electronics **11,700**. For each, residential and commercial must add exactly 2,000 and 3,500 respectively. In the linked economy fixture with rent 2,365 and zero demand, pin convenience **7,435** and grocery **7,525**.
- [ ] Add an exact-cash native opening test in `state.spec.ts`. Use `makeFlatRetailCity(4, 4)`, a founder at `retail-city-0-0`, and `openStoreAtTile` from `placement.ts` targeting `retail-city-2-0`. At the expected price (convenience **10,110**, grocery **10,200**, boutique **16,470**, electronics **16,740**), expect one added store with that archetype and tile, zero cash, and `getCompanyBookValue` retail assets increasing by exactly the quote. With one less cash (same fresh fixture), expect no store and unchanged cash. For the existing value hand fixture, update only the affected numeric pins: setup 12,000 to 6,000, total 43,929 to 37,929, retail assets 13,000 to 7,000, and level-10 `12_000 + expectedUpgrades` to `6_000 + expectedUpgrades`.
- [ ] Run `bun run test:unit -- --run src/lib/game/state.spec.ts src/lib/game/companyBookValue.spec.ts` in treatment. Require RED due to old targeted quotes/debits/assets; premium and fixture-setup checks must not fail. Save failed assertions.
- [ ] In `getExpansionSetupCost`, replace only the `9_000` term with `(archetypeId === 'convenience' || archetypeId === 'grocery' ? 3_000 : 9_000)`. Leave all other quote terms and consumers unchanged. Reuse the same test command for GREEN, then run the Task 1 short guards in treatment. Require exit 0, no skips, and diff limited to that one production expression and the expected test edits. Freeze the treatment manifest; retain the diff and test output.

### Task 3: Gate both arms on the existing scenario contract

**Files:** Lead-authored `scenario-capture.ts` and `scenario-check.py` in new evidence, using read-only `hpa-721-joint-recovery-r2-scenario-native.ts`, `hpa-721-joint-recovery-r2-scenario-evaluate.py`, `hpa-721-joint-recovery-r2-scenario-raw.json`, `hpa-721-joint-recovery-r2-scenario-evaluation.json`, and `hpa-721-joint-recovery-r1-scenario-evaluation.json`.

- [ ] Pin those five inputs and the new recipes. Copy the archived native module next to `scenario-capture.ts` under each scratch root's `docs/balance/generated/` so `$lib` resolves in the arm, not the live worktree. Use its unchanged `measure()` export. Verify its reference constants and replay helpers match the corresponding slices of the reconstructed `runtime.spec.ts`. Save `{ rows, error }` to `<arm>-scenario-raw.json` exactly once. Each row has `id`, `reference`, `status`, `result`, `reports`, and `rng`. Use the original seven authored IDs and both modes.
- [ ] Reuse `report_identities(report)` and `classify(summaries, baseline)` from the archived R2 evaluator (load without its CLI; no edit to the frozen evaluator). Use the frozen R1 summary baseline for `classify` as the original guard did. Assert status matches result outcome, each row has reports, and all native cash/COGS identities hold. Run the archived evaluator's `--self-check`, then self-check the new two-arm continuation with missing/duplicate rows, non-gold reference, changed First Profit pin and failed source hash; none may permit annual runs.
- [ ] From each scratch root, run `bun run docs/balance/generated/scenario-capture.ts` once, with the arm and output paths locked in its manifest. Evaluate both files with the lead's `python3 scenario-check.py --check` from the new evidence directory. Require 14 unique plays per arm, no native error, teaching outcome/medal separation and unchanged deadlines, all references gold, and First Profit day 4 **682/bronze vs. 862/gold** with strictly positive reference COGS income. Compare the control's native rows against frozen R2; stop on unexplained drift. Record all treatment outcome, day, score, cash and COGS differences vs. both control and frozen R2; numeric drift outside exact pins is disclosed, not calibrated away. Freeze both raw files and verdicts. Do not continue unless both pass and all locked evidence still matches.

### Task 4: Measure once, analyze matched pairs, and restore

**Files:** Lead-authored `progression-capture.ts` and `compare.py` in new evidence. Consume both arm manifests and passed scenario receipts; produce eight unique raw rows, `paired-summary.json`, and a SHA-256 manifest.

- [ ] Author the capture using `runProgressionBot(archetypeId, seed, 365, probe)`, `createProgressionClaimTraceCollector()` and `summarizeProgressionRun(seed, archetypeId, result)`. Use exactly `['convenience', 'grocery']` and `[20260503, 20260515]` per arm, in that order. Persist attempted keys before each launch and raw output immediately after each run. Keep `summary`, `trace`, `ledger`, and native command evidence. For applied `openStore`, use probe context to record tile/archetype, pre-command cash and debt, post-command/pre-claim cash, and validate the cash debit against `ledger.openings[].forecast.setupCost` for the same store/day. Keep native deferral and credit details from `ledger.actions`; do not invent quotes for cap/no-tile deferrals.
- [ ] Author and check `python3 compare.py --self-check` for missing, duplicated and out-of-scope keys, noncontiguous report days, mismatched quote/debit, and day-365 versus day-366 reach. Reject missing scenario pass records or run artifacts; allow a complete native run that never claims a tier. Assert each native trace has report days `1..365`, terminal game day 366, and a receipt ledger matching the claim appends. At each claim probe, use `evaluateProgression(before)` to capture the first Tier 3 own-goal pass and any still-blocking predecessor goals until the actual Tier 3 receipt. For an earned operating month, reconcile the native contributor IDs and both strictly positive report sums in the same 30-day window; the final report must strictly predate any Tier 5 receipt.
- [ ] After both scenario gates pass and all hashes match, run `bun run docs/balance/generated/progression-capture.ts` once per arm. Use only those eight trajectories. If one errors or is interrupted, retain its attempted key/log, stop, and do not retry or widen. Recheck all inputs, source manifests and output hashes before comparing.
- [ ] Run `python3 compare.py --check` from the new evidence directory. Report per pair the days of stores three/five/seven and every tier receipt, first Tier 3 own-goal readiness vs. any earlier blocker, peak book value and cash/debt at closing days 90/150/335/365, and operating-month evidence if reached. Keep missing milestones distinct from late receipts. Count through receipt day 365 only. Call out Tier 3 before day 90, earlier stores without earlier Tier 3, and unchanged/worse paths separately. Neither a shorter wait nor more cash implies payback. Do not retune or start another screen.
- [ ] On every exit, preserve logs, attempted keys, diffs, manifests and the record of any stop in the new evidence directory. Restore/remove only the owned disposable exports after verifying the evidence is saved; never run a Git cleanup command on the current worktree. Verify the current source/test diff, index, previously dirty docs and frozen inputs match the starting snapshots, then run `git diff --check`. Report actual scope, traceable results or blocker, and restoration. No adoption, equity verdict, official Tier 5 or pacing sign-off, or PR action follows from this diagnostic.
