import { describe, expect, test } from 'vitest';
import { assessCredit } from './finance';
import { generateDecisions, pruneExpiredDecisions } from './events';
import { createNewGame } from './state';
import type { EventDecisionItem, SystemDecisionItem } from './types';

function withEventRngState<T extends ReturnType<typeof createNewGame>>(
	game: T,
	rngState: number
): T {
	return { ...game, events: { ...game.events, rngState } };
}

function generatedEvent(game: ReturnType<typeof createNewGame>): EventDecisionItem | undefined {
	return generateDecisions(game).decisions.find(
		(decision): decision is EventDecisionItem => decision.kind === 'event'
	);
}

describe('production event facade', () => {
	test('is sparse for healthy early businesses while still consuming the fixed packet', () => {
		const game = createNewGame('convenience', 33);
		const selected = generateDecisions(game);

		expect(selected.decisions).toEqual([]);
		expect(selected.events.rngState).not.toBe(game.events.rngState);
	});

	test('keeps exact cash-pressure eligibility, priority, option order, and effects', () => {
		const base = createNewGame('electronics', 33);
		const atZero = generateDecisions({ ...base, cash: 0 });
		const negative = { ...base, cash: -1 };
		const selected = generateDecisions(negative);
		const decision = selected.decisions.find(
			(candidate): candidate is EventDecisionItem => candidate.kind === 'event'
		)!;
		const roundedCapacity = Math.floor(assessCredit(negative, 56).availableCredit / 1_000) * 1_000;

		expect(atZero.decisions).toEqual([]);
		expect(decision.eventId).toBe('cash-pressure');
		expect(decision.options.map((option) => option.id)).toEqual([
			'short-loan',
			'cut-costs',
			'hold-course'
		]);
		expect(decision.options[0]?.effects).toEqual([
			{
				kind: 'finance-borrow',
				purpose: 'emergency',
				amount: Math.min(12_000, Math.max(4_000, roundedCapacity)),
				termDays: 56
			},
			{ kind: 'score-adjust', score: 'profit', amount: -4 },
			{ kind: 'score-adjust', score: 'marketPosition', amount: -1 }
		]);
		expect(decision.options[1]?.effects).toEqual([
			{ kind: 'cash-adjust', amount: 5_500 },
			{ kind: 'score-adjust', score: 'customerSatisfaction', amount: -4 },
			{ kind: 'score-adjust', score: 'staffMorale', amount: -5 },
			{ kind: 'store-morale-adjust', scope: 'all-stores', amount: -5 },
			{
				kind: 'store-stock-adjust-by-target-percent',
				scope: 'all-stores',
				percent: -8
			}
		]);
		expect(decision.options[2]?.effects).toEqual([
			{ kind: 'score-adjust', score: 'profit', amount: 1 },
			{ kind: 'score-adjust', score: 'staffMorale', amount: -2 },
			{ kind: 'store-morale-adjust', scope: 'all-stores', amount: -2 }
		]);
	});

	test('keeps expansion boundaries and cash-pressure priority', () => {
		const base = createNewGame('boutique', 33);
		const ready = {
			...base,
			day: 14,
			cash: 55_000,
			scorecard: { ...base.scorecard, profit: 62 },
			storeCap: base.stores.length + 1
		};

		expect(generatedEvent(ready)?.eventId).toBe('expansion-opportunity');
		expect(generatedEvent({ ...ready, day: 13 })).toBeUndefined();
		expect(generatedEvent({ ...ready, cash: 54_999 })).toBeUndefined();
		expect(
			generatedEvent({ ...ready, scorecard: { ...ready.scorecard, profit: 61 } })
		).toBeUndefined();
		expect(generatedEvent({ ...ready, storeCap: base.stores.length })).toBeUndefined();
		expect(generatedEvent({ ...ready, cash: -1 })?.eventId).toBe('cash-pressure');
	});

	test('materializes supplier terms from the isolated cadence packet', () => {
		const base = withEventRngState(createNewGame('convenience', 43), 6);
		const decision = generatedEvent(base)!;

		expect(decision.eventId).toBe('supplier-terms');
		expect(decision.options.map((option) => option.id)).toEqual([
			'negotiate-credit',
			'bulk-discount'
		]);
		expect(decision.options[0]?.effects).toEqual([
			{
				kind: 'finance-borrow',
				purpose: 'supplierCredit',
				amount: 4_000,
				termDays: 28
			},
			{ kind: 'score-adjust', score: 'profit', amount: -2 }
		]);
		expect(decision.options[1]?.effects).toEqual([
			{ kind: 'cash-adjust', amount: -2_500 },
			{ kind: 'score-adjust', score: 'profit', amount: 3 },
			{
				kind: 'store-stock-adjust-by-target-percent',
				scope: 'all-stores',
				percent: 6
			}
		]);
		expect(decision.options[1]?.modifiers).toHaveLength(1);
	});

	test('never duplicates a pending family and materializes at most one event', () => {
		const base = { ...createNewGame('electronics', 33), cash: -1 };
		const first = generateDecisions(base);
		const second = generateDecisions(first);

		expect(first.decisions.filter((decision) => decision.kind === 'event')).toHaveLength(1);
		expect(second.decisions.filter((decision) => decision.kind === 'event')).toHaveLength(1);
	});
});

describe('decision queue cleanup', () => {
	test('removes expired system decisions without event history', () => {
		const base = createNewGame('convenience', 55);
		const decision: SystemDecisionItem = {
			kind: 'system',
			id: 'system-expired',
			title: 'Expired',
			context: { code: 'locationGeneric' },
			expiresOnDay: base.day,
			options: []
		};
		const advanced = { ...base, day: base.day + 1, decisions: [decision] };
		const cleaned = pruneExpiredDecisions(advanced, base.day);

		expect(cleaned.decisions).toEqual([]);
		expect(cleaned.events.history).toBe(base.events.history);
	});

	test('removes an expired event once and stamps expiry history with the closing day', () => {
		const base = { ...createNewGame('convenience', 55), cash: -1 };
		const generated = generateDecisions(base);
		const event = generated.decisions.find(
			(decision): decision is EventDecisionItem => decision.kind === 'event'
		)!;
		const advanced = {
			...generated,
			day: event.expiresOnDay + 1,
			decisions: [event]
		};
		const cleaned = pruneExpiredDecisions(advanced, event.expiresOnDay);
		const cleanedAgain = pruneExpiredDecisions(cleaned, event.expiresOnDay + 1);

		expect(cleaned.decisions).toEqual([]);
		expect(cleaned.events.history.at(-1)).toEqual({
			kind: 'event-decision-expired',
			day: event.expiresOnDay,
			eventId: event.eventId,
			instanceId: event.id,
			target: { kind: 'company' }
		});
		expect(cleanedAgain.events.history).toBe(cleaned.events.history);
	});
});
