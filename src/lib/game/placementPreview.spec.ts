import { describe, expect, test } from 'vitest';
import { generateCity } from './city';
import { getIndustryTilesByResource } from './industry';
import {
	createIndustryPlacementPreview,
	createRetailPlacementPreview,
	getIndustryBuildPlacementBlockReason,
	getRetailBuildMenuOptions,
	getRetailPlacementBlockReason,
	resolveIndustryPlacementAnchorTileId,
	resolveRetailPlacementAnchorTileId
} from './placementPreview';
import { createFoundingGameAtTile, forecastOpening } from './placement';
import { createNewGame } from './state';
import {
	createCityTileLookup,
	getOccupiedStoreTileIds,
	getStoreFootprintPlacementBlockReason
} from './storeFootprint';
import type { City, CityTile, Store } from './types';

describe('retail placement preview', () => {
	test('marks every retail tile as valid or invalid before founding', () => {
		expect.assertions(5);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 20260503
		});
		const openTile = city.tiles.find((tile) => !tile.locked && tile.feature === null)!;
		const roadTile = city.tiles.find((tile) => tile.feature === 'road')!;

		const preview = createRetailPlacementPreview({
			game: null,
			city,
			archetypeId: 'boutique'
		});

		expect(preview.validTileIds).toContain(openTile.id);
		expect(preview.invalidTileIds).toContain(roadTile.id);
		expect(preview.validTileIds.length + preview.invalidTileIds.length).toBe(city.tiles.length);
		expect(
			getRetailPlacementBlockReason({
				game: null,
				city,
				tileId: openTile.id,
				archetypeId: 'boutique'
			})
		).toBeNull();
		expect(
			getRetailPlacementBlockReason({
				game: null,
				city,
				tileId: roadTile.id,
				archetypeId: 'boutique'
			})
		).toBe('Road location');
	});

	test('blocks occupied retail tiles, max store count, unaffordable expansion tiles, and unknown tiles', () => {
		expect.assertions(6);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 20260503
		});
		const buildableTiles = city.tiles.filter((tile) => isRetailFootprintAvailable(city, tile));
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: buildableTiles[0]!.id,
			seed: 20260503
		});
		const expansionTile = buildableTiles.find((tile) =>
			isRetailFootprintAvailable(city, tile, game.stores)
		)!;
		const expansionSetupCost = forecastOpening(expansionTile, 'electronics').setupCost;
		const cappedGame = {
			...game,
			stores: Array.from({ length: game.storeCap }, (_, index) => ({
				...game.stores[0]!,
				id: `store-${index + 1}`,
				tileId: `cap-store-${index + 1}`,
				mapX: -100 - index,
				mapY: -100
			}))
		};

		expect(game.storeCap).toBeGreaterThan(1);
		expect(
			getRetailPlacementBlockReason({
				game,
				city,
				tileId: buildableTiles[0]!.id,
				archetypeId: 'electronics'
			})
		).toBe('Occupied location');
		expect(
			getRetailPlacementBlockReason({
				game: { ...game, cash: 0 },
				city,
				tileId: expansionTile.id,
				archetypeId: 'electronics'
			})
		).toBe(`Requires ${expansionSetupCost.toLocaleString('en-US')} cash`);
		expect(
			getRetailPlacementBlockReason({
				game: cappedGame,
				city,
				tileId: buildableTiles[game.storeCap]!.id,
				archetypeId: 'grocery'
			})
		).toBe('Store limit reached');
		expect(
			createRetailPlacementPreview({ game: cappedGame, city, archetypeId: 'grocery' }).validTileIds
		).toHaveLength(0);
		expect(
			getRetailPlacementBlockReason({
				game,
				city,
				tileId: 'missing-tile',
				archetypeId: 'grocery'
			})
		).toBe('Unknown city tile');
	});

	test('blocks retail placement when any tile in the 2x2 footprint is occupied', () => {
		expect.assertions(3);
		const city = createFlatCity(4, 4);
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: 'retail-city-0-0',
			seed: 20260503
		});

		const overlappingAnchor = city.tiles.find((tile) => tile.id === 'retail-city-1-1')!;
		const openAnchor = city.tiles.find((tile) => tile.id === 'retail-city-2-2')!;
		const preview = createRetailPlacementPreview({
			game,
			city,
			archetypeId: 'boutique'
		});

		expect(
			getRetailPlacementBlockReason({
				game,
				city,
				tileId: overlappingAnchor.id,
				archetypeId: 'boutique'
			})
		).toBe('Occupied location');
		expect(preview.invalidTileIds).toContain(overlappingAnchor.id);
		expect(preview.validTileIds).toContain(openAnchor.id);
	});

	test('blocks retail placement when the 2x2 footprint leaves the city', () => {
		expect.assertions(2);
		const city = createFlatCity(3, 3);
		const edgeAnchor = city.tiles.find((tile) => tile.id === 'retail-city-2-2')!;
		const preview = createRetailPlacementPreview({
			game: null,
			city,
			archetypeId: 'grocery'
		});

		expect(
			getRetailPlacementBlockReason({
				game: null,
				city,
				tileId: edgeAnchor.id,
				archetypeId: 'grocery'
			})
		).toBe('Locked location');
		expect(preview.invalidTileIds).toContain(edgeAnchor.id);
	});

	test('summarizes retail build menu options as tile-derived ranges', () => {
		expect.assertions(5);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 20260503
		});
		const validTiles = city.tiles.filter(
			(tile) =>
				getRetailPlacementBlockReason({
					game: null,
					city,
					tileId: tile.id,
					archetypeId: 'boutique'
				}) === null
		);
		const forecasts = validTiles.map((tile) => forecastOpening(tile, 'boutique'));
		const setupCosts = forecasts.map((forecast) => forecast.setupCost);
		const projectedDailyRevenue = forecasts.map((forecast) => forecast.projectedDailyRevenue);

		const options = getRetailBuildMenuOptions({ game: null, city });
		const boutique = options.find((option) => option.archetypeId === 'boutique')!;

		expect(options).toHaveLength(4);
		expect(boutique.validTileCount).toBe(validTiles.length);
		expect(boutique.setupCostRange).toEqual({
			min: Math.min(...setupCosts),
			max: Math.max(...setupCosts)
		});
		expect(boutique.projectedDailyRevenueRange).toEqual({
			min: Math.min(...projectedDailyRevenue),
			max: Math.max(...projectedDailyRevenue)
		});
		expect(boutique.disabledReason).toBeNull();
	});

	test('does not rescan the retail city tiles while building preview summaries', () => {
		expect.assertions(1);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 56,
			height: 48,
			seed: 20260503
		});
		const tiles = [...city.tiles];
		let findCalls = 0;
		const originalFind = tiles.find.bind(tiles);
		const instrumentedFind = ((
			predicate: (value: CityTile, index: number, obj: CityTile[]) => unknown,
			thisArg?: unknown
		) => {
			findCalls += 1;
			return originalFind(predicate, thisArg);
		}) as typeof tiles.find;
		tiles.find = instrumentedFind;
		const instrumentedCity = { ...city, tiles };
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city: instrumentedCity,
			tileId: tiles.find((tile) => !tile.locked && tile.feature === null)!.id,
			seed: 20260503
		});
		findCalls = 0;

		getRetailBuildMenuOptions({ game, city: instrumentedCity });
		createRetailPlacementPreview({
			game,
			city: instrumentedCity,
			archetypeId: 'boutique'
		});

		expect(findCalls).toBe(0);
	});

	test('disables retail build menu options when no tile can accept another store', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 20260503
		});
		const buildableTiles = city.tiles.filter((tile) => !tile.locked && tile.feature === null);
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: buildableTiles[0]!.id,
			seed: 20260503
		});
		const cappedGame = {
			...game,
			stores: Array.from({ length: game.storeCap }, (_, index) => ({
				...game.stores[0]!,
				id: `store-${index + 1}`,
				tileId: buildableTiles[index]!.id
			}))
		};

		const options = getRetailBuildMenuOptions({ game: cappedGame, city });

		expect(options.map((option) => option.validTileCount)).toEqual([0, 0, 0, 0]);
		expect(options.map((option) => option.disabledReason)).toEqual([
			'Store limit reached',
			'Store limit reached',
			'Store limit reached',
			'Store limit reached'
		]);
	});

	test('uses the cheapest cash blocker when build menu options only fail affordability', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 20260503
		});
		const foundingTile = city.tiles.find((tile) => isRetailFootprintAvailable(city, tile))!;
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: foundingTile.id,
			seed: 20260503
		});
		const availableTiles = city.tiles.filter(
			(tile) => tile.id !== foundingTile.id && isRetailFootprintAvailable(city, tile, game.stores)
		);
		const cheapestElectronicsSetupCost = Math.min(
			...availableTiles.map((tile) => forecastOpening(tile, 'electronics').setupCost)
		);

		const electronicsOption = getRetailBuildMenuOptions({
			game: { ...game, cash: 0 },
			city
		}).find((option) => option.archetypeId === 'electronics')!;

		expect(electronicsOption.validTileCount).toBe(0);
		expect(electronicsOption.disabledReason).toBe(
			`Requires ${cheapestElectronicsSetupCost.toLocaleString('en-US')} cash`
		);
	});

	test('reports occupied-location disabled reason when every buildable tile is taken but storeCap remains', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 20260503
		});
		const buildableTiles = city.tiles.filter((tile) => !tile.locked && tile.feature === null);
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: buildableTiles[0]!.id,
			seed: 20260503
		});
		const filledGame = {
			...game,
			cash: 10_000_000,
			storeCap: buildableTiles.length + 1,
			stores: buildableTiles.map((tile, index) => ({
				...game.stores[0]!,
				id: `store-${index + 1}`,
				tileId: tile.id
			}))
		};

		const options = getRetailBuildMenuOptions({ game: filledGame, city });

		expect(options.map((option) => option.validTileCount)).toEqual([0, 0, 0, 0]);
		expect(options.map((option) => option.disabledReason)).toEqual([
			'Occupied location',
			'Occupied location',
			'Occupied location',
			'Occupied location'
		]);
	});

	test('falls back to no-valid-tiles reason when the city has no tiles', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 20260503
		});
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: city.tiles.find((tile) => !tile.locked && tile.feature === null)!.id,
			seed: 20260503
		});
		const emptyCity = { ...city, tiles: [] };

		const options = getRetailBuildMenuOptions({ game, city: emptyCity });

		expect(options.map((option) => option.validTileCount)).toEqual([0, 0, 0, 0]);
		expect(options.map((option) => option.disabledReason)).toEqual([
			'No valid tiles',
			'No valid tiles',
			'No valid tiles',
			'No valid tiles'
		]);
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

function isRetailFootprintAvailable(
	city: City,
	tile: CityTile,
	stores: readonly Store[] = []
): boolean {
	const lookup = createCityTileLookup(city);
	const occupiedTileIds = getOccupiedStoreTileIds(city, stores, lookup);

	return getStoreFootprintPlacementBlockReason(lookup, tile, occupiedTileIds) === null;
}

describe('industry placement preview', () => {
	test('marks matching resource tiles valid for raw producers', () => {
		expect.assertions(5);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const saltTile = getIndustryTilesByResource(city, 'salt-deposit')[0]!;

		const preview = createIndustryPlacementPreview({
			game,
			buildingTypeId: 'grain-farm'
		});

		expect(preview.validTileIds).toContain(grainTile.id);
		expect(preview.invalidTileIds).toContain(saltTile.id);
		expect(preview.validTileIds.length + preview.invalidTileIds.length).toBe(city.tiles.length);
		expect(
			getIndustryBuildPlacementBlockReason({
				game,
				tileId: grainTile.id,
				buildingTypeId: 'grain-farm'
			})
		).toBeNull();
		expect(
			getIndustryBuildPlacementBlockReason({
				game,
				tileId: saltTile.id,
				buildingTypeId: 'grain-farm'
			})
		).toBe('Requires grain field');
	});

	test('blocks industry construction before retail founding, on locked tiles, and when cash is short', () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260512);
		const city = game.industryCities[0]!;
		const lockedTile = city.tiles.find((tile) => tile.locked)!;
		const industrialTile = city.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;

		expect(createIndustryPlacementPreview({ game: null, buildingTypeId: 'warehouse' })).toEqual({
			validTileIds: [],
			invalidTileIds: []
		});
		expect(
			getIndustryBuildPlacementBlockReason({
				game: null,
				tileId: industrialTile.id,
				buildingTypeId: 'warehouse'
			})
		).toBe('Found a retail store to unlock construction.');
		expect(
			getIndustryBuildPlacementBlockReason({
				game,
				tileId: lockedTile.id,
				buildingTypeId: 'warehouse'
			})
		).toBe('Locked industrial tile');
		expect(
			getIndustryBuildPlacementBlockReason({
				game: { ...game, cash: 0 },
				tileId: industrialTile.id,
				buildingTypeId: 'warehouse'
			})
		).toBe('Warehouse requires 1,000 cash.');
	});

	test('marks non-industrial tiles invalid for buildings that require industrial terrain', () => {
		expect.assertions(4);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const nonIndustrialTile = city.tiles.find(
			(tile) => !tile.locked && tile.terrain !== 'industrial'
		)!;
		const industrialTile = city.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;

		const preview = createIndustryPlacementPreview({
			game,
			buildingTypeId: 'warehouse'
		});

		expect(preview.invalidTileIds).toContain(nonIndustrialTile.id);
		expect(preview.validTileIds).toContain(industrialTile.id);
		expect(
			getIndustryBuildPlacementBlockReason({
				game,
				tileId: nonIndustrialTile.id,
				buildingTypeId: 'warehouse'
			})
		).toBe('Requires industrial tile');
		expect(
			getIndustryBuildPlacementBlockReason({
				game,
				tileId: industrialTile.id,
				buildingTypeId: 'warehouse'
			})
		).toBeNull();
	});
});

describe('resolveRetailPlacementAnchorTileId', () => {
	test('returns the clicked tile id when it is itself a valid anchor', () => {
		expect.assertions(1);
		const city = createFlatCity(4, 4);
		const preview = createRetailPlacementPreview({
			game: null,
			city,
			archetypeId: 'boutique'
		});
		// (1,1) is an interior anchor whose 2x2 footprint fits in a 4x4 city.
		const interiorAnchor = city.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;

		expect(resolveRetailPlacementAnchorTileId(preview, city, interiorAnchor.id)).toBe(
			interiorAnchor.id
		);
	});

	test('resolves a non-anchor edge cell to a valid anchor whose footprint contains it', () => {
		expect.assertions(3);
		const city = createFlatCity(4, 4);
		const preview = createRetailPlacementPreview({
			game: null,
			city,
			archetypeId: 'boutique'
		});
		// (3,1) cannot be an anchor (its footprint extends to x=4, off-map), but
		// it sits inside the footprints of valid anchors (2,0) and (2,1). The
		// helper must return one of those valid anchors, not the clicked cell.
		const clickedEdgeCell = city.tiles.find((tile) => tile.x === 3 && tile.y === 1)!;

		expect(preview.validTileIds).not.toContain(clickedEdgeCell.id);
		const resolved = resolveRetailPlacementAnchorTileId(preview, city, clickedEdgeCell.id);
		expect(preview.validTileIds).toContain(resolved);
		const resolvedTile = city.tiles.find((tile) => tile.id === resolved)!;
		expect(
			clickedEdgeCell.x >= resolvedTile.x &&
				clickedEdgeCell.x < resolvedTile.x + 2 &&
				clickedEdgeCell.y >= resolvedTile.y &&
				clickedEdgeCell.y < resolvedTile.y + 2
		).toBe(true);
	});

	test('returns the clicked tile id when the cell is not inside any valid footprint', () => {
		expect.assertions(1);
		const city = createFlatCity(4, 4);
		// Make (2,0) a road so anchors (2,0) and (1,0) become invalid (their
		// footprints contain the road). Now (3,0) is not covered by any valid
		// anchor: the only anchors that could cover it are (2,0) [invalid] and
		// (3,0) [off-map], so the clicked cell is returned unchanged.
		const roadTile = city.tiles.find((tile) => tile.x === 2 && tile.y === 0)!;
		roadTile.feature = 'road';
		const preview = createRetailPlacementPreview({
			game: null,
			city,
			archetypeId: 'boutique'
		});
		const uncoveredCell = city.tiles.find((tile) => tile.x === 3 && tile.y === 0)!;

		expect(resolveRetailPlacementAnchorTileId(preview, city, uncoveredCell.id)).toBe(
			uncoveredCell.id
		);
	});

	test('returns the clicked tile id unchanged when the tile is unknown', () => {
		expect.assertions(1);
		const city = createFlatCity(4, 4);
		const preview = createRetailPlacementPreview({
			game: null,
			city,
			archetypeId: 'boutique'
		});

		expect(resolveRetailPlacementAnchorTileId(preview, city, 'does-not-exist')).toBe(
			'does-not-exist'
		);
	});
});

describe('resolveIndustryPlacementAnchorTileId', () => {
	test('returns the clicked tile id when it is itself a valid anchor', () => {
		expect.assertions(1);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const preview = createIndustryPlacementPreview({ game, buildingTypeId: 'warehouse' });
		const validAnchor = city.tiles.find((tile) => preview.validTileIds.includes(tile.id))!;

		expect(resolveIndustryPlacementAnchorTileId(preview, city, validAnchor.id)).toBe(
			validAnchor.id
		);
	});

	test('returns the clicked tile id unchanged when the tile is unknown', () => {
		expect.assertions(1);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const preview = createIndustryPlacementPreview({ game, buildingTypeId: 'warehouse' });

		expect(resolveIndustryPlacementAnchorTileId(preview, city, 'does-not-exist')).toBe(
			'does-not-exist'
		);
	});
});
