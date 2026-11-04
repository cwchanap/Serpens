# HPA-718 — Focused Game Route Modules: Design Specification

**Linear:** https://linear.app/cwchanap/issue/HPA-718/refactor-split-the-main-game-page-into-focused-route-modules
**Roadmap:** https://linear.app/cwchanap/issue/HPA-717/roadmap-make-the-long-game-finishable-for-every-store-type
**Branch:** `docs/hpa-718-route-modules` — single draft PR for planning, implementation, and tests
**Inspected baseline:** `main` @ `4fa7296dd68112daaaf799b182226af001f922b9` (2026-11-04)
**Status:** design/planning only. No route implementation or passing tests are claimed.

## Outcome and evidence

Make the main Svelte route cheap to understand and extend **without changing anything a player can observe**. On the inspected baseline, `src/routes/+page.svelte` is 3,639 physical lines (the ticket's ~3,638), with a `<script>` ending at line 3,013 and ~626 lines of markup. There are 123 top-level functions, many route-owned runes, and substantial derived UI/permission/preview calculations. Moving only the seven handler groups named in the ticket will not plausibly meet the ~1,200-line target: **derived read models and orchestration also need to move**.

Already available and authoritative:
- `gameRouteController.ts` owns gameplay/scenario command commits, autosave coordination, scenario persistence and accepted-state publication.
- `financePurchaseReview.ts` owns pure finance-review request, generation and settlement rules.
- `supplyPlannerRoute.ts` owns planner selectors and handoff rules.
- `storeDetailFocus.svelte.ts` owns its two focused-detail atoms; `alertNavigation.ts` owns alert destinations.
- `*Host.svelte` components already own substantial markup/presentation surfaces.

No new application state authority, UI framework, dependency injection container, global store, game domain abstraction, persistence schema, or renderer abstraction is needed.

## Chosen architecture: route-owned runes, focused TypeScript helpers

Keep `+page.svelte` as the **only top-level route composition root**: it creates `GameRouteController` once; owns the top-level `$state`, `$derived`, `onMount` and `$effect` lifecycles; and binds the existing page/host markup. Reuse `storeDetailFocus.svelte.ts` as-is. The controller still owns actual game transitions and saves; the new helpers own only route orchestration and pure read-model computation.

Use **ordinary colocated `.ts` files** unless a small, independently coherent reactive state genuinely needs to move into `.svelte.ts`. Prefer pure functions for projections and action factories with narrow typed host callbacks for cross-panel operations. The host supplies *current* values through getters at action time and updates the route-owned runes through explicit callbacks. Do not capture a `game` or permission snapshot once when creating a handler; it will become stale after a controller publication. Do not make one giant `RouteContext` with dozens of unrelated members: each feature accepts its own narrow host interface.

For derived values, leave the tracking boundary in the page, e.g. a `$derived.by(() => selectSomething({ game, ... }))` call. The selector itself is a pure function; no hidden subscriptions or effects. Keep lazy gates (notably the Supply Planner calculation when its overlay is closed) and preserve the existing primitive `hasGame` dependency in the auto-tick effect so ordinary game mutations do not restart the clock.

### Module ownership map

These are proposed cohesion boundaries, **not** a mandate to introduce one file per function. Keep each new module ~500 lines or fewer; add a second appropriately named selector module only if an actual cohesive boundary exceeds that budget.

| Module | From current page | Responsibility |
| --- | --- | --- |
| `saveSlotRoute.ts` | 1436–1468, 1685–1711, 2004–2102 | Save panel actions, summaries, manual slot feedback and load/reset choreography; controller/repository remain the save authority |
| `scenarioRoute.ts` | 1469–1684, scenario projections at 458–508 and 625–652, sync at 1912–2003 | Catalog/start/resume/restart/import/share/results, UI projections and controller-adoption identity rules |
| `railBuildRoute.ts` | 1122–1148, 1292–1435, 988–1035 | Rail mode and previews, first-click preview/second-click commit, waypoint cancellation, feedback and segment actions |
| `placementRoute.ts` | 2103–2144, 2510–2742, 893–984 | Retail/industry arming, scenario-filtered build previews, placement/financing routing and confirmation lifecycle; reuse `financePurchaseReview.ts` |
| **Extend** `supplyPlannerRoute.ts` | 2145–2260, relevant derived selections at 597–615 and 1061–1068 | Overlay context, product/horizon selection, guarded plan calculation and existing handoff; no parallel planner |
| `routeCommandHandlers.ts` | 2294–2510 | Named typed UI adapters over `GameRouteController` for policy, staff, logistics, credit, store products/upgrades; consolidate repeated availability checks without a second commit/autosave path |
| `mapNavigationRoute.ts` | 1216–1291, 1712–1900, 2743–2765, map/selection selectors | Map/world-city selection, inspectors, menu/panel navigation and read-only map/alert state |
| `keyboardRoute.ts` | 2766–3012 and alert navigation at 2790–2878 | Shortcut target classification, overlay/Escape precedence and alert handoff; keep existing `resolveShortcutAction` and `alertNavigation.ts` |
| `routeReadModels.ts` | remaining derived UI/permission/overlay/guidance/map projections at 509–1093 | Pure grouped selectors for route-only presentation, blocking overlays, guidance, allowed content, summaries and snapshots; split by meaningful domain if it grows beyond 500 lines |

Retain existing `gameRouteController.ts`, `financePurchaseReview.ts`, `alertNavigation.ts` and `storeDetailFocus.svelte.ts` rather than recreating their logic. If the budget requires it, move the deterministic starter-state construction into a small route-local pure builder, **not** `src/lib/game/`. No cosmetic helper split solely for a line count.

### Page-size target as a real gate

The markup is ~626 lines already, leaving **at most ~574 lines for script/imports** to hit ≤1,200. After extracting large handlers, also replace long inline `$derived.by` bodies with calls to typed pure selectors and remove imports now owned by helpers. Keep only concise route-owned runes, derived wiring, controller setup, effects and markup. Recount `wc -l src/routes/+page.svelte` and every new module **before** calling the refactor complete. If the page misses the budget, move the next cohesive region rather than introducing a catch-all helper or hollow wrapper. Prefer revisiting the target in review over worsening cohesion just to hit an arbitrary number.

## Invariants that must survive the move

1. **Command and autosave authority:** Only `GameRouteController` may dispatch game/scenario transitions and perform its accepted-state/autosave side effects. A “shared apply command and autosave” wrapper must **delegate to it**, not mutate the game directly or autosave twice. Preserve distinct handler result contracts: some pre-command failures are `null`, while logistics/finance unavailable actions return `{ status: 'unavailable' }`.
2. **Scenario conflict semantics:** Preserve expected run-id and revision confirmation tokens through catalog replacement/import; unchanged run resumes do not reset overlays; only a changed `playMode`, `runId`, `status` or `scenarioRunSyncEpoch` resets selections and pauses the simulation. Never reset merely because the `ScenarioRun` object changed after an ordinary command. Preserve terminal-results navigation and conflict-refresh behavior.
3. **Save boundaries:** Manual saves pass **`$state.snapshot(game)`** from the Svelte boundary to the existing save repository; reactive proxies cannot cross the codec’s plain-object boundary. Autosave remains controller-owned. Successful load resets selections/placements/guidance and pauses time; failed load must not. Preserve error and feedback keys.
4. **Rail interaction:** An invalid tile gives specific feedback; first valid destination click previews; the second identical click commits; canceled waypoints pop one at a time and clear stale target/feedback. Canvas Escape/right-click owns rail waypoint cancel, so page Escape must not pop a second waypoint. No change to rail game rules.
5. **Financed purchases:** Respect cash-vs-finance command availability, expected-cost quote and rejection feedback; the existing generation guard suppresses late results after dismissal. Refresh an offer only on the existing result codes, and restore focus after `tick()`. Preserve no-double-submit behavior.
6. **Input/overlay priority:** Cmd/Ctrl/Alt shortcuts remain browser-owned; typing/interactive targets suppress game letters/Space; `?` toggles only as today. Finance-review Escape belongs to its dialog; other overlays, placement, inspectors, and hamburger-menu fallback close in the current order. World-map view blocks auto-ticks without suppressing view navigation.
7. **Reactive and map behavior:** Derived selectors see the latest `game`, locale and permissions. Do not accidentally subscribe the day timer to per-command pending state or a changing game object. Preserve map snapshot/Phaser pause gates, deep-link focus, scenario placement restrictions, alert navigation and planner close/open laziness. No duplicated derived state authority.
8. **No player-visible delta:** No text, localization, layout, art/SFX, economic tuning, save migration or scenario behavior changes. Existing deterministic seed state and test fixtures are authoritative.

## Considered and rejected

- **New global Svelte store/event bus:** unnecessary second authority and larger mental model.
- **Moving all state to a monolithic `.svelte.ts` controller:** merely relocates the 3,600-line problem, obscures ownership and invites tight coupling.
- **Splitting markup first:** the named `*Host.svelte` components already provide view boundaries; most complexity sits in the script. Extract extra markup only if it falls out naturally.
- **A generic string-keyed action dispatcher:** loses existing return-type distinctions and bypasses scenario capability checks. Typed named UI adapters are simpler.
- **Changing `src/lib/game/` to facilitate route extraction:** outside HPA-718. Any such need means the proposed boundary is wrong.

## Verification and acceptance

- `+page.svelte` ≤~1,200 lines; each **new** module ≤~500 lines. Record actual before/after counts in the PR.
- Existing route/controller/planner/finance/host unit specs retain their behavioral assertions; relocate tests only where their tested code moves and add focused route-module specs for orchestration boundaries.
- Explicit regression tests pin stale scenario confirmations, same-run vs changed-run state sync, save proxy snapshots, rail two-click/waypoint cancellation, finance generation + focus, keyboard overlay precedence, and blocked-command result semantics.
- Run `bun run check`, `bun run lint`, `bun run test:unit -- --run`, `bun run test:e2e`, and `git diff --check main...HEAD`; include `retail-sim.e2e.ts`, `recovery-guidance.e2e.ts`, `time-flow.e2e.ts`.
- Update the route architecture paragraph in `CLAUDE.md` (not the `AGENTS.md` symlink); follow the mandatory Svelte documentation/autofixer workflow in `CLAUDE.md` for any touched Svelte file.
- **One ticket, one draft PR:** implementation and tests continue on the same branch/PR after approval. Do not open a second implementation PR. No separate art/SFX task is needed for this refactor.
