import { getArchetype } from './archetypes';
import { INDUSTRIAL_BUILDING_TYPES, MATERIALS, PRODUCTION_RECIPES } from './industry';
import { getWarehouseUsed } from './industryProduction';
import { getBuildingThroughputMultiplier } from './leveling';
import type {
	DailyMaterialMovement,
	DailyProductReport,
	DailyProductionReport,
	GameState,
	IndustrialBuilding,
	IndustrialBuildingType,
	MaterialId,
	MaterialKind,
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
	stage: ProductionRecipe['stage'] | MaterialKind | 'warehouse' | null;
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
	requiredPerCycle: number;
	actualPerDay: number;
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

interface ChainInputWeight {
	recipeId: ProductionRecipeId;
	requiredPerCycle: number;
	requiredPerDay: number;
	inferredPerDay: number;
}

const MATERIAL_PRODUCER_RECIPES = createMaterialProducerRecipeMap();
export const SUPPORTED_FINISHED_MATERIALS = createSupportedFinishedMaterials();

export function getSupportedStoreChainCategories(store: Store): ProductCategory[] {
	const supported = new Set<string>(SUPPORTED_FINISHED_MATERIALS);

	return getArchetype(store.archetypeId).startingCategories.filter((category) =>
		supported.has(category.id)
	);
}

export function buildProductChainGraph(input: {
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
	const nodes = new Map<string, ProductChainNode>();
	const edges = new Map<string, ProductChainEdge>();
	const visitedMaterials = new Set<MaterialId>();
	const warnings: string[] = [];
	const inputWeights = createInputWeightMap(input.game.industrialBuildings, report);

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
		edges: sortEdges([...edges.values()]),
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
		const producerThroughputUnits = producerRecipeId
			? getRecipeThroughputUnits(input.game.industrialBuildings, producerRecipeId)
			: 0;
		const actual = materialActualMetrics(
			report,
			materialId,
			materialId === rootMaterialId ? productReport : null
		);
		const warehouseStock = input.game.warehouse.materials[materialId] ?? 0;
		const health = materialHealth({
			hasReport: report !== null,
			actual,
			warehouseStock,
			producerBuildingCount,
			hasProducerRecipe: producerRecipe !== null
		});
		const materialLabel = MATERIALS[materialId]?.name ?? materialId;
		const materialStage = producerRecipe?.stage ?? MATERIALS[materialId]?.kind ?? null;
		const materialNode: ProductChainNode = {
			id: `material:${materialId}`,
			kind: 'material',
			label: materialLabel,
			materialId,
			recipeId: null,
			stage: materialStage,
			layer: graphLayer({ kind: 'material', stage: materialStage }),
			row: 0,
			health,
			healthLabel: healthLabel(health),
			warehouseStock,
			capacity: {
				buildingCount: producerBuildingCount,
				outputPerDay: producerRecipe
					? recipeOutputPerDay(producerRecipe, producerThroughputUnits)
					: 0,
				inputPerDay: producerRecipe ? recipeInputPerDay(producerRecipe, producerThroughputUnits) : 0
			},
			actual,
			bottleneck: bottleneckText({ kind: 'material', health, label: materialLabel })
		};
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
		const throughputUnits = getRecipeThroughputUnits(input.game.industrialBuildings, recipeId);
		const health = recipeHealth({ hasReport: report !== null, buildingCount });
		const recipeLabel = buildingTypesForRecipe(recipeId)[0]?.name ?? recipeId;
		const recipeNode: ProductChainNode = {
			id: `recipe:${recipeId}`,
			kind: 'recipe',
			label: recipeLabel,
			materialId: null,
			recipeId,
			stage: recipe.stage,
			layer: graphLayer({ kind: 'recipe', stage: recipe.stage }),
			row: 0,
			health,
			healthLabel: healthLabel(health),
			warehouseStock: 0,
			capacity: {
				buildingCount,
				outputPerDay: recipeOutputPerDay(recipe, throughputUnits),
				inputPerDay: recipeInputPerDay(recipe, throughputUnits)
			},
			actual: emptyActualMetrics(),
			bottleneck: bottleneckText({ kind: 'recipe', health, label: recipeLabel })
		};
		nodes.set(recipeNode.id, recipeNode);
		addEdge({
			source: `recipe:${recipeId}`,
			target: `material:${outputMaterialId}`,
			materialId: outputMaterialId,
			requiredPerCycle:
				recipe.outputs.find((output) => output.materialId === outputMaterialId)?.quantity ?? 0,
			direction: 'output'
		});

		for (const inputMaterial of recipe.inputs) {
			collectMaterial(inputMaterial.materialId);
			addEdge({
				source: `material:${inputMaterial.materialId}`,
				target: `recipe:${recipeId}`,
				materialId: inputMaterial.materialId,
				requiredPerCycle: inputMaterial.quantity,
				direction: 'input'
			});
		}
	}

	function addEdge(edge: {
		source: string;
		target: string;
		materialId: MaterialId;
		requiredPerCycle: number;
		direction: 'input' | 'output';
	}): void {
		const actual = materialActualMetrics(
			report,
			edge.materialId,
			edge.materialId === rootMaterialId ? productReport : null
		);
		const producerRecipeId = MATERIAL_PRODUCER_RECIPES.get(edge.materialId);
		const health = materialHealth({
			hasReport: report !== null,
			actual,
			warehouseStock: input.game.warehouse.materials[edge.materialId] ?? 0,
			producerBuildingCount: producerRecipeId
				? buildingsForRecipe(input.game.industrialBuildings, producerRecipeId).length
				: 0,
			hasProducerRecipe: producerRecipeId !== undefined
		});
		const actualPerDay =
			edge.direction === 'output'
				? actual.produced
				: allocateInputMovement(inputWeights, edge.materialId, edge.target, actual.consumed);
		const importedPerDay =
			edge.direction === 'input'
				? allocateInputMovement(inputWeights, edge.materialId, edge.target, actual.importedInput)
				: 0;
		const label = formatRecipeEdgeLabel({
			actualPerDay,
			requiredPerCycle: edge.requiredPerCycle,
			direction: edge.direction,
			imported: importedPerDay
		});
		edges.set(`${edge.source}->${edge.target}`, {
			id: `${edge.source}->${edge.target}`,
			source: edge.source,
			target: edge.target,
			materialId: edge.materialId,
			label,
			requiredPerCycle: edge.requiredPerCycle,
			actualPerDay,
			health
		});
	}
}

export function buildStoreCategoryChainSummaries(game: GameState): ProductChainCategorySummary[] {
	const summaries = new Map<string, ProductChainCategorySummary>();

	for (const store of game.stores) {
		for (const category of getSupportedStoreChainCategories(store)) {
			if (summaries.has(category.id)) {
				continue;
			}

			const graph = buildProductChainGraph({ game, store: null, categoryId: category.id });
			const rootNode = graph.nodes.find((node) => node.id === `material:${category.id}`);
			summaries.set(category.id, {
				categoryId: category.id,
				name: category.name,
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
		const producerRecipeId = MATERIAL_PRODUCER_RECIPES.get(materialId);
		const health = materialHealth({
			hasReport: report !== null,
			actual,
			warehouseStock: game.warehouse.materials[materialId] ?? 0,
			producerBuildingCount: producerRecipeId
				? buildingsForRecipe(game.industrialBuildings, producerRecipeId).length
				: 0,
			hasProducerRecipe: producerRecipeId !== undefined
		});
		const materialLabel = MATERIALS[materialId]?.name ?? materialId;
		const materialNode: ProductChainNode = {
			id: `material:${materialId}`,
			kind: 'material',
			label: materialLabel,
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
			bottleneck: bottleneckText({ kind: 'material', health, label: materialLabel })
		};
		nodes.push(materialNode);

		if (actual.produced > 0) {
			edges.push({
				id: `material:${materialId}->warehouse`,
				source: `material:${materialId}`,
				target: 'warehouse',
				materialId,
				label: `${actual.produced}/day in`,
				requiredPerCycle: 0,
				actualPerDay: actual.produced,
				health
			});
		}

		if (actual.warehousePulled > 0) {
			edges.push({
				id: `warehouse->material:${materialId}`,
				source: 'warehouse',
				target: `material:${materialId}`,
				materialId,
				label: `${actual.warehousePulled}/day out`,
				requiredPerCycle: 0,
				actualPerDay: actual.warehousePulled,
				health
			});
		}
	}

	const sortedNodes = nodes.sort(
		(first, second) => first.layer - second.layer || first.label.localeCompare(second.label)
	);
	const details = Object.fromEntries(sortedNodes.map((node) => [node.id, node]));

	return {
		id: 'warehouse-flow',
		title: 'Warehouse flow',
		nodes: sortedNodes,
		edges: sortEdges(edges),
		details,
		warnings: report ? [] : ['No daily report yet; latest-day flow is unavailable.'],
		emptyReason: null
	};
}

function createMaterialProducerRecipeMap(): ReadonlyMap<MaterialId, ProductionRecipeId> {
	const producerRecipes = new Map<MaterialId, ProductionRecipeId>();

	for (const recipe of Object.values(PRODUCTION_RECIPES)) {
		for (const output of recipe.outputs) {
			const existingRecipeId = producerRecipes.get(output.materialId);

			if (existingRecipeId) {
				throw new Error(
					`Material ${output.materialId} is produced by both ${existingRecipeId} and ${recipe.id}. Product chain graphs require one producer recipe per material.`
				);
			}

			producerRecipes.set(output.materialId, recipe.id);
		}
	}

	return producerRecipes;
}

function createSupportedFinishedMaterials(): readonly MaterialId[] {
	return Object.values(MATERIALS)
		.filter(
			(material) => material.kind === 'finished' && MATERIAL_PRODUCER_RECIPES.has(material.id)
		)
		.map((material) => material.id);
}

function createInputWeightMap(
	buildings: IndustrialBuilding[],
	report: DailyProductionReport | null
): ReadonlyMap<MaterialId, readonly ChainInputWeight[]> {
	const weights = new Map<MaterialId, ChainInputWeight[]>();
	const inferredCycles = inferRecipeCycles(report);

	for (const recipe of Object.values(PRODUCTION_RECIPES)) {
		const throughputUnits = getRecipeThroughputUnits(buildings, recipe.id);

		for (const input of recipe.inputs) {
			const materialWeights = weights.get(input.materialId) ?? [];
			materialWeights.push({
				recipeId: recipe.id,
				requiredPerCycle: input.quantity,
				requiredPerDay: input.quantity * throughputUnits,
				inferredPerDay: input.quantity * (inferredCycles.get(recipe.id) ?? 0)
			});
			weights.set(input.materialId, materialWeights);
		}
	}

	return weights;
}

function inferRecipeCycles(
	report: DailyProductionReport | null
): ReadonlyMap<ProductionRecipeId, number> {
	const cycles = new Map<ProductionRecipeId, number>();

	for (const movement of report?.produced ?? []) {
		const recipeId = MATERIAL_PRODUCER_RECIPES.get(movement.materialId);

		if (!recipeId) {
			continue;
		}

		const recipe = PRODUCTION_RECIPES[recipeId];
		const outputQuantity = recipe.outputs.find(
			(output) => output.materialId === movement.materialId
		)?.quantity;

		if (!outputQuantity || outputQuantity <= 0) {
			continue;
		}

		cycles.set(recipeId, (cycles.get(recipeId) ?? 0) + movement.quantity / outputQuantity);
	}

	return cycles;
}

function isSupportedFinishedMaterial(categoryId: string): categoryId is MaterialId {
	return (SUPPORTED_FINISHED_MATERIALS as readonly string[]).includes(categoryId);
}

function latestProductionReport(game: GameState): DailyProductionReport | null {
	return game.reports.at(-1)?.productionReport ?? null;
}

function latestStoreProductReport(
	game: GameState,
	store: Store | null,
	categoryId: string
): DailyProductReport | null {
	const storeReports = game.reports.at(-1)?.storeReports ?? [];

	if (!store) {
		return aggregateProductReports(
			categoryId,
			storeReports.flatMap((report) =>
				report.productReports.filter((productReport) => productReport.categoryId === categoryId)
			)
		);
	}

	return (
		storeReports
			.find((report) => report.storeId === store.id)
			?.productReports.find((report) => report.categoryId === categoryId) ?? null
	);
}

export function aggregateProductReports(
	categoryId: string,
	productReports: DailyProductReport[]
): DailyProductReport | null {
	if (productReports.length === 0) {
		return null;
	}

	const firstReport = productReports[0]!;

	return {
		categoryId,
		name: firstReport.name,
		unitsSold: sumProductReports(productReports, (report) => report.unitsSold),
		demandMissed: sumProductReports(productReports, (report) => report.demandMissed),
		revenue: sumProductReports(productReports, (report) => report.revenue),
		costOfGoods: sumProductReports(productReports, (report) => report.costOfGoods),
		grossMargin: sumProductReports(productReports, (report) => report.grossMargin),
		endingStock: sumProductReports(productReports, (report) => report.endingStock),
		warehouseUnits: sumProductReports(productReports, (report) => report.warehouseUnits),
		warehouseValue: sumProductReports(productReports, (report) => report.warehouseValue),
		importedUnits: sumProductReports(productReports, (report) => report.importedUnits),
		importCost: aggregateImportCost(productReports),
		importSpend: sumProductReports(productReports, (report) => report.importSpend)
	};
}

function aggregateImportCost(productReports: DailyProductReport[]): number {
	const importedUnits = sumProductReports(productReports, (report) => report.importedUnits);
	const importSpend = sumProductReports(productReports, (report) => report.importSpend);

	if (importedUnits > 0) {
		return importSpend / importedUnits;
	}

	return 0;
}

function sumProductReports(
	productReports: DailyProductReport[],
	getValue: (report: DailyProductReport) => number
): number {
	return productReports.reduce((total, report) => total + getValue(report), 0);
}

function latestCategoryUnitsSold(game: GameState, categoryId: string): number {
	return (
		game.reports
			.at(-1)
			?.storeReports.flatMap((report) => report.productReports)
			.filter((report) => report.categoryId === categoryId)
			.reduce((total, report) => total + report.unitsSold, 0) ?? 0
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

function getRecipeThroughputUnits(
	buildings: IndustrialBuilding[],
	recipeId: ProductionRecipeId
): number {
	return buildingsForRecipe(buildings, recipeId).reduce(
		(total, building) => total + getBuildingThroughputMultiplier(building.level),
		0
	);
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

function allocateInputMovement(
	weights: ReadonlyMap<MaterialId, readonly ChainInputWeight[]>,
	materialId: MaterialId,
	recipeNodeId: string,
	materialTotal: number
): number {
	const recipeId = parseRecipeNodeId(recipeNodeId);

	if (!recipeId || materialTotal <= 0) {
		return 0;
	}

	const materialWeights = weights.get(materialId) ?? [];
	const matchingWeight = materialWeights.find((weight) => weight.recipeId === recipeId);

	if (!matchingWeight) {
		return 0;
	}

	const inferredTotal = materialWeights.reduce((total, weight) => total + weight.inferredPerDay, 0);

	if (inferredTotal > 0) {
		const inferredQuantity =
			materialTotal >= inferredTotal
				? matchingWeight.inferredPerDay
				: (materialTotal * matchingWeight.inferredPerDay) / inferredTotal;

		return roundFlowQuantity(inferredQuantity);
	}

	const capacityTotal = materialWeights.reduce((total, weight) => total + weight.requiredPerDay, 0);
	const useCapacityWeights = capacityTotal > 0;
	const denominator = useCapacityWeights
		? capacityTotal
		: materialWeights.reduce((total, weight) => total + weight.requiredPerCycle, 0);
	const numerator = useCapacityWeights
		? matchingWeight.requiredPerDay
		: matchingWeight.requiredPerCycle;

	if (denominator <= 0) {
		return 0;
	}

	return roundFlowQuantity((materialTotal * numerator) / denominator);
}

function parseRecipeNodeId(nodeId: string): ProductionRecipeId | null {
	const prefix = 'recipe:';

	if (!nodeId.startsWith(prefix)) {
		return null;
	}

	const recipeId = nodeId.slice(prefix.length);

	return Object.hasOwn(PRODUCTION_RECIPES, recipeId) ? (recipeId as ProductionRecipeId) : null;
}

function roundFlowQuantity(quantity: number): number {
	return Number(quantity.toFixed(2));
}

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

function formatRecipeEdgeLabel(input: {
	actualPerDay: number;
	requiredPerCycle: number;
	direction: 'input' | 'output';
	imported: number;
}): string {
	const verb = input.direction === 'output' ? 'produced' : 'used';
	const importLabel = input.imported > 0 ? ' · import' : '';

	return `${formatQuantity(input.actualPerDay)}/day ${verb} · ${formatQuantity(
		input.requiredPerCycle
	)}/cycle${importLabel}`;
}

export function formatQuantity(quantity: number): string {
	return Number.isInteger(quantity)
		? String(quantity)
		: quantity.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function materialHealth(input: {
	hasReport: boolean;
	actual: ProductChainActualMetrics;
	warehouseStock: number;
	producerBuildingCount: number;
	hasProducerRecipe: boolean;
}): ProductChainHealth {
	if (!input.hasReport) {
		return 'no-report';
	}

	if (input.actual.demandMissed > 0) {
		return 'shortage';
	}

	if (input.actual.importedInput > 0 || input.actual.shopImported > 0) {
		return 'shortage';
	}

	if (input.hasProducerRecipe && input.producerBuildingCount === 0) {
		return 'no-local-capacity';
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

function graphLayer(node: Pick<ProductChainNode, 'kind' | 'stage'>): number {
	const stageOrder = new Map<NonNullable<ProductChainNode['stage']>, number>([
		['raw', 0],
		['intermediate', 2],
		['process', 2],
		['finished', 4],
		['final', 4],
		['warehouse', 5]
	]);

	return node.kind === 'material'
		? Math.max(0, stageOrder.get(node.stage ?? 'raw') ?? 0) + 1
		: (stageOrder.get(node.stage ?? 'warehouse') ?? 0);
}

function sortNodes(nodes: ProductChainNode[]): ProductChainNode[] {
	return nodes
		.sort((first, second) => first.layer - second.layer || first.label.localeCompare(second.label))
		.map((node, index, sorted) => ({
			...node,
			row: sorted.filter((candidate) => candidate.layer === node.layer).indexOf(node)
		}));
}

function sortEdges(edges: ProductChainEdge[]): ProductChainEdge[] {
	return edges.sort(
		(first, second) =>
			first.source.localeCompare(second.source) ||
			first.target.localeCompare(second.target) ||
			first.id.localeCompare(second.id)
	);
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
