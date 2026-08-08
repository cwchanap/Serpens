import { createNewGame } from './state';
import { openWorldCity } from './world';
import type {
	GameState,
	IndustrialBuilding,
	MaterialId,
	RecurringRoute,
	WorldCityId
} from './types';

export function withCityMaterials(
	game: GameState,
	cityId: WorldCityId,
	materials: Partial<Record<MaterialId, number>>
): GameState {
	return {
		...game,
		cityInventories: game.cityInventories.map((inventory) =>
			inventory.cityId === cityId ? { ...inventory, materials } : inventory
		)
	};
}

export function withRecurringRoutes(game: GameState, recurringRoutes: RecurringRoute[]): GameState {
	return {
		...game,
		logistics: {
			...game.logistics,
			recurringRoutes
		}
	};
}

export function createLogisticsBuilding(
	id: string,
	typeId: IndustrialBuilding['typeId'],
	cityId: WorldCityId,
	mapX: number,
	mapY = 2
): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId,
		cityId,
		tileId: `${cityId}-${mapX}-${mapY}`,
		mapX,
		mapY,
		status: 'idle',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {}
	};
}

export function withWarehouses(
	game: GameState,
	cityIds: readonly WorldCityId[],
	options: { mapXOffset?: number; mapY?: number } = {}
): GameState {
	const { mapXOffset = 1, mapY = 1 } = options;
	return {
		...game,
		industrialBuildings: [
			...game.industrialBuildings,
			...cityIds.map((cityId, index) =>
				createLogisticsBuilding(
					`warehouse-${cityId}`,
					'warehouse',
					cityId,
					mapXOffset + index,
					mapY
				)
			)
		]
	};
}

export function createTwoIndustryCityGame(
	options: { seed?: number; day?: number; materials?: boolean } = {}
): GameState {
	const { seed = 20260806, day = 7, materials = true } = options;
	const base = createNewGame('convenience', seed);
	const opened = openWorldCity(
		{
			...base,
			cash: 100_000,
			world: {
				...base.world,
				revealedCityIds: [...base.world.revealedCityIds, 'breadbasket-basin']
			}
		},
		'breadbasket-basin'
	);
	const game = { ...opened, day, cash: 100_000 };
	if (!materials) {
		return game;
	}
	return withCityMaterials(
		withCityMaterials(game, 'industry-city', { water: 50 }),
		'breadbasket-basin',
		{ water: 1, grain: 2 }
	);
}
