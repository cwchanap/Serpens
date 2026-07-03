import { INDUSTRIAL_BUILDING_TYPES, MATERIALS, PRODUCTION_RECIPES } from './industry';
import { getFinishedMaterialIdForCategory } from './stock';
import type {
	BuildingTier,
	GameState,
	IndustrialBuildingType,
	IndustrialBuildingTypeId,
	MaterialId
} from './types';

export type AdvisorStepState = 'built' | 'buildable' | 'blocked';

export interface AdvisorChainStep {
	buildingTypeId: IndustrialBuildingTypeId;
	name: string;
	tier: BuildingTier;
	state: AdvisorStepState;
	isNextBuild: boolean;
}

export interface AdvisorChain {
	finishedMaterialId: MaterialId;
	categoryName: string;
	tier: BuildingTier;
	steps: AdvisorChainStep[];
	complete: boolean;
	nextBuildTypeId: IndustrialBuildingTypeId | null;
}

export function getBuildingTypeProducing(materialId: MaterialId): IndustrialBuildingType | null {
	for (const type of Object.values(INDUSTRIAL_BUILDING_TYPES)) {
		if (!type.recipeId) {
			continue;
		}
		if (
			PRODUCTION_RECIPES[type.recipeId].outputs.some((output) => output.materialId === materialId)
		) {
			return type;
		}
	}
	return null;
}

export function getAvailableMaterialIds(game: GameState): MaterialId[] {
	const available = new Set<MaterialId>();

	for (const [materialId, quantity] of Object.entries(game.warehouse.materials)) {
		if ((quantity ?? 0) > 0) {
			available.add(materialId as MaterialId);
		}
	}

	for (const placed of game.industrialBuildings) {
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

function collectChain(
	materialId: MaterialId,
	seen: Set<IndustrialBuildingTypeId>,
	ordered: IndustrialBuildingTypeId[]
): void {
	const producer = getBuildingTypeProducing(materialId);
	if (!producer || seen.has(producer.id)) {
		return;
	}

	// Mark before recursing so a cyclic recipe cannot recurse forever.
	seen.add(producer.id);

	const recipe = producer.recipeId ? PRODUCTION_RECIPES[producer.recipeId] : null;
	if (recipe) {
		for (const input of recipe.inputs) {
			collectChain(input.materialId, seen, ordered);
		}
	}

	ordered.push(producer.id);
}

function getWantedFinishedMaterials(game: GameState): MaterialId[] {
	const wanted = new Set<MaterialId>();

	for (const store of game.stores) {
		for (const product of store.products) {
			const material = getFinishedMaterialIdForCategory(product.categoryId);
			if (material) {
				wanted.add(material);
			}
		}
	}

	if (wanted.size === 0) {
		for (const material of Object.values(MATERIALS)) {
			if (material.kind !== 'finished') {
				continue;
			}
			const producer = getBuildingTypeProducing(material.id);
			if (producer && producer.tier === 1) {
				wanted.add(material.id);
			}
		}
	}

	return [...wanted];
}

export function buildSupplyAdvisor(game: GameState): AdvisorChain[] {
	const placed = new Set<IndustrialBuildingTypeId>(
		game.industrialBuildings.map((building) => building.typeId)
	);
	const chains: AdvisorChain[] = [];

	for (const finishedMaterialId of getWantedFinishedMaterials(game)) {
		const producer = getBuildingTypeProducing(finishedMaterialId);
		if (!producer) {
			continue;
		}

		const ordered: IndustrialBuildingTypeId[] = [];
		collectChain(finishedMaterialId, new Set(), ordered);

		const steps: AdvisorChainStep[] = ordered.map((typeId) => {
			const type = INDUSTRIAL_BUILDING_TYPES[typeId];
			const built = placed.has(typeId);
			const recipe = type.recipeId ? PRODUCTION_RECIPES[type.recipeId] : null;
			const inputsSatisfied =
				!recipe ||
				recipe.inputs.every((input) => {
					const inputProducer = getBuildingTypeProducing(input.materialId);
					return inputProducer ? placed.has(inputProducer.id) : true;
				});
			const state: AdvisorStepState = built ? 'built' : inputsSatisfied ? 'buildable' : 'blocked';
			return {
				buildingTypeId: typeId,
				name: type.name,
				tier: type.tier,
				state,
				isNextBuild: false
			};
		});

		const next = steps.find((step) => step.state === 'buildable') ?? null;
		if (next) {
			next.isNextBuild = true;
		}

		chains.push({
			finishedMaterialId,
			categoryName: MATERIALS[finishedMaterialId].name,
			tier: producer.tier,
			steps,
			complete: steps.every((step) => step.state === 'built'),
			nextBuildTypeId: next ? next.buildingTypeId : null
		});
	}

	return chains.sort((a, b) => a.tier - b.tier || a.categoryName.localeCompare(b.categoryName));
}
