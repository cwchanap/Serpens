import { describe, expect, test } from 'vitest';
import { resolveEffectiveRecurringRoute } from './logisticsRouteModifiers';
import type { ActiveEventModifier, RecurringRoute } from './types';

function route(overrides: Partial<RecurringRoute> = {}): RecurringRoute {
	return {
		id: 'route-1',
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		capacity: 100,
		frequencyDays: 3,
		leadTimeDays: 2,
		transportCostPerUnit: 2,
		priority: 1,
		state: 'active',
		nextDispatchOnDay: 10,
		...overrides
	};
}

function routeModifier(overrides: Partial<ActiveEventModifier> = {}): ActiveEventModifier {
	return {
		id: 'event-modifier-1',
		source: {
			eventId: 'freight-disruption',
			instanceId: 'event-instance-1',
			optionId: 'accept-delay'
		},
		target: { kind: 'recurring-route', routeId: 'route-1' },
		startsOnDay: 8,
		expiresOnDay: 11,
		stackingKey: 'freight-capacity:route-1',
		stackingRule: 'replace',
		effect: { kind: 'route-capacity-multiplier', multiplier: 0.75 },
		explanation: { key: 'events.freightDisruption.acceptDelay.capacity', params: {} },
		importance: 'normal',
		...overrides
	};
}

describe('resolveEffectiveRecurringRoute', () => {
	test('returns base values with no contributions when no modifier targets the route', () => {
		const result = resolveEffectiveRecurringRoute(route(), [], 9);

		expect(result).toEqual({
			base: route(),
			capacity: 100,
			leadTimeDays: 2,
			transportCostMultiplier: 1,
			transportCostPerUnit: 2,
			dispatchSuspended: false,
			contributions: []
		});
	});

	test('ignores company-targeted modifiers and modifiers on other routes', () => {
		const result = resolveEffectiveRecurringRoute(route(), [routeModifier()], 9);

		expect(result.capacity).toBe(75);
		expect(result.contributions).toHaveLength(1);

		const unrelated = resolveEffectiveRecurringRoute(
			route(),
			[
				routeModifier({ target: { kind: 'company' } }),
				routeModifier({
					id: 'event-modifier-2',
					target: { kind: 'recurring-route', routeId: 'route-2' }
				})
			],
			9
		);

		expect(unrelated).toEqual({
			base: route(),
			capacity: 100,
			leadTimeDays: 2,
			transportCostMultiplier: 1,
			transportCostPerUnit: 2,
			dispatchSuspended: false,
			contributions: []
		});
	});

	test('ignores modifiers that are not active on the given day', () => {
		const beforeStart = resolveEffectiveRecurringRoute(route(), [routeModifier()], 7);
		expect(beforeStart.capacity).toBe(100);
		expect(beforeStart.contributions).toEqual([]);

		const atExpiry = resolveEffectiveRecurringRoute(route(), [routeModifier()], 11);
		expect(atExpiry.capacity).toBe(100);
		expect(atExpiry.contributions).toEqual([]);

		const onLastActiveDay = resolveEffectiveRecurringRoute(route(), [routeModifier()], 10);
		expect(onLastActiveDay.capacity).toBe(75);
		expect(onLastActiveDay.contributions).toHaveLength(1);
	});

	test('adds active lead-time adjustments to the base lead time', () => {
		const result = resolveEffectiveRecurringRoute(
			route({ leadTimeDays: 2 }),
			[
				routeModifier({ effect: { kind: 'route-lead-time-adjustment', days: 1 } }),
				routeModifier({
					id: 'event-modifier-2',
					effect: { kind: 'route-lead-time-adjustment', days: 2 }
				})
			],
			9
		);

		expect(result.leadTimeDays).toBe(5);
		expect(result.contributions).toEqual([
			expect.objectContaining({ effectKind: 'route-lead-time-adjustment', days: 1 }),
			expect.objectContaining({ effectKind: 'route-lead-time-adjustment', days: 2 })
		]);
	});

	test('multiplies capacity with one final floor and a minimum of 1', () => {
		const reduced = resolveEffectiveRecurringRoute(
			route({ capacity: 100 }),
			[
				routeModifier({ effect: { kind: 'route-capacity-multiplier', multiplier: 0.75 } }),
				routeModifier({
					id: 'event-modifier-2',
					effect: { kind: 'route-capacity-multiplier', multiplier: 2 }
				})
			],
			9
		);
		expect(reduced.capacity).toBe(150);

		const floored = resolveEffectiveRecurringRoute(
			route({ capacity: 5 }),
			[routeModifier({ effect: { kind: 'route-capacity-multiplier', multiplier: 0.1 } })],
			9
		);
		expect(floored.capacity).toBe(1);

		const fractionResult = resolveEffectiveRecurringRoute(
			route({ capacity: 100 }),
			[routeModifier({ effect: { kind: 'route-capacity-multiplier', multiplier: 0.75 } })],
			9
		);
		expect(fractionResult.capacity).toBe(75);
	});

	test('suspends dispatch when any active suspension modifier targets the route', () => {
		const single = resolveEffectiveRecurringRoute(
			route(),
			[routeModifier({ effect: { kind: 'route-dispatch-suspension' } })],
			9
		);
		expect(single.dispatchSuspended).toBe(true);

		const multiple = resolveEffectiveRecurringRoute(
			route(),
			[
				routeModifier({
					id: 'event-modifier-2',
					effect: { kind: 'route-dispatch-suspension' }
				}),
				routeModifier({ effect: { kind: 'route-dispatch-suspension' } })
			],
			9
		);
		expect(multiple.dispatchSuspended).toBe(true);
		expect(multiple.contributions).toHaveLength(2);
	});

	test('composes transport-cost multipliers and derives the effective per-unit cost', () => {
		const result = resolveEffectiveRecurringRoute(
			route({ transportCostPerUnit: 2 }),
			[
				routeModifier({ effect: { kind: 'route-transport-cost-multiplier', multiplier: 1.5 } }),
				routeModifier({
					id: 'event-modifier-2',
					effect: { kind: 'route-transport-cost-multiplier', multiplier: 2 }
				})
			],
			9
		);

		expect(result.transportCostMultiplier).toBe(3);
		expect(result.transportCostPerUnit).toBe(6);
	});

	test('orders contributions by modifier ID and attributes source and explanation', () => {
		const result = resolveEffectiveRecurringRoute(
			route(),
			[
				routeModifier({
					id: 'event-modifier-2',
					effect: { kind: 'route-capacity-multiplier', multiplier: 0.5 }
				}),
				routeModifier({
					id: 'event-modifier-10',
					effect: { kind: 'route-capacity-multiplier', multiplier: 2 }
				})
			],
			9
		);

		expect(result.contributions.map((contribution) => contribution.modifierId)).toEqual([
			'event-modifier-10',
			'event-modifier-2'
		]);
		expect(result.contributions[0]).toEqual({
			effectKind: 'route-capacity-multiplier',
			modifierId: 'event-modifier-10',
			source: {
				eventId: 'freight-disruption',
				instanceId: 'event-instance-1',
				optionId: 'accept-delay'
			},
			explanation: { key: 'events.freightDisruption.acceptDelay.capacity', params: {} },
			multiplier: 2
		});
	});

	test('rejects lead-time adjustments that overflow the safe integer range', () => {
		expect(() =>
			resolveEffectiveRecurringRoute(
				route({ leadTimeDays: Number.MAX_SAFE_INTEGER - 1 }),
				[routeModifier({ effect: { kind: 'route-lead-time-adjustment', days: 2 } })],
				9
			)
		).toThrow(RangeError);
	});
});
