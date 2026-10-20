# HPA-295 — Map Activity Feedback: Implementation Plan

> **One ticket / one PR.** Keep this document, the design spec, production code, localization, unit/browser tests, and review fixes in the **same** HPA-295 draft PR. This is a planning checkpoint, not an implementation completion claim.

**Goal:** Visible, truthful one-shot acknowledgments for actual retail openings/upgrades and industrial production, plus dated inter-city receiving evidence and accessible blocked markers.

**Design:** `docs/superpowers/specs/2026-10-19-map-activity-feedback-design.md`
**Baseline:** `main` / `200bc7bc479b0459c3827a8c47128cbad1918364`, verified October 19, 2026.
**Stack:** TypeScript, Svelte 5, Phaser 4, Vitest, Playwright, Bun.

## First principles / hard constraints

- No simulation, RNG, autosave, scenario result or save-codec edits. Pure gameplay transitions remain authoritative.
- Only an accepted, changed command may create transient pulses; loads and rerenders cannot.
- Production requires a just-recorded positive actual output; building status or city inventory alone are insufficient.
- Inter-city delivery is industry-to-industry; “scheduled to arrive” is not “arrived.”
- Keep the renderer snapshot-driven and effects bounded, local, disposable and non-interactive.
- Reuse existing assets/status dots. No custom art, sound, scheduler, generic notification/event bus, or backwards-compat migration.
- Localization parity in English, Japanese and Traditional Chinese; do not add an independent UI layer.
- Every task below is a **step within this one PR**, not a separate ticket/branch/PR.

## Step 1 — Lock behavior with pure projector tests

**Create:** `src/lib/game/mapActivityFeedback.ts`, `src/lib/game/mapActivityFeedback.spec.ts`.

### Contract

Implement a minimal closed union of retail open/upgrade and industry production targets. Function:

~~~ts
selectMapActivity(previous: GameState | null, next: GameState): MapActivity[];
~~~

Return no event on a null-to-null or non-evidence change; sort by stable view/city/entity keys and cap output to eight events per view per commit. Compare store IDs and previous/next `level`. If founding creates one store, it is an opening; do not infer opening from changing `tileId` or selection.

For production, only consider the just-completed day when next has one freshly appended `DailyReport` (confirm `report.day` advanced relative to previous latest report). Require a positive movement in `next.reports.at(-1)!.productionReport.produced` for the same city and material as a positive movement in that building's `lastProduction`. Use the lowest material ID among eligible positive movements to label **one pulse per producer**, not a separate pulse for each output. Current `PRODUCTION_RECIPES` have one output each; use a synthetic multi-output production/report fixture to pin the tie-break without adding game content. Do **not** add building identifiers to `DailyProductionReport`.

### Tests

1. New store -> `store-opened`; successful existing level increment -> `store-upgraded`.
2. No-op, failed-equivalent identical state, unchanged store/level, selecting an older upgraded store, and report-only data unrelated to current entity -> no retail pulse.
3. Newly completed positive output + building-local positive movement -> exactly one industry pulse, for `produced`, `stalled` (partial output) and `imported-inputs`.
4. `status: 'produced'` with zero or absent actual movements -> none; imports, rail transfers or stock differences without positive production -> none.
5. Historical report present with no new report, report day replay, wrong city/material, and positive aggregate report for another producer -> none.
6. Input states unchanged; stable sorting, max-eight cap, one per entity.
7. Synthetic producer with two positive output materials (both present in the new day's aggregate report) -> exactly one pulse, labeled with the lexicographically lowest eligible material ID, regardless of movement array order; adding a second output must not create a second pulse.

## Step 2 — Hook the true controller publish path, not snapshot observation

**Edit:** `src/routes/gameRouteController.ts`; **extend:** `src/routes/gameRouteController.spec.ts`.

Add the optional callback `onAcceptedGameChange(previous,next)` to controller options.

- **Sandbox:** invoke from the changed publish/success portion of `runImmediateSandboxOperation`, with exact previous/next references; do not invoke if `result.changed` is false. Avoid treating the existing `onStateChange` as event evidence. If necessary capture `previous` before the sandbox operation; ensure the callback only runs if the transition was accepted and published.
- **Scenario:** invoke after successful persistence and `publishScenarioOutcome`, using `attemptedRun?.game` and `preparedRun?.game`. Skip synthetic CAS conflicts and terminal/no-op rejected paths. Do not fire from `adoptExternalScenarioRun`, retry failures or lifecycle resume.
- Preserve current SFX call order and return statuses; feedback must not alter atomic save/commit semantics. The optional observer is synchronous/non-throwing from route use (do not call game transitions in it).

Tests pin exact once-per-success across both modes; rejected command, unchanged sandbox operation, scenario persistence failure/CAS conflict, resume/import/load and read-only selection have no callback. Existing controller tests for concurrent scenario writes stay green.

## Step 3 — Route-local visible event handoff

**Edit:** `src/routes/+page.svelte`, `src/routes/MapSurfaceHost.svelte`.

In page route:
- Register the controller accepted-state callback to call the pure projector.
- Check `activeMapView` and current active city **at callback time**. Keep only matching visible retail or industry pulses, and drop other views and arrivals (dated arrival read model is separately queryable).
- Keep one latest volatile batch with a simple incrementing sequence. A new batch replaces the old, not appends to a queue.
- Drop immediately for `isMapPaused`, active placement/overlay that prevents scene feedback, or a view not currently active. Do not delay the simulation to render a pulse.
- Reset on `setActiveMapView`, `selectWorldCityNode` city switch, `resetTransientViewState`, successful `resumeAutoSave` / `loadManualSlot`, founding/new-game lifecycle and external scenario state adoption. Take care that the controller can publish before the Svelte route receives the new derived map snapshot; the scene should resolve targets by ID from the next snapshot rather than inventing coordinates from the prior one. A missing target is dropped rather than retried.
- Do not reset on every `game` reference update: ordinary commits publish new objects by design.
- Keep one batch per active map, and pass it through `MapSurfaceHost` to exactly one relevant map component.

Prove view/city filtering, sequence increments and resets in a small pure helper only if route-level tests become unwieldy; otherwise avoid introducing a second global state module.

## Step 4 — Scene lifecycle and lightweight feedback

**Edit:** `src/lib/components/game/CityMap.svelte`, `IndustryMap.svelte`; `src/lib/phaser/cityMapScene.ts`, `industryMapScene.ts`; their existing co-located specs.

- Each map wrapper accepts an optional batch and forwards it to its **ready** scene once per sequence. The sequence visible on initial mount or while scene bootstraps is consumed/discarded, not replayed. An inactive/paused component consumes and drops too. Pass a reduced-motion boolean via `matchMedia` in component when supported; handle absent matchMedia cleanly in test/mocks. Reset handlers on component destruction.
- Each scene uses a dedicated small, non-interactive graphics overlay (or existing graphics if layering is safe), with per-entity map keyed by target identity and wall-clock received time. Keep duration roughly 600 ms and at most eight active targets. Redraw using the existing `update` tick, fade ring/outline at actual store/building footprint. Do **not** tween `storeSprites` (they are recreated on every retail snapshot), add input zones, change map bounds, or modify camera.
- Handle city change, scene shutdown/destroy and unmounted map by dropping all pulses; repeated `updateSnapshot` draws current state but never restarts a pulse.
- For industrial production, leverage `getIndustryMaterialArt` / `INDUSTRY_MATERIAL_ART` if an already loaded texture is available; otherwise use the same neutral ring. New material assets are **not** created. Optionally preload existing registered material sprites if cheap; no asset registry modification is needed for existing art.
- Under reduced motion, show the static outline for the same short lifetime with no oscillation or movement. Never block clicks or keyboard controls; preserve selection and placement depth.

Add canvas attributes like `data-map-activity-kind` and `data-map-activity-count` or `data-map-activity-sequence` *only for deterministic tests*, following current data-attribute conventions. Clear them on lifecycle/reset. Do not build a test-only event API.

Scene test cases: pulse once when scene ready, no duplicate on snapshot refresh, target disappears or city changes, hidden/paused drop, recreation drop, cap/coalesce, 1×/2×/5× safety (presentation durations, no tick scheduling), reduced motion static, click/drag/zoom/placement unaffected. Feed the synthetic two-output production event from Step 1 and assert exactly one scene pulse/target and its deterministic representative material ID; do not invent a multi-output recipe or render a per-material pulse queue.

## Step 5 — Dated real arrivals in receiving-city inspector

**Edit:** `src/lib/game/logisticsReadModels.ts`, its spec, `src/lib/components/game/WorldMap.svelte` (and `MapSurfaceHost.svelte`, route binding), corresponding component spec.

Create a read-only `selectRecentArrivalConfirmations(game,limit)` returning explicit `report.day` plus the existing arrival entry and optional recurring-route ID from `transferOrders`. Scan only actual `report.logistics.arrivals`, not `arrivalOnDay` or bare delivered status. Keep newest-first deterministic order with a stable order-ID tie break, and a reasonable limit. Joins never mutate records.

Filter records by `destinationCityId` for `WorldMap`'s selected industry city inspector. Present most recent actual arrival, including **Day N, material, quantity and origin -> receiving city**. This is static historical detail, even when report is loaded later. Use existing `i18n.labels.material`, `i18n.labels.worldCity`, and number format helpers. No “delivered to store shelf” message. No separate world-marker animation is required (auto time progression is paused in world view).

Tests include manual and recurring deliveries, two receiving cities, same-day tie, positive quantity, report day versus scheduled day mismatch, and missing/late/in-transit arrivals. Add a targeted WorldMap component test asserting aria/text, empty state, correct destination, and that viewing historical evidence does **not** add a pulse.

## Step 6 — Reuse existing blocked indicators and inspector reasons

**Edit:** `src/lib/phaser/industryMapScene.ts` and `IndustryTileInspector.svelte` only where the baseline lacks readability; relevant specs.

Keep `drawBuildingStatusDot` as the only per-building status marker. Render a compact contrasting static glyph/outline for `blocked` and `stalled` within the existing dot. Do not animate blocked state; do not add a second positional badge or a renderer-owned cause taxonomy. This task intentionally does **not** add different shapes for `idle`, `produced` and `imported-inputs`; their existing status labels remain available through the inspector, and full all-status glyph differentiation is out of scope.

Confirm that `IndustryTileInspector` always exposes existing localized `building.status` and, when grounded, the actionable `getIndustrialLinkIssues` reason already supplied by HPA-284/#63. For cases without a known cause, use generic translated text rather than a fabricated “missing rails/inputs” detail. Make sure screen reader/status text and marker state derive from the same snapshot/building status, and the marker sits outside the tile click footprint.

Tests for status-marker count and shape, inspector fallback, link issue reuse, building selection under marker, placement and camera behavior.

## Step 7 — Localization and end-to-end proof

**Edit:** existing EN/JA/zh-Hant catalogs and localized text tests; affected `src/routes/retail-sim.e2e.ts` / `time-flow.e2e.ts` tests, or one focused existing-route E2E file.

- Label accepted opening/upgrading, productive output, historical delivery day and generic blocked reason accurately. Use existing copy for existing statuses and no newly fabricated cause.
- Keep existing whole-catalog locale-key parity coverage intact.
- Browser: create/open a store or complete upgrade and assert one-shot visible effect; repeated frame/snapshot does not re-arm. Place a producer that outputs in a completed daily report; verify positive-output pulse only. Switch views/cities; reload from autosave; verify no old pulse.
- Browser: open a receiving industry's city inspector and see real dated delivery detail without a retail label; verify pending transfer not presented as arrived. Check blocked marker remains selectable.
- Browser: test `prefers-reduced-motion`, narrow layout, and canvas/data attribute readiness. Check normal scene clicks, camera pan/zoom and placement anchors still work.

**Commands:**

~~~sh
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e -- src/routes/retail-sim.e2e.ts
bun run test:e2e -- src/routes/time-flow.e2e.ts
~~~

Run any new focused E2E/spec files and the affected scenario tests. Manually inspect the industry status shapes and event pulse behavior at paused, 1×, 2× and 5× speed, mobile/narrow and reduced-motion conditions. Any existing flaky/unrelated test should be called out, never silently reported green.

## Review checklist / done means

- [ ] Review the pure projection for false successes and building-report attribution.
- [ ] Verify callback is behind both successful publish paths and never a load/CAS conflict.
- [ ] No scene/component pulse replay on rerender, late mount, map switch, city switch or load.
- [ ] Stable test-visible bounded graphics; no player input interception.
- [ ] Actual receiving-city/day evidence, not planned arrival or retail replenishment.
- [ ] Existing industrial marker reused, non-color-only, inspector cause grounded.
- [ ] EN/JA/zh-Hant, focused specs and browser tests, check/lint/full unit suite green.
- [ ] No economy, schema, scoring, time, save or SFX changes; no new art.
- [ ] Keep this PR draft until implementation and verification are complete; then mark ready for review. No second PR for implementation.
