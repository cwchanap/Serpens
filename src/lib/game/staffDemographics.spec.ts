import { describe, expect, it } from 'vitest';
import { getStaffPortraitProfile } from '$lib/assets/staffPortraits';
import { createRng } from './rng';
import { getStaffDemographics } from './staffDemographics';
import { generateHiringCandidates, generateStarterStaffForStore } from './staffing';

describe('staff demographics', () => {
	it('stores gender and age on generated hiring candidates', () => {
		const candidates = generateHiringCandidates({ count: 5, day: 3, rng: createRng(2026) });

		expect(candidates).toHaveLength(5);
		for (const candidate of candidates) {
			const expected = getStaffDemographics(candidate.id);
			const portrait = getStaffPortraitProfile(candidate.id);
			expect(candidate.gender).toBe(expected.gender);
			expect(candidate.age).toBe(expected.age);
			expect(portrait.gender).toBe(candidate.gender);
			expect(portrait.age).toBe(candidate.age);
			expect(candidate.age).toBeGreaterThanOrEqual(18);
			expect(candidate.age).toBeLessThanOrEqual(69);
		}
	});

	it('stores gender and age on starter staff', () => {
		const staff = generateStarterStaffForStore({
			storeId: 'store-1',
			archetypeId: 'grocery',
			day: 1,
			rng: createRng(123)
		});

		for (const member of staff) {
			const expected = getStaffDemographics(member.id);
			const portrait = getStaffPortraitProfile(member.id);
			expect(member.gender).toBe(expected.gender);
			expect(member.age).toBe(expected.age);
			expect(portrait.gender).toBe(member.gender);
			expect(portrait.age).toBe(member.age);
		}
	});

	it('keeps demographic identity stable when a candidate becomes staff', () => {
		expect(getStaffDemographics('candidate-7-3')).toEqual(
			getStaffDemographics('staff-candidate-7-3')
		);
	});
});
