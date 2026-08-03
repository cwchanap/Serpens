import { describe, expect, it, vi } from 'vitest';

// These tests exercise the defensive branches of `buildSupplyAdvisor` that real
// production data never triggers: every real recipe input and every real
// finished material has a producer building, so the "no producer" guards are
// only reachable with a contrived industry dataset. We mock `./industry` with a
// minimal dataset that intentionally includes (a) a finished material with no
// producing building and (b) a recipe whose input has no producing building.
// The mock is scoped to this file, so the sibling `supplyAdvisor.spec.ts`
// continues to exercise the real industry data.

vi.mock('./industry', () => {
	const MATERIALS = {
		'finished-lonely': {
			id: 'finished-lonely',
			name: 'Lonely',
			kind: 'finished',
			importCost: 1,
			localValue: 1
		},
		'finished-x': { id: 'finished-x', name: 'X', kind: 'finished', importCost: 2, localValue: 1 },
		'raw-y': { id: 'raw-y', name: 'Raw Y', kind: 'raw', importCost: 1, localValue: 1 }
	} as const;

	const PRODUCTION_RECIPES = {
		'make-x': {
			id: 'make-x',
			inputs: [{ materialId: 'raw-y', quantity: 1 }],
			outputs: [{ materialId: 'finished-x', quantity: 1 }],
			operatingCost: 0,
			stage: 'final'
		}
	} as const;

	const INDUSTRIAL_BUILDING_TYPES = {
		'x-factory': {
			id: 'x-factory',
			name: 'X Factory',
			buildCost: 1,
			dailyOperatingCost: 1,
			requiredResource: null,
			requiresIndustrialTile: false,
			recipeId: 'make-x',
			warehouseCapacity: 0,
			tier: 1
		}
	} as const;

	return { MATERIALS, PRODUCTION_RECIPES, INDUSTRIAL_BUILDING_TYPES };
});

import { buildSupplyAdvisor } from './supplyAdvisor';
import { createEmptyFinanceState } from './finance';
import { createInitialEventRuntime } from './eventSelection';
import type { GameState, IndustrialBuilding, Store } from './types';

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
		cityInventories: [],
		retailSupplyAssignments: [],
		stores: [],
		staff: [],
		hiringCandidates: [],
		events: createInitialEventRuntime(1),
		decisions: [],
		reports: [],
		...overrides
	};
}

function storeWith(categoryId: string): Store {
	return {
		id: 's1',
		products: [
			{
				categoryId,
				stock: 0,
				reorderThreshold: 1,
				targetStock: 1,
				sellingPrice: 1
			}
		]
	} as unknown as Store;
}

describe('buildSupplyAdvisor defensive branches', () => {
	it('skips a wanted finished material that no building produces', () => {
		expect.assertions(1);
		// 'finished-lonely' is a finished material with no producer building, so
		// buildSupplyAdvisor must `continue` past it without emitting a chain.
		const chains = buildSupplyAdvisor(baseGame({ stores: [storeWith('finished-lonely')] }));
		expect(chains).toEqual([]);
	});

	it('treats a recipe input with no producer as satisfied and builds the chain', () => {
		expect.assertions(3);
		// 'finished-x' is produced by 'x-factory', whose recipe consumes 'raw-y'.
		// No building produces 'raw-y', so collectChain short-circuits on the
		// `!producer` guard and inputsSatisfied falls back to the `: true` branch
		// (an input with no producer is treated as available).
		const chains = buildSupplyAdvisor(baseGame({ stores: [storeWith('finished-x')] }));
		const chain = chains.find((c) => c.finishedMaterialId === ('finished-x' as never));

		expect(chain).toBeDefined();
		expect(chain!.steps.map((step) => step.buildingTypeId)).toEqual(['x-factory']);
		expect(chain!.nextBuildTypeId).toBe('x-factory');
	});

	it('falls back to tier-1 starter chains when no store demand exists', () => {
		expect.assertions(1);
		// With no stores, getWantedFinishedMaterials falls back to finished
		// materials produced by a tier-1 building — here only 'finished-x'.
		const chains = buildSupplyAdvisor(baseGame());
		expect(chains.some((c) => c.finishedMaterialId === ('finished-x' as never))).toBe(true);
	});

	it('ignores an unrecognized placed building typeId', () => {
		expect.assertions(1);
		const unknownBuilding: IndustrialBuilding = {
			id: 'bld-unknown',
			level: 1,
			typeId: 'nonexistent' as IndustrialBuilding['typeId'],
			cityId: 'industry-city',
			tileId: 't-unknown',
			mapX: 0,
			mapY: 0,
			status: 'idle',
			lastProduction: [],
			producedTotal: 0,
			importedInputTotal: 0,
			blockedDays: 0,
			inventory: {}
		};
		// Must not throw; the unknown building simply contributes nothing.
		const chains = buildSupplyAdvisor(
			baseGame({ industrialBuildings: [unknownBuilding], stores: [storeWith('finished-x')] })
		);
		expect(chains.find((c) => c.finishedMaterialId === ('finished-x' as never))).toBeDefined();
	});
});
