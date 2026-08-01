import { describe, expect, test } from 'vitest';
import { generateDecisions } from './events';
import { assessCredit } from './finance';
import { createRngFromState } from './rng';
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

	test('keeps the exact strategic-decision eligibility boundaries and priority', () => {
		expect.assertions(7);
		const base = createNewGame('boutique', 33);
		const expansionReady = {
			...base,
			day: 14,
			cash: 55_000,
			scorecard: { ...base.scorecard, profit: 62 },
			storeCap: base.stores.length + 1,
			rngState: 1_400_000
		};

		expect(generateDecisions({ ...expansionReady, cash: -1 })[0]?.id).toBe('cash-pressure');
		expect(generateDecisions({ ...expansionReady, cash: 0 })).toEqual([]);
		expect(generateDecisions(expansionReady)[0]?.id).toBe('expansion-opportunity');
		expect(generateDecisions({ ...expansionReady, day: 13 })).toEqual([]);
		expect(generateDecisions({ ...expansionReady, cash: 54_999 })).toEqual([]);
		expect(
			generateDecisions({ ...expansionReady, scorecard: { ...base.scorecard, profit: 61 } })
		).toEqual([]);
		expect(generateDecisions({ ...expansionReady, storeCap: base.stores.length })).toEqual([]);
	});

	test('emits at most one strategic decision when cash pressure, expansion, and supplier cadence overlap', () => {
		expect.assertions(2);
		const base = createNewGame('boutique', 33);
		const decisions = generateDecisions({
			...base,
			day: 14,
			cash: -1,
			scorecard: { ...base.scorecard, profit: 62 },
			storeCap: base.stores.length + 1,
			rngState: 1
		});

		expect(decisions).toHaveLength(1);
		expect(decisions[0]?.id).toBe('cash-pressure');
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

	test('keeps exact option order and effects for every strategic decision family', () => {
		expect.assertions(9);
		const cashPressure = generateDecisions({ ...createNewGame('electronics', 33), cash: -500 })[0]!;
		const expansion = generateDecisions({
			...createNewGame('boutique', 33),
			day: 14,
			cash: 55_000,
			scorecard: { profit: 62, customerSatisfaction: 74, staffMorale: 66, marketPosition: 32 },
			storeCap: 2,
			rngState: 1_400_000
		})[0]!;
		const supplier = generateDecisions({
			...createNewGame('convenience', 43),
			rngState: 1
		})[0]!;

		expect(cashPressure.options.map((option) => option.id)).toEqual([
			'short-loan',
			'cut-costs',
			'hold-course'
		]);
		expect(cashPressure.options[0]?.effects.finance).toEqual({
			kind: 'borrow',
			purpose: 'emergency',
			amount: 4_000,
			termDays: 56
		});
		expect(cashPressure.options[1]?.effects).toEqual({
			cash: 5_500,
			customerSatisfaction: -4,
			staffMorale: -5,
			stockHealth: -8
		});
		expect(cashPressure.options[2]?.effects).toEqual({ profit: 1, staffMorale: -2 });
		expect(expansion.options.map((option) => option.id)).toEqual(['prepare', 'pass']);
		expect(expansion.options.map((option) => option.effects)).toEqual([
			{ cash: -3_500, marketPosition: 5, profit: -1 },
			{ profit: 1, staffMorale: 1 }
		]);
		expect(supplier.options.map((option) => option.id)).toEqual([
			'negotiate-credit',
			'bulk-discount'
		]);
		expect(supplier.options[0]?.effects.finance).toEqual({
			kind: 'borrow',
			purpose: 'supplierCredit',
			amount: 4_000,
			termDays: 28
		});
		expect(supplier.options[1]?.effects).toEqual({ cash: -2_500, profit: 3, stockHealth: 6 });
	});

	test('legacy supplier cadence characterization', () => {
		expect.assertions(8);
		for (const [rngState, day, expected] of [
			[1_250_000, 1, true],
			[1_250_000, 14, false],
			[1_400_000, 1, false],
			[1, 1, true]
		] as const) {
			const game = {
				...createNewGame('convenience', 43),
				rngState,
				day,
				cash: 0,
				scorecard: { profit: 0, customerSatisfaction: 0, staffMorale: 0, marketPosition: 0 }
			};

			expect(generateDecisions(game).some((decision) => decision.id === 'supplier-terms')).toBe(
				expected
			);
			expect(createRngFromState(rngState + day * 97).next() < 0.12).toBe(expected);
		}
	});
});
