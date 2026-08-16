import type { EventDefinition, NormalizedEventCatalog } from './eventDefinitions';
import { appendHistory } from './eventHistory';
import { assessCredit } from './finance';
import { cloneTimedEffect } from './eventModifiers';
import { createRngFromState, normalizeSeed, type Rng } from './rng';
import {
	cloneEventTarget,
	getEventTargetCopyParams,
	isEventTargetEligibleForSelection,
	resolveEventTargets,
	sameEventTarget
} from './eventTargets';
import type {
	EventCondition,
	EventCooldownRecord,
	EventDecisionItem,
	EventImmediateEffect,
	EventRuntimeState,
	EventSelectionPolicy,
	EventTarget,
	GameState
} from './types';

export const EVENT_SELECTION_SCHEMA_VERSION = 1;
export const EVENT_DRAW_COUNT_PER_DAY = 3;

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

	const candidates = catalog.definitions.flatMap((definition) => {
		const targets = resolveEligibleTargets(game, definition, eventRuntime.cooldowns);
		return targets.length === 0 ? [] : [{ definition, targets }];
	});
	const selected = selectCandidate(candidates, cadenceDraw, weightedDraw);
	if (!selected) return { ...game, events: eventRuntime };

	const target = materializeTarget(selected.definition, selected.targets, materializationRng);
	const instance = materializeEvent(
		game,
		selected.definition,
		eventRuntime.nextInstanceSequence,
		target
	);
	const cooldown: EventCooldownRecord = {
		eventId: selected.definition.id,
		target: cloneEventTarget(instance.target),
		generatedOnDay: game.day,
		eligibleOnDay: game.day + selected.definition.cooldownDays
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
						candidate.eventId !== cooldown.eventId ||
						!sameEventTarget(candidate.target, cooldown.target)
				),
				cooldown
			],
			history: appendHistory(eventRuntime.history, {
				kind: 'event-generated',
				day: game.day,
				eventId: selected.definition.id,
				instanceId: instance.id,
				target: cloneEventTarget(instance.target)
			})
		}
	};
}

function resolveEligibleTargets(
	game: GameState,
	definition: EventDefinition,
	cooldowns: readonly EventCooldownRecord[]
): EventTarget[] {
	if (!conditionMatches(definition.condition, game)) return [];
	return resolveEventTargets(game, definition.target).filter(
		(target) =>
			isEventTargetEligibleForSelection(game, target) &&
			!hasPendingEvent(game, definition.id, target) &&
			!hasActiveCooldown(game.day, cooldowns, definition.id, target)
	);
}

function hasPendingEvent(game: GameState, eventId: string, target: EventTarget): boolean {
	return game.decisions.some(
		(decision) =>
			decision.kind === 'event' &&
			decision.eventId === eventId &&
			sameEventTarget(decision.target, target)
	);
}

function hasActiveCooldown(
	day: number,
	cooldowns: readonly EventCooldownRecord[],
	eventId: string,
	target: EventTarget
): boolean {
	return cooldowns.some(
		(cooldown) =>
			cooldown.eventId === eventId &&
			sameEventTarget(cooldown.target, target) &&
			day < cooldown.eligibleOnDay
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

interface SelectionCandidate {
	definition: EventDefinition;
	targets: readonly EventTarget[];
}

type ForcedSelection = Extract<EventSelectionPolicy, { kind: 'forced' }>;
type WeightedSelection = Extract<EventSelectionPolicy, { kind: 'weighted' }>;

function isForcedCandidate(candidate: SelectionCandidate): candidate is SelectionCandidate & {
	definition: EventDefinition & { selection: ForcedSelection };
} {
	return candidate.definition.selection.kind === 'forced';
}

function isWeightedCandidate(candidate: SelectionCandidate): candidate is SelectionCandidate & {
	definition: EventDefinition & { selection: WeightedSelection };
} {
	const selection = candidate.definition.selection;
	return selection.kind === 'weighted' && selection.weight > 0;
}

function selectCandidate(
	candidates: readonly SelectionCandidate[],
	cadenceDraw: number,
	weightedDraw: number
): SelectionCandidate | undefined {
	const forced = candidates
		.filter(isForcedCandidate)
		.sort(
			(first, second) =>
				second.definition.selection.priority - first.definition.selection.priority ||
				compareCodeUnits(first.definition.id, second.definition.id)
		);
	if (forced[0]) return forced[0];
	if (cadenceDraw >= WEIGHTED_EVENT_CADENCE) return undefined;

	const weighted = candidates
		.filter(isWeightedCandidate)
		.sort((first, second) => compareCodeUnits(first.definition.id, second.definition.id));
	const totalWeight = weighted.reduce(
		(total, candidate) => total + candidate.definition.selection.weight,
		0
	);
	let threshold = weightedDraw * totalWeight;
	for (const candidate of weighted) {
		threshold -= candidate.definition.selection.weight;
		if (threshold < 0) return candidate;
	}
	return weighted[weighted.length - 1];
}

function compareCodeUnits(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0;
}

function materializeTarget(
	definition: EventDefinition,
	targets: readonly EventTarget[],
	materializationRng: Rng
): EventTarget {
	if (definition.target.kind === 'company') {
		return { kind: 'company' };
	}
	const draw = materializationRng.next();
	return targets[Math.min(Math.floor(draw * targets.length), targets.length - 1)];
}

function materializeEvent(
	game: GameState,
	definition: EventDefinition,
	sequence: number,
	target: EventTarget
): EventDecisionItem {
	return {
		kind: 'event',
		id: `event-instance-${sequence}`,
		eventId: definition.id,
		definitionVersion: definition.version,
		generatedOnDay: game.day,
		expiresOnDay: game.day + definition.expiresAfterDays,
		target: cloneEventTarget(target),
		copy: {
			...definition.copy,
			params: { ...definition.copy.params, ...getEventTargetCopyParams(game, target) }
		},
		options: definition.options.map((option) => ({
			id: option.id,
			effects: option.effects.map((effect) => materializeEffect(game, effect)),
			modifiers: option.modifiers.map((modifier) => ({
				...modifier,
				effect: cloneTimedEffect(modifier.effect),
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
