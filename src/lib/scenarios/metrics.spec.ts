import { describe, expect, it } from 'vitest';
import type {
	DailyProductReport,
	DailyProductionReport,
	DailyReport,
	DailyStoreReport,
	GameState,
	IndustrialBuilding,
	ProductId,
	Store
} from '$lib/game/types';
import { createEmptyFinanceState } from '$lib/game/finance';
import type { LoanInstrument } from '$lib/game/types';
import { emptyLogisticsReport } from '$lib/game/logisticsReport.testUtils';
import { createInitialEventRuntime } from '$lib/game/eventSelection';
import type {
	ScenarioComparator,
	ScenarioCondition,
	ScenarioDefinition,
	ScenarioMetricQuery,
	ScenarioMetricWindow
} from './types';
import {
	cityInventoryEvidenceId,
	encodeEvidenceSegment,
	evaluateCondition,
	evaluateMetric,
	evaluateScenarioConditions,
	marketEvidenceId,
	METRIC_REGISTRY,
	productEvidenceId,
	transferArrivalEvidenceId,
	validateScenarioReportInvariants
} from './metrics';
import { METRIC_WINDOWS } from './validation/shared';

function productionReport(): DailyProductionReport {
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
		warehouseCapacity: 100,
		warehouseUsed: 0,
		railShipments: [],
		railUsage: {},
		cityInventories: []
	};
}

function product(overrides: Partial<DailyProductReport> = {}): DailyProductReport {
	return {
		productId: 'bottled-water',
		brandId: 'common-ground',
		name: 'Bottled Water',
		unitsSold: 0,
		demandMissed: 0,
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		endingStock: 0,
		warehouseUnits: 0,
		warehouseValue: 0,
		importedUnits: 0,
		importCost: 0,
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
		baseSellingPrice: 1,
		effectiveSellingPrice: 1,
		markdownAmount: 0,
		...overrides
	};
}

function storeReport(
	storeId: string,
	productReports: DailyProductReport[] = [],
	overrides: Partial<DailyStoreReport> = {}
): DailyStoreReport {
	return {
		storeId,
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		operatingCosts: 0,
		importSpend: productReports.reduce((sum, report) => sum + report.importSpend, 0),
		netIncome: 0,
		customersServed: 0,
		demandMissed: productReports.reduce((sum, report) => sum + report.demandMissed, 0),
		staffingCoverage: 100,
		staffingShortage: { manager: 0, general: 0 },
		stockHealth: 100,
		staffMorale: 100,
		reputation: 100,
		brandReputationAdjustment: 0,
		marketPosition: 100,
		productReports,
		inventoryLossExpense: productReports.reduce(
			(sum, report) => sum + report.wasteValue + report.shrinkValue,
			0
		),
		warnings: [],
		...overrides,
		replenishment: overrides.replenishment ?? null
	};
}

function report(
	day: number,
	netIncome: number,
	storeReports: DailyStoreReport[] = [],
	overrides: Partial<DailyReport> = {}
): DailyReport {
	return {
		day,
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		operatingCosts: 0,
		payrollCost: 0,
		importSpend: storeReports.reduce((sum, item) => sum + item.importSpend, 0),
		cashBefore: 1_000,
		operatingIncome: 0,
		operatingCashFlow: netIncome,
		interestAccrued: 0,
		interestPaid: 0,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 0,
		refinancedPrincipal: 0,
		financingCashFlow: 0,
		netCashChange: netIncome,
		netIncome,
		cashAfter: 1_000 + netIncome,
		outstandingPrincipalAfter: 0,
		companyBookValueAfter: 0,
		nextLoanPayment: null,
		scorecard: {
			profit: 50,
			customerSatisfaction: 50,
			staffMorale: 50,
			marketPosition: 50
		},
		productionReport: productionReport(),
		storeReports,
		inventoryLossExpense: storeReports.reduce((sum, item) => sum + item.inventoryLossExpense, 0),
		modifierImpacts: [],
		modifierLifecycle: [],
		marketReports: [],
		warnings: [],
		...overrides,
		logistics: overrides.logistics ?? emptyLogisticsReport()
	};
}

function store(id: string): Store {
	return {
		id,
		level: 1,
		name: id,
		archetypeId: 'convenience',
		location: { neighborhoodId: 'downtown', x: 0, y: 0 },
		cityId: 'harbor-city',
		tileId: `${id}-tile`,
		mapX: 0,
		mapY: 0,
		daysOpen: 1,
		reputation: 50,
		stockHealth: 50,
		products: [],
		staffMorale: 50,
		staffCapacity: 1,
		localDemand: 50,
		managerQuality: 50
	};
}

function loan(id: string, overrides: Partial<LoanInstrument> = {}): LoanInstrument {
	return {
		id,
		purpose: 'founding',
		status: 'active',
		openedOnDay: 1,
		originalPrincipal: 5_000,
		remainingPrincipal: 5_000,
		annualInterestRateBps: 1_200,
		termDays: 84,
		installmentsProcessed: 0,
		nextPaymentDay: 8,
		lastInterestAccrualDay: 1,
		accruedInterestMicros: 0,
		overdueInterest: 0,
		overduePrincipal: 0,
		arrearsSinceDay: null,
		scheduledPaymentCount: 0,
		onTimePaymentCount: 0,
		missedPaymentCount: 0,
		...overrides
	};
}

function building(id: string, typeId: IndustrialBuilding['typeId']): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId,
		cityId: 'industry-city',
		tileId: `${id}-tile`,
		mapX: 0,
		mapY: 0,
		status: 'idle',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {}
	};
}

function game(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 280,
		rngState: 12_345,
		day: 1,
		cash: 10,
		finance: createEmptyFinanceState(1),
		policy: {
			pricing: 'standard',
			inventory: 'balanced',
			staffing: 'efficient',
			marketing: 'none',
			service: 'balanced'
		},
		policyOverrides: [],
		managerDelegations: [],
		managerActionHistory: [],
		scorecard: {
			profit: 61,
			customerSatisfaction: 62,
			staffMorale: 63,
			marketPosition: 64
		},
		world: {} as GameState['world'],
		storeCap: 5,
		cities: [],
		activeCityId: 'harbor-city',
		industryCities: [],
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
		stores: [],
		competitors: [],
		staff: [],
		hiringCandidates: [],
		events: overrides.events ?? createInitialEventRuntime(280),
		decisions: [],
		reports: [],
		...overrides
	};
}

function metricGame(): GameState {
	const rows = [
		{
			day: 1,
			netIncome: 10,
			storeId: 'store:z',
			importSpend: 10,
			imported: 2,
			local: 3,
			sold: 4,
			missed: 1,
			waste: 1,
			market: { pool: 100, playerPool: 20, share: 0.5 }
		},
		{
			day: 2,
			netIncome: -4,
			storeId: 'store:a',
			importSpend: 20,
			imported: 4,
			local: 1,
			sold: 5,
			missed: 2,
			waste: 2,
			market: { pool: 300, playerPool: 210, share: 0.4 }
		},
		{
			day: 7,
			netIncome: 6,
			storeId: 'store/a',
			importSpend: 30,
			imported: 6,
			local: 6,
			sold: 7,
			missed: 3,
			waste: 3,
			market: { pool: 100, playerPool: 50, share: 0.1 }
		},
		{
			day: 8,
			netIncome: 8,
			storeId: 'store:B',
			importSpend: 40,
			imported: 8,
			local: 10,
			sold: 9,
			missed: 4,
			waste: 4,
			market: { pool: 200, playerPool: 150, share: 0.9 }
		}
	];
	const reports = rows.map((row) =>
		report(
			row.day,
			row.netIncome,
			[
				storeReport(row.storeId, [
					product({
						importSpend: row.importSpend,
						importedUnits: row.imported,
						warehouseUnits: row.local,
						unitsSold: row.sold,
						demandMissed: row.missed,
						wasteUnits: row.waste
					}),
					product({
						productId: 'snacks',
						name: 'Snacks',
						unitsSold: 100,
						wasteUnits: 50
					})
				])
			],
			{
				// Stored pools are the canonical scenario metric inputs; each
				// stored playerShare deliberately disagrees with the pool ratio
				// so re-rounding from the share would fail these fixtures.
				marketReports: [
					{
						cityId: 'harbor-city',
						productId: 'bottled-water',
						cityDemandPool: row.market.pool,
						playerDemandPool: row.market.playerPool,
						playerShare: row.market.share,
						playerShareDelta: null,
						playerAttractionScore: 100,
						competitors: []
					},
					{
						cityId: 'harbor-city',
						productId: 'produce',
						cityDemandPool: 500,
						playerDemandPool: 500,
						playerShare: 1,
						playerShareDelta: null,
						playerAttractionScore: 100,
						competitors: []
					}
				]
			}
		)
	);

	return game({
		day: 9,
		cash: 12_345,
		reports,
		stores: [store('z/store'), store('B/store'), store('a/store')],
		industrialBuildings: [
			building('z/build', 'water-pump'),
			building('A/build', 'water-pump'),
			building('warehouse', 'warehouse')
		],
		cityInventories: [
			{
				cityId: 'industry-city',
				materials: { water: 42 }
			},
			{
				cityId: 'breadbasket-basin',
				materials: { water: 17 }
			}
		],
		finance: {
			...createEmptyFinanceState(1),
			loans: [
				loan('loan-1', { remainingPrincipal: 5_000, missedPaymentCount: 2 }),
				loan('loan-2', {
					status: 'paid',
					originalPrincipal: 8_000,
					remainingPrincipal: 0,
					missedPaymentCount: 1
				}),
				loan('loan-3', { remainingPrincipal: 1_500 }),
				loan('loan-4', {
					status: 'refinanced',
					remainingPrincipal: 0,
					missedPaymentCount: 0
				})
			]
		}
	});
}

it('uses operating cash flow rather than net income for profit-like metrics', () => {
	const fixture = game({
		reports: [
			report(1, 900, [], { operatingCashFlow: -10 }),
			report(2, -900, [], { operatingCashFlow: 20 })
		]
	});
	expect(
		evaluateMetric(fixture, { metric: 'daily-net-income' }, { kind: 'run-to-date' })
	).toMatchObject({ actual: 5 });
	expect(
		evaluateMetric(fixture, { metric: 'cumulative-net-income' }, { kind: 'run-to-date' })
	).toMatchObject({ actual: 10 });
	expect(
		evaluateMetric(
			fixture,
			{ metric: 'consecutive-positive-net-income-reports' },
			{ kind: 'current' }
		)
	).toMatchObject({ actual: 1 });
});

function condition(
	id: string,
	query: ScenarioMetricQuery,
	comparator: ScenarioComparator,
	target: number,
	window: ScenarioMetricWindow,
	requiresCompleteWindow?: boolean
): ScenarioCondition {
	return {
		id,
		labelKey: 'store.defaultName',
		query,
		comparator,
		target,
		window,
		...(requiresCompleteWindow === undefined ? {} : { requiresCompleteWindow })
	};
}

function definition(overrides: Partial<ScenarioDefinition> = {}): ScenarioDefinition {
	return {
		id: 'first-profit',
		version: 1,
		titleKey: 'store.defaultName',
		summaryKey: 'store.defaultName',
		briefingKey: 'store.defaultName',
		strategyHintKey: 'store.defaultName',
		officialSeed: 280,
		dayLimit: 30,
		start: {
			foundingStore: {
				ref: 'founder',
				archetypeId: 'convenience',
				cityId: 'harbor-city',
				tileId: 'harbor-city-1-1'
			},
			industrialBuildings: [],
			rails: [],
			overrides: {}
		},
		content: {
			cityIds: ['harbor-city'],
			archetypeIds: ['convenience'],
			productIds: ['bottled-water'],
			materialIds: ['water'],
			buildingTypeIds: ['water-pump'],
			retailPlacements: [],
			industrialPlacements: []
		},
		allowedCommands: ['advanceDay'],
		modifiers: [],
		requiredObjectives: [],
		optionalObjectives: [],
		failures: [],
		scoreComponents: [],
		medalThresholds: { silver: 700, gold: 850 },
		...overrides
	};
}

function deepFreeze<T>(value: T): T {
	if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
	Object.freeze(value);
	for (const nested of Object.values(value)) deepFreeze(nested);
	return value;
}

describe('scenario metric evidence IDs', () => {
	it('percent-encodes every string segment through one canonical helper', () => {
		expect(encodeEvidenceSegment('store/a ?%')).toBe('store%2Fa%20%3F%25');
	});

	it('derives collision-safe canonical product evidence IDs', () => {
		expect(productEvidenceId(7, 'store/a', 'water/large' as ProductId)).toBe(
			'report:7/store:store%2Fa/product:water%2Flarge'
		);
	});

	it('scopes market evidence to the day, city, and product triple', () => {
		expect(marketEvidenceId(7, 'harbor/city', 'water/large' as ProductId)).toBe(
			'report:7/market:harbor%2Fcity/product:water%2Flarge'
		);
	});

	it('scopes inventory evidence to the city and material pair', () => {
		expect(cityInventoryEvidenceId('industry/city', 'water/large')).toBe(
			'city-inventory:industry%2Fcity/material:water%2Flarge'
		);
	});

	it('sorts entity and report evidence IDs by plain code-unit order', () => {
		const state = metricGame();

		expect(
			evaluateMetric(state, { metric: 'store-count' }, { kind: 'current' }).contributingIds
		).toEqual(['B/store', 'a/store', 'z/store']);
		expect(
			evaluateMetric(
				state,
				{ metric: 'industrial-building-count', buildingTypeIds: ['water-pump'] },
				{ kind: 'current' }
			).contributingIds
		).toEqual(['A/build', 'z/build']);
		expect(
			evaluateMetric(state, { metric: 'total-debt' }, { kind: 'current' }).contributingIds
		).toEqual(['loan:loan-1', 'loan:loan-3']);
		expect(
			evaluateMetric(
				state,
				{ metric: 'retail-imported-units', productIds: ['bottled-water'] },
				{ kind: 'run-to-date' }
			).contributingIds
		).toEqual([
			'report:1/store:store%3Az/product:bottled-water',
			'report:2/store:store%3Aa/product:bottled-water',
			'report:7/store:store%2Fa/product:bottled-water',
			'report:8/store:store%3AB/product:bottled-water'
		]);
	});

	it('scopes transfer arrival evidence to the day and transfer order ID', () => {
		expect(transferArrivalEvidenceId(7, 'transfer/a')).toBe('report:7/transfer:transfer%2Fa');
	});
});

describe('registered scenario metrics', () => {
	it.each([
		[{ metric: 'cash' }, { kind: 'current' }, 12_345, []],
		[{ metric: 'total-debt' }, { kind: 'current' }, 6_500, ['loan:loan-1', 'loan:loan-3']],
		[{ metric: 'missed-loan-payments' }, { kind: 'current' }, 3, ['loan:loan-1', 'loan:loan-2']],
		[{ metric: 'daily-net-income' }, { kind: 'current' }, 8, ['report:8']],
		[
			{ metric: 'daily-net-income' },
			{ kind: 'run-to-date' },
			5,
			['report:1', 'report:2', 'report:7', 'report:8']
		],
		[
			{ metric: 'daily-net-income' },
			{ kind: 'trailing-reports', count: 2 },
			7,
			['report:7', 'report:8']
		],
		[
			{ metric: 'daily-net-income' },
			{ kind: 'fixed-report-days', startDay: 2, endDay: 7 },
			1,
			['report:2', 'report:7']
		],
		[
			{ metric: 'cumulative-net-income' },
			{ kind: 'run-to-date' },
			20,
			['report:1', 'report:2', 'report:7', 'report:8']
		],
		[{ metric: 'consecutive-positive-net-income-reports' }, { kind: 'current' }, 1, ['report:8']],
		[{ metric: 'completed-retail-import-cycles' }, { kind: 'run-to-date' }, 1, ['report:7']],
		[
			{ metric: 'retail-import-spend', productIds: ['bottled-water'] },
			{ kind: 'run-to-date' },
			100
		],
		[
			{ metric: 'retail-imported-units', productIds: ['bottled-water'] },
			{ kind: 'run-to-date' },
			20
		],
		[{ metric: 'retail-local-units', productIds: ['bottled-water'] }, { kind: 'run-to-date' }, 20],
		[{ metric: 'retail-local-share', productIds: ['bottled-water'] }, { kind: 'run-to-date' }, 0.5],
		[{ metric: 'units-sold', productIds: ['bottled-water'] }, { kind: 'run-to-date' }, 25],
		[{ metric: 'demand-missed', productIds: ['bottled-water'] }, { kind: 'run-to-date' }, 10],
		[
			{ metric: 'product-waste-units', productIds: ['bottled-water'] },
			{ kind: 'run-to-date' },
			10,
			[
				'report:1/store:store%3Az/product:bottled-water',
				'report:2/store:store%3Aa/product:bottled-water',
				'report:7/store:store%2Fa/product:bottled-water',
				'report:8/store:store%3AB/product:bottled-water'
			]
		],
		[
			{ metric: 'product-waste-share', productIds: ['bottled-water'] },
			{ kind: 'run-to-date' },
			10 / 35
		],
		[
			{ metric: 'player-market-share', productIds: ['bottled-water'] },
			{ kind: 'run-to-date' },
			430 / 700,
			[
				'report:1/market:harbor-city/product:bottled-water',
				'report:2/market:harbor-city/product:bottled-water',
				'report:7/market:harbor-city/product:bottled-water',
				'report:8/market:harbor-city/product:bottled-water'
			]
		],
		[{ metric: 'scorecard', score: 'profit' }, { kind: 'current' }, 61, []],
		[{ metric: 'store-count' }, { kind: 'current' }, 3],
		[
			{ metric: 'industrial-building-count', buildingTypeIds: ['water-pump'] },
			{ kind: 'current' },
			2
		],
		[
			{ metric: 'city-inventory-quantity', cityId: 'industry-city', materialId: 'water' },
			{ kind: 'current' },
			42,
			['city-inventory:industry-city/material:water']
		]
	] as const)(
		'evaluates $0 over $1',
		(query, window, actual, contributingIds?: readonly string[]) => {
			const result = evaluateMetric(metricGame(), query, window);

			expect(result).toMatchObject({ actual, windowComplete: true });
			if (contributingIds) expect(result.contributingIds).toEqual(contributingIds);
		}
	);

	function arrivalGame(): GameState {
		const arrivals = [
			{
				day: 2,
				rows: [
					{
						transferOrderId: 'transfer-2',
						originCityId: 'industry-city' as const,
						destinationCityId: 'breadbasket-basin' as const,
						materialId: 'water' as const,
						quantity: 40
					},
					{
						transferOrderId: 'transfer-3',
						originCityId: 'industry-city' as const,
						destinationCityId: 'breadbasket-basin' as const,
						materialId: 'grain' as const,
						quantity: 90
					},
					{
						transferOrderId: 'transfer-4',
						originCityId: 'industry-city' as const,
						destinationCityId: 'quarry-works' as const,
						materialId: 'water' as const,
						quantity: 70
					}
				]
			},
			{
				day: 7,
				rows: [
					{
						transferOrderId: 'transfer-9',
						originCityId: 'industry-city' as const,
						destinationCityId: 'breadbasket-basin' as const,
						materialId: 'water' as const,
						quantity: 60
					}
				]
			}
		];
		const arrivalByDay = new Map(arrivals.map((entry) => [entry.day, entry.rows]));
		return game({
			reports: [1, 2, 7, 8].map((day) =>
				report(day, 5, [], {
					logistics: {
						...emptyLogisticsReport(),
						arrivals: arrivalByDay.get(day) ?? []
					}
				})
			)
		});
	}

	it('sums only destination-and-material matching arrivals across reports', () => {
		const query = {
			metric: 'delivered-transfer-units',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water'
		} as const;

		expect(evaluateMetric(arrivalGame(), query, { kind: 'run-to-date' })).toEqual({
			actual: 100,
			contributingIds: ['report:2/transfer:transfer-2', 'report:7/transfer:transfer-9'],
			windowComplete: true
		});
		expect(
			evaluateMetric(arrivalGame(), query, { kind: 'trailing-reports', count: 1 }).actual
		).toBe(0);
		expect(
			evaluateMetric(arrivalGame(), query, { kind: 'fixed-report-days', startDay: 1, endDay: 2 })
				.actual
		).toBe(40);
		// Wrong destination and wrong material stay excluded from the sum.
		expect(
			evaluateMetric(
				arrivalGame(),
				{ ...query, destinationCityId: 'quarry-works' },
				{ kind: 'run-to-date' }
			).actual
		).toBe(70);
		expect(
			evaluateMetric(arrivalGame(), { ...query, materialId: 'grain' }, { kind: 'run-to-date' })
				.actual
		).toBe(90);
	});

	it('ignores in-transit transfers until their arrival-day report', () => {
		const state = game({
			reports: [report(1, 5), report(2, 5)],
			logistics: {
				transferOrders: [
					{
						id: 'transfer-1',
						source: { kind: 'recurring-route', routeId: 'route-1' },
						originCityId: 'industry-city',
						destinationCityId: 'breadbasket-basin',
						materialId: 'water',
						quantity: 55,
						createdOnDay: 1,
						dispatchedOnDay: 1,
						arrivalOnDay: 3,
						transportCost: 110,
						status: 'in-transit'
					}
				],
				recurringRoutes: [],
				nextTransferSequence: 2,
				nextRouteSequence: 1
			}
		});
		const query = {
			metric: 'delivered-transfer-units',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water'
		} as const;

		expect(evaluateMetric(state, query, { kind: 'run-to-date' })).toEqual({
			actual: 0,
			contributingIds: [],
			windowComplete: true
		});
		const arrived = game({
			...state,
			reports: [
				report(1, 5),
				report(2, 5),
				report(3, 5, [], {
					logistics: {
						...emptyLogisticsReport(),
						arrivals: [
							{
								transferOrderId: 'transfer-1',
								originCityId: 'industry-city',
								destinationCityId: 'breadbasket-basin',
								materialId: 'water',
								quantity: 55
							}
						]
					}
				})
			]
		});

		expect(
			evaluateMetric(arrived, query, { kind: 'fixed-report-days', startDay: 3, endDay: 3 })
		).toEqual({
			actual: 55,
			contributingIds: ['report:3/transfer:transfer-1'],
			windowComplete: true
		});
	});

	it.each([
		[{ metric: 'daily-net-income' }, { kind: 'current' }],
		[{ metric: 'cumulative-net-income' }, { kind: 'run-to-date' }],
		[{ metric: 'consecutive-positive-net-income-reports' }, { kind: 'current' }],
		[{ metric: 'completed-retail-import-cycles' }, { kind: 'run-to-date' }],
		[{ metric: 'retail-import-spend', productIds: ['bottled-water'] }, { kind: 'run-to-date' }],
		[{ metric: 'retail-imported-units', productIds: ['bottled-water'] }, { kind: 'run-to-date' }],
		[{ metric: 'retail-local-units', productIds: ['bottled-water'] }, { kind: 'run-to-date' }],
		[{ metric: 'retail-local-share', productIds: ['bottled-water'] }, { kind: 'run-to-date' }],
		[{ metric: 'units-sold', productIds: ['bottled-water'] }, { kind: 'run-to-date' }],
		[{ metric: 'demand-missed', productIds: ['bottled-water'] }, { kind: 'run-to-date' }],
		[{ metric: 'product-waste-units', productIds: ['bottled-water'] }, { kind: 'run-to-date' }],
		[{ metric: 'product-waste-share', productIds: ['bottled-water'] }, { kind: 'run-to-date' }],
		[{ metric: 'player-market-share', productIds: ['bottled-water'] }, { kind: 'run-to-date' }],
		[
			{
				metric: 'delivered-transfer-units',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water'
			},
			{ kind: 'run-to-date' }
		]
	] as const)('uses zero and no IDs for an empty report window: $0', (query, window) => {
		expect(evaluateMetric(game(), query, window)).toEqual({
			actual: 0,
			contributingIds: [],
			windowComplete: true
		});
	});

	it('rounds daily net income means like the existing report summaries', () => {
		const state = game({ reports: [report(1, 1), report(2, 2)] });

		expect(
			evaluateMetric(state, { metric: 'daily-net-income' }, { kind: 'run-to-date' }).actual
		).toBe(2);
	});

	it('bounds consecutive positive income to the selected trailing-report window', () => {
		const query = { metric: 'consecutive-positive-net-income-reports' } as const;
		const window = { kind: 'trailing-reports', count: 3 } as const;

		expect(
			evaluateMetric(
				game({ reports: [1, 2, 3, 4, 5].map((day) => report(day, 10)) }),
				query,
				window,
				true
			)
		).toEqual({
			actual: 3,
			contributingIds: ['report:3', 'report:4', 'report:5'],
			windowComplete: true
		});
		expect(
			evaluateMetric(
				game({
					reports: [report(1, 10), report(2, -1), report(3, 10), report(4, 10), report(5, 10)]
				}),
				query,
				window,
				true
			)
		).toEqual({
			actual: 3,
			contributingIds: ['report:3', 'report:4', 'report:5'],
			windowComplete: true
		});
		expect(
			evaluateMetric(game({ reports: [report(1, 10), report(2, 10)] }), query, window, true)
		).toEqual({
			actual: 2,
			contributingIds: ['report:1', 'report:2'],
			windowComplete: false
		});
	});

	it('counts only reports whose exact report day is an import day', () => {
		const state = game({
			reports: [1, 6, 7, 8, 14].map((day) => report(day, 0))
		});

		expect(
			evaluateMetric(state, { metric: 'completed-retail-import-cycles' }, { kind: 'run-to-date' })
		).toEqual({
			actual: 2,
			contributingIds: ['report:14', 'report:7'],
			windowComplete: true
		});
	});

	it('reads only the named city inventory rather than the aggregate projection', () => {
		const state = metricGame();

		expect(
			evaluateMetric(
				state,
				{ metric: 'city-inventory-quantity', cityId: 'industry-city', materialId: 'water' },
				{ kind: 'current' }
			)
		).toEqual({
			actual: 42,
			contributingIds: ['city-inventory:industry-city/material:water'],
			windowComplete: true
		});
		expect(
			evaluateMetric(
				state,
				{ metric: 'city-inventory-quantity', cityId: 'breadbasket-basin', materialId: 'water' },
				{ kind: 'current' }
			)
		).toMatchObject({ actual: 17 });
	});

	it('uses the current cash after a non-day command instead of stale report cash', () => {
		const state = game({ cash: 777, reports: [report(1, 10, [], { cashAfter: 111 })] });

		expect(evaluateMetric(state, { metric: 'cash' }, { kind: 'current' }).actual).toBe(777);
	});

	it('keeps product waste scoped to the allowlisted product IDs', () => {
		const state = metricGame();

		// Every daily report carries a snacks row with 50 wasted and 100 sold
		// units (200/400 across four reports) that must stay out of every
		// produce-scoped query.
		expect(
			evaluateMetric(
				state,
				{ metric: 'product-waste-units', productIds: ['snacks'] },
				{ kind: 'run-to-date' }
			).actual
		).toBe(200);
		expect(
			evaluateMetric(
				state,
				{ metric: 'product-waste-share', productIds: ['snacks'] },
				{ kind: 'run-to-date' }
			).actual
		).toBeCloseTo(200 / 600, 15);
		expect(
			evaluateMetric(
				state,
				{ metric: 'product-waste-units', productIds: ['bottled-water', 'snacks'] },
				{ kind: 'run-to-date' }
			).actual
		).toBe(210);
	});

	it('returns zero product waste share when nothing was sold or wasted, keeping row evidence', () => {
		const state = game({
			reports: [report(1, 0, [storeReport('store/a', [product({ unitsSold: 0, wasteUnits: 0 })])])]
		});

		expect(
			evaluateMetric(
				state,
				{ metric: 'product-waste-share', productIds: ['bottled-water'] },
				{ kind: 'run-to-date' }
			)
		).toEqual({
			actual: 0,
			contributingIds: ['report:1/store:store%2Fa/product:bottled-water'],
			windowComplete: true
		});
	});

	it('counts spoilage of opening stock in the waste share outflow denominator', () => {
		// A pure-spoilage day (no sales, all outflow wasted) reports share 1:
		// the denominator includes stock wasted from before the window started,
		// unlike receipts-based waste ratios.
		const state = game({
			reports: [
				report(11, 0, [storeReport('store/a', [product({ unitsSold: 0, wasteUnits: 12 })])])
			]
		});

		expect(
			evaluateMetric(
				state,
				{ metric: 'product-waste-share', productIds: ['bottled-water'] },
				{ kind: 'run-to-date' }
			).actual
		).toBe(1);
		expect(
			evaluateMetric(
				state,
				{ metric: 'product-waste-units', productIds: ['bottled-water'] },
				{ kind: 'run-to-date' }
			).actual
		).toBe(12);
	});

	it('weights player market share by pooled demand across reports, not the mean of daily shares', () => {
		const state = metricGame();

		// Trailing 2 pools 100@20% (day 7) and 200@75% (day 8): pooled weighting
		// gives 200/300, while the mean of daily shares would be 47.5%.
		expect(
			evaluateMetric(
				state,
				{ metric: 'player-market-share', productIds: ['bottled-water'] },
				{ kind: 'trailing-reports', count: 2 }
			)
		).toEqual({
			actual: 200 / 300,
			contributingIds: [
				'report:7/market:harbor-city/product:bottled-water',
				'report:8/market:harbor-city/product:bottled-water'
			],
			windowComplete: true
		});
	});

	it('sums the stored player demand pool instead of re-rounding from playerShare', () => {
		// Every metricGame row stores a playerShare that disagrees with its pool
		// ratio, so only the stored pools can produce 430/700.
		expect(
			evaluateMetric(
				metricGame(),
				{ metric: 'player-market-share', productIds: ['bottled-water'] },
				{ kind: 'run-to-date' }
			).actual
		).toBe(430 / 700);
	});

	it('returns zero player market share on zero demand while keeping the row evidence', () => {
		const state = game({
			reports: [
				report(1, 0, [], {
					marketReports: [
						{
							cityId: 'harbor-city',
							productId: 'bottled-water',
							cityDemandPool: 0,
							playerDemandPool: 0,
							playerShare: 0,
							playerShareDelta: null,
							playerAttractionScore: 0,
							competitors: []
						}
					]
				})
			]
		});

		expect(
			evaluateMetric(
				state,
				{ metric: 'player-market-share', productIds: ['bottled-water'] },
				{ kind: 'run-to-date' }
			)
		).toEqual({
			actual: 0,
			contributingIds: ['report:1/market:harbor-city/product:bottled-water'],
			windowComplete: true
		});
	});

	it('keeps player market share scoped to the allowlisted product IDs', () => {
		// Every report also carries a produce market row pooled at 500/500 that
		// must stay out of the bottled-water query (and vice versa).
		expect(
			evaluateMetric(
				metricGame(),
				{ metric: 'player-market-share', productIds: ['produce'] },
				{ kind: 'run-to-date' }
			)
		).toEqual({
			actual: 1,
			contributingIds: [
				'report:1/market:harbor-city/product:produce',
				'report:2/market:harbor-city/product:produce',
				'report:7/market:harbor-city/product:produce',
				'report:8/market:harbor-city/product:produce'
			],
			windowComplete: true
		});
		expect(
			evaluateMetric(
				metricGame(),
				{ metric: 'player-market-share', productIds: ['bottled-water'] },
				{ kind: 'fixed-report-days', startDay: 2, endDay: 7 }
			).actual
		).toBe(260 / 400);
	});

	it('cannot qualify player market share before the trailing window completes', () => {
		expect(
			evaluateMetric(
				metricGame(),
				{ metric: 'player-market-share', productIds: ['bottled-water'] },
				{ kind: 'trailing-reports', count: 5 },
				true
			)
		).toMatchObject({ actual: 430 / 700, windowComplete: false });
	});

	it('returns zero local share when selected local and imported units are both zero', () => {
		const state = game({
			reports: [
				report(1, 0, [storeReport('store/a', [product({ warehouseUnits: 0, importedUnits: 0 })])])
			]
		});

		expect(
			evaluateMetric(
				state,
				{ metric: 'retail-local-share', productIds: ['bottled-water'] },
				{ kind: 'run-to-date' }
			)
		).toEqual({
			actual: 0,
			contributingIds: ['report:1/store:store%2Fa/product:bottled-water'],
			windowComplete: true
		});
	});

	it('counts delinquent principal once and ignores closed loans for total debt', () => {
		const state = game({
			finance: {
				...createEmptyFinanceState(1),
				loans: [
					loan('loan-a', {
						status: 'delinquent',
						remainingPrincipal: 4_000,
						overduePrincipal: 2_500,
						missedPaymentCount: 1
					}),
					loan('loan-b', { status: 'paid', remainingPrincipal: 0 })
				]
			}
		});

		expect(evaluateMetric(state, { metric: 'total-debt' }, { kind: 'current' })).toEqual({
			actual: 4_000,
			contributingIds: ['loan:loan-a'],
			windowComplete: true
		});
	});

	it('keeps missed loan payments across paid and refinanced history', () => {
		const state = game({
			finance: {
				...createEmptyFinanceState(1),
				loans: [
					loan('loan-a', { status: 'refinanced', remainingPrincipal: 0, missedPaymentCount: 2 }),
					loan('loan-b', { status: 'paid', remainingPrincipal: 0, missedPaymentCount: 1 }),
					loan('loan-c', { missedPaymentCount: 0 })
				]
			}
		});

		expect(evaluateMetric(state, { metric: 'missed-loan-payments' }, { kind: 'current' })).toEqual({
			actual: 3,
			contributingIds: ['loan:loan-a', 'loan:loan-b'],
			windowComplete: true
		});
	});

	it('rejects a metric/window pair outside the registered catalog', () => {
		expect(() => evaluateMetric(metricGame(), { metric: 'cash' }, { kind: 'run-to-date' })).toThrow(
			'Metric cash does not support run-to-date.'
		);
		expect(() =>
			evaluateMetric(metricGame(), { metric: 'total-debt' }, { kind: 'run-to-date' })
		).toThrow('Metric total-debt does not support run-to-date.');
		expect(() =>
			evaluateMetric(
				metricGame(),
				{ metric: 'missed-loan-payments' },
				{ kind: 'trailing-reports', count: 3 }
			)
		).toThrow('Metric missed-loan-payments does not support trailing-reports.');
		expect(() =>
			evaluateMetric(
				metricGame(),
				{ metric: 'product-waste-units', productIds: ['bottled-water'] },
				{ kind: 'current' }
			)
		).toThrow('Metric product-waste-units does not support current.');
		expect(() =>
			evaluateMetric(
				metricGame(),
				{ metric: 'product-waste-share', productIds: ['bottled-water'] },
				{ kind: 'current' }
			)
		).toThrow('Metric product-waste-share does not support current.');
	});

	it('substitutes the metric neutral value when the evaluated actual is not finite', () => {
		// cash returns game.cash directly; a non-finite cash triggers the
		// Number.isFinite guard in evaluateMetric, which falls back to neutral (0).
		const state = game({ cash: Number.NaN });
		expect(evaluateMetric(state, { metric: 'cash' }, { kind: 'current' })).toEqual({
			actual: 0,
			contributingIds: [],
			windowComplete: true
		});
	});
});

describe('metric window completeness', () => {
	it('marks an explicitly required trailing window incomplete until it has the requested reports', () => {
		const state = game({ reports: [report(1, 10), report(2, 20)] });

		expect(
			evaluateMetric(
				state,
				{ metric: 'daily-net-income' },
				{ kind: 'trailing-reports', count: 3 },
				true
			)
		).toEqual({
			actual: 15,
			contributingIds: ['report:1', 'report:2'],
			windowComplete: false
		});
	});

	it('allows a partial trailing window when completeness is not required', () => {
		const state = game({ reports: [report(1, 10), report(2, 20)] });

		expect(
			evaluateMetric(state, { metric: 'daily-net-income' }, { kind: 'trailing-reports', count: 3 })
				.windowComplete
		).toBe(true);
	});

	it('defensively requires every inclusive fixed report day when completeness is requested', () => {
		const state = game({ reports: [report(1, 10), report(3, 30)] });

		expect(
			evaluateMetric(
				state,
				{ metric: 'daily-net-income' },
				{ kind: 'fixed-report-days', startDay: 1, endDay: 3 },
				true
			).windowComplete
		).toBe(false);
	});

	it('requires a latest report for explicitly complete current report metrics', () => {
		expect(
			evaluateMetric(game(), { metric: 'daily-net-income' }, { kind: 'current' }, true)
				.windowComplete
		).toBe(false);
	});
});

describe('scenario condition statuses and risk projections', () => {
	it('applies every comparator and changes only unsatisfied objectives to missed at terminal', () => {
		const cases = [
			['lt-pass', 'lt', 11, true],
			['lt-fail', 'lt', 10, false],
			['lte-pass', 'lte', 10, true],
			['lte-fail', 'lte', 9, false],
			['eq-pass', 'eq', 10, true],
			['eq-fail', 'eq', 11, false],
			['gte-pass', 'gte', 10, true],
			['gte-fail', 'gte', 11, false],
			['gt-pass', 'gt', 9, true],
			['gt-fail', 'gt', 10, false]
		] as const;
		const requiredObjectives = cases.map(([id, comparator, target]) =>
			condition(id, { metric: 'cash' }, comparator, target, { kind: 'current' })
		);
		const scenario = definition({ requiredObjectives });

		const active = evaluateScenarioConditions(scenario, game({ cash: 10 }), false);
		const terminal = evaluateScenarioConditions(scenario, game({ cash: 10 }), true);

		expect(active.required.map(({ conditionId, status }) => [conditionId, status])).toEqual(
			cases.map(([id, , , passes]) => [id, passes ? 'satisfied' : 'pending'])
		);
		expect(terminal.required.map(({ conditionId, status }) => [conditionId, status])).toEqual(
			cases.map(([id, , , passes]) => [id, passes ? 'satisfied' : 'missed'])
		);
	});

	it('keeps a passing objective pending until its required report window is complete', () => {
		const scenario = definition({
			requiredObjectives: [
				condition(
					'positive-average',
					{ metric: 'daily-net-income' },
					'gt',
					0,
					{ kind: 'trailing-reports', count: 3 },
					true
				)
			]
		});
		const state = game({ day: 3, reports: [report(1, 40), report(2, 30)] });

		expect(evaluateScenarioConditions(scenario, state, false).required[0]).toMatchObject({
			status: 'pending',
			evidence: { actual: 35, target: 0 }
		});
	});

	it('emits evidence for inactive and triggered failures in definition order', () => {
		const failures = [
			condition('inactive', { metric: 'cash' }, 'lt', 0, { kind: 'current' }),
			condition('triggered', { metric: 'cash' }, 'gte', 10, { kind: 'current' })
		];

		expect(
			evaluateScenarioConditions(definition({ failures }), game({ cash: 10, day: 4 }), false)
				.failures
		).toEqual([
			{
				conditionId: 'inactive',
				status: 'inactive',
				evidence: {
					conditionId: 'inactive',
					metric: 'cash',
					comparator: 'lt',
					target: 0,
					actual: 10,
					day: 4,
					window: { kind: 'current' },
					windowComplete: true,
					contributingIds: []
				}
			},
			{
				conditionId: 'triggered',
				status: 'triggered',
				evidence: {
					conditionId: 'triggered',
					metric: 'cash',
					comparator: 'gte',
					target: 10,
					actual: 10,
					day: 4,
					window: { kind: 'current' },
					windowComplete: true,
					contributingIds: []
				}
			}
		]);
	});

	it('projects absolute distance from the exact evidence for every failure comparator', () => {
		const failures = [
			condition('lt', { metric: 'cash' }, 'lt', 15, { kind: 'current' }),
			condition('lte', { metric: 'cash' }, 'lte', 10, { kind: 'current' }),
			condition('eq', { metric: 'cash' }, 'eq', 12, { kind: 'current' }),
			condition('gte', { metric: 'cash' }, 'gte', 8, { kind: 'current' }),
			condition('gt', { metric: 'cash' }, 'gt', 10, { kind: 'current' })
		];
		const result = evaluateScenarioConditions(
			definition({ dayLimit: 20, failures }),
			game({ cash: 10, day: 7 }),
			false
		);

		expect(result.risks).toEqual([
			{ kind: 'condition', conditionId: 'lt', distance: 5, triggered: true },
			{ kind: 'condition', conditionId: 'lte', distance: 0, triggered: true },
			{ kind: 'condition', conditionId: 'eq', distance: 2, triggered: false },
			{ kind: 'condition', conditionId: 'gte', distance: 2, triggered: true },
			{ kind: 'condition', conditionId: 'gt', distance: 0, triggered: false },
			{ kind: 'deadline', daysRemaining: 13, triggered: false }
		]);
		for (const [index, failure] of result.failures.entries()) {
			const risk = result.risks[index];
			expect(risk?.kind === 'condition' ? risk.distance : undefined).toBe(
				Math.abs(failure.evidence.actual - failure.evidence.target)
			);
		}
	});

	it('emits a synthetic inclusive deadline and clamps projected remaining days', () => {
		const scenario = definition({ dayLimit: 10 });

		expect(evaluateScenarioConditions(scenario, game({ day: 9 }), false)).toMatchObject({
			deadline: null,
			risks: [{ kind: 'deadline', daysRemaining: 1, triggered: false }]
		});
		expect(evaluateScenarioConditions(scenario, game({ day: 10 }), true)).toMatchObject({
			deadline: {
				triggered: true,
				evidence: { conditionId: 'deadline-exceeded', day: 10, dayLimit: 10 }
			},
			risks: [{ kind: 'deadline', daysRemaining: 0, triggered: true }]
		});
		expect(evaluateScenarioConditions(scenario, game({ day: 12 }), true)).toMatchObject({
			deadline: {
				triggered: true,
				evidence: { conditionId: 'deadline-exceeded', day: 12, dayLimit: 10 }
			},
			risks: [{ kind: 'deadline', daysRemaining: 0, triggered: true }]
		});
	});

	it('does not mutate frozen definitions, reports, game state, or RNG state', () => {
		const scenario = deepFreeze(
			definition({
				requiredObjectives: [condition('cash', { metric: 'cash' }, 'gte', 0, { kind: 'current' })],
				failures: [condition('loss', { metric: 'cash' }, 'lt', 0, { kind: 'current' })]
			})
		);
		const state = deepFreeze(metricGame());
		const before = structuredClone(state);

		const first = evaluateScenarioConditions(scenario, state, false);
		const second = evaluateScenarioConditions(scenario, state, false);

		expect(first).toEqual(second);
		expect(state).toEqual(before);
		expect(state.rngState).toBe(12_345);
	});
});

describe('scenario report invariants', () => {
	it('accepts strictly increasing report days with unique nested IDs', () => {
		const reports = [
			report(1, 0, [storeReport('one', [product({ productId: 'bottled-water' })])]),
			report(2, 0, [storeReport('one', [product({ productId: 'bottled-water' })])])
		];

		expect(validateScenarioReportInvariants(reports)).toEqual([]);
	});

	it('diagnoses duplicate and descending days plus duplicate store and product IDs', () => {
		const reports = [
			report(2, 0, [
				storeReport('same/store', [
					product({ productId: 'water/large' as ProductId }),
					product({ productId: 'water/large' as ProductId })
				]),
				storeReport('same/store')
			]),
			report(2, 0),
			report(1, 0)
		];

		expect(
			validateScenarioReportInvariants(reports).map(({ code, path, value }) => ({
				code,
				path,
				value
			}))
		).toEqual([
			{
				code: 'duplicate-product-report-product-id',
				path: 'reports[0].storeReports[0].productReports[1].productId',
				value: 'water/large'
			},
			{
				code: 'duplicate-store-report-id',
				path: 'reports[0].storeReports[1].storeId',
				value: 'same/store'
			},
			{
				code: 'non-increasing-report-day',
				path: 'reports[1].day',
				value: 2
			},
			{
				code: 'non-increasing-report-day',
				path: 'reports[2].day',
				value: 1
			}
		]);
	});
});

describe('progression metrics', () => {
	it('evaluates max-store-level as the current maximum and reports the top stores', () => {
		const state = game({
			stores: [
				{ ...store('a'), level: 2 },
				{ ...store('b'), level: 4 },
				{ ...store('c'), level: 4 }
			]
		});

		expect(evaluateMetric(state, { metric: 'max-store-level' }, { kind: 'current' })).toEqual({
			actual: 4,
			contributingIds: ['b', 'c'],
			windowComplete: true
		});
	});

	it('evaluates max-store-level as 0 with no stores', () => {
		expect(evaluateMetric(game(), { metric: 'max-store-level' }, { kind: 'current' }).actual).toBe(
			0
		);
	});

	it('evaluates opened-city-count with sorted evidence ids', () => {
		const state = game({
			world: {
				openedCityIds: ['industry-city', 'harbor-city']
			} as GameState['world']
		});

		expect(evaluateMetric(state, { metric: 'opened-city-count' }, { kind: 'current' })).toEqual({
			actual: 2,
			contributingIds: ['harbor-city', 'industry-city'],
			windowComplete: true
		});
	});

	it('evaluates peak-company-book-value as the run-to-date maximum, not the latest value', () => {
		const state = game({
			reports: [
				report(1, 10, [], { companyBookValueAfter: 70_000 }),
				report(2, 10, [], { companyBookValueAfter: 90_000 }),
				report(3, 10, [], { companyBookValueAfter: 55_000 })
			]
		});

		expect(
			evaluateMetric(state, { metric: 'peak-company-book-value' }, { kind: 'run-to-date' })
		).toEqual({
			actual: 90_000,
			contributingIds: ['report:2'],
			windowComplete: true
		});
	});

	it('evaluates peak-company-book-value across negative history without clamping', () => {
		const state = game({
			reports: [
				report(1, 10, [], { companyBookValueAfter: -100 }),
				report(2, 10, [], { companyBookValueAfter: -50 })
			]
		});

		expect(
			evaluateMetric(state, { metric: 'peak-company-book-value' }, { kind: 'run-to-date' }).actual
		).toBe(-50);
	});

	it('evaluates peak-company-book-value as 0 with an incomplete window when no reports exist', () => {
		expect(
			evaluateMetric(game(), { metric: 'peak-company-book-value' }, { kind: 'run-to-date' }, true)
		).toEqual({
			actual: 0,
			contributingIds: [],
			windowComplete: false
		});
	});

	it('exposes evaluateCondition with comparator and window-completeness semantics', () => {
		const passing = condition(
			'peak-pass',
			{ metric: 'peak-company-book-value' },
			'gte',
			70_000,
			{ kind: 'run-to-date' },
			true
		);
		const incomplete = condition(
			'peak-incomplete',
			{ metric: 'peak-company-book-value' },
			'gte',
			0,
			{ kind: 'run-to-date' },
			true
		);

		const passed = evaluateCondition(
			passing,
			game({ reports: [report(1, 10, [], { companyBookValueAfter: 90_000 })] })
		);
		expect(passed.passes).toBe(true);
		expect(passed.evidence).toMatchObject({
			conditionId: 'peak-pass',
			metric: 'peak-company-book-value',
			actual: 90_000,
			target: 70_000,
			windowComplete: true
		});

		const failed = evaluateCondition(
			passing,
			game({ reports: [report(1, 10, [], { companyBookValueAfter: 55_000 })] })
		);
		expect(failed.passes).toBe(false);
		expect(failed.evidence.actual).toBe(55_000);

		// Zero report history is not a completed window, so a satisfied target
		// still fails while completeness is required.
		const zeroHistory = evaluateCondition(incomplete, game());
		expect(zeroHistory.passes).toBe(false);
		expect(zeroHistory.evidence).toMatchObject({ actual: 0, windowComplete: false });
	});
});

describe('METRIC_REGISTRY / METRIC_WINDOWS parity', () => {
	it('exposes the same metric keys in both registries', () => {
		const registryKeys = new Set(Object.keys(METRIC_REGISTRY));
		const windowKeys = new Set(Object.keys(METRIC_WINDOWS));
		expect([...registryKeys].sort()).toEqual([...windowKeys].sort());
	});

	it('declares identical supported windows for every metric', () => {
		const windowKinds = ['current', 'run-to-date', 'trailing-reports', 'fixed-report-days'];
		for (const metric of Object.keys(METRIC_REGISTRY)) {
			const registryWindows =
				METRIC_REGISTRY[metric as keyof typeof METRIC_REGISTRY].supportedWindows;
			const validationWindows = METRIC_WINDOWS[metric];
			expect(registryWindows).toBeDefined();
			expect(validationWindows).toBeDefined();
			for (const kind of windowKinds) {
				expect(registryWindows.has(kind as never)).toBe(validationWindows?.has(kind as never));
			}
		}
	});
});
