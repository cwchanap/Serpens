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

The expected-value approach remains preferable to cloning `simulateDay`, but four existing simulation facts must be reflected or the headline numbers become misleading:

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

If an active outbound recurring route originates at the modeled supply city and touches a required material, HPA-281 shows `active-logistics-not-modeled` and suppresses capital recommendations. HPA-297 later replaces that conservative guard with route-aware projection.

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
- invariant failures remain exceptions rather than becoming normal planner UX.

### Rail

From `rail.ts` / `railShipping.ts`:

- `buildRailNetwork`;
- `createRailBudget`;
- `getBuildingAttachCellKeys`;
- `findShippingPath`;
- the same building/warehouse attachment semantics used by `pullViaRail` and `pushSurplusViaRail`.

HPA-281 adds one small pure required-chain reachability selector. It does not add another pathfinder or shared-capacity flow solver.

### Costs/actions

From `industry.ts` / `leveling.ts`:

- industrial material import costs;
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
	usableSinkBuildingIdsByMaterial: Partial<Record<MaterialId, readonly string[]>>;
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

This is an upper bound on average warehouse draw under the current target/cadence contract, not a claim that each week always consumes the full target.

A sold category whose total target stock is `0` is still a valid contributor with ceiling/effective demand `0`; do not drop it from the selected planner context.

### Retail import cost basis

Do **not** use `MATERIALS[finishedMaterialId].importCost` for finished-product retail fallback. Retail categories own their own `ProductCategory.importCost`, and current values are not guaranteed to equal material import cost.

For each contributor:

- when total target stock is positive, weight category import cost by each store product's target-stock share;
- when total target stock is zero, use a deterministic arithmetic average of the carried category definitions (code-unit store order) because the price is evidence only and no units are currently drawable.

The snapshot's `finishedImportCostPerUnit` is effective-demand-weighted across contributors. When total effective demand is zero, use the selected contributor's deterministic `retailImportCostPerUnit`.

Industrial upstream imports continue to use `MATERIALS[materialId].importCost`.

### Store sales capacity limitation

The real sales pass also shares store sales capacity across categories. Allocating that capacity per category would require another retail optimization model. HPA-281 exposes `store-sales-capacity-not-modeled` instead of inventing an allocation rule.

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
- if reached through several branches, retain maximum depth.

Use `MATERIAL_PRODUCER_RECIPES`; do not retain `AdvisorChain` just for ordering.

### Missing producer ordering

When several required materials have no installed producer:

1. greatest `chainDepth` first (upstream-first);
2. code-unit material ID tie-break.

This preserves the useful topological intent of the old advisor without preserving its obsolete API.

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

The literal rule “every producer must reach a warehouse” is too broad. Live processors can pull directly from producer buffers.

HPA-281 evaluates **path existence along the required product chain**:

- a finished-material producer is usable when it has a current rail path to at least one same-city warehouse;
- a raw/intermediate producer is usable when it has a current rail path to at least one **usable downstream processor** that consumes that material;
- downstream usability recursively terminates at a finished producer that can reach a warehouse;
- if a downstream producer does not exist, higher-priority `missing-producer` handles the structural gap before rail-disconnection is considered.

Implementation uses the current network, fresh positive budget, attach cells, and `findShippingPath`. It never consumes that budget because this selector answers connectivity only.

```ts
export interface RequiredChainReachability {
	usableBuildingIds: ReadonlySet<string>;
	disconnectedBuildingIds: readonly string[];
	usableSinkBuildingIdsByMaterial: Partial<Record<MaterialId, readonly string[]>>;
}

export function getRequiredChainReachability(input: {
	game: GameState;
	cityId: WorldCityId;
	finishedMaterialId: MaterialId;
	requirements: readonly SupplyMaterialRequirement[];
}): RequiredChainReachability;
```

`usableSinkBuildingIdsByMaterial` is retained in the snapshot because Task 3 needs the same downstream-sink set to determine whether a prospective building placement is already rail-ready. Do not recompute a second reachability model in the action module.

### Capacity fields

Each material forecast exposes:

- `installedCapacityPerDay` — all matching producer buildings;
- `usableCapacityPerDay` — only required-chain-reachable producer buildings.

Headline stockout/import calculations use `usableCapacityPerDay`.

### Explicit rail-capacity limitation

Path existence is not path throughput. Rail cell levels are shared daily budgets consumed by pulls/pushes. HPA-281 does not solve multi-commodity rail flow/max-flow; include `rail-capacity-not-modeled`.

---

## Projection

For each requirement and horizon:

```text
requiredUnits = requiredPerDay × horizon
localAvailableUnits = startingInventory + usableCapacityPerDay × horizon
importRequiredUnits = max(0, requiredUnits - localAvailableUnits)
```

Expose 7/30 rows, days of cover, projected stockout, installed/usable capacity, and current inventory.

Warehouse evidence stays current-state only: capacity, used, free, overflow. No projected occupancy engine.

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

Rail ties prefer deepest material then code-unit building ID.

---

## Logistics limitation

Do not add recurring-route outflow to `requiredPerDay`. Accurate route projection needs cadence, destination need, route priority, origin stock, in-transit reservations, and later effective event state.

Detect active recurring routes whose state is active, origin is the modeled supply city, and material is in the required set.

```ts
export type SupplyPlannerLimitation =
	| { kind: 'active-logistics-not-modeled'; routeIds: readonly string[] }
	| { kind: 'rail-capacity-not-modeled' }
	| { kind: 'store-sales-capacity-not-modeled' };
```

When relevant active logistics exists, show retail-only evidence but suppress capital recommendation with no-op `logistics-contention-not-modeled`.

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

Generate candidates only for the primary bottleneck:

- material bottleneck → producer build/upgrade for that material;
- warehouse → warehouse build;
- rail disconnected → connect that existing building;
- none → no investment.

### Current-action availability

Scenario/pending/content restrictions are part of feasibility. An action the route would currently refuse cannot become the primary recommendation.

### Placement scan

For each build candidate:

1. scope game to supply industry city;
2. create `IndustrialPlacementContext` once;
3. scan tiles with `getIndustrialPlacementBlockReasonWithContext`;
4. record whether at least one valid placement is already rail-ready to a sink in `usableSinkBuildingIdsByMaterial[materialId]`.

Do not rebuild placement context per tile.

---

## Hypothetical action behavior

### Existing producer upgrade

Increment level in a copied snapshot. Existing disconnected buildings are classified as `rail-disconnected` first, so capacity upgrades compare only usable producer capacity.

### Warehouse build

Add authoritative warehouse capacity in the copied snapshot. Do not invent warehouse topology or projected occupancy.

### Connect rail

Do not create a hypothetical path. Handoff to existing rail routing, where real path and cost are chosen.

### New producer build: prerequisite + rail uncertainty

A new producer has no coordinates yet, so future rail delivery may be incomplete.

```ts
export interface SupplyBuildFeasibility {
	hasValidPlacement: boolean;
	hasRailReadyPlacement: boolean;
}
```

- if a valid placement is already rail-ready to the required sink, the hypothetical build can count new capacity as usable;
- otherwise the normal hypothetical projection must not invent usable delivered capacity;
- a missing producer is still a real prerequisite because rail cannot be connected to a building that does not yet exist.

For a missing-producer bottleneck with no rail-ready placement, use conservative **pre-rail economics**: if known economics are already non-positive before any rail cost, recommend no-op; if positive, the build may be recommended as the next prerequisite with `requiresRailConnection` and no final ROI claim. After placement, `rail-disconnected` can become the next bottleneck.

For non-missing capacity bottlenecks, complete/rail-ready comparisons rank ahead of unresolved future-rail builds.

---

## Economic comparison

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

Finished target:

```text
avoided import unit value = snapshot.finishedImportCostPerUnit
```

Upstream raw/intermediate target:

```text
avoided import unit value = MATERIALS[materialId].importCost
```

### Incremental production costs

For producer build/upgrade:

```text
importSpendReduction30 =
  targetImportReductionUnits30 × avoidedImportUnitValue

incrementalRecipeOperatingCost30 =
  positiveThroughputDelta × recipe.operatingCost × 30

incrementalFlatOperatingCost30 =
  new producer ? buildingType.dailyOperatingCost × 30 : 0

incrementalInputImportSpend30 =
  Σ(additionalInputUnits30 × baselineInputImportShare × MATERIALS[input].importCost)

preRailNetCashBenefit30 =
  importSpendReduction30
  - upfront action cost
  - incrementalRecipeOperatingCost30
  - incrementalFlatOperatingCost30
  - incrementalInputImportSpend30
```

If the candidate is rail-ready/existing usable capacity, `netCashBenefit30 = preRailNetCashBenefit30`.

If a new producer needs future rail, `netCashBenefit30 = null`; show pre-rail benefit explicitly **before rail cost**.

Timed event multipliers, logistics costs, shared rail capacity, and full-company cash flow are excluded and labeled as such.

---

## Ranking

Relevant active logistics suppresses capital ranking first.

### Rail

- rail available → `connect-rail`;
- rail unavailable → `none/action-unavailable`.

### Warehouse

Affordable + feasible positive-headroom warehouse wins; tie by lower cost then stable key.

### Material

1. current action allowed;
2. valid placement/action target;
3. affordable from current cash;
4. complete positive-net candidates before unresolved rail-cost candidates;
5. complete: larger `netCashBenefit30`;
6. incomplete: larger positive `preRailNetCashBenefit30`;
7. shortage30;
8. shortage7;
9. import reduction;
10. stockout improvement;
11. lower known action cost;
12. stable key.

If all complete net and incomplete pre-rail benefits are non-positive, recommend no-op `ineffective`.

A missing producer with positive pre-rail economics but unknown rail cost is a **next prerequisite**, not a completed ROI claim.

---

## UI

Keep `SupplyAdvisor.svelte` and show:

- selected retail city/category;
- configured supply city;
- potential / replenishment ceiling / effective demand;
- other retail claimant rows;
- finished retail fallback import price;
- installed vs usable local capacity;
- 7/30 stock/import evidence;
- primary bottleneck;
- rail/warehouse evidence;
- import savings and incremental producer costs;
- final net estimate when complete or pre-rail estimate + warning when incomplete;
- active logistics / rail-capacity / store-capacity limitations;
- baseline-vs-action evidence;
- empty/unavailable/no-demand/no-op states.

No chart dependency.

---

## Navigation

Recommendations navigate without committing:

- producer/warehouse build → existing industry placement;
- upgrade → existing building inspector;
- connect rail → existing rail routing with the disconnected building as origin;
- no-op → nothing.

Rail connection is not free: real path cost remains `RAIL_BUILD_COST_PER_CELL × new cells` through existing rail preview/commit.

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

Do not rebuild demand contributors, reachability, or placement candidates while the modal is closed.

---

## Testing requirements

### Domain

Cover:

- zero demand remains ready;
- zero target-stock sold category remains a zero-draw contributor;
- target/cadence clamp;
- multiple retail cities sharing one supply inventory;
- correct finished retail import-cost basis;
- city scope via `getIndustryInventoryScope`;
- upstream requirement aggregation/depth;
- upstream-first missing-producer choice;
- Product Chains throughput parity;
- direct producer→processor path counts for upstream capacity;
- finished producer requires warehouse path;
- sink map is reused for prospective rail-ready placement checks;
- disconnected required chain → `rail-disconnected`;
- path capacity remains a limitation;
- 7/30 / stockout / imports / warehouse evidence;
- active outbound logistics limitation without route prediction;
- current action availability/scenario restrictions;
- hoisted placement context;
- warehouse and connect-rail recommendations;
- complete vs pre-rail economic estimates;
- retail finished import price vs industrial input price;
- no-op when known economics are non-positive;
- immutability and code-unit deterministic ties.

### Component/route

Cover demand clamp/contributors, installed-vs-usable capacity, rail states, complete/incomplete economics, limitations, Product Chains callback, closed-modal calculation gate, and non-mutating handoffs.

### E2E

Use the existing deterministic current-schema browser-save injection helper in `retail-sim.e2e.ts`; do not advance arbitrary days hoping to create a fixture.

Required flow: injected warehouse-pressure state → planner → Build Warehouse → industry placement → cancel → reopen → retained category/horizon context.

A rail-disconnected handoff can stay route/component coverage if adding it to E2E would turn the test into a broad rail test.

---

## KISS / YAGNI guardrails

- no `simulateDay` replay;
- no rail max-flow/shared-budget optimizer;
- no recurring-route scheduler/in-transit forecast;
- no generic solver/DSL/causal graph;
- no global planner store/router/event bus;
- no automatic mutations;
- no financing optimizer;
- no charts;
- no save schema;
- no `AdvisorChain` compatibility shim;
- one required-chain connectivity selector using existing rail primitives;
- future rail cost is labeled unknown instead of guessed.

## Review resolution

The latest review is accepted where it describes current HPA-281 facts: shared retail claimants, target/cadence clamp, rail-dependent local usefulness, cash-sensitive ranking, upstream-first missing producer, route/scenario action gates, hoisted placement context, Product Chains/scope reuse, closed-modal gating, deterministic save injection, and earlier focused lint.

Three details are deliberately refined:

1. **Rail:** upstream producers do not always need a warehouse path because processors can pull directly from producer buffers. Reachability follows the required chain to a final warehouse; no max-flow model is added.
2. **Inter-city outflow:** HPA-281 detects relevant active routes and suppresses recommendation rather than duplicating HPA-297's future scheduler.
3. **Economics:** finished retail imports use retail category import cost; producer economics also include recipe + flat operating cost + expected imported-input cost. New producers with unresolved rail cost expose pre-rail economics rather than false final ROI.