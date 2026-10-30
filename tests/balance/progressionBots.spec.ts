/**
 * Progression bot specs (HPA-318 Step 4). The opt-in `progression` bot must
 * play only legal `applyGameCommand` operations (plus the real
 * `setManagerDelegation` transition, like every harness bot), call the
 * production `claimEarnedTiers` after every successfully applied command —
 * proven here through the production fixed-point property: when nothing
 * earned is left unclaimed, `claimEarnedTiers(game)` returns the same
 * reference — and stay deterministic for an explicit seed. The three
 * HPA-502 bots are untouched; `idle` doubles as the negative control.
 */

import { describe, expect, it } from 'vitest';
import { claimEarnedTiers, evaluateProgression } from '$lib/game/progression';
import type { ArchetypeId } from '$lib/game/types';
import { runBot, runProgressionBot, type ProgressionRunDigest } from './bots';
import { median, quantile } from './progressionCalibration';

const REFERENCE_SEED = 20260503;
const REFERENCE_DAYS = 365;

/**
 * Every ledger action name the progression bot may ever emit. Command-shaped
 * actions mirror the legal `ScenarioCommand` vocabulary; `setManagerDelegation`
 * is the same real transition the HPA-502 bots use; `claimEarnedTiers` records
 * production claim receipts; everything else is planner bookkeeping.
 */
const LEGAL_PROGRESSION_ACTIONS = new Set([
	'await-manager',
	'setManagerDelegation',
	'hireStaff',
	'assignStaff',
	'selectWorldCity',
	'openWorldCity',
	'openStore',
	'upgradeStore',
	'borrow',
	'payOffLoan',
	'claimEarnedTiers',
	'progression:plan',
	'progression:build-producer',
	'progression:build-warehouse',
	'progression:upgrade-building',
	'progression:connect-rail',
	'progression:create-route',
	'progression:edit-route',
	'progression:resume-route',
	'progression:change-supply-source',
	'progression:none',
	'defer-credit'
]);

function progressionRunDigest(
	seed: number,
	archetypeId: ArchetypeId,
	days: number
): ProgressionRunDigest {
	return runProgressionBot(archetypeId, seed, days).digest;
}

// Full multi-day bot simulations (each test re-runs the 365-day bot), so this
// file needs the heavy-spec headroom the config comment reserves for
// encode/validate-heavy suites.
describe('progression bot (HPA-318 Step 4)', { timeout: 30_000 }, () => {
	it('ends at the production claim fixed point: claimEarnedTiers finds nothing left to claim', () => {
		const { game, digest } = runProgressionBot('convenience', REFERENCE_SEED, REFERENCE_DAYS);
		// After claiming after every applied command, no earned tier may remain
		// unclaimed — the pure production transition must be a fixed point.
		expect(claimEarnedTiers(game)).toBe(game);
		expect(digest.claims).toHaveLength(game.progression.claims.length);
		for (const [index, claim] of game.progression.claims.entries()) {
			expect(digest.claims[index]).toEqual({
				tierId: claim.tierId,
				claimedOnDay: claim.claimedOnDay
			});
		}
	});

	it('claims tier 1 on the reference seed within 365 days (frozen acceptance floor)', () => {
		const { game } = runProgressionBot('convenience', REFERENCE_SEED, REFERENCE_DAYS);
		const tier1 = game.progression.claims.find((claim) => claim.tierId === 'local-shop');
		expect(tier1).toBeDefined();
		expect(tier1!.claimedOnDay).toBeLessThanOrEqual(365);
	});

	it('is deterministic for an explicit seed: two runs produce identical digests', () => {
		const first = progressionRunDigest(REFERENCE_SEED, 'convenience', 120);
		const second = progressionRunDigest(REFERENCE_SEED, 'convenience', 120);
		expect(JSON.stringify(first)).toBe(JSON.stringify(second));
	});

	it('emits only legal command vocabulary in its action trace', () => {
		const { digest } = runProgressionBot('convenience', REFERENCE_SEED, 120);
		const illegal = digest.actions.filter(
			(action) => !LEGAL_PROGRESSION_ACTIONS.has(action.action)
		);
		expect(illegal).toEqual([]);
	});

	it('opens stores only inside its store cap and only in opened cities', () => {
		const { game } = runProgressionBot('convenience', REFERENCE_SEED, REFERENCE_DAYS);
		expect(game.stores.length).toBeLessThanOrEqual(game.storeCap);
		const openedRetailCityIds = new Set(game.cities.map((city) => city.id));
		for (const store of game.stores) {
			expect(openedRetailCityIds.has(store.cityId)).toBe(true);
		}
	});

	it('keeps the idle negative control at zero claims (foundational book value cannot claim tier 1)', () => {
		const { game } = runBot('idle', 'convenience', REFERENCE_SEED, REFERENCE_DAYS);
		expect(game.progression.claims).toHaveLength(0);
		expect(claimEarnedTiers(game)).toBe(game);
		const evaluation = evaluateProgression(game);
		const tier1 = evaluation.tiers[0]!;
		expect(tier1.claimed).toBe(false);
		// The founding/idle peak stays strictly below the tier-1 peak target,
		// so the goal is not a decorative founding-cash milestone.
		expect(tier1.goals.find((goal) => goal.goal.id === 'local-shop-peak-book-value')!.passes).toBe(
			false
		);
	});
});

describe('progression calibration aggregation helpers', () => {
	it('quantiles interpolate linearly inside the sorted sample', () => {
		const sample = [10, 20, 30, 40];
		expect(quantile(sample, 0.1)).toBe(13);
		expect(quantile(sample, 0.5)).toBe(25);
		expect(quantile(sample, 0.9)).toBe(37);
		expect(median(sample)).toBe(25);
		expect(quantile([], 0.5)).toBeNull();
	});
});
