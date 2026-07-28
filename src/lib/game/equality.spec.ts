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

	it('returns false when equal primitive arrays exceed the 250k node cap', () => {
		// Equal primitives short-circuit via Object.is, so a previous version
		// only counted object pairs against the budget. A 260k-element array of
		// equal numbers bypassed the cap entirely (1 node counted, 260k work
		// items processed). The budget must count every popped pair.
		const length = 260_000;
		const left = Array.from({ length }, (_, i) => i);
		const right = Array.from({ length }, (_, i) => i);
		expect(deeplyEqual(left, right)).toBe(false);
	});

	it('returns false when a single array would queue more work than the budget allows', () => {
		// A multi-million-element array must be rejected before eagerly
		// expanding every element pair onto the worklist, otherwise the
		// per-pop budget check fires too late to prevent the allocation.
		const length = 5_000_000;
		const left = new Array(length).fill(0);
		const right = new Array(length).fill(0);
		expect(deeplyEqual(left, right)).toBe(false);
	});

	it('accepts equal primitive arrays within the budget', () => {
		const length = 100_000;
		const left = Array.from({ length }, (_, i) => i);
		const right = Array.from({ length }, (_, i) => i);
		expect(deeplyEqual(left, right)).toBe(true);
	});

	it(
		'returns false when a single record would queue more key pairs than the budget allows',
		{ timeout: 30_000 },
		() => {
			// The record-key budget guard mirrors the array-element guard: a
			// record with more keys than the remaining budget can absorb must
			// be rejected before eagerly pushing every key pair onto the
			// worklist, otherwise the per-pop budget check fires too late to
			// prevent the allocation.
			const length = 300_000;
			const left: Record<string, number> = {};
			const right: Record<string, number> = {};
			for (let i = 0; i < length; i += 1) {
				left[`k${i}`] = 0;
				right[`k${i}`] = 0;
			}
			expect(deeplyEqual(left, right)).toBe(false);
		}
	);

	it('reuses the per-first WeakSet when the same object is paired with different seconds', () => {
		// The cycle-detection map keys by `first` and stores a WeakSet of
		// already-compared `second` values. When the same `first` appears
		// against a new `second`, the existing WeakSet is reused (the
		// `seconds` branch where `seconds` is defined but does not yet
		// contain `second`) rather than allocating a fresh one.
		const shared = { x: 1 };
		const left = { a: shared, b: shared };
		const right = { a: { x: 1 }, b: { x: 1 } };
		// `shared` is compared first against right.a (new WeakSet, add it),
		// then against right.b (existing WeakSet, does not contain it, so
		// the reuse branch runs and adds right.b).
		expect(deeplyEqual(left, right)).toBe(true);
	});

	it('returns false when isRecord cannot read the prototype', () => {
		// `isRecord` defensively catches a thrown `Object.getPrototypeOf`.
		// A Proxy whose getPrototypeOf trap throws is treated as a
		// non-record, so the comparison returns false rather than
		// propagating the trap error.
		const throwing = new Proxy(
			{},
			{
				getPrototypeOf() {
					throw new Error('no prototype for you');
				}
			}
		);
		expect(deeplyEqual(throwing, {})).toBe(false);
		expect(deeplyEqual({}, throwing)).toBe(false);
	});
});
