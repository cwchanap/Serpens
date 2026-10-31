import type { GameState } from '$lib/game/types';
import {
	SaveDataError,
	cloneSaveStoreSnapshot,
	createAutoSaveRecord,
	createEmptySaveStore,
	createManualSlotId,
	createSaveRecord,
	createSaveSummary
} from './saveCodec';
import type { SaveRepository } from './saveRepository';
import type {
	DecodeSaveStoreResult,
	SaveRecord,
	SaveSlotMetadata,
	SaveStoreSnapshot,
	SaveSummary
} from './saveTypes';

export interface SaveStoreDriver {
	read(): Promise<DecodeSaveStoreResult>;
	write(snapshot: SaveStoreSnapshot): Promise<void>;
}

export class SaveRepositoryFromDriver implements SaveRepository {
	private mutationQueue: Promise<void> = Promise.resolve();

	constructor(
		private readonly driver: SaveStoreDriver,
		private readonly now: () => Date = () => new Date()
	) {}

	async getSummary(): Promise<SaveSummary> {
		const { snapshot, diagnostics } = await this.readSnapshot();
		return createSaveSummary(snapshot, diagnostics);
	}

	async getAutoSave(): Promise<SaveRecord | null> {
		return (await this.readSnapshot()).snapshot.autoSave;
	}

	async saveAuto(game: GameState): Promise<SaveSlotMetadata> {
		return this.mutate(async () => {
			const { snapshot } = await this.readSnapshot();
			const autoSave = createAutoSaveRecord(game, this.now());
			await this.writeSnapshot({ ...snapshot, autoSave });
			return { ...autoSave.metadata };
		});
	}

	async createManualSlot(name: string, game: GameState): Promise<SaveSlotMetadata> {
		return this.mutate(async () => {
			const { snapshot } = await this.readSnapshot();
			const updatedAt = this.now();
			const slot = createSaveRecord(game, {
				id: createUniqueManualSlotId(name, updatedAt, snapshot.manualSlots),
				name,
				kind: 'manual',
				updatedAt
			});
			await this.writeSnapshot({
				...snapshot,
				manualSlots: sortSlots([slot, ...snapshot.manualSlots])
			});
			return { ...slot.metadata };
		});
	}

	async overwriteManualSlot(
		slotId: string,
		name: string,
		game: GameState
	): Promise<SaveSlotMetadata> {
		return this.mutate(async () => {
			const { snapshot } = await this.readSnapshot();

			if (!snapshot.manualSlots.some((slot) => slot.metadata.id === slotId)) {
				throw new SaveDataError(`Manual save slot not found: ${slotId}`, 'slot-not-found');
			}

			const replacement = createSaveRecord(game, {
				id: slotId,
				name,
				kind: 'manual',
				updatedAt: this.now()
			});
			await this.writeSnapshot({
				...snapshot,
				manualSlots: sortSlots(
					snapshot.manualSlots.map((slot) => (slot.metadata.id === slotId ? replacement : slot))
				)
			});
			return { ...replacement.metadata };
		});
	}

	async loadManualSlot(slotId: string): Promise<SaveRecord | null> {
		const { snapshot } = await this.readSnapshot();
		return snapshot.manualSlots.find((slot) => slot.metadata.id === slotId) ?? null;
	}

	async deleteManualSlot(slotId: string): Promise<void> {
		return this.mutate(async () => {
			const { snapshot } = await this.readSnapshot();
			await this.writeSnapshot({
				...snapshot,
				manualSlots: snapshot.manualSlots.filter((slot) => slot.metadata.id !== slotId)
			});
		});
	}

	private async readSnapshot(): Promise<DecodeSaveStoreResult> {
		try {
			const result = await this.driver.read();
			// The driver already decoded and validated every record; clone
			// without re-validating (cloneSaveStoreSnapshot would run the full
			// strict pass — including the earned-claim goal re-evaluation — a
			// second time on every slot).
			return { snapshot: structuredClone(result.snapshot), diagnostics: result.diagnostics };
		} catch (error) {
			if (error instanceof SaveDataError) {
				return {
					snapshot: createEmptySaveStore(),
					diagnostics: [{ code: 'invalid-record', path: 'saveStore', detail: error.message }]
				};
			}

			throw error;
		}
	}

	private async writeSnapshot(snapshot: SaveStoreSnapshot): Promise<void> {
		await this.driver.write(cloneSaveStoreSnapshot(snapshot));
	}

	private async mutate<T>(operation: () => Promise<T>): Promise<T> {
		const result = this.mutationQueue.then(operation, operation);
		this.mutationQueue = result.then(
			() => undefined,
			() => undefined
		);
		return result;
	}
}

function createUniqueManualSlotId(
	name: string,
	updatedAt: Date,
	existingSlots: SaveRecord[]
): string {
	const baseId = createManualSlotId(name, updatedAt);
	const existingIds = new Set(existingSlots.map((slot) => slot.metadata.id));

	if (!existingIds.has(baseId)) {
		return baseId;
	}

	for (let suffix = 2; ; suffix += 1) {
		const candidate = `${baseId}-${suffix}`;

		if (!existingIds.has(candidate)) {
			return candidate;
		}
	}
}

function sortSlots(slots: SaveRecord[]): SaveRecord[] {
	return [...slots].sort((left, right) =>
		right.metadata.updatedAt.localeCompare(left.metadata.updatedAt)
	);
}
