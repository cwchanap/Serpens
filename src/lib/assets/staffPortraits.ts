export const STAFF_PORTRAIT_SPRITE_PATH = '/assets/game/staff/staff-portraits.webp';
export const STAFF_PORTRAIT_COUNT = 8;

const STAFF_PORTRAIT_POSITIONS = Object.freeze([
	'0% 0%',
	'33.333% 0%',
	'66.667% 0%',
	'100% 0%',
	'0% 100%',
	'33.333% 100%',
	'66.667% 100%',
	'100% 100%'
] as const);

function portraitIdentity(personId: string): string {
	// Hiring turns `candidate-*` into `staff-candidate-*`. Normalize that prefix
	// so a candidate keeps the same stock portrait after they are hired.
	return personId.startsWith('staff-candidate-') ? personId.slice('staff-'.length) : personId;
}

export function getStaffPortraitIndex(personId: string): number {
	let hash = 2_166_136_261;

	for (const char of portraitIdentity(personId)) {
		hash ^= char.charCodeAt(0);
		hash = Math.imul(hash, 16_777_619) >>> 0;
	}

	return hash % STAFF_PORTRAIT_COUNT;
}

export function getStaffPortraitPosition(personId: string): string {
	return STAFF_PORTRAIT_POSITIONS[getStaffPortraitIndex(personId)]!;
}
