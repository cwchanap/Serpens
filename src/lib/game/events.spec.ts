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

	test('does not duplicate an existing cash pressure decision', () => {
		expect.assertions(1);
		const game = {
			...createNewGame('electronics', 33),
			cash: -500,
			decisions: [
				{
					id: 'cash-pressure',
					title: 'Cash pressure',
					context: 'Existing pressure decision.',
					expiresOnDay: 3,
					options: []
				}
			]
		};

		expect(generateDecisions(game)).toHaveLength(0);
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

		expect(generateDecisions(game)[0]).toMatchObject({
			id: 'expansion-opportunity',
			title: 'Expansion opportunity'
		});
	});

	test('does not duplicate an existing expansion opportunity decision', () => {
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
			},
			decisions: [
				{
					id: 'expansion-opportunity',
					title: 'Expansion opportunity',
					context: 'Existing expansion decision.',
					expiresOnDay: 19,
					options: []
				}
			]
		};

		expect(generateDecisions(game)).toHaveLength(0);
	});

	test('does not duplicate an existing supplier terms decision', () => {
		expect.assertions(2);
		const game = { ...createNewGame('convenience', 43), rngState: 1 };

		expect(generateDecisions(game)[0]?.id).toBe('supplier-terms');
		expect(
			generateDecisions({
				...game,
				decisions: [
					{
						id: 'supplier-terms',
						title: 'Supplier terms',
						context: 'Existing supplier decision.',
						expiresOnDay: 3,
						options: []
					}
				]
			})
		).toHaveLength(0);
	});
});
