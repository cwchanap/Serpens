# Tiered Product Chains & Tree Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three cheap Tier 1 production chains (Bottled Water, Produce, Pantry) so new players can learn the production loop with 2–3 buildings, and replace the entangled shared-DAG chain chart with a zero-crossing tree-per-product view.

**Architecture:** All game logic is pure functions over `GameState` in `src/lib/game/`. New finished materials/recipes/buildings are additive entries in `industry.ts` (one producer recipe per material — `productChainGraph.ts` throws otherwise). The new chart is a new pure builder `productChainTree.ts` that emits the existing `ProductChainGraph` shape (so the atlas Svelte components plug in unchanged), duplicating shared sub-chains per branch with path-suffixed node ids. Spec: `docs/superpowers/specs/2026-06-11-tiered-product-chains-design.md`.

**Tech Stack:** TypeScript, SvelteKit (Svelte 5 runes), Vitest (two projects: `server` node + `client` browser for `.svelte.spec.ts`), Playwright e2e, pngjs sprite generator.

**Two deliberate deviations from the spec** (flag in the PR description):

1. `household` stays as the convenience archetype's *5th* category instead of being deleted. Only 4 categories ever unlock (levels 1/4/7/10), so new stores never get it — but legacy saves contain stores already stocking household; deleting the category definition would orphan their product rows (no category def → unsellable; no `PRODUCT_ART` entry → `getProductArt` throws in `StoreStockTable`).
2. The "~10-day payback" balance target is unreachable at the game's price scale (existing chains gross ~5–100/day against build costs in the thousands). Tests instead assert the structural intent: bottled-water chain build cost ≤ $1,500 and a positive daily margin (output import-value > chain daily operating costs).

**Verification commands** (used throughout):

- Unit, one file: `bun run test:unit -- src/lib/game/industry.spec.ts --run`
- Full unit: `bun run test:unit -- --run`
- Types: `bun run check` · Lint: `bun run lint`
- E2e (slow, builds first): `bun run test:e2e`

---

## File structure

| File | Change | Responsibility |
| --- | --- | --- |
| `tools/generate_industry_assets.mjs` | modify | Draw + emit 3 material, 3 building, 1 product-icon sprites |
| `src/lib/game/types.ts` | modify | Extend `MaterialId`, `ProductionRecipeId`, `IndustrialBuildingTypeId` unions; add `tier` to `IndustrialBuildingType` |
| `src/lib/game/industry.ts` | modify | New materials/recipes/building types; `tier` on all building types; `getCategoryTier` |
| `src/lib/assets/gameArt.ts` | modify | Register new sprite paths; add `bottled-water` product art |
| `src/lib/game/archetypes.ts` | modify | Convenience lineup: `bottled-water` first |
| `src/lib/game/state.ts` | modify | Milestone unlock = first starting category not already stocked |
| `src/lib/game/productChainGraph.ts` | modify | Export shared helpers; add `subLabel`/`sharedBranchCount` to `ProductChainNode`; later delete category-DAG builder + summaries (moved) |
| `src/lib/game/productChainTree.ts` | **create** | Tree builder + category summaries (moved here) |
| `src/lib/game/productChainTree.spec.ts` | **create** | Tree structure/metrics/health tests |
| `src/lib/components/game/ProductChainsPanel.svelte` | modify | Category mode uses tree builder; tier-sorted summaries |
| `src/lib/components/game/StoreProductChainPanel.svelte` | modify | Uses tree builder |
| `src/lib/components/game/atlas/ChainNode.svelte` | modify | `subLabel` line on merged cards |
| `src/lib/components/game/atlas/ChainRoute.svelte` | modify | Label anchored at t=0.3 along the curve |
| `src/lib/components/game/atlas/NodeBroadside.svelte` | modify | "Shared by N branches" note |
| `src/lib/components/game/atlas/CategoryStampIndex.svelte` | modify | Tier badge |
| `src/lib/components/game/BuildMenu.svelte` | modify | Industry list sorted by tier, then cost |
| `src/routes/retail-sim.e2e.ts` | modify | Default chain category is now bottled-water; new tier-1 assertions |
| `CLAUDE.md` | modify | Document `productChainTree.ts` + tier model |

---

### Task 1: Generate the new sprites (PNGs only — no TS changes)

The generator regenerates every listed asset deterministically, so re-running it must not change existing files. New ids: materials `bottled-water`, `produce`, `pantry`; buildings `water-bottler`, `produce-packhouse`, `pantry-works`; product icon `bottled-water` (the other two retail categories, produce and pantry, already have hand-made product icons). Note `gifts`/`gift-workshop` are deliberately NOT in this script — do not add them.

**Files:**
- Modify: `tools/generate_industry_assets.mjs`

- [ ] **Step 1: Add the new paths to the `MATERIALS` and `BUILDINGS` tables**

In `tools/generate_industry_assets.mjs`, append to the `MATERIALS` object (after `essentials`):

```js
	essentials: '/assets/game/industry/materials/essentials.png',
	'bottled-water': '/assets/game/industry/materials/bottled-water.png',
	produce: '/assets/game/industry/materials/produce.png',
	pantry: '/assets/game/industry/materials/pantry.png'
```

Append to the `BUILDINGS` object (after `household-goods-factory`, before `warehouse`):

```js
	'household-goods-factory': '/assets/game/industry/buildings/household-goods-factory.png',
	'water-bottler': '/assets/game/industry/buildings/water-bottler.png',
	'produce-packhouse': '/assets/game/industry/buildings/produce-packhouse.png',
	'pantry-works': '/assets/game/industry/buildings/pantry-works.png',
	warehouse: '/assets/game/industry/buildings/warehouse.png'
```

And add a new `PRODUCTS` table after `BUILDINGS`:

```js
const PRODUCTS = {
	'bottled-water': '/assets/game/products/bottled-water.png'
};
```

- [ ] **Step 2: Add drawing branches**

In `drawMaterial(id)`, before the final `return png;`:

```js
	if (id === 'bottled-water') {
		rect(png, 39, 25, 18, 46, PALETTE.waterLight);
		rect(png, 43, 17, 10, 9, PALETTE.blue);
		rect(png, 42, 40, 12, 16, PALETTE.white);
		circle(png, 48, 62, 5, PALETTE.water);
	}
	if (id === 'produce') {
		circle(png, 40, 52, 14, PALETTE.green);
		circle(png, 57, 54, 12, PALETTE.orange);
		circle(png, 49, 38, 10, PALETTE.red);
		rect(png, 47, 27, 4, 9, PALETTE.brown);
	}
	if (id === 'pantry') {
		rect(png, 28, 32, 40, 40, PALETTE.cream);
		rect(png, 33, 40, 30, 8, PALETTE.brown);
		rect(png, 33, 54, 30, 8, PALETTE.yellow);
		rect(png, 40, 24, 16, 8, PALETTE.metal);
	}
```

In `drawBuilding(id)`, before the `if (id === 'warehouse')` branch:

```js
	if (id === 'water-bottler') {
		drawFactoryBase(png, PALETTE.concrete, PALETTE.blue);
		rect(png, 33, 34, 18, 8, PALETTE.waterLight);
		rect(png, 37, 50, 6, 16, PALETTE.waterLight);
		rect(png, 50, 50, 6, 16, PALETTE.waterLight);
	}
	if (id === 'produce-packhouse') {
		drawFactoryBase(png, [218, 190, 119, 255], PALETTE.green);
		circle(png, 38, 58, 6, PALETTE.red);
		circle(png, 52, 60, 6, PALETTE.orange);
	}
	if (id === 'pantry-works') {
		drawFactoryBase(png, PALETTE.concrete, PALETTE.yellow);
		rect(png, 34, 52, 12, 14, PALETTE.cream);
		rect(png, 50, 52, 12, 14, PALETTE.brown);
	}
```

After `drawBuilding`, add the product-icon drawer and emit loop (next to the existing `for (const [id, path] of Object.entries(BUILDINGS))` loop):

```js
function drawProduct(id) {
	const png = makePng(96);
	if (id === 'bottled-water') {
		ellipseShadow(png);
		rect(png, 36, 22, 24, 52, PALETTE.waterLight);
		rect(png, 41, 13, 14, 10, PALETTE.blue);
		rect(png, 40, 40, 16, 20, PALETTE.white);
		circle(png, 48, 66, 6, PALETTE.water);
	}
	return png;
}

for (const [id, path] of Object.entries(PRODUCTS)) {
	save(drawProduct(id), path);
}
```

Also update the final `console.log` count expression to include `Object.keys(PRODUCTS).length`.

- [ ] **Step 3: Run the generator and verify only new files appear**

Run: `bun tools/generate_industry_assets.mjs`
Expected: `Generated 62 industry assets.` (was 55: +3 materials, +3 buildings, +1 product)

Run: `git status --short static/ tools/`
Expected: ONLY these new (`??`) files plus the modified (`M`) script — **no modified existing PNGs**:
```
static/assets/game/industry/materials/bottled-water.png
static/assets/game/industry/materials/produce.png
static/assets/game/industry/materials/pantry.png
static/assets/game/industry/buildings/water-bottler.png
static/assets/game/industry/buildings/produce-packhouse.png
static/assets/game/industry/buildings/pantry-works.png
static/assets/game/products/bottled-water.png
```
If any existing PNG shows as modified, the drawing helpers were touched in a way that changed existing output — fix before continuing.

- [ ] **Step 4: Run the art spec (still green — new files are unreferenced)**

Run: `bun run test:unit -- src/lib/assets/gameArt.spec.ts --run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tools/generate_industry_assets.mjs static/assets/game
git commit -m "feat: generate tier-1 chain sprites (bottled water, produce, pantry)"
```

---

### Task 2: Materials, recipes, building types, tier field, art registration

**Files:**
- Modify: `src/lib/game/types.ts:20-40` (MaterialId), `:102-123` (IndustrialBuildingTypeId), `:124-144` (ProductionRecipeId), `:185-194` (IndustrialBuildingType)
- Modify: `src/lib/game/industry.ts`
- Modify: `src/lib/assets/gameArt.ts`, `src/lib/assets/gameArt.spec.ts`
- Test: `src/lib/game/industry.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/game/industry.spec.ts` (match the file's existing import style; add `getCategoryTier` to the import from `./industry` — it's defined in this task):

```ts
describe('tier 1 chains', () => {
	it('defines the three new finished materials with one producer recipe each', () => {
		for (const id of ['bottled-water', 'produce', 'pantry'] as const) {
			expect(MATERIALS[id].kind).toBe('finished');
			const producers = Object.values(PRODUCTION_RECIPES).filter((recipe) =>
				recipe.outputs.some((output) => output.materialId === id)
			);
			expect(producers, `${id} must have exactly one producer recipe`).toHaveLength(1);
		}
	});

	it('lists the new finished materials as supported products', () => {
		expect(FINISHED_PRODUCT_MATERIAL_IDS).toContain('bottled-water');
		expect(FINISHED_PRODUCT_MATERIAL_IDS).toContain('produce');
		expect(FINISHED_PRODUCT_MATERIAL_IDS).toContain('pantry');
		expect(FINISHED_PRODUCT_MATERIAL_IDS).toHaveLength(7);
	});

	it('keeps the bottled water chain at two buildings under the tier 1 cost ceiling', () => {
		const types = getIndustrialBuildingTypesForProductChain('bottled-water');
		expect(types.map((type) => type.id).sort()).toEqual(['water-bottler', 'water-pump']);
		expect(types.reduce((sum, type) => sum + type.buildCost, 0)).toBeLessThanOrEqual(1_500);
	});

	it('keeps the produce chain at two buildings and the pantry chain at three', () => {
		expect(
			getIndustrialBuildingTypesForProductChain('produce')
				.map((type) => type.id)
				.sort()
		).toEqual(['fruit-farm', 'produce-packhouse']);
		expect(
			getIndustrialBuildingTypesForProductChain('pantry')
				.map((type) => type.id)
				.sort()
		).toEqual(['flour-mill', 'grain-farm', 'pantry-works']);
	});

	it('runs each tier 1 chain at a positive daily margin', () => {
		for (const materialId of ['bottled-water', 'produce'] as const) {
			const chainTypes = getIndustrialBuildingTypesForProductChain(materialId);
			const finalRecipe = Object.values(PRODUCTION_RECIPES).find((recipe) =>
				recipe.outputs.some((output) => output.materialId === materialId)
			)!;
			const outputValuePerDay = finalRecipe.outputs.reduce(
				(sum, output) => sum + output.quantity * MATERIALS[output.materialId].importCost,
				0
			);
			const dailyCost =
				chainTypes.reduce((sum, type) => sum + type.dailyOperatingCost, 0) +
				finalRecipe.operatingCost;
			expect(outputValuePerDay, `${materialId} chain must clear its daily costs`).toBeGreaterThan(
				dailyCost
			);
		}
	});

	it('assigns a tier between 1 and 3 to every industrial building type', () => {
		for (const type of Object.values(INDUSTRIAL_BUILDING_TYPES)) {
			expect([1, 2, 3], `${type.id} needs a tier`).toContain(type.tier);
		}
	});

	it('derives category tiers from the final factory of each chain', () => {
		expect(getCategoryTier('bottled-water')).toBe(1);
		expect(getCategoryTier('produce')).toBe(1);
		expect(getCategoryTier('pantry')).toBe(1);
		expect(getCategoryTier('snacks')).toBe(3);
		expect(getCategoryTier('gifts')).toBe(3);
		expect(getCategoryTier('apparel')).toBeNull();
	});

	it('terminates every finished chain in raw materials', () => {
		for (const materialId of FINISHED_PRODUCT_MATERIAL_IDS) {
			const seen = new Set<string>();
			const queue: string[] = [materialId];
			while (queue.length > 0) {
				const current = queue.pop()!;
				if (seen.has(current)) continue;
				seen.add(current);
				const producer = Object.values(PRODUCTION_RECIPES).find((recipe) =>
					recipe.outputs.some((output) => output.materialId === current)
				);
				expect(producer, `${current} in ${materialId} chain needs a producer`).toBeDefined();
				for (const input of producer!.inputs) queue.push(input.materialId);
			}
		}
	});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bun run test:unit -- src/lib/game/industry.spec.ts --run`
Expected: FAIL (`getCategoryTier` not exported; new ids missing).

- [ ] **Step 3: Extend the type unions and `IndustrialBuildingType`**

In `src/lib/game/types.ts`:

`MaterialId` — append after `| 'gifts'`:
```ts
	| 'gifts'
	| 'bottled-water'
	| 'produce'
	| 'pantry';
```

`IndustrialBuildingTypeId` — append after `| 'gift-workshop'`:
```ts
	| 'gift-workshop'
	| 'water-bottler'
	| 'produce-packhouse'
	| 'pantry-works'
	| 'warehouse';
```

`ProductionRecipeId` — append after `| 'gift-production'`:
```ts
	| 'gift-production'
	| 'water-bottling'
	| 'produce-packing'
	| 'pantry-goods-production';
```

`IndustrialBuildingType` — add the tier field:
```ts
export interface IndustrialBuildingType {
	id: IndustrialBuildingTypeId;
	name: string;
	buildCost: number;
	dailyOperatingCost: number;
	requiredResource: IndustryResourceId | null;
	requiresIndustrialTile: boolean;
	recipeId: ProductionRecipeId | null;
	warehouseCapacity: number;
	/**
	 * Build-menu/chart grouping only — no gameplay gating. 1 = tier-1 chain
	 * buildings (cheap onboarding chains), 2 = deep-chain raw/process
	 * buildings, 3 = deep-chain final factories. A building shared by a tier-1
	 * and a deeper chain takes the lower tier.
	 */
	tier: 1 | 2 | 3;
}
```

- [ ] **Step 4: Add materials, recipes, building types, and tiers in `industry.ts`**

Append to `MATERIALS` (after `gifts`):

```ts
	'bottled-water': {
		id: 'bottled-water',
		name: 'Bottled Water',
		kind: 'finished',
		importCost: 3,
		localValue: 2
	},
	produce: {
		id: 'produce',
		name: 'Produce',
		kind: 'finished',
		importCost: 6,
		localValue: 4
	},
	pantry: {
		id: 'pantry',
		name: 'Pantry Goods',
		kind: 'finished',
		importCost: 8,
		localValue: 5
	}
```

Append to `PRODUCTION_RECIPES` (after `gift-production`):

```ts
	'water-bottling': {
		id: 'water-bottling',
		inputs: [{ materialId: 'water', quantity: 10 }],
		outputs: [{ materialId: 'bottled-water', quantity: 10 }],
		operatingCost: 5,
		stage: 'final'
	},
	'produce-packing': {
		id: 'produce-packing',
		inputs: [{ materialId: 'fruit', quantity: 8 }],
		outputs: [{ materialId: 'produce', quantity: 8 }],
		operatingCost: 6,
		stage: 'final'
	},
	'pantry-goods-production': {
		id: 'pantry-goods-production',
		inputs: [{ materialId: 'flour', quantity: 6 }],
		outputs: [{ materialId: 'pantry', quantity: 8 }],
		operatingCost: 8,
		stage: 'final'
	}
```

Margin sanity (asserted by the test): bottled-water 10×3=30/day vs water-pump 8 + water-bottler 6 + recipe 5 = 19 ✓; produce 8×6=48/day vs fruit-farm 14 + packhouse 8 + recipe 6 = 28 ✓.

Append to `INDUSTRIAL_BUILDING_TYPES` (before `warehouse`):

```ts
	'water-bottler': {
		id: 'water-bottler',
		name: 'Water Bottler',
		buildCost: 600,
		dailyOperatingCost: 6,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'water-bottling',
		warehouseCapacity: 0,
		tier: 1
	},
	'produce-packhouse': {
		id: 'produce-packhouse',
		name: 'Produce Packhouse',
		buildCost: 650,
		dailyOperatingCost: 8,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'produce-packing',
		warehouseCapacity: 0,
		tier: 1
	},
	'pantry-works': {
		id: 'pantry-works',
		name: 'Pantry Works',
		buildCost: 900,
		dailyOperatingCost: 10,
		requiredResource: null,
		requiresIndustrialTile: true,
		recipeId: 'pantry-goods-production',
		warehouseCapacity: 0,
		tier: 1
	},
```

Add `tier` to every existing building type (TypeScript now requires it). Exact assignments (from the spec):

- `tier: 1` — `water-pump`, `fruit-farm`, `grain-farm`, `flour-mill`, `warehouse` (plus the three new types above)
- `tier: 2` — `salt-mine`, `oilseed-farm`, `sugar-farm`, `pulpwood-grove`, `chemical-feedstock-well`, `oil-press`, `water-filtration-plant`, `syrup-plant`, `pulp-mill`, `plastic-plant`, `packaging-plant`, `chemical-plant`
- `tier: 3` — `snack-factory`, `drink-bottling-plant`, `household-goods-factory`, `gift-workshop`

Extend `CONVENIENCE_BUILDING_TYPE_IDS` — insert before `'warehouse'`:
```ts
	'gift-workshop',
	'water-bottler',
	'produce-packhouse',
	'pantry-works',
	'warehouse'
```

Extend `FINISHED_PRODUCT_MATERIAL_IDS`:
```ts
export const FINISHED_PRODUCT_MATERIAL_IDS = [
	'snacks',
	'drinks',
	'essentials',
	'gifts',
	'bottled-water',
	'produce',
	'pantry'
] as const satisfies readonly MaterialId[];
```

Add `getCategoryTier` after `getIndustrialBuildingTypesForProductChain` (it reuses the private `isMaterialId` helper already in the file):

```ts
export function getCategoryTier(categoryId: string): 1 | 2 | 3 | null {
	if (!isMaterialId(categoryId) || MATERIALS[categoryId].kind !== 'finished') {
		return null;
	}

	const finalFactory = Object.values(INDUSTRIAL_BUILDING_TYPES).find(
		(buildingType) =>
			buildingType.recipeId !== null &&
			PRODUCTION_RECIPES[buildingType.recipeId].outputs.some(
				(output) => output.materialId === categoryId
			)
	);

	return finalFactory?.tier ?? null;
}
```

- [ ] **Step 5: Register the art (exhaustive `Record<MaterialId, …>` types force this now)**

In `src/lib/assets/gameArt.ts`, append to `INDUSTRY_MATERIAL_ART`:
```ts
	gifts: '/assets/game/industry/materials/gifts.png',
	'bottled-water': '/assets/game/industry/materials/bottled-water.png',
	produce: '/assets/game/industry/materials/produce.png',
	pantry: '/assets/game/industry/materials/pantry.png'
```
Append to `INDUSTRIAL_BUILDING_ART` (before `warehouse`):
```ts
	'water-bottler': '/assets/game/industry/buildings/water-bottler.png',
	'produce-packhouse': '/assets/game/industry/buildings/produce-packhouse.png',
	'pantry-works': '/assets/game/industry/buildings/pantry-works.png',
```

In `src/lib/assets/gameArt.spec.ts`, add the same three entries to the local `industryMaterialPaths` and `industrialBuildingPaths` tables (the spec asserts exact key equality).

- [ ] **Step 6: Run the tests**

Run: `bun run test:unit -- src/lib/game/industry.spec.ts src/lib/assets/gameArt.spec.ts --run`
Expected: PASS

Run: `bun run check`
Expected: 0 errors (this catches any `Record<MaterialId, …>` or `tier` omissions anywhere in the codebase — fix any site it flags before committing).

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/industry.ts src/lib/game/industry.spec.ts src/lib/assets/gameArt.ts src/lib/assets/gameArt.spec.ts
git commit -m "feat: add tier-1 materials, recipes, buildings, and building tiers"
```

---

### Task 3: Convenience archetype lineup + bottled-water product art

A level-1 store sells only `startingCategories[0]` (`stock.ts:55`), so `bottled-water` goes first. `household` stays as the unreachable 5th entry for legacy saves (see deviation note at top).

**Files:**
- Modify: `src/lib/game/archetypes.ts:32-72` (convenience `startingCategories`)
- Modify: `src/lib/assets/gameArt.ts` (`ProductArtCategoryId`, `PRODUCT_ART`)
- Test: `src/lib/game/archetypes.spec.ts`, `src/lib/game/stock.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/game/archetypes.spec.ts`:

```ts
describe('convenience tier 1 lineup', () => {
	it('starts with bottled water so a level-1 store gets a tier 1 chain', () => {
		const convenience = getArchetype('convenience');
		expect(convenience.startingCategories.map((category) => category.id)).toEqual([
			'bottled-water',
			'snacks',
			'drinks',
			'essentials',
			'household'
		]);
	});
});
```

Append to `src/lib/game/stock.spec.ts`:

```ts
describe('tier 1 store products', () => {
	it('gives a new level-1 convenience store only bottled water', () => {
		const products = initializeStoreProducts('convenience');
		expect(products.map((product) => product.categoryId)).toEqual(['bottled-water']);
	});

	it('maps the new categories to finished materials', () => {
		expect(getFinishedMaterialIdForCategory('bottled-water')).toBe('bottled-water');
		expect(getFinishedMaterialIdForCategory('produce')).toBe('produce');
		expect(getFinishedMaterialIdForCategory('pantry')).toBe('pantry');
	});
});
```

(Add `initializeStoreProducts` / `getFinishedMaterialIdForCategory` to the existing imports from `./stock` if missing. `initializeStoreProducts` takes the archetype id and an optional level — check its exact signature at `stock.ts:52` and pass level 1 explicitly if required.)

Run: `bun run test:unit -- src/lib/game/archetypes.spec.ts src/lib/game/stock.spec.ts --run`
Expected: the two new tests FAIL.

- [ ] **Step 2: Reorder the convenience categories**

In `src/lib/game/archetypes.ts`, inside the convenience archetype, insert as the FIRST element of `startingCategories` (before `snacks`):

```ts
			{
				id: 'bottled-water',
				name: 'Bottled Water',
				baseDemand: 96,
				margin: 0.3,
				demandWeight: 1.2,
				importCost: 2,
				defaultSellingPrice: 3,
				priceSensitivity: 0.7
			},
```

Leave snacks/drinks/essentials/household in their current order after it.

- [ ] **Step 3: Register the product icon**

In `src/lib/assets/gameArt.ts` add `'bottled-water'` to the `ProductArtCategoryId` union and add to `PRODUCT_ART`:

```ts
	'bottled-water': Object.freeze({
		categoryId: 'bottled-water',
		path: '/assets/game/products/bottled-water.png',
		alt: 'Product icon for bottled water'
	}),
```

(`gameArt.spec.ts` derives expected product ids from `ARCHETYPES`, so no spec-table edit is needed here — it now expects bottled-water automatically.)

- [ ] **Step 4: Run the full unit suite and fix reorder fallout**

Run: `bun run test:unit -- --run`

The reorder changes what a new convenience store stocks, which several specs assume. Locate hits with:
`grep -rn "snacks" src --include="*.spec.ts" | grep -v industry.spec`

Known likely fixes (apply the same principle everywhere — tests that need a snacks-stocking store should either use a milestone-leveled store or address products by `categoryId` instead of index `[0]`):

- `stock.spec.ts` — assertions that `initializeStoreProducts('convenience')[0]` is snacks → now bottled-water.
- `simulateDay.spec.ts` / `state.spec.ts` — fixtures reading `store.products[0]` as snacks → find by `categoryId === 'snacks'` after leveling, or switch the assertion to bottled-water.
- Svelte specs (`StoreStockTable`, `StoreOverview`, `ProductChainsPanel`, etc.) — fixture stores built from `createNewGame('convenience', …)` now show Bottled Water first.
- `productChainGraph.spec.ts` — summaries tests now include the bottled-water category for convenience stores.

Do NOT change game-logic behavior to make a test pass; only update test expectations to the new lineup.

Expected after fixes: full unit suite PASS.

- [ ] **Step 5: Commit**

```bash
git add -A src
git commit -m "feat: convenience stores open with the bottled water tier-1 category"
```

---

### Task 4: Milestone unlock = first starting category not already stocked

`state.ts:240` picks `startingCategories[unlockedCount - 1]` by index. A legacy convenience store saved before the reorder (e.g. level 4 stocking `[snacks, drinks]`) would receive `drinks` again (no-op thanks to the existing guard) and never get bottled water. New rule: scan `startingCategories` in order and add the first one the store doesn't stock.

**Files:**
- Modify: `src/lib/game/state.ts:237-244`
- Test: `src/lib/game/state.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/game/state.spec.ts` (reuse the file's existing store/game fixture helpers; the essential shape is below — adapt constructor calls to the file's local helpers):

```ts
describe('milestone category unlock with reordered lineups', () => {
	it('adds the first starting category the store does not already stock', () => {
		// Legacy store: saved before bottled water existed — level 3, stocking snacks only.
		let game = createNewGame('convenience', 20260611);
		const legacyStore = {
			...game.stores[0]!,
			level: 3,
			products: [createStoreProduct(getArchetype('convenience').startingCategories[1]!)]
		};
		game = { ...game, cash: 1_000_000, stores: [legacyStore] };

		const upgraded = upgradeStore(game, legacyStore.id);

		expect(upgraded.stores[0]!.level).toBe(4);
		expect(upgraded.stores[0]!.products.map((product) => product.categoryId)).toEqual([
			'snacks',
			'bottled-water'
		]);
	});

	it('never adds a duplicate across successive milestones', () => {
		let game = createNewGame('convenience', 20260611);
		game = { ...game, cash: 10_000_000 };

		for (let level = game.stores[0]!.level; level < 10; level++) {
			game = upgradeStore(game, game.stores[0]!.id);
		}

		const categoryIds = game.stores[0]!.products.map((product) => product.categoryId);
		expect(new Set(categoryIds).size).toBe(categoryIds.length);
		expect(categoryIds).toEqual(['bottled-water', 'snacks', 'drinks', 'essentials']);
	});
});
```

Run: `bun run test:unit -- src/lib/game/state.spec.ts --run`
Expected: first test FAILS (legacy store gets nothing at level 4 — indexed pick lands on an already-stocked category).

- [ ] **Step 2: Implement the rule**

In `src/lib/game/state.ts`, replace the milestone block (lines 237–244):

```ts
	if (isMilestoneLevel(nextLevel)) {
		const archetype = getArchetype(store.archetypeId);
		const unlockedCount = getUnlockedCategoryCount(nextLevel);
		const newCategory = archetype.startingCategories.find(
			(category) => !products.some((product) => product.categoryId === category.id)
		);

		if (newCategory && products.length < unlockedCount) {
			products = [...products, createStoreProduct(newCategory)];
		}
```

(The `products.length < unlockedCount` guard keeps the unlock-count cap: a store can never stock more categories than its level allows, and legacy stores that are already full gain nothing.)

- [ ] **Step 3: Run the tests**

Run: `bun run test:unit -- src/lib/game/state.spec.ts --run`
Expected: PASS (including pre-existing milestone tests — if one asserts the old indexed behavior, update it to the new rule's outcome).

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/state.ts src/lib/game/state.spec.ts
git commit -m "fix: milestone unlock adds first unstocked starting category"
```

---

### Task 5: Save round-trip regression test (no codec change expected)

**Files:**
- Test: `src/lib/persistence/saveRepository.spec.ts`

- [ ] **Step 1: Write the test (should pass immediately — it's a regression guard)**

Append to `src/lib/persistence/saveRepository.spec.ts`, following the file's existing encode/decode helper usage:

```ts
describe('pre-tier-1 save compatibility', () => {
	it('round-trips a save whose warehouse lacks the new material keys', async () => {
		const game = createNewGame('convenience', 20260611);
		const legacyGame = {
			...game,
			warehouse: {
				...game.warehouse,
				// Simulate an old save: only legacy materials present.
				materials: { grain: 12, snacks: 3 }
			}
		};

		const repository = createSaveStoreRepository();
		await repository.saveAuto(legacyGame);
		const loaded = await repository.loadAuto();

		expect(loaded?.warehouse.materials).toEqual({ grain: 12, snacks: 3 });
		expect(loaded?.warehouse.materials['bottled-water']).toBeUndefined();
	});
});
```

Adapt the repository construction and save/load method names to the existing spec file's patterns (`saveStoreRepository.ts` is the in-memory test backend; the spec file already exercises it — mirror its call style exactly).

- [ ] **Step 2: Run it**

Run: `bun run test:unit -- src/lib/persistence/saveRepository.spec.ts --run`
Expected: PASS. If it fails, the codec has an exhaustive material list somewhere — fix `saveCodec.ts` to treat `warehouse.materials` as an open partial record, never a required-key record.

- [ ] **Step 3: Commit**

```bash
git add src/lib/persistence/saveRepository.spec.ts
git commit -m "test: guard pre-tier-1 save round-trip"
```

---

### Task 6: Export shared chain helpers + extend `ProductChainNode`

Low-churn enabler for the tree builder: the helpers stay in `productChainGraph.ts`; they just become exported. No behavior change.

**Files:**
- Modify: `src/lib/game/productChainGraph.ts`

- [ ] **Step 1: Add `export` to these currently-private declarations**

`MATERIAL_PRODUCER_RECIPES` (the `const` at line ~102), `isSupportedFinishedMaterial`, `latestProductionReport`, `latestStoreProductReport`, `buildingTypesForRecipe`, `buildingsForRecipe`, `getRecipeThroughputUnits`, `recipeOutputPerDay`, `recipeInputPerDay`, `emptyActualMetrics`, `materialActualMetrics`, `createInputWeightMap`, `allocateInputMovement`, `healthLabel`, `formatRecipeEdgeLabel`, `materialHealth`, `bottleneckText`, `sortEdges`, `emptyGraph`, and the `ChainInputWeight` interface.

- [ ] **Step 2: Extend the node interface**

In the `ProductChainNode` interface add two optional fields:

```ts
	/** Output material name shown under the building name on merged tree cards. */
	subLabel?: string;
	/** Set when a tree duplicates this producer into multiple branches. */
	sharedBranchCount?: number;
```

- [ ] **Step 3: Verify nothing changed behaviorally**

Run: `bun run test:unit -- src/lib/game/productChainGraph.spec.ts --run && bun run check`
Expected: PASS / 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/productChainGraph.ts
git commit -m "refactor: export chain helpers and extend ProductChainNode for tree view"
```

---### Task 7: `buildProductChainTree`

**Files:**
- Create: `src/lib/game/productChainTree.ts`
- Create: `src/lib/game/productChainTree.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/game/productChainTree.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildProductChainTree } from './productChainTree';
import { createNewGame } from './state';
import type { GameState } from './types';

function convenienceGame(): GameState {
	return { ...createNewGame('convenience', 20260611), cash: 1_000_000 };
}

describe('buildProductChainTree', () => {
	it('builds the bottled water chain as a three-node spine', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: game.stores[0]!, categoryId: 'bottled-water' });

		expect(tree.id).toBe('chain:bottled-water');
		expect(tree.emptyReason).toBeNull();
		expect(tree.nodes.map((node) => node.id)).toEqual([
			'recipe:water-pumping@water-bottling',
			'recipe:water-bottling',
			'product:bottled-water'
		]);
		expect(tree.edges.map((edge) => edge.id)).toEqual([
			'recipe:water-bottling->product:bottled-water',
			'recipe:water-pumping@water-bottling->recipe:water-bottling'
		]);
	});

	it('gives every non-root node exactly one outgoing edge (tree property)', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'snacks' });

		const sourceCounts = new Map<string, number>();
		for (const edge of tree.edges) {
			sourceCounts.set(edge.source, (sourceCounts.get(edge.source) ?? 0) + 1);
		}
		for (const node of tree.nodes) {
			if (node.id === 'product:snacks') continue;
			expect(sourceCounts.get(node.id), `${node.id} must feed exactly one parent`).toBe(1);
		}
	});

	it('duplicates shared sub-chains per branch with unique path-suffixed ids', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'snacks' });

		const ids = tree.nodes.map((node) => node.id);
		expect(new Set(ids).size).toBe(ids.length);
		// Water feeds drinks via two routes in the drinks chain; in the snacks
		// chain, packaging pulls pulp + plastic — both sub-chains must appear
		// under the packaging branch with path suffixes.
		expect(ids).toContain('recipe:pulp-milling@snack-production/packaging-production');
		expect(ids).toContain('recipe:plastic-production@snack-production/packaging-production');
	});

	it('marks duplicated producers with a shared branch count', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'drinks' });

		// Water pumping feeds filtration directly and syrup production in the drinks chain.
		const waterCopies = tree.nodes.filter((node) => node.recipeId === 'water-pumping');
		expect(waterCopies.length).toBeGreaterThanOrEqual(2);
		for (const copy of waterCopies) {
			expect(copy.sharedBranchCount).toBe(waterCopies.length);
		}
	});

	it('lays out a planar tree: each parent row sits within its children rows', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'snacks' });

		const byId = tree.details;
		const childrenOf = new Map<string, string[]>();
		for (const edge of tree.edges) {
			childrenOf.set(edge.target, [...(childrenOf.get(edge.target) ?? []), edge.source]);
		}
		for (const [parentId, childIds] of childrenOf) {
			const rows = childIds.map((id) => byId[id]!.row);
			expect(byId[parentId]!.row).toBeGreaterThanOrEqual(Math.min(...rows));
			expect(byId[parentId]!.row).toBeLessThanOrEqual(Math.max(...rows));
			// Every child sits exactly one layer to the left of its parent.
			for (const id of childIds) {
				expect(byId[id]!.layer).toBe(byId[parentId]!.layer - 1);
			}
		}
		// Leaves occupy distinct rows — no overlap.
		const leafRows = tree.nodes
			.filter((node) => !childrenOf.has(node.id))
			.map((node) => node.row);
		expect(new Set(leafRows).size).toBe(leafRows.length);
	});

	it('labels merged cards with the building name and output material', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'pantry' });

		const mill = tree.nodes.find((node) => node.id === 'recipe:flour-milling@pantry-goods-production');
		expect(mill?.label).toBe('Flour Mill');
		expect(mill?.subLabel).toBe('Flour');
		expect(mill?.kind).toBe('recipe');
		const root = tree.nodes.find((node) => node.id === 'product:pantry');
		expect(root?.label).toBe('Pantry Goods');
		expect(root?.kind).toBe('material');
	});

	it('flags chains with no placed buildings and no report', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: game.stores[0]!, categoryId: 'bottled-water' });

		expect(tree.warnings).toContain('No daily report yet; latest-day flow is unavailable.');
		const bottler = tree.details['recipe:water-bottling']!;
		expect(bottler.health).toBe('no-local-capacity');
		expect(bottler.capacity.buildingCount).toBe(0);
	});

	it('returns an empty graph for categories without chains', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'apparel' });

		expect(tree.nodes).toEqual([]);
		expect(tree.emptyReason).toBe('No local production chain available for this category yet.');
	});
});
```

Run: `bun run test:unit -- src/lib/game/productChainTree.spec.ts --run`
Expected: FAIL — module does not exist.

- [ ] **Step 2: Implement `src/lib/game/productChainTree.ts`**

```ts
import { MATERIALS, PRODUCTION_RECIPES } from './industry';
import {
	MATERIAL_PRODUCER_RECIPES,
	allocateInputMovement,
	bottleneckText,
	buildingTypesForRecipe,
	buildingsForRecipe,
	createInputWeightMap,
	emptyGraph,
	formatRecipeEdgeLabel,
	getRecipeThroughputUnits,
	healthLabel,
	isSupportedFinishedMaterial,
	latestProductionReport,
	latestStoreProductReport,
	materialActualMetrics,
	materialHealth,
	recipeInputPerDay,
	recipeOutputPerDay,
	sortEdges,
	type ProductChainEdge,
	type ProductChainGraph,
	type ProductChainHealth,
	type ProductChainNode
} from './productChainGraph';
import type { GameState, MaterialId, ProductionRecipeId, Store } from './types';

interface TreeEntry {
	node: ProductChainNode;
	depth: number;
	children: TreeEntry[];
}

/**
 * Builds a product chain as a strict tree: producers shared by several
 * consumers are duplicated into each branch (ids gain an `@<path>` suffix),
 * which makes the layout planar — every node has one parent, so edges cannot
 * cross. Metrics on duplicated copies are chain-wide for that material.
 */
export function buildProductChainTree(input: {
	game: GameState;
	store: Store | null;
	categoryId: string;
}): ProductChainGraph {
	if (!isSupportedFinishedMaterial(input.categoryId)) {
		return emptyGraph(
			`chain:${input.categoryId}`,
			'Product chain',
			'No local production chain available for this category yet.'
		);
	}

	const rootMaterialId = input.categoryId as MaterialId;
	const rootRecipeId = MATERIAL_PRODUCER_RECIPES.get(rootMaterialId);

	if (!rootRecipeId) {
		return emptyGraph(
			`chain:${rootMaterialId}`,
			MATERIALS[rootMaterialId]?.name ?? rootMaterialId,
			'No local production chain available for this category yet.'
		);
	}

	const report = latestProductionReport(input.game);
	const productReport = latestStoreProductReport(input.game, input.store, rootMaterialId);
	const inputWeights = createInputWeightMap(input.game.industrialBuildings, report);
	const warnings: string[] = [];
	const edges: ProductChainEdge[] = [];
	const recipeCopies = new Map<ProductionRecipeId, ProductChainNode[]>();

	if (!report) {
		warnings.push('No daily report yet; latest-day flow is unavailable.');
	}

	const materialMetrics = (materialId: MaterialId) => {
		const producerRecipeId = MATERIAL_PRODUCER_RECIPES.get(materialId);
		const actual = materialActualMetrics(
			report,
			materialId,
			materialId === rootMaterialId ? productReport : null
		);
		const health = materialHealth({
			hasReport: report !== null,
			actual,
			warehouseStock: input.game.warehouse.materials[materialId] ?? 0,
			producerBuildingCount: producerRecipeId
				? buildingsForRecipe(input.game.industrialBuildings, producerRecipeId).length
				: 0,
			hasProducerRecipe: producerRecipeId !== undefined
		});
		return { actual, health };
	};

	function buildRecipeEntry(
		recipeId: ProductionRecipeId,
		outputMaterialId: MaterialId,
		path: string,
		depth: number
	): TreeEntry {
		const recipe = PRODUCTION_RECIPES[recipeId];
		const id = path === '' ? `recipe:${recipeId}` : `recipe:${recipeId}@${path}`;
		const childPath = path === '' ? recipeId : `${path}/${recipeId}`;
		const buildingCount = buildingsForRecipe(input.game.industrialBuildings, recipeId).length;
		const throughputUnits = getRecipeThroughputUnits(input.game.industrialBuildings, recipeId);
		const { actual, health: outputHealth } = materialMetrics(outputMaterialId);
		// Zero placed buildings outranks "no report yet", matching the old
		// recipeHealth precedence: the player must build before reports matter.
		const health: ProductChainHealth =
			buildingCount === 0 ? 'no-local-capacity' : outputHealth;
		const label = buildingTypesForRecipe(recipeId)[0]?.name ?? recipeId;
		const node: ProductChainNode = {
			id,
			kind: 'recipe',
			label,
			subLabel: MATERIALS[outputMaterialId]?.name ?? outputMaterialId,
			materialId: outputMaterialId,
			recipeId,
			stage: recipe.stage,
			layer: 0,
			row: 0,
			health,
			healthLabel: healthLabel(health),
			warehouseStock: input.game.warehouse.materials[outputMaterialId] ?? 0,
			capacity: {
				buildingCount,
				outputPerDay: recipeOutputPerDay(recipe, throughputUnits),
				inputPerDay: recipeInputPerDay(recipe, throughputUnits)
			},
			actual,
			bottleneck: bottleneckText({ kind: 'recipe', health, label })
		};
		recipeCopies.set(recipeId, [...(recipeCopies.get(recipeId) ?? []), node]);

		const children: TreeEntry[] = [];

		for (const inputMaterial of recipe.inputs) {
			const producerRecipeId = MATERIAL_PRODUCER_RECIPES.get(inputMaterial.materialId);

			if (!producerRecipeId) {
				warnings.push(
					`No production recipe found for ${
						MATERIALS[inputMaterial.materialId]?.name ?? inputMaterial.materialId
					}.`
				);
				continue;
			}

			const child = buildRecipeEntry(
				producerRecipeId,
				inputMaterial.materialId,
				childPath,
				depth + 1
			);
			children.push(child);

			const childActual = materialActualMetrics(report, inputMaterial.materialId, null);
			// allocateInputMovement parses the *consuming* recipe out of a plain
			// `recipe:<id>` node id, so pass the unsuffixed id here.
			const actualPerDay = allocateInputMovement(
				inputWeights,
				inputMaterial.materialId,
				`recipe:${recipeId}`,
				childActual.consumed
			);
			const importedPerDay = allocateInputMovement(
				inputWeights,
				inputMaterial.materialId,
				`recipe:${recipeId}`,
				childActual.importedInput
			);

			edges.push({
				id: `${child.node.id}->${id}`,
				source: child.node.id,
				target: id,
				materialId: inputMaterial.materialId,
				label: formatRecipeEdgeLabel({
					actualPerDay,
					requiredPerCycle: inputMaterial.quantity,
					direction: 'input',
					imported: importedPerDay
				}),
				requiredPerCycle: inputMaterial.quantity,
				actualPerDay,
				health: child.node.health
			});
		}

		return { node, depth, children };
	}

	const factoryEntry = buildRecipeEntry(rootRecipeId, rootMaterialId, '', 1);
	const { actual: rootActual, health: rootHealth } = materialMetrics(rootMaterialId);
	const rootLabel = MATERIALS[rootMaterialId].name;
	const rootNode: ProductChainNode = {
		id: `product:${rootMaterialId}`,
		kind: 'material',
		label: rootLabel,
		materialId: rootMaterialId,
		recipeId: null,
		stage: 'finished',
		layer: 0,
		row: 0,
		health: rootHealth,
		healthLabel: healthLabel(rootHealth),
		warehouseStock: input.game.warehouse.materials[rootMaterialId] ?? 0,
		capacity: { buildingCount: 0, outputPerDay: 0, inputPerDay: 0 },
		actual: rootActual,
		bottleneck: bottleneckText({ kind: 'material', health: rootHealth, label: rootLabel })
	};
	const rootEntry: TreeEntry = { node: rootNode, depth: 0, children: [factoryEntry] };
	const rootOutputQuantity =
		PRODUCTION_RECIPES[rootRecipeId].outputs.find((output) => output.materialId === rootMaterialId)
			?.quantity ?? 0;

	edges.push({
		id: `${factoryEntry.node.id}->${rootNode.id}`,
		source: factoryEntry.node.id,
		target: rootNode.id,
		materialId: rootMaterialId,
		label: formatRecipeEdgeLabel({
			actualPerDay: rootActual.produced,
			requiredPerCycle: rootOutputQuantity,
			direction: 'output',
			imported: 0
		}),
		requiredPerCycle: rootOutputQuantity,
		actualPerDay: rootActual.produced,
		health: rootHealth
	});

	for (const copies of recipeCopies.values()) {
		if (copies.length > 1) {
			for (const copy of copies) {
				copy.sharedBranchCount = copies.length;
			}
		}
	}

	layOutTree(rootEntry);

	const nodes: ProductChainNode[] = [];
	collectNodes(rootEntry, nodes);
	nodes.sort((first, second) => first.layer - second.layer || first.row - second.row);
	const details = Object.fromEntries(nodes.map((node) => [node.id, node]));

	return {
		id: `chain:${rootMaterialId}`,
		title: `${rootLabel} chain`,
		nodes,
		edges: sortEdges(edges),
		details,
		warnings,
		emptyReason: null
	};
}

/**
 * Tidy-tree layout: leaves take consecutive rows top-to-bottom, every parent
 * sits at the midpoint of its children, and layer counts depth from the raw
 * end so the finished product lands in the rightmost column.
 */
function layOutTree(root: TreeEntry): void {
	let maxDepth = 0;
	visit(root, (entry) => {
		maxDepth = Math.max(maxDepth, entry.depth);
	});

	let nextLeafRow = 0;

	const assignRows = (entry: TreeEntry): number => {
		entry.node.layer = maxDepth - entry.depth;

		if (entry.children.length === 0) {
			entry.node.row = nextLeafRow;
			nextLeafRow += 1;
			return entry.node.row;
		}

		const childRows = entry.children.map(assignRows);
		entry.node.row = (childRows[0]! + childRows[childRows.length - 1]!) / 2;
		return entry.node.row;
	};

	assignRows(root);
}

function visit(entry: TreeEntry, callback: (entry: TreeEntry) => void): void {
	callback(entry);
	for (const child of entry.children) {
		visit(child, callback);
	}
}

function collectNodes(entry: TreeEntry, nodes: ProductChainNode[]): void {
	nodes.push(entry.node);
	for (const child of entry.children) {
		collectNodes(child, nodes);
	}
}
```

Layout caveat the tests will surface: the root product node and its single-child factory chain inherit the midpoint of one child, so a pure spine (bottled water) stacks all three nodes on row 0 across layers 0/1/2 — correct and crossing-free.

- [ ] **Step 3: Run the tests**

Run: `bun run test:unit -- src/lib/game/productChainTree.spec.ts --run`
Expected: PASS. If the planarity test fails, check that `assignRows` recurses children in recipe-input order and that `layer = maxDepth - depth` (children exactly one layer left of parents holds because every child's depth is parent depth + 1).

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/productChainTree.ts src/lib/game/productChainTree.spec.ts
git commit -m "feat: add tree-per-product chain builder with planar layout"
```

---

### Task 8: Category summaries move to the tree (+ tier ordering)

`buildStoreCategoryChainSummaries` moves into `productChainTree.ts` (it now derives from the tree root; keeping it in `productChainGraph.ts` would create a circular import). Summaries gain `tier` and sort Tier 1 first.

**Files:**
- Modify: `src/lib/game/productChainTree.ts`, `src/lib/game/productChainGraph.ts`
- Test: `src/lib/game/productChainTree.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/game/productChainTree.spec.ts` (add `buildStoreCategoryChainSummaries` to the import from `./productChainTree`):

```ts
describe('buildStoreCategoryChainSummaries (tree)', () => {
	it('lists tier 1 categories first and carries the tier', () => {
		const game = convenienceGame();
		const summaries = buildStoreCategoryChainSummaries(game);

		expect(summaries[0]?.categoryId).toBe('bottled-water');
		expect(summaries[0]?.tier).toBe(1);
		expect(summaries.map((summary) => summary.categoryId)).toContain('snacks');
		const snacks = summaries.find((summary) => summary.categoryId === 'snacks');
		expect(snacks?.tier).toBe(3);
		const tiers = summaries.map((summary) => summary.tier ?? 99);
		expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
	});
});
```

Run: `bun run test:unit -- src/lib/game/productChainTree.spec.ts --run` — FAIL (not exported from tree module).

- [ ] **Step 2: Move and adapt the summaries builder**

In `src/lib/game/productChainGraph.ts`:
- Add `tier: 1 | 2 | 3 | null;` to the `ProductChainCategorySummary` interface.
- Export `latestCategoryUnitsSold` (add `export` keyword).
- DELETE the `buildStoreCategoryChainSummaries` function (moving below).

In `src/lib/game/productChainTree.ts` add (imports: `getCategoryTier` from `./industry`; `getSupportedStoreChainCategories`, `latestCategoryUnitsSold`, `type ProductChainCategorySummary` from `./productChainGraph`):

```ts
export function buildStoreCategoryChainSummaries(game: GameState): ProductChainCategorySummary[] {
	const summaries = new Map<string, ProductChainCategorySummary>();

	for (const store of game.stores) {
		for (const category of getSupportedStoreChainCategories(store)) {
			if (summaries.has(category.id)) {
				continue;
			}

			const tree = buildProductChainTree({ game, store: null, categoryId: category.id });
			const rootNode = tree.nodes.find((node) => node.id === `product:${category.id}`);
			summaries.set(category.id, {
				categoryId: category.id,
				name: category.name,
				tier: getCategoryTier(category.id),
				health: rootNode?.health ?? 'no-report',
				healthLabel: rootNode?.healthLabel ?? 'No report yet',
				bottleneck: rootNode?.bottleneck ?? 'No graph data available.',
				warehouseStock: rootNode?.warehouseStock ?? 0,
				produced: rootNode?.actual.produced ?? 0,
				consumed: latestCategoryUnitsSold(game, category.id),
				imported: (rootNode?.actual.importedInput ?? 0) + (rootNode?.actual.shopImported ?? 0)
			});
		}
	}

	return [...summaries.values()].sort(
		(first, second) =>
			(first.tier ?? Number.MAX_SAFE_INTEGER) - (second.tier ?? Number.MAX_SAFE_INTEGER) ||
			first.name.localeCompare(second.name)
	);
}
```

- [ ] **Step 3: Fix the import sites of the moved function**

`grep -rn "buildStoreCategoryChainSummaries" src --include="*.ts" --include="*.svelte"` — update each import to `$lib/game/productChainTree` (expected: `ProductChainsPanel.svelte`, `productChainGraph.spec.ts` → move those summary tests into `productChainTree.spec.ts` or update their import).

- [ ] **Step 4: Run and commit**

Run: `bun run test:unit -- src/lib/game/productChainTree.spec.ts src/lib/game/productChainGraph.spec.ts --run && bun run check`
Expected: PASS / 0 errors.

```bash
git add -A src
git commit -m "feat: tier-aware category summaries derived from chain trees"
```

---

### Task 9: Switch the panels to the tree; merged-card UI; label anchor; delete the old DAG builder

**Files:**
- Modify: `src/lib/components/game/ProductChainsPanel.svelte`, `src/lib/components/game/StoreProductChainPanel.svelte`
- Modify: `src/lib/components/game/atlas/ChainNode.svelte`, `src/lib/components/game/atlas/NodeBroadside.svelte`, `src/lib/components/game/atlas/ChainRoute.svelte`
- Modify: `src/lib/game/productChainGraph.ts` (delete `buildProductChainGraph`), `src/lib/game/productChainGraph.spec.ts`
- Test: existing `.svelte.spec.ts` files for these components

**Reminder (CLAUDE.md):** run the Svelte MCP tools — `list-sections` → `get-documentation` before editing, `svelte-autofixer` on every changed component until clean.

- [ ] **Step 1: Point both panels at the tree builder**

`ProductChainsPanel.svelte`: replace the `buildProductChainGraph` import with `buildProductChainTree` from `$lib/game/productChainTree` (keep `buildWarehouseFlowGraph` + `getSupportedStoreChainCategories` from `$lib/game/productChainGraph`; `buildStoreCategoryChainSummaries` now comes from the tree module per Task 8). In the `categoryGraph` derivation swap the call:

```ts
	const categoryGraph = $derived(
		activeCategory
			? buildProductChainTree({
					game,
					store: null,
					categoryId: activeCategory.categoryId
				})
			: null
	);
```

`StoreProductChainPanel.svelte`: same swap — `buildProductChainTree({ game, store, categoryId: selectedCategory.id })`.

- [ ] **Step 2: ChainNode merged-card sub-label**

In `ChainNode.svelte`, after the `<span class="cartouche">{node.label}</span>` line add:

```svelte
	{#if node.subLabel}
		<span class="sub-cartouche">{node.subLabel}</span>
	{/if}
```

And in the style block:

```css
	.sub-cartouche {
		font-family: var(--font-body);
		font-size: 11px;
		font-style: italic;
		color: var(--ink-500);
	}

	.is-compact .sub-cartouche {
		font-size: 9.5px;
	}
```

- [ ] **Step 3: NodeBroadside shared-branch note**

In `NodeBroadside.svelte`, after the `{#if node.bottleneck}` block add:

```svelte
		{#if node.sharedBranchCount}
			<p class="shared-note">
				Shared producer — drawn in {node.sharedBranchCount} branches of this chain.
			</p>
		{/if}
```

Style:

```css
	.shared-note {
		margin: 0;
		font-family: var(--font-body);
		font-size: 11.5px;
		font-style: italic;
		color: var(--ink-500);
	}
```

- [ ] **Step 4: ChainRoute label anchored at t = 0.3 on the curve**

In `ChainRoute.svelte`, replace the `mid` derivation with an exact cubic-bezier point so converging edges don't stack labels at shared midpoints:

```ts
	const labelPoint = $derived.by(() => {
		const t = 0.3;
		const u = 1 - t;
		const dx = Math.max(40, (target.x - source.x) / 2);
		const c1 = { x: source.x + dx, y: source.y };
		const c2 = { x: target.x - dx, y: target.y };
		return {
			x: u * u * u * source.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * target.x,
			y: u * u * u * source.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * target.y
		};
	});
```

And change the label group transform to `translate(${labelPoint.x}, ${labelPoint.y - 8})`.

- [ ] **Step 5: Delete the old category-DAG builder**

In `productChainGraph.ts` delete `buildProductChainGraph` (the warehouse-flow builder, supported-category helpers, and all exported helpers stay). `grep -rn "buildProductChainGraph" src` must come back empty except the spec file; in `productChainGraph.spec.ts` delete the category-graph `describe` blocks (their coverage now lives in `productChainTree.spec.ts`), keep warehouse-flow and `aggregateProductReports` tests. Also remove the `ProductChainNode` import in `gameArt.ts`? — no: `chainNodeArt(node)` still takes `ProductChainNode`; the type stays exported. Leave `gameArt.ts` untouched.

- [ ] **Step 6: Run client + server suites, fix component-spec fallout**

Run: `bun run test:unit -- --run`

Component specs that built category graphs via the old builder (e.g. `ProductChainAtlas.svelte.spec.ts`, `ProductChainsPanel.svelte.spec.ts`, `StoreProductChainPanel.svelte.spec.ts`, `ChainNode.svelte.spec.ts`) need: imports switched to `buildProductChainTree`, node-id expectations updated (`material:snacks` → `product:snacks`, `recipe:snack-production` keeps its id, duplicated producers gain `@path` suffixes), and the default selected category for a convenience game is now bottled-water.

Run `svelte-autofixer` (Svelte MCP) on every modified `.svelte` file until it reports no issues.

Expected: full unit suite PASS, `bun run check` 0 errors.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat: render product chains as planar trees with merged building cards"
```

---

### Task 10: Tier badge on the stamp index + tier-sorted industry build menu

**Files:**
- Modify: `src/lib/components/game/atlas/CategoryStampIndex.svelte`
- Modify: `src/lib/components/game/BuildMenu.svelte:76-80`
- Test: `src/lib/components/game/atlas/CategoryStampIndex.svelte.spec.ts`, `src/lib/components/game/BuildMenu.svelte.spec.ts`

- [ ] **Step 1: Write the failing client-project tests**

Append to `CategoryStampIndex.svelte.spec.ts`, following the file's existing render/props pattern (summaries fixtures now need the `tier` field from Task 8):

```ts
	it('shows a tier badge on tiered categories', async () => {
		// Build a summary fixture with tier: 1 and assert the badge text renders.
		// (Adapt to the file's existing render helper.)
		const { getByTestId } = render(CategoryStampIndex, {
			props: {
				summaries: [summaryFixture({ categoryId: 'bottled-water', name: 'Bottled Water', tier: 1 })],
				activeCategoryId: null,
				mode: 'store-categories',
				onSelectCategory: () => {}
			}
		});
		const stamp = getByTestId('category-stamp-bottled-water');
		expect(stamp.textContent).toContain('Tier 1');
	});
```

Append to `BuildMenu.svelte.spec.ts` a test that the rendered industry building order puts every tier-1 type before any tier-2/3 type (use the file's existing render fixture for the industry mode; assert on the option labels' order: `Water Bottler` appears before `Snack Factory`).

Run: `bun run test:unit -- --project client src/lib/components/game/atlas/CategoryStampIndex.svelte.spec.ts src/lib/components/game/BuildMenu.svelte.spec.ts --run`
Expected: FAIL.

- [ ] **Step 2: Tier badge in `CategoryStampIndex.svelte`**

Inside the stamp button, after the `<span class="name">…` line:

```svelte
			{#if summary.tier !== null}
				<span class="tier">Tier {summary.tier}</span>
			{/if}
```

Style:

```css
	.tier {
		width: fit-content;
		padding: 1px 5px;
		font-family: var(--font-ui);
		font-size: 8.5px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--brass-700);
		border: 1px solid var(--brass-700);
		border-radius: 1px;
	}
```

- [ ] **Step 3: Tier sort in `BuildMenu.svelte`**

Replace the `visibleIndustryBuildingTypes` derivation:

```ts
	const visibleIndustryBuildingTypes = $derived.by(() => {
		const types = selectedProductFilterId
			? getIndustrialBuildingTypesForProductChain(selectedProductFilterId)
			: Object.values(INDUSTRIAL_BUILDING_TYPES);
		return [...types].sort(
			(first, second) =>
				first.tier - second.tier ||
				first.buildCost - second.buildCost ||
				first.name.localeCompare(second.name)
		);
	});
```

- [ ] **Step 4: Run, autofix, commit**

Run: `bun run test:unit -- --project client --run` then `svelte-autofixer` on both components.
Expected: PASS.

```bash
git add -A src
git commit -m "feat: tier badges on chain index and tier-sorted industry build menu"
```

---

### Task 11: E2e updates, CLAUDE.md, full verification

**Files:**
- Modify: `src/routes/retail-sim.e2e.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the product-chains e2e section**

In `retail-sim.e2e.ts` around lines 791–797: the panel's default category for a convenience game is now bottled-water (tier-sorted summaries), so the snacks-graph assertion needs an explicit stamp click first, and the tier-1 default gets its own assertion:

```ts
	const productChains = await openManagementPanel(page, /product chains/i);
	await expect(productChains).toBeVisible();
	await expect(productChains.getByTestId('category-stamp-bottled-water')).toBeVisible();
	await expect(
		productChains.getByTestId('product-chain-graph-chain:bottled-water')
	).toBeVisible();
	await productChains.getByTestId('category-stamp-snacks').click();
	await expect(productChains.getByTestId('product-chain-graph-chain:snacks')).toBeVisible();
```

Check the other chain-related assertions surfaced by `grep -n "product-chain-graph\|category-stamp" src/routes/retail-sim.e2e.ts` (line ~994 store-inspector snacks graph: the store inspector's category `<select>` defaults to the first supported category — now bottled-water — so either select snacks in the dropdown first or assert `chain:bottled-water`). Any test that asserts a new store's first stock row is Snacks now expects Bottled Water.

- [ ] **Step 2: Update CLAUDE.md**

In the `src/lib/game/` module list, extend the `industry.ts` bullet and add a tree bullet:

- `industry.ts` bullet: append "Building types carry a `tier` (1–3) used only for build-menu grouping and chain badges — Tier 1 chains (bottled water, produce, pantry) are the 2–3 building onboarding chains."
- New bullet after `productChainGraph.ts`: "`productChainTree.ts` — tree-per-product chain view builder: duplicates shared sub-chains per branch (path-suffixed node ids) for a crossing-free layout; also owns `buildStoreCategoryChainSummaries`. `productChainGraph.ts` retains the warehouse-flow graph and the shared metric/health helpers."

- [ ] **Step 3: Full verification**

Run, in order:

1. `bun run check` — 0 errors
2. `bun run lint` — clean (run `bun run format` first if Prettier complains)
3. `bun run test:unit -- --run` — all pass
4. `bun run test:e2e` — all pass (slow: builds + previews first)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: tier-1 e2e coverage and docs for tiered product chains"
```

---

## Self-review notes (already applied)

- **Spec coverage:** Tier 1 chains (Tasks 1–2), retail wiring + milestone rule (3–4), persistence guard (5), tree data layer (6–7), summaries/tier (8), UI + old-path deletion (9), badges/menu sort (10), e2e + docs (11). The two spec deviations (household retained as legacy 5th category; payback asserted as positive daily margin) are intentional and documented at the top.
- **Type consistency:** `tier: 1 | 2 | 3` (types.ts Task 2) matches `getCategoryTier` return and `ProductChainCategorySummary.tier` (`| null`). Tree node ids `product:<material>` / `recipe:<recipe>[@path]` are used consistently in Tasks 7–9 and the e2e (`chain:<material>` graph id unchanged).
- **Known judgment calls for the implementer:** exact fixture-helper names in `state.spec.ts` / `saveRepository.spec.ts` / component specs must follow each file's local style (the plan shows the essential shape); the reorder-fallout steps (Tasks 3, 9) are bounded by the listed grep commands.
