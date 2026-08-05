import { afterEach, describe, expect, it, vi } from 'vitest';
import { openStoreAtTile } from './placement';
import { buildProductChainTree, buildStoreCategoryChainSummaries } from './productChainTree';
import { createNewGame } from './state';
import { openWorldCity } from './world';
import { MATERIAL_PRODUCER_RECIPES } from './productChainGraph';
import {
	createCityTileLookup,
	getOccupiedStoreTileIds,
	getStoreFootprintPlacementBlockReason
} from './storeFootprint';
import type {
	CityTile,
	DailyProductReport,
	DailyProductionReport,
	DailyStoreReport,
	GameState,
	IndustrialBuilding,
	MaterialId,
	Store,
	WorldCityId
} from './types';

// Patch isSupportedFinishedMaterial to admit a synthetic 'fake-finished' category
// so the defensive-branch test (buildProductChainTree with no producer recipe) can
// exercise the "supported but no chain" path without adding a real recipe.
// MATERIAL_PRODUCER_RECIPES is copied into a mutable Map so the
// noProductionRecipe defensive test can temporarily remove an entry.
vi.mock('./productChainGraph', async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		MATERIAL_PRODUCER_RECIPES: new Map(actual.MATERIAL_PRODUCER_RECIPES as Map<string, string>),
		isSupportedFinishedMaterial: (categoryId: string): categoryId is MaterialId => {
			if (categoryId === 'fake-finished') return true;
			return (actual.isSupportedFinishedMaterial as (id: string) => boolean)(categoryId);
		}
	};
});

function convenienceGame(): GameState {
	return { ...createNewGame('convenience', 20260611), cash: 1_000_000 };
}

function openedRetailAndIndustryCityGame(): GameState {
	const base = convenienceGame();
	const revealed: GameState = {
		...base,
		world: {
			...base.world,
			revealedCityIds: [...base.world.revealedCityIds, 'campus-junction', 'breadbasket-basin']
		}
	};

	const game = openWorldCity(openWorldCity(revealed, 'campus-junction'), 'breadbasket-basin');
	return {
		...game,
		industrialBuildings: [
			...game.industrialBuildings,
			warehouseBuilding('industry-city', 'industry-city-warehouse'),
			warehouseBuilding('breadbasket-basin', 'breadbasket-basin-warehouse')
		]
	};
}

function warehouseBuilding(cityId: WorldCityId, id: string): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId: 'warehouse',
		cityId,
		tileId: `${cityId}-warehouse`,
		mapX: 0,
		mapY: 0,
		status: 'idle',
		inventory: {},
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0
	};
}

function openedRetailCityGame(): GameState {
	const base = convenienceGame();
	return openWorldCity(
		{
			...base,
			world: {
				...base.world,
				revealedCityIds: [...base.world.revealedCityIds, 'campus-junction']
			}
		},
		'campus-junction'
	);
}

function findAvailableRetailFootprintTile(game: GameState): CityTile {
	const city = game.cities.find((candidate) => candidate.id === game.activeCityId)!;
	const lookup = createCityTileLookup(city);
	const occupiedTileIds = getOccupiedStoreTileIds(city, game.stores as readonly Store[], lookup);

	return city.tiles.find(
		(tile) => getStoreFootprintPlacementBlockReason(lookup, tile, occupiedTileIds) === null
	)!;
}

function emptyProductionReport(
	overrides: Partial<DailyProductionReport> = {}
): DailyProductionReport {
	return {
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
		...overrides,
		cityInventories: overrides.cityInventories ?? []
	};
}

function snackProductReport(overrides: Partial<DailyProductReport> = {}): DailyProductReport {
	return {
		categoryId: 'snacks',
		name: 'Snacks',
		unitsSold: 8,
		demandMissed: 2,
		revenue: 80,
		costOfGoods: 32,
		grossMargin: 48,
		endingStock: 17,
		warehouseUnits: 6,
		warehouseValue: 48,
		importedUnits: 4,
		importCost: 12,
		importSpend: 48,
		...overrides
	};
}

function latestStoreReport(overrides: Partial<DailyStoreReport> = {}): DailyStoreReport {
	return {
		storeId: 'store-1',
		revenue: 120,
		costOfGoods: 50,
		grossMargin: 70,
		operatingCosts: 30,
		importSpend: 0,
		netIncome: 40,
		customersServed: 10,
		demandMissed: 2,
		staffingCoverage: 100,
		staffingShortage: { manager: 0, general: 0 },
		stockHealth: 82,
		staffMorale: 75,
		reputation: 55,
		marketPosition: 48,
		productReports: [
			{
				categoryId: 'snacks',
				name: 'Snacks',
				unitsSold: 8,
				demandMissed: 2,
				revenue: 80,
				costOfGoods: 32,
				grossMargin: 48,
				endingStock: 17,
				warehouseUnits: 6,
				warehouseValue: 48,
				importedUnits: 4,
				importCost: 12,
				importSpend: 48
			}
		],
		warnings: [],
		...overrides,
		replenishment: overrides.replenishment ?? null
	};
}

function financeReportFields() {
	return {
		revenue: 120,
		costOfGoods: 50,
		grossMargin: 70,
		operatingCosts: 30,
		payrollCost: 0,
		cashBefore: 0,
		operatingIncome: 0,
		operatingCashFlow: 40,
		interestAccrued: 0,
		interestPaid: 0,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 0,
		refinancedPrincipal: 0,
		financingCashFlow: 0,
		netCashChange: 40,
		netIncome: 40,
		outstandingPrincipalAfter: 0,
		nextLoanPayment: null
	};
}

function withLatestReport(game: GameState, productionReport: DailyProductionReport): GameState {
	return {
		...game,
		reports: [
			{
				day: game.day,
				...financeReportFields(),
				importSpend: 48,
				cashAfter: game.cash + 40,
				scorecard: game.scorecard,
				productionReport,
				storeReports: [latestStoreReport()],
				modifierImpacts: [],
				modifierLifecycle: [],
				warnings: []
			}
		]
	};
}

describe('buildProductChainTree', () => {
	it('uses the active retail city configured source and rejects an invalid configured source', () => {
		expect.assertions(5);
		let game = openedRetailAndIndustryCityGame();
		game = openStoreAtTile(game, {
			tileId: findAvailableRetailFootprintTile(game).id,
			archetypeId: 'convenience'
		});
		const campusStore = game.stores.find((store) => store.cityId === 'campus-junction')!;
		game = {
			...game,
			activeCityId: 'campus-junction',
			cityInventories: game.cityInventories.map((inventory) =>
				inventory.cityId === 'industry-city'
					? { ...inventory, materials: { snacks: 61 } }
					: { ...inventory, materials: { snacks: 7 } }
			),
			retailSupplyAssignments: game.retailSupplyAssignments.map((assignment) =>
				assignment.retailCityId === 'campus-junction'
					? { ...assignment, supplyCityId: 'breadbasket-basin' }
					: assignment
			)
		};

		const configured = buildProductChainTree({ game, store: campusStore, categoryId: 'snacks' });
		const importsOnly = buildProductChainTree({
			game: {
				...game,
				retailSupplyAssignments: game.retailSupplyAssignments.map((assignment) =>
					assignment.retailCityId === 'campus-junction'
						? { ...assignment, supplyCityId: null }
						: assignment
				)
			},
			store: campusStore,
			categoryId: 'snacks'
		});
		expect(configured.details['product:snacks']?.warehouseStock).toBe(7);
		expect(configured.supplyState).toEqual({
			code: 'available',
			cityId: 'breadbasket-basin',
			capacity: 200
		});
		expect(importsOnly.details['product:snacks']?.warehouseStock).toBe(0);
		expect(importsOnly.supplyState).toEqual({ code: 'imports-only' });
		expect(() =>
			buildProductChainTree({
				game: {
					...game,
					retailSupplyAssignments: game.retailSupplyAssignments.map((assignment) =>
						assignment.retailCityId === 'campus-junction'
							? { ...assignment, supplyCityId: 'quarry-works' }
							: assignment
					)
				},
				store: campusStore,
				categoryId: 'snacks'
			})
		).toThrow('City inventory invariant: city-closed for quarry-works');
	});

	it('keeps active-retail fallback imports visible across valid source states without leaking another retail city', () => {
		let game = openedRetailAndIndustryCityGame();
		game = openStoreAtTile(game, {
			tileId: findAvailableRetailFootprintTile(game).id,
			archetypeId: 'convenience'
		});
		const campusStore = game.stores.find((store) => store.cityId === 'campus-junction')!;
		game = withLatestReport(
			{
				...game,
				activeCityId: 'campus-junction',
				cityInventories: game.cityInventories!.map((inventory) =>
					inventory.cityId === 'breadbasket-basin'
						? { ...inventory, materials: { snacks: 7 } }
						: { ...inventory, materials: { snacks: 61 } }
				),
				retailSupplyAssignments: game.retailSupplyAssignments!.map((assignment) =>
					assignment.retailCityId === 'campus-junction'
						? { ...assignment, supplyCityId: 'breadbasket-basin' }
						: assignment
				)
			},
			emptyProductionReport({
				produced: [
					{
						cityId: 'breadbasket-basin',
						materialId: 'snacks',
						quantity: 8,
						value: 64,
						source: 'local'
					},
					{
						cityId: 'industry-city',
						materialId: 'snacks',
						quantity: 88,
						value: 704,
						source: 'local'
					}
				],
				warehousePulls: [
					{
						cityId: 'breadbasket-basin',
						materialId: 'snacks',
						quantity: 3,
						value: 24,
						source: 'warehouse'
					},
					{
						cityId: 'industry-city',
						materialId: 'snacks',
						quantity: 33,
						value: 264,
						source: 'warehouse'
					}
				],
				shopImports: [
					{
						cityId: 'campus-junction',
						materialId: 'snacks',
						quantity: 4,
						value: 48,
						source: 'import'
					},
					{
						cityId: 'harbor-city',
						materialId: 'snacks',
						quantity: 99,
						value: 1_188,
						source: 'import'
					}
				]
			})
		);

		const configured = buildProductChainTree({ game, store: campusStore, categoryId: 'snacks' });
		const importsOnlyGame: GameState = {
			...game,
			retailSupplyAssignments: game.retailSupplyAssignments!.map((assignment) =>
				assignment.retailCityId === 'campus-junction'
					? { ...assignment, supplyCityId: null }
					: assignment
			)
		};
		const importsOnly = buildProductChainTree({
			game: importsOnlyGame,
			store: campusStore,
			categoryId: 'snacks'
		});
		expect(configured.details['product:snacks']?.actual.produced).toBe(8);
		// Campus has no product report in this latest report (its store has no
		// matching storeReport row), so the root retail material reads 0
		// rather than falling back to the supply-city-tagged warehouse-pull
		// movement, which cannot be attributed to a specific retail city.
		expect(configured.details['product:snacks']?.actual.warehousePulled).toBe(0);
		expect(configured.details['product:snacks']?.actual.shopImported).toBe(4);
		expect(
			buildStoreCategoryChainSummaries(game).find((summary) => summary.categoryId === 'snacks')
				?.imported
		).toBe(4);
		expect(importsOnly.supplyState).toEqual({ code: 'imports-only' });
		expect(importsOnly.details['product:snacks']?.actual).toMatchObject({
			produced: 0,
			warehousePulled: 0,
			shopImported: 4
		});
		expect(
			buildStoreCategoryChainSummaries(importsOnlyGame).find(
				(summary) => summary.categoryId === 'snacks'
			)?.imported
		).toBe(4);
	});

	it('scopes retail warehouse pulls to the active retail city when several retail cities share one supply city', () => {
		// Both warehouse-pull movements are tagged with the supply city
		// (industry-city), not the destination retail city. Without
		// active-city scoping the root material's warehousePulled sums
		// every retail city pulling from the same supply, inflating the
		// metric and potentially flipping health to 'watch'.
		expect.assertions(4);
		let game = openedRetailAndIndustryCityGame();
		game = openStoreAtTile(game, {
			tileId: findAvailableRetailFootprintTile(game).id,
			archetypeId: 'convenience'
		});
		const harborStore = game.stores.find((store) => store.cityId === 'harbor-city')!;
		const campusStore = game.stores.find((store) => store.cityId === 'campus-junction')!;

		game = {
			...game,
			cityInventories: game.cityInventories.map((inventory) =>
				inventory.cityId === 'industry-city'
					? { ...inventory, materials: { snacks: 5 } }
					: inventory
			),
			retailSupplyAssignments: game.retailSupplyAssignments.map((assignment) =>
				assignment.retailCityId === 'campus-junction' || assignment.retailCityId === 'harbor-city'
					? { ...assignment, supplyCityId: 'industry-city' }
					: assignment
			),
			reports: [
				{
					day: game.day,
					...financeReportFields(),
					importSpend: 0,
					cashAfter: game.cash + 40,
					scorecard: game.scorecard,
					productionReport: emptyProductionReport({
						warehousePulls: [
							{
								cityId: 'industry-city',
								materialId: 'snacks',
								quantity: 3,
								value: 24,
								source: 'warehouse'
							},
							{
								cityId: 'industry-city',
								materialId: 'snacks',
								quantity: 5,
								value: 40,
								source: 'warehouse'
							}
						],
						cityInventories: [
							{
								cityId: 'industry-city',
								capacity: 200,
								used: 5,
								overflowUnits: 0,
								overflowCost: 0
							}
						]
					}),
					storeReports: [
						latestStoreReport({
							storeId: harborStore.id,
							productReports: [
								snackProductReport({
									unitsSold: 3,
									demandMissed: 0,
									warehouseUnits: 3,
									warehouseValue: 24,
									importedUnits: 0,
									importCost: 0,
									importSpend: 0
								})
							]
						}),
						latestStoreReport({
							storeId: campusStore.id,
							productReports: [
								snackProductReport({
									unitsSold: 5,
									demandMissed: 0,
									warehouseUnits: 5,
									warehouseValue: 40,
									importedUnits: 0,
									importCost: 0,
									importSpend: 0
								})
							]
						})
					],
					modifierImpacts: [],
					modifierLifecycle: [],
					warnings: []
				}
			]
		};

		const campusTree = buildProductChainTree({
			game: { ...game, activeCityId: 'campus-junction' },
			store: null,
			categoryId: 'snacks'
		});
		expect(campusTree.details['product:snacks']?.actual.warehousePulled).toBe(5);

		const harborTree = buildProductChainTree({
			game: { ...game, activeCityId: 'harbor-city' },
			store: null,
			categoryId: 'snacks'
		});
		expect(harborTree.details['product:snacks']?.actual.warehousePulled).toBe(3);

		const campusSummaries = buildStoreCategoryChainSummaries({
			...game,
			activeCityId: 'campus-junction'
		});
		expect(campusSummaries.find((summary) => summary.categoryId === 'snacks')?.produced).toBe(0);

		const harborSummaries = buildStoreCategoryChainSummaries({
			...game,
			activeCityId: 'harbor-city'
		});
		expect(harborSummaries.find((summary) => summary.categoryId === 'snacks')?.produced).toBe(0);
	});

	it('does not fall back to shared-source warehouse pulls when the active retail city has no product report yet', () => {
		// Regression: Harbor City replenishes snacks from Industry City, so the
		// latest production report carries a warehouse-pull movement tagged with
		// the supply city (industry-city). Campus Junction is then opened and
		// assigned to the same supply city, but its store has no product report
		// in that latest report (opened after the daily tick). The root retail
		// material's warehousePulled must read 0 — not Harbor's pull — because
		// null productReport for a retail root means "no report yet", not
		// "intermediate material". Falling back to the industry movement array
		// leaks Harbor's pull into Campus and can flip health to 'watch'.
		expect.assertions(3);
		let game = openedRetailAndIndustryCityGame();
		game = openStoreAtTile(game, {
			tileId: findAvailableRetailFootprintTile(game).id,
			archetypeId: 'convenience'
		});
		const harborStore = game.stores.find((store) => store.cityId === 'harbor-city')!;

		game = {
			...game,
			cityInventories: game.cityInventories.map((inventory) =>
				inventory.cityId === 'industry-city'
					? { ...inventory, materials: { snacks: 5 } }
					: inventory
			),
			retailSupplyAssignments: game.retailSupplyAssignments.map((assignment) =>
				assignment.retailCityId === 'campus-junction' || assignment.retailCityId === 'harbor-city'
					? { ...assignment, supplyCityId: 'industry-city' }
					: assignment
			),
			reports: [
				{
					day: game.day,
					...financeReportFields(),
					importSpend: 0,
					cashAfter: game.cash + 40,
					scorecard: game.scorecard,
					productionReport: emptyProductionReport({
						warehousePulls: [
							{
								cityId: 'industry-city',
								materialId: 'snacks',
								quantity: 3,
								value: 24,
								source: 'warehouse'
							}
						],
						cityInventories: [
							{
								cityId: 'industry-city',
								capacity: 200,
								used: 5,
								overflowUnits: 0,
								overflowCost: 0
							}
						]
					}),
					// Only Harbor's store has a snacks product report; Campus's
					// store was opened after this report and has no row yet.
					storeReports: [
						latestStoreReport({
							storeId: harborStore.id,
							productReports: [
								snackProductReport({
									unitsSold: 3,
									demandMissed: 0,
									warehouseUnits: 3,
									warehouseValue: 24,
									importedUnits: 0,
									importCost: 0,
									importSpend: 0
								})
							]
						})
					],
					modifierImpacts: [],
					modifierLifecycle: [],
					warnings: []
				}
			]
		};

		const campusTree = buildProductChainTree({
			game: { ...game, activeCityId: 'campus-junction' },
			store: null,
			categoryId: 'snacks'
		});

		expect(campusTree.details['product:snacks']?.actual.warehousePulled).toBe(0);
		expect(campusTree.details['product:snacks']?.health).not.toBe('watch');

		// Harbor still resolves from its own product report — the fix must not
		// regress the working shared-source case.
		const harborTree = buildProductChainTree({
			game: { ...game, activeCityId: 'harbor-city' },
			store: null,
			categoryId: 'snacks'
		});
		expect(harborTree.details['product:snacks']?.actual.warehousePulled).toBe(3);
	});

	it('does not invent retail ownership for unscoped historical imports', () => {
		// Current report types require attribution; this models an unsafe legacy
		// row so the tree remains defensive at its display boundary.
		const historicalImport = {
			...emptyProductionReport(),
			shopImports: [{ materialId: 'snacks', quantity: 4, value: 48, source: 'import' }]
		} as unknown as DailyProductionReport;
		const oneRetailGame = withLatestReport(convenienceGame(), historicalImport);
		const oneRetailTree = buildProductChainTree({
			game: oneRetailGame,
			store: oneRetailGame.stores[0]!,
			categoryId: 'snacks'
		});

		let twoRetailGame = openedRetailCityGame();
		twoRetailGame = openStoreAtTile(twoRetailGame, {
			tileId: findAvailableRetailFootprintTile(twoRetailGame).id,
			archetypeId: 'convenience'
		});
		const campusStore = twoRetailGame.stores.find((store) => store.cityId === 'campus-junction')!;
		const harborStore = twoRetailGame.stores.find((store) => store.cityId === 'harbor-city')!;
		twoRetailGame = withLatestReport(twoRetailGame, historicalImport);
		const campusGame = { ...twoRetailGame, activeCityId: 'campus-junction' };
		const harborGame = { ...twoRetailGame, activeCityId: 'harbor-city' };
		const campusTree = buildProductChainTree({
			game: campusGame,
			store: campusStore,
			categoryId: 'snacks'
		});
		const harborTree = buildProductChainTree({
			game: harborGame,
			store: harborStore,
			categoryId: 'snacks'
		});

		expect(oneRetailTree.details['product:snacks']?.actual.shopImported).toBe(0);
		expect(
			buildStoreCategoryChainSummaries(oneRetailGame).find(
				(summary) => summary.categoryId === 'snacks'
			)?.imported
		).toBe(0);
		expect(campusTree.details['product:snacks']?.actual.shopImported).toBe(0);
		expect(
			buildStoreCategoryChainSummaries(campusGame).find(
				(summary) => summary.categoryId === 'snacks'
			)?.imported
		).toBe(0);
		expect(harborTree.details['product:snacks']?.actual.shopImported).toBe(0);
		expect(
			buildStoreCategoryChainSummaries(harborGame).find(
				(summary) => summary.categoryId === 'snacks'
			)?.imported
		).toBe(0);
	});

	it('keeps explicit imports-only configuration but rejects a missing retail assignment', () => {
		let game = openedRetailAndIndustryCityGame();
		game = openStoreAtTile(game, {
			tileId: findAvailableRetailFootprintTile(game).id,
			archetypeId: 'convenience'
		});
		const campusStore = game.stores.find((store) => store.cityId === 'campus-junction')!;
		game = { ...game, activeCityId: 'campus-junction' };
		const importsOnlyGame: GameState = {
			...game,
			retailSupplyAssignments: game.retailSupplyAssignments!.map((assignment) =>
				assignment.retailCityId === 'campus-junction'
					? { ...assignment, supplyCityId: null }
					: assignment
			)
		};
		const missingAssignmentGame: GameState = {
			...game,
			retailSupplyAssignments: game.retailSupplyAssignments!.filter(
				(assignment) => assignment.retailCityId !== 'campus-junction'
			)
		};

		expect(
			buildProductChainTree({
				game: importsOnlyGame,
				store: campusStore,
				categoryId: 'snacks'
			}).supplyState
		).toEqual({ code: 'imports-only' });
		expect(() =>
			buildProductChainTree({
				game: missingAssignmentGame,
				store: campusStore,
				categoryId: 'snacks'
			})
		).toThrow('Retail supply invariant: missing assignment for campus-junction');
	});

	it('builds the bottled water chain as a three-node spine', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({
			game,
			store: game.stores[0]!,
			categoryId: 'bottled-water'
		});

		expect(tree.id).toBe('chain:bottled-water');
		expect(tree.emptyReason).toBeNull();
		expect(tree.nodes.map((node) => node.id)).toEqual([
			'recipe:water-pumping@water-bottling',
			'recipe:water-bottling',
			'product:bottled-water'
		]);
		expect(tree.edges.map((edge) => edge.id)).toEqual([
			'recipe:water-bottling->product:bottled-water',
			'recipe:water-pumping@water-bottling->recipe:water-bottling'
		]);
	});

	it('surfaces warehouse stock on a recipe node and labels imported input edges', () => {
		expect.assertions(3);
		let game = convenienceGame();
		game = {
			...game,
			cityInventories: game.cityInventories!.map((inventory) =>
				inventory.cityId === 'industry-city'
					? { ...inventory, materials: { snacks: 12 } }
					: inventory
			)
		};
		game = withLatestReport(
			game,
			emptyProductionReport({
				consumed: [
					{
						cityId: 'industry-city',
						materialId: 'packaging',
						quantity: 2,
						value: 6,
						source: 'import'
					}
				],
				importedInputs: [
					{
						cityId: 'industry-city',
						materialId: 'packaging',
						quantity: 2,
						value: 10,
						source: 'import'
					}
				]
			})
		);

		const tree = buildProductChainTree({ game, store: game.stores[0]!, categoryId: 'snacks' });
		const snackFactory = tree.details['recipe:snack-production']!;
		const packagingNode = tree.details['recipe:packaging-production@snack-production']!;
		const packagingEdge = tree.edges.find(
			(edge) => edge.id === 'recipe:packaging-production@snack-production->recipe:snack-production'
		);

		expect(snackFactory.warehouseStock).toBe(12);
		expect(packagingEdge?.label).toEqual({
			code: 'cycle',
			direction: 'used',
			actual: 2,
			required: 2,
			imported: true
		});
		// Zero placed packaging buildings overrides the material-level shortage
		// signal — the player must build before reports matter.
		expect(packagingNode.health).toBe('no-local-capacity');
	});

	it('gives every non-root node exactly one outgoing edge (tree property)', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'snacks' });

		const sourceCounts = new Map<string, number>();
		for (const edge of tree.edges) {
			sourceCounts.set(edge.source, (sourceCounts.get(edge.source) ?? 0) + 1);
		}
		for (const node of tree.nodes) {
			if (node.id === 'product:snacks') continue;
			expect(sourceCounts.get(node.id), `${node.id} must feed exactly one parent`).toBe(1);
		}
	});

	it('duplicates shared sub-chains per branch with unique path-suffixed ids', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'snacks' });

		const ids = tree.nodes.map((node) => node.id);
		expect(new Set(ids).size).toBe(ids.length);
		// In the snacks chain, packaging pulls pulp + plastic — both sub-chains
		// must appear under the packaging branch with path suffixes.
		expect(ids).toContain('recipe:pulp-milling@snack-production/packaging-production');
		expect(ids).toContain('recipe:plastic-production@snack-production/packaging-production');
	});

	it('marks duplicated producers with a shared branch count', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'drinks' });

		// Water pumping feeds filtration directly and syrup production in the drinks chain.
		const waterCopies = tree.nodes.filter((node) => node.recipeId === 'water-pumping');
		expect(waterCopies.length).toBeGreaterThanOrEqual(2);
		for (const copy of waterCopies) {
			expect(copy.sharedBranchCount).toBe(waterCopies.length);
		}
	});

	it('lays out a planar tree: each parent row sits within its children rows', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'snacks' });

		const byId = tree.details;
		const childrenOf = new Map<string, string[]>();
		for (const edge of tree.edges) {
			childrenOf.set(edge.target, [...(childrenOf.get(edge.target) ?? []), edge.source]);
		}
		for (const [parentId, childIds] of childrenOf) {
			const rows = childIds.map((id) => byId[id]!.row);
			expect(byId[parentId]!.row).toBeGreaterThanOrEqual(Math.min(...rows));
			expect(byId[parentId]!.row).toBeLessThanOrEqual(Math.max(...rows));
			// Every child sits exactly one layer to the left of its parent.
			for (const id of childIds) {
				expect(byId[id]!.layer).toBe(byId[parentId]!.layer - 1);
			}
		}
		// Leaves occupy distinct rows — no overlap.
		const leafRows = tree.nodes.filter((node) => !childrenOf.has(node.id)).map((node) => node.row);
		expect(new Set(leafRows).size).toBe(leafRows.length);
	});

	it('labels merged cards with the building name and output material', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'pantry' });

		const mill = tree.nodes.find(
			(node) => node.id === 'recipe:flour-milling@pantry-goods-production'
		);
		expect(mill?.label).toBe('Flour Mill');
		expect(mill?.subLabel).toBe('Flour');
		expect(mill?.kind).toBe('recipe');
		const root = tree.nodes.find((node) => node.id === 'product:pantry');
		expect(root?.label).toBe('Pantry Goods');
		expect(root?.kind).toBe('material');
	});

	it('flags chains with no placed buildings and no report', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({
			game,
			store: game.stores[0]!,
			categoryId: 'bottled-water'
		});

		expect(tree.warnings).toContainEqual({ code: 'noDailyReport' });
		const bottler = tree.details['recipe:water-bottling']!;
		expect(bottler.health).toBe('no-local-capacity');
		expect(bottler.capacity.buildingCount).toBe(0);
		expect(tree.details['product:bottled-water']!.health).toBe('no-report');
	});

	it('returns an empty graph for categories without chains', () => {
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'apparel' });

		expect(tree.nodes).toEqual([]);
		expect(tree.emptyReason).toBe('noLocalChain');
	});

	it('marks missed finished demand as a shortage even without import movement', () => {
		expect.assertions(3);
		let game = createNewGame('convenience', 20260518);
		game = {
			...game,
			industrialBuildings: [
				...game.industrialBuildings,
				{
					id: 'industry-building-snacks',
					level: 1,
					typeId: 'snack-factory',
					cityId: game.activeIndustryCityId,
					tileId: 'manual-snack-factory',
					mapX: 0,
					mapY: 0,
					status: 'produced',
					lastProduction: [],
					producedTotal: 0,
					importedInputTotal: 0,
					blockedDays: 0,
					inventory: {}
				}
			]
		};
		game = withLatestReport(
			game,
			emptyProductionReport({
				produced: [
					{
						cityId: 'industry-city',
						materialId: 'snacks',
						quantity: 16,
						value: 128,
						source: 'local'
					}
				]
			})
		);
		game = {
			...game,
			reports: [
				{
					...game.reports[0]!,
					storeReports: [
						latestStoreReport({
							productReports: [snackProductReport({ unitsSold: 8, demandMissed: 12 })]
						})
					]
				}
			]
		};

		const tree = buildProductChainTree({ game, store: game.stores[0]!, categoryId: 'snacks' });
		const root = tree.details['product:snacks']!;

		expect(root.actual.demandMissed).toBe(12);
		expect(root.health).toBe('shortage');
		expect(root.bottleneck).toEqual({
			code: 'healthStatus',
			health: 'shortage',
			label: 'Snacks'
		});
	});

	it('scales capacity by throughput multiplier when a producer is upgraded', () => {
		// Snack factory: outputs 8 snacks/cycle; inputs total 11/cycle (6 flour + 2 cooking-oil + 1 salt + 2 packaging).
		// At level 1 (throughput 1.0): output 8, input 11.
		// At level 3 (throughput 1.4): output 11.2, input 15.4.
		expect.assertions(7);
		const base = createNewGame('convenience', 20260518);
		const level1Game: GameState = {
			...base,
			industrialBuildings: [
				...base.industrialBuildings,
				{
					id: 'industry-building-snacks',
					level: 1,
					typeId: 'snack-factory',
					cityId: base.activeIndustryCityId,
					tileId: 'manual-snack-factory',
					mapX: 0,
					mapY: 0,
					status: 'idle',
					lastProduction: [],
					producedTotal: 0,
					importedInputTotal: 0,
					blockedDays: 0,
					inventory: {}
				}
			]
		};
		const level3Game: GameState = {
			...level1Game,
			industrialBuildings: level1Game.industrialBuildings.map((building) =>
				building.id === 'industry-building-snacks' ? { ...building, level: 3 } : building
			)
		};

		const level1Tree = buildProductChainTree({
			game: level1Game,
			store: level1Game.stores[0]!,
			categoryId: 'snacks'
		});
		const level3Tree = buildProductChainTree({
			game: level3Game,
			store: level3Game.stores[0]!,
			categoryId: 'snacks'
		});

		const level1Recipe = level1Tree.details['recipe:snack-production']!;
		const level3Recipe = level3Tree.details['recipe:snack-production']!;

		// buildingCount stays as the raw placed-building count.
		expect(level1Recipe.capacity.buildingCount).toBe(1);
		expect(level3Recipe.capacity.buildingCount).toBe(1);
		// Level-1 capacity is unscaled.
		expect(level1Recipe.capacity.outputPerDay).toBe(8);
		expect(level1Recipe.capacity.inputPerDay).toBe(11);
		// Level-3 capacity is scaled by the 1.4 throughput multiplier. (Capacity is a
		// forecast, so we keep fractional units rather than rounding to integers.)
		expect(level3Recipe.capacity.outputPerDay).toBeCloseTo(11.2, 5);
		expect(level3Recipe.capacity.inputPerDay).toBeCloseTo(15.4, 5);
		// The root product card carries retail metrics; capacity lives on the
		// factory card, so the root node's capacity is intentionally all-zero
		// even though a factory is built and upgraded.
		expect(level3Tree.details['product:snacks']!.capacity).toEqual({
			buildingCount: 0,
			outputPerDay: 0,
			inputPerDay: 0
		});
	});

	it('splits shared input movement across recipe edges feeding different branches', () => {
		expect.assertions(4);
		const game = withLatestReport(
			createNewGame('convenience', 20260518),
			emptyProductionReport({
				consumed: [
					{
						cityId: 'industry-city',
						materialId: 'water',
						quantity: 16,
						value: 16,
						source: 'warehouse'
					}
				],
				warehousePulls: [
					{
						cityId: 'industry-city',
						materialId: 'water',
						quantity: 16,
						value: 16,
						source: 'warehouse'
					}
				]
			})
		);

		const tree = buildProductChainTree({ game, store: game.stores[0]!, categoryId: 'drinks' });
		const filtrationInput = tree.edges.find(
			(edge) =>
				edge.id ===
				'recipe:water-pumping@drink-bottling/water-filtration->recipe:water-filtration@drink-bottling'
		);
		const syrupInput = tree.edges.find(
			(edge) =>
				edge.id ===
				'recipe:water-pumping@drink-bottling/syrup-production->recipe:syrup-production@drink-bottling'
		);

		// The weight map is scoped to recipes reachable in the Drinks tree, so
		// water is split only between filtration (12) + syrup (4) = 16, not the
		// sibling bottled-water chain. filtration gets 16*12/16 = 12 and syrup
		// gets 16*4/16 = 4 — the full 16 units stay inside the displayed chain.
		expect(filtrationInput?.requiredPerCycle).toBe(12);
		expect(filtrationInput?.actualPerDay).toBe(12);
		expect(syrupInput?.requiredPerCycle).toBe(4);
		expect(syrupInput?.actualPerDay).toBe(4);
	});

	it('does not leak input flow to a sibling chain with active production', () => {
		// Regression: when bottled-water is produced, its inferred water use
		// would previously dilute the Drinks tree's allocation even though
		// water-bottling is not part of the Drinks chain. With scoped weights
		// the Drinks tree fully accounts for its own water on its own edges.
		expect.assertions(3);
		const game = withLatestReport(
			createNewGame('convenience', 20260518),
			emptyProductionReport({
				produced: [
					{
						cityId: 'industry-city',
						materialId: 'filtered-water',
						quantity: 10,
						value: 20,
						source: 'local'
					},
					{ cityId: 'industry-city', materialId: 'syrup', quantity: 8, value: 40, source: 'local' },
					{
						cityId: 'industry-city',
						materialId: 'bottled-water',
						quantity: 10,
						value: 50,
						source: 'local'
					}
				],
				consumed: [
					{
						cityId: 'industry-city',
						materialId: 'water',
						quantity: 26,
						value: 26,
						source: 'warehouse'
					}
				],
				warehousePulls: [
					{
						cityId: 'industry-city',
						materialId: 'water',
						quantity: 26,
						value: 26,
						source: 'warehouse'
					}
				]
			})
		);

		const tree = buildProductChainTree({ game, store: game.stores[0]!, categoryId: 'drinks' });
		const filtrationInput = tree.edges.find(
			(edge) =>
				edge.id ===
				'recipe:water-pumping@drink-bottling/water-filtration->recipe:water-filtration@drink-bottling'
		);
		const syrupInput = tree.edges.find(
			(edge) =>
				edge.id ===
				'recipe:water-pumping@drink-bottling/syrup-production->recipe:syrup-production@drink-bottling'
		);

		// inferredPerDay: filtration used 12 water/cycle * 1 cycle (10 produced /
		// 10 output) = 12; syrup used 4 water/cycle * 1 cycle (8 produced / 8
		// output) = 4. water-bottling's inferred 10 is excluded from the Drinks
		// tree, so the two edges sum to 16 — the water the Drinks chain actually
		// used — instead of being diluted across all 26 consumed units.
		expect(filtrationInput?.actualPerDay).toBe(12);
		expect(syrupInput?.actualPerDay).toBe(4);
		expect((filtrationInput?.actualPerDay ?? 0) + (syrupInput?.actualPerDay ?? 0)).toBe(16);
	});

	it('does not absorb shared input movement from other finished chains', () => {
		expect.assertions(4);
		const game = withLatestReport(
			createNewGame('convenience', 20260518),
			emptyProductionReport({
				produced: [
					{
						cityId: 'industry-city',
						materialId: 'snacks',
						quantity: 8,
						value: 64,
						source: 'local'
					},
					{
						cityId: 'industry-city',
						materialId: 'drinks',
						quantity: 10,
						value: 70,
						source: 'local'
					}
				],
				consumed: [
					{
						cityId: 'industry-city',
						materialId: 'packaging',
						quantity: 4,
						value: 12,
						source: 'warehouse'
					}
				],
				warehousePulls: [
					{
						cityId: 'industry-city',
						materialId: 'packaging',
						quantity: 4,
						value: 12,
						source: 'warehouse'
					}
				]
			})
		);

		const snacksTree = buildProductChainTree({
			game,
			store: game.stores[0]!,
			categoryId: 'snacks'
		});
		const drinksTree = buildProductChainTree({
			game,
			store: game.stores[0]!,
			categoryId: 'drinks'
		});
		const snacksPackaging = snacksTree.edges.find(
			(edge) => edge.id === 'recipe:packaging-production@snack-production->recipe:snack-production'
		);
		const drinksPackaging = drinksTree.edges.find(
			(edge) => edge.id === 'recipe:packaging-production@drink-bottling->recipe:drink-bottling'
		);

		expect(snacksPackaging?.actualPerDay).toBe(2);
		expect(snacksPackaging?.label).toEqual({
			code: 'cycle',
			direction: 'used',
			actual: 2,
			required: 2,
			imported: false
		});
		expect(drinksPackaging?.actualPerDay).toBe(2);
		expect(drinksPackaging?.label).toEqual({
			code: 'cycle',
			direction: 'used',
			actual: 2,
			required: 2,
			imported: false
		});
	});
});

describe('buildStoreCategoryChainSummaries (tree)', () => {
	it('uses only active-retail stores and their configured source inventory', () => {
		expect.assertions(2);
		let game = openedRetailAndIndustryCityGame();
		game = openStoreAtTile(game, {
			tileId: findAvailableRetailFootprintTile(game).id,
			archetypeId: 'convenience'
		});
		const harborStore = game.stores.find((store) => store.cityId === 'harbor-city')!;
		const campusStore = game.stores.find((store) => store.cityId === 'campus-junction')!;
		game = withLatestReport(
			{
				...game,
				activeCityId: 'campus-junction',
				cityInventories: game.cityInventories.map((inventory) =>
					inventory.cityId === 'industry-city'
						? { ...inventory, materials: { snacks: 61 } }
						: { ...inventory, materials: { snacks: 7 } }
				),
				retailSupplyAssignments: game.retailSupplyAssignments.map((assignment) =>
					assignment.retailCityId === 'campus-junction'
						? { ...assignment, supplyCityId: 'breadbasket-basin' }
						: assignment
				)
			},
			emptyProductionReport()
		);
		game = {
			...game,
			reports: game.reports.map((report) => ({
				...report,
				storeReports: [
					latestStoreReport({
						storeId: harborStore.id,
						productReports: [snackProductReport({ unitsSold: 100 })]
					}),
					latestStoreReport({
						storeId: campusStore.id,
						productReports: [snackProductReport({ unitsSold: 2 })]
					})
				]
			}))
		};

		const snacks = buildStoreCategoryChainSummaries(game).find(
			(summary) => summary.categoryId === 'snacks'
		);

		expect(snacks?.warehouseStock).toBe(7);
		expect(snacks?.consumed).toBe(2);
	});

	it('lists tier 1 categories first and carries the tier', () => {
		const game = convenienceGame();
		const summaries = buildStoreCategoryChainSummaries(game);

		expect(summaries[0]?.categoryId).toBe('bottled-water');
		expect(summaries[0]?.tier).toBe(1);
		expect(summaries.map((summary) => summary.categoryId)).toContain('snacks');
		const snacks = summaries.find((summary) => summary.categoryId === 'snacks');
		expect(snacks?.tier).toBe(3);
		const tiers = summaries.map((summary) => summary.tier ?? 99);
		expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
	});

	it('uses store sales as consume rate for finished category summaries', () => {
		expect.assertions(4);
		let game = createNewGame('convenience', 20260518);
		game = withLatestReport(
			game,
			emptyProductionReport({
				produced: [
					{ cityId: 'industry-city', materialId: 'snacks', quantity: 8, value: 64, source: 'local' }
				],
				consumed: [
					{
						cityId: 'industry-city',
						materialId: 'flour',
						quantity: 6,
						value: 18,
						source: 'warehouse'
					}
				],
				warehousePulls: [
					{
						cityId: 'industry-city',
						materialId: 'snacks',
						quantity: 6,
						value: 48,
						source: 'warehouse'
					}
				],
				shopImports: [
					{ cityId: 'harbor-city', materialId: 'snacks', quantity: 4, value: 48, source: 'import' }
				]
			})
		);

		const summaries = buildStoreCategoryChainSummaries(game);
		const snacks = summaries.find((summary) => summary.categoryId === 'snacks');

		expect(snacks?.produced).toBe(8);
		expect(snacks?.consumed).toBe(8);
		expect(snacks?.imported).toBe(4);
		expect(snacks?.warehouseStock).toBe(0);
	});

	it('aggregates root-node movement metrics across stores when no store is selected', () => {
		expect.assertions(4);
		let game = { ...createNewGame('convenience', 20260518), cash: 100_000 };
		const expansionTile = findAvailableRetailFootprintTile(game);
		game = openStoreAtTile(game, {
			tileId: expansionTile.id,
			archetypeId: 'convenience'
		});
		const firstStore = game.stores[0]!;
		const secondStore = game.stores[1]!;
		game = {
			...game,
			reports: [
				{
					day: game.day,
					...financeReportFields(),
					importSpend: 0,
					cashAfter: game.cash + 40,
					scorecard: game.scorecard,
					productionReport: emptyProductionReport({
						produced: [
							{
								cityId: 'industry-city',
								materialId: 'snacks',
								quantity: 18,
								value: 144,
								source: 'local'
							}
						],
						warehousePulls: [
							{
								cityId: 'industry-city',
								materialId: 'snacks',
								quantity: 11,
								value: 88,
								source: 'warehouse'
							}
						],
						shopImports: [
							{
								cityId: 'harbor-city',
								materialId: 'snacks',
								quantity: 2,
								value: 24,
								source: 'import'
							}
						]
					}),
					storeReports: [
						latestStoreReport({
							storeId: firstStore.id,
							productReports: [snackProductReport({ unitsSold: 8, demandMissed: 1 })]
						}),
						latestStoreReport({
							storeId: secondStore.id,
							productReports: [
								snackProductReport({
									unitsSold: 5,
									demandMissed: 3,
									warehouseUnits: 5,
									importedUnits: 0,
									importSpend: 0
								})
							]
						})
					],
					modifierImpacts: [],
					modifierLifecycle: [],
					warnings: []
				}
			]
		};

		const tree = buildProductChainTree({ game, store: null, categoryId: 'snacks' });
		const root = tree.details['product:snacks']!;

		expect(root.actual.unitsSold).toBe(13);
		expect(root.actual.demandMissed).toBe(4);
		expect(root.actual.warehousePulled).toBe(11);
		expect(root.actual.shopImported).toBe(2);
	});

	it('aggregates consume rate across every store carrying the same category', () => {
		expect.assertions(3);
		let game = { ...createNewGame('convenience', 20260518), cash: 100_000 };
		const expansionTile = findAvailableRetailFootprintTile(game);
		game = openStoreAtTile(game, {
			tileId: expansionTile.id,
			archetypeId: 'convenience'
		});
		const firstStore = game.stores[0]!;
		const secondStore = game.stores[1]!;
		game = {
			...game,
			reports: [
				{
					day: game.day,
					...financeReportFields(),
					importSpend: 0,
					cashAfter: game.cash + 40,
					scorecard: game.scorecard,
					productionReport: emptyProductionReport({
						produced: [
							{
								cityId: 'industry-city',
								materialId: 'snacks',
								quantity: 8,
								value: 64,
								source: 'local'
							}
						]
					}),
					storeReports: [
						latestStoreReport({
							storeId: firstStore.id,
							productReports: [snackProductReport({ unitsSold: 8 })]
						}),
						latestStoreReport({
							storeId: secondStore.id,
							productReports: [snackProductReport({ unitsSold: 5 })]
						})
					],
					modifierImpacts: [],
					modifierLifecycle: [],
					warnings: []
				}
			]
		};

		const snacks = buildStoreCategoryChainSummaries(game).find(
			(summary) => summary.categoryId === 'snacks'
		);

		expect(snacks?.produced).toBe(8);
		expect(snacks?.consumed).toBe(13);
		expect(snacks?.imported).toBe(0);
	});
});

describe('buildProductChainTree defensive branches', () => {
	const producerMap = MATERIAL_PRODUCER_RECIPES as Map<string, string>;
	const originalWaterRecipe = producerMap.get('water');

	afterEach(() => {
		if (originalWaterRecipe !== undefined) {
			producerMap.set('water', originalWaterRecipe);
		}
	});

	it('returns an empty graph when a supported finished material has no producer recipe', () => {
		expect.assertions(3);
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'fake-finished' });

		expect(tree.nodes).toEqual([]);
		expect(tree.emptyReason).toBe('noLocalChain');
		expect(tree.title).toBe('fake-finished');
	});

	it('warns when a recipe input material has no producer recipe', () => {
		expect.assertions(1);
		// Temporarily remove the 'water' producer entry so the water-bottler
		// recipe's 'water' input has no producer, triggering the
		// noProductionRecipe warning branch.
		producerMap.delete('water');
		const game = convenienceGame();
		const tree = buildProductChainTree({ game, store: null, categoryId: 'bottled-water' });
		expect(tree.warnings).toContainEqual({ code: 'noProductionRecipe', materialId: 'water' });
	});
});
