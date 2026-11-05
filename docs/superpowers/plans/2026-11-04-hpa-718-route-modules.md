# HPA-718 — Focused Game Route Modules: Single-PR Implementation Plan

**Issue:** https://linear.app/cwchanap/issue/HPA-718/refactor-split-the-main-game-page-into-focused-route-modules
**Design:** `docs/superpowers/specs/2026-11-04-hpa-718-route-modules-design.md`
**Review incorporated:** https://github.com/cwchanap/Serpens/pull/70#issuecomment-6647119067
**Branch/PR:** `docs/hpa-718-route-modules` / https://github.com/cwchanap/Serpens/pull/70 — **one ticket, one PR**
**Inspected baseline:** `main@4fa7296dd68112daaaf799b182226af001f922b9`
**Status:** revised **docs-only** plan. Runtime edits and green test results have **not** occurred.

## Working agreement

- **Delete duplication before extraction.** Extend the existing controller for manual saves and shared command availability rather than writing thin clones. Keep logic in the fewest sensible modules; no mandatory module count.
- **Vertical commits, not separate PRs.** In each cohesive group, move its state + derived decisions + handlers + specs *together*; run focused verification before starting the next group.
- **One owner per state.** Route page owns controller, cross-feature selection, effects and existing markup; a feature-local `.svelte.ts` factory may own its own runes. No giant getter/setter context, new store, duplicated overlay atoms or hidden auto-tick dependencies.
- **No behavior change.** Preserve typed command outcomes, scenario CAS revision/identity, save timing and SFX, original overlay policy and page/Phaser Escape interplay. No changes to `src/lib/game/`, Phaser, save schema, i18n or assets.
- **Target:** `+page.svelte` ~1,200 lines or fewer, new route modules ~500 or fewer. Baseline page has 3,639 physical lines, script to line 3,013, ~626 markup; available script/import budget is ~574. Check actual counts per commit.
- **Svelte tooling:** follow the mandatory Svelte docs + autofixer procedure in `CLAUDE.md` for every touched Svelte file. Do not edit `AGENTS.md` symlink; update `CLAUDE.md` after code layout settles.

## Step 0 — Establish baseline and tests before moving code

1. Check current `main` and PR head to avoid stale baselines or clobbering concurrent work. Record `wc -l src/routes/+page.svelte`, per-region ownership, and existing tests.
2. Read `+page.svelte`, `gameRouteController.ts`, `financePurchaseReview.ts`, `supplyPlannerRoute.ts`, `storeDetailFocus.svelte.ts`, `alertNavigation.ts`, `ScenarioCatalog.svelte`, `ScenarioResultsDialog.svelte`, `FinancePurchaseReviewHost.svelte`, `*Host.svelte` and `CLAUDE.md`.
3. Establish a focused route-unit and E2E baseline. Use existing **actual test titles**, not speculative test filters. For example:
   - `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "player can save to a manual slot|challenge returns to sandbox|challenge restart|challenge imports"`
   - `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "rail-fed production|financed expansion"`
   - `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "Escape|keyboard shortcuts|cheat sheet|modifier"`
   - `bun run test:e2e -- src/routes/time-flow.e2e.ts`
4. Draft node tests that pin **current** overlay policy and rail waypoint behavior *from the inline implementation and its comments*. `page.svelte.spec.ts` does not mount the page and cannot directly serve as an old/new view-model oracle. Use new pure decision specs and existing E2E as the equivalence net.
5. Explicitly pin the previously missing rail integration invariant: one canvas `buildCancelled` from Escape/right-click removes **one** waypoint, clears target/feedback, and the page Escape must not remove a second one. Add one narrowly scoped integration/E2E probe if the actual DOM event interaction cannot be established from pure reducer + policy specs alone.

**Checkpoint:** record baseline failures honestly; no invented green status or “identical old/new selector fixtures” claim.

## Step 1 — Consolidate ownership in GameRouteController (two small vertical commits)

### 1A. Manual save belongs to the existing controller

**Files:** `gameRouteController.ts` and `gameRouteController.spec.ts`, minimal page consumer edits.

1. Add `saveManualSlot(name, slotId?)`, `deleteManualSlot(slotId)` and `refreshSaveSummary()` using the controller's existing repository and `onSaveSummary`.
2. Use the controller's **raw `game` getter**, not `sandboxGame` only, so manual-save behavior matches the page's current `game` in all reachable modes and does not need `$state.snapshot(game)`.
3. Remove page-owned `saveRepository` and `onSaveRepositoryReady` callback. Preserve manual-slot name/overwrite choices, saved cue, feedback translation keys, errors and summaries.
4. Deduplicate the successful auto/manual load reset in the page (selections, placement, opening/cash recovery guidance, simulation pause, summary refresh); missing/failed loads do not reset.
5. Write tests for uninitialized repository, manual create/overwrite/delete, refreshed callbacks, current raw game source, errors, and no unexpected autosave.

**Checkpoint:** `bun run check && bun run test:unit -- --run src/routes`; run the manual-slot E2E filter plus `src/routes/recovery-guidance.e2e.ts`. Do not proceed with broken saves.

### 1B. Gate thin commands once at the existing mutation authority

**Files:** `gameRouteController.ts`, `gameRouteController.spec.ts`, page's thin handlers.

1. For mutations with an actual matching `MutationAvailability` capability, evaluate current play mode / pending / resolved scenario definition at `commitMutation` entry. Remove only equivalent page pre-gates. Avoid adding a key just to satisfy generic plumbing.
2. Preserve **UI-gated pending ⇒ `{ status: 'unavailable' }`**, and keep lifecycle `busy` semantics. Preserve the existing `executeScenarioCommand` scenario capability enforcement, CAS and serialized persistence gate.
3. Handle special cases explicitly: `foundStore` with no sandbox game; `selectWorldCity`'s distinct scenario-selection gate; `setRetailSupplySource`'s sandbox unchanged/rejected preflight; sandbox-only policies/brand/delegation/demolition/manual logistics; scenario-shaped recurring-route inputs without mutable rates.
4. Keep local adapters that carry behavior: `changeStoreProduct` product lookup/`null`, `upgradeStoreHandler` `null`, `removeRecurringRoute` selection cleanup. Do not introduce `routeCommandHandlers.ts`, a string-keyed dispatcher or a second autosave.
5. Add tests for pending return type vs `busy`, scenario permission denial, direct build-rail call, founding no-game, supply-source unchanged, sandbox-only command denial, and finance/logistics panel feedback distinctions.

**Checkpoint:** `bun run check && bun run test:unit -- --run src/routes`; targeted scenario and finance E2E. Audit that at least as many duplicate wrappers are *deleted* as were added to the controller.

## Step 2 — Centralize overlay gate policy and Escape precedence

**Files:** new `routeOverlays.ts` + `routeOverlays.spec.ts`; relevant page wiring.

1. Write a closed overlay ID policy table with default `pausesMap` / `blocksShortcuts` / `disablesRailKeyboard`, `ESCAPE_ORDER`, `selectOverlayGates` and `resolveEscapeTarget`. Populate policy from the current page's six memberships **before deleting the originals**.
2. Assemble a **derived read-only snapshot** of open states from existing feature owners. Do **not** move all independent overlay state into a new giant `$state` record or duplicate `storeDetailFocus`/finance review runes.
3. Pin exceptions: alerts block shortcuts and rail but not map; management pauses map but retains `isMenuOpen` semantics; finance confirmation leaves Phaser rendering running but owns Escape; placement keeps Phaser active; world map blocks the timer without blocking view shortcuts.
4. Preserve dialog ownership: Scenario Catalog and Results Dialog close themselves via component key handlers; Finance review handles Escape in capture phase. Page does not double-handle them. Preserve rail waypoint canvas cancellation and the ordered fallback to selected items/hamburger.
5. Keep `closePlannerOverlays` and `resetTransientViewState` as separate named cleanup policies with different memberships; do not collapse them into unconditional “close all” loops. Only merge exact duplicate close/reset behavior proven by tests.

**Checkpoint:** `bun run check && bun run test:unit -- --run src/routes`; `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "Escape|keyboard shortcuts|cheat sheet|modifier"` and `bun run test:e2e -- src/routes/time-flow.e2e.ts`. In particular, verify no double Escape.

## Step 3 — Extract the rail cluster as one vertical slice

**Files:** new `railBuild.ts` / `railBuild.svelte.ts` with specs; page updated. No `src/lib/game/rail*` modifications.

1. Create the pure click/reducer contract and tests for no-game, origin, waypoint, invalid waypoint, first destination preview, second destination commit, cancel last waypoint and exit mode, reset stale target/feedback, plus upgrade/demolish eligibility.
2. Use a small `.svelte.ts` factory (like `storeDetailFocus.svelte.ts`) to own `railBuildMode`, target, preview/status derivations and actions. Pass current `game`, city, locale/permissions through getters; never capture a stale controller state snapshot.
3. Rail and retail/industry placement currently share `placementFeedback`. Make its **one owner** explicit (prefer page-owned cross-feature feedback unless a single coherent placement owner emerges). Clear the same value on rail/placement transitions.
4. Preserve `isRailWaypointTarget`, `buildRailPreview`, map snapshot wire format and first-click/second-click sequence. Do not recreate shipping or rail placement domain rules.

**Checkpoint:** `bun run check && bun run test:unit -- --run src/routes`; `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "rail-fed production"` and `bun run test:e2e -- src/routes/recovery-guidance.e2e.ts`. Include the new Escape/right-click regression test before deleting the old handler.

## Step 4 — Extract retail/industry placement and finance review

**Files:** `placementRoute.ts` with spec; optionally extend `financePurchaseReview.ts` for already-pure `refreshedFinancedPurchase`; page updated.

1. Deduplicate the scenario-valid tile filtering with `restrictPreviewToScenario(preview, allowTile)` while retaining the existing detailed invalid-tile block feedback (do not prefilter clicks into silent no-ops).
2. Reuse the existing `resolveExpansionPurchasePaymentPath`. Keep founding-store, cash-retail expansion, industry placement and finance-only paths readable as distinct flows. Only add a generic `resolvePlacementClick` union if the resulting code is **smaller and clearer** than these existing branches; it is not an acceptance requirement.
3. Keep `beginFinancePurchaseConfirmation` / `settleFinancePurchaseConfirmation` generation checks, cost refresh triggers and `tick()` focus restore; keep world-city financing on the existing review path.
4. Test invalid/blocked placement, no-game founding, scenario permissions, cash-only/finance-only branches, quote update after rejection, no duplicate confirmations, stale async results and focus restoration.

**Checkpoint:** `bun run check && bun run test:unit -- --run src/routes`; `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "financed store opening|financed expansion|player expands"`.

## Step 5 — Scenario cluster, planner reuse, and optional map/navigation extraction

**Files:** `scenarioRoute.ts` (optional catalog `.svelte.ts` only if beneficial), extend `supplyPlannerRoute.ts`, optional `mapNavigationRoute.ts`. New tests for each actual module.

1. Create pure `toCatalogActionResult` so start/current-version/import map confirmation and failure outcomes without repeating the same switch; preserve distinct localized confirmation text and CAS tokens (`expectedRunId` / `expectedRevision`).
2. Put scenario content allowance in one live predicate instead of repeating `playMode === 'sandbox' || isScenarioContentAllowed(...)`; keep filters close to the selected flow, and do not wrap one-line `$lib` projections in hollow helpers.
3. Isolate a pure scenario sync identity decision. Reset transient selections/pause **only** when `playMode`, `runId`, `status` or `scenarioRunSyncEpoch` changed. Preserve same-run resume and conflict adoption behavior; do not trigger on every reference change.
4. If catalog UI open/results/feedback atoms are self-contained, use a small `.svelte.ts` holder; otherwise keep them in the page. Keep cross-feature selection state in one owner.
5. Reuse the already-exported `deriveSupplyPlannerResult` for the open-gated `supplyPlannerResult` derived value and for action handoff, passing the same `$state.snapshot` function. Retain the planner's live-product validation, horizon and city handoff.
6. Only if still needed for the size target, extract the cohesive world-city/nav selector and actions to `mapNavigationRoute.ts`; do not create generic read-model or keyboard modules.

**Checkpoint:** `bun run check && bun run test:unit -- --run src/routes`; `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "challenge|scenario|city-local inventory"` and `bun run test:e2e -- src/routes/time-flow.e2e.ts`.

## Step 6 — Audit actual size, ownership and final verification

1. After **every** vertical commit, record `wc -l src/routes/+page.svelte` and each newly added route module. Final target ≤~1,200 / ≤~500 without a catch-all. If exceeded, extract another genuinely cohesive cluster on **this same PR** and explain the count; never simply waive or move it to another ticket.
2. Leave the page's controller construction, primitive `hasGame` auto-tick dependency, Svelte effects, cross-feature selections and markup intact. Inspect for stale getter captures, duplicate game/saves authorities, unintended branch/status/copy changes, duplicated update commands, changed scenario gating and extra reactive reads.
3. Update the route architecture description in `CLAUDE.md` only; do not edit `AGENTS.md` symlink. Run mandatory Svelte documentation/autofixer workflow on each touched Svelte file.
4. Run and **record actual results**, not inferred success:
   - `bun run check`
   - `bun run lint`
   - `bun run test:unit -- --run` (all projects, including `page.svelte.spec.ts`, controller, planner, finance review and `*Host.svelte.spec.ts`)
   - `bun run test:e2e` (full suite, including retail, recovery-guidance and time-flow)
   - `git diff --check main...HEAD` and a changed-file audit
5. Report before/after page/modules line counts; deleted-vs-moved LOC; all fixed regression invariants; and any accepted exceptions. Keep PR **draft** until Hapadona approves. **Do not open another PR for implementation.**

## Non-goals

No `src/lib/game/` domain changes, economy/rail balance/content tweaks, Phaser UI rewrite, changed translations, art/SFX, new save migrations, additional application state framework or parallel implementation PR. HPA-719 art, HPA-720 electronics chain and HPA-721 economy tuning remain separate tasks.
