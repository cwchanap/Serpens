import { getArchetype } from './archetypes';
import { getTilePlacementBlockReason } from './city';
import { getStoreRevenueMultiplier, getUnlockedProductCount } from './leveling';
import {
	applyProductInventoryAging,
	resolveProductMarketDynamics,
	resolveTrendMultiplier
} from './productDynamics';
import { getProductDefinition, PRODUCTS } from './products';
import { clampScore } from './reports';
import { randomBetween, type Rng } from './rng';
import { getRetailCityDemandMultiplier } from './world';
import type {
	ArchetypeId,
	City,
	CompanyPolicy,
	DailyProductReport,
	GameState,
	ProductDefinition,
	ProductId,
	ProductInventoryAgingResult,
	ProductStockLot,
	RetailDemandProfile,
	Store,
	StoreProduct,
	StoreProductPatch
} from './types';

export type StoreProductStatus = 'Out of stock' | 'Needs import' | 'Healthy';
export type EffectivePolicyByStoreId = ReadonlyMap<string, CompanyPolicy>;

export interface ProductSalesResult {
	stores: Store[];
	productReports: Map<string, DailyProductReport[]>;
	/** Sales-effective city demand after applying each product's trend once. */
	initialDemand: RetailDemandProfile;
	remainingDemand: RetailDemandProfile;
	/** Derived aging evidence carried into the daily report composition. */
	productAging: Map<string, Map<ProductId, ProductInventoryAgingResult>>;
}

export function createStoreProduct(productId: ProductId, receivedDay = 1): StoreProduct {
	const product = getProductDefinition(productId);
	return {
		productId,
		lots: [
			{
				receivedDay,
				quantity: Math.max(1, roundStockDefault(product.demandWeight * 70))
			}
		],
		reorderThreshold: Math.max(0, roundStockDefault(product.demandWeight * 25)),
		targetStock: Math.max(1, roundStockDefault(product.demandWeight * 90)),
		sellingPrice: product.defaultSellingPrice
	};
}

export function initializeStoreProducts(
	archetypeId: ArchetypeId,
	level = 1,
	receivedDay = 1
): StoreProduct[] {
	const archetype = getArchetype(archetypeId);
	const unlockedCount = getUnlockedProductCount(level);

	return archetype.startingProductIds
		.slice(0, unlockedCount)
		.map((productId) => createStoreProduct(productId, receivedDay));
}

export function updateStoreProduct(
	game: GameState,
	storeId: string,
	productId: ProductId,
	patch: StoreProductPatch
): GameState {
	const storeIndex = game.stores.findIndex((store) => store.id === storeId);

	if (storeIndex === -1) {
		return game;
	}

	const store = game.stores[storeIndex]!;
	const productIndex = store.products.findIndex((product) => product.productId === productId);

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
		finiteOrFallback(patch.reorderThreshold, product.reorderThreshold)
	);
	const requestedTargetStock = lotCompatibleOrFallback(patch.targetStock, product.targetStock);
	const targetStock = Math.max(Math.ceil(reorderThreshold), requestedTargetStock);
	if (!isLotCompatibleQuantity(targetStock)) {
		return game;
	}
	const products = store.products.map((candidate, index) =>
		index === productIndex
			? {
					...candidate,
					lots: candidate.lots.map((lot) => ({ ...lot })),
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
	product: Pick<StoreProduct, 'lots' | 'reorderThreshold'>
): StoreProductStatus {
	const stock = getStoreProductStock(product);
	if (stock <= 0) {
		return 'Out of stock';
	}

	if (stock < product.reorderThreshold) {
		return 'Needs import';
	}

	return 'Healthy';
}

/**
 * Human-readable summary of a store's stock trouble, e.g.
 * "1 product out of stock, 2 products need import", or null when everything is
 * healthy. Out-of-stock and needs-import products are counted separately so the
 * message never overstates how many are actually at zero stock.
 */
export function summarizeStockTrouble(
	products: Pick<StoreProduct, 'lots' | 'reorderThreshold'>[]
): string | null {
	let outOfStock = 0;
	let needImport = 0;

	for (const product of products) {
		const status = getStoreProductStatus(product);
		if (status === 'Out of stock') {
			outOfStock += 1;
		} else if (status === 'Needs import') {
			needImport += 1;
		}
	}

	const parts: string[] = [];
	if (outOfStock > 0) {
		parts.push(`${outOfStock} ${outOfStock === 1 ? 'product' : 'products'} out of stock`);
	}
	if (needImport > 0) {
		parts.push(`${needImport} ${needImport === 1 ? 'product needs' : 'products need'} import`);
	}

	return parts.length > 0 ? parts.join(', ') : null;
}

export function calculateStockHealth(products: StoreProduct[]): number {
	if (products.length === 0) {
		return 100;
	}

	const averageRatio =
		products.reduce((total, product) => total + getStockTargetRatio(product), 0) / products.length;

	return clampScore(averageRatio * 100);
}

export function getStoreProductStock(product: Pick<StoreProduct, 'lots'>): number {
	return product.lots.reduce((total, lot) => total + lot.quantity, 0);
}

export function consumeStoreProductStock(product: StoreProduct, quantity: number): StoreProduct {
	let remaining = Math.max(0, quantity);
	const lots: ProductStockLot[] = [];

	for (const lot of product.lots) {
		if (remaining <= 0) {
			lots.push({ ...lot });
			continue;
		}

		const consumed = Math.min(lot.quantity, remaining);
		const nextQuantity = lot.quantity - consumed;
		remaining -= consumed;
		if (nextQuantity > 0) {
			lots.push({ ...lot, quantity: nextQuantity });
		}
	}

	return { ...product, lots };
}

export function addStoreProductStockLot(product: StoreProduct, lot: ProductStockLot): StoreProduct {
	const lots = product.lots.map((existingLot) => ({ ...existingLot }));
	const currentStock = getStoreProductStock(product);
	const headroom = Math.max(0, Number.MAX_SAFE_INTEGER - currentStock);
	const safeQuantity = Math.min(lot.quantity, headroom);
	if (safeQuantity <= 0) {
		return { ...product, lots };
	}
	const lastLot = lots.at(-1);
	if (lastLot && lastLot.receivedDay === lot.receivedDay) {
		lastLot.quantity += safeQuantity;
	} else {
		lots.push({ ...lot, quantity: safeQuantity });
	}
	return { ...product, lots };
}

export function buildCityDemandPools(
	game: Pick<GameState, 'stores' | 'world'>,
	city: City
): RetailDemandProfile {
	const buildableTiles = city.tiles.filter((tile) => getTilePlacementBlockReason(tile) === null);
	const cityDemand =
		buildableTiles.reduce(
			(sum, tile) => sum + tile.demand + tile.footTraffic * 0.6 + tile.customerFit * 0.35,
			0
		) / Math.max(1, buildableTiles.length);
	const products = getCityStoreProducts(game.stores.filter((store) => store.cityId === city.id));

	return Object.fromEntries(
		products.map((product) => {
			const cityMultiplier = getRetailCityDemandMultiplier(game, city.id, product.id);
			return [
				product.id,
				Math.max(0, Math.round(cityDemand * product.demandWeight * cityMultiplier))
			];
		})
	);
}

export function getPolicyAdjustedCityProductDemand(
	game: GameState,
	city: City,
	productId: ProductId,
	effectivePolicyByStoreId: EffectivePolicyByStoreId
): number {
	const rawPool = buildCityDemandPools(game, city)[productId] ?? 0;
	const sellers = getEligibleProductSellers(game, city.id, productId);
	const totalScore = sellers.reduce(
		(sum, store) => sum + scoreStoreForCategory(store, productId),
		0
	);
	if (totalScore <= 0) return 0;

	return sellers.reduce((sum, store) => {
		const share = scoreStoreForCategory(store, productId) / totalScore;
		const policy = effectivePolicyByStoreId.get(store.id)!;
		return sum + sellerPolicyDemand(rawPool, share, policy);
	}, 0);
}

export function simulateProductSalesForCity(input: {
	game: GameState;
	city: City;
	rng: Rng;
	storeCapacity: Map<string, number>;
	effectivePolicyByStoreId?: EffectivePolicyByStoreId;
}): ProductSalesResult {
	const effectivePolicyByStoreId =
		input.effectivePolicyByStoreId ??
		new Map(input.game.stores.map((store) => [store.id, input.game.policy]));
	const baselineDemand = buildCityDemandPools(input.game, input.city);
	const initialDemand: RetailDemandProfile = {};
	for (const [productId, demand] of Object.entries(baselineDemand)) {
		if (!isProductId(productId)) {
			continue;
		}

		const definition = getProductDefinition(productId);
		const trendMultiplier = resolveTrendMultiplier(definition.dynamics.trend, input.game.day);
		initialDemand[productId] = Math.max(0, Math.round((demand ?? 0) * trendMultiplier));
	}
	const totalUnitsSoldByProduct = new Map<ProductId, number>();
	const productReports = new Map<string, DailyProductReport[]>();
	const capacityRemaining = new Map(input.storeCapacity);
	const cityStoreIds = new Set(
		input.game.stores.filter((store) => store.cityId === input.city.id).map((store) => store.id)
	);
	const storesById = new Map(
		input.game.stores.map((store) => [store.id, cloneStoreForStock(store)])
	);
	const productAging = new Map<string, Map<ProductId, ProductInventoryAgingResult>>();

	for (const storeId of cityStoreIds) {
		const store = storesById.get(storeId)!;
		const agingByProduct = new Map<ProductId, ProductInventoryAgingResult>();
		const products = store.products.map((product) => {
			const definition = getProductDefinition(product.productId);
			if (!definition) {
				return product;
			}

			const aging = applyProductInventoryAging({
				product,
				definition,
				closingDay: input.game.day
			});
			agingByProduct.set(product.productId, aging);
			return aging.product;
		});
		store.products = products;
		productAging.set(storeId, agingByProduct);
	}

	for (const productId of Object.keys(initialDemand).filter(isProductId).sort()) {
		const productDefinition = getProductDefinition(productId);

		if (!productDefinition) {
			continue;
		}

		const sellers = getEligibleProductSellers(input.game, input.city.id, productId);
		const totalScore = sellers.reduce(
			(sum, store) => sum + scoreStoreForCategory(store, productId),
			0
		);

		if (totalScore <= 0) {
			continue;
		}

		for (const store of sellers) {
			const currentStore = storesById.get(store.id)!;
			const product = currentStore.products.find((candidate) => candidate.productId === productId)!;
			const demandShare = scoreStoreForCategory(store, productId) / totalScore;
			const policyDemand = sellerPolicyDemand(
				initialDemand[productId] ?? 0,
				demandShare,
				effectivePolicyByStoreId.get(store.id)!
			);
			const marketDynamics = resolveProductMarketDynamics({
				product,
				definition: productDefinition,
				day: input.game.day
			});
			const priceMultiplier = priceDemandMultiplier(productDefinition, product.sellingPrice);
			const desiredUnits = Math.max(
				0,
				Math.round(
					policyDemand *
						marketDynamics.obsolescenceMultiplier *
						priceMultiplier *
						randomBetween(input.rng, 0.94, 1.06)
				)
			);
			const capacity = Math.max(0, Math.floor(capacityRemaining.get(store.id) ?? 0));
			const sellableDemand = Math.min(desiredUnits, capacity);
			const stock = getStoreProductStock(product);
			const stockoutLostDemand = Math.max(0, sellableDemand - stock);
			const unitsSold = Math.min(sellableDemand, stock);
			const demandMissed = Math.max(0, desiredUnits - unitsSold);
			const soldProduct = consumeStoreProductStock(product, unitsSold);
			const endingStock = getStoreProductStock(soldProduct);
			const revenueMultiplier = getStoreRevenueMultiplier(store.level);
			const baseRevenue = Math.round(unitsSold * product.sellingPrice * revenueMultiplier);
			const effectiveSellingPrice = product.sellingPrice * marketDynamics.markdownMultiplier;
			const revenue = Math.round(unitsSold * effectiveSellingPrice * revenueMultiplier);
			const costOfGoods = Math.round(unitsSold * productDefinition.importCost);
			const aging = productAging.get(store.id)?.get(productId);

			currentStore.products = currentStore.products.map((candidate) =>
				candidate.productId === productId ? soldProduct : candidate
			);
			capacityRemaining.set(store.id, capacity - unitsSold);
			totalUnitsSoldByProduct.set(
				productId,
				(totalUnitsSoldByProduct.get(productId) ?? 0) + unitsSold
			);
			appendProductReport(productReports, store.id, {
				productId,
				name: productDefinition.name,
				unitsSold,
				demandMissed,
				stockoutLostDemand,
				revenue,
				costOfGoods,
				grossMargin: revenue - costOfGoods,
				endingStock,
				warehouseUnits: 0,
				warehouseValue: 0,
				importedUnits: 0,
				importCost: productDefinition.importCost,
				importSpend: 0,
				wasteUnits: aging?.wasteUnits ?? 0,
				wasteValue: aging?.wasteValue ?? 0,
				shrinkUnits: aging?.shrinkUnits ?? 0,
				shrinkValue: aging?.shrinkValue ?? 0,
				averageAgeDays: aging?.averageAgeDays ?? null,
				oldestSellableAgeDays: aging?.oldestSellableAgeDays ?? null,
				trendMultiplier: marketDynamics.trendMultiplier,
				obsolescenceMultiplier: marketDynamics.obsolescenceMultiplier,
				baseSellingPrice: product.sellingPrice,
				effectiveSellingPrice,
				markdownAmount: Math.max(0, baseRevenue - revenue)
			});
		}
	}

	const stores = [...storesById.values()].map((store) => ({
		...store,
		stockHealth: calculateStockHealth(store.products)
	}));
	const remainingDemand: RetailDemandProfile = Object.fromEntries(
		Object.entries(initialDemand).map(([productId, demand]) => [
			productId,
			Math.max(0, demand - (totalUnitsSoldByProduct.get(productId as ProductId) ?? 0))
		])
	);

	return { stores, productReports, initialDemand, remainingDemand, productAging };
}

function roundedFiniteOrFallback(value: number | undefined, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback;
	}

	return Math.round(value);
}

function finiteOrFallback(value: number | undefined, fallback: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return fallback;
	}

	return value;
}

function lotCompatibleOrFallback(value: number | undefined, fallback: number): number {
	if (!isLotCompatibleQuantity(value)) {
		return fallback;
	}

	return value;
}

function isLotCompatibleQuantity(value: number | undefined): value is number {
	return (
		typeof value === 'number' &&
		Number.isSafeInteger(value) &&
		value >= 0 &&
		value < Number.MAX_SAFE_INTEGER
	);
}

function roundStockDefault(value: number): number {
	return Math.round(value + 1e-9);
}

function getStockTargetRatio(product: StoreProduct): number {
	if (product.targetStock <= 0) {
		return 1;
	}

	return getStoreProductStock(product) / product.targetStock;
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

export function getPolicyDemandMultiplier(
	policy: Pick<CompanyPolicy, 'marketing' | 'pricing'>
): number {
	return (
		getMarketingDemandMultiplier(policy.marketing) * getPricingDemandMultiplier(policy.pricing)
	);
}

export function sellerPolicyDemand(
	rawPool: number,
	share: number,
	policy: Pick<CompanyPolicy, 'marketing' | 'pricing'>
): number {
	return rawPool * share * getPolicyDemandMultiplier(policy);
}

function getCityStoreProducts(stores: Store[]): ProductDefinition[] {
	const products = new Map<ProductId, ProductDefinition>();

	for (const store of stores) {
		const startingProductIds = getArchetype(store.archetypeId).startingProductIds;
		for (const product of store.products) {
			if (!startingProductIds.includes(product.productId)) continue;
			const definition = getProductDefinition(product.productId);
			if (definition) {
				products.set(product.productId, definition);
			}
		}
	}

	return [...products.values()];
}

function cloneStoreForStock(store: Store): Store {
	return {
		...store,
		products: store.products.map((product) => ({
			...product,
			lots: product.lots.map((lot) => ({ ...lot }))
		}))
	};
}

function getEligibleProductSellers(game: GameState, cityId: string, productId: ProductId): Store[] {
	return game.stores
		.filter(
			(store) =>
				store.cityId === cityId &&
				getArchetype(store.archetypeId).startingProductIds.includes(productId) &&
				store.products.some((product) => product.productId === productId)
		)
		.sort(
			(left, right) =>
				scoreStoreForCategory(right, productId) - scoreStoreForCategory(left, productId) ||
				compareCodeUnitStrings(left.id, right.id)
		);
}

function scoreStoreForCategory(store: Store, productId: ProductId): number {
	if (!store.products.some((product) => product.productId === productId)) {
		return 0;
	}

	const reputation = Number.isFinite(store.reputation) ? store.reputation : 50;
	const authoredSensitivity = getProductDefinition(productId).dynamics.reputationSensitivity;
	const reputationSensitivity =
		authoredSensitivity === undefined || !Number.isFinite(authoredSensitivity)
			? 1
			: Math.max(0, authoredSensitivity);
	const reputationTerm = 50 * 0.55 + (reputation - 50) * 0.55 * reputationSensitivity;

	return Math.max(1, reputationTerm + store.staffCapacity * 0.25 + (100 - store.competition) * 0.2);
}

function compareCodeUnitStrings(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function priceDemandMultiplier(product: ProductDefinition, sellingPrice: number): number {
	const ratio = sellingPrice / Math.max(1, product.defaultSellingPrice);
	const penalty = (ratio - 1) * product.priceSensitivity;

	return Math.max(0.18, Math.min(1.35, 1 - penalty));
}

function appendProductReport(
	reports: Map<string, DailyProductReport[]>,
	storeId: string,
	report: DailyProductReport
): void {
	reports.set(storeId, [...(reports.get(storeId) ?? []), report]);
}

function isProductId(value: string): value is ProductId {
	return Object.hasOwn(PRODUCTS, value);
}
