import { describe, expect, test } from 'vitest';
import {
	addCityInventoryMaterial,
	assertValidEntityCityOwnership,
	compareWorldCityIds,
	findEntityCityOwnershipIssues,
	getCityInventory,
	getCityInventoryStats,
	getCityInventoryUsed,
	initializeCityInventory,
	initializeRetailSupplyAssignment,
	removeCityInventoryMaterial,
	resolveWorldCityId,
	selectDefaultRetailSupplyCity,
	supportsCityInventory
} from './cityInventory';
import { createNewGame } from './state';
import type { CityInventory, GameState, IndustrialBuilding, WorldCityId } from './types';
import { openWorldCity } from './world';

function createCityInventory(
	cityId: WorldCityId,
	overrides: Partial<CityInventory> = {}
): CityInventory {
	return {
		cityId,
		materials: {},
		...overrides
	};
}

function createWarehouseBuilding(id: string, cityId: string): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId: 'warehouse',
		cityId,
		tileId: `${cityId}-warehouse`,
		mapX: 1,
		mapY: 1,
		status: 'idle',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {}
	};
}

function withCityInventories(game: GameState, cityInventories: CityInventory[]) {
	return { ...game, cityInventories };
}

function createAllocationGame(activeIndustryCityId: WorldCityId = 'industry-city'): GameState {
	const base = createNewGame('convenience', 20260802);

	return {
		...base,
		world: {
			...base.world,
			revealedCityIds: [...base.world.revealedCityIds, 'breadbasket-basin'],
			openedCityIds: [...base.world.openedCityIds, 'breadbasket-basin']
		},
		industryCities: [
			...base.industryCities,
			{ ...base.industryCities[0]!, id: 'breadbasket-basin', name: 'Breadbasket Basin' }
		],
		activeIndustryCityId
	};
}

describe('city inventory helpers', () => {
	test('narrows catalog ids and compares them by catalog order', () => {
		expect(resolveWorldCityId('industry-city')).toBe('industry-city');
		expect(resolveWorldCityId('unknown-city')).toBeUndefined();
		expect(compareWorldCityIds('harbor-city', 'industry-city')).toBeLessThan(0);
		expect(compareWorldCityIds('quarry-works', 'breadbasket-basin')).toBeGreaterThan(0);
		expect(compareWorldCityIds('industry-city', 'industry-city')).toBe(0);
	});

	test('returns typed access failures and reads sparse material keys as zero', () => {
		const base = createNewGame('convenience', 20260802);
		const withoutInventory = withCityInventories(base, []);
		const withInventory = withCityInventories(base, [createCityInventory('industry-city')]);

		expect(supportsCityInventory(base, 'industry-city')).toBe(true);
		expect(supportsCityInventory(base, 'harbor-city')).toBe(false);
		expect(getCityInventory(base, 'unknown-city')).toEqual({ ok: false, reason: 'unknown-city' });
		expect(getCityInventory(base, 'breadbasket-basin')).toEqual({
			ok: false,
			reason: 'city-closed'
		});
		expect(getCityInventory(base, 'harbor-city')).toEqual({
			ok: false,
			reason: 'unsupported-city'
		});
		expect(getCityInventory(withoutInventory, 'industry-city')).toEqual({
			ok: false,
			reason: 'inventory-missing'
		});

		const result = getCityInventory(withInventory, 'industry-city');
		expect(result.ok).toBe(true);
		if (!result.ok) {
			return;
		}

		expect(result.index).toBe(0);
		expect(result.inventory.cityId).toBe('industry-city');
		expect(result.inventory.materials.water ?? 0).toBe(0);
	});

	test('updates materials immutably without persisting derived pressure fields', () => {
		const initial = createCityInventory('industry-city', { materials: { water: 1 } });
		const added = addCityInventoryMaterial(initial, 'water', 3);
		const removed = removeCityInventoryMaterial(added, 'water', 10);

		expect(initial).toEqual({
			cityId: 'industry-city',
			materials: { water: 1 }
		});
		expect(added).toEqual({ cityId: 'industry-city', materials: { water: 4 } });
		expect(getCityInventoryUsed(added)).toBe(4);
		expect(removed).toEqual({
			inventory: {
				cityId: 'industry-city',
				materials: { water: 0 }
			},
			quantityRemoved: 4,
			shortage: 6
		});
	});

	test('derives 400 capacity and 20 overflow cost from only same-city warehouses', () => {
		const base = createAllocationGame();
		const game = withCityInventories(
			{
				...base,
				industrialBuildings: [
					createWarehouseBuilding('industry-warehouse-a', 'industry-city'),
					createWarehouseBuilding('industry-warehouse-b', 'industry-city'),
					createWarehouseBuilding('breadbasket-warehouse', 'breadbasket-basin')
				]
			},
			[
				createCityInventory('industry-city', { materials: { water: 410 } }),
				createCityInventory('breadbasket-basin')
			]
		);
		expect(getCityInventoryStats(game, 'industry-city')).toEqual({
			capacity: 400,
			used: 410,
			overflowUnits: 10,
			overflowCost: 20
		});
	});

	test('throws an invariant error when the current city inventory is missing', () => {
		const game = withCityInventories(createNewGame('convenience', 20260802), []);

		expect(() => getCityInventoryStats(game, 'industry-city')).toThrow(
			'City inventory invariant: inventory-missing'
		);
	});

	test('throws an invariant error when the current city inventory has invalid materials', () => {
		const game = withCityInventories(createNewGame('convenience', 20260802), [
			createCityInventory('industry-city', { materials: { water: -1 } })
		]);

		expect(() => getCityInventoryStats(game, 'industry-city')).toThrow(
			'City inventory invariant: invalid inventory for industry-city'
		);
	});

	test('canonicalizes mutation requests to safe nonnegative whole units', () => {
		const inventory = createCityInventory('industry-city', { materials: { water: 1 } });

		expect(addCityInventoryMaterial(inventory, 'water', 2.9).materials.water).toBe(3);
		expect(
			addCityInventoryMaterial(inventory, 'water', Number.POSITIVE_INFINITY).materials.water
		).toBe(1);
		expect(
			addCityInventoryMaterial(inventory, 'water', Number.MAX_SAFE_INTEGER + 1).materials.water
		).toBe(1);
		expect(removeCityInventoryMaterial(inventory, 'water', -4)).toMatchObject({
			quantityRemoved: 0,
			shortage: 0
		});
	});

	test('rejects arithmetic that would create unsafe inventory or pressure state', () => {
		const maximumMaterial = createCityInventory('industry-city', {
			materials: { water: Number.MAX_SAFE_INTEGER }
		});

		expect(() => addCityInventoryMaterial(maximumMaterial, 'water', 1)).toThrow(RangeError);
		expect(() =>
			getCityInventoryUsed(
				createCityInventory('industry-city', {
					materials: { water: Number.MAX_SAFE_INTEGER, grain: 1 }
				})
			)
		).toThrow(RangeError);
	});

	test('discovers invalid store and industrial-building city ownership without dropping entities', () => {
		const base = createNewGame('convenience', 20260802);
		const store = base.stores[0]!;
		const game: GameState = {
			...base,
			world: {
				...base.world,
				revealedCityIds: [...base.world.revealedCityIds, 'garden-borough', 'quarry-works'],
				openedCityIds: [...base.world.openedCityIds, 'garden-borough', 'quarry-works']
			},
			stores: [
				store,
				{ ...store, id: 'store-unknown', cityId: 'unknown-city' },
				{ ...store, id: 'store-closed', cityId: 'campus-junction' },
				{ ...store, id: 'store-wrong-kind', cityId: 'industry-city' },
				{ ...store, id: 'store-ungenerated', cityId: 'garden-borough' }
			],
			industrialBuildings: [
				createWarehouseBuilding('building-unknown', 'unknown-city'),
				createWarehouseBuilding('building-closed', 'breadbasket-basin'),
				createWarehouseBuilding('building-wrong-kind', 'harbor-city'),
				createWarehouseBuilding('building-ungenerated', 'quarry-works')
			]
		};

		expect(findEntityCityOwnershipIssues(game)).toEqual([
			{ kind: 'store', entityId: 'store-unknown', cityId: 'unknown-city', reason: 'unknown' },
			{ kind: 'store', entityId: 'store-closed', cityId: 'campus-junction', reason: 'closed' },
			{
				kind: 'store',
				entityId: 'store-wrong-kind',
				cityId: 'industry-city',
				reason: 'wrong-kind'
			},
			{
				kind: 'store',
				entityId: 'store-ungenerated',
				cityId: 'garden-borough',
				reason: 'ungenerated'
			},
			{
				kind: 'industrial-building',
				entityId: 'building-unknown',
				cityId: 'unknown-city',
				reason: 'unknown'
			},
			{
				kind: 'industrial-building',
				entityId: 'building-closed',
				cityId: 'breadbasket-basin',
				reason: 'closed'
			},
			{
				kind: 'industrial-building',
				entityId: 'building-wrong-kind',
				cityId: 'harbor-city',
				reason: 'wrong-kind'
			},
			{
				kind: 'industrial-building',
				entityId: 'building-ungenerated',
				cityId: 'quarry-works',
				reason: 'ungenerated'
			}
		]);
	});

	test('initializes lifecycle records once and keeps both collections in canonical order', () => {
		expect.assertions(4);
		const starter = createNewGame('convenience', 20260802);
		const openedIndustry = openWorldCity(
			{
				...starter,
				cash: 1_000_000,
				world: {
					...starter.world,
					revealedCityIds: [...starter.world.revealedCityIds, 'breadbasket-basin']
				}
			},
			'breadbasket-basin'
		);
		const withReverseIndustryInitialization = initializeCityInventory(
			{ ...openedIndustry, cityInventories: [] },
			'breadbasket-basin'
		);
		const withAllIndustryInventories = initializeCityInventory(
			withReverseIndustryInitialization,
			'industry-city'
		);
		const repeatedIndustryInitialization = initializeCityInventory(
			withAllIndustryInventories,
			'breadbasket-basin'
		);
		const openedRetail = openWorldCity(
			{
				...openedIndustry,
				world: {
					...openedIndustry.world,
					revealedCityIds: [...openedIndustry.world.revealedCityIds, 'campus-junction']
				}
			},
			'campus-junction'
		);
		const withReverseRetailInitialization = initializeRetailSupplyAssignment(
			{ ...openedRetail, retailSupplyAssignments: [] },
			'campus-junction'
		);
		const withAllRetailAssignments = initializeRetailSupplyAssignment(
			withReverseRetailInitialization,
			'harbor-city'
		);
		const repeatedRetailInitialization = initializeRetailSupplyAssignment(
			withAllRetailAssignments,
			'campus-junction'
		);

		expect(withAllIndustryInventories.cityInventories.map((inventory) => inventory.cityId)).toEqual(
			['industry-city', 'breadbasket-basin']
		);
		expect(repeatedIndustryInitialization).toEqual(withAllIndustryInventories);
		expect(
			withAllRetailAssignments.retailSupplyAssignments.map((assignment) => assignment.retailCityId)
		).toEqual(['harbor-city', 'campus-junction']);
		expect(repeatedRetailInitialization).toEqual(withAllRetailAssignments);
	});
});

describe('lifecycle initialization edge cases', () => {
	test('initializeCityInventory returns the game unchanged for an unsupported city', () => {
		expect.assertions(2);
		const base = createNewGame('convenience', 20260805);

		const result = initializeCityInventory(base, 'harbor-city');

		expect(result).toBe(base);
		expect(result.cityInventories).toBe(base.cityInventories);
	});

	test('initializeRetailSupplyAssignment returns the game unchanged for an unsupported city', () => {
		expect.assertions(2);
		const base = createNewGame('convenience', 20260806);

		const result = initializeRetailSupplyAssignment(base, 'industry-city');

		expect(result).toBe(base);
		expect(result.retailSupplyAssignments).toBe(base.retailSupplyAssignments);
	});
});

describe('selectDefaultRetailSupplyCity', () => {
	test('returns null when no eligible industry city inventory exists', () => {
		expect.assertions(1);
		const base = createNewGame('convenience', 20260807);
		const game = withCityInventories(base, []);

		expect(selectDefaultRetailSupplyCity(game)).toBeNull();
	});

	test('selects the active industry city when it has an eligible inventory', () => {
		expect.assertions(1);
		const base = createNewGame('convenience', 20260808);
		expect(selectDefaultRetailSupplyCity(base)).toBe('industry-city');
	});

	test('prefers the higher-capacity city over the active city on a capacity mismatch', () => {
		expect.assertions(1);
		const base = createNewGame('convenience', 20260814);
		const opened = openWorldCity(
			{
				...base,
				cash: 1_000_000,
				world: {
					...base.world,
					revealedCityIds: [...base.world.revealedCityIds, 'breadbasket-basin']
				}
			},
			'breadbasket-basin'
		);
		// industry-city has two warehouses (capacity 400) while breadbasket-basin
		// has one (capacity 200), so industry-city must win even though
		// breadbasket-basin is the active industry city.
		const game: GameState = {
			...opened,
			activeIndustryCityId: 'breadbasket-basin',
			industrialBuildings: [
				createWarehouseBuilding('w1', 'industry-city'),
				createWarehouseBuilding('w2', 'industry-city'),
				createWarehouseBuilding('w3', 'breadbasket-basin')
			],
			cityInventories: [
				createCityInventory('industry-city'),
				createCityInventory('breadbasket-basin')
			]
		};

		expect(selectDefaultRetailSupplyCity(game)).toBe('industry-city');
	});

	test('breaks a capacity tie by preferring the active industry city', () => {
		expect.assertions(1);
		const base = createNewGame('convenience', 20260809);
		const opened = openWorldCity(
			{
				...base,
				cash: 1_000_000,
				world: {
					...base.world,
					revealedCityIds: [...base.world.revealedCityIds, 'breadbasket-basin']
				}
			},
			'breadbasket-basin'
		);
		// Both industry cities have one warehouse (equal capacity); the active one
		// (breadbasket-basin) must win over the catalog-earlier industry-city.
		const game: GameState = {
			...opened,
			activeIndustryCityId: 'breadbasket-basin',
			industrialBuildings: [
				createWarehouseBuilding('w1', 'industry-city'),
				createWarehouseBuilding('w2', 'breadbasket-basin')
			],
			cityInventories: [
				createCityInventory('industry-city'),
				createCityInventory('breadbasket-basin')
			]
		};

		expect(selectDefaultRetailSupplyCity(game)).toBe('breadbasket-basin');
	});

	test('breaks a capacity tie by catalog order when no active city matches', () => {
		expect.assertions(1);
		const base = createNewGame('convenience', 20260810);
		const opened = openWorldCity(
			{
				...base,
				cash: 1_000_000,
				world: {
					...base.world,
					revealedCityIds: [...base.world.revealedCityIds, 'breadbasket-basin']
				}
			},
			'breadbasket-basin'
		);
		// Active industry city is a stale/unknown id, so the tie falls back to
		// catalog order: industry-city precedes breadbasket-basin.
		const game: GameState = {
			...opened,
			activeIndustryCityId: 'quarry-works' as WorldCityId,
			industrialBuildings: [
				createWarehouseBuilding('w1', 'industry-city'),
				createWarehouseBuilding('w2', 'breadbasket-basin')
			],
			cityInventories: [
				createCityInventory('industry-city'),
				createCityInventory('breadbasket-basin')
			]
		};

		expect(selectDefaultRetailSupplyCity(game)).toBe('industry-city');
	});
});

describe('assertValidEntityCityOwnership', () => {
	test('passes silently when all entities are in valid cities', () => {
		expect.assertions(1);
		const base = createNewGame('convenience', 20260811);
		expect(() => assertValidEntityCityOwnership(base)).not.toThrow();
	});

	test('throws when a store is in an unknown city', () => {
		expect.assertions(1);
		const base = createNewGame('convenience', 20260812);
		const game: GameState = {
			...base,
			stores: [{ ...base.stores[0]!, id: 'store-bad', cityId: 'unknown-city' }]
		};
		expect(() => assertValidEntityCityOwnership(game)).toThrow(/store-bad/);
	});
});
