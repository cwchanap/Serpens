import { describe, expect, test } from 'vitest';
import type { GameState } from '$lib/game/types';
import { SAVE_SCHEMA_VERSION, type SaveRecord, type SaveStoreSnapshot } from './saveTypes';
import {
	SaveDataError,
	createEmptySaveStore,
	createSaveRecord,
	validateSaveStoreSnapshot
} from './saveCodec';
import {
	BROWSER_SAVE_STORAGE_KEY,
	createBrowserSaveRepository,
	type StorageLike
} from './browserSaveRepository';
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

class SaveDataErrorOnceDriver extends MemorySaveStoreDriver {
	private hasFailed = false;

	override async read(): Promise<SaveStoreSnapshot> {
		if (!this.hasFailed) {
			this.hasFailed = true;
			throw new SaveDataError('Persisted save is obsolete');
		}

		return super.read();
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
		staff: [],
		hiringCandidates: [],
		decisions: [],
		reports: [],
		...overrides
	};
}

type SaveRecordOverrides = Partial<Omit<SaveRecord, 'game' | 'metadata'>> & {
	game?: Partial<GameState>;
	metadata?: Partial<SaveRecord['metadata']>;
};

function createManualSaveRecord(overrides: SaveRecordOverrides = {}) {
	const record = createSaveRecord(createGame(), {
		id: 'manual-test-run',
		name: 'Test Run',
		kind: 'manual',
		updatedAt: new Date('2026-05-05T12:00:00.000Z')
	});

	return {
		...record,
		...overrides,
		metadata: {
			...record.metadata,
			...overrides.metadata
		},
		game: {
			...record.game,
			...overrides.game
		}
	};
}

function createSnapshotWithGame(game: Partial<GameState>) {
	return {
		schemaVersion: SAVE_SCHEMA_VERSION,
		autoSave: null,
		manualSlots: [
			createManualSaveRecord({
				game
			})
		]
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
			autoSave: null,
			manualSlots: [{ ...record, game: gameWithoutPolicy }]
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game policy must be an object'
		);
	});

	test('rejects saved games missing staff arrays', () => {
		expect.assertions(2);
		const game = createGame();
		const gameWithoutStaff: Partial<GameState> = { ...game };
		delete gameWithoutStaff.staff;
		const record = createSaveRecord(game, {
			id: 'manual-test-run',
			name: 'Test Run',
			kind: 'manual',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});
		const snapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave: null,
			manualSlots: [{ ...record, game: gameWithoutStaff }]
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow('Saved game staff must be an array');
	});

	test('rejects saved games with invalid policy enum values', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				...createGame(),
				policy: {
					...createGame().policy,
					pricing: 'surge' as GameState['policy']['pricing']
				}
			}
		});
		const snapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave: null,
			manualSlots: [record]
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game policy pricing must be one of: discount, competitive, standard, premium'
		);
	});

	test('rejects saved games with invalid store shapes', () => {
		expect.assertions(2);
		const game = createGame();
		const [store] = game.stores;
		const record = createManualSaveRecord({
			game: {
				...game,
				stores: [
					{ ...store, archetypeId: 'bookstore' as GameState['stores'][number]['archetypeId'] }
				]
			}
		});
		const snapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave: null,
			manualSlots: [record]
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game stores[0] archetypeId must be one of: convenience, boutique, electronics, grocery'
		);
	});

	test('rejects saved staff with invalid role values', () => {
		expect.assertions(2);
		const snapshot = createSnapshotWithGame({
			...createGame(),
			staff: [
				{
					id: 'staff-1',
					name: 'Avery Chen',
					role: 'supervisor' as GameState['staff'][number]['role'],
					monthlySalary: 3200,
					skill: 65,
					morale: 70,
					assignedStoreId: 'store-1',
					hiredOnDay: 1
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game staff[0] role must be one of: manager, general'
		);
	});

	test('rejects saved hiring candidates with invalid salaries', () => {
		expect.assertions(2);
		const snapshot = createSnapshotWithGame({
			...createGame(),
			hiringCandidates: [
				{
					id: 'candidate-1',
					name: 'Blake Patel',
					role: 'general',
					monthlySalary: Number.NaN,
					skill: 62,
					morale: 68
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game hiringCandidates[0] monthlySalary must be a finite number'
		);
	});

	test('rejects duplicate persisted manual slot ids', () => {
		expect.assertions(2);
		const first = createManualSaveRecord({
			metadata: {
				id: 'manual-duplicate',
				name: 'First'
			}
		});
		const second = createManualSaveRecord({
			metadata: {
				id: 'manual-duplicate',
				name: 'Second'
			}
		});
		const snapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave: null,
			manualSlots: [first, second]
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Manual save slot ids must be unique: manual-duplicate'
		);
	});

	test('rejects manual slots with non-manual metadata kind', () => {
		expect.assertions(2);
		const slot = createManualSaveRecord({
			metadata: {
				id: 'manual-wrong-kind',
				kind: 'auto'
			}
		});
		const snapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave: null,
			manualSlots: [slot]
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Manual save slot must have manual metadata kind: manual-wrong-kind'
		);
	});

	test('rejects saved city tiles with invalid shapes', () => {
		expect.assertions(2);
		const game = createGame();
		const snapshot = createSnapshotWithGame({
			...game,
			cities: [
				{
					...game.cities[0]!,
					tiles: [
						{
							id: 'tile-1',
							cityId: 'harbor-city',
							x: 1,
							y: 1,
							neighborhood:
								'moonbase' as GameState['cities'][number]['tiles'][number]['neighborhood'],
							terrain: 'commercial',
							feature: null,
							demand: 72,
							rent: 180,
							footTraffic: 66,
							customerFit: 70,
							locked: false
						}
					]
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game cities[0] tiles[0] neighborhood must be one of: downtown, campus, residential, mall, transit, industrial, suburb, parkEdge'
		);
	});

	test('accepts saved city tiles without feature for old-save compatibility', () => {
		expect.assertions(1);
		const game = createGame();
		const snapshot = createSnapshotWithGame({
			...game,
			cities: [
				{
					...game.cities[0]!,
					tiles: [
						{
							id: 'tile-1',
							cityId: 'harbor-city',
							x: 1,
							y: 1,
							neighborhood: 'downtown',
							terrain: 'commercial',
							demand: 72,
							rent: 180,
							footTraffic: 66,
							customerFit: 70,
							locked: false
						} as unknown as GameState['cities'][number]['tiles'][number]
					]
				}
			]
		});

		expect(
			validateSaveStoreSnapshot(snapshot).manualSlots[0]?.game.cities[0]?.tiles[0]?.feature
		).toBeNull();
	});

	test('rejects saved city tiles with invalid feature values', () => {
		expect.assertions(2);
		const game = createGame();
		const snapshot = createSnapshotWithGame({
			...game,
			cities: [
				{
					...game.cities[0]!,
					tiles: [
						{
							id: 'tile-1',
							cityId: 'harbor-city',
							x: 1,
							y: 1,
							neighborhood: 'downtown',
							terrain: 'commercial',
							feature: 'rail' as GameState['cities'][number]['tiles'][number]['feature'],
							demand: 72,
							rent: 180,
							footTraffic: 66,
							customerFit: 70,
							locked: false
						}
					]
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game cities[0] tiles[0] feature must be null, road, or river'
		);
	});

	test('rejects saved decision options with invalid effect shapes', () => {
		expect.assertions(2);
		const snapshot = createSnapshotWithGame({
			...createGame(),
			decisions: [
				{
					id: 'decision-1',
					title: 'Staffing choice',
					context: 'A manager asks for overtime.',
					expiresOnDay: 4,
					options: [
						{
							id: 'option-1',
							label: 'Approve',
							description: 'Cover the shift.',
							effects: {
								cash: 'expensive' as unknown as number
							}
						}
					]
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game decisions[0] options[0] effects cash must be a finite number'
		);
	});

	test('rejects saved reports with invalid warning arrays', () => {
		expect.assertions(2);
		const snapshot = createSnapshotWithGame({
			...createGame(),
			reports: [
				{
					day: 3,
					revenue: 1000,
					costOfGoods: 350,
					grossMargin: 650,
					operatingCosts: 250,
					payrollCost: 0,
					netIncome: 400,
					cashAfter: 12900,
					scorecard: {
						profit: 55,
						customerSatisfaction: 60,
						staffMorale: 65,
						marketPosition: 50
					},
					storeReports: [
						{
							storeId: 'store-1',
							revenue: 1000,
							costOfGoods: 350,
							grossMargin: 650,
							operatingCosts: 250,
							netIncome: 400,
							customersServed: 42,
							demandMissed: 5,
							staffingCoverage: 100,
							staffingShortage: { manager: 0, general: 0 },
							stockHealth: 70,
							staffMorale: 65,
							reputation: 60,
							marketPosition: 50,
							warnings: ['Low inventory']
						}
					],
					warnings: ['Healthy day', 5 as unknown as string]
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game reports[0] warnings[1] must be a non-empty string'
		);
	});

	test('rejects manual slots using the reserved autosave id', () => {
		expect.assertions(2);
		const slot = createManualSaveRecord({
			metadata: {
				id: 'autosave'
			}
		});
		const snapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave: null,
			manualSlots: [slot]
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Manual save slot id is reserved for auto-save: autosave'
		);
	});

	test('rejects auto and manual slot id collisions', () => {
		expect.assertions(2);
		const autoSave = createSaveRecord(createGame(), {
			id: 'autosave',
			name: 'Auto-save',
			kind: 'auto',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});
		const manualSlot = createManualSaveRecord({
			metadata: {
				id: 'autosave'
			}
		});
		const snapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave,
			manualSlots: [manualSlot]
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Save slot ids must not collide between auto-save and manual slots: autosave'
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

	test('resets invalid browser storage data to an empty save store', async () => {
		expect.assertions(2);
		const storage = new FakeStorage();
		storage.setItem(BROWSER_SAVE_STORAGE_KEY, '');
		const repository = createBrowserSaveRepository(storage);

		const summary = await repository.getSummary();

		expect(summary.autoSave).toBeNull();
		expect(summary.manualSlots).toEqual([]);
	});

	test('throws a clear error when default browser storage is unavailable', () => {
		expect.assertions(2);
		const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

		try {
			Object.defineProperty(globalThis, 'localStorage', {
				configurable: true,
				value: undefined
			});

			expect(() => createBrowserSaveRepository()).toThrow(SaveDataError);
			expect(() => createBrowserSaveRepository()).toThrow('Browser save storage is unavailable');
		} finally {
			if (descriptor) {
				Object.defineProperty(globalThis, 'localStorage', descriptor);
			} else {
				delete (globalThis as Partial<typeof globalThis>).localStorage;
			}
		}
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

	test('resets save data errors during reads and writes a valid autosave afterward', async () => {
		expect.assertions(5);
		const driver = new SaveDataErrorOnceDriver();
		const repository = new SaveRepositoryFromDriver(
			driver,
			() => new Date('2026-05-05T12:00:00.000Z')
		);
		const game = createGame({ day: 9 });

		const metadata = await repository.saveAuto(game);
		const snapshot = await driver.read();

		expect(metadata.kind).toBe('auto');
		expect(metadata.day).toBe(9);
		expect(snapshot.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(snapshot.autoSave?.game.staff).toEqual([]);
		expect(snapshot.autoSave?.game.hiringCandidates).toEqual([]);
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
