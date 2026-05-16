import { describe, expect, test } from 'vitest';
import { generateCity } from './city';
import { createFoundingGameAtTile } from './placement';
import { createCityMapSnapshot } from './mapRender';

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
		).toBe('vertical');
		expect(
			snapshot.tiles.find((candidate) => candidate.id === 'harbor-city-1-10')?.roadVariant
		).toBe('horizontal');
		expect(
			snapshot.tiles.find((candidate) => candidate.id === 'harbor-city-10-10')?.roadVariant
		).toBe('intersection');
		expect(snapshot.tiles.find((candidate) => candidate.id === tile.id)?.roadVariant).toBeNull();
	});
});
