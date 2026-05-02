import { getArchetype } from './archetypes';
import { clampScore } from './reports';
import { createRngFromState, randomBetween } from './rng';
import type {
	DailyReport,
	DailyStoreReport,
	GameState,
	Scorecard,
	Store,
	StoreArchetype
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
	minimal: { capacity: 0.78, wage: 0.82, morale: -4, satisfaction: -4 },
	efficient: { capacity: 1, wage: 1, morale: 0, satisfaction: 0 },
	service: { capacity: 1.18, wage: 1.24, morale: 3, satisfaction: 4 }
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

const BASE_TICKET = 34;

export function simulateDay(game: GameState): GameState {
	const rng = createRngFromState(game.rngState);
	const storeResults = game.stores.map((store) => simulateStore(store, game, rng));
	const storeReports = storeResults.map((result) => result.report);
	const revenue = sum(storeReports, 'revenue');
	const costOfGoods = sum(storeReports, 'costOfGoods');
	const grossMargin = revenue - costOfGoods;
	const operatingCosts = sum(storeReports, 'operatingCosts');
	const netIncome = grossMargin - operatingCosts;
	const cashAfter = Math.round(game.cash + netIncome);
	const warnings = collectWarnings(storeReports, cashAfter);
	const scorecard = buildScorecard(game.scorecard, storeReports, netIncome);

	const report: DailyReport = {
		day: game.day,
		revenue: Math.round(revenue),
		costOfGoods: Math.round(costOfGoods),
		grossMargin: Math.round(grossMargin),
		operatingCosts: Math.round(operatingCosts),
		netIncome: Math.round(netIncome),
		cashAfter,
		scorecard,
		storeReports,
		warnings
	};

	return {
		...game,
		day: game.day + 1,
		rngState: rng.getState(),
		cash: cashAfter,
		scorecard,
		stores: storeResults.map((result) => result.store),
		reports: [...game.reports, report]
	};
}

function simulateStore(
	store: Store,
	game: GameState,
	rng: ReturnType<typeof createRngFromState>
): { store: Store; report: DailyStoreReport } {
	const archetype = getArchetype(store.archetypeId);
	const pricing = PRICING[game.policy.pricing];
	const inventory = INVENTORY[game.policy.inventory];
	const staffing = STAFFING[game.policy.staffing];
	const marketing = MARKETING[game.policy.marketing];
	const service = SERVICE[game.policy.service];
	const variance = randomBetween(rng, 0.92, 1.08);
	const productFit = productDemandFit(archetype);
	const reputationDemand = 0.72 + store.reputation / 180;
	const competitionDrag = 1 - store.competition / 260;
	const demand = Math.max(
		0,
		store.localDemand *
			productFit *
			pricing.demand *
			marketing.demand *
			reputationDemand *
			competitionDrag *
			variance
	);
	const stockLimit = store.localDemand * inventory.capacity * Math.max(0.18, store.stockHealth / 72);
	const staffLimit =
		store.staffCapacity * staffing.capacity * service.throughput * (0.72 + store.staffMorale / 220);
	const customersServed = Math.max(0, Math.floor(Math.min(demand, stockLimit, staffLimit)));
	const demandMissed = Math.max(0, Math.round(demand - customersServed));
	const averageMargin = clampRatio(averageCategoryMargin(archetype) + pricing.margin, 0.12, 0.68);
	const averageTicket =
		BASE_TICKET *
		pricing.price *
		(0.82 + archetype.customerExpectation / 250) *
		randomBetween(rng, 0.96, 1.04);
	const revenue = Math.round(customersServed * averageTicket);
	const costOfGoods = Math.round(revenue * (1 - averageMargin));
	const grossMargin = revenue - costOfGoods;
	const operatingCosts = Math.round(
		archetype.baseRent * (0.92 + store.competition / 450) +
			archetype.baseWage * staffing.wage +
			marketing.cost +
			supplierCost(archetype, inventory.cost, customersServed)
	);
	const netIncome = grossMargin - operatingCosts;
	const warnings = buildStoreWarnings(store, customersServed, demandMissed, stockLimit, staffLimit);
	const stockHealth = clampScore(
		store.stockHealth +
			inventory.recovery -
			(customersServed / Math.max(1, store.localDemand)) * 18 * inventory.stockStress -
			randomBetween(rng, 0, 2)
	);
	const staffMorale = clampScore(
		store.staffMorale +
			staffing.morale +
			service.morale +
			store.managerQuality / 40 -
			3 -
			(customersServed >= staffLimit - 1 ? 2 : 0)
	);
	const reputation = clampScore(
		store.reputation +
			pricing.satisfaction +
			inventory.satisfaction +
			staffing.satisfaction +
			service.satisfaction +
			marketing.reputation +
			(demandMissed > demand * 0.18 ? -3 : 1)
	);
	const marketPosition = clampScore(
		35 + store.localDemand / 5 + reputation / 3 - store.competition / 4 + marketing.market
	);

	return {
		store: {
			...store,
			daysOpen: store.daysOpen + 1,
			stockHealth,
			staffMorale,
			reputation
		},
		report: {
			storeId: store.id,
			revenue,
			costOfGoods,
			grossMargin,
			operatingCosts,
			netIncome,
			customersServed,
			demandMissed,
			stockHealth,
			staffMorale,
			reputation,
			marketPosition,
			warnings
		}
	};
}

function productDemandFit(archetype: StoreArchetype): number {
	const categoryDemand = archetype.startingCategories.reduce(
		(total, category) => total + category.baseDemand,
		0
	);

	return clampRatio(categoryDemand / Math.max(1, archetype.baseTraffic * 1.45), 0.72, 1.22);
}

function averageCategoryMargin(archetype: StoreArchetype): number {
	const totalDemand = archetype.startingCategories.reduce(
		(total, category) => total + category.baseDemand,
		0
	);

	if (totalDemand === 0) {
		return 0.3;
	}

	return archetype.startingCategories.reduce(
		(total, category) => total + category.margin * (category.baseDemand / totalDemand),
		0
	);
}

function supplierCost(archetype: StoreArchetype, inventoryCost: number, customersServed: number): number {
	return Math.round(customersServed * inventoryCost * (1.4 + archetype.startingCategories.length * 0.35));
}

function buildStoreWarnings(
	store: Store,
	customersServed: number,
	demandMissed: number,
	stockLimit: number,
	staffLimit: number
): string[] {
	const warnings: string[] = [];

	if (store.stockHealth < 25 || (demandMissed > 0 && stockLimit <= customersServed + 1)) {
		warnings.push(`${store.name} has stock pressure`);
	}

	if (store.staffMorale < 30 || staffLimit <= customersServed + 1) {
		warnings.push(`${store.name} is near staff capacity`);
	}

	if (store.reputation < 35) {
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

function sum(reports: DailyStoreReport[], key: keyof DailyStoreReport): number {
	return reports.reduce((total, report) => {
		const value = report[key];
		return typeof value === 'number' ? total + value : total;
	}, 0);
}

function average(values: number[]): number {
	return values.reduce((total, value) => total + value, 0) / values.length;
}

function clampRatio(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}
