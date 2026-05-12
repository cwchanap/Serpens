import { INDUSTRIAL_BUILDING_TYPES, MATERIALS, PRODUCTION_RECIPES } from './industry';
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
	const available = warehouse.materials[materialId] ?? 0;
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
	const report: DailyProductionReport = createEmptyProductionReport(warehouse);
	const buildingUpdates = new Map<string, IndustrialBuilding>();

	for (const building of [...game.industrialBuildings].sort(compareIndustrialBuildingsByStage)) {
		const buildingType = INDUSTRIAL_BUILDING_TYPES[building.typeId];

		if (!buildingType) {
			buildingUpdates.set(building.id, markBuildingBlocked(building));
			continue;
		}

		if (!buildingType.recipeId) {
			buildingUpdates.set(building.id, {
				...building,
				status: 'idle',
				lastProduction: []
			});
			continue;
		}

		const recipe = PRODUCTION_RECIPES[buildingType.recipeId];

		if (!recipe) {
			buildingUpdates.set(building.id, markBuildingBlocked(building));
			continue;
		}

		let importSpend = 0;
		let importedInputQuantity = 0;

		for (const input of recipe.inputs) {
			const removal = removeWarehouseMaterial(warehouse, input.materialId, input.quantity);
			warehouse = removal.warehouse;

			if (removal.quantityRemoved > 0) {
				const movement = createMovement(
					input.materialId,
					removal.quantityRemoved,
					MATERIALS[input.materialId].localValue,
					'warehouse'
				);
				report.consumed.push(movement);
				report.warehousePulls.push(movement);
			}

			if (removal.shortage > 0) {
				const importMovement = createMovement(
					input.materialId,
					removal.shortage,
					MATERIALS[input.materialId].importCost,
					'import'
				);
				importSpend += importMovement.value;
				importedInputQuantity += removal.shortage;
				report.consumed.push(importMovement);
				report.importedInputs.push(importMovement);
			}
		}

		const produced = recipe.outputs.map((output) =>
			createMovement(
				output.materialId,
				output.quantity,
				MATERIALS[output.materialId].localValue,
				'local'
			)
		);

		for (const movement of produced) {
			warehouse = addWarehouseMaterial(warehouse, movement.materialId, movement.quantity);
			report.produced.push(movement);
		}

		const operatingCost = recipe.operatingCost + buildingType.dailyOperatingCost;
		report.importSpend += importSpend;
		report.operatingCost += operatingCost;
		buildingUpdates.set(building.id, {
			...building,
			status: importSpend > 0 ? 'imported-inputs' : 'produced',
			lastProduction: produced,
			producedTotal:
				building.producedTotal + produced.reduce((total, movement) => total + movement.quantity, 0),
			importedInputTotal: building.importedInputTotal + importedInputQuantity,
			blockedDays: 0
		});
	}

	warehouse = recalculateWarehousePressure(warehouse);
	report.overflowUnits = warehouse.overflowUnits;
	report.overflowCost = warehouse.overflowCost;
	report.warehouseCapacity = warehouse.capacity;
	report.warehouseUsed = getWarehouseUsed(warehouse);

	return {
		game: {
			...game,
			cash: game.cash - report.importSpend - report.operatingCost - report.overflowCost,
			warehouse,
			industrialBuildings: game.industrialBuildings.map(
				(building) => buildingUpdates.get(building.id) ?? building
			)
		},
		report
	};
}

function createEmptyProductionReport(warehouse: WarehouseInventory): DailyProductionReport {
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
		warehouseUsed: getWarehouseUsed(warehouse)
	};
}

function compareIndustrialBuildingsByStage(
	first: IndustrialBuilding,
	second: IndustrialBuilding
): number {
	const firstStage = getIndustrialBuildingStage(INDUSTRIAL_BUILDING_TYPES[first.typeId]);
	const secondStage = getIndustrialBuildingStage(INDUSTRIAL_BUILDING_TYPES[second.typeId]);
	return RECIPE_STAGE_ORDER[firstStage] - RECIPE_STAGE_ORDER[secondStage];
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
