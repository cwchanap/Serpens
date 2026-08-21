import { describe, expect, test, vi } from 'vitest';
import { initializeCityInventory, initializeRetailSupplyAssignment } from '$lib/game/cityInventory';
import {
	computeStoreLocalDemand,
	DEFAULT_RETAIL_CITY_HEIGHT,
	DEFAULT_RETAIL_CITY_WIDTH,
	generateCity,
	isTileBuildable
} from '$lib/game/city';
import { calculateStockHealth, initializeStoreProducts } from '$lib/game/stock';
import { createFoundingFinanceState } from '$lib/game/finance';
import { createInitialEventRuntime } from '$lib/game/eventSelection';
import { createNewGame } from '$lib/game/state';
import { formatLocation, openStoreAtTile } from '$lib/game/placement';
import { simulateDay } from '$lib/game/simulateDay';
import { setRetailSupplySource } from '$lib/game/retailSupply';
import { emptyLogisticsReport } from '$lib/game/logisticsReport.testUtils';
import {
	createCityTileLookup,
	getOccupiedStoreTileIds,
	getRetailStoreFootprint
} from '$lib/game/storeFootprint';
import {
	STARTER_STORE_CAP,
	WORLD_CITY_CATALOG,
	createInitialWorldProgress,
	openWorldCity,
	refreshWorldProgress
} from '$lib/game/world';
import type {
	DailyProductReport,
	DailyProductionReport,
	DailyReport,
	DailyReportWarning,
	DailyStoreReport,
	GameState,
	IndustrialBuildingTypeId,
	IndustryResourceId,
	MaterialId,
	ProductId,
	StoreProduct
} from '$lib/game/types';
import { SAVE_SCHEMA_VERSION, type SaveRecord, type SaveStoreSnapshot } from './saveTypes';
import {
	SaveDataError,
	createEmptySaveStore,
	createSaveRecord,
	validateSaveRecord,
	validateSaveStoreSnapshot
} from './saveCodec';
import {
	BROWSER_SAVE_STORAGE_KEY,
	createBrowserSaveRepository,
	type StorageLike
} from './browserSaveRepository';
import { SaveRepositoryFromDriver, type SaveStoreDriver } from './saveStoreRepository';

function findBuildableAnchorContainingCompetitorMarker(game: GameState) {
	const city = game.cities.find((candidate) => candidate.id === game.activeCityId);
	if (!city) throw new Error(`Expected active retail city ${game.activeCityId}.`);

	const cityLookup = createCityTileLookup(city);
	const occupiedTileIds = getOccupiedStoreTileIds(city, game.stores, cityLookup);

	const anchor = city.tiles.find((candidate) => {
		if (!isTileBuildable(candidate) || occupiedTileIds.has(candidate.id)) return false;
		const footprint = getRetailStoreFootprint(cityLookup, candidate);
		return (
			footprint.missingCoordinates.length === 0 &&
			footprint.tiles.length === 4 &&
			footprint.tiles.every(isTileBuildable) &&
			footprint.tiles.every((tile) => !occupiedTileIds.has(tile.id)) &&
			game.competitors.some(
				(competitor) =>
					competitor.cityId === city.id &&
					competitor.location.x >= candidate.x &&
					competitor.location.x < candidate.x + 2 &&
					competitor.location.y >= candidate.y &&
					competitor.location.y < candidate.y + 2
			)
		);
	});

	if (!anchor)
		throw new Error(`Expected a buildable anchor containing a rival marker in ${city.id}.`);
	return anchor;
}

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

class NonSaveDataErrorDriver extends MemorySaveStoreDriver {
	override async read(): Promise<SaveStoreSnapshot> {
		throw new TypeError('Driver is unavailable');
	}
}

function createFixtureRetailCity(): GameState['cities'][number] {
	return generateCity({
		id: 'harbor-city',
		name: 'Harbor City',
		width: DEFAULT_RETAIL_CITY_WIDTH,
		height: DEFAULT_RETAIL_CITY_HEIGHT,
		seed: 20260505
	});
}

function findFixtureStoreTile(city: GameState['cities'][number]) {
	const tile = city.tiles.find((candidate) => {
		if (!isTileBuildable(candidate)) return false;
		const footprint = city.tiles.filter(
			(other) =>
				other.x >= candidate.x &&
				other.x < candidate.x + 2 &&
				other.y >= candidate.y &&
				other.y < candidate.y + 2
		);
		return footprint.length === 4 && footprint.every(isTileBuildable);
	});
	if (!tile) throw new Error(`Expected a buildable fixture tile in ${city.id}.`);
	return tile;
}

function createFixtureIndustryCity(): GameState['industryCities'][number] {
	return {
		id: 'industry-city',
		name: 'Industry City',
		width: 2,
		height: 2,
		tiles: [
			[0, 0],
			[1, 0],
			[0, 1],
			[1, 1]
		].map(([x, y]) => ({
			id: `industry-city-${x}-${y}`,
			cityId: 'industry-city',
			x: x!,
			y: y!,
			terrain: 'farmland',
			resource: x === 0 && y === 0 ? ('grain-field' as const) : null,
			locked: false
		})),
		rails: []
	};
}

function delay(): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, 0));
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
	const city = createFixtureRetailCity();
	const storeTile = findFixtureStoreTile(city);
	const day = overrides.day ?? 3;
	const {
		cityInventories: overrideCityInventories,
		retailSupplyAssignments: overrideRetailSupplyAssignments,
		...otherOverrides
	} = overrides;
	const game: GameState = {
		seed: 20260505,
		rngState: 99,
		day,
		cash: 12500,
		finance: overrides.finance ?? createFoundingFinanceState(day, 2000),
		policy: {
			pricing: 'standard',
			inventory: 'balanced',
			staffing: 'efficient',
			marketing: 'awareness',
			service: 'balanced'
		},
		policyOverrides: [],
		managerDelegations: [],
		managerActionHistory: [],
		scorecard: {
			profit: 55,
			customerSatisfaction: 60,
			staffMorale: 65,
			marketPosition: 50
		},
		world: createInitialWorldProgress(),
		storeCap: STARTER_STORE_CAP,
		cities: [city],
		activeCityId: 'harbor-city',
		industryCities: [createFixtureIndustryCity()],
		activeIndustryCityId: 'industry-city',
		industrialBuildings: [],
		cityInventories: [],
		retailSupplyAssignments: [],
		logistics: {
			transferOrders: [],
			recurringRoutes: [],
			nextTransferSequence: 1,
			nextRouteSequence: 1
		},
		stores: [
			{
				id: 'store-1',
				level: 1,
				name: 'Founding Store',
				archetypeId: 'boutique',
				location: formatLocation(storeTile),
				cityId: 'harbor-city',
				tileId: storeTile.id,
				mapX: storeTile.x,
				mapY: storeTile.y,
				daysOpen: 2,
				reputation: 60,
				stockHealth: calculateStockHealth(initializeStoreProducts('boutique')),
				products: initializeStoreProducts('boutique'),
				staffMorale: 65,
				staffCapacity: 66,
				localDemand: computeStoreLocalDemand(storeTile),
				managerQuality: 58
			}
		],
		competitors: [],
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

function createCurrentGame(overrides: Partial<GameState> = {}): GameState {
	return refreshWorldProgress(createGame(overrides));
}

function createDaySevenReplenishmentFromIndustryCity(): GameState {
	const base = createNewGame('convenience', 292_907);
	const openedBreadbasket = openWorldCity(
		{
			...base,
			cash: 100_000,
			day: 7,
			finance: {
				...base.finance,
				currentDayActivity: { ...base.finance.currentDayActivity, day: 7 }
			},
			world: {
				...base.world,
				revealedCityIds: [...base.world.revealedCityIds, 'breadbasket-basin']
			}
		},
		'breadbasket-basin'
	);
	const store = openedBreadbasket.stores[0]!;

	return {
		...openedBreadbasket,
		cityInventories: openedBreadbasket.cityInventories.map((inventory) =>
			inventory.cityId === 'industry-city'
				? {
						...inventory,
						materials: { 'bottled-water': 20 }
					}
				: inventory
		),
		stores: [
			{
				...store,
				products: [
					{
						productId: 'bottled-water' as const,
						brandId: 'common-ground',
						lots: [],
						reorderThreshold: 1,
						targetStock: 20,
						sellingPrice: 3
					}
				]
			}
		]
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

function expectSnapshotHistoricalReportDropped(snapshot: unknown): void {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		const validated = validateSaveStoreSnapshot(snapshot);
		expect(validated.manualSlots[0]!.game.reports).toEqual([]);
		expect(warn).toHaveBeenCalledTimes(1);
	} finally {
		warn.mockRestore();
	}
}

function createSaveRecordWithProducts(
	products: Array<Omit<StoreProduct, 'brandId'> & Partial<Pick<StoreProduct, 'brandId'>>>
): SaveRecord {
	const game = createNewGame('convenience', 20260508);
	const [store] = game.stores;
	const materializedProducts: StoreProduct[] = products.map((product) => ({
		brandId: 'common-ground',
		...product
	}));

	return createSaveRecord(
		{
			...game,
			stores: [
				{
					...store!,
					products: materializedProducts
				}
			]
		},
		{
			id: 'manual-broken-stock',
			name: 'Broken Stock Save',
			kind: 'manual',
			updatedAt: new Date('2026-05-08T12:00:00.000Z')
		}
	);
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
		brandReputationAdjustment: 0,
		marketPosition: 50,
		productReports: [],
		inventoryLossExpense: 0,
		warnings: [],
		replenishment: null,
		...overrides
	};
}

function createDailyProductReport(overrides: Partial<DailyProductReport> = {}): DailyProductReport {
	return {
		productId: 'snacks' as const,
		brandId: 'common-ground',
		name: 'Snacks',
		unitsSold: 4,
		demandMissed: 1,
		revenue: 20,
		costOfGoods: 12,
		grossMargin: 8,
		endingStock: 18,
		warehouseUnits: 2,
		warehouseValue: 16,
		importedUnits: 0,
		importCost: 3,
		importSpend: 0,
		wasteUnits: 0,
		wasteValue: 0,
		shrinkUnits: 0,
		shrinkValue: 0,
		stockoutLostDemand: 0,
		averageAgeDays: null,
		oldestSellableAgeDays: null,
		trendMultiplier: 1,
		obsolescenceMultiplier: 1,
		baseSellingPrice: 5,
		effectiveSellingPrice: 5,
		markdownAmount: 0,
		...overrides
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
		cityInventories: [
			{
				cityId: 'industry-city',
				capacity: 0,
				used: 0,
				overflowUnits: 0,
				overflowCost: 0
			}
		],
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
		cashBefore: 0,
		operatingIncome: 0,
		operatingCashFlow: 400,
		inventoryLossExpense: 0,
		interestAccrued: 0,
		interestPaid: 0,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 0,
		refinancedPrincipal: 0,
		financingCashFlow: 0,
		netCashChange: 400,
		netIncome: 400,
		cashAfter: 12900,
		outstandingPrincipalAfter: 0,
		nextLoanPayment: null,
		scorecard: {
			profit: 55,
			customerSatisfaction: 60,
			staffMorale: 65,
			marketPosition: 50
		},
		productionReport: createDailyProductionReport(),
		storeReports: [createDailyStoreReport()],
		modifierImpacts: [],
		modifierLifecycle: [],
		marketReports: [],
		warnings: [],
		...overrides,
		logistics: overrides.logistics ?? emptyLogisticsReport()
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
		expect(record.metadata.activeCityId).toBe('harbor-city');
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

	test('rejects schema 17 snapshots without migration', () => {
		expect.assertions(2);

		expect(() =>
			validateSaveStoreSnapshot({
				schemaVersion: 17,
				autoSave: null,
				manualSlots: []
			})
		).toThrow(SaveDataError);

		expect(() =>
			validateSaveStoreSnapshot({
				schemaVersion: 17,
				autoSave: null,
				manualSlots: []
			})
		).toThrow('Unsupported save schema version: 17');
	});

	test('rejects a pre-release snapshot schema', () => {
		expect.assertions(2);

		expect(() =>
			validateSaveStoreSnapshot({
				schemaVersion: 12,
				autoSave: null,
				manualSlots: []
			})
		).toThrow(SaveDataError);

		expect(() =>
			validateSaveStoreSnapshot({
				schemaVersion: 12,
				autoSave: null,
				manualSlots: []
			})
		).toThrow('Unsupported save schema version: 12');
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

	test('rejects saved games missing industry state fields', () => {
		expect.assertions(2);
		const game = createGame();
		const gameWithoutIndustry: Partial<GameState> = { ...game };
		delete gameWithoutIndustry.industryCities;
		gameWithoutIndustry.cityInventories = [];
		const snapshot = createSnapshotWithGame(gameWithoutIndustry);

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game industryCities must be an array'
		);
	});

	test('validates and preserves world progress and store cap in save records', () => {
		expect.assertions(3);
		const game = createGame({
			world: {
				revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
				openedCityIds: ['harbor-city', 'industry-city'],
				claimedMilestoneIds: ['reveal-campus-junction']
			},
			storeCap: 4
		});
		const record = createSaveRecord(game, {
			id: 'manual-world',
			name: 'World Save',
			kind: 'manual',
			updatedAt: new Date('2026-05-30T12:00:00.000Z')
		});

		const validated = validateSaveRecord(record);

		expect(validated.game.world.revealedCityIds).toContain('campus-junction');
		expect(validated.game.world.claimedMilestoneIds).toContain('reveal-campus-junction');
		expect(validated.game.storeCap).toBe(4);
	});

	test.each([
		{
			name: 'invalid revealed city id',
			game: {
				world: {
					...createInitialWorldProgress(),
					revealedCityIds: [
						'harbor-city',
						'industry-city',
						'moonbase' as GameState['world']['revealedCityIds'][number]
					]
				}
			},
			message:
				'Saved game world revealedCityIds[2] must be one of: harbor-city, campus-junction, garden-borough, industry-city, breadbasket-basin, quarry-works'
		},
		{
			name: 'invalid claimed milestone id',
			game: {
				world: {
					...createInitialWorldProgress(),
					claimedMilestoneIds: [
						'reveal-moonbase' as GameState['world']['claimedMilestoneIds'][number]
					]
				}
			},
			message:
				'Saved game world claimedMilestoneIds[0] must be one of: reveal-campus-junction, reveal-breadbasket-basin, reveal-garden-borough, reveal-quarry-works, positive-income-store-cap'
		},
		{
			name: 'opened city id that has not been revealed',
			game: {
				world: {
					...createInitialWorldProgress(),
					openedCityIds: ['harbor-city', 'industry-city', 'campus-junction']
				}
			},
			message: 'Saved game world opened city must also be revealed: campus-junction'
		},
		{
			name: 'missing world progress',
			game: { world: undefined as unknown as GameState['world'] },
			message: 'Saved game world must be an object'
		},
		{
			name: 'non-number store cap',
			game: {
				storeCap: 'three' as unknown as number
			},
			message: 'Saved game storeCap must be a finite number'
		},
		{
			name: 'missing store cap',
			game: { storeCap: undefined as unknown as number },
			message: 'Saved game storeCap must be a finite number'
		},
		{
			name: 'store cap below the current store count',
			game: {
				storeCap: 0
			},
			message: 'Saved game storeCap must be at least the current store count'
		}
	] satisfies Array<{ name: string; game: Partial<GameState>; message: string }>)(
		'rejects saved world progress and store caps with $name',
		({ game, message }) => {
			expect.assertions(2);
			const record = createManualSaveRecord({ game });

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow(message);
		}
	);

	test('rejects repeated city and milestone ids instead of deduplicating them', () => {
		expect.assertions(2);
		const game = createGame({
			world: {
				revealedCityIds: ['harbor-city', 'industry-city', 'harbor-city', 'industry-city'],
				openedCityIds: ['harbor-city', 'industry-city', 'harbor-city'],
				claimedMilestoneIds: []
			}
		});
		const record = createSaveRecord(game, {
			id: 'manual-dedup',
			name: 'Dedup Save',
			kind: 'manual',
			updatedAt: new Date('2026-05-30T12:00:00.000Z')
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game retailSupplyAssignments must contain one record for every opened retail city'
		);
	});

	test('rejects city-inventory materials with unknown ids', () => {
		expect.assertions(2);
		const game = createGame({
			cityInventories: [
				{
					cityId: 'industry-city',
					materials: { snacks: 5, 'bad-material': 1 } as Record<string, number>
				}
			]
		});
		const snapshot = createSnapshotWithGame(game);

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game cityInventories[0] materials bad-material must be a known material'
		);
	});

	test('rejects negative city-inventory material quantities', () => {
		expect.assertions(2);
		const game = createGame({
			cityInventories: [
				{
					cityId: 'industry-city',
					materials: { snacks: -1 }
				}
			]
		});
		const snapshot = createSnapshotWithGame(game);

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game cityInventories[0] materials snacks must be a non-negative safe integer'
		);
	});

	test('rejects duplicate product category ids in store products', () => {
		expect.assertions(2);
		const game = createGame({
			stores: [
				{
					...createGame().stores[0]!,
					products: [
						{
							productId: 'apparel' as const,
							brandId: 'common-ground',
							lots: [{ receivedDay: 1, quantity: 10 }],
							targetStock: 20,
							sellingPrice: 38,
							reorderThreshold: 5
						},
						{
							productId: 'apparel' as const,
							brandId: 'common-ground',
							lots: [{ receivedDay: 1, quantity: 15 }],
							targetStock: 25,
							sellingPrice: 40,
							reorderThreshold: 5
						}
					]
				}
			]
		});
		const snapshot = createSnapshotWithGame(game);

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game stores[0] products[1] productId must be unique for archetype boutique'
		);
	});

	test('rejects empty product arrays in store products', () => {
		expect.assertions(2);
		const game = createGame({
			stores: [
				{
					...createGame().stores[0]!,
					products: []
				}
			]
		});
		const snapshot = createSnapshotWithGame(game);

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game stores[0] products must have at least one product'
		);
	});

	test('rejects industry city tiles with unknown resource ids', () => {
		expect.assertions(2);
		const game = createGame({
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
							terrain: 'farmland',
							resource: 'bad-resource' as IndustryResourceId,
							locked: false
						}
					],
					rails: []
				}
			]
		});
		const snapshot = createSnapshotWithGame(game);

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game industryCities[0] tiles[0] resource bad-resource must be a known industry resource'
		);
	});

	test('rejects industrial buildings with unknown type ids', () => {
		expect.assertions(2);
		const game = createGame({
			industrialBuildings: [
				{
					id: 'building-1',
					level: 1,
					typeId: 'bad-building' as IndustrialBuildingTypeId,
					cityId: 'industry-city',
					tileId: 'industry-city-0-0',
					mapX: 0,
					mapY: 0,
					status: 'idle',
					lastProduction: [],
					producedTotal: 0,
					importedInputTotal: 0,
					blockedDays: 0,
					inventory: {}
				}
			]
		});
		const snapshot = createSnapshotWithGame(game);

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game industrialBuildings[0] typeId bad-building must be a known industrial building type'
		);
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

	test('accepts current simulated games with product inventory and reports', () => {
		expect.assertions(8);
		const game = simulateDay(createNewGame('convenience', 20260508));
		const record = createSaveRecord(game, {
			id: 'manual-stock',
			name: 'Stock Save',
			kind: 'manual',
			updatedAt: new Date('2026-05-08T12:00:00.000Z')
		});

		const validated = validateSaveRecord(record);
		const report = validated.game.reports[0];
		const productReport = report?.storeReports[0]?.productReports[0];

		expect(validated).toEqual(record);
		expect(validated.game.stores[0]?.products.length).toBeGreaterThan(0);
		expect(report?.importSpend).toBeGreaterThanOrEqual(0);
		expect(report?.productionReport.importSpend).toBeGreaterThanOrEqual(0);
		expect(report?.productionReport.warehouseUsed).toBeGreaterThanOrEqual(0);
		expect(report?.storeReports[0]?.productReports.length).toBeGreaterThan(0);
		expect(productReport?.warehouseUnits).toBeGreaterThanOrEqual(0);
		expect(productReport?.warehouseValue).toBeGreaterThanOrEqual(0);
	});

	test('accepts boutique weekly import reports without material shop imports', () => {
		expect.assertions(3);
		const game = {
			...createNewGame('boutique', 20260508),
			day: 7
		};
		const store = {
			...game.stores[0]!,
			products: game.stores[0]!.products.map((product) =>
				product.productId === 'apparel'
					? {
							...product,
							lots: [],
							reorderThreshold: 5,
							targetStock: 20
						}
					: {
							...product,
							reorderThreshold: 0
						}
			)
		};
		const simulated = simulateDay({ ...game, stores: [store] });
		const apparelReport = simulated.reports[0]?.storeReports[0]?.productReports.find(
			(report) => report.productId === 'apparel'
		);
		const record = createSaveRecord(simulated, {
			id: 'manual-boutique-imports',
			name: 'Boutique Imports',
			kind: 'manual',
			updatedAt: new Date('2026-05-08T12:00:00.000Z')
		});

		expect(apparelReport?.importedUnits).toBe(20);
		expect(simulated.reports[0]?.productionReport.shopImports).toEqual([]);
		expect(() => validateSaveRecord(record)).not.toThrow();
	});

	test('rejects saved games with invalid store product rows', () => {
		expect.assertions(2);
		const record = createSaveRecordWithProducts([
			{
				productId: '' as ProductId,
				lots: [{ receivedDay: 1, quantity: Number.NaN }],
				reorderThreshold: 1,
				targetStock: 1,
				sellingPrice: 1
			}
		]);

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('products[0]');
	});

	test.each([
		{
			name: 'non-positive lot quantity',
			products: [
				{
					productId: 'snacks' as const,
					lots: [{ receivedDay: 1, quantity: -1 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 5
				},
				{
					productId: 'soft-drinks' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 4
				},
				{
					productId: 'essentials' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 8
				}
			],
			message:
				'Saved game stores[0] products[0] lots[0] quantity must be a positive safe integer that can advance safely'
		},
		{
			name: 'negative reorder threshold',
			products: [
				{
					productId: 'snacks' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: -1,
					targetStock: 2,
					sellingPrice: 5
				},
				{
					productId: 'soft-drinks' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 4
				},
				{
					productId: 'essentials' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 8
				}
			],
			message: 'Saved game stores[0] products[0] reorderThreshold must be at least 0'
		},
		{
			name: 'target below reorder threshold',
			products: [
				{
					productId: 'snacks' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 5,
					targetStock: 4,
					sellingPrice: 5
				},
				{
					productId: 'soft-drinks' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 4
				},
				{
					productId: 'essentials' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 8
				}
			],
			message:
				'Saved game stores[0] products[0] targetStock must be greater than or equal to reorderThreshold'
		},
		{
			name: 'zero selling price',
			products: [
				{
					productId: 'snacks' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 0
				},
				{
					productId: 'soft-drinks' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 4
				},
				{
					productId: 'essentials' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 8
				}
			],
			message: 'Saved game stores[0] products[0] sellingPrice must be greater than 0'
		}
	])('rejects saved store product rows with $name', ({ products, message }) => {
		expect.assertions(1);

		expect(() => validateSaveRecord(createSaveRecordWithProducts(products))).toThrow(message);
	});

	test.each([
		[
			'zero lot quantity',
			[{ receivedDay: 1, quantity: 0 }],
			'lots[0] quantity must be a positive safe integer that can advance safely'
		],
		[
			'future lot day',
			[{ receivedDay: 2, quantity: 1 }],
			'lots[0] receivedDay must not be after the game day'
		],
		[
			'out-of-order lot days',
			[
				{ receivedDay: 1, quantity: 1 },
				{ receivedDay: 0, quantity: 1 }
			],
			'lots must be ordered by receivedDay'
		],
		[
			'quantities exceeding the safe-integer range',
			[
				{ receivedDay: 1, quantity: Number.MAX_SAFE_INTEGER - 1 },
				{ receivedDay: 1, quantity: 2 }
			],
			'lots quantities must not exceed the safe-integer range'
		]
	] as const)('rejects saved product lots with %s', (_name, lots, message) => {
		expect.assertions(1);
		const product: StoreProduct = {
			productId: 'bottled-water',
			brandId: 'common-ground',
			lots: [...lots],
			reorderThreshold: 1,
			targetStock: 2,
			sellingPrice: 3
		};

		expect(() => validateSaveRecord(createSaveRecordWithProducts([product]))).toThrow(
			`Saved game stores[0] products[0] ${message}`
		);
	});

	test.each([
		{
			name: 'duplicate categories',
			products: [
				{
					productId: 'snacks' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 5
				},
				{
					productId: 'snacks' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 5
				},
				{
					productId: 'essentials' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 8
				}
			],
			message: 'Saved game stores[0] products[1] productId must be unique for archetype convenience'
		},
		{
			name: 'unknown category',
			products: [
				{
					productId: 'snacks' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 5
				},
				{
					productId: 'soft-drinks' as const,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 4
				},
				{
					productId: 'unknown' as ProductId,
					lots: [{ receivedDay: 1, quantity: 10 }],
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 8
				}
			],
			message: 'Saved game stores[0] products[2] productId must belong to archetype convenience'
		}
	])('rejects saved store products with $name', ({ products, message }) => {
		expect.assertions(1);

		expect(() => validateSaveRecord(createSaveRecordWithProducts(products))).toThrow(message);
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
					hiredOnDay: 1,
					level: 1,
					xp: 0
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game staff[0] role must be one of: manager, general'
		);
	});

	test('rejects saved staff with empty assigned store ids', () => {
		expect.assertions(2);
		const snapshot = createSnapshotWithGame({
			...createGame(),
			staff: [
				{
					id: 'staff-1',
					name: 'Avery Chen',
					role: 'manager',
					monthlySalary: 3200,
					skill: 65,
					morale: 70,
					assignedStoreId: '',
					hiredOnDay: 1,
					level: 1,
					xp: 0
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game staff[0] assignedStoreId must be a non-empty string'
		);
	});

	test('rejects saved staff with an out-of-range level', () => {
		expect.assertions(2);
		const snapshot = createSnapshotWithGame({
			...createGame(),
			staff: [
				{
					id: 'staff-1',
					name: 'Avery Chen',
					role: 'general',
					monthlySalary: 2_800,
					skill: 60,
					morale: 65,
					assignedStoreId: 'store-1',
					hiredOnDay: 1,
					level: 9,
					xp: 0
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game staff[0] level must be an integer between 1 and 5'
		);
	});

	test('rejects saved staff with negative xp', () => {
		expect.assertions(2);
		const snapshot = createSnapshotWithGame({
			...createGame(),
			staff: [
				{
					id: 'staff-1',
					name: 'Avery Chen',
					role: 'general',
					monthlySalary: 2_800,
					skill: 60,
					morale: 65,
					assignedStoreId: 'store-1',
					hiredOnDay: 1,
					level: 1,
					xp: -5
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game staff[0] xp must be at least 0'
		);
	});

	test('rejects saved industrial building with invalid lastProduction material movement', () => {
		expect.assertions(2);
		const snapshot = createSnapshotWithGame({
			...createGame(),
			industrialBuildings: [
				{
					id: 'building-1',
					typeId: 'snack-factory',
					cityId: 'industry-city',
					tileId: 'industry-city-1-1',
					mapX: 1,
					mapY: 1,
					level: 1,
					status: 'produced',
					lastProduction: [
						{
							cityId: 'industry-city',
							materialId: 'invalid-material' as MaterialId,
							quantity: 10,
							value: 50,
							source: 'local'
						}
					],
					producedTotal: 100,
					importedInputTotal: 0,
					blockedDays: 0,
					inventory: {}
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game industrialBuildings[0] lastProduction[0] materialId invalid-material must be a known material'
		);
	});

	test('drops a saved production report with an invalid material movement', () => {
		const game = createGame();
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				produced: [
					{
						cityId: 'industry-city',
						materialId: 'invalid-material' as MaterialId,
						quantity: 10,
						value: 50,
						source: 'local'
					}
				]
			})
		});
		const snapshot = createSnapshotWithGame({ ...game, reports: [report] });

		expectSnapshotHistoricalReportDropped(snapshot);
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

	test('rejects saved city tiles without feature in the current schema', () => {
		expect.assertions(2);
		const game = createGame();
		const snapshot = createSnapshotWithGame({
			...game,
			cities: [
				{
					...game.cities[0]!,
					tiles: game.cities[0]!.tiles.map((tile, index) => {
						if (index !== 0) return tile;
						const { feature: _feature, ...withoutFeature } = tile;
						void _feature;
						return withoutFeature as unknown as GameState['cities'][number]['tiles'][number];
					})
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game cities[0] tiles[0] feature must be null, road, or river'
		);
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
		const game = createGame();
		const snapshot = createSnapshotWithGame({
			...game,
			events: { ...game.events, nextInstanceSequence: 2 },
			decisions: [
				{
					kind: 'event',
					id: 'event-instance-1',
					eventId: 'test-event',
					definitionVersion: 1,
					generatedOnDay: 2,
					expiresOnDay: 4,
					target: { kind: 'company' },
					copy: { key: 'events.test', params: {} },
					options: [
						{
							id: 'option-1',
							effects: [{ kind: 'cash-adjust', amount: 'expensive' as unknown as number }],
							modifiers: []
						}
					]
				}
			] as unknown as GameState['decisions']
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game decisions[0] options[0] effects[0] amount must be a finite number'
		);
	});

	test('drops saved reports with invalid warning arrays', () => {
		const snapshot = createSnapshotWithGame({
			...createGame(),
			reports: [
				createDailyReport({
					warnings: [
						{ code: 'cashReservesLow' },
						{ code: 'unknown-warning' as unknown as DailyReportWarning['code'] }
					] as unknown as DailyReportWarning[]
				})
			]
		});

		expectSnapshotHistoricalReportDropped(snapshot);
	});

	test('drops saved reports with invalid payroll cost', () => {
		const snapshot = createSnapshotWithGame({
			...createGame(),
			reports: [createDailyReport({ payrollCost: 'missing' as unknown as number })]
		});

		expectSnapshotHistoricalReportDropped(snapshot);
	});

	test('drops saved reports with invalid production report totals', () => {
		const snapshot = createSnapshotWithGame({
			...createGame(),
			reports: [
				createDailyReport({
					productionReport: createDailyProductionReport({
						importSpend: Number.NaN
					})
				})
			]
		});

		expectSnapshotHistoricalReportDropped(snapshot);
	});

	test('drops saved product reports missing warehouse unit totals', () => {
		const invalidProductReport = {
			...createDailyProductReport(),
			warehouseUnits: undefined
		} as unknown as DailyProductReport;
		const snapshot = createSnapshotWithGame({
			...createGame(),
			reports: [
				createDailyReport({
					storeReports: [
						createDailyStoreReport({
							productReports: [invalidProductReport]
						})
					]
				})
			]
		});

		expectSnapshotHistoricalReportDropped(snapshot);
	});

	test('drops saved product reports with invalid warehouse value totals', () => {
		const snapshot = createSnapshotWithGame({
			...createGame(),
			reports: [
				createDailyReport({
					storeReports: [
						createDailyStoreReport({
							productReports: [
								createDailyProductReport({
									warehouseValue: Number.NaN
								})
							]
						})
					]
				})
			]
		});

		expectSnapshotHistoricalReportDropped(snapshot);
	});

	test('drops saved store reports with invalid staffing coverage', () => {
		const snapshot = createSnapshotWithGame({
			...createGame(),
			reports: [
				createDailyReport({
					storeReports: [createDailyStoreReport({ staffingCoverage: Number.NaN })]
				})
			]
		});

		expectSnapshotHistoricalReportDropped(snapshot);
	});

	test('drops saved store reports with invalid general staffing shortage', () => {
		const snapshot = createSnapshotWithGame({
			...createGame(),
			reports: [
				createDailyReport({
					storeReports: [
						createDailyStoreReport({
							staffingShortage: { manager: 0, general: 'three' as unknown as number }
						})
					]
				})
			]
		});

		expectSnapshotHistoricalReportDropped(snapshot);
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

	test('accepts a store with a subset of its archetype categories', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260603); // store starts with 1 product, level 1
		const snapshot = createSnapshotWithGame(game);
		expect(() => validateSaveStoreSnapshot(snapshot)).not.toThrow();
	});

	test('rejects a store level outside 1..10', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260603);
		const snapshot = createSnapshotWithGame({
			...game,
			stores: [{ ...game.stores[0]!, level: 99 }]
		});
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
	});

	test('rejects a non-integer store level', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260603);
		const snapshot = createSnapshotWithGame({
			...game,
			stores: [{ ...game.stores[0]!, level: 1.5 }]
		});
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game stores[0] level must be an integer between 1 and 10'
		);
	});

	test('rejects a non-integer industrial building level', () => {
		expect.assertions(2);
		const game = createGame({
			industrialBuildings: [
				{
					id: 'building-1',
					level: 2.7,
					typeId: 'forester' as IndustrialBuildingTypeId,
					cityId: 'industry-city',
					tileId: 'industry-city-0-0',
					mapX: 0,
					mapY: 0,
					status: 'idle',
					lastProduction: [],
					producedTotal: 0,
					importedInputTotal: 0,
					blockedDays: 0,
					inventory: {}
				}
			]
		});
		const snapshot = createSnapshotWithGame(game);

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game industrialBuildings[0] level must be an integer between 1 and 10'
		);
	});

	test('rejects an industrial building level above MAX_BUILDING_LEVEL', () => {
		expect.assertions(2);
		const game = createGame({
			industrialBuildings: [
				{
					id: 'building-1',
					level: 11,
					typeId: 'forester' as IndustrialBuildingTypeId,
					cityId: 'industry-city',
					tileId: 'industry-city-0-0',
					mapX: 0,
					mapY: 0,
					status: 'idle',
					lastProduction: [],
					producedTotal: 0,
					importedInputTotal: 0,
					blockedDays: 0,
					inventory: {}
				}
			]
		});
		const snapshot = createSnapshotWithGame(game);

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game industrialBuildings[0] level must be an integer between 1 and 10'
		);
	});

	test('rejects a save whose level disagrees with its product count (level↔products coupling check)', () => {
		expect.assertions(2);
		// A store claiming level 1 but carrying 4 products is not a valid shape
		// in this codebase, so the current save must be rejected on load.
		const game = createNewGame('convenience', 20260603);
		const baseStore = game.stores[0]!;
		const products: StoreProduct[] = initializeStoreProducts('convenience', 10);
		const mismatchedStore = { ...baseStore, level: 1, products };
		const snapshot = createSnapshotWithGame({
			...game,
			stores: [mismatchedStore]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'products length (4) must equal unlocked product count (1) for level 1'
		);
	});

	test('preserves an explicit industrial building level during validation', () => {
		expect.assertions(1);
		const game = createGame({
			industrialBuildings: [
				{
					id: 'building-1',
					level: 5,
					typeId: 'grain-farm' as IndustrialBuildingTypeId,
					cityId: 'industry-city',
					tileId: 'industry-city-0-0',
					mapX: 0,
					mapY: 0,
					status: 'idle',
					lastProduction: [],
					producedTotal: 0,
					importedInputTotal: 0,
					blockedDays: 0,
					inventory: {}
				}
			]
		});
		const snapshot = createSnapshotWithGame(game);

		const validated = validateSaveStoreSnapshot(snapshot);
		expect(validated.manualSlots[0]!.game.industrialBuildings[0]!.level).toBe(5);
	});
});

describe('repository competitor marker compatibility', () => {
	test('round-trips a store whose footprint contains a rival marker', async () => {
		const base = createNewGame('convenience', 20260820);
		const anchor = findBuildableAnchorContainingCompetitorMarker(base);
		const opened = openStoreAtTile(
			{ ...base, cash: 100_000 },
			{ tileId: anchor.id, archetypeId: 'convenience' }
		);
		const openedStore = opened.stores[opened.stores.length - 1]!;

		expect(opened.stores).toHaveLength(base.stores.length + 1);
		expect(
			opened.competitors.some(
				(competitor) =>
					competitor.cityId === openedStore.cityId &&
					competitor.location.x >= openedStore.mapX &&
					competitor.location.x < openedStore.mapX + 2 &&
					competitor.location.y >= openedStore.mapY &&
					competitor.location.y < openedStore.mapY + 2
			)
		).toBe(true);

		const repository = new SaveRepositoryFromDriver(
			new MemorySaveStoreDriver(),
			() => new Date('2026-08-20T12:00:00.000Z')
		);

		await repository.saveAuto(opened);
		const reloaded = await repository.getAutoSave();

		expect(reloaded?.game.stores).toEqual(opened.stores);
		expect(reloaded?.game.competitors).toEqual(opened.competitors);
	});
});

describe('repository city-inventory normalization', () => {
	test('durably reloads historical replenishment from its original source after reassignment', async () => {
		expect.assertions(6);
		const replenishedFromIndustryCity = simulateDay(createDaySevenReplenishmentFromIndustryCity());
		const reassigned = setRetailSupplySource(
			replenishedFromIndustryCity,
			'harbor-city',
			'breadbasket-basin'
		);
		const repository = new SaveRepositoryFromDriver(
			new MemorySaveStoreDriver(),
			() => new Date('2026-08-03T12:00:00.000Z')
		);

		expect(replenishedFromIndustryCity.reports).toHaveLength(1);
		expect(replenishedFromIndustryCity.reports[0]?.storeReports[0]?.replenishment).toMatchObject({
			retailCityId: 'harbor-city',
			configuredSupplyCityId: 'industry-city',
			resolvedSupplyCityId: 'industry-city'
		});
		expect(reassigned).toMatchObject({ ok: true, changed: true });
		if (!reassigned.ok) return;

		await repository.saveAuto(reassigned.game);
		const reloaded = await repository.getAutoSave();

		expect(reloaded?.game.retailSupplyAssignments).toContainEqual({
			retailCityId: 'harbor-city',
			supplyCityId: 'breadbasket-basin'
		});
		expect(reloaded?.game.reports[0]?.storeReports[0]?.replenishment).toMatchObject({
			retailCityId: 'harbor-city',
			configuredSupplyCityId: 'industry-city',
			resolvedSupplyCityId: 'industry-city'
		});
		expect(reloaded?.game.reports[0]?.storeReports[0]?.productReports[0]).toMatchObject({
			warehouseUnits: 20
		});
	});
});

describe('browser save repository', () => {
	test('uses the current browser storage key', () => {
		expect.assertions(1);

		expect(BROWSER_SAVE_STORAGE_KEY).toBe('serpens.saves.v2');
	});

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
		const secondGame = createCurrentGame({ day: 8, cash: 22000 });

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
		const game = createCurrentGame({ day: 9 });

		const metadata = await repository.saveAuto(game);
		const snapshot = await driver.read();

		expect(metadata.kind).toBe('auto');
		expect(metadata.day).toBe(9);
		expect(snapshot.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(snapshot.autoSave?.game.staff).toEqual([]);
		expect(snapshot.autoSave?.game.hiringCandidates).toEqual([]);
	});

	test('resets a corrupt current-schema snapshot instead of repairing it', async () => {
		expect.assertions(4);
		const record = createManualSaveRecord();
		const { level: _level, ...storeWithoutLevel } = record.game.stores[0]!;
		void _level;
		const driver = new MemorySaveStoreDriver({
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave: null,
			manualSlots: [
				{
					...record,
					game: {
						...record.game,
						stores: [storeWithoutLevel as GameState['stores'][number]]
					}
				}
			]
		} as SaveStoreSnapshot);
		const repository = new SaveRepositoryFromDriver(
			driver,
			() => new Date('2026-05-05T12:00:00.000Z')
		);

		expect(await repository.getSummary()).toEqual({ autoSave: null, manualSlots: [] });
		const metadata = await repository.saveAuto(createGame());
		const persisted = await driver.read();

		expect(metadata.kind).toBe('auto');
		expect(persisted.manualSlots).toEqual([]);
		expect(persisted.autoSave?.game.stores[0]?.level).toBe(1);
	});

	test('does not reset non-save data driver read errors', async () => {
		expect.assertions(2);
		const repository = new SaveRepositoryFromDriver(new NonSaveDataErrorDriver());
		const summaryPromise = repository.getSummary();

		await expect(summaryPromise).rejects.toThrow(TypeError);
		await expect(summaryPromise).rejects.toThrow('Driver is unavailable');
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

	test('uses the current wall-clock time when SaveRepositoryFromDriver is built without a now clock', async () => {
		expect.assertions(3);
		const before = Date.now();
		const repository = new SaveRepositoryFromDriver(new MemorySaveStoreDriver());

		const metadata = await repository.saveAuto(createGame());
		const after = Date.now();

		expect(metadata.kind).toBe('auto');
		expect(Number(new Date(metadata.updatedAt))).toBeGreaterThanOrEqual(before);
		expect(Number(new Date(metadata.updatedAt))).toBeLessThanOrEqual(after);
	});

	test('preserves unrelated manual slots when overwriting one slot among many', async () => {
		expect.assertions(4);
		const repository = createBrowserSaveRepository(
			new FakeStorage(),
			() => new Date('2026-05-05T12:00:00.000Z')
		);

		const first = await repository.createManualSlot('Harbor Run', createGame({ day: 4 }));
		// Use a different name so the second slot gets a distinct base id and
		// is the non-matching entry in the overwrite map (false branch).
		const second = await repository.createManualSlot('Campus Run', createGame({ day: 5 }));
		const overwritten = await repository.overwriteManualSlot(
			first.id,
			'Harbor Run',
			createCurrentGame({ day: 9 })
		);
		const summary = await repository.getSummary();

		expect(overwritten.day).toBe(9);
		expect(summary.manualSlots).toHaveLength(2);
		expect(summary.manualSlots.find((slot) => slot.id === first.id)?.day).toBe(9);
		expect(summary.manualSlots.find((slot) => slot.id === second.id)?.day).toBe(5);
	});

	test('appends a -3 suffix when two duplicate-name slots already exist in the same millisecond', async () => {
		expect.assertions(4);
		const repository = createBrowserSaveRepository(
			new FakeStorage(),
			() => new Date('2026-05-05T12:00:00.000Z')
		);

		const first = await repository.createManualSlot('Harbor Run', createGame({ day: 4 }));
		const second = await repository.createManualSlot('Harbor Run', createGame({ day: 5 }));
		const third = await repository.createManualSlot('Harbor Run', createGame({ day: 6 }));

		expect(first.id).toBe('manual-harbor-run-1777982400000');
		expect(second.id).toBe('manual-harbor-run-1777982400000-2');
		expect(third.id).toBe('manual-harbor-run-1777982400000-3');
		expect((await repository.getSummary()).manualSlots).toHaveLength(3);
	});

	test('uses the current wall-clock time when createBrowserSaveRepository is built without a now clock', async () => {
		expect.assertions(3);
		const before = Date.now();
		const repository = createBrowserSaveRepository(new FakeStorage());

		const metadata = await repository.saveAuto(createGame());
		const after = Date.now();

		expect(metadata.kind).toBe('auto');
		expect(Number(new Date(metadata.updatedAt))).toBeGreaterThanOrEqual(before);
		expect(Number(new Date(metadata.updatedAt))).toBeLessThanOrEqual(after);
	});
});

describe('sparse city-inventory save compatibility', () => {
	test('round-trips a city inventory whose materials omit unrelated catalog keys', async () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260611);
		const sparseInventories = game.cityInventories.map((inventory) =>
			inventory.cityId === 'industry-city'
				? {
						...inventory,
						materials: { grain: 12, snacks: 3 } satisfies Partial<Record<MaterialId, number>>
					}
				: inventory
		);
		const sparseGame = refreshWorldProgress({
			...game,
			cityInventories: sparseInventories
		});

		const repository = new SaveRepositoryFromDriver(
			new MemorySaveStoreDriver(),
			() => new Date('2026-06-11T12:00:00.000Z')
		);

		await repository.saveAuto(sparseGame);
		const loaded = await repository.getAutoSave();

		expect(loaded?.game.cityInventories[0]?.materials).toEqual({ grain: 12, snacks: 3 });
		expect(loaded?.game).not.toHaveProperty('warehouse');
		expect(loaded?.game.cityInventories[0]?.materials['bottled-water']).toBeUndefined();
	});
});
