import { describe, expect, it } from 'vitest';
import { getStaffPortraitProfile } from '$lib/assets/staffPortraits';
import { createRng } from './rng';
import { getStaffDemographics } from './staffDemographics';
import { generateHiringCandidates, generateStarterStaffForStore } from './staffing';

describe('staff demographics', () => {
	it('derives a matching portrait profile for generated hiring candidates', () => {
		const candidates = generateHiringCandidates({ count: 5, day: 3, rng: createRng(2026) });

		expect(candidates).toHaveLength(5);
		for (const candidate of candidates) {
			const demographics = getStaffDemographics(candidate.id);
			const portrait = getStaffPortraitProfile(candidate.id);
			expect(portrait.gender).toBe(demographics.gender);
			expect(portrait.age).toBe(demographics.age);
			expect(portrait.ageGroup).toBe(demographics.ageGroup);
			expect(demographics.age).toBeGreaterThanOrEqual(18);
			expect(demographics.age).toBeLessThanOrEqual(69);
		}
	});

	it('derives a matching portrait profile for starter staff', () => {
		const staff = generateStarterStaffForStore({
			storeId: 'store-1',
			archetypeId: 'grocery',
			day: 1,
			rng: createRng(123)
		});

		for (const member of staff) {
			const demographics = getStaffDemographics(member.id);
			const portrait = getStaffPortraitProfile(member.id);
			expect(portrait.gender).toBe(demographics.gender);
			expect(portrait.age).toBe(demographics.age);
			expect(portrait.ageGroup).toBe(demographics.ageGroup);
		}
	});

	it('keeps demographic identity stable when a candidate becomes staff', () => {
		expect(getStaffDemographics('candidate-7-3')).toEqual(
			getStaffDemographics('staff-candidate-7-3')
		);
	});
});
