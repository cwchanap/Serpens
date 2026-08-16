import { describe, expect, test } from 'vitest';
import {
	buildRouteModifierRecoveries,
	resolveEffectiveRecurringRoute
} from './logisticsRouteModifiers';
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

	test('skips an import-cost-multiplier effect that incorrectly targets a route', () => {
		const result = resolveEffectiveRecurringRoute(
			route(),
			[
				routeModifier({
					effect: {
						kind: 'import-cost-multiplier',
						scope: 'retail-product',
						target: { kind: 'all' },
						multiplier: 0.9
					} as never
				})
			],
			9
		);

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
});

describe('buildRouteModifierRecoveries', () => {
	/** Expires after closingDay 9, so it stops affecting the route from day 10. */
	function expiringModifier(overrides: Partial<ActiveEventModifier> = {}): ActiveEventModifier {
		return routeModifier({ expiresOnDay: 10, ...overrides });
	}

	/** Still active after closingDay 9, so it survives expiry. */
	function survivingModifier(overrides: Partial<ActiveEventModifier> = {}): ActiveEventModifier {
		return routeModifier({ id: 'event-modifier-2', expiresOnDay: 12, ...overrides });
	}

	const freightSource = {
		eventId: 'freight-disruption',
		instanceId: 'event-instance-1',
		optionId: 'accept-delay'
	};

	test('returns no rows when no modifiers expired', () => {
		const modifiers = [survivingModifier()];

		expect(
			buildRouteModifierRecoveries({
				routes: [route()],
				beforeExpiry: modifiers,
				afterExpiry: modifiers,
				closingDay: 9
			})
		).toEqual([]);
		expect(
			buildRouteModifierRecoveries({
				routes: [route()],
				beforeExpiry: [],
				afterExpiry: [],
				closingDay: 9
			})
		).toEqual([]);
	});

	test('ignores an expiring modifier that is not active on the closing day', () => {
		const result = buildRouteModifierRecoveries({
			routes: [route()],
			beforeExpiry: [expiringModifier({ startsOnDay: 9, expiresOnDay: 10 })],
			afterExpiry: [],
			closingDay: 8
		});

		expect(result).toEqual([]);
	});

	test('emits a capacity recovery row with the disrupted and recovered capacity', () => {
		const result = buildRouteModifierRecoveries({
			routes: [route({ capacity: 100 })],
			beforeExpiry: [
				expiringModifier({ effect: { kind: 'route-capacity-multiplier', multiplier: 0.75 } })
			],
			afterExpiry: [],
			closingDay: 9
		});

		expect(result).toEqual([
			{
				routeId: 'route-1',
				modifierId: 'event-modifier-1',
				source: freightSource,
				effectKind: 'route-capacity-multiplier',
				disruptedCapacity: 75,
				recoveredCapacity: 100
			}
		]);
	});

	test('emits a lead-time recovery row with the disrupted and recovered lead time', () => {
		const result = buildRouteModifierRecoveries({
			routes: [route({ leadTimeDays: 2 })],
			beforeExpiry: [expiringModifier({ effect: { kind: 'route-lead-time-adjustment', days: 1 } })],
			afterExpiry: [],
			closingDay: 9
		});

		expect(result).toEqual([
			{
				routeId: 'route-1',
				modifierId: 'event-modifier-1',
				source: freightSource,
				effectKind: 'route-lead-time-adjustment',
				disruptedLeadTimeDays: 3,
				recoveredLeadTimeDays: 2
			}
		]);
	});

	test('emits a suspension recovery row when dispatch recovers from being suspended', () => {
		const result = buildRouteModifierRecoveries({
			routes: [route()],
			beforeExpiry: [expiringModifier({ effect: { kind: 'route-dispatch-suspension' } })],
			afterExpiry: [],
			closingDay: 9
		});

		expect(result).toEqual([
			{
				routeId: 'route-1',
				modifierId: 'event-modifier-1',
				source: freightSource,
				effectKind: 'route-dispatch-suspension',
				disruptedSuspended: true,
				recoveredSuspended: false
			}
		]);
	});

	test('emits a transport-cost recovery row with the disrupted and recovered per-unit cost', () => {
		const result = buildRouteModifierRecoveries({
			routes: [route({ transportCostPerUnit: 2 })],
			beforeExpiry: [
				expiringModifier({ effect: { kind: 'route-transport-cost-multiplier', multiplier: 1.5 } })
			],
			afterExpiry: [],
			closingDay: 9
		});

		expect(result).toEqual([
			{
				routeId: 'route-1',
				modifierId: 'event-modifier-1',
				source: freightSource,
				effectKind: 'route-transport-cost-multiplier',
				disruptedTransportCostPerUnit: 3,
				recoveredTransportCostPerUnit: 2
			}
		]);
	});

	test('reveals an edited base route in both disrupted and recovered values', () => {
		const result = buildRouteModifierRecoveries({
			routes: [route({ capacity: 200, leadTimeDays: 5 })],
			beforeExpiry: [
				expiringModifier({ effect: { kind: 'route-capacity-multiplier', multiplier: 0.75 } }),
				expiringModifier({
					id: 'event-modifier-2',
					effect: { kind: 'route-lead-time-adjustment', days: 1 }
				})
			],
			afterExpiry: [],
			closingDay: 9
		});

		expect(result).toEqual([
			{
				routeId: 'route-1',
				modifierId: 'event-modifier-1',
				source: freightSource,
				effectKind: 'route-capacity-multiplier',
				disruptedCapacity: 150,
				recoveredCapacity: 200
			},
			{
				routeId: 'route-1',
				modifierId: 'event-modifier-2',
				source: freightSource,
				effectKind: 'route-lead-time-adjustment',
				disruptedLeadTimeDays: 6,
				recoveredLeadTimeDays: 5
			}
		]);
	});

	test('combines multiple same-kind contributors before expiry and survivors after', () => {
		const result = buildRouteModifierRecoveries({
			routes: [route({ capacity: 100 })],
			beforeExpiry: [
				expiringModifier({ effect: { kind: 'route-capacity-multiplier', multiplier: 0.75 } }),
				survivingModifier({ effect: { kind: 'route-capacity-multiplier', multiplier: 0.5 } })
			],
			afterExpiry: [
				survivingModifier({ effect: { kind: 'route-capacity-multiplier', multiplier: 0.5 } })
			],
			closingDay: 9
		});

		expect(result).toEqual([
			{
				routeId: 'route-1',
				modifierId: 'event-modifier-1',
				source: freightSource,
				effectKind: 'route-capacity-multiplier',
				disruptedCapacity: 37,
				recoveredCapacity: 50
			}
		]);
	});

	test('emits one row per expired same-kind contributor with the same combined values', () => {
		const result = buildRouteModifierRecoveries({
			routes: [route({ capacity: 100 })],
			beforeExpiry: [
				expiringModifier({
					id: 'event-modifier-10',
					effect: { kind: 'route-capacity-multiplier', multiplier: 0.5 }
				}),
				expiringModifier({
					id: 'event-modifier-2',
					effect: { kind: 'route-capacity-multiplier', multiplier: 0.75 }
				})
			],
			afterExpiry: [],
			closingDay: 9
		});

		expect(result).toEqual([
			{
				routeId: 'route-1',
				modifierId: 'event-modifier-10',
				source: freightSource,
				effectKind: 'route-capacity-multiplier',
				disruptedCapacity: 37,
				recoveredCapacity: 100
			},
			{
				routeId: 'route-1',
				modifierId: 'event-modifier-2',
				source: freightSource,
				effectKind: 'route-capacity-multiplier',
				disruptedCapacity: 37,
				recoveredCapacity: 100
			}
		]);
	});

	test('skips removed routes, other routes, and non-route targets', () => {
		const result = buildRouteModifierRecoveries({
			routes: [route()],
			beforeExpiry: [
				expiringModifier({
					target: { kind: 'recurring-route', routeId: 'route-removed' }
				}),
				expiringModifier({
					target: { kind: 'recurring-route', routeId: 'route-2' }
				}),
				expiringModifier({ target: { kind: 'company' } })
			],
			afterExpiry: [],
			closingDay: 9
		});

		expect(result).toEqual([]);
	});

	test('emits no row when another same-kind modifier preserves the effective value', () => {
		const result = buildRouteModifierRecoveries({
			routes: [route()],
			beforeExpiry: [
				expiringModifier({ effect: { kind: 'route-dispatch-suspension' } }),
				survivingModifier({
					stackingKey: 'freight-suspension-alt:route-1',
					effect: { kind: 'route-dispatch-suspension' }
				})
			],
			afterExpiry: [
				survivingModifier({
					stackingKey: 'freight-suspension-alt:route-1',
					effect: { kind: 'route-dispatch-suspension' }
				})
			],
			closingDay: 9
		});

		expect(result).toEqual([]);
	});

	test('skips an import-cost-multiplier effect that incorrectly targets a route', () => {
		const result = buildRouteModifierRecoveries({
			routes: [route()],
			beforeExpiry: [
				expiringModifier({
					effect: {
						kind: 'import-cost-multiplier',
						scope: 'retail-product',
						target: { kind: 'all' },
						multiplier: 0.9
					} as never
				})
			],
			afterExpiry: [],
			closingDay: 9
		});

		expect(result).toEqual([]);
	});
});
