import { getTilePlacementBlockReason, type TilePlacementBlockReason } from './city';
import { toCoordinateKey } from './footprintHelpers';
import type { City, CityTile, Store } from './types';

export const RETAIL_STORE_FOOTPRINT_WIDTH = 2;
export const RETAIL_STORE_FOOTPRINT_HEIGHT = 2;

export type StoreFootprintPlacementBlockReason = TilePlacementBlockReason | 'Occupied location';

export interface CityTileLookup {
	byId: ReadonlyMap<string, CityTile>;
	byCoordinate: ReadonlyMap<string, CityTile>;
}

export interface StoreFootprint {
	tiles: CityTile[];
	missingCoordinates: Array<{ x: number; y: number }>;
}

export function createCityTileLookup(city: City): CityTileLookup {
	const byId = new Map<string, CityTile>();
	const byCoordinate = new Map<string, CityTile>();

	for (const tile of city.tiles) {
		byId.set(tile.id, tile);
		byCoordinate.set(toCoordinateKey(tile.x, tile.y), tile);
	}

	return { byId, byCoordinate };
}

export function getRetailStoreFootprint(
	lookup: CityTileLookup,
	anchorTile: Pick<CityTile, 'x' | 'y'>
): StoreFootprint {
	const tiles: CityTile[] = [];
	const missingCoordinates: Array<{ x: number; y: number }> = [];

	for (let y = anchorTile.y; y < anchorTile.y + RETAIL_STORE_FOOTPRINT_HEIGHT; y += 1) {
		for (let x = anchorTile.x; x < anchorTile.x + RETAIL_STORE_FOOTPRINT_WIDTH; x += 1) {
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

export function getOccupiedStoreTileIds(
	city: City,
	stores: readonly Store[],
	lookup: CityTileLookup = createCityTileLookup(city)
): Set<string> {
	const occupiedTileIds = new Set<string>();

	for (const store of stores) {
		if (store.cityId !== city.id) {
			continue;
		}

		const anchorTile =
			lookup.byId.get(store.tileId) ??
			lookup.byCoordinate.get(toCoordinateKey(store.mapX, store.mapY));

		if (!anchorTile) {
			continue;
		}

		for (const tile of getRetailStoreFootprint(lookup, anchorTile).tiles) {
			occupiedTileIds.add(tile.id);
		}
	}

	return occupiedTileIds;
}

export function getStoreFootprintPlacementBlockReason(
	lookup: CityTileLookup,
	anchorTile: CityTile,
	occupiedTileIds: ReadonlySet<string> = new Set()
): StoreFootprintPlacementBlockReason | null {
	const footprint = getRetailStoreFootprint(lookup, anchorTile);

	if (footprint.missingCoordinates.length > 0) {
		return 'Locked location';
	}

	for (const tile of footprint.tiles) {
		const tileBlockReason = getTilePlacementBlockReason(tile);

		if (tileBlockReason) {
			return tileBlockReason;
		}
	}

	for (const tile of footprint.tiles) {
		if (occupiedTileIds.has(tile.id)) {
			return 'Occupied location';
		}
	}

	return null;
}

export function isTileInStoreFootprint(
	tile: Pick<CityTile, 'x' | 'y'>,
	store: Pick<Store, 'mapX' | 'mapY'>
): boolean {
	return (
		tile.x >= store.mapX &&
		tile.x < store.mapX + RETAIL_STORE_FOOTPRINT_WIDTH &&
		tile.y >= store.mapY &&
		tile.y < store.mapY + RETAIL_STORE_FOOTPRINT_HEIGHT
	);
}
