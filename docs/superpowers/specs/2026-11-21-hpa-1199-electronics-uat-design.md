# HPA-1199 — Electronics UAT Bug Fixes: Design Specification

**Linear:** https://linear.app/cwchanap/issue/HPA-1199/bug-fix-empty-shelves-store-morale-save-resume-and-ui-bugs-found-in  
**Roadmap:** HPA-717  
**Related deferred balance work:** HPA-1147 (Backlog; **not** authorized here)  
**Inspected base:** `main@0c7f81507398ffe829878956fcae30f8fdfb0fb8` (2026-11-21)  
**Status:** proposed design / documentation-only draft; no runtime changes, measurements or passing tests claimed.

## Goal and delivery boundary

Resolve all thirteen player-observed problems in HPA-1199 within **one implementation PR**, continuing on the branch that carries this spec and its plan. Restore trustworthy shop operation, autosave launch, staffing actions and UI evidence without introducing new gameplay systems, layouts, generated art, persistence migrations or a follow-up implementation PR.

Preserve the deterministic game state and existing ownership: `stock.ts` and `retailSupply.ts` for inventory; `simulateDay.ts` for operating effects; `staffing.ts` for hires; `gameRouteController.ts` and `saveUi.svelte.ts` for persistence; existing Svelte presenters and i18n keys for UI. Keep scenario permissions, seed determinism, current-schema saves, manual inventory edits and official challenge behaviors intact.

## A. Economy-affecting fixes

### 1. Full-cycle shelf coverage and meaningful Inventory policy

**Observed:** `createStoreProduct` in `src/lib/game/stock.ts` seeds an initial lot at `demandWeight × 70`, a reorder threshold at `× 25` and a target at `× 90`. `src/lib/game/retailSupply.ts` replenishes every **seven days**. The `INVENTORY` entries in `simulateDay.ts` change capacity/cost/stress but do not directly change target shelf quantities. Harbor City electronics on seed 20260503 generated $24,854 / 20 zero-revenue days over 28 days; manual target 300 generated $68,144 / 11 zero days, and target 600 around $100k / 5 zero days. Those are diagnostic observations, **not** hardcoded targets or acceptance thresholds.

**Design:**
- Size new-store starting lots, default reorder and target stock to the actual **seven-day refill interval** and deterministic per-product sellable demand. Calibrate the smallest simple formula/constant set against the pinned 28-day trace; do not insert global `targetStock = 600` or infer every archetype has the same demand. Existing custom per-product targets remain authoritative.
- Make the existing Lean / Par / Deep (internal `lean` / `balanced` / `generous`) inventory policies materially and monotonically affect effective replenishment coverage. Apply effective per-store/scoped policy in the shared replenishment calculation; retain explicit player target edits, do not rewrite saved user targets when policy switches. Follow current rounding, budget, lot, cap and import accounting rules. Avoid a circular dependency between `stock.ts` and the seven-day cadence constant; share the cadence through an existing lower-level ownership point if necessary.
- The app must not label a product **Healthy** when its projected coverage cannot last to the next replenishment check. Reuse `stockRecovery.ts` / `StoreStockTable.svelte` and current report evidence for a forward-looking cycle-risk indication. Differentiate current on-hand status from **historical** last-day stockout evidence so the two do not contradict each other.
- Do not alter import pricing, loan terms, labor costs, other archetype founding economics, the manager playbook or the HPA-1147 expansion/local-chain experiments. Record the economic side effects instead of assuming larger targets improve profit or final cash.

**Verification:** deterministic daily refill test (first and later cycles, all 3 policies, per-store overrides, manual target edits, local supply and imports); fixed-seed 28-day electronics UAT comparison including cash, paid imports, revenue, stockout days and stockout-lost units; other archetype regression. No silent money/stock creation.

### 2. Store morale follows actual staffing

**Observed:** `buildStoreOperationProfile` in `simulateDay.ts` subtracts a flat `3` every day, even when staffing/service policies contribute zero and assigned employees remain at 60–80 morale. At day 205, six of seven stores reportedly had zero store morale; low morale affects capacity.

**Design:** replace unconditional downward drift with a modest, bounded adjustment towards the actual assigned employees' morale plus the existing staffing/service/manager effects. Preserve explicit shortages, severe overload and unfavorable-policy penalties; a fully covered default-policy store should stabilize rather than converge to zero. Use the existing store/employee summaries and warning patterns to explain morale pressure or short staffing, without inventing a morale-management system or a new panel. Document signs and clamps with small deterministic examples, including zero assigned staff and understaffed stores.

**Verification:** seeded 60+ day default staffed trajectory stays meaningfully above zero and tracks assigned morale; understaffed/low-morale and policy variants still decline as appropriate; sales-capacity and scorecard effects remain deterministic.

## B. Player workflow and presentation fixes

| # | Bug / files to inspect | Required behavior |
| --- | --- | --- |
| 3 | `src/routes/+page.svelte`, `saveUi.svelte.ts`, `gameRouteController.ts`, save repository | Normal browser startup loads a valid sandbox autosave without a special `?ui-comparison=1` query; it never overwrites a persisted run before presenting it. Fresh installs still show founding. Starting a new game after a save is a deliberate, confirmed action. Broken/unavailable saves fail visibly without destroying saved data. Preserve scenario resume/terminal semantics. |
| 4 | `src/lib/assets/gameArt.ts`, `gameArt.spec.ts` | Electronics `accessories` uses the **existing** `/assets/game/industry/materials/electronic-accessories.png` artwork, not the duplicate pink fashion-purse image; `fashion-accessories` remains unchanged. No art-generation work. |
| 5 | `src/lib/game/staffing.ts`, `src/lib/components/game/StoreOverview.svelte`, `StaffPanel.svelte`, `TileInspector.svelte` | Current staffing requirements generate immediate warnings even before the first completed daily report. A newly hired role is auto-assigned to a compatible understaffed store, with deterministic tie-break; if no vacancy exists it stays Unassigned. A successful upgrade that raises required headcount surfaces that delta and a shortage warning. Preserve explicit manual reassignment. |
| 6 | `StoreStockTable.svelte` and stock recovery read model | Reconcile “Healthy” with current-cycle risk and historical “Stockout loss”; keep the **LATEST** column accessible at 1440px without clipped content (reflow or horizontal scroll clearly usable). |
| 7 | `IndustryTileInspector.svelte` | Long/two-line Accessory Assembly Plant titles do not collide with the eyebrow/coordinates or badge; reuse the inspector's existing responsive styling. |
| 8 | `BuildMenu.svelte`, `TopBar.svelte` / `RouteHeader.svelte` | Quick product chips come from products actually sold by the player's stores, with a stable empty/founding fallback. The industry material summary prioritizes relevant produced/needed materials and actual nonzero city inventory; no hardcoded grain/flour/oilseeds on an electronics-only run. Keep available all-products filtering. |
| 9 | `src/lib/i18n/messages/ja.ts` and `zh-Hant.ts` | Supply the missing `game.managementPanels.logistics` menu translation; preserve key parity and locale switch. |
| 10 | `src/lib/i18n/messages/en.ts` and other locales | Browser saves modal uses neutral “Saves” wording, not “Desktop Saves”. No platform-specific duplicated dialog needed. |
| 11 | `staffing.ts` and `StaffPanel.svelte`, locale action labels | Generated hiring-market candidates have distinct display names within a single batch, with deterministic RNG behavior. Hire accessibility labels use readable name/role instead of exposing internal candidate IDs. Keep IDs for internal identity only. |
| 12 | `simulateDay.ts`, `Scorecard.svelte` and current daily-result presentation | Investigate why a positive-income day can display `PROFIT 0`. The existing profit score is a **0–100 rolling score**, not dollar daily income. Fix genuinely incorrect computation if found; at minimum label/describe score versus day income truthfully and show the recorded current-day result distinctly. Do not claim a positive day necessarily implies a high cumulative score. |
| 13 | `ScenarioResultsDialog.svelte`, `scenarioUi.svelte.ts` and root scenario host | Give the results outcome/medal/score an intelligible header hierarchy using current paper/brass components. Prevent the empty founding map and “Found a store to start time” state from appearing behind terminal results; do not invent or retain a fake playable game on terminal transition. |

### UI design constraints

No new layout, navigation surface or art. Match the existing Vitrine/paper-brass styling and current warning/feedback patterns. Use the **seven Linear ticket screenshots** as regression references, especially the stock-table LATEST cutoff, purse art, assembly-inspector overlap, translation, staffing warning and challenge result backdrop. For cases with no mockup, capture before/after browser screenshots at **1440px** (plus a narrower viewport for wrapping). Inspect actual rendered positions, clipping, labels and color/contrast, not only DOM text.

### Save/permission invariants

- Automatic resume applies only when a saved sandbox game exists and must not override an active scenario. Distinguish absent save from corrupted/read-error state. Do not start another autosave write until the intended game has been adopted.
- A visible “new game” or equivalent explicit reset must require confirmation whenever it would replace an existing autosave. Cancelling leaves saved state intact. No pre-release schema migration.
- All gameplay mutations still go through existing controller/scenario capability gates and existing deterministic transitions; UI read models do not become authoritative simulation state.

## C. Evidence, out-of-scope and review boundary

**Reproduce first on this base SHA:** default Harbor electronics at (32,20), seed `20260503` over 28 days; store morale across 60–205 days; a persisted save across actual page reload; the supplied UI screenshots.

**Balance/evidence contract:** run `bun run balance` and `bun tests/balance/progressionRun.ts --seeds 20260501..20260550 --days 365 --output <dir>` on both the same pinned base and final implementation source. Report **Gate A 5/5**, per-archetype tier 1–5 reach and timing, final cash (including median and negative-run counts), plus focused electronics stockout/revenue/import costs and staff morale before/after. Use exact source SHAs and repeatable commands. Ticket baseline at `0c7f815`: tier 3 in 158/200; tier 4 in 42/200 and tier 5 in 41/200 (boutique only); negative final cash in 189/200; electronics median final cash −$51,464. These are reference observations, not acceptable-economy promises.

**Out of scope:** economic retuning for Harbor profitability and store/industry investment payback (HPA-1147); new purchase confirmation flows beyond destructive new-game reset; First Profit medal redesign; Accessory Assembly Plant new sprite; large UI redesign; new save migrations; another PR for this ticket.

**Review note (not an acceptance test):** HPA-1199 requests owner review of economy before/after numbers before merge. Keep this PR **draft** while that review is pending; a documentation-only PR is not implementation completion.
