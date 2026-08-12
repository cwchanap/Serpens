# Task 1 report — Snapshot the real supply-city demand boundary

## Implementation details

- Added `src/lib/game/supplyPlanner.ts` with the Task 1 request/result contracts, category listing, configured supply-city snapshot construction, demand contributors, replenishment ceilings, weighted retail import economics, city inventory/building scoping, upstream material requirements, and active outbound-route identification.
- Contributor demand is derived from `buildCityDemandPools`; target-stock draw is clamped by `REPLENISHMENT_INTERVAL_DAYS`; zero-target products use a deterministic category import-cost average.
- Shared retail claimants are ordered deterministically and aggregated when they point at the same configured industry inventory. Finished import cost uses effective-demand weighting and falls back to the selected claimant when demand is zero.
- Upstream requirements recurse through `MATERIAL_PRODUCER_RECIPES`/`PRODUCTION_RECIPES`, aggregate shared inputs, and retain maximum chain depth. Rail reachability fields are intentionally empty for Task 1; active outbound routes are filtered only by active state, origin supply city, and required material IDs.
- Added `src/lib/game/supplyPlanner.spec.ts` covering city/category scope, replenishment and zero-target behavior, shared claimants, retail-vs-material import pricing, zero demand, unavailable supply, inventory invariant propagation, upstream depth/aggregation, and active outbound route filtering.

## TDD evidence

### RED

1. `rtk bun run test:unit -- src/lib/game/supplyPlanner.spec.ts --run --project server`
   - Initial output: Vitest could not find `./supplyPlanner`; this was the expected cutover smoke while the production module was absent.
2. After adding only the typed stub exports, the same command ran 12 tests and failed all 12. Failures were behavioral (`[]` missing `bottled-water`, snapshots returned `invalid` instead of `ready`, no invariant throw, etc.), proving the assertions were exercising the missing contract rather than passing accidentally.

### GREEN and checks

- `rtk bun run test:unit -- src/lib/game/supplyPlanner.spec.ts --run --project server`
  - `Test Files 1 passed; Tests 12 passed`.
- `rtk bunx eslint src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts`
  - Passed with no errors.
- `rtk bunx prettier --check src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts`
  - `All matched files use Prettier code style!`.
- `rtk bun run check`
  - `svelte-check found 0 errors and 0 warnings`.

## Self-review

- The snapshot does not mutate `GameState`, RNG, inventory, routes, or reports; inventory is copied into the read model and buildings are reduced to stable IDs/type/level rows.
- Invalid configured supply cities return the soft-unavailable result before inventory stats; valid inventory corruption still propagates the authoritative `City inventory invariant` error.
- Requirement recursion is bounded for cycles and uses output quantities to scale input requirements; no route dispatch, capacity, destination-need, reservation, or cost forecasting is performed.

## Concerns

- Rail reachability and usable/disconnected building facts are intentionally empty until Task 2, as required by the brief.
- The requirements helper is exported as `buildSupplyMaterialRequirements` with `getSupplyMaterialRequirements` as a getter-style alias for later consumers.

## Commit

The implementation commit is recorded in the handoff after the final commit command.

## Fix Round 1 — carried-category boundary

- Addressed the reviewer finding that `listSupplyPlannerCategories` exposed every archetype-supported chain category even when the store did not currently carry it. The implementation now adds a category only when it is present in that store's `products` and supported by `getSupportedStoreChainCategories`.
- Updated `src/lib/game/supplyPlanner.spec.ts` so the second-city fixture actually carries an electronics-only `games` product, while the requested Harbor City carries only `bottled-water`. The regression asserts the list is exactly `['bottled-water']` and that selecting the previously leaked `snacks` category returns `unsupported-category` rather than `empty`.

### Fix Round 1 TDD evidence

- RED command: `rtk bun run test:unit -- src/lib/game/supplyPlanner.spec.ts --run --project server`
  - `1 failed, 11 passed`; the regression received `['bottled-water', 'snacks', 'drinks', 'essentials']` instead of the carried-only `['bottled-water']` list.
- GREEN command: `rtk bun run test:unit -- src/lib/game/supplyPlanner.spec.ts --run --project server`
  - `Test Files 1 passed; Tests 12 passed`.
- Covering ESLint: `rtk bunx eslint src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts` — passed with no errors.
- Covering Prettier: `rtk bunx prettier --check src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts` — `All matched files use Prettier code style!`.
