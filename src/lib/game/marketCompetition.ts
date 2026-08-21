import { getArchetype } from './archetypes';
import { BRANDS } from './brands';
import { isModifierActiveOnDay } from './eventModifiers';
import type { ActiveEventModifier, MarketCompetitor, ProductDefinition } from './types';

export interface MarketShareCompetitor {
	competitorId: string;
	share: number;
	attractionScore: number;
	eventMultiplier: number;
}

export interface MarketShareResolution {
	playerShare: number;
	playerAttractionScore: number;
	rivalAttractionScore: number;
	competitors: MarketShareCompetitor[];
}

const POSTURE_BASE = {
	discount: 1.12,
	competitive: 1.06,
	standard: 1,
	premium: 0.9
} as const;

export function resolveProductMarketShare(
	cityCompetitors: readonly MarketCompetitor[],
	modifiers: readonly ActiveEventModifier[],
	product: ProductDefinition,
	playerAttractionScore: number,
	day: number
): MarketShareResolution {
	const eligibleCompetitors = cityCompetitors
		.filter((competitor) => competitor.status === 'active')
		.sort((left, right) => compareIds(left.id, right.id));
	const rows = eligibleCompetitors.flatMap((competitor) => {
		const archetype = getArchetype(competitor.archetypeId);
		if (!archetype.startingProductIds.includes(product.id)) return [];

		const compatibleBrands = competitor.brandIds
			.map((brandId) => BRANDS[brandId])
			.filter(
				(brand) => brand !== undefined && brand.supportedFamilyIds.includes(product.familyId)
			);
		if (compatibleBrands.length === 0) return [];

		const focusMultiplier = competitor.productFocus.includes(product.familyId) ? 1.2 : 0.85;
		const postureBase = POSTURE_BASE[competitor.pricePosture];
		const priceMultiplier = clamp(0.5, 1.5, 1 + (postureBase - 1) * product.priceSensitivity);
		const brandMultiplier =
			compatibleBrands.reduce(
				(total, brand) => total + brand.loyaltyMultiplier * brand.availabilityMultiplier,
				0
			) / compatibleBrands.length;
		const eventMultiplier = resolveCompetitorEventMultiplier(competitor.id, modifiers, day);
		const baseAttraction = 25 + competitor.reputation * 0.5;
		const attractionScore =
			baseAttraction * focusMultiplier * priceMultiplier * brandMultiplier * eventMultiplier;

		return [
			{
				competitorId: competitor.id,
				share: 0,
				attractionScore,
				eventMultiplier
			}
		];
	});

	const normalizedPlayerAttraction = Math.max(
		0,
		Number.isFinite(playerAttractionScore) ? playerAttractionScore : 0
	);
	const rivalAttractionScore = rows.reduce((total, row) => total + row.attractionScore, 0);
	const totalAttractionScore = normalizedPlayerAttraction + rivalAttractionScore;
	const playerShare =
		totalAttractionScore > 0 ? normalizedPlayerAttraction / totalAttractionScore : 0;
	const competitors = rows.map((row) => ({
		...row,
		share: totalAttractionScore > 0 ? row.attractionScore / totalAttractionScore : 0
	}));

	return {
		playerShare,
		playerAttractionScore: normalizedPlayerAttraction,
		rivalAttractionScore,
		competitors
	};
}

function resolveCompetitorEventMultiplier(
	competitorId: string,
	modifiers: readonly ActiveEventModifier[],
	day: number
): number {
	return modifiers.reduce((multiplier, modifier) => {
		if (!isModifierActiveOnDay(modifier, day)) return multiplier;
		if (
			modifier.target.kind !== 'competitor' ||
			modifier.target.competitorId !== competitorId ||
			modifier.effect.kind !== 'competitor-attraction-multiplier' ||
			!Number.isFinite(modifier.effect.multiplier) ||
			modifier.effect.multiplier <= 0
		) {
			return multiplier;
		}
		return multiplier * modifier.effect.multiplier;
	}, 1);
}

function clamp(min: number, max: number, value: number): number {
	return Math.max(min, Math.min(max, value));
}

function compareIds(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}
