import { INDUSTRIAL_BUILDING_TYPES, PRODUCTION_RECIPES } from './industry';
import {
	buildRailNetwork,
	getBuildingAttachCellKeys,
	getRailNeighborKeys,
	parseRailCellKey
} from './rail';
import type { RailNetwork } from './rail';
import type { GameState, IndustrialBuilding, MaterialId, ProductionRecipe } from './types';

/**
 * Why a production building cannot move its output yet. Materials only move
 * between buildings over player-built rail (railShipping.ts): producers push
 * surplus to a warehouse and consumers pull from producers or warehouses. A
 * producer with no rail path to either fills its own buffer and stalls.
 *
 * - `no-warehouse`: nothing in the city can take the output — no warehouse
 *   exists and no building consumes it.
 * - `rail-disconnected`: a warehouse or consumer exists, but no rail path
 *   links this building to any of them.
 */
export type IndustrialLinkIssue = 'no-warehouse' | 'rail-disconnected';

function recipeFor(building: IndustrialBuilding): ProductionRecipe | null {
	const recipeId = INDUSTRIAL_BUILDING_TYPES[building.typeId]?.recipeId;
	return recipeId ? (PRODUCTION_RECIPES[recipeId] ?? null) : null;
}

/** Labels each rail cell with a connected-component index (ignores capacity). */
function labelRailComponents(network: RailNetwork): Map<string, number> {
	const componentByKey = new Map<string, number>();
	let next = 0;

	for (const start of network.cells.keys()) {
		if (componentByKey.has(start)) continue;
		const component = next++;
		componentByKey.set(start, component);
		const queue = [start];
		while (queue.length > 0) {
			const { x, y } = parseRailCellKey(queue.shift()!);
			for (const neighbor of getRailNeighborKeys(network, x, y)) {
				if (!componentByKey.has(neighbor)) {
					componentByKey.set(neighbor, component);
					queue.push(neighbor);
				}
			}
		}
	}

	return componentByKey;
}

function sharesComponent(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
	for (const component of left) {
		if (right.has(component)) return true;
	}
	return false;
}

/**
 * Structural read model: which production buildings currently have no way to
 * move their output. Pure and derived from placed buildings and rails only, so
 * it is meaningful the moment a building is placed — before any day runs.
 */
export function getIndustrialLinkIssues(game: GameState): Map<string, IndustrialLinkIssue> {
	const issues = new Map<string, IndustrialLinkIssue>();

	for (const city of game.industryCities) {
		const buildings = game.industrialBuildings.filter((building) => building.cityId === city.id);
		if (buildings.length === 0) continue;

		const network = buildRailNetwork(city);
		const componentByKey = labelRailComponents(network);
		const componentsOf = (building: IndustrialBuilding): Set<number> =>
			new Set(getBuildingAttachCellKeys(network, building).map((key) => componentByKey.get(key)!));

		const warehouses = buildings.filter((building) => building.typeId === 'warehouse');
		const warehouseComponents = new Set<number>();
		for (const warehouse of warehouses) {
			for (const component of componentsOf(warehouse)) warehouseComponents.add(component);
		}

		for (const building of buildings) {
			const recipe = recipeFor(building);
			if (!recipe) continue;

			const outputs = new Set<MaterialId>(recipe.outputs.map((output) => output.materialId));
			const consumers = buildings.filter(
				(other) =>
					other.id !== building.id &&
					(recipeFor(other)?.inputs.some((input) => outputs.has(input.materialId)) ?? false)
			);
			const own = componentsOf(building);
			const linked =
				sharesComponent(own, warehouseComponents) ||
				consumers.some((consumer) => sharesComponent(own, componentsOf(consumer)));
			if (linked) continue;

			issues.set(
				building.id,
				warehouses.length === 0 && consumers.length === 0 ? 'no-warehouse' : 'rail-disconnected'
			);
		}
	}

	return issues;
}
