import { INDUSTRIAL_BUILDING_TYPES, getIndustryTileById } from './industry';
import {
	createIndustryTileLookup,
	getIndustryBuildingFootprint,
	getOccupiedIndustryTileIds
} from './industryFootprint';
import { canUpgradeBuilding, getBuildingUpgradeCost } from './leveling';
import {
	decisionContextIndustrialLockedTile,
	decisionContextIndustrialOccupiedTile,
	decisionContextIndustrialRequiresCash,
	decisionContextIndustrialRequiresIndustrialTile,
	decisionContextIndustrialRequiresResource,
	decisionContextIndustrialUnknownBuilding,
	decisionContextIndustrialUnknownTile
} from './decisionContext';
import type { DecisionContext } from './decisionContext';
import { refreshWorldProgress } from './world';
import type {
	DecisionItem,
	DecisionOption,
	GameState,
	IndustrialBuilding,
	IndustrialBuildingType,
	IndustrialBuildingTypeId,
	IndustryCity,
	IndustryTile
} from './types';

export interface IndustrialPlacementContext {
	city: IndustryCity;
	tileLookup: ReturnType<typeof createIndustryTileLookup>;
	occupiedTileIds: ReadonlySet<string>;
}

export interface BuildIndustrialBuildingInput {
	tileId: string;
	buildingTypeId: IndustrialBuildingTypeId;
}

interface IndustrialConstructionDelay {
	tileId: string;
	buildingTypeId: IndustrialBuildingTypeId;
	context: DecisionContext;
}

export function getIndustrialPlacementBlockReason(
	game: GameState,
	tileId: string,
	buildingTypeId: IndustrialBuildingTypeId
): DecisionContext | null {
	const context = createIndustrialPlacementContext(game);

	if (!context) {
		return decisionContextIndustrialUnknownTile();
	}

	return getIndustrialPlacementBlockReasonWithContext(context, tileId, buildingTypeId);
}

export function createIndustrialPlacementContext(
	game: GameState
): IndustrialPlacementContext | null {
	const city = getActiveIndustryCity(game);
	if (!city) {
		return null;
	}

	const tileLookup = createIndustryTileLookup(city);
	return {
		city,
		tileLookup,
		occupiedTileIds: getOccupiedIndustryTileIds(city, game.industrialBuildings, tileLookup)
	};
}

export function getIndustrialPlacementBlockReasonWithContext(
	context: IndustrialPlacementContext,
	tileId: string,
	buildingTypeId: IndustrialBuildingTypeId
): DecisionContext | null {
	const tile = context.tileLookup.byId.get(tileId);
	const buildingType = INDUSTRIAL_BUILDING_TYPES[buildingTypeId];

	if (!tile) {
		return decisionContextIndustrialUnknownTile();
	}

	if (!buildingType) {
		return decisionContextIndustrialUnknownBuilding();
	}

	if (tile.locked) {
		return decisionContextIndustrialLockedTile();
	}

	const footprint = getIndustryBuildingFootprint(context.tileLookup, tile);

	if (footprint.missingCoordinates.length > 0) {
		return decisionContextIndustrialLockedTile();
	}

	if (footprint.tiles.some((footprintTile) => footprintTile.locked)) {
		return decisionContextIndustrialLockedTile();
	}

	if (footprint.tiles.some((footprintTile) => context.occupiedTileIds.has(footprintTile.id))) {
		return decisionContextIndustrialOccupiedTile();
	}

	// Resource-anchored buildings (well, pumpjack, etc.) are placed on the
	// anchor tile that carries the raw resource; the surrounding footprint tiles
	// are terrain-only. requiredResource is therefore checked against the anchor
	// tile only, deliberately asymmetric with requiresIndustrialTile (which
	// validates every footprint tile). Mirroring requiredResource across the
	// footprint would wrongly reject valid placements whose non-anchor tiles sit
	// on plain industrial terrain.
	if (buildingType.requiredResource && tile.resource !== buildingType.requiredResource) {
		return decisionContextIndustrialRequiresResource(buildingType.requiredResource);
	}

	if (
		buildingType.requiresIndustrialTile &&
		footprint.tiles.some((footprintTile) => footprintTile.terrain !== 'industrial')
	) {
		return decisionContextIndustrialRequiresIndustrialTile();
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
		return appendDecision(
			game,
			industrialConstructionDelayedDecision(game, {
				tileId: input.tileId,
				buildingTypeId: input.buildingTypeId,
				context: blockReason
			})
		);
	}

	if (!city || !tile || !buildingType) {
		return appendDecision(
			game,
			industrialConstructionDelayedDecision(game, {
				tileId: input.tileId,
				buildingTypeId: input.buildingTypeId,
				context: decisionContextIndustrialUnknownTile()
			})
		);
	}

	if (game.cash < buildingType.buildCost) {
		return appendDecision(
			game,
			industrialConstructionDelayedDecision(game, {
				tileId: input.tileId,
				buildingTypeId: input.buildingTypeId,
				context: decisionContextIndustrialRequiresCash(input.buildingTypeId, buildingType.buildCost)
			})
		);
	}

	return refreshWorldProgress({
		...game,
		cash: game.cash - buildingType.buildCost,
		industrialBuildings: [
			...game.industrialBuildings,
			createIndustrialBuilding(game, tile, buildingType)
		]
	});
}

export function upgradeBuilding(game: GameState, buildingId: string): GameState {
	const index = game.industrialBuildings.findIndex((building) => building.id === buildingId);

	if (index === -1) {
		console.warn(`upgradeBuilding: buildingId "${buildingId}" not found in game state`);
		return game;
	}

	const building = game.industrialBuildings[index]!;

	if (!canUpgradeBuilding(building.level)) {
		return game;
	}

	const buildingType = INDUSTRIAL_BUILDING_TYPES[building.typeId];
	if (!buildingType || buildingType.recipeId === null) {
		console.warn(
			`upgradeBuilding: buildingId "${buildingId}" has unresolved typeId "${building.typeId}"`
		);
		return game;
	}

	const cost = getBuildingUpgradeCost(building.level);

	if (game.cash < cost) {
		return game;
	}

	return {
		...game,
		cash: game.cash - cost,
		industrialBuildings: game.industrialBuildings.map((candidate, candidateIndex) =>
			candidateIndex === index ? { ...candidate, level: building.level + 1 } : candidate
		)
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
		level: 1,
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

function industrialConstructionDelayedDecision(
	game: GameState,
	delay: IndustrialConstructionDelay
): DecisionItem {
	return {
		id: [
			'industrial-construction-delayed',
			toDecisionIdPart(delay.buildingTypeId),
			toDecisionIdPart(delay.tileId),
			toDecisionIdPart(delay.context.code),
			game.day
		].join('-'),
		title: 'Industrial construction delayed',
		context: delay.context,
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

function toDecisionIdPart(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}
