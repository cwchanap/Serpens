import { canonicalQuantity, compareWorldCityIds, getCityInventoryStats } from './cityInventory';
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
import { buildCityDemandPools } from './stock';
import { getProductDefinition } from './products';
import { compareRecurringRoutes } from './interCityLogistics';
import { getWorldCityDefinition, WORLD_CITY_CATALOG } from './worldCatalog';
import {
	buildSupplyPlannerLogisticsSnapshot,
	createSupplyPlannerLogisticsState,
	processSupplyPlannerRouteDispatches,
	processSupplyPlannerTransferArrivals,
	type SupplyPlannerLogisticsSnapshot,
	type SupplyPlannerLogisticsState
} from './supplyPlannerLogistics';
import type { RouteOperationalCondition } from './logisticsReadModels';
import type {
	City,
	GameState,
	IndustrialBuilding,
	IndustrialBuildingTypeId,
	MaterialId,
	MaterialKind,
	ProductId,
	ProductionRecipeId,
	RecurringRoute,
	TransferOrder,
	WorldCityId
} from './types';

export type SupplyPlannerHorizonDays = 7 | 30;

export interface SupplyPlannerRequest {
	retailCityId: WorldCityId;
	productId: ProductId;
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
	/** Copied route/order state used only when dated logistics can affect projection. */
	logistics?: SupplyPlannerLogisticsSnapshot;
}

export type SupplyPlannerRouteCondition =
	| RouteOperationalCondition
	| 'route-priority-constrained'
	| 'route-frequency'
	| 'route-lead-time'
	| 'route-paused';

const SUPPLY_PLANNER_ROUTE_CONDITION_RANK: Record<SupplyPlannerRouteCondition, number> = {
	'awaiting-dispatch': -1,
	normal: 0,
	'destination-full': 1,
	'route-frequency': 2,
	'route-lead-time': 2,
	'route-capacity-constrained': 3,
	'origin-stock-constrained': 3,
	'route-priority-constrained': 4,
	'route-paused': 4,
	'route-event-suspended': 5
};

function promoteSupplyPlannerRouteCondition(
	current: SupplyPlannerRouteCondition,
	candidate: SupplyPlannerRouteCondition
): SupplyPlannerRouteCondition {
	return SUPPLY_PLANNER_ROUTE_CONDITION_RANK[candidate] >
		SUPPLY_PLANNER_ROUTE_CONDITION_RANK[current]
		? candidate
		: current;
}

export interface SupplyPlannerRouteForecast {
	route: Readonly<RecurringRoute>;
	projectedCondition: SupplyPlannerRouteCondition;
	projectedDispatchedUnits7: number;
	projectedDispatchedUnits30: number;
	projectedDeliveredUnits7: number;
	projectedDeliveredUnits30: number;
	projectedTransportCost30: number;
	firstProjectedArrivalDay: number | null;
	peakUnmetDestinationNeed: number;
	firstOriginStockConstraintDay: number | null;
	firstDestinationCapacityConstraintDay: number | null;
	firstRouteCapacityConstraintDay: number | null;
	firstPriorityConstraintDay: number | null;
	priorityBlockedByRouteId: string | null;
}

export type SupplyLogisticsBottleneck =
	| {
			kind: 'destination-full';
			routeId: string;
			cityId: WorldCityId;
			materialId: MaterialId;
			day: number;
			blockedUnits: number;
			amount: number;
	  }
	| {
			kind: 'origin-stock-constrained';
			routeId: string;
			cityId: WorldCityId;
			materialId: MaterialId;
			day: number;
			deficitUnits: number;
			amount: number;
	  }
	| {
			kind: 'route-capacity-constrained';
			routeId: string;
			cityId: WorldCityId;
			materialId: MaterialId;
			day: number;
			unmetUnits: number;
			amount: number;
	  }
	| {
			kind: 'route-priority-constrained';
			routeId: string;
			blockingRouteId: string;
			cityId: WorldCityId;
			materialId: MaterialId;
			day: number;
			blockedUnits: number;
			amount: number;
	  }
	| {
			kind: 'route-frequency';
			routeId: string;
			cityId: WorldCityId;
			materialId: MaterialId;
			day: number;
			stockoutDay: number;
			nextArrivalDay: number;
			amount: number;
	  }
	| {
			kind: 'route-lead-time';
			routeId: string;
			cityId: WorldCityId;
			materialId: MaterialId;
			day: number;
			stockoutDay: number;
			firstArrivalDay: number;
			amount: number;
	  }
	| {
			kind: 'route-paused';
			routeId: string;
			cityId: WorldCityId;
			materialId: MaterialId;
			day: number;
			blockedUnits: number;
			amount: number;
	  }
	| {
			kind: 'destination-configuration';
			retailCityId: WorldCityId;
			supplyCityId: WorldCityId;
			materialId: MaterialId;
			day: number;
			amount: number;
	  };

export interface SupplyPlannerLogisticsMetrics {
	projectedDeliveredUnits7: number;
	projectedDeliveredUnits30: number;
	projectedTransportCost30: number;
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
	| { kind: 'rail-capacity-not-modeled' }
	| { kind: 'store-sales-capacity-not-modeled' };

/**
 * Projection limitations that can be produced by the Task 2 logistics trace.
 * The remote-origin entry is intentionally typed here while downstream display
 * consumers continue to use the legacy SupplyPlannerLimitation contract until
 * their owning task adds presentation/copy support.
 */
export type SupplyPlannerTraceLimitation =
	| SupplyPlannerLimitation
	| { kind: 'remote-origin-production-not-modeled'; routeIds: readonly string[] };

export type SupplyPlannerTraceProjection = SupplyPlannerProjection<SupplyPlannerTraceLimitation>;

export interface SupplyPlannerProjection<
	Limitation extends { kind: string } = SupplyPlannerLimitation
> {
	snapshot: SupplyPlannerSnapshot;
	materials: readonly SupplyMaterialProjection[];
	warehouse: SupplyWarehouseEvidence;
	bottleneck: SupplyBottleneck;
	limitations: readonly Limitation[];
	logisticsMetrics?: SupplyPlannerLogisticsMetrics;
	routeForecasts?: readonly SupplyPlannerRouteForecast[];
}

export type SupplyPlannerSnapshotResult =
	| { status: 'ready'; snapshot: SupplyPlannerSnapshot }
	| { status: 'empty'; reason: 'no-supported-products' }
	| { status: 'unavailable'; reason: 'retail-city-unavailable' | 'supply-city-unavailable' }
	| { status: 'unsupported'; reason: 'unsupported-category' | 'missing-producer-recipe' }
	| { status: 'invalid'; reason: 'invalid-request' };

export function listSupplyPlannerCategories(game: GameState, retailCityId: string): ProductId[] {
	const city = findAvailableRetailCity(game, retailCityId);
	if (!city) return [];

	const ids = new Set<ProductId>();
	const stores = game.stores
		.filter((store) => store.cityId === city.id)
		.sort((left, right) => compareCodeUnitStrings(left.id, right.id));
	for (const store of stores) {
		for (const product of getSupportedStoreChainCategories(store)) {
			if (store.products.some((candidate) => candidate.productId === product.id)) {
				ids.add(product.id);
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

	const products = listSupplyPlannerCategories(game, request.retailCityId);
	if (products.length === 0) {
		return { status: 'empty', reason: 'no-supported-products' };
	}
	if (!products.includes(request.productId)) {
		return { status: 'unsupported', reason: 'unsupported-category' };
	}

	const finishedMaterialId = getProductDefinition(request.productId).productionMaterialId;
	if (!finishedMaterialId || MATERIALS[finishedMaterialId].kind !== 'finished') {
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
		.map((city) => buildDemandContributor(game, city, request.productId))
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
		reachableDemandByMaterial: reachability.reachableDemandByMaterial,
		reachableDemandByBuildingAndMaterial: reachability.reachableDemandByBuildingAndMaterial,
		reachableBranchesByBuildingAndMaterial: reachability.reachableBranchesByBuildingAndMaterial,
		reachableProcessorsByBuildingAndMaterial: reachability.reachableProcessorsByBuildingAndMaterial,
		warehouseConnectedConsumerCapacityByMaterial:
			reachability.warehouseConnectedConsumerCapacityByMaterial,
		warehouseConnectedProcessorsByMaterial: reachability.warehouseConnectedProcessorsByMaterial,
		logistics: buildSupplyPlannerLogisticsSnapshot(game, industry.cityId)
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
 * Placement-independent reachability scaffold: the supply city's rail
 * network plus each existing building's attach-cell keys. Synthetic-producer
 * evaluation reuses one scaffold across candidate tiles so
 * `buildRequiredChainReachability` does not rebuild the network and
 * per-building attach map for every placement — only the synthetic
 * building's entry is recomputed per placement. Attach cells depend solely
 * on the network and building coordinates, so they are identical for every
 * placement of the same game state.
 */
export interface RailReachabilityBase {
	network: ReturnType<typeof buildRailNetwork>;
	attachCellsByBuildingId: ReadonlyMap<string, readonly string[]>;
}

export function buildRailReachabilityBase(
	game: GameState,
	supplyCityId: WorldCityId,
	actualBuildings: readonly IndustrialBuilding[] = game.industrialBuildings
): RailReachabilityBase | null {
	const city = game.industryCities.find((candidate) => candidate.id === supplyCityId);
	if (!city) return null;
	const network = buildRailNetwork(city);
	const attachCellsByBuildingId = new Map<string, readonly string[]>();
	for (const building of actualBuildings
		.filter((building) => building.cityId === supplyCityId)
		.sort((left, right) => compareCodeUnitStrings(left.id, right.id))) {
		attachCellsByBuildingId.set(building.id, getBuildingAttachCellKeys(network, building));
	}
	return { network, attachCellsByBuildingId };
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
	actualBuildings: readonly IndustrialBuilding[] = game.industrialBuildings,
	base?: RailReachabilityBase | null
): RequiredChainReachability {
	const requirements = buildSupplyMaterialRequirements(snapshot);
	const requiredMaterialIds = new Set(requirements.map((requirement) => requirement.materialId));
	assertNoRequiredChainCycle(requiredMaterialIds);
	const scopedBuildings = actualBuildings
		.filter((building) => building.cityId === snapshot.supplyCityId)
		.sort((left, right) => compareCodeUnitStrings(left.id, right.id));
	const city = game.industryCities.find((candidate) => candidate.id === snapshot.supplyCityId);
	if (!city) return disconnectedReachability(scopedBuildings, requiredMaterialIds);

	const network = base?.network ?? buildRailNetwork(city);
	const budget = createRailBudget(network);
	// Start from the shared attach-cell map when provided; only buildings
	// missing from it (the synthetic producer) are recomputed.
	const attachCellsByBuildingId = base
		? new Map(base.attachCellsByBuildingId)
		: new Map<string, readonly string[]>();
	for (const building of scopedBuildings) {
		if (!attachCellsByBuildingId.has(building.id)) {
			attachCellsByBuildingId.set(building.id, getBuildingAttachCellKeys(network, building));
		}
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
	// usable producer OR warehouse-connected processors exist independently
	// of producer reachability. When present, use the 3-layer max-flow
	// (producer→processor→branch) which correctly caps each producer's
	// flow by the input capacity of the specific processor instances it
	// can reach. Without it, fall back to the 2-layer (producer→branch)
	// model using reachableBranchesByBuildingAndMaterial.
	//
	// The warehouse-connected-processor condition allows the processor
	// graph to exist with zero usable producers: a missing producer does
	// not strand warehouse-accessible inventory, since a warehouse-connected
	// downstream processor can still pull it via rail. Without this, the
	// fallback would credit warehouse inventory against all branches using
	// aggregate capacity with no branch topology — over-crediting branches
	// whose processors cannot reach the warehouse.
	const processorData = snapshot.reachableProcessorsByBuildingAndMaterial;
	const whProcessorsForMaterial = snapshot.warehouseConnectedProcessorsByMaterial[materialId] ?? [];
	const hasProcessorData =
		processorData !== undefined &&
		(usable.some((building) => processorData[`${building.id}\u0000${materialId}`]) ||
			whProcessorsForMaterial.length > 0);

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
		for (const entry of whProcessorsForMaterial) {
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
	const processorCount = processorIds.length;
	const branchCount = branchIds.length;
	// Allow the processor graph to exist with zero producers when
	// warehouse-connected processors are present: the 3-layer max-flow
	// returns totalFlow 0 (no producer source edges), but the allocation
	// carries the processor/branch topology so localSupplyOverHorizon can
	// route inventory through warehouse-connected processors with branch
	// scoping — instead of the aggregate-capacity fallback that ignores
	// branch topology and over-credits branches whose processors cannot
	// reach the warehouse.
	if (branchCount === 0 || (producerCount === 0 && processorCount === 0)) {
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

const FLOW_EPSILON = 1e-9;

/**
 * Shared Edmonds-Karp max-flow engine over a residual graph of `FlowEdge`s.
 * Callers lay out their own node numbering and capacities via `addEdge`;
 * `maxFlow` runs EPSILON-gated BFS augmenting-path iterations to completion
 * and returns the total flow, updating residual capacities in place. A
 * second `maxFlow` call on the same network continues augmenting from the
 * existing residual state (the two-phase flow in `localSupplyOverHorizon`
 * relies on this). Per-node flows are recovered afterwards via `flowOn`:
 * after max-flow, each forward edge's cap = originalCap - flow.
 */
interface FlowNetwork {
	addEdge(from: number, to: number, cap: number): void;
	/** Flow on the forward edge `from`→`to`, derived from its residual cap. */
	flowOn(from: number, to: number, originalCap: number): number;
	maxFlow(source: number, sink: number): number;
}

function createFlowNetwork(nodeCount: number): FlowNetwork {
	const graph: FlowEdge[][] = Array.from({ length: nodeCount }, () => []);
	return {
		addEdge(from, to, cap) {
			const fwd: FlowEdge = { to, cap, rev: null! };
			const bwd: FlowEdge = { to: from, cap: 0, rev: fwd };
			fwd.rev = bwd;
			graph[from]!.push(fwd);
			graph[to]!.push(bwd);
		},
		flowOn(from, to, originalCap) {
			const edge = graph[from]!.find((candidate) => candidate.to === to);
			return edge ? originalCap - edge.cap : 0;
		},
		maxFlow(source, sink) {
			let totalFlow = 0;
			for (;;) {
				const parent: Array<{ node: number; edge: FlowEdge } | null> = new Array(nodeCount).fill(
					null
				);
				const visited = new Array<boolean>(nodeCount).fill(false);
				visited[source] = true;
				const queue: number[] = [source];
				let foundSink = false;

				while (queue.length > 0 && !foundSink) {
					const node = queue.shift()!;
					for (const edge of graph[node]!) {
						if (!visited[edge.to] && edge.cap > FLOW_EPSILON) {
							visited[edge.to] = true;
							parent[edge.to] = { node, edge };
							if (edge.to === sink) {
								foundSink = true;
								break;
							}
							queue.push(edge.to);
						}
					}
				}
				if (!foundSink) break;

				let bottleneck = Infinity;
				for (let curr = sink; curr !== source; ) {
					const pe = parent[curr]!;
					bottleneck = Math.min(bottleneck, pe.edge.cap);
					curr = pe.node;
				}
				for (let curr = sink; curr !== source; ) {
					const pe = parent[curr]!;
					pe.edge.cap -= bottleneck;
					pe.edge.rev.cap += bottleneck;
					curr = pe.node;
				}
				totalFlow += bottleneck;
			}
			return totalFlow;
		}
	};
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
 * Edmonds-Karp max-flow over a bipartite producer→branch network, built on
 * `createFlowNetwork`. Source feeds producers (capped by daily output),
 * producers feed the branches they can reach (uncapped), and branches feed
 * the sink (capped by demand). Returns the optimal total allocation plus
 * per-producer and per-branch flow breakdowns.
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
	const network = createFlowNetwork(producerCount + branchCount + 2);

	for (let i = 0; i < producerCount; i++) {
		network.addEdge(SOURCE, i + 1, producerCaps[i]!);
	}
	for (let i = 0; i < producerCount; i++) {
		for (const j of reachableBranchesByProducer[i]!) {
			network.addEdge(i + 1, producerCount + 1 + j, Infinity);
		}
	}
	for (let j = 0; j < branchCount; j++) {
		network.addEdge(producerCount + 1 + j, SINK, branchDemands[j]!);
	}

	const totalFlow = network.maxFlow(SOURCE, SINK);

	// Extract per-producer and per-branch flows from residual capacities.
	const producerFlows = new Array<number>(producerCount).fill(0);
	for (let i = 0; i < producerCount; i++) {
		producerFlows[i] = network.flowOn(SOURCE, i + 1, producerCaps[i]!);
	}
	const branchFlows = new Array<number>(branchCount).fill(0);
	for (let j = 0; j < branchCount; j++) {
		branchFlows[j] = network.flowOn(producerCount + 1 + j, SINK, branchDemands[j]!);
	}

	return { totalFlow, producerFlows, branchFlows };
}

/**
 * Edmonds-Karp max-flow over a 3-layer producer→processor→branch network,
 * built on `createFlowNetwork`.
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
 * branch outflow, which also distinguishes multiple processor instances
 * producing the same downstream material — a producer that can only reach
 * one of two flour mills is capped by that mill's input capacity, not the
 * full branch demand.
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
	const network = createFlowNetwork(producerCount + processorCount + branchCount + 2);

	const producerNode = (i: number) => i + 1;
	const processorNode = (k: number) => producerCount + 1 + k;
	const branchNode = (j: number) => producerCount + processorCount + 1 + j;

	for (let i = 0; i < producerCount; i++) {
		network.addEdge(SOURCE, producerNode(i), producerCaps[i]!);
	}
	for (let i = 0; i < producerCount; i++) {
		for (const processorIdx of reachableProcessorsByProducer[i]!) {
			network.addEdge(producerNode(i), processorNode(processorIdx), Infinity);
		}
	}
	for (let k = 0; k < processorCount; k++) {
		network.addEdge(processorNode(k), branchNode(processorBranchIdx[k]!), processorCaps[k]!);
	}
	for (let j = 0; j < branchCount; j++) {
		network.addEdge(branchNode(j), SINK, branchDemands[j]!);
	}

	const totalFlow = network.maxFlow(SOURCE, SINK);

	const producerFlows = new Array<number>(producerCount).fill(0);
	for (let i = 0; i < producerCount; i++) {
		producerFlows[i] = network.flowOn(SOURCE, producerNode(i), producerCaps[i]!);
	}
	const branchFlows = new Array<number>(branchCount).fill(0);
	for (let j = 0; j < branchCount; j++) {
		branchFlows[j] = network.flowOn(branchNode(j), SINK, branchDemands[j]!);
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
 * Production is prioritized over inventory via a two-phase max-flow rather
 * than edge insertion order. Edmonds–Karp chooses the shortest augmenting
 * path; adjacency order is only a tie-breaker, so adding producer source
 * edges before the inventory edge does NOT guarantee production is
 * consumed first. A generalist producer can be saturated on one branch by
 * the first augmentation, stranding a specialist producer (which can only
 * reach the now-saturated branch) and forcing the remaining branch to be
 * served by inventory — even when a different assignment would achieve the
 * same total flow with zero inventory. The two-phase approach avoids this:
 *
 *   Phase 1 — maximize production-only flow (no INVENTORY node/edges).
 *   Phase 2 — add inventory edges and continue augmenting from the
 *             production-only residual graph.
 *
 * The phase-2 increment is the minimum inventory consumption needed to
 * reach the overall max flow. This is optimal: the max production-only
 * flow F_prod is ≥ the production component P* of any combined max-flow
 * solution (F_prod is the maximum flow through producer paths alone), so
 * the minimum inventory I* = F_total − P* ≥ F_total − F_prod, and the
 * two-phase approach achieves exactly F_total − F_prod.
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
	const network = createFlowNetwork(SINK + 1);

	// Phase 1 edges: production-only (no INVENTORY node/edges).
	for (let i = 0; i < producerCount; i++) {
		network.addEdge(SOURCE, producerNode(i), allocation.producerCaps[i]! * horizonDays);
	}
	for (let i = 0; i < producerCount; i++) {
		for (const processorIdx of allocation.reachableProcessorsByProducer[i]!) {
			network.addEdge(producerNode(i), processorNode(processorIdx), Infinity);
		}
	}
	for (let k = 0; k < processorCount; k++) {
		network.addEdge(
			processorNode(k),
			branchNode(allocation.processorBranchIdx[k]!),
			allocation.processorCaps[k]! * horizonDays
		);
	}
	for (let j = 0; j < branchCount; j++) {
		network.addEdge(branchNode(j), SINK, allocation.branchDemands[j]! * horizonDays);
	}

	// Phase 1: maximize production-only flow.
	const productionOnlyFlow = network.maxFlow(SOURCE, SINK);

	// Phase 2: add inventory edges and continue augmenting from the
	// production-only residual graph. Any additional flow must route
	// through inventory (production-only augmenting paths are exhausted),
	// so the increment is the minimum inventory consumption.
	let inventoryConsumed = 0;
	if (inventoryCap > 0) {
		network.addEdge(SOURCE, INVENTORY, inventoryCap);
		for (let k = 0; k < processorCount; k++) {
			if (allocation.processorCanReachWarehouse[k]) {
				network.addEdge(INVENTORY, processorNode(k), Infinity);
			}
		}
		// Continue augmenting the same network: production-only paths are
		// exhausted, so any additional flow routes through inventory.
		inventoryConsumed = Math.max(0, network.maxFlow(SOURCE, SINK));
	}

	return {
		totalLocalSupply: productionOnlyFlow + inventoryConsumed,
		inventoryConsumed
	};
}

/**
 * Daily rate at which city inventory is consumed by the topology, derived
 * from the same two-phase flow as `localSupplyOverHorizon` but with abundant
 * inventory and a one-day horizon. The rate is the min inventory flow per
 * day when inventory is not the bottleneck, so `inventory / rate` gives the
 * true stockout day even when inventory is exhausted within a horizon (the
 * finite-horizon `inventoryConsumed` is capped at the inventory amount and
 * cannot recover the rate in that case).
 *
 * Production is prioritized over inventory via the two-phase max-flow (see
 * `localSupplyOverHorizon`): phase 1 maximizes production-only flow, phase 2
 * adds inventory. When production saturates all reachable demand the phase-2
 * increment — and thus the rate — is zero (no stockout: inventory is never
 * drawn down). The abundant inventory is chosen larger than any possible
 * daily inventory flow (total processor input capacity + total branch demand
 * + 1) so it never binds, while staying small enough for exact floating-point
 * subtraction in `localSupplyOverHorizon`.
 */
function inventoryFlowRatePerDay(allocation: BranchAllocationResult): number {
	const totalProcessorCap = allocation.processorCaps.reduce((sum, cap) => sum + cap, 0);
	const totalBranchDemand = allocation.branchDemands.reduce((sum, demand) => sum + demand, 0);
	const abundantInventory = totalProcessorCap + totalBranchDemand + 1;
	return localSupplyOverHorizon(allocation, 1, abundantInventory).inventoryConsumed;
}

/** Project a ready snapshot using only rail-usable local production capacity. */
function projectSupplySnapshotClosedForm(snapshot: SupplyPlannerSnapshot): SupplyPlannerProjection {
	const requirements = buildSupplyMaterialRequirements(snapshot);
	const usableIds = new Set(snapshot.usableBuildingIds);
	// Branch allocations computed while projecting each material, threaded
	// through primaryBottleneck so findConnectivityDeficit can reuse them
	// instead of re-running allocateCapacityByBranch.
	const allocations: Partial<Record<MaterialId, BranchAllocationResult>> = {};
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
		const { allocation, usableCapacityPerDay } = selectUsableCapacity(
			usable,
			requirement.materialId,
			materialKind,
			snapshot
		);
		if (allocation !== null) allocations[requirement.materialId] = allocation;

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

	return {
		snapshot,
		materials,
		warehouse,
		bottleneck: primaryBottleneck(snapshot, materials, warehouse, allocations),
		limitations
	};
}

/** Select the dated route-aware projection only when logistics can affect it. */
export function projectSupplySnapshot(
	snapshot: SupplyPlannerSnapshot & { logistics: SupplyPlannerLogisticsSnapshot }
): SupplyPlannerTraceProjection;
export function projectSupplySnapshot(snapshot: SupplyPlannerSnapshot): SupplyPlannerProjection;
export function projectSupplySnapshot(
	snapshot: SupplyPlannerSnapshot
): SupplyPlannerProjection | SupplyPlannerTraceProjection {
	const requirements = buildSupplyMaterialRequirements(snapshot);
	return snapshot.logistics && hasRelevantPlannerLogistics(snapshot, requirements)
		? projectSupplySnapshotWithLogistics(snapshot, requirements)
		: projectSupplySnapshotClosedForm(snapshot);
}

interface PreparedSupplyMaterial {
	requirement: SupplyMaterialRequirement;
	installed: readonly SupplyPlannerBuildingSnapshot[];
	usable: readonly SupplyPlannerBuildingSnapshot[];
	buildingLevels: readonly number[];
	inventoryUnits: number;
	accessibleInventory: number;
	installedCapacityPerDay: number;
	usableCapacityPerDay: number;
	materialKind: (typeof MATERIALS)[MaterialId]['kind'] | undefined;
	isRawOrIntermediate: boolean;
	inventoryAccessible: boolean;
	warehouseConnectedConsumerCapacity: number;
	allocation: BranchAllocationResult | null;
	useInventoryFlow: boolean;
}

interface SupplyMaterialDayStep {
	materialId: MaterialId;
	startingInventoryUnits: number;
	localAvailableUnits: number;
	importRequiredUnits: number;
	endingInventoryUnits: number;
}

interface SupplyMaterialTrace {
	localAvailableUnits: number[];
	importRequiredUnits: number[];
	endingInventoryUnits: number[];
	stockoutDay: number | null;
}

/**
 * Select the branch allocation and usable capacity for a material's usable
 * producers. Shared by {@link prepareSupplyMaterials} and
 * {@link projectSupplySnapshotClosedForm} so their no-logistics behavior is
 * identical. When per-branch reachability data is available, the 3-layer
 * max-flow caps each producer by the input capacity of the processor
 * instances it can reach. When no branch data is available but
 * warehouse-connected processors are recorded, the 3-layer flow is still used
 * (e.g. the producer is missing). Otherwise falls back to per-producer cap +
 * aggregate clamp.
 */
function selectUsableCapacity(
	usable: readonly SupplyPlannerBuildingSnapshot[],
	materialId: MaterialId,
	materialKind: MaterialKind | undefined,
	snapshot: SupplyPlannerSnapshot
): { allocation: BranchAllocationResult | null; usableCapacityPerDay: number } {
	if (materialKind !== 'finished' && snapshot.reachableBranchesByBuildingAndMaterial) {
		const hasBranchData = usable.some(
			(building) =>
				snapshot.reachableBranchesByBuildingAndMaterial?.[`${building.id}\u0000${materialId}`]
		);
		if (hasBranchData) {
			const allocation = allocateCapacityByBranch(usable, materialId, snapshot);
			return { allocation, usableCapacityPerDay: allocation.totalFlow };
		}
		if ((snapshot.warehouseConnectedProcessorsByMaterial[materialId]?.length ?? 0) > 0) {
			const allocation = allocateCapacityByBranch(usable, materialId, snapshot);
			return { allocation, usableCapacityPerDay: allocation.totalFlow };
		}
	}
	return {
		allocation: null,
		usableCapacityPerDay: perProducerCappedCapacity(usable, materialId, snapshot)
	};
}

/** Prepare all topology/capacity facts once, outside the 30-day trace. */
function prepareSupplyMaterials(
	snapshot: SupplyPlannerSnapshot,
	requirements: readonly SupplyMaterialRequirement[]
): PreparedSupplyMaterial[] {
	const usableIds = new Set(snapshot.usableBuildingIds);
	return requirements.map((requirement) => {
		const installed = requirement.producerRecipeId
			? buildingsForRecipe(snapshot.buildings, requirement.producerRecipeId)
			: [];
		const usable = installed.filter((building) => usableIds.has(building.id));
		const buildingLevels = installed
			.map((building) => building.level)
			.sort((left, right) => left - right);
		const inventoryUnits = Math.max(0, snapshot.inventory[requirement.materialId] ?? 0);
		const materialKind = MATERIALS[requirement.materialId]?.kind;
		const { allocation, usableCapacityPerDay } = selectUsableCapacity(
			usable,
			requirement.materialId,
			materialKind,
			snapshot
		);

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

		return {
			requirement,
			installed,
			usable,
			buildingLevels,
			inventoryUnits,
			accessibleInventory,
			installedCapacityPerDay: getMaterialOutputCapacityPerDay(installed, requirement.materialId),
			usableCapacityPerDay,
			materialKind,
			isRawOrIntermediate,
			inventoryAccessible,
			warehouseConnectedConsumerCapacity,
			allocation,
			useInventoryFlow
		};
	});
}

/** Project one material for one day using the prepared HPA-281 flow facts. */
function projectPreparedMaterialDay(
	prepared: PreparedSupplyMaterial,
	currentInventoryUnits: number
): SupplyMaterialDayStep {
	const startingInventoryUnits = Math.max(0, currentInventoryUnits);
	const requiredPerDay = prepared.requirement.requiredPerDay;
	let localAvailableUnits: number;
	let endingInventoryUnits: number;

	if (prepared.useInventoryFlow && prepared.allocation) {
		const flow = localSupplyOverHorizon(prepared.allocation, 1, startingInventoryUnits);
		localAvailableUnits = flow.totalLocalSupply;
		endingInventoryUnits = Math.max(0, startingInventoryUnits - flow.inventoryConsumed);
	} else if (prepared.isRawOrIntermediate) {
		const productionUnits = prepared.usableCapacityPerDay;
		const inventoryConsumed = prepared.inventoryAccessible
			? Math.min(
					startingInventoryUnits,
					prepared.warehouseConnectedConsumerCapacity,
					Math.max(0, requiredPerDay - productionUnits)
				)
			: 0;
		localAvailableUnits = Math.min(productionUnits + inventoryConsumed, requiredPerDay);
		endingInventoryUnits = Math.max(0, startingInventoryUnits - inventoryConsumed);
	} else {
		const totalAvailableUnits = startingInventoryUnits + prepared.usableCapacityPerDay;
		localAvailableUnits = totalAvailableUnits;
		endingInventoryUnits = Math.max(0, totalAvailableUnits - requiredPerDay);
	}

	return {
		materialId: prepared.requirement.materialId,
		startingInventoryUnits,
		localAvailableUnits,
		importRequiredUnits: Math.max(0, requiredPerDay - localAvailableUnits),
		endingInventoryUnits
	};
}

/**
 * An in-transit order is only valid evidence for a route's current configuration
 * when its immutable shipment semantics (origin, destination, material) still
 * match.  Editing a recurring route via {@link updateRecurringRoute} preserves
 * the route ID while allowing any of these fields to change, so a routeId-only
 * match would let a prior configuration's shipment become arrival/delivery
 * evidence for the route's new material and corrupt lead-time/frequency
 * diagnosis.  The order still arrives in the logistics trace regardless; this
 * gate only controls per-route forecast attribution.
 */
function inTransitOrderMatchesRoute(
	order: Readonly<TransferOrder>,
	route: Readonly<RecurringRoute>
): boolean {
	return (
		order.originCityId === route.originCityId &&
		order.destinationCityId === route.destinationCityId &&
		order.materialId === route.materialId
	);
}

function projectSupplySnapshotWithLogistics(
	snapshot: SupplyPlannerSnapshot,
	requirements: readonly SupplyMaterialRequirement[]
): SupplyPlannerTraceProjection {
	const logistics = snapshot.logistics;
	if (!logistics) return projectSupplySnapshotClosedForm(snapshot);

	const prepared = prepareSupplyMaterials(snapshot, requirements);
	const selectedExpectedInventory: Partial<Record<MaterialId, number>> = {
		...snapshot.inventory
	};
	const selectedIntegerInventory = {
		cityId: snapshot.supplyCityId,
		materials: Object.fromEntries(
			Object.entries(snapshot.inventory).map(([materialId, quantity]) => [
				materialId,
				canonicalQuantity(quantity ?? 0)
			])
		) as Partial<Record<MaterialId, number>>
	};
	let logisticsState: SupplyPlannerLogisticsState = createSupplyPlannerLogisticsState({
		selectedInventory: selectedIntegerInventory,
		selectedWarehouseCapacity: snapshot.warehouseCapacity,
		logistics
	});
	const requiredMaterialIds = new Set(requirements.map((requirement) => requirement.materialId));
	const traces = new Map<MaterialId, SupplyMaterialTrace>();
	const routeForecastState = new Map<
		string,
		{
			route: Readonly<RecurringRoute>;
			dispatched7: number;
			dispatched30: number;
			delivered7: number;
			delivered30: number;
			transportCost30: number;
			firstArrivalDay: number | null;
			peakUnmetNeed: number;
			firstOriginConstraintDay: number | null;
			firstDestinationConstraintDay: number | null;
			firstRouteCapacityConstraintDay: number | null;
			firstPriorityConstraintDay: number | null;
			priorityBlockedByRouteId: string | null;
			condition: SupplyPlannerRouteCondition;
		}
	>();
	for (const route of logistics.routes) {
		routeForecastState.set(route.id, {
			route,
			dispatched7: 0,
			dispatched30: 0,
			delivered7: 0,
			delivered30: 0,
			transportCost30: 0,
			firstArrivalDay: null,
			peakUnmetNeed: 0,
			firstOriginConstraintDay: null,
			firstDestinationConstraintDay: null,
			firstRouteCapacityConstraintDay: null,
			firstPriorityConstraintDay: null,
			priorityBlockedByRouteId: null,
			condition: route.state === 'paused' ? 'route-paused' : 'awaiting-dispatch'
		});
	}
	const copiedOrdersById = new Map(logistics.inTransitOrders.map((order) => [order.id, order]));
	const projectedRouteByOrderId = new Map<string, string>();
	for (const order of logistics.inTransitOrders) {
		if (order.source.kind !== 'recurring-route') continue;
		const forecast = routeForecastState.get(order.source.routeId);
		if (!forecast) continue;
		// Skip orders whose shipment semantics no longer match the current
		// route configuration (the route may have been edited in transit).
		if (!inTransitOrderMatchesRoute(order, forecast.route)) continue;
		if (forecast.firstArrivalDay === null || order.arrivalOnDay < forecast.firstArrivalDay) {
			forecast.firstArrivalDay = order.arrivalOnDay;
		}
	}
	let projectedDeliveredUnits7 = 0;
	let projectedDeliveredUnits30 = 0;
	let projectedTransportCost30 = 0;
	for (const material of prepared) {
		traces.set(material.requirement.materialId, {
			localAvailableUnits: [],
			importRequiredUnits: [],
			endingInventoryUnits: [],
			stockoutDay: null
		});
	}

	const remoteOriginConstraintRouteIds = new Set<string>();
	const horizonDays = 30;
	for (let offset = 0; offset < horizonDays; offset += 1) {
		const day = logistics.currentDay + offset;
		const arrivalResult = processSupplyPlannerTransferArrivals(logisticsState, day);
		logisticsState = arrivalResult.state;
		for (const arrival of arrivalResult.arrivals) {
			const arrivalOrder = copiedOrdersById.get(arrival.transferOrderId);
			const arrivalRouteId =
				arrivalOrder?.source.kind === 'recurring-route'
					? arrivalOrder.source.routeId
					: (projectedRouteByOrderId.get(arrival.transferOrderId) ?? null);
			const arrivalRoute = arrivalRouteId ? routeForecastState.get(arrivalRouteId) : undefined;
			// Only attribute an arrival to the current route forecast when the
			// order's shipment semantics still match the route.  A route edited
			// while the order was in transit keeps the old routeId, so a
			// routeId-only match would credit the new material/destination with
			// the old shipment.  Newly projected orders (no entry in
			// copiedOrdersById) were dispatched by the current route config, so
			// they always match.  The order still arrives in the logistics
			// trace (inventory/aggregate effects below) regardless of this gate.
			const arrivalRouteMatchesOrder =
				arrivalRoute !== undefined &&
				(arrivalOrder === undefined ||
					inTransitOrderMatchesRoute(arrivalOrder, arrivalRoute.route));
			// Track per-route delivered counts for every matching arrival so
			// outbound routes (destination ≠ supply city) also show delivered
			// units rather than a misleading 0.  The aggregate selected-chain
			// metrics below remain gated to the supply city.
			if (arrivalRouteMatchesOrder) {
				arrivalRoute!.delivered30 += arrival.quantity;
				if (offset < 7) arrivalRoute!.delivered7 += arrival.quantity;
			}
			if (arrival.destinationCityId === snapshot.supplyCityId) {
				if (requiredMaterialIds.has(arrival.materialId)) {
					projectedDeliveredUnits30 += arrival.quantity;
					if (offset < 7) projectedDeliveredUnits7 += arrival.quantity;
				}
			}
			if (arrivalRouteMatchesOrder && arrivalRoute!.firstArrivalDay === null) {
				arrivalRoute!.firstArrivalDay = day;
			}
			if (
				arrival.destinationCityId === snapshot.supplyCityId &&
				requiredMaterialIds.has(arrival.materialId)
			) {
				selectedExpectedInventory[arrival.materialId] =
					(selectedExpectedInventory[arrival.materialId] ?? 0) + arrival.quantity;
			}
		}

		for (const material of prepared) {
			const materialId = material.requirement.materialId;
			const step = projectPreparedMaterialDay(material, selectedExpectedInventory[materialId] ?? 0);
			selectedExpectedInventory[materialId] = step.endingInventoryUnits;
			const trace = traces.get(materialId)!;
			trace.localAvailableUnits.push(
				Math.min(step.localAvailableUnits, material.requirement.requiredPerDay)
			);
			trace.importRequiredUnits.push(step.importRequiredUnits);
			if (trace.stockoutDay === null && step.importRequiredUnits > 0) {
				trace.stockoutDay = offset;
			}
		}

		// Expected-value stock crosses into route arithmetic only through the
		// existing canonicalQuantity floor/safe-integer behavior.
		for (const materialId of requiredMaterialIds) {
			logisticsState.selectedIntegerInventory = {
				...logisticsState.selectedIntegerInventory,
				materials: {
					...logisticsState.selectedIntegerInventory.materials,
					[materialId]: canonicalQuantity(selectedExpectedInventory[materialId] ?? 0)
				}
			};
		}

		const dispatchResult = processSupplyPlannerRouteDispatches(logisticsState, day);
		logisticsState = dispatchResult.state;
		for (const attempt of dispatchResult.attempts) {
			projectedTransportCost30 = addProjectedTransportCost(
				projectedTransportCost30,
				attempt.transportCost
			);
			if (attempt.transferOrderId !== null) {
				projectedRouteByOrderId.set(attempt.transferOrderId, attempt.routeId);
			}
			const attemptForecast = routeForecastState.get(attempt.routeId);
			if (attemptForecast) {
				attemptForecast.transportCost30 = addProjectedTransportCost(
					attemptForecast.transportCost30,
					attempt.transportCost
				);
			}
			const isRelevantInboundRoute =
				attempt.destinationCityId === snapshot.supplyCityId &&
				requiredMaterialIds.has(attempt.materialId);
			// Populate per-route forecast fields for every modeled route, not
			// only required-material inbound routes.  The Advisor intentionally
			// displays outbound routes and unrelated-material inbound routes
			// because they affect selected-city stock/headroom, so their
			// dispatched counts, condition, and projected arrival must reflect
			// what the trace actually does rather than staying at defaults.
			if (attemptForecast) {
				attemptForecast.dispatched30 += attempt.dispatchedQuantity;
				if (offset < 7) attemptForecast.dispatched7 += attempt.dispatchedQuantity;
				attemptForecast.peakUnmetNeed = Math.max(
					attemptForecast.peakUnmetNeed,
					attempt.unmetDestinationNeed
				);
				const capacityNeed = Math.min(attempt.destinationNeed, attempt.capacity);
				const originStockConstrained =
					capacityNeed > 0 && attempt.availableOriginStock < capacityNeed;
				const routeCapacityConstrained =
					attempt.destinationNeed > attempt.capacity &&
					attempt.dispatchedQuantity === attempt.capacity &&
					!originStockConstrained;
				// Priority contention occurs through two shared resources: the
				// destination's remaining headroom and the origin's available stock.
				// An earlier-dispatched route sharing the destination can consume
				// headroom this route would have used (destinationNeed < capacity),
				// while an earlier route sharing the origin + material can consume
				// the stock this route would have received even when the two
				// destinations differ.  Detect both so the action layer can offer a
				// reprioritization; the existing candidate re-projection/value gate
				// decides whether the edit is actually worthwhile.
				const sharedDestinationBlocker =
					attempt.destinationNeed < attempt.capacity
						? dispatchResult.attempts.find((previous) => {
								const previousForecast = routeForecastState.get(previous.routeId);
								return (
									previous !== attempt &&
									previous.destinationCityId === attempt.destinationCityId &&
									previous.dispatchedQuantity > 0 &&
									previousForecast !== undefined &&
									compareRecurringRoutes(previousForecast.route, attemptForecast.route) < 0
								);
							})
						: undefined;
				const sharedOriginBlocker =
					originStockConstrained && !sharedDestinationBlocker
						? dispatchResult.attempts.find((previous) => {
								const previousForecast = routeForecastState.get(previous.routeId);
								return (
									previous !== attempt &&
									previous.originCityId === attempt.originCityId &&
									previous.materialId === attempt.materialId &&
									previous.dispatchedQuantity > 0 &&
									previousForecast !== undefined &&
									compareRecurringRoutes(previousForecast.route, attemptForecast.route) < 0
								);
							})
						: undefined;
				const priorityBlocker = sharedDestinationBlocker ?? sharedOriginBlocker;
				if (attemptForecast.firstOriginConstraintDay === null && originStockConstrained) {
					attemptForecast.firstOriginConstraintDay = day;
				}
				if (
					attemptForecast.firstDestinationConstraintDay === null &&
					attempt.destinationNeed === 0 &&
					!priorityBlocker
				) {
					attemptForecast.firstDestinationConstraintDay = day;
				}
				if (attemptForecast.firstRouteCapacityConstraintDay === null && routeCapacityConstrained) {
					attemptForecast.firstRouteCapacityConstraintDay = day;
				}
				if (attemptForecast.firstPriorityConstraintDay === null && priorityBlocker) {
					attemptForecast.firstPriorityConstraintDay = day;
					attemptForecast.priorityBlockedByRouteId = priorityBlocker.routeId;
				}
				const candidateCondition: SupplyPlannerRouteCondition = attempt.dispatchSuspended
					? 'route-event-suspended'
					: priorityBlocker
						? 'route-priority-constrained'
						: originStockConstrained
							? 'origin-stock-constrained'
							: routeCapacityConstrained
								? 'route-capacity-constrained'
								: attempt.destinationNeed === 0
									? 'destination-full'
									: 'normal';
				attemptForecast.condition = promoteSupplyPlannerRouteCondition(
					attemptForecast.condition,
					candidateCondition
				);
				if (attempt.transferOrderId) {
					// The dispatch evidence carries the effective lead time
					// whenever a lead-time adjustment was applied; the base
					// route value is the no-modifier fallback.
					const leadTimeImpact = attempt.modifierImpacts.find(
						(impact) => impact.effectKind === 'route-lead-time-adjustment'
					);
					const projectedArrivalDay =
						day + (leadTimeImpact?.effectiveLeadTimeDays ?? attemptForecast.route.leadTimeDays);
					if (
						attemptForecast.firstArrivalDay === null ||
						projectedArrivalDay < attemptForecast.firstArrivalDay
					) {
						attemptForecast.firstArrivalDay = projectedArrivalDay;
					}
				}
			}
			if (
				isRelevantInboundRoute &&
				attempt.originCityId !== snapshot.supplyCityId &&
				attempt.availableOriginStock < Math.min(attempt.destinationNeed, attempt.capacity)
			) {
				remoteOriginConstraintRouteIds.add(attempt.routeId);
			}
			if (
				attempt.originCityId === snapshot.supplyCityId &&
				requiredMaterialIds.has(attempt.materialId) &&
				attempt.dispatchedQuantity > 0
			) {
				selectedExpectedInventory[attempt.materialId] = Math.max(
					0,
					(selectedExpectedInventory[attempt.materialId] ?? 0) - attempt.dispatchedQuantity
				);
			}
		}
		for (const material of prepared) {
			const materialId = material.requirement.materialId;
			traces
				.get(materialId)!
				.endingInventoryUnits.push(Math.max(0, selectedExpectedInventory[materialId] ?? 0));
		}
	}

	const materials: SupplyMaterialProjection[] = prepared.map((material) => {
		const requirement = material.requirement;
		const trace = traces.get(requirement.materialId)!;
		const stockoutDay = trace.stockoutDay;
		const daysOfCover = stockoutDay;
		const horizon = (horizonDays: SupplyPlannerHorizonDays): SupplyMaterialHorizonProjection => {
			const localAvailableUnits = trace.localAvailableUnits
				.slice(0, horizonDays)
				.reduce((total, value) => total + value, 0);
			const importRequiredUnits = trace.importRequiredUnits
				.slice(0, horizonDays)
				.reduce((total, value) => total + value, 0);
			const endingInventoryUnits =
				trace.endingInventoryUnits[horizonDays - 1] ?? material.accessibleInventory;
			return {
				horizonDays,
				requiredUnits: requirement.requiredPerDay * horizonDays,
				startingInventoryUnits: material.accessibleInventory,
				localAvailableUnits,
				importRequiredUnits,
				endingInventoryUnits,
				daysOfCover,
				projectedStockoutDay: stockoutDay
			};
		};

		return {
			...requirement,
			buildingCount: material.installed.length,
			maxBuildingLevel: material.buildingLevels.at(-1) ?? 0,
			buildingLevels: material.buildingLevels,
			inventoryUnits: material.inventoryUnits,
			daysOfCover,
			projectedStockoutDay: stockoutDay,
			installedCapacityPerDay: material.installedCapacityPerDay,
			usableCapacityPerDay: material.usableCapacityPerDay,
			sevenDay: horizon(7),
			thirtyDay: horizon(30)
		};
	});

	const warehouse = warehouseEvidence(snapshot);
	const limitations: SupplyPlannerTraceLimitation[] = [
		{ kind: 'rail-capacity-not-modeled' },
		{ kind: 'store-sales-capacity-not-modeled' }
	];
	if (remoteOriginConstraintRouteIds.size > 0) {
		limitations.unshift({
			kind: 'remote-origin-production-not-modeled',
			routeIds: [...remoteOriginConstraintRouteIds].sort(compareCodeUnitStrings)
		});
	}

	const routeForecasts: SupplyPlannerRouteForecast[] = [...routeForecastState.values()]
		.sort((left, right) => compareCodeUnitStrings(left.route.id, right.route.id))
		.map((row) => ({
			route: row.route,
			projectedCondition: row.condition,
			projectedDispatchedUnits7: row.dispatched7,
			projectedDispatchedUnits30: row.dispatched30,
			projectedDeliveredUnits7: row.delivered7,
			projectedDeliveredUnits30: row.delivered30,
			projectedTransportCost30: row.transportCost30,
			firstProjectedArrivalDay: row.firstArrivalDay,
			peakUnmetDestinationNeed: row.peakUnmetNeed,
			firstOriginStockConstraintDay: row.firstOriginConstraintDay,
			firstDestinationCapacityConstraintDay: row.firstDestinationConstraintDay,
			firstRouteCapacityConstraintDay: row.firstRouteCapacityConstraintDay,
			firstPriorityConstraintDay: row.firstPriorityConstraintDay,
			priorityBlockedByRouteId: row.priorityBlockedByRouteId
		}));

	const preparedAllocations: Partial<Record<MaterialId, BranchAllocationResult>> = {};
	for (const material of prepared) {
		if (material.allocation) {
			preparedAllocations[material.requirement.materialId] = material.allocation;
		}
	}

	return {
		snapshot,
		materials,
		warehouse,
		bottleneck: primaryBottleneck(snapshot, materials, warehouse, preparedAllocations),
		limitations,
		logisticsMetrics: {
			projectedDeliveredUnits7,
			projectedDeliveredUnits30,
			projectedTransportCost30
		},
		routeForecasts
	};
}

function hasRelevantPlannerLogistics(
	snapshot: SupplyPlannerSnapshot,
	requirements: readonly SupplyMaterialRequirement[]
): boolean {
	const logistics = snapshot.logistics;
	if (!logistics) return false;
	const requiredMaterialIds = new Set(requirements.map((requirement) => requirement.materialId));
	const knownCityIds = new Set<WorldCityId>([
		snapshot.supplyCityId,
		...logistics.remoteCities.map((row) => row.inventory.cityId)
	]);
	const relevantRoutes = logistics.routes.filter(
		(route) =>
			requiredMaterialIds.has(route.materialId) &&
			knownCityIds.has(route.originCityId) &&
			knownCityIds.has(route.destinationCityId)
	);
	if (relevantRoutes.length > 0) return true;

	// Any inbound route to the selected supply city shares its warehouse
	// capacity with the requested materials, even when the route carries an
	// unrelated material. Keep the baseline on the dated trace whenever that
	// shared capacity (or its transport cost) can affect a candidate projection.
	if (
		logistics.routes.some(
			(route) =>
				route.destinationCityId === snapshot.supplyCityId && knownCityIds.has(route.originCityId)
		)
	) {
		return true;
	}

	return logistics.inTransitOrders.some(
		(order) =>
			requiredMaterialIds.has(order.materialId) &&
			(order.destinationCityId === snapshot.supplyCityId ||
				logistics.routes.some(
					(route) =>
						route.originCityId === order.destinationCityId && route.materialId === order.materialId
				))
	);
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
	materials: readonly SupplyMaterialProjection[],
	allocations: Partial<Record<MaterialId, BranchAllocationResult>>
): { buildingId: string; materialId: MaterialId } | null {
	const usableIds = new Set(snapshot.usableBuildingIds);

	// Compute the buildingsForRecipe/usable pair once per material — both
	// the candidate filter and the deficit scan below need it.
	const candidates = materials
		.map((material) => ({
			material,
			usable: (material.producerRecipeId
				? buildingsForRecipe(snapshot.buildings, material.producerRecipeId)
				: []
			).filter((building) => usableIds.has(building.id))
		}))
		.filter(({ material, usable }) => {
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
			return usable.some(
				(building) =>
					snapshot.reachableBranchesByBuildingAndMaterial?.[
						`${building.id}\u0000${material.materialId}`
					]
			);
		})
		.sort(
			(left, right) =>
				right.material.chainDepth - left.material.chainDepth ||
				compareCodeUnitStrings(left.material.materialId, right.material.materialId)
		);

	for (const { material, usable } of candidates) {
		// Reuse the allocation projectSupplySnapshot already computed for this
		// material; recompute defensively when it was not provided (e.g. a
		// manually constructed projection).
		const allocation =
			allocations[material.materialId] ??
			allocateCapacityByBranch(usable, material.materialId, snapshot);

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
	warehouse: SupplyWarehouseEvidence,
	allocations: Partial<Record<MaterialId, BranchAllocationResult>>
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
	const connectivityDeficit = findConnectivityDeficit(snapshot, materials, allocations);
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
	productId: ProductId
): SupplyDemandContributor | null {
	const stores = game.stores
		.filter(
			(store) =>
				store.cityId === city.id &&
				store.products.some((product) => product.productId === productId)
		)
		.sort((left, right) => compareCodeUnitStrings(left.id, right.id));
	if (stores.length === 0) return null;

	const potentialDemandPerDay = buildCityDemandPools(game, city)[productId] ?? 0;
	let targetUnits = 0;
	let weightedImportCost = 0;
	const fallbackImportCosts: number[] = [];

	for (const store of stores) {
		const product = store.products.find((item) => item.productId === productId);
		if (!product) continue;
		const productDefinition = getProductDefinition(productId);
		targetUnits += product.targetStock;
		weightedImportCost += product.targetStock * productDefinition.importCost;
		fallbackImportCosts.push(productDefinition.importCost);
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
		typeof request.productId === 'string' &&
		request.productId.length > 0
	);
}

function compareCodeUnitStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function addProjectedTransportCost(current: number, addition: number): number {
	const total = current + addition;
	if (!Number.isSafeInteger(total)) {
		throw new RangeError('Projected transport cost exceeds the safe integer range');
	}
	return total;
}
