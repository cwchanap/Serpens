import { describe, expect, expectTypeOf, it } from 'vitest';

import { PRODUCTION_EVENT_CATALOG } from './eventCatalog';
import {
	EventCatalogValidationError,
	validateAndNormalizeEventCatalog,
	type EventDefinition
} from './eventDefinitions';
import type {
	EventCondition,
	EventImmediateEffect,
	EventModifierTemplate,
	EventTarget,
	EventTargetSelector,
	EventTimedEffect
} from './types';

function definition(overrides: Partial<EventDefinition> = {}): EventDefinition {
	return {
		id: 'route-event',
		version: 1,
		selection: { kind: 'forced', priority: 1 },
		condition: { kind: 'always' },
		target: { kind: 'company' },
		expiresAfterDays: 2,
		cooldownDays: 1,
		copy: { key: 'events.route', params: {} },
		options: [{ id: 'accept', effects: [], modifiers: [] }],
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

	it('exports no deferred event-framework union variants', () => {
		expectTypeOf<Extract<EventCondition, { kind: 'not' }>>().toEqualTypeOf<never>();
		expectTypeOf<
			Extract<EventImmediateEffect, { kind: 'store-reputation-adjust' }>
		>().toEqualTypeOf<never>();
		expectTypeOf<Extract<EventTimedEffect, { kind: 'logistics-route' }>>().toEqualTypeOf<never>();
		expectTypeOf<
			Extract<EventModifierTemplate, { stackingRule: 'stack' }>
		>().toEqualTypeOf<never>();
		expectTypeOf<Extract<EventTarget, { kind: 'store' }>>().toEqualTypeOf<never>();
		expect(PRODUCTION_EVENT_CATALOG.definitions).toHaveLength(3);
	});

	it('exposes only the company and active recurring-route target variants', () => {
		expectTypeOf<Extract<EventTarget, { kind: 'recurring-route' }>>().toEqualTypeOf<{
			kind: 'recurring-route';
			routeId: string;
		}>();
		expectTypeOf<Extract<EventTargetSelector, { kind: 'recurring-route' }>>().toEqualTypeOf<{
			kind: 'recurring-route';
			state: 'active';
		}>();
		expect(PRODUCTION_EVENT_CATALOG.definitions.map((definition) => definition.target)).toEqual([
			{ kind: 'company' },
			{ kind: 'company' },
			{ kind: 'company' }
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
		expect(expansion.options.map((option) => option.id)).toEqual(['prepare', 'pass']);
		expect(supplier.options.map((option) => option.id)).toEqual([
			'negotiate-credit',
			'bulk-discount'
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
		expect(cashPressure.options.map((option) => option.modifiers)).toEqual([[], [], []]);
		expect(expansion.options.map((option) => option.modifiers)).toEqual([[], []]);
		expect(supplier.options.map((option) => option.modifiers)).toEqual([
			[],
			supplier.options[1].modifiers
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

function routeTimedEffect(
	kind:
		| 'route-lead-time-adjustment'
		| 'route-capacity-multiplier'
		| 'route-transport-cost-multiplier',
	value: number
): EventTimedEffect {
	if (kind === 'route-lead-time-adjustment') {
		return { kind, days: value };
	}
	return { kind, multiplier: value };
}

function routeEffectModifier(
	overrides: Partial<EventModifierTemplate> = {}
): EventModifierTemplate {
	return {
		durationDays: 2,
		stackingKey: 'route-disruption:route',
		stackingRule: 'replace',
		effect: { kind: 'route-dispatch-suspension' },
		explanation: { key: 'events.route.suspension', params: {} },
		importance: 'normal',
		...overrides
	};
}

describe('route timed effect validation', () => {
	it('accepts each of the four route effects on a recurring-route definition', () => {
		const effects: EventTimedEffect[] = [
			{ kind: 'route-lead-time-adjustment', days: 2 },
			{ kind: 'route-capacity-multiplier', multiplier: 0.75 },
			{ kind: 'route-dispatch-suspension' },
			{ kind: 'route-transport-cost-multiplier', multiplier: 1.25 }
		];
		for (const effect of effects) {
			expect(() =>
				validateAndNormalizeEventCatalog([
					definition({
						id: 'route-effect-event',
						target: { kind: 'recurring-route', state: 'active' },
						options: [
							{
								id: 'accept',
								effects: [],
								modifiers: [routeEffectModifier({ effect })]
							}
						]
					})
				])
			).not.toThrow();
		}
	});

	it('keeps the suspension variant payload-free in the closed union', () => {
		expectTypeOf<Extract<EventTimedEffect, { kind: 'route-dispatch-suspension' }>>().toEqualTypeOf<{
			kind: 'route-dispatch-suspension';
		}>();
		expect({ kind: 'route-dispatch-suspension' } satisfies EventTimedEffect).toEqual({
			kind: 'route-dispatch-suspension'
		});
	});

	it('rejects non-positive safe lead-time day adjustments', () => {
		for (const days of [0, -1, 1.5, Number.NaN]) {
			const diagnostics = diagnosticsFor([
				definition({
					id: 'bad-lead-time',
					target: { kind: 'recurring-route', state: 'active' },
					options: [
						{
							id: 'accept',
							effects: [],
							modifiers: [
								routeEffectModifier({
									effect: { kind: 'route-lead-time-adjustment', days }
								})
							]
						}
					]
				})
			]);
			expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
				'bad-lead-time:options[0].modifiers[0].effect.days'
			]);
		}
	});

	it('rejects non-positive and non-finite route multipliers', () => {
		for (const kind of ['route-capacity-multiplier', 'route-transport-cost-multiplier'] as const) {
			for (const multiplier of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
				const diagnostics = diagnosticsFor([
					definition({
						id: 'bad-route-multiplier',
						target: { kind: 'recurring-route', state: 'active' },
						options: [
							{
								id: 'accept',
								effects: [],
								modifiers: [
									routeEffectModifier({
										effect: routeTimedEffect(kind, multiplier)
									})
								]
							}
						]
					})
				]);
				expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
					'bad-route-multiplier:options[0].modifiers[0].effect.multiplier'
				]);
			}
		}
	});

	it('rejects import-cost modifiers on recurring-route definitions', () => {
		const diagnostics = diagnosticsFor([
			definition({
				id: 'bad-route-import-cost',
				target: { kind: 'recurring-route', state: 'active' },
				options: [
					{
						id: 'accept',
						effects: [],
						modifiers: [
							routeEffectModifier({
								effect: {
									kind: 'import-cost-multiplier',
									scope: 'retail-product',
									target: { kind: 'all' },
									multiplier: 0.9
								}
							})
						]
					}
				]
			})
		]);
		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'bad-route-import-cost:options[0].modifiers[0].effect.kind'
		]);
	});

	it('rejects route effects on company definitions', () => {
		const diagnostics = diagnosticsFor([
			definition({
				id: 'bad-company-route-effect',
				target: { kind: 'company' },
				options: [
					{
						id: 'accept',
						effects: [],
						modifiers: [routeEffectModifier()]
					}
				]
			})
		]);
		expect(diagnostics.map(({ eventId, path }) => `${eventId}:${path}`)).toEqual([
			'bad-company-route-effect:options[0].modifiers[0].effect.kind'
		]);
	});
});

describe('recurring-route selector validation', () => {
	it('accepts company and active recurring-route selectors', () => {
		expect(() =>
			validateAndNormalizeEventCatalog([
				definition({ id: 'company-event', target: { kind: 'company' } }),
				definition({ id: 'route-event', target: { kind: 'recurring-route', state: 'active' } })
			])
		).not.toThrow();
	});

	it('rejects every other selector shape', () => {
		const expectRejected = (target: unknown) =>
			expect(() =>
				validateAndNormalizeEventCatalog([definition({ target: target as never })])
			).toThrow(EventCatalogValidationError);

		expectRejected({ kind: 'recurring-route', state: 'paused' });
		expectRejected({ kind: 'recurring-route' });
		expectRejected({ kind: 'store' });
	});

	it('clones accepted selectors into the normalized catalog', () => {
		const catalog = validateAndNormalizeEventCatalog([
			definition({ id: 'route-event', target: { kind: 'recurring-route', state: 'active' } })
		]);
		expect(catalog.byId.get('route-event')?.target).toEqual({
			kind: 'recurring-route',
			state: 'active'
		});
		expect(Object.isFrozen(catalog.byId.get('route-event'))).toBe(true);
	});
});
