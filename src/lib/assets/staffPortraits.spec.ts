import { describe, expect, it } from 'vitest';
import {
	STAFF_PORTRAIT_COUNT,
	getStaffPortraitIndex,
	getStaffPortraitPosition
} from './staffPortraits';

describe('staff portraits', () => {
	it('keeps a hiring candidate portrait after hiring', () => {
		expect(getStaffPortraitIndex('candidate-7-3')).toBe(
			getStaffPortraitIndex('staff-candidate-7-3')
		);
	});

	it('maps stable staff ids into the stock portrait sprite', () => {
		const index = getStaffPortraitIndex('staff-store-1-general-1');
		expect(index).toBeGreaterThanOrEqual(0);
		expect(index).toBeLessThan(STAFF_PORTRAIT_COUNT);
		expect(getStaffPortraitIndex('staff-store-1-general-1')).toBe(index);
		expect(getStaffPortraitPosition('staff-store-1-general-1')).toMatch(/%/);
	});
});
