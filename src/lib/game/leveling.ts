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

export function getUnlockedCategoryCount(level: number): number {
	if (level >= 10) return 4;
	if (level >= 7) return 3;
	if (level >= 4) return 2;
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
