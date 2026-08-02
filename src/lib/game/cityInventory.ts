import { INDUSTRIAL_BUILDING_TYPES } from './industry';
import { WORLD_CITY_CATALOG } from './world';
import type {
	CityInventory,
	GameState,
	MaterialId,
	WorldCityDefinition,
	WorldCityId
} from './types';

export const WAREHOUSE_OVERFLOW_COST_PER_UNIT = 2;

export type CityInventoryAccessFailure =
	| 'unknown-city'
	| 'city-closed'
	| 'unsupported-city'
	| 'inventory-missing';

export type CityInventoryAccessResult =
	| { ok: true; inventory: CityInventory; index: number }
	| { ok: false; reason: CityInventoryAccessFailure };

export interface RemoveCityInventoryMaterialResult {
	inventory: CityInventory;
	quantityRemoved: number;
	shortage: number;
}

export type EntityCityOwnershipIssue =
	| {
			kind: 'store';
			entityId: string;
			cityId: string;
			reason: 'unknown' | 'closed' | 'wrong-kind' | 'ungenerated';
	  }
	| {
			kind: 'industrial-building';
			entityId: string;
			cityId: string;
			reason: 'unknown' | 'closed' | 'wrong-kind' | 'ungenerated';
	  };

type EntityCityOwnershipReason = EntityCityOwnershipIssue['reason'];

export function resolveWorldCityId(cityId: string): WorldCityId | undefined {
	return getWorldCityDefinition(cityId)?.id;
}

export function compareWorldCityIds(left: WorldCityId, right: WorldCityId): number {
	const leftIndex = worldCityCatalogIndex(left);
	const rightIndex = worldCityCatalogIndex(right);

	if (leftIndex !== rightIndex) {
		return leftIndex - rightIndex;
	}

	return compareCodeUnits(left, right);
}

export function supportsCityInventory(game: GameState, cityId: string): boolean {
	const city = getWorldCityDefinition(cityId);

	return (
		city?.kind === 'industry' &&
		game.world.openedCityIds.includes(city.id) &&
		game.industryCities.some((industryCity) => industryCity.id === city.id)
	);
}

export function getCityInventory(game: GameState, cityId: string): CityInventoryAccessResult {
	const resolvedCityId = resolveWorldCityId(cityId);
	if (!resolvedCityId) {
		return { ok: false, reason: 'unknown-city' };
	}

	if (!game.world.openedCityIds.includes(resolvedCityId)) {
		return { ok: false, reason: 'city-closed' };
	}

	if (!supportsCityInventory(game, resolvedCityId)) {
		return { ok: false, reason: 'unsupported-city' };
	}

	const index =
		game.cityInventories?.findIndex((inventory) => inventory.cityId === resolvedCityId) ?? -1;
	if (index < 0) {
		return { ok: false, reason: 'inventory-missing' };
	}

	return { ok: true, inventory: game.cityInventories![index]!, index };
}

export function getCityInventoryUsed(inventory: CityInventory): number {
	return Object.values(inventory.materials).reduce(
		(total, quantity) =>
			checkedAdd(
				total,
				requireSafeNonnegativeInteger(quantity ?? 0, 'City inventory material quantity'),
				'City inventory used capacity'
			),
		0
	);
}

export function addCityInventoryMaterial(
	inventory: CityInventory,
	materialId: MaterialId,
	quantity: number
): CityInventory {
	const currentQuantity = requireSafeNonnegativeInteger(
		inventory.materials[materialId] ?? 0,
		'City inventory material quantity'
	);
	const materials = {
		...inventory.materials,
		[materialId]: checkedAdd(
			currentQuantity,
			canonicalQuantity(quantity),
			'City inventory material quantity'
		)
	};

	return recalculateCityInventoryPressure({ ...inventory, materials });
}

export function removeCityInventoryMaterial(
	inventory: CityInventory,
	materialId: MaterialId,
	quantity: number
): RemoveCityInventoryMaterialResult {
	const requested = canonicalQuantity(quantity);
	const available = requireSafeNonnegativeInteger(
		inventory.materials[materialId] ?? 0,
		'City inventory material quantity'
	);
	const quantityRemoved = Math.min(available, requested);
	const materials = {
		...inventory.materials,
		[materialId]: available - quantityRemoved
	};

	return {
		inventory: recalculateCityInventoryPressure({ ...inventory, materials }),
		quantityRemoved,
		shortage: requested - quantityRemoved
	};
}

export function recalculateCityInventoryPressure(inventory: CityInventory): CityInventory {
	const capacity = requireSafeNonnegativeInteger(inventory.capacity, 'City inventory capacity');
	const overflowUnits = Math.max(0, getCityInventoryUsed(inventory) - capacity);

	return {
		...inventory,
		capacity,
		overflowUnits,
		overflowCost: checkedMultiply(
			overflowUnits,
			WAREHOUSE_OVERFLOW_COST_PER_UNIT,
			'City inventory overflow cost'
		)
	};
}

export function getCityWarehouseCapacity(game: GameState, cityId: string): number {
	const resolvedCityId = resolveWorldCityId(cityId);
	if (!resolvedCityId || !supportsCityInventory(game, resolvedCityId)) {
		return 0;
	}

	return game.industrialBuildings.reduce((capacity, building) => {
		if (
			building.cityId !== resolvedCityId ||
			getEntityCityOwnershipReason(game, building.cityId, 'industry') !== null
		) {
			return capacity;
		}

		return checkedAdd(
			capacity,
			INDUSTRIAL_BUILDING_TYPES[building.typeId]?.warehouseCapacity ?? 0,
			'City warehouse capacity'
		);
	}, 0);
}

export function synchronizeCityInventoryCapacity(game: GameState, cityId: string): GameState {
	const access = getCityInventory(game, cityId);
	if (!access.ok) {
		return game;
	}

	const synchronized = recalculateCityInventoryPressure({
		...access.inventory,
		capacity: getCityWarehouseCapacity(game, access.inventory.cityId)
	});

	if (hasSameDerivedState(access.inventory, synchronized)) {
		return game;
	}

	const cityInventories = [...game.cityInventories!];
	cityInventories[access.index] = synchronized;

	return { ...game, cityInventories };
}

export function synchronizeAllCityInventoryCapacities(game: GameState): GameState {
	if (!game.cityInventories || game.cityInventories.length === 0) {
		return game;
	}

	let changed = false;
	const cityInventories = game.cityInventories.map((inventory) => {
		const synchronized = recalculateCityInventoryPressure({
			...inventory,
			capacity: getCityWarehouseCapacity(game, inventory.cityId)
		});

		if (!hasSameDerivedState(inventory, synchronized)) {
			changed = true;
		}

		return synchronized;
	});

	return changed ? { ...game, cityInventories } : game;
}

export function normalizeCityInventoryDerivedState(game: GameState): GameState {
	return synchronizeAllCityInventoryCapacities(game);
}

export function findEntityCityOwnershipIssues(game: GameState): EntityCityOwnershipIssue[] {
	const issues: EntityCityOwnershipIssue[] = [];

	for (const store of game.stores) {
		const reason = getEntityCityOwnershipReason(game, store.cityId, 'retail');
		if (reason) {
			issues.push({ kind: 'store', entityId: store.id, cityId: store.cityId, reason });
		}
	}

	for (const building of game.industrialBuildings) {
		const reason = getEntityCityOwnershipReason(game, building.cityId, 'industry');
		if (reason) {
			issues.push({
				kind: 'industrial-building',
				entityId: building.id,
				cityId: building.cityId,
				reason
			});
		}
	}

	return issues;
}

function getWorldCityDefinition(cityId: string): WorldCityDefinition | undefined {
	return WORLD_CITY_CATALOG.find((city) => city.id === cityId);
}

function worldCityCatalogIndex(cityId: WorldCityId): number {
	return WORLD_CITY_CATALOG.findIndex((city) => city.id === cityId);
}

function compareCodeUnits(left: string, right: string): number {
	if (left < right) return -1;
	if (left > right) return 1;
	return 0;
}

function canonicalQuantity(quantity: number): number {
	if (!Number.isFinite(quantity)) {
		return 0;
	}

	const wholeUnits = Math.floor(quantity);
	return Number.isSafeInteger(wholeUnits) ? Math.max(0, wholeUnits) : 0;
}

function requireSafeNonnegativeInteger(value: number, label: string): number {
	if (!Number.isSafeInteger(value) || value < 0) {
		throw new RangeError(`${label} must be a safe nonnegative integer`);
	}

	return value;
}

function checkedAdd(left: number, right: number, label: string): number {
	const sum = left + right;
	if (!Number.isSafeInteger(sum)) {
		throw new RangeError(`${label} exceeds the safe integer range`);
	}

	return sum;
}

function checkedMultiply(left: number, right: number, label: string): number {
	const product = left * right;
	if (!Number.isSafeInteger(product)) {
		throw new RangeError(`${label} exceeds the safe integer range`);
	}

	return product;
}

function hasSameDerivedState(left: CityInventory, right: CityInventory): boolean {
	return (
		left.capacity === right.capacity &&
		left.overflowUnits === right.overflowUnits &&
		left.overflowCost === right.overflowCost
	);
}

function getEntityCityOwnershipReason(
	game: GameState,
	cityId: string,
	expectedKind: 'retail' | 'industry'
): EntityCityOwnershipReason | null {
	const city = getWorldCityDefinition(cityId);
	if (!city) {
		return 'unknown';
	}

	if (!game.world.openedCityIds.includes(city.id)) {
		return 'closed';
	}

	if (city.kind !== expectedKind) {
		return 'wrong-kind';
	}

	const generated =
		expectedKind === 'retail'
			? game.cities.some((candidate) => candidate.id === city.id)
			: game.industryCities.some((candidate) => candidate.id === city.id);

	return generated ? null : 'ungenerated';
}
