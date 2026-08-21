import { getProductDefinition } from './products';
import type {
	BrandDefinition,
	BrandId,
	ProductDefinition,
	ProductFamilyId,
	ProductId
} from './types';

export type { BrandDefinition, BrandId } from './types';

const ALL_PRODUCT_FAMILIES: readonly ProductFamilyId[] = [
	'beverages',
	'convenience-goods',
	'fashion',
	'electronics',
	'grocery-food'
];

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
	const brand = BRANDS[brandId];
	if (!brand) return false;
	const product = getProductDefinition(productId);
	if (!product) return false;

	return brand.supportedFamilyIds.includes(product.familyId);
}

export function getBrandDefaultSellingPrice(product: ProductDefinition, brandId: BrandId): number {
	const brand = getBrandDefinition(brandId);
	return Math.max(1, Math.round(product.defaultSellingPrice * brand.priceMultiplier));
}
