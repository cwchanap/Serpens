import { describe, expect, test } from 'vitest';
import { generateCity } from './city';
import { createFoundingGameAtTile } from './placement';
import { createCityMapSnapshot } from './mapRender';
import type { City, CityTile } from './types';

describe('city map render snapshot', () => {
	test('creates a serializable snapshot for the active city', () => {
		expect.assertions(12);
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
		expect(snapshot.stores[0]?.width).toBe(2);
		expect(snapshot.stores[0]?.height).toBe(2);
		expect(snapshot.competitors.length).toBe(2);
	});

	test('renders only active rivals in the current retail city without changing ownership', () => {
		expect.assertions(6);
		const city = createFlatCity(8, 8);
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: 'retail-city-0-0',
			seed: 9
		});
		const cityCompetitors = game.competitors.map((competitor) => ({
			...competitor,
			cityId: city.id as typeof competitor.cityId
		}));
		const [activeRival, closedRival] = cityCompetitors;
		if (!activeRival || !closedRival) throw new Error('expected starter rivals');

		const snapshot = createCityMapSnapshot(
			{
				...game,
				competitors: [
					{ ...activeRival, status: 'active' },
					{ ...closedRival, status: 'closed' },
					{ ...activeRival, id: 'other-city-rival', cityId: 'campus-junction' }
				]
			},
			null
		);

		expect(snapshot.competitors).toEqual([
			{
				id: activeRival.id,
				name: activeRival.name,
				archetypeId: activeRival.archetypeId,
				x: activeRival.location.x,
				y: activeRival.location.y
			}
		]);
		expect(snapshot.competitors).toHaveLength(1);
		expect(snapshot.stores).toHaveLength(1);
		expect(snapshot.tiles.filter((tile) => tile.owned)).toHaveLength(4);
		expect(snapshot.selectedTileId).toBeNull();
		expect(snapshot.placementPreview).toBeNull();
	});

	test('marks every tile in a retail store footprint as owned', () => {
		expect.assertions(1);
		const city = createFlatCity(4, 4);
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: 'retail-city-0-0',
			seed: 9
		});

		const snapshot = createCityMapSnapshot(game, null);

		expect(
			snapshot.tiles
				.filter((tile) => tile.owned)
				.map((tile) => tile.id)
				.sort()
		).toEqual(['retail-city-0-0', 'retail-city-0-1', 'retail-city-1-0', 'retail-city-1-1']);
	});

	test('returns an empty safe snapshot when the active city is missing', () => {
		expect.assertions(6);
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
		expect(snapshot.competitors).toHaveLength(0);
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
		expect.assertions(2);
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
		expect.assertions(2);
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
		expect.assertions(2);
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

	test('determines road render variants for isolated and end pieces', () => {
		expect.assertions(4);
		expect(roadVariantOf([])).toBe('isolated');
		expect(roadVariantOf(['n'])).toBe('end-n');
		expect(roadVariantOf(['e'])).toBe('end-e');
		expect(roadVariantOf(['w'])).toBe('end-w');
	});

	test('determines road render variants for corner pieces', () => {
		expect.assertions(3);
		expect(roadVariantOf(['n', 'e'])).toBe('corner-ne');
		expect(roadVariantOf(['e', 's'])).toBe('corner-es');
		expect(roadVariantOf(['w', 'n'])).toBe('corner-wn');
	});

	test('determines road render variant for tee-nes', () => {
		expect.assertions(1);
		expect(roadVariantOf(['n', 'e', 's'])).toBe('tee-nes');
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

type Direction = 'n' | 'e' | 's' | 'w';

function roadVariantOf(directions: Direction[]): string | null {
	return featureRenderVariantForDirections('road', directions);
}

function featureRenderVariantForDirections(
	feature: CityTile['feature'] & string,
	directions: Direction[]
): string | null {
	const centerX = 1;
	const centerY = 1;
	const cityId = 'variant-test-city';

	const tiles: CityTile[] = [makeFeatureTile(centerX, centerY, 'center', cityId, feature)];

	const offsets: Record<Direction, { dx: number; dy: number }> = {
		n: { dx: 0, dy: -1 },
		e: { dx: 1, dy: 0 },
		s: { dx: 0, dy: 1 },
		w: { dx: -1, dy: 0 }
	};

	for (const direction of directions) {
		const { dx, dy } = offsets[direction];
		tiles.push(
			makeFeatureTile(centerX + dx, centerY + dy, `${direction}-neighbor`, cityId, feature)
		);
	}

	const snapshot = createCityMapSnapshot(
		{
			cities: [{ id: cityId, name: 'Test', width: 3, height: 3, tiles }] as City[],
			stores: [],
			competitors: [],
			activeCityId: cityId
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any,
		null
	);

	const centerTile = snapshot.tiles.find((tile) => tile.id === 'center');
	return feature === 'river'
		? (centerTile?.riverVariant ?? null)
		: (centerTile?.roadVariant ?? null);
}

function makeFeatureTile(
	x: number,
	y: number,
	id: string,
	cityId: string,
	feature: CityTile['feature'] & string
): CityTile {
	return {
		id,
		x,
		y,
		cityId,
		neighborhood: 'downtown' as const,
		terrain: 'transit' as const,
		feature: feature as CityTile['feature'],
		demand: 50,
		rent: 100,
		footTraffic: 60,
		customerFit: 70,
		locked: false
	};
}
