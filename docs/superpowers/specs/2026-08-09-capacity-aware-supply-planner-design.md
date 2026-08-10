# Capacity-Aware Supply Planner and 30-Day Forecast — Design

**Linear:** HPA-281 — Implement the capacity-aware Supply Planner and 30-day forecast

## Outcome

Replace the current building-presence Supply Advisor with a deterministic planning workflow that answers four player questions for a selected finished product:

1. How much of this product can the configured supply network actually be asked to replenish?
2. What is the primary local supply bottleneck?
3. What happens over 7 and 30 days if I do nothing?
4. What is the best actionable build, upgrade, rail-connection, warehouse, or no-op response, and why?

The planner is advisory only. It never mutates live game state, advances RNG, autosaves, builds, upgrades, or lays rail. Existing placement, rail-build, and inspector flows remain the mutation boundary.

## Why this remains one HPA-281 slice

The pure expected-value architecture is still the right size. The follow-up review exposed model inputs that are already part of the current local simulation and therefore cannot be deferred without making the baseline planner misleading:

- producers must be able to deliver output to the city warehouse through the existing intra-city rail network;
- one industry inventory can serve more than one retail city, so demand must include every retail claimant assigned to that supply city;
- retail warehouse draw is bounded by the existing replenishment cadence and store target stock, not only by city potential demand;
- recommendations need enough cash evidence to avoid proposing an investment whose incremental operating cost exceeds the imports it replaces.

These do **not** require another planner module, a replay engine, or a generic optimizer. They fit inside the same snapshot → projection → primary-bottleneck candidate architecture.

HPA-297 still owns inter-city forecasting: in-transit arrivals, recurring-route dispatch prediction, route priority/capacity, and event-modified logistics. HPA-281 must not reimplement those semantics.

## Current code to reuse

### Demand and replenishment

- `src/lib/game/stock.ts`
  - reuse `buildCityDemandPools` for deterministic potential demand;
  - reuse `getFinishedMaterialIdForCategory`;
  - never call stochastic `simulateProductSalesForCity` from the planner.
- `src/lib/game/retailSupply.ts`
  - reuse the existing replenishment interval constant rather than duplicating cadence;
  - the planner derives a per-city/category replenishment ceiling from the stores' `targetStock` values.

### Product-chain and inventory scope

- `src/lib/game/productChainGraph.ts`
  - reuse `MATERIAL_PRODUCER_RECIPES`;
  - reuse `getSupportedStoreChainCategories` for supported sold categories;
  - reuse `getIndustryInventoryScope(game, cityId)` for the configured supply city's inventory/building scope;
  - minimally generalize `buildingsForRecipe` / `getRecipeThroughputUnits` for lightweight planner building rows;
  - add material-specific output capacity rather than duplicating throughput arithmetic in the planner.
- `src/lib/game/cityInventory.ts`
  - `getCityInventoryStats` remains authoritative for capacity/used/overflow;
  - access is soft-gated before stats are read;
  - authoritative invariant failures remain invariant failures.

### Local delivery

- `src/lib/game/railShipping.ts` / `src/lib/game/rail.ts`
  - reuse the same rail-network, building-attachment, warehouse-target, and shipping-path rules used by `pushSurplusViaRail`;
  - expose one small pure reachability helper so the planner does not duplicate rail topology rules;
  - the planner distinguishes **installed** producer capacity from **deliverable** producer capacity.

### Costs and actions

- `src/lib/game/industry.ts`
  - reuse material import costs, recipe operating costs, building build costs, flat daily costs, and warehouse definitions.
- `src/lib/game/leveling.ts`
  - reuse building throughput, upgrade cost, and upgrade eligibility.
- `src/lib/game/industryPlacement.ts`
  - reuse `createIndustrialPlacementContext` once per candidate scan;
  - reuse `getIndustrialPlacementBlockReasonWithContext` per tile;
  - do not rebuild placement context for every tile.

### UI/composition

- keep `SupplyAdvisor.svelte` as the planner shell;
- keep Product Chains as the graph surface with one `Plan this chain` callback;
- keep planner category/horizon and recommendation handoff state route-local in `+page.svelte`;
- preserve the current `isSupplyAdvisorOpen` derivation gate so planner calculation does not run continuously while the modal is closed.

## Approaches

### A. Pure expected-value local-network planner — chosen

Build an immutable snapshot of known local facts, then project 7/30-day demand, deliverable capacity, inventory cover, and bounded import exposure. Run the same projector for the baseline and small hypothetical action deltas.

This remains preferable to replaying `simulateDay`: missing recipe inputs are already resolved deterministically through imports during live production, so the planner can model expected installed production without cloning RNG/event/report state. What it must not do is count a producer that cannot deliver to the warehouse or ignore known demand claimants.

### B. Clone and replay `simulateDay` — rejected

Still rejected. It would pull RNG, event duration, finance servicing, logistics scheduling, report growth, and scenario behavior into a planner whose player value is explainable local bottleneck diagnosis.

### C. Product Chains as optimizer — rejected

Still rejected. Product Chains is a structural/operational view. Forecast and recommendation logic stays in pure game modules.

## Planning scope

A request is still initiated from one retail city and one category, but the resulting **supply-city forecast** must include all retail cities currently assigned to that same industry inventory.

This distinction is important:

- the selected retail city provides UI context and its own demand evidence;
- the configured supply city is the inventory/capacity boundary;
- every retail city assigned to that supply city contributes known replenishment demand for the selected category;
- HPA-281 does not forecast outgoing recurring-route dispatches or incoming transfer arrivals.

If active recurring routes originate from the supply city for a required material, the result stays `ready` but includes a `logistics-contention-not-modeled` limitation. HPA-281 must not silently treat its retail-only projection as complete. While that limitation is active, producer/warehouse investment recommendations are suppressed to a typed no-op reason rather than pretending HPA-281 can forecast HPA-297 behavior.

## Public contracts

Add `src/lib/game/supplyPlanner.ts`.

```ts
export type SupplyPlannerHorizonDays = 7 | 30;

export interface SupplyPlannerRequest {
	retailCityId: WorldCityId;
	categoryId: string;
}

export interface SupplyDemandContributor {
	retailCityId: WorldCityId;
	potentialDemandPerDay: number;
	replenishmentCeilingPerDay: number;
	effectiveDemandPerDay: number;
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
	demandContributors: readonly SupplyDemandContributor[];
	demandPerDay: number;
	inventory: Partial<Record<MaterialId, number>>;
	warehouseCapacity: number;
	warehouseUsed: number;
	buildings: readonly SupplyPlannerBuildingSnapshot[];
	deliverableBuildingIds: readonly string[];
	disconnectedBuildingIds: readonly string[];
	activeOutboundRouteIds: readonly string[];
}
```

`demandPerDay` is the sum of all `effectiveDemandPerDay` contributors assigned to the supply city for the selected category, not merely the selected city's potential demand.

### Result states

```ts
export type SupplyPlannerResult =
	| { status: 'ready'; plan: SupplyPlan }
	| { status: 'empty'; reason: 'no-supported-products' }
	| { status: 'unavailable'; reason: 'retail-city-unavailable' | 'supply-city-unavailable' }
	| { status: 'unsupported'; reason: 'unsupported-category' | 'missing-producer-recipe' }
	| { status: 'invalid'; reason: 'invalid-request' };
```

A supported category with effective demand `0` is `ready` with bottleneck `none` and no-op reason `no-demand`.

## Demand model

### Potential demand

For each retail city assigned to the selected supply city, call `buildCityDemandPools(game, retailCity)` and read the requested category.

### Replenishment ceiling

The warehouse cannot refill a store faster than the current replenishment cadence permits. For each contributing retail city:

```text
replenishmentCeilingPerDay =
  sum(targetStock for stores in city selling category)
  / REPLENISHMENT_INTERVAL_DAYS

effectiveDemandPerDay = min(potentialDemandPerDay, replenishmentCeilingPerDay)
```

This is deliberately a **warehouse-draw ceiling**, not a sales forecast. It prevents the planner from recommending factory capacity that the current store targets cannot consume.

The UI surfaces both values. When the clamp is active, the explanation is equivalent to: potential demand is higher, but current store inventory targets/cadence can only draw approximately N units/day from supply.

Store-wide sales capacity can reduce realized sales further, but allocating shared store capacity across categories would turn HPA-281 into a retail optimizer. Keep that as an explicit limitation rather than inventing a per-category allocation rule.

### Shared supply-city demand

The selected retail city is not the only claimant. Aggregate effective demand from every retail city whose `retailSupplyAssignment.supplyCityId` equals the same supply city.

Keep contributor rows in the result so the player can see why the supply-city requirement is larger than the selected city's own demand.

## Requirement propagation

Propagate the aggregated finished-material requirement upstream through `MATERIAL_PRODUCER_RECIPES`.

Each requirement row carries `chainDepth`:

```ts
export interface SupplyMaterialRequirement {
	materialId: MaterialId;
	requiredPerDay: number;
	producerRecipeId: ProductionRecipeId | null;
	chainDepth: number;
}
```

Depth is `0` for the finished material and increases upstream. Shared upstream inputs are accumulated once.

For `missing-producer` ties, choose the **greatest chain depth first** (upstream-first), then stable material ID. This preserves the useful behavior of the current advisor without retaining the obsolete `AdvisorChain` API.

## Installed vs deliverable capacity

### Shared throughput helper

Product Chains remains the one throughput formula owner. Generalize its helper to accept readonly `{ typeId, level }` rows and add:

```ts
export function getMaterialOutputCapacityPerDay(
	buildings: readonly RecipeThroughputBuilding[],
	materialId: MaterialId
): number;
```

### Rail reachability

A producer that cannot push to any same-city warehouse must not count toward usable local capacity.

Expose one pure helper from the rail/shipping domain, shaped around existing rules, for example:

```ts
export interface WarehouseDeliveryReachability {
	deliverableBuildingIds: ReadonlySet<string>;
	disconnectedBuildingIds: readonly string[];
}

export function getWarehouseDeliveryReachability(
	game: GameState,
	cityId: WorldCityId
): WarehouseDeliveryReachability;
```

Implementation reuses the current network, building attach cells, warehouse attach cells, and shipping-path resolution. It does not create a second graph algorithm.

The planner exposes both:

- `installedCapacityPerDay` — every matching building;
- `deliverableCapacityPerDay` — only producer buildings with a warehouse shipping path.

Headline `localCapacityPerDay`, stockout, and import calculations use **deliverable** capacity.

HPA-281 only gates on path existence. It does not solve shared rail-capacity flow allocation across multiple producers. Surface that as a limitation; do not add a max-flow optimizer.

## Inventory, horizons, and warehouse evidence

For each material:

```text
requiredUnits = requiredPerDay × horizon
localAvailableUnits = startingInventory + deliverableCapacityPerDay × horizon
importRequiredUnits = max(0, requiredUnits - localAvailableUnits)
```

Expose 7-day and 30-day rows, days of cover, and projected stockout.

Warehouse evidence remains current-state evidence from `getCityInventoryStats`:

- used;
- capacity;
- free;
- overflow.

No projected warehouse-occupancy engine is introduced.

## Primary bottleneck

```ts
export type SupplyBottleneck =
	| { kind: 'missing-producer'; materialId: MaterialId; chainDepth: number }
	| { kind: 'warehouse-capacity'; overflowUnits: number; freeCapacity: number }
	| { kind: 'rail-disconnected'; buildingId: string; materialId: MaterialId }
	| { kind: 'production-capacity'; materialId: MaterialId; deficitPerDay: number }
	| { kind: 'inventory-cover'; materialId: MaterialId; stockoutDay: number }
	| { kind: 'import-reliance'; materialId: MaterialId; importedUnits30: number }
	| { kind: 'none' };
```

Priority:

1. upstream-most missing producer;
2. binding warehouse capacity;
3. disconnected producer that would otherwise contribute to a required material;
4. largest normalized deliverable production deficit;
5. earliest stockout;
6. largest 30-day import reliance;
7. none.

This prevents a disconnected factory from appearing as healthy surplus capacity.

## Logistics boundary

Recurring routes are not folded into `requiredPerDay`. Doing so accurately requires destination need, route cadence, priority, origin stock, in-transit reservations, and later event-modified effective route state—the exact HPA-297 contract.

HPA-281 instead detects active outbound recurring routes from the supply city that touch any required material and adds:

```ts
export type SupplyPlannerLimitation =
	| { kind: 'active-logistics-not-modeled'; routeIds: readonly string[] }
	| { kind: 'rail-capacity-not-modeled' }
	| { kind: 'store-sales-capacity-not-modeled' };
```

When `active-logistics-not-modeled` is present, the planner may show the retail-only baseline evidence but does not issue a capital recommendation based on incomplete inventory contention. The recommendation is typed no-op `logistics-contention-not-modeled` until HPA-297 replaces that guard with route-aware projection.

## Candidate actions

Keep `src/lib/game/supplyPlannerActions.ts` and target only the primary bottleneck.

```ts
export type SupplyPlannerAction =
	| { kind: 'build-producer'; materialId: MaterialId; buildingTypeId: IndustrialBuildingTypeId; cost: number }
	| { kind: 'upgrade-building'; materialId: MaterialId; buildingId: string; buildingTypeId: IndustrialBuildingTypeId; fromLevel: number; toLevel: number; cost: number }
	| { kind: 'build-warehouse'; buildingTypeId: 'warehouse'; cost: number }
	| { kind: 'connect-rail'; buildingId: string; materialId: MaterialId }
	| {
			kind: 'none';
			reason:
				| 'no-demand'
				| 'surplus'
				| 'unaffordable'
				| 'ineffective'
				| 'no-feasible-action'
				| 'action-unavailable'
				| 'logistics-contention-not-modeled';
	  };
```

`connect-rail` is not described as free. Its exact cost is path-dependent and is determined by the existing rail-build preview after navigation. It is a prerequisite recommendation, not a hypothetical capacity mutation.

Candidate mapping:

- `missing-producer` / `production-capacity` / `inventory-cover` / `import-reliance` → build/upgrade only for the bottleneck material;
- `warehouse-capacity` → warehouse build;
- `rail-disconnected` → connect that producer to the warehouse network;
- `none` → no investment.

## Feasibility and route capabilities

Candidate geometry and current action availability are separate inputs.

```ts
export interface SupplyPlannerActionAvailability {
	canBuildIndustry: boolean;
	canUpgradeIndustry: boolean;
	canBuildRail: boolean;
	allowedIndustryBuildingTypeIds: readonly IndustrialBuildingTypeId[];
}
```

`buildSupplyPlan` receives this availability from the route/controller boundary. A scenario-restricted or temporarily unavailable action cannot become the primary recommendation.

For build geometry:

1. create a supply-city-scoped game view;
2. call `createIndustrialPlacementContext` once;
3. scan tiles with `getIndustrialPlacementBlockReasonWithContext` using that context.

Do not call `getIndustrialPlacementBlockReason` once per tile.

## Hypothetical actions

Build/upgrade/warehouse candidates apply to a copied snapshot and rerun the same projector.

- build producer: append a level-1 snapshot row; deliverability remains false until a rail path would exist, so a new producer that cannot reach a warehouse does not get imaginary delivered capacity;
- upgrade: increment the target snapshot building level;
- build warehouse: add warehouse capacity and then recompute local reachability assumptions only if the current rail network already attaches the new placement is not known; therefore hypothetical warehouse comparison is limited to headroom gain, not invented topology;
- connect rail: no hypothetical path is invented; recommendation navigates to real rail build mode.

## Comparison and 30-day economics

Unit improvements are necessary but not sufficient. Material investments also get an expected 30-day cash comparison.

```ts
export interface SupplyPlannerComparison {
	shortageReduction7: number;
	shortageReduction30: number;
	importReduction30: number;
	importSpendReduction30: number;
	incrementalOperatingCost30: number;
	incrementalInputImportSpend30: number;
	netCashBenefit30: number;
	stockoutImprovementDays: number;
	warehouseFreeGain: number;
}
```

For the **primary bottleneck material only**:

```text
importSpendReduction30 =
  targetMaterialImportReductionUnits30 × MATERIALS[target].importCost

incrementalRecipeOperatingCost30 =
  positiveThroughputDelta × producerRecipe.operatingCost × 30

incrementalFlatOperatingCost30 =
  build-producer ? buildingType.dailyOperatingCost × 30 : 0

incrementalInputImportSpend30 =
  sum(
    additionalInputUnits30
    × baselineInputImportShare
    × MATERIALS[input].importCost
  )

netCashBenefit30 =
  importSpendReduction30
  - actionUpfrontCost
  - incrementalRecipeOperatingCost30
  - incrementalFlatOperatingCost30
  - incrementalInputImportSpend30
```

This is an expected planning estimate, not a full company cash forecast. It intentionally does not model timed import-cost modifiers or logistics costs. The UI labels it as an estimate and lists those limitations.

The extra input-import term avoids claiming that a downstream producer is profitable simply because its output import price is high while all of its inputs would still be imported.

### Ranking

- `rail-disconnected` → if rail building is currently available, recommend `connect-rail`; otherwise no-op `action-unavailable`.
- `warehouse-capacity` → affordable + feasible warehouse first, then larger headroom gain, then lower cost.
- material bottlenecks → affordable + feasible candidates first, then **larger positive `netCashBenefit30`**, then shortage reduction 30, shortage reduction 7, import reduction, stockout improvement, lower cost, stable action key.

If every feasible affordable material investment has `netCashBenefit30 <= 0`, recommend no-op `ineffective` / preserving cash. This satisfies the ticket's requirement that recommendation reacts to import cost, action cost, and affordability rather than only units.

## UI

Keep `SupplyAdvisor.svelte` and show:

- selected retail city/category;
- configured supply city;
- selected-city potential demand;
- selected-city replenishment ceiling/effective demand;
- other retail demand contributors sharing the supply city;
- installed vs deliverable local capacity;
- 7/30-day inventory/import evidence;
- primary bottleneck;
- rail-disconnected explanation when applicable;
- estimated 30-day import savings, incremental costs, and net cash benefit for material recommendations;
- warehouse headroom evidence;
- explicit limitations, especially active outbound logistics;
- baseline vs hypothetical action comparison;
- no-demand/empty/unavailable/unsupported states.

No charting dependency.

## Navigation

Planner actions never commit.

- build producer / warehouse → switch to the supply-city industry map and arm existing placement;
- upgrade → select the existing building and let the inspector own Upgrade;
- connect rail → switch to the supply-city industry map and enter existing rail routing with the disconnected building as the origin; the player chooses/confirms the real path and cost;
- no-op → no navigation.

Before navigation, re-check the action against current `SupplyPlannerActionAvailability`. A stale/restricted action stays in the planner with an unavailable explanation rather than silently doing nothing.

## Derivation lifetime

Preserve the current optimization:

```ts
let supplyPlannerResult = $derived.by(() => {
	if (!isSupplyAdvisorOpen || !game || !selectedCategoryId) return null;
	return buildSupplyPlan(...);
});
```

Do not continuously rebuild rail topology, demand contributors, placement contexts, and candidates while the modal is closed.

## Error / edge-state rules

- no supported sold category → `empty/no-supported-products`;
- zero effective demand → ready + no-op `no-demand`;
- invalid retail city / missing configured supply → typed unavailable;
- authoritative inventory corruption → invariant exception, not normal UX;
- disconnected required producer → `rail-disconnected` and deliverable capacity excludes it;
- multiple retail cities sharing supply → all are included as contributors;
- active outbound inter-city logistics touching required materials → show retail-only evidence + suppress capital recommendation with explicit limitation;
- store target/cadence clamp active → show both potential and effective demand;
- no profitable/feasible/currently-allowed investment → no-op;
- no save schema or compatibility adapter.

## Testing

### Node

`supplyPlanner.spec.ts` covers:

- potential-demand → replenishment-ceiling clamp;
- multiple retail demand contributors sharing one supply city;
- selected-city vs total supply-city demand evidence;
- upstream requirement propagation and shared inputs;
- upstream-first missing-producer tie-break;
- real/lightweight Product Chains throughput parity;
- installed vs rail-deliverable capacity;
- disconnected producer → zero deliverable contribution + `rail-disconnected`;
- 7/30 horizons, stockout, import reliance, warehouse evidence;
- active outbound logistics limitation without route forecasting;
- zero-demand ready state;
- invariant boundary and deep immutability.

`supplyPlannerActions.spec.ts` covers:

- primary-bottleneck-only candidates;
- action availability/scenario restrictions;
- hoisted placement context behavior;
- rail-disconnected → connect-rail recommendation;
- warehouse pressure → warehouse recommendation;
- import-price change alters cash comparison/recommendation;
- daily/recipe operating cost can make no-op beat a producer;
- imported-input cost is included in producer economics;
- no-op for unavailable/unaffordable/ineffective/logistics-contention states;
- deterministic ties.

### Component / route

- planner result is derived only while the modal is open;
- demand clamp/contributor evidence renders;
- rail and cash explanations render;
- Product Chains opens the selected category;
- build/upgrade/warehouse/rail navigation does not mutate before confirmation;
- restricted actions are not actionable recommendations.

### E2E

Use deterministic current-schema save injection through the existing `serpens.saves.v2` local-storage pattern in `retail-sim.e2e.ts`, then reload. Do not advance an arbitrary number of days hoping to obtain a warehouse/rail fixture.

At minimum cover one deterministic planner lifecycle that proves a constrained state, recommendation, navigation, cancel/return, and retained planner context. Include the warehouse recommendation path required by the earlier review; add rail-disconnected navigation if the injected fixture can keep the case focused without turning one E2E into a broad rail-system test.

## KISS / YAGNI guardrails

- no cloned 30-day simulation;
- no max-flow rail optimizer; path existence only;
- no inter-city route scheduler in HPA-281;
- no in-transit forecast;
- no generic optimizer/DSL/causal graph;
- no global planner store/router/event bus;
- no automatic mutations;
- no financing optimizer;
- no charts;
- no save-schema change;
- no compatibility shim for `AdvisorChain`;
- reuse Product Chains, city-inventory, retail-supply, rail, placement, and route capability boundaries before adding helpers.

## Review resolution

The follow-up review is incorporated with two bounded deviations:

1. **Recurring-route outflow is not forecast in HPA-281.** That would duplicate HPA-297's explicit route projection contract. Instead HPA-281 detects relevant active outbound logistics, labels the baseline incomplete, and suppresses capital recommendations until HPA-297 can model the contention correctly.
2. **Cash comparison is not just build cost + flat daily cost.** The estimate also includes recipe operating cost and expected imported-input spend so it does not systematically favor downstream factories whose inputs remain imports.

Everything else from the review is accepted: rail-deliverable capacity, shared retail claimants, replenishment ceiling, upstream-first missing-producer selection, action-availability gates, hoisted placement context, `getIndustryInventoryScope`/category-helper reuse, closed-modal derivation gating, deterministic save injection, and focused lint/verification in the implementation plan.