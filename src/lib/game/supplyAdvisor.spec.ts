import { describe, expect, it } from 'vitest';
import * as supplyAdvisor from './supplyAdvisor';
import { getAvailableMaterialIds } from './supplyAdvisor';
import { createNewGame } from './state';
import { openWorldCity } from './world';
import type { GameState, IndustrialBuilding } from './types';

function baseGame(overrides: Partial<GameState> = {}): GameState {
	const game = createNewGame('convenience', 1);

	return {
		...game,
		day: 1,
		cash: 0,
		industrialBuildings: [],
		stores: [],
		cityInventories: [
			{
				cityId: 'industry-city',
				materials: {}
			}
		],
		...overrides
	};
}

function building(typeId: IndustrialBuilding['typeId']): IndustrialBuilding {
	return {
		id: `bld-${typeId}`,
		level: 1,
		typeId,
		cityId: 'industry-city',
		tileId: `t-${typeId}`,
		mapX: 0,
		mapY: 0,
		status: 'idle',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {}
	};
}

describe('supply advisor exports', () => {
	it('exposes only Build Menu material availability', () => {
		expect(Object.keys(supplyAdvisor).sort()).toEqual(['getAvailableMaterialIds']);
	});
});

describe('getAvailableMaterialIds', () => {
	it('scopes inventory and building outputs to the active industry city', () => {
		expect.assertions(2);
		const base = createNewGame('convenience', 20260802);
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
		const game: GameState = {
			...opened,
			activeIndustryCityId: 'industry-city',
			cityInventories: opened.cityInventories.map((inventory) =>
				inventory.cityId === 'breadbasket-basin'
					? { ...inventory, materials: { water: 12, 'bottled-water': 4 } }
					: { ...inventory, materials: {} }
			),
			industrialBuildings: [
				{
					...building('water-pump'),
					id: 'other-city-pump',
					cityId: 'breadbasket-basin',
					inventory: { water: 12 }
				},
				{
					...building('water-bottler'),
					id: 'other-city-bottler',
					cityId: 'breadbasket-basin',
					inventory: { 'bottled-water': 4 }
				}
			]
		};
		const available = getAvailableMaterialIds(game);

		expect(available).not.toContain('water');
		expect(available).not.toContain('bottled-water');
	});

	it('includes active city inventory stock and outputs of placed buildings', () => {
		expect.assertions(2);
		const available = getAvailableMaterialIds(
			baseGame({
				cityInventories: [
					{
						cityId: 'industry-city',
						materials: { grain: 4 }
					}
				],
				industrialBuildings: [building('water-pump')]
			})
		);
		expect(available).toContain('grain');
		expect(available).toContain('water');
	});

	it('skips recipe-less placed buildings (e.g. warehouses) and null/zero city inventory entries', () => {
		expect.assertions(2);
		const available = getAvailableMaterialIds(
			baseGame({
				cityInventories: [
					{
						cityId: 'industry-city',
						materials: { grain: null as unknown as number, water: 0 }
					}
				],
				industrialBuildings: [building('warehouse')]
			})
		);
		expect(available).not.toContain('grain');
		expect(available).not.toContain('water');
	});

	it('treats undefined city inventory quantities as zero and skips unknown placed type ids', () => {
		expect.assertions(2);
		const available = getAvailableMaterialIds(
			baseGame({
				cityInventories: [
					{
						cityId: 'industry-city',
						materials: { grain: undefined as unknown as number, salt: 3 }
					}
				],
				industrialBuildings: [
					// An unrecognized typeId must not throw or contribute outputs.
					building('nonexistent-building' as IndustrialBuilding['typeId'])
				]
			})
		);
		expect(available).not.toContain('grain');
		expect(available).toContain('salt');
	});

	it('falls back to an empty inventory when the active industry city has no materialized inventory', () => {
		expect.assertions(2);
		// industry-city is opened and in industryCities (from createNewGame), but
		// its city inventory entry is missing, so getCityInventory fails and
		// getActiveIndustryInputs returns an empty inventory without throwing.
		const available = getAvailableMaterialIds(
			baseGame({
				cityInventories: [],
				industrialBuildings: [building('water-pump')]
			})
		);
		// The placed water-pump output still counts as available even though the
		// city inventory itself is unavailable.
		expect(available).toContain('water');
		expect(available).not.toContain('grain');
	});

	it('counts positive building inventory quantities as available materials', () => {
		expect.assertions(1);
		const available = getAvailableMaterialIds(
			baseGame({
				industrialBuildings: [
					{
						...building('water-pump'),
						// 'grain' is not a water-pump recipe output, so its
						// presence is attributable solely to the inventory
						// quantity guard.
						inventory: { grain: 5 }
					}
				]
			})
		);
		expect(available).toContain('grain');
	});

	it('skips zero-quantity building inventory entries', () => {
		expect.assertions(1);
		const available = getAvailableMaterialIds(
			baseGame({
				industrialBuildings: [
					{
						...building('water-pump'),
						inventory: { grain: 0 }
					}
				]
			})
		);
		// 'grain' is not a water-pump recipe output, so its absence confirms
		// the zero-quantity inventory entry is skipped (and does not throw).
		expect(available).not.toContain('grain');
	});
});
