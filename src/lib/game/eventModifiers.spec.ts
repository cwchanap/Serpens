import { describe, expect, it } from 'vitest';
import { createInitialEventRuntime } from './eventSelection';
import {
	activateEventModifiers,
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

describe('event modifier lifecycle', () => {
	it('activates bulk discount templates in order with allocated ids and copied lifecycle snapshots', () => {
		const state = createInitialEventRuntime(42);
		const template = bulkDiscount();
		const result = activateEventModifiers(state, source, 5, [template]);

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

		template.effect.multiplier = 0.5;
		template.explanation = { key: 'events.changed', params: { percent: 50 } };
		expect(result.state.activeModifiers[0]?.effect.multiplier).toBe(0.9);
		expect(result.lifecycle[0]?.modifier.explanation.params).toEqual({ percent: 10 });
	});

	it('replaces matching keys before activation while retaining unrelated modifiers', () => {
		const first = activateEventModifiers(createInitialEventRuntime(42), source, 5, [
			bulkDiscount()
		]);
		const other = bulkDiscount({
			stackingKey: 'other:retail-product',
			explanation: { key: 'events.other', params: {} }
		});
		const withOther = activateEventModifiers(first.state, source, 5, [other]);
		const result = activateEventModifiers(
			withOther.state,
			{ ...source, instanceId: 'event-instance-2' },
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
		const activated = activateEventModifiers(createInitialEventRuntime(42), source, 5, [
			bulkDiscount()
		]);
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
});
