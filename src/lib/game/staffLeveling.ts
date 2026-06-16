import { clampScore } from './reports';
import type { StaffMember } from './types';

export const MAX_STAFF_LEVEL = 5;
export const STAFF_SKILL_GAIN_PER_LEVEL = 8;
export const STAFF_SALARY_BONUS_PER_LEVEL = 0.12;
export const STAFF_TRAINING_BASE_COST = 2_000;
export const STAFF_BASE_XP_PER_DAY = 5;
export const STAFF_ACTIVITY_XP_PER_DAY = 5;
export const STAFF_XP_BASE_PER_LEVEL = 100;

/** XP required to advance from `level` to `level + 1`. */
export function getStaffXpForLevel(level: number): number {
	return STAFF_XP_BASE_PER_LEVEL * level;
}

/** Cash cost to promote a member currently at `level` (pre-promotion level). */
export function getStaffTrainingFee(level: number): number {
	return STAFF_TRAINING_BASE_COST * level;
}

export function getStaffSkillAfterPromotion(skill: number): number {
	return clampScore(skill + STAFF_SKILL_GAIN_PER_LEVEL);
}

export function getStaffSalaryAfterPromotion(salary: number): number {
	return Math.round(salary * (1 + STAFF_SALARY_BONUS_PER_LEVEL));
}

/**
 * Daily XP for an assigned member; `utilization` is customersServed / staffLimit.
 * Returns an integer: base XP plus the activity bonus rounded to the nearest
 * whole point (so fractional utilization yields base + round(bonus * utilization),
 * not base + bonus * utilization).
 */
export function getStaffDailyXp(utilization: number): number {
	const clamped = Math.max(0, Math.min(1, utilization));
	return STAFF_BASE_XP_PER_DAY + Math.round(STAFF_ACTIVITY_XP_PER_DAY * clamped);
}

export function canPromoteStaff(member: Pick<StaffMember, 'level' | 'xp'>): boolean {
	return member.level < MAX_STAFF_LEVEL && member.xp >= getStaffXpForLevel(member.level);
}
