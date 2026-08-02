import { describe, expect, test } from 'vitest';
import {
	addCityInventoryMaterial,
	compareWorldCityIds,
	findEntityCityOwnershipIssues,
	getCityInventory,
	getCityInventoryUsed,
	getCityWarehouseCapacity,
	normalizeCityInventoryDerivedState,
	recalculateCityInventoryPressure,
	removeCityInventoryMaterial,
	resolveWorldCityId,
	supportsCityInventory,
	synchronizeAllCityInventoryCapacities,
	synchronizeCityInventoryCapacity
} from './cityInventory';
import { createNewGame } from './state';
import type { CityInventory, GameState, IndustrialBuilding, WorldCityId } from './types';

function createCityInventory(
	cityId: WorldCityId,
	overrides: Partial<CityInventory> = {}
): CityInventory {
	return {
		cityId,
		capacity: 0,
		materials: {},
		overflowUnits: 0,
		overflowCost: 0,
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
		expect(getCityInventory(base, 'industry-city')).toEqual({
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

	test('updates materials immutably and derives overflow pressure from used capacity', () => {
		const initial = createCityInventory('industry-city', {
			capacity: 3,
			materials: { water: 1 }
		});
		const added = addCityInventoryMaterial(initial, 'water', 3);
		const removed = removeCityInventoryMaterial(added, 'water', 10);

		expect(initial).toEqual({
			cityId: 'industry-city',
			capacity: 3,
			materials: { water: 1 },
			overflowUnits: 0,
			overflowCost: 0
		});
		expect(added.materials).toEqual({ water: 4 });
		expect(getCityInventoryUsed(added)).toBe(4);
		expect(added.overflowUnits).toBe(1);
		expect(added.overflowCost).toBe(2);
		expect(removed).toEqual({
			inventory: {
				cityId: 'industry-city',
				capacity: 3,
				materials: { water: 0 },
				overflowUnits: 0,
				overflowCost: 0
			},
			quantityRemoved: 4,
			shortage: 6
		});
		expect(
			recalculateCityInventoryPressure(
				createCityInventory('industry-city', {
					capacity: 1,
					materials: { water: 3 }
				})
			)
		).toMatchObject({ overflowUnits: 2, overflowCost: 4 });
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
		expect(() =>
			recalculateCityInventoryPressure(
				createCityInventory('industry-city', {
					capacity: 0,
					materials: { water: Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1 }
				})
			)
		).toThrow(RangeError);
	});

	test('derives and synchronizes each inventory capacity from only its valid city warehouses', () => {
		const base = createNewGame('convenience', 20260802);
		const secondIndustryCity = { ...base.industryCities[0]!, id: 'breadbasket-basin' };
		const game = withCityInventories(
			{
				...base,
				world: {
					...base.world,
					revealedCityIds: [...base.world.revealedCityIds, 'breadbasket-basin'],
					openedCityIds: [...base.world.openedCityIds, 'breadbasket-basin']
				},
				industryCities: [...base.industryCities, secondIndustryCity],
				industrialBuildings: [
					createWarehouseBuilding('harbor-warehouse', 'industry-city'),
					createWarehouseBuilding('breadbasket-warehouse', 'breadbasket-basin'),
					createWarehouseBuilding('invalid-warehouse', 'unknown-city')
				]
			},
			[
				createCityInventory('industry-city', { materials: { water: 205 } }),
				createCityInventory('breadbasket-basin', { materials: { grain: 2 } })
			]
		);

		expect(getCityWarehouseCapacity(game, 'industry-city')).toBe(200);
		expect(getCityWarehouseCapacity(game, 'breadbasket-basin')).toBe(200);
		expect(getCityWarehouseCapacity(game, 'harbor-city')).toBe(0);

		const oneCity = synchronizeCityInventoryCapacity(game, 'industry-city');
		expect(oneCity.cityInventories?.[0]).toMatchObject({
			capacity: 200,
			overflowUnits: 5,
			overflowCost: 10
		});
		expect(oneCity.cityInventories?.[1]?.capacity).toBe(0);

		const allCities = synchronizeAllCityInventoryCapacities(game);
		expect(allCities.cityInventories).toEqual([
			{
				cityId: 'industry-city',
				capacity: 200,
				materials: { water: 205 },
				overflowUnits: 5,
				overflowCost: 10
			},
			{
				cityId: 'breadbasket-basin',
				capacity: 200,
				materials: { grain: 2 },
				overflowUnits: 0,
				overflowCost: 0
			}
		]);
		expect(normalizeCityInventoryDerivedState(allCities)).toEqual(allCities);
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
});
