import { getTileById } from '$lib/game/city';
import { getIndustryTileById } from '$lib/game/industry';
import { isTileInStoreFootprint } from '$lib/game/storeFootprint';
import { isTileInIndustryBuildingFootprint } from '$lib/game/industryFootprint';
import { getSegmentsForCell, type RailSegment } from '$lib/game/rail';
import type { City, GameState, IndustryCity } from '$lib/game/types';

export function selectRetailInspector(game: GameState | null, city: City, tileId: string | null) {
	const selectedTile = tileId ? (getTileById(city, tileId) ?? null) : null;
	const selectedStore =
		game && selectedTile
			? (game.stores.find(
					(store) => store.cityId === city.id && isTileInStoreFootprint(selectedTile, store)
				) ?? null)
			: null;
	return { selectedTile, selectedStore };
}

export function selectIndustryInspector(
	game: GameState | null,
	city: IndustryCity,
	tileId: string | null
) {
	const selectedIndustryTile = tileId ? (getIndustryTileById(city, tileId) ?? null) : null;
	const selectedIndustryBuilding =
		game && selectedIndustryTile
			? (game.industrialBuildings.find(
					(building) =>
						building.cityId === city.id &&
						isTileInIndustryBuildingFootprint(selectedIndustryTile, building)
				) ?? null)
			: null;
	return { selectedIndustryTile, selectedIndustryBuilding };
}

/** Selection uses cached segments; it must never rebuild the city's rail network. */
export function selectInspectorRailSegments(
	city: IndustryCity,
	tileId: string | null,
	isRailBuildActive: boolean,
	getSegments: () => RailSegment[]
): RailSegment[] | null {
	if (!tileId || isRailBuildActive) return null;
	const tile = getIndustryTileById(city, tileId);
	if (!tile) return null;
	const cellSegments = getSegmentsForCell(getSegments(), tile.x, tile.y);
	return cellSegments.length > 0 ? cellSegments : null;
}
