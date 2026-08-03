import { INDUSTRIAL_BUILDING_TYPES, MATERIALS } from './industry';
import {
	compareWorldCityIds as compareCatalogWorldCityIds,
	getWorldCityDefinition
} from './worldCatalog';
import type {
	CityInventory,
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
		capacity: 0,
		materials: {},
		overflowUnits: 0,
		overflowCost: 0
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

	return synchronizeCityInventoryCapacity(nextGame, resolvedCityId);
}

export function selectDefaultRetailSupplyCity(game: GameState): WorldCityId | null {
	const eligibleInventories = game.cityInventories.filter(
		(inventory) => getCityInventory(game, inventory.cityId).ok
	);

	if (eligibleInventories.length === 0) {
		return null;
	}

	return [...eligibleInventories].sort((left, right) => {
		const leftCapacity = getCityWarehouseCapacity(game, left.cityId);
		const rightCapacity = getCityWarehouseCapacity(game, right.cityId);

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

/**
 * Pure migration input: the old pool is represented only by its material map;
 * capacity remains attached to the eligible city-local inventories.
 */
export interface LegacyMaterialAllocationInput {
	activeIndustryCityId: string;
	eligibleCityInventories: readonly CityInventory[];
	materials: Partial<Record<MaterialId, number>>;
}

/**
 * Deterministically distributes a pre-v13 material pool across eligible
 * city-local inventories. The caller owns raw-wire decoding; this helper owns
 * allocation order, duplicate detection, pressure, and conservation.
 */
export function allocateLegacyWarehouseMaterials(
	input: LegacyMaterialAllocationInput
): CityInventory[] {
	const { activeIndustryCityId, eligibleCityInventories, materials } = input;
	assertUniqueLegacyWarehouseEligibleCityIds(eligibleCityInventories);
	const materialEntries = getValidatedLegacyMaterialEntries(materials);
	const totalLegacyUnits = materialEntries.reduce(
		(total, [, quantity]) => checkedAdd(total, quantity, 'Legacy warehouse material total'),
		0
	);
	if (eligibleCityInventories.length === 0) {
		if (totalLegacyUnits === 0) return [];
		throw new RangeError('Legacy warehouse stock requires an eligible city inventory');
	}

	const canonicalEligible = [...eligibleCityInventories]
		.map((inventory) => ({
			...inventory,
			capacity: requireSafeNonnegativeInteger(
				inventory.capacity,
				`Legacy city inventory ${inventory.cityId} capacity`
			),
			materials: {}
		}))
		.sort((left, right) => compareWorldCityIds(left.cityId, right.cityId));
	const primary = selectLegacyWarehousePrimaryCity(activeIndustryCityId, canonicalEligible);
	const destinations = [
		primary,
		...canonicalEligible.filter((inventory) => inventory.cityId !== primary.cityId)
	];
	const remainingCapacity = destinations.map((inventory) => inventory.capacity);
	const allocatedMaterials = destinations.map((): Partial<Record<MaterialId, number>> => ({}));
	const materialOrder = materialEntries
		.map(([materialId]) => materialId)
		.sort(compareLegacyMaterialIds);

	for (const materialId of materialOrder) {
		const originalQuantity = materials[materialId]!;
		let remaining = originalQuantity;
		for (let index = 0; index < destinations.length; index += 1) {
			const quantity = Math.min(remaining, remainingCapacity[index]!);
			if (quantity === 0) continue;

			allocatedMaterials[index]![materialId] = quantity;
			remaining -= quantity;
			remainingCapacity[index] -= quantity;
		}

		if (remaining > 0) {
			const current = allocatedMaterials[0]![materialId] ?? 0;
			allocatedMaterials[0]![materialId] = checkedAdd(
				current,
				remaining,
				`Legacy warehouse ${materialId} primary allocation`
			);
		}
	}

	const allocatedByCityId = new Map(
		destinations.map((inventory, index) => [
			inventory.cityId,
			recalculateCityInventoryPressure({
				...inventory,
				materials: allocatedMaterials[index]!
			})
		])
	);
	const allocation = canonicalEligible.map((inventory) => allocatedByCityId.get(inventory.cityId)!);

	assertLegacyWarehouseAllocationConservation(
		allocation,
		materialEntries,
		totalLegacyUnits,
		canonicalEligible.reduce(
			(total, inventory) =>
				checkedAdd(total, inventory.capacity, 'Legacy warehouse aggregate capacity'),
			0
		)
	);
	return allocation;
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

	const cityInventories = [...game.cityInventories];
	cityInventories[access.index] = synchronized;

	return { ...game, cityInventories };
}

export function synchronizeAllCityInventoryCapacities(game: GameState): GameState {
	if (game.cityInventories.length === 0) {
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

function selectLegacyWarehousePrimaryCity(
	activeIndustryCityId: string,
	eligible: readonly CityInventory[]
): CityInventory {
	return [...eligible].sort((left, right) => {
		if (left.capacity !== right.capacity) {
			return left.capacity > right.capacity ? -1 : 1;
		}

		const leftIsActive = left.cityId === activeIndustryCityId;
		const rightIsActive = right.cityId === activeIndustryCityId;
		if (leftIsActive !== rightIsActive) {
			return leftIsActive ? -1 : 1;
		}

		return compareWorldCityIds(left.cityId, right.cityId);
	})[0]!;
}

function assertUniqueLegacyWarehouseEligibleCityIds(eligible: readonly CityInventory[]): void {
	const seenCityIds = new Set<string>();
	for (const inventory of eligible) {
		if (seenCityIds.has(inventory.cityId)) {
			throw new RangeError('Legacy warehouse eligible city inventories must have unique city IDs');
		}
		seenCityIds.add(inventory.cityId);
	}
}

function getValidatedLegacyMaterialEntries(
	legacyMaterials: Partial<Record<MaterialId, number>>
): [MaterialId, number][] {
	const entries: [MaterialId, number][] = [];
	for (const [materialId, quantity] of Object.entries(legacyMaterials)) {
		if (!Object.hasOwn(MATERIALS, materialId)) {
			throw new RangeError(`Legacy warehouse material ${materialId} must be known`);
		}
		entries.push([
			materialId as MaterialId,
			requireSafeNonnegativeInteger(quantity, `Legacy warehouse material ${materialId}`)
		]);
	}
	return entries;
}

function compareLegacyMaterialIds(left: MaterialId, right: MaterialId): number {
	const materialIds = Object.keys(MATERIALS) as MaterialId[];
	const leftIndex = materialIds.indexOf(left);
	const rightIndex = materialIds.indexOf(right);
	if (leftIndex !== rightIndex) return leftIndex - rightIndex;
	return compareCodeUnits(left, right);
}

function assertLegacyWarehouseAllocationConservation(
	allocation: readonly CityInventory[],
	legacyMaterials: readonly [MaterialId, number][],
	totalLegacyUnits: number,
	aggregateCapacity: number
): void {
	for (const [materialId, expected] of legacyMaterials) {
		const actual = allocation.reduce(
			(total, inventory) =>
				checkedAdd(
					total,
					inventory.materials[materialId] ?? 0,
					`Legacy warehouse ${materialId} conservation`
				),
			0
		);
		if (actual !== expected) {
			throw new RangeError(`Legacy warehouse ${materialId} allocation must conserve materials`);
		}
	}

	const actualOverflow = allocation.reduce(
		(total, inventory) =>
			checkedAdd(total, inventory.overflowUnits, 'Legacy warehouse allocation overflow'),
		0
	);
	const expectedOverflow = Math.max(0, totalLegacyUnits - aggregateCapacity);
	if (actualOverflow !== expectedOverflow) {
		throw new RangeError('Legacy warehouse allocation must create only unavoidable overflow');
	}
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
