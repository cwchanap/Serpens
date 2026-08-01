import { describe, expect, it } from 'vitest';

import { PRODUCTION_EVENT_CATALOG } from './eventCatalog';

describe('PRODUCTION_EVENT_CATALOG', () => {
	it('contains only the three approved, versioned production definitions', () => {
		expect(
			PRODUCTION_EVENT_CATALOG.definitions.map(({ id, version }) => ({ id, version }))
		).toEqual([
			{ id: 'cash-pressure', version: 1 },
			{ id: 'expansion-opportunity', version: 1 },
			{ id: 'supplier-terms', version: 2 }
		]);
	});

	it('preserves production eligibility, selection, expiry, and cooldown contracts', () => {
		expect(PRODUCTION_EVENT_CATALOG.byId.get('cash-pressure')).toMatchObject({
			selection: { kind: 'forced', priority: 100 },
			condition: { kind: 'cash-below', amount: 0 },
			expiresAfterDays: 2,
			cooldownDays: 1
		});
		expect(PRODUCTION_EVENT_CATALOG.byId.get('expansion-opportunity')).toMatchObject({
			selection: { kind: 'forced', priority: 50 },
			condition: {
				kind: 'all',
				conditions: [
					{ kind: 'day-at-least', day: 14 },
					{ kind: 'cash-at-least', amount: 55_000 },
					{ kind: 'store-count-below-cap' },
					{ kind: 'score-at-least', score: 'profit', value: 62 }
				]
			},
			expiresAfterDays: 3,
			cooldownDays: 1
		});
		expect(PRODUCTION_EVENT_CATALOG.byId.get('supplier-terms')).toMatchObject({
			selection: { kind: 'weighted', weight: 1 },
			condition: { kind: 'always' },
			expiresAfterDays: 2,
			cooldownDays: 1
		});
	});

	it('preserves current option and immediate-effect order and values', () => {
		const cashPressure = PRODUCTION_EVENT_CATALOG.byId.get('cash-pressure')!;
		const expansion = PRODUCTION_EVENT_CATALOG.byId.get('expansion-opportunity')!;
		const supplier = PRODUCTION_EVENT_CATALOG.byId.get('supplier-terms')!;

		expect(cashPressure.options.map((option) => option.id)).toEqual([
			'short-loan',
			'cut-costs',
			'hold-course'
		]);
		expect(cashPressure.options.map((option) => option.effects)).toEqual([
			[
				{
					kind: 'finance-borrow',
					purpose: 'emergency',
					amount: 'available-credit-clamped',
					termDays: 56
				},
				{ kind: 'score-adjust', score: 'profit', amount: -4 },
				{ kind: 'score-adjust', score: 'marketPosition', amount: -1 }
			],
			[
				{ kind: 'cash-adjust', amount: 5_500 },
				{ kind: 'score-adjust', score: 'customerSatisfaction', amount: -4 },
				{ kind: 'score-adjust', score: 'staffMorale', amount: -5 },
				{ kind: 'store-morale-adjust', scope: 'all-stores', amount: -5 },
				{
					kind: 'store-stock-adjust-by-target-percent',
					scope: 'all-stores',
					percent: -8
				}
			],
			[
				{ kind: 'score-adjust', score: 'profit', amount: 1 },
				{ kind: 'score-adjust', score: 'staffMorale', amount: -2 },
				{ kind: 'store-morale-adjust', scope: 'all-stores', amount: -2 }
			]
		]);
		expect(expansion.options.map((option) => option.effects)).toEqual([
			[
				{ kind: 'cash-adjust', amount: -3_500 },
				{ kind: 'score-adjust', score: 'marketPosition', amount: 5 },
				{ kind: 'score-adjust', score: 'profit', amount: -1 }
			],
			[
				{ kind: 'score-adjust', score: 'profit', amount: 1 },
				{ kind: 'score-adjust', score: 'staffMorale', amount: 1 },
				{ kind: 'store-morale-adjust', scope: 'all-stores', amount: 1 }
			]
		]);
		expect(supplier.options.map((option) => option.effects)).toEqual([
			[
				{
					kind: 'finance-borrow',
					purpose: 'supplierCredit',
					amount: 4_000,
					termDays: 28
				},
				{ kind: 'score-adjust', score: 'profit', amount: -2 }
			],
			[
				{ kind: 'cash-adjust', amount: -2_500 },
				{ kind: 'score-adjust', score: 'profit', amount: 3 },
				{
					kind: 'store-stock-adjust-by-target-percent',
					scope: 'all-stores',
					percent: 6
				}
			]
		]);
	});

	it('adds only the approved supplier bulk-discount modifier payload', () => {
		const bulkDiscount = PRODUCTION_EVENT_CATALOG.byId
			.get('supplier-terms')!
			.options.find((option) => option.id === 'bulk-discount')!;

		expect(bulkDiscount.modifiers).toEqual([
			{
				durationDays: 3,
				stackingKey: 'supplier-bulk-discount:retail-product',
				stackingRule: 'replace',
				effect: {
					kind: 'import-cost-multiplier',
					scope: 'retail-product',
					target: { kind: 'all' },
					multiplier: 0.9
				},
				explanation: { key: 'events.supplierTerms.bulkDiscount.modifier', params: {} },
				importance: 'important'
			}
		]);
	});
});
