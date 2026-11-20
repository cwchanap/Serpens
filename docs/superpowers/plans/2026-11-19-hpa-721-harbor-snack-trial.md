# HPA-721 Harbor Snack Demand Trial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Follow the checkboxes in order. Do not commit the temporary treatment.

**Goal:** Test whether more Harbor snack demand makes two convenience stores with paid weekly stock viable through first payroll and the following restock.

**Architecture:** Reconstruct two disposable copies of the restored source with the same reviewed Tier 5 diff. Change only Harbor's snacks demand entry in the treatment. Each matched pair starts from the same verified snapshot with player-set inventory targets; scenarios instead use their unchanged authored starts and commands.

**Tech Stack:** Bun 1.3.14, TypeScript, Vitest, Python 3, Git.

**Spec:** This plan restates the bounded diagnostic sized in `docs/balance/generated/hpa-721-marketing-policy-screen/weekly-and-fixed-stock-result.json`. It tests one demand lever given adequate paid stock. It does not test whether the unchanged bot uses these inventory targets or whether the extra sales can fund the initial cost of store two.

## Global Constraints

- Treatment only: in `src/lib/game/worldCatalog.ts`, Harbor City's `retailDemandProfile: {}` becomes `retailDemandProfile: { snacks: 1.2 }`. Control keeps implicit `1`. Every other city and SKU is unchanged. No custom demand multiplier or scenario override.
- In the 35-day pairs only, both stores set water threshold and target to **450**, and snacks threshold and target to **400**. Stop the inherited inventory delegation with the native player action so it cannot change these targets. Do not change any manager code or default. Targets match across arms; actual quantities and spending can differ with sales.
- Preserve the same two level-1 Harbor stores, day-one lots, Awareness marketing, shelf/import prices **6/1 for water, 8/2 for snacks**, staff, payroll, founding debt and loan terms. No early delivery, free stock, upgrades, new stores/cities, industry, discretionary event resolutions, or new credit after divergence. Keep weekly restocking after sales, scenario fixtures, scores, deadlines, progression and acceptance gates unchanged.
- At most 14 authored scenario plays per arm. After both pass, at most four 35-day trajectories, control and treatment for each of `20260503` and `20260515`, closing reports 1–35 and terminal day 36. No retries, fallback values, native progression runs or official matrix. Preserve invalid/partial evidence and stop, rather than fixing an arm after launch.

## Review Focus

- A copied baseline or global tuning edit can erase the comparison: prove the one-line source diff and exact case-level change in the native demand pool before any launch.
- Inventory target edits are not deliveries: prove existing lots and cash are unchanged on day one; reconcile every native paid receipt, starting with the day-7 check after sales.
- Demand can change teaching even with unchanged prices: run both arms against the restored control and existing scenario criteria with no repins.
- Borrowed cash, missed payments or unsold inventory can look like profit: preserve actual opening liabilities, count actual debits, and compare cash net of principal and unpaid interest.
- A short cash improvement can coexist with weak recurring income: require nonnegative daily cash, two checkpoint results, positive recurring operating income, and higher realized snack sales in both treatment seeds before recommending further study.

### Task 1: Pin Both Sources And Shared Starts

**Files:** Scratch `src/lib/game/worldCatalog.ts`, `docs/balance/generated/hpa-721-harbor-snack-trial/{verify-setup.ts,capture.ts}`, and read-only archives.

- [ ] Snapshot live HEAD, status, index, diffs and dirty-file hashes. Confirm the linked worktree, then export `95ff7dfb5be9ddc04241029aeb01286eeba3002c` into a fresh control directory with `git archive`. Verify the reviewed diff and `git apply --check` before applying it in the export. Verify all 480 runtime hashes before cloning the control to a treatment directory. Use separate private `bun install --frozen-lockfile --ignore-scripts` and `./node_modules/.bin/svelte-kit sync`; do not regenerate in the live workspace.

| Source or evidence | SHA-256 |
| --- | --- |
| `.superpowers/sdd/2026-11-17-hpa-721-tier5-operating-month/final-source.diff` | `71de5c47239fcdc7dcc87fdff9bb18ad3be6aa956b34c7ae95b1da1aab038c62` |
| `hpa-721-tier5-operating-month-screen-lock.json` | `83621b6e07dfb75a1c930ae76ccb6b4c4c4eb247b66c1da5d1c582b60e79df94` |
| `hpa-721-early-paid-stock/result.json` | `b198ee62788599e1ff8da76cd1ac648168bdb24fb31b360834690aa5ebd77d9e` |
| `hpa-721-marketing-policy-screen/weekly-and-fixed-stock-result.json` | `d181dabd863fc41bd38aebb27b68d40ed122cc670e7d8a93d4631b042c0a879e` |
| `hpa-721-marketing-policy-screen/founding-result.json` | `f46dbf3c5005be8085982466d83ce2126b4756350e96d4785f05292211eb13a3` |

- [ ] Treat path entries without `.superpowers/` as relative to `docs/balance/generated/`. Validate the **unmodified** `start-<seed>.json` bytes using the early-paid-stock receipt, not its treatment output. Implement `prepare(start: GameState): GameState`: call `removeManagerDelegation(start, 'staff-store-1-manager-1')`; require it removes the sole delegation. Then call `applyGameCommand(game, { kind: 'updateStoreInventoryTargets', storeId, productId, reorderThreshold: target, targetStock: target })` in `store-1`, `store-2` order, water then snacks. Require accepted, changed actions. Record exact commands; apply no other pre-tick transition. Use the same verified resulting JSON in both arms.
- [ ] Run `bun docs/balance/generated/hpa-721-harbor-snack-trial/verify-setup.ts control "$out"` from the control. Check the hashes below, two level-1 Harbor stores, empty reports, unchanged finance/staff/RNG and decision state, unchanged day-one lots (**84 water and 70 snacks per store**), and zero cash spent by the settings commands. Verify pure `buildCityDemandPools` returns water **147** and snacks **122** for both fixtures. Save both starts once with exclusive creation.

| Seed | Starting cash | Founding principal | Day-30 payroll | Shared start `sha256(JSON.stringify(game))` |
| --- | ---: | ---: | ---: | --- |
| `20260503` | 9,309 | 8,000 | 21,437 | `e1cf5ae1804b7ae56bfd21f68487697448aa47e10913031529994d671285fda9` |
| `20260515` | 9,760 | 8,000 | 21,756 | `acfe36226c92b56d51d8467f5b52a28db0eb91513d3de7afcdfe5c1aabc08a59` |

- [ ] Run the same verification with `treatment` before patching. This mode verifies the saved starts without rewriting them. Require failure specifically because Harbor snack pool is **122**, not **146 or 147**. Apply the single catalog line to the treatment only; require exact `worldCatalog.ts` SHA-256 `f7ae99ee28b0d2d52e47eaa329f185f11242ba835bfece5c15f8e24b2d3fcdf8`. Confirm multiplier `1.2`, unchanged water pool, and snack pool in `146..147`, equal to `Math.round(unroundedHarborPool * 1.2)`. Use the buildable-tile mean of `demand + 0.6 * footTraffic + 0.35 * customerFit` times snack demand weight for `unroundedHarborPool`, not the rounded control pool. Require all other catalog entries and both start hashes unchanged. Archive the one-line diff and both manifests; stop on any other source/test difference.
- [ ] In each arm run `bun run test:unit -- --run src/lib/game/retailSupply.spec.ts` then `bun run test:unit -- --run src/lib/game/retailUnitEconomics.spec.ts -t 'repaired founding unit economics'`. Require all replenishment tests and the four selected founding checks to pass. The filter intentionally excludes the electronics multi-day tests. Do not run full-unit or balance suites as a preflight.

### Task 2: Gate The Authored Scenarios

**Files:** New ignored `docs/balance/generated/hpa-721-harbor-snack-trial/` for the copied recipe, new locks, logs and raw results. The lead verifies the inputs and gate; no semantic changes are needed to the recipes.

- [ ] Copy byte-for-byte `scenario-capture.ts` and `scenario-check.py` from `hpa-721-starter-water-trial/`; hashes below. Place capture at `docs/balance/generated/scenario-capture.ts` in each export; keep the same bytes in the evidence directory with the checker. Reverify reference constants and calibration helper slices against the exports' `src/lib/scenarios/runtime.spec.ts`, using the same slice checks as `prepare-scenarios.py` from the water run. Lock the two exports and the copied recipe plus immutable inputs below. Create a **new** evidence `scenario-lock.json` containing a `files` map for the two recipes and the manifest receipt; don't reuse the water lock or its verdict.

| Scenario input | SHA-256 |
| --- | --- |
| `hpa-721-starter-water-trial/scenario-capture.ts` | `2466132a0f8c62b87db8ad5664dae87b2be47d3e9a736856fc7064a75ecb4c41` |
| `hpa-721-starter-water-trial/scenario-check.py` | `e1eba90457ab0e624868ead3e51b2e700efac4e53fa4f3e47b952b0514914de4` |
| `hpa-721-linked-screen-head-scenario-replay.ts` | `6d8875f3694c91d6b9f5a789a952c127b1b7123a568928ce32012da97b0eb511` |
| `hpa-721-linked-screen-head-scenario-results.json` | `2ffe4da4cd2e7bab816188fa411102c9a430ea4e8236fbc8011e65621ebaad45` |
| `hpa-721-joint-recovery-r1-scenario-evaluation.json` | `7fce20f1b653289161e38dfc872a32f3812a98a5aa8c9b10f8a8058dc931dcb5` |
| `hpa-721-joint-recovery-r2-scenario-evaluate.py` | `6a9bc2ed9a07e48b37aeee541639a477801364a7db5d549303675a3b490f3395` |

- [ ] Run `python3 scenario-check.py --self-check` from the evidence directory. Require rejection of missing and duplicate cases, changed control anchor, changed First Profit pin, downgraded reference medal and wrong hashes. Then run `bun docs/balance/generated/scenario-capture.ts control "$out"` in control and `bun docs/balance/generated/scenario-capture.ts treatment "$out"` in treatment, once each. Use the same authored no-action/reference plays; **no** new inventory commands in scenarios.
- [ ] Run `python3 scenario-check.py --check` from the evidence directory. Require 14 valid rows in each arm; exact control results and RNG; unchanged outcome/medal separation and deadlines; all seven references gold; First Profit day 4 **682/bronze and 862/gold**, reference positive COGS-based income. Archive numeric and timing drift without repinning or modifying scenario inputs. Any rejection, blocked receipt, missing hash, or raw-output error means **zero** 35-day launches. Recheck source manifests and hash the passing receipt and both raw files before unlocking Task 3.

### Task 3: Run And Reconcile Four Matched Openings

**Files:** Lead-authored `capture.ts` and `analyze.py`, exclusive attempt markers, per-arm JSONL, `result.json` and checksums in the new evidence directory.

- [ ] Reuse the early-paid-stock recorder's daily snapshot fields and the principal, interest, cash, and per-SKU reconciliation. Omit its hypothetical purchase and associated assertions. `run <arm> <absolute-output>` must verify the scenario receipt, both raw hashes, source manifest, and the two prepared start hashes before launching anything. Record the attempt before the first tick. Run `bun docs/balance/generated/hpa-721-harbor-snack-trial/capture.ts run control "$out"` in control; then `bun docs/balance/generated/hpa-721-harbor-snack-trial/capture.ts run treatment "$out"` in treatment. Each advances seeds `20260503`, `20260515` in order, only by `applyGameCommand(game, { kind: 'advanceDay' })` with default rules. Save reports 1–35 and terminal day 36; do not simulate that day's payment.
- [ ] Require unchanged footprint, staffing, target/threshold pairs, policy, prices, founding loan contract, and no new borrowing, industries, claims, or manual stock operations. Use the exact day-30 payroll pins. Reconcile all 140 reports and 560 SKU balances. Require no paid deliveries before the native day-7 check and no off-cadence paid receipts. At each weekly close reconcile paid units against the post-sales threshold and target: if below threshold, `target - postSalesStock`; otherwise zero. Charge actual unit import cost. At day 7 the empty-shelf quote is **2,500** across both stores; if stock remains, record the lower actual debit and explain it. Require stock, cash, separate COGS-based income, and finance roll-forwards to tie without imputed sales or credits for closing inventory.
- [ ] Run `python3 analyze.py --check` on the captured outputs. Report realized snack sales and total contribution, paid stock, daily minimum cash, actual cash, arrears and `cash - getTotalAmountDue(game)` at closes 7, 30 and 35, plus coverage of the **current quote** for day 36. Report days 8–35 operating income with payroll prorated over `28 / 30`; add back only the report's payroll debit, then charge that fraction of monthly payroll. State how the results compare with the paper screen without replacing missing or failed observations.
- [ ] Recommend a native adoption investigation only if **both** treatments have nonnegative cash at every close, zero arrears at closes 30 and 35, cover the day-36 quote with day-35 cash, have positive prorated operating income for days 8–35, sell more snacks through day 35 than control, and improve `cash - getTotalAmountDue(game)` at day 35 versus their controls. Negative cash is a valid finding, not permission to retry. A pass would justify investigating native uptake, not establish incremental store payback, progression equity, or acceptance.
- [ ] Preserve receipts, raw outputs, stop or completion verdict, and checksums. Verify source, archived inputs, live status/index and dirty-file contents against the opening pins; run `git diff --check`. Do not change live gameplay, the PR, or any acceptance status. Disclose actual launches, including zero if Task 2 stops.
