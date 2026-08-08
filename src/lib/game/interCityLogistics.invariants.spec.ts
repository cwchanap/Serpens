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
import {
	createTwoIndustryCityGame,
	withCityMaterials,
	withRecurringRoutes,
	withWarehouses
} from './interCityLogistics.testUtils';

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

		expect(() => processRecurringRouteDispatches(game)).toThrow(/Transfer origin is invalid/);
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
