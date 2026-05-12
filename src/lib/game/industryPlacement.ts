import { INDUSTRIAL_BUILDING_TYPES, getIndustryTileById } from './industry';
import type {
	DecisionItem,
	DecisionOption,
	GameState,
	IndustrialBuilding,
	IndustrialBuildingType,
	IndustrialBuildingTypeId,
	IndustryCity,
	IndustryResourceId,
	IndustryTile
} from './types';

export interface BuildIndustrialBuildingInput {
	tileId: string;
	buildingTypeId: IndustrialBuildingTypeId;
}

export function getIndustrialPlacementBlockReason(
	game: GameState,
	tileId: string,
	buildingTypeId: IndustrialBuildingTypeId
): string | null {
	const city = getActiveIndustryCity(game);
	const tile = city ? getIndustryTileById(city, tileId) : undefined;
	const buildingType = INDUSTRIAL_BUILDING_TYPES[buildingTypeId];

	if (!tile) {
		return 'Unknown industrial tile';
	}

	if (!buildingType) {
		return 'Unknown industrial building type';
	}

	if (game.industrialBuildings.some((building) => building.tileId === tile.id)) {
		return 'Occupied industrial tile';
	}

	if (buildingType.requiredResource && tile.resource !== buildingType.requiredResource) {
		return `Requires ${formatIndustryResourceLabel(buildingType.requiredResource)}`;
	}

	if (buildingType.requiresIndustrialTile && tile.terrain !== 'industrial') {
		return 'Requires industrial tile';
	}

	return null;
}

export function getAllowedIndustrialBuildingTypes(
	game: GameState,
	tileId: string
): IndustrialBuildingType[] {
	return Object.values(INDUSTRIAL_BUILDING_TYPES).filter(
		(buildingType) => getIndustrialPlacementBlockReason(game, tileId, buildingType.id) === null
	);
}

export function buildIndustrialBuilding(
	game: GameState,
	input: BuildIndustrialBuildingInput
): GameState {
	const city = getActiveIndustryCity(game);
	const tile = city ? getIndustryTileById(city, input.tileId) : undefined;
	const buildingType = INDUSTRIAL_BUILDING_TYPES[input.buildingTypeId];
	const blockReason = getIndustrialPlacementBlockReason(game, input.tileId, input.buildingTypeId);

	if (blockReason) {
		return appendDecision(game, industrialConstructionDelayedDecision(game, blockReason));
	}

	if (!city || !tile || !buildingType) {
		return appendDecision(
			game,
			industrialConstructionDelayedDecision(game, 'Unknown industrial tile')
		);
	}

	if (game.cash < buildingType.buildCost) {
		return appendDecision(
			game,
			industrialConstructionDelayedDecision(
				game,
				`${buildingType.name} requires ${buildingType.buildCost.toLocaleString('en-US')} cash.`
			)
		);
	}

	return {
		...game,
		cash: game.cash - buildingType.buildCost,
		industrialBuildings: [
			...game.industrialBuildings,
			createIndustrialBuilding(game, tile, buildingType)
		]
	};
}

function getActiveIndustryCity(game: GameState): IndustryCity | undefined {
	return game.industryCities.find((city) => city.id === game.activeIndustryCityId);
}

function createIndustrialBuilding(
	game: GameState,
	tile: IndustryTile,
	buildingType: IndustrialBuildingType
): IndustrialBuilding {
	return {
		id: `industry-building-${game.industrialBuildings.length + 1}`,
		typeId: buildingType.id,
		cityId: tile.cityId,
		tileId: tile.id,
		mapX: tile.x,
		mapY: tile.y,
		status: 'idle',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0
	};
}

function appendDecision(game: GameState, decision: DecisionItem): GameState {
	if (game.decisions.some((candidate) => candidate.id === decision.id)) {
		return game;
	}

	return {
		...game,
		decisions: [...game.decisions, decision]
	};
}

function industrialConstructionDelayedDecision(game: GameState, context: string): DecisionItem {
	return {
		id: `industrial-construction-delayed-${game.day}`,
		title: 'Industrial construction delayed',
		context,
		expiresOnDay: game.day + 1,
		options: [acknowledgeOption()]
	};
}

function acknowledgeOption(): DecisionOption {
	return {
		id: 'acknowledge',
		label: 'Acknowledge',
		description: 'Return to industry planning.',
		effects: {}
	};
}

function formatIndustryResourceLabel(resource: IndustryResourceId): string {
	return resource.replaceAll('-', ' ');
}
