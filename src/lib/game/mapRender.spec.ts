import { describe, expect, test } from 'vitest';
import { generateCity } from './city';
import { createFoundingGameAtTile } from './placement';
import { createCityMapSnapshot } from './mapRender';

describe('city map render snapshot', () => {
	test('creates a serializable snapshot for the active city', () => {
		expect.assertions(7);
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
		expect(snapshot.tiles.find((candidate) => candidate.id === tile.id)?.owned).toBe(true);
	});

	test('returns an empty safe snapshot when the active city is missing', () => {
		expect.assertions(4);
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
		expect(snapshot.tiles).toHaveLength(0);
	});
});
