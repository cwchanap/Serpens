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
import { getProductDefinition } from './products';
import {
	DEFAULT_SIMULATION_RULES,
	resolveImportCostMultiplier,
	type ImportCostApplicationEvidence,
	type SimulationRules
} from './simulationRules';
import { addStoreProductStockLot, calculateStockHealth, getStoreProductStock } from './stock';
import { getWorldCityDefinition } from './world';
import type {
	CityInventory,
	DailyProductReport,
	GameState,
	ProductDefinition,
	RetailReplenishmentContext,
	RetailReplenishmentOutcome,
	RetailSupplyAssignment,
	Store,
	WorldCityId
} from './types';

export const REPLENISHMENT_INTERVAL_DAYS = 7;

export type RetailSupplyAssignmentFailure = 'invalid-retail-city' | 'invalid-supply-city';

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

export function getRetailReplenishmentOutcome(
	context: RetailReplenishmentContext,
	report: Pick<DailyProductReport, 'warehouseUnits' | 'importedUnits'>
): RetailReplenishmentOutcome | null {
	if (report.warehouseUnits === 0 && report.importedUnits === 0) {
		return null;
	}
	if (report.warehouseUnits > 0 && report.importedUnits > 0) {
		return 'mixed';
	}
	if (report.warehouseUnits > 0) {
		return 'city-inventory';
	}
	if (context.configuredSupplyCityId === null) {
		return 'unassigned-import';
	}
	if (context.resolvedSupplyCityId === null) {
		return 'source-unavailable-import';
	}
	return 'import-only';
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
			const startingProductIds = getArchetype(store.archetypeId).startingProductIds;
			const products = store.products.map((product) => {
				const stock = getStoreProductStock(product);
				if (stock >= product.reorderThreshold) {
					return product;
				}

				if (!startingProductIds.includes(product.productId)) {
					return product;
				}

				const productDefinition = getProductDefinition(product.productId);
				const neededUnits = Math.max(0, product.targetStock - stock);
				if (neededUnits === 0) {
					return product;
				}

				attemptedReplenishment = true;
				const replenishment = replenishProduct({
					context,
					product: productDefinition,
					neededUnits,
					cityInventoriesByCityId
				});
				const baselineCost = replenishment.importedUnits * productDefinition.importCost;
				const costResolution = resolveImportCostMultiplier(
					rules,
					'retail-product',
					productDefinition.id
				);
				const spend = Math.round(baselineCost * costResolution.multiplier);

				if (
					replenishment.importedUnits > 0 &&
					baselineCost > 0 &&
					costResolution.contributions.length > 0
				) {
					importCostApplications.push({
						scope: 'retail-product',
						targetId: productDefinition.id,
						baselineCost,
						resolvedMultiplier: costResolution.multiplier,
						actualCost: spend,
						contributions: costResolution.contributions
					});
				}

				importSpend += spend;
				mergeReplenishmentReport(productReports, store.id, productDefinition, {
					endingStock: product.targetStock,
					warehouseUnits: replenishment.warehouseUnits,
					warehouseValue: replenishment.warehouseValue,
					importedUnits: replenishment.importedUnits,
					importSpend: spend
				});

				return addStoreProductStockLot(product, {
					receivedDay: input.game.day,
					quantity: neededUnits
				});
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
): { ok: true; cityId: WorldCityId } | { ok: false; reason: 'invalid-retail-city' } {
	const definition = getWorldCityDefinition(cityId);
	if (
		!definition ||
		!game.world.openedCityIds.includes(definition.id) ||
		definition.kind !== 'retail' ||
		!game.cities.some((city) => city.id === definition.id)
	) {
		return { ok: false, reason: 'invalid-retail-city' };
	}

	return { ok: true, cityId: definition.id };
}

function resolveSupplyCity(
	game: GameState,
	cityId: string
): { ok: true; cityId: WorldCityId } | { ok: false; reason: 'invalid-supply-city' } {
	const resolvedCityId = resolveWorldCityId(cityId);
	if (
		!resolvedCityId ||
		!game.world.openedCityIds.includes(resolvedCityId) ||
		!supportsCityInventory(game, resolvedCityId)
	) {
		return { ok: false, reason: 'invalid-supply-city' };
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
	product: ProductDefinition;
	neededUnits: number;
	cityInventoriesByCityId: Map<WorldCityId, CityInventory>;
}): {
	warehouseUnits: number;
	warehouseValue: number;
	importedUnits: number;
} {
	const materialId = input.product.productionMaterialId;
	const sourceCityId = input.context.resolvedSupplyCityId;
	if (sourceCityId && materialId) {
		const sourceInventory = input.cityInventoriesByCityId.get(sourceCityId)!;
		const removal = removeCityInventoryMaterial(sourceInventory, materialId, input.neededUnits);
		input.cityInventoriesByCityId.set(sourceCityId, removal.inventory);

		return {
			warehouseUnits: removal.quantityRemoved,
			warehouseValue: removal.quantityRemoved * MATERIALS[materialId].localValue,
			importedUnits: removal.shortage
		};
	}

	return {
		warehouseUnits: 0,
		warehouseValue: 0,
		importedUnits: input.neededUnits
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
	product: ProductDefinition,
	refill: {
		endingStock: number;
		warehouseUnits: number;
		warehouseValue: number;
		importedUnits: number;
		importSpend: number;
	}
): void {
	const storeReports = reports.get(storeId) ?? [];
	const existingIndex = storeReports.findIndex((report) => report.productId === product.id);
	const replenishedFields = {
		endingStock: refill.endingStock,
		warehouseUnits: refill.warehouseUnits,
		warehouseValue: refill.warehouseValue,
		importedUnits: refill.importedUnits,
		importCost: product.importCost,
		importSpend: refill.importSpend
	};

	if (existingIndex >= 0) {
		storeReports[existingIndex] = { ...storeReports[existingIndex]!, ...replenishedFields };
		reports.set(storeId, storeReports);
		return;
	}

	reports.set(storeId, [
		...storeReports,
		{
			productId: product.id,
			name: product.name,
			unitsSold: 0,
			demandMissed: 0,
			revenue: 0,
			costOfGoods: 0,
			grossMargin: 0,
			...replenishedFields
		}
	]);
}
