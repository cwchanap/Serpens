import { describe, expect, test } from 'vitest';
import { getArchetype } from './archetypes';
import { decisionContextLocationGeneric } from './decisionContext';
import { createFoundingGameAtTile } from './placement';
import { isTileInStoreFootprint } from './storeFootprint';
import { calculateStockHealth, createStoreProduct } from './stock';
import {
	createNewGame,
	getExpansionSetupCost,
	openStore,
	resolveDecision,
	updatePolicy,
	upgradeStore
} from './state';
import { simulateDay } from './simulateDay';
import { getStoreUpgradeCost, MAX_STORE_LEVEL } from './leveling';
import type { City, CityTile, GameState } from './types';

type OptionalKeys<T> = {
	[K in keyof T]-?: undefined extends T[K] ? K : never;
}[keyof T];

type OptionalIndustryStateKeys = Extract<
	OptionalKeys<GameState>,
	'industryCities' | 'activeIndustryCityId' | 'industrialBuildings' | 'warehouse'
>;

const industryStateKeysAreRequired: OptionalIndustryStateKeys extends never ? true : false = true;

void industryStateKeysAreRequired;

describe('game state', () => {
	test('creates a new game from an archetype', () => {
		expect.assertions(18);
		const game = createNewGame('boutique', 1001);
		const foundingStore = game.stores[0];

		expect(game.seed).toBe(1001);
		expect(game.day).toBe(1);
		expect(game.stores).toHaveLength(1);
		expect(foundingStore?.archetypeId).toBe('boutique');
		expect(game.policy.pricing).toBe('standard');
		expect(game.scorecard.customerSatisfaction).toBeGreaterThan(0);
		expect(game.cities).toHaveLength(1);
		expect(game.activeCityId).toBe(game.cities[0]?.id);
		expect(foundingStore?.tileId).toBeTruthy();
		expect(foundingStore?.mapX).toBeGreaterThanOrEqual(0);
		expect(game.staff).toHaveLength(3);
		expect(game.staff.filter((staff) => staff.role === 'manager')).toHaveLength(1);
		expect(game.staff.every((staff) => staff.assignedStoreId === foundingStore?.id)).toBe(true);
		expect(game.hiringCandidates).toHaveLength(5);
		expect(game.world.openedCityIds).toEqual(['harbor-city', 'industry-city']);
		expect(game.world.revealedCityIds).toEqual(['harbor-city', 'industry-city']);
		expect(game.world.claimedMilestoneIds).toEqual([]);
		expect(game.storeCap).toBe(3);
	});

	test('creates industry state for a new game', () => {
		expect.assertions(6);
		const game = createNewGame('convenience', 20260512);

		expect(game.industryCities).toHaveLength(1);
		expect(game.activeIndustryCityId).toBe(game.industryCities[0]?.id);
		expect(game.industrialBuildings).toEqual([]);
		expect(game.warehouse.capacity).toBe(0);
		expect(game.warehouse.materials).toEqual({});
		expect(game.warehouse.overflowUnits).toBe(0);
	});

	test('new games keep world progress aligned with generated starter maps', () => {
		expect.assertions(8);
		const game = createNewGame('convenience', 20260512);

		expect(game.cities.map((city) => city.id)).toEqual(['harbor-city']);
		expect(game.cities[0]?.width).toBe(56);
		expect(game.cities[0]?.height).toBe(48);
		expect(game.industryCities.map((city) => city.id)).toEqual(['industry-city']);
		expect(game.industryCities[0]?.width).toBe(56);
		expect(game.industryCities[0]?.height).toBe(48);
		expect(game.world.openedCityIds).toEqual(['harbor-city', 'industry-city']);
		expect(game.storeCap).toBeGreaterThan(game.stores.length);
	});

	test('stores normalized seed values and advances rng state during setup', () => {
		expect.assertions(5);
		const zeroSeed = createNewGame('convenience', 0);
		const negativeSeed = createNewGame('convenience', -5);

		expect(zeroSeed.seed).toBe(1);
		expect(zeroSeed.rngState).not.toBe(1);
		expect(negativeSeed.seed).toBe(5);
		expect(negativeSeed.rngState).not.toBe(5);
		expect(Number.isFinite(zeroSeed.rngState)).toBe(true);
	});

	test('creates product stock rows for the founding store', () => {
		expect.assertions(3);
		const game = createNewGame('grocery', 20260508);
		const store = game.stores[0]!;

		expect(store.products.map((product) => product.categoryId)).toEqual(['produce']);
		expect(store.products.every((product) => product.stock > 0)).toBe(true);
		expect(store.stockHealth).toBe(calculateStockHealth(store.products));
	});

	test('updates company policy immutably', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 22);
		const updated = updatePolicy(game, { pricing: 'premium', inventory: 'generous' });

		expect(updated).not.toBe(game);
		expect(updated.policy.pricing).toBe('premium');
		expect(game.policy.pricing).toBe('standard');
	});

	test('opens stores up to the company store cap', () => {
		expect.assertions(6);
		const game = { ...createNewGame('electronics', 44), storeCap: 2 };
		const second = openStore(game, {
			archetypeId: 'electronics',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 }
		});
		const third = openStore(second, {
			archetypeId: 'electronics',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 }
		});
		const expandedCap = openStore(
			{ ...second, storeCap: 3 },
			{
				archetypeId: 'electronics',
				location: { neighborhoodId: 'downtown', x: 0, y: 0 }
			}
		);

		expect(second.stores).toHaveLength(2);
		expect(second.cash).toBeLessThan(game.cash);
		expect(third.stores).toHaveLength(2);
		expect(third.decisions.at(-1)?.title).toBe('Expansion unavailable');
		expect(third.decisions.at(-1)?.context).toEqual({ code: 'expansionUnavailable', storeCap: 2 });
		expect(expandedCap.stores).toHaveLength(3);
	});

	test('direct store opening uses a map tile in the active city', () => {
		expect.assertions(5);
		const game = createNewGame('electronics', 44);

		const result = openStore(game, {
			archetypeId: 'electronics',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 }
		});
		const openedStore = result.stores.at(-1);

		expect(result.stores).toHaveLength(2);
		expect(openedStore?.cityId).toBe(game.activeCityId);
		expect(openedStore?.tileId).not.toContain('unplaced');
		expect(openedStore?.mapX).toBeGreaterThanOrEqual(0);
		expect(openedStore?.tileId).not.toBe(game.stores[0]?.tileId);
	});

	test('direct store opening skips road and river tiles', () => {
		expect.assertions(4);
		const game = createNewGame('electronics', 44);
		const city = game.cities[0]!;
		const foundingStore = game.stores[0]!;
		const foundingTileId = foundingStore.tileId;
		const riverTile = city.tiles.find((tile) => tile.feature === 'river')!;
		const roadTile = city.tiles.find((tile) => tile.feature === 'road')!;
		// Footprint-aware: a candidate is only genuinely free when it is not part
		// of the founding store's 2x2 footprint (mirrors the picker's occupancy
		// check, which is footprint-aware).
		const buildableTile = city.tiles.find(
			(tile) =>
				tile.feature === null &&
				!tile.locked &&
				tile.id !== foundingTileId &&
				!isTileInStoreFootprint(tile, foundingStore)
		)!;
		const reorderedTileIds = new Set([
			city.tiles[0]!.id,
			riverTile.id,
			roadTile.id,
			buildableTile.id
		]);
		const reorderedCity = {
			...city,
			tiles: [
				city.tiles[0]!,
				riverTile,
				roadTile,
				buildableTile,
				...city.tiles.filter((tile) => !reorderedTileIds.has(tile.id))
			]
		};

		const result = openStore(
			{ ...game, cities: [reorderedCity] },
			{
				archetypeId: 'electronics',
				location: { neighborhoodId: 'downtown', x: 0, y: 0 }
			}
		);
		const openedStore = result.stores.at(-1);

		expect(result.stores).toHaveLength(2);
		expect(openedStore?.tileId).toBe(buildableTile.id);
		expect(openedStore?.tileId).not.toBe(riverTile.id);
		expect(openedStore?.tileId).not.toBe(roadTile.id);
	});

	test('direct store opening reports requested road tile as unavailable', () => {
		expect.assertions(3);
		const game = createNewGame('electronics', 44);
		const city = game.cities[0]!;
		const roadTile = city.tiles.find((tile) => tile.feature === 'road')!;

		const result = openStore(game, {
			archetypeId: 'electronics',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 },
			tileId: roadTile.id
		});

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.id).toBe('location-unavailable-road-1');
		expect(result.decisions.at(-1)?.context).toEqual({ code: 'locationBlocked', reason: 'road' });
	});

	test('expansion unavailable decision carries structured context', () => {
		expect.assertions(2);
		const game = { ...createNewGame('electronics', 44), storeCap: 1 };
		const result = openStore(game, {
			archetypeId: 'electronics',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 }
		});
		const decision = result.decisions.find((d) => d.id.startsWith('expansion-unavailable'));
		expect(decision).toBeDefined();
		expect(decision?.context).toEqual({ code: 'expansionUnavailable', storeCap: 1 });
	});

	test('direct store opening uses the selected expansion archetype', () => {
		expect.assertions(3);
		const game = createNewGame('boutique', 44);

		const result = openStore(game, {
			archetypeId: 'electronics',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 }
		});

		expect(game.stores[0]?.archetypeId).toBe('boutique');
		expect(result.stores.at(-1)?.archetypeId).toBe('electronics');
		expect(result.stores.at(-1)?.products.map((product) => product.categoryId)).toEqual(['games']);
	});

	test('does not duplicate same-day blocked expansion decisions', () => {
		expect.assertions(2);
		const game = createNewGame('electronics', 44);
		const second = openStore(game, {
			archetypeId: 'electronics',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 }
		});
		const third = openStore(second, {
			archetypeId: 'electronics',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 }
		});
		const fourth = openStore(third, {
			archetypeId: 'electronics',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 }
		});
		const fifth = openStore(fourth, {
			archetypeId: 'electronics',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 }
		});

		expect(fifth.decisions).toHaveLength(1);
		expect(fifth.decisions[0]?.id).toBe('expansion-unavailable-1');
	});

	test('resolves a decision by applying effects and removing it', () => {
		expect.assertions(3);
		const game = createNewGame('grocery', 55);
		const decision = {
			id: 'supplier-1',
			title: 'Supplier discount',
			context: decisionContextLocationGeneric(),
			expiresOnDay: 3,
			options: [
				{
					id: 'accept',
					label: 'Accept',
					description: 'Take the savings.',
					effects: { cash: 500, customerSatisfaction: -1, stockHealth: 3 }
				}
			]
		};

		const resolved = resolveDecision({ ...game, decisions: [decision] }, 'supplier-1', 'accept');

		expect(resolved.cash).toBe(game.cash + 500);
		expect(resolved.decisions).toHaveLength(0);
		expect(resolved.scorecard.customerSatisfaction).toBe(game.scorecard.customerSatisfaction - 1);
	});

	test('resolveDecision normalizes world progress on the same command via refreshWorldProgress', () => {
		expect.assertions(3);
		const base = createNewGame('grocery', 55);
		expect(base.world.revealedCityIds).not.toContain('campus-junction');
		const game: GameState = {
			...base,
			day: 7,
			world: {
				...base.world,
				revealedCityIds: ['harbor-city', 'industry-city'],
				claimedMilestoneIds: []
			},
			decisions: [
				{
					id: 'timing-1',
					title: 'Timing probe',
					context: decisionContextLocationGeneric(),
					expiresOnDay: 9,
					options: [{ id: 'ok', label: 'OK', description: 'noop', effects: {} }]
				}
			]
		};

		const resolved = resolveDecision(game, 'timing-1', 'ok');

		expect(resolved.world.revealedCityIds).toContain('campus-junction');
		expect(resolved.world.claimedMilestoneIds).toContain('reveal-campus-junction');
	});

	test('resolves store-level effects and clamps boundaries', () => {
		expect.assertions(4);
		const game = createNewGame('grocery', 55);
		const decision = {
			id: 'store-effects-1',
			title: 'Store recovery plan',
			context: decisionContextLocationGeneric(),
			expiresOnDay: 3,
			options: [
				{
					id: 'approve',
					label: 'Approve',
					description: 'Apply the plan.',
					effects: { stockHealth: 80, staffMorale: -80, reputation: 80 }
				}
			]
		};
		const store = { ...game.stores[0]!, stockHealth: 50, staffMorale: 20, reputation: 40 };

		const resolved = resolveDecision(
			{ ...game, stores: [store], decisions: [decision] },
			'store-effects-1',
			'approve'
		);

		expect(resolved.stores[0]?.stockHealth).toBe(100);
		expect(resolved.stores[0]?.staffMorale).toBe(0);
		expect(resolved.stores[0]?.reputation).toBe(100);
		expect(resolved.decisions).toHaveLength(0);
	});

	test('stock health decision effects adjust product rows and survive the next day', () => {
		expect.assertions(6);
		const game = createNewGame('grocery', 55);
		const decision = {
			id: 'inventory-plan-1',
			title: 'Inventory plan',
			context: decisionContextLocationGeneric(),
			expiresOnDay: 3,
			options: [
				{
					id: 'stock-up',
					label: 'Stock up',
					description: 'Add more stock.',
					effects: { stockHealth: 20 }
				}
			]
		};
		const store = {
			...game.stores[0]!,
			products: game.stores[0]!.products.map((product) => ({
				...product,
				// Scale stock and targetStock up so that the stockHealth effect in
				// resolveDecision (Math.round(targetStock * stockHealth * 0.01)) is
				// large enough to survive next-day sales without rounding away to zero.
				stock: product.targetStock * 3,
				targetStock: product.targetStock * 6
			}))
		};
		const storeWithHealth = { ...store, stockHealth: calculateStockHealth(store.products) };
		const resolved = resolveDecision(
			{ ...game, stores: [storeWithHealth], decisions: [decision] },
			'inventory-plan-1',
			'stock-up'
		);
		const unboostedNextDay = simulateDay({ ...game, stores: [storeWithHealth] });
		const nextDay = simulateDay(resolved);

		expect(resolved.stores[0]!.products[0]!.stock).toBeGreaterThan(
			storeWithHealth.products[0]!.stock
		);
		expect(resolved.stores[0]!.stockHealth).toBe(
			calculateStockHealth(resolved.stores[0]!.products)
		);
		expect(resolved.stores[0]!.stockHealth).toBeGreaterThan(storeWithHealth.stockHealth);
		expect(nextDay.stores[0]!.stockHealth).toBe(calculateStockHealth(nextDay.stores[0]!.products));
		expect(nextDay.stores[0]!.stockHealth).toBeGreaterThan(unboostedNextDay.stores[0]!.stockHealth);
		expect(nextDay.stores[0]!.stockHealth).toBeGreaterThan(0);
	});

	test('upgradeStore deducts cost and increments level on a non-milestone level', () => {
		expect.assertions(3);
		const base = createNewGame('convenience', 20260603);
		const game = { ...base, cash: 100_000 };
		const storeId = game.stores[0]!.id;

		const next = upgradeStore(game, storeId);

		expect(next.stores[0]!.level).toBe(2);
		expect(next.cash).toBe(100_000 - getStoreUpgradeCost(1));
		expect(next.stores[0]!.products).toHaveLength(1); // no new product below level 4
	});

	test('upgradeStore at a milestone unlocks a product and raises capacity', () => {
		expect.assertions(3);
		let game = { ...createNewGame('convenience', 20260603), cash: 1_000_000 };
		const storeId = game.stores[0]!.id;
		const startCapacity = game.stores[0]!.staffCapacity;
		for (let i = 0; i < 3; i++) {
			game = upgradeStore(game, storeId); // reach level 4
		}

		const store = game.stores.find((candidate) => candidate.id === storeId)!;
		expect(store.level).toBe(4);
		expect(store.products.map((product) => product.categoryId)).toEqual([
			'bottled-water',
			'snacks'
		]);
		expect(store.staffCapacity).toBeGreaterThan(startCapacity);
	});

	test('upgradeStore is a no-op when cash is insufficient', () => {
		expect.assertions(1);
		const game = { ...createNewGame('convenience', 20260603), cash: 0 };
		const next = upgradeStore(game, game.stores[0]!.id);
		expect(next).toBe(game);
	});

	test('upgradeStore is a no-op at max level', () => {
		expect.assertions(1);
		const base = createNewGame('convenience', 20260603);
		const maxed = {
			...base,
			cash: 1_000_000,
			stores: [{ ...base.stores[0]!, level: MAX_STORE_LEVEL }]
		};
		expect(upgradeStore(maxed, maxed.stores[0]!.id)).toBe(maxed);
	});

	test('upgradeStore is a no-op when the store id does not exist', () => {
		expect.assertions(1);
		const game = { ...createNewGame('convenience', 20260603), cash: 1_000_000 };
		expect(upgradeStore(game, 'store-does-not-exist')).toBe(game);
	});

	test('upgradeStore milestone at the unlock-count cap adds no category but still raises staff capacity', () => {
		expect.assertions(2);
		const base = createNewGame('convenience', 20260603);
		const store = base.stores[0]!;
		const milestoneUnlockCategory = getArchetype('convenience').startingCategories[1]!;
		const game = {
			...base,
			cash: 1_000_000,
			stores: [
				{
					...store,
					level: 3,
					products: [store.products[0]!, createStoreProduct(milestoneUnlockCategory)]
				}
			]
		};
		const result = upgradeStore(game, store.id);
		const upgraded = result.stores[0]!;
		expect(upgraded.products.map((product) => product.categoryId)).toEqual([
			'bottled-water',
			'snacks'
		]);
		expect(upgraded.staffCapacity).toBeGreaterThan(store.staffCapacity);
	});

	test('simulateDay reflects upgradeStore milestone effects: more products, larger staffCapacity, raised daily staffing requirement', () => {
		expect.assertions(5);
		let game = { ...createNewGame('convenience', 20260603), cash: 1_000_000 };
		const storeId = game.stores[0]!.id;
		const baselineReport = simulateDay(game).reports.at(-1)!;
		const baselineStoreReport = baselineReport.storeReports[0]!;

		for (let i = 0; i < 3; i++) {
			game = upgradeStore(game, storeId); // reach level 4
		}
		expect(game.stores[0]!.level).toBe(4);
		const level4Report = simulateDay(game).reports.at(-1)!;
		const level4StoreReport = level4Report.storeReports[0]!;
		const baselineStore = baselineStoreReport;

		// Milestone grants a new product category.
		expect(level4Report.storeReports[0]!.productReports).toHaveLength(2);
		expect(baselineStore.productReports).toHaveLength(1);

		// Level 4 raises the general-staff requirement from 1 to 2. The store
		// still only has the level-1 starter roster (1 general), so the daily
		// report must show a non-zero general shortage.
		expect(level4StoreReport.staffingShortage.general).toBe(1);
		expect(baselineStore.staffingShortage.general).toBe(0);
	});

	test('openStore appends an expansion-delayed decision when cash is below the setup cost', () => {
		expect.assertions(3);
		const game = { ...createNewGame('electronics', 44), cash: 0 };
		const result = openStore(game, {
			archetypeId: 'electronics',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 }
		});

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.id).toBe('expansion-cash-blocked-1');
		expect(result.decisions.at(-1)?.title).toBe('Expansion delayed');
	});

	test('resolveDecision returns the game unchanged when the decision id is unknown', () => {
		expect.assertions(2);
		const game = createNewGame('grocery', 55);

		const resolved = resolveDecision(game, 'nonexistent-id', 'whatever');

		expect(resolved).toBe(game);
		expect(resolved.decisions).toBe(game.decisions);
	});

	test('resolveDecision leaves store products and stockHealth untouched when the option has no stockHealth effect', () => {
		expect.assertions(3);
		const game = createNewGame('grocery', 55);
		const store = game.stores[0]!;
		const decision = {
			id: 'no-stock-effect-1',
			title: 'Morale boost',
			context: decisionContextLocationGeneric(),
			expiresOnDay: 3,
			options: [
				{
					id: 'approve',
					label: 'Approve',
					description: 'Apply the plan.',
					effects: { staffMorale: 10 }
				}
			]
		};

		const resolved = resolveDecision(
			{ ...game, decisions: [decision] },
			'no-stock-effect-1',
			'approve'
		);

		expect(resolved.stores[0]?.products).toBe(store.products);
		expect(resolved.stores[0]?.stockHealth).toBe(store.stockHealth);
		expect(resolved.stores[0]?.staffMorale).toBe(store.staffMorale + 10);
	});

	test('resolveDecision with a null stockHealth effect adds zero stock and recalculates stockHealth', () => {
		expect.assertions(2);
		const game = createNewGame('grocery', 55);
		const store = game.stores[0]!;
		const decision = {
			id: 'null-stock-effect-1',
			title: 'No-op inventory',
			context: decisionContextLocationGeneric(),
			expiresOnDay: 3,
			options: [
				{
					id: 'approve',
					label: 'Approve',
					description: 'Apply the plan.',
					effects: { stockHealth: null as unknown as number }
				}
			]
		};

		const resolved = resolveDecision(
			{ ...game, stores: [store], decisions: [decision] },
			'null-stock-effect-1',
			'approve'
		);

		expect(resolved.stores[0]?.products[0]?.stock).toBe(store.products[0]!.stock);
		expect(resolved.stores[0]?.stockHealth).toBe(
			calculateStockHealth(resolved.stores[0]!.products)
		);
	});

	test('upgradeStore leaves sibling stores untouched when upgrading one of multiple stores', () => {
		expect.assertions(3);
		const base = createNewGame('convenience', 20260603);
		const game = { ...base, cash: 1_000_000 };
		const withSecond = openStore(game, {
			archetypeId: 'convenience',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 }
		});
		const firstStoreId = withSecond.stores[0]!.id;
		const siblingBefore = withSecond.stores.find((store) => store.id !== firstStoreId)!;

		const upgraded = upgradeStore(withSecond, firstStoreId);

		const siblingAfter = upgraded.stores.find((store) => store.id === siblingBefore.id)!;
		expect(upgraded.stores.find((store) => store.id === firstStoreId)?.level).toBe(2);
		expect(siblingAfter.level).toBe(siblingBefore.level);
		expect(siblingAfter).toBe(siblingBefore);
	});

	test('openStore reports no location when the active city is missing', () => {
		expect.assertions(2);
		const game = { ...createNewGame('electronics', 44), activeCityId: 'missing-city' };
		const result = openStore(game, {
			archetypeId: 'electronics',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 }
		});

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.id).toBe('location-unavailable-1');
	});

	test('openStore reports no location when the requested tile id is unknown', () => {
		expect.assertions(2);
		const game = createNewGame('electronics', 44);
		const result = openStore(game, {
			archetypeId: 'electronics',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 },
			tileId: 'does-not-exist'
		});

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.id).toBe('location-unavailable-1');
	});

	test('openStore rejects a non-anchor tile inside an existing store footprint as occupied', () => {
		// Regression guard: the footprint-occupancy check must reject a future
		// caller that bypasses the placement-preview pre-check and tries to
		// place an overlapping store on one of the three non-anchor footprint
		// tiles of an existing store.
		expect.assertions(3);
		const game = createNewGame('electronics', 44);
		const foundingStore = game.stores[0]!;
		const city = game.cities[0]!;
		// (mapX + 1, mapY) is a non-anchor tile validated as buildable when the
		// founding store was placed, so the only thing that can block it is the
		// footprint-occupancy check.
		const overlappingTile = city.tiles.find(
			(tile) => tile.x === foundingStore.mapX + 1 && tile.y === foundingStore.mapY
		)!;

		const result = openStore(game, {
			archetypeId: 'electronics',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 },
			tileId: overlappingTile.id
		});

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.id).toBe('location-unavailable-1');
		expect(result.decisions.at(-1)?.context).toEqual({ code: 'locationGeneric' });
	});

	test('openStore rejects an anchor whose 2x2 footprint includes a river non-anchor tile', () => {
		// Regression guard for the defensive getExpansionTile path: when a
		// caller bypasses the placement-preview pre-check, openStore must still
		// refuse to place a store whose anchor is buildable but whose footprint
		// extends onto a river tile. Without the footprint-aware guard the store
		// would be placed on top of the river.
		expect.assertions(3);
		const city = makeFlatRetailCity(6, 6);
		const riverNeighbor = city.tiles.find((tile) => tile.x === 3 && tile.y === 1)!;
		riverNeighbor.feature = 'river';
		const game = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: 'retail-city-0-0',
			seed: 7
		});
		// Anchor (2,1) is buildable commercial, but its 2x2 footprint includes
		// the river tile at (3,1).
		const riverFootprintAnchor = city.tiles.find((tile) => tile.x === 2 && tile.y === 1)!;

		const result = openStore(game, {
			archetypeId: 'grocery',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 },
			tileId: riverFootprintAnchor.id
		});

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.title).toBe('Location unavailable');
		expect(result.decisions.at(-1)?.context).toEqual({ code: 'locationBlocked', reason: 'river' });
	});

	test('location unavailable decision carries structured context for locked tile', () => {
		expect.assertions(2);
		const city = makeFlatRetailCity(6, 6);
		const lockedTile = city.tiles.find((tile) => tile.x === 3 && tile.y === 1)!;
		lockedTile.locked = true;
		const game = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: 'retail-city-0-0',
			seed: 7
		});

		const result = openStore(game, {
			archetypeId: 'grocery',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 },
			tileId: lockedTile.id
		});
		const decision = result.decisions.find((d) => d.id.startsWith('location-unavailable'));
		expect(decision).toBeDefined();
		expect(decision?.context).toEqual({ code: 'locationBlocked', reason: 'locked' });
	});

	test('openStore rejects an anchor whose 2x2 footprint extends past the map edge', () => {
		// Edge-of-map guard: an anchor on the bottom/right border is buildable
		// as a single tile, but its 2x2 footprint has missing coordinates.
		expect.assertions(2);
		const city = makeFlatRetailCity(4, 4);
		const game = createFoundingGameAtTile({
			archetypeId: 'boutique',
			city,
			tileId: 'retail-city-0-0',
			seed: 7
		});
		const edgeAnchor = city.tiles.find((tile) => tile.x === 3 && tile.y === 0)!;

		const result = openStore(game, {
			archetypeId: 'grocery',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 },
			tileId: edgeAnchor.id
		});

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.title).toBe('Location unavailable');
	});

	test('openStore auto-pick skips an anchor whose footprint includes a river tile', () => {
		// Regression guard for the getExpansionTile auto-pick branch (openStore
		// with no tileId): it must validate the full 2x2 footprint, not just the
		// anchor. Anchor (2,0) is buildable commercial and unoccupied, but its
		// footprint includes the river tile at (3,0). Checking only the anchor
		// would place a store straddling the river; the footprint-aware guard
		// must skip it and land on a footprint whose four tiles are all
		// buildable.
		expect.assertions(3);
		const city = makeFlatRetailCity(4, 4);
		const riverTile = city.tiles.find((tile) => tile.x === 3 && tile.y === 0)!;
		riverTile.feature = 'river';
		const game = {
			...createFoundingGameAtTile({
				archetypeId: 'boutique',
				city,
				tileId: 'retail-city-0-0',
				seed: 7
			}),
			cash: 100_000
		};
		// Founding store occupies the (0,0) footprint, so the first free
		// row-major anchor is (2,0) — the river-straddling one we poisoned.
		const badAnchor = city.tiles.find((tile) => tile.x === 2 && tile.y === 0)!;

		const result = openStore(game, {
			archetypeId: 'grocery',
			location: { neighborhoodId: 'downtown', x: 0, y: 0 }
		});

		// First prove auto-pick actually created a store. Without this guard,
		// placedStore could resolve to the founding store (if openStore no-opped)
		// and the assertions below would still pass.
		expect(result.stores).toHaveLength(game.stores.length + 1);
		const placedStore = result.stores[result.stores.length - 1]!;
		expect(placedStore.tileId).not.toBe(badAnchor.id);
		// And the placed store's footprint must not include the river tile.
		const placedFootprintIncludesRiver = city.tiles.some(
			(tile) =>
				tile.id === riverTile.id &&
				tile.x >= placedStore.mapX &&
				tile.x < placedStore.mapX + 2 &&
				tile.y >= placedStore.mapY &&
				tile.y < placedStore.mapY + 2
		);
		expect(placedFootprintIncludesRiver).toBe(false);
	});

	test('getExpansionSetupCost pins terrain premium ordering and exact values', () => {
		expect.assertions(5);
		// Convenience baseRent is 115; with rent/demand/footTraffic/customerFit
		// all zero, the base cost is 9_000 + 115 * 18 = 11_070. The terrain
		// premium adds commercial: 3_500, residential: 2_000, green/transit: 0.
		const baseTile: CityTile = {
			id: 'test-tile',
			cityId: 'test-city',
			x: 0,
			y: 0,
			neighborhood: 'parkEdge',
			terrain: 'green',
			feature: null,
			demand: 0,
			rent: 0,
			footTraffic: 0,
			customerFit: 0,
			locked: false
		};
		const greenCost = getExpansionSetupCost(baseTile, 'convenience');
		const residentialCost = getExpansionSetupCost(
			{ ...baseTile, terrain: 'residential' },
			'convenience'
		);
		const commercialCost = getExpansionSetupCost(
			{ ...baseTile, terrain: 'commercial' },
			'convenience'
		);

		expect(greenCost).toBe(11_070);
		expect(residentialCost).toBe(13_070);
		expect(commercialCost).toBe(14_570);
		expect(commercialCost).toBeGreaterThan(residentialCost);
		expect(residentialCost).toBeGreaterThan(greenCost);
	});

	describe('milestone category unlock with reordered lineups', () => {
		test('adds the first starting category the store does not already stock', () => {
			expect.assertions(2);
			// Legacy store: saved before bottled water existed — level 3, stocking snacks only.
			let game = createNewGame('convenience', 20260611);
			const legacyStore = {
				...game.stores[0]!,
				level: 3,
				products: [createStoreProduct(getArchetype('convenience').startingCategories[1]!)]
			};
			game = { ...game, cash: 1_000_000, stores: [legacyStore] };

			const upgraded = upgradeStore(game, legacyStore.id);

			expect(upgraded.stores[0]!.level).toBe(4);
			expect(upgraded.stores[0]!.products.map((product) => product.categoryId)).toEqual([
				'snacks',
				'bottled-water'
			]);
		});

		test('never adds a duplicate across successive milestones', () => {
			expect.assertions(2);
			let game = createNewGame('convenience', 20260611);
			game = { ...game, cash: 10_000_000 };

			for (let level = game.stores[0]!.level; level < 10; level++) {
				game = upgradeStore(game, game.stores[0]!.id);
			}

			const categoryIds = game.stores[0]!.products.map((product) => product.categoryId);
			expect(new Set(categoryIds).size).toBe(categoryIds.length);
			expect(categoryIds).toEqual(['bottled-water', 'snacks', 'drinks', 'essentials']);
		});
	});
});

function makeFlatRetailCity(width: number, height: number): City {
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
	return { id: 'retail-city', name: 'Retail City', width, height, tiles };
}
