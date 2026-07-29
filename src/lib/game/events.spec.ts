import { describe, expect, test } from 'vitest';
import { generateDecisions } from './events';
import { assessCredit } from './finance';
import {
	decisionContextCashPressure,
	decisionContextExpansionOpportunity,
	decisionContextSupplierTerms
} from './decisionContext';
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

	test('persists a credit-sized emergency loan instead of granting cash for a cash-pressure decision', () => {
		expect.assertions(5);
		const game = { ...createNewGame('electronics', 33), cash: -500 };
		const emergency = generateDecisions(game)[0]?.options.find(
			(option) => option.id === 'short-loan'
		);
		const roundedCapacity = Math.floor(assessCredit(game, 56).availableCredit / 1_000) * 1_000;
		const expectedAmount = Math.min(12_000, Math.max(4_000, roundedCapacity));

		expect(emergency?.effects.finance).toEqual({
			kind: 'borrow',
			purpose: 'emergency',
			amount: expectedAmount,
			termDays: 56
		});
		expect(emergency?.effects.cash).toBeUndefined();
		expect(emergency?.effects.profit).toBe(-4);
		expect(emergency?.effects.marketPosition).toBe(-1);
		expect(emergency?.effects.finance?.amount).toBe(expectedAmount);
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
					context: decisionContextCashPressure(),
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
					context: decisionContextExpansionOpportunity(),
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
						context: decisionContextSupplierTerms(),
						expiresOnDay: 3,
						options: []
					}
				]
			})
		).toHaveLength(0);
	});

	test('persists supplier credit as a 28-day loan while keeping cash-free alternatives intact', () => {
		expect.assertions(6);
		const decision = generateDecisions({ ...createNewGame('convenience', 43), rngState: 1 })[0]!;
		const supplierCredit = decision.options.find((option) => option.id === 'negotiate-credit');
		const bulkDiscount = decision.options.find((option) => option.id === 'bulk-discount');

		expect(supplierCredit?.effects.finance).toEqual({
			kind: 'borrow',
			purpose: 'supplierCredit',
			amount: 4_000,
			termDays: 28
		});
		expect(supplierCredit?.effects.cash).toBeUndefined();
		expect(supplierCredit?.effects.profit).toBe(-2);
		expect(bulkDiscount?.effects.cash).toBe(-2_500);
		expect(bulkDiscount?.effects.profit).toBe(3);
		expect(decision.options).toHaveLength(2);
	});
});
