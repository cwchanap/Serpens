import { describe, expect, it } from 'vitest';
import { deeplyEqual } from './equality';

describe('deeplyEqual', () => {
	it('returns true for identical primitives', () => {
		expect(deeplyEqual(1, 1)).toBe(true);
		expect(deeplyEqual('a', 'a')).toBe(true);
		expect(deeplyEqual(true, true)).toBe(true);
		expect(deeplyEqual(null, null)).toBe(true);
		expect(deeplyEqual(undefined, undefined)).toBe(true);
	});

	it('returns true for Object.is same-reference objects', () => {
		const obj = { a: 1 };
		expect(deeplyEqual(obj, obj)).toBe(true);
	});

	it('returns false for different primitives', () => {
		expect(deeplyEqual(1, 2)).toBe(false);
		expect(deeplyEqual('a', 'b')).toBe(false);
		expect(deeplyEqual(1, '1')).toBe(false);
		expect(deeplyEqual(null, undefined)).toBe(false);
	});

	it('compares flat records by value', () => {
		expect(deeplyEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
		expect(deeplyEqual({ a: 1, b: 'x' }, { a: 1, b: 'y' })).toBe(false);
		expect(deeplyEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
	});

	it('compares nested records recursively', () => {
		expect(deeplyEqual({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } })).toBe(true);
		expect(deeplyEqual({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })).toBe(false);
	});

	it('compares arrays by length and element equality', () => {
		expect(deeplyEqual([1, 2, 3], [1, 2, 3])).toBe(true);
		expect(deeplyEqual([1, 2, 3], [1, 2])).toBe(false);
		expect(deeplyEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
		expect(deeplyEqual([1, [2, 3]], [1, [2, 4]])).toBe(false);
	});

	it('rejects array vs non-array mismatches', () => {
		expect(deeplyEqual([1, 2], { 0: 1, 1: 2 })).toBe(false);
		expect(deeplyEqual({ 0: 1, 1: 2 }, [1, 2])).toBe(false);
	});

	it('handles empty objects and arrays', () => {
		expect(deeplyEqual({}, {})).toBe(true);
		expect(deeplyEqual([], [])).toBe(true);
		expect(deeplyEqual({}, [])).toBe(false);
		expect(deeplyEqual([], {})).toBe(false);
	});

	it('detects cycles without infinite recursion', () => {
		const a: Record<string, unknown> = {};
		a.self = a;
		const b: Record<string, unknown> = {};
		b.self = b;
		expect(deeplyEqual(a, b)).toBe(true);
	});

	it('returns false for cyclic structures that differ', () => {
		const a: Record<string, unknown> = {};
		a.self = a;
		const b: Record<string, unknown> = {};
		b.self = { other: 1 };
		expect(deeplyEqual(a, b)).toBe(false);
	});

	it('treats objects with null prototype as records', () => {
		const a = Object.create(null);
		a.x = 1;
		const b = Object.create(null);
		b.x = 1;
		expect(deeplyEqual(a, b)).toBe(true);
	});

	it('returns false when key sets differ', () => {
		expect(deeplyEqual({ a: 1, b: 2 }, { a: 1, c: 2 })).toBe(false);
	});

	it('treats NaN as equal to NaN via Object.is', () => {
		expect(deeplyEqual(NaN, NaN)).toBe(true);
		expect(deeplyEqual(NaN, 0)).toBe(false);
		expect(deeplyEqual(0, NaN)).toBe(false);
		expect(deeplyEqual(NaN, Infinity)).toBe(false);
		expect(deeplyEqual([NaN], [NaN])).toBe(true);
		expect(deeplyEqual({ a: NaN }, { a: NaN })).toBe(true);
		expect(deeplyEqual({ a: NaN }, { a: 0 })).toBe(false);
	});

	it('returns false when equal structures exceed the 250k node cap', () => {
		const length = 260_000;
		const left = Array.from({ length }, () => ({}));
		const right = Array.from({ length }, () => ({}));
		expect(deeplyEqual(left, right)).toBe(false);
	});
});
