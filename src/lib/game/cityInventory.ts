import { INDUSTRIAL_BUILDING_TYPES } from './industry';
import {
	compareWorldCityIds as compareCatalogWorldCityIds,
	getWorldCityDefinition
} from './worldCatalog';
import type {
	CityInventory,
	CityInventoryStats,
	GameState,
	MaterialId,
	RetailSupplyAssignment,
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
	return compareCatalogWorldCityIds(left, right);
}

export function createEmptyCityInventory(cityId: WorldCityId): CityInventory {
	return {
		cityId,
		materials: {}
	};
}

export function initializeCityInventory(game: GameState, cityId: string): GameState {
	const resolvedCityId = resolveWorldCityId(cityId);
	if (!resolvedCityId || !supportsCityInventory(game, resolvedCityId)) {
		return game;
	}

	const cityInventories = game.cityInventories;
	const nextGame = cityInventories.some((inventory) => inventory.cityId === resolvedCityId)
		? game
		: {
				...game,
				cityInventories: [...cityInventories, createEmptyCityInventory(resolvedCityId)].sort(
					(left, right) => compareWorldCityIds(left.cityId, right.cityId)
				)
			};

	return nextGame;
}

export function selectDefaultRetailSupplyCity(game: GameState): WorldCityId | null {
	const eligibleInventories = game.cityInventories.filter(
		(inventory) => getCityInventory(game, inventory.cityId).ok
	);

	if (eligibleInventories.length === 0) {
		return null;
	}

	return [...eligibleInventories].sort((left, right) => {
		const leftCapacity = getCityInventoryStats(game, left.cityId).capacity;
		const rightCapacity = getCityInventoryStats(game, right.cityId).capacity;

		if (leftCapacity !== rightCapacity) {
			return leftCapacity > rightCapacity ? -1 : 1;
		}

		const leftIsActive = left.cityId === game.activeIndustryCityId;
		const rightIsActive = right.cityId === game.activeIndustryCityId;
		if (leftIsActive !== rightIsActive) {
			return leftIsActive ? -1 : 1;
		}

		return compareWorldCityIds(left.cityId, right.cityId);
	})[0]!.cityId;
}

export function createDefaultRetailSupplyAssignment(
	game: GameState,
	retailCityId: WorldCityId
): RetailSupplyAssignment {
	return {
		retailCityId,
		supplyCityId: selectDefaultRetailSupplyCity(game)
	};
}

export function initializeRetailSupplyAssignment(game: GameState, cityId: string): GameState {
	const resolvedCityId = resolveWorldCityId(cityId);
	if (!resolvedCityId || !supportsRetailSupplyAssignment(game, resolvedCityId)) {
		return game;
	}

	const retailSupplyAssignments = game.retailSupplyAssignments;
	if (retailSupplyAssignments.some((assignment) => assignment.retailCityId === resolvedCityId)) {
		return game;
	}

	return {
		...game,
		retailSupplyAssignments: [
			...retailSupplyAssignments,
			createDefaultRetailSupplyAssignment(game, resolvedCityId)
		].sort((left, right) => compareWorldCityIds(left.retailCityId, right.retailCityId))
	};
}

export function supportsCityInventory(
	game: Pick<GameState, 'world' | 'industryCities'>,
	cityId: string
): boolean {
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

	// Duplicate of the opened-city check inside supportsCityInventory, kept so a
	// closed city resolves to 'city-closed' rather than falling through to the
	// 'unsupported-city' result.
	if (!game.world.openedCityIds.includes(resolvedCityId)) {
		return { ok: false, reason: 'city-closed' };
	}

	if (!supportsCityInventory(game, resolvedCityId)) {
		return { ok: false, reason: 'unsupported-city' };
	}

	const index = game.cityInventories.findIndex((inventory) => inventory.cityId === resolvedCityId);
	if (index < 0) {
		return { ok: false, reason: 'inventory-missing' };
	}

	return { ok: true, inventory: game.cityInventories[index]!, index };
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

	return { cityId: inventory.cityId, materials };
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
		inventory: { cityId: inventory.cityId, materials },
		quantityRemoved,
		shortage: requested - quantityRemoved
	};
}

export function getCityInventoryStats(game: GameState, cityId: string): CityInventoryStats {
	const access = getCityInventory(game, cityId);
	if (!access.ok) {
		throw new Error(`City inventory invariant: ${access.reason} for ${cityId}`);
	}

	const capacity = getCityWarehouseCapacity(game, access.inventory.cityId);
	let used: number;
	try {
		used = getCityInventoryUsed(access.inventory);
	} catch (error) {
		const detail = error instanceof Error ? error.message : 'material quantities are invalid';
		throw new Error(`City inventory invariant: invalid inventory for ${cityId}: ${detail}`, {
			cause: error
		});
	}
	const overflowUnits = Math.max(0, used - capacity);

	return {
		capacity,
		used,
		overflowUnits,
		overflowCost: checkedMultiply(
			overflowUnits,
			WAREHOUSE_OVERFLOW_COST_PER_UNIT,
			'City inventory overflow cost'
		)
	};
}

function getCityWarehouseCapacity(game: GameState, cityId: WorldCityId): number {
	return game.industrialBuildings.reduce((capacity, building) => {
		if (
			building.cityId !== cityId ||
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

export function findEntityCityOwnershipIssues(
	game: Pick<GameState, 'world' | 'cities' | 'industryCities' | 'stores' | 'industrialBuildings'>
): EntityCityOwnershipIssue[] {
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

/**
 * Runtime transition boundary for any path that can mutate entity-scoped
 * inventory. Persistence uses the non-throwing discovery helper above so it
 * can preserve SaveDataError codes; simulation must fail before it can skip or
 * normalize an entity with invalid ownership.
 */
export function assertValidEntityCityOwnership(
	game: Pick<GameState, 'world' | 'cities' | 'industryCities' | 'stores' | 'industrialBuildings'>
): void {
	const issue = findEntityCityOwnershipIssues(game)[0];
	if (!issue) return;

	throw new Error(
		`Invalid ${issue.kind} city ownership for ${issue.entityId}: ${issue.reason} city ${issue.cityId}`
	);
}

function supportsRetailSupplyAssignment(game: GameState, cityId: WorldCityId): boolean {
	const city = getWorldCityDefinition(cityId);

	return (
		city?.kind === 'retail' &&
		game.world.openedCityIds.includes(city.id) &&
		game.cities.some((retailCity) => retailCity.id === city.id)
	);
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

function getEntityCityOwnershipReason(
	game: Pick<GameState, 'world' | 'cities' | 'industryCities'>,
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
