import { getProductDefinition } from './products';
import {
	ALL_PRODUCT_FAMILIES,
	type BrandDefinition,
	type BrandId,
	type ProductDefinition,
	type ProductId,
	type Store
} from './types';

export type { BrandDefinition, BrandId } from './types';

export interface BrandEconomics {
	unitCost: number;
	demandMultiplier: number;
	marketAttractionMultiplier: number;
}

export const BRANDS: Readonly<Record<BrandId, BrandDefinition>> = {
	'common-ground': {
		id: 'common-ground',
		name: 'Common Ground',
		positioning: 'mainstream',
		supportedFamilyIds: ALL_PRODUCT_FAMILIES,
		quality: 50,
		loyaltyMultiplier: 1,
		availabilityMultiplier: 1,
		priceMultiplier: 1,
		demandMultiplier: 1,
		unitCostMultiplier: 1
	},
	'budget-bay': {
		id: 'budget-bay',
		name: 'Budget Bay',
		positioning: 'value',
		supportedFamilyIds: ['beverages', 'convenience-goods', 'grocery-food'],
		quality: 42,
		loyaltyMultiplier: 0.95,
		availabilityMultiplier: 1.08,
		priceMultiplier: 0.9,
		demandMultiplier: 1.1,
		unitCostMultiplier: 0.84
	},
	'northstar-select': {
		id: 'northstar-select',
		name: 'Northstar Select',
		positioning: 'premium',
		supportedFamilyIds: ['fashion', 'electronics'],
		quality: 82,
		loyaltyMultiplier: 1.12,
		availabilityMultiplier: 0.92,
		priceMultiplier: 1.18,
		demandMultiplier: 0.94,
		unitCostMultiplier: 1.1
	},
	'fresh-field': {
		id: 'fresh-field',
		name: 'Fresh Field',
		positioning: 'premium',
		supportedFamilyIds: ['grocery-food'],
		quality: 74,
		loyaltyMultiplier: 1.08,
		availabilityMultiplier: 0.98,
		priceMultiplier: 1.08,
		demandMultiplier: 1.06,
		unitCostMultiplier: 1.04
	}
};

export function getBrandDefinition(id: BrandId): BrandDefinition {
	return BRANDS[id];
}

export function getSupportedBrands(productId: ProductId): readonly BrandDefinition[] {
	const familyId = getProductDefinition(productId).familyId;
	return Object.values(BRANDS).filter((brand) => brand.supportedFamilyIds.includes(familyId));
}

export function isBrandSupported(productId: ProductId, brandId: BrandId): boolean {
	return BRANDS[brandId].supportedFamilyIds.includes(getProductDefinition(productId).familyId);
}

export function getBrandDefaultSellingPrice(product: ProductDefinition, brandId: BrandId): number {
	const brand = getBrandDefinition(brandId);
	return Math.max(1, Math.round(product.defaultSellingPrice * brand.priceMultiplier));
}

export function resolveBrandEconomics(
	product: ProductDefinition,
	brandId: BrandId
): BrandEconomics {
	const brand = getBrandDefinition(brandId);
	return {
		unitCost: product.importCost * brand.unitCostMultiplier,
		demandMultiplier: brand.demandMultiplier,
		marketAttractionMultiplier: brand.loyaltyMultiplier * brand.availabilityMultiplier
	};
}

/** Reputation + staff-capacity seller score before brand attraction is applied. */
export function baseSellerScore(
	reputation: number,
	staffCapacity: number,
	reputationSensitivity: number | undefined
): number {
	const safeReputation = Number.isFinite(reputation) ? reputation : 50;
	const safeStaffCapacity = Number.isFinite(staffCapacity) ? staffCapacity : 0;
	const sensitivity =
		reputationSensitivity === undefined || !Number.isFinite(reputationSensitivity)
			? 1
			: Math.max(0, reputationSensitivity);
	const reputationTerm = 50 * 0.55 + (safeReputation - 50) * 0.55 * sensitivity;
	return Math.max(1, reputationTerm + safeStaffCapacity * 0.25);
}

export function brandedSellerScore(store: Store, productId: ProductId): number {
	const storeProduct = store.products.find((product) => product.productId === productId);
	if (!storeProduct) return 0;

	const product = getProductDefinition(productId);
	const existingScore = baseSellerScore(
		store.reputation,
		store.staffCapacity,
		product.dynamics.reputationSensitivity
	);

	return (
		existingScore * resolveBrandEconomics(product, storeProduct.brandId).marketAttractionMultiplier
	);
}
