# HPA-679 — Rail Throughput Balance: Make Local Supply Meaningful

**Issue:** https://linear.app/cwchanap/issue/HPA-679/balance-make-local-production-meaningful-with-rail-throughput-tuning  
**Reference:** HPA-502 `docs/balance/after.md` and original rail design at `docs/superpowers/specs/2026-07-13-industry-rail-transport-design.md`  
**Code baseline:** Serpens `main` @ `c79806038172f050b235c82e8fde1b37018bab16` (inspected October 31, 2026)  
**Delivery:** one ticket / one draft PR, design first, implementation on this same branch  
**Status:** proposed design, unimplemented and unmeasured

## Problem and intended player outcome

The existing production pipeline works, but its rail transport has very low economic impact. In HPA-502's final 50-seed × 365-day headless sweep, the convenience advisor constructs a water pump, water bottler, warehouse and both rail connections; production resumes by day 30 and stays active through day 365. Across those runs, local retail deliveries total **16,800 units** while retail imports total **4,018,435 units**: **0.42% local share** (`docs/balance/after.md`, `7). This is a disclosed, *intended level-1 rail limit*, not a bug.

The bottleneck is clear: `createRailBudget` gives each rail cell a daily budget equal to its persisted `level`, initially **1 unit/day**. `water-bottling` can produce **10 finished units/day**, and input pulls and output-to-warehouse pushes consume the **same per-cell daily budget**. Even after the player builds a valid supply chain, it barely offsets shop imports.

**Desired player experience:** Building and connecting a complete industry chain provides a noticeable (not necessarily complete) reduction in imported finished goods. Upgrading existing rail segments remains useful. The map and inspector display the same actual throughput as the engine. We will accept tuning only with multi-seed evidence that it does not destabilize the retail economy or scenarios.

## Baseline / authority survey

| Concern | Existing authority | Change |
| --- | --- | --- |
| Rail levels, cell budgets, shared BFS transport | `src/lib/game/rail.ts`: `RAIL_MAX_LEVEL=5`, `createRailBudget`, `getPathCapacity`, `consumeRailBudget` | Replace the *budget units per level*, through one helper/constant |
| Input pulls / surplus pushes | `src/lib/game/railShipping.ts` | **No algorithm change**; consumes the new units automatically |
| Building output and recipe costs | `src/lib/game/industry.ts`, `industryProduction.ts` | **No change**; water bottler outputs 10/day at level 1 |
| Rail upgrades and costs | `src/lib/game/railPlacement.ts` | **No change**; keep segment topology, 1–5 levels, and cost curve |
| Segment display | `src/lib/components/game/RailSegmentInspector.svelte` | Display units/day from shared helper; utilization denominator changes |
| Map rail utilization | `src/lib/game/industryMapRender.ts` | Use shared helper instead of dividing by `cell.level` |
| Shipping report evidence | `DailyProductionReport.railUsage` | Keep as **actual moved units per cell**, not fraction/capacity |
| Supply Planner | `src/lib/game/supplyPlanner.ts` | Preserve `rail-capacity-not-modeled` limitation; don't pretend forecast has become rail-aware |
| Balance / progression evidence | `tests/balance/` and `docs/balance/` | Re-run same seed matrices, compare results and scenario/progression guardrails |

## Proposed minimal design

### One capacity rule, not a new subsystem

Add a single, explicitly named constant such as `RAIL_UNITS_PER_LEVEL` and a pure helper such as `getRailCellDailyCapacity(level: number): number` in `rail.ts`.

Use **20 units per level per day as an initial calibration candidate**, not a decided value:

| Cell level | Provisional daily units |
| --- | ---: |
| 1 | 20 |
| 2 | 40 |
| 3 | 60 |
| 4 | 80 |
| 5 | 100 |

A shared cell may need to carry 10 units entering the bottler **and** 10 finished units leaving for the warehouse; 20/day is a rational first experiment, but real graphs and contention decide realized flow. The final factor is selected by the harness, not by this table.

`createRailBudget` initializes `remaining[cellKey] = getRailCellDailyCapacity(cell.level)`. Keep the current invariant: `getPathCapacity` is the **minimum remaining budget along the chosen path**; every shipped unit consumes one unit on **each** traversed cell. Both shipping phases share the same budget and run in their existing priority order (input pulls before surplus push). Do not rewrite BFS or add another allocation pass.

The persisted `RailCell.level` is still a level 1–5, not a unit counter. Cost, upgrade, demolish, save validation and pre-release save shape stay untouched. No new state or migration.

### Existing readouts, one consistent unit

- Segment inspector's `capacity` is the lowest-level cell's **units/day**, using the helper rather than treating level as capacity.
- Inspector utilization uses `actualRailUsage / getRailCellDailyCapacity(cell.level)`, capped to [0, 1] as today. Shared junctions retain a common budget.
- `industryMapRender.ts` uses the same denominator. The level, rail shape, and usage/report payloads remain unchanged.
- Check all other rail capacity labels and tests. Existing localized labels should suffice; only change en/ja/zh-Hant strings if a genuinely new/changed label is necessary. No new UI panels or controls.

### Planning and economy boundary

The Supply Planner currently does **not** model rail-cell capacity. Changing actual throughput must **not** silently remove the `rail-capacity-not-modeled` caveat or claim exact savings in the planner. An automated `upgrade-rail` suggestion/action would require a larger planner candidate, command, UI handoff and headless executor change: **explicitly deferred**.

Production recipes, prices, import costs, retail sales capacity, payroll, loans, world progression thresholds, and bot policies remain fixed in this ticket. This makes before/after results attributable to one rail-throughput knob. Historical `docs/balance/baseline.md` and `after.md` remain immutable references. Publish a new `docs/balance/rail-throughput-calibration.md` as an implementation artifact.

## Acceptance and rejection gates

1. **Correctness:** isolated L1/L5 paths carry the derived budgets; a shared trunk cannot oversubscribe even when both input pulls and warehouse pushes use it; upgrading a bottleneck increases capacity exactly as the shared helper states; amount moved is conserved in the shipment ledger and inventories.
2. **Visible honesty:** map utilization and segment inspector match the same recorded `railUsage` values; a higher physical limit must not appear as 100% used at the former 1/day mark.
3. **Determinism:** identical seeded legal command sequences produce identical daily shipping, final game state and balance artifacts. No extra RNG calls or timestamp-based decisions.
4. **Measured impact:** re-run the exact HPA-502 50 explicit seeds `20260501..20260550` × 365 days with unchanged `idle`, `retail-steady` and `advisor` bots. Report advisor local-delivery/import share against the reference **0.42%**. A **≥3% share** is a *provisional* meaningful-effect target; also report actual daily production, bottlenecks, cash and import spend. Do not claim it passed before measurement.
5. **No economy regressions:** maintain existing HPA-502 Gate A **5/5** (viability ≥80% per archetype, bounded cash/principal/import/waste, managed > idle, forecast accuracy, advisor chain). Keep existing **14/14 scenario reference/no-action invariants**. Assess HPA-318 progression claim timing using its existing calibration runner; record any deviation before accepting.
6. **Scope gate:** if no reasonable single-capacity setting produces worthwhile gains without failing other gates, **leave PR draft**, record the failed trials and propose a separate decision. Don't weaken the gates, retune unrelated economic constants, or implement a general rail-aware planner to rescue this change.

The 3% target is an aspiration, not permission to sacrifice the 5/5 economy gate. A smaller, evidenced improvement may be proposed for review but must be disclosed and explicitly accepted before marking ready.

## Alternatives considered

- **Teach advisor / planner to upgrade rail:** potentially more strategic, but entails a new recommendation type, preview/command handoff, simulations and bot behavior. Save for later if the simple balance change proves insufficient.
- **Raise recipe production / give factories passive stock:** doesn't address the physical shipment bottleneck and contaminates economy balancing.
- **Ignore low local share:** technically valid as the historical design, but it leaves an expensive complete chain with negligible operational value.
- **Add a separate freight system or new UI:** violates KISS/YAGNI and duplicates existing rail infrastructure.

## Verification surface

Focused code/test owners: `rail.spec.ts`, `railShipping.spec.ts`, `railShipping.edge.spec.ts`, `industryProduction.spec.ts`, `industryMapRender.spec.ts`, `RailSegmentInspector.svelte.spec.ts`, `railPlacement.spec.ts`, `supplyPlanner.spec.ts` when relevant, `tests/balance/run.spec.ts`, `tests/balance/progressionRun.ts`, scenario tests and affected Playwright tests.

No new art, SFX, save schema, compatibility layer, state manager or backend is in scope.
