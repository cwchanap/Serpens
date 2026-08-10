# Capacity-Aware Supply Planner and 30-Day Forecast — Design

**Linear:** HPA-281 — Implement the capacity-aware Supply Planner and 30-day forecast

## Outcome

Replace the current building-presence Supply Advisor with a deterministic local-network planner that answers four questions for a selected finished product:

1. How much supply can the current retail configuration actually draw?
2. What is the primary local bottleneck?
3. What happens over 7 and 30 days if nothing changes?
4. What is the best currently actionable build, upgrade, rail, warehouse, or no-op response, and what is the economic tradeoff?

The planner is advisory only. It never mutates live game state, advances RNG, autosaves, builds, upgrades, or lays rail. Existing placement, rail-build, and inspector flows remain the mutation boundary.

## Architecture stays the same

Keep the approved shape:

```text
GameState
  ↓
pure supply snapshot
  ↓
7/30-day projection + one primary bottleneck
  ↓
primary-bottleneck candidates
  ↓
comparison/ranking
  ↓
SupplyAdvisor UI → existing action workflow
```

Use two planner modules only:

- `supplyPlanner.ts` — request/result contracts, demand contributors, upstream requirements, local reachability, projection, limitations, primary bottleneck.
- `supplyPlannerActions.ts` — current action availability, candidates, hypothetical comparison, economic estimate, ranking.

Do not add a replay engine, optimizer framework, planner store, event bus, worker, save state, or route scheduler.

## Why the model needs the follow-up corrections

The original expected-value approach is still preferable to cloning `simulateDay`, but four existing simulation facts must be reflected or the headline numbers become misleading:

1. **Intra-city rail is part of local production delivery.** Producers and processors exchange material through the current rail network; finished output reaches retail supply through warehouse delivery.
2. **One industry inventory can serve several retail cities.** The selected retail city is UI context, not the full demand boundary.
3. **Warehouse draw is bounded by retail replenishment cadence/targets.** `buildCityDemandPools` is potential demand, not automatic daily inventory draw.
4. **Units alone cannot rank investments.** Import value, build/upgrade cost, recipe operating cost, flat building operating cost, and imported-input exposure matter.

These corrections fit inside the same modules and do not require simulation replay.

## Scope boundary with HPA-297

HPA-281 models current **local** production/inventory/retail facts. It does not predict:

- future recurring-route dispatch quantities;
- route priority/contention;
- in-transit arrivals;
- event-modified route capacity/lead time/cost;
- inter-city action candidates.

If an active outbound recurring route originates at the modeled supply city and touches a required material, HPA-281 shows a typed `active-logistics-not-modeled` limitation and suppresses capital recommendations. HPA-297 later replaces that conservative guard with route-aware projection.

This is intentionally different from pretending route outflow is zero or reimplementing HPA-297 early.

---

## Reuse map

### Retail demand and category identity

From `stock.ts`:

- `buildCityDemandPools(game, city)` — deterministic potential demand;
- `getFinishedMaterialIdForCategory(categoryId)` — category → finished material.

From `retailSupply.ts`:

- `REPLENISHMENT_INTERVAL_DAYS` — authoritative weekly cadence.

From Product Chains:

- `getSupportedStoreChainCategories(store)` — supported carried categories;
- `MATERIAL_PRODUCER_RECIPES` — one-producer-recipe mapping;
- `getIndustryInventoryScope(game, cityId)` — city-scoped inventory/buildings/report;
- `buildingsForRecipe` / `getRecipeThroughputUnits` — throughput formula owner.

### Inventory

From `cityInventory.ts`:

- `getCityInventoryStats` for capacity/used/overflow after successful scope resolution;
- invariant failures remain exceptions rather than being translated to normal planner UX.

### Rail

From `rail.ts` / `railShipping.ts`:

- `buildRailNetwork`;
- `createRailBudget`;
- `getBuildingAttachCellKeys`;
- `findShippingPath`;
- the same building/warehouse attachment semantics used by `pullViaRail` and `pushSurplusViaRail`.

HPA-281 may add a small pure required-chain reachability selector, but it does not add another pathfinder or shared-capacity flow solver.

### Costs/actions

From `industry.ts` / `leveling.ts`:

- material import costs for industrial inputs;
- recipe operating cost;
- building build cost and daily flat operating cost;
- throughput multiplier, upgrade cost, upgrade eligibility.

From `industryPlacement.ts`:

- `createIndustrialPlacementContext` once per candidate scan;
- `getIndustrialPlacementBlockReasonWithContext` per tile.

From the route:

- `canStartIndustryExpansion`;
- `mutationAvailability.upgradeIndustrialBuilding`;
- `mutationAvailability.buildRail`;
- `allowedIndustryBuildingTypeIds`.

---

## Public planner contracts

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
	retailImportCostPerUnit: number;
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
	finishedImportCostPerUnit: number;
	inventory: Partial<Record<MaterialId, number>>;
	warehouseCapacity: number;
	warehouseUsed: number;
	buildings: readonly SupplyPlannerBuildingSnapshot[];
	usableBuildingIds: readonly string[];
	disconnectedBuildingIds: readonly string[];
	activeOutboundRouteIds: readonly string[];
}
```

A ready snapshot always has a usable supply city. Missing/null/unavailable supply resolves before snapshot construction.

### Result union

```ts
export type SupplyPlannerResult =
	| { status: 'ready'; plan: SupplyPlan }
	| { status: 'empty'; reason: 'no-supported-products' }
	| { status: 'unavailable'; reason: 'retail-city-unavailable' | 'supply-city-unavailable' }
	| { status: 'unsupported'; reason: 'unsupported-category' | 'missing-producer-recipe' }
	| { status: 'invalid'; reason: 'invalid-request' };
```

A supported category with effective demand `0` remains `ready`; it produces bottleneck `none` and no-op `no-demand`.

---

## Demand model

### Selected-city context vs supply-city requirement

The selected retail city determines which product the player is examining. The supply city determines the shared inventory/capacity boundary.

After resolving the selected retail city's supply assignment, include every opened/generated retail city whose assignment points to that same supply city and which sells the requested category.

Keep one contributor row per retail city so the UI can explain total supply-city demand.

### Potential demand

For each contributor:

```text
potentialDemandPerDay = buildCityDemandPools(game, retailCity)[categoryId] ?? 0
```

No RNG is consumed.

### Replenishment ceiling

For stores in the contributor city that sell the category:

```text
replenishmentCeilingPerDay =
  sum(product.targetStock)
  / REPLENISHMENT_INTERVAL_DAYS

effectiveDemandPerDay =
  min(potentialDemandPerDay, replenishmentCeilingPerDay)
```

This is an upper bound on average warehouse draw under the current target/cadence contract, not a claim that each week always consumes the full target. It corrects the systematic overstatement from equating city potential demand with supply draw.

When the clamp is active, the UI explicitly shows potential demand and current target/cadence-limited demand.

### Retail import cost basis

Do **not** use `MATERIALS[finishedMaterialId].importCost` for finished-product retail fallback. Retail categories own their own `ProductCategory.importCost` and these values are not guaranteed to equal material import cost.

For each contributor, derive `retailImportCostPerUnit` from the category definitions of stores that carry the product, weighted by their target-stock share when more than one distinct category definition exists.

The snapshot's `finishedImportCostPerUnit` is the effective-demand-weighted average across contributors.

Industrial upstream material imports continue to use `MATERIALS[materialId].importCost`.

### Store sales capacity limitation

The real sales pass also shares store sales capacity across categories. Allocating that capacity per category would require a second retail optimization model. HPA-281 therefore exposes `store-sales-capacity-not-modeled` rather than inventing an allocation rule.

---

## Demand → upstream requirements

```ts
export interface SupplyMaterialRequirement {
	materialId: MaterialId;
	requiredPerDay: number;
	producerRecipeId: ProductionRecipeId | null;
	chainDepth: number;
}
```

- finished material depth = `0`;
- depth increases moving upstream;
- shared upstream material quantities are accumulated into one row;
- if reached through several branches, retain the maximum depth.

Use `MATERIAL_PRODUCER_RECIPES`; do not retain the old `AdvisorChain` API just for ordering.

### Missing producer ordering

When several required materials have no installed producer, the primary missing-producer bottleneck is:

1. greatest `chainDepth` first (upstream-first);
2. code-unit material ID tie-break.

This preserves the useful topological intent of the old advisor while deleting its obsolete presence-check contract.

---

## Installed vs usable local capacity

Product Chains remains the throughput formula owner.

Generalize existing helpers to accept readonly `{ typeId, level }` rows and add material-specific output capacity:

```ts
export function getMaterialOutputCapacityPerDay(
	buildings: readonly RecipeThroughputBuilding[],
	materialId: MaterialId
): number;
```

### Required-chain rail reachability

The literal rule “every producer must reach a warehouse” is too broad. Live production also allows processors to pull directly from producer buffers.

HPA-281 therefore evaluates **path existence along the required product chain**:

- a finished-material producer is usable when it has a current rail path to at least one same-city warehouse;
- a raw/intermediate producer is usable when it has a current rail path to at least one **usable downstream processor** that consumes that material;
- downstream usability recursively terminates at a finished producer that can reach a warehouse;
- if a downstream producer does not exist, the higher-priority `missing-producer` bottleneck handles that structural gap before rail-disconnection is considered.

Implementation uses the current rail network, a fresh positive budget, building attach cells, and `findShippingPath`. It never consumes that budget because this selector answers **connectivity**, not throughput allocation.

```ts
export interface RequiredChainReachability {
	usableBuildingIds: ReadonlySet<string>;
	disconnectedBuildingIds: readonly string[];
}

export function getRequiredChainReachability(input: {
	game: GameState;
	cityId: WorldCityId;
	finishedMaterialId: MaterialId;
	requirements: readonly SupplyMaterialRequirement[];
}): RequiredChainReachability;
```

Keep this selector in the planner/rail boundary; do not introduce a new subsystem.

### Capacity fields

Each material forecast exposes:

- `installedCapacityPerDay` — all matching producer buildings;
- `usableCapacityPerDay` — only required-chain-reachable producer buildings.

Headline stockout/import calculations use `usableCapacityPerDay`.

### Explicit rail-capacity limitation

Path existence is not path throughput. Rail cell levels are shared daily budgets consumed by pulls/pushes. HPA-281 does not solve multi-commodity rail flow/max-flow; include `rail-capacity-not-modeled` in limitations.

---

## Projection

For each requirement and horizon:

```text
requiredUnits = requiredPerDay × horizon
localAvailableUnits = startingInventory + usableCapacityPerDay × horizon
importRequiredUnits = max(0, requiredUnits - localAvailableUnits)
```

Expose 7-day and 30-day rows, days of cover, projected stockout, installed/usable capacity, and current inventory.

Warehouse evidence stays current-state only:

- capacity;
- used;
- free;
- overflow.

No projected warehouse occupancy engine.

---

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

Order:

1. upstream-most missing producer;
2. binding warehouse capacity;
3. required producer disconnected from its usable downstream sink;
4. largest normalized usable-capacity deficit;
5. earliest stockout;
6. largest 30-day import reliance;
7. none.

For rail-disconnected ties, prefer deepest material then code-unit building ID.

---

## Logistics limitation

Do not add recurring-route outflow to `requiredPerDay`. Accurate route projection needs cadence, destination need, route priority, origin stock, in-transit reservations, and later effective event state.

Detect active recurring routes whose:

- state is active;
- origin is the modeled supply city;
- material is in the required-material set.

Add:

```ts
export type SupplyPlannerLimitation =
	| { kind: 'active-logistics-not-modeled'; routeIds: readonly string[] }
	| { kind: 'rail-capacity-not-modeled' }
	| { kind: 'store-sales-capacity-not-modeled' };
```

When active logistics touches the modeled requirement set, show retail-only evidence but suppress capital recommendation with no-op `logistics-contention-not-modeled`.

---

## Candidate actions

```ts
export interface SupplyPlannerActionAvailability {
	canBuildIndustry: boolean;
	canUpgradeIndustry: boolean;
	canBuildRail: boolean;
	allowedIndustryBuildingTypeIds: readonly IndustrialBuildingTypeId[];
}

export type SupplyPlannerAction =
	| { kind: 'build-producer'; materialId: MaterialId; buildingTypeId: IndustrialBuildingTypeId; cost: number }
	| {
			kind: 'upgrade-building';
			materialId: MaterialId;
			buildingId: string;
			buildingTypeId: IndustrialBuildingTypeId;
			fromLevel: number;
			toLevel: number;
			cost: number;
	  }
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

Candidate generation targets **only the primary bottleneck**.

- missing producer / production capacity / inventory cover / import reliance → producer build/upgrade for that material only;
- warehouse → warehouse build;
- rail disconnected → connect that existing building;
- none → no investment.

### Current-action availability

Scenario/pending/content restrictions are part of feasibility. A route action that would currently be silently rejected cannot become the primary recommendation.

### Placement scan

For each build candidate:

1. scope game to the supply industry city;
2. create `IndustrialPlacementContext` once;
3. scan tiles with `getIndustrialPlacementBlockReasonWithContext`;
4. collect whether at least one valid placement is already rail-ready toward a usable downstream sink.

Do not rebuild placement context per tile.

---

## Hypothetical action behavior

### Existing producer upgrade

Increment level in a copied snapshot. Because an existing disconnected building is classified as `rail-disconnected` before capacity, upgrades are compared only for existing usable producer capacity.

### Warehouse build

Add authoritative warehouse capacity in the copied snapshot. Do not invent a warehouse rail attachment or projected occupancy.

### Connect rail

Do not create a hypothetical path. The action hands the player to existing rail routing, where the real path and cost are chosen.

### New producer build: prerequisite + rail uncertainty

A new producer does not yet have coordinates, so its future rail delivery cannot always be known.

Candidate feasibility therefore records:

```ts
export interface SupplyBuildFeasibility {
	hasValidPlacement: boolean;
	hasRailReadyPlacement: boolean;
}
```

- if at least one valid placement is already rail-ready to the required downstream sink, the hypothetical build may count that new capacity as usable;
- otherwise the hypothetical projection must **not** invent usable delivered capacity;
- a missing-producer build is still a legitimate structural prerequisite because rail cannot be connected to a building that does not exist yet.

For a missing-producer bottleneck with no rail-ready placement, recommendation uses conservative **pre-rail economics** (below): if known economics are already non-positive before adding any rail cost, recommend no-op; if they are positive, recommend the prerequisite build with an explicit `requiresRailConnection` warning and no claim of completed ROI. After placement, the planner can diagnose `rail-disconnected` and recommend connection.

For non-missing capacity bottlenecks, prefer complete/rail-ready upgrade/build comparisons over a new build whose rail cost is unresolved.

---

## Economic comparison

Unit improvement remains visible, but material investment ranking needs cash evidence.

```ts
export interface SupplyPlannerComparison {
	shortageReduction7: number;
	shortageReduction30: number;
	importReduction30: number;
	importSpendReduction30: number;
	incrementalOperatingCost30: number;
	incrementalInputImportSpend30: number;
	preRailNetCashBenefit30: number;
	netCashBenefit30: number | null;
	requiresRailConnection: boolean;
	stockoutImprovementDays: number;
	warehouseFreeGain: number;
}
```

### Import-spend basis

For the finished material:

```text
avoided import unit value = snapshot.finishedImportCostPerUnit
```

For upstream raw/intermediate material:

```text
avoided import unit value = MATERIALS[materialId].importCost
```

This prevents using the industrial material import price as a substitute for the retail fallback import price.

### Incremental production costs

For build/upgrade candidates:

```text
importSpendReduction30 =
  targetImportReductionUnits30 × avoidedImportUnitValue

incrementalRecipeOperatingCost30 =
  positiveThroughputDelta × recipe.operatingCost × 30

incrementalFlatOperatingCost30 =
  new building ? buildingType.dailyOperatingCost × 30 : 0

incrementalInputImportSpend30 =
  Σ(additionalInputUnits30 × baselineInputImportShare × MATERIALS[input].importCost)

preRailNetCashBenefit30 =
  importSpendReduction30
  - upfront action cost
  - incrementalRecipeOperatingCost30
  - incrementalFlatOperatingCost30
  - incrementalInputImportSpend30
```

If the candidate is rail-ready / existing usable capacity:

```text
netCashBenefit30 = preRailNetCashBenefit30
```

If a new producer needs a future rail connection:

```text
netCashBenefit30 = null
```

because exact path cost is not known until the player chooses placement/path. The UI shows `preRailNetCashBenefit30` as **before rail cost**, never as final net benefit.

This is still an expected estimate. Timed event multipliers, route costs, rail shared-capacity effects, and full-company cash flow are explicitly excluded.

---

## Ranking

Before ranking, if relevant active logistics exists, return no-op `logistics-contention-not-modeled`.

### Rail bottleneck

- if rail build is currently available → `connect-rail`;
- otherwise → no-op `action-unavailable`.

### Warehouse bottleneck

Affordable + feasible warehouse with positive headroom wins; ties by lower cost then stable key.

### Material bottleneck

1. current action allowed;
2. geometric feasibility;
3. affordability;
4. complete (`netCashBenefit30 !== null`) positive-economic candidates before incomplete rail-cost candidates;
5. among complete candidates: larger `netCashBenefit30`;
6. among incomplete candidates: larger positive `preRailNetCashBenefit30`;
7. shortage reduction 30;
8. shortage reduction 7;
9. import reduction;
10. stockout improvement;
11. lower known action cost;
12. stable key.

If every complete candidate has non-positive net benefit and every incomplete candidate has non-positive pre-rail benefit, recommend no-op `ineffective`.

A missing producer with positive pre-rail economics but unresolved rail cost may be recommended as the **next prerequisite**, with explicit warning that rail cost can still make final ROI unattractive.

---

## UI

Keep `SupplyAdvisor.svelte` and show:

- selected retail city/category;
- configured supply city;
- potential, replenishment-ceiling, and effective selected-city demand;
- other retail claimant rows;
- weighted retail fallback import cost for the finished product;
- installed vs usable local capacity;
- 7/30-day requirement, stock, stockout, and imports;
- primary bottleneck;
- rail disconnection / warehouse pressure;
- known 30-day import savings and incremental production costs;
- final net cash estimate when complete, or **pre-rail** estimate + warning when rail cost is unknown;
- active-logistics and rail/store-capacity limitations;
- baseline vs action evidence;
- explicit empty/unavailable/no-demand/no-op states.

No chart dependency.

---

## Navigation

Recommendations navigate without committing:

- producer / warehouse build → existing industry placement;
- upgrade → existing building inspector;
- connect rail → existing rail routing with disconnected building selected as origin;
- no-op → nothing.

For rail connection, do not call it free. Rail cost remains `RAIL_BUILD_COST_PER_CELL × new cells` through the current rail preview/commit workflow.

Re-check action availability immediately before handoff. Stale/restricted actions remain visible as unavailable rather than silently doing nothing.

---

## Derivation lifetime

Preserve the existing advisor gate:

```ts
let supplyPlannerResult = $derived.by(() => {
	if (!isSupplyAdvisorOpen || !game || !effectivePlannerCategoryId) return null;
	return buildSupplyPlan(game, request, plannerActionAvailability);
});
```

Do not rebuild demand contributors, rail reachability, or placement candidates while the modal is closed.

---

## Testing requirements

### Domain

Cover:

- zero demand remains ready;
- target/cadence clamp;
- multiple retail cities sharing one supply inventory;
- correct finished retail import-cost basis;
- city-scoped reuse through `getIndustryInventoryScope`;
- upstream requirement aggregation/depth;
- upstream-first missing-producer choice;
- Product Chains throughput parity;
- direct producer→processor rail path counts for upstream local capacity;
- finished producer requires a warehouse path;
- disconnected required chain produces `rail-disconnected`;
- rail path capacity remains an explicit limitation;
- 7/30 horizons / stockout / imports / warehouse evidence;
- active outbound route limitation without route prediction;
- route/scenario action availability;
- hoisted placement context;
- warehouse recommendation;
- connect-rail recommendation;
- complete vs pre-rail economic estimates;
- industrial input import costs and retail finished import cost;
- no-op when known economics are non-positive;
- immutability and code-unit deterministic ties.

### Component/route

Cover demand contributors/clamp, rail states, economic-estimate completeness, limitations, category/horizon state, Product Chains callback, closed-modal calculation gate, and non-mutating build/upgrade/warehouse/rail handoffs.

### E2E

Use the existing deterministic current-schema browser-save injection helper in `retail-sim.e2e.ts`; do not advance arbitrary days hoping to create a fixture.

Required flow: injected warehouse-pressure state → planner → Build Warehouse → industry placement → cancel → reopen → retained category/horizon context.

A focused rail-disconnected handoff can remain route/component coverage if adding it to the same E2E would turn the test into a broad rail-system test.

---

## KISS / YAGNI guardrails

- no `simulateDay` forecast replay;
- no rail max-flow/shared-budget optimizer;
- no recurring-route scheduler/in-transit forecast;
- no generic solver/DSL/causal graph;
- no global planner store/router/event bus;
- no automatic mutations;
- no financing optimizer;
- no charts;
- no save schema;
- no `AdvisorChain` compatibility shim;
- one required-chain connectivity selector only, using existing rail primitives;
- incomplete future rail economics are labeled incomplete rather than guessed.

## Review resolution

The follow-up review is accepted where it describes current HPA-281 facts: shared retail claimants, replenishment ceiling, rail-dependent local usefulness, cash-sensitive ranking, upstream-first missing producer, route/scenario action gates, hoisted placement context, existing Product Chains/scope reuse, closed-modal derivation gating, deterministic save injection, and earlier focused lint.

Three implementation details are deliberately refined rather than copied literally:

1. **Rail:** upstream producers do not always need a warehouse path because processors can pull directly from producer buffers. Reachability therefore follows the required chain to a final warehouse; no max-flow model is added.
2. **Inter-city outflow:** HPA-281 detects relevant active routes and suppresses recommendation rather than reimplementing HPA-297's future route scheduler.
3. **Economics:** finished retail imports use retail category import cost, and production economics include recipe + flat operating cost + expected imported-input cost. New producers with unresolved future rail cost expose pre-rail economics rather than a false final ROI.