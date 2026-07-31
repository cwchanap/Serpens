import { getArchetype } from './archetypes';
import { generateDecisions, pruneExpiredDecisions } from './events';
import {
	compareLoanById,
	estimateNextLoanPayment,
	getTotalDebt,
	isOutstandingLoan,
	resetFinanceDayActivity,
	serviceFinanceForDay
} from './finance';
import { simulateIndustryProduction } from './industryProduction';
import { clampScore } from './reports';
import { createRngFromState, randomBetween } from './rng';
import { DEFAULT_SIMULATION_RULES, type SimulationRules } from './simulationRules';
import {
	calculateMonthlyPayroll,
	generateHiringCandidates,
	HIRING_CANDIDATE_COUNT,
	isPayrollDay,
	shouldRefreshHiringMarket,
	summarizeStoreStaffing
} from './staffing';
import { getStaffDailyXp, getStaffXpForLevel, MAX_STAFF_LEVEL } from './staffLeveling';
import {
	applyWeeklyImports,
	calculateStockHealth,
	getFinishedMaterialIdForCategory,
	isImportDay,
	simulateProductSalesForCity
} from './stock';
import { refreshWorldProgress } from './world';
import type {
	DailyMaterialMovement,
	DailyProductReport,
	DailyProductionReport,
	DailyReport,
	DailyReportWarning,
	DailyStoreReport,
	GameState,
	Scorecard,
	StaffingRequirement,
	Store,
	StoreReportWarning
} from './types';

const PRICING = {
	discount: { price: 0.88, demand: 1.18, margin: -0.04, satisfaction: 2 },
	competitive: { price: 0.96, demand: 1.08, margin: -0.01, satisfaction: 1 },
	standard: { price: 1, demand: 1, margin: 0, satisfaction: 0 },
	premium: { price: 1.24, demand: 0.82, margin: 0.09, satisfaction: -3 }
} as const;

const INVENTORY = {
	lean: { capacity: 0.78, cost: 0.86, recovery: 3, stockStress: 1.24, satisfaction: -3 },
	balanced: { capacity: 1, cost: 1, recovery: 7, stockStress: 1, satisfaction: 0 },
	generous: { capacity: 1.18, cost: 1.12, recovery: 11, stockStress: 0.82, satisfaction: 2 }
} as const;

const STAFFING = {
	minimal: { capacity: 0.78, morale: -4, satisfaction: -4 },
	efficient: { capacity: 1, morale: 0, satisfaction: 0 },
	service: { capacity: 1.18, morale: 3, satisfaction: 4 }
} as const;

const MARKETING = {
	none: { demand: 0.92, cost: 0, reputation: -1, market: -1 },
	awareness: { demand: 1.06, cost: 80, reputation: 1, market: 2 },
	promotions: { demand: 1.16, cost: 130, reputation: 0, market: 3 },
	loyalty: { demand: 1.08, cost: 105, reputation: 2, market: 2 }
} as const;

const SERVICE = {
	speed: { throughput: 1.12, satisfaction: -1, morale: -1 },
	balanced: { throughput: 1, satisfaction: 0, morale: 0 },
	highTouch: { throughput: 0.9, satisfaction: 4, morale: 1 }
} as const;

type SummedStoreReportKey = 'revenue' | 'costOfGoods' | 'operatingCosts' | 'importSpend';

interface StoreOperationProfile {
	store: Store;
	staffLimit: number;
	salesCapacity: number;
	staffingCoverage: number;
	staffingShortage: StaffingRequirement;
	staffMorale: number;
	reputation: number;
	marketPosition: number;
	operatingCosts: number;
	startingStockHealth: number;
	stockPressureThreshold: number;
}

export function simulateDay(
	game: GameState,
	rules: SimulationRules = DEFAULT_SIMULATION_RULES
): GameState {
	const closingDay = game.day;
	const cashBefore = game.cash - game.finance.currentDayActivity.financingCashFlow;
	const industryResult = simulateIndustryProduction(game, rules);
	const productionGame = industryResult.game;
	const rng = createRngFromState(productionGame.rngState);
	const profiles = productionGame.stores.map((store) =>
		buildStoreOperationProfile(store, productionGame, rng)
	);
	const profileByStoreId = new Map(profiles.map((profile) => [profile.store.id, profile]));
	const storeCapacity = new Map(
		profiles.map((profile) => [profile.store.id, profile.salesCapacity])
	);
	const pricedSalesGame = {
		...productionGame,
		stores: applyPolicyPricingToStores(
			productionGame.stores,
			PRICING[productionGame.policy.pricing].price
		)
	};
	const storeCityIds = new Set(productionGame.stores.map((store) => store.cityId));
	const citySales = productionGame.cities
		.filter((city) => storeCityIds.has(city.id))
		.reduce(
			(result, city) => {
				const sales = simulateProductSalesForCity({
					game: { ...pricedSalesGame, stores: result.stores },
					city,
					rng,
					storeCapacity
				});

				return {
					stores: sales.stores,
					productReports: mergeProductReportMaps(result.productReports, sales.productReports)
				};
			},
			{ stores: pricedSalesGame.stores, productReports: new Map<string, DailyProductReport[]>() }
		);
	const stockGame = {
		...productionGame,
		stores: restoreProductSettings(citySales.stores, productionGame.stores)
	};
	const importResult = isImportDay(productionGame.day)
		? applyWeeklyImports({ game: stockGame, storeReports: citySales.productReports, rules })
		: {
				stores: stockGame.stores,
				productReports: citySales.productReports,
				warehouse: stockGame.warehouse,
				importSpend: 0
			};
	const storeResults = importResult.stores.map((store) =>
		buildDailyStoreReport(
			{ ...profileByStoreId.get(store.id)!, store },
			getStoreProductReports(store, importResult.productReports)
		)
	);
	const storeReports = storeResults.map((result) => result.report);
	const staffWithXp = accrueStaffXp(productionGame.staff, storeReports, profileByStoreId);
	const nextDay = closingDay + 1;
	const revenue = sum(storeReports, 'revenue');
	const costOfGoods = sum(storeReports, 'costOfGoods');
	const grossMargin = revenue - costOfGoods;
	const payrollCost = isPayrollDay(productionGame.day)
		? calculateMonthlyPayroll(productionGame.staff)
		: 0;
	const productionReport = mergeProductionRefillReport(
		industryResult.report,
		importResult.productReports
	);
	const operatingCosts =
		sum(storeReports, 'operatingCosts') +
		payrollCost +
		productionReport.operatingCost +
		productionReport.overflowCost;
	const importSpend = sum(storeReports, 'importSpend') + productionReport.importSpend;
	const operatingIncome = Math.round(grossMargin - operatingCosts);
	const operatingCashFlow = Math.round(revenue - operatingCosts - importSpend);
	const scorecard = buildScorecard(game.scorecard, storeReports, operatingCashFlow);
	const hiringCandidates = shouldRefreshHiringMarket(nextDay)
		? generateHiringCandidates({ count: HIRING_CANDIDATE_COUNT, day: nextDay, rng })
		: productionGame.hiringCandidates;
	const afterOperations = {
		...productionGame,
		rngState: rng.getState(),
		cash: game.cash + operatingCashFlow,
		scorecard,
		stores: storeResults.map((result) => result.store),
		warehouse: importResult.warehouse,
		hiringCandidates,
		staff: staffWithXp
	};
	const serviced = serviceFinanceForDay({
		finance: afterOperations.finance,
		cash: afterOperations.cash,
		day: closingDay
	});
	const financingCashFlow = serviced.finance.currentDayActivity.financingCashFlow;
	const netCashChange = operatingCashFlow + financingCashFlow;
	const cashAfter = serviced.cash;

	if (cashAfter !== cashBefore + netCashChange) {
		throw new Error('Daily cash reconciliation failed');
	}

	const postServiceGame = {
		...afterOperations,
		cash: cashAfter,
		finance: serviced.finance
	};
	const warnings = collectWarnings(storeReports, cashAfter);
	const nextLoanPayment = getNextLoanPaymentSnapshot(postServiceGame);
	const activity = serviced.finance.currentDayActivity;
	const report: DailyReport = {
		day: closingDay,
		revenue: Math.round(revenue),
		costOfGoods: Math.round(costOfGoods),
		grossMargin: Math.round(grossMargin),
		operatingCosts: Math.round(operatingCosts),
		payrollCost,
		importSpend: Math.round(importSpend),
		cashBefore,
		operatingIncome,
		operatingCashFlow,
		interestAccrued: serviced.interestAccruedThisDayMicros / 1_000_000,
		interestPaid: activity.interestPaid,
		interestCapitalized: activity.interestCapitalized,
		principalBorrowed: activity.principalBorrowed,
		principalRepaid: activity.principalRepaid,
		refinancedPrincipal: activity.refinancedPrincipal,
		financingCashFlow,
		netCashChange,
		netIncome: operatingCashFlow,
		cashAfter,
		outstandingPrincipalAfter: getTotalDebt(postServiceGame),
		nextLoanPayment,
		scorecard,
		productionReport,
		storeReports,
		warnings
	};
	const postDayGame = {
		...postServiceGame,
		day: nextDay,
		finance: resetFinanceDayActivity(serviced.finance, nextDay),
		reports: [...game.reports, report]
	};
	const preservedDecisions = pruneExpiredDecisions(postDayGame);

	return refreshWorldProgress({
		...postDayGame,
		decisions: [
			...preservedDecisions,
			...generateDecisions({
				...postDayGame,
				decisions: preservedDecisions,
				stores: storeResults.map((result) => result.store)
			})
		]
	});
}

function getNextLoanPaymentSnapshot(
	game: Pick<GameState, 'finance'>
): DailyReport['nextLoanPayment'] {
	return (
		game.finance.loans
			.filter((loan) => isOutstandingLoan(loan) && loan.nextPaymentDay !== null)
			.sort(
				(left, right) =>
					left.nextPaymentDay! - right.nextPaymentDay! ||
					left.openedOnDay - right.openedOnDay ||
					compareLoanById(left, right)
			)
			.map((loan) => ({
				loanId: loan.id,
				day: loan.nextPaymentDay!,
				amount: estimateNextLoanPayment(loan)
			}))[0] ?? null
	);
}

function buildStoreOperationProfile(
	store: Store,
	game: GameState,
	rng: ReturnType<typeof createRngFromState>
): StoreOperationProfile {
	const staffing = STAFFING[game.policy.staffing];
	const inventory = INVENTORY[game.policy.inventory];
	const marketing = MARKETING[game.policy.marketing];
	const service = SERVICE[game.policy.service];
	const staffingSummary = summarizeStoreStaffing(game, store);
	const staffingCoverageRatio = Math.max(0.22, staffingSummary.coverage / 100);
	const skillMultiplier = 0.82 + staffingSummary.averageSkill / 250;
	const moraleMultiplier = 0.82 + staffingSummary.averageMorale / 260;
	const staffLimit =
		store.staffCapacity *
		staffing.capacity *
		service.throughput *
		(0.72 + store.staffMorale / 220) *
		staffingCoverageRatio *
		skillMultiplier *
		moraleMultiplier *
		randomBetween(rng, 0.96, 1.04);
	const managerPenalty = staffingSummary.shortage.manager > 0 ? 5 : 0;
	const generalPenalty = staffingSummary.shortage.general * 2;
	const assignedMoraleDelta = (staffingSummary.averageMorale - 60) / 18;
	const staffMorale = clampScore(
		store.staffMorale +
			staffing.morale +
			service.morale +
			store.managerQuality / 40 -
			managerPenalty -
			generalPenalty +
			assignedMoraleDelta -
			3 -
			(staffLimit <= store.staffCapacity * 0.45 ? 2 : 0)
	);
	const reputation = clampScore(
		store.reputation +
			inventory.satisfaction +
			staffing.satisfaction +
			service.satisfaction +
			marketing.reputation -
			managerPenalty +
			(staffingSummary.coverage < 80 ? -2 : 1)
	);
	const marketPosition = clampScore(
		35 + store.localDemand / 5 + reputation / 3 - store.competition / 4 + marketing.market
	);
	const operatingCosts = Math.round(
		getArchetype(store.archetypeId).baseRent * (0.92 + store.competition / 450) + marketing.cost
	);

	return {
		store,
		staffLimit: Math.max(0, Math.floor(staffLimit)),
		salesCapacity: Math.max(0, Math.floor(staffLimit * inventory.capacity)),
		staffingCoverage: staffingSummary.coverage,
		staffingShortage: staffingSummary.shortage,
		staffMorale,
		reputation,
		marketPosition,
		operatingCosts,
		startingStockHealth: store.stockHealth,
		stockPressureThreshold: 25 * inventory.stockStress
	};
}

function accrueStaffXp(
	staff: GameState['staff'],
	storeReports: DailyStoreReport[],
	profileByStoreId: Map<string, StoreOperationProfile>
): GameState['staff'] {
	const utilizationByStoreId = new Map<string, number>();
	for (const report of storeReports) {
		const staffLimit = profileByStoreId.get(report.storeId)?.staffLimit ?? 0;
		const utilization = staffLimit > 0 ? report.customersServed / staffLimit : 0;
		utilizationByStoreId.set(report.storeId, utilization);
	}

	let changed = false;
	const next = staff.map((member) => {
		if (member.assignedStoreId === null || member.level >= MAX_STAFF_LEVEL) {
			return member;
		}
		const utilization = utilizationByStoreId.get(member.assignedStoreId);
		if (utilization === undefined) {
			return member;
		}
		const cap = getStaffXpForLevel(member.level);
		if (member.xp >= cap) {
			return member;
		}
		changed = true;
		return { ...member, xp: Math.min(cap, member.xp + getStaffDailyXp(utilization)) };
	});

	return changed ? next : staff;
}

function buildDailyStoreReport(
	profile: StoreOperationProfile,
	productReports: DailyProductReport[]
): { store: Store; report: DailyStoreReport } {
	const revenue = productReports.reduce((total, report) => total + report.revenue, 0);
	const costOfGoods = productReports.reduce((total, report) => total + report.costOfGoods, 0);
	const importSpend = productReports.reduce((total, report) => total + report.importSpend, 0);
	const customersServed = productReports.reduce((total, report) => total + report.unitsSold, 0);
	const demandMissed = productReports.reduce((total, report) => total + report.demandMissed, 0);
	const stockHealth = calculateStockHealth(profile.store.products);
	const grossMargin = revenue - costOfGoods;
	const operatingCosts = profile.operatingCosts;
	const updatedStore = {
		...profile.store,
		daysOpen: profile.store.daysOpen + 1,
		stockHealth,
		staffMorale: profile.staffMorale,
		reputation: profile.reputation
	};
	const warnings = buildStoreWarnings(
		updatedStore,
		productReports,
		profile.startingStockHealth,
		profile.stockPressureThreshold,
		profile.staffLimit,
		profile.staffingShortage,
		profile.reputation
	);

	return {
		store: updatedStore,
		report: {
			storeId: profile.store.id,
			revenue,
			costOfGoods,
			grossMargin,
			operatingCosts,
			importSpend,
			netIncome: revenue - operatingCosts - importSpend,
			customersServed,
			demandMissed,
			staffingCoverage: Math.round(profile.staffingCoverage),
			staffingShortage: profile.staffingShortage,
			stockHealth,
			staffMorale: profile.staffMorale,
			reputation: profile.reputation,
			marketPosition: profile.marketPosition,
			productReports,
			warnings
		}
	};
}

function buildStoreWarnings(
	store: Store,
	productReports: DailyProductReport[],
	startingStockHealth: number,
	stockPressureThreshold: number,
	staffLimit: number,
	staffingShortage: StaffingRequirement,
	reputation: number
): StoreReportWarning[] {
	const warnings: StoreReportWarning[] = [];
	const customersServed = productReports.reduce((total, report) => total + report.unitsSold, 0);
	const demandMissed = productReports.reduce((total, report) => total + report.demandMissed, 0);

	if (
		store.stockHealth < stockPressureThreshold ||
		startingStockHealth < stockPressureThreshold ||
		productReports.some((report) => report.endingStock === 0)
	) {
		warnings.push({ code: 'stockPressure', storeId: store.id });
	}

	if (store.staffMorale < 30 || staffLimit <= customersServed + 1) {
		warnings.push({ code: 'nearStaffCapacity', storeId: store.id });
	}

	if (staffingShortage.manager > 0) {
		warnings.push({ code: 'shortManager', storeId: store.id, count: staffingShortage.manager });
	}

	if (staffingShortage.general > 0) {
		warnings.push({ code: 'shortGeneral', storeId: store.id, count: staffingShortage.general });
	}

	if (demandMissed > customersServed * 0.2) {
		warnings.push({ code: 'missedProductDemand', storeId: store.id });
	}

	if (reputation < 35) {
		warnings.push({ code: 'reputationSlipping', storeId: store.id });
	}

	return warnings;
}

function buildScorecard(
	current: Scorecard,
	storeReports: DailyStoreReport[],
	netIncome: number
): Scorecard {
	const averageStore = averageStoreHealth(storeReports);

	return {
		profit: clampScore(current.profit * 0.7 + (netIncome > 0 ? 68 : 42) * 0.3 + netIncome / 450),
		customerSatisfaction: clampScore(
			current.customerSatisfaction * 0.55 +
				averageStore.reputation * 0.35 +
				(100 - averageStore.demandMissedRate) * 0.1
		),
		staffMorale: clampScore(current.staffMorale * 0.55 + averageStore.staffMorale * 0.45),
		marketPosition: clampScore(current.marketPosition * 0.5 + averageStore.marketPosition * 0.5)
	};
}

function averageStoreHealth(storeReports: DailyStoreReport[]): {
	reputation: number;
	staffMorale: number;
	marketPosition: number;
	demandMissedRate: number;
} {
	if (storeReports.length === 0) {
		return { reputation: 50, staffMorale: 50, marketPosition: 50, demandMissedRate: 0 };
	}

	const demand = storeReports.reduce(
		(total, report) => total + report.customersServed + report.demandMissed,
		0
	);

	return {
		reputation: average(storeReports.map((report) => report.reputation)),
		staffMorale: average(storeReports.map((report) => report.staffMorale)),
		marketPosition: average(storeReports.map((report) => report.marketPosition)),
		demandMissedRate:
			demand === 0
				? 0
				: (storeReports.reduce((total, report) => total + report.demandMissed, 0) / demand) * 100
	};
}

function collectWarnings(
	storeReports: DailyStoreReport[],
	cashAfter: number
): DailyReportWarning[] {
	const warnings: DailyReportWarning[] = storeReports.flatMap((report) => report.warnings);

	if (cashAfter < 5_000) {
		warnings.push({ code: 'cashReservesLow' });
	}

	return warnings;
}

function sum(reports: DailyStoreReport[], key: SummedStoreReportKey): number {
	return reports.reduce((total, report) => {
		return total + report[key];
	}, 0);
}

function average(values: number[]): number {
	return values.reduce((total, value) => total + value, 0) / values.length;
}

function applyPolicyPricingToStores(stores: Store[], priceMultiplier: number): Store[] {
	return stores.map((store) => ({
		...store,
		products: store.products.map((product) => ({
			...product,
			sellingPrice: product.sellingPrice * priceMultiplier
		}))
	}));
}

function restoreProductSettings(soldStores: Store[], originalStores: Store[]): Store[] {
	const originalProductsByStoreId = new Map(
		originalStores.map((store) => [
			store.id,
			new Map(store.products.map((product) => [product.categoryId, product]))
		])
	);

	return soldStores.map((store) => {
		const products = store.products.map((product) => {
			const originalProduct = originalProductsByStoreId.get(store.id)?.get(product.categoryId);

			return originalProduct ? { ...originalProduct, stock: product.stock } : product;
		});

		return {
			...store,
			products,
			stockHealth: calculateStockHealth(products)
		};
	});
}

function mergeProductReportMaps(
	left: Map<string, DailyProductReport[]>,
	right: Map<string, DailyProductReport[]>
): Map<string, DailyProductReport[]> {
	const merged = new Map(left);

	for (const [storeId, reports] of right.entries()) {
		merged.set(storeId, [...(merged.get(storeId) ?? []), ...reports]);
	}

	return merged;
}

function getStoreProductReports(
	store: Store,
	productReports: Map<string, DailyProductReport[]>
): DailyProductReport[] {
	const reports = productReports.get(store.id) ?? [];

	return store.products.map((product) => {
		const existing = reports.find((report) => report.categoryId === product.categoryId);

		if (existing) {
			return existing;
		}

		const category = getArchetype(store.archetypeId).startingCategories.find(
			(candidate) => candidate.id === product.categoryId
		);

		return {
			categoryId: product.categoryId,
			name: category?.name ?? product.categoryId,
			unitsSold: 0,
			demandMissed: 0,
			revenue: 0,
			costOfGoods: 0,
			grossMargin: 0,
			endingStock: product.stock,
			warehouseUnits: 0,
			warehouseValue: 0,
			importedUnits: 0,
			importCost: category?.importCost ?? 0,
			importSpend: 0
		};
	});
}

function mergeProductionRefillReport(
	productionReport: DailyProductionReport,
	productReports: Map<string, DailyProductReport[]>
): DailyProductionReport {
	const reports = [...productReports.values()].flat();
	const warehousePulls = reports
		.filter((report) => report.warehouseUnits > 0)
		.flatMap((report): DailyMaterialMovement[] => {
			const materialId = getFinishedMaterialIdForCategory(report.categoryId);

			return materialId
				? [
						{
							materialId,
							quantity: report.warehouseUnits,
							value: report.warehouseValue,
							source: 'warehouse'
						}
					]
				: [];
		});
	const shopImports = reports
		.filter((report) => report.importedUnits > 0)
		.flatMap((report): DailyMaterialMovement[] => {
			const materialId = getFinishedMaterialIdForCategory(report.categoryId);

			return materialId
				? [
						{
							materialId,
							quantity: report.importedUnits,
							value: report.importSpend,
							source: 'import'
						}
					]
				: [];
		});

	return {
		...productionReport,
		warehousePulls: [...productionReport.warehousePulls, ...warehousePulls],
		shopImports
	};
}
