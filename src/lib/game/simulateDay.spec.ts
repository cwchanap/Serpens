import { describe, expect, test, vi } from 'vitest';
import { ARCHETYPES } from './archetypes';
import { generateDecisions } from './events';
import { appendFinanceTransaction, getTotalDebt } from './finance';
import { generateCity } from './city';
import { buildIndustrialBuilding } from './industryPlacement';
import { decisionContextLocationGeneric } from './decisionContext';
import { createNewGame, updatePolicy } from './state';
import { getStaffXpForLevel } from './staffLeveling';
import { DEFAULT_SIMULATION_RULES, type SimulationRules } from './simulationRules';
import { simulateDay } from './simulateDay';
import type { DecisionItem, GameState, StaffMember } from './types';

describe('daily simulation', () => {
	test('keeps omitted and explicit defaults deeply equal', () => {
		const game = createNewGame('electronics', 280_002);

		expect(simulateDay(game)).toEqual(simulateDay(game, DEFAULT_SIMULATION_RULES));
	});

	test('changes weekly retail import spend without changing sales cost or rng', () => {
		const base = createNewGame('electronics', 280_003);
		const game = {
			...base,
			day: 7,
			stores: base.stores.map((store) => ({
				...store,
				products: store.products.map((product) => ({
					...product,
					stock: 20,
					reorderThreshold: 100,
					targetStock: 100
				}))
			}))
		};
		const rules: SimulationRules = {
			importCostMultipliers: [
				{ scope: 'retail-product', target: { kind: 'ids', ids: ['games'] }, multiplier: 2 }
			]
		};
		const baseline = simulateDay(game);
		const doubled = simulateDay(game, rules);
		const baselineProduct = baseline.reports[0]!.storeReports[0]!.productReports[0]!;
		const doubledProduct = doubled.reports[0]!.storeReports[0]!.productReports[0]!;

		expect(doubledProduct.importedUnits).toBe(baselineProduct.importedUnits);
		expect(doubledProduct.importSpend).toBe(baselineProduct.importSpend * 2);
		expect(doubledProduct.costOfGoods).toBe(baselineProduct.costOfGoods);
		expect(doubled.reports[0]!.costOfGoods).toBe(baseline.reports[0]!.costOfGoods);
		expect(doubled.rngState).toBe(baseline.rngState);
	});

	test('advances one day deterministically for the same seed and actions', () => {
		expect.assertions(5);
		const first = simulateDay(createNewGame('convenience', 2026));
		const second = simulateDay(createNewGame('convenience', 2026));

		expect(first.day).toBe(2);
		expect(first.cash).toBe(second.cash);
		expect(first.reports[0]?.netIncome).toBe(second.reports[0]?.netIncome);
		expect(first.rngState).toBe(second.rngState);
		expect(first.staff).toEqual(second.staff);
	});

	test('reconciles the founding loan day-8 tick and resets finance activity for day 9', () => {
		expect.assertions(14);
		let beforeClosingDay = createNewGame('grocery', 277_008);

		for (let day = 1; day < 8; day += 1) {
			beforeClosingDay = simulateDay(beforeClosingDay);
		}

		const result = simulateDay(beforeClosingDay);
		const report = result.reports.at(-1)!;

		expect(report.day).toBe(8);
		expect(result.day).toBe(9);
		expect(report.cashBefore).toBe(
			beforeClosingDay.cash - beforeClosingDay.finance.currentDayActivity.financingCashFlow
		);
		expect(report.operatingIncome).toBe(report.grossMargin - report.operatingCosts);
		expect(report.netIncome).toBe(report.operatingCashFlow);
		expect(report.interestAccrued).toBeGreaterThan(0);
		expect(report.interestAccrued % 1).not.toBe(0);
		expect(report.principalRepaid).toBeGreaterThan(0);
		expect(report.interestPaid).toBeGreaterThanOrEqual(0);
		expect(report.financingCashFlow).toBe(
			report.principalBorrowed - report.principalRepaid - report.interestPaid
		);
		expect(report.cashAfter).toBe(
			report.cashBefore + report.operatingCashFlow + report.financingCashFlow
		);
		expect(report.outstandingPrincipalAfter).toBe(getTotalDebt(result));
		expect(report.nextLoanPayment).toMatchObject({ loanId: 'loan-1', day: 15 });
		expect(result.finance.currentDayActivity).toEqual({
			day: 9,
			principalBorrowed: 0,
			principalRepaid: 0,
			interestPaid: 0,
			interestCapitalized: 0,
			refinancedPrincipal: 0,
			financingCashFlow: 0
		});
	});

	test('uses plain ID ordering for equal-date next-loan-payment snapshots', () => {
		const base = createNewGame('convenience', 277_281);
		const [foundingLoan] = base.finance.loans;
		const game = {
			...base,
			finance: {
				...base.finance,
				loans: [
					{ ...foundingLoan!, id: 'loan-10' },
					{ ...foundingLoan!, id: 'loan-2' }
				]
			}
		};
		const localeCompare = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
			throw new Error('finance ordering must not depend on locale');
		});

		try {
			expect(simulateDay(game).reports.at(-1)?.nextLoanPayment?.loanId).toBe('loan-10');
		} finally {
			localeCompare.mockRestore();
		}
	});

	test('reports same-day manual financing activity before resetting it for the next day', () => {
		expect.assertions(6);
		const base = createNewGame('boutique', 277_009);
		const finance = appendFinanceTransaction(base.finance, {
			day: base.day,
			kind: 'disbursement',
			loanId: 'manual-credit',
			cashDelta: 500,
			principalAmount: 500,
			principalDelta: 500,
			interestAmount: 0
		});
		const result = simulateDay({ ...base, cash: base.cash + 500, finance });
		const report = result.reports.at(-1)!;

		expect(report.principalBorrowed).toBe(500);
		expect(report.financingCashFlow).toBe(500);
		expect(report.cashBefore).toBe(base.cash);
		expect(report.cashAfter).toBe(
			report.cashBefore + report.operatingCashFlow + report.financingCashFlow
		);
		expect(result.finance.transactions.at(-1)).toMatchObject({ day: 1, kind: 'disbursement' });
		expect(result.finance.currentDayActivity.day).toBe(2);
	});

	test('keeps imports, payroll, and scheduled finance service in one reconciled closing day', () => {
		expect.assertions(7);
		const base = createNewGame('convenience', 277_210);
		const loan = base.finance.loans[0]!;
		const game = {
			...base,
			day: 210,
			finance: {
				...base.finance,
				loans: [{ ...loan, nextPaymentDay: 210, lastInterestAccrualDay: 209 }]
			}
		};
		const result = simulateDay(game);
		const report = result.reports.at(-1)!;

		expect(report.importSpend).toBeGreaterThan(0);
		expect(report.payrollCost).toBeGreaterThan(0);
		expect(report.principalRepaid).toBeGreaterThan(0);
		expect(report.interestAccrued).toBeGreaterThan(0);
		expect(report.cashAfter).toBe(
			report.cashBefore + report.operatingCashFlow + report.financingCashFlow
		);
		expect(result.finance.transactions.every((transaction) => transaction.day === 210)).toBe(true);
		expect(result.finance.currentDayActivity.day).toBe(211);
	});

	test('keeps a deterministic 28-day finance snapshot for every archetype', () => {
		expect.assertions(ARCHETYPES.length * 2);
		const expectedSnapshots: Record<
			string,
			Array<{
				day: number;
				cashBefore: number;
				cashAfter: number;
				reserveWarning: boolean;
				cashPressureDecision: boolean;
				missedPaymentCount: number;
				arrears: number;
			}>
		> = {
			convenience: [
				{
					day: 8,
					cashBefore: 30_643,
					cashAfter: 29_967,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 15,
					cashBefore: 28_674,
					cashAfter: 27_981,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 22,
					cashBefore: 26_706,
					cashAfter: 26_024,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				}
			],
			boutique: [
				{
					day: 8,
					cashBefore: 37_507,
					cashAfter: 39_321,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 15,
					cashBefore: 37_261,
					cashAfter: 38_999,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 22,
					cashBefore: 37_015,
					cashAfter: 38_641,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				}
			],
			electronics: [
				{
					day: 8,
					cashBefore: 44_835,
					cashAfter: 46_789,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 15,
					cashBefore: 43_603,
					cashAfter: 45_463,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 22,
					cashBefore: 42_373,
					cashAfter: 44_091,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				}
			],
			grocery: [
				{
					day: 8,
					cashBefore: 40_350,
					cashAfter: 39_186,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 15,
					cashBefore: 37_582,
					cashAfter: 36_417,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 22,
					cashBefore: 34_817,
					cashAfter: 33_642,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				}
			]
		};

		for (const archetype of ARCHETYPES) {
			let game = createNewGame(archetype.id, 277_280);
			const scheduledDays: Array<{
				day: number;
				cashBefore: number;
				cashAfter: number;
				reserveWarning: boolean;
				cashPressureDecision: boolean;
				missedPaymentCount: number;
				arrears: number;
			}> = [];

			for (let day = 1; day <= 28; day += 1) {
				game = simulateDay(game);
				const report = game.reports.at(-1)!;
				if (report.principalRepaid > 0 || report.interestPaid > 0) {
					const loan = game.finance.loans[0]!;
					scheduledDays.push({
						day: report.day,
						cashBefore: report.cashBefore,
						cashAfter: report.cashAfter,
						reserveWarning: report.warnings.some((warning) => warning.code === 'cashReservesLow'),
						cashPressureDecision: game.decisions.some((decision) => decision.id.includes('cash')),
						missedPaymentCount: loan.missedPaymentCount,
						arrears: loan.overdueInterest + loan.overduePrincipal
					});
				}
			}

			expect(scheduledDays).toEqual(expectedSnapshots[archetype.id]);
			expect(game.reports).toHaveLength(28);
		}
	});

	test('assigned staff accrue xp each day while unassigned staff do not', () => {
		expect.assertions(3);
		const base = createNewGame('grocery', 20260615);
		const idle: StaffMember = {
			id: 'staff-idle',
			name: 'Idle Worker',
			role: 'general',
			monthlySalary: 2_800,
			skill: 60,
			morale: 65,
			assignedStoreId: null,
			hiredOnDay: 1,
			level: 1,
			xp: 0
		};
		const result = simulateDay({ ...base, staff: [...base.staff, idle] });
		const assigned = result.staff.filter((member) => member.assignedStoreId !== null);

		expect(assigned.length).toBeGreaterThan(0);
		expect(assigned.every((member) => member.xp > 0)).toBe(true);
		expect(result.staff.find((member) => member.id === 'staff-idle')?.xp).toBe(0);
	});

	test('xp accrual is capped at the next-level threshold', () => {
		expect.assertions(3);
		const base = createNewGame('grocery', 20260615);
		const assigned = base.staff.filter((member) => member.assignedStoreId !== null)[0]!;
		const cap = getStaffXpForLevel(assigned.level);
		const nearCap = { ...assigned, xp: cap - 1 };
		const game = {
			...base,
			staff: base.staff.map((member) => (member.id === nearCap.id ? nearCap : member))
		};
		const result = simulateDay(game);
		const updated = result.staff.find((member) => member.id === nearCap.id)!;

		expect(updated.xp).toBeGreaterThanOrEqual(nearCap.xp);
		expect(updated.xp).toBeLessThanOrEqual(cap);
		expect(updated.xp).not.toBeGreaterThan(cap);
	});

	test('includes an empty production report in the daily report', () => {
		expect.assertions(1);
		const result = simulateDay(createNewGame('convenience', 20260512));

		expect(result.reports[0]?.productionReport).toEqual({
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
			railUsage: {}
		});
	});

	test('charges production overflow cost for over-capacity warehouse stock', () => {
		expect.assertions(6);
		const startingCash = 50_000;
		const result = simulateDay({
			...createNewGame('convenience', 20260512),
			cash: startingCash,
			warehouse: {
				capacity: 0,
				materials: { snacks: 12 },
				overflowUnits: 12,
				overflowCost: 24
			}
		});
		const report = result.reports[0]!;
		const storeOperatingCosts = report.storeReports.reduce(
			(sum, storeReport) => sum + storeReport.operatingCosts,
			0
		);

		expect(report.productionReport.overflowUnits).toBe(12);
		expect(report.productionReport.overflowCost).toBe(24);
		expect(report.productionReport.operatingCost).toBe(0);
		expect(report.operatingCosts).toBe(
			storeOperatingCosts + report.payrollCost + report.productionReport.overflowCost
		);
		expect(report.netIncome).toBe(report.revenue - report.operatingCosts - report.importSpend);
		expect(report.cashAfter).toBe(startingCash + report.netIncome);
	});

	test('premium pricing improves gross margin but can reduce customers served', () => {
		expect.assertions(2);
		const base = createNewGame('boutique', 900);
		const standard = simulateDay(updatePolicy(base, { pricing: 'standard' }));
		const premium = simulateDay(updatePolicy(base, { pricing: 'premium' }));

		expect(premium.reports[0]?.grossMargin).toBeGreaterThan(standard.reports[0]?.grossMargin ?? 0);
		expect(premium.reports[0]?.storeReports[0]?.customersServed).toBeLessThanOrEqual(
			standard.reports[0]?.storeReports[0]?.customersServed ?? 0
		);
	});

	test('lean inventory can create stock warnings', () => {
		expect.assertions(1);
		const game = updatePolicy(createNewGame('grocery', 10), { inventory: 'lean' });
		const result = simulateDay({
			...game,
			stores: game.stores.map((store) => ({ ...store, stockHealth: 18 }))
		});

		expect(result.reports[0]?.warnings.some((warning) => warning.code === 'stockPressure')).toBe(
			true
		);
	});

	test('warnings use post-day store health', () => {
		expect.assertions(2);
		const game = updatePolicy(createNewGame('convenience', 41), {
			staffing: 'minimal',
			service: 'speed'
		});
		const result = simulateDay({
			...game,
			stores: game.stores.map((store) => ({
				...store,
				localDemand: 30,
				stockHealth: 80,
				staffCapacity: 100,
				staffMorale: 35,
				managerQuality: 0
			}))
		});
		const report = result.reports[0]?.storeReports[0];

		expect(report?.staffMorale).toBeLessThan(30);
		expect(report?.warnings.some((warning) => warning.code === 'nearStaffCapacity')).toBe(true);
	});

	test('resumes persisted rng state across sequential days', () => {
		expect.assertions(6);
		const initial = updatePolicy(createNewGame('electronics', 1234), {
			inventory: 'generous',
			marketing: 'promotions',
			pricing: 'competitive'
		});
		const uninterruptedDayOne = simulateDay(initial);
		const uninterruptedDayTwo = simulateDay(uninterruptedDayOne);
		const persistedDayOne = JSON.parse(JSON.stringify(uninterruptedDayOne)) as GameState;
		const resumedDayTwo = simulateDay(persistedDayOne);
		const staleRngDayTwo = simulateDay({
			...persistedDayOne,
			rngState: initial.rngState
		});

		expect(resumedDayTwo.day).toBe(uninterruptedDayTwo.day);
		expect(resumedDayTwo.rngState).toBe(uninterruptedDayTwo.rngState);
		expect(resumedDayTwo.cash).toBe(uninterruptedDayTwo.cash);
		expect(resumedDayTwo.reports[1]?.netIncome).toBe(uninterruptedDayTwo.reports[1]?.netIncome);
		expect(resumedDayTwo.reports[1]?.storeReports).toEqual(
			uninterruptedDayTwo.reports[1]?.storeReports
		);
		expect(staleRngDayTwo.reports[1]?.storeReports).not.toEqual(
			uninterruptedDayTwo.reports[1]?.storeReports
		);
	});

	test('removes expired decisions after a simulated day', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 55);
		const expiredDecision: DecisionItem = {
			id: 'expired',
			title: 'Expired',
			context: decisionContextLocationGeneric(),
			expiresOnDay: game.day,
			options: []
		};

		const result = simulateDay({ ...game, decisions: [expiredDecision] });

		expect(result.decisions.some((decision) => decision.id === expiredDecision.id)).toBe(false);
	});

	test('preserves non-expired existing decisions after a simulated day', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 56);
		const activeDecision: DecisionItem = {
			id: 'active',
			title: 'Active',
			context: decisionContextLocationGeneric(),
			expiresOnDay: game.day + 2,
			options: []
		};

		const result = simulateDay({ ...game, decisions: [activeDecision] });

		expect(result.decisions.some((decision) => decision.id === activeDecision.id)).toBe(true);
	});

	test('generates decisions from the returned post-day rng state', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 1);
		const activeDecision: DecisionItem = {
			id: 'active',
			title: 'Active',
			context: decisionContextLocationGeneric(),
			expiresOnDay: game.day + 2,
			options: []
		};
		const result = simulateDay({ ...game, decisions: [activeDecision] });
		const preservedDecisions = result.decisions.filter(
			(decision) => decision.id === activeDecision.id
		);
		const generatedDecisions = result.decisions.filter(
			(decision) => !preservedDecisions.some((preserved) => preserved.id === decision.id)
		);

		expect(generatedDecisions).toEqual(
			generateDecisions({
				...result,
				decisions: preservedDecisions
			})
		);
	});

	test('refreshes the hiring market each week with staffed role coverage', () => {
		expect.assertions(5);
		const game = createNewGame('convenience', 94);
		const staleCandidateIds = game.hiringCandidates.map((candidate) => candidate.id);
		const refreshed = simulateDay({
			...game,
			day: 7,
			hiringCandidates: []
		});
		const preserved = simulateDay({ ...game, day: 6 });

		expect(refreshed.day).toBe(8);
		expect(refreshed.hiringCandidates).toHaveLength(5);
		expect(refreshed.hiringCandidates.map((candidate) => candidate.id)).toEqual([
			'candidate-8-1',
			'candidate-8-2',
			'candidate-8-3',
			'candidate-8-4',
			'candidate-8-5'
		]);
		expect(refreshed.hiringCandidates.map((candidate) => candidate.role)).toEqual([
			'manager',
			'general',
			'general',
			'manager',
			'general'
		]);
		expect(preserved.hiringCandidates.map((candidate) => candidate.id)).toEqual(staleCandidateIds);
	});

	test('charges monthly payroll on payroll days only', () => {
		expect.assertions(8);
		const startingCash = 50_000;
		const baseGame = {
			...createNewGame('convenience', 90),
			cash: startingCash,
			reports: []
		};
		const payroll = baseGame.staff.reduce((sum, member) => sum + member.monthlySalary, 0);
		const payrollDay = simulateDay({ ...baseGame, day: 30 });
		const nonPayrollDay = simulateDay({ ...baseGame, day: 29 });
		const payrollReport = payrollDay.reports[0]!;
		const storeOperatingCosts = payrollReport.storeReports.reduce(
			(sum, report) => sum + report.operatingCosts,
			0
		);

		expect(payrollReport.payrollCost).toBe(payroll);
		expect(nonPayrollDay.reports[0]?.payrollCost).toBe(0);
		expect(payrollDay.cash).toBeLessThan(nonPayrollDay.cash);
		expect(payrollReport.operatingCosts).toBeGreaterThan(
			nonPayrollDay.reports[0]?.operatingCosts ?? 0
		);
		expect(payroll).toBeGreaterThan(0);
		expect(payrollReport.operatingCosts).toBe(storeOperatingCosts + payrollReport.payrollCost);
		expect(payrollReport.netIncome).toBe(
			payrollReport.revenue - payrollReport.operatingCosts - payrollReport.importSpend
		);
		expect(payrollReport.cashAfter).toBe(startingCash + payrollReport.netIncome);
	});

	test('records product reports and aggregates store report totals', () => {
		expect.assertions(8);
		const game = createNewGame('convenience', 20260508);
		const result = simulateDay(game);
		const report = result.reports[0]!.storeReports[0]!;
		const productTotals = report.productReports.reduce(
			(totals, product) => ({
				revenue: totals.revenue + product.revenue,
				costOfGoods: totals.costOfGoods + product.costOfGoods,
				importSpend: totals.importSpend + product.importSpend,
				unitsSold: totals.unitsSold + product.unitsSold,
				demandMissed: totals.demandMissed + product.demandMissed
			}),
			{ revenue: 0, costOfGoods: 0, importSpend: 0, unitsSold: 0, demandMissed: 0 }
		);

		expect(report.productReports).toHaveLength(game.stores[0]!.products.length);
		expect(report.revenue).toBe(productTotals.revenue);
		expect(report.costOfGoods).toBe(productTotals.costOfGoods);
		expect(report.importSpend).toBe(productTotals.importSpend);
		expect(report.customersServed).toBe(productTotals.unitsSold);
		expect(report.demandMissed).toBe(productTotals.demandMissed);
		expect(result.stores[0]!.products[0]!.stock).toBeLessThanOrEqual(
			game.stores[0]!.products[0]!.stock
		);
		expect(report.stockHealth).toBe(result.stores[0]!.stockHealth);
	});

	test('inventory posture changes daily product sales capacity', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260508);
		const stores = game.stores.map((store) => ({
			...store,
			products: store.products.map((product) => ({
				...product,
				stock: 500,
				targetStock: 500
			})),
			stockHealth: 100,
			staffCapacity: 80,
			staffMorale: 90
		}));
		const lean = simulateDay(updatePolicy({ ...game, stores }, { inventory: 'lean' }));
		const generous = simulateDay(updatePolicy({ ...game, stores }, { inventory: 'generous' }));
		const leanReport = lean.reports[0]!.storeReports[0]!;
		const generousReport = generous.reports[0]!.storeReports[0]!;

		expect(generousReport.customersServed).toBeGreaterThan(leanReport.customersServed);
		expect(generousReport.reputation).toBeGreaterThanOrEqual(leanReport.reputation);
		expect(generousReport.revenue).toBeGreaterThan(leanReport.revenue);
	});

	test('simulates product demand for stores in every city', () => {
		expect.assertions(6);
		const game = createNewGame('convenience', 20260508);
		const secondCity = generateCity({
			id: 'second-city',
			name: 'Second City',
			width: 20,
			height: 20,
			seed: 20260509
		});
		const firstStore = {
			...game.stores[0]!,
			products: game.stores[0]!.products.map((product) => ({
				...product,
				stock: 500,
				targetStock: 500
			})),
			stockHealth: 100,
			staffCapacity: 140,
			staffMorale: 90
		};
		const secondTile = secondCity.tiles.find((tile) => !tile.locked && tile.feature === null)!;
		const secondStore = {
			...firstStore,
			id: 'store-2',
			name: 'Second City Store',
			cityId: secondCity.id,
			tileId: secondTile.id,
			mapX: secondTile.x,
			mapY: secondTile.y,
			location: { neighborhoodId: 'downtown' as const, x: 0, y: 0 }
		};
		const result = simulateDay({
			...game,
			cities: [...game.cities, secondCity],
			activeCityId: game.cities[0]!.id,
			stores: [firstStore, secondStore]
		});
		const firstReport = result.reports[0]!.storeReports.find(
			(report) => report.storeId === firstStore.id
		)!;
		const secondReport = result.reports[0]!.storeReports.find(
			(report) => report.storeId === secondStore.id
		)!;

		expect(firstReport.productReports.some((report) => report.unitsSold > 0)).toBe(true);
		expect(secondReport.productReports.some((report) => report.unitsSold > 0)).toBe(true);
		expect(firstReport.customersServed).toBeGreaterThan(0);
		expect(secondReport.customersServed).toBeGreaterThan(0);
		expect(firstReport.revenue).toBeGreaterThan(0);
		expect(secondReport.revenue).toBeGreaterThan(0);
	});

	test('weekly imports subtract cash even when cash goes negative', () => {
		expect.assertions(5);
		const game = {
			...createNewGame('convenience', 20260508),
			day: 7,
			cash: 10
		};
		const store = {
			...game.stores[0]!,
			products: game.stores[0]!.products.map((product) => ({
				...product,
				stock: 0,
				reorderThreshold: 5,
				targetStock: 20
			}))
		};
		const result = simulateDay({ ...game, stores: [store] });
		const report = result.reports[0]!;

		expect(report.importSpend).toBeGreaterThan(10);
		expect(result.cash).toBeLessThan(0);
		expect(result.stores[0]!.products.every((product) => product.stock >= 20)).toBe(true);
		expect(
			report.storeReports[0]?.productReports.some((product) => product.importedUnits > 0)
		).toBe(true);
		expect(report.cashAfter).toBe(result.cash);
	});

	test('runs industry production before weekly shop refill', () => {
		expect.assertions(4);
		const baseGame = {
			...createNewGame('convenience', 20260508),
			day: 7,
			cash: 50_000
		};
		const store = {
			...baseGame.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 0,
					reorderThreshold: 5,
					targetStock: 20,
					sellingPrice: 5
				}
			]
		};
		const noWarehouse = simulateDay({
			...baseGame,
			stores: [store],
			warehouse: { capacity: 200, materials: {}, overflowUnits: 0, overflowCost: 0 }
		});
		const withWarehouse = simulateDay({
			...baseGame,
			stores: [store],
			warehouse: { capacity: 200, materials: { snacks: 12 }, overflowUnits: 0, overflowCost: 0 }
		});
		const warehouseReport = withWarehouse.reports[0]!.storeReports[0]!.productReports[0]!;

		expect(noWarehouse.reports[0]!.storeReports[0]!.productReports[0]!.importedUnits).toBe(20);
		expect(warehouseReport.warehouseUnits).toBe(12);
		expect(warehouseReport.importedUnits).toBe(8);
		expect(withWarehouse.reports[0]!.importSpend).toBeLessThan(noWarehouse.reports[0]!.importSpend);
	});

	test('without a rail link, same-day production stays in the factory buffer and the weekly refill fully imports', () => {
		expect.assertions(13);
		const startingCash = 50_000;
		let game = {
			...createNewGame('convenience', 20260508),
			day: 7,
			cash: 100_000
		};
		const industrialTiles = game.industryCities[0]!.tiles.filter(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		);
		game = buildIndustrialBuilding(game, {
			tileId: industrialTiles[0]!.id,
			buildingTypeId: 'snack-factory'
		});
		game = buildIndustrialBuilding(game, {
			tileId: industrialTiles[1]!.id,
			buildingTypeId: 'warehouse'
		});
		const store = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 0,
					reorderThreshold: 5,
					targetStock: 20,
					sellingPrice: 5
				}
			]
		};
		const result = simulateDay({
			...game,
			cash: startingCash,
			stores: [store],
			warehouse: {
				capacity: 200,
				materials: {},
				overflowUnits: 0,
				overflowCost: 0
			}
		});
		const dailyReport = result.reports[0]!;
		const productReport = dailyReport.storeReports[0]!.productReports[0]!;
		const storeOperatingCosts = dailyReport.storeReports.reduce(
			(total, report) => total + report.operatingCosts,
			0
		);
		const storeImportSpend = dailyReport.storeReports.reduce(
			(total, report) => total + report.importSpend,
			0
		);

		// The snack factory still produces same-day (into its own buffer), but
		// with no rail connecting it to the warehouse building, that output
		// never reaches the shared warehouse pool — the store's weekly refill
		// finds nothing there and imports the full target stock instead.
		expect(dailyReport.productionReport.produced).toContainEqual({
			materialId: 'snacks',
			quantity: 8,
			value: 64,
			source: 'local'
		});
		expect(dailyReport.productionReport.warehousePulls).toHaveLength(0);
		expect(productReport.warehouseUnits).toBe(0);
		expect(productReport.importedUnits).toBe(20);
		expect(productReport.importSpend).toBe(60);
		expect(result.stores[0]!.products[0]!.stock).toBe(20);
		expect(result.warehouse.materials.snacks).toBe(0);
		expect(dailyReport.productionReport.operatingCost).toBeGreaterThan(0);
		expect(dailyReport.productionReport.importSpend).toBeGreaterThan(0);
		expect(dailyReport.operatingCosts).toBe(
			storeOperatingCosts +
				dailyReport.payrollCost +
				dailyReport.productionReport.operatingCost +
				dailyReport.productionReport.overflowCost
		);
		expect(dailyReport.importSpend).toBe(
			storeImportSpend + dailyReport.productionReport.importSpend
		);
		expect(dailyReport.netIncome).toBe(
			dailyReport.revenue - dailyReport.operatingCosts - dailyReport.importSpend
		);
		expect(dailyReport.cashAfter).toBe(startingCash + dailyReport.netIncome);
	});

	test('understaffing reduces served demand and reports role shortages', () => {
		expect.assertions(4);
		const baseGame = updatePolicy(createNewGame('grocery', 91), {
			pricing: 'discount',
			inventory: 'generous',
			marketing: 'promotions'
		});
		const stores = baseGame.stores.map((store) => ({
			...store,
			localDemand: 220,
			stockHealth: 100,
			staffCapacity: 100,
			staffMorale: 85
		}));
		const staffed = simulateDay({
			...baseGame,
			stores,
			staff: baseGame.staff.map((member) => ({ ...member, skill: 88, morale: 82 }))
		});
		const understaffed = simulateDay({
			...baseGame,
			stores,
			staff: baseGame.staff
				.filter((member) => member.role === 'manager')
				.map((member) => ({ ...member, skill: 88, morale: 82 }))
		});
		const staffedReport = staffed.reports[0]?.storeReports[0];
		const understaffedReport = understaffed.reports[0]?.storeReports[0];

		expect(understaffedReport?.customersServed).toBeLessThan(staffedReport?.customersServed ?? 0);
		expect(understaffedReport?.staffingCoverage).toBeLessThan(100);
		expect(understaffedReport?.staffingShortage).toEqual({ manager: 0, general: 3 });
		expect(understaffedReport?.warnings).toContainEqual({
			code: 'shortGeneral',
			storeId: 'store-1',
			count: 3
		});
	});

	test('handles product categories not in starting categories', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260508);
		const store = game.stores[0]!;
		const storeWithExtraProduct = {
			...store,
			products: [
				...store.products,
				{
					categoryId: 'unknown-category',
					stock: 10,
					reorderThreshold: 5,
					targetStock: 20,
					sellingPrice: 5
				}
			]
		};
		const result = simulateDay({ ...game, stores: [storeWithExtraProduct] });
		const productReport = result.reports[0]!.storeReports[0]!.productReports.find(
			(report) => report.categoryId === 'unknown-category'
		);

		expect(productReport).toBeDefined();
		expect(productReport?.name).toBe('unknown-category');
	});

	test('reports reputation warning when store reputation falls below threshold', () => {
		expect.assertions(1);
		const game = updatePolicy(createNewGame('convenience', 41), {
			staffing: 'minimal',
			service: 'speed'
		});
		const result = simulateDay({
			...game,
			stores: game.stores.map((store) => ({
				...store,
				localDemand: 30,
				stockHealth: 80,
				staffCapacity: 100,
				staffMorale: 35,
				managerQuality: 0,
				reputation: 30
			}))
		});

		expect(result.reports[0]?.storeReports[0]?.warnings).toContainEqual({
			code: 'reputationSlipping',
			storeId: 'store-1'
		});
	});

	test('uses fallback averages when no store reports exist', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 1);
		const result = simulateDay({
			...game,
			stores: []
		});

		expect(result.scorecard).toEqual({
			profit: expect.any(Number),
			customerSatisfaction: expect.any(Number),
			staffMorale: expect.any(Number),
			marketPosition: expect.any(Number)
		});
	});

	test('assigns zero utilization when a store has zero staff capacity', () => {
		expect.assertions(1);
		const base = createNewGame('grocery', 20260615);
		const store = {
			...base.stores[0]!,
			staffCapacity: 0,
			products: base.stores[0]!.products.map((p) => ({
				...p,
				stock: 500,
				targetStock: 500
			}))
		};
		const result = simulateDay({ ...base, stores: [store] });
		const report = result.reports[0]!.storeReports[0]!;

		expect(report.customersServed).toBe(0);
	});

	test('does not accrue xp for staff already at the level cap', () => {
		expect.assertions(2);
		const base = createNewGame('grocery', 20260615);
		const assigned = base.staff.filter((member) => member.assignedStoreId !== null)[0]!;
		const cap = getStaffXpForLevel(assigned.level);
		const maxedOut = { ...assigned, xp: cap };
		const game = {
			...base,
			staff: base.staff.map((member) => (member.id === maxedOut.id ? maxedOut : member))
		};
		const result = simulateDay(game);
		const updated = result.staff.find((member) => member.id === maxedOut.id)!;

		expect(updated.xp).toBe(cap);
		expect(updated).toEqual(maxedOut);
	});

	test('uses zero demand-missed rate when stores have no customers or missed demand', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260508);
		const storeWithNoProducts = {
			...game.stores[0]!,
			products: []
		};
		const result = simulateDay({ ...game, stores: [storeWithNoProducts] });
		const report = result.reports[0]!.storeReports[0]!;

		expect(report.customersServed).toBe(0);
		expect(report.demandMissed).toBe(0);
	});

	test('creates default product reports for stores with no sales or import reports', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260508);
		const store = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'unknown-category',
					stock: 100,
					reorderThreshold: 5,
					targetStock: 100,
					sellingPrice: 5
				}
			]
		};
		const result = simulateDay({ ...game, stores: [store] });
		const productReport = result.reports[0]!.storeReports[0]!.productReports.find(
			(report) => report.categoryId === 'unknown-category'
		);

		expect(productReport).toBeDefined();
		expect(productReport?.unitsSold).toBe(0);
		expect(productReport?.name).toBe('unknown-category');
	});

	test('omits shop imports for non-finished-material categories from the production report', () => {
		expect.assertions(2);
		const game = {
			...createNewGame('boutique', 20260508),
			day: 7,
			cash: 100_000
		};
		const store = {
			...game.stores[0]!,
			products: [
				{ categoryId: 'apparel', stock: 0, reorderThreshold: 5, targetStock: 20, sellingPrice: 38 }
			]
		};
		const result = simulateDay({ ...game, stores: [store] });
		const productionReport = result.reports[0]!.productionReport;

		expect(productionReport.shopImports).toEqual([]);
		expect(result.reports[0]!.storeReports[0]!.productReports[0]!.importedUnits).toBeGreaterThan(0);
	});
});
