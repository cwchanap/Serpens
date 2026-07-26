import { describe, expect, it, vi } from 'vitest';
import {
	ScenarioCommandGate,
	runImmediateSandboxOperation,
	runPersistenceGatedOperation
} from './commandGate';

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

	it('commits a changed preparation through persist, publish, and afterPublish', async () => {
		const gate = new ScenarioCommandGate();
		const persist = vi.fn(async (value: number) => value * 2);
		const publish = vi.fn();
		const afterPublish = vi.fn();
		const pendingChanges: boolean[] = [];

		const result = await runPersistenceGatedOperation(gate, {
			prepare: () => ({ status: 'changed', value: 5 }),
			persist,
			publish,
			afterPublish,
			onPendingChange: (pending) => pendingChanges.push(pending)
		});

		expect(result).toEqual({ status: 'committed', value: 10 });
		expect(persist).toHaveBeenCalledWith(5);
		expect(publish).toHaveBeenCalledWith(10);
		expect(afterPublish).toHaveBeenCalledWith(10);
		expect(pendingChanges).toEqual([true, false]);
		expect(gate.busy).toBe(false);
	});

	it('returns busy when the gate is already running', async () => {
		const gate = new ScenarioCommandGate();
		const pending = deferred<number>();

		const first = gate.run(() => pending.promise);
		const result = await runPersistenceGatedOperation(gate, {
			prepare: () => ({ status: 'changed', value: 1 }),
			persist: async (v) => v,
			publish: () => {}
		});

		expect(result).toEqual({ status: 'busy' });

		pending.resolve(1);
		await first;
	});
});

describe('runImmediateSandboxOperation', () => {
	it('publishes, autosaves, and calls afterPublish when the transition changes the value', () => {
		const publish = vi.fn();
		const autosave = vi.fn();
		const afterPublish = vi.fn();
		const next = { day: 2 };

		const result = runImmediateSandboxOperation({
			current: { day: 1 },
			transition: () => next,
			publish,
			autosave,
			afterPublish
		});

		expect(result).toEqual({ changed: true, value: next });
		expect(publish).toHaveBeenCalledWith(next);
		expect(autosave).toHaveBeenCalledWith(next);
		expect(afterPublish).toHaveBeenCalled();
	});

	it('skips afterPublish when the transition returns the same reference', () => {
		const current = { day: 1 };
		const publish = vi.fn();
		const autosave = vi.fn();
		const afterPublish = vi.fn();

		const result = runImmediateSandboxOperation({
			current,
			transition: () => current,
			publish,
			autosave,
			afterPublish
		});

		expect(result).toEqual({ changed: false, value: current });
		expect(publish).toHaveBeenCalledWith(current);
		expect(autosave).toHaveBeenCalledWith(current);
		expect(afterPublish).not.toHaveBeenCalled();
	});

	it('treats a null current as changed when the transition produces a value', () => {
		const next = { day: 1 };
		const result = runImmediateSandboxOperation({
			current: null,
			transition: () => next,
			publish: () => {},
			autosave: () => {},
			afterPublish: () => {}
		});
		expect(result).toEqual({ changed: true, value: next });
	});
});
