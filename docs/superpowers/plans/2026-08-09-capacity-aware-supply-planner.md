# Capacity-Aware Supply Planner and 30-Day Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the building-presence Supply Advisor with a deterministic 7/30-day capacity planner that diagnoses one primary bottleneck, recommends one explainable build/upgrade/warehouse/no-op action, and hands the player to existing build/inspector flows without mutating game state.

**Architecture:** Add a pure `supplyPlanner.ts` snapshot/projection boundary and a small `supplyPlannerActions.ts` primary-bottleneck candidate/ranking layer. Reuse deterministic demand, Product Chains' producer/throughput helpers, city inventory, warehouse stats, placement geometry, and existing route navigation. Keep the current `SupplyAdvisor.svelte` modal as the player-facing shell and planner category/horizon state route-local in `+page.svelte`.

**Tech Stack:** SvelteKit + Svelte 5 runes, TypeScript, Vitest (`server` + client/browser projects), Playwright, existing i18n/game-domain helpers.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-09-capacity-aware-supply-planner-design.md`.
- Forecasting is derived state only: no save schema, persistence, autosave, command, or RNG changes.
- Use `buildCityDemandPools`; never call stochastic product-sales simulation from the planner.
- Reuse `MATERIAL_PRODUCER_RECIPES` and minimally generalize Product Chains' throughput helpers instead of reimplementing the level-throughput reduction.
- HPA-281 plans one retail destination and its configured supply city. Do not model transfers, recurring routes, route events, or in-transit inventory; HPA-296/HPA-297 own those extensions.
- Candidate generation targets only the **primary bottleneck**. Do not sweep every constrained material in HPA-281.
- Warehouse relief is a real recommendation axis through `warehouseFreeGain`; it does not pretend to reduce import/shortage totals.
- A supported category with zero expected demand is `ready` + no-op, never an empty result.
- Gate normal assignment/inventory access before `getCityInventoryStats`; do not catch authoritative inventory invariant exceptions and present them as normal UX states.
- Recommendation actions never commit mutations. Build/warehouse recommendations arm existing placement; upgrade recommendations navigate to the existing inspector.
- Keep planner state in `+page.svelte`; do not add a Svelte store, router, event bus, worker, cache, optimizer, or rule DSL.
- No charting dependency. Use existing paper/tokens/frames styles and localized text/metrics.
- English, Japanese, and Traditional Chinese planner copy must land together.
- No compatibility shim for obsolete `AdvisorChain` behavior after cutover. Keep `getAvailableMaterialIds`; remove dead chain-only exports/tests.
- Every Vitest test contains explicit assertions and follows the repo's existing server/client project conventions.

---

## File Structure

### New files

- `src/lib/game/supplyPlanner.ts` — request/result contracts, snapshot construction, upstream requirements, baseline projections, warehouse evidence, primary bottleneck.
- `src/lib/game/supplyPlanner.spec.ts` — demand, access gating, throughput parity, forecast, bottleneck, zero-demand, and immutability coverage.
- `src/lib/game/supplyPlannerActions.ts` — primary-bottleneck candidates, hypothetical snapshots, comparisons, deterministic recommendation.
- `src/lib/game/supplyPlannerActions.spec.ts` — build/upgrade/warehouse/no-op, feasibility, affordability, ranking, warehouse-selection coverage.

### Existing files to modify

- `src/lib/game/productChainGraph.ts` — broaden existing recipe throughput helpers to lightweight `{ typeId, level }` rows and add material-scoped output capacity helper.
- `src/lib/game/productChainGraph.spec.ts` — lock helper parity for real/lightweight rows and material-specific output.
- `src/lib/game/supplyAdvisor.ts` — retain Build Menu availability helper; remove obsolete presence planner after UI cutover.
- `src/lib/game/supplyAdvisor.spec.ts` / `supplyAdvisor.defensive.spec.ts` — retain availability coverage only.
- `src/lib/components/game/SupplyAdvisor.svelte` / `.spec.ts` — planner UI and interactions.
- `src/lib/components/game/ProductChainsPanel.svelte` / `.spec.ts` — one `Plan this chain` callback.
- `src/routes/ManagementPanelHost.svelte` — forward Product Chains planner callback.
- `src/routes/+page.svelte` / `page.svelte.spec.ts` — planner context/result and non-mutating navigation.
- `src/lib/i18n/messages/en.ts`, `ja.ts`, `zh-Hant.ts`, `src/lib/i18n/locales.spec.ts` — planner copy/parity.
- `src/routes/retail-sim.e2e.ts` — one warehouse-bottleneck planner lifecycle.

---

### Task 1: Lock Planner Contracts, Supply Scope, and Requirement Propagation

**Files:**
- Create: `src/lib/game/supplyPlanner.ts`
- Create: `src/lib/game/supplyPlanner.spec.ts`
- Read/reuse: `src/lib/game/stock.ts`, `src/lib/game/productChainGraph.ts`, `src/lib/game/cityInventory.ts`, `src/lib/game/industry.ts`

**Interfaces:**

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

export type SupplyPlannerSnapshotResult =
	| { status: 'ready'; snapshot: SupplyPlannerSnapshot }
	| { status: 'empty'; reason: 'no-supported-products' }
	| { status: 'unavailable'; reason: 'retail-city-unavailable' | 'supply-city-unavailable' }
	| { status: 'unsupported'; reason: 'unsupported-category' | 'missing-producer-recipe' }
	| { status: 'invalid'; reason: 'invalid-request' };

export interface SupplyMaterialRequirement {
	materialId: MaterialId;
	requiredPerDay: number;
	producerRecipeId: ProductionRecipeId | null;
}

export function buildSupplyPlannerSnapshot(
	game: GameState,
	request: SupplyPlannerRequest
): SupplyPlannerSnapshotResult;

export function collectSupplyRequirements(
	finishedMaterialId: MaterialId,
	demandPerDay: number
): readonly SupplyMaterialRequirement[];

export function listSupplyPlannerCategories(
	game: GameState,
	retailCityId: WorldCityId
): readonly string[];
```

- [ ] **Step 1: Write city-scope, zero-demand, and access-state tests**

Use existing valid game test utilities where available. Add a planner fixture that has a generated/open retail city, assigned open industry city, inventory, and at least one supported product.

```ts
it('builds a city-scoped snapshot without changing game or RNG', () => {
	const game = createPlannerGame();
	const before = structuredClone(game);
	const rngBefore = game.rngState;

	const result = buildSupplyPlannerSnapshot(game, {
		retailCityId: 'harbor-city',
		categoryId: 'bottled-water'
	});

	expect(result.status).toBe('ready');
	if (result.status !== 'ready') return;
	expect(result.snapshot.retailCityId).toBe('harbor-city');
	expect(result.snapshot.supplyCityId).toBe('industry-city');
	expect(result.snapshot.finishedMaterialId).toBe('bottled-water');
	expect(game.rngState).toBe(rngBefore);
	expect(game).toEqual(before);
});

it('keeps a sold zero-demand category as a ready snapshot', () => {
	const game = createPlannerGameWithZeroDemand();
	const result = buildSupplyPlannerSnapshot(game, {
		retailCityId: 'harbor-city',
		categoryId: 'bottled-water'
	});

	expect(result.status).toBe('ready');
	if (result.status !== 'ready') return;
	expect(result.snapshot.demandPerDay).toBe(0);
});

it('returns unavailable before reading stats when the assignment has no supply city', () => {
	const game = createPlannerGame({
		retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: null }]
	});

	expect(
		buildSupplyPlannerSnapshot(game, {
			retailCityId: 'harbor-city',
			categoryId: 'bottled-water'
		})
	).toEqual({ status: 'unavailable', reason: 'supply-city-unavailable' });
});

it('does not disguise authoritative inventory corruption as unavailable planner UX', () => {
	const game = createPlannerGameWithInvalidInventoryQuantity();

	expect(() =>
		buildSupplyPlannerSnapshot(game, {
			retailCityId: 'harbor-city',
			categoryId: 'bottled-water'
		})
	).toThrow(/City inventory invariant/);
});
```

The corruption fixture must pass normal `getCityInventory` access but contain an invalid authoritative quantity so `getCityInventoryStats` demonstrates the intended invariant boundary.

- [ ] **Step 2: Write category-list and requirement-propagation tests**

```ts
it('lists supported categories sold in the selected retail city only', () => {
	const game = createPlannerGame();
	expect(listSupplyPlannerCategories(game, 'harbor-city')).toContain('bottled-water');
});

it('propagates pantry demand through flour and grain ratios', () => {
	const rows = collectSupplyRequirements('pantry', 8);
	const byMaterial = new Map(rows.map((row) => [row.materialId, row]));

	expect(byMaterial.get('pantry')?.requiredPerDay).toBeCloseTo(8);
	expect(byMaterial.get('flour')?.requiredPerDay).toBeCloseTo(6);
	expect(byMaterial.get('grain')?.requiredPerDay).toBeCloseTo(7.5);
});

it('aggregates shared water demand into one requirement row', () => {
	const rows = collectSupplyRequirements('drinks', 10);
	const waterRows = rows.filter((row) => row.materialId === 'water');

	expect(waterRows).toHaveLength(1);
	expect(waterRows[0]!.requiredPerDay).toBeGreaterThan(0);
});
```

- [ ] **Step 3: Run tests and verify the planner module is missing**

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts --run --project server
```

Expected: FAIL because `supplyPlanner.ts` does not exist.

- [ ] **Step 4: Implement requirement propagation with the existing producer map**

Use `MATERIAL_PRODUCER_RECIPES` from Product Chains. Do not add a second producer registry.

```ts
function requirementsPerUnit(
	materialId: MaterialId,
	memo: Map<MaterialId, ReadonlyMap<MaterialId, number>>,
	visiting: Set<MaterialId>
): ReadonlyMap<MaterialId, number> {
	const cached = memo.get(materialId);
	if (cached) return cached;
	if (visiting.has(materialId)) throw new Error(`Supply planner recipe cycle at ${materialId}`);

	visiting.add(materialId);
	const result = new Map<MaterialId, number>([[materialId, 1]]);
	const recipeId = MATERIAL_PRODUCER_RECIPES.get(materialId);
	const recipe = recipeId ? PRODUCTION_RECIPES[recipeId] : null;
	const output = recipe?.outputs.find((candidate) => candidate.materialId === materialId);

	if (recipe && output && output.quantity > 0) {
		for (const input of recipe.inputs) {
			const ratio = input.quantity / output.quantity;
			for (const [upstreamId, upstreamPerUnit] of requirementsPerUnit(
				input.materialId,
				memo,
				visiting
			)) {
				result.set(upstreamId, (result.get(upstreamId) ?? 0) + upstreamPerUnit * ratio);
			}
		}
	}

	visiting.delete(materialId);
	memo.set(materialId, result);
	return result;
}
```

`collectSupplyRequirements` multiplies the per-unit vector once by `demandPerDay`, emits one row per material, and stable-sorts by material ID.

- [ ] **Step 5: Implement snapshot construction with explicit access gating**

`buildSupplyPlannerSnapshot` performs this exact order:

1. resolve requested retail city from `game.cities` and opened world state;
2. map category through `getFinishedMaterialIdForCategory`;
3. ensure its producer recipe exists in `MATERIAL_PRODUCER_RECIPES`;
4. calculate demand using `buildCityDemandPools(game, retailCity)` — demand `0` remains valid;
5. resolve the retail city's existing supply assignment;
6. if assignment missing/null, return `supply-city-unavailable`;
7. call `getCityInventory(game, supplyCityId)`;
8. if `!access.ok`, return `supply-city-unavailable`;
9. only now call `getCityInventoryStats(game, access.inventory.cityId)`; do not wrap it in a catch-to-result adapter;
10. copy assigned-city buildings and inventory quantities into lightweight snapshot rows.

- [ ] **Step 6: Run focused tests and commit**

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts --run --project server
git add src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(supply): add deterministic planner snapshot"
```

---

### Task 2: Reuse Product Chains Throughput and Implement 7/30-Day Projections

**Files:**
- Modify: `src/lib/game/productChainGraph.ts`
- Modify: `src/lib/game/productChainGraph.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`

**Interfaces:**

Generalize the existing helper without changing its result for current callers:

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

Planner projection contracts:

```ts
export interface SupplyHorizonMaterialForecast {
	horizonDays: SupplyPlannerHorizonDays;
	requiredUnits: number;
	localAvailableUnits: number;
	importRequiredUnits: number;
}

export interface SupplyMaterialForecast {
	materialId: MaterialId;
	requiredPerDay: number;
	inventoryUnits: number;
	localCapacityPerDay: number;
	capacityDeltaPerDay: number;
	daysOfCover: number | null;
	projectedStockoutDay: number | null;
	sevenDay: SupplyHorizonMaterialForecast;
	thirtyDay: SupplyHorizonMaterialForecast;
}

export type SupplyBottleneck =
	| { kind: 'missing-producer'; materialId: MaterialId }
	| { kind: 'production-capacity'; materialId: MaterialId; deficitPerDay: number }
	| { kind: 'inventory-cover'; materialId: MaterialId; stockoutDay: number }
	| { kind: 'warehouse-capacity'; overflowUnits: number; freeCapacity: number }
	| { kind: 'import-reliance'; materialId: MaterialId; importedUnits30: number }
	| { kind: 'none' };

export interface SupplyProjection {
	materials: readonly SupplyMaterialForecast[];
	bottleneck: SupplyBottleneck;
	finishedMaterialId: MaterialId;
	demandPerDay: number;
	warehouse: {
		used: number;
		capacity: number;
		free: number;
		overflow: number;
	};
	totals: {
		shortageUnits7: number;
		shortageUnits30: number;
		importUnits7: number;
		importUnits30: number;
	};
}

export function projectSupplySnapshot(snapshot: SupplyPlannerSnapshot): SupplyProjection;
```

- [ ] **Step 1: Add Product Chains helper parity tests**

```ts
it('computes identical throughput from real and lightweight building rows', () => {
	const real = [industrialBuilding('water-bottler', 2)];
	const light = real.map(({ typeId, level }) => ({ typeId, level }));

	expect(getRecipeThroughputUnits(light, 'water-bottling')).toBe(
		getRecipeThroughputUnits(real, 'water-bottling')
	);
});

it('computes output for the requested material instead of summing recipe outputs', () => {
	const buildings = [{ typeId: 'water-bottler' as const, level: 1 }];
	expect(getMaterialOutputCapacityPerDay(buildings, 'bottled-water')).toBe(10);
});
```

- [ ] **Step 2: Generalize existing throughput helpers minimally**

`buildingsForRecipe` only needs `typeId`; `getRecipeThroughputUnits` only needs `typeId` + `level`. Keep current Product Chains callers source-compatible.

```ts
export function getMaterialOutputCapacityPerDay(
	buildings: readonly RecipeThroughputBuilding[],
	materialId: MaterialId
): number {
	const recipeId = MATERIAL_PRODUCER_RECIPES.get(materialId);
	if (!recipeId) return 0;
	const recipe = PRODUCTION_RECIPES[recipeId];
	const output = recipe.outputs.find((candidate) => candidate.materialId === materialId);
	if (!output) return 0;
	return output.quantity * getRecipeThroughputUnits(buildings, recipeId);
}
```

Do not call `recipeOutputPerDay` here because it sums all output lines.

- [ ] **Step 3: Add planner capacity/horizon/warehouse tests**

```ts
it('uses the shared throughput helper for building level capacity', () => {
	const level1 = plannerSnapshot({ buildings: [plannerBuilding('water-bottler', 1)] });
	const level2 = plannerSnapshot({ buildings: [plannerBuilding('water-bottler', 2)] });

	const capacity1 = material(projectSupplySnapshot(level1), 'bottled-water').localCapacityPerDay;
	const capacity2 = material(projectSupplySnapshot(level2), 'bottled-water').localCapacityPerDay;

	expect(capacity2).toBeGreaterThan(capacity1);
	expect(capacity2 / capacity1).toBeCloseTo(getBuildingThroughputMultiplier(2));
});

it('produces both 7 and 30 day projections', () => {
	const projection = projectSupplySnapshot(plannerSnapshot({ demandPerDay: 20 }));
	const finished = material(projection, 'bottled-water');

	expect(finished.sevenDay.horizonDays).toBe(7);
	expect(finished.thirtyDay.horizonDays).toBe(30);
	expect(finished.thirtyDay.requiredUnits).toBeGreaterThan(finished.sevenDay.requiredUnits);
});

it('reports current warehouse free space and overflow', () => {
	const projection = projectSupplySnapshot(
		plannerSnapshot({ warehouseCapacity: 10, warehouseUsed: 14 })
	);

	expect(projection.warehouse.free).toBe(0);
	expect(projection.warehouse.overflow).toBe(4);
});
```

- [ ] **Step 4: Implement material projections with the shared capacity helper**

For each requirement row:

```ts
const localCapacityPerDay = getMaterialOutputCapacityPerDay(snapshot.buildings, materialId);
const requiredUnits = requiredPerDay * horizonDays;
const localAvailableUnits = inventoryUnits + localCapacityPerDay * horizonDays;
const importRequiredUnits = Math.max(0, requiredUnits - localAvailableUnits);
const capacityDeltaPerDay = localCapacityPerDay - requiredPerDay;
const daysOfCover = requiredPerDay > 0 ? inventoryUnits / requiredPerDay : null;
const projectedStockoutDay =
	requiredPerDay > localCapacityPerDay
		? Math.floor(inventoryUnits / (requiredPerDay - localCapacityPerDay)) + 1
		: null;
```

Keep finite planner math unrounded; presentation/cash formatting belongs later.

- [ ] **Step 5: Implement warehouse evidence and primary-bottleneck selection**

Warehouse evidence:

```ts
const free = Math.max(0, snapshot.warehouseCapacity - snapshot.warehouseUsed);
const overflow = Math.max(0, snapshot.warehouseUsed - snapshot.warehouseCapacity);
const hasPositiveChainFlow = materials.some(
	(row) => row.inventoryUnits > 0 || row.localCapacityPerDay > 0
);
const warehouseBinding = overflow > 0 || (free === 0 && hasPositiveChainFlow);
```

Primary bottleneck priority:

1. missing installed producer for a positive requirement;
2. binding warehouse capacity;
3. largest normalized production deficit;
4. earliest stockout;
5. largest 30-day import reliance;
6. none.

For ties use stable code-unit material ordering. Do not add a weighted score.

- [ ] **Step 6: Lock zero-demand projection and immutability**

```ts
it('returns no bottleneck for zero demand', () => {
	const projection = projectSupplySnapshot(plannerSnapshot({ demandPerDay: 0 }));
	expect(projection.bottleneck).toEqual({ kind: 'none' });
});
```

Extend the Task 1 clone assertions through `projectSupplySnapshot`.

- [ ] **Step 7: Run focused server suites and commit**

```bash
bun run test:unit -- src/lib/game/productChainGraph.spec.ts src/lib/game/supplyPlanner.spec.ts --run --project server
git add src/lib/game/productChainGraph.ts src/lib/game/productChainGraph.spec.ts src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(supply): project shared capacity and bottlenecks"
```

---

### Task 3: Add Primary-Bottleneck Actions, Warehouse Relief, and Stable Ranking

**Files:**
- Create: `src/lib/game/supplyPlannerActions.ts`
- Create: `src/lib/game/supplyPlannerActions.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts` only for small exported plan/comparison types if needed

**Interfaces:**

```ts
export type SupplyPlannerAction =
	| {
			kind: 'build-producer';
			materialId: MaterialId;
			buildingTypeId: IndustrialBuildingTypeId;
			cost: number;
	  }
	| {
			kind: 'upgrade-building';
			materialId: MaterialId;
			buildingId: string;
			buildingTypeId: IndustrialBuildingTypeId;
			fromLevel: number;
			toLevel: number;
			cost: number;
	  }
	| {
			kind: 'build-warehouse';
			buildingTypeId: 'warehouse';
			cost: number;
	  }
	| {
			kind: 'none';
			reason:
				| 'no-demand'
				| 'surplus'
				| 'unaffordable'
				| 'ineffective'
				| 'no-feasible-action';
	  };

export interface SupplyPlannerComparison {
	shortageReduction7: number;
	shortageReduction30: number;
	importReduction30: number;
	stockoutImprovementDays: number;
	warehouseFreeGain: number;
}

export interface SupplyPlannerCandidate {
	action: SupplyPlannerAction;
	affordable: boolean;
	feasible: boolean;
	projection: SupplyProjection;
	comparison: SupplyPlannerComparison;
}

export interface SupplyPlan {
	snapshot: SupplyPlannerSnapshot;
	baseline: SupplyProjection;
	recommendation: SupplyPlannerCandidate;
	alternatives: readonly SupplyPlannerCandidate[];
}

export type SupplyPlannerResult =
	| { status: 'ready'; plan: SupplyPlan }
	| { status: 'empty'; reason: 'no-supported-products' }
	| { status: 'unavailable'; reason: 'retail-city-unavailable' | 'supply-city-unavailable' }
	| { status: 'unsupported'; reason: 'unsupported-category' | 'missing-producer-recipe' }
	| { status: 'invalid'; reason: 'invalid-request' };

export function buildSupplyPlan(game: GameState, request: SupplyPlannerRequest): SupplyPlannerResult;
```

- [ ] **Step 1: Write tests proving candidates follow the primary bottleneck only**

```ts
it('generates producer actions only for the primary material bottleneck', () => {
	const plan = readyPlan(gameWithUpstreamAndDownstreamDeficits());
	const bottleneck = plan.baseline.bottleneck;
	expect('materialId' in bottleneck).toBe(true);
	if (!('materialId' in bottleneck)) return;

	const materialActions = plan.alternatives.filter(
		(candidate) =>
			candidate.action.kind === 'build-producer' ||
			candidate.action.kind === 'upgrade-building'
	);

	expect(materialActions.length).toBeGreaterThan(0);
	for (const candidate of materialActions) {
		if (candidate.action.kind === 'build-producer' || candidate.action.kind === 'upgrade-building') {
			expect(candidate.action.materialId).toBe(bottleneck.materialId);
		}
	}
});
```

This test prevents the old every-constrained-material fan-out from returning.

- [ ] **Step 2: Write the warehouse recommendation regression**

```ts
it('recommends a warehouse when warehouse capacity is the binding bottleneck', () => {
	const plan = readyPlan(gameWithWarehousePressure({ cash: 10_000 }));

	expect(plan.baseline.bottleneck.kind).toBe('warehouse-capacity');
	expect(plan.recommendation.action.kind).toBe('build-warehouse');
	expect(plan.recommendation.comparison.warehouseFreeGain).toBeGreaterThan(0);
});
```

This is a recommendation assertion, not merely an alternatives assertion.

- [ ] **Step 3: Add affordability/no-demand/no-op tests**

```ts
it('does not select an unaffordable investment', () => {
	const plan = readyPlan(gameWithMaterialBottleneck({ cash: 0 }));
	expect(plan.recommendation.action.kind).toBe('none');
});

it('returns ready no-demand with a no-op recommendation', () => {
	const result = buildSupplyPlan(gameWithZeroDemand(), {
		retailCityId: 'harbor-city',
		categoryId: 'bottled-water'
	});

	expect(result.status).toBe('ready');
	if (result.status !== 'ready') return;
	expect(result.plan.baseline.bottleneck).toEqual({ kind: 'none' });
	expect(result.plan.recommendation.action).toEqual({ kind: 'none', reason: 'no-demand' });
});

it('selects no-op for surplus capacity', () => {
	const plan = readyPlan(gameWithSurplusCapacity());
	expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'surplus' });
});
```

- [ ] **Step 4: Run tests and verify the action module is missing**

```bash
bun run test:unit -- src/lib/game/supplyPlannerActions.spec.ts --run --project server
```

Expected: FAIL because `supplyPlannerActions.ts` does not exist.

- [ ] **Step 5: Implement pure hypothetical snapshot application**

```ts
function applyCandidate(
	snapshot: SupplyPlannerSnapshot,
	action: Exclude<SupplyPlannerAction, { kind: 'none' }>
): SupplyPlannerSnapshot {
	if (action.kind === 'upgrade-building') {
		return {
			...snapshot,
			buildings: snapshot.buildings.map((building) =>
				building.id === action.buildingId ? { ...building, level: action.toLevel } : building
			)
		};
	}

	const buildingType = INDUSTRIAL_BUILDING_TYPES[action.buildingTypeId];
	const buildings = [
		...snapshot.buildings,
		{
			id: `planner:${stableActionKey(action)}`,
			cityId: snapshot.supplyCityId,
			typeId: action.buildingTypeId,
			level: 1
		}
	];

	return {
		...snapshot,
		buildings,
		warehouseCapacity:
			action.kind === 'build-warehouse'
				? snapshot.warehouseCapacity + buildingType.warehouseCapacity
				: snapshot.warehouseCapacity
	};
}
```

Never mutate the input snapshot.

- [ ] **Step 6: Implement geometry feasibility independently from cash**

```ts
function hasValidPlacement(
	game: GameState,
	supplyCityId: WorldCityId,
	buildingTypeId: IndustrialBuildingTypeId
): boolean {
	const city = game.industryCities.find((candidate) => candidate.id === supplyCityId);
	if (!city) return false;
	const scopedGame = { ...game, activeIndustryCityId: supplyCityId };
	return city.tiles.some(
		(tile) => getIndustrialPlacementBlockReason(scopedGame, tile.id, buildingTypeId) === null
	);
}
```

Import from `industryPlacement.ts`. Do not use `createIndustryPlacementPreview` here because it mixes funding into the geometry result.

- [ ] **Step 7: Implement primary-bottleneck candidate generation**

```ts
function targetMaterial(bottleneck: SupplyBottleneck): MaterialId | null {
	switch (bottleneck.kind) {
		case 'missing-producer':
		case 'production-capacity':
		case 'inventory-cover':
		case 'import-reliance':
			return bottleneck.materialId;
		case 'warehouse-capacity':
		case 'none':
			return null;
	}
}
```

Generation rules:

- `warehouse-capacity`: if warehouse placement is feasible, add exactly one `build-warehouse` candidate plus no-op;
- material bottleneck: resolve producer recipe/building type for **that material only**;
  - no matching installed building → one build-producer candidate;
  - matching buildings → one upgrade candidate per upgradeable building, stable-sorted by cost then building ID;
- `none`: no investment candidates;
- always include no-op.

Do not generate actions for non-primary material deficits.

- [ ] **Step 8: Implement comparison and bottleneck-aware ranking**

```ts
function compareProjection(
	baseline: SupplyProjection,
	candidate: SupplyProjection
): SupplyPlannerComparison {
	return {
		shortageReduction7:
			baseline.totals.shortageUnits7 - candidate.totals.shortageUnits7,
		shortageReduction30:
			baseline.totals.shortageUnits30 - candidate.totals.shortageUnits30,
		importReduction30: baseline.totals.importUnits30 - candidate.totals.importUnits30,
		stockoutImprovementDays: compareStockoutDays(baseline, candidate),
		warehouseFreeGain: candidate.warehouse.free - baseline.warehouse.free
	};
}
```

Warehouse baseline comparator:

```ts
if (baseline.bottleneck.kind === 'warehouse-capacity') {
	return (
		Number(right.affordable && right.feasible) - Number(left.affordable && left.feasible) ||
		right.comparison.warehouseFreeGain - left.comparison.warehouseFreeGain ||
		actionCost(left.action) - actionCost(right.action) ||
		compareCodeUnitStrings(stableActionKey(left.action), stableActionKey(right.action))
	);
}
```

Material baseline comparator uses affordability/feasibility, 30-day shortage reduction, 7-day shortage reduction, import reduction, stockout improvement, cost, then stable action key.

Meaningful-action rule:

- warehouse bottleneck: `warehouseFreeGain > 0` is sufficient;
- material bottleneck: positive shortage/import/stockout improvement required;
- no demand: direct no-op `no-demand`;
- none/surplus: direct no-op `surplus`.

- [ ] **Step 9: Verify game/snapshot immutability and run focused suites**

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts --run --project server
git add src/lib/game/supplyPlanner.ts src/lib/game/supplyPlannerActions.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts
git commit -m "feat(supply): recommend primary bottleneck actions"
```

---

### Task 4: Replace the Presence Checklist with Planner UI and Localized Evidence

**Files:**
- Modify: `src/lib/components/game/SupplyAdvisor.svelte`
- Modify: `src/lib/components/game/SupplyAdvisor.svelte.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/i18n/locales.spec.ts`

**Interfaces:**

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

- [ ] **Step 1: Rewrite component tests around planner states before implementation**

Cover ready material bottleneck, ready warehouse bottleneck, ready zero-demand no-op, empty no-products, unavailable supply, unsupported category, invalid request, horizon/category callbacks, action callback, dialog/focus behavior.

```ts
it('renders a warehouse recommendation and emits its action', async () => {
	const onAction = vi.fn();
	render(SupplyAdvisor, {
		result: readyPlannerResult({ recommendation: warehouseRecommendation() }),
		categoryIds: ['bottled-water'],
		selectedCategoryId: 'bottled-water',
		horizonDays: 30,
		i18n,
		onSelectCategory: vi.fn(),
		onSelectHorizon: vi.fn(),
		onAction,
		onClose: vi.fn()
	});

	await expect.element(page.getByRole('dialog')).toBeVisible();
	await page.getByRole('button', { name: /warehouse/i }).click();
	expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ kind: 'build-warehouse' }));
});

it('keeps zero demand visible as a ready no-investment state', async () => {
	render(SupplyAdvisor, zeroDemandProps());
	await expect.element(page.getByText(/no investment/i)).toBeVisible();
});
```

- [ ] **Step 2: Run client test and verify old props fail**

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts --run --project client
```

Expected: FAIL until component props/content are replaced.

- [ ] **Step 3: Replace checklist rendering with typed planner states**

Keep the existing dialog/backdrop/focus trap shell. Render:

- category selector;
- retail → supply scope;
- demand/day and horizon tabs;
- stock/capacity/import metrics;
- primary bottleneck evidence;
- recommendation card;
- baseline-vs-action evidence;
- per-material details;
- state-specific copy for no-demand/empty/unavailable/unsupported/invalid request.

For warehouse comparisons show capacity/headroom change, not fabricated shortage/import improvement.

- [ ] **Step 4: Add localization keys in all three catalogs**

Use structured keys under the existing `supplyAdvisor` namespace. Required semantic groups:

```text
supplyAdvisor.scope.*
supplyAdvisor.horizon.*
supplyAdvisor.metrics.*
supplyAdvisor.bottleneck.*
supplyAdvisor.action.*
supplyAdvisor.comparison.*
supplyAdvisor.state.noDemand
supplyAdvisor.state.noSupportedProducts
supplyAdvisor.state.supplyUnavailable
supplyAdvisor.state.unsupported
supplyAdvisor.state.invalidRequest
```

Use existing label helpers for material/building/city names. Add locale parity coverage.

- [ ] **Step 5: Run component/i18n/check and commit**

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/i18n/locales.spec.ts --run --project client
bun run check
git add src/lib/components/game/SupplyAdvisor.svelte src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts src/lib/i18n/locales.spec.ts
git commit -m "feat(supply): render forecast planner"
```

---

### Task 5: Wire Product Chains, Route-Local Context, and Non-Mutating Action Navigation

**Files:**
- Modify: `src/lib/components/game/ProductChainsPanel.svelte`
- Modify: `src/lib/components/game/ProductChainsPanel.svelte.spec.ts`
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/page.svelte.spec.ts`

**Interfaces:**

`ProductChainsPanel` adds:

```ts
interface Props {
	game: GameState;
	i18n: I18nBundle;
	onPlanCategory?: (categoryId: string) => void;
}
```

Route-local state:

```ts
interface SupplyPlannerUiContext {
	categoryId: string | null;
	horizonDays: SupplyPlannerHorizonDays;
}

let supplyPlannerContext = $state<SupplyPlannerUiContext>({
	categoryId: null,
	horizonDays: 30
});
```

- [ ] **Step 1: Add Product Chains callback test**

```ts
it('opens planning for the active category without changing graph selection', async () => {
	const onPlanCategory = vi.fn();
	render(ProductChainsPanel, { game, i18n, onPlanCategory });

	await page.getByRole('button', { name: /plan this chain/i }).click();
	expect(onPlanCategory).toHaveBeenCalledWith(expect.any(String));
});
```

- [ ] **Step 2: Add route tests for context and all action navigation kinds**

Route/component tests must prove:

- open planner from Build Menu without category override;
- open planner from Product Chains with active category;
- horizon/category survive close/reopen;
- build-producer arms the recommended building type;
- build-warehouse arms `warehouse` placement;
- upgrade selects the exact building tile/inspector;
- no-op does not navigate;
- none of these handlers invokes build/upgrade controller mutations directly.

Use existing controller spies in `page.svelte.spec.ts`; assert mutation methods remain uncalled when planner actions are clicked.

- [ ] **Step 3: Add Product Chains `Plan this chain` button**

Render the action only when an active category exists. Keep forecast calculations out of Product Chains.

```svelte
{#if activeCategory && onPlanCategory}
	<button type="button" onclick={() => onPlanCategory?.(activeCategory.categoryId)}>
		{i18n.t('supplyAdvisor.planThisChain')}
	</button>
{/if}
```

- [ ] **Step 4: Derive planner categories/request/result in `+page.svelte`**

Use selected retail city and route-local context:

```ts
let supplyPlannerCategoryIds = $derived(
	game && isWorldCityId(activeCity.id) ? listSupplyPlannerCategories(game, activeCity.id) : []
);

let selectedSupplyPlannerCategoryId = $derived(
	supplyPlannerCategoryIds.includes(supplyPlannerContext.categoryId ?? '')
		? supplyPlannerContext.categoryId
		: (supplyPlannerCategoryIds[0] ?? null)
);

let supplyPlannerResult = $derived.by(() => {
	if (!game || !isWorldCityId(activeCity.id) || !selectedSupplyPlannerCategoryId) {
		return { status: 'empty', reason: 'no-supported-products' } as const;
	}
	return buildSupplyPlan(game, {
		retailCityId: activeCity.id,
		categoryId: selectedSupplyPlannerCategoryId
	});
});
```

Do not put planner state in a store/context module.

- [ ] **Step 5: Preserve context in open/select handlers**

```ts
function openSupplyPlanner(categoryId?: string): void {
	if (categoryId) supplyPlannerContext.categoryId = categoryId;
	isBuildMenuOpen = false;
	activeManagementPanelId = null;
	isSupplyAdvisorOpen = true;
}

function setSupplyPlannerHorizon(horizonDays: SupplyPlannerHorizonDays): void {
	supplyPlannerContext.horizonDays = horizonDays;
}
```

When a stored category is temporarily invalid, derive a fallback but do not erase the stored value until the user selects another category.

- [ ] **Step 6: Implement recommendation navigation through existing paths only**

For build-producer/build-warehouse:

1. resolve the ready plan's `snapshot.supplyCityId`;
2. switch/select that industry city through the route's existing city-selection path when needed;
3. close planner/management/build overlays;
4. call existing `armIndustryPlacement(action.buildingTypeId)`;
5. never call `gameRouteController.buildIndustrialBuilding`.

For upgrade:

1. find `game.industrialBuildings` entry by `action.buildingId`;
2. switch/select its city through existing navigation;
3. close planner/placement;
4. set `selectedIndustryTileId = building.tileId`;
5. never call `gameRouteController.upgradeIndustrialBuilding`.

If an action is stale at click time (removed building, closed/unavailable city), keep planner open and let reactive derivation refresh instead of guessing.

- [ ] **Step 7: Replace old SupplyAdvisor wiring and forward Product Chains callback**

Pass `result`, categories, selected category, horizon, selection callbacks, action callback, and close callback to `SupplyAdvisor`.

Keep existing map pause, focus trap, and Escape ordering unchanged.

- [ ] **Step 8: Run route/component suites and commit**

```bash
bun run test:unit -- src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client
bun run check
git add src/lib/components/game/ProductChainsPanel.svelte src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/routes/ManagementPanelHost.svelte src/routes/+page.svelte src/routes/page.svelte.spec.ts
git commit -m "feat(supply): navigate planner recommendations"
```

---

### Task 6: Remove Presence-Only Advisor Logic and Verify Warehouse Planner Lifecycle

**Files:**
- Modify: `src/lib/game/supplyAdvisor.ts`
- Modify: `src/lib/game/supplyAdvisor.spec.ts`
- Modify/Delete as appropriate: `src/lib/game/supplyAdvisor.defensive.spec.ts`
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify: imports revealed by cleanup only

- [ ] **Step 1: Prove application code no longer imports presence planner types**

```bash
rg "AdvisorChain|buildSupplyAdvisor|getBuildingTypeProducing" src
```

Expected before cleanup: matches only in old advisor module/tests. If application code still imports them, finish the Task 5 cutover first.

- [ ] **Step 2: Reduce `supplyAdvisor.ts` to Build Menu availability responsibility**

Keep `getAvailableMaterialIds(game)` and its current active-industry/city-inventory behavior. Remove:

```text
AdvisorStepState
AdvisorChainStep
AdvisorChain
buildSupplyAdvisor
collectChain
getWantedFinishedMaterials
chain-only producer lookup (if no remaining consumer)
```

Do not add compatibility re-exports.

- [ ] **Step 3: Keep only availability tests in old advisor specs**

Retain coverage for:

- active industry city's city inventory;
- positive building-buffer inventory;
- optimistic outputs of placed buildings for Build Menu recipe hints;
- missing active inventory returning a safe empty set.

Forecast expectations belong in `supplyPlanner*.spec.ts`.

- [ ] **Step 4: Add a targeted warehouse-bottleneck Playwright lifecycle**

Add one test matching `-g "supply planner warehouse"` that establishes deterministic warehouse pressure and then:

1. opens the planner for a supported category;
2. verifies the primary bottleneck is warehouse capacity;
3. verifies the recommended action is **Build Warehouse**;
4. verifies both 7-day and 30-day controls/evidence are visible;
5. activates Build Warehouse;
6. verifies the industry map is active and warehouse placement mode is armed;
7. cancels placement;
8. reopens the planner;
9. verifies category and selected horizon context survive.

Do not duplicate projection arithmetic in E2E. Upgrade navigation is already locked by `page.svelte.spec.ts`.

- [ ] **Step 5: Run focused cleanup and warehouse lifecycle suites**

```bash
bun run test:unit -- src/lib/game/productChainGraph.spec.ts src/lib/game/supplyAdvisor.spec.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts --run --project server
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client
bunx playwright test src/routes/retail-sim.e2e.ts -g "supply planner warehouse"
```

Expected: PASS.

- [ ] **Step 6: Run full project verification**

```bash
bun run check
bun run lint
bun run test:unit -- --run
bunx playwright test src/routes/retail-sim.e2e.ts
bun run build
```

Fix only HPA-281 regressions. Do not opportunistically refactor logistics, scenario, finance, or map code.

- [ ] **Step 7: Final acceptance audit**

Verify explicitly:

- same state/request gives same forecast/recommendation;
- no state/RNG/autosave mutation;
- Product Chains and planner share recipe throughput math;
- count/level change capacity;
- shared input requirements reconcile;
- zero demand is ready + no-op;
- 7/30 metrics exist;
- normal supply access failures soft-return before stats;
- authoritative inventory invariant failures are not disguised;
- candidate actions target only the primary bottleneck;
- warehouse pressure can select warehouse as the primary recommendation;
- affordability changes recommendation;
- hypothetical actions use the same projection path;
- planner actions navigate but never commit;
- Product Chains opens planning for its active category;
- route-local context survives handoff/reopen;
- no logistics/event forecasting leaked into HPA-281.

- [ ] **Step 8: Commit final cleanup/verification**

```bash
git add src/lib/game/supplyAdvisor.ts src/lib/game/supplyAdvisor.spec.ts src/lib/game/supplyAdvisor.defensive.spec.ts src/routes/retail-sim.e2e.ts
git add -u
git commit -m "test(supply): cover warehouse planner lifecycle"
```

---

## Implementation Order Rationale

1. **Snapshot/requirements first** locks explicit retail/supply scope, zero-demand semantics, and safe inventory access.
2. **Shared capacity/projection second** prevents Product Chains/planner formula drift before recommendations exist.
3. **Primary-bottleneck actions third** keeps diagnosis and recommendation aligned and gives warehouse relief a real comparison path.
4. **UI fourth** consumes stable typed results without owning calculations.
5. **Route/Product Chains fifth** adds navigation only after actions are typed/tested.
6. **Cleanup/E2E last** removes the old model after cutover and forces the warehouse recommendation path through the real UI.

## Review Adjustments Incorporated

- Warehouse recommendations now compare `warehouseFreeGain` and can beat no-op when storage is the primary bottleneck.
- Candidate generation is primary-bottleneck-only rather than every constrained material.
- `no-demand` was removed from empty result states; zero demand returns ready + no-op.
- Inventory access is gated through `getCityInventory` before `getCityInventoryStats`; invariant exceptions remain invariant exceptions.
- Task 2 generalizes/reuses Product Chains throughput helpers instead of duplicating the level sum.
- Task 3 has a mandatory warehouse recommendation assertion and Task 6 drives warehouse recommendation → placement in Playwright.

## Self-Review Checklist

- Spec coverage: every HPA-281 calculation, recommendation, UI, navigation, immutability, and verification requirement maps to Tasks 1–6.
- Scope: HPA-297 route/in-transit concerns are extension points only; HPA-296 event semantics are excluded.
- Type consistency: snapshot supply city is non-null only for ready snapshots; no-demand is a no-op reason; comparison contains `warehouseFreeGain`.
- No placeholders: tasks name concrete files, interfaces, tests, commands, and algorithms.
- KISS/YAGNI: two planner modules, one minimally generalized existing throughput helper, one existing modal, one route-local context object, no new infrastructure.