import {
	assessCredit,
	borrow,
	type CreditAssessmentReason,
	type FinanceFailureCode
} from './finance';
import { BRANDS } from './brands';
import { appendHistory } from './eventHistory';
import { activateEventModifiers } from './eventModifiers';
import { isEventTargetResolvable, compareCodeUnits } from './eventTargets';
import { clampScore } from './reports';
import { addStoreProductStockLot, calculateStockHealth, consumeStoreProductStock } from './stock';
import {
	ALL_PRODUCT_FAMILIES,
	PRICING_POSTURES,
	type DecisionItem,
	type EventDecisionItem,
	type EventImmediateEffect,
	type EventModifierTemplate,
	type EventTarget,
	type EventTimedEffect,
	type GameState,
	type MarketCompetitor,
	type ProductFamilyId,
	type ScoreKey
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
						const products = store.products.map((product) => {
							const units = Math.abs(Math.round(product.targetStock * effect.percent * 0.01));
							if (units === 0) return { ...product, lots: product.lots.map((lot) => ({ ...lot })) };
							return effect.percent > 0
								? addStoreProductStockLot(product, {
										receivedDay: tentativeGame.day,
										quantity: units
									})
								: consumeStoreProductStock(product, units);
						});
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
		case 'competitor-status-set':
			if (effect.status !== 'active' && effect.status !== 'closed') return rejected();
			return updateCompetitor(
				originalGame,
				tentativeGame,
				decision,
				optionId,
				effectIndex,
				(competitor) => ({
					...competitor,
					status: effect.status
				})
			);
		case 'competitor-price-posture-set':
			if (!PRICING_POSTURES.includes(effect.pricePosture)) return rejected();
			return updateCompetitor(
				originalGame,
				tentativeGame,
				decision,
				optionId,
				effectIndex,
				(competitor) => ({
					...competitor,
					pricePosture: effect.pricePosture
				})
			);
		case 'competitor-product-focus-set': {
			const productFocus = normalizeProductFocus(effect.productFocus);
			if (!productFocus) return rejected();
			return updateCompetitor(
				originalGame,
				tentativeGame,
				decision,
				optionId,
				effectIndex,
				(competitor) =>
					competitorBrandsSupportFocus(competitor, productFocus)
						? { ...competitor, productFocus }
						: null
			);
		}
		default:
			return rejected();
	}
}

function updateCompetitor(
	originalGame: GameState,
	tentativeGame: GameState,
	decision: EventDecisionItem,
	optionId: string,
	effectIndex: number,
	update: (competitor: MarketCompetitor) => MarketCompetitor | null
): PreparedResolution {
	const target = decision.target;
	if (target.kind !== 'competitor') {
		return failure(originalGame, 'effect-rejected', {
			decisionId: decision.id,
			optionId,
			effectIndex,
			payload: 'target'
		});
	}
	const competitorIndex = tentativeGame.competitors.findIndex(
		(competitor) => competitor.id === target.competitorId
	);
	if (competitorIndex < 0) {
		return failure(originalGame, 'effect-rejected', {
			decisionId: decision.id,
			optionId,
			effectIndex,
			payload: 'target'
		});
	}
	const updatedCompetitor = update(tentativeGame.competitors[competitorIndex]!);
	if (updatedCompetitor === null) {
		return failure(originalGame, 'effect-rejected', {
			decisionId: decision.id,
			optionId,
			effectIndex,
			payload: 'effect'
		});
	}
	return {
		ok: true,
		game: {
			...tentativeGame,
			competitors: tentativeGame.competitors.map((competitor, index) =>
				index === competitorIndex ? updatedCompetitor : competitor
			)
		}
	};
}

function competitorBrandsSupportFocus(
	competitor: MarketCompetitor,
	productFocus: readonly ProductFamilyId[]
): boolean {
	return competitor.brandIds.every((brandId) => {
		const brand = BRANDS[brandId];
		return (
			brand !== undefined &&
			brand.supportedFamilyIds.some((familyId) => productFocus.includes(familyId))
		);
	});
}

function normalizeProductFocus(value: unknown): ProductFamilyId[] | null {
	if (!Array.isArray(value) || value.length < 1 || value.length > 2) return null;
	if (
		value.some(
			(candidate) =>
				typeof candidate !== 'string' ||
				!ALL_PRODUCT_FAMILIES.includes(candidate as ProductFamilyId)
		)
	) {
		return null;
	}
	const unique = [...new Set(value as ProductFamilyId[])];
	if (unique.length !== value.length) return null;
	return unique.sort(compareCodeUnits);
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
	if (target.kind === 'company')
		return effect.kind === 'import-cost-multiplier' && isValidTimedEffect(effect);
	if (target.kind === 'competitor') {
		return effect.kind === 'competitor-attraction-multiplier' && isValidTimedEffect(effect);
	}
	if (
		effect.kind === 'import-cost-multiplier' ||
		effect.kind === 'competitor-attraction-multiplier'
	) {
		return false;
	}
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
		case 'competitor-attraction-multiplier':
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
