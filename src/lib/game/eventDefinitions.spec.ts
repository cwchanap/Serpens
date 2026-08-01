import { describe, expect, it } from 'vitest';

import {
	EventCatalogValidationError,
	validateAndNormalizeEventCatalog,
	type EventDefinition
} from './eventDefinitions';

function definition(overrides: Partial<EventDefinition> = {}): EventDefinition {
	return {
		id: 'valid-event',
		version: 1,
		selection: { kind: 'weighted', weight: 1 },
		condition: { kind: 'always' },
		target: { kind: 'company' },
		expiresAfterDays: 2,
		cooldownDays: 1,
		copy: { key: 'events.valid', params: {} },
		options: [
			{
				id: 'accept',
				effects: [{ kind: 'cash-adjust', amount: 50 }],
				modifiers: []
			}
		],
		...overrides
	};
}

function diagnosticsFor(definitions: readonly EventDefinition[]) {
	try {
		validateAndNormalizeEventCatalog(definitions);
		throw new Error('Expected validation to fail.');
	} catch (error) {
		expect(error).toBeInstanceOf(EventCatalogValidationError);
		return (error as EventCatalogValidationError).diagnostics;
	}
}

describe('validateAndNormalizeEventCatalog', () => {
	it('rejects invalid and duplicate IDs with deterministic event/path diagnostics', () => {
		const diagnostics = diagnosticsFor([
			definition({ id: 'z bad' }),
			definition({ id: 'alpha' }),
			definition({ id: 'alpha' })
		]);

		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'alpha:id',
			'z bad:id'
		]);
	});

	it('rejects non-positive definition lifecycle values and invalid selection numbers', () => {
		const diagnostics = diagnosticsFor([
			definition({
				id: 'bad-lifecycle',
				version: 0,
				expiresAfterDays: 0,
				cooldownDays: -1,
				selection: { kind: 'weighted', weight: Number.NaN }
			}),
			definition({
				id: 'bad-priority',
				selection: { kind: 'forced', priority: Number.POSITIVE_INFINITY }
			})
		]);

		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'bad-lifecycle:cooldownDays',
			'bad-lifecycle:expiresAfterDays',
			'bad-lifecycle:selection.weight',
			'bad-lifecycle:version',
			'bad-priority:selection.priority'
		]);
	});

	it('rejects duplicate option IDs, empty all conditions, and non-finite condition values', () => {
		const diagnostics = diagnosticsFor([
			definition({
				id: 'bad-options',
				condition: { kind: 'all', conditions: [] },
				options: [
					{ id: 'same', effects: [], modifiers: [] },
					{ id: 'same', effects: [], modifiers: [] }
				]
			}),
			definition({
				id: 'bad-condition',
				condition: { kind: 'cash-below', amount: Number.NaN }
			})
		]);

		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'bad-condition:condition.amount',
			'bad-options:condition.conditions',
			'bad-options:options[1].id'
		]);
	});

	it('rejects only the supported bounded contradictions', () => {
		const diagnostics = diagnosticsFor([
			definition({
				id: 'cash-contradiction',
				condition: {
					kind: 'all',
					conditions: [
						{ kind: 'cash-below', amount: 1_000 },
						{ kind: 'cash-at-least', amount: 1_000 }
					]
				}
			}),
			definition({
				id: 'score-out-of-range',
				condition: { kind: 'score-at-least', score: 'profit', value: 101 }
			})
		]);

		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'cash-contradiction:condition',
			'score-out-of-range:condition.value'
		]);
	});

	it('rejects invalid immediate effects and incompatible cash and finance effects', () => {
		const diagnostics = diagnosticsFor([
			definition({
				id: 'bad-effects',
				options: [
					{
						id: 'accept',
						effects: [
							{ kind: 'cash-adjust', amount: Number.NaN },
							{
								kind: 'finance-borrow',
								purpose: 'emergency',
								amount: 1_000,
								termDays: 56
							},
							{
								kind: 'finance-borrow',
								purpose: 'supplierCredit',
								amount: 2_000,
								termDays: 28
							}
						],
						modifiers: []
					}
				]
			})
		]);

		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'bad-effects:options[0].effects',
			'bad-effects:options[0].effects[0].amount',
			'bad-effects:options[0].effects[2]'
		]);
	});

	it('accepts available-credit-clamped finance authoring for later materialization', () => {
		const catalog = validateAndNormalizeEventCatalog([
			definition({
				options: [
					{
						id: 'borrow',
						effects: [
							{
								kind: 'finance-borrow',
								purpose: 'emergency',
								amount: 'available-credit-clamped',
								termDays: 56
							}
						],
						modifiers: []
					}
				]
			})
		]);

		expect(catalog.byId.get('valid-event')?.options[0].effects[0]).toMatchObject({
			amount: 'available-credit-clamped'
		});
	});

	it('rejects malformed modifier templates', () => {
		const diagnostics = diagnosticsFor([
			definition({
				id: 'bad-modifier',
				options: [
					{
						id: 'accept',
						effects: [],
						modifiers: [
							{
								durationDays: 0,
								stackingKey: '',
								stackingRule: 'stack' as never,
								effect: {
									kind: 'import-cost-multiplier',
									scope: 'retail-product',
									target: { kind: 'all' },
									multiplier: 0
								},
								explanation: { key: 'events.bad', params: {} },
								importance: 'important'
							}
						]
					}
				]
			})
		]);

		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'bad-modifier:options[0].modifiers[0].durationDays',
			'bad-modifier:options[0].modifiers[0].effect.multiplier',
			'bad-modifier:options[0].modifiers[0].stackingKey',
			'bad-modifier:options[0].modifiers[0].stackingRule'
		]);
	});

	it('sorts definitions but preserves authored option, effect, and modifier order in a frozen lookup', () => {
		const catalog = validateAndNormalizeEventCatalog([
			definition({ id: 'zeta' }),
			definition({
				id: 'alpha',
				options: [
					{
						id: 'first',
						effects: [
							{ kind: 'score-adjust', score: 'profit', amount: 1 },
							{ kind: 'cash-adjust', amount: 2 }
						],
						modifiers: [
							{
								durationDays: 1,
								stackingKey: 'first:retail-product',
								stackingRule: 'replace',
								effect: {
									kind: 'import-cost-multiplier',
									scope: 'retail-product',
									target: { kind: 'all' },
									multiplier: 0.9
								},
								explanation: { key: 'events.first', params: {} },
								importance: 'normal'
							}
						]
					},
					{ id: 'second', effects: [], modifiers: [] }
				]
			})
		]);

		expect(catalog.definitions.map((candidate) => candidate.id)).toEqual(['alpha', 'zeta']);
		expect(catalog.byId.get('alpha')?.options.map((option) => option.id)).toEqual([
			'first',
			'second'
		]);
		expect(catalog.byId.get('alpha')?.options[0].effects.map((effect) => effect.kind)).toEqual([
			'score-adjust',
			'cash-adjust'
		]);
		expect(Object.isFrozen(catalog)).toBe(true);
		expect(Object.isFrozen(catalog.definitions)).toBe(true);
		expect(Object.isFrozen(catalog.definitions[0])).toBe(true);
	});
});
