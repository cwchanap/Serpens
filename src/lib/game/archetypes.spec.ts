import { describe, expect, test } from 'vitest';
import { ARCHETYPES, getArchetype } from './archetypes';

describe('retail archetypes', () => {
	test('defines the four starting archetypes', () => {
		expect.assertions(1);
		expect(ARCHETYPES.map((archetype) => archetype.id)).toEqual([
			'convenience',
			'boutique',
			'electronics',
			'grocery'
		]);
	});

	test('each archetype has economic inputs and product categories', () => {
		expect.assertions(ARCHETYPES.length * 5);
		for (const archetype of ARCHETYPES) {
			expect(archetype.startingCash).toBeGreaterThan(0);
			expect(archetype.baseRent).toBeGreaterThan(0);
			expect(archetype.baseWage).toBeGreaterThan(0);
			expect(archetype.baseTraffic).toBeGreaterThan(0);
			expect(archetype.startingCategories.length).toBeGreaterThan(0);
		}
	});

	test('looks up an archetype by id', () => {
		expect.assertions(1);
		expect(getArchetype('electronics').name).toBe('Electronics & Games');
	});
});
