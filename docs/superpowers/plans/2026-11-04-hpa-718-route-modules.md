# HPA-718 — Focused Game Route Modules: Single-PR Implementation Plan

**Issue:** https://linear.app/cwchanap/issue/HPA-718/refactor-split-the-main-game-page-into-focused-route-modules
**Design:** `docs/superpowers/specs/2026-11-04-hpa-718-route-modules-design.md`
**Branch:** `docs/hpa-718-route-modules` (same draft PR throughout)
**Baseline inspected:** `main` @ `4fa7296dd68112daaaf799b182226af001f922b9`
**Status:** docs-only planning checkpoint; no runtime refactor or test pass is claimed here.

## Delivery rules

- **One ticket → one PR.** Keep all code moves, new/relocated specs, CLAUDE.md update and final verification on this branch. The first commit is the design; this second document is the ordered implementation plan. Do not open a separate implementation PR.
- **KISS/YAGNI.** Route-local typed functions and narrow host callbacks only. Reuse `GameRouteController`, `financePurchaseReview.ts`, `supplyPlannerRoute.ts`, `alertNavigation.ts` and `storeDetailFocus.svelte.ts`. No central event bus, global state library, generic command engine, new game domain layer or backward-compatibility migration.
- **Behavior preservation first.** Move code with assertions intact. Avoid simultaneous formatting, UX or simulation changes that make review diff hard to read. No new art/SFX.
- **Acceptance gate:** page ~1,200 lines or less and each new route module ~500 or less **without sacrificing cohesion**. The ~626-line markup means the retained script must be approximately ≤574 lines. Extraction must cover derived selectors too.
- **Svelte rules:** run the official Svelte documentation flow and `svelte-autofixer` on every changed Svelte snippet/file as `CLAUDE.md` requires; retain Svelte 5 runes. All reactive tracking boundaries remain explicit in `+page.svelte`.

## Step 0 — Lock baseline and classify responsibilities

**Read / compare:** `src/routes/+page.svelte`, `gameRouteController.ts`, `supplyPlannerRoute.ts`, `financePurchaseReview.ts`, `storeDetailFocus.svelte.ts`, `alertNavigation.ts`, `*Host.svelte`, `CLAUDE.md` and route tests.

1. Refresh branch from `main`; recheck whether other agents merged edits after `4fa7296`. Do not overwrite newer work. Confirm no duplicate HPA-718 PR.
2. Record `wc -l src/routes/+page.svelte` (3,639 on the inspected baseline), script/markup split (~3,013/~626), and top-level function inventory (123). List all existing `$state` and `$derived` owners so nothing ends up duplicated.
3. Group code by flow, not by source-line order. Mark cross-boundary dependencies explicitly: controller, locale, current game, availability, selected views, overlay flags, focused element.
4. Run focused existing tests once, or record any baseline failures before refactoring. Do not claim a clean baseline without actually running it.

**Gate:** a route ownership map and behavior baseline; only `+page.svelte` remains the top-level game UI composition root.

## Step 1 — Extract pure derived view models before event handlers

**Files:** new `src/routes/routeReadModels.ts` (and a second domain-named module only if needed), plus meaningful projections in `scenarioRoute.ts`, `mapNavigationRoute.ts`, `railBuildRoute.ts` and `placementRoute.ts` as they become available. New colocated `*.spec.ts` tests.

1. Convert long inline `$derived.by` branches for allowed scenario content, build-menu/placement permissions, active city/store/building/rail selections, map overview, rail preview and overlay blocking into typed pure selectors. Keep `$derived` invocations and their live arguments in the page.
2. Move scenario-specific cards/results/progress projections next to scenario flow, map selection/snapshots near map navigation, placement filters beside placement, rail preview calculations beside rail actions; avoid a catch-all 600-line selector module.
3. Keep expensive Supply Planner derivation gated on `isSupplyAdvisorOpen`, and preserve the existing active-city and locale dependencies. Keep read-only game snapshots as transient projections, not persistent route stores.
4. Test sandbox/scenario permission filtering, wrong-city/blocked placement, selected rail junctions, focused store lookup, modal/overlay flags and map snapshot input behavior. Compare old and new outputs using the same game fixtures.

**Gate:** equivalent selected view models with no new mutations, no stale initialization-time captures, no unnecessary planner computation and no changes to `src/lib/game/`.

## Step 2 — Save-slot and scenario lifecycle orchestration

**Files:** new `src/routes/saveSlotRoute.ts` and `src/routes/scenarioRoute.ts`; associated `*.spec.ts`; simplified `+page.svelte`.

1. Move `initializeSaves`, panel open/close, summary refresh, manual save/load/delete, `resumeAutoSave` and error-message mappings into narrow actions over the existing controller/repository. The page must pass an explicit **`$state.snapshot(game)`** when requesting a manual save; do not pass a Svelte Proxy into the codec or change autosave ownership.
2. Use one shared post-successful-load route reset (selection, placement, guidance, pause) for auto/manual resume. Failed or missing saves must not clear the current route view. Preserve the same feedback/translation keys and audio cues.
3. Move scenario card start/resume/restart, code import/copy, results dismissal and abandon handling. Keep the distinct confirmation messages and return the same `ScenarioCatalogActionResult` statuses with `expectedRunId` / `expectedRevision`.
4. Extract the run identity test (`playMode` / `runId` / `status` / `scenarioRunSyncEpoch`) as a pure decision while keeping route-owned state writes in one place; reset only on genuine adoption/lifecycle change, never on an ordinary command publication.
5. Cover failed storage, missing manual slot, proxy snapshot boundary, replacement confirmation, stale revision, terminal result return-to-sandbox and resume-same-run preserving selections. Reuse existing controller/persistence fixture helpers.

**Gate:** identical save/scenario behavior, and scenario commands continue through exactly the existing controller.

## Step 3 — Rail placement and financed retail/industry placement

**Files:** new `src/routes/railBuildRoute.ts` and `src/routes/placementRoute.ts`, existing `financePurchaseReview.ts` reused (modify only if truly necessary), new colocated tests, simplified `+page.svelte`.

1. Extract rail enter/exit, origin/waypoint/destination click, preview status/feedback, segment upgrade/demolish and `buildCancelled`. Retain invalid-click reasons; the **first** legal destination click is only a preview, the **second** identical click commits; waypoint pop clears previous target.
2. Extract retail/industry arm/clear/cancel, blocked tile feedback, founding vs expansion, payment selection and financing offer review. Keep the existing scenario capability gates. Avoid early-returning on invalid placement tiles before calculating a useful block reason.
3. Move purchase confirmation orchestration next to placement but reuse `beginFinancePurchaseConfirmation` / `settleFinancePurchaseConfirmation`: no double-submit, no stale late-write UI, quote refresh only for existing rejection codes, and focus restoration after `tick()`. Keep world-city purchase entry routed to the same finance review state.
4. Test rail cancellation and Escape ownership; wrong-resource and unaffordable tiles; cash-only vs finance-only permissions; accepted and rejected loan quote; generation invalidation after dismissal; focus restoration; and no duplicated autosave.

**Gate:** full placement + finance outcomes unchanged; independent modules stay below the ~500-line target.

## Step 4 — Planner, map/navigation, command adapters and keyboard

**Files:** extend `src/routes/supplyPlannerRoute.ts`; add `src/routes/mapNavigationRoute.ts`, `src/routes/routeCommandHandlers.ts` and `src/routes/keyboardRoute.ts` with colocated tests. Reuse `alertNavigation.ts`.

1. Move Supply Planner overlay open/close, product/horizon controls, cross-city handoff and current plan routing into the existing planner route module. Reuse its handoff host; no second calculation path or new global cache.
2. Move retail/industry/world view navigation, world-city selection, inspector/panel coordination, focused finance/logistics/store routes and alert handoffs into map navigation, preserving world-map time pause and the existing route/controller city switch validation.
3. Replace the repeated simple UI-to-controller command wrappers with typed named adapters that check the **current** game and allowed command at invocation time. Do **not** introduce a general string switch or bypass `GameRouteController` autosave, pending-state or scenario gates. Preserve `null` vs `{ status: 'unavailable' }` contracts and the post-remove-route selection cleanup.
4. Move keyboard classification/dispatch while reusing `resolveShortcutAction`. Preserve modifiers, focus suppression, `?` toggle, Escape overlay priority (including finance review and canvas-owned rail cancel), panel shortcuts and no-overlay hamburger-menu fallback.
5. Test overlay closure precedence, a current-state permission flip after construction, alert deep links across cities, logistics removal, planner handoff, and time-flow interaction.

**Gate:** no dangling route-state capture, and no keyboard, alert, planner or command result regressions.

## Step 5 — Reduce the page, update docs and inspect the diff

**Files:** `src/routes/+page.svelte`, `CLAUDE.md`, test imports and route helpers only.

1. Remove moved functions/types/imports; leave the concise state/derived wiring, controller initialization, `onMount`/effects, event bindings and existing markup. Do not split already hosted markup unless a natural ownership boundary requires it.
2. Do a line-budget pass **after each extraction group**, not just at the end: `wc -l src/routes/+page.svelte src/routes/{saveSlotRoute,scenarioRoute,railBuildRoute,placementRoute,supplyPlannerRoute,routeCommandHandlers,mapNavigationRoute,keyboardRoute,routeReadModels}.ts` (adjust paths to actual modules; check **new** module sizes individually). Aim ≤1,200 and ≤500 respectively. If still high, move the next coherent projection; do not create meaningless one-line forwarding abstractions.
3. Update only the `CLAUDE.md` architecture paragraph describing the Svelte route and its focused modules; do not edit the `AGENTS.md` symlink. Keep i18n keys, existing components and game-domain files unchanged.
4. Review the full diff for hidden behavior changes: extra reactive reads in timer `$effect`, duplicate controller subscriptions, incorrect proxy snapshots, changed command results, repeated autosaves, overlay order, and stale async callback effects.
5. Run Svelte autofixer and Prettier on touched Svelte/TS files; check no unrelated formatting churn.

**Gate:** measured page/module sizes, clean architectural ownership, reviewable behavior-preserving diff.

## Step 6 — Full verification before requesting review

Run and record actual results (no inferred green status):

- `bun run check`
- `bun run lint`
- `bun run test:unit -- --run` — including `src/routes/page.svelte.spec.ts`, `gameRouteController.spec.ts`, `supplyPlannerRoute.spec.ts`, finance-purchase and all `*Host.svelte.spec.ts`, plus new focused helper specs.
- `bun run test:e2e` — especially `src/routes/retail-sim.e2e.ts`, `recovery-guidance.e2e.ts`, `time-flow.e2e.ts`.
- `git diff --check main...HEAD`, plus `wc -l` counts and a changed-file audit.

**Acceptance checklist:**

- [ ] No player-visible layout/copy/interaction/simulation changes.
- [ ] All commands, scenario gates and autosaves still pass through the same controller.
- [ ] Save proxy boundary; scenario revision/resume; rail two-click/cancel; finance dismissal/focus; shortcut/alert precedence verified.
- [ ] `+page.svelte` ≲1,200 lines; each new route module ≲500; code is more cohesive, not just distributed.
- [ ] Svelte autofixer completed; `CLAUDE.md` architecture updated.
- [ ] Full check, lint, unit, E2E and diff check green.
- [ ] Same **single draft PR** updated with implementation, test evidence and final line counts; request Hapadona approval before marking ready/merging.

## Explicit non-goals

Do not change `src/lib/game/` economy/domain semantics, Phaser scenes, UI structure, saved state schema, scenario balance, art/SFX, translations or backward compatibility. HPA-719 art and HPA-720/HPA-721 electronics/economy work remain **independent tickets**, not extra commits on this PR.
