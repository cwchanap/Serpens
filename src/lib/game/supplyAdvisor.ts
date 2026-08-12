import { INDUSTRIAL_BUILDING_TYPES, PRODUCTION_RECIPES } from './industry';
import { getCityInventory } from './cityInventory';
import type { GameState, MaterialId } from './types';

function getActiveIndustryInputs(game: GameState): {
	inventory: Partial<Record<MaterialId, number>>;
	buildings: GameState['industrialBuildings'];
} {
	const activeBuildings = game.industrialBuildings.filter(
		(building) => building.cityId === game.activeIndustryCityId
	);
	if (!Array.isArray(game.world?.openedCityIds) || !Array.isArray(game.industryCities)) {
		return { inventory: {}, buildings: activeBuildings };
	}

	const access = getCityInventory(game, game.activeIndustryCityId);
	if (!access.ok) {
		return { inventory: {}, buildings: activeBuildings };
	}

	return {
		inventory: access.inventory.materials,
		buildings: activeBuildings
	};
}

export function getAvailableMaterialIds(game: GameState): MaterialId[] {
	const available = new Set<MaterialId>();
	const { inventory, buildings } = getActiveIndustryInputs(game);

	for (const [materialId, quantity] of Object.entries(inventory)) {
		if ((quantity ?? 0) > 0) {
			available.add(materialId as MaterialId);
		}
	}

	// A placed building's outputs count as available for build-menu recipe hints
	// even when the building is currently blocked by missing upstream inputs.
	// Placement previews use this optimistic signal to explain the next build.
	for (const placed of buildings) {
		for (const [materialId, quantity] of Object.entries(placed.inventory)) {
			if ((quantity ?? 0) > 0) {
				available.add(materialId as MaterialId);
			}
		}

		const type = INDUSTRIAL_BUILDING_TYPES[placed.typeId];
		if (!type?.recipeId) {
			continue;
		}
		for (const output of PRODUCTION_RECIPES[type.recipeId].outputs) {
			available.add(output.materialId);
		}
	}

	return [...available];
}
