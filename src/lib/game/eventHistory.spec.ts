import { describe, expect, test } from 'vitest';
import { appendBoundedHistory, appendHistory } from './eventHistory';

describe('event history bounds', () => {
	test('appendHistory keeps newest 200', () => {
		const history = Array.from({ length: 200 }, (_, index) => index);

		expect(appendHistory(history, 200)).toEqual(
			Array.from({ length: 200 }, (_, index) => index + 1)
		);
	});

	test('appendBoundedHistory appends multiple entries in order and keeps newest 100', () => {
		const history = Array.from({ length: 99 }, (_, index) => index);

		expect(appendBoundedHistory(history, [99, 100, 101], 100)).toEqual(
			Array.from({ length: 100 }, (_, index) => index + 2)
		);
	});

	test('appendBoundedHistory returns an empty array when limit is zero', () => {
		expect(appendBoundedHistory([1, 2, 3], [4], 0)).toEqual([]);
	});

	test('appendBoundedHistory returns an empty array when limit is negative', () => {
		expect(appendBoundedHistory([1, 2, 3], [4], -5)).toEqual([]);
	});
});
