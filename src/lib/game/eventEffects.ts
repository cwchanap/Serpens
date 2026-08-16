import {
	assessCredit,
	borrow,
	type CreditAssessmentReason,
	type FinanceFailureCode
} from './finance';
import { appendHistory } from './eventHistory';
import { activateEventModifiers } from './eventModifiers';
import { isEventTargetResolvable } from './eventTargets';
import { clampScore } from './reports';
import { calculateStockHealth } from './stock';
import type {
	DecisionItem,
	EventDecisionItem,
	EventImmediateEffect,
	EventModifierTemplate,
	EventTarget,
	EventTimedEffect,
	GameState,
	ScoreKey
} from './types';
import { refreshWorldProgress } from './world';

export type DecisionResolutionFailureCode =
	| 'decision-not-found'
	| 'option-not-found'
	| 'decision-expired'
	| 'finance-unavailable'
	| 'effect-rejected';

const DECISION_FAILURE_CODES: ReadonlySet<DecisionResolutionFailureCode> = new Set([
	'decision-not-found',
	'option-not-found',
	'decision-expired',
	'finance-unavailable',
	'effect-rejected'
]);

export function isDecisionFailureCode(code: string): code is DecisionResolutionFailureCode {
	return (DECISION_FAILURE_CODES as Set<string>).has(code);
}

export type DecisionResolutionResult =
	| { ok: true; game: GameState; decisionKind: 'system' | 'event' }
	| {
			ok: false;
			game: GameState;
			code: DecisionResolutionFailureCode;
			context: Record<string, string | number>;
			financeFailure?: FinanceFailureCode;
	  };

export type DecisionOptionAvailability =
	| { available: true }
	| {
			available: false;
			code: DecisionResolutionFailureCode;
			context: Record<string, string | number>;
			financeFailure?: FinanceFailureCode;
			reasons?: CreditAssessmentReason[];
	  };

type ResolutionFailure = Extract<DecisionResolutionResult, { ok: false }>;
type PreparedResolution = { ok: true; game: GameState } | ResolutionFailure;

const SCORE_KEYS: readonly ScoreKey[] = [
	'profit',
	'customerSatisfaction',
	'staffMorale',
	'marketPosition'
];

export function getDecisionOptionAvailability(
	game: GameState,
	decision: DecisionItem,
	optionId: string
): DecisionOptionAvailability {
	const persisted = game.decisions.find((candidate) => candidate.id === decision.id);
	if (!persisted) {
		return unavailable(failure(game, 'decision-not-found', { decisionId: decision.id }));
	}
	const prepared = prepareDecision(game, persisted, optionId);
	return prepared.ok ? { available: true } : unavailable(prepared);
}

export function resolveDecision(
	game: GameState,
	decisionId: string,
	optionId: string
): DecisionResolutionResult {
	const decision = game.decisions.find((candidate) => candidate.id === decisionId);
	if (!decision) return failure(game, 'decision-not-found', { decisionId });

	const prepared = prepareDecision(game, decision, optionId);
	if (!prepared.ok) return prepared;

	let events = prepared.game.events;
	if (decision.kind === 'event') {
		events = {
			...events,
			history: appendHistory(events.history, {
				kind: 'event-resolved',
				day: game.day,
				eventId: decision.eventId,
				instanceId: decision.id,
				optionId,
				target: { ...decision.target }
			})
		};
	}

	return {
		ok: true,
		decisionKind: decision.kind,
		game: refreshWorldProgress({
			...prepared.game,
			events,
			decisions: prepared.game.decisions.filter((candidate) => candidate.id !== decisionId)
		})
	};
}

function prepareDecision(
	game: GameState,
	decision: DecisionItem,
	optionId: string
): PreparedResolution {
	if (!decision.options.some((candidate) => candidate.id === optionId)) {
		return failure(game, 'option-not-found', { decisionId: decision.id, optionId });
	}
	if (game.day > decision.expiresOnDay) {
		return failure(game, 'decision-expired', {
			decisionId: decision.id,
			day: game.day,
			expiresOnDay: decision.expiresOnDay
		});
	}
	if (decision.kind === 'system') return { ok: true, game };
	const option = decision.options.find((candidate) => candidate.id === optionId)!;
	if (!isEventTargetResolvable(game, decision.target)) {
		return failure(game, 'effect-rejected', {
			decisionId: decision.id,
			optionId,
			payload: 'target'
		});
	}

	let tentative = game;
	for (const [effectIndex, effect] of option.effects.entries()) {
		const applied = applyEffect(game, tentative, decision, optionId, effect, effectIndex);
		if (!applied.ok) return applied;
		tentative = applied.game;
	}

	return prepareModifiers(game, tentative, decision, optionId, option.modifiers);
}

function applyEffect(
	originalGame: GameState,
	tentativeGame: GameState,
	decision: EventDecisionItem,
	optionId: string,
	effect: EventImmediateEffect,
	effectIndex: number
): PreparedResolution {
	const rejected = () =>
		failure(originalGame, 'effect-rejected', {
			decisionId: decision.id,
			optionId,
			effectIndex,
			effectKind: typeof effect?.kind === 'string' ? effect.kind : 'unknown'
		});

	if (!effect || typeof effect !== 'object') return rejected();
	switch (effect.kind) {
		case 'cash-adjust':
			if (!Number.isFinite(effect.amount)) return rejected();
			return {
				ok: true,
				game: { ...tentativeGame, cash: tentativeGame.cash + effect.amount }
			};
		case 'score-adjust':
			if (!SCORE_KEYS.includes(effect.score) || !Number.isFinite(effect.amount)) return rejected();
			return {
				ok: true,
				game: {
					...tentativeGame,
					scorecard: {
						...tentativeGame.scorecard,
						[effect.score]: clampScore(tentativeGame.scorecard[effect.score] + effect.amount)
					}
				}
			};
		case 'store-morale-adjust':
			if (effect.scope !== 'all-stores' || !Number.isFinite(effect.amount)) return rejected();
			return {
				ok: true,
				game: {
					...tentativeGame,
					stores: tentativeGame.stores.map((store) => ({
						...store,
						staffMorale: clampScore(store.staffMorale + effect.amount)
					}))
				}
			};
		case 'store-stock-adjust-by-target-percent':
			if (effect.scope !== 'all-stores' || !Number.isFinite(effect.percent)) return rejected();
			return {
				ok: true,
				game: {
					...tentativeGame,
					stores: tentativeGame.stores.map((store) => {
						const products = store.products.map((product) => ({
							...product,
							stock: Math.max(
								0,
								product.stock + Math.round(product.targetStock * effect.percent * 0.01)
							)
						}));
						return { ...store, products, stockHealth: calculateStockHealth(products) };
					})
				}
			};
		case 'finance-borrow': {
			const borrowing = borrow(tentativeGame, effect);
			if (!borrowing.ok) {
				const reasons =
					borrowing.code === 'insufficientCredit' &&
					(effect.termDays === 28 || effect.termDays === 56)
						? assessCredit(tentativeGame, effect.termDays).reasons
						: undefined;
				return failure(
					originalGame,
					'finance-unavailable',
					{
						decisionId: decision.id,
						optionId,
						effectIndex,
						...borrowing.context
					},
					borrowing.code,
					reasons
				);
			}
			return { ok: true, game: borrowing.game };
		}
		default:
			return rejected();
	}
}

function prepareModifiers(
	originalGame: GameState,
	tentativeGame: GameState,
	decision: EventDecisionItem,
	optionId: string,
	templates: readonly EventModifierTemplate[]
): PreparedResolution {
	for (const [modifierIndex, template] of templates.entries()) {
		if (!isValidModifierTemplate(template, decision.target)) {
			return failure(originalGame, 'effect-rejected', {
				decisionId: decision.id,
				optionId,
				modifierIndex,
				payload: 'modifier'
			});
		}
	}

	const activated = activateEventModifiers(
		tentativeGame.events,
		{ eventId: decision.eventId, instanceId: decision.id, optionId },
		decision.target,
		tentativeGame.day,
		templates
	);

	return {
		ok: true,
		game: {
			...tentativeGame,
			events: activated.state
		}
	};
}

function isValidModifierTemplate(template: EventModifierTemplate, target: EventTarget): boolean {
	if (
		template === null ||
		typeof template !== 'object' ||
		!Number.isSafeInteger(template.durationDays) ||
		template.durationDays <= 0 ||
		typeof template.stackingKey !== 'string' ||
		template.stackingKey.length === 0 ||
		template.stackingRule !== 'replace' ||
		typeof template.explanation?.key !== 'string' ||
		template.explanation.key.length === 0 ||
		(template.importance !== 'normal' && template.importance !== 'important')
	) {
		return false;
	}
	const effect = template.effect;
	if (!effect || typeof effect !== 'object') return false;
	if (target.kind === 'company' && effect.kind !== 'import-cost-multiplier') return false;
	if (target.kind === 'recurring-route' && effect.kind === 'import-cost-multiplier') return false;
	return isValidTimedEffect(effect);
}

function isValidTimedEffect(effect: EventTimedEffect): boolean {
	switch (effect.kind) {
		case 'import-cost-multiplier':
			return (
				effect.scope === 'retail-product' &&
				effect.target?.kind === 'all' &&
				Number.isFinite(effect.multiplier) &&
				effect.multiplier > 0
			);
		case 'route-lead-time-adjustment':
			return Number.isSafeInteger(effect.days) && effect.days > 0;
		case 'route-capacity-multiplier':
		case 'route-transport-cost-multiplier':
			return Number.isFinite(effect.multiplier) && effect.multiplier > 0;
		case 'route-dispatch-suspension':
			return true;
	}
}

function failure(
	game: GameState,
	code: DecisionResolutionFailureCode,
	context: Record<string, string | number>,
	financeFailure?: FinanceFailureCode,
	reasons?: CreditAssessmentReason[]
): ResolutionFailure & { reasons?: CreditAssessmentReason[] } {
	return {
		ok: false,
		game,
		code,
		context,
		...(financeFailure === undefined ? {} : { financeFailure }),
		...(reasons === undefined ? {} : { reasons })
	};
}

function unavailable(
	failed: ResolutionFailure & { reasons?: CreditAssessmentReason[] }
): DecisionOptionAvailability {
	return {
		available: false,
		code: failed.code,
		context: failed.context,
		...(failed.financeFailure === undefined ? {} : { financeFailure: failed.financeFailure }),
		...(failed.reasons === undefined ? {} : { reasons: failed.reasons })
	};
}
