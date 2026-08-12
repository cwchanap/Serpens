import { compareWorldCityIds, getCityInventoryStats } from './cityInventory';
import { MATERIALS, PRODUCTION_RECIPES } from './industry';
import {
	buildingTypesForRecipe,
	buildingsForRecipe,
	getMaterialOutputCapacityPerDay,
	getIndustryInventoryScope,
	MATERIAL_PRODUCER_RECIPES,
	getSupportedStoreChainCategories
} from './productChainGraph';
import {
	buildRailNetwork,
	createRailBudget,
	findShippingPath,
	getBuildingAttachCellKeys
} from './rail';
import { REPLENISHMENT_INTERVAL_DAYS } from './retailSupply';
import { buildCityDemandPools, getFinishedMaterialIdForCategory } from './stock';
import { getWorldCityDefinition, WORLD_CITY_CATALOG } from './worldCatalog';
import type {
	City,
	GameState,
	IndustrialBuilding,
	IndustrialBuildingTypeId,
	MaterialId,
	ProductionRecipeId,
	WorldCityId
} from './types';

export type SupplyPlannerHorizonDays = 7 | 30;

export interface SupplyPlannerRequest {
	retailCityId: WorldCityId;
	categoryId: string;
}

export interface SupplyDemandContributor {
	retailCityId: WorldCityId;
	potentialDemandPerDay: number;
	replenishmentCeilingPerDay: number;
	effectiveDemandPerDay: number;
	retailImportCostPerUnit: number;
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
	demandContributors: readonly SupplyDemandContributor[];
	demandPerDay: number;
	finishedImportCostPerUnit: number;
	inventory: Partial<Record<MaterialId, number>>;
	warehouseCapacity: number;
	warehouseUsed: number;
	buildings: readonly SupplyPlannerBuildingSnapshot[];
	usableBuildingIds: readonly string[];
	disconnectedBuildingIds: readonly string[];
	usableSinkBuildingIdsByMaterial: Partial<Record<MaterialId, readonly string[]>>;
	activeOutboundRouteIds: readonly string[];
	reachableDemandByMaterial: Partial<Record<MaterialId, number>>;
}

export interface RequiredChainReachability {
	usableBuildingIds: ReadonlySet<string>;
	disconnectedBuildingIds: readonly string[];
	usableSinkBuildingIdsByMaterial: Partial<Record<MaterialId, readonly string[]>>;
	reachableDemandByMaterial: Partial<Record<MaterialId, number>>;
}

export interface SupplyMaterialRequirement {
	materialId: MaterialId;
	requiredPerDay: number;
	producerRecipeId: ProductionRecipeId | null;
	chainDepth: number;
}

export interface SupplyMaterialHorizonProjection {
	horizonDays: SupplyPlannerHorizonDays;
	requiredUnits: number;
	startingInventoryUnits: number;
	localAvailableUnits: number;
	importRequiredUnits: number;
	endingInventoryUnits: number;
	daysOfCover: number | null;
	projectedStockoutDay: number | null;
}

export interface SupplyMaterialProjection extends SupplyMaterialRequirement {
	buildingCount: number;
	maxBuildingLevel: number;
	buildingLevels: readonly number[];
	inventoryUnits: number;
	daysOfCover: number | null;
	projectedStockoutDay: number | null;
	installedCapacityPerDay: number;
	usableCapacityPerDay: number;
	sevenDay: SupplyMaterialHorizonProjection;
	thirtyDay: SupplyMaterialHorizonProjection;
}

export interface SupplyWarehouseEvidence {
	capacity: number;
	used: number;
	freeCapacity: number;
	overflowUnits: number;
}

export type SupplyBottleneck =
	| { kind: 'missing-producer'; materialId: MaterialId; chainDepth: number }
	| { kind: 'warehouse-capacity'; overflowUnits: number; freeCapacity: number }
	| { kind: 'rail-disconnected'; buildingId: string; materialId: MaterialId }
	| { kind: 'production-capacity'; materialId: MaterialId; deficitPerDay: number }
	| { kind: 'inventory-cover'; materialId: MaterialId; stockoutDay: number }
	| { kind: 'import-reliance'; materialId: MaterialId; importedUnits30: number }
	| { kind: 'none' };

export type SupplyPlannerLimitation =
	| { kind: 'active-logistics-not-modeled'; routeIds: readonly string[] }
	| { kind: 'rail-capacity-not-modeled' }
	| { kind: 'store-sales-capacity-not-modeled' };

export interface SupplyPlannerProjection {
	snapshot: SupplyPlannerSnapshot;
	materials: readonly SupplyMaterialProjection[];
	warehouse: SupplyWarehouseEvidence;
	bottleneck: SupplyBottleneck;
	limitations: readonly SupplyPlannerLimitation[];
}

export type SupplyPlannerSnapshotResult =
	| { status: 'ready'; snapshot: SupplyPlannerSnapshot }
	| { status: 'empty'; reason: 'no-supported-products' }
	| { status: 'unavailable'; reason: 'retail-city-unavailable' | 'supply-city-unavailable' }
	| { status: 'unsupported'; reason: 'unsupported-category' | 'missing-producer-recipe' }
	| { status: 'invalid'; reason: 'invalid-request' };

export function listSupplyPlannerCategories(game: GameState, retailCityId: string): string[] {
	const city = findAvailableRetailCity(game, retailCityId);
	if (!city) return [];

	const ids = new Set<string>();
	const stores = game.stores
		.filter((store) => store.cityId === city.id)
		.sort((left, right) => compareCodeUnitStrings(left.id, right.id));
	for (const store of stores) {
		for (const category of getSupportedStoreChainCategories(store)) {
			if (store.products.some((product) => product.categoryId === category.id)) {
				ids.add(category.id);
			}
		}
	}

	return [...ids];
}

export function buildSupplyPlannerSnapshot(
	game: GameState,
	request: SupplyPlannerRequest
): SupplyPlannerSnapshotResult {
	if (!isValidRequest(request)) {
		return { status: 'invalid', reason: 'invalid-request' };
	}

	const retailCity = findAvailableRetailCity(game, request.retailCityId);
	if (!retailCity) {
		return { status: 'unavailable', reason: 'retail-city-unavailable' };
	}

	const categories = listSupplyPlannerCategories(game, request.retailCityId);
	if (categories.length === 0) {
		return { status: 'empty', reason: 'no-supported-products' };
	}
	if (!categories.includes(request.categoryId)) {
		return { status: 'unsupported', reason: 'unsupported-category' };
	}

	const finishedMaterialId = getFinishedMaterialIdForCategory(request.categoryId);
	if (!finishedMaterialId) {
		return { status: 'unsupported', reason: 'unsupported-category' };
	}
	if (!MATERIAL_PRODUCER_RECIPES.has(finishedMaterialId)) {
		return { status: 'unsupported', reason: 'missing-producer-recipe' };
	}

	const assignment = game.retailSupplyAssignments.find(
		(candidate) => candidate.retailCityId === retailCity.id
	);
	if (!assignment || assignment.supplyCityId === null) {
		return { status: 'unavailable', reason: 'supply-city-unavailable' };
	}

	// Resolve the inventory scope before reading stats. This preserves the
	// soft-unavailable boundary for a configured but closed/missing city while
	// allowing getCityInventoryStats to remain the authoritative corruption
	// boundary for an otherwise valid inventory.
	const industry = getIndustryInventoryScope(game, assignment.supplyCityId);
	if (!industry) {
		return { status: 'unavailable', reason: 'supply-city-unavailable' };
	}
	const inventoryStats = getCityInventoryStats(game, industry.cityId);

	const claimantCities = getClaimantCities(game, industry.cityId);
	const demandContributors = claimantCities
		.map((city) => buildDemandContributor(game, city, request.categoryId))
		.filter((contributor): contributor is SupplyDemandContributor => contributor !== null);
	const selectedContributor = demandContributors.find(
		(contributor) => contributor.retailCityId === retailCity.id
	);
	if (!selectedContributor) {
		return { status: 'empty', reason: 'no-supported-products' };
	}

	const demandPerDay = demandContributors.reduce(
		(total, contributor) => total + contributor.effectiveDemandPerDay,
		0
	);
	const finishedImportCostPerUnit =
		demandPerDay > 0
			? demandContributors.reduce(
					(total, contributor) =>
						total + contributor.effectiveDemandPerDay * contributor.retailImportCostPerUnit,
					0
				) / demandPerDay
			: selectedContributor.retailImportCostPerUnit;

	const buildingSnapshots = industry.buildings
		.map((building) => ({
			id: building.id,
			cityId: building.cityId as WorldCityId,
			typeId: building.typeId,
			level: building.level
		}))
		.sort((left, right) => compareCodeUnitStrings(left.id, right.id));

	const requirements = buildSupplyMaterialRequirements({ finishedMaterialId, demandPerDay });
	const reachability = buildRequiredChainReachability(
		game,
		{
			supplyCityId: industry.cityId,
			finishedMaterialId,
			demandPerDay,
			buildings: buildingSnapshots
		},
		industry.buildings
	);
	const requiredMaterialIds = new Set(requirements.map((requirement) => requirement.materialId));

	const snapshot: SupplyPlannerSnapshot = {
		retailCityId: retailCity.id as WorldCityId,
		supplyCityId: industry.cityId,
		finishedMaterialId,
		cash: game.cash,
		demandContributors,
		demandPerDay,
		finishedImportCostPerUnit,
		inventory: { ...industry.inventory.materials },
		warehouseCapacity: inventoryStats.capacity,
		warehouseUsed: inventoryStats.used,
		buildings: buildingSnapshots,
		usableBuildingIds: [...reachability.usableBuildingIds].sort(compareCodeUnitStrings),
		disconnectedBuildingIds: reachability.disconnectedBuildingIds,
		usableSinkBuildingIdsByMaterial: reachability.usableSinkBuildingIdsByMaterial,
		activeOutboundRouteIds: game.logistics.recurringRoutes
			.filter(
				(route) =>
					route.state === 'active' &&
					route.originCityId === industry.cityId &&
					requiredMaterialIds.has(route.materialId)
			)
			.map((route) => route.id)
			.sort(compareCodeUnitStrings),
		reachableDemandByMaterial: reachability.reachableDemandByMaterial
	};

	return { status: 'ready', snapshot };
}

export function buildSupplyMaterialRequirements(
	snapshot: Pick<SupplyPlannerSnapshot, 'finishedMaterialId' | 'demandPerDay'>
): SupplyMaterialRequirement[] {
	const requirements = new Map<MaterialId, SupplyMaterialRequirement>();
	const visiting = new Set<MaterialId>();

	const addRequirement = (materialId: MaterialId, requiredPerDay: number, chainDepth: number) => {
		const existing = requirements.get(materialId);
		if (existing) {
			existing.requiredPerDay += requiredPerDay;
			existing.chainDepth = Math.max(existing.chainDepth, chainDepth);
			return;
		}

		requirements.set(materialId, {
			materialId,
			requiredPerDay,
			producerRecipeId: MATERIAL_PRODUCER_RECIPES.get(materialId) ?? null,
			chainDepth
		});
	};

	const visit = (materialId: MaterialId, requiredPerDay: number, chainDepth: number): void => {
		addRequirement(materialId, requiredPerDay, chainDepth);
		if (visiting.has(materialId)) return;

		const recipeId = MATERIAL_PRODUCER_RECIPES.get(materialId);
		if (!recipeId) return;
		const recipe = PRODUCTION_RECIPES[recipeId];
		if (!recipe) return;
		const output = recipe.outputs.find((candidate) => candidate.materialId === materialId);
		if (!output || output.quantity <= 0) return;

		visiting.add(materialId);
		const unitsPerRecipe = requiredPerDay / output.quantity;
		for (const input of recipe.inputs) {
			visit(input.materialId, unitsPerRecipe * input.quantity, chainDepth + 1);
		}
		visiting.delete(materialId);
	};

	visit(snapshot.finishedMaterialId, snapshot.demandPerDay, 0);

	return [...requirements.values()].sort(
		(left, right) =>
			left.chainDepth - right.chainDepth ||
			compareCodeUnitStrings(left.materialId, right.materialId)
	);
}

/** Alias retained for callers that prefer a read-model getter name. */
export const getSupplyMaterialRequirements = buildSupplyMaterialRequirements;

interface ReachabilityOutput {
	building: IndustrialBuilding;
	materialId: MaterialId;
}

interface ReachabilityContext {
	network: ReturnType<typeof buildRailNetwork>;
	budget: ReturnType<typeof createRailBudget>;
	attachCellsByBuildingId: ReadonlyMap<string, readonly string[]>;
	buildings: readonly IndustrialBuilding[];
	requiredMaterialIds: ReadonlySet<MaterialId>;
	outputsByMaterial: ReadonlyMap<MaterialId, readonly ReachabilityOutput[]>;
	sinksByMaterial: Map<MaterialId, readonly ReachabilityOutput[]>;
	memo: Map<string, boolean>;
	visiting: Set<string>;
}

/**
 * Required-chain connectivity is intentionally path-only. Every search uses a
 * fresh positive rail budget, but no search consumes it; shared-cell rail
 * throughput remains an explicit planner limitation.
 */
export function buildRequiredChainReachability(
	game: GameState,
	snapshot: Pick<
		SupplyPlannerSnapshot,
		'supplyCityId' | 'finishedMaterialId' | 'demandPerDay' | 'buildings'
	>,
	actualBuildings: readonly IndustrialBuilding[] = game.industrialBuildings
): RequiredChainReachability {
	const requirements = buildSupplyMaterialRequirements(snapshot);
	const requiredMaterialIds = new Set(requirements.map((requirement) => requirement.materialId));
	assertNoRequiredChainCycle(requiredMaterialIds);
	const scopedBuildings = actualBuildings
		.filter((building) => building.cityId === snapshot.supplyCityId)
		.sort((left, right) => compareCodeUnitStrings(left.id, right.id));
	const city = game.industryCities.find((candidate) => candidate.id === snapshot.supplyCityId);
	if (!city) return disconnectedReachability(scopedBuildings, requiredMaterialIds);

	const network = buildRailNetwork(city);
	const budget = createRailBudget(network);
	const attachCellsByBuildingId = new Map<string, readonly string[]>();
	for (const building of scopedBuildings) {
		attachCellsByBuildingId.set(building.id, getBuildingAttachCellKeys(network, building));
	}

	const outputsByMaterial = new Map<MaterialId, ReachabilityOutput[]>();
	for (const building of scopedBuildings) {
		const recipeId = getBuildingRecipeId(building);
		if (!recipeId) continue;
		for (const output of PRODUCTION_RECIPES[recipeId].outputs) {
			if (!requiredMaterialIds.has(output.materialId)) continue;
			const outputs = outputsByMaterial.get(output.materialId) ?? [];
			outputs.push({ building, materialId: output.materialId });
			outputsByMaterial.set(output.materialId, outputs);
		}
	}
	for (const outputs of outputsByMaterial.values()) {
		outputs.sort(
			(left, right) =>
				compareCodeUnitStrings(left.building.id, right.building.id) ||
				compareCodeUnitStrings(left.materialId, right.materialId)
		);
	}

	const context: ReachabilityContext = {
		network,
		budget,
		attachCellsByBuildingId,
		buildings: scopedBuildings,
		requiredMaterialIds,
		outputsByMaterial,
		sinksByMaterial: new Map(),
		memo: new Map(),
		visiting: new Set()
	};
	const usableBuildingIds = new Set<string>();
	const disconnectedBuildingIds = new Set<string>();
	const usableSinkBuildingIdsByMaterial: Partial<Record<MaterialId, readonly string[]>> = {};

	for (const requirement of requirements) {
		if (!requirement.producerRecipeId) continue;
		const outputs = context.outputsByMaterial.get(requirement.materialId) ?? [];
		for (const output of outputs) {
			if (isReachableProducer(context, output)) usableBuildingIds.add(output.building.id);
			else disconnectedBuildingIds.add(output.building.id);
		}
		usableSinkBuildingIdsByMaterial[requirement.materialId] = uniqueBuildingIds(
			getUsableSinksForMaterial(context, requirement.materialId)
		);
	}

	const reachableDemandByMaterial = computeReachableDemandByMaterial(context, requirements);

	return {
		usableBuildingIds,
		disconnectedBuildingIds: [...disconnectedBuildingIds].sort(compareCodeUnitStrings),
		usableSinkBuildingIdsByMaterial,
		reachableDemandByMaterial
	};
}

export const getRequiredChainReachability = buildRequiredChainReachability;
export const requiredChainReachability = buildRequiredChainReachability;

function assertNoRequiredChainCycle(requiredMaterialIds: ReadonlySet<MaterialId>): void {
	const visited = new Set<MaterialId>();
	const visiting = new Set<MaterialId>();

	const visit = (materialId: MaterialId): void => {
		if (visited.has(materialId)) return;
		if (visiting.has(materialId)) {
			throw new Error(`Cycle detected in required chain reachability at ${materialId}`);
		}
		visiting.add(materialId);
		const recipeId = MATERIAL_PRODUCER_RECIPES.get(materialId);
		const recipe = recipeId ? PRODUCTION_RECIPES[recipeId] : undefined;
		for (const input of recipe?.inputs ?? []) {
			if (requiredMaterialIds.has(input.materialId)) visit(input.materialId);
		}
		visiting.delete(materialId);
		visited.add(materialId);
	};

	for (const materialId of requiredMaterialIds) visit(materialId);
}

function getBuildingRecipeId(
	building: Pick<IndustrialBuilding, 'typeId'>
): ProductionRecipeId | null {
	for (const recipe of Object.values(PRODUCTION_RECIPES)) {
		if (buildingTypesForRecipe(recipe.id).some((type) => type.id === building.typeId)) {
			return recipe.id;
		}
	}
	return null;
}

function isReachableProducer(context: ReachabilityContext, output: ReachabilityOutput): boolean {
	const key = `${output.building.id}\u0000${output.materialId}`;
	const memoized = context.memo.get(key);
	if (memoized !== undefined) return memoized;
	if (context.visiting.has(key)) {
		throw new Error(`Cycle detected in required chain reachability at ${key}`);
	}
	context.visiting.add(key);

	const fromKeys = context.attachCellsByBuildingId.get(output.building.id) ?? [];
	let reachable = false;
	for (const sink of getUsableSinksForMaterial(context, output.materialId)) {
		const toKeys = context.attachCellsByBuildingId.get(sink.building.id) ?? [];
		if (findShippingPath(context.network, context.budget, fromKeys, toKeys)) {
			reachable = true;
			break;
		}
	}

	context.visiting.delete(key);
	context.memo.set(key, reachable);
	return reachable;
}

function getUsableSinksForMaterial(
	context: ReachabilityContext,
	materialId: MaterialId
): readonly ReachabilityOutput[] {
	const cached = context.sinksByMaterial.get(materialId);
	if (cached) return cached;

	// City inventory acts as a material-agnostic hub: pushSurplusViaRail can
	// push any recipe output to a reachable warehouse, and pullViaRail can
	// later supply a processor from that shared inventory through another
	// warehouse — even when the producer and consumer are on separate rail
	// islands with no direct path between them.
	const warehouses = context.buildings
		.filter((building) => building.typeId === 'warehouse')
		.map((building) => ({ building, materialId }));

	const material = MATERIALS[materialId];
	if (material?.kind === 'finished') {
		context.sinksByMaterial.set(materialId, warehouses);
		return warehouses;
	}

	const sinks: ReachabilityOutput[] = [...warehouses];
	for (const downstreamMaterial of context.requiredMaterialIds) {
		if (downstreamMaterial === materialId) continue;
		const recipeId = MATERIAL_PRODUCER_RECIPES.get(downstreamMaterial);
		if (!recipeId) continue;
		const recipe = PRODUCTION_RECIPES[recipeId];
		if (!recipe.inputs.some((input) => input.materialId === materialId)) continue;
		for (const candidate of context.outputsByMaterial.get(downstreamMaterial) ?? []) {
			if (isReachableProducer(context, candidate)) sinks.push(candidate);
		}
	}

	const unique = uniqueOutputs(sinks);
	context.sinksByMaterial.set(materialId, unique);
	return unique;
}

function uniqueOutputs(outputs: readonly ReachabilityOutput[]): ReachabilityOutput[] {
	const seen = new Set<string>();
	return [...outputs]
		.sort(
			(left, right) =>
				compareCodeUnitStrings(left.building.id, right.building.id) ||
				compareCodeUnitStrings(left.materialId, right.materialId)
		)
		.filter((output) => {
			const key = `${output.building.id}\u0000${output.materialId}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
}

function uniqueBuildingIds(outputs: readonly ReachabilityOutput[]): readonly string[] {
	return [...new Set(outputs.map((output) => output.building.id))].sort(compareCodeUnitStrings);
}

/**
 * Checks whether a building can reach any warehouse via rail. Used to
 * determine whether the city-inventory hub can bridge a producer and a
 * consumer on separate rail islands.
 */
function canReachAnyWarehouse(context: ReachabilityContext, building: IndustrialBuilding): boolean {
	const fromKeys = context.attachCellsByBuildingId.get(building.id) ?? [];
	if (fromKeys.length === 0) return false;
	for (const candidate of context.buildings) {
		if (candidate.typeId !== 'warehouse' || candidate.id === building.id) continue;
		const toKeys = context.attachCellsByBuildingId.get(candidate.id) ?? [];
		if (toKeys.length === 0) continue;
		if (findShippingPath(context.network, context.budget, fromKeys, toKeys)) {
			return true;
		}
	}
	return false;
}

/**
 * Checks whether there is a direct rail path from one building to another.
 */
function canBuildingReachBuilding(
	context: ReachabilityContext,
	from: IndustrialBuilding,
	to: IndustrialBuilding
): boolean {
	if (from.id === to.id) return false;
	const fromKeys = context.attachCellsByBuildingId.get(from.id) ?? [];
	const toKeys = context.attachCellsByBuildingId.get(to.id) ?? [];
	if (fromKeys.length === 0 || toKeys.length === 0) return false;
	return findShippingPath(context.network, context.budget, fromKeys, toKeys) !== null;
}

/**
 * Computes the reachable demand per material. A producer's usable capacity is
 * capped at the reachable demand — the portion of total demand from downstream
 * consumer branches that at least one producer can actually deliver to
 * (directly or via the city-inventory hub).
 *
 * For finished materials, the full demand is reachable if any producer can
 * reach a warehouse.
 *
 * For non-finished materials, each downstream branch is reachable if at least
 * one producer can reach the branch's processor directly, or both the producer
 * and the processor can reach a warehouse (hub bridge).
 */
function computeReachableDemandByMaterial(
	context: ReachabilityContext,
	requirements: readonly SupplyMaterialRequirement[]
): Partial<Record<MaterialId, number>> {
	const result: Partial<Record<MaterialId, number>> = {};
	const requirementByMaterial = new Map(requirements.map((r) => [r.materialId, r]));

	for (const requirement of requirements) {
		if (requirement.requiredPerDay <= 0) {
			result[requirement.materialId] = 0;
			continue;
		}

		const producers = context.outputsByMaterial.get(requirement.materialId) ?? [];
		if (producers.length === 0) {
			result[requirement.materialId] = 0;
			continue;
		}

		const material = MATERIALS[requirement.materialId];

		// Finished materials: the sink is the warehouse (retail demand).
		// If any usable producer can reach a warehouse, the full demand is
		// reachable.
		if (material?.kind === 'finished') {
			const anyUsableProducerCanHub = producers.some(
				(output) =>
					context.memo.get(`${output.building.id}\u0000${output.materialId}`) === true &&
					canReachAnyWarehouse(context, output.building)
			);
			result[requirement.materialId] = anyUsableProducerCanHub ? requirement.requiredPerDay : 0;
			continue;
		}

		// Non-finished materials: check which downstream branches are reachable.
		const anyProducerCanHub = producers.some((output) =>
			canReachAnyWarehouse(context, output.building)
		);

		let reachableDemand = 0;
		for (const downstreamMaterial of context.requiredMaterialIds) {
			if (downstreamMaterial === requirement.materialId) continue;
			const recipeId = MATERIAL_PRODUCER_RECIPES.get(downstreamMaterial);
			if (!recipeId) continue;
			const recipe = PRODUCTION_RECIPES[recipeId];
			const input = recipe.inputs.find((i) => i.materialId === requirement.materialId);
			if (!input) continue;

			const downstreamReq = requirementByMaterial.get(downstreamMaterial);
			if (!downstreamReq || downstreamReq.requiredPerDay <= 0) continue;

			const output = recipe.outputs.find((o) => o.materialId === downstreamMaterial);
			if (!output || output.quantity <= 0) continue;

			const demandFromBranch = (downstreamReq.requiredPerDay * input.quantity) / output.quantity;

			// A branch is reachable if at least one processor of the downstream
			// material is usable AND at least one producer of this material can
			// deliver to it (directly or via the city-inventory hub).
			const branchProcessors = context.outputsByMaterial.get(downstreamMaterial) ?? [];
			const branchReachable = branchProcessors.some((processor) => {
				const processorUsable =
					context.memo.get(`${processor.building.id}\u0000${processor.materialId}`) === true;
				if (!processorUsable) return false;
				return producers.some(
					(producer) =>
						canBuildingReachBuilding(context, producer.building, processor.building) ||
						(anyProducerCanHub && canReachAnyWarehouse(context, processor.building))
				);
			});

			if (branchReachable) {
				reachableDemand += demandFromBranch;
			}
		}

		result[requirement.materialId] = reachableDemand;
	}

	return result;
}

function disconnectedReachability(
	buildings: readonly IndustrialBuilding[],
	requiredMaterialIds: ReadonlySet<MaterialId>
): RequiredChainReachability {
	const disconnected = new Set<string>();
	for (const building of buildings) {
		const recipeId = getBuildingRecipeId(building);
		if (!recipeId) continue;
		if (
			PRODUCTION_RECIPES[recipeId].outputs.some((output) =>
				requiredMaterialIds.has(output.materialId)
			)
		) {
			disconnected.add(building.id);
		}
	}
	return {
		usableBuildingIds: new Set(),
		disconnectedBuildingIds: [...disconnected].sort(compareCodeUnitStrings),
		usableSinkBuildingIdsByMaterial: {},
		reachableDemandByMaterial: {}
	};
}

/** Project a ready snapshot using only rail-usable local production capacity. */
export function projectSupplySnapshot(snapshot: SupplyPlannerSnapshot): SupplyPlannerProjection {
	const requirements = buildSupplyMaterialRequirements(snapshot);
	const usableIds = new Set(snapshot.usableBuildingIds);
	const materials: SupplyMaterialProjection[] = requirements.map((requirement) => {
		const installed = requirement.producerRecipeId
			? buildingsForRecipe(snapshot.buildings, requirement.producerRecipeId)
			: [];
		const usable = installed.filter((building) => usableIds.has(building.id));
		const buildingLevels = installed
			.map((building) => building.level)
			.sort((left, right) => left - right);
		const inventoryUnits = Math.max(0, snapshot.inventory[requirement.materialId] ?? 0);
		const installedCapacityPerDay = getMaterialOutputCapacityPerDay(
			installed,
			requirement.materialId
		);
		const rawUsableCapacityPerDay = getMaterialOutputCapacityPerDay(usable, requirement.materialId);
		const reachableDemand = snapshot.reachableDemandByMaterial?.[requirement.materialId];
		const usableCapacityPerDay =
			reachableDemand !== undefined
				? Math.min(rawUsableCapacityPerDay, reachableDemand)
				: rawUsableCapacityPerDay;
		const stockoutDay = projectedStockoutDay(
			requirement.requiredPerDay,
			usableCapacityPerDay,
			inventoryUnits
		);

		return {
			...requirement,
			buildingCount: installed.length,
			maxBuildingLevel: buildingLevels.at(-1) ?? 0,
			buildingLevels,
			inventoryUnits,
			daysOfCover:
				requirement.requiredPerDay > 0 ? inventoryUnits / requirement.requiredPerDay : null,
			projectedStockoutDay: stockoutDay,
			installedCapacityPerDay,
			usableCapacityPerDay,
			sevenDay: horizonProjection(
				7,
				requirement.requiredPerDay,
				inventoryUnits,
				usableCapacityPerDay,
				stockoutDay
			),
			thirtyDay: horizonProjection(
				30,
				requirement.requiredPerDay,
				inventoryUnits,
				usableCapacityPerDay,
				stockoutDay
			)
		};
	});

	const warehouse = warehouseEvidence(snapshot);
	const limitations: SupplyPlannerLimitation[] = [
		{ kind: 'rail-capacity-not-modeled' },
		{ kind: 'store-sales-capacity-not-modeled' }
	];
	if (snapshot.activeOutboundRouteIds.length > 0) {
		limitations.unshift({
			kind: 'active-logistics-not-modeled',
			routeIds: snapshot.activeOutboundRouteIds
		});
	}

	return {
		snapshot,
		materials,
		warehouse,
		bottleneck: primaryBottleneck(snapshot, materials, warehouse),
		limitations
	};
}

export const projectSupplyPlan = projectSupplySnapshot;

function horizonProjection(
	horizonDays: SupplyPlannerHorizonDays,
	requiredPerDay: number,
	startingInventoryUnits: number,
	usableCapacityPerDay: number,
	stockoutDay: number | null
): SupplyMaterialHorizonProjection {
	const requiredUnits = requiredPerDay * horizonDays;
	const localAvailableUnits = startingInventoryUnits + usableCapacityPerDay * horizonDays;
	return {
		horizonDays,
		requiredUnits,
		startingInventoryUnits,
		localAvailableUnits,
		importRequiredUnits: Math.max(0, requiredUnits - localAvailableUnits),
		endingInventoryUnits: Math.max(0, localAvailableUnits - requiredUnits),
		daysOfCover: requiredPerDay > 0 ? startingInventoryUnits / requiredPerDay : null,
		projectedStockoutDay: stockoutDay
	};
}

function projectedStockoutDay(
	requiredPerDay: number,
	usableCapacityPerDay: number,
	startingInventoryUnits: number
): number | null {
	const netDailyDraw = requiredPerDay - usableCapacityPerDay;
	return requiredPerDay > 0 && netDailyDraw > 0 ? startingInventoryUnits / netDailyDraw : null;
}

function warehouseEvidence(snapshot: SupplyPlannerSnapshot): SupplyWarehouseEvidence {
	return {
		capacity: snapshot.warehouseCapacity,
		used: snapshot.warehouseUsed,
		freeCapacity: Math.max(0, snapshot.warehouseCapacity - snapshot.warehouseUsed),
		overflowUnits: Math.max(0, snapshot.warehouseUsed - snapshot.warehouseCapacity)
	};
}

function primaryBottleneck(
	snapshot: SupplyPlannerSnapshot,
	materials: readonly SupplyMaterialProjection[],
	warehouse: SupplyWarehouseEvidence
): SupplyBottleneck {
	if (snapshot.demandPerDay <= 0) return { kind: 'none' };

	const missing = [...materials]
		.filter(
			(material) =>
				material.requiredPerDay > 0 &&
				material.producerRecipeId !== null &&
				material.buildingCount === 0
		)
		.sort(
			(left, right) =>
				right.chainDepth - left.chainDepth ||
				compareCodeUnitStrings(left.materialId, right.materialId)
		)[0];
	if (missing) {
		return {
			kind: 'missing-producer',
			materialId: missing.materialId,
			chainDepth: missing.chainDepth
		};
	}

	if (warehouse.capacity <= 0 || warehouse.overflowUnits > 0) {
		return {
			kind: 'warehouse-capacity',
			overflowUnits: warehouse.overflowUnits,
			freeCapacity: warehouse.freeCapacity
		};
	}

	const disconnected = new Set(snapshot.disconnectedBuildingIds);
	const disconnectedCandidates: Array<{ material: SupplyMaterialProjection; buildingId: string }> =
		[];
	for (const material of materials) {
		if (material.requiredPerDay <= 0) continue;
		for (const building of buildingsForMaterial(snapshot, material.materialId)) {
			if (disconnected.has(building.id)) {
				disconnectedCandidates.push({ material, buildingId: building.id });
			}
		}
	}
	const disconnectedCandidate = disconnectedCandidates.sort(
		(left, right) =>
			right.material.chainDepth - left.material.chainDepth ||
			compareCodeUnitStrings(left.material.materialId, right.material.materialId) ||
			compareCodeUnitStrings(left.buildingId, right.buildingId)
	)[0];
	if (disconnectedCandidate) {
		return {
			kind: 'rail-disconnected',
			buildingId: disconnectedCandidate.buildingId,
			materialId: disconnectedCandidate.material.materialId
		};
	}

	const capacityDeficit = [...materials]
		.filter(
			(material) =>
				material.requiredPerDay > 0 &&
				material.producerRecipeId !== null &&
				material.usableCapacityPerDay < material.requiredPerDay
		)
		.sort(
			(left, right) =>
				normalizedDeficit(right) - normalizedDeficit(left) ||
				compareCodeUnitStrings(left.materialId, right.materialId)
		)[0];
	if (capacityDeficit) {
		return {
			kind: 'production-capacity',
			materialId: capacityDeficit.materialId,
			deficitPerDay: capacityDeficit.requiredPerDay - capacityDeficit.usableCapacityPerDay
		};
	}

	const stockout = [...materials]
		.filter((material) => material.thirtyDay.projectedStockoutDay !== null)
		.sort(
			(left, right) =>
				(left.thirtyDay.projectedStockoutDay ?? Number.POSITIVE_INFINITY) -
					(right.thirtyDay.projectedStockoutDay ?? Number.POSITIVE_INFINITY) ||
				compareCodeUnitStrings(left.materialId, right.materialId)
		)[0];
	if (
		stockout?.thirtyDay.projectedStockoutDay !== null &&
		stockout?.thirtyDay.projectedStockoutDay !== undefined
	) {
		return {
			kind: 'inventory-cover',
			materialId: stockout.materialId,
			stockoutDay: stockout.thirtyDay.projectedStockoutDay
		};
	}

	const importReliance = [...materials]
		.filter((material) => material.thirtyDay.importRequiredUnits > 0)
		.sort(
			(left, right) =>
				right.thirtyDay.importRequiredUnits - left.thirtyDay.importRequiredUnits ||
				compareCodeUnitStrings(left.materialId, right.materialId)
		)[0];
	if (importReliance) {
		return {
			kind: 'import-reliance',
			materialId: importReliance.materialId,
			importedUnits30: importReliance.thirtyDay.importRequiredUnits
		};
	}

	return { kind: 'none' };
}

function normalizedDeficit(material: SupplyMaterialProjection): number {
	return material.requiredPerDay > 0
		? Math.max(0, material.requiredPerDay - material.usableCapacityPerDay) / material.requiredPerDay
		: 0;
}

function buildingsForMaterial(
	snapshot: SupplyPlannerSnapshot,
	materialId: MaterialId
): SupplyPlannerBuildingSnapshot[] {
	const recipeId = MATERIAL_PRODUCER_RECIPES.get(materialId);
	return recipeId ? buildingsForRecipe(snapshot.buildings, recipeId) : [];
}

function buildDemandContributor(
	game: GameState,
	city: City,
	categoryId: string
): SupplyDemandContributor | null {
	const stores = game.stores
		.filter(
			(store) =>
				store.cityId === city.id &&
				store.products.some((product) => product.categoryId === categoryId)
		)
		.sort((left, right) => compareCodeUnitStrings(left.id, right.id));
	if (stores.length === 0) return null;

	const potentialDemandPerDay = buildCityDemandPools(game, city)[categoryId] ?? 0;
	let targetUnits = 0;
	let weightedImportCost = 0;
	const fallbackImportCosts: number[] = [];

	for (const store of stores) {
		const product = store.products.find((item) => item.categoryId === categoryId);
		if (!product) continue;
		const category = getSupportedStoreChainCategories(store).find((item) => item.id === categoryId);
		if (!category) continue;
		targetUnits += product.targetStock;
		weightedImportCost += product.targetStock * category.importCost;
		fallbackImportCosts.push(category.importCost);
	}
	if (fallbackImportCosts.length === 0) return null;

	const replenishmentCeilingPerDay = targetUnits / REPLENISHMENT_INTERVAL_DAYS;
	const retailImportCostPerUnit =
		targetUnits > 0
			? weightedImportCost / targetUnits
			: fallbackImportCosts.reduce((sum, value) => sum + value, 0) / fallbackImportCosts.length;

	return {
		retailCityId: city.id as WorldCityId,
		potentialDemandPerDay,
		replenishmentCeilingPerDay,
		effectiveDemandPerDay: Math.min(potentialDemandPerDay, replenishmentCeilingPerDay),
		retailImportCostPerUnit
	};
}

function getClaimantCities(game: GameState, supplyCityId: WorldCityId): City[] {
	const claimantIds = new Set(
		game.retailSupplyAssignments
			.filter((assignment) => assignment.supplyCityId === supplyCityId)
			.map((assignment) => assignment.retailCityId)
	);

	return game.cities
		.filter((city) => claimantIds.has(city.id as WorldCityId))
		.sort((left, right) => compareRetailCityIds(left.id, right.id));
}

function findAvailableRetailCity(game: GameState, cityId: string): City | null {
	const city = game.cities.find((candidate) => candidate.id === cityId);
	if (!city) return null;

	const definition = getWorldCityDefinition(cityId);
	if (definition && definition.kind !== 'retail') return null;
	if (!game.world.openedCityIds.includes(cityId as WorldCityId)) return null;
	return city;
}

function compareRetailCityIds(left: string, right: string): number {
	const leftIndex = WORLD_CITY_CATALOG.findIndex((city) => city.id === left);
	const rightIndex = WORLD_CITY_CATALOG.findIndex((city) => city.id === right);
	if (leftIndex >= 0 && rightIndex >= 0) {
		return compareWorldCityIds(left as WorldCityId, right as WorldCityId);
	}
	if (leftIndex >= 0) return -1;
	if (rightIndex >= 0) return 1;
	return compareCodeUnitStrings(left, right);
}

function isValidRequest(request: SupplyPlannerRequest): boolean {
	return (
		typeof request === 'object' &&
		request !== null &&
		typeof request.retailCityId === 'string' &&
		request.retailCityId.length > 0 &&
		typeof request.categoryId === 'string' &&
		request.categoryId.length > 0
	);
}

function compareCodeUnitStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}
