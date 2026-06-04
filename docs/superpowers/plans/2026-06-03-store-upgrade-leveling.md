# Store Upgrade / Leveling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a cash-funded leveling system: retail stores start with 1 product type and level up to 10 (milestones 4/7/10 unlock a product + staff; other levels give +10% revenue), and industrial buildings level up to 10 for +20% throughput per level.

**Architecture:** All level math lives in a new pure module `src/lib/game/leveling.ts`. Two new pure transitions (`upgradeStore` in `state.ts`, `upgradeBuilding` in `industryPlacement.ts`) deduct cash and bump level. The daily simulation reads `store.level` (retail revenue multiplier in `stock.ts`) and `building.level` (throughput scaling in `industryProduction.ts`). Persistence validates the new fields and normalizes legacy saves. Two inspector components gain an Upgrade button.

**Tech Stack:** TypeScript, SvelteKit (Svelte 5 runes), Vitest (browser `client` + node `server` projects), bun. Tests must contain `expect` assertions (`vite.config.ts` enforces `requireAssertions`).

---

## Conventions for every task

- Run a single spec file with: `bun run test:unit -- <path> --run`
- Every Vitest test starts with `expect.assertions(N)` (project convention; see existing specs).
- Commit after each task with the message shown in its final step.
- Do NOT bump `SAVE_SCHEMA_VERSION` (stays `4`).
- For Svelte component tasks, follow the mandatory Svelte MCP workflow: `list-sections` → `get-documentation` → write code → `svelte-autofixer` until clean.

## File map

| File | Responsibility | Tasks |
| --- | --- | --- |
| `src/lib/game/leveling.ts` (new) | Pure level math + constants | 1 |
| `src/lib/game/leveling.spec.ts` (new) | Tests for level math | 1 |
| `src/lib/game/types.ts` | Add `level` to `Store` and `IndustrialBuilding` | 2 |
| `src/lib/game/state.ts` | `createStore` sets `level: 1`; new `upgradeStore` transition | 2, 6 |
| `src/lib/game/industryPlacement.ts` | `createIndustrialBuilding` sets `level: 1`; new `upgradeBuilding` transition | 2, 7 |
| spec fixtures (8 files) | Add `level` to `Store`/`IndustrialBuilding` literals so `bun run check` passes | 2 |
| `src/lib/game/archetypes.ts` | Add 4th product category to each retail archetype | 3 |
| `src/lib/game/stock.ts` | `initializeStoreProducts` level-aware; `createStoreProduct` helper; revenue multiplier in sales | 4, 8 |
| `src/lib/game/staffing.ts` | `getStaffingRequirement` scales general count with level | 5 |
| `src/lib/game/industryProduction.ts` | Throughput scaling by building level | 9 |
| `src/lib/persistence/saveCodec.ts` | Validate `level`; relax product validation; legacy migration | 10 |
| `src/lib/components/game/TileInspector.svelte` | Store level display + Upgrade button | 11 |
| `src/lib/components/game/IndustryTileInspector.svelte` | Building level display + Upgrade button | 12 |
| `src/routes/+page.svelte` | Wire upgrade callbacks | 13 |

---

### Task 1: Pure leveling math module

**Files:**
- Create: `src/lib/game/leveling.ts`
- Test: `src/lib/game/leveling.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/game/leveling.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import {
	MAX_STORE_LEVEL,
	MAX_BUILDING_LEVEL,
	RETAIL_UPGRADE_BASE_COST,
	INDUSTRY_UPGRADE_BASE_COST,
	isMilestoneLevel,
	getUnlockedCategoryCount,
	getStoreRevenueMultiplier,
	getStoreStaffCapacityBonus,
	getStoreUpgradeCost,
	getBuildingThroughputMultiplier,
	getBuildingUpgradeCost,
	canUpgradeStore,
	canUpgradeBuilding
} from './leveling';

describe('leveling math', () => {
	test('caps are 10', () => {
		expect.assertions(2);
		expect(MAX_STORE_LEVEL).toBe(10);
		expect(MAX_BUILDING_LEVEL).toBe(10);
	});

	test('milestone levels are 4, 7, 10', () => {
		expect.assertions(10);
		expect(isMilestoneLevel(1)).toBe(false);
		expect(isMilestoneLevel(2)).toBe(false);
		expect(isMilestoneLevel(3)).toBe(false);
		expect(isMilestoneLevel(4)).toBe(true);
		expect(isMilestoneLevel(5)).toBe(false);
		expect(isMilestoneLevel(6)).toBe(false);
		expect(isMilestoneLevel(7)).toBe(true);
		expect(isMilestoneLevel(8)).toBe(false);
		expect(isMilestoneLevel(9)).toBe(false);
		expect(isMilestoneLevel(10)).toBe(true);
	});

	test('unlocked category count steps at milestones', () => {
		expect.assertions(5);
		expect(getUnlockedCategoryCount(1)).toBe(1);
		expect(getUnlockedCategoryCount(3)).toBe(1);
		expect(getUnlockedCategoryCount(4)).toBe(2);
		expect(getUnlockedCategoryCount(7)).toBe(3);
		expect(getUnlockedCategoryCount(10)).toBe(4);
	});

	test('revenue multiplier adds 10% per non-milestone level', () => {
		expect.assertions(5);
		expect(getStoreRevenueMultiplier(1)).toBeCloseTo(1.0, 5);
		expect(getStoreRevenueMultiplier(3)).toBeCloseTo(1.2, 5);
		expect(getStoreRevenueMultiplier(4)).toBeCloseTo(1.2, 5);
		expect(getStoreRevenueMultiplier(7)).toBeCloseTo(1.4, 5);
		expect(getStoreRevenueMultiplier(10)).toBeCloseTo(1.6, 5);
	});

	test('staff capacity bonus is 8 per milestone reached', () => {
		expect.assertions(4);
		expect(getStoreStaffCapacityBonus(1)).toBe(0);
		expect(getStoreStaffCapacityBonus(4)).toBe(8);
		expect(getStoreStaffCapacityBonus(7)).toBe(16);
		expect(getStoreStaffCapacityBonus(10)).toBe(24);
	});

	test('store upgrade cost scales with current level', () => {
		expect.assertions(2);
		expect(getStoreUpgradeCost(1)).toBe(RETAIL_UPGRADE_BASE_COST);
		expect(getStoreUpgradeCost(9)).toBe(RETAIL_UPGRADE_BASE_COST * 9);
	});

	test('building throughput adds 20% per level', () => {
		expect.assertions(3);
		expect(getBuildingThroughputMultiplier(1)).toBeCloseTo(1.0, 5);
		expect(getBuildingThroughputMultiplier(5)).toBeCloseTo(1.8, 5);
		expect(getBuildingThroughputMultiplier(10)).toBeCloseTo(2.8, 5);
	});

	test('building upgrade cost scales with current level', () => {
		expect.assertions(1);
		expect(getBuildingUpgradeCost(3)).toBe(INDUSTRY_UPGRADE_BASE_COST * 3);
	});

	test('cannot upgrade at max level', () => {
		expect.assertions(4);
		expect(canUpgradeStore(9)).toBe(true);
		expect(canUpgradeStore(10)).toBe(false);
		expect(canUpgradeBuilding(9)).toBe(true);
		expect(canUpgradeBuilding(10)).toBe(false);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/leveling.spec.ts --run`
Expected: FAIL — cannot resolve module `./leveling`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/game/leveling.ts`:

```ts
export const MAX_STORE_LEVEL = 10;
export const MAX_BUILDING_LEVEL = 10;
export const STORE_MILESTONE_LEVELS = [4, 7, 10] as const;
export const RETAIL_UPGRADE_BASE_COST = 8_000;
export const INDUSTRY_UPGRADE_BASE_COST = 5_000;
export const STORE_MILESTONE_CAPACITY_BONUS = 8;
export const STORE_REVENUE_BONUS_PER_LEVEL = 0.1;
export const BUILDING_THROUGHPUT_BONUS_PER_LEVEL = 0.2;

export function isMilestoneLevel(level: number): boolean {
	return STORE_MILESTONE_LEVELS.includes(level as (typeof STORE_MILESTONE_LEVELS)[number]);
}

export function getUnlockedCategoryCount(level: number): number {
	if (level >= 10) return 4;
	if (level >= 7) return 3;
	if (level >= 4) return 2;
	return 1;
}

export function getStoreRevenueMultiplier(level: number): number {
	let bonusLevels = 0;
	for (let candidate = 2; candidate <= level; candidate++) {
		if (!isMilestoneLevel(candidate)) {
			bonusLevels++;
		}
	}
	return 1 + STORE_REVENUE_BONUS_PER_LEVEL * bonusLevels;
}

export function getStoreStaffCapacityBonus(level: number): number {
	return STORE_MILESTONE_CAPACITY_BONUS * (getUnlockedCategoryCount(level) - 1);
}

export function getStoreUpgradeCost(level: number): number {
	return RETAIL_UPGRADE_BASE_COST * level;
}

export function getBuildingThroughputMultiplier(level: number): number {
	return 1 + BUILDING_THROUGHPUT_BONUS_PER_LEVEL * (level - 1);
}

export function getBuildingUpgradeCost(level: number): number {
	return INDUSTRY_UPGRADE_BASE_COST * level;
}

export function canUpgradeStore(level: number): boolean {
	return level < MAX_STORE_LEVEL;
}

export function canUpgradeBuilding(level: number): boolean {
	return level < MAX_BUILDING_LEVEL;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/leveling.spec.ts --run`
Expected: PASS (all tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/leveling.ts src/lib/game/leveling.spec.ts
git commit -m "feat: add pure leveling math module"
```

---

### Task 2: Add `level` field to domain types and all constructors

**Files:**
- Modify: `src/lib/game/types.ts` (`Store`, `IndustrialBuilding`)
- Modify: `src/lib/game/state.ts:217-235` (`createStore`)
- Modify: `src/lib/game/industryPlacement.ts:132-144` (`createIndustrialBuilding`)
- Modify (fixtures, add `level`): `src/lib/game/simulateDay.spec.ts`, `src/lib/game/staffing.spec.ts`, `src/lib/game/productChainGraph.spec.ts`, `src/lib/persistence/saveRepository.spec.ts`, `src/lib/components/game/StaffPanel.svelte.spec.ts`, `src/lib/components/game/StoreOverview.svelte.spec.ts`, `src/lib/components/game/StoreStockTable.svelte.spec.ts`, `src/lib/components/game/TileInspector.svelte.spec.ts`, `src/lib/components/game/IndustryTileInspector.svelte.spec.ts`

- [ ] **Step 1: Add the type fields**

In `src/lib/game/types.ts`, add `level: number;` to the `Store` interface (after `id`):

```ts
export interface Store {
	id: string;
	level: number;
	name: string;
	archetypeId: ArchetypeId;
	// ...rest unchanged
}
```

And to `IndustrialBuilding` (after `id`):

```ts
export interface IndustrialBuilding {
	id: string;
	level: number;
	typeId: IndustrialBuildingTypeId;
	// ...rest unchanged
}
```

- [ ] **Step 2: Set `level: 1` in the production constructors**

In `src/lib/game/state.ts`, inside `createStore`'s returned object, add `level: 1,` as the second property:

```ts
	return {
		id: input.id,
		level: 1,
		name: input.name,
		// ...rest unchanged
	};
```

In `src/lib/game/industryPlacement.ts`, inside `createIndustrialBuilding`'s returned object, add `level: 1,` as the second property:

```ts
	return {
		id: `industry-building-${game.industrialBuildings.length + 1}`,
		level: 1,
		typeId: buildingType.id,
		// ...rest unchanged
	};
```

- [ ] **Step 3: Run the type check to find every fixture that needs `level`**

Run: `bun run check`
Expected: FAIL with errors like `Property 'level' is missing in type ... Store` / `... IndustrialBuilding`, listing the spec files in the file map above.

- [ ] **Step 4: Add `level: 1` to each failing fixture**

For every `Store` object literal in the listed spec files (each ends with a `managerQuality:` line), add `level: 1,` near the top of the literal (e.g. right after the `id:` line). For every `IndustrialBuilding` literal (each ends with `blockedDays:`), add `level: 1,` after its `id:` line.

To locate them:

```bash
grep -rn "managerQuality:" src --include=*.spec.ts
grep -rn "blockedDays:" src --include=*.spec.ts
```

- [ ] **Step 5: Run the type check to verify it passes**

Run: `bun run check`
Expected: PASS (0 errors).

- [ ] **Step 6: Run the full unit suite to confirm nothing regressed**

Run: `bun run test:unit -- --run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/state.ts src/lib/game/industryPlacement.ts src/lib/game/*.spec.ts src/lib/components/game/*.spec.ts src/lib/persistence/*.spec.ts
git commit -m "feat: add level field to Store and IndustrialBuilding"
```

---

### Task 3: Add a 4th product category to each retail archetype

**Files:**
- Modify: `src/lib/game/archetypes.ts` (`RAW_ARCHETYPES`)
- Test: `src/lib/game/archetypes.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/archetypes.spec.ts` inside the `describe('retail archetypes', ...)` block:

```ts
	test('each archetype defines exactly four product categories', () => {
		expect.assertions(ARCHETYPES.length);
		for (const archetype of ARCHETYPES) {
			expect(archetype.startingCategories).toHaveLength(4);
		}
	});

	test('category ids are unique within each archetype', () => {
		expect.assertions(ARCHETYPES.length);
		for (const archetype of ARCHETYPES) {
			const ids = archetype.startingCategories.map((category) => category.id);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/archetypes.spec.ts --run`
Expected: FAIL — `expected length 3 to be 4`.

- [ ] **Step 3: Add the 4th category to each archetype**

In `src/lib/game/archetypes.ts`, append one category object to each archetype's `startingCategories` array (these are import-only categories — their ids are intentionally NOT `MaterialId`s):

convenience — after the `essentials` entry:
```ts
				{
					id: 'household',
					name: 'Household',
					baseDemand: 30,
					margin: 0.28,
					demandWeight: 0.7,
					importCost: 7,
					defaultSellingPrice: 11,
					priceSensitivity: 0.5
				}
```

boutique — after the `gifts` entry:
```ts
				{
					id: 'accessories',
					name: 'Accessories',
					baseDemand: 24,
					margin: 0.52,
					demandWeight: 0.7,
					importCost: 12,
					defaultSellingPrice: 26,
					priceSensitivity: 1.0
				}
```

electronics — after the `devices` entry:
```ts
				{
					id: 'peripherals',
					name: 'Peripherals',
					baseDemand: 28,
					margin: 0.4,
					demandWeight: 0.7,
					importCost: 24,
					defaultSellingPrice: 44,
					priceSensitivity: 0.85
				}
```

grocery — after the `prepared` entry:
```ts
				{
					id: 'bakery',
					name: 'Bakery',
					baseDemand: 34,
					margin: 0.4,
					demandWeight: 0.7,
					importCost: 3,
					defaultSellingPrice: 7,
					priceSensitivity: 0.8
				}
```

- [ ] **Step 4: Run the archetype + stock + save tests**

Run: `bun run test:unit -- src/lib/game/archetypes.spec.ts --run`
Expected: PASS.

Run: `bun run test:unit -- src/lib/persistence/saveRepository.spec.ts --run`
Expected: PASS (product validation still accepts full category sets; the new category is now part of each archetype).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/archetypes.ts src/lib/game/archetypes.spec.ts
git commit -m "feat: add fourth product category to each retail archetype"
```

---

### Task 4: Make stores start with one product (level-aware product init)

**Files:**
- Modify: `src/lib/game/stock.ts:40-50` (`initializeStoreProducts`, extract `createStoreProduct`)
- Test: `src/lib/game/stock.spec.ts`

- [ ] **Step 1: Update the failing existing test and add new ones**

In `src/lib/game/stock.spec.ts`, replace the existing test that asserts three convenience categories with these:

```ts
	test('initializes a single product at level 1', () => {
		expect.assertions(2);
		const products = initializeStoreProducts('convenience');

		expect(products.map((product) => product.categoryId)).toEqual(['snacks']);
		expect(products[0]!.sellingPrice).toBe(5);
	});

	test('initializes unlocked categories for a given level', () => {
		expect.assertions(3);
		expect(initializeStoreProducts('convenience', 4).map((p) => p.categoryId)).toEqual([
			'snacks',
			'drinks'
		]);
		expect(initializeStoreProducts('convenience', 7).map((p) => p.categoryId)).toEqual([
			'snacks',
			'drinks',
			'essentials'
		]);
		expect(initializeStoreProducts('convenience', 10).map((p) => p.categoryId)).toEqual([
			'snacks',
			'drinks',
			'essentials',
			'household'
		]);
	});
```

> Note: keep the remaining assertions of the old test (stock/threshold/target defaults) only if they referenced `products[0]` (snacks); delete any assertions that referenced `drinks`/`essentials` indices since level-1 now has a single product.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/stock.spec.ts --run`
Expected: FAIL — level-1 init still returns 3 categories.

- [ ] **Step 3: Make `initializeStoreProducts` level-aware and extract `createStoreProduct`**

In `src/lib/game/stock.ts`, add the import:

```ts
import { getUnlockedCategoryCount } from './leveling';
```

Replace `initializeStoreProducts` with:

```ts
export function createStoreProduct(category: ProductCategory): StoreProduct {
	return {
		categoryId: category.id,
		stock: Math.max(1, roundStockDefault(category.demandWeight * 70)),
		reorderThreshold: Math.max(0, roundStockDefault(category.demandWeight * 25)),
		targetStock: Math.max(1, roundStockDefault(category.demandWeight * 90)),
		sellingPrice: category.defaultSellingPrice
	};
}

export function initializeStoreProducts(archetypeId: ArchetypeId, level = 1): StoreProduct[] {
	const archetype = getArchetype(archetypeId);
	const unlockedCount = getUnlockedCategoryCount(level);

	return archetype.startingCategories.slice(0, unlockedCount).map(createStoreProduct);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/stock.spec.ts --run`
Expected: PASS.

- [ ] **Step 5: Fix any downstream specs that assumed 3 starting products**

Run: `bun run test:unit -- --run`
Expected: Some `state.spec.ts` / `simulateDay.spec.ts` assertions about `products.length === 3` may fail. Update those assertions to expect `1` for a freshly created store. Re-run until green.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/stock.ts src/lib/game/stock.spec.ts src/lib/game/state.spec.ts src/lib/game/simulateDay.spec.ts
git commit -m "feat: start stores with a single product, unlock by level"
```

---

### Task 5: Scale staffing requirement with store level

**Files:**
- Modify: `src/lib/game/staffing.ts:50-52` (`getStaffingRequirement`), `:151-174` (`summarizeStoreStaffing`)
- Test: `src/lib/game/staffing.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/staffing.spec.ts`:

```ts
	test('staffing requirement grows by one general per milestone level', () => {
		expect.assertions(4);
		expect(getStaffingRequirement('convenience', 1)).toEqual({ manager: 1, general: 1 });
		expect(getStaffingRequirement('convenience', 4)).toEqual({ manager: 1, general: 2 });
		expect(getStaffingRequirement('convenience', 7)).toEqual({ manager: 1, general: 3 });
		expect(getStaffingRequirement('convenience', 10)).toEqual({ manager: 1, general: 4 });
	});
```

Ensure `getStaffingRequirement` is imported in that spec's import block.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/staffing.spec.ts --run`
Expected: FAIL — `getStaffingRequirement` ignores level / takes one argument.

- [ ] **Step 3: Implement level-aware requirement**

In `src/lib/game/staffing.ts`, add the import:

```ts
import { getUnlockedCategoryCount } from './leveling';
```

Replace `getStaffingRequirement`:

```ts
export function getStaffingRequirement(archetypeId: ArchetypeId, level = 1): StaffingRequirement {
	const base = STAFFING_REQUIREMENTS[archetypeId];
	const milestoneStaff = getUnlockedCategoryCount(level) - 1;

	return { manager: base.manager, general: base.general + milestoneStaff };
}
```

In `summarizeStoreStaffing`, pass the store level:

```ts
	const requirement = getStaffingRequirement(store.archetypeId, store.level);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/staffing.spec.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/staffing.ts src/lib/game/staffing.spec.ts
git commit -m "feat: scale store staffing requirement with level"
```

---

### Task 6: `upgradeStore` transition

**Files:**
- Modify: `src/lib/game/state.ts` (add `upgradeStore`)
- Test: `src/lib/game/state.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/state.spec.ts` (add imports for `upgradeStore` from `./state` and the leveling cost helpers as needed):

```ts
	test('upgradeStore deducts cost and increments level on a non-milestone level', () => {
		expect.assertions(3);
		const base = createNewGame('convenience', 20260603);
		const game = { ...base, cash: 100_000 };
		const storeId = game.stores[0]!.id;

		const next = upgradeStore(game, storeId);

		expect(next.stores[0]!.level).toBe(2);
		expect(next.cash).toBe(100_000 - getStoreUpgradeCost(1));
		expect(next.stores[0]!.products).toHaveLength(1); // no new product below level 4
	});

	test('upgradeStore at a milestone unlocks a product and raises capacity', () => {
		expect.assertions(3);
		let game = { ...createNewGame('convenience', 20260603), cash: 1_000_000 };
		const storeId = game.stores[0]!.id;
		const startCapacity = game.stores[0]!.staffCapacity;
		for (let i = 0; i < 3; i++) {
			game = upgradeStore(game, storeId); // reach level 4
		}

		const store = game.stores.find((candidate) => candidate.id === storeId)!;
		expect(store.level).toBe(4);
		expect(store.products.map((product) => product.categoryId)).toEqual(['snacks', 'drinks']);
		expect(store.staffCapacity).toBeGreaterThan(startCapacity);
	});

	test('upgradeStore is a no-op when cash is insufficient', () => {
		expect.assertions(1);
		const game = { ...createNewGame('convenience', 20260603), cash: 0 };
		const next = upgradeStore(game, game.stores[0]!.id);
		expect(next).toBe(game);
	});

	test('upgradeStore is a no-op at max level', () => {
		expect.assertions(1);
		const base = createNewGame('convenience', 20260603);
		const maxed = {
			...base,
			cash: 1_000_000,
			stores: [{ ...base.stores[0]!, level: MAX_STORE_LEVEL }]
		};
		const next = upgradeStore(maxed, maxed.stores[0]!.id);
		expect(next.stores[0]!.level).toBe(MAX_STORE_LEVEL);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/state.spec.ts --run`
Expected: FAIL — `upgradeStore` is not exported.

- [ ] **Step 3: Implement `upgradeStore`**

In `src/lib/game/state.ts`, add imports:

```ts
import {
	canUpgradeStore,
	getStoreUpgradeCost,
	getStoreStaffCapacityBonus,
	getUnlockedCategoryCount,
	isMilestoneLevel
} from './leveling';
import { calculateStockHealth, createStoreProduct, initializeStoreProducts } from './stock';
```

(`initializeStoreProducts` is already imported — extend the existing import to add `createStoreProduct` rather than duplicating.)

Add the transition:

```ts
export function upgradeStore(game: GameState, storeId: string): GameState {
	const index = game.stores.findIndex((store) => store.id === storeId);

	if (index === -1) {
		return game;
	}

	const store = game.stores[index]!;

	if (!canUpgradeStore(store.level)) {
		return game;
	}

	const cost = getStoreUpgradeCost(store.level);

	if (game.cash < cost) {
		return game;
	}

	const nextLevel = store.level + 1;
	let products = store.products;
	let staffCapacity = store.staffCapacity;

	if (isMilestoneLevel(nextLevel)) {
		const archetype = getArchetype(store.archetypeId);
		const unlockedCount = getUnlockedCategoryCount(nextLevel);
		const newCategory = archetype.startingCategories[unlockedCount - 1];

		if (newCategory && !products.some((product) => product.categoryId === newCategory.id)) {
			products = [...products, createStoreProduct(newCategory)];
		}

		staffCapacity = clampScore(
			store.staffCapacity +
				getStoreStaffCapacityBonus(nextLevel) -
				getStoreStaffCapacityBonus(store.level)
		);
	}

	const upgradedStore: Store = {
		...store,
		level: nextLevel,
		products,
		staffCapacity,
		stockHealth: calculateStockHealth(products)
	};

	return {
		...game,
		cash: game.cash - cost,
		stores: game.stores.map((candidate, candidateIndex) =>
			candidateIndex === index ? upgradedStore : candidate
		)
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/state.spec.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/state.ts src/lib/game/state.spec.ts
git commit -m "feat: add upgradeStore transition"
```

---

### Task 7: `upgradeBuilding` transition

**Files:**
- Modify: `src/lib/game/industryPlacement.ts` (add `upgradeBuilding`)
- Test: `src/lib/game/industryPlacement.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/industryPlacement.spec.ts` (import `upgradeBuilding` from `./industryPlacement`, `buildIndustrialBuilding`, `createNewGame`, `getIndustryTilesByResource`, and `getBuildingUpgradeCost`, `MAX_BUILDING_LEVEL` from `./leveling`):

```ts
	test('upgradeBuilding deducts cost and increments level', () => {
		expect.assertions(2);
		const tile = getIndustryTilesByResource(
			createNewGame('convenience', 20260603).industryCities[0]!,
			'grain-field'
		)[0]!;
		let game = { ...createNewGame('convenience', 20260603), cash: 1_000_000 };
		game = buildIndustrialBuilding(game, { tileId: tile.id, buildingTypeId: 'grain-farm' });
		const buildingId = game.industrialBuildings[0]!.id;
		const cashBefore = game.cash;

		const next = upgradeBuilding(game, buildingId);

		expect(next.industrialBuildings[0]!.level).toBe(2);
		expect(next.cash).toBe(cashBefore - getBuildingUpgradeCost(1));
	});

	test('upgradeBuilding is a no-op when cash is insufficient', () => {
		expect.assertions(1);
		const tile = getIndustryTilesByResource(
			createNewGame('convenience', 20260603).industryCities[0]!,
			'grain-field'
		)[0]!;
		let game = { ...createNewGame('convenience', 20260603), cash: 1_000_000 };
		game = buildIndustrialBuilding(game, { tileId: tile.id, buildingTypeId: 'grain-farm' });
		const buildingId = game.industrialBuildings[0]!.id;
		const broke = { ...game, cash: 0 };

		expect(upgradeBuilding(broke, buildingId)).toBe(broke);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/industryPlacement.spec.ts --run`
Expected: FAIL — `upgradeBuilding` is not exported.

- [ ] **Step 3: Implement `upgradeBuilding`**

In `src/lib/game/industryPlacement.ts`, add the import:

```ts
import { canUpgradeBuilding, getBuildingUpgradeCost } from './leveling';
```

Add the transition (top-level export):

```ts
export function upgradeBuilding(game: GameState, buildingId: string): GameState {
	const index = game.industrialBuildings.findIndex((building) => building.id === buildingId);

	if (index === -1) {
		return game;
	}

	const building = game.industrialBuildings[index]!;

	if (!canUpgradeBuilding(building.level)) {
		return game;
	}

	const cost = getBuildingUpgradeCost(building.level);

	if (game.cash < cost) {
		return game;
	}

	return {
		...game,
		cash: game.cash - cost,
		industrialBuildings: game.industrialBuildings.map((candidate, candidateIndex) =>
			candidateIndex === index ? { ...candidate, level: building.level + 1 } : candidate
		)
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/industryPlacement.spec.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/industryPlacement.ts src/lib/game/industryPlacement.spec.ts
git commit -m "feat: add upgradeBuilding transition"
```

---

### Task 8: Apply the retail revenue multiplier in daily sales

**Files:**
- Modify: `src/lib/game/stock.ts:223-265` (inside `simulateProductSalesForCity`)
- Test: `src/lib/game/stock.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/stock.spec.ts` (reuse the existing `simulateProductSalesForCity` test setup style — adapt the helper used by neighbouring tests). The key assertion: a higher store level yields proportionally higher revenue for the same units sold.

```ts
	test('store level multiplies product revenue without changing cost of goods', () => {
		expect.assertions(2);
		const base = createNewGame('convenience', 20260603);
		const city = base.cities[0]!;
		const rng = createRng(base.rngState);
		const storeCapacity = new Map(base.stores.map((store) => [store.id, 10_000]));

		const level1 = simulateProductSalesForCity({ game: base, city, rng: createRng(base.rngState), storeCapacity });
		const leveledGame = {
			...base,
			stores: [{ ...base.stores[0]!, level: 9 }] // x1.6 revenue multiplier
		};
		const level9 = simulateProductSalesForCity({
			game: leveledGame,
			city,
			rng: createRng(base.rngState),
			storeCapacity: new Map(leveledGame.stores.map((store) => [store.id, 10_000]))
		});

		const storeId = base.stores[0]!.id;
		const rev1 = (level1.productReports.get(storeId) ?? []).reduce((t, r) => t + r.revenue, 0);
		const cog1 = (level1.productReports.get(storeId) ?? []).reduce((t, r) => t + r.costOfGoods, 0);
		const rev9 = (level9.productReports.get(storeId) ?? []).reduce((t, r) => t + r.revenue, 0);
		const cog9 = (level9.productReports.get(storeId) ?? []).reduce((t, r) => t + r.costOfGoods, 0);

		expect(rev9).toBeGreaterThan(rev1);
		expect(cog9).toBe(cog1); // cost of goods unaffected by the revenue bonus
	});
```

> Make sure `createRng` is imported in the spec (it already is) and that `rng` is reseeded identically for both runs so unit counts match.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/stock.spec.ts --run`
Expected: FAIL — revenue is identical regardless of level.

- [ ] **Step 3: Apply the multiplier**

In `src/lib/game/stock.ts`, add the import:

```ts
import { getStoreRevenueMultiplier } from './leveling';
```

Inside `simulateProductSalesForCity`, in the per-store loop, compute the multiplier from the **original** store (use `store`, the entry from `input.game.stores`, which carries `level`) and apply it to `revenue` only:

```ts
			const revenueMultiplier = getStoreRevenueMultiplier(store.level);
			const revenue = Math.round(unitsSold * product.sellingPrice * revenueMultiplier);
			const costOfGoods = Math.round(unitsSold * category.importCost);
```

(Leave `unitsSold`, `endingStock`, `capacityRemaining`, and `remainingDemand` math unchanged.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/stock.spec.ts --run`
Expected: PASS.

- [ ] **Step 5: Run the daily-sim suite to confirm no regressions**

Run: `bun run test:unit -- src/lib/game/simulateDay.spec.ts --run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/stock.ts src/lib/game/stock.spec.ts
git commit -m "feat: apply store level revenue multiplier in daily sales"
```

---

### Task 9: Scale industrial throughput by building level

**Files:**
- Modify: `src/lib/game/industryProduction.ts:118-182` (inside `simulateIndustryProduction`)
- Test: `src/lib/game/industryProduction.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/industryProduction.spec.ts` (helpers `buildOnResource`, `simulateIndustryProduction`, `createNewGame` already available; import `getBuildingThroughputMultiplier` if you assert on it):

```ts
	test('building level scales produced output', () => {
		expect.assertions(1);
		const game = { ...buildOnResource(createNewGame('convenience', 20260603), 'grain-field', 'grain-farm'), cash: 1_000_000 };
		const level1 = simulateIndustryProduction(game);
		const leveled = {
			...game,
			industrialBuildings: game.industrialBuildings.map((building) => ({ ...building, level: 6 })) // x2.0
		};
		const level6 = simulateIndustryProduction(leveled);

		const produced1 = level1.report.produced.reduce((total, movement) => total + movement.quantity, 0);
		const produced6 = level6.report.produced.reduce((total, movement) => total + movement.quantity, 0);

		expect(produced6).toBeGreaterThan(produced1);
	});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/game/industryProduction.spec.ts --run`
Expected: FAIL — output identical regardless of level.

- [ ] **Step 3: Apply throughput scaling**

In `src/lib/game/industryProduction.ts`, add the import:

```ts
import { getBuildingThroughputMultiplier } from './leveling';
```

Inside the building loop in `simulateIndustryProduction`, after `const recipe = PRODUCTION_RECIPES[buildingType.recipeId];` (and the null guard), compute the multiplier and scale inputs, outputs, and the recipe operating cost:

```ts
		const throughput = getBuildingThroughputMultiplier(building.level);
```

Scale each input removal quantity:

```ts
			for (const input of recipe.inputs) {
				const scaledQuantity = Math.round(input.quantity * throughput);
				const removal = removeWarehouseMaterial(warehouse, input.materialId, scaledQuantity);
				// ...unchanged below
```

Scale each output quantity:

```ts
			const produced = recipe.outputs.map((output) =>
				createMovement(
					output.materialId,
					Math.round(output.quantity * throughput),
					MATERIALS[output.materialId].localValue,
					'local'
				)
			);
```

Scale the per-run operating cost (leave `buildingType.dailyOperatingCost` flat):

```ts
			const operatingCost = recipe.operatingCost * throughput + buildingType.dailyOperatingCost;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/game/industryProduction.spec.ts --run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/industryProduction.ts src/lib/game/industryProduction.spec.ts
git commit -m "feat: scale industrial throughput by building level"
```

---

### Task 10: Persistence — validate level, relax product validation, migrate legacy saves

**Files:**
- Modify: `src/lib/persistence/saveCodec.ts` (`validateSavedStore`, `validateSavedIndustrialBuilding`, `validateSavedStoreProducts`, `normalizeSavedGame`)
- Test: `src/lib/persistence/saveRepository.spec.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/persistence/saveRepository.spec.ts`:

```ts
	test('accepts a store with a subset of its archetype categories', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260603); // store starts with 1 product
		const snapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave: createAutoSaveRecord(game, new Date('2026-06-03T00:00:00Z')),
			manualSlots: []
		};
		expect(() => validateSaveStoreSnapshot(snapshot)).not.toThrow();
	});

	test('migrates a legacy three-product store to level 7', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260603);
		const legacyStore = {
			...game.stores[0]!,
			products: initializeStoreProducts('convenience', 7) // 3 products
		};
		// strip the level field to simulate a pre-leveling save
		const { level: _omit, ...legacyWithoutLevel } = legacyStore;
		const legacyGame = { ...game, stores: [legacyWithoutLevel] } as unknown;
		const snapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave: createAutoSaveRecord(legacyGame as GameState, new Date('2026-06-03T00:00:00Z')),
			manualSlots: []
		};
		const validated = validateSaveStoreSnapshot(snapshot);
		expect(validated.autoSave!.game.stores[0]!.level).toBe(7);
	});

	test('rejects a store level outside 1..10', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260603);
		const badGame = { ...game, stores: [{ ...game.stores[0]!, level: 99 }] };
		const snapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave: createAutoSaveRecord(badGame, new Date('2026-06-03T00:00:00Z')),
			manualSlots: []
		};
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
	});
```

Ensure `initializeStoreProducts`, `createAutoSaveRecord`, and `GameState` are imported in the spec.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/persistence/saveRepository.spec.ts --run`
Expected: FAIL — subset rejected / level not validated / no migration.

- [ ] **Step 3: Validate the `level` fields**

In `src/lib/persistence/saveCodec.ts`, import the caps at the top:

```ts
import { MAX_STORE_LEVEL, MAX_BUILDING_LEVEL } from '$lib/game/leveling';
```

In `validateSavedStore`, after the `requireString(store.id, ...)` line add:

```ts
	const level = requireNumber(store.level, `${label} level`);
	if (level < 1 || level > MAX_STORE_LEVEL) {
		throw new SaveDataError(`${label} level must be between 1 and ${MAX_STORE_LEVEL}`);
	}
```

In `validateSavedIndustrialBuilding`, after `requireString(building.id, ...)` add:

```ts
	const level = requireNumber(building.level, `${label} level`);
	if (level < 1 || level > MAX_BUILDING_LEVEL) {
		throw new SaveDataError(`${label} level must be between 1 and ${MAX_BUILDING_LEVEL}`);
	}
```

- [ ] **Step 4: Relax product-set validation to a non-empty subset**

In `validateSavedStoreProducts`, replace the final "must include all categories" block with a non-empty subset check:

```ts
		if (products.length === 0) {
			throw new SaveDataError(`${label} products must include at least one category`);
		}

		if (products.length > expectedCategoryIds.length) {
			throw new SaveDataError(
				`${label} products must not exceed archetype categories: ${expectedCategoryIds.join(', ')}`
			);
		}
```

(Keep the existing per-product validation, the unknown-category check, and the duplicate-category check.)

- [ ] **Step 5: Migrate legacy stores/buildings in `normalizeSavedGame`**

In `normalizeSavedGame`, before the `return { ...game, world, storeCap }`, normalize store and building levels:

```ts
	const normalizedStores = Array.isArray(game.stores)
		? game.stores.map((store) => normalizeSavedStoreLevel(store))
		: game.stores;
	const normalizedBuildings = Array.isArray(game.industrialBuildings)
		? game.industrialBuildings.map((building) => normalizeSavedBuildingLevel(building))
		: game.industrialBuildings;
```

and include them in the returned object:

```ts
	return {
		...game,
		stores: normalizedStores,
		industrialBuildings: normalizedBuildings,
		world: normalizedWorld,
		storeCap: normalizedStoreCap
	} as GameState;
```

Add the helpers near the other normalize functions:

```ts
const LEGACY_LEVEL_BY_PRODUCT_COUNT: Record<number, number> = { 1: 1, 2: 4, 3: 7, 4: 10 };

function normalizeSavedStoreLevel(store: unknown): unknown {
	if (typeof store !== 'object' || store === null) {
		return store;
	}

	const record = store as Record<string, unknown>;
	if (record.level !== undefined) {
		return record;
	}

	const productCount = Array.isArray(record.products) ? record.products.length : 1;
	return { ...record, level: LEGACY_LEVEL_BY_PRODUCT_COUNT[productCount] ?? 1 };
}

function normalizeSavedBuildingLevel(building: unknown): unknown {
	if (typeof building !== 'object' || building === null) {
		return building;
	}

	const record = building as Record<string, unknown>;
	return record.level === undefined ? { ...record, level: 1 } : record;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/persistence/saveRepository.spec.ts --run`
Expected: PASS.

- [ ] **Step 7: Run the full unit suite + type check**

Run: `bun run test:unit -- --run` then `bun run check`
Expected: PASS / 0 errors.

- [ ] **Step 8: Commit**

```bash
git add src/lib/persistence/saveCodec.ts src/lib/persistence/saveRepository.spec.ts
git commit -m "feat: persist and migrate store/building levels"
```

---

### Task 11: Store Upgrade UI in `TileInspector`

**Files:**
- Modify: `src/lib/components/game/TileInspector.svelte`
- Modify: `src/routes/+page.svelte` (pass the new prop — completed in Task 13; here add the prop with a default no-op so the component compiles/tests standalone)
- Test: `src/lib/components/game/TileInspector.svelte.spec.ts`

- [ ] **Step 1: Svelte docs lookup**

Use the Svelte MCP: call `list-sections`, then `get-documentation` for the sections covering `$props`, `$derived`, and event handlers/`onclick`. Read before editing.

- [ ] **Step 2: Write the failing test**

Add to `src/lib/components/game/TileInspector.svelte.spec.ts` a test that renders the inspector with a store on the Details tab and asserts the level text and an enabled Upgrade button that fires `onUpgradeStore`. Match the existing render/setup pattern in that spec file. Core assertions:

```ts
	test('shows store level and fires upgrade callback', async () => {
		expect.assertions(2);
		// ...render TileInspector with a level-2 store, cash high enough, onUpgradeStore spy
		const heading = page.getByText(/Level 2 \/ 10/i);
		await expect.element(heading).toBeInTheDocument();
		const button = page.getByRole('button', { name: /Upgrade/i });
		await button.click();
		expect(onUpgradeStore).toHaveBeenCalledWith(storeId);
	});
```

(Adapt `page`/render imports to the file's existing harness, e.g. `vitest-browser-svelte`.)

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/components/game/TileInspector.svelte.spec.ts --run`
Expected: FAIL — no level text / no upgrade button.

- [ ] **Step 4: Implement the UI**

In `TileInspector.svelte`:

1. Add to the imports:
```ts
	import {
		MAX_STORE_LEVEL,
		canUpgradeStore,
		getStoreUpgradeCost,
		getUnlockedCategoryCount,
		isMilestoneLevel
	} from '$lib/game/leveling';
```

2. Add `onUpgradeStore` to the `Props` interface and destructuring (default no-op):
```ts
		onUpgradeStore?: (storeId: string) => void;
```
```ts
		onUpgradeStore = () => {},
```

3. Add derived helpers in the `<script>`:
```ts
	const upgradeCost = $derived(store ? getStoreUpgradeCost(store.level) : 0);
	const canAffordUpgrade = $derived(store ? game.cash >= upgradeCost : false);
	const storeCanUpgrade = $derived(store ? canUpgradeStore(store.level) : false);
	const nextBenefit = $derived.by(() => {
		if (!store || !storeCanUpgrade) return 'Max level';
		return isMilestoneLevel(store.level + 1)
			? `Unlocks product #${getUnlockedCategoryCount(store.level + 1)} + 1 staff`
			: '+10% revenue';
	});
```

4. In the Details tab panel (after the `<dl>` that shows stock/morale/rows), add:
```svelte
					<div class="store-level">
						<p class="level-label">Level {store.level} / {MAX_STORE_LEVEL}</p>
						<p class="level-next">Next: {nextBenefit}</p>
						<button
							type="button"
							class="upgrade"
							disabled={!storeCanUpgrade || !canAffordUpgrade}
							onclick={() => onUpgradeStore(store.id)}
						>
							{storeCanUpgrade ? `Upgrade — ${currency.format(upgradeCost)}` : 'Max level'}
						</button>
						{#if storeCanUpgrade && !canAffordUpgrade}
							<p class="level-hint">Not enough cash.</p>
						{/if}
					</div>
```

5. Add minimal styles consistent with the file (a `.store-level` grid, `.upgrade` button styled like other buttons). Keep `:disabled` visibly muted.

- [ ] **Step 5: Run the Svelte autofixer**

Run the Svelte MCP `svelte-autofixer` on the modified component markup/script until it reports no issues.

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/components/game/TileInspector.svelte.spec.ts --run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts
git commit -m "feat: add store upgrade control to tile inspector"
```

---

### Task 12: Building Upgrade UI in `IndustryTileInspector`

**Files:**
- Modify: `src/lib/components/game/IndustryTileInspector.svelte`
- Test: `src/lib/components/game/IndustryTileInspector.svelte.spec.ts`

- [ ] **Step 1: Svelte docs lookup**

Use the Svelte MCP `list-sections` / `get-documentation` for `$props`, `$derived`, and `onclick` if not already fresh from Task 11.

- [ ] **Step 2: Write the failing test**

Add to `src/lib/components/game/IndustryTileInspector.svelte.spec.ts` a test rendering the inspector with a `building` (level 1) and high cash, asserting the level text and that clicking Upgrade fires `onUpgradeBuilding(buildingId)`. Mirror Task 11's assertions and the file's existing harness:

```ts
	test('shows building level and fires upgrade callback', async () => {
		expect.assertions(2);
		const level = page.getByText(/Level 1 \/ 10/i);
		await expect.element(level).toBeInTheDocument();
		const button = page.getByRole('button', { name: /Upgrade/i });
		await button.click();
		expect(onUpgradeBuilding).toHaveBeenCalledWith(buildingId);
	});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bun run test:unit -- src/lib/components/game/IndustryTileInspector.svelte.spec.ts --run`
Expected: FAIL.

- [ ] **Step 4: Implement the UI**

In `IndustryTileInspector.svelte`:

1. Add imports:
```ts
	import {
		MAX_BUILDING_LEVEL,
		canUpgradeBuilding,
		getBuildingThroughputMultiplier,
		getBuildingUpgradeCost
	} from '$lib/game/leveling';
```

2. Add `onUpgradeBuilding?: (buildingId: string) => void;` to `Props`, and `onUpgradeBuilding = () => {},` to the destructuring.

3. Add derived helpers (guard on `building`):
```ts
	const buildingUpgradeCost = $derived(building ? getBuildingUpgradeCost(building.level) : 0);
	const buildingCanUpgrade = $derived(building ? canUpgradeBuilding(building.level) : false);
	const canAffordBuildingUpgrade = $derived(building ? game.cash >= buildingUpgradeCost : false);
	const throughput = $derived(building ? getBuildingThroughputMultiplier(building.level) : 1);
```

4. In the building section of the markup (where `buildingType` details render), add a level block:
```svelte
				<div class="building-level">
					<p class="level-label">Level {building.level} / {MAX_BUILDING_LEVEL}</p>
					<p class="level-next">{throughput.toFixed(1)}× output</p>
					<button
						type="button"
						class="upgrade"
						disabled={!buildingCanUpgrade || !canAffordBuildingUpgrade}
						onclick={() => onUpgradeBuilding(building.id)}
					>
						{buildingCanUpgrade ? `Upgrade — ${currency.format(buildingUpgradeCost)}` : 'Max level'}
					</button>
					{#if buildingCanUpgrade && !canAffordBuildingUpgrade}
						<p class="level-hint">Not enough cash.</p>
					{/if}
				</div>
```

5. Add minimal styles consistent with the component.

- [ ] **Step 5: Run the Svelte autofixer**

Run Svelte MCP `svelte-autofixer` until clean.

- [ ] **Step 6: Run test to verify it passes**

Run: `bun run test:unit -- src/lib/components/game/IndustryTileInspector.svelte.spec.ts --run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/game/IndustryTileInspector.svelte src/lib/components/game/IndustryTileInspector.svelte.spec.ts
git commit -m "feat: add building upgrade control to industry inspector"
```

---

### Task 13: Wire the upgrade callbacks in `+page.svelte`

**Files:**
- Modify: `src/routes/+page.svelte` (imports, handler functions, component props)

- [ ] **Step 1: Add imports and handlers**

In `src/routes/+page.svelte` `<script>`:

1. Extend the `state.ts` import to include `upgradeStore`:
```ts
	import { DEFAULT_POLICY, resolveDecision, updatePolicy, upgradeStore } from '$lib/game/state';
```

2. Add an import for `upgradeBuilding`:
```ts
	import { buildIndustrialBuilding, upgradeBuilding } from '$lib/game/industryPlacement';
```
(Combine with the existing `industryPlacement` import if one already exists — do not duplicate the module import.)

3. Add handler functions next to the other `setGameAndAutosave` handlers (e.g. near `updateProductHandler` ~line 583):
```ts
	function upgradeStoreHandler(storeId: string): void {
		if (game) {
			setGameAndAutosave(upgradeStore(game, storeId));
		}
	}

	function upgradeBuildingHandler(buildingId: string): void {
		if (game) {
			setGameAndAutosave(upgradeBuilding(game, buildingId));
		}
	}
```
(Use the same `game`-guard idiom the surrounding handlers use; match the exact local variable name in that scope.)

- [ ] **Step 2: Pass the props to the inspectors**

On the `<TileInspector ... />` usage (~line 905), add:
```svelte
				onUpgradeStore={upgradeStoreHandler}
```

On the `<IndustryTileInspector ... />` usage, add:
```svelte
				onUpgradeBuilding={upgradeBuildingHandler}
```

- [ ] **Step 3: Type-check and run the full unit suite**

Run: `bun run check`
Expected: 0 errors.

Run: `bun run test:unit -- --run`
Expected: PASS.

- [ ] **Step 4: Lint**

Run: `bun run lint`
Expected: PASS (run `bun run format` first if Prettier reports formatting).

- [ ] **Step 5: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "feat: wire store and building upgrade controls"
```

---

### Task 14: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite**

Run: `bun run test:unit -- --run`
Expected: PASS.

- [ ] **Step 2: Type + lint**

Run: `bun run check && bun run lint`
Expected: PASS / 0 errors.

- [ ] **Step 3: E2e smoke (optional but recommended)**

Run: `bun run test:e2e -- src/routes/retail-sim.e2e.ts`
Expected: PASS. If the canvas `data-*` sprite-count asserts changed because stores now start with fewer products, update only the affected assertions in the e2e file (the starter city base sprite count = 400 is unaffected; store-sprite counts are driven by store count, not product count, so this should remain green).

- [ ] **Step 4: Final commit (only if Step 3 required e2e edits)**

```bash
git add src/routes/retail-sim.e2e.ts
git commit -m "test: update e2e assertions for store leveling"
```

---

## Self-review notes (for the implementer)

- **Circular imports:** `leveling.ts` imports nothing from game modules. `stock.ts`, `staffing.ts`, `state.ts`, `industryPlacement.ts`, `industryProduction.ts`, and `saveCodec.ts` import *from* `leveling.ts` only. No cycles.
- **Naming is consistent across tasks:** `upgradeStore`, `upgradeBuilding`, `getStoreRevenueMultiplier`, `getBuildingThroughputMultiplier`, `getUnlockedCategoryCount`, `getStoreUpgradeCost`, `getBuildingUpgradeCost`, `createStoreProduct`, `getStaffingRequirement(archetypeId, level)`.
- **Spec coverage:** types (T2), 4th category (T3), 1-product start (T4), staffing scale (T5), upgradeStore incl. milestone product+capacity (T6), upgradeBuilding (T7), revenue-only multiplier (T8), whole-throughput scaling (T9), persistence validate+relax+migrate (T10), both inspector UIs (T11/T12), wiring (T13), verification (T14).
```
