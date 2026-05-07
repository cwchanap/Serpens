import { describe, expect, test } from 'vitest';
import type { GameState } from '$lib/game/types';
import {
	createTauriSaveRepositoryFromStore,
	SAVE_STORE_KEY,
	type StoreLike
} from './tauriSaveRepository';
import { SaveDataError } from './saveCodec';

class FakeStore implements StoreLike {
	readonly values = new Map<string, unknown>();
	saveCount = 0;

	async get<T>(key: string): Promise<T | null | undefined> {
		return this.values.get(key) as T | null | undefined;
	}

	async set(key: string, value: unknown): Promise<void> {
		this.values.set(key, value);
	}

	async save(): Promise<void> {
		this.saveCount += 1;
	}
}

function createGame(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 20260505,
		rngState: 99,
		day: 2,
		cash: 11000,
		debt: 1000,
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
		cities: [{ id: 'harbor-city', name: 'Harbor City', width: 1, height: 1, tiles: [] }],
		activeCityId: 'harbor-city',
		stores: [],
		staff: [],
		hiringCandidates: [],
		decisions: [],
		reports: [],
		...overrides
	};
}

describe('Tauri save repository', () => {
	test('persists save snapshot through the Tauri store key', async () => {
		expect.assertions(5);
		const store = new FakeStore();
		const repository = createTauriSaveRepositoryFromStore(
			Promise.resolve(store),
			() => new Date('2026-05-05T12:00:00.000Z')
		);

		await repository.saveAuto(createGame({ day: 6 }));
		const slot = await repository.createManualSlot('Desktop Run', createGame({ day: 7 }));
		const summary = await repository.getSummary();

		expect(store.saveCount).toBe(2);
		expect(store.values.has(SAVE_STORE_KEY)).toBe(true);
		expect(summary.autoSave?.day).toBe(6);
		expect(summary.manualSlots[0]?.id).toBe(slot.id);
		expect((await repository.loadManualSlot(slot.id))?.game.day).toBe(7);
	});

	test('rejects null save data stored under the Tauri store key', async () => {
		expect.assertions(2);
		const store = new FakeStore();
		store.values.set(SAVE_STORE_KEY, null);
		const repository = createTauriSaveRepositoryFromStore(Promise.resolve(store));

		await expect(repository.getSummary()).rejects.toThrow(SaveDataError);
		await expect(repository.getSummary()).rejects.toThrow('Save store must be an object');
	});
});
