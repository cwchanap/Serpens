import { describe, expect, it } from 'vitest';
import type { AuthoredBuilding } from './shared';
import { buildingsOverlap } from './geometry';

function building(overrides: Partial<AuthoredBuilding> & { path: string }): AuthoredBuilding {
	return {
		typeId: 'warehouse',
		cityId: 'industry-city',
		tileId: 'industry-city-26-6',
		validPlacement: true,
		...overrides
	};
}

describe('buildingsOverlap', () => {
	it('returns true for the same path', () => {
		const a = building({ path: 'start.industrialBuildings[0]', x: 26, y: 6 });
		expect(buildingsOverlap(a, a)).toBe(true);
	});

	it('returns false for buildings in different cities', () => {
		const a = building({ path: 'a', cityId: 'industry-city', x: 26, y: 6 });
		const b = building({ path: 'b', cityId: 'breadbasket-basin', x: 26, y: 6 });
		expect(buildingsOverlap(a, b)).toBe(false);
	});

	it('returns false when either building has undefined coordinates', () => {
		const a = building({ path: 'a', x: 26, y: 6 });
		const b = building({ path: 'b', x: undefined, y: undefined });
		expect(buildingsOverlap(a, b)).toBe(false);
	});

	it('returns true for overlapping footprints in the same city', () => {
		const a = building({ path: 'a', x: 26, y: 6 });
		const b = building({ path: 'b', x: 27, y: 7 });
		expect(buildingsOverlap(a, b)).toBe(true);
	});

	it('returns false for non-overlapping footprints in the same city', () => {
		const a = building({ path: 'a', x: 26, y: 6 });
		const b = building({ path: 'b', x: 40, y: 40 });
		expect(buildingsOverlap(a, b)).toBe(false);
	});
});
