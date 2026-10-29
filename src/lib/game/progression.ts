import type { TranslationKey } from '$lib/i18n/translate';
import { evaluateCondition } from '$lib/scenarios/metrics';
import type { ObjectiveEvidence, ScenarioCondition } from '$lib/scenarios/types';
import type { DecisionItem, GameState, ProgressionTierId } from './types';
import { decisionContextProgressionTierClaimed } from './decisionContext';

/**
 * Authored five-step progression ladder (design §2). Pure catalog plus two
 * entry points: `evaluateProgression` (read-only view) and `claimEarnedTiers`
 * (append-only receipt transition). No background timers or achievement
 * framework — just monotone metric goals and one commit per call.
 */

export interface ProgressionTierReward {
	/** +1 store slot per claimed tier, added to the existing persisted storeCap. */
	storeCapacityBonus: number;
	/**
	 * +$25,000 credit underwriting base and gross-principal hard bound per
	 * claimed tier. Description only — the finance math lands with the
	 * credit-limits step; nothing here touches loans.
	 */
	creditUnderwritingBaseBonus: number;
	creditGrossPrincipalHardBoundBonus: number;
}

export interface ProgressionTier {
	id: ProgressionTierId;
	titleKey: TranslationKey;
	descriptionKey: TranslationKey;
	/** Monotone claim goals evaluated with the shared scenario condition evaluator. */
	goals: readonly ScenarioCondition[];
	reward: ProgressionTierReward;
}

/** Uniform per-tier reward (design §2/§3); identical for every tier. */
const TIER_REWARD: ProgressionTierReward = {
	storeCapacityBonus: 1,
	creditUnderwritingBaseBonus: 25_000,
	creditGrossPrincipalHardBoundBonus: 25_000
};

/**
 * Tier-3 local-delivery product set: the three tier-1 onboarding industry
 * chains (spring-water treatment, produce packing, pantry goods production).
 * A regional-supplier-era company can legally produce and deliver all three
 * through the day-one buildings; calibration (step 4) validates the 25-unit
 * target is reachable with them.
 */
const REGIONAL_SUPPLIER_PRODUCT_IDS = ['bottled-water', 'produce', 'pantry'] as const;

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
		reward: TIER_REWARD
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
		reward: TIER_REWARD
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
			},
			{
				id: 'regional-supplier-peak-book-value',
				labelKey: 'progression.goals.regionalSupplierPeakBookValue',
				query: { metric: 'peak-company-book-value' },
				comparator: 'gte',
				target: 60_000,
				window: RUN_TO_DATE_WINDOW,
				requiresCompleteWindow: true
			}
		],
		reward: TIER_REWARD
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
		reward: TIER_REWARD
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
		reward: TIER_REWARD
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
		storeCapacityUnlockedByClaims: claimedCount,
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
 * new claim adds exactly one to the existing persisted storeCap and issues a
 * one-time system notice. Idempotent: with nothing newly eligible the original
 * game reference is returned untouched.
 */
export function claimEarnedTiers(game: GameState): GameState {
	const claimedTierIds = new Set(game.progression.claims.map((claim) => claim.tierId));
	const newClaims: GameState['progression']['claims'] = [];
	const newNotices: DecisionItem[] = [];

	for (const tier of PROGRESSION_TIERS) {
		if (claimedTierIds.has(tier.id)) continue;
		if (!tierGoalsPass(tier, game)) break;
		newClaims.push({ tierId: tier.id, claimedOnDay: game.day });
		newNotices.push(tierClaimedNotice(tier.id, game.day));
	}

	if (newClaims.length === 0) return game;

	return {
		...game,
		storeCap: game.storeCap + newClaims.length,
		progression: { claims: [...game.progression.claims, ...newClaims] },
		decisions: [...game.decisions, ...newNotices]
	};
}
