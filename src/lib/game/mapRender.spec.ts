import { describe, expect, test } from 'vitest';
import { generateCity } from './city';
import { createFoundingGameAtTile } from './placement';
import { createCityMapSnapshot } from './mapRender';
import type { CityTile } from './types';

describe('city map render snapshot', () => {
	test('creates a serializable snapshot for the active city', () => {
		expect.assertions(9);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 9
		});
		const tile = city.tiles.find((candidate) => !candidate.locked)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: tile.id,
			seed: 9
		});

		const snapshot = createCityMapSnapshot(game, tile.id);

		expect(snapshot.cityId).toBe(city.id);
		expect(snapshot.width).toBe(20);
		expect(snapshot.height).toBe(20);
		expect(snapshot.tiles).toHaveLength(400);
		expect(snapshot.stores).toHaveLength(1);
		expect(snapshot.selectedTileId).toBe(tile.id);
		expect(snapshot.placementPreview).toBeNull();
		expect(snapshot.tiles.find((candidate) => candidate.id === tile.id)?.owned).toBe(true);
		expect(snapshot.tiles.find((candidate) => candidate.feature === 'road')?.feature).toBe('road');
	});

	test('returns an empty safe snapshot when the active city is missing', () => {
		expect.assertions(5);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 9
		});
		const tile = city.tiles.find((candidate) => !candidate.locked)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: tile.id,
			seed: 9
		});

		const snapshot = createCityMapSnapshot({ ...game, activeCityId: 'missing-city' }, null);

		expect(snapshot.cityId).toBe('missing-city');
		expect(snapshot.width).toBe(0);
		expect(snapshot.height).toBe(0);
		expect(snapshot.placementPreview).toBeNull();
		expect(snapshot.tiles).toHaveLength(0);
	});

	test('includes retail placement preview metadata when provided', () => {
		expect.assertions(4);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 9
		});
		const tile = city.tiles.find((candidate) => !candidate.locked && candidate.feature === null)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: tile.id,
			seed: 9
		});
		const placementPreview = {
			validTileIds: ['harbor-city-1-1'],
			invalidTileIds: ['harbor-city-10-6']
		};

		const snapshot = createCityMapSnapshot(game, null, placementPreview);
		const missingCitySnapshot = createCityMapSnapshot(
			{ ...game, activeCityId: 'missing-city' },
			null,
			placementPreview
		);

		expect(snapshot.placementPreview?.validTileIds).toEqual(['harbor-city-1-1']);
		expect(snapshot.placementPreview?.invalidTileIds).toEqual(['harbor-city-10-6']);
		expect(missingCitySnapshot.placementPreview).toEqual(placementPreview);
		expect(createCityMapSnapshot(game, null).placementPreview).toBeNull();
	});

	test('clones retail placement preview arrays at the snapshot boundary', () => {
		expect.assertions(4);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 9
		});
		const tile = city.tiles.find((candidate) => !candidate.locked && candidate.feature === null)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: tile.id,
			seed: 9
		});
		const placementPreview = {
			validTileIds: ['harbor-city-1-1'],
			invalidTileIds: ['harbor-city-10-6']
		};

		const snapshot = createCityMapSnapshot(game, null, placementPreview);
		const missingCitySnapshot = createCityMapSnapshot(
			{ ...game, activeCityId: 'missing-city' },
			null,
			placementPreview
		);
		placementPreview.validTileIds.push('harbor-city-2-2');
		placementPreview.invalidTileIds[0] = 'harbor-city-3-3';

		expect(snapshot.placementPreview?.validTileIds).toEqual(['harbor-city-1-1']);
		expect(snapshot.placementPreview?.invalidTileIds).toEqual(['harbor-city-10-6']);
		expect(missingCitySnapshot.placementPreview?.validTileIds).toEqual(['harbor-city-1-1']);
		expect(missingCitySnapshot.placementPreview?.invalidTileIds).toEqual(['harbor-city-10-6']);
	});

	test('marks generated road tiles with their render variant', () => {
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 9
		});
		const tile = city.tiles.find((candidate) => !candidate.locked && candidate.feature === null)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: tile.id,
			seed: 9
		});

		const snapshot = createCityMapSnapshot(game, null);

		expect(
			snapshot.tiles.find((candidate) => candidate.id === 'harbor-city-10-1')?.roadVariant
		).toBe('end-s');
		expect(
			snapshot.tiles.find((candidate) => candidate.id === 'harbor-city-11-10')?.roadVariant
		).toBe('horizontal');
		expect(
			snapshot.tiles.find((candidate) => candidate.id === 'harbor-city-10-10')?.roadVariant
		).toBe('intersection');
		expect(
			snapshot.tiles.find((candidate) => candidate.id === 'harbor-city-10-6')?.roadVariant
		).toBe('vertical');
		expect(snapshot.tiles.find((candidate) => candidate.id === tile.id)?.roadVariant).toBeNull();
	});

	test('marks generated river tiles with their render variant', () => {
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 9
		});
		const tile = city.tiles.find((candidate) => !candidate.locked && candidate.feature === null)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: tile.id,
			seed: 9
		});

		const snapshot = createCityMapSnapshot(game, null);

		expect(
			snapshot.tiles.find((candidate) => candidate.id === 'harbor-city-5-1')?.riverVariant
		).toBe('end-s');
		expect(
			snapshot.tiles.find((candidate) => candidate.id === 'harbor-city-5-6')?.riverVariant
		).toBe('corner-ne');
		expect(
			snapshot.tiles.find((candidate) => candidate.id === 'harbor-city-8-6')?.riverVariant
		).toBe('corner-sw');
		expect(snapshot.tiles.find((candidate) => candidate.id === tile.id)?.riverVariant).toBeNull();
	});

	test('marks tee-esw variant for road tiles with east, south, and west neighbors', () => {
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 9
		});
		const tile = city.tiles.find((candidate) => !candidate.locked && candidate.feature === null)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: tile.id,
			seed: 9
		});

		// Manually add road tiles to create tee-esw variant
		const modifiedCity = {
			...city,
			tiles: [
				...city.tiles,
				{
					id: 'road-tee-esw',
					x: 12,
					y: 12,
					cityId: city.id,
					neighborhood: 'downtown' as const,
					terrain: 'transit' as const,
					feature: 'road' as const,
					demand: 50,
					rent: 100,
					footTraffic: 60,
					customerFit: 70,
					locked: false
				},
				{
					id: 'road-tee-esw-e',
					x: 13,
					y: 12,
					cityId: city.id,
					neighborhood: 'downtown' as const,
					terrain: 'transit' as const,
					feature: 'road' as const,
					demand: 50,
					rent: 100,
					footTraffic: 60,
					customerFit: 70,
					locked: false
				},
				{
					id: 'road-tee-esw-s',
					x: 12,
					y: 13,
					cityId: city.id,
					neighborhood: 'downtown' as const,
					terrain: 'transit' as const,
					feature: 'road' as const,
					demand: 50,
					rent: 100,
					footTraffic: 60,
					customerFit: 70,
					locked: false
				},
				{
					id: 'road-tee-esw-w',
					x: 11,
					y: 12,
					cityId: city.id,
					neighborhood: 'downtown' as const,
					terrain: 'transit' as const,
					feature: 'road' as const,
					demand: 50,
					rent: 100,
					footTraffic: 60,
					customerFit: 70,
					locked: false
				}
			] as CityTile[]
		};

		const modifiedGame = { ...game, cities: [modifiedCity] };
		const snapshot = createCityMapSnapshot(modifiedGame, null);

		const teeEswTile = snapshot.tiles.find((candidate) => candidate.roadVariant === 'tee-esw');
		expect(teeEswTile).toBeDefined();
		expect(teeEswTile?.id).toBe('road-tee-esw');
	});

	test('marks tee-nsw variant for road tiles with north, south, and west neighbors', () => {
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 9
		});
		const tile = city.tiles.find((candidate) => !candidate.locked && candidate.feature === null)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: tile.id,
			seed: 9
		});

		// Manually add road tiles to create tee-nsw variant
		const modifiedCity = {
			...city,
			tiles: [
				...city.tiles,
				{
					id: 'road-tee-nsw',
					x: 5,
					y: 8,
					cityId: city.id,
					neighborhood: 'downtown' as const,
					terrain: 'transit' as const,
					feature: 'road' as const,
					demand: 50,
					rent: 100,
					footTraffic: 60,
					customerFit: 70,
					locked: false
				},
				{
					id: 'road-tee-nsw-n',
					x: 5,
					y: 7,
					cityId: city.id,
					neighborhood: 'downtown' as const,
					terrain: 'transit' as const,
					feature: 'road' as const,
					demand: 50,
					rent: 100,
					footTraffic: 60,
					customerFit: 70,
					locked: false
				},
				{
					id: 'road-tee-nsw-s',
					x: 5,
					y: 9,
					cityId: city.id,
					neighborhood: 'downtown' as const,
					terrain: 'transit' as const,
					feature: 'road' as const,
					demand: 50,
					rent: 100,
					footTraffic: 60,
					customerFit: 70,
					locked: false
				},
				{
					id: 'road-tee-nsw-w',
					x: 4,
					y: 8,
					cityId: city.id,
					neighborhood: 'downtown' as const,
					terrain: 'transit' as const,
					feature: 'road' as const,
					demand: 50,
					rent: 100,
					footTraffic: 60,
					customerFit: 70,
					locked: false
				}
			] as CityTile[]
		};

		const modifiedGame = { ...game, cities: [modifiedCity] };
		const snapshot = createCityMapSnapshot(modifiedGame, null);

		const teeNswTile = snapshot.tiles.find((candidate) => candidate.roadVariant === 'tee-nsw');
		expect(teeNswTile).toBeDefined();
		expect(teeNswTile?.id).toBe('road-tee-nsw');
	});

	test('marks tee-new variant for road tiles with north, east, and west neighbors', () => {
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 9
		});
		const tile = city.tiles.find((candidate) => !candidate.locked && candidate.feature === null)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: tile.id,
			seed: 9
		});

		// Manually add road tiles to create tee-new variant
		const modifiedCity = {
			...city,
			tiles: [
				...city.tiles,
				{
					id: 'road-tee-new',
					x: 16,
					y: 16,
					cityId: city.id,
					neighborhood: 'downtown' as const,
					terrain: 'transit' as const,
					feature: 'road' as const,
					demand: 50,
					rent: 100,
					footTraffic: 60,
					customerFit: 70,
					locked: false
				},
				{
					id: 'road-tee-new-n',
					x: 16,
					y: 15,
					cityId: city.id,
					neighborhood: 'downtown' as const,
					terrain: 'transit' as const,
					feature: 'road' as const,
					demand: 50,
					rent: 100,
					footTraffic: 60,
					customerFit: 70,
					locked: false
				},
				{
					id: 'road-tee-new-e',
					x: 17,
					y: 16,
					cityId: city.id,
					neighborhood: 'downtown' as const,
					terrain: 'transit' as const,
					feature: 'road' as const,
					demand: 50,
					rent: 100,
					footTraffic: 60,
					customerFit: 70,
					locked: false
				},
				{
					id: 'road-tee-new-w',
					x: 15,
					y: 16,
					cityId: city.id,
					neighborhood: 'downtown' as const,
					terrain: 'transit' as const,
					feature: 'road' as const,
					demand: 50,
					rent: 100,
					footTraffic: 60,
					customerFit: 70,
					locked: false
				}
			] as CityTile[]
		};

		const modifiedGame = { ...game, cities: [modifiedCity] };
		const snapshot = createCityMapSnapshot(modifiedGame, null);

		const teeNewTile = snapshot.tiles.find((candidate) => candidate.roadVariant === 'tee-new');
		expect(teeNewTile).toBeDefined();
		expect(teeNewTile?.id).toBe('road-tee-new');
	});
});
