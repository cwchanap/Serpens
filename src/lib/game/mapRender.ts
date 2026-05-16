import type { ArchetypeId, CityTile, GameState, Store } from './types';
import type { PlacementPreview } from './placementPreview';

export type CityMapRoadVariant = 'horizontal' | 'vertical' | 'intersection';

export interface CityMapTileRender {
	id: string;
	x: number;
	y: number;
	neighborhood: CityTile['neighborhood'];
	terrain: CityTile['terrain'];
	feature: CityTile['feature'];
	roadVariant: CityMapRoadVariant | null;
	locked: boolean;
	owned: boolean;
	selected: boolean;
	demand: number;
	rent: number;
	footTraffic: number;
	customerFit: number;
}

export interface CityMapStoreRender {
	id: string;
	name: string;
	archetypeId: ArchetypeId;
	tileId: string;
	x: number;
	y: number;
}

export interface CityMapSnapshot {
	cityId: string;
	width: number;
	height: number;
	selectedTileId: string | null;
	placementPreview: PlacementPreview | null;
	tiles: CityMapTileRender[];
	stores: CityMapStoreRender[];
}

export function createCityMapSnapshot(
	game: GameState,
	selectedTileId: string | null,
	placementPreview: PlacementPreview | null = null
): CityMapSnapshot {
	const city = game.cities.find((candidate) => candidate.id === game.activeCityId);

	if (!city) {
		return {
			cityId: game.activeCityId,
			width: 0,
			height: 0,
			selectedTileId,
			placementPreview,
			tiles: [],
			stores: []
		};
	}

	const activeCityStores = game.stores.filter((store) => store.cityId === city.id);
	const ownedTileIds = new Set(activeCityStores.map((store) => store.tileId));
	const roadCoordinates = new Set(
		city.tiles
			.filter((candidate) => candidate.feature === 'road')
			.map((candidate) => `${candidate.x},${candidate.y}`)
	);

	return {
		cityId: city.id,
		width: city.width,
		height: city.height,
		selectedTileId,
		placementPreview,
		tiles: city.tiles.map((tile) =>
			createTileRender(tile, roadCoordinates, ownedTileIds, selectedTileId)
		),
		stores: activeCityStores.map(createStoreRender)
	};
}

function createTileRender(
	tile: CityTile,
	roadCoordinates: ReadonlySet<string>,
	ownedTileIds: ReadonlySet<string>,
	selectedTileId: string | null
): CityMapTileRender {
	return {
		id: tile.id,
		x: tile.x,
		y: tile.y,
		neighborhood: tile.neighborhood,
		terrain: tile.terrain,
		feature: tile.feature ?? null,
		roadVariant: getRoadRenderVariant(tile, roadCoordinates),
		locked: tile.locked,
		owned: ownedTileIds.has(tile.id),
		selected: tile.id === selectedTileId,
		demand: tile.demand,
		rent: tile.rent,
		footTraffic: tile.footTraffic,
		customerFit: tile.customerFit
	};
}

function getRoadRenderVariant(
	tile: CityTile,
	roadCoordinates: ReadonlySet<string>
): CityMapRoadVariant | null {
	if (tile.feature !== 'road') {
		return null;
	}

	const horizontalNeighborCount =
		Number(roadCoordinates.has(`${tile.x - 1},${tile.y}`)) +
		Number(roadCoordinates.has(`${tile.x + 1},${tile.y}`));
	const verticalNeighborCount =
		Number(roadCoordinates.has(`${tile.x},${tile.y - 1}`)) +
		Number(roadCoordinates.has(`${tile.x},${tile.y + 1}`));

	if (horizontalNeighborCount > 0 && verticalNeighborCount > 0) {
		return 'intersection';
	}

	return horizontalNeighborCount > verticalNeighborCount ? 'horizontal' : 'vertical';
}

function createStoreRender(store: Store): CityMapStoreRender {
	return {
		id: store.id,
		name: store.name,
		archetypeId: store.archetypeId,
		tileId: store.tileId,
		x: store.mapX,
		y: store.mapY
	};
}
