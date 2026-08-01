import { describe, expect, it } from 'vitest';
import { validateAndNormalizeEventCatalog, type EventDefinition } from './eventDefinitions';
import {
	EVENT_DRAW_COUNT_PER_DAY,
	createInitialEventRuntime,
	selectEventForDay
} from './eventSelection';
import { createNewGame } from './state';

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

	it('is deeply deterministic for equal input state and normalized catalogs', () => {
		const input = game(7);
		const catalog = validateAndNormalizeEventCatalog([
			definition({ id: 'b', selection: { kind: 'forced', priority: 1 } }),
			definition({ id: 'a', selection: { kind: 'forced', priority: 1 } })
		]);
		expect(selectEventForDay(input, catalog)).toEqual(selectEventForDay(input, catalog));
		expect(createInitialEventRuntime(7).nextInstanceSequence).toBe(1);
	});
});
