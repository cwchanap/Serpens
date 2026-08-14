import { compareWorldCityIds, getCityInventoryStats } from './cityInventory';
import { MATERIALS, PRODUCTION_RECIPES } from './industry';
import {
	buildingTypesForRecipe,
	buildingsForRecipe,
	getMaterialOutputCapacityPerDay,
	getRecipeThroughputUnits,
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
	/**
	 * Per-producer reachable demand caps, keyed by
	 * `${buildingId}\u0000${materialId}`. Each value is the demand that
	 * specific producer can actually serve (directly or via the city-inventory
	 * hub). This prevents crediting one producer's excess capacity toward a
	 * branch only another producer can reach.
	 */
	reachableDemandByBuildingAndMaterial: Partial<Record<string, number>>;
	/**
	 * Per-producer reachable branch breakdown, keyed by
	 * `${buildingId}\u0000${materialId}`. Each value maps a downstream
	 * branch materialId to the demand this specific producer can serve for
	 * that branch. Used for greedy per-branch capacity allocation so that
	 * multiple producers overlapping on one branch don't collectively
	 * exceed that branch's demand.
	 */
	reachableBranchesByBuildingAndMaterial: Partial<Record<string, ReadonlyMap<MaterialId, number>>>;
	/**
	 * Per-producer reachable processor instances, keyed by
	 * `${buildingId}\u0000${materialId}`. Each entry describes a specific
	 * downstream processor building the producer can reach via rail (direct
	 * or warehouse-hub), the branch (downstream material) it feeds, and the
	 * processor's per-day input capacity for this upstream material. This
	 * extends the flow graph one layer beyond the branch-level model so
	 * that multiple processor instances producing the same downstream
	 * material are distinguished — a producer that can only reach one of
	 * two flour mills is capped by that mill's input capacity, not the full
	 * branch demand.
	 */
	reachableProcessorsByBuildingAndMaterial: Partial<
		Record<string, readonly ReachableProcessorEntry[]>
	>;
	/**
	 * Total per-day input capacity of usable downstream processors that can
	 * reach a warehouse, keyed by the upstream raw/intermediate material they
	 * consume. City inventory is a warehouse source: a processor can only
	 * draw it via `pullViaRail` when it has a rail path to a warehouse. This
	 * caps how much of a material's city inventory is actually accessible,
	 * and is zero (key absent or 0) when no usable warehouse-connected
	 * consumer exists — so stranded inventory is not credited as local
	 * supply. Finished materials are excluded (they keep their existing
	 * warehouse-sink inventory treatment).
	 */
	warehouseConnectedConsumerCapacityByMaterial: Partial<Record<MaterialId, number>>;
	/**
	 * Per-processor entries for every usable downstream processor that can
	 * reach a warehouse, keyed by the upstream raw/intermediate material they
	 * consume. Built independently of producer reachability: a
	 * warehouse-connected processor can pull city inventory via `pullViaRail`
	 * whether or not any local producer can reach it, so the inventory source
	 * in the horizon flow must be able to route through these processors even
	 * when no producer edge touches them. Each entry carries its branch
	 * demand (`branchDemand`) because such a processor may feed a branch no
	 * producer reaches, whose demand is therefore absent from the
	 * per-producer `reachableBranchesByBuildingAndMaterial` map.
	 */
	warehouseConnectedProcessorsByMaterial: Partial<
		Record<MaterialId, readonly ReachableProcessorEntry[]>
	>;
}

export interface ReachableProcessorEntry {
	processorId: string;
	branchId: MaterialId;
	/**
	 * Per-day input capacity of this processor for the upstream material
	 * (how much of the upstream material the processor can consume per
	 * day, derived from its throughput and recipe input ratio).
	 */
	inputCapacity: number;
	/**
	 * Whether this processor building can reach a warehouse via rail.
	 * City inventory lives in warehouses and a processor can only draw it
	 * through `pullViaRail` when a rail path exists from the processor to a
	 * warehouse, so inventory allocation in the projection is gated on this
	 * flag.
	 */
	canReachWarehouse: boolean;
	/**
	 * Daily demand of the downstream branch this processor feeds. Only
	 * populated for entries in `warehouseConnectedProcessorsByMaterial`,
	 * where the processor may feed a branch no local producer reaches and
	 * therefore whose branch demand is not otherwise present in the
	 * per-producer `reachableBranchesByBuildingAndMaterial` map. Used by
	 * `allocateCapacityByBranch` to register the branch's demand when the
	 * processor is added to the flow graph independently of producer
	 * reachability.
	 */
	branchDemand?: number;
}

export interface RequiredChainReachability {
	usableBuildingIds: ReadonlySet<string>;
	disconnectedBuildingIds: readonly string[];
	usableSinkBuildingIdsByMaterial: Partial<Record<MaterialId, readonly string[]>>;
	reachableDemandByMaterial: Partial<Record<MaterialId, number>>;
	reachableDemandByBuildingAndMaterial: Partial<Record<string, number>>;
	reachableBranchesByBuildingAndMaterial: Partial<Record<string, ReadonlyMap<MaterialId, number>>>;
	reachableProcessorsByBuildingAndMaterial: Partial<
		Record<string, readonly ReachableProcessorEntry[]>
	>;
	warehouseConnectedConsumerCapacityByMaterial: Partial<Record<MaterialId, number>>;
	warehouseConnectedProcessorsByMaterial: Partial<
		Record<MaterialId, readonly ReachableProcessorEntry[]>
	>;
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
		reachableDemandByMaterial: reachability.reachableDemandByMaterial,
		reachableDemandByBuildingAndMaterial: reachability.reachableDemandByBuildingAndMaterial,
		reachableBranchesByBuildingAndMaterial: reachability.reachableBranchesByBuildingAndMaterial,
		reachableProcessorsByBuildingAndMaterial: reachability.reachableProcessorsByBuildingAndMaterial,
		warehouseConnectedConsumerCapacityByMaterial:
			reachability.warehouseConnectedConsumerCapacityByMaterial,
		warehouseConnectedProcessorsByMaterial: reachability.warehouseConnectedProcessorsByMaterial
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
	canReachWarehouseCache: Map<string, boolean>;
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
		visiting: new Set(),
		canReachWarehouseCache: new Map()
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

	const reachableDemand = computeReachableDemandByMaterial(context, requirements);

	return {
		usableBuildingIds,
		disconnectedBuildingIds: [...disconnectedBuildingIds].sort(compareCodeUnitStrings),
		usableSinkBuildingIdsByMaterial,
		reachableDemandByMaterial: reachableDemand.byMaterial,
		reachableDemandByBuildingAndMaterial: reachableDemand.byBuildingAndMaterial,
		reachableBranchesByBuildingAndMaterial: reachableDemand.byBranchesByBuildingAndMaterial,
		reachableProcessorsByBuildingAndMaterial: reachableDemand.byProcessorsByBuildingAndMaterial,
		warehouseConnectedConsumerCapacityByMaterial:
			reachableDemand.byWarehouseConnectedConsumerCapacity,
		warehouseConnectedProcessorsByMaterial: reachableDemand.byWarehouseConnectedProcessors
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

	// For non-finished materials, a warehouse is a valid sink only when at
	// least one usable downstream consumer can also reach the warehouse hub.
	// The city-inventory hub bridges producer → warehouse → consumer, so both
	// sides need rail access to a warehouse; a producer that can only push to
	// a warehouse with no accessible consumer does not actually have a usable
	// sink.
	const sinks: ReachabilityOutput[] = [];
	let hasUsableDownstreamHubConsumer = false;
	for (const downstreamMaterial of context.requiredMaterialIds) {
		if (downstreamMaterial === materialId) continue;
		const recipeId = MATERIAL_PRODUCER_RECIPES.get(downstreamMaterial);
		if (!recipeId) continue;
		const recipe = PRODUCTION_RECIPES[recipeId];
		if (!recipe.inputs.some((input) => input.materialId === materialId)) continue;
		for (const candidate of context.outputsByMaterial.get(downstreamMaterial) ?? []) {
			if (isReachableProducer(context, candidate)) {
				sinks.push(candidate);
				if (canReachAnyWarehouse(context, candidate.building)) {
					hasUsableDownstreamHubConsumer = true;
				}
			}
		}
	}
	if (hasUsableDownstreamHubConsumer) {
		sinks.push(...warehouses);
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
	const cached = context.canReachWarehouseCache.get(building.id);
	if (cached !== undefined) return cached;
	const fromKeys = context.attachCellsByBuildingId.get(building.id) ?? [];
	if (fromKeys.length === 0) {
		context.canReachWarehouseCache.set(building.id, false);
		return false;
	}
	for (const candidate of context.buildings) {
		if (candidate.typeId !== 'warehouse' || candidate.id === building.id) continue;
		const toKeys = context.attachCellsByBuildingId.get(candidate.id) ?? [];
		if (toKeys.length === 0) continue;
		if (findShippingPath(context.network, context.budget, fromKeys, toKeys)) {
			context.canReachWarehouseCache.set(building.id, true);
			return true;
		}
	}
	context.canReachWarehouseCache.set(building.id, false);
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
 * Computes the reachable demand per material and per producer. A producer's
 * usable capacity is capped at its own reachable demand — the portion of
 * total demand from downstream consumer branches that this specific producer
 * can actually deliver to (directly or via the city-inventory hub).
 *
 * For finished materials, the full demand is reachable if the producer can
 * reach a warehouse.
 *
 * For non-finished materials, each downstream branch is reachable by a
 * producer if that producer can reach the branch's processor directly, or
 * both the producer and the processor can reach a warehouse (hub bridge).
 * Per-producer caps prevent crediting one producer's excess capacity toward
 * a branch only another producer can reach.
 *
 * Processor-instance awareness: when multiple processor instances produce
 * the same downstream material (branch), each producer's reachable demand
 * for that branch is capped by the input capacity of the specific processor
 * instances it can reach — not the full branch demand. A producer that can
 * only reach one of two flour mills is capped by that mill's input capacity.
 */
/**
 * Sums the per-day input capacity of usable warehouse-connected consumers of
 * a material, and records each such processor as an entry. City inventory
 * lives in warehouses, so a processor can only draw it when it can reach a
 * warehouse; this caps how much of the material's starting inventory the
 * projection may credit as accessible local supply.
 *
 * This is computed independently of whether a local producer for the
 * material exists — a missing producer does not strand warehouse-accessible
 * inventory, since a warehouse-connected downstream processor can still pull
 * it via rail. The per-processor entries feed
 * `warehouseConnectedProcessorsByMaterial` so the horizon flow's inventory
 * source can route through a warehouse-connected processor that no local
 * producer reaches (the producer-reachable processor set alone would omit
 * it, stranding inventory the runtime would otherwise let it pull).
 */
function computeWarehouseConnectedConsumerCapacity(
	context: ReachabilityContext,
	materialId: MaterialId,
	requirementByMaterial: Map<MaterialId, SupplyMaterialRequirement>
): { totalCapacity: number; entries: ReachableProcessorEntry[] } {
	const whConsumerSeen = new Set<string>();
	let whConsumerCapacity = 0;
	const entries: ReachableProcessorEntry[] = [];
	for (const downstreamMaterial of context.requiredMaterialIds) {
		if (downstreamMaterial === materialId) continue;
		const downstreamRecipeId = MATERIAL_PRODUCER_RECIPES.get(downstreamMaterial);
		if (!downstreamRecipeId) continue;
		const downstreamRecipe = PRODUCTION_RECIPES[downstreamRecipeId];
		const downstreamInput = downstreamRecipe.inputs.find((i) => i.materialId === materialId);
		if (!downstreamInput) continue;
		const downstreamReq = requirementByMaterial.get(downstreamMaterial);
		const output = downstreamRecipe.outputs.find((o) => o.materialId === downstreamMaterial);
		const branchDemand =
			downstreamReq && output && output.quantity > 0
				? (downstreamReq.requiredPerDay * downstreamInput.quantity) / output.quantity
				: 0;
		for (const processor of context.outputsByMaterial.get(downstreamMaterial) ?? []) {
			const processorUsable =
				context.memo.get(`${processor.building.id}\u0000${processor.materialId}`) === true;
			if (!processorUsable) continue;
			if (!canReachAnyWarehouse(context, processor.building)) continue;
			if (whConsumerSeen.has(processor.building.id)) continue;
			whConsumerSeen.add(processor.building.id);
			const throughput = getRecipeThroughputUnits([processor.building], downstreamRecipeId);
			const inputCapacity = downstreamInput.quantity * throughput;
			whConsumerCapacity += inputCapacity;
			entries.push({
				processorId: processor.building.id,
				branchId: downstreamMaterial,
				inputCapacity,
				canReachWarehouse: true,
				branchDemand
			});
		}
	}
	return { totalCapacity: whConsumerCapacity, entries };
}

function computeReachableDemandByMaterial(
	context: ReachabilityContext,
	requirements: readonly SupplyMaterialRequirement[]
): {
	byMaterial: Partial<Record<MaterialId, number>>;
	byBuildingAndMaterial: Partial<Record<string, number>>;
	byBranchesByBuildingAndMaterial: Partial<Record<string, ReadonlyMap<MaterialId, number>>>;
	byProcessorsByBuildingAndMaterial: Partial<Record<string, ReachableProcessorEntry[]>>;
	byWarehouseConnectedConsumerCapacity: Partial<Record<MaterialId, number>>;
	byWarehouseConnectedProcessors: Partial<Record<MaterialId, ReachableProcessorEntry[]>>;
} {
	const byMaterial: Partial<Record<MaterialId, number>> = {};
	const byBuildingAndMaterial: Partial<Record<string, number>> = {};
	const byBranchesByBuildingAndMaterial: Partial<Record<string, Map<MaterialId, number>>> = {};
	const byProcessorsByBuildingAndMaterial: Partial<Record<string, ReachableProcessorEntry[]>> = {};
	const byWarehouseConnectedConsumerCapacity: Partial<Record<MaterialId, number>> = {};
	const byWarehouseConnectedProcessors: Partial<Record<MaterialId, ReachableProcessorEntry[]>> = {};
	const requirementByMaterial = new Map(requirements.map((r) => [r.materialId, r]));

	for (const requirement of requirements) {
		if (requirement.requiredPerDay <= 0) {
			byMaterial[requirement.materialId] = 0;
			continue;
		}

		const material = MATERIALS[requirement.materialId];
		// Warehouse-connected consumer capacity must be derived independently
		// of producer presence. A missing producer does not strand
		// warehouse-accessible inventory — a warehouse-connected downstream
		// processor can still pull it via rail. Computing this before the
		// producers.length === 0 early return ensures the projection credits
		// accessible inventory even when the local producer is absent. The
		// per-processor entries are recorded alongside the aggregate capacity
		// so the horizon flow can route inventory through a
		// warehouse-connected processor that no local producer reaches.
		if (material?.kind !== 'finished' && requirement.producerRecipeId !== null) {
			const wh = computeWarehouseConnectedConsumerCapacity(
				context,
				requirement.materialId,
				requirementByMaterial
			);
			byWarehouseConnectedConsumerCapacity[requirement.materialId] = wh.totalCapacity;
			byWarehouseConnectedProcessors[requirement.materialId] = wh.entries;
		}

		const producers = context.outputsByMaterial.get(requirement.materialId) ?? [];
		if (producers.length === 0) {
			byMaterial[requirement.materialId] = 0;
			continue;
		}

		const producerKey = (buildingId: string) => `${buildingId}\u0000${requirement.materialId}`;

		if (material?.kind === 'finished') {
			let anyUsableProducerCanHub = false;
			for (const output of producers) {
				const usable = context.memo.get(producerKey(output.building.id)) === true;
				const canHub = canReachAnyWarehouse(context, output.building);
				if (usable && canHub) {
					anyUsableProducerCanHub = true;
					byBuildingAndMaterial[producerKey(output.building.id)] = requirement.requiredPerDay;
				} else {
					byBuildingAndMaterial[producerKey(output.building.id)] = 0;
				}
			}
			byMaterial[requirement.materialId] = anyUsableProducerCanHub ? requirement.requiredPerDay : 0;
			continue;
		}

		// Non-finished materials: compute per-producer reachable demand by
		// checking which processor instances each specific producer can
		// reach. The branch-level fields (reachableDemandByMaterial,
		// reachableDemandByBuildingAndMaterial,
		// reachableBranchesByBuildingAndMaterial) capture rail reachability
		// only — they are NOT capped by processor input capacity, so the
		// reachabilityGap bottleneck check can distinguish a rail topology
		// deficit from a production-capacity shortage. The per-processor
		// data (reachableProcessorsByBuildingAndMaterial) feeds the 3-layer
		// max-flow which does cap by processor input capacity.
		let aggregateReachableDemand = 0;
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

			const branchProcessors = context.outputsByMaterial.get(downstreamMaterial) ?? [];

			// For each processor, compute its input capacity for this
			// upstream material (how much it can consume per day).
			const processorInputCap = (processor: ReachabilityOutput): number => {
				const throughput = getRecipeThroughputUnits([processor.building], recipeId);
				return input.quantity * throughput;
			};

			let branchReachableByAny = false;
			for (const producer of producers) {
				// Find the specific processors this producer can reach.
				const reachableProcessors = branchProcessors.filter((processor) => {
					const processorUsable =
						context.memo.get(`${processor.building.id}\u0000${processor.materialId}`) === true;
					if (!processorUsable) return false;
					return (
						canBuildingReachBuilding(context, producer.building, processor.building) ||
						(canReachAnyWarehouse(context, producer.building) &&
							canReachAnyWarehouse(context, processor.building))
					);
				});
				if (reachableProcessors.length === 0) continue;

				branchReachableByAny = true;
				const key = producerKey(producer.building.id);
				byBuildingAndMaterial[key] = (byBuildingAndMaterial[key] ?? 0) + demandFromBranch;
				let branches = byBranchesByBuildingAndMaterial[key];
				if (!branches) {
					branches = new Map<MaterialId, number>();
					byBranchesByBuildingAndMaterial[key] = branches;
				}
				branches.set(downstreamMaterial, demandFromBranch);

				let processors = byProcessorsByBuildingAndMaterial[key];
				if (!processors) {
					processors = [];
					byProcessorsByBuildingAndMaterial[key] = processors;
				}
				for (const p of reachableProcessors) {
					processors.push({
						processorId: p.building.id,
						branchId: downstreamMaterial,
						inputCapacity: processorInputCap(p),
						canReachWarehouse: canReachAnyWarehouse(context, p.building)
					});
				}
			}
			if (branchReachableByAny) {
				aggregateReachableDemand += demandFromBranch;
			}
		}

		// Ensure all producers have an entry (default 0 if no branches reached).
		for (const producer of producers) {
			const key = producerKey(producer.building.id);
			if (byBuildingAndMaterial[key] === undefined) {
				byBuildingAndMaterial[key] = 0;
			}
		}

		byMaterial[requirement.materialId] = aggregateReachableDemand;
	}

	return {
		byMaterial,
		byBuildingAndMaterial,
		byBranchesByBuildingAndMaterial,
		byProcessorsByBuildingAndMaterial,
		byWarehouseConnectedConsumerCapacity,
		byWarehouseConnectedProcessors
	};
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
		reachableDemandByMaterial: {},
		reachableDemandByBuildingAndMaterial: {},
		reachableBranchesByBuildingAndMaterial: {},
		reachableProcessorsByBuildingAndMaterial: {},
		warehouseConnectedConsumerCapacityByMaterial: {},
		warehouseConnectedProcessorsByMaterial: {}
	};
}

/**
 * Per-producer cap + aggregate clamp. This is the original capacity model:
 * each producer's capacity is capped at its own reachable demand, the
 * capped values are summed, and the result is clamped to the aggregate
 * reachable demand. Correct for finished materials (single warehouse sink)
 * and used as a fallback when per-branch reachability data is unavailable.
 */
function perProducerCappedCapacity(
	usable: readonly SupplyPlannerBuildingSnapshot[],
	materialId: MaterialId,
	snapshot: SupplyPlannerSnapshot
): number {
	let total = 0;
	for (const building of usable) {
		const buildingCapacity = getMaterialOutputCapacityPerDay([building], materialId);
		const cap =
			snapshot.reachableDemandByBuildingAndMaterial?.[`${building.id}\u0000${materialId}`];
		total += cap !== undefined ? Math.min(buildingCapacity, cap) : buildingCapacity;
	}
	const aggregateReachable = snapshot.reachableDemandByMaterial[materialId];
	if (aggregateReachable !== undefined) {
		total = Math.min(total, aggregateReachable);
	}
	return total;
}

/**
 * Bipartite max-flow capacity allocation for non-finished materials.
 *
 * Producer→branch allocation is modelled as a max-flow problem: source →
 * producers (capacity = daily output), producers → branches (∞ if the
 * producer can reach the branch), branches → sink (capacity = branch
 * demand). The max flow is the maximum total usable capacity given
 * reachability constraints and is optimal — unlike a greedy heuristic
 * which can undercount when a shared producer is consumed by the
 * first-sorted branch before a branch-specialist gets priority.
 *
 * This producer→branch allocation is separate from the explicitly
 * excluded rail-cell throughput max-flow (shared-cell rail capacity
 * remains a planner limitation).
 */
/**
 * Detailed result of the per-branch capacity allocation. Exposes
 * per-producer and per-branch flow so the bottleneck classifier can
 * distinguish a connectivity-caused deficit (a producer has residual
 * capacity but cannot reach an unsatisfied branch) from a genuine
 * installed-capacity shortage.
 */
interface BranchAllocationResult {
	totalFlow: number;
	producerIds: string[];
	producerCaps: number[];
	producerFlows: number[];
	branchIds: MaterialId[];
	branchDemands: number[];
	branchFlows: number[];
	hasProcessorData: boolean;
	processorIds: string[];
	processorCaps: number[];
	processorBranchIdx: number[];
	processorCanReachWarehouse: boolean[];
	reachableProcessorsByProducer: number[][];
}

function allocateCapacityByBranch(
	usable: readonly SupplyPlannerBuildingSnapshot[],
	materialId: MaterialId,
	snapshot: SupplyPlannerSnapshot
): BranchAllocationResult {
	const producerIds: string[] = [];
	const producerCaps: number[] = [];
	const reachableBranchesByProducer: number[][] = [];
	const branchIds: MaterialId[] = [];
	const branchDemands: number[] = [];
	const branchIndex = new Map<MaterialId, number>();

	// Check whether processor-instance data is available for at least one
	// usable producer. When present, use the 3-layer max-flow
	// (producer→processor→branch) which correctly caps each producer's
	// flow by the input capacity of the specific processor instances it
	// can reach. Without it, fall back to the 2-layer (producer→branch)
	// model using reachableBranchesByBuildingAndMaterial.
	const processorData = snapshot.reachableProcessorsByBuildingAndMaterial;
	const hasProcessorData =
		processorData !== undefined &&
		usable.some((building) => processorData[`${building.id}\u0000${materialId}`]);

	const reachableProcessorsByProducer: number[][] = [];
	const processorIds: string[] = [];
	const processorCaps: number[] = [];
	const processorBranchIdx: number[] = [];
	const processorCanReachWarehouse: boolean[] = [];
	const processorIndexById = new Map<string, number>();

	for (const building of usable) {
		producerIds.push(building.id);
		producerCaps.push(getMaterialOutputCapacityPerDay([building], materialId));

		if (hasProcessorData) {
			const entries = processorData[`${building.id}\u0000${materialId}`];
			const reachableProcessors: number[] = [];
			if (entries) {
				for (const entry of entries) {
					let bi = branchIndex.get(entry.branchId);
					if (bi === undefined) {
						bi = branchIds.length;
						branchIds.push(entry.branchId);
						branchDemands.push(0);
						branchIndex.set(entry.branchId, bi);
					}
					let pi = processorIndexById.get(entry.processorId);
					if (pi === undefined) {
						pi = processorIds.length;
						processorIds.push(entry.processorId);
						processorCaps.push(entry.inputCapacity);
						processorBranchIdx.push(bi);
						processorCanReachWarehouse.push(entry.canReachWarehouse);
						processorIndexById.set(entry.processorId, pi);
					}
					reachableProcessors.push(pi);
				}
			}
			reachableProcessorsByProducer.push(reachableProcessors);
		} else {
			const branches =
				snapshot.reachableBranchesByBuildingAndMaterial?.[`${building.id}\u0000${materialId}`];
			const reachable: number[] = [];
			if (branches) {
				for (const [branchId, demand] of branches) {
					let bi = branchIndex.get(branchId);
					if (bi === undefined) {
						bi = branchIds.length;
						branchIds.push(branchId);
						branchDemands.push(demand);
						branchIndex.set(branchId, bi);
					} else {
						branchDemands[bi] = Math.max(branchDemands[bi]!, demand);
					}
					reachable.push(bi);
				}
			}
			reachableBranchesByProducer.push(reachable);
		}
	}

	// Processor nodes must include every usable warehouse-connected
	// downstream processor for the material, not only the subset some local
	// producer reaches. City inventory is a warehouse source: at runtime a
	// processor pulls it via `pullViaRail` whenever it can reach a warehouse,
	// regardless of producer reachability. The producer-reachable entries
	// above only register processors a producer can deliver to, so a
	// warehouse-connected processor no producer reaches (e.g. a second flour
	// mill on a separate rail island from the grain farm) would be absent
	// and the inventory source in the horizon flow could not route through
	// it — stranding inventory the runtime would otherwise let it consume.
	// Add such processors here with no producer edges; the inventory edge
	// (added in localSupplyOverHorizon from processorCanReachWarehouse)
	// reaches them, while the shared processor→branch capacity still caps
	// total consumption.
	if (hasProcessorData) {
		const whProcessors = snapshot.warehouseConnectedProcessorsByMaterial[materialId] ?? [];
		for (const entry of whProcessors) {
			if (processorIndexById.has(entry.processorId)) continue;
			let bi = branchIndex.get(entry.branchId);
			if (bi === undefined) {
				bi = branchIds.length;
				branchIds.push(entry.branchId);
				branchDemands.push(entry.branchDemand ?? 0);
				branchIndex.set(entry.branchId, bi);
			} else if (entry.branchDemand !== undefined) {
				branchDemands[bi] = Math.max(branchDemands[bi]!, entry.branchDemand);
			}
			const pi = processorIds.length;
			processorIds.push(entry.processorId);
			processorCaps.push(entry.inputCapacity);
			processorBranchIdx.push(bi);
			processorCanReachWarehouse.push(true);
			processorIndexById.set(entry.processorId, pi);
			// No producer reaches this processor: it is absent from every
			// producer's reachableProcessorsByProducer, so it carries no
			// producer→processor edge and contributes nothing to the
			// production-only totalFlow.
		}
	}

	// When using processor data, branch demands come from the branch-level
	// reachable demand (already capped by processor input capacity in
	// computeReachableDemandByMaterial). Derive them from the per-producer
	// branch caps.
	if (hasProcessorData) {
		for (const building of usable) {
			const branches =
				snapshot.reachableBranchesByBuildingAndMaterial?.[`${building.id}\u0000${materialId}`];
			if (branches) {
				for (const [branchId, demand] of branches) {
					const bi = branchIndex.get(branchId);
					if (bi !== undefined) {
						branchDemands[bi] = Math.max(branchDemands[bi]!, demand);
					}
				}
			}
		}
	}

	const producerCount = producerCaps.length;
	const branchCount = branchIds.length;
	if (producerCount === 0 || branchCount === 0) {
		return {
			totalFlow: 0,
			producerIds,
			producerCaps,
			producerFlows: new Array(producerCount).fill(0),
			branchIds,
			branchDemands,
			branchFlows: new Array(branchCount).fill(0),
			hasProcessorData,
			processorIds,
			processorCaps,
			processorBranchIdx,
			processorCanReachWarehouse,
			reachableProcessorsByProducer
		};
	}

	const result = hasProcessorData
		? tripartiteMaxFlow(
				producerCaps,
				reachableProcessorsByProducer,
				processorCaps,
				processorBranchIdx,
				branchDemands
			)
		: bipartiteMaxFlow(producerCaps, reachableBranchesByProducer, branchDemands);
	return {
		totalFlow: result.totalFlow,
		producerIds,
		producerCaps,
		producerFlows: result.producerFlows,
		branchIds,
		branchDemands,
		branchFlows: result.branchFlows,
		hasProcessorData,
		processorIds,
		processorCaps,
		processorBranchIdx,
		processorCanReachWarehouse,
		reachableProcessorsByProducer
	};
}

interface FlowEdge {
	to: number;
	cap: number;
	rev: FlowEdge;
}

/**
 * Result of the bipartite max-flow allocation. `producerFlows[i]` is the
 * actual flow assigned to producer `i` (≤ `producerCaps[i]`), and
 * `branchFlows[j]` is the actual flow received by branch `j` (≤
 * `branchDemands[j]`). Used to distinguish connectivity-caused deficits
 * (a producer has residual capacity but cannot reach an unsatisfied
 * branch) from genuine production-capacity shortages.
 */
interface MaxFlowResult {
	totalFlow: number;
	producerFlows: number[];
	branchFlows: number[];
}

/**
 * Edmonds-Karp max-flow over a bipartite producer→branch network.
 * Source feeds producers (capped by daily output), producers feed the
 * branches they can reach (uncapped), and branches feed the sink (capped
 * by demand). Returns the optimal total allocation plus per-producer and
 * per-branch flow breakdowns.
 */
function bipartiteMaxFlow(
	producerCaps: readonly number[],
	reachableBranchesByProducer: readonly (readonly number[])[],
	branchDemands: readonly number[]
): MaxFlowResult {
	const producerCount = producerCaps.length;
	const branchCount = branchDemands.length;
	const SOURCE = 0;
	const SINK = producerCount + branchCount + 1;
	const nodeCount = producerCount + branchCount + 2;
	const graph: FlowEdge[][] = Array.from({ length: nodeCount }, () => []);

	const addEdge = (from: number, to: number, cap: number): void => {
		const fwd: FlowEdge = { to, cap, rev: null! };
		const bwd: FlowEdge = { to: from, cap: 0, rev: fwd };
		fwd.rev = bwd;
		graph[from]!.push(fwd);
		graph[to]!.push(bwd);
	};

	for (let i = 0; i < producerCount; i++) {
		addEdge(SOURCE, i + 1, producerCaps[i]!);
	}
	for (let i = 0; i < producerCount; i++) {
		for (const j of reachableBranchesByProducer[i]!) {
			addEdge(i + 1, producerCount + 1 + j, Infinity);
		}
	}
	for (let j = 0; j < branchCount; j++) {
		addEdge(producerCount + 1 + j, SINK, branchDemands[j]!);
	}

	const EPSILON = 1e-9;
	let totalFlow = 0;

	for (;;) {
		const parent: Array<{ node: number; edge: FlowEdge } | null> = new Array(nodeCount).fill(null);
		const visited = new Array<boolean>(nodeCount).fill(false);
		visited[SOURCE] = true;
		const queue: number[] = [SOURCE];
		let foundSink = false;

		while (queue.length > 0 && !foundSink) {
			const node = queue.shift()!;
			for (const edge of graph[node]!) {
				if (!visited[edge.to] && edge.cap > EPSILON) {
					visited[edge.to] = true;
					parent[edge.to] = { node, edge };
					if (edge.to === SINK) {
						foundSink = true;
						break;
					}
					queue.push(edge.to);
				}
			}
		}
		if (!foundSink) break;

		let bottleneck = Infinity;
		for (let curr = SINK; curr !== SOURCE; ) {
			const pe = parent[curr]!;
			bottleneck = Math.min(bottleneck, pe.edge.cap);
			curr = pe.node;
		}
		for (let curr = SINK; curr !== SOURCE; ) {
			const pe = parent[curr]!;
			pe.edge.cap -= bottleneck;
			pe.edge.rev.cap += bottleneck;
			curr = pe.node;
		}
		totalFlow += bottleneck;
	}

	// Extract per-producer and per-branch flows from residual capacities.
	// After max-flow, each forward edge's cap = originalCap - flow, so
	// flow = originalCap - cap.
	const producerFlows = new Array<number>(producerCount).fill(0);
	for (let i = 0; i < producerCount; i++) {
		for (const edge of graph[SOURCE]!) {
			if (edge.to === i + 1) {
				producerFlows[i] = producerCaps[i]! - edge.cap;
				break;
			}
		}
	}
	const branchFlows = new Array<number>(branchCount).fill(0);
	for (let j = 0; j < branchCount; j++) {
		for (const edge of graph[producerCount + 1 + j]!) {
			if (edge.to === SINK) {
				branchFlows[j] = branchDemands[j]! - edge.cap;
				break;
			}
		}
	}

	return { totalFlow, producerFlows, branchFlows };
}

/**
 * Edmonds-Karp max-flow over a 3-layer producer→processor→branch network.
 *
 * Source feeds producers (capped by daily output), producers feed the
 * processor instances they can reach (uncapped), processors feed their
 * branch (capped by the processor's input capacity, 1:1 mapping), and
 * branches feed the sink (capped by branch demand).
 *
 * The processor's input capacity lives on the shared processor-to-branch
 * edge, not each producer-to-processor edge. Putting it on the per-producer
 * edge duplicates the capacity: with N producers reaching one processor,
 * each edge would carry the full input capacity, so total inflow could
 * reach N times inputCapacity. The runtime bounds the processor's total
 * consumption, so the capacity must constrain the single processor-to-
 * branch outflow, which also distinguishes multiple processor instances producing the
 * same downstream material — a producer that can only reach one of two
 * flour mills is capped by that mill's input capacity, not the full branch
 * demand.
 */
function tripartiteMaxFlow(
	producerCaps: readonly number[],
	reachableProcessorsByProducer: readonly (readonly number[])[],
	processorCaps: readonly number[],
	processorBranchIdx: readonly number[],
	branchDemands: readonly number[]
): MaxFlowResult {
	const producerCount = producerCaps.length;
	const processorCount = processorCaps.length;
	const branchCount = branchDemands.length;
	const SOURCE = 0;
	const SINK = producerCount + processorCount + branchCount + 1;
	const nodeCount = producerCount + processorCount + branchCount + 2;
	const graph: FlowEdge[][] = Array.from({ length: nodeCount }, () => []);

	const addEdge = (from: number, to: number, cap: number): void => {
		const fwd: FlowEdge = { to, cap, rev: null! };
		const bwd: FlowEdge = { to: from, cap: 0, rev: fwd };
		fwd.rev = bwd;
		graph[from]!.push(fwd);
		graph[to]!.push(bwd);
	};

	const producerNode = (i: number) => i + 1;
	const processorNode = (k: number) => producerCount + 1 + k;
	const branchNode = (j: number) => producerCount + processorCount + 1 + j;

	for (let i = 0; i < producerCount; i++) {
		addEdge(SOURCE, producerNode(i), producerCaps[i]!);
	}
	for (let i = 0; i < producerCount; i++) {
		for (const processorIdx of reachableProcessorsByProducer[i]!) {
			addEdge(producerNode(i), processorNode(processorIdx), Infinity);
		}
	}
	for (let k = 0; k < processorCount; k++) {
		addEdge(processorNode(k), branchNode(processorBranchIdx[k]!), processorCaps[k]!);
	}
	for (let j = 0; j < branchCount; j++) {
		addEdge(branchNode(j), SINK, branchDemands[j]!);
	}

	const EPSILON = 1e-9;
	let totalFlow = 0;

	for (;;) {
		const parent: Array<{ node: number; edge: FlowEdge } | null> = new Array(nodeCount).fill(null);
		const visited = new Array<boolean>(nodeCount).fill(false);
		visited[SOURCE] = true;
		const queue: number[] = [SOURCE];
		let foundSink = false;

		while (queue.length > 0 && !foundSink) {
			const node = queue.shift()!;
			for (const edge of graph[node]!) {
				if (!visited[edge.to] && edge.cap > EPSILON) {
					visited[edge.to] = true;
					parent[edge.to] = { node, edge };
					if (edge.to === SINK) {
						foundSink = true;
						break;
					}
					queue.push(edge.to);
				}
			}
		}
		if (!foundSink) break;

		let bottleneck = Infinity;
		for (let curr = SINK; curr !== SOURCE; ) {
			const pe = parent[curr]!;
			bottleneck = Math.min(bottleneck, pe.edge.cap);
			curr = pe.node;
		}
		for (let curr = SINK; curr !== SOURCE; ) {
			const pe = parent[curr]!;
			pe.edge.cap -= bottleneck;
			pe.edge.rev.cap += bottleneck;
			curr = pe.node;
		}
		totalFlow += bottleneck;
	}

	const producerFlows = new Array<number>(producerCount).fill(0);
	for (let i = 0; i < producerCount; i++) {
		for (const edge of graph[SOURCE]!) {
			if (edge.to === producerNode(i)) {
				producerFlows[i] = producerCaps[i]! - edge.cap;
				break;
			}
		}
	}
	const branchFlows = new Array<number>(branchCount).fill(0);
	for (let j = 0; j < branchCount; j++) {
		for (const edge of graph[branchNode(j)]!) {
			if (edge.to === SINK) {
				branchFlows[j] = branchDemands[j]! - edge.cap;
				break;
			}
		}
	}

	return { totalFlow, producerFlows, branchFlows };
}

/**
 * Horizon-total local supply (production + accessible city inventory) for a
 * raw/intermediate material, via a 4-layer max-flow:
 * source -> [producers, inventory] -> processors -> branches -> sink.
 *
 * Producer/processor capacities and branch demands are scaled by the
 * horizon. City inventory is a stock (not scaled) and routes ONLY to
 * processors that can reach a warehouse, mirroring `pullViaRail`: a
 * processor with no rail path to a warehouse cannot draw inventory, so it
 * is stranded. Co-locating production and inventory in one flow also
 * prevents them from collectively exceeding a processor's input capacity
 * (the production-only daily flow already respects that cap; adding
 * inventory on top without sharing the cap would double-count).
 *
 * Returns the total local supply over the horizon and how much of the
 * inventory was consumed (for ending-inventory derivation).
 */
function localSupplyOverHorizon(
	allocation: BranchAllocationResult,
	horizonDays: number,
	inventoryUnits: number
): { totalLocalSupply: number; inventoryConsumed: number } {
	const producerCount = allocation.producerCaps.length;
	const processorCount = allocation.processorCaps.length;
	const branchCount = allocation.branchDemands.length;
	const inventoryCap = Math.max(0, inventoryUnits);
	if (branchCount === 0 || (producerCount === 0 && inventoryCap <= 0)) {
		return { totalLocalSupply: 0, inventoryConsumed: 0 };
	}

	const SOURCE = 0;
	const producerNode = (i: number) => i + 1;
	const INVENTORY = producerCount + 1;
	const processorNode = (k: number) => producerCount + 2 + k;
	const branchNode = (j: number) => producerCount + 2 + processorCount + j;
	const SINK = producerCount + 2 + processorCount + branchCount + 1;
	const nodeCount = SINK + 1;
	const graph: FlowEdge[][] = Array.from({ length: nodeCount }, () => []);

	const addEdge = (from: number, to: number, cap: number): void => {
		const fwd: FlowEdge = { to, cap, rev: null! };
		const bwd: FlowEdge = { to: from, cap: 0, rev: fwd };
		fwd.rev = bwd;
		graph[from]!.push(fwd);
		graph[to]!.push(bwd);
	};

	for (let i = 0; i < producerCount; i++) {
		addEdge(SOURCE, producerNode(i), allocation.producerCaps[i]! * horizonDays);
	}
	if (inventoryCap > 0) {
		addEdge(SOURCE, INVENTORY, inventoryCap);
	}
	for (let i = 0; i < producerCount; i++) {
		for (const processorIdx of allocation.reachableProcessorsByProducer[i]!) {
			addEdge(producerNode(i), processorNode(processorIdx), Infinity);
		}
	}
	for (let k = 0; k < processorCount; k++) {
		if (allocation.processorCanReachWarehouse[k]) {
			addEdge(INVENTORY, processorNode(k), Infinity);
		}
	}
	for (let k = 0; k < processorCount; k++) {
		addEdge(
			processorNode(k),
			branchNode(allocation.processorBranchIdx[k]!),
			allocation.processorCaps[k]! * horizonDays
		);
	}
	for (let j = 0; j < branchCount; j++) {
		addEdge(branchNode(j), SINK, allocation.branchDemands[j]! * horizonDays);
	}

	const EPSILON = 1e-9;
	let totalFlow = 0;
	for (;;) {
		const parent: Array<{ node: number; edge: FlowEdge } | null> = new Array(nodeCount).fill(null);
		const visited = new Array<boolean>(nodeCount).fill(false);
		visited[SOURCE] = true;
		const queue: number[] = [SOURCE];
		let foundSink = false;
		while (queue.length > 0 && !foundSink) {
			const node = queue.shift()!;
			for (const edge of graph[node]!) {
				if (!visited[edge.to] && edge.cap > EPSILON) {
					visited[edge.to] = true;
					parent[edge.to] = { node, edge };
					if (edge.to === SINK) {
						foundSink = true;
						break;
					}
					queue.push(edge.to);
				}
			}
		}
		if (!foundSink) break;
		let bottleneck = Infinity;
		for (let curr = SINK; curr !== SOURCE; ) {
			const pe = parent[curr]!;
			bottleneck = Math.min(bottleneck, pe.edge.cap);
			curr = pe.node;
		}
		for (let curr = SINK; curr !== SOURCE; ) {
			const pe = parent[curr]!;
			pe.edge.cap -= bottleneck;
			pe.edge.rev.cap += bottleneck;
			curr = pe.node;
		}
		totalFlow += bottleneck;
	}

	let inventoryConsumed = 0;
	if (inventoryCap > 0) {
		for (const edge of graph[SOURCE]!) {
			if (edge.to === INVENTORY) {
				inventoryConsumed = inventoryCap - edge.cap;
				break;
			}
		}
	}
	return { totalLocalSupply: totalFlow, inventoryConsumed };
}

/**
 * Daily rate at which city inventory is consumed by the topology, derived
 * from the same 4-layer flow as `localSupplyOverHorizon` but with abundant
 * inventory and a one-day horizon. The rate is the max inventory flow per
 * day when inventory is not the bottleneck, so `inventory / rate` gives the
 * true stockout day even when inventory is exhausted within a horizon (the
 * finite-horizon `inventoryConsumed` is capped at the inventory amount and
 * cannot recover the rate in that case).
 *
 * Production is prioritized over inventory because producers are connected
 * to SOURCE before the INVENTORY node, so when production saturates a
 * processor the inventory flow — and thus the rate — is zero (no stockout:
 * inventory is never drawn down). The abundant inventory is chosen larger
 * than any possible daily inventory flow (total processor input capacity +
 * total branch demand + 1) so it never binds, while staying small enough
 * for exact floating-point subtraction in `localSupplyOverHorizon`.
 */
function inventoryFlowRatePerDay(allocation: BranchAllocationResult): number {
	const totalProcessorCap = allocation.processorCaps.reduce((sum, cap) => sum + cap, 0);
	const totalBranchDemand = allocation.branchDemands.reduce((sum, demand) => sum + demand, 0);
	const abundantInventory = totalProcessorCap + totalBranchDemand + 1;
	return localSupplyOverHorizon(allocation, 1, abundantInventory).inventoryConsumed;
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
		const materialKind = MATERIALS[requirement.materialId]?.kind;
		// Cap each producer's capacity by its own reachable demand, then sum.
		// For non-finished materials with per-branch reachability data, the
		// 3-layer max-flow (producer->processor->branch) caps each producer by
		// the input capacity of the processor instances it can reach. For
		// finished materials (single warehouse sink), per-producer cap +
		// aggregate clamp is correct. When per-branch data is unavailable
		// (e.g. manually constructed test snapshots), fall back to per-producer
		// cap + aggregate clamp.
		let allocation: BranchAllocationResult | null = null;
		let usableCapacityPerDay: number;
		if (materialKind !== 'finished' && snapshot.reachableBranchesByBuildingAndMaterial) {
			const hasBranchData = usable.some(
				(building) =>
					snapshot.reachableBranchesByBuildingAndMaterial?.[
						`${building.id}\u0000${requirement.materialId}`
					]
			);
			if (hasBranchData) {
				allocation = allocateCapacityByBranch(usable, requirement.materialId, snapshot);
				usableCapacityPerDay = allocation.totalFlow;
			} else {
				usableCapacityPerDay = perProducerCappedCapacity(usable, requirement.materialId, snapshot);
			}
		} else {
			usableCapacityPerDay = perProducerCappedCapacity(usable, requirement.materialId, snapshot);
		}

		// City inventory is a warehouse source: a processor can only draw it
		// via pullViaRail when it can reach a warehouse. For raw/intermediate
		// materials, inventory with no warehouse-connected consumer is stranded
		// and must not be credited as local supply. The horizon projection
		// models local supply as a 4-layer flow (producers + inventory ->
		// processors -> branches) so production and inventory share processor
		// input capacity and inventory routes only to warehouse-connected
		// processors. Finished materials keep their existing full-inventory
		// warehouse-sink treatment.
		const isRawOrIntermediate =
			materialKind !== 'finished' && requirement.producerRecipeId !== null;
		const warehouseConnectedConsumerCapacity = isRawOrIntermediate
			? (snapshot.warehouseConnectedConsumerCapacityByMaterial[requirement.materialId] ?? 0)
			: 0;
		const inventoryAccessible = !isRawOrIntermediate || warehouseConnectedConsumerCapacity > 0;
		const accessibleInventory = inventoryAccessible ? inventoryUnits : 0;
		const useInventoryFlow =
			isRawOrIntermediate &&
			allocation !== null &&
			allocation.hasProcessorData &&
			allocation.processorCaps.length > 0;

		// Horizon local-supply model. When a processor graph is available
		// (usable producers reaching processors), a 4-layer max-flow shares
		// processor input capacity between production and inventory and routes
		// inventory only to warehouse-connected processors. When no graph is
		// available (e.g. the producer is missing), inventory is still gated on
		// warehouse connectivity and capped by the aggregate
		// warehouse-connected consumer pull capacity, so it only fills the
		// demand gap production leaves and never over-credits. Finished
		// materials keep their existing full-inventory warehouse-sink model
		// (undefined → default horizon formula).
		const computeHorizonFlow = (
			horizonDays: number
		): { totalLocalSupply: number; inventoryConsumed: number } | undefined => {
			if (useInventoryFlow && allocation) {
				return localSupplyOverHorizon(allocation, horizonDays, inventoryUnits);
			}
			if (!isRawOrIntermediate) return undefined;
			const requiredUnits = requirement.requiredPerDay * horizonDays;
			const productionUnits = usableCapacityPerDay * horizonDays;
			const inventoryConsumed = inventoryAccessible
				? Math.min(
						inventoryUnits,
						warehouseConnectedConsumerCapacity * horizonDays,
						Math.max(0, requiredUnits - productionUnits)
					)
				: 0;
			return {
				totalLocalSupply: Math.min(productionUnits + inventoryConsumed, requiredUnits),
				inventoryConsumed
			};
		};
		const sevenDayFlow = computeHorizonFlow(7);
		const thirtyDayFlow = computeHorizonFlow(30);

		// Derive stockout day and days of cover from a real daily inventory
		// consumption rate rather than the raw demand-production gap. The
		// horizon flow shares processor input capacity between production and
		// inventory, so the rate at which inventory depletes can differ from
		// the simple (demand - production) gap: when production saturates a
		// processor, inventory is not consumed at all (rate 0 -> no stockout).
		// For the processor-graph path the rate comes from an abundant-inventory
		// daily flow (production prioritized over inventory); for the fallback
		// path it is the warehouse-connected consumer pull cap clamped to the
		// unmet demand — matching the rate the horizon flow itself consumes
		// inventory at. This also fixes both boundaries: zero inventory with
		// unmet demand stocks out on day 0 (not null), and inventory exhausted
		// within a horizon stocks out at inventory/rate (not at the horizon
		// length).
		const netDailyDraw = Math.max(0, requirement.requiredPerDay - usableCapacityPerDay);
		let inventoryRatePerDay: number;
		if (useInventoryFlow && allocation) {
			inventoryRatePerDay = inventoryFlowRatePerDay(allocation);
		} else if (isRawOrIntermediate) {
			// Raw/intermediate inventory is a warehouse source: it depletes at
			// the rate warehouse-connected processors can pull it, clamped to
			// the unmet demand — not the full demand-production gap.
			inventoryRatePerDay = inventoryAccessible
				? Math.min(warehouseConnectedConsumerCapacity, netDailyDraw)
				: 0;
		} else {
			// Finished or no-recipe material: inventory is a direct buffer that
			// depletes at the full demand-production gap (no warehouse gating).
			inventoryRatePerDay = netDailyDraw;
		}
		let stockoutDay: number | null;
		let daysOfCover: number | null;
		if (accessibleInventory <= 0) {
			// No inventory buffer: if production does not cover demand the
			// material is stocked out now (day 0); otherwise there is no
			// inventory-driven stockout.
			stockoutDay = netDailyDraw > 0 ? 0 : null;
			daysOfCover = netDailyDraw > 0 ? 0 : null;
		} else {
			stockoutDay = inventoryRatePerDay > 0 ? accessibleInventory / inventoryRatePerDay : null;
			daysOfCover = stockoutDay;
		}

		return {
			...requirement,
			buildingCount: installed.length,
			maxBuildingLevel: buildingLevels.at(-1) ?? 0,
			buildingLevels,
			inventoryUnits,
			daysOfCover,
			projectedStockoutDay: stockoutDay,
			installedCapacityPerDay,
			usableCapacityPerDay,
			sevenDay: horizonProjection(
				7,
				requirement.requiredPerDay,
				accessibleInventory,
				usableCapacityPerDay,
				stockoutDay,
				sevenDayFlow,
				daysOfCover
			),
			thirtyDay: horizonProjection(
				30,
				requirement.requiredPerDay,
				accessibleInventory,
				usableCapacityPerDay,
				stockoutDay,
				thirtyDayFlow,
				daysOfCover
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
	stockoutDay: number | null,
	flowResult?: { totalLocalSupply: number; inventoryConsumed: number },
	daysOfCoverOverride?: number | null
): SupplyMaterialHorizonProjection {
	const requiredUnits = requiredPerDay * horizonDays;
	const localAvailableUnits = flowResult
		? flowResult.totalLocalSupply
		: startingInventoryUnits + usableCapacityPerDay * horizonDays;
	const endingInventoryUnits = flowResult
		? Math.max(0, startingInventoryUnits - flowResult.inventoryConsumed)
		: Math.max(0, localAvailableUnits - requiredUnits);
	return {
		horizonDays,
		requiredUnits,
		startingInventoryUnits,
		localAvailableUnits,
		importRequiredUnits: Math.max(0, requiredUnits - localAvailableUnits),
		endingInventoryUnits,
		daysOfCover:
			daysOfCoverOverride !== undefined
				? daysOfCoverOverride
				: requiredPerDay > 0
					? startingInventoryUnits / requiredPerDay
					: null,
		projectedStockoutDay: stockoutDay
	};
}

function warehouseEvidence(snapshot: SupplyPlannerSnapshot): SupplyWarehouseEvidence {
	return {
		capacity: snapshot.warehouseCapacity,
		used: snapshot.warehouseUsed,
		freeCapacity: Math.max(0, snapshot.warehouseCapacity - snapshot.warehouseUsed),
		overflowUnits: Math.max(0, snapshot.warehouseUsed - snapshot.warehouseCapacity)
	};
}

const CONNECTIVITY_EPSILON = 1e-9;

/**
 * Detects a capacity deficit caused by producer→branch connectivity
 * rather than a genuine installed-capacity shortage. When total installed
 * capacity is sufficient (≥ required) but max-flow usable capacity is
 * below required, the deficit may be caused by an existing producer that
 * has residual capacity but cannot reach an unsatisfied branch. In that
 * case the bottleneck is rail-disconnected (connect the producer to the
 * unsatisfied branch), not production-capacity (build/upgrade a producer).
 *
 * Only applies to non-finished materials with per-branch reachability
 * data, where aggregate reachable demand ≥ required (otherwise the
 * reachabilityGap check already classifies it).
 */
function findConnectivityDeficit(
	snapshot: SupplyPlannerSnapshot,
	materials: readonly SupplyMaterialProjection[]
): { buildingId: string; materialId: MaterialId } | null {
	const usableIds = new Set(snapshot.usableBuildingIds);

	const candidates = materials
		.filter((material) => {
			if (material.requiredPerDay <= 0) return false;
			if (material.producerRecipeId === null) return false;
			if (material.buildingCount === 0) return false;
			// Only applies when installed capacity is sufficient but
			// usable is not — a genuine production shortage falls through
			// to the production-capacity classification.
			if (material.installedCapacityPerDay < material.requiredPerDay - CONNECTIVITY_EPSILON)
				return false;
			if (material.usableCapacityPerDay >= material.requiredPerDay - CONNECTIVITY_EPSILON)
				return false;
			// Only applies to non-finished materials with branch data
			// (finished materials use per-producer cap, not branch allocation).
			const materialKind = MATERIALS[material.materialId]?.kind;
			if (materialKind === 'finished') return false;
			const reachable = snapshot.reachableDemandByMaterial[material.materialId];
			if (reachable === undefined) return false;
			// If aggregate reachable demand is below required, the
			// reachabilityGap check already handles it.
			if (reachable < material.requiredPerDay - CONNECTIVITY_EPSILON) return false;
			// Check that branch data is available for at least one usable producer.
			const installed = material.producerRecipeId
				? buildingsForRecipe(snapshot.buildings, material.producerRecipeId)
				: [];
			const usable = installed.filter((building) => usableIds.has(building.id));
			return usable.some(
				(building) =>
					snapshot.reachableBranchesByBuildingAndMaterial?.[
						`${building.id}\u0000${material.materialId}`
					]
			);
		})
		.sort(
			(left, right) =>
				right.chainDepth - left.chainDepth ||
				compareCodeUnitStrings(left.materialId, right.materialId)
		);

	for (const material of candidates) {
		const installed = material.producerRecipeId
			? buildingsForRecipe(snapshot.buildings, material.producerRecipeId)
			: [];
		const usable = installed.filter((building) => usableIds.has(building.id));
		const allocation = allocateCapacityByBranch(usable, material.materialId, snapshot);

		// Find a branch with unsatisfied demand, then look for a producer
		// with residual capacity that cannot reach that branch (or cannot
		// reach all processor instances in that branch). That producer's
		// excess capacity is stranded by rail topology, not by a production
		// shortage — connecting it to the unsatisfied branch (or to the
		// unreachable processor instances) would close the gap without
		// wasting capital on a new producer.
		const processorData = snapshot.reachableProcessorsByBuildingAndMaterial;
		const hasProcessorData = usable.some(
			(building) => processorData[`${building.id}\u0000${material.materialId}`]
		);
		for (let bi = 0; bi < allocation.branchIds.length; bi++) {
			const unsatisfied = allocation.branchDemands[bi]! - allocation.branchFlows[bi]!;
			if (unsatisfied <= CONNECTIVITY_EPSILON) continue;

			const branchId = allocation.branchIds[bi]!;

			// When processor-instance data is available, find all usable
			// processor buildings for this branch. A producer that can
			// reach the branch but not all processor instances is stranded
			// by rail — connecting it to the unreachable processors could
			// close the gap. A producer that can reach all processors but
			// the branch is still unsatisfied has a processor-capacity
			// issue (production-capacity, not rail).
			const branchProcessorIds = hasProcessorData
				? computeBranchProcessorIds(snapshot, branchId, usableIds)
				: null;

			for (let pi = 0; pi < allocation.producerIds.length; pi++) {
				const residual = allocation.producerCaps[pi]! - allocation.producerFlows[pi]!;
				if (residual <= CONNECTIVITY_EPSILON) continue;

				if (branchProcessorIds) {
					// Processor-instance-aware check.
					const producerEntries =
						processorData[`${allocation.producerIds[pi]}\u0000${material.materialId}`] ?? [];
					const reachableForBranch = new Set(
						producerEntries.filter((e) => e.branchId === branchId).map((e) => e.processorId)
					);
					// If the producer can't reach all usable processors for
					// this branch, it's stranded by rail topology.
					if (![...branchProcessorIds].every((id) => reachableForBranch.has(id))) {
						return {
							buildingId: allocation.producerIds[pi]!,
							materialId: material.materialId
						};
					}
				} else {
					// Fallback: branch-level check (no processor data).
					const branches =
						snapshot.reachableBranchesByBuildingAndMaterial?.[
							`${allocation.producerIds[pi]}\u0000${material.materialId}`
						];
					const canReachBranch = branches?.has(branchId);
					if (!canReachBranch) {
						return {
							buildingId: allocation.producerIds[pi]!,
							materialId: material.materialId
						};
					}
				}
			}
		}
	}

	return null;
}

/**
 * Returns the set of usable processor building IDs that produce the given
 * downstream material (branch). Used by findConnectivityDeficit to check
 * whether a producer can reach all processor instances in an unsatisfied
 * branch.
 */
function computeBranchProcessorIds(
	snapshot: SupplyPlannerSnapshot,
	branchId: MaterialId,
	usableIds: Set<string>
): Set<string> {
	const recipeId = MATERIAL_PRODUCER_RECIPES.get(branchId);
	if (!recipeId) return new Set();
	const processors = buildingsForRecipe(snapshot.buildings, recipeId).filter((b) =>
		usableIds.has(b.id)
	);
	return new Set(processors.map((b) => b.id));
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

	const reachabilityGap = [...materials]
		.filter((material) => {
			if (material.requiredPerDay <= 0) return false;
			if (material.producerRecipeId === null) return false;
			if (material.buildingCount === 0) return false;
			const reachable = snapshot.reachableDemandByMaterial[material.materialId];
			if (reachable === undefined) return false;
			return reachable < material.requiredPerDay;
		})
		.sort(
			(left, right) =>
				right.chainDepth - left.chainDepth ||
				compareCodeUnitStrings(left.materialId, right.materialId)
		)[0];
	if (reachabilityGap) {
		const origin = buildingsForMaterial(snapshot, reachabilityGap.materialId)
			.filter((building) => snapshot.usableBuildingIds.includes(building.id))
			.sort((left, right) => compareCodeUnitStrings(left.id, right.id))[0];
		if (origin) {
			return {
				kind: 'rail-disconnected',
				buildingId: origin.id,
				materialId: reachabilityGap.materialId
			};
		}
	}

	// After max-flow, distinguish a connectivity-caused deficit (installed
	// capacity ≥ required but usable < required because an existing producer
	// with residual capacity cannot reach an unsatisfied branch) from a
	// genuine production-capacity shortage. Building/upgrading a producer
	// wastes capital when connecting the stranded producer would close the gap.
	const connectivityDeficit = findConnectivityDeficit(snapshot, materials);
	if (connectivityDeficit) {
		return {
			kind: 'rail-disconnected',
			buildingId: connectivityDeficit.buildingId,
			materialId: connectivityDeficit.materialId
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
