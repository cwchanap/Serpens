import { describe, expect, test, vi } from 'vitest';
import {
	computeStoreLocalDemand,
	DEFAULT_RETAIL_CITY_HEIGHT,
	DEFAULT_RETAIL_CITY_WIDTH,
	generateCity,
	isTileBuildable
} from '$lib/game/city';
import { formatLocation } from '$lib/game/placement';
import type { DecisionContext } from '$lib/game/decisionContext';
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
	DailyReportWarning,
	DailyStoreReport,
	GameState,
	IndustryTile,
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
				tiles: [],
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
		stores: [
			{
				id: 'store-1',
				level: 1,
				name: 'Founding Store',
				archetypeId: 'boutique',
				location: { neighborhoodId: 'downtown', x: 1, y: 1 },
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

/** Strips activeCityId so a record can be used as a pre-v8 base. */
function metadataWithoutActiveCityId(
	record: SaveRecord
): Omit<SaveRecord['metadata'], 'activeCityId'> {
	const { activeCityId: _omit, ...rest } = record.metadata;
	void _omit;
	return rest;
}

function createV5Record(overrides: SaveRecordOverrides = {}): SaveRecord {
	return {
		...createManualSaveRecord(overrides),
		schemaVersion: 5 as unknown as typeof SAVE_SCHEMA_VERSION
	};
}

function createV6Record(overrides: SaveRecordOverrides = {}): SaveRecord {
	return {
		...createManualSaveRecord(overrides),
		schemaVersion: 6 as unknown as typeof SAVE_SCHEMA_VERSION
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
		railShipments: [],
		railUsage: {},
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
		warnings: [],
		...overrides
	};
}

function createDailyStoreReport(overrides: Partial<DailyStoreReport> = {}): DailyStoreReport {
	return {
		storeId: 'store-1',
		revenue: 1000,
		costOfGoods: 350,
		grossMargin: 650,
		operatingCosts: 250,
		importSpend: 0,
		netIncome: 400,
		customersServed: 42,
		demandMissed: 5,
		staffingCoverage: 100,
		staffingShortage: { manager: 0, general: 0 },
		stockHealth: 70,
		staffMorale: 65,
		reputation: 60,
		marketPosition: 50,
		productReports: [],
		warnings: [],
		...overrides
	};
}

function createIndustrialBuilding(
	overrides: Partial<GameState['industrialBuildings'][number]> = {}
): GameState['industrialBuildings'][number] {
	return {
		id: 'flour-mill-1',
		level: 1,
		typeId: 'flour-mill',
		cityId: 'industry-city',
		tileId: 'industry-city-1-1',
		mapX: 1,
		mapY: 1,
		status: 'idle',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {},
		...overrides
	};
}

/**
 * Strips the rail-transport fields (v10) from an otherwise-current game so
 * it matches the shape of a genuine v9 payload: `IndustryCity.rails`,
 * `IndustrialBuilding.inventory`, and `DailyProductionReport.railShipments`
 * / `railUsage` are all absent, not merely empty.
 */
function stripRailFields(game: GameState): unknown {
	const industryCities = game.industryCities.map((city) => {
		const { rails: _rails, ...rest } = city;
		void _rails;
		return rest;
	});
	const industrialBuildings = game.industrialBuildings.map((building) => {
		const { inventory: _inventory, ...rest } = building;
		void _inventory;
		return rest;
	});
	const reports = game.reports.map((report) => {
		const {
			railShipments: _railShipments,
			railUsage: _railUsage,
			...restProduction
		} = report.productionReport;
		void _railShipments;
		void _railUsage;
		return { ...report, productionReport: restProduction };
	});

	return { ...game, industryCities, industrialBuildings, reports };
}

describe('saveCodec', () => {
	test('SaveDataError defaults to corrupt code', () => {
		expect.assertions(1);
		const error = new SaveDataError('some validation failure');
		expect(error.code).toBe('corrupt');
	});

	test('SaveDataError preserves an explicit code', () => {
		expect.assertions(1);
		const error = new SaveDataError('storage is gone', 'storage-unavailable');
		expect(error.code).toBe('storage-unavailable');
	});

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
						location: { neighborhoodId: 'downtown', x: 28, y: 8 },
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
		expect(store.location).toEqual(formatLocation(storeTile!));
		expect(store.location).not.toBe('Stale Location (28, 8)');
		expect(store.localDemand).toBe(computeStoreLocalDemand(storeTile!));
		expect(store.localDemand).not.toBe(1);
	});

	test('refreshes tile-derived fields for stores that keep their coordinates across city regeneration', () => {
		expect.assertions(8);
		// harbor-city-19-1 is campus in the old 28x24 city but residential in
		// the regenerated 56x48 city (getNeighborhood is size-dependent). The
		// store stays at the same tile id/coordinates, so the codec's valid
		// branch must still refresh location/localDemand from the new tile —
		// simulateDay reads localDemand, so a stale value skews revenue. The
		// anchor is chosen so its full 2x2 footprint stays buildable after
		// regeneration (pass 1 validates the whole footprint, not just the
		// anchor — an anchor like 13-1 whose footprint now straddles a river
		// would be relocated, not kept).
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
		const oldTile = oldCity.tiles.find((tile) => tile.id === 'harbor-city-19-1')!;
		const newTile = newCity.tiles.find((tile) => tile.id === 'harbor-city-19-1')!;
		expect(oldTile.neighborhood).not.toBe(newTile.neighborhood);
		expect(isTileBuildable(newTile)).toBe(true);
		// Guard against regressing to an anchor-only check: every footprint
		// tile must be buildable in the regenerated city.
		const newFootprintAllBuildable = newCity.tiles
			.filter(
				(t) => t.x >= newTile.x && t.x < newTile.x + 2 && t.y >= newTile.y && t.y < newTile.y + 2
			)
			.every((t) => isTileBuildable(t));
		expect(newFootprintAllBuildable).toBe(true);

		const record = createManualSaveRecord({
			game: {
				cities: [{ id: 'harbor-city', name: 'Harbor City', width: 28, height: 24, tiles: [] }],
				stores: [
					{
						...createGame().stores[0]!,
						cityId: 'harbor-city',
						tileId: 'harbor-city-19-1',
						mapX: 19,
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
		expect(store.tileId).toBe('harbor-city-19-1');
		expect(store.mapX).toBe(19);
		expect(store.mapY).toBe(1);
		// But tile-derived fields must match the regenerated (residential) tile.
		expect(store.location).toEqual(formatLocation(newTile));
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
		expect.assertions(11);
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
		// stores in this city share a footprint tile. Each store must own all
		// four footprint tiles — a relocated store missing any tile would
		// silently pass the overlap check if missing tiles were skipped.
		const footprintIdsByStore = validated.game.stores
			.filter((store) => store.cityId === city.id)
			.map((store) => {
				const ax = tileById.get(store.tileId)?.x ?? store.mapX;
				const ay = tileById.get(store.tileId)?.y ?? store.mapY;
				const ids = new Set<string>();
				for (let dy = 0; dy < 2; dy += 1) {
					for (let dx = 0; dx < 2; dx += 1) {
						const t = city.tiles.find((tile) => tile.x === ax + dx && tile.y === ay + dy);
						expect(t).toBeDefined();
						ids.add(t!.id);
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

	test('pass 1 relocates a valid-anchor store whose footprint now includes a non-buildable tile', () => {
		// Regression guard for pass 1's footprint validation: the anchor is
		// buildable and unreserved, so without the full-footprint check the
		// store would be kept verbatim — sitting on a river tile inside its own
		// footprint. Pass 1 must validate every footprint tile (mirroring
		// findSavedStoreTile's isAnchorAvailable in pass 2) and bail to
		// relocation, which logs and fixes the placement.
		expect.assertions(3);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		// Pick an interior buildable anchor whose right footprint neighbor is
		// also buildable, then poison that neighbor with a river feature. The
		// anchor stays buildable but its 2x2 footprint now contains a
		// non-buildable tile.
		const anchor = city.tiles.find(
			(t) =>
				isTileBuildable(t) &&
				t.x < city.width - 1 &&
				city.tiles.some((n) => n.x === t.x + 1 && n.y === t.y && isTileBuildable(n))
		)!;
		expect(anchor).toBeDefined();
		const poisonedNeighbor = city.tiles.find((t) => t.x === anchor.x + 1 && t.y === anchor.y)!;
		poisonedNeighbor.feature = 'river';
		const baseStore = createGame().stores[0]!;
		const record = createManualSaveRecord({
			game: {
				cities: [city],
				stores: [
					{
						...baseStore,
						id: 'store-footprint',
						cityId: 'harbor-city',
						tileId: anchor.id,
						mapX: anchor.x,
						mapY: anchor.y
					}
				]
			} as unknown as Partial<GameState>
		});

		const validated = validateSaveRecord(record);
		const store = validated.game.stores.find((s) => s.id === 'store-footprint')!;
		// Not kept on the poisoned anchor; relocated to a fully-buildable
		// footprint with a relocation warning logged.
		expect(store.tileId).not.toBe(anchor.id);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('relocated store "store-footprint"')
		);
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

	test('createSaveRecord stores the active city ID even when the city is missing from the cities array', () => {
		expect.assertions(1);
		const game = createGame({ activeCityId: 'nonexistent-city' });
		const record = createSaveRecord(game, {
			id: 'manual-test',
			name: 'Test',
			kind: 'manual',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});

		expect(record.metadata.activeCityId).toBe('nonexistent-city');
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

	test('v5 migration drops old string warnings from daily and store reports', () => {
		// Report warnings changed from free-form English strings to structured
		// `{ code, ... }` objects in v6. Per the legacy save policy (game is
		// unreleased), old string warnings are dropped rather than reverse-parsed.
		expect.assertions(4);
		const storeReport = {
			...createDailyStoreReport(),
			warnings: ['Low inventory', 'Understaffed']
		} as unknown as DailyStoreReport;
		const report = {
			...createDailyReport(),
			storeReports: [storeReport],
			warnings: ['Healthy day', 'Cash low']
		} as unknown as DailyReport;
		const record = createV5Record({
			game: { reports: [report] }
		});

		const validated = validateSaveRecord(record);
		expect(validated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(validated.game.reports[0]?.warnings).toEqual([]);
		expect(validated.game.reports[0]?.storeReports[0]?.warnings).toEqual([]);
		expect(() => validateSaveRecord(record)).not.toThrow();
	});

	test('v4 migration chains into v5 step and drops legacy string warnings', () => {
		// Regression: each migrateV*SaveRecord step must advance schemaVersion by
		// one, not jump straight to SAVE_SCHEMA_VERSION. A v4 record carrying
		// legacy string warnings must flow through the v4 step (boutique rename)
		// AND the v5 step (drops string warnings) before validation.
		expect.assertions(3);
		const storeReport = {
			...createDailyStoreReport(),
			warnings: ['Low inventory', 'Understaffed']
		} as unknown as DailyStoreReport;
		const report = {
			...createDailyReport(),
			storeReports: [storeReport],
			warnings: ['Healthy day', 'Cash low']
		} as unknown as DailyReport;
		const record = createV4Record({
			game: { reports: [report] }
		});

		const validated = validateSaveRecord(record);
		expect(validated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(validated.game.reports[0]?.warnings).toEqual([]);
		expect(validated.game.reports[0]?.storeReports[0]?.warnings).toEqual([]);
	});

	test('v6 migration drops old string decision contexts', () => {
		// Decision contexts changed from free-form English strings to structured
		// `{ code, ... }` objects in v7. Per the legacy save policy (game is
		// unreleased), old string contexts are DROPPED — not reverse-parsed and
		// not stubbed with a sentinel code that the DecisionContext union does
		// not define.
		expect.assertions(3);
		const record = createV6Record({
			game: {
				decisions: [
					{
						id: 'expansion-cash-blocked-1',
						title: 'Expansion delayed',
						context: 'Opening another store requires 15,000 cash.',
						expiresOnDay: 2,
						options: [{ id: 'acknowledge', label: 'Acknowledge', description: '...', effects: {} }]
					} as unknown as GameState['decisions'][number]
				]
			}
		});

		const validated = validateSaveRecord(record);
		expect(validated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		// The string-context decision is DROPPED, not stubbed — it does not
		// survive as a zombie { code: 'legacyStringDropped' } that the switch
		// cannot handle.
		expect(validated.game.decisions).toHaveLength(0);
		expect(() => validateSaveRecord(record)).not.toThrow();
	});

	test('v6 migration keeps structured decision contexts unchanged', () => {
		// The v6→v7 filter is context-type-specific: it drops only string
		// contexts, leaving structured `{ code, ... }` objects intact so they
		// flow through validation unchanged.
		expect.assertions(3);
		const structuredDecision = {
			id: 'expansion-cash-blocked-1',
			title: 'Expansion delayed',
			context: { code: 'expansionCashBlocked', cash: 15000 },
			expiresOnDay: 2,
			options: [{ id: 'acknowledge', label: 'Acknowledge', description: '...', effects: {} }]
		} as unknown as GameState['decisions'][number];
		const record = createV6Record({
			game: { decisions: [structuredDecision] }
		});

		const validated = validateSaveRecord(record);
		expect(validated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(validated.game.decisions).toHaveLength(1);
		expect(validated.game.decisions[0]?.context).toEqual({
			code: 'expansionCashBlocked',
			cash: 15000
		});
	});

	test('v5 migration chains into v6 step and drops legacy string decision contexts', () => {
		// Regression: migrateV5SaveRecord must emit schema 6 (not
		// SAVE_SCHEMA_VERSION) so the v6→v7 step runs and drops string
		// decision contexts. A v5 record carrying a string-context decision
		// must flow through both the v5 step (drops string warnings) AND the
		// v6 step (drops string decision contexts) before validation.
		expect.assertions(3);
		const record = createV5Record({
			game: {
				decisions: [
					{
						id: 'expansion-cash-blocked-1',
						title: 'Expansion delayed',
						context: 'Opening another store requires 15,000 cash.',
						expiresOnDay: 2,
						options: [{ id: 'acknowledge', label: 'Acknowledge', description: '...', effects: {} }]
					} as unknown as GameState['decisions'][number]
				]
			}
		});

		const validated = validateSaveRecord(record);
		expect(validated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(validated.game.decisions).toHaveLength(0);
		expect(() => validateSaveRecord(record)).not.toThrow();
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

	test('v7 migration copies activeCityId from game state into metadata', () => {
		// v7→v8: save metadata replaced the English activeCityName string with a
		// stable activeCityId. The ID is copied from the saved game state's
		// activeCityId field.
		expect.assertions(2);
		const baseRecord = createManualSaveRecord();
		const metadataWithoutCityId = metadataWithoutActiveCityId(baseRecord);
		const v7Record = {
			...baseRecord,
			schemaVersion: 7 as unknown as typeof SAVE_SCHEMA_VERSION,
			metadata: {
				...metadataWithoutCityId,
				activeCityName: 'Harbor City'
			}
		} as unknown as SaveRecord;

		const validated = validateSaveRecord(v7Record);
		expect(validated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(validated.metadata.activeCityId).toBe('harbor-city');
	});

	test('v7 migration defaults to harbor-city in metadata when game.activeCityId is not a string', () => {
		// The migration copies 'harbor-city' into metadata when
		// game.activeCityId is not a string, but validation subsequently
		// rejects the game state because its activeCityId is missing.
		expect.assertions(2);
		const baseRecord = createManualSaveRecord();
		const metadataWithoutCityId = metadataWithoutActiveCityId(baseRecord);
		const v7Record = {
			...baseRecord,
			schemaVersion: 7 as unknown as typeof SAVE_SCHEMA_VERSION,
			metadata: {
				...metadataWithoutCityId,
				activeCityName: 'Harbor City'
			},
			game: { ...baseRecord.game, activeCityId: undefined } as unknown as GameState
		} as unknown as SaveRecord;

		// The migration's fallback is observable via the metadata error message
		// (it sets activeCityId in metadata), but game validation fails first.
		expect(() => validateSaveRecord(v7Record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(v7Record)).toThrow(
			'Saved game activeCityId must be a non-empty string'
		);
	});

	test('v7 migration bumps schemaVersion without activeCityId when metadata is not an object', () => {
		// When metadata or game is not an object, the migration only advances
		// schemaVersion — validation then rejects the missing activeCityId.
		expect.assertions(2);
		const v7Record = {
			...createManualSaveRecord(),
			schemaVersion: 7 as unknown as typeof SAVE_SCHEMA_VERSION,
			metadata: null as unknown as SaveRecord['metadata']
		} as unknown as SaveRecord;

		expect(() => validateSaveRecord(v7Record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(v7Record)).toThrow('Save metadata must be an object');
	});

	test('v7 migration bumps schemaVersion without activeCityId when game is not an object', () => {
		expect.assertions(2);
		const baseRecord = createManualSaveRecord();
		const metadataWithoutCityId = metadataWithoutActiveCityId(baseRecord);
		const v7Record = {
			...baseRecord,
			schemaVersion: 7 as unknown as typeof SAVE_SCHEMA_VERSION,
			metadata: { ...metadataWithoutCityId, activeCityName: 'Harbor City' },
			game: null as unknown as GameState
		} as unknown as SaveRecord;

		expect(() => validateSaveRecord(v7Record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(v7Record)).toThrow('Saved game must be an object');
	});

	test('v6 migration chains into v7 step and copies activeCityId into metadata', () => {
		// Regression: migrateV6SaveRecord must emit schema 7 (not
		// SAVE_SCHEMA_VERSION) so the v7→v8 step runs and copies activeCityId.
		expect.assertions(2);
		const baseRecord = createManualSaveRecord();
		const metadataWithoutCityId = metadataWithoutActiveCityId(baseRecord);
		const v6Record = {
			...baseRecord,
			schemaVersion: 6 as unknown as typeof SAVE_SCHEMA_VERSION,
			metadata: {
				...metadataWithoutCityId,
				activeCityName: 'Harbor City'
			}
		} as unknown as SaveRecord;

		const validated = validateSaveRecord(v6Record);
		expect(validated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(validated.metadata.activeCityId).toBe('harbor-city');
	});

	test('v7 snapshot migration copies activeCityId into metadata for manual slots', () => {
		expect.assertions(2);
		const baseRecord = createManualSaveRecord();
		const metadataWithoutCityId = metadataWithoutActiveCityId(baseRecord);
		const v7Record = {
			...baseRecord,
			schemaVersion: 7 as unknown as typeof SAVE_SCHEMA_VERSION,
			metadata: {
				...metadataWithoutCityId,
				activeCityName: 'Harbor City'
			}
		} as unknown as SaveRecord;
		const snapshot = {
			schemaVersion: 7,
			autoSave: null,
			manualSlots: [v7Record]
		};

		const validated = validateSaveStoreSnapshot(snapshot);
		expect(validated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(validated.manualSlots[0]?.metadata.activeCityId).toBe('harbor-city');
	});

	test('validateSavedDecisionContext rejects an unknown context code', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				decisions: [
					{
						id: 'unknown-ctx-1',
						title: 'Unknown',
						context: { code: 'notARealCode' },
						expiresOnDay: 2,
						options: [{ id: 'acknowledge', label: 'Ack', description: '...', effects: {} }]
					} as unknown as GameState['decisions'][number]
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'context code must be a known decision context code'
		);
	});

	test('validateSavedDecisionContext rejects locationBlocked with an invalid reason', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				decisions: [
					{
						id: 'loc-blocked-1',
						title: 'Location unavailable',
						context: { code: 'locationBlocked', reason: 'flood' },
						expiresOnDay: 2,
						options: [{ id: 'acknowledge', label: 'Ack', description: '...', effects: {} }]
					} as unknown as GameState['decisions'][number]
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('context reason must be locked|road|river');
	});

	test('validateSavedDecisionContext rejects worldCityNotAvailableYet with an unknown cityId', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				decisions: [
					{
						id: 'world-city-1',
						title: 'City not available',
						context: { code: 'worldCityNotAvailableYet', cityId: 'not-a-city' },
						expiresOnDay: 2,
						options: [{ id: 'acknowledge', label: 'Ack', description: '...', effects: {} }]
					} as unknown as GameState['decisions'][number]
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'context cityId must be a known WorldCityId: not-a-city'
		);
	});

	test('validateSavedDecisionContext rejects industrialRequiresResource with an unknown resource', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				decisions: [
					{
						id: 'ind-res-1',
						title: 'Industrial delayed',
						context: { code: 'industrialRequiresResource', resourceId: 'unobtainium' },
						expiresOnDay: 2,
						options: [{ id: 'acknowledge', label: 'Ack', description: '...', effects: {} }]
					} as unknown as GameState['decisions'][number]
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'must be a known industry resource id: unobtainium'
		);
	});

	test('validateSavedDecisionContext rejects industrialRequiresCash with an unknown building type', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				decisions: [
					{
						id: 'ind-cash-1',
						title: 'Industrial delayed',
						context: {
							code: 'industrialRequiresCash',
							buildingTypeId: 'not-a-building',
							cash: 5000
						},
						expiresOnDay: 2,
						options: [{ id: 'acknowledge', label: 'Ack', description: '...', effects: {} }]
					} as unknown as GameState['decisions'][number]
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'must be a known industrial building type id: not-a-building'
		);
	});

	test('validateSavedDecisionContext round-trips all structured context codes', () => {
		// Compile-time-exhaustive: ALL_DECISION_CONTEXTS is typed as
		// Record<DecisionContext['code'], DecisionContext>, so adding a new
		// variant to the union without adding a key here is a TypeScript error.
		// Runtime: each context is round-tripped through validateSaveRecord, so
		// a missing case in validateSavedDecisionContext's switch throws. This
		// guards against the class of gap where a new DecisionContext code was
		// added to the union and the factories but not the save-codec switch.
		expect.assertions(2);
		const ALL_DECISION_CONTEXTS: Record<DecisionContext['code'], DecisionContext> = {
			expansionUnavailable: { code: 'expansionUnavailable', storeCap: 3 },
			expansionCashBlocked: { code: 'expansionCashBlocked', cash: 1000 },
			locationBlocked: { code: 'locationBlocked', reason: 'locked' },
			locationGeneric: { code: 'locationGeneric' },
			worldCityOpeningCost: { code: 'worldCityOpeningCost', cash: 18000 },
			worldCityUnknown: { code: 'worldCityUnknown' },
			worldCityNotAvailableYet: { code: 'worldCityNotAvailableYet', cityId: 'campus-junction' },
			industrialUnknownTile: { code: 'industrialUnknownTile' },
			industrialUnknownBuilding: { code: 'industrialUnknownBuilding' },
			industrialLockedTile: { code: 'industrialLockedTile' },
			industrialOccupiedTile: { code: 'industrialOccupiedTile' },
			industrialRequiresResource: { code: 'industrialRequiresResource', resourceId: 'grain-field' },
			industrialRequiresIndustrialTile: { code: 'industrialRequiresIndustrialTile' },
			industrialRequiresCash: {
				code: 'industrialRequiresCash',
				buildingTypeId: 'warehouse',
				cash: 1000
			},
			cashPressure: { code: 'cashPressure' },
			expansionOpportunity: { code: 'expansionOpportunity' },
			supplierTerms: { code: 'supplierTerms' },
			railUnknownBuilding: { code: 'railUnknownBuilding' },
			railCrossCity: { code: 'railCrossCity' },
			railNoValidPath: { code: 'railNoValidPath' },
			railAlreadyConnected: { code: 'railAlreadyConnected' },
			railRequiresCash: { code: 'railRequiresCash', cost: 1000, cash: 500 },
			railSegmentAtMaxLevel: { code: 'railSegmentAtMaxLevel' },
			railUnknownSegment: { code: 'railUnknownSegment' },
			industrialTileHasRail: { code: 'industrialTileHasRail' }
		};
		const contexts = Object.values(ALL_DECISION_CONTEXTS);
		// 25 = number of variants in the DecisionContext union. If this fails,
		// a variant was added or removed without updating ALL_DECISION_CONTEXTS.
		expect(contexts).toHaveLength(25);
		const structuredDecisions = contexts.map((context, index) => ({
			id: `d${index + 1}`,
			title: 'T',
			context,
			expiresOnDay: 2,
			options: [{ id: 'acknowledge', label: 'A', description: 'D', effects: {} }]
		})) as unknown as GameState['decisions'];
		const record = createManualSaveRecord({ game: { decisions: structuredDecisions } });

		expect(() => validateSaveRecord(record)).not.toThrow();
	});

	test('validateSavedWarningArray rejects cashReservesLow in store-only warnings', () => {
		// cashReservesLow is a daily-level warning; store reports must not carry it.
		expect.assertions(2);
		const storeReport = {
			...createDailyStoreReport(),
			warnings: [{ code: 'cashReservesLow' }]
		} as unknown as DailyStoreReport;
		const report = createDailyReport({ storeReports: [storeReport] });
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow('code must be a store warning code');
	});

	test('validateSavedWarningArray rejects an unknown warning code in daily report warnings', () => {
		expect.assertions(2);
		const report = createDailyReport({
			warnings: [{ code: 'notARealWarning' } as unknown as DailyReportWarning]
		});
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow('code must be a valid warning code');
	});

	test('validateSavedWarningArray validates cashReservesLow without a storeId', () => {
		// cashReservesLow is the only warning code that does not require a storeId.
		expect.assertions(1);
		const report = createDailyReport({
			warnings: [{ code: 'cashReservesLow' } as unknown as DailyReportWarning]
		});
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });

		expect(() => validateSaveStoreSnapshot(snapshot)).not.toThrow();
	});

	test('validateSavedWarningArray rejects shortManager with a non-positive count', () => {
		expect.assertions(2);
		const storeReport = {
			...createDailyStoreReport(),
			warnings: [{ code: 'shortManager', storeId: 'store-1', count: 0 }]
		} as unknown as DailyStoreReport;
		const report = createDailyReport({ storeReports: [storeReport] });
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow('count must be a positive integer');
	});

	test('validateSavedWarningArray rejects a store warning without a storeId', () => {
		expect.assertions(2);
		const storeReport = {
			...createDailyStoreReport(),
			warnings: [{ code: 'stockPressure' } as unknown as DailyStoreReport['warnings'][number]]
		} as unknown as DailyStoreReport;
		const report = createDailyReport({ storeReports: [storeReport] });
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow('storeId must be a non-empty string');
	});

	test('validateSavedWarningArray validates structured store and daily warnings together', () => {
		// Exercises the happy path for store-only and daily-level warning arrays
		// with all store warning codes plus cashReservesLow.
		expect.assertions(1);
		const storeReport = {
			...createDailyStoreReport(),
			warnings: [
				{ code: 'stockPressure', storeId: 'store-1' },
				{ code: 'nearStaffCapacity', storeId: 'store-1' },
				{ code: 'shortManager', storeId: 'store-1', count: 2 },
				{ code: 'shortGeneral', storeId: 'store-1', count: 3 },
				{ code: 'missedProductDemand', storeId: 'store-1' },
				{ code: 'reputationSlipping', storeId: 'store-1' }
			]
		} as unknown as DailyStoreReport;
		const report = createDailyReport({
			storeReports: [storeReport],
			warnings: [
				{ code: 'cashReservesLow' } as unknown as DailyReportWarning,
				{ code: 'stockPressure', storeId: 'store-1' } as unknown as DailyReportWarning
			]
		});
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });

		expect(() => validateSaveStoreSnapshot(snapshot)).not.toThrow();
	});

	test('requireStringAllowEmpty rejects a non-string store name', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				stores: [
					{
						...createGame().stores[0]!,
						name: 123 as unknown as string
					}
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('Saved game stores[0] name must be a string');
	});

	test('requireStringAllowEmpty accepts an empty-string store name', () => {
		// Store names can be empty (auto-named stores use the default name at
		// render time via storeDisplayName).
		expect.assertions(1);
		const record = createManualSaveRecord({
			game: {
				stores: [{ ...createGame().stores[0]!, name: '' }]
			}
		});

		expect(() => validateSaveRecord(record)).not.toThrow();
	});

	test('v5 migration is a no-op when the reports field is not an array', () => {
		expect.assertions(1);
		const record = createV5Record({
			game: { reports: 'not-an-array' as unknown as GameState['reports'] }
		});

		// The migration should leave the non-array reports untouched so validation
		// rejects it, rather than crashing or coercing.
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('v5 migration is a no-op when a report has no warnings array', () => {
		// migrateV5StoreReport returns the report untouched when warnings is not
		// an array — it only clears array-valued warnings.
		expect.assertions(1);
		const storeReport = {
			...createDailyStoreReport(),
			warnings: 'not-an-array'
		} as unknown as DailyStoreReport;
		const report = createDailyReport({ storeReports: [storeReport] });
		const record = createV5Record({ game: { reports: [report] } });

		// Validation will reject the non-array warnings, proving the migration
		// did not coerce it.
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('v6 migration is a no-op when the decisions field is not an array', () => {
		expect.assertions(1);
		const record = createV6Record({
			game: { decisions: 'not-an-array' as unknown as GameState['decisions'] }
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('v6 migration is a no-op when no string-valued decision contexts exist', () => {
		// When all decision contexts are already structured objects, the v6
		// filter removes nothing and the game is returned untouched.
		expect.assertions(1);
		const structuredDecision = {
			id: 'expansion-cash-blocked-1',
			title: 'Expansion delayed',
			context: { code: 'expansionCashBlocked', cash: 15000 },
			expiresOnDay: 2,
			options: [{ id: 'acknowledge', label: 'Acknowledge', description: '...', effects: {} }]
		} as unknown as GameState['decisions'][number];
		const record = createV6Record({ game: { decisions: [structuredDecision] } });

		// The no-op path returns the game unchanged; validation succeeds.
		expect(() => validateSaveRecord(record)).not.toThrow();
	});

	test('v6 migration is a no-op when all decisions are non-objects', () => {
		// Non-object decisions are kept (return true in the filter) so the
		// filter removes nothing and the game is returned untouched.
		expect.assertions(1);
		const record = createV6Record({
			game: {
				decisions: ['not-a-decision'] as unknown as GameState['decisions']
			}
		});

		// Validation will reject the non-object decision, proving the migration
		// did not drop or transform it.
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('v9 migration adds rails, inventories, and report rail fields', () => {
		// v9→v10: rail transport. A genuine v9 payload predates
		// IndustryCity.rails, IndustrialBuilding.inventory, and
		// DailyProductionReport.railShipments/railUsage entirely — the
		// migration must add them rather than assume they already exist.
		expect.assertions(5);
		const game = createGame({
			industrialBuildings: [createIndustrialBuilding()],
			reports: [createDailyReport()]
		});
		const v9Game = stripRailFields(game);
		const record = {
			...createManualSaveRecord(),
			schemaVersion: 9 as unknown as typeof SAVE_SCHEMA_VERSION,
			game: v9Game as GameState
		};

		const validated = validateSaveRecord(record);
		expect(validated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(validated.game.industryCities[0]!.rails).toEqual([]);
		expect(
			validated.game.industrialBuildings.every((building) => typeof building.inventory === 'object')
		).toBe(true);
		expect(
			validated.game.reports.every((report) => Array.isArray(report.productionReport.railShipments))
		).toBe(true);
		expect(
			validated.game.reports.every(
				(report) =>
					typeof report.productionReport.railUsage === 'object' &&
					report.productionReport.railUsage !== null &&
					Object.keys(report.productionReport.railUsage).length === 0
			)
		).toBe(true);
	});

	test('accepts stalled status and rail movement source at v10', () => {
		expect.assertions(2);
		const building = createIndustrialBuilding({ status: 'stalled' });
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				consumed: [{ materialId: 'grain', quantity: 1, value: 1, source: 'rail' }]
			})
		});
		const record = createManualSaveRecord({
			game: { industrialBuildings: [building], reports: [report] }
		});

		const validated = validateSaveRecord(record);
		expect(validated.game.industrialBuildings[0]!.status).toBe('stalled');
		expect(
			validated.game.reports[0]!.productionReport.consumed.some(
				(movement) => movement.source === 'rail'
			)
		).toBe(true);
	});

	test('rejects a rail cell with level 0', () => {
		expect.assertions(2);
		const baseIndustryCity = createGame().industryCities[0]!;
		const record = createManualSaveRecord({
			game: {
				// Fixture city is 1×1, so (0,0) is the only valid grid tile.
				industryCities: [{ ...baseIndustryCity, rails: [{ x: 0, y: 0, level: 0 }] }]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(/level/);
	});

	test('clamps loaded building inventory to recipe materials', () => {
		// flour-mill's recipe (flour-milling) only touches grain (input) and
		// flour (output); snacks belongs to no part of that recipe and must be
		// dropped on load rather than persisted as dead buffer weight.
		expect.assertions(2);
		const mill = createIndustrialBuilding({
			typeId: 'flour-mill',
			inventory: { grain: 5, snacks: 5 }
		});
		const record = createManualSaveRecord({
			game: { industrialBuildings: [mill] }
		});

		const validated = validateSaveRecord(record);
		const decodedMill = validated.game.industrialBuildings.find((b) => b.typeId === 'flour-mill')!;
		expect(decodedMill.inventory.snacks).toBeUndefined();
		expect(decodedMill.inventory.grain).toBe(5);
	});

	test('validates an industry city with populated tiles', () => {
		expect.assertions(1);
		const baseIndustryCity = createGame().industryCities[0]!;
		const city = {
			...baseIndustryCity,
			width: 2,
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
				},
				{
					id: 'industry-city-1-0',
					cityId: 'industry-city',
					x: 1,
					y: 0,
					terrain: 'farmland',
					resource: 'grain-field',
					locked: false
				}
			] as IndustryTile[]
		};
		const record = createManualSaveRecord({ game: { industryCities: [city] } });
		expect(() => validateSaveRecord(record)).not.toThrow();
	});

	test('rejects a rail cell with a non-integer x coordinate', () => {
		expect.assertions(2);
		const baseIndustryCity = createGame().industryCities[0]!;
		const record = createManualSaveRecord({
			game: { industryCities: [{ ...baseIndustryCity, rails: [{ x: 0.5, y: 0, level: 1 }] }] }
		});
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('x must be an integer');
	});

	test('rejects a rail cell with a non-integer y coordinate', () => {
		expect.assertions(2);
		const baseIndustryCity = createGame().industryCities[0]!;
		const record = createManualSaveRecord({
			game: { industryCities: [{ ...baseIndustryCity, rails: [{ x: 0, y: 0.5, level: 1 }] }] }
		});
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('y must be an integer');
	});

	test('rejects a rail cell whose coordinates fall outside the city grid', () => {
		expect.assertions(2);
		const baseIndustryCity = createGame().industryCities[0]!;
		const record = createManualSaveRecord({
			game: { industryCities: [{ ...baseIndustryCity, rails: [{ x: 5, y: 0, level: 1 }] }] }
		});
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('must map to a valid city grid tile');
	});

	test('rejects duplicate rail coordinates within a city', () => {
		expect.assertions(2);
		const baseIndustryCity = createGame().industryCities[0]!;
		const record = createManualSaveRecord({
			game: {
				industryCities: [
					{
						...baseIndustryCity,
						rails: [
							{ x: 0, y: 0, level: 1 },
							{ x: 0, y: 0, level: 2 }
						]
					}
				]
			}
		});
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('duplicates rail coordinate');
	});

	test('round-trips a populated rails array at the maximum rail level', () => {
		// Positive round-trip: the v9 migration test only checks rails: [], and
		// the rejection tests cover invalid cells. This pins that a populated
		// rails array with cells at RAIL_MAX_LEVEL (5) survives a full
		// clone → validate → decode cycle intact.
		expect.assertions(3);
		const baseIndustryCity = createGame().industryCities[0]!;
		const city = {
			...baseIndustryCity,
			rails: [{ x: 0, y: 0, level: 5 }]
		};
		const record = createManualSaveRecord({ game: { industryCities: [city] } });

		const validated = validateSaveRecord(record);
		expect(validated.game.industryCities[0]!.rails).toHaveLength(1);
		expect(validated.game.industryCities[0]!.rails[0]).toEqual({ x: 0, y: 0, level: 5 });

		// Full snapshot round-trip (clone → parse) must also preserve the rails.
		const snapshot = createSnapshotWithGame({ ...createGame(), industryCities: [city] });
		const decoded = validateSaveStoreSnapshot(snapshot);
		expect(decoded.manualSlots[0]!.game.industryCities[0]!.rails).toEqual([
			{ x: 0, y: 0, level: 5 }
		]);
	});

	test('rejects a building inventory with an unknown material id', () => {
		expect.assertions(2);
		const mill = createIndustrialBuilding({
			typeId: 'flour-mill',
			inventory: { 'nonexistent-material': 5 } as unknown as Record<MaterialId, number>
		});
		const record = createManualSaveRecord({ game: { industrialBuildings: [mill] } });
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('must be a known material');
	});

	test('rejects a building inventory with a negative quantity', () => {
		expect.assertions(2);
		const mill = createIndustrialBuilding({
			typeId: 'flour-mill',
			inventory: { grain: -5 }
		});
		const record = createManualSaveRecord({ game: { industrialBuildings: [mill] } });
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('must be at least 0');
	});

	test('round-trips a production report with rail shipments and usage', () => {
		expect.assertions(3);
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				railShipments: [
					{
						materialId: 'grain',
						quantity: 3,
						value: 9,
						kind: 'pull-producer',
						fromId: 'farm-1',
						toId: 'mill-1'
					}
				],
				railUsage: { 'industry-city:1,1': 3 }
			})
		});
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });
		const validated = validateSaveStoreSnapshot(snapshot);
		const decoded = validated.manualSlots[0]!.game.reports[0]!.productionReport;
		expect(decoded.railShipments).toHaveLength(1);
		expect(decoded.railShipments[0]).toMatchObject({ kind: 'pull-producer', quantity: 3 });
		expect(decoded.railUsage).toEqual({ 'industry-city:1,1': 3 });
	});

	test('rejects a production report with negative rail usage units', () => {
		expect.assertions(2);
		const report = createDailyReport({
			productionReport: createDailyProductionReport({ railUsage: { 'industry-city:1,1': -1 } })
		});
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow('railUsage');
	});

	test('rejects a rail shipment with a negative quantity', () => {
		expect.assertions(2);
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				railShipments: [
					{
						materialId: 'grain',
						quantity: -1,
						value: 9,
						kind: 'pull-producer',
						fromId: 'farm-1',
						toId: 'mill-1'
					}
				]
			})
		});
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow('quantity must be non-negative');
	});

	test('rejects a rail shipment with a negative value', () => {
		expect.assertions(2);
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				railShipments: [
					{
						materialId: 'grain',
						quantity: 1,
						value: -1,
						kind: 'pull-producer',
						fromId: 'farm-1',
						toId: 'mill-1'
					}
				]
			})
		});
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow('value must be non-negative');
	});
});
