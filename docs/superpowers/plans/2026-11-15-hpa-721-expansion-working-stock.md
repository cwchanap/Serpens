# HPA-721 Expansion Working-Stock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Test the approved expansion-only staple stock defaults, measure paid
cash contribution, then restore the trial rather than retaining an unproven change.

**Architecture:** Keep the existing shared `buildStore` constructor and all public
signatures. For nonfounding stores only, set water/pantry reorder and target to
1,000 without changing lots. Use existing progression, claim-probe and cash
counterfactual seams; lead authors and judges measurement artifacts.

**Tech Stack:** TypeScript, Bun, Vitest, existing pure game transitions.

**Spec:** `docs/superpowers/specs/2026-11-15-hpa-721-expansion-working-stock-design.md`

**Execution:** Complete, rejected and restored. Six matched cash cases are frozen;
only two of four first expansions repay within the year. Candidate guards pass
285/285; restored guards pass 279/279 and all pre-trial hashes match.
The optional chain step is skipped after the negative cash verdict.
No adoption, full sweep or commit follows. Do not rerun completed measurements
merely to present the frozen results.

## Global Constraints

- Source baseline `3250caea0cc70eda4d592ad4406fe8fdf5c75cb1`.
- Authorized bounded measurement only. No commit, push or adoption; restore edits.
- No bot policy, RNG draw order, cash/credit, prices, wages, setup, cadence,
  industry, market, city, save, receipt, threshold or forecast-math change.
- Founding `store-1`, all free opening lots and all other products stay unchanged.
- Source tree must not change while measurement commands are running.
- Preserve existing docs and all historical/generated evidence.
- No full sweep, full-suite gate, E2E or platform work for an unproven component.

## Review Focus

- Larger targets must not create free goods or inflated opening book value.
- Live/forecast entrant defaults must agree without new RNG draws.
- Existing founding/tutorial and premium-control behavior must stay unchanged.
- The no-open branch must not inherit an opening-specific loan or entrant payroll.
- Day-365 payback must not include later reports, inventory liquidation or day-366 receipts.

---

### Task 1: Temporary Default And Behavioral Screen

**Files:** modify `src/lib/game/state.ts`; temporary tests in
`src/lib/game/{state,placement,retailSupply}.spec.ts`.

**Interfaces:** preserve `buildStore(input): Store` and every input field.
Its live and projected callers already use `store-${game.stores.length + 1}`.
Add only a private 1,000 working-stock constant and select water/pantry defaults
for `input.id !== 'store-1'`. Keep product creation, initial lots and all other
data unchanged. No new helper/API, persisted flag or tuning subsystem.

- [ ] Add tests named with prefix `HPA-721 expansion working stock`.
  Real convenience/grocery expansions have water/pantry reorder=target=1,000;
  opening lots remain 84/154; setup cash charge is unchanged; book inventory
  increases by only the original gift 224/371.
  Founding water stays 30/108, pantry 55/198; snacks stays 25/90, produce 50/180.
  Premium product defaults remain unchanged.
- [ ] Assert projected/live expansion product arrays agree and projection does
  not mutate the input game/RNG.
- [ ] With default Common Ground, no modifiers and empty local inventory, empty
  L1 expansion shelves refill with paid `importSpend` 1,180/1,680.
  Assert both actual imported quantities and paid totals, not a configuration echo.
- [ ] RED:
  `bun run test:unit -- --run src/lib/game/state.spec.ts src/lib/game/placement.spec.ts src/lib/game/retailSupply.spec.ts -t 'HPA-721 expansion working stock'`.
  Expect the new expansion-default assertions to fail at old values, not import/type errors.
  Unchanged-behavior guards can already pass.
- [ ] Make the minimal `buildStore` change; run the identical command GREEN.
- [ ] Run the focused existing guards:
  `bun run test:unit -- --run src/lib/game/stock.spec.ts src/lib/game/retailSupply.spec.ts src/lib/game/state.spec.ts src/lib/game/placement.spec.ts src/lib/game/companyBookValue.spec.ts src/lib/game/retailUnitEconomics.spec.ts src/lib/scenarios/runtime.spec.ts`.
  Expect zero failures. Stop and report any existing failure; do not repin.
- [ ] Save separate production/test patches and pre/post source hashes with
  `hpa-721-expansion-stock-*` artifact names, plus complete logs/exit codes.
- [ ] If guards pass, run:
  `bun tests/balance/progressionRun.ts --seeds 20260503,20260515 --days 365 --output docs/balance/generated/hpa-721-expansion-stock-progression`.
  Expect eight progression/eight idle, complete partial diagnostic, zero idle earning.
- [ ] Run:
  `bun run balance --seeds 20260503,20260515 --days 365 --bots idle,retail-steady,advisor --output docs/balance/generated/hpa-721-expansion-stock-gate`.
  Expect 18 diagnostic rows, not an official coverage pass.
- [ ] Leave exact candidate active for lead-owned cash evidence; no further edits.
  This is a handoff boundary, not task completion or adoption.

### Task 2: Lead-Owned Cash Evidence And Restoration

**Files:** ignored lead-authored measurement script and frozen JSON/logs under
`docs/balance/generated/`; report/changelog only after results are judged.

**Interfaces:** consume Task 1 source patch and raw progression/Gate A outputs.
Reuse `runProgressionBot(..., probe?: ProgressionClaimProbe)`, `applyGameCommand`,
staffing/finance helpers and the existing matched-entrant method.
No harness/bot code changes are required.

- [ ] Lead checks full code/test diff and RED/GREEN evidence before using outputs.
- [ ] Lead checks per-archetype paired progression rows and premium identity against
  frozen `hpa-721-head-3250caea-progression.json`; idle earning remains zero.
- [ ] Lead authors/runs the exact snapshot/replay and three-arm cash analysis:
  no opening, opening with old entrant defaults, opening with approved defaults.
  All arms share the same pre-financing state; only opening branches borrow/hire.
  Existing `createStoreProduct` remains the source of old-default entrant values.
- [ ] Capture first expansion and first new-city expansion where available.
  Probe `actionIndex` is the action count before claim ledger entries, not a
  zero-based index; match action count/day and assert replay equality.
  Report 90 days and actual last-report-day-365 separately.
- [ ] Record paid setup/payroll/imports/interest/principal, arrears, opening gift,
  terminal inventory and building-instance counts. Judge funding-neutral cash
  as delta cash minus delta principal, with the conservative gift debit shown.
- [ ] Only if cash evidence warrants it, run existing chain evidence before
  considering any further combination. No official matrix for this component.
- [ ] Restore only Task 1 gameplay/tests and verify pre-edit hashes, empty
  `git diff -- src tests`, and appropriate restored focused checks.
- [ ] Record the verdict and exact limitations in the report and tuning log;
  check only changed documentation formatting/whitespace.
- [ ] End without a commit/push or acceptance claim. A retained implementation
  requires a later justified joint candidate and its full gates.
