import { invoke } from '@tauri-apps/api/core';
import { load, type ReloadOptions } from '@tauri-apps/plugin-store';
import { resolveScenarioDefinition } from '$lib/scenarios/catalog';
import type { ScenarioStoreSnapshot } from '$lib/scenarios/types';
import {
	createEmptyScenarioStore,
	decodeScenarioStoreSnapshot,
	validateScenarioStoreSnapshot,
	type DecodeScenarioStoreResult,
	type ScenarioDefinitionResolver
} from './scenarioCodec';
import type { ScenarioRepository } from './scenarioRepository';
import { ScenarioRepositoryFromDriver, type ScenarioStoreDriver } from './scenarioStoreRepository';
import {
	SCENARIO_STORE_LOCK_NAME,
	TauriScenarioStoreLock,
	type LockContext,
	type ScenarioStoreLock,
	type TauriInvokeLike
} from './scenarioStoreLock';

export const SCENARIO_STORE_FILE = 'serpens-scenarios.json';
export const SCENARIO_STORE_KEY = 'scenarios';

export interface ScenarioStoreLike {
	get<T>(key: string): Promise<T | undefined>;
	set(key: string, value: unknown): Promise<void>;
	delete(key: string): Promise<boolean>;
	reload(options?: ReloadOptions): Promise<void>;
	save(): Promise<void>;
}

type ScenarioStoreBaseline = { hadValue: false } | { hadValue: true; value: unknown };

/**
 * Pending recovery state set when a durable write fails mid-flight. The
 * `acquisitionId` is set when the failed write was fenced (Tauri) so the
 * recovery routine can route the baseline restore through the Rust-side
 * fenced commands instead of the unfenced TS store API — a stale owner
 * (lease expired, another window acquired) must not clobber a newer
 * revision by writing the old baseline through ordinary `store.set`/
 * `store.save`. It is `undefined` for the unfenced fallback (browser/
 * in-process locks hold exclusion natively, so no fencing token is
 * needed).
 */
/**
 * Recovery mode:
 * - `restore-baseline`: the failed write left an uncommitted snapshot
 *   in the cache; restore the pre-write baseline (fenced or unfenced)
 *   so the cache matches the durable state.
 * - `reload-required`: the baseline is abandoned (ownership lost or the
 *   fenced restore failed) and the cache must be reloaded from durable
 *   storage before any read or write. The reload is attempted
 *   immediately and retried on every later access; until it succeeds,
 *   reads and writes are rejected so the dirty cache never becomes
 *   readable as persisted state.
 */
type RecoveryMode = 'restore-baseline' | 'reload-required';

interface RecoveryState {
	mode: RecoveryMode;
	baseline: ScenarioStoreBaseline;
	acquisitionId?: number;
}

class TauriScenarioStoreDriver implements ScenarioStoreDriver {
	private accessQueue: Promise<void> = Promise.resolve();
	private recovery: RecoveryState | undefined;

	constructor(
		private readonly storePromise: Promise<ScenarioStoreLike>,
		private readonly resolveDefinition: ScenarioDefinitionResolver,
		private readonly invoke: TauriInvokeLike
	) {}

	read(): Promise<DecodeScenarioStoreResult> {
		return this.enqueue(() => this.readUnqueued());
	}

	write(snapshot: ScenarioStoreSnapshot, context: LockContext): Promise<void> {
		return this.enqueue(() => this.writeUnqueued(snapshot, context));
	}

	private async readUnqueued(): Promise<DecodeScenarioStoreResult> {
		const store = await this.storePromise;
		await this.ensureRecovered(store);
		const snapshot = await store.get<unknown>(SCENARIO_STORE_KEY);
		return snapshot === undefined
			? { snapshot: createEmptyScenarioStore(), diagnostics: [] }
			: decodeScenarioStoreSnapshot(snapshot, this.resolveDefinition);
	}

	private async writeUnqueued(
		snapshot: ScenarioStoreSnapshot,
		context: LockContext
	): Promise<void> {
		const store = await this.storePromise;
		await this.ensureRecovered(store);
		const validated = validateScenarioStoreSnapshot(snapshot, this.resolveDefinition);
		const previousValue = await store.get<unknown>(SCENARIO_STORE_KEY);
		const baseline: ScenarioStoreBaseline =
			previousValue === undefined
				? { hadValue: false }
				: { hadValue: true, value: structuredClone(previousValue) };
		try {
			// Fenced write path: when the lock issued an acquisition ID
			// (Tauri), route the durable write through the Rust-side
			// `write_scenario_store_locked` command. Rust holds the lock
			// across the ownership check AND the store.set+save, so the
			// fencing check and the durable write are atomic with respect
			// to other acquirers and lease-expiry tasks. If the lease
			// expired and another window acquired (and wrote), Rust
			// rejects this write instead of silently clobbering the newer
			// write. The rejection propagates as an error so the caller
			// surfaces a conflict rather than retrying blindly.
			//
			// The plugin-store cache is shared between this TS driver and
			// the Rust command (both resolve the same store file), so the
			// Rust write is visible to subsequent TS reads without a
			// reload.
			if (context.acquisitionId !== undefined) {
				await this.invoke('write_scenario_store_locked', {
					name: SCENARIO_STORE_LOCK_NAME,
					acquisitionId: context.acquisitionId,
					snapshot: validated
				});
				return;
			}
			// Unfenced fallback: browser/in-process locks hold exclusion
			// natively for the callback's duration, so no fencing token is
			// needed. Also the path tests take when no acquisition ID is
			// injected.
			await store.set(SCENARIO_STORE_KEY, validated);
			await store.save();
		} catch (error) {
			if (isFencingRejection(error)) {
				// Rust rejected the fenced write before mutating the store
				// cache: the caller is no longer the lock owner and the
				// native command made no mutation. The pre-write baseline
				// is now obsolete — another acquisition wrote a newer
				// revision after this lease expired. Restoring the old
				// baseline through the unfenced TS store API would
				// clobber that newer revision, so do NOT restore anything.
				// Reload the durable store to discard any stale cache
				// state and propagate the conflict so the caller surfaces
				// a stale-owner result instead of retrying blindly.
				this.recovery = undefined;
				try {
					await store.reload({ ignoreDefaults: true });
				} catch {
					// Reload is best-effort; the conflict still propagates.
				}
				throw error;
			}
			// Native save failure (the Rust command mutated the cache then
			// failed on save, or the unfenced fallback failed mid-write):
			// restore the pre-write baseline. The recovery routine routes
			// the restore through the fenced native commands when an
			// acquisition ID is present so a stale owner cannot clobber a
			// newer revision; if ownership is already lost, the baseline
			// is abandoned and the durable value is reloaded.
			this.recovery = { mode: 'restore-baseline', baseline, acquisitionId: context.acquisitionId };
			try {
				await this.ensureRecovered(store);
			} catch {
				// Preserve the original write error. A later operation retries recovery before access.
			}
			throw error;
		}
	}

	private enqueue<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.accessQueue.then(operation);
		this.accessQueue = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}

	private async ensureRecovered(store: ScenarioStoreLike): Promise<void> {
		const recovery = this.recovery;
		if (recovery === undefined) return;

		if (recovery.mode === 'reload-required') {
			await this.recoverReloadRequired(store);
			return;
		}

		if (recovery.acquisitionId !== undefined) {
			await this.recoverFenced(store, recovery);
			return;
		}
		await this.recoverUnfenced(store, recovery);
	}

	/**
	 * Reload-required recovery: the baseline was abandoned (ownership
	 * lost or the fenced restore failed) and the cache may hold an
	 * uncommitted snapshot from the failed write. Reload the durable
	 * store; until reload succeeds, reads and writes must be rejected so
	 * the dirty cache never becomes readable as persisted state. Reload
	 * is retried on every access, so a transient storage failure blocks
	 * callers rather than returning ghost state.
	 */
	private async recoverReloadRequired(store: ScenarioStoreLike): Promise<void> {
		// Reload is retried on every access. Until it succeeds, the
		// reload error propagates so reads and writes are blocked and
		// the dirty cache is never returned as persisted state. Recovery
		// stays in reload-required mode for the next access to retry.
		await store.reload({ ignoreDefaults: true });
		this.recovery = undefined;
	}

	/**
	 * Fenced recovery: the failed write carried an acquisition ID, so
	 * route the baseline restore through the Rust-side fenced commands.
	 * This prevents a stale owner (lease expired, another window acquired)
	 * from clobbering a newer revision by writing the old baseline through
	 * the unfenced TS store API. If the fenced restore fencing-rejects,
	 * ownership was lost during recovery — abandon the baseline and reload
	 * the durable value. For any other native error, also abandon the
	 * baseline and reload rather than fall back to an unfenced write of
	 * the stale baseline.
	 *
	 * In both error branches the cache may still hold the failed write's
	 * uncommitted snapshot, so recovery transitions to `reload-required`
	 * mode and attempts the reload immediately. If the reload fails, the
	 * mode stays `reload-required` and the next access retries the reload
	 * and is blocked until it succeeds — the dirty cache must never
	 * become readable as persisted state.
	 */
	private async recoverFenced(store: ScenarioStoreLike, recovery: RecoveryState): Promise<void> {
		try {
			await this.restoreBaselineFenced(recovery.baseline, recovery.acquisitionId!);
			this.recovery = undefined;
			return;
		} catch (error) {
			if (isFencingRejection(error)) {
				await this.enterReloadRequired(store, recovery);
				return;
			}
			// Other native errors: abandon the baseline and reload the
			// durable value rather than risk an unfenced write of the
			// stale baseline. The cache may still hold the failed write's
			// value; enterReloadRequired syncs it back to the durable
			// state, or keeps recovery pending if the reload fails.
			await this.enterReloadRequired(store, recovery);
		}
	}

	/**
	 * Transition to `reload-required` mode and attempt the reload
	 * immediately. If the reload succeeds, recovery clears and the cache
	 * is synced to the durable state. If the reload fails, recovery stays
	 * in `reload-required` mode so the next access retries and is blocked
	 * until reload succeeds — the dirty cache is never returned as
	 * persisted state.
	 */
	private async enterReloadRequired(
		store: ScenarioStoreLike,
		recovery: RecoveryState
	): Promise<void> {
		this.recovery = {
			mode: 'reload-required',
			baseline: recovery.baseline,
			acquisitionId: recovery.acquisitionId
		};
		try {
			await store.reload({ ignoreDefaults: true });
			this.recovery = undefined;
		} catch {
			// Reload failed: keep recovery in reload-required mode. The
			// next access retries the reload and is blocked until it
			// succeeds; the dirty cache is not returned as persisted state.
		}
	}

	/**
	 * Unfenced recovery (browser/in-process locks): the lock holds
	 * exclusion natively for the critical section's duration, so the
	 * baseline restore can go through the ordinary TS store API without
	 * a fencing token.
	 */
	private async recoverUnfenced(store: ScenarioStoreLike, recovery: RecoveryState): Promise<void> {
		const baseline = recovery.baseline;
		try {
			await this.restoreBaseline(store, baseline);
			await store.save();
			this.recovery = undefined;
			return;
		} catch {
			// Replacement reload is the fallback when direct cache rollback fails.
		}

		try {
			await store.reload({ ignoreDefaults: true });
			this.recovery = undefined;
		} catch (reloadError) {
			if (!baseline.hadValue && isMissingStoreFileError(reloadError)) {
				try {
					await this.restoreBaseline(store, baseline);
					this.recovery = undefined;
					return;
				} catch {
					// Keep recovery pending; no later operation may access the rejected cache.
				}
			}
			throw reloadError;
		}
	}

	private async restoreBaseline(
		store: ScenarioStoreLike,
		baseline: ScenarioStoreBaseline
	): Promise<void> {
		if (baseline.hadValue) {
			await store.set(SCENARIO_STORE_KEY, baseline.value);
			return;
		}
		await store.delete(SCENARIO_STORE_KEY);
	}

	/**
	 * Fenced baseline restore: routes the restore through the Rust-side
	 * `write_scenario_store_locked` / `delete_scenario_store_locked`
	 * commands so the fencing check guards the durable restore. A stale
	 * owner (lease expired, another window acquired) is rejected instead
	 * of clobbering the newer revision with the old baseline.
	 */
	private async restoreBaselineFenced(
		baseline: ScenarioStoreBaseline,
		acquisitionId: number
	): Promise<void> {
		if (baseline.hadValue) {
			await this.invoke('write_scenario_store_locked', {
				name: SCENARIO_STORE_LOCK_NAME,
				acquisitionId,
				snapshot: baseline.value
			});
			return;
		}
		await this.invoke('delete_scenario_store_locked', {
			name: SCENARIO_STORE_LOCK_NAME,
			acquisitionId
		});
	}
}

function isFencingRejection(error: unknown): boolean {
	const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
	return message.includes('fencing rejected: not the current lock owner');
}

function isMissingStoreFileError(error: unknown): boolean {
	if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
		return true;
	}
	const message = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
	return message.includes('ENOENT') || message.includes('No such file or directory');
}

export function createTauriScenarioRepository(
	resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition
): ScenarioRepository {
	return createTauriScenarioRepositoryFromStore(
		load(SCENARIO_STORE_FILE, { defaults: {}, autoSave: false }),
		resolveDefinition
	);
}

export function createTauriScenarioRepositoryFromStore(
	storePromise: Promise<ScenarioStoreLike>,
	resolveDefinition: ScenarioDefinitionResolver = resolveScenarioDefinition,
	lock: ScenarioStoreLock = new TauriScenarioStoreLock(invoke),
	invokeFn: TauriInvokeLike = invoke
): ScenarioRepository {
	return new ScenarioRepositoryFromDriver(
		new TauriScenarioStoreDriver(storePromise, resolveDefinition, invokeFn),
		resolveDefinition,
		lock
	);
}
