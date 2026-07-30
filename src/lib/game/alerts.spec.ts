import { describe, expect, it, vi } from 'vitest';
import { collectGameAlerts } from './alerts';
import { createEmptyFinanceState } from './finance';
import * as finance from './finance';
import * as financeMetrics from './financeMetrics';
import { decisionContextLocationGeneric } from './decisionContext';
import type {
	GameState,
	Store,
	IndustrialBuilding,
	IndustrialBuildingTypeId,
	DecisionItem,
	StoreProduct,
	LoanInstrument
} from './types';

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

function product(overrides: Partial<StoreProduct> = {}): StoreProduct {
	return {
		categoryId: 'snacks',
		stock: 50,
		reorderThreshold: 10,
		targetStock: 60,
		sellingPrice: 5,
		...overrides
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
		competition: 20,
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

function baseGame(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 1,
		rngState: 0,
		day: 5,
		cash: 1000,
		finance: createEmptyFinanceState(5),
		policy: {} as GameState['policy'],
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
		warehouse: { capacity: 0, materials: {}, overflowUnits: 0, overflowCost: 0 },
		stores: [],
		staff: [],
		hiringCandidates: [],
		decisions: [],
		reports: [],
		...overrides
	};
}

describe('collectGameAlerts', () => {
	it('returns no alerts for a healthy game', () => {
		expect.assertions(1);
		expect(collectGameAlerts(baseGame({ stores: [store()] }))).toEqual([]);
	});

	it('flags a store with out-of-stock products and deep-links to its tile', () => {
		expect.assertions(4);
		const alerts = collectGameAlerts(
			baseGame({ stores: [store({ products: [product({ stock: 0 })] })] })
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].kind).toBe('store-stock');
		expect(alerts[0].tileId).toBe('tile-1');
		expect(alerts[0].message).toMatch(/out of stock/i);
	});

	it('flags a store that needs import (below reorder threshold)', () => {
		expect.assertions(2);
		const alerts = collectGameAlerts(
			baseGame({ stores: [store({ products: [product({ stock: 5, reorderThreshold: 10 })] })] })
		);
		expect(alerts).toHaveLength(1);
		expect(alerts[0].message).toMatch(/1 product needs import/i);
	});

	it('counts out-of-stock and needs-import products separately in a mixed store', () => {
		expect.assertions(2);
		const alerts = collectGameAlerts(
			baseGame({
				stores: [
					store({
						products: [
							product({ stock: 0, reorderThreshold: 10 }),
							product({ stock: 5, reorderThreshold: 10 }),
							product({ stock: 3, reorderThreshold: 10 })
						]
					})
				]
			})
		);
		expect(alerts[0].message).toBe('Corner Market: 1 product out of stock, 2 products need import');
		expect(alerts[0].message).not.toMatch(/3 products out of stock/i);
	});

	it('flags pending decisions', () => {
		expect.assertions(2);
		const decision: DecisionItem = {
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
		expect(alerts[0].message).toMatch(/lease renewal/i);
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
		expect(alerts[0].message).toBe('unknown-type starved of inputs');
	});

	it('adds finance alerts after stock, decisions, and factories with stable deep links', () => {
		const finance = createEmptyFinanceState(5);
		const alerts = collectGameAlerts(
			baseGame({
				cash: -1,
				stores: [store({ products: [product({ stock: 0 })] })],
				decisions: [
					{
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
		spy.mockRestore();
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

		financeMetricsSpy.mockRestore();
		assessCreditSpy.mockRestore();
	});
});
