import { describe, expect, it, test } from 'vitest';
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

	test('each archetype has economic inputs and starting products', () => {
		expect.assertions(ARCHETYPES.length * 5);
		for (const archetype of ARCHETYPES) {
			expect(archetype.startingCash).toBeGreaterThan(0);
			expect(archetype.baseRent).toBeGreaterThan(0);
			expect(archetype.baseWage).toBeGreaterThan(0);
			expect(archetype.baseTraffic).toBeGreaterThan(0);
			expect(archetype.startingProductIds.length).toBeGreaterThan(0);
		}
	});

	test('looks up an archetype by id', () => {
		expect.assertions(1);
		expect(getArchetype('electronics').name).toBe('Electronics & Games');
	});

	test('each archetype defines exactly four starting products', () => {
		expect.assertions(ARCHETYPES.length);
		for (const archetype of ARCHETYPES) {
			// Convenience carries a 5th (unreachable) category, `household`, for
			// legacy-save compatibility — see archetypes.ts and stock.ts.
			const expectedLength = archetype.id === 'convenience' ? 5 : 4;
			expect(archetype.startingProductIds).toHaveLength(expectedLength);
		}
	});

	test('product ids are unique within each archetype', () => {
		expect.assertions(ARCHETYPES.length);
		for (const archetype of ARCHETYPES) {
			const ids = archetype.startingProductIds;
			expect(new Set(ids).size).toBe(ids.length);
		}
	});

	test('product ids are unique across all archetypes', () => {
		expect.assertions(1);
		const allIds = ARCHETYPES.flatMap((archetype) => archetype.startingProductIds);
		expect(new Set(allIds).size).toBe(allIds.length);
	});

	test('protects global archetype definitions from caller mutation', () => {
		expect.assertions(4);
		const returned = getArchetype('electronics');

		returned.name = 'Mutated Electronics';
		(returned.startingProductIds as string[])[0] = 'snacks';
		returned.risks.push('Mutated Risk');

		expect(ARCHETYPES.find((archetype) => archetype.id === 'electronics')?.name).toBe(
			'Electronics & Games'
		);
		expect(
			ARCHETYPES.find((archetype) => archetype.id === 'electronics')?.startingProductIds[0]
		).toBe('games');
		expect(ARCHETYPES.find((archetype) => archetype.id === 'electronics')?.risks).not.toContain(
			'Mutated Risk'
		);
		expect(getArchetype('electronics').name).toBe('Electronics & Games');
	});

	test('throws when looking up an unknown archetype id', () => {
		expect.assertions(1);
		expect(() => getArchetype('nonexistent' as never)).toThrow('Unknown archetype: nonexistent');
	});
});

describe('convenience tier 1 lineup', () => {
	it('starts with bottled water so a level-1 store gets a tier 1 chain', () => {
		const convenience = getArchetype('convenience');
		expect(convenience.startingProductIds).toEqual([
			'bottled-water',
			'snacks',
			'soft-drinks',
			'essentials',
			'household'
		]);
	});
});
