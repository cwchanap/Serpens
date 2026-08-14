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
	getBuildingAttachCellKeys,
	getFootprintAdjacentCoords,
	railCellKey
} from './rail';
import { findReachableRailCells } from './railPlacement';
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

interface PlacementTile {
	tile: { id: string; x: number; y: number };
	railReady: boolean;
	canFutureConnectToSink: boolean;
	/** Sorted sink building IDs reachable from this tile via future rail. */
	reachableSinkIds: readonly string[];
}

interface PlacementChoice {
	feasibility: SupplyBuildFeasibility;
	validTile: { id: string; x: number; y: number } | null;
	railReadyTile: { id: string; x: number; y: number } | null;
	/**
	 * Whether a future rail path can be built from the valid placement tile
	 * to at least one usable sink building for the target material. Unlike
	 * the old `hasRailConnectedSink` check (which required the sink to
	 * already have adjacent rail), this mirrors the real rail builder and
	 * routes through empty legal tiles, so it correctly identifies
	 * connectability even when no rail currently touches either building.
	 */
	canFutureConnectToSink: boolean;
	/**
	 * One representative tile per distinct reachable-sink set. Each entry
	 * describes a placement class — tiles that can reach the same set of
	 * sink buildings via future rail. The planner evaluates each class and
	 * selects the one with the strongest projection, rather than stopping
	 * at the first rail-ready tile. When this list is non-empty, it
	 * supersedes the single `validTile`/`railReadyTile` fields.
	 */
	representativeTiles: readonly PlacementTile[];
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

	const scopedGame: GameState = { ...clone(game), activeIndustryCityId: snapshot.supplyCityId };

	const missing = missingProducerMaterials(snapshot);
	if (missing.length > 0) {
		const selectedMaterial = missing[0]!.materialId;
		// Structural-chain exception: bypass rail gating only when the
		// selected material has no usable downstream sink because its
		// downstream processing stage is missing. A missing sibling
		// producer must not make the selected material structural — each
		// material is evaluated against its own downstream sink state.
		const sinkIds = snapshot.usableSinkBuildingIdsByMaterial[selectedMaterial] ?? [];
		const structuralChainIncomplete = sinkIds.length === 0;
		const generated = producerCandidates(
			scopedGame,
			snapshot,
			baseline,
			availability,
			selectedMaterial,
			structuralChainIncomplete
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
		const generated = warehouseCandidates(scopedGame, snapshot, baseline, availability);
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
	const generated = producerCandidates(
		scopedGame,
		snapshot,
		baseline,
		availability,
		targetMaterialId
	);
	const upgrades = upgradeCandidates(
		scopedGame,
		snapshot,
		baseline,
		availability,
		targetMaterialId
	);
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
	const unresolvedUnknownRoi = alternatives.filter(
		(candidate) =>
			candidate.comparison.requiresRailConnection &&
			!candidate.comparison.requiresAdditionalProducerBuilds &&
			candidate.comparison.netCashBenefit30 === null &&
			candidate.comparison.preRailNetCashBenefit30 === null
	);
	if (unresolvedUnknownRoi.length > 0) {
		const ranked = sortCandidates(unresolvedUnknownRoi);
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
	materialId: MaterialId,
	structuralChainIncomplete = false
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
	let railBlocked = false;
	const allowedPlacements = availability.allowedIndustrialPlacements ?? null;
	const isFinished = MATERIALS[materialId]?.kind === 'finished';
	const canBuildRail = availability.canBuildRail;
	for (const buildingType of allowedTypes) {
		const placement = findPlacementChoice(
			game,
			snapshot,
			materialId,
			buildingType.id,
			allowedPlacements
		);
		if (!placement.validTile) continue;

		// Evaluate one representative tile per distinct reachable-sink set
		// and pick the candidate with the strongest projection. This
		// prevents the planner from stopping at the first rail-ready tile
		// when a different placement class reaches an under-served branch.
		const allTiles =
			placement.representativeTiles.length > 0
				? placement.representativeTiles
				: [
						{
							tile: placement.railReadyTile ?? placement.validTile,
							railReady: placement.railReadyTile !== null,
							canFutureConnectToSink: placement.canFutureConnectToSink,
							reachableSinkIds: []
						}
					];
		// Exclude placements that are neither rail-ready nor able to
		// connect to a usable downstream sink in the future. A producer
		// that can never be connected is not an actionable recommendation
		// — even when rail construction is available, building a producer
		// on a tile with no future rail route to any sink wastes capital.
		//
		// Exception: when the chain is structurally incomplete (the
		// selected material has no usable downstream sink because its
		// downstream processing stage is missing), no placement can be
		// rail-ready yet because there is no sink to connect to. The
		// upstream build is still a valid structural prerequisite —
		// whether new rail will eventually be needed cannot be determined
		// until the downstream building exists. Skip the filter in that
		// case so the planner can still recommend the next prerequisite
		// build.
		const tilesToEvaluate = allTiles.filter((tile) => {
			if (tile.railReady) return true;
			if (structuralChainIncomplete) return true;
			// Not rail-ready, not structural
			if (!tile.canFutureConnectToSink) {
				// No feasible rail path to any sink — this placement is
				// impossible regardless of rail availability. Don't set
				// railBlocked (which would yield 'action-unavailable');
				// the caller should see 'no-feasible-action' instead.
				return false;
			}
			// Can future-connect but not rail-ready — only actionable if
			// rail construction is available.
			if (!canBuildRail) {
				railBlocked = true;
				return false;
			}
			return true;
		});
		if (tilesToEvaluate.length === 0) continue;

		let bestCandidate: SupplyPlannerCandidate | null = null;
		for (const placementTile of tilesToEvaluate) {
			const context = addSyntheticProducer(
				game,
				snapshot,
				buildingType,
				placementTile.tile,
				placementTile.railReady
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
			if (isFinished && placementTile.canFutureConnectToSink) {
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
			const requiresRailConnection = !placementTile.railReady;
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
			const candidate: SupplyPlannerCandidate = {
				action,
				baseline,
				projection: normalProjection,
				potentialProjectionAfterRail: requiresRailConnection ? potentialProjection : undefined,
				comparison,
				affordable: game.cash >= buildingType.buildCost,
				feasible: true
			};
			if (bestCandidate === null || compareCandidates(candidate, bestCandidate) < 0) {
				bestCandidate = candidate;
			}
		}
		if (bestCandidate) candidates.push(bestCandidate);
	}
	return {
		candidates,
		reason: candidates.length === 0 && railBlocked ? 'action-unavailable' : 'no-feasible-action',
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
	const candidateGame: GameState = {
		...game,
		industrialBuildings: [
			...game.industrialBuildings,
			createSyntheticBuilding(candidateId, buildingType.id, tile, snapshot.supplyCityId)
		]
	};
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
	candidateSnapshot.reachableBranchesByBuildingAndMaterial =
		reachability.reachableBranchesByBuildingAndMaterial;
	candidateSnapshot.reachableProcessorsByBuildingAndMaterial =
		reachability.reachableProcessorsByBuildingAndMaterial;
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
		canFutureConnectToSink: false,
		representativeTiles: []
	};
	// The game is already scoped by makePlan; for external callers
	// (getBuildFeasibility), a shallow copy ensures the right city is active.
	const scopedGame =
		game.activeIndustryCityId === snapshot.supplyCityId
			? game
			: { ...game, activeIndustryCityId: snapshot.supplyCityId };
	const city = scopedGame.industryCities.find((row) => row.id === snapshot.supplyCityId);
	if (!city) return noPlacement;
	const placement = createIndustrialPlacementContext(scopedGame);
	if (!placement) return noPlacement;
	const network = buildRailNetwork(city);
	const budget = createRailBudget(network);
	const sinkIds = snapshot.usableSinkBuildingIdsByMaterial[materialId] ?? [];
	const sinkAttachById = new Map<string, string[]>();
	for (const id of sinkIds) {
		const sink = scopedGame.industrialBuildings.find((building) => building.id === id);
		if (sink) {
			const cells = getBuildingAttachCellKeys(network, sink);
			if (cells.length > 0) sinkAttachById.set(id, cells);
		}
	}
	const sinkAttach = sinkIds.flatMap((id) => sinkAttachById.get(id) ?? []);
	// Pre-compute per-sink footprint-adjacent coords (unfiltered — includes
	// cells that don't currently have rail) for the future rail path check.
	const sinkAdjacentById = new Map<string, { x: number; y: number }[]>();
	for (const id of sinkIds) {
		const sink = scopedGame.industrialBuildings.find((building) => building.id === id);
		if (sink) sinkAdjacentById.set(id, getFootprintAdjacentCoords(sink));
	}

	// Do one BFS per sink to find all cells reachable via future rail from
	// that sink's footprint-adjacent coords. This avoids O(tiles * sinks)
	// pathfinding calls — each BFS explores the grid once, and we look up
	// per-tile reachability by checking if any of the tile's adjacent cells
	// are in the sink's reachable set.
	const sinkReachableKeys = new Map<string, Set<string>>();
	for (const sinkId of sinkIds) {
		const sinkAdjacent = sinkAdjacentById.get(sinkId);
		if (!sinkAdjacent || sinkAdjacent.length === 0) continue;
		sinkReachableKeys.set(sinkId, findReachableRailCells(scopedGame, city.id, sinkAdjacent));
	}

	let validTile: PlacementChoice['validTile'] = null;
	let railReadyTile: PlacementChoice['railReadyTile'] = null;

	// Collect all valid placement tiles with their rail-ready status,
	// current reachable sinks, and future reachable-sink set, then group
	// by both current and future sink sets to pick one representative per
	// distinct placement class. Including current sink identity prevents
	// tiles that currently connect to different sinks from collapsing
	// into one group when they share the same future reachability.
	const tileEntries: {
		coordinate: { id: string; x: number; y: number; mapX: number; mapY: number };
		railReady: boolean;
		currentSinkIds: string[];
		reachableSinkIds: string[];
	}[] = [];

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

		const currentSinkIds: string[] = [];
		let railReady = false;
		if (sinkAttach.length > 0) {
			const attach = getBuildingAttachCellKeys(network, coordinate);
			if (attach.length > 0 && findShippingPath(network, budget, attach, sinkAttach)) {
				railReady = true;
				railReadyTile ??= coordinate;
				for (const [sinkId, sinkCells] of sinkAttachById) {
					if (findShippingPath(network, budget, attach, sinkCells)) {
						currentSinkIds.push(sinkId);
					}
				}
			}
		}
		currentSinkIds.sort(compareCodeUnits);

		// Compute the reachable-sink set for this tile by checking which
		// sinks' reachable cell sets include any of this tile's adjacent
		// cells. This uses the pre-computed per-sink BFS results.
		const reachableSinkIds: string[] = [];
		if (sinkIds.length > 0) {
			const tileAdjacent = getFootprintAdjacentCoords({
				mapX: coordinate.x,
				mapY: coordinate.y
			});
			const tileAdjacentKeys = new Set(tileAdjacent.map((c) => railCellKey(c.x, c.y)));
			for (const sinkId of sinkIds) {
				const reachable = sinkReachableKeys.get(sinkId);
				if (!reachable) continue;
				for (const key of tileAdjacentKeys) {
					if (reachable.has(key)) {
						reachableSinkIds.push(sinkId);
						break;
					}
				}
			}
		}
		reachableSinkIds.sort(compareCodeUnits);

		tileEntries.push({ coordinate, railReady, currentSinkIds, reachableSinkIds });
	}

	if (tileEntries.length === 0) {
		return {
			feasibility: {
				hasValidPlacement: false,
				hasRailReadyPlacement: false
			},
			validTile: null,
			railReadyTile: null,
			canFutureConnectToSink: false,
			representativeTiles: []
		};
	}

	// Group by current + future reachable-sink set and pick one
	// representative per group. Prefer rail-ready tiles, then first by
	// tile ID for determinism.
	const groups = new Map<string, typeof tileEntries>();
	for (const entry of tileEntries) {
		const key = `${entry.currentSinkIds.join(',')}|${entry.reachableSinkIds.join(',')}`;
		const group = groups.get(key) ?? [];
		group.push(entry);
		groups.set(key, group);
	}

	const representativeTiles: PlacementTile[] = [];
	for (const [, group] of [...groups.entries()].sort((a, b) => compareCodeUnits(a[0], b[0]))) {
		// Prefer rail-ready, then first by tile ID.
		const best = group.sort((a, b) => {
			if (a.railReady !== b.railReady) return a.railReady ? -1 : 1;
			return compareCodeUnits(a.coordinate.id, b.coordinate.id);
		})[0]!;
		representativeTiles.push({
			tile: {
				id: best.coordinate.id,
				x: best.coordinate.x,
				y: best.coordinate.y
			},
			railReady: best.railReady,
			canFutureConnectToSink: best.reachableSinkIds.length > 0,
			reachableSinkIds: best.reachableSinkIds
		});
	}

	// Compute canFutureConnectToSink for the first valid tile (backward
	// compatibility for the field on PlacementChoice).
	const firstEntry = tileEntries[0]!;
	const canFutureConnectToSink = firstEntry.reachableSinkIds.length > 0;

	return {
		feasibility: {
			hasValidPlacement: validTile !== null,
			hasRailReadyPlacement: railReadyTile !== null
		},
		validTile,
		railReadyTile,
		canFutureConnectToSink,
		representativeTiles
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
	return [...candidates].sort((left, right) => compareCandidates(left, right));
}

/**
 * Viability tier for a candidate, matching the priority order used by
 * `chooseProducerPlan`'s final ranking. Higher tier = higher priority.
 *
 * 4 — positive complete: netCashBenefit30 > 0 (rail-ready, profitable)
 * 3 — positive pre-rail: preRailNetCashBenefit30 > 0 (future-rail, profitable pre-rail)
 * 2 — unresolved unknown: requires rail, no additional builds, ROI unknown
 * 1 — known non-positive / structural: everything else
 *
 * Using these tiers in `compareCandidates` (instead of completeness-first)
 * ensures the per-building-type placement selection doesn't discard a
 * viable unknown-ROI rail candidate in favor of a known-negative
 * rail-ready candidate.
 */
function viabilityTier(candidate: SupplyPlannerCandidate): number {
	const {
		netCashBenefit30,
		preRailNetCashBenefit30,
		requiresRailConnection,
		requiresAdditionalProducerBuilds
	} = candidate.comparison;
	if (netCashBenefit30 !== null && netCashBenefit30 > 0) return 4;
	if (netCashBenefit30 === null && preRailNetCashBenefit30 !== null && preRailNetCashBenefit30 > 0)
		return 3;
	if (
		netCashBenefit30 === null &&
		preRailNetCashBenefit30 === null &&
		requiresRailConnection &&
		!requiresAdditionalProducerBuilds
	)
		return 2;
	return 1;
}

/**
 * Returns negative if `left` ranks higher than `right`, positive if `right`
 * ranks higher, and 0 if they are tied. Used by `sortCandidates` for the
 * final ranking and by `producerCandidates` to pick the best placement
 * tile for a given building type.
 *
 * Ranks by viability tier first (positive complete → positive pre-rail →
 * unresolved unknown → known non-positive), then by benefit within tier,
 * then by secondary criteria. This keeps the per-type selection
 * consistent with `chooseProducerPlan`'s final ranking.
 */
function compareCandidates(left: SupplyPlannerCandidate, right: SupplyPlannerCandidate): number {
	const leftTier = viabilityTier(left);
	const rightTier = viabilityTier(right);
	const leftBenefit =
		left.comparison.netCashBenefit30 ?? left.comparison.preRailNetCashBenefit30 ?? -Infinity;
	const rightBenefit =
		right.comparison.netCashBenefit30 ?? right.comparison.preRailNetCashBenefit30 ?? -Infinity;
	return (
		rightTier - leftTier ||
		rightBenefit - leftBenefit ||
		right.comparison.shortageReduction30 - left.comparison.shortageReduction30 ||
		right.comparison.shortageReduction7 - left.comparison.shortageReduction7 ||
		right.comparison.importReduction30 - left.comparison.importReduction30 ||
		right.comparison.stockoutImprovementDays - left.comparison.stockoutImprovementDays ||
		actionCost(left.action) - actionCost(right.action) ||
		compareCodeUnits(actionKey(left.action), actionKey(right.action))
	);
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
