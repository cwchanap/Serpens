import { INDUSTRIAL_BUILDING_TYPES } from './industry';
import {
	INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT,
	INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH,
	createIndustryTileLookup,
	getOccupiedIndustryTileIds
} from './industryFootprint';
import type { PlacementPreview } from './placementPreview';
import { buildRailNetwork, getRailNeighborKeys, parseRailCellKey, railUsageKey } from './rail';
import type { RailNetwork } from './rail';
import type {
	GameState,
	IndustrialBuilding,
	IndustrialBuildingStatus,
	IndustrialBuildingTypeId,
	IndustryResourceId,
	IndustryTerrainId,
	IndustryTile,
	RailCell
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
	width: number;
	height: number;
	status: IndustrialBuildingStatus;
}

export interface IndustryMapRailRender {
	x: number;
	y: number;
	level: number;
	connections: number; // bitmask N=1, E=2, S=4, W=8
	utilization: number; // 0..1: yesterday's units through this cell / level
}

export interface IndustryMapRailPreviewRender {
	cells: Array<{ x: number; y: number; isNew: boolean }>;
}

export interface IndustryMapSnapshot {
	cityId: string;
	width: number;
	height: number;
	selectedTileId: string | null;
	placementPreview: PlacementPreview | null;
	tiles: IndustryMapTileRender[];
	buildings: IndustryMapBuildingRender[];
	rails: IndustryMapRailRender[];
	railPreview: IndustryMapRailPreviewRender | null;
}

export function createIndustryMapSnapshot(
	game: GameState,
	selectedTileId: string | null,
	placementPreview: PlacementPreview | null = null,
	railPreview: IndustryMapRailPreviewRender | null = null
): IndustryMapSnapshot {
	const city = game.industryCities.find((candidate) => candidate.id === game.activeIndustryCityId);

	if (!city) {
		return {
			cityId: game.activeIndustryCityId,
			width: 0,
			height: 0,
			selectedTileId,
			placementPreview: clonePlacementPreview(placementPreview),
			tiles: [],
			buildings: [],
			rails: [],
			railPreview: null
		};
	}

	const activeCityBuildings = game.industrialBuildings.filter(
		(building) => building.cityId === city.id
	);
	const tileLookup = createIndustryTileLookup(city);
	const occupiedTileIds = getOccupiedIndustryTileIds(city, activeCityBuildings, tileLookup);
	const railNetwork = buildRailNetwork(city);
	const railUsage = game.reports.at(-1)?.productionReport.railUsage ?? {};

	return {
		cityId: city.id,
		width: city.width,
		height: city.height,
		selectedTileId,
		placementPreview: clonePlacementPreview(placementPreview),
		tiles: city.tiles.map((tile) => createTileRender(tile, occupiedTileIds, selectedTileId)),
		buildings: activeCityBuildings.map(createBuildingRender),
		rails: city.rails.map((cell) => createRailRender(cell, city.id, railNetwork, railUsage)),
		railPreview
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

function createRailRender(
	cell: RailCell,
	cityId: string,
	network: RailNetwork,
	railUsage: Record<string, number>
): IndustryMapRailRender {
	let connections = 0;

	for (const neighborKey of getRailNeighborKeys(network, cell.x, cell.y)) {
		const { x: neighborX, y: neighborY } = parseRailCellKey(neighborKey);

		if (neighborY < cell.y) {
			connections |= 1; // N
		}
		if (neighborX > cell.x) {
			connections |= 2; // E
		}
		if (neighborY > cell.y) {
			connections |= 4; // S
		}
		if (neighborX < cell.x) {
			connections |= 8; // W
		}
	}

	const usage = railUsage[railUsageKey(cityId, cell.x, cell.y)] ?? 0;
	// cell.level is 1..RAIL_MAX_LEVEL by invariant; Math.max guards the divisor
	// against a 0 the type allows, so utilization can never render NaN.
	const utilization = Math.min(1, Math.max(0, usage / Math.max(1, cell.level)));

	return {
		x: cell.x,
		y: cell.y,
		level: cell.level,
		connections,
		utilization
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
		width: INDUSTRIAL_BUILDING_FOOTPRINT_WIDTH,
		height: INDUSTRIAL_BUILDING_FOOTPRINT_HEIGHT,
		status: building.status
	};
}
