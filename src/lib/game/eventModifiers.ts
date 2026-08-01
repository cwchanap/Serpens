import { EVENT_HISTORY_LIMIT } from './eventSelection';
import type {
	ActiveEventModifier,
	EventHistoryEntry,
	EventModifierSnapshot,
	EventModifierTemplate,
	EventRuntimeState
} from './types';

export type EventModifierLifecycle = Extract<EventHistoryEntry, { kind: 'modifier-lifecycle' }>;

export interface EventModifierActivationResult {
	state: EventRuntimeState;
	activated: ActiveEventModifier[];
	lifecycle: EventModifierLifecycle[];
}

export function activateEventModifiers(
	state: EventRuntimeState,
	source: ActiveEventModifier['source'],
	day: number,
	templates: readonly EventModifierTemplate[]
): EventModifierActivationResult {
	let activeModifiers = [...state.activeModifiers];
	let nextModifierSequence = state.nextModifierSequence;
	const activated: ActiveEventModifier[] = [];
	const lifecycle: EventModifierLifecycle[] = [];

	for (const template of templates) {
		const modifier = createModifier(nextModifierSequence, source, day, template);
		nextModifierSequence += 1;

		const replaced = activeModifiers.filter(
			(candidate) => candidate.stackingKey === modifier.stackingKey
		);
		activeModifiers = activeModifiers.filter(
			(candidate) => candidate.stackingKey !== modifier.stackingKey
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

export function expireModifiersAfterDay(
	state: EventRuntimeState,
	closingDay: number
): { state: EventRuntimeState; expired: EventModifierSnapshot[] } {
	const expiringModifiers = state.activeModifiers.filter(
		(modifier) => modifier.expiresOnDay <= closingDay + 1
	);
	const expired = expiringModifiers.map(snapshotModifier);
	const activeModifiers = state.activeModifiers.filter(
		(modifier) => modifier.expiresOnDay > closingDay + 1
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
	day: number,
	template: EventModifierTemplate
): ActiveEventModifier {
	return {
		id: `event-modifier-${sequence}`,
		source: { ...source },
		target: { kind: 'company' },
		startsOnDay: day,
		expiresOnDay: day + template.durationDays,
		stackingKey: template.stackingKey,
		stackingRule: 'replace',
		effect: { ...template.effect, target: { ...template.effect.target } },
		explanation: { ...template.explanation, params: { ...template.explanation.params } },
		importance: template.importance
	};
}

function snapshotModifier(modifier: ActiveEventModifier): EventModifierSnapshot {
	return {
		id: modifier.id,
		source: { ...modifier.source },
		target: { ...modifier.target },
		startsOnDay: modifier.startsOnDay,
		expiresOnDay: modifier.expiresOnDay,
		stackingKey: modifier.stackingKey,
		effect: { ...modifier.effect, target: { ...modifier.effect.target } },
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
