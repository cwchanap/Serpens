import type { ArchetypeId, CityTile, GameState, MarketCompetitor, Store } from './types';
import type { PlacementPreview } from './placementPreview';
import { storeNameOrOrdinal } from './state';
import {
	RETAIL_STORE_FOOTPRINT_HEIGHT,
	RETAIL_STORE_FOOTPRINT_WIDTH,
	createCityTileLookup,
	getOccupiedStoreTileIds
} from './storeFootprint';

export type CityMapFeatureVariant =
	| 'isolated'
	| 'end-n'
	| 'end-e'
	| 'end-s'
	| 'end-w'
	| 'horizontal'
	| 'vertical'
	| 'corner-ne'
	| 'corner-es'
	| 'corner-sw'
	| 'corner-wn'
	| 'tee-nes'
	| 'tee-esw'
	| 'tee-nsw'
	| 'tee-new'
	| 'intersection';
export type CityMapRoadVariant = CityMapFeatureVariant;

export interface CityMapTileRender {
	id: string;
	x: number;
	y: number;
	neighborhood: CityTile['neighborhood'];
	terrain: CityTile['terrain'];
	feature: CityTile['feature'];
	roadVariant: CityMapRoadVariant | null;
	riverVariant: CityMapFeatureVariant | null;
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
	width: number;
	height: number;
}

export interface CityMapCompetitorRender {
	id: string;
	name: string;
	archetypeId: ArchetypeId;
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
	competitors: CityMapCompetitorRender[];
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
			placementPreview: clonePlacementPreview(placementPreview),
			tiles: [],
			stores: [],
			competitors: []
		};
	}

	const activeCityStores = game.stores.filter((store) => store.cityId === city.id);
	const activeCityCompetitors = game.competitors.filter(
		(competitor) => competitor.cityId === city.id && competitor.status === 'active'
	);
	const tileLookup = createCityTileLookup(city);
	const ownedTileIds = getOccupiedStoreTileIds(city, activeCityStores, tileLookup);
	const roadCoordinates = new Set(
		city.tiles
			.filter((candidate) => candidate.feature === 'road')
			.map((candidate) => `${candidate.x},${candidate.y}`)
	);
	const riverCoordinates = new Set(
		city.tiles
			.filter((candidate) => candidate.feature === 'river')
			.map((candidate) => `${candidate.x},${candidate.y}`)
	);

	return {
		cityId: city.id,
		width: city.width,
		height: city.height,
		selectedTileId,
		placementPreview: clonePlacementPreview(placementPreview),
		tiles: city.tiles.map((tile) =>
			createTileRender(tile, roadCoordinates, riverCoordinates, ownedTileIds, selectedTileId)
		),
		stores: activeCityStores.map((store) =>
			createStoreRender(store, game.stores.findIndex((candidate) => candidate.id === store.id) + 1)
		),
		competitors: activeCityCompetitors.map(createCompetitorRender)
	};
}

function clonePlacementPreview(preview: PlacementPreview | null): PlacementPreview | null {
	if (!preview) {
		return null;
	}

	return {
		validTileIds: [...preview.validTileIds],
		invalidTileIds: [...preview.invalidTileIds]
	};
}

function createTileRender(
	tile: CityTile,
	roadCoordinates: ReadonlySet<string>,
	riverCoordinates: ReadonlySet<string>,
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
		roadVariant: getFeatureRenderVariant(tile, 'road', roadCoordinates),
		riverVariant: getFeatureRenderVariant(tile, 'river', riverCoordinates),
		locked: tile.locked,
		owned: ownedTileIds.has(tile.id),
		selected: tile.id === selectedTileId,
		demand: tile.demand,
		rent: tile.rent,
		footTraffic: tile.footTraffic,
		customerFit: tile.customerFit
	};
}

function getFeatureRenderVariant(
	tile: CityTile,
	feature: NonNullable<CityTile['feature']>,
	coordinates: ReadonlySet<string>
): CityMapFeatureVariant | null {
	if (tile.feature !== feature) {
		return null;
	}

	const north = coordinates.has(`${tile.x},${tile.y - 1}`);
	const east = coordinates.has(`${tile.x + 1},${tile.y}`);
	const south = coordinates.has(`${tile.x},${tile.y + 1}`);
	const west = coordinates.has(`${tile.x - 1},${tile.y}`);
	const neighborCount = Number(north) + Number(east) + Number(south) + Number(west);

	if (neighborCount === 0) {
		return 'isolated';
	}

	if (neighborCount === 1) {
		if (north) return 'end-n';
		if (east) return 'end-e';
		if (south) return 'end-s';
		return 'end-w';
	}

	if (neighborCount === 2) {
		if (north && south) return 'vertical';
		if (east && west) return 'horizontal';
		if (north && east) return 'corner-ne';
		if (east && south) return 'corner-es';
		if (south && west) return 'corner-sw';
		return 'corner-wn';
	}

	if (neighborCount === 3) {
		if (north && east && south) return 'tee-nes';
		if (east && south && west) return 'tee-esw';
		if (north && south && west) return 'tee-nsw';
		return 'tee-new';
	}

	return 'intersection';
}

function createStoreRender(store: Store, ordinal: number): CityMapStoreRender {
	return {
		id: store.id,
		name: storeNameOrOrdinal(store, ordinal),
		archetypeId: store.archetypeId,
		tileId: store.tileId,
		x: store.mapX,
		y: store.mapY,
		width: RETAIL_STORE_FOOTPRINT_WIDTH,
		height: RETAIL_STORE_FOOTPRINT_HEIGHT
	};
}

function createCompetitorRender(competitor: MarketCompetitor): CityMapCompetitorRender {
	return {
		id: competitor.id,
		name: competitor.name,
		archetypeId: competitor.archetypeId,
		x: competitor.location.x,
		y: competitor.location.y
	};
}
