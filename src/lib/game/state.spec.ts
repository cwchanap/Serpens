import { describe, expect, test } from 'vitest';
import { createNewGame, openStore, resolveDecision, updatePolicy } from './state';

describe('game state', () => {
	test('creates a new game from an archetype', () => {
		expect.assertions(6);
		const game = createNewGame('boutique', 1001);

		expect(game.seed).toBe(1001);
		expect(game.day).toBe(1);
		expect(game.stores).toHaveLength(1);
		expect(game.stores[0]?.archetypeId).toBe('boutique');
		expect(game.policy.pricing).toBe('standard');
		expect(game.scorecard.customerSatisfaction).toBeGreaterThan(0);
	});

	test('stores normalized seed values', () => {
		expect.assertions(4);
		const zeroSeed = createNewGame('convenience', 0);
		const negativeSeed = createNewGame('convenience', -5);

		expect(zeroSeed.seed).toBe(1);
		expect(zeroSeed.rngState).toBe(1);
		expect(negativeSeed.seed).toBe(5);
		expect(negativeSeed.rngState).toBe(5);
	});

	test('updates company policy immutably', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 22);
		const updated = updatePolicy(game, { pricing: 'premium', inventory: 'generous' });

		expect(updated).not.toBe(game);
		expect(updated.policy.pricing).toBe('premium');
		expect(game.policy.pricing).toBe('standard');
	});

	test('opens stores up to the local chain limit', () => {
		expect.assertions(5);
		const game = createNewGame('electronics', 44);
		const second = openStore(game, { name: 'Mall Kiosk', location: 'West Mall' });
		const third = openStore(second, { name: 'Campus Shop', location: 'North Campus' });
		const fourth = openStore(third, { name: 'Airport Shop', location: 'Airport' });

		expect(second.stores).toHaveLength(2);
		expect(second.cash).toBeLessThan(game.cash);
		expect(third.stores).toHaveLength(3);
		expect(fourth.stores).toHaveLength(3);
		expect(fourth.decisions.at(-1)?.title).toBe('Expansion unavailable');
	});

	test('resolves a decision by applying effects and removing it', () => {
		expect.assertions(3);
		const game = createNewGame('grocery', 55);
		const decision = {
			id: 'supplier-1',
			title: 'Supplier discount',
			context: 'A supplier offers a short-term discount.',
			expiresOnDay: 3,
			options: [
				{
					id: 'accept',
					label: 'Accept',
					description: 'Take the savings.',
					effects: { cash: 500, customerSatisfaction: -1, stockHealth: 3 }
				}
			]
		};

		const resolved = resolveDecision({ ...game, decisions: [decision] }, 'supplier-1', 'accept');

		expect(resolved.cash).toBe(game.cash + 500);
		expect(resolved.decisions).toHaveLength(0);
		expect(resolved.scorecard.customerSatisfaction).toBe(game.scorecard.customerSatisfaction - 1);
	});
});
