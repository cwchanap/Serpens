# HPA-1199 — Electronics UAT Bug Fixes: Design Specification

**Linear:** https://linear.app/cwchanap/issue/HPA-1199/bug-fix-empty-shelves-store-morale-save-resume-and-ui-bugs-found-in  
**Roadmap:** HPA-717. **Deferred:** HPA-1147 (Backlog; no implementation authorized here).  
**Reviewed base:** `main@0c7f81507398ffe829878956fcae30f8fdfb0fb8`, November 21, 2026.  
**Status:** design/plan revised in response to the GitHub PR #74 review; no runtime fixes, measurements or tests claimed.

## Goal and delivery boundary

Fix the thirteen UAT problems in **the same single draft PR #74** (planning, implementation, tests, screenshots and measured evidence). Preserve deterministic simulation, scenario command capabilities, current-schema saves, existing Svelte components and UI styling. No new subsystem, migration, broad economy tuning, art/SFX generation or separate implementation PR.

## 1. Inventory: stored Par base and effective policy targets

**Source contract:** `createStoreProduct` in `stock.ts:54–68` seeds an initial lot from `demandWeight × 70`, a reorder threshold from `× 25` and a target from `× 90`; imports refill only every seven days (`retailSupply.ts`). The product's `demandWeight` already provides per-product scaling; `createStoreProduct` has no city-demand input, and city demand changes after founding. **Retune only those three default multipliers** against fixed-seed traces and the 50-seed progression sweep. Keep the signature, and do not implement a demand-derived target model or hardcode a single 300/600 stock level.

**Policy contract (resolves review F1):**
- Stored `StoreProduct.reorderThreshold` and `targetStock` are the **Par/balanced baseline**, including player edits and manager-delegation changes. No new “edited” flag or stored policy-scaled copy. Switching policy never mutates those stored values.
- Add one pure `getEffectiveStockLevels(product, inventoryPolicy)` in `stock.ts`. `balanced` reads base values (×1); `lean` applies smaller multipliers; `generous` applies larger multipliers. Scale both threshold and target once **at read time**, with consistent deterministic rounding, threshold ≥ 0, target ≥ threshold and valid FIFO/finite bounds. Choose modest factors by testing; avoid speculative economic retuning.
- `simulateDay.ts:173–177` already resolves effective policy per store. Pass this existing `effectivePolicyByStoreId` to `WeeklyReplenishmentInput` and use it in `retailSupply.ts` for threshold, refill quantity and actual ending-stock report. Import shortfalls remain **unconditional even when cash is negative**; do not add a budget/cash gate or change accounting.
- Update every relevant reader to use the helper: `placement.ts:412–414` founding forecast; `stockRecovery.ts` eligibility/coverage; `supplyPlanner.ts:3347–3353` refill ceiling and cost; `StoreStockTable.svelte` and `TileInspector.svelte` effective-versus-configured display; and all other policy-sensitive target readers discovered by search. `managerDelegation.ts` continues to edit the **base values**, not effective ones. Show both values where the player edits the base.
- If `stock.ts` needs the interval, move `REPLENISHMENT_INTERVAL_DAYS` into `stock.ts` and re-export from `retailSupply.ts`. Avoid a circular dependency or new configuration subsystem.

**Truthful status/risk (resolves review F5):** Reuse `getSellableDemandCap` from `managerDelegation.ts:388–410` by extracting the pure last-seven-reports calculation into `stockRecovery.ts`; keep manager delegation using it. The recovery view already knows `getNextReplenishmentCheckDay` and can compute (a) **effective target below the full-cycle cap**, and (b) **current stock below ceil(cycleCap × days until next check / 7)**. This can drive contextual **At risk** status and a localized cycle warning. Extend the closed `StoreProductStatus` union and update `gameCopy.ts` and its UI consumers; let `getStoreProductStatus` accept **optional precomputed risk context** so existing product-only callers retain truthful on-hand states without `stock.ts` importing `stockRecovery.ts`. Priority: Out of stock > Needs import > At risk > Healthy. With no report history, say coverage is unverified rather than asserting seven-day sufficiency; keep *last-day stockout loss* explicitly historical. No persisted risk field or duplicate component math.

**Deterministic anchors:** Harbor electronics, Harbor City (32,20), seed `20260503`, 28 days: ticket measured $24,854 revenue and 20 zero-revenue days under default targets. Manual targets 300/600 were diagnostics, not fixed requirements. Commit a unit/spec trace that asserts **fewer than 20 zero-revenue days** under the corrected defaults and reports import spend/cash. Test first stock lot, multiple seven-day checks, all three policy tiers, per-store overrides, player edits, local supply, and the exact report/accounting quantities. Run the progression sweep **immediately after inventory changes**, before the remaining work.

## 2. Staff morale, warnings, hiring and balance-bot correctness

**Morale:** `simulateDay.ts:615–625` subtracts an unconditional `3` morale points/day even when default staffing/service policies contribute zero. Replace the drift with a bounded pull toward the assigned employees' average morale while keeping manager quality, staffing/service tier, shortage and overload penalties. `summarizeStoreStaffing` already falls back to store morale when no employees are assigned, avoiding a new zero-staff algorithm. Commit a deterministic **60+ day fully staffed default-policy** trace (meaningfully above zero) plus understaffed/low-morale/policy negative cases. Check store capacity, employee morale and aggregate scorecard remain deterministic.

**One warning source:** Extract pure `getStaffingShortageWarnings(summary, storeId)` into `staffing.ts`. Both `simulateDay.ts` and live `StoreOverview.svelte` consume it. On the overview, **replace** the report's `shortManager`/`shortGeneral` codes with current warnings, but retain the report's other historical warnings. Do not add UI-specific duplicate criteria/dedupe. Successful level-up should visibly acknowledge increased staffing requirement and show new shortages; rejected/no-op upgrades should not.

**Auto assignment:** `hireCandidate` assigns the new role to the **first store in `game.stores` order** with a shortage in that role. Otherwise keep Unassigned. Do not depend on UI selection. Scenario `hireStaff` uses the same transition. The balance bot (`tests/balance/bots.ts:323–347`) currently searches the first unassigned staffer, which breaks after auto-assign. Identify the hired staff by the stable ID derived from the candidate ID, skip redundant assignment if already in the bot's desired store, and reassign only when needed to preserve the existing bot strategy. Test baseline bot parity, scenarios, and multiple-store ties. Keep the **same corrected bot harness** for both base-runtime and new-runtime economy comparisons.

**Candidate names and labels:** `generateHiringCandidates` must consume exactly the same RNG draws as before. Resolve duplicate full names *after* the original first/last random draws, by deterministically stepping name indices through unused combinations without more RNG calls. With five candidates and the existing name pool this is bounded. Retain opaque IDs for identity/commands but remove them from hire accessibility labels in English, Japanese and Traditional Chinese.

## 3. Startup autosave and an explicit New Game command

`GameRouteController.initializeSaves` currently initializes storage but may auto-write an existing in-memory game before reading persisted data; normal page startup only resumes on `?ui-comparison=1`.

- **In the existing controller:** initialize repository, read/adopt a valid sandbox autosave **before any write**; preserve independent scenario initialization/resume. Distinguish absent, invalid and failed reads; block destructive founding while save status is unresolved. Normal mount should not need a special URL parameter to resume. The `ui-comparison` query may retain test-only read-only selection behavior.
- **New Game must be added** (it does not exist today) to the existing Saves dialog through `GameRouteController` -> `saveUi.svelte.ts` -> `SavePanelHost.svelte` -> `SavePanel.svelte`. Reuse `ScenarioMenuSection.svelte`'s inline confirmation pattern rather than a new modal.
- Confirmation in sandbox clears **only in-memory sandbox** and returns to founding, **not** the persistent autosave. Cancelling leaves everything unchanged. If the player reloads before founding again, the prior autosave resumes. The first successful new founding replaces the old autosave through existing mutation/autosave flow. Disable the action during an active scenario and prevent accidental overwrites on storage errors. No save-schema migration/deletion code.

Tests cover save vs no-save startup, corrupt/read-error state, asynchronous initial load, scenario isolation, cancel/confirm, reload-before-refounding and successful new founding persistence.

## 4. Existing UI, art and localization repairs

| Finding | Narrow implementation |
| --- | --- |
| #4 electronics Accessories image | `gameArt.ts`: point product `accessories` to existing `/assets/game/industry/materials/electronic-accessories.png`; **delete orphaned** `static/assets/game/products/accessories.png` (after verifying no remaining runtime references) and update `gameArt.spec.ts` completeness. Fashion accessories unchanged; no new art. |
| #5 staffing | Live warnings from shared helper, deterministic auto-assignment, level-up headcount acknowledgement; no new panel. |
| #6 stock table | Base and effective target display, distinguish historical stockout from current risk; 1440px LATEST column visible/reachable via existing scroll/reflow. |
| #7 industry inspector | Targeted wrapping/spacing for two-line Accessory Assembly Plant heading and eyebrow. |
| #8 convenience assumptions | `BuildMenu.svelte` derives quick product chips from current stores' saleable products; `TopBar.svelte` / `RouteHeader.svelte` prioritize material inventory/chain relevance from those stores rather than always showing grain/flour/oilseeds. Keep a stable no-store fallback and full product filter. |
| #9 missing Logistics | Add `game.managementPanels.logistics` to **en.ts, ja.ts and zh-Hant.ts**. In `en.ts` constrain `managementPanels` with `satisfies Record<ManagementPanelId, string>` (type-only import). English currently humanizes the missing key, masking the bug; enforce compile-time completeness. |
| #10 saves title | Replace EN `Desktop Saves` with neutral “Saves”, and check equivalent locale headings. |
| #11 candidate names | Distinct name per market batch with **zero extra RNG draws**; hire accessibility labels omit internal IDs. |
| #12 Profit 0 | `buildScorecard` produces a **0–100 rolling profit score based on operating cash flow**, which need not follow positive operating income. Test the reported discrepancy; fix incorrect math if found, otherwise relabel as *Profit score*, explain its meaning and show recorded daily income elsewhere without changing scoring logic. |
| #13 results screen | Improve the outcome/medal hierarchy using existing paper/brass styles; hide the empty founding backdrop while terminal results are shown. Preserve terminal state/focus and existing scenario evidence. |

**Visual parity:** compare browser-MCP 1440px and narrow screenshots to HPA-1199 attachments; no independent UI mockup or new layout. Browser E2E suffices; no native Tauri acceptance for non-platform-specific changes.

## 5. Evidence, scope and review

- Pin baseline and final runtime SHAs. Run equivalent **corrected bot harness** on both to avoid a bot-induced comparison artifact; check and disclose whether correcting the existing first-unassigned-staffer bug changes the historical baseline; do not demand identical outputs from different harnesses.
- Reuse `tests/balance/progressionRun.ts`, `progressionCalibration.ts` and **`progressionDiff.ts --base <base-artifact> --head <head-artifact>`** instead of hand-rolling a summary. Run 50 seeds × 365 days for all four archetypes **after stock step and again at final head**. Record per-tier reach/timing, final cash, zero-revenue days, import spend, morale. Quote actual tool outputs in `docs/balance/hpa-1199-uat-evidence.md`.
- Gate A remains **5/5** with `bun run balance`; official scenario reference and no-action contracts, unit/browser E2E and screenshots remain automated acceptance checks.
- Ticket's historical source `0c7f815` reported tier 3 reached in 158/200, tier 4 in 42/200, tier 5 in 41/200 (last two boutique only), 189/200 negative final-cash runs, and electronics median −$51,464. These are historical, **not** final measurements or an economy-profitability gate.
- HPA-1147 owns founding profitability, marginal expansion, local production economics, and wider retuning. The HPA-1199 ticket requests economy-number review **before merge**; keep the single PR draft during that review. Manual approval is **not** an automated acceptance criterion.

**Current state:** planning docs only; no runtime code or tests executed.
