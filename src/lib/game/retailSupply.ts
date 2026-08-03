import {
	assertValidEntityCityOwnership,
	compareWorldCityIds,
	getCityInventory,
	removeCityInventoryMaterial,
	resolveWorldCityId,
	supportsCityInventory
} from './cityInventory';
import { getArchetype } from './archetypes';
import { MATERIALS } from './industry';
import {
	DEFAULT_SIMULATION_RULES,
	resolveImportCostMultiplier,
	type ImportCostApplicationEvidence,
	type SimulationRules
} from './simulationRules';
import { calculateStockHealth, getFinishedMaterialIdForCategory } from './stock';
import { getWorldCityDefinition } from './world';
import type {
	CityInventory,
	DailyProductReport,
	GameState,
	ProductCategory,
	RetailReplenishmentContext,
	RetailReplenishmentOutcome,
	RetailSupplyAssignment,
	Store,
	WorldCityId
} from './types';

export const REPLENISHMENT_INTERVAL_DAYS = 7;

export type RetailSupplyAssignmentFailure =
	| 'unknown-retail-city'
	| 'retail-city-closed'
	| 'unsupported-retail-city'
	| 'unknown-supply-city'
	| 'supply-city-closed'
	| 'unsupported-supply-city';

export type RetailSupplyAssignmentResult =
	| { ok: true; game: GameState; changed: boolean }
	| { ok: false; game: GameState; reason: RetailSupplyAssignmentFailure };

export interface WeeklyReplenishmentInput {
	game: GameState;
	storeReports: Map<string, DailyProductReport[]>;
	rules?: SimulationRules;
}

export interface WeeklyReplenishmentResult {
	stores: Store[];
	productReports: Map<string, DailyProductReport[]>;
	cityInventories: CityInventory[];
	importSpend: number;
	importCostApplications: ImportCostApplicationEvidence[];
	storeReplenishmentContexts: Map<string, RetailReplenishmentContext | null>;
}

export function isReplenishmentDay(day: number): boolean {
	return day > 0 && day % REPLENISHMENT_INTERVAL_DAYS === 0;
}

export function setRetailSupplySource(
	game: GameState,
	retailCityId: string,
	supplyCityId: string | null
): RetailSupplyAssignmentResult {
	const retailCity = resolveRetailCityForAssignment(game, retailCityId);
	if (!retailCity.ok) {
		return { ok: false, game, reason: retailCity.reason };
	}

	const supplyCity =
		supplyCityId === null
			? { ok: true as const, cityId: null }
			: resolveSupplyCity(game, supplyCityId);
	if (!supplyCity.ok) {
		return { ok: false, game, reason: supplyCity.reason };
	}

	const assignments = game.retailSupplyAssignments;
	const existing = assignments.find((assignment) => assignment.retailCityId === retailCity.cityId);
	if (existing?.supplyCityId === supplyCity.cityId) {
		return { ok: true, game, changed: false };
	}

	const nextAssignment: RetailSupplyAssignment = {
		retailCityId: retailCity.cityId,
		supplyCityId: supplyCity.cityId
	};
	const retailSupplyAssignments = existing
		? assignments.map((assignment) =>
				assignment.retailCityId === retailCity.cityId ? nextAssignment : assignment
			)
		: [...assignments, nextAssignment].sort((left, right) =>
				compareWorldCityIds(left.retailCityId, right.retailCityId)
			);

	return { ok: true, game: { ...game, retailSupplyAssignments }, changed: true };
}

export function applyWeeklyReplenishment(
	input: WeeklyReplenishmentInput
): WeeklyReplenishmentResult {
	assertValidEntityCityOwnership(input.game);
	const rules = input.rules ?? DEFAULT_SIMULATION_RULES;
	const productReports = cloneProductReports(input.storeReports);
	const cityInventoriesByCityId = new Map<WorldCityId, CityInventory>(
		input.game.cityInventories.map((inventory) => [inventory.cityId, inventory])
	);
	const updatedStores = new Map<string, Store>();
	const storeReplenishmentContexts = new Map<string, RetailReplenishmentContext | null>();
	const importCostApplications: ImportCostApplicationEvidence[] = [];
	let importSpend = 0;

	for (const retailCityId of getRetailCityIdsInReplenishmentOrder(input.game)) {
		const context = resolveRetailSupplyContext(input.game, retailCityId);
		const cityStores = input.game.stores.filter((store) => store.cityId === retailCityId);

		for (const store of cityStores) {
			let attemptedReplenishment = false;
			const categories = getArchetype(store.archetypeId).startingCategories;
			const products = store.products.map((product) => {
				if (product.stock >= product.reorderThreshold) {
					return product;
				}

				const category = categories.find((candidate) => candidate.id === product.categoryId);
				const neededUnits = Math.max(0, product.targetStock - product.stock);
				if (!category || neededUnits === 0) {
					return product;
				}

				attemptedReplenishment = true;
				const replenishment = replenishProduct({
					context,
					category,
					neededUnits,
					cityInventoriesByCityId
				});
				const baselineCost = replenishment.importedUnits * category.importCost;
				const costResolution = resolveImportCostMultiplier(rules, 'retail-product', category.id);
				const spend = Math.round(baselineCost * costResolution.multiplier);

				if (
					replenishment.importedUnits > 0 &&
					baselineCost > 0 &&
					costResolution.contributions.length > 0
				) {
					importCostApplications.push({
						scope: 'retail-product',
						targetId: category.id,
						baselineCost,
						resolvedMultiplier: costResolution.multiplier,
						actualCost: spend,
						contributions: costResolution.contributions
					});
				}

				importSpend += spend;
				mergeReplenishmentReport(productReports, store.id, category, {
					endingStock: product.targetStock,
					warehouseUnits: replenishment.warehouseUnits,
					warehouseValue: replenishment.warehouseValue,
					importedUnits: replenishment.importedUnits,
					importSpend: spend,
					outcome: replenishment.outcome
				});

				return { ...product, stock: product.targetStock };
			});

			updatedStores.set(store.id, {
				...store,
				products,
				stockHealth: calculateStockHealth(products)
			});
			storeReplenishmentContexts.set(store.id, attemptedReplenishment ? context : null);
		}
	}

	const cityInventories = input.game.cityInventories.map(
		(inventory) => cityInventoriesByCityId.get(inventory.cityId) ?? inventory
	);

	return {
		stores: input.game.stores.map((store) => updatedStores.get(store.id) ?? store),
		productReports,
		cityInventories,
		importSpend,
		importCostApplications,
		storeReplenishmentContexts
	};
}

function resolveRetailCityForAssignment(
	game: GameState,
	cityId: string
):
	| { ok: true; cityId: WorldCityId }
	| {
			ok: false;
			reason: 'unknown-retail-city' | 'retail-city-closed' | 'unsupported-retail-city';
	  } {
	const definition = getWorldCityDefinition(cityId);
	if (!definition) {
		return { ok: false, reason: 'unknown-retail-city' };
	}
	if (!game.world.openedCityIds.includes(definition.id)) {
		return { ok: false, reason: 'retail-city-closed' };
	}
	if (definition.kind !== 'retail' || !game.cities.some((city) => city.id === definition.id)) {
		return { ok: false, reason: 'unsupported-retail-city' };
	}

	return { ok: true, cityId: definition.id };
}

function resolveSupplyCity(
	game: GameState,
	cityId: string
):
	| { ok: true; cityId: WorldCityId }
	| {
			ok: false;
			reason: 'unknown-supply-city' | 'supply-city-closed' | 'unsupported-supply-city';
	  } {
	const resolvedCityId = resolveWorldCityId(cityId);
	if (!resolvedCityId) {
		return { ok: false, reason: 'unknown-supply-city' };
	}
	if (!game.world.openedCityIds.includes(resolvedCityId)) {
		return { ok: false, reason: 'supply-city-closed' };
	}
	if (!supportsCityInventory(game, resolvedCityId)) {
		return { ok: false, reason: 'unsupported-supply-city' };
	}

	return { ok: true, cityId: resolvedCityId };
}

function getRetailCityIdsInReplenishmentOrder(game: GameState): WorldCityId[] {
	const cityIds = new Set<WorldCityId>();

	for (const store of game.stores) {
		const cityId = resolveWorldCityId(store.cityId);
		if (cityId && getWorldCityDefinition(cityId)?.kind === 'retail') {
			cityIds.add(cityId);
		}
	}

	return [...cityIds].sort(compareWorldCityIds);
}

function resolveRetailSupplyContext(
	game: GameState,
	retailCityId: WorldCityId
): RetailReplenishmentContext {
	const configuredSupplyCityId =
		game.retailSupplyAssignments.find((assignment) => assignment.retailCityId === retailCityId)
			?.supplyCityId ?? null;
	const access = configuredSupplyCityId ? getCityInventory(game, configuredSupplyCityId) : null;

	return {
		retailCityId,
		configuredSupplyCityId,
		resolvedSupplyCityId: access?.ok ? access.inventory.cityId : null
	};
}

function replenishProduct(input: {
	context: RetailReplenishmentContext;
	category: ProductCategory;
	neededUnits: number;
	cityInventoriesByCityId: Map<WorldCityId, CityInventory>;
}): {
	warehouseUnits: number;
	warehouseValue: number;
	importedUnits: number;
	outcome: RetailReplenishmentOutcome;
} {
	const materialId = getFinishedMaterialIdForCategory(input.category.id);
	const sourceCityId = input.context.resolvedSupplyCityId;
	if (sourceCityId && materialId) {
		const sourceInventory = input.cityInventoriesByCityId.get(sourceCityId)!;
		const removal = removeCityInventoryMaterial(sourceInventory, materialId, input.neededUnits);
		input.cityInventoriesByCityId.set(sourceCityId, removal.inventory);

		return {
			warehouseUnits: removal.quantityRemoved,
			warehouseValue: removal.quantityRemoved * MATERIALS[materialId].localValue,
			importedUnits: removal.shortage,
			outcome:
				removal.quantityRemoved === input.neededUnits
					? 'city-inventory'
					: removal.quantityRemoved > 0
						? 'mixed'
						: 'import-only'
		};
	}

	return {
		warehouseUnits: 0,
		warehouseValue: 0,
		importedUnits: input.neededUnits,
		outcome:
			input.context.configuredSupplyCityId === null
				? 'unassigned-import'
				: sourceCityId === null
					? 'source-unavailable-import'
					: 'import-only'
	};
}

function cloneProductReports(
	reports: Map<string, DailyProductReport[]>
): Map<string, DailyProductReport[]> {
	return new Map(
		[...reports.entries()].map(([storeId, storeReports]) => [
			storeId,
			storeReports.map((report) => ({ ...report }))
		])
	);
}

function mergeReplenishmentReport(
	reports: Map<string, DailyProductReport[]>,
	storeId: string,
	category: ProductCategory,
	refill: {
		endingStock: number;
		warehouseUnits: number;
		warehouseValue: number;
		importedUnits: number;
		importSpend: number;
		outcome: RetailReplenishmentOutcome;
	}
): void {
	const storeReports = reports.get(storeId) ?? [];
	const existingIndex = storeReports.findIndex((report) => report.categoryId === category.id);
	const replenishedFields = {
		endingStock: refill.endingStock,
		warehouseUnits: refill.warehouseUnits,
		warehouseValue: refill.warehouseValue,
		importedUnits: refill.importedUnits,
		importCost: category.importCost,
		importSpend: refill.importSpend,
		replenishmentOutcome: refill.outcome
	};

	if (existingIndex >= 0) {
		storeReports[existingIndex] = { ...storeReports[existingIndex]!, ...replenishedFields };
		reports.set(storeId, storeReports);
		return;
	}

	reports.set(storeId, [
		...storeReports,
		{
			categoryId: category.id,
			name: category.name,
			unitsSold: 0,
			demandMissed: 0,
			revenue: 0,
			costOfGoods: 0,
			grossMargin: 0,
			...replenishedFields
		}
	]);
}
