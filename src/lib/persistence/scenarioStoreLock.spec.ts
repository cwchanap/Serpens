import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	InProcessScenarioStoreLock,
	NoopScenarioStoreLock,
	SCENARIO_STORE_LOCK_NAME,
	WebLocksScenarioStoreLock,
	createDefaultScenarioStoreLock,
	type LockManagerLike
} from './scenarioStoreLock';

describe('scenarioStoreLock', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('SCENARIO_STORE_LOCK_NAME is the shared constant', () => {
		expect(SCENARIO_STORE_LOCK_NAME).toBe('serpens.scenarios');
	});

	describe('NoopScenarioStoreLock', () => {
		it('runs the operation directly without coordination', async () => {
			const lock = new NoopScenarioStoreLock();
			const operation = vi.fn(async () => 'result');
			const result = await lock.withLock('any-name', operation);
			expect(result).toBe('result');
			expect(operation).toHaveBeenCalledTimes(1);
			expect(operation.mock.calls[0]?.[0]).toEqual({});
		});

		it('propagates operation rejections', async () => {
			const lock = new NoopScenarioStoreLock();
			const error = new Error('boom');
			await expect(
				lock.withLock('any-name', async () => {
					throw error;
				})
			).rejects.toBe(error);
		});
	});

	describe('WebLocksScenarioStoreLock', () => {
		it('acquires an exclusive lock and returns the operation result', async () => {
			const calls: Array<{ name: string; mode: 'exclusive' | 'shared' }> = [];
			const fakeLocks: LockManagerLike = {
				async request<T>(
					name: string,
					options: { mode: 'exclusive' | 'shared' },
					callback: () => Promise<T>
				): Promise<T> {
					calls.push({ name, mode: options.mode });
					return callback();
				}
			};
			const lock = new WebLocksScenarioStoreLock(fakeLocks);
			const result = await lock.withLock('serpens.scenarios', async () => 'done');
			expect(result).toBe('done');
			expect(calls).toEqual([{ name: 'serpens.scenarios', mode: 'exclusive' }]);
		});

		it('propagates operation rejections through the lock', async () => {
			const fakeLocks: LockManagerLike = {
				async request<T>(
					_name: string,
					_options: { mode: 'exclusive' | 'shared' },
					callback: () => Promise<T>
				): Promise<T> {
					return callback();
				}
			};
			const lock = new WebLocksScenarioStoreLock(fakeLocks);
			await expect(
				lock.withLock('serpens.scenarios', async () => {
					throw new Error('op-failed');
				})
			).rejects.toThrow('op-failed');
		});

		it('passes an empty LockContext (no acquisitionId)', async () => {
			const fakeLocks: LockManagerLike = {
				async request<T>(
					_name: string,
					_options: { mode: 'exclusive' | 'shared' },
					callback: () => Promise<T>
				): Promise<T> {
					return callback();
				}
			};
			const lock = new WebLocksScenarioStoreLock(fakeLocks);
			let observedAcquisitionId: unknown = 'sentinel';
			await lock.withLock('serpens.scenarios', async (context) => {
				observedAcquisitionId = context.acquisitionId;
			});
			expect(observedAcquisitionId).toBeUndefined();
		});
	});

	describe('InProcessScenarioStoreLock', () => {
		it('serializes overlapping withLock calls on the same instance', async () => {
			const lock = new InProcessScenarioStoreLock();
			const order: string[] = [];
			const opA = async () => {
				order.push('A-start');
				await new Promise<void>((resolve) => setTimeout(resolve, 50));
				order.push('A-end');
				return 'a';
			};
			const opB = async () => {
				order.push('B-start');
				order.push('B-end');
				return 'b';
			};
			const [resultA, resultB] = await Promise.all([
				lock.withLock('serpens.scenarios', opA),
				lock.withLock('serpens.scenarios', opB)
			]);
			expect(resultA).toBe('a');
			expect(resultB).toBe('b');
			// A must fully complete before B starts — the lock serializes.
			expect(order).toEqual(['A-start', 'A-end', 'B-start', 'B-end']);
		});

		it('runs the next operation even when the previous one rejected', async () => {
			const lock = new InProcessScenarioStoreLock();
			await expect(
				lock.withLock('serpens.scenarios', async () => {
					throw new Error('first-failed');
				})
			).rejects.toThrow('first-failed');
			// A rejected operation must not block subsequent operations.
			const result = await lock.withLock('serpens.scenarios', async () => 'second-ok');
			expect(result).toBe('second-ok');
		});
	});

	describe('createDefaultScenarioStoreLock', () => {
		it('returns a WebLocksScenarioStoreLock when navigator.locks is available', () => {
			const originalNavigator = globalThis.navigator;
			const fakeLocks: LockManagerLike = {
				async request<T>(): Promise<T> {
					return undefined as unknown as T;
				}
			};
			try {
				Object.defineProperty(globalThis, 'navigator', {
					value: { locks: fakeLocks },
					configurable: true,
					writable: true
				});
				const lock = createDefaultScenarioStoreLock();
				expect(lock).toBeInstanceOf(WebLocksScenarioStoreLock);
			} finally {
				if (originalNavigator === undefined) {
					delete (globalThis as Record<string, unknown>).navigator;
				} else {
					Object.defineProperty(globalThis, 'navigator', {
						value: originalNavigator,
						configurable: true,
						writable: true
					});
				}
			}
		});

		it('returns a NoopScenarioStoreLock when navigator.locks is unavailable', () => {
			const originalNavigator = globalThis.navigator;
			try {
				Object.defineProperty(globalThis, 'navigator', {
					value: {},
					configurable: true,
					writable: true
				});
				const lock = createDefaultScenarioStoreLock();
				expect(lock).toBeInstanceOf(NoopScenarioStoreLock);
			} finally {
				if (originalNavigator === undefined) {
					delete (globalThis as Record<string, unknown>).navigator;
				} else {
					Object.defineProperty(globalThis, 'navigator', {
						value: originalNavigator,
						configurable: true,
						writable: true
					});
				}
			}
		});

		it('returns a NoopScenarioStoreLock when navigator is undefined', () => {
			const originalNavigator = globalThis.navigator;
			try {
				delete (globalThis as Record<string, unknown>).navigator;
				const lock = createDefaultScenarioStoreLock();
				expect(lock).toBeInstanceOf(NoopScenarioStoreLock);
			} finally {
				if (originalNavigator === undefined) {
					delete (globalThis as Record<string, unknown>).navigator;
				} else {
					Object.defineProperty(globalThis, 'navigator', {
						value: originalNavigator,
						configurable: true,
						writable: true
					});
				}
			}
		});
	});
});
