import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectGameAlerts } from './alerts';
import { createEmptyFinanceState } from './finance';
import * as finance from './finance';
import * as financeMetrics from './financeMetrics';
import { createInitialEventRuntime } from './eventSelection';
import { decisionContextLocationGeneric } from './decisionContext';
import { createRouteDispatchAttempt } from './logisticsReport.testUtils';
import { simulateDay } from './simulateDay';
import { createNewGame } from './state';
import type {
	DailyReport,
	DailyRouteDispatchAttempt,
	GameState,
	StaffMember,
	Store,
	IndustrialBuilding,
	IndustrialBuildingTypeId,
	DecisionItem,
	StoreProduct,
	LoanInstrument,
	ActiveEventModifier,
	MaterialId,
	RecurringRoute
} from './types';

function modifier(overrides: Partial<ActiveEventModifier> = {}): ActiveEventModifier {
	return {
		id: 'event-modifier-1',
		source: {
			eventId: 'supplier-terms',
			instanceId: 'event-instance-1',
			optionId: 'bulk-discount'
		},
		target: { kind: 'company' },
		startsOnDay: 5,
		expiresOnDay: 8,
		stackingKey: 'supplier-bulk-discount:retail-product',
		stackingRule: 'replace',
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

function loan(overrides: Partial<LoanInstrument> = {}): LoanInstrument {
	return {
		id: 'loan-1',
		purpose: 'workingCapital',
		status: 'active',
		openedOnDay: 1,
		originalPrincipal: 1_000,
		remainingPrincipal: 1_000,
		annualInterestRateBps: 0,
		termDays: 28,
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

function product(
	overrides: Partial<StoreProduct> & { initialQuantity?: number } = {}
): StoreProduct {
	const { initialQuantity = 50, ...productOverrides } = overrides;
	return {
		productId: 'snacks',
		brandId: 'common-ground',
		lots: initialQuantity > 0 ? [{ receivedDay: 1, quantity: initialQuantity }] : [],
		reorderThreshold: 10,
		targetStock: 60,
		sellingPrice: 5,
		...productOverrides
	};
}

function store(overrides: Partial<Store> = {}): Store {
	return {
		id: 'store-1',
		level: 1,
		name: 'Corner Market',
		archetypeId: 'convenience',
		location: { neighborhoodId: 'downtown', x: 0, y: 0 },
		cityId: 'harbor-city',
		tileId: 'tile-1',
		mapX: 1,
		mapY: 1,
		daysOpen: 3,
		reputation: 50,
		stockHealth: 90,
		products: [product()],
		staffMorale: 80,
		staffCapacity: 2,
		localDemand: 50,
		managerQuality: 40,
		...overrides
	};
}

function building(overrides: Partial<IndustrialBuilding> = {}): IndustrialBuilding {
	return {
		id: 'bld-1',
		level: 1,
		typeId: 'flour-mill',
		cityId: 'industry-city',
		tileId: 'itile-1',
		mapX: 2,
		mapY: 2,
		status: 'produced',
		lastProduction: [],
		producedTotal: 10,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {},
		...overrides
	};
}

function managerAction(
	overrides: Partial<GameState['managerActionHistory'][number]> = {}
): GameState['managerActionHistory'][number] {
	return {
		id: 'manager-action:5:manager-1:pricing:store-1',
		day: 5,
		managerId: 'manager-1',
		scope: { kind: 'store', storeId: 'store-1' },
		playbook: 'protect-margin',
		conflictKey: 'pricing:store-1',
		outcome: 'applied',
		reason: 'margin-below-threshold',
		change: {
			kind: 'pricing-policy',
			storeId: 'store-1',
			before: 'standard',
			proposed: 'premium',
			applied: 'premium'
		},
		...overrides
	};
}

function managerStaff(id: string): StaffMember {
	return {
		id,
		name: id,
		role: 'manager',
		monthlySalary: 100,
		skill: 50,
		morale: 50,
		assignedStoreId: null,
		hiredOnDay: 1,
		level: 1,
		xp: 0
	};
}

function baseGame(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 1,
		rngState: 0,
		day: 5,
		cash: 1000,
		finance: createEmptyFinanceState(5),
		policy: {} as GameState['policy'],
		policyOverrides: [],
		managerDelegations: [],
		managerActionHistory: [],
		scorecard: {
			profit: 50,
			customerSatisfaction: 50,
			staffMorale: 50,
			marketPosition: 50
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
		events: createInitialEventRuntime(1),
		decisions: [],
		reports: [],
		...overrides
	};
}

function recurringRoute(overrides: Partial<RecurringRoute> = {}): RecurringRoute {
	return {
		id: 'route-1',
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		capacity: 5,
		frequencyDays: 3,
		leadTimeDays: 2,
		transportCostPerUnit: 2,
		priority: 1,
		state: 'active',
		nextDispatchOnDay: 10,
		...overrides
	};
}

function routeAttempt(
	overrides: Partial<DailyRouteDispatchAttempt> = {}
): DailyRouteDispatchAttempt {
	return createRouteDispatchAttempt({
		routeId: 'route-1',
		materialId: 'water',
		destinationNeed: 10,
		capacity: 5,
		availableOriginStock: 0,
		dispatchedQuantity: 0,
		unusedCapacity: 5,
		unmetDestinationNeed: 10,
		transportCost: 0,
		transferOrderId: null,
		baselineCapacity: overrides.capacity ?? 5,
		...overrides
	});
}

let logisticsReportTemplate: DailyReport | null = null;

function logisticsReport(day: number, attempts: DailyRouteDispatchAttempt[]): DailyReport {
	if (!logisticsReportTemplate) {
		logisticsReportTemplate = simulateDay(createNewGame('convenience', 1)).reports[0]!;
	}
	return {
		...logisticsReportTemplate,
		day,
		logistics: {
			...logisticsReportTemplate.logistics,
			arrivals: [],
			routeDispatchAttempts: attempts,
			scheduledTransportCost: attempts.reduce((total, attempt) => total + attempt.transportCost, 0)
		}
	};
}

function logisticsGame(input: {
	route?: Partial<RecurringRoute>;
	stock?: number;
	attempts?: Array<{ day: number; attempt: Partial<DailyRouteDispatchAttempt> }>;
}): GameState {
	const route = recurringRoute(input.route);
	return baseGame({
		cityInventories: [
			{
				cityId: route.originCityId,
				materials: { [route.materialId]: input.stock ?? 0 } as Partial<Record<MaterialId, number>>
			}
		],
		logistics: {
			transferOrders: [],
			recurringRoutes: [route],
			nextTransferSequence: 1,
			nextRouteSequence: 2
		},
		reports: (input.attempts ?? []).map(({ day, attempt }) =>
			logisticsReport(day, [routeAttempt({ ...attempt, routeId: route.id })])
		)
	});
}

describe('collectGameAlerts', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('returns no alerts for a healthy game', () => {
		expect.assertions(1);
		expect(collectGameAlerts(baseGame({ stores: [store()] }))).toEqual([]);
	});

	it('does not alert for applied-only manager activity', () => {
		expect(
			collectGameAlerts(
				baseGame({
					staff: [managerStaff('manager-1')],
					managerActionHistory: [managerAction({ outcome: 'applied' })]
				})
			)
		).toEqual([]);
	});

	it('emits one manager exception alert for multiple non-applied rows by one manager', () => {
		expect(
			collectGameAlerts(
				baseGame({
					staff: [managerStaff('manager-1')],
					managerActionHistory: [
						managerAction({ outcome: 'overridden' }),
						managerAction({
							id: 'manager-action:5:manager-1:pricing:store-2',
							conflictKey: 'pricing:store-2',
							outcome: 'rejected'
						}),
						managerAction({
							id: 'manager-action:5:manager-1:pricing:store-3',
							conflictKey: 'pricing:store-3',
							outcome: 'out-of-authority'
						})
					]
				})
			)
		).toEqual([
			{
				id: 'manager-exception:manager-1',
				kind: 'manager-exception',
				managerId: 'manager-1',
				managementPanelId: 'staff'
			}
		]);
	});

	it('emits one manager exception alert per affected manager on the newest action day', () => {
		expect(
			collectGameAlerts(
				baseGame({
					staff: [managerStaff('manager-a'), managerStaff('manager-b')],
					managerActionHistory: [
						managerAction({
							id: 'manager-action:6:manager-b:pricing:store-1',
							day: 6,
							managerId: 'manager-b',
							outcome: 'rejected'
						}),
						managerAction({
							id: 'manager-action:6:manager-a:pricing:store-1',
							day: 6,
							managerId: 'manager-a',
							outcome: 'overridden'
						})
					]
				})
			)
		).toEqual([
			{
				id: 'manager-exception:manager-a',
				kind: 'manager-exception',
				managerId: 'manager-a',
				managementPanelId: 'staff'
			},
			{
				id: 'manager-exception:manager-b',
				kind: 'manager-exception',
				managerId: 'manager-b',
				managementPanelId: 'staff'
			}
		]);
	});

	it('does not surface an older manager exception after a newer applied-only day', () => {
		expect(
			collectGameAlerts(
				baseGame({
					staff: [managerStaff('manager-1')],
					managerActionHistory: [
						managerAction({
							id: 'manager-action:5:manager-1:pricing:store-1',
							day: 5,
							outcome: 'overridden'
						}),
						managerAction({
							id: 'manager-action:6:manager-1:pricing:store-1',
							day: 6,
							outcome: 'applied'
						})
					]
				})
			)
		).toEqual([]);
	});

	it('does not emit a manager exception alert for a deleted manager with historical rows', () => {
		// saveCodec.validateManagerActionHistory deliberately accepts historical
		// rows referencing managers that no longer exist. Such an alert would
		// deep-link to the Staff panel with no corresponding manager and
		// localize to an empty message, so it must be suppressed.
		expect(
			collectGameAlerts(
				baseGame({
					staff: [],
					managerActionHistory: [
						managerAction({
							id: 'manager-action:5:deleted-manager:pricing:store-1',
							managerId: 'deleted-manager',
							outcome: 'rejected'
						})
					]
				})
			)
		).toEqual([]);
	});

	it('still alerts for a current manager alongside a deleted manager on the newest day', () => {
		expect(
			collectGameAlerts(
				baseGame({
					staff: [managerStaff('manager-current')],
					managerActionHistory: [
						managerAction({
							id: 'manager-action:5:deleted-manager:pricing:store-1',
							managerId: 'deleted-manager',
							outcome: 'overridden'
						}),
						managerAction({
							id: 'manager-action:5:manager-current:pricing:store-1',
							managerId: 'manager-current',
							outcome: 'rejected'
						})
					]
				})
			)
		).toEqual([
			{
				id: 'manager-exception:manager-current',
				kind: 'manager-exception',
				managerId: 'manager-current',
				managementPanelId: 'staff'
			}
		]);
	});

	it('flags a store with out-of-stock products and deep-links to its tile', () => {
		expect.assertions(5);
		const alerts = collectGameAlerts(
			baseGame({ stores: [store({ products: [product({ initialQuantity: 0 })] })] })
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].kind).toBe('store-stock');
		expect(alerts[0].tileId).toBe('tile-1');
		expect(alerts[0].storeId).toBe('store-1');
		expect(alerts[0].message).toBeUndefined();
	});

	it('flags a store that needs import (below reorder threshold)', () => {
		expect.assertions(2);
		const alerts = collectGameAlerts(
			baseGame({
				stores: [store({ products: [product({ initialQuantity: 5, reorderThreshold: 10 })] })]
			})
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toMatchObject({ kind: 'store-stock', storeId: 'store-1' });
	});

	it('keeps stock alerts reference-only for localization at the presentation boundary', () => {
		expect.assertions(2);
		const alerts = collectGameAlerts(
			baseGame({
				stores: [
					store({
						products: [
							product({ initialQuantity: 0, reorderThreshold: 10 }),
							product({ initialQuantity: 5, reorderThreshold: 10 }),
							product({ initialQuantity: 3, reorderThreshold: 10 })
						]
					})
				]
			})
		);
		expect(alerts[0]).toMatchObject({ id: 'store-stock:store-1', storeId: 'store-1' });
		expect(alerts[0].message).toBeUndefined();
	});

	it('flags pending decisions', () => {
		expect.assertions(2);
		const decision: DecisionItem = {
			kind: 'system',
			id: 'dec-1',
			title: 'Lease renewal',
			context: decisionContextLocationGeneric(),
			expiresOnDay: 9,
			options: []
		};
		const alerts = collectGameAlerts(baseGame({ decisions: [decision] }));
		expect(alerts.some((alert) => alert.kind === 'decision' && alert.decisionId === 'dec-1')).toBe(
			true
		);
		expect(alerts[0].message).toBeUndefined();
	});

	it('orders important modifiers by exclusive expiry then ID between decisions and factories', () => {
		const decision: DecisionItem = {
			kind: 'event',
			id: 'event-instance-9',
			eventId: 'supplier-terms',
			definitionVersion: 2,
			generatedOnDay: 5,
			expiresOnDay: 7,
			target: { kind: 'company' },
			copy: { key: 'events.supplierTerms', params: {} },
			options: []
		};
		const alerts = collectGameAlerts(
			baseGame({
				stores: [store({ products: [product({ initialQuantity: 0 })] })],
				decisions: [decision],
				events: {
					...createInitialEventRuntime(1),
					activeModifiers: [
						modifier({ id: 'event-modifier-b', expiresOnDay: 9 }),
						modifier({ id: 'event-modifier-z', expiresOnDay: 8 }),
						modifier({ id: 'event-modifier-a', expiresOnDay: 9 }),
						modifier({ id: 'event-modifier-normal', importance: 'normal', expiresOnDay: 6 })
					]
				},
				industrialBuildings: [building({ status: 'blocked', blockedDays: 1 })]
			})
		);

		expect(alerts.map((alert) => alert.id)).toEqual([
			'store-stock:store-1',
			'decision:event-instance-9',
			'event-modifier:event-modifier-z',
			'event-modifier:event-modifier-a',
			'event-modifier:event-modifier-b',
			'factory-blocked:bld-1'
		]);
		expect(alerts.slice(2, 5)).toEqual([
			{
				id: 'event-modifier:event-modifier-z',
				kind: 'event-modifier',
				modifierId: 'event-modifier-z',
				managementPanelId: 'decisions'
			},
			{
				id: 'event-modifier:event-modifier-a',
				kind: 'event-modifier',
				modifierId: 'event-modifier-a',
				managementPanelId: 'decisions'
			},
			{
				id: 'event-modifier:event-modifier-b',
				kind: 'event-modifier',
				modifierId: 'event-modifier-b',
				managementPanelId: 'decisions'
			}
		]);
	});

	it('sorts important modifiers with equal expiry by ascending id when the smaller id leads', () => {
		const alerts = collectGameAlerts(
			baseGame({
				events: {
					...createInitialEventRuntime(1),
					activeModifiers: [
						modifier({ id: 'event-modifier-a', expiresOnDay: 9 }),
						modifier({ id: 'event-modifier-b', expiresOnDay: 9 })
					]
				}
			})
		);
		expect(alerts.filter((a) => a.kind === 'event-modifier').map((a) => a.modifierId)).toEqual([
			'event-modifier-a',
			'event-modifier-b'
		]);
	});

	it('reuses the event-modifier alert for an important route modifier whose route still exists', () => {
		expect.assertions(2);
		const routeModifier = modifier({
			id: 'event-modifier-9',
			target: { kind: 'recurring-route', routeId: 'route-1' },
			stackingKey: 'freight-capacity:route-1',
			effect: { kind: 'route-capacity-multiplier', multiplier: 0.75 },
			explanation: { key: 'events.freightDisruption.acceptDelay.capacity', params: {} }
		});

		const alerts = collectGameAlerts({
			...logisticsGame({}),
			events: { ...createInitialEventRuntime(1), activeModifiers: [routeModifier] }
		});

		expect(alerts).toEqual([
			{
				id: 'event-modifier:event-modifier-9',
				kind: 'event-modifier',
				modifierId: 'event-modifier-9',
				routeId: 'route-1'
			}
		]);
		expect(alerts[0]?.managementPanelId).toBeUndefined();
	});

	it('emits no actionable event-modifier alert once the modifier route has been removed', () => {
		expect.assertions(1);
		const routeModifier = modifier({
			id: 'event-modifier-9',
			importance: 'important',
			target: { kind: 'recurring-route', routeId: 'route-1' },
			stackingKey: 'freight-capacity:route-1',
			effect: { kind: 'route-capacity-multiplier', multiplier: 0.75 },
			explanation: { key: 'events.freightDisruption.acceptDelay.capacity', params: {} }
		});
		const removed = {
			...logisticsGame({}),
			events: { ...createInitialEventRuntime(1), activeModifiers: [routeModifier] }
		};

		const alerts = collectGameAlerts({
			...removed,
			logistics: { ...removed.logistics, recurringRoutes: [] }
		});

		expect(alerts.filter((alert) => alert.kind === 'event-modifier')).toEqual([]);
	});

	it('keeps company modifier alerts on the decisions panel beside route modifier alerts', () => {
		expect.assertions(1);
		const company = modifier({ id: 'event-modifier-company', expiresOnDay: 9 });
		const route = modifier({
			id: 'event-modifier-route',
			expiresOnDay: 8,
			target: { kind: 'recurring-route', routeId: 'route-1' },
			stackingKey: 'freight-capacity:route-1',
			effect: { kind: 'route-capacity-multiplier', multiplier: 0.75 },
			explanation: { key: 'events.freightDisruption.acceptDelay.capacity', params: {} }
		});

		const alerts = collectGameAlerts({
			...logisticsGame({}),
			events: { ...createInitialEventRuntime(1), activeModifiers: [company, route] }
		}).filter((alert) => alert.kind === 'event-modifier');

		expect(alerts).toEqual([
			{
				id: 'event-modifier:event-modifier-route',
				kind: 'event-modifier',
				modifierId: 'event-modifier-route',
				routeId: 'route-1'
			},
			{
				id: 'event-modifier:event-modifier-company',
				kind: 'event-modifier',
				modifierId: 'event-modifier-company',
				managementPanelId: 'decisions'
			}
		]);
	});

	it('flags a blocked factory and deep-links to its tile', () => {
		expect.assertions(3);
		const alerts = collectGameAlerts(
			baseGame({ industrialBuildings: [building({ status: 'blocked', blockedDays: 2 })] })
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].kind).toBe('factory-blocked');
		expect(alerts[0].tileId).toBe('itile-1');
	});

	it('skips a healthy (non-blocked, zero blockedDays) factory', () => {
		expect.assertions(1);
		const alerts = collectGameAlerts(
			baseGame({ industrialBuildings: [building({ status: 'produced', blockedDays: 0 })] })
		);
		expect(alerts).toEqual([]);
	});

	it('flags a factory that is not yet "blocked" but has accumulated blockedDays', () => {
		expect.assertions(2);
		const alerts = collectGameAlerts(
			baseGame({ industrialBuildings: [building({ status: 'produced', blockedDays: 3 })] })
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].kind).toBe('factory-blocked');
	});

	it('falls back to the typeId in the alert message when the building type is unknown', () => {
		expect.assertions(2);
		const alerts = collectGameAlerts(
			baseGame({
				industrialBuildings: [
					building({
						id: 'bld-unknown',
						typeId: 'unknown-type' as IndustrialBuildingTypeId,
						status: 'blocked',
						blockedDays: 1
					})
				]
			})
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0]).toMatchObject({ buildingId: 'bld-unknown', kind: 'factory-blocked' });
	});

	it('adds finance alerts after stock, decisions, and factories with stable deep links', () => {
		const finance = createEmptyFinanceState(5);
		const alerts = collectGameAlerts(
			baseGame({
				cash: -1,
				stores: [store({ products: [product({ initialQuantity: 0 })] })],
				decisions: [
					{
						kind: 'system',
						id: 'decision-1',
						title: 'Lease renewal',
						context: decisionContextLocationGeneric(),
						expiresOnDay: 9,
						options: []
					}
				],
				industrialBuildings: [building({ status: 'blocked', blockedDays: 1 })],
				finance: {
					...finance,
					loans: [
						loan({
							id: 'loan-overdue',
							status: 'delinquent',
							overduePrincipal: 50,
							arrearsSinceDay: 2
						}),
						loan({ id: 'loan-today', nextPaymentDay: 5 }),
						loan({ id: 'loan-soon', nextPaymentDay: 8 })
					]
				}
			})
		);

		expect(alerts.map((alert) => alert.kind)).toEqual([
			'store-stock',
			'decision',
			'factory-blocked',
			'missedLoanPayment',
			'upcomingLoanPayment',
			'upcomingLoanPayment',
			'upcomingLoanPayment',
			'covenantRisk',
			'lowCashRunway'
		]);
		expect(alerts.slice(3)).toMatchObject([
			{
				id: 'missedLoanPayment:loan-overdue',
				loanId: 'loan-overdue',
				managementPanelId: 'finance'
			},
			{ id: 'upcomingLoanPayment:loan-today', loanId: 'loan-today', managementPanelId: 'finance' },
			{
				id: 'upcomingLoanPayment:loan-overdue',
				loanId: 'loan-overdue',
				managementPanelId: 'finance'
			},
			{ id: 'upcomingLoanPayment:loan-soon', loanId: 'loan-soon', managementPanelId: 'finance' },
			{ id: 'covenantRisk', managementPanelId: 'finance' },
			{ id: 'lowCashRunway', managementPanelId: 'finance' }
		]);
	});

	it('includes payments due today through D+3 but not D+4, and sorts finance loans by their dates', () => {
		const finance = createEmptyFinanceState(5);
		const alerts = collectGameAlerts(
			baseGame({
				finance: {
					...finance,
					loans: [
						loan({ id: 'loan-d4', nextPaymentDay: 9 }),
						loan({ id: 'loan-d1-b', nextPaymentDay: 6 }),
						loan({ id: 'loan-d1-a', nextPaymentDay: 6 }),
						loan({ id: 'loan-d3', nextPaymentDay: 8 })
					]
				}
			})
		);

		expect(alerts.map((alert) => alert.id)).toEqual([
			'upcomingLoanPayment:loan-d1-a',
			'upcomingLoanPayment:loan-d1-b',
			'upcomingLoanPayment:loan-d3',
			'covenantRisk'
		]);
	});

	it('keeps a delinquent loan visible in both missed and upcoming groups when its next payment is imminent', () => {
		const finance = createEmptyFinanceState(5);
		const alerts = collectGameAlerts(
			baseGame({
				finance: {
					...finance,
					loans: [
						loan({
							id: 'loan-dual-risk',
							status: 'delinquent',
							overduePrincipal: 25,
							arrearsSinceDay: 3,
							nextPaymentDay: 7
						})
					]
				}
			})
		);

		expect(
			alerts
				.filter((alert) => alert.loanId === 'loan-dual-risk')
				.map(({ id, kind, loanId, managementPanelId }) => ({ id, kind, loanId, managementPanelId }))
		).toEqual([
			{
				id: 'missedLoanPayment:loan-dual-risk',
				kind: 'missedLoanPayment',
				loanId: 'loan-dual-risk',
				managementPanelId: 'finance'
			},
			{
				id: 'upcomingLoanPayment:loan-dual-risk',
				kind: 'upcomingLoanPayment',
				loanId: 'loan-dual-risk',
				managementPanelId: 'finance'
			}
		]);
	});

	it('flags terminal fractional accrued interest as a missed loan payment', () => {
		const alerts = collectGameAlerts(
			baseGame({
				finance: {
					...createEmptyFinanceState(5),
					loans: [
						loan({
							id: 'loan-terminal-fraction',
							status: 'delinquent',
							remainingPrincipal: 0,
							installmentsProcessed: 4,
							nextPaymentDay: null,
							accruedInterestMicros: 1,
							arrearsSinceDay: 5
						})
					]
				}
			})
		);

		expect(alerts).toContainEqual(
			expect.objectContaining({
				id: 'missedLoanPayment:loan-terminal-fraction',
				kind: 'missedLoanPayment',
				loanId: 'loan-terminal-fraction'
			})
		);
	});

	it('sorts missed loans by arrears day and keeps aggregate alerts free of a loan target', () => {
		const finance = createEmptyFinanceState(5);
		const alerts = collectGameAlerts(
			baseGame({
				cash: -1,
				finance: {
					...finance,
					loans: [
						loan({
							id: 'loan-later',
							status: 'delinquent',
							overdueInterest: 2,
							arrearsSinceDay: 4
						}),
						loan({
							id: 'loan-earlier-b',
							status: 'delinquent',
							overduePrincipal: 2,
							arrearsSinceDay: 2
						}),
						loan({
							id: 'loan-earlier-a',
							status: 'delinquent',
							overduePrincipal: 2,
							arrearsSinceDay: 2
						})
					]
				}
			})
		);

		expect(alerts.slice(0, 3).map((alert) => alert.id)).toEqual([
			'missedLoanPayment:loan-earlier-a',
			'missedLoanPayment:loan-earlier-b',
			'missedLoanPayment:loan-later'
		]);
		expect(
			alerts
				.slice(3)
				.map(({ kind, managementPanelId, loanId }) => ({ kind, managementPanelId, loanId }))
		).toEqual([
			{ kind: 'upcomingLoanPayment', managementPanelId: 'finance', loanId: 'loan-earlier-a' },
			{ kind: 'upcomingLoanPayment', managementPanelId: 'finance', loanId: 'loan-earlier-b' },
			{ kind: 'upcomingLoanPayment', managementPanelId: 'finance', loanId: 'loan-later' },
			{ kind: 'covenantRisk', managementPanelId: 'finance', loanId: undefined },
			{ kind: 'lowCashRunway', managementPanelId: 'finance', loanId: undefined }
		]);
	});

	it('omits covenant risk without debt service and runway risk beyond seven days', () => {
		expect(collectGameAlerts(baseGame())).toEqual([]);
	});

	it('fires lowCashRunway for a debt-free company with negative cash', () => {
		// Cash runway is meaningful without debt: a company that has never
		// borrowed but holds negative cash has a zero-day runway and must still
		// receive the alert. The early return on empty loans previously suppressed
		// this, making alert behaviour depend on whether the player had ever held
		// a loan. Covenant risk stays gated on debt service (null coverage).
		expect.assertions(3);
		const alerts = collectGameAlerts(baseGame({ cash: -1 }));
		expect(alerts).toHaveLength(1);
		expect(alerts[0]!.kind).toBe('lowCashRunway');
		expect(alerts[0]!.managementPanelId).toBe('finance');
	});

	it('skips getFinanceMetrics and its credit scans for a debt-free negative-cash game', () => {
		// collectGameAlerts is a reactive page derivation that re-runs on every
		// relevant game-state update. When there are no outstanding loans,
		// getFinanceMetrics would compute three term-specific credit assessments
		// (each potentially performing an exact whole-dollar downward scan) that
		// are irrelevant for alerts. The debt-free path must call projectCashRunway
		// directly instead.
		const spy = vi.spyOn(financeMetrics, 'getFinanceMetrics');
		const alerts = collectGameAlerts(baseGame({ cash: -1 }));
		expect(alerts).toHaveLength(1);
		expect(alerts[0]!.kind).toBe('lowCashRunway');
		expect(spy).not.toHaveBeenCalled();
	});

	it('preserves covenant/runway alerts for an active-loan game without invoking credit assessment', () => {
		// Normal games always carry the Founding Loan, so collectGameAlerts runs
		// on essentially every game-state update. It must compute debt-service
		// coverage and cash runway from the lightweight alert snapshot rather than
		// getFinanceMetrics, which would run three term-specific assessCredit
		// scans (each potentially performing an exact whole-dollar downward scan)
		// that alerts never consume. Covenant risk stays gated on debt service
		// (null coverage without scheduled service); runway still fires on cash.
		const financeMetricsSpy = vi.spyOn(financeMetrics, 'getFinanceMetrics');
		const assessCreditSpy = vi.spyOn(finance, 'assessCredit');
		const alerts = collectGameAlerts(
			baseGame({
				cash: -1,
				finance: {
					...createEmptyFinanceState(5),
					loans: [loan({ id: 'loan-active', nextPaymentDay: 8 })]
				}
			})
		);

		expect(financeMetricsSpy).not.toHaveBeenCalled();
		expect(assessCreditSpy).not.toHaveBeenCalled();
		expect(alerts.map((alert) => alert.kind)).toContain('covenantRisk');
		expect(alerts.map((alert) => alert.kind)).toContain('lowCashRunway');
	});

	it('fires an origin-stock alert only while current stock is below the latest dispatch threshold', () => {
		const game = logisticsGame({
			stock: 4,
			attempts: [
				{
					day: 9,
					attempt: {
						destinationNeed: 10,
						capacity: 5,
						availableOriginStock: 0,
						dispatchedQuantity: 0,
						unusedCapacity: 5,
						unmetDestinationNeed: 10
					}
				}
			]
		});

		expect(collectGameAlerts(game)).toContainEqual({
			id: 'logistics-origin-stock:route-1',
			kind: 'logistics-origin-stock',
			routeId: 'route-1'
		});

		const refilledGame = {
			...game,
			cityInventories: [{ cityId: 'industry-city' as const, materials: { water: 5 } }]
		};
		expect(refilledGame.reports).toBe(game.reports);
		expect(
			collectGameAlerts(refilledGame).some((alert) => alert.kind === 'logistics-origin-stock')
		).toBe(false);
	});

	it('requires two newest capacity-constrained attempts and clears after a later normal attempt', () => {
		const constrainedAttempt = {
			destinationNeed: 10,
			capacity: 5,
			availableOriginStock: 10,
			dispatchedQuantity: 5,
			unusedCapacity: 0,
			unmetDestinationNeed: 5
		};
		const game = logisticsGame({
			stock: 10,
			attempts: [
				{ day: 8, attempt: constrainedAttempt },
				{ day: 9, attempt: constrainedAttempt }
			]
		});

		const oneAttempt = {
			...game,
			reports: game.reports.slice(1)
		};
		expect(
			collectGameAlerts(oneAttempt).some((alert) => alert.kind === 'logistics-route-capacity')
		).toBe(false);
		expect(collectGameAlerts(game)).toContainEqual({
			id: 'logistics-route-capacity:route-1',
			kind: 'logistics-route-capacity',
			routeId: 'route-1'
		});

		const normalAttempt = {
			...constrainedAttempt,
			dispatchedQuantity: 5,
			unusedCapacity: 0,
			unmetDestinationNeed: 0,
			destinationNeed: 5
		};
		const recoveredGame = {
			...game,
			reports: [...game.reports, logisticsReport(10, [routeAttempt(normalAttempt)])]
		};
		expect(
			collectGameAlerts(recoveredGame).some((alert) => alert.kind === 'logistics-route-capacity')
		).toBe(false);
	});

	it('does not extend the structural capacity alert across temporary ×0.75 saturated attempts', () => {
		// A ×0.75 capacity disruption saturates the effective capacity at 75 of
		// the 100 base capacity. Two such attempts describe temporary pressure,
		// not persistent configured undersizing, so no logistics-route-capacity
		// alert may fire. Two undisrupted base-capacity-saturated attempts still
		// fire (covered by the streak test above).
		const reducedAttempt = {
			destinationNeed: 100,
			capacity: 75,
			availableOriginStock: 100,
			dispatchedQuantity: 75,
			unusedCapacity: 0,
			unmetDestinationNeed: 25,
			transportCost: 150,
			baselineCapacity: 100
		};
		const game = logisticsGame({
			route: { capacity: 100 },
			stock: 100,
			attempts: [
				{ day: 8, attempt: reducedAttempt },
				{ day: 9, attempt: reducedAttempt }
			]
		});

		expect(collectGameAlerts(game).filter((alert) => alert.routeId === 'route-1')).toEqual([]);
	});

	it('uses the current effective capacity for the origin-stock alert threshold', () => {
		// The self-clearing origin-stock threshold follows the route's current
		// effective capacity: with a ×0.75 modifier the route needs only 75
		// units, so 80 units of origin stock keeps the alert clear.
		const baseRoute = recurringRoute({ capacity: 100 });
		const reducedAttempt = {
			destinationNeed: 100,
			capacity: 75,
			availableOriginStock: 70,
			dispatchedQuantity: 70,
			unusedCapacity: 5,
			unmetDestinationNeed: 30,
			transportCost: 140,
			baselineCapacity: 100
		};
		const capacityModifier: ActiveEventModifier = {
			id: 'event-modifier-1',
			source: {
				eventId: 'freight-disruption',
				instanceId: 'event-instance-1',
				optionId: 'accept-delay'
			},
			target: { kind: 'recurring-route', routeId: 'route-1' },
			startsOnDay: 1,
			expiresOnDay: 20,
			stackingKey: 'freight-capacity:route-1',
			stackingRule: 'replace',
			effect: { kind: 'route-capacity-multiplier', multiplier: 0.75 },
			explanation: { key: 'events.freightDisruption.acceptDelay.capacity', params: {} },
			importance: 'normal'
		};
		const game = {
			...logisticsGame({
				route: baseRoute,
				stock: 80,
				attempts: [{ day: 9, attempt: reducedAttempt }]
			}),
			events: { ...createInitialEventRuntime(1), activeModifiers: [capacityModifier] }
		};

		expect(collectGameAlerts(game).filter((alert) => alert.routeId === 'route-1')).toEqual([]);

		const belowThresholdGame = {
			...game,
			cityInventories: [{ cityId: 'industry-city' as const, materials: { water: 74 } }]
		};
		expect(
			collectGameAlerts(belowThresholdGame).some(
				(alert) => alert.kind === 'logistics-origin-stock' && alert.routeId === 'route-1'
			)
		).toBe(true);
	});

	it('does not alert for destination-full, paused, or deleted routes', () => {
		const destinationFull = logisticsGame({
			stock: 0,
			attempts: [
				{
					day: 9,
					attempt: {
						destinationNeed: 0,
						capacity: 5,
						availableOriginStock: 0,
						dispatchedQuantity: 0,
						unusedCapacity: 5,
						unmetDestinationNeed: 0
					}
				}
			]
		});
		expect(
			collectGameAlerts(destinationFull).filter((alert) => alert.routeId === 'route-1')
		).toEqual([]);

		const paused = logisticsGame({
			route: { state: 'paused' },
			stock: 0,
			attempts: [
				{ day: 8, attempt: { availableOriginStock: 0 } },
				{
					day: 9,
					attempt: {
						availableOriginStock: 10,
						dispatchedQuantity: 5,
						unusedCapacity: 0,
						unmetDestinationNeed: 5
					}
				}
			]
		});
		expect(collectGameAlerts(paused).filter((alert) => alert.routeId === 'route-1')).toEqual([]);

		const deleted = {
			...destinationFull,
			logistics: { ...destinationFull.logistics, recurringRoutes: [] }
		};
		expect(collectGameAlerts(deleted).filter((alert) => alert.routeId === 'route-1')).toEqual([]);
	});

	it('does not alert for an active route with no dispatch attempts yet', () => {
		const game = logisticsGame({ stock: 0, attempts: [] });
		expect(collectGameAlerts(game).filter((alert) => alert.routeId === 'route-1')).toEqual([]);
	});

	it('ignores stale attempts after a recurring route edit until matching dispatches occur', () => {
		// updateRecurringRoute preserves the route ID across config changes. Two
		// capacity-constrained attempts recorded under the prior configuration
		// must not surface as the edited route's latest attempt or drive a
		// capacity-streak alert before the new configuration has dispatched.
		const staleConstrainedAttempt = {
			originCityId: 'industry-city' as const,
			destinationCityId: 'breadbasket-basin' as const,
			materialId: 'water' as MaterialId,
			capacity: 5,
			destinationNeed: 10,
			availableOriginStock: 10,
			dispatchedQuantity: 5,
			unusedCapacity: 0,
			unmetDestinationNeed: 5
		};
		const editedGame = logisticsGame({
			route: {
				originCityId: 'quarry-works',
				destinationCityId: 'industry-city',
				materialId: 'grain',
				capacity: 30
			},
			stock: 30,
			attempts: [
				{ day: 7, attempt: staleConstrainedAttempt },
				{ day: 8, attempt: staleConstrainedAttempt }
			]
		});

		const editedAlerts = collectGameAlerts(editedGame).filter(
			(alert) => alert.routeId === 'route-1'
		);
		expect(editedAlerts).toEqual([]);

		const matchingConstrainedAttempt = {
			originCityId: 'quarry-works' as const,
			destinationCityId: 'industry-city' as const,
			materialId: 'grain' as MaterialId,
			capacity: 30,
			destinationNeed: 40,
			availableOriginStock: 30,
			dispatchedQuantity: 30,
			unusedCapacity: 0,
			unmetDestinationNeed: 10,
			baselineCapacity: 30
		};
		const oneMatchingGame = {
			...editedGame,
			reports: [
				...editedGame.reports,
				logisticsReport(9, [routeAttempt(matchingConstrainedAttempt)])
			]
		};
		expect(
			collectGameAlerts(oneMatchingGame).some((alert) => alert.kind === 'logistics-route-capacity')
		).toBe(false);

		const twoMatchingGame = {
			...oneMatchingGame,
			reports: [
				...oneMatchingGame.reports,
				logisticsReport(10, [routeAttempt(matchingConstrainedAttempt)])
			]
		};
		expect(
			collectGameAlerts(twoMatchingGame).some(
				(alert) => alert.kind === 'logistics-route-capacity' && alert.routeId === 'route-1'
			)
		).toBe(true);
	});

	it('sorts missed loans with null arrearsSinceDay after loans with a known arrears day', () => {
		// hasLoanArrears can be true when overdueInterest > 0 even if
		// arrearsSinceDay is null. compareByNumberThenId must fall back to
		// Number.MAX_SAFE_INTEGER for the null side so those loans sort last.
		const finance = createEmptyFinanceState(5);
		const alerts = collectGameAlerts(
			baseGame({
				finance: {
					...finance,
					loans: [
						loan({
							id: 'loan-null-arrears',
							status: 'delinquent',
							overdueInterest: 3,
							arrearsSinceDay: null
						}),
						loan({
							id: 'loan-known-arrears',
							status: 'delinquent',
							overduePrincipal: 2,
							arrearsSinceDay: 2
						})
					]
				}
			})
		);

		expect(alerts.slice(0, 2).map((alert) => alert.id)).toEqual([
			'missedLoanPayment:loan-known-arrears',
			'missedLoanPayment:loan-null-arrears'
		]);
	});

	it('uses the loan id tiebreaker when arrears days are equal and the larger id leads', () => {
		const finance = createEmptyFinanceState(5);
		const alerts = collectGameAlerts(
			baseGame({
				finance: {
					...finance,
					loans: [
						loan({
							id: 'loan-b',
							status: 'delinquent',
							overduePrincipal: 2,
							arrearsSinceDay: 2
						}),
						loan({
							id: 'loan-a',
							status: 'delinquent',
							overduePrincipal: 2,
							arrearsSinceDay: 2
						})
					]
				}
			})
		);

		expect(alerts.slice(0, 2).map((alert) => alert.id)).toEqual([
			'missedLoanPayment:loan-a',
			'missedLoanPayment:loan-b'
		]);
	});

	it('fires an origin-stock alert when the origin city inventory lacks the route material entirely', () => {
		// The ?? 0 fallback in the origin-stock check must fire when the
		// material key is absent from the origin city inventory, not just when
		// it is present with a zero value.
		const game = logisticsGame({
			stock: 0,
			attempts: [
				{
					day: 9,
					attempt: {
						destinationNeed: 10,
						capacity: 5,
						availableOriginStock: 0,
						dispatchedQuantity: 0,
						unusedCapacity: 5,
						unmetDestinationNeed: 10
					}
				}
			]
		});
		const gameWithoutMaterial = {
			...game,
			cityInventories: [
				{
					cityId: 'industry-city' as const,
					materials: { grain: 5 } as Partial<Record<MaterialId, number>>
				}
			]
		};

		expect(collectGameAlerts(gameWithoutMaterial)).toContainEqual({
			id: 'logistics-origin-stock:route-1',
			kind: 'logistics-origin-stock',
			routeId: 'route-1'
		});
	});

	it('sorts important modifiers with equal expiry by ascending id when the larger id leads', () => {
		const alerts = collectGameAlerts(
			baseGame({
				events: {
					...createInitialEventRuntime(1),
					activeModifiers: [
						modifier({ id: 'event-modifier-b', expiresOnDay: 9 }),
						modifier({ id: 'event-modifier-a', expiresOnDay: 9 })
					]
				}
			})
		);
		expect(alerts.filter((a) => a.kind === 'event-modifier').map((a) => a.modifierId)).toEqual([
			'event-modifier-a',
			'event-modifier-b'
		]);
	});
});
