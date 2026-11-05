# HPA-718 — Focused Game Route Modules: Single-PR Implementation Plan

**Issue:** https://linear.app/cwchanap/issue/HPA-718/refactor-split-the-main-game-page-into-focused-route-modules
**Design:** `docs/superpowers/specs/2026-11-04-hpa-718-route-modules-design.md`
**Reviews addressed:** [initial review](https://github.com/cwchanap/Serpens/pull/70#issuecomment-6647119067), [revised-plan review](https://github.com/cwchanap/Serpens/pull/70#pullrequestreview-5779726136)
**Branch / draft PR:** `docs/hpa-718-route-modules` / https://github.com/cwchanap/Serpens/pull/70 — **one ticket, one PR**
**Inspected baseline:** `main@4fa7296dd68112daaaf799b182226af001f922b9`
**Status:** docs-only plan; no runtime implementation or test pass claimed.

## Delivery boundaries and honest line budget

- **Ticket target is unchanged:** approximately **1,200 physical lines or fewer** in `src/routes/+page.svelte` and ~500 or fewer in each newly added focused module. This is *not* silently replaced by the review's proposed ~2,000-line target.
- **Baseline:** 3,639 physical lines; script ends at line 3,013; markup occupies ~626 lines. Therefore final script/imports budget is ~574 lines, requiring **~2,439 net lines removed from the page**.
- **Initial review estimate, not measured result:** steps covering controller/manual save, overlay gates, rail, placement, scenario and planner eliminate ~1,450 lines, leaving **~2,180** total. Thus **~990 additional net lines** must be accounted for *before* final verification. Step 6 below is **mandatory and planned upfront**, not an optional emergency fallback.
- **Never confuse relocation with reduction:** after every vertical slice, measure `wc -l` for page and new modules; record actual *net* source movement/deletion, module cohesion and test outcome. The extractions suggested in the review (map ~200, guidance ~100, inspector ~120) alone leave a **~570-line gap** in the estimate. Step 0 must inventory additional *non-overlapping* substantive route orchestration before any final size claim. Estimates are not guaranteed.
- **KISS:** delete duplicate guards/repository routing before creating modules. No giant getter/setter context, global Svelte store, event bus, monolithic route state object, generic action dispatcher, new domain engine or save migration. Keep cross-feature runes, controller composition, auto-tick effects and existing markup in page.
- **Vertical commits on this PR:** for each cohesive feature group, update tests with the code, run `bun run check` + focused route unit suite + affected E2E **before** moving on. Preserve unchanged player behavior and original tests. Keep this single PR draft until approved.

## Step 0 — Baseline, test plan and non-overlapping size inventory

1. Recheck current `main` and PR head; don't overwrite another agent's concurrent changes. Record page count, script/markup budget and functional source ranges.
2. Inspect `+page.svelte`, `gameRouteController.ts`, `financePurchaseReview.ts`, `supplyPlannerRoute.ts`, `storeDetailFocus.svelte.ts`, `alertNavigation.ts`, `ScenarioCatalog.svelte`, `ScenarioResultsDialog.svelte`, `FinancePurchaseReviewHost.svelte`, `*Host.svelte` and `CLAUDE.md`.
3. Group **all 3,013 script lines without double counting** into controller-adapter deletion, overlays, rail, placement, scenarios, planner, map navigation/world management, guidance, inspector projections, bootstrap/other real UI coordination, and retained state/lifecycle/import code. Assign estimates and budget for each against 2,439 required **net** reduction. No “we'll see at the end” or hollow wrapper to fill a gap.
4. Run baseline route specs and existing E2E using real titles, for example:
   - `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "player can save to a manual slot|challenge returns to sandbox|challenge restart|challenge imports"`
   - `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "rail-fed production|financed expansion"`
   - `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "Escape|keyboard shortcuts|cheat sheet|modifier"`
   - `bun run test:e2e -- src/routes/time-flow.e2e.ts`
5. The existing `page.svelte.spec.ts` tests the controller/helpers, **not the mounted page**; do not claim an old/new selector comparison can import inline page code. Create pure specs derived from existing inline logic plus E2E equivalence. Pin **canvas Escape/right-click cancels exactly one rail waypoint**, without double-handling by the page, before extracting its old handler. **Require a mounted-browser E2E integration probe** for the actual IndustryMap → page event path (not just the existing scene-level event emission or pure reducer tests).

**Gate:** baseline/test gaps and a measurable line budget are explicit. Any pre-existing test failures recorded, not described as green.

## Step 1 — Delete duplicate ownership in GameRouteController (two vertical changes)

### 1A. Manual saves

**Files:** `gameRouteController.ts`, its existing spec, page consumers.

1. Add `saveManualSlot(name, slotId?)`, `deleteManualSlot(slotId)` and `refreshSaveSummary()` using the controller's existing repository and `onSaveSummary`. Use its **raw `game` getter** (not `sandboxGame` unconditionally), which matches the currently reachable manual-save source and avoids a Svelte proxy snapshot boundary.
2. Delete page-owned `saveRepository` and `onSaveRepositoryReady` wiring. Keep `isSavePanelOpen`, `saveFeedback` and summaries in **the page**. **Do not create `savePanel.svelte.ts` or `saveSlotRoute.ts`** just to relocate trivial flags/formatters.
3. Preserve saved SFX, translation keys, overwrite/name semantics and error propagation. Share the successful auto/manual post-load reset (selections, placement, recovery hints, pause), never reset on failed/missing save.
4. Cover repository-not-ready, raw game in all reachable modes, manual create/overwrite/delete, summary callbacks, error, load and absence of duplicate autosaves.

**Gate:** `bun run check && bun run test:unit -- --run src/routes`; manual-slot and recovery-guidance E2E.

### 1B. Equivalent command gating in the controller

**Files:** controller and spec, page wrappers removed where truly redundant.

1. For commands with a meaningful `MutationAvailability` capability, evaluate the **current** mode/pending/resolved scenario definition at the existing `commitMutation` boundary. Keep `executeScenarioCommand`'s authoritative capability/CAS checks and `runPersistenceGatedOperation` unchanged.
2. Preserve pending **UI-gated** command results as `{ status: 'unavailable' }`, not `busy` (Finance and Logistics panels distinguish these); lifecycle operations retain their existing `busy` result. No double-autosave.
3. Exempt or handle explicitly: `foundStore` before any game, `selectWorldCity`'s separate scenario capability, `setRetailSupplySource`'s sandbox unchanged/rejected preflight, sandbox-only policy/delegation/brand/**industrial-building demolition** (`demolishIndustrialBuilding`)/manual logistics, **capability-gated rail demolition** (`demolishRail`), and scenario-shaped recurring-route data.
4. Remove ~25 thin page wrappers only where return type and live capability rules remain identical. Keep meaningful preflight/cleanup: `changeStoreProduct` `null` contract; `upgradeStoreHandler` `null`; `removeRecurringRoute` selection cleanup.
5. Test pending vs busy, denial without state/sfx/autosave, direct rail command, first founding, unchanged supply-source and sandbox-only commands. **Add a focused controller regression:** a scenario whose `allowedCommands` contains `demolishRail` successfully commits rail demolition, while `demolishIndustrialBuilding` remains unavailable in scenario mode. Reuse the existing scenario command path and runtime's rail-demolition fixture.

**Gate:** `bun run check && bun run test:unit -- --run src/routes`; scenario and finance/logistics targeted E2E.

## Step 2 — One typed, pure overlay/keyboard policy

**Files:** `routeOverlays.ts` + `routeOverlays.spec.ts`, page binding.

1. Define closed `OverlayId`, policy `{ pausesMap, blocksShortcuts, disablesRailKeyboard }`, `ESCAPE_ORDER`, `selectOverlayGates` and a **fully typed** `resolveEscapeTarget` decision with node specs.
2. `OverlaySnapshot` has `openOverlays: ReadonlySet<OverlayId>` sourced from existing owner state, `isPlacementActive`, `isRailBuildActive` (**origin OR routing**), `isFinanceReviewPending`, booleans for selected world/retail/industry/logistics target and `allowMenuFallback` (no modifier/typing target). **Do not duplicate UI flags in another giant `$state`.**
3. Return the discriminated `EscapeResolution`: `external-owned` (canvas/dialog), `close-overlay`, `cancel-placement`, `clear-selection` (world/retail/industry/logistics), `open-game-menu` or `none`. The page dispatches side effects via a short switch to existing methods; the pure helper never performs effects. Test all current priority branches, including selected-item and hamburger fallback.
4. Preserve exact contextual exceptions: alert menu blocks shortcuts/rail but not map; management panel pauses map but retains `isMenuOpen` keyboard behavior; finance confirmation keeps map rendering yet dialog owns Escape; placement keeps map running; catalog/results dialogs close Escape internally; canvas owns rail waypoint pop; world map blocks auto-tick without blocking view shortcuts.
5. Keep `closePlannerOverlays` and `resetTransientViewState` as **different** named cleanup operations. Never use a blanket “close all” that erases their intentional different memberships.

**Gate:** `bun run check && bun run test:unit -- --run src/routes`; retail-sim E2E matching `Escape|keyboard shortcuts|cheat sheet|modifier` and full `time-flow.e2e.ts`.

## Step 3 — Rail as a pure reducer; no extra rune factory

**Files:** **`railBuild.ts` and `railBuild.spec.ts` only**, plus page edit. No `railBuild.svelte.ts` or changes to `src/lib/game/rail*`.

1. Implement/test pure `reduceRailBuildClick` / `cancelRailBuildStep` and `deriveRailPreviewRender` (reusing existing rail placement / waypoint helpers). Inputs include live game, industry city, mode, target and permissions; outputs are next mode/target plus feedback, SFX/commit **intents**.
2. Keep `railBuildMode`, `railPreviewTargetBuildingId` and shared `placementFeedback` as page-local `$state`. The page calls reducer then directly applies those outputs and calls the existing controller/SFX. Avoid 5+ getter/setter/event callback injection.
3. Pin no-game/invalid waypoint, origin selection, first valid destination preview, same-destination second click commit, waypoint backtrack, preview clearing and canvas right-click/Escape single-pop (page must not cancel again).

**Gate:** `bun run check && bun run test:unit -- --run src/routes`; retail-sim `rail-fed production` and recovery-guidance E2E, **including the mandatory mounted-UI cancellation integration probe** for Escape and right-click, asserting a single waypoint pop and no duplicate page-level cancellation.

## Step 4 — Placement/finance as focused route decisions

**Files:** `placementRoute.ts` and spec; reuse `financePurchaseReview.ts`; page simplified.

1. Introduce the shared pure `restrictPreviewToScenario(preview, allowTile)` and reuse existing `resolveExpansionPurchasePaymentPath`. Maintain distinct founding, cash retail, industry and finance/blocked tile contracts instead of creating a generic engine by default.
2. Keep invalid-tile-specific feedback, scenario placement restrictions, quote refresh, finance generation/cancel guard, no double submit and focus restoration after `tick()`. Move already-pure `refreshedFinancedPurchase` next to the existing finance review helpers if useful.
3. Introduce a generic `resolvePlacementClick` only if testable and *simpler* than the branches it replaces; never require it as a planning artifact.

**Gate:** `bun run check && bun run test:unit -- --run src/routes`; retail-sim `financed store opening|financed expansion|player expands` E2E.

## Step 5 — Scenario lifecycle and existing planner reuse

**Files:** `scenarioRoute.ts` with spec, extend `supplyPlannerRoute.ts`, page updated.

1. Extract one pure `toCatalogActionResult` mapper for start/current-version/import, preserving localized confirmation text and `expectedRunId`/`expectedRevision`; centralize live scenario-content allowance predicate.
2. Extract pure run-identity sync decision, keyed by `playMode`/`runId`/`status`/`scenarioRunSyncEpoch` only. Ordinary same-run command publications must never pause simulation or reset selections. Keep catalog UI flags as page-local runes; no speculative catalog `.svelte.ts`.
3. Reuse the existing `deriveSupplyPlannerResult` behind the original overlay-open gate for derived value and handoff, passing `$state.snapshot` as currently required for planner input. Retain current product/horizon validation, locale and city handoff.
4. Recount. An interim page around **~2,100–2,200 lines** is reasonable by review estimate, but **is not HPA-718 completion**.

**Gate:** `bun run check && bun run test:unit -- --run src/routes`; retail-sim `challenge|scenario|city-local inventory` and `time-flow.e2e.ts`.

## Step 6 — **Mandatory** remaining route extraction (same PR, planned now)

This is a required work stage because Steps 1–5 alone do not cover ~2,439 net lines. Do not declare completion at a ~2,000-line intermediate milestone. Specific `wc -l` deltas override the review's rough estimates.

1. **World/map/management navigation** in `mapNavigationRoute.ts`: multi-step map switching, legal city selection, world opening/financing entry, panel routing, map-specific alert handoffs, logistics focus and the relevant multi-branch map selections. Inspect original regions ~1216–1291, 1712–1900, 2743–2765 and 2790–2878, plus related projections. Keep cross-feature selections page-owned; module exports pure decisions/narrow actions, not a second controller. Add alert/city/view specs.
2. **Guidance** in a small `routeGuidance.ts` **only for cohesive, substantial behavior**: opening/cash-recovery eligibility, UI dismissal/rearm and recovery handoffs; reuse existing `$lib/game/openingGuidance` and `cashRecovery`. Inspect derived ~697–726, handoff ~1862–1878 and load reset logic; do not reimplement guidance rules.
3. **Inspector and world read models**: extract *multi-branch* selection and inspector preview decisions (`~727–839, 2743–2765`) into the map/navigation module or one named inspector selector module if truly separate. **Do not double count ranges already in item 1** or add hollow wrappers around one-line `$lib` calls.
4. **Balance the remaining reduction explicitly:** the review estimates map (~200), guidance (~100), inspector (~120) for **~420 lines, still ~570 short** of its ~990-line deficit. In **Step 0**, identify other *non-overlapping* substantive remaining UI coordination such as cross-view menu workflows, world status/read-model branching and bootstrap of route-only initial presentation data. Assign a measured net deletion budget to those real candidates and update it after each commit. Do not plan an unjustified 570-line generic abstraction or assume that a few modules automatically hit the number.
5. Run check, route unit suite and focused map/alert/inspector/guidance E2E **after each vertical extraction**. Measure and record page and module line counts. If no cohesive extraction remains that can meet ~1,200 without harming maintainability, **surface the exact shortfall and request an explicit acceptance-scope decision**, rather than silently changing HPA-718's target or fudging the numbers.

**Gate:** HPA-718 size target met on the *same* PR, or a clearly identified unresolved acceptance decision. No extra PR, no unnecessary new subsystem.

## Step 7 — Final audit and full verification

1. Verify measured `wc -l src/routes/+page.svelte` and each newly added route module against targets; report actual before/after page lines, new module sizes and net deleted vs relocated lines, not guessed savings.
2. Confirm the page remains the composition root for controller, shared selections and Svelte effects, with primitive `hasGame` timer dependency and identical Phaser/map/overlay behavior.
3. Update architecture paragraph in `CLAUDE.md` only (not the `AGENTS.md` symlink). Follow its mandatory Svelte docs / autofixer workflow on **every changed Svelte file**; avoid unrelated formatting churn.
4. Run and **record actual** commands (no invented pass claims):
   - `bun run check`
   - `bun run lint`
   - `bun run test:unit -- --run` (all projects, including route/controller/planner/finance/host suites)
   - `bun run test:e2e` (full suite, especially retail, recovery guidance and time-flow)
   - `git diff --check main...HEAD` and changed-file audit
5. Keep PR **draft** until Hapadona approves. All implementation and validation remain in **PR #70**.

## Explicit exclusions

No new domain gameplay/economy/rail mechanics under `src/lib/game/`, Phaser redesign, new art/SFX, scenario balance, localization changes, save migration, global reactive infrastructure or multi-PR rollout. HPA-719 (art), HPA-720 (electronics) and HPA-721 (economy) remain separate tickets.
