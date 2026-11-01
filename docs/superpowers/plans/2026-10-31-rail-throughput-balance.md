# HPA-679 — Rail Throughput Balance Implementation Plan

**Issue:** https://linear.app/cwchanap/issue/HPA-679/balance-make-local-production-meaningful-with-rail-throughput-tuning  
**Design:** `docs/superpowers/specs/2026-10-31-rail-throughput-balance-design.md`  
**Branch / PR:** `docs/hpa-679-rail-throughput-balance` — **one ticket / one PR**  
**Baseline:** `main` @ `c79806038172f050b235c82e8fde1b37018bab16`, HPA-502 Gate A 5/5  
**Status:** docs-only planning checkpoint. **No runtime changes, test runs, or post-tuning measurements claimed.**

## Working rules

Keep implementation in **this same PR**; don't split design and implementation into different PRs. Make the smallest isolated change that gives local rail economic weight. Preserve the deterministic engine, current UI ownership, five-level upgrade flow, save shape, documented planner limitation, all three locales, and scenario rules. No new art/SFX or backend. Do not create a new balance harness; reuse `tests/balance`.

### Step 0 — Recheck the active baseline and document the experiment

**Read:** `rail.ts`, `railShipping.ts`, `industryProduction.ts`, `industry.ts`, `railPlacement.ts`, `RailSegmentInspector.svelte`, `industryMapRender.ts`, `supplyPlanner.ts`, `supplyPlannerActions.ts`, `tests/balance/bots.ts`, `docs/balance/after.md` and `docs/balance/progression-calibration.md`.

1. Verify the PR base is still current; reconcile real `main` updates before editing. Check current tests and any other `cell.level`-based capacity labels or utilization ratios.
2. Reproduce/trace the existing L1 pump → bottler → warehouse rail chain from the balance bot. Confirm how the same cell participates in input and output phases, and distinguish 10/day recipe output from actual 1/day transport.
3. Freeze the comparison: **same 50 explicit seeds `20260501..20260550`, same 365-day horizon, same retail and advisor policies**. Use existing committed baseline/after files as immutable reference points. Preserve total local units, imports, cash and passage of Gate A.

**Gate:** one clear multiplier candidate, source-of-truth file list, no new state or ownership decisions.

### Step 1 — One shared rail capacity helper and focused tests

**Modify:** `src/lib/game/rail.ts`  
**Tests:** `src/lib/game/rail.spec.ts` and `railCoverage.spec.ts` if relevant.

1. Add `RAIL_UNITS_PER_LEVEL` (initial experimental value **20**) and pure `getRailCellDailyCapacity(level)`, derived from the existing 1–5 level.
2. Make `createRailBudget` use that helper. Do **not** change `findShippingPath`, `getPathCapacity`, `consumeRailBudget`, junction/segment derivation, BFS order, tick priority or stored `RailCell` shape.
3. Red/green unit tests: L1, L5, mixed levels, minimum-cell path, shared-cell exhaustion and repeated legal pulls. Test that a level-2 bottleneck doubles its L1 budget while cost/upgrade mechanics are unchanged.

**Gate:** focused rail tests pass, transport remains deterministic, no new engine abstraction.

### Step 2 — Reuse exact capacity in inspector and map

**Modify:** `src/lib/components/game/RailSegmentInspector.svelte` and `src/lib/game/industryMapRender.ts`.  
**Tests:** their existing colocated specs.

1. Change the segment `capacity` readout from raw `segment.minLevel` to `getRailCellDailyCapacity(segment.minLevel)`.
2. Change both segment and map utilization to divide *actual cell usage units* by `getRailCellDailyCapacity(cell.level)`, retaining current [0,1] cap. Do not redefine `railUsage` in the report, renderer or persisted state.
3. Add cases with shared junctions/mixed-level segments, nonzero report usage, idle/zero usage, and different levels. Audit for a stray direct `usage / cell.level` in other render/read models.
4. Prefer existing capacity/level strings and styles; only touch all three locales if text changes. Run the Svelte autofixer required by `CLAUDE.md` before committing Svelte changes.

**Gate:** engine, inspector and map agree on units/day and utilization; controls remain accessible; no new UI or art.

### Step 3 — Shipping and game/regression contracts

**Tests:** `src/lib/game/railShipping.spec.ts`, `railShipping.edge.spec.ts`, `industryProduction.spec.ts`, `industryMapRender.spec.ts`, `railPlacement.spec.ts` and the smallest affected scenario/save specs.

1. Exercise the actual pump → bottler → warehouse flow on real connected rail, including input pull **and** warehouse push competing for a shared cell budget on one day.
2. Verify rail shipment quantities, per-cell `railUsage`, material conservation, warehouse inventory and direct-import fallback. Shared trunk sum must not exceed its real level-derived budget.
3. Verify upgrade improves available transport without modifying building throughput, recipe costs, upgrade cost or stock rules. No rail scenario remains unchanged; negative/no-rail case still imports normally.
4. Confirm `rail-capacity-not-modeled` remains in Supply Planner's limitations; do **not** pretend its 7/30-day projection now models rail throughput.

**Gate:** existing + new tests pass, deterministic repeatability on paired runs, no codec or event-system edit.

### Step 4 — Measured calibration is a blocking gate

**Produce in this PR:** `docs/balance/rail-throughput-calibration.md` (new summary only; raw generated artifacts stay under git-ignored `docs/balance/generated/`).  
**Run:** existing `tests/balance/run.ts`; if applicable `tests/balance/progressionRun.ts`.

1. Run a **named seed** `20260503` short trace first to detect wrong predictions before the full sweep. Track local finished units delivered, direct imports, the rail cap actually consumed, cash, and whether shared transport is saturated.
2. Run the unchanged **50-seed × 365-day** HPA-502 matrix:
   `bun tests/balance/run.ts --seeds <all-50-comma-separated-seeds> --days 365 --bots idle,retail-steady,advisor --output docs/balance/generated/rail-throughput`

   Replace the placeholder with the explicit ascending `20260501` through `20260550` list; the CLI requires explicit seeds, and does not accept a range token. It produces 450 runs. Do not edit old bot definitions or historical measurement docs.
3. Compare old 0.42% advisor local-share / 16,800 local units / 4,018,435 imported units with new measured totals. Report per-seed distribution, whether the provisional ≥3% target is met, and meaningful cash/import reductions (not just warehouse stock growth).
4. Re-evaluate all five existing HPA-502 Gate A conditions (their exact definitions and thresholds from `docs/balance/after.md`), including **all four archetypes**. A single failed gate is a blocker.
5. Run the seven authored scenario guardrail pairs (**14 invariants**) under the new engine, and the existing HPA-318 progression calibration/negative controls to identify materially shifted tier claim days. Do not silently change goals, medals or thresholds.
6. If 20 fails, test **only a small number** of alternative `RAIL_UNITS_PER_LEVEL` values with the same matrix. Explain the chosen value and tradeoff; avoid a broad optimizer, per-product knobs or new models. Re-run final candidate twice, comparing deterministic generated JSON byte-for-byte.

**Gate:** all Gate A and scenario guardrails pass, meaningful local-delivery gain documented, progression impact disclosed. Otherwise keep the PR draft; escalate a design decision rather than broadening scope.

### Step 5 — Documentation, full verification and readiness

1. Update `CLAUDE.md` only where its active capacity description is now outdated. Leave the original July design as historical decision context, and add a concise reference to this new calibration/design if needed.
2. Full required checks:
   ```sh
   bun run check
   bun run lint
   bun run test:unit -- --run
   bun run test:e2e
   git diff --check main...HEAD
   ```
3. Review any affected Svelte component/a11y/E2E; no unvalidated passing claims. Verify persisted `RailCell.level` and report shape remain unchanged; no new migration or compatibility adapter.
4. Add the actual chosen factor, calibrated metrics, running commands, limits and gate verdict to the **same PR**. Mark ready only if all conditions hold.

**Stop condition:** A higher shared rail capacity that meaningfully increases local deliveries but breaks a scenario or 80% viability criterion is **not** shippable. Keep this one PR draft and ask for an explicit decision if an additional economy retuning task would be needed.

## Deliberate exclusions

- Rail-upgrade recommendations and bot automation (new planner action type)
- Rail-capacity-aware forecast/refactor (current limitation remains truthful)
- Additional freight/route system, inventory ledger, UI tab or new stored fields
- Recipe, product price, wage, store demand, loan, progression threshold or scenario medal tuning
- Art and sound generation

## Review checklist

- [ ] One shared helper is the only rail cell capacity authority.
- [ ] Shared trunk shipping is conserved and capacity-bounded.
- [ ] Segment inspector + map both use actual units/day.
- [ ] Same 50 seeds, no modified baseline bot policy or old reports.
- [ ] 5/5 Gate A, 14/14 scenario invariants, progression timing assessed.
- [ ] New `rail-throughput-calibration.md` shows before/after, selected factor, failures.
- [ ] Check, lint, unit, affected E2E all pass before ready-for-review.
