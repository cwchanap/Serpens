import {
	INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT,
	INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH
} from '$lib/game/industryFootprint';
import {
	RETAIL_STORE_FOOTPRINT_HEIGHT,
	RETAIL_STORE_FOOTPRINT_WIDTH
} from '$lib/game/storeFootprint';
import type { City } from '$lib/game/types';
import type {
	AuthoredBuilding,
	JsonObject,
	PermittedRetailPlacement,
	ValidationContext
} from './shared';
import { getValidationCity } from './shared';

function canActivateRetailCity(context: ValidationContext, cityId: string): boolean {
	if (context.activeRetailCityId === cityId) return true;
	if (context.openedCityIds.has(cityId)) {
		return (
			context.allowedCommands.has('selectWorldCity') || context.allowedCommands.has('openWorldCity')
		);
	}
	return context.revealedCityIds.has(cityId) && context.allowedCommands.has('openWorldCity');
}

function overlapsFoundingStore(
	context: ValidationContext,
	placement: PermittedRetailPlacement,
	foundingStore: JsonObject | undefined
): boolean {
	if (
		typeof foundingStore?.cityId !== 'string' ||
		typeof foundingStore.tileId !== 'string' ||
		foundingStore.cityId !== placement.cityId
	)
		return false;
	const city = getValidationCity(context, foundingStore.cityId) as City | undefined;
	const foundingTile = city?.tiles.find((tile) => tile.id === foundingStore.tileId);
	if (!foundingTile) return true;
	return rectanglesOverlap(
		placement.x,
		placement.y,
		RETAIL_STORE_FOOTPRINT_WIDTH,
		RETAIL_STORE_FOOTPRINT_HEIGHT,
		foundingTile.x,
		foundingTile.y,
		RETAIL_STORE_FOOTPRINT_WIDTH,
		RETAIL_STORE_FOOTPRINT_HEIGHT
	);
}

function rectanglesOverlap(
	firstX: number,
	firstY: number,
	firstWidth: number,
	firstHeight: number,
	secondX: number,
	secondY: number,
	secondWidth: number,
	secondHeight: number
): boolean {
	return (
		firstX < secondX + secondWidth &&
		firstX + firstWidth > secondX &&
		firstY < secondY + secondHeight &&
		firstY + firstHeight > secondY
	);
}

function physicalBuildingKey(building: AuthoredBuilding): string {
	return `${building.cityId}:${building.x},${building.y}`;
}

function dedupePhysicalBuildings(buildings: readonly AuthoredBuilding[]): AuthoredBuilding[] {
	const byFootprint = new Map<string, AuthoredBuilding>();
	for (const building of buildings) {
		if (!building.validPlacement || building.x === undefined || building.y === undefined) continue;
		const key = physicalBuildingKey(building);
		if (!byFootprint.has(key)) byFootprint.set(key, building);
	}
	return [...byFootprint.values()];
}

function isCoordinateInsideBuilding(x: number, y: number, building: AuthoredBuilding): boolean {
	return (
		building.x !== undefined &&
		building.y !== undefined &&
		x >= building.x &&
		x < building.x + INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH &&
		y >= building.y &&
		y < building.y + INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT
	);
}

function buildingsOverlap(first: AuthoredBuilding, second: AuthoredBuilding): boolean {
	if (first.path === second.path) return true;
	if (first.cityId !== second.cityId) return false;
	if (
		first.x === undefined ||
		first.y === undefined ||
		second.x === undefined ||
		second.y === undefined
	)
		return false;
	return rectanglesOverlap(
		first.x,
		first.y,
		INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH,
		INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT,
		second.x,
		second.y,
		INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH,
		INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT
	);
}

export {
	canActivateRetailCity,
	overlapsFoundingStore,
	rectanglesOverlap,
	physicalBuildingKey,
	dedupePhysicalBuildings,
	isCoordinateInsideBuilding,
	buildingsOverlap
};
