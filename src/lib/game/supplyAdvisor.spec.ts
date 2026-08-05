import { describe, expect, it } from 'vitest';
import {
	buildSupplyAdvisor,
	getAvailableMaterialIds,
	getBuildingTypeProducing
} from './supplyAdvisor';
import { createNewGame } from './state';
import { openWorldCity } from './world';
import type { GameState, IndustrialBuilding, MaterialId, Store } from './types';

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
				capacity: 0,
				materials: {},
				overflowUnits: 0,
				overflowCost: 0
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

function bottledWaterChain(game: GameState) {
	return buildSupplyAdvisor(game).find((chain) => chain.finishedMaterialId === 'bottled-water');
}

describe('getBuildingTypeProducing', () => {
	it('maps materials to the building that outputs them', () => {
		expect.assertions(2);
		expect(getBuildingTypeProducing('bottled-water')?.id).toBe('water-bottler');
		expect(getBuildingTypeProducing('water')?.id).toBe('water-pump');
	});

	it('returns null for a material no building produces, skipping recipe-less types like warehouses', () => {
		expect.assertions(1);
		expect(getBuildingTypeProducing('nonexistent-material' as MaterialId)).toBeNull();
	});
});

describe('buildSupplyAdvisor', () => {
	it('scopes advisor steps and available materials to the active industry city', () => {
		expect.assertions(4);
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
					? { ...inventory, capacity: 200, materials: { water: 12, 'bottled-water': 4 } }
					: { ...inventory, capacity: 200, materials: {} }
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

		const chain = bottledWaterChain(game);
		const available = getAvailableMaterialIds(game);

		expect(chain?.steps.map((step) => step.state)).toEqual(['buildable', 'blocked']);
		expect(chain?.complete).toBe(false);
		expect(available).not.toContain('water');
		expect(available).not.toContain('bottled-water');
	});

	it('falls back to Tier-1 starter chains when there is no retail demand', () => {
		expect.assertions(4);
		const chain = bottledWaterChain(baseGame());
		expect(chain).toBeDefined();
		expect(chain!.steps.map((step) => step.buildingTypeId)).toEqual([
			'water-pump',
			'water-bottler'
		]);
		expect(chain!.nextBuildTypeId).toBe('water-pump');
		expect(chain!.steps[1].state).toBe('blocked');
	});

	it('recommends the next missing step once upstream is built', () => {
		expect.assertions(3);
		const chain = bottledWaterChain(baseGame({ industrialBuildings: [building('water-pump')] }));
		expect(chain!.steps[0].state).toBe('built');
		expect(chain!.steps[1].state).toBe('buildable');
		expect(chain!.nextBuildTypeId).toBe('water-bottler');
	});

	it('marks a chain complete when every building is placed', () => {
		expect.assertions(2);
		const chain = bottledWaterChain(
			baseGame({ industrialBuildings: [building('water-pump'), building('water-bottler')] })
		);
		expect(chain!.complete).toBe(true);
		expect(chain!.nextBuildTypeId).toBeNull();
	});

	it('is driven by retail demand when stores exist', () => {
		expect.assertions(1);
		const store = {
			id: 's1',
			products: [
				{
					categoryId: 'bottled-water',
					stock: 0,
					reorderThreshold: 1,
					targetStock: 1,
					sellingPrice: 1
				}
			]
		} as unknown as Store;
		const chains = buildSupplyAdvisor(baseGame({ stores: [store] }));
		expect(chains.some((chain) => chain.finishedMaterialId === 'bottled-water')).toBe(true);
	});

	it('falls back to Tier-1 starter chains when store products map to no finished material', () => {
		expect.assertions(1);
		const store = {
			id: 's1',
			products: [
				{
					categoryId: 'games',
					stock: 0,
					reorderThreshold: 1,
					targetStock: 1,
					sellingPrice: 1
				}
			]
		} as unknown as Store;
		const chains = buildSupplyAdvisor(baseGame({ stores: [store] }));
		expect(chains.some((chain) => chain.finishedMaterialId === 'bottled-water')).toBe(true);
	});
});

describe('getAvailableMaterialIds', () => {
	it('includes active city inventory stock and outputs of placed buildings', () => {
		expect.assertions(2);
		const available = getAvailableMaterialIds(
			baseGame({
				cityInventories: [
					{
						cityId: 'industry-city',
						capacity: 10,
						materials: { grain: 4 },
						overflowUnits: 0,
						overflowCost: 0
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
						capacity: 10,
						materials: { grain: null as unknown as number, water: 0 },
						overflowUnits: 0,
						overflowCost: 0
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
						capacity: 10,
						materials: { grain: undefined as unknown as number, salt: 3 },
						overflowUnits: 0,
						overflowCost: 0
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
						inventory: { water: 5 }
					}
				]
			})
		);
		expect(available).toContain('water');
	});

	it('skips zero-quantity building inventory entries', () => {
		expect.assertions(1);
		const available = getAvailableMaterialIds(
			baseGame({
				industrialBuildings: [
					{
						...building('water-pump'),
						inventory: { water: 0 }
					}
				]
			})
		);
		// The pump's recipe output still counts, but its zero-quantity inventory
		// entry must not be double-counted (and must not throw).
		expect(available).toContain('water');
	});
});
