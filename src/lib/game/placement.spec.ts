import { describe, expect, test } from 'vitest';
import { generateCity, isTileBuildable } from './city';
import {
	createFoundingGameAtTile,
	forecastOpening,
	getRecommendedArchetypes,
	openStoreAtTile
} from './placement';

describe('tile placement', () => {
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
		).toThrow(`Road location: ${roadTile.id}`);
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
		).toThrow(`River location: ${riverTile.id}`);
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
			name: 'Road Store',
			archetypeId: 'boutique'
		});
		const riverResult = openStoreAtTile(game, {
			tileId: riverTile.id,
			name: 'River Store',
			archetypeId: 'grocery'
		});

		expect(roadResult.stores).toHaveLength(1);
		expect(roadResult.decisions.at(-1)?.context).toBe(
			'Road location blocks store placement. Choose another city tile.'
		);
		expect(riverResult.stores).toHaveLength(1);
		expect(riverResult.decisions.at(-1)?.context).toBe(
			'River location blocks store placement. Choose another city tile.'
		);
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
			name: 'Road Store',
			archetypeId: 'boutique'
		});
		const duplicateRoadResult = openStoreAtTile(roadResult, {
			tileId: roadTile.id,
			name: 'Second Road Store',
			archetypeId: 'boutique'
		});
		const riverResult = openStoreAtTile(duplicateRoadResult, {
			tileId: riverTile.id,
			name: 'River Store',
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
		expect(riverResult.decisions.map((decision) => decision.context)).toContain(
			'Road location blocks store placement. Choose another city tile.'
		);
		expect(riverResult.decisions.map((decision) => decision.context)).toContain(
			'River location blocks store placement. Choose another city tile.'
		);
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
			name: 'Duplicate Store',
			archetypeId: 'boutique'
		});

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.title).toBe('Location unavailable');
	});

	test('deducts the chosen archetype setup cost when opening at a tile', () => {
		expect.assertions(5);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 202
		});
		const foundingTile = city.tiles.find(isTileBuildable)!;
		const expansionTile = city.tiles.find(
			(candidate) => isTileBuildable(candidate) && candidate.id !== foundingTile.id
		)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: foundingTile.id,
			seed: 202
		});
		const forecast = forecastOpening(expansionTile, 'grocery');

		const result = openStoreAtTile(game, {
			tileId: expansionTile.id,
			name: 'Expansion Store',
			archetypeId: 'grocery'
		});

		expect(result.stores).toHaveLength(2);
		expect(result.cash).toBe(game.cash - forecast.setupCost);
		expect(result.stores.at(-1)?.tileId).toBe(expansionTile.id);
		expect(result.stores.at(-1)?.archetypeId).toBe('grocery');
		expect(result.decisions).toHaveLength(0);
	});
});
