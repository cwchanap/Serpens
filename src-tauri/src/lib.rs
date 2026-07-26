use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;
use tauri::State;
use tauri_plugin_store::StoreExt;
use tokio::sync::{Mutex, Notify};
use tokio::time::Instant;

const DEFAULT_LEASE_DURATION: Duration = Duration::from_secs(30);

/// Scenario store file/key — must match the TS constants in
/// `tauriScenarioRepository.ts` so the fenced write command targets the
/// same store the TS driver reads from.
const SCENARIO_STORE_FILE: &str = "serpens-scenarios.json";
const SCENARIO_STORE_KEY: &str = "scenarios";

/// Uniquely identifies a single lock acquisition. Ownership is the pair
/// `{ window_label, acquisition_id }`, not just the window label: if
/// acquisition A expires and the same window later obtains acquisition B,
/// a delayed `finally` release or renewal from A must not be authorized
/// against B's active critical section. The acquisition ID is a
/// process-wide monotonic counter, so it is unique for the lifetime of
/// the Rust process (locks do not persist across restarts).
#[derive(Clone, Debug, PartialEq, Eq)]
struct OwnerIdentity {
    window_label: String,
    acquisition_id: u64,
}

struct NamedLock {
    held: Mutex<bool>,
    notify: Notify,
    owner: Mutex<Option<OwnerIdentity>>,
    lease_deadline: Mutex<Option<Instant>>,
}

impl NamedLock {
    fn new() -> Self {
        Self {
            held: Mutex::new(false),
            notify: Notify::new(),
            owner: Mutex::new(None),
            lease_deadline: Mutex::new(None),
        }
    }
}

struct LockRegistry {
    locks: Mutex<HashMap<String, Arc<NamedLock>>>,
    lease_duration: Duration,
    next_acquisition_id: AtomicU64,
}

impl LockRegistry {
    fn new(lease_duration: Duration) -> Self {
        Self {
            locks: Mutex::new(HashMap::new()),
            lease_duration,
            next_acquisition_id: AtomicU64::new(1),
        }
    }

    async fn get(&self, name: &str) -> Arc<NamedLock> {
        let mut map = self.locks.lock().await;
        map.entry(name.to_string())
            .or_insert_with(|| Arc::new(NamedLock::new()))
            .clone()
    }

    fn next_acquisition_id(&self) -> u64 {
        // Monotonic, never 0 (starts at 1). 0 is reserved as "no token"
        // so TS can treat a missing/undefined ID as "unfenced".
        self.next_acquisition_id.fetch_add(1, Ordering::Relaxed)
    }
}

impl Default for LockRegistry {
    fn default() -> Self {
        Self::new(DEFAULT_LEASE_DURATION)
    }
}

/// Release the lock only if the current owner matches `{ owner_label,
/// acquisition_id }`. Returns false (no-op) when the caller is not the
/// current owner, so a stale release from a previous acquisition of the
/// same window cannot unlock a later acquisition's active critical
/// section.
async fn release_lock_owned_by(
    lock: &NamedLock,
    owner_label: &str,
    acquisition_id: u64,
) -> bool {
    let mut held = lock.held.lock().await;
    let mut owner = lock.owner.lock().await;
    if !is_current_owner(owner.as_ref(), owner_label, acquisition_id) {
        return false;
    }
    *held = false;
    *owner = None;
    *lock.lease_deadline.lock().await = None;
    drop(held);
    drop(owner);
    lock.notify.notify_one();
    true
}

fn is_current_owner(
    owner: Option<&OwnerIdentity>,
    label: &str,
    acquisition_id: u64,
) -> bool {
    match owner {
        Some(o) => o.window_label == label && o.acquisition_id == acquisition_id,
        None => false,
    }
}

fn spawn_lease_task(lock: Arc<NamedLock>, owner: OwnerIdentity, deadline: Instant) {
    tokio::spawn(async move {
        tokio::time::sleep_until(deadline).await;
        let mut held = lock.held.lock().await;
        let mut owner_guard = lock.owner.lock().await;
        let mut lease_deadline = lock.lease_deadline.lock().await;
        if *held
            && is_current_owner(owner_guard.as_ref(), &owner.window_label, owner.acquisition_id)
            && *lease_deadline == Some(deadline)
        {
            *held = false;
            *owner_guard = None;
            *lease_deadline = None;
            drop(held);
            drop(owner_guard);
            drop(lease_deadline);
            lock.notify.notify_one();
        }
    });
}

/// Acquire the lock, returning a unique acquisition ID the caller must
/// present for every subsequent renew/release/write on this acquisition.
async fn acquire_lock(
    registry: &LockRegistry,
    name: &str,
    owner_label: &str,
) -> Result<u64, String> {
    let lock = registry.get(name).await;
    loop {
        {
            let mut held = lock.held.lock().await;
            if !*held {
                let acquisition_id = registry.next_acquisition_id();
                let owner = OwnerIdentity {
                    window_label: owner_label.to_string(),
                    acquisition_id,
                };
                *held = true;
                *lock.owner.lock().await = Some(owner.clone());
                let deadline = Instant::now() + registry.lease_duration;
                *lock.lease_deadline.lock().await = Some(deadline);
                spawn_lease_task(lock.clone(), owner, deadline);
                return Ok(acquisition_id);
            }
        }
        lock.notify.notified().await;
    }
}

async fn renew_lock(
    registry: &LockRegistry,
    name: &str,
    owner_label: &str,
    acquisition_id: u64,
) -> Result<(), String> {
    let lock = registry.get(name).await;
    let owner_guard = lock.owner.lock().await;
    if !is_current_owner(owner_guard.as_ref(), owner_label, acquisition_id) {
        return Err("not owner".to_string());
    }
    let new_deadline = Instant::now() + registry.lease_duration;
    *lock.lease_deadline.lock().await = Some(new_deadline);
    let owner = owner_guard.as_ref().unwrap().clone();
    drop(owner_guard);
    spawn_lease_task(lock, owner, new_deadline);
    Ok(())
}

async fn release_locks_owned_by(registry: &LockRegistry, label: &str) {
    let map = registry.locks.lock().await;
    for lock in map.values() {
        // Release any acquisition owned by this window label, regardless of
        // acquisition ID — the window is being destroyed, so all of its
        // acquisitions are orphaned. Pass acquisition_id = 0 with a special
        // label-only path to bypass the acquisition-ID check.
        release_lock_owned_by_label(lock, label).await;
    }
}

/// Label-only release used by the window-destroyed handler. A destroyed
/// window can no longer issue renew/release/write commands, so all of its
/// acquisitions (regardless of acquisition ID) are orphaned and must be
/// recovered.
async fn release_lock_owned_by_label(lock: &NamedLock, owner_label: &str) -> bool {
    let mut held = lock.held.lock().await;
    let mut owner = lock.owner.lock().await;
    if owner.as_ref().map(|o| o.window_label.as_str()) != Some(owner_label) {
        return false;
    }
    *held = false;
    *owner = None;
    *lock.lease_deadline.lock().await = None;
    drop(held);
    drop(owner);
    lock.notify.notify_one();
    true
}

#[tauri::command]
async fn acquire_scenario_lock(
    name: String,
    webview_window: tauri::WebviewWindow,
    state: State<'_, LockRegistry>,
) -> Result<u64, String> {
    acquire_lock(&state, &name, webview_window.label()).await
}

#[tauri::command]
async fn release_scenario_lock(
    name: String,
    acquisition_id: u64,
    webview_window: tauri::WebviewWindow,
    state: State<'_, LockRegistry>,
) -> Result<(), String> {
    let lock = state.get(&name).await;
    release_lock_owned_by(&lock, webview_window.label(), acquisition_id).await;
    Ok(())
}

#[tauri::command]
async fn renew_scenario_lock(
    name: String,
    acquisition_id: u64,
    webview_window: tauri::WebviewWindow,
    state: State<'_, LockRegistry>,
) -> Result<(), String> {
    renew_lock(&state, &name, webview_window.label(), acquisition_id).await
}

/// Fenced write: writes the scenario store snapshot only if the caller's
/// `acquisition_id` is still the current owner of the named lock. This is
/// the fencing token that closes the lease-expiry-during-critical-section
/// gap: if the lease expired and another window acquired the lock (and
/// wrote), this write is rejected instead of silently clobbering the
/// newer write.
///
/// `held` is held across the ownership check AND the store write so no
/// other window can acquire between the check and the durable write, and
/// no lease-expiry task can fire mid-write. `store.set` and `store.save`
/// are synchronous, so holding the tokio mutex across them blocks the
/// runtime thread only for the duration of an in-memory map insert plus a
/// small JSON file flush — acceptable for a desktop app's scenario store.
#[tauri::command]
async fn write_scenario_store_locked(
    name: String,
    acquisition_id: u64,
    snapshot: serde_json::Value,
    webview_window: tauri::WebviewWindow,
    state: State<'_, LockRegistry>,
) -> Result<(), String> {
    let lock = state.get(&name).await;
    let held = lock.held.lock().await;
    let owner_guard = lock.owner.lock().await;
    if !is_current_owner(owner_guard.as_ref(), webview_window.label(), acquisition_id) {
        return Err("fencing rejected: not the current lock owner".to_string());
    }
    drop(owner_guard);
    // Perform the store write while holding `held` so the fencing check
    // and the durable write are atomic with respect to other acquirers
    // and lease-expiry tasks.
    let store = webview_window
        .store(SCENARIO_STORE_FILE)
        .map_err(|e| e.to_string())?;
    store.set(SCENARIO_STORE_KEY, snapshot);
    store.save().map_err(|e| e.to_string())?;
    drop(held);
    Ok(())
}

/// Fenced delete: deletes the scenario store key only if the caller's
/// `acquisition_id` is still the current owner of the named lock. This is
/// the rollback counterpart to `write_scenario_store_locked`: when a fenced
/// write fails after the cache was mutated, the driver restores the
/// pre-write baseline through this command. If the baseline was "no key
/// existed", the restore is a fenced delete. Routing the delete through
/// the Rust-side fencing check (instead of the unfenced TS `store.delete`
/// + `store.save`) prevents a stale owner whose lease expired mid-recovery
/// from clobbering a newer revision another window wrote.
///
/// Like `write_scenario_store_locked`, `held` is held across the ownership
/// check AND the store delete so the fencing check and the durable delete
/// are atomic with respect to other acquirers and lease-expiry tasks.
#[tauri::command]
async fn delete_scenario_store_locked(
    name: String,
    acquisition_id: u64,
    webview_window: tauri::WebviewWindow,
    state: State<'_, LockRegistry>,
) -> Result<(), String> {
    let lock = state.get(&name).await;
    let held = lock.held.lock().await;
    let owner_guard = lock.owner.lock().await;
    if !is_current_owner(owner_guard.as_ref(), webview_window.label(), acquisition_id) {
        return Err("fencing rejected: not the current lock owner".to_string());
    }
    drop(owner_guard);
    let store = webview_window
        .store(SCENARIO_STORE_FILE)
        .map_err(|e| e.to_string())?;
    store.delete(SCENARIO_STORE_KEY);
    store.save().map_err(|e| e.to_string())?;
    drop(held);
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(LockRegistry::default())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let label = window.label().to_string();
                let app = window.app_handle().clone();
                tauri::async_runtime::block_on(async move {
                    let state = app.state::<LockRegistry>();
                    release_locks_owned_by(&state, &label).await;
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            acquire_scenario_lock,
            release_scenario_lock,
            renew_scenario_lock,
            write_scenario_store_locked,
            delete_scenario_store_locked
        ])
        .plugin(tauri_plugin_store::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    fn make_registry(lease: Duration) -> LockRegistry {
        LockRegistry::new(lease)
    }

    #[tokio::test]
    async fn acquire_sets_owner_release_clears_owner() {
        let registry = make_registry(DEFAULT_LEASE_DURATION);
        let acquisition_id = acquire_lock(&registry, "serpens.scenarios", "main")
            .await
            .unwrap();
        let lock = registry.get("serpens.scenarios").await;
        assert!(*lock.held.lock().await);
        let owner = lock.owner.lock().await.clone();
        assert_eq!(
            owner,
            Some(OwnerIdentity {
                window_label: "main".to_string(),
                acquisition_id
            })
        );

        let released = release_lock_owned_by(&lock, "main", acquisition_id).await;
        assert!(released);
        assert!(!*lock.held.lock().await);
        assert_eq!(*lock.owner.lock().await, None);
        assert_eq!(*lock.lease_deadline.lock().await, None);
    }

    #[tokio::test]
    async fn release_by_non_owner_is_noop() {
        let registry = make_registry(DEFAULT_LEASE_DURATION);
        let acquisition_id = acquire_lock(&registry, "serpens.scenarios", "main")
            .await
            .unwrap();
        let lock = registry.get("serpens.scenarios").await;

        let released = release_lock_owned_by(&lock, "other", acquisition_id).await;
        assert!(!released);
        assert!(*lock.held.lock().await);
        assert_eq!(
            lock.owner.lock().await.as_ref().unwrap().window_label,
            "main"
        );
    }

    #[tokio::test]
    async fn release_by_stale_acquisition_id_is_noop() {
        // The core P1 #2 regression: acquisition A expires, the same
        // window obtains acquisition B, then A's delayed finally-release
        // must not unlock B's active critical section. Both operations
        // carry the same window label, so authentication must also check
        // the acquisition ID.
        let registry = make_registry(DEFAULT_LEASE_DURATION);
        let id_a = acquire_lock(&registry, "serpens.scenarios", "main")
            .await
            .unwrap();
        let lock = registry.get("serpens.scenarios").await;
        // Simulate A's lease expiring and being released at the Rust level.
        release_lock_owned_by(&lock, "main", id_a).await;
        // The same window reacquires (B).
        let id_b = acquire_lock(&registry, "serpens.scenarios", "main")
            .await
            .unwrap();
        assert_ne!(id_a, id_b, "acquisition IDs must be unique");
        assert!(*lock.held.lock().await);

        // A's stale release (same label, wrong acquisition ID) is a no-op.
        let released = release_lock_owned_by(&lock, "main", id_a).await;
        assert!(!released);
        assert!(*lock.held.lock().await, "B's lock must survive A's stale release");
        assert_eq!(lock.owner.lock().await.as_ref().unwrap().acquisition_id, id_b);

        // B's own release still works.
        let released = release_lock_owned_by(&lock, "main", id_b).await;
        assert!(released);
        assert!(!*lock.held.lock().await);
    }

    #[tokio::test]
    async fn lease_auto_releases_after_expiry_without_release() {
        let registry = make_registry(Duration::from_millis(50));
        acquire_lock(&registry, "serpens.scenarios", "main")
            .await
            .unwrap();
        tokio::time::sleep(Duration::from_millis(150)).await;
        let lock = registry.get("serpens.scenarios").await;
        assert!(
            !*lock.held.lock().await,
            "lock should auto-release after lease expiry"
        );
        assert_eq!(*lock.owner.lock().await, None);
        assert_eq!(*lock.lease_deadline.lock().await, None);
    }

    #[tokio::test]
    async fn renew_extends_lease_past_original_deadline() {
        let registry = make_registry(Duration::from_millis(50));
        let acquisition_id = acquire_lock(&registry, "serpens.scenarios", "main")
            .await
            .unwrap();
        tokio::time::sleep(Duration::from_millis(20)).await;
        renew_lock(&registry, "serpens.scenarios", "main", acquisition_id)
            .await
            .unwrap();
        tokio::time::sleep(Duration::from_millis(40)).await;
        let lock = registry.get("serpens.scenarios").await;
        assert!(
            *lock.held.lock().await,
            "lock should still be held after renew past original deadline"
        );
        tokio::time::sleep(Duration::from_millis(80)).await;
        let lock = registry.get("serpens.scenarios").await;
        assert!(
            !*lock.held.lock().await,
            "lock should auto-release after renewed lease expires"
        );
    }

    #[tokio::test]
    async fn renew_by_non_owner_returns_error() {
        let registry = make_registry(Duration::from_millis(200));
        let acquisition_id = acquire_lock(&registry, "serpens.scenarios", "main")
            .await
            .unwrap();
        let result = renew_lock(&registry, "serpens.scenarios", "other", acquisition_id).await;
        assert!(result.is_err());
        let lock = registry.get("serpens.scenarios").await;
        assert_eq!(lock.owner.lock().await.as_ref().unwrap().window_label, "main");
    }

    #[tokio::test]
    async fn renew_by_stale_acquisition_id_returns_error() {
        // Same regression as release_by_stale_acquisition_id but for renew:
        // a stale renewal from A must not extend B's lease.
        let registry = make_registry(Duration::from_millis(200));
        let id_a = acquire_lock(&registry, "serpens.scenarios", "main")
            .await
            .unwrap();
        let lock = registry.get("serpens.scenarios").await;
        release_lock_owned_by(&lock, "main", id_a).await;
        let id_b = acquire_lock(&registry, "serpens.scenarios", "main")
            .await
            .unwrap();

        let result = renew_lock(&registry, "serpens.scenarios", "main", id_a).await;
        assert!(result.is_err(), "stale renew must be rejected");
        assert_eq!(lock.owner.lock().await.as_ref().unwrap().acquisition_id, id_b);
    }

    #[tokio::test]
    async fn release_locks_owned_by_releases_matching_label_only() {
        let registry = make_registry(DEFAULT_LEASE_DURATION);
        acquire_lock(&registry, "lock-a", "main").await.unwrap();
        acquire_lock(&registry, "lock-b", "other").await.unwrap();

        release_locks_owned_by(&registry, "main").await;

        let lock_a = registry.get("lock-a").await;
        let lock_b = registry.get("lock-b").await;
        assert!(!*lock_a.held.lock().await, "main's lock should be released");
        assert_eq!(*lock_a.owner.lock().await, None);
        assert!(
            *lock_b.held.lock().await,
            "other's lock should remain held"
        );
        assert_eq!(
            lock_b.owner.lock().await.as_ref().unwrap().window_label,
            "other"
        );
    }

    #[tokio::test]
    async fn acquisition_ids_are_unique_and_monotonic() {
        let registry = make_registry(DEFAULT_LEASE_DURATION);
        let id1 = acquire_lock(&registry, "l1", "main").await.unwrap();
        let lock1 = registry.get("l1").await;
        release_lock_owned_by(&lock1, "main", id1).await;
        let id2 = acquire_lock(&registry, "l2", "main").await.unwrap();
        let lock2 = registry.get("l2").await;
        release_lock_owned_by(&lock2, "main", id2).await;
        let id3 = acquire_lock(&registry, "l3", "main").await.unwrap();
        let lock3 = registry.get("l3").await;
        release_lock_owned_by(&lock3, "main", id3).await;
        assert!(id1 < id2 && id2 < id3, "acquisition IDs must be monotonic");
        assert_ne!(id1, 0, "acquisition ID 0 is reserved");
    }
}
