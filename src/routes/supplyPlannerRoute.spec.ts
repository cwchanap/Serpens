import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '$lib/game/state';
import type {
	GameState,
	IndustrialBuilding,
	IndustrialBuildingTypeId,
	StoreProduct,
	WorldCityId
} from '$lib/game/types';
import type {
	SupplyPlan,
	SupplyPlannerAction,
	SupplyPlannerCandidate,
	SupplyPlannerResult
} from '$lib/game/supplyPlannerActions';
import type { SupplyPlannerSnapshot } from '$lib/game/supplyPlanner';
import {
	deriveSupplyPlannerResult,
	findPlannerBuilding,
	getSupplyPlannerCategoryIds,
	handoffSupplyPlannerAction,
	resolveSupplyPlannerCategory,
	type SupplyPlannerDerivationInput,
	type SupplyPlannerHandoffHost,
	type SupplyPlannerUiContext
} from './supplyPlannerRoute';
import type { SupplyPlannerActionAvailability } from '$lib/game/supplyPlannerActions';

function product(categoryId: string): StoreProduct {
	return { categoryId, stock: 0, reorderThreshold: 0, targetStock: 70, sellingPrice: 3 };
}

function building(
	typeId: IndustrialBuildingTypeId,
	id: string,
	cityId: WorldCityId = 'industry-city'
): IndustrialBuilding {
	return {
		id,
		level: 1,
		typeId,
		cityId,
		tileId: `${id}-tile`,
		mapX: 2,
		mapY: 2,
		status: 'idle',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {}
	};
}

function baseGame(): GameState {
	const game = createNewGame('convenience', 20260810);
	return {
		...game,
		cash: 42_000,
		industrialBuildings: [building('warehouse', 'warehouse-1')],
		cityInventories: [{ cityId: 'industry-city', materials: {} }],
		stores: [{ ...game.stores[0]!, products: [product('bottled-water')] }],
		logistics: { ...game.logistics, recurringRoutes: [] }
	};
}

const baseSnapshot: SupplyPlannerSnapshot = {
	retailCityId: 'harbor-city',
	supplyCityId: 'industry-city',
	finishedMaterialId: 'bottled-water',
	cash: 42_000,
	demandContributors: [],
	demandPerDay: 10,
	finishedImportCostPerUnit: 2,
	inventory: {},
	warehouseCapacity: 400,
	warehouseUsed: 0,
	buildings: [{ id: 'water-pump-1', cityId: 'industry-city', typeId: 'water-pump', level: 1 }],
	usableBuildingIds: ['water-pump-1'],
	disconnectedBuildingIds: [],
	usableSinkBuildingIdsByMaterial: {},
	activeOutboundRouteIds: [],
	reachableDemandByMaterial: {},
	reachableDemandByBuildingAndMaterial: {},
	reachableBranchesByBuildingAndMaterial: {},
	reachableProcessorsByBuildingAndMaterial: {},
	warehouseConnectedConsumerCapacityByMaterial: {},
	warehouseConnectedProcessorsByMaterial: {}
};

function readyResult(
	snapshotOverrides: Partial<SupplyPlannerSnapshot> = {},
	recommendationAction: SupplyPlannerAction = {
		kind: 'build-producer',
		materialId: 'bottled-water',
		buildingTypeId: 'water-pump',
		cost: 250
	}
): SupplyPlannerResult {
	const snapshot = { ...baseSnapshot, ...snapshotOverrides };
	const candidate: SupplyPlannerCandidate = {
		action: recommendationAction,
		baseline: {} as never,
		projection: {} as never,
		comparison: {} as never,
		affordable: true,
		feasible: true
	};
	const plan: SupplyPlan = {
		snapshot,
		baseline: {} as never,
		recommendation: candidate,
		alternatives: [candidate]
	};
	return { status: 'ready', plan };
}

function mockHost(overrides: Partial<SupplyPlannerHandoffHost> = {}): SupplyPlannerHandoffHost {
	return {
		getGame: overrides.getGame ?? (() => baseGame()),
		closeOverlays: overrides.closeOverlays ?? vi.fn(),
		switchToSupplyCity: overrides.switchToSupplyCity ?? vi.fn(async () => true),
		armIndustryPlacement: overrides.armIndustryPlacement ?? vi.fn(),
		selectIndustryTile: overrides.selectIndustryTile ?? vi.fn(),
		enterRailBuildMode: overrides.enterRailBuildMode ?? vi.fn(),
		canBuildRail: overrides.canBuildRail ?? true
	};
}

describe('getSupplyPlannerCategoryIds', () => {
	it('returns an empty list when the game is null', () => {
		expect(getSupplyPlannerCategoryIds(null, 'harbor-city', ['bottled-water'])).toEqual([]);
	});

	it('filters planner categories by the allowed set', () => {
		const game = baseGame();
		const ids = getSupplyPlannerCategoryIds(game, 'harbor-city', ['bottled-water']);
		expect(ids).toEqual(['bottled-water']);
	});

	it('excludes categories not in the allowed set', () => {
		const game = baseGame();
		const ids = getSupplyPlannerCategoryIds(game, 'harbor-city', ['produce']);
		expect(ids).toEqual([]);
	});
});

describe('resolveSupplyPlannerCategory', () => {
	it('returns the context category when it is valid', () => {
		const context: SupplyPlannerUiContext = { categoryId: 'produce', horizonDays: 30 };
		expect(resolveSupplyPlannerCategory(context, ['bottled-water', 'produce'])).toBe('produce');
	});

	it('falls back to the first valid category when the context category is not valid', () => {
		const context: SupplyPlannerUiContext = { categoryId: 'snacks', horizonDays: 7 };
		expect(resolveSupplyPlannerCategory(context, ['bottled-water', 'produce'])).toBe(
			'bottled-water'
		);
	});

	it('returns null when the context category is null and no valid categories exist', () => {
		const context: SupplyPlannerUiContext = { categoryId: null, horizonDays: 30 };
		expect(resolveSupplyPlannerCategory(context, [])).toBeNull();
	});

	it('falls back to the first valid category when context category is null', () => {
		const context: SupplyPlannerUiContext = { categoryId: null, horizonDays: 30 };
		expect(resolveSupplyPlannerCategory(context, ['bottled-water'])).toBe('bottled-water');
	});
});

describe('deriveSupplyPlannerResult', () => {
	const availability: SupplyPlannerActionAvailability = {
		canBuildIndustry: true,
		canUpgradeIndustry: true,
		canBuildRail: true,
		allowedIndustryBuildingTypeIds: ['water-pump', 'water-bottler', 'warehouse']
	};

	it('returns null when the planner is not open', () => {
		const input: SupplyPlannerDerivationInput = {
			isOpen: false,
			game: baseGame(),
			retailCityId: 'harbor-city',
			categoryId: 'bottled-water',
			availability
		};
		expect(deriveSupplyPlannerResult(input)).toBeNull();
	});

	it('returns null when the game is null', () => {
		const input: SupplyPlannerDerivationInput = {
			isOpen: true,
			game: null,
			retailCityId: 'harbor-city',
			categoryId: 'bottled-water',
			availability
		};
		expect(deriveSupplyPlannerResult(input)).toBeNull();
	});

	it('returns null when the category id is null', () => {
		const input: SupplyPlannerDerivationInput = {
			isOpen: true,
			game: baseGame(),
			retailCityId: 'harbor-city',
			categoryId: null,
			availability
		};
		expect(deriveSupplyPlannerResult(input)).toBeNull();
	});

	it('delegates to buildSupplyPlan with a snapshot of the game', () => {
		const game = baseGame();
		const buildPlan = vi.fn(
			() => ({ status: 'empty', reason: 'no-supported-products' }) as SupplyPlannerResult
		);
		const snapshotGame = vi.fn((g: GameState) => structuredClone(g));
		const input: SupplyPlannerDerivationInput = {
			isOpen: true,
			game,
			retailCityId: 'harbor-city',
			categoryId: 'bottled-water',
			availability
		};
		deriveSupplyPlannerResult(input, buildPlan, snapshotGame);
		expect(snapshotGame).toHaveBeenCalledWith(game);
		expect(buildPlan).toHaveBeenCalledWith(
			snapshotGame.mock.results[0]!.value,
			{ retailCityId: 'harbor-city', categoryId: 'bottled-water' },
			availability
		);
	});

	it('uses the identity snapshot when no snapshot function is supplied', () => {
		const game = baseGame();
		const buildPlan = vi.fn(
			() => ({ status: 'empty', reason: 'no-supported-products' }) as SupplyPlannerResult
		);
		const input: SupplyPlannerDerivationInput = {
			isOpen: true,
			game,
			retailCityId: 'harbor-city',
			categoryId: 'bottled-water',
			availability
		};
		deriveSupplyPlannerResult(input, buildPlan);
		expect(buildPlan).toHaveBeenCalledWith(
			game,
			{ retailCityId: 'harbor-city', categoryId: 'bottled-water' },
			availability
		);
	});
});

describe('findPlannerBuilding', () => {
	it('finds a building by id and city', () => {
		const game = baseGame();
		expect(findPlannerBuilding(game, 'warehouse-1', 'industry-city')?.id).toBe('warehouse-1');
	});

	it('returns null when the game is null', () => {
		expect(findPlannerBuilding(null, 'warehouse-1', 'industry-city')).toBeNull();
	});

	it('returns null when no building matches the id and city', () => {
		const game = baseGame();
		expect(findPlannerBuilding(game, 'nonexistent', 'industry-city')).toBeNull();
	});

	it('returns null when the building exists in a different city', () => {
		const game = baseGame();
		expect(findPlannerBuilding(game, 'warehouse-1', 'harbor-city')).toBeNull();
	});
});

describe('handoffSupplyPlannerAction', () => {
	it('returns early for a none action', async () => {
		const host = mockHost();
		const result = readyResult({}, { kind: 'none', reason: 'no-demand' });
		await handoffSupplyPlannerAction({ kind: 'none', reason: 'no-demand' }, result, host);
		expect(host.closeOverlays).not.toHaveBeenCalled();
	});

	it('returns early when the result is not ready', async () => {
		const host = mockHost();
		const action: SupplyPlannerAction = {
			kind: 'build-producer',
			materialId: 'bottled-water',
			buildingTypeId: 'water-pump',
			cost: 250
		};
		await handoffSupplyPlannerAction(
			action,
			{ status: 'empty', reason: 'no-supported-products' },
			host
		);
		expect(host.closeOverlays).not.toHaveBeenCalled();
	});

	it('returns early when the action does not match the recommendation', async () => {
		const host = mockHost();
		const result = readyResult(
			{},
			{
				kind: 'build-producer',
				materialId: 'bottled-water',
				buildingTypeId: 'water-bottler',
				cost: 500
			}
		);
		const action: SupplyPlannerAction = {
			kind: 'build-producer',
			materialId: 'bottled-water',
			buildingTypeId: 'water-pump',
			cost: 250
		};
		await handoffSupplyPlannerAction(action, result, host);
		expect(host.closeOverlays).not.toHaveBeenCalled();
	});

	it('hands off a build-producer action by switching city and arming placement', async () => {
		const host = mockHost();
		const action: SupplyPlannerAction = {
			kind: 'build-producer',
			materialId: 'bottled-water',
			buildingTypeId: 'water-pump',
			cost: 250
		};
		const result = readyResult({}, action);
		await handoffSupplyPlannerAction(action, result, host);
		expect(host.closeOverlays).toHaveBeenCalledTimes(1);
		expect(host.switchToSupplyCity).toHaveBeenCalledWith('industry-city');
		expect(host.armIndustryPlacement).toHaveBeenCalledWith('water-pump');
	});

	it('aborts a build-producer action when the city switch fails', async () => {
		const host = mockHost({ switchToSupplyCity: vi.fn(async () => false) });
		const action: SupplyPlannerAction = {
			kind: 'build-producer',
			materialId: 'bottled-water',
			buildingTypeId: 'water-pump',
			cost: 250
		};
		const result = readyResult({}, action);
		await handoffSupplyPlannerAction(action, result, host);
		expect(host.closeOverlays).toHaveBeenCalledTimes(1);
		expect(host.armIndustryPlacement).not.toHaveBeenCalled();
	});

	it('hands off a build-warehouse action by switching city and arming placement', async () => {
		const host = mockHost();
		const action: SupplyPlannerAction = {
			kind: 'build-warehouse',
			buildingTypeId: 'warehouse',
			cost: 900
		};
		const result = readyResult({}, action);
		await handoffSupplyPlannerAction(action, result, host);
		expect(host.switchToSupplyCity).toHaveBeenCalledWith('industry-city');
		expect(host.armIndustryPlacement).toHaveBeenCalledWith('warehouse');
	});

	it('aborts an upgrade action when the building is not found in the game', async () => {
		const host = mockHost({ getGame: () => baseGame() });
		const action: SupplyPlannerAction = {
			kind: 'upgrade-building',
			materialId: 'bottled-water',
			buildingId: 'nonexistent-building',
			buildingTypeId: 'water-pump',
			fromLevel: 1,
			toLevel: 2,
			cost: 500
		};
		const result = readyResult(
			{
				buildings: [
					...baseSnapshot.buildings,
					{ id: 'nonexistent-building', cityId: 'industry-city', typeId: 'water-pump', level: 1 }
				]
			},
			action
		);
		await handoffSupplyPlannerAction(action, result, host);
		expect(host.closeOverlays).not.toHaveBeenCalled();
	});

	it('hands off an upgrade-building action by selecting the industry tile', async () => {
		const game = baseGame();
		const host = mockHost({ getGame: () => game });
		const action: SupplyPlannerAction = {
			kind: 'upgrade-building',
			materialId: 'bottled-water',
			buildingId: 'warehouse-1',
			buildingTypeId: 'warehouse',
			fromLevel: 1,
			toLevel: 2,
			cost: 500
		};
		const result = readyResult(
			{
				buildings: [
					...baseSnapshot.buildings,
					{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
				]
			},
			action
		);
		await handoffSupplyPlannerAction(action, result, host);
		expect(host.closeOverlays).toHaveBeenCalledTimes(1);
		expect(host.selectIndustryTile).toHaveBeenCalledWith('warehouse-1-tile');
	});

	it('aborts an upgrade-building action when the city switch fails', async () => {
		const game = baseGame();
		const gameWithBuilding = {
			...game,
			industrialBuildings: [...game.industrialBuildings, building('water-pump', 'upgrade-target-1')]
		};
		const host = mockHost({
			getGame: () => gameWithBuilding,
			switchToSupplyCity: vi.fn(async () => false)
		});
		const action: SupplyPlannerAction = {
			kind: 'upgrade-building',
			materialId: 'bottled-water',
			buildingId: 'upgrade-target-1',
			buildingTypeId: 'water-pump',
			fromLevel: 1,
			toLevel: 2,
			cost: 500
		};
		const result = readyResult(
			{
				buildings: [
					...baseSnapshot.buildings,
					{ id: 'upgrade-target-1', cityId: 'industry-city', typeId: 'water-pump', level: 1 }
				]
			},
			action
		);
		await handoffSupplyPlannerAction(action, result, host);
		expect(host.selectIndustryTile).not.toHaveBeenCalled();
	});

	it('aborts an upgrade action when the building disappears after the city switch', async () => {
		const game = baseGame();
		const gameWithBuilding = {
			...game,
			industrialBuildings: [
				...game.industrialBuildings,
				building('water-pump', 'missing-after-switch')
			]
		};
		// The building exists before the switch and disappears after it —
		// modeled off the switch callback itself instead of getGame call
		// order.
		let switched = false;
		const switchToSupplyCity = vi.fn(async () => {
			switched = true;
			return true;
		});
		const host = mockHost({
			getGame: () => (switched ? game : gameWithBuilding),
			switchToSupplyCity
		});
		const action: SupplyPlannerAction = {
			kind: 'upgrade-building',
			materialId: 'bottled-water',
			buildingId: 'missing-after-switch',
			buildingTypeId: 'water-pump',
			fromLevel: 1,
			toLevel: 2,
			cost: 500
		};
		const result = readyResult(
			{
				buildings: [
					...baseSnapshot.buildings,
					{ id: 'missing-after-switch', cityId: 'industry-city', typeId: 'water-pump', level: 1 }
				]
			},
			action
		);
		await handoffSupplyPlannerAction(action, result, host);
		expect(switchToSupplyCity).toHaveBeenCalled();
		expect(host.selectIndustryTile).not.toHaveBeenCalled();
	});

	it('aborts a connect-rail action when rail building is disabled', async () => {
		const game = baseGame();
		const host = mockHost({ getGame: () => game, canBuildRail: false });
		const action: SupplyPlannerAction = {
			kind: 'connect-rail',
			buildingId: 'warehouse-1',
			materialId: 'bottled-water'
		};
		const result = readyResult(
			{
				buildings: [
					...baseSnapshot.buildings,
					{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
				],
				disconnectedBuildingIds: ['warehouse-1']
			},
			action
		);
		await handoffSupplyPlannerAction(action, result, host);
		expect(host.closeOverlays).not.toHaveBeenCalled();
	});

	it('aborts a connect-rail action when the building is not in the disconnected list', async () => {
		const game = baseGame();
		const host = mockHost({ getGame: () => game });
		const action: SupplyPlannerAction = {
			kind: 'connect-rail',
			buildingId: 'warehouse-1',
			materialId: 'bottled-water'
		};
		const result = readyResult(
			{
				buildings: [
					...baseSnapshot.buildings,
					{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
				],
				disconnectedBuildingIds: []
			},
			action
		);
		await handoffSupplyPlannerAction(action, result, host);
		expect(host.closeOverlays).not.toHaveBeenCalled();
	});

	it('hands off a connect-rail action by entering rail build mode', async () => {
		const game = baseGame();
		const host = mockHost({ getGame: () => game });
		const action: SupplyPlannerAction = {
			kind: 'connect-rail',
			buildingId: 'warehouse-1',
			materialId: 'bottled-water'
		};
		const result = readyResult(
			{
				buildings: [
					...baseSnapshot.buildings,
					{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
				],
				disconnectedBuildingIds: ['warehouse-1']
			},
			action
		);
		await handoffSupplyPlannerAction(action, result, host);
		expect(host.closeOverlays).toHaveBeenCalledTimes(1);
		expect(host.enterRailBuildMode).toHaveBeenCalledWith({
			step: 'routing',
			originBuildingId: 'warehouse-1',
			waypoints: []
		});
	});

	it('aborts a connect-rail action when the city switch fails', async () => {
		const game = baseGame();
		const gameWithBuilding = {
			...game,
			industrialBuildings: [
				...game.industrialBuildings,
				building('water-pump', 'rail-switch-fail-1')
			]
		};
		const host = mockHost({
			getGame: () => gameWithBuilding,
			switchToSupplyCity: vi.fn(async () => false)
		});
		const action: SupplyPlannerAction = {
			kind: 'connect-rail',
			buildingId: 'rail-switch-fail-1',
			materialId: 'bottled-water'
		};
		const result = readyResult(
			{
				buildings: [
					...baseSnapshot.buildings,
					{ id: 'rail-switch-fail-1', cityId: 'industry-city', typeId: 'water-pump', level: 1 }
				],
				disconnectedBuildingIds: ['rail-switch-fail-1']
			},
			action
		);
		await handoffSupplyPlannerAction(action, result, host);
		expect(host.enterRailBuildMode).not.toHaveBeenCalled();
	});

	it('aborts a connect-rail action when the building disappears after the city switch', async () => {
		const game = baseGame();
		const gameWithBuilding = {
			...game,
			industrialBuildings: [...game.industrialBuildings, building('water-pump', 'rail-target-1')]
		};
		let callCount = 0;
		const host = mockHost({
			getGame: () => {
				callCount++;
				return callCount === 1 ? gameWithBuilding : game;
			}
		});
		const action: SupplyPlannerAction = {
			kind: 'connect-rail',
			buildingId: 'rail-target-1',
			materialId: 'bottled-water'
		};
		const result = readyResult(
			{
				buildings: [
					...baseSnapshot.buildings,
					{ id: 'rail-target-1', cityId: 'industry-city', typeId: 'water-pump', level: 1 }
				],
				disconnectedBuildingIds: ['rail-target-1']
			},
			action
		);
		await handoffSupplyPlannerAction(action, result, host);
		expect(host.enterRailBuildMode).not.toHaveBeenCalled();
	});
});
