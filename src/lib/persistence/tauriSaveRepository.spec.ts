import { describe, expect, test, vi } from 'vitest';

const { tauriLoadMock } = vi.hoisted(() => ({ tauriLoadMock: vi.fn() }));

vi.mock('@tauri-apps/plugin-store', () => ({ load: tauriLoadMock }));

import { simulateDay } from '$lib/game/simulateDay';
import { createFoundingFinanceState } from '$lib/game/finance';
import { createInitialEventRuntime } from '$lib/game/eventSelection';
import { createNewGame } from '$lib/game/state';
import type { GameState } from '$lib/game/types';
import { STARTER_STORE_CAP, createInitialWorldProgress } from '$lib/game/world';
import { createSaveRecord } from './saveCodec';
import { type SaveStoreSnapshot } from './saveTypes';
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

function createGame(overrides: Partial<GameState> = {}): GameState {
	const day = overrides.day ?? 2;
	return {
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
		warehouse: {
			capacity: 0,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		},
		stores: [],
		staff: [],
		hiringCandidates: [],
		events: overrides.events ?? createInitialEventRuntime(20260505),
		decisions: [],
		reports: [],
		...overrides
	};
}

function createV11SupplierSnapshot(): SaveStoreSnapshot {
	const game = createGame();
	const current = createSaveRecord(game, {
		id: 'manual-v11',
		name: 'V11 desktop run',
		kind: 'manual',
		updatedAt: new Date('2026-05-05T12:00:00.000Z')
	});
	const legacyGame = structuredClone(game) as unknown as Record<string, unknown>;
	delete legacyGame.events;
	legacyGame.decisions = [
		{
			id: 'supplier-terms',
			title: 'Supplier terms',
			context: { code: 'supplierTerms' },
			expiresOnDay: game.day + 2,
			options: [
				{
					id: 'negotiate-credit',
					label: 'Negotiate credit',
					description: 'Ask for short-term supplier credit.',
					effects: {
						finance: {
							kind: 'borrow',
							purpose: 'supplierCredit',
							amount: 4_000,
							termDays: 28
						},
						profit: -2
					}
				},
				{
					id: 'bulk-discount',
					label: 'Bulk discount',
					description: 'Commit to a larger order.',
					effects: { cash: -2_500, profit: 3, stockHealth: 6 }
				}
			]
		}
	];

	return {
		schemaVersion: 11,
		autoSave: null,
		manualSlots: [{ ...current, schemaVersion: 11, game: legacyGame }]
	} as unknown as SaveStoreSnapshot;
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

	test('loads and durably upgrades an existing v11 Tauri snapshot', async () => {
		const store = new FakeStore();
		store.values.set(SAVE_STORE_KEY, createV11SupplierSnapshot());
		const repository = createTauriSaveRepositoryFromStore(
			Promise.resolve(store),
			() => new Date('2026-05-05T12:00:00.000Z')
		);

		const loaded = await repository.loadManualSlot('manual-v11');
		const supplier = loaded?.game.decisions[0];
		expect(loaded?.schemaVersion).toBe(12);
		expect(supplier).toMatchObject({
			kind: 'event',
			id: 'event-instance-1',
			eventId: 'supplier-terms',
			definitionVersion: 1
		});
		expect(supplier?.kind === 'event' ? supplier.options[1]?.modifiers : null).toEqual([]);
		expect(loaded?.game.events).toMatchObject({
			selectionSchemaVersion: 1,
			nextModifierSequence: 1
		});

		await repository.saveAuto(createGame());
		const persisted = store.values.get(SAVE_STORE_KEY) as SaveStoreSnapshot;
		expect(persisted.schemaVersion).toBe(12);
		expect(persisted.manualSlots[0]?.schemaVersion).toBe(12);
		expect(persisted.manualSlots[0]?.metadata.id).toBe('manual-v11');
		expect(store.saveCount).toBe(1);
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
