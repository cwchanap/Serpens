import type { GameState } from '$lib/game/types';

export const SAVE_SCHEMA_VERSION = 5;
export const AUTO_SAVE_SLOT_ID = 'autosave';

export type SaveSlotKind = 'auto' | 'manual';

export interface SaveSlotMetadata {
	id: string;
	name: string;
	kind: SaveSlotKind;
	updatedAt: string;
	day: number;
	cash: number;
	storeCount: number;
	activeCityName: string;
}

export interface SaveRecord {
	schemaVersion: typeof SAVE_SCHEMA_VERSION;
	metadata: SaveSlotMetadata;
	game: GameState;
}

export interface SaveStoreSnapshot {
	schemaVersion: typeof SAVE_SCHEMA_VERSION;
	autoSave: SaveRecord | null;
	manualSlots: SaveRecord[];
}

export interface SaveSummary {
	autoSave: SaveSlotMetadata | null;
	manualSlots: SaveSlotMetadata[];
}
