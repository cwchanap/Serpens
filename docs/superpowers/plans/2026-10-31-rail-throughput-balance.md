# HPA-679 — Rail Throughput Balance: Single-PR Implementation Plan

**Issue:** https://linear.app/cwchanap/issue/HPA-679/balance-make-local-production-meaningful-with-rail-throughput-tuning  
**Design:** `docs/superpowers/specs/2026-10-31-rail-throughput-balance-design.md`  
**Review:** https://github.com/cwchanap/Serpens/pull/69#issuecomment-6552660356  
**Branch / PR:** `docs/hpa-679-rail-throughput-balance` / https://github.com/cwchanap/Serpens/pull/69 — **one ticket, one draft PR**  
**Inspected baseline:** `main` @ `c79806038172f050b235c82e8fde1b37018bab16`  
**Status:** docs-only updated planning checkpoint. **No production changes, test executions or measured k=10 final result are claimed by this plan.** The review's throwaway probes are evidence to reproduce.

## Non-negotiable boundaries

- **KISS:** one deterministic constant/helper for level→units/day; one bounded rail-surplus-push change; reuse the existing budget/segment/industry/city-inventory code. Do not add a subsystem, persisted field, alternate shipping allocator, or save migration.
- **Single PR:** implementation, tests, scenario re-pins, measurement and this plan stay on PR #69. No implementation split.
- **Intent over unchanged snapshots:** two directly affected scenarios may need minimum authored calibration and localized copy; unrelated scenario objectives/medals and shared simulation economics stay fixed.
- **Volume, not assumed profit:** the bottler can now deliver more local units; that does not imply the factories and warehouse pay for themselves.
- **No new art, SFX, backend, telemetry, rail-upgrade bot action or rail-aware Supply Planner forecast.** Keep its `rail-capacity-not-modeled` caveat.

### Step 0 — Cheap decisive probes before implementing the whole slice

**Read:** `rail.ts`, `railShipping.ts`, `cityInventory.ts`, `industryProduction.ts`, `industry.ts`, `railPlacement.ts`, `industryMapRender.ts`, `RailSegmentInspector.svelte`, `scenarios/catalog.ts`, `scenarios/runtime.spec.ts`, `tests/balance/bots.ts`, `tests/balance/measure.ts`, `docs/balance/after.md`, `docs/balance/progression-calibration.md`.

1. Recheck PR and current `main`; avoid stale line anchors and do not overwrite other agents' commits.
2. In a disposable/uncommitted experiment only, change per-cell budget to `cell.level * k` and run **k=1 and k=10** for the authored scenario suite (`src/lib/scenarios/runtime.spec.ts`) and the named convenience advisor seed `20260503` for 365 days.
3. Record the exact baseline vs k=10 effects for `local-lifeline` and `two-city-supply-run`: completion day, score, medal, failure cause, overflow cost and inventory. Verify the review's reported regressions rather than treating them as established CI results.
4. Inspect connected advisor rail components at day 60; verify the pump→bottler and bottler→warehouse rails are disjoint and k=10 is output-capped. The review reported 336 local units at k=1, 3,360 at k=10 and 3,450 at k=20; any divergence must be documented.
5. Test the warehouse trap with and without the proposed free-capacity rail-push cap. Verify overflow truly originates from *rail surplus pushing*, not transfers or inventory setup.
6. Freeze the chosen rule **k=10** (level-1 processor 10-unit batch; larger raw/upgraded/shared paths justify upgrades) or record concrete evidence for proposing a different simple factor. **Do not** optimize k only against the advisor's already-output-capped network.

**Gate:** source topology and failure causes reproduced; final proposed scope is feasible and exact comparison method is pinned. If the review's premises fail, update the design rather than coding speculative work.

### Step 1 — Implement the smallest shared capacity helper

**Files:** `src/lib/game/rail.ts`, `rail.spec.ts` and relevant coverage spec.

- Export `RAIL_UNITS_PER_LEVEL = 10` and a pure `getRailCellDailyCapacity(level)` (the exact name follows existing style). Replace `createRailBudget`'s raw `cell.level` budget with the helper.
- Keep levels 1–5, rail topology, same-day per-cell budget accounting, path minimum, BFS neighbor/tie order, and shared pull-before-push precedence. Preserve existing upgrade and demolition costs.
- Pin **one literal** `RAIL_UNITS_PER_LEVEL` expectation; derive L1/L2/L5, bottleneck and contention expectations using the helper. Do not scatter magic 10s through rail tests.
- Update old test comments that incorrectly equate level with 1 unit/day (e.g. `railShipping.spec.ts`) as their assertions move to helper-derived expected quantities.

**Gate:** capacity and path-budget behavior pass; identical simulated inputs remain deterministic; no new persisted data.

### Step 2 — Prevent high-throughput warehouse overflow from rail surplus pushes

**Files:** `src/lib/game/railShipping.ts` and focused `railShipping.spec.ts` / `railShipping.edge.spec.ts` / `industryProduction.spec.ts`.

- Reuse existing **city warehouse capacity** from `getCityInventoryStats(game, cityId).capacity` at tick creation (or an equivalent existing-derived once-per-tick value), and `getCityInventoryUsed` on the **mutable working city inventory** before each push.
- In `pushSurplusViaRail` use `Math.min(stock, getPathCapacity(city.budget, best.path), Math.max(0, warehouseCapacity - used))`. If remaining space is zero, return/stop **before** mutating stock/budget/inventory or emitting a zero-quantity shipment. Other existing paths must retain their current overflow semantics.
- Do not add stock disposal or resale. Unshipped production remains in producer buffer; already implemented buffer bounds can cause later backpressure/stalled days. Shipments, `railUsage` and inventories must remain conserved, no oversubscribed rail cell.
- Tests: capacity at zero, full warehouse, nearly-full mixed materials, two producers racing for one free slot, a warehouse pull freeing room earlier in the same tick, multi-city isolation, subsequent-day backpressure, unchanged behavior of externally over-capacity stock. Explicitly inspect existing specs that relied on rail-push overflow and update only those assertions.
- No save codec/state schema changes. A small tick-local capacity read is okay; no new owner/cache subsystem.

**Gate:** high-throughput pump no longer creates unbounded incremental overflow via surplus pushes, deterministic priority holds, and no zero-progress loop.

### Step 3 — Make the existing rail UI report actual daily capacity

**Files:** `src/lib/components/game/RailSegmentInspector.svelte`, `src/lib/game/industryMapRender.ts` and colocated specs.

- Inspector capacity: `getRailCellDailyCapacity(selectedSegment.minLevel)`.
- Inspector/map utilization: recorded `railUsage` divided by helper-derived per-cell daily capacity; clamp to [0,1]. Keep shared junction counts non-additive; preserve numerical level display and upgrade preview.
- Test rail level 1 and 5, partially used cell, fully used cell, and mixed-level segment; check inspector and map agree for the **same** report.
- Reuse existing accessibility/locale strings. Run the repository's Svelte autofixer on the edited Svelte component as `CLAUDE.md` requests.

**Gate:** one source for capacity used by game+renderer+inspector; UI still keyboard operable.

### Step 4 — Recalibrate precisely the two affected scenarios

**Files (only as measurements require):** `src/lib/scenarios/catalog.ts`, `src/lib/scenarios/runtime.spec.ts`, `src/routes/retail-sim.e2e.ts`, `src/lib/i18n/messages/en.ts`, `ja.ts`, `zh-Hant.ts`.

- Re-run `local-lifeline` and `two-city-supply-run` under k=10 and the free-warehouse-cap push. The review reported that both start on rail **level 5** and the latter hints **five units/day**; neither can be left unchanged without a measured rationale.
- Prefer minimal **authored-only** changes to rails/seeded stock/one affected objective or scoring threshold; choose what preserves challenge, not what preserves an arbitrary completion day. Do not change global sales/production/economy tables or other five scenarios.
- Update the three-language strategy hints and stale catalog comments with truthful units/capacity. For a scenario that no longer needs a numerical throughput hint, replace it with a truthful contextual hint rather than hard-coding another fragile number.
- Re-pin exact completion day, score and medal in the existing reference/no-action `runtime.spec.ts` calibration tests after measuring the new traces. Check **intent**: intended Gold reference remains Gold, no-action stays below Silver; the no-action deadlines must not be replaced by early runaway overflow failure. Preserve existing prohibitions on manual dispatch where applicable.
- Update the two route E2E assertions; run the full seven-scenario suite (14 key reference/no-action behaviors). Keep unrelated scenarios' traces as before. No special pre-release compatibility handling.

**Gate:** the two scenarios remain genuinely playable, all seven scenario intents and affected E2E pass.

### Step 5 — Add only the missing advisor imported-unit evidence

**Files:** `tests/balance/measure.ts`, `tests/balance/measure.spec.ts` and only necessary report-rendering tests; **do not** add a new harness or change bot policies.

- Add existing-report-derived `retailImportedUnitsAllProducts` (all days, all store products), `retailImportedUnitsBottledWater` (all days), and `postRailRetailImportedUnitsBottledWater` (strictly after last rail day) to `AdvisorChainMetric` next to existing post-rail `localDeliveryUnits`. Use `DailyProductReport.importedUnits`; no new report fields.
- Add tests for mixed products, boundary day = lastRailDay (excluded for matched comparison), no rail at all, zero-import denominator and multiple stores/cities. Preserve the `served` boolean semantics.
- Render/retrieve both: historical comparable **local-to-all-import ratio** (`local / all imports`, reference 0.42%) and true **matched bottled-water post-rail local fraction** (`local / (local + matched water imports)`). Guard zero denominator without NaN/Infinity.
- Do not relabel historical import-only denominator as total supply. This is a measurement extension, not an economy decision.

**Gate:** traceable, correctly scoped denominator and stable old gate fields.

### Step 6 — Multi-seed economy, cost and progression calibration (blocking gate)

**Files:** new `docs/balance/rail-throughput-calibration.md` plus existing git-ignored generated outputs.

**Runs:**
1. Use the *same extended harness code* with k=1 as a control and k=10 as candidate: **50 explicit seeds `20260501`…`20260550`**, 365 days, `idle,retail-steady,advisor` bot selection. `tests/balance/run.ts` accepts an **explicit comma-separated seed list** only (use the one already printed in `docs/balance/after.md` or `SWEEP_SEEDS`; don't pass a range token). This is 450 total runs per factor: 400 idle/retail-steady plus 50 advisor. Keep the original HPA-502 bot code/policy untouched.
2. Under the same new harness schema, assert non-advisor 400-run measurements are **byte-identical** between k=1/k=10 (none builds rail). An old frozen JSON has fewer fields, so comparison to `docs/balance/after.md` must explicitly project legacy fields; don't claim raw JSON bytes match across schema versions.
3. On the **50 advisor runs**, show local units and each imported-unit denominator, historical-compatible ratio, matched water supply fraction and per-seed spread. Target ≥3% local-to-import ratio provisionally, but evidence/side effects matter more than the target alone.
4. Repeat HPA-502 Gate A **5/5** as documented in `docs/balance/after.md`. Name unchanged gates vs rail-sensitive advisor results, report first positive 30-day windows, boundedness, managed-vs-idle income, forecast windows, served-chain/no-repeat advisor actions.
5. Also compare buckets for **same seed/window**: retail `importSpend`, `productionReport.operatingCost`, `productionReport.overflowCost`, gross retail revenue, payroll, day of store opening, and resulting cash/debt. **Do not** infer rail savings from end-cash difference alone: the review notes a store opening on day 299 instead of 300 can shift payroll by >$11k, swamping a roughly +$1.7k rail-cost effect.
6. Rerun all seven scenario reference/no-action contracts (**14 intents**) with the Step 4 authored-only re-pins, and affected E2E.
7. Re-run `tests/balance/progressionRun.ts` for the corresponding 50-seed × four-archetype progression matrix and idle negative controls. **Hard pass:** zero idle claims, valid contiguous claims and unchanged claim/save invariants. **Review decision:** report count-by-tier and p10/median/p90 claim days (unreached distinct), seed-level outliers, and explicitly review/accept changed pacing; no silent progression threshold retune.
8. Re-run the chosen candidate twice, comparing newly generated deterministic JSON byte-for-byte **under identical CLI arguments**. Keep old `docs/balance/baseline.md` and `after.md` unmodified.
9. The calibration document must disclose both improved volume **and the review's possible profitability deficit**. If k=10 does not make industry profitable, say so; that is not automatic ticket failure. Quantify higher import replacement vs changed production costs.

**Gate:** scenario intents hold, original 5/5 Gate A continues, no idle progression claims, actual rail share and cost buckets reported, and material progression shifts accepted by review. If a reasonable isolated factor plus the scoped cap/re-pin still fails, **stay draft** and record the blocker; do not broaden into an economy redesign.

### Step 7 — Final checks and readiness on this PR

- Check for outdated source comments/docs. `CLAUDE.md` has no current rail-capacity prose to update; change it **only** if the final implementation makes an existing statement false, not as a ceremonial step. Leave July's original rail design as historical context; this spec records the amended rule.
- Run focused tests through each step, then full verification:

```sh
bun run check
bun run lint
bun run test:unit -- --run
bun run test:e2e
git diff --check main...HEAD
```

- Confirm no new save migration, implicit RNG call, extra console time, unbounded object clone, or duplicated transport planner.
- Commit the final `docs/balance/rail-throughput-calibration.md` with the exact actual commands/config, chosen factor, scenario re-pins, economy/progression verdicts, and limitations.
- **Only then** mark this same PR ready; no follow-up PR for implementation and no claim of green tests before tests execute.

## Reviewer traceability

| Review finding | Accepted resolution |
| --- | --- |
| F1 incompatible no-retune/14-invariant gates | Step 4: scoped scenario recalibration preserving intent |
| F2 raw overflow trap | Step 2: rail surplus-push free-space cap and targeted backpressure tests |
| F3 sweep not selecting k | Step 0 + design: k=10 chosen by processor scale/upgrade value; sweep validates |
| F4 no imported-unit denominator + profitability ambiguity | Step 5 metrics; Step 6 distinguish volume from profit |
| F5 cash shift dominated by payroll timing | Step 6 cost buckets + expansion-day attribution |
| F6 gates insensitive; progression rule missing | Byte-identical non-advisor control; hard/soft progression gates |
| F7 expensive checks too late | Cheap scenario/advisor/overflow probe in Step 0, before implementation |

**Explicit non-goals:** automatic rail-upgrade suggestions, rail-aware planner, new warehouses/logistics submodels, catalog price/recipe tuning, new gameplay panels, original image/audio generation, save-version compatibility work.
