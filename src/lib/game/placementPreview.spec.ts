import { describe, expect, test } from 'vitest';
import { generateCity } from './city';
import {
	decisionContextIndustrialLockedTile,
	decisionContextIndustrialRequiresIndustrialTile,
	decisionContextIndustrialRequiresResource
} from './decisionContext';
import { getIndustryTilesByResource } from './industry';
import {
	createIndustryPlacementPreview,
	createRetailPlacementPreview,
	getIndustrialBuildMenuOptions,
	getIndustryBuildPlacementBlockReason,
	getRetailBuildMenuOptions,
	getRetailPlacementBlockReason,
	resolveIndustrySelectionAnchorTileId,
	resolveIndustryPlacementAnchorTileId,
	resolveRetailPlacementAnchorTileId,
	resolveSelectionAnchorTileId
} from './placementPreview';
import { createFoundingGameAtTile, forecastOpening } from './placement';
import { createNewGame } from './state';
import {
	createCityTileLookup,
	getOccupiedStoreTileIds,
	getStoreFootprintPlacementBlockReason
} from './storeFootprint';
import type { City, CityTile, IndustrialBuilding, IndustryTile, Store } from './types';

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
		).toEqual({ code: 'retail.roadLocation' });
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
		).toEqual({ code: 'retail.occupiedLocation' });
		expect(
			getRetailPlacementBlockReason({
				game: { ...game, cash: 0 },
				city,
				tileId: expansionTile.id,
				archetypeId: 'electronics'
			})
		).toEqual({ code: 'retail.requiresCash', amount: expansionSetupCost });
		expect(
			getRetailPlacementBlockReason({
				game: cappedGame,
				city,
				tileId: buildableTiles[game.storeCap]!.id,
				archetypeId: 'grocery'
			})
		).toEqual({ code: 'retail.storeLimitReached' });
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
		).toEqual({ code: 'retail.unknownCityTile' });
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
		).toEqual({ code: 'retail.occupiedLocation' });
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
		).toEqual({ code: 'retail.lockedLocation' });
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
			{ code: 'retail.storeLimitReached' },
			{ code: 'retail.storeLimitReached' },
			{ code: 'retail.storeLimitReached' },
			{ code: 'retail.storeLimitReached' }
		]);
	});

	test('keeps cash-short retail menu options selectable when the minimum setup cost has credit', () => {
		expect.assertions(3);
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
			game: { ...game, cash: cheapestElectronicsSetupCost - 100 },
			city
		}).find((option) => option.archetypeId === 'electronics')!;

		expect(electronicsOption.validTileCount).toBe(availableTiles.length);
		expect(electronicsOption.disabledReason).toBeNull();
		expect(electronicsOption.financeOffer).toMatchObject({
			principal: 100,
			termDays: 84
		});
	});

	test('disables a cash-short retail menu option when its financing command is unavailable', () => {
		expect.assertions(3);
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
			game: { ...game, cash: cheapestElectronicsSetupCost - 100 },
			city,
			cashCommandAvailable: true,
			financeCommandAvailable: false
		}).find((option) => option.archetypeId === 'electronics')!;

		expect(electronicsOption.validTileCount).toBe(availableTiles.length);
		expect(electronicsOption.disabledReason).toEqual({
			code: 'retail.requiresCash',
			amount: cheapestElectronicsSetupCost
		});
		expect(electronicsOption.financeOffer).toBeNull();
	});

	test('requires the cash command for a cash-covered retail menu option', () => {
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
		const cheapestBoutiqueSetupCost = Math.min(
			...availableTiles.map((tile) => forecastOpening(tile, 'boutique').setupCost)
		);

		const boutiqueOption = getRetailBuildMenuOptions({
			game: { ...game, cash: cheapestBoutiqueSetupCost },
			city,
			cashCommandAvailable: false,
			financeCommandAvailable: true
		}).find((option) => option.archetypeId === 'boutique')!;

		expect(boutiqueOption.disabledReason).toEqual({
			code: 'retail.requiresCash',
			amount: cheapestBoutiqueSetupCost
		});
		expect(boutiqueOption.financeOffer).toBeNull();
	});

	test('excludes cash-short retail tiles from the preview when financing is unavailable', () => {
		expect.assertions(5);
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
		const targetTile = city.tiles.find(
			(tile) => tile.id !== foundingTile.id && isRetailFootprintAvailable(city, tile, game.stores)
		)!;
		const setupCost = forecastOpening(targetTile, 'electronics').setupCost;
		const cashShortGame = { ...game, cash: setupCost - 100 };

		const unavailablePreview = createRetailPlacementPreview({
			game: cashShortGame,
			city,
			archetypeId: 'electronics',
			cashCommandAvailable: true,
			financeCommandAvailable: false
		});
		const financedPreview = createRetailPlacementPreview({
			game: cashShortGame,
			city,
			archetypeId: 'electronics',
			cashCommandAvailable: false,
			financeCommandAvailable: true
		});

		expect(unavailablePreview.invalidTileIds).toContain(targetTile.id);
		expect(unavailablePreview.validTileIds).not.toContain(targetTile.id);
		expect(
			getRetailPlacementBlockReason({
				game: cashShortGame,
				city,
				tileId: targetTile.id,
				archetypeId: 'electronics',
				cashCommandAvailable: true,
				financeCommandAvailable: false
			})
		).toEqual({ code: 'retail.requiresCash', amount: setupCost });
		expect(financedPreview.validTileIds).toContain(targetTile.id);
		expect(
			getRetailPlacementBlockReason({
				game: cashShortGame,
				city,
				tileId: targetTile.id,
				archetypeId: 'electronics',
				cashCommandAvailable: false,
				financeCommandAvailable: true
			})
		).toBeNull();
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
			{ code: 'retail.occupiedLocation' },
			{ code: 'retail.occupiedLocation' },
			{ code: 'retail.occupiedLocation' },
			{ code: 'retail.occupiedLocation' }
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
			{ code: 'retail.noValidTiles' },
			{ code: 'retail.noValidTiles' },
			{ code: 'retail.noValidTiles' },
			{ code: 'retail.noValidTiles' }
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
	test('build menu options require a usable cash command or exact-shortfall finance offer per building', () => {
		expect.assertions(6);
		const game = createNewGame('convenience', 20260512);
		const warehouseOption = (
			inputGame: typeof game,
			cashCommandAvailable: boolean,
			financeCommandAvailable: boolean
		) =>
			getIndustrialBuildMenuOptions({
				game: inputGame,
				cashCommandAvailable,
				financeCommandAvailable
			}).find((option) => option.buildingTypeId === 'warehouse')!;

		expect(warehouseOption({ ...game, cash: 1000 }, true, false).disabledReason).toBeNull();

		const financed = warehouseOption({ ...game, cash: 900 }, false, true);
		expect(financed.disabledReason).toBeNull();
		expect(financed.financeOffer).toMatchObject({ principal: 100, termDays: 84 });

		expect(warehouseOption({ ...game, cash: 900 }, true, false).disabledReason).toEqual({
			code: 'industry.requiresCash',
			buildingTypeId: 'warehouse',
			amount: 1000
		});
		expect(warehouseOption({ ...game, cash: 1000 }, false, true).disabledReason).toEqual({
			code: 'industry.commandUnavailable'
		});

		const delinquent = {
			...game,
			cash: 900,
			finance: {
				...game.finance,
				loans: game.finance.loans.map((loan) => ({
					...loan,
					status: 'delinquent' as const,
					overduePrincipal: 1,
					arrearsSinceDay: game.day
				}))
			}
		};
		expect(warehouseOption(delinquent, false, true).disabledReason).toEqual({
			code: 'industry.requiresCash',
			buildingTypeId: 'warehouse',
			amount: 1000
		});
	});

	test('marks matching resource tiles valid for raw producers', () => {
		expect.assertions(5);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const grainTile = getIndustryTilesByResource(city, 'grain-field')[0]!;
		const saltTile = getIndustryTilesByResource(city, 'salt-deposit')[0]!;

		const preview = createIndustryPlacementPreview({
			game,
			buildingTypeId: 'grain-farm',
			financeCommandAvailable: true
		});

		expect(preview.validTileIds).toContain(grainTile.id);
		expect(preview.invalidTileIds).toContain(saltTile.id);
		expect(preview.validTileIds.length + preview.invalidTileIds.length).toBe(city.tiles.length);
		expect(
			getIndustryBuildPlacementBlockReason({
				game,
				tileId: grainTile.id,
				buildingTypeId: 'grain-farm',
				financeCommandAvailable: true
			})
		).toBeNull();
		expect(
			getIndustryBuildPlacementBlockReason({
				game,
				tileId: saltTile.id,
				buildingTypeId: 'grain-farm',
				financeCommandAvailable: true
			})
		).toEqual({
			code: 'industry.rawPlacementBlocked',
			context: decisionContextIndustrialRequiresResource('grain-field')
		});
	});

	test('blocks industry construction before retail founding, on locked tiles, and when cash is short', () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260512);
		const city = game.industryCities[0]!;
		const lockedTile = city.tiles.find((tile) => tile.locked)!;
		const industrialTile = city.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;

		expect(
			createIndustryPlacementPreview({
				game: null,
				buildingTypeId: 'warehouse',
				financeCommandAvailable: true
			})
		).toEqual({
			validTileIds: [],
			invalidTileIds: []
		});
		expect(
			getIndustryBuildPlacementBlockReason({
				game: null,
				tileId: industrialTile.id,
				buildingTypeId: 'warehouse',
				financeCommandAvailable: true
			})
		).toEqual({ code: 'industry.lockedUntilRetail' });
		expect(
			getIndustryBuildPlacementBlockReason({
				game,
				tileId: lockedTile.id,
				buildingTypeId: 'warehouse',
				financeCommandAvailable: true
			})
		).toEqual({
			code: 'industry.rawPlacementBlocked',
			context: decisionContextIndustrialLockedTile()
		});
		expect(
			getIndustryBuildPlacementBlockReason({
				game: {
					...game,
					cash: 0,
					finance: {
						...game.finance,
						loans: game.finance.loans.map((loan) => ({
							...loan,
							status: 'delinquent',
							overduePrincipal: 1,
							arrearsSinceDay: game.day
						}))
					}
				},
				tileId: industrialTile.id,
				buildingTypeId: 'warehouse',
				financeCommandAvailable: true
			})
		).toEqual({
			code: 'industry.requiresCash',
			buildingTypeId: 'warehouse',
			amount: 1000
		});
	});

	test('build menu options default to enabled with no finance offer when no game is loaded', () => {
		expect.assertions(1);
		const options = getIndustrialBuildMenuOptions({
			game: null,
			cashCommandAvailable: false,
			financeCommandAvailable: false
		});
		expect(
			options.every((option) => option.disabledReason === null && option.financeOffer === null)
		).toBe(true);
	});

	test('clears the cash block when a finance offer covers the industrial building shortfall', () => {
		expect.assertions(1);
		const game = { ...createNewGame('convenience', 20260512), cash: 0 };
		const city = game.industryCities[0]!;
		const industrialTile = city.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;
		expect(
			getIndustryBuildPlacementBlockReason({
				game,
				tileId: industrialTile.id,
				buildingTypeId: 'warehouse',
				financeCommandAvailable: true
			})
		).toBeNull();
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
			buildingTypeId: 'warehouse',
			financeCommandAvailable: true
		});

		expect(preview.invalidTileIds).toContain(nonIndustrialTile.id);
		expect(preview.validTileIds).toContain(industrialTile.id);
		expect(
			getIndustryBuildPlacementBlockReason({
				game,
				tileId: nonIndustrialTile.id,
				buildingTypeId: 'warehouse',
				financeCommandAvailable: true
			})
		).toEqual({
			code: 'industry.rawPlacementBlocked',
			context: decisionContextIndustrialRequiresIndustrialTile()
		});
		expect(
			getIndustryBuildPlacementBlockReason({
				game,
				tileId: industrialTile.id,
				buildingTypeId: 'warehouse',
				financeCommandAvailable: true
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
		const preview = createIndustryPlacementPreview({
			game,
			buildingTypeId: 'warehouse',
			financeCommandAvailable: true
		});
		const validAnchor = city.tiles.find((tile) => preview.validTileIds.includes(tile.id))!;

		expect(resolveIndustryPlacementAnchorTileId(preview, city, validAnchor.id)).toBe(
			validAnchor.id
		);
	});

	test('returns the clicked tile id unchanged when the tile is unknown', () => {
		expect.assertions(1);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const preview = createIndustryPlacementPreview({
			game,
			buildingTypeId: 'warehouse',
			financeCommandAvailable: true
		});

		expect(resolveIndustryPlacementAnchorTileId(preview, city, 'does-not-exist')).toBe(
			'does-not-exist'
		);
	});

	test('resolves a non-anchor cell inside a valid footprint to that footprint anchor', () => {
		// Mirrors the retail twin: a clicked cell that is not itself a valid
		// anchor but sits inside a valid anchor's 2x2 footprint must resolve to
		// that anchor via the resolution loop (the whole point of the helper).
		// Such cells sit at the industrial district boundary, where the
		// neighbor's own 2x2 footprint would cross into non-industrial terrain.
		expect.assertions(3);
		const game = { ...createNewGame('convenience', 20260512), cash: 100_000 };
		const city = game.industryCities[0]!;
		const preview = createIndustryPlacementPreview({
			game,
			buildingTypeId: 'warehouse',
			financeCommandAvailable: true
		});
		const tileByCoord = (x: number, y: number): IndustryTile | undefined =>
			city.tiles.find((t) => t.x === x && t.y === y);
		const nonAnchorOffsets = [
			{ dx: 1, dy: 0 },
			{ dx: 0, dy: 1 },
			{ dx: 1, dy: 1 }
		];
		// Find a non-anchor footprint cell of some valid anchor that is not
		// itself a valid anchor — exercising the loop, not the early-return.
		const clicked = preview.validTileIds
			.map((id) => city.tiles.find((t) => t.id === id)!)
			.flatMap((anchor) =>
				nonAnchorOffsets
					.map(({ dx, dy }) => tileByCoord(anchor.x + dx, anchor.y + dy))
					.filter((t): t is IndustryTile => Boolean(t))
			)
			.find((t) => !preview.validTileIds.includes(t.id))!;
		expect(clicked).toBeDefined();

		const resolved = resolveIndustryPlacementAnchorTileId(preview, city, clicked.id);
		expect(preview.validTileIds).toContain(resolved);
		const resolvedTile = city.tiles.find((t) => t.id === resolved)!;
		expect(
			clicked.x >= resolvedTile.x &&
				clicked.x < resolvedTile.x + 2 &&
				clicked.y >= resolvedTile.y &&
				clicked.y < resolvedTile.y + 2
		).toBe(true);
	});
});

describe('resolveSelectionAnchorTileId', () => {
	test('resolves a non-anchor cell inside a 2x2 store footprint to the store anchor', () => {
		expect.assertions(1);
		const city = createFlatCity(4, 4);
		const anchor = city.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;
		const store: Store = {
			id: 'store-1',
			level: 1,
			name: 'Test Store',
			archetypeId: 'boutique',
			location: { neighborhoodId: 'downtown', x: 1, y: 1 },
			cityId: city.id,
			tileId: anchor.id,
			mapX: anchor.x,
			mapY: anchor.y,
			daysOpen: 0,
			reputation: 50,
			stockHealth: 100,
			products: [],
			staffMorale: 70,
			staffCapacity: 2,
			localDemand: 60,
			competition: 0,
			managerQuality: 50
		};
		// (2,2) is the bottom-right cell of the anchor's 2x2 footprint.
		const bottomRight = city.tiles.find((tile) => tile.x === 2 && tile.y === 2)!;

		expect(resolveSelectionAnchorTileId(city, [store], bottomRight.id)).toBe(anchor.id);
	});

	test('returns the clicked tile id when the cell is not inside any store footprint', () => {
		expect.assertions(1);
		const city = createFlatCity(4, 4);
		const anchor = city.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;
		const store: Store = {
			id: 'store-1',
			level: 1,
			name: 'Test Store',
			archetypeId: 'boutique',
			location: { neighborhoodId: 'downtown', x: 1, y: 1 },
			cityId: city.id,
			tileId: anchor.id,
			mapX: anchor.x,
			mapY: anchor.y,
			daysOpen: 0,
			reputation: 50,
			stockHealth: 100,
			products: [],
			staffMorale: 70,
			staffCapacity: 2,
			localDemand: 60,
			competition: 0,
			managerQuality: 50
		};
		// (3,3) is outside the (1,1) anchor's 2x2 footprint.
		const outside = city.tiles.find((tile) => tile.x === 3 && tile.y === 3)!;

		expect(resolveSelectionAnchorTileId(city, [store], outside.id)).toBe(outside.id);
	});

	test('ignores stores in other cities', () => {
		expect.assertions(1);
		const city = createFlatCity(4, 4);
		const anchor = city.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;
		const store: Store = {
			id: 'store-1',
			level: 1,
			name: 'Test Store',
			archetypeId: 'boutique',
			location: { neighborhoodId: 'downtown', x: 1, y: 1 },
			cityId: 'other-city',
			tileId: anchor.id,
			mapX: anchor.x,
			mapY: anchor.y,
			daysOpen: 0,
			reputation: 50,
			stockHealth: 100,
			products: [],
			staffMorale: 70,
			staffCapacity: 2,
			localDemand: 60,
			competition: 0,
			managerQuality: 50
		};
		const bottomRight = city.tiles.find((tile) => tile.x === 2 && tile.y === 2)!;

		expect(resolveSelectionAnchorTileId(city, [store], bottomRight.id)).toBe(bottomRight.id);
	});

	test('returns the clicked tile id unchanged when the tile is unknown', () => {
		expect.assertions(1);
		const city = createFlatCity(4, 4);

		expect(resolveSelectionAnchorTileId(city, [], 'does-not-exist')).toBe('does-not-exist');
	});
});

describe('resolveIndustrySelectionAnchorTileId', () => {
	test('resolves a non-anchor cell inside a 2x2 building footprint to the building anchor', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260512);
		const city = game.industryCities[0]!;
		const anchor = city.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;
		const building: IndustrialBuilding = {
			id: 'building-1',
			level: 1,
			typeId: 'warehouse',
			cityId: city.id,
			tileId: anchor.id,
			mapX: anchor.x,
			mapY: anchor.y,
			status: 'idle',
			lastProduction: [],
			producedTotal: 0,
			importedInputTotal: 0,
			blockedDays: 0,
			inventory: {}
		};
		// (2,2) is the bottom-right cell of the anchor's 2x2 footprint.
		const bottomRight = city.tiles.find((tile) => tile.x === 2 && tile.y === 2)!;

		expect(resolveIndustrySelectionAnchorTileId(city, [building], bottomRight.id)).toBe(anchor.id);
	});

	test('returns the clicked tile id when the cell is not inside any building footprint', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260512);
		const city = game.industryCities[0]!;
		const anchor = city.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;
		const building: IndustrialBuilding = {
			id: 'building-1',
			level: 1,
			typeId: 'warehouse',
			cityId: city.id,
			tileId: anchor.id,
			mapX: anchor.x,
			mapY: anchor.y,
			status: 'idle',
			lastProduction: [],
			producedTotal: 0,
			importedInputTotal: 0,
			blockedDays: 0,
			inventory: {}
		};
		// Find a tile outside the (1,1) 2x2 footprint.
		const outside = city.tiles.find((tile) => tile.x === 0 && tile.y === 0)!;

		expect(resolveIndustrySelectionAnchorTileId(city, [building], outside.id)).toBe(outside.id);
	});

	test('returns the clicked tile id unchanged when the tile is unknown', () => {
		// Mirrors the retail twin's unknown-tile branch — a broken tile id must
		// pass through unchanged rather than throw.
		expect.assertions(1);
		const game = createNewGame('convenience', 20260512);
		const city = game.industryCities[0]!;

		expect(resolveIndustrySelectionAnchorTileId(city, [], 'does-not-exist')).toBe('does-not-exist');
	});

	test('ignores a building whose cityId differs from the inspected city', () => {
		// Cross-city guard: a building geometry-overlaps the clicked cell but
		// belongs to a different industry city. The cityId filter must exclude
		// it, so the clicked cell is returned unchanged — otherwise the
		// inspector would open a foreign city's building.
		expect.assertions(1);
		const game = createNewGame('convenience', 20260512);
		const city = game.industryCities[0]!;
		const anchor = city.tiles.find((tile) => tile.x === 1 && tile.y === 1)!;
		const foreignBuilding: IndustrialBuilding = {
			id: 'building-foreign',
			level: 1,
			typeId: 'warehouse',
			cityId: 'other-industry-city',
			tileId: anchor.id,
			mapX: anchor.x,
			mapY: anchor.y,
			status: 'idle',
			lastProduction: [],
			producedTotal: 0,
			importedInputTotal: 0,
			blockedDays: 0,
			inventory: {}
		};
		// (2,2) is the bottom-right cell of the foreign building's footprint
		// geometry, but its cityId differs so it must be ignored.
		const bottomRight = city.tiles.find((tile) => tile.x === 2 && tile.y === 2)!;

		expect(resolveIndustrySelectionAnchorTileId(city, [foreignBuilding], bottomRight.id)).toBe(
			bottomRight.id
		);
	});
});
