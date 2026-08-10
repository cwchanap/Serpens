# Capacity-Aware Supply Planner and 30-Day Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the presence-only Supply Advisor with a deterministic 7/30-day local-network planner that models shared retail demand, replenishment ceilings, warehouse-deliverable production, one primary bottleneck, and economically explainable actions without replaying the full simulation.

**Architecture:** Keep two planner modules: `supplyPlanner.ts` owns immutable snapshot/demand/requirement/projection/bottleneck contracts; `supplyPlannerActions.ts` owns primary-bottleneck candidates, current action availability, hypothetical comparison, and recommendation ranking. Extend existing Product Chains, rail-shipping, retail-supply, inventory, placement, and route boundaries instead of copying their rules. Keep `SupplyAdvisor.svelte` as the modal shell and planner UI state route-local.

**Tech Stack:** SvelteKit + Svelte 5 runes, TypeScript, Vitest server/client projects, Playwright, existing game-domain/i18n helpers.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-09-capacity-aware-supply-planner-design.md`.
- No `simulateDay` replay, forecast RNG, save schema, persistence, autosave, worker, optimizer framework, or route scheduler.
- HPA-281 aggregates **retail** claimants sharing one supply city but does not predict recurring-route dispatch quantities or in-transit arrivals; relevant active outbound logistics becomes an explicit limitation and suppresses capital recommendation until HPA-297.
- `buildCityDemandPools` is potential demand; effective supply demand is clamped by the existing weekly replenishment cadence and store target stock.
- Product Chains owns producer mapping and throughput arithmetic.
- Local headline capacity excludes existing producers that have no warehouse rail path. Do not add a max-flow/rail-capacity optimizer in this ticket.
- Recommendations target only the primary bottleneck.
- Planner actions navigate; they never commit build, upgrade, rail, or warehouse mutations.
- Current route/scenario action availability participates in candidate feasibility so the UI never recommends an action the route will silently refuse.
- Preserve the existing closed-overlay derivation gate.
- Per-task commits run the repo's lint-staged hooks. Tasks adding/changing domain TypeScript also run focused ESLint/Prettier commands before commit; full `bun run lint` remains a final gate.

---

## File Structure

### New

- `src/lib/game/supplyPlanner.ts` — request/result contracts, demand contributors, snapshot, demand→upstream propagation, projections, limitations, primary bottleneck.
- `src/lib/game/supplyPlanner.spec.ts` — snapshot/demand/rail/projection/invariant/immutability tests.
- `src/lib/game/supplyPlannerActions.ts` — current action availability, primary-bottleneck candidates, economics, hypothetical comparisons, ranking.
- `src/lib/game/supplyPlannerActions.spec.ts` — action/ranking/availability/economics tests.

### Existing domain files extended

- `src/lib/game/productChainGraph.ts` / `.spec.ts` — reuse lightweight throughput rows + material-specific output capacity; reuse existing category/supply-scope helpers.
- `src/lib/game/railShipping.ts` / rail shipping specs — add a pure warehouse-delivery reachability selector extracted from current push rules.
- `src/lib/game/retailSupply.ts` — no behavior change; reuse exported `REPLENISHMENT_INTERVAL_DAYS`.
- `src/lib/game/supplyAdvisor.ts` / specs — keep `getAvailableMaterialIds`; delete obsolete presence-chain API only after UI cutover.

### Existing UI/composition files

- `src/lib/components/game/SupplyAdvisor.svelte` / spec.
- `src/lib/components/game/ProductChainsPanel.svelte` / spec.
- `src/routes/ManagementPanelHost.svelte`.
- `src/routes/+page.svelte` / `page.svelte.spec.ts`.
- `src/lib/i18n/messages/en.ts`, `ja.ts`, `zh-Hant.ts`, plus locale parity spec.
- `src/routes/retail-sim.e2e.ts`.

---

## Task 1: Build the Supply-City Snapshot from Real Demand Claimants

**Files:**
- Create: `src/lib/game/supplyPlanner.ts`
- Create: `src/lib/game/supplyPlanner.spec.ts`
- Read/reuse: `stock.ts`, `retailSupply.ts`, `productChainGraph.ts`, `cityInventory.ts`, `interCityLogistics.ts`

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

`deliverableBuildingIds` / `disconnectedBuildingIds` are populated in Task 2; Task 1 initializes both to `[]`.

### Steps

- [ ] **Step 1: Write snapshot/category tests first**

Use valid world/city-inventory fixtures. Add assertions for requested city scope and helper reuse.

```ts
it('lists only supported sold categories for the requested retail city', () => {
	const game = createPlannerGameWithTwoRetailCities();
	const categories = listSupplyPlannerCategories(game, 'harbor-city');

	expect(categories).toContain('bottled-water');
	expect(categories).not.toContain('category-sold-only-in-second-city');
});

it('builds supply scope through the configured industry inventory', () => {
	const game = createPlannerGameWithTwoRetailCities();
	const result = buildSupplyPlannerSnapshot(game, {
		retailCityId: 'harbor-city',
		categoryId: 'bottled-water'
	});

	expect(result.status).toBe('ready');
	if (result.status !== 'ready') return;
	expect(result.snapshot.supplyCityId).toBe('industry-city');
	expect(result.snapshot.buildings.every((row) => row.cityId === 'industry-city')).toBe(true);
});
```

- [ ] **Step 2: Write replenishment-clamp and shared-claimant tests**

```ts
it('clamps potential demand by weekly store replenishment capacity', () => {
	const game = createPlannerGame({
		// Fixture makes city potential demand > 70/day while one store targetStock is 70.
		storeTargetStock: 70
	});
	const result = readySnapshot(game, 'harbor-city', 'bottled-water');
	const contributor = result.demandContributors.find((row) => row.retailCityId === 'harbor-city')!;

	expect(contributor.replenishmentCeilingPerDay).toBeCloseTo(70 / REPLENISHMENT_INTERVAL_DAYS);
	expect(contributor.effectiveDemandPerDay).toBeLessThanOrEqual(
		contributor.replenishmentCeilingPerDay
	);
});

it('adds every retail claimant assigned to the same supply city', () => {
	const result = readySnapshot(
		createPlannerGameWithTwoRetailCitiesSharingSupply(),
		'harbor-city',
		'bottled-water'
	);

	expect(result.demandContributors.map((row) => row.retailCityId)).toEqual([
		'harbor-city',
		'riverside'
	]);
	expect(result.demandPerDay).toBeCloseTo(
		result.demandContributors.reduce((sum, row) => sum + row.effectiveDemandPerDay, 0)
	);
});
```

Keep contributor ordering deterministic with `compareWorldCityIds`.

- [ ] **Step 3: Write zero-demand, unavailable, and invariant-boundary tests**

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

it('soft-fails unavailable configured supply before stats', () => {
	const result = buildSupplyPlannerSnapshot(createGameWithNullSupplyAssignment(), {
		retailCityId: 'harbor-city',
		categoryId: 'bottled-water'
	});
	expect(result).toEqual({ status: 'unavailable', reason: 'supply-city-unavailable' });
});

it('does not disguise authoritative inventory corruption as planner UX', () => {
	expect(() =>
		buildSupplyPlannerSnapshot(createPlannerGameWithInvalidInventoryQuantity(), {
			retailCityId: 'harbor-city',
			categoryId: 'bottled-water'
		})
	).toThrow(/City inventory invariant/);
});
```

- [ ] **Step 4: Implement category listing by extending existing Product Chains category logic**

For the requested retail city, iterate its stores, call `getSupportedStoreChainCategories(store)`, filter to categories the store actually carries (the helper already does that), dedupe IDs, and stable-sort. Do not maintain another supported-product registry.

- [ ] **Step 5: Implement the replenishment ceiling helper**

```ts
function getRetailCategoryDemandContributor(
	game: GameState,
	retailCity: City,
	categoryId: string
): SupplyDemandContributor {
	const potentialDemandPerDay = buildCityDemandPools(game, retailCity)[categoryId] ?? 0;
	const targetUnits = game.stores
		.filter((store) => store.cityId === retailCity.id)
		.flatMap((store) => store.products)
		.filter((product) => product.categoryId === categoryId)
		.reduce((sum, product) => sum + product.targetStock, 0);
	const replenishmentCeilingPerDay = targetUnits / REPLENISHMENT_INTERVAL_DAYS;

	return {
		retailCityId: retailCity.id as WorldCityId,
		potentialDemandPerDay,
		replenishmentCeilingPerDay,
		effectiveDemandPerDay: Math.min(potentialDemandPerDay, replenishmentCeilingPerDay)
	};
}
```

Do not clamp by `reorderThreshold`; the maximum amount the supply city can be asked to replace over one replenishment interval is bounded by `targetStock`. Surface the clamp as evidence rather than pretending potential demand disappears.

- [ ] **Step 6: Implement snapshot supply scope with `getIndustryInventoryScope`**

Exact ordering:

1. resolve requested opened/generated retail city;
2. validate requested category through `getFinishedMaterialIdForCategory` and `MATERIAL_PRODUCER_RECIPES`;
3. resolve its `retailSupplyAssignment`;
4. call `getIndustryInventoryScope(game, supplyCityId)`; if null, return unavailable;
5. call `getCityInventoryStats(game, scope.cityId)` only after scope is non-null;
6. collect all opened/generated retail cities whose assignment has the same `supplyCityId` and which sell this category;
7. build demand contributor rows and sum effective demand;
8. copy `scope.inventory.materials` and lightweight `scope.buildings` rows;
9. record active outbound recurring route IDs where `state === 'active'`, `originCityId === scope.cityId`, and `materialId` is later found in the requirement set.

Do not call Product Chains' active-retail-only `getRetailChainScope`.

- [ ] **Step 7: Implement demand→upstream requirements with depth**

Use `MATERIAL_PRODUCER_RECIPES`. The recursive per-unit vector returns `{ unitsPerFinishedUnit, depth }` per material. When an input is revisited through another branch, sum units and keep the **maximum** depth.

For `pantry`, demand 8/day still produces pantry 8, flour 6, grain 7.5; depths are pantry 0, flour 1, grain 2.

- [ ] **Step 8: Add active-logistics limitation identification after requirements exist**

Once required material IDs are known, filter `game.logistics.recurringRoutes` as described above. Store only IDs in the snapshot; do not calculate route quantity/cadence.

- [ ] **Step 9: Run focused verification and commit**

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts --run --project server
bunx eslint src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
bunx prettier --check src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git add src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(supply): snapshot shared supply demand"
```

The commit hook's lint-staged pass remains authoritative for staged formatting/lint fixes.

---

## Task 2: Reuse Throughput, Gate Existing Producers by Rail Reachability, and Project 7/30 Days

**Files:**
- Modify: `src/lib/game/productChainGraph.ts`
- Modify: `src/lib/game/productChainGraph.spec.ts`
- Modify: `src/lib/game/railShipping.ts`
- Modify: relevant existing rail shipping spec (`railShipping.spec.ts` or focused edge spec)
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`

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

### Rail reachability interface

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

### Projection contracts

```ts
export interface SupplyHorizonMaterialForecast {
	horizonDays: 7 | 30;
	requiredUnits: number;
	localAvailableUnits: number;
	importRequiredUnits: number;
}

export interface SupplyMaterialForecast {
	materialId: MaterialId;
	requiredPerDay: number;
	inventoryUnits: number;
	installedCapacityPerDay: number;
	deliverableCapacityPerDay: number;
	capacityDeltaPerDay: number;
	daysOfCover: number | null;
	projectedStockoutDay: number | null;
	sevenDay: SupplyHorizonMaterialForecast;
	thirtyDay: SupplyHorizonMaterialForecast;
}

export type SupplyBottleneck =
	| { kind: 'missing-producer'; materialId: MaterialId; chainDepth: number }
	| { kind: 'warehouse-capacity'; overflowUnits: number; freeCapacity: number }
	| { kind: 'rail-disconnected'; buildingId: string; materialId: MaterialId }
	| { kind: 'production-capacity'; materialId: MaterialId; deficitPerDay: number }
	| { kind: 'inventory-cover'; materialId: MaterialId; stockoutDay: number }
	| { kind: 'import-reliance'; materialId: MaterialId; importedUnits30: number }
	| { kind: 'none' };
```

### Steps

- [ ] **Step 1: Generalize Product Chains throughput with parity tests**

```ts
it('uses the same throughput for real and lightweight rows', () => {
	const real = [industrialBuilding('water-bottler', 2)];
	const light = real.map(({ typeId, level }) => ({ typeId, level }));

	expect(getRecipeThroughputUnits(light, 'water-bottling')).toBe(
		getRecipeThroughputUnits(real, 'water-bottling')
	);
});

it('returns capacity for the requested output material only', () => {
	expect(
		getMaterialOutputCapacityPerDay([{ typeId: 'water-bottler', level: 1 }], 'bottled-water')
	).toBe(10);
});
```

Implementation uses the existing `MATERIAL_PRODUCER_RECIPES` map, finds the matching output line, and multiplies that output quantity by `getRecipeThroughputUnits`.

- [ ] **Step 2: Add rail reachability tests around the existing push rules**

```ts
it('marks a producer disconnected when no budget-positive path reaches a warehouse', () => {
	const game = gameWithProducerWarehouseAndNoConnectingRail();
	const reachability = getWarehouseDeliveryReachability(game, 'industry-city');

	expect(reachability.deliverableBuildingIds.has('producer-1')).toBe(false);
	expect(reachability.disconnectedBuildingIds).toContain('producer-1');
});

it('marks a producer deliverable when a rail path reaches a warehouse attach cell', () => {
	const game = gameWithConnectedProducerAndWarehouse();
	const reachability = getWarehouseDeliveryReachability(game, 'industry-city');

	expect(reachability.deliverableBuildingIds.has('producer-1')).toBe(true);
});
```

- [ ] **Step 3: Implement reachability by reusing rail primitives**

Inside `railShipping.ts`:

```ts
export function getWarehouseDeliveryReachability(
	game: GameState,
	cityId: WorldCityId
): WarehouseDeliveryReachability {
	const city = game.industryCities.find((candidate) => candidate.id === cityId);
	if (!city) return { deliverableBuildingIds: new Set(), disconnectedBuildingIds: [] };

	const network = buildRailNetwork(city);
	const budget = createRailBudget(network);
	const cityBuildings = game.industrialBuildings.filter((building) => building.cityId === cityId);
	const warehouses = cityBuildings
		.filter((building) => building.typeId === 'warehouse')
		.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
	const warehouseAttach = warehouses.flatMap((warehouse) =>
		getBuildingAttachCellKeys(network, warehouse)
	);
	const deliverableBuildingIds = new Set<string>();
	const disconnectedBuildingIds: string[] = [];

	for (const building of cityBuildings) {
		const type = INDUSTRIAL_BUILDING_TYPES[building.typeId];
		if (!type?.recipeId) continue;
		const fromKeys = getBuildingAttachCellKeys(network, building);
		const path = findShippingPath(network, budget, fromKeys, warehouseAttach);
		if (path) deliverableBuildingIds.add(building.id);
		else disconnectedBuildingIds.push(building.id);
	}

	return {
		deliverableBuildingIds,
		disconnectedBuildingIds: disconnectedBuildingIds.sort()
	};
}
```

Do **not** consume the budget: this helper answers path existence only. HPA-281 explicitly does not solve shared rail throughput. Because `findShippingPath` only traverses budget-positive cells, broken/unattached networks resolve consistently with live rail semantics.

- [ ] **Step 4: Populate snapshot reachability before projection**

After Task 1 builds the ready snapshot, call the rail helper once for the supply city and copy the sets into stable arrays.

- [ ] **Step 5: Add projection tests for installed vs deliverable capacity**

```ts
it('does not count disconnected installed producers as local deliverable capacity', () => {
	const projection = projectSupplySnapshot(snapshotWithDisconnectedWaterBottler());
	const row = material(projection, 'bottled-water');

	expect(row.installedCapacityPerDay).toBeGreaterThan(0);
	expect(row.deliverableCapacityPerDay).toBe(0);
	expect(projection.bottleneck.kind).toBe('rail-disconnected');
});
```

Also retain count/level, 7/30, inventory-cover, import, warehouse free/overflow, and zero-demand tests.

- [ ] **Step 6: Implement projection with deliverable rows**

```ts
const installedBuildings = snapshot.buildings.filter((building) =>
	producerTypeMatchesMaterial(building.typeId, requirement.materialId)
);
const deliverableIds = new Set(snapshot.deliverableBuildingIds);
const deliverableBuildings = installedBuildings.filter((building) => deliverableIds.has(building.id));
const installedCapacityPerDay = getMaterialOutputCapacityPerDay(
	installedBuildings,
	requirement.materialId
);
const deliverableCapacityPerDay = getMaterialOutputCapacityPerDay(
	deliverableBuildings,
	requirement.materialId
);
```

Headline local availability uses `deliverableCapacityPerDay`.

- [ ] **Step 7: Implement primary-bottleneck ordering**

For missing producer ties, sort **descending `chainDepth`**, then code-unit material ID. Then warehouse, rail-disconnected, normalized production deficit, earliest stockout, largest import reliance, none.

For rail-disconnected ties, prefer the deepest required material first, then building ID.

- [ ] **Step 8: Add limitations**

```ts
export type SupplyPlannerLimitation =
	| { kind: 'active-logistics-not-modeled'; routeIds: readonly string[] }
	| { kind: 'rail-capacity-not-modeled' }
	| { kind: 'store-sales-capacity-not-modeled' };
```

Always explain that path **capacity sharing** is not projected; if `activeOutboundRouteIds.length > 0`, include the logistics limitation.

- [ ] **Step 9: Run focused domain verification and commit**

```bash
bun run test:unit -- src/lib/game/productChainGraph.spec.ts src/lib/game/railShipping.spec.ts src/lib/game/supplyPlanner.spec.ts --run --project server
bunx eslint src/lib/game/productChainGraph.ts src/lib/game/railShipping.ts src/lib/game/supplyPlanner.ts src/lib/game/productChainGraph.spec.ts src/lib/game/railShipping.spec.ts src/lib/game/supplyPlanner.spec.ts
bunx prettier --check src/lib/game/productChainGraph.ts src/lib/game/railShipping.ts src/lib/game/supplyPlanner.ts src/lib/game/productChainGraph.spec.ts src/lib/game/railShipping.spec.ts src/lib/game/supplyPlanner.spec.ts
git add src/lib/game/productChainGraph.ts src/lib/game/productChainGraph.spec.ts src/lib/game/railShipping.ts src/lib/game/railShipping.spec.ts src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(supply): project deliverable local capacity"
```

---

## Task 3: Add Action Availability, Economics, and Primary-Bottleneck Recommendations

**Files:**
- Create: `src/lib/game/supplyPlannerActions.ts`
- Create: `src/lib/game/supplyPlannerActions.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts` for exported plan/comparison types only if needed

### Interfaces

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

export function buildSupplyPlan(
	game: GameState,
	request: SupplyPlannerRequest,
	availability: SupplyPlannerActionAvailability
): SupplyPlannerResult;
```

### Steps

- [ ] **Step 1: Test primary-bottleneck-only candidate generation**

```ts
it('never fans producer actions out beyond the primary material bottleneck', () => {
	const plan = readyPlan(gameWithSeveralMaterialDeficits(), sandboxAvailability());
	const bottleneck = plan.baseline.bottleneck;
	if (!('materialId' in bottleneck)) throw new Error('fixture requires material bottleneck');

	for (const candidate of plan.alternatives) {
		if (candidate.action.kind === 'build-producer' || candidate.action.kind === 'upgrade-building') {
			expect(candidate.action.materialId).toBe(bottleneck.materialId);
		}
	}
});
```

- [ ] **Step 2: Test missing-producer ordering is upstream-first**

A pantry fixture with no grain farm/flour mill/pantry works must choose grain's producer before alphabetically earlier downstream material IDs.

- [ ] **Step 3: Test current route/scenario availability gates**

```ts
it('cannot recommend a scenario-disallowed building type', () => {
	const plan = readyPlan(gameMissingWaterProducer(), {
		canBuildIndustry: true,
		canUpgradeIndustry: true,
		canBuildRail: true,
		allowedIndustryBuildingTypeIds: []
	});

	expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'action-unavailable' });
});
```

Also cover `canBuildIndustry=false`, `canUpgradeIndustry=false`, and `canBuildRail=false`.

- [ ] **Step 4: Hoist industrial placement context once per build candidate**

```ts
function hasValidPlacement(
	game: GameState,
	supplyCityId: WorldCityId,
	buildingTypeId: IndustrialBuildingTypeId
): boolean {
	const scopedGame = { ...game, activeIndustryCityId: supplyCityId };
	const city = scopedGame.industryCities.find((candidate) => candidate.id === supplyCityId);
	if (!city) return false;
	const context = createIndustrialPlacementContext(scopedGame);
	if (!context) return false;

	return city.tiles.some(
		(tile) =>
			getIndustrialPlacementBlockReasonWithContext(context, tile.id, buildingTypeId) === null
	);
}
```

Never call `getIndustrialPlacementBlockReason` inside `city.tiles.some`.

- [ ] **Step 5: Test rail and warehouse prerequisite recommendations**

```ts
it('recommends rail connection before adding more producer capacity', () => {
	const plan = readyPlan(gameWithDisconnectedRequiredProducer(), sandboxAvailability());
	expect(plan.baseline.bottleneck.kind).toBe('rail-disconnected');
	expect(plan.recommendation.action.kind).toBe('connect-rail');
});

it('recommends a warehouse when storage is binding', () => {
	const plan = readyPlan(gameWithWarehousePressure(), sandboxAvailability());
	expect(plan.baseline.bottleneck.kind).toBe('warehouse-capacity');
	expect(plan.recommendation.action.kind).toBe('build-warehouse');
	expect(plan.recommendation.comparison.warehouseFreeGain).toBeGreaterThan(0);
});
```

`connect-rail` carries no guessed cost because cost depends on the real player-chosen path.

- [ ] **Step 6: Implement hypothetical copied snapshots for build/upgrade/warehouse**

Do not mutate game/snapshot. Existing producer builds/upgrades rerun the same projector. A build candidate's projection must not invent a rail path; if the hypothetical row cannot be established as deliverable from current topology, its shortage improvement remains zero and the UI explains that a rail connection is additionally required.

Warehouse hypothetical adds only authoritative warehouse capacity; it does not invent new rail attachments at an unknown placement.

- [ ] **Step 7: Add cash-comparison regression tests**

```ts
it('changes recommendation when import value makes production economically useful', () => {
	const lowValue = readyPlan(gameWithPrimaryImportCost(1), sandboxAvailability());
	const highValue = readyPlan(gameWithPrimaryImportCost(20), sandboxAvailability());

	expect(highValue.recommendation.comparison.netCashBenefit30).toBeGreaterThan(
		lowValue.recommendation.comparison.netCashBenefit30
	);
});

it('preserves cash when incremental production costs exceed avoided imports', () => {
	const plan = readyPlan(gameWhereProducerCostsExceedAvoidedImports(), sandboxAvailability());
	expect(plan.recommendation.action.kind).toBe('none');
});
```

- [ ] **Step 8: Implement 30-day economics for the primary material**

For build/upgrade actions:

```ts
const targetImportReductionUnits30 = Math.max(
	0,
	baselineTarget.thirtyDay.importRequiredUnits - candidateTarget.thirtyDay.importRequiredUnits
);
const importSpendReduction30 =
	targetImportReductionUnits30 * MATERIALS[targetMaterialId].importCost;

const throughputDelta = Math.max(
	0,
	candidateRecipeThroughput - baselineRecipeThroughput
);
const incrementalRecipeOperatingCost30 = throughputDelta * recipe.operatingCost * 30;
const incrementalFlatOperatingCost30 =
	action.kind === 'build-producer' ? buildingType.dailyOperatingCost * 30 : 0;

const incrementalInputImportSpend30 = recipe.inputs.reduce((sum, input) => {
	const inputRow = baseline.materials.find((row) => row.materialId === input.materialId);
	if (!inputRow || inputRow.thirtyDay.requiredUnits <= 0) return sum;
	const importShare = Math.min(
		1,
		inputRow.thirtyDay.importRequiredUnits / inputRow.thirtyDay.requiredUnits
	);
	const additionalInputUnits30 = input.quantity * throughputDelta * 30;
	return sum + additionalInputUnits30 * importShare * MATERIALS[input.materialId].importCost;
}, 0);

const netCashBenefit30 =
	importSpendReduction30 -
	action.cost -
	incrementalRecipeOperatingCost30 -
	incrementalFlatOperatingCost30 -
	incrementalInputImportSpend30;
```

This is explicitly a base-cost estimate. Do not claim it models timed event multipliers or inter-city logistics costs.

- [ ] **Step 9: Rank by bottleneck type**

Rules:

1. If `active-logistics-not-modeled` touches the requirement set: recommendation is `none/logistics-contention-not-modeled`; still expose baseline evidence.
2. Rail-disconnected: recommend `connect-rail` when `canBuildRail`, otherwise `none/action-unavailable`.
3. Warehouse: feasible + affordable warehouse with positive headroom wins; otherwise appropriate no-op.
4. Material bottleneck: feasible + currently allowed + affordable; larger positive `netCashBenefit30`, then shortage30, shortage7, import units, stockout, lower cost, stable key.
5. If all material candidates have `netCashBenefit30 <= 0`, recommend no-op `ineffective`.

- [ ] **Step 10: Verify immutability and deterministic ties**

Deep-clone game/snapshot before `buildSupplyPlan`; assert equality afterward. Use code-unit ordering, not `localeCompare`, for engine tie-breaks.

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
- Modify: `src/lib/i18n/messages/en.ts`, `ja.ts`, `zh-Hant.ts`
- Modify: locale parity spec

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

- [ ] **Step 1: Rewrite component tests before changing implementation**

Cover:

- ready plan;
- zero-demand ready/no-op;
- no supported products;
- unavailable supply;
- selected-city potential vs replenishment ceiling/effective demand;
- shared retail claimant rows;
- installed vs deliverable capacity;
- rail-disconnected recommendation;
- warehouse recommendation;
- estimated import savings / incremental costs / net cash benefit;
- active-logistics limitation and suppressed recommendation;
- category/horizon callbacks;
- focus-trap/dialog/close behavior retained from current component.

- [ ] **Step 2: Run client test to establish the prop-shape failure**

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts --run --project client
```

Treat the initial old-prop failure as cutover smoke, not as proof of the planner behavior. The behavioral RED assertions above are the meaningful tests.

- [ ] **Step 3: Implement the planner view with existing styles**

Use metric rows/text, not charts. The UI must label `netCashBenefit30` as an estimate and show its limitations. `connect-rail` copy must say path/cost is chosen in the rail builder rather than displaying `$0`.

- [ ] **Step 4: Add all copy in EN/JA/zh-Hant together**

Add keys for:

- potential demand / replenishment ceiling / effective demand;
- shared supply claimants;
- installed / deliverable capacity;
- rail disconnected;
- warehouse pressure;
- import spend reduction / operating cost / imported input cost / estimated net cash;
- active logistics not modeled;
- store sales capacity / rail path capacity limitations;
- no-op reasons including action unavailable and logistics contention;
- action labels for build/upgrade/warehouse/connect rail.

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

## Task 5: Wire Product Chains, Gated Route Derivation, and Non-Mutating Action Handoffs

**Files:**
- Modify: `src/lib/components/game/ProductChainsPanel.svelte` / spec
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/page.svelte.spec.ts`

### Route-local context

```ts
interface SupplyPlannerUiContext {
	categoryId: string | null;
	horizonDays: 7 | 30;
}
```

### Steps

- [ ] **Step 1: Add Product Chains `Plan this chain` test/callback**

The active category invokes `onPlanCategory(categoryId)`. Product Chains remains calculation-free.

- [ ] **Step 2: Add route tests that planner calculation is gated by the modal**

Preserve the current pattern around `supplyAdvisorChains`:

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

Do not calculate the planner continuously when `isSupplyAdvisorOpen === false`.

- [ ] **Step 3: Derive current action availability from existing route gates**

```ts
let plannerActionAvailability = $derived<SupplyPlannerActionAvailability>({
	canBuildIndustry: canStartIndustryExpansion,
	canUpgradeIndustry: mutationAvailability.upgradeIndustrialBuilding,
	canBuildRail: mutationAvailability.buildRail,
	allowedIndustryBuildingTypeIds
});
```

This incorporates scenario pending state and content restrictions already represented by the route.

- [ ] **Step 4: Preserve selected category/horizon across close/reopen**

Opening from Product Chains sets category; opening from Build Menu keeps the stored valid category or falls back to the first valid category. Closing does not reset context.

- [ ] **Step 5: Implement build/warehouse navigation through existing placement**

Before navigating, re-check current result/action availability. Then switch to the supply-city industry map using the existing city-selection path and call `armIndustryPlacement(buildingTypeId)`. Never call controller build mutation.

- [ ] **Step 6: Implement upgrade navigation**

Resolve the current target building, switch to its city, set `selectedIndustryTileId = building.tileId`, and let the existing inspector own Upgrade.

- [ ] **Step 7: Implement rail recommendation handoff**

For `connect-rail`:

1. resolve the current building and `mutationAvailability.buildRail`;
2. switch to its industry city;
3. close planner/build overlays and clear other placement modes;
4. set `railBuildMode = { step: 'routing', originBuildingId: building.id, waypoints: [] }`;
5. leave destination/path/cost to the existing rail builder;
6. do not call `gameRouteController.buildRail` from the planner action.

A stale/removed/restricted building keeps the planner open with recomputed state; do not silently no-op.

- [ ] **Step 8: Replace `AdvisorChain` props with planner props**

Retain `isMapPaused`, shortcut swallowing, focus behavior, and Escape ordering.

- [ ] **Step 9: Run route/component verification and commit**

```bash
bun run test:unit -- src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client
bun run check
bunx eslint src/lib/components/game/ProductChainsPanel.svelte src/routes/ManagementPanelHost.svelte src/routes/+page.svelte src/routes/page.svelte.spec.ts
bunx prettier --check src/lib/components/game/ProductChainsPanel.svelte src/routes/ManagementPanelHost.svelte src/routes/+page.svelte src/routes/page.svelte.spec.ts
git add src/lib/components/game/ProductChainsPanel.svelte src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/routes/ManagementPanelHost.svelte src/routes/+page.svelte src/routes/page.svelte.spec.ts
git commit -m "feat(supply): navigate planner actions"
```

---

## Task 6: Delete the Old Advisor Model and Verify Deterministic End-to-End Handoff

**Files:**
- Modify: `src/lib/game/supplyAdvisor.ts`
- Modify: `src/lib/game/supplyAdvisor.spec.ts`
- Modify/Delete: `src/lib/game/supplyAdvisor.defensive.spec.ts` as appropriate
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify imports revealed by deletion only

### Steps

- [ ] **Step 1: Prove application code no longer consumes the old chain model**

```bash
rg "AdvisorChain|buildSupplyAdvisor|getBuildingTypeProducing" src
```

Application-code matches must be zero before deletion. Tests/module may still match until this task finishes.

- [ ] **Step 2: Reduce `supplyAdvisor.ts` to Build Menu availability**

Retain `getAvailableMaterialIds(game)` and its current active-industry/city-inventory semantics. Delete `AdvisorStepState`, `AdvisorChainStep`, `AdvisorChain`, `buildSupplyAdvisor`, `collectChain`, `getWantedFinishedMaterials`, and chain-only producer lookup if unused.

Do not preserve compatibility exports.

- [ ] **Step 3: Keep only availability tests in old advisor specs**

Forecast/ordering expectations now belong in planner specs. Keep active-industry inventory, buffered materials, optimistic placed-building outputs, and defensive unavailable-inventory behavior for Build Menu.

- [ ] **Step 4: Add deterministic planner fixture using the existing save helper**

Do **not** advance arbitrary days to manufacture state. Reuse `installSandboxAutoSave(page, game)` already defined in `retail-sim.e2e.ts`; it validates the current save-store snapshot, writes `BROWSER_SAVE_STORAGE_KEY` (`serpens.saves.v2`), reloads, resumes, closes Saves, and waits for the retail map.

Create a fixture function in the E2E file that returns a valid current-schema `GameState` with:

- a supported retail product;
- known `targetStock` values so the replenishment clamp is deterministic;
- a configured industry supply city;
- a deterministic primary bottleneck;
- enough cash for the intended action;
- for the warehouse test, binding warehouse capacity plus a valid warehouse placement;
- no active outbound recurring route unless the test specifically exercises the limitation.

- [ ] **Step 5: Add the required warehouse planner lifecycle**

Named so `-g "supply planner warehouse"` selects it:

1. `installSandboxAutoSave(page, warehousePressurePlannerGame())`;
2. open Supply Planner;
3. verify selected-city demand, effective clamp, supply-city context, both horizons, and warehouse bottleneck;
4. verify recommendation is Build Warehouse;
5. activate it and assert industry placement mode is armed for warehouse;
6. cancel placement;
7. reopen planner and verify category/horizon context survives.

Do not duplicate exact unit arithmetic already covered in node tests.

- [ ] **Step 6: Add one rail-disconnected route-level or E2E smoke if stable**

Prefer route/client coverage for `connect-rail` handoff. If an E2E fixture is straightforward, inject a producer + warehouse with no connecting rail, open planner, select Connect Rail, and assert rail routing starts with that producer. Do not expand this into rail path construction assertions.

- [ ] **Step 7: Run focused cleanup/E2E verification**

```bash
bun run test:unit -- src/lib/game/supplyAdvisor.spec.ts src/lib/game/productChainGraph.spec.ts src/lib/game/railShipping.spec.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts --run --project server
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client
bunx playwright test src/routes/retail-sim.e2e.ts -g "supply planner warehouse"
```

- [ ] **Step 8: Run full project verification**

```bash
bun run check
bun run lint
bun run test:unit -- --run
bunx playwright test src/routes/retail-sim.e2e.ts
bun run build
git diff --check main...HEAD
```

Fix only HPA-281 regressions.

- [ ] **Step 9: Final scope/contract audit**

Verify explicitly:

- no live state/RNG/autosave mutation;
- zero demand is ready/no-op;
- every retail claimant sharing the supply city contributes effective replenishment demand;
- target-stock/cadence clamp is visible evidence;
- active outbound logistics is detected but not projected; capital recommendation is suppressed;
- disconnected producer does not count as deliverable capacity;
- no rail max-flow/shared-capacity optimizer was added;
- missing-producer choice is upstream-first;
- Product Chains owns throughput math;
- `getIndustryInventoryScope` owns city-scoped inventory/building resolution;
- placement context is created once per candidate scan;
- scenario/current action availability gates recommendation;
- cash comparison includes build/upgrade cost, recipe operating cost, flat build operating cost, and expected imported-input cost;
- Product Chains opens the planner;
- planner derivation is closed-modal gated;
- build/warehouse/upgrade/rail actions navigate without committing;
- `AdvisorChain` is deleted with no compatibility shim;
- no inter-city scheduler/in-transit forecast leaked into HPA-281.

- [ ] **Step 10: Commit cleanup and E2E**

```bash
git add src/lib/game/supplyAdvisor.ts src/lib/game/supplyAdvisor.spec.ts src/routes/retail-sim.e2e.ts
git add -u
git commit -m "test(supply): verify planner handoff"
```

---

## Implementation Order Rationale

1. **Demand/snapshot first** fixes the largest source-number errors before recommendations exist: shared retail claimants, replenishment ceiling, city-scope reuse, logistics limitation.
2. **Rail/projection second** prevents installed-but-undeliverable factories from poisoning every comparison axis.
3. **Actions/economics third** ranks only after the numbers it compares are stable and actionable.
4. **UI fourth** renders typed evidence instead of deriving math in Svelte.
5. **Route wiring fifth** applies real capability gates and reuses existing placement/rail/inspector workflows.
6. **Cleanup/E2E last** deletes the old model only after replacement is complete and uses deterministic save injection instead of timing-dependent setup.

## Self-Review

- No new subsystem beyond the same two planner modules.
- Rail work is one reachability selector extracted from existing rules, not a transport optimizer.
- Inter-city route prediction remains HPA-297; HPA-281 only detects when that omission makes recommendation unsafe.
- Demand uses existing potential-demand and replenishment contracts rather than inventing sales formulas.
- Cash economics are explicitly approximate but include the major incremental costs omitted by the review's simplified formula.
- All six tasks have concrete files, interfaces, tests, commands, and commit boundaries; no TODO/TBD placeholders remain.