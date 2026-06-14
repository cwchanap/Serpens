import { getCategoryTier, MATERIALS, PRODUCTION_RECIPES } from './industry';
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
	getSupportedStoreChainCategories,
	healthLabel,
	isSupportedFinishedMaterial,
	latestCategoryUnitsSold,
	latestProductionReport,
	latestStoreProductReport,
	materialActualMetrics,
	materialHealth,
	recipeInputPerDay,
	recipeOutputPerDay,
	sortEdges,
	type ProductChainCategorySummary,
	type ProductChainEdge,
	type ProductChainGraph,
	type ProductChainHealth,
	type ProductChainNode
} from './productChainGraph';
import type { GameState, MaterialId, ProductionRecipeId, Store } from './types';

/**
 * Safety cap to prevent infinite recursion if a cyclic recipe is ever
 * introduced. Current chains max out at depth 4.
 */
const MAX_CHAIN_DEPTH = 16;

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
	const reachableRecipes = collectReachableRecipeIds(rootRecipeId);
	const inputWeights = createInputWeightMap(
		input.game.industrialBuildings,
		report,
		reachableRecipes
	);
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
		if (depth > MAX_CHAIN_DEPTH) {
			throw new Error(
				`product chain exceeded max depth ${MAX_CHAIN_DEPTH} at recipe ${recipeId} — possible cycle`
			);
		}
		const recipe = PRODUCTION_RECIPES[recipeId];
		const id = path === '' ? `recipe:${recipeId}` : `recipe:${recipeId}@${path}`;
		const childPath = path === '' ? recipeId : `${path}/${recipeId}`;
		const buildingCount = buildingsForRecipe(input.game.industrialBuildings, recipeId).length;
		const throughputUnits = getRecipeThroughputUnits(input.game.industrialBuildings, recipeId);
		const { actual, health: outputHealth } = materialMetrics(outputMaterialId);
		// Zero placed buildings outranks "no report yet": the player must build
		// before reports matter.
		const health: ProductChainHealth = buildingCount === 0 ? 'no-local-capacity' : outputHealth;
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
	visit(rootEntry, (entry) => nodes.push(entry.node));
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

export function buildStoreCategoryChainSummaries(game: GameState): ProductChainCategorySummary[] {
	const summaries = new Map<string, ProductChainCategorySummary>();

	for (const store of game.stores) {
		for (const category of getSupportedStoreChainCategories(store)) {
			if (summaries.has(category.id)) {
				continue;
			}

			const tree = buildProductChainTree({ game, store: null, categoryId: category.id });
			const rootNode = tree.nodes.find((node) => node.id === `product:${category.id}`);

			if (!rootNode) {
				throw new Error(`chain tree for supported category ${category.id} produced no root node`);
			}

			summaries.set(category.id, {
				categoryId: category.id,
				name: category.name,
				tier: getCategoryTier(category.id),
				health: rootNode.health,
				healthLabel: rootNode.healthLabel,
				bottleneck: rootNode.bottleneck,
				warehouseStock: rootNode.warehouseStock,
				produced: rootNode.actual.produced,
				consumed: latestCategoryUnitsSold(game, category.id),
				imported: rootNode.actual.importedInput + rootNode.actual.shopImported
			});
		}
	}

	return [...summaries.values()].sort(
		(first, second) =>
			(first.tier ?? Number.MAX_SAFE_INTEGER) - (second.tier ?? Number.MAX_SAFE_INTEGER) ||
			first.name.localeCompare(second.name)
	);
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

/**
 * Walks the recipe graph from the root producer and collects every recipe
 * reachable through its inputs. Used to scope the input-weight map so edge
 * flow allocation only accounts for recipes that actually appear in this tree
 * — otherwise a material shared with a sibling finished chain (e.g. water
 * consumed by both the Drinks tree and the bottled-water chain) leaks part of
 * its consumed flow out of the displayed edges.
 */
function collectReachableRecipeIds(rootRecipeId: ProductionRecipeId): Set<ProductionRecipeId> {
	const visited = new Set<ProductionRecipeId>();
	const stack: ProductionRecipeId[] = [rootRecipeId];

	while (stack.length > 0) {
		const recipeId = stack.pop()!;

		if (visited.has(recipeId)) {
			continue;
		}

		visited.add(recipeId);
		const recipe = PRODUCTION_RECIPES[recipeId];

		if (!recipe) {
			continue;
		}

		for (const inputMaterial of recipe.inputs) {
			const producerRecipeId = MATERIAL_PRODUCER_RECIPES.get(inputMaterial.materialId);

			if (producerRecipeId && !visited.has(producerRecipeId)) {
				stack.push(producerRecipeId);
			}
		}
	}

	return visited;
}
