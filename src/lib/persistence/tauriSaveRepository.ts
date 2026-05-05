import { load } from '@tauri-apps/plugin-store';
import { createEmptySaveStore, validateSaveStoreSnapshot } from './saveCodec';
import type { SaveRepository } from './saveRepository';
import { SaveRepositoryFromDriver, type SaveStoreDriver } from './saveStoreRepository';
import type { SaveStoreSnapshot } from './saveTypes';

export const SAVE_STORE_FILE = 'serpens-saves.json';
export const SAVE_STORE_KEY = 'saves';

export interface StoreLike {
	get<T>(key: string): Promise<T | null | undefined>;
	set(key: string, value: unknown): Promise<void>;
	save(): Promise<void>;
}

class TauriSaveStoreDriver implements SaveStoreDriver {
	constructor(private readonly storePromise: Promise<StoreLike>) {}

	async read(): Promise<SaveStoreSnapshot> {
		const store = await this.storePromise;
		const snapshot = await store.get<unknown>(SAVE_STORE_KEY);
		return snapshot === undefined ? createEmptySaveStore() : validateSaveStoreSnapshot(snapshot);
	}

	async write(snapshot: SaveStoreSnapshot): Promise<void> {
		const store = await this.storePromise;
		await store.set(SAVE_STORE_KEY, validateSaveStoreSnapshot(snapshot));
		await store.save();
	}
}

export function createTauriSaveRepository(now: () => Date = () => new Date()): SaveRepository {
	return createTauriSaveRepositoryFromStore(
		load(SAVE_STORE_FILE, { defaults: {}, autoSave: false }),
		now
	);
}

export function createTauriSaveRepositoryFromStore(
	storePromise: Promise<StoreLike>,
	now: () => Date = () => new Date()
): SaveRepository {
	return new SaveRepositoryFromDriver(new TauriSaveStoreDriver(storePromise), now);
}
