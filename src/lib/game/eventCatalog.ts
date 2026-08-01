import { validateAndNormalizeEventCatalog, type EventDefinition } from './eventDefinitions';

const PRODUCTION_EVENT_DEFINITIONS = [
	{
		id: 'cash-pressure',
		version: 1,
		selection: { kind: 'forced', priority: 100 },
		condition: { kind: 'cash-below', amount: 0 },
		target: { kind: 'company' },
		expiresAfterDays: 2,
		cooldownDays: 1,
		copy: { key: 'events.cashPressure', params: {} },
		options: [
			{
				id: 'short-loan',
				effects: [
					{
						kind: 'finance-borrow',
						purpose: 'emergency',
						amount: 'available-credit-clamped',
						termDays: 56
					},
					{ kind: 'score-adjust', score: 'profit', amount: -4 },
					{ kind: 'score-adjust', score: 'marketPosition', amount: -1 }
				],
				modifiers: []
			},
			{
				id: 'cut-costs',
				effects: [
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
				modifiers: []
			},
			{
				id: 'hold-course',
				effects: [
					{ kind: 'score-adjust', score: 'profit', amount: 1 },
					{ kind: 'score-adjust', score: 'staffMorale', amount: -2 },
					{ kind: 'store-morale-adjust', scope: 'all-stores', amount: -2 }
				],
				modifiers: []
			}
		]
	},
	{
		id: 'expansion-opportunity',
		version: 1,
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
		target: { kind: 'company' },
		expiresAfterDays: 3,
		cooldownDays: 1,
		copy: { key: 'events.expansionOpportunity', params: {} },
		options: [
			{
				id: 'prepare',
				effects: [
					{ kind: 'cash-adjust', amount: -3_500 },
					{ kind: 'score-adjust', score: 'marketPosition', amount: 5 },
					{ kind: 'score-adjust', score: 'profit', amount: -1 }
				],
				modifiers: []
			},
			{
				id: 'pass',
				effects: [
					{ kind: 'score-adjust', score: 'profit', amount: 1 },
					{ kind: 'score-adjust', score: 'staffMorale', amount: 1 },
					{ kind: 'store-morale-adjust', scope: 'all-stores', amount: 1 }
				],
				modifiers: []
			}
		]
	},
	{
		id: 'supplier-terms',
		version: 2,
		selection: { kind: 'weighted', weight: 1 },
		condition: { kind: 'always' },
		target: { kind: 'company' },
		expiresAfterDays: 2,
		cooldownDays: 1,
		copy: { key: 'events.supplierTerms', params: {} },
		options: [
			{
				id: 'negotiate-credit',
				effects: [
					{
						kind: 'finance-borrow',
						purpose: 'supplierCredit',
						amount: 4_000,
						termDays: 28
					},
					{ kind: 'score-adjust', score: 'profit', amount: -2 }
				],
				modifiers: []
			},
			{
				id: 'bulk-discount',
				effects: [
					{ kind: 'cash-adjust', amount: -2_500 },
					{ kind: 'score-adjust', score: 'profit', amount: 3 },
					{
						kind: 'store-stock-adjust-by-target-percent',
						scope: 'all-stores',
						percent: 6
					}
				],
				modifiers: [
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
				]
			}
		]
	}
] as const satisfies readonly EventDefinition[];

export const PRODUCTION_EVENT_CATALOG = validateAndNormalizeEventCatalog(
	PRODUCTION_EVENT_DEFINITIONS
);
