# HPA-295 — Map Activity Feedback: Implementation Plan

> **One ticket / one PR.** This spec, code, localization, tests and review fixes all belong in the existing HPA-295 draft PR. This is documentation-only planning, not an implementation or test-completion claim.

**Goal:** One-shot truthful map feedback for accepted store opens/upgrades and industry output, dated delivered transfers in the receiving-city inspector, and static accessible blocked/stalled markers.

**Design:** `docs/superpowers/specs/2026-10-19-map-activity-feedback-design.md`
**Baseline:** `main` / `200bc7bc479b0459c3827a8c47128cbad1918364` (October 19, 2026).
**Stack:** TypeScript, Svelte 5, Phaser 4, Vitest, Playwright, Bun.

## Constraints

- No game-rule/RNG/save-codec/persistence-schema edits; no event bus, queue, dedicated pulse renderer, separate scheduler, new art or SFX.
- The existing `afterPublish` hooks establish acceptance; loaded/adopted state must not trigger pulses.
- Use existing `markerGraphics`, `active`/`paused` props, material art and inspector copy.
- Drop nonvisible or late effects rather than replay; avoid an ever-growing route reset list.
- EN/JA/zh-Hant labels arrive in the **same step as their UI**; do not defer localization to the end.
- Scene durations depend on wall time, never on simulation speeds.

## Step 1 — Small pure accepted-state projector and specs

**Create:** `src/lib/game/mapActivityFeedback.ts`, `src/lib/game/mapActivityFeedback.spec.ts`.

Use a closed `MapActivity` union:

~~~ts
type MapActivity =
  | { kind: 'store-opened' | 'store-upgraded'; cityId: string; entityId: string }
  | { kind: 'production'; cityId: string; entityId: string; materialId: MaterialId };

selectMapActivity(previous: GameState | null, next: GameState): MapActivity[];
~~~

`kind` selects the map; `cityId` is the minimal wrong-city/lifecycle guard. Detect new store ID or increased existing store level. For industrial production require `previous !== null`, a newly appended day report (`next.reports.length > previous.reports.length`, and its `day` newer than the prior report), and positive entries in the building's `lastProduction`; choose its first positive entry in persisted recipe-output order. The producer's movements are already the aggregate report's movements; skip redundant city/material cross-matching. No synthetic two-output recipe/test, no material-ID tie-break, no arbitrary eight-target cap. Sort events consistently and emit at most one per entity per accepted change.

**Tests:** opening/upgrading/founding; no-op/read-only/unchanged state; positive `produced`, partial `stalled` and `imported-inputs` versus zero production; report not newly appended, stale `lastProduction`, imports/rail/inventory changes without a new report; stable event order and **more than eight** producers all represented; inputs not mutated.

## Step 2 — Extend controller's existing two success-publish closures

**Edit:** `src/routes/gameRouteController.ts` and co-located controller specs.

Add optional `onAcceptedGameChange(previous,next)` to `GameRouteControllerOptions`. Make both `commitMutation` `afterPublish` closures unconditional, **not** `request.cueId ? ... : undefined`. Play the existing success SFX only when `cueId` is present. Preserve its relative call order.

- Sandbox: capture the prior sandbox game before the transition, then call observer with the accepted prior/new sandbox state from `runImmediateSandboxOperation.afterPublish`, which runs only if changed. Cover a successful no-cue command.
- Scenario: capture `attemptedRun` and `preparedRun` in the current `prepare` logic; call observer only after persisted/published success and **if `!conflictOutcome`**. Pass `attemptedRun.game` and `preparedRun.game`, **not** `this.game!`: a terminal successful scenario publish can remove `activeScenarioRun` and make `this.game` null.
- Make the route-supplied observer nonthrowing and synchronous so animation bookkeeping cannot compromise persistence. Do not add guards for already excluded rejected/no-op/failed-persist paths; preserve existing CAS/lifecycle handling.

**Tests:** exactly one observer call after changed sandbox or persisted scenario operation with or without cue, correct before/after including terminal scenario, none on no-op/rejection/CAS conflict/persistence error/load/external adoption/resume. Existing SFX, concurrent-write and return-status specs remain unchanged.

## Step 3 — A single latest route batch and consume-once wrappers

**Edit:** `src/routes/+page.svelte`, `src/routes/MapSurfaceHost.svelte`, `CityMap.svelte`, `IndustryMap.svelte`.

- Route callback computes events and replaces `mapActivity = { seq: seq + 1, activities }`. Pass retail and industry subsets by `kind` through `MapSurfaceHost`. No page-level visibility filter, manual reset list, queued batches, or second transient selector.
- In each wrapper initialize `lastSeq` from the current prop on mount. For each new `seq`, **always** record it consumed, even when `!active`, `paused`, scene unready or snapshot city not matching the activity's `cityId`. Forward eligible same-city events only if active/unpaused/ready, once; never replay on `active` toggles or lazy scene startup.
- For a just-opened store, do not demand that its ID already occur in the wrapper's pre-publish snapshot. Match `cityId` at delivery, then resolve entity position from the scene's latest snapshot at draw time. If no target appears during the short lifetime, expire it naturally. Scene drops in-flight entries when snapshot city/terrain identity changes or it shuts down.
- Neither loading autosave nor adopting a persisted scenario fires the callback; a freshly mounted wrapper starts from current `seq`. No explicit page-wide reset sites. Record only consumed target IDs in debug attributes, not queued/unseen candidates.

**Tests:** hidden and paused views, wrong-city event then quick city switch, lazy mount before Phaser ready, snapshot published just after callback, same seq and rerender, scene destroy/recreation, save/load/adoption never creates or re-arms an old sequence. Use component tests rather than full browser flows for these edge cases.

## Step 4 — Draw feedback and stop existing motion when requested

**Edit:** `src/lib/phaser/cityMapScene.ts`, `industryMapScene.ts`, co-located scene specs, map wrappers.

- Use existing `markerGraphics`'s per-frame `drawStoreMarkers(time)` and `drawMarkerGraphics(time)` with existing `strokeFootprintRect`; do not create a second graphics layer or tween store sprites (they are rebuilt on snapshots).
- Hold `Map<entityId, startTime>` for retail and material-labeled industry pulses. Coalesce by entity and expire after ~600 ms wall time. Resolve IDs against the current snapshot at **draw** time, not necessarily the snapshot from the callback. Clear on scene shutdown or city/terrain switch. No eight-item cap or selection scheduler.
- Pass a `prefers-reduced-motion` flag from wrapper `matchMedia` (safe when absent). Under reduce, zero existing retail and industrial sprite bob amplitudes; render a static ring for its short lifetime rather than flashing/fading/expanding. Under normal motion existing sprite bobbing may continue.
- Industry: preload existing `...INDUSTRY_MATERIAL_ART_LIST` with the scene's other asset lists and render the event's material sprite using the standard texture-key pattern. No conditional preload-on-demand or neutral-only fallback for missing art, and no new assets.
- Keep map input zones, selection, placement, camera bounds and Phaser loop timing untouched. Expose `data-map-activity-sequence` and `data-map-activity-target-ids` following existing canvas convention, storing **last consumed** batch identifiers even after visible effects expire (clear when scene is destroyed). Do not use short-lived live-pulse counts as E2E success signals.

**Tests:** no sprite tween or input interception, once-per-entity/coalescing, >8 producers not starved, missed target can be resolved after next snapshot (or expires), expiry not rearmed by render, city switch/shutdown drop, preloaded material art, reduce-motion flag zeros **existing** bob in both scenes and shows static new ring. No standalone 1×/2×/5× scene-speed matrix because effect code has no game-day scheduling.

## Step 5 — Delivered transfers in the existing world inspector, with locale parity

**Edit:** `src/lib/game/logisticsReadModels.ts` and spec, `src/lib/components/game/WorldMap.svelte`, `src/routes/MapSurfaceHost.svelte` and route props, relevant component spec and EN/JA/zh-Hant message catalogs.

Create a small selector using existing `TransferOrder`, not `ArrivalConfirmation` or a report ledger:

~~~ts
selectRecentDeliveredTransfers(game: GameState, destinationCityId: WorldCityId, limit = 1): TransferOrder[];
~~~

Filter `status === 'delivered'` and matching industry-city destination, order by `arrivalOnDay` descending then stable ID. The simulation processes due arrivals on each day; with the save codec's delivered/in-transit invariants, **delivered** `arrivalOnDay` is actual recorded arrival day. An `in-transit` order (even when its scheduled day has arrived) is not evidence. Do not make a second report scan/order join.

Pass selected receiving-city arrivals from the route (or a small precomputed mapping) through `MapSurfaceHost` into the `WorldMap` inspector. Reuse existing logistics arrival phrasing plus **day**, quantity, material and named origin/destination, with explicit industry-to-industry scope. Add/verify locale keys in all three catalogs during this step; check parity and component spec immediately.

**Tests:** delivered vs pending, manual vs recurring source, multiple destinations, same-day ID tie, scheduled day of pending order not presented as actual, arrival day and rendering accurate, no retail claim or map arrival animation.

## Step 6 — Static blocked/stalled glyph in existing status dot

**Edit:** `src/lib/phaser/industryMapScene.ts` and specs; `IndustryTileInspector.svelte` only if a concrete missing blocked explanation is demonstrated.

Enhance `drawBuildingStatusDot` **in place** with distinct contrasting shapes for `blocked` and `stalled`; draw dot position from the fixed, **un-bobbed** building footprint center regardless of motion setting. Keep building-sprite bob separate (zero under reduced motion from Step 4). Do not add another badge or infer renderer-owned causes.

The existing inspector already exposes `stalled (buffer full)`, `blocked`, `blockedDays` and `getIndustrialLinkIssues` actions. Reuse it without a redundant generic status line or a new locale key unless a genuine missing detail is found. Keep `idle`/`produced`/`imported-inputs` markers unchanged in this scope.

**Tests:** stable dot center while sprite bobs, distinguishable blocked/stalled shapes, marker outside hit geometry and pointer/select/placement unaffected; existing inspector status and actionable link issue text remain correct.

## Step 7 — Focused browser proof and full verification

**Edit:** existing retail/browser flow specs and catalog parity tests only as needed. Locale changes must already have accompanied Step 5 (and Step 6 only if new copy was added).

Keep Playwright small to avoid unstable time-dependent browser tests:

1. Successfully open a store and assert the consumed sequence increments and includes **that store ID**; do not race ~600 ms live pulses.
2. Reload autosave and assert no **new** sequence or replay.
3. Click/select an industrial building with a blocked glyph: marker does not intercept map input.

Prove industry production, actual arrivals, >8 outputs, reduced motion, city/view switching, 1×/2×/5× noninterference, paused/lazy scenes and snapshot ordering in deterministic projector/controller/scene/component specs. Inspect normal/reduced-motion readability and mobile canvas manually without expanding E2E scope.

**Commands:**

~~~sh
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e -- src/routes/retail-sim.e2e.ts
~~~

Run additional focused component/scene tests and the relevant browser test file that contains the blocked marker check. Report any unrelated failures explicitly.

## Done means

- [x] New/levelled store and positive actual production have true accepted-publish provenance and one-shot drawing.
- [x] No eight-producer starvation; no per-scene queue or replay on pauses, remounts, city switch or loads.
- [x] No-cue and terminal scenario changes notify; CAS conflict/no-op/rejection/load do not.
- [x] Reduced motion disables **existing** bob and pulse animation; blocked/stalled dot is static and non-color-only.
- [x] Delivered industry transfers are displayed by destination, quantity, material and true day using the delivered order.
- [x] EN/JA/zh-Hant parity, specs, check/lint/unit and focused E2E pass.
- [x] No simulation/schema/new art/SFX/event framework changes; one PR only.

**Do not mark PR ready until implemented and verified.**
