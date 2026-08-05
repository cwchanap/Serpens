import { describe, expect, test, vi } from 'vitest';

const { tauriLoadMock } = vi.hoisted(() => ({ tauriLoadMock: vi.fn() }));

vi.mock('@tauri-apps/plugin-store', () => ({ load: tauriLoadMock }));

import { simulateDay } from '$lib/game/simulateDay';
import { initializeCityInventory, initializeRetailSupplyAssignment } from '$lib/game/cityInventory';
import { createFoundingFinanceState } from '$lib/game/finance';
import { createInitialEventRuntime } from '$lib/game/eventSelection';
import { createNewGame } from '$lib/game/state';
import type { GameState } from '$lib/game/types';
import { STARTER_STORE_CAP, WORLD_CITY_CATALOG, createInitialWorldProgress } from '$lib/game/world';
import { createSaveRecord } from './saveCodec';
import { SAVE_SCHEMA_VERSION, type SaveStoreSnapshot } from './saveTypes';
import {
	createTauriSaveRepository,
	createTauriSaveRepositoryFromStore,
	SAVE_STORE_KEY,
	type StoreLike
} from './tauriSaveRepository';

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

function createCanonicalFixtureGame(game: GameState): GameState {
	let canonical: GameState = {
		...game,
		cityInventories: [],
		retailSupplyAssignments: []
	};

	for (const city of WORLD_CITY_CATALOG) {
		if (city.kind === 'industry') {
			canonical = initializeCityInventory(canonical, city.id);
		}
	}
	for (const city of WORLD_CITY_CATALOG) {
		if (city.kind === 'retail') {
			canonical = initializeRetailSupplyAssignment(canonical, city.id);
		}
	}

	return canonical;
}

function createGame(overrides: Partial<GameState> = {}): GameState {
	const day = overrides.day ?? 2;
	const {
		cityInventories: overrideCityInventories,
		retailSupplyAssignments: overrideRetailSupplyAssignments,
		...otherOverrides
	} = overrides;
	const game: GameState = {
		seed: 20260505,
		rngState: 99,
		day,
		cash: 11000,
		finance: overrides.finance ?? createFoundingFinanceState(day, 1000),
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
		world: createInitialWorldProgress(),
		storeCap: STARTER_STORE_CAP,
		cities: [
			{
				id: 'harbor-city',
				name: 'Harbor City',
				width: 1,
				height: 1,
				tiles: [
					{
						id: 'harbor-city-0-0',
						cityId: 'harbor-city',
						x: 0,
						y: 0,
						neighborhood: 'downtown',
						terrain: 'commercial',
						feature: null,
						demand: 50,
						rent: 50,
						footTraffic: 50,
						customerFit: 50,
						locked: false
					}
				]
			}
		],
		activeCityId: 'harbor-city',
		industryCities: [
			{
				id: 'industry-city',
				name: 'Industry City',
				width: 1,
				height: 1,
				tiles: [
					{
						id: 'industry-city-0-0',
						cityId: 'industry-city',
						x: 0,
						y: 0,
						terrain: 'industrial',
						resource: null,
						locked: false
					}
				],
				rails: []
			}
		],
		activeIndustryCityId: 'industry-city',
		industrialBuildings: [],
		cityInventories: [],
		retailSupplyAssignments: [],
		stores: [],
		staff: [],
		hiringCandidates: [],
		events: overrides.events ?? createInitialEventRuntime(20260505),
		decisions: [],
		reports: [],
		...otherOverrides
	};
	const canonical = createCanonicalFixtureGame(game);
	const cityInventories = overrideCityInventories ?? canonical.cityInventories;

	return {
		...game,
		cityInventories,
		retailSupplyAssignments: overrideRetailSupplyAssignments ?? canonical.retailSupplyAssignments
	};
}

function createStaleV13Snapshot(): SaveStoreSnapshot {
	const record = createSaveRecord(createGame(), {
		id: 'manual-stale-city-inventory',
		name: 'Stale City Inventory',
		kind: 'manual',
		updatedAt: new Date('2026-08-02T12:00:00.000Z')
	});
	const staleGame = {
		...record.game,
		cityInventories: [
			{
				cityId: 'industry-city' as const,
				capacity: 99,
				materials: { grain: 4 },
				overflowUnits: 0,
				overflowCost: 0
			}
		]
	};

	return {
		schemaVersion: SAVE_SCHEMA_VERSION,
		autoSave: null,
		manualSlots: [{ ...record, game: staleGame }]
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

	test('normalizes stale v13 city inventories and durably writes the canonical Tauri value', async () => {
		expect.assertions(7);
		const store = new FakeStore();
		store.values.set(SAVE_STORE_KEY, createStaleV13Snapshot());
		const repository = createTauriSaveRepositoryFromStore(
			Promise.resolve(store),
			() => new Date('2026-08-02T12:00:00.000Z')
		);

		const loaded = await repository.loadManualSlot('manual-stale-city-inventory');
		expect(loaded?.game.cityInventories[0]).toMatchObject({
			capacity: 0,
			overflowUnits: 4,
			overflowCost: 8
		});
		expect(loaded?.game).not.toHaveProperty('warehouse');
		expect(store.saveCount).toBe(0);

		await repository.saveAuto(createGame({ day: 4 }));
		const persisted = store.values.get(SAVE_STORE_KEY) as SaveStoreSnapshot;
		const staleSlot = persisted.manualSlots.find(
			(slot) => slot.metadata.id === 'manual-stale-city-inventory'
		);

		expect(persisted.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(staleSlot?.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(staleSlot?.game.cityInventories[0]?.overflowUnits).toBe(4);
		expect(staleSlot?.game).not.toHaveProperty('warehouse');
	});

	test('persists simulated stock and production reports through the Tauri store key', async () => {
		expect.assertions(6);
		const store = new FakeStore();
		const repository = createTauriSaveRepositoryFromStore(
			Promise.resolve(store),
			() => new Date('2026-05-08T12:00:00.000Z')
		);
		const game = simulateDay(createNewGame('convenience', 20260508));

		const slot = await repository.createManualSlot('Stock Run', game);
		const saved = await repository.loadManualSlot(slot.id);
		const report = saved?.game.reports[0];
		const productReport = report?.storeReports[0]?.productReports[0];

		expect(saved?.game.stores[0]?.products.length).toBeGreaterThan(0);
		expect(report?.importSpend).toBeGreaterThanOrEqual(0);
		expect(report?.productionReport.importSpend).toBeGreaterThanOrEqual(0);
		expect(report?.storeReports[0]?.productReports.length).toBeGreaterThan(0);
		expect(productReport?.warehouseUnits).toBeGreaterThanOrEqual(0);
		expect(productReport?.warehouseValue).toBeGreaterThanOrEqual(0);
	});

	test('resets null save data stored under the Tauri store key', async () => {
		expect.assertions(2);
		const store = new FakeStore();
		store.values.set(SAVE_STORE_KEY, null);
		const repository = createTauriSaveRepositoryFromStore(Promise.resolve(store));

		const summary = await repository.getSummary();

		expect(summary.autoSave).toBeNull();
		expect(summary.manualSlots).toEqual([]);
	});

	test('uses the current wall-clock time when createTauriSaveRepositoryFromStore is built without a now clock', async () => {
		expect.assertions(3);
		const before = Date.now();
		const store = new FakeStore();
		const repository = createTauriSaveRepositoryFromStore(Promise.resolve(store));

		const metadata = await repository.saveAuto(createGame({ day: 6 }));
		const after = Date.now();

		expect(metadata.kind).toBe('auto');
		expect(Number(new Date(metadata.updatedAt))).toBeGreaterThanOrEqual(before);
		expect(Number(new Date(metadata.updatedAt))).toBeLessThanOrEqual(after);
	});

	test('uses the current wall-clock time when createTauriSaveRepository is built without a now clock', async () => {
		expect.assertions(3);
		const store = new FakeStore();
		tauriLoadMock.mockResolvedValue(store);

		const before = Date.now();
		const repository = createTauriSaveRepository();
		const metadata = await repository.saveAuto(createGame({ day: 6 }));
		const after = Date.now();

		expect(metadata.kind).toBe('auto');
		expect(Number(new Date(metadata.updatedAt))).toBeGreaterThanOrEqual(before);
		expect(Number(new Date(metadata.updatedAt))).toBeLessThanOrEqual(after);
	});
});
