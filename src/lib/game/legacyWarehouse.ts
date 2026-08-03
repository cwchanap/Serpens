import { INDUSTRIAL_BUILDING_TYPES } from './industry';
import { WAREHOUSE_OVERFLOW_COST_PER_UNIT } from './cityInventory';
import type { CityInventory, GameState, MaterialId, WarehouseInventory } from './types';

/**
 * Temporary compatibility helpers for callers that still read the legacy
 * aggregate warehouse. Production and rail must use cityInventory instead.
 * Tasks 5–7 remove the remaining consumers listed in the Task 4 report.
 */
export function getWarehouseUsed(warehouse: WarehouseInventory): number {
	return Object.values(warehouse.materials).reduce((total, quantity) => total + (quantity ?? 0), 0);
}

export function recalculateWarehousePressure(warehouse: WarehouseInventory): WarehouseInventory {
	const used = getWarehouseUsed(warehouse);
	const overflowUnits = Math.max(0, used - warehouse.capacity);

	return {
		...warehouse,
		overflowUnits,
		overflowCost: overflowUnits * WAREHOUSE_OVERFLOW_COST_PER_UNIT
	};
}

export function addWarehouseMaterial(
	warehouse: WarehouseInventory,
	materialId: MaterialId,
	quantity: number
): WarehouseInventory {
	const currentQuantity = warehouse.materials[materialId] ?? 0;
	const materials = {
		...warehouse.materials,
		[materialId]: currentQuantity + Math.max(0, quantity)
	};

	return recalculateWarehousePressure({ ...warehouse, materials });
}

export function removeWarehouseMaterial(
	warehouse: WarehouseInventory,
	materialId: MaterialId,
	requestedQuantity: number
): { warehouse: WarehouseInventory; quantityRemoved: number; shortage: number } {
	const requested = Math.max(0, requestedQuantity);
	const available = Math.max(0, warehouse.materials[materialId] ?? 0);
	const quantityRemoved = Math.min(available, requested);
	const materials = {
		...warehouse.materials,
		[materialId]: available - quantityRemoved
	};

	return {
		warehouse: recalculateWarehousePressure({ ...warehouse, materials }),
		quantityRemoved,
		shortage: requested - quantityRemoved
	};
}

export function getWarehouseCapacity(game: GameState): number {
	return game.industrialBuildings.reduce((capacity, building) => {
		const buildingType = INDUSTRIAL_BUILDING_TYPES[building.typeId];
		return capacity + (buildingType?.warehouseCapacity ?? 0);
	}, 0);
}

/**
 * One-way compatibility projection for pre-Task-5 readers. Its scalar
 * pressure values are sums of city-local pressure, never a re-normalization
 * of the aggregate material pool.
 */
export function projectCityInventoriesToLegacyWarehouse(
	inventories: Iterable<CityInventory>
): WarehouseInventory {
	const materials: Partial<Record<MaterialId, number>> = {};
	let capacity = 0;
	let overflowUnits = 0;
	let overflowCost = 0;

	for (const inventory of inventories) {
		capacity += inventory.capacity;
		overflowUnits += inventory.overflowUnits;
		overflowCost += inventory.overflowCost;

		for (const [materialId, quantity] of Object.entries(inventory.materials) as Array<
			[MaterialId, number]
		>) {
			materials[materialId] = (materials[materialId] ?? 0) + (quantity ?? 0);
		}
	}

	return { capacity, materials, overflowUnits, overflowCost };
}
