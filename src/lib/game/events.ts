import { PRODUCTION_EVENT_CATALOG } from './eventCatalog';
import { EVENT_HISTORY_LIMIT, selectEventForDay } from './eventSelection';
import type { EventHistoryEntry, GameState } from './types';

export function generateDecisions(game: GameState): GameState {
	return selectEventForDay(game, PRODUCTION_EVENT_CATALOG);
}

export function pruneExpiredDecisions(game: GameState, closingDay: number): GameState {
	const expiredEvents = game.decisions.filter(
		(decision) => decision.kind === 'event' && decision.expiresOnDay < game.day
	);
	if (
		expiredEvents.length === 0 &&
		game.decisions.every((decision) => decision.expiresOnDay >= game.day)
	) {
		return game;
	}

	let history = game.events.history;
	for (const decision of expiredEvents) {
		if (decision.kind !== 'event') continue;
		history = appendHistory(history, {
			kind: 'event-decision-expired',
			day: closingDay,
			eventId: decision.eventId,
			instanceId: decision.id,
			target: { ...decision.target }
		});
	}

	return {
		...game,
		decisions: game.decisions.filter((decision) => decision.expiresOnDay >= game.day),
		events: history === game.events.history ? game.events : { ...game.events, history }
	};
}

function appendHistory(
	history: readonly EventHistoryEntry[],
	entry: EventHistoryEntry
): EventHistoryEntry[] {
	return [...history, entry].slice(-EVENT_HISTORY_LIMIT);
}
