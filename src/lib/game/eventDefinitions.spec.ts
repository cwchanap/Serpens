import { describe, expect, it, vi } from 'vitest';

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
	it('uses code-unit ordering for normalized IDs and invalid-ID diagnostics', () => {
		const localeCompare = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
			throw new Error('event catalog ordering must not use host collation');
		});

		try {
			const catalog = validateAndNormalizeEventCatalog([
				definition({ id: 'aa' }),
				definition({ id: 'a-foo' })
			]);
			expect(catalog.definitions.map(({ id }) => id)).toEqual(['a-foo', 'aa']);

			const diagnostics = diagnosticsFor([
				definition({ id: 'ä-event' }),
				definition({ id: 'z bad' })
			]);
			expect(diagnostics.map(({ eventId }) => eventId)).toEqual(['z bad', 'ä-event']);
		} finally {
			localeCompare.mockRestore();
		}
	});

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

	it('rejects a modifier template with a missing effect instead of dereferencing it', () => {
		const diagnostics = diagnosticsFor([
			definition({
				id: 'missing-effect',
				options: [
					{
						id: 'accept',
						effects: [],
						modifiers: [
							{
								durationDays: 1,
								stackingKey: 'missing:retail-product',
								stackingRule: 'replace',
								effect: undefined as never,
								explanation: { key: 'events.missing', params: {} },
								importance: 'normal'
							}
						]
					}
				]
			})
		]);

		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'missing-effect:options[0].modifiers[0].effect'
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
		const mutableLookup = catalog.byId as unknown as Map<string, EventDefinition>;
		expect(() => mutableLookup.set('alpha', catalog.definitions[1])).toThrow(TypeError);
		expect(catalog.byId.get('alpha')).toBe(catalog.definitions[0]);
		catalog.byId.forEach((_definition, _id, readonlyLookup) => {
			expect(readonlyLookup).toBe(catalog.byId);
			expect(() => {
				(readonlyLookup as unknown as Map<string, EventDefinition>).set(
					'alpha',
					catalog.definitions[1]
				);
			}).toThrow(TypeError);
		});
	});

	it('exposes the readonly lookup size getter', () => {
		const catalog = validateAndNormalizeEventCatalog([
			definition({ id: 'alpha' }),
			definition({ id: 'beta' })
		]);
		expect(catalog.byId.size).toBe(2);
		expect(catalog.byId.has('alpha')).toBe(true);
		expect([...catalog.byId.keys()]).toEqual(['alpha', 'beta']);
		expect([...catalog.byId.values()].map((d) => d.id)).toEqual(['alpha', 'beta']);
		expect([...catalog.byId.entries()].map(([k]) => k)).toEqual(['alpha', 'beta']);
		expect([...catalog.byId].map(([k]) => k)).toEqual(['alpha', 'beta']);
	});

	it('rejects non-company targets and empty option lists', () => {
		const diagnostics = diagnosticsFor([
			definition({ id: 'bad-target', target: { kind: 'store' as never } }),
			definition({ id: 'no-options', options: [] })
		]);
		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'bad-target:target',
			'no-options:options'
		]);
	});

	it('rejects invalid option ID format', () => {
		const diagnostics = diagnosticsFor([
			definition({ id: 'bad-option-id', options: [{ id: 'Bad ID', effects: [], modifiers: [] }] })
		]);
		expect(diagnostics.map(({ path }) => path)).toContain('options[0].id');
	});

	it('rejects unsupported score keys in conditions and score-adjust effects', () => {
		const diagnostics = diagnosticsFor([
			definition({
				id: 'bad-score-condition',
				condition: { kind: 'score-at-least', score: 'invalid' as never, value: 50 }
			}),
			definition({
				id: 'bad-score-effect',
				options: [
					{
						id: 'accept',
						effects: [{ kind: 'score-adjust', score: 'invalid' as never, amount: 1 }],
						modifiers: []
					}
				]
			})
		]);
		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'bad-score-condition:condition.score',
			'bad-score-effect:options[0].effects[0].score'
		]);
	});

	it('rejects store-morale and store-stock effects with wrong scope', () => {
		const diagnostics = diagnosticsFor([
			definition({
				id: 'bad-morale-scope',
				options: [
					{
						id: 'accept',
						effects: [{ kind: 'store-morale-adjust', scope: 'single-store' as never, amount: 1 }],
						modifiers: []
					}
				]
			}),
			definition({
				id: 'bad-stock-scope',
				options: [
					{
						id: 'accept',
						effects: [
							{
								kind: 'store-stock-adjust-by-target-percent',
								scope: 'single-store' as never,
								percent: 10
							}
						],
						modifiers: []
					}
				]
			})
		]);
		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'bad-morale-scope:options[0].effects[0].scope',
			'bad-stock-scope:options[0].effects[0].scope'
		]);
	});

	it('rejects finance-borrow effects with invalid amount, purpose, and term', () => {
		const diagnostics = diagnosticsFor([
			definition({
				id: 'bad-finance-amount',
				options: [
					{
						id: 'accept',
						effects: [{ kind: 'finance-borrow', purpose: 'emergency', amount: 0, termDays: 56 }],
						modifiers: []
					}
				]
			}),
			definition({
				id: 'bad-finance-amount-type',
				options: [
					{
						id: 'accept',
						effects: [
							{
								kind: 'finance-borrow',
								purpose: 'emergency',
								amount: 'invalid' as never,
								termDays: 56
							}
						],
						modifiers: []
					}
				]
			}),
			definition({
				id: 'bad-finance-purpose',
				options: [
					{
						id: 'accept',
						effects: [
							{ kind: 'finance-borrow', purpose: 'invalid' as never, amount: 100, termDays: 28 }
						],
						modifiers: []
					}
				]
			}),
			definition({
				id: 'bad-finance-term',
				options: [
					{
						id: 'accept',
						effects: [
							{ kind: 'finance-borrow', purpose: 'emergency', amount: 100, termDays: 14 as never }
						],
						modifiers: []
					}
				]
			}),
			definition({
				id: 'bad-finance-fractional-amount',
				options: [
					{
						id: 'accept',
						effects: [
							{ kind: 'finance-borrow', purpose: 'emergency', amount: 4_000.5, termDays: 56 }
						],
						modifiers: []
					}
				]
			}),
			definition({
				id: 'bad-finance-pairing-emergency',
				options: [
					{
						id: 'accept',
						effects: [
							{ kind: 'finance-borrow', purpose: 'emergency', amount: 4_000, termDays: 28 }
						],
						modifiers: []
					}
				]
			}),
			definition({
				id: 'bad-finance-pairing-supplier-credit',
				options: [
					{
						id: 'accept',
						effects: [
							{ kind: 'finance-borrow', purpose: 'supplierCredit', amount: 4_000, termDays: 56 }
						],
						modifiers: []
					}
				]
			})
		]);
		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'bad-finance-amount:options[0].effects[0].amount',
			'bad-finance-amount-type:options[0].effects[0].amount',
			'bad-finance-fractional-amount:options[0].effects[0].amount',
			'bad-finance-pairing-emergency:options[0].effects[0].termDays',
			'bad-finance-pairing-supplier-credit:options[0].effects[0].termDays',
			'bad-finance-purpose:options[0].effects[0].purpose',
			'bad-finance-term:options[0].effects[0].termDays'
		]);
	});

	it('rejects modifier templates with wrong effect kind, scope, target, and importance', () => {
		const baseModifier = {
			durationDays: 1,
			stackingKey: 'key:retail-product',
			stackingRule: 'replace' as const,
			effect: {
				kind: 'import-cost-multiplier' as const,
				scope: 'retail-product' as const,
				target: { kind: 'all' as const },
				multiplier: 0.9
			},
			explanation: { key: 'events.modifier', params: {} },
			importance: 'normal' as const
		};
		const diagnostics = diagnosticsFor([
			definition({
				id: 'bad-mod-kind',
				options: [
					{
						id: 'accept',
						effects: [],
						modifiers: [
							{
								...baseModifier,
								effect: { ...baseModifier.effect, kind: 'wrong' as never }
							}
						]
					}
				]
			}),
			definition({
				id: 'bad-mod-scope',
				options: [
					{
						id: 'accept',
						effects: [],
						modifiers: [
							{
								...baseModifier,
								effect: { ...baseModifier.effect, scope: 'wrong' as never }
							}
						]
					}
				]
			}),
			definition({
				id: 'bad-mod-target',
				options: [
					{
						id: 'accept',
						effects: [],
						modifiers: [
							{
								...baseModifier,
								effect: { ...baseModifier.effect, target: { kind: 'single' as never } }
							}
						]
					}
				]
			}),
			definition({
				id: 'bad-mod-importance',
				options: [
					{
						id: 'accept',
						effects: [],
						modifiers: [{ ...baseModifier, importance: 'critical' as never }]
					}
				]
			})
		]);
		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'bad-mod-importance:options[0].modifiers[0].importance',
			'bad-mod-kind:options[0].modifiers[0].effect.kind',
			'bad-mod-scope:options[0].modifiers[0].effect.scope',
			'bad-mod-target:options[0].modifiers[0].effect.target'
		]);
	});

	it('rejects copy refs with empty keys and invalid param values', () => {
		const diagnostics = diagnosticsFor([
			definition({ id: 'empty-key', copy: { key: '', params: {} } }),
			definition({
				id: 'bad-param',
				copy: { key: 'events.test', params: { foo: null as never } }
			})
		]);
		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'bad-param:copy.params.foo',
			'empty-key:copy.key'
		]);
	});

	it('reports <invalid-id> for a non-string event id', () => {
		const diagnostics = diagnosticsFor([definition({ id: 42 as never })]);
		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'<invalid-id>:id'
		]);
	});

	it('flattens nested all conditions for cash-bounds contradiction checks', () => {
		const diagnostics = diagnosticsFor([
			definition({
				id: 'nested-contradiction',
				condition: {
					kind: 'all',
					conditions: [
						{ kind: 'all', conditions: [{ kind: 'cash-at-least', amount: 500 }] },
						{ kind: 'cash-below', amount: 400 }
					]
				}
			})
		]);
		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'nested-contradiction:condition'
		]);
	});

	it('accepts finite number copy params and rejects non-finite number params', () => {
		const diagnostics = diagnosticsFor([
			definition({
				id: 'finite-number-param',
				copy: { key: 'events.test', params: { count: 42 } }
			}),
			definition({
				id: 'non-finite-number-param',
				copy: { key: 'events.test', params: { count: Infinity as never } }
			})
		]);
		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'non-finite-number-param:copy.params.count'
		]);
	});

	it('accepts a competitor target and clones competitor event payloads deeply', () => {
		const focus = ['beverages', 'grocery-food'] as const;
		const authored = definition({
			id: 'competitor-event',
			target: { kind: 'competitor', status: 'active' },
			options: [
				{
					id: 'respond',
					effects: [
						{ kind: 'competitor-status-set', status: 'closed' },
						{ kind: 'competitor-price-posture-set', pricePosture: 'premium' },
						{ kind: 'competitor-product-focus-set', productFocus: [...focus] }
					],
					modifiers: [
						{
							durationDays: 3,
							stackingKey: 'competitor:event',
							stackingRule: 'replace',
							effect: { kind: 'competitor-attraction-multiplier', multiplier: 1.18 },
							explanation: { key: 'events.competitor.modifier', params: {} },
							importance: 'important'
						}
					]
				}
			]
		});

		const catalog = validateAndNormalizeEventCatalog([authored]);
		const normalized = catalog.byId.get('competitor-event')!;

		expect(normalized.target).toEqual({ kind: 'competitor', status: 'active' });
		expect(normalized.options[0]?.effects[2]).toEqual({
			kind: 'competitor-product-focus-set',
			productFocus: focus
		});
		expect(normalized.options[0]?.effects[2]).not.toBe(authored.options[0]?.effects[2]);
		expect((normalized.options[0]?.effects[2] as { productFocus: unknown }).productFocus).not.toBe(
			(authored.options[0]?.effects[2] as { productFocus: unknown }).productFocus
		);
		expect(normalized.options[0]?.modifiers[0]?.effect).toEqual({
			kind: 'competitor-attraction-multiplier',
			multiplier: 1.18
		});
	});

	it('rejects competitor effects and modifiers with the wrong target or malformed values', () => {
		const diagnostics = diagnosticsFor([
			definition({
				id: 'wrong-competitor-effect-target',
				options: [
					{
						id: 'accept',
						effects: [{ kind: 'competitor-status-set', status: 'closed' }],
						modifiers: []
					}
				]
			}),
			definition({
				id: 'bad-competitor-effect',
				target: { kind: 'competitor', status: 'active' },
				options: [
					{
						id: 'accept',
						effects: [
							{ kind: 'competitor-price-posture-set', pricePosture: 'aggressive' as never },
							{
								kind: 'competitor-product-focus-set',
								productFocus: ['beverages', 'beverages']
							}
						],
						modifiers: [
							{
								durationDays: 3,
								stackingKey: 'competitor:event',
								stackingRule: 'replace',
								effect: { kind: 'competitor-attraction-multiplier', multiplier: 0 },
								explanation: { key: 'events.competitor.modifier', params: {} },
								importance: 'important'
							}
						]
					}
				]
			})
		]);

		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'bad-competitor-effect:options[0].effects[0].pricePosture',
			'bad-competitor-effect:options[0].effects[1].productFocus',
			'bad-competitor-effect:options[0].modifiers[0].effect.multiplier',
			'wrong-competitor-effect-target:options[0].effects[0].kind'
		]);
	});
});
