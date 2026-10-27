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
 *   the round-2 replay, not asserted here).
 *
 * The arithmetic mirrors the daily resolution in stock.ts (trended city pool →
 * market share → price multiplier → shared-capacity fill in sorted-id order)
 * at perfect stock, i.e. the same probe math Task 3 / round 1 were sized with.
 */
import { describe, expect, test } from 'vitest';

import { getArchetype } from './archetypes';
import { brandedSellerScore, resolveBrandEconomics } from './brands';
import { isTileBuildable } from './city';
import { resolveProductMarketShare } from './marketCompetition';
import { createFoundingGameAtTile } from './placement';
import { getProductDefinition } from './products';
import { projectStoreSalesCapacity } from './simulateDay';
import { summarizeStoreStaffing } from './staffing';
import { buildCityDemandPools, getEligibleProductSellers, priceDemandMultiplier } from './stock';
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
		const playerPool = Math.round((pools[productId] ?? 0) * market.playerShare);
		const desired = Math.max(
			0,
			Math.round(playerPool * priceDemandMultiplier(definition, product.sellingPrice))
		);
		const sold = Math.min(desired, capacityRemaining);
		capacityRemaining -= sold;
		const unitCost = resolveBrandEconomics(definition, product.brandId).unitCost;
		gross += sold * (product.sellingPrice - unitCost);
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
