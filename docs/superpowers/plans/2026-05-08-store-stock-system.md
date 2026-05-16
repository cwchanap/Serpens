# Store Stock System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add category-level stock tables for individual stores, with player-managed selling prices, reorder thresholds, target stock, weekly imports, and city-wide shared demand.

**Architecture:** Keep stock as pure game state on each `Store` through `Store.products`, with fixed product definitions on each archetype. Add `src/lib/game/stock.ts` as the stock rules module, use it from `state.ts` and `simulateDay.ts`, validate the new shape in `saveCodec.ts`, and expose the management surface through the selected store's tile inspector using a focused `StoreStockTable.svelte` child component.

**Tech Stack:** TypeScript, SvelteKit/Svelte 5 runes, Bun, Vitest server/browser projects, Playwright e2e, existing deterministic RNG utilities, official Svelte MCP workflow for Svelte edits.

---

## File Structure

- Modify `src/lib/game/types.ts`: extend `ProductCategory`, add `StoreProduct`, `StoreProductPatch`, `DailyProductReport`, and import-spend fields.
- Modify `src/lib/game/archetypes.ts`: add stock defaults to every starting category while preserving any legacy fields needed until simulation is replaced.
- Create `src/lib/game/stock.ts`: own stock row initialization, product lookup, stock setting updates, stock health, city demand pools, weekly import helpers, and product-level sales allocation.
- Create `src/lib/game/stock.spec.ts`: focused rules tests for initialization, updates, shared demand, price sensitivity, weekly imports, and stock health.
- Modify `src/lib/game/state.ts`: initialize `products` for founding and expansion stores, export/use the stock update transition.
- Modify `src/lib/game/state.spec.ts`: assert founding games and direct expansion stores get product rows.
- Modify `src/lib/game/placement.spec.ts`: assert tile-based expansion stores get selected-archetype product rows.
- Modify `src/lib/game/simulateDay.ts`: replace average category sales with stock module product simulation, aggregate product reports, include import spend, and derive stock health.
- Modify `src/lib/game/simulateDay.spec.ts`: update existing expectations and add tests for import-day cash, shared demand, and price effects.
- Modify `src/lib/persistence/saveTypes.ts`: bump `SAVE_SCHEMA_VERSION`.
- Modify `src/lib/persistence/saveCodec.ts`: validate `Store.products`, `DailyProductReport`, and import-spend fields.
- Modify `src/lib/persistence/saveRepository.spec.ts` and `src/lib/persistence/tauriSaveRepository.spec.ts`: update current game/report fixtures for the new shape.
- Create `src/lib/components/game/StoreStockTable.svelte`: render and edit one selected store's product rows.
- Create `src/lib/components/game/StoreStockTable.svelte.spec.ts`: browser component tests for stock table rendering and callbacks.
- Modify `src/lib/components/game/TileInspector.svelte`: import/render `StoreStockTable`, receive latest store report and stock update callback, and stop showing store-local demand as the relevant stock signal.
- Modify `src/lib/components/game/TileInspector.svelte.spec.ts`: update store fixtures and assert stock table integration.
- Modify `src/lib/components/game/StoreOverview.svelte` and `src/lib/components/game/ReportsPanel.svelte`: surface stock/import summary without adding detailed management outside the tile inspector.
- Modify `src/routes/+page.svelte`: wire latest selected store report and `updateStoreProduct` through autosave.
- Modify `src/routes/retail-sim.e2e.ts`: add a stock-management flow from selected store tile through a weekly import day.

Before editing, check:

```bash
git status --short
```

Expected: clean, or only unrelated user changes. Do not revert unrelated changes.

---

### Task 1: Stock Types, Defaults, Initialization, And Update Transition

**Files:**

- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/archetypes.ts`
- Create: `src/lib/game/stock.ts`
- Create: `src/lib/game/stock.spec.ts`
- Modify: `src/lib/game/state.ts`
- Modify: `src/lib/game/state.spec.ts`
- Modify: `src/lib/game/placement.spec.ts`
- Modify fixtures in: `src/lib/components/game/StaffPanel.svelte.spec.ts`, `src/lib/components/game/StoreOverview.svelte.spec.ts`, `src/lib/components/game/TileInspector.svelte.spec.ts`

- [ ] **Step 1: Write failing stock initialization and update tests**

Create `src/lib/game/stock.spec.ts`:

```ts
import { describe, expect, test } from 'vitest';
import { createNewGame } from './state';
import {
	calculateStockHealth,
	getStoreProductStatus,
	initializeStoreProducts,
	updateStoreProduct
} from './stock';
import type { GameState, StoreProduct } from './types';

function withOneStoreProducts(products: StoreProduct[]): GameState {
	const game = createNewGame('convenience', 20260508);

	return {
		...game,
		stores: [
			{
				...game.stores[0]!,
				products
			}
		]
	};
}

describe('stock rules', () => {
	test('initializes store products from archetype category defaults', () => {
		expect.assertions(7);
		const products = initializeStoreProducts('convenience');

		expect(products.map((product) => product.categoryId)).toEqual([
			'snacks',
			'drinks',
			'essentials'
		]);
		expect(products.every((product) => product.stock > 0)).toBe(true);
		expect(products.every((product) => product.reorderThreshold >= 0)).toBe(true);
		expect(products.every((product) => product.targetStock >= product.reorderThreshold)).toBe(true);
		expect(products.every((product) => product.sellingPrice > 0)).toBe(true);
		expect(new Set(products.map((product) => product.categoryId)).size).toBe(products.length);
		expect(products[0]).toEqual({
			categoryId: 'snacks',
			stock: 70,
			reorderThreshold: 25,
			targetStock: 90,
			sellingPrice: 5
		});
	});

	test('updates a store product immutably and clamps numeric input', () => {
		expect.assertions(8);
		const game = withOneStoreProducts([
			{
				categoryId: 'snacks',
				stock: 8,
				reorderThreshold: 12,
				targetStock: 30,
				sellingPrice: 5
			}
		]);

		const updated = updateStoreProduct(game, 'store-1', 'snacks', {
			sellingPrice: -4,
			reorderThreshold: 40,
			targetStock: 35
		});
		const product = updated.stores[0]!.products[0]!;

		expect(updated).not.toBe(game);
		expect(updated.stores[0]).not.toBe(game.stores[0]);
		expect(product.sellingPrice).toBe(1);
		expect(product.reorderThreshold).toBe(40);
		expect(product.targetStock).toBe(40);
		expect(game.stores[0]!.products[0]!.sellingPrice).toBe(5);
		expect(updateStoreProduct(game, 'missing-store', 'snacks', { sellingPrice: 6 })).toBe(game);
		expect(updateStoreProduct(game, 'store-1', 'missing-category', { sellingPrice: 6 })).toBe(game);
	});

	test('describes stock status from current threshold and stock', () => {
		expect.assertions(3);

		expect(getStoreProductStatus({ stock: 0, reorderThreshold: 10 })).toBe('Out of stock');
		expect(getStoreProductStatus({ stock: 9, reorderThreshold: 10 })).toBe('Needs import');
		expect(getStoreProductStatus({ stock: 10, reorderThreshold: 10 })).toBe('Healthy');
	});

	test('calculates stock health from product stock ratios', () => {
		expect.assertions(3);

		expect(calculateStockHealth([])).toBe(100);
		expect(
			calculateStockHealth([
				{
					categoryId: 'snacks',
					stock: 50,
					reorderThreshold: 20,
					targetStock: 100,
					sellingPrice: 5
				},
				{
					categoryId: 'drinks',
					stock: 100,
					reorderThreshold: 20,
					targetStock: 100,
					sellingPrice: 4
				}
			])
		).toBe(75);
		expect(
			calculateStockHealth([
				{ categoryId: 'snacks', stock: 0, reorderThreshold: 20, targetStock: 100, sellingPrice: 5 }
			])
		).toBe(0);
	});
});
```

Add or update state/placement tests:

```ts
test('creates product stock rows for the founding store', () => {
	expect.assertions(3);
	const game = createNewGame('grocery', 20260508);
	const store = game.stores[0]!;

	expect(store.products.map((product) => product.categoryId)).toEqual([
		'produce',
		'pantry',
		'prepared'
	]);
	expect(store.products.every((product) => product.stock > 0)).toBe(true);
	expect(store.stockHealth).toBe(calculateStockHealth(store.products));
});

test('direct store opening initializes rows for the selected expansion archetype', () => {
	expect.assertions(2);
	const game = createNewGame('boutique', 44);
	const result = openStore(game, {
		name: 'Tech Kiosk',
		archetypeId: 'electronics',
		location: 'West Mall'
	});

	expect(result.stores.at(-1)?.archetypeId).toBe('electronics');
	expect(result.stores.at(-1)?.products.map((product) => product.categoryId)).toEqual([
		'games',
		'accessories',
		'devices'
	]);
});
```

- [ ] **Step 2: Run focused tests to verify they fail**

Run:

```bash
bun run test:unit -- src/lib/game/stock.spec.ts src/lib/game/state.spec.ts src/lib/game/placement.spec.ts --run
```

Expected: FAIL with missing `src/lib/game/stock.ts`, missing `Store.products`, and missing stock exports.

- [ ] **Step 3: Add stock types**

Modify `src/lib/game/types.ts`:

```ts
export interface ProductCategory {
	id: string;
	name: string;
	baseDemand: number;
	margin: number;
	demandWeight: number;
	importCost: number;
	defaultSellingPrice: number;
	priceSensitivity: number;
}

export interface StoreProduct {
	categoryId: string;
	stock: number;
	reorderThreshold: number;
	targetStock: number;
	sellingPrice: number;
}

export interface StoreProductPatch {
	sellingPrice?: number;
	reorderThreshold?: number;
	targetStock?: number;
}
```

Add `products: StoreProduct[];` to `Store`.

- [ ] **Step 4: Add category stock defaults**

Modify every `startingCategories` row in `src/lib/game/archetypes.ts`. Use these first-slice values:

```ts
{ id: 'snacks', name: 'Snacks', baseDemand: 72, margin: 0.34, demandWeight: 1, importCost: 3, defaultSellingPrice: 5, priceSensitivity: 0.9 },
{ id: 'drinks', name: 'Drinks', baseDemand: 88, margin: 0.3, demandWeight: 1.15, importCost: 2, defaultSellingPrice: 4, priceSensitivity: 0.8 },
{ id: 'essentials', name: 'Essentials', baseDemand: 45, margin: 0.22, demandWeight: 0.8, importCost: 6, defaultSellingPrice: 8, priceSensitivity: 0.45 },
{ id: 'apparel', name: 'Apparel', baseDemand: 36, margin: 0.5, demandWeight: 1, importCost: 18, defaultSellingPrice: 38, priceSensitivity: 1.05 },
{ id: 'home-goods', name: 'Home Goods', baseDemand: 30, margin: 0.44, demandWeight: 0.85, importCost: 14, defaultSellingPrice: 28, priceSensitivity: 0.85 },
{ id: 'gifts', name: 'Gifts', baseDemand: 26, margin: 0.48, demandWeight: 0.75, importCost: 9, defaultSellingPrice: 20, priceSensitivity: 0.95 },
{ id: 'games', name: 'Games', baseDemand: 40, margin: 0.28, demandWeight: 1, importCost: 32, defaultSellingPrice: 48, priceSensitivity: 0.75 },
{ id: 'accessories', name: 'Accessories', baseDemand: 34, margin: 0.42, demandWeight: 0.9, importCost: 11, defaultSellingPrice: 22, priceSensitivity: 0.9 },
{ id: 'devices', name: 'Devices', baseDemand: 18, margin: 0.24, demandWeight: 0.55, importCost: 180, defaultSellingPrice: 240, priceSensitivity: 0.5 },
{ id: 'produce', name: 'Produce', baseDemand: 64, margin: 0.26, demandWeight: 1, importCost: 2, defaultSellingPrice: 4, priceSensitivity: 0.7 },
{ id: 'pantry', name: 'Pantry', baseDemand: 74, margin: 0.24, demandWeight: 1.1, importCost: 3, defaultSellingPrice: 6, priceSensitivity: 0.55 },
{ id: 'prepared', name: 'Prepared Food', baseDemand: 38, margin: 0.38, demandWeight: 0.75, importCost: 5, defaultSellingPrice: 10, priceSensitivity: 0.85 }
```

Keep `baseDemand` and `margin` for now so existing simulation helpers compile until Task 2 replaces their use.

- [ ] **Step 5: Create stock initialization and update helpers**

Create `src/lib/game/stock.ts`:

```ts
import { getArchetype } from './archetypes';
import { clampScore } from './reports';
import type { ArchetypeId, GameState, StoreProduct, StoreProductPatch } from './types';

export type StoreProductStatus = 'Out of stock' | 'Needs import' | 'Healthy';

export function initializeStoreProducts(archetypeId: ArchetypeId): StoreProduct[] {
	return getArchetype(archetypeId).startingCategories.map((category) => ({
		categoryId: category.id,
		stock: Math.max(1, Math.round(category.demandWeight * 70)),
		reorderThreshold: Math.max(0, Math.round(category.demandWeight * 25)),
		targetStock: Math.max(1, Math.round(category.demandWeight * 90)),
		sellingPrice: category.defaultSellingPrice
	}));
}

export function updateStoreProduct(
	game: GameState,
	storeId: string,
	categoryId: string,
	patch: StoreProductPatch
): GameState {
	const store = game.stores.find((candidate) => candidate.id === storeId);

	if (!store || !store.products.some((product) => product.categoryId === categoryId)) {
		return game;
	}

	return {
		...game,
		stores: game.stores.map((candidate) => {
			if (candidate.id !== storeId) {
				return candidate;
			}

			const products = candidate.products.map((product) =>
				product.categoryId === categoryId ? clampProductPatch(product, patch) : product
			);

			return {
				...candidate,
				products,
				stockHealth: calculateStockHealth(products)
			};
		})
	};
}

export function getStoreProductStatus(input: {
	stock: number;
	reorderThreshold: number;
}): StoreProductStatus {
	if (input.stock <= 0) {
		return 'Out of stock';
	}

	if (input.stock < input.reorderThreshold) {
		return 'Needs import';
	}

	return 'Healthy';
}

export function calculateStockHealth(products: StoreProduct[]): number {
	if (products.length === 0) {
		return 100;
	}

	const averageRatio =
		products.reduce((sum, product) => {
			const target = Math.max(1, product.targetStock);
			return sum + Math.max(0, Math.min(1, product.stock / target));
		}, 0) / products.length;

	return clampScore(averageRatio * 100);
}

function clampProductPatch(product: StoreProduct, patch: StoreProductPatch): StoreProduct {
	const sellingPrice =
		patch.sellingPrice === undefined
			? product.sellingPrice
			: Math.max(1, Math.round(finiteOr(product.sellingPrice, patch.sellingPrice)));
	const reorderThreshold =
		patch.reorderThreshold === undefined
			? product.reorderThreshold
			: Math.max(0, Math.round(finiteOr(product.reorderThreshold, patch.reorderThreshold)));
	const requestedTarget =
		patch.targetStock === undefined
			? product.targetStock
			: Math.max(0, Math.round(finiteOr(product.targetStock, patch.targetStock)));

	return {
		...product,
		sellingPrice,
		reorderThreshold,
		targetStock: Math.max(reorderThreshold, requestedTarget)
	};
}

function finiteOr(fallback: number, value: number): number {
	return Number.isFinite(value) ? value : fallback;
}
```

- [ ] **Step 6: Initialize products in store creation**

Modify `createStore` in `src/lib/game/state.ts`:

```ts
import { calculateStockHealth, initializeStoreProducts } from './stock';
```

Inside `createStore`, before `return`, create products:

```ts
const products = initializeStoreProducts(input.archetypeId);
```

Add to the returned store:

```ts
products,
stockHealth: calculateStockHealth(products),
```

Remove the old random `stockHealth` assignment in the same returned object so the product table is authoritative for stock health.

- [ ] **Step 7: Update existing Store test fixtures**

For every test literal typed as `Store`, add `products` from the relevant archetype:

```ts
products: initializeStoreProducts('boutique'),
```

Use the same archetype as the fixture's `archetypeId`.

Import path rule:

- Svelte component specs under `src/lib/components/game/` use `$lib/game/stock`.
- Game specs under `src/lib/game/` use `./stock`.

- [ ] **Step 8: Run focused tests**

Run:

```bash
bun run test:unit -- src/lib/game/stock.spec.ts src/lib/game/state.spec.ts src/lib/game/placement.spec.ts src/lib/components/game/StaffPanel.svelte.spec.ts src/lib/components/game/StoreOverview.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts --run
```

Expected: PASS.

- [ ] **Step 9: Run type check**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/archetypes.ts src/lib/game/stock.ts src/lib/game/stock.spec.ts src/lib/game/state.ts src/lib/game/state.spec.ts src/lib/game/placement.spec.ts src/lib/components/game/StaffPanel.svelte.spec.ts src/lib/components/game/StoreOverview.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts
git commit -m "feat: add store product stock rows"
```

---

### Task 2: City-Wide Demand, Product Sales, Weekly Imports, And Daily Reports

**Files:**

- Modify: `src/lib/game/types.ts`
- Modify: `src/lib/game/stock.ts`
- Modify: `src/lib/game/stock.spec.ts`
- Modify: `src/lib/game/simulateDay.ts`
- Modify: `src/lib/game/simulateDay.spec.ts`
- Modify: `src/lib/game/reports.spec.ts`

- [ ] **Step 1: Add report types and failing stock simulation tests**

Modify `src/lib/game/types.ts`:

```ts
export interface DailyProductReport {
	categoryId: string;
	name: string;
	unitsSold: number;
	demandMissed: number;
	revenue: number;
	costOfGoods: number;
	grossMargin: number;
	endingStock: number;
	importedUnits: number;
	importCost: number;
	importSpend: number;
}
```

Add to `DailyStoreReport`:

```ts
importSpend: number;
productReports: DailyProductReport[];
```

Add to `DailyReport`:

```ts
importSpend: number;
```

Append tests to `src/lib/game/stock.spec.ts`:

```ts
import { createRng } from './rng';
import {
	applyWeeklyImports,
	buildCityDemandPools,
	isImportDay,
	simulateProductSalesForCity
} from './stock';

test('builds city-wide demand pools from city demand and product weights', () => {
	expect.assertions(2);
	const game = createNewGame('convenience', 20260508);
	const pools = buildCityDemandPools(game, game.cities[0]!);

	expect(pools.snacks).toBeGreaterThan(0);
	expect(pools.drinks).toBeGreaterThan(pools.essentials ?? 0);
});

test('shared city demand is consumed across stores selling the same category', () => {
	expect.assertions(4);
	const game = createNewGame('convenience', 20260508);
	const firstStore = {
		...game.stores[0]!,
		stockHealth: 100,
		products: [
			{
				categoryId: 'snacks',
				stock: 100,
				reorderThreshold: 10,
				targetStock: 100,
				sellingPrice: 5
			}
		]
	};
	const secondStore = {
		...firstStore,
		id: 'store-2',
		name: 'Second Store',
		tileId: 'store-2-tile'
	};
	const result = simulateProductSalesForCity({
		game: { ...game, stores: [firstStore, secondStore] },
		city: game.cities[0]!,
		rng: createRng(5),
		storeCapacity: new Map([
			[firstStore.id, 100],
			[secondStore.id, 100]
		])
	});
	const sold = [...result.productReports.values()]
		.flat()
		.reduce((sum, report) => sum + report.unitsSold, 0);

	expect(result.productReports.get(firstStore.id)?.[0]?.unitsSold).toBeGreaterThan(0);
	expect(result.productReports.get(secondStore.id)?.[0]?.unitsSold).toBeGreaterThan(0);
	expect(sold).toBeLessThanOrEqual(result.initialDemand.snacks ?? 0);
	expect(result.remainingDemand.snacks).toBe((result.initialDemand.snacks ?? 0) - sold);
});

test('higher selling price reduces category units sold under stable conditions', () => {
	expect.assertions(1);
	const game = createNewGame('convenience', 20260508);
	const baseStore = {
		...game.stores[0]!,
		products: [
			{ categoryId: 'snacks', stock: 100, reorderThreshold: 10, targetStock: 100, sellingPrice: 5 }
		]
	};
	const premiumStore = {
		...baseStore,
		products: [{ ...baseStore.products[0]!, sellingPrice: 10 }]
	};
	const standard = simulateProductSalesForCity({
		game: { ...game, stores: [baseStore] },
		city: game.cities[0]!,
		rng: createRng(12),
		storeCapacity: new Map([[baseStore.id, 100]])
	});
	const premium = simulateProductSalesForCity({
		game: { ...game, stores: [premiumStore] },
		city: game.cities[0]!,
		rng: createRng(12),
		storeCapacity: new Map([[premiumStore.id, 100]])
	});

	expect(premium.productReports.get(premiumStore.id)?.[0]?.unitsSold).toBeLessThan(
		standard.productReports.get(baseStore.id)?.[0]?.unitsSold ?? 0
	);
});

test('weekly imports refill below-threshold rows to target and report spend', () => {
	expect.assertions(6);
	const game = createNewGame('convenience', 20260508);
	const store = {
		...game.stores[0]!,
		products: [
			{ categoryId: 'snacks', stock: 4, reorderThreshold: 10, targetStock: 25, sellingPrice: 5 }
		]
	};
	const result = applyWeeklyImports({
		game: { ...game, stores: [store] },
		storeReports: new Map([
			[
				store.id,
				[
					{
						categoryId: 'snacks',
						name: 'Snacks',
						unitsSold: 0,
						demandMissed: 0,
						revenue: 0,
						costOfGoods: 0,
						grossMargin: 0,
						endingStock: 4,
						importedUnits: 0,
						importCost: 3,
						importSpend: 0
					}
				]
			]
		])
	});
	const product = result.stores[0]!.products[0]!;
	const report = result.productReports.get(store.id)![0]!;

	expect(isImportDay(7)).toBe(true);
	expect(product.stock).toBe(25);
	expect(report.endingStock).toBe(25);
	expect(report.importedUnits).toBe(21);
	expect(report.importSpend).toBe(63);
	expect(result.importSpend).toBe(63);
});
```

- [ ] **Step 2: Run stock tests to verify they fail**

Run:

```bash
bun run test:unit -- src/lib/game/stock.spec.ts --run
```

Expected: FAIL with missing `buildCityDemandPools`, `simulateProductSalesForCity`, `applyWeeklyImports`, `isImportDay`, and report fields.

- [ ] **Step 3: Implement stock demand, sales, and import helpers**

Add to `src/lib/game/stock.ts`:

```ts
import { getTilePlacementBlockReason } from './city';
import { randomBetween, type Rng } from './rng';
import type { City, CompanyPolicy, DailyProductReport, ProductCategory, Store } from './types';

export const IMPORT_INTERVAL_DAYS = 7;

export interface ProductSalesResult {
	stores: Store[];
	productReports: Map<string, DailyProductReport[]>;
	initialDemand: Record<string, number>;
	remainingDemand: Record<string, number>;
}

export interface WeeklyImportResult {
	stores: Store[];
	productReports: Map<string, DailyProductReport[]>;
	importSpend: number;
}

export function isImportDay(day: number): boolean {
	return day > 0 && day % IMPORT_INTERVAL_DAYS === 0;
}

export function buildCityDemandPools(
	game: Pick<GameState, 'stores'>,
	city: City,
	policy: Pick<CompanyPolicy, 'marketing' | 'pricing'> = {
		marketing: 'awareness',
		pricing: 'standard'
	}
): Record<string, number> {
	const buildableTiles = city.tiles.filter((tile) => !getTilePlacementBlockReason(tile));
	const cityDemand =
		buildableTiles.reduce(
			(sum, tile) => sum + tile.demand + tile.footTraffic * 0.6 + tile.customerFit * 0.35,
			0
		) / Math.max(1, buildableTiles.length);
	const categories = getCityStoreCategories(
		game.stores.filter((store) => store.cityId === city.id)
	);
	const marketingMultiplier =
		policy.marketing === 'none' ? 0.92 : policy.marketing === 'promotions' ? 1.16 : 1.06;
	const pricingMultiplier =
		policy.pricing === 'discount' ? 1.08 : policy.pricing === 'premium' ? 0.93 : 1;

	return Object.fromEntries(
		categories.map((category) => [
			category.id,
			Math.max(
				0,
				Math.round(cityDemand * category.demandWeight * marketingMultiplier * pricingMultiplier)
			)
		])
	);
}

export function simulateProductSalesForCity(input: {
	game: GameState;
	city: City;
	rng: Rng;
	storeCapacity: Map<string, number>;
}): ProductSalesResult {
	const initialDemand = buildCityDemandPools(input.game, input.city, input.game.policy);
	const remainingDemand = { ...initialDemand };
	const reports = new Map<string, DailyProductReport[]>();
	const capacityRemaining = new Map(input.storeCapacity);
	const storesById = new Map(
		input.game.stores.map((store) => [store.id, cloneStoreForStock(store)])
	);
	const categoryIds = Object.keys(initialDemand).sort();

	for (const categoryId of categoryIds) {
		const sellers = input.game.stores
			.filter(
				(store) =>
					store.cityId === input.city.id &&
					store.products.some((product) => product.categoryId === categoryId)
			)
			.sort(
				(left, right) =>
					scoreStoreForCategory(right, categoryId) - scoreStoreForCategory(left, categoryId) ||
					left.id.localeCompare(right.id)
			);
		const totalScore = sellers.reduce(
			(sum, store) => sum + scoreStoreForCategory(store, categoryId),
			0
		);
		const category = findStoreCategory(sellers[0], categoryId);

		if (!category || totalScore <= 0) {
			continue;
		}

		for (const store of sellers) {
			const currentStore = storesById.get(store.id)!;
			const product = currentStore.products.find(
				(candidate) => candidate.categoryId === categoryId
			)!;
			const demandShare = scoreStoreForCategory(store, categoryId) / totalScore;
			const priceMultiplier = priceDemandMultiplier(category, product.sellingPrice);
			const desiredUnits = Math.max(
				0,
				Math.round(
					(initialDemand[categoryId] ?? 0) *
						demandShare *
						priceMultiplier *
						randomBetween(input.rng, 0.94, 1.06)
				)
			);
			const capacity = Math.max(0, Math.floor(capacityRemaining.get(store.id) ?? 0));
			const availableDemand = Math.max(0, remainingDemand[categoryId] ?? 0);
			const unitsSold = Math.min(desiredUnits, product.stock, capacity, availableDemand);
			const demandMissed = Math.max(0, desiredUnits - unitsSold);
			const endingStock = product.stock - unitsSold;
			const revenue = Math.round(unitsSold * product.sellingPrice);
			const costOfGoods = Math.round(unitsSold * category.importCost);

			product.stock = endingStock;
			capacityRemaining.set(store.id, capacity - unitsSold);
			remainingDemand[categoryId] = availableDemand - unitsSold;
			appendProductReport(reports, store.id, {
				categoryId,
				name: category.name,
				unitsSold,
				demandMissed,
				revenue,
				costOfGoods,
				grossMargin: revenue - costOfGoods,
				endingStock,
				importedUnits: 0,
				importCost: category.importCost,
				importSpend: 0
			});
		}
	}

	const stores = [...storesById.values()].map((store) => ({
		...store,
		stockHealth: calculateStockHealth(store.products)
	}));

	return { stores, productReports: reports, initialDemand, remainingDemand };
}

export function applyWeeklyImports(input: {
	game: GameState;
	storeReports: Map<string, DailyProductReport[]>;
}): WeeklyImportResult {
	let importSpend = 0;
	const productReports = new Map(input.storeReports);
	const stores = input.game.stores.map((store) => {
		const categories = getArchetype(store.archetypeId).startingCategories;
		const products = store.products.map((product) => {
			if (product.stock >= product.reorderThreshold) {
				return product;
			}

			const category = categories.find((candidate) => candidate.id === product.categoryId);
			const importedUnits = Math.max(0, product.targetStock - product.stock);

			if (!category || importedUnits === 0) {
				return product;
			}

			const spend = importedUnits * category.importCost;
			importSpend += spend;
			mergeImportReport(
				productReports,
				store.id,
				category,
				importedUnits,
				spend,
				product.targetStock
			);

			return { ...product, stock: product.targetStock };
		});

		return {
			...store,
			products,
			stockHealth: calculateStockHealth(products)
		};
	});

	return { stores, productReports, importSpend };
}
```

Add the private helpers used above in the same file:

```ts
function getCityStoreCategories(stores: Store[]): ProductCategory[] {
	const categories = new Map<string, ProductCategory>();

	for (const store of stores) {
		for (const category of getArchetype(store.archetypeId).startingCategories) {
			categories.set(category.id, category);
		}
	}

	return [...categories.values()];
}

function cloneStoreForStock(store: Store): Store {
	return {
		...store,
		products: store.products.map((product) => ({ ...product }))
	};
}

function findStoreCategory(
	store: Store | undefined,
	categoryId: string
): ProductCategory | undefined {
	return store
		? getArchetype(store.archetypeId).startingCategories.find(
				(category) => category.id === categoryId
			)
		: undefined;
}

function scoreStoreForCategory(store: Store, categoryId: string): number {
	const hasProduct = store.products.some((product) => product.categoryId === categoryId);

	if (!hasProduct) {
		return 0;
	}

	return Math.max(
		1,
		store.reputation * 0.55 + store.staffCapacity * 0.25 + (100 - store.competition) * 0.2
	);
}

function priceDemandMultiplier(category: ProductCategory, sellingPrice: number): number {
	const ratio = sellingPrice / Math.max(1, category.defaultSellingPrice);
	const penalty = (ratio - 1) * category.priceSensitivity;

	return Math.max(0.18, Math.min(1.35, 1 - penalty));
}

function appendProductReport(
	reports: Map<string, DailyProductReport[]>,
	storeId: string,
	report: DailyProductReport
): void {
	reports.set(storeId, [...(reports.get(storeId) ?? []), report]);
}

function mergeImportReport(
	reports: Map<string, DailyProductReport[]>,
	storeId: string,
	category: ProductCategory,
	importedUnits: number,
	importSpend: number,
	endingStock: number
): void {
	const storeReports = reports.get(storeId) ?? [];
	const existingIndex = storeReports.findIndex((report) => report.categoryId === category.id);

	if (existingIndex >= 0) {
		storeReports[existingIndex] = {
			...storeReports[existingIndex]!,
			endingStock,
			importedUnits,
			importSpend
		};
		reports.set(storeId, storeReports);
		return;
	}

	appendProductReport(reports, storeId, {
		categoryId: category.id,
		name: category.name,
		unitsSold: 0,
		demandMissed: 0,
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		endingStock,
		importedUnits,
		importCost: category.importCost,
		importSpend
	});
}
```

- [ ] **Step 4: Integrate product sales into daily simulation**

In `src/lib/game/simulateDay.ts`, import:

```ts
import {
	applyWeeklyImports,
	calculateStockHealth,
	isImportDay,
	simulateProductSalesForCity
} from './stock';
```

Refactor `simulateDay` so it computes store capacity first, runs stock sales per active city, optionally applies weekly imports, and then builds store reports from product reports. Preserve the existing staffing, payroll, decision, warning, scorecard, and hiring-market behavior.

Use these helper signatures in `simulateDay.ts`:

```ts
interface StoreOperationProfile {
	store: Store;
	staffLimit: number;
	staffingCoverage: number;
	staffingShortage: StaffingRequirement;
	staffMorale: number;
	reputation: number;
	marketPosition: number;
}

function buildStoreOperationProfile(
	store: Store,
	game: GameState,
	rng: ReturnType<typeof createRngFromState>
): StoreOperationProfile {
	const staffing = STAFFING[game.policy.staffing];
	const service = SERVICE[game.policy.service];
	const marketing = MARKETING[game.policy.marketing];
	const staffingSummary = summarizeStoreStaffing(game, store);
	const staffingCoverageRatio = Math.max(0.22, staffingSummary.coverage / 100);
	const skillMultiplier = 0.82 + staffingSummary.averageSkill / 250;
	const moraleMultiplier = 0.82 + staffingSummary.averageMorale / 260;
	const managerPenalty = staffingSummary.shortage.manager > 0 ? 5 : 0;
	const generalPenalty = staffingSummary.shortage.general * 2;
	const assignedMoraleDelta = (staffingSummary.averageMorale - 60) / 18;
	const staffLimit =
		store.staffCapacity *
		staffing.capacity *
		service.throughput *
		(0.72 + store.staffMorale / 220) *
		staffingCoverageRatio *
		skillMultiplier *
		moraleMultiplier *
		randomBetween(rng, 0.96, 1.04);
	const staffMorale = clampScore(
		store.staffMorale +
			staffing.morale +
			service.morale +
			store.managerQuality / 40 -
			managerPenalty -
			generalPenalty +
			assignedMoraleDelta -
			3 -
			(staffLimit <= store.staffCapacity * 0.45 ? 2 : 0)
	);
	const reputation = clampScore(
		store.reputation +
			staffing.satisfaction +
			service.satisfaction +
			marketing.reputation -
			managerPenalty +
			(staffingSummary.coverage < 80 ? -2 : 1)
	);
	const marketPosition = clampScore(
		35 + reputation / 3 - store.competition / 4 + marketing.market + staffingSummary.coverage / 12
	);

	return {
		store,
		staffLimit: Math.max(0, Math.floor(staffLimit)),
		staffingCoverage: staffingSummary.coverage,
		staffingShortage: staffingSummary.shortage,
		staffMorale,
		reputation,
		marketPosition
	};
}

function buildDailyStoreReport(
	profile: StoreOperationProfile,
	productReports: DailyProductReport[]
): { store: Store; report: DailyStoreReport } {
	const revenue = productReports.reduce((sum, report) => sum + report.revenue, 0);
	const costOfGoods = productReports.reduce((sum, report) => sum + report.costOfGoods, 0);
	const importSpend = productReports.reduce((sum, report) => sum + report.importSpend, 0);
	const customersServed = productReports.reduce((sum, report) => sum + report.unitsSold, 0);
	const demandMissed = productReports.reduce((sum, report) => sum + report.demandMissed, 0);
	const stockHealth = calculateStockHealth(profile.store.products);
	const grossMargin = revenue - costOfGoods;
	const operatingCosts = Math.round(
		getArchetype(profile.store.archetypeId).baseRent * (0.92 + profile.store.competition / 450)
	);
	const warnings = buildProductStoreWarnings(
		profile.store,
		productReports,
		stockHealth,
		profile.staffLimit,
		profile.staffingShortage,
		profile.reputation
	);

	return {
		store: {
			...profile.store,
			daysOpen: profile.store.daysOpen + 1,
			stockHealth,
			staffMorale: profile.staffMorale,
			reputation: profile.reputation
		},
		report: {
			storeId: profile.store.id,
			revenue,
			costOfGoods,
			grossMargin,
			operatingCosts,
			importSpend,
			netIncome: revenue - operatingCosts - importSpend,
			customersServed,
			demandMissed,
			staffingCoverage: Math.round(profile.staffingCoverage),
			staffingShortage: profile.staffingShortage,
			stockHealth,
			staffMorale: profile.staffMorale,
			reputation: profile.reputation,
			marketPosition: profile.marketPosition,
			productReports,
			warnings
		}
	};
}

function buildProductStoreWarnings(
	store: Store,
	productReports: DailyProductReport[],
	stockHealth: number,
	staffLimit: number,
	staffingShortage: StaffingRequirement,
	reputation: number
): string[] {
	const warnings: string[] = [];
	const customersServed = productReports.reduce((sum, report) => sum + report.unitsSold, 0);
	const demandMissed = productReports.reduce((sum, report) => sum + report.demandMissed, 0);

	if (stockHealth < 25 || productReports.some((report) => report.endingStock === 0)) {
		warnings.push(`${store.name} has stock pressure`);
	}

	if (store.staffMorale < 30 || staffLimit <= customersServed + 1) {
		warnings.push(`${store.name} is near staff capacity`);
	}

	if (staffingShortage.manager > 0) {
		warnings.push(`${store.name} is short ${staffingShortage.manager} manager`);
	}

	if (staffingShortage.general > 0) {
		warnings.push(`${store.name} is short ${staffingShortage.general} general staff`);
	}

	if (demandMissed > customersServed * 0.2) {
		warnings.push(`${store.name} missed product demand`);
	}

	if (reputation < 35) {
		warnings.push(`${store.name} reputation is slipping`);
	}

	return warnings;
}
```

Keep the existing constants in `simulateDay.ts` for pricing, staffing, marketing, and service policy effects. Remove new stock behavior from `store.localDemand`, and delete `productDemandFit`, `averageCategoryMargin`, and `supplierCost` after the compiler confirms they are unused.

- [ ] **Step 5: Add daily simulation tests**

Add tests to `src/lib/game/simulateDay.spec.ts`:

```ts
test('records product reports and aggregates store report totals', () => {
	expect.assertions(8);
	const game = createNewGame('convenience', 20260508);
	const result = simulateDay(game);
	const report = result.reports[0]!.storeReports[0]!;
	const productTotals = report.productReports.reduce(
		(totals, product) => ({
			revenue: totals.revenue + product.revenue,
			costOfGoods: totals.costOfGoods + product.costOfGoods,
			importSpend: totals.importSpend + product.importSpend,
			unitsSold: totals.unitsSold + product.unitsSold,
			demandMissed: totals.demandMissed + product.demandMissed
		}),
		{ revenue: 0, costOfGoods: 0, importSpend: 0, unitsSold: 0, demandMissed: 0 }
	);

	expect(report.productReports).toHaveLength(game.stores[0]!.products.length);
	expect(report.revenue).toBe(productTotals.revenue);
	expect(report.costOfGoods).toBe(productTotals.costOfGoods);
	expect(report.importSpend).toBe(productTotals.importSpend);
	expect(report.customersServed).toBe(productTotals.unitsSold);
	expect(report.demandMissed).toBe(productTotals.demandMissed);
	expect(result.stores[0]!.products[0]!.stock).toBeLessThanOrEqual(
		game.stores[0]!.products[0]!.stock
	);
	expect(report.stockHealth).toBe(result.stores[0]!.stockHealth);
});

test('weekly imports subtract cash even when cash goes negative', () => {
	expect.assertions(5);
	const game = {
		...createNewGame('convenience', 20260508),
		day: 7,
		cash: 10
	};
	const store = {
		...game.stores[0]!,
		products: game.stores[0]!.products.map((product) => ({
			...product,
			stock: 0,
			reorderThreshold: 5,
			targetStock: 20
		}))
	};
	const result = simulateDay({ ...game, stores: [store] });
	const report = result.reports[0]!;

	expect(report.importSpend).toBeGreaterThan(10);
	expect(result.cash).toBeLessThan(0);
	expect(result.stores[0]!.products.every((product) => product.stock >= 20)).toBe(true);
	expect(report.storeReports[0]?.productReports.some((product) => product.importedUnits > 0)).toBe(
		true
	);
	expect(report.cashAfter).toBe(result.cash);
});
```

- [ ] **Step 6: Run focused simulation tests**

Run:

```bash
bun run test:unit -- src/lib/game/stock.spec.ts src/lib/game/simulateDay.spec.ts src/lib/game/reports.spec.ts --run
```

Expected: PASS.

- [ ] **Step 7: Run full server-side unit tests**

Run:

```bash
bun run test:unit -- --project server --run
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/stock.ts src/lib/game/stock.spec.ts src/lib/game/simulateDay.ts src/lib/game/simulateDay.spec.ts src/lib/game/reports.spec.ts
git commit -m "feat: simulate city-wide stock demand"
```

---

### Task 3: Save Validation And Current Report Surfaces

**Files:**

- Modify: `src/lib/persistence/saveTypes.ts`
- Modify: `src/lib/persistence/saveCodec.ts`
- Modify: `src/lib/persistence/saveRepository.spec.ts`
- Modify: `src/lib/persistence/tauriSaveRepository.spec.ts`
- Modify: `src/lib/components/game/StoreOverview.svelte`
- Modify: `src/lib/components/game/StoreOverview.svelte.spec.ts`
- Modify: `src/lib/components/game/ReportsPanel.svelte`

- [ ] **Step 1: Write failing save validation tests**

In `src/lib/persistence/saveRepository.spec.ts` or `src/lib/persistence/saveCodec` tests, add current-shape assertions:

```ts
test('save validation accepts store product rows and product reports', () => {
	expect.assertions(1);
	const game = simulateDay(createNewGame('convenience', 20260508));
	const record = createSaveRecord(game, {
		id: 'manual-stock',
		name: 'Stock Save',
		kind: 'manual',
		updatedAt: new Date('2026-05-08T12:00:00.000Z')
	});

	expect(validateSaveRecord(record)).toBe(record);
});

test('save validation rejects invalid store product rows', () => {
	expect.assertions(1);
	const game = createNewGame('convenience', 20260508);
	const broken = {
		...game,
		stores: [
			{
				...game.stores[0]!,
				products: [
					{
						categoryId: '',
						stock: Number.NaN,
						reorderThreshold: 1,
						targetStock: 1,
						sellingPrice: 1
					}
				]
			}
		]
	};

	expect(() =>
		validateSaveRecord(
			createSaveRecord(broken, {
				id: 'manual-broken-stock',
				name: 'Broken Stock Save',
				kind: 'manual',
				updatedAt: new Date('2026-05-08T12:00:00.000Z')
			})
		)
	).toThrow('products[0]');
});
```

- [ ] **Step 2: Run persistence tests to verify they fail**

Run:

```bash
bun run test:unit -- src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts --run
```

Expected: FAIL with missing product/import validation.

- [ ] **Step 3: Bump save schema version**

Modify `src/lib/persistence/saveTypes.ts`:

```ts
export const SAVE_SCHEMA_VERSION = 4;
```

Use the next integer after the current value in the file.

- [ ] **Step 4: Validate store products and product reports**

In `src/lib/persistence/saveCodec.ts`, add validation helpers:

```ts
function validateSavedStoreProduct(value: unknown, label: string): void {
	const product = requireRecord(value, label);

	requireString(product.categoryId, `${label} categoryId`);
	requireNumber(product.stock, `${label} stock`);
	requireNumber(product.reorderThreshold, `${label} reorderThreshold`);
	requireNumber(product.targetStock, `${label} targetStock`);
	requireNumber(product.sellingPrice, `${label} sellingPrice`);
}

function validateSavedProductReport(value: unknown, label: string): void {
	const report = requireRecord(value, label);

	requireString(report.categoryId, `${label} categoryId`);
	requireString(report.name, `${label} name`);
	requireNumber(report.unitsSold, `${label} unitsSold`);
	requireNumber(report.demandMissed, `${label} demandMissed`);
	requireNumber(report.revenue, `${label} revenue`);
	requireNumber(report.costOfGoods, `${label} costOfGoods`);
	requireNumber(report.grossMargin, `${label} grossMargin`);
	requireNumber(report.endingStock, `${label} endingStock`);
	requireNumber(report.importedUnits, `${label} importedUnits`);
	requireNumber(report.importCost, `${label} importCost`);
	requireNumber(report.importSpend, `${label} importSpend`);
}
```

Call them from existing validators:

```ts
requireArray(store.products, `${label} products`).forEach((product, index) =>
	validateSavedStoreProduct(product, `${label} products[${index}]`)
);
requireNumber(report.importSpend, `${label} importSpend`);
requireArray(report.productReports, `${label} productReports`).forEach((productReport, index) =>
	validateSavedProductReport(productReport, `${label} productReports[${index}]`)
);
requireNumber(report.importSpend, `${label} importSpend`);
```

- [ ] **Step 5: Update report summary panels and tests**

In `StoreOverview.svelte`, keep the current stock summary but display latest import spend when available:

```svelte
<div>
	<dt>Imports</dt>
	<dd>{currency.format(report?.importSpend ?? 0)}</dd>
</div>
```

In `ReportsPanel.svelte`, add import spend next to payroll:

```svelte
<div>
	<span>Imports</span>
	<strong>{currency.format(summary.latest.importSpend)}</strong>
</div>
```

Update component test fixtures by adding:

```ts
importSpend: 0,
productReports: []
```

- [ ] **Step 6: Run component snippets through Svelte MCP during implementation**

When editing `StoreOverview.svelte` and `ReportsPanel.svelte`, call:

1. `mcp__svelte__.list_sections`
2. `mcp__svelte__.get_documentation` for `$props`, `$derived`, `{#each ...}`, `{#if ...}`, and `Testing` if not already loaded in the session
3. `mcp__svelte__.svelte_autofixer` on the final full component contents until it returns no issues

Expected: no Svelte autofixer issues before committing.

- [ ] **Step 7: Run persistence and component tests**

Run:

```bash
bun run test:unit -- src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts src/lib/components/game/StoreOverview.svelte.spec.ts --run
```

Expected: PASS.

- [ ] **Step 8: Run check**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/lib/persistence/saveTypes.ts src/lib/persistence/saveCodec.ts src/lib/persistence/saveRepository.spec.ts src/lib/persistence/tauriSaveRepository.spec.ts src/lib/components/game/StoreOverview.svelte src/lib/components/game/StoreOverview.svelte.spec.ts src/lib/components/game/ReportsPanel.svelte
git commit -m "feat: persist stock reports"
```

---

### Task 4: Tile Inspector Stock Table And Route Autosave Wiring

**Files:**

- Create: `src/lib/components/game/StoreStockTable.svelte`
- Create: `src/lib/components/game/StoreStockTable.svelte.spec.ts`
- Modify: `src/lib/components/game/TileInspector.svelte`
- Modify: `src/lib/components/game/TileInspector.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Write failing StoreStockTable component tests**

Create `src/lib/components/game/StoreStockTable.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { initializeStoreProducts } from '$lib/game/stock';
import type { DailyStoreReport, Store } from '$lib/game/types';
import StoreStockTable from './StoreStockTable.svelte';

const store: Store = {
	id: 'store-1',
	name: 'Founding Store',
	archetypeId: 'convenience',
	location: 'Downtown (1, 1)',
	cityId: 'harbor-city',
	tileId: 'harbor-city-1-1',
	mapX: 1,
	mapY: 1,
	daysOpen: 1,
	reputation: 50,
	stockHealth: 80,
	staffMorale: 75,
	staffCapacity: 70,
	localDemand: 72,
	competition: 15,
	managerQuality: 60,
	products: initializeStoreProducts('convenience')
};

const latestReport: DailyStoreReport = {
	storeId: store.id,
	revenue: 120,
	costOfGoods: 45,
	grossMargin: 75,
	operatingCosts: 20,
	importSpend: 0,
	netIncome: 55,
	customersServed: 24,
	demandMissed: 3,
	staffingCoverage: 100,
	staffingShortage: { manager: 0, general: 0 },
	stockHealth: 77,
	staffMorale: 82,
	reputation: 55,
	marketPosition: 45,
	productReports: [
		{
			categoryId: 'snacks',
			name: 'Snacks',
			unitsSold: 12,
			demandMissed: 2,
			revenue: 60,
			costOfGoods: 36,
			grossMargin: 24,
			endingStock: 58,
			importedUnits: 0,
			importCost: 3,
			importSpend: 0
		}
	],
	warnings: []
};

describe('StoreStockTable', () => {
	it('renders product rows with read-only import cost and latest product report', async () => {
		expect.assertions(4);

		render(StoreStockTable, {
			store,
			latestReport,
			onUpdate: vi.fn()
		});

		await expect.element(page.getByRole('table', { name: 'Founding Store stock' })).toBeVisible();
		await expect.element(page.getByText('Snacks')).toBeVisible();
		await expect.element(page.getByText('$3')).toBeVisible();
		await expect.element(page.getByText('12 sold / 2 missed')).toBeVisible();
	});

	it('calls update callback when product settings change', async () => {
		expect.assertions(1);
		const onUpdate = vi.fn();

		render(StoreStockTable, {
			store,
			latestReport: null,
			onUpdate
		});

		const priceInput = page.getByLabelText('Selling price for Snacks');
		await priceInput.fill('7');
		await priceInput.blur();

		expect(onUpdate).toHaveBeenCalledWith('store-1', 'snacks', { sellingPrice: 7 });
	});
});
```

- [ ] **Step 2: Run component test to verify it fails**

Run:

```bash
bun run test:unit -- src/lib/components/game/StoreStockTable.svelte.spec.ts --run
```

Expected: FAIL because `StoreStockTable.svelte` does not exist.

- [ ] **Step 3: Create StoreStockTable.svelte**

Create `src/lib/components/game/StoreStockTable.svelte` with this autofixer-clean Svelte 5 component:

```svelte
<script lang="ts">
	import { getArchetype } from '$lib/game/archetypes';
	import type { DailyStoreReport, Store, StoreProductPatch } from '$lib/game/types';

	interface Props {
		store: Store;
		latestReport: DailyStoreReport | null;
		onUpdate: (storeId: string, categoryId: string, patch: StoreProductPatch) => void;
	}

	let { store, latestReport, onUpdate }: Props = $props();

	const currency = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	});

	const rows = $derived.by(() => {
		const categories = getArchetype(store.archetypeId).startingCategories;

		return store.products.map((product) => {
			const category = categories.find((item) => item.id === product.categoryId);
			const report = latestReport?.productReports.find(
				(item) => item.categoryId === product.categoryId
			);
			const ratio = product.targetStock === 0 ? 1 : product.stock / product.targetStock;
			const status =
				product.stock === 0
					? 'Out of stock'
					: product.stock < product.reorderThreshold
						? 'Needs import'
						: 'Healthy';

			return {
				product,
				category,
				report,
				stockRatio: Math.max(0, Math.min(1, ratio)),
				status
			};
		});
	});

	function updateNumber(categoryId: string, field: keyof StoreProductPatch, value: string): void {
		const parsed = Number(value);

		if (Number.isFinite(parsed)) {
			onUpdate(store.id, categoryId, { [field]: parsed });
		}
	}
</script>

<section class="stock-panel" aria-labelledby={`stock-${store.id}`}>
	<h3 id={`stock-${store.id}`}>Stock table</h3>
	<div class="stock-table" role="table" aria-label={`${store.name} stock`}>
		<div class="stock-row stock-head" role="row">
			<span role="columnheader">Product</span>
			<span role="columnheader">Stock</span>
			<span role="columnheader">Import</span>
			<span role="columnheader">Price</span>
			<span role="columnheader">Threshold</span>
			<span role="columnheader">Target</span>
			<span role="columnheader">Recent</span>
		</div>
		{#each rows as row (row.product.categoryId)}
			<div class="stock-row" role="row">
				<div role="cell">
					<strong>{row.category?.name ?? row.product.categoryId}</strong>
					<span>{row.status}</span>
				</div>
				<div role="cell">
					<strong>{row.product.stock}</strong>
					<meter min="0" max="1" value={row.stockRatio}>{Math.round(row.stockRatio * 100)}%</meter>
				</div>
				<span role="cell">{currency.format(row.category?.importCost ?? 0)}</span>
				<div role="cell">
					<label>
						<span class="sr-only"
							>Selling price for {row.category?.name ?? row.product.categoryId}</span
						>
						<input
							type="number"
							min="1"
							step="1"
							value={row.product.sellingPrice}
							onchange={(event) =>
								updateNumber(row.product.categoryId, 'sellingPrice', event.currentTarget.value)}
						/>
					</label>
				</div>
				<div role="cell">
					<label>
						<span class="sr-only"
							>Reorder threshold for {row.category?.name ?? row.product.categoryId}</span
						>
						<input
							type="number"
							min="0"
							step="1"
							value={row.product.reorderThreshold}
							onchange={(event) =>
								updateNumber(row.product.categoryId, 'reorderThreshold', event.currentTarget.value)}
						/>
					</label>
				</div>
				<div role="cell">
					<label>
						<span class="sr-only"
							>Target stock for {row.category?.name ?? row.product.categoryId}</span
						>
						<input
							type="number"
							min={row.product.reorderThreshold}
							step="1"
							value={row.product.targetStock}
							onchange={(event) =>
								updateNumber(row.product.categoryId, 'targetStock', event.currentTarget.value)}
						/>
					</label>
				</div>
				<span role="cell">
					{row.report
						? `${row.report.unitsSold} sold / ${row.report.demandMissed} missed`
						: 'No report'}
				</span>
			</div>
		{/each}
	</div>
</section>
```

Add the CSS from the autofixer-clean snippet used during planning, preserving the same class names and responsive grid. Then run the Svelte autofixer on the final file contents.

- [ ] **Step 4: Wire the stock table into TileInspector**

Modify `src/lib/components/game/TileInspector.svelte`:

```svelte
import StoreStockTable from './StoreStockTable.svelte'; import type {(ArchetypeId,
CityTile,
DailyStoreReport,
OpeningOption,
Store,
StoreProductPatch)} from '$lib/game/types';
```

Extend props:

```ts
latestStoreReport: DailyStoreReport | null;
onUpdateStoreProduct: (storeId: string, categoryId: string, patch: StoreProductPatch) => void;
```

Render inside the owned-store branch after the store details:

```svelte
<StoreStockTable {store} latestReport={latestStoreReport} onUpdate={onUpdateStoreProduct} />
```

Replace the `Local demand` display with a city-wide wording such as:

```svelte
<div>
	<dt>Stock rows</dt>
	<dd>{store.products.length}</dd>
</div>
```

- [ ] **Step 5: Wire route state and autosave**

Modify `src/routes/+page.svelte`:

```ts
import { updateStoreProduct } from '$lib/game/stock';
import type { StoreProductPatch } from '$lib/game/types';
```

Add a derived latest selected store report:

```ts
let latestSelectedStoreReport = $derived.by(() => {
	const store = selectedStore;

	if (!store) {
		return null;
	}

	return summary.latest?.storeReports.find((report) => report.storeId === store.id) ?? null;
});
```

Add handler:

```ts
function changeStoreProduct(storeId: string, categoryId: string, patch: StoreProductPatch): void {
	if (!game) {
		return;
	}

	setGameAndAutosave(updateStoreProduct(game, storeId, categoryId, patch));
}
```

Pass props to `TileInspector`:

```svelte
latestStoreReport={latestSelectedStoreReport}
onUpdateStoreProduct={changeStoreProduct}
```

- [ ] **Step 6: Update TileInspector tests**

In `src/lib/components/game/TileInspector.svelte.spec.ts`, add product rows to the `store` fixture and include new required props:

```ts
latestStoreReport: null,
onUpdateStoreProduct: vi.fn()
```

Add assertions:

```ts
it('renders stock management for an owned store', async () => {
	expect.assertions(3);
	const onUpdateStoreProduct = vi.fn();

	renderInspector({ store, onUpdateStoreProduct });

	await expect.element(page.getByRole('table', { name: 'Founding Store stock' })).toBeVisible();
	await expect.element(page.getByLabelText('Selling price for Snacks')).toBeVisible();
	await expect.element(page.getByText('Local demand')).not.toBeInTheDocument();
});
```

- [ ] **Step 7: Run Svelte autofixer on final components**

Run `mcp__svelte__.svelte_autofixer` on the final contents of:

- `StoreStockTable.svelte`
- `TileInspector.svelte`
- `+page.svelte` if Svelte syntax changed beyond prop wiring

Expected: no issues.

- [ ] **Step 8: Run component tests**

Run:

```bash
bun run test:unit -- src/lib/components/game/StoreStockTable.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts --run
```

Expected: PASS.

- [ ] **Step 9: Run check**

Run:

```bash
bun run check
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/lib/components/game/StoreStockTable.svelte src/lib/components/game/StoreStockTable.svelte.spec.ts src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts src/routes/+page.svelte
git commit -m "feat: manage stock from tile inspector"
```

---

### Task 5: E2E Stock Flow And Full Verification

**Files:**

- Modify: `src/routes/retail-sim.e2e.ts`
- Modify: `src/lib/components/game/StoreStockTable.svelte` only when the e2e needs a more stable accessible name

- [ ] **Step 1: Add a stock-management e2e test**

Append to `src/routes/retail-sim.e2e.ts`:

```ts
test('manage selected store stock and see weekly imports', async ({ page }) => {
	await page.goto('/');
	await selectBuildableTile(page);
	await chooseStoreType(page, /open convenience store here/i);

	const canvas = page.locator('canvas');
	await expect(canvas).toHaveAttribute('data-store-sprite-count', '1');
	await canvas.click({ position: { x: 80, y: 80 } });

	const inspector = page.getByRole('dialog', { name: 'Tile details' });
	await expect(inspector.getByRole('table', { name: /stock/i })).toBeVisible();

	const snacksPrice = inspector.getByLabel(/selling price for snacks/i);
	await snacksPrice.fill('7');
	await snacksPrice.blur();
	await expect(snacksPrice).toHaveValue('7');

	for (let index = 0; index < 7; index += 1) {
		await page.getByRole('button', { name: 'Advance day' }).click();
	}

	await page.getByRole('button', { name: 'Views' }).click();
	await page.getByRole('button', { name: 'Control Tower' }).click();
	const tower = page.getByRole('dialog', { name: 'Control Tower' });
	await expect(tower.getByText(/imports/i)).toBeVisible();
});
```

If `selectBuildableTile` clicks a non-store tile after founding, reuse or add a helper that clicks the first owned store sprite by selecting the founding tile id from the current map coordinates used elsewhere in the file.

- [ ] **Step 2: Run the new e2e test to verify it fails if wiring is incomplete**

Run:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "manage selected store stock"
```

Expected before final fixes: FAIL only if locator/timing needs adjustment. Expected after selectors are stable: PASS.

- [ ] **Step 3: Stabilize selectors without changing product behavior**

If Playwright cannot locate the stock table after selecting the store, add stable accessible names in `StoreStockTable.svelte` rather than test-only attributes:

```svelte
<div class="stock-table" role="table" aria-label={`${store.name} stock`}>
```

If the e2e cannot reliably return to the owned tile, use the existing route test tile-click math and the store's map coordinates rather than adding hidden state to the app.

- [ ] **Step 4: Run focused e2e**

Run:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "manage selected store stock"
```

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run:

```bash
bun run check
bun run test:unit -- --run
bun run test:e2e
```

Expected: all PASS. If a failure is unrelated and pre-existing, capture the exact failing command, failing test name, and error text before deciding whether to fix it in this feature branch.

- [ ] **Step 6: Final review**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors. Status should show only intended stock-system changes.

- [ ] **Step 7: Commit final e2e/verification changes**

```bash
git add src/routes/retail-sim.e2e.ts src/lib/components/game/StoreStockTable.svelte
git commit -m "test: cover stock management flow"
```

---

## Execution Notes

- Use `rg` to locate all `Store` literals after adding `products`; missing fixture fields will show up in `bun run check`.
- Keep `store.localDemand` present until a separate cleanup removes or migrates old placement/report code. This stock feature must not use it for product sales.
- Do not statically import Tauri-only persistence code from browser paths.
- Every Vitest test needs at least one `expect` because `vite.config.ts` enforces `expect.requireAssertions`.
- Svelte implementation must use the official Svelte MCP workflow: `list-sections`, `get-documentation`, and `svelte-autofixer` on every changed Svelte component until clean.
- If browser automation flakes with stale Vite output, restart the dev/preview server before changing production code.
