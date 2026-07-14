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
| Upgrade granularity | Segment between junctions: upgrading raises every cell of one derived segment by one level |
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
  outputs). Total buffer capacity reuses the existing `warehouseCapacity`
  field on `IndustrialBuildingType`, repurposed from "contribution to the
  global pool" to "local buffer size".
- The shared warehouse pool (`game.warehouse`) remains a single global
  inventory, but:
  - its capacity now sums `warehouseCapacity` over **warehouse-type buildings
    only** (today every building contributes);
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

- Rails may be laid on tiles not covered by a building footprint and not
  `blocked` terrain. Rails may cross each other freely — intersections are
  the point.
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
| Segment upgrade level n→n+1 | $30 × segment cell count × n |
| Max cell level | 5 |
| Demolish refund | 50% of base cell build cost |
| Factory buffer capacity | `IndustrialBuildingType.warehouseCapacity` (flat; leveling interplay deferred) |

## Daily-tick flow (`simulateIndustryProduction`)

Deterministic, no RNG consumption, one pass:

**Phase 0 — derive the network.** Build each city's rail graph and give every
rail cell a daily shipping budget equal to its level. Every unit moved
through a cell consumes 1 budget. This is the entire capacity mechanic:
bottlenecks and trunk contention emerge from budget exhaustion.

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
      parallel paths;
   3. paid import for the remaining shortage (unchanged; the no-rail
      fallback).
2. **Produce** into its own buffer. If the buffer cannot fit the full
   output, produce only what fits and mark the building `stalled`.

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

**Reporting:** rail pulls and pushes are recorded as movements with
`source: 'rail'` and listed in `DailyProductionReport.railShipments` for the
reports UI and product-chain views.

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

- `saveCodec.ts` serializes `IndustryCity.rails` and
  `IndustrialBuilding.inventory`.
- Absent fields decode to an empty network and empty buffers (per the
  no-legacy-migration policy; in-dev autosaves start unconnected and play on
  via import fallback).
- A decode-time guard clamps a building's inventory to its recipe materials
  and buffer capacity.
- Repository specs are updated together with the codec change.

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
- `industryProduction.spec.ts` — buffer-based inputs, `stalled` status,
  phase ordering.
- E2e — build a rail between two buildings via clicks, assert
  `data-rail-cell-count`, advance a day, assert the consumer shows a
  rail-supplied status.

## Out of scope (deliberately)

- Per-warehouse-building inventories and multi-warehouse retail aggregation
  (Approach C) — the cell-budget engine supports adding this later.
- Multi-day travel time.
- Rails in retail cities.
- Buffer capacity scaling with building level.
- Trains/vehicles as visible entities; rails are throughput, not agents.
