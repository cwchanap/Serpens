import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('./cityInventory', async (importOriginal) => {
	const actual = await importOriginal<typeof import('./cityInventory')>();
	return {
		...actual,
		getCityInventory: vi.fn(actual.getCityInventory),
		removeCityInventoryMaterial: vi.fn(actual.removeCityInventoryMaterial)
	};
});

import { getCityInventory, removeCityInventoryMaterial } from './cityInventory';
import { dispatchManualTransfer, processRecurringRouteDispatches } from './interCityLogistics';
import { createNewGame } from './state';
import type { GameState, MaterialId, RecurringRoute, WorldCityId } from './types';
import { openWorldCity } from './world';

function withCityMaterials(
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

function createTwoIndustryCityGame(): GameState {
	const base = createNewGame('convenience', 20260806);
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

	return withCityMaterials(
		withCityMaterials({ ...opened, day: 7, cash: 100_000 }, 'industry-city', { water: 50 }),
		'breadbasket-basin',
		{ water: 1, grain: 2 }
	);
}

function withRecurringRoutes(game: GameState, recurringRoutes: RecurringRoute[]): GameState {
	return {
		...game,
		logistics: {
			...game.logistics,
			recurringRoutes
		}
	};
}

function withWarehouses(game: GameState, cityIds: readonly WorldCityId[]): GameState {
	return {
		...game,
		industrialBuildings: [
			...game.industrialBuildings,
			...cityIds.map((cityId, index) => ({
				id: `warehouse-${cityId}`,
				level: 1,
				typeId: 'warehouse' as const,
				cityId,
				tileId: `${cityId}-warehouse-${index}`,
				mapX: index + 1,
				mapY: 1,
				status: 'idle' as const,
				lastProduction: [],
				producedTotal: 0,
				importedInputTotal: 0,
				blockedDays: 0,
				inventory: {}
			}))
		]
	};
}

afterEach(() => {
	vi.mocked(getCityInventory).mockReset();
	vi.mocked(removeCityInventoryMaterial).mockReset();
});

describe('inter-city logistics defensive invariants', () => {
	test('throws when the transfer origin becomes invalid before dispatch', () => {
		const game = withRecurringRoutes(
			withCityMaterials(
				withWarehouses(createTwoIndustryCityGame(), ['breadbasket-basin']),
				'industry-city',
				{ water: 10 }
			),
			[
				{
					id: 'route-1',
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'water',
					capacity: 10,
					frequencyDays: 3,
					leadTimeDays: 2,
					transportCostPerUnit: 2,
					priority: 1,
					state: 'active',
					nextDispatchOnDay: 7
				}
			]
		);

		const realImpl = vi.mocked(getCityInventory).getMockImplementation()!;
		vi.mocked(getCityInventory)
			.mockImplementationOnce(realImpl)
			.mockImplementationOnce(() => ({ ok: false, reason: 'inventory-missing' }));

		expect(() => processRecurringRouteDispatches(game, 7)).toThrow(/Transfer origin is invalid/);
	});

	test('throws when the transfer origin stock changes before dispatch', () => {
		const game = createTwoIndustryCityGame();

		vi.mocked(removeCityInventoryMaterial).mockReturnValue({
			inventory: game.cityInventories[0]!,
			quantityRemoved: 0,
			shortage: 4
		});

		expect(() =>
			dispatchManualTransfer(game, {
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water',
				quantity: 4
			})
		).toThrow(/Transfer origin stock changed before dispatch/);
	});
});
