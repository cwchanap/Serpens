# HPA-718 — Focused Game Route Modules: Design Specification

**Linear:** https://linear.app/cwchanap/issue/HPA-718/refactor-split-the-main-game-page-into-focused-route-modules
**Roadmap:** https://linear.app/cwchanap/issue/HPA-717/roadmap-make-the-long-game-finishable-for-every-store-type
**PR:** https://github.com/cwchanap/Serpens/pull/70 — **single draft PR** for design, implementation, and verification
**Inspected baseline:** `main@4fa7296dd68112daaaf799b182226af001f922b9`
**Reviews:** [first design pass](https://github.com/cwchanap/Serpens/pull/70#issuecomment-6647119067); [revised design review](https://github.com/cwchanap/Serpens/pull/70#pullrequestreview-5779726136)
**Status:** revised **docs-only** planning checkpoint; no runtime implementation or passing tests claimed.

## Goal and size budget

Split `src/routes/+page.svelte`, preserving player behavior. At the inspected baseline it has **3,639 physical lines**, with `</script>` on line **3,013** and approximately **626 lines of markup**, plus 123 top-level functions. **Keep HPA-718's ~1,200-line page acceptance target**, with **~500 lines or fewer per new focused module**. The current ~626 lines of markup leave at most **~574 lines of script/imports**; the required **net reduction is ~2,439 physical lines** from the 3,639-line baseline. The latest review estimates that controller/overlay/rail/placement/scenario/planner cleanup removes only ~1,450 lines, leaving **~2,180 total**. Those are *planning estimates*, not measured results. Therefore map/world navigation, guidance, inspector/read-model logic and other cohesive route-only UI orchestration are **in scope from the outset**, not an unplanned Step-6 fallback. Do not cut ~1,200 to ~2,000 without explicit change to Linear's acceptance; a ~2,000-line intermediate checkpoint is not final completion. Record real net reductions after each vertical slice and inspect the remaining source before adding another module. Avoid hitting a numerical target with no-op wrappers or meaningless file splitting.

The right starting point is *deletion and consolidation*, not relocating every line. Existing code already has real owners:
- `gameRouteController.ts`: raw current game (`controller.game`), scenario command/persistence gate, sandbox autosave, save repository, and state publication.
- `financePurchaseReview.ts`: finance-review request and generation/settlement state transitions.
- `supplyPlannerRoute.ts`: existing projection `deriveSupplyPlannerResult` and planner handoff.
- `alertNavigation.ts`, `storeDetailFocus.svelte.ts`, `resolveShortcutAction` and `*Host.svelte`: focused, already-tested behavior.

Keep the page as the **composition root** for the controller, cross-feature selection state, lifecycle/auto-tick effects and existing host markup. **Default to pure `.ts` selectors/reducers plus page-owned runes**. Feature-local `.svelte.ts` is appropriate only for truly isolated leaf state (the existing `storeDetailFocus.svelte.ts` is the proven example), not for coupled flows such as rail building or trivial save-panel flags. Rail mode, target and the shared `placementFeedback` stay page-owned, while `railBuild.ts` decides next state/preview/commit intent. Keep reactive reads in explicit page `$derived.by` expressions. No new Svelte store, global bus, service locator, domain layer or runtime schema.

## Review decisions and revised module map

| Target | Decision | Reason |
| --- | --- | --- |
| **Extend** `gameRouteController.ts` | Move manual slot create/overwrite/delete and summary refresh into the existing controller; consolidate equivalent command availability guards there | The controller already owns the save repository, raw game, mutation boundary and callbacks. Delete the page's direct repository access and repetitive guards instead of moving them |
| New `routeOverlays.ts` | A small, **pure** policy table and Escape-priority resolver | Consolidate the repeated gate membership with explicit exceptions and pin today's behavior in node tests; **do not** introduce a competing giant overlay `$state` record |
| New `railBuild.ts` **only** | Pure click/waypoint/confirm/cancel reducer and rail preview projection | Keep `railBuildMode`, `railPreviewTargetBuildingId` and shared `placementFeedback` as the existing page-owned runes; no multi-callback `.svelte.ts` factory |
| New `placementRoute.ts` | Extract scenario preview restriction, cash/finance decision and placement-specific orchestration; reuse `financePurchaseReview.ts` | Retail founding, retail expansion and industry placement have real differences — extract common choices, not a generic dispatcher that obscures them |
| New `scenarioRoute.ts`; optional small catalog `.svelte.ts` | Shared content-allowance predicate, result mapping, pure run-identity sync decision and catalog lifecycle/UI state where cohesive | Preserve compare-and-swap confirmation tokens and scenario adoption rules without copying controller logic |
| **Extend** `supplyPlannerRoute.ts` | Reuse `deriveSupplyPlannerResult` for the page's derived value and existing handoff API; move only genuine planner-specific UI state/actions | No second projection or planner engine |
| No new save-panel module | Keep `isSavePanelOpen`, `saveFeedback` and the slot summaries in the page; controller owns repository operations | These are trivial menu/feedback bindings, not a leaf state subsystem |
| Required `mapNavigationRoute.ts` | Extract world/retail/industry view navigation, world-city selection, map-specific inspectors and alert handoffs | This is real existing route coordination, and it is part of reaching HPA-718's stated size gate |
| Required `routeGuidance.ts` / inspector helpers **only where cohesive** | Extract multi-step opening/cash recovery and inspector selection/view decisions; reuse existing game selectors | Capture meaningful behavior and tests, not single-line derived wrappers; scope exact files during the early line-budget audit |

**Dropped from the original proposal:** `routeCommandHandlers.ts`, `routeReadModels.ts` and `keyboardRoute.ts`. Most `$derived` already delegate to tested selectors, and most page command handlers are thin controller gates. Retain truly local adapters (`changeStoreProduct` product lookup/`null` contract, `upgradeStoreHandler` `null` contract, `removeRecurringRoute` selection cleanup), shortcut DOM target checks and view navigation close to their actual owner.

This is a **target shape, not a mandatory file count**. Create files only when the corresponding implementation slice proves a cohesive boundary. Prefer a small number of modules over the original nine.

## Overlay policy: consolidate *gates*, not all UI state

Today six places enumerate overlapping but non-identical conditions: `isMapPaused`, `railKeyboardEnabled`, `hasBlockingOverlay`, page Escape precedence, `closePlannerOverlays` and `resetTransientViewState`.

Build a closed `OverlayId`, a typed table with default `pausesMap`, `blocksShortcuts`, `disablesRailKeyboard`, an `ESCAPE_ORDER`, and pure `selectOverlayGates` / `resolveEscapeTarget`. The page assembles a **read-only snapshot from existing owners** (menus, scenario UI, finance review, store focus and management panel). There is no competing overlay `$state` record. Define explicit boundaries in `routeOverlays.ts`:

```ts
type OverlaySnapshot = {
  openOverlays: ReadonlySet<OverlayId>;
  isPlacementActive: boolean;
  isRailBuildActive: boolean; // origin OR routing, not routing alone
  isFinanceReviewPending: boolean; // map-pause exception only
  selected: {
    worldCity: boolean;
    retailTile: boolean;
    industryTile: boolean;
    logisticsRoute: boolean;
  };
  allowMenuFallback: boolean; // Escape has no modifier or typing target
};
type EscapeResolution =
  | { type: 'external-owned'; owner: 'canvas' | 'dialog' }
  | { type: 'close-overlay'; overlay: OverlayId }
  | { type: 'cancel-placement' }
  | { type: 'clear-selection'; kind: 'worldCity' | 'retailTile' | 'industryTile' | 'logisticsRoute' }
  | { type: 'open-game-menu' }
  | { type: 'none' };
```

`selectOverlayGates(snapshot)` returns named booleans for map pause, shortcut blocking and rail keyboard enabled, with documented contextual overrides. `resolveEscapeTarget(snapshot)` computes **only the first intended Escape effect** in the current priority order, never performs side effects. The page dispatches the discriminated union through a short switch to existing operations (close focus, cancel placement, clear logistics selection, etc.), without adding another renderer/route state authority. The selector must account for selection fallback and no-modifier/no-typing hamburger behavior, not just active overlay IDs. Keep finance/dialog/canvas ownership semantics identical to current code.

Explicit contextual exceptions are part of the contract:
- Alert menu blocks shortcuts and rail canvas Escape, **not** Phaser map rendering.
- Management panel pauses map and disables rail Escape, while panel shortcut handling follows its existing `isMenuOpen` path rather than generic shortcut blocking.
- An in-progress finance confirmation must **not** pause Phaser (preserve map activity), but the finance dialog still owns Escape in capture phase.
- Active placement mode requires the map to keep rendering even when another overlay normally pauses it.
- Scenario Catalog and Results Dialog currently handle Escape *inside their own components*; page Escape intentionally does not close them directly. Preserve that ownership; do not accidentally create double-dismissal.
- World view blocks auto-tick without generally blocking view shortcuts, and auto-tick depends on primitive `hasGame`, not the changing game object or command-pending flags.
- `closePlannerOverlays` and scenario-adoption reset intentionally clear **different** sets of selections and flags. Keep named, tested cleanup policies/operations; do not blindly implement both as a “close all overlays” loop.

The table consolidates **gate membership**. Keep the interaction-specific part of Escape (e.g. rail canvas owns a waypoint pop, selected-tile fallback, hamburger fallback) in one explicit handler rather than hiding it in a generic registry.

## Consolidate controller authority without changing command outcomes

**Manual save:** move `saveManualSlot(name, slotId?)`, `deleteManualSlot(slotId)` and `refreshSaveSummary()` into `GameRouteController`. Use its **raw `game` getter**, matching the page's current `game` projection (including scenario mode where a save action is currently reachable), not `sandboxGame` unconditionally. Publish summaries through existing `onSaveSummary`; retain the page's existing status/error localization and the saved-SFX timing. This deletes `onSaveRepositoryReady` / the page-owned repository reference and the need for `$state.snapshot(game)` for manual saves. Keep the controller's load methods and the shared post-successful-load route reset; unsuccessful loads do not reset UI.

**Mutation gates:** use the current `createMutationAvailability` semantics at the `commitMutation` entry point **only for commands with a valid corresponding capability**. Preserve individual exceptions: `foundStore` allows missing sandbox game; `selectWorldCity` has a separately derived scenario selection gate (not a `MutationAvailability` field); `setRetailSupplySource` preflights the sandbox unchanged/rejected result; scenario-shaped recurring routes omit client-provided rate values; demolition/delegation/brand actions are sandbox-only. Do not invent misleading capability keys or let a generic guard bypass `executeScenarioCommand`'s authoritative scenario checks.

When moving page gates, preserve the observable result: a pending *UI-gated* command should remain `{ status: 'unavailable' }` instead of suddenly becoming `{ status: 'busy' }` (Finance and Logistics panels present different messaging). Keep lifecycle operations' existing `busy` semantics. For adapters with `null` / no-op preflight and selection cleanup, retain those specific route contracts. Verify directly invoked controller calls (e.g. rail construction) and tests before removing any page gate. No second autosave or event-handling layer.

## Extract only real duplication

- **Scenario allowance:** centralize `playMode === 'sandbox' || isScenarioContentAllowed(...)` for the multiple permitted-content selectors, built using **live** play mode and definition.
- **Placement preview restriction:** one pure `restrictPreviewToScenario(preview, allowTile)` shared by retail and industry; retain both placement flows and their distinct founding, block-feedback and financing behavior. A single four-variant `resolvePlacementClick` is **optional, not required**: introduce it only if it reduces real branches after inspecting the focused code/tests.
- **Rail preview:** deduplicate rail-cell path-to-render mapping, colocate preview and state transitions, keep 2-click confirmation and 1-waypoint cancellation.
- **World-city status:** extract its multi-line fallback selector only if the map/navigation slice needs it.
- **Scenario catalog:** `startScenarioCard`, `startCurrentVersionCard` and `importScenarioCode` share pure `GameRouteCommitResult → ScenarioCatalogActionResult` mapping; preserve each confirmation/error key.
- **Planner:** use existing `deriveSupplyPlannerResult` with the same `$state.snapshot` handoff for UI planning and an **open-gated** derived calculation. Do not accidentally run the expensive planner while closed.
- Already one-call derived expressions (e.g. `createCityMapSnapshot`, `buildScenarioCatalogCards`, `selectRouteOperations`, `getRetailBuildMenuOptions`) do **not** need an extra wrapper.

## Behavior and acceptance invariants

1. **Controller** remains the single transition, scenario gate, progression, SFX and autosave authority. No game-domain or save-schema changes; no new compatibility layer.
2. **Scenario lifecycle:** retain `expectedRunId` + `expectedRevision` on replacement/import, the current result rendering, and read-only synchronization keyed by `playMode` / `runId` / `status` / `scenarioRunSyncEpoch`. Ordinary game commands must not clear selections or reset time.
3. **Saves:** manual saves consume the controller's live non-proxy game, publish correct slot summaries, preserve error/result feedback and load-reset behavior, and never introduce duplicate autosaves.
4. **Rail/placement:** invalid tile feedback, first-click preview / second-click commit, canceled waypoints clearing stale target, map-owned rail Escape/right-click **without** page double-handling, and correct scenario/cash/finance guards.
5. **Finance:** retain review generation/stale async result handling, quote refresh on existing rejection codes, no double-submit and focus restore after `tick()`.
6. **Overlays/keyboard:** preserve current priority, modifier suppression, menu/alerts differences, dialog-owned Escape, rail keyboard toggle and map-render/timer policy.
7. **No player-facing change:** no layout, copy/locales, art/SFX asset, scenario balance, industry/economy or Phaser scene behavior.
8. **Verification after each vertical slice:** write focused node specs before removing the inline counterpart, run check + route unit tests + relevant E2E; full check/lint/unit/E2E at completion. Existing `page.svelte.spec.ts` tests **helpers/controller**, not the mounted page, so it is not a standalone old/new UI equivalence oracle.

**Special first-test:** canvas rail `buildCancelled` Escape/right-click and the “page Escape does not pop twice” behavior currently have no dedicated E2E assertion. Add a pure rail reducer + overlay precedence node spec **before** extraction, plus a narrow E2E integration probe if needed to verify actual double-event handling.

**Size gate:** measure `wc -l` for the page and newly added modules after every commit. After the first five major flow extractions, expect **~2,100–2,200** lines, not ~1,200. The **required** follow-on stage plans map/world navigation, guidance and inspector read models plus any remaining meaningful UI coordination revealed by the early audit, with a measured budget for the remaining ~900–1,000 net lines. The review's named extractions alone (~400–500) are insufficient to guarantee the target; do **not** label that subset a complete solution. Reconcile measured reductions against the 2,439-line requirement *before* final verification. If no cohesive extraction remains, report the shortfall for an explicit scope decision rather than weakening the ticket or inventing hollow helpers. No second PR.

**Verification:** `bun run check`, `bun run lint`, `bun run test:unit -- --run`, `bun run test:e2e`, `git diff --check main...HEAD`, and mandatory `CLAUDE.md` Svelte documentation/autofixer flow on touched Svelte code. Update the `CLAUDE.md` architecture paragraph, not its `AGENTS.md` symlink.

## Non-goals

No `src/lib/game/` refactor, new application store or command bus, monolithic route controller, generic placement engine, save migration, new art/SFX or multi-PR delivery. HPA-719 (art), HPA-720 (electronics chain) and HPA-721 (economy) remain separate work.
