import { describe, expect, test } from 'vitest';
import { initializeStoreProducts } from '$lib/game/stock';
import { simulateDay } from '$lib/game/simulateDay';
import { createNewGame } from '$lib/game/state';
import { STARTER_STORE_CAP, createInitialWorldProgress } from '$lib/game/world';
import type {
	DailyProductReport,
	DailyProductionReport,
	DailyReport,
	DailyStoreReport,
	GameState,
	IndustrialBuildingTypeId,
	IndustryResourceId,
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

function createSaveRecordWithProducts(products: StoreProduct[]): SaveRecord {
	const game = createNewGame('convenience', 20260508);
	const [store] = game.stores;

	return createSaveRecord(
		{
			...game,
			stores: [
				{
					...store!,
					products
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
		marketPosition: 50,
		productReports: [],
		warnings: ['Low inventory'],
		...overrides
	};
}

function createDailyProductReport(overrides: Partial<DailyProductReport> = {}): DailyProductReport {
	return {
		categoryId: 'snacks',
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
		storeReports: [createDailyStoreReport()],
		warnings: ['Healthy day'],
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

	test('normalizes old save records that do not have world progress or store cap', () => {
		expect.assertions(3);
		const record = createSaveRecord(createGame(), {
			id: 'manual-old-world',
			name: 'Old World Save',
			kind: 'manual',
			updatedAt: new Date('2026-05-30T12:00:00.000Z')
		});
		const oldGame = { ...record.game } as Partial<GameState>;
		delete oldGame.world;
		delete oldGame.storeCap;

		const validated = validateSaveRecord({ ...record, game: oldGame as GameState });

		expect(validated.game.world.openedCityIds).toEqual(['harbor-city', 'industry-city']);
		expect(validated.game.world.revealedCityIds).toEqual(['harbor-city', 'industry-city']);
		expect(validated.game.storeCap).toBe(3);
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
			name: 'non-number store cap',
			game: {
				storeCap: 'three' as unknown as number
			},
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

	test('deduplicates repeated city and milestone ids in saved world progress', () => {
		expect.assertions(3);
		const game = createGame({
			world: {
				revealedCityIds: [
					'harbor-city',
					'industry-city',
					'harbor-city',
					'campus-junction',
					'industry-city'
				],
				openedCityIds: ['harbor-city', 'industry-city', 'harbor-city'],
				claimedMilestoneIds: ['reveal-campus-junction', 'reveal-campus-junction']
			}
		});
		const record = createSaveRecord(game, {
			id: 'manual-dedup',
			name: 'Dedup Save',
			kind: 'manual',
			updatedAt: new Date('2026-05-30T12:00:00.000Z')
		});

		const validated = validateSaveRecord(record);

		expect(validated.game.world.revealedCityIds).toEqual([
			'harbor-city',
			'industry-city',
			'campus-junction'
		]);
		expect(validated.game.world.openedCityIds).toEqual(['harbor-city', 'industry-city']);
		expect(validated.game.world.claimedMilestoneIds).toEqual(['reveal-campus-junction']);
	});

	test('rejects warehouse materials with unknown ids', () => {
		expect.assertions(2);
		const game = createGame({
			warehouse: {
				capacity: 20,
				materials: { snacks: 5, 'bad-material': 1 } as Record<string, number>,
				overflowUnits: 0,
				overflowCost: 0
			}
		});
		const snapshot = createSnapshotWithGame(game);

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game warehouse materials bad-material must be a known material'
		);
	});

	test('rejects negative warehouse material quantities', () => {
		expect.assertions(2);
		const game = createGame({
			warehouse: {
				capacity: 20,
				materials: { snacks: -1 },
				overflowUnits: 0,
				overflowCost: 0
			}
		});
		const snapshot = createSnapshotWithGame(game);

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game warehouse materials snacks must be at least 0'
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
					]
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
					typeId: 'bad-building' as IndustrialBuildingTypeId,
					cityId: 'industry-city',
					tileId: 'industry-city-0-0',
					mapX: 0,
					mapY: 0,
					status: 'idle',
					lastProduction: [],
					producedTotal: 0,
					importedInputTotal: 0,
					blockedDays: 0
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
				product.categoryId === 'apparel'
					? {
							...product,
							stock: 0,
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
			(report) => report.categoryId === 'apparel'
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
				categoryId: '',
				stock: Number.NaN,
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
			name: 'negative stock',
			products: [
				{ categoryId: 'snacks', stock: -1, reorderThreshold: 1, targetStock: 2, sellingPrice: 5 },
				{ categoryId: 'drinks', stock: 10, reorderThreshold: 1, targetStock: 2, sellingPrice: 4 },
				{
					categoryId: 'essentials',
					stock: 10,
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 8
				}
			],
			message: 'Saved game stores[0] products[0] stock must be at least 0'
		},
		{
			name: 'negative reorder threshold',
			products: [
				{ categoryId: 'snacks', stock: 10, reorderThreshold: -1, targetStock: 2, sellingPrice: 5 },
				{ categoryId: 'drinks', stock: 10, reorderThreshold: 1, targetStock: 2, sellingPrice: 4 },
				{
					categoryId: 'essentials',
					stock: 10,
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
				{ categoryId: 'snacks', stock: 10, reorderThreshold: 5, targetStock: 4, sellingPrice: 5 },
				{ categoryId: 'drinks', stock: 10, reorderThreshold: 1, targetStock: 2, sellingPrice: 4 },
				{
					categoryId: 'essentials',
					stock: 10,
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
				{ categoryId: 'snacks', stock: 10, reorderThreshold: 1, targetStock: 2, sellingPrice: 0 },
				{ categoryId: 'drinks', stock: 10, reorderThreshold: 1, targetStock: 2, sellingPrice: 4 },
				{
					categoryId: 'essentials',
					stock: 10,
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
		{
			name: 'duplicate categories',
			products: [
				{ categoryId: 'snacks', stock: 10, reorderThreshold: 1, targetStock: 2, sellingPrice: 5 },
				{ categoryId: 'snacks', stock: 10, reorderThreshold: 1, targetStock: 2, sellingPrice: 5 },
				{
					categoryId: 'essentials',
					stock: 10,
					reorderThreshold: 1,
					targetStock: 2,
					sellingPrice: 8
				}
			],
			message:
				'Saved game stores[0] products[1] categoryId must be unique for archetype convenience'
		},
		{
			name: 'missing category',
			products: [
				{ categoryId: 'snacks', stock: 10, reorderThreshold: 1, targetStock: 2, sellingPrice: 5 },
				{ categoryId: 'drinks', stock: 10, reorderThreshold: 1, targetStock: 2, sellingPrice: 4 }
			],
			message: 'Saved game stores[0] products must include categories: snacks, drinks, essentials'
		},
		{
			name: 'unknown category',
			products: [
				{ categoryId: 'snacks', stock: 10, reorderThreshold: 1, targetStock: 2, sellingPrice: 5 },
				{ categoryId: 'drinks', stock: 10, reorderThreshold: 1, targetStock: 2, sellingPrice: 4 },
				{ categoryId: 'unknown', stock: 10, reorderThreshold: 1, targetStock: 2, sellingPrice: 8 }
			],
			message: 'Saved game stores[0] products[2] categoryId must belong to archetype convenience'
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
					hiredOnDay: 1
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
					hiredOnDay: 1
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game staff[0] assignedStoreId must be a non-empty string'
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
			reports: [createDailyReport({ warnings: ['Healthy day', 5 as unknown as string] })]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game reports[0] warnings[1] must be a non-empty string'
		);
	});

	test('rejects saved reports with invalid payroll cost', () => {
		expect.assertions(2);
		const snapshot = createSnapshotWithGame({
			...createGame(),
			reports: [createDailyReport({ payrollCost: 'missing' as unknown as number })]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game reports[0] payrollCost must be a finite number'
		);
	});

	test('rejects saved reports with invalid production report totals', () => {
		expect.assertions(2);
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

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game reports[0] productionReport importSpend must be a finite number'
		);
	});

	test('rejects saved product reports missing warehouse unit totals', () => {
		expect.assertions(2);
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

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game reports[0] storeReports[0] productReports[0] warehouseUnits must be a finite number'
		);
	});

	test('rejects saved product reports with invalid warehouse value totals', () => {
		expect.assertions(2);
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

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game reports[0] storeReports[0] productReports[0] warehouseValue must be a finite number'
		);
	});

	test('rejects saved store reports with invalid staffing coverage', () => {
		expect.assertions(2);
		const snapshot = createSnapshotWithGame({
			...createGame(),
			reports: [
				createDailyReport({
					storeReports: [createDailyStoreReport({ staffingCoverage: Number.NaN })]
				})
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game reports[0] storeReports[0] staffingCoverage must be a finite number'
		);
	});

	test('rejects saved store reports with invalid general staffing shortage', () => {
		expect.assertions(2);
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

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game reports[0] storeReports[0] staffingShortage general must be a finite number'
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
});
