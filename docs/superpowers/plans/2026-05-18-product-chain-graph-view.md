# Product Chain Graph View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only product-chain graph views for selected store detail and Control Tower, showing latest-day flow, theoretical capacity, warehouse stock, imports, and bottlenecks.

**Architecture:** Keep all production diagnostics in a pure `src/lib/game/productChainGraph.ts` builder. Svelte components only choose filters and adapt the builder output into `@xyflow/svelte` nodes and edges. The first renderer uses deterministic layouts and no save-schema changes.

**Tech Stack:** TypeScript, Svelte 5 runes mode, SvelteKit, Vitest browser/server projects, Playwright e2e, `@xyflow/svelte`.

---

## File Structure

- Modify: `package.json`
  - Add `@xyflow/svelte` dependency through `bun add @xyflow/svelte`.
- Modify: `bun.lock`
  - Updated by `bun add @xyflow/svelte`.
- Create: `src/lib/game/productChainGraph.ts`
  - Pure graph types, supported finished-product chain discovery, product-chain graph builder, warehouse-flow graph builder, bottleneck rules.
- Create: `src/lib/game/productChainGraph.spec.ts`
  - Server-side unit coverage for chain filtering, latest-day metrics, capacity metrics, node health, warehouse flow, and empty states.
- Create: `src/lib/components/game/ProductChainSelectionBridge.svelte`
  - Small `@xyflow/svelte` selection hook bridge.
- Create: `src/lib/components/game/ProductChainGraph.svelte`
  - Reusable graph renderer. Receives graph view data, emits selected node id.
- Create: `src/lib/components/game/ProductChainNodeDetail.svelte`
  - Shared selected-node detail panel.
- Create: `src/lib/components/game/StoreProductChainPanel.svelte`
  - Store inspector tab content and category selector.
- Create: `src/lib/components/game/StoreProductChainPanel.svelte.spec.ts`
  - Component coverage for category selection, graph rendering, node detail, and unsupported empty state.
- Create: `src/lib/components/game/ProductChainsPanel.svelte`
  - Control Tower product-chain panel with `Store category chains` and `Warehouse flow` modes.
- Create: `src/lib/components/game/ProductChainsPanel.svelte.spec.ts`
  - Component coverage for mode toggle, category cards, graph rendering, node detail, and warehouse flow.
- Modify: `src/lib/components/game/TileInspector.svelte`
  - Add `game` prop, `Product Chain` tab, and `StoreProductChainPanel` integration.
- Modify: `src/lib/components/game/TileInspector.svelte.spec.ts`
  - Add game fixture and Product Chain tab assertions.
- Modify: `src/routes/+page.svelte`
  - Pass `game ?? starterMapState` into `TileInspector`; render `ProductChainsPanel` in Control Tower.
- Modify: `src/routes/retail-sim.e2e.ts`
  - Add product-chain store tab and Control Tower graph smoke coverage.

## Implementation Constraints

- Do not change production simulation, stock simulation, import fallback, weekly refill, warehouse overflow, or save validation.
- Do not persist graph UI selections in this first slice.
- Do not make graph nodes navigate or start build actions.
- Svelte implementation must use the official Svelte MCP workflow:
  - call `list_sections`;
  - fetch relevant docs with `get_documentation`;
  - run `svelte_autofixer` on each Svelte component until no issues remain.

---

### Task 1: Add The Graph Dependency

**Files:**

- Modify: `package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Install `@xyflow/svelte`**

Run:

```bash
bun add @xyflow/svelte
```

Expected:

```text
installed @xyflow/svelte
```

If this fails with a network or registry error, rerun the same command with sandbox escalation.

- [ ] **Step 2: Confirm dependency is recorded**

Run:

```bash
rg -n '"@xyflow/svelte"' package.json bun.lock
```

Expected: both `package.json` and `bun.lock` contain `@xyflow/svelte`.

- [ ] **Step 3: Commit dependency**

```bash
git add package.json bun.lock
git commit -m "chore: add svelte flow graph dependency"
```

---

### Task 2: Write Product Chain Graph Unit Tests

**Files:**

- Create: `src/lib/game/productChainGraph.spec.ts`

- [ ] **Step 1: Create failing tests for chain discovery and graph metrics**

Create `src/lib/game/productChainGraph.spec.ts` with:

```ts
import { describe, expect, test } from 'vitest';
import {
	buildProductChainGraph,
	buildWarehouseFlowGraph,
	getSupportedStoreChainCategories
} from './productChainGraph';
import { buildIndustrialBuilding } from './industryPlacement';
import { addWarehouseMaterial } from './industryProduction';
import { createNewGame } from './state';
import type { DailyProductionReport, DailyStoreReport, GameState } from './types';

function emptyProductionReport(
	overrides: Partial<DailyProductionReport> = {}
): DailyProductionReport {
	return {
		produced: [],
		consumed: [],
		importedInputs: [],
		warehousePulls: [],
		shopImports: [],
		importSpend: 0,
		operatingCost: 0,
		overflowUnits: 0,
		overflowCost: 0,
		warehouseCapacity: 0,
		warehouseUsed: 0,
		...overrides
	};
}

function latestStoreReport(overrides: Partial<DailyStoreReport> = {}): DailyStoreReport {
	return {
		storeId: 'store-1',
		revenue: 120,
		costOfGoods: 50,
		grossMargin: 70,
		operatingCosts: 30,
		importSpend: 0,
		netIncome: 40,
		customersServed: 10,
		demandMissed: 2,
		staffingCoverage: 100,
		staffingShortage: { manager: 0, general: 0 },
		stockHealth: 82,
		staffMorale: 75,
		reputation: 55,
		marketPosition: 48,
		productReports: [
			{
				categoryId: 'snacks',
				name: 'Snacks',
				unitsSold: 8,
				demandMissed: 2,
				revenue: 80,
				costOfGoods: 32,
				grossMargin: 48,
				endingStock: 17,
				warehouseUnits: 6,
				warehouseValue: 48,
				importedUnits: 4,
				importCost: 12,
				importSpend: 48
			}
		],
		warnings: [],
		...overrides
	};
}

function withLatestReport(game: GameState, productionReport: DailyProductionReport): GameState {
	return {
		...game,
		reports: [
			{
				day: game.day,
				revenue: 120,
				costOfGoods: 50,
				grossMargin: 70,
				operatingCosts: 30,
				payrollCost: 0,
				importSpend: 48,
				netIncome: 40,
				cashAfter: game.cash + 40,
				scorecard: game.scorecard,
				productionReport,
				storeReports: [latestStoreReport()],
				warnings: []
			}
		]
	};
}

function buildWarehouse(game: GameState): GameState {
	const tile = game.industryCities[0]!.tiles.find(
		(candidate) => candidate.terrain === 'industrial' && !candidate.locked
	)!;

	return buildIndustrialBuilding(game, { tileId: tile.id, buildingTypeId: 'warehouse' });
}

describe('product chain graph discovery', () => {
	test('filters a store to product categories with supported chains', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);
		const store = game.stores[0]!;

		const categories = getSupportedStoreChainCategories(store);

		expect(categories.map((category) => category.id)).toEqual(['snacks', 'drinks', 'essentials']);
		expect(categories.every((category) => category.name.length > 0)).toBe(true);
	});
});

describe('product chain graph metrics', () => {
	test('builds a snacks graph with latest movement, capacity, warehouse stock, and import exposure', () => {
		expect.assertions(8);
		let game = { ...createNewGame('convenience', 20260518), cash: 100_000 };
		game = buildWarehouse(game);
		game = { ...game, warehouse: addWarehouseMaterial(game.warehouse, 'snacks', 12) };
		const productionReport = emptyProductionReport({
			produced: [{ materialId: 'snacks', quantity: 8, value: 64, source: 'local' }],
			consumed: [
				{ materialId: 'flour', quantity: 6, value: 18, source: 'warehouse' },
				{ materialId: 'packaging', quantity: 2, value: 6, source: 'import' }
			],
			importedInputs: [{ materialId: 'packaging', quantity: 2, value: 10, source: 'import' }],
			warehousePulls: [
				{ materialId: 'flour', quantity: 6, value: 18, source: 'warehouse' },
				{ materialId: 'snacks', quantity: 6, value: 48, source: 'warehouse' }
			],
			shopImports: [{ materialId: 'snacks', quantity: 4, value: 48, source: 'import' }],
			importSpend: 58,
			warehouseCapacity: 200,
			warehouseUsed: 12
		});
		game = withLatestReport(game, productionReport);

		const graph = buildProductChainGraph({ game, store: game.stores[0]!, categoryId: 'snacks' });
		const snacks = graph.nodes.find((node) => node.id === 'material:snacks');
		const packaging = graph.nodes.find((node) => node.id === 'material:packaging');
		const snackRecipe = graph.nodes.find((node) => node.id === 'recipe:snack-production');

		expect(graph.emptyReason).toBeNull();
		expect(graph.edges.some((edge) => edge.materialId === 'packaging')).toBe(true);
		expect(snacks?.actual.produced).toBe(8);
		expect(snacks?.actual.shopImported).toBe(4);
		expect(snacks?.warehouseStock).toBe(12);
		expect(packaging?.health).toBe('shortage');
		expect(snackRecipe?.capacity.outputPerDay).toBe(0);
		expect(snackRecipe?.health).toBe('no-local-capacity');
	});

	test('marks graphs without daily reports as no-report while preserving chain structure', () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260518);

		const graph = buildProductChainGraph({ game, store: game.stores[0]!, categoryId: 'snacks' });

		expect(graph.emptyReason).toBeNull();
		expect(graph.nodes.length).toBeGreaterThan(0);
		expect(graph.nodes.some((node) => node.health === 'no-report')).toBe(true);
		expect(graph.warnings).toContain('No daily report yet; latest-day flow is unavailable.');
	});

	test('returns an empty reason for unsupported product categories', () => {
		expect.assertions(2);
		const game = createNewGame('electronics', 20260518);

		const graph = buildProductChainGraph({ game, store: game.stores[0]!, categoryId: 'devices' });

		expect(graph.nodes).toEqual([]);
		expect(graph.emptyReason).toBe('No local production chain available for this category yet.');
	});
});

describe('warehouse flow graph', () => {
	test('builds a warehouse-centered graph from stock and latest material movement', () => {
		expect.assertions(7);
		let game = createNewGame('convenience', 20260518);
		game = { ...game, warehouse: addWarehouseMaterial(game.warehouse, 'snacks', 14) };
		game = withLatestReport(
			game,
			emptyProductionReport({
				produced: [{ materialId: 'snacks', quantity: 8, value: 64, source: 'local' }],
				consumed: [{ materialId: 'flour', quantity: 6, value: 18, source: 'warehouse' }],
				importedInputs: [{ materialId: 'packaging', quantity: 2, value: 10, source: 'import' }],
				warehousePulls: [{ materialId: 'snacks', quantity: 6, value: 48, source: 'warehouse' }],
				shopImports: [{ materialId: 'snacks', quantity: 4, value: 48, source: 'import' }],
				importSpend: 58,
				warehouseCapacity: 0,
				warehouseUsed: 14,
				overflowUnits: 14,
				overflowCost: 28
			})
		);

		const graph = buildWarehouseFlowGraph(game);
		const warehouse = graph.nodes.find((node) => node.id === 'warehouse');
		const snacks = graph.nodes.find((node) => node.id === 'material:snacks');

		expect(graph.emptyReason).toBeNull();
		expect(warehouse?.label).toBe('Warehouse');
		expect(warehouse?.health).toBe('shortage');
		expect(snacks?.actual.produced).toBe(8);
		expect(snacks?.actual.warehousePulled).toBe(6);
		expect(snacks?.actual.shopImported).toBe(4);
		expect(graph.edges.some((edge) => edge.id === 'material:snacks->warehouse')).toBe(true);
	});
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```bash
bun run test:unit -- src/lib/game/productChainGraph.spec.ts --run
```

Expected: fail because `./productChainGraph` does not exist.

---

### Task 3: Implement The Pure Graph Builder

**Files:**

- Create: `src/lib/game/productChainGraph.ts`
- Test: `src/lib/game/productChainGraph.spec.ts`

- [ ] **Step 1: Create graph types and supported-chain discovery**

Create `src/lib/game/productChainGraph.ts` with these exported types and constants:

```ts
import { getArchetype } from './archetypes';
import { INDUSTRIAL_BUILDING_TYPES, MATERIALS, PRODUCTION_RECIPES } from './industry';
import { getWarehouseUsed } from './industryProduction';
import type {
	DailyMaterialMovement,
	DailyProductReport,
	DailyProductionReport,
	GameState,
	IndustrialBuilding,
	IndustrialBuildingType,
	MaterialId,
	ProductCategory,
	ProductionRecipe,
	ProductionRecipeId,
	Store
} from './types';

export type ProductChainHealth =
	| 'healthy'
	| 'watch'
	| 'shortage'
	| 'no-local-capacity'
	| 'no-report';

export type ProductChainNodeKind = 'material' | 'recipe' | 'warehouse';

export interface ProductChainActualMetrics {
	produced: number;
	consumed: number;
	importedInput: number;
	warehousePulled: number;
	shopImported: number;
	unitsSold: number;
	demandMissed: number;
}

export interface ProductChainCapacityMetrics {
	buildingCount: number;
	outputPerDay: number;
	inputPerDay: number;
}

export interface ProductChainNode {
	id: string;
	kind: ProductChainNodeKind;
	label: string;
	materialId: MaterialId | null;
	recipeId: ProductionRecipeId | null;
	stage: ProductionRecipe['stage'] | 'warehouse' | null;
	layer: number;
	row: number;
	health: ProductChainHealth;
	healthLabel: string;
	warehouseStock: number;
	capacity: ProductChainCapacityMetrics;
	actual: ProductChainActualMetrics;
	bottleneck: string;
}

export interface ProductChainEdge {
	id: string;
	source: string;
	target: string;
	materialId: MaterialId | null;
	label: string;
	health: ProductChainHealth;
}

export interface ProductChainGraph {
	id: string;
	title: string;
	nodes: ProductChainNode[];
	edges: ProductChainEdge[];
	details: Record<string, ProductChainNode>;
	warnings: string[];
	emptyReason: string | null;
}

export interface ProductChainCategorySummary {
	categoryId: string;
	name: string;
	health: ProductChainHealth;
	healthLabel: string;
	bottleneck: string;
	warehouseStock: number;
	produced: number;
	consumed: number;
	imported: number;
}

export const SUPPORTED_FINISHED_MATERIALS = [
	'snacks',
	'drinks',
	'essentials',
	'gifts'
] as const satisfies readonly MaterialId[];

export function getSupportedStoreChainCategories(store: Store): ProductCategory[] {
	const supported = new Set<string>(SUPPORTED_FINISHED_MATERIALS);

	return getArchetype(store.archetypeId).startingCategories.filter((category) =>
		supported.has(category.id)
	);
}
```

- [ ] **Step 2: Add movement and capacity helpers**

Append these helpers to `productChainGraph.ts`:

```ts
const MATERIAL_PRODUCER_RECIPES = createMaterialProducerRecipeMap();

function createMaterialProducerRecipeMap(): ReadonlyMap<MaterialId, ProductionRecipeId> {
	const entries: Array<[MaterialId, ProductionRecipeId]> = [];

	for (const recipe of Object.values(PRODUCTION_RECIPES)) {
		for (const output of recipe.outputs) {
			entries.push([output.materialId, recipe.id]);
		}
	}

	return new Map(entries);
}

function latestProductionReport(game: GameState): DailyProductionReport | null {
	return game.reports.at(-1)?.productionReport ?? null;
}

function latestStoreProductReport(
	game: GameState,
	store: Store | null,
	categoryId: string
): DailyProductReport | null {
	if (!store) {
		return null;
	}

	return (
		game.reports
			.at(-1)
			?.storeReports.find((report) => report.storeId === store.id)
			?.productReports.find((report) => report.categoryId === categoryId) ?? null
	);
}

function sumMovements(
	movements: DailyMaterialMovement[] | undefined,
	materialId: MaterialId,
	source?: DailyMaterialMovement['source']
): number {
	return (movements ?? [])
		.filter((movement) => movement.materialId === materialId)
		.filter((movement) => (source ? movement.source === source : true))
		.reduce((total, movement) => total + movement.quantity, 0);
}

function buildingTypesForRecipe(recipeId: ProductionRecipeId): IndustrialBuildingType[] {
	return Object.values(INDUSTRIAL_BUILDING_TYPES).filter((type) => type.recipeId === recipeId);
}

function buildingsForRecipe(
	buildings: IndustrialBuilding[],
	recipeId: ProductionRecipeId
): IndustrialBuilding[] {
	const typeIds = new Set(buildingTypesForRecipe(recipeId).map((type) => type.id));

	return buildings.filter((building) => typeIds.has(building.typeId));
}

function recipeOutputPerDay(recipe: ProductionRecipe, buildingCount: number): number {
	return recipe.outputs.reduce((total, output) => total + output.quantity * buildingCount, 0);
}

function recipeInputPerDay(recipe: ProductionRecipe, buildingCount: number): number {
	return recipe.inputs.reduce((total, input) => total + input.quantity * buildingCount, 0);
}

function emptyActualMetrics(): ProductChainActualMetrics {
	return {
		produced: 0,
		consumed: 0,
		importedInput: 0,
		warehousePulled: 0,
		shopImported: 0,
		unitsSold: 0,
		demandMissed: 0
	};
}

function materialActualMetrics(
	report: DailyProductionReport | null,
	materialId: MaterialId,
	productReport: DailyProductReport | null
): ProductChainActualMetrics {
	return {
		produced: sumMovements(report?.produced, materialId, 'local'),
		consumed: sumMovements(report?.consumed, materialId),
		importedInput: sumMovements(report?.importedInputs, materialId, 'import'),
		warehousePulled: sumMovements(report?.warehousePulls, materialId, 'warehouse'),
		shopImported: sumMovements(report?.shopImports, materialId, 'import'),
		unitsSold: productReport?.unitsSold ?? 0,
		demandMissed: productReport?.demandMissed ?? 0
	};
}
```

- [ ] **Step 3: Add health and node helpers**

Append:

```ts
function healthLabel(health: ProductChainHealth): string {
	if (health === 'healthy') {
		return 'Healthy';
	}

	if (health === 'watch') {
		return 'Watch';
	}

	if (health === 'shortage') {
		return 'Shortage';
	}

	if (health === 'no-local-capacity') {
		return 'No local capacity';
	}

	return 'No report yet';
}

function materialHealth(input: {
	hasReport: boolean;
	actual: ProductChainActualMetrics;
	warehouseStock: number;
	producerBuildingCount: number;
	hasProducerRecipe: boolean;
}): ProductChainHealth {
	if (input.hasProducerRecipe && input.producerBuildingCount === 0) {
		return 'no-local-capacity';
	}

	if (!input.hasReport) {
		return 'no-report';
	}

	if (input.actual.importedInput > 0 || input.actual.shopImported > 0) {
		return 'shortage';
	}

	if (input.actual.consumed > 0 && input.warehouseStock < input.actual.consumed) {
		return 'watch';
	}

	return 'healthy';
}

function recipeHealth(input: { hasReport: boolean; buildingCount: number }): ProductChainHealth {
	if (input.buildingCount === 0) {
		return 'no-local-capacity';
	}

	if (!input.hasReport) {
		return 'no-report';
	}

	return 'healthy';
}

function bottleneckText(node: Pick<ProductChainNode, 'kind' | 'health' | 'label'>): string {
	if (node.health === 'healthy') {
		return `${node.label} is flowing locally.`;
	}

	if (node.health === 'watch') {
		return `${node.label} stock is below latest downstream use.`;
	}

	if (node.health === 'shortage') {
		return `${node.label} relied on imports or had a local shortage today.`;
	}

	if (node.health === 'no-local-capacity') {
		return `${node.label} has no placed local producer.`;
	}

	return `${node.label} has no latest daily flow yet.`;
}

function sortNodes(nodes: ProductChainNode[]): ProductChainNode[] {
	const stageOrder = new Map<string, number>([
		['raw', 0],
		['process', 2],
		['final', 4],
		['warehouse', 5]
	]);

	return nodes
		.map((node) => ({
			...node,
			layer:
				node.kind === 'material'
					? Math.max(0, stageOrder.get(node.stage ?? 'raw') ?? 0) + 1
					: (stageOrder.get(node.stage ?? 'warehouse') ?? 0)
		}))
		.sort((first, second) => first.layer - second.layer || first.label.localeCompare(second.label))
		.map((node, index, sorted) => ({
			...node,
			row: sorted.filter((candidate) => candidate.layer === node.layer).indexOf(node)
		}));
}
```

- [ ] **Step 4: Add `buildProductChainGraph`**

Append:

```ts
export function buildProductChainGraph(input: {
	game: GameState;
	store: Store | null;
	categoryId: string;
}): ProductChainGraph {
	if (!SUPPORTED_FINISHED_MATERIALS.includes(input.categoryId as MaterialId)) {
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
	const nodes = new Map<string, ProductChainNode>();
	const edges = new Map<string, ProductChainEdge>();
	const visitedMaterials = new Set<MaterialId>();
	const warnings: string[] = [];

	collectMaterial(rootMaterialId);

	if (!report) {
		warnings.push('No daily report yet; latest-day flow is unavailable.');
	}

	const sortedNodes = sortNodes([...nodes.values()]);
	const details = Object.fromEntries(sortedNodes.map((node) => [node.id, node]));

	return {
		id: `chain:${rootMaterialId}`,
		title: `${MATERIALS[rootMaterialId].name} chain`,
		nodes: sortedNodes,
		edges: [...edges.values()],
		details,
		warnings,
		emptyReason: null
	};

	function collectMaterial(materialId: MaterialId): void {
		if (visitedMaterials.has(materialId)) {
			return;
		}

		visitedMaterials.add(materialId);
		const producerRecipeId = MATERIAL_PRODUCER_RECIPES.get(materialId) ?? null;
		const producerRecipe = producerRecipeId ? PRODUCTION_RECIPES[producerRecipeId] : null;
		const producerBuildingCount = producerRecipeId
			? buildingsForRecipe(input.game.industrialBuildings, producerRecipeId).length
			: 0;
		const actual = materialActualMetrics(
			report,
			materialId,
			materialId === rootMaterialId ? productReport : null
		);
		const health = materialHealth({
			hasReport: report !== null,
			actual,
			warehouseStock: input.game.warehouse.materials[materialId] ?? 0,
			producerBuildingCount,
			hasProducerRecipe: producerRecipe !== null
		});
		const materialNode: ProductChainNode = {
			id: `material:${materialId}`,
			kind: 'material',
			label: MATERIALS[materialId]?.name ?? materialId,
			materialId,
			recipeId: null,
			stage: producerRecipe?.stage ?? MATERIALS[materialId]?.kind ?? null,
			layer: 0,
			row: 0,
			health,
			healthLabel: healthLabel(health),
			warehouseStock: input.game.warehouse.materials[materialId] ?? 0,
			capacity: {
				buildingCount: producerBuildingCount,
				outputPerDay: producerRecipe
					? recipeOutputPerDay(producerRecipe, producerBuildingCount)
					: 0,
				inputPerDay: producerRecipe ? recipeInputPerDay(producerRecipe, producerBuildingCount) : 0
			},
			actual,
			bottleneck: ''
		};
		materialNode.bottleneck = bottleneckText(materialNode);
		nodes.set(materialNode.id, materialNode);

		if (!producerRecipeId || !producerRecipe) {
			warnings.push(`No production recipe found for ${materialNode.label}.`);
			return;
		}

		collectRecipe(producerRecipeId, materialId);
	}

	function collectRecipe(recipeId: ProductionRecipeId, outputMaterialId: MaterialId): void {
		const recipe = PRODUCTION_RECIPES[recipeId];
		const buildingCount = buildingsForRecipe(input.game.industrialBuildings, recipeId).length;
		const health = recipeHealth({ hasReport: report !== null, buildingCount });
		const recipeNode: ProductChainNode = {
			id: `recipe:${recipeId}`,
			kind: 'recipe',
			label: buildingTypesForRecipe(recipeId)[0]?.name ?? recipeId,
			materialId: null,
			recipeId,
			stage: recipe.stage,
			layer: 0,
			row: 0,
			health,
			healthLabel: healthLabel(health),
			warehouseStock: 0,
			capacity: {
				buildingCount,
				outputPerDay: recipeOutputPerDay(recipe, buildingCount),
				inputPerDay: recipeInputPerDay(recipe, buildingCount)
			},
			actual: emptyActualMetrics(),
			bottleneck: ''
		};
		recipeNode.bottleneck = bottleneckText(recipeNode);
		nodes.set(recipeNode.id, recipeNode);
		addEdge(`recipe:${recipeId}`, `material:${outputMaterialId}`, outputMaterialId);

		for (const inputMaterial of recipe.inputs) {
			collectMaterial(inputMaterial.materialId);
			addEdge(
				`material:${inputMaterial.materialId}`,
				`recipe:${recipeId}`,
				inputMaterial.materialId
			);
		}
	}

	function addEdge(source: string, target: string, materialId: MaterialId): void {
		const actual = materialActualMetrics(
			report,
			materialId,
			materialId === rootMaterialId ? productReport : null
		);
		const health = materialHealth({
			hasReport: report !== null,
			actual,
			warehouseStock: input.game.warehouse.materials[materialId] ?? 0,
			producerBuildingCount: MATERIAL_PRODUCER_RECIPES.get(materialId)
				? buildingsForRecipe(
						input.game.industrialBuildings,
						MATERIAL_PRODUCER_RECIPES.get(materialId)!
					).length
				: 0,
			hasProducerRecipe: MATERIAL_PRODUCER_RECIPES.has(materialId)
		});
		const imported = actual.importedInput + actual.shopImported;
		const label =
			imported > 0
				? `${actual.warehousePulled} local / ${imported} imported`
				: `${actual.warehousePulled} local`;
		edges.set(`${source}->${target}`, {
			id: `${source}->${target}`,
			source,
			target,
			materialId,
			label,
			health
		});
	}
}

function emptyGraph(id: string, title: string, emptyReason: string): ProductChainGraph {
	return {
		id,
		title,
		nodes: [],
		edges: [],
		details: {},
		warnings: [],
		emptyReason
	};
}
```

- [ ] **Step 5: Add category summaries and warehouse-flow graph**

Append:

```ts
export function buildStoreCategoryChainSummaries(game: GameState): ProductChainCategorySummary[] {
	const summaries = new Map<string, ProductChainCategorySummary>();

	for (const store of game.stores) {
		for (const category of getSupportedStoreChainCategories(store)) {
			if (summaries.has(category.id)) {
				continue;
			}

			const graph = buildProductChainGraph({ game, store, categoryId: category.id });
			const rootNode = graph.nodes.find((node) => node.id === `material:${category.id}`);
			summaries.set(category.id, {
				categoryId: category.id,
				name: category.name,
				health: rootNode?.health ?? 'no-report',
				healthLabel: rootNode?.healthLabel ?? 'No report yet',
				bottleneck: rootNode?.bottleneck ?? 'No graph data available.',
				warehouseStock: rootNode?.warehouseStock ?? 0,
				produced: rootNode?.actual.produced ?? 0,
				consumed: rootNode?.actual.consumed ?? 0,
				imported: (rootNode?.actual.importedInput ?? 0) + (rootNode?.actual.shopImported ?? 0)
			});
		}
	}

	return [...summaries.values()].sort((first, second) => first.name.localeCompare(second.name));
}

export function buildWarehouseFlowGraph(game: GameState): ProductChainGraph {
	const report = latestProductionReport(game);
	const materialIds = new Set<MaterialId>();

	for (const materialId of Object.keys(game.warehouse.materials) as MaterialId[]) {
		materialIds.add(materialId);
	}

	for (const movement of [
		...(report?.produced ?? []),
		...(report?.consumed ?? []),
		...(report?.importedInputs ?? []),
		...(report?.warehousePulls ?? []),
		...(report?.shopImports ?? [])
	]) {
		materialIds.add(movement.materialId);
	}

	if (materialIds.size === 0 && !report) {
		return emptyGraph(
			'warehouse-flow',
			'Warehouse flow',
			'No warehouse stock or daily report yet.'
		);
	}

	const warehouseHealth: ProductChainHealth =
		game.warehouse.capacity <= 0 || game.warehouse.overflowUnits > 0 ? 'shortage' : 'healthy';
	const warehouseNode: ProductChainNode = {
		id: 'warehouse',
		kind: 'warehouse',
		label: 'Warehouse',
		materialId: null,
		recipeId: null,
		stage: 'warehouse',
		layer: 1,
		row: 0,
		health: warehouseHealth,
		healthLabel: healthLabel(warehouseHealth),
		warehouseStock: getWarehouseUsed(game.warehouse),
		capacity: {
			buildingCount: game.industrialBuildings.filter((building) => building.typeId === 'warehouse')
				.length,
			outputPerDay: 0,
			inputPerDay: game.warehouse.capacity
		},
		actual: emptyActualMetrics(),
		bottleneck:
			game.warehouse.capacity <= 0
				? 'No warehouse capacity is available.'
				: game.warehouse.overflowUnits > 0
					? `${game.warehouse.overflowUnits} units are in overflow storage.`
					: 'Warehouse capacity is available.'
	};
	const nodes: ProductChainNode[] = [warehouseNode];
	const edges: ProductChainEdge[] = [];

	for (const [index, materialId] of [...materialIds].sort().entries()) {
		const actual = materialActualMetrics(report, materialId, null);
		const health = materialHealth({
			hasReport: report !== null,
			actual,
			warehouseStock: game.warehouse.materials[materialId] ?? 0,
			producerBuildingCount: MATERIAL_PRODUCER_RECIPES.get(materialId)
				? buildingsForRecipe(game.industrialBuildings, MATERIAL_PRODUCER_RECIPES.get(materialId)!)
						.length
				: 0,
			hasProducerRecipe: MATERIAL_PRODUCER_RECIPES.has(materialId)
		});
		const materialNode: ProductChainNode = {
			id: `material:${materialId}`,
			kind: 'material',
			label: MATERIALS[materialId]?.name ?? materialId,
			materialId,
			recipeId: null,
			stage: MATERIALS[materialId]?.kind ?? null,
			layer: actual.produced > 0 || actual.importedInput > 0 ? 0 : 2,
			row: index,
			health,
			healthLabel: healthLabel(health),
			warehouseStock: game.warehouse.materials[materialId] ?? 0,
			capacity: {
				buildingCount: 0,
				outputPerDay: 0,
				inputPerDay: 0
			},
			actual,
			bottleneck: ''
		};
		materialNode.bottleneck = bottleneckText(materialNode);
		nodes.push(materialNode);

		if (actual.produced > 0 || actual.importedInput > 0) {
			edges.push({
				id: `material:${materialId}->warehouse`,
				source: `material:${materialId}`,
				target: 'warehouse',
				materialId,
				label: `${actual.produced + actual.importedInput} in`,
				health
			});
		}

		if (actual.consumed > 0 || actual.warehousePulled > 0 || actual.shopImported > 0) {
			edges.push({
				id: `warehouse->material:${materialId}`,
				source: 'warehouse',
				target: `material:${materialId}`,
				materialId,
				label: `${actual.consumed + actual.warehousePulled + actual.shopImported} out`,
				health
			});
		}
	}

	const details = Object.fromEntries(nodes.map((node) => [node.id, node]));

	return {
		id: 'warehouse-flow',
		title: 'Warehouse flow',
		nodes,
		edges,
		details,
		warnings: report ? [] : ['No daily report yet; latest-day flow is unavailable.'],
		emptyReason: null
	};
}
```

- [ ] **Step 6: Run graph tests**

Run:

```bash
bun run test:unit -- src/lib/game/productChainGraph.spec.ts --run
```

Expected: pass all tests in `productChainGraph.spec.ts`.

- [ ] **Step 7: Commit graph builder**

```bash
git add src/lib/game/productChainGraph.ts src/lib/game/productChainGraph.spec.ts
git commit -m "feat: derive product chain graph data"
```

---

### Task 4: Build Shared Graph Renderer Components

**Files:**

- Create: `src/lib/components/game/ProductChainSelectionBridge.svelte`
- Create: `src/lib/components/game/ProductChainGraph.svelte`
- Create: `src/lib/components/game/ProductChainNodeDetail.svelte`

- [ ] **Step 1: Create the selection bridge**

Create `src/lib/components/game/ProductChainSelectionBridge.svelte`:

```svelte
<script lang="ts">
	import { useOnSelectionChange } from '@xyflow/svelte';

	interface Props {
		onSelect: (nodeId: string | null) => void;
	}

	let { onSelect }: Props = $props();

	useOnSelectionChange(({ nodes }) => {
		onSelect(nodes[0]?.id ?? null);
	});
</script>
```

- [ ] **Step 2: Create the reusable graph renderer**

Create `src/lib/components/game/ProductChainGraph.svelte`:

```svelte
<script lang="ts">
	import { Background, Controls, SvelteFlow } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import ProductChainSelectionBridge from './ProductChainSelectionBridge.svelte';
	import type { ProductChainGraph as ProductChainGraphData } from '$lib/game/productChainGraph';

	interface FlowNode {
		id: string;
		position: { x: number; y: number };
		data: { label: string };
		type?: 'input' | 'output' | 'default';
	}

	interface FlowEdge {
		id: string;
		source: string;
		target: string;
		type: 'smoothstep';
		label: string;
		animated: boolean;
	}

	interface Props {
		graph: ProductChainGraphData;
		selectedNodeId: string | null;
		compact?: boolean;
		onSelectNode: (nodeId: string | null) => void;
	}

	let { graph, selectedNodeId, compact = false, onSelectNode }: Props = $props();
	let nodes = $derived(
		graph.nodes.map(
			(node): FlowNode => ({
				id: node.id,
				type: node.kind === 'warehouse' ? 'input' : node.kind === 'material' ? 'output' : 'default',
				position: {
					x: node.layer * (compact ? 170 : 220),
					y: node.row * (compact ? 95 : 120)
				},
				data: {
					label: `${node.label}\n${node.healthLabel}\nStock ${node.warehouseStock}`
				}
			})
		)
	);
	let edges = $derived(
		graph.edges.map(
			(edge): FlowEdge => ({
				id: edge.id,
				source: edge.source,
				target: edge.target,
				type: 'smoothstep',
				label: edge.label,
				animated: edge.health === 'shortage'
			})
		)
	);
</script>

<section class="chain-graph" class:compact aria-label={graph.title}>
	{#if graph.emptyReason}
		<p class="empty">{graph.emptyReason}</p>
	{:else}
		<div class="graph-frame" data-testid={`product-chain-graph-${graph.id}`}>
			<SvelteFlow {nodes} {edges} fitView>
				<ProductChainSelectionBridge onSelect={onSelectNode} />
				<Background />
				{#if !compact}
					<Controls />
				{/if}
			</SvelteFlow>
		</div>
		{#if graph.warnings.length > 0}
			<ul class="warnings" aria-label={`${graph.title} warnings`}>
				{#each graph.warnings as warning (warning)}
					<li>{warning}</li>
				{/each}
			</ul>
		{/if}
		{#if selectedNodeId && graph.details[selectedNodeId]}
			<p class="selection" aria-live="polite">
				Selected {graph.details[selectedNodeId].label}
			</p>
		{/if}
	{/if}
</section>

<style>
	.chain-graph {
		display: grid;
		gap: 0.7rem;
		min-width: 0;
	}

	.graph-frame {
		height: 22rem;
		min-height: 16rem;
		overflow: hidden;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
	}

	.compact .graph-frame {
		height: 15rem;
	}

	.empty,
	.selection,
	.warnings {
		margin: 0;
		font-family: var(--font-body);
		font-size: 0.9rem;
		color: var(--ink-500);
	}

	.warnings {
		padding-left: 1.1rem;
		color: var(--wax-red);
	}
</style>
```

- [ ] **Step 3: Create the selected-node detail component**

Create `src/lib/components/game/ProductChainNodeDetail.svelte`:

```svelte
<script lang="ts">
	import type { ProductChainNode } from '$lib/game/productChainGraph';

	interface Props {
		node: ProductChainNode | null;
	}

	let { node }: Props = $props();
</script>

<section class="node-detail" aria-label="Product chain node details">
	{#if node}
		<header>
			<p class="eyebrow">{node.healthLabel}</p>
			<h3>{node.label}</h3>
		</header>
		<p>{node.bottleneck}</p>
		<dl>
			<div>
				<dt>Buildings</dt>
				<dd>{node.capacity.buildingCount}</dd>
			</div>
			<div>
				<dt>Capacity</dt>
				<dd>{node.capacity.outputPerDay}/day</dd>
			</div>
			<div>
				<dt>Produced</dt>
				<dd>{node.actual.produced}</dd>
			</div>
			<div>
				<dt>Consumed</dt>
				<dd>{node.actual.consumed}</dd>
			</div>
			<div>
				<dt>Imported</dt>
				<dd>{node.actual.importedInput + node.actual.shopImported}</dd>
			</div>
			<div>
				<dt>Stock</dt>
				<dd>{node.warehouseStock}</dd>
			</div>
		</dl>
	{:else}
		<p>Select a graph node to inspect flow, stock, capacity, and bottlenecks.</p>
	{/if}
</section>

<style>
	.node-detail {
		display: grid;
		gap: 0.65rem;
		padding: 0.85rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
	}

	header,
	h3,
	p,
	dl {
		margin: 0;
	}

	h3 {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	p {
		font-family: var(--font-body);
		font-size: 0.9rem;
		color: var(--ink-500);
	}

	dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
		gap: 0.55rem;
	}

	dt {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

	dd {
		margin: 0.15rem 0 0;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-weight: 700;
		color: var(--ink-700);
	}
</style>
```

- [ ] **Step 4: Run Svelte autofixer on shared graph components**

Run the Svelte MCP `svelte_autofixer` on:

- `ProductChainSelectionBridge.svelte`;
- `ProductChainGraph.svelte`;
- `ProductChainNodeDetail.svelte`.

Expected: each component returns no remaining issues after fixes.

- [ ] **Step 5: Run Svelte check**

Run:

```bash
bun run check
```

Expected: pass.

- [ ] **Step 6: Commit shared renderer**

```bash
git add src/lib/components/game/ProductChainSelectionBridge.svelte src/lib/components/game/ProductChainGraph.svelte src/lib/components/game/ProductChainNodeDetail.svelte
git commit -m "feat: add product chain graph renderer"
```

---

### Task 5: Add Store Product Chain Panel

**Files:**

- Create: `src/lib/components/game/StoreProductChainPanel.svelte`
- Create: `src/lib/components/game/StoreProductChainPanel.svelte.spec.ts`
- Modify: `src/lib/components/game/TileInspector.svelte`
- Modify: `src/lib/components/game/TileInspector.svelte.spec.ts`

- [ ] **Step 1: Write store panel component tests**

Create `src/lib/components/game/StoreProductChainPanel.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import StoreProductChainPanel from './StoreProductChainPanel.svelte';
import { createNewGame } from '$lib/game/state';

describe('StoreProductChainPanel', () => {
	it('shows supported store categories and renders the selected graph', async () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260518);
		const store = game.stores[0]!;

		render(StoreProductChainPanel, { game, store });

		await expect.element(page.getByLabelText('Product category')).toBeVisible();
		await expect.element(page.getByRole('option', { name: 'Snacks' })).toBeVisible();
		await expect.element(page.getByRole('option', { name: 'Drinks' })).toBeVisible();
		await expect.element(page.getByTestId('product-chain-graph-chain:snacks')).toBeVisible();
	});

	it('switches category graphs from the selector', async () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260518);
		const store = game.stores[0]!;

		render(StoreProductChainPanel, { game, store });

		await page.getByLabelText('Product category').selectOptions('drinks');

		await expect.element(page.getByTestId('product-chain-graph-chain:drinks')).toBeVisible();
		await expect.element(page.getByText('Drinks chain')).toBeVisible();
	});

	it('shows an empty state when no store categories have supported chains', async () => {
		expect.assertions(1);
		const game = createNewGame('electronics', 20260518);
		const store = {
			...game.stores[0]!,
			archetypeId: 'electronics' as const
		};

		render(StoreProductChainPanel, { game, store });

		await expect
			.element(
				page.getByText("No local production chain available for this store's categories yet.")
			)
			.toBeVisible();
	});
});
```

- [ ] **Step 2: Run store panel tests to verify they fail**

Run:

```bash
bun run test:unit -- src/lib/components/game/StoreProductChainPanel.svelte.spec.ts --run --project client
```

Expected: fail because `StoreProductChainPanel.svelte` does not exist.

- [ ] **Step 3: Create store panel component**

Create `src/lib/components/game/StoreProductChainPanel.svelte`:

```svelte
<script lang="ts">
	import ProductChainGraph from './ProductChainGraph.svelte';
	import ProductChainNodeDetail from './ProductChainNodeDetail.svelte';
	import {
		buildProductChainGraph,
		getSupportedStoreChainCategories
	} from '$lib/game/productChainGraph';
	import type { GameState, Store } from '$lib/game/types';

	interface Props {
		game: GameState;
		store: Store;
	}

	let { game, store }: Props = $props();
	let selectedCategoryOverride = $state<string | null>(null);
	let selectedNodeId = $state<string | null>(null);
	let categories = $derived(getSupportedStoreChainCategories(store));
	let selectedCategoryId = $derived(
		selectedCategoryOverride &&
			categories.some((category) => category.id === selectedCategoryOverride)
			? selectedCategoryOverride
			: (categories[0]?.id ?? null)
	);

	let graph = $derived(
		selectedCategoryId
			? buildProductChainGraph({ game, store, categoryId: selectedCategoryId })
			: null
	);

	function selectNode(nodeId: string | null): void {
		selectedNodeId = nodeId;
	}

	function selectCategory(categoryId: string): void {
		selectedCategoryOverride = categoryId;
		selectedNodeId = null;
	}
</script>

<section class="store-chain-panel" aria-label={`${store.name} product chain`}>
	{#if categories.length === 0}
		<p>No local production chain available for this store's categories yet.</p>
	{:else if graph}
		<label>
			<span>Product category</span>
			<select
				value={selectedCategoryId ?? ''}
				aria-label="Product category"
				onchange={(event) => selectCategory(event.currentTarget.value)}
			>
				{#each categories as category (category.id)}
					<option value={category.id}>{category.name}</option>
				{/each}
			</select>
		</label>
		<h3>{graph.title}</h3>
		<ProductChainGraph {graph} {selectedNodeId} compact onSelectNode={selectNode} />
		<ProductChainNodeDetail
			node={selectedNodeId ? (graph.details[selectedNodeId] ?? null) : null}
		/>
	{/if}
</section>

<style>
	.store-chain-panel {
		display: grid;
		gap: 0.85rem;
		min-width: 0;
	}

	label {
		display: grid;
		gap: 0.35rem;
	}

	label span {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	select {
		width: 100%;
		border: 1px solid var(--ink-700);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-ui);
		padding: 0.55rem 0.7rem;
	}

	h3,
	p {
		margin: 0;
	}

	h3 {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	p {
		font-family: var(--font-body);
		font-size: 0.9rem;
		color: var(--ink-500);
	}
</style>
```

- [ ] **Step 4: Integrate `Product Chain` tab into `TileInspector.svelte`**

Modify `src/lib/components/game/TileInspector.svelte`:

```svelte
<script lang="ts">
	import StoreProductChainPanel from '$lib/components/game/StoreProductChainPanel.svelte';
	// keep existing imports
	import type { GameState } from '$lib/game/types';

	interface Props {
		game: GameState;
		// keep existing props
	}

	type StoreInspectorTab = 'details' | 'stock' | 'staff' | 'chain';
</script>
```

Add a fourth tab after `Stock`:

```svelte
<button
	type="button"
	class="store-tab"
	class:active={activeStoreTab === 'chain'}
	role="tab"
	id={`${store.id}-chain-tab`}
	aria-selected={activeStoreTab === 'chain'}
	aria-controls={`${store.id}-chain-panel`}
	tabindex={activeStoreTab === 'chain' ? 0 : -1}
	onclick={() => selectStoreTab('chain')}
>
	{#if activeStoreTab === 'chain'}<span class="bookmark tab-bookmark" aria-hidden="true"
		></span>{/if}
	Product Chain
</button>
```

Add a tab panel between stock and staff:

```svelte
<div
	class="store-panel store-chain-panel"
	class:active={activeStoreTab === 'chain'}
	id={`${store.id}-chain-panel`}
	role="tabpanel"
	aria-labelledby={`${store.id}-chain-tab`}
	aria-hidden={activeStoreTab !== 'chain'}
	inert={activeStoreTab !== 'chain'}
>
	<StoreProductChainPanel {game} {store} />
</div>
```

- [ ] **Step 5: Pass game into `TileInspector` from `+page.svelte`**

Modify the existing `TileInspector` call:

```svelte
<TileInspector
	game={game ?? starterMapState}
	tile={selectedTile}
	store={selectedStore}
	staff={game?.staff ?? []}
	hiringCandidates={game?.hiringCandidates ?? []}
	latestStoreReport={latestSelectedStoreReport}
	onUpdateStoreProduct={changeStoreProduct}
	onHireStaff={hireStaff}
	onAssignStaff={assignStaff}
	onUnassignStaff={unassignStoreStaff}
	onClose={closeInspector}
/>
```

- [ ] **Step 6: Update `TileInspector.svelte.spec.ts`**

Add `game` to the render helper props:

```ts
import { createNewGame } from '$lib/game/state';
import type { GameState } from '$lib/game/types';

const game = {
	...createNewGame('convenience', 20260518),
	stores: [store]
};

function renderInspector(
	overrides: Partial<{
		game: GameState;
		// keep existing override fields
	}> = {}
) {
	const props = {
		game,
		// keep existing defaults
		...overrides
	};

	render(TileInspector, props);

	return props;
}
```

Extend the existing tab test to assert the new tab:

```ts
const chainTab = page.getByRole('tab', { name: 'Product Chain' });
await expect.element(chainTab).toHaveAttribute('aria-selected', 'false');

await chainTab.click();

await expect.element(chainTab).toHaveAttribute('aria-selected', 'true');
await expect.element(page.getByLabelText('Product category')).toBeVisible();
```

- [ ] **Step 7: Run Svelte autofixer**

Run the Svelte MCP `svelte_autofixer` on:

- `StoreProductChainPanel.svelte`;
- `TileInspector.svelte`.

Expected: no remaining issues.

- [ ] **Step 8: Run focused store panel tests**

Run:

```bash
bun run test:unit -- src/lib/components/game/StoreProductChainPanel.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts --run --project client
```

Expected: pass.

- [ ] **Step 9: Commit store tab**

```bash
git add src/lib/components/game/StoreProductChainPanel.svelte src/lib/components/game/StoreProductChainPanel.svelte.spec.ts src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts src/routes/+page.svelte
git commit -m "feat: show product chain tab in store detail"
```

---

### Task 6: Add Control Tower Product Chains Panel

**Files:**

- Create: `src/lib/components/game/ProductChainsPanel.svelte`
- Create: `src/lib/components/game/ProductChainsPanel.svelte.spec.ts`
- Modify: `src/routes/+page.svelte`

- [ ] **Step 1: Write Control Tower panel tests**

Create `src/lib/components/game/ProductChainsPanel.svelte.spec.ts`:

```ts
import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import ProductChainsPanel from './ProductChainsPanel.svelte';
import { addWarehouseMaterial } from '$lib/game/industryProduction';
import { createNewGame } from '$lib/game/state';

describe('ProductChainsPanel', () => {
	it('shows owned category cards and an expanded graph', async () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260518);

		render(ProductChainsPanel, { game });

		await expect.element(page.getByRole('region', { name: 'Product Chains' })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /snacks/i })).toBeVisible();
		await expect.element(page.getByRole('button', { name: /warehouse flow/i })).toBeVisible();
		await expect.element(page.getByTestId('product-chain-graph-chain:snacks')).toBeVisible();
	});

	it('toggles to warehouse flow mode', async () => {
		expect.assertions(2);
		const baseGame = createNewGame('convenience', 20260518);
		const game = { ...baseGame, warehouse: addWarehouseMaterial(baseGame.warehouse, 'snacks', 12) };

		render(ProductChainsPanel, { game });

		await page.getByRole('button', { name: /warehouse flow/i }).click();

		await expect.element(page.getByTestId('product-chain-graph-warehouse-flow')).toBeVisible();
		await expect.element(page.getByText('Warehouse flow')).toBeVisible();
	});
});
```

- [ ] **Step 2: Run Control Tower panel tests to verify they fail**

Run:

```bash
bun run test:unit -- src/lib/components/game/ProductChainsPanel.svelte.spec.ts --run --project client
```

Expected: fail because `ProductChainsPanel.svelte` does not exist.

- [ ] **Step 3: Create `ProductChainsPanel.svelte`**

Create `src/lib/components/game/ProductChainsPanel.svelte`:

```svelte
<script lang="ts">
	import ProductChainGraph from './ProductChainGraph.svelte';
	import ProductChainNodeDetail from './ProductChainNodeDetail.svelte';
	import {
		buildProductChainGraph,
		buildStoreCategoryChainSummaries,
		buildWarehouseFlowGraph
	} from '$lib/game/productChainGraph';
	import type { GameState } from '$lib/game/types';

	interface Props {
		game: GameState;
	}

	type ProductChainMode = 'store-categories' | 'warehouse-flow';

	let { game }: Props = $props();
	let mode = $state<ProductChainMode>('store-categories');
	let selectedCategoryId = $state<string | null>(null);
	let selectedNodeId = $state<string | null>(null);
	let summaries = $derived(buildStoreCategoryChainSummaries(game));
	let selectedCategory = $derived(
		selectedCategoryId && summaries.some((summary) => summary.categoryId === selectedCategoryId)
			? selectedCategoryId
			: (summaries[0]?.categoryId ?? null)
	);
	let selectedStore = $derived(game.stores[0] ?? null);
	let chainGraph = $derived(
		selectedCategory && selectedStore
			? buildProductChainGraph({ game, store: selectedStore, categoryId: selectedCategory })
			: null
	);
	let warehouseGraph = $derived(buildWarehouseFlowGraph(game));
	let activeGraph = $derived(mode === 'warehouse-flow' ? warehouseGraph : chainGraph);

	function selectMode(nextMode: ProductChainMode): void {
		mode = nextMode;
		selectedNodeId = null;
	}

	function selectCategory(categoryId: string): void {
		selectedCategoryId = categoryId;
		selectedNodeId = null;
	}

	function selectNode(nodeId: string | null): void {
		selectedNodeId = nodeId;
	}
</script>

<section class="panel paper product-chains" aria-label="Product Chains">
	<header>
		<div>
			<p class="eyebrow">Supply chain</p>
			<h2>Product Chains</h2>
		</div>
		<div class="mode-toggle" role="group" aria-label="Product chain mode">
			<button
				type="button"
				class:active={mode === 'store-categories'}
				onclick={() => selectMode('store-categories')}
			>
				Store category chains
			</button>
			<button
				type="button"
				class:active={mode === 'warehouse-flow'}
				onclick={() => selectMode('warehouse-flow')}
			>
				Warehouse flow
			</button>
		</div>
	</header>

	{#if mode === 'store-categories'}
		{#if summaries.length === 0}
			<p>No owned-store product categories have local production chains yet.</p>
		{:else}
			<div class="category-cards" aria-label="Store category chains">
				{#each summaries as summary (summary.categoryId)}
					<button
						type="button"
						class:active={selectedCategory === summary.categoryId}
						onclick={() => selectCategory(summary.categoryId)}
					>
						<strong>{summary.name}</strong>
						<span>{summary.healthLabel}</span>
						<small>{summary.bottleneck}</small>
					</button>
				{/each}
			</div>
		{/if}
	{/if}

	{#if activeGraph}
		<div class="graph-detail-layout">
			<ProductChainGraph graph={activeGraph} {selectedNodeId} onSelectNode={selectNode} />
			<ProductChainNodeDetail
				node={selectedNodeId ? (activeGraph.details[selectedNodeId] ?? null) : null}
			/>
		</div>
	{/if}
</section>

<style>
	.product-chains {
		display: grid;
		gap: 1rem;
		padding: 1.1rem 1.2rem;
	}

	header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	h2,
	p {
		margin: 0;
	}

	h2 {
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.mode-toggle {
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem;
	}

	.mode-toggle button.active,
	.category-cards button.active {
		background: var(--paper-200);
		border-color: var(--brass-500);
	}

	.category-cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.7rem;
	}

	.category-cards button {
		display: grid;
		gap: 0.25rem;
		text-align: left;
	}

	.category-cards strong {
		font-family: var(--font-display);
		font-weight: 400;
	}

	.category-cards span,
	.category-cards small {
		font-family: var(--font-ui);
	}

	.graph-detail-layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(16rem, 22rem);
		gap: 1rem;
		align-items: start;
	}

	@media (max-width: 860px) {
		header,
		.graph-detail-layout {
			grid-template-columns: 1fr;
		}

		header {
			display: grid;
		}
	}
</style>
```

- [ ] **Step 4: Add Control Tower panel to `+page.svelte`**

Import:

```ts
import ProductChainsPanel from '$lib/components/game/ProductChainsPanel.svelte';
```

Render it inside the Control Tower overlay after `<ReportsPanel {summary} />`:

```svelte
<ReportsPanel {summary} />
<ProductChainsPanel {game} />
```

- [ ] **Step 5: Run Svelte autofixer**

Run the Svelte MCP `svelte_autofixer` on:

- `ProductChainsPanel.svelte`;
- `+page.svelte`.

Expected: no remaining issues.

- [ ] **Step 6: Run focused Control Tower tests**

Run:

```bash
bun run test:unit -- src/lib/components/game/ProductChainsPanel.svelte.spec.ts --run --project client
```

Expected: pass.

- [ ] **Step 7: Commit Control Tower panel**

```bash
git add src/lib/components/game/ProductChainsPanel.svelte src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/routes/+page.svelte
git commit -m "feat: add control tower product chain graphs"
```

---

### Task 7: Add E2E Coverage

**Files:**

- Modify: `src/routes/retail-sim.e2e.ts`

- [ ] **Step 1: Extend store tab layout helper**

Modify `getStorePanelLayout` in `src/routes/retail-sim.e2e.ts` to include the new chain panel:

```ts
return {
	height: rect.height,
	details: readPanel('.store-details'),
	stock: readPanel('.store-stock-panel'),
	chain: readPanel('.store-chain-panel'),
	staff: readPanel('.store-staff-panel')
};
```

- [ ] **Step 2: Add Product Chain tab assertions to the selected-store e2e**

In `manage selected store stock and see weekly imports`, after the stock tab layout assertions and before switching to staff, add:

```ts
await inspector.getByRole('tab', { name: /product chain/i }).click();
const chainPanelLayout = await getStorePanelLayout(page);
expect(chainPanelLayout.details.display).toBe('none');
expect(chainPanelLayout.stock.display).toBe('none');
expect(chainPanelLayout.chain.display).toBe('grid');
expect(chainPanelLayout.staff.display).toBe('none');
await expect(inspector.getByLabel(/product category/i)).toBeVisible();
await expect(inspector.getByTestId(/product-chain-graph-chain:snacks/i)).toBeVisible();
```

- [ ] **Step 3: Add Control Tower graph assertions to the production refill e2e**

In `player builds convenience production and refills from warehouse`, after the existing `productSources` assertions, add:

```ts
await expect(controlTower.getByRole('region', { name: /product chains/i })).toBeVisible();
await expect(controlTower.getByRole('button', { name: /store category chains/i })).toBeVisible();
await expect(controlTower.getByTestId(/product-chain-graph-chain:snacks/i)).toBeVisible();
await controlTower.getByRole('button', { name: /warehouse flow/i }).click();
await expect(controlTower.getByTestId('product-chain-graph-warehouse-flow')).toBeVisible();
```

- [ ] **Step 4: Run the focused e2e tests**

Run:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "manage selected store stock|player builds convenience production"
```

Expected: both selected tests pass.

- [ ] **Step 5: Commit e2e coverage**

```bash
git add src/routes/retail-sim.e2e.ts
git commit -m "test: cover product chain graph flows"
```

---

### Task 8: Final Verification And Cleanup

**Files:**

- All changed files from prior tasks.

- [ ] **Step 1: Run formatting on touched files**

Run:

```bash
bun run format -- src/lib/game/productChainGraph.ts src/lib/game/productChainGraph.spec.ts src/lib/components/game/ProductChainSelectionBridge.svelte src/lib/components/game/ProductChainGraph.svelte src/lib/components/game/ProductChainNodeDetail.svelte src/lib/components/game/StoreProductChainPanel.svelte src/lib/components/game/StoreProductChainPanel.svelte.spec.ts src/lib/components/game/ProductChainsPanel.svelte src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts src/routes/+page.svelte src/routes/retail-sim.e2e.ts
```

Expected: Prettier writes or confirms formatting for the listed files.

- [ ] **Step 2: Run Svelte check**

Run:

```bash
bun run check
```

Expected: pass.

- [ ] **Step 3: Run focused unit and component tests**

Run:

```bash
bun run test:unit -- src/lib/game/productChainGraph.spec.ts src/lib/components/game/StoreProductChainPanel.svelte.spec.ts src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/lib/components/game/TileInspector.svelte.spec.ts --run
```

Expected: pass.

- [ ] **Step 4: Run focused e2e tests**

Run:

```bash
bun run test:e2e -- src/routes/retail-sim.e2e.ts -g "manage selected store stock|player builds convenience production"
```

Expected: pass.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only product-chain graph files, dependency files, `TileInspector`, `+page.svelte`, and `retail-sim.e2e.ts` are changed.

- [ ] **Step 6: Final commit**

If formatting or verification changed files after prior commits:

```bash
git add package.json bun.lock src/lib/game/productChainGraph.ts src/lib/game/productChainGraph.spec.ts src/lib/components/game/ProductChainSelectionBridge.svelte src/lib/components/game/ProductChainGraph.svelte src/lib/components/game/ProductChainNodeDetail.svelte src/lib/components/game/StoreProductChainPanel.svelte src/lib/components/game/StoreProductChainPanel.svelte.spec.ts src/lib/components/game/ProductChainsPanel.svelte src/lib/components/game/ProductChainsPanel.svelte.spec.ts src/lib/components/game/TileInspector.svelte src/lib/components/game/TileInspector.svelte.spec.ts src/routes/+page.svelte src/routes/retail-sim.e2e.ts
git commit -m "chore: finalize product chain graph view"
```

Expected: commit succeeds, or there is nothing to commit because previous task commits already include all final changes.

---

## Self-Review Notes

- Spec coverage:
  - Store detail `Product Chain` tab: Task 5.
  - Control Tower `Product Chains` panel with two modes: Task 6.
  - `@xyflow/svelte` dependency: Task 1.
  - UI-neutral graph data builder: Tasks 2 and 3.
  - Latest-day actual movement and theoretical capacity: Tasks 2 and 3.
  - Node selection detail panel: Tasks 4, 5, and 6.
  - Empty states and unsupported categories: Tasks 2, 3, 5, and 6.
  - E2E coverage: Task 7.
- Marker scan: no unfinished-marker or open-ended implementation gaps are present.
- Type consistency:
  - Graph components consume `ProductChainGraph`, `ProductChainNode`, and `ProductChainHealth` from `src/lib/game/productChainGraph.ts`.
  - Store and Control Tower panels call the same pure graph helpers.
  - Svelte snippets use `$state`, `$derived`, `$effect`, and `$props` consistently with Svelte 5 runes mode.
