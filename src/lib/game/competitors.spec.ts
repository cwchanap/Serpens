import { describe, expect, test } from 'vitest';
import { isTileBuildable } from './city';
import { createNewGame } from './state';
import { ensureCompetitorsForRetailCity } from './competitors';
import { openWorldCity } from './world';
import { BRANDS } from './brands';
import { getProductDefinition } from './products';
import type { GameState, MarketCompetitor, ProductFamilyId } from './types';

function withCampusRevealed(game: GameState): GameState {
	return {
		...game,
		cash: 100_000,
		world: {
			...game.world,
			revealedCityIds: [...game.world.revealedCityIds, 'campus-junction']
		}
	};
}

function cityTileForCompetitor(game: GameState, competitor: MarketCompetitor) {
	const city = game.cities.find((candidate) => candidate.id === competitor.cityId);
	return city?.tiles.find(
		(tile) => tile.x === competitor.location.x && tile.y === competitor.location.y
	);
}

describe('sandbox competitor generation', () => {
	test('creates two deterministic Harbor rivals without advancing the gameplay RNG', () => {
		const first = createNewGame('convenience', 20260820);
		const second = createNewGame('convenience', 20260820);

		expect(first.competitors).toHaveLength(2);
		expect(first.competitors).toEqual(second.competitors);
		expect(first.rngState).toBe(second.rngState);
		expect(first.competitors.map((competitor) => competitor.id)).toEqual([
			'competitor-harbor-city-1',
			'competitor-harbor-city-2'
		]);
		expect(first.competitors.every((competitor) => competitor.cityId === 'harbor-city')).toBe(true);
	});

	test('does not advance the gameplay RNG while generating competitors', () => {
		const current = { ...createNewGame('convenience', 20260820), competitors: [] };
		const initialRngState = current.rngState;
		const first = ensureCompetitorsForRetailCity(current, 'harbor-city');
		const second = ensureCompetitorsForRetailCity({ ...current, competitors: [] }, 'harbor-city');

		expect(current.rngState).toBe(initialRngState);
		expect(first.rngState).toBe(initialRngState);
		expect(first.rngState).toBe(second.rngState);
		expect(first.competitors).toEqual(second.competitors);
	});

	test('uses compatible family focuses and brands at unowned buildable locations', () => {
		const game = createNewGame('grocery', 20260821);
		const ownedTileIds = new Set(
			game.stores.filter((store) => store.cityId === 'harbor-city').map((store) => store.tileId)
		);
		const focusFamilies = new Set<ProductFamilyId>();

		for (const competitor of game.competitors) {
			const tile = cityTileForCompetitor(game, competitor);
			expect(tile).toBeDefined();
			expect(tile && isTileBuildable(tile)).toBe(true);
			expect(tile && ownedTileIds.has(tile.id)).toBe(false);
			expect(competitor.reputation).toBeGreaterThanOrEqual(45);
			expect(competitor.reputation).toBeLessThanOrEqual(75);
			expect(new Set(competitor.productFocus).size).toBeGreaterThanOrEqual(1);
			expect(new Set(competitor.productFocus).size).toBeLessThanOrEqual(2);
			for (const familyId of competitor.productFocus) focusFamilies.add(familyId);
			for (const brandId of competitor.brandIds) {
				expect(
					competitor.productFocus.some((familyId) =>
						BRANDS[brandId].supportedFamilyIds.includes(familyId)
					)
				).toBe(true);
			}
		}

		expect(focusFamilies.size).toBeGreaterThanOrEqual(1);
		expect(
			game.competitors.every((competitor) =>
				competitor.brandIds.every((brandId) =>
					competitor.productFocus.some((familyId) =>
						BRANDS[brandId].supportedFamilyIds.includes(familyId)
					)
				)
			)
		).toBe(true);
		expect(getProductDefinition('bottled-water').familyId).toBe('beverages');
	});

	test('is idempotent and is a no-op for invalid or non-retail city lifecycle states', () => {
		const game = createNewGame('convenience', 20260822);
		const initialized = ensureCompetitorsForRetailCity(game, 'harbor-city');

		expect(ensureCompetitorsForRetailCity(initialized, 'harbor-city')).toBe(initialized);
		expect(ensureCompetitorsForRetailCity(game, 'industry-city')).toBe(game);
		expect(ensureCompetitorsForRetailCity(game, 'campus-junction')).toBe(game);
		expect(ensureCompetitorsForRetailCity({ ...game, cities: [] }, 'harbor-city')).toEqual({
			...game,
			cities: []
		});
	});

	test('is a no-op for an unknown city id and when too few buildable tiles remain', () => {
		const game = createNewGame('convenience', 20260822);

		expect(ensureCompetitorsForRetailCity(game, 'nonexistent-city')).toBe(game);

		const withoutRivals = { ...game, competitors: [] };
		const harborCity = withoutRivals.cities.find((city) => city.id === 'harbor-city')!;
		const noBuildableTiles = {
			...withoutRivals,
			cities: withoutRivals.cities.map((city) =>
				city.id === 'harbor-city' ? { ...city, tiles: [] } : city
			)
		};
		expect(noBuildableTiles.cities.find((city) => city.id === 'harbor-city')!.tiles).toEqual([]);
		expect(harborCity).toBeDefined();
		expect(ensureCompetitorsForRetailCity(noBuildableTiles, 'harbor-city')).toBe(noBuildableTiles);
	});

	test('adds exactly two rivals when a second sandbox retail map is opened', () => {
		const game = withCampusRevealed(createNewGame('convenience', 20260823));
		const opened = openWorldCity(game, 'campus-junction');

		expect(opened.cities.map((city) => city.id)).toContain('campus-junction');
		expect(
			opened.competitors.filter((competitor) => competitor.cityId === 'harbor-city')
		).toHaveLength(2);
		expect(
			opened.competitors.filter((competitor) => competitor.cityId === 'campus-junction')
		).toHaveLength(2);
		expect(opened.competitors).toHaveLength(4);
		expect(opened.competitors.map((competitor) => competitor.id)).toEqual([
			'competitor-campus-junction-1',
			'competitor-campus-junction-2',
			'competitor-harbor-city-1',
			'competitor-harbor-city-2'
		]);
	});
});
