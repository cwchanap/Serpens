import { describe, expect, it } from 'vitest';
import type {
	DailyProductReport,
	DailyProductionReport,
	DailyReport,
	DailyStoreReport,
	GameState,
	IndustrialBuilding,
	Store
} from '$lib/game/types';
import { createEmptyFinanceState } from '$lib/game/finance';
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
	evaluateMetric,
	evaluateScenarioConditions,
	METRIC_REGISTRY,
	productEvidenceId,
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
		railUsage: {}
	};
}

function product(overrides: Partial<DailyProductReport> = {}): DailyProductReport {
	return {
		categoryId: 'bottled-water',
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
		marketPosition: 100,
		productReports,
		warnings: [],
		...overrides
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
		nextLoanPayment: null,
		scorecard: {
			profit: 50,
			customerSatisfaction: 50,
			staffMorale: 50,
			marketPosition: 50
		},
		productionReport: productionReport(),
		storeReports,
		modifierImpacts: [],
		modifierLifecycle: [],
		warnings: [],
		...overrides
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
		competition: 50,
		managerQuality: 50
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
		warehouse: { capacity: 100, materials: {}, overflowUnits: 0, overflowCost: 0 },
		stores: [],
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
			missed: 1
		},
		{
			day: 2,
			netIncome: -4,
			storeId: 'store:a',
			importSpend: 20,
			imported: 4,
			local: 1,
			sold: 5,
			missed: 2
		},
		{
			day: 7,
			netIncome: 6,
			storeId: 'store/a',
			importSpend: 30,
			imported: 6,
			local: 6,
			sold: 7,
			missed: 3
		},
		{
			day: 8,
			netIncome: 8,
			storeId: 'store:B',
			importSpend: 40,
			imported: 8,
			local: 10,
			sold: 9,
			missed: 4
		}
	];
	const reports = rows.map((row) =>
		report(row.day, row.netIncome, [
			storeReport(row.storeId, [
				product({
					importSpend: row.importSpend,
					importedUnits: row.imported,
					warehouseUnits: row.local,
					unitsSold: row.sold,
					demandMissed: row.missed
				}),
				product({ categoryId: 'snacks', name: 'Snacks', unitsSold: 100 })
			])
		])
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
				capacity: 100,
				materials: { water: 42 },
				overflowUnits: 0,
				overflowCost: 0
			},
			{
				cityId: 'breadbasket-basin',
				capacity: 100,
				materials: { water: 17 },
				overflowUnits: 0,
				overflowCost: 0
			}
		],
		warehouse: { capacity: 200, materials: { water: 59 }, overflowUnits: 0, overflowCost: 0 }
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
			productCategoryIds: ['bottled-water'],
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
		expect(productEvidenceId(7, 'store/a', 'water/large')).toBe(
			'report:7/store:store%2Fa/product:water%2Flarge'
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
			evaluateMetric(
				state,
				{ metric: 'retail-imported-units', categoryIds: ['bottled-water'] },
				{ kind: 'run-to-date' }
			).contributingIds
		).toEqual([
			'report:1/store:store%3Az/product:bottled-water',
			'report:2/store:store%3Aa/product:bottled-water',
			'report:7/store:store%2Fa/product:bottled-water',
			'report:8/store:store%3AB/product:bottled-water'
		]);
	});
});

describe('registered scenario metrics', () => {
	it.each([
		[{ metric: 'cash' }, { kind: 'current' }, 12_345, []],
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
			{ metric: 'retail-import-spend', categoryIds: ['bottled-water'] },
			{ kind: 'run-to-date' },
			100
		],
		[
			{ metric: 'retail-imported-units', categoryIds: ['bottled-water'] },
			{ kind: 'run-to-date' },
			20
		],
		[{ metric: 'retail-local-units', categoryIds: ['bottled-water'] }, { kind: 'run-to-date' }, 20],
		[
			{ metric: 'retail-local-share', categoryIds: ['bottled-water'] },
			{ kind: 'run-to-date' },
			0.5
		],
		[{ metric: 'units-sold', categoryIds: ['bottled-water'] }, { kind: 'run-to-date' }, 25],
		[{ metric: 'demand-missed', categoryIds: ['bottled-water'] }, { kind: 'run-to-date' }, 10],
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

	it.each([
		[{ metric: 'daily-net-income' }, { kind: 'current' }],
		[{ metric: 'cumulative-net-income' }, { kind: 'run-to-date' }],
		[{ metric: 'consecutive-positive-net-income-reports' }, { kind: 'current' }],
		[{ metric: 'completed-retail-import-cycles' }, { kind: 'run-to-date' }],
		[{ metric: 'retail-import-spend', categoryIds: ['bottled-water'] }, { kind: 'run-to-date' }],
		[{ metric: 'retail-imported-units', categoryIds: ['bottled-water'] }, { kind: 'run-to-date' }],
		[{ metric: 'retail-local-units', categoryIds: ['bottled-water'] }, { kind: 'run-to-date' }],
		[{ metric: 'retail-local-share', categoryIds: ['bottled-water'] }, { kind: 'run-to-date' }],
		[{ metric: 'units-sold', categoryIds: ['bottled-water'] }, { kind: 'run-to-date' }],
		[{ metric: 'demand-missed', categoryIds: ['bottled-water'] }, { kind: 'run-to-date' }]
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

	it('returns zero local share when selected local and imported units are both zero', () => {
		const state = game({
			reports: [
				report(1, 0, [storeReport('store/a', [product({ warehouseUnits: 0, importedUnits: 0 })])])
			]
		});

		expect(
			evaluateMetric(
				state,
				{ metric: 'retail-local-share', categoryIds: ['bottled-water'] },
				{ kind: 'run-to-date' }
			)
		).toEqual({
			actual: 0,
			contributingIds: ['report:1/store:store%2Fa/product:bottled-water'],
			windowComplete: true
		});
	});

	it('rejects a metric/window pair outside the registered catalog', () => {
		expect(() => evaluateMetric(metricGame(), { metric: 'cash' }, { kind: 'run-to-date' })).toThrow(
			'Metric cash does not support run-to-date.'
		);
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
			report(1, 0, [storeReport('one', [product({ categoryId: 'bottled-water' })])]),
			report(2, 0, [storeReport('one', [product({ categoryId: 'bottled-water' })])])
		];

		expect(validateScenarioReportInvariants(reports)).toEqual([]);
	});

	it('diagnoses duplicate and descending days plus duplicate store and product IDs', () => {
		const reports = [
			report(2, 0, [
				storeReport('same/store', [
					product({ categoryId: 'water/large' }),
					product({ categoryId: 'water/large' })
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
				code: 'duplicate-product-report-category-id',
				path: 'reports[0].storeReports[0].productReports[1].categoryId',
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
