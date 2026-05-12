import { describe, expect, test } from 'vitest';
import { generateDecisions } from './events';
import { generateCity } from './city';
import { createNewGame, updatePolicy } from './state';
import { simulateDay } from './simulateDay';
import type { DecisionItem, GameState } from './types';

describe('daily simulation', () => {
	test('advances one day deterministically for the same seed and actions', () => {
		expect.assertions(4);
		const first = simulateDay(createNewGame('convenience', 2026));
		const second = simulateDay(createNewGame('convenience', 2026));

		expect(first.day).toBe(2);
		expect(first.cash).toBe(second.cash);
		expect(first.reports[0]?.netIncome).toBe(second.reports[0]?.netIncome);
		expect(first.rngState).toBe(second.rngState);
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
			warehouseUsed: 0
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

		expect(result.reports[0]?.warnings.some((warning) => warning.includes('stock'))).toBe(true);
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
		expect(report?.warnings.some((warning) => warning.includes('staff'))).toBe(true);
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
			context: 'No longer relevant.',
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
			context: 'Still relevant.',
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
			context: 'Still relevant.',
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
			staffCapacity: 140,
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
			location: 'Second City'
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

	test('understaffing reduces served demand and reports role shortages', () => {
		expect.assertions(6);
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
		expect(understaffedReport?.warnings).toContain('Grocery Market is short 3 general staff');
		expect(understaffedReport?.staffMorale).toBeLessThan(staffedReport?.staffMorale ?? 0);
		expect(staffedReport?.staffingCoverage).toBe(100);
	});
});
