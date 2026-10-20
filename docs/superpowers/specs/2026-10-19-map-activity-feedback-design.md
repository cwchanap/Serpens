# HPA-295 — Map Activity Feedback: Design

**Status:** Planning checkpoint — implementation and verification belong in this same delivery PR.
**Ticket:** https://linear.app/cwchanap/issue/HPA-295/gameplay-polish-make-maps-respond-to-real-openings-upgrades-production
**Baseline:** `main` at `200bc7bc479b0459c3827a8c47128cbad1918364` (October 19, 2026).
**Implementation plan:** `docs/superpowers/plans/2026-10-19-map-activity-feedback.md`.

## Goal

Make actual store openings/upgrades and industrial production perceptible on a map, and make genuinely delivered inter-city materials inspectable at their receiving city. Preserve deterministic game transitions, accessibility, fast time progression, and existing map interactions.

The feature is entirely presentation/read-model work: no economy rules, new assets, sound, persistence schema, generic events infrastructure, or simulation scheduling.

## Ground truth on current main

- `src/lib/game/mapRender.ts` builds retail snapshots with store identity and footprint. `src/lib/game/industryMapRender.ts` builds industry snapshots with building identity, footprint, and authoritative status. Neither renderer reads `GameState`.
- `src/lib/phaser/cityMapScene.ts` destroys/recreates storefront sprites on a snapshot refresh; therefore a tween attached to a store sprite is fragile. Both scenes have draw/update paths and non-interactive graphics layers.
- `src/lib/phaser/industryMapScene.ts` already draws a status dot for idle/produced/imported-inputs/stalled/blocked. The marker currently distinguishes states primarily by color.
- `src/lib/components/game/CityMap.svelte` and `IndustryMap.svelte` own lazy Phaser scene startup. `src/routes/MapSurfaceHost.svelte` keeps visited views mounted but inactive views are hidden and their game loops paused.
- `src/routes/gameRouteController.ts` owns accepted sandbox mutations and scenario persistence/CAS. The existing `onStateChange` fires for both mutations and externally adopted/loaded states and cannot by itself prove an event occurred.
- A completed `DailyReport` has `productionReport.produced`, while each `IndustrialBuilding.lastProduction` contains its own actual material movements. The aggregate production report does *not* carry building IDs. A positive output may have status `stalled` (partial throughput) or `imported-inputs`, not only `produced`.
- `DailyReport.logistics.arrivals` stores actual arrival entries; each entry identifies the transfer order, sending city, receiving city, material and quantity. Its enclosing `report.day` supplies the actual day. A transfer order's `arrivalOnDay` is scheduled timing, not sufficient proof of delivery.
- Existing world-map city and route inspectors show operational data, but not a dated per-arrival confirmation. Existing industry inspectors show localized status and link issues such as missing warehouse or disconnected rail.

## Decisions

### 1. Derive effects only at the accepted commit boundary

Add one optional presentation callback to `GameRouteControllerOptions`:

~~~ts
onAcceptedGameChange?(previous: GameState | null, next: GameState): void;
~~~

Call it only when a **changed sandbox operation has actually published** or a **changed scenario operation has successfully persisted and published**. Do not call it for read-only selection, unchanged commands, rejected operations, failed/competing CAS, externally adopted scenario snapshots, save loads, scenario lifecycle resets or no-op resume. The callback receives states, not a controller-specific event bus or domain mutation type. Invoke it in the same successful publish path as the current success cue; do not create an asynchronous handler or let it affect persistence.

Use a small pure projector at `src/lib/game/mapActivityFeedback.ts` to compare accepted before/after states:

~~~ts
type MapActivity =
  | { kind: 'store-opened' | 'store-upgraded'; view: 'retail'; cityId: string; entityId: string }
  | { kind: 'production'; view: 'industry'; cityId: string; entityId: string; materialId: MaterialId };

selectMapActivity(previous: GameState | null, next: GameState): MapActivity[];
~~~

Opening = newly added store ID; upgrade = existing store whose `level` increased. Do not use changed appearance, selected tile, or any transition that merely inspects a store. A founding store is a legitimate opening only after the founding operation commits.

For production, require the just-accepted game to have a **new completed report day** and that report to record positive produced material in the same city. Then match the after-state building's positive `lastProduction` with the report by city/material. This pairing is needed because the daily aggregate report has no building ID. Do not infer production from `status`, input imports, production totals alone, or city inventory deltas. A building with positive output and a partial/`imported-inputs` status still qualifies; a building with no output does not. If a producer has multiple positive output materials, select the lowest material ID as its single representative pulse: the pulse acknowledges the building's production, not every individual material. Current recipes each have one output, so pin this forward-looking behavior with a synthetic two-output fixture, without changing production content.

Return deterministic, bounded events (stable entity ID ordering, one pulse per entity per accepted commit, maximum eight visual targets per view). The route assigns a local, monotonically increasing delivery sequence to the single latest batch. No persistent IDs or generic domain event interface are introduced.

### 2. Presentation delivery is one-shot, visible-only and non-blocking

Keep the latest one-shot batch in `src/routes/+page.svelte` as route-local volatile data. When the controller invokes the callback, filter immediately by the **currently visible** map view and active city, and drop any off-screen candidates. A change received during an overlay that pauses the map should not be queued for later. Pass the current batch via `MapSurfaceHost` and the matching `CityMap` / `IndustryMap` component to its scene, alongside the usual immutable snapshot.

A component must consume each sequence **at most once**, and only when the Phaser scene is ready, active and not paused. If the event arrives before scene creation or while paused/inactive, discard it rather than replay on mount or resume. Initialize a recreated component/scene against the current sequence, not as a fresh event. The scene clears visual state on city changes and shutdown; the route clears it on view/city switches, sandbox loads, scenario resets/resume/import, new games and externally adopted scenario states. Ordinary subsequent snapshots do not replay the batch.

Use only lightweight, non-interactive graphics (a restrained outline/ring at a footprint) updated with the already existing scene frame loop; avoid tweens on storefront sprites because they are rebuilt on snapshots. Duration should be short (around 550–700 ms, independent of in-game days). Replace/coalesce an entity's active pulse when a newer accepted event arrives and expire/drop pulses rather than backing up ticks. Do not touch hit areas, placement highlighting, selection geometry, camera pan/zoom, save/RNG, or speed settings.

The industry production pulse may show the existing material sprite when the texture is available via `INDUSTRY_MATERIAL_ART`, otherwise show the same restrained neutral halo; do not generate new artwork or block on texture loading. Use Phaser's existing graphics/material registration patterns. Suppress animation under `prefers-reduced-motion: reduce`, leaving a brief static highlight and existing accessible detail/status text rather than an animated flash. A simple boolean passed into the scene is enough; no motion manager.

**Arrival animation decision:** The receiving city's **world-map presentation** and simulation tick do not normally coexist, because world view blocks auto-ticking. Do not add a fake truck, route travel animation, pulse on reopening the city, or a time-control exception. Dated inspection is the required delivery affordance. A one-shot receiving-city pulse can be added only if an existing, truly visible, same-transition presentation supports it without a second pipeline; omit it for this baseline.

### 3. Dated arrivals are a read model, not live animations

Add a pure selector to `src/lib/game/logisticsReadModels.ts` (or alongside its current selectors):

~~~ts
selectRecentArrivalConfirmations(game: GameState, limit?: number): ArrivalConfirmation[];
~~~

Each confirmation includes `day`, `transferOrderId`, `originCityId`, `destinationCityId`, `materialId`, positive `quantity`, and optional `routeId` if the matched order's source is a recurring route. Read only `game.reports[].logistics.arrivals` (newest report first), join by order ID when necessary, and sort deterministically. Do not treat an in-transit order or a scheduled date as delivered. Avoid a parallel persisted delivery ledger.

Surface the receiving city's most recent **dated** confirmation in the existing `WorldMap.svelte` city inspector, with localized city/material/quantity/day and an explicit “received by industry city” description. Manual and recurring-route transfers use the same record; a route-specific latest arrival can reuse this selector if the route inspector benefits, but do not duplicate a logistics details UI. Off-screen arrivals remain inspectable when the user later visits their receiving city's inspector. Do not claim delivery to a retail shelf or named warehouse.

### 4. Blocked status: enhance what already exists

Retain the authoritative `IndustryMapBuildingRender.status` and the current status dots. For `blocked` and `stalled`, add a tiny non-animated contrasting glyph/outline **inside the existing marker**, not another badge on top of selection/placement targets. Differentiate these two actionable states by shape as well as color; position the marker outside the building footprint where it already resides. **Intentional scope boundary:** `idle`, `produced` and `imported-inputs` retain their existing color-based markers in this slice, with localized status text available in the inspector. Full shape differentiation across all industrial statuses is optional future accessibility polish, not a requirement to extend this ticket.

Reuse the industry inspector's localized status and current `getIndustrialLinkIssues` text/action where a known link issue exists. If no grounded specific cause is available, show a localized generic “Production blocked/stalled” explanation (not a fabricated missing-input or warehouse diagnosis). Do not reclassify block reasons in Phaser. Status labels, text and marker must stay consistent.

## Integration boundaries and exclusions

Affected modules: `mapActivityFeedback.ts` (new, pure), controller accepted-publish callback, `+page.svelte` volatile delivery/reset, `MapSurfaceHost.svelte`, map wrappers, two Phaser scenes, `logisticsReadModels.ts`, `WorldMap.svelte`, existing `IndustryTileInspector.svelte` and localized catalogs.

No `GameState`/`DailyReport` changes, no codec/migration, new timer, event bus, background queue, SFX, art work, transport fleet, pedestrians, location-based production ledger, or simulation rebalance. No changes to original placement or tile-selection command ownership.

## Tests and acceptance

- True successful opening and level increase pulse once. No rejected, unchanged, snapshot-only or load-induced pulse.
- A producer with positive material output pulses when the *new report* proves production, including partial/stalled/imported-inputs outcomes; zero-output/status-only/input-only/transfer-only does not. A synthetic two-output producer yields one pulse with the lowest eligible material ID, not duplicate pulses.
- Receiving-city inspector shows actual material, quantity, destination and **recorded report day** for manual/route deliveries. Pending/late orders without report arrival are never “delivered”; no retail claim.
- Hidden/inactive scene, late lazy mount, repeated snapshot, save load, mode/map/city change, external scenario adoption and Phaser recreation never replay old effects.
- Existing blocked status glyph is legible, non-animated, aligned with inspector text and does not steal pointer/keyboard interactions.
- Static reduced-motion feedback, normal map selection, placement, camera controls and current time behavior stay intact at 1×/2×/5×.
- Automated pure selector/controller/scene/component tests and affected Playwright flows; manual visual review for motion and mobile/canvas readability.

## Risks and mitigations

1. **False success from report aggregation:** pair positive per-building `lastProduction` with the newly appended same-city/material daily report; do not assign arbitrary aggregate production to a building.
2. **Replay from snapshot reads:** distinguish accepted publish callback from broad `onStateChange`; consume sequences only once, drop on inactive/late scene and lifecycle changes.
3. **Phaser sprite churn:** draw temporary footprint graphics, not effects tied to rebuilt retail images.
4. **Wrong delivery scope:** display only report-backed industry-city arrivals; planned arrival dates are not confirmation.
5. **Visual/click interference:** use noninteractive graphics and existing status marker positions; retain accessible inspector text.

**Delivery rule:** This planning checkpoint and full runtime implementation/tests share one HPA-295 PR. The documents alone do not mean the ticket is complete.
