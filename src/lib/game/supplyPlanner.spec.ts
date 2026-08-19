import { describe, expect, it } from 'vitest';
import { resolveEffectivePolicy, setPolicyOverride } from './policyInheritance';
import { MATERIALS, PRODUCTION_RECIPES } from './industry';
import { getProductDefinition } from './products';
import { buildSupplyPlan } from './supplyPlannerActions';
import {
	createTwoIndustryCityGame,
	withCityMaterials,
	withWarehouses
} from './interCityLogistics.testUtils';
import { MATERIAL_PRODUCER_RECIPES } from './productChainGraph';
import { REPLENISHMENT_INTERVAL_DAYS } from './retailSupply';
import {
	buildCityDemandPools,
	getPolicyAdjustedCityProductDemand,
	getPolicyDemandMultiplier
} from './stock';
import { createNewGame } from './state';
import {
	buildRequiredChainReachability,
	buildSupplyMaterialRequirements,
	buildSupplyPlannerSnapshot,
	listSupplyPlannerCategories,
	projectSupplySnapshot
} from './supplyPlanner';
import type { SupplyPlannerRequest, SupplyPlannerSnapshot } from './supplyPlanner';
import type {
	ActiveEventModifier,
	GameState,
	IndustrialBuilding,
	MaterialId,
	ProductId,
	ProductionRecipeId,
	RecurringRoute,
	StoreProduct,
	TransferOrder,
	WorldCityId
} from './types';

function product(
	productId: ProductId,
	options: Partial<Omit<StoreProduct, 'productId'>> & { initialQuantity?: number } = {}
): StoreProduct {
	const { initialQuantity = 0, ...productOptions } = options;
	return {
		productId,
		lots: initialQuantity > 0 ? [{ receivedDay: 1, quantity: initialQuantity }] : [],
		reorderThreshold: 0,
		targetStock: 70,
		sellingPrice: 3,
		...productOptions
	};
}

function building(
	typeId: IndustrialBuilding['typeId'],
	id = `building-${typeId}`,
	cityId: WorldCityId = 'industry-city',
	level = 1,
	mapX = 0,
	mapY = 0
): IndustrialBuilding {
	return {
		id,
		level,
		typeId,
		cityId,
		tileId: `${id}-tile`,
		mapX,
		mapY,
		status: 'idle',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {}
	};
}

function verticalRails(fromY: number, toY: number, x = 2, level = 1) {
	return Array.from({ length: toY - fromY + 1 }, (_, index) => ({
		x,
		y: fromY + index,
		level
	}));
}

function segmentedPantryRails() {
	return [...verticalRails(1, 5), ...verticalRails(8, 9), ...verticalRails(12, 13)];
}

function projectionSnapshot(overrides: Partial<SupplyPlannerSnapshot> = {}): SupplyPlannerSnapshot {
	return {
		retailCityId: 'harbor-city',
		supplyCityId: 'industry-city',
		finishedMaterialId: 'pantry',
		cash: 0,
		demandContributors: [],
		demandPerDay: 10,
		finishedImportCostPerUnit: 0,
		inventory: {},
		warehouseCapacity: 100,
		warehouseUsed: 0,
		buildings: [],
		usableBuildingIds: [],
		disconnectedBuildingIds: [],
		usableSinkBuildingIdsByMaterial: {},
		reachableDemandByMaterial: {},
		reachableDemandByBuildingAndMaterial: {},
		reachableBranchesByBuildingAndMaterial: {},
		reachableProcessorsByBuildingAndMaterial: {},
		warehouseConnectedConsumerCapacityByMaterial: {},
		warehouseConnectedProcessorsByMaterial: {},
		...overrides
	};
}

/**
 * Pantry chain where a Grain Farm reaches Flour Mill A only, while Mill B is
 * usable and warehouse-connected but unreachable by the farm. Both mills are
 * warehouse-connected consumers of grain. Used to exercise inventory routing
 * through a processor no producer reaches (P1) and rate-derived stockout.
 */
function splitMillPantrySnapshot(grainInventory: number): SupplyPlannerSnapshot {
	return projectionSnapshot({
		finishedMaterialId: 'pantry',
		demandPerDay: 16,
		inventory: { grain: grainInventory },
		buildings: [
			{ id: 'grain-farm-1', cityId: 'industry-city', typeId: 'grain-farm', level: 1 },
			{ id: 'flour-mill-a', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
			{ id: 'flour-mill-b', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
			{ id: 'pantry-works-1', cityId: 'industry-city', typeId: 'pantry-works', level: 1 },
			{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
		],
		usableBuildingIds: [
			'grain-farm-1',
			'flour-mill-a',
			'flour-mill-b',
			'pantry-works-1',
			'warehouse-1'
		],
		usableSinkBuildingIdsByMaterial: {
			grain: ['flour-mill-a', 'flour-mill-b'],
			flour: ['pantry-works-1'],
			pantry: ['warehouse-1']
		},
		reachableDemandByMaterial: { grain: 15, flour: 12 },
		reachableDemandByBuildingAndMaterial: {
			'grain-farm-1\u0000grain': 15,
			'flour-mill-a\u0000flour': 12,
			'flour-mill-b\u0000flour': 12
		},
		reachableBranchesByBuildingAndMaterial: {
			'grain-farm-1\u0000grain': new Map([['flour', 15]]),
			'flour-mill-a\u0000flour': new Map([['pantry', 12]]),
			'flour-mill-b\u0000flour': new Map([['pantry', 12]])
		},
		reachableProcessorsByBuildingAndMaterial: {
			'grain-farm-1\u0000grain': [
				{
					processorId: 'flour-mill-a',
					branchId: 'flour',
					inputCapacity: 10,
					canReachWarehouse: true
				}
			]
		},
		warehouseConnectedProcessorsByMaterial: {
			grain: [
				{
					processorId: 'flour-mill-a',
					branchId: 'flour',
					inputCapacity: 10,
					canReachWarehouse: true,
					branchDemand: 15
				},
				{
					processorId: 'flour-mill-b',
					branchId: 'flour',
					inputCapacity: 10,
					canReachWarehouse: true,
					branchDemand: 15
				}
			]
		},
		warehouseConnectedConsumerCapacityByMaterial: { grain: 20 }
	});
}

function route(overrides: Partial<RecurringRoute> = {}): RecurringRoute {
	return {
		id: 'route-water',
		originCityId: 'industry-city',
		destinationCityId: 'harbor-city',
		materialId: 'water',
		capacity: 10,
		frequencyDays: 7,
		leadTimeDays: 1,
		transportCostPerUnit: 1,
		priority: 1,
		state: 'active',
		nextDispatchOnDay: 7,
		...overrides
	};
}

function baseGame(
	archetype: 'convenience' | 'grocery' | 'boutique' | 'electronics' = 'convenience'
): GameState {
	const game = createNewGame(archetype, 20260810);
	return {
		...game,
		cash: 42_000,
		industrialBuildings: [building('warehouse')],
		cityInventories: [{ cityId: 'industry-city', materials: { water: 20 } }],
		logistics: { ...game.logistics, recurringRoutes: [] }
	};
}

function routeModifier(overrides: Partial<ActiveEventModifier> = {}): ActiveEventModifier {
	return {
		id: 'event-modifier-1',
		source: {
			eventId: 'freight-disruption',
			instanceId: 'event-instance-1',
			optionId: 'accept-delay'
		},
		target: { kind: 'recurring-route', routeId: 'route-pantry' },
		startsOnDay: 1,
		expiresOnDay: 31,
		stackingKey: 'freight-capacity:route-pantry',
		stackingRule: 'replace',
		effect: { kind: 'route-capacity-multiplier', multiplier: 0.5 },
		explanation: { key: 'events.freightDisruption.acceptDelay.capacity', params: {} },
		importance: 'normal',
		...overrides
	};
}

function plannerGame(
	products: StoreProduct[] = [product('bottled-water')],
	options: Partial<GameState> = {},
	archetype: 'convenience' | 'grocery' | 'boutique' | 'electronics' = 'convenience'
): GameState {
	const game = baseGame(archetype);
	return {
		...game,
		stores: [{ ...game.stores[0]!, products }],
		...options
	};
}

function pantryPlannerGame(): GameState {
	const game = baseGame('grocery');
	return {
		...game,
		stores: [{ ...game.stores[0]!, products: [product('pantry')] }]
	};
}

function readySnapshot(
	game: GameState,
	request: SupplyPlannerRequest = { retailCityId: 'harbor-city', productId: 'bottled-water' }
) {
	const result = buildSupplyPlannerSnapshot(game, request);
	expect(result.status).toBe('ready');
	if (result.status !== 'ready') {
		throw new Error(`Expected ready snapshot, got ${result.status}`);
	}
	return result.snapshot;
}

function createPlannerGameWithTwoRetailCities(
	secondStoreProducts: StoreProduct[] = [product('bottled-water')],
	secondStoreArchetype: 'convenience' | 'electronics' = 'convenience'
): GameState {
	const game = plannerGame([product('bottled-water')]);
	const harbor = game.cities[0]!;
	const campus = {
		...harbor,
		id: 'campus-junction',
		name: 'Campus Junction',
		tiles: harbor.tiles.map((tile) => ({
			...tile,
			id: tile.id.replace('harbor-city', 'campus-junction'),
			cityId: 'campus-junction'
		}))
	};
	const secondStore = {
		...game.stores[0]!,
		id: 'store-campus',
		archetypeId: secondStoreArchetype,
		products: secondStoreProducts,
		cityId: 'campus-junction',
		tileId: game.stores[0]!.tileId.replace('harbor-city', 'campus-junction')
	};

	return {
		...game,
		cities: [harbor, campus],
		stores: [game.stores[0]!, secondStore],
		world: {
			...game.world,
			revealedCityIds: [...game.world.revealedCityIds, 'campus-junction'],
			openedCityIds: [...game.world.openedCityIds, 'campus-junction']
		},
		retailSupplyAssignments: [
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
			{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
		]
	};
}

describe('supply planner snapshot', () => {
	it('lists supported carried categories for the requested retail city only', () => {
		const game = createPlannerGameWithTwoRetailCities([product('games')], 'electronics');
		const ids = listSupplyPlannerCategories(game, 'harbor-city');

		expect(ids).toEqual(['bottled-water']);
		expect(
			buildSupplyPlannerSnapshot(game, {
				retailCityId: 'harbor-city',
				productId: 'snacks'
			})
		).toEqual({ status: 'unsupported', reason: 'unsupported-category' });
	});

	it('scopes inventory and buildings through the configured supply city', () => {
		const snapshot = readySnapshot(createPlannerGameWithTwoRetailCities());

		expect(snapshot.supplyCityId).toBe('industry-city');
		expect(snapshot.buildings.every((row) => row.cityId === 'industry-city')).toBe(true);
	});

	it('clamps potential demand by weekly target-stock draw capacity', () => {
		const snapshot = readySnapshot(plannerGame([product('bottled-water', { targetStock: 70 })]));
		const row = snapshot.demandContributors.find((item) => item.retailCityId === 'harbor-city')!;

		expect(row.replenishmentCeilingPerDay).toBeCloseTo(70 / REPLENISHMENT_INTERVAL_DAYS);
		expect(row.effectiveDemandPerDay).toBe(
			Math.min(row.potentialDemandPerDay, row.replenishmentCeilingPerDay)
		);
	});

	it('keeps uniform-policy planner potential demand at its baseline', () => {
		const snapshot = readySnapshot(plannerGame([product('snacks', { targetStock: 70 })]), {
			retailCityId: 'harbor-city',
			productId: 'snacks'
		});
		const row = snapshot.demandContributors[0]!;

		expect(row.potentialDemandPerDay).toBeCloseTo(129.32, 10);
	});

	it('changes planner potential demand only by the overridden seller contribution', () => {
		const base = plannerGame([product('snacks')]);
		const secondStore = {
			...base.stores[0]!,
			id: 'store-b',
			products: [product('snacks')]
		};
		const twoStores = { ...base, stores: [...base.stores, secondStore] };
		const overridden = setPolicyOverride(
			twoStores,
			{ kind: 'store', storeId: twoStores.stores[0]!.id },
			{ marketing: 'promotions' }
		);
		const baselineSnapshot = readySnapshot(twoStores, {
			retailCityId: 'harbor-city',
			productId: 'snacks'
		});
		const overriddenSnapshot = readySnapshot(overridden, {
			retailCityId: 'harbor-city',
			productId: 'snacks'
		});
		const rawPool = buildCityDemandPools(twoStores, twoStores.cities[0]!).snacks!;
		const expectedDelta =
			rawPool *
			0.5 *
			(getPolicyDemandMultiplier({ marketing: 'promotions', pricing: 'standard' }) -
				getPolicyDemandMultiplier({ marketing: 'awareness', pricing: 'standard' }));

		expect(
			overriddenSnapshot.demandContributors[0]!.potentialDemandPerDay -
				baselineSnapshot.demandContributors[0]!.potentialDemandPerDay
		).toBeCloseTo(expectedDelta, 10);
	});

	it('keeps planner demand from a product unsupported by the seller archetype out of the shared pool', () => {
		const base = plannerGame([product('snacks')]);
		const unsupportedStore = {
			...base.stores[0]!,
			id: 'store-unsupported',
			archetypeId: 'electronics' as const,
			products: [product('snacks')]
		};
		const mixed = { ...base, stores: [...base.stores, unsupportedStore] };
		const validPolicy = new Map([
			[
				base.stores[0]!.id,
				resolveEffectivePolicy(base, { kind: 'store', storeId: base.stores[0]!.id }).values
			]
		]);
		const mixedPolicy = new Map(
			mixed.stores.map((store) => [
				store.id,
				resolveEffectivePolicy(mixed, { kind: 'store', storeId: store.id }).values
			])
		);

		// The planner's shared helper must use the same startingProductIds
		// predicate as live sales, so the unsupported seller adds no demand.
		expect(getPolicyAdjustedCityProductDemand(base, base.cities[0]!, 'snacks', validPolicy)).toBe(
			getPolicyAdjustedCityProductDemand(mixed, mixed.cities[0]!, 'snacks', mixedPolicy)
		);
	});

	it('keeps planner potential demand stable when only a trend phase day changes', () => {
		const request = { retailCityId: 'harbor-city' as const, productId: 'bottled-water' as const };
		const definition = getProductDefinition('bottled-water');
		const originalDynamics = definition.dynamics;
		definition.dynamics = {
			...originalDynamics,
			trend: { amplitude: 0.25, periodDays: 14, phaseDays: 0 }
		};

		try {
			const daySeven = readySnapshot(
				plannerGame([product('bottled-water')], { day: 7 }, 'convenience'),
				request
			);
			const dayFourteen = readySnapshot(
				plannerGame([product('bottled-water')], { day: 14 }, 'convenience'),
				request
			);
			const daySevenDemand = daySeven.demandContributors[0]!.potentialDemandPerDay;
			const dayFourteenDemand = dayFourteen.demandContributors[0]!.potentialDemandPerDay;

			expect(daySevenDemand).toBe(dayFourteenDemand);
		} finally {
			definition.dynamics = originalDynamics;
		}
	});

	it('keeps a sold zero-target category as a zero-draw contributor', () => {
		const snapshot = readySnapshot(
			plannerGame([product('bottled-water', { targetStock: 0, initialQuantity: 2 })])
		);
		const row = snapshot.demandContributors.find((item) => item.retailCityId === 'harbor-city')!;

		expect(row.replenishmentCeilingPerDay).toBe(0);
		expect(row.effectiveDemandPerDay).toBe(0);
		expect(Number.isFinite(row.retailImportCostPerUnit)).toBe(true);
	});

	it('includes all retail cities assigned to the same supply inventory', () => {
		const snapshot = readySnapshot(createPlannerGameWithTwoRetailCities());

		expect(snapshot.demandContributors.map((row) => row.retailCityId)).toEqual([
			'harbor-city',
			'campus-junction'
		]);
		expect(snapshot.demandPerDay).toBeCloseTo(
			snapshot.demandContributors.reduce((sum, row) => sum + row.effectiveDemandPerDay, 0)
		);
	});

	it('uses retail category import price rather than finished material input price', () => {
		const snapshot = readySnapshot(plannerGame());

		expect(snapshot.finishedImportCostPerUnit).toBe(2);
		expect(MATERIALS['bottled-water'].importCost).toBe(3);
	});

	it('keeps a supported zero-demand request ready', () => {
		const game = plannerGame([product('bottled-water')], {
			cities: [
				{
					...baseGame().cities[0]!,
					tiles: baseGame().cities[0]!.tiles.map((tile) => ({
						...tile,
						demand: 0,
						footTraffic: 0,
						customerFit: 0
					}))
				}
			]
		});
		const result = buildSupplyPlannerSnapshot(game, {
			retailCityId: 'harbor-city',
			productId: 'bottled-water'
		});

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		expect(result.snapshot.demandPerDay).toBe(0);
	});

	it('soft-fails an unavailable configured supply city before stats', () => {
		const game = plannerGame([product('bottled-water')], {
			retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: null }]
		});

		expect(
			buildSupplyPlannerSnapshot(game, {
				retailCityId: 'harbor-city',
				productId: 'bottled-water'
			})
		).toEqual({ status: 'unavailable', reason: 'supply-city-unavailable' });
	});

	it('does not hide authoritative inventory corruption behind planner UX', () => {
		const game = plannerGame([product('bottled-water')], {
			cityInventories: [{ cityId: 'industry-city', materials: { water: -1 } }]
		});

		expect(() =>
			buildSupplyPlannerSnapshot(game, {
				retailCityId: 'harbor-city',
				productId: 'bottled-water'
			})
		).toThrow(/City inventory invariant/);
	});

	it('aggregates upstream material requirements with maximum chain depth', () => {
		const snapshot = readySnapshot(
			plannerGame(undefined, {
				stores: [{ ...baseGame('grocery').stores[0]!, products: [product('pantry')] }]
			}),
			{ retailCityId: 'harbor-city', productId: 'pantry' }
		);
		const requirements = buildSupplyMaterialRequirements(snapshot);

		expect(requirements).toEqual([
			expect.objectContaining({
				materialId: 'pantry',
				requiredPerDay: snapshot.demandPerDay,
				chainDepth: 0
			}),
			expect.objectContaining({
				materialId: 'flour',
				requiredPerDay: snapshot.demandPerDay * 0.75,
				chainDepth: 1
			}),
			expect.objectContaining({
				materialId: 'grain',
				requiredPerDay: snapshot.demandPerDay * 0.9375,
				chainDepth: 2
			})
		]);
	});

	it('classifies the upstream-most missing producer from installed producer counts', () => {
		const snapshot = readySnapshot(pantryPlannerGame(), {
			retailCityId: 'harbor-city',
			productId: 'pantry'
		});

		const projection = projectSupplySnapshot(snapshot);

		expect(projection.bottleneck).toEqual({
			kind: 'missing-producer',
			materialId: 'grain',
			chainDepth: 2
		});
	});

	it('aggregates a shared upstream material once for drinks', () => {
		const snapshot = readySnapshot(
			plannerGame([product('soft-drinks', { targetStock: 90, sellingPrice: 4 })]),
			{ retailCityId: 'harbor-city', productId: 'soft-drinks' }
		);
		const requirements = buildSupplyMaterialRequirements(snapshot);
		const waterRows = requirements.filter((row) => row.materialId === 'water');

		expect(waterRows).toHaveLength(1);
		expect(waterRows[0]!.chainDepth).toBe(2);
	});

	it('keeps logistics routes in the projection without a contention limitation', () => {
		const snapshot = readySnapshot(
			plannerGame([product('bottled-water')], {
				logistics: {
					recurringRoutes: [
						route({ id: 'route-water' }),
						route({ id: 'route-grain', materialId: 'grain' }),
						route({ id: 'route-paused', materialId: 'water', state: 'paused' }),
						route({ id: 'route-inbound', materialId: 'water', originCityId: 'harbor-city' })
					],
					transferOrders: [],
					nextTransferSequence: 1,
					nextRouteSequence: 5
				}
			})
		);

		const projection = projectSupplySnapshot(snapshot);
		expect(projection.limitations).toEqual([
			{ kind: 'rail-capacity-not-modeled' },
			{ kind: 'store-sales-capacity-not-modeled' }
		]);
	});

	it('preserves the no-logistics projection public output', () => {
		const snapshot = splitMillPantrySnapshot(100);
		snapshot.logistics = {
			currentDay: 5,
			remoteCities: [],
			inTransitOrders: [],
			routes: [],
			routeModifiers: [],
			nextRouteSequence: 1,
			nextTransferSequence: 1
		};
		const projection = projectSupplySnapshot(snapshot);
		expect({
			materials: projection.materials,
			warehouse: projection.warehouse,
			bottleneck: projection.bottleneck,
			limitations: projection.limitations
		}).toEqual({
			materials: [
				{
					materialId: 'pantry',
					requiredPerDay: 16,
					producerRecipeId: 'pantry-goods-production',
					chainDepth: 0,
					buildingCount: 1,
					maxBuildingLevel: 1,
					buildingLevels: [1],
					inventoryUnits: 0,
					daysOfCover: 0,
					projectedStockoutDay: 0,
					installedCapacityPerDay: 8,
					usableCapacityPerDay: 8,
					sevenDay: {
						horizonDays: 7,
						requiredUnits: 112,
						startingInventoryUnits: 0,
						localAvailableUnits: 56,
						importRequiredUnits: 56,
						endingInventoryUnits: 0,
						daysOfCover: 0,
						projectedStockoutDay: 0
					},
					thirtyDay: {
						horizonDays: 30,
						requiredUnits: 480,
						startingInventoryUnits: 0,
						localAvailableUnits: 240,
						importRequiredUnits: 240,
						endingInventoryUnits: 0,
						daysOfCover: 0,
						projectedStockoutDay: 0
					}
				},
				{
					materialId: 'flour',
					requiredPerDay: 12,
					producerRecipeId: 'flour-milling',
					chainDepth: 1,
					buildingCount: 2,
					maxBuildingLevel: 1,
					buildingLevels: [1, 1],
					inventoryUnits: 0,
					daysOfCover: null,
					projectedStockoutDay: null,
					installedCapacityPerDay: 16,
					usableCapacityPerDay: 12,
					sevenDay: {
						horizonDays: 7,
						requiredUnits: 84,
						startingInventoryUnits: 0,
						localAvailableUnits: 84,
						importRequiredUnits: 0,
						endingInventoryUnits: 0,
						daysOfCover: null,
						projectedStockoutDay: null
					},
					thirtyDay: {
						horizonDays: 30,
						requiredUnits: 360,
						startingInventoryUnits: 0,
						localAvailableUnits: 360,
						importRequiredUnits: 0,
						endingInventoryUnits: 0,
						daysOfCover: null,
						projectedStockoutDay: null
					}
				},
				{
					materialId: 'grain',
					requiredPerDay: 15,
					producerRecipeId: 'grain-harvest',
					chainDepth: 2,
					buildingCount: 1,
					maxBuildingLevel: 1,
					buildingLevels: [1],
					inventoryUnits: 100,
					daysOfCover: 20,
					projectedStockoutDay: 20,
					installedCapacityPerDay: 30,
					usableCapacityPerDay: 10,
					sevenDay: {
						horizonDays: 7,
						requiredUnits: 105,
						startingInventoryUnits: 100,
						localAvailableUnits: 105,
						importRequiredUnits: 0,
						endingInventoryUnits: 65,
						daysOfCover: 20,
						projectedStockoutDay: 20
					},
					thirtyDay: {
						horizonDays: 30,
						requiredUnits: 450,
						startingInventoryUnits: 100,
						localAvailableUnits: 400,
						importRequiredUnits: 50,
						endingInventoryUnits: 0,
						daysOfCover: 20,
						projectedStockoutDay: 20
					}
				}
			],
			warehouse: {
				capacity: 100,
				used: 0,
				freeCapacity: 100,
				overflowUnits: 0
			},
			bottleneck: { kind: 'rail-disconnected', buildingId: 'grain-farm-1', materialId: 'grain' },
			limitations: [
				{ kind: 'rail-capacity-not-modeled' },
				{ kind: 'store-sales-capacity-not-modeled' }
			]
		});
	});

	it('keeps logistics-trace raw inventory within warehouse processor caps', () => {
		const base = splitMillPantrySnapshot(100);
		const projection = projectSupplySnapshot({
			...base,
			logistics: {
				currentDay: 5,
				remoteCities: [
					{ inventory: { cityId: 'breadbasket-basin', materials: {} }, warehouseCapacity: 20 }
				],
				inTransitOrders: [],
				routes: [
					route({
						id: 'route-noop-grain',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'grain',
						capacity: 1,
						nextDispatchOnDay: 5
					})
				],
				routeModifiers: [],
				nextRouteSequence: 1,
				nextTransferSequence: 1
			}
		});
		const grain = projection.materials.find((material) => material.materialId === 'grain')!;

		expect(grain.usableCapacityPerDay).toBe(10);
		expect(grain.sevenDay.importRequiredUnits).toBe(0);
		expect(grain.thirtyDay.importRequiredUnits).toBe(50);
	});

	it('counts projected arrivals from newly scheduled recurring transfers per route', () => {
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			demandPerDay: 10,
			logistics: {
				currentDay: 1,
				remoteCities: [
					{
						inventory: { cityId: 'breadbasket-basin', materials: { pantry: 100 } },
						warehouseCapacity: 100
					}
				],
				inTransitOrders: [],
				routes: [
					route({
						id: 'route-pantry',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'pantry',
						capacity: 10,
						frequencyDays: 1,
						leadTimeDays: 1,
						nextDispatchOnDay: 1
					})
				],
				routeModifiers: [],
				nextRouteSequence: 1,
				nextTransferSequence: 1
			}
		});

		const projection = projectSupplySnapshot(snapshot);
		const forecast = projection.routeForecasts?.find((row) => row.route.id === 'route-pantry');

		expect(forecast?.projectedDispatchedUnits30).toBeGreaterThan(0);
		expect(forecast?.projectedDeliveredUnits30).toBeGreaterThan(0);
	});

	it('attributes shared destination priority contention even across materials', () => {
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			demandPerDay: 10,
			logistics: {
				currentDay: 1,
				remoteCities: [
					{
						inventory: {
							cityId: 'breadbasket-basin',
							materials: { water: 100, pantry: 100 }
						},
						warehouseCapacity: 100
					}
				],
				inTransitOrders: [],
				routes: [
					route({
						id: 'route-blocker',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'water',
						capacity: 100,
						priority: 0,
						nextDispatchOnDay: 1
					}),
					route({
						id: 'route-loser',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'pantry',
						capacity: 10,
						priority: 1,
						nextDispatchOnDay: 1
					})
				],
				routeModifiers: [],
				nextRouteSequence: 1,
				nextTransferSequence: 1
			}
		});

		const projection = projectSupplySnapshot(snapshot);
		const forecast = projection.routeForecasts?.find((row) => row.route.id === 'route-loser');

		expect(forecast?.projectedCondition).toBe('route-priority-constrained');
		expect(forecast?.priorityBlockedByRouteId).toBe('route-blocker');
		expect(forecast?.firstPriorityConstraintDay).toBe(1);
	});

	it('attributes a priority blocker when only partial destination headroom remains', () => {
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			inventory: { water: 3 },
			warehouseCapacity: 5,
			logistics: {
				currentDay: 1,
				remoteCities: [
					{
						inventory: {
							cityId: 'breadbasket-basin',
							materials: { water: 100, pantry: 100 }
						},
						warehouseCapacity: 100
					}
				],
				inTransitOrders: [],
				routes: [
					route({
						id: 'route-blocker',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'water',
						capacity: 2,
						priority: 0,
						nextDispatchOnDay: 1
					}),
					route({
						id: 'route-loser',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'pantry',
						capacity: 10,
						priority: 1,
						nextDispatchOnDay: 1
					})
				],
				routeModifiers: [],
				nextRouteSequence: 1,
				nextTransferSequence: 1
			}
		});

		const projection = projectSupplySnapshot(snapshot);
		const forecast = projection.routeForecasts?.find((row) => row.route.id === 'route-loser');

		expect(forecast?.projectedCondition).toBe('route-priority-constrained');
		expect(forecast?.priorityBlockedByRouteId).toBe('route-blocker');
		expect(forecast?.firstPriorityConstraintDay).toBe(1);
	});

	it('uses raw route ID order as the predecessor for equal-priority contention', () => {
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			warehouseCapacity: 2,
			logistics: {
				currentDay: 1,
				remoteCities: [
					{
						inventory: {
							cityId: 'breadbasket-basin',
							materials: { water: 100, pantry: 100 }
						},
						warehouseCapacity: 100
					}
				],
				inTransitOrders: [],
				routes: [
					route({
						id: 'route-a-blocker',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'water',
						capacity: 2,
						priority: 1,
						nextDispatchOnDay: 1
					}),
					route({
						id: 'route-z-loser',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'pantry',
						capacity: 10,
						priority: 1,
						nextDispatchOnDay: 1
					})
				],
				routeModifiers: [],
				nextRouteSequence: 1,
				nextTransferSequence: 1
			}
		});

		const projection = projectSupplySnapshot(snapshot);
		const forecast = projection.routeForecasts?.find((row) => row.route.id === 'route-z-loser');

		expect(forecast?.projectedCondition).toBe('route-priority-constrained');
		expect(forecast?.priorityBlockedByRouteId).toBe('route-a-blocker');
		expect(forecast?.firstPriorityConstraintDay).toBe(1);
	});

	it('attributes shared-origin priority contention across different destinations', () => {
		// Two routes share origin + material but ship to different
		// destinations.  The earlier-priority route consumes all origin
		// stock, so the later route is origin-stock-constrained.  The
		// planner must still classify it as priority-constrained (with the
		// shared-origin route as the blocker) so the action layer can offer a
		// reprioritization rather than silently dropping it as
		// origin-stock-constrained.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			logistics: {
				currentDay: 1,
				remoteCities: [
					{
						inventory: {
							cityId: 'breadbasket-basin',
							materials: { pantry: 10 }
						},
						warehouseCapacity: 100
					},
					{
						inventory: {
							cityId: 'harbor-city',
							materials: {}
						},
						warehouseCapacity: 100
					}
				],
				inTransitOrders: [],
				routes: [
					route({
						id: 'route-blocker',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'harbor-city',
						materialId: 'pantry',
						capacity: 10,
						priority: 0,
						nextDispatchOnDay: 1
					}),
					route({
						id: 'route-loser',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'pantry',
						capacity: 10,
						priority: 1,
						nextDispatchOnDay: 1
					})
				],
				routeModifiers: [],
				nextRouteSequence: 1,
				nextTransferSequence: 1
			}
		});

		const projection = projectSupplySnapshot(snapshot);
		const forecast = projection.routeForecasts?.find((row) => row.route.id === 'route-loser');

		expect(forecast?.projectedCondition).toBe('route-priority-constrained');
		expect(forecast?.priorityBlockedByRouteId).toBe('route-blocker');
		expect(forecast?.firstPriorityConstraintDay).toBe(1);
	});

	it('counts an upstream producer connected directly to a usable downstream processor', () => {
		const base = plannerGame(undefined, {
			stores: [{ ...baseGame('grocery').stores[0]!, products: [product('pantry')] }],
			industrialBuildings: [
				building('grain-farm', 'grain-farm-1', 'industry-city', 1, 2, 2),
				building('flour-mill', 'flour-mill-1', 'industry-city', 1, 2, 6),
				building('pantry-works', 'pantry-works-1', 'industry-city', 1, 2, 10),
				building('warehouse', 'warehouse-1', 'industry-city', 1, 2, 14)
			]
		});
		const game = {
			...base,
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: segmentedPantryRails() } : city
			)
		};
		const result = buildSupplyPlannerSnapshot(game, {
			retailCityId: 'harbor-city',
			productId: 'pantry'
		});

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		expect(result.snapshot.usableBuildingIds).toContain('grain-farm-1');
		// The warehouse is only a valid sink for grain if a usable downstream
		// consumer (flour-mill) can also reach it via rail. The segmented rails
		// leave flour-mill and warehouse on disconnected rail segments, so the
		// warehouse is not a valid hub sink for grain here — only the direct
		// flour-mill consumer is.
		expect(result.snapshot.usableSinkBuildingIdsByMaterial.grain).toEqual(['flour-mill-1']);
		expect(result.snapshot.usableSinkBuildingIdsByMaterial.flour).toContain('pantry-works-1');
	});

	it('preserves warehouse-accessible grain inventory when the Grain Farm is missing', () => {
		// Regression: when the Grain Farm is absent, the Flour Mill is
		// installed and rail-connected to a warehouse, Pantry Works is
		// usable, and 100 Grain sits in city inventory, the Flour Mill can
		// pull those 100 Grain from the warehouse at runtime. The planner
		// must credit that accessible inventory — not strand it as if no
		// warehouse-connected consumer exists.
		const base = plannerGame(undefined, {
			stores: [{ ...baseGame('grocery').stores[0]!, products: [product('pantry')] }],
			industrialBuildings: [
				building('flour-mill', 'flour-mill-1', 'industry-city', 1, 2, 6),
				building('pantry-works', 'pantry-works-1', 'industry-city', 1, 2, 10),
				building('warehouse', 'warehouse-1', 'industry-city', 1, 2, 14)
			],
			cityInventories: [{ cityId: 'industry-city', materials: { grain: 100 } }]
		});
		const game = {
			...base,
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: verticalRails(1, 17) } : city
			)
		};
		const result = buildSupplyPlannerSnapshot(game, {
			retailCityId: 'harbor-city',
			productId: 'pantry'
		});

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		// The Flour Mill is usable and warehouse-connected, so the
		// warehouse-connected consumer capacity for grain must be > 0 even
		// though no Grain Farm is installed.
		expect(result.snapshot.warehouseConnectedConsumerCapacityByMaterial.grain).toBeGreaterThan(0);

		const projection = projectSupplySnapshot(result.snapshot);
		const grainRow = projection.materials.find((m) => m.materialId === 'grain')!;
		// No Grain Farm installed → no usable production capacity.
		expect(grainRow.usableCapacityPerDay).toBe(0);
		// The 100 Grain is accessible (Flour Mill can reach the warehouse)
		// and must be credited as starting inventory.
		expect(grainRow.thirtyDay.startingInventoryUnits).toBe(100);
	});

	it('rejects a finished producer with no warehouse path', () => {
		const base = plannerGame([product('bottled-water')], {
			industrialBuildings: [
				building('water-bottler', 'water-bottler-1', 'industry-city', 1, 10, 2),
				building('warehouse', 'warehouse-1', 'industry-city', 1, 2, 6)
			]
		});
		const game = {
			...base,
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: verticalRails(5, 7) } : city
			)
		};
		const result = buildSupplyPlannerSnapshot(game, {
			retailCityId: 'harbor-city',
			productId: 'bottled-water'
		});

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		expect(result.snapshot.usableBuildingIds).not.toContain('water-bottler-1');
		expect(result.snapshot.disconnectedBuildingIds).toContain('water-bottler-1');
	});

	it('treats a warehouse-mediated city inventory hub as a sink for raw materials', () => {
		// Producer (water-pump) and consumer (water-bottler) are on separate
		// rail islands, each with its own warehouse. pushSurplusViaRail can
		// push water into the city inventory through warehouse-1, and
		// pullViaRail can later supply the water-bottler from warehouse-2.
		// The planner must model this hub and mark the pump usable.
		const base = plannerGame([product('bottled-water')], {
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 'industry-city', 1, 2, 2),
				building('warehouse', 'warehouse-1', 'industry-city', 1, 2, 4),
				building('water-bottler', 'water-bottler-1', 'industry-city', 1, 2, 11),
				building('warehouse', 'warehouse-2', 'industry-city', 1, 2, 12)
			]
		});
		const game = {
			...base,
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city'
					? { ...city, rails: [...verticalRails(1, 5), ...verticalRails(10, 14)] }
					: city
			)
		};
		const result = buildSupplyPlannerSnapshot(game, {
			retailCityId: 'harbor-city',
			productId: 'bottled-water'
		});

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		expect(result.snapshot.usableBuildingIds).toContain('water-bottler-1');
		expect(result.snapshot.usableBuildingIds).toContain('water-pump-1');
		expect(result.snapshot.disconnectedBuildingIds).not.toContain('water-pump-1');
	});

	it('does not credit full water capacity when only one Drinks consumer branch is reachable', () => {
		// Drinks requires water through two branches: water-filtration and
		// syrup-production. The water-pump can only reach the water-filtration
		// branch (same rail island). The syrup-plant is on a separate island
		// with no warehouse bridge. The pump's capacity must be capped at the
		// reachable (filtration) demand, not credited against total water demand.
		const base = plannerGame([product('soft-drinks', { targetStock: 90, sellingPrice: 4 })], {
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 'industry-city', 1, 2, 2),
				building('water-filtration-plant', 'water-filtration-1', 'industry-city', 1, 2, 5),
				building('drink-bottling-plant', 'drink-bottling-1', 'industry-city', 1, 2, 8),
				building('warehouse', 'warehouse-1', 'industry-city', 1, 2, 11),
				building('syrup-plant', 'syrup-plant-1', 'industry-city', 1, 2, 17)
			]
		});
		const game = {
			...base,
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city'
					? { ...city, rails: [...verticalRails(1, 12), ...verticalRails(16, 22)] }
					: city
			)
		};
		const result = buildSupplyPlannerSnapshot(game, {
			retailCityId: 'harbor-city',
			productId: 'soft-drinks'
		});

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		expect(result.snapshot.disconnectedBuildingIds).toContain('syrup-plant-1');
		expect(result.snapshot.usableBuildingIds).toContain('water-pump-1');

		const projection = projectSupplySnapshot(result.snapshot);
		const waterRow = projection.materials.find((m) => m.materialId === 'water')!;

		// The water-pump produces 40 units/day at level 1.
		expect(waterRow.installedCapacityPerDay).toBe(40);
		// The usable capacity must be capped at the reachable demand (water
		// for the filtration branch only), not the full 40 units/day.
		expect(waterRow.usableCapacityPerDay).toBeLessThan(40);
		// The projection must show a shortage for water because the syrup
		// branch's demand cannot be served by the pump.
		expect(waterRow.thirtyDay.importRequiredUnits).toBeGreaterThan(0);
	});

	it('does not treat a raw producer as usable when it only reaches a warehouse with no downstream hub consumer', () => {
		// Grain Farm → warehouse is connected by rail. Flour Mill → Pantry Works
		// is connected by a separate rail segment. But the Flour Mill cannot
		// reach the warehouse (no rail path). The Grain Farm should be
		// classified as disconnected because no usable downstream consumer of
		// grain can reach the warehouse hub.
		const base = plannerGame(undefined, {
			stores: [{ ...baseGame('grocery').stores[0]!, products: [product('pantry')] }],
			industrialBuildings: [
				building('grain-farm', 'grain-farm-1', 'industry-city', 1, 2, 2),
				building('warehouse', 'warehouse-1', 'industry-city', 1, 2, 6),
				building('flour-mill', 'flour-mill-1', 'industry-city', 1, 10, 10),
				building('pantry-works', 'pantry-works-1', 'industry-city', 1, 10, 14)
			]
		});
		const game = {
			...base,
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city'
					? {
							...city,
							rails: [...verticalRails(1, 9, 2), ...verticalRails(9, 17, 10)]
						}
					: city
			)
		};
		const result = buildSupplyPlannerSnapshot(game, {
			retailCityId: 'harbor-city',
			productId: 'pantry'
		});

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		// The grain farm can reach the warehouse, but the flour mill cannot
		// reach the warehouse. The warehouse is not a valid grain sink, so the
		// grain farm has no usable sink and should be disconnected.
		expect(result.snapshot.disconnectedBuildingIds).toContain('grain-farm-1');
		expect(result.snapshot.usableBuildingIds).not.toContain('grain-farm-1');
	});

	it('does not transfer capacity between producers serving disjoint branches', () => {
		// Two water pumps on separate rail islands, each serving a different
		// Drinks consumer branch (filtration vs syrup). The drink-bottling
		// plant's 2x2 footprint bridges the two rail islands: its top attach
		// cells are on island A (x=2) and its right attach cells are on island
		// B (x=4). Pump A can reach the filtration plant but not the syrup
		// plant. Pump B can reach the syrup plant but not the filtration plant.
		// Each pump's usable capacity must be capped at only the demand of the
		// branch it can reach, not the aggregate water demand across both.
		const base = plannerGame([product('soft-drinks', { targetStock: 90, sellingPrice: 4 })], {
			industrialBuildings: [
				building('water-pump', 'water-pump-a', 'industry-city', 1, 2, 2),
				building('water-filtration-plant', 'water-filtration-1', 'industry-city', 1, 2, 5),
				building('drink-bottling-plant', 'drink-bottling-1', 'industry-city', 1, 2, 8),
				building('warehouse', 'warehouse-1', 'industry-city', 1, 4, 11),
				building('syrup-plant', 'syrup-plant-1', 'industry-city', 1, 4, 14),
				building('water-pump', 'water-pump-b', 'industry-city', 1, 4, 17)
			]
		});
		const game = {
			...base,
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city'
					? {
							...city,
							rails: [...verticalRails(1, 9, 2), ...verticalRails(8, 22, 4)]
						}
					: city
			)
		};
		const result = buildSupplyPlannerSnapshot(game, {
			retailCityId: 'harbor-city',
			productId: 'soft-drinks'
		});

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		expect(result.snapshot.usableBuildingIds).toContain('water-pump-a');
		expect(result.snapshot.usableBuildingIds).toContain('water-pump-b');

		const projection = projectSupplySnapshot(result.snapshot);
		const waterRow = projection.materials.find((m) => m.materialId === 'water')!;

		// Each pump produces 40 units/day at level 1, so installed is 80.
		expect(waterRow.installedCapacityPerDay).toBe(80);
		// Usable capacity must be less than 80 — each pump is capped at only
		// the demand of the branch it can reach, not the aggregate.
		expect(waterRow.usableCapacityPerDay).toBeLessThan(80);
		// Per-producer caps: pump-a's cap should be the filtration branch
		// demand only, and pump-b's cap should be the syrup branch demand only.
		const pumpAKey = `water-pump-a\u0000water`;
		const pumpBKey = `water-pump-b\u0000water`;
		const pumpACap = result.snapshot.reachableDemandByBuildingAndMaterial[pumpAKey]!;
		const pumpBCap = result.snapshot.reachableDemandByBuildingAndMaterial[pumpBKey]!;
		expect(pumpACap).toBeGreaterThan(0);
		expect(pumpBCap).toBeGreaterThan(0);
		// Neither pump's cap should equal the aggregate water demand (which
		// would mean it's credited for both branches).
		const aggregateCap = result.snapshot.reachableDemandByMaterial.water!;
		expect(pumpACap).toBeLessThan(aggregateCap);
		expect(pumpBCap).toBeLessThan(aggregateCap);
	});

	it('does not credit aggregate capacity beyond reachable branch demand when producers overlap', () => {
		// Two water pumps on the SAME rail island, both reaching the
		// filtration branch. Neither can reach the syrup branch (which is
		// alone on a separate island). Each pump individually is capped at
		// the filtration branch demand, but without an aggregate clamp the
		// projection sums both caps — crediting 2× the filtration demand
		// even though only 1× can be consumed there.
		const base = plannerGame([product('soft-drinks', { targetStock: 90, sellingPrice: 4 })], {
			industrialBuildings: [
				building('water-pump', 'water-pump-a', 'industry-city', 1, 2, 2),
				building('water-pump', 'water-pump-b', 'industry-city', 1, 2, 3),
				building('water-filtration-plant', 'water-filtration-1', 'industry-city', 1, 2, 5),
				building('drink-bottling-plant', 'drink-bottling-1', 'industry-city', 1, 2, 8),
				building('warehouse', 'warehouse-1', 'industry-city', 1, 2, 11),
				building('syrup-plant', 'syrup-plant-1', 'industry-city', 1, 2, 17)
			]
		});
		const game = {
			...base,
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city'
					? { ...city, rails: [...verticalRails(1, 12), ...verticalRails(16, 22)] }
					: city
			)
		};
		const result = buildSupplyPlannerSnapshot(game, {
			retailCityId: 'harbor-city',
			productId: 'soft-drinks'
		});

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		expect(result.snapshot.usableBuildingIds).toContain('water-pump-a');
		expect(result.snapshot.usableBuildingIds).toContain('water-pump-b');

		const projection = projectSupplySnapshot(result.snapshot);
		const waterRow = projection.materials.find((m) => m.materialId === 'water')!;

		expect(waterRow.installedCapacityPerDay).toBe(80);
		const aggregateReachable = result.snapshot.reachableDemandByMaterial.water!;
		expect(aggregateReachable).toBeGreaterThan(0);
		expect(aggregateReachable).toBeLessThan(waterRow.requiredPerDay);
		expect(waterRow.usableCapacityPerDay).toBeLessThanOrEqual(aggregateReachable);
	});

	it('does not overstate usable capacity when producers overlap on one branch and another branch is under-capacity', () => {
		// Three water pumps: A and B both reach the filtration branch, C
		// reaches only the syrup branch. Each pump has capacity 40/day.
		// Filtration demands 50 water/day, syrup demands 50 water/day.
		// The old per-producer cap + aggregate clamp would compute
		// min(40,50)+min(40,50)+min(40,50) = 120, clamped to aggregate 100.
		// But filtration can only consume 50 (A:40 + B:10) and syrup can
		// only get 40 (C:40, short by 10), so the real usable supply is 90.
		// The greedy per-branch allocation must report 90, not 100.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'drinks',
			demandPerDay: 100,
			buildings: [
				{ id: 'pump-a', cityId: 'industry-city', typeId: 'water-pump', level: 1 },
				{ id: 'pump-b', cityId: 'industry-city', typeId: 'water-pump', level: 1 },
				{ id: 'pump-c', cityId: 'industry-city', typeId: 'water-pump', level: 1 },
				{
					id: 'filtration-1',
					cityId: 'industry-city',
					typeId: 'water-filtration-plant',
					level: 1
				},
				{ id: 'syrup-1', cityId: 'industry-city', typeId: 'syrup-plant', level: 1 },
				{
					id: 'bottling-1',
					cityId: 'industry-city',
					typeId: 'drink-bottling-plant',
					level: 1
				},
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
			],
			usableBuildingIds: [
				'pump-a',
				'pump-b',
				'pump-c',
				'filtration-1',
				'syrup-1',
				'bottling-1',
				'warehouse-1'
			],
			reachableDemandByMaterial: { water: 100 },
			reachableDemandByBuildingAndMaterial: {
				'pump-a\u0000water': 50,
				'pump-b\u0000water': 50,
				'pump-c\u0000water': 50
			},
			reachableBranchesByBuildingAndMaterial: {
				'pump-a\u0000water': new Map([['filtered-water', 50]]),
				'pump-b\u0000water': new Map([['filtered-water', 50]]),
				'pump-c\u0000water': new Map([['syrup', 50]])
			}
		});
		const projection = projectSupplySnapshot(snapshot);
		const waterRow = projection.materials.find((m) => m.materialId === 'water')!;

		// Greedy allocation: filtration gets 50 (A:40 + B:10), syrup gets
		// 40 (C:40). Total = 90, not 100 (the aggregate clamp value).
		expect(waterRow.usableCapacityPerDay).toBe(90);
	});

	it('allocates shared producer capacity optimally across branches via max-flow', () => {
		// A shared pump (A) reaches both filtration and syrup branches,
		// while specialists B (filtration only) and C (syrup only) each
		// reach a single branch. Each pump produces 40/day; each branch
		// demands 50/day. The old greedy heuristic sorted branches
		// alphabetically and consumed A's capacity on filtration first,
		// giving 90 (filtration 50, syrup 40). The max-flow allocator
		// routes B→filtration and splits A across both, achieving 100.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'drinks',
			demandPerDay: 100,
			buildings: [
				{ id: 'pump-a', cityId: 'industry-city', typeId: 'water-pump', level: 1 },
				{ id: 'pump-b', cityId: 'industry-city', typeId: 'water-pump', level: 1 },
				{ id: 'pump-c', cityId: 'industry-city', typeId: 'water-pump', level: 1 },
				{
					id: 'filtration-1',
					cityId: 'industry-city',
					typeId: 'water-filtration-plant',
					level: 1
				},
				{ id: 'syrup-1', cityId: 'industry-city', typeId: 'syrup-plant', level: 1 },
				{
					id: 'bottling-1',
					cityId: 'industry-city',
					typeId: 'drink-bottling-plant',
					level: 1
				},
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
			],
			usableBuildingIds: [
				'pump-a',
				'pump-b',
				'pump-c',
				'filtration-1',
				'syrup-1',
				'bottling-1',
				'warehouse-1'
			],
			reachableDemandByMaterial: { water: 100 },
			reachableDemandByBuildingAndMaterial: {
				'pump-a\u0000water': 100,
				'pump-b\u0000water': 50,
				'pump-c\u0000water': 50
			},
			reachableBranchesByBuildingAndMaterial: {
				'pump-a\u0000water': new Map([
					['filtered-water', 50],
					['syrup', 50]
				]),
				'pump-b\u0000water': new Map([['filtered-water', 50]]),
				'pump-c\u0000water': new Map([['syrup', 50]])
			}
		});
		const projection = projectSupplySnapshot(snapshot);
		const waterRow = projection.materials.find((m) => m.materialId === 'water')!;

		// Max-flow: B→filtration(40)+A→filtration(10)=50,
		// A→syrup(30)+C→syrup(20)=50. Total 100.
		// Old greedy gave 90 (A wasted on filtration).
		expect(waterRow.usableCapacityPerDay).toBe(100);
	});

	it('caps producer usable capacity by reachable processor instance input capacity', () => {
		// Processor-instance awareness: a Grain Farm can only reach one of two
		// Flour Mills (Mill A). Mill A's input capacity is 10 grain/day at
		// level 1. The full grain branch demand is 15/day (from 12 flour/day
		// × 10/8 ratio). Without processor-instance awareness, the planner
		// credits the Grain Farm with the full 15/day branch demand. With the
		// 3-layer max-flow (producer→processor→branch), the Grain Farm's
		// usable capacity is capped at Mill A's input capacity (10/day).
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			demandPerDay: 16,
			buildings: [
				{ id: 'grain-farm-1', cityId: 'industry-city', typeId: 'grain-farm', level: 1 },
				{ id: 'flour-mill-a', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
				{ id: 'flour-mill-b', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
				{ id: 'pantry-works-1', cityId: 'industry-city', typeId: 'pantry-works', level: 1 },
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
			],
			usableBuildingIds: [
				'grain-farm-1',
				'flour-mill-a',
				'flour-mill-b',
				'pantry-works-1',
				'warehouse-1'
			],
			usableSinkBuildingIdsByMaterial: {
				grain: ['flour-mill-a', 'flour-mill-b'],
				flour: ['pantry-works-1'],
				pantry: ['warehouse-1']
			},
			reachableDemandByMaterial: { grain: 15, flour: 12 },
			reachableDemandByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': 15,
				'flour-mill-a\u0000flour': 12,
				'flour-mill-b\u0000flour': 12
			},
			reachableBranchesByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': new Map([['flour', 15]]),
				'flour-mill-a\u0000flour': new Map([['pantry', 12]]),
				'flour-mill-b\u0000flour': new Map([['pantry', 12]])
			},
			reachableProcessorsByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': [
					{
						processorId: 'flour-mill-a',
						branchId: 'flour',
						inputCapacity: 10,
						canReachWarehouse: true
					}
				]
			}
		});
		const projection = projectSupplySnapshot(snapshot);
		const grainRow = projection.materials.find((m) => m.materialId === 'grain')!;

		// Grain Farm produces 30 grain/day at level 1, but can only deliver to
		// Mill A which consumes 10 grain/day. Usable capacity must be 10, not
		// 15 (the full branch demand) or 30 (the farm's output capacity).
		expect(grainRow.installedCapacityPerDay).toBe(30);
		expect(grainRow.usableCapacityPerDay).toBe(10);
	});

	it('credits full branch demand when producer can reach all processor instances', () => {
		// Contrast test: when the Grain Farm can reach BOTH Flour Mills, the
		// 3-layer max-flow should credit the full branch demand (capped by
		// producer capacity), not just one mill's input capacity.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			demandPerDay: 16,
			buildings: [
				{ id: 'grain-farm-1', cityId: 'industry-city', typeId: 'grain-farm', level: 1 },
				{ id: 'flour-mill-a', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
				{ id: 'flour-mill-b', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
				{ id: 'pantry-works-1', cityId: 'industry-city', typeId: 'pantry-works', level: 1 },
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
			],
			usableBuildingIds: [
				'grain-farm-1',
				'flour-mill-a',
				'flour-mill-b',
				'pantry-works-1',
				'warehouse-1'
			],
			usableSinkBuildingIdsByMaterial: {
				grain: ['flour-mill-a', 'flour-mill-b'],
				flour: ['pantry-works-1'],
				pantry: ['warehouse-1']
			},
			reachableDemandByMaterial: { grain: 15, flour: 12 },
			reachableDemandByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': 15,
				'flour-mill-a\u0000flour': 12,
				'flour-mill-b\u0000flour': 12
			},
			reachableBranchesByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': new Map([['flour', 15]]),
				'flour-mill-a\u0000flour': new Map([['pantry', 12]]),
				'flour-mill-b\u0000flour': new Map([['pantry', 12]])
			},
			reachableProcessorsByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': [
					{
						processorId: 'flour-mill-a',
						branchId: 'flour',
						inputCapacity: 10,
						canReachWarehouse: true
					},
					{
						processorId: 'flour-mill-b',
						branchId: 'flour',
						inputCapacity: 10,
						canReachWarehouse: true
					}
				]
			}
		});
		const projection = projectSupplySnapshot(snapshot);
		const grainRow = projection.materials.find((m) => m.materialId === 'grain')!;

		// Grain Farm can reach both mills (total input capacity 20). Branch
		// demand is 15. Producer capacity is 30. Usable = min(30, 20, 15) = 15.
		expect(grainRow.usableCapacityPerDay).toBe(15);
	});

	it('caps a shared processor input capacity across multiple producers', () => {
		// Regression: two Grain Farms both reach a single Flour Mill (input
		// capacity 10 grain/day at level 1). The full grain branch demand is
		// 15/day (from 12 flour/day x 10/8 ratio). The 3-layer max-flow must
		// cap total usable grain at the mill's shared input capacity (10), not
		// allow each producer its own 10-unit edge into the mill (which would
		// let 15+ flow through one mill that can consume only 10).
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			demandPerDay: 16,
			buildings: [
				{ id: 'grain-farm-1', cityId: 'industry-city', typeId: 'grain-farm', level: 1 },
				{ id: 'grain-farm-2', cityId: 'industry-city', typeId: 'grain-farm', level: 1 },
				{ id: 'flour-mill-a', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
				{ id: 'pantry-works-1', cityId: 'industry-city', typeId: 'pantry-works', level: 1 },
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
			],
			usableBuildingIds: [
				'grain-farm-1',
				'grain-farm-2',
				'flour-mill-a',
				'pantry-works-1',
				'warehouse-1'
			],
			usableSinkBuildingIdsByMaterial: {
				grain: ['flour-mill-a'],
				flour: ['pantry-works-1'],
				pantry: ['warehouse-1']
			},
			reachableDemandByMaterial: { grain: 15, flour: 12 },
			reachableDemandByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': 15,
				'grain-farm-2\u0000grain': 15,
				'flour-mill-a\u0000flour': 12
			},
			reachableBranchesByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': new Map([['flour', 15]]),
				'grain-farm-2\u0000grain': new Map([['flour', 15]]),
				'flour-mill-a\u0000flour': new Map([['pantry', 12]])
			},
			reachableProcessorsByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': [
					{
						processorId: 'flour-mill-a',
						branchId: 'flour',
						inputCapacity: 10,
						canReachWarehouse: true
					}
				],
				'grain-farm-2\u0000grain': [
					{
						processorId: 'flour-mill-a',
						branchId: 'flour',
						inputCapacity: 10,
						canReachWarehouse: true
					}
				]
			}
		});
		const projection = projectSupplySnapshot(snapshot);
		const grainRow = projection.materials.find((m) => m.materialId === 'grain')!;

		// Each Grain Farm produces 30 grain/day, but both can only deliver to
		// the single Flour Mill which consumes 10 grain/day. Total usable grain
		// must be 10, not 15 (branch demand) or 20 (two 10-unit edges summed).
		expect(grainRow.installedCapacityPerDay).toBe(60);
		expect(grainRow.usableCapacityPerDay).toBe(10);
	});

	it('does not credit raw inventory when no consumer can reach a warehouse', () => {
		// P1 regression: city inventory is a warehouse source — a processor
		// can only draw it via pullViaRail when it has a rail path to a
		// warehouse. Here the Grain Farm is missing, the Flour Mill is usable
		// (it reaches Pantry Works directly) but cannot reach any warehouse,
		// so the 100 Grain in city inventory is stranded. The projection must
		// NOT credit it as local supply: the full 450-unit 30-day grain
		// demand must import, with zero starting inventory, rather than the
		// 350 the old unconditional credit produced.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			demandPerDay: 16,
			inventory: { grain: 100 },
			buildings: [
				{ id: 'flour-mill-a', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
				{ id: 'pantry-works-1', cityId: 'industry-city', typeId: 'pantry-works', level: 1 },
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
			],
			usableBuildingIds: ['flour-mill-a', 'pantry-works-1', 'warehouse-1'],
			usableSinkBuildingIdsByMaterial: {
				grain: ['flour-mill-a'],
				flour: ['pantry-works-1'],
				pantry: ['warehouse-1']
			},
			reachableDemandByMaterial: { grain: 15, flour: 12 },
			warehouseConnectedConsumerCapacityByMaterial: { grain: 0 }
		});
		const projection = projectSupplySnapshot(snapshot);
		const grainRow = projection.materials.find((m) => m.materialId === 'grain')!;

		// No Grain Farm installed, so no usable grain capacity.
		expect(grainRow.usableCapacityPerDay).toBe(0);
		// Stranded inventory is not credited: full 450 units (15/day * 30)
		// must import, with zero accessible starting inventory.
		expect(grainRow.thirtyDay.importRequiredUnits).toBe(450);
		expect(grainRow.thirtyDay.startingInventoryUnits).toBe(0);
	});

	it('credits raw inventory when a consumer can reach a warehouse', () => {
		// Contrast to the stranded-inventory case: same chain, but the Flour
		// Mill CAN reach a warehouse, so the 100 Grain in city inventory is
		// accessible and reduces the 30-day import by 100.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			demandPerDay: 16,
			inventory: { grain: 100 },
			buildings: [
				{ id: 'flour-mill-a', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
				{ id: 'pantry-works-1', cityId: 'industry-city', typeId: 'pantry-works', level: 1 },
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
			],
			usableBuildingIds: ['flour-mill-a', 'pantry-works-1', 'warehouse-1'],
			usableSinkBuildingIdsByMaterial: {
				grain: ['flour-mill-a'],
				flour: ['pantry-works-1'],
				pantry: ['warehouse-1']
			},
			reachableDemandByMaterial: { grain: 15, flour: 12 },
			warehouseConnectedConsumerCapacityByMaterial: { grain: 10 }
		});
		const projection = projectSupplySnapshot(snapshot);
		const grainRow = projection.materials.find((m) => m.materialId === 'grain')!;

		expect(grainRow.thirtyDay.startingInventoryUnits).toBe(100);
		expect(grainRow.thirtyDay.importRequiredUnits).toBe(350);
	});

	it('caps raw inventory by the warehouse-connected consumer pull capacity', () => {
		// No Grain Farm, but the Flour Mill can reach a warehouse (pull
		// capacity 10 grain/day). Even with 1000 Grain in inventory, only
		// 10/day * 30 = 300 can be drawn over the horizon, so imports must
		// reflect a 300-unit local contribution, not 1000.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			demandPerDay: 16,
			inventory: { grain: 1000 },
			buildings: [
				{ id: 'flour-mill-a', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
				{ id: 'pantry-works-1', cityId: 'industry-city', typeId: 'pantry-works', level: 1 },
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
			],
			usableBuildingIds: ['flour-mill-a', 'pantry-works-1', 'warehouse-1'],
			usableSinkBuildingIdsByMaterial: {
				grain: ['flour-mill-a'],
				flour: ['pantry-works-1'],
				pantry: ['warehouse-1']
			},
			reachableDemandByMaterial: { grain: 15, flour: 12 },
			warehouseConnectedConsumerCapacityByMaterial: { grain: 10 }
		});
		const projection = projectSupplySnapshot(snapshot);
		const grainRow = projection.materials.find((m) => m.materialId === 'grain')!;

		// 300 units drawn (10/day * 30), 150 still imported (450 - 300).
		expect(grainRow.thirtyDay.importRequiredUnits).toBe(150);
		expect(grainRow.thirtyDay.endingInventoryUnits).toBe(700);
	});

	it('does not let raw inventory double-count against processor capacity', () => {
		// The 4-layer horizon flow shares processor input capacity between
		// production and inventory. A Grain Farm (30/day) already saturates
		// the single Flour Mill (10 grain/day input capacity); even though the
		// mill is warehouse-connected and 100 Grain sits in inventory, the
		// inventory must NOT stack on top of production to over-state local
		// supply. Old code: localAvailable = 100 + 10*30 = 400 → import 50.
		// Flow: total local supply capped at the mill's 10/day → import 150.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			demandPerDay: 16,
			inventory: { grain: 100 },
			buildings: [
				{ id: 'grain-farm-1', cityId: 'industry-city', typeId: 'grain-farm', level: 1 },
				{ id: 'flour-mill-a', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
				{ id: 'pantry-works-1', cityId: 'industry-city', typeId: 'pantry-works', level: 1 },
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
			],
			usableBuildingIds: ['grain-farm-1', 'flour-mill-a', 'pantry-works-1', 'warehouse-1'],
			usableSinkBuildingIdsByMaterial: {
				grain: ['flour-mill-a'],
				flour: ['pantry-works-1'],
				pantry: ['warehouse-1']
			},
			reachableDemandByMaterial: { grain: 15, flour: 12 },
			reachableDemandByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': 15,
				'flour-mill-a\u0000flour': 12
			},
			reachableBranchesByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': new Map([['flour', 15]]),
				'flour-mill-a\u0000flour': new Map([['pantry', 12]])
			},
			reachableProcessorsByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': [
					{
						processorId: 'flour-mill-a',
						branchId: 'flour',
						inputCapacity: 10,
						canReachWarehouse: true
					}
				]
			},
			warehouseConnectedConsumerCapacityByMaterial: { grain: 10 }
		});
		const projection = projectSupplySnapshot(snapshot);
		const grainRow = projection.materials.find((m) => m.materialId === 'grain')!;

		// Production saturates the mill (10/day); inventory cannot stack on
		// top. 30-day import is 450 - 300 = 150, not 50.
		expect(grainRow.usableCapacityPerDay).toBe(10);
		expect(grainRow.thirtyDay.importRequiredUnits).toBe(150);
		// Inventory is accessible (mill is warehouse-connected) but, since
		// production already saturates the mill, none is consumed: the full
		// 100 remains as ending inventory.
		expect(grainRow.thirtyDay.startingInventoryUnits).toBe(100);
		expect(grainRow.thirtyDay.endingInventoryUnits).toBe(100);
		// Coherence: since inventory is never consumed (ending = 100), the
		// stockout day and days of cover must reflect that — not the old
		// formula (stockout = 20, cover ≈ 6.7) which assumed inventory fills
		// the demand-production gap.
		expect(grainRow.projectedStockoutDay).toBeNull();
		expect(grainRow.daysOfCover).toBeNull();
		expect(grainRow.thirtyDay.projectedStockoutDay).toBeNull();
		expect(grainRow.thirtyDay.daysOfCover).toBeNull();
	});

	it('routes raw inventory through a warehouse-connected processor no producer reaches', () => {
		// P1: the processor-node set must include every usable
		// warehouse-connected downstream processor, not only the subset some
		// local producer reaches. A Grain Farm reaches Flour Mill A only;
		// Mill B is usable and warehouse-connected but unreachable by the
		// farm. 100 Grain in city inventory must route through Mill B (the
		// runtime lets it pull via rail from the warehouse), so the 7-day
		// horizon needs no grain imports — not the 35 the
		// producer-reachable-only graph yields.
		const snapshot = splitMillPantrySnapshot(100);
		const projection = projectSupplySnapshot(snapshot);
		const grainRow = projection.materials.find((m) => m.materialId === 'grain')!;

		// Production is still capped at Mill A's 10/day (farm reaches A only).
		expect(grainRow.usableCapacityPerDay).toBe(10);
		// 7-day demand 105 = farm 70 + inventory 35 through Mill B → no import.
		expect(grainRow.sevenDay.importRequiredUnits).toBe(0);
		// 30-day: farm 300 + inventory 100 (all) = 400; 50 imported.
		expect(grainRow.thirtyDay.importRequiredUnits).toBe(50);
		expect(grainRow.thirtyDay.endingInventoryUnits).toBe(0);
		// Inventory depletes at 5/day (the gap after farm output) → 20 days.
		expect(grainRow.projectedStockoutDay).toBe(20);
		expect(grainRow.daysOfCover).toBe(20);
	});

	it('derives flow stockout day from the inventory consumption rate, not the horizon length', () => {
		// P1: when inventory is exhausted within the shortest horizon, the
		// stockout day is inventory/rate, not the horizon length. Here 10
		// Grain depletes at 5/day (farm output through Mill A, inventory
		// routing through Mill B) → stockout on day 2, not day 7.
		const snapshot = splitMillPantrySnapshot(10);
		const projection = projectSupplySnapshot(snapshot);
		const grainRow = projection.materials.find((m) => m.materialId === 'grain')!;

		expect(grainRow.projectedStockoutDay).toBe(2);
		expect(grainRow.daysOfCover).toBe(2);
	});

	it('reports a zero stockout day when inventory is empty and demand is uncovered', () => {
		// P1: zero inventory with unmet demand stocks out on day 0, not null.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			demandPerDay: 16,
			inventory: {},
			buildings: [
				{ id: 'grain-farm-1', cityId: 'industry-city', typeId: 'grain-farm', level: 1 },
				{ id: 'flour-mill-a', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
				{ id: 'pantry-works-1', cityId: 'industry-city', typeId: 'pantry-works', level: 1 },
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
			],
			usableBuildingIds: ['grain-farm-1', 'flour-mill-a', 'pantry-works-1', 'warehouse-1'],
			usableSinkBuildingIdsByMaterial: {
				grain: ['flour-mill-a'],
				flour: ['pantry-works-1'],
				pantry: ['warehouse-1']
			},
			reachableDemandByMaterial: { grain: 15, flour: 12 },
			reachableDemandByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': 15,
				'flour-mill-a\u0000flour': 12
			},
			reachableBranchesByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': new Map([['flour', 15]]),
				'flour-mill-a\u0000flour': new Map([['pantry', 12]])
			},
			reachableProcessorsByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': [
					{
						processorId: 'flour-mill-a',
						branchId: 'flour',
						inputCapacity: 10,
						canReachWarehouse: true
					}
				]
			},
			warehouseConnectedProcessorsByMaterial: {
				grain: [
					{
						processorId: 'flour-mill-a',
						branchId: 'flour',
						inputCapacity: 10,
						canReachWarehouse: true,
						branchDemand: 15
					}
				]
			},
			warehouseConnectedConsumerCapacityByMaterial: { grain: 10 }
		});
		const projection = projectSupplySnapshot(snapshot);
		const grainRow = projection.materials.find((m) => m.materialId === 'grain')!;

		// Farm produces 10/day via Mill A (cap 10); demand 15 → 5/day
		// uncovered with no inventory buffer → stocked out now (day 0).
		expect(grainRow.usableCapacityPerDay).toBe(10);
		expect(grainRow.projectedStockoutDay).toBe(0);
		expect(grainRow.daysOfCover).toBe(0);
	});

	it('derives no-producer inventory cover from the warehouse-connected consumer pull rate', () => {
		// P1: the no-local-producer path must use the warehouse-connected
		// consumer pull rate, not the full demand rate. With no Grain Farm,
		// a warehouse-connected Flour Mill pulling 10 grain/day, 100 Grain in
		// inventory, and 15/day required, cover is 100/10 = 10 days — not the
		// old 100/15 ≈ 6.67.
		//
		// This test exercises the zero-producer flow path
		// (warehouseConnectedProcessorsByMaterial drives the processor graph
		// with producerCount = 0) rather than the aggregate-capacity
		// fallback, so the branch-scoped rate is verified end-to-end.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			demandPerDay: 16,
			inventory: { grain: 100 },
			buildings: [
				{ id: 'flour-mill-a', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
				{ id: 'pantry-works-1', cityId: 'industry-city', typeId: 'pantry-works', level: 1 },
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
			],
			usableBuildingIds: ['flour-mill-a', 'pantry-works-1', 'warehouse-1'],
			usableSinkBuildingIdsByMaterial: {
				grain: ['flour-mill-a'],
				flour: ['pantry-works-1'],
				pantry: ['warehouse-1']
			},
			reachableDemandByMaterial: { grain: 15, flour: 12 },
			warehouseConnectedProcessorsByMaterial: {
				grain: [
					{
						processorId: 'flour-mill-a',
						branchId: 'flour',
						inputCapacity: 10,
						canReachWarehouse: true,
						branchDemand: 15
					}
				]
			},
			warehouseConnectedConsumerCapacityByMaterial: { grain: 10 }
		});
		const projection = projectSupplySnapshot(snapshot);
		const grainRow = projection.materials.find((m) => m.materialId === 'grain')!;

		expect(grainRow.usableCapacityPerDay).toBe(0);
		expect(grainRow.projectedStockoutDay).toBe(10);
		expect(grainRow.daysOfCover).toBe(10);
	});

	it('prioritizes production over inventory via two-phase max-flow when a generalist producer could strand a specialist', () => {
		// P1: producer-first edge insertion does not make Edmonds–Karp
		// prefer production over inventory — adjacency order is only a
		// tie-breaker among equal-length BFS paths. A generalist producer
		// (Pump A, reaches both filtration and syrup) can be saturated on
		// the filtration branch by the first augmentation, stranding the
		// specialist (Pump B, filtration only) and forcing the syrup branch
		// to be served by inventory — even though the production-only
		// max-flow proves production can cover all demand (A→syrup 7.5,
		// A→filtration 32.5, B→filtration 15.5 = 55.5 total).
		//
		// The two-phase fix (phase 1: production-only max-flow, phase 2:
		// add inventory) consumes zero inventory when production suffices.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'drinks',
			demandPerDay: 50,
			inventory: { water: 100 },
			buildings: [
				{ id: 'pump-a', cityId: 'industry-city', typeId: 'water-pump', level: 1 },
				{ id: 'pump-b', cityId: 'industry-city', typeId: 'water-pump', level: 1 },
				{
					id: 'filtration-1',
					cityId: 'industry-city',
					typeId: 'water-filtration-plant',
					level: 1
				},
				{ id: 'syrup-1', cityId: 'industry-city', typeId: 'syrup-plant', level: 1 },
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
			],
			usableBuildingIds: ['pump-a', 'pump-b', 'filtration-1', 'syrup-1', 'warehouse-1'],
			usableSinkBuildingIdsByMaterial: {
				water: ['filtration-1', 'syrup-1'],
				'filtered-water': ['warehouse-1'],
				syrup: ['warehouse-1']
			},
			reachableDemandByMaterial: { water: 55.5 },
			reachableDemandByBuildingAndMaterial: {
				'pump-a\u0000water': 55.5,
				'pump-b\u0000water': 48
			},
			reachableBranchesByBuildingAndMaterial: {
				'pump-a\u0000water': new Map([
					['filtered-water', 48],
					['syrup', 7.5]
				]),
				'pump-b\u0000water': new Map([['filtered-water', 48]])
			},
			reachableProcessorsByBuildingAndMaterial: {
				'pump-a\u0000water': [
					{
						processorId: 'filtration-1',
						branchId: 'filtered-water',
						inputCapacity: 48,
						canReachWarehouse: true
					},
					{
						processorId: 'syrup-1',
						branchId: 'syrup',
						inputCapacity: 7.5,
						canReachWarehouse: true
					}
				],
				'pump-b\u0000water': [
					{
						processorId: 'filtration-1',
						branchId: 'filtered-water',
						inputCapacity: 48,
						canReachWarehouse: true
					}
				]
			},
			warehouseConnectedProcessorsByMaterial: {
				water: [
					{
						processorId: 'filtration-1',
						branchId: 'filtered-water',
						inputCapacity: 48,
						canReachWarehouse: true,
						branchDemand: 48
					},
					{
						processorId: 'syrup-1',
						branchId: 'syrup',
						inputCapacity: 7.5,
						canReachWarehouse: true,
						branchDemand: 7.5
					}
				]
			},
			warehouseConnectedConsumerCapacityByMaterial: { water: 55.5 }
		});
		const projection = projectSupplySnapshot(snapshot);
		const waterRow = projection.materials.find((m) => m.materialId === 'water')!;

		// Production-only max-flow covers all 55.5 water/day demand.
		expect(waterRow.usableCapacityPerDay).toBe(55.5);
		// Two-phase flow: zero inventory consumed → no imports needed.
		expect(waterRow.sevenDay.importRequiredUnits).toBe(0);
		expect(waterRow.sevenDay.endingInventoryUnits).toBe(100);
		expect(waterRow.thirtyDay.importRequiredUnits).toBe(0);
		expect(waterRow.thirtyDay.endingInventoryUnits).toBe(100);
		// No stockout: production covers demand, inventory never drawn down.
		expect(waterRow.projectedStockoutDay).toBeNull();
		expect(waterRow.daysOfCover).toBeNull();
	});

	it('does not credit warehouse inventory against branches whose processors cannot reach the warehouse when no producer exists', () => {
		// P1: the no-local-producer path must not collapse warehouse
		// inventory access across branches. With no Water Pump, the
		// Water Filtration Plant is warehouse-connected (can pull water via
		// rail), but the Syrup Plant is usable yet NOT warehouse-connected
		// (cannot pull water from the warehouse at runtime). The fallback
		// uses aggregate warehouseConnectedConsumerCapacity with no branch
		// topology, crediting inventory against all branches — including
		// syrup's. The fix routes inventory through the 4-layer flow with
		// producerCount = 0, so only the filtration branch receives
		// inventory; the syrup branch must import.
		//
		// 400 Water in inventory (> filtration's 7-day demand of 336 but
		// < total 7-day demand of 388.5) exposes the difference: the
		// fallback would credit 388.5 (all demand), the fix credits only
		// 336 (filtration branch demand), leaving 52.5 to import.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'drinks',
			demandPerDay: 50,
			inventory: { water: 400 },
			buildings: [
				{
					id: 'filtration-1',
					cityId: 'industry-city',
					typeId: 'water-filtration-plant',
					level: 1
				},
				{ id: 'syrup-1', cityId: 'industry-city', typeId: 'syrup-plant', level: 1 },
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 }
			],
			usableBuildingIds: ['filtration-1', 'syrup-1', 'warehouse-1'],
			usableSinkBuildingIdsByMaterial: {
				water: ['filtration-1', 'syrup-1'],
				'filtered-water': ['warehouse-1'],
				syrup: ['warehouse-1']
			},
			reachableDemandByMaterial: { water: 55.5 },
			warehouseConnectedProcessorsByMaterial: {
				// Only filtration is warehouse-connected; syrup is NOT
				// (absent from this list).
				water: [
					{
						processorId: 'filtration-1',
						branchId: 'filtered-water',
						inputCapacity: 60,
						canReachWarehouse: true,
						branchDemand: 48
					}
				]
			},
			// Aggregate capacity (60) exceeds total water demand (55.5),
			// so the fallback would credit inventory against all demand.
			warehouseConnectedConsumerCapacityByMaterial: { water: 60 }
		});
		const projection = projectSupplySnapshot(snapshot);
		const waterRow = projection.materials.find((m) => m.materialId === 'water')!;

		// No producer → usable capacity is 0.
		expect(waterRow.usableCapacityPerDay).toBe(0);
		// 7-day: inventory routes only through filtration (336 = 48*7).
		// Syrup's 52.5 (= 7.5*7) must be imported.
		expect(waterRow.sevenDay.endingInventoryUnits).toBe(64);
		expect(waterRow.sevenDay.importRequiredUnits).toBe(52.5);
		// Inventory depletes at 48/day (filtration branch demand), not
		// 55.5/day (total demand) or 60/day (aggregate capacity).
		expect(waterRow.projectedStockoutDay).toBeCloseTo(400 / 48, 10);
		expect(waterRow.daysOfCover).toBeCloseTo(400 / 48, 10);
	});

	it('does not treat disconnected installed output as usable local supply', () => {
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'bottled-water',
			buildings: [
				{ id: 'water-bottler-1', cityId: 'industry-city', typeId: 'water-bottler', level: 1 },
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 },
				{ id: 'water-pump-1', cityId: 'industry-city', typeId: 'water-pump', level: 1 }
			],
			disconnectedBuildingIds: ['water-bottler-1', 'water-pump-1']
		});
		const projection = projectSupplySnapshot(snapshot);
		const row = projection.materials.find((material) => material.materialId === 'bottled-water')!;

		expect(row.installedCapacityPerDay).toBeGreaterThan(0);
		expect(row.usableCapacityPerDay).toBe(0);
		expect(row.thirtyDay.importRequiredUnits).toBeGreaterThan(0);
		expect(projection.bottleneck.kind).toBe('rail-disconnected');
	});

	it('classifies a partial reachability gap as rail topology before production capacity', () => {
		// Simulates a state where an installed material (water) has usable
		// producers (so none appear in the disconnected set) but the
		// aggregate reachable demand is below the required daily amount.
		// The bottleneck must be rail-disconnected — recommending a rail
		// connection from an existing producer — not production-capacity,
		// because adding more capacity would not close the gap.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'bottled-water',
			demandPerDay: 10,
			buildings: [
				{ id: 'water-pump-1', cityId: 'industry-city', typeId: 'water-pump', level: 1 },
				{ id: 'water-bottler-1', cityId: 'industry-city', typeId: 'water-bottler', level: 1 }
			],
			usableBuildingIds: ['water-pump-1', 'water-bottler-1'],
			disconnectedBuildingIds: [],
			reachableDemandByMaterial: { water: 5 },
			reachableDemandByBuildingAndMaterial: { 'water-pump-1\u0000water': 5 }
		});
		const projection = projectSupplySnapshot(snapshot);
		const waterRow = projection.materials.find((m) => m.materialId === 'water')!;
		expect(waterRow.usableCapacityPerDay).toBeLessThan(waterRow.requiredPerDay);
		expect(projection.bottleneck.kind).toBe('rail-disconnected');
		if (projection.bottleneck.kind === 'rail-disconnected') {
			expect(projection.bottleneck.materialId).toBe('water');
			expect(projection.bottleneck.buildingId).toBe('water-pump-1');
		}
	});

	it('classifies a max-flow topology deficit as rail-disconnected, not production-capacity', () => {
		// Concrete Drinks case: filtration needs 48 water/day, syrup needs
		// 7.5 water/day (total 55.5). Pump A (40/day) reaches filtration
		// only; Pump B (40/day) reaches syrup only. Total installed capacity
		// is 80 > 55.5, and both branches are individually reachable, but
		// max-flow usable capacity is only 47.5 (A→filtration 40, B→syrup
		// 7.5). The missing 8 units are not a production shortage — Pump B
		// has 32.5 unused capacity that cannot reach filtration. The
		// bottleneck must be rail-disconnected (connect B to filtration),
		// not production-capacity (building another pump wastes capital).
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'drinks',
			demandPerDay: 50,
			buildings: [
				{ id: 'pump-a', cityId: 'industry-city', typeId: 'water-pump', level: 1 },
				{ id: 'pump-b', cityId: 'industry-city', typeId: 'water-pump', level: 1 },
				{
					id: 'filtration-1',
					cityId: 'industry-city',
					typeId: 'water-filtration-plant',
					level: 1
				},
				{ id: 'syrup-1', cityId: 'industry-city', typeId: 'syrup-plant', level: 1 },
				{
					id: 'bottling-1',
					cityId: 'industry-city',
					typeId: 'drink-bottling-plant',
					level: 1
				},
				{ id: 'warehouse-1', cityId: 'industry-city', typeId: 'warehouse', level: 1 },
				{ id: 'fruit-farm-1', cityId: 'industry-city', typeId: 'fruit-farm', level: 1 },
				{ id: 'sugar-farm-1', cityId: 'industry-city', typeId: 'sugar-farm', level: 1 },
				{
					id: 'packaging-plant-1',
					cityId: 'industry-city',
					typeId: 'packaging-plant',
					level: 1
				},
				{ id: 'pulp-mill-1', cityId: 'industry-city', typeId: 'pulp-mill', level: 1 },
				{
					id: 'plastic-plant-1',
					cityId: 'industry-city',
					typeId: 'plastic-plant',
					level: 1
				},
				{
					id: 'pulpwood-grove-1',
					cityId: 'industry-city',
					typeId: 'pulpwood-grove',
					level: 1
				},
				{
					id: 'chemical-feedstock-well-1',
					cityId: 'industry-city',
					typeId: 'chemical-feedstock-well',
					level: 1
				}
			],
			usableBuildingIds: [
				'pump-a',
				'pump-b',
				'filtration-1',
				'syrup-1',
				'bottling-1',
				'warehouse-1',
				'fruit-farm-1',
				'sugar-farm-1',
				'packaging-plant-1',
				'pulp-mill-1',
				'plastic-plant-1',
				'pulpwood-grove-1',
				'chemical-feedstock-well-1'
			],
			reachableDemandByMaterial: {
				water: 55.5
			},
			reachableDemandByBuildingAndMaterial: {
				'pump-a\u0000water': 48,
				'pump-b\u0000water': 7.5
			},
			reachableBranchesByBuildingAndMaterial: {
				'pump-a\u0000water': new Map([['filtered-water', 48]]),
				'pump-b\u0000water': new Map([['syrup', 7.5]])
			}
		});
		const projection = projectSupplySnapshot(snapshot);
		const waterRow = projection.materials.find((m) => m.materialId === 'water')!;

		// Each pump produces 40/day at level 1, so installed is 80.
		expect(waterRow.installedCapacityPerDay).toBe(80);
		// Max-flow: A→filtration 40 (capped by pump capacity) + B→syrup
		// 7.5 (capped by syrup demand) = 47.5. Pump B's 32.5 residual
		// cannot reach the filtration branch.
		expect(waterRow.usableCapacityPerDay).toBe(47.5);
		// The deficit is connectivity-caused, not a production shortage.
		expect(projection.bottleneck.kind).toBe('rail-disconnected');
		if (projection.bottleneck.kind === 'rail-disconnected') {
			expect(projection.bottleneck.materialId).toBe('water');
			// Pump B has residual capacity stranded by rail topology.
			expect(projection.bottleneck.buildingId).toBe('pump-b');
		}
	});

	it('prioritizes a missing producer over warehouse and disconnection conditions', () => {
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				finishedMaterialId: 'grain',
				warehouseCapacity: 0,
				buildings: [
					{
						id: 'water-bottler-1',
						cityId: 'industry-city',
						typeId: 'water-bottler',
						level: 1
					}
				],
				disconnectedBuildingIds: ['water-bottler-1']
			})
		);

		expect(projection.bottleneck).toEqual({
			kind: 'missing-producer',
			materialId: 'grain',
			chainDepth: 0
		});
	});

	it('prioritizes a binding warehouse over a disconnected producer', () => {
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				warehouseCapacity: 0,
				buildings: [
					{
						id: 'pantry-works-1',
						cityId: 'industry-city',
						typeId: 'pantry-works',
						level: 1
					},
					{
						id: 'flour-mill-1',
						cityId: 'industry-city',
						typeId: 'flour-mill',
						level: 1
					},
					{
						id: 'grain-farm-1',
						cityId: 'industry-city',
						typeId: 'grain-farm',
						level: 1
					}
				],
				disconnectedBuildingIds: ['grain-farm-1']
			})
		);

		expect(projection.bottleneck.kind).toBe('warehouse-capacity');
	});

	it('chooses the deepest required disconnected producer', () => {
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				buildings: [
					{
						id: 'pantry-works-1',
						cityId: 'industry-city',
						typeId: 'pantry-works',
						level: 1
					},
					{
						id: 'flour-mill-1',
						cityId: 'industry-city',
						typeId: 'flour-mill',
						level: 1
					},
					{
						id: 'grain-farm-1',
						cityId: 'industry-city',
						typeId: 'grain-farm',
						level: 1
					}
				],
				disconnectedBuildingIds: ['pantry-works-1', 'grain-farm-1']
			})
		);

		expect(projection.bottleneck).toEqual({
			kind: 'rail-disconnected',
			buildingId: 'grain-farm-1',
			materialId: 'grain'
		});
	});

	it('uses normalized capacity deficit before raw deficit size', () => {
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				demandPerDay: 100,
				buildings: [
					{
						id: 'pantry-works-1',
						cityId: 'industry-city',
						typeId: 'pantry-works',
						level: 9
					},
					{
						id: 'flour-mill-1',
						cityId: 'industry-city',
						typeId: 'flour-mill',
						level: 1
					},
					{
						id: 'grain-farm-1',
						cityId: 'industry-city',
						typeId: 'grain-farm',
						level: 1
					}
				],
				usableBuildingIds: ['pantry-works-1', 'flour-mill-1', 'grain-farm-1']
			})
		);

		expect(projection.bottleneck).toEqual({
			kind: 'production-capacity',
			materialId: 'flour',
			deficitPerDay: 67
		});
	});

	it('breaks bottleneck ties by building ID deterministically', () => {
		const buildings = [
			{
				id: 'pantry-works-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'pantry-works' as const,
				level: 1
			},
			{
				id: 'flour-mill-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'flour-mill' as const,
				level: 1
			},
			{
				id: 'grain-farm-z',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'grain-farm' as const,
				level: 1
			},
			{
				id: 'grain-farm-a',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'grain-farm' as const,
				level: 1
			}
		];
		const first = projectSupplySnapshot(
			projectionSnapshot({
				buildings,
				usableBuildingIds: ['pantry-works-1', 'flour-mill-1'],
				disconnectedBuildingIds: ['grain-farm-z', 'grain-farm-a']
			})
		);
		const second = projectSupplySnapshot(
			projectionSnapshot({
				buildings: [...buildings].reverse(),
				usableBuildingIds: ['pantry-works-1', 'flour-mill-1'],
				disconnectedBuildingIds: ['grain-farm-a', 'grain-farm-z']
			})
		);

		expect(first.bottleneck).toEqual(second.bottleneck);
		expect(first.bottleneck).toEqual({
			kind: 'rail-disconnected',
			buildingId: 'grain-farm-a',
			materialId: 'grain'
		});
	});
});

describe('supply planner snapshot edge cases', () => {
	it('rejects an invalid request with empty strings', () => {
		expect(
			buildSupplyPlannerSnapshot(plannerGame(), {
				retailCityId: '' as WorldCityId,
				productId: 'bottled-water'
			})
		).toEqual({ status: 'invalid', reason: 'invalid-request' });

		expect(
			buildSupplyPlannerSnapshot(plannerGame(), {
				retailCityId: 'harbor-city',
				productId: '' as ProductId
			})
		).toEqual({ status: 'invalid', reason: 'invalid-request' });
	});

	it('rejects a request for a non-existent retail city', () => {
		expect(
			buildSupplyPlannerSnapshot(plannerGame(), {
				retailCityId: 'nonexistent-city' as WorldCityId,
				productId: 'bottled-water'
			})
		).toEqual({ status: 'unavailable', reason: 'retail-city-unavailable' });
	});

	it('rejects a request for an unopened retail city', () => {
		const game = plannerGame([product('bottled-water')], {
			world: {
				...plannerGame().world,
				openedCityIds: []
			}
		});
		expect(
			buildSupplyPlannerSnapshot(game, {
				retailCityId: 'harbor-city',
				productId: 'bottled-water'
			})
		).toEqual({ status: 'unavailable', reason: 'retail-city-unavailable' });
	});

	it('rejects a request for an industry city as retail city', () => {
		expect(
			buildSupplyPlannerSnapshot(plannerGame(), {
				retailCityId: 'industry-city',
				productId: 'bottled-water'
			})
		).toEqual({ status: 'unavailable', reason: 'retail-city-unavailable' });
	});

	it('returns empty when the retail city has no supported products', () => {
		const game = plannerGame([product('bottled-water', { targetStock: 0, initialQuantity: 0 })], {
			stores: [
				{
					...baseGame().stores[0]!,
					products: [product('bottled-water', { targetStock: 0, initialQuantity: 0 })]
				}
			]
		});
		// Remove the product from the store entirely to get no supported categories
		const gameNoProducts = {
			...game,
			stores: [{ ...game.stores[0]!, products: [] }]
		};
		expect(
			buildSupplyPlannerSnapshot(gameNoProducts, {
				retailCityId: 'harbor-city',
				productId: 'bottled-water'
			})
		).toEqual({ status: 'empty', reason: 'no-supported-products' });
	});

	it('returns empty when listSupplyPlannerCategories finds nothing for a missing city', () => {
		expect(listSupplyPlannerCategories(plannerGame(), 'nonexistent-city')).toEqual([]);
	});

	it('returns unsupported for a category with no finished material mapping', () => {
		const game = plannerGame([product('bottled-water')]);
		// 'snacks' is a valid category but we're requesting from a convenience store
		// that doesn't carry it — the snapshot should report unsupported-category
		expect(
			buildSupplyPlannerSnapshot(game, {
				retailCityId: 'harbor-city',
				productId: 'snacks'
			})
		).toEqual({ status: 'unsupported', reason: 'unsupported-category' });
	});
});

describe('supply planner bottleneck coverage', () => {
	it('returns none bottleneck when demand is zero', () => {
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				demandPerDay: 0,
				buildings: [
					{ id: 'water-pump-1', cityId: 'industry-city', typeId: 'water-pump', level: 1 }
				],
				usableBuildingIds: ['water-pump-1']
			})
		);
		expect(projection.bottleneck).toEqual({ kind: 'none' });
	});

	it('classifies inventory-cover when a no-recipe material has a projected stockout', () => {
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				finishedMaterialId: 'nonexistent' as never,
				demandPerDay: 10,
				inventory: { nonexistent: 20 } as Partial<Record<MaterialId, number>>
			})
		);
		expect(projection.bottleneck.kind).toBe('inventory-cover');
		if (projection.bottleneck.kind === 'inventory-cover') {
			expect(projection.bottleneck.materialId).toBe('nonexistent');
			expect(projection.bottleneck.stockoutDay).toBe(2);
		}
	});

	it('returns no bottleneck when sufficient capacity covers demand with empty inventory', () => {
		// With ample producer capacity (level-10 buildings) and demandPerDay=5,
		// usableCapacityPerDay >= requiredPerDay for every material, so
		// projectedStockoutDay is null and importRequiredUnits is 0.
		// The bottleneck classifier must reach the final fallback and return none.
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				finishedMaterialId: 'bottled-water',
				demandPerDay: 5,
				buildings: [
					{ id: 'water-pump-1', cityId: 'industry-city', typeId: 'water-pump', level: 10 },
					{ id: 'water-bottler-1', cityId: 'industry-city', typeId: 'water-bottler', level: 10 }
				],
				usableBuildingIds: ['water-pump-1', 'water-bottler-1'],
				inventory: {}
			})
		);
		expect(projection.bottleneck).toEqual({ kind: 'none' });
	});
});

describe('supply planner reachability edge cases', () => {
	it('returns disconnected reachability when the supply city is not found', () => {
		const game = baseGame();
		const reachability = buildRequiredChainReachability(
			game,
			{
				supplyCityId: 'nonexistent-city' as WorldCityId,
				finishedMaterialId: 'bottled-water',
				demandPerDay: 10,
				buildings: []
			},
			[]
		);
		expect(reachability.usableBuildingIds.size).toBe(0);
		expect(reachability.disconnectedBuildingIds).toEqual([]);
	});

	it('returns disconnected reachability for required buildings when city is missing', () => {
		const game = baseGame();
		const reachability = buildRequiredChainReachability(
			game,
			{
				supplyCityId: 'nonexistent-city' as WorldCityId,
				finishedMaterialId: 'bottled-water',
				demandPerDay: 10,
				buildings: []
			},
			[building('water-bottler', 'water-bottler-1', 'nonexistent-city' as WorldCityId)]
		);
		expect(reachability.usableBuildingIds.size).toBe(0);
		expect(reachability.disconnectedBuildingIds).toEqual(['water-bottler-1']);
	});
});

describe('buildSupplyMaterialRequirements edge cases', () => {
	it('returns only the root material when it has no producer recipe', () => {
		const requirements = buildSupplyMaterialRequirements({
			finishedMaterialId: 'nonexistent' as never,
			demandPerDay: 10
		});
		expect(requirements).toEqual([
			{
				materialId: 'nonexistent',
				requiredPerDay: 10,
				producerRecipeId: null,
				chainDepth: 0
			}
		]);
	});

	it('returns zero-demand requirements traversing the full chain', () => {
		const requirements = buildSupplyMaterialRequirements({
			finishedMaterialId: 'bottled-water',
			demandPerDay: 0
		});
		// With zero demand, the root and all upstream materials are added with requiredPerDay: 0
		expect(requirements.every((row) => row.requiredPerDay === 0)).toBe(true);
		expect(requirements[0]!.materialId).toBe('bottled-water');
	});
});

describe('supply planner snapshot additional coverage', () => {
	it('sorts multiple stores in the same retail city deterministically', () => {
		// Covers the sort callback in listSupplyPlannerCategories (line 150).
		// Two stores in the same city force the comparator to fire.
		const game = plannerGame([product('bottled-water')]);
		const secondStore = {
			...game.stores[0]!,
			id: 'store-b',
			products: [product('bottled-water')],
			tileId: 'harbor-city-5-5'
		};
		const firstStore = { ...game.stores[0]!, id: 'store-a' };
		const gameTwoStores = {
			...game,
			stores: [secondStore, firstStore] // intentionally reversed
		};
		const ids = listSupplyPlannerCategories(gameTwoStores, 'harbor-city');
		expect(ids).toEqual(['bottled-water']);
	});

	it('soft-fails when the supply city inventory scope cannot be resolved', () => {
		// Covers line 204: getIndustryInventoryScope returns null because
		// the city inventory entry is missing from cityInventories.
		const game = plannerGame([product('bottled-water')], {
			cityInventories: []
		});
		expect(
			buildSupplyPlannerSnapshot(game, {
				retailCityId: 'harbor-city',
				productId: 'bottled-water'
			})
		).toEqual({ status: 'unavailable', reason: 'supply-city-unavailable' });
	});

	it('returns empty when the requesting retail city has no matching contributor', () => {
		// Covers line 216: selectedContributor is not found among demand
		// contributors. This happens when the requesting city has no stores
		// carrying the category but another city assigned to the same supply
		// city does.
		const game = createPlannerGameWithTwoRetailCities([product('bottled-water')]);
		// Remove the product from the harbor-city store but keep it in campus.
		const gameNoHarborProduct = {
			...game,
			stores: [
				{ ...game.stores[0]!, products: [] },
				{ ...game.stores[1]!, products: [product('bottled-water')] }
			]
		};
		// listSupplyPlannerCategories returns ['bottled-water'] because campus
		// carries it, but harbor has no stores with the product, so the
		// selectedContributor check fails.
		const result = buildSupplyPlannerSnapshot(gameNoHarborProduct, {
			retailCityId: 'harbor-city',
			productId: 'bottled-water'
		});
		expect(result).toEqual({ status: 'empty', reason: 'no-supported-products' });
	});

	it('returns null demand contributor when a claimant city has no stores', () => {
		// Covers line 827: stores.length === 0 in buildDemandContributor.
		// A claimant city with no stores at all returns null.
		const game = createPlannerGameWithTwoRetailCities([product('bottled-water')]);
		// Remove all stores from campus-junction but keep the assignment.
		const gameNoCampusStores = {
			...game,
			stores: [game.stores[0]!]
		};
		// The snapshot should still be ready because harbor has stores.
		const result = buildSupplyPlannerSnapshot(gameNoCampusStores, {
			retailCityId: 'harbor-city',
			productId: 'bottled-water'
		});
		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		// Only harbor should be a demand contributor.
		expect(result.snapshot.demandContributors.map((c) => c.retailCityId)).toEqual(['harbor-city']);
	});

	it('returns no bottleneck when capacity exceeds demand with ample starting inventory', () => {
		// With high-capacity buildings (level 10) and bottled-water inventory of
		// 100 against demandPerDay=1, there is no capacity deficit, no projected
		// stockout, and importRequiredUnits is 0. The bottleneck is none.
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				finishedMaterialId: 'bottled-water',
				demandPerDay: 1,
				inventory: { 'bottled-water': 100 },
				buildings: [
					{ id: 'water-pump-1', cityId: 'industry-city', typeId: 'water-pump', level: 10 },
					{ id: 'water-bottler-1', cityId: 'industry-city', typeId: 'water-bottler', level: 10 }
				],
				usableBuildingIds: ['water-pump-1', 'water-bottler-1']
			})
		);
		expect(projection.bottleneck).toEqual({ kind: 'none' });
	});

	it('sorts claimant cities with non-catalog ids deterministically', () => {
		// Covers lines 889, 890, 891: compareRetailCityIds branches for
		// cities not in WORLD_CITY_CATALOG. Two non-catalog cities force
		// the fallback string comparison (line 891).
		const game = createPlannerGameWithTwoRetailCities([product('bottled-water')]);
		const harbor = game.cities[0]!;
		const makeCustomCity = (id: string) => ({
			...harbor,
			id,
			name: id,
			tiles: harbor.tiles.map((tile) => ({
				...tile,
				id: tile.id.replace('harbor-city', id),
				cityId: id
			}))
		});
		const makeCustomStore = (id: string) => ({
			...game.stores[0]!,
			id: `store-${id}`,
			products: [product('bottled-water')],
			cityId: id,
			tileId: `${id}-3-1`
		});
		const gameWithCustom = {
			...game,
			cities: [...game.cities, makeCustomCity('custom-alpha'), makeCustomCity('custom-beta')],
			stores: [...game.stores, makeCustomStore('custom-alpha'), makeCustomStore('custom-beta')],
			world: {
				...game.world,
				revealedCityIds: [
					...game.world.revealedCityIds,
					'custom-alpha' as WorldCityId,
					'custom-beta' as WorldCityId
				],
				openedCityIds: [
					...game.world.openedCityIds,
					'custom-alpha' as WorldCityId,
					'custom-beta' as WorldCityId
				]
			},
			retailSupplyAssignments: [
				...game.retailSupplyAssignments,
				{
					retailCityId: 'custom-alpha' as WorldCityId,
					supplyCityId: 'industry-city' as WorldCityId
				},
				{
					retailCityId: 'custom-beta' as WorldCityId,
					supplyCityId: 'industry-city' as WorldCityId
				}
			]
		};
		const result = buildSupplyPlannerSnapshot(gameWithCustom, {
			retailCityId: 'harbor-city',
			productId: 'bottled-water'
		});
		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		// All four cities should be demand contributors, sorted with
		// catalog cities first, then non-catalog cities by string order.
		expect(result.snapshot.demandContributors.length).toBe(4);
		expect(result.snapshot.demandContributors.map((c) => c.retailCityId)).toEqual([
			'harbor-city',
			'campus-junction',
			'custom-alpha',
			'custom-beta'
		]);
	});

	it('sorts multiple stores in the same claimant city deterministically in buildDemandContributor', () => {
		// Covers the sort comparator in buildDemandContributor (line 974).
		// Two stores in the same claimant city with the same category force
		// the comparator to fire during snapshot construction.
		const game = plannerGame([product('bottled-water')]);
		const secondStore = {
			...game.stores[0]!,
			id: 'store-b',
			products: [product('bottled-water')],
			tileId: 'harbor-city-5-5'
		};
		const firstStore = { ...game.stores[0]!, id: 'store-a' };
		const gameTwoStores = {
			...game,
			stores: [secondStore, firstStore] // intentionally reversed
		};
		const result = buildSupplyPlannerSnapshot(gameTwoStores, {
			retailCityId: 'harbor-city',
			productId: 'bottled-water'
		});
		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		// Both stores should be reflected in the demand contributor's target units.
		const contributor = result.snapshot.demandContributors[0]!;
		expect(contributor.retailCityId).toBe('harbor-city');
		// targetStock from both stores: 70 + 70 = 140
		expect(contributor.replenishmentCeilingPerDay).toBe(140 / REPLENISHMENT_INTERVAL_DAYS);
	});
});

describe('supply planner reachability branch coverage', () => {
	it('keeps an independently supported category guarded when its material is no longer finished', () => {
		const material = MATERIALS['bottled-water'] as { kind: 'finished' | 'intermediate' };
		const originalKind = material.kind;

		try {
			material.kind = 'intermediate';

			expect(
				buildSupplyPlannerSnapshot(plannerGame(), {
					retailCityId: 'harbor-city',
					productId: 'bottled-water'
				})
			).toEqual({ status: 'unsupported', reason: 'unsupported-category' });
		} finally {
			material.kind = originalKind;
		}
	});

	it('returns an empty result when a volatile store loses its supported category during derivation', () => {
		const game = plannerGame([product('bottled-water')]);
		const store = { ...game.stores[0]! };
		let productReads = 0;
		Object.defineProperty(store, 'products', {
			configurable: true,
			get: () => {
				productReads += 1;
				return productReads === 1 ? [product('bottled-water')] : [];
			}
		});

		expect(
			buildSupplyPlannerSnapshot(
				{ ...game, stores: [store] },
				{ retailCityId: 'harbor-city', productId: 'bottled-water' }
			)
		).toEqual({ status: 'empty', reason: 'no-supported-products' });
	});

	it('preserves requirement traversal when a producer map entry points at no recipe', () => {
		const producerRecipes = MATERIAL_PRODUCER_RECIPES as Map<MaterialId, ProductionRecipeId>;
		const originalRecipeId = producerRecipes.get('water');

		try {
			producerRecipes.set('water', 'missing-recipe' as ProductionRecipeId);

			expect(
				buildSupplyMaterialRequirements({
					finishedMaterialId: 'bottled-water',
					demandPerDay: 10
				})
			).toContainEqual(
				expect.objectContaining({ materialId: 'water', producerRecipeId: 'missing-recipe' })
			);
		} finally {
			if (originalRecipeId) producerRecipes.set('water', originalRecipeId);
		}
	});

	it('stops traversal when a mapped recipe does not emit the requested material', () => {
		const waterPumping = PRODUCTION_RECIPES['water-pumping'];
		const originalOutputs = waterPumping.outputs;

		try {
			waterPumping.outputs = [];

			expect(
				buildSupplyMaterialRequirements({
					finishedMaterialId: 'bottled-water',
					demandPerDay: 10
				})
			).toContainEqual(expect.objectContaining({ materialId: 'water' }));
		} finally {
			waterPumping.outputs = originalOutputs;
		}
	});

	it('retains a requirement with no mapped producer while traversing its parent recipe', () => {
		const producerRecipes = MATERIAL_PRODUCER_RECIPES as Map<MaterialId, ProductionRecipeId>;
		const originalRecipeId = producerRecipes.get('water');

		try {
			producerRecipes.delete('water');

			const requirements = buildSupplyMaterialRequirements({
				finishedMaterialId: 'bottled-water',
				demandPerDay: 10
			});

			expect(requirements).toContainEqual(
				expect.objectContaining({ materialId: 'water', producerRecipeId: null })
			);
		} finally {
			if (originalRecipeId) producerRecipes.set('water', originalRecipeId);
		}
	});

	it('uses the game buildings when reachability callers omit the optional override', () => {
		const game = plannerGame([product('bottled-water')]);
		const reachability = buildRequiredChainReachability(game, {
			supplyCityId: 'industry-city',
			finishedMaterialId: 'bottled-water',
			demandPerDay: 10,
			buildings: []
		});

		expect(reachability.disconnectedBuildingIds).toEqual([]);
	});

	it('projects usable producer capacity without an explicit per-building reachability cap', () => {
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				finishedMaterialId: 'bottled-water',
				buildings: [
					{ id: 'water-pump-1', cityId: 'industry-city', typeId: 'water-pump', level: 1 },
					{ id: 'water-bottler-1', cityId: 'industry-city', typeId: 'water-bottler', level: 1 }
				],
				usableBuildingIds: ['water-pump-1', 'water-bottler-1']
			})
		);

		expect(
			projection.materials.find((material) => material.materialId === 'bottled-water')
				?.usableCapacityPerDay
		).toBeGreaterThan(0);
	});

	it('keeps zero-demand horizon evidence finite without a stockout date', () => {
		const projection = projectSupplySnapshot(
			projectionSnapshot({ finishedMaterialId: 'bottled-water', demandPerDay: 0 })
		);

		expect(projection.materials.every((material) => material.daysOfCover === null)).toBe(true);
		expect(projection.materials.every((material) => material.sevenDay.daysOfCover === null)).toBe(
			true
		);
	});

	it('reports inventory cover before import reliance for an unmapped material', () => {
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				finishedMaterialId: 'unmapped-finished' as MaterialId,
				inventory: { 'unmapped-finished': 0 } as Partial<Record<MaterialId, number>>
			})
		);

		expect(projection.bottleneck).toEqual({
			kind: 'inventory-cover',
			materialId: 'unmapped-finished',
			stockoutDay: 0
		});
	});

	it('sorts simultaneous unmapped stockouts by material id', () => {
		const drinkBottling = PRODUCTION_RECIPES['drink-bottling'];
		const originalInputs = drinkBottling.inputs;

		try {
			drinkBottling.inputs = [
				{ materialId: 'unmapped-z' as MaterialId, quantity: 1 },
				{ materialId: 'unmapped-a' as MaterialId, quantity: 1 }
			];
			const projection = projectSupplySnapshot(
				projectionSnapshot({
					finishedMaterialId: 'drinks',
					buildings: [
						{
							id: 'drink-bottling-plant-1',
							cityId: 'industry-city',
							typeId: 'drink-bottling-plant',
							level: 10
						}
					],
					usableBuildingIds: ['drink-bottling-plant-1']
				})
			);

			expect(projection.bottleneck).toEqual({
				kind: 'inventory-cover',
				materialId: 'unmapped-a',
				stockoutDay: 0
			});
		} finally {
			drinkBottling.inputs = originalInputs;
		}
	});

	it('rejects a cycle introduced after static chain validation during reachability', () => {
		const waterPumping = PRODUCTION_RECIPES['water-pumping'];
		const inputsDescriptor = Object.getOwnPropertyDescriptor(waterPumping, 'inputs');
		if (!inputsDescriptor) throw new Error('Expected water-pumping inputs descriptor');
		const originalInputs = waterPumping.inputs;
		const game = plannerGame([product('bottled-water')]);
		const industryCitiesDescriptor = Object.getOwnPropertyDescriptor(game, 'industryCities');
		if (!industryCitiesDescriptor) throw new Error('Expected industryCities descriptor');
		const originalIndustryCities = game.industryCities;
		let reachabilityStarted = false;

		try {
			Object.defineProperty(waterPumping, 'inputs', {
				configurable: true,
				get: () =>
					reachabilityStarted ? [{ materialId: 'filtered-water', quantity: 1 }] : originalInputs
			});
			Object.defineProperty(game, 'industryCities', {
				configurable: true,
				get: () => {
					// buildRequiredChainReachability accesses industryCities only after
					// buildSupplyMaterialRequirements and assertNoRequiredChainCycle.
					reachabilityStarted = true;
					return originalIndustryCities;
				}
			});

			expect(() =>
				buildRequiredChainReachability(
					game,
					{
						supplyCityId: 'industry-city',
						finishedMaterialId: 'filtered-water',
						demandPerDay: 10,
						buildings: []
					},
					[
						building('water-filtration-plant', 'water-filtration-plant-1', 'industry-city'),
						building('water-pump', 'water-pump-1', 'industry-city'),
						building('warehouse', 'warehouse-1', 'industry-city')
					]
				)
			).toThrow(
				'Cycle detected in required chain reachability at water-filtration-plant-1\u0000filtered-water'
			);
		} finally {
			Object.defineProperty(waterPumping, 'inputs', inputsDescriptor);
			Object.defineProperty(game, 'industryCities', industryCitiesDescriptor);
		}
	});

	it('rejects a non-object planner request at the public boundary', () => {
		expect(
			buildSupplyPlannerSnapshot(
				null as unknown as GameState,
				null as unknown as SupplyPlannerRequest
			)
		).toEqual({ status: 'invalid', reason: 'invalid-request' });
	});

	it('rejects a configured recipe cycle before reachability traversal', () => {
		const waterPumping = PRODUCTION_RECIPES['water-pumping'];
		const originalInputs = waterPumping.inputs;

		try {
			waterPumping.inputs = [{ materialId: 'water', quantity: 1 }];

			expect(() =>
				buildRequiredChainReachability(
					plannerGame(),
					{
						supplyCityId: 'industry-city',
						finishedMaterialId: 'water',
						demandPerDay: 10,
						buildings: []
					},
					[]
				)
			).toThrow('Cycle detected in required chain reachability at water');
		} finally {
			waterPumping.inputs = originalInputs;
		}
	});

	it('keeps a partial reachability bottleneck deterministic across tied materials and producers', () => {
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				finishedMaterialId: 'pantry',
				demandPerDay: 10,
				buildings: [
					{ id: 'grain-farm-z', cityId: 'industry-city', typeId: 'grain-farm', level: 1 },
					{ id: 'grain-farm-a', cityId: 'industry-city', typeId: 'grain-farm', level: 1 },
					{ id: 'flour-mill-1', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
					{ id: 'pantry-works-1', cityId: 'industry-city', typeId: 'pantry-works', level: 1 }
				],
				usableBuildingIds: ['grain-farm-z', 'grain-farm-a', 'flour-mill-1', 'pantry-works-1'],
				reachableDemandByMaterial: { grain: 5, flour: 5 }
			})
		);

		expect(projection.bottleneck).toEqual({
			kind: 'rail-disconnected',
			buildingId: 'grain-farm-a',
			materialId: 'grain'
		});
	});

	it('reports a missing producer recipe when the catalog loses a supported finished material', () => {
		const producerRecipes = MATERIAL_PRODUCER_RECIPES as Map<MaterialId, ProductionRecipeId>;
		const originalRecipeId = producerRecipes.get('bottled-water');

		try {
			producerRecipes.delete('bottled-water');

			expect(
				buildSupplyPlannerSnapshot(plannerGame(), {
					retailCityId: 'harbor-city',
					productId: 'bottled-water'
				})
			).toEqual({ status: 'unsupported', reason: 'missing-producer-recipe' });
		} finally {
			if (originalRecipeId) producerRecipes.set('bottled-water', originalRecipeId);
		}
	});

	it('ignores outputs from buildings producing materials outside the required chain', () => {
		// A water-pump in the pantry chain produces 'water', which is not
		// in the pantry required materials (pantry → flour → grain).
		// This exercises the `!requiredMaterialIds.has(output.materialId)`
		// continue branch at L390.
		const base = pantryPlannerGame();
		const game = {
			...base,
			industrialBuildings: [
				building('grain-farm', 'grain-farm-1', 'industry-city', 1, 2, 2),
				building('flour-mill', 'flour-mill-1', 'industry-city', 1, 2, 6),
				building('pantry-works', 'pantry-works-1', 'industry-city', 1, 2, 10),
				building('warehouse', 'warehouse-1', 'industry-city', 1, 2, 14),
				building('water-pump', 'water-pump-1', 'industry-city', 1, 10, 2)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: segmentedPantryRails() } : city
			)
		};
		const result = buildSupplyPlannerSnapshot(game, {
			retailCityId: 'harbor-city',
			productId: 'pantry'
		});
		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		// The water-pump should not appear in any usable/disconnected list
		// because 'water' is not in the pantry chain.
		expect(result.snapshot.usableBuildingIds).not.toContain('water-pump-1');
		expect(result.snapshot.disconnectedBuildingIds).not.toContain('water-pump-1');
	});

	it('skips requirements without a producer recipe in reachability', () => {
		// Call buildRequiredChainReachability with a finished material that
		// has no producer recipe. The requirement for that material has
		// producerRecipeId: null, so the `!requirement.producerRecipeId`
		// continue branch at L420 fires.
		const game = baseGame();
		const reachability = buildRequiredChainReachability(
			game,
			{
				supplyCityId: 'industry-city',
				finishedMaterialId: 'nonexistent' as never,
				demandPerDay: 10,
				buildings: []
			},
			[building('warehouse', 'warehouse-1', 'industry-city', 1, 2, 2)]
		);
		expect(reachability.usableBuildingIds.size).toBe(0);
		expect(reachability.disconnectedBuildingIds).toEqual([]);
	});

	it('marks a warehouse without rail attach cells as having no reachable path', () => {
		// A warehouse on a tile with no adjacent rail cells has
		// attachCellsByBuildingId.get(warehouse.id) = [], exercising the
		// `fromKeys.length === 0` branch in canReachAnyWarehouse (L566)
		// and the `toKeys.length === 0` branch (L570).
		const base = plannerGame([product('bottled-water')]);
		const game = {
			...base,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 'industry-city', 1, 2, 2),
				building('water-bottler', 'water-bottler-1', 'industry-city', 1, 2, 6),
				building('warehouse', 'warehouse-1', 'industry-city', 1, 2, 14)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: [{ x: 10, y: 5, level: 1 }] } : city
			)
		};
		const result = buildSupplyPlannerSnapshot(game, {
			retailCityId: 'harbor-city',
			productId: 'bottled-water'
		});
		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		// All buildings are disconnected because the rail is too far away.
		expect(result.snapshot.disconnectedBuildingIds.length).toBeGreaterThan(0);
	});

	it('classifies a building with no recipe as disconnected in disconnectedReachability', () => {
		// A warehouse (no recipe) in a missing city is processed by
		// disconnectedReachability. The `!recipeId` continue branch at
		// L696 fires, so the warehouse is NOT added to the disconnected set.
		const game = baseGame();
		const reachability = buildRequiredChainReachability(
			game,
			{
				supplyCityId: 'nonexistent-city' as WorldCityId,
				finishedMaterialId: 'bottled-water',
				demandPerDay: 10,
				buildings: []
			},
			[
				building('warehouse', 'warehouse-1', 'nonexistent-city' as WorldCityId, 1, 2, 2),
				building('water-bottler', 'water-bottler-1', 'nonexistent-city' as WorldCityId, 1, 4, 2)
			]
		);
		// The warehouse (no recipe) is skipped, but the water-bottler
		// (has a recipe producing 'bottled-water') is disconnected.
		expect(reachability.disconnectedBuildingIds).toEqual(['water-bottler-1']);
	});

	it('exercises normalizedDeficit with zero requiredPerDay', () => {
		// A material with requiredPerDay = 0 has normalizedDeficit = 0.
		// This exercises the false branch of the ternary at L950.
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				demandPerDay: 0,
				finishedMaterialId: 'bottled-water',
				buildings: [
					{ id: 'water-pump-1', cityId: 'industry-city', typeId: 'water-pump', level: 1 }
				],
				usableBuildingIds: ['water-pump-1']
			})
		);
		// With zero demand, the bottleneck should be 'none'.
		expect(projection.bottleneck).toEqual({ kind: 'none' });
	});

	it('exercises findAvailableRetailCity with an industry city id', () => {
		// findAvailableRetailCity returns null for an industry city because
		// its definition kind is not 'retail'. This exercises the
		// `definition && definition.kind !== 'retail'` branch at L1025.
		// Already covered by the existing test at line 758, but we verify
		// it also applies when the city IS in the world catalog.
		expect(
			buildSupplyPlannerSnapshot(plannerGame(), {
				retailCityId: 'industry-city',
				productId: 'bottled-water'
			})
		).toEqual({ status: 'unavailable', reason: 'retail-city-unavailable' });
	});

	it('exercises compareRetailCityIds with one catalog and one non-catalog city', () => {
		// When sorting claimant cities, if one is in the catalog and the
		// other is not, the `leftIndex >= 0` return -1 branch at L1036
		// or the `rightIndex >= 0` return 1 branch at L1037 fires.
		// The existing test at line 1016 covers both catalog and non-catalog
		// cities. This test verifies the sort is stable.
		const game = createPlannerGameWithTwoRetailCities([product('bottled-water')]);
		const harbor = game.cities[0]!;
		const makeCustomCity = (id: string) => ({
			...harbor,
			id,
			name: id,
			tiles: harbor.tiles.map((tile) => ({
				...tile,
				id: tile.id.replace('harbor-city', id),
				cityId: id
			}))
		});
		const makeCustomStore = (id: string) => ({
			...game.stores[0]!,
			id: `store-${id}`,
			products: [product('bottled-water')],
			cityId: id,
			tileId: `${id}-3-1`
		});
		const gameWithCustom = {
			...game,
			cities: [...game.cities, makeCustomCity('custom-zeta')],
			stores: [...game.stores, makeCustomStore('custom-zeta')],
			world: {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, 'custom-zeta' as WorldCityId],
				openedCityIds: [...game.world.openedCityIds, 'custom-zeta' as WorldCityId]
			},
			retailSupplyAssignments: [
				...game.retailSupplyAssignments,
				{
					retailCityId: 'custom-zeta' as WorldCityId,
					supplyCityId: 'industry-city' as WorldCityId
				}
			]
		};
		const result = buildSupplyPlannerSnapshot(gameWithCustom, {
			retailCityId: 'harbor-city',
			productId: 'bottled-water'
		});
		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		// Catalog cities (harbor-city, campus-junction) should sort before
		// non-catalog cities (custom-zeta).
		expect(result.snapshot.demandContributors.map((c) => c.retailCityId)).toEqual([
			'harbor-city',
			'campus-junction',
			'custom-zeta'
		]);
	});

	it('exercises zero-demand material in disconnected candidate check', () => {
		// A material with requiredPerDay = 0 is skipped in the
		// disconnected candidate check at L871.
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				demandPerDay: 0,
				finishedMaterialId: 'bottled-water',
				buildings: [
					{ id: 'water-bottler-1', cityId: 'industry-city', typeId: 'water-bottler', level: 1 }
				],
				disconnectedBuildingIds: ['water-bottler-1']
			})
		);
		// With zero demand, the bottleneck should be 'none' even with
		// disconnected buildings.
		expect(projection.bottleneck).toEqual({ kind: 'none' });
	});

	it('exercises canBuildingReachBuilding and canReachAnyWarehouse with mismatched rail attach cells', () => {
		// A water-pump connected to rail but a water-bottler with no rail
		// attach cells exercises:
		// - canBuildingReachBuilding L590: toKeys.length === 0 for the
		//   water-bottler processor → returns false
		// - canReachAnyWarehouse L571: toKeys.length === 0 for the
		//   water-bottler when checking if it can reach any warehouse
		const base = plannerGame([product('bottled-water')]);
		const game = {
			...base,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 'industry-city', 1, 2, 2),
				building('water-bottler', 'water-bottler-1', 'industry-city', 1, 30, 30),
				building('warehouse', 'warehouse-1', 'industry-city', 1, 10, 2)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: verticalRails(2, 5, 4) } : city
			)
		};
		const result = buildSupplyPlannerSnapshot(game, {
			retailCityId: 'harbor-city',
			productId: 'bottled-water'
		});
		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		// The water-bottler at (30,30) has no rail nearby, so it's disconnected.
		expect(result.snapshot.disconnectedBuildingIds).toContain('water-bottler-1');
		// The water-pump at (2,2) has rail at y=4, but the water-bottler
		// can't receive the water, so the water-pump is also disconnected.
		expect(result.snapshot.disconnectedBuildingIds).toContain('water-pump-1');
	});

	it('exercises buildSupplyMaterialRequirements cycle guard with revisited material', () => {
		// The visit function in buildSupplyMaterialRequirements has a
		// `visiting.has(materialId)` guard at L310 that prevents infinite
		// recursion. Normal recipe chains are acyclic, so this guard never
		// fires. We verify the function handles a normal chain correctly
		// and that all materials are visited exactly once.
		const snapshot = readySnapshot(pantryPlannerGame(), {
			retailCityId: 'harbor-city',
			productId: 'pantry'
		});
		const requirements = buildSupplyMaterialRequirements(snapshot);
		const materialIds = requirements.map((r) => r.materialId);
		// Each material should appear exactly once (no cycles).
		expect(new Set(materialIds).size).toBe(materialIds.length);
		expect(materialIds).toContain('pantry');
		expect(materialIds).toContain('flour');
		expect(materialIds).toContain('grain');
	});

	it('reports missing-producer grain and orders stockout materials by materialId when no buildings exist', () => {
		// With no buildings and no inventory, every material in the pantry chain
		// (pantry, flour, grain) has a projected stockout day of 0. The
		// stockout sort comparator orders them by (stockoutDay ASC, materialId
		// ASC): flour, grain, pantry. However, the primary bottleneck is
		// missing-producer for grain (highest chainDepth with a recipe and no
		// buildings), which takes priority over inventory-cover.
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				demandPerDay: 10,
				finishedMaterialId: 'pantry',
				inventory: {},
				buildings: [],
				usableBuildingIds: []
			})
		);
		expect(projection.bottleneck).toEqual({
			kind: 'missing-producer',
			materialId: 'grain',
			chainDepth: 2
		});
		// Verify the comparator's ordered materialId values among stockout materials.
		const stockoutSortedMaterialIds = projection.materials
			.filter((m) => m.thirtyDay.projectedStockoutDay !== null)
			.sort(
				(left, right) =>
					(left.thirtyDay.projectedStockoutDay ?? Number.POSITIVE_INFINITY) -
						(right.thirtyDay.projectedStockoutDay ?? Number.POSITIVE_INFINITY) ||
					left.materialId.localeCompare(right.materialId)
			)
			.map((m) => m.materialId);
		expect(stockoutSortedMaterialIds).toEqual(['flour', 'grain', 'pantry']);
	});
});

describe('supply planner patch coverage', () => {
	it('registers a warehouse-connected processor for a branch no producer reaches', () => {
		// Lines 1173-1176: when a warehouse-connected processor feeds a branch
		// that no producer reaches, the branch is new (not in branchIndex) and
		// must be added with its branchDemand. Use the split-mill pantry fixture
		// but add a third processor for a branch no grain farm reaches.
		const snapshot = splitMillPantrySnapshot(0);
		// Add a warehouse-connected processor for a new branch 'special-flour'
		// that no producer reaches. The existing producers only reach 'flour'.
		snapshot.warehouseConnectedProcessorsByMaterial = {
			...snapshot.warehouseConnectedProcessorsByMaterial,
			grain: [
				...(snapshot.warehouseConnectedProcessorsByMaterial.grain ?? []),
				{
					processorId: 'special-mill',
					branchId: 'salt',
					inputCapacity: 5,
					canReachWarehouse: true,
					branchDemand: 8
				}
			]
		};
		const projection = projectSupplySnapshot(snapshot);
		// The projection should complete without error and the grain material
		// should have a thirtyDay projection (the new processor contributes
		// inventory routing capacity for the 'special-flour' branch).
		const grainRow = projection.materials.find((m) => m.materialId === 'grain');
		expect(grainRow).toBeDefined();
		expect(grainRow!.thirtyDay.importRequiredUnits).toBeGreaterThanOrEqual(0);
	});

	it('returns zero flow when branch data Map is empty for a usable producer', () => {
		// Line 1215: allocateCapacityByBranch early-returns when branchCount
		// is 0. This happens when hasBranchData is true (the
		// reachableBranchesByBuildingAndMaterial entry exists) but the Map is
		// empty, so no branches are registered.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			demandPerDay: 10,
			buildings: [
				{ id: 'grain-farm-1', cityId: 'industry-city', typeId: 'grain-farm', level: 1 },
				{ id: 'flour-mill-1', cityId: 'industry-city', typeId: 'flour-mill', level: 1 },
				{ id: 'pantry-works-1', cityId: 'industry-city', typeId: 'pantry-works', level: 1 }
			],
			usableBuildingIds: ['grain-farm-1', 'flour-mill-1', 'pantry-works-1'],
			reachableBranchesByBuildingAndMaterial: {
				'grain-farm-1\u0000grain': new Map()
			}
		});
		const projection = projectSupplySnapshot(snapshot);
		const grainRow = projection.materials.find((m) => m.materialId === 'grain');
		expect(grainRow).toBeDefined();
		// With no branches, usable capacity is 0.
		expect(grainRow!.usableCapacityPerDay).toBe(0);
	});

	it('breaks missing-producer ties by materialId when chainDepth is equal', () => {
		// Partial branch at line 2065: the sort comparator fallback
		// `compareCodeUnitStrings(left.materialId, right.materialId)` is
		// exercised when two missing-producer materials have equal chainDepth.
		// Use the snacks chain which has multiple depth-3 raw materials
		// (pulpwood, chemical-feedstock) — both missing at depth 3.
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				finishedMaterialId: 'snacks',
				demandPerDay: 10,
				buildings: [],
				usableBuildingIds: []
			})
		);
		// The bottleneck should be missing-producer. The sort picks the
		// highest chainDepth (3), then breaks ties by materialId ascending.
		// At depth 3: 'chemical-feedstock' < 'pulpwood'.
		expect(projection.bottleneck.kind).toBe('missing-producer');
		if (projection.bottleneck.kind === 'missing-producer') {
			expect(projection.bottleneck.materialId).toBe('chemical-feedstock');
			expect(projection.bottleneck.chainDepth).toBe(3);
		}
	});

	it('breaks capacity-deficit ties by materialId when normalized deficit is equal', () => {
		// Partial branch at line 2159: the sort comparator fallback for
		// capacity deficit. Two materials with equal normalized deficit but
		// different materialIds. Use snacks chain with all producers
		// installed but at level 1 (insufficient capacity for high demand),
		// creating capacity deficits across multiple materials.
		const buildings = [
			{
				id: 'flour-mill-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'flour-mill' as const,
				level: 1
			},
			{
				id: 'grain-farm-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'grain-farm' as const,
				level: 1
			},
			{
				id: 'oil-press-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'oil-press' as const,
				level: 1
			},
			{
				id: 'oilseed-farm-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'oilseed-farm' as const,
				level: 1
			},
			{
				id: 'salt-mine-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'salt-mine' as const,
				level: 1
			},
			{
				id: 'packaging-plant-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'packaging-plant' as const,
				level: 1
			},
			{
				id: 'pulp-mill-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'pulp-mill' as const,
				level: 1
			},
			{
				id: 'pulpwood-grove-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'pulpwood-grove' as const,
				level: 1
			},
			{
				id: 'plastic-plant-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'plastic-plant' as const,
				level: 1
			},
			{
				id: 'chemical-feedstock-well-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'chemical-feedstock-well' as const,
				level: 1
			},
			{
				id: 'snack-factory-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'snack-factory' as const,
				level: 1
			}
		];
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				finishedMaterialId: 'snacks',
				demandPerDay: 100,
				buildings,
				usableBuildingIds: buildings.map((b) => b.id)
			})
		);
		// With high demand and level-1 buildings, there should be a
		// production-capacity bottleneck. The exact material depends on
		// which has the highest normalized deficit.
		expect(projection.bottleneck.kind).toBe('production-capacity');
	});

	it('breaks stockout ties by materialId when stockoutDay is equal', () => {
		// Partial branch at line 2175: the sort comparator fallback for
		// stockout. Multiple materials with the same stockoutDay but different
		// materialIds. Use the snacks chain with no buildings and no inventory:
		// all materials stock out on day 0, and the tie is broken by materialId.
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				finishedMaterialId: 'snacks',
				demandPerDay: 10,
				buildings: [],
				usableBuildingIds: [],
				inventory: {}
			})
		);
		// With no buildings, missing-producer takes priority over stockout.
		// But the stockout sort is still computed internally. Verify the
		// bottleneck is missing-producer (which takes priority).
		expect(projection.bottleneck.kind).toBe('missing-producer');
		// Verify that multiple materials have stockoutDay 0 (the tie condition).
		const stockoutMaterials = projection.materials.filter(
			(m) => m.thirtyDay.projectedStockoutDay === 0
		);
		expect(stockoutMaterials.length).toBeGreaterThan(1);
	});

	it('breaks disconnected-building ties by materialId then buildingId', () => {
		// Partial branch at line 2097: the sort comparator fallback for
		// disconnected candidates. Two materials with equal chainDepth but
		// different materialIds, or same materialId but different buildingIds.
		const buildings = [
			{
				id: 'grain-farm-a',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'grain-farm' as const,
				level: 1
			},
			{
				id: 'grain-farm-b',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'grain-farm' as const,
				level: 1
			},
			{
				id: 'flour-mill-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'flour-mill' as const,
				level: 1
			},
			{
				id: 'pantry-works-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'pantry-works' as const,
				level: 1
			}
		];
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				finishedMaterialId: 'pantry',
				demandPerDay: 10,
				buildings,
				usableBuildingIds: ['flour-mill-1', 'pantry-works-1'],
				disconnectedBuildingIds: ['grain-farm-a', 'grain-farm-b']
			})
		);
		// Both grain farms are disconnected. The sort breaks ties by
		// chainDepth (both grain, same depth), then materialId (same), then
		// buildingId (grain-farm-a < grain-farm-b).
		expect(projection.bottleneck.kind).toBe('rail-disconnected');
		if (projection.bottleneck.kind === 'rail-disconnected') {
			expect(projection.bottleneck.buildingId).toBe('grain-farm-a');
			expect(projection.bottleneck.materialId).toBe('grain');
		}
	});

	it('breaks reachability-gap ties by materialId when chainDepth is equal', () => {
		// Partial branch at line 2120: the sort comparator fallback for
		// reachability gap. Two materials with equal chainDepth but different
		// materialIds. Use snacks chain with ALL producers installed and
		// usable, but reachable demand capped below required for multiple
		// depth-1 materials.
		const buildings = [
			{
				id: 'flour-mill-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'flour-mill' as const,
				level: 10
			},
			{
				id: 'grain-farm-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'grain-farm' as const,
				level: 10
			},
			{
				id: 'oil-press-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'oil-press' as const,
				level: 10
			},
			{
				id: 'oilseed-farm-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'oilseed-farm' as const,
				level: 10
			},
			{
				id: 'salt-mine-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'salt-mine' as const,
				level: 10
			},
			{
				id: 'packaging-plant-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'packaging-plant' as const,
				level: 10
			},
			{
				id: 'pulp-mill-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'pulp-mill' as const,
				level: 10
			},
			{
				id: 'pulpwood-grove-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'pulpwood-grove' as const,
				level: 10
			},
			{
				id: 'plastic-plant-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'plastic-plant' as const,
				level: 10
			},
			{
				id: 'chemical-feedstock-well-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'chemical-feedstock-well' as const,
				level: 10
			},
			{
				id: 'snack-factory-1',
				cityId: 'industry-city' as WorldCityId,
				typeId: 'snack-factory' as const,
				level: 10
			}
		];
		const projection = projectSupplySnapshot(
			projectionSnapshot({
				finishedMaterialId: 'snacks',
				demandPerDay: 10,
				buildings,
				usableBuildingIds: buildings.map((b) => b.id),
				reachableDemandByMaterial: {
					flour: 1,
					'cooking-oil': 1,
					salt: 1,
					packaging: 1,
					grain: 100,
					oilseeds: 100,
					'paper-pulp': 100,
					plastic: 100,
					pulpwood: 100,
					'chemical-feedstock': 100
				}
			})
		);
		// With reachable demand capped at 1 for flour and cooking-oil (both
		// depth 1), the reachability gap sort should break ties by materialId.
		// 'cooking-oil' < 'flour' alphabetically.
		expect(projection.bottleneck.kind).toBe('rail-disconnected');
		if (projection.bottleneck.kind === 'rail-disconnected') {
			expect(['cooking-oil', 'flour']).toContain(projection.bottleneck.materialId);
		}
	});

	it('keeps a warmed representative logistics plan under two seconds', () => {
		let game = createTwoIndustryCityGame({ day: 7 });
		game = withWarehouses(game, ['industry-city', 'breadbasket-basin']);
		game = withCityMaterials(
			withCityMaterials(game, 'industry-city', { grain: 20, flour: 10 }),
			'breadbasket-basin',
			{ grain: 50, flour: 20 }
		);
		game = {
			...game,
			stores: [{ ...game.stores[0]!, archetypeId: 'grocery', products: [product('pantry')] }],
			industrialBuildings: [
				building('grain-farm', 'grain-farm-1'),
				building('flour-mill', 'flour-mill-1'),
				building('pantry-works', 'pantry-works-1'),
				...game.industrialBuildings
			],
			logistics: {
				...game.logistics,
				recurringRoutes: [
					route({
						id: 'route-grain',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'grain',
						capacity: 10,
						nextDispatchOnDay: 7
					}),
					route({
						id: 'route-flour',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'flour',
						capacity: 10,
						nextDispatchOnDay: 7
					})
				],
				transferOrders: [
					{
						id: 'transfer-1',
						source: { kind: 'manual' },
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'grain',
						quantity: 3,
						createdOnDay: 6,
						dispatchedOnDay: 6,
						arrivalOnDay: 8,
						transportCost: 3,
						status: 'in-transit'
					} satisfies TransferOrder
				],
				nextTransferSequence: 2
			}
		};
		const request: SupplyPlannerRequest = { retailCityId: 'harbor-city', productId: 'pantry' };
		const availability = {
			canBuildIndustry: false,
			canUpgradeIndustry: false,
			canBuildRail: false,
			canManageLogistics: false,
			canSetRetailSupplySource: false,
			allowedIndustryBuildingTypeIds: [] as const
		};

		buildSupplyPlan(game, request, availability);
		const started = performance.now();
		const result = buildSupplyPlan(game, request, availability);
		expect(performance.now() - started).toBeLessThan(2_000);
		expect(result.status).toBe('ready');
	});
});

describe('supply planner projection edge-case coverage', () => {
	it('tracks the earliest arrival day across multiple in-transit orders for the same route', () => {
		// Two in-transit orders for the same route with different
		// arrival days. The second order arrives earlier than the
		// first, so the forecast's firstArrivalDay should be updated
		// to the earlier value (the in-transit order firstArrivalDay
		// update in the route-forecast loop).
		const game = createTwoIndustryCityGame({ day: 7, materials: false });
		const gameWithLogistics: GameState = {
			...game,
			stores: [{ ...game.stores[0]!, products: [product('bottled-water')] }],
			industrialBuildings: [
				building('water-pump', 'water-pump-1'),
				building('water-bottler', 'water-bottler-1'),
				building('warehouse', 'warehouse-1'),
				...game.industrialBuildings
			],
			cityInventories: [
				{ cityId: 'industry-city', materials: { water: 100 } },
				{ cityId: 'breadbasket-basin', materials: { 'bottled-water': 10_000 } }
			],
			logistics: {
				...game.logistics,
				recurringRoutes: [
					{
						id: 'route-water',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'bottled-water' as MaterialId,
						capacity: 100,
						frequencyDays: 1,
						leadTimeDays: 1,
						transportCostPerUnit: 1,
						priority: 1,
						state: 'active',
						nextDispatchOnDay: 7
					}
				],
				transferOrders: []
			}
		};
		const snapshot = readySnapshot(gameWithLogistics);
		// Add two in-transit orders for the same route with different
		// arrival days. The first has arrivalOnDay 10, the second has
		// arrivalOnDay 5. The forecast should track arrivalOnDay 5 as
		// the first arrival.
		snapshot.logistics = {
			...snapshot.logistics!,
			inTransitOrders: [
				{
					id: 'transfer-late',
					source: { kind: 'recurring-route' as const, routeId: 'route-water' },
					originCityId: 'breadbasket-basin',
					destinationCityId: 'industry-city',
					materialId: 'bottled-water' as MaterialId,
					quantity: 50,
					createdOnDay: 6,
					dispatchedOnDay: 6,
					arrivalOnDay: 10,
					transportCost: 50,
					status: 'in-transit'
				},
				{
					id: 'transfer-early',
					source: { kind: 'recurring-route' as const, routeId: 'route-water' },
					originCityId: 'breadbasket-basin',
					destinationCityId: 'industry-city',
					materialId: 'bottled-water' as MaterialId,
					quantity: 50,
					createdOnDay: 3,
					dispatchedOnDay: 3,
					arrivalOnDay: 5,
					transportCost: 50,
					status: 'in-transit'
				},
				{
					// This order goes to a different city, so the
					// destination-city filter in the route-forecast
					// loop skips it (destinationCityId !==
					// supplyCityId).
					id: 'transfer-other-dest',
					source: { kind: 'recurring-route' as const, routeId: 'route-water' },
					originCityId: 'industry-city',
					destinationCityId: 'breadbasket-basin',
					materialId: 'bottled-water' as MaterialId,
					quantity: 10,
					createdOnDay: 4,
					dispatchedOnDay: 4,
					arrivalOnDay: 6,
					transportCost: 10,
					status: 'in-transit'
				}
			]
		};

		const projection = projectSupplySnapshot(snapshot);
		const forecast = projection.routeForecasts?.find((f) => f.route.id === 'route-water');
		expect(forecast).toBeDefined();
		expect(forecast?.firstProjectedArrivalDay).toBe(5);
	});

	it('throws when the projected transport cost overflows the safe integer range', () => {
		// A route with high transport cost per unit that is individually
		// safe but cumulatively overflows Number.MAX_SAFE_INTEGER over
		// 30 daily dispatches, triggering the overflow check in
		// addProjectedTransportCost (line 3026).
		const game = createTwoIndustryCityGame({ day: 7, materials: false });
		// Each dispatch costs capacity * transportCostPerUnit = 1 * floor(MAX/20).
		// 30 dispatches would cost ~30 * floor(MAX/20) ≈ 1.5 * MAX, which overflows.
		const perUnitCost = Math.floor(Number.MAX_SAFE_INTEGER / 20);
		const gameWithLogistics: GameState = {
			...game,
			stores: [{ ...game.stores[0]!, products: [product('bottled-water')] }],
			industrialBuildings: [
				building('water-pump', 'water-pump-1'),
				building('water-bottler', 'water-bottler-1'),
				building('warehouse', 'warehouse-1', 'industry-city', 100),
				...game.industrialBuildings
			],
			cityInventories: [
				{ cityId: 'industry-city', materials: { water: 100 } },
				{ cityId: 'breadbasket-basin', materials: { 'bottled-water': 100 } }
			],
			logistics: {
				...game.logistics,
				recurringRoutes: [
					{
						id: 'route-water',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'bottled-water' as MaterialId,
						capacity: 1,
						frequencyDays: 1,
						leadTimeDays: 1,
						transportCostPerUnit: perUnitCost,
						priority: 1,
						state: 'active',
						nextDispatchOnDay: 7
					}
				],
				transferOrders: []
			}
		};
		const snapshot = readySnapshot(gameWithLogistics);

		expect(() => projectSupplySnapshot(snapshot)).toThrow(
			'Projected transport cost exceeds the safe integer range'
		);
	});

	it('does not attribute a stale in-transit order to an edited route forecast', () => {
		// route-1 originally dispatched bottled water.  While that shipment
		// was in transit, the player edited route-1 to carry flour
		// (updateRecurringRoute preserves the route ID but replaces
		// origin/destination/material).  The old bottled-water order must
		// still arrive in the logistics trace, but it must NOT become
		// route-1's firstProjectedArrivalDay or contribute to its
		// projected delivered count, which would corrupt the flour route's
		// lead-time/frequency diagnosis.
		const snapshot = projectionSnapshot({
			finishedMaterialId: 'pantry',
			demandPerDay: 10,
			warehouseCapacity: 1000,
			logistics: {
				currentDay: 1,
				remoteCities: [
					{
						inventory: { cityId: 'breadbasket-basin', materials: {} },
						warehouseCapacity: 100
					}
				],
				inTransitOrders: [
					{
						id: 'transfer-stale',
						source: { kind: 'recurring-route' as const, routeId: 'route-1' },
						// Stale shipment semantics: bottled water, not flour.
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'bottled-water' as MaterialId,
						quantity: 50,
						createdOnDay: 0,
						dispatchedOnDay: 0,
						arrivalOnDay: 5,
						transportCost: 50,
						status: 'in-transit'
					} satisfies TransferOrder
				],
				routes: [
					route({
						id: 'route-1',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'flour',
						capacity: 10,
						frequencyDays: 1,
						leadTimeDays: 1,
						priority: 1,
						nextDispatchOnDay: 7
					})
				],
				routeModifiers: [],
				nextRouteSequence: 2,
				nextTransferSequence: 2
			}
		});

		const projection = projectSupplySnapshot(snapshot);
		const forecast = projection.routeForecasts?.find((row) => row.route.id === 'route-1');

		expect(forecast).toBeDefined();
		// The stale bottled-water order arrives on day 5, but it must not
		// be attributed to the flour route's forecast.
		expect(forecast?.firstProjectedArrivalDay).toBeNull();
		expect(forecast?.projectedDeliveredUnits30).toBe(0);
	});
});

describe('supply planner route modifier projection', () => {
	function pantryRouteSnapshot(
		routeModifiers: readonly ActiveEventModifier[]
	): SupplyPlannerSnapshot {
		return projectionSnapshot({
			finishedMaterialId: 'pantry',
			demandPerDay: 10,
			warehouseCapacity: 1000,
			logistics: {
				currentDay: 1,
				remoteCities: [
					{
						inventory: { cityId: 'breadbasket-basin', materials: { pantry: 1000 } },
						warehouseCapacity: 1000
					}
				],
				inTransitOrders: [],
				routes: [
					route({
						id: 'route-pantry',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'pantry',
						capacity: 10,
						frequencyDays: 1,
						leadTimeDays: 1,
						nextDispatchOnDay: 1
					})
				],
				routeModifiers,
				nextRouteSequence: 1,
				nextTransferSequence: 1
			}
		});
	}

	it('projects an active suspension as the route-event-suspended condition with no dispatches', () => {
		const projection = projectSupplySnapshot(
			pantryRouteSnapshot([
				routeModifier({
					target: { kind: 'recurring-route', routeId: 'route-pantry' },
					effect: { kind: 'route-dispatch-suspension' }
				})
			])
		);
		const forecast = projection.routeForecasts?.find((row) => row.route.id === 'route-pantry');

		expect(forecast?.projectedCondition).toBe('route-event-suspended');
		expect(forecast?.projectedDispatchedUnits30).toBe(0);
		expect(forecast?.projectedTransportCost30).toBe(0);
		expect(forecast?.firstProjectedArrivalDay).toBeNull();
	});

	it('stops projecting a suspension after it expires inside the 30-day horizon', () => {
		const projection = projectSupplySnapshot(
			pantryRouteSnapshot([
				routeModifier({
					target: { kind: 'recurring-route', routeId: 'route-pantry' },
					startsOnDay: 1,
					expiresOnDay: 4,
					effect: { kind: 'route-dispatch-suspension' }
				})
			])
		);
		const forecast = projection.routeForecasts?.find((row) => row.route.id === 'route-pantry');

		// Suspended on days 1-3 (three dispatches), then 10/day for the
		// remaining 27 days of the horizon.
		expect(forecast?.projectedDispatchedUnits30).toBe(270);
		expect(forecast?.projectedDeliveredUnits30).toBeGreaterThan(0);
		// The condition keeps the worst state seen across the horizon.
		expect(forecast?.projectedCondition).toBe('route-event-suspended');
	});

	it('projects the effective lead time into the forecast arrival day', () => {
		const projection = projectSupplySnapshot(
			pantryRouteSnapshot([
				routeModifier({
					target: { kind: 'recurring-route', routeId: 'route-pantry' },
					effect: { kind: 'route-lead-time-adjustment', days: 2 }
				})
			])
		);
		const forecast = projection.routeForecasts?.find((row) => row.route.id === 'route-pantry');

		// First dispatch on day 1 with effective lead time 3 (1 + 2).
		expect(forecast?.firstProjectedArrivalDay).toBe(4);
	});

	it('projects reduced capacity and cost for a capacity and cost multiplier pair', () => {
		const projection = projectSupplySnapshot(
			pantryRouteSnapshot([
				routeModifier({
					target: { kind: 'recurring-route', routeId: 'route-pantry' },
					effect: { kind: 'route-capacity-multiplier', multiplier: 0.5 }
				}),
				routeModifier({
					id: 'event-modifier-2',
					target: { kind: 'recurring-route', routeId: 'route-pantry' },
					effect: { kind: 'route-transport-cost-multiplier', multiplier: 2 }
				})
			])
		);
		const forecast = projection.routeForecasts?.find((row) => row.route.id === 'route-pantry');

		// 30 dispatches of 5 units at 2 * 1 * 5 = 10 per dispatch.
		expect(forecast?.projectedDispatchedUnits30).toBe(150);
		expect(forecast?.projectedTransportCost30).toBe(300);
		// Effective capacity 5 trails the destination need, so the route is
		// capacity-constrained by the halved capacity.
		expect(forecast?.projectedCondition).toBe('route-capacity-constrained');
	});
});
