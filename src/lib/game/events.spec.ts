import { describe, expect, test } from 'vitest';
import { generateDecisions } from './events';
import { createNewGame } from './state';

describe('decision generation', () => {
	test('is sparse for healthy early businesses', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 33);
		const decisions = generateDecisions(game);

		expect(decisions.length).toBeLessThanOrEqual(1);
	});

	test('creates a cash pressure decision when cash is negative', () => {
		expect.assertions(2);
		const game = { ...createNewGame('electronics', 33), cash: -500 };
		const decisions = generateDecisions(game);

		expect(decisions[0]?.title).toBe('Cash pressure');
		expect(decisions[0]?.options).toHaveLength(3);
	});

	test('creates an expansion opportunity after the business has traction', () => {
		expect.assertions(1);
		const game = {
			...createNewGame('boutique', 33),
			day: 16,
			cash: 70_000,
			scorecard: {
				profit: 70,
				customerSatisfaction: 74,
				staffMorale: 66,
				marketPosition: 32
			}
		};

		expect(generateDecisions(game).some((decision) => decision.id.startsWith('expansion-'))).toBe(
			true
		);
	});
});
