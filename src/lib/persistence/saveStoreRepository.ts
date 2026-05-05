import type { GameState } from '$lib/game/types';
import {
	SaveDataError,
	createAutoSaveRecord,
	createManualSlotId,
	createSaveRecord,
	createSaveSummary
} from './saveCodec';
import type { SaveRepository } from './saveRepository';
import type { SaveRecord, SaveSlotMetadata, SaveStoreSnapshot, SaveSummary } from './saveTypes';

export interface SaveStoreDriver {
	read(): Promise<SaveStoreSnapshot>;
	write(snapshot: SaveStoreSnapshot): Promise<void>;
}

export class SaveRepositoryFromDriver implements SaveRepository {
	constructor(
		private readonly driver: SaveStoreDriver,
		private readonly now: () => Date = () => new Date()
	) {}

	async getSummary(): Promise<SaveSummary> {
		return createSaveSummary(await this.driver.read());
	}

	async getAutoSave(): Promise<SaveRecord | null> {
		return (await this.driver.read()).autoSave;
	}

	async saveAuto(game: GameState): Promise<SaveSlotMetadata> {
		const snapshot = await this.driver.read();
		const autoSave = createAutoSaveRecord(game, this.now());
		await this.driver.write({ ...snapshot, autoSave });
		return autoSave.metadata;
	}

	async createManualSlot(name: string, game: GameState): Promise<SaveSlotMetadata> {
		const updatedAt = this.now();
		const slot = createSaveRecord(game, {
			id: createManualSlotId(name, updatedAt),
			name,
			kind: 'manual',
			updatedAt
		});
		const snapshot = await this.driver.read();
		await this.driver.write({
			...snapshot,
			manualSlots: sortSlots([slot, ...snapshot.manualSlots])
		});
		return slot.metadata;
	}

	async overwriteManualSlot(
		slotId: string,
		name: string,
		game: GameState
	): Promise<SaveSlotMetadata> {
		const snapshot = await this.driver.read();

		if (!snapshot.manualSlots.some((slot) => slot.metadata.id === slotId)) {
			throw new SaveDataError(`Manual save slot not found: ${slotId}`);
		}

		const replacement = createSaveRecord(game, {
			id: slotId,
			name,
			kind: 'manual',
			updatedAt: this.now()
		});
		await this.driver.write({
			...snapshot,
			manualSlots: sortSlots(
				snapshot.manualSlots.map((slot) => (slot.metadata.id === slotId ? replacement : slot))
			)
		});
		return replacement.metadata;
	}

	async loadManualSlot(slotId: string): Promise<SaveRecord | null> {
		const snapshot = await this.driver.read();
		return snapshot.manualSlots.find((slot) => slot.metadata.id === slotId) ?? null;
	}

	async deleteManualSlot(slotId: string): Promise<void> {
		const snapshot = await this.driver.read();
		await this.driver.write({
			...snapshot,
			manualSlots: snapshot.manualSlots.filter((slot) => slot.metadata.id !== slotId)
		});
	}
}

function sortSlots(slots: SaveRecord[]): SaveRecord[] {
	return [...slots].sort((left, right) =>
		right.metadata.updatedAt.localeCompare(left.metadata.updatedAt)
	);
}
