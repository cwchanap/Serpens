import { describe, expect, test } from 'vitest';
import { getCompanyBookValue } from './companyBookValue';
import { getTileById } from './city';
import { getTotalDebt } from './finance';
import { MATERIALS } from './industry';
import { getStoreUpgradeCost } from './leveling';
import { PRODUCTS } from './products';
import { RAIL_BUILD_COST_PER_CELL, RAIL_UPGRADE_COST_PER_CELL_PER_LEVEL } from './rail';
import { createNewGame, getExpansionSetupCost } from './state';
import { WORLD_CITY_CATALOG } from './worldCatalog';
import type {
	CityTile,
	GameState,
	IndustrialBuilding,
	LoanInstrument,
	Store,
	StoreProduct,
	TransferOrder
} from './types';

/** Outstanding synthetic loan of `principal` used to author exact debt fixtures. */
function makeLoan(id: string, principal: number): LoanInstrument {
	return {
		id,
		purpose: 'workingCapital',
		status: 'active',
		openedOnDay: 1,
		originalPrincipal: principal,
		remainingPrincipal: principal,
		annualInterestRateBps: 1_200,
		termDays: 84,
		installmentsProcessed: 0,
		nextPaymentDay: 8,
		lastInterestAccrualDay: 1,
		accruedInterestMicros: 0,
		overdueInterest: 0,
		overduePrincipal: 0,
		arrearsSinceDay: null,
		scheduledPaymentCount: 0,
		onTimePaymentCount: 0,
		missedPaymentCount: 0
	};
}

function makeProduct(productId: StoreProduct['productId'], quantity: number): StoreProduct {
	const definition = PRODUCTS[productId];
	return {
		productId,
		brandId: definition.defaultBrandId,
		lots: [{ receivedDay: 1, quantity }],
		reorderThreshold: 0,
		targetStock: 0,
		sellingPrice: definition.defaultSellingPrice
	};
}

/**
 * Design-spec §1 hand fixture: cash 40,000 + nonfounding store setup 12,000 +
 * level-2 store upgrade 8,000 + level-2 $600 building (600 + 5,000) +
 * level-2 rail cell 70 + $20 store stock + $15 material stock − debt 10,000
 * = $55,705. No paid city opening.
 */
function buildHandFixtureGame(): GameState {
	const game = createNewGame('convenience', 20260508);

	// Synthetic expansion tile tuned so getExpansionSetupCost = 12,000:
	// 9,000 + rent 36 × 2.5 + convenience baseRent 115 × 18 + demandScore 35 × 24.
	const expansionTile: CityTile = {
		id: 'fixture-expansion-tile',
		cityId: 'harbor-city',
		x: 55,
		y: 47,
		neighborhood: 'downtown',
		terrain: 'green',
		feature: null,
		demand: 35,
		rent: 36,
		footTraffic: 35,
		customerFit: 35,
		locked: false
	};

	const city = game.cities[0]!;
	const expansionStore: Store = {
		...game.stores[0]!,
		id: 'store-2',
		name: 'Fixture Expansion',
		level: 2,
		cityId: city.id,
		tileId: expansionTile.id,
		mapX: expansionTile.x,
		mapY: expansionTile.y,
		products: []
	};

	const building: IndustrialBuilding = {
		id: 'fixture-building-1',
		level: 2,
		typeId: 'grain-farm', // buildCost 600
		cityId: 'industry-city',
		tileId: 'fixture-industry-tile',
		mapX: 10,
		mapY: 10,
		status: 'produced',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {}
	};

	return {
		...game,
		cash: 40_000,
		finance: { ...game.finance, loans: [makeLoan('loan-fixture', 10_000)] },
		cities: [{ ...city, tiles: [...city.tiles, expansionTile] }],
		stores: [{ ...game.stores[0]!, products: [makeProduct('bottled-water', 20)] }, expansionStore],
		industryCities: [{ ...game.industryCities[0]!, rails: [{ x: 10, y: 10, level: 2 }] }],
		industrialBuildings: [building],
		cityInventories: [
			{ cityId: 'harbor-city', materials: {} },
			{ cityId: 'industry-city', materials: { salt: 15 } }
		]
	};
}

function makeInTransitOrder(quantity: number, status: TransferOrder['status']): TransferOrder {
	return {
		id: 'transfer-fixture-1',
		source: { kind: 'manual' },
		originCityId: 'harbor-city',
		destinationCityId: 'industry-city',
		materialId: 'oilseeds',
		quantity,
		createdOnDay: 1,
		dispatchedOnDay: 1,
		arrivalOnDay: 3,
		transportCost: 20,
		status
	};
}

describe('getCompanyBookValue', () => {
	test('design hand fixture totals $55,705 with the full breakdown', () => {
		const game = buildHandFixtureGame();

		// The fixture tile is self-verifying: the expansion store's setup cost
		// must be exactly the design's 12,000.
		const store2 = game.stores.find((store) => store.id === 'store-2')!;
		const city = game.cities.find((candidate) => candidate.id === store2.cityId)!;
		const tile = getTileById(city, store2.tileId)!;
		expect(getExpansionSetupCost(tile, store2.archetypeId)).toBe(12_000);

		const breakdown = getCompanyBookValue(game);
		expect(breakdown).toEqual({
			total: 55_705,
			cash: 40_000,
			retailAssets: 20_000, // 12,000 setup + 8,000 level-1→2 upgrade
			cityAccessAssets: 0, // starter cities only; no paid opening
			industryAssets: 5_600, // grain-farm 600 + level-1→2 upgrade 5,000
			railAssets: RAIL_BUILD_COST_PER_CELL + RAIL_UPGRADE_COST_PER_CELL_PER_LEVEL, // 70
			inventory: 35, // 20 bottled-water × $1 + 15 salt × $1
			debt: 10_000
		});
		expect(breakdown.total).toBe(55_705);
		expect(getTotalDebt(game)).toBe(10_000);
	});

	test('founding store-1 contributes zero setup cost; its upgrades still count', () => {
		const game = createNewGame('convenience', 20260508);
		const foundling = {
			...game,
			stores: game.stores.map((store) => ({ ...store, products: [] }))
		};
		expect(getCompanyBookValue(foundling).retailAssets).toBe(0);

		const leveled = {
			...game,
			stores: game.stores.map((store) => ({ ...store, products: [], level: 2 }))
		};
		expect(getCompanyBookValue(leveled).retailAssets).toBe(getStoreUpgradeCost(1));
	});

	test('opening a paid city exchanges cash for an equal city-access right (no phantom value)', () => {
		const beforeGame = buildHandFixtureGame();
		const afterGame = structuredClone(beforeGame);
		const campus = WORLD_CITY_CATALOG.find((city) => city.id === 'campus-junction')!;
		expect(campus.openingCost).toBeGreaterThan(0);

		afterGame.world = {
			...afterGame.world,
			openedCityIds: [...afterGame.world.openedCityIds, campus.id]
		};
		afterGame.cash = beforeGame.cash - campus.openingCost;

		const before = getCompanyBookValue(beforeGame);
		const after = getCompanyBookValue(afterGame);
		expect(after.cityAccessAssets).toBe(campus.openingCost);
		expect(after.total).toBe(before.total);
	});

	test('zero-history game with empty inventory values only cash minus debt', () => {
		const game = createNewGame('convenience', 20260508);
		const empty: GameState = {
			...game,
			stores: game.stores.map((store) => ({ ...store, products: [] })),
			industrialBuildings: [],
			industryCities: game.industryCities.map((city) => ({ ...city, rails: [] })),
			cityInventories: game.cityInventories.map((inventory) => ({
				...inventory,
				materials: {}
			})),
			logistics: { ...game.logistics, transferOrders: [] }
		};

		expect(getCompanyBookValue(empty)).toEqual({
			total: 24_000,
			cash: 32_000,
			retailAssets: 0,
			cityAccessAssets: 0,
			industryAssets: 0,
			railAssets: 0,
			inventory: 0,
			debt: 8_000
		});
	});

	test('out-of-catalog product ids contribute zero inventory value', () => {
		const game = createNewGame('convenience', 20260508);
		const [store] = game.stores;
		const synthetic: GameState = {
			...game,
			stores: [
				{
					...store,
					products: [
						...store.products,
						{
							productId: 'unknown-category' as StoreProduct['productId'],
							brandId: 'common-ground',
							lots: [{ receivedDay: 1, quantity: 10 }],
							reorderThreshold: 5,
							targetStock: 20,
							sellingPrice: 5
						}
					]
				}
			]
		};
		const baseline = getCompanyBookValue(game);

		// The sales pipeline tolerates synthetic category fixtures; book value
		// must survive them too instead of crashing on the missing catalog entry.
		expect(getCompanyBookValue(synthetic).inventory).toBe(baseline.inventory);
	});

	test('max-level store counts every completed upgrade level', () => {
		const game = buildHandFixtureGame();
		const maxed: GameState = {
			...game,
			stores: game.stores.map((store) => (store.id === 'store-2' ? { ...store, level: 10 } : store))
		};

		// Completed upgrades for levels 1..9 = 8,000 × (1+…+9) = 360,000.
		const expectedUpgrades = Array.from({ length: 9 }, (_, index) =>
			getStoreUpgradeCost(index + 1)
		).reduce((total, cost) => total + cost, 0);
		expect(expectedUpgrades).toBe(360_000);
		expect(getCompanyBookValue(maxed).retailAssets).toBe(12_000 + expectedUpgrades);
	});

	test('demolished industry buildings and removed rail cells contribute zero', () => {
		const withAssets = buildHandFixtureGame();
		const stripped: GameState = {
			...withAssets,
			industrialBuildings: [],
			industryCities: withAssets.industryCities.map((city) => ({ ...city, rails: [] }))
		};

		const valued = getCompanyBookValue(withAssets);
		const cleared = getCompanyBookValue(stripped);
		expect(valued.industryAssets).toBe(600 + 5_000);
		expect(valued.railAssets).toBe(70);
		expect(cleared.industryAssets).toBe(0);
		expect(cleared.railAssets).toBe(0);
		expect(cleared.total).toBe(valued.total - 5_670);
	});

	test('transfer lifecycle: in-transit counted once, delivered excluded, dispatch removed origin units', () => {
		const game = buildHandFixtureGame();
		// Dispatch removed the 10 oilseeds from the origin's on-hand inventory:
		// harbor-city holds nothing of the transferred material.
		const dispatched: GameState = {
			...game,
			cityInventories: [
				{ cityId: 'harbor-city', materials: {} },
				{ cityId: 'industry-city', materials: { salt: 15 } }
			],
			logistics: {
				...game.logistics,
				transferOrders: [makeInTransitOrder(10, 'in-transit')]
			}
		};

		const inTransit = getCompanyBookValue(dispatched);
		// 35 fixture stock + 10 oilseeds × $3 in transit, counted exactly once.
		expect(inTransit.inventory).toBe(35 + 10 * MATERIALS.oilseeds.importCost);
		expect(inTransit.inventory).toBe(65);

		// After delivery the units sit in the destination's on-hand inventory
		// and the delivered order itself contributes nothing.
		const arrived: GameState = {
			...dispatched,
			cityInventories: [
				{ cityId: 'harbor-city', materials: {} },
				{ cityId: 'industry-city', materials: { salt: 15, oilseeds: 10 } }
			],
			logistics: {
				...game.logistics,
				transferOrders: [makeInTransitOrder(10, 'delivered')]
			}
		};

		const delivered = getCompanyBookValue(arrived);
		expect(delivered.inventory).toBe(65);
		expect(delivered.inventory).toBe(inTransit.inventory);
	});

	test('a new loan raises cash and debt together and is book-value neutral', () => {
		const unleveraged = buildHandFixtureGame();
		const leveraged = structuredClone(unleveraged);
		leveraged.cash = unleveraged.cash + 10_000;
		leveraged.finance = {
			...unleveraged.finance,
			loans: [...unleveraged.finance.loans, makeLoan('loan-extra', 10_000)]
		};

		const before = getCompanyBookValue(unleveraged);
		const after = getCompanyBookValue(leveraged);
		expect(after.cash).toBe(before.cash + 10_000);
		expect(after.debt).toBe(before.debt + 10_000);
		expect(after.total).toBe(before.total);
	});

	test('fractional catalog values are summed exactly and the total is rounded once', () => {
		const game = createNewGame('convenience', 20260508);
		const fractional: GameState = {
			...game,
			cash: 100,
			finance: { ...game.finance, loans: [] },
			stores: game.stores.map((store) =>
				store.id === 'store-1'
					? {
							...store,
							products: [
								{
									...makeProduct('pantry', 1),
									lots: [
										{ receivedDay: 1, quantity: 1 },
										{ receivedDay: 1, quantity: 1 },
										{ receivedDay: 2, quantity: 1 }
									]
								}
							]
						}
					: store
			)
		};
		expect(PRODUCTS.pantry.importCost).toBe(1.5);

		const breakdown = getCompanyBookValue(fractional);
		expect(breakdown.inventory).toBe(4.5); // three lots × 1.5, not independently rounded
		expect(breakdown.total).toBe(105); // single rounding of 100 + 4.5
	});

	test('fractional totals in (-0.5, 0) normalize to +0, not -0', () => {
		const game = createNewGame('convenience', 20260508);
		const nearZero: GameState = {
			...game,
			cash: -10.9,
			finance: { ...game.finance, loans: [] },
			stores: game.stores.map((store) =>
				store.id === 'store-1'
					? { ...store, products: [makeProduct('pantry', 7)] } // 7 × $1.50 = $10.50
					: { ...store, products: [] }
			),
			industrialBuildings: [],
			industryCities: game.industryCities.map((city) => ({ ...city, rails: [] })),
			cityInventories: game.cityInventories.map((inventory) => ({
				...inventory,
				materials: {}
			})),
			logistics: { ...game.logistics, transferOrders: [] }
		};

		const breakdown = getCompanyBookValue(nearZero);
		expect(breakdown.inventory).toBe(10.5);
		expect(breakdown.total).toBe(0);
		expect(Object.is(breakdown.total, -0)).toBe(false);
	});

	test('negative totals are preserved, never clamped to zero', () => {
		const game = createNewGame('convenience', 20260508);
		const underwater: GameState = {
			...game,
			cash: 0,
			finance: { ...game.finance, loans: [makeLoan('loan-under', 10_000)] },
			stores: game.stores.map((store) => ({ ...store, products: [] })),
			industrialBuildings: [],
			industryCities: game.industryCities.map((city) => ({ ...city, rails: [] })),
			cityInventories: game.cityInventories.map((inventory) => ({
				...inventory,
				materials: {}
			})),
			logistics: { ...game.logistics, transferOrders: [] }
		};

		expect(getCompanyBookValue(underwater).total).toBe(-10_000);
	});

	test('valuation is deterministic and never mutates the game state', () => {
		const game = buildHandFixtureGame();
		const snapshot = structuredClone(game);

		const first = getCompanyBookValue(game);
		const second = getCompanyBookValue(game);

		expect(first).toEqual(second);
		expect(game).toEqual(snapshot);
	});
});
