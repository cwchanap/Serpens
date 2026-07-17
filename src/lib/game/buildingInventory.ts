import { PRODUCTION_RECIPES } from './industry';
import type { IndustrialBuildingType, MaterialId } from './types';

type Inventory = Partial<Record<MaterialId, number>>;

export function inventoryUsed(inventory: Inventory): number {
	return Object.values(inventory).reduce((total, quantity) => total + (quantity ?? 0), 0);
}

export function getRecipeMaterialIds(
	buildingType: IndustrialBuildingType
): ReadonlySet<MaterialId> {
	const recipe = buildingType.recipeId ? PRODUCTION_RECIPES[buildingType.recipeId] : null;

	if (!recipe) {
		return new Set();
	}

	return new Set([
		...recipe.inputs.map((input) => input.materialId),
		...recipe.outputs.map((output) => output.materialId)
	]);
}

export function addInventory(
	inventory: Inventory,
	materialId: MaterialId,
	quantity: number,
	capacity: number
): { inventory: Inventory; added: number; overflow: number } {
	const requested = Math.max(0, quantity);
	const free = Math.max(0, capacity - inventoryUsed(inventory));
	const added = Math.min(requested, free);

	return {
		inventory: { ...inventory, [materialId]: (inventory[materialId] ?? 0) + added },
		added,
		overflow: requested - added
	};
}

export function removeInventory(
	inventory: Inventory,
	materialId: MaterialId,
	quantity: number
): { inventory: Inventory; removed: number; shortage: number } {
	const requested = Math.max(0, quantity);
	const available = Math.max(0, inventory[materialId] ?? 0);
	const removed = Math.min(requested, available);

	return {
		inventory: { ...inventory, [materialId]: available - removed },
		removed,
		shortage: requested - removed
	};
}

export function clampInventoryToRecipe(
	inventory: Inventory,
	buildingType: IndustrialBuildingType
): Inventory {
	const recipe = buildingType.recipeId ? PRODUCTION_RECIPES[buildingType.recipeId] : null;
	if (!recipe) {
		return {};
	}
	const inputIds = recipe.inputs.map((input) => input.materialId).sort();
	const outputIds = recipe.outputs
		.map((output) => output.materialId)
		.filter((id) => !inputIds.includes(id))
		.sort();
	const clamped: Inventory = {};
	let remaining = buildingType.bufferCapacity;

	// Inputs first: they are needed for the next production cycle, so
	// preserving them over outputs keeps the building operational after
	// a save/load that exceeded capacity.
	for (const materialId of inputIds) {
		const quantity = Math.min(Math.max(0, inventory[materialId] ?? 0), remaining);
		if (quantity > 0) {
			clamped[materialId] = quantity;
			remaining -= quantity;
		}
	}
	for (const materialId of outputIds) {
		const quantity = Math.min(Math.max(0, inventory[materialId] ?? 0), remaining);
		if (quantity > 0) {
			clamped[materialId] = quantity;
			remaining -= quantity;
		}
	}

	return clamped;
}
