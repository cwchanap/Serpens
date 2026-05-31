import { describe, expect, test } from 'vitest';
import { calculateStockHealth } from './stock';
import { createNewGame, openStore, resolveDecision, updatePolicy } from './state';
import { simulateDay } from './simulateDay';
import type { GameState } from './types';

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
		expect.assertions(4);
		const game = createNewGame('convenience', 20260512);

		expect(game.cities.map((city) => city.id)).toEqual(['harbor-city']);
		expect(game.industryCities.map((city) => city.id)).toEqual(['industry-city']);
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

		expect(store.products.map((product) => product.categoryId)).toEqual([
			'produce',
			'pantry',
			'prepared'
		]);
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

	test('opens stores up to the local chain limit', () => {
		expect.assertions(5);
		const game = createNewGame('electronics', 44);
		const second = openStore(game, {
			name: 'Mall Kiosk',
			archetypeId: 'electronics',
			location: 'West Mall'
		});
		const third = openStore(second, {
			name: 'Campus Shop',
			archetypeId: 'electronics',
			location: 'North Campus'
		});
		const fourth = openStore(third, {
			name: 'Airport Shop',
			archetypeId: 'electronics',
			location: 'Airport'
		});

		expect(second.stores).toHaveLength(2);
		expect(second.cash).toBeLessThan(game.cash);
		expect(third.stores).toHaveLength(3);
		expect(fourth.stores).toHaveLength(3);
		expect(fourth.decisions.at(-1)?.title).toBe('Expansion unavailable');
	});

	test('direct store opening uses a map tile in the active city', () => {
		expect.assertions(5);
		const game = createNewGame('electronics', 44);

		const result = openStore(game, {
			name: 'Mall Kiosk',
			archetypeId: 'electronics',
			location: 'West Mall'
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
		const foundingTileId = game.stores[0]?.tileId;
		const riverTile = city.tiles.find((tile) => tile.feature === 'river')!;
		const roadTile = city.tiles.find((tile) => tile.feature === 'road')!;
		const buildableTile = city.tiles.find(
			(tile) => tile.feature === null && !tile.locked && tile.id !== foundingTileId
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
				name: 'Mall Kiosk',
				archetypeId: 'electronics',
				location: 'West Mall'
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
			name: 'Road Kiosk',
			archetypeId: 'electronics',
			location: 'Roadside',
			tileId: roadTile.id
		});

		expect(result.stores).toHaveLength(1);
		expect(result.decisions.at(-1)?.id).toBe('location-unavailable-road-1');
		expect(result.decisions.at(-1)?.context).toBe(
			'Road location blocks store placement. Choose another city tile.'
		);
	});

	test('direct store opening uses the selected expansion archetype', () => {
		expect.assertions(3);
		const game = createNewGame('boutique', 44);

		const result = openStore(game, {
			name: 'Tech Kiosk',
			archetypeId: 'electronics',
			location: 'West Mall'
		});

		expect(game.stores[0]?.archetypeId).toBe('boutique');
		expect(result.stores.at(-1)?.archetypeId).toBe('electronics');
		expect(result.stores.at(-1)?.products.map((product) => product.categoryId)).toEqual([
			'games',
			'accessories',
			'devices'
		]);
	});

	test('does not duplicate same-day blocked expansion decisions', () => {
		expect.assertions(2);
		const game = createNewGame('electronics', 44);
		const second = openStore(game, {
			name: 'Mall Kiosk',
			archetypeId: 'electronics',
			location: 'West Mall'
		});
		const third = openStore(second, {
			name: 'Campus Shop',
			archetypeId: 'electronics',
			location: 'North Campus'
		});
		const fourth = openStore(third, {
			name: 'Airport Shop',
			archetypeId: 'electronics',
			location: 'Airport'
		});
		const fifth = openStore(fourth, {
			name: 'Station Shop',
			archetypeId: 'electronics',
			location: 'Station'
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
			context: 'A supplier offers a short-term discount.',
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

	test('resolves store-level effects and clamps boundaries', () => {
		expect.assertions(4);
		const game = createNewGame('grocery', 55);
		const decision = {
			id: 'store-effects-1',
			title: 'Store recovery plan',
			context: 'A manager proposes store-level changes.',
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
			context: 'A manager changes inventory depth.',
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
				stock: Math.floor(product.targetStock / 2)
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
});
