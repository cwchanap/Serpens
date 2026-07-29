import { describe, expect, it } from 'vitest';
import {
	buildSupplyAdvisor,
	getAvailableMaterialIds,
	getBuildingTypeProducing
} from './supplyAdvisor';
import { createEmptyFinanceState } from './finance';
import type { GameState, IndustrialBuilding, MaterialId, Store } from './types';

function baseGame(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 1,
		rngState: 0,
		day: 1,
		cash: 0,
		finance: createEmptyFinanceState(1),
		policy: {} as GameState['policy'],
		scorecard: {} as GameState['scorecard'],
		world: {} as GameState['world'],
		storeCap: 5,
		cities: [],
		activeCityId: 'harbor-city',
		industryCities: [],
		activeIndustryCityId: 'industry-city',
		industrialBuildings: [],
		warehouse: { capacity: 0, materials: {}, overflowUnits: 0, overflowCost: 0 },
		stores: [],
		staff: [],
		hiringCandidates: [],
		decisions: [],
		reports: [],
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
	it('includes warehouse stock and outputs of placed buildings', () => {
		expect.assertions(2);
		const available = getAvailableMaterialIds(
			baseGame({
				warehouse: { capacity: 10, materials: { grain: 4 }, overflowUnits: 0, overflowCost: 0 },
				industrialBuildings: [building('water-pump')]
			})
		);
		expect(available).toContain('grain');
		expect(available).toContain('water');
	});

	it('skips recipe-less placed buildings (e.g. warehouses) and null/zero warehouse entries', () => {
		expect.assertions(2);
		const available = getAvailableMaterialIds(
			baseGame({
				warehouse: {
					capacity: 10,
					materials: { grain: null as unknown as number, water: 0 },
					overflowUnits: 0,
					overflowCost: 0
				},
				industrialBuildings: [building('warehouse')]
			})
		);
		expect(available).not.toContain('grain');
		expect(available).not.toContain('water');
	});

	it('treats undefined warehouse quantities as zero and skips unknown placed type ids', () => {
		expect.assertions(2);
		const available = getAvailableMaterialIds(
			baseGame({
				warehouse: {
					capacity: 10,
					materials: { grain: undefined as unknown as number, salt: 3 },
					overflowUnits: 0,
					overflowCost: 0
				},
				industrialBuildings: [
					// An unrecognized typeId must not throw or contribute outputs.
					building('nonexistent-building' as IndustrialBuilding['typeId'])
				]
			})
		);
		expect(available).not.toContain('grain');
		expect(available).toContain('salt');
	});
});
