import { describe, expect, it } from 'vitest';
import {
	STAFF_PORTRAIT_COUNT,
	getStaffDemographics,
	getStaffPortraitIndex,
	getStaffPortraitPosition
} from './staffPortraits';

describe('staff portraits', () => {
	it('keeps demographics and portrait identity after hiring', () => {
		expect(getStaffDemographics('candidate-7-3')).toEqual(
			getStaffDemographics('staff-candidate-7-3')
		);
		expect(getStaffPortraitIndex('candidate-7-3')).toBe(
			getStaffPortraitIndex('staff-candidate-7-3')
		);
	});

	it('derives stable staff age and gender', () => {
		const demographics = getStaffDemographics('staff-store-1-general-1');

		expect(demographics.age).toBeGreaterThanOrEqual(18);
		expect(demographics.age).toBeLessThanOrEqual(69);
		expect(['female', 'male']).toContain(demographics.gender);
		expect(['young', 'adult', 'senior']).toContain(demographics.ageGroup);
		expect(getStaffDemographics('staff-store-1-general-1')).toEqual(demographics);
	});

	it('selects portraits from the matching gender and age pool', () => {
		const ids = Array.from({ length: 64 }, (_, index) => `staff-${index + 1}`);

		expect(
			ids.every((id) => {
				const demographics = getStaffDemographics(id);
				const portraitRow = Math.floor(getStaffPortraitIndex(id) / 4);
				const ageRow = demographics.ageGroup === 'young' ? 0 : demographics.ageGroup === 'adult' ? 1 : 2;
				const expectedRow = (demographics.gender === 'female' ? 0 : 3) + ageRow;

				return portraitRow === expectedRow;
			})
		).toBe(true);
	});

	it('maps stable staff ids into the 24 portrait sprite', () => {
		const index = getStaffPortraitIndex('staff-store-1-general-1');

		expect(STAFF_PORTRAIT_COUNT).toBe(24);
		expect(index).toBeGreaterThanOrEqual(0);
		expect(index).toBeLessThan(STAFF_PORTRAIT_COUNT);
		expect(getStaffPortraitIndex('staff-store-1-general-1')).toBe(index);
		expect(getStaffPortraitPosition('staff-store-1-general-1')).toMatch(/^\d+(?:\.\d+)?% \d+%$/);
	});
});
