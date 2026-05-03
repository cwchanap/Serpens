import type { CityTile, GameState, Store } from './types';

export interface CityMapTileRender {
	id: string;
	x: number;
	y: number;
	neighborhood: CityTile['neighborhood'];
	terrain: CityTile['terrain'];
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
	tileId: string;
	x: number;
	y: number;
}

export interface CityMapSnapshot {
	cityId: string;
	width: number;
	height: number;
	selectedTileId: string | null;
	tiles: CityMapTileRender[];
	stores: CityMapStoreRender[];
}

export function createCityMapSnapshot(
	game: GameState,
	selectedTileId: string | null
): CityMapSnapshot {
	const city = game.cities.find((candidate) => candidate.id === game.activeCityId);

	if (!city) {
		return {
			cityId: game.activeCityId,
			width: 0,
			height: 0,
			selectedTileId,
			tiles: [],
			stores: []
		};
	}

	const activeCityStores = game.stores.filter((store) => store.cityId === city.id);
	const ownedTileIds = new Set(activeCityStores.map((store) => store.tileId));

	return {
		cityId: city.id,
		width: city.width,
		height: city.height,
		selectedTileId,
		tiles: city.tiles.map((tile) => createTileRender(tile, ownedTileIds, selectedTileId)),
		stores: activeCityStores.map(createStoreRender)
	};
}

function createTileRender(
	tile: CityTile,
	ownedTileIds: ReadonlySet<string>,
	selectedTileId: string | null
): CityMapTileRender {
	return {
		id: tile.id,
		x: tile.x,
		y: tile.y,
		neighborhood: tile.neighborhood,
		terrain: tile.terrain,
		locked: tile.locked,
		owned: ownedTileIds.has(tile.id),
		selected: tile.id === selectedTileId,
		demand: tile.demand,
		rent: tile.rent,
		footTraffic: tile.footTraffic,
		customerFit: tile.customerFit
	};
}

function createStoreRender(store: Store): CityMapStoreRender {
	return {
		id: store.id,
		name: store.name,
		tileId: store.tileId,
		x: store.mapX,
		y: store.mapY
	};
}
