# Capacity-Aware Supply Planner and 30-Day Forecast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the building-presence Supply Advisor with a deterministic 7/30-day capacity planner that diagnoses shortages, compares one hypothetical investment at a time, recommends an explainable build/upgrade/no-op action, and hands the player back to existing build/inspector flows without mutating game state.

**Architecture:** Add a pure `supplyPlanner.ts` snapshot/projection boundary and a small `supplyPlannerActions.ts` candidate/ranking layer. Reuse deterministic demand (`buildCityDemandPools`), recipes, building throughput/cost helpers, city inventory, and existing placement/inspector navigation. Keep the current `SupplyAdvisor.svelte` modal as the player-facing shell, add a Product Chains entry point, and retain planner selection/horizon as route-local UI context in `+page.svelte`.

**Tech Stack:** SvelteKit + Svelte 5 runes, TypeScript, Vitest (`server` + browser/client projects), Playwright, existing i18n bundle and game-domain helpers.

## Global Constraints

- Follow `docs/superpowers/specs/2026-08-09-capacity-aware-supply-planner-design.md`.
- Forecasting is derived state only: no save schema, persistence, autosave, command, or RNG changes.
- Use `buildCityDemandPools`; never call stochastic product-sales simulation from the planner.
- Reuse `MATERIALS`, `PRODUCTION_RECIPES`, `INDUSTRIAL_BUILDING_TYPES`, `getBuildingThroughputMultiplier`, `getBuildingUpgradeCost`, `canUpgradeBuilding`, `getCityInventory`, and `getCityInventoryStats`.
- HPA-281 plans one retail destination and its configured supply city. Do not model transfer orders, recurring routes, route events, or in-transit inventory; HPA-296/HPA-297 own those extensions.
- Recommendation actions never commit mutations. Build/warehouse recommendations arm existing placement; upgrade recommendations navigate to the existing building inspector.
- Keep planner state in `+page.svelte`; do not add a Svelte store, router, event bus, worker, cache, optimizer, or rule DSL.
- No charting dependency. Use existing paper/tokens/frames styles and localized text/metrics.
- English, Japanese, and Traditional Chinese planner copy must land together.
- No backward-compatibility shim for obsolete `AdvisorChain` behavior after the new UI is wired. Keep `getAvailableMaterialIds` because Build Menu still uses it; remove dead chain-only exports/tests.
- Every Vitest test must contain explicit assertions and follow the repo's existing server/client project conventions.

---

## File Structure

### New files

- `src/lib/game/supplyPlanner.ts` — public request/result contracts, snapshot construction, requirement propagation, baseline projections, bottleneck evidence.
- `src/lib/game/supplyPlanner.spec.ts` — deterministic forecast, validation, immutability, and horizon coverage.
- `src/lib/game/supplyPlannerActions.ts` — build/upgrade/warehouse/no-op candidates, hypothetical snapshot application, comparisons, deterministic ranking.
- `src/lib/game/supplyPlannerActions.spec.ts` — candidate feasibility, affordability, comparison, tie, and no-op coverage.

### Existing files to modify

- `src/lib/game/supplyAdvisor.ts` — retain Build Menu availability helper; remove obsolete presence-chain planner after UI cutover.
- `src/lib/game/supplyAdvisor.spec.ts` and `src/lib/game/supplyAdvisor.defensive.spec.ts` — retain availability tests that still matter; delete/move old chain-planner assertions.
- `src/lib/components/game/SupplyAdvisor.svelte` — render planner results instead of `AdvisorChain[]`.
- `src/lib/components/game/SupplyAdvisor.svelte.spec.ts` — planner-state and interaction coverage.
- `src/lib/components/game/ProductChainsPanel.svelte` — add one `Plan this chain` callback for the active category.
- `src/lib/components/game/ProductChainsPanel.svelte.spec.ts` — callback coverage without graph regressions.
- `src/routes/ManagementPanelHost.svelte` — forward the Product Chains planner callback.
- `src/routes/+page.svelte` — planner context/result derivation and action navigation.
- `src/routes/page.svelte.spec.ts` — route composition/context/navigation coverage.
- `src/lib/i18n/messages/en.ts`
- `src/lib/i18n/messages/ja.ts`
- `src/lib/i18n/messages/zh-Hant.ts`
- `src/lib/i18n/locales.spec.ts` — planner-key parity where needed.
- `src/routes/retail-sim.e2e.ts` — one targeted planner-to-action lifecycle.

---

### Task 1: Lock Planner Contracts, Snapshot Construction, and Requirement Propagation

**Files:**
- Create: `src/lib/game/supplyPlanner.ts`
- Create: `src/lib/game/supplyPlanner.spec.ts`
- Read/reuse: `src/lib/game/stock.ts`, `src/lib/game/productChainGraph.ts`, `src/lib/game/cityInventory.ts`, `src/lib/game/industry.ts`

**Interfaces:**

The first task produces the contracts all later tasks use:

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
	supplyCityId: WorldCityId | null;
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
	| { status: 'empty'; reason: 'no-demand' | 'no-supported-products' }
	| { status: 'unavailable'; reason: 'retail-city-unavailable' | 'supply-city-unavailable' }
	| { status: 'unsupported'; reason: 'unsupported-category' | 'missing-producer' }
	| { status: 'invalid'; reason: 'invalid-state' };

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

- [ ] **Step 1: Write snapshot/result tests before implementation**

Add focused fixtures to `supplyPlanner.spec.ts`. Use the repo's existing game test utilities where they already provide valid world/city-inventory state; do not build malformed half-`GameState` objects with casts when a fixture exists.

```ts
import { describe, expect, it } from 'vitest';
import {
	buildSupplyPlannerSnapshot,
	collectSupplyRequirements,
	listSupplyPlannerCategories
} from './supplyPlanner';

it('builds a city-scoped deterministic snapshot without changing RNG or state', () => {
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
	expect(result.snapshot.demandPerDay).toBeGreaterThanOrEqual(0);
	expect(game.rngState).toBe(rngBefore);
	expect(game).toEqual(before);
});

it('returns unavailable when the configured supply city cannot supply inventory', () => {
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

it('lists only supported categories sold in the selected retail city', () => {
	const game = createPlannerGame();
	expect(listSupplyPlannerCategories(game, 'harbor-city')).toContain('bottled-water');
});
```

- [ ] **Step 2: Add requirement-propagation tests, including shared inputs**

Use catalog recipes so the test locks real balance ratios. For Pantry, `6 flour -> 8 pantry` and `10 grain -> 8 flour`, so one pantry/day requires `0.75 flour/day` and `0.9375 grain/day` before scaling by requested demand.

```ts
it('propagates finished demand through upstream recipe ratios', () => {
	const rows = collectSupplyRequirements('pantry', 8);
	const byMaterial = new Map(rows.map((row) => [row.materialId, row]));

	expect(byMaterial.get('pantry')?.requiredPerDay).toBeCloseTo(8);
	expect(byMaterial.get('flour')?.requiredPerDay).toBeCloseTo(6);
	expect(byMaterial.get('grain')?.requiredPerDay).toBeCloseTo(7.5);
});

it('aggregates a shared upstream material across branches exactly once', () => {
	const rows = collectSupplyRequirements('drinks', 10);
	const water = rows.find((row) => row.materialId === 'water');

	// Drink bottling requires filtered water and syrup, both of which consume water.
	expect(water).toBeDefined();
	expect(water!.requiredPerDay).toBeGreaterThan(0);
	expect(rows.filter((row) => row.materialId === 'water')).toHaveLength(1);
});
```

- [ ] **Step 3: Run the new tests and verify the module is missing**

Run:

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts --run --project server
```

Expected: FAIL because `supplyPlanner.ts` does not exist.

- [ ] **Step 4: Implement catalog-safe requirement propagation**

Use Product Chains' `MATERIAL_PRODUCER_RECIPES` map instead of constructing a second producer registry. Calculate a per-finished-unit requirement vector recursively, memoize by material, then multiply once by `demandPerDay`. This makes shared inputs additive without recursively re-expanding the same subtree for each consumer.

Core implementation shape:

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

`collectSupplyRequirements` turns that map into a stable material-ID-sorted array and attaches `MATERIAL_PRODUCER_RECIPES.get(materialId) ?? null`.

- [ ] **Step 5: Implement snapshot construction using existing city/demand helpers**

`buildSupplyPlannerSnapshot` must:

1. resolve the retail city from `game.cities`;
2. map the requested category with `getFinishedMaterialIdForCategory`;
3. reject unsupported/missing-producer categories;
4. compute expected city demand with `buildCityDemandPools(game, retailCity)`;
5. resolve `retailSupplyAssignments` for that retail city;
6. access the assigned inventory through `getCityInventory`;
7. get warehouse stats through `getCityInventoryStats`;
8. copy only assigned-city buildings into lightweight snapshot rows;
9. copy inventory materials with `{ ...inventory.materials }`;
10. never mutate or retain mutable nested collections from `game`.

- [ ] **Step 6: Run the focused tests**

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts --run --project server
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(supply): add deterministic planner snapshot"
```

---

### Task 2: Implement 7/30-Day Material Projections and Bottleneck Evidence

**Files:**
- Modify: `src/lib/game/supplyPlanner.ts`
- Modify: `src/lib/game/supplyPlanner.spec.ts`

**Interfaces:**

Extend Task 1 with:

```ts
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

export interface SupplyHorizonMaterialForecast {
	horizonDays: SupplyPlannerHorizonDays;
	requiredUnits: number;
	localAvailableUnits: number;
	importRequiredUnits: number;
}

export type SupplyBottleneck =
	| { kind: 'missing-producer'; materialId: MaterialId }
	| { kind: 'production-capacity'; materialId: MaterialId; deficitPerDay: number }
	| { kind: 'inventory-cover'; materialId: MaterialId; stockoutDay: number }
	| { kind: 'warehouse-capacity'; requiredCapacity: number; availableCapacity: number }
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

- [ ] **Step 1: Add failing capacity/level/horizon tests**

```ts
it('building count and level materially change installed capacity', () => {
	const level1 = plannerSnapshot({
		buildings: [plannerBuilding('water-bottler', 1)]
	});
	const level2 = plannerSnapshot({
		buildings: [plannerBuilding('water-bottler', 2)]
	});

	const capacity1 = material(projectSupplySnapshot(level1), 'bottled-water').localCapacityPerDay;
	const capacity2 = material(projectSupplySnapshot(level2), 'bottled-water').localCapacityPerDay;

	expect(capacity2).toBeGreaterThan(capacity1);
	expect(capacity2 / capacity1).toBeCloseTo(getBuildingThroughputMultiplier(2));
});

it('produces consistent 7 and 30 day shortage totals', () => {
	const projection = projectSupplySnapshot(plannerSnapshot({ demandPerDay: 20 }));
	const finished = material(projection, 'bottled-water');

	expect(finished.sevenDay.horizonDays).toBe(7);
	expect(finished.thirtyDay.horizonDays).toBe(30);
	expect(finished.thirtyDay.requiredUnits).toBeGreaterThan(finished.sevenDay.requiredUnits);
});
```

- [ ] **Step 2: Add stock-cover, import, warehouse, and bottleneck tests**

```ts
it('uses inventory to delay stockout when local capacity is below demand', () => {
	const projection = projectSupplySnapshot(
		plannerSnapshot({ demandPerDay: 10, inventory: { 'bottled-water': 25 } })
	);
	const finished = material(projection, 'bottled-water');

	expect(finished.daysOfCover).toBeCloseTo(2.5);
	expect(finished.projectedStockoutDay).not.toBeNull();
});

it('selects a production capacity bottleneck deterministically', () => {
	const projection = projectSupplySnapshot(plannerSnapshot({ demandPerDay: 30 }));
	expect(['missing-producer', 'production-capacity', 'inventory-cover', 'import-reliance']).toContain(
		projection.bottleneck.kind
	);
});

it('surfaces warehouse pressure separately from recipe capacity', () => {
	const projection = projectSupplySnapshot(
		plannerSnapshot({ warehouseCapacity: 10, warehouseUsed: 10 })
	);
	expect(projection.warehouse.free).toBe(0);
});
```

- [ ] **Step 3: Run the tests and verify new exports fail**

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts --run --project server
```

Expected: FAIL because projection exports are missing.

- [ ] **Step 4: Implement installed output capacity from the same leveling formula**

Do not invent a new level curve. For each material's producer recipe, sum matching snapshot building throughput:

```ts
function localCapacityPerDay(
	snapshot: SupplyPlannerSnapshot,
	materialId: MaterialId
): number {
	const recipeId = MATERIAL_PRODUCER_RECIPES.get(materialId);
	if (!recipeId) return 0;
	const recipe = PRODUCTION_RECIPES[recipeId];
	const output = recipe.outputs.find((candidate) => candidate.materialId === materialId);
	if (!output) return 0;

	const throughput = snapshot.buildings
		.filter((building) => INDUSTRIAL_BUILDING_TYPES[building.typeId]?.recipeId === recipeId)
		.reduce((total, building) => total + getBuildingThroughputMultiplier(building.level), 0);

	return output.quantity * throughput;
}
```

- [ ] **Step 5: Implement the aggregate horizon formulas**

For each requirement row:

```ts
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

Round only display/cash-facing values later. Keep planner math as finite numbers so recommendation comparisons do not drift because of repeated UI rounding.

- [ ] **Step 6: Implement deterministic bottleneck selection**

Build evidence rows first, then choose the primary bottleneck in the design's priority order. For capacity ties, compare normalized deficit (`deficit / requiredPerDay`) descending, then `materialId` by code-unit order. For stockout ties, earliest day then material ID. For import ties, largest 30-day imports then material ID.

Do not use a weighted numeric score.

- [ ] **Step 7: Add immutability regression after projection**

Extend the Task 1 immutability test so `projectSupplySnapshot(result.snapshot)` also leaves the original game and snapshot deeply equal to their pre-call copies.

- [ ] **Step 8: Run the focused suite and commit**

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts --run --project server
git add src/lib/game/supplyPlanner.ts src/lib/game/supplyPlanner.spec.ts
git commit -m "feat(supply): project capacity and shortages"
```

---

### Task 3: Add Candidate Actions, Hypothetical Comparison, and Stable Recommendation Ranking

**Files:**
- Create: `src/lib/game/supplyPlannerActions.ts`
- Create: `src/lib/game/supplyPlannerActions.spec.ts`
- Modify: `src/lib/game/supplyPlanner.ts` only if a small public comparison type is needed

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
	| { kind: 'none'; reason: 'surplus' | 'unaffordable' | 'ineffective' | 'no-feasible-action' };

export interface SupplyPlannerCandidate {
	action: SupplyPlannerAction;
	affordable: boolean;
	feasible: boolean;
	projection: SupplyProjection;
	comparison: {
		shortageReduction7: number;
		shortageReduction30: number;
		importReduction30: number;
		stockoutImprovementDays: number;
	};
}

export interface SupplyPlan {
	snapshot: SupplyPlannerSnapshot;
	baseline: SupplyProjection;
	recommendation: SupplyPlannerCandidate;
	alternatives: readonly SupplyPlannerCandidate[];
}

export function buildSupplyPlan(game: GameState, request: SupplyPlannerRequest): SupplyPlannerResult;
```

`SupplyPlannerResult` should now expose `{ status: 'ready'; plan: SupplyPlan }` while preserving Task 1's normal error states.

- [ ] **Step 1: Write failing candidate-generation tests**

Cover the exact supported action set:

```ts
it('offers a producer build for a missing constrained producer', () => {
	const plan = readyPlan(gameMissingWaterBottler());
	expect(plan.alternatives.some((candidate) => candidate.action.kind === 'build-producer')).toBe(true);
});

it('chooses the lowest-cost useful upgrade candidate deterministically', () => {
	const plan = readyPlan(gameWithWaterBottlersAtLevels(1, 3));
	const upgrades = plan.alternatives.filter(
		(candidate) => candidate.action.kind === 'upgrade-building'
	);
	expect(upgrades.length).toBeGreaterThan(0);
	const firstUpgrade = upgrades[0]!.action;
	expect(firstUpgrade.kind).toBe('upgrade-building');
	if (firstUpgrade.kind !== 'upgrade-building') return;
	expect(firstUpgrade.fromLevel).toBe(1);
});

it('offers a warehouse build only when warehouse capacity is useful and binding', () => {
	const plan = readyPlan(gameWithWarehousePressure());
	expect(plan.alternatives.some((candidate) => candidate.action.kind === 'build-warehouse')).toBe(true);
});
```

- [ ] **Step 2: Write failing hypothetical/affordability/no-op tests**

```ts
it('re-runs the same projection against a copied hypothetical snapshot', () => {
	const plan = readyPlan(gameWithBottleneck());
	const action = plan.alternatives.find((candidate) => candidate.action.kind !== 'none');
	expect(action).toBeDefined();
	expect(action!.projection.totals.shortageUnits30).toBeLessThanOrEqual(
		plan.baseline.totals.shortageUnits30
	);
});

it('does not select an unaffordable investment as the recommendation', () => {
	const plan = readyPlan(gameWithBottleneck({ cash: 0 }));
	expect(plan.recommendation.action.kind).toBe('none');
});

it('selects no-op for a chain with no meaningful forecast improvement', () => {
	const plan = readyPlan(gameWithSurplusCapacity());
	expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'surplus' });
});
```

- [ ] **Step 3: Run tests and verify the action module is missing**

```bash
bun run test:unit -- src/lib/game/supplyPlannerActions.spec.ts --run --project server
```

Expected: FAIL because `supplyPlannerActions.ts` does not exist.

- [ ] **Step 4: Implement pure hypothetical snapshot application**

Never edit the input snapshot array/object:

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

	const typeId = action.buildingTypeId;
	const buildingType = INDUSTRIAL_BUILDING_TYPES[typeId];
	const buildings = [
		...snapshot.buildings,
		{
			id: `planner:${stableActionKey(action)}`,
			cityId: snapshot.supplyCityId!,
			typeId,
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

- [ ] **Step 5: Implement feasibility without mixing affordability into geometry**

Use the existing industry placement geometry helper rather than `createIndustryPlacementPreview`, because the latter also evaluates funding. Construct a shallow game copy scoped to the planner supply city only for the pure placement check:

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

Import `getIndustrialPlacementBlockReason` from `industryPlacement.ts`. Affordability remains `cost <= snapshot.cash` and is evaluated separately.

- [ ] **Step 6: Generate only useful candidates**

For each constrained material with a producer recipe:

- if there is no matching supply-city building, generate one build candidate for the recipe's building type;
- for existing matching buildings, generate an upgrade candidate only when `canUpgradeBuilding(level)`;
- use `getBuildingUpgradeCost(level)`;
- for equal producer types, stable-sort upgrades by cost then building ID;
- add `build-warehouse` only when the baseline bottleneck is warehouse capacity and a `warehouse` placement is feasible;
- always include a no-op fallback.

Do not generate actions unrelated to a current forecast deficit.

- [ ] **Step 7: Implement comparison + lexicographic ranking**

Comparison is arithmetic against the baseline projection. Recommendation sort order:

```ts
function compareCandidates(left: SupplyPlannerCandidate, right: SupplyPlannerCandidate): number {
	if (left.affordable !== right.affordable) return left.affordable ? -1 : 1;
	if (left.feasible !== right.feasible) return left.feasible ? -1 : 1;
	if (left.comparison.shortageReduction30 !== right.comparison.shortageReduction30)
		return right.comparison.shortageReduction30 - left.comparison.shortageReduction30;
	if (left.comparison.shortageReduction7 !== right.comparison.shortageReduction7)
		return right.comparison.shortageReduction7 - left.comparison.shortageReduction7;
	if (left.comparison.importReduction30 !== right.comparison.importReduction30)
		return right.comparison.importReduction30 - left.comparison.importReduction30;
	if (left.comparison.stockoutImprovementDays !== right.comparison.stockoutImprovementDays)
		return right.comparison.stockoutImprovementDays - left.comparison.stockoutImprovementDays;
	const leftCost = actionCost(left.action);
	const rightCost = actionCost(right.action);
	if (leftCost !== rightCost) return leftCost - rightCost;
	return stableActionKey(left.action).localeCompare(stableActionKey(right.action));
}
```

After sorting, force no-op when the best feasible+affordable investment has no positive shortage/import/stockout improvement. Choose the no-op reason from baseline/supply facts (`surplus`, `unaffordable`, `ineffective`, `no-feasible-action`) instead of deriving prose in UI.

- [ ] **Step 8: Verify candidate snapshots and live game remain immutable**

Add a test that deep-clones both `game` and `plan.snapshot`, calls candidate generation/ranking, then compares both inputs to their clones.

- [ ] **Step 9: Run focused server suites and commit**

```bash
bun run test:unit -- src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts --run --project server
git add src/lib/game/supplyPlanner.ts src/lib/game/supplyPlannerActions.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts
git commit -m "feat(supply): recommend forecast improvements"
```

---

### Task 4: Replace the Presence Checklist with the Planner UI and Localized Evidence

**Files:**
- Modify: `src/lib/components/game/SupplyAdvisor.svelte`
- Modify: `src/lib/components/game/SupplyAdvisor.svelte.spec.ts`
- Modify: `src/lib/i18n/messages/en.ts`
- Modify: `src/lib/i18n/messages/ja.ts`
- Modify: `src/lib/i18n/messages/zh-Hant.ts`
- Modify: `src/lib/i18n/locales.spec.ts`

**Interfaces:**

`SupplyAdvisor.svelte` props become:

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

- [ ] **Step 1: Rewrite component tests around planner states first**

Cover ready, empty, unavailable, unsupported, invalid, no-op, build recommendation, upgrade recommendation, and horizon/category callbacks. Retain existing focus-trap/dialog/Escape-facing accessibility assertions that still apply.

Example ready-state test:

```ts
it('shows baseline and recommendation evidence and emits the chosen action', async () => {
	const onAction = vi.fn();
	const result = readyPlannerResult({ recommendation: buildProducerRecommendation() });

	render(SupplyAdvisor, {
		result,
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
	await expect.element(page.getByText(/30/)).toBeVisible();
	await page.getByRole('button', { name: /build/i }).click();
	expect(onAction).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run client test and verify the old props fail**

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts --run --project client
```

Expected: FAIL because the component still accepts `chains`/`onBuild`.

- [ ] **Step 3: Replace chain-list rendering with compact planner sections**

Keep the existing dialog shell, backdrop close button, `focusTrap`, paper styling, and close control. Inside the dialog render:

```svelte
<select
	aria-label={i18n.t('supplyPlanner.categoryLabel')}
	value={selectedCategoryId ?? ''}
	onchange={(event) => onSelectCategory(event.currentTarget.value)}
>
	{#each categoryIds as categoryId (categoryId)}
		<option value={categoryId}>{i18n.labels.productCategory(categoryId)}</option>
	{/each}
</select>

<div class="horizon-tabs" role="group" aria-label={i18n.t('supplyPlanner.horizonLabel')}>
	{#each [7, 30] as days (days)}
		<button
			type="button"
			aria-pressed={horizonDays === days}
			onclick={() => onSelectHorizon(days as SupplyPlannerHorizonDays)}
		>
			{i18n.t('supplyPlanner.days', { days })}
		</button>
	{/each}
</div>
```

For `status === 'ready'`, render metric rows from the selected horizon, bottleneck evidence, recommendation comparison, and an expandable `<details>` list of material-stage evidence. Do not add a chart library.

For non-ready results, map typed reason codes to dedicated i18n keys. Do not display raw enum strings.

- [ ] **Step 4: Add action copy by discriminated union**

Keep domain reasoning outside presentation. UI only maps action/reason data to copy:

- `build-producer` → building label + cost + shortage/import improvement;
- `upgrade-building` → building label + level transition + cost;
- `build-warehouse` → warehouse label + cost;
- `none` → localized reason and no action button.

The action button passes the exact `SupplyPlannerAction` object to `onAction`.

- [ ] **Step 5: Add translation keys in all three catalogs**

Add one `supplyPlanner` namespace with matching keys for:

- title/eyebrow/scope/category/horizon;
- demand/capacity/inventory/days-of-cover/imports/stockout;
- 7/30-day labels;
- baseline/comparison/recommendation/evidence headings;
- each bottleneck kind;
- each result-state reason;
- each action kind and no-op reason;
- action button labels;
- “actual production may be lower while factories are blocked/stalled” warning.

Use existing material/building/city label helpers instead of duplicating names in messages.

- [ ] **Step 6: Verify locale-key parity and component behavior**

```bash
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/i18n/locales.spec.ts --run --project client
bun run check
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/game/SupplyAdvisor.svelte src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/i18n/messages/en.ts src/lib/i18n/messages/ja.ts src/lib/i18n/messages/zh-Hant.ts src/lib/i18n/locales.spec.ts
git commit -m "feat(supply): present planner forecast and evidence"
```

---

### Task 5: Wire Product Chains, Route-Local Planner Context, and Existing Action Navigation

**Files:**
- Modify: `src/lib/components/game/ProductChainsPanel.svelte`
- Modify: `src/lib/components/game/ProductChainsPanel.svelte.spec.ts`
- Modify: `src/routes/ManagementPanelHost.svelte`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/page.svelte.spec.ts`

**Interfaces:**

Product Chains gets:

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
it('opens planning for the active product chain without changing graph selection semantics', async () => {
	const onPlanCategory = vi.fn();
	render(ProductChainsPanel, { game, i18n, onPlanCategory });

	await page.getByRole('button', { name: i18n.t('supplyPlanner.planThisChain') }).click();
	expect(onPlanCategory).toHaveBeenCalledTimes(1);
	expect(onPlanCategory.mock.calls[0]![0]).toBeTruthy();
});
```

- [ ] **Step 2: Add route tests for planner context and navigation intent**

Cover:

- Build Menu opens planner with a valid category;
- Product Chains callback closes management panel and opens planner focused on that category;
- changing horizon/category persists in route state across close/reopen;
- build/warehouse action closes planner and arms industry placement for the requested type;
- upgrade action closes planner and selects the target building tile rather than directly upgrading it.

Use existing route test helpers/data attributes; do not expose new production-only DOM hooks if current role/text queries suffice.

- [ ] **Step 3: Run targeted client/route tests and verify integration fails**

```bash
bun run test:unit -- src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client
```

Expected: FAIL because callbacks/context are not wired.

- [ ] **Step 4: Add the Product Chains `Plan this chain` control**

Place it beside the active category heading/actions, not inside graph nodes. Only render it when `activeCategory` and `onPlanCategory` exist:

```svelte
{#if activeCategory && onPlanCategory}
	<button type="button" class="plan-chain" onclick={() => onPlanCategory(activeCategory.categoryId)}>
		{i18n.t('supplyPlanner.planThisChain')}
	</button>
{/if}
```

Forward the callback through `ManagementPanelHost.svelte` only for the Product Chains branch.

- [ ] **Step 5: Derive planner categories/result in `+page.svelte`**

Replace `supplyAdvisorChains` with pure planner derivations:

```ts
let supplyPlannerCategoryIds = $derived.by(() =>
	game ? listSupplyPlannerCategories(game, activeCity.id as WorldCityId) : []
);

let selectedSupplyPlannerCategoryId = $derived(
	supplyPlannerCategoryIds.includes(supplyPlannerContext.categoryId ?? '')
		? supplyPlannerContext.categoryId
		: (supplyPlannerCategoryIds[0] ?? null)
);

let supplyPlannerResult = $derived.by(() => {
	if (!game || !selectedSupplyPlannerCategoryId || !isWorldCityId(activeCity.id)) {
		return { status: 'empty', reason: 'no-supported-products' } as const;
	}
	return buildSupplyPlan(game, {
		retailCityId: activeCity.id,
		categoryId: selectedSupplyPlannerCategoryId
	});
});
```

Use the existing world-city type guard rather than new casts in the final implementation.

- [ ] **Step 6: Add open/select handlers that preserve context**

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

When the current category becomes invalid, derive a fallback without clearing the stored category until the user selects another valid one; this preserves context when switching away and back.

- [ ] **Step 7: Implement recommendation navigation without commands**

Build/warehouse:

1. ensure `game` and `plan.snapshot.supplyCityId` exist;
2. select/switch the industry map to the supply city using the existing city-selection route/controller path if needed;
3. close overlays;
4. call the existing `armIndustryPlacement(buildingTypeId)` path.

Upgrade:

1. find the target building by `action.buildingId`;
2. switch to its industry city through existing navigation;
3. close overlays and placement;
4. set `selectedIndustryTileId = building.tileId`;
5. do **not** call `gameRouteController.upgradeIndustrialBuilding`.

If the recommendation has become stale before click (building removed, city closed, category changed), close nothing and recompute/leave the planner visible rather than guessing a target.

- [ ] **Step 8: Pass new props into `SupplyAdvisor` and Product Chains host**

Replace the existing `chains={supplyAdvisorChains}` / `onBuild={buildFromAdvisor}` wiring with `result`, `categoryIds`, selected category, selected horizon, `onSelectCategory`, `onSelectHorizon`, and `onAction`.

Retain existing overlay pausing, focus behavior, and Escape ordering.

- [ ] **Step 9: Run route/component suites and commit**

```bash
bun run test:unit -- src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client
bun run check
git add src/lib/components/game/ProductChainsPanel.svelte src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/routes/ManagementPanelHost.svelte src/routes/+page.svelte src/routes/page.svelte.spec.ts
git commit -m "feat(supply): navigate planner recommendations"
```

---

### Task 6: Remove Obsolete Presence-Only Advisor Logic and Add End-to-End Planner Verification

**Files:**
- Modify: `src/lib/game/supplyAdvisor.ts`
- Modify: `src/lib/game/supplyAdvisor.spec.ts`
- Modify/Delete as appropriate: `src/lib/game/supplyAdvisor.defensive.spec.ts`
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify: any imports revealed by the removal, but no unrelated refactors

- [ ] **Step 1: Prove the new planner no longer imports `AdvisorChain`/`buildSupplyAdvisor`**

Search:

```bash
rg "AdvisorChain|buildSupplyAdvisor|getBuildingTypeProducing" src
```

Expected before cleanup: only old advisor tests/module and any deliberately retained helper references remain. If application code still depends on the old chain model, fix that dependency before deleting exports.

- [ ] **Step 2: Reduce `supplyAdvisor.ts` to Build Menu availability responsibility**

Keep `getAvailableMaterialIds(game)` and its active-industry/city-inventory behavior. Remove `AdvisorStepState`, `AdvisorChainStep`, `AdvisorChain`, `buildSupplyAdvisor`, `collectChain`, `getWantedFinishedMaterials`, and chain-only producer lookup if no other consumer remains.

Do not preserve compatibility re-exports.

- [ ] **Step 3: Rewrite advisor node tests around the retained helper**

Retain tests that protect:

- current active industry city's city inventory;
- positive building-buffer inventory;
- optimistic outputs of placed buildings used for Build Menu recipe hints;
- malformed/missing active inventory returning a safe empty set rather than crashing the Build Menu.

Move any forecast expectations into `supplyPlanner.spec.ts` instead of keeping two planning models.

- [ ] **Step 4: Add one targeted Playwright lifecycle**

In `src/routes/retail-sim.e2e.ts`, add a single scenario named clearly enough for `-g "supply planner"` that:

1. reaches a stable game state with a supported retail category and a constrained supply chain;
2. opens the Supply Planner;
3. confirms demand and both horizon controls are visible;
4. inspects a concrete recommendation and baseline-vs-action evidence;
5. activates a build recommendation and verifies industry placement becomes active **or** activates an upgrade recommendation and verifies the correct building inspector is selected;
6. cancels/returns, reopens the planner, and verifies category/horizon context survives.

Do not assert exact pixel layout or duplicate every calculation case in E2E.

- [ ] **Step 5: Run the focused cleanup + E2E suites**

```bash
bun run test:unit -- src/lib/game/supplyAdvisor.spec.ts src/lib/game/supplyPlanner.spec.ts src/lib/game/supplyPlannerActions.spec.ts --run --project server
bun run test:unit -- src/lib/components/game/SupplyAdvisor.svelte.spec.ts src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/routes/page.svelte.spec.ts --run --project client
bunx playwright test src/routes/retail-sim.e2e.ts -g "supply planner"
```

Expected: PASS.

- [ ] **Step 6: Run the full project verification**

```bash
bun run check
bun run lint
bun run test:unit -- --run
bunx playwright test src/routes/retail-sim.e2e.ts
bun run build
```

Fix only HPA-281 regressions found by these commands. Do not opportunistically refactor unrelated logistics, scenario, finance, or map code.

- [ ] **Step 7: Final acceptance check against HPA-281**

Before the implementation PR is marked ready, verify explicitly:

- same state/request gives the same forecast/recommendation;
- no state/RNG/autosave mutation;
- count/level change capacity;
- shared inputs reconcile;
- 7/30 metrics exist;
- empty/missing/unsupported/surplus states explain themselves;
- affordability changes recommendation;
- hypothetical action uses the same projection path;
- planner action navigates but does not commit;
- Product Chains can open planning for its selected category;
- route-local context survives handoff/reopen;
- no logistics/event forecasting leaked into HPA-281.

- [ ] **Step 8: Commit final cleanup/verification**

```bash
git add src/lib/game/supplyAdvisor.ts src/lib/game/supplyAdvisor.spec.ts src/lib/game/supplyAdvisor.defensive.spec.ts src/routes/retail-sim.e2e.ts
git add -u
git commit -m "test(supply): cover planner action lifecycle"
```

---

## Implementation Order Rationale

1. **Snapshot/requirements first** locks deterministic inputs and city scope before recommendation code exists.
2. **Projection second** creates one tested baseline engine shared by all hypothetical actions.
3. **Actions third** prevents the UI from becoming the place where recommendations are calculated.
4. **UI fourth** consumes stable result unions and can be tested without route wiring.
5. **Route/Product Chains fifth** adds navigation only after planner actions are typed and tested.
6. **Cleanup/E2E last** removes the old model only after the replacement is fully wired and verifies the complete player handoff.

This sequence keeps each commit reviewable and avoids carrying two independent forecast implementations.

## Self-Review Checklist

- Spec coverage: every HPA-281 calculation, recommendation, UI, navigation, immutability, and verification requirement maps to Tasks 1–6.
- Scope: HPA-297 route/in-transit concerns are extension points only; HPA-296 event semantics are excluded.
- Type consistency: `SupplyPlannerRequest`, `SupplyPlannerSnapshot`, `SupplyProjection`, `SupplyPlannerAction`, `SupplyPlannerCandidate`, `SupplyPlan`, and `SupplyPlannerResult` are defined before use.
- No placeholders: every task names concrete files, interfaces, test cases, commands, and algorithms.
- KISS/YAGNI: two domain modules, one existing modal, one route-local context object, no new infrastructure.
