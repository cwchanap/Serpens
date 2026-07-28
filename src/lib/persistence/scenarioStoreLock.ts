/**
 * Cross-tab coordination for scenario store critical sections.
 *
 * Each mutating repository operation (`saveActiveRun`, `removeActiveRun`,
 * `commitTerminalRun`) performs a read-modify-write on the shared scenario
 * store. Within a single repository instance the `mutationQueue` serializes
 * these critical sections, but two browser tabs (or two Tauri windows) hold
 * separate repository instances with separate queues, so their read-modify-
 * write windows can interleave and the second write silently clobbers the
 * first (last-write-wins at the storage layer).
 *
 * A `ScenarioStoreLock` wraps each critical section so the read-modify-write
 * is atomic across all holders of the same lock. The browser implementation
 * backs onto the Web Locks API (`navigator.locks.request`), which coordinates
 * across tabs on the same origin; tests inject an in-process mutex so the
 * serialization is observable without a browser.
 *
 * The lock name is constant (`'serpens.scenarios'`) so every repository
 * instance on the same origin competes for the same lock.
 */
/**
 * Context passed to the operation inside `withLock`. Carries the fencing
 * token (`acquisitionId`) on platforms that issue one (Tauri), so the
 * driver's write can route through the Rust-side fenced write command.
 * Browser/in-process locks leave `acquisitionId` undefined — the Web
 * Locks API and in-process mutex hold exclusion natively for the
 * callback's duration, so no fencing token is needed.
 */
export interface LockContext {
	acquisitionId?: number;
}

export interface ScenarioStoreLock {
	withLock<T>(name: string, operation: (context: LockContext) => Promise<T>): Promise<T>;
}

/**
 * Lock name shared by every scenario repository instance on the same origin.
 * Keeping this constant ensures two tabs compete for the same lock instead of
 * each acquiring an independent one.
 */
export const SCENARIO_STORE_LOCK_NAME = 'serpens.scenarios';

/**
 * Default lock used when no lock is injected. Operations run without
 * cross-tab coordination, preserving the pre-lock behavior for tests and
 * environments without Web Locks support.
 */
export class NoopScenarioStoreLock implements ScenarioStoreLock {
	async withLock<T>(_name: string, operation: (context: LockContext) => Promise<T>): Promise<T> {
		return operation({});
	}
}

/**
 * Browser lock backed by the Web Locks API. Acquires an exclusive lock for
 * the critical section; the second tab's request queues until the first
 * releases, making the read-modify-write atomic across tabs.
 */
export class WebLocksScenarioStoreLock implements ScenarioStoreLock {
	constructor(private readonly locks: LockManagerLike) {}

	async withLock<T>(name: string, operation: (context: LockContext) => Promise<T>): Promise<T> {
		return this.locks.request(name, { mode: 'exclusive' }, async () => operation({}));
	}
}

/**
 * Minimal `LockManager` surface used by `WebLocksScenarioStoreLock`. The
 * browser's `navigator.locks` satisfies this; tests can supply a fake.
 */
export interface LockManagerLike {
	request<T>(
		name: string,
		options: { mode: 'exclusive' | 'shared' },
		callback: () => Promise<T>
	): Promise<T>;
}

/**
 * In-process mutex lock for tests. Serializes `withLock` calls across all
 * holders of the same `InProcessScenarioStoreLock` instance, mirroring the
 * cross-tab serialization the Web Locks API provides in the browser. Used
 * by the two-instance concurrent-write test to assert the lock makes the
 * read-modify-write atomic.
 */
export class InProcessScenarioStoreLock implements ScenarioStoreLock {
	private queue: Promise<unknown> = Promise.resolve();

	async withLock<T>(_name: string, operation: (context: LockContext) => Promise<T>): Promise<T> {
		const next = this.queue.then(
			() => operation({}),
			() => operation({})
		);
		this.queue = next.then(
			() => undefined,
			() => undefined
		);
		return next as Promise<T>;
	}
}

/**
 * Select the default lock for the current environment. Returns a
 * `WebLocksScenarioStoreLock` when `navigator.locks` is available (browser),
 * otherwise a `NoopScenarioStoreLock` (Tauri file-backed store, tests, SSR).
 */
export function createDefaultScenarioStoreLock(): ScenarioStoreLock {
	if (typeof navigator !== 'undefined' && navigator.locks) {
		return new WebLocksScenarioStoreLock(navigator.locks);
	}
	return new NoopScenarioStoreLock();
}

/**
 * Minimal `invoke` surface used by `TauriScenarioStoreLock`. The Tauri
 * runtime's `@tauri-apps/api/core` `invoke` satisfies this; tests can
 * supply a fake.
 */
export interface TauriInvokeLike {
	(command: string, args?: Record<string, unknown>): Promise<unknown>;
}

/**
 * Interval between lease renewal calls while a lock is held. The Rust-side
 * lease duration is 30s; renewing every 10s keeps the lease alive with
 * margin for a missed renewal.
 */
const LEASE_RENEWAL_INTERVAL_MS = 10_000;

/**
 * Cross-window lock for the Tauri desktop shell. Backs onto a Rust-side
 * named mutex exposed via the `acquire_scenario_lock` /
 * `release_scenario_lock` / `renew_scenario_lock` Tauri commands. Unlike
 * the browser's Web Locks API, the Tauri runtime does not provide a
 * built-in cross-window lock, so the Rust host process owns the mutex
 * state and every window's `invoke` call competes for the same flag.
 *
 * The lock is held across the `operation` promise. If the operation rejects,
 * the lock is still released (via `finally`) — an orphaned lock would block
 * all other windows until the Rust process restarts.
 *
 * Fencing: `acquire_scenario_lock` returns a unique acquisition ID (a
 * process-wide monotonic counter). The ID is passed to the operation via
 * `LockContext.acquisitionId` and must be presented to the Rust-side
 * `write_scenario_store_locked` command for the durable write. Rust
 * rejects the write unless the ID is still the current owner, so a stale
 * operation that resumes after its lease expired (and another window
 * acquired and wrote) cannot clobber the newer write. The acquisition ID
 * also disambiguates reacquisitions by the same window: a delayed
 * `finally` release or renewal from acquisition A is rejected when
 * acquisition B is current, so A's stale release cannot unlock B's
 * active critical section.
 *
 * Orphan recovery: the Rust side records the owning `{ window_label,
 * acquisition_id }` and a 30s lease. While the operation is pending, this
 * class renews the lease every 10s via `renew_scenario_lock` so a
 * long-running critical section is not prematurely auto-released. If the
 * owning webview reloads, closes, or crashes so the `finally` block never
 * runs, renewal stops and the Rust lease expires within 30s,
 * auto-releasing the lock. The Rust `WindowEvent::Destroyed` handler also
 * releases any lock owned by a destroyed window immediately, covering the
 * close case without waiting for the lease. A release, renew, or fenced
 * write from an acquisition that is not the current owner is rejected, so
 * a reloaded tab cannot release or extend another acquisition's lock.
 *
 * Renewal failure is surfaced, not swallowed: a renewal that returns an
 * error (or rejects) means the acquisition is no longer the current owner
 * — the lease expired and another window acquired, or the lock was
 * released by the window-destroyed handler. Continuing the critical
 * section would risk a stale write; the renewal error is re-thrown into
 * the operation so the driver's write is not attempted against an
 * acquisition the Rust side no longer recognizes. The `finally` release
 * is still attempted (best-effort, errors swallowed) so a transient
 * renewal failure does not orphan the lock if the acquisition is in fact
 * still current.
 */
export class TauriScenarioStoreLock implements ScenarioStoreLock {
	constructor(private readonly invoke: TauriInvokeLike) {}

	async withLock<T>(name: string, operation: (context: LockContext) => Promise<T>): Promise<T> {
		const acquired = await this.invoke('acquire_scenario_lock', { name });
		// Validate the fencing token before threading it through the
		// critical section. The Rust `acquire_scenario_lock` command returns
		// a process-wide monotonic acquisition ID (never 0). An undefined or
		// non-finite value means the lock was not actually acquired — either
		// the command rejected, the runtime returned an unexpected payload,
		// or a mock/fallback bypassed the Rust-side guard. Treating that as
		// a valid acquisition would let an unfenced write proceed against a
		// potentially stale or absent owner, so surface a clear error instead
		// of casting silently. The unfenced fallback path is covered by
		// `NoopScenarioStoreLock`, which passes an empty `LockContext` and
		// never calls `acquire_scenario_lock`.
		if (
			typeof acquired !== 'number' ||
			!Number.isFinite(acquired) ||
			!Number.isInteger(acquired) ||
			acquired <= 0
		) {
			throw new Error(
				`acquire_scenario_lock returned an invalid acquisition ID for "${name}": ${String(acquired)}`
			);
		}
		const acquisitionId = acquired;
		// A renewal failure means the acquisition is no longer current on
		// the Rust side (lease expired and another window acquired, or the
		// window-destroyed handler released it). Continuing the critical
		// section would risk a stale write; surface the renewal error into
		// the operation by racing it against a deferred rejection, so the
		// driver's fenced write is not attempted against a stale
		// acquisition ID. The deferred is one-shot: the first renewal
		// failure wins; later failures are no-ops.
		let rejectRenewal: ((error: unknown) => void) | null = null;
		const renewalFailed = new Promise<never>((_resolve, reject) => {
			rejectRenewal = reject;
		});
		// Mark the rejection handled up front so an unused deferred (the
		// common case — no renewal failure) does not surface as an
		// unhandled rejection when the lock is released.
		void renewalFailed.catch(() => {});
		const renewHandle = setInterval(() => {
			void this.invoke('renew_scenario_lock', { name, acquisitionId }).then(
				() => {
					// Renewal succeeded; the acquisition is still current.
				},
				(error) => {
					if (rejectRenewal !== null) {
						rejectRenewal(error);
						rejectRenewal = null;
					}
				}
			);
		}, LEASE_RENEWAL_INTERVAL_MS);
		try {
			const operationPromise = operation({ acquisitionId });
			return await Promise.race([operationPromise, renewalFailed]);
		} finally {
			clearInterval(renewHandle);
			// Best-effort release: by the time we get here the acquisition
			// may already be gone (lease expired, window destroyed, or a
			// prior stale release). Swallow the error so a transient
			// release failure does not mask the operation's real result.
			await this.invoke('release_scenario_lock', { name, acquisitionId }).catch(() => {});
		}
	}
}
