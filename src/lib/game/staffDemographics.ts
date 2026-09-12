export type StaffGender = 'female' | 'male';
export type StaffAgeGroup = 'young' | 'adult' | 'senior';

export interface StaffDemographics {
	gender: StaffGender;
	age: number;
	ageGroup: StaffAgeGroup;
}

export function normalizeStaffIdentity(personId: string): string {
	// Hiring turns `candidate-*` into `staff-candidate-*`. Normalize that prefix
	// so immutable demographic identity remains stable after hiring.
	return personId.startsWith('staff-candidate-') ? personId.slice('staff-'.length) : personId;
}

export function hashStaffIdentity(personId: string, salt: string): number {
	let hash = 2_166_136_261;

	for (const char of `${normalizeStaffIdentity(personId)}:${salt}`) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 16_777_619) >>> 0;
	}

	return hash;
}

export function getStaffAgeGroup(age: number): StaffAgeGroup {
	if (age <= 34) return 'young';
	if (age <= 54) return 'adult';
	return 'senior';
}

export function getStaffDemographics(personId: string): StaffDemographics {
	const gender: StaffGender = hashStaffIdentity(personId, 'gender') % 2 === 0 ? 'female' : 'male';
	const age = 18 + (hashStaffIdentity(personId, 'age') % 52);

	return {
		gender,
		age,
		ageGroup: getStaffAgeGroup(age)
	};
}
