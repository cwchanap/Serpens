# Industry Rail Transport System — Design

**Date:** 2026-07-13
**Status:** Approved design, pending implementation plan

## Summary

Add a rail transport system to the industry cities. Material flow between
industrial buildings becomes spatial: factories hold small local inventories,
and materials only move between buildings along player-built rail track with
per-cell daily capacity. The shared warehouse becomes a rail-connected storage
node. Buildings without rail connections keep working via the existing paid
import fallback, so rails save money rather than hard-blocking production.

## Decisions made during brainstorming

| Question | Decision |
| --- | --- |
| No rail connection for a needed input | Import fallback: factory still runs, missing inputs are bought as paid imports (current behavior becomes the penalty path) |
| Capacity model | Bottleneck: a route moves at most the weakest cell along it; per-cell capacity starts at 1/day and is upgradable to 5/day |
| Build UX | Endpoints + optional waypoints; auto-path threads the waypoints, previews cost before confirm |
| Inventories | Per-factory buffers (small, recipe materials only) + one shared warehouse pool (large, any material, rail-gated) |
| Retail handoff | Unchanged: stores pull from the warehouse pool only; finished-goods factories must rail-connect to a warehouse to supply retail |
| Upgrade granularity | Segment between junctions: upgrading targets (segment min + 1), raising only cells below that level — see Tuning knobs for the exact rule |
| Engine | Cell-budget greedy flow (Approach A): per-cell daily shipping budgets, deterministic BFS allocation; bottlenecks and trunk sharing emerge from budget exhaustion |
| Delivery latency | Same-day: goods arrive within the daily tick, capacity-limited; no multi-day travel bookkeeping |
| Full output buffer | Producer clips production to remaining space and shows a `stalled` status; no overflow fee at factories (overflow fees stay warehouse-only) |

## Data model (`src/lib/game/types.ts`)

```ts
interface RailCell {
	x: number;
	y: number;
	level: number; // capacity per day, 1–5
}

// IndustryCity gains:
//   rails: RailCell[]
// IndustrialBuilding gains:
//   inventory: Partial<Record<MaterialId, number>>
// IndustrialBuildingType gains:
//   bufferCapacity: number   // local buffer size, hand-tuned per type
// IndustrialBuildingStatus gains:
//   'stalled'
// DailyMaterialMovement['source'] gains:
//   'rail'
// DailyProductionReport gains:
//   railShipments: DailyMaterialMovement[]
```

- Rails are city-scoped (each `IndustryCity` has its own network), matching
  how tiles are scoped.
- Segments and junctions are **derived, never stored**. A junction is a rail
  cell with 3+ rail neighbors or a building attach cell; a segment is the
  maximal run of cells between junctions/endpoints. Deriving on demand keeps
  partial upgrades and new intersections free of stale-state bugs.

### Inventory semantics

- A factory buffer may only hold materials in its own recipe (inputs +
  outputs). Total buffer capacity is a **new `bufferCapacity` field** on
  `IndustrialBuildingType`, hand-tuned per type like every other knob in
  `INDUSTRIAL_BUILDING_TYPES`. (The existing `warehouseCapacity` field is
  NOT repurposed: today it is `0` for every factory and `200` for the
  warehouse, so reusing it would give factories zero-size buffers.) Initial
  values follow a sizing rule of thumb: roughly 5 days of the recipe's
  level-1 input + output volume; the implementation populates the table.
- The shared warehouse pool (`game.warehouse`) remains a single global
  inventory:
  - `getWarehouseCapacity` stays unchanged — it sums `warehouseCapacity`
    over all buildings, and since only warehouse-type buildings have a
    nonzero value, only they contribute in practice. Factory buffers live in
    the separate `bufferCapacity` field, so they cannot leak into pool
    capacity;
  - depositing into or drawing from the pool requires a rail path to a
    warehouse building in the same city;
  - the existing overflow-fee mechanic stays, warehouse-only.

## New modules (pure functions + colocated specs)

| Module | Responsibility |
| --- | --- |
| `src/lib/game/rail.ts` | Graph derivation from cells: adjacency, junctions, segments, building attach points, BFS pathfinding, per-cell daily budget accounting |
| `src/lib/game/railPlacement.ts` | Build/upgrade/demolish transitions and the waypointed path preview with cost (mirrors `placementPreview.ts` conventions) |
| `src/lib/game/railShipping.ts` | Daily shipping allocator called from `simulateIndustryProduction` |

## Placement rules

- Rails may be laid on tiles not covered by a building footprint, not
  `blocked` terrain, and not `locked` (`IndustryTile.locked`). Resource
  terrain (farmland/forest/water/deposit) outside footprints IS rail-legal —
  laying track there simply blocks a future building on that tile, like any
  rail. Rails may cross each other freely — intersections are the point.
- A rail on a tile blocks later building placement there; demolish the rail
  to reclaim the tile (50% refund of base cell cost).
- Endpoints attach at any cell orthogonally adjacent to a building footprint;
  a building can have any number of attachments.
- Demolishing a building leaves its rails as dangling but valid track.
- Minimum connection is 1 cell (adjacent buildings still need one cell of
  track between attach points).

## Tuning knobs (constants in one place)

| Knob | Initial value |
| --- | --- |
| Build cost | $40 per new cell (riding existing track is free) |
| Segment upgrade | Targets level (segment min + 1): only cells below that level are raised; cost $30 × raised-cell count × segment min. Blocked when the segment min is already 5. Mixed-level segments can exist (demolishing a junction can merge segments of different levels); this rule always lifts the bottleneck first |
| Max cell level | 5 |
| Demolish refund | 50% of base cell build cost — upgrade investment is deliberately sunk |
| Factory buffer capacity | `IndustrialBuildingType.bufferCapacity`, per-type table (flat; leveling interplay deferred — see Out of scope) |

## Daily-tick flow (`simulateIndustryProduction`)

Deterministic, no RNG consumption, one pass:

**Phase 0 — derive the network.** Build each city's rail graph and give every
rail cell a daily shipping budget equal to its level. Every unit moved
through a cell consumes 1 budget. This is the entire capacity mechanic:
bottlenecks and trunk contention emerge from budget exhaustion. **Budgets
are one shared pool for the whole tick**: Phase 1 input pulls and Phase 2
surplus pushes draw from the same budgets, and Phase 1 runs first by design —
feeding consumers takes priority over stocking the warehouse.

**Phase 1 — stage-ordered production loop** (existing raw → intermediate →
final order, ties by building id). For each building with a recipe:

1. **Acquire inputs**, in priority order:
   1. its own buffer;
   2. rail pull from the nearest connected source found by BFS — producer
      buffers holding the material, or the warehouse pool via any connected
      warehouse building — limited by remaining cell budgets along the path;
      nearest source first, ties by building id. Allocation repeats the
      search until the demand is met or no budget-positive path to any
      source remains, so one pull may split across sources and across
      parallel paths. Path selection is fully deterministic: BFS expands
      neighbors in a fixed order (north, east, south, west) and visits
      frontier cells in insertion order, so equal-length paths always
      resolve the same way (the implementation plan pins the exact
      iteration order);
   3. paid import for the remaining shortage (unchanged; the no-rail
      fallback).
2. **Produce** into its own buffer. If the buffer cannot fit the full
   output, produce only what fits and mark the building `stalled`.

**Status precedence** (a building can import and stall in the same tick;
today's status is binary, `imported-inputs` vs `produced`):
`blocked` > `stalled` > `imported-inputs` > `produced` > `idle`. `stalled`
outranks `imported-inputs` because a jammed output is the more actionable
signal (build or upgrade rail); import spend stays visible in the report and
inspector either way. `alerts.ts` keys off `blocked` only and is unaffected.

Because raw producers run before intermediates and finals, same-day
farm → mill → factory chains keep working — goods ride rails instead of
teleporting.

**Phase 2 — surplus push.** In the same deterministic order, every producer
pushes leftover output from its buffer to the warehouse pool if
rail-connected, limited by remaining budgets. This is how finished goods
become sellable and how surplus is stored across days. Overflow past pool
capacity is allowed with the existing per-unit fee.

**Connectivity corollary:** two buildings each connected to the same
warehouse are graph-connected to each other, so same-day transfers go direct
whenever a physical path exists; the warehouse's storage role is carrying
surplus across days (and feeding retail).

**Reporting — how rail movements map into existing buckets** (the
product-chain graph sums `importedInputs` and `warehousePulls` filtered by
source, so rail flows must not vanish from chain metrics):

- Draws from the **warehouse pool** (which now travel by rail) keep
  `source: 'warehouse'` and stay in `warehousePulls` — existing chain
  metrics and health logic keep working unchanged.
- Direct **producer-buffer → consumer** transfers get `source: 'rail'`,
  appear in `consumed`, and are additionally listed in the new
  `railShipments` ledger (as are warehouse pushes/pulls, for the segment
  inspector's utilization display).
- `productChainGraph.ts` / `productChainTree.ts` are updated to count
  `source: 'rail'` movements in their consumption/output actuals.

**Retail phase:** untouched. `stock.ts` keeps drawing finished goods from the
warehouse pool; stores fall back to shop-imports when the pool is dry.

## Build/upgrade UX

**Rail build mode** (industry map toolbar toggle):

1. Click a building → origin selected, attach cells highlight.
2. Optionally click waypoints — empty rail-legal tiles or existing rail
   cells (to force reuse of a trunk); each click extends the auto-path
   preview through it.
3. Click a destination building → path preview locks, showing
   `N new cells · $cost · capacity 1/day`. Pathing prefers riding existing
   track (free) before laying new cells, so shared trunks emerge naturally.
4. Confirm → cash deducted, cells added. Escape/right-click steps back one
   waypoint.

Insufficient cash and no-valid-path blockers use the `decisionContext.ts`
pattern and are localized via i18n.

**Segment inspector:** clicking a rail cell outside build mode selects its
derived segment and opens an inspector (sibling of `IndustryTileInspector`)
showing level, capacity/day, yesterday's utilization (from `railShipments`),
an upgrade button with cost, and a demolish button (50% refund). Upgrades
apply to the whole segment.

## Rendering

- `industryMapRender.ts` adds a `rails` layer to `IndustryMapSnapshot`: per
  cell — position, connection shape (straight/corner/tee/cross derived from
  neighbors), level, and a utilization tier so congested trunks can tint
  differently.
- `industryMapScene.ts` renders the layer snapshot-driven, as with all map
  features.
- Rail art (straight, corner, tee, cross variants sharing one palette) is
  produced with the image-generation workflow — never scripted pixels —
  registered in `gameArt.ts`, and covered by the `gameArt.spec.ts`
  completeness check.
- New canvas attributes `data-rail-cell-count` / `data-rail-sprite-count`
  for e2e, following the established pattern.
- `stalled` gets a `STATUS_COLORS` entry and i18n strings.

## Persistence

- `SAVE_SCHEMA_VERSION` bumps 9 → 10 with a `v9→v10` migration step in the
  existing chain (`MIGRATABLE_SCHEMA_VERSIONS` gains 9) that injects
  `rails: []` on each industry city and `inventory: {}` on each building.
  The codec validates strictly (`requireArray`/`requireRecord`), so
  "absent → default" is expressed as a migration, matching the repo's
  pattern, not as optional-field validation.
- The hardcoded validation arrays `INDUSTRIAL_BUILDING_STATUSES` and
  `MATERIAL_MOVEMENT_SOURCES` in `saveCodec.ts` gain `'stalled'` and
  `'rail'` respectively — without this, any save containing the new status
  or a rail movement fails `requireOneOf` on load.
- A decode-time guard clamps a building's inventory to its recipe materials
  and buffer capacity.
- `saveCodec.spec.ts` / `saveRepository.spec.ts` are updated together with
  the codec change (new fields, new enum members, v9→v10 migration).

## Edge cases

- Demolishing a mid-trunk segment splits the network; connectivity is
  re-derived next tick and downstream factories degrade to import fallback —
  never crash.
- Demolishing a building leaves dangling but valid, reusable track.
- Parallel rails between the same pair of buildings simply add
  budget-carrying paths; BFS handles them without special cases.
- Waypoints that make a path impossible surface the no-valid-path blocker at
  preview time, before any cash is spent.

## Testing

- `rail.spec.ts` — junction detection, segment splitting when a branch is
  added, attach points, budget accounting.
- `railPlacement.spec.ts` — path preview cost, waypoint threading, block
  reasons, upgrade/demolish transitions and refunds.
- `railShipping.spec.ts` — bottleneck limit (an 8-cell level-1 path moves
  1/day), trunk contention (two branches sharing a trunk cell compete for
  its budget), trunk upgrade relieving both branches, import fallback when
  disconnected, warehouse push/pull gating, determinism (same state → same
  result on repeated runs).
- `industryProduction.spec.ts` — buffer-based inputs, `stalled` status and
  precedence, phase ordering.
- `saveCodec.spec.ts` / `saveRepository.spec.ts` — v9→v10 migration, new
  fields, `stalled` + `rail` enum members, inventory clamp guard.
- `productChainGraph.spec.ts` / `productChainTree.spec.ts` — rail-sourced
  movements counted in chain actuals/health.
- `industryMapRender.spec.ts` — rails layer in the snapshot (shape/level/
  utilization derivation).
- `gameArt.spec.ts` — rail art registration (completeness check).
- E2e — build a rail between two buildings via clicks, assert
  `data-rail-cell-count`, advance a day, assert the consumer shows a
  rail-supplied status.

## Out of scope (deliberately)

- Per-warehouse-building inventories and multi-warehouse retail aggregation
  (Approach C) — the cell-budget engine supports adding this later.
- Multi-day travel time.
- Rails in retail cities.
- Buffer capacity scaling with building level. Known balance item: building
  throughput scales +20%/level (`leveling.ts`) while buffers stay flat, so
  high-level factories stall sooner and lean harder on rail throughput —
  revisit when tuning.
- Trains/vehicles as visible entities; rails are throughput, not agents.
