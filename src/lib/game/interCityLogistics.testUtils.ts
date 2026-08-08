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
	// Derive nextRouteSequence from the highest injected canonical route ID, not
	// the array length. Tests deliberately inject non-contiguous IDs (e.g.
	// route-2/route-10/route-3), and production `createRecurringRoute` allocates
	// `route-${nextRouteSequence}` directly from this counter, so a length-based
	// bump both violates the codec invariant (every route sequence must be <
	// nextRouteSequence) and can hand `createRecurringRoute` an ID that already
	// exists. Mirrors `saveCodec.ts`'s loan-sequence Math.max pattern.
	let highestInjectedSequence = 0;
	for (const route of recurringRoutes) {
		highestInjectedSequence = Math.max(highestInjectedSequence, routeIdSequence(route.id));
	}
	const nextRouteSequence = Math.max(game.logistics.nextRouteSequence, highestInjectedSequence + 1);
	if (!Number.isSafeInteger(nextRouteSequence)) {
		throw new RangeError('withRecurringRoutes nextRouteSequence exceeds the safe integer range');
	}

	return {
		...game,
		logistics: {
			...game.logistics,
			recurringRoutes,
			nextRouteSequence
		}
	};
}

function routeIdSequence(id: string): number {
	if (!id.startsWith('route-')) return 0;
	const text = id.slice('route-'.length);
	if (!/^[1-9]\d*$/.test(text)) return 0;
	const sequence = Number(text);
	return Number.isSafeInteger(sequence) ? sequence : 0;
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
