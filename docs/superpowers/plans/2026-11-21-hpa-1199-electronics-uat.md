# HPA-1199 — Electronics UAT Fixes: Single-PR Implementation Plan

**Issue:** https://linear.app/cwchanap/issue/HPA-1199/bug-fix-empty-shelves-store-morale-save-resume-and-ui-bugs-found-in  
**Design:** `docs/superpowers/specs/2026-11-21-hpa-1199-electronics-uat-design.md`  
**Delivery:** Existing **draft PR #74**, `docs/hpa-1199-electronics-uat-fixes` → `main`. Complete all implementation, code/tests, visual checks and measured evidence **in this one PR**.  
**Inspected base:** `main@0c7f81507398ffe829878956fcae30f8fdfb0fb8`, November 21, 2026.  
**Status:** revised after the GitHub design review; **documentation only**. No code fix, measurements or passing test claimed.

## Rules and order

Use current simulation and UI owners; keep KISS/YAGNI. No new inventory/state subsystems, save migrations, artificial cash gates, broad HPA-1147 economy tuning, new layout, art/SFX generation or another implementation PR. Preserve current-schema saved games, scenario permissions and deterministic seeds.

**Commit order within this PR:** first the no-balance-impact UI/i18n/art fixes (distinct, reviewable commits), then stock and morale/staffing (economy-affecting commits), then autosave/new-game flow, tests and evidence. Fix `tests/balance/bots.ts` **before** starting a comparative economy run. Do not hide balance impact in a UI-only commit.

## Step 0 — Recheck baseline, reproduce and normalize the measurement harness

- [ ] Check current `main` against pinned SHA before coding; update both docs on the **same PR** if code ownership changed. Re-read `CLAUDE.md` and the actual `stock.ts`, `retailSupply.ts`, `placement.ts`, `stockRecovery.ts`, `supplyPlanner.ts`, `simulateDay.ts`, `staffing.ts`, `managerDelegation.ts`, `gameRouteController.ts`, `SavePanel`/`saveUi`, i18n and tests.
- [ ] Reproduce ticket cases and capture source-specific before snapshots: Harbor City (32,20) electronics, seed `20260503`, 28 days (reported default revenue $24,854, 20 zero-revenue days); full-staffed 60+ day store morale/employee morale; fresh versus resumed save; scorecard Profit 0 with positive daily operating income; ticket screenshot defects.
- [ ] **Repair the balance bot's hiring identity assumption first**: `tests/balance/bots.ts:323–347` uses the first unassigned staffer after hiring. Look up the new hire by deterministic staff ID derived from candidate ID instead. Skip an assignment if the hire is already assigned to the intended store; otherwise use the existing assignment command. Add a focused bot regression test, including an **older unassigned employee**. Avoid an unrelated change to bot spending/playbooks.
- [ ] Run the **same corrected harness** on the pinned base runtime and subsequent implementation runtime, using separate source/output directories. If harness-only baseline differs from historical output, **report this fact explicitly** rather than claiming identical historical behavior. Verify harness/test source hashes so bot drift cannot contaminate the before/after economy comparison.
- [ ] Generate the pinned baseline `bun run balance` and `progressionRun` artifacts and make those exact JSON artifacts available for `progressionDiff`. Keep generated bulk files untracked; put only summarized measured evidence and reproduction commands in `docs/balance/hpa-1199-uat-evidence.md` when available.

**Gate:** source SHA, defects and measurement harness are pinned. This is not an implementation-pass claim.

## Step 1 — Apply zero-balance-impact UI, locale and art fixes first

Make small component/spec updates; preserve existing paper/brass design and current state flows.

- [ ] **Accessory art:** repoint `PRODUCT_ART.accessories` in `src/lib/assets/gameArt.ts` to the existing `/assets/game/industry/materials/electronic-accessories.png`. Search references and **remove orphaned** `static/assets/game/products/accessories.png` in the same commit; update `gameArt.spec.ts` completeness/registry assertions. Do not affect fashion accessories. No new assets.
- [ ] **Localization:** add `game.managementPanels.logistics` in `en.ts`, `ja.ts` and `zh-Hant.ts`. Add `satisfies Record<ManagementPanelId, string>` to **EN managementPanels** (type-only import from `keyboardShortcuts.ts`), so future omissions fail typecheck. Replace EN “Desktop Saves” with “Saves” and verify neutral localized headings. Add key-parity and rendered menu tests.
- [ ] **Inspector/table:** fix `IndustryTileInspector.svelte` long-title/eyebrow wrapping, and `StoreStockTable.svelte` horizontal overflow so **LATEST** is visible or clearly reachable at 1440px. Update stock-table risk wording after the Step 2 read model is implemented; do not invent an independent status rule now.
- [ ] **Build/header relevance:** replace hardcoded `quickProductIds` in `BuildMenu.svelte` with stable product IDs from stores' actual saleable products; preserve search/all-products and a sensible no-store fallback. Replace `TopBar.svelte`'s grain/flour/oilseeds defaults with three relevant inventory/material-chain readouts based on current stores and actual city inventory, passed through `RouteHeader.svelte`. Test electronics/convenience/multiple stores/empty state.
- [ ] **Results dialog and scorecard labels:** use existing styling to distinguish challenge name, outcome, medal and score; keep terminal result in front of empty founding instead of displaying a fake new game behind it. Confirm `buildScorecard`'s rolling 0–100 semantics before changing math; label “Profit score” and show actual daily operating result separately, unless a reproducible arithmetic defect justifies a source fix. Add positive-income/low-score test; do not retune scenario scores by relabeling.

**Gate:** mounted component tests plus **MCP browser screenshots** at 1440px and narrow width; compare the supplied ticket references for art, menu, overflow, inspector, and challenge results. No economy settings changed by these commits.

## Step 2 — Fix the seven-day stock/default policy contract

**Touch:** `src/lib/game/stock.ts`, `retailSupply.ts`, `placement.ts`, `stockRecovery.ts`, `managerDelegation.ts`, `supplyPlanner.ts`, `simulateDay.ts`, `StoreStockTable.svelte`, `TileInspector.svelte`, `gameCopy.ts`, their specs and messages.

- [ ] **RED** unit/spec trace: seed `20260503`, tile (32,20), 28 days; require **fewer than 20 zero-revenue days** on final defaults, while recording imported units/spend, revenue, debt-adjusted cash and stockout-lost units. Cover first stocked lot, day-7 and subsequent refill boundaries, and each archetype's default product mix.
- [ ] Retune the **three `demandWeight` multipliers** of `createStoreProduct` (initial lot, threshold, target) as constants. Test the cross-archetype consequences; no per-city dynamic target formula or fixed universal 600.
- [ ] Add pure `getEffectiveStockLevels(product, policy.inventory)` in `stock.ts` with stored **Par base** and two monotonic scaling policies. Normalize rounding and valid target/threshold bounds. Player edits and manager playbook continue editing the stored base; policy switching never writes to products. If needed, relocate seven-day cadence constant down to `stock.ts` and re-export from `retailSupply.ts` without a dependency cycle.
- [ ] Add `effectivePolicyByStoreId` (already created by `simulateDay`) to `WeeklyReplenishmentInput`. Use effective threshold and target to trigger and fulfill orders; report **actual** post-refill stock. Explicitly retain unconditional imports and potential negative cash; **do not test for or create a refill budget gate**.
- [ ] Route the effective levels through `placement.ts` forecasting, `stockRecovery.ts` eligibility, `supplyPlanner.ts` ceiling/cost, and `StoreStockTable.svelte` / `TileInspector.svelte` base-vs-effective display. Search all raw `targetStock`/`reorderThreshold` consumers and document intentional base-value writers.
- [ ] Extract the existing last-seven-reports `getSellableDemandCap` into `stockRecovery.ts` (reuse in `managerDelegation.ts`). Use its **current-stock vs remaining-days cap** and **effective-target vs full-cycle cap** checks to compute contextual **At risk** status. Feed precomputed risk into the `stock.ts` status helper (optional parameter; no stock→recovery cycle), localize all four status values, and distinguish current stock from *last-day* stockout evidence. No-history state does not falsely certify seven-day coverage.
- [ ] Test per-store/scoped effective policies, Lean < Par < Deep at comparable allowed conditions, direct custom base edit, manager adjustment, local city-supply/import fallback, FIFO accounting, unchanged seed determinism and report/planner/forecast agreement.
- [ ] **Immediate economy gate, before proceeding to staffing/saves:** run `bun run balance` and a complete 50-seed × 365-day `progressionRun` **on this stock-only commit**, compare to pinned base with existing `progressionDiff`. Record tier reach by archetype and median cash/negative-run count. If Gate A/scenarios break or constants overfit electronics at other archetypes' expense, adjust **within this PR** before Step 3.

**End-to-end gate:** MCP/browser set Lean/Par/Deep -> inspect *effective* target -> advance across day-7 refill -> verify actual stock, import expense, next forecast, planner ceiling and stock risk all agree; no phantom stock or money.

## Step 3 — Fix morale, staffing warnings, hiring and deterministic names

**Touch:** `simulateDay.ts`, `staffing.ts`, `StoreOverview.svelte`, `StaffPanel.svelte`, `TileInspector.svelte`, scenario/bot tests and locale copy.

- [ ] **RED** committed 60+ day deterministic morale test: fully staffed defaults with assigned employees holding 60–80 morale must stabilize rather than drift to zero (choose/pin an explicit lower bound such as 35 using actual seeded fixture). Add poor-morale, zero-staff, shortage, service-tier, and capacity counterexamples. Replace the unconditional `-3` with bounded convergence toward employee morale while retaining the existing penalties and score clamps.
- [ ] Create one pure `getStaffingShortageWarnings(summary, storeId)` in `staffing.ts`; have the daily report and `StoreOverview` consume it. The overview replaces outdated `shortManager`/`shortGeneral` from its last report with *current* values, leaving other historical warnings intact; no parallel UI warning rules or dedupe logic. Test a **new 0% staffed store before first day** and an upgrade increasing the required headcount.
- [ ] `hireCandidate` auto-assigns to the **first `game.stores` entry missing the hired role**; otherwise Unassigned. Do not use a selected UI store or a second assignment command. Keep explicit assignments/reassignments and scenario permission gates unchanged. Verify the corrected `tests/balance/bots.ts` exact-hire lookup does not misassign an older idle staffer, and run the official scenario reference tests here.
- [ ] For duplicate hiring-market names, keep the original first+last RNG draws exactly; walk unused name combinations deterministically on collisions with **zero extra RNG consumption**. Add same-seed `rngState` assertions for collision and noncollision batches. Remove internal IDs from hire accessibility labels in EN/JA/zh-Hant; distinguish by name/role without exposing implementation IDs.

**End-to-end gate:** MCP browser create unstaffed store -> immediate warnings -> hire manager/general and auto-assign -> inspect live coverage -> upgrade to higher headcount -> warning updates -> hire to fill gap -> advance days and observe nonzero stable morale.

## Step 4 — Safe startup resume and new-game flow (one commit together)

**Touch:** `gameRouteController.ts`, `saveUi.svelte.ts`, `SavePanelHost.svelte`, `SavePanel.svelte`, `+page.svelte`, controller/page/browser tests and i18n strings.

- [ ] RED controller + browser tests for empty saves, valid persisted day-N autosave, corrupt/read-error save, concurrent scenario bootstrap, cancellation, confirmed new game, and reload **before** a new founding store. Verify save records never mutate during unsuccessful startup.
- [ ] Put automatic sandbox resume in `GameRouteController.initializeSaves`: read/adopt persisted game **before any autosave write** and before founding becomes interactive. Normal app startup no longer depends on `?ui-comparison=1`; keep that query only for explicit test selection if needed. Preserve isolated scenario initialization and manual save workflows.
- [ ] Add a sandbox **New Game** controller command and wire it into the existing **Saves** dialog. Inline confirmation follows `ScenarioMenuSection.svelte`, not a new modal. Cancel = no-op; confirm = clear **memory only**, return to founding, **do not delete autosave**. If the app reloads before founding again, old autosave must return; successful new founding is the first point at which current autosave may be replaced. Disable this action for active scenarios.
- [ ] On storage failure, preserve prior stored data and show existing diagnostic; no automatic overwrite or migration. Test controller and real browser refresh/restore, with deterministic saved state inspection.

**End-to-end gate:** MCP browser found -> simulate/snapshot/save -> reload into exact same day/stores/cash/stock -> choose New Game and cancel -> reload unchanged -> confirm New Game -> reload **before** founding still restores old save -> confirm again and found a different shop -> reload restores the newly founded shop. Verify scenario save remains independent.

## Step 5 — Final automated and MCP E2E acceptance

Every checkbox is a machine-testable or visual-verification condition; no human sign-off is used as acceptance.

- [ ] `bun run check`, `bun run lint`, `bun run test:unit -- --run`, `bun run test:e2e` and `git diff --check main...HEAD` pass on the final head. Add focused tests for every changed game rule, UI behaviour and save command; no skipped tests or blanket fixture regeneration.
- [ ] **MCP browser E2E** runs stock -> policy -> refill -> sales/report -> staff -> upgrade -> warning -> autosave/reload -> new-game confirmation, with persisted state and accounting assertions, not text-only checks. **One browser platform is enough**; native Tauri acceptance is not required.
- [ ] **MCP challenge E2E** completes a seeded official scenario and verifies objective/medal/report semantics remain correct; terminal results stay visually separated from founding. Validate scenario `hireStaff` follows the updated assignment rule.
- [ ] **Visual screenshot check:** at 1440px and narrower, compare actual rendered screenshots against the Linear issue's attached UAT screenshots (no independent mockup): electronics icon vs purse, stock LATEST/at-risk status, inspector two-line eyebrow/title, quick filters/material header, live staff warnings, candidate label, translated JA/zh-Hant Logistics, neutral Saves, challenge-results hierarchy. No clipped/overlapping elements or unintended skin changes.
- [ ] **Unit/spec economics:** seeded Harbor 28-day stock test has fewer than 20 zero-revenue days with measured paid import/cash; default fully staffed 60+ day morale remains over pinned floor; bad staffing/policy still has negative consequence. All tests deterministic without additional candidate RNG draws.
- [ ] **Balance Gate A: 5/5** on final HEAD (`bun run balance`); official scenario reference and no-action guard runs pass. Use the same corrected bot harness for base and final HEAD, recording exact runtime/harness identities.
- [ ] **Progression measurement:** rerun `progressionRun` 50 seeds × 365 days on final HEAD and `progressionDiff` against pinned base. Confirm per-archetype tier 1–5 reach (including p10/median/p90 where available), final cash distribution, negative final-cash count, stockout-day and staffing effects. Disclose regressions; HPA-1147 economics are **not** smuggled into this PR.
- [ ] Commit `docs/balance/hpa-1199-uat-evidence.md` with exact base/intermediate/final source SHAs, corrected bot-harness hash, CLI invocations, actual before/after results, failed/retuned candidates if any, and screenshot references. Update this PR description to point to evidence.

### Measurement commands (each source/phase in isolated output directory)

```sh
bun run balance
bun tests/balance/progressionRun.ts --seeds 20260501..20260550 --days 365 --output <output-dir>
bun tests/balance/progressionDiff.ts --base <base-artifact.json> --head <head-artifact.json>
```

The ticket's historical reference at `0c7f815` says tier 3 158/200, tier 4 42/200 and tier 5 41/200 (boutique only), 189/200 negative final cash, electronics median −$51,464. **Do not reuse those values as an implementation result** or mistake Harbor improvement for proof of overall economy health.

## Merge/review hold — distinct from acceptance

HPA-1199 requests owner review of the economic before/after numbers before merge. Keep **this same PR in draft** during that review. Manual approval is **not** a test acceptance criterion, and HPA-1147 remains in Backlog with no authorized follow-up run.

**Status:** plan/docs only; implementation and evidence pending.
