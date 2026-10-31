import type { GameState } from '$lib/game/types';

export const SAVE_SCHEMA_VERSION = 19;
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
	activeCityId: string;
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

/**
 * One record dropped during a salvage decode: `code` identifies the failure
 * class, `path` locates the entry inside the store (`autoSave`,
 * `manualSlots[<index>]`, or `saveStore` for a store-level failure), and
 * `detail` carries the underlying validation message.
 */
export interface SaveStoreDiagnostic {
	code: 'invalid-record';
	path: string;
	detail: string;
}

/** Read-path result: the salvaged snapshot plus every dropped record. */
export interface DecodeSaveStoreResult {
	snapshot: SaveStoreSnapshot;
	diagnostics: SaveStoreDiagnostic[];
}

export interface SaveSummary {
	autoSave: SaveSlotMetadata | null;
	manualSlots: SaveSlotMetadata[];
	/** Records dropped by the most recent salvage read; empty on a clean store. */
	diagnostics: SaveStoreDiagnostic[];
}
