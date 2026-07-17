import { addInventory, inventoryUsed, removeInventory } from './buildingInventory';
import { INDUSTRIAL_BUILDING_TYPES, MATERIALS, PRODUCTION_RECIPES } from './industry';
import { getBuildingThroughputMultiplier } from './leveling';
import { createRailTickState, pullViaRail, pushSurplusViaRail } from './railShipping';
import type {
	DailyMaterialMovement,
	DailyProductionReport,
	GameState,
	IndustrialBuilding,
	IndustrialBuildingType,
	MaterialId,
	WarehouseInventory
} from './types';

export const WAREHOUSE_OVERFLOW_COST_PER_UNIT = 2;

interface RemoveWarehouseMaterialResult {
	warehouse: WarehouseInventory;
	quantityRemoved: number;
	shortage: number;
}

const RECIPE_STAGE_ORDER = {
	raw: 0,
	process: 1,
	final: 2,
	warehouse: 3
} as const;

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

	return recalculateWarehousePressure({
		...warehouse,
		materials
	});
}

export function removeWarehouseMaterial(
	warehouse: WarehouseInventory,
	materialId: MaterialId,
	requestedQuantity: number
): RemoveWarehouseMaterialResult {
	const requested = Math.max(0, requestedQuantity);
	const available = Math.max(0, warehouse.materials[materialId] ?? 0);
	const quantityRemoved = Math.min(available, requested);
	const materials = {
		...warehouse.materials,
		[materialId]: available - quantityRemoved
	};

	return {
		warehouse: recalculateWarehousePressure({
			...warehouse,
			materials
		}),
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

export function simulateIndustryProduction(game: GameState): {
	game: GameState;
	report: DailyProductionReport;
} {
	let warehouse = recalculateWarehousePressure({
		...game.warehouse,
		capacity: getWarehouseCapacity(game),
		materials: { ...game.warehouse.materials }
	});
	// One shared rail budget + working inventories/warehouse for the whole tick:
	// stage-ordered buildings mutate this in place, so a raw producer's output
	// is visible to a same-day rail pull by a downstream processor.
	const railState = createRailTickState(game, warehouse);
	const report: DailyProductionReport = createEmptyProductionReport(warehouse);
	const buildingUpdates = new Map<string, IndustrialBuilding>();
	const sorted = [...game.industrialBuildings].sort(compareIndustrialBuildingsByStage);

	for (const building of sorted) {
		const buildingType = INDUSTRIAL_BUILDING_TYPES[building.typeId];

		if (!buildingType) {
			buildingUpdates.set(building.id, markBuildingBlocked(building));
			continue;
		}

		if (!buildingType.recipeId) {
			buildingUpdates.set(building.id, {
				...building,
				status: 'idle',
				lastProduction: [],
				inventory: railState.inventories.get(building.id) ?? {}
			});
			continue;
		}

		const recipe = PRODUCTION_RECIPES[buildingType.recipeId];

		if (!recipe) {
			buildingUpdates.set(building.id, markBuildingBlocked(building));
			continue;
		}

		// Throughput is a pure function of building level: 1 + 0.2 × (level - 1).
		// The deterministic daily production chain must round inputs, produced
		// output, and operating cost so that two runs at the same seed + level
		// produce identical warehouse state and identical cash.
		const throughput = getBuildingThroughputMultiplier(building.level);
		let inventory = railState.inventories.get(building.id) ?? {};
		// Store the RAW (unrounded) output quantity × throughput so the final
		// scaling at `Math.round(output.quantity * ratio)` is a single round —
		// matching the input pattern `Math.round(input.quantity * throughput *
		// ratio)`. Pre-rounding here would double-round outputs and cause ±1-
		// unit drift at non-integer throughput levels (level ≥ 2).
		const desiredOutputs = recipe.outputs.map((output) => ({
			materialId: output.materialId,
			quantity: output.quantity * throughput
		}));
		const desiredTotal = desiredOutputs.reduce((total, output) => total + output.quantity, 0);
		// Deviation from plan: the plan computed free space as
		// `bufferCapacity - inventoryUsed(inventory)`. That stalls a building
		// whose buffer is full of inputs it is about to consume — it can never
		// free room for output and so never produces. Instead we project the
		// used space *after* consuming the recipe inputs already in the buffer,
		// so a full input buffer still permits a production cycle that frees
		// room for its outputs. This prevents input-locked stalls.
		//
		// Two-pass projection: the first pass assumes full input consumption
		// (unscaled) to maximise projected free space — this is what prevents
		// the stall. When the first pass yields ratio < 1, the actual
		// consumption is ratio-scaled (less than full), so less buffer space is
		// freed than the optimistic projection assumed. The second pass
		// recomputes with the actual ratio-scaled consumption to prevent
		// addInventory from silently clamping output below the ratio-predicted
		// amount. projectedUsed never goes negative (clamped by
		// `free = Math.max(0, ...)`).
		let projectedUsed = inventoryUsed(inventory);
		for (const input of recipe.inputs) {
			const needed = Math.round(input.quantity * throughput);
			const available = Math.max(0, inventory[input.materialId] ?? 0);
			projectedUsed -= Math.min(needed, available);
		}
		let free = Math.max(0, buildingType.bufferCapacity - projectedUsed);
		let ratio = desiredTotal > 0 ? Math.min(desiredTotal, free) / desiredTotal : 0;

		if (desiredTotal > 0 && ratio > 0 && ratio < 1) {
			projectedUsed = inventoryUsed(inventory);
			for (const input of recipe.inputs) {
				const needed = Math.round(input.quantity * throughput * ratio);
				const available = Math.max(0, inventory[input.materialId] ?? 0);
				projectedUsed -= Math.min(needed, available);
			}
			free = Math.max(0, buildingType.bufferCapacity - projectedUsed);
			ratio = Math.min(desiredTotal, free) / desiredTotal;
		}

		// Buffer is full and there's nowhere to put new output: skip acquiring
		// inputs entirely, pay only the flat daily cost, and mark stalled.
		// Zero bufferCapacity keeps free at 0, so ratio stays 0.
		if (desiredTotal > 0 && ratio === 0) {
			report.operatingCost += buildingType.dailyOperatingCost;
			buildingUpdates.set(building.id, {
				...building,
				status: 'stalled',
				inventory,
				lastProduction: [],
				blockedDays: 0
			});
			continue;
		}

		let importSpend = 0;
		let importedInputQuantity = 0;

		for (const input of recipe.inputs) {
			const needed = Math.round(input.quantity * throughput * ratio);
			const own = removeInventory(inventory, input.materialId, needed);
			inventory = own.inventory;
			railState.inventories.set(building.id, inventory);

			if (own.removed > 0) {
				const movement = createMovement(
					input.materialId,
					own.removed,
					MATERIALS[input.materialId].localValue,
					'local'
				);
				report.consumed.push(movement);
			}

			let shortage = own.shortage;

			if (shortage > 0) {
				const pulled = pullViaRail(railState, building, input.materialId, shortage);
				inventory = railState.inventories.get(building.id) ?? inventory;

				if (pulled.fromProducers > 0) {
					report.consumed.push(
						createMovement(
							input.materialId,
							pulled.fromProducers,
							MATERIALS[input.materialId].localValue,
							'rail'
						)
					);
				}

				if (pulled.fromWarehouse > 0) {
					const movement = createMovement(
						input.materialId,
						pulled.fromWarehouse,
						MATERIALS[input.materialId].localValue,
						'warehouse'
					);
					report.consumed.push(movement);
					report.warehousePulls.push(movement);
				}

				shortage -= pulled.fromProducers + pulled.fromWarehouse;
			}

			if (shortage > 0) {
				const importMovement = createMovement(
					input.materialId,
					shortage,
					MATERIALS[input.materialId].importCost,
					'import'
				);
				importSpend += importMovement.value;
				importedInputQuantity += shortage;
				report.consumed.push(importMovement);
				report.importedInputs.push(importMovement);
			}
		}

		const produced: DailyMaterialMovement[] = [];

		for (const output of desiredOutputs) {
			const scaled = Math.round(output.quantity * ratio);
			const addition = addInventory(
				inventory,
				output.materialId,
				scaled,
				buildingType.bufferCapacity
			);
			inventory = addition.inventory;

			if (addition.added > 0) {
				const movement = createMovement(
					output.materialId,
					addition.added,
					MATERIALS[output.materialId].localValue,
					'local'
				);
				produced.push(movement);
				report.produced.push(movement);
			}
		}

		railState.inventories.set(building.id, inventory);
		const operatingCost = Math.round(
			recipe.operatingCost * throughput * ratio + buildingType.dailyOperatingCost
		);
		report.importSpend += importSpend;
		report.operatingCost += operatingCost;
		buildingUpdates.set(building.id, {
			...building,
			status: ratio < 1 ? 'stalled' : importSpend > 0 ? 'imported-inputs' : 'produced',
			inventory,
			lastProduction: produced,
			producedTotal:
				building.producedTotal + produced.reduce((total, movement) => total + movement.quantity, 0),
			importedInputTotal: building.importedInputTotal + importedInputQuantity,
			blockedDays: 0
		});
	}

	// Push phase: same stage order, after every building has had a chance to
	// produce, so surplus buffers drain to the shared warehouse for retail.
	// buildingType is re-fetched here (already looked up in the production
	// loop above) because the two loops are separate phases — the lookup is a
	// cheap map read and keeping them independent avoids sharing mutable state.
	for (const building of sorted) {
		const buildingType = INDUSTRIAL_BUILDING_TYPES[building.typeId];

		if (buildingType?.recipeId) {
			pushSurplusViaRail(railState, building);
		}
	}

	warehouse = recalculateWarehousePressure(railState.warehouse);
	report.overflowUnits = warehouse.overflowUnits;
	report.overflowCost = warehouse.overflowCost;
	report.warehouseCapacity = warehouse.capacity;
	report.warehouseUsed = getWarehouseUsed(warehouse);
	report.railShipments = railState.shipments;
	report.railUsage = railState.usage;

	return {
		game: {
			...game,
			cash: game.cash - report.importSpend - report.operatingCost - report.overflowCost,
			warehouse,
			industrialBuildings: game.industrialBuildings.map((building) => {
				// Push phase can drain a building's buffer after buildingUpdates was
				// written, so re-read railState.inventories here or pushed units
				// would resurrect in the returned GameState.
				const updated = buildingUpdates.get(building.id) ?? building;
				return {
					...updated,
					// railState.inventories always has an entry for every building
					// (seeded by createRailTickState); updated.inventory is a dead
					// fallback kept as a safety net for hypothetical edge cases.
					inventory: railState.inventories.get(building.id) ?? updated.inventory ?? {}
				};
			})
		},
		report
	};
}

export function createEmptyProductionReport(warehouse: WarehouseInventory): DailyProductionReport {
	return {
		produced: [],
		consumed: [],
		importedInputs: [],
		warehousePulls: [],
		shopImports: [],
		importSpend: 0,
		operatingCost: 0,
		overflowUnits: warehouse.overflowUnits,
		overflowCost: warehouse.overflowCost,
		warehouseCapacity: warehouse.capacity,
		warehouseUsed: getWarehouseUsed(warehouse),
		railShipments: [],
		railUsage: {}
	};
}

function compareIndustrialBuildingsByStage(
	first: IndustrialBuilding,
	second: IndustrialBuilding
): number {
	const firstStage = getIndustrialBuildingStage(INDUSTRIAL_BUILDING_TYPES[first.typeId]);
	const secondStage = getIndustrialBuildingStage(INDUSTRIAL_BUILDING_TYPES[second.typeId]);
	const stageDiff = RECIPE_STAGE_ORDER[firstStage] - RECIPE_STAGE_ORDER[secondStage];
	// Plain string compare tie-break (never localeCompare — engine code must
	// stay locale-independent). The spec requires "ties by building id" so
	// same-stage buildings process in a deterministic order regardless of
	// the input array's insertion order.
	return stageDiff !== 0 ? stageDiff : first.id < second.id ? -1 : first.id > second.id ? 1 : 0;
}

function getIndustrialBuildingStage(
	buildingType: IndustrialBuildingType | undefined
): keyof typeof RECIPE_STAGE_ORDER {
	if (!buildingType?.recipeId) {
		return 'warehouse';
	}

	return PRODUCTION_RECIPES[buildingType.recipeId]?.stage ?? 'warehouse';
}

function createMovement(
	materialId: MaterialId,
	quantity: number,
	unitValue: number,
	source: DailyMaterialMovement['source']
): DailyMaterialMovement {
	return {
		materialId,
		quantity,
		value: quantity * unitValue,
		source
	};
}

function markBuildingBlocked(building: IndustrialBuilding): IndustrialBuilding {
	return {
		...building,
		status: 'blocked',
		lastProduction: [],
		blockedDays: building.blockedDays + 1
	};
}
