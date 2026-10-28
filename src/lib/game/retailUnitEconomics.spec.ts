/**
 * HPA-502 Step 4 round-2 regression: the repaired founding unit economics.
 *
 * Round 1 measured convenience and grocery level-1 stores structurally below
 * costs (gross/costs ≈ 0.35×/0.17× perfect-stock, seed 20260503) and proved no
 * price/cost/breadth/capacity data could fix grocery while its seeded rival
 * capped playerShare at ≈ 0.445. Controller Ruling 8 added the demand-side
 * lever (per-product demandWeight) and this suite pins the repaired state:
 *
 * - grocery-food demandWeight ×2 (products.ts) plus Ruling-8 lever (v)
 *   (grocery base staffing 3→2, pantry price 9) make rival-bound seeds
 *   capacity-bound like rival-free seeds, so BOTH archetypes clear the 1.2×
 *   sizing bar on all 10 balance-replay seeds inside the 1.2–2.0× band
 *   (measured: convenience 1.32–1.64×, grocery 1.47–1.86×);
 * - no seed overshoots the 2.0× hard cap on the sizing band;
 * - boutique (positive control) is not weaker than its round-1 measured
 *   founding ratio (≈ 2.56×; the breadth/capacity levers strengthen it, which
 *   the ruling explicitly allows);
 * - electronics single-store viability stays above the 1.2× bar (the
 *   expansion-pairing demand-split is a documented diagnosis, re-measured in
 *   the round-2 replay, not asserted here);
 * - Ruling 13 (task 5d): the electronics-family demandWeight step (games 1 →
 *   1.08, accessories 0.9 → 0.972 — exact family ratio preserved) is pinned
 *   by a 3-store-band regression: ≥6 of the 16 weak-demand seeds documented
 *   in task-5c-report §5 must complete a positive 30d window by day 90
 *   (measured 7 → 41/50 total viability), while the passing seeds' d61–90
 *   income headroom stays ≤ ~2× their pre-change baseline (hard cap).
 *
 * The arithmetic mirrors the daily resolution in stock.ts (trended city pool →
 * market share → price multiplier → shared-capacity fill in sorted-id order)
 * at perfect stock, i.e. the same probe math Task 3 / round 1 were sized with.
 */
import { describe, expect, test } from 'vitest';

import { runBot } from '../../../tests/balance/bots';
import { getArchetype } from './archetypes';
import { brandedSellerScore, resolveBrandEconomics } from './brands';
import { isTileBuildable } from './city';
import { resolveProductMarketShare } from './marketCompetition';
import { createFoundingGameAtTile } from './placement';
import { getProductDefinition } from './products';
import { resolveProductMarketDynamics, resolveTrendMultiplier } from './productDynamics';
import { POLICY_PRICING_TABLE, projectStoreSalesCapacity } from './simulateDay';
import { summarizeStoreStaffing } from './staffing';
import {
	buildCityDemandPools,
	getEligibleProductSellers,
	priceDemandMultiplier,
	sellerPolicyDemand
} from './stock';
import { createCityTileLookup, getStoreFootprintPlacementBlockReason } from './storeFootprint';
import { createNewGame } from './state';
import type { ArchetypeId, City, CityTile, GameState, ProductId } from './types';

// The 10-seed balance-replay set (docs/balance replays, round-1/2 reports).
const BALANCE_SEEDS = [
	20260501, 20260502, 20260503, 20260504, 20260505, 20260506, 20260507, 20260508, 20260509, 20260510
] as const;

const SIZING_BAR = 1.2; // gross ≥ 1.2 × unavoidable costs
const HARD_CAP = 2.0; // no seed above 2.0× (anti-overshoot)

interface FoundingEconomics {
	ratio: number;
	gross: number;
	costs: number;
	grossUnits: number;
	playerShare: number;
}

function selectFoundingTile(city: City): CityTile {
	const lookup = createCityTileLookup(city);
	return city.tiles
		.filter(
			(tile) =>
				isTileBuildable(tile) && getStoreFootprintPlacementBlockReason(lookup, tile) === null
		)
		.reduce((best, tile) => {
			const bestScore = best.demand + best.footTraffic;
			const score = tile.demand + tile.footTraffic;
			if (score > bestScore) return tile;
			if (score === bestScore && tile.id < best.id) return tile;
			return best;
		});
}

/** Perfect-stock founding-day gross vs unavoidable costs, mirroring stock.ts. */
function measureFoundingEconomics(archetypeId: ArchetypeId, seed: number): FoundingEconomics {
	const generated = createNewGame(archetypeId, seed);
	const city = generated.cities[0]!;
	const tile = selectFoundingTile(city);
	const game: GameState = createFoundingGameAtTile({ archetypeId, city, tileId: tile.id, seed });

	const store = game.stores[0]!;
	const products = store.products.map((product) => ({
		...product,
		// Perfect stock: the day's full desired volume is sellable.
		lots: [{ receivedDay: game.day, quantity: 999 }]
	}));

	const summary = summarizeStoreStaffing(game, store);
	const capacity = projectStoreSalesCapacity({
		staffCapacity: store.staffCapacity,
		staffMorale: store.staffMorale,
		coverage: summary.coverage,
		averageSkill: summary.averageSkill,
		averageMorale: summary.averageMorale,
		policy: game.policy
	});

	const archetype = getArchetype(archetypeId);
	const monthlyPayroll = game.staff
		.filter((member) => member.assignedStoreId === store.id)
		.reduce((sum, member) => sum + member.monthlySalary, 0);
	// Founding cost basis (Task 3 / round-1 probe math): rent under the balanced
	// occupancy factor, founding default marketing spend, payroll amortized.
	const costs = Math.round(archetype.baseRent * 0.92 + 80) + monthlyPayroll / 30;

	const pools = buildCityDemandPools(game, city);
	let gross = 0;
	let grossUnits = 0;
	let capacityRemaining = capacity;
	let playerShare = 1;
	for (const productId of Object.keys(pools).sort() as ProductId[]) {
		const product = products.find((candidate) => candidate.productId === productId);
		if (!product) continue;
		const definition = getProductDefinition(productId);
		const sellers = getEligibleProductSellers(game, city.id, productId);
		const totalScore = sellers.reduce(
			(sum, seller) => sum + brandedSellerScore(seller, productId),
			0
		);
		if (totalScore <= 0) continue;
		const market = resolveProductMarketShare(
			game.competitors.filter((competitor) => competitor.cityId === city.id),
			[],
			definition,
			totalScore,
			1
		);
		playerShare = Math.min(playerShare, market.playerShare);
		// Live desired-units factors from simulateProductSalesForCity: trend on the
		// city pool, the marketing/pricing policy demand multiplier, the brand
		// demand multiplier, and obsolescence (1 on founding-day lots). Only the
		// daily jitter is dropped (deterministic probe).
		const trendPool = Math.max(
			0,
			Math.round(
				(pools[productId] ?? 0) * resolveTrendMultiplier(definition.dynamics.trend, game.day)
			)
		);
		const playerPool = Math.round(trendPool * market.playerShare);
		const sellerSplit = brandedSellerScore(store, productId) / totalScore;
		const brandEconomics = resolveBrandEconomics(definition, product.brandId);
		const basePrice = product.sellingPrice * POLICY_PRICING_TABLE[game.policy.pricing].price;
		const marketDynamics = resolveProductMarketDynamics({ product, definition, day: game.day });
		const desired = Math.max(
			0,
			Math.round(
				sellerPolicyDemand(playerPool, sellerSplit, game.policy) *
					brandEconomics.demandMultiplier *
					marketDynamics.obsolescenceMultiplier *
					priceDemandMultiplier(definition, basePrice)
			)
		);
		const sold = Math.min(desired, capacityRemaining);
		capacityRemaining -= sold;
		gross += sold * (basePrice - brandEconomics.unitCost);
		grossUnits += sold;
	}

	return { ratio: gross / costs, gross, costs, grossUnits, playerShare };
}

describe('repaired founding unit economics (HPA-502 Step 4 round 2)', () => {
	test('convenience clears the 1.2× sizing bar on ≥8/10 balance seeds, capped at 2.0×', () => {
		const rows = BALANCE_SEEDS.map((seed) => ({
			seed,
			...measureFoundingEconomics('convenience', seed)
		}));
		const passing = rows.filter((row) => row.ratio >= SIZING_BAR);
		expect(passing.length).toBeGreaterThanOrEqual(8);
		for (const row of rows) {
			expect(row.ratio).toBeLessThanOrEqual(HARD_CAP);
		}
	});

	test('grocery clears the 1.2× sizing bar on ≥8/10 balance seeds, capped at 2.0×', () => {
		const rows = BALANCE_SEEDS.map((seed) => ({
			seed,
			...measureFoundingEconomics('grocery', seed)
		}));
		const passing = rows.filter((row) => row.ratio >= SIZING_BAR);
		// Measured 1.47–1.86× under the round-2 set (10/10 pass, no cap breach).
		expect(passing.length).toBeGreaterThanOrEqual(8);
		for (const row of rows) {
			expect(row.ratio).toBeLessThanOrEqual(HARD_CAP);
		}
	});

	test('boutique control is not weaker than its round-1 founding ratio', () => {
		const rows = BALANCE_SEEDS.map((seed) => ({
			seed,
			...measureFoundingEconomics('boutique', seed)
		}));
		for (const row of rows) {
			// Round 1 measured 2.56× (seed 20260503); the breadth-2 + capacity ×2
			// levers may strengthen the control (allowed) but never weaken it.
			expect(row.ratio).toBeGreaterThanOrEqual(2.5);
		}
	});

	test('electronics single-store viability stays above the sizing bar', () => {
		const rows = BALANCE_SEEDS.map((seed) => ({
			seed,
			...measureFoundingEconomics('electronics', seed)
		}));
		for (const row of rows) {
			expect(row.ratio).toBeGreaterThanOrEqual(SIZING_BAR);
		}
	});
});

describe('electronics 3-store band under the Ruling 13 demand weights (HPA-502 task 5d)', () => {
	// The 16 seeds that failed retail viability 34/50 at the pre-change
	// weights (task-5c-report §5: identical structure — 2 expansions by d90,
	// 3-store gross 54.3–60.3k vs ≈61.3k fixed cost base).
	const WEAK_DEMAND_SEEDS = [
		20260504, 20260509, 20260510, 20260514, 20260516, 20260518, 20260519, 20260520, 20260524,
		20260526, 20260529, 20260534, 20260539, 20260544, 20260545, 20260549
	] as const;

	/** First positive 30d operating-income window completing by day 90. */
	function viableByDay90(seed: number): boolean {
		const { game } = runBot('retail-steady', 'electronics', seed, 90);
		const reports = game.reports;
		for (let end = 29; end < reports.length; end += 1) {
			const start = end - 29;
			if (reports[end]!.day !== end + 1) continue;
			let sum = 0;
			for (let index = start; index <= end; index += 1) sum += reports[index]!.operatingIncome;
			if (sum > 0) return true;
		}
		return false;
	}

	function incomeDays61To90(seed: number): number {
		const { game } = runBot('retail-steady', 'electronics', seed, 365);
		let income = 0;
		for (const report of game.reports) {
			if (report.day >= 61 && report.day <= 90) income += report.operatingIncome;
		}
		return income;
	}

	test('≥6 of the 16 weak-demand seeds complete a positive 30d window by day 90', () => {
		const viable = WEAK_DEMAND_SEEDS.filter((seed) => viableByDay90(seed));
		// Measured 7/16 at games 1.08 / accessories 0.972 → 41/50 total viability
		// (pre-change: 0/16 — the sizing evidence the ×1.08 step was chosen for).
		expect(viable.length).toBeGreaterThanOrEqual(6);
	});

	test('passing seeds keep d61–90 income headroom ≤ ~2× their pre-change baseline', () => {
		// Pre-change d61–90 incomes from the 5c checkpoint artifacts (weakest
		// and strongest passing seeds); the ×1.08 step must strengthen, never
		// double, them (brief hard cap; measured 12,381 and 20,924).
		const cases = [
			{ seed: 20260548, baseline: 6_717 },
			{ seed: 20260532, baseline: 14_932 }
		];
		for (const { seed, baseline } of cases) {
			const income = incomeDays61To90(seed);
			expect(income).toBeGreaterThanOrEqual(baseline);
			expect(income).toBeLessThanOrEqual(2 * baseline);
		}
	});
});
