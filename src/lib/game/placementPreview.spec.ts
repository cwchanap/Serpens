import { describe, expect, test } from 'vitest';
import { generateCity } from './city';
import { getIndustryTilesByResource } from './industry';
import {
	createIndustryPlacementPreview,
	createRetailPlacementPreview,
	getIndustryBuildPlacementBlockReason,
	getRetailBuildMenuOptions,
	getRetailPlacementBlockReason
} from './placementPreview';
import { createFoundingGameAtTile, forecastOpening } from './placement';
import { createNewGame } from './state';
import { MAX_STORES } from './types';

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
		expect.assertions(5);
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
		const expansionTile = buildableTiles[1]!;
		const expansionSetupCost = forecastOpening(expansionTile, 'electronics').setupCost;
		const cappedGame = {
			...game,
			stores: Array.from({ length: MAX_STORES }, (_, index) => ({
				...game.stores[0]!,
				id: `store-${index + 1}`,
				tileId: buildableTiles[index]!.id
			}))
		};

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
				tileId: buildableTiles[MAX_STORES]!.id,
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
			stores: Array.from({ length: MAX_STORES }, (_, index) => ({
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
		const foundingTile = city.tiles.find((tile) => !tile.locked && tile.feature === null)!;
		const game = createFoundingGameAtTile({
			archetypeId: 'convenience',
			city,
			tileId: foundingTile.id,
			seed: 20260503
		});
		const availableTiles = city.tiles.filter(
			(tile) => !tile.locked && tile.feature === null && tile.id !== foundingTile.id
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
});

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
