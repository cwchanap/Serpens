import { describe, expect, test } from 'vitest';
import {
	MAX_STAFF_LEVEL,
	STAFF_ACTIVITY_XP_PER_DAY,
	STAFF_BASE_XP_PER_DAY,
	canPromoteStaff,
	getStaffDailyXp,
	getStaffSalaryAfterPromotion,
	getStaffSkillAfterPromotion,
	getStaffTrainingFee,
	getStaffXpForLevel
} from './staffLeveling';

describe('staff leveling curves', () => {
	test('xp threshold scales linearly with level', () => {
		expect.assertions(3);
		expect(getStaffXpForLevel(1)).toBe(100);
		expect(getStaffXpForLevel(2)).toBe(200);
		expect(getStaffXpForLevel(4)).toBe(400);
	});

	test('training fee scales with the pre-promotion level', () => {
		expect.assertions(3);
		expect(getStaffTrainingFee(1)).toBe(2_000);
		expect(getStaffTrainingFee(2)).toBe(4_000);
		expect(getStaffTrainingFee(4)).toBe(8_000);
	});

	test('promotion raises skill by a fixed amount and clamps at 100', () => {
		expect.assertions(2);
		expect(getStaffSkillAfterPromotion(60)).toBe(68);
		expect(getStaffSkillAfterPromotion(96)).toBe(100);
	});

	test('promotion raises salary by 12 percent, rounded', () => {
		expect.assertions(2);
		expect(getStaffSalaryAfterPromotion(2_800)).toBe(3_136);
		expect(getStaffSalaryAfterPromotion(4_600)).toBe(5_152);
	});

	test('daily xp is base plus an activity bonus scaled by clamped utilization', () => {
		expect.assertions(4);
		expect(getStaffDailyXp(0)).toBe(STAFF_BASE_XP_PER_DAY);
		expect(getStaffDailyXp(1)).toBe(STAFF_BASE_XP_PER_DAY + STAFF_ACTIVITY_XP_PER_DAY);
		expect(getStaffDailyXp(2)).toBe(STAFF_BASE_XP_PER_DAY + STAFF_ACTIVITY_XP_PER_DAY);
		expect(getStaffDailyXp(-1)).toBe(STAFF_BASE_XP_PER_DAY);
	});

	test('canPromoteStaff requires enough xp and a level below the max', () => {
		expect.assertions(4);
		expect(canPromoteStaff({ level: 1, xp: 100 })).toBe(true);
		expect(canPromoteStaff({ level: 1, xp: 99 })).toBe(false);
		expect(canPromoteStaff({ level: MAX_STAFF_LEVEL, xp: 10_000 })).toBe(false);
		expect(canPromoteStaff({ level: 2, xp: 200 })).toBe(true);
	});
});
