import { removeInventory } from './buildingInventory';
import { INDUSTRIAL_BUILDING_TYPES, MATERIALS, PRODUCTION_RECIPES } from './industry';
import { addWarehouseMaterial, removeWarehouseMaterial } from './industryProduction';
import {
	buildRailNetwork,
	consumeRailBudget,
	createRailBudget,
	findShippingPath,
	getBuildingAttachCellKeys,
	getPathCapacity,
	parseRailCellKey,
	railUsageKey
} from './rail';
import type { RailBudget, RailNetwork } from './rail';
import type {
	GameState,
	IndustrialBuilding,
	MaterialId,
	RailShipment,
	WarehouseInventory
} from './types';

interface RailTickCity {
	network: RailNetwork;
	budget: RailBudget;
	attachCellsByBuildingId: Map<string, string[]>;
}

export interface RailTickState {
	citiesById: Map<string, RailTickCity>;
	buildingsById: Map<string, IndustrialBuilding>;
	inventories: Map<string, Partial<Record<MaterialId, number>>>; // working copies
	warehouse: WarehouseInventory; // working copy, reassigned on change
	usage: Record<string, number>; // railUsageKey → units
	shipments: RailShipment[];
}

export interface RailPullResult {
	fromProducers: number;
	fromWarehouse: number;
}

/**
 * Builds the per-tick working state Task 5 mutates over the day: one rail
 * network + fresh budget + attach-cell index per industry city, plus working
 * copies of every building's inventory and the shared warehouse. Nothing here
 * (or in pullViaRail/pushSurplusViaRail) writes back into `game` — the caller
 * owns folding `state.inventories` / `state.warehouse` back into a new
 * GameState once the tick is done.
 */
export function createRailTickState(game: GameState, warehouse: WarehouseInventory): RailTickState {
	const citiesById = new Map<string, RailTickCity>();

	for (const city of game.industryCities) {
		const network = buildRailNetwork(city);
		const attachCellsByBuildingId = new Map<string, string[]>();

		for (const building of game.industrialBuildings) {
			if (building.cityId === city.id) {
				attachCellsByBuildingId.set(building.id, getBuildingAttachCellKeys(network, building));
			}
		}

		citiesById.set(city.id, {
			network,
			budget: createRailBudget(network),
			attachCellsByBuildingId
		});
	}

	return {
		citiesById,
		buildingsById: new Map(game.industrialBuildings.map((building) => [building.id, building])),
		inventories: new Map(
			game.industrialBuildings.map((building) => [building.id, { ...building.inventory }])
		),
		warehouse,
		usage: {},
		shipments: []
	};
}

interface ShipmentCandidate {
	buildingId: string;
	kind: 'pull-producer' | 'pull-warehouse';
	stock: number;
}

function recordUsage(
	state: RailTickState,
	cityId: string,
	path: readonly string[],
	units: number
): void {
	for (const key of path) {
		const { x, y } = parseRailCellKey(key);
		const usageKey = railUsageKey(cityId, x, y);
		state.usage[usageKey] = (state.usage[usageKey] ?? 0) + units;
	}
}

// Plain string compare only — never localeCompare — so candidate ordering
// (and therefore every tie-break) is stable across locales/engines.
function compareBuildingIds(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Repeats nearest-source BFS until `requested` is met or no budget-positive
 * path to any stocked source remains. Sources are same-city producer buffers
 * holding the material (excluding the consumer) and warehouse-type buildings
 * (stock = the shared warehouse pool).
 *
 * Determinism contract: on every iteration, candidates are sorted by
 * building id (plain string compare, no locale awareness), then exactly one
 * `findShippingPath` runs per candidate. The shortest path wins; a strictly
 * shorter path replaces the current best, so on a tie the earlier
 * (lowest-id) candidate is kept. Each shipment moves
 * `min(remaining, pathCapacity, sourceStock)` and the loop repeats against
 * the updated budget/stock until `remaining` hits 0 or no candidate has a
 * reachable, budget-positive path.
 *
 * Complexity: O(pulls × candidates × BFS) per tick — fine for current
 * building counts, but worth profiling if industry cities grow large.
 */
export function pullViaRail(
	state: RailTickState,
	consumer: IndustrialBuilding,
	materialId: MaterialId,
	requested: number
): RailPullResult {
	const result: RailPullResult = { fromProducers: 0, fromWarehouse: 0 };
	const city = state.citiesById.get(consumer.cityId);
	const consumerAttach = city?.attachCellsByBuildingId.get(consumer.id) ?? [];

	if (!city || consumerAttach.length === 0) {
		return result;
	}

	let remaining = Math.max(0, requested);

	// Sort once — the building-id order is constant for the whole tick; only
	// stock levels change between iterations, so candidates are rebuilt from
	// this pre-sorted list each pass.
	const sortedEntries = [...state.buildingsById.entries()].sort(([a], [b]) =>
		compareBuildingIds(a, b)
	);

	while (remaining > 0) {
		// Candidate sources, sorted by building id (plain string compare).
		const candidates: ShipmentCandidate[] = [];

		for (const [buildingId, building] of sortedEntries) {
			if (building.cityId !== consumer.cityId || buildingId === consumer.id) {
				continue;
			}

			if (building.typeId === 'warehouse') {
				const stock = Math.max(0, state.warehouse.materials[materialId] ?? 0);

				if (stock > 0) {
					candidates.push({ buildingId, kind: 'pull-warehouse', stock });
				}

				continue;
			}

			// Only recipe outputs count as transferable producer surplus —
			// buffered consumer inputs on a processor must not satisfy a pull.
			const buildingType = INDUSTRIAL_BUILDING_TYPES[building.typeId];
			const recipe = buildingType?.recipeId ? PRODUCTION_RECIPES[buildingType.recipeId] : undefined;
			if (!recipe?.outputs.some((output) => output.materialId === materialId)) {
				continue;
			}

			const stock = Math.max(0, state.inventories.get(buildingId)?.[materialId] ?? 0);

			if (stock > 0) {
				candidates.push({ buildingId, kind: 'pull-producer', stock });
			}
		}

		// Nearest source wins; earlier candidate (lower id) wins ties because
		// only strictly shorter paths replace the best.
		let best: { candidate: ShipmentCandidate; path: string[] } | null = null;

		for (const candidate of candidates) {
			const sourceAttach = city.attachCellsByBuildingId.get(candidate.buildingId) ?? [];

			if (sourceAttach.length === 0) {
				continue;
			}

			const path = findShippingPath(city.network, city.budget, consumerAttach, sourceAttach);

			if (path && (!best || path.length < best.path.length)) {
				best = { candidate, path };
			}
		}

		if (!best) {
			return result;
		}

		const quantity = Math.min(
			remaining,
			getPathCapacity(city.budget, best.path),
			best.candidate.stock
		);

		if (quantity <= 0) {
			return result;
		}

		if (best.candidate.kind === 'pull-warehouse') {
			state.warehouse = removeWarehouseMaterial(state.warehouse, materialId, quantity).warehouse;
			result.fromWarehouse += quantity;
		} else {
			const removal = removeInventory(
				state.inventories.get(best.candidate.buildingId) ?? {},
				materialId,
				quantity
			);
			state.inventories.set(best.candidate.buildingId, removal.inventory);
			result.fromProducers += quantity;
		}

		consumeRailBudget(city.budget, best.path, quantity);
		recordUsage(state, consumer.cityId, best.path, quantity);
		state.shipments.push({
			materialId,
			quantity,
			value: quantity * MATERIALS[materialId].localValue,
			kind: best.candidate.kind,
			fromId: best.candidate.buildingId,
			toId: consumer.id
		});
		remaining -= quantity;
	}

	return result;
}

/**
 * Pushes every unit in the producer's buffer to the nearest reachable
 * warehouse building, budget-limited. Warehouse overflow is allowed here —
 * the caller applies the overflow fee via recalculateWarehousePressure
 * (already folded into addWarehouseMaterial's return).
 */
export function pushSurplusViaRail(state: RailTickState, producer: IndustrialBuilding): void {
	const city = state.citiesById.get(producer.cityId);
	const producerAttach = city?.attachCellsByBuildingId.get(producer.id) ?? [];

	if (!city || producerAttach.length === 0) {
		return;
	}

	const inventory = state.inventories.get(producer.id) ?? {};
	const buildingType = INDUSTRIAL_BUILDING_TYPES[producer.typeId];
	const recipe = buildingType?.recipeId ? PRODUCTION_RECIPES[buildingType.recipeId] : undefined;
	// Push only recipe outputs; retain buffered inputs for local production.
	const materialIds = (recipe?.outputs.map((output) => output.materialId) ?? []).sort();

	// Sort once — the building-id order is constant for the whole tick.
	const sortedEntries = [...state.buildingsById.entries()].sort(([a], [b]) =>
		compareBuildingIds(a, b)
	);

	for (const materialId of materialIds) {
		let stock = Math.max(0, inventory[materialId] ?? 0);

		while (stock > 0) {
			let best: { warehouseId: string; path: string[] } | null = null;

			for (const [buildingId, building] of sortedEntries) {
				if (building.cityId !== producer.cityId || building.typeId !== 'warehouse') {
					continue;
				}

				const warehouseAttach = city.attachCellsByBuildingId.get(buildingId) ?? [];

				if (warehouseAttach.length === 0) {
					continue;
				}

				const path = findShippingPath(city.network, city.budget, producerAttach, warehouseAttach);

				if (path && (!best || path.length < best.path.length)) {
					best = { warehouseId: buildingId, path };
				}
			}

			if (!best) {
				return;
			}

			const quantity = Math.min(stock, getPathCapacity(city.budget, best.path));

			if (quantity <= 0) {
				return;
			}

			const removal = removeInventory(
				state.inventories.get(producer.id) ?? {},
				materialId,
				quantity
			);
			state.inventories.set(producer.id, removal.inventory);
			state.warehouse = addWarehouseMaterial(state.warehouse, materialId, quantity);
			consumeRailBudget(city.budget, best.path, quantity);
			recordUsage(state, producer.cityId, best.path, quantity);
			state.shipments.push({
				materialId,
				quantity,
				value: quantity * MATERIALS[materialId].localValue,
				kind: 'push-warehouse',
				fromId: producer.id,
				toId: best.warehouseId
			});
			stock -= quantity;
		}
	}
}
