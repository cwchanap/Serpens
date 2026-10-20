# HPA-295 — Map Activity Feedback: Design

**Status:** Planning checkpoint — runtime implementation and verification remain in this same delivery PR.
**Ticket:** https://linear.app/cwchanap/issue/HPA-295/gameplay-polish-make-maps-respond-to-real-openings-upgrades-production
**Baseline:** `main` at `200bc7bc479b0459c3827a8c47128cbad1918364` (October 19, 2026).
**Implementation plan:** `docs/superpowers/plans/2026-10-19-map-activity-feedback.md`.

## Goal

Make accepted store openings/upgrades and actual industrial production visible on the active map, make completed industry-to-industry transfers inspectable with their arrival day, and improve blocked/stalled readability. Preserve deterministic simulation, reduced motion, and existing controls.

This is presentation/read-model work only: no save-schema, simulation, economy, new assets/SFX, event bus, queue, or separate implementation PR.

## Verified baseline

- `gameRouteController.ts` funnels game mutations through `commitMutation`; sandbox `runImmediateSandboxOperation` calls `afterPublish` only for a changed state, while scenario `runPersistenceGatedOperation` calls it only after changed preparation, persistence and publication. Scenario CAS conflicts are converted to synthetic committed outcomes, so `afterPublish` must still check `conflictOutcome`. Both callbacks are currently conditional on `request.cueId`; some successful commands have no cue.
- Scenario terminal commits can clear `activeScenarioRun`; `controller.game` may then be null despite a successful committed game transition. `attemptedRun.game` and `preparedRun.game` are the reliable before/after pair. Broad `onStateChange` also fires on loads/adoptions, so it is not an accepted-commit signal.
- `simulateDay` appends a daily report and advances `game.day`. `simulateIndustryProduction` replaces every building's `lastProduction` on each tick, including resetting idle/stalled/blocked buildings to empty. Positive entries are the actual movements also placed into the aggregate report. Existing production recipes have a single output each.
- `processTransferArrivals` moves due orders to `status: 'delivered'`. The save codec requires a delivered order's `arrivalOnDay` to precede the current day and an in-transit order not to be overdue. With the present day-by-day simulation, a *delivered* order's `arrivalOnDay` is its recorded delivery day; an in-transit order's date is only a schedule. Orders already carry both city IDs, material, quantity and recurring-route source.
- `MapSurfaceHost` passes `active`/`paused` into kept-alive map wrappers. Both Phaser scenes have an existing per-frame `markerGraphics` layer and footprint drawing helper; retail snapshots recreate store sprites, so do not tween sprite instances. Both scenes already bob buildings; industry's status dots currently inherit the bob. Industry material art exists but is not preloaded by `IndustryMapScene`.
- `IndustryTileInspector` already provides localized building status, link issues/actions where grounded, and blocked-day counts. `stalled` already has the specific “Stalled (buffer full)” label. `ReportsPanel` has existing arrival copy.

## Decisions

### 1. Successful publishes produce a pure, lightweight map diff

Extend `GameRouteControllerOptions` with:

~~~ts
onAcceptedGameChange?(previous: GameState | null, next: GameState): void;
~~~

Wire it to the **two existing `commitMutation` `afterPublish` closures**, unconditionally (not conditioned on SFX cue presence). A cue, when present, still plays as before. In sandbox, use the pre-mutation game and newly published sandbox game; no callback for an unchanged state. In scenario, use `attemptedRun?.game` and `preparedRun?.game` after successful publication, including terminal changes even if `controller.game` is now null; explicitly suppress synthetic CAS conflicts. The callback is synchronous and must not throw or change game state. Do not attach it to `onStateChange`, load/resume, externally adopted state or lifecycle transitions.

Add `src/lib/game/mapActivityFeedback.ts` with a single closed union and projector:

~~~ts
type MapActivity =
  | { kind: 'store-opened' | 'store-upgraded'; cityId: string; entityId: string }
  | { kind: 'production'; cityId: string; entityId: string; materialId: MaterialId };

selectMapActivity(previous: GameState | null, next: GameState): MapActivity[];
~~~

The `kind` determines retail versus industry without an extra `view` tag. `cityId` remains a small safeguard against wrong-city delivery while a newly opened store is not yet present in the scene's old snapshot. Entity IDs alone cannot solve the publish-before-snapshot versus city-switch ordering race.

A new store ID signals opening; an existing store with a higher level signals upgrading. Positive industrial production requires an **existing previous state**, a newly appended `DailyReport` (report array grows; new report day advances) and a positive `lastProduction` movement on that building in the after-state. Pick the first positive movement in its stored recipe-output order as a representative material, not a per-material pulse. The production code writes `lastProduction` and the aggregate report from the same movement, so a second city/material report cross-match would be redundant. A status, inventory increase, transport arrival, old report, or old production value alone is never sufficient.

Sort deterministically and generate **one pulse per changed entity**, without the eight-item cap: repeatedly selecting the same eight low-ID producers would permanently starve higher-ID producers. Only the actual active city's entities are rendered; drawing a cheap ring per producer in the already-redrawn marker pass needs no arbitrary selection policy.

### 2. One-shot delivery through existing visibility and scene boundaries

The route holds one volatile `{ seq, activities }` batch, replaced synchronously in the accepted-change callback. Pass matching `kind` activities to retail/industry wrappers through `MapSurfaceHost`; the route does not maintain a second visibility filter or a list of manual resets.

Each wrapper initializes `lastSeq` to the sequence on mount (including late lazy mounts), and on a **new** sequence advances `lastSeq` whether it forwards or drops it. Forward only if `active && !paused` and the Phaser scene is ready. Also discard entries whose `cityId` differs from that wrapper's current snapshot city: otherwise an off-screen event could appear if the city is selected during the 600 ms effect. Do not require a new store/building ID to exist in the *old* snapshot before forwarding — snapshot publication can follow the callback. The scene resolves eligible IDs against its current snapshot at draw time and clears in-flight pulses when the snapshot switches city/terrain identity or the scene shuts down.

`Map<entityId, startTime>` per scene gives coalescing automatically. Draw a subtle footprint outline/ring using the **existing `markerGraphics` pass** for ~600 ms of wall time, dropping on expiry. Never create sprite tweens, input zones, new graphics systems, another timer, or a backlog. A newly created/loaded component initializes as having consumed the current sequence; loads and external adoptions do not produce new sequences. A load need not explicitly reset the route batch or fabricate an accepted change; an already-running ring is not restarted.

Reduced motion applies to **existing** perpetual store/building bobbing as well as new pulses: pass a `prefers-reduced-motion` boolean to each scene, set bob amplitude to zero, and use a brief static (unfaded/unchanging) outline rather than a moving/flashing one. All industrial status dots use a fixed un-bobbed center irrespective of the motion preference, so the blocked/stalled glyphs are genuinely static.

For the production effect, preload existing `INDUSTRY_MATERIAL_ART_LIST` alongside the industry scene's existing art and draw the selected material image beside/within the footprint ring. No new art assets; the representation is consistently available from the scene's normal preload.

For deterministic tests, put the **last consumed** sequence and target IDs in existing canvas `data-*` attributes. They persist after the ~600 ms effect expires, and clear with scene destruction, so Playwright does not race a live pulse. An attribute reports consumption, not whether an effect is currently on-screen.

**Arrival animation:** World view blocks automatic time progression, so do not replay an arrival pulse, spawn a truck, or make time controls behave differently. Delivery is a dated inspector detail.

### 3. Actual arrival evidence without another record type

Add a small read-only selector beside `selectRecentTransfers` in `src/lib/game/logisticsReadModels.ts`:

~~~ts
selectRecentDeliveredTransfers(game: GameState, destinationCityId: WorldCityId, limit = 1): TransferOrder[];
~~~

Filter only `status === 'delivered'`, with the matching **industry receiving city**, sorted by `arrivalOnDay` descending and stable ID tie break. This status is required: a scheduled in-transit order does *not* count as delivered. Under the existing invariant, the delivered order's `arrivalOnDay` is the day its arrival was processed. Reuse the order's existing material, quantity, source and city fields; do not scan reports, join by ID, invent `ArrivalConfirmation`, or persist another arrival ledger.

Present the latest order in the existing `WorldMap.svelte` receiving-industry-city inspector via `MapSurfaceHost`, localized in EN/JA/zh-Hant with origin, destination, material, quantity, **arrival day**, and explicit industry-to-industry language. Reuse existing logistics arrival copy where it fits; do not claim any retail shelf was supplied.

### 4. Enhance existing blocked/stalled markers, not inspector taxonomy

Extend only `industryMapScene.ts`'s current `drawBuildingStatusDot` with distinct, contrasting, non-animated inside-dot glyphs/shape for `blocked` and `stalled`; keep the marker at an un-bobbed center outside the footprint. `idle`, `produced` and `imported-inputs` remain color-coded in this slice, with status text in the inspector; full all-status shape treatment is future accessibility work.

Reuse `IndustryTileInspector.svelte`'s status and link-issue/actions, including existing stalled-buffer explanation. Do not add generic duplicated status copy or claim a specific block cause the simulation has not proved. At most add a brief localized blocked explanation if the current UI proves insufficient; no new cause taxonomy.

## Tests and acceptance

- Accepted new store and higher level each produce one event; unchanged/rejected/failed-save/CAS-conflict/load/adoption/selection do not. No-cue and terminal scenario commits are covered.
- A newly appended report plus actual positive `lastProduction` yields one pulse per producer, including positive-output `stalled` and `imported-inputs`; old report, zero output, imports-only and inventory-only do not. No same-eight starvation with more than eight producers.
- Wrappers consume a sequence once; inactive, paused, unready and wrong-city batches drop, late mounts and city switches never replay. Snapshot publication after callback still shows a newly opened store once. Scene ring expiration is wall-time only, not dependent on game speed.
- Existing sprite bobbing is disabled under reduced motion in both scenes; blocked/stalled dot itself never bobs, with or without reduced motion. Rings, material art, hit tests, camera and controls remain intact.
- A delivered order is shown with its recorded day and receiving industry city; an in-transit or merely scheduled order is not. No retail-delivery claim or arrival animation.
- Stable **consumed** canvas sequence/IDs enable browser assertions after pulse expiry. EN/JA/zh-Hant parity and targeted unit/component/browser tests cover the feature.

**Delivery rule:** This document and all implementation/tests remain on PR #64; this planning checkpoint does not complete HPA-295.
