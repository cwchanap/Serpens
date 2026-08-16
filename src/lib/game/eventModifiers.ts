import { EVENT_HISTORY_LIMIT } from './eventHistory';
import { cloneEventTarget, sameEventTarget } from './eventTargets';
import type {
	ActiveEventModifier,
	EventHistoryEntry,
	EventModifierSnapshot,
	EventModifierTemplate,
	EventRuntimeState,
	EventTarget,
	EventTimedEffect
} from './types';

export type EventModifierLifecycle = Extract<EventHistoryEntry, { kind: 'modifier-lifecycle' }>;

export interface EventModifierActivationResult {
	state: EventRuntimeState;
	activated: ActiveEventModifier[];
	lifecycle: EventModifierLifecycle[];
}

export function cloneTimedEffect(effect: EventTimedEffect): EventTimedEffect {
	switch (effect.kind) {
		case 'import-cost-multiplier':
			return {
				kind: 'import-cost-multiplier',
				scope: effect.scope,
				target: { kind: 'all' },
				multiplier: effect.multiplier
			};
		case 'route-lead-time-adjustment':
			return { kind: 'route-lead-time-adjustment', days: effect.days };
		case 'route-capacity-multiplier':
			return { kind: 'route-capacity-multiplier', multiplier: effect.multiplier };
		case 'route-dispatch-suspension':
			return { kind: 'route-dispatch-suspension' };
		case 'route-transport-cost-multiplier':
			return { kind: 'route-transport-cost-multiplier', multiplier: effect.multiplier };
	}
}

export function activateEventModifiers(
	state: EventRuntimeState,
	source: ActiveEventModifier['source'],
	target: EventTarget,
	day: number,
	templates: readonly EventModifierTemplate[]
): EventModifierActivationResult {
	let activeModifiers = [...state.activeModifiers];
	let nextModifierSequence = state.nextModifierSequence;
	const activated: ActiveEventModifier[] = [];
	const lifecycle: EventModifierLifecycle[] = [];

	for (const template of templates) {
		const modifier = createModifier(nextModifierSequence, source, target, day, template);
		nextModifierSequence += 1;

		const replaced = activeModifiers.filter(
			(candidate) =>
				candidate.stackingKey === modifier.stackingKey &&
				sameEventTarget(candidate.target, modifier.target)
		);
		activeModifiers = activeModifiers.filter(
			(candidate) =>
				!(
					candidate.stackingKey === modifier.stackingKey &&
					sameEventTarget(candidate.target, modifier.target)
				)
		);
		for (const candidate of replaced) {
			lifecycle.push({
				kind: 'modifier-lifecycle',
				day,
				status: 'replaced',
				modifier: snapshotModifier(candidate),
				replacedByModifierId: modifier.id
			});
		}

		activeModifiers.push(modifier);
		activated.push(modifier);
		lifecycle.push({
			kind: 'modifier-lifecycle',
			day,
			status: 'activated',
			modifier: snapshotModifier(modifier)
		});
	}

	return {
		state: {
			...state,
			activeModifiers,
			nextModifierSequence,
			history: appendLifecycle(state.history, lifecycle)
		},
		activated,
		lifecycle
	};
}

export function isModifierActiveOnDay(modifier: ActiveEventModifier, closingDay: number): boolean {
	return modifier.startsOnDay <= closingDay && closingDay < modifier.expiresOnDay;
}

export function hasModifierExpiredAfterDay(
	modifier: ActiveEventModifier,
	closingDay: number
): boolean {
	return modifier.expiresOnDay <= closingDay + 1;
}

export function expireModifiersAfterDay(
	state: EventRuntimeState,
	closingDay: number
): { state: EventRuntimeState; expired: EventModifierSnapshot[] } {
	const expiringModifiers = state.activeModifiers.filter((modifier) =>
		hasModifierExpiredAfterDay(modifier, closingDay)
	);
	const expired = expiringModifiers.map(snapshotModifier);
	const activeModifiers = state.activeModifiers.filter(
		(modifier) => !hasModifierExpiredAfterDay(modifier, closingDay)
	);
	const lifecycle: EventModifierLifecycle[] = expiringModifiers.map((modifier) => ({
		kind: 'modifier-lifecycle',
		day: closingDay,
		status: 'expired',
		modifier: snapshotModifier(modifier)
	}));

	return {
		state: {
			...state,
			activeModifiers,
			history: appendLifecycle(state.history, lifecycle)
		},
		expired
	};
}

function createModifier(
	sequence: number,
	source: ActiveEventModifier['source'],
	target: EventTarget,
	day: number,
	template: EventModifierTemplate
): ActiveEventModifier {
	return {
		id: `event-modifier-${sequence}`,
		source: { ...source },
		target: cloneEventTarget(target),
		startsOnDay: day,
		expiresOnDay: day + template.durationDays,
		stackingKey: template.stackingKey,
		stackingRule: 'replace',
		effect: cloneTimedEffect(template.effect),
		explanation: { ...template.explanation, params: { ...template.explanation.params } },
		importance: template.importance
	};
}

function snapshotModifier(modifier: ActiveEventModifier): EventModifierSnapshot {
	return {
		id: modifier.id,
		source: { ...modifier.source },
		target: cloneEventTarget(modifier.target),
		startsOnDay: modifier.startsOnDay,
		expiresOnDay: modifier.expiresOnDay,
		stackingKey: modifier.stackingKey,
		effect: cloneTimedEffect(modifier.effect),
		explanation: { ...modifier.explanation, params: { ...modifier.explanation.params } },
		importance: modifier.importance
	};
}

function appendLifecycle(
	history: readonly EventHistoryEntry[],
	lifecycle: readonly EventModifierLifecycle[]
): EventHistoryEntry[] {
	return [...history, ...lifecycle].slice(-EVENT_HISTORY_LIMIT);
}
