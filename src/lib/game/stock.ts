import { getArchetype } from './archetypes';
import { getTilePlacementBlockReason } from './city';
import { MATERIALS } from './industry';
import { removeWarehouseMaterial } from './industryProduction';
import { clampScore } from './reports';
import { randomBetween, type Rng } from './rng';
import type {
	ArchetypeId,
	City,
	CompanyPolicy,
	DailyProductReport,
	GameState,
	MaterialId,
	ProductCategory,
	Store,
	StoreProduct,
	StoreProductPatch,
	WarehouseInventory
} from './types';

export type StoreProductStatus = 'Out of stock' | 'Needs import' | 'Healthy';

export const IMPORT_INTERVAL_DAYS = 7;

export interface ProductSalesResult {
	stores: Store[];
	productReports: Map<string, DailyProductReport[]>;
	initialDemand: Record<string, number>;
	remainingDemand: Record<string, number>;
}

export interface WeeklyImportResult {
	stores: Store[];
	productReports: Map<string, DailyProductReport[]>;
	warehouse: WarehouseInventory;
	importSpend: number;
}

export function initializeStoreProducts(archetypeId: ArchetypeId): StoreProduct[] {
	const archetype = getArchetype(archetypeId);

	return archetype.startingCategories.map((category) => ({
		categoryId: category.id,
		stock: Math.max(1, roundStockDefault(category.demandWeight * 70)),
		reorderThreshold: Math.max(0, roundStockDefault(category.demandWeight * 25)),
		targetStock: Math.max(1, roundStockDefault(category.demandWeight * 90)),
		sellingPrice: category.defaultSellingPrice
	}));
}

export function updateStoreProduct(
	game: GameState,
	storeId: string,
	categoryId: string,
	patch: StoreProductPatch
): GameState {
	const storeIndex = game.stores.findIndex((store) => store.id === storeId);

	if (storeIndex === -1) {
		return game;
	}

	const store = game.stores[storeIndex]!;
	const productIndex = store.products.findIndex((product) => product.categoryId === categoryId);

	if (productIndex === -1) {
		return game;
	}

	const product = store.products[productIndex]!;
	const sellingPrice = Math.max(
		1,
		roundedFiniteOrFallback(patch.sellingPrice, product.sellingPrice)
	);
	const reorderThreshold = Math.max(
		0,
		roundedFiniteOrFallback(patch.reorderThreshold, product.reorderThreshold)
	);
	const targetStock = Math.max(
		reorderThreshold,
		roundedFiniteOrFallback(patch.targetStock, product.targetStock)
	);
	const products = store.products.map((candidate, index) =>
		index === productIndex
			? {
					...candidate,
					sellingPrice,
					reorderThreshold,
					targetStock
				}
			: candidate
	);
	const updatedStore = {
		...store,
		products,
		stockHealth: calculateStockHealth(products)
	};

	return {
		...game,
		stores: game.stores.map((candidate, index) => (index === storeIndex ? updatedStore : candidate))
	};
}

export function getStoreProductStatus(
	product: Pick<StoreProduct, 'stock' | 'reorderThreshold'>
): StoreProductStatus {
	if (product.stock <= 0) {
		return 'Out of stock';
	}

	if (product.stock < product.reorderThreshold) {
		return 'Needs import';
	}

	return 'Healthy';
}

export function calculateStockHealth(products: StoreProduct[]): number {
	if (products.length === 0) {
		return 100;
	}

	const averageRatio =
		products.reduce((total, product) => total + getStockTargetRatio(product), 0) / products.length;

	return clampScore(averageRatio * 100);
}

export function isImportDay(day: number): boolean {
	return day > 0 && day % IMPORT_INTERVAL_DAYS === 0;
}

export function getFinishedMaterialIdForCategory(categoryId: string): MaterialId | null {
	if (!isMaterialId(categoryId)) {
		return null;
	}

	return MATERIALS[categoryId].kind === 'finished' ? categoryId : null;
}

function isMaterialId(value: string): value is MaterialId {
	return Object.hasOwn(MATERIALS, value);
}

export function buildCityDemandPools(
	game: Pick<GameState, 'stores' | 'policy'>,
	city: City,
	policy: Pick<CompanyPolicy, 'marketing' | 'pricing'> = game.policy
): Record<string, number> {
	const buildableTiles = city.tiles.filter((tile) => getTilePlacementBlockReason(tile) === null);
	const cityDemand =
		buildableTiles.reduce(
			(sum, tile) => sum + tile.demand + tile.footTraffic * 0.6 + tile.customerFit * 0.35,
			0
		) / Math.max(1, buildableTiles.length);
	const categories = getCityStoreCategories(
		game.stores.filter((store) => store.cityId === city.id)
	);
	const marketingMultiplier = getMarketingDemandMultiplier(policy.marketing);
	const pricingMultiplier = getPricingDemandMultiplier(policy.pricing);

	return Object.fromEntries(
		categories.map((category) => [
			category.id,
			Math.max(
				0,
				Math.round(cityDemand * category.demandWeight * marketingMultiplier * pricingMultiplier)
			)
		])
	);
}

export function simulateProductSalesForCity(input: {
	game: GameState;
	city: City;
	rng: Rng;
	storeCapacity: Map<string, number>;
}): ProductSalesResult {
	const initialDemand = buildCityDemandPools(input.game, input.city, input.game.policy);
	const remainingDemand = { ...initialDemand };
	const productReports = new Map<string, DailyProductReport[]>();
	const capacityRemaining = new Map(input.storeCapacity);
	const cityStoreIds = new Set(
		input.game.stores.filter((store) => store.cityId === input.city.id).map((store) => store.id)
	);
	const storesById = new Map(
		input.game.stores.map((store) => [store.id, cloneStoreForStock(store)])
	);

	for (const categoryId of Object.keys(initialDemand).sort()) {
		const sellers = input.game.stores
			.filter(
				(store) =>
					cityStoreIds.has(store.id) &&
					store.products.some((product) => product.categoryId === categoryId)
			)
			.sort(
				(left, right) =>
					scoreStoreForCategory(right, categoryId) - scoreStoreForCategory(left, categoryId) ||
					left.id.localeCompare(right.id)
			);
		const totalScore = sellers.reduce(
			(sum, store) => sum + scoreStoreForCategory(store, categoryId),
			0
		);
		const category = findStoreCategory(sellers[0], categoryId);

		if (!category || totalScore <= 0) {
			continue;
		}

		for (const store of sellers) {
			const currentStore = storesById.get(store.id)!;
			const product = currentStore.products.find(
				(candidate) => candidate.categoryId === categoryId
			)!;
			const demandShare = scoreStoreForCategory(store, categoryId) / totalScore;
			const priceMultiplier = priceDemandMultiplier(category, product.sellingPrice);
			const desiredUnits = Math.max(
				0,
				Math.round(
					(initialDemand[categoryId] ?? 0) *
						demandShare *
						priceMultiplier *
						randomBetween(input.rng, 0.94, 1.06)
				)
			);
			const capacity = Math.max(0, Math.floor(capacityRemaining.get(store.id) ?? 0));
			const availableDemand = Math.max(0, remainingDemand[categoryId] ?? 0);
			const unitsSold = Math.min(desiredUnits, product.stock, capacity, availableDemand);
			const demandMissed = Math.max(0, desiredUnits - unitsSold);
			const endingStock = product.stock - unitsSold;
			const revenue = Math.round(unitsSold * product.sellingPrice);
			const costOfGoods = Math.round(unitsSold * category.importCost);

			product.stock = endingStock;
			capacityRemaining.set(store.id, capacity - unitsSold);
			remainingDemand[categoryId] = availableDemand - unitsSold;
			appendProductReport(productReports, store.id, {
				categoryId,
				name: category.name,
				unitsSold,
				demandMissed,
				revenue,
				costOfGoods,
				grossMargin: revenue - costOfGoods,
				endingStock,
				warehouseUnits: 0,
				warehouseValue: 0,
				importedUnits: 0,
				importCost: category.importCost,
				importSpend: 0
			});
		}
	}

	const stores = [...storesById.values()].map((store) => ({
		...store,
		stockHealth: calculateStockHealth(store.products)
	}));

	return { stores, productReports, initialDemand, remainingDemand };
}

export function applyWeeklyImports(input: {
	game: GameState;
	storeReports: Map<string, DailyProductReport[]>;
}): WeeklyImportResult {
	let importSpend = 0;
	let warehouse = input.game.warehouse;
	const productReports = cloneProductReports(input.storeReports);
	const stores = input.game.stores.map((store) => {
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

			const materialId = getFinishedMaterialIdForCategory(product.categoryId);
			const removal = materialId
				? removeWarehouseMaterial(warehouse, materialId, neededUnits)
				: null;
			const importedUnits = removal?.shortage ?? neededUnits;
			const spend = importedUnits * category.importCost;
			const warehouseUnits = removal?.quantityRemoved ?? 0;
			const warehouseValue =
				warehouseUnits * (materialId ? MATERIALS[materialId].localValue : category.importCost);
			warehouse = removal?.warehouse ?? warehouse;
			importSpend += spend;
			mergeImportReport(productReports, store.id, category, {
				endingStock: product.targetStock,
				warehouseUnits,
				warehouseValue,
				importedUnits,
				importSpend: spend
			});

			return { ...product, stock: product.targetStock };
		});

		return {
			...store,
			products,
			stockHealth: calculateStockHealth(products)
		};
	});

	return { stores, productReports, warehouse, importSpend };
}

function roundedFiniteOrFallback(value: number | undefined, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback;
	}

	return Math.round(value);
}

function roundStockDefault(value: number): number {
	return Math.round(value + 1e-9);
}

function getStockTargetRatio(product: StoreProduct): number {
	if (product.targetStock <= 0) {
		return 1;
	}

	return product.stock / product.targetStock;
}

function getMarketingDemandMultiplier(marketing: CompanyPolicy['marketing']): number {
	if (marketing === 'none') {
		return 0.92;
	}

	if (marketing === 'promotions') {
		return 1.16;
	}

	if (marketing === 'loyalty') {
		return 1.08;
	}

	return 1.06;
}

function getPricingDemandMultiplier(pricing: CompanyPolicy['pricing']): number {
	if (pricing === 'discount') {
		return 1.08;
	}

	if (pricing === 'premium') {
		return 0.93;
	}

	return 1;
}

function getCityStoreCategories(stores: Store[]): ProductCategory[] {
	const categories = new Map<string, ProductCategory>();

	for (const store of stores) {
		for (const category of getArchetype(store.archetypeId).startingCategories) {
			if (store.products.some((product) => product.categoryId === category.id)) {
				categories.set(category.id, category);
			}
		}
	}

	return [...categories.values()];
}

function cloneStoreForStock(store: Store): Store {
	return {
		...store,
		products: store.products.map((product) => ({ ...product }))
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

function findStoreCategory(
	store: Store | undefined,
	categoryId: string
): ProductCategory | undefined {
	return store
		? getArchetype(store.archetypeId).startingCategories.find(
				(category) => category.id === categoryId
			)
		: undefined;
}

function scoreStoreForCategory(store: Store, categoryId: string): number {
	if (!store.products.some((product) => product.categoryId === categoryId)) {
		return 0;
	}

	return Math.max(
		1,
		store.reputation * 0.55 + store.staffCapacity * 0.25 + (100 - store.competition) * 0.2
	);
}

function priceDemandMultiplier(category: ProductCategory, sellingPrice: number): number {
	const ratio = sellingPrice / Math.max(1, category.defaultSellingPrice);
	const penalty = (ratio - 1) * category.priceSensitivity;

	return Math.max(0.18, Math.min(1.35, 1 - penalty));
}

function appendProductReport(
	reports: Map<string, DailyProductReport[]>,
	storeId: string,
	report: DailyProductReport
): void {
	reports.set(storeId, [...(reports.get(storeId) ?? []), report]);
}

function mergeImportReport(
	reports: Map<string, DailyProductReport[]>,
	storeId: string,
	category: ProductCategory,
	refill: {
		endingStock: number;
		warehouseUnits: number;
		warehouseValue: number;
		importedUnits: number;
		importSpend: number;
	}
): void {
	const storeReports = reports.get(storeId) ?? [];
	const existingIndex = storeReports.findIndex((report) => report.categoryId === category.id);

	if (existingIndex >= 0) {
		storeReports[existingIndex] = {
			...storeReports[existingIndex]!,
			endingStock: refill.endingStock,
			warehouseUnits: refill.warehouseUnits,
			warehouseValue: refill.warehouseValue,
			importedUnits: refill.importedUnits,
			importSpend: refill.importSpend
		};
		reports.set(storeId, storeReports);
		return;
	}

	appendProductReport(reports, storeId, {
		categoryId: category.id,
		name: category.name,
		unitsSold: 0,
		demandMissed: 0,
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		endingStock: refill.endingStock,
		warehouseUnits: refill.warehouseUnits,
		warehouseValue: refill.warehouseValue,
		importedUnits: refill.importedUnits,
		importCost: category.importCost,
		importSpend: refill.importSpend
	});
}
