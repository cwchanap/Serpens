# HPA-718 — Feature-ownership redesign addendum

**Original design:** [focused route modules](2026-11-04-hpa-718-route-modules-design.md)

**Implementation:** [ownership redesign plan](../plans/2026-11-04-hpa-718-ownership-redesign.md)

**Delivery:** HPA-718, same draft [PR #70](https://github.com/cwchanap/Serpens/pull/70).

**Planning baseline:** `d8b9eec309bafc9f7f422e6087764762ddbca4b7`, `src/routes/+page.svelte`: **2,952 physical lines**. This follows the original 3,639-line baseline and earlier extractions; it is not a fresh start.

**Evidence:** full A–I reconnaissance in `.superpowers/sdd/2026-11-04-hpa-718-route-modules/redesign-recon.md` (local execution evidence, not a required durable dependency). This addendum preserves its decisions without copying its source-range inventory.

**Status:** planning only. No new implementation, test pass or final size result is claimed.

## Intent and authorization

The user authorized a **broader feature-ownership redesign** to reach the original **~1,200-line page** target, in the same PR, with **~500 lines or fewer per new focused production module**. Feature-local Svelte state and stronger view-host ownership are permitted. No further approval/check-in is required except a hard blocker; subsequent execution is pre-authorized as subagent-driven development. This document and its standalone plan replace the remaining original-plan extraction stage, not completed controller/policy work.

Only that broader scope was user-approved. The particular factories, interfaces and allocations below are engineering decisions based on recon, not claims that the user individually approved each API.

### Explicit overrides versus unchanged constraints

| Original requirement | Authorized replacement / unchanged rule |
| --- | --- |
| Default to page-owned runes; `.svelte.ts` only for isolated leaves | **Override:** cohesive save, scenario, construction/rail/review, planner, management, map/inspection and bounded runtime UI owners may use per-page-instance Svelte factories. |
| Save flags/feedback must remain in the page; no save UI module | **Override:** move the complete save presentation workflow together, leaving repositories and commits in the controller. |
| Rail mode/target/shared feedback remain page-owned; pure reducer only | **Override:** a rail session and construction owner apply the existing pure reducer and own temporary state. Do not replace the reducer or rail domain. |
| Keep shared selection, auto-tick effects and existing host markup in page; no keyboard module | **Override only where needed:** map selections belong to a focused map session; local runtime effects and keyboard mechanics may move; existing hosts own cohesive read models/commands. The root still composes separate screen regions and owns cross-feature policy and synchronous reset orchestration. |
| Suggested further guidance extraction and original script/markup allocation | **Revised engineering choice:** keep guidance state/layout at root; use the measured current-page budget below rather than the obsolete ~574-line script allowance. No meaningless guidance wrappers to meet a count. |
| Controller authority, observable behavior, one PR, ~1,200/~500 targets, complete verification | **Unchanged.** The override is not permission for a global store, monolithic route proxy, second controller, domain/schema changes or weakened tests. |

## Approach

1. More pure selectors or markup-only wrappers leave state, adapters and orchestration at root; recon shows this is insufficient. Removing all current post-script lines alone still leaves 2,296 before replacement wiring.
2. A renamed `GameRoute`/`MapWorkspace`, provider, aggregate UI controller or giant actions/context object would meet the count by hiding the route. Rejected.
3. **Chosen:** feature-lived factories plus stronger existing hosts, nine serial vertical slices. Each slice owns a complete temporary UI workflow and can be tested/committed without waiting for all other owners. Existing narrow page callbacks bridge not-yet-extracted siblings; no preparatory mega-context task.

This may increase total production/test lines. It makes no promise of repository-wide deletion, bundle reduction or faster runtime. Measure those totals rather than equating relocation with simplification.

## Authority and root responsibilities

`GameRouteController` remains the sole domain-transition, scenario-command/CAS, persistence, progression, command-SFX and publication authority. UI owners may invoke typed command subsets and existing UI cues; they must not run domain transitions, save games, queue commands or introduce shadow writable `GameState`/active-run copies. Preserve truthful `GameRouteCommitResult`, lifecycle `busy`, UI-gated `unavailable`, and adapter `null` contracts. No controller redesign is required.

`+page.svelte` retains:

- One controller and its published sandbox/run/result/error/pending/ready/mode projections, derived playable game and availability/content gates shared across features.
- Controller observer routing and accepted-change map activity sequencing. Loads/adoptions never synthesize or replay activity.
- Scenario identity comparison (`playMode`, `runId`, `status`, `scenarioRunSyncEpoch`) and synchronous ordered reset dispatch; separate successful-load and planner-close protocols.
- Cross-feature alert/guidance/planner navigation. Opened-city navigation accepts `unchanged`; alert-city navigation still requires committed results.
- A read-only `OverlaySnapshot`, global priority/gates and small close/selection switches. No writable overlay registry.
- Shell menu/alerts/cheat-sheet flags, `svelte:head`, root `main` data attributes, screen composition, ControlDesk, guidance/cash recovery and measured guidance/map wrappers/styles.
- One per-instance `createRoutePreviewGame()` fallback shared by hosts; no per-host regeneration or module-level fallback singleton.

The page must visibly compose header, progress, map surface, inspectors, guidance, construction, management, saves, advisor and scenario dialogs. No all-screen host swallowing those siblings.

## Feature and file ownership

All paths below are under `src/routes/`; retain existing library components as presentation and existing pure route helpers as mechanisms.

| Slice | New files / changed existing hosts | Responsibility and lifetime |
| --- | --- | --- |
| A Saves | `saveUi.svelte.ts`, `SavePanelHost.svelte` | Metadata/diagnostics, translation-key feedback, open state, observer receivers and complete auto/manual panel operations. UI survives panel unmount; host renders existing SavePanel only while open. |
| B Scenario presentation | `scenarioUi.svelte.ts`, `ScenarioCatalogHost.svelte`, `ScenarioProgressHost.svelte`, `ScenarioMenuActions.svelte`, `ScenarioResultsHost.svelte` | Catalog/inspected refs, evidence, objective expansion, dismissal identity, localized cards/progress/results/errors and action workflows. Derive from live controller projections; never own mode/run persistence. |
| C Construction | `constructionUi.svelte.ts`, `railBuildSession.svelte.ts`, `purchaseReviewSession.svelte.ts`, `ConstructionControls.svelte`; adapt `FinancePurchaseReviewHost.svelte` | Construction owner owns exclusive placement/menu/shared feedback and previews. Rail session owns mode/last target and applies `railBuild.ts`. Review session owns generation/confirmation/focus using `financePurchaseReview.ts`. Controls own plaque/menu/review DOM, not maps/planner. Aim for ~300–400 lines in the main owner, not a 700-line replacement controller. |
| D Advisor | `supplyPlannerUi.svelte.ts`, `SupplyAdvisorHost.svelte` | Durable product/horizon/open context, gated projection, fresh action validation and existing `SupplyPlannerHandoffHost` bridge. Reuse `supplyPlannerRoute.ts`; no new planning engine. |
| E Management | `managementUi.svelte.ts`; strengthen `ManagementPanelHost.svelte` | Factory owns navigation/focus/preset/menu labels. Existing host owns panel read models, command adapters, keyed content and conditional report-window lifetime. No wrapper around its existing ~700-line shell. |
| F Maps/inspection | `mapSession.svelte.ts`, `retailInspection.svelte.ts`; strengthen `MapSurfaceHost.svelte`, `MapInspectorHost.svelte` | Map session owns active/visited views and four selected IDs, city/world/logistics navigation projections. Surface retains visited renderer lifetime and derives snapshots/activity. Retail inspection wraps existing `storeDetailFocus.svelte.ts`, selected store/report and guarded commands. Inspector derives industry/rail details and renders store detail. No all-screen workspace. |
| G Runtime | `routeAudio.svelte.ts`, `routeLocale.svelte.ts`, `simulationClock.svelte.ts` | Three separate bounded owners for preferences/audio, locale and primitive-dependent auto-tick. Never combine into a runtime facade. |
| H Input | `routeKeyboard.ts` | Event-time DOM classification and keyboard mechanics using existing shortcut/overlay resolvers. Root retains one window listener, overlay policy and named dispatch switches. |
| I Header | `RouteHeader.svelte` | TopBar/management menu/audio markup and local menu CSS. Two bound root menu flags and a menu-actions snippet; no factory or combined feature context. |

### Live interfaces and instance rules

- Instantiate each factory **once during route initialization**, never at module scope, inside an overlay conditional or in an effect. Getters/derived return values stay live: direct owner reads or `$derived` projections, not ordinary setup-time destructuring.
- Inputs are individual typed getters of current game, city, locale, definition, permission or controller projection. Do not capture an initial game/object snapshot, pass the entire route context or mirror props into writable state. Local option types live beside owners; use `ReturnType<typeof create…>` for host owner types rather than a shared contract mega-file.
- Command ports are explicit feature-only `Pick<GameRouteController, …>` aliases. Pass the instance structurally and invoke `commands.method(...)` to preserve `this`; never destructure unbound class methods or spread the controller. No arbitrary mutation, repository access, `getState` or sibling UI on a port.
- Factories expose read-only views and named operations, not setters for every atom. Review host binding must target the single review owner via an intentional getter/setter or update callback, never a second synchronized copy.
- No `setContext/getContext`, global singleton/store, generic `UiState`, dispatch/actions bag, provider, registry or factory importing the page/constructing another controller.

Required seams (types are existing domain/route types; the plan assigns concrete method names):

| Boundary | Contract |
| --- | --- |
| Saves → root | Synchronous `onLoaded(): void` for successful-load reset only; `onOpen(): void` for current menu/panel hide only; summary/autosave/error observers delegate to one SaveUi. |
| Scenario → root | `onOpenCatalog(): void`, `onResultsClosed(): void`; receivers accept existing `ScenarioPersistenceSummary` / `ScenarioRun`. Definition getter stays available for root content/availability gates. |
| Construction → selection/shell | `onSelectPlacementTile(kind: 'retail' \| 'industry', tileId: string): void`, `onClearSelections(): void`, `onFoundingPause(): void`, `onMenuOpen(): void`. Clear only existing world/tile selections, not an arbitrary patch or all route state. |
| Map click → construction | `tryConstructionClick(kind: 'retail' \| 'industry', tileId: string): boolean`; true consumes accepted **or rejected** build/rail attempts, false continues read-only inspection. |
| Maps → siblings | `onCancelConstruction(): void`, `onClearLogisticsFocus(): void`, `onReviewPurchase(purchase: PendingFinancedPurchase): void`. Existing purchase discriminated union, no cloned finance DTO. |
| Inspection → siblings | `onClearRetailSelection(): void`, `onManageSupply(retailCityId: WorldCityId): void`, `onPlanProduct(productId: ProductId): void`; close detail focus before handoff. |
| Management → maps | `onRouteRemoved(routeId: string): void` only after committed removal. Management clears its matching focus, maps clears only matching selection. |
| Planner → navigation | Existing `SupplyPlannerHandoffHost`, especially `switchToSupplyCity(cityId: WorldCityId): Promise<boolean>` and post-await revalidation. Root owns ordered close/switch orchestration. |
| Clock | Primitive `getHasGame(): boolean`, `getBlocked(): boolean`, `getCanAdvance(): boolean`, `advanceDay(): Promise<GameRouteCommitResult>`; no runtime/game-object lifecycle input. |
| Keyboard → root | `getOverlaySnapshot(): OverlaySnapshot`, `closeOverlay(id: OverlayId): void`, `clearSelection(kind: 'worldCity' \| 'retailTile' \| 'industryTile' \| 'logisticsRoute'): void`, plus explicit toggle/view operations. Reuse resolver union types. |

## Reset, lifecycle and dependency contracts

Initialize root projections/shell atoms, then features/controller using lazy closures that do not execute commands or sibling callbacks during construction. The current controller constructor only stores options; repository initialization occurs on mount after all owners exist. Choose a safe declaration order, prove mounting cannot access an uninitialized owner, and do not mask cycles with non-null assertions.

`onStateChange` synchronously assigns projections, clears scenario evidence at the existing sandbox seam, compares the identity tuple and calls the ordered route reset **in the same turn**. No effect-watching-game reset or asynchronous sibling synchronization. Preserve these distinct protocols:

| Protocol | Required effects / exclusions |
| --- | --- |
| Scenario identity/epoch change | Clear retail/industry/world/logistics selections and matching route focus; logistics preset/source focus; store detail; build/advisor visibility; pause clock; close shell menus/alerts, hide management, clear finance focus and cancel construction. Preserve visited maps, planner category/horizon, result dismissal/objective expansion at their existing lifetimes; do not invent reset-all. Ordinary local non-day publications do not trigger it; same-run external adoption does. |
| Successful auto/manual load | Clear map selections/selected-route focus; cancel construction; rearm **both** guidance dismissals; pause. Do not close the additional UI from scenario reset. Missing/unavailable/thrown load does none of this. |
| Planner close-all | Keep existing memberships and order as its own root callback, not an alias of either reset or Escape. No domain mutation before explicit later submit. |

Critical lifetimes/dependencies:

- `management.hide()` changes active panel only. User `close()` also clears logistics focus/preset and retail source focus, **not finance focus**; its separate reset seam clears finance focus. Non-logistics/non-stores opens clear only their respective stale focus. `reportDays` stays in the conditionally mounted host: survives panel swaps, resets to **14** on close/unmount; keep `#key panelId` focus recovery.
- Construction `hideMenu()` is silent; user `closeMenu()` retains panel-close SFX. Rail step cancel is not cancel-all. Cash placement retains immediate cleanup/fire-and-forget behavior. First founding pauses synchronously. Review generation/reference behavior, refresh eligibility/current-game fallback, pending-close guard and `tick()` focus restoration are unchanged; reset/success do not restore dismissal focus.
- Scenario dismissal uses original result **reference identity**, not cloned results. Contributor lookup keeps `activeRun.game ?? evidenceGame ?? game`; meaningful controller errors beat generic fallback. Keep CAS run/revision confirmations, distinct start keys, imported inspected refs, clipboard failure `false`, summary-owned catalog truth and existing repeated return-to-sandbox behavior on the explicit Sandbox path.
- Planner result stays lazy while closed/pre-game/productless; snapshot at current calculation boundary. Horizon remains UI state: do **not** newly pass it into the existing calculation. Planner build affordability remains cash-only even where BuildMenu supports finance. Re-derive on click; revalidate city/building after await.
- Map click clears logistics selection/focus first, construction consumes first, otherwise footprint selection resolves anchors (rail cells remain cells). Read-only observer updates only its selected atom, never recursively commands. Playable view switch clears management logistics focus; world retains it. Accepted opened-city `unchanged` is not permission to broaden alert navigation.
- Rail network cache depends on game rails/buildings/city, not selected tile; lazy segment getter stays unread for hidden/build-active/invalid selection. Store focus reuses the existing factory: guarded normal open clears product focus, alert direct-open may precede selection derivation, close clears it; no new vanished-selection reset effect.
- Clock delay stays **5,000ms / speed**, speed **1 | 2 | 5**. Lifecycle reads only primitive existence, pause, speed, tick-pending, blocked and rearm. Read permission at fire time, not arming; policy/game replacement or scenario pending changes must not postpone a deadline. Pending-at-fire rearms; no overlap; reset/load/founding pause immediately; no-game toggle stays guarded. Root computes `blocked = overlayBlock || worldView`.
- Root mount starts saves/scenarios before audio. Audio `mount(): () => void` runs at the end of the existing synchronous root mount; return its cleanup, not an async mount losing teardown. No production `$effect.root` is needed. Locale guards the storage **property access** and retains navigator-language fallback; document language and translated feedback stay reactive.
- Cash recovery remains writable-derived from **primitive crisis kind only** at root: locale/alert object replacement must not rearm dismissal.

## Rendering and input invariants

No changed copy, layout, balance, assets, Phaser behavior or data attributes. Keep visited canvases mounted and inactive/paused/keyboard flags correct. Outer map-surface/guidance and scenario-progress positioning wrappers remain root-owned. Move plaque's 39 CSS lines with controls, using local `guidanceVisible` class and inherited `--og-card-h`; move header's 40 local menu CSS lines with its DOM. No broken scoped ancestor selectors, global stylesheet dump, wrapper altering focus/click-outside or formatting compression.

Overlay exceptions remain unchanged: alerts block shortcuts/rail Escape, not map rendering; management pauses map with its existing shortcut path; pending finance keeps map rendering and owns capture Escape; placement keeps rendering; catalog/results own their Escape; canvas owns rail cancel. World blocks auto-tick without generally blocking view shortcuts. One event must never dismiss/cancel twice. Keyboard reads current owners at event time, ignores typing/interactive targets and leaves modifier shortcuts to the browser.

## Measured baseline, projected budget

Recon measured distinct source ranges at the stated baseline; replacement wiring is **estimated**, not implemented. Its exact range ledger remains local evidence, not shifting line references executors should blindly delete.

| Task / slice | Assigned body/style | Credited imports | Replacement page allowance | Projected net reduction | Projected page |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 / A Saves | 181 | 4 | 40 | 145 | 2,807 |
| 2 / B Scenario | 340 | 20 | 70 | 290 | 2,517 |
| 3 / C Construction | 627 | 37 | 110 | 554 | 1,963 |
| 4 / D Planner | 172 | 15 | 65 | 122 | 1,841 |
| 5 / E Management | 168 | 4 | 50 | 122 | 1,719 |
| 6 / F Map/inspection | 435 | 31 | 160 | 306 | 1,413 |
| 7 / G Runtime | 160 | 10 | 45 | 125 | 1,288 |
| 8 / H Keyboard | 132 | 2 | 55 | 79 | 1,209 |
| 9 / I Header | 83 | 2 | 35 | 50 | **1,159** |
| Total | **2,298** | **125** | **630** | **1,793** | |

**2,423 distinct assigned + 529 retained = 2,952; 529 + 630 = 1,159.** Exactly 1,200 needs a 1,752-line reduction, so the projection has **41 lines** of headroom. All new page imports, initialization, wrappers, observer delegates, cross-owner callbacks and retained/re-expressed orchestration count against the 630. Uncredited import/reset cleanup is not guaranteed reserve.

Measure formatted actual page/new module/touched production totals after **each** slice. If a slice exceeds its allowance, reconcile remaining non-overlapping budget before proceeding; carry overruns explicitly. No automatic tolerance increase, line-count tricks or new giant host. If cohesive remaining work cannot meet ~1,200/~500, report measured shortfall as a hard blocker, not completion. The existing ~700-line management host is not newly created and is not license to create another; record its growth/cohesion in the audit.

## Verification and acceptance

Each of the nine serial tasks must carry red→green ownership tests, real route integration and a reviewable commit. Use mounted browser `.svelte.spec.ts` for live getters/effects/events, not just pure `.ts` reducer tests. Preserve existing host assertions. Every Vitest test needs an `expect`. Read official Svelte docs before actual Svelte edits and run autofixer on every changed `.svelte` file until clean; module lifetime additionally needs mounted tests/checks.

Mandatory risk coverage: save feedback before deferred summary, six resolve/reject manual cases and successful-only load reset; scenario CAS/result identity/external adoption; rail real canvas Escape/right-click single-pop; finance stale generation/double-submit/focus; lazy fresh planner and post-await revalidation; management hide/close/report-window/focus; maps/retail deep links and lazy rail cache; clock fake deadlines/rearm and full time-flow; locale/audio teardown; overlay event propagation. Existing `page.svelte.spec.ts` is helper/controller coverage, **not** a mounted-page equivalence oracle.

For each slice run `bun run check`, changed-file ESLint/Prettier, `bun run test:unit -- --run src/routes`, and relevant **real Playwright E2Es**. Keep canvas-settle `data-*` waits. Completion additionally requires production build, `bun run lint`, all unit/client and E2E tests (`bun run test`), full diff checks and whole-branch review. Update the architecture paragraph in `CLAUDE.md` only, not its `AGENTS.md` symlink. Keep the PR draft pending the existing approval process; no new approval pause before execution.

No domain, schema/migration, persistence API, game asset, dependency, scene redesign, locale-copy, economy/scenario balance or unrelated-ticket work. No native Tauri verification claim without actually running it. Evidence must distinguish historical tests, estimates, fresh results and unverified risks.
