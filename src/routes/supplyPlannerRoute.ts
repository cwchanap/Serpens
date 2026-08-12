import { buildSupplyPlan } from '$lib/game/supplyPlannerActions';
import {
	listSupplyPlannerCategories,
	type SupplyPlannerHorizonDays
} from '$lib/game/supplyPlanner';
import type {
	GameState,
	IndustrialBuilding,
	IndustrialBuildingTypeId,
	WorldCityId
} from '$lib/game/types';
import type {
	SupplyPlannerAction,
	SupplyPlannerActionAvailability,
	SupplyPlannerResult
} from '$lib/game/supplyPlannerActions';

export interface SupplyPlannerUiContext {
	categoryId: string | null;
	horizonDays: SupplyPlannerHorizonDays;
}

export function getSupplyPlannerCategoryIds(
	game: GameState | null,
	retailCityId: WorldCityId,
	allowedCategoryIds: readonly string[]
): string[] {
	if (!game) return [];
	const allowed = new Set(allowedCategoryIds);
	return listSupplyPlannerCategories(game, retailCityId).filter((categoryId) =>
		allowed.has(categoryId)
	);
}

export interface SupplyPlannerHandoffHost {
	getGame(): GameState | null;
	closeOverlays(): void;
	switchToSupplyCity(cityId: WorldCityId): Promise<boolean>;
	armIndustryPlacement(buildingTypeId: IndustrialBuildingTypeId): void;
	selectIndustryTile(tileId: string): void;
	enterRailBuildMode(mode: {
		step: 'routing';
		originBuildingId: string;
		waypoints: Array<{ x: number; y: number }>;
	}): void;
	canBuildRail: boolean;
}

export function resolveSupplyPlannerCategory(
	context: SupplyPlannerUiContext,
	validCategoryIds: readonly string[]
): string | null {
	if (context.categoryId && validCategoryIds.includes(context.categoryId)) {
		return context.categoryId;
	}
	return validCategoryIds[0] ?? null;
}

export interface SupplyPlannerDerivationInput {
	isOpen: boolean;
	game: GameState | null;
	retailCityId: WorldCityId;
	categoryId: string | null;
	availability: SupplyPlannerActionAvailability;
}

export function deriveSupplyPlannerResult(
	input: SupplyPlannerDerivationInput,
	_buildPlan: typeof buildSupplyPlan = buildSupplyPlan,
	snapshotGame: (game: GameState) => GameState = (game) => game
): SupplyPlannerResult | null {
	if (!input.isOpen || !input.game || !input.categoryId) return null;
	return _buildPlan(
		snapshotGame(input.game),
		{ retailCityId: input.retailCityId, categoryId: input.categoryId },
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
	if (action.kind === 'build-producer' || action.kind === 'build-warehouse') {
		host.closeOverlays();
		if (!(await host.switchToSupplyCity(snapshot.supplyCityId))) return;
		host.armIndustryPlacement(action.buildingTypeId);
		return;
	}

	const building = findPlannerBuilding(host.getGame(), action.buildingId, snapshot.supplyCityId);
	if (!building) return;

	if (action.kind === 'upgrade-building') {
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
