import { describe, expect, test } from 'vitest';
import { createNewGame } from './state';
import { openWorldCity, refreshWorldProgress } from './world';
import { WORLD_CITY_CATALOG } from './worldCatalog';
import { PROGRESSION_TIERS, claimEarnedTiers, evaluateProgression } from './progression';
import type { DailyReport, GameState, Store } from './types';
import { buildScenarioGame } from '$lib/scenarios/setup';
import { SCENARIO_CATALOG } from '$lib/scenarios/catalog';

function storeStub(id: string, level = 1): Store {
	return { id, level } as Store;
}

function reportStub(day: number, companyBookValueAfter: number): DailyReport {
	return {
		day,
		companyBookValueAfter,
		netIncome: 0,
		storeReports: [],
		productionReport: {
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
			railShipments: []
		}
	} as unknown as DailyReport;
}

/** Run-to-date local delivery of 30 tier-1 onboarding units. */
function localDeliveryReports(): DailyReport[] {
	const delivered = {
		productId: 'bottled-water' as const,
		importSpend: 0,
		importedUnits: 0,
		warehouseUnits: 30,
		unitsSold: 0,
		demandMissed: 0,
		wasteUnits: 0
	};
	return [
		reportStub(1, 80_000),
		{
			...reportStub(2, 90_000),
			storeReports: [
				{ storeId: 'store-1', productReports: [delivered] } as DailyReport['storeReports'][number]
			]
		}
	];
}

/** Base sandbox game (1 store, storeCap 3, two starter cities opened). */
function baseGame(): GameState {
	return createNewGame('convenience', 20260503);
}

function gameWith(overrides: Partial<GameState>): GameState {
	return { ...baseGame(), ...overrides };
}

/** A game that satisfies tier 1 (Local Shop) goals only. */
function tier1Game(): GameState {
	return gameWith({
		stores: [storeStub('store-1'), storeStub('store-2')],
		reports: [reportStub(1, 75_000)],
		day: 4
	});
}

/** A game satisfying tiers 1–3 goals at once (multi-claim). */
function tier3Game(): GameState {
	const allCities = WORLD_CITY_CATALOG.map((city) => city.id);
	return gameWith({
		stores: [
			storeStub('store-1', 2),
			storeStub('store-2'),
			storeStub('store-3'),
			storeStub('store-4')
		],
		reports: localDeliveryReports(),
		world: {
			...baseGame().world,
			openedCityIds: allCities.slice(0, 4)
		} as GameState['world'],
		day: 9
	});
}

describe('PROGRESSION_TIERS catalog', () => {
	test('has exactly five tiers in fixed ladder order with stable ids', () => {
		expect(PROGRESSION_TIERS.map((tier) => tier.id)).toEqual([
			'local-shop',
			'neighborhood-chain',
			'regional-supplier',
			'multi-city-operator',
			'market-leader'
		]);
	});

	test('each tier carries localized title/description keys and 2–3 monotone gte goals', () => {
		for (const tier of PROGRESSION_TIERS) {
			expect(tier.titleKey.startsWith('progression.tiers.')).toBe(true);
			expect(tier.descriptionKey.startsWith('progression.tiers.')).toBe(true);
			expect(tier.goals.length).toBeGreaterThanOrEqual(2);
			expect(tier.goals.length).toBeLessThanOrEqual(3);
			for (const goal of tier.goals) {
				expect(goal.comparator).toBe('gte');
				expect(['current', 'run-to-date']).toContain(goal.window.kind);
			}
		}
	});

	test('every tier rewards +1 store capacity and +$25k credit underwriting base and hard bound', () => {
		for (const tier of PROGRESSION_TIERS) {
			expect(tier.reward).toEqual({
				storeCapacityBonus: 1,
				creditUnderwritingBaseBonus: 25_000,
				creditGrossPrincipalHardBoundBonus: 25_000
			});
		}
	});

	test('authored goal targets match the design catalog', () => {
		const goalTargets = PROGRESSION_TIERS.map((tier) =>
			tier.goals.map((goal) => [goal.query.metric, goal.target] as const)
		);
		expect(goalTargets).toEqual([
			[
				['store-count', 2],
				['peak-company-book-value', 70_000]
			],
			[
				['store-count', 3],
				['max-store-level', 2],
				['opened-city-count', 3]
			],
			[
				['opened-city-count', 4],
				['retail-local-units', 25],
				['peak-company-book-value', 60_000]
			],
			[
				['store-count', 5],
				['opened-city-count', 5],
				['max-store-level', 4]
			],
			[
				['store-count', 7],
				['opened-city-count', 6],
				['peak-company-book-value', 150_000]
			]
		]);
	});

	test('tier-3 product goal uses the authored set of every industry-linked product', () => {
		const regionalSupplier = PROGRESSION_TIERS.find((tier) => tier.id === 'regional-supplier')!;
		const productGoal = regionalSupplier.goals.find(
			(goal) => goal.query.metric === 'retail-local-units'
		)!;
		if (!('productIds' in productGoal.query)) throw new Error('query must carry productIds');
		expect(productGoal.query.productIds.length).toBeGreaterThan(0);
		// Calibration revision: the set covers every industry-linked product so
		// any archetype stocking at least one of them can satisfy the goal.
		expect(productGoal.query.productIds).toEqual([
			'bottled-water',
			'produce',
			'pantry',
			'snacks',
			'soft-drinks',
			'essentials',
			'gifts'
		]);
	});
});

describe('evaluateProgression', () => {
	test('returns per-goal evidence with metric, target, actual and window completeness', () => {
		const evaluation = evaluateProgression(tier1Game());
		const localShop = evaluation.tiers[0]!;
		expect(localShop.claimed).toBe(false);
		expect(localShop.allGoalsPass).toBe(true);
		const storeGoal = localShop.goals[0]!;
		expect(storeGoal.passes).toBe(true);
		expect(storeGoal.evidence).toMatchObject({
			conditionId: storeGoal.goal.id,
			metric: 'store-count',
			comparator: 'gte',
			target: 2,
			actual: 2
		});
		const peakGoal = localShop.goals[1]!;
		expect(peakGoal.evidence.metric).toBe('peak-company-book-value');
		expect(peakGoal.evidence.actual).toBe(75_000);
		expect(peakGoal.evidence.windowComplete).toBe(true);
	});

	test('zero report history leaves peak goal incomplete and unpassed', () => {
		const evaluation = evaluateProgression(
			gameWith({ stores: [storeStub('store-1'), storeStub('store-2')], reports: [] })
		);
		const peakGoal = evaluation.tiers[0]!.goals[1]!;
		expect(peakGoal.evidence.windowComplete).toBe(false);
		expect(peakGoal.passes).toBe(false);
		expect(evaluation.tiers[0]!.allGoalsPass).toBe(false);
	});

	test('currentTier is the first unclaimed tier and completion state reflects claims', () => {
		const claimed = claimEarnedTiers(tier3Game());
		const evaluation = evaluateProgression(claimed);
		expect(evaluation.claimedCount).toBe(3);
		expect(evaluation.storeCapacityUnlockedByClaims).toBe(3);
		expect(evaluation.currentTier?.tier.id).toBe('multi-city-operator');
		expect(evaluation.allTiersClaimed).toBe(false);
		expect(evaluation.tiers.slice(0, 3).every((tier) => tier.claimed)).toBe(true);
	});

	test('allTiersClaimed flips only when every tier receipt exists', () => {
		const game = tier3Game();
		let next = claimEarnedTiers(game);
		// Force-claim the remaining tiers by satisfying later goals step by step.
		const allCities = WORLD_CITY_CATALOG.map((city) => city.id);
		next = claimEarnedTiers({
			...next,
			stores: [
				storeStub('store-1', 4),
				storeStub('store-2', 4),
				storeStub('store-3', 4),
				storeStub('store-4', 4),
				storeStub('store-5', 2),
				storeStub('store-6', 2),
				storeStub('store-7', 2)
			],
			reports: [reportStub(1, 200_000)],
			world: { ...next.world, openedCityIds: allCities } as GameState['world'],
			day: 30
		});
		expect(next.progression.claims.map((claim) => claim.tierId)).toHaveLength(5);
		const evaluation = evaluateProgression(next);
		expect(evaluation.allTiersClaimed).toBe(true);
		expect(evaluation.currentTier).toBeNull();
	});

	test('does not mutate the input game', () => {
		const game = tier1Game();
		evaluateProgression(game);
		claimEarnedTiers(game);
		expect(game.progression.claims).toEqual([]);
		expect(game.storeCap).toBe(3);
		expect(game.decisions).toEqual([]);
	});
});

describe('claimEarnedTiers', () => {
	test('claims a single newly eligible tier and advances storeCap by exactly one', () => {
		const claimed = claimEarnedTiers(tier1Game());
		expect(claimed).not.toBe(tier1Game());
		expect(claimed.progression.claims).toEqual([{ tierId: 'local-shop', claimedOnDay: 4 }]);
		expect(claimed.storeCap).toBe(4);
	});

	test('advances storeCap from an authored cap of 1, not the sandbox starter constant', () => {
		const game = gameWith({ storeCap: 1, stores: [storeStub('store-1'), storeStub('store-2')] });
		const claimed = claimEarnedTiers({
			...game,
			reports: [reportStub(1, 75_000)],
			day: 2
		});
		expect(claimed.storeCap).toBe(2);
		expect(claimed.progression.claims).toHaveLength(1);
	});

	test('claims several contiguous tiers in one call with one storeCap step each', () => {
		const claimed = claimEarnedTiers(tier3Game());
		expect(claimed.progression.claims.map((claim) => claim.tierId)).toEqual([
			'local-shop',
			'neighborhood-chain',
			'regional-supplier'
		]);
		expect(claimed.progression.claims.every((claim) => claim.claimedOnDay === 9)).toBe(true);
		expect(claimed.storeCap).toBe(6); // 3 starter + 3 claims
	});

	test('never claims past a failing tier even when later goals pass (ordering)', () => {
		// Tier 1 fails its peak goal (10k < 70k) while every tier-2 goal passes:
		// 3 stores, max level 2, all six cities opened.
		const game = gameWith({
			stores: [storeStub('store-1'), storeStub('store-2'), storeStub('store-3', 2)],
			reports: [reportStub(1, 10_000), reportStub(2, 20_000)],
			world: {
				...baseGame().world,
				openedCityIds: WORLD_CITY_CATALOG.map((city) => city.id)
			} as GameState['world'],
			day: 5
		});
		const claimed = claimEarnedTiers(game);
		expect(claimed).toBe(game);
		expect(claimed.progression.claims).toEqual([]);
	});

	test('continues the contiguous prefix from existing receipts', () => {
		const first = claimEarnedTiers(tier1Game());
		const grown = {
			...first,
			stores: [storeStub('store-1', 2), storeStub('store-2'), storeStub('store-3')],
			world: {
				...first.world,
				openedCityIds: WORLD_CITY_CATALOG.map((city) => city.id).slice(0, 3)
			} as GameState['world'],
			day: 8
		};
		const second = claimEarnedTiers(grown);
		expect(second.progression.claims.map((claim) => claim.tierId)).toEqual([
			'local-shop',
			'neighborhood-chain'
		]);
		expect(second.progression.claims[0]).toEqual({ tierId: 'local-shop', claimedOnDay: 4 });
		expect(second.progression.claims[1]).toEqual({ tierId: 'neighborhood-chain', claimedOnDay: 8 });
		expect(second.storeCap).toBe(5); // 4 after first claim + 1
	});

	test('repeat call with nothing newly eligible returns the same reference', () => {
		const first = claimEarnedTiers(tier3Game());
		const second = claimEarnedTiers(first);
		expect(second).toBe(first);
	});

	test('appends exactly one system notice per new claim and none on repeat', () => {
		const first = claimEarnedTiers(tier3Game());
		const notices = first.decisions.filter(
			(decision) =>
				decision.kind === 'system' && decision.id.startsWith('progression-tier-claimed-')
		);
		expect(notices.map((notice) => notice.id)).toEqual([
			'progression-tier-claimed-local-shop',
			'progression-tier-claimed-neighborhood-chain',
			'progression-tier-claimed-regional-supplier'
		]);
		if (notices[0]?.kind !== 'system') throw new Error('expected a system decision');
		expect(notices[0].context).toEqual({ code: 'progressionTierClaimed', tierId: 'local-shop' });
		expect(notices[0].expiresOnDay).toBe(10);

		const second = claimEarnedTiers(first);
		const secondNotices = second.decisions.filter(
			(decision) =>
				decision.kind === 'system' && decision.id.startsWith('progression-tier-claimed-')
		);
		expect(secondNotices).toHaveLength(3);
	});
});

describe('progression initialization', () => {
	test('createNewGame initializes empty claims', () => {
		expect(baseGame().progression).toEqual({ claims: [] });
	});

	test('scenario setup initializes empty claims', () => {
		const definition = SCENARIO_CATALOG[0]!;
		const result = buildScenarioGame(definition, definition.officialSeed);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.game.progression).toEqual({ claims: [] });
	});
});

describe('world transitions keep authored caps while claims add on top', () => {
	test('authored storeCap 1 scenario: world opening and milestones increment, claims add exactly their own step', () => {
		const authored = gameWith({
			storeCap: 1,
			stores: [storeStub('store-1')],
			cash: 50_000,
			// A previously opened non-harbor retail city lets the positive-income
			// milestone fire; campus-junction is already open so the opening leg
			// below uses garden-borough.
			world: {
				...baseGame().world,
				openedCityIds: ['harbor-city', 'campus-junction', 'industry-city']
			} as GameState['world']
		});
		// A milestone refresh adds its +1 bonus from the authored cap.
		const refreshed = refreshWorldProgress({
			...authored,
			reports: [{ ...reportStub(1, 10_000), netIncome: 500 }],
			day: 3
		});
		expect(refreshed.storeCap).toBe(2);
		// Opening a city keeps its authored-base lineage (+1 catalog bonus).
		const opened = openWorldCity(refreshed, 'garden-borough');
		expect(opened.world.openedCityIds).toContain('garden-borough');
		const openedBonus = WORLD_CITY_CATALOG.find(
			(city) => city.id === 'garden-borough'
		)!.storeCapBonus;
		expect(openedBonus).toBe(1);
		expect(opened.storeCap).toBe(2 + openedBonus);
		// A claim on top of the authored lineage adds exactly its own +1 steps.
		// Max store level stays 1 so only tier 1 is newly eligible.
		const claimable = {
			...opened,
			stores: [storeStub('store-1'), storeStub('store-2'), storeStub('store-3')],
			reports: [reportStub(2, 75_000)],
			day: 6
		};
		const claimed = claimEarnedTiers(claimable);
		expect(claimed.progression.claims).toHaveLength(1);
		expect(claimed.storeCap).toBe(2 + openedBonus + 1);
	});

	test('repeat claims and world transitions together never double-award receipts', () => {
		const once = claimEarnedTiers(tier1Game());
		const again = claimEarnedTiers(once);
		const refreshed = refreshWorldProgress(again);
		expect(refreshed.progression.claims).toEqual([{ tierId: 'local-shop', claimedOnDay: 4 }]);
		expect(refreshed.storeCap).toBe(4);
	});
});
