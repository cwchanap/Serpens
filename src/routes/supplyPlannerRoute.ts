import { buildSupplyPlan } from '$lib/game/supplyPlannerActions';
import {
	listSupplyPlannerCategories,
	type SupplyPlannerHorizonDays
} from '$lib/game/supplyPlanner';
import type {
	GameState,
	IndustrialBuilding,
	IndustrialBuildingTypeId,
	ProductId,
	WorldCityId
} from '$lib/game/types';
import type { RecurringRouteInput } from '$lib/game/interCityLogistics';
import type {
	SupplyPlannerAction,
	SupplyPlannerActionAvailability,
	SupplyPlannerResult
} from '$lib/game/supplyPlannerActions';

export interface SupplyPlannerUiContext {
	productId: ProductId | null;
	horizonDays: SupplyPlannerHorizonDays;
}

export function getSupplyPlannerCategoryIds(
	game: GameState | null,
	retailCityId: WorldCityId,
	allowedCategoryIds: readonly ProductId[]
): ProductId[] {
	if (!game) return [];
	const allowed = new Set(allowedCategoryIds);
	return listSupplyPlannerCategories(game, retailCityId).filter((productId) =>
		allowed.has(productId)
	);
}

export interface SupplyPlannerHandoffHost {
	getGame(): GameState | null;
	closeOverlays(): void;
	switchToSupplyCity(cityId: WorldCityId): Promise<boolean>;
	armIndustryPlacement(buildingTypeId: IndustrialBuildingTypeId): void;
	selectIndustryTile(tileId: string): void;
	openLogistics(routeId: string | null, preset: RecurringRouteInput | null): void;
	openStores(retailCityId: WorldCityId): void;
	enterRailBuildMode(mode: {
		step: 'routing';
		originBuildingId: string;
		waypoints: Array<{ x: number; y: number }>;
	}): void;
	canBuildRail: boolean;
	canManageLogistics: boolean;
	canSetRetailSupplySource: boolean;
}

export function resolveSupplyPlannerCategory(
	context: SupplyPlannerUiContext,
	validCategoryIds: readonly ProductId[]
): ProductId | null {
	if (context.productId && validCategoryIds.includes(context.productId)) {
		return context.productId;
	}
	return validCategoryIds[0] ?? null;
}

export interface SupplyPlannerDerivationInput {
	isOpen: boolean;
	game: GameState | null;
	retailCityId: WorldCityId;
	productId: ProductId | null;
	availability: SupplyPlannerActionAvailability;
}

export function deriveSupplyPlannerResult(
	input: SupplyPlannerDerivationInput,
	_buildPlan: typeof buildSupplyPlan = buildSupplyPlan,
	snapshotGame: (game: GameState) => GameState = (game) => game
): SupplyPlannerResult | null {
	if (!input.isOpen || !input.game || !input.productId) return null;
	return _buildPlan(
		snapshotGame(input.game),
		{ retailCityId: input.retailCityId, productId: input.productId },
		input.availability
	);
}

export async function handoffSupplyPlannerAction(
	action: SupplyPlannerAction,
	result: SupplyPlannerResult,
	host: SupplyPlannerHandoffHost
): Promise<void> {
	if (action.kind === 'none' || result.status !== 'ready') return;
	if (!actionsMatch(result.plan.recommendation.action, action)) return;

	const snapshot = result.plan.snapshot;
	if (action.kind === 'build-producer') {
		host.closeOverlays();
		if (!(await host.switchToSupplyCity(snapshot.supplyCityId))) return;
		host.armIndustryPlacement(action.buildingTypeId);
		return;
	}

	if (action.kind === 'build-warehouse') {
		host.closeOverlays();
		if (!(await host.switchToSupplyCity(action.cityId))) return;
		host.armIndustryPlacement(action.buildingTypeId);
		return;
	}

	if (action.kind === 'create-route') {
		if (!host.canManageLogistics) return;
		host.closeOverlays();
		host.openLogistics(null, action.input);
		return;
	}

	if (action.kind === 'edit-route' || action.kind === 'resume-route') {
		if (!host.canManageLogistics) return;
		host.closeOverlays();
		host.openLogistics(action.routeId, null);
		return;
	}

	if (action.kind === 'change-supply-source') {
		if (!host.canSetRetailSupplySource) return;
		host.closeOverlays();
		host.openStores(action.retailCityId);
		return;
	}

	if (action.kind === 'upgrade-building') {
		const building = findPlannerBuilding(host.getGame(), action.buildingId, snapshot.supplyCityId);
		if (!building) return;
		host.closeOverlays();
		if (!(await host.switchToSupplyCity(snapshot.supplyCityId))) return;
		const currentBuilding = findPlannerBuilding(
			host.getGame(),
			action.buildingId,
			snapshot.supplyCityId
		);
		if (!currentBuilding) return;
		host.selectIndustryTile(currentBuilding.tileId);
		return;
	}

	const building = findPlannerBuilding(host.getGame(), action.buildingId, snapshot.supplyCityId);
	if (!building) return;
	if (!host.canBuildRail || !snapshot.disconnectedBuildingIds.includes(building.id)) return;
	host.closeOverlays();
	if (!(await host.switchToSupplyCity(snapshot.supplyCityId))) return;
	const currentBuilding = findPlannerBuilding(
		host.getGame(),
		action.buildingId,
		snapshot.supplyCityId
	);
	if (!currentBuilding) return;
	host.enterRailBuildMode({
		step: 'routing',
		originBuildingId: currentBuilding.id,
		waypoints: []
	});
}

function actionsMatch(left: SupplyPlannerAction, right: SupplyPlannerAction): boolean {
	return JSON.stringify(left) === JSON.stringify(right);
}

export function findPlannerBuilding(
	game: GameState | null,
	buildingId: string,
	cityId: WorldCityId
): IndustrialBuilding | null {
	return (
		game?.industrialBuildings.find(
			(building) => building.id === buildingId && building.cityId === cityId
		) ?? null
	);
}
