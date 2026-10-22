/**
 * Balance-harness bot specs (HPA-502 Stage 2). Included in the Vitest server
 * project via the tests-directory spec glob in vite.config.ts.
 *
 * Every bot run uses an explicit seed; nothing relies on `Date.now()`.
 */
import { describe, expect, it } from 'vitest';
import { isTileBuildable } from '$lib/game/city';
import { deeplyEqual } from '$lib/game/equality';
import { forecastOpening } from '$lib/game/placement';
import {
	createCityTileLookup,
	getStoreFootprintPlacementBlockReason
} from '$lib/game/storeFootprint';
import type { ArchetypeId } from '$lib/game/types';
import type { SupplyPlannerAction } from '$lib/game/supplyPlannerActions';
import { createFoundingGame, executeAdvisorAction, runBot, selectFoundingTile } from './bots';

const SEED = 424_242;

function legalTiles(city: ReturnType<typeof createFoundingGame>['game']['cities'][number]) {
	const lookup = createCityTileLookup(city);
	return city.tiles.filter(
		(tile) => isTileBuildable(tile) && getStoreFootprintPlacementBlockReason(lookup, tile) === null
	);
}

/** Asserts the founding game sits on the deterministic rule tile. */
function expectRuleFounding(archetypeId: ArchetypeId, seed: number) {
	const { game, tile } = createFoundingGame(archetypeId, seed);
	const city = game.cities[0]!;
	// Independent recomputation of the brief's rule: max demand + footTraffic,
	// lowest tile id breaks ties, over buildable tiles only.
	const expected = selectFoundingTile(city);
	const scored = legalTiles(city).map((candidate) => ({
		id: candidate.id,
		score: candidate.demand + candidate.footTraffic
	}));
	const maxScore = Math.max(...scored.map((entry) => entry.score));

	expect(tile.id).toBe(expected.id);
	expect(expected.demand + expected.footTraffic).toBe(maxScore);
	expect(game.stores[0]!.tileId).toBe(expected.id);
	expect(game.seed).toBe(seed);
	return { game, city, ruleTile: expected };
}

describe('balance harness founding (HPA-502 Stage 2)', () => {
	it('founds on the max demand+footTraffic tile independent of the opening forecast', () => {
		let forecastDiverged = 0;
		for (const seed of [424_242, 280_001, 90_210, 7, 313_131]) {
			const { city, ruleTile } = expectRuleFounding('convenience', seed);
			// Meta-check: ranking by forecastOpening really would pick a different
			// tile for at least one seed — proving the founding rule does not ride
			// on forecast weights (a forecast tuning change must not move it).
			const forecastTop = legalTiles(city).reduce((best, candidate) => {
				const bestRevenue = forecastOpening(best, 'convenience').projectedDailyRevenue;
				const revenue = forecastOpening(candidate, 'convenience').projectedDailyRevenue;
				if (revenue > bestRevenue) return candidate;
				if (revenue === bestRevenue && candidate.id < best.id) return candidate;
				return best;
			});
			if (forecastTop.id !== ruleTile.id) forecastDiverged += 1;
		}
		expect(forecastDiverged).toBeGreaterThan(0);
	});
});

describe('balance harness bots (HPA-502 Stage 2)', () => {
	it('reproduces one seed/bot run identically', () => {
		const first = runBot('retail-steady', 'convenience', SEED, 30);
		const second = runBot('retail-steady', 'convenience', SEED, 30);

		expect(first.ledger).toEqual(second.ledger);
		expect(deeplyEqual(first.game, second.game)).toBe(true);
	});

	it('runs the idle bot without taking any action beyond advancing days', () => {
		const { game, ledger } = runBot('idle', 'convenience', SEED, 5);

		expect(ledger.actions).toEqual([]);
		expect(ledger.openings).toHaveLength(1); // the founding forecast only
		expect(game.day).toBe(6); // day 1 acted on, then five advanceDay ticks
	});

	it('delegates protect-availability to a real eligible staff manager at city scope', () => {
		const { game, ledger } = runBot('retail-steady', 'convenience', SEED, 3);

		const delegation = game.managerDelegations.find(
			(entry) => entry.playbook === 'protect-availability'
		);
		expect(delegation).toBeDefined();
		if (!delegation) throw new Error('Expected a protect-availability delegation.');
		expect(delegation.enabled).toBe(true);
		expect(delegation.authority.inventory).toBe(true);
		expect(delegation.authority.pricing).toBe(false);
		if (delegation.scope.kind !== 'city') throw new Error('Expected city-scope delegation.');
		const scope = delegation.scope;
		expect(game.stores.every((store) => store.cityId === scope.cityId)).toBe(true);
		const manager = game.staff.find((member) => member.id === delegation.managerId);
		expect(manager?.role).toBe('manager');
		expect(
			ledger.actions.some(
				(action) => action.action === 'setManagerDelegation' && action.outcome === 'applied'
			)
		).toBe(true);
	});

	it('keeps expansion stores inside the protect-availability target set', () => {
		const { game, ledger } = runBot('retail-steady', 'convenience', SEED, 10);

		// The expansion playbook must actually have opened a second store.
		const expansion = ledger.openings[1];
		expect(expansion).toBeDefined();
		if (!expansion) throw new Error('Expected the bot to open a second store.');

		// Regression guard for the old store-scoped delegation: an applied
		// inventory-targets change on the expansion store proves the manager's
		// playbook target set covers it, not just the founding store.
		expect(
			game.managerActionHistory.some(
				(entry) =>
					entry.outcome === 'applied' &&
					entry.change.kind === 'inventory-targets' &&
					entry.change.storeId === expansion.storeId
			)
		).toBe(true);
	});

	it('records unexpected advisor suggestions as failures without applying them', () => {
		const { game } = runBot('retail-steady', 'convenience', SEED, 1);
		const suggestions: SupplyPlannerAction[] = [
			{
				kind: 'change-supply-source',
				retailCityId: 'harbor-city',
				fromSupplyCityId: 'industry-city',
				toSupplyCityId: 'harbor-city'
			},
			{ kind: 'resume-route', routeId: 'route-1' }
		];

		let current = game;
		for (const suggestion of suggestions) {
			const result = executeAdvisorAction(current, suggestion, current.day);
			expect(result.record.outcome).toBe('unsupported');
			expect(result.record.detail).toContain(suggestion.kind);
			// Evidence, never a silent success: the game state must not move.
			expect(result.game).toBe(current);
			current = result.game;
		}
	});

	it('consults the advisor exactly once per weekly cadence day', () => {
		const { ledger } = runBot('advisor', 'convenience', SEED, 23);

		const advisorDays = [
			...new Set(
				ledger.actions
					.filter((action) => action.action.startsWith('advisor:'))
					.map((action) => action.day)
			)
		];
		// Weeks at day 1, 8, 15, 22 within a 23-day run — and nothing in between.
		expect(advisorDays).toEqual([1, 8, 15, 22]);
	});

	it('does not evaluate the advisor for the non-convenience archetypes', () => {
		for (const archetypeId of ['boutique', 'electronics', 'grocery'] as const) {
			const { ledger } = runBot('advisor', archetypeId, SEED, 10);
			expect(ledger.actions.some((action) => action.action.startsWith('advisor:'))).toBe(false);
		}
	});
});
