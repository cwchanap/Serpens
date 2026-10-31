import type { TranslationKey } from '$lib/i18n/translate';
import { evaluateCondition } from '$lib/scenarios/metrics';
import type { ObjectiveEvidence, ScenarioCondition } from '$lib/scenarios/types';
import {
	PROGRESSION_TIER_REWARD,
	type DecisionItem,
	type GameState,
	type ProgressionTierId,
	type ProgressionTierReward
} from './types';
import { PRODUCTS } from './products';
import { decisionContextProgressionTierClaimed } from './decisionContext';

/**
 * Authored five-step progression ladder (design §2). Pure catalog plus two
 * entry points: `evaluateProgression` (read-only view) and `claimEarnedTiers`
 * (append-only receipt transition). No background timers or achievement
 * framework — just monotone metric goals and one commit per call.
 */

export interface ProgressionTier {
	id: ProgressionTierId;
	titleKey: TranslationKey;
	descriptionKey: TranslationKey;
	/** Monotone claim goals evaluated with the shared scenario condition evaluator. */
	goals: readonly ScenarioCondition[];
	reward: ProgressionTierReward;
}

/**
 * Tier-3 local-delivery product set: every industry-linked product (a
 * productionMaterialId exists), derived from the catalog rather than a
 * hand-maintained list, so any archetype that stocks at least one of them can
 * legally satisfy the 25-unit goal. The original tier-1-onboarding trio
 * counted only `bottled-water` for convenience and `produce`/`pantry` for
 * grocery — boutique and electronics stocked no countable product at all
 * (step-4 calibration finding). Electronics still stocks none and stays
 * structurally blocked.
 */
const REGIONAL_SUPPLIER_PRODUCT_IDS = Object.values(PRODUCTS)
	.filter((product) => product.productionMaterialId !== null)
	.map((product) => product.id);

const CURRENT_WINDOW = { kind: 'current' } as const;
const RUN_TO_DATE_WINDOW = { kind: 'run-to-date' } as const;

export const PROGRESSION_TIERS: readonly ProgressionTier[] = [
	{
		id: 'local-shop',
		titleKey: 'progression.tiers.local-shop.title',
		descriptionKey: 'progression.tiers.local-shop.description',
		goals: [
			{
				id: 'local-shop-store-count',
				labelKey: 'progression.goals.localShopStoreCount',
				query: { metric: 'store-count' },
				comparator: 'gte',
				target: 2,
				window: CURRENT_WINDOW
			},
			{
				id: 'local-shop-peak-book-value',
				labelKey: 'progression.goals.localShopPeakBookValue',
				query: { metric: 'peak-company-book-value' },
				comparator: 'gte',
				target: 70_000,
				window: RUN_TO_DATE_WINDOW,
				requiresCompleteWindow: true
			}
		],
		reward: PROGRESSION_TIER_REWARD
	},
	{
		id: 'neighborhood-chain',
		titleKey: 'progression.tiers.neighborhood-chain.title',
		descriptionKey: 'progression.tiers.neighborhood-chain.description',
		goals: [
			{
				id: 'neighborhood-chain-store-count',
				labelKey: 'progression.goals.neighborhoodChainStoreCount',
				query: { metric: 'store-count' },
				comparator: 'gte',
				target: 3,
				window: CURRENT_WINDOW
			},
			{
				id: 'neighborhood-chain-max-store-level',
				labelKey: 'progression.goals.neighborhoodChainMaxStoreLevel',
				query: { metric: 'max-store-level' },
				comparator: 'gte',
				target: 2,
				window: CURRENT_WINDOW
			},
			{
				id: 'neighborhood-chain-opened-cities',
				labelKey: 'progression.goals.neighborhoodChainOpenedCities',
				query: { metric: 'opened-city-count' },
				comparator: 'gte',
				target: 3,
				window: CURRENT_WINDOW
			}
		],
		reward: PROGRESSION_TIER_REWARD
	},
	{
		id: 'regional-supplier',
		titleKey: 'progression.tiers.regional-supplier.title',
		descriptionKey: 'progression.tiers.regional-supplier.description',
		goals: [
			{
				id: 'regional-supplier-opened-cities',
				labelKey: 'progression.goals.regionalSupplierOpenedCities',
				query: { metric: 'opened-city-count' },
				comparator: 'gte',
				target: 4,
				window: CURRENT_WINDOW
			},
			{
				id: 'regional-supplier-local-units',
				labelKey: 'progression.goals.regionalSupplierLocalUnits',
				query: { metric: 'retail-local-units', productIds: [...REGIONAL_SUPPLIER_PRODUCT_IDS] },
				comparator: 'gte',
				target: 25,
				window: RUN_TO_DATE_WINDOW,
				requiresCompleteWindow: true
			}
			// No peak-book-value goal here by design: claims form a contiguous
			// prefix behind tier 1, whose ≥$70k peak always precedes this tier,
			// so any tier-3 peak target below $70k could never block a claim.
		],
		reward: PROGRESSION_TIER_REWARD
	},
	{
		id: 'multi-city-operator',
		titleKey: 'progression.tiers.multi-city-operator.title',
		descriptionKey: 'progression.tiers.multi-city-operator.description',
		goals: [
			{
				id: 'multi-city-operator-store-count',
				labelKey: 'progression.goals.multiCityOperatorStoreCount',
				query: { metric: 'store-count' },
				comparator: 'gte',
				target: 5,
				window: CURRENT_WINDOW
			},
			{
				id: 'multi-city-operator-opened-cities',
				labelKey: 'progression.goals.multiCityOperatorOpenedCities',
				query: { metric: 'opened-city-count' },
				comparator: 'gte',
				target: 5,
				window: CURRENT_WINDOW
			},
			{
				id: 'multi-city-operator-max-store-level',
				labelKey: 'progression.goals.multiCityOperatorMaxStoreLevel',
				query: { metric: 'max-store-level' },
				comparator: 'gte',
				target: 4,
				window: CURRENT_WINDOW
			}
		],
		reward: PROGRESSION_TIER_REWARD
	},
	{
		id: 'market-leader',
		titleKey: 'progression.tiers.market-leader.title',
		descriptionKey: 'progression.tiers.market-leader.description',
		goals: [
			{
				id: 'market-leader-store-count',
				labelKey: 'progression.goals.marketLeaderStoreCount',
				query: { metric: 'store-count' },
				comparator: 'gte',
				target: 7,
				window: CURRENT_WINDOW
			},
			{
				id: 'market-leader-opened-cities',
				labelKey: 'progression.goals.marketLeaderOpenedCities',
				query: { metric: 'opened-city-count' },
				comparator: 'gte',
				target: 6,
				window: CURRENT_WINDOW
			},
			{
				id: 'market-leader-peak-book-value',
				labelKey: 'progression.goals.marketLeaderPeakBookValue',
				query: { metric: 'peak-company-book-value' },
				comparator: 'gte',
				target: 150_000,
				window: RUN_TO_DATE_WINDOW,
				requiresCompleteWindow: true
			}
		],
		reward: PROGRESSION_TIER_REWARD
	}
];

export interface ProgressionGoalEvaluation {
	goal: ScenarioCondition;
	evidence: ObjectiveEvidence;
	passes: boolean;
}

export interface ProgressionTierEvaluation {
	tier: ProgressionTier;
	claimed: boolean;
	claimedOnDay: number | null;
	allGoalsPass: boolean;
	goals: readonly ProgressionGoalEvaluation[];
}

export interface ProgressionEvaluation {
	tiers: readonly ProgressionTierEvaluation[];
	/** First unclaimed tier in ladder order; null once the ladder is complete. */
	currentTier: ProgressionTierEvaluation | null;
	claimedCount: number;
	/** Store slots unlocked by progression receipts (one per claim). */
	storeCapacityUnlockedByClaims: number;
	allTiersClaimed: boolean;
}

/** Pure read-only view of the ladder against the current game state. */
export function evaluateProgression(game: GameState): ProgressionEvaluation {
	const claimsByTierId = new Map(
		game.progression.claims.map((claim) => [claim.tierId, claim.claimedOnDay])
	);
	const tiers = PROGRESSION_TIERS.map<ProgressionTierEvaluation>((tier) => {
		const claimedOnDay = claimsByTierId.get(tier.id);
		const goals = tier.goals.map<ProgressionGoalEvaluation>((goal) => {
			const { evidence, passes } = evaluateCondition(goal, game);
			return { goal, evidence, passes };
		});
		return {
			tier,
			claimed: claimedOnDay !== undefined,
			claimedOnDay: claimedOnDay ?? null,
			allGoalsPass: goals.every((goal) => goal.passes),
			goals
		};
	});
	const claimedCount = tiers.filter((tier) => tier.claimed).length;
	return {
		tiers,
		currentTier: tiers.find((tier) => !tier.claimed) ?? null,
		claimedCount,
		storeCapacityUnlockedByClaims: tiers
			.filter((tier) => tier.claimed)
			.reduce((unlocked, tier) => unlocked + tier.tier.reward.storeCapacityBonus, 0),
		allTiersClaimed: claimedCount === PROGRESSION_TIERS.length
	};
}

function tierGoalsPass(tier: ProgressionTier, game: GameState): boolean {
	return tier.goals.every((goal) => evaluateCondition(goal, game).passes);
}

function tierClaimedNotice(tierId: ProgressionTierId, day: number): DecisionItem {
	const notice: Extract<DecisionItem, { kind: 'system' }> = {
		kind: 'system',
		id: `progression-tier-claimed-${tierId}`,
		title: 'Milestone reached',
		context: decisionContextProgressionTierClaimed(tierId),
		expiresOnDay: day + 1,
		options: [
			{ id: 'acknowledge', label: 'Acknowledge', description: 'Return to operations planning.' }
		]
	};
	return notice;
}

/**
 * Append receipts for every newly eligible tier in ladder order, stopping at
 * the first tier whose goals fail so only the contiguous prefix claims. Each
 * new claim adds its tier's `reward.storeCapacityBonus` to the existing
 * persisted storeCap and issues a one-time system notice. Idempotent: with
 * nothing newly eligible the original game reference is returned untouched.
 */
export function claimEarnedTiers(game: GameState): GameState {
	const claimedTierIds = new Set(game.progression.claims.map((claim) => claim.tierId));
	const newClaims: GameState['progression']['claims'] = [];
	const newNotices: DecisionItem[] = [];
	let storeCapacityDelta = 0;

	for (const tier of PROGRESSION_TIERS) {
		if (claimedTierIds.has(tier.id)) continue;
		if (!tierGoalsPass(tier, game)) break;
		newClaims.push({ tierId: tier.id, claimedOnDay: game.day });
		newNotices.push(tierClaimedNotice(tier.id, game.day));
		storeCapacityDelta += tier.reward.storeCapacityBonus;
	}

	if (newClaims.length === 0) return game;

	return {
		...game,
		storeCap: game.storeCap + storeCapacityDelta,
		progression: { claims: [...game.progression.claims, ...newClaims] },
		decisions: [...game.decisions, ...newNotices]
	};
}
