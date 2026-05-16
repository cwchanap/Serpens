import { INDUSTRIAL_BUILDING_TYPES } from './industry';
import type { PlacementPreview } from './placementPreview';
import type {
	GameState,
	IndustrialBuilding,
	IndustrialBuildingStatus,
	IndustrialBuildingTypeId,
	IndustryResourceId,
	IndustryTerrainId,
	IndustryTile
} from './types';

export interface IndustryMapTileRender {
	id: string;
	x: number;
	y: number;
	terrain: IndustryTerrainId;
	resource: IndustryResourceId | null;
	locked: boolean;
	selected: boolean;
	occupied: boolean;
}

export interface IndustryMapBuildingRender {
	id: string;
	name: string;
	typeId: IndustrialBuildingTypeId;
	tileId: string;
	x: number;
	y: number;
	status: IndustrialBuildingStatus;
}

export interface IndustryMapSnapshot {
	cityId: string;
	width: number;
	height: number;
	selectedTileId: string | null;
	placementPreview: PlacementPreview | null;
	tiles: IndustryMapTileRender[];
	buildings: IndustryMapBuildingRender[];
}

export function createIndustryMapSnapshot(
	game: GameState,
	selectedTileId: string | null,
	placementPreview: PlacementPreview | null = null
): IndustryMapSnapshot {
	const city = game.industryCities.find((candidate) => candidate.id === game.activeIndustryCityId);

	if (!city) {
		return {
			cityId: game.activeIndustryCityId,
			width: 0,
			height: 0,
			selectedTileId,
			placementPreview,
			tiles: [],
			buildings: []
		};
	}

	const activeCityBuildings = game.industrialBuildings.filter(
		(building) => building.cityId === city.id
	);
	const occupiedTileIds = new Set(activeCityBuildings.map((building) => building.tileId));

	return {
		cityId: city.id,
		width: city.width,
		height: city.height,
		selectedTileId,
		placementPreview,
		tiles: city.tiles.map((tile) => createTileRender(tile, occupiedTileIds, selectedTileId)),
		buildings: activeCityBuildings.map(createBuildingRender)
	};
}

function createTileRender(
	tile: IndustryTile,
	occupiedTileIds: ReadonlySet<string>,
	selectedTileId: string | null
): IndustryMapTileRender {
	return {
		id: tile.id,
		x: tile.x,
		y: tile.y,
		terrain: tile.terrain,
		resource: tile.resource,
		locked: tile.locked,
		selected: tile.id === selectedTileId,
		occupied: occupiedTileIds.has(tile.id)
	};
}

function createBuildingRender(building: IndustrialBuilding): IndustryMapBuildingRender {
	return {
		id: building.id,
		name: INDUSTRIAL_BUILDING_TYPES[building.typeId]?.name ?? building.typeId,
		typeId: building.typeId,
		tileId: building.tileId,
		x: building.mapX,
		y: building.mapY,
		status: building.status
	};
}
