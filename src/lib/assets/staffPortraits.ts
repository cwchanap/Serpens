import {
	getStaffDemographics,
	hashStaffIdentity,
	type StaffAgeGroup,
	type StaffDemographics,
	type StaffGender
} from '$lib/game/staffDemographics';

export const STAFF_PORTRAIT_SPRITE_PATH = '/assets/game/staff/staff-portraits.webp';
export const STAFF_PORTRAIT_COLUMNS = 4;
export const STAFF_PORTRAIT_ROWS = 6;
export const STAFF_PORTRAIT_COUNT = STAFF_PORTRAIT_COLUMNS * STAFF_PORTRAIT_ROWS;

export { getStaffDemographics };
export type { StaffAgeGroup, StaffDemographics, StaffGender };

export interface StaffPortraitProfile extends StaffDemographics {
	index: number;
	position: string;
}

const X_POSITIONS = ['0%', '33.333%', '66.667%', '100%'] as const;
const Y_POSITIONS = ['0%', '20%', '40%', '60%', '80%', '100%'] as const;
const AGE_GROUP_ROWS: Record<StaffAgeGroup, number> = {
	young: 0,
	adult: 1,
	senior: 2
};

export function getStaffPortraitProfile(personId: string): StaffPortraitProfile {
	const demographics = getStaffDemographics(personId);
	const row = (demographics.gender === 'female' ? 0 : 3) + AGE_GROUP_ROWS[demographics.ageGroup];
	const column = hashStaffIdentity(personId, 'portrait') % STAFF_PORTRAIT_COLUMNS;
	const index = row * STAFF_PORTRAIT_COLUMNS + column;

	return {
		...demographics,
		index,
		position: `${X_POSITIONS[column]} ${Y_POSITIONS[row]}`
	};
}

export function getStaffPortraitIndex(personId: string): number {
	return getStaffPortraitProfile(personId).index;
}

export function getStaffPortraitPosition(personId: string): string {
	return getStaffPortraitProfile(personId).position;
}
