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

	test('each archetype defines exactly four product categories', () => {
		expect.assertions(ARCHETYPES.length);
		for (const archetype of ARCHETYPES) {
			expect(archetype.startingCategories).toHaveLength(4);
		}
	});

	test('category ids are unique within each archetype', () => {
		expect.assertions(ARCHETYPES.length);
		for (const archetype of ARCHETYPES) {
			const ids = archetype.startingCategories.map((category) => category.id);
			expect(new Set(ids).size).toBe(ids.length);
		}
	});

	test('protects global archetype definitions from caller mutation', () => {
		expect.assertions(4);
		const returned = getArchetype('electronics');

		returned.name = 'Mutated Electronics';
		returned.startingCategories[0]!.name = 'Mutated Category';
		returned.risks.push('Mutated Risk');

		expect(ARCHETYPES.find((archetype) => archetype.id === 'electronics')?.name).toBe(
			'Electronics & Games'
		);
		expect(
			ARCHETYPES.find((archetype) => archetype.id === 'electronics')?.startingCategories[0]?.name
		).toBe('Games');
		expect(ARCHETYPES.find((archetype) => archetype.id === 'electronics')?.risks).not.toContain(
			'Mutated Risk'
		);
		expect(getArchetype('electronics').name).toBe('Electronics & Games');
	});
});
