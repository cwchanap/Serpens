import { describe, expect, test, vi } from 'vitest';
import {
	computeStoreLocalDemand,
	DEFAULT_RETAIL_CITY_HEIGHT,
	DEFAULT_RETAIL_CITY_WIDTH,
	generateCity,
	isTileBuildable
} from '$lib/game/city';
import { formatLocation } from '$lib/game/placement';
import { initializeStoreProducts } from '$lib/game/stock';
import { STARTER_STORE_CAP, createInitialWorldProgress } from '$lib/game/world';
import type {
	DailyMaterialMovement,
	DailyProductionReport,
	DailyReport,
	GameState,
	MaterialId
} from '$lib/game/types';
import {
	AUTO_SAVE_SLOT_ID,
	SAVE_SCHEMA_VERSION,
	type SaveRecord,
	type SaveSlotKind,
	type SaveStoreSnapshot
} from './saveTypes';
import {
	SaveDataError,
	cloneSaveStoreSnapshot,
	createSaveRecord,
	createSaveSummary,
	parseSaveStoreSnapshot,
	validateSaveRecord,
	validateSaveStoreSnapshot
} from './saveCodec';

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
		world: createInitialWorldProgress(),
		storeCap: STARTER_STORE_CAP,
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
		industryCities: [
			{
				id: 'industry-city',
				name: 'Industry City',
				width: 1,
				height: 1,
				tiles: []
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
		stores: [
			{
				id: 'store-1',
				level: 1,
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
				products: initializeStoreProducts('boutique'),
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

function createManualSaveRecord(overrides: SaveRecordOverrides = {}): SaveRecord {
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

function createSnapshotWithGame(game: Partial<GameState>): SaveStoreSnapshot {
	const record = createSaveRecord(createGame(), {
		id: 'manual-test-run',
		name: 'Test Run',
		kind: 'manual',
		updatedAt: new Date('2026-05-05T12:00:00.000Z')
	});

	return {
		schemaVersion: SAVE_SCHEMA_VERSION,
		autoSave: null,
		manualSlots: [{ ...record, game: game as GameState }]
	};
}

function createDailyProductionReport(
	overrides: Partial<DailyProductionReport> = {}
): DailyProductionReport {
	return {
		produced: [],
		consumed: [],
		importedInputs: [],
		warehousePulls: [],
		shopImports: [],
		importSpend: 0,
		operatingCost: 0,
		overflowUnits: 0,
		overflowCost: 0,
		warehouseCapacity: 0,
		warehouseUsed: 0,
		...overrides
	};
}

function createDailyReport(overrides: Partial<DailyReport> = {}): DailyReport {
	return {
		day: 3,
		revenue: 1000,
		costOfGoods: 350,
		grossMargin: 650,
		operatingCosts: 250,
		payrollCost: 0,
		importSpend: 0,
		netIncome: 400,
		cashAfter: 12900,
		scorecard: {
			profit: 55,
			customerSatisfaction: 60,
			staffMorale: 65,
			marketPosition: 50
		},
		productionReport: createDailyProductionReport(),
		storeReports: [],
		warnings: ['Healthy day'],
		...overrides
	};
}

describe('saveCodec', () => {
	test('parseSaveStoreSnapshot re-throws SaveDataError from validation unchanged', () => {
		expect.assertions(2);
		const invalid = JSON.stringify({ schemaVersion: 99, autoSave: null, manualSlots: [] });

		expect(() => parseSaveStoreSnapshot(invalid)).toThrow(SaveDataError);
		expect(() => parseSaveStoreSnapshot(invalid)).toThrow('Unsupported save schema version: 99');
	});

	test('parseSaveStoreSnapshot wraps non-JSON input as SaveDataError', () => {
		expect.assertions(2);

		expect(() => parseSaveStoreSnapshot('{not json')).toThrow(SaveDataError);
		expect(() => parseSaveStoreSnapshot('{not json')).toThrow('Save data is not valid JSON');
	});

	test('validateSaveRecord rejects unsupported schema versions', () => {
		expect.assertions(2);
		const record = { ...createManualSaveRecord(), schemaVersion: 99 };

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('Unsupported save schema version: 99');
	});

	test('validateSaveRecord rejects unsupported save slot kinds', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			metadata: { kind: 'other' as SaveSlotKind }
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('Unsupported save slot kind: other');
	});

	test('validateSaveStoreSnapshot rejects an auto-save with a non-auto kind', () => {
		expect.assertions(2);
		const autoSave = createSaveRecord(createGame(), {
			id: AUTO_SAVE_SLOT_ID,
			name: 'Auto-save',
			kind: 'manual',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});
		const snapshot: SaveStoreSnapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave,
			manualSlots: []
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Auto-save must have auto metadata kind: autosave'
		);
	});

	test('validateSaveStoreSnapshot rejects an auto-save without the reserved slot id', () => {
		expect.assertions(2);
		const autoSave = createSaveRecord(createGame(), {
			id: 'wrong-id',
			name: 'Auto-save',
			kind: 'auto',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});
		const snapshot: SaveStoreSnapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave,
			manualSlots: []
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Auto-save must use slot id: autosave'
		);
	});

	test('rejects non-object store, building, and staff entries during validation', () => {
		expect.assertions(2);
		const game = createGame({
			stores: [null as unknown as GameState['stores'][number]],
			industrialBuildings: [null as unknown as GameState['industrialBuildings'][number]],
			staff: [null as unknown as GameState['staff'][number]]
		});
		const record = createManualSaveRecord({ game });

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game industrialBuildings[0] must be an object'
		);
	});

	test('rejects a legacy save whose store count exceeds the inferred store cap', () => {
		expect.assertions(2);
		const legacyGame = createGame() as Partial<GameState>;
		delete legacyGame.world;
		delete legacyGame.storeCap;
		legacyGame.stores = [{}, {}, {}, {}] as unknown as GameState['stores'];
		const record = createSaveRecord(legacyGame as GameState, {
			id: 'manual-legacy-cap',
			name: 'Legacy Cap Save',
			kind: 'manual',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'Legacy save has 4 stores but inferred store cap is 3'
		);
	});

	test('expands saved retail city maps to the current default size', () => {
		expect.assertions(11);
		const record = createManualSaveRecord({
			game: {
				cities: [
					{
						id: 'harbor-city',
						name: 'Harbor City',
						width: 28,
						height: 24,
						tiles: []
					}
				],
				stores: [
					{
						...createGame().stores[0]!,
						tileId: 'harbor-city-28-8',
						mapX: 28,
						mapY: 8,
						location: 'Stale Location (28, 8)',
						localDemand: 1
					}
				]
			}
		});

		const validated = validateSaveRecord(record);
		const city = validated.game.cities[0]!;
		const store = validated.game.stores[0]!;
		const storeTile = city.tiles.find((tile) => tile.id === store.tileId);

		expect(city.width).toBe(DEFAULT_RETAIL_CITY_WIDTH);
		expect(city.height).toBe(DEFAULT_RETAIL_CITY_HEIGHT);
		expect(city.tiles).toHaveLength(DEFAULT_RETAIL_CITY_WIDTH * DEFAULT_RETAIL_CITY_HEIGHT);
		expect(store.tileId).not.toBe('harbor-city-28-8');
		expect(store.mapX).not.toBe(28);
		expect(storeTile).toBeDefined();
		expect(storeTile?.feature).toBeNull();
		// Relocation must refresh tile-derived fields so the store does not
		// carry stale coordinates/demand from the pre-migration tile.
		expect(store.location).toBe(formatLocation(storeTile!));
		expect(store.location).not.toBe('Stale Location (28, 8)');
		expect(store.localDemand).toBe(computeStoreLocalDemand(storeTile!));
		expect(store.localDemand).not.toBe(1);
	});

	test('refreshes tile-derived fields for stores that keep their coordinates across city regeneration', () => {
		expect.assertions(7);
		// harbor-city-13-1 is transit in the old 28x24 city but residential in
		// the regenerated 56x48 city (getNeighborhood is size-dependent). The
		// store stays at the same tile id/coordinates, so the codec's valid
		// branch must still refresh location/localDemand from the new tile —
		// simulateDay reads localDemand, so a stale value skews revenue.
		const oldCity = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 28,
			height: 24,
			seed: 20260505
		});
		const newCity = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		const oldTile = oldCity.tiles.find((tile) => tile.id === 'harbor-city-13-1')!;
		const newTile = newCity.tiles.find((tile) => tile.id === 'harbor-city-13-1')!;
		expect(oldTile.neighborhood).not.toBe(newTile.neighborhood);
		expect(isTileBuildable(newTile)).toBe(true);

		const record = createManualSaveRecord({
			game: {
				cities: [{ id: 'harbor-city', name: 'Harbor City', width: 28, height: 24, tiles: [] }],
				stores: [
					{
						...createGame().stores[0]!,
						cityId: 'harbor-city',
						tileId: 'harbor-city-13-1',
						mapX: 13,
						mapY: 1,
						location: formatLocation(oldTile),
						localDemand: computeStoreLocalDemand(oldTile)
					}
				]
			}
		});

		const validated = validateSaveRecord(record);
		const store = validated.game.stores[0]!;
		// The store is NOT relocated — same tile id/coordinates.
		expect(store.tileId).toBe('harbor-city-13-1');
		expect(store.mapX).toBe(13);
		expect(store.mapY).toBe(1);
		// But tile-derived fields must match the regenerated (residential) tile.
		expect(store.location).toBe(formatLocation(newTile));
		expect(store.localDemand).toBe(computeStoreLocalDemand(newTile));
	});

	test('does not relocate a valid store when an earlier invalid store targets its tile', () => {
		expect.assertions(3);
		// Regenerate the same 56x48 harbor-city the codec produces (seed comes
		// from game.seed for harbor-city) so we can pick a buildable tile that
		// exists in the migrated city deterministically.
		const referenceCity = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		const validTile = referenceCity.tiles.find((tile) => isTileBuildable(tile));
		expect(validTile).toBeDefined();

		const baseStore = createGame().stores[0]!;
		// Invalid store is intentionally FIRST in the array. Its stale tileId
		// ('harbor-city-28-8' is non-buildable post-migration) forces the
		// fallback closest-tile search, whose origin sits exactly on the valid
		// store's tile. Under the old single-pass this would steal that tile.
		const invalidStore = {
			...baseStore,
			id: 'store-invalid',
			cityId: 'harbor-city',
			tileId: 'harbor-city-28-8',
			mapX: validTile!.x,
			mapY: validTile!.y
		};
		const validStore = {
			...baseStore,
			id: 'store-valid',
			cityId: 'harbor-city',
			tileId: validTile!.id,
			mapX: validTile!.x,
			mapY: validTile!.y
		};

		const record = createManualSaveRecord({
			game: {
				cities: [{ id: 'harbor-city', name: 'Harbor City', width: 28, height: 24, tiles: [] }],
				stores: [invalidStore, validStore]
			}
		});

		const validated = validateSaveRecord(record);
		const resultValid = validated.game.stores.find((store) => store.id === 'store-valid')!;
		const resultInvalid = validated.game.stores.find((store) => store.id === 'store-invalid')!;

		expect(resultValid.tileId).toBe(validTile!.id);
		expect(resultInvalid.tileId).not.toBe(validTile!.id);
	});

	test('leaves a store on its stale tile and warns when no buildable tile remains', () => {
		expect.assertions(3);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		// A 2x2 city whose only tile is locked — no buildable tile exists, so
		// findSavedStoreTile returns null and the store is left unchanged.
		const lockedTile = {
			id: 'harbor-city-0-0',
			cityId: 'harbor-city',
			x: 0,
			y: 0,
			neighborhood: 'downtown' as const,
			terrain: 'commercial' as const,
			feature: null,
			demand: 50,
			rent: 1000,
			footTraffic: 50,
			customerFit: 50,
			locked: true
		};
		const baseStore = createGame().stores[0]!;
		const staleStore = {
			...baseStore,
			id: 'store-stale',
			cityId: 'harbor-city',
			tileId: 'harbor-city-0-0',
			mapX: 0,
			mapY: 0
		};

		const record = createManualSaveRecord({
			game: {
				cities: [
					{
						id: 'harbor-city',
						name: 'Harbor City',
						width: 2,
						height: 2,
						tiles: [lockedTile]
					}
				],
				stores: [staleStore]
			}
		});

		const validated = validateSaveRecord(record);
		const store = validated.game.stores[0]!;

		expect(store.tileId).toBe('harbor-city-0-0');
		expect(store.mapX).toBe(0);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('store "store-stale" in city "harbor-city" has no buildable tile')
		);
		warnSpy.mockRestore();
	});

	test('inferWorldProgress warns about unknown saved city ids', () => {
		expect.assertions(1);
		const legacyGame = createGame({
			cities: [
				{
					id: 'harbor-city',
					name: 'Harbor City',
					width: 1,
					height: 1,
					tiles: []
				},
				{
					id: 'not-a-real-city',
					name: 'Unknown',
					width: 1,
					height: 1,
					tiles: []
				}
			]
		}) as Partial<GameState>;
		delete legacyGame.world;
		const record = createSaveRecord(legacyGame as GameState, {
			id: 'manual-unknown-city',
			name: 'Unknown City Save',
			kind: 'manual',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});

		const spy = vi.spyOn(console, 'warn');
		validateSaveRecord(record);

		expect(spy).toHaveBeenCalledWith(expect.stringContaining('inferWorldProgress'));
		spy.mockRestore();
	});

	test('validates production reports with populated material movement arrays', () => {
		expect.assertions(1);
		const movement = (
			materialId: DailyMaterialMovement['materialId'],
			source: DailyMaterialMovement['source']
		): DailyMaterialMovement => ({
			materialId,
			quantity: 5,
			value: 10,
			source
		});
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				consumed: [movement('grain', 'local')],
				importedInputs: [movement('water', 'import')],
				warehousePulls: [movement('snacks', 'warehouse')],
				shopImports: [movement('bottled-water', 'overflow')]
			})
		});
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });

		expect(() => validateSaveStoreSnapshot(snapshot)).not.toThrow();
	});

	test('rejects a city tile whose locked field is not a boolean', () => {
		expect.assertions(2);
		const snapshot = createSnapshotWithGame({
			...createGame(),
			cities: [
				{
					id: 'harbor-city',
					name: 'Harbor City',
					width: 1,
					height: 1,
					tiles: [
						{
							id: 'tile-1',
							cityId: 'harbor-city',
							x: 1,
							y: 1,
							neighborhood: 'downtown',
							terrain: 'commercial',
							feature: null,
							demand: 72,
							rent: 180,
							footTraffic: 66,
							customerFit: 70,
							locked: 1 as unknown as boolean
						}
					]
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game cities[0] tiles[0] locked must be a boolean'
		);
	});

	test('cloneSaveStoreSnapshot deep-clones a valid snapshot', () => {
		expect.assertions(3);
		const snapshot = createSnapshotWithGame(createGame());
		const cloned = cloneSaveStoreSnapshot(snapshot);

		expect(cloned).toEqual(snapshot);
		expect(cloned).not.toBe(snapshot);
		expect(cloned.manualSlots[0]).not.toBe(snapshot.manualSlots[0]);
	});

	test('createSaveSummary projects slot metadata from a snapshot', () => {
		expect.assertions(3);
		const autoSave = createSaveRecord(createGame(), {
			id: AUTO_SAVE_SLOT_ID,
			name: 'Auto-save',
			kind: 'auto',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});
		const snapshot: SaveStoreSnapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave,
			manualSlots: [createManualSaveRecord()]
		};

		const summary = createSaveSummary(snapshot);

		expect(summary.autoSave?.id).toBe(AUTO_SAVE_SLOT_ID);
		expect(summary.autoSave).not.toBe(autoSave.metadata);
		expect(summary.manualSlots[0]?.id).toBe('manual-test-run');
	});

	test('validateSaveRecord rejects invalid pricing posture', () => {
		expect.assertions(2);
		const game = createGame({
			policy: { ...createGame().policy, pricing: 'invalid' as never }
		});
		const record = createManualSaveRecord({ game });

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('must be one of:');
	});

	test('validateSaveRecord rejects unknown material id in warehouse', () => {
		expect.assertions(2);
		const game = createGame({
			warehouse: {
				...createGame().warehouse,
				materials: { 'unknown-material': 10 } as Partial<Record<MaterialId, number>>
			}
		});
		const record = createManualSaveRecord({ game });

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('must be a known material');
	});

	test('validateSaveRecord rejects non-finite number in scorecard', () => {
		expect.assertions(2);
		const game = createGame({
			scorecard: { ...createGame().scorecard, profit: NaN }
		});
		const record = createManualSaveRecord({ game });

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('must be a finite number');
	});
});
