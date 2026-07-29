import { describe, expect, test } from 'vitest';
import { generateCity, isTileBuildable } from './city';
import {
	createFoundingGameAtTile,
	forecastOpening,
	financeRetailStoreOpening,
	getRecommendedArchetypes,
	openStoreAtTile
} from './placement';
import {
	createCityTileLookup,
	getOccupiedStoreTileIds,
	getStoreFootprintPlacementBlockReason
} from './storeFootprint';
import type { City, CityTile, Store } from './types';

describe('tile placement', () => {
	test('finances a structurally valid store by borrowing its exact shortfall', () => {
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 202
		});
		const foundingTile = city.tiles.find(isTileBuildable)!;
		const base = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: foundingTile.id,
			seed: 202
		});
		const tile = city.tiles.find(
			(candidate) =>
				isTileBuildable(candidate) &&
				candidate.id !== foundingTile.id &&
				isRetailFootprintAvailable(city, candidate, base.stores)
		)!;
		const cost = forecastOpening(tile, 'boutique').setupCost;
		const game = { ...base, cash: cost - 250 };

		const result = financeRetailStoreOpening(game, {
			tileId: tile.id,
			archetypeId: 'boutique',
			expectedCost: cost
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.receipt.loanId).toBe('loan-2');
		expect(result.game.cash).toBe(0);
		expect(result.game.finance.loans.at(-1)).toMatchObject({
			purpose: 'expansion',
			originalPrincipal: 250
		});
		expect(result.game.stores).toHaveLength(base.stores.length + 1);
	});

	test('returns a null loan id for a cash-only retail opening', () => {
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 203
		});
		const foundingTile = city.tiles.find(isTileBuildable)!;
		const base = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: foundingTile.id,
			seed: 203
		});
		const tile = city.tiles.find(
			(candidate) =>
				isTileBuildable(candidate) &&
				candidate.id !== foundingTile.id &&
				isRetailFootprintAvailable(city, candidate, base.stores)
		)!;
		const cost = forecastOpening(tile, 'boutique').setupCost;
		const game = { ...base, cash: cost };

		const result = financeRetailStoreOpening(game, {
			tileId: tile.id,
			archetypeId: 'boutique',
			expectedCost: cost
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.receipt.loanId).toBeNull();
		expect(result.game.finance).toBe(game.finance);
		expect(result.game.stores).toHaveLength(base.stores.length + 1);
	});

	test('rejects a retail financing commit when the quoted tile cost has changed', () => {
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 202
		});
		const foundingTile = city.tiles.find(isTileBuildable)!;
		const base = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: foundingTile.id,
			seed: 202
		});
		const tile = city.tiles.find(
			(candidate) =>
				isTileBuildable(candidate) &&
				candidate.id !== foundingTile.id &&
				isRetailFootprintAvailable(city, candidate, base.stores)
		)!;
		const actualCost = forecastOpening(tile, 'boutique').setupCost;
		const game = { ...base, cash: 0 };

		const result = financeRetailStoreOpening(game, {
			tileId: tile.id,
			archetypeId: 'boutique',
			expectedCost: actualCost + 1
		});

		expect(result).toMatchObject({ ok: false, code: 'purchaseCostChanged' });
		if (!result.ok) expect(result.game).toBe(game);
		expect(game.stores).toHaveLength(base.stores.length);
		expect(game.finance).toBe(base.finance);
	});
	test('recommends archetypes from selected tile traits', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 77
		});
		const tile = city.tiles.find((candidate) => candidate.neighborhood === 'campus')!;

		const recommendations = getRecommendedArchetypes(tile);

		expect(recommendations.length).toBeGreaterThanOrEqual(2);
		expect(recommendations).toContain('electronics');
	});

	test('forecasts opening economics deterministically', () => {
		expect.assertions(4);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 77
		});
		const tile = city.tiles.find(isTileBuildable)!;
		const first = forecastOpening(tile, 'grocery');
		const second = forecastOpening(tile, 'grocery');

		expect(first).toEqual(second);
		expect(first.setupCost).toBeGreaterThan(0);
		expect(first.projectedDailyRent).toBe(tile.rent);
		expect(first.risks.length).toBeGreaterThanOrEqual(0);
	});

	test('keeps residential and commercial tiles buildable with setup cost premiums', () => {
		expect.assertions(6);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 303
		});
		const neutralTile = city.tiles.find(
			(tile) => isTileBuildable(tile) && tile.terrain === 'green'
		)!;
		const residentialTile = {
			...neutralTile,
			id: 'harbor-city-residential-premium',
			terrain: 'residential' as const,
			neighborhood: 'residential' as const
		};
		const commercialTile = {
			...neutralTile,
			id: 'harbor-city-commercial-premium',
			terrain: 'commercial' as const,
			neighborhood: 'mall' as const
		};

		expect(isTileBuildable(residentialTile)).toBe(true);
		expect(isTileBuildable(commercialTile)).toBe(true);
		expect(forecastOpening(residentialTile, 'grocery').setupCost).toBeGreaterThan(
			forecastOpening(neutralTile, 'grocery').setupCost
		);
		expect(forecastOpening(commercialTile, 'boutique').setupCost).toBeGreaterThan(
			forecastOpening(neutralTile, 'boutique').setupCost
		);
		// Pin the commercial > residential premium ordering so swapping the two
		// constants in TERRAIN_SETUP_COST_PREMIUM would fail the test.
		expect(forecastOpening(commercialTile, 'grocery').setupCost).toBeGreaterThan(
			forecastOpening(residentialTile, 'grocery').setupCost
		);
		expect(() =>
			createFoundingGameAtTile({
				archetypeId: 'grocery',
				city: createFootprintCity(city, residentialTile),
				tileId: residentialTile.id,
				seed: 303
			})
		).not.toThrow();
	});

	test('creates the founding game at the selected tile', () => {
		expect.assertions(8);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 101
		});
		const tile = city.tiles.find(isTileBuildable)!;

		const game = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: tile.id,
			seed: 101
		});

		expect(game.activeCityId).toBe(city.id);
		expect(game.cities).toHaveLength(1);
		expect(game.stores).toHaveLength(1);
		expect(game.stores[0]?.cityId).toBe(city.id);
		expect(game.stores[0]?.tileId).toBe(tile.id);
		expect(game.stores[0]?.mapX).toBe(tile.x);
		expect(game.stores[0]?.mapY).toBe(tile.y);
		expect(game.stores[0]?.localDemand).toBeGreaterThan(0);
	});

	test('blocks founding a store on a road tile', () => {
		expect.assertions(1);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 101
		});
		const roadTile = city.tiles.find((tile) => tile.feature === 'road')!;

		expect(() =>
			createFoundingGameAtTile({
				archetypeId: 'boutique',
				city,
				tileId: roadTile.id,
				seed: 101
			})
		).toThrow(`road: ${roadTile.id}`);
	});

	test('blocks founding a store on a river tile', () => {
		expect.assertions(1);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 101
		});
		const riverTile = city.tiles.find((tile) => tile.feature === 'river')!;

		expect(() =>
			createFoundingGameAtTile({
				archetypeId: 'grocery',
				city,
				tileId: riverTile.id,
				seed: 101
			})
		).toThrow(`river: ${riverTile.id}`);
	});

	test('blocks expansion on road and river tiles', () => {
		expect.assertions(4);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 202
		});
		const foundingTile = city.tiles.find(isTileBuildable)!;
		const roadTile = city.tiles.find((tile) => tile.feature === 'road')!;
		const riverTile = city.tiles.find((tile) => tile.feature === 'river')!;
		const game = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: foundingTile.id,
			seed: 202
		});

		const roadResult = openStoreAtTile(game, {
			tileId: roadTile.id,
			archetypeId: 'boutique'
		});
		const riverResult = openStoreAtTile(game, {
			tileId: riverTile.id,
			archetypeId: 'grocery'
		});

		expect(roadResult.stores).toHaveLength(1);
		expect(roadResult.decisions.at(-1)?.context).toEqual({
			code: 'locationBlocked',
			reason: 'road'
		});
		expect(riverResult.stores).toHaveLength(1);
		expect(riverResult.decisions.at(-1)?.context).toEqual({
			code: 'locationBlocked',
			reason: 'river'
		});
	});

	test('keeps same-day road and river blocked placement feedback separately', () => {
		expect.assertions(5);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 202
		});
		const foundingTile = city.tiles.find(isTileBuildable)!;
		const roadTile = city.tiles.find((tile) => tile.feature === 'road')!;
		const riverTile = city.tiles.find((tile) => tile.feature === 'river')!;
		const game = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: foundingTile.id,
			seed: 202
		});

		const roadResult = openStoreAtTile(game, {
			tileId: roadTile.id,
			archetypeId: 'boutique'
		});
		const duplicateRoadResult = openStoreAtTile(roadResult, {
			tileId: roadTile.id,
			archetypeId: 'boutique'
		});
		const riverResult = openStoreAtTile(duplicateRoadResult, {
			tileId: riverTile.id,
			archetypeId: 'grocery'
		});

		expect(riverResult.stores).toHaveLength(1);
		expect(duplicateRoadResult.decisions.map((decision) => decision.id)).toEqual([
			'location-unavailable-road-1'
		]);
		expect(riverResult.decisions.map((decision) => decision.id)).toEqual([
			'location-unavailable-road-1',
			'location-unavailable-river-1'
		]);
		expect(riverResult.decisions.map((decision) => decision.context)).toContainEqual({
			code: 'locationBlocked',
			reason: 'road'
		});
		expect(riverResult.decisions.map((decision) => decision.context)).toContainEqual({
			code: 'locationBlocked',
			reason: 'river'
		});
	});

	test('blocks opening on an occupied tile', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 101
		});
		const tile = city.tiles.find(isTileBuildable)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: tile.id,
			seed: 101
		});

		const result = openStoreAtTile(game, {
			tileId: tile.id,
			archetypeId: 'boutique'
		});

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.title).toBe('Location unavailable');
	});

	test('blocks expansion when the requested 2x2 footprint overlaps an existing store', () => {
		expect.assertions(2);
		const city = createFlatCity(4, 4);
		const game = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: 'retail-city-0-0',
			seed: 101
		});

		const result = openStoreAtTile(game, {
			tileId: 'retail-city-1-1',
			archetypeId: 'grocery'
		});

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.title).toBe('Location unavailable');
	});

	test('deducts the chosen archetype setup cost when opening at a tile', () => {
		expect.assertions(6);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 202
		});
		const foundingTile = city.tiles.find(isTileBuildable)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: foundingTile.id,
			seed: 202
		});
		const expansionTile = city.tiles.find(
			(candidate) =>
				isTileBuildable(candidate) &&
				candidate.id !== foundingTile.id &&
				isRetailFootprintAvailable(city, candidate, game.stores)
		)!;
		const forecast = forecastOpening(expansionTile, 'grocery');

		const result = openStoreAtTile(game, {
			tileId: expansionTile.id,
			archetypeId: 'grocery'
		});

		expect(result.stores).toHaveLength(2);
		expect(result.cash).toBe(game.cash - forecast.setupCost);
		expect(result.stores.at(-1)?.tileId).toBe(expansionTile.id);
		expect(result.stores.at(-1)?.archetypeId).toBe('grocery');
		expect(result.stores.at(-1)?.products.map((product) => product.categoryId)).toEqual([
			'produce'
		]);
		expect(result.decisions).toHaveLength(0);
	});

	test('forecastOpening flags a locked tile as a risk', () => {
		expect.assertions(1);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 202
		});
		const lockedTile = city.tiles.find((tile) => tile.locked)!;

		const forecast = forecastOpening(lockedTile, 'grocery');

		expect(forecast.risks).toContain('Location is locked');
	});

	test('createFoundingGameAtTile throws on an unknown tile id', () => {
		expect.assertions(1);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 202
		});

		expect(() =>
			createFoundingGameAtTile({
				archetypeId: 'boutique',
				city,
				tileId: 'no-such-tile',
				seed: 202
			})
		).toThrow('Unknown tile: no-such-tile');
	});

	test('createFoundingGameAtTile throws when the 2x2 footprint extends beyond the map edge', () => {
		expect.assertions(1);
		const city = createFlatCity(3, 3);
		const cornerTile = city.tiles.find((tile) => tile.x === 2 && tile.y === 2)!;

		expect(() =>
			createFoundingGameAtTile({
				archetypeId: 'boutique',
				city,
				tileId: cornerTile.id,
				seed: 202
			})
		).toThrow(`locked: ${cornerTile.id}`);
	});

	test('openStoreAtTile maps an occupied footprint to a null tile-placement reason', () => {
		expect.assertions(2);
		const city = createFlatCity(4, 4);
		const game = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: 'retail-city-0-0',
			seed: 101
		});
		const overlappingAnchor = city.tiles.find((tile) => tile.x === 1 && tile.y === 0)!;

		const result = openStoreAtTile(game, {
			tileId: overlappingAnchor.id,
			archetypeId: 'grocery'
		});

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.context).toEqual({ code: 'locationGeneric' });
	});

	test('openStoreAtTile appends a location-unavailable decision when the tile id is unknown', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 202
		});
		const foundingTile = city.tiles.find(isTileBuildable)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: foundingTile.id,
			seed: 202
		});

		const result = openStoreAtTile(game, {
			tileId: 'does-not-exist',
			archetypeId: 'boutique'
		});

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.title).toBe('Location unavailable');
	});

	test('openStoreAtTile returns the cash-blocked decision without placing a store when cash is insufficient', () => {
		expect.assertions(3);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 202
		});
		const foundingTile = city.tiles.find(isTileBuildable)!;
		const base = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: foundingTile.id,
			seed: 202
		});
		const expansionTile = city.tiles.find(
			(candidate) =>
				isTileBuildable(candidate) &&
				candidate.id !== foundingTile.id &&
				isRetailFootprintAvailable(city, candidate, base.stores)
		)!;
		const game = { ...base, cash: 0 };

		const result = openStoreAtTile(game, {
			tileId: expansionTile.id,
			archetypeId: 'boutique'
		});

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.id).toBe('expansion-cash-blocked-1');
		expect(result.decisions.at(-1)?.title).toBe('Expansion delayed');
	});
});

function createFlatCity(width: number, height: number): City {
	const tiles: CityTile[] = [];

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			tiles.push({
				id: `retail-city-${x}-${y}`,
				cityId: 'retail-city',
				x,
				y,
				neighborhood: 'downtown',
				terrain: 'commercial',
				feature: null,
				demand: 60,
				rent: 100,
				footTraffic: 60,
				customerFit: 60,
				locked: false
			});
		}
	}

	return {
		id: 'retail-city',
		name: 'Retail City',
		width,
		height,
		tiles
	};
}

function createFootprintCity(city: City, anchorTile: CityTile): City {
	return {
		...city,
		tiles: [
			anchorTile,
			createAdjacentTile(anchorTile, 1, 0),
			createAdjacentTile(anchorTile, 0, 1),
			createAdjacentTile(anchorTile, 1, 1)
		]
	};
}

function createAdjacentTile(anchorTile: CityTile, dx: number, dy: number): CityTile {
	return {
		...anchorTile,
		id: `${anchorTile.id}-footprint-${dx}-${dy}`,
		x: anchorTile.x + dx,
		y: anchorTile.y + dy
	};
}

function isRetailFootprintAvailable(
	city: City,
	tile: CityTile,
	stores: readonly Store[] = []
): boolean {
	const lookup = createCityTileLookup(city);
	const occupiedTileIds = getOccupiedStoreTileIds(city, stores, lookup);

	return getStoreFootprintPlacementBlockReason(lookup, tile, occupiedTileIds) === null;
}
