# Capacity-Aware Supply Planner and 30-Day Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the presence-only Supply Advisor with a deterministic 7/30-day local-network planner that models shared retail claimants, replenishment ceilings, rail-usable production, primary bottlenecks, and economically explainable actions without replaying the full simulation.

**Architecture:** Keep two planner modules. `supplyPlanner.ts` owns snapshot/demand/requirements/reachability/projection/bottleneck contracts. `supplyPlannerActions.ts` owns current action availability, primary-bottleneck candidates, hypothetical comparison, economic estimates, and ranking. Reuse Product Chains, retail supply, inventory, rail, placement, and route capability contracts rather than copying their rules.

**Tech Stack:** SvelteKit + Svelte 5 runes, TypeScript, Vitest server/client projects, Playwright, existing i18n/game-domain helpers.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-09-capacity-aware-supply-planner-design.md`.
- No `simulateDay` replay, forecast RNG, save schema, persistence, worker, optimizer framework, or inter-city route scheduler.
- HPA-281 aggregates retail cities sharing one supply inventory but does not predict recurring-route dispatch quantities or in-transit arrivals. Relevant active outbound logistics becomes a typed limitation and suppresses capital recommendations until HPA-297.
- `buildCityDemandPools` is potential demand. Effective supply demand is clamped by `REPLENISHMENT_INTERVAL_DAYS` and store `targetStock`.
- Finished retail fallback uses `ProductCategory.importCost`; raw/intermediate industrial imports use `MATERIALS[materialId].importCost`.
- Product Chains owns producer mapping and throughput arithmetic.
- Rail modeling is connectivity along the required product chain only. No shared rail-budget/max-flow optimizer.
- Recommendations target only the primary bottleneck.
- Planner actions navigate; they never commit build, upgrade, warehouse, or rail mutations.
- Current scenario/pending/content availability participates in candidate feasibility.
- Preserve the existing `isSupplyAdvisorOpen` calculation gate.
- Tasks 1–3 run focused ESLint/Prettier before commit in addition to staged lint hooks; full `bun run lint` is a final gate.

---

## File Structure

### New

- `src/lib/game/supplyPlanner.ts`
- `src/lib/game/supplyPlanner.spec.ts`
- `src/lib/game/supplyPlannerActions.ts`
- `src/lib/game/supplyPlannerActions.spec.ts`

### Domain files extended/reused

- `src/lib/game/productChainGraph.ts` / `.spec.ts` — lightweight throughput rows + material-specific output capacity; existing category and industry-scope helpers remain authoritative.
- `src/lib/game/rail.ts` — reuse only; no new pathfinder.
- `src/lib/game/retailSupply.ts` — reuse exported cadence; no behavior change.
- `src/lib/game/supplyAdvisor.ts` / specs — keep Build Menu availability helper, delete old chain planner after UI cutover.

### UI/composition

- `src/lib/components/game/SupplyAdvisor.svelte` / spec.
- `src/lib/components/game/ProductChainsPanel.svelte` / spec.
- `src/routes/ManagementPanelHost.svelte`.
- `src/routes/+page.svelte` / `page.svelte.spec.ts`.
- EN/JA/zh-Hant catalogs + locale parity spec.
- `src/routes/retail-sim.e2e.ts`.

---

## Task 1: Snapshot the Real Supply-City Demand Boundary

**Files:**
- Create: `src/lib/game/supplyPlanner.ts`
- Create: `src/lib/game/supplyPlanner.spec.ts`
- Reuse: `stock.ts`, `retailSupply.ts`, `productChainGraph.ts`, `cityInventory.ts`, `interCityLogistics.ts`

### Interfaces

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

export interface SupplyMaterialRequirement {
	materialId: MaterialId;
	requiredPerDay: number;
	producerRecipeId: ProductionRecipeId | null;
	chainDepth: number;
}

export type SupplyPlannerSnapshotResult =
	| { status: 'ready'; snapshot: SupplyPlannerSnapshot }
	| { status: 'empty'; reason: 'no-supported-products' }
	| { status: 'unavailable'; reason: 'retail-city-unavailable' | 'supply-city-unavailable' }
	| { status: 'unsupported'; reason: 'unsupported-category' | 'missing-producer-recipe' }
	| { status: 'invalid'; reason: 'invalid-request' };
```

Task 1 initializes rail-derived arrays/maps empty; Task 2 fills them.

### Steps

- [ ] **Step 1: Add selected-city category/supply-scope tests**

```ts
it('lists supported carried categories for the requested retail city only', () => {
	const game = createPlannerGameWithTwoRetailCities();
	const ids = listSupplyPlannerCategories(game, 'harbor-city');

	expect(ids).toContain('bottled-water');
	expect(ids).not.toContain('category-only-in-riverside');
});

it('uses getIndustryInventoryScope semantics for the configured supply city', () => {
	const snapshot = readySnapshot(createPlannerGameWithTwoRetailCities(), {
		retailCityId: 'harbor-city',
		categoryId: 'bottled-water'
	});

	expect(snapshot.supplyCityId).toBe('industry-city');
	expect(snapshot.buildings.every((row) => row.cityId === 'industry-city')).toBe(true);
});
```

Implementation extends `getSupportedStoreChainCategories(store)` and calls `getIndustryInventoryScope(game, supplyCityId)`; do not add a second supported-product registry or city-scoping helper.

- [ ] **Step 2: Add replenishment-ceiling tests**

```ts
it('clamps potential demand by the weekly target-stock draw ceiling', () => {
	const snapshot = readySnapshot(createHighDemandLowTargetPlannerGame(), {
		retailCityId: 'harbor-city',
		categoryId: 'bottled-water'
	});
	const row = snapshot.demandContributors.find((item) => item.retailCityId === 'harbor-city')!;

	expect(row.replenishmentCeilingPerDay).toBeCloseTo(70 / REPLENISHMENT_INTERVAL_DAYS);
	expect(row.effectiveDemandPerDay).toBe(
		Math.min(row.potentialDemandPerDay, row.replenishmentCeilingPerDay)
	);
});
```

- [ ] **Step 3: Add shared-retail-claimant tests**

```ts
it('includes every retail city assigned to the same supply inventory', () => {
	const snapshot = readySnapshot(createTwoRetailCitiesSharingSupply(), {
		retailCityId: 'harbor-city',
		categoryId: 'bottled-water'
	});

	expect(snapshot.demandContributors.map((row) => row.retailCityId)).toEqual([
		'harbor-city',
		'riverside'
	]);
	expect(snapshot.demandPerDay).toBeCloseTo(
		snapshot.demandContributors.reduce((sum, row) => sum + row.effectiveDemandPerDay, 0)
	);
});
```

Sort contributors using the existing world-city deterministic comparator.

- [ ] **Step 4: Lock the finished retail import-cost basis**

The current catalog intentionally gives Bottled Water different retail/material import costs. Test that the snapshot uses the retail category value:

```ts
it('uses retail category import cost for finished fallback, not material input cost', () => {
	const snapshot = readySnapshot(createPlannerGame(), {
		retailCityId: 'harbor-city',
		categoryId: 'bottled-water'
	});

	expect(snapshot.finishedImportCostPerUnit).toBe(2);
	expect(MATERIALS['bottled-water'].importCost).toBe(3);
});
```

For each city contributor, find the category definition through `getSupportedStoreChainCategories(store)`. If several store definitions for the same category have different import costs, compute a target-stock-weighted city import cost. Then compute the supply snapshot's `finishedImportCostPerUnit` as effective-demand-weighted across contributors. When total effective demand is zero, use the selected contributor's target-stock-weighted category import cost so the ready zero-demand result still has stable evidence.

- [ ] **Step 5: Add zero-demand, unavailable, and invariant-boundary tests**

```ts
it('keeps a supported zero-demand category ready', () => {
	const result = buildSupplyPlannerSnapshot(createZeroDemandPlannerGame(), {
		retailCityId: 'harbor-city',
		categoryId: 'bottled-water'
	});
	expect(result.status).toBe('ready');
	if (result.status !== 'ready') return;
	expect(result.snapshot.demandPerDay).toBe(0);
});

it('returns unavailable before stats when configured supply is unusable', () => {
	expect(
		buildSupplyPlannerSnapshot(createNullSupplyAssignmentGame(), {
			retailCityId: 'harbor-city',
			categoryId: 'bottled-water'
		})
	).toEqual({ status: 'unavailable', reason: 'supply-city-unavailable' });
});

it('does not translate authoritative inventory corruption into normal planner UX', () => {
	expect(() =>
		buildSupplyPlannerSnapshot(createInvalidInventoryPlannerGame(), {
			retailCityId: 'harbor-city',
			categoryId: 'bottled-water'
		})
	).toThrow(/City inventory invariant/);
});
```

- [ ] **Step 6: Implement contributor derivation**

```ts
function buildDemandContributor(
	game: GameState,
	city: City,
	categoryId: string
): SupplyDemandContributor | null {
	const stores = game.stores.filter(
		(store) =>
			store.cityId === city.id &&
			store.products.some((product) => product.categoryId === categoryId)
	);
	if (stores.length === 0) return null;

	const potentialDemandPerDay = buildCityDemandPools(game, city)[categoryId] ?? 0;
	let targetUnits = 0;
	let targetWeightedImportCost = 0;

	for (const store of stores) {
		const product = store.products.find((item) => item.categoryId === categoryId)!;
		const category = getSupportedStoreChainCategories(store).find((item) => item.id === categoryId);
		if (!category) continue;
		targetUnits += product.targetStock;
		targetWeightedImportCost += product.targetStock * category.importCost;
	}

	if (targetUnits <= 0) return null;
	const replenishmentCeilingPerDay = targetUnits / REPLENISHMENT_INTERVAL_DAYS;
	return {
		retailCityId: city.id as WorldCityId,
		potentialDemandPerDay,
		replenishmentCeilingPerDay,
		effectiveDemandPerDay: Math.min(potentialDemandPerDay, replenishmentCeilingPerDay),
		retailImportCostPerUnit: targetWeightedImportCost / targetUnits
	};
}
```

- [ ] **Step 7: Implement demand → upstream requirement vectors with depth**

Use `MATERIAL_PRODUCER_RECIPES`. Finished depth is 0. Each recursion to an input adds 1. Shared material units are summed; maximum depth is retained.

Test Pantry 8/day → Pantry 8 depth 0, Flour 6 depth 1, Grain 7.5 depth 2. Test Drinks produces one aggregated Water row despite multiple branches.

- [ ] **Step 8: Detect relevant active outbound logistics without forecasting it**

After requirements are known, collect route IDs where:

```ts
route.state === 'active' &&
route.originCityId === snapshot.supplyCityId &&
requiredMaterialIds.has(route.materialId)
```

Do not calculate due dispatch, destination need, capacity, in-transit reservations, or route cost in HPA-281.

- [ ] **Step 9: Run focused verification and commit**

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts --run --project server
bunx eslint src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
bunx prettier --check src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git add src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(supply): snapshot shared supply demand"
```

The first pre-implementation run can fail on missing exports/modules, but treat that as compile/cutover smoke. The behavioral assertions above are the meaningful RED tests.

---

## Task 2: Reuse Throughput and Model Required-Chain Rail Connectivity

**Files:**
- Modify: `src/lib/game/productChainGraph.ts`
- Modify: `src/lib/game/productChainGraph.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`
- Reuse without behavior changes: `src/lib/game/rail.ts`

### Product Chains interfaces

```ts
export type RecipeThroughputBuilding = Pick<IndustrialBuilding, 'typeId' | 'level'>;

export function buildingsForRecipe<T extends Pick<IndustrialBuilding, 'typeId'>>(
	buildings: readonly T[],
	recipeId: ProductionRecipeId
): T[];

export function getRecipeThroughputUnits(
	buildings: readonly RecipeThroughputBuilding[],
	recipeId: ProductionRecipeId
): number;

export function getMaterialOutputCapacityPerDay(
	buildings: readonly RecipeThroughputBuilding[],
	materialId: MaterialId
): number;
```

### Reachability interface

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

### Forecast fields

```ts
export interface SupplyMaterialForecast {
	materialId: MaterialId;
	requiredPerDay: number;
	inventoryUnits: number;
	installedCapacityPerDay: number;
	usableCapacityPerDay: number;
	capacityDeltaPerDay: number;
	daysOfCover: number | null;
	projectedStockoutDay: number | null;
	sevenDay: SupplyHorizonMaterialForecast;
	thirtyDay: SupplyHorizonMaterialForecast;
}
```

### Steps

- [ ] **Step 1: Generalize Product Chains throughput with parity tests**

```ts
it('returns identical throughput for real and lightweight building rows', () => {
	const real = [industrialBuilding('water-bottler', 2)];
	const light = real.map(({ typeId, level }) => ({ typeId, level }));

	expect(getRecipeThroughputUnits(light, 'water-bottling')).toBe(
		getRecipeThroughputUnits(real, 'water-bottling')
	);
});

it('calculates the requested output line rather than summing recipe outputs', () => {
	expect(
		getMaterialOutputCapacityPerDay([{ typeId: 'water-bottler', level: 1 }], 'bottled-water')
	).toBe(10);
});
```

- [ ] **Step 2: Add rail tests that distinguish direct processor delivery from finished warehouse delivery**

```ts
it('counts an upstream producer connected directly to a usable downstream processor', () => {
	const result = getRequiredChainReachability({
		game: pantryChainWithGrainFarmConnectedToFlourMillAndFinalWarehouse(),
		cityId: 'industry-city',
		finishedMaterialId: 'pantry',
		requirements: pantryRequirements()
	});

	expect(result.usableBuildingIds.has('grain-farm-1')).toBe(true);
});

it('does not count a finished producer that cannot reach any warehouse', () => {
	const result = getRequiredChainReachability({
		game: bottledWaterWithDisconnectedBottler(),
		cityId: 'industry-city',
		finishedMaterialId: 'bottled-water',
		requirements: bottledWaterRequirements()
	});

	expect(result.usableBuildingIds.has('water-bottler-1')).toBe(false);
	expect(result.disconnectedBuildingIds).toContain('water-bottler-1');
});
```

This prevents the review's warehouse-only simplification from incorrectly zeroing upstream capacity that can flow directly to a processor.

- [ ] **Step 3: Implement required-chain reachability using existing rail primitives**

Build once per supply city:

```ts
const city = game.industryCities.find((row) => row.id === cityId);
const network = buildRailNetwork(city!);
const budget = createRailBudget(network); // never consumed; connectivity only
const buildings = game.industrialBuildings.filter((row) => row.cityId === cityId);
const attach = new Map(
	buildings.map((building) => [building.id, getBuildingAttachCellKeys(network, building)])
);
```

Use memoized recursion per `{buildingId, outputMaterialId}`:

1. For `finishedMaterialId`, sinks are same-city warehouse buildings. The producer is usable if `findShippingPath` reaches any warehouse attach cell.
2. For an upstream material, derive downstream required materials whose producer recipe consumes it.
3. Resolve existing buildings that produce those downstream materials.
4. Keep downstream buildings that are recursively usable toward the finished warehouse.
5. The upstream producer is usable if it has a path to at least one usable downstream building.
6. Store those usable downstream IDs in `usableSinkBuildingIdsByMaterial[materialId]` for build-candidate rail-readiness checks in Task 3.
7. Use a visiting set to reject accidental recipe cycles deterministically.

`findShippingPath` receives a fresh positive rail budget that is never consumed. HPA-281 answers connectivity only; it does not allocate shared rail capacity.

- [ ] **Step 4: Populate snapshot rail facts once**

After requirements exist, call `getRequiredChainReachability` once and copy stable sorted IDs/sink maps into the snapshot.

- [ ] **Step 5: Add projection tests for installed vs usable capacity**

```ts
it('uses usable rather than merely installed capacity for import projection', () => {
	const projection = projectSupplySnapshot(snapshotWithDisconnectedFinishedProducer());
	const row = material(projection, 'bottled-water');

	expect(row.installedCapacityPerDay).toBeGreaterThan(0);
	expect(row.usableCapacityPerDay).toBe(0);
	expect(row.thirtyDay.importRequiredUnits).toBeGreaterThan(0);
	expect(projection.bottleneck.kind).toBe('rail-disconnected');
});
```

Retain count/level, inventory cover, 7/30, imports, warehouse, and zero-demand tests.

- [ ] **Step 6: Implement material projection**

```ts
const installed = buildingsForMaterial(snapshot.buildings, requirement.materialId);
const usableIds = new Set(snapshot.usableBuildingIds);
const usable = installed.filter((building) => usableIds.has(building.id));

const installedCapacityPerDay = getMaterialOutputCapacityPerDay(
	installed,
	requirement.materialId
);
const usableCapacityPerDay = getMaterialOutputCapacityPerDay(
	usable,
	requirement.materialId
);

const requiredUnits = requirement.requiredPerDay * horizonDays;
const localAvailableUnits = inventoryUnits + usableCapacityPerDay * horizonDays;
const importRequiredUnits = Math.max(0, requiredUnits - localAvailableUnits);
```

- [ ] **Step 7: Implement primary bottleneck order**

```text
upstream-most missing producer
→ binding warehouse
→ deepest required disconnected producer
→ largest normalized usable-capacity deficit
→ earliest stockout
→ largest 30-day import reliance
→ none
```

Missing producer uses descending chain depth, then code-unit material ID. Rail ties use descending material depth, then code-unit building ID.

- [ ] **Step 8: Add explicit limitations**

```ts
export type SupplyPlannerLimitation =
	| { kind: 'active-logistics-not-modeled'; routeIds: readonly string[] }
	| { kind: 'rail-capacity-not-modeled' }
	| { kind: 'store-sales-capacity-not-modeled' };
```

`rail-capacity-not-modeled` must be visible because path existence does not imply enough shared daily rail budget.

- [ ] **Step 9: Run focused verification and commit**

```bash
bun run test:unit -- src/lib/game/productChainGraph.spec.ts src/lib/game/supplyPlanner.spec.ts --run --project server
bunx eslint src/lib/game/productChainGraph.ts src/lib/game/supplyPlanner.ts src/lib/game/productChainGraph.spec.ts src/lib/game/supplyPlanner.spec.ts
bunx prettier --check src/lib/game/productChainGraph.ts src/lib/game/supplyPlanner.ts src/lib/game/productChainGraph.spec.ts src/lib/game/supplyPlanner.spec.ts
git add src/lib/game/productChainGraph.ts src/lib/game/productChainGraph.spec.ts src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(supply): project usable local capacity"
```

---

## Task 3: Add Action Availability, Rail-Aware Build Feasibility, and Economics

**Files:**
- Create: `src/lib/game/supplyPlannerActions.ts`
- Create: `src/lib/game/supplyPlannerActions.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts` only for exported plan/comparison helpers if needed

### Interfaces

```ts
export interface SupplyPlannerActionAvailability {
	canBuildIndustry: boolean;
	canUpgradeIndustry: boolean;
	canBuildRail: boolean;
	allowedIndustryBuildingTypeIds: readonly IndustrialBuildingTypeId[];
}

export interface SupplyBuildFeasibility {
	hasValidPlacement: boolean;
	hasRailReadyPlacement: boolean;
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

A candidate may also carry `potentialProjectionAfterRail` when a new producer needs a future rail connection; the normal `projection` never invents that connection.

### Steps

- [ ] **Step 1: Lock primary-bottleneck-only candidates and upstream ordering**

```ts
it('generates producer actions only for the primary material bottleneck', () => {
	const plan = readyPlan(gameWithSeveralDeficits(), sandboxAvailability());
	const primary = plan.baseline.bottleneck;
	if (!('materialId' in primary)) throw new Error('fixture requires material bottleneck');

	for (const candidate of plan.alternatives) {
		if (candidate.action.kind === 'build-producer' || candidate.action.kind === 'upgrade-building') {
			expect(candidate.action.materialId).toBe(primary.materialId);
		}
	}
});
```

Add a Pantry no-producer fixture and assert Grain (deepest/upstream) is primary before Flour/Pantry.

- [ ] **Step 2: Lock current route/scenario action availability**

```ts
it('does not recommend a scenario-disallowed building type', () => {
	const plan = readyPlan(gameMissingProducer(), {
		canBuildIndustry: true,
		canUpgradeIndustry: true,
		canBuildRail: true,
		allowedIndustryBuildingTypeIds: []
	});

	expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'action-unavailable' });
});
```

Also cover build disabled/pending, upgrade disabled, and rail disabled.

- [ ] **Step 3: Hoist placement context once and calculate rail-ready placement evidence**

```ts
function getBuildFeasibility(
	game: GameState,
	snapshot: SupplyPlannerSnapshot,
	materialId: MaterialId,
	buildingTypeId: IndustrialBuildingTypeId
): SupplyBuildFeasibility {
	const scopedGame = { ...game, activeIndustryCityId: snapshot.supplyCityId };
	const city = scopedGame.industryCities.find((row) => row.id === snapshot.supplyCityId);
	if (!city) return { hasValidPlacement: false, hasRailReadyPlacement: false };

	const placement = createIndustrialPlacementContext(scopedGame);
	if (!placement) return { hasValidPlacement: false, hasRailReadyPlacement: false };

	const network = buildRailNetwork(city);
	const budget = createRailBudget(network); // connectivity only
	const sinkIds = snapshot.usableSinkBuildingIdsByMaterial[materialId] ?? [];
	const sinkAttach = sinkIds.flatMap((id) => {
		const sink = game.industrialBuildings.find((building) => building.id === id);
		return sink ? getBuildingAttachCellKeys(network, sink) : [];
	});

	let hasValidPlacement = false;
	let hasRailReadyPlacement = false;
	for (const tile of city.tiles) {
		if (getIndustrialPlacementBlockReasonWithContext(placement, tile.id, buildingTypeId)) continue;
		hasValidPlacement = true;
		const hypothetical = { mapX: tile.x, mapY: tile.y };
		const attach = getBuildingAttachCellKeys(network, hypothetical);
		if (findShippingPath(network, budget, attach, sinkAttach)) {
			hasRailReadyPlacement = true;
			break;
		}
	}

	return { hasValidPlacement, hasRailReadyPlacement };
}
```

For a **finished material**, `usableSinkBuildingIdsByMaterial[materialId]` contains warehouse IDs. For upstream material it contains usable downstream processor IDs.

Never call `getIndustrialPlacementBlockReason` inside the tile loop.

- [ ] **Step 4: Lock rail and warehouse prerequisite recommendations**

```ts
it('recommends connecting an existing required producer before more capacity', () => {
	const plan = readyPlan(gameWithDisconnectedRequiredProducer(), sandboxAvailability());
	expect(plan.baseline.bottleneck.kind).toBe('rail-disconnected');
	expect(plan.recommendation.action.kind).toBe('connect-rail');
});

it('recommends warehouse capacity when it is the binding prerequisite', () => {
	const plan = readyPlan(gameWithWarehousePressure(), sandboxAvailability());
	expect(plan.baseline.bottleneck.kind).toBe('warehouse-capacity');
	expect(plan.recommendation.action.kind).toBe('build-warehouse');
	expect(plan.recommendation.comparison.warehouseFreeGain).toBeGreaterThan(0);
});
```

`connect-rail` has no guessed dollar cost; current rail path cost belongs to the rail builder.

- [ ] **Step 5: Lock complete vs pre-rail producer economics**

```ts
it('does not invent delivered improvement for a build with no rail-ready placement', () => {
	const candidate = producerBuildCandidate(gameWithNoRailReadyProducerPlacement());

	expect(candidate.comparison.requiresRailConnection).toBe(true);
	expect(candidate.comparison.netCashBenefit30).toBeNull();
	expect(candidate.potentialProjectionAfterRail).toBeDefined();
	expect(candidate.projection.totals.importUnits30).toBe(candidate.baseline.totals.importUnits30);
});

it('rejects a missing-producer build when known economics are already negative before rail cost', () => {
	const plan = readyPlan(gameWhereMissingProducerPreRailEconomicsAreNegative(), sandboxAvailability());
	expect(plan.recommendation.action.kind).toBe('none');
});
```

Add a positive pre-rail missing-producer fixture and assert the producer can be recommended as a prerequisite with `requiresRailConnection=true` and explicit incomplete economics.

- [ ] **Step 6: Implement copied hypothetical projections**

- Upgrade an existing **usable** producer: increment level and rerun the normal projector; economics is complete.
- New producer with `hasRailReadyPlacement=true`: append synthetic level-1 row and synthetic usable ID; rerun projector; economics is complete.
- New producer with valid but no rail-ready placement: normal candidate projection leaves usable capacity unchanged; separately compute `potentialProjectionAfterRail` by treating the synthetic row as usable solely for **pre-rail** economic evidence.
- Warehouse: add authoritative capacity only; do not invent topology/occupancy.
- Connect rail: do not invent a path/projection.

- [ ] **Step 7: Lock the avoided-import price source**

Finished target:

```ts
const avoidedImportUnitValue =
	targetMaterialId === snapshot.finishedMaterialId
		? snapshot.finishedImportCostPerUnit
		: MATERIALS[targetMaterialId].importCost;
```

Add an exact Bottled Water economics assertion that uses retail cost `2`, not material cost `3`.

- [ ] **Step 8: Implement incremental production economics**

Use the candidate's complete projection, or `potentialProjectionAfterRail` for pre-rail evidence:

```ts
const importReductionUnits30 = Math.max(
	0,
	baselineTarget.thirtyDay.importRequiredUnits - candidateTarget.thirtyDay.importRequiredUnits
);
const importSpendReduction30 = importReductionUnits30 * avoidedImportUnitValue;

const throughputDelta = Math.max(0, candidateThroughput - baselineThroughput);
const incrementalRecipeOperatingCost30 = throughputDelta * recipe.operatingCost * 30;
const incrementalFlatOperatingCost30 =
	action.kind === 'build-producer' ? buildingType.dailyOperatingCost * 30 : 0;

const incrementalInputImportSpend30 = recipe.inputs.reduce((sum, input) => {
	const baselineInput = baseline.materials.find((row) => row.materialId === input.materialId);
	if (!baselineInput || baselineInput.thirtyDay.requiredUnits <= 0) return sum;
	const importShare = Math.min(
		1,
		baselineInput.thirtyDay.importRequiredUnits / baselineInput.thirtyDay.requiredUnits
	);
	const extraUnits = input.quantity * throughputDelta * 30;
	return sum + extraUnits * importShare * MATERIALS[input.materialId].importCost;
}, 0);

const preRailNetCashBenefit30 =
	importSpendReduction30 -
	action.cost -
	incrementalRecipeOperatingCost30 -
	incrementalFlatOperatingCost30 -
	incrementalInputImportSpend30;

const netCashBenefit30 = requiresRailConnection ? null : preRailNetCashBenefit30;
```

This deliberately follows current producer cash formulas without adding event multipliers or logistics costs.

- [ ] **Step 9: Rank by bottleneck type**

1. Relevant active logistics → no-op `logistics-contention-not-modeled`.
2. Rail disconnected → `connect-rail` if available, else `action-unavailable`.
3. Warehouse → feasible/affordable positive-headroom warehouse, else no-op.
4. Material bottleneck:
   - current action available;
   - valid geometry;
   - affordable from current cash;
   - complete positive-net candidates before incomplete rail-cost candidates;
   - complete: `netCashBenefit30` descending;
   - incomplete: positive `preRailNetCashBenefit30` descending;
   - then shortage30, shortage7, imports, stockout, lower known action cost, stable code-unit key.
5. If known net/pre-rail economics are non-positive, no-op `ineffective`.

An incomplete producer recommendation must be labeled **prerequisite; rail cost not included**, never “positive ROI.”

- [ ] **Step 10: Verify immutability and deterministic ties**

Deep-clone game/snapshot before candidate evaluation. Use code-unit ordering, never `localeCompare`, for engine ranking ties.

- [ ] **Step 11: Run focused verification and commit**

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts --run --project server
bunx eslint src/lib/game/supplyPlanner.ts src/lib/game/supplyPlannerActions.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts
bunx prettier --check src/lib/game/supplyPlanner.ts src/lib/game/supplyPlannerActions.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts
git add src/lib/game/supplyPlanner.ts src/lib/game/supplyPlannerActions.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts
git commit -m "feat(supply): recommend actionable bottleneck fixes"
```

---

## Task 4: Replace the Presence Checklist with Planner Evidence

**Files:**
- Modify: `src/lib/components/game/SupplyAdvisor.svelte`
- Modify: `src/lib/components/game/SupplyAdvisor.svelte.spec.ts`
- Modify: EN/JA/zh-Hant catalogs and locale parity spec

### Props

```ts
interface Props {
	result: SupplyPlannerResult;
	categoryIds: readonly string[];
	selectedCategoryId: string | null;
	horizonDays: SupplyPlannerHorizonDays;
	i18n: I18nBundle;
	onSelectCategory: (categoryId: string) => void;
	onSelectHorizon: (days: SupplyPlannerHorizonDays) => void;
	onAction: (action: SupplyPlannerAction) => void;
	onClose: () => void;
}
```

### Steps

- [ ] **Step 1: Rewrite component tests around typed planner states**

Cover:

- ready / zero-demand / empty / unavailable;
- potential vs replenishment-clamped demand;
- multiple retail claimant rows;
- finished retail import-cost evidence;
- installed vs usable capacity;
- rail disconnection / warehouse pressure;
- complete cash estimate;
- pre-rail incomplete estimate and warning;
- active-logistics limitation + suppressed recommendation;
- category/horizon callbacks;
- existing dialog/focus/close behavior.

- [ ] **Step 2: Run the existing component test to establish cutover**

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts --run --project client
```

Old-prop/type failure is only cutover smoke. Behavioral assertions from Step 1 are the meaningful RED contract.

- [ ] **Step 3: Implement text/metric UI using existing paper/tokens styles**

No chart library. For incomplete producer economics render “before rail cost” explicitly. For `connect-rail`, do not show `$0`; state that route/path cost is calculated by the rail builder.

- [ ] **Step 4: Add localized copy together**

Add keys for demand clamp, shared claimants, retail fallback import cost, installed/usable capacity, rail disconnected, warehouse pressure, import savings, production/input costs, complete/pre-rail net estimate, limitations, no-op reasons, and action labels.

- [ ] **Step 5: Run component/static verification and commit**

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/i18n/locales.spec.ts --run --project client
bun run check
bunx eslint src/lib/components/game/SupplyAdvisor.svelte src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts
bunx prettier --check src/lib/components/game/SupplyAdvisor.svelte src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts
git add src/lib/components/game/SupplyAdvisor.svelte src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/i18n
git commit -m "feat(supply): present planner evidence"
```

---

## Task 5: Wire Product Chains, Closed-Modal Gating, and Existing Action Workflows

**Files:**
- Modify: `src/lib/components/game/ProductChainsPanel.svelte` / spec
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/page.svelte.spec.ts`

### Route context

```ts
interface SupplyPlannerUiContext {
	categoryId: string | null;
	horizonDays: 7 | 30;
}
```

### Steps

- [ ] **Step 1: Add Product Chains callback**

`onPlanCategory(categoryId)` opens the existing planner modal for the active category. Do not put forecast state into Product Chains.

- [ ] **Step 2: Preserve the existing calculation gate**

```ts
let supplyPlannerResult = $derived.by(() => {
	if (!isSupplyAdvisorOpen || !game || !effectivePlannerCategoryId) return null;
	return buildSupplyPlan(
		game,
		{ retailCityId: activeCity.id, categoryId: effectivePlannerCategoryId },
		plannerActionAvailability
	);
});
```

Add a route/client assertion that planner work is absent while the modal is closed.

- [ ] **Step 3: Derive action availability from existing route gates**

```ts
let plannerActionAvailability = $derived<SupplyPlannerActionAvailability>({
	canBuildIndustry: canStartIndustryExpansion,
	canUpgradeIndustry: mutationAvailability.upgradeIndustrialBuilding,
	canBuildRail: mutationAvailability.buildRail,
	allowedIndustryBuildingTypeIds
});
```

This carries pending scenario state and content restrictions already modeled by the route.

- [ ] **Step 4: Preserve category/horizon context**

Closing the modal does not reset context. Reopening falls back only when the stored category is no longer valid.

- [ ] **Step 5: Build/warehouse handoff**

Re-check current recommendation, switch to the supply-city industry map through existing city selection, then call existing `armIndustryPlacement(buildingTypeId)`. No controller build call.

- [ ] **Step 6: Upgrade handoff**

Resolve the current building, switch to its city, select its tile, and let the existing inspector own Upgrade.

- [ ] **Step 7: Rail handoff**

For `connect-rail`:

1. resolve current building and `mutationAvailability.buildRail`;
2. switch to its city;
3. close planner/build overlays and clear other placement modes;
4. set `railBuildMode = { step: 'routing', originBuildingId: building.id, waypoints: [] }`;
5. let the existing rail preview determine path/new cells/cost;
6. do not call `gameRouteController.buildRail`.

A stale/restricted action stays in the planner with unavailable evidence rather than silently no-oping.

- [ ] **Step 8: Replace `AdvisorChain` props/wiring**

Retain map pause, shortcut swallowing, focus, and Escape ordering.

- [ ] **Step 9: Run route/component checks and commit**

```bash
bun run test:unit -- src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client
bun run check
bunx eslint src/lib/components/game/ProductChainsPanel.svelte src/routes/ManagementPanelHost.svelte src/routes/+page.svelte src/routes/page.svelte.spec.ts
bunx prettier --check src/lib/components/game/ProductChainsPanel.svelte src/routes/ManagementPanelHost.svelte src/routes/+page.svelte src/routes/page.svelte.spec.ts
git add src/lib/components/game/ProductChainsPanel.svelte src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/routes/ManagementPanelHost.svelte src/routes/+page.svelte src/routes/page.svelte.spec.ts
git commit -m "feat(supply): navigate planner actions"
```

---

## Task 6: Delete the Old Advisor Model and Verify Deterministic Handoff

**Files:**
- Modify: `src/lib/game/supplyAdvisor.ts`
- Modify: `src/lib/game/supplyAdvisor.spec.ts`
- Modify/Delete: `src/lib/game/supplyAdvisor.defensive.spec.ts` as appropriate
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify only imports exposed by deletion

### Steps

- [ ] **Step 1: Audit old model consumers**

```bash
rg "AdvisorChain|buildSupplyAdvisor|getBuildingTypeProducing" src
```

Application-code matches must be zero before removing exports.

- [ ] **Step 2: Keep only Build Menu availability behavior**

Retain `getAvailableMaterialIds(game)`. Delete presence-chain types/functions and chain-only tests. No compatibility exports.

- [ ] **Step 3: Keep availability tests**

Protect active-industry city inventory, positive building-buffer contents, optimistic placed-building outputs used by Build Menu recipe hints, and defensive unavailable inventory behavior.

- [ ] **Step 4: Create deterministic E2E state through existing save injection**

Reuse `installSandboxAutoSave(page, game)` already in `retail-sim.e2e.ts`. It validates current-schema save storage, writes `BROWSER_SAVE_STORAGE_KEY` (`serpens.saves.v2`), reloads, resumes, closes Saves, and waits for the retail map.

Build a `warehousePressurePlannerGame()` fixture with:

- supported selected category;
- deterministic target stocks / supply assignment;
- connected usable supply chain so rail is not the primary bottleneck;
- binding warehouse pressure;
- enough cash and a valid warehouse placement;
- no relevant active recurring route.

Do not “advance N days” to hope for pressure.

- [ ] **Step 5: Add required `supply planner warehouse` E2E**

1. install injected save;
2. open planner;
3. assert selected-city potential/effective demand, supply city, 7/30 controls, warehouse bottleneck;
4. assert Build Warehouse recommendation;
5. activate it and verify warehouse industry placement is armed;
6. cancel placement;
7. reopen planner and verify category/horizon context survives.

Keep calculation exactness in node tests.

- [ ] **Step 6: Keep rail handoff focused**

Cover disconnected-producer → `connect-rail` → routing-origin handoff in `page.svelte.spec.ts`. Add an E2E only if the injected fixture remains small; do not turn the planner E2E into a rail construction test.

- [ ] **Step 7: Run focused verification**

```bash
bun run test:unit -- src/lib/game/supplyAdvisor.spec.ts src/lib/game/productChainGraph.spec.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts --run --project server
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client
bunx playwright test src/routes/retail-sim.e2e.ts -g "supply planner warehouse"
```

- [ ] **Step 8: Run full project gates**

```bash
bun run check
bun run lint
bun run test:unit -- --run
bunx playwright test src/routes/retail-sim.e2e.ts
bun run build
git diff --check main...HEAD
```

Fix only HPA-281 regressions.

- [ ] **Step 9: Final contract audit**

Verify:

- no state/RNG/autosave mutation;
- zero demand is ready/no-op;
- demand is target/cadence-clamped and aggregates all retail claimants sharing supply;
- finished import economics uses retail category cost, not material cost;
- shared upstream requirements/depth are deterministic;
- upstream producer→processor connectivity is allowed;
- finished output must reach a warehouse;
- path existence only—no rail max-flow claim;
- active outbound logistics suppresses capital recommendation without route forecasting;
- current scenario/pending/content gates affect candidate recommendation;
- placement context is hoisted once;
- missing producer is upstream-first;
- Product Chains owns throughput;
- complete and pre-rail economic estimates are distinguished;
- build/warehouse/upgrade/rail actions navigate without committing;
- planner computation is closed-modal gated;
- Product Chains can open planner context;
- `AdvisorChain` is deleted without compatibility shim;
- no HPA-297 route/in-transit implementation leaked in.

- [ ] **Step 10: Commit cleanup/E2E**

```bash
git add src/lib/game/supplyAdvisor.ts src/lib/game/supplyAdvisor.spec.ts src/routes/retail-sim.e2e.ts
git add -u
git commit -m "test(supply): verify planner handoff"
```

---

## Implementation Order Rationale

1. **Snapshot/demand first** fixes shared claimants, replenishment ceiling, import-price basis, and scope before any ranking exists.
2. **Throughput/connectivity second** fixes local-capacity truth before comparison axes are tuned.
3. **Actions/economics third** ranks only stable, actionable facts and explicitly separates complete from pre-rail estimates.
4. **UI fourth** renders typed evidence instead of doing math in Svelte.
5. **Route wiring fifth** reuses current scenario gates and existing action workflows.
6. **Cleanup/E2E last** deletes the old model only after replacement is wired and uses deterministic save injection.

## Self-Review

- Same two planner modules; no new planner subsystem.
- No full simulation replay.
- No rail flow optimizer; required-chain connectivity only.
- No inter-city route forecast; active logistics is an explicit conservative guard.
- No guessed future rail cost or false ROI.
- No duplicate product/throughput/city-scope/placement formulas.
- Every task names concrete files, tests, algorithms, verification commands, and commit boundaries; no TODO/TBD placeholders.