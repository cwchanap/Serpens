import {
	createEmptySaveStore,
	parseSaveStoreSnapshot,
	validateSaveStoreSnapshot
} from './saveCodec';
import type { SaveRepository } from './saveRepository';
import { SaveRepositoryFromDriver, type SaveStoreDriver } from './saveStoreRepository';
import type { SaveStoreSnapshot } from './saveTypes';

export const BROWSER_SAVE_STORAGE_KEY = 'serpens.saves.v1';

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

class BrowserSaveStoreDriver implements SaveStoreDriver {
	constructor(private readonly storage: StorageLike) {}

	async read(): Promise<SaveStoreSnapshot> {
		const serialized = this.storage.getItem(BROWSER_SAVE_STORAGE_KEY);
		return serialized === null ? createEmptySaveStore() : parseSaveStoreSnapshot(serialized);
	}

	async write(snapshot: SaveStoreSnapshot): Promise<void> {
		const cleanSnapshot = validateSaveStoreSnapshot(snapshot);
		this.storage.setItem(BROWSER_SAVE_STORAGE_KEY, JSON.stringify(cleanSnapshot));
	}
}

export function createBrowserSaveRepository(
	storage: StorageLike = globalThis.localStorage,
	now: () => Date = () => new Date()
): SaveRepository {
	return new SaveRepositoryFromDriver(new BrowserSaveStoreDriver(storage), now);
}
