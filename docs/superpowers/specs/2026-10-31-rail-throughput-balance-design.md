# HPA-679 — Rail Throughput Balance: Make Local Supply Useful

**Issue:** https://linear.app/cwchanap/issue/HPA-679/balance-make-local-production-meaningful-with-rail-throughput-tuning  
**PR:** https://github.com/cwchanap/Serpens/pull/69 (single draft PR for design and implementation)  
**Reference:** `docs/balance/after.md` `7, original `docs/superpowers/specs/2026-07-13-industry-rail-transport-design.md`  
**Inspected code baseline:** `main` @ `c79806038172f050b235c82e8fde1b37018bab16`  
**Status:** revised planning checkpoint after the [GitHub design review](https://github.com/cwchanap/Serpens/pull/69#issuecomment-6552660356). The comment reports throwaway experiments; **they are not committed implementation or independently re-run passing results**.

## Outcome and deliberate scope

Make a correctly connected, player-built industry chain move a noticeable volume of material into retail rather than trickling one unit per day. Retain useful rail upgrades, deterministic cell-budget shipping and truthful utilization displays. This ticket targets **operational volume** and prevents newly exposed warehouse-overflow traps; it does **not** promise a profitable industry chain.

In the recorded HPA-502 after-sweep, the 50 convenience advisor runs delivered **16,800** local bottled-water units (post-rail) versus **4,018,435** *all-product* retail-imported units (full run), a **0.42% local-to-import volume ratio**. That is **not** a matched-window, product-specific true supply share. The comparison is kept as historical context; the updated harness must define denominators explicitly.

The advisor's chain already builds a pump, water bottler and warehouse, completes two connections, and sustains production. A level-1 water bottler outputs 10 units/day, but `createRailBudget` gives each level-1 cell just 1 unit/day. More throughput can improve local deliveries without altering production recipes.

### Design review: what changed

The reviewer's temporary, uncommitted `k` trials (`k = 1, 2, 5, 8, 10, 20`) identified four consequential facts that the implementation must reproduce and verify:

1. **Scenario coupling:** `local-lifeline` and `two-city-supply-run` begin with level-5 rails and calibrations based on level-as-units/day. The reviewer observed reference/no-action regressions at every `k > 1`. A strict no-retune promise would make this ticket self-blocking.
2. **Warehouse overflow:** `pushSurplusViaRail` currently allows pushing raw-material surplus past warehouse capacity; `getCityInventoryStats` charges overflow at $2 per excess unit **each day**. Higher capacity can expose unbounded-feeling costs in a no-action scenario.
3. **Advisor topology:** on seed 20260503 the pump→bottler and bottler→warehouse connections are **disjoint**; there is no shared pump→warehouse rail trunk. At `k=10` the bottler's normal 10/day output becomes the limiting factor, so a higher `k` adds little to this sweep. Shared trunks still matter in player-built networks and must be tested separately.
4. **Economics:** the reviewer estimates that a k=10 chain makes more units but does **not** recover its fixed operating costs from bottled-water import savings. We should make volume and cost evidence visible, not claim profitability.

The reviewer reports a seed-20260503 local volume increase from 336 (k=1) to 3,360 units (k=10), and to 3,450 (k=20; buffered stock drains). These are review-provided pilot figures, **not** the required final 50-seed regression gate.

## Reuse survey and authority boundaries

| Surface | Current authority | HPA-679 decision |
| --- | --- | --- |
| Per-cell shipping budget and path bottlenecks | `src/lib/game/rail.ts`: `createRailBudget`, `getPathCapacity`, `consumeRailBudget` | Add one constant and pure shared capacity helper |
| Rail allocation and input-first priority | `src/lib/game/railShipping.ts` | Preserve deterministic BFS and shared budgets; add only a **rail surplus-push warehouse free-space cap** |
| City capacity and overflow penalty | `cityInventory.ts`: `getCityInventoryStats`, `getCityInventoryUsed` | Reuse existing capacity arithmetic; do not rework overflow accounting |
| Building recipes, levels and upgrade costs | `industry.ts`, `leveling.ts`, `railPlacement.ts` | Keep unchanged |
| Segment inspector | `RailSegmentInspector.svelte` | Show helper-derived units/day and utilization |
| Map rails | `industryMapRender.ts` | Same helper-derived denominator |
| Shipping report | `DailyProductionReport.railUsage` | Remains actual per-cell shipped units |
| Supply Planner | `supplyPlanner.ts` | Keep `rail-capacity-not-modeled`; no new recommendation/handoff |
| Scenario definitions and launch tests | `scenarios/catalog.ts`, `runtime.spec.ts`, `retail-sim.e2e.ts`, en/ja/zh-Hant | Recalibrate **only the affected scenarios**, maintain their gameplay intent and re-pin exact observed results |
| Balance evidence | `tests/balance/measure.ts`, `run.ts`, `progressionRun.ts` | Extend existing advisor metric with imported-unit counts; reuse unchanged bot policies and 50 seeds |

## 1. Chosen rail-unit rule (subject to proof, not a sweep-derived knob)

Define `RAIL_UNITS_PER_LEVEL = 10` and `getRailCellDailyCapacity(level: number): number` in `rail.ts`. Treat 10 as the **design default to validate**, not an already measured success.

| Rail level | Units per cell per day |
| --- | ---: |
| 1 | 10 |
| 2 | 20 |
| 3 | 30 |
| 4 | 40 |
| 5 | 50 |

**Why 10 rather than 20:** level-1 final processors make roughly 6–10 units/day. A level-1 rail carries one such processor's batch, while raw producers (18–40/day), upgraded buildings (throughput grows 20% per building level), shared trunks and competing input/output routes still benefit from rail upgrades. On the measured advisor topology there is no trunk shared between the input and output links, so the old “10 input + 10 output on the same cell requires k=20” justification does not apply. A single advisor sweep cannot distinguish k=10 from k=20 once processor output becomes the cap. Prefer the smaller useful value; validate against scenarios and multi-seed evidence.

`createRailBudget` uses `getRailCellDailyCapacity(cell.level)` once per cell per day. Keep the existing N/E/S/W deterministic BFS, shortest-path and ID tie-breaks, path minimum, per-cell consumption, and shared pull/push daily budget. A rail cell's persisted `level` remains 1–5; prices, upgrade rules, segment topology, save codecs and report shape do not change.

Tests should have **one literal pin** for `RAIL_UNITS_PER_LEVEL`. Other expectations derive from the helper, so another reviewed value does not require rewriting many unrelated assertions.

## 2. Cap *surplus rail push* at free warehouse space

Without a cap, a water pump can produce 40/day and ship too much raw water into a 200-unit warehouse. At high rail throughput, repeated pushes accumulate inventory above capacity and incur daily overflow charges; that is a material player trap hidden by the former 1/day bottleneck.

In `pushSurplusViaRail`, compute the owning industry's warehouse capacity from the existing buildings once per tick (via the existing city inventory read model, not a persisted counter), and compute **current used units** from the mutable per-tick city inventory. Limit each surplus push to:

`quantity = min(sourceStock, remainingPathBudget, max(0, cityWarehouseCapacity - currentCityInventoryUsed))`

When free capacity is zero, **exit without emitting a zero-unit shipment or entering an infinite loop**. Retain unshipped output in the existing producer buffer. The existing buffer-capacity logic may then slow/stall production on later ticks until space becomes available, giving normal in-game backpressure. Preserve pull-before-push priority; any pulls during the day free capacity for the push phase. Shared cell budgets still bound every shipment.

**Precise behavior change:** the old rail design explicitly allowed surplus pushes to overflow the warehouse; **HPA-679 retracts that allowance for production's rail surplus-push path only**. Do not disable, cap, or otherwise redefine pre-existing overflow caused by seeded inventory, transfers or other ownership paths; overflow penalties remain meaningful where the game currently allows overcapacity stock. Do not silently discard inventory or add auto-sale/overflow liquidation. Production/transport costs and the credit/economy model otherwise remain unchanged.

Focused tests: an almost-full warehouse with multiple competing producer pushes; exactly-full or already-overfull warehouse; a warehouse draw that frees space before push; leftover producer buffer and next-day backpressure; no zero shipments/infinite loop; multiple industry cities and deterministic priority; unchanged ability of **other** mechanisms to report overflow.

## 3. Existing map and inspector: real units/day

- `RailSegmentInspector.svelte` shows capacity as `getRailCellDailyCapacity(segment.minLevel)`, not raw rail level.
- Both inspector and `industryMapRender.ts` use `railUsage / getRailCellDailyCapacity(cell.level)` for the same cell; clamp utilization to [0,1]. Junction capacity is shared across segments, not additive.
- `railUsage` stays the **actual moved units**, not a normalized fraction. Level, remaining rail cost, and keyboard actions remain unchanged.
- Reuse existing localized UI strings unless genuinely changed. Preserve accessibility and narrow-screen layout.

## 4. Affected scenario calibration is part of this same PR

`local-lifeline` and `two-city-supply-run` currently author level-5 rails. The second scenario's catalog comment and strategy hint (en/ja/zh-Hant) explicitly promise “five units a day,” which would be false at 10 units **per level**.

After the k=10 + overflow-cap pilot, **measure first**. For these two scenarios only, minimally adjust authored rail levels, starting/seeded inventory, threshold or hint wording **as required by the actual trace**. Re-pin the existing `src/lib/scenarios/runtime.spec.ts` launch calibration contracts and affected `src/routes/retail-sim.e2e.ts` expectations. Do not globally change scenario medals, rework the runtime, or alter unrelated scenarios.

**Invariant means the intended outcome**, not that the reference must still complete on precisely day 15. The reference path should earn the intended Gold, while the no-action path should not earn Silver; for scenarios authored to fail at the deadline, verify they do not instead fail early solely due to warehouse overflow. Record final completion days, scores and medals exactly in tests and the calibration doc once measured. Keep the other five scenarios' traces stable if their state is unaffected. Current scenario version/save compatibility is not a new task; no pre-release migration.

## 5. Comparable measurements and acceptance

Extend `tests/balance/measure.ts:AdvisorChainMetric` (and its colocated specs) using the **existing `DailyProductReport.importedUnits` / `warehouseUnits`**. No new ledger or generator.

Report at least:
- `localDeliveryUnits` = bottled-water warehouse deliveries **strictly after last rail build** (existing metric).
- `retailImportedUnitsAllProducts` = all products, whole run (historical 4,018,435 denominator).
- `retailImportedUnitsBottledWater` = bottled water, whole run.
- `postRailRetailImportedUnitsBottledWater` = bottled water, strictly after last rail build, for a *matched-product and matched-window* operational comparison.

Show the historic-compatible **local-to-all-import ratio** (`localDeliveryUnits / retailImportedUnitsAllProducts`) and a separate matched product/window **local fraction** (`post-rail local water / (post-rail local water + post-rail imported water)`). Name each denominator in reports; do not conflate either with company-wide profit or all-products supply share. One diagnostic metric extension must not change the original served-chain decision criteria.

**Blocking proof:**
1. Re-run the reviewer's cheap k=1/k=10 scenario and named-seed 20260503 experiments in a disposable setup before implementing UI/tests beyond the helpers. Confirm or correct the reported topology, outcomes and overflow behavior.
2. Using the **same harness version** and same unchanged bots, compare k=1 vs k=10 across all 50 seeds × 365 days: 400 non-advisor runs should have byte-identical measurements if they never build rail. Because the metric schema expands here, old committed JSON and new JSON are **not** byte-comparable wholesale: compare preserved old fields to the frozen HPA-502 reference, and compare full new-schema artifacts to a new-schema k=1 control.
3. Preserve all **5/5 Gate A** criteria (not merely the boundedness ceiling). Explicitly distinguish the unchanged retail-steady/idle controls from the 50 advisor cases affected by shipping and planner feedback.
4. Check all seven scenario reference/no-action pairs (**14** calibrated intentions) with the narrow re-pins above, and run affected route E2E. Guardrail results must describe the new authored state, not silently bless a broken reference strategy.
5. Re-run existing progression bot/idle controls. **Hard gate:** zero idle tier claims, valid contiguous/idempotent tier claims, and no regression in scenario/sandbox fixed-point validity. **Review gate:** report per-tier claim counts and day shifts by archetype/seed, including newly reachable tiers, and obtain explicit review acceptance for material pacing shifts; do not silently change tier thresholds or progression bot rules.
6. Measure *cost buckets*, not just ending cash: retail import spend, production operating cost, warehouse overflow cost, payroll/expansion timing, revenue, local units and inventory. For seed 20260503, the reviewer observed a day-299 vs day-300 third-store opening that shifts payroll by >$11k; end-cash alone is misleading.
7. Provisional target: local-to-import ratio **≥3%**, with meaningful delivered local volume. This is not a profitability promise and must never override simulation integrity or scenario gates. If the minimal k=10 design fails, keep draft and document the smallest viable alternative; do not add new subsystems.

Keep old `docs/balance/baseline.md` and `after.md` frozen. Commit the independently reproducible result and method to `docs/balance/rail-throughput-calibration.md`; generated artifacts can stay in git-ignored `docs/balance/generated/`. Deterministic re-runs produce identical JSON; no timestamps or implicit seeds.

## Alternatives and exclusions

- **Automated rail upgrades / rail-aware forecast:** deferred; requires new Supply Planner action or projection and is not necessary for this fix.
- **Economy retune for industry profitability:** deferred as a separate, evidence-driven decision; do not adjust catalog costs/prices, factory payroll, or store economics here.
- **New routes, freight system, warehouse subsystem, state ownership, migrations:** excluded.
- **Assets, music, SFX, new gameplay panel:** excluded; none required.
- **Keep overflow as an intentional penalty for rail surplus:** rejected for this slice because increased rail capacity would expose an uncontrolled daily charge; other existing overflow origins retain their current semantics.

## Verification

Tests: `rail.spec.ts`, `railShipping.spec.ts` and `railShipping.edge.spec.ts`, `industryProduction.spec.ts`, `railPlacement.spec.ts`, `industryMapRender.spec.ts`, `RailSegmentInspector.svelte.spec.ts`, `tests/balance/measure.spec.ts`, `tests/balance/run.spec.ts`, `scenarios/runtime.spec.ts`, relevant route E2E and progression checks. Full `bun run check`, `bun run lint`, unit and affected E2E. Maintain draft status until implementation and evidence land on **this same PR**.

This is pre-release software: no backward-compatibility adapter or unrelated refactor.
