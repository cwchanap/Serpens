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
import {
	STARTER_STORE_CAP,
	createInitialWorldProgress,
	getWorldCityDefinition
} from '$lib/game/world';
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
	createManualSlotId,
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

function createV4Record(overrides: SaveRecordOverrides = {}): SaveRecord {
	return {
		...createManualSaveRecord(overrides),
		schemaVersion: 4 as unknown as typeof SAVE_SCHEMA_VERSION
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

	test('relocated stores never overlap a valid store footprint after city regeneration', () => {
		expect.assertions(3);
		// Regenerate the same 56x48 harbor-city the codec produces (seed comes
		// from game.seed for harbor-city). Anchor A=(1,1) and adjacent anchor
		// B=(2,1) are both buildable, and their 2x2 footprints share tiles
		// (2,1) and (2,2). A valid store sits at A; an invalid store whose
		// saved origin is B (with a non-buildable stale tileId) must NOT be
		// relocated onto B, because B's footprint overlaps A's. The codec must
		// reserve A's full footprint in pass 1 and reject B's anchor in pass 2.
		const referenceCity = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		const anchorA = referenceCity.tiles.find((tile) => tile.id === 'harbor-city-1-1')!;
		const anchorB = referenceCity.tiles.find((tile) => tile.id === 'harbor-city-2-1')!;
		expect(isTileBuildable(anchorA)).toBe(true);
		expect(isTileBuildable(anchorB)).toBe(true);

		const baseStore = createGame().stores[0]!;
		const validStore = {
			...baseStore,
			id: 'store-valid',
			cityId: 'harbor-city',
			tileId: anchorA.id,
			mapX: anchorA.x,
			mapY: anchorA.y
		};
		// Invalid store: stale non-buildable tileId forces the closest-tile
		// fallback; origin sits exactly on B so B is the distance-0 candidate.
		const invalidStore = {
			...baseStore,
			id: 'store-invalid',
			cityId: 'harbor-city',
			tileId: 'harbor-city-28-8',
			mapX: anchorB.x,
			mapY: anchorB.y
		};

		const record = createManualSaveRecord({
			game: {
				seed: 20260505,
				cities: [{ id: 'harbor-city', name: 'Harbor City', width: 28, height: 24, tiles: [] }],
				stores: [validStore, invalidStore]
			}
		});

		const validated = validateSaveRecord(record);
		const city = validated.game.cities[0]!;
		const tileById = new Map(city.tiles.map((tile) => [tile.id, tile] as const));
		// Collect each store's full 2x2 footprint tile ids and assert no two
		// stores in this city share a footprint tile.
		const footprintIdsByStore = validated.game.stores
			.filter((store) => store.cityId === city.id)
			.map((store) => {
				const ax = tileById.get(store.tileId)?.x ?? store.mapX;
				const ay = tileById.get(store.tileId)?.y ?? store.mapY;
				const ids = new Set<string>();
				for (let dy = 0; dy < 2; dy += 1) {
					for (let dx = 0; dx < 2; dx += 1) {
						const t = city.tiles.find((tile) => tile.x === ax + dx && tile.y === ay + dy);
						if (t) {
							ids.add(t.id);
						}
					}
				}
				return { id: store.id, ids };
			});

		for (let i = 0; i < footprintIdsByStore.length; i += 1) {
			for (let j = i + 1; j < footprintIdsByStore.length; j += 1) {
				const a = footprintIdsByStore[i]!;
				const b = footprintIdsByStore[j]!;
				const shared = [...a.ids].filter((id) => b.ids.has(id));
				expect(shared).toEqual([]);
			}
		}
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

		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		validateSaveRecord(record);

		expect(spy).toHaveBeenCalledWith(expect.stringContaining('inferWorldProgress'));
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

	test('rejects saves whose cities field is not an array without regenerating', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: { cities: undefined } as unknown as Partial<GameState>
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('Saved game cities must be an array');
	});

	test('leaves non-object and non-string-id city entries untouched during normalization', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				cities: [
					null as unknown as GameState['cities'][number],
					{ id: 123, name: 'Bad', width: 28, height: 24, tiles: [] }
				]
			} as unknown as Partial<GameState>
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('must be an object');
	});

	test('regenerates a non-harbor 28x24 retail city using its definition seed', () => {
		expect.assertions(4);
		const definition = getWorldCityDefinition('campus-junction')!;
		expect(definition.kind).toBe('retail');
		// Use a seed that differs from the definition seed so we can assert the
		// definition seed (not game.seed) was used for non-harbor retail cities.
		const record = createManualSaveRecord({
			game: {
				seed: 999,
				activeCityId: 'campus-junction',
				cities: [
					{
						id: 'campus-junction',
						name: 'Campus Junction',
						width: 28,
						height: 24,
						tiles: []
					}
				],
				stores: []
			} as unknown as Partial<GameState>
		});

		const validated = validateSaveRecord(record);
		const city = validated.game.cities[0]!;
		const reference = generateCity({
			id: definition.id,
			name: 'Campus Junction',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: definition.seed
		});

		expect(city.width).toBe(DEFAULT_RETAIL_CITY_WIDTH);
		expect(city.height).toBe(DEFAULT_RETAIL_CITY_HEIGHT);
		expect(city.tiles).toEqual(reference.tiles);
	});

	test('uses the definition name when a migrated 28x24 city has a non-string name', () => {
		expect.assertions(1);
		const record = createManualSaveRecord({
			game: {
				cities: [
					{
						id: 'harbor-city',
						name: 123 as unknown as string,
						width: 28,
						height: 24,
						tiles: []
					}
				],
				stores: []
			} as unknown as Partial<GameState>
		});

		const validated = validateSaveRecord(record);
		expect(validated.game.cities[0]!.name).toBe('Harbor City');
	});

	test('relocates a store whose tileId is buildable but whose coordinates are stale', () => {
		expect.assertions(4);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		// A default-size city is not regenerated, so the store is only relocated
		// because its saved mapX/mapY disagree with the tile it names.
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		const tile = city.tiles.find((t) => isTileBuildable(t))!;
		const record = createManualSaveRecord({
			game: {
				cities: [city],
				stores: [
					{
						...createGame().stores[0]!,
						cityId: 'harbor-city',
						tileId: tile.id,
						mapX: tile.x + 5,
						mapY: tile.y + 5,
						location: 'Stale (5, 5)',
						localDemand: 1
					}
				]
			} as unknown as Partial<GameState>
		});

		const validated = validateSaveRecord(record);
		const store = validated.game.stores[0]!;

		expect(store.tileId).toBe(tile.id);
		expect(store.mapX).toBe(tile.x);
		expect(store.mapY).toBe(tile.y);
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('relocated store "store-1"'));
	});

	test('does not double-assign a tile reserved by an earlier valid store', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		const tile = city.tiles.find((t) => isTileBuildable(t))!;
		const baseStore = createGame().stores[0]!;
		const record = createManualSaveRecord({
			game: {
				cities: [city],
				stores: [
					{
						...baseStore,
						id: 'store-a',
						cityId: 'harbor-city',
						tileId: tile.id,
						mapX: tile.x,
						mapY: tile.y
					},
					{
						...baseStore,
						id: 'store-b',
						cityId: 'harbor-city',
						tileId: tile.id,
						mapX: tile.x,
						mapY: tile.y
					}
				]
			} as unknown as Partial<GameState>
		});

		const validated = validateSaveRecord(record);
		const storeA = validated.game.stores.find((s) => s.id === 'store-a')!;
		const storeB = validated.game.stores.find((s) => s.id === 'store-b')!;

		expect(storeA.tileId).toBe(tile.id);
		expect(storeB.tileId).not.toBe(tile.id);
	});

	test('leaves a store untouched when its saved cityId is not in the city list', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		const tile = city.tiles.find((t) => isTileBuildable(t))!;
		const record = createManualSaveRecord({
			game: {
				cities: [city],
				stores: [
					{
						...createGame().stores[0]!,
						cityId: 'ghost-city',
						tileId: tile.id,
						mapX: tile.x,
						mapY: tile.y
					}
				]
			} as unknown as Partial<GameState>
		});

		const validated = validateSaveRecord(record);
		const store = validated.game.stores[0]!;

		expect(store.cityId).toBe('ghost-city');
		expect(store.tileId).toBe(tile.id);
	});

	test('leaves a store untouched when its cityId is not a string', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				stores: [
					{
						...createGame().stores[0]!,
						cityId: 123 as unknown as string,
						tileId: 'harbor-city-1-1'
					}
				]
			} as unknown as Partial<GameState>
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game stores[0] cityId must be a non-empty string'
		);
	});

	test('warns with an unknown store id and non-string tileId when no buildable tile remains', () => {
		expect.assertions(3);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
				stores: [
					{
						...createGame().stores[0]!,
						id: undefined as unknown as string,
						cityId: 'harbor-city',
						tileId: undefined as unknown as string,
						mapX: undefined as unknown as number,
						mapY: undefined as unknown as number
					}
				]
			} as unknown as Partial<GameState>
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('store "<unknown>" in city "harbor-city" has no buildable tile')
		);
		expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('saved tileId "?"'));
	});

	test('relocates a store with an unknown id and non-string tileId to the closest buildable tile', () => {
		expect.assertions(2);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		const record = createManualSaveRecord({
			game: {
				cities: [city],
				stores: [
					{
						...createGame().stores[0]!,
						id: undefined as unknown as string,
						cityId: 'harbor-city',
						tileId: undefined as unknown as string,
						// Non-number coords force the closest-tile search to use its
						// (1, 1) default origin and exercise the '?' fallbacks in the
						// relocation warning for every stale coordinate field.
						mapX: undefined as unknown as number,
						mapY: undefined as unknown as number
					}
				]
			} as unknown as Partial<GameState>
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('relocated store "<unknown>" in city "harbor-city" from tile "?"')
		);
	});

	test('createSaveRecord uses "No active city" when the active city is missing', () => {
		expect.assertions(1);
		const game = createGame({ activeCityId: 'nonexistent-city' });
		const record = createSaveRecord(game, {
			id: 'manual-test',
			name: 'Test',
			kind: 'manual',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});

		expect(record.metadata.activeCityName).toBe('No active city');
	});

	test('createManualSlotId falls back to "slot" when the name produces an empty slug', () => {
		expect.assertions(1);
		const id = createManualSlotId('!!!', new Date('2026-05-05T12:00:00.000Z'));

		expect(id).toContain('slot');
	});

	test('migrateSaveRecord returns non-object values untouched before validating', () => {
		expect.assertions(2);

		expect(() => validateSaveRecord('not-an-object')).toThrow(SaveDataError);
		// The specific message proves migration left the non-object untouched: a
		// mutated value would surface a different validation error.
		expect(() => validateSaveRecord('not-an-object')).toThrow('Save record must be an object');
	});

	test('v4 migration leaves a non-object store untouched then fails validation', () => {
		expect.assertions(2);
		const record = createV4Record({
			game: {
				stores: ['not-a-store' as unknown as GameState['stores'][number]]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		// Asserting the store-level (not product-level) "must be an object" message
		// proves migration did not wrap or coerce the non-object store entry.
		expect(() => validateSaveRecord(record)).toThrow('Saved game stores[0] must be an object');
	});

	test('v4 migration leaves a non-object boutique product untouched then fails validation', () => {
		expect.assertions(2);
		const baseStore = createGame().stores[0]!;
		const record = createV4Record({
			game: {
				stores: [
					{
						...baseStore,
						archetypeId: 'boutique',
						products: [
							'not-a-product' as unknown as GameState['stores'][number]['products'][number]
						]
					}
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		// The product-level "must be an object" message proves migration left the
		// non-object product entry intact rather than dropping or wrapping it.
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game stores[0] products[0] must be an object'
		);
	});

	test('v4 migration renames a legacy boutique accessories category to fashion-accessories', () => {
		expect.assertions(2);
		const baseStore = createGame().stores[0]!;
		const record = createV4Record({
			game: {
				stores: [
					{
						...baseStore,
						archetypeId: 'boutique',
						products: [{ ...baseStore.products[0]!, categoryId: 'accessories' }]
					}
				]
			}
		});

		const validated = validateSaveRecord(record);
		expect(validated.game.stores[0]?.products[0]?.categoryId).toBe('fashion-accessories');
		expect(validated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
	});

	test('v4 migration is a no-op for a boutique store with no legacy category names', () => {
		expect.assertions(1);
		const record = createV4Record({
			game: { stores: [{ ...createGame().stores[0]!, archetypeId: 'boutique' }] }
		});

		expect(() => validateSaveRecord(record)).not.toThrow();
	});

	test('v4 migration leaves a non-object game untouched then fails validation', () => {
		expect.assertions(2);
		const record: SaveRecord = {
			...createManualSaveRecord(),
			schemaVersion: 4 as unknown as typeof SAVE_SCHEMA_VERSION,
			game: null as unknown as GameState
		};

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		// The "Saved game must be an object" message proves migration returned the
		// null game verbatim instead of substituting a default object.
		expect(() => validateSaveRecord(record)).toThrow('Saved game must be an object');
	});

	test('v4 migration leaves a non-array stores field untouched then fails validation', () => {
		expect.assertions(2);
		const record: SaveRecord = {
			...createManualSaveRecord(),
			schemaVersion: 4 as unknown as typeof SAVE_SCHEMA_VERSION,
			game: {
				...createGame(),
				stores: 'not-an-array' as unknown as GameState['stores']
			}
		};

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		// The stores-level array message proves migration short-circuited on the
		// non-array field and forwarded it to validation unchanged.
		expect(() => validateSaveRecord(record)).toThrow('Saved game stores must be an array');
	});

	test('v4 snapshot migration leaves a non-object autoSave untouched then fails validation', () => {
		expect.assertions(2);
		const snapshot = {
			schemaVersion: 4,
			autoSave: 'not-an-object',
			manualSlots: []
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		// The record-level "must be an object" message proves the snapshot migration
		// forwarded the non-object autoSave to validateSaveRecord unmodified.
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow('Save record must be an object');
	});

	test('v4 snapshot migration skips mapping when manualSlots is not an array', () => {
		expect.assertions(2);
		const snapshot = {
			schemaVersion: 4,
			autoSave: null,
			manualSlots: 'not-an-array'
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		// The manualSlots array message proves the migration skipped .map() and let
		// validation reject the non-array field directly.
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow('manualSlots must be an array');
	});

	test('normalizeSavedStoreLevel defaults to level 1 when products is not an array', () => {
		expect.assertions(1);
		const baseStore = createGame().stores[0]!;
		const storeWithoutLevel = { ...baseStore } as Record<string, unknown>;
		delete storeWithoutLevel.level;
		const record = createManualSaveRecord({
			game: {
				stores: [
					{
						...(storeWithoutLevel as unknown as GameState['stores'][number]),
						products: 'not-an-array' as unknown as GameState['stores'][number]['products']
					}
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('normalizeSavedStoreLevel falls back to level 1 for an unknown product count', () => {
		expect.assertions(1);
		const baseStore = createGame().stores[0]!;
		const storeWithoutLevel = { ...baseStore } as Record<string, unknown>;
		delete storeWithoutLevel.level;
		const record = createManualSaveRecord({
			game: {
				stores: [
					{
						...(storeWithoutLevel as unknown as GameState['stores'][number]),
						products: []
					}
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('normalizeSavedStoreLevel keeps a non-number staffCapacity untouched', () => {
		expect.assertions(1);
		const baseStore = createGame().stores[0]!;
		const storeWithoutLevel = { ...baseStore } as Record<string, unknown>;
		delete storeWithoutLevel.level;
		const record = createManualSaveRecord({
			game: {
				stores: [
					{
						...(storeWithoutLevel as unknown as GameState['stores'][number]),
						staffCapacity: 'not-a-number' as unknown as number
					}
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('normalizeSavedStoreLevel infers level 1 for an otherwise-valid store missing the level field', () => {
		// The three cases above only prove validation rejects the intentionally
		// invalid sibling field; they never observe the inferred level. This case
		// round-trips a valid boutique store (1 starting product) with `level`
		// removed through validateSaveRecord so the normalization result — level
		// 1 derived from the single-product count — is observable on the output.
		expect.assertions(1);
		const baseStore = createGame().stores[0]!;
		const storeWithoutLevel = { ...baseStore } as Record<string, unknown>;
		delete storeWithoutLevel.level;
		const record = createManualSaveRecord({
			game: {
				stores: [storeWithoutLevel as unknown as GameState['stores'][number]]
			}
		});

		const validated = validateSaveRecord(record);
		expect(validated.game.stores[0]?.level).toBe(1);
	});

	test('normalizeSavedGame infers store cap with a non-array stores field in a legacy save', () => {
		expect.assertions(1);
		const legacyGame = createGame() as Partial<GameState>;
		delete legacyGame.storeCap;
		delete legacyGame.world;
		legacyGame.stores = 'not-an-array' as unknown as GameState['stores'];
		const record = createSaveRecord(legacyGame as GameState, {
			id: 'manual-legacy-stores',
			name: 'Legacy Stores',
			kind: 'manual',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('normalizeSavedGame leaves a non-array industrialBuildings field untouched', () => {
		expect.assertions(1);
		const record = createManualSaveRecord({
			game: {
				industrialBuildings: 'not-an-array' as unknown as GameState['industrialBuildings']
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('inferWorldProgress handles a non-array industryCities field in a legacy save', () => {
		expect.assertions(1);
		const legacyGame = createGame() as Partial<GameState>;
		delete legacyGame.world;
		legacyGame.industryCities = 'not-an-array' as unknown as GameState['industryCities'];
		const record = createSaveRecord(legacyGame as GameState, {
			id: 'manual-legacy-industry',
			name: 'Legacy Industry',
			kind: 'manual',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});
});
