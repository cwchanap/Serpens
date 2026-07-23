export type ScenarioCommandGateResult<T> =
	| { accepted: true; value: T }
	| { accepted: false; code: 'busy' };

export class ScenarioCommandGate {
	private running = false;

	get busy(): boolean {
		return this.running;
	}

	async run<T>(operation: () => Promise<T>): Promise<ScenarioCommandGateResult<T>> {
		if (this.running) {
			return { accepted: false, code: 'busy' };
		}

		this.running = true;
		try {
			return { accepted: true, value: await operation() };
		} finally {
			this.running = false;
		}
	}
}

export type PersistenceGatedPreparation<T> =
	| { status: 'rejected' }
	| { status: 'unchanged' }
	| { status: 'changed'; value: T };

export type PersistenceGatedOperationResult<T> =
	| { status: 'busy' }
	| { status: 'rejected' }
	| { status: 'unchanged' }
	| { status: 'committed'; value: T };

export interface PersistenceGatedOperation<TPrepared, TCommitted> {
	prepare(): PersistenceGatedPreparation<TPrepared>;
	persist(value: TPrepared): Promise<TCommitted>;
	publish(value: TCommitted): void;
	afterPublish?(value: TCommitted): void;
	onPendingChange?(pending: boolean): void;
}

export async function runPersistenceGatedOperation<TPrepared, TCommitted>(
	gate: ScenarioCommandGate,
	operation: PersistenceGatedOperation<TPrepared, TCommitted>
): Promise<PersistenceGatedOperationResult<TCommitted>> {
	const gated = await gate.run(async () => {
		operation.onPendingChange?.(true);
		try {
			const prepared = operation.prepare();
			if (prepared.status !== 'changed') {
				return prepared;
			}
			const committed = await operation.persist(prepared.value);
			operation.publish(committed);
			operation.afterPublish?.(committed);
			return { status: 'committed' as const, value: committed };
		} finally {
			operation.onPendingChange?.(false);
		}
	});

	return gated.accepted ? gated.value : { status: 'busy' };
}

export interface ImmediateSandboxOperation<T> {
	current: T | null;
	transition(current: T | null): T;
	publish(value: T): void;
	autosave(value: T): void;
	afterPublish?(): void;
}

export function runImmediateSandboxOperation<T>(operation: ImmediateSandboxOperation<T>): {
	changed: boolean;
	value: T;
} {
	const next = operation.transition(operation.current);
	const changed = next !== operation.current;
	operation.publish(next);
	operation.autosave(next);
	if (changed) {
		operation.afterPublish?.();
	}
	return { changed, value: next };
}
