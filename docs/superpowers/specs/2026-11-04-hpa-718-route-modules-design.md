# HPA-718 — Focused Game Route Modules: Design Specification

**Linear:** https://linear.app/cwchanap/issue/HPA-718/refactor-split-the-main-game-page-into-focused-route-modules
**Roadmap:** https://linear.app/cwchanap/issue/HPA-717/roadmap-make-the-long-game-finishable-for-every-store-type
**PR:** https://github.com/cwchanap/Serpens/pull/70 — **single draft PR** for design, implementation, and verification
**Inspected baseline:** `main@4fa7296dd68112daaaf799b182226af001f922b9`
**Review:** https://github.com/cwchanap/Serpens/pull/70#issuecomment-6647119067
**Status:** revised **docs-only** planning checkpoint; no runtime implementation or passing tests claimed.

## Goal and size budget

Split `src/routes/+page.svelte`, preserving player behavior. At the inspected baseline it has **3,639 physical lines**, with `</script>` on line **3,013** and approximately **626 lines of markup**, plus 123 top-level functions. Aim for **~1,200 lines or fewer** in the page and **~500 lines or fewer per new focused module**, without hiding code in a monolith or creating hollow wrappers. That leaves approximately **574 lines of script/imports** in the page. Count actual results during each implementation slice; do not pretend the page can reach the target with all its present runes and host adapters left untouched.

The right starting point is *deletion and consolidation*, not relocating every line. Existing code already has real owners:
- `gameRouteController.ts`: raw current game (`controller.game`), scenario command/persistence gate, sandbox autosave, save repository, and state publication.
- `financePurchaseReview.ts`: finance-review request and generation/settlement state transitions.
- `supplyPlannerRoute.ts`: existing projection `deriveSupplyPlannerResult` and planner handoff.
- `alertNavigation.ts`, `storeDetailFocus.svelte.ts`, `resolveShortcutAction` and `*Host.svelte`: focused, already-tested behavior.

Keep the page as the **composition root** for the controller, cross-feature selection state, lifecycle/auto-tick effects and existing host markup. Put state runes *inside small feature-local `.svelte.ts` factories* where that state is written predominantly by one feature (reuse the established `storeDetailFocus.svelte.ts` pattern). Keep any cross-feature selections in the page. Use plain `.ts` selectors/reducers for node-testable decisions; reactive reads stay within an explicit `$derived.by` boundary in the page or the owning `.svelte.ts` factory. No new Svelte store, global bus, service locator, domain layer or runtime schema.

## Review decisions and revised module map

| Target | Decision | Reason |
| --- | --- | --- |
| **Extend** `gameRouteController.ts` | Move manual slot create/overwrite/delete and summary refresh into the existing controller; consolidate equivalent command availability guards there | The controller already owns the save repository, raw game, mutation boundary and callbacks. Delete the page's direct repository access and repetitive guards instead of moving them |
| New `routeOverlays.ts` | A small, **pure** policy table and Escape-priority resolver | Consolidate the repeated gate membership with explicit exceptions and pin today's behavior in node tests; **do not** introduce a competing giant overlay `$state` record |
| New `railBuild.ts` + small `railBuild.svelte.ts` | Pure transition/reducer for click/waypoint/confirm plus feature-local runes and live projections | The rail mode/target/preview is cohesive reactive state; keep rail/placement's shared feedback in one explicit owner |
| New `placementRoute.ts` | Extract scenario preview restriction, cash/finance decision and placement-specific orchestration; reuse `financePurchaseReview.ts` | Retail founding, retail expansion and industry placement have real differences — extract common choices, not a generic dispatcher that obscures them |
| New `scenarioRoute.ts`; optional small catalog `.svelte.ts` | Shared content-allowance predicate, result mapping, pure run-identity sync decision and catalog lifecycle/UI state where cohesive | Preserve compare-and-swap confirmation tokens and scenario adoption rules without copying controller logic |
| **Extend** `supplyPlannerRoute.ts` | Reuse `deriveSupplyPlannerResult` for the page's derived value and existing handoff API; move only genuine planner-specific UI state/actions | No second projection or planner engine |
| Optional small `savePanel.svelte.ts` | Feature-local save panel open flag, feedback, slots and diagnostics when that meaningfully reduces page wiring | Save **operations** belong to the controller; do not create `saveSlotRoute.ts` just for two feedback formatters |
| Optional `mapNavigationRoute.ts` | Only if a cohesive map/navigation block remains and the page is over budget | Avoid speculative modules |

**Dropped from the original proposal:** `routeCommandHandlers.ts`, `routeReadModels.ts` and `keyboardRoute.ts`. Most `$derived` already delegate to tested selectors, and most page command handlers are thin controller gates. Retain truly local adapters (`changeStoreProduct` product lookup/`null` contract, `upgradeStoreHandler` `null` contract, `removeRecurringRoute` selection cleanup), shortcut DOM target checks and view navigation close to their actual owner.

This is a **target shape, not a mandatory file count**. Create files only when the corresponding implementation slice proves a cohesive boundary. Prefer a small number of modules over the original nine.

## Overlay policy: consolidate *gates*, not all UI state

Today six places enumerate overlapping but non-identical conditions: `isMapPaused`, `railKeyboardEnabled`, `hasBlockingOverlay`, page Escape precedence, `closePlannerOverlays` and `resetTransientViewState`.

Build a closed `OverlayId` and a table expressing default `pausesMap`, `blocksShortcuts` and `disablesRailKeyboard` policy, plus `ESCAPE_ORDER` and pure `selectOverlayGates` / `resolveEscapeTarget` helpers. The page builds a **read-only snapshot from existing owners** (save panel factory, scenario UI, finance review, store focus, management panel and menu flags), so there is still only one source of truth for each flag. Do not mirror `financePurchaseReview` or `storeDetailFocus` into an independent state record; that would duplicate authority.

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

**Size gate:** measure `wc -l` for the page and newly added modules after every commit. If it misses ~1,200, move another **cohesive** state/handler cluster. Do not inflate abstraction solely for a numerical target; record and request an explicit review decision rather than silently waive it.

**Verification:** `bun run check`, `bun run lint`, `bun run test:unit -- --run`, `bun run test:e2e`, `git diff --check main...HEAD`, and mandatory `CLAUDE.md` Svelte documentation/autofixer flow on touched Svelte code. Update the `CLAUDE.md` architecture paragraph, not its `AGENTS.md` symlink.

## Non-goals

No `src/lib/game/` refactor, new application store or command bus, monolithic route controller, generic placement engine, save migration, new art/SFX or multi-PR delivery. HPA-719 (art), HPA-720 (electronics chain) and HPA-721 (economy) remain separate work.
