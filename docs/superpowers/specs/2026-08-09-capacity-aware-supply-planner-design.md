# Capacity-Aware Supply Planner and 30-Day Forecast — Design

**Linear:** HPA-281 — Implement the capacity-aware Supply Planner and 30-day forecast

## Outcome

Replace the building-presence Supply Advisor with a deterministic local-network planner that answers four questions for a selected finished product:

1. How much supply can the current retail configuration actually draw?
2. What is the primary local bottleneck?
3. What happens over 7 and 30 days if nothing changes?
4. What is the best currently actionable build, upgrade, rail, warehouse, or no-op response, and what is the economic tradeoff where that tradeoff is knowable?

The planner is advisory only. It never mutates live game state, advances RNG, autosaves, builds, upgrades, or lays rail. Existing placement, rail-build, and inspector flows remain the mutation boundary.

## Architecture

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

No replay engine, optimizer framework, planner store, event bus, worker, save state, or route scheduler.

## Correctness corrections from review

The expected-value approach remains preferable to cloning `simulateDay`, but current simulation facts must be reflected:

- intra-city rail controls whether local output can move through the required chain;
- one industry inventory can serve several retail cities;
- potential city demand is not the same as weekly warehouse draw;
- retail finished-product import prices are not necessarily equal to material import prices;
- units alone cannot rank operational investments;
- current scenario/pending/content gates can make an otherwise valid action unavailable.

These fit inside the same modules.

## HPA-297 boundary

HPA-281 does not predict recurring-route dispatch quantities, route contention, in-transit arrivals, or event-modified route state.

If an active outbound recurring route originates at the modeled supply city and touches a required material, HPA-281 adds `active-logistics-not-modeled`, shows the retail-only baseline evidence, and suppresses capital recommendations. HPA-297 later replaces this conservative guard with route-aware projection.

---

## Reuse map

### Demand/category

From `stock.ts`:

- `buildCityDemandPools(game, city)`;
- `getFinishedMaterialIdForCategory(categoryId)`.

From `retailSupply.ts`:

- `REPLENISHMENT_INTERVAL_DAYS`.

From Product Chains:

- `getSupportedStoreChainCategories(store)`;
- `MATERIAL_PRODUCER_RECIPES`;
- `getIndustryInventoryScope(game, cityId)`;
- `buildingsForRecipe` / `getRecipeThroughputUnits`.

### Inventory

Use `getCityInventoryStats` only after supply scope resolves. Authoritative inventory invariant failures remain exceptions, not normal planner result states.

### Rail

Reuse `buildRailNetwork`, `createRailBudget`, `getBuildingAttachCellKeys`, and `findShippingPath` with the same attachment semantics as `pullViaRail`/`pushSurplusViaRail`.

Add one required-chain connectivity selector; do not add another pathfinder or flow solver.

### Actions

Reuse industry/material/recipe definitions, leveling cost/throughput helpers, `createIndustrialPlacementContext`, `getIndustrialPlacementBlockReasonWithContext`, and route-level action availability.

---

## Public contracts

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

### Result union

```ts
export type SupplyPlannerResult =
	| { status: 'ready'; plan: SupplyPlan }
	| { status: 'empty'; reason: 'no-supported-products' }
	| { status: 'unavailable'; reason: 'retail-city-unavailable' | 'supply-city-unavailable' }
	| { status: 'unsupported'; reason: 'unsupported-category' | 'missing-producer-recipe' }
	| { status: 'invalid'; reason: 'invalid-request' };
```

A supported category with effective demand `0` remains `ready` with bottleneck `none` and no-op `no-demand`.

---

## Demand model

### Supply-city claimants

The selected retail city supplies UI context. The configured industry city is the actual inventory/capacity boundary.

Include every opened/generated retail city whose current assignment points to the same supply city and which sells the requested category. Preserve one contributor row per city.

### Potential demand and replenishment ceiling

```text
potentialDemandPerDay = buildCityDemandPools(game, retailCity)[categoryId] ?? 0

replenishmentCeilingPerDay =
  sum(product.targetStock for stores selling category)
  / REPLENISHMENT_INTERVAL_DAYS

effectiveDemandPerDay =
  min(potentialDemandPerDay, replenishmentCeilingPerDay)
```

This is an upper bound on average warehouse draw under current targets/cadence, not a promise that every replenishment consumes the full target.

A sold category whose total target stock is `0` stays a valid zero-draw contributor.

### Finished retail import cost

Do not substitute `MATERIALS[finishedMaterialId].importCost` for retail fallback imports.

Per contributor:

- if target stock total > 0, weight carried `ProductCategory.importCost` by target-stock share;
- if target stock total = 0, use a deterministic arithmetic average of the carried category definitions because no units are currently drawable.

`finishedImportCostPerUnit` is effective-demand-weighted across contributors. If total effective demand is zero, use the selected contributor's deterministic retail import cost.

Raw/intermediate industrial input imports continue to use `MATERIALS[materialId].importCost`.

### Store sales-capacity limitation

The sales pass also shares store sales capacity across categories. HPA-281 does not invent a per-category allocator; surface `store-sales-capacity-not-modeled`.

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

Finished depth is `0`; depth increases upstream. Shared upstream units are accumulated once; maximum depth is retained.

Missing-producer ties use greatest depth first, then code-unit material ID. This preserves the useful topological intent of the old advisor without preserving `AdvisorChain`.

---

## Installed vs usable capacity

Product Chains remains the throughput formula owner. Generalize its helper to readonly `{ typeId, level }` rows and add material-specific output capacity.

### Required-chain reachability

“Every producer must reach a warehouse” is too broad because live processors can pull directly from producer buffers.

- finished producer → must reach a same-city warehouse;
- raw/intermediate producer → must reach at least one **usable downstream processor** consuming that material;
- downstream usability recursively terminates at a finished producer that reaches a warehouse;
- missing downstream producers are handled by higher-priority `missing-producer` before rail disconnection.

```ts
export interface RequiredChainReachability {
	usableBuildingIds: ReadonlySet<string>;
	disconnectedBuildingIds: readonly string[];
	usableSinkBuildingIdsByMaterial: Partial<Record<MaterialId, readonly string[]>>;
}
```

Use the existing rail network, a fresh positive budget, attach cells, and `findShippingPath`. Never consume the budget: this is connectivity only.

Store `usableSinkBuildingIdsByMaterial` in the snapshot so candidate placement can reuse the same sink definition rather than recomputing another reachability model.

### Capacity evidence

Per material expose installed and usable capacity. Stockout/import calculations use **usable** capacity.

Path existence is not path throughput. Shared rail cell budgets are explicitly `rail-capacity-not-modeled`; no max-flow/multi-commodity solver.

---

## Projection

For each material/horizon:

```text
requiredUnits = requiredPerDay × horizon
localAvailableUnits = startingInventory + usableCapacityPerDay × horizon
importRequiredUnits = max(0, requiredUnits - localAvailableUnits)
```

Expose 7/30 rows, days of cover, projected stockout, installed/usable capacity, and inventory.

Warehouse evidence is current capacity/used/free/overflow only. No projected occupancy engine.

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
2. binding warehouse;
3. deepest required disconnected producer;
4. largest normalized usable-capacity deficit;
5. earliest stockout;
6. largest 30-day import reliance;
7. none.

---

## Limitations

```ts
export type SupplyPlannerLimitation =
	| { kind: 'active-logistics-not-modeled'; routeIds: readonly string[] }
	| { kind: 'rail-capacity-not-modeled' }
	| { kind: 'store-sales-capacity-not-modeled' };
```

Relevant active outbound logistics suppresses capital recommendation rather than being silently ignored or forecast with duplicate route logic.

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

Generate only for the primary bottleneck.

### Availability and placement

A currently restricted route/scenario action cannot become the primary recommendation.

For build candidates, create one `IndustrialPlacementContext`, scan with `getIndustrialPlacementBlockReasonWithContext`, and record:

```ts
export interface SupplyBuildFeasibility {
	hasValidPlacement: boolean;
	hasRailReadyPlacement: boolean;
}
```

A valid tile is rail-ready when its hypothetical building footprint can reach a sink from `usableSinkBuildingIdsByMaterial[materialId]` using the current rail network.

---

## Hypothetical behavior

### Existing usable producer upgrade

Increment level in a copied snapshot and rerun projection.

### Warehouse

Add authoritative warehouse capacity only. Do not invent topology/occupancy.

### Connect rail

Do not invent a path or cost. Handoff to existing rail routing.

### New producer

A new producer has no coordinates until placement.

- rail-ready valid placement exists → hypothetical can count the new capacity as usable;
- no rail-ready placement → normal hypothetical cannot invent usable capacity; a separate potential-after-rail projection may be used for explicitly incomplete evidence.

### Structural-chain incompleteness

Upstream-first ordering can intentionally select a producer while one or more downstream required producers are also missing. In that state, the upstream building has **no standalone avoided-import ROI yet** because the consuming stage does not exist.

Candidate evidence therefore records:

```ts
requiresAdditionalProducerBuilds: boolean;
```

If true:

- `preRailNetCashBenefit30 = null`;
- `netCashBenefit30 = null`;
- do not fabricate import savings from theoretical upstream requirement rows;
- if the action is allowed, geometrically feasible, and affordable, it may still be recommended as the upstream **structural prerequisite**, with explicit “chain incomplete; ROI not yet available” evidence.

Once the structural chain exists, normal operational economics apply.

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
	preRailNetCashBenefit30: number | null;
	netCashBenefit30: number | null;
	requiresRailConnection: boolean;
	requiresAdditionalProducerBuilds: boolean;
	stockoutImprovementDays: number;
	warehouseFreeGain: number;
}
```

### Avoided import value

- finished target → `snapshot.finishedImportCostPerUnit`;
- raw/intermediate target → `MATERIALS[materialId].importCost`.

### Known producer economics

Only when `requiresAdditionalProducerBuilds === false`:

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

- rail-ready/existing usable → `netCashBenefit30 = preRailNetCashBenefit30`;
- future rail required → `netCashBenefit30 = null` and pre-rail value is labeled **before rail cost**.

Timed event multipliers, logistics costs, shared rail capacity, and full-company cash flow remain explicit exclusions.

---

## Ranking

Relevant active logistics suppresses capital ranking first.

### Missing producer

The primary material is already upstream-first.

- action unavailable / invalid placement / unaffordable → corresponding no-op;
- if additional producer stages are also missing → recommend the affordable upstream build as the next structural prerequisite, but show no ROI;
- if it is the only missing producer → apply complete/pre-rail economic rules below; known non-positive economics can select no-op.

### Rail

- rail available → `connect-rail`;
- unavailable → `action-unavailable`.

### Warehouse

Affordable + feasible positive-headroom warehouse wins; tie by lower cost then stable key.

### Operational material bottleneck

1. current action allowed;
2. valid target/placement;
3. affordable;
4. complete positive-net candidates before unresolved rail-cost candidates;
5. complete: larger `netCashBenefit30`;
6. rail-incomplete: larger positive `preRailNetCashBenefit30`;
7. shortage30, shortage7, import reduction, stockout improvement, lower known cost, stable key.

If all known complete/pre-rail economics are non-positive, recommend no-op `ineffective`.

---

## UI

Keep `SupplyAdvisor.svelte` and show:

- selected retail city/category and supply city;
- potential / replenishment ceiling / effective demand;
- other claimant rows;
- finished retail fallback import price;
- installed vs usable local capacity;
- 7/30 stock/import evidence;
- primary bottleneck;
- rail/warehouse evidence;
- known producer import savings/costs;
- final net estimate, pre-rail estimate, or structural-prerequisite “ROI unavailable” state;
- limitations;
- baseline-vs-action evidence;
- empty/unavailable/no-demand/no-op states.

No chart dependency.

---

## Navigation

Recommendations navigate without committing:

- producer/warehouse → industry placement;
- upgrade → building inspector;
- connect rail → rail routing with disconnected building as origin;
- no-op → nothing.

Rail is not free; real path cost stays in existing rail preview/commit.

Re-check action availability immediately before handoff.

---

## Derivation lifetime

Preserve the existing gate:

```ts
let supplyPlannerResult = $derived.by(() => {
	if (!isSupplyAdvisorOpen || !game || !effectivePlannerCategoryId) return null;
	return buildSupplyPlan(game, request, plannerActionAvailability);
});
```

Do not rebuild planner work while the modal is closed.

---

## Testing requirements

### Domain

Cover:

- zero demand and zero-target sold category remain valid;
- target/cadence clamp;
- shared retail claimants;
- retail finished import price differs correctly from material import price;
- city scope via `getIndustryInventoryScope`;
- upstream requirement aggregation/depth;
- upstream-first missing producer;
- multiple missing stages → structural prerequisite with null ROI;
- Product Chains throughput parity;
- upstream producer→processor rail connectivity;
- finished producer→warehouse requirement;
- sink map reused for prospective placement;
- disconnected chain → rail bottleneck;
- rail capacity limitation;
- 7/30 / stockout / imports / warehouse evidence;
- active outbound logistics limitation without route forecast;
- route/scenario action availability;
- hoisted placement context;
- warehouse / connect-rail recommendations;
- complete vs pre-rail vs structurally-incomplete economic evidence;
- no-op for known non-positive economics;
- immutability and code-unit ties.

### Component/route

Cover demand evidence, installed/usable capacity, rail states, all three economic-completeness states, limitations, Product Chains callback, closed-modal gating, and non-mutating handoffs.

### E2E

Use existing deterministic current-schema browser-save injection. Required flow: injected warehouse-pressure state → planner → Build Warehouse → placement → cancel → reopen → retained context.

Keep rail connection handoff in route/component tests unless a tiny E2E fixture remains focused.

---

## KISS / YAGNI

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
- unknown rail cost / incomplete structural ROI is labeled unknown instead of guessed.

## Review resolution

Accepted: shared retail claimants, target/cadence clamp, rail-dependent usefulness, cash-sensitive operational ranking, upstream-first missing producer, route/scenario gates, hoisted placement context, Product Chains/scope reuse, closed-modal gating, deterministic save injection, earlier focused lint.

Refined:

1. upstream producers may feed processors directly, so reachability follows the required chain rather than requiring every stage to reach a warehouse;
2. active inter-city routes suppress recommendation instead of being forecast before HPA-297;
3. finished imports use retail category price, producer economics include recipe/flat/input-import costs, and missing structural stages or future rail costs produce explicitly incomplete economics rather than fabricated ROI.