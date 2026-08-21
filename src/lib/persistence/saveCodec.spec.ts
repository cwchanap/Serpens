import { describe, expect, test, vi } from 'vitest';
import {
	computeStoreLocalDemand,
	DEFAULT_RETAIL_CITY_HEIGHT,
	DEFAULT_RETAIL_CITY_WIDTH,
	generateCity,
	isTileBuildable
} from '$lib/game/city';
import {
	buildIndustrialBuilding,
	getIndustrialPlacementBlockReason
} from '$lib/game/industryPlacement';
import { formatLocation } from '$lib/game/placement';
import type { DecisionContext } from '$lib/game/decisionContext';
import { simulateDay } from '$lib/game/simulateDay';
import { createFoundingFinanceState } from '$lib/game/finance';
import { createInitialEventRuntime } from '$lib/game/eventSelection';
import { cloneTimedEffect } from '$lib/game/eventModifiers';
import { createNewGame, resolveDecision } from '$lib/game/state';
import { ensureCompetitorsForRetailCity } from '$lib/game/competitors';
import { MANAGER_ACTION_HISTORY_LIMIT } from '$lib/game/managerDelegation';
import { getProductDefinition } from '$lib/game/products';
import { calculateStockHealth, initializeStoreProducts } from '$lib/game/stock';
import {
	STARTER_STORE_CAP,
	createInitialWorldProgress,
	getWorldCityDefinition,
	openWorldCity,
	refreshWorldProgress
} from '$lib/game/world';
import type {
	DailyMaterialMovement,
	DailyProductReport,
	DailyProductionReport,
	DailyReport,
	DailyReportWarning,
	DailyStoreReport,
	GameState,
	IndustryTile,
	MaterialId,
	ProductId,
	WorldCityId
} from '$lib/game/types';
import {
	AUTO_SAVE_SLOT_ID,
	SAVE_SCHEMA_VERSION,
	type SaveRecord,
	type SaveSlotKind,
	type SaveStoreSnapshot
} from './saveTypes';
import {
	SaveDataError,
	cloneSaveStoreSnapshot,
	createManualSlotId,
	createPlainSnapshot,
	createSaveRecord,
	createSaveSummary,
	parseSaveStoreSnapshot,
	validateCurrentGameState,
	validateSaveRecord,
	validateSaveStoreSnapshot
} from './saveCodec';

function createFixtureRetailCity(): GameState['cities'][number] {
	return generateCity({
		id: 'harbor-city',
		name: 'Harbor City',
		width: DEFAULT_RETAIL_CITY_WIDTH,
		height: DEFAULT_RETAIL_CITY_HEIGHT,
		seed: 20260505
	});
}

function findFixtureStoreTile(city: GameState['cities'][number]) {
	const tile = city.tiles.find((candidate) => {
		if (!isTileBuildable(candidate)) return false;
		const footprint = city.tiles.filter(
			(other) =>
				other.x >= candidate.x &&
				other.x < candidate.x + 2 &&
				other.y >= candidate.y &&
				other.y < candidate.y + 2
		);
		return footprint.length === 4 && footprint.every(isTileBuildable);
	});
	if (!tile) throw new Error(`Expected a buildable fixture tile in ${city.id}.`);
	return tile;
}

function findSecondFixtureStoreTile(
	city: GameState['cities'][number],
	firstTile: GameState['cities'][number]['tiles'][number]
): GameState['cities'][number]['tiles'][number] {
	const firstFootprint = new Set(
		city.tiles
			.filter(
				(other) =>
					other.x >= firstTile.x &&
					other.x < firstTile.x + 2 &&
					other.y >= firstTile.y &&
					other.y < firstTile.y + 2
			)
			.map((tile) => tile.id)
	);
	const tile = city.tiles.find((candidate) => {
		if (!isTileBuildable(candidate)) return false;
		const footprint = city.tiles.filter(
			(other) =>
				other.x >= candidate.x &&
				other.x < candidate.x + 2 &&
				other.y >= candidate.y &&
				other.y < candidate.y + 2
		);
		return (
			footprint.length === 4 &&
			footprint.every(isTileBuildable) &&
			footprint.every((tile) => !firstFootprint.has(tile.id))
		);
	});
	if (!tile) throw new Error(`Expected a second buildable fixture tile in ${city.id}.`);
	return tile;
}

function createFixtureIndustryCity(): GameState['industryCities'][number] {
	return {
		id: 'industry-city',
		name: 'Industry City',
		width: 3,
		height: 3,
		tiles: Array.from({ length: 9 }, (_, index) => {
			const x = index % 3;
			const y = Math.floor(index / 3);
			return {
				id: `industry-city-${x}-${y}`,
				cityId: 'industry-city',
				x,
				y,
				terrain: 'industrial',
				resource: null,
				locked: false
			};
		}),
		rails: []
	};
}

function createDeepEnumerableExtra(depth: number): Record<string, unknown> {
	let value: Record<string, unknown> = { leaf: true };
	for (let index = 0; index < depth; index += 1) value = { next: value };
	return value;
}

function createWideEnumerableExtra(nodeCount: number): Record<string, unknown> {
	const extra: Record<string, unknown> = {};
	for (let index = 0; index < nodeCount; index += 1) {
		extra[`n${index}`] = { leaf: true };
	}
	return extra;
}

function createGame(overrides: Partial<GameState> = {}): GameState {
	const city = createFixtureRetailCity();
	const storeTile = findFixtureStoreTile(city);

	return {
		seed: 20260505,
		rngState: 99,
		day: 3,
		cash: 12500,
		finance: createFoundingFinanceState(3, 2000),
		policy: {
			pricing: 'standard',
			inventory: 'balanced',
			staffing: 'efficient',
			marketing: 'awareness',
			service: 'balanced'
		},
		policyOverrides: [],
		managerDelegations: [],
		managerActionHistory: [],
		scorecard: {
			profit: 55,
			customerSatisfaction: 60,
			staffMorale: 65,
			marketPosition: 50
		},
		world: createInitialWorldProgress(),
		storeCap: STARTER_STORE_CAP,
		cities: [city],
		activeCityId: 'harbor-city',
		industryCities: [createFixtureIndustryCity()],
		activeIndustryCityId: 'industry-city',
		industrialBuildings: [],
		cityInventories: [
			{
				cityId: 'industry-city',
				materials: {}
			}
		],
		retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' }],
		logistics: {
			transferOrders: [],
			recurringRoutes: [],
			nextTransferSequence: 1,
			nextRouteSequence: 1
		},
		stores: [
			{
				id: 'store-1',
				level: 1,
				name: 'Founding Store',
				archetypeId: 'boutique',
				location: formatLocation(storeTile),
				cityId: 'harbor-city',
				tileId: storeTile.id,
				mapX: storeTile.x,
				mapY: storeTile.y,
				daysOpen: 2,
				reputation: 60,
				stockHealth: calculateStockHealth(initializeStoreProducts('boutique')),
				products: initializeStoreProducts('boutique'),
				staffMorale: 65,
				staffCapacity: 66,
				localDemand: computeStoreLocalDemand(storeTile),
				managerQuality: 58
			}
		],
		competitors: [],
		staff: [],
		hiringCandidates: [],
		events: overrides.events ?? createInitialEventRuntime(20260505),
		decisions: [],
		reports: [],
		...overrides
	};
}

function createGameWithTwoStores(overrides: Partial<GameState> = {}): GameState {
	const city = createFixtureRetailCity();
	const firstTile = findFixtureStoreTile(city);
	const secondTile = findSecondFixtureStoreTile(city, firstTile);
	const secondProducts = initializeStoreProducts('convenience');

	const base = createGame(overrides);
	return refreshWorldProgress({
		...base,
		stores: [
			...base.stores,
			{
				id: 'store-2',
				level: 1,
				name: 'Second Store',
				archetypeId: 'convenience',
				location: formatLocation(secondTile),
				cityId: 'harbor-city',
				tileId: secondTile.id,
				mapX: secondTile.x,
				mapY: secondTile.y,
				daysOpen: 1,
				reputation: 50,
				stockHealth: calculateStockHealth(secondProducts),
				products: secondProducts,
				staffMorale: 60,
				staffCapacity: 60,
				localDemand: computeStoreLocalDemand(secondTile),
				managerQuality: 50
			}
		]
	});
}

function createFixtureManager(id = 'manager-1'): GameState['staff'][number] {
	return {
		id,
		name: id,
		role: 'manager',
		monthlySalary: 1200,
		skill: 80,
		morale: 80,
		assignedStoreId: 'store-1',
		hiredOnDay: 1,
		level: 1,
		xp: 0
	};
}

function createFixtureDelegation(
	overrides: Partial<GameState['managerDelegations'][number]> = {}
): GameState['managerDelegations'][number] {
	return {
		managerId: 'manager-1',
		scope: { kind: 'store', storeId: 'store-1' },
		playbook: 'protect-margin',
		authority: { pricing: true, inventory: false, staffing: false, supply: false },
		enabled: true,
		...overrides
	};
}

function createFixtureHistory(
	overrides: Partial<GameState['managerActionHistory'][number]> = {}
): GameState['managerActionHistory'][number] {
	return {
		id: 'opaque-history-id',
		day: 3,
		managerId: 'manager-1',
		scope: { kind: 'store', storeId: 'store-1' },
		playbook: 'protect-margin',
		conflictKey: 'pricing:store-1',
		outcome: 'applied',
		reason: 'margin-below-threshold',
		change: {
			kind: 'pricing-policy',
			storeId: 'store-1',
			before: 'standard',
			proposed: 'premium',
			applied: 'premium'
		},
		...overrides
	};
}

type SaveRecordOverrides = Partial<Omit<SaveRecord, 'game' | 'metadata'>> & {
	game?: Partial<GameState>;
	metadata?: Partial<SaveRecord['metadata']>;
};

function createManualSaveRecord(overrides: SaveRecordOverrides = {}): SaveRecord {
	const record = createSaveRecord(createGame(), {
		id: 'manual-test-run',
		name: 'Test Run',
		kind: 'manual',
		updatedAt: new Date('2026-05-05T12:00:00.000Z')
	});

	return {
		...record,
		...overrides,
		metadata: {
			...record.metadata,
			...overrides.metadata
		},
		game: {
			...record.game,
			...overrides.game
		}
	};
}

function createSnapshotWithGame(game: Partial<GameState>): SaveStoreSnapshot {
	const record = createSaveRecord(createGame(), {
		id: 'manual-test-run',
		name: 'Test Run',
		kind: 'manual',
		updatedAt: new Date('2026-05-05T12:00:00.000Z')
	});

	return {
		schemaVersion: SAVE_SCHEMA_VERSION,
		autoSave: null,
		manualSlots: [{ ...record, game: game as GameState }]
	};
}

function createDailyProductionReport(
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
		cityInventories: overrides.cityInventories ?? [
			{ cityId: 'industry-city', capacity: 0, used: 0, overflowUnits: 0, overflowCost: 0 }
		]
	};
}

function createDailyReport(overrides: Partial<DailyReport> = {}): DailyReport {
	return {
		day: 3,
		revenue: 1000,
		costOfGoods: 350,
		grossMargin: 650,
		operatingCosts: 250,
		payrollCost: 0,
		importSpend: 0,
		cashBefore: 0,
		operatingIncome: 0,
		operatingCashFlow: 400,
		inventoryLossExpense: 0,
		interestAccrued: 0,
		interestPaid: 0,
		interestCapitalized: 0,
		principalBorrowed: 0,
		principalRepaid: 0,
		refinancedPrincipal: 0,
		financingCashFlow: 0,
		netCashChange: 400,
		netIncome: 400,
		cashAfter: 12900,
		outstandingPrincipalAfter: 0,
		nextLoanPayment: null,
		scorecard: {
			profit: 55,
			customerSatisfaction: 60,
			staffMorale: 65,
			marketPosition: 50
		},
		productionReport: createDailyProductionReport(),
		logistics: {
			arrivals: [],
			routeDispatchAttempts: [],
			deliveredUnits: 0,
			scheduledTransportCost: 0,
			modifierRecoveries: []
		},
		storeReports: [],
		modifierImpacts: [],
		modifierLifecycle: [],
		marketReports: [],
		warnings: [],
		...overrides
	};
}

function createHistoricalLogisticsReport(): DailyReport['logistics'] {
	return {
		arrivals: [
			{
				transferOrderId: 'transfer-retired',
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water',
				quantity: 4
			}
		],
		routeDispatchAttempts: [
			{
				routeId: 'route-retired',
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water',
				destinationNeed: 10,
				capacity: 10,
				availableOriginStock: 7,
				dispatchedQuantity: 7,
				unusedCapacity: 3,
				unmetDestinationNeed: 3,
				transportCost: 21,
				transferOrderId: 'transfer-retired',
				baselineCapacity: 10,
				dispatchSuspended: false,
				modifierImpacts: []
			},
			{
				routeId: 'route-removed',
				originCityId: 'breadbasket-basin',
				destinationCityId: 'industry-city',
				materialId: 'grain',
				destinationNeed: 0,
				capacity: 5,
				availableOriginStock: 9,
				dispatchedQuantity: 0,
				unusedCapacity: 5,
				unmetDestinationNeed: 0,
				transportCost: 0,
				transferOrderId: null,
				baselineCapacity: 5,
				dispatchSuspended: false,
				modifierImpacts: []
			}
		],
		deliveredUnits: 4,
		scheduledTransportCost: 21,
		modifierRecoveries: []
	};
}

function createLogisticsReportWithModifierEvidence(): DailyReport['logistics'] {
	const contributorSource = {
		eventId: 'freight-disruption',
		instanceId: 'event-instance-1',
		optionId: 'accept-delay'
	};
	const contributor = (modifierId: string, optionId: string, explanationKey: string) => ({
		modifierId,
		source: { ...contributorSource, optionId },
		explanation: { key: explanationKey, params: {} }
	});
	return {
		arrivals: [
			{
				transferOrderId: 'transfer-1',
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water',
				quantity: 7
			}
		],
		routeDispatchAttempts: [
			{
				routeId: 'route-1',
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water',
				destinationNeed: 10,
				capacity: 10,
				availableOriginStock: 7,
				dispatchedQuantity: 7,
				unusedCapacity: 3,
				unmetDestinationNeed: 3,
				transportCost: 21,
				transferOrderId: 'transfer-1',
				baselineCapacity: 10,
				dispatchSuspended: false,
				modifierImpacts: [
					{
						contributors: [
							contributor(
								'event-modifier-1',
								'accept-delay',
								'events.freightDisruption.acceptDelay.leadTime'
							)
						],
						effectKind: 'route-lead-time-adjustment',
						baselineLeadTimeDays: 2,
						effectiveLeadTimeDays: 3
					},
					{
						contributors: [
							contributor(
								'event-modifier-2',
								'accept-delay',
								'events.freightDisruption.acceptDelay.capacity'
							)
						],
						effectKind: 'route-capacity-multiplier',
						baselineCapacity: 10,
						effectiveCapacity: 8,
						baselineDispatchedQuantity: 7,
						effectiveDispatchedQuantity: 6
					},
					{
						contributors: [
							contributor(
								'event-modifier-3',
								'accept-delay',
								'events.freightDisruption.charterCarriers.transportCost'
							)
						],
						effectKind: 'route-transport-cost-multiplier',
						baselineTransportCost: 21,
						effectiveTransportCost: 31
					}
				]
			},
			{
				routeId: 'route-2',
				originCityId: 'breadbasket-basin',
				destinationCityId: 'industry-city',
				materialId: 'grain',
				destinationNeed: 10,
				capacity: 10,
				availableOriginStock: 10,
				dispatchedQuantity: 0,
				unusedCapacity: 10,
				unmetDestinationNeed: 10,
				transportCost: 0,
				transferOrderId: null,
				baselineCapacity: 10,
				dispatchSuspended: true,
				modifierImpacts: [
					{
						contributors: [
							contributor(
								'event-modifier-4',
								'suspend-shipments',
								'events.freightDisruption.suspendShipments.suspension'
							)
						],
						effectKind: 'route-dispatch-suspension',
						baselineDispatchedQuantity: 10,
						effectiveDispatchedQuantity: 0
					}
				]
			}
		],
		deliveredUnits: 7,
		scheduledTransportCost: 21,
		modifierRecoveries: [
			{
				routeId: 'route-1',
				modifierId: 'event-modifier-1',
				source: { ...contributorSource },
				effectKind: 'route-lead-time-adjustment',
				disruptedLeadTimeDays: 3,
				recoveredLeadTimeDays: 2
			},
			{
				routeId: 'route-1',
				modifierId: 'event-modifier-2',
				source: { ...contributorSource },
				effectKind: 'route-capacity-multiplier',
				disruptedCapacity: 8,
				recoveredCapacity: 10
			},
			{
				routeId: 'route-2',
				modifierId: 'event-modifier-4',
				source: { ...contributorSource, optionId: 'suspend-shipments' },
				effectKind: 'route-dispatch-suspension',
				disruptedSuspended: true,
				recoveredSuspended: false
			},
			{
				routeId: 'route-1',
				modifierId: 'event-modifier-3',
				source: { ...contributorSource },
				effectKind: 'route-transport-cost-multiplier',
				disruptedTransportCostPerUnit: 3,
				recoveredTransportCostPerUnit: 2
			}
		]
	};
}

function createDailyStoreReport(overrides: Partial<DailyStoreReport> = {}): DailyStoreReport {
	return {
		storeId: 'store-1',
		revenue: 1000,
		costOfGoods: 350,
		grossMargin: 650,
		operatingCosts: 250,
		importSpend: 0,
		netIncome: 400,
		customersServed: 42,
		demandMissed: 5,
		staffingCoverage: 100,
		staffingShortage: { manager: 0, general: 0 },
		stockHealth: 70,
		staffMorale: 65,
		reputation: 60,
		brandReputationAdjustment: 0,
		marketPosition: 50,
		productReports: [],
		inventoryLossExpense: 0,
		warnings: [],
		...overrides,
		replenishment: overrides.replenishment ?? null
	};
}

function createDailyProductReport(overrides: Partial<DailyProductReport> = {}): DailyProductReport {
	return {
		productId: 'snacks',
		brandId: 'common-ground',
		name: 'Snacks',
		unitsSold: 1,
		demandMissed: 0,
		revenue: 10,
		costOfGoods: 6,
		grossMargin: 4,
		endingStock: 5,
		warehouseUnits: 2,
		warehouseValue: 4,
		importedUnits: 0,
		importCost: 3,
		importSpend: 0,
		wasteUnits: 0,
		wasteValue: 0,
		shrinkUnits: 0,
		shrinkValue: 0,
		stockoutLostDemand: 0,
		averageAgeDays: null,
		oldestSellableAgeDays: null,
		trendMultiplier: 1,
		obsolescenceMultiplier: 1,
		baseSellingPrice: 10,
		effectiveSellingPrice: 10,
		markdownAmount: 0,
		...overrides
	};
}

function createIndustrialBuilding(
	overrides: Partial<GameState['industrialBuildings'][number]> = {}
): GameState['industrialBuildings'][number] {
	return {
		id: 'flour-mill-1',
		level: 1,
		typeId: 'flour-mill',
		cityId: 'industry-city',
		tileId: 'industry-city-1-1',
		mapX: 1,
		mapY: 1,
		status: 'idle',
		lastProduction: [],
		producedTotal: 0,
		importedInputTotal: 0,
		blockedDays: 0,
		inventory: {},
		...overrides
	};
}

function createValidWarehouseBuildingGame(): GameState {
	const game = { ...createNewGame('convenience', 20260722), cash: 1_000_000 };
	const city = game.industryCities[0]!;
	const tile = city.tiles.find(
		(candidate) => getIndustrialPlacementBlockReason(game, candidate.id, 'warehouse') === null
	)!;
	const built = buildIndustrialBuilding(game, {
		tileId: tile.id,
		buildingTypeId: 'warehouse'
	});
	return built;
}

function createCurrentMultiCityGame(): GameState {
	let game = createValidWarehouseBuildingGame();
	game = {
		...game,
		cash: 1_000_000,
		world: {
			...game.world,
			revealedCityIds: [...game.world.revealedCityIds, 'campus-junction', 'breadbasket-basin']
		}
	};
	game = openWorldCity(game, 'campus-junction');
	game = openWorldCity(game, 'breadbasket-basin');

	return refreshWorldProgress({
		...game,
		cityInventories: game.cityInventories.map((inventory) =>
			inventory.cityId === 'industry-city'
				? {
						...inventory,
						materials: { water: 5 }
					}
				: {
						...inventory,
						materials: { grain: 2 }
					}
		)
	});
}

function createLogisticsGame(): GameState {
	return simulateDay(simulateDay(createCurrentMultiCityGame()));
}

function createLogisticsState(game: GameState): GameState['logistics'] {
	return {
		transferOrders: [
			{
				id: 'transfer-1',
				source: { kind: 'manual' },
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water',
				quantity: 4,
				createdOnDay: 1,
				dispatchedOnDay: 1,
				arrivalOnDay: 2,
				transportCost: 12,
				status: 'delivered'
			},
			{
				id: 'transfer-2',
				source: { kind: 'recurring-route', routeId: 'route-1' },
				originCityId: 'breadbasket-basin',
				destinationCityId: 'industry-city',
				materialId: 'grain',
				quantity: 3,
				createdOnDay: game.day - 1,
				dispatchedOnDay: game.day - 1,
				arrivalOnDay: game.day,
				transportCost: 9,
				status: 'in-transit'
			}
		],
		recurringRoutes: [
			{
				id: 'route-1',
				originCityId: 'industry-city',
				destinationCityId: 'breadbasket-basin',
				materialId: 'water',
				capacity: 8,
				frequencyDays: 3,
				leadTimeDays: 2,
				transportCostPerUnit: 3,
				priority: 0,
				state: 'paused',
				nextDispatchOnDay: game.day - 1
			}
		],
		nextTransferSequence: 3,
		nextRouteSequence: 2
	};
}

function logisticsError(operation: () => unknown): SaveDataError {
	try {
		operation();
	} catch (error) {
		if (error instanceof SaveDataError) return error;
		throw error;
	}

	throw new Error('Expected logistics validation to reject the saved game.');
}

function createCurrentReport(game: GameState): DailyReport {
	const warehouseId = game.industrialBuildings[0]!.id;
	const productId = game.stores[0]!.products[0]!.productId;

	return createDailyReport({
		day: game.day,
		productionReport: createDailyProductionReport({
			warehouseCapacity: 200,
			warehouseUsed: 7,
			overflowUnits: 2,
			overflowCost: 4,
			produced: [
				{ cityId: 'industry-city', materialId: 'water', quantity: 2, value: 2, source: 'local' }
			],
			shopImports: [
				{ cityId: 'harbor-city', materialId: 'water', quantity: 1, value: 3, source: 'import' }
			],
			railShipments: [
				{
					cityId: 'industry-city',
					materialId: 'water',
					quantity: 1,
					value: 1,
					kind: 'push-warehouse',
					fromId: warehouseId,
					toId: warehouseId
				}
			],
			cityInventories: [
				{ cityId: 'industry-city', capacity: 200, used: 5, overflowUnits: 0, overflowCost: 0 },
				{ cityId: 'breadbasket-basin', capacity: 0, used: 2, overflowUnits: 2, overflowCost: 4 }
			]
		}),
		storeReports: [
			createDailyStoreReport({
				storeId: game.stores[0]!.id,
				replenishment: {
					retailCityId: 'harbor-city',
					configuredSupplyCityId: 'industry-city',
					resolvedSupplyCityId: 'industry-city'
				},
				productReports: [createDailyProductReport({ productId, name: 'Starter product' })]
			})
		]
	});
}

/**
 * A current-v13 game where a scenario has designated breadbasket-basin as the
 * sole opened industry city and pruned the starter `industry-city` inventory
 * during setup. Mirrors `createCurrentMultiCityGame` but substitutes
 * breadbasket-basin for industry-city so the production-close report contains
 * no `industry-city` summary.
 */
function createCurrentBreadbasketOnlyGame(): GameState {
	let game = { ...createNewGame('convenience', 20260722), cash: 1_000_000 };
	game = {
		...game,
		world: {
			...game.world,
			revealedCityIds: [...game.world.revealedCityIds, 'breadbasket-basin']
		}
	};
	game = openWorldCity(game, 'breadbasket-basin');
	const breadbasket = game.industryCities.find((city) => city.id === 'breadbasket-basin')!;
	const warehouseTile = breadbasket.tiles.find(
		(candidate) => getIndustrialPlacementBlockReason(game, candidate.id, 'warehouse') === null
	)!;
	game = buildIndustrialBuilding(game, {
		tileId: warehouseTile.id,
		buildingTypeId: 'warehouse'
	});

	return {
		...game,
		activeIndustryCityId: 'breadbasket-basin',
		world: {
			...game.world,
			revealedCityIds: game.world.revealedCityIds.filter((id) => id !== 'industry-city'),
			openedCityIds: game.world.openedCityIds.filter((id) => id !== 'industry-city')
		},
		industryCities: game.industryCities.filter((city) => city.id !== 'industry-city'),
		industrialBuildings: game.industrialBuildings.filter(
			(building) => building.cityId !== 'industry-city'
		),
		cityInventories: [
			{
				cityId: 'breadbasket-basin',
				materials: { water: 5 }
			}
		],
		retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: 'breadbasket-basin' }]
	};
}

function createCurrentBreadbasketOnlyReport(game: GameState): DailyReport {
	const warehouseId = game.industrialBuildings[0]!.id;
	const productId = game.stores[0]!.products[0]!.productId;

	return createDailyReport({
		day: game.day,
		productionReport: createDailyProductionReport({
			warehouseCapacity: 200,
			warehouseUsed: 5,
			overflowUnits: 0,
			overflowCost: 0,
			produced: [
				{ cityId: 'breadbasket-basin', materialId: 'water', quantity: 2, value: 2, source: 'local' }
			],
			shopImports: [
				{ cityId: 'harbor-city', materialId: 'water', quantity: 1, value: 3, source: 'import' }
			],
			railShipments: [
				{
					cityId: 'breadbasket-basin',
					materialId: 'water',
					quantity: 1,
					value: 1,
					kind: 'push-warehouse',
					fromId: warehouseId,
					toId: warehouseId
				}
			],
			cityInventories: [
				{ cityId: 'breadbasket-basin', capacity: 200, used: 5, overflowUnits: 0, overflowCost: 0 }
			]
		}),
		storeReports: [
			createDailyStoreReport({
				storeId: game.stores[0]!.id,
				replenishment: {
					retailCityId: 'harbor-city',
					configuredSupplyCityId: 'breadbasket-basin',
					resolvedSupplyCityId: 'breadbasket-basin'
				},
				productReports: [createDailyProductReport({ productId, name: 'Starter product' })]
			})
		]
	});
}

function expectSaveRecordErrorCode(record: unknown, expectedCode: SaveDataError['code']): void {
	let caught: unknown;
	try {
		validateSaveRecord(record);
	} catch (error) {
		caught = error;
	}

	expect(caught).toBeInstanceOf(SaveDataError);
	if (caught instanceof SaveDataError) {
		expect(caught.code).toBe(expectedCode);
	}
}

function expectGameStateErrorCode(
	game: GameState,
	expectedCode: SaveDataError['code'],
	messageFragment?: string
): void {
	let caught: unknown;
	try {
		validateCurrentGameState(game);
	} catch (error) {
		caught = error;
	}

	expect(caught).toBeInstanceOf(SaveDataError);
	if (caught instanceof SaveDataError) {
		expect(caught.code).toBe(expectedCode);
		if (messageFragment !== undefined) {
			expect(caught.message).toContain(messageFragment);
		}
	}
}

function expectHistoricalReportDropped(decode: () => GameState): void {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		expect(decode().reports).toEqual([]);
		expect(warn).toHaveBeenCalledTimes(1);
	} finally {
		warn.mockRestore();
	}
}

function expectHistoricalReportPreserved(decode: () => GameState): GameState {
	const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	try {
		const game = decode();
		expect(game.reports).toHaveLength(1);
		expect(warn).not.toHaveBeenCalled();
		return game;
	} finally {
		warn.mockRestore();
	}
}

function withCurrentReports(game: GameState, reports: DailyReport[]): GameState {
	return refreshWorldProgress({ ...game, reports });
}

function decodeHistoricalReport(game: GameState, report: DailyReport): GameState {
	return validateSaveRecord(createManualSaveRecord({ game: withCurrentReports(game, [report]) }))
		.game;
}

function createCompleteEventGame(): GameState {
	const base = createGame({ day: 3 });
	const activeModifier: GameState['events']['activeModifiers'][number] = {
		id: 'event-modifier-1',
		source: {
			eventId: 'supplier-terms',
			instanceId: 'event-instance-1',
			optionId: 'bulk-discount'
		},
		target: { kind: 'company' },
		startsOnDay: 2,
		expiresOnDay: 5,
		stackingKey: 'supplier-bulk-discount:retail-product',
		stackingRule: 'replace',
		effect: {
			kind: 'import-cost-multiplier',
			scope: 'retail-product',
			target: { kind: 'all' },
			multiplier: 0.9
		},
		explanation: { key: 'events.supplierTerms.bulkDiscount.modifier', params: {} },
		importance: 'important'
	};
	const modifierSnapshot = {
		id: activeModifier.id,
		source: { ...activeModifier.source },
		target: { ...activeModifier.target },
		startsOnDay: activeModifier.startsOnDay,
		expiresOnDay: activeModifier.expiresOnDay,
		stackingKey: activeModifier.stackingKey,
		effect: cloneTimedEffect(activeModifier.effect),
		explanation: {
			...activeModifier.explanation,
			params: { ...activeModifier.explanation.params }
		},
		importance: activeModifier.importance
	};

	return refreshWorldProgress({
		...base,
		events: {
			selectionSchemaVersion: 1,
			rngState: 987_654_321,
			nextInstanceSequence: 3,
			nextModifierSequence: 2,
			cooldowns: [
				{
					eventId: 'cash-pressure',
					target: { kind: 'company' },
					generatedOnDay: 3,
					eligibleOnDay: 4
				}
			],
			activeModifiers: [activeModifier],
			history: [
				{
					kind: 'event-generated',
					day: 2,
					eventId: 'supplier-terms',
					instanceId: 'event-instance-1',
					target: { kind: 'company' }
				},
				{
					kind: 'event-resolved',
					day: 2,
					eventId: 'supplier-terms',
					instanceId: 'event-instance-1',
					optionId: 'bulk-discount',
					target: { kind: 'company' }
				},
				{
					kind: 'modifier-lifecycle',
					day: 2,
					status: 'activated',
					modifier: modifierSnapshot
				},
				{
					kind: 'event-generated',
					day: 3,
					eventId: 'cash-pressure',
					instanceId: 'event-instance-2',
					target: { kind: 'company' }
				}
			]
		},
		decisions: [
			{
				kind: 'event',
				id: 'event-instance-2',
				eventId: 'cash-pressure',
				definitionVersion: 1,
				generatedOnDay: 3,
				expiresOnDay: 5,
				target: { kind: 'company' },
				copy: { key: 'events.cashPressure', params: { availableCredit: 8_000 } },
				options: [
					{
						id: 'short-loan',
						effects: [
							{
								kind: 'finance-borrow',
								purpose: 'emergency',
								amount: 8_000,
								termDays: 56
							},
							{ kind: 'score-adjust', score: 'profit', amount: -4 }
						],
						modifiers: [
							{
								durationDays: 3,
								stackingKey: 'future-revision:retail-product',
								stackingRule: 'replace',
								effect: {
									kind: 'import-cost-multiplier',
									scope: 'retail-product',
									target: { kind: 'all' },
									multiplier: 0.95
								},
								explanation: { key: 'events.futureRevision.modifier', params: { percent: 5 } },
								importance: 'normal'
							}
						]
					}
				]
			}
		],
		reports: [
			createDailyReport({
				day: 2,
				modifierImpacts: [
					{
						modifierId: activeModifier.id,
						source: { ...activeModifier.source },
						target: { kind: 'company' },
						effectKind: 'import-cost-multiplier',
						explanation: {
							...activeModifier.explanation,
							params: { ...activeModifier.explanation.params }
						},
						scope: 'retail-product',
						affectedIds: ['store-1/product:fashion-accessories'],
						multiplier: 0.9,
						resolvedMultiplier: 1.8,
						baselineCost: 400,
						actualCost: 720,
						applicationCount: 1
					}
				],
				modifierLifecycle: [{ status: 'activated', modifier: modifierSnapshot }]
			})
		]
	});
}

function createCompleteRouteEventGame(): GameState {
	const base = createCompleteEventGame();
	const routeTarget = { kind: 'recurring-route' as const, routeId: 'route-1' };
	const routeModifier: GameState['events']['activeModifiers'][number] = {
		...base.events.activeModifiers[0]!,
		id: 'event-modifier-2',
		source: {
			eventId: 'freight-disruption',
			instanceId: 'event-instance-2',
			optionId: 'accept-delay'
		},
		target: routeTarget,
		stackingKey: 'freight-capacity:route-1',
		effect: { kind: 'route-capacity-multiplier', multiplier: 0.75 },
		explanation: { key: 'events.freightDisruption.acceptDelay.capacity', params: {} }
	};
	const secondRouteModifier: GameState['events']['activeModifiers'][number] = {
		...routeModifier,
		id: 'event-modifier-3',
		target: { kind: 'recurring-route', routeId: 'route-2' },
		stackingKey: 'freight-capacity:route-1'
	};
	const routeModifierSnapshot = {
		id: routeModifier.id,
		source: { ...routeModifier.source },
		target: { ...routeModifier.target },
		startsOnDay: routeModifier.startsOnDay,
		expiresOnDay: routeModifier.expiresOnDay,
		stackingKey: routeModifier.stackingKey,
		effect: cloneTimedEffect(routeModifier.effect),
		explanation: {
			...routeModifier.explanation,
			params: { ...routeModifier.explanation.params }
		},
		importance: routeModifier.importance
	};

	return {
		...base,
		logistics: { ...base.logistics, nextRouteSequence: 3 },
		events: {
			...base.events,
			nextInstanceSequence: 4,
			nextModifierSequence: 4,
			cooldowns: [
				{
					eventId: 'freight-disruption',
					target: routeTarget,
					generatedOnDay: 3,
					eligibleOnDay: 4
				}
			],
			activeModifiers: [routeModifier, secondRouteModifier],
			history: base.events.history.map((entry) =>
				entry.kind === 'modifier-lifecycle' ? entry : { ...entry, target: routeTarget }
			)
		},
		decisions: base.decisions.map((decision) =>
			decision.kind === 'event' ? { ...decision, target: routeTarget } : decision
		),
		reports: [
			{
				...base.reports[0]!,
				modifierLifecycle: [
					{ status: 'activated', modifier: routeModifierSnapshot },
					{
						status: 'activated',
						modifier: {
							...routeModifierSnapshot,
							id: 'event-modifier-3',
							target: { kind: 'recurring-route', routeId: 'route-2' }
						}
					}
				]
			}
		]
	};
}

describe('saveCodec', () => {
	describe('schema 19 brand, policy, and manager state validation', () => {
		test('rejects schema 17 without migration', () => {
			const record = { ...createManualSaveRecord(), schemaVersion: 17 };

			expect(() => validateSaveRecord(record)).toThrow('Unsupported save schema version: 17');
		});

		test('rejects schema 18 without migration', () => {
			const record = { ...createManualSaveRecord(), schemaVersion: 18 };

			expect(() => validateSaveRecord(record)).toThrow('Unsupported save schema version: 18');
		});

		test('preserves a known supported brand while validating a current game', () => {
			const decoded = validateCurrentGameState(createGame());

			expect(decoded.stores[0]!.products[0]!.brandId).toBe('common-ground');
		});

		test.each([
			[
				'non-canonical id',
				(competitor: GameState['competitors'][number]) => ({ ...competitor, id: 'rival-1' })
			],
			[
				'blocked location',
				(competitor: GameState['competitors'][number]) => ({
					...competitor,
					location: { ...competitor.location, x: 0, y: 0 }
				})
			]
		] as const)('rejects a competitor with a %s', (_label, mutate) => {
			const game = ensureCompetitorsForRetailCity(createGame(), 'harbor-city');
			const malformed = {
				...game,
				competitors: [mutate(game.competitors[0]!), game.competitors[1]!]
			} as GameState;

			expect(() => validateCurrentGameState(malformed)).toThrow(SaveDataError);
		});

		test('round-trips thin market evidence and drops unknown historical rival references', () => {
			const game = ensureCompetitorsForRetailCity(createGame(), 'harbor-city');
			const marketReport = {
				cityId: 'harbor-city' as const,
				productId: 'bottled-water' as const,
				cityDemandPool: 120,
				playerDemandPool: 80,
				playerShare: 2 / 3,
				playerShareDelta: null,
				playerAttractionScore: 100,
				competitors: [
					{
						competitorId: game.competitors[0]!.id,
						share: 1 / 3,
						attractionScore: 50,
						eventMultiplier: 1
					}
				]
			};
			const report = createDailyReport({ marketReports: [marketReport] });
			const decoded = decodeHistoricalReport({ ...game, reports: [] }, report);
			expect(decoded.reports[0]!.marketReports).toEqual([marketReport]);

			const malformedReport = createDailyReport({
				marketReports: [
					{
						...marketReport,
						competitors: [
							{ ...marketReport.competitors[0]!, competitorId: 'competitor-harbor-city-9' }
						]
					}
				]
			});
			expectHistoricalReportDropped(() =>
				decodeHistoricalReport({ ...game, reports: [] }, malformedReport)
			);
		});

		test.each([
			['non-materialized retail city', 'campus-junction'],
			['non-retail city', 'industry-city']
		] as const)('drops historical market evidence for a %s', (_label, cityId) => {
			const game = createGame();
			const report = createDailyReport({
				marketReports: [
					{
						cityId,
						productId: 'bottled-water',
						cityDemandPool: 120,
						playerDemandPool: 80,
						playerShare: 1,
						playerShareDelta: null,
						playerAttractionScore: 100,
						competitors: []
					}
				]
			});

			expectHistoricalReportDropped(() => decodeHistoricalReport({ ...game, reports: [] }, report));
		});

		test('drops historical market evidence when a rival belongs to another city', () => {
			const game = createCurrentMultiCityGame();
			const campusCompetitor = game.competitors.find(
				(competitor) => competitor.cityId === 'campus-junction'
			);
			expect(campusCompetitor).toBeDefined();

			const report = createDailyReport({
				day: game.day,
				marketReports: [
					{
						cityId: 'harbor-city',
						productId: 'bottled-water',
						cityDemandPool: 120,
						playerDemandPool: 80,
						playerShare: 2 / 3,
						playerShareDelta: null,
						playerAttractionScore: 100,
						competitors: [
							{
								competitorId: campusCompetitor!.id,
								share: 1 / 3,
								attractionScore: 50,
								eventMultiplier: 1
							}
						]
					}
				]
			});

			expectHistoricalReportDropped(() => decodeHistoricalReport({ ...game, reports: [] }, report));
		});

		test('preserves historical market evidence for a closed rival in its own city', () => {
			const game = ensureCompetitorsForRetailCity(createGame(), 'harbor-city');
			const closedCompetitor = game.competitors[0]!;
			const closedGame = {
				...game,
				competitors: game.competitors.map((competitor) =>
					competitor.id === closedCompetitor.id
						? { ...competitor, status: 'closed' as const }
						: competitor
				)
			};
			const report = createDailyReport({
				marketReports: [
					{
						cityId: 'harbor-city',
						productId: 'bottled-water',
						cityDemandPool: 120,
						playerDemandPool: 80,
						playerShare: 2 / 3,
						playerShareDelta: null,
						playerAttractionScore: 100,
						competitors: [
							{
								competitorId: closedCompetitor.id,
								share: 1 / 3,
								attractionScore: 50,
								eventMultiplier: 1
							}
						]
					}
				]
			});

			expectHistoricalReportPreserved(() =>
				decodeHistoricalReport({ ...closedGame, reports: [] }, report)
			);
		});

		test.each([
			['missing', undefined],
			['unknown', 'not-a-brand'],
			['unsupported', 'fresh-field']
		] as const)('rejects a %s product brand', (_label, brandId) => {
			const game = createGame();
			const product = game.stores[0]!.products[0]!;
			const malformed = {
				...game,
				stores: [
					{
						...game.stores[0]!,
						products: [{ ...product, brandId }]
					}
				]
			} as unknown as GameState;

			expect(() => validateCurrentGameState(malformed)).toThrow(SaveDataError);
		});

		test.each(['policyOverrides', 'managerDelegations', 'managerActionHistory'])(
			'rejects a game missing %s',
			(field) => {
				const game = { ...createGame() } as Record<string, unknown>;
				delete game[field];

				const record = createManualSaveRecord();
				record.game = game as unknown as GameState;
				expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			}
		);

		test('rejects duplicate and invalid live policy override scopes', () => {
			const duplicate = createGame({
				policyOverrides: [
					{ scope: { kind: 'city', cityId: 'harbor-city' }, values: { pricing: 'premium' } },
					{ scope: { kind: 'city', cityId: 'harbor-city' }, values: { service: 'highTouch' } }
				]
			});
			const invalid = createGame({
				policyOverrides: [
					{ scope: { kind: 'store', storeId: 'missing-store' }, values: { pricing: 'premium' } }
				]
			});

			expect(() => validateSaveRecord(createManualSaveRecord({ game: duplicate }))).toThrow(
				SaveDataError
			);
			expect(() => validateSaveRecord(createManualSaveRecord({ game: invalid }))).toThrow(
				SaveDataError
			);
		});

		test.each([{}, { pricing: 'surge' }, { pricing: 'standard', unknown: 'value' }])(
			'rejects empty or invalid policy override values: %j',
			(values) => {
				const game = createGame({
					policyOverrides: [
						{
							scope: { kind: 'city', cityId: 'harbor-city' },
							values
						} as GameState['policyOverrides'][number]
					]
				});

				expect(() => validateSaveRecord(createManualSaveRecord({ game }))).toThrow(SaveDataError);
			}
		);

		test('rejects invalid manager roles, scopes, and playbook constraints', () => {
			const base = createGame({ staff: [createFixtureManager()] });
			const invalidRole = createGame({
				staff: [{ ...createFixtureManager(), role: 'general' }],
				managerDelegations: [createFixtureDelegation()]
			});
			const invalidScope = {
				...base,
				managerDelegations: [
					createFixtureDelegation({
						scope: { kind: 'city', cityId: 'missing-city' as WorldCityId }
					})
				]
			};
			const invalidPlaybookScope = {
				...base,
				managerDelegations: [createFixtureDelegation({ playbook: 'prefer-local-supply' })]
			};

			expect(() => validateSaveRecord(createManualSaveRecord({ game: invalidRole }))).toThrow(
				SaveDataError
			);
			expect(() => validateSaveRecord(createManualSaveRecord({ game: invalidScope }))).toThrow(
				SaveDataError
			);
			expect(() =>
				validateSaveRecord(createManualSaveRecord({ game: invalidPlaybookScope }))
			).toThrow(SaveDataError);
		});

		test('rejects duplicate live manager delegations', () => {
			const game = createGame({
				staff: [createFixtureManager()],
				managerDelegations: [createFixtureDelegation(), createFixtureDelegation()]
			});

			expect(() => validateSaveRecord(createManualSaveRecord({ game }))).toThrow(SaveDataError);
		});

		test('rejects malformed or oversized manager history', () => {
			const oversized = createGame({
				managerActionHistory: Array.from({ length: MANAGER_ACTION_HISTORY_LIMIT + 1 }, (_, index) =>
					createFixtureHistory({ id: `history-${index}` })
				)
			});
			const invalidOutcome = createGame({
				managerActionHistory: [{ ...createFixtureHistory(), outcome: 'unknown' as never }]
			});
			const invalidChange = createGame({
				managerActionHistory: [
					{
						...createFixtureHistory(),
						change: { ...createFixtureHistory().change, kind: 'unknown' as never }
					}
				]
			});
			const unsafeNumeric = createGame({
				managerActionHistory: [createFixtureHistory({ day: Number.MAX_SAFE_INTEGER + 1 })]
			});
			const duplicateIds = createGame({
				managerActionHistory: [createFixtureHistory(), createFixtureHistory()]
			});
			const futureDay = createGame({
				managerActionHistory: [createFixtureHistory({ day: 4 })]
			});

			expect(() => validateSaveRecord(createManualSaveRecord({ game: oversized }))).toThrow(
				SaveDataError
			);
			expect(() => validateSaveRecord(createManualSaveRecord({ game: invalidOutcome }))).toThrow(
				SaveDataError
			);
			expect(() => validateSaveRecord(createManualSaveRecord({ game: invalidChange }))).toThrow(
				SaveDataError
			);
			expect(() => validateSaveRecord(createManualSaveRecord({ game: unsafeNumeric }))).toThrow(
				SaveDataError
			);
			expect(() => validateSaveRecord(createManualSaveRecord({ game: duplicateIds }))).toThrow(
				SaveDataError
			);
			expect(() => validateSaveRecord(createManualSaveRecord({ game: futureDay }))).toThrow(
				SaveDataError
			);
		});

		test('rejects applied manager history without an applied change', () => {
			const game = createGame({
				managerActionHistory: [
					createFixtureHistory({
						change: { ...createFixtureHistory().change, applied: null }
					})
				]
			});

			expect(() => validateSaveRecord(createManualSaveRecord({ game }))).toThrow(SaveDataError);
		});

		test('rejects non-applied manager history with an applied change', () => {
			const game = createGame({
				managerActionHistory: [createFixtureHistory({ outcome: 'overridden' })]
			});

			expect(() => validateSaveRecord(createManualSaveRecord({ game }))).toThrow(SaveDataError);
		});

		test('normalizes valid persisted arrays without rejecting their input order', () => {
			const game = createGame({
				staff: [createFixtureManager('manager-z'), createFixtureManager('manager-a')],
				policyOverrides: [
					{ scope: { kind: 'store', storeId: 'store-1' }, values: { pricing: 'premium' } },
					{ scope: { kind: 'city', cityId: 'harbor-city' }, values: { service: 'highTouch' } }
				],
				managerDelegations: [
					createFixtureDelegation({ managerId: 'manager-z' }),
					createFixtureDelegation({ managerId: 'manager-a' })
				],
				managerActionHistory: [
					createFixtureHistory({ id: 'history-z', day: 3 }),
					createFixtureHistory({ id: 'history-b', day: 2 }),
					createFixtureHistory({ id: 'history-a', day: 2 })
				]
			});

			const decoded = validateSaveRecord(createManualSaveRecord({ game }));

			expect(decoded.game.policyOverrides.map((entry) => entry.scope)).toEqual([
				{ kind: 'city', cityId: 'harbor-city' },
				{ kind: 'store', storeId: 'store-1' }
			]);
			expect(decoded.game.managerDelegations.map((entry) => entry.managerId)).toEqual([
				'manager-a',
				'manager-z'
			]);
			expect(decoded.game.managerActionHistory.map((entry) => [entry.day, entry.id])).toEqual([
				[2, 'history-a'],
				[2, 'history-b'],
				[3, 'history-z']
			]);
		});

		test('accepts historical references and opaque unique action IDs', () => {
			const history = createFixtureHistory({
				id: 'legacy-row-from-an-old-client',
				managerId: 'deleted-manager',
				scope: { kind: 'store', storeId: 'deleted-store' },
				outcome: 'rejected',
				change: {
					kind: 'inventory-targets',
					storeId: 'deleted-store',
					productId: 'deleted-product' as ProductId,
					before: { reorderThreshold: 2, targetStock: 5 },
					proposed: { reorderThreshold: 3, targetStock: 6 },
					applied: null
				}
			});

			const decoded = validateSaveRecord(
				createManualSaveRecord({ game: createGame({ managerActionHistory: [history] }) })
			);

			expect(decoded.game.managerActionHistory[0]).toMatchObject({
				id: 'legacy-row-from-an-old-client',
				managerId: 'deleted-manager',
				scope: { kind: 'store', storeId: 'deleted-store' },
				change: { productId: 'deleted-product' }
			});
		});

		test('accepts an applied inventory-targets change with valid applied targets', () => {
			const history = createFixtureHistory({
				outcome: 'applied',
				change: {
					kind: 'inventory-targets',
					storeId: 'store-1',
					productId: 'bottled-water' as ProductId,
					before: { reorderThreshold: 2, targetStock: 5 },
					proposed: { reorderThreshold: 3, targetStock: 6 },
					applied: { reorderThreshold: 3, targetStock: 6 }
				}
			});

			const decoded = validateSaveRecord(
				createManualSaveRecord({ game: createGame({ managerActionHistory: [history] }) })
			);

			expect(decoded.game.managerActionHistory[0]?.change.kind).toBe('inventory-targets');
		});

		test('accepts an applied staffing-policy change', () => {
			const history = createFixtureHistory({
				outcome: 'applied',
				change: {
					kind: 'staffing-policy',
					storeId: 'store-1',
					before: 'efficient',
					proposed: 'service',
					applied: 'service'
				}
			});

			const decoded = validateSaveRecord(
				createManualSaveRecord({ game: createGame({ managerActionHistory: [history] }) })
			);

			expect(decoded.game.managerActionHistory[0]?.change.kind).toBe('staffing-policy');
		});

		test('accepts an applied supply-source change', () => {
			const history = createFixtureHistory({
				outcome: 'applied',
				change: {
					kind: 'supply-source',
					retailCityId: 'harbor-city',
					before: 'industry-city',
					proposed: 'breadbasket-basin',
					applied: 'breadbasket-basin'
				}
			});

			const decoded = validateSaveRecord(
				createManualSaveRecord({ game: createGame({ managerActionHistory: [history] }) })
			);

			expect(decoded.game.managerActionHistory[0]?.change.kind).toBe('supply-source');
		});

		test('accepts a supply-source change with null before and applied', () => {
			const history = createFixtureHistory({
				outcome: 'rejected',
				change: {
					kind: 'supply-source',
					retailCityId: 'harbor-city',
					before: null,
					proposed: 'industry-city',
					applied: null
				}
			});

			const decoded = validateSaveRecord(
				createManualSaveRecord({ game: createGame({ managerActionHistory: [history] }) })
			);

			expect(decoded.game.managerActionHistory[0]?.change.kind).toBe('supply-source');
		});

		test('rejects inventory-targets with a negative reorderThreshold', () => {
			const history = createFixtureHistory({
				outcome: 'rejected',
				change: {
					kind: 'inventory-targets',
					storeId: 'store-1',
					productId: 'bottled-water' as ProductId,
					before: { reorderThreshold: -1, targetStock: 5 },
					proposed: { reorderThreshold: 2, targetStock: 5 },
					applied: null
				}
			});

			expect(() =>
				validateSaveRecord(
					createManualSaveRecord({ game: createGame({ managerActionHistory: [history] }) })
				)
			).toThrow(SaveDataError);
		});

		test('rejects inventory-targets where targetStock does not cover reorderThreshold', () => {
			const history = createFixtureHistory({
				outcome: 'rejected',
				change: {
					kind: 'inventory-targets',
					storeId: 'store-1',
					productId: 'bottled-water' as ProductId,
					before: { reorderThreshold: 5, targetStock: 3 },
					proposed: { reorderThreshold: 2, targetStock: 5 },
					applied: null
				}
			});

			expect(() =>
				validateSaveRecord(
					createManualSaveRecord({ game: createGame({ managerActionHistory: [history] }) })
				)
			).toThrow(SaveDataError);
		});

		test('normalizes policy overrides sorted by city before store', () => {
			const game = createGame({
				policyOverrides: [
					{ scope: { kind: 'store', storeId: 'store-1' }, values: { pricing: 'premium' } },
					{ scope: { kind: 'city', cityId: 'harbor-city' }, values: { pricing: 'premium' } }
				]
			});

			const decoded = validateSaveRecord(createManualSaveRecord({ game }));

			expect(decoded.game.policyOverrides.map((entry) => entry.scope)).toEqual([
				{ kind: 'city', cityId: 'harbor-city' },
				{ kind: 'store', storeId: 'store-1' }
			]);
		});

		test('sorts two city-scope policy overrides by world city id', () => {
			const base = createCurrentMultiCityGame();
			const game: GameState = {
				...base,
				policyOverrides: [
					{
						scope: { kind: 'city', cityId: 'campus-junction' },
						values: { pricing: 'premium' }
					},
					{
						scope: { kind: 'city', cityId: 'harbor-city' },
						values: { pricing: 'discount' }
					}
				]
			};

			const decoded = validateSaveRecord(createManualSaveRecord({ game }));

			expect(decoded.game.policyOverrides.map((entry) => entry.scope)).toEqual([
				{ kind: 'city', cityId: 'harbor-city' },
				{ kind: 'city', cityId: 'campus-junction' }
			]);
		});

		test('sorts two store-scope policy overrides by store id', () => {
			const game = createGameWithTwoStores({
				policyOverrides: [
					{ scope: { kind: 'store', storeId: 'store-2' }, values: { pricing: 'premium' } },
					{ scope: { kind: 'store', storeId: 'store-1' }, values: { pricing: 'discount' } }
				]
			});

			const decoded = validateSaveRecord(createManualSaveRecord({ game }));

			expect(decoded.game.policyOverrides.map((entry) => entry.scope)).toEqual([
				{ kind: 'store', storeId: 'store-1' },
				{ kind: 'store', storeId: 'store-2' }
			]);
		});

		test('rejects inventory-targets with an unsafe reorderThreshold', () => {
			const history = createFixtureHistory({
				outcome: 'rejected',
				change: {
					kind: 'inventory-targets',
					storeId: 'store-1',
					productId: 'bottled-water' as ProductId,
					before: {
						reorderThreshold: Number.MAX_SAFE_INTEGER + 1,
						targetStock: Number.MAX_SAFE_INTEGER + 2
					},
					proposed: { reorderThreshold: 2, targetStock: 5 },
					applied: null
				}
			});

			expect(() =>
				validateSaveRecord(
					createManualSaveRecord({ game: createGame({ managerActionHistory: [history] }) })
				)
			).toThrow(SaveDataError);
		});
		test('normalizes policy overrides already sorted city before store', () => {
			const game = createGame({
				policyOverrides: [
					{ scope: { kind: 'city', cityId: 'harbor-city' }, values: { pricing: 'premium' } },
					{ scope: { kind: 'store', storeId: 'store-1' }, values: { pricing: 'discount' } }
				]
			});

			const decoded = validateSaveRecord(createManualSaveRecord({ game }));

			expect(decoded.game.policyOverrides.map((entry) => entry.scope)).toEqual([
				{ kind: 'city', cityId: 'harbor-city' },
				{ kind: 'store', storeId: 'store-1' }
			]);
		});

		test('accepts a city-scope historical manager action record', () => {
			const history = createFixtureHistory({
				scope: { kind: 'city', cityId: 'harbor-city' }
			});

			const decoded = validateSaveRecord(
				createManualSaveRecord({ game: createGame({ managerActionHistory: [history] }) })
			);

			expect(decoded.game.managerActionHistory[0]?.scope).toEqual({
				kind: 'city',
				cityId: 'harbor-city'
			});
		});

		test('accepts a rejected staffing-policy change with null applied', () => {
			const history = createFixtureHistory({
				outcome: 'rejected',
				change: {
					kind: 'staffing-policy',
					storeId: 'store-1',
					before: 'efficient',
					proposed: 'service',
					applied: null
				}
			});

			const decoded = validateSaveRecord(
				createManualSaveRecord({ game: createGame({ managerActionHistory: [history] }) })
			);

			expect(decoded.game.managerActionHistory[0]?.change.kind).toBe('staffing-policy');
			expect(decoded.game.managerActionHistory[0]?.change.applied).toBe(null);
		});

		test('normalizes manager action history already sorted by day ascending', () => {
			const game = createGame({
				managerActionHistory: [
					createFixtureHistory({ id: 'history-a', day: 1 }),
					createFixtureHistory({ id: 'history-b', day: 2 }),
					createFixtureHistory({ id: 'history-c', day: 3 })
				]
			});

			const decoded = validateSaveRecord(createManualSaveRecord({ game }));

			expect(decoded.game.managerActionHistory.map((entry) => entry.id)).toEqual([
				'history-a',
				'history-b',
				'history-c'
			]);
		});
	});

	test('round-trips a current v15 multi-city save with city-scoped inventory and replenishment evidence', () => {
		expect.assertions(8);
		const baseGame = createCurrentMultiCityGame();
		const game = withCurrentReports(baseGame, [createCurrentReport(baseGame)]);
		const record = createManualSaveRecord({
			game
		});

		const validated = validateSaveRecord(structuredClone(record));
		const report = validated.game.reports[0]!;

		expect(SAVE_SCHEMA_VERSION).toBe(19);
		expect(validated.schemaVersion).toBe(19);
		expect(validated.game.cityInventories).toEqual([
			{
				cityId: 'industry-city',
				materials: { water: 5 }
			},
			{
				cityId: 'breadbasket-basin',
				materials: { grain: 2 }
			}
		]);
		expect(validated.game.retailSupplyAssignments).toEqual([
			{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
			{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
		]);
		expect(report.productionReport.cityInventories).toEqual([
			{ cityId: 'industry-city', capacity: 200, used: 5, overflowUnits: 0, overflowCost: 0 },
			{ cityId: 'breadbasket-basin', capacity: 0, used: 2, overflowUnits: 2, overflowCost: 4 }
		]);
		expect(report.productionReport.produced[0]).toMatchObject({ cityId: 'industry-city' });
		expect(report.productionReport.railShipments[0]).toMatchObject({ cityId: 'industry-city' });
		expect(report.storeReports[0]).toMatchObject({
			replenishment: {
				retailCityId: 'harbor-city',
				configuredSupplyCityId: 'industry-city',
				resolvedSupplyCityId: 'industry-city'
			}
		});
	});

	test('round-trips immutable logistics evidence without replaying removed routes or orders', () => {
		const game = createCurrentMultiCityGame();
		const report = createDailyReport({ logistics: createHistoricalLogisticsReport() });

		const decoded = decodeHistoricalReport(game, report);

		expect(decoded.reports[0]).toEqual(report);
		expect(decoded.logistics.transferOrders).toEqual([]);
		expect(decoded.logistics.recurringRoutes).toEqual([]);
	});

	test.each([
		[
			'a nonpositive arrival quantity',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					arrivals: [{ ...report.logistics.arrivals[0]!, quantity: 0 }],
					deliveredUnits: 0
				}
			})
		],
		[
			'an empty arrival transfer ID',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					arrivals: [{ ...report.logistics.arrivals[0]!, transferOrderId: '' }]
				}
			})
		],
		[
			'a matching attempt endpoint',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{
							...report.logistics.routeDispatchAttempts[0]!,
							destinationCityId: 'industry-city'
						},
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'an unknown attempt material',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{
							...report.logistics.routeDispatchAttempts[0]!,
							materialId: 'unknown-material'
						},
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'an attempt with an incorrect unused capacity',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{
							...report.logistics.routeDispatchAttempts[0]!,
							unusedCapacity: 4
						},
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'an attempt with an incorrect unmet destination need',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{
							...report.logistics.routeDispatchAttempts[0]!,
							unmetDestinationNeed: 4
						},
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'a positive dispatch with a null transfer order',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{
							...report.logistics.routeDispatchAttempts[0]!,
							transferOrderId: null
						},
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'a zero dispatch with a transport cost',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						report.logistics.routeDispatchAttempts[0]!,
						{
							...report.logistics.routeDispatchAttempts[1]!,
							transportCost: 1
						}
					]
				}
			})
		],
		[
			'a delivered-unit total that does not match arrivals',
			(report: DailyReport) => ({
				...report,
				logistics: { ...report.logistics, deliveredUnits: 5 }
			})
		],
		[
			'a scheduled-cost total that does not match attempts',
			(report: DailyReport) => ({
				...report,
				logistics: { ...report.logistics, scheduledTransportCost: 22 }
			})
		],
		[
			'a duplicate arrival transferOrderId',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					arrivals: [
						report.logistics.arrivals[0]!,
						{
							transferOrderId: report.logistics.arrivals[0]!.transferOrderId,
							originCityId: 'breadbasket-basin',
							destinationCityId: 'industry-city',
							materialId: 'grain',
							quantity: 2
						}
					],
					deliveredUnits: report.logistics.deliveredUnits + 2
				}
			})
		],
		[
			'a duplicate route dispatch routeId',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						report.logistics.routeDispatchAttempts[0]!,
						{
							...report.logistics.routeDispatchAttempts[0]!,
							dispatchedQuantity: 0,
							unusedCapacity: 10,
							unmetDestinationNeed: 10,
							transportCost: 0,
							transferOrderId: null
						}
					]
				}
			})
		],
		[
			'a duplicate route dispatch transferOrderId',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						report.logistics.routeDispatchAttempts[0]!,
						{
							...report.logistics.routeDispatchAttempts[0]!,
							routeId: 'route-other',
							dispatchedQuantity: 5,
							unusedCapacity: 5,
							unmetDestinationNeed: 5,
							transportCost: 10
						}
					],
					scheduledTransportCost: report.logistics.scheduledTransportCost + 10
				}
			})
		],
		[
			'a matching arrival endpoint',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					arrivals: [{ ...report.logistics.arrivals[0]!, originCityId: 'breadbasket-basin' }]
				}
			})
		],
		[
			'a dispatch quantity exceeding destination need',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{ ...report.logistics.routeDispatchAttempts[0]!, destinationNeed: 5 },
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'a dispatch quantity exceeding capacity',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{ ...report.logistics.routeDispatchAttempts[0]!, capacity: 5, unusedCapacity: 0 },
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'a dispatch quantity exceeding available origin stock',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{
							...report.logistics.routeDispatchAttempts[0]!,
							availableOriginStock: 5
						},
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'a positive dispatch with zero transport cost',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{ ...report.logistics.routeDispatchAttempts[0]!, transportCost: 0 },
						report.logistics.routeDispatchAttempts[1]!
					],
					scheduledTransportCost: 0
				}
			})
		],
		[
			'a negative attempt destination need',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{ ...report.logistics.routeDispatchAttempts[0]!, destinationNeed: -1 },
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'arrival quantities that exceed the safe integer range',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					arrivals: [
						{ ...report.logistics.arrivals[0]!, quantity: Number.MAX_SAFE_INTEGER },
						{
							transferOrderId: 'transfer-overflow',
							originCityId: 'breadbasket-basin',
							destinationCityId: 'industry-city',
							materialId: 'grain',
							quantity: Number.MAX_SAFE_INTEGER
						}
					],
					deliveredUnits: Number.MAX_SAFE_INTEGER
				}
			})
		],
		[
			'a suspended dispatch with a nonzero quantity',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{
							...report.logistics.routeDispatchAttempts[0]!,
							dispatchSuspended: true
						},
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'an attempt with a nonpositive baseline capacity',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{
							...report.logistics.routeDispatchAttempts[0]!,
							baselineCapacity: 0
						},
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'an attempt with an unsorted modifier contributor list',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{
							...report.logistics.routeDispatchAttempts[0]!,
							modifierImpacts: [
								{
									contributors: [
										{
											modifierId: 'event-modifier-2',
											source: {
												eventId: 'freight-disruption',
												instanceId: 'event-instance-1',
												optionId: 'accept-delay'
											},
											explanation: {
												key: 'events.freightDisruption.acceptDelay.capacity',
												params: {}
											}
										},
										{
											modifierId: 'event-modifier-1',
											source: {
												eventId: 'freight-disruption',
												instanceId: 'event-instance-1',
												optionId: 'accept-delay'
											},
											explanation: {
												key: 'events.freightDisruption.acceptDelay.capacity',
												params: {}
											}
										}
									],
									effectKind: 'route-capacity-multiplier',
									baselineCapacity: 10,
									effectiveCapacity: 8,
									baselineDispatchedQuantity: 7,
									effectiveDispatchedQuantity: 6
								}
							]
						},
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'a suspension impact with a nonzero effective quantity',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{
							...report.logistics.routeDispatchAttempts[0]!,
							dispatchSuspended: true,
							dispatchedQuantity: 0,
							unusedCapacity: 10,
							unmetDestinationNeed: 10,
							transportCost: 0,
							transferOrderId: null,
							modifierImpacts: [
								{
									contributors: [
										{
											modifierId: 'event-modifier-1',
											source: {
												eventId: 'freight-disruption',
												instanceId: 'event-instance-1',
												optionId: 'suspend-shipments'
											},
											explanation: {
												key: 'events.freightDisruption.suspendShipments.suspension',
												params: {}
											}
										}
									],
									effectKind: 'route-dispatch-suspension',
									baselineDispatchedQuantity: 7,
									effectiveDispatchedQuantity: 1
								}
							]
						},
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'a recovery row with an unknown effect kind',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					modifierRecoveries: [
						{
							routeId: 'route-retired',
							modifierId: 'event-modifier-1',
							source: {
								eventId: 'freight-disruption',
								instanceId: 'event-instance-1',
								optionId: 'accept-delay'
							},
							effectKind: 'route-unknown-effect',
							disruptedCapacity: 10,
							recoveredCapacity: 12
						}
					]
				}
			})
		],
		[
			'a suspension recovery row with a false disrupted flag',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					modifierRecoveries: [
						{
							routeId: 'route-retired',
							modifierId: 'event-modifier-1',
							source: {
								eventId: 'freight-disruption',
								instanceId: 'event-instance-1',
								optionId: 'suspend-shipments'
							},
							effectKind: 'route-dispatch-suspension',
							disruptedSuspended: false,
							recoveredSuspended: false
						}
					]
				}
			})
		],
		[
			'a lead-time recovery row with a nonpositive disrupted lead time',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					modifierRecoveries: [
						{
							routeId: 'route-retired',
							modifierId: 'event-modifier-1',
							source: {
								eventId: 'freight-disruption',
								instanceId: 'event-instance-1',
								optionId: 'accept-delay'
							},
							effectKind: 'route-lead-time-adjustment',
							disruptedLeadTimeDays: 0,
							recoveredLeadTimeDays: 2
						}
					]
				}
			})
		],
		[
			'duplicate modifier recovery rows for the same route, modifier, and effect',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					modifierRecoveries: [
						{
							routeId: 'route-retired',
							modifierId: 'event-modifier-1',
							source: {
								eventId: 'freight-disruption',
								instanceId: 'event-instance-1',
								optionId: 'accept-delay'
							},
							effectKind: 'route-capacity-multiplier',
							disruptedCapacity: 10,
							recoveredCapacity: 12
						},
						{
							routeId: 'route-retired',
							modifierId: 'event-modifier-1',
							source: {
								eventId: 'freight-disruption',
								instanceId: 'event-instance-1',
								optionId: 'accept-delay'
							},
							effectKind: 'route-capacity-multiplier',
							disruptedCapacity: 10,
							recoveredCapacity: 12
						}
					]
				}
			})
		],
		[
			'a dispatch impact with a duplicate effect kind',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{
							...report.logistics.routeDispatchAttempts[0]!,
							modifierImpacts: [
								{
									contributors: [
										{
											modifierId: 'event-modifier-1',
											source: {
												eventId: 'freight-disruption',
												instanceId: 'event-instance-1',
												optionId: 'accept-delay'
											},
											explanation: {
												key: 'events.freightDisruption.acceptDelay.capacity',
												params: {}
											}
										}
									],
									effectKind: 'route-capacity-multiplier',
									baselineCapacity: 10,
									effectiveCapacity: 8,
									baselineDispatchedQuantity: 7,
									effectiveDispatchedQuantity: 6
								},
								{
									contributors: [
										{
											modifierId: 'event-modifier-2',
											source: {
												eventId: 'freight-disruption',
												instanceId: 'event-instance-1',
												optionId: 'accept-delay'
											},
											explanation: {
												key: 'events.freightDisruption.acceptDelay.capacity',
												params: {}
											}
										}
									],
									effectKind: 'route-capacity-multiplier',
									baselineCapacity: 10,
									effectiveCapacity: 9,
									baselineDispatchedQuantity: 7,
									effectiveDispatchedQuantity: 7
								}
							]
						},
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'a dispatch impact with empty contributors',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{
							...report.logistics.routeDispatchAttempts[0]!,
							modifierImpacts: [
								{
									contributors: [],
									effectKind: 'route-lead-time-adjustment',
									baselineLeadTimeDays: 2,
									effectiveLeadTimeDays: 3
								}
							]
						},
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'a dispatch impact with a duplicate contributor modifier id',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					routeDispatchAttempts: [
						{
							...report.logistics.routeDispatchAttempts[0]!,
							modifierImpacts: [
								{
									contributors: [
										{
											modifierId: 'event-modifier-1',
											source: {
												eventId: 'freight-disruption',
												instanceId: 'event-instance-1',
												optionId: 'accept-delay'
											},
											explanation: {
												key: 'events.freightDisruption.acceptDelay.capacity',
												params: {}
											}
										},
										{
											modifierId: 'event-modifier-1',
											source: {
												eventId: 'freight-disruption',
												instanceId: 'event-instance-1',
												optionId: 'accept-delay'
											},
											explanation: {
												key: 'events.freightDisruption.acceptDelay.capacity',
												params: {}
											}
										}
									],
									effectKind: 'route-capacity-multiplier',
									baselineCapacity: 10,
									effectiveCapacity: 8,
									baselineDispatchedQuantity: 7,
									effectiveDispatchedQuantity: 6
								}
							]
						},
						report.logistics.routeDispatchAttempts[1]!
					]
				}
			})
		],
		[
			'a suspension recovery row with a true recovered flag',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					modifierRecoveries: [
						{
							routeId: 'route-retired',
							modifierId: 'event-modifier-1',
							source: {
								eventId: 'freight-disruption',
								instanceId: 'event-instance-1',
								optionId: 'suspend-shipments'
							},
							effectKind: 'route-dispatch-suspension',
							disruptedSuspended: true,
							recoveredSuspended: true
						}
					]
				}
			})
		],
		[
			'a transport-cost recovery row with a negative disrupted cost',
			(report: DailyReport) => ({
				...report,
				logistics: {
					...report.logistics,
					modifierRecoveries: [
						{
							routeId: 'route-retired',
							modifierId: 'event-modifier-1',
							source: {
								eventId: 'freight-disruption',
								instanceId: 'event-instance-1',
								optionId: 'accept-delay'
							},
							effectKind: 'route-transport-cost-multiplier',
							disruptedTransportCostPerUnit: -1,
							recoveredTransportCostPerUnit: 2
						}
					]
				}
			})
		]
	] as const)('drops a historical report with %s logistics evidence', (_name, mutateReport) => {
		const game = createCurrentMultiCityGame();
		const report = mutateReport(
			createDailyReport({ logistics: createHistoricalLogisticsReport() })
		) as DailyReport;

		expectHistoricalReportDropped(() => decodeHistoricalReport(game, report));
	});

	test('round-trips a historical report with valid route dispatch modifier impacts and recoveries', () => {
		const game = createCurrentMultiCityGame();
		const report = createDailyReport({ logistics: createLogisticsReportWithModifierEvidence() });

		const decoded = expectHistoricalReportPreserved(() => decodeHistoricalReport(game, report));

		expect(decoded.reports[0]).toEqual(report);
	});

	test('rejects a saved decision whose import-cost multiplier template is not positive', () => {
		const game = createCompleteEventGame();
		const decision = game.decisions.find((candidate) => candidate.kind === 'event')!;
		const eventDecision = decision as Extract<typeof decision, { kind: 'event' }>;
		const option = eventDecision.options[0]!;
		const modifier = option.modifiers[0]!;
		const mutated: GameState = {
			...game,
			decisions: [
				{
					...decision,
					options: [
						{
							...option,
							modifiers: [
								{
									...modifier,
									effect: {
										kind: 'import-cost-multiplier',
										scope: 'retail-product',
										target: { kind: 'all' },
										multiplier: 0
									}
								}
							]
						}
					]
				}
			]
		};

		expectGameStateErrorCode(
			mutated,
			'invariant-event-runtime',
			'must be a positive finite number'
		);
	});

	test('normalizes authoritative inventory and supply assignments to world-catalog order', () => {
		const game = createCurrentMultiCityGame();
		const validated = validateSaveRecord(
			createManualSaveRecord({
				game: {
					...game,
					cityInventories: [...game.cityInventories].reverse(),
					retailSupplyAssignments: [...game.retailSupplyAssignments].reverse()
				}
			})
		);

		expect(validated.game.cityInventories).toEqual(game.cityInventories);
		expect(validated.game.retailSupplyAssignments).toEqual(game.retailSupplyAssignments);
	});

	test('rejects an assignment whose supply source is not a current industry inventory', () => {
		const game = createGame({
			retailSupplyAssignments: [{ retailCityId: 'harbor-city', supplyCityId: 'quarry-works' }]
		});

		expectSaveRecordErrorCode(createManualSaveRecord({ game }), 'invariant-retail-supply');
	});

	test('drops malformed historical reports independently and preserves the surviving order', () => {
		const goodReport = createDailyReport({ day: 2 });
		const game = withCurrentReports(createGame(), [goodReport]);
		const malformedFirstReport = { ...goodReport, cashAfter: Number.NaN };
		const malformedLastReport = {
			...goodReport,
			day: 3,
			productionReport: {
				...goodReport.productionReport,
				railUsage: { 'industry-city': -1 }
			}
		};
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		try {
			const validated = validateSaveRecord(
				createManualSaveRecord({
					game: {
						...game,
						reports: [malformedFirstReport, goodReport, malformedLastReport]
					}
				})
			);

			expect(validated.game.reports).toEqual([goodReport]);
			expect(warn).toHaveBeenCalledTimes(2);
			expect(warn).toHaveBeenNthCalledWith(1, 'Dropping malformed historical report', {
				index: 0,
				error: expect.any(SaveDataError)
			});
			expect(warn).toHaveBeenNthCalledWith(2, 'Dropping malformed historical report', {
				index: 2,
				error: expect.any(SaveDataError)
			});
		} finally {
			warn.mockRestore();
		}
	});

	test('drops every malformed historical report while leaving the game playable', () => {
		const game = createGame();
		const malformedRevenue = { ...createDailyReport({ day: 1 }), revenue: Number.NaN };
		const malformedProduction = {
			...createDailyReport({ day: 2 }),
			productionReport: {
				...createDailyProductionReport(),
				railUsage: { 'industry-city': -1 }
			}
		};
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		try {
			const validated = validateSaveRecord(
				createManualSaveRecord({
					game: { ...game, reports: [malformedRevenue, malformedProduction] }
				})
			);

			expect(validated.game.reports).toEqual([]);
			expect(simulateDay(validated.game).day).toBe(game.day + 1);
			expect(warn).toHaveBeenCalledTimes(2);
		} finally {
			warn.mockRestore();
		}
	});

	test('still rejects malformed authoritative inventory while filtering historical reports', () => {
		const game = createGame({
			cityInventories: [{ cityId: 'industry-city', materials: { water: -1 } }],
			reports: [{ ...createDailyReport(), revenue: Number.NaN }]
		});

		expectSaveRecordErrorCode(createManualSaveRecord({ game }), 'invariant-city-inventory');
	});

	test('rejects unsupported schema 13 records without inventory migration', () => {
		expect.assertions(2);
		const record = { ...createManualSaveRecord(), schemaVersion: 13 };

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('Unsupported save schema version: 13');
	});

	test('rejects schema 15 records with no migration path', () => {
		expect.assertions(2);
		const record = { ...createManualSaveRecord(), schemaVersion: 15 };

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('Unsupported save schema version: 15');
	});

	test('rejects schema 16 records with no migration path', () => {
		expect.assertions(2);
		const record = { ...createManualSaveRecord(), schemaVersion: 16 };

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('Unsupported save schema version: 16');
	});

	test.each([
		[
			'negative warehouse units hidden by a null no-attempt context',
			(product: Record<string, unknown>) => ({
				...product,
				warehouseUnits: -1,
				warehouseValue: 0,
				importedUnits: 0,
				importSpend: 0
			}),
			null,
			'drop'
		],
		[
			'fractional warehouse units',
			(product: Record<string, unknown>) => ({
				...product,
				warehouseUnits: 0.5,
				warehouseValue: 1,
				importedUnits: 0
			}),
			'unchanged',
			'drop'
		],
		[
			'unsafe warehouse units',
			(product: Record<string, unknown>) => ({
				...product,
				warehouseUnits: Number.MAX_SAFE_INTEGER + 1,
				warehouseValue: 1,
				importedUnits: 0
			}),
			'unchanged',
			'preserve'
		],
		[
			'negative imported units hidden by a null no-attempt context',
			(product: Record<string, unknown>) => ({
				...product,
				warehouseUnits: 0,
				warehouseValue: 0,
				importedUnits: -1,
				importSpend: 0
			}),
			null,
			'drop'
		],
		[
			'fractional imported units',
			(product: Record<string, unknown>) => ({
				...product,
				warehouseUnits: 0,
				warehouseValue: 0,
				importedUnits: 0.5,
				importSpend: 1
			}),
			'unchanged',
			'drop'
		],
		[
			'unsafe imported units',
			(product: Record<string, unknown>) => ({
				...product,
				warehouseUnits: 0,
				warehouseValue: 0,
				importedUnits: Number.MAX_SAFE_INTEGER + 1,
				importSpend: 1
			}),
			'unchanged',
			'preserve'
		],
		[
			'nonzero local units with an impossible warehouse value',
			(product: Record<string, unknown>) => ({ ...product, warehouseValue: 0 }),
			'unchanged',
			'preserve'
		],
		[
			'local units with a mismatched warehouse value',
			(product: Record<string, unknown>) => ({
				...product,
				warehouseUnits: 2,
				warehouseValue: 1,
				importedUnits: 0
			}),
			'unchanged',
			'preserve'
		],
		[
			'warehouse value without local units',
			(product: Record<string, unknown>) => ({
				...product,
				warehouseUnits: 0,
				warehouseValue: 4,
				importedUnits: 2,
				importSpend: 6
			}),
			'unchanged',
			'preserve'
		],
		[
			'negative import spend',
			(product: Record<string, unknown>) => ({ ...product, importSpend: -1 }),
			'unchanged',
			'drop'
		]
	])(
		'controller review: decodes current-v13 replenishment evidence with %s',
		(_name, mutateProduct, replenishment, expectedResult) => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const productReport = mutateProduct(
				storeReport.productReports[0]! as unknown as Record<string, unknown>
			);
			const updatedReport: DailyReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						replenishment: replenishment === null ? null : storeReport.replenishment,
						productReports: [productReport as DailyStoreReport['productReports'][number]]
					}
				]
			};

			const savedGame =
				expectedResult === 'preserve'
					? withCurrentReports(game, [updatedReport])
					: { ...game, reports: [updatedReport] };
			const decode = () => validateSaveRecord(createManualSaveRecord({ game: savedGame })).game;
			if (expectedResult === 'drop') {
				expectHistoricalReportDropped(decode);
			} else {
				expect(expectHistoricalReportPreserved(decode).reports[0]).toEqual(updatedReport);
			}
		}
	);

	test('controller review: preserves an accessible configured source reported as unavailable', () => {
		const game = createCurrentMultiCityGame();
		const report = createCurrentReport(game);
		const storeReport = report.storeReports[0]!;
		const updatedReport: DailyReport = {
			...report,
			storeReports: [
				{
					...storeReport,
					replenishment: {
						...storeReport.replenishment!,
						resolvedSupplyCityId: null
					},
					productReports: [
						{
							...storeReport.productReports[0]!,
							warehouseUnits: 0,
							warehouseValue: 0,
							importedUnits: 2,
							importSpend: 6
						}
					]
				}
			]
		};

		expect(
			expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport)).reports[0]
		).toEqual(updatedReport);
	});

	test.each([
		[
			'a missing current city summary',
			(productionReport: DailyProductionReport) => ({
				...productionReport,
				cityInventories: [productionReport.cityInventories![0]!]
			})
		],
		[
			'an impossible current city summary',
			(productionReport: DailyProductionReport) => ({
				...productionReport,
				cityInventories: productionReport.cityInventories!.map((summary, index) =>
					index === 0 ? { ...summary, used: 6 } : summary
				)
			})
		],
		[
			'aggregate totals that do not reconcile to summaries',
			(productionReport: DailyProductionReport) => ({
				...productionReport,
				warehouseCapacity: 0,
				warehouseUsed: 0,
				overflowUnits: 0,
				overflowCost: 0
			})
		]
	])(
		'controller review: preserves a historical report with %s',
		(_name, mutateProductionReport) => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const updatedReport = {
				...report,
				productionReport: mutateProductionReport(report.productionReport)
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		}
	);

	test('controller review: accepts a starter-only production-close report after another industry city opens', () => {
		const game = createCurrentMultiCityGame();
		const report = createCurrentReport(game);
		const starterSummary = report.productionReport.cityInventories![0]!;
		const historicalReport: DailyReport = {
			...report,
			day: 1,
			productionReport: {
				...report.productionReport,
				cityInventories: [starterSummary],
				warehouseCapacity: starterSummary.capacity,
				warehouseUsed: starterSummary.used,
				overflowUnits: starterSummary.overflowUnits,
				overflowCost: starterSummary.overflowCost
			}
		};

		const validated = validateSaveRecord(
			createManualSaveRecord({ game: withCurrentReports(game, [historicalReport]) })
		);

		expect(validated.game.reports[0]!.productionReport.cityInventories).toEqual([starterSummary]);
	});

	test('controller review: accepts a production-close report with no starter industry-city summary', () => {
		// A scenario may designate any opened industry city as the active
		// supply source and prune the starter `industry-city` inventory during
		// setup. Its first report's production-close snapshot then contains
		// only the non-starter industry city and must round-trip.
		const game = createCurrentBreadbasketOnlyGame();
		const report = createCurrentBreadbasketOnlyReport(game);

		const validated = validateSaveRecord(
			createManualSaveRecord({ game: withCurrentReports(game, [report]) })
		);

		expect(validated.game.reports[0]!.productionReport.cityInventories).toEqual([
			{ cityId: 'breadbasket-basin', capacity: 200, used: 5, overflowUnits: 0, overflowCost: 0 }
		]);
		expect(validated.game.world.openedCityIds).not.toContain('industry-city');
	});

	test('controller review: preserves an empty production-close summary with zero aggregates', () => {
		const game = createCurrentMultiCityGame();
		const report = createCurrentReport(game);
		const updatedReport: DailyReport = {
			...report,
			productionReport: {
				...report.productionReport,
				cityInventories: [],
				warehouseCapacity: 0,
				warehouseUsed: 0,
				overflowUnits: 0,
				overflowCost: 0
			}
		};

		expect(
			expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport)).reports[0]
		).toEqual(updatedReport);
	});

	test('controller review: preserves an unreconciled production-close pressure snapshot', () => {
		const game = createCurrentMultiCityGame();
		const report = createCurrentReport(game);
		const updatedReport: DailyReport = {
			...report,
			productionReport: {
				...report.productionReport,
				cityInventories: report.productionReport.cityInventories.map((summary, index) =>
					index === 0 ? { ...summary, overflowUnits: 1, overflowCost: 2 } : summary
				),
				overflowUnits: 3,
				overflowCost: 6
			}
		};

		expect(
			expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport)).reports[0]
		).toEqual(updatedReport);
	});

	test('controller review: retains canonical city inventories without an aggregate field', () => {
		const game = createCurrentMultiCityGame();
		const validated = validateSaveRecord(createManualSaveRecord({ game }));

		expect(validated.game.cityInventories).toEqual(game.cityInventories);
		expect(validated.game).not.toHaveProperty('warehouse');
	});

	test('controller review: rejects residual global warehouse data on a current v15 save', () => {
		const game = Object.assign(createCurrentMultiCityGame(), {
			warehouse: { materials: {} }
		});

		expectSaveRecordErrorCode(createManualSaveRecord({ game }), 'invariant-city-inventory');
	});

	test('strict validation rejects residual global warehouse data on a current v15 game', () => {
		const game = Object.assign(createCurrentMultiCityGame(), {
			warehouse: { materials: {} }
		});

		expect(() => validateCurrentGameState(game)).toThrow(
			'Saved game must not contain residual global warehouse data'
		);
	});

	test('current schema save records reject residual global warehouse data', () => {
		const game = Object.assign(createCurrentMultiCityGame(), {
			warehouse: { materials: {} }
		});

		expect(() => validateSaveRecord(createManualSaveRecord({ game }))).toThrow(
			'Saved game must not contain residual global warehouse data'
		);
	});

	test('controller review: classifies a safe-per-material but unsafe city-inventory total', () => {
		const game = createCurrentMultiCityGame();
		const cityInventories = game.cityInventories.map((inventory) =>
			inventory.cityId === 'industry-city'
				? {
						...inventory,
						materials: { water: Number.MAX_SAFE_INTEGER, grain: 1 }
					}
				: inventory
		);

		expectSaveRecordErrorCode(
			createManualSaveRecord({
				game: { ...game, cityInventories: cityInventories as GameState['cityInventories'] }
			}),
			'invariant-city-inventory'
		);
	});

	test.each([
		[
			'a string capacity',
			(inventory: Record<string, unknown>) => ({ ...inventory, capacity: '200' })
		],
		[
			'a fractional overflow unit count',
			(inventory: Record<string, unknown>) => ({ ...inventory, overflowUnits: 0.5 })
		],
		[
			'a non-finite overflow cost',
			(inventory: Record<string, unknown>) => ({ ...inventory, overflowCost: Number.NaN })
		],
		[
			'a negative material quantity',
			(inventory: Record<string, unknown>) => ({
				...inventory,
				materials: { water: -1 }
			})
		],
		[
			'a fractional material quantity',
			(inventory: Record<string, unknown>) => ({
				...inventory,
				materials: { water: 0.5 }
			})
		],
		[
			'an unsafe material quantity',
			(inventory: Record<string, unknown>) => ({
				...inventory,
				materials: { water: Number.MAX_SAFE_INTEGER + 1 }
			})
		],
		[
			'a non-finite material quantity',
			(inventory: Record<string, unknown>) => ({
				...inventory,
				materials: { water: Number.POSITIVE_INFINITY }
			})
		]
	])('rejects a current v15 city inventory with %s', (_name, mutateInventory) => {
		const game = createCurrentMultiCityGame();
		const cityInventories = [
			mutateInventory({ ...game.cityInventories![0]! }),
			...game.cityInventories!.slice(1)
		];

		expectSaveRecordErrorCode(
			createManualSaveRecord({
				game: { ...game, cityInventories: cityInventories as GameState['cityInventories'] }
			}),
			'invariant-city-inventory'
		);
	});

	test.each([
		[
			'duplicate inventory owners',
			(game: GameState) => [...game.cityInventories!, structuredClone(game.cityInventories![0]!)]
		],
		['a missing opened industry inventory', (game: GameState) => [game.cityInventories![0]!]],
		[
			'a retail inventory owner',
			(game: GameState) => [
				{ ...game.cityInventories![0]!, cityId: 'harbor-city' },
				game.cityInventories![1]!
			]
		],
		[
			'a closed inventory owner',
			(game: GameState) => [
				{ ...game.cityInventories![0]!, cityId: 'quarry-works' },
				game.cityInventories![1]!
			]
		]
	])('rejects a current v15 state with %s', (_name, cityInventoriesFor) => {
		const game = createCurrentMultiCityGame();

		expectSaveRecordErrorCode(
			createManualSaveRecord({
				game: {
					...game,
					cityInventories: cityInventoriesFor(game) as GameState['cityInventories']
				}
			}),
			'invariant-city-inventory'
		);
	});

	test.each([
		[
			'duplicate retail assignment owners',
			(game: GameState) => [
				...game.retailSupplyAssignments!,
				structuredClone(game.retailSupplyAssignments![0]!)
			]
		],
		[
			'a missing opened retail assignment',
			(game: GameState) => [game.retailSupplyAssignments![0]!]
		],
		[
			'an industrial assignment owner',
			(game: GameState) => [
				{ ...game.retailSupplyAssignments![0]!, retailCityId: 'industry-city' },
				game.retailSupplyAssignments![1]!
			]
		],
		[
			'a closed retail assignment owner',
			(game: GameState) => [
				{ ...game.retailSupplyAssignments![0]!, retailCityId: 'garden-borough' },
				game.retailSupplyAssignments![1]!
			]
		],
		[
			'an unknown supply city',
			(game: GameState) => [
				{ ...game.retailSupplyAssignments![0]!, supplyCityId: 'unlisted-city' },
				game.retailSupplyAssignments![1]!
			]
		],
		[
			'a retail supply city',
			(game: GameState) => [
				{ ...game.retailSupplyAssignments![0]!, supplyCityId: 'harbor-city' },
				game.retailSupplyAssignments![1]!
			]
		]
	])('rejects a current v15 state with %s', (_name, assignmentsFor) => {
		const game = createCurrentMultiCityGame();

		expectSaveRecordErrorCode(
			createManualSaveRecord({
				game: {
					...game,
					retailSupplyAssignments: assignmentsFor(game) as GameState['retailSupplyAssignments']
				}
			}),
			'invariant-retail-supply'
		);
	});

	test.each([
		[
			'an unknown store city',
			(game: GameState) => ({
				...game,
				stores: [{ ...game.stores[0]!, cityId: 'unlisted-city' }]
			})
		],
		[
			'an industry store city',
			(game: GameState) => ({
				...game,
				stores: [{ ...game.stores[0]!, cityId: 'industry-city' }]
			})
		],
		[
			'a closed store city',
			(game: GameState) => ({
				...game,
				stores: [{ ...game.stores[0]!, cityId: 'garden-borough' }]
			})
		],
		[
			'an unmaterialized store city',
			(game: GameState) => ({
				...game,
				cities: game.cities.filter((city) => city.id !== 'campus-junction'),
				activeCityId: 'harbor-city',
				stores: [{ ...game.stores[0]!, cityId: 'campus-junction' }]
			})
		],
		[
			'an unknown industrial-building city',
			(game: GameState) => ({
				...game,
				industrialBuildings: [{ ...game.industrialBuildings[0]!, cityId: 'unlisted-city' }]
			})
		],
		[
			'a retail industrial-building city',
			(game: GameState) => ({
				...game,
				industrialBuildings: [{ ...game.industrialBuildings[0]!, cityId: 'harbor-city' }]
			})
		],
		[
			'a closed industrial-building city',
			(game: GameState) => ({
				...game,
				industrialBuildings: [{ ...game.industrialBuildings[0]!, cityId: 'quarry-works' }]
			})
		],
		[
			'an unmaterialized industrial-building city',
			(game: GameState) => ({
				...game,
				industryCities: game.industryCities.filter((city) => city.id !== 'breadbasket-basin'),
				activeIndustryCityId: 'industry-city',
				industrialBuildings: [{ ...game.industrialBuildings[0]!, cityId: 'breadbasket-basin' }]
			})
		]
	])('rejects a current v15 state with %s before derived capacity logic', (_name, mutateGame) => {
		expectSaveRecordErrorCode(
			createManualSaveRecord({ game: mutateGame(createCurrentMultiCityGame()) }),
			'invariant-entity-city-ownership'
		);
	});

	test.each([
		[
			'a missing production movement city',
			(report: DailyReport) => ({
				...report,
				productionReport: {
					...report.productionReport,
					produced: report.productionReport.produced.map(({ cityId: _cityId, ...movement }) => {
						void _cityId;
						return movement;
					})
				}
			})
		],
		[
			'an unknown production movement city',
			(report: DailyReport) => ({
				...report,
				productionReport: {
					...report.productionReport,
					produced: report.productionReport.produced.map((movement) => ({
						...movement,
						cityId: 'unlisted-city'
					}))
				}
			})
		],
		[
			'a retail production movement city',
			(report: DailyReport) => ({
				...report,
				productionReport: {
					...report.productionReport,
					produced: report.productionReport.produced.map((movement) => ({
						...movement,
						cityId: 'harbor-city' as const
					}))
				}
			})
		],
		[
			'an industry shop-import city',
			(report: DailyReport) => ({
				...report,
				productionReport: {
					...report.productionReport,
					shopImports: report.productionReport.shopImports.map((movement) => ({
						...movement,
						cityId: 'industry-city' as const
					}))
				}
			})
		],
		[
			'a missing rail shipment city',
			(report: DailyReport) => ({
				...report,
				productionReport: {
					...report.productionReport,
					railShipments: report.productionReport.railShipments.map(
						({ cityId: _cityId, ...shipment }) => {
							void _cityId;
							return shipment;
						}
					)
				}
			})
		],
		[
			'a retail rail shipment city',
			(report: DailyReport) => ({
				...report,
				productionReport: {
					...report.productionReport,
					railShipments: report.productionReport.railShipments.map((shipment) => ({
						...shipment,
						cityId: 'harbor-city' as const
					}))
				}
			})
		],
		[
			'a missing production-close inventory summary',
			(report: DailyReport) => {
				const { cityInventories: _cityInventories, ...productionReport } = report.productionReport;
				void _cityInventories;
				return { ...report, productionReport };
			}
		],
		[
			'duplicate store-report IDs',
			(report: DailyReport) => {
				const storeReport = report.storeReports[0]!;
				return {
					...report,
					storeReports: [storeReport, structuredClone(storeReport)]
				};
			}
		],
		[
			'duplicate product category IDs within one store report',
			(report: DailyReport) => {
				const storeReport = report.storeReports[0]!;
				const productReport = storeReport.productReports[0]!;
				return {
					...report,
					storeReports: [
						{
							...storeReport,
							productReports: [productReport, structuredClone(productReport)]
						}
					]
				};
			}
		]
	])('drops a structurally malformed historical report with %s', (_name, mutateReport) => {
		const game = createCurrentMultiCityGame();
		const report = mutateReport(createCurrentReport(game)) as DailyReport;

		expectHistoricalReportDropped(
			() =>
				validateSaveRecord(createManualSaveRecord({ game: { ...game, reports: [report] } })).game
		);
	});

	test.each([
		[
			'a missing store replenishment context',
			(report: DailyReport) => {
				const { replenishment: _replenishment, ...storeReport } = report.storeReports[0]!;
				void _replenishment;
				return { ...report, storeReports: [storeReport] };
			},
			'drop'
		],
		[
			'a source context that conflicts with its configured source',
			(report: DailyReport) => {
				const storeReport = report.storeReports[0]!;
				return {
					...report,
					storeReports: [
						{
							...storeReport,
							replenishment: {
								...storeReport.replenishment!,
								configuredSupplyCityId: null,
								resolvedSupplyCityId: 'industry-city'
							}
						}
					]
				};
			},
			'preserve'
		],
		[
			'a product row that duplicates its store-level city context',
			(report: DailyReport) => {
				const storeReport = report.storeReports[0]!;
				return {
					...report,
					storeReports: [
						{
							...storeReport,
							productReports: [
								{
									...storeReport.productReports[0]!,
									retailCityId: 'harbor-city'
								}
							]
						}
					]
				};
			},
			'preserve'
		]
	])('decodes a current v15 store report with %s', (_name, mutateReport, expectedResult) => {
		const game = createCurrentMultiCityGame();
		const report = mutateReport(createCurrentReport(game)) as DailyReport;

		const savedGame =
			expectedResult === 'preserve'
				? withCurrentReports(game, [report])
				: { ...game, reports: [report] };
		const decode = () => validateSaveRecord(createManualSaveRecord({ game: savedGame })).game;
		if (expectedResult === 'drop') {
			expectHistoricalReportDropped(decode);
		} else {
			expect(expectHistoricalReportPreserved(decode).reports[0]).toEqual(report);
		}
	});

	test('accepts a current v15 report without a persisted product outcome label', () => {
		expect.assertions(1);
		const game = createCurrentMultiCityGame();
		const report = createCurrentReport(game);

		const validated = validateSaveRecord(
			createManualSaveRecord({ game: withCurrentReports(game, [report]) })
		);

		expect(validated.game.reports[0]!.storeReports[0]!.productReports[0]).not.toHaveProperty(
			'replenishmentOutcome'
		);
	});

	test('accepts explicit null v15 replenishment fields when no product attempted a refill', () => {
		expect.assertions(2);
		const game = createCurrentMultiCityGame();
		const report = createCurrentReport(game);
		const storeReport = report.storeReports[0]!;
		const noAttemptReport: DailyReport = {
			...report,
			productionReport: { ...report.productionReport, shopImports: [] },
			storeReports: [
				{
					...storeReport,
					replenishment: null,
					productReports: [
						{
							...storeReport.productReports[0]!,
							warehouseUnits: 0,
							warehouseValue: 0,
							importedUnits: 0,
							importSpend: 0
						}
					]
				}
			]
		};

		const validated = validateSaveRecord(
			createManualSaveRecord({ game: withCurrentReports(game, [noAttemptReport]) })
		);

		expect(SAVE_SCHEMA_VERSION).toBe(19);
		expect(validated.game.reports[0]!.storeReports[0]!.replenishment).toBeNull();
	});

	test('round-trips the complete event schema v18 without dropping materialized evidence', () => {
		expect.assertions(3);
		const record = createManualSaveRecord({ game: createCompleteEventGame() });

		const validated = validateSaveRecord(structuredClone(record));

		expect(SAVE_SCHEMA_VERSION).toBe(19);
		expect(validated).toEqual(record);
		expect(validated).not.toBe(record);
	});

	test('round-trips route-targeted event evidence with target-scoped stacking keys', () => {
		expect.assertions(3);
		const record = createManualSaveRecord({ game: createCompleteRouteEventGame() });

		const validated = validateSaveRecord(structuredClone(record));

		expect(SAVE_SCHEMA_VERSION).toBe(19);
		expect(validated).toEqual(record);
		expect(validated).not.toBe(record);
	});

	test('rejects duplicate stacking keys on the same route target while allowing cross-route coexistence', () => {
		const game = createCompleteRouteEventGame();
		const modifiers = game.events.activeModifiers;
		const duplicateOnRouteTwo = {
			...game,
			events: {
				...game.events,
				nextModifierSequence: 5,
				activeModifiers: [
					...modifiers,
					{
						...modifiers[1]!,
						id: 'event-modifier-4',
						source: {
							eventId: 'freight-disruption',
							instanceId: 'event-instance-3',
							optionId: 'accept-delay'
						}
					}
				]
			}
		};
		let caught: unknown;
		try {
			validateCurrentGameState(duplicateOnRouteTwo);
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(SaveDataError);
		expect((caught as SaveDataError).code).toBe('invariant-event-runtime');
		expect((caught as SaveDataError).message).toContain('stackingKey must be unique per target');
	});

	test('rejects cooldown duplicates for the same event and route while allowing cross-route coexistence', () => {
		const game = createCompleteRouteEventGame();
		const duplicateCooldown = {
			...game,
			events: {
				...game.events,
				cooldowns: [
					...game.events.cooldowns,
					{
						eventId: 'freight-disruption',
						target: { kind: 'recurring-route', routeId: 'route-1' },
						generatedOnDay: 3,
						eligibleOnDay: 4
					}
				]
			}
		};
		expect(() => validateCurrentGameState(duplicateCooldown)).toThrow(
			'unique event/target key: freight-disruption:route:route-1'
		);

		const crossRouteCooldowns = {
			...game,
			events: {
				...game.events,
				cooldowns: [
					...game.events.cooldowns,
					{
						eventId: 'freight-disruption',
						target: { kind: 'recurring-route', routeId: 'route-2' },
						generatedOnDay: 3,
						eligibleOnDay: 4
					}
				]
			}
		};
		expect(() => validateCurrentGameState(crossRouteCooldowns)).not.toThrow();
	});

	test.each([
		{
			name: 'an event decision target missing its routeId',
			mutate: (game: GameState): GameState => {
				const decision = game.decisions.find((candidate) => candidate.kind === 'event')!;
				return {
					...game,
					decisions: [{ ...decision, target: { kind: 'recurring-route' } as never }]
				};
			},
			path: 'Saved game decisions[0] target routeId'
		},
		{
			name: 'an event decision target with a malformed routeId',
			mutate: (game: GameState): GameState => {
				const decision = game.decisions.find((candidate) => candidate.kind === 'event')!;
				return {
					...game,
					decisions: [{ ...decision, target: { kind: 'recurring-route', routeId: 'route-x' } }]
				};
			},
			path: 'Saved game decisions[0] target routeId must use route-'
		},
		{
			name: 'an event decision target with a zero routeId',
			mutate: (game: GameState): GameState => {
				const decision = game.decisions.find((candidate) => candidate.kind === 'event')!;
				return {
					...game,
					decisions: [{ ...decision, target: { kind: 'recurring-route', routeId: 'route-0' } }]
				};
			},
			path: 'Saved game decisions[0] target routeId must use route-'
		},
		{
			name: 'an event decision target with a routeId at or beyond nextRouteSequence',
			mutate: (game: GameState): GameState => {
				const decision = game.decisions.find((candidate) => candidate.kind === 'event')!;
				return {
					...game,
					decisions: [{ ...decision, target: { kind: 'recurring-route', routeId: 'route-3' } }]
				};
			},
			path: 'Saved game logistics nextRouteSequence must exceed generated route IDs'
		},
		{
			name: 'an active modifier capacity effect missing its multiplier',
			mutate: (game: GameState): GameState => {
				const modifier = game.events.activeModifiers[0]!;
				return {
					...game,
					events: {
						...game.events,
						activeModifiers: [
							{ ...modifier, effect: { kind: 'route-capacity-multiplier' } as never }
						]
					}
				};
			},
			path: 'Saved game events activeModifiers[0] effect multiplier'
		},
		{
			name: 'a lead-time effect with a nonpositive day count',
			mutate: (game: GameState): GameState => {
				const modifier = game.events.activeModifiers[0]!;
				return {
					...game,
					events: {
						...game.events,
						activeModifiers: [
							{
								...modifier,
								effect: { kind: 'route-lead-time-adjustment', days: 0 }
							}
						]
					}
				};
			},
			path: 'Saved game events activeModifiers[0] effect days'
		},
		{
			name: 'a suspension effect carrying an extra payload key',
			mutate: (game: GameState): GameState => {
				const modifier = game.events.activeModifiers[0]!;
				return {
					...game,
					events: {
						...game.events,
						activeModifiers: [
							{
								...modifier,
								effect: { kind: 'route-dispatch-suspension', extra: 1 } as never
							}
						]
					}
				};
			},
			path: 'Saved game events activeModifiers[0] effect contains an unknown field'
		},
		{
			name: 'a recurring-route target carrying an import-cost-multiplier effect',
			mutate: (game: GameState): GameState => {
				const modifier = game.events.activeModifiers[0]!;
				return {
					...game,
					events: {
						...game.events,
						activeModifiers: [
							{
								...modifier,
								effect: {
									kind: 'import-cost-multiplier',
									scope: 'retail-product',
									target: { kind: 'all' },
									multiplier: 0.5
								}
							}
						]
					}
				};
			},
			path: 'Saved game events activeModifiers[0] effect must be a route effect for a recurring-route target'
		},
		{
			name: 'a company target carrying a route-capacity-multiplier effect',
			mutate: (game: GameState): GameState => {
				const modifier = game.events.activeModifiers[0]!;
				return {
					...game,
					events: {
						...game.events,
						activeModifiers: [
							{
								...modifier,
								target: { kind: 'company' },
								stackingKey: 'freight-capacity:company',
								effect: { kind: 'route-capacity-multiplier', multiplier: 0.75 }
							}
						]
					}
				};
			},
			path: 'Saved game events activeModifiers[0] effect must be import-cost-multiplier for a company target'
		}
	])('rejects %s', ({ mutate, path }) => {
		const game = createCompleteRouteEventGame();

		let caught: unknown;
		try {
			validateCurrentGameState(mutate(game));
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(SaveDataError);
		expect((caught as SaveDataError).code).toBe('invariant-event-runtime');
		expect((caught as SaveDataError).message).toContain(path);
	});

	test('rejects an unsafe whole-dollar event finance amount', () => {
		const game = createCompleteEventGame();
		const decision = game.decisions[0]!;
		if (decision.kind !== 'event') throw new Error('Expected an event decision fixture.');
		const malformed = {
			...game,
			decisions: [
				{
					...decision,
					options: [
						{
							...decision.options[0]!,
							effects: [
								{
									kind: 'finance-borrow' as const,
									purpose: 'emergency' as const,
									amount: Number.MAX_SAFE_INTEGER + 1,
									termDays: 56
								}
							]
						},
						...decision.options.slice(1)
					]
				}
			]
		};

		let caught: unknown;
		try {
			validateCurrentGameState(malformed);
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(SaveDataError);
		expect((caught as SaveDataError).code).toBe('invariant-event-runtime');
		expect((caught as SaveDataError).message).toContain(
			'Saved game decisions[0] options[0] effects[0] amount'
		);
	});

	test.each([
		{
			name: 'empty affected IDs',
			mutate: (game: GameState) => ({
				...game,
				reports: [
					{
						...game.reports[0]!,
						modifierImpacts: [{ ...game.reports[0]!.modifierImpacts[0]!, affectedIds: [] }]
					}
				]
			}),
			path: 'Saved game reports[0] modifierImpacts[0] affectedIds'
		},
		{
			name: 'unsorted affected IDs',
			mutate: (game: GameState) => ({
				...game,
				reports: [
					{
						...game.reports[0]!,
						modifierImpacts: [
							{
								...game.reports[0]!.modifierImpacts[0]!,
								affectedIds: ['store-z', 'store-a'],
								applicationCount: 2
							}
						]
					}
				]
			}),
			path: 'Saved game reports[0] modifierImpacts[0] affectedIds[1]'
		},
		{
			name: 'zero resolved multiplier',
			mutate: (game: GameState) => ({
				...game,
				reports: [
					{
						...game.reports[0]!,
						modifierImpacts: [{ ...game.reports[0]!.modifierImpacts[0]!, resolvedMultiplier: 0 }]
					}
				]
			}),
			path: 'Saved game reports[0] modifierImpacts[0] resolvedMultiplier'
		},
		{
			name: 'zero baseline evidence',
			mutate: (game: GameState) => ({
				...game,
				reports: [
					{
						...game.reports[0]!,
						modifierImpacts: [{ ...game.reports[0]!.modifierImpacts[0]!, baselineCost: 0 }]
					}
				]
			}),
			path: 'Saved game reports[0] modifierImpacts[0] baselineCost'
		},
		{
			name: 'fractional actual cost',
			mutate: (game: GameState) => ({
				...game,
				reports: [
					{
						...game.reports[0]!,
						modifierImpacts: [{ ...game.reports[0]!.modifierImpacts[0]!, actualCost: 719.5 }]
					}
				]
			}),
			path: 'Saved game reports[0] modifierImpacts[0] actualCost'
		},
		{
			name: 'application count below affected IDs',
			mutate: (game: GameState) => ({
				...game,
				reports: [
					{
						...game.reports[0]!,
						modifierImpacts: [
							{
								...game.reports[0]!.modifierImpacts[0]!,
								affectedIds: ['store-a', 'store-z'],
								applicationCount: 1
							}
						]
					}
				]
			}),
			path: 'Saved game reports[0] modifierImpacts[0] applicationCount'
		},
		{
			name: 'unsorted modifier impacts',
			mutate: (game: GameState) => {
				const impact = game.reports[0]!.modifierImpacts[0]!;
				return {
					...game,
					events: { ...game.events, nextModifierSequence: 3 },
					reports: [
						{
							...game.reports[0]!,
							modifierImpacts: [{ ...impact, modifierId: 'event-modifier-2' }, impact]
						}
					]
				};
			},
			path: 'Saved game reports[0] modifierImpacts[1] modifierId'
		}
	])('drops a historical report with malformed $name', ({ mutate }) => {
		expectHistoricalReportDropped(() =>
			validateCurrentGameState(mutate(createCompleteEventGame()))
		);
	});

	test.each([
		{
			name: 'activated lifecycle on a day other than its start',
			lifecycle: (game: GameState) => ({
				status: 'activated' as const,
				modifier: { ...game.reports[0]!.modifierLifecycle[0]!.modifier, startsOnDay: 1 }
			}),
			path: 'Saved game reports[0] modifierLifecycle[0] status'
		},
		{
			name: 'expired lifecycle before expiresOnDay minus one',
			lifecycle: (game: GameState) => ({
				status: 'expired' as const,
				modifier: { ...game.reports[0]!.modifierLifecycle[0]!.modifier, expiresOnDay: 4 }
			}),
			path: 'Saved game reports[0] modifierLifecycle[0] status'
		},
		{
			name: 'modifier replacing itself',
			lifecycle: (game: GameState) => ({
				status: 'replaced' as const,
				modifier: game.reports[0]!.modifierLifecycle[0]!.modifier,
				replacedByModifierId: 'event-modifier-1'
			}),
			path: 'Saved game reports[0] modifierLifecycle[0] replacedByModifierId'
		}
	])('drops a historical report with malformed $name', ({ lifecycle }) => {
		const game = createCompleteEventGame();
		const malformed = {
			...game,
			reports: [{ ...game.reports[0]!, modifierLifecycle: [lifecycle(game)] }]
		};

		expectHistoricalReportDropped(() => validateCurrentGameState(malformed));
	});

	test('requires nextModifierSequence to exceed report replacement evidence', () => {
		const game = createCompleteEventGame();
		const replaced = {
			status: 'replaced' as const,
			modifier: game.reports[0]!.modifierLifecycle[0]!.modifier,
			replacedByModifierId: 'event-modifier-2'
		};
		const malformed = {
			...game,
			reports: [{ ...game.reports[0]!, modifierLifecycle: [replaced] }]
		};
		let caught: unknown;
		try {
			validateCurrentGameState(malformed);
		} catch (error) {
			caught = error;
		}

		expect(caught).toBeInstanceOf(SaveDataError);
		expect((caught as SaveDataError).code).toBe('invariant-event-runtime');
		expect((caught as SaveDataError).message).toContain('nextModifierSequence');
	});

	test('rejects an outstanding loan whose scheduled payment is already in the past', () => {
		expect.assertions(1);
		const game = createGame();
		const record = createManualSaveRecord({
			metadata: { day: 11 },
			game: {
				day: 11,
				finance: {
					...game.finance,
					currentDayActivity: { ...game.finance.currentDayActivity, day: 11 }
				}
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('round-trips an outstanding loan whose scheduled payment is due today', () => {
		expect.assertions(2);
		const baseGame = createGame();
		const game = refreshWorldProgress({
			...baseGame,
			day: 10,
			finance: {
				...baseGame.finance,
				currentDayActivity: { ...baseGame.finance.currentDayActivity, day: 10 }
			}
		});
		const record = createManualSaveRecord({
			metadata: { day: 10 },
			game
		});

		const validated = validateSaveRecord(record);

		expect(validated.game.finance.loans[0]?.nextPaymentDay).toBe(10);
		expect(validateSaveRecord(structuredClone(validated))).toEqual(validated);
	});

	test.each([
		['negative sequence', (game: GameState) => ({ ...game.finance, nextLoanSequence: -1 })],
		[
			'fractional sequence',
			(game: GameState) => ({ ...game.finance, nextTransactionSequence: 1.5 })
		],
		[
			'duplicate loan ids',
			(game: GameState) => ({
				...game.finance,
				loans: [game.finance.loans[0]!, game.finance.loans[0]!]
			})
		],
		[
			'unsupported loan purpose',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, purpose: 'bad' }]
			})
		],
		[
			'unsupported loan status',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, status: 'bad' }]
			})
		],
		[
			'unsupported term',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, termDays: 7 }]
			})
		],
		[
			'too many installments',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, installmentsProcessed: 13 }]
			})
		],
		[
			'arrears exceeding remaining principal',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, overduePrincipal: 2_001 }]
			})
		],
		[
			'paid balance',
			(game: GameState) => ({
				...game.finance,
				loans: [
					{ ...game.finance.loans[0]!, status: 'paid', nextPaymentDay: null, remainingPrincipal: 1 }
				]
			})
		],
		[
			'active arrears',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, overdueInterest: 1 }]
			})
		],
		[
			'delinquent without arrears',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, status: 'delinquent', arrearsSinceDay: 3 }]
			})
		],
		[
			'contradictory next payment',
			(game: GameState) => ({
				...game.finance,
				loans: [{ ...game.finance.loans[0]!, nextPaymentDay: 99 }]
			})
		],
		[
			'activity day mismatch',
			(game: GameState) => ({
				...game.finance,
				currentDayActivity: { ...game.finance.currentDayActivity, day: 999 }
			})
		],
		[
			'non-reconciling financing cash flow',
			(game: GameState) => ({
				...game.finance,
				currentDayActivity: { ...game.finance.currentDayActivity, financingCashFlow: 1 }
			})
		]
	] as const)('rejects finance corruption: %s', (_name, mutate) => {
		const game = createGame();
		const record = createManualSaveRecord({
			game: { finance: mutate(game) as GameState['finance'] }
		});
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('rejects authoritative finance corruption while decoding report finance facts independently', () => {
		const game = createGame();
		const transaction = {
			id: 'finance-transaction-1',
			day: 3,
			kind: 'disbursement' as const,
			loanId: 'unknown',
			cashDelta: 1,
			principalAmount: 1,
			principalDelta: 1,
			interestAmount: 0
		};
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: { finance: { ...game.finance, transactions: [transaction] } }
				})
			)
		).toThrow(SaveDataError);
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: {
						finance: {
							...game.finance,
							transactions: Array.from({ length: 201 }, (_, index) => ({
								...transaction,
								id: `finance-transaction-${index + 1}`,
								loanId: 'loan-1',
								day: index + 1
							}))
						}
					}
				})
			)
		).toThrow(SaveDataError);
		const negativeInterest = { ...createDailyReport(), interestAccrued: -0.1 };
		expectHistoricalReportDropped(
			() =>
				validateSaveRecord(createManualSaveRecord({ game: { reports: [negativeInterest] } })).game
		);
		expectHistoricalReportDropped(
			() =>
				validateSaveRecord(
					createManualSaveRecord({
						game: { reports: [{ ...createDailyReport(), operatingCashFlow: Number.NaN }] }
					})
				).game
		);
		const fractionalInterest = { ...createDailyReport(), interestAccrued: 0.125 };
		expect(
			expectHistoricalReportPreserved(
				() =>
					validateSaveRecord(
						createManualSaveRecord({
							game: withCurrentReports(createGame(), [fractionalInterest])
						})
					).game
			).reports[0]
		).toEqual(fractionalInterest);
	});

	test('rejects closed/refinance relationship corruption and out-of-order transaction history', () => {
		expect.assertions(4);
		const game = createGame();
		const source = {
			...game.finance.loans[0]!,
			status: 'refinanced' as const,
			remainingPrincipal: 0,
			nextPaymentDay: null,
			refinancedByLoanId: 'loan-2'
		};
		const replacement = {
			...game.finance.loans[0]!,
			id: 'loan-2',
			purpose: 'refinance' as const,
			refinancedFromLoanId: 'loan-1'
		};
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: {
						finance: {
							...game.finance,
							nextLoanSequence: 3,
							loans: [source, { ...replacement, refinancedFromLoanId: 'missing' }]
						}
					}
				})
			)
		).toThrow(SaveDataError);
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: {
						finance: { ...game.finance, loans: [{ ...source, refinancedByLoanId: undefined }] }
					}
				})
			)
		).toThrow(SaveDataError);
		const transaction = (day: number, id: string) => ({
			id,
			day,
			kind: 'disbursement' as const,
			loanId: 'loan-1',
			cashDelta: 1,
			principalAmount: 1,
			principalDelta: 1,
			interestAmount: 0
		});
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: {
						finance: {
							...game.finance,
							nextTransactionSequence: 3,
							transactions: [
								transaction(3, 'finance-transaction-1'),
								transaction(2, 'finance-transaction-2')
							]
						}
					}
				})
			)
		).toThrow(SaveDataError);
		expect(() =>
			validateSaveRecord(
				createManualSaveRecord({
					game: {
						finance: {
							...game.finance,
							currentDayActivity: { ...game.finance.currentDayActivity, principalBorrowed: 1.5 }
						}
					}
				})
			)
		).toThrow(SaveDataError);
	});

	test('rejects loan field-range corruption', () => {
		expect.assertions(9);
		const game = createGame();
		const baseLoan = game.finance.loans[0]!;
		const expectLoanCorruption = (loan: Partial<GameState['finance']['loans'][number]>) =>
			expect(() =>
				validateSaveRecord(
					createManualSaveRecord({
						game: { finance: { ...game.finance, loans: [{ ...baseLoan, ...loan }] } }
					})
				)
			).toThrow(SaveDataError);

		expectLoanCorruption({ openedOnDay: 99 });
		expectLoanCorruption({ originalPrincipal: 0 });
		expectLoanCorruption({ remainingPrincipal: baseLoan.originalPrincipal + 1 });
		expectLoanCorruption({ lastInterestAccrualDay: 99 });
		expectLoanCorruption({ lastInterestAccrualDay: 0 });
		expectLoanCorruption({
			status: 'delinquent',
			arrearsSinceDay: 99,
			overduePrincipal: 1,
			overdueInterest: 1
		});
		expectLoanCorruption({
			status: 'delinquent',
			arrearsSinceDay: 0,
			overduePrincipal: 1,
			overdueInterest: 1
		});
		expectLoanCorruption({
			purpose: 'refinance',
			refinancedFromLoanId: undefined
		});
		expectLoanCorruption({
			purpose: 'refinance',
			refinancedFromLoanId: 'loan-99'
		});
	});

	test('round-trips more than the finance transaction limit of lifetime loans', () => {
		// Loans are append-only and closed instruments are retained for lifetime
		// repayment history, so the loan collection must not be capped by the
		// transaction limit. A save with >200 paid loans must validate and
		// round-trip without loss.
		expect.assertions(3);
		const game = createGame();
		const baseLoan = game.finance.loans[0]!;
		const loans = Array.from({ length: 205 }, (_, index) => ({
			...baseLoan,
			id: `loan-${index + 1}`,
			openedOnDay: 1,
			nextPaymentDay: null,
			lastInterestAccrualDay: 1,
			status: 'paid' as const,
			remainingPrincipal: 0,
			originalPrincipal: 1,
			installmentsProcessed: 4,
			scheduledPaymentCount: 4,
			onTimePaymentCount: 4,
			missedPaymentCount: 0
		}));
		const record = createManualSaveRecord({
			game: {
				finance: { ...game.finance, nextLoanSequence: 206, loans }
			}
		});

		const validated = validateSaveRecord(record);
		expect(validated.game.finance.loans).toHaveLength(205);

		const revalidated = validateSaveRecord(structuredClone(validated));
		expect(revalidated.game.finance.loans).toHaveLength(205);
		expect(revalidated).toEqual(validated);
	});

	test('validates a long linear refinance chain and round-trips it', () => {
		// A valid linear chain of N refinances (loan-1 -> loan-2 -> ... ->
		// loan-N) exercises a linked refinancedByLoanId walk across many nodes.
		// The 205-unlinked-loans test does not cover this because none of those
		// loans link to each other; this chain validates and round-trips the
		// linked case.
		expect.assertions(3);
		const game = createGame();
		const base = game.finance.loans[0]!;
		const chainLength = 1_000;
		const loans: GameState['finance']['loans'] = [];
		// loan-1: the original, refinanced by loan-2.
		loans.push({
			...base,
			id: 'loan-1',
			status: 'refinanced' as const,
			remainingPrincipal: 0,
			nextPaymentDay: null,
			refinancedByLoanId: 'loan-2'
		});
		// loan-2 .. loan-(N-1): each refinanced from the previous and by the next.
		for (let i = 2; i <= chainLength - 1; i += 1) {
			loans.push({
				...base,
				id: `loan-${i}`,
				purpose: 'refinance' as const,
				status: 'refinanced' as const,
				remainingPrincipal: 0,
				nextPaymentDay: null,
				refinancedFromLoanId: `loan-${i - 1}`,
				refinancedByLoanId: `loan-${i + 1}`
			});
		}
		// loan-N: the active refinance replacement, closing the chain.
		loans.push({
			...base,
			id: `loan-${chainLength}`,
			purpose: 'refinance' as const,
			refinancedFromLoanId: `loan-${chainLength - 1}`
		});

		const record = createManualSaveRecord({
			game: {
				finance: { ...game.finance, nextLoanSequence: chainLength + 1, loans }
			}
		});

		const validated = validateSaveRecord(record);
		expect(validated.game.finance.loans).toHaveLength(chainLength);

		const revalidated = validateSaveRecord(structuredClone(validated));
		expect(revalidated.game.finance.loans).toHaveLength(chainLength);
		expect(revalidated).toEqual(validated);
	});

	test('rejects a transaction whose relatedLoanId references an unknown loan', () => {
		expect.assertions(2);
		const game = createGame();
		const transaction = {
			id: 'finance-transaction-1',
			day: 3,
			kind: 'refinance' as const,
			loanId: 'loan-1',
			relatedLoanId: 'loan-99',
			cashDelta: 0,
			principalAmount: 1,
			principalDelta: 1,
			interestAmount: 0
		};
		const call = () =>
			validateSaveRecord(
				createManualSaveRecord({
					game: { finance: { ...game.finance, transactions: [transaction] } }
				})
			);
		expect(call).toThrow(SaveDataError);
		expect(call).toThrow(
			'Saved game finance transactions[0] relatedLoanId must reference a known loan'
		);
	});

	test('rejects a transaction with a non-integer cash delta', () => {
		expect.assertions(2);
		const game = createGame();
		const transaction = {
			id: 'finance-transaction-1',
			day: 3,
			kind: 'disbursement' as const,
			loanId: 'loan-1',
			cashDelta: 1.5,
			principalAmount: 1,
			principalDelta: 1,
			interestAmount: 0
		};
		const call = () =>
			validateSaveRecord(
				createManualSaveRecord({
					game: { finance: { ...game.finance, transactions: [transaction] } }
				})
			);
		expect(call).toThrow(SaveDataError);
		expect(call).toThrow('Saved game finance transactions[0] cashDelta must be an integer');
	});

	test('rejects two-node and three-node refinance cycles while accepting a linear chain', () => {
		expect.assertions(3);
		const game = createGame();
		const base = game.finance.loans[0]!;
		const closed = (id: string, from: string, by: string) => ({
			...base,
			id,
			purpose: 'refinance' as const,
			status: 'refinanced' as const,
			remainingPrincipal: 0,
			nextPaymentDay: null,
			refinancedFromLoanId: from,
			refinancedByLoanId: by
		});
		const active = {
			...base,
			id: 'loan-3',
			purpose: 'refinance' as const,
			refinancedFromLoanId: 'loan-2'
		};
		const source = {
			...base,
			status: 'refinanced' as const,
			remainingPrincipal: 0,
			nextPaymentDay: null,
			refinancedByLoanId: 'loan-2'
		};
		const record = (loans: GameState['finance']['loans']) =>
			createManualSaveRecord({
				game: { finance: { ...game.finance, nextLoanSequence: 4, loans } }
			});

		expect(() =>
			validateSaveRecord(
				record([closed('loan-1', 'loan-2', 'loan-2'), closed('loan-2', 'loan-1', 'loan-1')])
			)
		).toThrow(SaveDataError);
		expect(() =>
			validateSaveRecord(
				record([
					closed('loan-1', 'loan-3', 'loan-2'),
					closed('loan-2', 'loan-1', 'loan-3'),
					closed('loan-3', 'loan-2', 'loan-1')
				])
			)
		).toThrow(SaveDataError);
		expect(() =>
			validateSaveRecord(record([source, closed('loan-2', 'loan-1', 'loan-3'), active]))
		).not.toThrow();
	});

	test('rejects refinance links whose endpoint status or purpose is inconsistent', () => {
		// Symmetry alone does not validate refinance semantics. A replacement
		// link is only valid on a refinanced-status source, and a source link is
		// only valid on a refinance-purpose replacement. Both directions must be
		// enforced so an active source and an ordinary replacement cannot form a
		// symmetric graph while both remain outstanding.
		expect.assertions(2);
		const game = createGame();
		const base = game.finance.loans[0]!;
		const replacement = {
			...base,
			id: 'loan-2',
			purpose: 'refinance' as const,
			refinancedFromLoanId: 'loan-1'
		};
		const record = (loans: GameState['finance']['loans']) =>
			createManualSaveRecord({
				game: { finance: { ...game.finance, nextLoanSequence: 3, loans } }
			});

		// Active source carrying a replacement link: status is 'active', not
		// 'refinanced', so the link is invalid even though the replacement points
		// back symmetrically.
		expect(() =>
			validateSaveRecord(
				record([{ ...base, status: 'active' as const, refinancedByLoanId: 'loan-2' }, replacement])
			)
		).toThrow(SaveDataError);

		// Non-refinance replacement carrying a source link: purpose is 'expansion',
		// not 'refinance', so the link is invalid even though the source points
		// back symmetrically.
		expect(() =>
			validateSaveRecord(
				record([
					{
						...base,
						status: 'refinanced' as const,
						remainingPrincipal: 0,
						nextPaymentDay: null,
						refinancedByLoanId: 'loan-2'
					},
					{ ...replacement, purpose: 'expansion' as const }
				])
			)
		).toThrow(SaveDataError);
	});

	test.each([
		[-1, 'drop'],
		[1.5, 'drop'],
		[4, 'preserve']
	] as const)(
		'decodes a report day outside the current game timeline: %s',
		(day, expectedResult) => {
			const report = createDailyReport({ day });
			const game =
				expectedResult === 'preserve'
					? withCurrentReports(createGame(), [report])
					: { ...createGame(), reports: [report] };
			const decode = () => validateSaveRecord(createManualSaveRecord({ game })).game;
			if (expectedResult === 'drop') {
				expectHistoricalReportDropped(decode);
			} else {
				expect(expectHistoricalReportPreserved(decode).reports[0]).toEqual(report);
			}
		}
	);

	test.each([
		'cashBefore',
		'operatingIncome',
		'operatingCashFlow',
		'interestAccrued',
		'interestPaid',
		'interestCapitalized',
		'principalBorrowed',
		'principalRepaid',
		'refinancedPrincipal',
		'financingCashFlow',
		'netCashChange',
		'outstandingPrincipalAfter',
		'nextLoanPayment'
	] as const)('drops a historical report missing %s', (field) => {
		const report = { ...createDailyReport() } as Record<string, unknown>;
		delete report[field];
		expectHistoricalReportDropped(
			() =>
				validateSaveRecord(
					createManualSaveRecord({ game: { reports: [report as unknown as DailyReport] } })
				).game
		);
	});
	test('strict current-game validation returns an exact deep clone without mutating its input', () => {
		const game = createGame();
		const before = structuredClone(game);

		const validated = validateCurrentGameState(game);

		expect(validated).toEqual(game);
		expect(validated).not.toBe(game);
		expect(validated.world).not.toBe(game.world);
		expect(game).toEqual(before);
	});

	test('round-trips a zero-dollar checkpoint while rejecting counters beyond processed installments', () => {
		const game = refreshWorldProgress({
			...createGame(),
			day: 10,
			finance: {
				...createFoundingFinanceState(3, 1),
				currentDayActivity: {
					...createFoundingFinanceState(3, 1).currentDayActivity,
					day: 10
				},
				loans: [
					{
						...createFoundingFinanceState(3, 1).loans[0]!,
						installmentsProcessed: 1,
						nextPaymentDay: 17,
						lastInterestAccrualDay: 10,
						accruedInterestMicros: 2_303
					}
				]
			}
		});
		const record = createManualSaveRecord({ game });

		const validated = validateSaveRecord(record);
		expect(validated.game.finance.loans[0]).toMatchObject({
			originalPrincipal: 1,
			termDays: 84,
			installmentsProcessed: 1,
			scheduledPaymentCount: 0,
			onTimePaymentCount: 0,
			missedPaymentCount: 0
		});
		expect(() =>
			validateSaveRecord({
				...record,
				game: {
					...record.game,
					finance: {
						...record.game.finance,
						loans: [
							{
								...record.game.finance.loans[0]!,
								scheduledPaymentCount: 2,
								onTimePaymentCount: 2
							}
						]
					}
				}
			})
		).toThrow(SaveDataError);
	});

	test.each([
		['fractional original principal', 'originalPrincipal', 1.5],
		['negative remaining principal', 'remainingPrincipal', -1],
		['fractional overdue principal', 'overduePrincipal', 2.5],
		['negative accrued interest micros', 'accruedInterestMicros', -1]
	] as const)('strict validation rejects $0 in saved finance', (_name, field, value) => {
		const game = createGame();
		const loan = game.finance.loans[0]!;
		const finance = {
			...game.finance,
			loans: [{ ...loan, [field]: value }]
		};

		expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
	});

	test.each([
		['a non-string refinanced-from link', { refinancedFromLoanId: 1 }],
		['a non-string refinanced-by link', { refinancedByLoanId: null }]
	] as const)('strict validation rejects $0', (_name, patch) => {
		const game = createGame();
		const loan = game.finance.loans[0]!;
		const finance = { ...game.finance, loans: [{ ...loan, ...patch }] };

		expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
	});

	test('strict validation rejects a non-string related-loan link', () => {
		const game = createGame();
		const finance = {
			...game.finance,
			transactions: [
				{
					id: 'finance-transaction-1',
					day: 3,
					kind: 'disbursement' as const,
					loanId: 'loan-1',
					relatedLoanId: 1,
					cashDelta: 0,
					principalAmount: 0,
					principalDelta: 0,
					interestAmount: 0
				}
			]
		};

		expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
	});

	test('strict validation rejects duplicate loan IDs', () => {
		const game = createGame();
		const loan = game.finance.loans[0]!;
		const finance = {
			...game.finance,
			loans: [loan, { ...loan }]
		};

		expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
	});

	test('strict validation rejects duplicate transaction IDs', () => {
		const game = createGame();
		const transaction = {
			id: 'finance-transaction-1',
			day: 3,
			kind: 'disbursement' as const,
			loanId: 'loan-1',
			cashDelta: 0,
			principalAmount: 0,
			principalDelta: 0,
			interestAmount: 0
		};
		const finance = {
			...game.finance,
			transactions: [transaction, { ...transaction }]
		};

		expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
	});

	test.each([
		['loan', { nextLoanSequence: 1 }],
		[
			'transaction',
			{
				nextTransactionSequence: 1,
				transactions: [
					{
						id: 'finance-transaction-1',
						day: 3,
						kind: 'disbursement' as const,
						loanId: 'loan-1',
						cashDelta: 0,
						principalAmount: 0,
						principalDelta: 0,
						interestAmount: 0
					}
				]
			}
		]
	] as const)('strict validation rejects a reused $0 sequence', (_name, patch) => {
		const game = createGame();
		const finance = { ...game.finance, ...patch };

		expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
	});

	test.each([
		['loan', { nextLoanSequence: Number.MAX_SAFE_INTEGER + 1 }],
		['transaction', { nextTransactionSequence: Number.MAX_SAFE_INTEGER + 1 }]
	] as const)('strict validation rejects an unsafe $0 sequence', (_name, patch) => {
		const game = createGame();
		const finance = { ...game.finance, ...patch };

		expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
	});

	test.each([
		['loan', { nextLoanSequence: Number.MAX_SAFE_INTEGER }],
		['transaction', { nextTransactionSequence: Number.MAX_SAFE_INTEGER }]
	] as const)(
		'strict validation rejects a $0 sequence that cannot advance safely',
		(_name, patch) => {
			const game = createGame();
			const finance = { ...game.finance, ...patch };

			expect(() => validateCurrentGameState({ ...game, finance })).toThrow(SaveDataError);
		}
	);

	test.each([
		['loan', 'loan-01'],
		['loan', 'loan-9007199254740992'],
		['transaction', 'finance-transaction-01'],
		['transaction', 'finance-transaction-9007199254740992']
	] as const)(
		'strict validation does not consume a sequence for non-emitted $0 ID %s',
		(kind, id) => {
			const game = createGame();
			const finance =
				kind === 'loan'
					? {
							...game.finance,
							nextLoanSequence: 1,
							loans: [{ ...game.finance.loans[0]!, id }]
						}
					: {
							...game.finance,
							nextTransactionSequence: 1,
							transactions: [
								{
									id,
									day: 3,
									kind: 'disbursement' as const,
									loanId: 'loan-1',
									cashDelta: 0,
									principalAmount: 0,
									principalDelta: 0,
									interestAmount: 0
								}
							]
						};

			expect(validateCurrentGameState({ ...game, finance })).toEqual({ ...game, finance });
		}
	);

	test('strict validation rejects a game inherited through its prototype', () => {
		const inherited = Object.create(createGame()) as GameState;

		expect(() => validateCurrentGameState(inherited)).toThrow(SaveDataError);
		expect(() => validateCurrentGameState(inherited)).toThrow(
			'Saved game must be a plain record with own data properties'
		);
	});

	test.each([
		{ name: 'function', value: () => true },
		{ name: 'symbol', value: Symbol('uncloneable') }
	])('strict validation wraps a structured-clone failure for a $name extra', ({ value }) => {
		const game = Object.assign(createGame(), { uncloneable: value });

		expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
		expect(() => validateCurrentGameState(game)).toThrow(
			'Saved game must contain only structured-cloneable own data properties'
		);
	});

	test.each(['index', 'property'] as const)(
		'strict validation rejects an accessor-backed array $arrayCase without invoking it',
		(arrayCase) => {
			const game = createGame();
			const stores = [...game.stores];
			let invoked = false;
			Object.defineProperty(stores, arrayCase === 'index' ? '0' : 'trap', {
				enumerable: true,
				configurable: true,
				get() {
					invoked = true;
					throw new Error('array getter must not run');
				}
			});

			expect(() => validateCurrentGameState({ ...game, stores })).toThrow(SaveDataError);
			expect(invoked).toBe(false);
		}
	);

	test.each(['products', 'product-index', 'product-field'] as const)(
		'sandbox validation rejects a nested accessor-backed $accessorCase without invoking it',
		(accessorCase) => {
			const record = createManualSaveRecord();
			const store = { ...record.game.stores[0]! };
			let invoked = false;
			if (accessorCase === 'products') {
				Object.defineProperty(store, 'products', {
					enumerable: true,
					configurable: true,
					get() {
						invoked = true;
						throw new Error('products getter must not run');
					}
				});
			} else if (accessorCase === 'product-index') {
				const products = [...store.products];
				Object.defineProperty(products, '0', {
					enumerable: true,
					configurable: true,
					get() {
						invoked = true;
						throw new Error('product getter must not run');
					}
				});
				store.products = products;
			} else {
				const product = { ...store.products[0]! };
				Object.defineProperty(product, 'sellingPrice', {
					enumerable: true,
					configurable: true,
					get() {
						invoked = true;
						throw new Error('product field getter must not run');
					}
				});
				store.products = [product, ...store.products.slice(1)];
			}
			record.game = { ...record.game, stores: [store] };

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(invoked).toBe(false);
		}
	);

	test.each(['required-cash', 'hidden-extra', 'symbol-extra'] as const)(
		'strict validation rejects an own-property clone-loss case: $propertyCase',
		(propertyCase) => {
			const game = createGame() as GameState & Record<PropertyKey, unknown>;
			if (propertyCase === 'required-cash') {
				Object.defineProperty(game, 'cash', { value: game.cash, enumerable: false });
			} else if (propertyCase === 'hidden-extra') {
				Object.defineProperty(game, 'hiddenExtra', { value: 42, enumerable: false });
			} else {
				game[Symbol('extra')] = 42;
			}

			expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
			expect(() => validateCurrentGameState(game)).toThrow(/own enumerable string-keyed data/);
		}
	);

	test.each(['strict', 'sandbox'] as const)(
		'$boundary validation rejects a sparse nested city tile array as SaveDataError',
		(boundary) => {
			const game = createGame();
			const city = structuredClone(game.cities[0]!);
			delete city.tiles[0];
			const changed = { ...game, cities: [city] };

			const validate = () =>
				boundary === 'strict'
					? validateCurrentGameState(changed)
					: validateSaveRecord(createManualSaveRecord({ game: changed }));
			expect(validate).toThrow(SaveDataError);
			expect(validate).toThrow(/dense array/);
		}
	);

	test.each(['stores', 'staff', 'decisions', 'reports'] as const)(
		'strict and sandbox validation reject a sparse $field array',
		(field) => {
			const sparse = new Array(1) as unknown[];
			const game = { ...createGame(), [field]: sparse } as unknown as GameState;

			expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(createManualSaveRecord({ game }))).toThrow(SaveDataError);
		}
	);

	test('snapshot validation rejects sparse manualSlots as SaveDataError', () => {
		const snapshot = {
			...createSnapshotWithGame(createGame()),
			manualSlots: new Array(1)
		} as SaveStoreSnapshot;

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(/dense array/);
	});

	test.each(['strict', 'record'] as const)(
		'$boundary boundary maps a proxy get trap to SaveDataError without invoking it',
		(boundary) => {
			const target = boundary === 'record' ? createManualSaveRecord() : (createGame() as unknown);
			let invoked = false;
			const proxy = new Proxy(target as object, {
				get() {
					invoked = true;
					throw new Error('authored proxy get trap must not run');
				}
			});

			const validate = () => {
				if (boundary === 'strict') return validateCurrentGameState(proxy);
				return validateSaveRecord(proxy);
			};
			expect(validate).toThrow(SaveDataError);
			expect(invoked).toBe(false);
		}
	);

	test.each(['record-cash', 'snapshot-city-inventory'] as const)(
		'$case maps structured-cloneable scalar coercion data to SaveDataError',
		(testCase) => {
			const malformed = { valueOf: {}, toString: {} };
			const validate = () => {
				if (testCase === 'record-cash') {
					return validateSaveRecord(
						createManualSaveRecord({ game: { cash: malformed as unknown as number } })
					);
				}
				const game = createGame({
					cityInventories: [
						{
							cityId: 'industry-city',
							materials: { water: malformed as unknown as number }
						}
					]
				});
				return validateSaveStoreSnapshot(createSnapshotWithGame(game));
			};

			expect(validate).toThrow(SaveDataError);
		}
	);

	test('drops a historical report with structured-cloneable scalar coercion data', () => {
		const malformed = { valueOf: {}, toString: {} };
		const report = { ...createDailyReport(), netIncome: malformed as unknown as number };

		expectHistoricalReportDropped(
			() => validateSaveRecord(createManualSaveRecord({ game: { reports: [report] } })).game
		);
	});

	test.each(['strict', 'snapshot'] as const)(
		'$boundary boundary rejects a 20,000-deep enumerable extra as SaveDataError',
		(boundary) => {
			const deepExtra = createDeepEnumerableExtra(20_000);
			const validate = () =>
				boundary === 'strict'
					? validateCurrentGameState(Object.assign(createGame(), { deepExtra }))
					: validateSaveStoreSnapshot(
							Object.assign(createSnapshotWithGame(createGame()), { deepExtra })
						);

			expect(validate).toThrow(SaveDataError);
			expect(validate).toThrow(/depth|budget/);
		}
	);

	test('snapshot validation preserves enumerable cloneable own extras exactly', () => {
		const snapshot = Object.assign(createSnapshotWithGame(createGame()), {
			undefinedExtra: undefined,
			negativeZeroExtra: -0,
			nestedExtra: { value: 42 }
		});

		const validated = validateSaveStoreSnapshot(snapshot) as SaveStoreSnapshot & {
			undefinedExtra?: unknown;
			negativeZeroExtra: number;
			nestedExtra: { value: number };
		};

		expect(Object.hasOwn(validated, 'undefinedExtra')).toBe(true);
		expect(validated.undefinedExtra).toBeUndefined();
		expect(Object.is(validated.negativeZeroExtra, -0)).toBe(true);
		expect(validated.nestedExtra).toEqual({ value: 42 });
		expect(validated.nestedExtra).not.toBe(snapshot.nestedExtra);
	});

	test.each(['function', 'toJSON', 'symbol'] as const)(
		'snapshot validation rejects an uncloneable $kind extra without invoking it',
		(kind) => {
			let invoked = false;
			const callable = () => {
				invoked = true;
			};
			const snapshot = Object.assign(createSnapshotWithGame(createGame()), {
				[kind === 'toJSON' ? 'toJSON' : 'uncloneable']:
					kind === 'symbol' ? Symbol('uncloneable') : callable
			});

			expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
			expect(invoked).toBe(false);
		}
	);

	test('strict validation accepts a successful warehouse construction transition', () => {
		const game = { ...createNewGame('convenience', 20260722), cash: 1_000_000 };
		const city = game.industryCities[0]!;
		const tile = city.tiles.find(
			(candidate) => getIndustrialPlacementBlockReason(game, candidate.id, 'warehouse') === null
		)!;

		const built = buildIndustrialBuilding(game, {
			tileId: tile.id,
			buildingTypeId: 'warehouse'
		});

		expect(built.industrialBuildings.at(-1)?.typeId).toBe('warehouse');
		expect(validateCurrentGameState(built)).toEqual(built);
	});

	test('strict validation accepts a cash-changing decision transition that unlocks world progress', () => {
		const simulated = simulateDay(createNewGame('convenience', 20260722));
		const game: GameState = {
			...simulated,
			cash: -1,
			events: { ...simulated.events, nextInstanceSequence: 2 },
			world: {
				revealedCityIds: simulated.world.revealedCityIds.filter(
					(cityId) => cityId !== 'garden-borough'
				),
				openedCityIds: [...simulated.world.openedCityIds],
				claimedMilestoneIds: simulated.world.claimedMilestoneIds.filter(
					(milestoneId) => milestoneId !== 'reveal-garden-borough'
				)
			},
			decisions: [
				{
					kind: 'event',
					id: 'event-instance-1',
					eventId: 'cash-recovery',
					definitionVersion: 1,
					generatedOnDay: simulated.day,
					expiresOnDay: simulated.day + 1,
					target: { kind: 'company' },
					copy: { key: 'events.cashRecovery', params: {} },
					options: [
						{
							id: 'accept',
							effects: [{ kind: 'cash-adjust', amount: 100 }],
							modifiers: []
						}
					]
				}
			]
		};
		expect(refreshWorldProgress(game)).toBe(game);

		const resolved = resolveDecision(game, 'event-instance-1', 'accept');

		expect(resolved.ok).toBe(true);
		if (!resolved.ok) return;
		expect(resolved.game.world.revealedCityIds).toContain('garden-borough');
		expect(validateCurrentGameState(resolved.game)).toEqual(resolved.game);
	});

	test.each([
		{ collection: 'retail', dimension: 'width', value: 0 },
		{ collection: 'retail', dimension: 'height', value: 1.5 },
		{ collection: 'industry', dimension: 'width', value: 0 },
		{ collection: 'industry', dimension: 'height', value: 1.5 }
	] as const)(
		'strict validation rejects $collection city $dimension=$value',
		({ collection, dimension, value }) => {
			const game = createGame();
			const changed =
				collection === 'retail'
					? {
							...game,
							cities: [{ ...game.cities[0]!, [dimension]: value }]
						}
					: {
							...game,
							industryCities: [{ ...game.industryCities[0]!, [dimension]: value }]
						};

			expect(() => validateCurrentGameState(changed)).toThrow(
				new RegExp(`${dimension} must be a positive integer`)
			);
		}
	);

	test.each([
		{ field: 'x', value: 999, error: 'coordinates (999,0) must be within city bounds' },
		{ field: 'x', value: 0.5, error: 'x must be an integer' },
		{ field: 'cityId', value: 'ghost-city', error: 'cityId must match containing city harbor-city' }
	] as const)(
		'strict validation rejects malformed retail tile $field',
		({ field, value, error }) => {
			const game = createGame();
			const city = game.cities[0]!;
			const sample = city.tiles[0]!;
			const extra = {
				...sample,
				id: 'harbor-city-extra',
				x: 0,
				y: 0,
				[field]: value
			};

			expect(() =>
				validateCurrentGameState({
					...game,
					cities: [{ ...city, tiles: [...city.tiles, extra] }]
				})
			).toThrow(error);
		}
	);

	test.each([
		{ field: 'x', value: 3, error: 'coordinates (3,0) must be within city bounds' },
		{ field: 'x', value: 0.5, error: 'x must be an integer' },
		{
			field: 'cityId',
			value: 'ghost-city',
			error: 'cityId must match containing city industry-city'
		}
	] as const)(
		'strict validation rejects malformed industry tile $field',
		({ field, value, error }) => {
			const game = createGame();
			const city = game.industryCities[0]!;
			const extra: IndustryTile = {
				id: 'industry-city-extra',
				cityId: 'industry-city',
				x: 0,
				y: 0,
				terrain: 'industrial',
				resource: null,
				locked: false,
				[field]: value
			} as IndustryTile;

			expect(() =>
				validateCurrentGameState({
					...game,
					industryCities: [{ ...city, tiles: [...city.tiles, extra] }]
				})
			).toThrow(error);
		}
	);

	test.each(['retail', 'industry'] as const)(
		'strict validation rejects duplicate $kind city IDs',
		(kind) => {
			const game = createGame();
			const changed =
				kind === 'retail'
					? { ...game, cities: [...game.cities, structuredClone(game.cities[0]!)] }
					: {
							...game,
							industryCities: [...game.industryCities, structuredClone(game.industryCities[0]!)]
						};

			expect(() => validateCurrentGameState(changed)).toThrow(/city IDs must be unique/);
		}
	);

	test.each([
		{ kind: 'retail', defect: 'missing tile' },
		{ kind: 'retail', defect: 'duplicate tile ID' },
		{ kind: 'retail', defect: 'duplicate coordinate' },
		{ kind: 'industry', defect: 'missing tile' },
		{ kind: 'industry', defect: 'duplicate tile ID' },
		{ kind: 'industry', defect: 'duplicate coordinate' }
	] as const)('strict validation rejects $kind city topology: $defect', ({ kind, defect }) => {
		const game = createGame();
		const city = structuredClone(kind === 'retail' ? game.cities[0]! : game.industryCities[0]!);
		if (defect === 'missing tile') {
			city.tiles.pop();
		} else if (defect === 'duplicate tile ID') {
			city.tiles.at(-1)!.id = city.tiles[0]!.id;
		} else {
			city.tiles.at(-1)!.x = city.tiles[0]!.x;
			city.tiles.at(-1)!.y = city.tiles[0]!.y;
		}
		const changed =
			kind === 'retail'
				? { ...game, cities: [city as GameState['cities'][number]] }
				: { ...game, industryCities: [city as GameState['industryCities'][number]] };

		expect(() => validateCurrentGameState(changed)).toThrow(/city tile grid|tile IDs|coordinates/);
	});

	test('strict validation rejects rail coordinates that have no materialized industry tile', () => {
		const game = createGame();
		const city = structuredClone(game.industryCities[0]!);
		city.tiles = city.tiles.filter((tile) => tile.x !== 0 || tile.y !== 0);
		city.rails = [{ x: 0, y: 0, level: 1 }];

		expect(() => validateCurrentGameState({ ...game, industryCities: [city] })).toThrow(
			/rail.*actual tile/i
		);
	});

	test('strict validation rejects an unsupported tiny catalog retail city before placement validation', () => {
		const game = createGame();
		const tile = { ...game.cities[0]!.tiles[0]!, id: 'tiny-0-0', x: 0, y: 0 };
		const store = {
			...game.stores[0]!,
			tileId: tile.id,
			mapX: 0,
			mapY: 0,
			location: { neighborhoodId: tile.neighborhood, x: 0, y: 0 }
		};

		expect(() =>
			validateCurrentGameState({
				...game,
				cities: [{ ...game.cities[0]!, width: 1, height: 1, tiles: [tile] }],
				stores: [store]
			})
		).toThrow('must use the default 56x48 retail city size');
	});

	test.each([
		{ field: 'tileId', value: null, error: 'tileId must be a non-empty string' },
		{ field: 'mapX', value: '1', error: 'mapX must be a finite number' },
		{ field: 'mapY', value: Number.NaN, error: 'mapY must be a finite number' }
	])('current schema saves reject malformed store $field', ({ field, value, error }) => {
		const store = { ...createGame().stores[0]!, [field]: value };
		const record = createManualSaveRecord({
			game: { stores: [store as unknown as GameState['stores'][number]] }
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(error);
	});

	test.each([
		{ field: 'activeCityId', openedId: 'harbor-city' },
		{ field: 'activeIndustryCityId', openedId: 'industry-city' }
	] as const)(
		'strict validation rejects unopened active city through $field',
		({ field, openedId }) => {
			const game = createGame();
			const world = {
				...game.world,
				openedCityIds: game.world.openedCityIds.filter((cityId) => cityId !== openedId)
			};

			expect(() => validateCurrentGameState({ ...game, world, [field]: openedId })).toThrow(
				new RegExp(`${field} must reference an opened city`)
			);
		}
	);

	test.each([
		{ kind: 'retail', cityId: 'campus-junction' },
		{ kind: 'industry', cityId: 'breadbasket-basin' }
	] as const)(
		'strict validation rejects an opened unmaterialized $kind city',
		({ kind, cityId }) => {
			const game = createGame();
			const world = {
				...game.world,
				revealedCityIds: [...game.world.revealedCityIds, cityId],
				openedCityIds: [...game.world.openedCityIds, cityId]
			};

			expect(() => validateCurrentGameState({ ...game, world })).toThrow(
				new RegExp(`opened ${kind} city ${cityId} must be materialized`)
			);
		}
	);

	test('strict validation rejects a placed store in an unopened retail city', () => {
		const definition = getWorldCityDefinition('campus-junction')!;
		expect(definition.kind).toBe('retail');
		const campusCity = generateCity({
			id: definition.id,
			name: 'Campus Junction',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: definition.seed
		});
		const tile = campusCity.tiles.find((candidate) => isTileBuildable(candidate))!;
		const base = createGame();
		// Materialize campus-junction but omit it from openedCityIds. harbor-city
		// stays opened so the activeCityId check still passes. The store placed
		// in campus-junction must be rejected even though its footprint is valid.
		const game: GameState = {
			...base,
			cities: [...base.cities, campusCity],
			world: {
				...base.world,
				revealedCityIds: [...base.world.revealedCityIds, 'campus-junction']
			},
			stores: [
				{
					...base.stores[0]!,
					id: 'store-campus',
					cityId: 'campus-junction',
					tileId: tile.id,
					mapX: tile.x,
					mapY: tile.y,
					location: formatLocation(tile)
				}
			]
		};

		expect(() => validateCurrentGameState(game)).toThrow(
			/stores\[0\] must belong to an opened city \(found campus-junction\)/
		);
	});

	test('strict validation rejects a placed industrial building in an unopened industry city', () => {
		const base = createValidWarehouseBuildingGame();
		const warehouse = base.industrialBuildings[0]!;
		// Build a second materialized industry city (breadbasket-basin) that is
		// revealed but NOT opened, and relocate the warehouse into it. The
		// building footprint stays valid, so only the opened-city gate fires.
		const basinCity: GameState['industryCities'][number] = {
			id: 'breadbasket-basin',
			name: 'Breadbasket Basin',
			width: 3,
			height: 3,
			tiles: Array.from({ length: 9 }, (_, index) => {
				const x = index % 3;
				const y = Math.floor(index / 3);
				return {
					id: `breadbasket-basin-${x}-${y}`,
					cityId: 'breadbasket-basin',
					x,
					y,
					terrain: 'industrial',
					resource: null,
					locked: false
				};
			}),
			rails: []
		};
		const relocatedWarehouse = {
			...warehouse,
			cityId: 'breadbasket-basin',
			tileId: 'breadbasket-basin-0-0',
			mapX: 0,
			mapY: 0
		};
		const game: GameState = {
			...base,
			industryCities: [...base.industryCities, basinCity],
			industrialBuildings: [relocatedWarehouse],
			world: {
				...base.world,
				revealedCityIds: [...base.world.revealedCityIds, 'breadbasket-basin']
			}
		};

		expect(() => validateCurrentGameState(game)).toThrow(
			/industrialBuildings\[0\] must belong to an opened city \(found breadbasket-basin\)/
		);
	});

	test('strict validation accepts an unoccupied materialized city that is not opened', () => {
		const definition = getWorldCityDefinition('campus-junction')!;
		const campusCity = generateCity({
			id: definition.id,
			name: 'Campus Junction',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: definition.seed
		});
		const base = createGame();
		// campus-junction is materialized and revealed but not opened, and has
		// no stores or buildings. This must remain valid — the opened-city gate
		// only applies to placed entities, not to unoccupied generated cities.
		const game: GameState = {
			...base,
			cities: [...base.cities, campusCity],
			world: {
				...base.world,
				revealedCityIds: [...base.world.revealedCityIds, 'campus-junction']
			}
		};

		expect(() => validateCurrentGameState(game)).not.toThrow();
	});

	test.each([
		{ collection: 'retail', wrongId: 'industry-city' },
		{ collection: 'industry', wrongId: 'harbor-city' }
	] as const)(
		'strict validation rejects a catalog ID materialized in the $collection collection',
		({ collection, wrongId }) => {
			const game = createGame();
			if (collection === 'retail') {
				const wrongCity = structuredClone(game.cities[0]!);
				wrongCity.id = wrongId;
				wrongCity.tiles = wrongCity.tiles.map((tile) => ({
					...tile,
					id: tile.id.replace('harbor-city', wrongId),
					cityId: wrongId
				}));
				expect(() =>
					validateCurrentGameState({ ...game, cities: [...game.cities, wrongCity] })
				).toThrow(/retail city industry-city must use a retail catalog ID/);
			} else {
				const wrongCity = structuredClone(game.industryCities[0]!);
				wrongCity.id = wrongId;
				wrongCity.tiles = wrongCity.tiles.map((tile) => ({
					...tile,
					id: tile.id.replace('industry-city', wrongId),
					cityId: wrongId
				}));
				expect(() =>
					validateCurrentGameState({
						...game,
						industryCities: [...game.industryCities, wrongCity]
					})
				).toThrow(/industry city harbor-city must use an industry catalog ID/);
			}
		}
	);

	test.each(['activeCityId', 'activeIndustryCityId'] as const)(
		'strict validation rejects a cross-category active ID through $field',
		(field) => {
			const game = createGame();
			if (field === 'activeCityId') {
				const wrongCity = structuredClone(game.cities[0]!);
				wrongCity.id = 'industry-city';
				wrongCity.tiles = wrongCity.tiles.map((tile) => ({
					...tile,
					id: tile.id.replace('harbor-city', 'industry-city'),
					cityId: 'industry-city'
				}));
				expect(() =>
					validateCurrentGameState({
						...game,
						cities: [...game.cities, wrongCity],
						activeCityId: 'industry-city'
					})
				).toThrow(/activeCityId must reference a retail catalog city/);
			} else {
				const wrongCity = structuredClone(game.industryCities[0]!);
				wrongCity.id = 'harbor-city';
				wrongCity.tiles = wrongCity.tiles.map((tile) => ({
					...tile,
					id: tile.id.replace('industry-city', 'harbor-city'),
					cityId: 'harbor-city'
				}));
				expect(() =>
					validateCurrentGameState({
						...game,
						industryCities: [...game.industryCities, wrongCity],
						activeIndustryCityId: 'harbor-city'
					})
				).toThrow(/activeIndustryCityId must reference an industry catalog city/);
			}
		}
	);

	test.each([
		{ field: 'activeCityId', value: 'ghost-retail' },
		{ field: 'activeIndustryCityId', value: 'ghost-industry' }
	] as const)(
		'strict validation rejects missing active city through $field',
		({ field, value }) => {
			expect(() => validateCurrentGameState({ ...createGame(), [field]: value })).toThrow(
				new RegExp(`${field} must reference a materialized city`)
			);
		}
	);

	test.each([
		{
			name: 'missing city',
			mutate: (game: GameState) => ({
				...game,
				industrialBuildings: [{ ...game.industrialBuildings[0]!, cityId: 'ghost-city' }]
			})
		},
		{
			name: 'missing tile',
			mutate: (game: GameState) => ({
				...game,
				industrialBuildings: [{ ...game.industrialBuildings[0]!, tileId: 'ghost-tile' }]
			})
		},
		{
			name: 'off-grid footprint',
			mutate: (game: GameState) => {
				const city = game.industryCities[0]!;
				const edge = city.tiles.find(
					(tile) => tile.x === city.width - 1 && tile.y === city.height - 1
				)!;
				return {
					...game,
					industrialBuildings: [
						{
							...game.industrialBuildings[0]!,
							tileId: edge.id,
							mapX: edge.x,
							mapY: edge.y
						}
					]
				};
			}
		},
		{
			name: 'overlap',
			mutate: (game: GameState) => {
				const duplicate = { ...game.industrialBuildings[0]!, id: 'warehouse-overlap' };
				const withDuplicate = {
					...game,
					industrialBuildings: [...game.industrialBuildings, duplicate]
				};
				return {
					...withDuplicate
				};
			}
		}
	])('strict validation rejects industrial building $name', ({ name, mutate }) => {
		expect(() => validateCurrentGameState(mutate(createValidWarehouseBuildingGame()))).toThrow(
			name === 'missing city'
				? /industrialBuildings\[\d+\] must belong to an opened city/
				: /industrialBuildings\[\d+\] placement/
		);
	});

	test('strict validation rejects a fractional store cap', () => {
		expect(() => validateCurrentGameState(createGame({ storeCap: 3.5 }))).toThrow(
			'Saved game storeCap must be an integer'
		);
	});

	test('strict validation rejects a locked product category substituted at the same count', () => {
		const store = createGame().stores[0]!;
		const products = initializeStoreProducts('boutique', 4);
		const lockedSubstitution = [products[0]!, { ...products[1]!, productId: 'gifts' as const }];

		expect(() =>
			validateCurrentGameState(
				createGame({
					stores: [
						{
							...store,
							level: 4,
							products: lockedSubstitution,
							stockHealth: calculateStockHealth(lockedSubstitution)
						}
					]
				})
			)
		).toThrow('products[1] productId must be unlocked at level 4');
	});

	test('current schema save record rejects stale stock health rather than recalculating it', () => {
		const store = createGame().stores[0]!;
		const staleStore = { ...store, stockHealth: store.stockHealth + 1 };
		const record = createManualSaveRecord({ game: { stores: [staleStore] } });

		expect(() => validateCurrentGameState(createGame({ stores: [staleStore] }))).toThrow(
			'stockHealth must match its products'
		);
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game stores[0] stockHealth must match its products'
		);
	});

	test.each([
		{
			name: 'store level',
			createRecord: () => {
				const { level: _level, ...withoutLevel } = createGame().stores[0]!;
				void _level;
				return createManualSaveRecord({
					game: { stores: [withoutLevel as GameState['stores'][number]] }
				});
			},
			message: 'Saved game stores[0] level must be a finite number'
		},
		{
			name: 'industrial building level',
			createRecord: () => {
				const { level: _level, ...withoutLevel } = createIndustrialBuilding();
				void _level;
				return createManualSaveRecord({
					game: {
						industrialBuildings: [withoutLevel as GameState['industrialBuildings'][number]]
					}
				});
			},
			message: 'Saved game industrialBuildings[0] level must be a finite number'
		},
		{
			name: 'staff level',
			createRecord: () => {
				const member: GameState['staff'][number] = {
					id: 'staff-1',
					name: 'Alex',
					role: 'manager',
					monthlySalary: 2_000,
					skill: 60,
					morale: 60,
					assignedStoreId: 'store-1',
					hiredOnDay: 1,
					level: 1,
					xp: 0
				};
				const { level: _level, ...withoutLevel } = member;
				void _level;
				return createManualSaveRecord({
					game: { staff: [withoutLevel as GameState['staff'][number]] }
				});
			},
			message: 'Saved game staff[0] level must be a finite number'
		},
		{
			name: 'staff xp',
			createRecord: () => {
				const member: GameState['staff'][number] = {
					id: 'staff-1',
					name: 'Alex',
					role: 'manager',
					monthlySalary: 2_000,
					skill: 60,
					morale: 60,
					assignedStoreId: 'store-1',
					hiredOnDay: 1,
					level: 1,
					xp: 0
				};
				const { xp: _xp, ...withoutXp } = member;
				void _xp;
				return createManualSaveRecord({
					game: { staff: [withoutXp as GameState['staff'][number]] }
				});
			},
			message: 'Saved game staff[0] xp must be a finite number'
		}
	])(
		'current schema save record rejects missing $name rather than reconstructing it',
		({ createRecord, message }) => {
			expect(() => validateSaveRecord(createRecord())).toThrow(message);
		}
	);

	test('current schema save record rejects an over-capacity building buffer rather than clamping it', () => {
		const mill = createIndustrialBuilding({
			typeId: 'flour-mill',
			inventory: { grain: 80, flour: 80 }
		});
		const record = createManualSaveRecord({ game: { industrialBuildings: [mill] } });

		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game industrialBuildings[0] inventory must fit its recipe buffer'
		);
	});

	test('current schema saves reject non-finite stock health', () => {
		const store = createGame().stores[0]!;
		const record = createManualSaveRecord({
			game: { stores: [{ ...store, stockHealth: Number.NaN }] }
		});

		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game stores[0] stockHealth must be a finite number'
		);
	});

	test('strict validation accepts authority-only city inventory records', () => {
		expect.assertions(2);
		const cityInventories = [{ cityId: 'industry-city' as const, materials: { water: 1 } }];
		const game = createGame({ cityInventories });

		expect(validateCurrentGameState(game)).toEqual(game);
		expect(
			validateSaveRecord(createManualSaveRecord({ game: { cityInventories } })).game.cityInventories
		).toEqual(cityInventories);
	});

	test('strict current-game cloning preserves -0 and enumerable cloneable extras', () => {
		const game = Object.assign(createGame({ cash: -0 }), {
			optionalExtra: undefined,
			cloneableExtra: { nested: true }
		});

		const validated = validateCurrentGameState(game);

		expect(Object.is(validated.cash, -0)).toBe(true);
		expect(Object.hasOwn(validated, 'optionalExtra')).toBe(true);
		expect((validated as GameState & { optionalExtra?: unknown }).optionalExtra).toBeUndefined();
		expect((validated as GameState & { cloneableExtra: unknown }).cloneableExtra).toEqual({
			nested: true
		});
		expect((validated as GameState & { cloneableExtra: unknown }).cloneableExtra).not.toBe(
			game.cloneableExtra
		);
	});

	test('current schema save record rejects stale world progress rather than refreshing it', () => {
		const stale = {
			...createGame(),
			day: 7,
			finance: createFoundingFinanceState(7, 2_000)
		};

		expect(() => validateCurrentGameState(stale)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(createManualSaveRecord({ game: stale }))).toThrow(
			'Saved game world progress must already be current'
		);
	});

	test('SaveDataError defaults to corrupt code', () => {
		expect.assertions(1);
		const error = new SaveDataError('some validation failure');
		expect(error.code).toBe('corrupt');
	});

	test('SaveDataError preserves an explicit code', () => {
		expect.assertions(1);
		const error = new SaveDataError('storage is gone', 'storage-unavailable');
		expect(error.code).toBe('storage-unavailable');
	});

	test('parseSaveStoreSnapshot re-throws SaveDataError from validation unchanged', () => {
		expect.assertions(2);
		const invalid = JSON.stringify({ schemaVersion: 99, autoSave: null, manualSlots: [] });

		expect(() => parseSaveStoreSnapshot(invalid)).toThrow(SaveDataError);
		expect(() => parseSaveStoreSnapshot(invalid)).toThrow('Unsupported save schema version: 99');
	});

	test('parseSaveStoreSnapshot wraps non-JSON input as SaveDataError', () => {
		expect.assertions(2);

		expect(() => parseSaveStoreSnapshot('{not json')).toThrow(SaveDataError);
		expect(() => parseSaveStoreSnapshot('{not json')).toThrow('Save data is not valid JSON');
	});

	test('validateSaveRecord rejects unsupported schema versions', () => {
		expect.assertions(2);
		const record = { ...createManualSaveRecord(), schemaVersion: 99 };

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('Unsupported save schema version: 99');
	});

	test('validateSaveRecord rejects unsupported save slot kinds', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			metadata: { kind: 'other' as SaveSlotKind }
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('Unsupported save slot kind: other');
	});

	test('validateSaveStoreSnapshot rejects an auto-save with a non-auto kind', () => {
		expect.assertions(2);
		const autoSave = createSaveRecord(createGame(), {
			id: AUTO_SAVE_SLOT_ID,
			name: 'Auto-save',
			kind: 'manual',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});
		const snapshot: SaveStoreSnapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave,
			manualSlots: []
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Auto-save must have auto metadata kind: autosave'
		);
	});

	test('validateSaveStoreSnapshot rejects an auto-save without the reserved slot id', () => {
		expect.assertions(2);
		const autoSave = createSaveRecord(createGame(), {
			id: 'wrong-id',
			name: 'Auto-save',
			kind: 'auto',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});
		const snapshot: SaveStoreSnapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave,
			manualSlots: []
		};

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Auto-save must use slot id: autosave'
		);
	});

	test('rejects non-object store, building, and staff entries during validation', () => {
		expect.assertions(2);
		const game = createGame({
			stores: [null as unknown as GameState['stores'][number]],
			industrialBuildings: [null as unknown as GameState['industrialBuildings'][number]],
			staff: [null as unknown as GameState['staff'][number]]
		});
		const record = createManualSaveRecord({ game });

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game industrialBuildings[0] must be an object'
		);
	});

	test('regenerates the documented 28x24 retail-city exception before strict validation', () => {
		expect.assertions(8);
		// harbor-city-19-1 is campus in the old 28x24 city but residential in
		// the regenerated 56x48 city (getNeighborhood is size-dependent). The
		// store stays at the same tile id/coordinates, so the codec's valid
		// branch must still refresh location/localDemand from the new tile —
		// simulateDay reads localDemand, so a stale value skews revenue. The
		// anchor is chosen so its full 2x2 footprint stays buildable after
		// regeneration (pass 1 validates the whole footprint, not just the
		// anchor — an anchor like 13-1 whose footprint now straddles a river
		// would be relocated, not kept).
		const oldCity = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 28,
			height: 24,
			seed: 20260505
		});
		const newCity = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		const oldTile = oldCity.tiles.find((tile) => tile.id === 'harbor-city-19-1')!;
		const newTile = newCity.tiles.find((tile) => tile.id === 'harbor-city-19-1')!;
		expect(oldTile.neighborhood).not.toBe(newTile.neighborhood);
		expect(isTileBuildable(newTile)).toBe(true);
		// Guard against regressing to an anchor-only check: every footprint
		// tile must be buildable in the regenerated city.
		const newFootprintAllBuildable = newCity.tiles
			.filter(
				(t) => t.x >= newTile.x && t.x < newTile.x + 2 && t.y >= newTile.y && t.y < newTile.y + 2
			)
			.every((t) => isTileBuildable(t));
		expect(newFootprintAllBuildable).toBe(true);

		const record = createManualSaveRecord({
			game: {
				cities: [{ id: 'harbor-city', name: 'Harbor City', width: 28, height: 24, tiles: [] }],
				stores: [
					{
						...createGame().stores[0]!,
						cityId: 'harbor-city',
						tileId: 'harbor-city-19-1',
						mapX: 19,
						mapY: 1,
						location: formatLocation(oldTile),
						localDemand: computeStoreLocalDemand(oldTile)
					}
				]
			}
		});

		const validated = validateSaveRecord(record);
		const store = validated.game.stores[0]!;
		// The store is NOT relocated — same tile id/coordinates.
		expect(store.tileId).toBe('harbor-city-19-1');
		expect(store.mapX).toBe(19);
		expect(store.mapY).toBe(1);
		// But tile-derived fields must match the regenerated (residential) tile.
		expect(store.location).toEqual(formatLocation(newTile));
		expect(store.localDemand).toBe(computeStoreLocalDemand(newTile));
	});

	test('current schema saves reject an unsupported 20x20 retail city after strict decoding', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: 20,
			height: 20,
			seed: 20260505
		});
		const tile = findFixtureStoreTile(city);

		const record = createManualSaveRecord({
			game: {
				cities: [city],
				stores: [
					{
						...createGame().stores[0]!,
						cityId: city.id,
						tileId: tile.id,
						mapX: tile.x,
						mapY: tile.y,
						location: formatLocation(tile),
						localDemand: computeStoreLocalDemand(tile)
					}
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game cities[0] must use the default 56x48 retail city size'
		);
	});

	test('does not relocate a valid store when an earlier invalid store targets its tile', () => {
		expect.assertions(3);
		// Regenerate the same 56x48 harbor-city the codec produces (seed comes
		// from game.seed for harbor-city) so we can pick a buildable tile that
		// exists in the regenerated city deterministically.
		const referenceCity = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		const validTile = referenceCity.tiles.find((tile) => isTileBuildable(tile));
		expect(validTile).toBeDefined();

		const baseStore = createGame().stores[0]!;
		// Invalid store is intentionally FIRST in the array. Its stale tileId
		// ('harbor-city-28-8' is non-buildable after regeneration) forces the
		// fallback closest-tile search, whose origin sits exactly on the valid
		// store's tile. Under the old single-pass this would steal that tile.
		const invalidStore = {
			...baseStore,
			id: 'store-invalid',
			cityId: 'harbor-city',
			tileId: 'harbor-city-28-8',
			mapX: validTile!.x,
			mapY: validTile!.y
		};
		const validStore = {
			...baseStore,
			id: 'store-valid',
			cityId: 'harbor-city',
			tileId: validTile!.id,
			mapX: validTile!.x,
			mapY: validTile!.y
		};

		const game = refreshWorldProgress({
			...createGame(),
			cities: [{ id: 'harbor-city', name: 'Harbor City', width: 28, height: 24, tiles: [] }],
			stores: [invalidStore, validStore]
		});
		const record = createManualSaveRecord({
			game
		});

		const validated = validateSaveRecord(record);
		const resultValid = validated.game.stores.find((store) => store.id === 'store-valid')!;
		const resultInvalid = validated.game.stores.find((store) => store.id === 'store-invalid')!;

		expect(resultValid.tileId).toBe(validTile!.id);
		expect(resultInvalid.tileId).not.toBe(validTile!.id);
	});

	test('relocated stores never overlap a valid store footprint after city regeneration', () => {
		expect.assertions(11);
		// Regenerate the same 56x48 harbor-city the codec produces (seed comes
		// from game.seed for harbor-city). Anchor A=(1,1) and adjacent anchor
		// B=(2,1) are both buildable, and their 2x2 footprints share tiles
		// (2,1) and (2,2). A valid store sits at A; an invalid store whose
		// saved origin is B (with a non-buildable stale tileId) must NOT be
		// relocated onto B, because B's footprint overlaps A's. The codec must
		// reserve A's full footprint in pass 1 and reject B's anchor in pass 2.
		const referenceCity = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		const anchorA = referenceCity.tiles.find((tile) => tile.id === 'harbor-city-1-1')!;
		const anchorB = referenceCity.tiles.find((tile) => tile.id === 'harbor-city-2-1')!;
		expect(isTileBuildable(anchorA)).toBe(true);
		expect(isTileBuildable(anchorB)).toBe(true);

		const baseStore = createGame().stores[0]!;
		const validStore = {
			...baseStore,
			id: 'store-valid',
			cityId: 'harbor-city',
			tileId: anchorA.id,
			mapX: anchorA.x,
			mapY: anchorA.y
		};
		// Invalid store: stale non-buildable tileId forces the closest-tile
		// fallback; origin sits exactly on B so B is the distance-0 candidate.
		const invalidStore = {
			...baseStore,
			id: 'store-invalid',
			cityId: 'harbor-city',
			tileId: 'harbor-city-28-8',
			mapX: anchorB.x,
			mapY: anchorB.y
		};

		const game = refreshWorldProgress({
			...createGame(),
			seed: 20260505,
			cities: [{ id: 'harbor-city', name: 'Harbor City', width: 28, height: 24, tiles: [] }],
			stores: [validStore, invalidStore]
		});
		const record = createManualSaveRecord({
			game
		});

		const validated = validateSaveRecord(record);
		const city = validated.game.cities[0]!;
		const tileById = new Map(city.tiles.map((tile) => [tile.id, tile] as const));
		// Collect each store's full 2x2 footprint tile ids and assert no two
		// stores in this city share a footprint tile. Each store must own all
		// four footprint tiles — a relocated store missing any tile would
		// silently pass the overlap check if missing tiles were skipped.
		const footprintIdsByStore = validated.game.stores
			.filter((store) => store.cityId === city.id)
			.map((store) => {
				const ax = tileById.get(store.tileId)?.x ?? store.mapX;
				const ay = tileById.get(store.tileId)?.y ?? store.mapY;
				const ids = new Set<string>();
				for (let dy = 0; dy < 2; dy += 1) {
					for (let dx = 0; dx < 2; dx += 1) {
						const t = city.tiles.find((tile) => tile.x === ax + dx && tile.y === ay + dy);
						expect(t).toBeDefined();
						ids.add(t!.id);
					}
				}
				return { id: store.id, ids };
			});

		for (let i = 0; i < footprintIdsByStore.length; i += 1) {
			for (let j = i + 1; j < footprintIdsByStore.length; j += 1) {
				const a = footprintIdsByStore[i]!;
				const b = footprintIdsByStore[j]!;
				const shared = [...a.ids].filter((id) => b.ids.has(id));
				expect(shared).toEqual([]);
			}
		}
	});

	test('current schema saves reject a non-buildable store footprint without relocating it', () => {
		expect.assertions(3);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		// Pick an interior buildable anchor whose right footprint neighbor is
		// also buildable, then poison that neighbor with a river feature. The
		// anchor stays buildable but its 2x2 footprint now contains a
		// non-buildable tile.
		const anchor = city.tiles.find(
			(t) =>
				isTileBuildable(t) &&
				t.x < city.width - 1 &&
				city.tiles.some((n) => n.x === t.x + 1 && n.y === t.y && isTileBuildable(n))
		)!;
		expect(anchor).toBeDefined();
		const poisonedNeighbor = city.tiles.find((t) => t.x === anchor.x + 1 && t.y === anchor.y)!;
		poisonedNeighbor.feature = 'river';
		const baseStore = createGame().stores[0]!;
		const record = createManualSaveRecord({
			game: {
				cities: [city],
				stores: [
					{
						...baseStore,
						id: 'store-footprint',
						cityId: 'harbor-city',
						tileId: anchor.id,
						mapX: anchor.x,
						mapY: anchor.y
					}
				]
			} as unknown as Partial<GameState>
		});

		expect(() => validateCurrentGameState(record.game)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game stores[0] placement must already match a buildable, non-overlapping city footprint'
		);
	});

	test('current schema saves reject a stale store when no buildable tile remains', () => {
		expect.assertions(2);
		// A 2x2 city whose only tile is locked has no valid store footprint.
		const lockedTile = {
			id: 'harbor-city-0-0',
			cityId: 'harbor-city',
			x: 0,
			y: 0,
			neighborhood: 'downtown' as const,
			terrain: 'commercial' as const,
			feature: null,
			demand: 50,
			rent: 1000,
			footTraffic: 50,
			customerFit: 50,
			locked: true
		};
		const baseStore = createGame().stores[0]!;
		const staleStore = {
			...baseStore,
			id: 'store-stale',
			cityId: 'harbor-city',
			tileId: 'harbor-city-0-0',
			mapX: 0,
			mapY: 0
		};

		const record = createManualSaveRecord({
			game: {
				cities: [
					{
						id: 'harbor-city',
						name: 'Harbor City',
						width: 2,
						height: 2,
						tiles: [lockedTile]
					}
				],
				stores: [staleStore]
			}
		});

		expect(() => validateCurrentGameState(record.game)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('strict validation rejects a store whose city is not materialized', () => {
		const store = createGame().stores[0]!;
		const game = createGame({ stores: [{ ...store, cityId: 'missing-city' }] });

		expect(() => validateCurrentGameState(game)).toThrow(
			'Saved game stores[0] must belong to an opened city (found missing-city)'
		);
	});

	test('strict validation rejects a production-sized city with no placement topology', () => {
		const game = createNewGame('convenience', 20260722);
		const harborCity = game.cities.find((city) => city.id === 'harbor-city')!;
		const cities = game.cities.map((city) =>
			city.id === harborCity.id ? { ...city, tiles: [] } : city
		);

		expect(() => validateCurrentGameState({ ...game, cities })).toThrow(
			'Saved game cities[0] city tile grid must contain exactly width * height tiles'
		);
	});

	test('current schema saves reject missing world progress instead of inferring it', () => {
		const game = { world: undefined } as unknown as Partial<GameState>;

		expect(() => validateSaveRecord(createManualSaveRecord({ game }))).toThrow(
			'Saved game world must be an object'
		);
	});

	test('validates production reports with populated material movement arrays', () => {
		expect.assertions(1);
		const movement = (
			materialId: DailyMaterialMovement['materialId'],
			source: DailyMaterialMovement['source']
		): DailyMaterialMovement => ({
			cityId: source === 'overflow' ? 'harbor-city' : 'industry-city',
			materialId,
			quantity: 5,
			value: 10,
			source
		});
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				consumed: [movement('grain', 'local')],
				importedInputs: [movement('water', 'import')],
				warehousePulls: [movement('snacks', 'warehouse')],
				shopImports: [movement('bottled-water', 'overflow')]
			})
		});
		const snapshot = createSnapshotWithGame(withCurrentReports(createGame(), [report]));

		expect(() => validateSaveStoreSnapshot(snapshot)).not.toThrow();
	});

	test('historical report decoding drops a malformed production movement', () => {
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				produced: [null as unknown as DailyMaterialMovement]
			})
		});
		const record = createManualSaveRecord({ game: { reports: [report] } });

		expectHistoricalReportDropped(() => validateSaveRecord(record).game);
	});

	test('current schema saves reject malformed city tiles', () => {
		const record = createManualSaveRecord({
			game: {
				cities: [
					{
						...createGame().cities[0]!,
						tiles: [null as unknown as GameState['cities'][number]['tiles'][number]]
					}
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game cities[0] tiles[0] must be an object'
		);
	});

	test('rejects a city tile whose locked field is not a boolean', () => {
		expect.assertions(2);
		const snapshot = createSnapshotWithGame({
			...createGame(),
			cities: [
				{
					id: 'harbor-city',
					name: 'Harbor City',
					width: 1,
					height: 1,
					tiles: [
						{
							id: 'tile-1',
							cityId: 'harbor-city',
							x: 0,
							y: 0,
							neighborhood: 'downtown',
							terrain: 'commercial',
							feature: null,
							demand: 72,
							rent: 180,
							footTraffic: 66,
							customerFit: 70,
							locked: 1 as unknown as boolean
						}
					]
				}
			]
		});

		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(SaveDataError);
		expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(
			'Saved game cities[0] tiles[0] locked must be a boolean'
		);
	});

	test('cloneSaveStoreSnapshot deep-clones a valid snapshot', () => {
		expect.assertions(3);
		const snapshot = createSnapshotWithGame(createGame());
		const cloned = cloneSaveStoreSnapshot(snapshot);

		expect(cloned).toEqual(snapshot);
		expect(cloned).not.toBe(snapshot);
		expect(cloned.manualSlots[0]).not.toBe(snapshot.manualSlots[0]);
	});

	test('createSaveSummary projects slot metadata from a snapshot', () => {
		expect.assertions(3);
		const autoSave = createSaveRecord(createGame(), {
			id: AUTO_SAVE_SLOT_ID,
			name: 'Auto-save',
			kind: 'auto',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});
		const snapshot: SaveStoreSnapshot = {
			schemaVersion: SAVE_SCHEMA_VERSION,
			autoSave,
			manualSlots: [createManualSaveRecord()]
		};

		const summary = createSaveSummary(snapshot);

		expect(summary.autoSave?.id).toBe(AUTO_SAVE_SLOT_ID);
		expect(summary.autoSave).not.toBe(autoSave.metadata);
		expect(summary.manualSlots[0]?.id).toBe('manual-test-run');
	});

	test('validateSaveRecord rejects invalid pricing posture', () => {
		expect.assertions(2);
		const game = createGame({
			policy: { ...createGame().policy, pricing: 'invalid' as never }
		});
		const record = createManualSaveRecord({ game });

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('must be one of:');
	});

	test('validateSaveRecord rejects an unknown material id in city inventory', () => {
		expect.assertions(2);
		const game = createGame({
			cityInventories: [
				{
					cityId: 'industry-city',
					materials: { 'unknown-material': 10 } as Partial<Record<MaterialId, number>>
				}
			]
		});
		const record = createManualSaveRecord({ game });

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('must be a known material');
	});

	test('validateSaveRecord rejects non-finite number in scorecard', () => {
		expect.assertions(2);
		const game = createGame({
			scorecard: { ...createGame().scorecard, profit: NaN }
		});
		const record = createManualSaveRecord({ game });

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('must be a finite number');
	});

	test('rejects saves whose cities field is not an array without regenerating', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: { cities: undefined } as unknown as Partial<GameState>
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('Saved game cities must be an array');
	});

	test('leaves non-object and non-string-id city entries untouched during normalization', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				cities: [
					null as unknown as GameState['cities'][number],
					{ id: 123, name: 'Bad', width: 28, height: 24, tiles: [] }
				]
			} as unknown as Partial<GameState>
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('must be an object');
	});

	test('regenerates a non-harbor 28x24 retail city using its definition seed', () => {
		expect.assertions(4);
		const definition = getWorldCityDefinition('campus-junction')!;
		expect(definition.kind).toBe('retail');
		// Use a seed that differs from the definition seed so we can assert the
		// definition seed (not game.seed) was used for non-harbor retail cities.
		const record = createManualSaveRecord({
			game: {
				seed: 999,
				activeCityId: 'campus-junction',
				world: {
					...createInitialWorldProgress(),
					revealedCityIds: ['harbor-city', 'industry-city', 'campus-junction'],
					openedCityIds: ['harbor-city', 'industry-city', 'campus-junction']
				},
				cities: [
					createFixtureRetailCity(),
					{
						id: 'campus-junction',
						name: 'Campus Junction',
						width: 28,
						height: 24,
						tiles: []
					}
				],
				retailSupplyAssignments: [
					{ retailCityId: 'harbor-city', supplyCityId: 'industry-city' },
					{ retailCityId: 'campus-junction', supplyCityId: 'industry-city' }
				],
				stores: []
			} as unknown as Partial<GameState>
		});

		const validated = validateSaveRecord(record);
		const city = validated.game.cities.find((candidate) => candidate.id === 'campus-junction')!;
		const reference = generateCity({
			id: definition.id,
			name: 'Campus Junction',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: definition.seed
		});

		expect(city.width).toBe(DEFAULT_RETAIL_CITY_WIDTH);
		expect(city.height).toBe(DEFAULT_RETAIL_CITY_HEIGHT);
		expect(city.tiles).toEqual(reference.tiles);
	});

	test('uses the definition name when a regenerated 28x24 city has a non-string name', () => {
		expect.assertions(1);
		const record = createManualSaveRecord({
			game: {
				cities: [
					{
						id: 'harbor-city',
						name: 123 as unknown as string,
						width: 28,
						height: 24,
						tiles: []
					}
				],
				stores: []
			} as unknown as Partial<GameState>
		});

		const validated = validateSaveRecord(record);
		expect(validated.game.cities[0]!.name).toBe('Harbor City');
	});

	test('current schema saves reject stale store coordinates without relocating them', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		const tile = city.tiles.find((t) => isTileBuildable(t))!;
		const record = createManualSaveRecord({
			game: {
				cities: [city],
				stores: [
					{
						...createGame().stores[0]!,
						cityId: 'harbor-city',
						tileId: tile.id,
						mapX: tile.x + 5,
						mapY: tile.y + 5,
						location: formatLocation(tile),
						localDemand: 1
					}
				]
			} as unknown as Partial<GameState>
		});
		expect(() => validateCurrentGameState(record.game)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game stores[0] placement must already match a buildable, non-overlapping city footprint'
		);
	});

	test('current schema saves reject overlapping store footprints without reassigning a tile', () => {
		expect.assertions(1);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		const tile = city.tiles.find((t) => isTileBuildable(t))!;
		const baseStore = createGame().stores[0]!;
		const record = createManualSaveRecord({
			game: {
				cities: [city],
				stores: [
					{
						...baseStore,
						id: 'store-a',
						cityId: 'harbor-city',
						tileId: tile.id,
						mapX: tile.x,
						mapY: tile.y
					},
					{
						...baseStore,
						id: 'store-b',
						cityId: 'harbor-city',
						tileId: tile.id,
						mapX: tile.x,
						mapY: tile.y
					}
				]
			} as unknown as Partial<GameState>
		});

		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game stores[1] placement must already match a buildable, non-overlapping city footprint'
		);
	});

	test('rejects a store whose saved cityId is not in the city list', () => {
		expect.assertions(2);
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		const tile = city.tiles.find((t) => isTileBuildable(t))!;
		const record = createManualSaveRecord({
			game: {
				cities: [city],
				stores: [
					{
						...createGame().stores[0]!,
						cityId: 'ghost-city',
						tileId: tile.id,
						mapX: tile.x,
						mapY: tile.y
					}
				]
			} as unknown as Partial<GameState>
		});

		expect(() => validateCurrentGameState(record.game)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
	});

	test('leaves a store untouched when its cityId is not a string', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				stores: [
					{
						...createGame().stores[0]!,
						cityId: 123 as unknown as string,
						tileId: 'harbor-city-1-1'
					}
				]
			} as unknown as Partial<GameState>
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game stores[0] cityId must be a non-empty string'
		);
	});

	test('does not relocate malformed non-string tileId when no buildable tile remains', () => {
		expect.assertions(2);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const lockedTile = {
			id: 'harbor-city-0-0',
			cityId: 'harbor-city',
			x: 0,
			y: 0,
			neighborhood: 'downtown' as const,
			terrain: 'commercial' as const,
			feature: null,
			demand: 50,
			rent: 1000,
			footTraffic: 50,
			customerFit: 50,
			locked: true
		};
		const record = createManualSaveRecord({
			game: {
				cities: [
					{
						id: 'harbor-city',
						name: 'Harbor City',
						width: 2,
						height: 2,
						tiles: [lockedTile]
					}
				],
				stores: [
					{
						...createGame().stores[0]!,
						id: undefined as unknown as string,
						cityId: 'harbor-city',
						tileId: undefined as unknown as string,
						mapX: undefined as unknown as number,
						mapY: undefined as unknown as number
					}
				]
			} as unknown as Partial<GameState>
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test('does not relocate a store with an unknown id and non-string tileId', () => {
		expect.assertions(2);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const city = generateCity({
			id: 'harbor-city',
			name: 'Harbor City',
			width: DEFAULT_RETAIL_CITY_WIDTH,
			height: DEFAULT_RETAIL_CITY_HEIGHT,
			seed: 20260505
		});
		const record = createManualSaveRecord({
			game: {
				cities: [city],
				stores: [
					{
						...createGame().stores[0]!,
						id: undefined as unknown as string,
						cityId: 'harbor-city',
						tileId: undefined as unknown as string,
						// Non-number coords force the closest-tile search to use its
						// (1, 1) default origin and exercise the '?' fallbacks in the
						// relocation warning for every stale coordinate field.
						mapX: undefined as unknown as number,
						mapY: undefined as unknown as number
					}
				]
			} as unknown as Partial<GameState>
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(warnSpy).not.toHaveBeenCalled();
	});

	test('createSaveRecord stores the active city ID even when the city is missing from the cities array', () => {
		expect.assertions(1);
		const game = createGame({ activeCityId: 'nonexistent-city' });
		const record = createSaveRecord(game, {
			id: 'manual-test',
			name: 'Test',
			kind: 'manual',
			updatedAt: new Date('2026-05-05T12:00:00.000Z')
		});

		expect(record.metadata.activeCityId).toBe('nonexistent-city');
	});

	test('createManualSlotId falls back to "slot" when the name produces an empty slug', () => {
		expect.assertions(1);
		const id = createManualSlotId('!!!', new Date('2026-05-05T12:00:00.000Z'));

		expect(id).toContain('slot');
	});

	test('current schema saves reject a missing store cap instead of inferring it', () => {
		const game = { storeCap: undefined } as unknown as Partial<GameState>;

		expect(() => validateSaveRecord(createManualSaveRecord({ game }))).toThrow(
			'Saved game storeCap must be a finite number'
		);
	});

	test('validateSavedDecisionContext rejects an unknown context code', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				decisions: [
					{
						kind: 'system',
						id: 'unknown-ctx-1',
						title: 'Unknown',
						context: { code: 'notARealCode' },
						expiresOnDay: 3,
						options: [{ id: 'acknowledge', label: 'Ack', description: '...' }]
					} as unknown as GameState['decisions'][number]
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'context code must be a known decision context code'
		);
	});

	test('validateSavedDecisionContext rejects locationBlocked with an invalid reason', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				decisions: [
					{
						kind: 'system',
						id: 'loc-blocked-1',
						title: 'Location unavailable',
						context: { code: 'locationBlocked', reason: 'flood' },
						expiresOnDay: 3,
						options: [{ id: 'acknowledge', label: 'Ack', description: '...' }]
					} as unknown as GameState['decisions'][number]
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('context reason must be locked|road|river');
	});

	test('validateSavedDecisionContext rejects worldCityNotAvailableYet with an unknown cityId', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				decisions: [
					{
						kind: 'system',
						id: 'world-city-1',
						title: 'City not available',
						context: { code: 'worldCityNotAvailableYet', cityId: 'not-a-city' },
						expiresOnDay: 3,
						options: [{ id: 'acknowledge', label: 'Ack', description: '...' }]
					} as unknown as GameState['decisions'][number]
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'context cityId must be a known WorldCityId: not-a-city'
		);
	});

	test('validateSavedDecisionContext rejects industrialRequiresResource with an unknown resource', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				decisions: [
					{
						kind: 'system',
						id: 'ind-res-1',
						title: 'Industrial delayed',
						context: { code: 'industrialRequiresResource', resourceId: 'unobtainium' },
						expiresOnDay: 3,
						options: [{ id: 'acknowledge', label: 'Ack', description: '...' }]
					} as unknown as GameState['decisions'][number]
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'must be a known industry resource id: unobtainium'
		);
	});

	test('validateSavedDecisionContext rejects industrialRequiresCash with an unknown building type', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				decisions: [
					{
						kind: 'system',
						id: 'ind-cash-1',
						title: 'Industrial delayed',
						context: {
							code: 'industrialRequiresCash',
							buildingTypeId: 'not-a-building',
							cash: 5000
						},
						expiresOnDay: 3,
						options: [{ id: 'acknowledge', label: 'Ack', description: '...' }]
					} as unknown as GameState['decisions'][number]
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'must be a known industrial building type id: not-a-building'
		);
	});

	test('validateSavedDecisionContext round-trips all structured context codes', () => {
		// Compile-time-exhaustive: ALL_DECISION_CONTEXTS is typed as
		// Record<DecisionContext['code'], DecisionContext>, so adding a new
		// variant to the union without adding a key here is a TypeScript error.
		// Runtime: each context is round-tripped through validateSaveRecord, so
		// a missing case in validateSavedDecisionContext's switch throws. This
		// guards against the class of gap where a new DecisionContext code was
		// added to the union and the factories but not the save-codec switch.
		expect.assertions(2);
		const ALL_DECISION_CONTEXTS: Record<DecisionContext['code'], DecisionContext> = {
			expansionUnavailable: { code: 'expansionUnavailable', storeCap: 3 },
			expansionCashBlocked: { code: 'expansionCashBlocked', cash: 1000 },
			locationBlocked: { code: 'locationBlocked', reason: 'locked' },
			locationGeneric: { code: 'locationGeneric' },
			worldCityOpeningCost: { code: 'worldCityOpeningCost', cash: 18000 },
			worldCityUnknown: { code: 'worldCityUnknown' },
			worldCityNotAvailableYet: { code: 'worldCityNotAvailableYet', cityId: 'campus-junction' },
			industrialUnknownTile: { code: 'industrialUnknownTile' },
			industrialUnknownBuilding: { code: 'industrialUnknownBuilding' },
			industrialLockedTile: { code: 'industrialLockedTile' },
			industrialOccupiedTile: { code: 'industrialOccupiedTile' },
			industrialRequiresResource: { code: 'industrialRequiresResource', resourceId: 'grain-field' },
			industrialRequiresIndustrialTile: { code: 'industrialRequiresIndustrialTile' },
			industrialRequiresCash: {
				code: 'industrialRequiresCash',
				buildingTypeId: 'warehouse',
				cash: 1000
			},
			cashPressure: { code: 'cashPressure' },
			expansionOpportunity: { code: 'expansionOpportunity' },
			supplierTerms: { code: 'supplierTerms' },
			railUnknownBuilding: { code: 'railUnknownBuilding' },
			railCrossCity: { code: 'railCrossCity' },
			railSelfConnected: { code: 'railSelfConnected' },
			railNoValidPath: { code: 'railNoValidPath' },
			railAlreadyConnected: { code: 'railAlreadyConnected' },
			railRequiresCash: { code: 'railRequiresCash', cost: 1000, cash: 500 },
			railSegmentAtMaxLevel: { code: 'railSegmentAtMaxLevel' },
			railUnknownSegment: { code: 'railUnknownSegment' },
			industrialTileHasRail: { code: 'industrialTileHasRail' }
		};
		const contexts = Object.values(ALL_DECISION_CONTEXTS);
		// 26 = number of variants in the DecisionContext union. If this fails,
		// a variant was added or removed without updating ALL_DECISION_CONTEXTS.
		expect(contexts).toHaveLength(26);
		const structuredDecisions = contexts.map((context, index) => ({
			kind: 'system' as const,
			id: `d${index + 1}`,
			title: 'T',
			context,
			expiresOnDay: 3,
			options: [{ id: 'acknowledge', label: 'A', description: 'D' }]
		})) as unknown as GameState['decisions'];
		const record = createManualSaveRecord({ game: { decisions: structuredDecisions } });

		expect(() => validateSaveRecord(record)).not.toThrow();
	});

	test('drops a report with cashReservesLow in store-only warnings', () => {
		// cashReservesLow is a daily-level warning; store reports must not carry it.
		const storeReport = {
			...createDailyStoreReport(),
			warnings: [{ code: 'cashReservesLow' }]
		} as unknown as DailyStoreReport;
		const report = createDailyReport({ storeReports: [storeReport] });
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });

		expectHistoricalReportDropped(() => validateSaveStoreSnapshot(snapshot).manualSlots[0]!.game);
	});

	test('drops a report with an unknown warning code in daily report warnings', () => {
		const report = createDailyReport({
			warnings: [{ code: 'notARealWarning' } as unknown as DailyReportWarning]
		});
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });

		expectHistoricalReportDropped(() => validateSaveStoreSnapshot(snapshot).manualSlots[0]!.game);
	});

	test('validateSavedWarningArray validates cashReservesLow without a storeId', () => {
		// cashReservesLow is the only warning code that does not require a storeId.
		expect.assertions(1);
		const report = createDailyReport({
			warnings: [{ code: 'cashReservesLow' } as unknown as DailyReportWarning]
		});
		const snapshot = createSnapshotWithGame(withCurrentReports(createGame(), [report]));

		expect(() => validateSaveStoreSnapshot(snapshot)).not.toThrow();
	});

	test('drops a report with shortManager at a non-positive count', () => {
		const storeReport = {
			...createDailyStoreReport(),
			warnings: [{ code: 'shortManager', storeId: 'store-1', count: 0 }]
		} as unknown as DailyStoreReport;
		const report = createDailyReport({ storeReports: [storeReport] });
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });

		expectHistoricalReportDropped(() => validateSaveStoreSnapshot(snapshot).manualSlots[0]!.game);
	});

	test('drops a report with a store warning missing its storeId', () => {
		const storeReport = {
			...createDailyStoreReport(),
			warnings: [{ code: 'stockPressure' } as unknown as DailyStoreReport['warnings'][number]]
		} as unknown as DailyStoreReport;
		const report = createDailyReport({ storeReports: [storeReport] });
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });

		expectHistoricalReportDropped(() => validateSaveStoreSnapshot(snapshot).manualSlots[0]!.game);
	});

	test('validateSavedWarningArray validates structured store and daily warnings together', () => {
		// Exercises the happy path for store-only and daily-level warning arrays
		// with all store warning codes plus cashReservesLow.
		expect.assertions(1);
		const storeReport = {
			...createDailyStoreReport(),
			warnings: [
				{ code: 'stockPressure', storeId: 'store-1' },
				{ code: 'nearStaffCapacity', storeId: 'store-1' },
				{ code: 'shortManager', storeId: 'store-1', count: 2 },
				{ code: 'shortGeneral', storeId: 'store-1', count: 3 },
				{ code: 'missedProductDemand', storeId: 'store-1' },
				{ code: 'reputationSlipping', storeId: 'store-1' }
			]
		} as unknown as DailyStoreReport;
		const report = createDailyReport({
			storeReports: [storeReport],
			warnings: [
				{ code: 'cashReservesLow' } as unknown as DailyReportWarning,
				{ code: 'stockPressure', storeId: 'store-1' } as unknown as DailyReportWarning
			]
		});
		const snapshot = createSnapshotWithGame(withCurrentReports(createGame(), [report]));

		expect(() => validateSaveStoreSnapshot(snapshot)).not.toThrow();
	});

	test('requireStringAllowEmpty rejects a non-string store name', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				stores: [
					{
						...createGame().stores[0]!,
						name: 123 as unknown as string
					}
				]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('Saved game stores[0] name must be a string');
	});

	test('requireStringAllowEmpty accepts an empty-string store name', () => {
		// Store names can be empty (auto-named stores use the default name at
		// render time via storeDisplayName).
		expect.assertions(1);
		const record = createManualSaveRecord({
			game: {
				stores: [{ ...createGame().stores[0]!, name: '' }]
			}
		});

		expect(() => validateSaveRecord(record)).not.toThrow();
	});

	test('accepts stalled status and rail movement source at v10', () => {
		expect.assertions(2);
		const building = createIndustrialBuilding({ status: 'stalled' });
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				consumed: [
					{
						cityId: 'industry-city',
						materialId: 'grain',
						quantity: 1,
						value: 1,
						source: 'rail'
					}
				]
			})
		});
		const record = createManualSaveRecord({
			game: withCurrentReports(createGame({ industrialBuildings: [building] }), [report])
		});

		const validated = validateSaveRecord(record);
		expect(validated.game.industrialBuildings[0]!.status).toBe('stalled');
		expect(
			validated.game.reports[0]!.productionReport.consumed.some(
				(movement) => movement.source === 'rail'
			)
		).toBe(true);
	});

	test('rejects a rail cell with level 0', () => {
		expect.assertions(2);
		const baseIndustryCity = createGame().industryCities[0]!;
		const record = createManualSaveRecord({
			game: {
				// Fixture city is 1×1, so (0,0) is the only valid grid tile.
				industryCities: [{ ...baseIndustryCity, rails: [{ x: 0, y: 0, level: 0 }] }]
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(/level/);
	});

	test('strict validation accepts runtime inventory with a consumed input retained at zero', () => {
		const initial = { ...createNewGame('convenience', 20260722), cash: 1_000_000 };
		const tile = initial.industryCities[0]!.tiles.find(
			(candidate) => getIndustrialPlacementBlockReason(initial, candidate.id, 'flour-mill') === null
		)!;
		const built = buildIndustrialBuilding(initial, {
			tileId: tile.id,
			buildingTypeId: 'flour-mill'
		});
		const game = simulateDay({
			...built,
			industrialBuildings: built.industrialBuildings.map((building) => ({
				...building,
				inventory: { grain: 10 }
			}))
		});

		expect(game.industrialBuildings[0]?.inventory).toEqual({ grain: 0, flour: 8 });
		expect(validateCurrentGameState(game)).toEqual(game);
	});

	test('validates an industry city with populated tiles', () => {
		expect.assertions(1);
		const baseIndustryCity = createGame().industryCities[0]!;
		const city = {
			...baseIndustryCity,
			width: 2,
			height: 1,
			tiles: [
				{
					id: 'industry-city-0-0',
					cityId: 'industry-city',
					x: 0,
					y: 0,
					terrain: 'industrial',
					resource: null,
					locked: false
				},
				{
					id: 'industry-city-1-0',
					cityId: 'industry-city',
					x: 1,
					y: 0,
					terrain: 'farmland',
					resource: 'grain-field',
					locked: false
				}
			] as IndustryTile[]
		};
		const record = createManualSaveRecord({ game: { industryCities: [city] } });
		expect(() => validateSaveRecord(record)).not.toThrow();
	});

	test('rejects a rail cell with a non-integer x coordinate', () => {
		expect.assertions(2);
		const baseIndustryCity = createGame().industryCities[0]!;
		const record = createManualSaveRecord({
			game: { industryCities: [{ ...baseIndustryCity, rails: [{ x: 0.5, y: 0, level: 1 }] }] }
		});
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('x must be an integer');
	});

	test('rejects a rail cell with a non-integer y coordinate', () => {
		expect.assertions(2);
		const baseIndustryCity = createGame().industryCities[0]!;
		const record = createManualSaveRecord({
			game: { industryCities: [{ ...baseIndustryCity, rails: [{ x: 0, y: 0.5, level: 1 }] }] }
		});
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('y must be an integer');
	});

	test('rejects a rail cell whose coordinates fall outside the city grid', () => {
		expect.assertions(2);
		const baseIndustryCity = createGame().industryCities[0]!;
		const record = createManualSaveRecord({
			game: { industryCities: [{ ...baseIndustryCity, rails: [{ x: 5, y: 0, level: 1 }] }] }
		});
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('must map to a valid city grid tile');
	});

	test('rejects duplicate rail coordinates within a city', () => {
		expect.assertions(2);
		const baseIndustryCity = createGame().industryCities[0]!;
		const record = createManualSaveRecord({
			game: {
				industryCities: [
					{
						...baseIndustryCity,
						rails: [
							{ x: 0, y: 0, level: 1 },
							{ x: 0, y: 0, level: 2 }
						]
					}
				]
			}
		});
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('duplicates rail coordinate');
	});

	test('round-trips a populated rails array at the maximum rail level', () => {
		// Positive round-trip: the default fixture only checks rails: [], and
		// the rejection tests cover invalid cells. This pins that a populated
		// rails array with cells at RAIL_MAX_LEVEL (5) survives a full
		// clone → validate → decode cycle intact.
		expect.assertions(3);
		const baseIndustryCity = createGame().industryCities[0]!;
		const city = {
			...baseIndustryCity,
			rails: [{ x: 0, y: 0, level: 5 }]
		};
		const record = createManualSaveRecord({ game: { industryCities: [city] } });

		const validated = validateSaveRecord(record);
		expect(validated.game.industryCities[0]!.rails).toHaveLength(1);
		expect(validated.game.industryCities[0]!.rails[0]).toEqual({ x: 0, y: 0, level: 5 });

		// Full snapshot round-trip (clone → parse) must also preserve the rails.
		const snapshot = createSnapshotWithGame({ ...createGame(), industryCities: [city] });
		const decoded = validateSaveStoreSnapshot(snapshot);
		expect(decoded.manualSlots[0]!.game.industryCities[0]!.rails).toEqual([
			{ x: 0, y: 0, level: 5 }
		]);
	});

	test('rejects a building inventory with an unknown material id', () => {
		expect.assertions(2);
		const mill = createIndustrialBuilding({
			typeId: 'flour-mill',
			inventory: { 'nonexistent-material': 5 } as unknown as Record<MaterialId, number>
		});
		const record = createManualSaveRecord({ game: { industrialBuildings: [mill] } });
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('must be a known material');
	});

	test('rejects a building inventory with a negative quantity', () => {
		expect.assertions(2);
		const mill = createIndustrialBuilding({
			typeId: 'flour-mill',
			inventory: { grain: -5 }
		});
		const record = createManualSaveRecord({ game: { industrialBuildings: [mill] } });
		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow('must be at least 0');
	});

	test('round-trips a production report with rail shipments and usage', () => {
		expect.assertions(3);
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				railShipments: [
					{
						cityId: 'industry-city',
						materialId: 'grain',
						quantity: 3,
						value: 9,
						kind: 'pull-producer',
						fromId: 'farm-1',
						toId: 'mill-1'
					}
				],
				railUsage: { 'industry-city:1,1': 3 }
			})
		});
		const snapshot = createSnapshotWithGame(withCurrentReports(createGame(), [report]));
		const validated = validateSaveStoreSnapshot(snapshot);
		const decoded = validated.manualSlots[0]!.game.reports[0]!.productionReport;
		expect(decoded.railShipments).toHaveLength(1);
		expect(decoded.railShipments[0]).toMatchObject({ kind: 'pull-producer', quantity: 3 });
		expect(decoded.railUsage).toEqual({ 'industry-city:1,1': 3 });
	});

	test('drops a production report with negative rail usage units', () => {
		const report = createDailyReport({
			productionReport: createDailyProductionReport({ railUsage: { 'industry-city:1,1': -1 } })
		});
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });
		expectHistoricalReportDropped(() => validateSaveStoreSnapshot(snapshot).manualSlots[0]!.game);
	});

	test('drops a rail shipment with a negative quantity', () => {
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				railShipments: [
					{
						cityId: 'industry-city',
						materialId: 'grain',
						quantity: -1,
						value: 9,
						kind: 'pull-producer',
						fromId: 'farm-1',
						toId: 'mill-1'
					}
				]
			})
		});
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });
		expectHistoricalReportDropped(() => validateSaveStoreSnapshot(snapshot).manualSlots[0]!.game);
	});

	test('drops a rail shipment with a negative value', () => {
		const report = createDailyReport({
			productionReport: createDailyProductionReport({
				railShipments: [
					{
						cityId: 'industry-city',
						materialId: 'grain',
						quantity: 1,
						value: -1,
						kind: 'pull-producer',
						fromId: 'farm-1',
						toId: 'mill-1'
					}
				]
			})
		});
		const snapshot = createSnapshotWithGame({ ...createGame(), reports: [report] });
		expectHistoricalReportDropped(() => validateSaveStoreSnapshot(snapshot).manualSlots[0]!.game);
	});

	test('rejects a legacy city inventory capacity field', () => {
		expect.assertions(2);
		const record = createManualSaveRecord({
			game: {
				cityInventories: [
					{
						cityId: 'industry-city',
						capacity: 'not-a-number' as unknown as number,
						materials: {}
					}
				] as unknown as GameState['cityInventories']
			}
		});

		expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
		expect(() => validateSaveRecord(record)).toThrow(
			'Saved game cityInventories[0] contains an unknown field: capacity'
		);
	});

	describe('industrial building placement validation', () => {
		function baseWarehouseGame(): GameState {
			return createValidWarehouseBuildingGame();
		}

		function anchorTile(game: GameState) {
			const building = game.industrialBuildings[0]!;
			const city = game.industryCities[0]!;
			return city.tiles.find((t) => t.id === building.tileId)!;
		}

		function footprintNeighbor(game: GameState) {
			const anchor = anchorTile(game);
			const city = game.industryCities[0]!;
			return city.tiles.find((t) => t.x === anchor.x + 1 && t.y === anchor.y)!;
		}

		test('rejects a building whose coordinates do not match its anchor tile', () => {
			expect.assertions(1);
			const base = baseWarehouseGame();
			const anchor = anchorTile(base);
			const building = base.industrialBuildings[0]!;
			const game: GameState = {
				...base,
				industrialBuildings: [{ ...building, mapX: anchor.x + 1 }]
			};

			expect(() => validateCurrentGameState(game)).toThrow(
				'coordinates must match its anchor tile'
			);
		});

		test('rejects a building whose footprint contains a locked tile', () => {
			expect.assertions(1);
			const base = baseWarehouseGame();
			const neighbor = footprintNeighbor(base);
			const city = base.industryCities[0]!;
			const game: GameState = {
				...base,
				industryCities: [
					{
						...city,
						tiles: city.tiles.map((t) => (t.id === neighbor.id ? { ...t, locked: true } : t))
					}
				]
			};

			expect(() => validateCurrentGameState(game)).toThrow(
				'footprint must contain only unlocked tiles'
			);
		});

		test('rejects a building whose footprint overlaps a rail', () => {
			expect.assertions(1);
			const base = baseWarehouseGame();
			const neighbor = footprintNeighbor(base);
			const city = base.industryCities[0]!;
			const game: GameState = {
				...base,
				industryCities: [
					{
						...city,
						rails: [{ x: neighbor.x, y: neighbor.y, level: 1 }]
					}
				]
			};

			expect(() => validateCurrentGameState(game)).toThrow('footprint must not overlap rail');
		});

		test('rejects a building whose anchor does not provide its required resource', () => {
			expect.assertions(1);
			const base = baseWarehouseGame();
			const building = base.industrialBuildings[0]!;
			const game: GameState = {
				...base,
				industrialBuildings: [
					{ ...building, typeId: 'grain-farm' as unknown as typeof building.typeId }
				]
			};

			expect(() => validateCurrentGameState(game)).toThrow(
				'anchor must provide its required resource'
			);
		});

		test('rejects a building that requires industrial tiles but whose footprint has non-industrial terrain', () => {
			expect.assertions(1);
			const base = baseWarehouseGame();
			const neighbor = footprintNeighbor(base);
			const city = base.industryCities[0]!;
			const game: GameState = {
				...base,
				industryCities: [
					{
						...city,
						tiles: city.tiles.map((t) => (t.id === neighbor.id ? { ...t, terrain: 'farmland' } : t))
					}
				]
			};

			expect(() => validateCurrentGameState(game)).toThrow(
				'footprint must contain only industrial terrain'
			);
		});

		test('rejects an industrial building with an unknown typeId via requireKnownId', () => {
			expect.assertions(2);
			const base = baseWarehouseGame();
			const building = base.industrialBuildings[0]!;
			const game: GameState = {
				...base,
				industrialBuildings: [
					{ ...building, typeId: 'not-a-building' as unknown as typeof building.typeId }
				]
			};

			expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
			expect(() => validateCurrentGameState(game)).toThrow(
				'must be a known industrial building type'
			);
		});
	});

	test('strict validation rejects a city ID shared between retail and industry collections', () => {
		expect.assertions(1);
		const game = createGame();
		const sharedRetailCity = {
			...createFixtureRetailCity(),
			id: 'shared-city',
			name: 'Shared',
			tiles: createFixtureRetailCity().tiles.map((t) => ({
				...t,
				id: `shared-city-${t.x}-${t.y}`,
				cityId: 'shared-city'
			}))
		};
		const sharedIndustryCity = {
			...createFixtureIndustryCity(),
			id: 'shared-city',
			name: 'Shared',
			tiles: createFixtureIndustryCity().tiles.map((t) => ({
				...t,
				id: `shared-city-${t.x}-${t.y}`,
				cityId: 'shared-city'
			}))
		};
		const mutated: GameState = {
			...game,
			cities: [...game.cities, sharedRetailCity],
			industryCities: [...game.industryCities, sharedIndustryCity]
		};

		expect(() => validateCurrentGameState(mutated)).toThrow(
			'retail and industry city IDs must be disjoint: shared-city'
		);
	});

	describe('createPlainSnapshot own-data graph edge cases', () => {
		test('rejects a revoked proxy as own-data', () => {
			expect.assertions(2);
			const { proxy, revoke } = Proxy.revocable({}, {});
			revoke();

			expect(() => createPlainSnapshot(proxy, 'test')).toThrow(SaveDataError);
			expect(() => createPlainSnapshot(proxy, 'test')).toThrow(
				'test must contain only own enumerable string-keyed data properties'
			);
		});

		test('rejects an array with a non-Array prototype', () => {
			expect.assertions(2);
			const arr = Object.setPrototypeOf([1, 2, 3], null);

			expect(() => createPlainSnapshot(arr, 'test')).toThrow(SaveDataError);
			expect(() => createPlainSnapshot(arr, 'test')).toThrow(
				'test must be an array with own data properties'
			);
		});

		test('rejects an array with a non-index enumerable own key', () => {
			expect.assertions(2);
			const arr = [1, 2, 3];
			Object.defineProperty(arr, 'foo', {
				value: 42,
				enumerable: true,
				configurable: true,
				writable: true
			});

			expect(() => createPlainSnapshot(arr, 'test')).toThrow(SaveDataError);
			expect(() => createPlainSnapshot(arr, 'test')).toThrow(
				'test must contain only own enumerable string-keyed data properties'
			);
		});

		test('clones a cyclic object when rejectCycles is not set', () => {
			expect.assertions(2);
			const obj: Record<string, unknown> = { a: 1 };
			obj.self = obj;

			const cloned = createPlainSnapshot(obj, 'test') as Record<string, unknown>;

			expect(cloned.a).toBe(1);
			expect(cloned.self).toBe(cloned);
		});

		test('rejects a cyclic reference when rejectCycles is true', () => {
			expect.assertions(2);
			const obj: Record<string, unknown> = { a: 1 };
			obj.self = obj;

			expect(() => createPlainSnapshot(obj, 'test', { rejectCycles: true })).toThrow(SaveDataError);
			expect(() => createPlainSnapshot(obj, 'test', { rejectCycles: true })).toThrow(
				'contains a cyclic reference'
			);
		});
	});

	describe('saveCodec coverage gap fills', () => {
		test('strict validation rejects save data exceeding MAX_OWN_DATA_DEPTH with a 513-deep extra', () => {
			expect.assertions(2);
			const deepExtra = createDeepEnumerableExtra(513);
			const game = Object.assign(createGame(), { deepExtra });

			expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
			expect(() => validateCurrentGameState(game)).toThrow(/depth/);
		});

		test(
			'strict validation rejects save data exceeding MAX_OWN_DATA_NODES with a wide extra',
			{ timeout: 30_000 },
			() => {
				expect.assertions(2);
				const wideExtra = createWideEnumerableExtra(250_001);
				const game = Object.assign(createGame(), { wideExtra });

				expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
				expect(() => validateCurrentGameState(game)).toThrow(/budget/);
			}
		);

		test('strict validation rejects a non-integer storeCap with invariant-store-cap error code', () => {
			expect.assertions(2);
			const game = createGame({ storeCap: 3.5 });

			let caught: unknown;
			try {
				validateCurrentGameState(game);
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(SaveDataError);
			expect((caught as SaveDataError).code).toBe('invariant-store-cap');
		});

		test('strict validation rejects storeCap below store count with invariant-store-cap error code', () => {
			expect.assertions(2);
			const game = createGame({ storeCap: 0 });

			let caught: unknown;
			try {
				validateCurrentGameState(game);
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(SaveDataError);
			expect((caught as SaveDataError).code).toBe('invariant-store-cap');
		});

		test('strict validation accepts material-only city inventory records', () => {
			expect.assertions(1);
			const game = createGame({
				cityInventories: [{ cityId: 'industry-city', materials: {} }]
			});

			expect(validateCurrentGameState(game)).toEqual(game);
		});

		test('strict validation rejects inventory exceeding buffer capacity with invariant-inventory error code', () => {
			expect.assertions(2);
			const mill = createIndustrialBuilding({
				typeId: 'flour-mill',
				inventory: { grain: 80, flour: 80 }
			});
			const game = createGame({ industrialBuildings: [mill] });

			let caught: unknown;
			try {
				validateCurrentGameState(game);
			} catch (error) {
				caught = error;
			}
			expect(caught).toBeInstanceOf(SaveDataError);
			expect((caught as SaveDataError).code).toBe('invariant-inventory');
		});

		test('strict validation rejects a legacy 28x24 retail city size', () => {
			expect.assertions(2);
			const game = createGame({
				cities: [
					{
						id: 'harbor-city',
						name: 'Harbor City',
						width: 28,
						height: 24,
						tiles: Array.from({ length: 28 * 24 }, (_, index) => {
							const x = index % 28;
							const y = Math.floor(index / 28);
							return {
								id: `harbor-city-${x}-${y}`,
								cityId: 'harbor-city',
								x,
								y,
								neighborhood: 'downtown',
								terrain: 'commercial',
								feature: null,
								demand: 72,
								rent: 180,
								footTraffic: 66,
								customerFit: 70,
								locked: false
							};
						})
					}
				],
				stores: []
			});

			expect(() => validateCurrentGameState(game)).toThrow(SaveDataError);
			expect(() => validateCurrentGameState(game)).toThrow(
				'uses the legacy 28x24 sandbox city size'
			);
		});

		test('current schema saves reject a store with non-array products', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					stores: [
						{
							...createGame().stores[0]!,
							products: 'not-an-array' as unknown as GameState['stores'][number]['products']
						}
					]
				}
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow(
				'Saved game stores[0] products must be an array'
			);
		});

		test('current schema saves reject a store with an empty cityId', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					stores: [
						{
							...createGame().stores[0]!,
							cityId: '',
							tileId: 'harbor-city-1-1'
						}
					]
				} as unknown as Partial<GameState>
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow(
				'Saved game stores[0] cityId must be a non-empty string'
			);
		});

		test('current schema saves reject a store with non-finite mapX', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					stores: [
						{
							...createGame().stores[0]!,
							mapX: Number.NaN
						}
					]
				} as unknown as Partial<GameState>
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow('mapX must be a finite number');
		});

		test('current schema saves reject a store with non-string mapY', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					stores: [
						{
							...createGame().stores[0]!,
							mapY: 'bad' as unknown as number
						}
					]
				} as unknown as Partial<GameState>
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow('mapY must be a finite number');
		});

		test('legacy retail regeneration leaves a non-retail city id for strict validation', () => {
			expect.assertions(2);
			const record = createManualSaveRecord({
				game: {
					cities: [
						createFixtureRetailCity(),
						{
							id: 'industry-city',
							name: 'Industry City',
							width: 3,
							height: 3,
							tiles: Array.from({ length: 9 }, (_, index) => {
								const x = index % 3;
								const y = Math.floor(index / 3);
								return {
									id: `industry-city-${x}-${y}`,
									cityId: 'industry-city',
									x,
									y,
									neighborhood: 'downtown',
									terrain: 'commercial',
									feature: null,
									demand: 72,
									rent: 180,
									footTraffic: 66,
									customerFit: 70,
									locked: false
								};
							})
						}
					],
					stores: []
				} as unknown as Partial<GameState>
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow(
				'retail city industry-city must use a retail catalog ID'
			);
		});

		test('legacy retail regeneration leaves a current-size retail city untouched', () => {
			expect.assertions(1);
			const city = generateCity({
				id: 'harbor-city',
				name: 'Harbor City',
				width: DEFAULT_RETAIL_CITY_WIDTH,
				height: DEFAULT_RETAIL_CITY_HEIGHT,
				seed: 20260505
			});
			const tile = city.tiles.find((t) => isTileBuildable(t))!;
			const record = createManualSaveRecord({
				game: {
					cities: [city],
					stores: [
						{
							...createGame().stores[0]!,
							cityId: 'harbor-city',
							tileId: tile.id,
							mapX: tile.x,
							mapY: tile.y,
							location: formatLocation(tile),
							localDemand: computeStoreLocalDemand(tile)
						}
					]
				} as unknown as Partial<GameState>
			});

			expect(() => validateSaveRecord(record)).not.toThrow();
		});

		test('rejects fractional targetStock before it can become a FIFO lot', () => {
			const game = createGame();
			const store = game.stores[0]!;
			const product = store.products[0]!;
			const products = [
				{ ...product, targetStock: product.reorderThreshold + 0.5 },
				...store.products.slice(1)
			];
			const stores = [{ ...store, products, stockHealth: calculateStockHealth(products) }];
			const record = createManualSaveRecord({
				game: { stores } as unknown as Partial<GameState>
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow(
				'Saved game stores[0] products[0] targetStock must be a non-negative safe integer'
			);
		});

		test('rejects exact-max targetStock before it can become a FIFO lot', () => {
			const game = createGame();
			const store = game.stores[0]!;
			const product = store.products[0]!;
			const products = [
				{ ...product, targetStock: Number.MAX_SAFE_INTEGER },
				...store.products.slice(1)
			];
			const stores = [{ ...store, products, stockHealth: calculateStockHealth(products) }];
			const record = createManualSaveRecord({
				game: { stores } as unknown as Partial<GameState>
			});

			expect(() => validateSaveRecord(record)).toThrow(SaveDataError);
			expect(() => validateSaveRecord(record)).toThrow(
				'Saved game stores[0] products[0] targetStock must be a non-negative safe integer that can advance safely'
			);
		});

		test('accepts zero targetStock when reorderThreshold is zero', () => {
			const game = createGame();
			const store = game.stores[0]!;
			const product = store.products[0]!;
			const products = [
				{ ...product, reorderThreshold: 0, targetStock: 0 },
				...store.products.slice(1)
			];
			const stores = [{ ...store, products, stockHealth: calculateStockHealth(products) }];
			const record = createManualSaveRecord({
				game: { stores } as unknown as Partial<GameState>
			});

			expect(() => validateSaveRecord(record)).not.toThrow();
		});

		test('accepts the largest targetStock that can advance safely', () => {
			const game = createGame();
			const store = game.stores[0]!;
			const product = store.products[0]!;
			const products = [
				{ ...product, targetStock: Number.MAX_SAFE_INTEGER - 1 },
				...store.products.slice(1)
			];
			const stores = [{ ...store, products, stockHealth: calculateStockHealth(products) }];
			const record = createManualSaveRecord({
				game: { stores } as unknown as Partial<GameState>
			});

			expect(() => validateSaveRecord(record)).not.toThrow();
		});

		test('keeps decimal reorderThreshold valid with a lot-compatible targetStock', () => {
			const game = createGame();
			const store = game.stores[0]!;
			const product = store.products[0]!;
			const products = [
				{
					...product,
					reorderThreshold: 2.5,
					targetStock: Number.MAX_SAFE_INTEGER - 1
				},
				...store.products.slice(1)
			];
			const stores = [{ ...store, products, stockHealth: calculateStockHealth(products) }];
			const record = createManualSaveRecord({
				game: { stores } as unknown as Partial<GameState>
			});

			expect(() => validateSaveRecord(record)).not.toThrow();
		});
	});

	describe('current city inventory validation defensive paths', () => {
		test('rejects a non-object city inventory entry', () => {
			const game = createCurrentMultiCityGame();

			expectSaveRecordErrorCode(
				createManualSaveRecord({
					game: {
						...game,
						cityInventories: ['not-an-object'] as unknown as GameState['cityInventories']
					}
				}),
				'invariant-city-inventory'
			);
		});

		test('rejects an empty-string city inventory cityId', () => {
			const game = createCurrentMultiCityGame();
			const cityInventories = game.cityInventories.map((inventory) =>
				inventory.cityId === 'industry-city'
					? { ...inventory, cityId: '' as WorldCityId }
					: inventory
			);

			expectSaveRecordErrorCode(
				createManualSaveRecord({
					game: { ...game, cityInventories } as unknown as GameState
				}),
				'invariant-city-inventory'
			);
		});

		test('rejects a non-array cityInventories field', () => {
			const game = createCurrentMultiCityGame();

			expectSaveRecordErrorCode(
				createManualSaveRecord({
					game: {
						...game,
						cityInventories: 'not-an-array' as unknown as GameState['cityInventories']
					}
				}),
				'invariant-city-inventory'
			);
		});

		test('rejects an empty-string retail assignment retailCityId', () => {
			const game = createCurrentMultiCityGame();
			const assignments = game.retailSupplyAssignments.map((assignment) =>
				assignment.retailCityId === 'harbor-city'
					? { ...assignment, retailCityId: '' as WorldCityId }
					: assignment
			);

			expectSaveRecordErrorCode(
				createManualSaveRecord({
					game: { ...game, retailSupplyAssignments: assignments } as unknown as GameState
				}),
				'invariant-retail-supply'
			);
		});

		test('rejects a non-array retailSupplyAssignments field', () => {
			const game = createCurrentMultiCityGame();

			expectSaveRecordErrorCode(
				createManualSaveRecord({
					game: {
						...game,
						retailSupplyAssignments:
							'not-an-array' as unknown as GameState['retailSupplyAssignments']
					}
				}),
				'invariant-retail-supply'
			);
		});

		test('rejects a non-object retail supply assignment entry', () => {
			const game = createCurrentMultiCityGame();

			expectSaveRecordErrorCode(
				createManualSaveRecord({
					game: {
						...game,
						retailSupplyAssignments: [
							'not-an-object',
							...game.retailSupplyAssignments.slice(1)
						] as unknown as GameState['retailSupplyAssignments']
					}
				}),
				'invariant-retail-supply'
			);
		});

		test('rejects a non-string non-null supplyCityId', () => {
			const game = createCurrentMultiCityGame();
			const assignments = game.retailSupplyAssignments.map((assignment) =>
				assignment.retailCityId === 'harbor-city'
					? { ...assignment, supplyCityId: 123 as unknown as WorldCityId | null }
					: assignment
			);

			expectSaveRecordErrorCode(
				createManualSaveRecord({
					game: { ...game, retailSupplyAssignments: assignments } as unknown as GameState
				}),
				'invariant-retail-supply'
			);
		});
	});

	describe('schema-17 product dynamics report validation', () => {
		test.each([
			['negative unitsSold', (product: Record<string, unknown>) => ({ ...product, unitsSold: -1 })],
			[
				'fractional unitsSold',
				(product: Record<string, unknown>) => ({ ...product, unitsSold: 0.5 })
			],
			[
				'negative demandMissed',
				(product: Record<string, unknown>) => ({ ...product, demandMissed: -1 })
			],
			[
				'fractional demandMissed',
				(product: Record<string, unknown>) => ({ ...product, demandMissed: 0.5 })
			],
			[
				'negative endingStock',
				(product: Record<string, unknown>) => ({ ...product, endingStock: -1 })
			],
			[
				'fractional endingStock',
				(product: Record<string, unknown>) => ({ ...product, endingStock: 0.5 })
			]
		] as const)('drops a report with invalid core product evidence: %s', (_name, mutateProduct) => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const productReport = mutateProduct(
				storeReport.productReports[0]! as unknown as Record<string, unknown>
			);
			const updatedReport: DailyReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						productReports: [productReport as unknown as DailyProductReport]
					}
				]
			};

			expectHistoricalReportDropped(() => decodeHistoricalReport(game, updatedReport));
		});

		test.each([
			[
				'negative stockoutLostDemand',
				(product: Record<string, unknown>) => ({ ...product, stockoutLostDemand: -1 })
			],
			[
				'fractional stockoutLostDemand',
				(product: Record<string, unknown>) => ({ ...product, stockoutLostDemand: 0.5 })
			],
			[
				'unsafe stockoutLostDemand',
				(product: Record<string, unknown>) => ({
					...product,
					stockoutLostDemand: Number.MAX_SAFE_INTEGER + 1
				})
			]
		] as const)(
			'drops a report with invalid stockout unit evidence: %s',
			(_name, mutateProduct) => {
				const game = createCurrentMultiCityGame();
				const report = createCurrentReport(game);
				const storeReport = report.storeReports[0]!;
				const productReport = mutateProduct(
					storeReport.productReports[0]! as unknown as Record<string, unknown>
				);
				const updatedReport: DailyReport = {
					...report,
					storeReports: [
						{
							...storeReport,
							productReports: [productReport as unknown as DailyProductReport]
						}
					]
				};

				expectHistoricalReportDropped(() => decodeHistoricalReport(game, updatedReport));
			}
		);

		test('preserves a whole-number stockoutLostDemand unit value', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const productReport = {
				...storeReport.productReports[0]!,
				stockoutLostDemand: 2
			};
			const updatedReport: DailyReport = {
				...report,
				storeReports: [{ ...storeReport, productReports: [productReport] }]
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});

		test.each([
			[
				'an unknown product ID',
				(product: Record<string, unknown>) => ({ ...product, productId: 'unknown-product' })
			],
			[
				'a negative waste value',
				(product: Record<string, unknown>) => ({ ...product, wasteValue: -1 })
			],
			[
				'a negative shrink unit count',
				(product: Record<string, unknown>) => ({ ...product, shrinkUnits: -1 })
			],
			[
				'a negative average age',
				(product: Record<string, unknown>) => ({ ...product, averageAgeDays: -1 })
			],
			[
				'a negative oldest sellable age',
				(product: Record<string, unknown>) => ({ ...product, oldestSellableAgeDays: -1 })
			],
			[
				'a non-finite trend multiplier',
				(product: Record<string, unknown>) => ({
					...product,
					trendMultiplier: Number.POSITIVE_INFINITY
				})
			],
			[
				'a zero trend multiplier',
				(product: Record<string, unknown>) => ({ ...product, trendMultiplier: 0 })
			],
			[
				'a non-finite obsolescence multiplier',
				(product: Record<string, unknown>) => ({
					...product,
					obsolescenceMultiplier: Number.NaN
				})
			],
			[
				'a non-finite base selling price',
				(product: Record<string, unknown>) => ({
					...product,
					baseSellingPrice: Number.NaN
				})
			],
			[
				'a non-finite effective selling price',
				(product: Record<string, unknown>) => ({
					...product,
					effectiveSellingPrice: Number.POSITIVE_INFINITY
				})
			],
			[
				'a zero effective selling price',
				(product: Record<string, unknown>) => ({ ...product, effectiveSellingPrice: 0 })
			],
			[
				'a negative markdown amount',
				(product: Record<string, unknown>) => ({ ...product, markdownAmount: -1 })
			],
			[
				'an average age exceeding the oldest sellable age',
				(product: Record<string, unknown>) => ({
					...product,
					averageAgeDays: 10,
					oldestSellableAgeDays: 5
				})
			]
		] as const)('drops a report with %s', (_name, mutateProduct) => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const productReport = mutateProduct(
				storeReport.productReports[0]! as unknown as Record<string, unknown>
			);
			const updatedReport: DailyReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						productReports: [productReport as unknown as DailyProductReport]
					}
				]
			};

			expectHistoricalReportDropped(() => decodeHistoricalReport(game, updatedReport));
		});

		test.each([
			[
				'waste units without waste value',
				(product: Record<string, unknown>) => ({
					...product,
					wasteUnits: 2,
					wasteValue: 0,
					shrinkUnits: 0,
					shrinkValue: 0
				})
			],
			[
				'shrink units without shrink value',
				(product: Record<string, unknown>) => ({
					...product,
					wasteUnits: 0,
					wasteValue: 0,
					shrinkUnits: 2,
					shrinkValue: 0
				})
			],
			[
				'waste value without waste units',
				(product: Record<string, unknown>) => ({
					...product,
					wasteUnits: 0,
					wasteValue: 7,
					shrinkUnits: 0,
					shrinkValue: 0
				})
			],
			[
				'shrink value without shrink units',
				(product: Record<string, unknown>) => ({
					...product,
					wasteUnits: 0,
					wasteValue: 0,
					shrinkUnits: 0,
					shrinkValue: 7
				})
			]
		] as const)(
			'drops a report when %s disagree despite reconciled totals',
			(_name, mutateProduct) => {
				const game = createCurrentMultiCityGame();
				const report = createCurrentReport(game);
				const storeReport = report.storeReports[0]!;
				const productReport = mutateProduct(
					storeReport.productReports[0]! as unknown as Record<string, unknown>
				);
				const reconciledLoss =
					(productReport.wasteValue as number) + (productReport.shrinkValue as number);
				const updatedReport: DailyReport = {
					...report,
					inventoryLossExpense: reconciledLoss,
					storeReports: [
						{
							...storeReport,
							productReports: [productReport as unknown as DailyProductReport],
							inventoryLossExpense: reconciledLoss
						}
					]
				};

				expectHistoricalReportDropped(() => decodeHistoricalReport(game, updatedReport));
			}
		);

		test('keeps a report whose waste value differs from the current catalog import cost', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const sourceProductReport = storeReport.productReports[0]!;
			const catalogImportCost = getProductDefinition(sourceProductReport.productId).importCost;
			const productReport = {
				...sourceProductReport,
				wasteUnits: 1,
				wasteValue: catalogImportCost + 1,
				shrinkUnits: 0,
				shrinkValue: 0
			};
			const reconciledLoss = productReport.wasteValue + productReport.shrinkValue;
			const updatedReport: DailyReport = {
				...report,
				inventoryLossExpense: reconciledLoss,
				storeReports: [
					{
						...storeReport,
						productReports: [productReport],
						inventoryLossExpense: reconciledLoss
					}
				]
			};

			expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport));
		});

		test('drops a report with persisted freshness instead of accepting a derived field', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const productReport = {
				...storeReport.productReports[0]!,
				freshnessPercent: 65
			} as unknown as DailyProductReport;
			const updatedReport: DailyReport = {
				...report,
				storeReports: [{ ...storeReport, productReports: [productReport] }]
			};

			expectHistoricalReportDropped(() => decodeHistoricalReport(game, updatedReport));
		});

		test('drops a report when store inventory loss does not equal product loss', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const productReport = {
				...storeReport.productReports[0]!,
				wasteUnits: 1,
				wasteValue: 2
			};
			const updatedReport: DailyReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						productReports: [productReport],
						inventoryLossExpense: 0
					}
				]
			};

			expectHistoricalReportDropped(() => decodeHistoricalReport(game, updatedReport));
		});

		test('drops a report when daily inventory loss does not equal store loss', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const productReport = {
				...storeReport.productReports[0]!,
				wasteUnits: 1,
				wasteValue: 2
			};
			const updatedReport: DailyReport = {
				...report,
				inventoryLossExpense: 0,
				storeReports: [
					{
						...storeReport,
						productReports: [productReport],
						inventoryLossExpense: 2
					}
				]
			};

			expectHistoricalReportDropped(() => decodeHistoricalReport(game, updatedReport));
		});

		test('preserves a valid fractional inventory-loss reconciliation', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			// Persisted totals can carry a one-ULP fractional drift from the exact product loss.
			const persistedTotal = 2.0000000000000004;
			expect(persistedTotal).not.toBe(2);
			const productReport = {
				...storeReport.productReports[0]!,
				wasteUnits: 1,
				wasteValue: 2,
				shrinkUnits: 0,
				shrinkValue: 0
			};
			const updatedReport: DailyReport = {
				...report,
				inventoryLossExpense: persistedTotal,
				storeReports: [
					{
						...storeReport,
						productReports: [productReport],
						inventoryLossExpense: persistedTotal
					}
				]
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});

		test('drops a report missing the persisted daily inventory loss total', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const { inventoryLossExpense: _inventoryLossExpense, ...withoutLoss } = report;
			void _inventoryLossExpense;

			expectHistoricalReportDropped(() =>
				decodeHistoricalReport(game, withoutLoss as unknown as DailyReport)
			);
		});
	});

	describe('historical report decoding defensive paths', () => {
		test('preserves a production movement cityId referencing a known but closed industry city', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const updatedReport = {
				...report,
				productionReport: {
					...report.productionReport,
					produced: report.productionReport.produced.map((movement) => ({
						...movement,
						cityId: 'quarry-works' as const
					}))
				}
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});

		test('drops a production-close summary with a non-finite capacity', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const updatedReport = {
				...report,
				productionReport: {
					...report.productionReport,
					cityInventories: report.productionReport.cityInventories.map((summary, index) =>
						index === 0 ? { ...summary, capacity: Number.NaN } : summary
					)
				}
			};

			expectHistoricalReportDropped(() => decodeHistoricalReport(game, updatedReport));
		});

		test('drops a production-close summary with a negative used value', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const updatedReport = {
				...report,
				productionReport: {
					...report.productionReport,
					cityInventories: report.productionReport.cityInventories.map((summary, index) =>
						index === 0 ? { ...summary, used: -1 } : summary
					)
				}
			};

			expectHistoricalReportDropped(() => decodeHistoricalReport(game, updatedReport));
		});

		test('preserves a production-close summary with a safe maximum aggregate capacity', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const updatedReport = {
				...report,
				productionReport: {
					...report.productionReport,
					cityInventories: report.productionReport.cityInventories.map((summary) => ({
						...summary,
						capacity: Number.MAX_SAFE_INTEGER,
						used: 0,
						overflowUnits: 0,
						overflowCost: 0
					})),
					warehouseCapacity: Number.MAX_SAFE_INTEGER,
					warehouseUsed: 0,
					overflowUnits: 0,
					overflowCost: 0
				}
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});

		test('preserves a production-close summary with an unreconciled overflow cost', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const updatedReport = {
				...report,
				productionReport: {
					...report.productionReport,
					cityInventories: report.productionReport.cityInventories.map((summary, index) =>
						index === 1 ? { ...summary, overflowUnits: 2, overflowCost: 999 } : summary
					),
					overflowUnits: 2,
					overflowCost: 999
				}
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});

		test('preserves a production-close summary whose historical pressure multiplication overflows', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const updatedReport: DailyReport = {
				...report,
				productionReport: {
					...report.productionReport,
					cityInventories: report.productionReport.cityInventories.map((summary) =>
						summary.cityId === 'industry-city'
							? {
									...summary,
									capacity: 0,
									used: Number.MAX_SAFE_INTEGER,
									overflowUnits: Number.MAX_SAFE_INTEGER,
									overflowCost: 0
								}
							: summary
					)
				}
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});

		test('preserves duplicate city IDs in historical production-close summaries', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const updatedReport = {
				...report,
				productionReport: {
					...report.productionReport,
					cityInventories: [
						report.productionReport.cityInventories[0]!,
						{ ...report.productionReport.cityInventories[0]! }
					],
					warehouseCapacity: report.productionReport.cityInventories[0]!.capacity * 2,
					warehouseUsed: report.productionReport.cityInventories[0]!.used * 2,
					overflowUnits: 0,
					overflowCost: 0
				}
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});

		test('preserves noncanonical ordering in historical production-close summaries', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const updatedReport = {
				...report,
				productionReport: {
					...report.productionReport,
					cityInventories: [...report.productionReport.cityInventories].reverse()
				}
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});

		test('drops a store replenishment context with an empty-string retailCityId', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const updatedReport: DailyReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						replenishment: {
							...storeReport.replenishment!,
							retailCityId: '' as WorldCityId
						}
					}
				]
			};

			expectHistoricalReportDropped(() => decodeHistoricalReport(game, updatedReport));
		});

		test('drops a store replenishment context with a mismatched retail city kind', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const updatedReport: DailyReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						replenishment: {
							...storeReport.replenishment!,
							retailCityId: 'industry-city'
						}
					}
				]
			};

			expectHistoricalReportDropped(() => decodeHistoricalReport(game, updatedReport));
		});

		test('preserves local replenishment with warehouse units but no resolved supply city', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const updatedReport: DailyReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						replenishment: {
							...storeReport.replenishment!,
							resolvedSupplyCityId: null
						},
						productReports: [
							{
								...storeReport.productReports[0]!,
								warehouseUnits: 2,
								warehouseValue: 4,
								importedUnits: 0,
								importSpend: 0
							}
						]
					}
				]
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});

		test('drops a raw-material productId with nonzero warehouse units', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const updatedReport: DailyReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						productReports: [
							{
								...storeReport.productReports[0]!,
								productId: 'grain' as ProductId,
								warehouseUnits: 2,
								warehouseValue: 4,
								importedUnits: 0,
								importSpend: 0
							}
						]
					}
				]
			};

			expectHistoricalReportDropped(() => decodeHistoricalReport(game, updatedReport));
		});

		test('preserves a store report referencing an unknown current storeId', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const updatedReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						storeId: 'nonexistent-store'
					}
				]
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});

		test('preserves a warehouseValue beyond its current material-local-value equation', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const updatedReport: DailyReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						productReports: [
							{
								...storeReport.productReports[0]!,
								productId: 'bottled-water' as const,
								warehouseUnits: Number.MAX_SAFE_INTEGER,
								warehouseValue: 0,
								importedUnits: 0,
								importSpend: 0
							}
						]
					}
				]
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});

		test('drops a non-object non-null replenishment context', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const updatedReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						replenishment: 'not-an-object' as unknown as null
					}
				]
			};

			expectHistoricalReportDropped(() => decodeHistoricalReport(game, updatedReport));
		});

		test('preserves a replenishment retailCityId that does not match its current store city', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const updatedReport: DailyReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						replenishment: {
							...storeReport.replenishment!,
							retailCityId: 'campus-junction'
						}
					}
				]
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});

		test('preserves a replenishment context where resolved and configured supply city IDs differ', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const updatedReport: DailyReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						replenishment: {
							...storeReport.replenishment!,
							configuredSupplyCityId: 'industry-city',
							resolvedSupplyCityId: 'breadbasket-basin'
						}
					}
				]
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});

		test('preserves a replenishment context with a resolved supply city that has no current inventory', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const updatedReport: DailyReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						replenishment: {
							...storeReport.replenishment!,
							configuredSupplyCityId: null,
							resolvedSupplyCityId: 'industry-city'
						},
						productReports: [
							{
								...storeReport.productReports[0]!,
								warehouseUnits: 0,
								warehouseValue: 0,
								importedUnits: 2,
								importSpend: 6
							}
						]
					}
				]
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});

		test('preserves a replenishment context with no attempted product refill', () => {
			const game = createCurrentMultiCityGame();
			const report = createCurrentReport(game);
			const storeReport = report.storeReports[0]!;
			const updatedReport = {
				...report,
				storeReports: [
					{
						...storeReport,
						productReports: [
							{
								...storeReport.productReports[0]!,
								warehouseUnits: 0,
								warehouseValue: 0,
								importedUnits: 0,
								importSpend: 0
							}
						]
					}
				]
			};

			expect(
				expectHistoricalReportPreserved(() => decodeHistoricalReport(game, updatedReport))
					.reports[0]
			).toEqual(updatedReport);
		});
	});

	describe('current logistics validation', () => {
		test('round-trips delivered manual and in-transit route orders with a paused route', () => {
			expect.assertions(5);
			const baseGame = createLogisticsGame();
			const game = { ...baseGame, logistics: createLogisticsState(baseGame) };
			const record = createManualSaveRecord({ game });

			const validated = validateSaveRecord(structuredClone(record));

			expect(validated).toEqual(record);
			expect(validated.game.logistics.transferOrders[0]).toMatchObject({
				id: 'transfer-1',
				source: { kind: 'manual' },
				status: 'delivered'
			});
			expect(validated.game.logistics.transferOrders[1]).toMatchObject({
				id: 'transfer-2',
				source: { kind: 'recurring-route', routeId: 'route-1' },
				status: 'in-transit'
			});
			expect(validated.game.logistics.recurringRoutes).toEqual([
				expect.objectContaining({ id: 'route-1', state: 'paused' })
			]);
			expect(validated.game.logistics.nextTransferSequence).toBe(3);
		});

		test('preserves persisted transfer order without normalizing it', () => {
			expect.assertions(1);
			const baseGame = createLogisticsGame();
			const logistics = createLogisticsState(baseGame);
			const game = {
				...baseGame,
				logistics: {
					...logistics,
					transferOrders: [...logistics.transferOrders].reverse()
				}
			};

			expect(
				validateCurrentGameState(game).logistics.transferOrders.map((order) => order.id)
			).toEqual(['transfer-2', 'transfer-1']);
		});

		test('requires the authoritative logistics state', () => {
			const game = structuredClone(createGame()) as unknown as Record<string, unknown>;
			delete game.logistics;

			expect(logisticsError(() => validateCurrentGameState(game)).code).toBe('invariant-logistics');
		});

		test.each([
			[
				'duplicate transfer IDs',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [logistics.transferOrders[0]!, { ...logistics.transferOrders[0]! }]
				})
			],
			[
				'duplicate route IDs',
				(logistics: GameState['logistics']) => ({
					...logistics,
					recurringRoutes: [logistics.recurringRoutes[0]!, { ...logistics.recurringRoutes[0]! }]
				})
			],
			[
				'a malformed transfer ID',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{ ...logistics.transferOrders[0]!, id: 'transfer-01' },
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'a malformed route ID',
				(logistics: GameState['logistics']) => ({
					...logistics,
					recurringRoutes: [{ ...logistics.recurringRoutes[0]!, id: 'route-01' }]
				})
			]
		] as const)('rejects %s', (_name, mutate) => {
			const baseGame = createLogisticsGame();
			const game = { ...baseGame, logistics: mutate(createLogisticsState(baseGame)) };

			expect(logisticsError(() => validateCurrentGameState(game)).code).toBe('invariant-logistics');
		});

		test.each([
			[
				'a nonpositive transfer sequence',
				(logistics: GameState['logistics']) => ({ ...logistics, nextTransferSequence: 0 })
			],
			[
				'a fractional route sequence',
				(logistics: GameState['logistics']) => ({ ...logistics, nextRouteSequence: 1.5 })
			],
			[
				'an unsafe transfer sequence',
				(logistics: GameState['logistics']) => ({
					...logistics,
					nextTransferSequence: Number.MAX_SAFE_INTEGER + 1
				})
			],
			[
				'a transfer sequence that cannot advance safely',
				(logistics: GameState['logistics']) => ({
					...logistics,
					nextTransferSequence: Number.MAX_SAFE_INTEGER
				})
			],
			[
				'a route sequence that cannot advance safely',
				(logistics: GameState['logistics']) => ({
					...logistics,
					nextRouteSequence: Number.MAX_SAFE_INTEGER
				})
			],
			[
				'the next transfer sequence does not exceed an existing transfer ID',
				(logistics: GameState['logistics']) => ({ ...logistics, nextTransferSequence: 2 })
			],
			[
				'the next route sequence does not exceed an existing route ID',
				(logistics: GameState['logistics']) => ({ ...logistics, nextRouteSequence: 1 })
			]
		] as const)('rejects when %s', (_name, mutate) => {
			const baseGame = createLogisticsGame();
			const game = { ...baseGame, logistics: mutate(createLogisticsState(baseGame)) };

			expect(logisticsError(() => validateCurrentGameState(game)).code).toBe('invariant-logistics');
		});

		test.each([
			[
				'matching endpoints',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{
							...logistics.transferOrders[0]!,
							destinationCityId: 'industry-city'
						},
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'a retail endpoint',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{
							...logistics.transferOrders[0]!,
							destinationCityId: 'harbor-city'
						},
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'an unopened industry endpoint',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{
							...logistics.transferOrders[0]!,
							destinationCityId: 'quarry-works'
						},
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'an unknown material',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{ ...logistics.transferOrders[0]!, materialId: 'unknown-material' as MaterialId },
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'a nonpositive order quantity',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{ ...logistics.transferOrders[0]!, quantity: 0 },
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'a negative order transport cost',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{ ...logistics.transferOrders[0]!, transportCost: -1 },
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'a nonpositive route capacity',
				(logistics: GameState['logistics']) => ({
					...logistics,
					recurringRoutes: [{ ...logistics.recurringRoutes[0]!, capacity: 0 }]
				})
			],
			[
				'a nonpositive route frequency',
				(logistics: GameState['logistics']) => ({
					...logistics,
					recurringRoutes: [{ ...logistics.recurringRoutes[0]!, frequencyDays: 0 }]
				})
			],
			[
				'a nonpositive route lead time',
				(logistics: GameState['logistics']) => ({
					...logistics,
					recurringRoutes: [{ ...logistics.recurringRoutes[0]!, leadTimeDays: 0 }]
				})
			],
			[
				'a nonpositive route transport cost per unit',
				(logistics: GameState['logistics']) => ({
					...logistics,
					recurringRoutes: [{ ...logistics.recurringRoutes[0]!, transportCostPerUnit: 0 }]
				})
			],
			[
				'a negative route priority',
				(logistics: GameState['logistics']) => ({
					...logistics,
					recurringRoutes: [{ ...logistics.recurringRoutes[0]!, priority: -1 }]
				})
			],
			[
				'a negative creation day',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{ ...logistics.transferOrders[0]!, createdOnDay: -1 },
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'a creation day before its dispatch day',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{ ...logistics.transferOrders[0]!, createdOnDay: 0, dispatchedOnDay: 1 },
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'a dispatch day before its creation day',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{ ...logistics.transferOrders[0]!, dispatchedOnDay: 0 },
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'an arrival day not after dispatch',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{ ...logistics.transferOrders[0]!, arrivalOnDay: 1 },
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'an order dispatched after the current game day',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						logistics.transferOrders[0]!,
						{
							...logistics.transferOrders[1]!,
							createdOnDay: logistics.transferOrders[1]!.dispatchedOnDay + 2,
							dispatchedOnDay: logistics.transferOrders[1]!.dispatchedOnDay + 2,
							arrivalOnDay: logistics.transferOrders[1]!.dispatchedOnDay + 3
						}
					]
				})
			],
			[
				'an in-transit order that already arrived',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						logistics.transferOrders[0]!,
						{
							...logistics.transferOrders[1]!,
							arrivalOnDay: logistics.transferOrders[1]!.arrivalOnDay - 1
						}
					]
				})
			],
			[
				'a delivered order that arrives on the current day',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{
							...logistics.transferOrders[0]!,
							dispatchedOnDay: logistics.transferOrders[1]!.arrivalOnDay - 1,
							arrivalOnDay: logistics.transferOrders[1]!.arrivalOnDay
						},
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'an unknown transfer status',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{ ...logistics.transferOrders[0]!, status: 'queued' as never },
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'an unknown recurring-route state',
				(logistics: GameState['logistics']) => ({
					...logistics,
					recurringRoutes: [{ ...logistics.recurringRoutes[0]!, state: 'scheduled' as never }]
				})
			]
		] as const)('rejects %s', (_name, mutate) => {
			const baseGame = createLogisticsGame();
			const game = {
				...baseGame,
				logistics: mutate(createLogisticsState(baseGame))
			};

			expect(logisticsError(() => validateCurrentGameState(game)).code).toBe('invariant-logistics');
		});

		test('rejects an active route scheduled before the current game day', () => {
			const baseGame = createLogisticsGame();
			const logistics = createLogisticsState(baseGame);
			const game = {
				...baseGame,
				logistics: {
					...logistics,
					recurringRoutes: [
						{
							...logistics.recurringRoutes[0]!,
							state: 'active',
							nextDispatchOnDay: baseGame.day - 1
						}
					]
				}
			};

			expect(logisticsError(() => validateCurrentGameState(game)).code).toBe('invariant-logistics');
		});

		test('round-trips a route-sourced order after its route is removed', () => {
			expect.assertions(1);
			const baseGame = createLogisticsGame();
			const logistics = createLogisticsState(baseGame);
			const game = {
				...baseGame,
				logistics: {
					...logistics,
					recurringRoutes: [],
					nextRouteSequence: 2
				}
			};
			const record = createManualSaveRecord({ game });

			expect(validateSaveRecord(structuredClone(record))).toEqual(record);
		});

		test('rejects removed route provenance that would collide with the next generated route ID', () => {
			const baseGame = createLogisticsGame();
			const logistics = createLogisticsState(baseGame);
			const record = createManualSaveRecord({
				game: {
					...baseGame,
					logistics: {
						...logistics,
						recurringRoutes: [],
						nextRouteSequence: 1
					}
				}
			});

			expect(() => validateSaveRecord(structuredClone(record))).toThrow(SaveDataError);
		});

		test.each([
			[
				'a non-array transferOrders field',
				(logistics: GameState['logistics']) => ({ ...logistics, transferOrders: 'not-an-array' })
			],
			[
				'an unknown logistics field',
				(logistics: GameState['logistics']) => ({ ...logistics, extra: true })
			],
			[
				'an empty transfer order materialId',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{ ...logistics.transferOrders[0]!, materialId: '' },
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'an unknown transfer order source kind',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{ ...logistics.transferOrders[0]!, source: { kind: 'unknown' } },
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'an in-transit order that arrived before the current day',
				(logistics: GameState['logistics']) => ({
					...logistics,
					transferOrders: [
						{
							...logistics.transferOrders[0]!,
							createdOnDay: 0,
							dispatchedOnDay: 0,
							arrivalOnDay: 1,
							status: 'in-transit'
						},
						logistics.transferOrders[1]!
					]
				})
			],
			[
				'matching route endpoints',
				(logistics: GameState['logistics']) => ({
					...logistics,
					recurringRoutes: [
						{ ...logistics.recurringRoutes[0]!, destinationCityId: 'industry-city' }
					]
				})
			],
			[
				'an unknown route materialId',
				(logistics: GameState['logistics']) => ({
					...logistics,
					recurringRoutes: [
						{ ...logistics.recurringRoutes[0]!, materialId: 'unknown-material' as MaterialId }
					]
				})
			]
		] as const)('rejects %s', (_name, mutate) => {
			const baseGame = createLogisticsGame();
			const game = { ...baseGame, logistics: mutate(createLogisticsState(baseGame)) };

			expect(logisticsError(() => validateCurrentGameState(game)).code).toBe('invariant-logistics');
		});
	});

	describe('save schema version validation', () => {
		test('rejects schema 14 rather than migrating it', () => {
			const snapshot = { ...createSnapshotWithGame(createGame()), schemaVersion: 14 };

			expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(/Unsupported save schema version/);
		});

		test('validateSaveStoreSnapshot rejects a non-current version snapshot', () => {
			const snapshot = {
				schemaVersion: 99,
				autoSave: null,
				manualSlots: []
			};
			expect(() => validateSaveStoreSnapshot(snapshot)).toThrow(/Unsupported save schema version/);
		});

		test('validateSaveStoreSnapshot accepts a current-version snapshot', () => {
			const snapshot = createSnapshotWithGame(createGame());
			expect(() => validateSaveStoreSnapshot(snapshot)).not.toThrow();
		});
	});
});
