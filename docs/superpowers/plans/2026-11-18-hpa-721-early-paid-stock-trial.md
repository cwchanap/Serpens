# HPA-721 Early Paid Stock Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the bounded trial. Steps use checkbox syntax. Do not commit or ship the experiment.

**Goal:** Test whether one cash-paid day-one stock order makes the first payroll and the following weekly restock affordable when two convenience stores defer upgrades.

**Architecture:** Use a single disposable copy of the pinned restored economy. Fork each seed's identical day-one start into a no-order control and a one-order treatment. Only the scratch harness can make the early purchase; native daily sales, weekly receipts, payroll, and debt service run unchanged in both arms.

**Tech Stack:** Bun 1.3.14, TypeScript, Python 3, Git.

**Spec:** The approved scratch experiment is restated here. It follows the frozen two-store replay and restock-timing analysis under `docs/balance/generated/`. No existing gameplay exposes this purchase. This is a test of a hypothetical mechanic, not a player strategy available today.

## Global Constraints

- Exactly two seeds (`20260503`, `20260515`), at most four attempted trajectories, daily reports 1–35 inclusive, terminal state at the start of day 36. No retries, extra arms, annual runs, scenario plays, or official acceptance runs.
- Both arms use two level-1 Harbor convenience stores, identical staff, policies and founding loan. Neither buys an upgrade, builds industry, hires again, resolves a discretionary event, or takes new credit after the shared start. Let native automated actions and scheduled loan service execute.
- The treatment makes one immediate cash-paid order before day-one sales, at brand-resolved import costs of 1 for water and 2 for snacks. Normal paid replenishment remains after sales every seventh day in both arms. No new live command, scenario fixture, score, default, rule, bot policy, or acceptance threshold.
- Store inventory still follows native sales, losses, and reorder rules. No correction for low sales, adverse autonomous decisions, negative cash, or arrears. A valid unfavorable result is a result, not grounds to change the trial.

## Review Focus

- A wrong or upgraded fixture can mask underfunding: match the archived fixture first, then reconstruct and hash both level-1 starts without the old draw.
- The scratch purchase must be paid before sales: reject a wrong quote, insufficient cash, or a second order; assert the exact pre-sales cash debit and unit receipt.
- Early sales can displace later sales or imports: evaluate cumulative cash after both day-30 payroll and day-35 replenishment, not just the first week.
- A missed debt payment can inflate cash: reconcile outstanding principal and unpaid interest separately and disclose arrears and the next payment.
- Receipts are not sales and remaining stock is not cash: reconcile each store/SKU ledger and do not add stock value to cash gains.

### Task 1: Reconstruct And Verify The Two Starts

**Files:** Scratch `docs/balance/generated/hpa-721-early-paid-stock/capture.ts`; read-only inputs below. The lead writes and verifies the capture and analysis recipes.

- [ ] Snapshot live HEAD, porcelain status, index/diff, and existing dirty-file hashes. Export `95ff7dfb5be9ddc04241029aeb01286eeba3002c` into a fresh temporary directory with `git archive`; verify and `git apply --check` the reviewed Tier 5 diff before applying it there, not in the live worktree. Use the table to verify input bytes, then verify all 480 runtime hashes in the screen lock against the export. Use Bun 1.3.14 and, if needed for alias resolution, a private `bun install --frozen-lockfile --ignore-scripts` followed by `./node_modules/.bin/svelte-kit sync`. Do not install or regenerate in the live worktree.

| Read-only input | SHA-256 |
| --- | --- |
| `.superpowers/sdd/2026-11-17-hpa-721-tier5-operating-month/final-source.diff` | `71de5c47239fcdc7dcc87fdff9bb18ad3be6aa956b34c7ae95b1da1aab038c62` |
| `hpa-721-tier5-operating-month-screen-lock.json` | `83621b6e07dfb75a1c930ae76ccb6b4c4eb247b66c1da5d1c582b60e79df94` |
| `hpa-721-starter-water-trial/annual-lock.json` | `139b3983c6ae48143f8cfe589f4ac7cd6c78c4244c0a0682b6e9e72dcd1e2651` |
| `hpa-721-first-two-stores-replay/analysis.json` | `eb9f8ca4b32642c1db69e5be751e499b2c73b12f35ac95b8399e79885e47d5ea` |

- [ ] Apart from the `.superpowers/` diff, table paths are relative to `docs/balance/generated/`. Copy the starter-water `forks.json` and `common-<seed>.json` after verifying their hashes from `annual-lock.json`. Use the byte-identical `docs/balance/generated/hpa-721-expansion-stock-cash.ts` (`36a4d44e30793b308ff3d45062255382a53a5ebfaa43c16956285fc24a68a575`) at that same relative path in scratch; import only its `staff(game, storeId)` helper, not its capture entry point.
- [ ] Implement `prepare(seed: number, archived: boolean): GameState`. Use `createFoundingGame('convenience', seed).game`. Attach `protect-availability` to the lexicographically first manager at Harbor city scope, with inventory as the only authority, then call `claimEarnedTiers`. Apply the selected `fork.retail` commands through `applyGameCommand` and `claimEarnedTiers`, in archive order. Require accepted commands and changes except `selectWorldCity` may be a no-op. Then call `staff` in store-ID order. For `archived` only, keep the upgrade and use the original 84-day loan before staffing when a store is short and cash is below 2,000; draw `ceil((2000 - cash) / 1000) * 1000` after verifying native credit. For the trial start omit only the upgrade from the command list and omit the archive-only loan. Do not reverse an upgrade by editing a saved level or refunding it.
- [ ] Run `bun docs/balance/generated/hpa-721-early-paid-stock/capture.ts prepare`. Require exact deep equality to the archived day-one common states in archive mode. In trial mode require an empty report list, no pending decisions, two level-1 stores on the archived Harbor tiles, identical staff and RNG to the archived start, no industry, no day-one financing activity, one unchanged founding loan with principal 8,000, and the exact cash, payroll and `sha256(JSON.stringify(game))` below. Save each verified trial start once by exclusive creation; `prepare` must not advance a day.

| Seed | Shared starting cash | Day-30 payroll | Trial start SHA-256 |
| --- | ---: | ---: | --- |
| `20260503` | 9,309 | 21,437 | `758065b66b935a3f0b1fbb8d67b9cb000e241620882e5b2cdf95f419dd005c73` |
| `20260515` | 9,760 | 21,756 | `1720994329feaacff8206ffe34e8c003f383e3339ea48e40f54955e6a1c7c81a` |

### Task 2: Verify The Purchase And Run The Pairs

**Files:** Same scratch `capture.ts`; append-only attempt and per-arm JSONL evidence. `run` consumes only the two verified starts and the pinned table below.

| Seed | Store 1 water / snacks | Store 2 water / snacks | Paid total | Cash immediately after order |
| --- | ---: | ---: | ---: | ---: |
| `20260503` | 465 / 391 | 397 / 298 | 2,240 | 7,069 |
| `20260515` | 264 / 246 | 207 / 178 | 1,319 | 8,441 |

- [ ] Before any launch, verify the order quantities against the sum of `stockoutLostDemand` through report 7, inclusive, by store and SKU. Use only `convenience-<seed>.json` from the first-two-stores replay, with archive hashes from its pinned `analysis.json`. Day 7 is included because the actual first receipt occurs after sales. This is a hindsight-sized order for testing feasibility, not an algorithm for players or the bot.
- [ ] Implement scratch-only `buyEarly(game: GameState): { game: GameState; order: { storeId: string; productId: 'bottled-water' | 'snacks'; units: number; unitCost: number }[]; paid: number }`. Require the exact pinned start hash, which rejects any second purchase. Validate all four lines, quotes and total before writing. Use `resolveBrandEconomics` for unit cost, `addStoreProductStockLot` with `receivedDay: 1` to add the exact paid units, and `calculateStockHealth` for each affected store. Debit `game.cash` once by the total, with no finance activity and no threshold/target change. Assert no mutation to the input, a nonnegative immediate balance, exactly the four ledger unit deltas, and no other state differences except lots, stock health and cash. Do not insert the debit into a native report or loan ledger; record a separate paid retail order receipt.
- [ ] Run `bun docs/balance/generated/hpa-721-early-paid-stock/capture.ts self-check`. At zero ticks assert both exact debits and quantities; assert that a day-two call, changed quote, insufficient funds, or second purchase rejects without side effects. These failures may be caught at the pinned-start assertion. Save a receipt for self-check completion. Before execution freeze and hash `capture.ts`, the two starts, source inputs, and the analysis recipe. A mismatch, denied command, or missing input stops execution.
- [ ] Run `bun docs/balance/generated/hpa-721-early-paid-stock/capture.ts run` once. In order, run `20260503` control/treatment then `20260515` control/treatment. Write each unique attempt marker before any tick. Deep-clone the same pinned start; call `buyEarly` only for treatment. Run exactly 35 `applyGameCommand(game, { kind: 'advanceDay' })` calls with default rules; do not call the progression bot or run a scenario. Log the order receipt (null in control), all daily reports, per-store/SKU units, end-of-day loans and cash, footprint, staff IDs/assignments/salaries, prices, and terminal day. Allow native manager changes to inventory targets and native differences in interest/principal paid or arrears; log them. On unexpected failure, preserve partial evidence and stop rather than retrying. Negative cash is an outcome, not an invalid run.

### Task 3: Reconcile And Interpret

**Files:** Lead-authored `analyze.py`, four immutable arm records, `result.json`, and a checksum file in the new ignored directory `docs/balance/generated/hpa-721-early-paid-stock/`.

- [ ] Run `python3 analyze.py --check` from the evidence directory. Require four unique keys and 140 reports total for a completed trial. Require unchanged footprint, staff identities, assignments and salary (XP can differ), initial lending terms, and fixed prices. Require exact day-30 payroll in each arm, zero payroll on other days, zero new borrowing/refinancing, zero industry/route flows, and unchanged tier receipts after the fork. Assert retail imports only on weekly close and both report/debit identities:
  - `cashAfter = cashBefore + operatingCashFlow + financingCashFlow` each report. First `cashBefore` equals shared start cash less the early receipt; subsequent `cashBefore` equals prior close. Cumulative cash equals shared cash less the separate early receipt plus the sum of native daily changes. Do not double-count the receipt as a native import.
  - For each store/SKU/day, opening units plus early-order units (day one only) plus native imports and warehouse receipts minus sales, waste, and shrink equals ending stock. Reconcile native operating cash and operating income separately to revenue, imports, COGS, payroll, and other costs. Reconcile principal to payments/capitalized interest, and do not subtract overdue principal twice.
- [ ] Show both raw cash and `cash - getTotalAmountDue(game)` at closes 7, 30, and 35. Show early-order spend, actual later import spend, operating cash after the separate purchase debit, COGS-based income, payroll, interest paid, arrears using `getLoanArrearsAmount`, and next scheduled payment. State whether day 35 cash covers that next payment; do not simulate the payment. Give no cash credit for unused inventory or book value. If reporting sales provenance, use `max(0, paid early units - closing units - waste - shrink)` per store/SKU, not all receipts as proven sales.
- [ ] Recommend considering a mechanic only if both treatment seeds have nonnegative cash and no arrears at days 30 and 35, can cover the next payment at day 35, and have a positive `cash - getTotalAmountDue(game)` **difference from their respective controls** at day 35. Otherwise report which witness still fails. This is a diagnostic decision rule, not an HPA-721 acceptance gate, and does not select defaults or authorize a game change.
- [ ] Preserve hashes, raw evidence and the completion/stop receipt. Re-verify original runtime pins, archived input hashes, index, worktree status and dirty-file content, then run `git diff --check`. Do not commit, push, change the PR, or modify live gameplay. Report actual launches and whether an arm stopped before day 35.
