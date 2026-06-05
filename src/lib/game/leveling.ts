/**
 * Store and industrial-building leveling model.
 *
 * Both progressions cap at {@link MAX_STORE_LEVEL} / {@link MAX_BUILDING_LEVEL}.
 * Stores use milestone levels ({@link STORE_MILESTONE_LEVELS}) to gate the
 * addition of new product categories and the staff-capacity bonus; industrial
 * buildings scale throughput continuously with level.
 *
 * Revenue and cost curves:
 * - Store revenue scales by +{STORE_REVENUE_BONUS_PER_LEVEL} (10%) per
 *   non-milestone level. Milestone levels (4, 7, 10) are intentionally
 *   excluded from the revenue count: a level 1 → 4 transition grants a new
 *   product category and +8 staff capacity but no compounding revenue bumps.
 *   Naively writing `1 + 0.1*(level-1)` would silently change balance.
 * - Store upgrade cost = {@link RETAIL_UPGRADE_BASE_COST} × pre-upgrade level.
 *   The pre-upgrade level means a level 3 → 4 upgrade costs 3 × 8,000 = 24,000
 *   and a level 9 → 10 upgrade costs 9 × 8,000 = 72,000. This rewards early
 *   investment without ever penalising later upgrades.
 * - Industrial building throughput scales by +{BUILDING_THROUGHPUT_BONUS_PER_LEVEL}
 *   (20%) per level above 1; cost follows the same pre-upgrade-level curve
 *   as stores.
 */
export const MAX_STORE_LEVEL = 10;
export const MAX_BUILDING_LEVEL = 10;
export const STORE_MILESTONE_LEVELS = [4, 7, 10] as const;
export const RETAIL_UPGRADE_BASE_COST = 8_000;
export const INDUSTRY_UPGRADE_BASE_COST = 5_000;
export const STORE_MILESTONE_CAPACITY_BONUS = 8;
export const STORE_REVENUE_BONUS_PER_LEVEL = 0.1;
export const BUILDING_THROUGHPUT_BONUS_PER_LEVEL = 0.2;

export function isMilestoneLevel(level: number): boolean {
	return STORE_MILESTONE_LEVELS.includes(level as (typeof STORE_MILESTONE_LEVELS)[number]);
}

/**
 * Number of product categories unlocked at the given store level.
 *
 * Derived from {@link STORE_MILESTONE_LEVELS} so that adding or removing a
 * milestone level (and the corresponding capacity / category-unlock rules)
 * stays in lockstep with the rest of the leveling model. Milestones are
 * evaluated in descending order so the highest matching milestone wins
 * (e.g. level 10 unlocks 4 categories, not 2).
 */
export function getUnlockedCategoryCount(level: number): number {
	for (let index = STORE_MILESTONE_LEVELS.length - 1; index >= 0; index--) {
		if (level >= STORE_MILESTONE_LEVELS[index]!) {
			return index + 2;
		}
	}
	return 1;
}

export function getStoreRevenueMultiplier(level: number): number {
	let bonusLevels = 0;
	for (let candidate = 2; candidate <= level; candidate++) {
		if (!isMilestoneLevel(candidate)) {
			bonusLevels++;
		}
	}
	return 1 + STORE_REVENUE_BONUS_PER_LEVEL * bonusLevels;
}

export function getStoreStaffCapacityBonus(level: number): number {
	return STORE_MILESTONE_CAPACITY_BONUS * (getUnlockedCategoryCount(level) - 1);
}

export function getStoreUpgradeCost(level: number): number {
	return RETAIL_UPGRADE_BASE_COST * level;
}

export function getBuildingThroughputMultiplier(level: number): number {
	return 1 + BUILDING_THROUGHPUT_BONUS_PER_LEVEL * (level - 1);
}

export function getBuildingUpgradeCost(level: number): number {
	return INDUSTRY_UPGRADE_BASE_COST * level;
}

export function canUpgradeStore(level: number): boolean {
	return level < MAX_STORE_LEVEL;
}

export function canUpgradeBuilding(level: number): boolean {
	return level < MAX_BUILDING_LEVEL;
}
