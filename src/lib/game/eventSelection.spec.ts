import { describe, expect, it, vi } from 'vitest';
import { validateAndNormalizeEventCatalog, type EventDefinition } from './eventDefinitions';
import {
	EVENT_DRAW_COUNT_PER_DAY,
	EVENT_SELECTION_SCHEMA_VERSION,
	createInitialEventRuntime,
	selectEventForDay
} from './eventSelection';
import { removeRecurringRoute } from './interCityLogistics';
import { createTwoIndustryCityGame, withRecurringRoutes } from './interCityLogistics.testUtils';
import { createNewGame } from './state';
import type { GameState, RecurringRoute } from './types';

function definition(overrides: Partial<EventDefinition> = {}): EventDefinition {
	return {
		id: 'weighted-event',
		version: 1,
		selection: { kind: 'weighted', weight: 1 },
		condition: { kind: 'always' },
		target: { kind: 'company' },
		expiresAfterDays: 2,
		cooldownDays: 1,
		copy: { key: 'events.test', params: {} },
		options: [{ id: 'accept', effects: [], modifiers: [] }],
		...overrides
	};
}

function game(seed: number) {
	return createNewGame('grocery', seed);
}

function withEventRngState(state: number) {
	const input = game(7);
	return { ...input, events: { ...input.events, rngState: state } };
}

function route(overrides: Partial<RecurringRoute> = {}): RecurringRoute {
	return {
		id: 'route-1',
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		capacity: 30,
		frequencyDays: 3,
		leadTimeDays: 2,
		transportCostPerUnit: 2,
		priority: 1,
		state: 'active',
		nextDispatchOnDay: 0,
		...overrides
	};
}

function routeGame(routes: readonly RecurringRoute[], rngState: number): GameState {
	const base = withRecurringRoutes(createTwoIndustryCityGame({ seed: 7 }), [...routes]);
	return { ...base, events: { ...base.events, rngState } };
}

function eventIdOf(game: GameState): string {
	const events = game.decisions.filter((decision) => decision.kind === 'event');
	const event = events[events.length - 1];
	if (!event) throw new Error('Expected an event decision');
	return event.eventId;
}

function targetRouteId(game: GameState): string {
	const events = game.decisions.filter((decision) => decision.kind === 'event');
	const event = events[events.length - 1];
	if (!event || event.target.kind !== 'recurring-route') {
		throw new Error('Expected a recurring-route event target');
	}
	return event.target.routeId;
}

function routeEventDefinition(overrides: Partial<EventDefinition> = {}): EventDefinition {
	return definition({
		id: 'route-event',
		target: { kind: 'recurring-route', state: 'active' },
		selection: { kind: 'forced', priority: 1 },
		...overrides
	});
}

describe('event selection packet', () => {
	it.each([
		['no candidate', 1, []],
		['cadence fail', 7, [definition()]],
		[
			'cadence pass with empty weighted fixture',
			42,
			[definition({ condition: { kind: 'day-at-least', day: 2 } })]
		],
		[
			'forced winner',
			99,
			[definition({ id: 'forced', selection: { kind: 'forced', priority: 1 } })]
		],
		['weighted winner', 12345, [definition()]]
	])('consumes the fixed packet for %s', (_name, seed, definitions) => {
		const selected = selectEventForDay(game(seed), validateAndNormalizeEventCatalog(definitions));
		expect(EVENT_DRAW_COUNT_PER_DAY).toBe(3);
		expect(selected.events.rngState).toBe(
			new Map<number, number>([
				[1, 2_138_367_893],
				[7, 1_296_802_621],
				[42, 1_398_467_044],
				[99, 1_993_531_548],
				[12_345, 198_245_349]
			]).get(seed)
		);
	});

	it('consumes the same packet when a matching event is already pending', () => {
		const input = game(1);
		const first = selectEventForDay(
			input,
			validateAndNormalizeEventCatalog([
				definition({ id: 'forced', selection: { kind: 'forced', priority: 1 } })
			])
		);
		const second = selectEventForDay(
			first,
			validateAndNormalizeEventCatalog([
				definition({ id: 'forced', selection: { kind: 'forced', priority: 1 } })
			])
		);
		expect(second.events.rngState).not.toBe(first.events.rngState);
		expect(second.events.rngState).toBe(1_251_268_557);
		expect(second.decisions.filter((decision) => decision.kind === 'event')).toHaveLength(1);
	});
});

describe('event selection and materialization', () => {
	it('uses code-unit ID ordering for forced and weighted candidates', () => {
		const localeCompare = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
			throw new Error('event selection ordering must not use host collation');
		});

		try {
			const forced = selectEventForDay(
				game(7),
				validateAndNormalizeEventCatalog([
					definition({ id: 'aa', selection: { kind: 'forced', priority: 10 } }),
					definition({ id: 'a-foo', selection: { kind: 'forced', priority: 10 } })
				])
			);
			const weighted = selectEventForDay(
				withEventRngState(1),
				validateAndNormalizeEventCatalog([
					definition({ id: 'aa', selection: { kind: 'weighted', weight: 1 } }),
					definition({ id: 'a-foo', selection: { kind: 'weighted', weight: 1 } })
				])
			);

			expect(forced.decisions.find((decision) => decision.kind === 'event')?.eventId).toBe('a-foo');
			expect(weighted.decisions.find((decision) => decision.kind === 'event')?.eventId).toBe(
				'a-foo'
			);
		} finally {
			localeCompare.mockRestore();
		}
	});

	it('selects forced events by priority then stable ID order', () => {
		const selected = selectEventForDay(
			game(7),
			validateAndNormalizeEventCatalog([
				definition({ id: 'z-priority', selection: { kind: 'forced', priority: 10 } }),
				definition({ id: 'a-priority', selection: { kind: 'forced', priority: 10 } }),
				definition({ id: 'lower-priority', selection: { kind: 'forced', priority: 9 } })
			])
		);
		const event = selected.decisions.find((decision) => decision.kind === 'event');
		expect(event?.eventId).toBe('a-priority');
	});

	it('uses the weighted cumulative threshold and materializes event identity', () => {
		const input = withEventRngState(3);
		const selected = selectEventForDay(
			input,
			validateAndNormalizeEventCatalog([
				definition({ id: 'first', selection: { kind: 'weighted', weight: 1 } }),
				definition({ id: 'second', selection: { kind: 'weighted', weight: 3 } })
			])
		);
		const event = selected.decisions.find((decision) => decision.kind === 'event');
		expect(event?.eventId).toBe('second');
		expect(event).toMatchObject({
			id: 'event-instance-1',
			definitionVersion: 1,
			generatedOnDay: selected.day,
			expiresOnDay: selected.day + 2,
			target: { kind: 'company' },
			copy: { key: 'events.test', params: {} }
		});
	});

	it('uses draw three only as a local materialization seed and materializes credit amounts', () => {
		const input = game(99);
		const catalog = validateAndNormalizeEventCatalog([
			definition({
				id: 'cash-pressure',
				selection: { kind: 'forced', priority: 1 },
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
		const selected = selectEventForDay(input, catalog);
		const event = selected.decisions.find((decision) => decision.kind === 'event');
		const effect = event?.options[0]?.effects[0];
		expect(effect).toMatchObject({ kind: 'finance-borrow', amount: expect.any(Number) });
		expect(selected.events.rngState).toBe(1_993_531_548);
	});

	it('blocks only before cooldown eligibility and permits next-day recurrence after early resolution', () => {
		const catalog = validateAndNormalizeEventCatalog([
			definition({ id: 'forced', selection: { kind: 'forced', priority: 1 }, cooldownDays: 1 })
		]);
		const first = selectEventForDay(game(7), catalog);
		const event = first.decisions.find((decision) => decision.kind === 'event')!;
		const unresolved = selectEventForDay({ ...first, decisions: [event] }, catalog);
		const nextDay = selectEventForDay({ ...first, day: first.day + 1, decisions: [] }, catalog);
		expect(unresolved.decisions.filter((decision) => decision.kind === 'event')).toHaveLength(1);
		expect(nextDay.decisions.filter((decision) => decision.kind === 'event')).toHaveLength(1);
	});

	it('preserves cooldowns for other events when replacing a same-event cooldown', () => {
		const catalog = validateAndNormalizeEventCatalog([
			definition({ id: 'alpha', selection: { kind: 'forced', priority: 2 }, cooldownDays: 1 }),
			definition({ id: 'beta', selection: { kind: 'forced', priority: 1 }, cooldownDays: 3 })
		]);
		const first = selectEventForDay(game(7), catalog);
		expect(first.decisions.filter((d) => d.kind === 'event')).toHaveLength(1);
		const firstEvent = first.decisions.find((d) => d.kind === 'event')!;
		expect(firstEvent?.eventId).toBe('alpha');

		const withBetaCooldown: typeof first = {
			...first,
			events: {
				...first.events,
				cooldowns: [
					...first.events.cooldowns,
					{
						eventId: 'beta',
						target: { kind: 'company' },
						generatedOnDay: first.day,
						eligibleOnDay: first.day + 3
					}
				]
			}
		};
		const nextDay = selectEventForDay(
			{ ...withBetaCooldown, day: first.day + 1, decisions: [] },
			catalog
		);
		const alphaCooldowns = nextDay.events.cooldowns.filter((c) => c.eventId === 'alpha');
		const betaCooldowns = nextDay.events.cooldowns.filter((c) => c.eventId === 'beta');

		expect(nextDay.events.cooldowns).toHaveLength(2);

		expect(betaCooldowns).toHaveLength(1);
		expect(betaCooldowns[0]).toEqual({
			eventId: 'beta',
			target: { kind: 'company' },
			generatedOnDay: first.day,
			eligibleOnDay: first.day + 3
		});

		expect(alphaCooldowns).toHaveLength(1);
		expect(alphaCooldowns[0].eligibleOnDay).toBe(first.day + 2);
		expect(alphaCooldowns[0].generatedOnDay).toBe(first.day + 1);
		expect(alphaCooldowns[0].target).toEqual({ kind: 'company' });
	});

	it('is deeply deterministic for equal input state and normalized catalogs', () => {
		const input = game(7);
		const catalog = validateAndNormalizeEventCatalog([
			definition({ id: 'b', selection: { kind: 'forced', priority: 1 } }),
			definition({ id: 'a', selection: { kind: 'forced', priority: 1 } })
		]);
		expect(selectEventForDay(input, catalog)).toEqual(selectEventForDay(input, catalog));
		expect(createInitialEventRuntime(7).nextInstanceSequence).toBe(1);
	});

	it('evaluates score-at-least conditions against the game scorecard', () => {
		const input = game(7);
		const aboveCatalog = validateAndNormalizeEventCatalog([
			definition({
				id: 'score-event',
				selection: { kind: 'forced', priority: 1 },
				condition: { kind: 'score-at-least', score: 'profit', value: 0 }
			})
		]);
		const above = selectEventForDay(input, aboveCatalog);
		expect(above.decisions.filter((d) => d.kind === 'event')).toHaveLength(1);

		const belowCatalog = validateAndNormalizeEventCatalog([
			definition({
				id: 'score-event',
				selection: { kind: 'forced', priority: 1 },
				condition: { kind: 'score-at-least', score: 'profit', value: 100 }
			})
		]);
		const below = selectEventForDay(input, belowCatalog);
		expect(below.decisions.filter((d) => d.kind === 'event')).toHaveLength(0);
	});

	it('evaluates store-count-below-cap conditions against the store count', () => {
		const input = game(7);
		const eligibleCatalog = validateAndNormalizeEventCatalog([
			definition({
				id: 'cap-event',
				selection: { kind: 'forced', priority: 1 },
				condition: { kind: 'store-count-below-cap' }
			})
		]);
		const eligible = selectEventForDay(input, eligibleCatalog);
		expect(eligible.decisions.filter((d) => d.kind === 'event')).toHaveLength(1);

		const fullGame = { ...input, storeCap: input.stores.length };
		const blocked = selectEventForDay(fullGame, eligibleCatalog);
		expect(blocked.decisions.filter((d) => d.kind === 'event')).toHaveLength(0);
	});
});

describe('recurring-route event selection', () => {
	it('keeps one authored weight for a route definition regardless of route count', () => {
		const definitions = () => [
			definition({ id: 'company-event', selection: { kind: 'weighted', weight: 1 } }),
			routeEventDefinition({ selection: { kind: 'weighted', weight: 1 } })
		];
		const oneRouteCatalog = validateAndNormalizeEventCatalog(definitions());
		const fourRouteCatalog = validateAndNormalizeEventCatalog(definitions());

		expect(oneRouteCatalog.byId.get('route-event')?.selection).toEqual({
			kind: 'weighted',
			weight: 1
		});
		expect(fourRouteCatalog.byId.get('route-event')?.selection).toEqual({
			kind: 'weighted',
			weight: 1
		});

		const one = selectEventForDay(routeGame([route({ id: 'route-1' })], 7), oneRouteCatalog);
		const four = selectEventForDay(
			routeGame(
				[
					route({ id: 'route-1' }),
					route({ id: 'route-2' }),
					route({ id: 'route-3' }),
					route({ id: 'route-4' })
				],
				7
			),
			fourRouteCatalog
		);

		expect(eventIdOf(one)).toBe('route-event');
		expect(eventIdOf(four)).toBe('route-event');
		expect(targetRouteId(one)).toBe('route-1');
		expect(targetRouteId(four)).toBe('route-1');
	});

	it('chooses the same concrete route from fixed rng state after structured cloning', () => {
		const definitions = [routeEventDefinition()];
		const catalog = validateAndNormalizeEventCatalog(definitions);
		const clonedCatalog = validateAndNormalizeEventCatalog(structuredClone(definitions));
		const routes = [route({ id: 'route-1' }), route({ id: 'route-2' })];

		const first = selectEventForDay(routeGame(routes, 3), catalog);
		const second = selectEventForDay(routeGame(routes, 3), clonedCatalog);

		expect(targetRouteId(first)).toBe('route-2');
		expect(targetRouteId(second)).toBe('route-2');
	});

	it('keeps other route targets selectable while a same-event decision pends on one route', () => {
		const catalog = validateAndNormalizeEventCatalog([routeEventDefinition()]);
		const routes = [route({ id: 'route-1' }), route({ id: 'route-2' })];
		const first = selectEventForDay(routeGame(routes, 3), catalog);
		expect(targetRouteId(first)).toBe('route-2');

		const nextDay = { ...first, day: first.day + 1 };
		const second = selectEventForDay(nextDay, catalog);
		expect(targetRouteId(second)).toBe('route-1');
		expect(second.decisions.filter((decision) => decision.kind === 'event')).toHaveLength(2);
	});

	it('keeps other route targets selectable while one route is on cooldown', () => {
		const catalog = validateAndNormalizeEventCatalog([routeEventDefinition()]);
		const routes = [route({ id: 'route-1' }), route({ id: 'route-2' })];
		const first = selectEventForDay(routeGame(routes, 3), catalog);
		expect(targetRouteId(first)).toBe('route-2');
		expect(first.events.cooldowns.map((cooldown) => cooldown.target)).toEqual([
			{ kind: 'recurring-route', routeId: 'route-2' }
		]);

		const sameDay = { ...first, decisions: [] };
		const second = selectEventForDay(sameDay, catalog);
		expect(targetRouteId(second)).toBe('route-1');
	});

	it('keeps three top-level draws and the selection schema version unchanged', () => {
		expect(EVENT_DRAW_COUNT_PER_DAY).toBe(3);
		expect(EVENT_SELECTION_SCHEMA_VERSION).toBe(1);
	});

	it('persists stable route copy context on materialized decisions and survives route removal', () => {
		const catalog = validateAndNormalizeEventCatalog([routeEventDefinition()]);
		const routes = [route({ id: 'route-1' }), route({ id: 'route-2' })];
		const selected = selectEventForDay(routeGame(routes, 3), catalog);
		const event = selected.decisions.find((decision) => decision.kind === 'event')!;
		expect(event.target).toEqual({ kind: 'recurring-route', routeId: 'route-2' });
		expect(event.copy).toEqual({
			key: 'events.test',
			params: {
				routeId: 'route-2',
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water'
			}
		});

		const removed = removeRecurringRoute(selected, 'route-2');
		expect(removed.ok).toBe(true);
		if (!removed.ok) throw new Error(`Expected removal, received ${removed.reason}`);
		const eventAfterRemoval = removed.game.decisions.find((decision) => decision.kind === 'event')!;
		expect(eventAfterRemoval.copy).toEqual(event.copy);
		expect(eventAfterRemoval.target).toEqual({ kind: 'recurring-route', routeId: 'route-2' });
	});

	it('materializes route-effect modifiers without injecting an effect target', () => {
		const catalog = validateAndNormalizeEventCatalog([
			routeEventDefinition({
				options: [
					{
						id: 'accept',
						effects: [],
						modifiers: [
							{
								durationDays: 3,
								stackingKey: 'route-disruption:route',
								stackingRule: 'replace',
								effect: { kind: 'route-dispatch-suspension' },
								explanation: { key: 'events.test.modifier', params: {} },
								importance: 'important'
							}
						]
					}
				]
			})
		]);
		const selected = selectEventForDay(routeGame([route({ id: 'route-1' })], 7), catalog);
		const event = selected.decisions.find((decision) => decision.kind === 'event')!;
		expect(event.target).toEqual({ kind: 'recurring-route', routeId: 'route-1' });
		expect(event.options[0].modifiers[0].effect).toEqual({
			kind: 'route-dispatch-suspension'
		});
		expect(event.options[0].modifiers[0].effect).not.toHaveProperty('target');
	});
});
