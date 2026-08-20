export const EVENT_HISTORY_LIMIT = 200;

export function appendBoundedHistory<T>(
	history: readonly T[],
	entries: readonly T[],
	limit: number
): T[] {
	if (limit <= 0) return [];
	return [...history, ...entries].slice(-limit);
}

export function appendHistory<T>(history: readonly T[], entry: T): T[] {
	return appendBoundedHistory(history, [entry], EVENT_HISTORY_LIMIT);
}
