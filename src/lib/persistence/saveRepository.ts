import type { GameState } from '$lib/game/types';
import type { SaveRecord, SaveSlotMetadata, SaveSummary } from './saveTypes';

export interface SaveRepository {
	getSummary(): Promise<SaveSummary>;
	getAutoSave(): Promise<SaveRecord | null>;
	saveAuto(game: GameState): Promise<SaveSlotMetadata>;
	createManualSlot(name: string, game: GameState): Promise<SaveSlotMetadata>;
	overwriteManualSlot(slotId: string, name: string, game: GameState): Promise<SaveSlotMetadata>;
	loadManualSlot(slotId: string): Promise<SaveRecord | null>;
	deleteManualSlot(slotId: string): Promise<void>;
}
