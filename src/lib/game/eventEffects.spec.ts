import { describe, expect, it } from 'vitest';
import { pauseRecurringRoute, removeRecurringRoute } from './interCityLogistics';
import { createTwoIndustryCityGame, withRecurringRoutes } from './interCityLogistics.testUtils';
import { validateCurrentGameState } from '$lib/persistence/saveCodec';
import { calculateStockHealth, getStoreProductStock } from './stock';
import { createNewGame, getDecisionOptionAvailability, resolveDecision } from './state';
import type {
	EventDecisionItem,
	EventTimedEffect,
	GameState,
	RecurringRoute,
	SystemDecisionItem
} from './types';

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

function routeGame(): GameState {
	return withRecurringRoutes(createTwoIndustryCityGame({ seed: 7 }), [route()]);
}

function competitorDecision(
	base: GameState,
	effects: readonly unknown[],
	competitorId = base.competitors[0]?.id ?? 'competitor-harbor-city-1'
): EventDecisionItem {
	return eventDecision({
		target: { kind: 'competitor', competitorId } as never,
		options: [{ id: 'accept', effects: effects as never, modifiers: [] }]
	});
}

function routeSuspensionDecision(): EventDecisionItem {
	return eventDecision({
		id: 'route-event-instance',
		eventId: 'route-disruption',
		expiresOnDay: 30,
		target: { kind: 'recurring-route', routeId: 'route-1' },
		copy: {
			key: 'events.routeDisruption',
			params: {
				routeId: 'route-1',
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water'
			}
		},
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
						explanation: { key: 'events.routeDisruption.suspension', params: {} },
						importance: 'important'
					}
				]
			}
		]
	});
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
				lots: [
					{ receivedDay: 1, quantity: 50 },
					{ receivedDay: 3, quantity: 50 }
				],
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
		expect(getStoreProductStock(result.game.stores[0]!.products[0]!)).toBe(84);
		expect(result.game.stores[0]!.products[0]!.lots).toEqual([
			{ receivedDay: 1, quantity: 34 },
			{ receivedDay: 3, quantity: 50 }
		]);
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

	it('appends a game-day lot for a positive stock adjustment', () => {
		const base = createNewGame('grocery', 56);
		const firstStore = {
			...base.stores[0]!,
			products: base.stores[0]!.products.map((product) => ({
				...product,
				lots: [{ receivedDay: 1, quantity: 100 }],
				targetStock: 200
			}))
		};
		const decision = eventDecision({
			id: 'event-positive-stock',
			expiresOnDay: 7,
			options: [
				{
					id: 'accept',
					effects: [
						{ kind: 'store-stock-adjust-by-target-percent', scope: 'all-stores', percent: 8 }
					],
					modifiers: []
				}
			]
		});
		const game = withDecision({ ...base, day: 5, stores: [firstStore] }, decision);
		const result = resolveDecision(game, decision.id, 'accept');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const product = result.game.stores[0]!.products[0]!;
		expect(product.lots).toEqual([
			{ receivedDay: 1, quantity: 100 },
			{ receivedDay: game.day, quantity: 16 }
		]);
		expect(getStoreProductStock(product)).toBe(116);
	});

	it('caps a positive stock adjustment so the total stays within the safe-integer range', () => {
		const base = createNewGame('grocery', 56);
		const firstStore = {
			...base.stores[0]!,
			products: base.stores[0]!.products.map((product) => ({
				...product,
				lots: [{ receivedDay: 1, quantity: Number.MAX_SAFE_INTEGER - 10 }],
				targetStock: Number.MAX_SAFE_INTEGER - 1
			}))
		};
		const decision = eventDecision({
			id: 'event-positive-stock-overflow',
			expiresOnDay: 7,
			options: [
				{
					id: 'accept',
					effects: [
						{ kind: 'store-stock-adjust-by-target-percent', scope: 'all-stores', percent: 6 }
					],
					modifiers: []
				}
			]
		});
		const game = withDecision({ ...base, day: 5, stores: [firstStore] }, decision);
		const result = resolveDecision(game, decision.id, 'accept');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const product = result.game.stores[0]!.products[0]!;
		expect(getStoreProductStock(product)).toBe(Number.MAX_SAFE_INTEGER);
		expect(Number.isSafeInteger(getStoreProductStock(product))).toBe(true);
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
			options: [{ id: 'accept', effects: [{ kind: 'unknown-kind' } as never], modifiers: [] }]
		});
		const game = withDecision(base, decision);
		const result = resolveDecision(game, decision.id, 'accept');
		expect(result).toMatchObject({ ok: false, code: 'effect-rejected' });
		expect(result.game).toBe(game);
	});

	it('returns finance-unavailable without credit reasons when borrow fails for a non-credit reason', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision({
			options: [
				{
					id: 'accept',
					effects: [
						{
							kind: 'finance-borrow',
							purpose: 'emergency',
							amount: 0,
							termDays: 28
						}
					],
					modifiers: []
				}
			]
		});
		const game = withDecision(base, decision);
		const result = resolveDecision(game, decision.id, 'accept');
		expect(result).toMatchObject({
			ok: false,
			code: 'finance-unavailable',
			financeFailure: 'invalidAmount'
		});
		expect(result).not.toHaveProperty('reasons');
		expect(result.game).toBe(game);
	});

	it('resolves a route event after its route is paused and stores the route-targeted modifier', () => {
		const paused = pauseRecurringRoute(routeGame(), 'route-1');
		if (!paused.ok) throw new Error(`Expected pause, received ${paused.reason}`);
		const decision = routeSuspensionDecision();
		const game = withDecision(paused.game, decision);

		expect(getDecisionOptionAvailability(game, decision, 'accept')).toEqual({ available: true });
		const result = resolveDecision(game, decision.id, 'accept');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.decisions).toEqual([]);
		expect(result.game.events.activeModifiers).toEqual([
			expect.objectContaining({
				id: 'event-modifier-1',
				target: { kind: 'recurring-route', routeId: 'route-1' },
				effect: { kind: 'route-dispatch-suspension' },
				stackingKey: 'route-disruption:route'
			})
		]);
	});

	it('rejects a route event atomically after its route is removed and commits nothing', () => {
		const removed = removeRecurringRoute(routeGame(), 'route-1');
		if (!removed.ok) throw new Error(`Expected removal, received ${removed.reason}`);
		const decision = routeSuspensionDecision();
		const game = withDecision(removed.game, decision);

		expect(getDecisionOptionAvailability(game, decision, 'accept')).toMatchObject({
			available: false,
			code: 'effect-rejected',
			context: { payload: 'target' }
		});
		const result = resolveDecision(game, decision.id, 'accept');

		expect(result).toMatchObject({
			ok: false,
			code: 'effect-rejected',
			context: { payload: 'target' }
		});
		expect(result.game).toBe(game);
		expect(game.events.activeModifiers).toEqual([]);
		expect(game.events.history).toEqual(removed.game.events.history);
	});

	it('rejects a route-targeted modifier whose effect kind is incompatible with the target', () => {
		const decision = eventDecision({
			id: 'route-event-instance',
			eventId: 'route-disruption',
			expiresOnDay: 30,
			target: { kind: 'recurring-route', routeId: 'route-1' },
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
		const game = withDecision(routeGame(), decision);
		const result = resolveDecision(game, decision.id, 'accept');

		expect(result).toMatchObject({
			ok: false,
			code: 'effect-rejected',
			context: { modifierIndex: 0, payload: 'modifier' }
		});
		expect(result.game).toBe(game);
		expect(game.events.activeModifiers).toEqual([]);
	});

	it.each([
		{
			effectKind: 'route-lead-time-adjustment',
			effect: { kind: 'route-lead-time-adjustment', days: 1 } as EventTimedEffect
		},
		{
			effectKind: 'route-capacity-multiplier',
			effect: { kind: 'route-capacity-multiplier', multiplier: 0.8 } as EventTimedEffect
		},
		{
			effectKind: 'route-transport-cost-multiplier',
			effect: { kind: 'route-transport-cost-multiplier', multiplier: 1.5 } as EventTimedEffect
		}
	])(
		'resolves a route event with a valid $effectKind modifier and stores the active modifier',
		({ effect }) => {
			const decision = eventDecision({
				id: 'route-event-instance',
				eventId: 'route-disruption',
				expiresOnDay: 30,
				target: { kind: 'recurring-route', routeId: 'route-1' },
				copy: {
					key: 'events.routeDisruption',
					params: {
						routeId: 'route-1',
						originCityId: 'industry-city',
						destinationCityId: 'breadbasket-basin',
						materialId: 'water'
					}
				},
				options: [
					{
						id: 'accept',
						effects: [],
						modifiers: [
							{
								durationDays: 3,
								stackingKey: 'route-disruption:route',
								stackingRule: 'replace',
								effect,
								explanation: { key: 'events.routeDisruption.modifier', params: {} },
								importance: 'important'
							}
						]
					}
				]
			});
			const game = withDecision(routeGame(), decision);

			expect(getDecisionOptionAvailability(game, decision, 'accept')).toEqual({
				available: true
			});
			const result = resolveDecision(game, decision.id, 'accept');

			expect(result.ok).toBe(true);
			if (!result.ok) return;
			expect(result.game.events.activeModifiers).toHaveLength(1);
			expect(result.game.events.activeModifiers[0]).toMatchObject({
				target: { kind: 'recurring-route', routeId: 'route-1' },
				effect
			});
		}
	);

	it('rejects a company-targeted modifier whose effect kind is a route effect', () => {
		const decision = eventDecision({
			options: [
				{
					id: 'accept',
					effects: [],
					modifiers: [
						{
							durationDays: 3,
							stackingKey: 'route-disruption:company',
							stackingRule: 'replace',
							effect: { kind: 'route-capacity-multiplier', multiplier: 0.8 },
							explanation: { key: 'events.fixture.modifier', params: {} },
							importance: 'important'
						}
					]
				}
			]
		});
		const game = withDecision(createNewGame('grocery', 55), decision);
		const result = resolveDecision(game, decision.id, 'accept');

		expect(result).toMatchObject({
			ok: false,
			code: 'effect-rejected',
			context: { modifierIndex: 0, payload: 'modifier' }
		});
	});

	it('rejects a competitor-targeted modifier whose effect kind is not attraction', () => {
		const base = createNewGame('grocery', 55);
		const decision = competitorDecision(base, []);
		decision.options[0]!.modifiers = [
			{
				durationDays: 3,
				stackingKey: 'route-disruption:competitor',
				stackingRule: 'replace',
				effect: { kind: 'route-capacity-multiplier', multiplier: 0.8 },
				explanation: { key: 'events.fixture.modifier', params: {} },
				importance: 'important'
			}
		];
		const game = withDecision(base, decision);
		const result = resolveDecision(game, decision.id, 'accept');

		expect(result).toMatchObject({
			ok: false,
			code: 'effect-rejected',
			context: { modifierIndex: 0, payload: 'modifier' }
		});
		expect(result.game).toBe(game);
	});

	it('applies typed competitor status, posture, and canonical product-focus effects atomically', () => {
		const base = createNewGame('grocery', 55);
		const rival = base.competitors[0]!;
		const decision = competitorDecision(base, [
			{ kind: 'competitor-status-set', status: 'closed' },
			{ kind: 'competitor-price-posture-set', pricePosture: 'premium' },
			{ kind: 'competitor-product-focus-set', productFocus: ['grocery-food', 'beverages'] }
		]);
		const game = withDecision(base, decision);

		const result = resolveDecision(game, decision.id, 'accept');

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		const updated = result.game.competitors.find((candidate) => candidate.id === rival.id)!;
		expect(updated.status).toBe('closed');
		expect(updated.pricePosture).toBe('premium');
		expect(updated.productFocus).toEqual(['beverages', 'grocery-food']);
	});

	it('rejects a focus incompatible with a specialist brand and keeps the game save-valid', () => {
		const base = createNewGame('grocery', 55);
		const specialist: (typeof base.competitors)[number] = {
			...base.competitors[0]!,
			productFocus: ['grocery-food'],
			brandIds: ['fresh-field']
		};
		const rivalGame = {
			...base,
			competitors: [specialist, ...base.competitors.slice(1)],
			events: { ...base.events, nextInstanceSequence: 2 }
		};
		const decision = competitorDecision(rivalGame, [
			{ kind: 'competitor-product-focus-set', productFocus: ['beverages'] }
		]);
		const game = withDecision(rivalGame, decision);

		const result = resolveDecision(game, decision.id, 'accept');

		expect(result).toMatchObject({ ok: false, code: 'effect-rejected' });
		expect(result.game).toBe(game);
		expect(result.game.competitors[0]).toEqual(specialist);
		expect(() => validateCurrentGameState(result.game)).not.toThrow();
	});

	it('rejects competitor effects when the event target is not a competitor without mutation', () => {
		const base = createNewGame('grocery', 55);
		const decision = eventDecision({
			target: { kind: 'company' },
			options: [
				{
					id: 'accept',
					effects: [{ kind: 'competitor-status-set', status: 'closed' } as never],
					modifiers: []
				}
			]
		});
		const game = withDecision(base, decision);

		const result = resolveDecision(game, decision.id, 'accept');

		expect(result).toMatchObject({ ok: false, code: 'effect-rejected' });
		expect(result.game).toBe(game);
		expect(game.competitors).toEqual(base.competitors);
	});

	it('rejects a competitor effect for an unknown rival atomically', () => {
		const base = createNewGame('grocery', 55);
		const decision = competitorDecision(
			base,
			[{ kind: 'competitor-status-set', status: 'closed' }],
			'competitor-harbor-city-99'
		);
		const game = withDecision(base, decision);

		const result = resolveDecision(game, decision.id, 'accept');

		expect(result).toMatchObject({
			ok: false,
			code: 'effect-rejected',
			context: { payload: 'target' }
		});
		expect(result.game).toBe(game);
	});

	it.each([
		{ kind: 'competitor-price-posture-set', pricePosture: 'aggressive' },
		{ kind: 'competitor-status-set', status: 'paused' }
	])('rejects an invalid competitor enum effect atomically', (effect) => {
		const base = createNewGame('grocery', 55);
		const decision = competitorDecision(base, [effect]);
		const game = withDecision(base, decision);

		const result = resolveDecision(game, decision.id, 'accept');

		expect(result).toMatchObject({ ok: false, code: 'effect-rejected' });
		expect(result.game).toBe(game);
	});

	it.each([
		[] as string[],
		['beverages', 'beverages'],
		['beverages', 'fashion', 'electronics'],
		['unknown-family']
	] as string[][])(
		'rejects a product focus that is not one or two unique known families',
		(productFocus) => {
			const base = createNewGame('grocery', 55);
			const decision = competitorDecision(base, [
				{ kind: 'competitor-product-focus-set', productFocus }
			]);
			const game = withDecision(base, decision);

			const result = resolveDecision(game, decision.id, 'accept');

			expect(result).toMatchObject({ ok: false, code: 'effect-rejected' });
			expect(result.game).toBe(game);
		}
	);
});
