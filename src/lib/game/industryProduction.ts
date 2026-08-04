import { addInventory, inventoryUsed, removeInventory } from './buildingInventory';
import {
	assertValidEntityCityOwnership,
	compareWorldCityIds,
	getCityInventory,
	getCityInventoryUsed,
	normalizeCityInventoryDerivedState
} from './cityInventory';
import { INDUSTRIAL_BUILDING_TYPES, MATERIALS, PRODUCTION_RECIPES } from './industry';
import { getBuildingThroughputMultiplier } from './leveling';
import { createRailTickState, pullViaRail, pushSurplusViaRail } from './railShipping';
import {
	DEFAULT_SIMULATION_RULES,
	resolveImportCostMultiplier,
	type ImportCostApplicationEvidence,
	type SimulationRules
} from './simulationRules';
import type {
	DailyMaterialMovement,
	DailyCityInventorySummary,
	DailyProductionReport,
	CityInventory,
	GameState,
	IndustrialBuilding,
	IndustrialBuildingType,
	MaterialId,
	MaterialQuantity,
	WorldCityId
} from './types';

const RECIPE_STAGE_ORDER = {
	raw: 0,
	process: 1,
	final: 2,
	warehouse: 3
} as const;

export function simulateIndustryProduction(
	game: GameState,
	rules: SimulationRules = DEFAULT_SIMULATION_RULES
): {
	game: GameState;
	report: DailyProductionReport;
	importCostApplications: ImportCostApplicationEvidence[];
} {
	assertValidEntityCityOwnership(game);
	const normalizedGame = normalizeCityInventoryDerivedState(game);
	// One rail budget and working inventory per city for the whole tick:
	// stage-ordered buildings mutate this in place, so a raw producer's output
	// is visible to a same-day rail pull by a downstream processor.
	const railState = createRailTickState(normalizedGame);
	const report: DailyProductionReport = createEmptyProductionReport();
	const importCostApplications: ImportCostApplicationEvidence[] = [];
	const buildingUpdates = new Map<string, IndustrialBuilding>();
	const sorted = [...normalizedGame.industrialBuildings].sort(compareIndustrialBuildingsByStage);

	for (const building of sorted) {
		const cityInventoryAccess = getCityInventory(normalizedGame, building.cityId);
		if (!cityInventoryAccess.ok) {
			buildingUpdates.set(building.id, markBuildingBlocked(building));
			continue;
		}

		const cityId = cityInventoryAccess.inventory.cityId;
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

		// Independently rounding each multi-input line at ratio < 1 can zero out
		// small ingredients while still producing output (e.g. 1 free snack slot
		// charges flour but not salt/oil/packaging). Quantize down to a scale
		// where every positive base input is represented, or produce nothing.
		ratio = quantizeAtomicRecipeRatio(
			ratio,
			desiredTotal,
			throughput,
			recipe.inputs,
			desiredOutputs
		);

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
					'local',
					cityId
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
							'rail',
							cityId
						)
					);
				}

				if (pulled.fromWarehouse > 0) {
					const movement = createMovement(
						input.materialId,
						pulled.fromWarehouse,
						MATERIALS[input.materialId].localValue,
						'warehouse',
						cityId
					);
					report.consumed.push(movement);
					report.warehousePulls.push(movement);
				}

				shortage -= pulled.fromProducers + pulled.fromWarehouse;
			}

			if (shortage > 0) {
				const baselineCost = shortage * MATERIALS[input.materialId].importCost;
				const resolution = resolveImportCostMultiplier(
					rules,
					'industrial-material',
					input.materialId
				);
				const importValue = Math.round(baselineCost * resolution.multiplier);
				if (baselineCost > 0 && resolution.contributions.length > 0) {
					importCostApplications.push({
						scope: 'industrial-material',
						targetId: input.materialId,
						baselineCost,
						resolvedMultiplier: resolution.multiplier,
						actualCost: importValue,
						contributions: resolution.contributions
					});
				}
				const importMovement = createMovementWithValue(
					input.materialId,
					shortage,
					importValue,
					'import',
					cityId
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
					'local',
					cityId
				);
				produced.push(movement);
				report.produced.push(movement);
			}
		}

		railState.inventories.set(building.id, inventory);
		// Derive the final ratio from the rounded quantities that actually fit
		// in the buffer. The projection above does not account for rail pulls
		// replenishing consumed inputs, so addInventory can silently clip
		// output below the ratio-predicted amount. Using the unclipped ratio
		// for operating cost and status would charge for more production than
		// occurred and misreport the building's state.
		const actualProducedTotal = produced.reduce((total, movement) => total + movement.quantity, 0);
		const scaledTotal = desiredOutputs.reduce(
			(total, output) => total + Math.round(output.quantity * ratio),
			0
		);
		const actualRatio = scaledTotal > 0 ? (actualProducedTotal / scaledTotal) * ratio : 0;
		const operatingCost = Math.round(
			recipe.operatingCost * throughput * actualRatio + buildingType.dailyOperatingCost
		);
		report.importSpend += importSpend;
		report.operatingCost += operatingCost;
		buildingUpdates.set(building.id, {
			...building,
			status: actualRatio < 1 ? 'stalled' : importSpend > 0 ? 'imported-inputs' : 'produced',
			inventory,
			lastProduction: produced,
			producedTotal: building.producedTotal + actualProducedTotal,
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

	const cityInventories = foldRailCityInventories(normalizedGame, railState);
	const cityInventorySummaries = summarizeCityInventories(cityInventories);
	report.cityInventories = cityInventorySummaries;
	report.overflowUnits = sumCityInventorySummaries(cityInventorySummaries, 'overflowUnits');
	report.overflowCost = sumCityInventorySummaries(cityInventorySummaries, 'overflowCost');
	report.warehouseCapacity = sumCityInventorySummaries(cityInventorySummaries, 'capacity');
	report.warehouseUsed = sumCityInventorySummaries(cityInventorySummaries, 'used');
	report.railShipments = railState.shipments;
	report.railUsage = railState.usage;

	return {
		game: {
			...normalizedGame,
			cash: normalizedGame.cash - report.importSpend - report.operatingCost - report.overflowCost,
			cityInventories,
			industrialBuildings: normalizedGame.industrialBuildings.map((building) => {
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
		report,
		importCostApplications
	};
}

export function createEmptyProductionReport(): DailyProductionReport {
	return {
		produced: [],
		consumed: [],
		importedInputs: [],
		warehousePulls: [],
		shopImports: [],
		importSpend: 0,
		operatingCost: 0,
		overflowUnits: 0,
		overflowCost: 0,
		warehouseCapacity: 0,
		warehouseUsed: 0,
		railShipments: [],
		railUsage: {},
		cityInventories: []
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
	source: DailyMaterialMovement['source'],
	cityId: WorldCityId
): DailyMaterialMovement {
	return createMovementWithValue(materialId, quantity, quantity * unitValue, source, cityId);
}

function createMovementWithValue(
	materialId: MaterialId,
	quantity: number,
	value: number,
	source: DailyMaterialMovement['source'],
	cityId: WorldCityId
): DailyMaterialMovement {
	return {
		cityId,
		materialId,
		quantity,
		value,
		source
	};
}

function foldRailCityInventories(
	game: GameState,
	railState: ReturnType<typeof createRailTickState>
) {
	return game.cityInventories.map(
		(inventory) => railState.cityInventoriesByCityId.get(inventory.cityId) ?? inventory
	);
}

function summarizeCityInventories(
	inventories: Iterable<CityInventory>
): DailyCityInventorySummary[] {
	return [...inventories]
		.sort((left, right) => compareWorldCityIds(left.cityId, right.cityId))
		.map((inventory) => ({
			cityId: inventory.cityId,
			capacity: inventory.capacity,
			used: getCityInventoryUsed(inventory),
			overflowUnits: inventory.overflowUnits,
			overflowCost: inventory.overflowCost
		}));
}

function sumCityInventorySummaries(
	summaries: readonly DailyCityInventorySummary[],
	field: 'capacity' | 'used' | 'overflowUnits' | 'overflowCost'
): number {
	return summaries.reduce((total, summary) => total + summary[field], 0);
}

function markBuildingBlocked(building: IndustrialBuilding): IndustrialBuilding {
	return {
		...building,
		status: 'blocked',
		lastProduction: [],
		blockedDays: building.blockedDays + 1
	};
}

/**
 * Caps a fractional recipe scale so partial multi-input runs stay atomic:
 * if any output rounds above zero, every positive base input must also round
 * above zero. Walks integer output-unit counts downward from the buffer-limited
 * scale so production never undercharges a required ingredient.
 */
export function quantizeAtomicRecipeRatio(
	ratio: number,
	desiredTotal: number,
	throughput: number,
	inputs: readonly MaterialQuantity[],
	outputs: readonly MaterialQuantity[]
): number {
	if (ratio <= 0 || desiredTotal <= 0) {
		return 0;
	}

	if (ratio >= 1) {
		return isAtomicRecipeScale(1, throughput, inputs, outputs) ? 1 : 0;
	}

	const maxUnits = Math.max(0, Math.floor(ratio * desiredTotal + 1e-9));

	for (let units = maxUnits; units >= 1; units -= 1) {
		const candidate = units / desiredTotal;

		if (isAtomicRecipeScale(candidate, throughput, inputs, outputs)) {
			return candidate;
		}
	}

	return 0;
}

function isAtomicRecipeScale(
	ratio: number,
	throughput: number,
	inputs: readonly MaterialQuantity[],
	outputs: readonly MaterialQuantity[]
): boolean {
	const hasOutput = outputs.some((output) => Math.round(output.quantity * ratio) > 0);

	if (!hasOutput) {
		return false;
	}

	for (const input of inputs) {
		const base = input.quantity * throughput;

		if (base > 0 && Math.round(base * ratio) <= 0) {
			return false;
		}
	}

	return true;
}
