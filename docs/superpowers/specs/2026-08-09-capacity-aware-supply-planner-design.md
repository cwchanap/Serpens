# Capacity-Aware Supply Planner and 30-Day Forecast — Design

**Linear:** HPA-281 — Implement the capacity-aware Supply Planner and 30-day forecast

## Outcome

Replace the current building-presence Supply Advisor with a deterministic planning workflow that answers four player questions for a selected finished product:

1. How much demand should I expect?
2. What is the primary supply bottleneck?
3. What happens over 7 and 30 days if I do nothing?
4. What is the best concrete build, upgrade, warehouse, or no-op action for that bottleneck, and why?

The planner is advisory only. It never mutates the live game, advances RNG, autosaves, builds, upgrades, or performs logistics actions. Existing map/build/inspector flows remain the only places where the player commits a recommendation.

## Why this is the next slice

HPA-281 is the highest-priority unblocked implementation ticket in the Serphens project and blocks HPA-297. The repo has moved beyond the assumptions of the original roadmap: city-local inventory and inter-city logistics now exist, while the baseline planner is still the old presence checklist.

HPA-281 therefore uses current city-local inventory contracts without absorbing HPA-297's route-aware planning scope. It plans one retail city's configured supply chain at a time. HPA-297 can later extend the same result model with in-transit stock, recurring routes, route constraints, and logistics actions.

## Current code to reuse

The feature extends existing boundaries instead of creating parallel balance logic.

- `src/lib/game/stock.ts`
  - reuse `buildCityDemandPools` for deterministic expected demand;
  - reuse `getFinishedMaterialIdForCategory` for category → finished-material mapping;
  - never call stochastic `simulateProductSalesForCity` from the planner.
- `src/lib/game/productChainGraph.ts`
  - reuse `MATERIAL_PRODUCER_RECIPES` for the validated one-producer-per-material assumption;
  - reuse and minimally generalize `buildingsForRecipe` / `getRecipeThroughputUnits` so lightweight planner building snapshots can use the same throughput formula;
  - compute material-specific output from the matching recipe output quantity. Do not use `recipeOutputPerDay` for a material because it sums every recipe output.
- `src/lib/game/leveling.ts`
  - reuse `getBuildingThroughputMultiplier`, `getBuildingUpgradeCost`, and `canUpgradeBuilding`.
- `src/lib/game/cityInventory.ts`
  - reuse `getCityInventory` for soft access gating;
  - call `getCityInventoryStats` only after access succeeds;
  - do not catch authoritative inventory invariant failures and convert them into normal planner UX states.
- `src/lib/game/industry.ts`
  - reuse `MATERIALS`, `PRODUCTION_RECIPES`, and `INDUSTRIAL_BUILDING_TYPES` for recipes, import costs, build costs, buffers, and warehouse definitions.
- `src/lib/game/industryPlacement.ts`
  - reuse `getIndustrialPlacementBlockReason` for geometry/resource feasibility;
  - keep affordability separate from placement feasibility.
- `src/lib/game/supplyAdvisor.ts`
  - replace `buildSupplyAdvisor` presence-chain behavior;
  - retain `getAvailableMaterialIds` because Build Menu still uses it.
- `src/lib/components/game/SupplyAdvisor.svelte`
  - keep the existing accessible modal as the player-facing planner shell.
- `src/lib/components/game/ProductChainsPanel.svelte`
  - keep structural/operational graph ownership;
  - add one small `Plan this chain` callback for the active category.
- `src/routes/+page.svelte`
  - remain the composition/navigation root;
  - keep selected planner category/horizon route-local; no new store/router/event bus.

`productChainTree.ts` already resolves the active retail city's supply assignment, but that helper is active-city-only and throws on invariant failures. HPA-281 needs an explicit requested retail city and soft unavailable states, so it should not call that helper as-is. Assignment lookup remains a single planner snapshot step rather than becoming a second general supply-scope framework.

## Approaches considered

### A. Pure expected-value planner over existing formulas — chosen

Build a pure snapshot + projection model from deterministic demand, recipe throughput, inventory, costs, and levels. Run the same projection for the live baseline and a small set of hypothetical action deltas.

**Advantages**

- deterministic and fast for 7- and 30-day views;
- no RNG fork or save/autosave concerns;
- recommendation evidence is directly explainable;
- HPA-297 can add logistics facts to the snapshot instead of replacing the planner;
- tests remain small and stable.

**Trade-off**

It is a planning model, not a bit-for-bit replay of `simulateDay`. It reports expected demand and installed capacity rather than stochastic sales, event timing, exact building-buffer/rail scheduling, or true input-constrained effective throughput.

### B. Clone `GameState` and replay `simulateDay` for 30 days — rejected

This would pull RNG, events, finance servicing, reports, logistics, autosave-adjacent behavior, and scenario rules into a capacity planner. It would require either consuming live randomness or inventing a second RNG contract, and recommendation evidence would be harder to explain.

### C. Extend Product Chains/Svelte selectors until they produce recommendations — rejected

This would mix graph presentation, forecast calculations, and action ranking. HPA-297 would then be coupled to Svelte and graph-layout state.

## Planning scope

### One retail destination and one configured supply city

A planner request is scoped to one retail city and one finished product category. The supply city comes from the existing retail supply assignment.

When the retail city has no configured usable supply city, the planner returns an unavailable local-supply state and does not invent a route.

The baseline slice does **not** model transfers or recurring routes. In-transit stock and route state remain HPA-297 extension inputs.

### Supported horizons

Every ready result contains both 7-day and 30-day projections. The UI switches between them without changing the underlying result contract.

Recommendation comparison favors 30-day improvement, with 7-day shortage reduction as the first tie-break for non-warehouse bottlenecks.

## Domain contracts

Add `src/lib/game/supplyPlanner.ts` as the public pure planner module.

```ts
export type SupplyPlannerHorizonDays = 7 | 30;

export interface SupplyPlannerRequest {
	retailCityId: WorldCityId;
	categoryId: string;
}

export interface SupplyPlannerBuildingSnapshot {
	id: string;
	cityId: WorldCityId;
	typeId: IndustrialBuildingTypeId;
	level: number;
}

export interface SupplyPlannerSnapshot {
	retailCityId: WorldCityId;
	supplyCityId: WorldCityId;
	finishedMaterialId: MaterialId;
	cash: number;
	demandPerDay: number;
	inventory: Partial<Record<MaterialId, number>>;
	warehouseCapacity: number;
	warehouseUsed: number;
	buildings: readonly SupplyPlannerBuildingSnapshot[];
}
```

A ready snapshot always has a valid supply city. Unavailable supply is represented before snapshot construction rather than by `supplyCityId: null` inside a supposedly usable snapshot.

The snapshot deliberately contains planning facts, not a cloned `GameState`. That makes immutability explicit and gives HPA-297 a stable place to append optional in-transit/route facts later.

### Result states

Normal request/availability states are typed results.

```ts
export type SupplyPlannerResult =
	| { status: 'ready'; plan: SupplyPlan }
	| { status: 'empty'; reason: 'no-supported-products' }
	| { status: 'unavailable'; reason: 'retail-city-unavailable' | 'supply-city-unavailable' }
	| { status: 'unsupported'; reason: 'unsupported-category' | 'missing-producer-recipe' }
	| { status: 'invalid'; reason: 'invalid-request' };
```

A supported sold category with expected demand `0` is **ready**, not empty. Its projection has zero requirements, primary bottleneck `none`, and recommendation `{ kind: 'none', reason: 'no-demand' }`. This preserves the selected category and gives the UI a coherent zero-demand state.

Authoritative domain invariant failures are different from normal planner states. The planner gates assignment/inventory access with `getCityInventory`; only after `access.ok` may it call `getCityInventoryStats`. If `getCityInventoryStats` still throws because authoritative inventory data violates an invariant, let that invariant failure surface rather than catching it and presenting corruption as a normal unavailable/invalid planner state.

Programmer/catalog invariants such as duplicate producer recipes may likewise throw at catalog construction time, matching Product Chains.

## Deterministic forecast model

### 1. Demand

Use `buildCityDemandPools` for the requested retail city and read the selected category's expected units/day. Do not call `simulateProductSalesForCity` and do not draw random numbers.

Zero expected demand remains a valid ready projection with no recommendation beyond no-op.

### 2. Upstream requirement propagation

For each material, record required units/day. For the material's producer recipe:

1. convert required output units to required recipe cycles;
2. add each input's required units to an accumulator;
3. continue final → process → raw until all reachable inputs are resolved.

Shared upstream materials are accumulated before their producer requirement is evaluated, preventing duplicate rows/double-counting when multiple branches consume the same input.

Reuse `MATERIAL_PRODUCER_RECIPES`; do not add a planner-specific producer registry.

### 3. Installed local capacity

Product Chains remains the single throughput formula owner.

Minimally generalize its throughput helpers to accept readonly lightweight building rows containing `typeId` and `level`, so both real `IndustrialBuilding[]` and `SupplyPlannerBuildingSnapshot[]` can call the same function. For a material:

1. resolve its producer recipe from `MATERIAL_PRODUCER_RECIPES`;
2. get shared recipe throughput through `getRecipeThroughputUnits`;
3. find the matching recipe output line for that material;
4. calculate `output.quantity × throughput`.

Do not duplicate `getBuildingThroughputMultiplier` reduction inside `supplyPlanner.ts`.

This is installed expected capacity. The planner does not model exact buffers, rail cells, or input-constrained effective downstream throughput. That limitation directly shapes recommendation generation: HPA-281 only proposes actions for the **primary bottleneck material**, not every constrained material in the projection.

### 4. Inventory and cover

For each required material expose:

- current city-inventory units;
- required units/day;
- installed local production capacity/day;
- capacity surplus/deficit/day;
- stock cover (`stock / requiredPerDay` when demand is positive);
- projected stockout day when required/day exceeds local capacity/day;
- projected local units and import-required units for 7 and 30 days.

The aggregate horizon formula is intentionally small:

```text
required = requiredPerDay × horizon
localAvailable = startingInventory + localCapacityPerDay × horizon
importRequired = max(0, required - localAvailable)
```

Live production can import upstream inputs, so installed downstream capacity may still be shown even when upstream production is insufficient. The planner does **not** treat that independent installed-capacity view as permission to optimize all downstream stages in HPA-281.

### 5. Warehouse pressure

Use `getCityInventoryStats` after successful inventory access.

Expose:

- current used capacity;
- installed capacity;
- free capacity `max(0, capacity - used)`;
- current overflow `max(0, used - capacity)`.

Warehouse pressure is a separate bottleneck. It does not pretend to change the aggregate import/shortage formulas above. A warehouse build is valuable because it increases storage headroom, so comparisons track that effect explicitly.

A warehouse bottleneck is considered binding when current overflow exists, or when free capacity is zero while the selected chain has positive inventory/local-production flow that needs shared storage. Do not create a warehouse-level simulation or projected occupancy engine in this slice.

Warehouse building levels do not increase `warehouseCapacity`; recommend another warehouse rather than an ineffective warehouse upgrade.

## Bottleneck model

Use a small discriminated union; no causal graph/DSL.

```ts
export type SupplyBottleneck =
	| { kind: 'missing-producer'; materialId: MaterialId }
	| { kind: 'production-capacity'; materialId: MaterialId; deficitPerDay: number }
	| { kind: 'inventory-cover'; materialId: MaterialId; stockoutDay: number }
	| { kind: 'warehouse-capacity'; overflowUnits: number; freeCapacity: number }
	| { kind: 'import-reliance'; materialId: MaterialId; importedUnits30: number }
	| { kind: 'none' };
```

Primary-bottleneck priority is deterministic:

1. missing installed producer;
2. binding warehouse capacity;
3. largest normalized production-capacity deficit;
4. earliest projected inventory stockout;
5. largest 30-day import reliance;
6. none.

Evidence retains material IDs and numeric facts so localization never reconstructs domain logic.

## Candidate actions and comparisons

Add `src/lib/game/supplyPlannerActions.ts` for recommendation candidates, hypothetical deltas, and ranking. Candidate generation is deliberately **primary-bottleneck-targeted**.

First-slice behavior:

- `missing-producer`, `production-capacity`, `inventory-cover`, or `import-reliance` → generate build/upgrade candidates only for that bottleneck's `materialId`;
- `warehouse-capacity` → generate only feasible warehouse-build candidates;
- `none` → no investment candidate;
- always include a no-op fallback.

This keeps diagnosis and recommendation aligned and avoids pretending HPA-281 has a true input-constrained optimizer. HPA-297 or a later planner slice can broaden candidate search after the projection model includes the additional constraints needed to compare stages safely.

No automatic logistics, purchasing, policy, pricing, staffing, or finance recommendation is added in HPA-281.

### Feasibility

- Build candidates use `getIndustrialPlacementBlockReason`, scoped to the selected supply city, to reject types with no valid geometry/resource placement.
- Do not use cash-aware `createIndustryPlacementPreview` for candidate geometry.
- Upgrade candidates require `canUpgradeBuilding` and use `getBuildingUpgradeCost`.
- Build costs come from `INDUSTRIAL_BUILDING_TYPES`.
- Affordability for ranking is `immediate cost <= game.cash`.
- Existing expansion financing may still appear after navigation, but planner scoring does not model debt offers.

### Hypothetical execution

Never patch live `GameState`.

Apply a candidate to a copy of `SupplyPlannerSnapshot`:

- build producer: append one level-1 building snapshot;
- upgrade: increment the selected building snapshot's level;
- build warehouse: append one level-1 warehouse snapshot and increase snapshot warehouse capacity by the authoritative building definition;
- no-op: unchanged snapshot.

Then run the exact same pure projection as the baseline.

### Comparison

```ts
export interface SupplyPlannerComparison {
	shortageReduction7: number;
	shortageReduction30: number;
	importReduction30: number;
	stockoutImprovementDays: number;
	warehouseFreeGain: number;
}
```

`warehouseFreeGain` is `candidate.warehouse.free - baseline.warehouse.free`, with overflow relief reflected by the candidate's greater headroom. It exists because warehouse capacity is a real bottleneck even though the intentionally aggregate material forecast does not feed warehouse space into import/shortage arithmetic.

### Ranking

Use explicit lexicographic comparison, not an opaque weighted score.

For a `warehouse-capacity` baseline bottleneck:

1. affordable + feasible candidates first;
2. larger `warehouseFreeGain`;
3. lower immediate cost;
4. stable action key.

For material bottlenecks:

1. affordable + feasible candidates first;
2. larger 30-day shortage reduction;
3. larger 7-day shortage reduction;
4. larger 30-day import reduction;
5. later/no projected stockout;
6. lower immediate cost;
7. stable action key.

A warehouse investment is meaningful when the baseline bottleneck is warehouse capacity and `warehouseFreeGain > 0`, even if shortage/import totals are unchanged. For material bottlenecks, if every affordable feasible investment has zero shortage/import/stockout improvement, recommend no-op.

Zero demand and surplus chains recommend no-op directly.

## Player-facing UI

### Keep `SupplyAdvisor.svelte`, replace its content

Keep the existing focus-trapped modal and replace the building-presence checklist with:

- category selector for supported products in the selected retail city;
- planning-scope line: retail city → configured supply city;
- demand/day;
- finished stock and days of cover;
- local production capacity/day and import reliance;
- 7-day / 30-day tabs;
- primary bottleneck with numeric evidence;
- recommended action, cost, expected improvement, and limitation copy;
- baseline-vs-action comparison;
- expandable per-material evidence;
- explicit no-demand, empty, unavailable, unsupported, and invalid-request states.

No charting dependency is needed.

### Product Chains entry point

`ProductChainsPanel.svelte` keeps graph ownership. Add one `Plan this chain` action for the active category. It invokes a route-owned callback; the route closes Product Chains and opens the existing Supply Advisor modal focused on that category.

## Navigation and context

Keep planner UI context in `+page.svelte`:

```ts
interface SupplyPlannerUiContext {
	categoryId: string | null;
	horizonDays: 7 | 30;
}
```

The context survives closing the modal. Reopening returns to the same valid category/horizon.

Recommendation actions navigate but never commit:

- **Build producer / warehouse:** close planner, switch to the supply city's industry map, arm existing industry placement for the recommended type.
- **Upgrade building:** close planner, switch to the building's industry city, select its tile, and let the existing inspector own Upgrade.
- **No-op:** no navigation.

Do not call build/upgrade mutations directly from the planner.

## Localization

All player-facing planner copy goes through `I18nBundle`. Domain results carry reason/evidence codes and IDs rather than English sentences.

Update English, Japanese, and Traditional Chinese catalogs together. Existing material/building/city label helpers remain authoritative.

## Error and edge-state behavior

- No supported retail products → `empty/no-supported-products`.
- Supported category with zero expected demand → `ready`, bottleneck `none`, no-op reason `no-demand`.
- Missing/null/unusable supply assignment → `unavailable/supply-city-unavailable` before warehouse stats are read.
- Missing producer recipe → `unsupported/missing-producer-recipe`.
- Empty inventory is valid and produces zero cover.
- Binding zero/full warehouse capacity can recommend a warehouse even when import/shortage totals do not move.
- Completed/surplus chains recommend no-op.
- Unaffordable improvements remain visible but cannot be primary recommendation.
- Planner-level invalid requests return `invalid`; authoritative domain invariant exceptions are not caught and disguised as planner UX states.
- Forecasting never mutates game arrays, inventories, buildings, reports, or RNG state.

## Testing strategy

### Pure node tests

`src/lib/game/supplyPlanner.spec.ts`

Cover:

- deterministic demand without RNG changes;
- zero demand remains ready;
- 7/30 horizons;
- single-stage and multi-stage recipes;
- shared upstream inputs aggregated once;
- Product Chains throughput helper parity for real vs lightweight building rows;
- building count and levels changing capacity;
- empty inventory and days of cover;
- projected stockout/import reliance;
- warehouse free/overflow evidence;
- missing producer recipe / unavailable supply / invalid request;
- successful `getCityInventory` gate before stats;
- deep immutability.

`src/lib/game/supplyPlannerActions.spec.ts`

Cover:

- candidates target only the primary bottleneck material;
- build and upgrade generation;
- warehouse candidate generation only for warehouse bottlenecks;
- **binding warehouse pressure selects `build-warehouse` as the recommendation** when feasible and affordable;
- infeasible placement exclusion;
- affordability;
- baseline/hypothetical use the same projector;
- shortage/import reductions for material bottlenecks;
- no-op for no-demand, surplus, ineffective, unaffordable, or no-feasible-action cases;
- deterministic tie ordering.

### Component tests

`SupplyAdvisor.svelte.spec.ts` covers meaningful result states, zero-demand ready state, category/horizon switching, bottleneck evidence, warehouse/material recommendations, callbacks, focus behavior, and comparison copy.

`ProductChainsPanel.svelte.spec.ts` covers `Plan this chain` without graph regressions.

### Route/browser tests

`page.svelte.spec.ts` covers planner context preservation plus build, warehouse-build, and upgrade navigation intent without mutations.

Targeted Playwright in `retail-sim.e2e.ts` uses a deterministic warehouse-pressure fixture/path:

1. open planner;
2. verify warehouse is the primary bottleneck and `build-warehouse` is recommended;
3. inspect 7/30 evidence;
4. activate the recommendation and verify warehouse industry placement is armed;
5. cancel/return, reopen, and verify category/horizon context survives.

Keep calculation combinations in node tests. Upgrade navigation remains covered at route/component level rather than adding a second E2E flow.

## KISS / YAGNI guardrails

- No cloned 30-day `simulateDay` replay engine.
- No forecast RNG or seed-management subsystem.
- No true input-constrained downstream optimizer in HPA-281.
- No multi-material candidate sweep; recommend only against the primary bottleneck.
- No generic optimizer, solver, rule DSL, causal graph, worker pool, or cache layer.
- No new global Svelte store/router/event bus.
- No automatic action execution.
- No charting dependency.
- No route/in-transit forecasting; HPA-297 owns it.
- No event-modified route/economic forecast semantics; HPA-296/HPA-297 own them.
- No financing optimizer.
- No save-schema change.
- No compatibility adapter for obsolete `AdvisorChain` after cutover; remove dead chain-only code/tests.

## Review adjustments

Accepted review findings and resulting design changes:

1. warehouse relief gets explicit `warehouseFreeGain` comparison and can win when warehouse capacity is the primary bottleneck;
2. build/upgrade candidate generation is narrowed from every constrained material to the primary bottleneck material only;
3. zero demand is ready + no-op, not an empty planner result;
4. normal supply/inventory access is soft-gated before `getCityInventoryStats`; authoritative invariant throws are not caught as UX states;
5. planner capacity reuses a minimally generalized Product Chains throughput helper instead of duplicating the leveling reduction;
6. unit and targeted E2E acceptance explicitly cover warehouse bottleneck → warehouse recommendation → existing placement handoff.

## Acceptance mapping

- deterministic same-state results → pure snapshot/projector + stable ranking;
- no game/RNG/autosave mutation → expected-value formulas and copied planner snapshots;
- building count/level affects capacity → shared Product Chains throughput helper;
- multi-stage/shared input parity → producer map + aggregate upstream propagation;
- demand/capacity/stock/cover/import/shortage → per-material forecast evidence;
- warehouse diagnosis/action parity → warehouse evidence + `warehouseFreeGain`;
- explainable edge states → typed results plus no-demand ready state;
- recommendation reacts to primary bottleneck/cost/affordability → bottleneck-targeted candidate snapshots through the same projector;
- baseline/hypothetical 7/30 → shared projection path;
- navigation → existing industry placement/inspector flows;
- HPA-297 extension → city-scoped snapshot/result identity without route semantics.

## Delivery shape

One implementation PR follows this design/plan PR. Keep the old advisor working until the new result reaches the component; after cutover, remove obsolete `AdvisorChain` behavior rather than carrying two planner models.