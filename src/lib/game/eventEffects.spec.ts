import { describe, expect, it } from 'vitest';
import { calculateStockHealth } from './stock';
import { createNewGame, getDecisionOptionAvailability, resolveDecision } from './state';
import type { EventDecisionItem, GameState, SystemDecisionItem } from './types';

function systemDecision(overrides: Partial<SystemDecisionItem> = {}): SystemDecisionItem {
	return {
		kind: 'system',
		id: 'system-notice',
		title: 'System notice',
		context: { code: 'locationGeneric' },
		expiresOnDay: 3,
		options: [{ id: 'acknowledge', label: 'Acknowledge', description: 'Continue.' }],
		...overrides
	};
}

function eventDecision(overrides: Partial<EventDecisionItem> = {}): EventDecisionItem {
	return {
		kind: 'event',
		id: 'event-instance-1',
		eventId: 'fixture-event',
		definitionVersion: 1,
		generatedOnDay: 1,
		expiresOnDay: 3,
		target: { kind: 'company' },
		copy: { key: 'events.fixture', params: {} },
		options: [{ id: 'accept', effects: [], modifiers: [] }],
		...overrides
	};
}

function withDecision(
	game: GameState,
	decision: SystemDecisionItem | EventDecisionItem
): GameState {
	return { ...game, decisions: [decision] };
}

describe('atomic decision resolution', () => {
	it('returns typed missing, option, and expiry failures with the original object', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision();
		const game = withDecision(base, decision);

		const missing = resolveDecision(game, 'missing', 'accept');
		const badOption = resolveDecision(game, decision.id, 'missing');
		const expiredGame = { ...game, day: decision.expiresOnDay + 1 };
		const expired = resolveDecision(expiredGame, decision.id, 'accept');

		expect(missing).toMatchObject({ ok: false, code: 'decision-not-found', game });
		expect(missing.game).toBe(game);
		expect(badOption).toMatchObject({ ok: false, code: 'option-not-found', game });
		expect(expired).toMatchObject({ ok: false, code: 'decision-expired', game: expiredGame });
		expect(expired.game).toBe(expiredGame);
	});

	it('acknowledges a system decision without event history', () => {
		const base = createNewGame('grocery', 55);
		const game = withDecision(base, systemDecision());
		const result = resolveDecision(game, 'system-notice', 'acknowledge');

		expect(result).toMatchObject({ ok: true, decisionKind: 'system' });
		expect(result.ok && result.game.decisions).toEqual([]);
		expect(result.ok && result.game.events.history).toBe(base.events.history);
	});

	it('applies every non-finance effect in persisted order and records event resolution', () => {
		const base = createNewGame('grocery', 55);
		const firstStore = {
			...base.stores[0]!,
			staffMorale: 98,
			products: base.stores[0]!.products.map((product) => ({
				...product,
				stock: 100,
				targetStock: 200
			}))
		};
		const decision = eventDecision({
			options: [
				{
					id: 'accept',
					effects: [
						{ kind: 'cash-adjust', amount: 500 },
						{ kind: 'score-adjust', score: 'profit', amount: 7 },
						{ kind: 'score-adjust', score: 'customerSatisfaction', amount: -4 },
						{ kind: 'store-morale-adjust', scope: 'all-stores', amount: 5 },
						{
							kind: 'store-stock-adjust-by-target-percent',
							scope: 'all-stores',
							percent: -8
						}
					],
					modifiers: []
				}
			]
		});
		const game = withDecision({ ...base, stores: [firstStore] }, decision);
		const result = resolveDecision(game, decision.id, 'accept');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.cash).toBe(game.cash + 500);
		expect(result.game.scorecard.profit).toBe(game.scorecard.profit + 7);
		expect(result.game.scorecard.customerSatisfaction).toBe(
			game.scorecard.customerSatisfaction - 4
		);
		expect(result.game.stores[0]?.staffMorale).toBe(100);
		expect(result.game.stores[0]?.products[0]?.stock).toBe(84);
		expect(result.game.stores[0]?.stockHealth).toBe(
			calculateStockHealth(result.game.stores[0]!.products)
		);
		expect(result.game.events.history.at(-1)).toEqual({
			kind: 'event-resolved',
			day: game.day,
			eventId: decision.eventId,
			instanceId: decision.id,
			optionId: 'accept',
			target: { kind: 'company' }
		});
	});

	it('borrows at the effect position and applies later score effects', () => {
		const base = createNewGame('grocery', 55);
		const gameWithoutFoundingLoan = {
			...base,
			cash: 40_000,
			finance: { ...base.finance, loans: [] }
		};
		const decision = eventDecision({
			options: [
				{
					id: 'accept',
					effects: [
						{
							kind: 'finance-borrow',
							purpose: 'supplierCredit',
							amount: 4_000,
							termDays: 28
						},
						{ kind: 'score-adjust', score: 'profit', amount: -2 }
					],
					modifiers: []
				}
			]
		});
		const game = withDecision(gameWithoutFoundingLoan, decision);
		const result = resolveDecision(game, decision.id, 'accept');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.cash).toBe(44_000);
		expect(result.game.finance.loans.at(-1)).toMatchObject({
			purpose: 'supplierCredit',
			originalPrincipal: 4_000,
			termDays: 28
		});
		expect(result.game.scorecard.profit).toBe(game.scorecard.profit - 2);
	});

	it('rechecks finance availability and rolls back earlier tentative effects on late failure', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision({
			options: [
				{
					id: 'accept',
					effects: [
						{ kind: 'score-adjust', score: 'profit', amount: -10 },
						{
							kind: 'finance-borrow',
							purpose: 'emergency',
							amount: 200_000,
							termDays: 56
						}
					],
					modifiers: []
				}
			]
		});
		const game = withDecision(base, decision);
		const availability = getDecisionOptionAvailability(game, decision, 'accept');
		const result = resolveDecision(game, decision.id, 'accept');

		expect(availability).toMatchObject({
			available: false,
			code: 'finance-unavailable',
			financeFailure: 'insufficientCredit'
		});
		expect(result).toMatchObject({
			ok: false,
			code: 'finance-unavailable',
			financeFailure: 'insufficientCredit'
		});
		expect(result.game).toBe(game);
		expect(game.scorecard.profit).toBe(base.scorecard.profit);
		expect(game.finance.nextLoanSequence).toBe(base.finance.nextLoanSequence);
	});

	it('does not mutate or consume sequences while checking availability', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision();
		const game = withDecision(base, decision);
		const snapshot = structuredClone(game);

		expect(getDecisionOptionAvailability(game, decision, 'accept')).toEqual({ available: true });
		expect(game).toEqual(snapshot);
		expect(game.events.nextInstanceSequence).toBe(snapshot.events.nextInstanceSequence);
		expect(game.events.nextModifierSequence).toBe(snapshot.events.nextModifierSequence);
		expect(game.finance.nextLoanSequence).toBe(snapshot.finance.nextLoanSequence);
	});

	it('activates a validated modifier only on commit', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision({
			options: [
				{
					id: 'accept',
					effects: [],
					modifiers: [
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
							explanation: { key: 'events.fixture.modifier', params: {} },
							importance: 'important'
						}
					]
				}
			]
		});
		const game = withDecision(base, decision);

		expect(getDecisionOptionAvailability(game, decision, 'accept')).toEqual({ available: true });
		expect(game.events.activeModifiers).toEqual([]);
		expect(game.events.nextModifierSequence).toBe(1);

		const result = resolveDecision(game, decision.id, 'accept');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.events.nextModifierSequence).toBe(2);
		expect(result.game.events.activeModifiers).toEqual([
			expect.objectContaining({
				id: 'event-modifier-1',
				stackingKey: 'supplier-bulk-discount:retail-product',
				startsOnDay: game.day,
				expiresOnDay: game.day + 3,
				source: {
					eventId: decision.eventId,
					instanceId: decision.id,
					optionId: 'accept'
				}
			})
		]);
		expect(result.game.events.history).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ kind: 'modifier-lifecycle', status: 'activated' }),
				expect.objectContaining({ kind: 'event-resolved', eventId: decision.eventId })
			])
		);
	});

	it('rolls back immediate effects when a later modifier template is rejected', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision({
			options: [
				{
					id: 'accept',
					effects: [{ kind: 'cash-adjust', amount: 500 }],
					modifiers: [
						{
							durationDays: 0,
							stackingKey: 'supplier-bulk-discount:retail-product',
							stackingRule: 'replace',
							effect: {
								kind: 'import-cost-multiplier',
								scope: 'retail-product',
								target: { kind: 'all' },
								multiplier: 0.9
							},
							explanation: { key: 'events.fixture.modifier', params: {} },
							importance: 'important'
						}
					]
				}
			]
		});
		const game = withDecision(base, decision);
		const result = resolveDecision(game, decision.id, 'accept');

		expect(result).toMatchObject({
			ok: false,
			code: 'effect-rejected',
			context: { modifierIndex: 0, payload: 'modifier' }
		});
		expect(result.game).toBe(game);
		expect(game.cash).toBe(base.cash);
		expect(game.events.activeModifiers).toEqual([]);
		expect(game.events.history).toEqual(base.events.history);
	});

	it('rejects an invalid late persisted effect atomically', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision({
			options: [
				{
					id: 'accept',
					effects: [
						{ kind: 'cash-adjust', amount: 500 },
						{ kind: 'score-adjust', score: 'profit', amount: Number.NaN }
					],
					modifiers: []
				}
			]
		});
		const game = withDecision(base, decision);
		const result = resolveDecision(game, decision.id, 'accept');

		expect(result).toMatchObject({ ok: false, code: 'effect-rejected' });
		expect(result.game).toBe(game);
		expect(game.cash).toBe(base.cash);
	});

	it('reports decision-not-found from getDecisionOptionAvailability', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision();
		const availability = getDecisionOptionAvailability(base, decision, 'accept');
		expect(availability).toMatchObject({
			available: false,
			code: 'decision-not-found',
			context: { decisionId: decision.id }
		});
	});

	it('rejects a non-company event target', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision({ target: { kind: 'store' as never } });
		const game = withDecision(base, decision);
		const result = resolveDecision(game, decision.id, 'accept');
		expect(result).toMatchObject({
			ok: false,
			code: 'effect-rejected',
			context: { payload: 'target' }
		});
	});

	it('rejects a non-object effect', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision({
			options: [{ id: 'accept', effects: [null as never], modifiers: [] }]
		});
		const game = withDecision(base, decision);
		const result = resolveDecision(game, decision.id, 'accept');
		expect(result).toMatchObject({ ok: false, code: 'effect-rejected' });
		expect(result.game).toBe(game);
	});

	it('rejects a cash-adjust with non-finite amount', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision({
			options: [
				{ id: 'accept', effects: [{ kind: 'cash-adjust', amount: Number.NaN }], modifiers: [] }
			]
		});
		const game = withDecision(base, decision);
		const result = resolveDecision(game, decision.id, 'accept');
		expect(result).toMatchObject({ ok: false, code: 'effect-rejected' });
		expect(result.game).toBe(game);
	});

	it('rejects a store-morale-adjust with wrong scope', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision({
			options: [
				{
					id: 'accept',
					effects: [{ kind: 'store-morale-adjust', scope: 'single-store' as never, amount: 5 }],
					modifiers: []
				}
			]
		});
		const game = withDecision(base, decision);
		const result = resolveDecision(game, decision.id, 'accept');
		expect(result).toMatchObject({ ok: false, code: 'effect-rejected' });
		expect(result.game).toBe(game);
	});

	it('rejects a store-stock-adjust with wrong scope', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision({
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
		});
		const game = withDecision(base, decision);
		const result = resolveDecision(game, decision.id, 'accept');
		expect(result).toMatchObject({ ok: false, code: 'effect-rejected' });
		expect(result.game).toBe(game);
	});

	it('rejects an unknown effect kind', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision({
			options: [{ id: 'accept', effects: [{ kind: 'unknown-kind' as never }], modifiers: [] }]
		});
		const game = withDecision(base, decision);
		const result = resolveDecision(game, decision.id, 'accept');
		expect(result).toMatchObject({ ok: false, code: 'effect-rejected' });
		expect(result.game).toBe(game);
	});
});
