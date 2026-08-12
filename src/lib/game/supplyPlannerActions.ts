import {
	createIndustrialPlacementContext,
	getIndustrialPlacementBlockReasonWithContext
} from './industryPlacement';
import { INDUSTRIAL_BUILDING_TYPES, MATERIALS, PRODUCTION_RECIPES } from './industry';
import {
	buildingTypesForRecipe,
	buildingsForRecipe,
	getRecipeThroughputUnits,
	MATERIAL_PRODUCER_RECIPES
} from './productChainGraph';
import {
	buildRailNetwork,
	createRailBudget,
	findShippingPath,
	getBuildingAttachCellKeys
} from './rail';
import { canUpgradeBuilding, getBuildingUpgradeCost } from './leveling';
import {
	buildRequiredChainReachability,
	buildSupplyPlannerSnapshot,
	projectSupplySnapshot
} from './supplyPlanner';
import type {
	SupplyMaterialProjection,
	SupplyPlannerBuildingSnapshot,
	SupplyPlannerProjection,
	SupplyPlannerRequest,
	SupplyPlannerSnapshot,
	SupplyPlannerSnapshotResult,
	SupplyBottleneck
} from './supplyPlanner';
import type {
	GameState,
	IndustrialBuilding,
	IndustrialBuildingType,
	IndustrialBuildingTypeId,
	MaterialId,
	ProductionRecipeId
} from './types';

export interface SupplyPlannerActionAvailability {
	canBuildIndustry: boolean;
	canUpgradeIndustry: boolean;
	canBuildRail: boolean;
	allowedIndustryBuildingTypeIds: readonly IndustrialBuildingTypeId[];
	/**
	 * Encoded `${cityId}\u0000${tileId}\u0000${buildingTypeId}` keys for
	 * placements the scenario permits. When null/undefined (sandbox), the
	 * planner scans every geometrically valid tile. In scenario mode this
	 * restricts candidate feasibility to tiles the real placement UI would
	 * accept, preventing the planner from recommending a build that cannot
	 * commit.
	 */
	allowedIndustrialPlacements?: ReadonlySet<string> | null;
}

export interface SupplyBuildFeasibility {
	hasValidPlacement: boolean;
	hasRailReadyPlacement: boolean;
}

export type SupplyPlannerAction =
	| {
			kind: 'build-producer';
			materialId: MaterialId;
			buildingTypeId: IndustrialBuildingTypeId;
			cost: number;
	  }
	| {
			kind: 'upgrade-building';
			materialId: MaterialId;
			buildingId: string;
			buildingTypeId: IndustrialBuildingTypeId;
			fromLevel: number;
			toLevel: number;
			cost: number;
	  }
	| { kind: 'build-warehouse'; buildingTypeId: 'warehouse'; cost: number }
	| { kind: 'connect-rail'; buildingId: string; materialId: MaterialId }
	| {
			kind: 'none';
			reason:
				| 'no-demand'
				| 'surplus'
				| 'unaffordable'
				| 'ineffective'
				| 'no-feasible-action'
				| 'action-unavailable'
				| 'logistics-contention-not-modeled';
	  };

export type SupplyPlannerNoopReason = Extract<SupplyPlannerAction, { kind: 'none' }>['reason'];

export interface SupplyPlannerComparison {
	shortageReduction7: number;
	shortageReduction30: number;
	importReduction30: number;
	importSpendReduction30: number;
	incrementalOperatingCost30: number;
	incrementalInputImportSpend30: number;
	preRailNetCashBenefit30: number | null;
	netCashBenefit30: number | null;
	requiresRailConnection: boolean;
	requiresAdditionalProducerBuilds: boolean;
	stockoutImprovementDays: number;
	warehouseFreeGain: number;
}

export interface SupplyPlannerProjectionTotals {
	shortageUnits7: number;
	shortageUnits30: number;
	importUnits30: number;
	importSpend30: number;
}

export type SupplyPlanProjection = SupplyPlannerProjection & {
	totals: SupplyPlannerProjectionTotals;
};

export interface SupplyPlannerCandidate {
	action: SupplyPlannerAction;
	baseline: SupplyPlanProjection;
	projection: SupplyPlanProjection;
	comparison: SupplyPlannerComparison;
	affordable: boolean;
	feasible: boolean;
	potentialProjectionAfterRail?: SupplyPlanProjection;
}

export interface SupplyPlan {
	snapshot: SupplyPlannerSnapshot;
	baseline: SupplyPlanProjection;
	recommendation: SupplyPlannerCandidate;
	alternatives: readonly SupplyPlannerCandidate[];
}

export type SupplyPlannerResult =
	| { status: 'ready'; plan: SupplyPlan }
	| Exclude<SupplyPlannerSnapshotResult, { status: 'ready' }>;

interface PlacementChoice {
	feasibility: SupplyBuildFeasibility;
	validTile: { id: string; x: number; y: number } | null;
	railReadyTile: { id: string; x: number; y: number } | null;
	/**
	 * Whether at least one usable sink building for the target material has
	 * rail attach cells. For finished materials, this means a warehouse is
	 * rail-connected, so a future rail connection from the candidate could
	 * actually deliver to it.
	 */
	hasRailConnectedSink: boolean;
}

const ZERO_COMPARISON: SupplyPlannerComparison = {
	shortageReduction7: 0,
	shortageReduction30: 0,
	importReduction30: 0,
	importSpendReduction30: 0,
	incrementalOperatingCost30: 0,
	incrementalInputImportSpend30: 0,
	preRailNetCashBenefit30: null,
	netCashBenefit30: null,
	requiresRailConnection: false,
	requiresAdditionalProducerBuilds: false,
	stockoutImprovementDays: 0,
	warehouseFreeGain: 0
};

/** Build the actionable plan for a requested retail category. */
export function buildSupplyPlan(
	game: GameState,
	request: SupplyPlannerRequest,
	availability: SupplyPlannerActionAvailability
): SupplyPlannerResult {
	const snapshotResult = buildSupplyPlannerSnapshot(game, request);
	if (snapshotResult.status !== 'ready') return snapshotResult;

	const snapshot = clone(snapshotResult.snapshot);
	const baseline = withTotals(projectSupplySnapshot(snapshot));
	return { status: 'ready', plan: makePlan(game, snapshot, baseline, availability) };
}

/** Return the current placement/rail facts without mutating the game. */
export function getBuildFeasibility(
	game: GameState,
	snapshot: SupplyPlannerSnapshot,
	materialId: MaterialId,
	buildingTypeId: IndustrialBuildingTypeId,
	allowedPlacements?: ReadonlySet<string> | null
): SupplyBuildFeasibility {
	return findPlacementChoice(game, snapshot, materialId, buildingTypeId, allowedPlacements)
		.feasibility;
}

/** Encode a scenario placement key for the allowedIndustrialPlacements set. */
export function encodeIndustrialPlacementKey(
	cityId: string,
	tileId: string,
	buildingTypeId: string
): string {
	return `${cityId}\u0000${tileId}\u0000${buildingTypeId}`;
}

function makePlan(
	game: GameState,
	snapshot: SupplyPlannerSnapshot,
	baseline: SupplyPlanProjection,
	availability: SupplyPlannerActionAvailability
): SupplyPlan {
	if (snapshot.activeOutboundRouteIds.length > 0) {
		return planWithNoop(snapshot, baseline, 'logistics-contention-not-modeled');
	}
	if (snapshot.demandPerDay <= 0) return planWithNoop(snapshot, baseline, 'no-demand');

	const missing = missingProducerMaterials(snapshot);
	if (missing.length > 0) {
		const generated = producerCandidates(
			game,
			snapshot,
			baseline,
			availability,
			missing[0]!.materialId
		);
		return chooseProducerPlan(snapshot, baseline, generated, true);
	}
	if (baseline.bottleneck.kind === 'rail-disconnected') {
		if (!availability.canBuildRail) return planWithNoop(snapshot, baseline, 'action-unavailable');
		const action: SupplyPlannerAction = {
			kind: 'connect-rail',
			buildingId: baseline.bottleneck.buildingId,
			materialId: baseline.bottleneck.materialId
		};
		const candidate = unchangedCandidate(baseline, action, {
			...ZERO_COMPARISON,
			requiresRailConnection: true
		});
		return { snapshot, baseline, recommendation: candidate, alternatives: [candidate] };
	}

	if (baseline.bottleneck.kind === 'warehouse-capacity') {
		const generated = warehouseCandidates(game, snapshot, baseline, availability);
		if (generated.candidates.length === 0)
			return planWithNoop(snapshot, baseline, generated.reason);
		const affordable = generated.candidates.filter((candidate) => candidate.affordable);
		if (affordable.length === 0) return planWithNoop(snapshot, baseline, 'unaffordable');
		const alternatives = sortCandidates(affordable);
		return { snapshot, baseline, recommendation: alternatives[0]!, alternatives };
	}

	if (baseline.bottleneck.kind === 'none') return planWithNoop(snapshot, baseline, 'surplus');
	const targetMaterialId = bottleneckMaterialId(baseline.bottleneck);
	if (!targetMaterialId) return planWithNoop(snapshot, baseline, 'surplus');
	const generated = producerCandidates(game, snapshot, baseline, availability, targetMaterialId);
	const upgrades = upgradeCandidates(game, snapshot, baseline, availability, targetMaterialId);
	generated.candidates.push(...upgrades.candidates);
	if (generated.candidates.length === 0) {
		const reason =
			generated.reason === 'action-unavailable' && upgrades.reason === 'action-unavailable'
				? 'action-unavailable'
				: generated.reason === 'no-feasible-action' || upgrades.reason === 'no-feasible-action'
					? 'no-feasible-action'
					: generated.reason;
		return planWithNoop(snapshot, baseline, reason);
	}
	return chooseProducerPlan(snapshot, baseline, generated, false);
}

function chooseProducerPlan(
	snapshot: SupplyPlannerSnapshot,
	baseline: SupplyPlanProjection,
	generated: GeneratedCandidates,
	structural: boolean
): SupplyPlan {
	if (generated.candidates.length === 0) return planWithNoop(snapshot, baseline, generated.reason);
	const affordable = generated.candidates.filter((candidate) => candidate.affordable);
	if (affordable.length === 0) return planWithNoop(snapshot, baseline, 'unaffordable');
	const alternatives = sortCandidates(affordable);
	if (structural && generated.hasAdditionalProducerBuilds) {
		return { snapshot, baseline, recommendation: alternatives[0]!, alternatives };
	}
	const positiveComplete = alternatives.filter(
		(candidate) =>
			candidate.comparison.netCashBenefit30 !== null &&
			(candidate.comparison.netCashBenefit30 ?? 0) > 0
	);
	if (positiveComplete.length > 0) {
		const ranked = sortCandidates(positiveComplete);
		return { snapshot, baseline, recommendation: ranked[0]!, alternatives };
	}
	const positivePreRail = alternatives.filter(
		(candidate) =>
			candidate.comparison.netCashBenefit30 === null &&
			(candidate.comparison.preRailNetCashBenefit30 ?? 0) > 0
	);
	if (positivePreRail.length > 0) {
		const ranked = sortCandidates(positivePreRail);
		return { snapshot, baseline, recommendation: ranked[0]!, alternatives };
	}
	return planWithNoop(snapshot, baseline, 'ineffective', alternatives);
}

interface GeneratedCandidates {
	candidates: SupplyPlannerCandidate[];
	reason: 'action-unavailable' | 'no-feasible-action' | 'unaffordable';
	hasAdditionalProducerBuilds: boolean;
}

function producerCandidates(
	game: GameState,
	snapshot: SupplyPlannerSnapshot,
	baseline: SupplyPlanProjection,
	availability: SupplyPlannerActionAvailability,
	materialId: MaterialId
): GeneratedCandidates {
	const recipeId = getProducerRecipeId(materialId);
	if (!recipeId || !availability.canBuildIndustry) {
		return { candidates: [], reason: 'action-unavailable', hasAdditionalProducerBuilds: false };
	}
	const buildingTypes = buildingTypesForRecipe(recipeId).sort((left, right) =>
		compareCodeUnits(left.id, right.id)
	);
	const allowedTypes = buildingTypes.filter((type) =>
		availability.allowedIndustryBuildingTypeIds.includes(type.id)
	);
	if (allowedTypes.length === 0) {
		return { candidates: [], reason: 'action-unavailable', hasAdditionalProducerBuilds: false };
	}
	const candidates: SupplyPlannerCandidate[] = [];
	let hasAdditionalProducerBuilds = false;
	const allowedPlacements = availability.allowedIndustrialPlacements ?? null;
	for (const buildingType of allowedTypes) {
		const placement = findPlacementChoice(
			game,
			snapshot,
			materialId,
			buildingType.id,
			allowedPlacements
		);
		if (!placement.validTile) continue;
		const chosenTile = placement.railReadyTile ?? placement.validTile;
		const context = addSyntheticProducer(
			game,
			snapshot,
			buildingType,
			chosenTile!,
			placement.railReadyTile !== null
		);
		const normalProjection = withTotals(projectSupplySnapshot(context.candidateSnapshot));
		const potentialSnapshot = clone(context.candidateSnapshot);
		potentialSnapshot.usableBuildingIds = uniqueSorted([
			...potentialSnapshot.usableBuildingIds,
			context.candidateId
		]);
		potentialSnapshot.disconnectedBuildingIds = potentialSnapshot.disconnectedBuildingIds.filter(
			(id) => id !== context.candidateId
		);
		// The potential snapshot simulates the state where the new producer's
		// rail connection is built, so the producer is marked usable. For
		// finished materials, connecting the producer to a warehouse would
		// make the full demand reachable, so the candidate's reachable demand
		// cap is unlocked to the full demand. For non-finished materials, the
		// downstream branches the future rail would reach are ambiguous, so
		// the reachability caps from the real computation are preserved (the
		// candidate's cap stays at 0) and the pre-rail ROI is left unknown
		// rather than forced to zero.
		const isFinished = MATERIALS[materialId]?.kind === 'finished';
		if (isFinished && placement.hasRailConnectedSink) {
			const key = `${context.candidateId}\u0000${materialId}`;
			potentialSnapshot.reachableDemandByBuildingAndMaterial = {
				...potentialSnapshot.reachableDemandByBuildingAndMaterial,
				[key]: snapshot.demandPerDay
			};
			potentialSnapshot.reachableDemandByMaterial = {
				...potentialSnapshot.reachableDemandByMaterial,
				[materialId]: Math.max(
					potentialSnapshot.reachableDemandByMaterial[materialId] ?? 0,
					snapshot.demandPerDay
				)
			};
		}
		const potentialProjection = withTotals(projectSupplySnapshot(potentialSnapshot));
		const requiresRailConnection = placement.railReadyTile === null;
		const additional = hasAdditionalMissingProducers(normalProjection);
		hasAdditionalProducerBuilds ||= additional;
		const action: SupplyPlannerAction = {
			kind: 'build-producer',
			materialId,
			buildingTypeId: buildingType.id,
			cost: buildingType.buildCost
		};
		const preRailRoiUnknown = requiresRailConnection && !isFinished;
		const comparison = compareCandidate(
			snapshot,
			baseline,
			normalProjection,
			requiresRailConnection ? potentialProjection : normalProjection,
			action,
			requiresRailConnection,
			additional,
			preRailRoiUnknown
		);
		candidates.push({
			action,
			baseline,
			projection: normalProjection,
			potentialProjectionAfterRail: requiresRailConnection ? potentialProjection : undefined,
			comparison,
			affordable: game.cash >= buildingType.buildCost,
			feasible: true
		});
	}
	return {
		candidates,
		reason: 'no-feasible-action',
		hasAdditionalProducerBuilds
	};
}

function upgradeCandidates(
	game: GameState,
	snapshot: SupplyPlannerSnapshot,
	baseline: SupplyPlanProjection,
	availability: SupplyPlannerActionAvailability,
	materialId: MaterialId
): GeneratedCandidates {
	if (!availability.canUpgradeIndustry) {
		return { candidates: [], reason: 'action-unavailable', hasAdditionalProducerBuilds: false };
	}
	const recipeId = getProducerRecipeId(materialId);
	if (!recipeId)
		return { candidates: [], reason: 'action-unavailable', hasAdditionalProducerBuilds: false };

	const candidates: SupplyPlannerCandidate[] = [];
	const rows = snapshot.buildings
		.filter(
			(building) =>
				buildingsForRecipe([building], recipeId).length > 0 &&
				snapshot.usableBuildingIds.includes(building.id) &&
				canUpgradeBuilding(building.level)
		)
		.sort((left, right) => compareCodeUnits(left.id, right.id));
	for (const row of rows) {
		const buildingType = INDUSTRIAL_BUILDING_TYPES[row.typeId];
		if (!buildingType || buildingType.recipeId !== recipeId) continue;
		const cost = getBuildingUpgradeCost(row.level);
		const candidateSnapshot = clone(snapshot);
		candidateSnapshot.buildings = candidateSnapshot.buildings.map((building) =>
			building.id === row.id ? { ...building, level: building.level + 1 } : building
		);
		const candidateProjection = withTotals(projectSupplySnapshot(candidateSnapshot));
		const action: SupplyPlannerAction = {
			kind: 'upgrade-building',
			materialId,
			buildingId: row.id,
			buildingTypeId: row.typeId,
			fromLevel: row.level,
			toLevel: row.level + 1,
			cost
		};
		const comparison = compareCandidate(
			snapshot,
			baseline,
			candidateProjection,
			candidateProjection,
			action,
			false,
			hasAdditionalMissingProducers(candidateProjection)
		);
		candidates.push({
			action,
			baseline,
			projection: candidateProjection,
			comparison,
			affordable: game.cash >= cost,
			feasible: true
		});
	}
	return {
		candidates,
		reason: candidates.length > 0 ? 'no-feasible-action' : 'action-unavailable',
		hasAdditionalProducerBuilds: candidates.some(
			(candidate) => candidate.comparison.requiresAdditionalProducerBuilds
		)
	};
}

function warehouseCandidates(
	game: GameState,
	snapshot: SupplyPlannerSnapshot,
	baseline: SupplyPlanProjection,
	availability: SupplyPlannerActionAvailability
): {
	candidates: SupplyPlannerCandidate[];
	reason: 'action-unavailable' | 'no-feasible-action' | 'unaffordable';
} {
	if (
		!availability.canBuildIndustry ||
		!availability.allowedIndustryBuildingTypeIds.includes('warehouse')
	) {
		return { candidates: [], reason: 'action-unavailable' };
	}
	const buildingType = INDUSTRIAL_BUILDING_TYPES.warehouse;
	const placement = findPlacementChoice(
		game,
		snapshot,
		snapshot.finishedMaterialId,
		'warehouse',
		availability.allowedIndustrialPlacements ?? null
	);
	if (!placement.validTile) return { candidates: [], reason: 'no-feasible-action' };
	const candidateId = nextCandidateId(snapshot.buildings, 'warehouse');
	const candidateSnapshot = clone(snapshot);
	candidateSnapshot.buildings = [
		...candidateSnapshot.buildings,
		{ id: candidateId, cityId: snapshot.supplyCityId, typeId: 'warehouse', level: 1 }
	];
	candidateSnapshot.warehouseCapacity += buildingType.warehouseCapacity;
	const candidateProjection = withTotals(projectSupplySnapshot(candidateSnapshot));
	const action: SupplyPlannerAction = {
		kind: 'build-warehouse',
		buildingTypeId: 'warehouse',
		cost: buildingType.buildCost
	};
	const comparison = compareCandidate(
		snapshot,
		baseline,
		candidateProjection,
		candidateProjection,
		action,
		false,
		false
	);
	return {
		candidates: [
			{
				action,
				baseline,
				projection: candidateProjection,
				comparison,
				affordable: game.cash >= buildingType.buildCost,
				feasible: true
			}
		],
		reason: game.cash >= buildingType.buildCost ? 'no-feasible-action' : 'unaffordable'
	};
}

function compareCandidate(
	snapshot: SupplyPlannerSnapshot,
	baseline: SupplyPlanProjection,
	projection: SupplyPlanProjection,
	economicsProjection: SupplyPlanProjection,
	action: SupplyPlannerAction,
	requiresRailConnection: boolean,
	requiresAdditionalProducerBuilds: boolean,
	preRailRoiUnknown: boolean = false
): SupplyPlannerComparison {
	const shortageReduction7 = Math.max(
		0,
		baseline.totals.shortageUnits7 - projection.totals.shortageUnits7
	);
	const shortageReduction30 = Math.max(
		0,
		baseline.totals.shortageUnits30 - projection.totals.shortageUnits30
	);
	const warehouseFreeGain = Math.max(
		0,
		projection.warehouse.freeCapacity - baseline.warehouse.freeCapacity
	);
	const base: SupplyPlannerComparison = {
		...ZERO_COMPARISON,
		shortageReduction7,
		shortageReduction30,
		warehouseFreeGain,
		requiresRailConnection,
		requiresAdditionalProducerBuilds
	};

	if (action.kind !== 'build-producer' && action.kind !== 'upgrade-building') return base;
	const baselineTarget = materialRow(baseline, action.materialId);
	const candidateTarget = materialRow(economicsProjection, action.materialId);
	if (!baselineTarget || !candidateTarget) return base;

	const projectedImportReduction30 = Math.max(
		0,
		baselineTarget.thirtyDay.importRequiredUnits - candidateTarget.thirtyDay.importRequiredUnits
	);
	const avoidedImportUnitValue =
		action.materialId === snapshot.finishedMaterialId
			? snapshot.finishedImportCostPerUnit
			: (MATERIALS[action.materialId]?.importCost ?? 0);
	const importReduction30 = requiresAdditionalProducerBuilds ? 0 : projectedImportReduction30;
	const importSpendReduction30 = importReduction30 * avoidedImportUnitValue;
	const recipeId = getProducerRecipeId(action.materialId);
	const recipe = recipeId ? PRODUCTION_RECIPES[recipeId] : null;
	const baselineThroughput = recipeId
		? getRecipeThroughputUnits(buildingsForRecipe(snapshot.buildings, recipeId), recipeId)
		: 0;
	const candidateThroughput = recipeId
		? getRecipeThroughputUnits(
				buildingsForRecipe(economicsProjection.snapshot.buildings, recipeId),
				recipeId
			)
		: 0;
	const throughputDelta = Math.max(0, candidateThroughput - baselineThroughput);
	const incrementalRecipeOperatingCost30 = recipe ? throughputDelta * recipe.operatingCost * 30 : 0;
	const buildingType = INDUSTRIAL_BUILDING_TYPES[action.buildingTypeId];
	const incrementalFlatOperatingCost30 =
		action.kind === 'build-producer' ? buildingType.dailyOperatingCost * 30 : 0;
	const incrementalInputImportSpend30 = recipe
		? recipe.inputs.reduce((sum, input) => {
				const baselineInput = baseline.materials.find((row) => row.materialId === input.materialId);
				if (!baselineInput || baselineInput.thirtyDay.requiredUnits <= 0) return sum;
				const importShare = Math.min(
					1,
					baselineInput.thirtyDay.importRequiredUnits / baselineInput.thirtyDay.requiredUnits
				);
				const extraUnits = input.quantity * throughputDelta * 30;
				return sum + extraUnits * importShare * (MATERIALS[input.materialId]?.importCost ?? 0);
			}, 0)
		: 0;
	const incrementalOperatingCost30 =
		incrementalRecipeOperatingCost30 + incrementalFlatOperatingCost30;
	const preRailNetCashBenefit30 =
		requiresAdditionalProducerBuilds || preRailRoiUnknown
			? null
			: importSpendReduction30 -
				action.cost -
				incrementalOperatingCost30 -
				incrementalInputImportSpend30;
	const stockoutImprovementDays = improvementDays(
		baselineTarget.thirtyDay.projectedStockoutDay,
		candidateTarget.thirtyDay.projectedStockoutDay
	);

	return {
		...base,
		importReduction30,
		importSpendReduction30,
		incrementalOperatingCost30,
		incrementalInputImportSpend30,
		preRailNetCashBenefit30,
		netCashBenefit30: requiresRailConnection ? null : preRailNetCashBenefit30,
		stockoutImprovementDays
	};
}

function addSyntheticProducer(
	game: GameState,
	snapshot: SupplyPlannerSnapshot,
	buildingType: IndustrialBuildingType,
	tile: { id: string; x: number; y: number },
	preferRailReady: boolean
): {
	candidateSnapshot: SupplyPlannerSnapshot;
	candidateId: string;
} {
	const candidateId = nextCandidateId(snapshot.buildings, buildingType.id);
	const candidateSnapshot = clone(snapshot);
	const synthetic: SupplyPlannerBuildingSnapshot = {
		id: candidateId,
		cityId: snapshot.supplyCityId,
		typeId: buildingType.id,
		level: 1
	};
	candidateSnapshot.buildings = [...candidateSnapshot.buildings, synthetic];
	const candidateGame = clone(game);
	candidateGame.activeIndustryCityId = snapshot.supplyCityId;
	candidateGame.industrialBuildings = [
		...candidateGame.industrialBuildings,
		createSyntheticBuilding(candidateId, buildingType.id, tile, snapshot.supplyCityId)
	];
	const reachability = buildRequiredChainReachability(
		candidateGame,
		candidateSnapshot,
		candidateGame.industrialBuildings
	);
	candidateSnapshot.usableBuildingIds = uniqueSorted([...reachability.usableBuildingIds]);
	candidateSnapshot.disconnectedBuildingIds = reachability.disconnectedBuildingIds;
	candidateSnapshot.usableSinkBuildingIdsByMaterial = reachability.usableSinkBuildingIdsByMaterial;
	candidateSnapshot.reachableDemandByMaterial = reachability.reachableDemandByMaterial;
	candidateSnapshot.reachableDemandByBuildingAndMaterial =
		reachability.reachableDemandByBuildingAndMaterial;
	if (!preferRailReady) {
		candidateSnapshot.usableBuildingIds = candidateSnapshot.usableBuildingIds.filter(
			(id) => id !== candidateId
		);
		candidateSnapshot.disconnectedBuildingIds = uniqueSorted([
			...candidateSnapshot.disconnectedBuildingIds,
			candidateId
		]);
	}
	return { candidateSnapshot, candidateId };
}

function findPlacementChoice(
	game: GameState,
	snapshot: SupplyPlannerSnapshot,
	materialId: MaterialId,
	buildingTypeId: IndustrialBuildingTypeId,
	allowedPlacements?: ReadonlySet<string> | null
): PlacementChoice {
	const noPlacement: PlacementChoice = {
		feasibility: { hasValidPlacement: false, hasRailReadyPlacement: false },
		validTile: null,
		railReadyTile: null,
		hasRailConnectedSink: false
	};
	const scopedGame = { ...clone(game), activeIndustryCityId: snapshot.supplyCityId };
	const city = scopedGame.industryCities.find((row) => row.id === snapshot.supplyCityId);
	if (!city) return noPlacement;
	const placement = createIndustrialPlacementContext(scopedGame);
	if (!placement) return noPlacement;
	const network = buildRailNetwork(city);
	const budget = createRailBudget(network);
	const sinkIds = snapshot.usableSinkBuildingIdsByMaterial[materialId] ?? [];
	const sinkAttach = sinkIds.flatMap((id) => {
		const sink = scopedGame.industrialBuildings.find((building) => building.id === id);
		return sink ? getBuildingAttachCellKeys(network, sink) : [];
	});
	let validTile: PlacementChoice['validTile'] = null;
	let railReadyTile: PlacementChoice['railReadyTile'] = null;
	for (const tile of city.tiles) {
		if (getIndustrialPlacementBlockReasonWithContext(placement, tile.id, buildingTypeId)) continue;
		if (
			allowedPlacements &&
			!allowedPlacements.has(
				encodeIndustrialPlacementKey(snapshot.supplyCityId, tile.id, buildingTypeId)
			)
		)
			continue;
		const coordinate = { id: tile.id, x: tile.x, y: tile.y, mapX: tile.x, mapY: tile.y };
		validTile ??= coordinate;
		if (!railReadyTile && sinkAttach.length > 0) {
			const attach = getBuildingAttachCellKeys(network, coordinate);
			if (findShippingPath(network, budget, attach, sinkAttach)) railReadyTile = coordinate;
		}
		if (validTile && railReadyTile) break;
	}
	return {
		feasibility: {
			hasValidPlacement: validTile !== null,
			hasRailReadyPlacement: railReadyTile !== null
		},
		validTile,
		railReadyTile,
		hasRailConnectedSink: sinkAttach.length > 0
	};
}

function createSyntheticBuilding(
	id: string,
	typeId: IndustrialBuildingTypeId,
	tile: { id: string; x: number; y: number },
	cityId: string
): IndustrialBuilding {
	return {
		id,
		typeId,
		level: 1,
		cityId,
		tileId: tile.id,
		mapX: tile.x,
		mapY: tile.y,
		status: 'idle',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {}
	};
}

function withTotals(projection: SupplyPlannerProjection): SupplyPlanProjection {
	return { ...projection, totals: projectionTotals(projection) };
}

function projectionTotals(projection: SupplyPlannerProjection): SupplyPlannerProjectionTotals {
	const shortageUnits7 = projection.materials.reduce(
		(total, row) => total + row.sevenDay.importRequiredUnits,
		0
	);
	const shortageUnits30 = projection.materials.reduce(
		(total, row) => total + row.thirtyDay.importRequiredUnits,
		0
	);
	return {
		shortageUnits7,
		shortageUnits30,
		importUnits30: shortageUnits30,
		importSpend30: projection.materials.reduce(
			(total, row) =>
				total +
				row.thirtyDay.importRequiredUnits *
					(row.materialId === projection.snapshot.finishedMaterialId
						? projection.snapshot.finishedImportCostPerUnit
						: (MATERIALS[row.materialId]?.importCost ?? 0)),
			0
		)
	};
}

function planWithNoop(
	snapshot: SupplyPlannerSnapshot,
	baseline: SupplyPlanProjection,
	reason: SupplyPlannerNoopReason,
	alternatives: readonly SupplyPlannerCandidate[] = []
): SupplyPlan {
	const action: SupplyPlannerAction = { kind: 'none', reason };
	const recommendation = unchangedCandidate(baseline, action, ZERO_COMPARISON);
	return { snapshot, baseline, recommendation, alternatives };
}

function unchangedCandidate(
	baseline: SupplyPlanProjection,
	action: SupplyPlannerAction,
	comparison: SupplyPlannerComparison
): SupplyPlannerCandidate {
	return {
		action,
		baseline,
		projection: baseline,
		comparison,
		affordable: true,
		feasible: true
	};
}

function sortCandidates(candidates: readonly SupplyPlannerCandidate[]): SupplyPlannerCandidate[] {
	return [...candidates].sort((left, right) => {
		const leftComplete = left.comparison.netCashBenefit30 !== null ? 1 : 0;
		const rightComplete = right.comparison.netCashBenefit30 !== null ? 1 : 0;
		const leftBenefit =
			left.comparison.netCashBenefit30 ?? left.comparison.preRailNetCashBenefit30 ?? -Infinity;
		const rightBenefit =
			right.comparison.netCashBenefit30 ?? right.comparison.preRailNetCashBenefit30 ?? -Infinity;
		return (
			rightComplete - leftComplete ||
			rightBenefit - leftBenefit ||
			right.comparison.shortageReduction30 - left.comparison.shortageReduction30 ||
			right.comparison.shortageReduction7 - left.comparison.shortageReduction7 ||
			right.comparison.importReduction30 - left.comparison.importReduction30 ||
			right.comparison.stockoutImprovementDays - left.comparison.stockoutImprovementDays ||
			actionCost(left.action) - actionCost(right.action) ||
			compareCodeUnits(actionKey(left.action), actionKey(right.action))
		);
	});
}

function actionCost(action: SupplyPlannerAction): number {
	return 'cost' in action ? action.cost : 0;
}

export function actionKey(action: SupplyPlannerAction): string {
	switch (action.kind) {
		case 'build-producer':
			return `build-producer:${action.materialId}:${action.buildingTypeId}`;
		case 'upgrade-building':
			return `upgrade-building:${action.materialId}:${action.buildingId}`;
		case 'build-warehouse':
			return 'build-warehouse';
		case 'connect-rail':
			return `connect-rail:${action.materialId}:${action.buildingId}`;
		case 'none':
			return `none:${action.reason}`;
	}
}

function missingProducerMaterials(snapshot: SupplyPlannerSnapshot): SupplyMaterialProjection[] {
	const projection = projectSupplySnapshot(snapshot);
	return projection.materials
		.filter(
			(row) => row.requiredPerDay > 0 && row.producerRecipeId !== null && row.buildingCount === 0
		)
		.sort(
			(left, right) =>
				right.chainDepth - left.chainDepth || compareCodeUnits(left.materialId, right.materialId)
		);
}

function hasAdditionalMissingProducers(projection: SupplyPlanProjection): boolean {
	return projection.materials.some(
		(row) => row.requiredPerDay > 0 && row.producerRecipeId !== null && row.buildingCount === 0
	);
}

function bottleneckMaterialId(bottleneck: SupplyBottleneck): MaterialId | null {
	return 'materialId' in bottleneck ? bottleneck.materialId : null;
}

function materialRow(
	projection: SupplyPlanProjection,
	materialId: MaterialId
): SupplyMaterialProjection | undefined {
	return projection.materials.find((row) => row.materialId === materialId);
}

function improvementDays(before: number | null, after: number | null): number {
	if (before === null) return 0;
	if (after === null) return Math.max(0, 30 - (before ?? 0));
	return Math.max(0, after - before);
}

function getProducerRecipeId(materialId: MaterialId): ProductionRecipeId | null {
	return MATERIAL_PRODUCER_RECIPES.get(materialId) ?? null;
}

function nextCandidateId(
	buildings: readonly SupplyPlannerBuildingSnapshot[],
	typeId: string
): string {
	const prefix = `supply-planner-${typeId}`;
	const existing = new Set(buildings.map((building) => building.id));
	let index = 1;
	let id = `${prefix}-${index}`;
	while (existing.has(id)) {
		index += 1;
		id = `${prefix}-${index}`;
	}
	return id;
}

function uniqueSorted(ids: readonly string[]): string[] {
	return [...new Set(ids)].sort(compareCodeUnits);
}

function compareCodeUnits(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function clone<T>(value: T): T {
	return structuredClone(value);
}
