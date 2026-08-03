import { describe, expect, test } from 'vitest';
import { buildIndustrialBuilding } from './industryPlacement';
import { DEFAULT_RETAIL_CITY_HEIGHT, DEFAULT_RETAIL_CITY_WIDTH, generateCity } from './city';
import { generateIndustryCity } from './industry';
import { createEmptyFinanceState } from './finance';
import { createInitialEventRuntime } from './eventSelection';
import { createNewGame } from './state';
import {
	STARTER_STORE_CAP,
	WORLD_CITY_CATALOG,
	createInitialWorldProgress,
	getIndustryCityResourceProfile,
	getRetailCityDemandMultiplier,
	getWorldCityDefinition,
	getWorldCityStatus,
	financeWorldCityOpening,
	isWorldCityId,
	openWorldCity,
	refreshWorldProgress,
	selectWorldCity
} from './world';
import type { GameState } from './types';
import { systemDecision } from './testHelpers';

function gameStub(overrides: Partial<GameState> = {}): GameState {
	return {
		seed: 20260530,
		rngState: 1,
		day: 1,
		cash: 20_000,
		finance: createEmptyFinanceState(1),
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
		cityInventories: [],
		retailSupplyAssignments: [],
		stores: [],
		staff: [],
		hiringCandidates: [],
		decisions: [],
		events: createInitialEventRuntime(20260530),
		reports: [],
		world: createInitialWorldProgress(),
		storeCap: STARTER_STORE_CAP,
		...overrides
	};
}

function findWarehouseAnchor(city: GameState['industryCities'][number]) {
	return city.tiles.find(
		(tile) =>
			tile.terrain === 'industrial' &&
			!tile.locked &&
			[
				[1, 0],
				[0, 1],
				[1, 1]
			].every(([dx, dy]) => {
				const footprintTile = city.tiles.find(
					(other) => other.x === tile.x + dx && other.y === tile.y + dy
				);
				return (
					footprintTile !== undefined &&
					footprintTile.terrain === 'industrial' &&
					!footprintTile.locked
				);
			})
	)!;
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
	test('finances a revealed city by borrowing only its exact shortfall', () => {
		const base = createNewGame('convenience', 20260530);
		const game: GameState = {
			...base,
			cash: 17_750,
			world: {
				...base.world,
				revealedCityIds: [...base.world.revealedCityIds, 'campus-junction']
			}
		};

		const result = financeWorldCityOpening(game, {
			cityId: 'campus-junction',
			expectedCost: 18_000
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.receipt.loanId).toBe('loan-2');
		expect(result.game.cash).toBe(0);
		expect(result.game.finance.loans.at(-1)).toMatchObject({
			purpose: 'expansion',
			originalPrincipal: 250
		});
		expect(
			result.game.finance.transactions.filter((transaction) => transaction.kind === 'disbursement')
		).toHaveLength(1);
		expect(result.game.finance.currentDayActivity.principalBorrowed).toBe(250);
		expect(result.game.world.openedCityIds).toContain('campus-junction');
	});

	test('rejects a cash-sufficient city financing commit instead of falling back to the cash command', () => {
		const base = createNewGame('convenience', 20260530);
		const game: GameState = {
			...base,
			cash: 18_000,
			world: {
				...base.world,
				revealedCityIds: [...base.world.revealedCityIds, 'campus-junction']
			}
		};

		const result = financeWorldCityOpening(game, {
			cityId: 'campus-junction',
			expectedCost: 18_000
		});

		expect(result).toMatchObject({ ok: false, code: 'cashSufficient' });
		if (!result.ok) expect(result.game).toBe(game);
		expect(game.finance).toBe(base.finance);
		expect(game.world.openedCityIds).not.toContain('campus-junction');
	});
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

	test('opens a revealed retail city, assigns its source, appends its city map, and raises store cap', () => {
		expect.assertions(9);
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
		expect(opened.cities.find((city) => city.id === 'campus-junction')?.width).toBe(56);
		expect(opened.cities.find((city) => city.id === 'campus-junction')?.height).toBe(48);
		expect(opened.activeCityId).toBe('campus-junction');
		expect(opened.industryCities).toHaveLength(1);
		expect(opened.storeCap).toBe(game.storeCap + 1);
		expect(opened.retailSupplyAssignments).toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
			{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
		]);
	});

	test('opens a revealed industrial city, synchronizes its inventory, and sets it active', () => {
		expect.assertions(8);
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
		expect(opened.industryCities.find((city) => city.id === 'breadbasket-basin')?.width).toBe(56);
		expect(opened.industryCities.find((city) => city.id === 'breadbasket-basin')?.height).toBe(48);
		expect(opened.activeIndustryCityId).toBe('breadbasket-basin');
		expect(opened.storeCap).toBe(game.storeCap);
		expect(opened.cityInventories).toEqual([
			{
				cityId: 'industry-city',
				capacity: 0,
				materials: {},
				overflowUnits: 0,
				overflowCost: 0
			},
			{
				cityId: 'breadbasket-basin',
				capacity: 0,
				materials: {},
				overflowUnits: 0,
				overflowCost: 0
			}
		]);
	});

	test('uses the deterministic capacity, active-city, and catalog source rules when opening retail cities', () => {
		expect.assertions(3);
		const starter = createNewGame('convenience', 20260802);
		const openedIndustry = openWorldCity(
			{
				...starter,
				cash: 1_000_000,
				world: {
					...starter.world,
					revealedCityIds: [...starter.world.revealedCityIds, 'breadbasket-basin']
				}
			},
			'breadbasket-basin'
		);
		const withBreadbasketWarehouse = buildIndustrialBuilding(openedIndustry, {
			tileId: findWarehouseAnchor(
				openedIndustry.industryCities.find((city) => city.id === 'breadbasket-basin')!
			).id,
			buildingTypeId: 'warehouse'
		});
		const withIndustryWarehouse = buildIndustrialBuilding(
			selectWorldCity(withBreadbasketWarehouse, 'industry-city'),
			{
				tileId: findWarehouseAnchor(
					withBreadbasketWarehouse.industryCities.find((city) => city.id === 'industry-city')!
				).id,
				buildingTypeId: 'warehouse'
			}
		);
		const withCampusRevealed = (game: GameState): GameState => ({
			...game,
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'campus-junction']
			}
		});

		const capacityWinner = openWorldCity(
			withCampusRevealed(selectWorldCity(withBreadbasketWarehouse, 'industry-city')),
			'campus-junction'
		);
		const activeTieWinner = openWorldCity(
			withCampusRevealed(selectWorldCity(withIndustryWarehouse, 'breadbasket-basin')),
			'campus-junction'
		);
		const catalogTieWinner = openWorldCity(
			withCampusRevealed({ ...withIndustryWarehouse, activeIndustryCityId: 'stale-industry-city' }),
			'campus-junction'
		);

		expect(
			capacityWinner.retailSupplyAssignments.find(
				(assignment) => assignment.retailCityId === 'campus-junction'
			)
		).toEqual({ retailCityId: 'campus-junction', supplyCityId: 'breadbasket-basin' });
		expect(
			activeTieWinner.retailSupplyAssignments.find(
				(assignment) => assignment.retailCityId === 'campus-junction'
			)
		).toEqual({ retailCityId: 'campus-junction', supplyCityId: 'breadbasket-basin' });
		expect(
			catalogTieWinner.retailSupplyAssignments.find(
				(assignment) => assignment.retailCityId === 'campus-junction'
			)
		).toEqual({ retailCityId: 'campus-junction', supplyCityId: 'industry-city' });
	});

	test('assigns imports only when a newly opened retail city has no eligible inventory source', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260802);
		const opened = openWorldCity(
			{
				...game,
				cash: 50_000,
				cityInventories: [],
				world: {
					...game.world,
					revealedCityIds: [...game.world.revealedCityIds, 'campus-junction']
				}
			},
			'campus-junction'
		);

		expect(
			opened.retailSupplyAssignments.find(
				(assignment) => assignment.retailCityId === 'campus-junction'
			)
		).toEqual({ retailCityId: 'campus-junction', supplyCityId: null });
	});

	test('blocked city openings append decisions instead of throwing', () => {
		expect.assertions(6);
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

		expect(systemDecision(locked.decisions.at(-1)).title).toBe('City is not available yet');
		expect(systemDecision(locked.decisions.at(-1)).context).toEqual({
			code: 'worldCityNotAvailableYet',
			cityId: 'garden-borough'
		});
		expect(systemDecision(unaffordable.decisions.at(-1)).title).toBe('City opening delayed');
		expect(systemDecision(unaffordable.decisions.at(-1)).context).toEqual({
			code: 'worldCityOpeningCost',
			cash: 18_000
		});
		expect(systemDecision(unknown.decisions.at(-1)).title).toBe('City unavailable');
		expect(systemDecision(unknown.decisions.at(-1)).context).toEqual({ code: 'worldCityUnknown' });
	});

	test('two unrevealed cities on the same day produce distinct decisions', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260530);
		const result1 = openWorldCity(game, 'campus-junction');
		const result2 = openWorldCity(result1, 'garden-borough');

		const decision1 = result1.decisions.at(-1);
		const decision2 = result2.decisions.at(-1);

		expect(decision1?.id).not.toBe(decision2?.id);
		expect(result2.decisions.filter((d) => d.id === decision1?.id)).toHaveLength(1);
	});

	test('openWorldCity with insufficient cash emits structured openingCost context', () => {
		expect.assertions(2);
		const base = createNewGame('convenience', 20260530);
		const game: GameState = {
			...base,
			cash: 1_000,
			world: {
				...base.world,
				revealedCityIds: [...base.world.revealedCityIds, 'campus-junction']
			}
		};
		const result = openWorldCity(game, 'campus-junction');
		const decision = result.decisions.find((d) => d.id.startsWith('world-city'));
		expect(decision).toBeDefined();
		expect(systemDecision(decision).context).toEqual({
			code: 'worldCityOpeningCost',
			cash: 18_000
		});
	});

	test('openWorldCity on an unrevealed city emits cityId in the context', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260530);
		const result = openWorldCity(game, 'campus-junction');
		const decision = result.decisions.find((d) => d.id.startsWith('world-city'));
		expect(decision).toBeDefined();
		expect(systemDecision(decision).context).toEqual({
			code: 'worldCityNotAvailableYet',
			cityId: 'campus-junction'
		});
	});

	test('re-opening an already-opened city selects it without duplicating lifecycle records', () => {
		expect.assertions(5);
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
		const cashAfterOpen = opened.cash;
		const capAfterOpen = opened.storeCap;

		const reopened = openWorldCity(opened, 'campus-junction');

		expect(reopened.cash).toBe(cashAfterOpen);
		expect(reopened.storeCap).toBe(capAfterOpen);
		expect(reopened.activeCityId).toBe('campus-junction');
		expect(reopened.decisions).toHaveLength(opened.decisions.length);
		expect(reopened.retailSupplyAssignments).toEqual(opened.retailSupplyAssignments);
	});

	test('does not reveal quarry-works when finished material was imported rather than produced locally', () => {
		expect.assertions(1);
		const game = { ...createNewGame('convenience', 20260530), cash: 100_000 };
		const refreshed = refreshWorldProgress({
			...game,
			reports: [
				{
					day: game.day,
					revenue: 0,
					costOfGoods: 0,
					grossMargin: 0,
					operatingCosts: 0,
					payrollCost: 0,
					importSpend: 0,
					cashBefore: 0,
					operatingIncome: 0,
					operatingCashFlow: 0,
					interestAccrued: 0,
					interestPaid: 0,
					interestCapitalized: 0,
					principalBorrowed: 0,
					principalRepaid: 0,
					refinancedPrincipal: 0,
					financingCashFlow: 0,
					netCashChange: 0,
					netIncome: 0,
					cashAfter: game.cash,
					outstandingPrincipalAfter: 0,
					nextLoanPayment: null,
					scorecard: game.scorecard,
					productionReport: {
						produced: [{ materialId: 'snacks', quantity: 8, value: 64, source: 'import' }],
						consumed: [],
						importedInputs: [],
						warehousePulls: [],
						shopImports: [],
						importSpend: 0,
						operatingCost: 0,
						overflowUnits: 0,
						overflowCost: 0,
						warehouseCapacity: 0,
						warehouseUsed: 0,
						railShipments: [],
						railUsage: {},
						cityInventories: []
					},
					storeReports: [],
					modifierImpacts: [],
					modifierLifecycle: [],
					warnings: []
				}
			]
		});

		expect(refreshed.world.revealedCityIds).not.toContain('quarry-works');
	});

	test('reveals quarry-works when a non-active opened industry city holds a finished material', () => {
		expect.assertions(2);
		const base = createNewGame('convenience', 20260802);
		const opened = openWorldCity(
			{
				...base,
				cash: 100_000,
				world: {
					...base.world,
					revealedCityIds: [...base.world.revealedCityIds, 'breadbasket-basin']
				}
			},
			'breadbasket-basin'
		);
		const game: GameState = {
			...opened,
			activeIndustryCityId: 'industry-city',
			cityInventories: opened.cityInventories.map((inventory) =>
				inventory.cityId === 'breadbasket-basin'
					? { ...inventory, materials: { snacks: 1 } }
					: inventory
			)
		};

		const refreshed = refreshWorldProgress(game);

		expect(game.activeIndustryCityId).toBe('industry-city');
		expect(refreshed.world.revealedCityIds).toContain('quarry-works');
	});

	test('reveals garden-borough when the company has four or more stores', () => {
		expect.assertions(1);
		const game = gameStub({
			stores: [
				{ id: 's1', cityId: 'harbor-city' } as GameState['stores'][number],
				{ id: 's2', cityId: 'harbor-city' } as GameState['stores'][number],
				{ id: 's3', cityId: 'harbor-city' } as GameState['stores'][number],
				{ id: 's4', cityId: 'harbor-city' } as GameState['stores'][number]
			]
		});

		expect(refreshWorldProgress(game).world.revealedCityIds).toContain('garden-borough');
	});

	test('does not reveal garden-borough with three stores and no positive report', () => {
		expect.assertions(1);
		const game = gameStub({
			stores: [
				{ id: 's1', cityId: 'harbor-city' } as GameState['stores'][number],
				{ id: 's2', cityId: 'harbor-city' } as GameState['stores'][number],
				{ id: 's3', cityId: 'harbor-city' } as GameState['stores'][number]
			]
		});

		expect(refreshWorldProgress(game).world.revealedCityIds).not.toContain('garden-borough');
	});

	test('reveals garden-borough with positive cash and positive report even with fewer than four stores', () => {
		expect.assertions(1);
		const game = gameStub({
			cash: 1,
			reports: [
				{
					day: 1,
					revenue: 1,
					costOfGoods: 0,
					grossMargin: 1,
					operatingCosts: 0,
					payrollCost: 0,
					importSpend: 0,
					cashBefore: 0,
					operatingIncome: 0,
					operatingCashFlow: 1,
					interestAccrued: 0,
					interestPaid: 0,
					interestCapitalized: 0,
					principalBorrowed: 0,
					principalRepaid: 0,
					refinancedPrincipal: 0,
					financingCashFlow: 0,
					netCashChange: 1,
					netIncome: 1,
					cashAfter: 1,
					outstandingPrincipalAfter: 0,
					nextLoanPayment: null,
					scorecard: { profit: 50, customerSatisfaction: 50, staffMorale: 50, marketPosition: 50 },
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
						warehouseUsed: 0,
						railShipments: [],
						railUsage: {},
						cityInventories: []
					},
					storeReports: [],
					modifierImpacts: [],
					modifierLifecycle: [],
					warnings: []
				}
			]
		});

		expect(refreshWorldProgress(game).world.revealedCityIds).toContain('garden-borough');
	});

	test('selecting unknown or unopened cities leaves game unchanged without decisions', () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260530);

		const unknown = selectWorldCity(game, 'missing-city' as Parameters<typeof selectWorldCity>[1]);
		const unopened = selectWorldCity(game, 'campus-junction');

		expect(unknown).toBe(game);
		expect(unknown.decisions).toHaveLength(0);
		expect(unopened).toBe(game);
		expect(unopened.decisions).toHaveLength(0);
	});

	test('reveals quarry-works when finished material was produced locally even if warehouse is empty', () => {
		expect.assertions(2);
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

		// Warehouse is empty but the latest report records locally produced snacks.
		const withProducedReport = refreshWorldProgress({
			...rawGame,
			reports: [
				{
					day: rawGame.day,
					revenue: 0,
					costOfGoods: 0,
					grossMargin: 0,
					operatingCosts: 0,
					payrollCost: 0,
					importSpend: 0,
					cashBefore: 0,
					operatingIncome: 0,
					operatingCashFlow: 0,
					interestAccrued: 0,
					interestPaid: 0,
					interestCapitalized: 0,
					principalBorrowed: 0,
					principalRepaid: 0,
					refinancedPrincipal: 0,
					financingCashFlow: 0,
					netCashChange: 0,
					netIncome: 0,
					cashAfter: rawGame.cash,
					outstandingPrincipalAfter: 0,
					nextLoanPayment: null,
					scorecard: rawGame.scorecard,
					productionReport: {
						produced: [
							{
								cityId: 'industry-city',
								materialId: 'snacks',
								quantity: 8,
								value: 64,
								source: 'local'
							}
						],
						consumed: [],
						importedInputs: [],
						warehousePulls: [{ materialId: 'snacks', quantity: 8, value: 64, source: 'warehouse' }],
						shopImports: [],
						importSpend: 0,
						operatingCost: 0,
						overflowUnits: 0,
						overflowCost: 0,
						warehouseCapacity: 100,
						warehouseUsed: 0,
						railShipments: [],
						railUsage: {},
						cityInventories: []
					},
					storeReports: [],
					modifierImpacts: [],
					modifierLifecycle: [],
					warnings: []
				}
			]
		});

		expect(withProducedReport.world.revealedCityIds).toContain('breadbasket-basin');
		expect(withProducedReport.world.revealedCityIds).toContain('quarry-works');
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
			cityInventories: rawGame.cityInventories!.map((inventory) =>
				inventory.cityId === 'industry-city'
					? { ...inventory, materials: { snacks: 1 } }
					: inventory
			)
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
					cashBefore: 0,
					operatingIncome: 0,
					operatingCashFlow: 1,
					interestAccrued: 0,
					interestPaid: 0,
					interestCapitalized: 0,
					principalBorrowed: 0,
					principalRepaid: 0,
					refinancedPrincipal: 0,
					financingCashFlow: 0,
					netCashChange: 1,
					netIncome: 1,
					cashAfter: 90_001,
					outstandingPrincipalAfter: 0,
					nextLoanPayment: null,
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
						warehouseUsed: 0,
						railShipments: [],
						railUsage: {},
						cityInventories: []
					},
					storeReports: [],
					modifierImpacts: [],
					modifierLifecycle: [],
					warnings: []
				}
			]
		});

		expect(rawGame.world.revealedCityIds).toContain('breadbasket-basin');
		expect(finishedGame.world.revealedCityIds).toContain('quarry-works');
		expect(reportedGame.world.revealedCityIds).toContain('garden-borough');
	});

	test('claims positive-income-store-cap milestone when a non-harbor retail city is open and a report has positive income', () => {
		expect.assertions(4);
		const game = createNewGame('convenience', 20260530);
		const opened: GameState = {
			...game,
			cash: 50_000,
			world: {
				revealedCityIds: [...game.world.revealedCityIds, 'campus-junction'],
				openedCityIds: [...game.world.openedCityIds],
				claimedMilestoneIds: []
			}
		};
		const withCampus = openWorldCity(opened, 'campus-junction');
		const baseCap = withCampus.storeCap;

		const withReport = refreshWorldProgress({
			...withCampus,
			reports: [
				{
					day: withCampus.day,
					revenue: 1,
					costOfGoods: 0,
					grossMargin: 1,
					operatingCosts: 0,
					payrollCost: 0,
					importSpend: 0,
					cashBefore: 0,
					operatingIncome: 0,
					operatingCashFlow: 1,
					interestAccrued: 0,
					interestPaid: 0,
					interestCapitalized: 0,
					principalBorrowed: 0,
					principalRepaid: 0,
					refinancedPrincipal: 0,
					financingCashFlow: 0,
					netCashChange: 1,
					netIncome: 1,
					cashAfter: withCampus.cash + 1,
					outstandingPrincipalAfter: 0,
					nextLoanPayment: null,
					scorecard: withCampus.scorecard,
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
						warehouseUsed: 0,
						railShipments: [],
						railUsage: {},
						cityInventories: []
					},
					storeReports: [],
					modifierImpacts: [],
					modifierLifecycle: [],
					warnings: []
				}
			]
		});

		expect(withReport.world.claimedMilestoneIds).toContain('positive-income-store-cap');
		expect(withReport.storeCap).toBe(baseCap + 1);

		// Idempotent: second refresh with same state does not increase cap again
		const refreshed = refreshWorldProgress(withReport);
		expect(refreshed.storeCap).toBe(withReport.storeCap);
		expect(
			refreshed.world.claimedMilestoneIds.filter((id) => id === 'positive-income-store-cap')
		).toHaveLength(1);
	});

	test('does not claim positive-income-store-cap when only harbor-city is open', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 20260530);
		const withReport = refreshWorldProgress({
			...game,
			reports: [
				{
					day: game.day,
					revenue: 1,
					costOfGoods: 0,
					grossMargin: 1,
					operatingCosts: 0,
					payrollCost: 0,
					importSpend: 0,
					cashBefore: 0,
					operatingIncome: 0,
					operatingCashFlow: 1,
					interestAccrued: 0,
					interestPaid: 0,
					interestCapitalized: 0,
					principalBorrowed: 0,
					principalRepaid: 0,
					refinancedPrincipal: 0,
					financingCashFlow: 0,
					netCashChange: 1,
					netIncome: 1,
					cashAfter: game.cash + 1,
					outstandingPrincipalAfter: 0,
					nextLoanPayment: null,
					scorecard: game.scorecard,
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
						warehouseUsed: 0,
						railShipments: [],
						railUsage: {},
						cityInventories: []
					},
					storeReports: [],
					modifierImpacts: [],
					modifierLifecycle: [],
					warnings: []
				}
			]
		});

		expect(withReport.world.claimedMilestoneIds).not.toContain('positive-income-store-cap');
	});
});

describe('world city status and decision helpers', () => {
	test('getWorldCityStatus counts industrial buildings located in the requested city', () => {
		expect.assertions(3);
		const game = gameStub({
			industrialBuildings: [
				{
					id: 'b1',
					cityId: 'industry-city',
					typeId: 'grain-farm'
				} as GameState['industrialBuildings'][number],
				{
					id: 'b2',
					cityId: 'industry-city',
					typeId: 'warehouse'
				} as GameState['industrialBuildings'][number],
				{
					id: 'b3',
					cityId: 'harbor-city',
					typeId: 'warehouse'
				} as GameState['industrialBuildings'][number]
			]
		});

		const status = getWorldCityStatus(game, 'industry-city');

		expect(status).not.toBeNull();
		expect(status!.buildingCount).toBe(2);
		expect(status!.storeCount).toBe(0);
	});

	test('openWorldCity does not duplicate an already-appended world decision', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260530);

		const once = openWorldCity(game, 'missing-city');
		const twice = openWorldCity(once, 'missing-city');

		expect(once.decisions).toHaveLength(1);
		expect(twice).toBe(once);
		expect(twice.decisions).toHaveLength(1);
	});

	test('getIndustryCityResourceProfile returns the profile for industry cities and null otherwise', () => {
		expect.assertions(3);

		expect(getIndustryCityResourceProfile('industry-city')).not.toBeNull();
		expect(getIndustryCityResourceProfile('harbor-city')).toBeNull();
		expect(getIndustryCityResourceProfile('missing-city')).toBeNull();
	});

	test('getWorldCityStatus returns null for an unknown city id', () => {
		expect.assertions(1);
		const game = gameStub();

		expect(getWorldCityStatus(game, 'missing-city')).toBeNull();
	});

	test('openWorldCity does not duplicate a retail city already present in game.cities', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260530);
		const campusCity = generateCity({
			id: 'campus-junction',
			name: 'Campus Junction',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260531
		});
		const revealed: GameState = {
			...game,
			cash: 50_000,
			cities: [...game.cities, campusCity],
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'campus-junction']
			}
		};

		const opened = openWorldCity(revealed, 'campus-junction');

		expect(opened.world.openedCityIds).toContain('campus-junction');
		expect(opened.cities.filter((city) => city.id === 'campus-junction')).toHaveLength(1);
	});

	test('openWorldCity does not duplicate an industry city already present in game.industryCities', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260530);
		const basinCity = generateIndustryCity({
			id: 'breadbasket-basin',
			name: 'Breadbasket Basin',
			width: 18,
			height: 18,
			seed: 20260533,
			resourceProfile: getIndustryCityResourceProfile('breadbasket-basin') ?? undefined
		});
		const revealed: GameState = {
			...game,
			cash: 50_000,
			industryCities: [...game.industryCities, basinCity],
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'breadbasket-basin']
			}
		};

		const opened = openWorldCity(revealed, 'breadbasket-basin');

		expect(opened.world.openedCityIds).toContain('breadbasket-basin');
		expect(opened.industryCities.filter((city) => city.id === 'breadbasket-basin')).toHaveLength(1);
	});

	test('isWorldCityId narrows known city ids and rejects unknown strings', () => {
		expect.assertions(3);
		expect(isWorldCityId('harbor-city')).toBe(true);
		expect(isWorldCityId('campus-junction')).toBe(true);
		expect(isWorldCityId('not-a-city')).toBe(false);
	});

	test('getRetailCityDemandMultiplier returns the profile multiplier, defaulting to 1', () => {
		expect.assertions(3);
		const game = gameStub();
		// campus-junction boosts `games` demand to 1.35
		expect(getRetailCityDemandMultiplier(game, 'campus-junction', 'games')).toBeCloseTo(1.35);
		// harbor-city has an empty demand profile -> default multiplier
		expect(getRetailCityDemandMultiplier(game, 'harbor-city', 'games')).toBe(1);
		// unknown city -> default multiplier
		expect(getRetailCityDemandMultiplier(game, 'not-a-city', 'games')).toBe(1);
	});
});
