import type {
	ProductDefinition,
	ProductInventoryAgingResult,
	ProductMarketDynamics,
	ProductDynamics,
	ProductStockLot,
	StoreProduct
} from './types';

export function applyProductInventoryAging(input: {
	product: StoreProduct;
	definition: ProductDefinition;
	closingDay: number;
}): ProductInventoryAgingResult {
	const shelfLifeDays = input.definition.dynamics.shelfLifeDays;
	let wasteUnits = 0;
	const lots: ProductStockLot[] = [];

	for (const lot of input.product.lots) {
		const ageDays = Math.max(0, input.closingDay - lot.receivedDay);
		if (lot.quantity <= 0) {
			continue;
		}
		if (shelfLifeDays !== undefined && ageDays >= shelfLifeDays) {
			wasteUnits += lot.quantity;
			continue;
		}
		lots.push({ ...lot });
	}

	const availableUnits = lots.reduce((total, lot) => total + lot.quantity, 0);
	const shrinkRate = clampFraction(input.definition.dynamics.shrinkRate);
	const shrinkUnits = Math.min(availableUnits, Math.floor(availableUnits * shrinkRate));
	const remainingLots = removeOldestUnits(lots, shrinkUnits);
	const ageEvidence = deriveAgeEvidence(remainingLots, input.closingDay, shelfLifeDays);

	return {
		product: { ...input.product, lots: remainingLots },
		wasteUnits,
		wasteValue: wasteUnits * input.definition.importCost,
		shrinkUnits,
		shrinkValue: shrinkUnits * input.definition.importCost,
		...ageEvidence
	};
}

function clampFraction(value: number | undefined): number {
	if (value === undefined || !Number.isFinite(value)) {
		return 0;
	}
	return Math.max(0, Math.min(1, value));
}

function removeOldestUnits(lots: readonly ProductStockLot[], quantity: number): ProductStockLot[] {
	let remaining = quantity;
	const result: ProductStockLot[] = [];

	for (const lot of lots) {
		const removed = Math.min(lot.quantity, remaining);
		const nextQuantity = lot.quantity - removed;
		if (nextQuantity > 0) {
			result.push({ ...lot, quantity: nextQuantity });
		}
		remaining -= removed;
	}

	return result;
}

function deriveAgeEvidence(
	lots: readonly ProductStockLot[],
	closingDay: number,
	shelfLifeDays: number | undefined
): Pick<
	ProductInventoryAgingResult,
	'averageAgeDays' | 'freshnessPercent' | 'oldestSellableAgeDays'
> {
	if (lots.length === 0) {
		return {
			averageAgeDays: null,
			freshnessPercent: null,
			oldestSellableAgeDays: null
		};
	}

	let totalQuantity = 0;
	let weightedAge = 0;
	let oldestAge = 0;
	for (const lot of lots) {
		const ageDays = Math.max(0, closingDay - lot.receivedDay);
		totalQuantity += lot.quantity;
		weightedAge += ageDays * lot.quantity;
		oldestAge = Math.max(oldestAge, ageDays);
	}

	const averageAgeDays = weightedAge / totalQuantity;
	const freshnessPercent =
		shelfLifeDays !== undefined && shelfLifeDays > 0
			? Math.max(0, Math.min(100, Math.round((1 - averageAgeDays / shelfLifeDays) * 100)))
			: null;

	return { averageAgeDays, freshnessPercent, oldestSellableAgeDays: oldestAge };
}

export function getOldestSellableAgeDays(
	product: Pick<StoreProduct, 'lots'>,
	day: number,
	shelfLifeDays?: number
): number | null {
	let oldestAge: number | null = null;

	for (const lot of product.lots) {
		if (lot.quantity <= 0) {
			continue;
		}
		const ageDays = Math.max(0, day - lot.receivedDay);
		if (shelfLifeDays !== undefined && ageDays >= shelfLifeDays) {
			continue;
		}
		oldestAge = oldestAge === null ? ageDays : Math.max(oldestAge, ageDays);
	}

	return oldestAge;
}

export function resolveTrendMultiplier(
	trend: ProductDynamics['trend'] | undefined,
	day: number
): number {
	if (trend === undefined || !Number.isFinite(trend.periodDays) || trend.periodDays <= 0) {
		return 1;
	}

	const periodDays = trend.periodDays;
	const phaseDays = Number.isFinite(trend.phaseDays) ? trend.phaseDays : 0;
	const position = positiveModulo(day - phaseDays, periodDays) / periodDays;
	const wave =
		position < 0.25 ? position * 4 : position < 0.75 ? 2 - position * 4 : position * 4 - 4;
	const amplitude = Number.isFinite(trend.amplitude)
		? Math.max(0, Math.min(1, trend.amplitude))
		: 0;

	return Math.max(0, 1 + amplitude * wave);
}

export function resolveObsolescenceMultiplier(
	oldestSellableAgeDays: number | null,
	obsolescence: ProductDynamics['obsolescence'] | undefined
): number {
	if (oldestSellableAgeDays === null || obsolescence === undefined) {
		return 1;
	}

	const startsAfterDays = Math.max(0, obsolescence.startsAfterDays);
	if (oldestSellableAgeDays <= startsAfterDays) {
		return 1;
	}

	const demandFloor = clampFraction(obsolescence.demandFloor);
	const progress = Math.min(
		1,
		(oldestSellableAgeDays - startsAfterDays) / Math.max(1, startsAfterDays)
	);
	return demandFloor + (1 - demandFloor) * (1 - progress);
}

export function resolveMarkdownMultiplier(
	oldestSellableAgeDays: number | null,
	markdown: ProductDynamics['markdown'] | undefined
): number {
	if (oldestSellableAgeDays === null || markdown === undefined) {
		return 1;
	}
	if (oldestSellableAgeDays < markdown.startsAtAgeDays) {
		return 1;
	}
	return clampFraction(markdown.priceMultiplier);
}

export function resolveReputationScore(input: {
	storeReputation: number;
	reputationSensitivity?: number;
}): number {
	const reputation = Number.isFinite(input.storeReputation) ? input.storeReputation : 50;
	const sensitivity =
		input.reputationSensitivity === undefined || !Number.isFinite(input.reputationSensitivity)
			? 1
			: Math.max(0, input.reputationSensitivity);
	return Math.max(1, 27.5 + (reputation - 50) * 0.55 * sensitivity);
}

export function resolveProductMarketDynamics(input: {
	product: StoreProduct;
	definition: ProductDefinition;
	day: number;
}): ProductMarketDynamics {
	const oldestSellableAgeDays = getOldestSellableAgeDays(
		input.product,
		input.day,
		input.definition.dynamics.shelfLifeDays
	);

	return {
		trendMultiplier: resolveTrendMultiplier(input.definition.dynamics.trend, input.day),
		obsolescenceMultiplier: resolveObsolescenceMultiplier(
			oldestSellableAgeDays,
			input.definition.dynamics.obsolescence
		),
		markdownMultiplier: resolveMarkdownMultiplier(
			oldestSellableAgeDays,
			input.definition.dynamics.markdown
		)
	};
}

function positiveModulo(value: number, modulus: number): number {
	return ((value % modulus) + modulus) % modulus;
}
