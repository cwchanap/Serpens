import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ReportSummary } from '$lib/game/reports';
import {
	createRouteDispatchAttempt,
	emptyLogisticsReport
} from '$lib/game/logisticsReport.testUtils';
import type {
	DailyProductReport,
	DailyProductionReport,
	DailyStoreReport,
	DailyTransferArrival,
	EventModifierSnapshot,
	GameState,
	IndustrialBuilding,
	Store
} from '$lib/game/types';
import { createI18n } from '$lib/i18n';
import { createNewGame } from '$lib/game/state';
import ReportsPanel from './ReportsPanel.svelte';

const store: Store = {
	id: 'store-1',
	level: 1,
	name: 'Founding Store',
	archetypeId: 'boutique',
	location: { neighborhoodId: 'downtown', x: 1, y: 1 },
	cityId: 'harbor-city',
	tileId: 'harbor-city-1-1',
	mapX: 1,
	mapY: 1,
	daysOpen: 1,
	reputation: 50,
	stockHealth: 80,
	products: [],
	staffMorale: 75,
	staffCapacity: 70,
	localDemand: 72,
	competition: 15,
	managerQuality: 60
};

function emptyProductionReport(): DailyProductionReport {
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
		cityInventories: []
	};
}

const summary: ReportSummary = {
	latest: {
		day: 4,
		revenue: 1_250,
		costOfGoods: 450,
		grossMargin: 800,
		operatingCosts: 275,
		payrollCost: 320,
		importSpend: 456,
		cashBefore: 12_315,
		operatingIncome: 525,
		operatingCashFlow: 69,
		interestAccrued: 0.25,
		interestPaid: 9,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 30,
		refinancedPrincipal: 0,
		financingCashFlow: -39,
		netCashChange: 30,
		netIncome: 69,
		cashAfter: 12_345,
		outstandingPrincipalAfter: 5_970,
		inventoryLossExpense: 0,
		nextLoanPayment: { loanId: 'loan-1', day: 11, amount: 49 },
		scorecard: {
			profit: 55,
			customerSatisfaction: 60,
			staffMorale: 65,
			marketPosition: 50
		},
		productionReport: emptyProductionReport(),
		logistics: emptyLogisticsReport(),
		storeReports: [],
		modifierImpacts: [],
		modifierLifecycle: [],
		warnings: []
	},
	sevenDay: {
		days: 1,
		revenue: 1_250,
		importSpend: 456,
		operatingIncome: 525,
		operatingCashFlow: 69,
		interestAccrued: 0.25,
		interestPaid: 9,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 30,
		refinancedPrincipal: 0,
		financingCashFlow: -39,
		netCashChange: 30,
		netIncome: 69,
		averageRevenue: 1_250,
		averageOperatingIncome: 525,
		averageOperatingCashFlow: 69,
		averageInterestAccrued: 0.25,
		averageInterestPaid: 9,
		averageInterestCapitalized: 0,
		averagePrincipalBorrowed: 0,
		averagePrincipalRepaid: 30,
		averageRefinancedPrincipal: 0,
		averageFinancingCashFlow: -39,
		averageNetCashChange: 30,
		averageNetIncome: 69
	},
	thirtyDay: {
		days: 1,
		revenue: 1_250,
		importSpend: 456,
		operatingIncome: 525,
		operatingCashFlow: 69,
		interestAccrued: 0.25,
		interestPaid: 9,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 30,
		refinancedPrincipal: 0,
		financingCashFlow: -39,
		netCashChange: 30,
		netIncome: 69,
		averageRevenue: 1_250,
		averageOperatingIncome: 525,
		averageOperatingCashFlow: 69,
		averageInterestAccrued: 0.25,
		averageInterestPaid: 9,
		averageInterestCapitalized: 0,
		averagePrincipalBorrowed: 0,
		averagePrincipalRepaid: 30,
		averageRefinancedPrincipal: 0,
		averageFinancingCashFlow: -39,
		averageNetCashChange: 30,
		averageNetIncome: 69
	}
};

function modifierSnapshot(overrides: Partial<EventModifierSnapshot> = {}): EventModifierSnapshot {
	return {
		id: 'event-modifier-4',
		source: {
			eventId: 'supplier-terms',
			instanceId: 'event-instance-7',
			optionId: 'bulk-discount'
		},
		target: { kind: 'company' },
		startsOnDay: 5,
		expiresOnDay: 8,
		stackingKey: 'supplier-bulk-discount:retail-product',
		effect: {
			kind: 'import-cost-multiplier',
			scope: 'retail-product',
			target: { kind: 'all' },
			multiplier: 0.9
		},
		explanation: { key: 'events.supplierTerms.bulkDiscount.modifier', params: {} },
		importance: 'important',
		...overrides
	};
}

function replenishedStoreReport(): DailyStoreReport {
	return {
		storeId: store.id,
		revenue: 0,
		costOfGoods: 0,
		grossMargin: 0,
		operatingCosts: 0,
		importSpend: 15,
		netIncome: 0,
		customersServed: 0,
		demandMissed: 0,
		staffingCoverage: 100,
		staffingShortage: { manager: 0, general: 0 },
		stockHealth: 100,
		staffMorale: 100,
		reputation: 50,
		marketPosition: 50,
		productReports: [
			{
				productId: 'snacks',
				name: 'Snacks',
				unitsSold: 0,
				demandMissed: 0,
				revenue: 0,
				costOfGoods: 0,
				grossMargin: 0,
				endingStock: 10,
				warehouseUnits: 4,
				warehouseValue: 8,
				importedUnits: 3,
				importCost: 5,
				importSpend: 15,
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
				markdownAmount: 0
			}
		],
		inventoryLossExpense: 0,
		warnings: [],
		replenishment: {
			retailCityId: 'harbor-city',
			configuredSupplyCityId: 'industry-city',
			resolvedSupplyCityId: 'industry-city'
		}
	};
}

function pressureStoreReport(): DailyStoreReport {
	const product: DailyProductReport = {
		productId: 'produce',
		name: 'Produce',
		unitsSold: 6,
		demandMissed: 3,
		revenue: 18,
		costOfGoods: 12,
		grossMargin: 6,
		endingStock: 8,
		warehouseUnits: 0,
		warehouseValue: 0,
		importedUnits: 0,
		importCost: 2,
		importSpend: 0,
		wasteUnits: 2,
		wasteValue: 4,
		shrinkUnits: 1,
		shrinkValue: 2,
		stockoutLostDemand: 3,
		averageAgeDays: 4,
		oldestSellableAgeDays: 6,
		trendMultiplier: 1,
		obsolescenceMultiplier: 1,
		baseSellingPrice: 4,
		effectiveSellingPrice: 3,
		markdownAmount: 6
	};

	return {
		storeId: store.id,
		revenue: 18,
		costOfGoods: 12,
		grossMargin: 6,
		operatingCosts: 10,
		importSpend: 0,
		netIncome: -6,
		customersServed: 6,
		demandMissed: 3,
		staffingCoverage: 100,
		staffingShortage: { manager: 0, general: 0 },
		stockHealth: 50,
		staffMorale: 75,
		reputation: 50,
		marketPosition: 50,
		productReports: [product],
		inventoryLossExpense: 6,
		warnings: [],
		replenishment: null
	};
}

function currentInventoryGame(): GameState {
	const game = createNewGame('convenience', 20260803);
	const warehouse: IndustrialBuilding = {
		id: 'industry-city-warehouse',
		level: 1,
		typeId: 'warehouse',
		cityId: 'industry-city',
		tileId: 'industry-city-warehouse',
		mapX: 0,
		mapY: 0,
		status: 'idle',
		inventory: {},
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0
	};
	return {
		...game,
		industrialBuildings: [warehouse],
		cityInventories: [
			{
				cityId: 'industry-city',
				materials: { snacks: 17 }
			}
		]
	};
}

describe('ReportsPanel', () => {
	it('shows latest-day modifier impact provenance without adding rolling modifier totals', async () => {
		expect.assertions(9);
		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					modifierImpacts: [
						{
							modifierId: 'event-modifier-4',
							source: modifierSnapshot().source,
							target: { kind: 'company' },
							effectKind: 'import-cost-multiplier',
							explanation: modifierSnapshot().explanation,
							scope: 'retail-product',
							affectedIds: ['store-b:drinks', 'store-a:snacks'],
							multiplier: 0.9,
							resolvedMultiplier: 1.8,
							baselineCost: 2_500,
							actualCost: 4_500,
							applicationCount: 2
						}
					]
				}
			}
		});

		const impacts = page.getByRole('region', { name: 'Latest-day modifier impacts' });
		await expect.element(impacts.getByText('Source: Supplier terms')).toBeVisible();
		await expect
			.element(impacts.getByText('Affected IDs: store-b:drinks and store-a:snacks'))
			.toBeVisible();
		await expect.element(impacts.getByText('Multiplier: ×0.9')).toBeVisible();
		await expect.element(impacts.getByText('Effective aggregate multiplier: ×1.8')).toBeVisible();
		await expect.element(impacts.getByText('Baseline cost: $2,500')).toBeVisible();
		await expect.element(impacts.getByText('Actual rounded cost: $4,500')).toBeVisible();
		await expect.element(impacts.getByText('Applications: 2')).toBeVisible();
		await expect.element(page.getByText('7-day modifier impacts')).not.toBeInTheDocument();
		await expect.element(page.getByText('30-day modifier impacts')).not.toBeInTheDocument();
	});

	it.each([
		['ja', '実効集計乗数: ×1.15', '実際の丸め後費用: $720'],
		['zh-Hant', '有效彙總乘數: ×1.15', '實際四捨五入成本: $720']
	] as const)(
		'localizes resolved multiplier and actual rounded cost in %s',
		async (locale, resolvedCopy, actualCostCopy) => {
			render(ReportsPanel, {
				i18n: createI18n(locale),
				stores: [],
				summary: {
					...summary,
					latest: {
						...summary.latest!,
						modifierImpacts: [
							{
								modifierId: 'event-modifier-4',
								source: modifierSnapshot().source,
								target: { kind: 'company' },
								effectKind: 'import-cost-multiplier',
								explanation: modifierSnapshot().explanation,
								scope: 'retail-product',
								affectedIds: ['snacks'],
								multiplier: 0.9,
								resolvedMultiplier: 1.152,
								baselineCost: 625,
								actualCost: 720,
								applicationCount: 2
							}
						]
					}
				}
			});

			const impacts = page.getByRole('region', {
				name: locale === 'ja' ? '直近日の修正効果' : '最近一天的修正效果影響'
			});
			await expect.element(impacts.getByText(resolvedCopy)).toBeVisible();
			await expect.element(impacts.getByText(actualCostCopy)).toBeVisible();
		}
	);

	it('shows latest-day replacement and exclusive-expiry lifecycle evidence', async () => {
		expect.assertions(5);
		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					modifierLifecycle: [
						{
							status: 'replaced',
							modifier: modifierSnapshot(),
							replacedByModifierId: 'event-modifier-5'
						}
					]
				}
			}
		});

		const lifecycle = page.getByRole('region', { name: 'Latest-day modifier lifecycle' });
		await expect.element(lifecycle.getByText('Source: Supplier terms')).toBeVisible();
		await expect.element(lifecycle.getByText('Status: Replaced')).toBeVisible();
		await expect.element(lifecycle.getByText('Replaced by: event-modifier-5')).toBeVisible();
		await expect.element(lifecycle.getByText('Expires after day 7')).toBeVisible();
		await expect.element(lifecycle.getByText('Modifier expired.')).not.toBeInTheDocument();
	});

	it('renders empty latest-day logistics evidence as read-only sections', async () => {
		expect.assertions(8);

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: { ...summary.latest!, logistics: emptyLogisticsReport() }
			}
		});

		const logistics = page.getByRole('region', { name: 'Latest-day logistics' });
		await expect.element(logistics.getByRole('heading', { name: 'Arrivals' })).toBeVisible();
		await expect.element(logistics.getByText('No arrivals recorded for this day.')).toBeVisible();
		await expect
			.element(logistics.getByRole('heading', { name: 'Route dispatch attempts' }))
			.toBeVisible();
		await expect
			.element(logistics.getByText('No route dispatch attempts recorded for this day.'))
			.toBeVisible();
		await expect.element(logistics.getByText('Delivered units: 0')).toBeVisible();
		await expect.element(logistics.getByText('Scheduled transport cost: $0')).toBeVisible();
		await expect.element(logistics.getByRole('button')).not.toBeInTheDocument();
		await expect.element(logistics.getByRole('link')).not.toBeInTheDocument();
	});

	it('renders latest-day logistics arrivals and dispatch attempts from persisted evidence', async () => {
		expect.assertions(16);

		const arrival: DailyTransferArrival = {
			transferOrderId: 'transfer-8',
			originCityId: 'industry-city',
			destinationCityId: 'breadbasket-basin',
			materialId: 'water',
			quantity: 12
		};
		const attempt = createRouteDispatchAttempt({
			routeId: 'route-1',
			materialId: 'water',
			destinationNeed: 10,
			capacity: 20,
			availableOriginStock: 50,
			dispatchedQuantity: 10,
			unusedCapacity: 10,
			unmetDestinationNeed: 0,
			transportCost: 20,
			transferOrderId: 'transfer-9',
			baselineCapacity: 20
		});
		const fullAttempt = createRouteDispatchAttempt({
			...attempt,
			routeId: 'route-2',
			destinationNeed: 0,
			capacity: 40,
			dispatchedQuantity: 0,
			unusedCapacity: 40,
			transferOrderId: null,
			baselineCapacity: 40
		});

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					logistics: {
						arrivals: [arrival],
						routeDispatchAttempts: [attempt, fullAttempt],
						deliveredUnits: 12,
						scheduledTransportCost: 20,
						modifierRecoveries: []
					}
				}
			}
		});

		const logistics = page.getByRole('region', { name: 'Latest-day logistics' });
		await expect
			.element(
				logistics.getByText('transfer-8 · Industry City → Breadbasket Basin · Water · 12 units')
			)
			.toBeVisible();
		await expect
			.element(logistics.getByText('route-1 · Industry City → Breadbasket Basin · Water'))
			.toBeVisible();
		await expect.element(logistics.getByText('Destination need: 10')).toBeVisible();
		await expect.element(logistics.getByText('Attempt capacity: 20')).toBeVisible();
		await expect.element(logistics.getByText('Dispatched quantity: 10')).toBeVisible();
		await expect.element(logistics.getByText('Unused capacity: 10')).toBeVisible();
		await expect.element(logistics.getByText('Unmet destination need: 0').first()).toBeVisible();
		await expect.element(logistics.getByText('Utilization: 50%')).toBeVisible();
		await expect.element(logistics.getByText('Transport cost: $20').nth(1)).toBeVisible();
		await expect
			.element(logistics.getByText('route-2 · Industry City → Breadbasket Basin · Water'))
			.toBeVisible();
		await expect.element(logistics.getByText('Destination need: 0', { exact: true })).toBeVisible();
		await expect.element(logistics.getByText('Destination full')).toBeVisible();
		await expect.element(logistics.getByText('Attempt capacity: 40')).toBeVisible();
		await expect.element(logistics.getByText('Utilization: 0%')).toBeVisible();
		await expect.element(logistics.getByText('Delivered units: 12')).toBeVisible();
		await expect.element(logistics.getByText('Scheduled transport cost: $20')).toBeVisible();
	});

	it('shows activated lifecycle status without a replaced-by line', async () => {
		expect.assertions(3);
		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					modifierLifecycle: [
						{
							status: 'activated',
							modifier: modifierSnapshot()
						}
					]
				}
			}
		});

		const lifecycle = page.getByRole('region', { name: 'Latest-day modifier lifecycle' });
		await expect.element(lifecycle.getByText('Status: Activated')).toBeVisible();
		await expect.element(lifecycle.getByText('Expires after day 7')).toBeVisible();
		await expect.element(lifecycle.getByText('Replaced by')).not.toBeInTheDocument();
	});

	it('shows expired lifecycle status without a replaced-by line', async () => {
		expect.assertions(3);
		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					modifierLifecycle: [
						{
							status: 'expired',
							modifier: modifierSnapshot()
						}
					]
				}
			}
		});

		const lifecycle = page.getByRole('region', { name: 'Latest-day modifier lifecycle' });
		await expect.element(lifecycle.getByText('Status: Expired')).toBeVisible();
		await expect.element(lifecycle.getByText('Expires after day 7')).toBeVisible();
		await expect.element(lifecycle.getByText('Replaced by')).not.toBeInTheDocument();
	});

	it('shows production external imports and city inventory overflow metrics with daily imports', async () => {
		expect.assertions(6);

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					productionReport: {
						...emptyProductionReport(),
						importSpend: 222,
						overflowUnits: 8,
						overflowCost: 44
					}
				}
			}
		});

		const reportsRegion = page.getByRole('region', { name: 'Reports' });

		await expect
			.element(reportsRegion.getByText('External imports', { exact: true }))
			.toBeVisible();
		await expect.element(reportsRegion.getByText('$456')).toBeVisible();
		await expect.element(reportsRegion.getByText('Production external imports')).toBeVisible();
		await expect.element(reportsRegion.getByText('$222')).toBeVisible();
		await expect.element(reportsRegion.getByText('City inventory overflow')).toBeVisible();
		await expect.element(reportsRegion.getByText('$44')).toBeVisible();
	});

	it('shows latest import spend with the daily metrics', async () => {
		expect.assertions(2);

		render(ReportsPanel, { i18n: createI18n('en'), stores: [], summary });

		const reportsRegion = page.getByRole('region', { name: 'Reports' });

		await expect
			.element(reportsRegion.getByText('External imports', { exact: true }))
			.toBeVisible();
		await expect.element(reportsRegion.getByText('$456')).toBeVisible();
	});

	it('surfaces product waste, shrink, markdown, stockout, and inventory-loss evidence', async () => {
		expect.assertions(7);
		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [store],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					storeReports: [pressureStoreReport()],
					inventoryLossExpense: 6
				}
			}
		});

		const pressure = page.getByRole('region', { name: 'Product pressure evidence' });
		await expect.element(pressure.getByText('Waste: 2 units ($4)')).toBeVisible();
		await expect.element(pressure.getByText('Shrink: 1 unit ($2)')).toBeVisible();
		await expect.element(pressure.getByText('Stockout lost demand: 3 units')).toBeVisible();
		await expect.element(pressure.getByText('Markdown: $6')).toBeVisible();
		await expect.element(pressure.getByText('Base price: $4')).toBeVisible();
		await expect.element(pressure.getByText('Effective price: $3')).toBeVisible();
		await expect.element(pressure.getByText('Inventory loss expense: $6')).toBeVisible();
	});

	it('labels reconciled operating and financing movements without calling principal amount due', async () => {
		expect.assertions(9);

		render(ReportsPanel, { i18n: createI18n('en'), stores: [], summary });

		const reportsRegion = page.getByRole('region', { name: 'Reports' });

		await expect.element(reportsRegion.getByText('Operating income')).toBeVisible();
		await expect
			.element(reportsRegion.getByText('Operating cash flow', { exact: true }))
			.toBeVisible();
		await expect.element(reportsRegion.getByText('Financing cash flow')).toBeVisible();
		await expect.element(reportsRegion.getByText('Principal repaid')).toBeVisible();
		await expect.element(reportsRegion.getByText('Interest accrued')).toBeVisible();
		await expect.element(reportsRegion.getByText('Interest capitalized')).toBeVisible();
		await expect.element(reportsRegion.getByText('Refinanced principal')).toBeVisible();
		await expect.element(reportsRegion.getByText('Ending principal')).toBeVisible();
		await expect.element(reportsRegion.getByText('Amount due')).not.toBeInTheDocument();
	});

	it('lists the latest daily warnings when present', async () => {
		expect.assertions(1);

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: { ...summary.latest!, warnings: [{ code: 'cashReservesLow' }] }
			}
		});

		const warningsList = page.getByRole('list', { name: 'Daily warnings' });

		await expect.element(warningsList.getByText('cash reserves are low')).toBeVisible();
	});

	it('localizes known latest daily warnings while preserving store names', async () => {
		expect.assertions(3);
		const i18n = createI18n('ja');

		render(ReportsPanel, {
			i18n,
			stores: [store],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					warnings: [
						{ code: 'shortGeneral', storeId: 'store-1', count: 1234 },
						{ code: 'cashReservesLow' }
					]
				}
			}
		});

		const warningsList = page.getByRole('list', { name: '日次警告' });

		await expect
			.element(
				warningsList.getByText(
					`Founding Store の一般スタッフが ${i18n.format.integer(1234)} 名不足`
				)
			)
			.toBeVisible();
		await expect.element(warningsList.getByText('現金準備が少なくなっています')).toBeVisible();
		await expect
			.element(warningsList.getByText('Founding Store is short 1234 general staff'))
			.not.toBeInTheDocument();
	});

	it('renders duplicate warning codes from different stores without key collisions', async () => {
		expect.assertions(2);

		const store2: Store = { ...store, id: 'store-2', name: 'Second Store' };

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [store, store2],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					warnings: [
						{ code: 'stockPressure', storeId: 'store-1' },
						{ code: 'stockPressure', storeId: 'store-2' }
					]
				}
			}
		});

		const warningsList = page.getByRole('list', { name: 'Daily warnings' });

		await expect.element(warningsList.getByText('Founding Store')).toBeVisible();
		await expect.element(warningsList.getByText('Second Store')).toBeVisible();
	});

	it('renders the rail shipment total when the latest report has rail shipments', async () => {
		expect.assertions(2);

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					productionReport: {
						...emptyProductionReport(),
						railShipments: [
							{
								cityId: 'industry-city',
								materialId: 'grain',
								quantity: 12,
								value: 36,
								kind: 'push-warehouse',
								fromId: 'farm-1',
								toId: 'mill-1'
							},
							{
								cityId: 'industry-city',
								materialId: 'flour',
								quantity: 8,
								value: 24,
								kind: 'pull-warehouse',
								fromId: 'mill-1',
								toId: 'warehouse-1'
							}
						]
					}
				}
			}
		});

		const reportsRegion = page.getByRole('region', { name: 'Reports' });

		await expect.element(reportsRegion.getByText('Rail shipments')).toBeVisible();
		await expect.element(reportsRegion.getByText('20', { exact: true })).toBeVisible();
	});

	it('shows the empty state when there is no latest report', async () => {
		expect.assertions(1);

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: { ...summary, latest: undefined }
		});

		await expect
			.element(page.getByText('No reports yet. Advance the first day to generate results.'))
			.toBeVisible();
	});

	it('keeps production-close and current city inventory timing separate with city-attributed movements', async () => {
		expect.assertions(8);
		const game = currentInventoryGame();

		render(ReportsPanel, {
			i18n: createI18n('en'),
			game,
			stores: [store],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					productionReport: {
						...emptyProductionReport(),
						cityInventories: [
							{
								cityId: 'industry-city',
								capacity: 100,
								used: 42,
								overflowUnits: 2,
								overflowCost: 4
							}
						],
						produced: [
							{
								cityId: 'industry-city',
								materialId: 'snacks',
								quantity: 12,
								value: 24,
								source: 'local'
							}
						],
						consumed: [
							{
								cityId: 'industry-city',
								materialId: 'grain',
								quantity: 5,
								value: 10,
								source: 'local'
							}
						]
					},
					storeReports: [replenishedStoreReport()]
				}
			}
		});

		const reports = page.getByRole('region', { name: 'Reports' });
		await expect
			.element(
				reports.getByRole('heading', {
					name: 'Production-close inventory (before retail replenishment)'
				})
			)
			.toBeVisible();
		await expect
			.element(
				reports.getByRole('heading', {
					name: 'Current city inventory (after the latest replenishment)'
				})
			)
			.toBeVisible();
		await expect
			.element(reports.getByText('Industry City: 42 / 100 city inventory used.'))
			.toBeVisible();
		await expect
			.element(reports.getByText('Industry City: 17 / 200 city inventory used.'))
			.toBeVisible();
		await expect.element(reports.getByText('Production — Industry City: 12 units')).toBeVisible();
		await expect.element(reports.getByText('Consumption — Industry City: 5 units')).toBeVisible();
		await expect
			.element(reports.getByText('Local supply — Industry City → Harbor City: 4 units'))
			.toBeVisible();
		await expect
			.element(reports.getByText('External imports — Harbor City: 3 units'))
			.toBeVisible();
	});

	it('aggregates produced movements with duplicate city ids', async () => {
		expect.assertions(2);
		const game = currentInventoryGame();

		render(ReportsPanel, {
			i18n: createI18n('en'),
			game,
			stores: [store],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					productionReport: {
						...emptyProductionReport(),
						cityInventories: [
							{
								cityId: 'industry-city',
								capacity: 100,
								used: 42,
								overflowUnits: 0,
								overflowCost: 0
							}
						],
						produced: [
							{
								cityId: 'industry-city',
								materialId: 'snacks',
								quantity: 12,
								value: 24,
								source: 'local'
							},
							{
								cityId: 'industry-city',
								materialId: 'drinks',
								quantity: 8,
								value: 16,
								source: 'local'
							}
						]
					}
				}
			}
		});

		const reports = page.getByRole('region', { name: 'Reports' });
		await expect.element(reports.getByText('Production — Industry City: 20 units')).toBeVisible();
		await expect
			.element(reports.getByText(/City inventory overflow: \d+ units/))
			.not.toBeInTheDocument();
	});

	it('shows the current city inventory overflow state', async () => {
		expect.assertions(2);
		const game: GameState = {
			...currentInventoryGame(),
			cityInventories: [
				{
					cityId: 'industry-city',
					materials: { snacks: 205 }
				}
			]
		};

		render(ReportsPanel, {
			i18n: createI18n('en'),
			game,
			stores: [store],
			summary
		});

		const reports = page.getByRole('region', { name: 'Reports' });
		await expect
			.element(reports.getByText('Industry City: 205 / 200 city inventory used.'))
			.toBeVisible();
		await expect
			.element(reports.getByText('City inventory overflow: 5 units ($10).'))
			.toBeVisible();
	});

	it('shows the current city inventory zero-stock state', async () => {
		expect.assertions(1);
		const game: GameState = {
			...currentInventoryGame(),
			cityInventories: [{ cityId: 'industry-city', materials: {} }]
		};

		render(ReportsPanel, {
			i18n: createI18n('en'),
			game,
			stores: [store],
			summary
		});

		const reports = page.getByRole('region', { name: 'Reports' });
		await expect
			.element(reports.getByText('Industry City: 0 / 200 city inventory used.'))
			.toBeVisible();
	});

	it('shows the current city inventory unavailable state when game is not provided', async () => {
		expect.assertions(1);

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [store],
			summary
		});

		const reports = page.getByRole('region', { name: 'Reports' });
		await expect.element(reports.getByText('Current city inventory is unavailable.')).toBeVisible();
	});

	it('attributes local-only replenishment without external imports', async () => {
		expect.assertions(2);
		const game = currentInventoryGame();

		render(ReportsPanel, {
			i18n: createI18n('en'),
			game,
			stores: [store],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					storeReports: [
						{
							...replenishedStoreReport(),
							productReports: [
								{
									...replenishedStoreReport().productReports[0]!,
									warehouseUnits: 7,
									importedUnits: 0,
									importCost: 0,
									importSpend: 0
								}
							]
						}
					]
				}
			}
		});

		const reports = page.getByRole('region', { name: 'Reports' });
		await expect
			.element(reports.getByText('Local supply — Industry City → Harbor City: 7 units'))
			.toBeVisible();
		await expect
			.element(reports.getByText(/External imports — Harbor City/))
			.not.toBeInTheDocument();
	});

	it('attributes import-only replenishment without local supply', async () => {
		expect.assertions(2);
		const game = currentInventoryGame();

		render(ReportsPanel, {
			i18n: createI18n('en'),
			game,
			stores: [store],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					storeReports: [
						{
							...replenishedStoreReport(),
							productReports: [
								{
									...replenishedStoreReport().productReports[0]!,
									warehouseUnits: 0,
									warehouseValue: 0,
									importedUnits: 9
								}
							]
						}
					]
				}
			}
		});

		const reports = page.getByRole('region', { name: 'Reports' });
		await expect
			.element(reports.getByText('External imports — Harbor City: 9 units'))
			.toBeVisible();
		await expect.element(reports.getByText(/Local supply —/)).not.toBeInTheDocument();
	});

	it('shows local supply unavailable when resolved supply city is missing', async () => {
		expect.assertions(1);
		const game = currentInventoryGame();

		render(ReportsPanel, {
			i18n: createI18n('en'),
			game,
			stores: [store],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					storeReports: [
						{
							...replenishedStoreReport(),
							replenishment: {
								retailCityId: 'harbor-city',
								configuredSupplyCityId: 'industry-city',
								resolvedSupplyCityId: null
							}
						}
					]
				}
			}
		});

		const reports = page.getByRole('region', { name: 'Reports' });
		await expect
			.element(reports.getByText('Local supply attribution unavailable — Harbor City: 4 units'))
			.toBeVisible();
	});

	it('renders the top-level empty state when summary.latest is null', async () => {
		expect.assertions(1);
		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: null as unknown as ReportSummary['latest']
			}
		});

		const reports = page.getByRole('region', { name: 'Reports' });
		await expect
			.element(reports.getByText('No reports yet. Advance the first day to generate results.'))
			.toBeVisible();
	});

	it('renders the production-close inventory unavailable state when cityInventories is missing', async () => {
		expect.assertions(1);
		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					productionReport: {
						...emptyProductionReport(),
						cityInventories: undefined as unknown as DailyProductionReport['cityInventories']
					}
				}
			}
		});

		const reports = page.getByRole('region', { name: 'Reports' });
		await expect
			.element(reports.getByText('Production-close city inventory is unavailable.'))
			.toBeVisible();
	});

	it('skips store reports without a replenishment context', async () => {
		expect.assertions(1);
		const game = currentInventoryGame();

		render(ReportsPanel, {
			i18n: createI18n('en'),
			game,
			stores: [store],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					storeReports: [
						{
							...replenishedStoreReport(),
							replenishment: undefined as unknown as DailyStoreReport['replenishment']
						}
					]
				}
			}
		});

		const reports = page.getByRole('region', { name: 'Reports' });
		await expect.element(reports.getByText(/Local supply —/)).not.toBeInTheDocument();
	});

	it('renders persisted per-attempt modifier impacts and one recovery row per expired contributor without summing', async () => {
		expect.assertions(7);
		// Evidence is persisted on the report: it must render from these rows
		// alone (valid after the modifiers expired), and same-day same-kind
		// recovery rows must be shown as-is — never summed per route.
		const attempt = createRouteDispatchAttempt({
			routeId: 'route-1',
			materialId: 'water',
			destinationNeed: 20,
			capacity: 15,
			availableOriginStock: 30,
			dispatchedQuantity: 15,
			unusedCapacity: 0,
			unmetDestinationNeed: 5,
			transportCost: 30,
			transferOrderId: 'transfer-9',
			baselineCapacity: 20,
			modifierImpacts: [
				{
					effectKind: 'route-capacity-multiplier',
					contributors: [
						{
							modifierId: 'event-modifier-1',
							source: {
								eventId: 'supplier-terms',
								instanceId: 'event-instance-1',
								optionId: 'bulk-discount'
							},
							explanation: { key: 'events.supplierTerms.bulkDiscount.modifier', params: {} }
						}
					],
					baselineCapacity: 20,
					effectiveCapacity: 15,
					baselineDispatchedQuantity: 20,
					effectiveDispatchedQuantity: 15
				},
				{
					effectKind: 'route-transport-cost-multiplier',
					contributors: [],
					baselineTransportCost: 20,
					effectiveTransportCost: 30
				}
			]
		});
		const recoverySource = {
			eventId: 'supplier-terms',
			instanceId: 'event-instance-1',
			optionId: 'bulk-discount'
		};
		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					logistics: {
						arrivals: [],
						routeDispatchAttempts: [attempt],
						deliveredUnits: 0,
						scheduledTransportCost: 30,
						modifierRecoveries: [
							{
								routeId: 'route-1',
								modifierId: 'event-modifier-1',
								source: recoverySource,
								effectKind: 'route-lead-time-adjustment',
								disruptedLeadTimeDays: 3,
								recoveredLeadTimeDays: 2
							},
							{
								routeId: 'route-1',
								modifierId: 'event-modifier-2',
								source: recoverySource,
								effectKind: 'route-lead-time-adjustment',
								disruptedLeadTimeDays: 3,
								recoveredLeadTimeDays: 2
							}
						]
					}
				}
			}
		});

		const logistics = page.getByRole('region', { name: 'Latest-day logistics' });
		await expect
			.element(logistics.getByText('Capacity: 20 → 15; dispatched: 20 → 15', { exact: true }))
			.toBeVisible();
		await expect
			.element(logistics.getByText('Transport cost: $20 → $30', { exact: true }))
			.toBeVisible();
		await expect
			.element(logistics.getByText('Source: Supplier terms', { exact: true }).first())
			.toBeVisible();
		await expect
			.element(logistics.getByRole('heading', { name: 'Modifier recoveries' }))
			.toBeVisible();
		await expect
			.element(logistics.getByText('Route route-1 lead time recovered: 3 days → 2 days').first())
			.toBeVisible();
		// One row per expired contributor, identical combined values — not summed.
		expect(
			Array.from(
				document.querySelectorAll('.logistics-list li'),
				(item) => item.textContent ?? ''
			).filter((text) => text.includes('Route route-1 lead time recovered: 3 days → 2 days'))
		).toHaveLength(2);
		await expect.element(logistics.getByText('3 days → 4 days')).not.toBeInTheDocument();
	});

	it('renders zero utilization for a dispatch attempt with zero capacity', async () => {
		expect.assertions(1);

		const zeroCapacityAttempt = createRouteDispatchAttempt({
			routeId: 'route-zero',
			materialId: 'water',
			destinationNeed: 10,
			capacity: 0,
			availableOriginStock: 0,
			dispatchedQuantity: 0,
			unusedCapacity: 0,
			unmetDestinationNeed: 10,
			transportCost: 0,
			transferOrderId: null,
			baselineCapacity: 0
		});

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					logistics: {
						arrivals: [],
						routeDispatchAttempts: [zeroCapacityAttempt],
						deliveredUnits: 0,
						scheduledTransportCost: 0,
						modifierRecoveries: []
					}
				}
			}
		});

		const logistics = page.getByRole('region', { name: 'Latest-day logistics' });
		await expect.element(logistics.getByText('Utilization: 0%')).toBeVisible();
	});

	it('surfaces obsolescence evidence for a product whose demand was reduced', async () => {
		expect.assertions(2);
		const obsolescenceReport: DailyStoreReport = {
			...pressureStoreReport(),
			productReports: [
				{
					...pressureStoreReport().productReports[0]!,
					productId: 'games',
					name: 'Games',
					wasteUnits: 0,
					shrinkUnits: 0,
					stockoutLostDemand: 0,
					markdownAmount: 0,
					obsolescenceMultiplier: 0.7,
					averageAgeDays: null,
					oldestSellableAgeDays: null
				}
			],
			inventoryLossExpense: 0
		};

		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [store],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					storeReports: [obsolescenceReport],
					inventoryLossExpense: 0
				}
			}
		});

		const pressure = page.getByRole('region', { name: 'Product pressure evidence' });
		await expect.element(pressure.getByText('Obsolescence: 70% demand')).toBeVisible();
		await expect.element(pressure.getByText('Inventory loss expense: $6')).not.toBeInTheDocument();
	});

	it('renders the empty pressure copy when only inventory loss expense is present', async () => {
		expect.assertions(2);
		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: {
				...summary,
				latest: {
					...summary.latest!,
					storeReports: [],
					inventoryLossExpense: 12
				}
			}
		});

		const pressure = page.getByRole('region', { name: 'Product pressure evidence' });
		await expect
			.element(pressure.getByText('No product pressure evidence recorded.'))
			.toBeVisible();
		await expect.element(pressure.getByText('Inventory loss expense: $12')).toBeVisible();
	});

	it('hides the product pressure section when there is no latest report', async () => {
		expect.assertions(1);
		render(ReportsPanel, {
			i18n: createI18n('en'),
			stores: [],
			summary: { ...summary, latest: undefined }
		});

		expect(document.querySelector('.product-pressure-evidence')).toBeNull();
	});
});
