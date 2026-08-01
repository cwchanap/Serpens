import type { EventDefinition, NormalizedEventCatalog } from './eventDefinitions';
import { assessCredit } from './finance';
import { createRngFromState, normalizeSeed } from './rng';
import type {
	EventCondition,
	EventCooldownRecord,
	EventDecisionItem,
	EventImmediateEffect,
	EventRuntimeState,
	EventTarget,
	GameState
} from './types';

export const EVENT_SELECTION_SCHEMA_VERSION = 1;
export const EVENT_DRAW_COUNT_PER_DAY = 3;
export const EVENT_HISTORY_LIMIT = 200;

const EVENT_RNG_SALT = 0x45564e54;
const WEIGHTED_EVENT_CADENCE = 0.12;

export type { EventCooldownRecord, EventHistoryEntry, EventRuntimeState } from './types';

export function createInitialEventRuntime(seed: number): EventRuntimeState {
	return {
		selectionSchemaVersion: EVENT_SELECTION_SCHEMA_VERSION,
		rngState: normalizeSeed(seed + EVENT_RNG_SALT),
		nextInstanceSequence: 1,
		nextModifierSequence: 1,
		cooldowns: [],
		activeModifiers: [],
		history: []
	};
}

export function selectEventForDay(game: GameState, catalog: NormalizedEventCatalog): GameState {
	const packet = createRngFromState(game.events.rngState);
	const cadenceDraw = packet.next();
	const weightedDraw = packet.next();
	const materializationSeedDraw = packet.next();
	const eventRuntime = {
		...game.events,
		rngState: packet.getState(),
		cooldowns: game.events.cooldowns.filter((cooldown) => cooldown.eligibleOnDay > game.day)
	};
	const materializationRng = createRngFromState(
		normalizeSeed(Math.floor(materializationSeedDraw * 2_147_483_646) + 1)
	);
	void materializationRng;

	const candidates = catalog.definitions.filter((definition) =>
		isEligible(game, definition, eventRuntime.cooldowns)
	);
	const selected = selectCandidate(candidates, cadenceDraw, weightedDraw);
	if (!selected) return { ...game, events: eventRuntime };

	const instance = materializeEvent(game, selected, eventRuntime.nextInstanceSequence);
	const cooldown: EventCooldownRecord = {
		eventId: selected.id,
		target: cloneTarget(instance.target),
		generatedOnDay: game.day,
		eligibleOnDay: game.day + selected.cooldownDays
	};

	return {
		...game,
		decisions: [...game.decisions, instance],
		events: {
			...eventRuntime,
			nextInstanceSequence: eventRuntime.nextInstanceSequence + 1,
			cooldowns: [
				...eventRuntime.cooldowns.filter(
					(candidate) =>
						candidate.eventId !== cooldown.eventId || !sameTarget(candidate.target, cooldown.target)
				),
				cooldown
			],
			history: appendHistory(eventRuntime.history, {
				kind: 'event-generated',
				day: game.day,
				eventId: selected.id,
				instanceId: instance.id,
				target: cloneTarget(instance.target)
			})
		}
	};
}

function isEligible(
	game: GameState,
	definition: EventDefinition,
	cooldowns: readonly EventCooldownRecord[]
): boolean {
	if (!conditionMatches(definition.condition, game)) return false;
	if (
		game.decisions.some(
			(decision) =>
				decision.kind === 'event' &&
				decision.eventId === definition.id &&
				sameTarget(decision.target, definition.target)
		)
	)
		return false;
	return !cooldowns.some(
		(cooldown) =>
			cooldown.eventId === definition.id &&
			sameTarget(cooldown.target, definition.target) &&
			game.day < cooldown.eligibleOnDay
	);
}

function conditionMatches(condition: EventCondition, game: GameState): boolean {
	switch (condition.kind) {
		case 'always':
			return true;
		case 'all':
			return condition.conditions.every((candidate) => conditionMatches(candidate, game));
		case 'day-at-least':
			return game.day >= condition.day;
		case 'cash-below':
			return game.cash < condition.amount;
		case 'cash-at-least':
			return game.cash >= condition.amount;
		case 'score-at-least':
			return game.scorecard[condition.score] >= condition.value;
		case 'store-count-below-cap':
			return game.stores.length < game.storeCap;
	}
}

function selectCandidate(
	candidates: readonly EventDefinition[],
	cadenceDraw: number,
	weightedDraw: number
): EventDefinition | undefined {
	const forced = candidates
		.filter((candidate) => candidate.selection.kind === 'forced')
		.sort(
			(first, second) =>
				(second.selection.kind === 'forced' ? second.selection.priority : 0) -
					(first.selection.kind === 'forced' ? first.selection.priority : 0) ||
				compareCodeUnits(first.id, second.id)
		);
	if (forced[0]) return forced[0];
	if (cadenceDraw >= WEIGHTED_EVENT_CADENCE) return undefined;

	const weighted = candidates
		.filter(
			(candidate) => candidate.selection.kind === 'weighted' && candidate.selection.weight > 0
		)
		.sort((first, second) => compareCodeUnits(first.id, second.id));
	const totalWeight = weighted.reduce(
		(total, candidate) =>
			total + (candidate.selection.kind === 'weighted' ? candidate.selection.weight : 0),
		0
	);
	let threshold = weightedDraw * totalWeight;
	for (const candidate of weighted) {
		if (candidate.selection.kind !== 'weighted') continue;
		threshold -= candidate.selection.weight;
		if (threshold < 0) return candidate;
	}
	return weighted[weighted.length - 1];
}

function compareCodeUnits(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0;
}

function materializeEvent(
	game: GameState,
	definition: EventDefinition,
	sequence: number
): EventDecisionItem {
	const target: EventTarget = cloneTarget(definition.target);
	return {
		kind: 'event',
		id: `event-instance-${sequence}`,
		eventId: definition.id,
		definitionVersion: definition.version,
		generatedOnDay: game.day,
		expiresOnDay: game.day + definition.expiresAfterDays,
		target,
		copy: { ...definition.copy, params: { ...definition.copy.params } },
		options: definition.options.map((option) => ({
			id: option.id,
			effects: option.effects.map((effect) => materializeEffect(game, effect)),
			modifiers: option.modifiers.map((modifier) => ({
				...modifier,
				effect: { ...modifier.effect, target: { ...modifier.effect.target } },
				explanation: { ...modifier.explanation, params: { ...modifier.explanation.params } }
			}))
		}))
	};
}

function materializeEffect(
	game: GameState,
	effect: EventDefinition['options'][number]['effects'][number]
): EventImmediateEffect {
	if (effect.kind !== 'finance-borrow' || effect.amount !== 'available-credit-clamped') {
		return { ...effect } as EventImmediateEffect;
	}
	const roundedAvailableCredit =
		Math.floor(assessCredit(game, effect.termDays).availableCredit / 1_000) * 1_000;
	return {
		...effect,
		amount: Math.min(12_000, Math.max(4_000, roundedAvailableCredit))
	};
}

function appendHistory<T>(history: readonly T[], entry: T): T[] {
	return [...history, entry].slice(-EVENT_HISTORY_LIMIT);
}

function cloneTarget(target: EventTarget): EventTarget {
	return { ...target };
}

function sameTarget(first: EventTarget, second: EventTarget): boolean {
	return first.kind === second.kind;
}
