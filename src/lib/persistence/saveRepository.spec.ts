import { describe, expect, test } from 'vitest';
import type { GameState } from '$lib/game/types';
import { SAVE_SCHEMA_VERSION, type SaveStoreSnapshot } from './saveTypes';
import {
	SaveDataError,
	createEmptySaveStore,
	createSaveRecord,
	validateSaveStoreSnapshot
} from './saveCodec';
import { createBrowserSaveRepository, type StorageLike } from './browserSaveRepository';
import { SaveRepositoryFromDriver, type SaveStoreDriver } from './saveStoreRepository';

class FakeStorage implements StorageLike {
	private values = new Map<string, string>();

	getItem(key: string): string | null {
		return this.values.get(key) ?? null;
	}

	setItem(key: string, value: string): void {
		this.values.set(key, value);
	}

	removeItem(key: string): void {
		this.values.delete(key);
	}
}

class MemorySaveStoreDriver implements SaveStoreDriver {
	constructor(private snapshot: SaveStoreSnapshot = createEmptySaveStore()) {}

	async read(): Promise<SaveStoreSnapshot> {
		return this.snapshot;
	}

	async write(snapshot: SaveStoreSnapshot): Promise<void> {
		this.snapshot = snapshot;
	}
}

class DelayedMemorySaveStoreDriver extends MemorySaveStoreDriver {
	override async read(): Promise<SaveStoreSnapshot> {
		await delay();
		return super.read();
	}

	override async write(snapshot: SaveStoreSnapshot): Promise<void> {
		await delay();
		await super.write(snapshot);
	}
}

function delay(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
}

function createGame(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 20260505,
		rngState: 99,
		day: 3,
		cash: 12500,
		debt: 2000,
		policy: {
			pricing: 'standard',
			inventory: 'balanced',
			staffing: 'efficient',
			marketing: 'awareness',
			service: 'balanced'
		},
		scorecard: {
			profit: 55,
			customerSatisfaction: 60,
			staffMorale: 65,
			marketPosition: 50
		},
		cities: [
			{
				id: 'harbor-city',
				name: 'Harbor City',
				width: 1,
				height: 1,
				tiles: []
			}
		],
		activeCityId: 'harbor-city',
		stores: [
			{
				id: 'store-1',
				name: 'Founding Store',
				archetypeId: 'boutique',
				location: 'Downtown (1, 1)',
				cityId: 'harbor-city',
				tileId: 'harbor-city-1-1',
				mapX: 1,
				mapY: 1,
				daysOpen: 2,
				reputation: 60,
				stockHealth: 70,
				staffMorale: 65,
				staffCapacity: 66,
				localDemand: 72,
				competition: 40,
				managerQuality: 58
			}
		],
		decisions: [],
		reports: [],
		...overrides
	};
}

describe('save records', () => {
	test('creates versioned metadata from game state', () => {
		expect.assertions(8);
		const record = createSaveRecord(createGame(), {
			id: 'manual-test-run',
			name: 'Test Run',
			kind: 'manual',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});

		expect(record.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(record.metadata.id).toBe('manual-test-run');
		expect(record.metadata.name).toBe('Test Run');
		expect(record.metadata.kind).toBe('manual');
		expect(record.metadata.day).toBe(3);
		expect(record.metadata.cash).toBe(12500);
		expect(record.metadata.storeCount).toBe(1);
		expect(record.metadata.activeCityName).toBe('Harbor City');
	});

	test('rejects unsupported snapshot schema versions', () => {
		expect.assertions(2);

		expect(() =>
			validateSaveStoreSnapshot({
				schemaVersion: 99,
				autoSave: null,
				manualSlots: []
			})
		).toThrow(SaveDataError);

		expect(() =>
			validateSaveStoreSnapshot({
				schemaVersion: 99,
				autoSave: null,
				manualSlots: []
			})
		).toThrow('Unsupported save schema version: 99');
	});

	test('rejects saved games missing current game state fields', () => {
		expect.assertions(2);
		const game = createGame();
		const gameWithoutPolicy: Partial<GameState> = { ...game };
		delete gameWithoutPolicy.policy;
		const record = createSaveRecord(game, {
			id: 'manual-test-run',
			name: 'Test Run',
			kind: 'manual',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});
		const snapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave: { ...record, game: gameWithoutPolicy },
			manualSlots: []
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game policy must be an object'
		);
	});
});

describe('browser save repository', () => {
	test('saves and loads auto-save records', async () => {
		expect.assertions(4);
		const repository = createBrowserSaveRepository(
			new FakeStorage(),
			() => new Date('2026-05-05T12:00:00.000Z')
		);
		const game = createGame();

		const metadata = await repository.saveAuto(game);
		const loaded = await repository.getAutoSave();
		const summary = await repository.getSummary();

		expect(metadata.kind).toBe('auto');
		expect(loaded?.game.day).toBe(3);
		expect(summary.autoSave?.id).toBe('autosave');
		expect(summary.manualSlots).toEqual([]);
	});

	test('creates, overwrites, loads, and deletes manual slots', async () => {
		expect.assertions(8);
		const repository = createBrowserSaveRepository(
			new FakeStorage(),
			() => new Date('2026-05-05T12:00:00.000Z')
		);
		const firstGame = createGame({ day: 4, cash: 15000 });
		const secondGame = createGame({ day: 8, cash: 22000 });

		const created = await repository.createManualSlot('Harbor Run', firstGame);
		let loaded = await repository.loadManualSlot(created.id);

		expect(created.id).toBe('manual-harbor-run-1777982400000');
		expect(loaded?.game.day).toBe(4);

		const overwritten = await repository.overwriteManualSlot(created.id, 'Harbor Run', secondGame);
		loaded = await repository.loadManualSlot(created.id);
		const summary = await repository.getSummary();

		expect(overwritten.day).toBe(8);
		expect(loaded?.game.cash).toBe(22000);
		expect(summary.manualSlots).toHaveLength(1);
		expect(summary.manualSlots[0]?.name).toBe('Harbor Run');

		await repository.deleteManualSlot(created.id);
		loaded = await repository.loadManualSlot(created.id);

		expect(loaded).toBeNull();
		expect((await repository.getSummary()).manualSlots).toEqual([]);
	});

	test('throws when overwriting a missing manual slot', async () => {
		expect.assertions(2);
		const repository = createBrowserSaveRepository(
			new FakeStorage(),
			() => new Date('2026-05-05T12:00:00.000Z')
		);

		await expect(
			repository.overwriteManualSlot('missing-slot', 'Missing', createGame())
		).rejects.toThrow(SaveDataError);
		await expect(
			repository.overwriteManualSlot('missing-slot', 'Missing', createGame())
		).rejects.toThrow('Manual save slot not found: missing-slot');
	});

	test('creates unique manual slot ids for duplicate names in the same millisecond', async () => {
		expect.assertions(3);
		const repository = createBrowserSaveRepository(
			new FakeStorage(),
			() => new Date('2026-05-05T12:00:00.000Z')
		);

		const first = await repository.createManualSlot('Harbor Run', createGame({ day: 4 }));
		const second = await repository.createManualSlot('Harbor Run', createGame({ day: 5 }));

		expect(first.id).toBe('manual-harbor-run-1777982400000');
		expect(second.id).toBe('manual-harbor-run-1777982400000-2');
		expect((await repository.getSummary()).manualSlots).toHaveLength(2);
	});

	test('serializes concurrent mutating operations so writes do not clobber each other', async () => {
		expect.assertions(2);
		const repository = new SaveRepositoryFromDriver(
			new DelayedMemorySaveStoreDriver(),
			() => new Date('2026-05-05T12:00:00.000Z')
		);

		await Promise.all([
			repository.createManualSlot('Harbor Run', createGame({ day: 4 })),
			repository.createManualSlot('Campus Run', createGame({ day: 5 }))
		]);
		const summary = await repository.getSummary();

		expect(summary.manualSlots).toHaveLength(2);
		expect(summary.manualSlots.map((slot) => slot.name).sort()).toEqual([
			'Campus Run',
			'Harbor Run'
		]);
	});

	test('clones records and summaries across repository boundaries', async () => {
		expect.assertions(4);
		const game = createGame({ day: 4 });
		const repository = new SaveRepositoryFromDriver(
			new MemorySaveStoreDriver(),
			() => new Date('2026-05-05T12:00:00.000Z')
		);

		const created = await repository.createManualSlot('Harbor Run', game);
		game.day = 99;

		const firstLoad = await repository.loadManualSlot(created.id);
		const firstSummary = await repository.getSummary();
		expect(firstLoad?.game.day).toBe(4);

		firstLoad!.game.day = 88;
		firstLoad!.metadata.name = 'Mutated Load';
		firstSummary.manualSlots[0]!.name = 'Mutated Summary';

		const secondLoad = await repository.loadManualSlot(created.id);
		const secondSummary = await repository.getSummary();

		expect(secondLoad?.game.day).toBe(4);
		expect(secondLoad?.metadata.name).toBe('Harbor Run');
		expect(secondSummary.manualSlots[0]?.name).toBe('Harbor Run');
	});
});
