# Industry City Map Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a separate Industry City Map where players build industrial chains for Convenience products, produce materials into warehouses, and refill shops from local stock before importing shortfalls.

**Architecture:** Keep the simulation pure and deterministic under `src/lib/game`, mirroring the existing retail city, stock, and map snapshot structure. The first implementation slice covers `snacks`, `drinks`, and `essentials` end-to-end, while the material/building catalog stays shaped for the full 12-category design. Svelte owns map switching and inspectors only; production, placement, warehouse, and refill rules stay in pure TypeScript.

**Tech Stack:** TypeScript, SvelteKit/Svelte 5 runes, Phaser, Bun, Vitest server/browser projects, Playwright e2e, existing seeded RNG and save-validation patterns.

---

## Ground Rules

- Before editing any `.svelte` file, use the official Svelte MCP workflow required by `CLAUDE.md`: `list-sections`, `get-documentation` for relevant sections, then `svelte-autofixer` until clean.
- Keep the first production slice to Convenience products: `snacks`, `drinks`, `essentials`.
- Do not add old-save migration. Bump the save schema and let invalid prototype saves reset through existing validation behavior.
- Preserve current retail behavior when no local warehouse stock is available: weekly refills still reach target through import fallback.
- Use focused verification first, then `bun run check`, then e2e.

## Task 1: Industry Domain, Catalog, And Map Generation

**Files:**

- Modify: `src/lib/game/types.ts`
- Create: `src/lib/game/industry.ts`
- Create: `src/lib/game/industry.spec.ts`

### Step 1: Write failing domain and map tests

Create `src/lib/game/industry.spec.ts` with tests for deterministic map generation and first-slice catalog coverage:

```ts
import { describe, expect, test } from 'vitest';
import {
	CONVENIENCE_BUILDING_TYPE_IDS,
	INDUSTRIAL_BUILDING_TYPES,
	MATERIALS,
	PRODUCTION_RECIPES,
	generateIndustryCity,
	getIndustryTileById,
	getIndustryTilesByResource
} from './industry';

describe('industry domain catalog', () => {
	test('defines every convenience finished material and required building', () => {
		expect.assertions(4);

		expect(MATERIALS.snacks.kind).toBe('finished');
		expect(MATERIALS.drinks.kind).toBe('finished');
		expect(MATERIALS.essentials.kind).toBe('finished');
		expect(CONVENIENCE_BUILDING_TYPE_IDS.every((id) => INDUSTRIAL_BUILDING_TYPES[id])).toBe(true);
	});

	test('connects convenience recipes to known materials', () => {
		expect.assertions(1);
		const materialIds = new Set(Object.keys(MATERIALS));
		const recipeMaterialIds = Object.values(PRODUCTION_RECIPES).flatMap((recipe) => [
			...recipe.inputs.map((input) => input.materialId),
			...recipe.outputs.map((output) => output.materialId)
		]);

		expect(recipeMaterialIds.every((materialId) => materialIds.has(materialId))).toBe(true);
	});
});

describe('industry city generation', () => {
	test('generates deterministic industry tiles for the same seed', () => {
		expect.assertions(1);
		const first = generateIndustryCity({
			id: 'industry-city',
			name: 'Industry City',
			width: 18,
			height: 18,
			seed: 20260512
		});
		const second = generateIndustryCity({
			id: 'industry-city',
			name: 'Industry City',
			width: 18,
			height: 18,
			seed: 20260512
		});

		expect(first).toEqual(second);
	});

	test('guarantees required convenience resources and industrial tiles', () => {
		expect.assertions(10);
		const city = generateIndustryCity({
			id: 'industry-city',
			name: 'Industry City',
			width: 18,
			height: 18,
			seed: 20260512
		});

		expect(getIndustryTilesByResource(city, 'grain-field').length).toBeGreaterThan(0);
		expect(getIndustryTilesByResource(city, 'salt-deposit').length).toBeGreaterThan(0);
		expect(getIndustryTilesByResource(city, 'oilseed-field').length).toBeGreaterThan(0);
		expect(getIndustryTilesByResource(city, 'water-source').length).toBeGreaterThan(0);
		expect(getIndustryTilesByResource(city, 'fruit-orchard').length).toBeGreaterThan(0);
		expect(getIndustryTilesByResource(city, 'sugar-field').length).toBeGreaterThan(0);
		expect(getIndustryTilesByResource(city, 'pulpwood-forest').length).toBeGreaterThan(0);
		expect(getIndustryTilesByResource(city, 'chemical-feedstock').length).toBeGreaterThan(0);
		expect(city.tiles.some((tile) => tile.terrain === 'industrial' && !tile.locked)).toBe(true);
		expect(getIndustryTileById(city, 'industry-city-1-1')?.cityId).toBe(city.id);
	});
});
```

### Step 2: Run tests to verify they fail

Run:

```bash
bun run test:unit -- src/lib/game/industry.spec.ts --run
```

Expected: FAIL because `src/lib/game/industry.ts` does not exist.

### Step 3: Add industry types

Modify `src/lib/game/types.ts` with first-slice industry types:

```ts
export type MaterialId =
	| 'grain'
	| 'salt'
	| 'oilseeds'
	| 'water'
	| 'fruit'
	| 'sugar'
	| 'pulpwood'
	| 'chemical-feedstock'
	| 'flour'
	| 'cooking-oil'
	| 'filtered-water'
	| 'syrup'
	| 'paper-pulp'
	| 'plastic'
	| 'packaging'
	| 'cleaning-base'
	| 'snacks'
	| 'drinks'
	| 'essentials';

export type MaterialKind = 'raw' | 'intermediate' | 'finished';
export type IndustryTerrainId =
	| 'farmland'
	| 'forest'
	| 'water'
	| 'deposit'
	| 'industrial'
	| 'blocked';
export type IndustryResourceId =
	| 'grain-field'
	| 'salt-deposit'
	| 'oilseed-field'
	| 'water-source'
	| 'fruit-orchard'
	| 'sugar-field'
	| 'pulpwood-forest'
	| 'chemical-feedstock';

export interface MaterialDefinition {
	id: MaterialId;
	name: string;
	kind: MaterialKind;
	importCost: number;
	localValue: number;
}

export interface MaterialQuantity {
	materialId: MaterialId;
	quantity: number;
}

export interface IndustryTile {
	id: string;
	cityId: string;
	x: number;
	y: number;
	terrain: IndustryTerrainId;
	resource: IndustryResourceId | null;
	locked: boolean;
}

export interface IndustryCity {
	id: string;
	name: string;
	width: number;
	height: number;
	tiles: IndustryTile[];
}

export type IndustrialBuildingTypeId =
	| 'grain-farm'
	| 'salt-mine'
	| 'oilseed-farm'
	| 'water-pump'
	| 'fruit-farm'
	| 'sugar-farm'
	| 'pulpwood-grove'
	| 'chemical-feedstock-well'
	| 'flour-mill'
	| 'oil-press'
	| 'water-filtration-plant'
	| 'syrup-plant'
	| 'pulp-mill'
	| 'plastic-plant'
	| 'packaging-plant'
	| 'chemical-plant'
	| 'snack-factory'
	| 'drink-bottling-plant'
	| 'household-goods-factory'
	| 'warehouse';

export interface ProductionRecipe {
	id: string;
	inputs: MaterialQuantity[];
	outputs: MaterialQuantity[];
	operatingCost: number;
	stage: 'raw' | 'process' | 'final';
}

export interface IndustrialBuildingType {
	id: IndustrialBuildingTypeId;
	name: string;
	buildCost: number;
	dailyOperatingCost: number;
	requiredResource: IndustryResourceId | null;
	requiresIndustrialTile: boolean;
	recipeId: string | null;
	warehouseCapacity: number;
}
```

### Step 4: Implement `industry.ts`

Create `src/lib/game/industry.ts` exporting:

- `MATERIALS: Readonly<Record<MaterialId, MaterialDefinition>>`
- `PRODUCTION_RECIPES: Readonly<Record<string, ProductionRecipe>>`
- `INDUSTRIAL_BUILDING_TYPES: Readonly<Record<IndustrialBuildingTypeId, IndustrialBuildingType>>`
- `CONVENIENCE_BUILDING_TYPE_IDS`
- `generateIndustryCity`
- `getIndustryTileById`
- `getIndustryTilesByResource`

Use deterministic fixed resource anchors plus seeded filler tiles so tests do not depend on a rare random resource:

```ts
const RESOURCE_ANCHORS: Array<{
	x: number;
	y: number;
	resource: IndustryResourceId;
	terrain: IndustryTerrainId;
}> = [
	{ x: 1, y: 1, resource: 'grain-field', terrain: 'farmland' },
	{ x: 3, y: 1, resource: 'oilseed-field', terrain: 'farmland' },
	{ x: 5, y: 1, resource: 'fruit-orchard', terrain: 'farmland' },
	{ x: 7, y: 1, resource: 'sugar-field', terrain: 'farmland' },
	{ x: 1, y: 4, resource: 'salt-deposit', terrain: 'deposit' },
	{ x: 3, y: 4, resource: 'chemical-feedstock', terrain: 'deposit' },
	{ x: 1, y: 7, resource: 'water-source', terrain: 'water' },
	{ x: 4, y: 7, resource: 'pulpwood-forest', terrain: 'forest' }
];
```

Keep dimensions normalized like `generateCity` does.

### Step 5: Run focused tests

Run:

```bash
bun run test:unit -- src/lib/game/industry.spec.ts --run
```

Expected: PASS.

### Step 6: Commit domain catalog

Run:

```bash
git add src/lib/game/types.ts src/lib/game/industry.ts src/lib/game/industry.spec.ts
git commit -m "Add industry domain catalog"
```

## Task 2: Game State Initialization And Save Validation

**Files:**

- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/state.spec.ts`
- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveRepository.spec.ts`
- Modify: `src/lib/persistence/tauriSaveRepository.spec.ts`

### Step 1: Write failing state and save tests

Add to `src/lib/game/state.spec.ts`:

```ts
test('creates industry state for a new game', () => {
	expect.assertions(6);
	const game = createNewGame('convenience', 20260512);

	expect(game.industryCities).toHaveLength(1);
	expect(game.activeIndustryCityId).toBe(game.industryCities[0]?.id);
	expect(game.industrialBuildings).toEqual([]);
	expect(game.warehouse.capacity).toBe(0);
	expect(game.warehouse.materials).toEqual({});
	expect(game.warehouse.overflowUnits).toBe(0);
});
```

Add save tests that reject missing industry fields and invalid material ids in warehouse state:

```ts
test('rejects saved games missing industry state fields', () => {
	expect.assertions(2);
	const game = createGame();
	const gameWithoutIndustry: Partial<GameState> = { ...game };
	delete gameWithoutIndustry.industryCities;
	const snapshot = createSnapshotWithGame(gameWithoutIndustry);

	expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
	expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
		'Saved game industryCities must be an array'
	);
});

test('rejects warehouse materials with unknown ids', () => {
	expect.assertions(2);
	const game = createGame({
		warehouse: {
			capacity: 20,
			materials: { snacks: 5, 'bad-material': 1 } as Record<string, number>,
			overflowUnits: 0,
			overflowCost: 0
		}
	});
	const snapshot = createSnapshotWithGame(game);

	expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
	expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
		'Saved game warehouse materials bad-material must be a known material'
	);
});
```

### Step 2: Run tests to verify they fail

Run:

```bash
bun run test:unit -- src/lib/game/state.spec.ts src/lib/persistence/saveRepository.spec.ts --run
```

Expected: FAIL because `GameState` and save validation do not include industry state yet.

### Step 3: Extend `GameState`

Add to `src/lib/game/types.ts`:

```ts
export interface WarehouseInventory {
	capacity: number;
	materials: Partial<Record<MaterialId, number>>;
	overflowUnits: number;
	overflowCost: number;
}

export type IndustrialBuildingStatus = 'idle' | 'produced' | 'imported-inputs' | 'blocked';

export interface IndustrialBuilding {
	id: string;
	typeId: IndustrialBuildingTypeId;
	cityId: string;
	tileId: string;
	mapX: number;
	mapY: number;
	status: IndustrialBuildingStatus;
	lastProduction: DailyMaterialMovement[];
	producedTotal: number;
	importedInputTotal: number;
	blockedDays: number;
}

export interface DailyMaterialMovement {
	materialId: MaterialId;
	quantity: number;
	value: number;
	source: 'local' | 'import' | 'warehouse' | 'overflow';
}
```

Add to `GameState`:

```ts
industryCities: IndustryCity[];
activeIndustryCityId: string;
industrialBuildings: IndustrialBuilding[];
warehouse: WarehouseInventory;
```

### Step 4: Initialize industry state

Modify `createNewGame` in `src/lib/game/state.ts`:

```ts
const industryCity = generateIndustryCity({
	id: 'industry-city',
	name: 'Industry City',
	width: 18,
	height: 18,
	seed: normalizedSeed + 101
});
```

Include in returned game:

```ts
industryCities: [industryCity],
activeIndustryCityId: industryCity.id,
industrialBuildings: [],
warehouse: {
	capacity: 0,
	materials: {},
	overflowUnits: 0,
	overflowCost: 0
},
```

### Step 5: Bump and validate save schema

Modify `src/lib/persistence/saveTypes.ts`:

```ts
export const SAVE_SCHEMA_VERSION = 4;
```

In `saveCodec.ts`, add known id arrays from `industry.ts`, then validate:

- `industryCities` with `IndustryTile` fields.
- `activeIndustryCityId`.
- `industrialBuildings`.
- `warehouse.capacity`, `warehouse.materials`, `warehouse.overflowUnits`, `warehouse.overflowCost`.

Reject unknown material/building/resource ids with explicit messages.

### Step 6: Update fixtures

Update `createGame()` in `saveRepository.spec.ts` and any Tauri save fixture to include:

```ts
industryCities: [
	{
		id: 'industry-city',
		name: 'Industry City',
		width: 1,
		height: 1,
		tiles: []
	}
],
activeIndustryCityId: 'industry-city',
industrialBuildings: [],
warehouse: {
	capacity: 0,
	materials: {},
	overflowUnits: 0,
	overflowCost: 0
},
```

### Step 7: Run focused tests

Run:

```bash
bun run test:unit -- src/lib/game/state.spec.ts src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts --run
```

Expected: PASS.

### Step 8: Commit state and persistence

Run:

```bash
git add src/lib/game/types.ts src/lib/game/state.ts src/lib/game/state.spec.ts src/lib/persistence/saveTypes.ts src/lib/persistence/saveCodec.ts src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts
git commit -m "Add industry state persistence"
```

## Task 3: Industrial Placement Rules And Building Creation

**Files:**

- Create: `src/lib/game/industryPlacement.ts`
- Create: `src/lib/game/industryPlacement.spec.ts`
- Modify: `src/lib/game/types.ts`

### Step 1: Write failing placement tests

Create `src/lib/game/industryPlacement.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { getIndustryTilesByResource } from './industry';
import {
	buildIndustrialBuilding,
	getAllowedIndustrialBuildingTypes,
	getIndustrialPlacementBlockReason
} from './industryPlacement';
import { createNewGame } from './state';

describe('industrial placement', () => {
	test('allows raw buildings only on matching resource tiles', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260512);
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const saltTile = getIndustryTilesByResource(city, 'salt-deposit')[0]!;

		expect(getIndustrialPlacementBlockReason(game, grainTile.id, 'grain-farm')).toBeNull();
		expect(getIndustrialPlacementBlockReason(game, saltTile.id, 'grain-farm')).toBe(
			'Requires grain field'
		);
		expect(getAllowedIndustrialBuildingTypes(game, grainTile.id).map((type) => type.id)).toContain(
			'grain-farm'
		);
	});

	test('builds an industrial building immutably and charges cash', () => {
		expect.assertions(7);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const result = buildIndustrialBuilding(game, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});

		expect(result).not.toBe(game);
		expect(result.industrialBuildings).toHaveLength(1);
		expect(result.industrialBuildings[0]?.typeId).toBe('grain-farm');
		expect(result.industrialBuildings[0]?.tileId).toBe(grainTile.id);
		expect(result.industrialBuildings[0]?.mapX).toBe(grainTile.x);
		expect(result.cash).toBeLessThan(game.cash);
		expect(game.industrialBuildings).toHaveLength(0);
	});

	test('rejects occupied tiles and insufficient cash with decisions', () => {
		expect.assertions(3);
		const game = { ...createNewGame('convenience', 20260512), cash: 0 };
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const blocked = buildIndustrialBuilding(game, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});

		expect(blocked.industrialBuildings).toHaveLength(0);
		expect(blocked.decisions.at(-1)?.title).toBe('Industrial construction delayed');
		expect(blocked.decisions.at(-1)?.context).toContain('requires');
	});
});
```

### Step 2: Run tests to verify they fail

Run:

```bash
bun run test:unit -- src/lib/game/industryPlacement.spec.ts --run
```

Expected: FAIL because placement helpers do not exist.

### Step 3: Implement placement helpers

Create `industryPlacement.ts` with:

- `getIndustrialPlacementBlockReason(game, tileId, buildingTypeId): string | null`
- `getAllowedIndustrialBuildingTypes(game, tileId): IndustrialBuildingType[]`
- `buildIndustrialBuilding(game, input): GameState`

Rules:

- Unknown tile: decision, no state change except decision.
- Occupied tile: block with `Occupied industrial tile`.
- Raw building with `requiredResource`: tile `resource` must match.
- `requiresIndustrialTile`: tile `terrain` must be `industrial`.
- Insufficient cash: append a decision and do not build.
- Warehouse buildings increase capacity indirectly through production/warehouse recalculation in Task 4; construction only adds the building.

Use ids like `industry-building-${game.industrialBuildings.length + 1}`.

### Step 4: Run focused tests

Run:

```bash
bun run test:unit -- src/lib/game/industryPlacement.spec.ts --run
```

Expected: PASS.

### Step 5: Commit placement

Run:

```bash
git add src/lib/game/types.ts src/lib/game/industryPlacement.ts src/lib/game/industryPlacement.spec.ts
git commit -m "Add industrial placement rules"
```

## Task 4: Warehouse Operations And Daily Production

**Files:**

- Create: `src/lib/game/industryProduction.ts`
- Create: `src/lib/game/industryProduction.spec.ts`
- Modify: `src/lib/game/types.ts`

### Step 1: Write failing production tests

Create `src/lib/game/industryProduction.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { getIndustryTilesByResource } from './industry';
import { buildIndustrialBuilding } from './industryPlacement';
import {
	addWarehouseMaterial,
	removeWarehouseMaterial,
	simulateIndustryProduction
} from './industryProduction';
import { createNewGame } from './state';

function buildOnResource(
	game: ReturnType<typeof createNewGame>,
	resource: Parameters<typeof getIndustryTilesByResource>[1],
	typeId: Parameters<typeof buildIndustrialBuilding>[1]['buildingTypeId']
) {
	const tile = getIndustryTilesByResource(game.industryCities[0]!, resource)[0]!;
	return buildIndustrialBuilding(game, { tileId: tile.id, buildingTypeId: typeId });
}

describe('warehouse operations', () => {
	test('adds material and reports overflow cost above capacity', () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260512);
		const warehouse = addWarehouseMaterial(
			{ capacity: 5, materials: {}, overflowUnits: 0, overflowCost: 0 },
			'snacks',
			8
		);

		expect(warehouse.materials.snacks).toBe(8);
		expect(warehouse.capacity).toBe(5);
		expect(warehouse.overflowUnits).toBe(3);
		expect(warehouse.overflowCost).toBeGreaterThan(0);
		void game;
	});

	test('removes available stock and returns shortage', () => {
		expect.assertions(3);
		const result = removeWarehouseMaterial(
			{ capacity: 20, materials: { snacks: 6 }, overflowUnits: 0, overflowCost: 0 },
			'snacks',
			10
		);

		expect(result.quantityRemoved).toBe(6);
		expect(result.shortage).toBe(4);
		expect(result.warehouse.materials.snacks).toBe(0);
	});
});

describe('industry production simulation', () => {
	test('raw producers add materials to warehouse inventory', () => {
		expect.assertions(3);
		let game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		game = buildOnResource(game, 'grain-field', 'grain-farm');

		const result = simulateIndustryProduction(game);

		expect(result.game.warehouse.materials.grain).toBeGreaterThan(0);
		expect(result.report.produced.some((item) => item.materialId === 'grain')).toBe(true);
		expect(result.game.industrialBuildings[0]?.status).toBe('produced');
	});

	test('processors import missing inputs and report import spend', () => {
		expect.assertions(4);
		let game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const industrialTile = game.industryCities[0]!.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;
		game = buildIndustrialBuilding(game, {
			tileId: industrialTile.id,
			buildingTypeId: 'flour-mill'
		});

		const result = simulateIndustryProduction(game);

		expect(result.report.importedInputs.some((item) => item.materialId === 'grain')).toBe(true);
		expect(result.report.importSpend).toBeGreaterThan(0);
		expect(result.game.cash).toBeLessThan(game.cash);
		expect(result.game.warehouse.materials.flour).toBeGreaterThan(0);
	});
});
```

### Step 2: Run tests to verify they fail

Run:

```bash
bun run test:unit -- src/lib/game/industryProduction.spec.ts --run
```

Expected: FAIL because production helpers do not exist.

### Step 3: Add production report types

Modify `src/lib/game/types.ts`:

```ts
export interface DailyProductionReport {
	produced: DailyMaterialMovement[];
	consumed: DailyMaterialMovement[];
	importedInputs: DailyMaterialMovement[];
	warehousePulls: DailyMaterialMovement[];
	shopImports: DailyMaterialMovement[];
	importSpend: number;
	operatingCost: number;
	overflowUnits: number;
	overflowCost: number;
	warehouseCapacity: number;
	warehouseUsed: number;
}
```

Add `productionReport: DailyProductionReport;` to `DailyReport`.

### Step 4: Implement warehouse helpers

Create pure helpers:

- `getWarehouseUsed(warehouse)`
- `recalculateWarehousePressure(warehouse)`
- `addWarehouseMaterial(warehouse, materialId, quantity)`
- `removeWarehouseMaterial(warehouse, materialId, requestedQuantity)`
- `getWarehouseCapacity(game)`

Capacity should be the sum of `warehouseCapacity` from placed warehouse building types. Overflow is `max(0, totalUnits - capacity)`. Use a simple exported constant:

```ts
export const WAREHOUSE_OVERFLOW_COST_PER_UNIT = 2;
```

### Step 5: Implement production simulation

Implement `simulateIndustryProduction(game): { game: GameState; report: DailyProductionReport }`.

Order buildings by recipe stage: raw, process, final, warehouse. For each production building:

1. Withdraw local inputs.
2. Import any shortage using `MATERIALS[materialId].importCost`.
3. Add outputs.
4. Charge recipe/building operating costs and import costs.
5. Update building `status`, `lastProduction`, totals, and blocked days.

If a building has no recipe and is a warehouse, it should only contribute capacity.

### Step 6: Run focused production tests

Run:

```bash
bun run test:unit -- src/lib/game/industryProduction.spec.ts --run
```

Expected: PASS.

### Step 7: Commit production

Run:

```bash
git add src/lib/game/types.ts src/lib/game/industryProduction.ts src/lib/game/industryProduction.spec.ts
git commit -m "Add warehouse production simulation"
```

## Task 5: Source-Aware Weekly Shop Refill

**Files:**

- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/stock.spec.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/game/reports.ts`
- Modify: `src/lib/game/reports.spec.ts`

### Step 1: Write failing stock refill tests

Add to `src/lib/game/stock.spec.ts`:

```ts
test('weekly refill pulls finished goods from warehouse before imports', () => {
	expect.assertions(6);
	const game = {
		...createNewGame('convenience', 20260508),
		warehouse: {
			capacity: 200,
			materials: { snacks: 12 },
			overflowUnits: 0,
			overflowCost: 0
		}
	};
	const store = {
		...game.stores[0]!,
		products: [
			{ categoryId: 'snacks', stock: 4, reorderThreshold: 10, targetStock: 25, sellingPrice: 5 }
		]
	};
	const result = applyWeeklyImports({
		game: { ...game, stores: [store] },
		storeReports: new Map()
	});
	const product = result.stores[0]!.products[0]!;
	const report = result.productReports.get(store.id)![0]!;

	expect(product.stock).toBe(25);
	expect(result.warehouse.materials.snacks).toBe(0);
	expect(report.warehouseUnits).toBe(12);
	expect(report.importedUnits).toBe(9);
	expect(report.importSpend).toBe(27);
	expect(result.importSpend).toBe(27);
});
```

Add to `simulateDay.spec.ts`:

```ts
test('runs industry production before weekly shop refill', () => {
	expect.assertions(4);
	const baseGame = {
		...createNewGame('convenience', 20260508),
		day: 7,
		cash: 50_000
	};
	const store = {
		...baseGame.stores[0]!,
		products: [
			{ categoryId: 'snacks', stock: 0, reorderThreshold: 5, targetStock: 20, sellingPrice: 5 }
		]
	};
	const noWarehouse = simulateDay({
		...baseGame,
		stores: [store],
		warehouse: { capacity: 200, materials: {}, overflowUnits: 0, overflowCost: 0 }
	});
	const withWarehouse = simulateDay({
		...baseGame,
		stores: [store],
		warehouse: { capacity: 200, materials: { snacks: 12 }, overflowUnits: 0, overflowCost: 0 }
	});
	const warehouseReport = withWarehouse.reports[0]!.storeReports[0]!.productReports[0]!;

	expect(noWarehouse.reports[0]!.storeReports[0]!.productReports[0]!.importedUnits).toBe(20);
	expect(warehouseReport.warehouseUnits).toBe(12);
	expect(warehouseReport.importedUnits).toBe(8);
	expect(withWarehouse.reports[0]!.importSpend).toBeLessThan(noWarehouse.reports[0]!.importSpend);
});
```

### Step 2: Run tests to verify they fail

Run:

```bash
bun run test:unit -- src/lib/game/stock.spec.ts src/lib/game/simulateDay.spec.ts --run
```

Expected: FAIL because reports do not track warehouse refill source and `applyWeeklyImports` does not return warehouse state.

### Step 3: Extend product reports

Modify `DailyProductReport` in `types.ts`:

```ts
warehouseUnits: number;
warehouseValue: number;
```

Update all product report constructors in `stock.ts`, `simulateDay.ts`, and tests with `warehouseUnits: 0`, `warehouseValue: 0`.

### Step 4: Update weekly refill helper

Keep the exported name `applyWeeklyImports` for a smaller refactor, but change `WeeklyImportResult` to include `warehouse: WarehouseInventory`.

For each below-threshold product:

1. Compute `neededUnits`.
2. Remove finished material from `game.warehouse` using `categoryId as MaterialId`.
3. Import the shortage.
4. Record `warehouseUnits`, `warehouseValue`, `importedUnits`, `importSpend`.
5. Return updated stores, reports, warehouse, and import spend.

### Step 5: Integrate production into `simulateDay`

At the start of `simulateDay`, run:

```ts
const industryResult = simulateIndustryProduction(game);
const productionGame = industryResult.game;
```

Use `productionGame` as the base for sales and imports. When weekly imports run, pass the production-updated warehouse and use returned warehouse in the final state.

Set `report.productionReport = { ...industryResult.report, warehousePulls, shopImports }` after weekly refill. Include overflow cost in daily cash flow:

```ts
const operatingCosts =
	sum(storeReports, 'operatingCosts') +
	payrollCost +
	productionReport.operatingCost +
	productionReport.overflowCost;
const importSpend = sum(storeReports, 'importSpend') + productionReport.importSpend;
```

### Step 6: Update summaries

Modify `reports.ts`/`reports.spec.ts` to preserve existing `summarizeReports` behavior and include production import spend in import totals.

### Step 7: Run focused simulation tests

Run:

```bash
bun run test:unit -- src/lib/game/stock.spec.ts src/lib/game/simulateDay.spec.ts src/lib/game/reports.spec.ts --run
```

Expected: PASS.

### Step 8: Commit refill integration

Run:

```bash
git add src/lib/game/types.ts src/lib/game/stock.ts src/lib/game/stock.spec.ts src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts src/lib/game/reports.ts src/lib/game/reports.spec.ts
git commit -m "Use warehouse stock for weekly refills"
```

## Task 6: Industry Map Snapshot And Phaser Bridge

**Files:**

- Create: `src/lib/game/industryMapRender.ts`
- Create: `src/lib/game/industryMapRender.spec.ts`
- Create: `src/lib/components/game/IndustryMap.svelte`
- Create: `src/lib/phaser/industryMapScene.ts`

### Step 1: Write failing snapshot tests

Create `industryMapRender.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createNewGame } from './state';
import { createIndustryMapSnapshot } from './industryMapRender';

describe('industry map render snapshot', () => {
	test('creates a serializable snapshot for the active industry city', () => {
		expect.assertions(7);
		const game = createNewGame('convenience', 20260512);
		const tile = game.industryCities[0]!.tiles.find((candidate) => !candidate.locked)!;

		const snapshot = createIndustryMapSnapshot(game, tile.id);

		expect(snapshot.cityId).toBe(game.activeIndustryCityId);
		expect(snapshot.width).toBe(18);
		expect(snapshot.height).toBe(18);
		expect(snapshot.tiles).toHaveLength(324);
		expect(snapshot.selectedTileId).toBe(tile.id);
		expect(snapshot.tiles.find((candidate) => candidate.id === tile.id)?.selected).toBe(true);
		expect(snapshot.buildings).toHaveLength(0);
	});
});
```

### Step 2: Run tests to verify they fail

Run:

```bash
bun run test:unit -- src/lib/game/industryMapRender.spec.ts --run
```

Expected: FAIL because render snapshot does not exist.

### Step 3: Implement industry snapshot

Create `industryMapRender.ts` with `IndustryMapTileRender`, `IndustryMapBuildingRender`, and `IndustryMapSnapshot`. Include:

- Tile id/x/y/terrain/resource/locked/selected/occupied.
- Building id/name/typeId/tileId/x/y/status.

Return an empty safe snapshot when active industry city is missing, matching `mapRender.ts`.

### Step 4: Create Phaser scene and Svelte bridge

Create `IndustryMap.svelte` following the existing `CityMap.svelte` pattern:

- `snapshot: IndustryMapSnapshot`
- `onTileSelected: (tileId: string) => void`
- Dynamic import `phaser` and `$lib/phaser/industryMapScene`.

Create `industryMapScene.ts` by adapting `cityMapScene.ts` with first-slice industrial rendering:

- Tile colors by industry terrain.
- Resource badges or small geometric markers for resource tiles.
- Building markers by type/stage.
- Canvas data attributes for e2e:
  - `data-industry-building-count`
  - `data-industry-resource-count`
  - `data-map-tile-size`
  - `data-map-zoom`
  - existing camera view attributes.

### Step 5: Run focused snapshot tests

Run:

```bash
bun run test:unit -- src/lib/game/industryMapRender.spec.ts --run
```

Expected: PASS.

### Step 6: Commit map bridge

Run:

```bash
git add src/lib/game/industryMapRender.ts src/lib/game/industryMapRender.spec.ts src/lib/components/game/IndustryMap.svelte src/lib/phaser/industryMapScene.ts
git commit -m "Add industry map renderer"
```

## Task 7: Industry Inspector And Route Map Switch

**Files:**

- Create: `src/lib/components/game/IndustryTileInspector.svelte`
- Create: `src/lib/components/game/IndustryTileInspector.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`
- Modify: `src/routes/retail-sim.e2e.ts`

### Step 1: Use Svelte MCP documentation

Before editing Svelte files:

1. Call Svelte MCP `list-sections`.
2. Fetch docs for runes props/state/effects and component event/callback patterns with `get-documentation`.
3. After drafting each Svelte file, run `svelte-autofixer` until no issues remain.

### Step 2: Write failing component tests

Create `IndustryTileInspector.svelte.spec.ts` with browser tests:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import IndustryTileInspector from './IndustryTileInspector.svelte';
import { getIndustryTilesByResource } from '$lib/game/industry';
import { createNewGame } from '$lib/game/state';

describe('IndustryTileInspector', () => {
	it('shows allowed raw building for a matching resource tile', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260512);
		const tile = getIndustryTilesByResource(game.industryCities[0]!, 'grain-field')[0]!;
		const onBuild = vi.fn();

		render(IndustryTileInspector, {
			game,
			tile,
			building: null,
			onBuild,
			onClose: vi.fn()
		});

		await expect.element(page.getByRole('heading', { name: /industry tile/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /build grain farm/i })).toBeVisible();
	});
});
```

### Step 3: Run tests to verify they fail

Run:

```bash
bun run test:unit -- src/lib/components/game/IndustryTileInspector.svelte.spec.ts --run --project client
```

Expected: FAIL because component does not exist.

### Step 4: Implement inspector

`IndustryTileInspector.svelte` props:

```ts
interface Props {
	game: GameState;
	tile: IndustryTile | null;
	building: IndustrialBuilding | null;
	onBuild: (buildingTypeId: IndustrialBuildingTypeId, tileId: string) => void;
	onClose: () => void;
}
```

Render:

- Close button.
- Tile coordinates, terrain, resource.
- If no building, allowed building buttons from `getAllowedIndustrialBuildingTypes`.
- If building exists, building details: status, last production, produced total, imported inputs, blocked days.
- Warehouse summary if the building type is `warehouse`.

### Step 5: Modify route map switch

In `src/routes/+page.svelte`:

- Add `activeMapView = $state<'retail' | 'industry'>('retail')`.
- Add `selectedIndustryTileId = $state<string | null>(null)`.
- Add derived `industryCity`, `selectedIndustryTile`, `selectedIndustryBuilding`, `industryMapSnapshot`.
- Add menu actions for `Retail City Map` and `Industry City Map`.
- Render `<CityMap>` when active view is retail and `<IndustryMap>` when active view is industry.
- Render `<TileInspector>` for retail selection and `<IndustryTileInspector>` for industry selection.
- Wire `buildIndustrialBuilding` through `setGameAndAutosave`.

### Step 6: Run component and type checks

Run:

```bash
bun run test:unit -- src/lib/components/game/IndustryTileInspector.svelte.spec.ts --run --project client
bun run check
```

Expected: PASS.

### Step 7: Commit UI wiring

Run:

```bash
git add src/lib/components/game/IndustryTileInspector.svelte src/lib/components/game/IndustryTileInspector.svelte.spec.ts src/routes/+page.svelte
git commit -m "Add industry map UI"
```

## Task 8: Reports, Control Tower Summary, And Save Fixtures

**Files:**

- Modify: `src/lib/components/game/ReportsPanel.svelte`
- Modify: `src/lib/components/game/ReportsPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/StoreOverview.svelte`
- Modify: `src/lib/components/game/StoreOverview.svelte.spec.ts`
- Modify: `src/lib/persistence/saveRepository.spec.ts`
- Modify: `src/lib/persistence/tauriSaveRepository.spec.ts`

### Step 1: Write failing report component tests

Add tests proving:

- `ReportsPanel` shows production imports and overflow when latest report has production data.
- Existing import metric remains visible.
- Store overview still renders stock/imports with extended product reports.

### Step 2: Run tests to verify they fail

Run:

```bash
bun run test:unit -- src/lib/components/game/ReportsPanel.svelte.spec.ts src/lib/components/game/StoreOverview.svelte.spec.ts --run --project client
```

Expected: FAIL until UI reads production report fields.

### Step 3: Update summary UI

In `ReportsPanel.svelte`, add compact metrics:

- `Production imports`
- `Warehouse overflow`

Keep the panel dense and operational. Do not add explanatory feature copy.

### Step 4: Update fixtures

Any test fixture that constructs `DailyReport` or `DailyProductReport` must include:

- `productionReport`
- `warehouseUnits`
- `warehouseValue`

### Step 5: Run focused tests

Run:

```bash
bun run test:unit -- src/lib/components/game/ReportsPanel.svelte.spec.ts src/lib/components/game/StoreOverview.svelte.spec.ts src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts --run
```

Expected: PASS.

### Step 6: Commit reporting updates

Run:

```bash
git add src/lib/components/game/ReportsPanel.svelte src/lib/components/game/ReportsPanel.svelte.spec.ts src/lib/components/game/StoreOverview.svelte src/lib/components/game/StoreOverview.svelte.spec.ts src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts
git commit -m "Show industry production reports"
```

## Task 9: E2E Flow And Full Verification

**Files:**

- Modify: `src/routes/retail-sim.e2e.ts`

### Step 1: Add failing Playwright flow

Add an e2e test named `player builds convenience production and refills from warehouse`:

1. Start at `/`.
2. Found a Convenience Store on a retail tile.
3. Open menu and switch to Industry City Map.
4. Click deterministic resource/industrial tiles.
5. Build:
   - `Warehouse`
   - `Grain Farm`
   - `Salt Mine`
   - `Oilseed Farm`
   - `Flour Mill`
   - `Oil Press`
   - `Snack Factory`
6. Advance days until `data-industry-building-count` is stable and warehouse `snacks` is visible in the industry inspector.
7. Switch to Retail City Map.
8. Select the Convenience Store, set Snacks reorder threshold to `10` and target stock to `25`.
9. Advance to weekly refill.
10. Open Control Tower reports and assert the latest report shows warehouse units used for Snacks and imported units only for the shortfall.

Use the existing `clickMapTile` helper pattern, but make it accept the active canvas locator so it can click either `.map-canvas canvas` or the industry map canvas.

### Step 2: Run e2e to verify it fails or exposes missing UI hooks

Run:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "player builds convenience production"
```

Expected: initially FAIL until UI exposes stable controls and data needed for the assertion.

### Step 3: Add stable test hooks for Phaser settlement

Prefer accessible names over test ids. If Phaser settlement needs attributes, use canvas `data-*` attributes already planned in Task 6:

- `data-industry-building-count`
- `data-industry-resource-count`
- `data-map-tile-size`
- `data-map-view-x`
- `data-map-view-y`
- `data-map-view-width`
- `data-map-view-height`

### Step 4: Run focused e2e

Run:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "player builds convenience production"
```

Expected: PASS.

### Step 5: Run focused unit/component checks

Run:

```bash
bun run test:unit -- src/lib/game/industry.spec.ts src/lib/game/industryPlacement.spec.ts src/lib/game/industryProduction.spec.ts src/lib/game/industryMapRender.spec.ts src/lib/game/stock.spec.ts src/lib/game/simulateDay.spec.ts --run
bun run test:unit -- src/lib/components/game/IndustryTileInspector.svelte.spec.ts src/lib/components/game/ReportsPanel.svelte.spec.ts src/lib/components/game/StoreOverview.svelte.spec.ts --run --project client
bun run check
```

Expected: PASS.

### Step 6: Run full branch verification

Run:

```bash
bun run test:unit -- --run
bun run test:e2e
bun run build
```

Expected: PASS.

### Step 7: Commit e2e and verification fixes

Run:

```bash
git add src/routes/retail-sim.e2e.ts
git commit -m "Add industry production e2e flow"
```

If verification exposes failures outside `retail-sim.e2e.ts`, include only the touched files that directly fix the industry flow.

## Completion Checklist

- The first Convenience industry chain is playable end-to-end.
- Shop weekly refills pull from warehouse before importing shortfalls.
- Production import fallback works for raw, intermediate, and finished shortages.
- Warehouse overflow stores goods and adds daily cost.
- Save validation covers all new fields.
- Industry map and retail map switch without losing relevant selection state.
- Svelte MCP autofixer has been run for changed Svelte files.
- `bun run check`, focused unit/component tests, focused e2e, and full verification pass.
