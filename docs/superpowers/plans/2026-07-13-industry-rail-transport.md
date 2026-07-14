# Industry Rail Transport System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spatial material flow in industry cities: per-factory inventories, player-built rail track with per-cell daily capacity, warehouse as a rail-gated storage node, import fallback when unconnected.

**Architecture:** Rails are stored as `RailCell[]` on each `IndustryCity`; segments/junctions/budgets are derived per tick, never stored. The daily tick gives each cell a shipping budget equal to its level and a deterministic greedy BFS allocator moves goods; bottlenecks and trunk contention emerge from budget exhaustion. UI is a waypointed build mode + a segment inspector; the Phaser scene stays snapshot-driven.

**Tech Stack:** TypeScript, SvelteKit (Svelte 5 runes), Vitest, Phaser 4, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-13-industry-rail-transport-design.md` — read it before starting any task.

## Global Constraints

- Package manager is **bun**; run tests via `bun run test:unit -- <file> --run`.
- Every Vitest test must contain an `expect` (`requireAssertions` is enforced).
- The daily tick must stay deterministic and must NOT consume RNG. No `Math.random`, no locale-dependent sorts (`localeCompare` with `numeric` is banned in engine code; plain `<`/`>` string compare is fine).
- Unit specs live next to sources as `<name>.spec.ts` and run in the `server` Vitest project; `.svelte.spec.ts` runs in `client`.
- Svelte files use runes (`$state` / `$derived` / `$props`). **Before committing any Svelte file, run the Svelte MCP `svelte-autofixer` tool on it until it reports no issues** (mandatory per CLAUDE.md).
- Raster art must be produced with the image-generation workflow (`generating-images-with-cli` skill) — never scripted pixels. Register every new asset in `src/lib/assets/gameArt.ts`.
- All user-facing copy goes through i18n. New `TranslationKey`s must be added to **all three** catalogs: `src/lib/i18n/messages/en.ts`, `ja.ts`, `zh-Hant.ts`.
- Tuning constants (from the spec): build $40/new cell; segment upgrade $30 × raised-cell count × segment min level; max cell level 5; demolish refund 50% of base build cost; rail capacity per cell per day = its level.
- `AGENTS.md` is a symlink to `CLAUDE.md` — never edit it separately.
- Commit after every task with a conventional-commit message ending in the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.

---

### Task 1: Domain types, buffer capacity table, and building-inventory helpers

**Files:**
- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/industry.ts` (add `bufferCapacity` to all 24 entries of `INDUSTRIAL_BUILDING_TYPES`; add `rails: []` to `generateIndustryCity`'s return)
- Modify: `src/lib/game/industryPlacement.ts` (`createIndustrialBuilding` gains `inventory: {}`)
- Modify: `src/lib/game/industryProduction.ts` (`createEmptyProductionReport` gains `railShipments: []`, `railUsage: {}`)
- Create: `src/lib/game/buildingInventory.ts`
- Test: `src/lib/game/buildingInventory.spec.ts`

**Interfaces:**
- Consumes: existing `MaterialId`, `IndustrialBuildingType`, `IndustryCity`, `IndustrialBuilding`, `DailyProductionReport` from `types.ts`.
- Produces (later tasks build against these exact shapes):

```ts
// types.ts
export interface RailCell {
	x: number;
	y: number;
	level: number; // capacity per day, 1..RAIL_MAX_LEVEL
}

export interface RailShipment {
	materialId: MaterialId;
	quantity: number;
	value: number;
	kind: 'pull-producer' | 'pull-warehouse' | 'push-warehouse';
	fromId: string; // source building id
	toId: string; // destination building id
}

// IndustryCity gains:            rails: RailCell[];
// IndustrialBuilding gains:      inventory: Partial<Record<MaterialId, number>>;
// IndustrialBuildingType gains:  bufferCapacity: number;
// IndustrialBuildingStatus:      'idle' | 'produced' | 'imported-inputs' | 'stalled' | 'blocked'
// DailyMaterialMovement.source:  'local' | 'import' | 'warehouse' | 'overflow' | 'rail'
// DailyProductionReport gains:   railShipments: RailShipment[]; railUsage: Record<string, number>;
```

```ts
// buildingInventory.ts
export function inventoryUsed(inventory: Partial<Record<MaterialId, number>>): number;
export function getRecipeMaterialIds(buildingType: IndustrialBuildingType): ReadonlySet<MaterialId>;
export function addInventory(
	inventory: Partial<Record<MaterialId, number>>,
	materialId: MaterialId,
	quantity: number,
	capacity: number
): { inventory: Partial<Record<MaterialId, number>>; added: number; overflow: number };
export function removeInventory(
	inventory: Partial<Record<MaterialId, number>>,
	materialId: MaterialId,
	quantity: number
): { inventory: Partial<Record<MaterialId, number>>; removed: number; shortage: number };
export function clampInventoryToRecipe(
	inventory: Partial<Record<MaterialId, number>>,
	buildingType: IndustrialBuildingType
): Partial<Record<MaterialId, number>>;
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/game/buildingInventory.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
	addInventory,
	clampInventoryToRecipe,
	getRecipeMaterialIds,
	inventoryUsed,
	removeInventory
} from './buildingInventory';
import { INDUSTRIAL_BUILDING_TYPES } from './industry';

describe('buildingInventory', () => {
	it('sums inventory units across materials', () => {
		expect(inventoryUsed({ grain: 3, flour: 2 })).toBe(5);
		expect(inventoryUsed({})).toBe(0);
	});

	it('derives recipe materials as inputs plus outputs', () => {
		const ids = getRecipeMaterialIds(INDUSTRIAL_BUILDING_TYPES['flour-mill']);
		expect([...ids].sort()).toEqual(['flour', 'grain']);
	});

	it('recipe-less warehouse has no recipe materials', () => {
		expect(getRecipeMaterialIds(INDUSTRIAL_BUILDING_TYPES.warehouse).size).toBe(0);
	});

	it('adds up to capacity and reports overflow', () => {
		const result = addInventory({ flour: 8 }, 'flour', 5, 10);
		expect(result.inventory.flour).toBe(10);
		expect(result.added).toBe(2);
		expect(result.overflow).toBe(3);
	});

	it('removes available stock and reports shortage', () => {
		const result = removeInventory({ grain: 4 }, 'grain', 10);
		expect(result.inventory.grain).toBe(0);
		expect(result.removed).toBe(4);
		expect(result.shortage).toBe(6);
	});

	it('does not mutate the input inventory', () => {
		const original = { grain: 4 };
		removeInventory(original, 'grain', 2);
		addInventory(original, 'grain', 2, 100);
		expect(original.grain).toBe(4);
	});

	it('clamps inventory to recipe materials and buffer capacity', () => {
		const millType = INDUSTRIAL_BUILDING_TYPES['flour-mill'];
		const clamped = clampInventoryToRecipe(
			{ grain: 5, snacks: 9, flour: 10_000 },
			millType
		);
		expect(clamped.snacks).toBeUndefined();
		expect((clamped.grain ?? 0) + (clamped.flour ?? 0)).toBeLessThanOrEqual(
			millType.bufferCapacity
		);
	});

	it('every recipe building type has a positive bufferCapacity', () => {
		for (const type of Object.values(INDUSTRIAL_BUILDING_TYPES)) {
			if (type.recipeId) {
				expect(type.bufferCapacity).toBeGreaterThan(0);
			}
		}
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/buildingInventory.spec.ts --run`
Expected: FAIL — cannot resolve `./buildingInventory`, and type errors for `bufferCapacity`.

- [ ] **Step 3: Add the types**

In `src/lib/game/types.ts`:

1. Add `'stalled'` to `IndustrialBuildingStatus`:
```ts
export type IndustrialBuildingStatus =
	| 'idle'
	| 'produced'
	| 'imported-inputs'
	| 'stalled'
	| 'blocked';
```
2. Add `'rail'` to `DailyMaterialMovement['source']` (`'local' | 'import' | 'warehouse' | 'overflow' | 'rail'`).
3. Add the `RailCell` and `RailShipment` interfaces exactly as shown in **Interfaces** above (place them next to `MaterialQuantity`).
4. Add `rails: RailCell[];` to `IndustryCity`.
5. Add `inventory: Partial<Record<MaterialId, number>>;` to `IndustrialBuilding`.
6. Add `bufferCapacity: number;` to `IndustrialBuildingType` (after `warehouseCapacity`).
7. Add to `DailyProductionReport`: `railShipments: RailShipment[];` and `railUsage: Record<string, number>;`.

- [ ] **Step 4: Fix the compile fallout**

1. `src/lib/game/industry.ts` — every entry in `INDUSTRIAL_BUILDING_TYPES` gets a `bufferCapacity` line after `warehouseCapacity`. Values are 5 × (recipe level-1 inputs + outputs), warehouse gets 0 (it uses the shared pool):

| typeId | bufferCapacity | | typeId | bufferCapacity |
|---|---|---|---|---|
| grain-farm | 150 | | packaging-plant | 85 |
| salt-mine | 120 | | chemical-plant | 80 |
| oilseed-farm | 120 | | snack-factory | 95 |
| water-pump | 200 | | drink-bottling-plant | 135 |
| fruit-farm | 110 | | household-goods-factory | 80 |
| sugar-farm | 130 | | gift-workshop | 70 |
| pulpwood-grove | 100 | | water-bottler | 100 |
| chemical-feedstock-well | 90 | | produce-packhouse | 80 |
| flour-mill | 90 | | pantry-works | 70 |
| oil-press | 85 | | warehouse | 0 |
| water-filtration-plant | 110 | | | |
| syrup-plant | 100 | | | |
| pulp-mill | 90 | | | |
| plastic-plant | 70 | | | |

2. `src/lib/game/industry.ts` — `generateIndustryCity`'s return object gains `rails: []`.
3. `src/lib/game/industryPlacement.ts` — `createIndustrialBuilding`'s return object gains `inventory: {}` (after `status: 'idle'`).
4. `src/lib/game/industryProduction.ts` — `createEmptyProductionReport`'s return object gains `railShipments: []` and `railUsage: {}`.
5. Run `bun run check` and fix any remaining literals that construct `IndustryCity`, `IndustrialBuilding`, or `DailyProductionReport` (test fixtures included) by adding the new fields.

- [ ] **Step 5: Implement `buildingInventory.ts`**

```ts
import { PRODUCTION_RECIPES } from './industry';
import type { IndustrialBuildingType, MaterialId } from './types';

type Inventory = Partial<Record<MaterialId, number>>;

export function inventoryUsed(inventory: Inventory): number {
	return Object.values(inventory).reduce((total, quantity) => total + (quantity ?? 0), 0);
}

export function getRecipeMaterialIds(
	buildingType: IndustrialBuildingType
): ReadonlySet<MaterialId> {
	const recipe = buildingType.recipeId ? PRODUCTION_RECIPES[buildingType.recipeId] : null;

	if (!recipe) {
		return new Set();
	}

	return new Set([
		...recipe.inputs.map((input) => input.materialId),
		...recipe.outputs.map((output) => output.materialId)
	]);
}

export function addInventory(
	inventory: Inventory,
	materialId: MaterialId,
	quantity: number,
	capacity: number
): { inventory: Inventory; added: number; overflow: number } {
	const requested = Math.max(0, quantity);
	const free = Math.max(0, capacity - inventoryUsed(inventory));
	const added = Math.min(requested, free);

	return {
		inventory: { ...inventory, [materialId]: (inventory[materialId] ?? 0) + added },
		added,
		overflow: requested - added
	};
}

export function removeInventory(
	inventory: Inventory,
	materialId: MaterialId,
	quantity: number
): { inventory: Inventory; removed: number; shortage: number } {
	const requested = Math.max(0, quantity);
	const available = Math.max(0, inventory[materialId] ?? 0);
	const removed = Math.min(requested, available);

	return {
		inventory: { ...inventory, [materialId]: available - removed },
		removed,
		shortage: requested - removed
	};
}

export function clampInventoryToRecipe(
	inventory: Inventory,
	buildingType: IndustrialBuildingType
): Inventory {
	const allowed = getRecipeMaterialIds(buildingType);
	const clamped: Inventory = {};
	let remaining = buildingType.bufferCapacity;

	for (const materialId of [...allowed].sort()) {
		const quantity = Math.min(Math.max(0, inventory[materialId] ?? 0), remaining);

		if (quantity > 0) {
			clamped[materialId] = quantity;
			remaining -= quantity;
		}
	}

	return clamped;
}
```

- [ ] **Step 6: Run tests and check**

Run: `bun run test:unit -- src/lib/game/buildingInventory.spec.ts --run` — Expected: PASS.
Run: `bun run check` — Expected: no errors.
Run: `bun run test:unit -- --run` — Expected: all existing suites still pass (fixtures updated in Step 4.5).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(rail): add rail domain types, buffer capacities, and building inventory helpers"
```

---

### Task 2: Rail network graph and segment derivation (`rail.ts`)

**Files:**
- Create: `src/lib/game/rail.ts`
- Test: `src/lib/game/rail.spec.ts`

**Interfaces:**
- Consumes: `RailCell`, `IndustryCity`, `IndustrialBuilding` from Task 1; `INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH/HEIGHT` (both are 2) from `industryFootprint.ts`.
- Produces:

```ts
export const RAIL_MAX_LEVEL = 5;
export const RAIL_BUILD_COST_PER_CELL = 40;
export const RAIL_UPGRADE_COST_PER_CELL_PER_LEVEL = 30;
export const RAIL_DEMOLISH_REFUND_RATIO = 0.5;

export function railCellKey(x: number, y: number): string; // `${x},${y}`
export function railUsageKey(cityId: string, x: number, y: number): string; // `${cityId}:${x},${y}`
export function parseRailCellKey(key: string): { x: number; y: number };

export interface RailNetwork {
	cityId: string;
	cells: ReadonlyMap<string, RailCell>; // keyed by railCellKey
}
export function buildRailNetwork(city: IndustryCity): RailNetwork;

// Fixed neighbor order N, E, S, W — this IS the determinism contract.
export function getRailNeighborKeys(network: RailNetwork, x: number, y: number): string[];

// Rail cells orthogonally adjacent to the 2×2 footprint, sorted by (y, x).
export function getBuildingAttachCellKeys(
	network: RailNetwork,
	building: Pick<IndustrialBuilding, 'mapX' | 'mapY'>
): string[];

// All grid coordinates orthogonally adjacent to the footprint (rail or not) — used by build preview.
export function getFootprintAdjacentCoords(
	building: Pick<IndustrialBuilding, 'mapX' | 'mapY'>
): Array<{ x: number; y: number }>;

export interface RailSegment {
	id: string; // `seg:${key of lowest (y,x) cell in the segment}`
	cellKeys: string[]; // interior + bounding junction cells, sorted by (y, x)
	minLevel: number;
}
export function deriveRailSegments(
	network: RailNetwork,
	buildings: readonly IndustrialBuilding[]
): RailSegment[];
export function getSegmentsForCell(
	segments: readonly RailSegment[],
	x: number,
	y: number
): RailSegment[];
export function isJunctionKey(
	network: RailNetwork,
	buildings: readonly IndustrialBuilding[],
	key: string
): boolean;
```

**Algorithm (write this as a comment block at the top of `deriveRailSegments`):** A cell is a junction iff it has 3+ rail neighbors OR it is an attach cell of any building (orthogonally adjacent to a 2×2 footprint of a building in this city). Segments = connected components of the network **after removing junction cells**, each extended with its adjacent junction cells; additionally every orthogonally-adjacent pair of junction cells that is not already covered by a shared component forms its own 2-cell segment. A component with no adjacent junctions (isolated run or pure loop) is a segment by itself. Segment id = `seg:` + the key of its lowest cell sorted by (y, x).

- [ ] **Step 1: Write the failing test**

Create `src/lib/game/rail.spec.ts`. Use a helper to build a minimal city:

```ts
import { describe, expect, it } from 'vitest';
import {
	buildRailNetwork,
	deriveRailSegments,
	getBuildingAttachCellKeys,
	getRailNeighborKeys,
	getSegmentsForCell,
	railCellKey
} from './rail';
import type { IndustrialBuilding, IndustryCity, RailCell } from './types';

function makeCity(rails: RailCell[]): IndustryCity {
	return { id: 'test-city', name: 'Test', width: 20, height: 20, tiles: [], rails };
}

function makeBuilding(id: string, mapX: number, mapY: number): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId: 'grain-farm',
		cityId: 'test-city',
		tileId: `test-city-${mapX}-${mapY}`,
		mapX,
		mapY,
		status: 'idle',
		inventory: {},
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0
	};
}

function straightRails(y: number, fromX: number, toX: number, level = 1): RailCell[] {
	const cells: RailCell[] = [];
	for (let x = fromX; x <= toX; x += 1) cells.push({ x, y, level });
	return cells;
}

describe('rail network', () => {
	it('indexes cells by coordinate key', () => {
		const network = buildRailNetwork(makeCity([{ x: 3, y: 4, level: 2 }]));
		expect(network.cells.get(railCellKey(3, 4))?.level).toBe(2);
	});

	it('returns neighbors in N,E,S,W order', () => {
		const network = buildRailNetwork(
			makeCity([
				{ x: 5, y: 5, level: 1 },
				{ x: 5, y: 4, level: 1 }, // N
				{ x: 6, y: 5, level: 1 }, // E
				{ x: 5, y: 6, level: 1 }, // S
				{ x: 4, y: 5, level: 1 } // W
			])
		);
		expect(getRailNeighborKeys(network, 5, 5)).toEqual(['5,4', '6,5', '5,6', '4,5']);
	});

	it('finds attach cells around a 2x2 footprint sorted by (y,x)', () => {
		// Building at (10,10) covers (10,10),(11,10),(10,11),(11,11).
		const network = buildRailNetwork(
			makeCity([
				{ x: 9, y: 10, level: 1 }, // west side
				{ x: 12, y: 11, level: 1 }, // east side
				{ x: 10, y: 9, level: 1 }, // north side
				{ x: 9, y: 9, level: 1 } // diagonal — NOT an attach cell
			])
		);
		expect(getBuildingAttachCellKeys(network, makeBuilding('b1', 10, 10))).toEqual([
			'10,9',
			'9,10',
			'12,11'
		]);
	});
});

describe('rail segments', () => {
	it('a plain line with no junctions is one segment', () => {
		const network = buildRailNetwork(makeCity(straightRails(5, 2, 9)));
		const segments = deriveRailSegments(network, []);
		expect(segments).toHaveLength(1);
		expect(segments[0]!.cellKeys).toHaveLength(8);
		expect(segments[0]!.minLevel).toBe(1);
	});

	it('a T-branch splits into three segments sharing the junction cell', () => {
		// Horizontal 2..8 at y=5, vertical branch down from (5,5) to (5,8).
		const rails = [
			...straightRails(5, 2, 8),
			{ x: 5, y: 6, level: 1 },
			{ x: 5, y: 7, level: 1 },
			{ x: 5, y: 8, level: 1 }
		];
		const network = buildRailNetwork(makeCity(rails));
		const segments = deriveRailSegments(network, []);
		expect(segments).toHaveLength(3);
		const atJunction = getSegmentsForCell(segments, 5, 5);
		expect(atJunction).toHaveLength(3);
	});

	it('a pure loop is a single ring segment', () => {
		const rails: RailCell[] = [];
		for (let x = 3; x <= 6; x += 1) rails.push({ x, y: 3, level: 1 }, { x, y: 6, level: 1 });
		for (let y = 4; y <= 5; y += 1) rails.push({ x: 3, y, level: 1 }, { x: 6, y, level: 1 });
		const network = buildRailNetwork(makeCity(rails));
		const segments = deriveRailSegments(network, []);
		expect(segments).toHaveLength(1);
		expect(segments[0]!.cellKeys).toHaveLength(12);
	});

	it('attach cells are junctions: track passing a building splits there', () => {
		const network = buildRailNetwork(makeCity(straightRails(9, 2, 12)));
		// Building at (5,10): footprint (5..6, 10..11); (5,9) and (6,9) are attach cells on the line.
		const segments = deriveRailSegments(network, [makeBuilding('b1', 5, 10)]);
		expect(segments.length).toBeGreaterThanOrEqual(2);
		expect(getSegmentsForCell(segments, 5, 9).length).toBeGreaterThanOrEqual(1);
	});

	it('mixed-level segment reports its min level', () => {
		const rails = straightRails(5, 2, 6, 3).concat(straightRails(5, 7, 9, 1));
		const network = buildRailNetwork(makeCity(rails));
		const segments = deriveRailSegments(network, []);
		expect(segments).toHaveLength(1);
		expect(segments[0]!.minLevel).toBe(1);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/rail.spec.ts --run`
Expected: FAIL — cannot resolve `./rail`.

- [ ] **Step 3: Implement `rail.ts`**

```ts
import {
	INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT,
	INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH
} from './industryFootprint';
import type { IndustrialBuilding, IndustryCity, RailCell } from './types';

export const RAIL_MAX_LEVEL = 5;
export const RAIL_BUILD_COST_PER_CELL = 40;
export const RAIL_UPGRADE_COST_PER_CELL_PER_LEVEL = 30;
export const RAIL_DEMOLISH_REFUND_RATIO = 0.5;

// Neighbor offsets in fixed N, E, S, W order. This ordering is the
// determinism contract for every BFS in the rail system — do not reorder.
const NEIGHBOR_OFFSETS = [
	{ dx: 0, dy: -1 },
	{ dx: 1, dy: 0 },
	{ dx: 0, dy: 1 },
	{ dx: -1, dy: 0 }
] as const;

export function railCellKey(x: number, y: number): string {
	return `${x},${y}`;
}

export function railUsageKey(cityId: string, x: number, y: number): string {
	return `${cityId}:${x},${y}`;
}

export function parseRailCellKey(key: string): { x: number; y: number } {
	const [x, y] = key.split(',').map(Number);
	return { x: x ?? 0, y: y ?? 0 };
}

export interface RailNetwork {
	cityId: string;
	cells: ReadonlyMap<string, RailCell>;
}

export function buildRailNetwork(city: IndustryCity): RailNetwork {
	const cells = new Map<string, RailCell>();

	for (const cell of city.rails) {
		cells.set(railCellKey(cell.x, cell.y), cell);
	}

	return { cityId: city.id, cells };
}

export function getRailNeighborKeys(network: RailNetwork, x: number, y: number): string[] {
	const keys: string[] = [];

	for (const offset of NEIGHBOR_OFFSETS) {
		const key = railCellKey(x + offset.dx, y + offset.dy);

		if (network.cells.has(key)) {
			keys.push(key);
		}
	}

	return keys;
}

export function getFootprintAdjacentCoords(
	building: Pick<IndustrialBuilding, 'mapX' | 'mapY'>
): Array<{ x: number; y: number }> {
	const coords: Array<{ x: number; y: number }> = [];
	const left = building.mapX;
	const top = building.mapY;
	const right = left + INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH - 1;
	const bottom = top + INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT - 1;

	for (let x = left; x <= right; x += 1) {
		coords.push({ x, y: top - 1 }, { x, y: bottom + 1 });
	}

	for (let y = top; y <= bottom; y += 1) {
		coords.push({ x: left - 1, y }, { x: right + 1, y });
	}

	return coords.sort((first, second) => first.y - second.y || first.x - second.x);
}

export function getBuildingAttachCellKeys(
	network: RailNetwork,
	building: Pick<IndustrialBuilding, 'mapX' | 'mapY'>
): string[] {
	return getFootprintAdjacentCoords(building)
		.map((coord) => railCellKey(coord.x, coord.y))
		.filter((key) => network.cells.has(key));
}

export interface RailSegment {
	id: string;
	cellKeys: string[];
	minLevel: number;
}

function collectAttachKeys(
	network: RailNetwork,
	buildings: readonly IndustrialBuilding[]
): Set<string> {
	const attach = new Set<string>();

	for (const building of buildings) {
		if (building.cityId !== network.cityId) {
			continue;
		}

		for (const key of getBuildingAttachCellKeys(network, building)) {
			attach.add(key);
		}
	}

	return attach;
}

export function isJunctionKey(
	network: RailNetwork,
	buildings: readonly IndustrialBuilding[],
	key: string
): boolean {
	const attach = collectAttachKeys(network, buildings);
	return isJunction(network, attach, key);
}

function isJunction(network: RailNetwork, attachKeys: ReadonlySet<string>, key: string): boolean {
	if (attachKeys.has(key)) {
		return true;
	}

	const { x, y } = parseRailCellKey(key);
	return getRailNeighborKeys(network, x, y).length >= 3;
}

function compareKeys(first: string, second: string): number {
	const a = parseRailCellKey(first);
	const b = parseRailCellKey(second);
	return a.y - b.y || a.x - b.x;
}

/**
 * Segment topology (see spec "Segment topology"):
 * - junction = cell with 3+ rail neighbors OR an attach cell of any building.
 * - segments = connected components of the network with junction cells
 *   removed, each extended by its adjacent junction cells;
 * - plus a 2-cell segment for every orthogonally-adjacent junction pair not
 *   already joined through a shared component;
 * - a component with no adjacent junctions (isolated run / pure loop) is a
 *   segment on its own.
 */
export function deriveRailSegments(
	network: RailNetwork,
	buildings: readonly IndustrialBuilding[]
): RailSegment[] {
	const attachKeys = collectAttachKeys(network, buildings);
	const junctionKeys = new Set<string>();

	for (const key of network.cells.keys()) {
		if (isJunction(network, attachKeys, key)) {
			junctionKeys.add(key);
		}
	}

	const visited = new Set<string>();
	const segments: RailSegment[] = [];
	const coveredJunctionPairs = new Set<string>();
	const orderedKeys = [...network.cells.keys()].sort(compareKeys);

	for (const startKey of orderedKeys) {
		if (junctionKeys.has(startKey) || visited.has(startKey)) {
			continue;
		}

		// Flood the non-junction component.
		const componentKeys: string[] = [];
		const boundingJunctions = new Set<string>();
		const queue = [startKey];
		visited.add(startKey);

		while (queue.length > 0) {
			const key = queue.shift()!;
			componentKeys.push(key);
			const { x, y } = parseRailCellKey(key);

			for (const neighborKey of getRailNeighborKeys(network, x, y)) {
				if (junctionKeys.has(neighborKey)) {
					boundingJunctions.add(neighborKey);
				} else if (!visited.has(neighborKey)) {
					visited.add(neighborKey);
					queue.push(neighborKey);
				}
			}
		}

		for (const junctionA of boundingJunctions) {
			for (const junctionB of boundingJunctions) {
				if (junctionA < junctionB) {
					coveredJunctionPairs.add(`${junctionA}|${junctionB}`);
				}
			}
		}

		segments.push(makeSegment(network, [...componentKeys, ...boundingJunctions]));
	}

	// Directly-adjacent junction pairs with no interior component between them.
	for (const key of [...junctionKeys].sort(compareKeys)) {
		const { x, y } = parseRailCellKey(key);

		for (const neighborKey of getRailNeighborKeys(network, x, y)) {
			if (!junctionKeys.has(neighborKey) || key >= neighborKey) {
				continue;
			}

			const pair = `${key}|${neighborKey}`;

			if (!coveredJunctionPairs.has(pair)) {
				coveredJunctionPairs.add(pair);
				segments.push(makeSegment(network, [key, neighborKey]));
			}
		}
	}

	return segments.sort((first, second) => compareKeys(first.cellKeys[0]!, second.cellKeys[0]!));
}

function makeSegment(network: RailNetwork, keys: string[]): RailSegment {
	const cellKeys = [...new Set(keys)].sort(compareKeys);
	const minLevel = cellKeys.reduce(
		(min, key) => Math.min(min, network.cells.get(key)?.level ?? 1),
		RAIL_MAX_LEVEL
	);

	return { id: `seg:${cellKeys[0]}`, cellKeys, minLevel };
}

export function getSegmentsForCell(
	segments: readonly RailSegment[],
	x: number,
	y: number
): RailSegment[] {
	const key = railCellKey(x, y);
	return segments.filter((segment) => segment.cellKeys.includes(key));
}
```

Note the junction-pair `key >= neighborKey` comparison uses plain string ordering — it only needs to dedupe pairs deterministically, not sort spatially.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:unit -- src/lib/game/rail.spec.ts --run` — Expected: PASS.
Run: `bun run check` — Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/rail.ts src/lib/game/rail.spec.ts
git commit -m "feat(rail): rail network graph and segment derivation"
```

---

### Task 3: Budgeted pathfinding (`rail.ts` continued)

**Files:**
- Modify: `src/lib/game/rail.ts`
- Test: `src/lib/game/rail.spec.ts` (append)

**Interfaces:**
- Consumes: `RailNetwork`, `railCellKey`, `getRailNeighborKeys`, `NEIGHBOR_OFFSETS` order from Task 2.
- Produces:

```ts
export interface RailBudget {
	remaining: Map<string, number>; // cellKey → units left today
}
export function createRailBudget(network: RailNetwork): RailBudget;

// BFS through budget-positive cells only. fromKeys are the search roots
// (distance 0); returns the first path reaching any toKey, or null.
// Deterministic: roots enqueued in given order, neighbors expanded N,E,S,W,
// frontier visited in insertion order.
export function findShippingPath(
	network: RailNetwork,
	budget: RailBudget,
	fromKeys: readonly string[],
	toKeys: readonly string[]
): string[] | null;

export function getPathCapacity(budget: RailBudget, path: readonly string[]): number;
export function consumeRailBudget(budget: RailBudget, path: readonly string[], units: number): void;
```

- [ ] **Step 1: Write the failing tests (append to `rail.spec.ts`)**

```ts
import {
	consumeRailBudget,
	createRailBudget,
	findShippingPath,
	getPathCapacity
} from './rail';

describe('rail budgets and shipping paths', () => {
	it('budget equals cell level', () => {
		const network = buildRailNetwork(
			makeCity([
				{ x: 1, y: 1, level: 1 },
				{ x: 2, y: 1, level: 3 }
			])
		);
		const budget = createRailBudget(network);
		expect(budget.remaining.get('1,1')).toBe(1);
		expect(budget.remaining.get('2,1')).toBe(3);
	});

	it('finds the shortest budget-positive path', () => {
		const network = buildRailNetwork(makeCity(straightRails(5, 2, 9)));
		const budget = createRailBudget(network);
		const path = findShippingPath(network, budget, ['2,5'], ['9,5']);
		expect(path).toEqual(['2,5', '3,5', '4,5', '5,5', '6,5', '7,5', '8,5', '9,5']);
	});

	it('path capacity is the min remaining budget along the path (bottleneck)', () => {
		const network = buildRailNetwork(
			makeCity(straightRails(5, 2, 5, 3).concat(straightRails(5, 6, 9, 1)))
		);
		const budget = createRailBudget(network);
		const path = findShippingPath(network, budget, ['2,5'], ['9,5'])!;
		expect(getPathCapacity(budget, path)).toBe(1);
	});

	it('consuming budget exhausts cells and blocks reuse', () => {
		const network = buildRailNetwork(makeCity(straightRails(5, 2, 9)));
		const budget = createRailBudget(network);
		const path = findShippingPath(network, budget, ['2,5'], ['9,5'])!;
		consumeRailBudget(budget, path, 1);
		expect(budget.remaining.get('5,5')).toBe(0);
		expect(findShippingPath(network, budget, ['2,5'], ['9,5'])).toBeNull();
	});

	it('reroutes around an exhausted trunk through a parallel line', () => {
		// Endpoints are the level-2 connectors so they survive the first
		// shipment; the level-1 trunk exhausts and the second path must
		// detour through the parallel line at y=7.
		const rails = [
			...straightRails(5, 2, 9), // trunk (level 1)
			...straightRails(7, 2, 9), // parallel line (level 1)
			{ x: 2, y: 6, level: 2 }, // west connector
			{ x: 9, y: 6, level: 2 } // east connector
		];
		const network = buildRailNetwork(makeCity(rails));
		const budget = createRailBudget(network);
		const direct = findShippingPath(network, budget, ['2,6'], ['9,6'])!;
		expect(direct.some((key) => key === '5,5')).toBe(true); // N-first BFS takes the trunk
		consumeRailBudget(budget, direct, 1);
		const detour = findShippingPath(network, budget, ['2,6'], ['9,6']);
		expect(detour).not.toBeNull();
		expect(detour!.some((key) => key === '5,7')).toBe(true);
	});

	it('returns null when no source can reach a target', () => {
		const network = buildRailNetwork(
			makeCity([...straightRails(5, 2, 4), ...straightRails(5, 7, 9)])
		);
		const budget = createRailBudget(network);
		expect(findShippingPath(network, budget, ['2,5'], ['9,5'])).toBeNull();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:unit -- src/lib/game/rail.spec.ts --run`
Expected: FAIL — `createRailBudget` not exported.

- [ ] **Step 3: Implement (append to `rail.ts`)**

```ts
export interface RailBudget {
	remaining: Map<string, number>;
}

export function createRailBudget(network: RailNetwork): RailBudget {
	const remaining = new Map<string, number>();

	for (const [key, cell] of network.cells) {
		remaining.set(key, cell.level);
	}

	return { remaining };
}

export function findShippingPath(
	network: RailNetwork,
	budget: RailBudget,
	fromKeys: readonly string[],
	toKeys: readonly string[]
): string[] | null {
	const targets = new Set(toKeys);
	const cameFrom = new Map<string, string | null>();
	const queue: string[] = [];

	for (const key of fromKeys) {
		if ((budget.remaining.get(key) ?? 0) > 0 && !cameFrom.has(key)) {
			cameFrom.set(key, null);
			queue.push(key);
		}
	}

	while (queue.length > 0) {
		const key = queue.shift()!;

		if (targets.has(key)) {
			const path: string[] = [];
			let cursor: string | null = key;

			while (cursor !== null) {
				path.unshift(cursor);
				cursor = cameFrom.get(cursor) ?? null;
			}

			return path;
		}

		const { x, y } = parseRailCellKey(key);

		for (const neighborKey of getRailNeighborKeys(network, x, y)) {
			if (!cameFrom.has(neighborKey) && (budget.remaining.get(neighborKey) ?? 0) > 0) {
				cameFrom.set(neighborKey, key);
				queue.push(neighborKey);
			}
		}
	}

	return null;
}

export function getPathCapacity(budget: RailBudget, path: readonly string[]): number {
	return path.reduce(
		(min, key) => Math.min(min, budget.remaining.get(key) ?? 0),
		Number.POSITIVE_INFINITY
	);
}

export function consumeRailBudget(
	budget: RailBudget,
	path: readonly string[],
	units: number
): void {
	for (const key of path) {
		budget.remaining.set(key, Math.max(0, (budget.remaining.get(key) ?? 0) - units));
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:unit -- src/lib/game/rail.spec.ts --run` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/rail.ts src/lib/game/rail.spec.ts
git commit -m "feat(rail): budgeted BFS shipping paths with bottleneck capacity"
```

---

### Task 4: Rail shipping allocator (`railShipping.ts`)

**Files:**
- Create: `src/lib/game/railShipping.ts`
- Test: `src/lib/game/railShipping.spec.ts`

**Interfaces:**
- Consumes: `buildRailNetwork`, `createRailBudget`, `findShippingPath`, `getPathCapacity`, `consumeRailBudget`, `getBuildingAttachCellKeys`, `railUsageKey`, `parseRailCellKey` (Task 2/3); `removeInventory` (Task 1); `addWarehouseMaterial`, `removeWarehouseMaterial` from `industryProduction.ts`; `MATERIALS` from `industry.ts`.
- Produces (Task 5 builds against these):

```ts
export interface RailTickState {
	citiesById: Map<string, {
		network: RailNetwork;
		budget: RailBudget;
		attachCellsByBuildingId: Map<string, string[]>;
	}>;
	buildingsById: Map<string, IndustrialBuilding>;
	inventories: Map<string, Partial<Record<MaterialId, number>>>; // working copies
	warehouse: WarehouseInventory; // working copy, reassigned on change
	usage: Record<string, number>; // railUsageKey → units
	shipments: RailShipment[];
}

export function createRailTickState(game: GameState, warehouse: WarehouseInventory): RailTickState;

export interface RailPullResult {
	fromProducers: number;
	fromWarehouse: number;
}
// Repeats nearest-source BFS until `requested` is met or no budget-positive
// path to any stocked source remains. Sources: same-city producer buffers
// holding the material (excluding the consumer), and warehouse-type buildings
// (stock = shared pool). Nearest first; equal distance → lowest building id
// (plain string compare). Updates inventories/warehouse/budget/usage/shipments.
export function pullViaRail(
	state: RailTickState,
	consumer: IndustrialBuilding,
	materialId: MaterialId,
	requested: number
): RailPullResult;

// Pushes every unit in the producer's buffer to the nearest reachable
// warehouse building, budget-limited. Warehouse overflow is allowed (fee is
// applied by the caller via recalculateWarehousePressure).
export function pushSurplusViaRail(state: RailTickState, producer: IndustrialBuilding): void;
```

Implementation notes (put these in code comments): distance to a source is the BFS path length from the consumer's attach cells to the source's attach cells. To find the nearest source deterministically, run one `findShippingPath` per candidate source (candidates sorted by building id), keep the shortest path (strictly shorter wins; ties keep the earlier candidate = lowest id), ship `min(remaining, pathCapacity, sourceStock)`, then repeat. A shipment of `q` units along a path increments `usage[railUsageKey(cityId, x, y)] += q` for every cell of the path and pushes one `RailShipment`. Movement `value` uses `MATERIALS[materialId].localValue`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/game/railShipping.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRailTickState, pullViaRail, pushSurplusViaRail } from './railShipping';
import type { GameState, IndustrialBuilding, IndustryCity, RailCell } from './types';

function makeBuilding(
	id: string,
	typeId: IndustrialBuilding['typeId'],
	mapX: number,
	mapY: number,
	inventory: IndustrialBuilding['inventory'] = {}
): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId,
		cityId: 'rail-city',
		tileId: `rail-city-${mapX}-${mapY}`,
		mapX,
		mapY,
		status: 'idle',
		inventory,
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0
	};
}

function makeCity(rails: RailCell[]): IndustryCity {
	return { id: 'rail-city', name: 'Rail City', width: 30, height: 30, tiles: [], rails };
}

function straightRails(y: number, fromX: number, toX: number, level = 1): RailCell[] {
	const cells: RailCell[] = [];
	for (let x = fromX; x <= toX; x += 1) cells.push({ x, y, level });
	return cells;
}

// Minimal GameState stub: railShipping only touches industryCities,
// industrialBuildings, and warehouse.
function makeGame(city: IndustryCity, buildings: IndustrialBuilding[]): GameState {
	return {
		industryCities: [city],
		industrialBuildings: buildings,
		warehouse: { capacity: 500, materials: {}, overflowUnits: 0, overflowCost: 0 }
	} as unknown as GameState;
}

// Layout used across tests:
//   farm (2,2) footprint (2..3, 2..3) — attach row y=4 at (2,4),(3,4)
//   mill (10,2) footprint (10..11, 2..3) — attach row y=4 at (10,4),(11,4)
//   rail line y=4 from x=2..11 connects both.
const LINE = straightRails(4, 2, 11);

describe('pullViaRail', () => {
	it('pulls from a connected producer buffer, bottlenecked at 1/day on a level-1 line', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
		const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [farm, mill]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		const result = pullViaRail(state, mill, 'grain', 10);
		expect(result.fromProducers).toBe(1); // 8-cell level-1 path → min budget 1
		expect(result.fromWarehouse).toBe(0);
		expect(state.inventories.get('industry-building-1')!.grain).toBe(29);
		expect(state.shipments).toHaveLength(1);
		expect(state.shipments[0]).toMatchObject({
			kind: 'pull-producer',
			fromId: 'industry-building-1',
			toId: 'industry-building-2',
			materialId: 'grain',
			quantity: 1
		});
		expect(state.usage['rail-city:6,4']).toBe(1);
	});

	it('a level-3 line moves 3/day', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
		const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(
			makeGame(makeCity(straightRails(4, 2, 11, 3)), [farm, mill]),
			{ capacity: 500, materials: {}, overflowUnits: 0, overflowCost: 0 }
		);
		expect(pullViaRail(state, mill, 'grain', 10).fromProducers).toBe(3);
	});

	it('pulls from the warehouse pool through a warehouse building', () => {
		const warehouse = makeBuilding('industry-building-1', 'warehouse', 2, 2);
		const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [warehouse, mill]), {
			capacity: 500,
			materials: { grain: 50 },
			overflowUnits: 0,
			overflowCost: 0
		});
		const result = pullViaRail(state, mill, 'grain', 10);
		expect(result.fromWarehouse).toBe(1);
		expect(state.warehouse.materials.grain).toBe(49);
		expect(state.shipments[0]!.kind).toBe('pull-warehouse');
	});

	it('returns zero when the consumer has no rail connection', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
		const mill = makeBuilding('industry-building-2', 'flour-mill', 20, 20);
		const state = createRailTickState(makeGame(makeCity(LINE), [farm, mill]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		const result = pullViaRail(state, mill, 'grain', 10);
		expect(result.fromProducers + result.fromWarehouse).toBe(0);
	});

	it('two branches sharing a trunk compete for its budget', () => {
		// Farm at (2,2) with attach (3,4); level-1 trunk y=4 x=2..7 continues
		// east to mill A and branches south to mill B. Mill A: footprint
		// (8..9, 2..3), attach cell (8,4). Mill B: footprint (8..9, 6..7),
		// attach cell (7,6). Both routes share the trunk, which carries
		// 1/day total — after A ships 1 unit, B gets nothing.
		const rails = [
			...straightRails(4, 2, 8),
			{ x: 7, y: 5, level: 1 },
			{ x: 7, y: 6, level: 1 }
		];
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
		const millA = makeBuilding('industry-building-2', 'flour-mill', 8, 2);
		const millB = makeBuilding('industry-building-3', 'flour-mill', 8, 6);
		const state = createRailTickState(makeGame(makeCity(rails), [farm, millA, millB]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		const pullA = pullViaRail(state, millA, 'grain', 5);
		const pullB = pullViaRail(state, millB, 'grain', 5);
		expect(pullA.fromProducers).toBe(1);
		expect(pullB.fromProducers).toBe(0); // trunk exhausted
	});

	it('is deterministic: same state twice yields identical shipments', () => {
		const build = () => {
			const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 30 });
			const mill = makeBuilding('industry-building-2', 'flour-mill', 10, 2);
			const state = createRailTickState(makeGame(makeCity(LINE), [farm, mill]), {
				capacity: 500,
				materials: {},
				overflowUnits: 0,
				overflowCost: 0
			});
			pullViaRail(state, mill, 'grain', 10);
			return state.shipments;
		};
		expect(build()).toEqual(build());
	});
});

describe('pushSurplusViaRail', () => {
	it('pushes leftover output to a connected warehouse', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 5 });
		const warehouse = makeBuilding('industry-building-2', 'warehouse', 10, 2);
		const state = createRailTickState(makeGame(makeCity(LINE), [farm, warehouse]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		pushSurplusViaRail(state, farm);
		expect(state.warehouse.materials.grain).toBe(1); // bottlenecked at 1/day
		expect(state.inventories.get('industry-building-1')!.grain).toBe(4);
		expect(state.shipments[0]!.kind).toBe('push-warehouse');
	});

	it('does nothing without a reachable warehouse', () => {
		const farm = makeBuilding('industry-building-1', 'grain-farm', 2, 2, { grain: 5 });
		const state = createRailTickState(makeGame(makeCity(LINE), [farm]), {
			capacity: 500,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		});
		pushSurplusViaRail(state, farm);
		expect(state.shipments).toHaveLength(0);
		expect(state.inventories.get('industry-building-1')!.grain).toBe(5);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:unit -- src/lib/game/railShipping.spec.ts --run`
Expected: FAIL — cannot resolve `./railShipping`.

- [ ] **Step 3: Implement `railShipping.ts`**

```ts
import { removeInventory } from './buildingInventory';
import { MATERIALS } from './industry';
import { addWarehouseMaterial, removeWarehouseMaterial } from './industryProduction';
import {
	buildRailNetwork,
	consumeRailBudget,
	createRailBudget,
	findShippingPath,
	getBuildingAttachCellKeys,
	getPathCapacity,
	parseRailCellKey,
	railUsageKey
} from './rail';
import type { RailBudget, RailNetwork } from './rail';
import type {
	GameState,
	IndustrialBuilding,
	MaterialId,
	RailShipment,
	WarehouseInventory
} from './types';

interface RailTickCity {
	network: RailNetwork;
	budget: RailBudget;
	attachCellsByBuildingId: Map<string, string[]>;
}

export interface RailTickState {
	citiesById: Map<string, RailTickCity>;
	buildingsById: Map<string, IndustrialBuilding>;
	inventories: Map<string, Partial<Record<MaterialId, number>>>;
	warehouse: WarehouseInventory;
	usage: Record<string, number>;
	shipments: RailShipment[];
}

export interface RailPullResult {
	fromProducers: number;
	fromWarehouse: number;
}

export function createRailTickState(
	game: GameState,
	warehouse: WarehouseInventory
): RailTickState {
	const citiesById = new Map<string, RailTickCity>();

	for (const city of game.industryCities) {
		const network = buildRailNetwork(city);
		const attachCellsByBuildingId = new Map<string, string[]>();

		for (const building of game.industrialBuildings) {
			if (building.cityId === city.id) {
				attachCellsByBuildingId.set(building.id, getBuildingAttachCellKeys(network, building));
			}
		}

		citiesById.set(city.id, {
			network,
			budget: createRailBudget(network),
			attachCellsByBuildingId
		});
	}

	return {
		citiesById,
		buildingsById: new Map(game.industrialBuildings.map((building) => [building.id, building])),
		inventories: new Map(
			game.industrialBuildings.map((building) => [building.id, { ...building.inventory }])
		),
		warehouse,
		usage: {},
		shipments: []
	};
}

interface ShipmentCandidate {
	buildingId: string;
	kind: 'pull-producer' | 'pull-warehouse';
	stock: number;
}

function recordUsage(state: RailTickState, cityId: string, path: readonly string[], units: number): void {
	for (const key of path) {
		const { x, y } = parseRailCellKey(key);
		const usageKey = railUsageKey(cityId, x, y);
		state.usage[usageKey] = (state.usage[usageKey] ?? 0) + units;
	}
}

export function pullViaRail(
	state: RailTickState,
	consumer: IndustrialBuilding,
	materialId: MaterialId,
	requested: number
): RailPullResult {
	const result: RailPullResult = { fromProducers: 0, fromWarehouse: 0 };
	const city = state.citiesById.get(consumer.cityId);
	const consumerAttach = city?.attachCellsByBuildingId.get(consumer.id) ?? [];

	if (!city || consumerAttach.length === 0) {
		return result;
	}

	let remaining = Math.max(0, requested);

	while (remaining > 0) {
		// Candidate sources, sorted by building id (plain string compare).
		const candidates: ShipmentCandidate[] = [];

		for (const [buildingId, building] of [...state.buildingsById.entries()].sort(
			([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
		)) {
			if (building.cityId !== consumer.cityId || buildingId === consumer.id) {
				continue;
			}

			if (building.typeId === 'warehouse') {
				const stock = Math.max(0, state.warehouse.materials[materialId] ?? 0);

				if (stock > 0) {
					candidates.push({ buildingId, kind: 'pull-warehouse', stock });
				}

				continue;
			}

			const stock = Math.max(0, state.inventories.get(buildingId)?.[materialId] ?? 0);

			if (stock > 0) {
				candidates.push({ buildingId, kind: 'pull-producer', stock });
			}
		}

		// Nearest source wins; earlier candidate (lower id) wins ties because
		// only strictly shorter paths replace the best.
		let best: { candidate: ShipmentCandidate; path: string[] } | null = null;

		for (const candidate of candidates) {
			const sourceAttach = city.attachCellsByBuildingId.get(candidate.buildingId) ?? [];

			if (sourceAttach.length === 0) {
				continue;
			}

			const path = findShippingPath(city.network, city.budget, consumerAttach, sourceAttach);

			if (path && (!best || path.length < best.path.length)) {
				best = { candidate, path };
			}
		}

		if (!best) {
			return result;
		}

		const quantity = Math.min(
			remaining,
			getPathCapacity(city.budget, best.path),
			best.candidate.stock
		);

		if (quantity <= 0) {
			return result;
		}

		if (best.candidate.kind === 'pull-warehouse') {
			state.warehouse = removeWarehouseMaterial(state.warehouse, materialId, quantity).warehouse;
			result.fromWarehouse += quantity;
		} else {
			const removal = removeInventory(
				state.inventories.get(best.candidate.buildingId) ?? {},
				materialId,
				quantity
			);
			state.inventories.set(best.candidate.buildingId, removal.inventory);
			result.fromProducers += quantity;
		}

		consumeRailBudget(city.budget, best.path, quantity);
		recordUsage(state, consumer.cityId, best.path, quantity);
		state.shipments.push({
			materialId,
			quantity,
			value: quantity * MATERIALS[materialId].localValue,
			kind: best.candidate.kind,
			fromId: best.candidate.buildingId,
			toId: consumer.id
		});
		remaining -= quantity;
	}

	return result;
}

export function pushSurplusViaRail(state: RailTickState, producer: IndustrialBuilding): void {
	const city = state.citiesById.get(producer.cityId);
	const producerAttach = city?.attachCellsByBuildingId.get(producer.id) ?? [];

	if (!city || producerAttach.length === 0) {
		return;
	}

	const inventory = state.inventories.get(producer.id) ?? {};
	const materialIds = (Object.keys(inventory) as MaterialId[]).sort();

	for (const materialId of materialIds) {
		let stock = Math.max(0, inventory[materialId] ?? 0);

		while (stock > 0) {
			let best: { warehouseId: string; path: string[] } | null = null;

			for (const [buildingId, building] of [...state.buildingsById.entries()].sort(
				([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
			)) {
				if (building.cityId !== producer.cityId || building.typeId !== 'warehouse') {
					continue;
				}

				const warehouseAttach = city.attachCellsByBuildingId.get(buildingId) ?? [];

				if (warehouseAttach.length === 0) {
					continue;
				}

				const path = findShippingPath(city.network, city.budget, producerAttach, warehouseAttach);

				if (path && (!best || path.length < best.path.length)) {
					best = { warehouseId: buildingId, path };
				}
			}

			if (!best) {
				return;
			}

			const quantity = Math.min(stock, getPathCapacity(city.budget, best.path));

			if (quantity <= 0) {
				return;
			}

			const removal = removeInventory(state.inventories.get(producer.id) ?? {}, materialId, quantity);
			state.inventories.set(producer.id, removal.inventory);
			state.warehouse = addWarehouseMaterial(state.warehouse, materialId, quantity);
			consumeRailBudget(city.budget, best.path, quantity);
			recordUsage(state, producer.cityId, best.path, quantity);
			state.shipments.push({
				materialId,
				quantity,
				value: quantity * MATERIALS[materialId].localValue,
				kind: 'push-warehouse',
				fromId: producer.id,
				toId: best.warehouseId
			});
			stock -= quantity;
		}
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run test:unit -- src/lib/game/railShipping.spec.ts --run` — Expected: PASS.
Run: `bun run test:unit -- src/lib/game/rail.spec.ts --run` — Expected: still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/railShipping.ts src/lib/game/railShipping.spec.ts
git commit -m "feat(rail): deterministic rail shipping allocator with trunk contention"
```

---

### Task 5: Production tick rewrite (`industryProduction.ts`)

**Files:**
- Modify: `src/lib/game/industryProduction.ts` (`simulateIndustryProduction` body; keep every exported helper signature unchanged)
- Test: `src/lib/game/industryProduction.spec.ts` (extend; update fixtures broken by Task 1 if any remain)

**Interfaces:**
- Consumes: `createRailTickState`, `pullViaRail`, `pushSurplusViaRail`, `RailTickState` (Task 4); `addInventory`, `removeInventory`, `inventoryUsed` (Task 1).
- Produces: `simulateIndustryProduction(game)` keeps its exact signature `{ game: GameState; report: DailyProductionReport }`. The report now carries `railShipments` and `railUsage`; buildings carry updated `inventory` and can have status `'stalled'`.

**Behavior contract (from the spec, verbatim rules):**
1. Working warehouse starts as today (`recalculateWarehousePressure` + `getWarehouseCapacity`, both unchanged).
2. `const railState = createRailTickState(game, warehouse)` — one shared budget pool for the whole tick.
3. Stage-ordered loop (existing sort, stable insertion order as tiebreak). Per recipe building:
   - `throughput = getBuildingThroughputMultiplier(building.level)`.
   - Desired output per recipe output: `Math.round(output.quantity * throughput)`; `desiredTotal` = their sum.
   - `free = max(0, bufferCapacity - inventoryUsed(workingInventory))`; `actualTotal = min(desiredTotal, free)`; `ratio = desiredTotal > 0 ? actualTotal / desiredTotal : 0`.
   - If `ratio === 0` and `desiredTotal > 0`: status `'stalled'`, `lastProduction: []`, pay only `buildingType.dailyOperatingCost`, skip inputs entirely, continue.
   - Inputs scaled: `needed = Math.round(input.quantity * throughput * ratio)`. Acquisition order per input: (a) own working inventory via `removeInventory` → movement source `'local'` into `consumed`; (b) `pullViaRail` → `fromProducers` becomes a `'rail'`-source movement in `consumed`, `fromWarehouse` becomes a `'warehouse'`-source movement in `consumed` AND `warehousePulls`; (c) remaining shortage → `'import'`-source movement (importCost) in `consumed` AND `importedInputs`, added to `importSpend`.
   - Outputs: for each output, `quantity = Math.round(output.quantity * throughput * ratio)`, added to the working inventory via `addInventory(…, bufferCapacity)`; the movement quantity is the `added` amount (rounding may exceed `free` by 1 — the clamp wins). Source `'local'`, into `produced` and `lastProduction`.
   - `operatingCost = Math.round(recipe.operatingCost * throughput * ratio + buildingType.dailyOperatingCost)`.
   - Status precedence: `ratio < 1` → `'stalled'`, else `importSpend > 0` for this building → `'imported-inputs'`, else `'produced'`.
4. Push phase: same building order; for every recipe building call `pushSurplusViaRail(railState, building)`.
5. Finalize: `warehouse = recalculateWarehousePressure(railState.warehouse)`; report gains `railShipments: railState.shipments` and `railUsage: railState.usage`; each building update takes `inventory: railState.inventories.get(building.id) ?? {}`.

- [ ] **Step 1: Write the failing tests (append to `industryProduction.spec.ts`)**

The existing spec file has fixtures; reuse its game-construction helpers if present, otherwise build a minimal `GameState` the way `railShipping.spec.ts` does but with `cash: 10_000`, `reports: []`, and real `warehouse` (`capacity` recomputed inside). Key new cases:

```ts
describe('rail-fed production', () => {
	it('unconnected mill imports its inputs (fallback) and warehouse pool stays untouched', () => {
		// farm at (2,2), mill at (20,20), no rails
		const { game, report } = simulateIndustryProduction(baseGame);
		const mill = game.industrialBuildings.find((b) => b.typeId === 'flour-mill')!;
		expect(mill.status).toBe('imported-inputs');
		expect(report.importedInputs.some((m) => m.materialId === 'grain')).toBe(true);
		expect(report.railShipments).toHaveLength(0);
	});

	it('rail-connected mill pulls grain from the farm buffer same-day', () => {
		// farm produced into its buffer earlier in the same tick (stage order),
		// mill pulls via the level-3 line: expect a pull-producer shipment and
		// a consumed movement with source "rail".
		const { game, report } = simulateIndustryProduction(railGame);
		expect(report.railShipments.some((s) => s.kind === 'pull-producer')).toBe(true);
		expect(report.consumed.some((m) => m.source === 'rail')).toBe(true);
		const mill = game.industrialBuildings.find((b) => b.typeId === 'flour-mill')!;
		expect(mill.importedInputTotal).toBeLessThan(10); // partially rail-fed
	});

	it('farm with a full buffer and no outlet stalls and pays only dailyOperatingCost', () => {
		// grain-farm bufferCapacity 150: prefill inventory { grain: 150 }.
		const { game, report } = simulateIndustryProduction(fullBufferGame);
		const farm = game.industrialBuildings.find((b) => b.typeId === 'grain-farm')!;
		expect(farm.status).toBe('stalled');
		expect(farm.lastProduction).toHaveLength(0);
		// operating cost = only the flat 10 (no recipe cost at ratio 0)
		expect(report.operatingCost).toBe(10);
	});

	it('partially full buffer clips production and consumes proportional inputs', () => {
		// flour-mill bufferCapacity 90, prefilled { flour: 86 } → free = 4.
		// Desired output at level 1 = 8 flour → ratio = 4/8 = 0.5.
		// Inputs scale: round(10 grain × 0.5) = 5 (imported — no rails here).
		const { game, report } = simulateIndustryProduction(partialBufferGame);
		const mill = game.industrialBuildings.find((b) => b.typeId === 'flour-mill')!;
		expect(mill.status).toBe('stalled');
		expect(mill.inventory.flour).toBe(90);
		const grainImport = report.importedInputs.find((m) => m.materialId === 'grain');
		expect(grainImport?.quantity).toBe(5);
	});

	it('connected farm pushes surplus to the warehouse pool for retail', () => {
		const { game, report } = simulateIndustryProduction(farmWarehouseGame);
		expect(report.railShipments.some((s) => s.kind === 'push-warehouse')).toBe(true);
		expect(game.warehouse.materials.grain ?? 0).toBeGreaterThan(0);
	});

	it('railUsage records per-cell units for the segment inspector', () => {
		const { report } = simulateIndustryProduction(railGame);
		expect(Object.keys(report.railUsage).length).toBeGreaterThan(0);
	});

	it('same input state twice produces identical reports (determinism)', () => {
		const first = simulateIndustryProduction(railGame);
		const second = simulateIndustryProduction(railGame);
		expect(first.report).toEqual(second.report);
		expect(first.game.warehouse).toEqual(second.game.warehouse);
	});
});
```

Write each fixture (`baseGame`, `railGame`, `fullBufferGame`, `farmWarehouseGame`) as a real `GameState` object in the spec file — copy the shape used by the existing tests in this file, adding `rails` / `inventory` fields. The "partially full buffer" test must be fully written out (no comment-only bodies) before running.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun run test:unit -- src/lib/game/industryProduction.spec.ts --run`
Expected: new cases FAIL (old engine ignores rails/buffers).

- [ ] **Step 3: Rewrite `simulateIndustryProduction`**

Follow the behavior contract above. Skeleton of the new body (the helper functions `createMovement`, `markBuildingBlocked`, sorting, and warehouse helpers stay as-is):

```ts
export function simulateIndustryProduction(game: GameState): {
	game: GameState;
	report: DailyProductionReport;
} {
	let warehouse = recalculateWarehousePressure({
		...game.warehouse,
		capacity: getWarehouseCapacity(game),
		materials: { ...game.warehouse.materials }
	});
	const railState = createRailTickState(game, warehouse);
	const report = createEmptyProductionReport(warehouse);
	const buildingUpdates = new Map<string, IndustrialBuilding>();
	const sorted = [...game.industrialBuildings].sort(compareIndustrialBuildingsByStage);

	for (const building of sorted) {
		const buildingType = INDUSTRIAL_BUILDING_TYPES[building.typeId];
		// …unknown-type / recipe-less branches unchanged (idle/blocked), but
		// idle branch must also carry `inventory: railState.inventories.get(building.id) ?? {}`…

		const recipe = PRODUCTION_RECIPES[buildingType.recipeId]; // guarded as today
		const throughput = getBuildingThroughputMultiplier(building.level);
		let inventory = railState.inventories.get(building.id) ?? {};
		const desiredOutputs = recipe.outputs.map((output) => ({
			materialId: output.materialId,
			quantity: Math.round(output.quantity * throughput)
		}));
		const desiredTotal = desiredOutputs.reduce((total, o) => total + o.quantity, 0);
		const free = Math.max(0, buildingType.bufferCapacity - inventoryUsed(inventory));
		const ratio = desiredTotal > 0 ? Math.min(desiredTotal, free) / desiredTotal : 0;

		if (desiredTotal > 0 && ratio === 0) {
			report.operatingCost += buildingType.dailyOperatingCost;
			buildingUpdates.set(building.id, {
				...building,
				status: 'stalled',
				inventory,
				lastProduction: [],
				blockedDays: 0
			});
			continue;
		}

		let importSpend = 0;
		let importedInputQuantity = 0;

		for (const input of recipe.inputs) {
			const needed = Math.round(input.quantity * throughput * ratio);
			const own = removeInventory(inventory, input.materialId, needed);
			inventory = own.inventory;
			railState.inventories.set(building.id, inventory);

			if (own.removed > 0) {
				const movement = createMovement(input.materialId, own.removed, MATERIALS[input.materialId].localValue, 'local');
				report.consumed.push(movement);
			}

			let shortage = own.shortage;

			if (shortage > 0) {
				const pulled = pullViaRail(railState, building, input.materialId, shortage);
				inventory = railState.inventories.get(building.id) ?? inventory;

				if (pulled.fromProducers > 0) {
					report.consumed.push(createMovement(input.materialId, pulled.fromProducers, MATERIALS[input.materialId].localValue, 'rail'));
				}

				if (pulled.fromWarehouse > 0) {
					const movement = createMovement(input.materialId, pulled.fromWarehouse, MATERIALS[input.materialId].localValue, 'warehouse');
					report.consumed.push(movement);
					report.warehousePulls.push(movement);
				}

				shortage -= pulled.fromProducers + pulled.fromWarehouse;
			}

			if (shortage > 0) {
				const importMovement = createMovement(input.materialId, shortage, MATERIALS[input.materialId].importCost, 'import');
				importSpend += importMovement.value;
				importedInputQuantity += shortage;
				report.consumed.push(importMovement);
				report.importedInputs.push(importMovement);
			}
		}

		const produced: DailyMaterialMovement[] = [];

		for (const output of desiredOutputs) {
			const scaled = Math.round(output.quantity * ratio);
			const addition = addInventory(inventory, output.materialId, scaled, buildingType.bufferCapacity);
			inventory = addition.inventory;

			if (addition.added > 0) {
				const movement = createMovement(output.materialId, addition.added, MATERIALS[output.materialId].localValue, 'local');
				produced.push(movement);
				report.produced.push(movement);
			}
		}

		railState.inventories.set(building.id, inventory);
		const operatingCost = Math.round(recipe.operatingCost * throughput * ratio + buildingType.dailyOperatingCost);
		report.importSpend += importSpend;
		report.operatingCost += operatingCost;
		buildingUpdates.set(building.id, {
			...building,
			status: ratio < 1 ? 'stalled' : importSpend > 0 ? 'imported-inputs' : 'produced',
			inventory,
			lastProduction: produced,
			producedTotal: building.producedTotal + produced.reduce((t, m) => t + m.quantity, 0),
			importedInputTotal: building.importedInputTotal + importedInputQuantity,
			blockedDays: 0
		});
	}

	for (const building of sorted) {
		const buildingType = INDUSTRIAL_BUILDING_TYPES[building.typeId];

		if (buildingType?.recipeId) {
			pushSurplusViaRail(railState, building);
		}
	}

	warehouse = recalculateWarehousePressure(railState.warehouse);
	report.railShipments = railState.shipments;
	report.railUsage = railState.usage;
	// …overflow/capacity report fields + final game assembly as today, but each
	// buildingUpdates entry must be refreshed with the post-push inventory:
	// { ...buildingUpdates.get(id), inventory: railState.inventories.get(id) ?? {} }
	// …
}
```

The push phase mutates `railState.inventories` after `buildingUpdates` were written — the final assembly MUST re-read inventories (see comment above), or pushed units will resurrect in buffers.

- [ ] **Step 4: Run tests**

Run: `bun run test:unit -- src/lib/game/industryProduction.spec.ts --run` — Expected: PASS (new and pre-existing cases; pre-existing cases that asserted warehouse-pool intake now need updating to expect import-fallback or buffer behavior — update them to match the spec'd behavior, do not weaken assertions).
Run: `bun run test:unit -- --run` — Expected: full suite passes (`simulateDay.spec.ts`, `alerts.spec.ts`, `supplyAdvisor*.spec.ts` are the likely fallout; fix fixtures, keep behavior assertions honest).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(rail): buffer-based production tick with rail pulls, surplus push, and stalled status"
```

---

### Task 6: Persistence v10 (`saveCodec.ts`)

**Files:**
- Modify: `src/lib/persistence/saveTypes.ts` (`SAVE_SCHEMA_VERSION` 9 → 10)
- Modify: `src/lib/persistence/saveCodec.ts`
- Test: `src/lib/persistence/saveRepository.spec.ts` (or `saveCodec.spec.ts` if that is where codec tests live — check both, follow the existing home of migration tests)

**Interfaces:**
- Consumes: `RAIL_MAX_LEVEL` (Task 2), `clampInventoryToRecipe` (Task 1), `INDUSTRIAL_BUILDING_TYPES`.
- Produces: saves at schemaVersion 10; v4–v9 saves migrate forward.

**Changes checklist:**
1. `saveTypes.ts`: `export const SAVE_SCHEMA_VERSION = 10;`
2. `MIGRATABLE_SCHEMA_VERSIONS` gains `9`.
3. New migration (add after `migrateV8SaveRecord`, wire into `migrateSaveRecord` chain with `if (migrated.schemaVersion === 9)`):

```ts
/**
 * v9 → v10: rail transport. Industry cities gain `rails: []`, industrial
 * buildings gain `inventory: {}`, and every persisted production report
 * gains `railShipments: []` / `railUsage: {}` (strict report validation
 * would reject historical reports otherwise).
 */
function migrateV9Game(game: unknown): unknown {
	if (typeof game !== 'object' || game === null) return game;
	const gameRecord = game as Record<string, unknown>;

	const industryCities = Array.isArray(gameRecord.industryCities)
		? gameRecord.industryCities.map((city) =>
				typeof city === 'object' && city !== null
					? { ...(city as Record<string, unknown>), rails: [] }
					: city
			)
		: gameRecord.industryCities;
	const industrialBuildings = Array.isArray(gameRecord.industrialBuildings)
		? gameRecord.industrialBuildings.map((building) =>
				typeof building === 'object' && building !== null
					? { ...(building as Record<string, unknown>), inventory: {} }
					: building
			)
		: gameRecord.industrialBuildings;
	const reports = Array.isArray(gameRecord.reports)
		? gameRecord.reports.map((report) => {
				if (typeof report !== 'object' || report === null) return report;
				const reportRecord = report as Record<string, unknown>;
				const production = reportRecord.productionReport;
				if (typeof production !== 'object' || production === null) return report;
				return {
					...reportRecord,
					productionReport: {
						...(production as Record<string, unknown>),
						railShipments: [],
						railUsage: {}
					}
				};
			})
		: gameRecord.reports;

	return { ...gameRecord, industryCities, industrialBuildings, reports };
}

function migrateV9SaveRecord(record: unknown): unknown {
	if (typeof record !== 'object' || record === null) return record;
	const recordObject = record as Record<string, unknown>;
	return { ...recordObject, schemaVersion: 10, game: migrateV9Game(recordObject.game) };
}
```

4. Enum arrays:
```ts
const INDUSTRIAL_BUILDING_STATUSES = ['idle', 'produced', 'imported-inputs', 'stalled', 'blocked'] as const;
const MATERIAL_MOVEMENT_SOURCES = ['local', 'import', 'warehouse', 'overflow', 'rail'] as const;
const RAIL_SHIPMENT_KINDS = ['pull-producer', 'pull-warehouse', 'push-warehouse'] as const;
```
5. `validateSavedIndustryCity` validates `city.rails`:
```ts
requireArray(city.rails, `${label} rails`).forEach((cell, index) =>
	validateSavedRailCell(cell, `${label} rails[${index}]`)
);
```
with:
```ts
function validateSavedRailCell(value: unknown, label: string): void {
	const cell = requireRecord(value, label);
	requireNumber(cell.x, `${label} x`);
	requireNumber(cell.y, `${label} y`);
	const level = requireNumber(cell.level, `${label} level`);
	if (!Number.isInteger(level) || level < 1 || level > RAIL_MAX_LEVEL) {
		throw new SaveDataError(`${label} level must be an integer between 1 and ${RAIL_MAX_LEVEL}`);
	}
}
```
6. `validateSavedIndustrialBuilding` validates `building.inventory` exactly like `validateSavedWarehouse` validates `materials` (known material ids, quantities ≥ 0).
7. `validateSavedProductionReport` validates the new fields:
```ts
requireArray(report.railShipments, `${label} railShipments`).forEach((shipment, index) =>
	validateSavedRailShipment(shipment, `${label} railShipments[${index}]`)
);
const railUsage = requireRecord(report.railUsage, `${label} railUsage`);
for (const [key, units] of Object.entries(railUsage)) {
	const usageUnits = requireNumber(units, `${label} railUsage ${key}`);
	if (usageUnits < 0) throw new SaveDataError(`${label} railUsage ${key} must be at least 0`);
}
```
with:
```ts
function validateSavedRailShipment(value: unknown, label: string): void {
	const shipment = requireRecord(value, label);
	requireKnownId(shipment.materialId, `${label} materialId`, MATERIAL_ID_SET, 'material');
	requireNumber(shipment.quantity, `${label} quantity`);
	requireNumber(shipment.value, `${label} value`);
	requireOneOf(shipment.kind, `${label} kind`, RAIL_SHIPMENT_KINDS);
	requireString(shipment.fromId, `${label} fromId`);
	requireString(shipment.toId, `${label} toId`);
}
```
8. Decode-time clamp guard: where `validateSavedGame` returns the validated `GameState`, map industrial buildings through `clampInventoryToRecipe`:
```ts
const validatedGame = value as GameState; // existing return value
return {
	...validatedGame,
	industrialBuildings: validatedGame.industrialBuildings.map((building) => ({
		...building,
		inventory: clampInventoryToRecipe(building.inventory, INDUSTRIAL_BUILDING_TYPES[building.typeId])
	}))
};
```
(Adapt to the actual return shape at `saveCodec.ts:573` — the point is: clamp on load, after validation.)

- [ ] **Step 1: Write the failing tests** — add to the existing codec/repository spec:

```ts
it('migrates a v9 save: rails, inventories, and report rail fields appear', () => {
	const v9Record = makeV9SaveRecord(); // build from an existing v9 fixture in this spec file, or serialize a current game and rewrite schemaVersion/strip new fields
	const decoded = decodeSaveRecord(JSON.stringify(wrapSnapshot(v9Record))); // use this file's existing decode helper names
	expect(decoded.game.industryCities[0]!.rails).toEqual([]);
	expect(decoded.game.industrialBuildings.every((b) => typeof b.inventory === 'object')).toBe(true);
	expect(decoded.game.reports.every((r) => Array.isArray(r.productionReport.railShipments))).toBe(true);
});

it('accepts stalled status and rail movement source at v10', () => {
	// Take this spec file's canonical v10 game fixture, set one building's
	// status to 'stalled' and push a consumed movement with source 'rail'
	// into its latest productionReport, then encode → decode.
	const game = makeCurrentGameFixture();
	game.industrialBuildings[0] = { ...game.industrialBuildings[0]!, status: 'stalled' };
	game.reports.at(-1)!.productionReport.consumed.push({
		materialId: 'grain',
		quantity: 1,
		value: 1,
		source: 'rail'
	});
	const decoded = roundTrip(game); // encode + decode via this file's helpers
	expect(decoded.industrialBuildings[0]!.status).toBe('stalled');
	expect(decoded.reports.at(-1)!.productionReport.consumed.some((m) => m.source === 'rail')).toBe(
		true
	);
});

it('rejects a rail cell with level 0', () => {
	const game = makeCurrentGameFixture();
	game.industryCities[0]!.rails.push({ x: 3, y: 3, level: 0 });
	expect(() => roundTrip(game)).toThrow(/level/);
});

it('clamps loaded building inventory to recipe materials', () => {
	const game = makeCurrentGameFixture(); // must contain a flour-mill
	const mill = game.industrialBuildings.find((b) => b.typeId === 'flour-mill')!;
	mill.inventory = { grain: 5, snacks: 5 };
	const decoded = roundTrip(game);
	const decodedMill = decoded.industrialBuildings.find((b) => b.typeId === 'flour-mill')!;
	expect(decodedMill.inventory.snacks).toBeUndefined();
	expect(decodedMill.inventory.grain).toBe(5);
});
```

`makeCurrentGameFixture()` and `roundTrip()` stand for whatever this spec file's existing game-fixture and encode/decode helpers are called — read the file first and use its conventions; the test names and assertions above are the required behaviors, not the required helper names.

- [ ] **Step 2: Run to verify failures** — `bun run test:unit -- src/lib/persistence/saveRepository.spec.ts --run` — Expected: FAIL.

- [ ] **Step 3: Implement** all eight checklist items.

- [ ] **Step 4: Run tests** — same command — Expected: PASS, plus the full suite (`bun run test:unit -- --run`) still green.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(rail): schema v10 with rails, inventories, and rail report telemetry"
```

---

### Task 7: Rail placement transitions and build preview (`railPlacement.ts`)

**Files:**
- Create: `src/lib/game/railPlacement.ts`
- Modify: `src/lib/game/decisionContext.ts` (new codes + factories)
- Modify: `src/lib/i18n/gameCopy.ts` (+ `en.ts`, `ja.ts`, `zh-Hant.ts` message catalogs) — new decision-context copy so the exhaustive formatting compiles
- Modify: `src/lib/persistence/saveCodec.ts` — decision-context validation switch gains the new codes (mirror how `industrialRequiresResource` is handled near `saveCodec.ts:1381`)
- Test: `src/lib/game/railPlacement.spec.ts`

**Interfaces:**
- Consumes: `RAIL_BUILD_COST_PER_CELL`, `RAIL_UPGRADE_COST_PER_CELL_PER_LEVEL`, `RAIL_DEMOLISH_REFUND_RATIO`, `RAIL_MAX_LEVEL`, `railCellKey`, `parseRailCellKey`, `buildRailNetwork`, `deriveRailSegments`, `getFootprintAdjacentCoords` (Task 2); `createIndustryTileLookup`, `getOccupiedIndustryTileIds` from `industryFootprint.ts`; `toCoordinateKey` from `footprintHelpers.ts`.
- Produces:

```ts
export interface RailBuildInput {
	originBuildingId: string;
	waypoints: Array<{ x: number; y: number }>;
	destinationBuildingId: string;
}

export interface RailBuildPreview {
	originBuildingId: string;
	waypoints: Array<{ x: number; y: number }>;
	destinationBuildingId: string | null;
	pathKeys: string[]; // full path, cell keys
	newCellKeys: string[];
	reusedCellKeys: string[];
	cost: number; // newCellKeys.length * RAIL_BUILD_COST_PER_CELL
	blockReason: DecisionContext | null;
}

export function buildRailPreview(game: GameState, input: RailBuildInput): RailBuildPreview;
export function buildRail(game: GameState, input: RailBuildInput): GameState;
export function getSegmentUpgradeCost(segment: RailSegment): number; // cellsBelowTarget * RAIL_UPGRADE_COST_PER_CELL_PER_LEVEL * minLevel
export function getSegmentDemolishRefund(segment: RailSegment): number; // round(cellCount * RAIL_BUILD_COST_PER_CELL * RAIL_DEMOLISH_REFUND_RATIO)
export function upgradeRailSegment(game: GameState, cityId: string, segmentId: string): GameState;
export function demolishRailSegment(game: GameState, cityId: string, segmentId: string): GameState;

// decisionContext.ts additions:
//  | { code: 'railUnknownBuilding' }
//  | { code: 'railNoValidPath' }
//  | { code: 'railRequiresCash'; cost: number; cash: number }
//  | { code: 'railSegmentAtMaxLevel' }
//  | { code: 'railUnknownSegment' }
//  | { code: 'industrialTileHasRail' }
// plus one factory function each, following the existing arrow-const pattern.
```

**Rail-legality of a tile** (helper `isRailLegalTile(lookup, occupiedTileIds, x, y)`): the tile exists in the city, `terrain !== 'blocked'`, `!tile.locked`, and its id is not in the building-occupied set. Existing rail cells are always traversable for pathing regardless of tile legality (they are already built).

**Build pathfinding** (0/1-cost BFS with a deque, i.e. Dijkstra with weights 0/1): nodes are grid coordinates; moving onto an existing rail cell costs 0, onto a rail-legal empty tile costs 1, anything else is impassable. Neighbor order N,E,S,W; deque: cost-0 moves push front, cost-1 moves push back. The route is threaded through legs: origin-adjacent coords → waypoint₁ → … → waypointₙ → destination-adjacent coords. Each leg starts from the previous leg's endpoint (first leg: every `getFootprintAdjacentCoords(origin)` coord that is passable, cost seeded by that coord's own cost 0/1). A leg with no reachable endpoint makes the whole preview `blockReason: railNoValidPath`.

**buildRail**: recompute the preview; if `blockReason`, return `game` unchanged with the preview's decision surfaced by the caller (no `DecisionItem` is appended — rail blockers are preview-time UI, per spec). If `cost > game.cash` → preview carries `railRequiresCash`. Otherwise: deduct cost, append `newCellKeys` as `{ x, y, level: 1 }` to the city's `rails`.

**upgradeRailSegment** (min+1 rule): find segment by id in `deriveRailSegments`; `target = segment.minLevel + 1`; if `segment.minLevel >= RAIL_MAX_LEVEL` → no-op (UI disables via `railSegmentAtMaxLevel`); cost = `getSegmentUpgradeCost` where `cellsBelowTarget` = cells with `level < target`; raise only those cells to `target`.

**demolishRailSegment**: remove the segment's cells from `city.rails`, add `getSegmentDemolishRefund` to cash. Junction cells shared with other segments are NOT removed if they still have a rail neighbor outside the demolished segment — otherwise trunk demolition would amputate neighboring segments' endpoints. (Test this.)

- [ ] **Step 1: Write the failing tests** — `src/lib/game/railPlacement.spec.ts` covering:
  - preview between two buildings on empty ground: straight path, `cost = newCells × 40`, no block reason;
  - preview reuses existing track: cells on an existing line appear in `reusedCellKeys` and cost only counts new cells;
  - waypoint threading: a waypoint south of the direct line forces the path through it;
  - no valid path (destination walled off by blocked terrain) → `blockReason.code === 'railNoValidPath'`;
  - insufficient cash → `blockReason.code === 'railRequiresCash'` and `buildRail` leaves state unchanged;
  - `buildRail` deducts cash and appends level-1 cells;
  - upgrade: mixed-level segment (min 1, some cells 2) — only sub-target cells raised, cost = below-target count × 30 × 1;
  - upgrade blocked at max: segment with all cells at 5 unchanged;
  - demolish: refund = round(cells × 40 × 0.5), cells removed, shared junction cell with an outside neighbor retained.

Build fixtures with a small hand-made `IndustryCity` (real tiles this time — 20×20, all `terrain: 'industrial'`, `locked: false`, plus a wall of `blocked` tiles for the no-path case) and two `IndustrialBuilding`s; `GameState` stub as in Task 4 plus `cash`.

- [ ] **Step 2: Run to verify failure** — `bun run test:unit -- src/lib/game/railPlacement.spec.ts --run` — FAIL (module missing).

- [ ] **Step 3: Implement** `railPlacement.ts` per the algorithm above; add the six decision-context codes + factories; add `TranslationKey` entries (`decision.railUnknownBuilding`, `decision.railNoValidPath`, `decision.railRequiresCash`, `decision.railSegmentAtMaxLevel`, `decision.railUnknownSegment`, `decision.industrialTileHasRail`) to all three catalogs and wire them in `gameCopy.ts` where decision contexts are formatted; extend the saveCodec decision-context switch.

- [ ] **Step 4: Run tests** — placement spec PASS; `bun run test:unit -- src/lib/i18n/gameCopy.spec.ts --run` PASS (it asserts catalog completeness); full suite green; `bun run check` clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(rail): waypointed build preview, build/upgrade/demolish transitions"
```

---

### Task 8: Rail occupancy blocks building placement

**Files:**
- Modify: `src/lib/game/industryPlacement.ts`
- Test: `src/lib/game/industryPlacement.spec.ts` (append)

**Interfaces:**
- Consumes: `railCellKey` (Task 2), `decisionContextIndustrialTileHasRail` (Task 7), existing `IndustrialPlacementContext` / `getIndustrialPlacementBlockReasonWithContext`.
- Produces: footprints overlapping any rail cell are blocked with `{ code: 'industrialTileHasRail' }`; `placementPreview`'s industry valid-tile computation (which calls the same block-reason path) marks them invalid automatically.

- [ ] **Step 1: Failing test** (append to `industryPlacement.spec.ts`): place a rail cell inside a would-be 2×2 footprint; expect `getIndustrialPlacementBlockReason(game, tileId, 'flour-mill')` to return `{ code: 'industrialTileHasRail' }`; and a control case one tile away that still returns `null`.

- [ ] **Step 2: Run** — FAIL (returns `null` today).

- [ ] **Step 3: Implement** — in `createIndustrialPlacementContext`, build a `Set<string>` of rail-occupied tile ids for the active city (map each `RailCell` through the tile lookup's `byCoordinate`); in the block-reason function, after the existing occupied-tile check, check the footprint tiles against the rail set and return the new context.

- [ ] **Step 4: Run** — placement spec PASS; full suite green.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(rail): rail cells block industrial building placement"
```

---

### Task 9: Product-chain metrics count rail flows

**Files:**
- Modify: `src/lib/game/productChainGraph.ts` (`ProductChainActualMetrics` + `materialActualMetrics` + `emptyActualMetrics`)
- Test: `src/lib/game/productChainGraph.spec.ts` (append)

**Interfaces:**
- Consumes: report movements with `source: 'rail'` (Task 5).
- Produces: `ProductChainActualMetrics` gains `railPulled: number`; `materialActualMetrics` computes it as `sumMovements(report?.consumed, materialId, 'rail')`. `consumed` already sums all sources, so totals were never wrong — `railPulled` is the display metric.

- [ ] **Step 1: Failing test**: a `DailyProductionReport` whose `consumed` holds a `source: 'rail'` grain movement → `materialActualMetrics(report, 'grain', null).railPulled` equals its quantity, `consumed` includes it, and `importedInput` stays 0. Also assert `materialHealth` returns `'healthy'` for a rail-fed material with producers present (rail supply must never read as shortage).

- [ ] **Step 2: Run** — FAIL (`railPulled` missing).

- [ ] **Step 3: Implement** — add the field to the interface, `emptyActualMetrics` (`railPulled: 0`), and `materialActualMetrics`. Check `productChainTree.ts` compiles (it consumes the metrics type); update any exhaustive metric listings there.

- [ ] **Step 4: Run** — graph + tree specs PASS; full suite green.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(rail): expose railPulled metric in product chain actuals"
```

---

### Task 10: Map-render rails layer (`industryMapRender.ts`)

**Files:**
- Modify: `src/lib/game/industryMapRender.ts`
- Test: `src/lib/game/industryMapRender.spec.ts` (create if it does not exist)

**Interfaces:**
- Consumes: `buildRailNetwork`, `getRailNeighborKeys`, `railUsageKey` (Task 2); latest report's `railUsage` from `game.reports.at(-1)?.productionReport`.
- Produces:

```ts
export interface IndustryMapRailRender {
	x: number;
	y: number;
	level: number;
	connections: number; // bitmask N=1, E=2, S=4, W=8
	utilization: number; // 0..1: (yesterday's units through this cell) / level
}

export interface IndustryMapRailPreviewRender {
	cells: Array<{ x: number; y: number; isNew: boolean }>;
}

// IndustryMapSnapshot gains:
//   rails: IndustryMapRailRender[];
//   railPreview: IndustryMapRailPreviewRender | null;
// createIndustryMapSnapshot gains an optional 4th parameter:
//   railPreview: IndustryMapRailPreviewRender | null = null
```

- [ ] **Step 1: Failing tests**: snapshot of a game with an L-shaped 3-cell rail returns 3 rail renders; the corner cell has `connections` with exactly two bits set matching its neighbors; `utilization` is `usage/level` when the latest report has `railUsage` for that cell and `0` with no reports; `railPreview` passes through.

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Implement**: build the network once, map each cell: connections bitmask from `getRailNeighborKeys` offsets (N=1,E=2,S=4,W=8 — same order as `NEIGHBOR_OFFSETS`), utilization clamped to [0,1]. Thread the new parameter through `+page.svelte`'s `createIndustryMapSnapshot` call (pass `null` for now — the UI task wires the real preview).

- [ ] **Step 4: Run** — PASS; `bun run check` clean.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(rail): rails layer in industry map snapshot with utilization"
```

---

### Task 11: Rail art assets

**Files:**
- Create: `static/assets/game/rail/rail-straight.png`, `rail-corner.png`, `rail-tee.png`, `rail-cross.png` (32×32 tile art)
- Modify: `src/lib/assets/gameArt.ts`
- Test: `src/lib/assets/gameArt.spec.ts` passes (it enforces every asset file is registered)

**Interfaces:**
- Produces:

```ts
export const RAIL_ART = {
	straight: '/assets/game/rail/rail-straight.png', // native orientation: horizontal
	corner: '/assets/game/rail/rail-corner.png', // native orientation: connects E + S
	tee: '/assets/game/rail/rail-tee.png', // native orientation: connects E + S + W (stem south)
	cross: '/assets/game/rail/rail-cross.png'
} as const;
export type RailArtKind = keyof typeof RAIL_ART;
```

- [ ] **Step 1: Generate the art** with the `generating-images-with-cli` skill (NOT scripted pixels — CLAUDE.md hard rule). Prompt for a top-down 32×32 pixel-art railway track segment matching the existing industry tile palette (look at `static/assets/game/` terrain tiles for palette reference): steel rails + wooden sleepers on gravel ballast, transparent or terrain-neutral background, one image per variant (straight horizontal; 90° corner east→south; T-junction east/south/west; 4-way cross). Downscale/crop to exactly 32×32 if the generator outputs larger.

- [ ] **Step 2: Register** `RAIL_ART` in `gameArt.ts` and wire it into whatever completeness list `gameArt.spec.ts` checks (read the spec first — follow the existing registration pattern used by `INDUSTRIAL_BUILDING_ART`).

- [ ] **Step 3: Run** — `bun run test:unit -- src/lib/assets/gameArt.spec.ts --run` — PASS.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(rail): rail track art assets"
```

---

### Task 12: Scene rendering — rails, preview, cancel event, stalled color

**Files:**
- Modify: `src/lib/phaser/industryMapScene.ts`
- Modify: `src/lib/components/game/IndustryMap.svelte` (event plumbing only)
- Test: `src/lib/phaser/industryMapScene.spec.ts` (append — follow the existing spec's harness for scene logic; pure helpers preferred)

**Interfaces:**
- Consumes: `IndustryMapRailRender` (`connections` bitmask), `IndustryMapRailPreviewRender` (Task 10); `RAIL_ART` (Task 11).
- Produces:

```ts
export type IndustryMapEvent =
	| { type: 'tileSelected'; tileId: string }
	| { type: 'buildCancelled' };

// Exported pure helper so the bitmask→art mapping is unit-testable:
export function railArtForConnections(connections: number): {
	kind: RailArtKind;
	rotationDeg: 0 | 90 | 180 | 270;
};
```

Bitmask mapping (N=1,E=2,S=4,W=8): 4 bits set → cross/0. 3 bits → tee, rotated so the missing direction faces away from the stem: E+S+W (mask 14) → 0°, N+S+W (13) → 90°, N+E+W (11) → 180°, N+E+S (7) → 270°. 2 opposite bits → straight: E+W (10) → 0°, N+S (5) → 90°. 2 adjacent bits → corner: E+S (6) → 0°, S+W (12) → 90°, W+N (9) → 180°, N+E (3) → 270°. 0–1 bits → straight, horizontal for masks 0/2/8, vertical (90°) for 1/4.

Rendering rules: rail sprites at depth between terrain and building markers (reuse `OCCUPANCY_OUTLINE_DEPTH + 1`); tint by utilization tier (≥1.0 → red 0xef4444, ≥0.75 → amber 0xf59e0b, else none); preview cells drawn as translucent overlays (`isNew` → the existing `PLACEMENT_PREVIEW_VALID_COLOR` style, reused cells → neutral gray 0x94a3b8, alpha `PLACEMENT_PREVIEW_ALPHA`). `STATUS_COLORS` gains `stalled: 0xa855f7`. Escape keydown and right-click (`pointerdown` with `button === 2`) emit `{ type: 'buildCancelled' }`. Canvas data attributes: `data-rail-cell-count` (snapshot rails length) and `data-rail-sprite-count` (created rail sprites), set wherever the existing `data-*` attributes are written.

- [ ] **Step 1: Failing tests** for `railArtForConnections` — one assertion per mask family (cross, all four tees, both straights, all four corners, isolated/end masks).

- [ ] **Step 2: Run** — FAIL (helper missing).

- [ ] **Step 3: Implement** helper + scene rendering + events + data attributes; `IndustryMap.svelte` forwards `buildCancelled` to a new optional `onBuildCancelled` prop callback. Run svelte-autofixer on `IndustryMap.svelte`.

- [ ] **Step 4: Run** — scene spec PASS; `bun run check` clean; full unit suite green.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(rail): render rail layer, build preview, and stalled status in industry scene"
```

---

### Task 13: UI — rail build mode, segment inspector, i18n strings

**Files:**
- Create: `src/lib/components/game/RailSegmentInspector.svelte`
- Test: `src/lib/components/game/RailSegmentInspector.svelte.spec.ts` (client project)
- Modify: `src/routes/+page.svelte` (build-mode state machine, wiring)
- Modify: `src/lib/i18n/messages/en.ts`, `ja.ts`, `zh-Hant.ts` (UI strings)
- Modify: `src/lib/components/game/IndustryTileInspector.svelte` (add `stalled` to `INDUSTRIAL_BUILDING_STATUS_KEYS`; show the building's own buffer contents from `building.inventory` alongside the existing warehouse rows)

**Interfaces:**
- Consumes: `buildRailPreview`, `buildRail`, `upgradeRailSegment`, `demolishRailSegment`, `getSegmentUpgradeCost`, `getSegmentDemolishRefund` (Task 7); `deriveRailSegments`, `getSegmentsForCell`, `RAIL_MAX_LEVEL`, `railUsageKey`, `parseRailCellKey` (Task 2); snapshot `railPreview` parameter (Task 10); `buildCancelled` (Task 12).
- Produces: the playable feature.

**Build-mode state machine in `+page.svelte`** (plain `$state`):

```ts
type RailBuildMode =
	| { step: 'idle' }
	| { step: 'origin' } // waiting for origin building click
	| { step: 'routing'; originBuildingId: string; waypoints: Array<{ x: number; y: number }> };

let railBuildMode = $state<RailBuildMode>({ step: 'idle' });
let railPreview = $derived.by(() => /* when routing + hovered/last-selected target building: buildRailPreview(...) mapped to IndustryMapRailPreviewRender; else null */);
```

Click routing (inside the existing industry-map `tileSelected` handler, BEFORE the normal tile-selection logic, only when `railBuildMode.step !== 'idle'`):
- step `origin`: if the tile belongs to a building footprint → enter `routing` with that building; else ignore.
- step `routing`: click on a building → destination chosen: compute `buildRailPreview`; if `blockReason` show it via the existing placement-feedback toast (`formatPlacementBlockReason`), stay in routing; else `setGameAndAutosave(buildRail(game, input))`, exit to `idle`. Click on empty tile → push as waypoint. `buildCancelled` event → pop last waypoint, or exit build mode when no waypoints remain.
- A "Build rail" toolbar button (next to the existing build-menu button in the industry-map controls in `+page.svelte`) toggles `idle` ↔ `origin`.

**Segment selection**: when NOT in build mode and a `tileSelected` hits a rail cell (no building, tile coordinates match a rail cell), select the segment(s) via `getSegmentsForCell` and open `RailSegmentInspector` instead of the tile inspector; a junction cell (multiple segments) renders the inspector with a segment picker list.

**`RailSegmentInspector.svelte`** props contract:

```ts
interface Props {
	game: GameState;
	cityId: string;
	segments: RailSegment[]; // 1..n (n>1 ⇒ junction picker)
	i18n: I18nBundle;
	onClose: () => void;
	onUpgradeSegment: (segmentId: string) => void;
	onDemolishSegment: (segmentId: string) => void;
}
```

Displays per segment: cell count, min level (`{level}/{RAIL_MAX_LEVEL}`), capacity/day (= min level), yesterday's utilization (max over its cells of `railUsage[railUsageKey(cityId,x,y)] / level`, from `game.reports.at(-1)?.productionReport.railUsage ?? {}`), upgrade button (label with `getSegmentUpgradeCost`, disabled at max level or unaffordable), demolish button (label with `getSegmentDemolishRefund`). Follow `IndustryTileInspector.svelte`'s markup/class conventions and its `blockMapInteraction` attachment pattern.

**New i18n keys** (all three catalogs; English values shown, translate for ja/zh-Hant in the same register the neighbors use):

```
railBuild.toolbar          "Build rail"
railBuild.pickOrigin       "Select the first building"
railBuild.pickDestination  "Select waypoints, then the destination building"
railBuild.confirm          "{cells} new cells · {cost}"
railSegmentInspector.title        "Rail segment"
railSegmentInspector.cells        "Cells"
railSegmentInspector.level        "Level"
railSegmentInspector.capacity     "Capacity per day"
railSegmentInspector.utilization  "Utilization yesterday"
railSegmentInspector.upgrade      "Upgrade ({cost})"
railSegmentInspector.demolish     "Demolish (+{refund})"
railSegmentInspector.pickSegment  "Junction — pick a segment"
railSegmentInspector.atMaxLevel   "At max level"
industryTileInspector.status.stalled  "Stalled (buffer full)"
industryTileInspector.buffer          "Buffer"
```

- [ ] **Step 1: Failing component test** — `RailSegmentInspector.svelte.spec.ts` (client project, mirror an existing `.svelte.spec.ts` for setup): renders level/capacity/utilization for a single segment; junction case renders the picker; upgrade button disabled when all cells at `RAIL_MAX_LEVEL`; callbacks fire with the segment id.

- [ ] **Step 2: Run** — `bun run test:unit -- src/lib/components/game/RailSegmentInspector.svelte.spec.ts --run --project client` — FAIL.

- [ ] **Step 3: Implement** the component, the i18n keys (all three catalogs — `gameCopy.spec.ts` / catalog completeness tests will fail otherwise), the `+page.svelte` state machine + wiring (snapshot `railPreview` argument from Task 10 gets the real derived preview now), and the `IndustryTileInspector` additions. Run svelte-autofixer on every touched `.svelte` file until clean.

- [ ] **Step 4: Run** — component spec PASS; `bun run check` clean; `bun run lint` clean; full unit suite green.

- [ ] **Step 5: Manual smoke** — `bun run dev`, open the industry map: build a rail farm→mill, advance a day, click the track (inspector shows utilization), upgrade a segment, demolish a segment.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(rail): rail build mode, segment inspector, and buffer UI"
```

---

### Task 14: E2e acceptance

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts` (append a rail scenario `describe` block, reusing its existing helpers for starting a game, switching to the industry map, clicking tiles by grid coordinates × 32px, and advancing days)

**Interfaces:**
- Consumes: `data-rail-cell-count` (Task 12), the build-rail toolbar button and inspector strings (Task 13), status labels via `industryTileInspector.status.*`.

**Acceptance scenario (from the spec — the signal is the status FLIP, there is no "rail-supplied" status):**

1. Start a fresh game; switch to the industry map; place a grain farm on a grain-field resource tile and a flour mill on an industrial tile ~8 tiles apart (reuse the placement flow the existing e2e already exercises).
2. Advance one day. Open the mill's inspector → status label equals the `imported-inputs` string.
3. Click "Build rail"; click the farm, then the mill; confirm. Assert the canvas `data-rail-cell-count` is greater than 0.
4. Advance one day. Mill inspector → status label equals the `produced` string (rail-fed, no imports for the rail-covered units — pick building spacing so the level-1 line covers at least 1 unit and the day's import quantity drops; if full coverage needs more capacity, assert instead that the report panel lists a rail shipment AND importedInputs decreased vs step 2).
5. Assert the daily report UI lists a nonzero rail shipment entry.

Follow the existing e2e conventions: await the canvas `data-*` attributes before clicking (`data-terrain-asset-mode` etc.), use the same selectors/utilities as neighboring tests.

- [ ] **Step 1: Write the test** per the scenario.
- [ ] **Step 2: Run** — `bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "rail"` — expect it to fail only if the feature is broken; fix forward.
- [ ] **Step 3: Full verification** — `bun run test` (unit + e2e), `bun run lint`, `bun run check`.
- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "test(rail): e2e acceptance for rail-fed production status flip"
```

---

## Task order & dependencies

```
1 → 2 → 3 → 4 → 5 → 6
            7 → 8
5,7 → 9,10 → 11 → 12 → 13 → 14
```
Tasks 7–8 only need Tasks 1–2 (+3 for nothing — preview pathing is self-contained), so they can proceed in parallel with 4–6 if desired; everything UI-ward (10+) needs 5 and 7 landed.

## Spec coverage checklist (self-review)

- Decisions table (fallback/bottleneck/waypoints/inventories/warehouse-only retail/segment upgrades/cell-budget engine/same-day/stall) → Tasks 1–5, 7, 13.
- Segment topology rules incl. loops & junction membership → Task 2.
- Tuning knobs → Task 2 constants, Task 1 buffer table, Task 7 costs.
- Daily tick phases, scaled-atomic production, status precedence, budget sharing → Task 5.
- Reporting mapping (`railShipments`, `railUsage`, `railPulled`, buckets) → Tasks 4, 5, 9.
- Global-pool-across-cities: encoded implicitly — `RailTickState.warehouse` is the single shared pool while attach/paths are per-city → Task 4 (no extra work).
- Build UX contracts (`RailBuildPreview`, snapshot preview layer, `buildCancelled`) → Tasks 7, 10, 12, 13.
- Building placement rail-occupancy → Task 8.
- Persistence v10 + enum arrays + report backfill + clamp guard → Task 6.
- Rendering, art via image-gen, `data-*` attributes, stalled color → Tasks 10–12.
- E2e status-flip acceptance → Task 14.
- Out of scope (per-city pools, travel time, retail-city rails, buffer-level scaling, visible trains) → not planned, correctly.
