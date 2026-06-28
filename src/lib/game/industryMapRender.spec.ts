import { describe, expect, test } from 'vitest';
import { DEFAULT_RETAIL_CITY_HEIGHT, DEFAULT_RETAIL_CITY_WIDTH } from './city';
import { getIndustryTilesByResource } from './industry';
import { buildIndustrialBuilding } from './industryPlacement';
import { createIndustryMapSnapshot } from './industryMapRender';
import { createNewGame } from './state';

describe('industry map render snapshot', () => {
	test('creates a serializable snapshot for the active industry city', () => {
		expect.assertions(9);
		const game = createNewGame('convenience', 20260512);
		const city = game.industryCities[0]!;
		const tile = city.tiles.find((candidate) => !candidate.locked)!;

		const snapshot = createIndustryMapSnapshot(game, tile.id);

		expect(snapshot.cityId).toBe(city.id);
		expect(snapshot.width).toBe(DEFAULT_RETAIL_CITY_WIDTH);
		expect(snapshot.height).toBe(DEFAULT_RETAIL_CITY_HEIGHT);
		expect(snapshot.tiles).toHaveLength(DEFAULT_RETAIL_CITY_WIDTH * DEFAULT_RETAIL_CITY_HEIGHT);
		expect(snapshot.selectedTileId).toBe(tile.id);
		expect(snapshot.placementPreview).toBeNull();
		expect(snapshot.tiles.find((candidate) => candidate.id === tile.id)?.selected).toBe(true);
		expect(snapshot.buildings).toHaveLength(0);
		expect(snapshot.tiles.find((candidate) => candidate.id === tile.id)?.occupied).toBe(false);
	});

	test('returns an empty safe snapshot when the active industry city is missing', () => {
		expect.assertions(6);
		const game = createNewGame('convenience', 20260512);

		const snapshot = createIndustryMapSnapshot(
			{ ...game, activeIndustryCityId: 'missing-industry-city' },
			null
		);

		expect(snapshot.cityId).toBe('missing-industry-city');
		expect(snapshot.width).toBe(0);
		expect(snapshot.height).toBe(0);
		expect(snapshot.placementPreview).toBeNull();
		expect(snapshot.tiles).toHaveLength(0);
		expect(snapshot.buildings).toHaveLength(0);
	});

	test('includes industry placement preview metadata when provided', () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260512);
		const placementPreview = {
			validTileIds: ['industry-city-1-1'],
			invalidTileIds: ['industry-city-1-4']
		};

		const snapshot = createIndustryMapSnapshot(game, null, placementPreview);
		const missingCitySnapshot = createIndustryMapSnapshot(
			{ ...game, activeIndustryCityId: 'missing-industry-city' },
			null,
			placementPreview
		);

		expect(snapshot.placementPreview?.validTileIds).toEqual(['industry-city-1-1']);
		expect(snapshot.placementPreview?.invalidTileIds).toEqual(['industry-city-1-4']);
		expect(missingCitySnapshot.placementPreview).toEqual(placementPreview);
		expect(createIndustryMapSnapshot(game, null).placementPreview).toBeNull();
	});

	test('clones industry placement preview arrays at the snapshot boundary', () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260512);
		const placementPreview = {
			validTileIds: ['industry-city-1-1'],
			invalidTileIds: ['industry-city-1-4']
		};

		const snapshot = createIndustryMapSnapshot(game, null, placementPreview);
		const missingCitySnapshot = createIndustryMapSnapshot(
			{ ...game, activeIndustryCityId: 'missing-industry-city' },
			null,
			placementPreview
		);
		placementPreview.validTileIds.push('industry-city-2-2');
		placementPreview.invalidTileIds[0] = 'industry-city-3-3';

		expect(snapshot.placementPreview?.validTileIds).toEqual(['industry-city-1-1']);
		expect(snapshot.placementPreview?.invalidTileIds).toEqual(['industry-city-1-4']);
		expect(missingCitySnapshot.placementPreview?.validTileIds).toEqual(['industry-city-1-1']);
		expect(missingCitySnapshot.placementPreview?.invalidTileIds).toEqual(['industry-city-1-4']);
	});

	test('marks 2x2 occupied footprint tiles and renders active city buildings', () => {
		expect.assertions(9);
		const baseGame = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = baseGame.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const game = buildIndustrialBuilding(baseGame, {
			tileId: grainTile.id,
			buildingTypeId: 'grain-farm'
		});

		const snapshot = createIndustryMapSnapshot(game, grainTile.id);
		const building = snapshot.buildings[0]!;
		const occupiedTileIds = snapshot.tiles
			.filter((candidate) => candidate.occupied)
			.map((candidate) => candidate.id)
			.sort();

		expect(occupiedTileIds).toEqual(
			[
				`${city.id}-${grainTile.x}-${grainTile.y}`,
				`${city.id}-${grainTile.x + 1}-${grainTile.y}`,
				`${city.id}-${grainTile.x}-${grainTile.y + 1}`,
				`${city.id}-${grainTile.x + 1}-${grainTile.y + 1}`
			].sort()
		);
		expect(building.id).toBe('industry-building-1');
		expect(building.name).toBe('Grain Farm');
		expect(building.typeId).toBe('grain-farm');
		expect(building.tileId).toBe(grainTile.id);
		expect(building.x).toBe(grainTile.x);
		expect(building.y).toBe(grainTile.y);
		expect(building).toMatchObject({ width: 2, height: 2 });
		expect(building.status).toBe('idle');
	});
});
