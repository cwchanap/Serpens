import { describe, expect, test, vi } from 'vitest';
import { getCityInventoryStats } from './cityInventory';
import {
	INTER_CITY_DISTANCE_PER_BAND,
	dispatchManualTransfer,
	processTransferArrivals,
	quoteInterCityTransfer,
	type ManualTransferFailure,
	type ManualTransferInput
} from './interCityLogistics';
import { createNewGame } from './state';
import type { GameState, MaterialId, TransferOrder, WorldCityId } from './types';
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

function createThreeIndustryCityGame(): GameState {
	const twoCityGame = createTwoIndustryCityGame();
	const opened = openWorldCity(
		{
			...twoCityGame,
			cash: 100_000,
			world: {
				...twoCityGame.world,
				revealedCityIds: [...twoCityGame.world.revealedCityIds, 'quarry-works']
			}
		},
		'quarry-works'
	);

	return {
		...opened,
		cash: 100_000,
		cityInventories: opened.cityInventories.map((inventory) => ({
			...inventory,
			materials: { water: 100 }
		}))
	};
}

function validManualInput(overrides: Partial<ManualTransferInput> = {}): ManualTransferInput {
	return {
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		quantity: 5,
		...overrides
	};
}

function createTransferOrder(overrides: Partial<TransferOrder> = {}): TransferOrder {
	return {
		id: 'transfer-1',
		source: { kind: 'manual' },
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		quantity: 4,
		createdOnDay: 7,
		dispatchedOnDay: 7,
		arrivalOnDay: 9,
		transportCost: 8,
		status: 'in-transit',
		...overrides
	};
}

function withTransferOrders(game: GameState, transferOrders: TransferOrder[]): GameState {
	return {
		...game,
		logistics: {
			...game.logistics,
			transferOrders
		}
	};
}

type ManualFailureCase = {
	name: string;
	reason: ManualTransferFailure;
	setup: () => { game: GameState; input: ManualTransferInput };
};

const manualFailureCases: readonly ManualFailureCase[] = [
	{
		name: 'an invalid origin',
		reason: 'invalid-origin',
		setup: () => ({
			game: createTwoIndustryCityGame(),
			input: validManualInput({ originCityId: 'x' })
		})
	},
	{
		name: 'an invalid destination',
		reason: 'invalid-destination',
		setup: () => ({
			game: createTwoIndustryCityGame(),
			input: validManualInput({ destinationCityId: 'harbor-city' })
		})
	},
	{
		name: 'matching endpoints',
		reason: 'same-city',
		setup: () => ({
			game: createTwoIndustryCityGame(),
			input: validManualInput({ destinationCityId: 'industry-city' })
		})
	},
	{
		name: 'an unknown material',
		reason: 'invalid-material',
		setup: () => ({
			game: createTwoIndustryCityGame(),
			input: validManualInput({ materialId: 'unknown-material' })
		})
	},
	{
		name: 'a nonpositive quantity',
		reason: 'invalid-quantity',
		setup: () => ({ game: createTwoIndustryCityGame(), input: validManualInput({ quantity: 0 }) })
	},
	{
		name: 'a quantity whose transport total exceeds safe integer range',
		reason: 'invalid-quantity',
		setup: () => {
			const game = withCityMaterials(createTwoIndustryCityGame(), 'industry-city', {
				water: Number.MAX_SAFE_INTEGER
			});
			return {
				game: { ...game, cash: Number.MAX_SAFE_INTEGER },
				input: validManualInput({ quantity: Number.MAX_SAFE_INTEGER })
			};
		}
	},
	{
		name: 'insufficient origin stock',
		reason: 'insufficient-origin-stock',
		setup: () => ({ game: createTwoIndustryCityGame(), input: validManualInput({ quantity: 51 }) })
	},
	{
		name: 'insufficient cash',
		reason: 'insufficient-cash',
		setup: () => ({
			game: { ...createTwoIndustryCityGame(), cash: 9 },
			input: validManualInput()
		})
	}
];

describe('inter-city manual logistics', () => {
	test('quotes the current industry-city pairs with the pinned distance bands', () => {
		const game = createThreeIndustryCityGame();

		expect(INTER_CITY_DISTANCE_PER_BAND).toBe(25);
		expect(quoteInterCityTransfer(game, validManualInput())).toEqual({
			ok: true,
			quote: { leadTimeDays: 2, transportCostPerUnit: 2, transportCost: 10 }
		});
		expect(
			quoteInterCityTransfer(
				game,
				validManualInput({ originCityId: 'breadbasket-basin', destinationCityId: 'quarry-works' })
			)
		).toEqual({
			ok: true,
			quote: { leadTimeDays: 2, transportCostPerUnit: 2, transportCost: 10 }
		});
		expect(
			quoteInterCityTransfer(game, validManualInput({ destinationCityId: 'quarry-works' }))
		).toEqual({
			ok: true,
			quote: { leadTimeDays: 3, transportCostPerUnit: 3, transportCost: 15 }
		});
	});

	test.each(manualFailureCases)(
		'reuses quote validation and leaves the game unchanged for $name',
		({ reason, setup }) => {
			const { game, input } = setup();
			const before = structuredClone(game);

			expect(quoteInterCityTransfer(game, input)).toEqual({ ok: false, reason });
			expect(dispatchManualTransfer(game, input)).toEqual({ ok: false, reason });
			expect(game).toEqual(before);
		}
	);

	test('dispatches a quoted manual transfer once with the full immediate cost', () => {
		const game = createTwoIndustryCityGame();
		const before = structuredClone(game);
		const input = validManualInput({ quantity: 4 });
		const quote = quoteInterCityTransfer(game, input);

		expect(quote).toEqual({
			ok: true,
			quote: { leadTimeDays: 2, transportCostPerUnit: 2, transportCost: 8 }
		});

		const result = dispatchManualTransfer(game, input);
		expect(result.ok).toBe(true);
		if (!result.ok) {
			throw new Error(`Expected successful dispatch, received ${result.reason}`);
		}

		const expectedOrder = createTransferOrder();
		expect(result.order).toEqual(expectedOrder);
		expect(result.game.cash).toBe(99_992);
		expect(
			result.game.cityInventories.find((inventory) => inventory.cityId === 'industry-city')
		).toEqual({ cityId: 'industry-city', materials: { water: 46 } });
		expect(
			result.game.cityInventories.find((inventory) => inventory.cityId === 'breadbasket-basin')
		).toEqual({ cityId: 'breadbasket-basin', materials: { water: 1, grain: 2 } });
		expect(result.game.logistics).toEqual({
			transferOrders: [expectedOrder],
			recurringRoutes: before.logistics.recurringRoutes,
			nextTransferSequence: 2,
			nextRouteSequence: before.logistics.nextRouteSequence
		});
		expect(game).toEqual(before);
	});

	test('leaves in-transit orders and inventories untouched before their arrival day', () => {
		const game = withTransferOrders(createTwoIndustryCityGame(), [createTransferOrder()]);

		const result = processTransferArrivals(game, 8);

		expect(result.arrivals).toEqual([]);
		expect(result.deliveredUnits).toBe(0);
		expect(result.game).toEqual(game);
	});

	test('delivers due transfers in raw transfer-ID order and changes only their status', () => {
		const transferTwo = createTransferOrder({
			id: 'transfer-2',
			materialId: 'grain',
			quantity: 5,
			transportCost: 10,
			arrivalOnDay: 8
		});
		const notYetDue = createTransferOrder({ id: 'transfer-1', arrivalOnDay: 9 });
		const transferTen = createTransferOrder({ id: 'transfer-10', quantity: 4, arrivalOnDay: 8 });
		const game = withTransferOrders(createTwoIndustryCityGame(), [
			transferTwo,
			notYetDue,
			transferTen
		]);
		const localeCompare = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
			throw new Error('transfer arrival ordering must not depend on locale');
		});

		try {
			const result = processTransferArrivals(game, 8);

			expect(result.arrivals).toEqual([
				{
					transferOrderId: 'transfer-10',
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'water',
					quantity: 4
				},
				{
					transferOrderId: 'transfer-2',
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'grain',
					quantity: 5
				}
			]);
			expect(result.deliveredUnits).toBe(9);
			expect(
				result.game.cityInventories.find((inventory) => inventory.cityId === 'breadbasket-basin')
			).toEqual({ cityId: 'breadbasket-basin', materials: { water: 5, grain: 7 } });
			expect(result.game.logistics.transferOrders).toEqual([
				{ ...transferTwo, status: 'delivered' },
				notYetDue,
				{ ...transferTen, status: 'delivered' }
			]);
		} finally {
			localeCompare.mockRestore();
		}
	});

	test('allows a due delivery to exceed destination capacity without a cash charge', () => {
		const game = withTransferOrders(createTwoIndustryCityGame(), [
			createTransferOrder({ arrivalOnDay: 8, quantity: 10, transportCost: 20 })
		]);

		const result = processTransferArrivals(game, 8);
		const destinationStats = getCityInventoryStats(result.game, 'breadbasket-basin');

		expect(result.game.cash).toBe(game.cash);
		expect(destinationStats).toMatchObject({ capacity: 0, used: 13, overflowUnits: 13 });
		expect(result.arrivals).toEqual([
			{
				transferOrderId: 'transfer-1',
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water',
				quantity: 10
			}
		]);
	});
});
