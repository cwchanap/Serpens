import { getArchetype } from './archetypes';
import { generateDecisions, pruneExpiredDecisions } from './events';
import { clampScore } from './reports';
import { createRngFromState, randomBetween } from './rng';
import {
	calculateMonthlyPayroll,
	generateHiringCandidates,
	HIRING_CANDIDATE_COUNT,
	isPayrollDay,
	shouldRefreshHiringMarket,
	summarizeStoreStaffing
} from './staffing';
import {
	applyWeeklyImports,
	calculateStockHealth,
	isImportDay,
	simulateProductSalesForCity
} from './stock';
import type {
	DailyProductReport,
	DailyReport,
	DailyStoreReport,
	GameState,
	Scorecard,
	StaffingRequirement,
	Store
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
	staffingCoverage: number;
	staffingShortage: StaffingRequirement;
	staffMorale: number;
	reputation: number;
	marketPosition: number;
	operatingCosts: number;
	startingStockHealth: number;
}

export function simulateDay(game: GameState): GameState {
	const rng = createRngFromState(game.rngState);
	const profiles = game.stores.map((store) => buildStoreOperationProfile(store, game, rng));
	const profileByStoreId = new Map(profiles.map((profile) => [profile.store.id, profile]));
	const storeCapacity = new Map(profiles.map((profile) => [profile.store.id, profile.staffLimit]));
	const pricedSalesGame = {
		...game,
		stores: applyPolicyPricingToStores(game.stores, PRICING[game.policy.pricing].price)
	};
	const citySales = game.cities
		.filter((city) => city.id === game.activeCityId)
		.reduce(
			(result, city) => {
				const sales = simulateProductSalesForCity({
					game: { ...pricedSalesGame, stores: result.stores },
					city,
					rng,
					storeCapacity
				});

				return {
					stores: restoreProductSettings(sales.stores, game.stores),
					productReports: mergeProductReportMaps(result.productReports, sales.productReports)
				};
			},
			{ stores: pricedSalesGame.stores, productReports: new Map<string, DailyProductReport[]>() }
		);
	const stockGame = { ...game, stores: citySales.stores };
	const importResult = isImportDay(game.day)
		? applyWeeklyImports({ game: stockGame, storeReports: citySales.productReports })
		: { stores: stockGame.stores, productReports: citySales.productReports, importSpend: 0 };
	const storeResults = importResult.stores.map((store) =>
		buildDailyStoreReport(
			{ ...profileByStoreId.get(store.id)!, store },
			getStoreProductReports(store, importResult.productReports)
		)
	);
	const storeReports = storeResults.map((result) => result.report);
	const nextDay = game.day + 1;
	const revenue = sum(storeReports, 'revenue');
	const costOfGoods = sum(storeReports, 'costOfGoods');
	const grossMargin = revenue - costOfGoods;
	const payrollCost = isPayrollDay(game.day) ? calculateMonthlyPayroll(game.staff) : 0;
	const operatingCosts = sum(storeReports, 'operatingCosts') + payrollCost;
	const importSpend = sum(storeReports, 'importSpend');
	const netIncome = revenue - operatingCosts - importSpend;
	const cashAfter = Math.round(game.cash + netIncome);
	const warnings = collectWarnings(storeReports, cashAfter);
	const scorecard = buildScorecard(game.scorecard, storeReports, netIncome);
	const hiringCandidates = shouldRefreshHiringMarket(nextDay)
		? generateHiringCandidates({ count: HIRING_CANDIDATE_COUNT, day: nextDay, rng })
		: game.hiringCandidates;
	const postDayGame = {
		...game,
		day: nextDay,
		rngState: rng.getState(),
		cash: cashAfter,
		scorecard,
		hiringCandidates
	};
	const preservedDecisions = pruneExpiredDecisions(postDayGame);

	const report: DailyReport = {
		day: game.day,
		revenue: Math.round(revenue),
		costOfGoods: Math.round(costOfGoods),
		grossMargin: Math.round(grossMargin),
		operatingCosts: Math.round(operatingCosts),
		payrollCost,
		importSpend: Math.round(importSpend),
		netIncome: Math.round(netIncome),
		cashAfter,
		scorecard,
		storeReports,
		warnings
	};

	return {
		...game,
		day: nextDay,
		rngState: rng.getState(),
		cash: cashAfter,
		scorecard,
		stores: storeResults.map((result) => result.store),
		hiringCandidates,
		decisions: [
			...preservedDecisions,
			...generateDecisions({
				...postDayGame,
				decisions: preservedDecisions,
				stores: storeResults.map((result) => result.store)
			})
		],
		reports: [...game.reports, report]
	};
}

function buildStoreOperationProfile(
	store: Store,
	game: GameState,
	rng: ReturnType<typeof createRngFromState>
): StoreOperationProfile {
	const staffing = STAFFING[game.policy.staffing];
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
		staffingCoverage: staffingSummary.coverage,
		staffingShortage: staffingSummary.shortage,
		staffMorale,
		reputation,
		marketPosition,
		operatingCosts,
		startingStockHealth: store.stockHealth
	};
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
	staffLimit: number,
	staffingShortage: StaffingRequirement,
	reputation: number
): string[] {
	const warnings: string[] = [];
	const customersServed = productReports.reduce((total, report) => total + report.unitsSold, 0);
	const demandMissed = productReports.reduce((total, report) => total + report.demandMissed, 0);

	if (
		store.stockHealth < 25 ||
		startingStockHealth < 25 ||
		productReports.some((report) => report.endingStock === 0)
	) {
		warnings.push(`${store.name} has stock pressure`);
	}

	if (store.staffMorale < 30 || staffLimit <= customersServed + 1) {
		warnings.push(`${store.name} is near staff capacity`);
	}

	if (staffingShortage.manager > 0) {
		warnings.push(`${store.name} is short ${staffingShortage.manager} manager`);
	}

	if (staffingShortage.general > 0) {
		warnings.push(`${store.name} is short ${staffingShortage.general} general staff`);
	}

	if (demandMissed > customersServed * 0.2) {
		warnings.push(`${store.name} missed product demand`);
	}

	if (reputation < 35) {
		warnings.push(`${store.name} reputation is slipping`);
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

function collectWarnings(storeReports: DailyStoreReport[], cashAfter: number): string[] {
	const warnings = storeReports.flatMap((report) => report.warnings);

	if (cashAfter < 5_000) {
		warnings.push('cash reserves are low');
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
			importedUnits: 0,
			importCost: category?.importCost ?? 0,
			importSpend: 0
		};
	});
}
