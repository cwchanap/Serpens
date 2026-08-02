export const EVENT_HISTORY_LIMIT = 200;

export function appendHistory<T>(history: readonly T[], entry: T): T[] {
	return [...history, entry].slice(-EVENT_HISTORY_LIMIT);
}
