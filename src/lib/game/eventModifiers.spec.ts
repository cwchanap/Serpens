import { describe, expect, it } from 'vitest';
import { createInitialEventRuntime } from './eventSelection';
import {
	activateEventModifiers,
	cloneTimedEffect,
	expireModifiersAfterDay,
	isModifierActiveOnDay
} from './eventModifiers';
import type { EventModifierTemplate } from './types';

function bulkDiscount(overrides: Partial<EventModifierTemplate> = {}): EventModifierTemplate {
	return {
		durationDays: 3,
		stackingKey: 'supplier-bulk-discount:retail-product',
		stackingRule: 'replace',
		effect: {
			kind: 'import-cost-multiplier',
			scope: 'retail-product',
			target: { kind: 'all' },
			multiplier: 0.9
		},
		explanation: { key: 'events.supplier.bulkDiscount', params: { percent: 10 } },
		importance: 'important',
		...overrides
	};
}

const source = {
	eventId: 'supplier-terms',
	instanceId: 'event-instance-1',
	optionId: 'accept'
};

const companyTarget = { kind: 'company' as const };

function routeSuspension(overrides: Partial<EventModifierTemplate> = {}): EventModifierTemplate {
	return {
		durationDays: 3,
		stackingKey: 'route-disruption:route',
		stackingRule: 'replace',
		effect: { kind: 'route-dispatch-suspension' },
		explanation: { key: 'events.routeDisruption.suspension', params: {} },
		importance: 'important',
		...overrides
	};
}

describe('event modifier lifecycle', () => {
	it('activates bulk discount templates in order with allocated ids and copied lifecycle snapshots', () => {
		const state = createInitialEventRuntime(42);
		const template = bulkDiscount();
		const result = activateEventModifiers(state, source, companyTarget, 5, [template]);

		expect(result.state.nextModifierSequence).toBe(2);
		expect(result.activated).toEqual([
			expect.objectContaining({
				id: 'event-modifier-1',
				startsOnDay: 5,
				expiresOnDay: 8,
				stackingKey: 'supplier-bulk-discount:retail-product',
				source
			})
		]);
		expect(result.lifecycle).toEqual([
			expect.objectContaining({
				kind: 'modifier-lifecycle',
				day: 5,
				status: 'activated',
				modifier: expect.objectContaining({ id: 'event-modifier-1' })
			})
		]);
		expect(result.lifecycle[0]?.modifier).not.toBe(result.state.activeModifiers[0]);

		if (template.effect.kind !== 'import-cost-multiplier') {
			throw new Error('expected an import-cost template effect');
		}
		template.effect.multiplier = 0.5;
		(template.explanation.params as Record<string, string | number>).percent = 50;
		const storedEffect = result.state.activeModifiers[0]?.effect;
		if (storedEffect?.kind !== 'import-cost-multiplier') {
			throw new Error('expected a stored import-cost modifier effect');
		}
		expect(storedEffect.multiplier).toBe(0.9);
		expect(result.lifecycle[0]?.modifier.explanation.params).toEqual({ percent: 10 });
	});

	it('replaces matching keys before activation while retaining unrelated modifiers', () => {
		const first = activateEventModifiers(createInitialEventRuntime(42), source, companyTarget, 5, [
			bulkDiscount()
		]);
		const other = bulkDiscount({
			stackingKey: 'other:retail-product',
			explanation: { key: 'events.other', params: {} }
		});
		const withOther = activateEventModifiers(first.state, source, companyTarget, 5, [other]);
		const result = activateEventModifiers(
			withOther.state,
			{ ...source, instanceId: 'event-instance-2' },
			companyTarget,
			6,
			[bulkDiscount()]
		);

		expect(result.state.activeModifiers.map((modifier) => modifier.id)).toEqual([
			'event-modifier-2',
			'event-modifier-3'
		]);
		expect(result.state.activeModifiers.map((modifier) => modifier.stackingKey)).toEqual([
			'other:retail-product',
			'supplier-bulk-discount:retail-product'
		]);
		expect(result.lifecycle).toEqual([
			expect.objectContaining({
				status: 'replaced',
				modifier: expect.objectContaining({ id: 'event-modifier-1' }),
				replacedByModifierId: 'event-modifier-3'
			}),
			expect.objectContaining({
				status: 'activated',
				modifier: expect.objectContaining({ id: 'event-modifier-3' })
			})
		]);
		expect(result.state.nextModifierSequence).toBe(4);
	});

	it('keeps modifiers active through their final day and expires them exclusively afterward', () => {
		const activated = activateEventModifiers(
			createInitialEventRuntime(42),
			source,
			companyTarget,
			5,
			[bulkDiscount()]
		);
		const modifier = activated.state.activeModifiers[0]!;

		expect(isModifierActiveOnDay(modifier, 4)).toBe(false);
		expect(isModifierActiveOnDay(modifier, 5)).toBe(true);
		expect(isModifierActiveOnDay(modifier, 6)).toBe(true);
		expect(isModifierActiveOnDay(modifier, 7)).toBe(true);
		expect(isModifierActiveOnDay(modifier, 8)).toBe(false);
		expect(expireModifiersAfterDay(activated.state, 6).expired).toEqual([]);

		const expired = expireModifiersAfterDay(activated.state, 7);
		expect(expired.state.activeModifiers).toEqual([]);
		expect(expired.expired).toEqual([expect.objectContaining({ id: 'event-modifier-1' })]);
		expect(expired.state.history.at(-1)).toEqual(
			expect.objectContaining({
				kind: 'modifier-lifecycle',
				day: 7,
				status: 'expired',
				modifier: expect.objectContaining({ id: 'event-modifier-1' })
			})
		);
		const expiryLifecycle = expired.state.history.at(-1);
		if (expiryLifecycle?.kind !== 'modifier-lifecycle')
			throw new Error('expected expiry lifecycle');
		expect(expiryLifecycle.modifier).not.toBe(expired.expired[0]);
	});

	it('stores the concrete target and a payload-free route effect on activated route modifiers', () => {
		const state = createInitialEventRuntime(42);
		const result = activateEventModifiers(
			state,
			source,
			{ kind: 'recurring-route', routeId: 'route-1' },
			5,
			[routeSuspension()]
		);

		expect(result.state.activeModifiers[0]).toMatchObject({
			id: 'event-modifier-1',
			target: { kind: 'recurring-route', routeId: 'route-1' },
			effect: { kind: 'route-dispatch-suspension' }
		});
		expect(result.state.activeModifiers[0]?.effect).not.toHaveProperty('target');
		expect(result.lifecycle[0]?.modifier.effect).toEqual({ kind: 'route-dispatch-suspension' });
	});

	it('lets the same stacking key coexist on different route targets and replaces only its own target', () => {
		const routeOneTarget = { kind: 'recurring-route' as const, routeId: 'route-1' };
		const routeTwoTarget = { kind: 'recurring-route' as const, routeId: 'route-2' };
		const first = activateEventModifiers(createInitialEventRuntime(42), source, routeOneTarget, 5, [
			routeSuspension()
		]);
		const withSecondRoute = activateEventModifiers(first.state, source, routeTwoTarget, 5, [
			routeSuspension()
		]);

		expect(withSecondRoute.state.activeModifiers.map((modifier) => modifier.id)).toEqual([
			'event-modifier-1',
			'event-modifier-2'
		]);
		expect(withSecondRoute.state.activeModifiers.map((modifier) => modifier.target)).toEqual([
			routeOneTarget,
			routeTwoTarget
		]);
		expect(withSecondRoute.lifecycle).toEqual([
			expect.objectContaining({
				status: 'activated',
				modifier: expect.objectContaining({ id: 'event-modifier-2' })
			})
		]);

		const reapplied = activateEventModifiers(withSecondRoute.state, source, routeOneTarget, 6, [
			routeSuspension()
		]);
		expect(reapplied.state.activeModifiers.map((modifier) => modifier.target)).toEqual([
			routeTwoTarget,
			routeOneTarget
		]);
		expect(reapplied.state.activeModifiers.map((modifier) => modifier.id)).toEqual([
			'event-modifier-2',
			'event-modifier-3'
		]);
		expect(reapplied.lifecycle).toEqual([
			expect.objectContaining({
				status: 'replaced',
				modifier: expect.objectContaining({ id: 'event-modifier-1' }),
				replacedByModifierId: 'event-modifier-3'
			}),
			expect.objectContaining({
				status: 'activated',
				modifier: expect.objectContaining({ id: 'event-modifier-3' })
			})
		]);
	});

	it('does not replace a route modifier with a company modifier sharing its stacking key', () => {
		const routeActivated = activateEventModifiers(
			createInitialEventRuntime(42),
			source,
			{ kind: 'recurring-route', routeId: 'route-1' },
			5,
			[routeSuspension()]
		);
		const result = activateEventModifiers(routeActivated.state, source, companyTarget, 6, [
			routeSuspension({
				stackingKey: 'route-disruption:route',
				effect: {
					kind: 'import-cost-multiplier',
					scope: 'retail-product',
					target: { kind: 'all' },
					multiplier: 0.9
				}
			})
		]);

		expect(result.state.activeModifiers.map((modifier) => modifier.target)).toEqual([
			{ kind: 'recurring-route', routeId: 'route-1' },
			companyTarget
		]);
		expect(result.state.activeModifiers.map((modifier) => modifier.id)).toEqual([
			'event-modifier-1',
			'event-modifier-2'
		]);
		expect(result.lifecycle.every((entry) => entry.status === 'activated')).toBe(true);
	});

	it('clones competitor attraction effects and replaces per concrete rival target', () => {
		const effect = { kind: 'competitor-attraction-multiplier', multiplier: 1.18 } as const;
		expect(cloneTimedEffect(effect)).toEqual(effect);

		const firstTarget = { kind: 'competitor' as const, competitorId: 'competitor-harbor-city-1' };
		const secondTarget = { kind: 'competitor' as const, competitorId: 'competitor-harbor-city-2' };
		const template: EventModifierTemplate = {
			durationDays: 3,
			stackingKey: 'rival-promotion:market-attraction',
			stackingRule: 'replace',
			effect,
			explanation: { key: 'events.rivalPromotion.modifier', params: {} },
			importance: 'important'
		};

		const first = activateEventModifiers(createInitialEventRuntime(42), source, firstTarget, 5, [
			template
		]);
		const withSecond = activateEventModifiers(first.state, source, secondTarget, 5, [template]);
		const replaced = activateEventModifiers(
			withSecond.state,
			{ ...source, instanceId: 'event-instance-2' },
			firstTarget,
			6,
			[template]
		);

		expect(withSecond.state.activeModifiers.map((modifier) => modifier.target)).toEqual([
			firstTarget,
			secondTarget
		]);
		expect(replaced.state.activeModifiers.map((modifier) => modifier.target)).toEqual([
			secondTarget,
			firstTarget
		]);
		expect(replaced.lifecycle.map((entry) => entry.status)).toEqual(['replaced', 'activated']);
	});
});
