import { describe, expect, it, vi } from 'vitest';
import { ScenarioCommandGate, runPersistenceGatedOperation } from './commandGate';

interface Deferred<T> {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

describe('ScenarioCommandGate', () => {
	it('rejects a second operation while the first is pending and reopens after success', async () => {
		const gate = new ScenarioCommandGate();
		const pending = deferred<number>();

		const first = gate.run(() => pending.promise);
		const second = await gate.run(async () => 2);

		expect(gate.busy).toBe(true);
		expect(second).toEqual({ accepted: false, code: 'busy' });

		pending.resolve(1);
		expect(await first).toEqual({ accepted: true, value: 1 });
		expect(gate.busy).toBe(false);
		expect(await gate.run(async () => 3)).toEqual({ accepted: true, value: 3 });
	});

	it('reopens after an operation rejects while preserving the rejection', async () => {
		const gate = new ScenarioCommandGate();
		const error = new Error('write failed');

		await expect(gate.run(async () => Promise.reject(error))).rejects.toBe(error);

		expect(gate.busy).toBe(false);
		expect(await gate.run(async () => 'recovered')).toEqual({
			accepted: true,
			value: 'recovered'
		});
	});

	it.each(['rejected', 'unchanged'] as const)(
		'skips persistence and publication for a %s preparation',
		async (status) => {
			const gate = new ScenarioCommandGate();
			const persist = vi.fn(async (value: number) => value);
			const publish = vi.fn();
			const pendingChanges: boolean[] = [];

			const result = await runPersistenceGatedOperation(gate, {
				prepare: () => ({ status }),
				persist,
				publish,
				onPendingChange: (pending) => pendingChanges.push(pending)
			});

			expect(result).toEqual({ status });
			expect(persist).not.toHaveBeenCalled();
			expect(publish).not.toHaveBeenCalled();
			expect(pendingChanges).toEqual([true, false]);
			expect(gate.busy).toBe(false);
		}
	);
});
