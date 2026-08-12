# Capacity-Aware Supply Planner and 30-Day Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the presence-only Supply Advisor with a deterministic 7/30-day local-network planner that models shared retail claimants, replenishment ceilings, rail-usable production, primary bottlenecks, and economically explainable actions without replaying the full simulation.

**Architecture:** Keep two planner modules. `supplyPlanner.ts` owns snapshot/demand/requirements/reachability/projection/bottleneck contracts. `supplyPlannerActions.ts` owns current action availability, primary-bottleneck candidates, hypothetical comparison, economic completeness, and ranking. Reuse Product Chains, retail supply, inventory, rail, placement, and route capability contracts.

**Tech Stack:** SvelteKit + Svelte 5 runes, TypeScript, Vitest server/client projects, Playwright, existing i18n/game-domain helpers.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-09-capacity-aware-supply-planner-design.md`.
- No `simulateDay` replay, forecast RNG, save schema, persistence, worker, generic optimizer, or inter-city route scheduler.
- Aggregate retail cities sharing one supply inventory; do not predict recurring-route dispatch quantities or in-transit arrivals. Relevant active outbound logistics suppresses capital recommendation until HPA-297.
- Clamp potential demand by `REPLENISHMENT_INTERVAL_DAYS` and `targetStock`.
- Finished retail fallback uses `ProductCategory.importCost`; raw/intermediate imports use `MATERIALS[materialId].importCost`.
- Product Chains owns producer mapping and throughput arithmetic.
- Rail modeling is required-chain **connectivity only**; no shared rail-budget/max-flow optimizer.
- Recommend only against the primary bottleneck.
- Planner actions navigate; they never commit mutations.
- Current scenario/pending/content availability participates in candidate feasibility.
- Preserve the existing `isSupplyAdvisorOpen` calculation gate.
- Tasks 1–3 run focused ESLint/Prettier before commit; full `bun run lint` is a final gate.

---

## File Structure

### New

- `src/lib/game/supplyPlanner.ts`
- `src/lib/game/supplyPlanner.spec.ts`
- `src/lib/game/supplyPlannerActions.ts`
- `src/lib/game/supplyPlannerActions.spec.ts`

### Existing domain files

- `src/lib/game/productChainGraph.ts` / `.spec.ts` — extend throughput helper generics + material output capacity; reuse category and industry-scope helpers.
- `src/lib/game/rail.ts` — reuse primitives; no new pathfinder.
- `src/lib/game/retailSupply.ts` — reuse exported cadence; no behavior change.
- `src/lib/game/supplyAdvisor.ts` / specs — retain Build Menu availability only after cutover.

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

Task 1 initializes rail-derived fields empty; Task 2 fills them.

### Steps

- [ ] **Step 1: Add category and configured-supply tests**

```ts
it('lists supported carried categories for the requested retail city only', () => {
	const game = createPlannerGameWithTwoRetailCities();
	const ids = listSupplyPlannerCategories(game, 'harbor-city');

	expect(ids).toContain('bottled-water');
	expect(ids).not.toContain('category-only-in-riverside');
});

it('scopes inventory/buildings through getIndustryInventoryScope', () => {
	const snapshot = readySnapshot(createPlannerGameWithTwoRetailCities(), {
		retailCityId: 'harbor-city',
		categoryId: 'bottled-water'
	});

	expect(snapshot.supplyCityId).toBe('industry-city');
	expect(snapshot.buildings.every((row) => row.cityId === 'industry-city')).toBe(true);
});
```

`listSupplyPlannerCategories` extends `getSupportedStoreChainCategories(store)`; snapshot construction calls `getIndustryInventoryScope(game, supplyCityId)`.

- [ ] **Step 2: Add replenishment-ceiling tests**

```ts
it('clamps potential demand by weekly target-stock draw capacity', () => {
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

it('keeps a sold zero-target category as a zero-draw contributor', () => {
	const snapshot = readySnapshot(createZeroTargetPlannerGame(), {
		retailCityId: 'harbor-city',
		categoryId: 'bottled-water'
	});
	const row = snapshot.demandContributors.find((item) => item.retailCityId === 'harbor-city')!;

	expect(row.replenishmentCeilingPerDay).toBe(0);
	expect(row.effectiveDemandPerDay).toBe(0);
	expect(Number.isFinite(row.retailImportCostPerUnit)).toBe(true);
});
```

- [ ] **Step 3: Add shared-retail-claimant tests**

```ts
it('includes all retail cities assigned to the same supply inventory', () => {
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

Use existing world-city deterministic ordering.

- [ ] **Step 4: Lock the finished retail import-cost basis**

```ts
it('uses retail category import price rather than finished material input price', () => {
	const snapshot = readySnapshot(createPlannerGame(), {
		retailCityId: 'harbor-city',
		categoryId: 'bottled-water'
	});

	expect(snapshot.finishedImportCostPerUnit).toBe(2);
	expect(MATERIALS['bottled-water'].importCost).toBe(3);
});
```

This test protects a real current-catalog difference.

- [ ] **Step 5: Add zero-demand, unavailable, and invariant-boundary tests**

```ts
it('keeps a supported zero-demand request ready', () => {
	const result = buildSupplyPlannerSnapshot(createZeroDemandPlannerGame(), {
		retailCityId: 'harbor-city',
		categoryId: 'bottled-water'
	});
	expect(result.status).toBe('ready');
	if (result.status !== 'ready') return;
	expect(result.snapshot.demandPerDay).toBe(0);
});

it('soft-fails an unavailable configured supply city before stats', () => {
	expect(
		buildSupplyPlannerSnapshot(createNullSupplyAssignmentGame(), {
			retailCityId: 'harbor-city',
			categoryId: 'bottled-water'
		})
	).toEqual({ status: 'unavailable', reason: 'supply-city-unavailable' });
});

it('does not hide authoritative inventory corruption behind planner UX', () => {
	expect(() =>
		buildSupplyPlannerSnapshot(createInvalidInventoryPlannerGame(), {
			retailCityId: 'harbor-city',
			categoryId: 'bottled-water'
		})
	).toThrow(/City inventory invariant/);
});
```

- [ ] **Step 6: Implement contributor derivation, including zero-target fallback**

```ts
function buildDemandContributor(
	game: GameState,
	city: City,
	categoryId: string
): SupplyDemandContributor | null {
	const stores = game.stores
		.filter(
			(store) =>
				store.cityId === city.id &&
				store.products.some((product) => product.categoryId === categoryId)
		)
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	if (stores.length === 0) return null;

	const potentialDemandPerDay = buildCityDemandPools(game, city)[categoryId] ?? 0;
	let targetUnits = 0;
	let weightedImportCost = 0;
	const fallbackImportCosts: number[] = [];

	for (const store of stores) {
		const product = store.products.find((item) => item.categoryId === categoryId)!;
		const category = getSupportedStoreChainCategories(store).find((item) => item.id === categoryId);
		if (!category) continue;
		targetUnits += product.targetStock;
		weightedImportCost += product.targetStock * category.importCost;
		fallbackImportCosts.push(category.importCost);
	}
	if (fallbackImportCosts.length === 0) return null;

	const replenishmentCeilingPerDay = targetUnits / REPLENISHMENT_INTERVAL_DAYS;
	const retailImportCostPerUnit =
		targetUnits > 0
			? weightedImportCost / targetUnits
			: fallbackImportCosts.reduce((sum, value) => sum + value, 0) / fallbackImportCosts.length;

	return {
		retailCityId: city.id as WorldCityId,
		potentialDemandPerDay,
		replenishmentCeilingPerDay,
		effectiveDemandPerDay: Math.min(potentialDemandPerDay, replenishmentCeilingPerDay),
		retailImportCostPerUnit
	};
}
```

Compute `finishedImportCostPerUnit` as effective-demand-weighted across contributors. If total effective demand is zero, use the selected contributor's deterministic retail import cost.

- [ ] **Step 7: Implement upstream requirement vectors with depth**

Use `MATERIAL_PRODUCER_RECIPES`. Finished depth is 0; recurse inputs with `depth + 1`; sum shared units and retain maximum depth.

Lock Pantry 8/day → Pantry 8 depth 0, Flour 6 depth 1, Grain 7.5 depth 2; Drinks has one aggregated Water row.

- [ ] **Step 8: Detect relevant active outbound logistics without forecasting it**

After requirements exist, collect IDs where:

```ts
route.state === 'active' &&
route.originCityId === snapshot.supplyCityId &&
requiredMaterialIds.has(route.materialId)
```

Do not calculate due dispatch, destination need, route capacity, in-transit reservations, or route cost.

- [ ] **Step 9: Run focused verification and commit**

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts --run --project server
bunx eslint src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
bunx prettier --check src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git add src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(supply): snapshot shared supply demand"
```

A first missing-export/module failure is cutover smoke, not the behavioral RED proof; the assertions above are the meaningful contract.

---

## Task 2: Reuse Throughput and Model Required-Chain Rail Connectivity

**Files:**
- Modify: `src/lib/game/productChainGraph.ts`
- Modify: `src/lib/game/productChainGraph.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`
- Reuse without behavior change: `src/lib/game/rail.ts`

### Interfaces

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

export interface RequiredChainReachability {
	usableBuildingIds: ReadonlySet<string>;
	disconnectedBuildingIds: readonly string[];
	usableSinkBuildingIdsByMaterial: Partial<Record<MaterialId, readonly string[]>>;
}
```

Per material forecast adds `installedCapacityPerDay` and `usableCapacityPerDay`.

### Steps

- [ ] **Step 1: Generalize Product Chains throughput with parity tests**

```ts
it('returns identical throughput for real and lightweight rows', () => {
	const real = [industrialBuilding('water-bottler', 2)];
	const light = real.map(({ typeId, level }) => ({ typeId, level }));

	expect(getRecipeThroughputUnits(light, 'water-bottling')).toBe(
		getRecipeThroughputUnits(real, 'water-bottling')
	);
});

it('calculates only the requested output line', () => {
	expect(
		getMaterialOutputCapacityPerDay([{ typeId: 'water-bottler', level: 1 }], 'bottled-water')
	).toBe(10);
});
```

- [ ] **Step 2: Add connectivity tests for processor pulls and warehouse delivery**

```ts
it('counts an upstream producer connected directly to a usable downstream processor', () => {
	const reachability = requiredReachability(
		pantryChainWithGrainFarmConnectedToFlourMillAndFinalWarehouse()
	);
	expect(reachability.usableBuildingIds.has('grain-farm-1')).toBe(true);
});

it('rejects a finished producer with no warehouse path', () => {
	const reachability = requiredReachability(bottledWaterWithDisconnectedBottler());
	expect(reachability.usableBuildingIds.has('water-bottler-1')).toBe(false);
	expect(reachability.disconnectedBuildingIds).toContain('water-bottler-1');
});
```

- [ ] **Step 3: Implement required-chain reachability with existing rail primitives**

Build the rail network/budget/attach index once. Memoize `{buildingId, outputMaterialId}` recursion:

1. finished output sinks = same-city warehouse buildings;
2. upstream output sinks = buildings producing downstream required materials whose recipes consume the upstream material;
3. downstream candidate must itself be recursively usable;
4. current producer is usable if `findShippingPath` reaches any usable sink;
5. store stable sink IDs per material for Task 3's prospective placement check;
6. cycle guard throws deterministic programmer error.

Never consume the budget. This is connectivity, not rail-capacity allocation.

- [ ] **Step 4: Populate snapshot reachability facts once**

Copy stable `usableBuildingIds`, `disconnectedBuildingIds`, and `usableSinkBuildingIdsByMaterial` into the ready snapshot before projection/candidate work.

- [ ] **Step 5: Add installed-vs-usable projection tests**

```ts
it('does not treat disconnected installed output as usable local supply', () => {
	const projection = projectSupplySnapshot(snapshotWithDisconnectedFinishedProducer());
	const row = material(projection, 'bottled-water');

	expect(row.installedCapacityPerDay).toBeGreaterThan(0);
	expect(row.usableCapacityPerDay).toBe(0);
	expect(row.thirtyDay.importRequiredUnits).toBeGreaterThan(0);
	expect(projection.bottleneck.kind).toBe('rail-disconnected');
});
```

Retain building count/level, inventory cover, 7/30, import, warehouse, zero-demand tests.

- [ ] **Step 6: Implement projection using usable capacity**

```ts
const installed = buildingsForMaterial(snapshot.buildings, requirement.materialId);
const usableIds = new Set(snapshot.usableBuildingIds);
const usable = installed.filter((building) => usableIds.has(building.id));

const installedCapacityPerDay = getMaterialOutputCapacityPerDay(installed, requirement.materialId);
const usableCapacityPerDay = getMaterialOutputCapacityPerDay(usable, requirement.materialId);
const requiredUnits = requirement.requiredPerDay * horizonDays;
const localAvailableUnits = inventoryUnits + usableCapacityPerDay * horizonDays;
const importRequiredUnits = Math.max(0, requiredUnits - localAvailableUnits);
```

- [ ] **Step 7: Implement primary bottleneck ordering**

```text
upstream-most missing producer
→ binding warehouse
→ deepest required disconnected producer
→ largest normalized usable-capacity deficit
→ earliest stockout
→ largest 30-day import reliance
→ none
```

Use code-unit ties.

- [ ] **Step 8: Add explicit limitations**

```ts
export type SupplyPlannerLimitation =
	| { kind: 'active-logistics-not-modeled'; routeIds: readonly string[] }
	| { kind: 'rail-capacity-not-modeled' }
	| { kind: 'store-sales-capacity-not-modeled' };
```

Path existence must never be described as enough rail throughput.

- [ ] **Step 9: Run focused verification and commit**

```bash
bun run test:unit -- src/lib/game/productChainGraph.spec.ts src/lib/game/supplyPlanner.spec.ts --run --project server
bunx eslint src/lib/game/productChainGraph.ts src/lib/game/supplyPlanner.ts src/lib/game/productChainGraph.spec.ts src/lib/game/supplyPlanner.spec.ts
bunx prettier --check src/lib/game/productChainGraph.ts src/lib/game/supplyPlanner.ts src/lib/game/productChainGraph.spec.ts src/lib/game/supplyPlanner.spec.ts
git add src/lib/game/productChainGraph.ts src/lib/game/productChainGraph.spec.ts src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(supply): project usable local capacity"
```

---

## Task 3: Add Current Availability, Rail-Aware Build Feasibility, and Economics

**Files:**
- Create: `src/lib/game/supplyPlannerActions.ts`
- Create: `src/lib/game/supplyPlannerActions.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts` only for exported plan/comparison types if needed

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
	preRailNetCashBenefit30: number | null;
	netCashBenefit30: number | null;
	requiresRailConnection: boolean;
	requiresAdditionalProducerBuilds: boolean;
	stockoutImprovementDays: number;
	warehouseFreeGain: number;
}
```

A build candidate may carry `potentialProjectionAfterRail`; the normal candidate projection never invents connectivity.

### Steps

- [ ] **Step 1: Lock primary-bottleneck-only candidate generation**

```ts
it('does not fan producer candidates beyond the primary material', () => {
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

- [ ] **Step 2: Lock upstream-first missing-producer semantics**

A Pantry fixture with Grain Farm, Flour Mill, and Pantry Works all missing chooses Grain first.

Add a second test:

```ts
it('treats an upstream missing producer as a structural prerequisite when downstream stages are also absent', () => {
	const plan = readyPlan(gameWithSeveralMissingPantryStages(), sandboxAvailability());

	expect(plan.baseline.bottleneck).toMatchObject({ kind: 'missing-producer', materialId: 'grain' });
	expect(plan.recommendation.action).toMatchObject({ kind: 'build-producer', materialId: 'grain' });
	expect(plan.recommendation.comparison.requiresAdditionalProducerBuilds).toBe(true);
	expect(plan.recommendation.comparison.preRailNetCashBenefit30).toBeNull();
	expect(plan.recommendation.comparison.netCashBenefit30).toBeNull();
});
```

Do not fabricate avoided-import ROI before the downstream consuming stages exist.

- [ ] **Step 3: Lock current route/scenario availability**

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

Also cover build disabled/pending, upgrade unavailable, and rail unavailable.

- [ ] **Step 4: Hoist placement context and detect rail-ready prospective placements**

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
	const budget = createRailBudget(network); // connectivity only, never consumed
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

Never rebuild `IndustrialPlacementContext` per tile.

- [ ] **Step 5: Lock rail and warehouse prerequisite recommendations**

```ts
it('recommends connecting an existing required producer before adding capacity', () => {
	const plan = readyPlan(gameWithDisconnectedRequiredProducer(), sandboxAvailability());
	expect(plan.baseline.bottleneck.kind).toBe('rail-disconnected');
	expect(plan.recommendation.action.kind).toBe('connect-rail');
});

it('recommends warehouse capacity when storage is binding', () => {
	const plan = readyPlan(gameWithWarehousePressure(), sandboxAvailability());
	expect(plan.baseline.bottleneck.kind).toBe('warehouse-capacity');
	expect(plan.recommendation.action.kind).toBe('build-warehouse');
	expect(plan.recommendation.comparison.warehouseFreeGain).toBeGreaterThan(0);
});
```

Rail action cost remains unknown until real rail preview; never display it as free.

- [ ] **Step 6: Lock rail-incomplete producer economics**

```ts
it('does not invent usable capacity or final ROI when a new producer needs future rail', () => {
	const candidate = producerBuildCandidate(gameWithNoRailReadyProducerPlacement());

	expect(candidate.comparison.requiresRailConnection).toBe(true);
	expect(candidate.comparison.netCashBenefit30).toBeNull();
	expect(candidate.potentialProjectionAfterRail).toBeDefined();
	expect(candidate.projection.totals.importUnits30).toBe(candidate.baseline.totals.importUnits30);
});
```

For a structurally complete chain, a positive `preRailNetCashBenefit30` can justify the producer as a prerequisite; label it before rail cost.

- [ ] **Step 7: Implement copied hypothetical projections**

- existing usable upgrade → level+1, normal projection, complete economics;
- new producer with rail-ready valid placement → add synthetic building + usable ID, normal projection, complete economics;
- new producer without rail-ready placement → normal projection leaves usable capacity unchanged; optional `potentialProjectionAfterRail` treats the synthetic row as usable only for explicitly pre-rail evidence;
- if **any other required producer remains missing after the candidate**, set `requiresAdditionalProducerBuilds=true` and do not calculate import-savings ROI for this standalone action;
- warehouse → add authoritative capacity only;
- connect rail → no hypothetical path.

- [ ] **Step 8: Lock the avoided-import price source**

```ts
const avoidedImportUnitValue =
	targetMaterialId === snapshot.finishedMaterialId
		? snapshot.finishedImportCostPerUnit
		: MATERIALS[targetMaterialId].importCost;
```

Add an exact Bottled Water economics assertion using retail `2`, not material `3`.

- [ ] **Step 9: Implement producer economics only when the structural chain exists**

If `requiresAdditionalProducerBuilds`, set both cash-benefit fields to `null` and keep only known upfront cost evidence.

Otherwise use the candidate's complete or potential-after-rail projection:

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

No event multipliers, logistics costs, or shared rail throughput are claimed.

- [ ] **Step 10: Rank by bottleneck type**

1. Relevant active logistics → no-op `logistics-contention-not-modeled`.
2. Missing producer:
   - action available + valid + affordable required;
   - if additional producer stages remain missing, recommend the upstream build as structural prerequisite with null ROI;
   - if it is the last missing stage, use complete/pre-rail economics and allow known non-positive economics to choose no-op.
3. Rail disconnected → `connect-rail` if available, else `action-unavailable`.
4. Warehouse → feasible/affordable positive-headroom warehouse, else no-op.
5. Operational material bottleneck → available + valid + affordable; complete positive-net before unresolved rail-cost; then cash benefit, shortage30/7, imports, stockout, lower known cost, stable key.
6. Known non-positive economics → no-op `ineffective`.

- [ ] **Step 11: Verify immutability and deterministic ties**

Deep-clone game/snapshot before candidate evaluation. Use code-unit ordering, never `localeCompare`, for engine ties.

- [ ] **Step 12: Run focused verification and commit**

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
- Modify: EN/JA/zh-Hant catalogs + locale parity spec

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

- [ ] **Step 1: Rewrite component tests around planner states**

Cover ready/zero-demand/empty/unavailable, target clamp, shared claimants, retail import price, installed/usable capacity, rail and warehouse states, complete/pre-rail/structurally-incomplete economics, active-logistics limitation, callbacks, and existing dialog/focus behavior.

- [ ] **Step 2: Run existing component test for cutover smoke**

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts --run --project client
```

Old-prop/type failure is cutover smoke; Step 1 assertions are the behavioral RED contract.

- [ ] **Step 3: Implement metric/text UI with existing styles**

No charts. Render:

- “net 30-day estimate” only when complete;
- “before rail cost” when pre-rail only;
- “structural prerequisite — ROI unavailable until remaining producer stages exist” when `requiresAdditionalProducerBuilds`;
- rail action cost as calculated later by the rail builder, never `$0`.

- [ ] **Step 4: Add localized copy together**

Add keys for demand clamp/claimants, retail import price, usable capacity, rail/warehouse bottlenecks, producer costs, complete/pre-rail/structural economic states, limitations, no-op reasons, and actions.

- [ ] **Step 5: Run client/static checks and commit**

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

- [ ] **Step 1: Add Product Chains `onPlanCategory(categoryId)`**

Product Chains remains calculation-free.

- [ ] **Step 2: Preserve closed-modal calculation gating**

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

Add route/client coverage proving planner derivation is absent while closed.

- [ ] **Step 3: Derive current action availability from existing gates**

```ts
let plannerActionAvailability = $derived<SupplyPlannerActionAvailability>({
	canBuildIndustry: canStartIndustryExpansion,
	canUpgradeIndustry: mutationAvailability.upgradeIndustrialBuilding,
	canBuildRail: mutationAvailability.buildRail,
	allowedIndustryBuildingTypeIds
});
```

- [ ] **Step 4: Preserve category/horizon context across close/reopen**

Fallback only if the stored category is no longer valid.

- [ ] **Step 5: Build/warehouse handoff**

Re-check current recommendation, switch to the supply-city industry map through existing city-selection flow, then call `armIndustryPlacement`. No controller build mutation.

- [ ] **Step 6: Upgrade handoff**

Resolve current building, switch city, select tile, let existing inspector own Upgrade.

- [ ] **Step 7: Rail handoff**

Resolve the disconnected building and current rail availability, switch city, close overlays/other placement, then:

```ts
railBuildMode = {
	step: 'routing',
	originBuildingId: building.id,
	waypoints: []
};
```

Existing rail preview determines path/new cells/cost. Do not call `gameRouteController.buildRail`.

- [ ] **Step 8: Replace `AdvisorChain` props/wiring**

Retain map pause, shortcut swallowing, focus, Escape ordering.

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

Application-code matches must be zero before deletion.

- [ ] **Step 2: Reduce `supplyAdvisor.ts` to Build Menu availability**

Keep `getAvailableMaterialIds(game)`. Delete old chain types/functions/tests. No compatibility exports.

- [ ] **Step 3: Keep availability tests**

Protect active-industry city inventory, buffered materials, optimistic placed-building outputs used for Build Menu hints, and defensive unavailable-inventory behavior.

- [ ] **Step 4: Create deterministic E2E state through existing save injection**

Reuse `installSandboxAutoSave(page, game)` from `retail-sim.e2e.ts`. It validates current save-store state, writes `BROWSER_SAVE_STORAGE_KEY` (`serpens.saves.v2`), reloads, resumes, closes Saves, and waits for retail readiness.

Create `warehousePressurePlannerGame()` with supported category, known targets, configured/connected supply chain, binding warehouse pressure, enough cash, valid warehouse placement, and no relevant active recurring route.

Do not advance arbitrary days to manufacture pressure.

- [ ] **Step 5: Add required `supply planner warehouse` E2E**

1. install injected save;
2. open planner;
3. verify selected-city demand evidence, supply city, 7/30 controls, warehouse bottleneck;
4. verify Build Warehouse recommendation;
5. activate and assert warehouse industry placement is armed;
6. cancel;
7. reopen and verify category/horizon context survives.

Keep exact math in node tests.

- [ ] **Step 6: Keep rail handoff focused**

Cover disconnected producer → `connect-rail` → routing-origin handoff in `page.svelte.spec.ts`; add E2E only if it stays tiny.

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
- zero demand and zero-target sold products remain valid ready context;
- demand is target/cadence-clamped and aggregates all shared retail claimants;
- finished economics uses retail category import cost;
- upstream requirements/depth are deterministic;
- upstream producer→processor connectivity works;
- finished output reaches warehouse;
- path existence is not described as rail throughput;
- active outbound logistics suppresses capital recommendation without route forecast;
- scenario/pending/content gates affect recommendations;
- placement context is hoisted;
- missing producer is upstream-first;
- structurally incomplete missing chains have null ROI rather than fabricated import savings;
- Product Chains owns throughput;
- complete/pre-rail/structural economic states are distinct;
- build/warehouse/upgrade/rail handoffs do not commit;
- planner calculation is closed-modal gated;
- Product Chains can open planner;
- `AdvisorChain` is deleted without shim;
- no HPA-297 route/in-transit implementation leaked in.

- [ ] **Step 10: Commit cleanup/E2E**

```bash
git add src/lib/game/supplyAdvisor.ts src/lib/game/supplyAdvisor.spec.ts src/routes/retail-sim.e2e.ts
git add -u
git commit -m "test(supply): verify planner handoff"
```

---

## Implementation Order Rationale

1. **Snapshot/demand first** fixes shared claimants, target/cadence ceiling, retail import-price basis, and scope before ranking exists.
2. **Throughput/connectivity second** fixes local-capacity truth before comparison axes are tuned.
3. **Actions/economics third** ranks stable, actionable facts and explicitly distinguishes complete, pre-rail, and structural-prerequisite economics.
4. **UI fourth** renders typed evidence rather than deriving math in Svelte.
5. **Route wiring fifth** reuses current scenario gates and action workflows.
6. **Cleanup/E2E last** deletes the old model after replacement is wired and uses deterministic save injection.

## Self-Review

- Same two planner modules; no new planner subsystem.
- No full simulation replay.
- No rail flow optimizer; required-chain connectivity only.
- No inter-city route forecast; active logistics is a conservative guard.
- No guessed future rail cost or fabricated ROI for incomplete producer chains.
- No duplicate product/throughput/city-scope/placement formulas.
- Every task names concrete files, tests, algorithms, verification commands, and commit boundaries; no TODO/TBD placeholders.