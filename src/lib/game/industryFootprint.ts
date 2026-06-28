import { toCoordinateKey } from './footprintHelpers';
import type { IndustrialBuilding, IndustryCity, IndustryTile } from './types';

export const INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH = 2;
export const INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT = 2;

export interface IndustryTileLookup {
	byId: ReadonlyMap<string, IndustryTile>;
	byCoordinate: ReadonlyMap<string, IndustryTile>;
}

export interface IndustryFootprint {
	tiles: IndustryTile[];
	missingCoordinates: Array<{ x: number; y: number }>;
}

export function createIndustryTileLookup(city: IndustryCity): IndustryTileLookup {
	const byId = new Map<string, IndustryTile>();
	const byCoordinate = new Map<string, IndustryTile>();

	for (const tile of city.tiles) {
		byId.set(tile.id, tile);
		byCoordinate.set(toCoordinateKey(tile.x, tile.y), tile);
	}

	return { byId, byCoordinate };
}

export function getIndustryBuildingFootprint(
	lookup: IndustryTileLookup,
	anchorTile: Pick<IndustryTile, 'x' | 'y'>
): IndustryFootprint {
	const tiles: IndustryTile[] = [];
	const missingCoordinates: Array<{ x: number; y: number }> = [];

	for (let y = anchorTile.y; y < anchorTile.y + INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT; y += 1) {
		for (let x = anchorTile.x; x < anchorTile.x + INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH; x += 1) {
			const tile = lookup.byCoordinate.get(toCoordinateKey(x, y));

			if (tile) {
				tiles.push(tile);
			} else {
				missingCoordinates.push({ x, y });
			}
		}
	}

	return { tiles, missingCoordinates };
}

export function isTileInIndustryBuildingFootprint(
	tile: Pick<IndustryTile, 'x' | 'y'>,
	building: Pick<IndustrialBuilding, 'mapX' | 'mapY'>
): boolean {
	return (
		tile.x >= building.mapX &&
		tile.x < building.mapX + INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH &&
		tile.y >= building.mapY &&
		tile.y < building.mapY + INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT
	);
}

export function getOccupiedIndustryTileIds(
	city: IndustryCity,
	buildings: readonly IndustrialBuilding[],
	lookup: IndustryTileLookup = createIndustryTileLookup(city)
): Set<string> {
	const occupiedTileIds = new Set<string>();

	for (const building of buildings) {
		if (building.cityId !== city.id) {
			continue;
		}

		const anchorTile =
			lookup.byId.get(building.tileId) ??
			lookup.byCoordinate.get(toCoordinateKey(building.mapX, building.mapY));

		if (!anchorTile) {
			continue;
		}

		for (const tile of getIndustryBuildingFootprint(lookup, anchorTile).tiles) {
			occupiedTileIds.add(tile.id);
		}
	}

	return occupiedTileIds;
}
