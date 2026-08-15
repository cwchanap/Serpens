import {
	createIndustrialPlacementContext,
	getIndustrialPlacementBlockReasonWithContext
} from './industryPlacement';
import { INDUSTRIAL_BUILDING_TYPES, MATERIALS, PRODUCTION_RECIPES } from './industry';
import {
	compareRecurringRoutes,
	quoteInterCityRates,
	type RecurringRouteInput
} from './interCityLogistics';
import {
	buildingTypesForRecipe,
	buildingsForRecipe,
	getRecipeThroughputUnits,
	getSupportedStoreChainCategories,
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
	buildRailReachabilityBase,
	buildRequiredChainReachability,
	buildSupplyMaterialRequirements,
	buildSupplyPlannerSnapshot,
	projectSupplySnapshot,
	type RailReachabilityBase,
	type RequiredChainReachability,
	type SupplyLogisticsBottleneck
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
	ProductionRecipeId,
	RecurringRoute,
	WorldCityId
} from './types';
import { getFinishedMaterialIdForCategory } from './stock';

export interface SupplyPlannerActionAvailability {
	canBuildIndustry: boolean;
	canUpgradeIndustry: boolean;
	canBuildRail: boolean;
	canManageLogistics: boolean;
	canSetRetailSupplySource: boolean;
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
	| {
			kind: 'build-warehouse';
			cityId: WorldCityId;
			buildingTypeId: 'warehouse';
			cost: number;
	  }
	| { kind: 'connect-rail'; buildingId: string; materialId: MaterialId }
	| { kind: 'create-route'; input: RecurringRouteInput }
	| {
			kind: 'edit-route';
			routeId: string;
			field: 'capacity' | 'frequencyDays' | 'priority';
			from: number;
			to: number;
	  }
	| { kind: 'resume-route'; routeId: string }
	| {
			kind: 'change-supply-source';
			retailCityId: WorldCityId;
			fromSupplyCityId: WorldCityId;
			toSupplyCityId: WorldCityId;
	  }
	| {
			kind: 'none';
			reason:
				| 'no-demand'
				| 'surplus'
				| 'unaffordable'
				| 'ineffective'
				| 'no-feasible-action'
				| 'action-unavailable';
	  };

export type SupplyPlannerNoopReason = Extract<SupplyPlannerAction, { kind: 'none' }>['reason'];

export interface SupplyPlannerComparison {
	shortageReduction7: number;
	shortageReduction30: number;
	importReduction30: number;
	importSpendReduction30: number;
	projectedDeliveredUnits7: number;
	projectedDeliveredUnits30: number;
	incrementalTransportCost30: number;
	firstShortageImprovementDays: number;
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
	logisticsCause?: SupplyLogisticsBottleneck;
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
	warehouseFreeGain: 0,
	projectedDeliveredUnits7: 0,
	projectedDeliveredUnits30: 0,
	incrementalTransportCost30: 0,
	firstShortageImprovementDays: 0
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
	if (snapshot.demandPerDay <= 0) return planWithNoop(snapshot, baseline, 'no-demand');

	const scopedGame: GameState = { ...clone(game), activeIndustryCityId: snapshot.supplyCityId };

	const missing = missingProducerMaterials(snapshot);
	if (missing.length > 0) {
		const selectedMaterial = missing[0]!.materialId;
		// Structural-chain exception: bypass rail gating only when the
		// selected material's downstream processing stage is genuinely
		// absent (no installed building consumes it). An installed-but-
		// rail-disconnected downstream processor must NOT trigger the
		// exception — the chain is not structurally incomplete, the
		// producer is merely disconnected, and building the upstream
		// producer cannot become useful while rail construction is
		// unavailable. `usableSinkBuildingIdsByMaterial` cannot be used
		// here: it omits installed processors that are rail-disconnected,
		// so an empty sink list conflates "stage missing" with "stage
		// installed but disconnected".
		const structuralChainIncomplete = isStructuralChainIncomplete(snapshot, selectedMaterial);
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

	const logisticsCause = diagnoseLogistics(snapshot, baseline);
	if (logisticsCause) {
		const logisticsPlan = makeBoundedLogisticsPlan(
			game,
			snapshot,
			baseline,
			availability,
			logisticsCause
		);
		if (logisticsPlan) return logisticsPlan;
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

/** Diagnose only the first actionable logistics blocker for the current ladder. */
function diagnoseLogistics(
	snapshot: SupplyPlannerSnapshot,
	baseline: SupplyPlanProjection
): SupplyLogisticsBottleneck | null {
	const logistics = snapshot.logistics;
	if (!logistics) return null;
	const shortageRows = baseline.materials
		.filter((row) => row.requiredPerDay > 0 && row.thirtyDay.importRequiredUnits > 0)
		.sort(
			(left, right) =>
				right.chainDepth - left.chainDepth || compareCodeUnits(left.materialId, right.materialId)
		);
	if (shortageRows.length === 0) return null;

	const requiredMaterialIds = new Set(shortageRows.map((row) => row.materialId));
	const inboundRoutes = logistics.routes
		.filter(
			(route) =>
				requiredMaterialIds.has(route.materialId) &&
				route.destinationCityId === snapshot.supplyCityId
		)
		.sort(compareRecurringRoutes);
	const forecasts = new Map(
		(baseline.routeForecasts ?? []).map((forecast) => [forecast.route.id, forecast])
	);

	const paused = inboundRoutes.find((route) => route.state === 'paused');
	if (paused) {
		return {
			kind: 'route-paused',
			routeId: paused.id,
			cityId: snapshot.supplyCityId,
			materialId: paused.materialId,
			day: logistics.currentDay,
			blockedUnits: Math.max(
				1,
				Math.ceil(
					baseline.materials.find((row) => row.materialId === paused.materialId)?.requiredPerDay ??
						1
				)
			),
			amount: Math.max(
				1,
				Math.ceil(
					baseline.materials.find((row) => row.materialId === paused.materialId)?.requiredPerDay ??
						1
				)
			)
		};
	}

	const reservedUnits = logistics.inTransitOrders.reduce(
		(total, order) =>
			order.status === 'in-transit' && order.destinationCityId === snapshot.supplyCityId
				? total + order.quantity
				: total,
		0
	);
	const destinationFree = Math.max(
		0,
		snapshot.warehouseCapacity - snapshot.warehouseUsed - reservedUnits
	);
	if (destinationFree <= 0) {
		const route = inboundRoutes.find((candidate) => candidate.state === 'active');
		if (route) {
			return {
				kind: 'destination-full',
				routeId: route.id,
				cityId: snapshot.supplyCityId,
				materialId: route.materialId,
				day: logistics.currentDay,
				blockedUnits: Math.max(1, route.capacity),
				amount: Math.max(1, route.capacity)
			};
		}
	}

	for (const route of inboundRoutes) {
		if (route.state !== 'active') continue;
		const forecast = forecasts.get(route.id);
		if (!forecast?.priorityBlockedByRouteId || forecast.firstPriorityConstraintDay === null) {
			continue;
		}
		const blocker = inboundRoutes.find(
			(candidate) => candidate.id === forecast.priorityBlockedByRouteId
		);
		if (!blocker || blocker.priority <= 0 || blocker.priority >= route.priority) continue;
		return {
			kind: 'route-priority-constrained',
			routeId: route.id,
			blockingRouteId: blocker.id,
			cityId: snapshot.supplyCityId,
			materialId: route.materialId,
			day: forecast.firstPriorityConstraintDay,
			blockedUnits: Math.max(1, route.capacity),
			amount: Math.max(1, route.capacity)
		};
	}

	for (const route of inboundRoutes) {
		if (route.state !== 'active' || route.originCityId === snapshot.supplyCityId) continue;
		const forecast = forecasts.get(route.id);
		if (forecast?.firstOriginStockConstraintDay === null || forecast === undefined) continue;
		const origin = logistics.remoteCities.find(
			(city) => city.inventory.cityId === route.originCityId
		);
		const availableStock = Math.max(0, origin?.inventory.materials[route.materialId] ?? 0);
		const deficitUnits = Math.max(0, Math.min(route.capacity, route.capacity) - availableStock);
		return {
			kind: 'origin-stock-constrained',
			routeId: route.id,
			cityId: snapshot.supplyCityId,
			materialId: route.materialId,
			day: forecast.firstOriginStockConstraintDay,
			deficitUnits,
			amount: Math.max(1, deficitUnits)
		};
	}

	for (const route of inboundRoutes) {
		if (route.state !== 'active') continue;
		const forecast = forecasts.get(route.id);
		if (
			forecast?.firstRouteCapacityConstraintDay !== null &&
			forecast?.firstRouteCapacityConstraintDay !== undefined
		) {
			return {
				kind: 'route-capacity-constrained',
				routeId: route.id,
				cityId: snapshot.supplyCityId,
				materialId: route.materialId,
				day: forecast.firstRouteCapacityConstraintDay,
				unmetUnits: forecast.peakUnmetDestinationNeed,
				amount: Math.max(1, forecast.peakUnmetDestinationNeed)
			};
		}
	}

	const stockedRemoteRow = shortageRows.find((row) =>
		logistics.remoteCities.some((city) => (city.inventory.materials[row.materialId] ?? 0) >= 1)
	);
	const primaryRow = stockedRemoteRow ?? shortageRows[0]!;
	const stockoutDay = primaryRow.thirtyDay.projectedStockoutDay;
	if (stockoutDay !== null) {
		for (const route of inboundRoutes) {
			if (route.state !== 'active') continue;
			const forecast = forecasts.get(route.id);
			const firstArrivalDay =
				forecast?.firstProjectedArrivalDay ??
				Math.max(logistics.currentDay, route.nextDispatchOnDay) + route.leadTimeDays;
			const firstArrivalOffset = firstArrivalDay - logistics.currentDay;
			if (firstArrivalOffset > stockoutDay) {
				return {
					kind: 'route-lead-time',
					routeId: route.id,
					cityId: snapshot.supplyCityId,
					materialId: route.materialId,
					day: logistics.currentDay + stockoutDay,
					stockoutDay,
					firstArrivalDay,
					amount: Math.max(1, Math.ceil(primaryRow.requiredPerDay))
				};
			}
			const nextArrivalDay = firstArrivalDay + route.frequencyDays;
			if (route.frequencyDays > 1 && nextArrivalDay - logistics.currentDay > stockoutDay) {
				return {
					kind: 'route-frequency',
					routeId: route.id,
					cityId: snapshot.supplyCityId,
					materialId: route.materialId,
					day: logistics.currentDay + stockoutDay,
					stockoutDay,
					nextArrivalDay,
					amount: Math.max(1, Math.ceil(primaryRow.requiredPerDay))
				};
			}
		}
	}

	const usefulInbound = inboundRoutes.some((route) => {
		const forecast = forecasts.get(route.id);
		return route.state === 'active' && (forecast?.projectedDeliveredUnits30 ?? 0) > 0;
	});
	if (!usefulInbound) {
		const stockedRemote = logistics.remoteCities.some((city) =>
			shortageRows.some((row) => (city.inventory.materials[row.materialId] ?? 0) >= 1)
		);
		if (stockedRemote) {
			return {
				kind: 'destination-configuration',
				retailCityId: snapshot.retailCityId,
				supplyCityId: snapshot.supplyCityId,
				materialId: primaryRow.materialId,
				day: logistics.currentDay,
				amount: Math.max(1, Math.ceil(primaryRow.requiredPerDay))
			};
		}
	}

	return null;
}

function makeBoundedLogisticsPlan(
	game: GameState,
	snapshot: SupplyPlannerSnapshot,
	baseline: SupplyPlanProjection,
	availability: SupplyPlannerActionAvailability,
	cause: SupplyLogisticsBottleneck
): SupplyPlan | null {
	if (cause.kind === 'destination-full') {
		const generated = warehouseCandidates(
			{ ...clone(game), activeIndustryCityId: snapshot.supplyCityId },
			snapshot,
			baseline,
			availability
		);
		const candidate = generated.candidates.find(
			(row) => row.affordable && row.feasible && row.comparison.warehouseFreeGain > 0
		);
		if (!candidate) return null;
		const withCause = { ...candidate, logisticsCause: cause };
		return { snapshot, baseline, recommendation: withCause, alternatives: [withCause] };
	}
	if (!availability.canManageLogistics) return null;

	const generated: SupplyPlannerCandidate[] = [];
	const route =
		'routeId' in cause
			? snapshot.logistics?.routes.find((row) => row.id === cause.routeId)
			: undefined;
	if (
		(cause.kind === 'route-paused' ||
			cause.kind === 'route-capacity-constrained' ||
			cause.kind === 'route-priority-constrained' ||
			cause.kind === 'route-frequency') &&
		route
	) {
		let action: SupplyPlannerAction | null = null;
		let candidateRoute: RecurringRoute | null = null;
		if (cause.kind === 'route-paused') {
			action = { kind: 'resume-route', routeId: route.id };
			candidateRoute = { ...route, state: 'active' };
		} else if (cause.kind === 'route-capacity-constrained') {
			const to = Math.max(route.capacity + 1, Math.ceil(route.capacity + cause.unmetUnits));
			if (Number.isSafeInteger(to)) {
				action = {
					kind: 'edit-route',
					routeId: route.id,
					field: 'capacity',
					from: route.capacity,
					to
				};
				candidateRoute = { ...route, capacity: to };
			}
		} else if (cause.kind === 'route-priority-constrained') {
			const blocker = snapshot.logistics?.routes.find((row) => row.id === cause.blockingRouteId);
			if (blocker && route.priority > 0) {
				const to = Math.max(0, blocker.priority - 1);
				if (to < route.priority) {
					action = {
						kind: 'edit-route',
						routeId: route.id,
						field: 'priority',
						from: route.priority,
						to
					};
					candidateRoute = { ...route, priority: to };
				}
			}
		} else if (cause.kind === 'route-frequency') {
			const to = Math.max(1, route.frequencyDays - 1);
			if (to < route.frequencyDays) {
				action = {
					kind: 'edit-route',
					routeId: route.id,
					field: 'frequencyDays',
					from: route.frequencyDays,
					to
				};
				candidateRoute = { ...route, frequencyDays: to };
			}
		}
		if (action && candidateRoute) {
			const candidateSnapshot = routeCandidateSnapshot(snapshot, candidateRoute);
			if (candidateSnapshot) {
				generated.push(
					makeLogisticsCandidate(snapshot, baseline, candidateSnapshot, action, cause)
				);
			}
		}
	}

	if (cause.kind === 'destination-configuration') {
		generated.push(
			...createRouteCandidates(snapshot, baseline, cause, availability.canManageLogistics === true)
		);
		if (availability.canSetRetailSupplySource === true) {
			generated.push(...supplySourceCandidates(game, snapshot, baseline, cause));
		}
	}

	const worthwhile = generated.filter(
		(candidate) =>
			candidate.comparison.shortageReduction30 > 0 &&
			candidate.comparison.netCashBenefit30 !== null &&
			candidate.comparison.netCashBenefit30 > 0
	);
	if (worthwhile.length === 0) return null;
	const alternatives = sortCandidates(worthwhile).map((candidate) => candidate);
	return {
		snapshot,
		baseline,
		recommendation: alternatives[0]!,
		alternatives
	};
}

function routeCandidateSnapshot(
	snapshot: SupplyPlannerSnapshot,
	route: RecurringRoute
): { snapshot: SupplyPlannerSnapshot; projection: SupplyPlanProjection } | null {
	if (!snapshot.logistics) return null;
	const candidateSnapshot = clone(snapshot);
	candidateSnapshot.logistics = {
		...snapshot.logistics,
		routes: snapshot.logistics.routes.map((current) =>
			current.id === route.id ? { ...route } : current
		)
	};
	return {
		snapshot: candidateSnapshot,
		projection: withTotals(projectSupplySnapshot(candidateSnapshot))
	};
}

function makeLogisticsCandidate(
	snapshot: SupplyPlannerSnapshot,
	baseline: SupplyPlanProjection,
	candidate: { snapshot: SupplyPlannerSnapshot; projection: SupplyPlanProjection },
	action: SupplyPlannerAction,
	logisticsCause: SupplyLogisticsBottleneck
): SupplyPlannerCandidate {
	const comparison = compareCandidate(
		snapshot,
		baseline,
		candidate.projection,
		candidate.projection,
		action,
		false,
		false
	);
	return {
		action,
		baseline,
		projection: candidate.projection,
		comparison,
		affordable: true,
		feasible: true,
		logisticsCause
	};
}

function createRouteCandidates(
	snapshot: SupplyPlannerSnapshot,
	baseline: SupplyPlanProjection,
	cause: Extract<SupplyLogisticsBottleneck, { kind: 'destination-configuration' }>,
	canManageLogistics: boolean
): SupplyPlannerCandidate[] {
	if (!canManageLogistics || !snapshot.logistics) return [];
	const shortageRow = baseline.materials.find((row) => row.materialId === cause.materialId);
	if (!shortageRow) return [];
	const peakDailyImportNeed = Math.max(
		0,
		shortageRow.requiredPerDay - shortageRow.usableCapacityPerDay
	);
	const candidates: SupplyPlannerCandidate[] = [];
	for (const remote of [...snapshot.logistics.remoteCities].sort((left, right) =>
		compareCodeUnits(left.inventory.cityId, right.inventory.cityId)
	)) {
		if (remote.inventory.cityId === snapshot.supplyCityId) continue;
		const availableWholeOriginStock = Math.floor(remote.inventory.materials[cause.materialId] ?? 0);
		const capacity = Math.min(Math.ceil(peakDailyImportNeed), availableWholeOriginStock);
		if (!Number.isSafeInteger(capacity) || capacity < 1) continue;
		const quote = quoteInterCityRates(remote.inventory.cityId, snapshot.supplyCityId);
		if (!quote) continue;
		const input: RecurringRouteInput = {
			originCityId: remote.inventory.cityId,
			destinationCityId: snapshot.supplyCityId,
			materialId: cause.materialId,
			capacity,
			frequencyDays: 1,
			leadTimeDays: quote.leadTimeDays,
			transportCostPerUnit: quote.transportCostPerUnit,
			priority: 0
		};
		const route: RecurringRoute = {
			id: `route-${snapshot.logistics.nextRouteSequence}`,
			...input,
			state: 'active',
			nextDispatchOnDay: snapshot.logistics.currentDay
		};
		const candidateSnapshot = clone(snapshot);
		candidateSnapshot.logistics = {
			...snapshot.logistics,
			routes: [...snapshot.logistics.routes, route]
		};
		const projection = withTotals(projectSupplySnapshot(candidateSnapshot));
		candidates.push(
			makeLogisticsCandidate(
				snapshot,
				baseline,
				{ snapshot: candidateSnapshot, projection },
				{ kind: 'create-route', input },
				cause
			)
		);
	}
	return candidates;
}

function supplySourceCandidates(
	game: GameState,
	snapshot: SupplyPlannerSnapshot,
	baseline: SupplyPlanProjection,
	cause: Extract<SupplyLogisticsBottleneck, { kind: 'destination-configuration' }>
): SupplyPlannerCandidate[] {
	const categoryId = findCategoryIdForFinishedMaterial(game, snapshot);
	if (!categoryId || !snapshot.logistics) return [];
	const candidates: SupplyPlannerCandidate[] = [];
	for (const remote of [...snapshot.logistics.remoteCities].sort((left, right) =>
		compareCodeUnits(left.inventory.cityId, right.inventory.cityId)
	)) {
		const toSupplyCityId = remote.inventory.cityId;
		if (toSupplyCityId === snapshot.supplyCityId) continue;
		const candidateGame = clone(game);
		candidateGame.retailSupplyAssignments = candidateGame.retailSupplyAssignments.map(
			(assignment) =>
				assignment.retailCityId === snapshot.retailCityId
					? { ...assignment, supplyCityId: toSupplyCityId }
					: assignment
		);
		const result = buildSupplyPlannerSnapshot(candidateGame, {
			retailCityId: snapshot.retailCityId,
			categoryId
		});
		if (result.status !== 'ready') continue;
		const candidateSnapshot = clone(result.snapshot);
		const projection = withTotals(projectSupplySnapshot(candidateSnapshot));
		candidates.push(
			makeLogisticsCandidate(
				snapshot,
				baseline,
				{ snapshot: candidateSnapshot, projection },
				{
					kind: 'change-supply-source',
					retailCityId: snapshot.retailCityId,
					fromSupplyCityId: snapshot.supplyCityId,
					toSupplyCityId
				},
				cause
			)
		);
	}
	return candidates;
}

function findCategoryIdForFinishedMaterial(
	game: GameState,
	snapshot: SupplyPlannerSnapshot
): string | null {
	const store = game.stores
		.filter((candidate) => candidate.cityId === snapshot.retailCityId)
		.sort((left, right) => compareCodeUnits(left.id, right.id))[0];
	if (!store) return null;
	for (const category of getSupportedStoreChainCategories(store)) {
		if (getFinishedMaterialIdForCategory(category.id) === snapshot.finishedMaterialId) {
			return category.id;
		}
	}
	return null;
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
	// Placement-independent rail reachability scaffold (network + attach-cell
	// map for existing buildings), shared across every synthetic-producer
	// placement below — only the synthetic building's entry varies per tile.
	const reachabilityBase = buildRailReachabilityBase(game, snapshot.supplyCityId);
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
				placementTile.railReady,
				reachabilityBase
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
		cityId: snapshot.supplyCityId,
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

	if (
		action.kind === 'create-route' ||
		action.kind === 'edit-route' ||
		action.kind === 'resume-route' ||
		action.kind === 'change-supply-source'
	) {
		const importSpendReduction30 =
			baseline.totals.importSpend30 - economicsProjection.totals.importSpend30;
		const baselineTransportCost30 = baseline.logisticsMetrics?.projectedTransportCost30 ?? 0;
		const candidateTransportCost30 =
			economicsProjection.logisticsMetrics?.projectedTransportCost30 ?? 0;
		const incrementalTransportCost30 = candidateTransportCost30 - baselineTransportCost30;
		const firstShortageImprovementDays = improvementDays(
			firstShortageDay(baseline),
			firstShortageDay(economicsProjection)
		);
		return {
			...base,
			importReduction30: Math.max(
				0,
				baseline.totals.importUnits30 - economicsProjection.totals.importUnits30
			),
			importSpendReduction30,
			projectedDeliveredUnits7: economicsProjection.logisticsMetrics?.projectedDeliveredUnits7 ?? 0,
			projectedDeliveredUnits30:
				economicsProjection.logisticsMetrics?.projectedDeliveredUnits30 ?? 0,
			incrementalTransportCost30,
			firstShortageImprovementDays,
			preRailNetCashBenefit30: importSpendReduction30 - incrementalTransportCost30,
			netCashBenefit30: importSpendReduction30 - incrementalTransportCost30
		};
	}

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
		stockoutImprovementDays,
		projectedDeliveredUnits7: economicsProjection.logisticsMetrics?.projectedDeliveredUnits7 ?? 0,
		projectedDeliveredUnits30: economicsProjection.logisticsMetrics?.projectedDeliveredUnits30 ?? 0,
		firstShortageImprovementDays: stockoutImprovementDays
	};
}

function addSyntheticProducer(
	game: GameState,
	snapshot: SupplyPlannerSnapshot,
	buildingType: IndustrialBuildingType,
	tile: { id: string; x: number; y: number },
	preferRailReady: boolean,
	base?: RailReachabilityBase | null
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
		candidateGame.industrialBuildings,
		base
	);
	// Copy the shared reachability fields in one object-level assignment.
	// The explicit Omit<RequiredChainReachability, ...> annotation keeps the
	// copied field set derived from the interface, so a newly added
	// RequiredChainReachability field cannot be silently dropped here.
	// usableBuildingIds is excluded: the snapshot stores a sorted id array,
	// not the reachability set.
	const reachabilityFields: Omit<RequiredChainReachability, 'usableBuildingIds'> = reachability;
	Object.assign(candidateSnapshot, reachabilityFields);
	candidateSnapshot.usableBuildingIds = uniqueSorted([...reachability.usableBuildingIds]);
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
		left.comparison.netCashBenefit30 ?? left.comparison.preRailNetCashBenefit30 ?? null;
	const rightBenefit =
		right.comparison.netCashBenefit30 ?? right.comparison.preRailNetCashBenefit30 ?? null;
	// Compare missing benefits explicitly instead of sentinel arithmetic:
	// both missing ties (0), one missing ranks below the present one.
	const compareBenefit =
		leftBenefit === null && rightBenefit === null
			? 0
			: leftBenefit === null
				? 1
				: rightBenefit === null
					? -1
					: rightBenefit - leftBenefit;
	return (
		rightTier - leftTier ||
		compareBenefit ||
		right.comparison.shortageReduction30 - left.comparison.shortageReduction30 ||
		right.comparison.shortageReduction7 - left.comparison.shortageReduction7 ||
		right.comparison.importReduction30 - left.comparison.importReduction30 ||
		right.comparison.stockoutImprovementDays - left.comparison.stockoutImprovementDays ||
		right.comparison.firstShortageImprovementDays - left.comparison.firstShortageImprovementDays ||
		right.comparison.projectedDeliveredUnits30 - left.comparison.projectedDeliveredUnits30 ||
		left.comparison.incrementalTransportCost30 - right.comparison.incrementalTransportCost30 ||
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
			return `build-warehouse:${action.cityId}`;
		case 'connect-rail':
			return `connect-rail:${action.materialId}:${action.buildingId}`;
		case 'create-route':
			return `create-route:${action.input.originCityId}:${action.input.destinationCityId}:${action.input.materialId}:${action.input.capacity}:${action.input.frequencyDays}:${action.input.leadTimeDays}:${action.input.transportCostPerUnit}:${action.input.priority}`;
		case 'edit-route':
			return `edit-route:${action.routeId}:${action.field}:${action.to}`;
		case 'resume-route':
			return `resume-route:${action.routeId}`;
		case 'change-supply-source':
			return `change-supply-source:${action.retailCityId}:${action.toSupplyCityId}`;
		case 'none':
			return `none:${action.reason}`;
	}
}

/**
 * Whether the structural-chain rail-gating bypass applies to a missing
 * producer material.
 *
 * For raw/intermediate materials, the bypass applies only when no
 * installed building produces a downstream material whose recipe consumes
 * this material — i.e. the downstream stage is genuinely absent, so no
 * placement can be rail-ready yet and whether future rail is needed cannot
 * be determined. Presence is measured by installed buildings, NOT usable
 * sinks: an installed-but-disconnected downstream processor still makes a
 * new upstream producer useless until rail exists, so it must not trigger
 * the bypass (especially when rail construction is unavailable).
 *
 * Finished materials sink to warehouses; the bypass applies only when no
 * warehouse exists at all.
 */
function isStructuralChainIncomplete(
	snapshot: SupplyPlannerSnapshot,
	materialId: MaterialId
): boolean {
	if (MATERIALS[materialId]?.kind === 'finished') {
		return (snapshot.usableSinkBuildingIdsByMaterial[materialId] ?? []).length === 0;
	}
	return !hasInstalledDownstreamProducer(snapshot, materialId);
}

/**
 * Whether any building installed in the supply city produces a downstream
 * material (within the required chain) whose recipe consumes `materialId`.
 */
function hasInstalledDownstreamProducer(
	snapshot: SupplyPlannerSnapshot,
	materialId: MaterialId
): boolean {
	const requirements = buildSupplyMaterialRequirements(snapshot);
	const downstreamTypeIds = new Set<IndustrialBuildingTypeId>();
	for (const requirement of requirements) {
		if (requirement.materialId === materialId) continue;
		const recipeId = requirement.producerRecipeId;
		if (!recipeId) continue;
		const recipe = PRODUCTION_RECIPES[recipeId];
		if (!recipe?.inputs.some((input) => input.materialId === materialId)) continue;
		for (const type of buildingTypesForRecipe(recipeId)) {
			downstreamTypeIds.add(type.id);
		}
	}
	return snapshot.buildings.some((building) => downstreamTypeIds.has(building.typeId));
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

function firstShortageDay(projection: SupplyPlanProjection): number | null {
	const days = projection.materials
		.filter((row) => row.requiredPerDay > 0)
		.map((row) => row.thirtyDay.projectedStockoutDay)
		.filter((day): day is number => day !== null);
	return days.length > 0 ? Math.min(...days) : null;
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
