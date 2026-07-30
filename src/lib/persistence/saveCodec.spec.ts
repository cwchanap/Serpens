import { describe, expect, test, vi } from 'vitest';
import {
	computeStoreLocalDemand,
	DEFAULT_RETAIL_CITY_HEIGHT,
	DEFAULT_RETAIL_CITY_WIDTH,
	generateCity,
	isTileBuildable
} from '$lib/game/city';
import {
	buildIndustrialBuilding,
	getIndustrialPlacementBlockReason
} from '$lib/game/industryPlacement';
import { getWarehouseCapacity, recalculateWarehousePressure } from '$lib/game/industryProduction';
import { formatLocation } from '$lib/game/placement';
import type { DecisionContext } from '$lib/game/decisionContext';
import { simulateDay } from '$lib/game/simulateDay';
import { createFoundingFinanceState } from '$lib/game/finance';
import { createNewGame, resolveDecision } from '$lib/game/state';
import { calculateStockHealth, initializeStoreProducts } from '$lib/game/stock';
import {
	STARTER_STORE_CAP,
	createInitialWorldProgress,
	getWorldCityDefinition,
	refreshWorldProgress
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
	createPlainSnapshot,
	createSaveRecord,
	createSaveSummary,
	migrateSavedGame,
	normalizeSandboxSavedGame,
	parseSaveStoreSnapshot,
	validateCurrentGameState,
	validateSaveRecord,
	validateSaveStoreSnapshot
} from './saveCodec';

function createFixtureRetailCity(): GameState['cities'][number] {
	return {
		id: 'harbor-city',
		name: 'Harbor City',
		width: 3,
		height: 3,
		tiles: Array.from({ length: 9 }, (_, index) => {
			const x = index % 3;
			const y = Math.floor(index / 3);
			return {
				id: `harbor-city-${x}-${y}`,
				cityId: 'harbor-city',
				x,
				y,
				neighborhood: 'downtown',
				terrain: 'commercial',
				feature: null,
				demand: 72,
				rent: 180,
				footTraffic: 66,
				customerFit: 70,
				locked: false
			};
		})
	};
}

function createFixtureIndustryCity(): GameState['industryCities'][number] {
	return {
		id: 'industry-city',
		name: 'Industry City',
		width: 3,
		height: 3,
		tiles: Array.from({ length: 9 }, (_, index) => {
			const x = index % 3;
			const y = Math.floor(index / 3);
			return {
				id: `industry-city-${x}-${y}`,
				cityId: 'industry-city',
				x,
				y,
				terrain: 'industrial',
				resource: null,
				locked: false
			};
		}),
		rails: []
	};
}

function createDeepEnumerableExtra(depth: number): Record<string, unknown> {
	let value: Record<string, unknown> = { leaf: true };
	for (let index = 0; index < depth; index += 1) value = { next: value };
	return value;
}

function createWideEnumerableExtra(nodeCount: number): Record<string, unknown> {
	const extra: Record<string, unknown> = {};
	for (let index = 0; index < nodeCount; index += 1) {
		extra[`n${index}`] = { leaf: true };
	}
	return extra;
}

function createGame(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 20260505,
		rngState: 99,
		day: 3,
		cash: 12500,
		finance: createFoundingFinanceState(3, 2000),
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
		cities: [createFixtureRetailCity()],
		activeCityId: 'harbor-city',
		industryCities: [createFixtureIndustryCity()],
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
				stockHealth: calculateStockHealth(initializeStoreProducts('boutique')),
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

/**
 * Builds a literal v10 payload. Finance and the new report cash-flow fields
 * did not exist in that schema; it instead persisted scalar `debt`.
 */
function createV10Record(input: { debt: number; day?: number; reports?: unknown[] }): SaveRecord {
	const current = createManualSaveRecord({
		game: {
			day: input.day ?? 12,
			cash: 12_345,
			reports: (input.reports ?? [
				createDailyReport({
					day: 11,
					netIncome: 321,
					grossMargin: 700,
					operatingCosts: 250,
					cashAfter: 12_345
				})
			]) as GameState['reports']
		}
	});
	const game = structuredClone(current.game) as unknown as Record<string, unknown>;
	delete game.finance;
	game.debt = input.debt;
	game.reports = (game.reports as Array<Record<string, unknown>>).map((report) => {
		const {
			cashBefore: _cashBefore,
			operatingIncome: _operatingIncome,
			operatingCashFlow: _operatingCashFlow,
			interestAccrued: _interestAccrued,
			interestPaid: _interestPaid,
			interestCapitalized: _interestCapitalized,
			principalBorrowed: _principalBorrowed,
			principalRepaid: _principalRepaid,
			refinancedPrincipal: _refinancedPrincipal,
			financingCashFlow: _financingCashFlow,
			netCashChange: _netCashChange,
			outstandingPrincipalAfter: _outstandingPrincipalAfter,
			nextLoanPayment: _nextLoanPayment,
			...legacy
		} = report;
		void _cashBefore;
		void _operatingIncome;
		void _operatingCashFlow;
		void _interestAccrued;
		void _interestPaid;
		void _interestCapitalized;
		void _principalBorrowed;
		void _principalRepaid;
		void _refinancedPrincipal;
		void _financingCashFlow;
		void _netCashChange;
		void _outstandingPrincipalAfter;
		void _nextLoanPayment;
		return legacy;
	});
	return {
		...current,
		schemaVersion: 10 as unknown as typeof SAVE_SCHEMA_VERSION,
		game: game as unknown as GameState
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
		cashBefore: 0,
		operatingIncome: 0,
		operatingCashFlow: 400,
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

function createValidWarehouseBuildingGame(): GameState {
	const game = { ...createNewGame('convenience', 20260722), cash: 1_000_000 };
	const city = game.industryCities[0]!;
	const tile = city.tiles.find(
		(candidate) => getIndustrialPlacementBlockReason(game, candidate.id, 'warehouse') === null
	)!;
	const built = buildIndustrialBuilding(game, {
		tileId: tile.id,
		buildingTypeId: 'warehouse'
	});
	return {
		...built,
		warehouse: recalculateWarehousePressure({
			...built.warehouse,
			capacity: getWarehouseCapacity(built),
			materials: { ...built.warehouse.materials }
		})
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

function createBareMigrationFixture(sourceVersion: number): unknown {
	const base = createGame({
		industrialBuildings: [createIndustrialBuilding()],
		reports: [createDailyReport({ storeReports: [createDailyStoreReport()] })]
	});
	const game = structuredClone(stripRailFields(base)) as Record<string, unknown>;
	const stores = game.stores as Array<Record<string, unknown>>;
	const reports = game.reports as Array<Record<string, unknown>>;

	if (sourceVersion <= 8) {
		stores[0] = { ...stores[0], location: 'Downtown (1, 1)' };
	}
	if (sourceVersion <= 6) {
		game.decisions = [
			{
				id: 'legacy-decision',
				title: 'Legacy decision',
				context: 'Old free-form context',
				expiresOnDay: 4,
				options: []
			}
		];
	}
	if (sourceVersion <= 5) {
		const report = reports[0]!;
		const storeReports = report.storeReports as Array<Record<string, unknown>>;
		reports[0] = {
			...report,
			warnings: ['Old daily warning'],
			storeReports: [{ ...storeReports[0], warnings: ['Old store warning'] }]
		};
	}
	if (sourceVersion <= 4) {
		const products = stores[0]!.products as Array<Record<string, unknown>>;
		stores[0] = {
			...stores[0],
			products: [{ ...products[0], categoryId: 'accessories' }]
		};
	}

	return game;
}

describe('saveCodec', () => {
	test('migrates a literal v10 scalar debt save into a neutral founding loan and report finance fields', () => {
		expect.assertions(21);
		const record = createV10Record({ debt: 2_000, day: 12 });

		const validated = validateSaveRecord(record);
		const loan = validated.game.finance.loans[0]!;
		const report = validated.game.reports[0]!;
		expect(validated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		expect(validated.game.cash).toBe(12_345);
		expect(validated.game.finance.loans).toHaveLength(1);
		expect(loan).toMatchObject({
			id: 'loan-1',
			purpose: 'founding',
			status: 'active',
			openedOnDay: 12,
			originalPrincipal: 2_000,
			remainingPrincipal: 2_000,
			nextPaymentDay: 19,
			lastInterestAccrualDay: 12,
			accruedInterestMicros: 0,
			overdueInterest: 0,
			overduePrincipal: 0,
			arrearsSinceDay: null,
			installmentsProcessed: 0,
			scheduledPaymentCount: 0,
			onTimePaymentCount: 0,
			missedPaymentCount: 0
		});
		expect(validated.game.finance.transactions).toEqual([]);
		expect(validated.game.finance.nextLoanSequence).toBe(2);
		expect(validated.game.finance.nextTransactionSequence).toBe(1);
		expect(validated.game.finance.currentDayActivity).toEqual({
			day: 12,
			principalBorrowed: 0,
			principalRepaid: 0,
			interestPaid: 0,
			interestCapitalized: 0,
			refinancedPrincipal: 0,
			financingCashFlow: 0
		});
		expect(report.cashBefore).toBe(12_024);
		expect(report.operatingIncome).toBe(450);
		expect(report.operatingCashFlow).toBe(321);
		expect(report.interestAccrued).toBe(0);
		expect(report.interestPaid).toBe(0);
		expect(report.interestCapitalized).toBe(0);
		expect(report.principalBorrowed).toBe(0);
		expect(report.principalRepaid).toBe(0);
		expect(report.refinancedPrincipal).toBe(0);
		expect(report.financingCashFlow).toBe(0);
		expect(report.netCashChange).toBe(321);
		expect(report.outstandingPrincipalAfter).toBe(2_000);
		expect(report.nextLoanPayment).toBeNull();
	});

	test('migrates a literal v10 zero debt save to empty finance while retaining cash and report history', () => {
		expect.assertions(6);
		const validated = validateSaveRecord(createV10Record({ debt: 0, day: 12 }));
		const report = validated.game.reports[0]!;
		expect(validated.game.cash).toBe(12_345);
		expect(validated.game.finance.loans).toEqual([]);
		expect(validated.game.finance.nextLoanSequence).toBe(1);
		expect(validated.game.finance.currentDayActivity.day).toBe(12);
		expect(report.outstandingPrincipalAfter).toBe(0);
		expect(report.nextLoanPayment).toBeNull();
	});

	test('rejects an outstanding loan whose scheduled payment is already in the past', () => {
		expect.assertions(1);
		const game = createGame();
		const record = createManualSaveRecord({
			metadata: { day: 11 },
			game: {
				day: 11,
				finance: {
					...game.finance,
					currentDayActivity: { ...game.finance.currentDayActivity, day: 11 }
				}
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('round-trips an outstanding loan whose scheduled payment is due today', () => {
		expect.assertions(2);
		const game = createGame();
		const record = createManualSaveRecord({
			metadata: { day: 10 },
			game: {
				day: 10,
				finance: {
					...game.finance,
					currentDayActivity: { ...game.finance.currentDayActivity, day: 10 }
				}
			}
		});

		const validated = validateSaveRecord(record);

		expect(validated.game.finance.loans[0]?.nextPaymentDay).toBe(10);
		expect(validateSaveRecord(structuredClone(validated))).toEqual(validated);
	});

	test.each([4, 5, 6, 7, 8, 9])(
		'v%s record migration continues through rail and finance schema steps',
		(sourceVersion) => {
			const base = createV10Record({ debt: 500, day: 12 });
			const record = {
				...base,
				schemaVersion: sourceVersion as unknown as typeof SAVE_SCHEMA_VERSION
			};
			const validated = validateSaveRecord(record);
			expect(validated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
			expect(validated.game.finance.loans[0]?.remainingPrincipal).toBe(500);
			expect(validated.game.industryCities[0]?.rails).toEqual([]);
		}
	);

	test.each([
		['negative sequence', (game: GameState) => ({ ...game.finance, nextLoanSequence: -1 })],
		[
			'fractional sequence',
			(game: GameState) => ({ ...game.finance, nextTransactionSequence: 1.5 })
		],
		[
			'duplicate loan ids',
			(game: GameState) => ({
				...game.finance,
				loans: [game.finance.loans[0]!, game.finance.loans[0]!]
			})
		],
		[
			'unsupported loan purpose',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, purpose: 'bad' }]
			})
		],
		[
			'unsupported loan status',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, status: 'bad' }]
			})
		],
		[
			'unsupported term',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, termDays: 7 }]
			})
		],
		[
			'too many installments',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, installmentsProcessed: 13 }]
			})
		],
		[
			'arrears exceeding remaining principal',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, overduePrincipal: 2_001 }]
			})
		],
		[
			'paid balance',
			(game: GameState) => ({
				...game.finance,
				loans: [
					{ ...game.finance.loans[0]!, status: 'paid', nextPaymentDay: null, remainingPrincipal: 1 }
				]
			})
		],
		[
			'active arrears',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, overdueInterest: 1 }]
			})
		],
		[
			'delinquent without arrears',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, status: 'delinquent', arrearsSinceDay: 3 }]
			})
		],
		[
			'contradictory next payment',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, nextPaymentDay: 99 }]
			})
		],
		[
			'activity day mismatch',
			(game: GameState) => ({
				...game.finance,
				currentDayActivity: { ...game.finance.currentDayActivity, day: 999 }
			})
		],
		[
			'non-reconciling financing cash flow',
			(game: GameState) => ({
				...game.finance,
				currentDayActivity: { ...game.finance.currentDayActivity, financingCashFlow: 1 }
			})
		]
	] as const)('rejects finance corruption: %s', (_name, mutate) => {
		const game = createGame();
		const record = createManualSaveRecord({
			game: { finance: mutate(game) as GameState['finance'] }
		});
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('rejects finance transaction links, ordering, and report finance corruption', () => {
		expect.assertions(5);
		const game = createGame();
		const transaction = {
			id: 'finance-transaction-1',
			day: 3,
			kind: 'disbursement' as const,
			loanId: 'unknown',
			cashDelta: 1,
			principalAmount: 1,
			principalDelta: 1,
			interestAmount: 0
		};
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: { finance: { ...game.finance, transactions: [transaction] } }
				})
			)
		).toThrow(SaveDataError);
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: {
						finance: {
							...game.finance,
							transactions: Array.from({ length: 201 }, (_, index) => ({
								...transaction,
								id: `finance-transaction-${index + 1}`,
								loanId: 'loan-1',
								day: index + 1
							}))
						}
					}
				})
			)
		).toThrow(SaveDataError);
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: { reports: [{ ...createDailyReport(), interestAccrued: -0.1 }] }
				})
			)
		).toThrow(SaveDataError);
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: { reports: [{ ...createDailyReport(), operatingCashFlow: Number.NaN }] }
				})
			)
		).toThrow(SaveDataError);
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: { reports: [{ ...createDailyReport(), interestAccrued: 0.125 }] }
				})
			)
		).not.toThrow();
	});

	test('rejects closed/refinance relationship corruption and out-of-order transaction history', () => {
		expect.assertions(4);
		const game = createGame();
		const source = {
			...game.finance.loans[0]!,
			status: 'refinanced' as const,
			remainingPrincipal: 0,
			nextPaymentDay: null,
			refinancedByLoanId: 'loan-2'
		};
		const replacement = {
			...game.finance.loans[0]!,
			id: 'loan-2',
			purpose: 'refinance' as const,
			refinancedFromLoanId: 'loan-1'
		};
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: {
						finance: {
							...game.finance,
							nextLoanSequence: 3,
							loans: [source, { ...replacement, refinancedFromLoanId: 'missing' }]
						}
					}
				})
			)
		).toThrow(SaveDataError);
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: {
						finance: { ...game.finance, loans: [{ ...source, refinancedByLoanId: undefined }] }
					}
				})
			)
		).toThrow(SaveDataError);
		const transaction = (day: number, id: string) => ({
			id,
			day,
			kind: 'disbursement' as const,
			loanId: 'loan-1',
			cashDelta: 1,
			principalAmount: 1,
			principalDelta: 1,
			interestAmount: 0
		});
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: {
						finance: {
							...game.finance,
							nextTransactionSequence: 3,
							transactions: [
								transaction(3, 'finance-transaction-1'),
								transaction(2, 'finance-transaction-2')
							]
						}
					}
				})
			)
		).toThrow(SaveDataError);
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: {
						finance: {
							...game.finance,
							currentDayActivity: { ...game.finance.currentDayActivity, principalBorrowed: 1.5 }
						}
					}
				})
			)
		).toThrow(SaveDataError);
	});

	test('rejects loan field-range corruption', () => {
		expect.assertions(9);
		const game = createGame();
		const baseLoan = game.finance.loans[0]!;
		const expectLoanCorruption = (loan: Partial<GameState['finance']['loans'][number]>) =>
			expect(() =>
				validateSaveRecord(
					createManualSaveRecord({
						game: { finance: { ...game.finance, loans: [{ ...baseLoan, ...loan }] } }
					})
				)
			).toThrow(SaveDataError);

		expectLoanCorruption({ openedOnDay: 99 });
		expectLoanCorruption({ originalPrincipal: 0 });
		expectLoanCorruption({ remainingPrincipal: baseLoan.originalPrincipal + 1 });
		expectLoanCorruption({ lastInterestAccrualDay: 99 });
		expectLoanCorruption({ lastInterestAccrualDay: 0 });
		expectLoanCorruption({
			status: 'delinquent',
			arrearsSinceDay: 99,
			overduePrincipal: 1,
			overdueInterest: 1
		});
		expectLoanCorruption({
			status: 'delinquent',
			arrearsSinceDay: 0,
			overduePrincipal: 1,
			overdueInterest: 1
		});
		expectLoanCorruption({
			purpose: 'refinance',
			refinancedFromLoanId: undefined
		});
		expectLoanCorruption({
			purpose: 'refinance',
			refinancedFromLoanId: 'loan-99'
		});
	});

	test('round-trips more than the finance transaction limit of lifetime loans', () => {
		// Loans are append-only and closed instruments are retained for lifetime
		// repayment history, so the loan collection must not be capped by the
		// transaction limit. A save with >200 paid loans must validate and
		// round-trip without loss.
		expect.assertions(3);
		const game = createGame();
		const baseLoan = game.finance.loans[0]!;
		const loans = Array.from({ length: 205 }, (_, index) => ({
			...baseLoan,
			id: `loan-${index + 1}`,
			openedOnDay: 1,
			nextPaymentDay: null,
			lastInterestAccrualDay: 1,
			status: 'paid' as const,
			remainingPrincipal: 0,
			originalPrincipal: 1,
			installmentsProcessed: 4,
			scheduledPaymentCount: 4,
			onTimePaymentCount: 4,
			missedPaymentCount: 0
		}));
		const record = createManualSaveRecord({
			game: {
				finance: { ...game.finance, nextLoanSequence: 206, loans }
			}
		});

		const validated = validateSaveRecord(record);
		expect(validated.game.finance.loans).toHaveLength(205);

		const revalidated = validateSaveRecord(structuredClone(validated));
		expect(revalidated.game.finance.loans).toHaveLength(205);
		expect(revalidated).toEqual(validated);
	});

	test('rejects a transaction whose relatedLoanId references an unknown loan', () => {
		expect.assertions(1);
		const game = createGame();
		const transaction = {
			id: 'finance-transaction-1',
			day: 3,
			kind: 'refinance' as const,
			loanId: 'loan-1',
			relatedLoanId: 'loan-99',
			cashDelta: 0,
			principalAmount: 1,
			principalDelta: 1,
			interestAmount: 0
		};
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: { finance: { ...game.finance, transactions: [transaction] } }
				})
			)
		).toThrow(SaveDataError);
	});

	test('rejects a transaction with a non-integer cash delta', () => {
		expect.assertions(1);
		const game = createGame();
		const transaction = {
			id: 'finance-transaction-1',
			day: 3,
			kind: 'disbursement' as const,
			loanId: 'loan-1',
			cashDelta: 1.5,
			principalAmount: 1,
			principalDelta: 1,
			interestAmount: 0
		};
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: { finance: { ...game.finance, transactions: [transaction] } }
				})
			)
		).toThrow(SaveDataError);
	});

	test('rejects a v10 record whose legacy report lacks numeric cash fields', () => {
		expect.assertions(1);
		const record = createV10Record({
			debt: 500,
			day: 12,
			reports: [
				{
					day: 11,
					cashAfter: 'not-a-number',
					netIncome: 321,
					grossMargin: 700,
					operatingCosts: 250
				}
			] as unknown as GameState['reports']
		});
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('rejects two-node and three-node refinance cycles while accepting a linear chain', () => {
		expect.assertions(3);
		const game = createGame();
		const base = game.finance.loans[0]!;
		const closed = (id: string, from: string, by: string) => ({
			...base,
			id,
			purpose: 'refinance' as const,
			status: 'refinanced' as const,
			remainingPrincipal: 0,
			nextPaymentDay: null,
			refinancedFromLoanId: from,
			refinancedByLoanId: by
		});
		const active = {
			...base,
			id: 'loan-3',
			purpose: 'refinance' as const,
			refinancedFromLoanId: 'loan-2'
		};
		const source = {
			...base,
			status: 'refinanced' as const,
			remainingPrincipal: 0,
			nextPaymentDay: null,
			refinancedByLoanId: 'loan-2'
		};
		const record = (loans: GameState['finance']['loans']) =>
			createManualSaveRecord({
				game: { finance: { ...game.finance, nextLoanSequence: 4, loans } }
			});

		expect(() =>
			validateSaveRecord(
				record([closed('loan-1', 'loan-2', 'loan-2'), closed('loan-2', 'loan-1', 'loan-1')])
			)
		).toThrow(SaveDataError);
		expect(() =>
			validateSaveRecord(
				record([
					closed('loan-1', 'loan-3', 'loan-2'),
					closed('loan-2', 'loan-1', 'loan-3'),
					closed('loan-3', 'loan-2', 'loan-1')
				])
			)
		).toThrow(SaveDataError);
		expect(() =>
			validateSaveRecord(record([source, closed('loan-2', 'loan-1', 'loan-3'), active]))
		).not.toThrow();
	});

	test('rejects refinance links whose endpoint status or purpose is inconsistent', () => {
		// Symmetry alone does not validate refinance semantics. A replacement
		// link is only valid on a refinanced-status source, and a source link is
		// only valid on a refinance-purpose replacement. Both directions must be
		// enforced so an active source and an ordinary replacement cannot form a
		// symmetric graph while both remain outstanding.
		expect.assertions(2);
		const game = createGame();
		const base = game.finance.loans[0]!;
		const replacement = {
			...base,
			id: 'loan-2',
			purpose: 'refinance' as const,
			refinancedFromLoanId: 'loan-1'
		};
		const record = (loans: GameState['finance']['loans']) =>
			createManualSaveRecord({
				game: { finance: { ...game.finance, nextLoanSequence: 3, loans } }
			});

		// Active source carrying a replacement link: status is 'active', not
		// 'refinanced', so the link is invalid even though the replacement points
		// back symmetrically.
		expect(() =>
			validateSaveRecord(
				record([{ ...base, status: 'active' as const, refinancedByLoanId: 'loan-2' }, replacement])
			)
		).toThrow(SaveDataError);

		// Non-refinance replacement carrying a source link: purpose is 'expansion',
		// not 'refinance', so the link is invalid even though the source points
		// back symmetrically.
		expect(() =>
			validateSaveRecord(
				record([
					{
						...base,
						status: 'refinanced' as const,
						remainingPrincipal: 0,
						nextPaymentDay: null,
						refinancedByLoanId: 'loan-2'
					},
					{ ...replacement, purpose: 'expansion' as const }
				])
			)
		).toThrow(SaveDataError);
	});

	test.each([-1, 1.5, 4])('rejects a report day outside the loaded game timeline: %s', (day) => {
		const record = createManualSaveRecord({
			game: { reports: [createDailyReport({ day })] }
		});
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test.each([
		'cashBefore',
		'operatingIncome',
		'operatingCashFlow',
		'interestAccrued',
		'interestPaid',
		'interestCapitalized',
		'principalBorrowed',
		'principalRepaid',
		'refinancedPrincipal',
		'financingCashFlow',
		'netCashChange',
		'outstandingPrincipalAfter',
		'nextLoanPayment'
	] as const)('rejects a current report missing %s', (field) => {
		const report = { ...createDailyReport() } as Record<string, unknown>;
		delete report[field];
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({ game: { reports: [report as unknown as DailyReport] } })
			)
		).toThrow(SaveDataError);
	});
	test.each([4, 5, 6, 7, 8, 9])(
		'migrateSavedGame runs the complete v%s-to-v10 game chain without skipping a step',
		(sourceVersion) => {
			const migrated = migrateSavedGame(
				createBareMigrationFixture(sourceVersion),
				sourceVersion
			) as GameState;

			expect(migrated.industryCities[0]?.rails).toEqual([]);
			expect(migrated.industrialBuildings[0]?.inventory).toEqual({});
			expect(migrated.reports[0]?.productionReport.railShipments).toEqual([]);
			expect(migrated.reports[0]?.productionReport.railUsage).toEqual({});
			if (sourceVersion <= 8) {
				expect(migrated.stores[0]?.location).toEqual({
					neighborhoodId: 'downtown',
					x: 1,
					y: 1
				});
			}
			if (sourceVersion <= 6) {
				expect(migrated.decisions).toEqual([]);
			}
			if (sourceVersion <= 5) {
				expect(migrated.reports[0]?.warnings).toEqual([]);
				expect(migrated.reports[0]?.storeReports[0]?.warnings).toEqual([]);
			}
			if (sourceVersion <= 4) {
				expect(migrated.stores[0]?.products[0]?.categoryId).toBe('fashion-accessories');
			}
		}
	);

	test.each([3, 12])('migrateSavedGame rejects unsupported source schema %s', (schemaVersion) => {
		expect(() => migrateSavedGame(createGame(), schemaVersion)).toThrow(SaveDataError);
		expect(() => migrateSavedGame(createGame(), schemaVersion)).toThrow(
			`Unsupported save schema version: ${schemaVersion}`
		);
	});

	test('migrateSavedGame returns an exact plain clone for a current-schema game', () => {
		const game = createGame();
		const migrated = migrateSavedGame(game, SAVE_SCHEMA_VERSION);

		expect(migrated).toStrictEqual(game);
		expect(migrated).not.toBe(game);
	});

	test('strict current-game validation returns an exact deep clone without mutating its input', () => {
		const game = createGame();
		const before = structuredClone(game);

		const validated = validateCurrentGameState(game);

		expect(validated).toEqual(game);
		expect(validated).not.toBe(game);
		expect(validated.world).not.toBe(game.world);
		expect(game).toEqual(before);
	});

	test('round-trips a zero-dollar checkpoint while rejecting counters beyond processed installments', () => {
		const game = createGame({
			day: 10,
			finance: {
				...createFoundingFinanceState(3, 1),
				currentDayActivity: {
					...createFoundingFinanceState(3, 1).currentDayActivity,
					day: 10
				},
				loans: [
					{
						...createFoundingFinanceState(3, 1).loans[0]!,
						installmentsProcessed: 1,
						nextPaymentDay: 17,
						lastInterestAccrualDay: 10,
						accruedInterestMicros: 2_303
					}
				]
			}
		});
		const record = createManualSaveRecord({ game });

		const validated = validateSaveRecord(record);
		expect(validated.game.finance.loans[0]).toMatchObject({
			originalPrincipal: 1,
			termDays: 84,
			installmentsProcessed: 1,
			scheduledPaymentCount: 0,
			onTimePaymentCount: 0,
			missedPaymentCount: 0
		});
		expect(() =>
			validateSaveRecord({
				...record,
				game: {
					...record.game,
					finance: {
						...record.game.finance,
						loans: [
							{
								...record.game.finance.loans[0]!,
								scheduledPaymentCount: 2,
								onTimePaymentCount: 2
							}
						]
					}
				}
			})
		).toThrow(SaveDataError);
	});

	test.each([
		['fractional original principal', 'originalPrincipal', 1.5],
		['negative remaining principal', 'remainingPrincipal', -1],
		['fractional overdue principal', 'overduePrincipal', 2.5],
		['negative accrued interest micros', 'accruedInterestMicros', -1]
	] as const)('strict validation rejects $0 in saved finance', (_name, field, value) => {
		const game = createGame();
		const loan = game.finance.loans[0]!;
		const finance = {
			...game.finance,
			loans: [{ ...loan, [field]: value }]
		};

		expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
	});

	test.each([
		['a non-string refinanced-from link', { refinancedFromLoanId: 1 }],
		['a non-string refinanced-by link', { refinancedByLoanId: null }]
	] as const)('strict validation rejects $0', (_name, patch) => {
		const game = createGame();
		const loan = game.finance.loans[0]!;
		const finance = { ...game.finance, loans: [{ ...loan, ...patch }] };

		expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
	});

	test('strict validation rejects a non-string related-loan link', () => {
		const game = createGame();
		const finance = {
			...game.finance,
			transactions: [
				{
					id: 'finance-transaction-1',
					day: 3,
					kind: 'disbursement' as const,
					loanId: 'loan-1',
					relatedLoanId: 1,
					cashDelta: 0,
					principalAmount: 0,
					principalDelta: 0,
					interestAmount: 0
				}
			]
		};

		expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
	});

	test('strict validation rejects duplicate loan IDs', () => {
		const game = createGame();
		const loan = game.finance.loans[0]!;
		const finance = {
			...game.finance,
			loans: [loan, { ...loan }]
		};

		expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
	});

	test('strict validation rejects duplicate transaction IDs', () => {
		const game = createGame();
		const transaction = {
			id: 'finance-transaction-1',
			day: 3,
			kind: 'disbursement' as const,
			loanId: 'loan-1',
			cashDelta: 0,
			principalAmount: 0,
			principalDelta: 0,
			interestAmount: 0
		};
		const finance = {
			...game.finance,
			transactions: [transaction, { ...transaction }]
		};

		expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
	});

	test.each([
		['loan', { nextLoanSequence: 1 }],
		[
			'transaction',
			{
				nextTransactionSequence: 1,
				transactions: [
					{
						id: 'finance-transaction-1',
						day: 3,
						kind: 'disbursement' as const,
						loanId: 'loan-1',
						cashDelta: 0,
						principalAmount: 0,
						principalDelta: 0,
						interestAmount: 0
					}
				]
			}
		]
	] as const)('strict validation rejects a reused $0 sequence', (_name, patch) => {
		const game = createGame();
		const finance = { ...game.finance, ...patch };

		expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
	});

	test.each([
		['loan', { nextLoanSequence: Number.MAX_SAFE_INTEGER + 1 }],
		['transaction', { nextTransactionSequence: Number.MAX_SAFE_INTEGER + 1 }]
	] as const)('strict validation rejects an unsafe $0 sequence', (_name, patch) => {
		const game = createGame();
		const finance = { ...game.finance, ...patch };

		expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
	});

	test.each([
		['loan', { nextLoanSequence: Number.MAX_SAFE_INTEGER }],
		['transaction', { nextTransactionSequence: Number.MAX_SAFE_INTEGER }]
	] as const)(
		'strict validation rejects a $0 sequence that cannot advance safely',
		(_name, patch) => {
			const game = createGame();
			const finance = { ...game.finance, ...patch };

			expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
		}
	);

	test.each([
		['loan', 'loan-01'],
		['loan', 'loan-9007199254740992'],
		['transaction', 'finance-transaction-01'],
		['transaction', 'finance-transaction-9007199254740992']
	] as const)(
		'strict validation does not consume a sequence for non-emitted $0 ID %s',
		(kind, id) => {
			const game = createGame();
			const finance =
				kind === 'loan'
					? {
							...game.finance,
							nextLoanSequence: 1,
							loans: [{ ...game.finance.loans[0]!, id }]
						}
					: {
							...game.finance,
							nextTransactionSequence: 1,
							transactions: [
								{
									id,
									day: 3,
									kind: 'disbursement' as const,
									loanId: 'loan-1',
									cashDelta: 0,
									principalAmount: 0,
									principalDelta: 0,
									interestAmount: 0
								}
							]
						};

			expect(validateCurrentGameState({ ...game, finance })).toEqual({ ...game, finance });
		}
	);

	test('strict validation rejects a game inherited through its prototype', () => {
		const inherited = Object.create(createGame()) as GameState;

		expect(() => validateCurrentGameState(inherited)).toThrow(SaveDataError);
		expect(() => validateCurrentGameState(inherited)).toThrow(
			'Saved game must be a plain record with own data properties'
		);
	});

	test.each([
		{ name: 'function', value: () => true },
		{ name: 'symbol', value: Symbol('uncloneable') }
	])('strict validation wraps a structured-clone failure for a $name extra', ({ value }) => {
		const game = Object.assign(createGame(), { uncloneable: value });

		expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
		expect(() => validateCurrentGameState(game)).toThrow(
			'Saved game must contain only structured-cloneable own data properties'
		);
	});

	test.each(['index', 'property'] as const)(
		'strict validation rejects an accessor-backed array $arrayCase without invoking it',
		(arrayCase) => {
			const game = createGame();
			const stores = [...game.stores];
			let invoked = false;
			Object.defineProperty(stores, arrayCase === 'index' ? '0' : 'trap', {
				enumerable: true,
				configurable: true,
				get() {
					invoked = true;
					throw new Error('array getter must not run');
				}
			});

			expect(() => validateCurrentGameState({ ...game, stores })).toThrow(SaveDataError);
			expect(invoked).toBe(false);
		}
	);

	test.each(['products', 'product-index', 'product-field'] as const)(
		'sandbox validation rejects a nested accessor-backed $accessorCase without invoking it',
		(accessorCase) => {
			const record = createManualSaveRecord();
			const store = { ...record.game.stores[0]! };
			let invoked = false;
			if (accessorCase === 'products') {
				Object.defineProperty(store, 'products', {
					enumerable: true,
					configurable: true,
					get() {
						invoked = true;
						throw new Error('products getter must not run');
					}
				});
			} else if (accessorCase === 'product-index') {
				const products = [...store.products];
				Object.defineProperty(products, '0', {
					enumerable: true,
					configurable: true,
					get() {
						invoked = true;
						throw new Error('product getter must not run');
					}
				});
				store.products = products;
			} else {
				const product = { ...store.products[0]! };
				Object.defineProperty(product, 'sellingPrice', {
					enumerable: true,
					configurable: true,
					get() {
						invoked = true;
						throw new Error('product field getter must not run');
					}
				});
				store.products = [product, ...store.products.slice(1)];
			}
			record.game = { ...record.game, stores: [store] };

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(invoked).toBe(false);
		}
	);

	test.each(['required-cash', 'hidden-extra', 'symbol-extra'] as const)(
		'strict validation rejects an own-property clone-loss case: $propertyCase',
		(propertyCase) => {
			const game = createGame() as GameState & Record<PropertyKey, unknown>;
			if (propertyCase === 'required-cash') {
				Object.defineProperty(game, 'cash', { value: game.cash, enumerable: false });
			} else if (propertyCase === 'hidden-extra') {
				Object.defineProperty(game, 'hiddenExtra', { value: 42, enumerable: false });
			} else {
				game[Symbol('extra')] = 42;
			}

			expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
			expect(() => validateCurrentGameState(game)).toThrow(/own enumerable string-keyed data/);
		}
	);

	test.each(['strict', 'sandbox'] as const)(
		'$boundary validation rejects a sparse nested city tile array as SaveDataError',
		(boundary) => {
			const game = createGame();
			const city = structuredClone(game.cities[0]!);
			delete city.tiles[0];
			const changed = { ...game, cities: [city] };

			const validate = () =>
				boundary === 'strict'
					? validateCurrentGameState(changed)
					: validateSaveRecord(createManualSaveRecord({ game: changed }));
			expect(validate).toThrow(SaveDataError);
			expect(validate).toThrow(/dense array/);
		}
	);

	test.each(['stores', 'staff', 'decisions', 'reports'] as const)(
		'strict and sandbox validation reject a sparse $field array',
		(field) => {
			const sparse = new Array(1) as unknown[];
			const game = { ...createGame(), [field]: sparse } as unknown as GameState;

			expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(createManualSaveRecord({ game }))).toThrow(SaveDataError);
		}
	);

	test('snapshot validation rejects sparse manualSlots as SaveDataError', () => {
		const snapshot = {
			...createSnapshotWithGame(createGame()),
			manualSlots: new Array(1)
		} as SaveStoreSnapshot;

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(/dense array/);
	});

	test.each(['strict', 'record', 'migration'] as const)(
		'$boundary boundary maps a proxy get trap to SaveDataError without invoking it',
		(boundary) => {
			const target = boundary === 'record' ? createManualSaveRecord() : (createGame() as unknown);
			let invoked = false;
			const proxy = new Proxy(target as object, {
				get() {
					invoked = true;
					throw new Error('authored proxy get trap must not run');
				}
			});

			const validate = () => {
				if (boundary === 'strict') return validateCurrentGameState(proxy);
				if (boundary === 'record') return validateSaveRecord(proxy);
				return migrateSavedGame(proxy, SAVE_SCHEMA_VERSION);
			};
			expect(validate).toThrow(SaveDataError);
			expect(invoked).toBe(false);
		}
	);

	test('v4 migration maps malformed category coercion to SaveDataError', () => {
		const game = createGame();
		const malformedCategory = { valueOf: {}, toString: {} };
		game.stores = [
			{
				...game.stores[0]!,
				products: [
					{
						...game.stores[0]!.products[0]!,
						categoryId: malformedCategory as unknown as string
					}
				]
			}
		];

		expect(() => migrateSavedGame(game, 4)).toThrow(SaveDataError);
	});

	test.each(['normalize-cash', 'record-report', 'snapshot-warehouse'] as const)(
		'$case maps structured-cloneable scalar coercion data to SaveDataError',
		(testCase) => {
			const malformed = { valueOf: {}, toString: {} };
			const validate = () => {
				if (testCase === 'normalize-cash') {
					return normalizeSandboxSavedGame({ ...createGame(), cash: malformed });
				}
				if (testCase === 'record-report') {
					const report = {
						...createDailyReport(),
						netIncome: malformed as unknown as number
					};
					return validateSaveRecord(createManualSaveRecord({ game: { reports: [report] } }));
				}
				const game = createGame({
					warehouse: {
						capacity: 0,
						materials: { water: malformed as unknown as number },
						overflowUnits: 0,
						overflowCost: 0
					}
				});
				return validateSaveStoreSnapshot(createSnapshotWithGame(game));
			};

			expect(validate).toThrow(SaveDataError);
		}
	);

	test.each(['strict', 'snapshot'] as const)(
		'$boundary boundary rejects a 20,000-deep enumerable extra as SaveDataError',
		(boundary) => {
			const deepExtra = createDeepEnumerableExtra(20_000);
			const validate = () =>
				boundary === 'strict'
					? validateCurrentGameState(Object.assign(createGame(), { deepExtra }))
					: validateSaveStoreSnapshot(
							Object.assign(createSnapshotWithGame(createGame()), { deepExtra })
						);

			expect(validate).toThrow(SaveDataError);
			expect(validate).toThrow(/depth|budget/);
		}
	);

	test('snapshot validation preserves enumerable cloneable own extras exactly', () => {
		const snapshot = Object.assign(createSnapshotWithGame(createGame()), {
			undefinedExtra: undefined,
			negativeZeroExtra: -0,
			nestedExtra: { value: 42 }
		});

		const validated = validateSaveStoreSnapshot(snapshot) as SaveStoreSnapshot & {
			undefinedExtra?: unknown;
			negativeZeroExtra: number;
			nestedExtra: { value: number };
		};

		expect(Object.hasOwn(validated, 'undefinedExtra')).toBe(true);
		expect(validated.undefinedExtra).toBeUndefined();
		expect(Object.is(validated.negativeZeroExtra, -0)).toBe(true);
		expect(validated.nestedExtra).toEqual({ value: 42 });
		expect(validated.nestedExtra).not.toBe(snapshot.nestedExtra);
	});

	test.each(['function', 'toJSON', 'symbol'] as const)(
		'snapshot validation rejects an uncloneable $kind extra without invoking it',
		(kind) => {
			let invoked = false;
			const callable = () => {
				invoked = true;
			};
			const snapshot = Object.assign(createSnapshotWithGame(createGame()), {
				[kind === 'toJSON' ? 'toJSON' : 'uncloneable']:
					kind === 'symbol' ? Symbol('uncloneable') : callable
			});

			expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
			expect(invoked).toBe(false);
		}
	);

	test('strict validation accepts a successful warehouse construction transition', () => {
		const game = { ...createNewGame('convenience', 20260722), cash: 1_000_000 };
		const city = game.industryCities[0]!;
		const tile = city.tiles.find(
			(candidate) => getIndustrialPlacementBlockReason(game, candidate.id, 'warehouse') === null
		)!;

		const built = buildIndustrialBuilding(game, {
			tileId: tile.id,
			buildingTypeId: 'warehouse'
		});

		expect(built.industrialBuildings.at(-1)?.typeId).toBe('warehouse');
		expect(validateCurrentGameState(built)).toEqual(built);
	});

	test('strict validation accepts a cash-changing decision transition that unlocks world progress', () => {
		const simulated = simulateDay(createNewGame('convenience', 20260722));
		const game: GameState = {
			...simulated,
			cash: -1,
			world: {
				revealedCityIds: simulated.world.revealedCityIds.filter(
					(cityId) => cityId !== 'garden-borough'
				),
				openedCityIds: [...simulated.world.openedCityIds],
				claimedMilestoneIds: simulated.world.claimedMilestoneIds.filter(
					(milestoneId) => milestoneId !== 'reveal-garden-borough'
				)
			},
			decisions: [
				{
					id: 'cash-recovery',
					title: 'Cash recovery',
					context: { code: 'cashPressure' },
					expiresOnDay: simulated.day + 1,
					options: [
						{
							id: 'accept',
							label: 'Accept',
							description: 'Receive cash',
							effects: { cash: 100 }
						}
					]
				}
			]
		};
		expect(refreshWorldProgress(game)).toBe(game);

		const resolved = resolveDecision(game, 'cash-recovery', 'accept');

		expect(resolved.world.revealedCityIds).toContain('garden-borough');
		expect(validateCurrentGameState(resolved)).toEqual(resolved);
	});

	test.each([
		{ collection: 'retail', dimension: 'width', value: 0 },
		{ collection: 'retail', dimension: 'height', value: 1.5 },
		{ collection: 'industry', dimension: 'width', value: 0 },
		{ collection: 'industry', dimension: 'height', value: 1.5 }
	] as const)(
		'strict validation rejects $collection city $dimension=$value',
		({ collection, dimension, value }) => {
			const game = createGame();
			const changed =
				collection === 'retail'
					? {
							...game,
							cities: [{ ...game.cities[0]!, [dimension]: value }]
						}
					: {
							...game,
							industryCities: [{ ...game.industryCities[0]!, [dimension]: value }]
						};

			expect(() => validateCurrentGameState(changed)).toThrow(
				new RegExp(`${dimension} must be a positive integer`)
			);
		}
	);

	test.each([
		{ field: 'x', value: 3, error: 'coordinates (3,0) must be within city bounds' },
		{ field: 'x', value: 0.5, error: 'x must be an integer' },
		{ field: 'cityId', value: 'ghost-city', error: 'cityId must match containing city harbor-city' }
	] as const)(
		'strict validation rejects malformed retail tile $field',
		({ field, value, error }) => {
			const game = createGame();
			const city = game.cities[0]!;
			const sample = city.tiles[0]!;
			const extra = {
				...sample,
				id: 'harbor-city-extra',
				x: 0,
				y: 0,
				[field]: value
			};

			expect(() =>
				validateCurrentGameState({
					...game,
					cities: [{ ...city, tiles: [...city.tiles, extra] }]
				})
			).toThrow(error);
		}
	);

	test.each([
		{ field: 'x', value: 3, error: 'coordinates (3,0) must be within city bounds' },
		{ field: 'x', value: 0.5, error: 'x must be an integer' },
		{
			field: 'cityId',
			value: 'ghost-city',
			error: 'cityId must match containing city industry-city'
		}
	] as const)(
		'strict validation rejects malformed industry tile $field',
		({ field, value, error }) => {
			const game = createGame();
			const city = game.industryCities[0]!;
			const extra: IndustryTile = {
				id: 'industry-city-extra',
				cityId: 'industry-city',
				x: 0,
				y: 0,
				terrain: 'industrial',
				resource: null,
				locked: false,
				[field]: value
			} as IndustryTile;

			expect(() =>
				validateCurrentGameState({
					...game,
					industryCities: [{ ...city, tiles: [...city.tiles, extra] }]
				})
			).toThrow(error);
		}
	);

	test.each(['retail', 'industry'] as const)(
		'strict validation rejects duplicate $kind city IDs',
		(kind) => {
			const game = createGame();
			const changed =
				kind === 'retail'
					? { ...game, cities: [...game.cities, structuredClone(game.cities[0]!)] }
					: {
							...game,
							industryCities: [...game.industryCities, structuredClone(game.industryCities[0]!)]
						};

			expect(() => validateCurrentGameState(changed)).toThrow(/city IDs must be unique/);
		}
	);

	test.each([
		{ kind: 'retail', defect: 'missing tile' },
		{ kind: 'retail', defect: 'duplicate tile ID' },
		{ kind: 'retail', defect: 'duplicate coordinate' },
		{ kind: 'industry', defect: 'missing tile' },
		{ kind: 'industry', defect: 'duplicate tile ID' },
		{ kind: 'industry', defect: 'duplicate coordinate' }
	] as const)('strict validation rejects $kind city topology: $defect', ({ kind, defect }) => {
		const game = createGame();
		const city = structuredClone(kind === 'retail' ? game.cities[0]! : game.industryCities[0]!);
		if (defect === 'missing tile') {
			city.tiles.pop();
		} else if (defect === 'duplicate tile ID') {
			city.tiles.at(-1)!.id = city.tiles[0]!.id;
		} else {
			city.tiles.at(-1)!.x = city.tiles[0]!.x;
			city.tiles.at(-1)!.y = city.tiles[0]!.y;
		}
		const changed =
			kind === 'retail'
				? { ...game, cities: [city as GameState['cities'][number]] }
				: { ...game, industryCities: [city as GameState['industryCities'][number]] };

		expect(() => validateCurrentGameState(changed)).toThrow(/city tile grid|tile IDs|coordinates/);
	});

	test('strict validation rejects rail coordinates that have no materialized industry tile', () => {
		const game = createGame();
		const city = structuredClone(game.industryCities[0]!);
		city.tiles = city.tiles.filter((tile) => tile.x !== 0 || tile.y !== 0);
		city.rails = [{ x: 0, y: 0, level: 1 }];

		expect(() => validateCurrentGameState({ ...game, industryCities: [city] })).toThrow(
			/rail.*actual tile/i
		);
	});

	test('strict validation rejects a tiny city whose store footprint cannot fit', () => {
		const game = createGame();
		const tile = { ...game.cities[0]!.tiles[0]!, id: 'tiny-0-0', x: 0, y: 0 };
		const store = {
			...game.stores[0]!,
			tileId: tile.id,
			mapX: 0,
			mapY: 0,
			location: { neighborhoodId: tile.neighborhood, x: 0, y: 0 }
		};

		expect(() =>
			validateCurrentGameState({
				...game,
				cities: [{ ...game.cities[0]!, width: 1, height: 1, tiles: [tile] }],
				stores: [store]
			})
		).toThrow('placement must already match a buildable, non-overlapping city footprint');
	});

	test.each([
		{ field: 'tileId', value: null, error: 'tileId must be a non-empty string' },
		{ field: 'mapX', value: '1', error: 'mapX must be a finite number' },
		{ field: 'mapY', value: Number.NaN, error: 'mapY must be a finite number' }
	])(
		'sandbox normalization leaves malformed store $field for strict validation',
		({ field, value, error }) => {
			const store = { ...createGame().stores[0]!, [field]: value };
			const record = createManualSaveRecord({
				game: { stores: [store as unknown as GameState['stores'][number]] }
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow(error);
		}
	);

	test.each([
		{ field: 'activeCityId', openedId: 'harbor-city' },
		{ field: 'activeIndustryCityId', openedId: 'industry-city' }
	] as const)(
		'strict validation rejects unopened active city through $field',
		({ field, openedId }) => {
			const game = createGame();
			const world = {
				...game.world,
				openedCityIds: game.world.openedCityIds.filter((cityId) => cityId !== openedId)
			};

			expect(() => validateCurrentGameState({ ...game, world, [field]: openedId })).toThrow(
				new RegExp(`${field} must reference an opened city`)
			);
		}
	);

	test.each([
		{ kind: 'retail', cityId: 'campus-junction' },
		{ kind: 'industry', cityId: 'breadbasket-basin' }
	] as const)(
		'strict validation rejects an opened unmaterialized $kind city',
		({ kind, cityId }) => {
			const game = createGame();
			const world = {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, cityId],
				openedCityIds: [...game.world.openedCityIds, cityId]
			};

			expect(() => validateCurrentGameState({ ...game, world })).toThrow(
				new RegExp(`opened ${kind} city ${cityId} must be materialized`)
			);
		}
	);

	test('strict validation rejects a placed store in an unopened retail city', () => {
		const definition = getWorldCityDefinition('campus-junction')!;
		expect(definition.kind).toBe('retail');
		const campusCity = generateCity({
			id: definition.id,
			name: 'Campus Junction',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: definition.seed
		});
		const tile = campusCity.tiles.find((candidate) => isTileBuildable(candidate))!;
		const base = createGame();
		// Materialize campus-junction but omit it from openedCityIds. harbor-city
		// stays opened so the activeCityId check still passes. The store placed
		// in campus-junction must be rejected even though its footprint is valid.
		const game: GameState = {
			...base,
			cities: [...base.cities, campusCity],
			world: {
				...base.world,
				revealedCityIds: [...base.world.revealedCityIds, 'campus-junction']
			},
			stores: [
				{
					...base.stores[0]!,
					id: 'store-campus',
					cityId: 'campus-junction',
					tileId: tile.id,
					mapX: tile.x,
					mapY: tile.y,
					location: formatLocation(tile)
				}
			]
		};

		expect(() => validateCurrentGameState(game)).toThrow(
			/stores\[0\] must belong to an opened city \(found campus-junction\)/
		);
	});

	test('strict validation rejects a placed industrial building in an unopened industry city', () => {
		const base = createValidWarehouseBuildingGame();
		const warehouse = base.industrialBuildings[0]!;
		// Build a second materialized industry city (breadbasket-basin) that is
		// revealed but NOT opened, and relocate the warehouse into it. The
		// building footprint stays valid, so only the opened-city gate fires.
		const basinCity: GameState['industryCities'][number] = {
			id: 'breadbasket-basin',
			name: 'Breadbasket Basin',
			width: 3,
			height: 3,
			tiles: Array.from({ length: 9 }, (_, index) => {
				const x = index % 3;
				const y = Math.floor(index / 3);
				return {
					id: `breadbasket-basin-${x}-${y}`,
					cityId: 'breadbasket-basin',
					x,
					y,
					terrain: 'industrial',
					resource: null,
					locked: false
				};
			}),
			rails: []
		};
		const relocatedWarehouse = {
			...warehouse,
			cityId: 'breadbasket-basin',
			tileId: 'breadbasket-basin-0-0',
			mapX: 0,
			mapY: 0
		};
		const game: GameState = {
			...base,
			industryCities: [...base.industryCities, basinCity],
			industrialBuildings: [relocatedWarehouse],
			world: {
				...base.world,
				revealedCityIds: [...base.world.revealedCityIds, 'breadbasket-basin']
			}
		};

		expect(() => validateCurrentGameState(game)).toThrow(
			/industrialBuildings\[0\] must belong to an opened city \(found breadbasket-basin\)/
		);
	});

	test('strict validation accepts an unoccupied materialized city that is not opened', () => {
		const definition = getWorldCityDefinition('campus-junction')!;
		const campusCity = generateCity({
			id: definition.id,
			name: 'Campus Junction',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: definition.seed
		});
		const base = createGame();
		// campus-junction is materialized and revealed but not opened, and has
		// no stores or buildings. This must remain valid — the opened-city gate
		// only applies to placed entities, not to unoccupied generated cities.
		const game: GameState = {
			...base,
			cities: [...base.cities, campusCity],
			world: {
				...base.world,
				revealedCityIds: [...base.world.revealedCityIds, 'campus-junction']
			}
		};

		expect(() => validateCurrentGameState(game)).not.toThrow();
	});

	test.each([
		{ collection: 'retail', wrongId: 'industry-city' },
		{ collection: 'industry', wrongId: 'harbor-city' }
	] as const)(
		'strict validation rejects a catalog ID materialized in the $collection collection',
		({ collection, wrongId }) => {
			const game = createGame();
			if (collection === 'retail') {
				const wrongCity = structuredClone(game.cities[0]!);
				wrongCity.id = wrongId;
				wrongCity.tiles = wrongCity.tiles.map((tile) => ({
					...tile,
					id: tile.id.replace('harbor-city', wrongId),
					cityId: wrongId
				}));
				expect(() =>
					validateCurrentGameState({ ...game, cities: [...game.cities, wrongCity] })
				).toThrow(/retail city industry-city must use a retail catalog ID/);
			} else {
				const wrongCity = structuredClone(game.industryCities[0]!);
				wrongCity.id = wrongId;
				wrongCity.tiles = wrongCity.tiles.map((tile) => ({
					...tile,
					id: tile.id.replace('industry-city', wrongId),
					cityId: wrongId
				}));
				expect(() =>
					validateCurrentGameState({
						...game,
						industryCities: [...game.industryCities, wrongCity]
					})
				).toThrow(/industry city harbor-city must use an industry catalog ID/);
			}
		}
	);

	test.each(['activeCityId', 'activeIndustryCityId'] as const)(
		'strict validation rejects a cross-category active ID through $field',
		(field) => {
			const game = createGame();
			if (field === 'activeCityId') {
				const wrongCity = structuredClone(game.cities[0]!);
				wrongCity.id = 'industry-city';
				wrongCity.tiles = wrongCity.tiles.map((tile) => ({
					...tile,
					id: tile.id.replace('harbor-city', 'industry-city'),
					cityId: 'industry-city'
				}));
				expect(() =>
					validateCurrentGameState({
						...game,
						cities: [...game.cities, wrongCity],
						activeCityId: 'industry-city'
					})
				).toThrow(/activeCityId must reference a retail catalog city/);
			} else {
				const wrongCity = structuredClone(game.industryCities[0]!);
				wrongCity.id = 'harbor-city';
				wrongCity.tiles = wrongCity.tiles.map((tile) => ({
					...tile,
					id: tile.id.replace('industry-city', 'harbor-city'),
					cityId: 'harbor-city'
				}));
				expect(() =>
					validateCurrentGameState({
						...game,
						industryCities: [...game.industryCities, wrongCity],
						activeIndustryCityId: 'harbor-city'
					})
				).toThrow(/activeIndustryCityId must reference an industry catalog city/);
			}
		}
	);

	test.each([
		{ field: 'activeCityId', value: 'ghost-retail' },
		{ field: 'activeIndustryCityId', value: 'ghost-industry' }
	] as const)(
		'strict validation rejects missing active city through $field',
		({ field, value }) => {
			expect(() => validateCurrentGameState({ ...createGame(), [field]: value })).toThrow(
				new RegExp(`${field} must reference a materialized city`)
			);
		}
	);

	test.each([
		{
			name: 'missing city',
			mutate: (game: GameState) => ({
				...game,
				industrialBuildings: [{ ...game.industrialBuildings[0]!, cityId: 'ghost-city' }]
			})
		},
		{
			name: 'missing tile',
			mutate: (game: GameState) => ({
				...game,
				industrialBuildings: [{ ...game.industrialBuildings[0]!, tileId: 'ghost-tile' }]
			})
		},
		{
			name: 'off-grid footprint',
			mutate: (game: GameState) => {
				const city = game.industryCities[0]!;
				const edge = city.tiles.find(
					(tile) => tile.x === city.width - 1 && tile.y === city.height - 1
				)!;
				return {
					...game,
					industrialBuildings: [
						{
							...game.industrialBuildings[0]!,
							tileId: edge.id,
							mapX: edge.x,
							mapY: edge.y
						}
					]
				};
			}
		},
		{
			name: 'overlap',
			mutate: (game: GameState) => {
				const duplicate = { ...game.industrialBuildings[0]!, id: 'warehouse-overlap' };
				const withDuplicate = {
					...game,
					industrialBuildings: [...game.industrialBuildings, duplicate]
				};
				return {
					...withDuplicate,
					warehouse: recalculateWarehousePressure({
						...withDuplicate.warehouse,
						capacity: getWarehouseCapacity(withDuplicate),
						materials: { ...withDuplicate.warehouse.materials }
					})
				};
			}
		}
	])('strict validation rejects industrial building $name', ({ mutate }) => {
		expect(() => validateCurrentGameState(mutate(createValidWarehouseBuildingGame()))).toThrow(
			/industrialBuildings\[\d+\] placement/
		);
	});

	test('strict validation rejects a fractional store cap', () => {
		expect(() => validateCurrentGameState(createGame({ storeCap: 3.5 }))).toThrow(
			'Saved game storeCap must be an integer'
		);
	});

	test('strict validation rejects a locked product category substituted at the same count', () => {
		const store = createGame().stores[0]!;
		const products = initializeStoreProducts('boutique', 4);
		const lockedSubstitution = [products[0]!, { ...products[1]!, categoryId: 'gifts' }];

		expect(() =>
			validateCurrentGameState(
				createGame({
					stores: [
						{
							...store,
							level: 4,
							products: lockedSubstitution,
							stockHealth: calculateStockHealth(lockedSubstitution)
						}
					]
				})
			)
		).toThrow('products[1] categoryId must be unlocked at level 4');
	});

	test('strict validation rejects stock health that is inconsistent with products', () => {
		const store = createGame().stores[0]!;
		const staleStore = { ...store, stockHealth: store.stockHealth + 1 };

		expect(() => validateCurrentGameState(createGame({ stores: [staleStore] }))).toThrow(
			'stockHealth must match its products'
		);
		expect(
			validateSaveRecord(createManualSaveRecord({ game: { stores: [staleStore] } })).game.stores[0]
				?.stockHealth
		).toBe(calculateStockHealth(staleStore.products));
	});

	test('sandbox normalization leaves non-finite stock health for strict validation', () => {
		const store = createGame().stores[0]!;
		const record = createManualSaveRecord({
			game: { stores: [{ ...store, stockHealth: Number.NaN }] }
		});

		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game stores[0] stockHealth must be a finite number'
		);
	});

	test.each([
		{
			name: 'capacity',
			warehouse: { capacity: 1, materials: {}, overflowUnits: 0, overflowCost: 0 },
			expected: { capacity: 0, materials: {}, overflowUnits: 0, overflowCost: 0 }
		},
		{
			name: 'pressure',
			warehouse: { capacity: 0, materials: { water: 1 }, overflowUnits: 0, overflowCost: 0 },
			expected: { capacity: 0, materials: { water: 1 }, overflowUnits: 1, overflowCost: 2 }
		}
	])(
		'strict validation rejects warehouse $name inconsistent with derived state while sandbox loading repairs it',
		({ warehouse, expected }) => {
			expect(() => validateCurrentGameState(createGame({ warehouse }))).toThrow(
				'Saved game warehouse capacity and pressure must match current buildings and materials'
			);
			expect(
				validateSaveRecord(createManualSaveRecord({ game: { warehouse } })).game.warehouse
			).toEqual(expected);
		}
	);

	test('strict validation accepts correctly derived nonzero warehouse overflow', () => {
		const game = createGame({
			warehouse: { capacity: 0, materials: { water: 1 }, overflowUnits: 1, overflowCost: 2 }
		});

		expect(validateCurrentGameState(game)).toEqual(game);
	});

	test('strict current-game cloning preserves -0 and enumerable cloneable extras', () => {
		const game = Object.assign(createGame({ cash: -0 }), {
			optionalExtra: undefined,
			cloneableExtra: { nested: true }
		});

		const validated = validateCurrentGameState(game);

		expect(Object.is(validated.cash, -0)).toBe(true);
		expect(Object.hasOwn(validated, 'optionalExtra')).toBe(true);
		expect((validated as GameState & { optionalExtra?: unknown }).optionalExtra).toBeUndefined();
		expect((validated as GameState & { cloneableExtra: unknown }).cloneableExtra).toEqual({
			nested: true
		});
		expect((validated as GameState & { cloneableExtra: unknown }).cloneableExtra).not.toBe(
			game.cloneableExtra
		);
	});

	test('strict validation rejects stale world progress while sandbox loading refreshes it', () => {
		const stale = createGame({ day: 7, finance: createFoundingFinanceState(7, 2_000) });
		const expected = refreshWorldProgress(stale);

		expect(() => validateCurrentGameState(stale)).toThrow(SaveDataError);
		expect(validateSaveRecord(createManualSaveRecord({ game: stale })).game.world).toEqual(
			expected.world
		);
	});

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
		expect.assertions(12);
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

		expect(() => validateCurrentGameState(record.game)).toThrow(SaveDataError);
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

	test('rejects a stale store after warning when no buildable tile remains', () => {
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

		expect(() => validateCurrentGameState(record.game)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(warnSpy).toHaveBeenCalledWith(
			expect.stringContaining('store "store-stale" in city "harbor-city" has no buildable tile')
		);
	});

	test('strict validation rejects a store whose city is not materialized', () => {
		const store = createGame().stores[0]!;
		const game = createGame({ stores: [{ ...store, cityId: 'missing-city' }] });

		expect(() => validateCurrentGameState(game)).toThrow(
			'Saved game stores[0] placement must already match a buildable, non-overlapping city footprint'
		);
	});

	test('strict validation rejects a production-sized city with no placement topology', () => {
		const game = createNewGame('convenience', 20260722);
		const harborCity = game.cities.find((city) => city.id === 'harbor-city')!;
		const cities = game.cities.map((city) =>
			city.id === harborCity.id ? { ...city, tiles: [] } : city
		);

		expect(() => validateCurrentGameState({ ...game, cities })).toThrow(
			'Saved game cities[0] city tile grid must contain exactly width * height tiles'
		);
	});

	test('inferWorldProgress warns about unknown saved city ids', () => {
		expect.assertions(1);
		const legacyGame = createGame({
			cities: [
				createFixtureRetailCity(),
				{
					id: 'not-a-real-city',
					name: 'Unknown',
					width: 1,
					height: 1,
					tiles: [
						{
							...createFixtureRetailCity().tiles[0]!,
							id: 'not-a-real-city-0-0',
							cityId: 'not-a-real-city',
							x: 0,
							y: 0
						}
					]
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

	test('sandbox normalization leaves malformed production movements for strict SaveDataError validation', () => {
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				produced: [null as unknown as DailyMaterialMovement]
			})
		});
		const record = createManualSaveRecord({ game: { reports: [report] } });

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game reports[0] productionReport produced[0] must be an object'
		);
	});

	test('v9 migration leaves malformed production movements for strict SaveDataError validation', () => {
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				produced: [null as unknown as DailyMaterialMovement]
			})
		});
		const record = {
			...createManualSaveRecord({ game: { reports: [report] } }),
			schemaVersion: 9 as unknown as typeof SAVE_SCHEMA_VERSION
		};

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game reports[0] productionReport produced[0] must be an object'
		);
	});

	test('sandbox normalization defers malformed city tiles to strict SaveDataError validation', () => {
		const record = createManualSaveRecord({
			game: {
				cities: [
					{
						...createGame().cities[0]!,
						tiles: [null as unknown as GameState['cities'][number]['tiles'][number]]
					}
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game cities[0] tiles[0] must be an object'
		);
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
							x: 0,
							y: 0,
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
				world: {
					...createInitialWorldProgress(),
					revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
					openedCityIds: ['harbor-city', 'industry-city', 'campus-junction']
				},
				cities: [
					createFixtureRetailCity(),
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
		const city = validated.game.cities.find((candidate) => candidate.id === 'campus-junction')!;
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
		expect.assertions(7);
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
						location: formatLocation(tile),
						localDemand: 1
					}
				]
			} as unknown as Partial<GameState>
		});
		const before = structuredClone(record.game);

		expect(() => validateCurrentGameState(record.game)).toThrow(SaveDataError);
		expect(record.game).toEqual(before);
		expect(warnSpy).not.toHaveBeenCalled();
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

	test('rejects a store whose saved cityId is not in the city list', () => {
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

		expect(() => validateCurrentGameState(record.game)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
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

	test('does not relocate malformed non-string tileId when no buildable tile remains', () => {
		expect.assertions(2);
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
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test('does not relocate a store with an unknown id and non-string tileId', () => {
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
		expect(warnSpy).not.toHaveBeenCalled();
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
		const products = initializeStoreProducts('boutique', 10).map((product) =>
			product.categoryId === 'fashion-accessories'
				? { ...product, categoryId: 'accessories' }
				: product
		);
		const record = createV4Record({
			game: {
				stores: [
					{
						...baseStore,
						level: 10,
						archetypeId: 'boutique',
						products,
						stockHealth: calculateStockHealth(products)
					}
				]
			}
		});

		const validated = validateSaveRecord(record);
		expect(validated.game.stores[0]?.products[3]?.categoryId).toBe('fashion-accessories');
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

	test.each([
		{ finance: { kind: 'borrow', purpose: 'emergency', amount: 4_000, termDays: 56, extra: true } },
		{ finance: { kind: 'grant', purpose: 'emergency', amount: 4_000, termDays: 56 } },
		{ finance: { kind: 'borrow', purpose: 'workingCapital', amount: 4_000, termDays: 56 } },
		{ finance: { kind: 'borrow', purpose: 'emergency', amount: 4_000, termDays: 28 } },
		{ finance: { kind: 'borrow', purpose: 'supplierCredit', amount: 4_000.5, termDays: 28 } },
		{ finance: { kind: 'borrow', purpose: 'supplierCredit', amount: 0, termDays: 28 } },
		{ finance: { kind: 'borrow', purpose: 'supplierCredit', amount: -1, termDays: 28 } },
		{ finance: { kind: 'borrow', purpose: 'emergency', amount: 4_000, termDays: 84 } }
	])('rejects a malformed persisted decision finance effect: %o', ({ finance }) => {
		const record = createManualSaveRecord({
			game: {
				decisions: [
					{
						id: 'cash-pressure',
						title: 'Cash pressure',
						context: { code: 'cashPressure' },
						expiresOnDay: 3,
						options: [
							{
								id: 'short-loan',
								label: 'Short loan',
								description: 'Borrow.',
								effects: { finance }
							}
						]
					} as unknown as GameState['decisions'][number]
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
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

	test('v8 migration converts a string store location into a structured StoreLocation', () => {
		// v8→v9: Store.location changed from a free-form English string to a
		// structured { neighborhoodId, x, y } object. The neighborhood is
		// looked up from the saved city tile matching the store's tileId.
		expect.assertions(3);
		const baseRecord = createManualSaveRecord();
		const footprintTiles = createFixtureRetailCity().tiles.map((tile) => ({
			...tile,
			demand: 50,
			rent: 40,
			footTraffic: 60,
			customerFit: 70,
			locked: false
		}));
		const v8Record = {
			...baseRecord,
			schemaVersion: 8 as unknown as typeof SAVE_SCHEMA_VERSION,
			game: {
				...baseRecord.game,
				cities: [
					{
						...baseRecord.game.cities[0]!,
						width: 3,
						height: 3,
						tiles: footprintTiles
					}
				],
				stores: [
					{
						...baseRecord.game.stores[0]!,
						location: 'Downtown (1, 1)' as unknown as GameState['stores'][number]['location']
					}
				]
			}
		} as unknown as SaveRecord;

		const validated = validateSaveRecord(v8Record);
		expect(validated.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
		const store = validated.game.stores[0]!;
		expect(store.location).toEqual({ neighborhoodId: 'downtown', x: 1, y: 1 });
		expect(typeof store.location).toBe('object');
	});

	test('v8 migration defaults to downtown when the saved tile is missing from the city', () => {
		// When the store's tileId doesn't match any tile in the city (e.g. the
		// city was regenerated), the migration falls back to 'downtown' and
		// copies mapX/mapY from the store record.
		expect.assertions(1);
		const baseRecord = createManualSaveRecord();
		const v8Record = {
			...baseRecord,
			schemaVersion: 8 as unknown as typeof SAVE_SCHEMA_VERSION,
			game: {
				...baseRecord.game,
				cities: [
					{
						...baseRecord.game.cities[0]!,
						tiles: []
					}
				],
				stores: [
					{
						...baseRecord.game.stores[0]!,
						location: 'Old Town (3, 4)' as unknown as GameState['stores'][number]['location'],
						mapX: 3,
						mapY: 4
					}
				]
			}
		} as unknown as SaveRecord;

		const migrated = migrateSavedGame(v8Record.game, 8) as GameState;
		expect(migrated.stores[0]!.location).toEqual({
			neighborhoodId: 'downtown',
			x: 3,
			y: 4
		});
	});

	test('v8 migration defaults coordinates to 0 when mapX/mapY are not numbers', () => {
		// The migration defaults non-number mapX/mapY to 0 in the location
		// object. Validation subsequently rejects the corrupt store record
		// (mapX must be finite), but the migration line still runs.
		expect.assertions(1);
		const baseRecord = createManualSaveRecord();
		const v8Record = {
			...baseRecord,
			schemaVersion: 8 as unknown as typeof SAVE_SCHEMA_VERSION,
			game: {
				...baseRecord.game,
				cities: [{ ...baseRecord.game.cities[0]!, tiles: [] }],
				stores: [
					{
						...baseRecord.game.stores[0]!,
						location: 'Downtown' as unknown as GameState['stores'][number]['location'],
						mapX: 'bad' as unknown as number,
						mapY: 'bad' as unknown as number
					}
				]
			}
		} as unknown as SaveRecord;

		expect(() => validateSaveRecord(v8Record)).toThrow(SaveDataError);
	});

	test('v8 migration skips a store whose location is already structured', () => {
		// A store with a non-string location is left untouched — the migration
		// only transforms string locations.
		expect.assertions(1);
		const baseRecord = createManualSaveRecord();
		const v8Record = {
			...baseRecord,
			schemaVersion: 8 as unknown as typeof SAVE_SCHEMA_VERSION,
			game: {
				...baseRecord.game,
				cities: [{ ...baseRecord.game.cities[0]!, tiles: [] }],
				stores: [
					{
						...baseRecord.game.stores[0]!,
						location: { neighborhoodId: 'mall', x: 5, y: 6 }
					}
				]
			}
		} as unknown as SaveRecord;

		const migrated = migrateSavedGame(v8Record.game, 8) as GameState;
		expect(migrated.stores[0]!.location).toEqual({
			neighborhoodId: 'mall',
			x: 5,
			y: 6
		});
	});

	test('v8 migration handles a city with non-array tiles by defaulting to downtown', () => {
		// When the matching city's tiles field is not an array, the migration
		// breaks out of the loop and defaults neighborhoodId to 'downtown'.
		// Validation subsequently rejects the corrupt city, but the migration
		// branch still runs.
		expect.assertions(1);
		const baseRecord = createManualSaveRecord();
		const v8Record = {
			...baseRecord,
			schemaVersion: 8 as unknown as typeof SAVE_SCHEMA_VERSION,
			game: {
				...baseRecord.game,
				cities: [
					{
						...baseRecord.game.cities[0]!,
						tiles: null as unknown as GameState['cities'][number]['tiles']
					}
				],
				stores: [
					{
						...baseRecord.game.stores[0]!,
						location: 'Downtown (1, 1)' as unknown as GameState['stores'][number]['location']
					}
				]
			}
		} as unknown as SaveRecord;

		expect(() => validateSaveRecord(v8Record)).toThrow(SaveDataError);
	});

	test('v8 migration skips non-object cities in the cities array', () => {
		// A non-object city entry is skipped via `continue` in the migration
		// loop; the store defaults to 'downtown'. Validation rejects the
		// corrupt city, but the migration branch still runs.
		expect.assertions(1);
		const baseRecord = createManualSaveRecord();
		const v8Record = {
			...baseRecord,
			schemaVersion: 8 as unknown as typeof SAVE_SCHEMA_VERSION,
			game: {
				...baseRecord.game,
				cities: [null as unknown as GameState['cities'][number]],
				stores: [
					{
						...baseRecord.game.stores[0]!,
						location: 'Downtown (1, 1)' as unknown as GameState['stores'][number]['location']
					}
				]
			}
		} as unknown as SaveRecord;

		expect(() => validateSaveRecord(v8Record)).toThrow(SaveDataError);
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
			railSelfConnected: { code: 'railSelfConnected' },
			railNoValidPath: { code: 'railNoValidPath' },
			railAlreadyConnected: { code: 'railAlreadyConnected' },
			railRequiresCash: { code: 'railRequiresCash', cost: 1000, cash: 500 },
			railSegmentAtMaxLevel: { code: 'railSegmentAtMaxLevel' },
			railUnknownSegment: { code: 'railUnknownSegment' },
			industrialTileHasRail: { code: 'industrialTileHasRail' }
		};
		const contexts = Object.values(ALL_DECISION_CONTEXTS);
		// 26 = number of variants in the DecisionContext union. If this fails,
		// a variant was added or removed without updating ALL_DECISION_CONTEXTS.
		expect(contexts).toHaveLength(26);
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

	test('v9 migration synthesizes push-warehouse shipments from produced movements', () => {
		// Pre-rail, every produced movement flowed directly into the
		// warehouse. The post-rail product-chain graph derives the
		// warehouse in-edge from push-warehouse rail shipments, so the
		// migration must synthesize one per produced movement or
		// historical reports lose their warehouse delivery edges.
		expect.assertions(3);
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				produced: [
					{ materialId: 'grain', quantity: 5, value: 15, source: 'local' },
					{ materialId: 'flour', quantity: 3, value: 9, source: 'local' }
				]
			})
		});
		const game = createGame({ reports: [report] });
		const v9Game = stripRailFields(game);
		const record = {
			...createManualSaveRecord(),
			schemaVersion: 9 as unknown as typeof SAVE_SCHEMA_VERSION,
			game: v9Game as GameState
		};

		const validated = validateSaveRecord(record);
		const migrated = validated.game.reports[0]!.productionReport;
		expect(migrated.railShipments).toHaveLength(2);
		expect(migrated.railShipments.every((shipment) => shipment.kind === 'push-warehouse')).toBe(
			true
		);
		expect(migrated.railShipments.map((shipment) => shipment.materialId)).toEqual([
			'grain',
			'flour'
		]);
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
		expect.assertions(3);
		const mill = createIndustrialBuilding({
			typeId: 'flour-mill',
			inventory: { grain: 5, snacks: 5 }
		});
		const record = createManualSaveRecord({
			game: { industrialBuildings: [mill] }
		});

		expect(() => validateCurrentGameState(record.game)).toThrow(SaveDataError);
		const validated = validateSaveRecord(record);
		const decodedMill = validated.game.industrialBuildings.find((b) => b.typeId === 'flour-mill')!;
		expect(decodedMill.inventory.snacks).toBeUndefined();
		expect(decodedMill.inventory.grain).toBe(5);
	});

	test('strict validation rejects over-capacity building inventory while sandbox loading clamps it', () => {
		const mill = createIndustrialBuilding({
			typeId: 'flour-mill',
			inventory: { grain: 80, flour: 80 }
		});
		const game = createGame({ industrialBuildings: [mill] });
		const record = createManualSaveRecord({ game });

		expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
		expect(validateSaveRecord(record).game.industrialBuildings[0]?.inventory).toEqual({
			grain: 80,
			flour: 10
		});
	});

	test('strict validation accepts runtime inventory with a consumed input retained at zero', () => {
		const initial = { ...createNewGame('convenience', 20260722), cash: 1_000_000 };
		const tile = initial.industryCities[0]!.tiles.find(
			(candidate) => getIndustrialPlacementBlockReason(initial, candidate.id, 'flour-mill') === null
		)!;
		const built = buildIndustrialBuilding(initial, {
			tileId: tile.id,
			buildingTypeId: 'flour-mill'
		});
		const game = simulateDay({
			...built,
			industrialBuildings: built.industrialBuildings.map((building) => ({
				...building,
				inventory: { grain: 10 }
			}))
		});

		expect(game.industrialBuildings[0]?.inventory).toEqual({ grain: 0, flour: 8 });
		expect(validateCurrentGameState(game)).toEqual(game);
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

	test('normalizeSandboxWarehouseState returns early when warehouse capacity is non-numeric', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				warehouse: {
					...createGame().warehouse,
					capacity: 'not-a-number' as unknown as number
				}
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('warehouse capacity must be a finite number');
	});

	describe('industrial building placement validation', () => {
		function baseWarehouseGame(): GameState {
			return createValidWarehouseBuildingGame();
		}

		function anchorTile(game: GameState) {
			const building = game.industrialBuildings[0]!;
			const city = game.industryCities[0]!;
			return city.tiles.find((t) => t.id === building.tileId)!;
		}

		function footprintNeighbor(game: GameState) {
			const anchor = anchorTile(game);
			const city = game.industryCities[0]!;
			return city.tiles.find((t) => t.x === anchor.x + 1 && t.y === anchor.y)!;
		}

		test('rejects a building whose coordinates do not match its anchor tile', () => {
			expect.assertions(1);
			const base = baseWarehouseGame();
			const anchor = anchorTile(base);
			const building = base.industrialBuildings[0]!;
			const game: GameState = {
				...base,
				industrialBuildings: [{ ...building, mapX: anchor.x + 1 }]
			};

			expect(() => validateCurrentGameState(game)).toThrow(
				'coordinates must match its anchor tile'
			);
		});

		test('rejects a building whose footprint contains a locked tile', () => {
			expect.assertions(1);
			const base = baseWarehouseGame();
			const neighbor = footprintNeighbor(base);
			const city = base.industryCities[0]!;
			const game: GameState = {
				...base,
				industryCities: [
					{
						...city,
						tiles: city.tiles.map((t) => (t.id === neighbor.id ? { ...t, locked: true } : t))
					}
				]
			};

			expect(() => validateCurrentGameState(game)).toThrow(
				'footprint must contain only unlocked tiles'
			);
		});

		test('rejects a building whose footprint overlaps a rail', () => {
			expect.assertions(1);
			const base = baseWarehouseGame();
			const neighbor = footprintNeighbor(base);
			const city = base.industryCities[0]!;
			const game: GameState = {
				...base,
				industryCities: [
					{
						...city,
						rails: [{ x: neighbor.x, y: neighbor.y, level: 1 }]
					}
				]
			};

			expect(() => validateCurrentGameState(game)).toThrow('footprint must not overlap rail');
		});

		test('rejects a building whose anchor does not provide its required resource', () => {
			expect.assertions(1);
			const base = baseWarehouseGame();
			const building = base.industrialBuildings[0]!;
			const game: GameState = {
				...base,
				industrialBuildings: [
					{ ...building, typeId: 'grain-farm' as unknown as typeof building.typeId }
				]
			};

			expect(() => validateCurrentGameState(game)).toThrow(
				'anchor must provide its required resource'
			);
		});

		test('rejects a building that requires industrial tiles but whose footprint has non-industrial terrain', () => {
			expect.assertions(1);
			const base = baseWarehouseGame();
			const neighbor = footprintNeighbor(base);
			const city = base.industryCities[0]!;
			const game: GameState = {
				...base,
				industryCities: [
					{
						...city,
						tiles: city.tiles.map((t) => (t.id === neighbor.id ? { ...t, terrain: 'farmland' } : t))
					}
				]
			};

			expect(() => validateCurrentGameState(game)).toThrow(
				'footprint must contain only industrial terrain'
			);
		});

		test('rejects an industrial building with an unknown typeId via requireKnownId', () => {
			expect.assertions(2);
			const base = baseWarehouseGame();
			const building = base.industrialBuildings[0]!;
			const game: GameState = {
				...base,
				industrialBuildings: [
					{ ...building, typeId: 'not-a-building' as unknown as typeof building.typeId }
				]
			};

			expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
			expect(() => validateCurrentGameState(game)).toThrow(
				'must be a known industrial building type'
			);
		});
	});

	test('strict validation rejects a city ID shared between retail and industry collections', () => {
		expect.assertions(1);
		const game = createGame();
		const sharedRetailCity = {
			...createFixtureRetailCity(),
			id: 'shared-city',
			name: 'Shared',
			tiles: createFixtureRetailCity().tiles.map((t) => ({
				...t,
				id: `shared-city-${t.x}-${t.y}`,
				cityId: 'shared-city'
			}))
		};
		const sharedIndustryCity = {
			...createFixtureIndustryCity(),
			id: 'shared-city',
			name: 'Shared',
			tiles: createFixtureIndustryCity().tiles.map((t) => ({
				...t,
				id: `shared-city-${t.x}-${t.y}`,
				cityId: 'shared-city'
			}))
		};
		const mutated: GameState = {
			...game,
			cities: [...game.cities, sharedRetailCity],
			industryCities: [...game.industryCities, sharedIndustryCity]
		};

		expect(() => validateCurrentGameState(mutated)).toThrow(
			'retail and industry city IDs must be disjoint: shared-city'
		);
	});

	describe('createPlainSnapshot own-data graph edge cases', () => {
		test('rejects a revoked proxy as own-data', () => {
			expect.assertions(2);
			const { proxy, revoke } = Proxy.revocable({}, {});
			revoke();

			expect(() => createPlainSnapshot(proxy, 'test')).toThrow(SaveDataError);
			expect(() => createPlainSnapshot(proxy, 'test')).toThrow(
				'test must contain only own enumerable string-keyed data properties'
			);
		});

		test('rejects an array with a non-Array prototype', () => {
			expect.assertions(2);
			const arr = Object.setPrototypeOf([1, 2, 3], null);

			expect(() => createPlainSnapshot(arr, 'test')).toThrow(SaveDataError);
			expect(() => createPlainSnapshot(arr, 'test')).toThrow(
				'test must be an array with own data properties'
			);
		});

		test('rejects an array with a non-index enumerable own key', () => {
			expect.assertions(2);
			const arr = [1, 2, 3];
			Object.defineProperty(arr, 'foo', {
				value: 42,
				enumerable: true,
				configurable: true,
				writable: true
			});

			expect(() => createPlainSnapshot(arr, 'test')).toThrow(SaveDataError);
			expect(() => createPlainSnapshot(arr, 'test')).toThrow(
				'test must contain only own enumerable string-keyed data properties'
			);
		});

		test('clones a cyclic object when rejectCycles is not set', () => {
			expect.assertions(2);
			const obj: Record<string, unknown> = { a: 1 };
			obj.self = obj;

			const cloned = createPlainSnapshot(obj, 'test') as Record<string, unknown>;

			expect(cloned.a).toBe(1);
			expect(cloned.self).toBe(cloned);
		});

		test('rejects a cyclic reference when rejectCycles is true', () => {
			expect.assertions(2);
			const obj: Record<string, unknown> = { a: 1 };
			obj.self = obj;

			expect(() => createPlainSnapshot(obj, 'test', { rejectCycles: true })).toThrow(SaveDataError);
			expect(() => createPlainSnapshot(obj, 'test', { rejectCycles: true })).toThrow(
				'contains a cyclic reference'
			);
		});
	});

	describe('saveCodec coverage gap fills', () => {
		test('v4 migration throws SaveDataError when a boutique product categoryId is a number', () => {
			expect.assertions(2);
			const baseStore = createGame().stores[0]!;
			const game = {
				...createGame(),
				stores: [
					{
						...baseStore,
						archetypeId: 'boutique',
						products: [
							{
								...baseStore.products[0]!,
								categoryId: 123 as unknown as string
							}
						]
					}
				]
			};

			expect(() => migrateSavedGame(game, 4)).toThrow(SaveDataError);
			expect(() => migrateSavedGame(game, 4)).toThrow(
				'Saved v4 product categoryId must be a string'
			);
		});

		test('strict validation rejects save data exceeding MAX_OWN_DATA_DEPTH with a 513-deep extra', () => {
			expect.assertions(2);
			const deepExtra = createDeepEnumerableExtra(513);
			const game = Object.assign(createGame(), { deepExtra });

			expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
			expect(() => validateCurrentGameState(game)).toThrow(/depth/);
		});

		test(
			'strict validation rejects save data exceeding MAX_OWN_DATA_NODES with a wide extra',
			{ timeout: 30_000 },
			() => {
				expect.assertions(2);
				const wideExtra = createWideEnumerableExtra(250_001);
				const game = Object.assign(createGame(), { wideExtra });

				expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
				expect(() => validateCurrentGameState(game)).toThrow(/budget/);
			}
		);

		test('strict validation rejects a non-integer storeCap with invariant-store-cap error code', () => {
			expect.assertions(2);
			const game = createGame({ storeCap: 3.5 });

			let caught: unknown;
			try {
				validateCurrentGameState(game);
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(SaveDataError);
			expect((caught as SaveDataError).code).toBe('invariant-store-cap');
		});

		test('strict validation rejects storeCap below store count with invariant-store-cap error code', () => {
			expect.assertions(2);
			const game = createGame({ storeCap: 0 });

			let caught: unknown;
			try {
				validateCurrentGameState(game);
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(SaveDataError);
			expect((caught as SaveDataError).code).toBe('invariant-store-cap');
		});

		test('strict validation rejects warehouse mismatch with invariant-warehouse error code', () => {
			expect.assertions(2);
			const game = createGame({
				warehouse: { capacity: 1, materials: {}, overflowUnits: 0, overflowCost: 0 }
			});

			let caught: unknown;
			try {
				validateCurrentGameState(game);
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(SaveDataError);
			expect((caught as SaveDataError).code).toBe('invariant-warehouse');
		});

		test('strict validation rejects inventory exceeding buffer capacity with invariant-inventory error code', () => {
			expect.assertions(2);
			const mill = createIndustrialBuilding({
				typeId: 'flour-mill',
				inventory: { grain: 80, flour: 80 }
			});
			const game = createGame({ industrialBuildings: [mill] });

			let caught: unknown;
			try {
				validateCurrentGameState(game);
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(SaveDataError);
			expect((caught as SaveDataError).code).toBe('invariant-inventory');
		});

		test('strict validation rejects a legacy 28x24 retail city size', () => {
			expect.assertions(2);
			const game = createGame({
				cities: [
					{
						id: 'harbor-city',
						name: 'Harbor City',
						width: 28,
						height: 24,
						tiles: Array.from({ length: 28 * 24 }, (_, index) => {
							const x = index % 28;
							const y = Math.floor(index / 28);
							return {
								id: `harbor-city-${x}-${y}`,
								cityId: 'harbor-city',
								x,
								y,
								neighborhood: 'downtown',
								terrain: 'commercial',
								feature: null,
								demand: 72,
								rent: 180,
								footTraffic: 66,
								customerFit: 70,
								locked: false
							};
						})
					}
				],
				stores: []
			});

			expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
			expect(() => validateCurrentGameState(game)).toThrow(
				'uses the legacy 28x24 sandbox city size'
			);
		});

		test('v4 migration is a no-op for a non-boutique store archetype', () => {
			expect.assertions(1);
			const game = createGame();
			game.stores = [{ ...game.stores[0]!, archetypeId: 'convenience' }];

			expect(() => migrateSavedGame(game, 4)).not.toThrow();
		});

		test('v4 migration is a no-op for a boutique store with non-array products', () => {
			expect.assertions(1);
			const game = createGame();
			game.stores = [
				{
					...game.stores[0]!,
					archetypeId: 'boutique',
					products: 'not-an-array' as unknown as GameState['stores'][number]['products']
				}
			];

			expect(() => migrateSavedGame(game, 4)).not.toThrow();
		});

		test('v5 migration leaves a non-object game untouched then fails validation', () => {
			expect.assertions(2);
			const record: SaveRecord = {
				...createManualSaveRecord(),
				schemaVersion: 5 as unknown as typeof SAVE_SCHEMA_VERSION,
				game: null as unknown as GameState
			};

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow('Saved game must be an object');
		});

		test('v6 migration leaves a non-object game untouched then fails validation', () => {
			expect.assertions(2);
			const record: SaveRecord = {
				...createManualSaveRecord(),
				schemaVersion: 6 as unknown as typeof SAVE_SCHEMA_VERSION,
				game: null as unknown as GameState
			};

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow('Saved game must be an object');
		});

		test('normalizeSandboxStoreStockHealth leaves a store with non-array products for strict validation', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					stores: [
						{
							...createGame().stores[0]!,
							products: 'not-an-array' as unknown as GameState['stores'][number]['products']
						}
					]
				}
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow(
				'Saved game stores[0] products must be an array'
			);
		});

		test('normalizeSandboxWarehouseState leaves a non-object warehouse for strict validation', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					warehouse: 'not-an-object' as unknown as GameState['warehouse']
				}
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow('Saved game warehouse must be an object');
		});

		test('normalizeSandboxWarehouseState leaves non-finite overflowUnits for strict validation', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					warehouse: {
						...createGame().warehouse,
						overflowUnits: Number.NaN
					}
				}
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow(
				'warehouse overflowUnits must be a finite number'
			);
		});

		test('normalizeSandboxWarehouseState leaves non-finite overflowCost for strict validation', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					warehouse: {
						...createGame().warehouse,
						overflowCost: Number.NaN
					}
				}
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow(
				'warehouse overflowCost must be a finite number'
			);
		});

		test('normalizeSandboxWarehouseState leaves non-object materials for strict validation', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					warehouse: {
						...createGame().warehouse,
						materials: 'not-an-object' as unknown as Record<MaterialId, number>
					}
				}
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow('warehouse materials must be an object');
		});

		test('normalizeSandboxWarehouseState leaves array materials for strict validation', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					warehouse: {
						...createGame().warehouse,
						materials: [] as unknown as Record<MaterialId, number>
					}
				}
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow('warehouse materials must be an object');
		});

		test('normalizeSandboxWarehouseState leaves non-finite material quantities for strict validation', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					warehouse: {
						...createGame().warehouse,
						materials: { water: Number.NaN } as Partial<Record<MaterialId, number>>
					}
				}
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow(
				'warehouse materials water must be a finite number'
			);
		});

		test('normalizeSandboxWarehouseState leaves negative material quantities for strict validation', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					warehouse: {
						...createGame().warehouse,
						materials: { water: -1 } as Partial<Record<MaterialId, number>>
					}
				}
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow(
				'warehouse materials water must be at least 0'
			);
		});

		test('normalizeSavedRetailStorePlacements leaves a store with an empty cityId for strict validation', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					stores: [
						{
							...createGame().stores[0]!,
							cityId: '',
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

		test('normalizeSavedRetailStorePlacements leaves a store with non-finite mapX for strict validation', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					stores: [
						{
							...createGame().stores[0]!,
							mapX: Number.NaN
						}
					]
				} as unknown as Partial<GameState>
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow('mapX must be a finite number');
		});

		test('normalizeSavedRetailStorePlacements leaves a store with non-string mapY for strict validation', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					stores: [
						{
							...createGame().stores[0]!,
							mapY: 'bad' as unknown as number
						}
					]
				} as unknown as Partial<GameState>
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow('mapY must be a finite number');
		});

		test('normalizeSavedRetailCity leaves a non-retail city id in the cities array for validation', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					cities: [
						createFixtureRetailCity(),
						{
							id: 'industry-city',
							name: 'Industry City',
							width: 3,
							height: 3,
							tiles: Array.from({ length: 9 }, (_, index) => {
								const x = index % 3;
								const y = Math.floor(index / 3);
								return {
									id: `industry-city-${x}-${y}`,
									cityId: 'industry-city',
									x,
									y,
									neighborhood: 'downtown',
									terrain: 'commercial',
									feature: null,
									demand: 72,
									rent: 180,
									footTraffic: 66,
									customerFit: 70,
									locked: false
								};
							})
						}
					],
					stores: []
				} as unknown as Partial<GameState>
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow(
				'retail city industry-city must use a retail catalog ID'
			);
		});

		test('normalizeSavedRetailCity leaves a current-size retail city untouched', () => {
			expect.assertions(1);
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
							mapX: tile.x,
							mapY: tile.y,
							location: formatLocation(tile),
							localDemand: computeStoreLocalDemand(tile)
						}
					]
				} as unknown as Partial<GameState>
			});

			expect(() => validateSaveRecord(record)).not.toThrow();
		});
	});
});
