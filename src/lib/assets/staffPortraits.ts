export const STAFF_PORTRAIT_SPRITE_PATH = '/assets/game/staff/staff-portraits.webp';
export const STAFF_PORTRAIT_COLUMNS = 4;
export const STAFF_PORTRAIT_ROWS = 6;
export const STAFF_PORTRAIT_COUNT = STAFF_PORTRAIT_COLUMNS * STAFF_PORTRAIT_ROWS;

export type StaffGender = 'female' | 'male';
export type StaffAgeGroup = 'young' | 'adult' | 'senior';

export interface StaffDemographics {
	gender: StaffGender;
	age: number;
	ageGroup: StaffAgeGroup;
}

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

function portraitIdentity(personId: string): string {
	// Hiring turns `candidate-*` into `staff-candidate-*`. Normalize that prefix
	// so demographics and portrait identity remain stable after hiring.
	return personId.startsWith('staff-candidate-') ? personId.slice('staff-'.length) : personId;
}

function hashIdentity(personId: string, salt: string): number {
	let hash = 2_166_136_261;

	for (const char of `${portraitIdentity(personId)}:${salt}`) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 16_777_619) >>> 0;
	}

	return hash;
}

function getAgeGroup(age: number): StaffAgeGroup {
	if (age <= 34) return 'young';
	if (age <= 54) return 'adult';
	return 'senior';
}

export function getStaffDemographics(personId: string): StaffDemographics {
	const gender: StaffGender = hashIdentity(personId, 'gender') % 2 === 0 ? 'female' : 'male';
	const age = 18 + (hashIdentity(personId, 'age') % 52);

	return {
		gender,
		age,
		ageGroup: getAgeGroup(age)
	};
}

export function getStaffPortraitProfile(personId: string): StaffPortraitProfile {
	const demographics = getStaffDemographics(personId);
	const row = (demographics.gender === 'female' ? 0 : 3) + AGE_GROUP_ROWS[demographics.ageGroup];
	const column = hashIdentity(personId, 'portrait') % STAFF_PORTRAIT_COLUMNS;
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
