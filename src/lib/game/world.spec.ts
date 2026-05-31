import { describe, expect, test } from 'vitest';
import { buildIndustrialBuilding } from './industryPlacement';
import { addWarehouseMaterial } from './industryProduction';
import { createNewGame } from './state';
import {
	STARTER_STORE_CAP,
	WORLD_CITY_CATALOG,
	createInitialWorldProgress,
	getWorldCityDefinition,
	getWorldCityStatus,
	openWorldCity,
	refreshWorldProgress
} from './world';
import type { GameState } from './types';

function gameStub(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 20260530,
		rngState: 1,
		day: 1,
		cash: 20_000,
		debt: 0,
		policy: {
			pricing: 'standard',
			inventory: 'balanced',
			staffing: 'efficient',
			marketing: 'awareness',
			service: 'balanced'
		},
		scorecard: {
			profit: 50,
			customerSatisfaction: 50,
			staffMorale: 50,
			marketPosition: 50
		},
		cities: [],
		activeCityId: 'harbor-city',
		industryCities: [],
		activeIndustryCityId: 'industry-city',
		industrialBuildings: [],
		warehouse: {
			capacity: 0,
			materials: {},
			overflowUnits: 0,
			overflowCost: 0
		},
		stores: [],
		staff: [],
		hiringCandidates: [],
		decisions: [],
		reports: [],
		world: createInitialWorldProgress(),
		storeCap: STARTER_STORE_CAP,
		...overrides
	};
}

describe('world city catalog', () => {
	test('defines three retail and three industry city nodes with unique ids', () => {
		expect.assertions(5);
		const ids = WORLD_CITY_CATALOG.map((city) => city.id);

		expect(WORLD_CITY_CATALOG).toHaveLength(6);
		expect(new Set(ids).size).toBe(6);
		expect(WORLD_CITY_CATALOG.filter((city) => city.kind === 'retail')).toHaveLength(3);
		expect(WORLD_CITY_CATALOG.filter((city) => city.kind === 'industry')).toHaveLength(3);
		expect(WORLD_CITY_CATALOG.every((city) => city.openingCost >= 0)).toBe(true);
	});

	test('creates initial world progress with the starter retail and industry cities opened', () => {
		expect.assertions(4);
		const progress = createInitialWorldProgress();

		expect(progress.openedCityIds).toEqual(['harbor-city', 'industry-city']);
		expect(progress.revealedCityIds).toEqual(['harbor-city', 'industry-city']);
		expect(progress.claimedMilestoneIds).toEqual([]);
		expect(STARTER_STORE_CAP).toBeGreaterThan(1);
	});

	test('returns world city status from saved progress and company cash', () => {
		expect.assertions(5);
		const game = gameStub({
			cash: 1_000,
			world: {
				revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
				openedCityIds: ['harbor-city', 'industry-city'],
				claimedMilestoneIds: []
			}
		});

		const harbor = getWorldCityStatus(game, 'harbor-city');
		const campus = getWorldCityStatus(game, 'campus-junction');
		const garden = getWorldCityStatus(game, 'garden-borough');

		expect(harbor?.state).toBe('opened');
		expect(campus?.state).toBe('revealed');
		expect(campus?.canOpen).toBe(false);
		expect(garden?.state).toBe('locked');
		expect(getWorldCityDefinition('missing-city')).toBeUndefined();
	});
});

describe('world progression and city opening', () => {
	test('reveals the second retail city after the company reaches two stores', () => {
		expect.assertions(1);
		const game = gameStub({
			stores: [
				{ id: 'store-1', cityId: 'harbor-city' } as GameState['stores'][number],
				{ id: 'store-2', cityId: 'harbor-city' } as GameState['stores'][number]
			]
		});

		expect(refreshWorldProgress(game).world.revealedCityIds).toContain('campus-junction');
	});

	test('opens a revealed retail city, deducts cash, appends its city map, and raises store cap', () => {
		expect.assertions(6);
		const game = createNewGame('convenience', 20260530);
		const revealed: GameState = {
			...game,
			cash: 50_000,
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'campus-junction']
			}
		};

		const opened = openWorldCity(revealed, 'campus-junction');

		expect(opened.cash).toBe(32_000);
		expect(opened.world.openedCityIds).toContain('campus-junction');
		expect(opened.cities.some((city) => city.id === 'campus-junction')).toBe(true);
		expect(opened.activeCityId).toBe('campus-junction');
		expect(opened.industryCities).toHaveLength(1);
		expect(opened.storeCap).toBe(game.storeCap + 1);
	});

	test('opens a revealed industrial city and sets it active without changing store cap', () => {
		expect.assertions(5);
		const game = createNewGame('convenience', 20260530);
		const revealed: GameState = {
			...game,
			cash: 50_000,
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'breadbasket-basin']
			}
		};

		const opened = openWorldCity(revealed, 'breadbasket-basin');

		expect(opened.cash).toBe(35_000);
		expect(opened.world.openedCityIds).toContain('breadbasket-basin');
		expect(opened.industryCities.some((city) => city.id === 'breadbasket-basin')).toBe(true);
		expect(opened.activeIndustryCityId).toBe('breadbasket-basin');
		expect(opened.storeCap).toBe(game.storeCap);
	});

	test('blocked city openings append decisions instead of throwing', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260530);
		const revealedWithoutCash: GameState = {
			...game,
			cash: 0,
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'campus-junction']
			}
		};
		const locked = openWorldCity(game, 'garden-borough');
		const unaffordable = openWorldCity(revealedWithoutCash, 'campus-junction');
		const unknown = openWorldCity(game, 'missing-city');

		expect(locked.decisions.at(-1)?.title).toBe('City is not available yet');
		expect(unaffordable.decisions.at(-1)?.title).toBe('City opening delayed');
		expect(unknown.decisions.at(-1)?.context).toBe('Unknown city.');
	});

	test('reveals industrial and later retail milestones from production and reports', () => {
		expect.assertions(3);
		const game = { ...createNewGame('convenience', 20260530), cash: 100_000 };
		const warehouseTile = game.industryCities[0]!.tiles.find(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		)!;
		const warehouseGame = buildIndustrialBuilding(game, {
			tileId: warehouseTile.id,
			buildingTypeId: 'warehouse'
		});
		const rawTile = warehouseGame.industryCities[0]!.tiles.find(
			(tile) => tile.resource === 'grain-field'
		)!;
		const rawGame = buildIndustrialBuilding(warehouseGame, {
			tileId: rawTile.id,
			buildingTypeId: 'grain-farm'
		});
		const finishedGame = refreshWorldProgress({
			...rawGame,
			warehouse: addWarehouseMaterial(rawGame.warehouse, 'snacks', 1)
		});
		const reportedGame = refreshWorldProgress({
			...finishedGame,
			cash: 90_000,
			reports: [
				{
					day: finishedGame.day,
					revenue: 1,
					costOfGoods: 0,
					grossMargin: 1,
					operatingCosts: 0,
					payrollCost: 0,
					importSpend: 0,
					netIncome: 1,
					cashAfter: 90_001,
					scorecard: finishedGame.scorecard,
					productionReport: {
						produced: [],
						consumed: [],
						importedInputs: [],
						warehousePulls: [],
						shopImports: [],
						importSpend: 0,
						operatingCost: 0,
						overflowUnits: 0,
						overflowCost: 0,
						warehouseCapacity: 0,
						warehouseUsed: 0
					},
					storeReports: [],
					warnings: []
				}
			]
		});

		expect(rawGame.world.revealedCityIds).toContain('breadbasket-basin');
		expect(finishedGame.world.revealedCityIds).toContain('quarry-works');
		expect(reportedGame.world.revealedCityIds).toContain('garden-borough');
	});
});
