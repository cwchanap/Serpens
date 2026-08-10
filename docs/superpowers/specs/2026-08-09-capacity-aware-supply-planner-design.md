# Capacity-Aware Supply Planner and 30-Day Forecast — Design

**Linear:** HPA-281 — Implement the capacity-aware Supply Planner and 30-day forecast

## Outcome

Replace the current building-presence Supply Advisor with a deterministic planning workflow that answers four player questions for a selected finished product:

1. How much demand should I expect?
2. Where is the supply chain short on capacity or inventory?
3. What happens over 7 and 30 days if I do nothing?
4. What is the best concrete build or upgrade action, and why?

The planner is advisory only. It never mutates the live game, advances RNG, autosaves, builds, upgrades, or performs logistics actions. The existing map/build/inspector flows remain the only places where the player commits a recommendation.

## Why this is the next slice

HPA-281 is the highest-priority unblocked implementation ticket in the Serphens project and it blocks HPA-297. The repo has also moved beyond the assumptions of the original roadmap: city-local inventory and inter-city logistics now exist, while the baseline planner is still the old presence checklist.

The implementation should therefore use the current city-local inventory contracts without absorbing HPA-297's route-aware planning scope. HPA-281 plans one retail city's configured supply chain at a time. HPA-297 can later extend the same result model with in-transit stock, recurring routes, route constraints, and multi-city logistics actions.

## Current code to reuse

The feature should extend existing boundaries rather than create parallel balance logic.

- `src/lib/game/stock.ts`
  - `buildCityDemandPools` is the deterministic expected-demand calculation. Forecasts use this instead of the stochastic `simulateProductSalesForCity` path, so planning never consumes RNG.
  - `getFinishedMaterialIdForCategory` maps retail categories to finished materials.
- `src/lib/game/productChainGraph.ts`
  - owns the current one-producer-per-material graph assumptions;
  - already derives recipe throughput from building count and `getBuildingThroughputMultiplier`;
  - already exposes recipe input/output capacity helpers used by Product Chains.
- `src/lib/game/leveling.ts`
  - `getBuildingThroughputMultiplier`, `getBuildingUpgradeCost`, and `canUpgradeBuilding` remain authoritative for upgrade capacity and cost.
- `src/lib/game/cityInventory.ts`
  - `getCityInventory` and `getCityInventoryStats` remain authoritative for available material stock and warehouse capacity.
- `src/lib/game/industry.ts`
  - `MATERIALS`, `PRODUCTION_RECIPES`, and `INDUSTRIAL_BUILDING_TYPES` remain authoritative for recipes, import costs, build costs, buffers, and warehouse buildings.
- `src/lib/game/supplyAdvisor.ts`
  - the existing `buildSupplyAdvisor` only reports built/buildable/blocked chain steps. This is the behavior HPA-281 replaces.
  - `getAvailableMaterialIds` is still useful to `BuildMenu` and does not need to become part of the forecast engine.
- `src/lib/components/game/SupplyAdvisor.svelte`
  - keep this existing accessible modal as the player-facing planner surface instead of creating another top-level planning panel.
- `src/lib/components/game/ProductChainsPanel.svelte`
  - remains the detailed structural/operational graph. Add a small entry point from the selected chain into the planner; do not merge the graph renderer and forecast UI.
- `src/routes/+page.svelte`
  - remains the composition/navigation root. Planner selection and return context stay route-local; no new global store/router/event bus.

## Approaches considered

### A. Pure expected-value planner over existing formulas — chosen

Build a pure snapshot + projection model from deterministic demand, recipe throughput, inventory, costs, and levels. Run the same projection for the live baseline and small hypothetical action deltas.

**Advantages**

- deterministic and fast for both 7- and 30-day views;
- no RNG fork or save/autosave concerns;
- each recommendation can point directly to the inputs that produced it;
- HPA-297 can add logistics facts to the snapshot rather than replace the planner;
- tests are small and stable.

**Trade-off**

It is a planning model, not a bit-for-bit replay of `simulateDay`. It intentionally reports expected demand and installed capacity rather than stochastic sales, event timing, or exact building-buffer/rail scheduling.

### B. Clone `GameState` and replay `simulateDay` for 30 days — rejected

This appears to maximize parity but would pull RNG, events, finance servicing, reports, logistics, autosave-adjacent behavior, and future scenario rules into a forecast that only needs capacity planning. We would either consume live randomness or invent a second RNG contract. Recommendation evidence would also be harder to explain.

### C. Extend Product Chains/Svelte selectors until they produce recommendations — rejected

This is the smallest initial diff but mixes graph presentation, forecast calculations, and action ranking. It would make HPA-297 harder because logistics-aware planning would be coupled to Svelte and graph layout state.

## Planning scope

### One retail destination and one configured supply city

A planner request is scoped to one retail city and one finished product category. The supply city is resolved from the existing retail supply assignment. This lets HPA-281 use the current city-local inventory architecture without becoming the HPA-297 logistics planner.

When the retail city has no local supply assignment, the planner can still explain demand but returns an imports-only/unavailable-local-supply state and does not invent a route.

The baseline slice does **not** model transfers or recurring routes. In-transit stock and route state become optional snapshot inputs owned by HPA-297 later.

### Supported horizons

The public result always contains both 7-day and 30-day projections. The UI can switch between them without recomputing a different contract.

The recommendation ranking is primarily based on the 30-day result, with 7-day shortage reduction used as the first tie-break. This favors meaningful investments without hiding near-term emergencies.

## Domain contracts

Add `src/lib/game/supplyPlanner.ts` as the public pure planner module.

```ts
export type SupplyPlannerHorizonDays = 7 | 30;

export interface SupplyPlannerRequest {
	retailCityId: WorldCityId;
	categoryId: string;
}

export interface SupplyPlannerSnapshot {
	retailCityId: WorldCityId;
	supplyCityId: WorldCityId | null;
	finishedMaterialId: MaterialId;
	cash: number;
	demandPerDay: number;
	inventory: Partial<Record<MaterialId, number>>;
	warehouseCapacity: number;
	warehouseUsed: number;
	buildings: readonly SupplyPlannerBuildingSnapshot[];
}

export interface SupplyPlannerBuildingSnapshot {
	id: string;
	cityId: WorldCityId;
	typeId: IndustrialBuildingTypeId;
	level: number;
}
```

The snapshot deliberately contains planning facts, not a cloned `GameState`. That makes immutability obvious and gives HPA-297 a stable place to append optional `inTransit` and `routes` facts later.

### Result states

Normal game states are returned as typed results, not exceptions.

```ts
export type SupplyPlannerResult =
	| { status: 'ready'; plan: SupplyPlan }
	| { status: 'empty'; reason: 'no-demand' | 'no-supported-products' }
	| { status: 'unavailable'; reason: 'retail-city-unavailable' | 'supply-city-unavailable' }
	| { status: 'unsupported'; reason: 'unsupported-category' | 'missing-producer' }
	| { status: 'invalid'; reason: 'invalid-state' };
```

Programmer/catalog invariants such as duplicate producer recipes may still throw at catalog construction time, as Product Chains already does.

## Deterministic forecast model

### 1. Demand

Use `buildCityDemandPools` for the requested retail city and read the selected category's expected units/day. Do not call `simulateProductSalesForCity`, and do not draw random numbers.

The finished material's expected demand is propagated upstream through the existing recipe graph.

### 2. Upstream requirement propagation

For each material, record required units/day. For the material's producer recipe:

1. convert required output units to required recipe cycles;
2. add each recipe input's required units to an accumulator;
3. continue from final → process → raw until all reachable inputs are resolved.

Shared upstream materials are accumulated before their producer requirement is evaluated. This prevents double-counting when multiple branches consume the same input.

Current catalog behavior assumes one producer recipe per material. Reuse Product Chains' validated producer map rather than adding a planner-specific graph registry.

### 3. Installed local capacity

Installed recipe throughput is the sum of `getBuildingThroughputMultiplier(level)` for matching buildings in the selected supply city. Recipe output capacity/day is recipe output quantity × throughput.

This is expected installed capacity. The planner does not replay rail-cell throughput, exact buffer occupancy, or the order of individual production ticks. Those remain live-simulation concerns. The planner can still report a warning that actual realized production may be lower when current operational reports show blocked/stalled factories.

### 4. Inventory and cover

For each required material, expose:

- current city-inventory units;
- required units/day;
- installed local production capacity/day;
- capacity surplus/deficit/day;
- simple stock cover (`stock / requiredPerDay`, when demand is positive);
- projected stockout day when required/day exceeds local capacity/day;
- projected local units and imported/shortage units for 7 and 30 days.

The projected local/import split is intentionally aggregate:

```text
required = requiredPerDay × horizon
localAvailable = startingInventory + localCapacityPerDay × horizon
importRequired = max(0, required - localAvailable)
```

Live production already permits imports when local upstream inputs are unavailable, so the planner may treat upstream deficit as import reliance without preventing downstream installed capacity from being measured.

### 5. Warehouse capacity

Use `getCityInventoryStats` for the selected supply city. Warehouse pressure is a separate bottleneck when current/projected material volume cannot fit the installed capacity.

Do not invent warehouse-level scaling. `getCityInventoryStats` remains authoritative; if a warehouse's building level does not increase `warehouseCapacity`, the planner recommends another warehouse rather than an ineffective warehouse upgrade.

## Bottleneck model

Use a small discriminated union; no causal graph/DSL.

```ts
export type SupplyBottleneck =
	| { kind: 'missing-producer'; materialId: MaterialId }
	| { kind: 'production-capacity'; materialId: MaterialId; deficitPerDay: number }
	| { kind: 'inventory-cover'; materialId: MaterialId; stockoutDay: number }
	| { kind: 'warehouse-capacity'; requiredCapacity: number; availableCapacity: number }
	| { kind: 'import-reliance'; materialId: MaterialId; importedUnits30: number }
	| { kind: 'none' };
```

Priority for the primary bottleneck is deterministic:

1. missing producer;
2. warehouse capacity preventing useful stock holding;
3. largest normalized production-capacity deficit;
4. earliest projected inventory stockout;
5. largest 30-day import reliance;
6. none.

Evidence retains material IDs, required/capacity units, and horizon values so localization never has to reconstruct domain logic.

## Candidate actions and comparisons

Add `src/lib/game/supplyPlannerActions.ts` for recommendation candidates, hypothetical deltas, and ranking. Keep candidate generation separate from baseline projection because HPA-297 will add logistics candidates later.

First-slice candidates are exactly:

- build the producer building for a constrained material;
- upgrade one existing producer building;
- build a warehouse when warehouse capacity is binding;
- no action.

No automatic logistics, purchasing, policy, pricing, staffing, or finance recommendation is added in HPA-281.

### Feasibility

- Build candidates use the existing industrial placement preview/menu eligibility to reject building types that have no valid placement in the supply city.
- Upgrade candidates require `canUpgradeBuilding` and use `getBuildingUpgradeCost`.
- Build costs come from `INDUSTRIAL_BUILDING_TYPES`.
- A candidate is affordable for ranking when its immediate cost is `<= game.cash`.
- Existing expansion financing remains available after navigation, but the baseline planner does not model debt offers inside recommendation scoring.

This deliberately keeps financial planning out of the supply planner while still making affordability affect the recommendation as required.

### Hypothetical execution

Do **not** patch live `GameState`.

Apply each candidate to a copy of `SupplyPlannerSnapshot`:

- build producer: append one level-1 building snapshot;
- upgrade: increment the selected building snapshot's level;
- build warehouse: append one level-1 warehouse snapshot and recompute warehouse capacity from the same authoritative building definition;
- no-op: unchanged snapshot.

Then run the exact same pure projection used for the baseline.

### Ranking

Use an explicit lexicographic comparison, not an opaque weighted score:

1. larger 30-day shortage reduction;
2. larger 7-day shortage reduction;
3. larger 30-day import reduction;
4. later/no projected stockout;
5. lower immediate cost;
6. stable action key.

Unaffordable candidates are still shown as alternatives/evidence but cannot become the primary recommendation. If every affordable action has zero improvement, recommend no-op.

This makes ties stable and explanations straightforward.

## Player-facing UI

### Keep `SupplyAdvisor.svelte`, replace its content

The existing modal is already wired into Build Menu, Escape handling, map pausing, and focus trapping. Keep that boundary and turn it into the planner UI rather than adding a second planner shell.

The modal contains:

- category selector for supported products in the selected retail city;
- planning-scope line: retail city → configured supply city;
- demand/day;
- current finished-stock units and days of cover;
- local production capacity/day and import reliance;
- 7-day / 30-day projection tabs;
- primary bottleneck with numeric evidence;
- recommended action, cost, expected improvement, and limitations;
- baseline-vs-action comparison;
- expandable stage/material evidence;
- explicit empty/unavailable/unsupported/error messages.

No charting library is needed. Small metric rows and comparison text are sufficient for this slice.

### Product Chains entry point

`ProductChainsPanel.svelte` keeps its atlas/graph responsibility. Add one `Plan this chain` action for the active category. It calls a route-owned callback with the category ID; the route closes the management panel and opens the existing Supply Advisor modal focused on that category.

Do not embed forecast state in the graph or make Product Chains own recommendation calculations.

## Navigation and context

Keep planner UI context in `+page.svelte`:

```ts
interface SupplyPlannerUiContext {
	categoryId: string | null;
	horizonDays: 7 | 30;
}
```

The context survives closing the modal. Reopening the planner returns to the same category/horizon unless that category is no longer valid.

Recommendation actions navigate, but do not commit:

- **Build producer / warehouse:** close planner, switch to the supply city's industry map, and arm the existing industry placement flow for the recommended type.
- **Upgrade building:** close planner, switch to the supply city's industry map, select the target building's tile, and let the existing inspector own the Upgrade button.
- **No-op:** no navigation.

Do not call build/upgrade controller mutations directly from the planner.

## Localization

All player-facing planner copy goes through the existing `I18nBundle`. Domain results carry reason/evidence codes and identifiers, not English sentences.

Update English, Japanese, and Traditional Chinese message catalogs in the same implementation PR. Material/building/city names continue to use existing label helpers.

## Error and edge-state behavior

- No supported retail products → empty state.
- Supported category with zero expected demand → zero-demand state; no investment recommended.
- No configured/usable supply city → show imports-only/unavailable local-supply explanation; do not invent capacity.
- Missing producer recipe → unsupported state.
- Empty inventory is valid and produces zero cover.
- Zero warehouse capacity is a warehouse bottleneck only when local stock/production would need storage.
- Completed/surplus chains recommend no-op.
- Unaffordable improvements remain visible but no-op can win.
- Unknown/malformed planner state returns `invalid` rather than a partially populated plan.
- Forecasting does not mutate game arrays, nested inventories/buildings/reports, or RNG state.

## Testing strategy

### Pure node tests

`src/lib/game/supplyPlanner.spec.ts`

Cover:

- deterministic demand derived without RNG changes;
- 7/30 horizons;
- single-stage and multi-stage recipes;
- shared upstream inputs counted once at aggregate requirement;
- building count and levels changing capacity;
- empty inventory and days of cover;
- projected stockout;
- import reliance;
- warehouse pressure;
- missing producer / invalid / no-demand states;
- deep immutability of supplied `GameState` and snapshot.

`src/lib/game/supplyPlannerActions.spec.ts`

Cover:

- build, upgrade, warehouse, and no-op candidate generation;
- infeasible placement exclusion;
- affordability;
- baseline/hypothetical use the same projector;
- shortage/import reductions;
- no-op for surplus, ineffective, or unaffordable cases;
- deterministic tie ordering.

### Component tests

`src/lib/components/game/SupplyAdvisor.svelte.spec.ts`

Cover meaningful result states, category/horizon switching, evidence rendering, action callbacks, keyboard/focus behavior, and baseline-vs-action copy.

`src/lib/components/game/ProductChainsPanel.svelte.spec.ts`

Cover `Plan this chain` for the selected category without changing graph behavior.

### Route/browser tests

`src/routes/page.svelte.spec.ts`

Cover planner context preservation and action-navigation intent through the real route composition.

Targeted Playwright in `src/routes/retail-sim.e2e.ts`:

1. open planner from the current build/product-chain experience;
2. inspect 7/30 baseline and recommended action;
3. navigate a build recommendation into industry placement;
4. navigate an upgrade recommendation to the correct building inspector;
5. reopen planner and verify selected planning context is retained.

Keep Playwright narrow; calculation combinations belong in node tests.

## KISS / YAGNI guardrails

- No cloned 30-day `simulateDay` replay engine.
- No forecast RNG or seed-management subsystem.
- No generic optimizer, constraint solver, rule DSL, causal graph, worker pool, or cache layer.
- No new global Svelte store/router/event bus.
- No automatic action execution.
- No charting dependency.
- No route/in-transit forecasting in HPA-281; HPA-297 owns it.
- No event-modified route/economic forecast semantics; HPA-296/HPA-297 own those integrations.
- No financing optimizer; existing build navigation may still offer financing after the planner hands off.
- No save-schema change: the planner is derived state only.
- No pre-release compatibility adapter for the old `AdvisorChain` result once the UI is migrated; remove obsolete chain-only code/tests instead of preserving an unused API.

## Acceptance mapping

HPA-281's acceptance criteria map to this design as follows:

- deterministic same-state results → pure snapshot/projector + stable ranking;
- no game/RNG/autosave mutation → expected-value formulas and planner snapshots;
- building count/level affects capacity → existing throughput multiplier;
- multi-stage/shared input parity → validated recipe graph + aggregate upstream propagation;
- demand/capacity/stock/cover/import/shortage → per-material forecast evidence;
- explainable edge states → typed result/reason unions;
- recommendation reacts to demand/capacity/level/inventory/cost/affordability → candidate snapshots rerun through the same projector;
- baseline/hypothetical 7/30 → shared projection path;
- navigation → existing industry placement/inspector flows;
- HPA-297 extension → city-scoped snapshot/result identity with no route semantics in baseline.

## Delivery shape

One implementation PR after this design/plan PR. The implementation should use small commits by planner layer and keep the old advisor working until the new result reaches the component; once the cutover is complete, remove obsolete `AdvisorChain` behavior rather than carrying two planner models.
