import { describe, expect, test } from 'vitest';
import {
	MAX_STORE_LEVEL,
	MAX_BUILDING_LEVEL,
	RETAIL_UPGRADE_BASE_COST,
	INDUSTRY_UPGRADE_BASE_COST,
	isMilestoneLevel,
	getUnlockedProductCount,
	getUnlockedProductIds,
	getStoreRevenueMultiplier,
	getStoreStaffCapacityBonus,
	getStoreUpgradeCost,
	getBuildingThroughputMultiplier,
	getBuildingUpgradeCost,
	canUpgradeStore,
	canUpgradeBuilding
} from './leveling';

describe('leveling math', () => {
	test('caps are 10', () => {
		expect.assertions(2);
		expect(MAX_STORE_LEVEL).toBe(10);
		expect(MAX_BUILDING_LEVEL).toBe(10);
	});

	test('milestone levels are 4, 7, 10', () => {
		expect.assertions(10);
		expect(isMilestoneLevel(1)).toBe(false);
		expect(isMilestoneLevel(2)).toBe(false);
		expect(isMilestoneLevel(3)).toBe(false);
		expect(isMilestoneLevel(4)).toBe(true);
		expect(isMilestoneLevel(5)).toBe(false);
		expect(isMilestoneLevel(6)).toBe(false);
		expect(isMilestoneLevel(7)).toBe(true);
		expect(isMilestoneLevel(8)).toBe(false);
		expect(isMilestoneLevel(9)).toBe(false);
		expect(isMilestoneLevel(10)).toBe(true);
	});

	test('unlocked category count steps at milestones', () => {
		expect.assertions(5);
		// Founding breadth is 2 since HPA-502 Step 4 round 2 (low-price founding
		// economics); milestones still step one category at a time.
		expect(getUnlockedProductCount(1)).toBe(2);
		expect(getUnlockedProductCount(3)).toBe(2);
		expect(getUnlockedProductCount(4)).toBe(3);
		expect(getUnlockedProductCount(7)).toBe(4);
		expect(getUnlockedProductCount(10)).toBe(5);
	});

	test('unlocked product ids cap at the catalog length', () => {
		expect.assertions(4);
		// The L10 budget (5) exceeds a four-product catalog — the shared helper
		// returns the catalog prefix so no caller can invent a fifth product.
		expect(getUnlockedProductIds(10, ['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
		expect(getUnlockedProductIds(10, ['a', 'b', 'c', 'd', 'e'])).toEqual(['a', 'b', 'c', 'd', 'e']);
		expect(getUnlockedProductIds(1, ['a', 'b', 'c', 'd'])).toEqual(['a', 'b']);
		expect(getUnlockedProductIds(7, ['a', 'b', 'c', 'd'])).toEqual(['a', 'b', 'c', 'd']);
	});

	test('revenue multiplier adds 10% per non-milestone level', () => {
		expect.assertions(9);
		expect(getStoreRevenueMultiplier(1)).toBeCloseTo(1.0, 5);
		expect(getStoreRevenueMultiplier(2)).toBeCloseTo(1.1, 5);
		expect(getStoreRevenueMultiplier(3)).toBeCloseTo(1.2, 5);
		expect(getStoreRevenueMultiplier(4)).toBeCloseTo(1.2, 5); // milestone: no bump
		expect(getStoreRevenueMultiplier(5)).toBeCloseTo(1.3, 5);
		expect(getStoreRevenueMultiplier(6)).toBeCloseTo(1.4, 5);
		expect(getStoreRevenueMultiplier(7)).toBeCloseTo(1.4, 5); // milestone: no bump
		expect(getStoreRevenueMultiplier(8)).toBeCloseTo(1.5, 5);
		expect(getStoreRevenueMultiplier(10)).toBeCloseTo(1.6, 5);
	});

	test('staff capacity bonus is 8 per milestone reached', () => {
		expect.assertions(4);
		// Founding breadth 2 (HPA-502 Step 4 round 2) makes the level-1 bonus 8;
		// upgrade deltas stay +8 per milestone.
		expect(getStoreStaffCapacityBonus(1)).toBe(8);
		expect(getStoreStaffCapacityBonus(4)).toBe(16);
		expect(getStoreStaffCapacityBonus(7)).toBe(24);
		expect(getStoreStaffCapacityBonus(10)).toBe(32);
	});

	test('store upgrade cost scales with current level', () => {
		expect.assertions(2);
		expect(getStoreUpgradeCost(1)).toBe(RETAIL_UPGRADE_BASE_COST);
		expect(getStoreUpgradeCost(9)).toBe(RETAIL_UPGRADE_BASE_COST * 9);
	});

	test('building throughput adds 20% per level', () => {
		expect.assertions(5);
		expect(getBuildingThroughputMultiplier(1)).toBeCloseTo(1.0, 5);
		expect(getBuildingThroughputMultiplier(3)).toBeCloseTo(1.4, 5);
		expect(getBuildingThroughputMultiplier(5)).toBeCloseTo(1.8, 5);
		expect(getBuildingThroughputMultiplier(8)).toBeCloseTo(2.4, 5);
		expect(getBuildingThroughputMultiplier(10)).toBeCloseTo(2.8, 5);
	});

	test('building upgrade cost scales with current level', () => {
		expect.assertions(1);
		expect(getBuildingUpgradeCost(3)).toBe(INDUSTRY_UPGRADE_BASE_COST * 3);
	});

	test('cannot upgrade at max level', () => {
		expect.assertions(4);
		expect(canUpgradeStore(9)).toBe(true);
		expect(canUpgradeStore(10)).toBe(false);
		expect(canUpgradeBuilding(9)).toBe(true);
		expect(canUpgradeBuilding(10)).toBe(false);
	});
});
