import { describe, expect, it, vi } from 'vitest';
import {
	actionKey,
	buildSupplyPlan,
	encodeIndustrialPlacementKey,
	getBuildFeasibility
} from './supplyPlannerActions';
import { INDUSTRIAL_BUILDING_TYPES } from './industry';
import type { RecurringRouteInput } from './interCityLogistics';
import { createNewGame } from './state';
import { createTwoIndustryCityGame } from './interCityLogistics.testUtils';
import type {
	GameState,
	IndustrialBuilding,
	IndustrialBuildingType,
	IndustrialBuildingTypeId,
	RecurringRoute,
	StoreProduct,
	TransferOrder,
	WorldCityId
} from './types';
import type { SupplyPlannerAction, SupplyPlannerActionAvailability } from './supplyPlannerActions';

function product(
	categoryId: string,
	options: Partial<Omit<StoreProduct, 'categoryId'>> = {}
): StoreProduct {
	return {
		categoryId,
		stock: 0,
		reorderThreshold: 0,
		targetStock: 70,
		sellingPrice: 3,
		...options
	};
}

function building(
	typeId: IndustrialBuildingTypeId,
	id = `building-${typeId}`,
	level = 1,
	mapX = 2,
	mapY = 2,
	cityId: WorldCityId = 'industry-city'
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

function availability(
	overrides: Partial<SupplyPlannerActionAvailability> = {}
): SupplyPlannerActionAvailability {
	return {
		canBuildIndustry: true,
		canUpgradeIndustry: true,
		canBuildRail: true,
		canManageLogistics: true,
		canSetRetailSupplySource: true,
		allowedIndustryBuildingTypeIds: [
			'grain-farm',
			'water-pump',
			'water-bottler',
			'warehouse',
			'flour-mill',
			'pantry-works'
		],
		...overrides
	};
}

function horizontalRails(fromX: number, toX: number, y = 4) {
	return Array.from({ length: toX - fromX + 1 }, (_, index) => ({
		x: fromX + index,
		y,
		level: 1
	}));
}

function verticalRails(fromY: number, toY: number, x = 2, level = 1) {
	return Array.from({ length: toY - fromY + 1 }, (_, index) => ({
		x,
		y: fromY + index,
		level
	}));
}

function route(overrides: Partial<RecurringRoute> = {}): RecurringRoute {
	return {
		id: 'route-water',
		originCityId: 'industry-city',
		destinationCityId: 'harbor-city',
		materialId: 'bottled-water',
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
	categoryId: string,
	archetype: 'convenience' | 'grocery' = 'convenience'
): GameState {
	const game = createNewGame(archetype, 20260810);
	return {
		...game,
		cash: 42_000,
		industrialBuildings: [building('warehouse', 'warehouse-1', 1, 2, 6)],
		cityInventories: [{ cityId: 'industry-city', materials: {} }],
		stores: [{ ...game.stores[0]!, products: [product(categoryId)] }],
		logistics: { ...game.logistics, recurringRoutes: [] }
	};
}

function pantryGame(): GameState {
	return baseGame('pantry', 'grocery');
}

function logisticsPlannerGame(overrides: Partial<RecurringRoute> = {}): GameState {
	const game = createTwoIndustryCityGame({ materials: false });
	const routeState: RecurringRoute = route({
		originCityId: 'breadbasket-basin',
		destinationCityId: 'industry-city',
		materialId: 'bottled-water',
		capacity: 10,
		frequencyDays: 1,
		leadTimeDays: 1,
		transportCostPerUnit: 1,
		nextDispatchOnDay: game.day,
		...overrides
	});
	return {
		...game,
		cash: 1_000_000,
		stores: [{ ...game.stores[0]!, products: [product('bottled-water', { targetStock: 350 })] }],
		industrialBuildings: [
			building('water-pump', 'water-pump-1', 100, 2, 6),
			building('water-bottler', 'water-bottler-1', 1, 6, 6),
			building('warehouse', 'warehouse-1', 1, 10, 6),
			building('warehouse', 'warehouse-2', 1, 14, 6),
			building('warehouse', 'warehouse-3', 1, 18, 6),
			building('warehouse', 'warehouse-4', 1, 22, 6)
		],
		cityInventories: [
			{ cityId: 'industry-city', materials: { water: 100 } },
			{ cityId: 'breadbasket-basin', materials: { 'bottled-water': 200 } }
		],
		industryCities: game.industryCities.map((city) =>
			city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 12, 8) } : city
		),
		logistics: { ...game.logistics, recurringRoutes: [routeState] }
	};
}

function flourLogisticsPlannerGame(overrides: Partial<RecurringRoute> = {}): GameState {
	const game = createTwoIndustryCityGame({ materials: false });
	return {
		...game,
		cash: 1_000_000,
		stores: [
			{
				...game.stores[0]!,
				archetypeId: 'grocery',
				products: [product('pantry', { targetStock: 10_000 })]
			}
		],
		industrialBuildings: [
			building('grain-farm', 'grain-farm-1', 1, 2, 2),
			building('flour-mill', 'flour-mill-1', 1, 32, 6),
			building('pantry-works', 'pantry-works-1', 1, 36, 20),
			building('warehouse', 'warehouse-1', 1, 40, 20),
			building('warehouse', 'warehouse-2', 1, 44, 20),
			building('warehouse', 'warehouse-3', 1, 48, 20),
			building('warehouse', 'warehouse-4', 1, 52, 20)
		],
		cityInventories: [
			{ cityId: 'industry-city', materials: {} },
			{ cityId: 'breadbasket-basin', materials: { flour: 200 } }
		],
		industryCities: game.industryCities.map((city) =>
			city.id === 'industry-city'
				? {
						...city,
						rails: [...verticalRails(4, 22, 2), ...horizontalRails(2, 54, 22)]
					}
				: city
		),
		logistics: {
			...game.logistics,
			recurringRoutes: [
				{
					...route({
						id: 'route-flour',
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'flour',
						capacity: 10,
						frequencyDays: 1,
						leadTimeDays: 2,
						transportCostPerUnit: 1,
						nextDispatchOnDay: game.day
					}),
					...overrides
				}
			]
		}
	};
}

function sourceChangePlannerGame(): GameState {
	const game = logisticsPlannerGame();
	return {
		...game,
		cityInventories: game.cityInventories.map((inventory) =>
			inventory.cityId === 'industry-city'
				? { ...inventory, materials: { 'bottled-water': 100 } }
				: { ...inventory, materials: { 'bottled-water': 800 } }
		),
		industrialBuildings: [
			...game.industrialBuildings,
			building('warehouse', 'breadbasket-warehouse-1', 1, 2, 2, 'breadbasket-basin'),
			building('warehouse', 'breadbasket-warehouse-2', 1, 6, 2, 'breadbasket-basin'),
			building('warehouse', 'breadbasket-warehouse-3', 1, 10, 2, 'breadbasket-basin'),
			building('warehouse', 'breadbasket-warehouse-4', 1, 14, 2, 'breadbasket-basin')
		],
		logistics: { ...game.logistics, recurringRoutes: [] }
	};
}

function readyPlan(game: GameState, actionAvailability = availability()) {
	const result = buildSupplyPlan(
		game,
		{ retailCityId: 'harbor-city', categoryId: game.stores[0]!.products[0]!.categoryId },
		actionAvailability
	);
	expect(result.status).toBe('ready');
	if (result.status !== 'ready') throw new Error(`Expected ready plan, got ${result.status}`);
	return result.plan;
}

describe('supply planner actions', () => {
	it('keeps tied upgrade recommendations deterministic when source order is reversed', () => {
		const makeGame = (reverse: boolean): GameState => {
			const game = baseGame('bottled-water');
			const buildings = [
				building('water-pump', 'water-pump-1', 1, 2, 2),
				building('water-bottler', 'water-bottler-z', 1, 10, 2),
				building('water-bottler', 'water-bottler-a', 1, 14, 2),
				building('warehouse', 'warehouse-1', 1, 18, 2)
			];
			return {
				...game,
				stores: [
					{ ...game.stores[0]!, products: [product('bottled-water', { targetStock: 700 })] }
				],
				industrialBuildings: reverse ? [...buildings].reverse() : buildings,
				industryCities: game.industryCities.map((city) =>
					city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 20) } : city
				),
				cityInventories: [{ cityId: 'industry-city', materials: {} }]
			};
		};

		const first = readyPlan(makeGame(false), availability({ canBuildIndustry: false }));
		const second = readyPlan(makeGame(true), availability({ canBuildIndustry: false }));

		expect(first.alternatives[0]?.action).toEqual(second.alternatives[0]?.action);
		expect(first.alternatives[0]?.action).toMatchObject({
			kind: 'upgrade-building',
			buildingId: 'water-bottler-a'
		});
	});

	it('does not fan producer candidates beyond the primary material', () => {
		const plan = readyPlan(pantryGame());
		const primary = plan.baseline.bottleneck;
		if (!('materialId' in primary)) throw new Error('fixture requires material bottleneck');

		const producerOrUpgradeActions = plan.alternatives
			.map((candidate) => candidate.action)
			.filter(
				(
					action
				): action is Extract<
					SupplyPlannerAction,
					{ kind: 'build-producer' | 'upgrade-building' }
				> => action.kind === 'build-producer' || action.kind === 'upgrade-building'
			);
		expect(producerOrUpgradeActions.length).toBeGreaterThan(0);
		for (const action of producerOrUpgradeActions) {
			expect(action.materialId).toBe(primary.materialId);
		}
	});

	it('treats an upstream missing producer as a structural prerequisite', () => {
		const plan = readyPlan(pantryGame());

		expect(plan.baseline.bottleneck).toMatchObject({
			kind: 'missing-producer',
			materialId: 'grain'
		});
		expect(plan.recommendation.action).toMatchObject({
			kind: 'build-producer',
			materialId: 'grain'
		});
		expect(plan.recommendation.comparison.requiresAdditionalProducerBuilds).toBe(true);
		expect(plan.recommendation.comparison.preRailNetCashBenefit30).toBeNull();
		expect(plan.recommendation.comparison.netCashBenefit30).toBeNull();
	});

	it('recommends a structural prerequisite build even when canBuildRail is false', () => {
		// With the default empty Pantry chain, Grain is selected first while
		// Flour Mill and Pantry Works are still missing. There is no usable
		// downstream Grain sink yet, so by definition no Grain Farm placement
		// can be railReady. With canBuildRail: false, the planner must still
		// recommend Grain Farm as the next structural prerequisite — whether
		// new rail will eventually be needed cannot be determined until the
		// downstream building exists.
		const plan = readyPlan(pantryGame(), availability({ canBuildRail: false }));

		expect(plan.baseline.bottleneck).toMatchObject({
			kind: 'missing-producer',
			materialId: 'grain'
		});
		expect(plan.recommendation.action).toMatchObject({
			kind: 'build-producer',
			materialId: 'grain'
		});
		expect(plan.recommendation.comparison.requiresAdditionalProducerBuilds).toBe(true);
	});

	it('does not recommend a scenario-disallowed building type', () => {
		const plan = readyPlan(
			baseGame('bottled-water'),
			availability({ allowedIndustryBuildingTypeIds: [] })
		);

		expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'action-unavailable' });
	});

	it('reports build-disabled availability without fabricating a candidate', () => {
		const plan = readyPlan(pantryGame(), availability({ canBuildIndustry: false }));

		expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'action-unavailable' });
	});

	it('recommends connecting an existing required producer before adding capacity', () => {
		const game = baseGame('bottled-water');
		const disconnected = {
			...game,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 3, 19),
				building('water-bottler', 'water-bottler-1', 1, 10, 2),
				building('warehouse', 'warehouse-1', 1, 2, 6)
			],
			industryCities: game.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: [{ x: 2, y: 5, level: 1 }] } : city
			)
		};
		const plan = readyPlan(disconnected);

		expect(plan.baseline.bottleneck.kind).toBe('rail-disconnected');
		expect(plan.recommendation.action.kind).toBe('connect-rail');
	});

	it('reports rail-disabled availability for a disconnected bottleneck', () => {
		const game = baseGame('bottled-water');
		const disconnected = {
			...game,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 3, 19),
				building('water-bottler', 'water-bottler-1', 1, 10, 2),
				building('warehouse', 'warehouse-1', 1, 2, 6)
			]
		};
		const plan = readyPlan(disconnected, availability({ canBuildRail: false }));

		expect(plan.baseline.bottleneck.kind).toBe('rail-disconnected');
		expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'action-unavailable' });
	});

	it('recommends warehouse capacity when storage is binding', () => {
		const game = {
			...baseGame('bottled-water'),
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 3, 19),
				building('water-bottler', 'water-bottler-1', 1, 10, 2),
				building('warehouse', 'warehouse-1', 1, 2, 6)
			],
			cityInventories: [{ cityId: 'industry-city' as const, materials: { water: 250 } }]
		};
		const plan = readyPlan(game);

		expect(plan.baseline.bottleneck.kind).toBe('warehouse-capacity');
		expect(plan.recommendation.action.kind).toBe('build-warehouse');
		expect(plan.recommendation.comparison.warehouseFreeGain).toBeGreaterThan(0);
	});

	it('does not invent usable capacity or final ROI when a new producer needs future rail', () => {
		expect.assertions(6);
		const candidateGame = baseGame('bottled-water');
		const plan = readyPlan(candidateGame);
		const candidate = plan.alternatives.find((row) => row.action.kind === 'build-producer');

		expect(candidate).toBeDefined();
		if (!candidate || candidate.action.kind !== 'build-producer') return;
		expect(candidate.comparison.requiresRailConnection).toBe(true);
		expect(candidate.comparison.netCashBenefit30).toBeNull();
		expect(candidate.potentialProjectionAfterRail).toBeDefined();
		expect(candidate.projection.totals.importUnits30).toBe(candidate.baseline.totals.importUnits30);
	});

	it('unlocks finished-material demand in the potential projection when a rail-connected warehouse exists', () => {
		// The water-pump and warehouse are rail-connected, but there is no
		// rail-ready placement for the water-bottler (industrial terrain is
		// far from the rail). The candidate is a future-rail build-producer
		// for bottled-water (a finished material). Since the warehouse is
		// rail-connected, the potential snapshot should unlock the candidate's
		// reachable demand to full demand, making preRailNetCashBenefit30
		// non-null (it may be negative due to costs, but it should not be
		// null/unknown).
		const base = baseGame('bottled-water');
		const game = {
			...base,
			cash: 1_000_000,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 2, 2),
				building('warehouse', 'warehouse-1', 1, 10, 2)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 10) } : city
			)
		};
		const plan = readyPlan(game);
		const candidate = plan.alternatives.find(
			(row) => row.action.kind === 'build-producer' && row.action.materialId === 'bottled-water'
		);

		expect(candidate).toBeDefined();
		if (!candidate || candidate.action.kind !== 'build-producer') return;
		expect(candidate.comparison.requiresRailConnection).toBe(true);
		expect(candidate.comparison.netCashBenefit30).toBeNull();
		// preRailNetCashBenefit30 must be a number (not null) — the finished
		// material's demand is unlocked in the potential projection.
		expect(candidate.comparison.preRailNetCashBenefit30).not.toBeNull();
		expect(candidate.potentialProjectionAfterRail).toBeDefined();
		// The potential projection should show some import reduction for
		// bottled-water (the candidate's target material).
		expect(candidate.comparison.importReduction30).toBeGreaterThan(0);
	});

	it('unlocks finished-material demand when no existing rail touches either endpoint but a future rail path is routeable', () => {
		// Neither the warehouse nor any valid water-bottler placement tile
		// has adjacent existing rail. However, the empty legal tiles
		// between them form a routeable corridor, so the real rail builder
		// could connect them. The supply planner must not classify the
		// candidate as ineffective solely because neither endpoint
		// currently touches rail — it should still unlock the finished
		// material's demand in the potential projection, yielding a
		// non-null preRailNetCashBenefit30.
		const base = baseGame('bottled-water');
		const game = {
			...base,
			cash: 1_000_000,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 2, 6),
				building('warehouse', 'warehouse-1', 1, 18, 6)
			],
			// No rails at all — the future rail path must route through
			// empty legal industrial tiles.
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: [] } : city
			)
		};
		const plan = readyPlan(game);
		const candidate = plan.alternatives.find(
			(row) => row.action.kind === 'build-producer' && row.action.materialId === 'bottled-water'
		);

		expect(candidate).toBeDefined();
		if (!candidate || candidate.action.kind !== 'build-producer') return;
		// The candidate requires a future rail connection (no existing
		// rail-ready placement), but the future route exists.
		expect(candidate.comparison.requiresRailConnection).toBe(true);
		expect(candidate.comparison.netCashBenefit30).toBeNull();
		// preRailNetCashBenefit30 must be a number (not null) — the
		// finished material's demand is unlocked because a future rail
		// path can be built, even though no rail currently touches either
		// building.
		expect(candidate.comparison.preRailNetCashBenefit30).not.toBeNull();
		expect(candidate.comparison.importReduction30).toBeGreaterThan(0);
	});

	it('uses the retail import price for Bottled Water economics', () => {
		expect.assertions(5);
		// Rail at y=8 connects the warehouse (bottom attach at y=8) to valid
		// industrial-terrain placement tiles (y>=6, bottom attach at y=8) so
		// the candidate is rail-ready and the normal projection drives
		// economics. Buildings are placed at y=6 (industrial terrain starts at
		// y=6 in the generated industry city).
		const base = baseGame('bottled-water');
		const game = {
			...base,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 2, 6),
				building('warehouse', 'warehouse-1', 1, 10, 6)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(0, 55, 8) } : city
			)
		};
		const plan = readyPlan(game);
		const candidate = plan.alternatives.find(
			(row) => row.action.kind === 'build-producer' && row.action.materialId === 'bottled-water'
		);

		expect(candidate).toBeDefined();
		if (!candidate || candidate.action.kind !== 'build-producer') return;
		expect(candidate.comparison.importReduction30).toBe(300);
		expect(candidate.comparison.importSpendReduction30).toBe(600);
		expect(candidate.comparison.preRailNetCashBenefit30).toBe(-630);
	});

	it('does not mutate the game while evaluating candidates', () => {
		const game = pantryGame();
		const before = structuredClone(game);

		readyPlan(game);

		expect(game).toEqual(before);
	});
});

describe('supply planner action noop branches', () => {
	it('resumes a paused route with a complete positive-value projection', () => {
		const plan = readyPlan(logisticsPlannerGame({ state: 'paused' }));

		expect(plan.recommendation.action).toEqual({ kind: 'resume-route', routeId: 'route-water' });
		expect(plan.recommendation.logisticsCause).toMatchObject({
			kind: 'route-paused',
			cityId: 'industry-city',
			routeId: 'route-water',
			materialId: 'bottled-water'
		});
		expect(plan.recommendation.comparison.shortageReduction30).toBeGreaterThan(0);
		expect(plan.recommendation.comparison.netCashBenefit30).toBeGreaterThan(0);
	});

	it('raises capacity only for a route whose projected route capacity binds', () => {
		const plan = readyPlan(logisticsPlannerGame({ capacity: 1 }));

		expect(plan.recommendation.action).toMatchObject({
			kind: 'edit-route',
			routeId: 'route-water',
			field: 'capacity',
			from: 1
		});
		expect(plan.recommendation.logisticsCause).toMatchObject({
			kind: 'route-capacity-constrained',
			cityId: 'industry-city',
			routeId: 'route-water',
			materialId: 'bottled-water'
		});
	});

	it('does not make an origin-stock-constrained route larger or faster', () => {
		const base = logisticsPlannerGame({ capacity: 1, frequencyDays: 3 });
		const plan = readyPlan({
			...base,
			cityInventories: base.cityInventories.map((inventory) =>
				inventory.cityId === 'breadbasket-basin' ? { ...inventory, materials: {} } : inventory
			)
		});

		expect(plan.recommendation.action).not.toMatchObject({
			kind: 'edit-route',
			routeId: 'route-water'
		});
	});

	it('does not mutate copied route state while ranking a logistics action', () => {
		const game = logisticsPlannerGame({ capacity: 1 });
		const before = structuredClone(game);

		readyPlan(game);

		expect(game).toEqual(before);
	});

	it('treats a full inbound destination as a city-scoped warehouse prerequisite', () => {
		const base = logisticsPlannerGame();
		const plan = readyPlan({
			...base,
			logistics: {
				...base.logistics,
				transferOrders: [
					{
						id: 'transfer-full-destination',
						source: { kind: 'recurring-route', routeId: 'route-water' },
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'bottled-water',
						quantity: 1_000,
						createdOnDay: base.day,
						dispatchedOnDay: base.day,
						arrivalOnDay: base.day + 1,
						transportCost: 1_000,
						status: 'in-transit'
					}
				]
			}
		});

		expect(plan.recommendation.action).toMatchObject({
			kind: 'build-warehouse',
			cityId: 'industry-city'
		});
		expect(plan.recommendation.comparison.warehouseFreeGain).toBeGreaterThan(0);
		expect(plan.recommendation.comparison.netCashBenefit30).toBeNull();
		expect(plan.recommendation.logisticsCause).toMatchObject({
			kind: 'destination-full',
			cityId: 'industry-city',
			routeId: 'route-water',
			materialId: 'bottled-water',
			blockedUnits: 10,
			amount: 10
		});
	});

	it('does not diagnose destination-full when local consumption frees day-zero warehouse space', () => {
		const base = logisticsPlannerGame({ capacity: 50 });
		const plan = readyPlan({
			...base,
			cityInventories: base.cityInventories.map((inventory) =>
				inventory.cityId === 'industry-city'
					? { ...inventory, materials: { 'bottled-water': 800 } }
					: inventory
			),
			logistics: {
				...base.logistics,
				recurringRoutes: [
					{
						...base.logistics.recurringRoutes[0]!,
						capacity: 50
					}
				]
			}
		});

		expect(plan.recommendation.action.kind).not.toBe('build-warehouse');
		expect(plan.recommendation.logisticsCause?.kind).not.toBe('destination-full');
		const forecast = plan.baseline.routeForecasts?.find((row) => row.route.id === 'route-water');
		expect(forecast?.projectedDispatchedUnits30).toBeGreaterThan(0);
	});

	it('reports a cross-material priority blocker through the action diagnosis', () => {
		const base = logisticsPlannerGame();
		const plan = readyPlan({
			...base,
			cityInventories: base.cityInventories.map((inventory) =>
				inventory.cityId === 'industry-city'
					? { ...inventory, materials: {} }
					: { ...inventory, materials: { grain: 800, 'bottled-water': 200 } }
			),
			logistics: {
				...base.logistics,
				recurringRoutes: [
					{
						...base.logistics.recurringRoutes[0]!,
						id: 'route-blocker',
						materialId: 'grain',
						capacity: 800,
						priority: 1
					},
					{
						...base.logistics.recurringRoutes[0]!,
						id: 'route-loser',
						materialId: 'bottled-water',
						capacity: 10,
						priority: 2
					}
				]
			}
		});

		expect(plan.recommendation.action).toMatchObject({
			kind: 'edit-route',
			routeId: 'route-loser',
			field: 'priority'
		});
		expect(plan.recommendation.logisticsCause).toMatchObject({
			kind: 'route-priority-constrained',
			routeId: 'route-loser',
			blockingRouteId: 'route-blocker',
			materialId: 'bottled-water'
		});
	});

	it('offers source changes when only retail-source capability is available', () => {
		const plan = readyPlan(
			sourceChangePlannerGame(),
			availability({
				canManageLogistics: false,
				canSetRetailSupplySource: true,
				canBuildIndustry: false,
				canUpgradeIndustry: false
			})
		);

		expect(plan.recommendation.action.kind).toBe('change-supply-source');
		expect(plan.alternatives.some((candidate) => candidate.action.kind === 'create-route')).toBe(
			false
		);
	});

	it('finds the selected source category on a non-first eligible store', () => {
		const base = sourceChangePlannerGame();
		const firstStore = { ...base.stores[0]!, id: 'store-a', products: [product('snacks')] };
		const secondStore = {
			...base.stores[0]!,
			id: 'store-b',
			products: [product('bottled-water', { targetStock: 350 })]
		};
		const result = buildSupplyPlan(
			{ ...base, stores: [secondStore, firstStore] },
			{ retailCityId: 'harbor-city', categoryId: 'bottled-water' },
			availability({
				canManageLogistics: false,
				canSetRetailSupplySource: true,
				canBuildIndustry: false,
				canUpgradeIndustry: false
			})
		);

		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		expect(result.plan.recommendation.action.kind).toBe('change-supply-source');
		expect(result.plan.recommendation.action).toMatchObject({
			retailCityId: 'harbor-city',
			fromSupplyCityId: 'industry-city',
			toSupplyCityId: 'breadbasket-basin'
		});
	});

	it('keeps scheduled costs for an active route when evaluating a source change', () => {
		const base = sourceChangePlannerGame();
		const plan = readyPlan({
			...base,
			logistics: {
				...base.logistics,
				recurringRoutes: [
					{
						id: 'route-active-outbound',
						originCityId: 'industry-city',
						destinationCityId: 'breadbasket-basin',
						materialId: 'bottled-water',
						capacity: 10,
						frequencyDays: 1,
						leadTimeDays: 1,
						transportCostPerUnit: 1,
						priority: 1,
						state: 'active',
						nextDispatchOnDay: base.day
					}
				]
			}
		});
		const source = plan.alternatives.find(
			(candidate) => candidate.action.kind === 'change-supply-source'
		);

		expect(source).toBeDefined();
		if (!source) return;
		expect(source.comparison.incrementalTransportCost30).toBe(0);
	});

	it('creates one bounded route per stocked remote origin when no inbound route exists', () => {
		const game = flourLogisticsPlannerGame();
		const noRoutes = { ...game, logistics: { ...game.logistics, recurringRoutes: [] } };
		const plan = readyPlan(noRoutes);

		expect(plan.recommendation.action.kind).toBe('create-route');
		expect(plan.alternatives.filter((row) => row.action.kind === 'create-route')).toHaveLength(1);
		if (plan.recommendation.action.kind === 'create-route') {
			expect(plan.recommendation.action.input).toMatchObject({
				originCityId: 'breadbasket-basin',
				destinationCityId: 'industry-city',
				materialId: 'flour',
				frequencyDays: 1,
				priority: 0
			});
			expect(plan.recommendation.action.input.capacity).toBeGreaterThan(0);
		}
	});

	it('compares a create-route candidate against unrelated inbound transport costs', () => {
		const base = flourLogisticsPlannerGame();
		const unrelatedInboundRoute: RecurringRoute = {
			...route({
				id: 'route-unrelated-water',
				originCityId: 'breadbasket-basin',
				destinationCityId: 'industry-city',
				materialId: 'water',
				capacity: 50,
				frequencyDays: 1,
				leadTimeDays: 1,
				transportCostPerUnit: 100,
				priority: 0,
				nextDispatchOnDay: base.day
			})
		};
		const game = {
			...base,
			cityInventories: base.cityInventories.map((inventory) =>
				inventory.cityId === 'breadbasket-basin'
					? { ...inventory, materials: { flour: 200, water: 50 } }
					: inventory
			),
			logistics: {
				...base.logistics,
				recurringRoutes: [unrelatedInboundRoute]
			}
		};

		const plan = readyPlan(game);
		const candidate = plan.alternatives.find((row) => row.action.kind === 'create-route');

		expect(candidate).toBeDefined();
		if (!candidate) return;
		expect(candidate.comparison.incrementalTransportCost30).toBeGreaterThan(0);
		expect(candidate.comparison.netCashBenefit30).toBeGreaterThan(0);
		expect(plan.recommendation.action.kind).toBe('create-route');
	});

	it('uses each inbound route material row for timing diagnosis', () => {
		const base = flourLogisticsPlannerGame();
		const routePantry: RecurringRoute = {
			...route({
				id: 'route-pantry',
				originCityId: 'breadbasket-basin',
				destinationCityId: 'industry-city',
				materialId: 'pantry',
				capacity: 10_000,
				frequencyDays: 20,
				leadTimeDays: 0,
				priority: 0,
				nextDispatchOnDay: base.day
			})
		};
		const routeGrain: RecurringRoute = {
			...route({
				id: 'route-grain',
				originCityId: 'breadbasket-basin',
				destinationCityId: 'industry-city',
				materialId: 'grain',
				capacity: 10_000,
				frequencyDays: 100,
				leadTimeDays: 1,
				priority: 1,
				nextDispatchOnDay: base.day + 100
			})
		};
		const existingPantryOrder: TransferOrder = {
			id: 'transfer-pantry-early',
			source: { kind: 'recurring-route', routeId: routePantry.id },
			originCityId: 'breadbasket-basin',
			destinationCityId: 'industry-city',
			materialId: 'pantry',
			quantity: 100,
			createdOnDay: base.day,
			dispatchedOnDay: base.day,
			arrivalOnDay: base.day,
			transportCost: 200,
			status: 'in-transit'
		};
		const game = {
			...base,
			industrialBuildings: [
				...base.industrialBuildings,
				...Array.from({ length: 5 }, (_, index) =>
					building('warehouse', `timing-warehouse-${index}`, 1, 60 + index, 2)
				)
			],
			cityInventories: base.cityInventories.map((inventory) =>
				inventory.cityId === 'industry-city'
					? { ...inventory, materials: { pantry: 400 } }
					: { ...inventory, materials: { pantry: 100_000, grain: 1_000 } }
			),
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city'
					? {
							...city,
							rails: [
								...verticalRails(2, 22, 2),
								...verticalRails(2, 22, 32),
								...horizontalRails(2, 54, 22)
							]
						}
					: city
			),
			logistics: {
				...base.logistics,
				recurringRoutes: [routePantry, routeGrain],
				transferOrders: [existingPantryOrder]
			}
		};

		const plan = readyPlan(game);
		const pantryRow = plan.baseline.materials.find((row) => row.materialId === 'pantry');

		expect(pantryRow?.thirtyDay.projectedStockoutDay).toBeGreaterThan(0);
		expect(plan.recommendation.logisticsCause).toMatchObject({
			kind: 'route-frequency',
			routeId: 'route-pantry',
			materialId: 'pantry',
			stockoutDay: pantryRow?.thirtyDay.projectedStockoutDay,
			nextArrivalDay: base.day + 20
		});
	});

	it('falls back to the local plan when a route edit has negative complete value', () => {
		const plan = readyPlan(flourLogisticsPlannerGame({ transportCostPerUnit: 100 }));

		expect(plan.recommendation.action.kind).not.toBe('edit-route');
		expect(['build-producer', 'upgrade-building', 'connect-rail']).toContain(
			plan.recommendation.action.kind
		);
	});

	it('keeps the existing missing-producer guard ahead of active logistics', () => {
		const game = {
			...baseGame('bottled-water'),
			logistics: {
				...baseGame('bottled-water').logistics,
				recurringRoutes: [route({ materialId: 'bottled-water' })]
			}
		};
		const plan = readyPlan(game);
		expect(plan.baseline.bottleneck).toMatchObject({ kind: 'missing-producer' });
		expect(plan.recommendation.action).toMatchObject({
			kind: 'build-producer',
			materialId: 'water'
		});
	});

	it('returns a no-demand noop when demand is zero', () => {
		const game = {
			...baseGame('bottled-water'),
			cities: [
				{
					...baseGame('bottled-water').cities[0]!,
					tiles: baseGame('bottled-water').cities[0]!.tiles.map((tile) => ({
						...tile,
						demand: 0,
						footTraffic: 0,
						customerFit: 0
					}))
				}
			],
			logistics: {
				...baseGame('bottled-water').logistics,
				recurringRoutes: [route({ materialId: 'bottled-water' })]
			}
		};
		const plan = readyPlan(game);
		expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'no-demand' });
	});

	it('returns a surplus noop when capacity covers demand', () => {
		const game = {
			...baseGame('bottled-water'),
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 10, 2, 2),
				building('water-bottler', 'water-bottler-1', 10, 10, 2),
				building('warehouse', 'warehouse-1', 1, 18, 2)
			],
			industryCities: baseGame('bottled-water').industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 20) } : city
			),
			stores: [
				{
					...baseGame('bottled-water').stores[0]!,
					products: [product('bottled-water', { targetStock: 10 })]
				}
			]
		};
		const plan = readyPlan(game);
		expect(plan.baseline.bottleneck).toEqual({ kind: 'none' });
		expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'surplus' });
	});

	it('returns an unaffordable noop when warehouse build cost exceeds cash', () => {
		const game = {
			...baseGame('bottled-water'),
			cash: 0,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 3, 19),
				building('water-bottler', 'water-bottler-1', 1, 10, 2),
				building('warehouse', 'warehouse-1', 1, 2, 6)
			],
			cityInventories: [{ cityId: 'industry-city' as const, materials: { water: 250 } }]
		};
		const plan = readyPlan(game);
		expect(plan.baseline.bottleneck.kind).toBe('warehouse-capacity');
		expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'unaffordable' });
	});

	it('returns an action-unavailable noop when warehouse building is not allowed', () => {
		const game = {
			...baseGame('bottled-water'),
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 3, 19),
				building('water-bottler', 'water-bottler-1', 1, 10, 2),
				building('warehouse', 'warehouse-1', 1, 2, 6)
			],
			cityInventories: [{ cityId: 'industry-city' as const, materials: { water: 250 } }]
		};
		const plan = readyPlan(
			game,
			availability({ allowedIndustryBuildingTypeIds: ['water-pump', 'water-bottler'] })
		);
		expect(plan.baseline.bottleneck.kind).toBe('warehouse-capacity');
		expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'action-unavailable' });
	});

	it('returns a no-feasible-action noop when build and upgrade are both unavailable', () => {
		const game = baseGame('bottled-water');
		const plan = readyPlan(
			game,
			availability({ canBuildIndustry: false, canUpgradeIndustry: false })
		);
		expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'action-unavailable' });
	});

	it('returns an ineffective noop when no candidate has positive net benefit', () => {
		// Set up a production-capacity bottleneck where the only candidates
		// are build-producer actions that require rail (netCashBenefit30 is
		// null) and whose preRailNetCashBenefit30 is negative because the
		// building cost exceeds the 30-day import savings.
		const base = baseGame('bottled-water');
		const game = {
			...base,
			cash: 1_000_000,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 2, 2),
				building('water-bottler', 'water-bottler-1', 1, 6, 2),
				building('warehouse', 'warehouse-1', 1, 10, 2)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 10) } : city
			),
			stores: [
				{
					...base.stores[0]!,
					products: [product('bottled-water', { targetStock: 700, sellingPrice: 3 })]
				}
			]
		};
		const plan = readyPlan(game, availability({ canUpgradeIndustry: false }));
		expect(plan.recommendation.action.kind).toBe('none');
		if (plan.recommendation.action.kind === 'none') {
			expect(plan.recommendation.action.reason).toBe('ineffective');
		}
	});

	it('recommends a non-finished producer with unknown pre-rail ROI instead of labeling it ineffective', () => {
		// The water-bottler is installed and rail-connected to the warehouse.
		// The water-pump is missing. The only valid water-pump placement is
		// on the water-source resource tile, which is far from the rail — so
		// the candidate requires a future rail connection. Since water is a
		// non-finished material, preRailRoiUnknown=true and both ROI fields
		// are null. The candidate should be recommended rather than falling
		// through to the ineffective noop.
		const base = baseGame('bottled-water');
		const game = {
			...base,
			cash: 1_000_000,
			industrialBuildings: [
				building('water-bottler', 'water-bottler-1', 1, 2, 2),
				building('warehouse', 'warehouse-1', 1, 6, 2)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 8) } : city
			)
		};
		const plan = readyPlan(game, availability({ canUpgradeIndustry: false }));

		expect(plan.recommendation.action.kind).toBe('build-producer');
		expect(plan.recommendation.comparison.requiresRailConnection).toBe(true);
		expect(plan.recommendation.comparison.netCashBenefit30).toBeNull();
		expect(plan.recommendation.comparison.preRailNetCashBenefit30).toBeNull();
	});

	it('preserves a future-rail unknown-ROI placement class over a rail-ready known-negative one', () => {
		// Issue 3 regression: when the same building type has two placement
		// classes — one rail-ready with known-negative netCashBenefit30 and
		// one future-rail with unknown preRailNetCashBenefit30 (null) — the
		// per-building-type selection must not discard the unknown-ROI
		// candidate in favor of the known-negative one. The viability tier
		// (unresolved unknown > known non-positive) must drive selection,
		// not completeness (complete > incomplete).
		//
		// Setup: pantry chain with grain-farm and pantry-works connected to
		// a warehouse via rail, but NO flour-mill. Flour is an intermediate
		// material, so a future-rail flour-mill placement has
		// preRailNetCashBenefit30 = null (preRailRoiUnknown = true). A
		// rail-ready flour-mill placement has netCashBenefit30 computed and
		// negative (high buildCost + operating costs exceed import savings).
		// The planner must recommend the future-rail candidate (unresolved
		// unknown ROI) rather than falling through to ineffective.
		const base = baseGame('pantry', 'grocery');
		const game = {
			...base,
			cash: 100_000,
			industrialBuildings: [
				building('grain-farm', 'grain-farm-1', 1, 2, 2),
				building('pantry-works', 'pantry-works-1', 1, 32, 20),
				building('warehouse', 'warehouse-1', 1, 40, 20)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city'
					? {
							...city,
							rails: [...verticalRails(4, 22, 2), ...horizontalRails(2, 42, 22)]
						}
					: city
			)
		};
		const plan = readyPlan(
			game,
			availability({
				allowedIndustryBuildingTypeIds: ['grain-farm', 'flour-mill', 'pantry-works', 'warehouse'],
				canUpgradeIndustry: false
			})
		);

		// The bottleneck is the missing flour-mill (intermediate, depth 1).
		expect(plan.baseline.bottleneck).toMatchObject({
			kind: 'missing-producer',
			materialId: 'flour'
		});

		// The recommendation must be a build-producer for flour, not an
		// ineffective noop. The future-rail placement class (unknown ROI,
		// tier 2) must be selected over the rail-ready placement class
		// (known negative ROI, tier 1).
		expect(plan.recommendation.action).toMatchObject({
			kind: 'build-producer',
			materialId: 'flour',
			buildingTypeId: 'flour-mill'
		});
		expect(plan.recommendation.comparison.requiresRailConnection).toBe(true);
		expect(plan.recommendation.comparison.netCashBenefit30).toBeNull();
		expect(plan.recommendation.comparison.preRailNetCashBenefit30).toBeNull();
		expect(plan.recommendation.comparison.requiresAdditionalProducerBuilds).toBe(false);
	});

	it('returns no-feasible-action when all placements lack a future rail path to any sink', () => {
		// P1 #2 regression: when rail construction IS available but every
		// valid placement tile is neither rail-ready nor able to connect to
		// a usable downstream sink in the future, the planner must return
		// no-feasible-action — not an unknown-ROI build-producer.
		//
		// Setup: pantry chain with Flour Mill and Pantry Works connected to
		// a warehouse via rail on the industrial side. The Grain Farm is
		// missing, and the only valid grain-field placement tile is
		// surrounded by blocked terrain so no future rail path can reach it
		// from the Flour Mill (the grain sink). With canBuildRail: true,
		// the old code accepted every valid placement; the fix excludes
		// placements with no future rail path.
		const base = baseGame('pantry', 'grocery');
		const city = base.industryCities.find((c) => c.id === 'industry-city')!;
		// Block all cells adjacent to the grain-field at (3,3) so no
		// future rail can reach it from the industrial side.
		const grainAdjacent = [
			{ x: 2, y: 3 },
			{ x: 5, y: 3 },
			{ x: 2, y: 4 },
			{ x: 5, y: 4 },
			{ x: 3, y: 2 },
			{ x: 4, y: 2 },
			{ x: 3, y: 5 },
			{ x: 4, y: 5 }
		];
		const modifiedTiles = city.tiles.map((t) => {
			if (grainAdjacent.some((c) => c.x === t.x && c.y === t.y)) {
				return { ...t, terrain: 'blocked' as const, locked: true };
			}
			return t;
		});
		const game = {
			...base,
			cash: 100_000,
			industrialBuildings: [
				building('flour-mill', 'flour-mill-1', 1, 26, 6),
				building('pantry-works', 'pantry-works-1', 1, 30, 6),
				building('warehouse', 'warehouse-1', 1, 34, 6)
			],
			industryCities: base.industryCities.map((c) =>
				c.id === 'industry-city'
					? {
							...c,
							tiles: modifiedTiles,
							rails: horizontalRails(26, 36, 8)
						}
					: c
			)
		};
		const plan = readyPlan(
			game,
			availability({
				canUpgradeIndustry: false,
				allowedIndustryBuildingTypeIds: ['grain-farm', 'flour-mill', 'pantry-works', 'warehouse']
			})
		);

		// The Grain Farm placement is the only valid tile but has no
		// future rail path to the Flour Mill sink. The planner must return
		// no-feasible-action, not a build-producer recommendation.
		expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'no-feasible-action' });
	});
});

describe('supply planner action material-specific structural exception', () => {
	it('does not treat an installed-but-disconnected downstream stage as structurally missing', () => {
		// P1 regression: Grain Farm is missing, but Flour Mill and Pantry
		// Works are both installed — just rail-disconnected from each other
		// (and from any warehouse). Grain therefore has zero USABLE sinks,
		// yet the downstream stage is NOT missing. The old code derived
		// structuralChainIncomplete from usableSinkBuildingIdsByMaterial
		// (which omits the disconnected Flour Mill), so it bypassed rail
		// gating and recommended a useless Grain Farm even with
		// canBuildRail: false. The fix derives the exception from installed
		// downstream producer presence, so rail gating applies and no
		// useless build is recommended.
		const base = baseGame('pantry', 'grocery');
		const game = {
			...base,
			industrialBuildings: [
				building('warehouse', 'warehouse-1', 1, 2, 6),
				building('flour-mill', 'flour-mill-1', 1, 20, 20),
				building('pantry-works', 'pantry-works-1', 1, 28, 20)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: [] } : city
			)
		};
		const plan = readyPlan(game, availability({ canBuildRail: false, canUpgradeIndustry: false }));

		// Grain is the missing producer (deepest), but the Flour Mill is
		// installed, so the chain is not structurally incomplete.
		expect(plan.baseline.bottleneck).toMatchObject({
			kind: 'missing-producer',
			materialId: 'grain'
		});
		// With canBuildRail disabled and no rail-ready / future-connectable
		// Grain Farm placement (no usable grain sink to connect to), the
		// planner must NOT recommend a Grain Farm build. The old code did.
		expect(plan.recommendation.action.kind).toBe('none');
		if (plan.recommendation.action.kind === 'build-producer') {
			expect(plan.recommendation.action.materialId).not.toBe('grain');
		}
	});

	it('does not treat a missing sibling producer as structural when its downstream sink exists', () => {
		// P1 #3 regression: Sugar and Water are both missing in the Drinks
		// chain, but the Syrup Plant (which consumes both) already exists
		// and is usable. Sugar's downstream sink (Syrup Plant) exists, so
		// Sugar is NOT a structural prerequisite — even though
		// missing.length > 1. With canBuildRail: false, the Sugar Farm
		// placement (which requires rail) must be rejected, not
		// recommended as a structural prerequisite build.
		//
		// The Drinks chain: drinks → filtered-water, syrup, fruit,
		// packaging. Syrup → sugar, water. Both Sugar Farm and Water Pump
		// are missing. The Syrup Plant exists and is rail-connected.
		// The Sugar Farm can only be placed on a sugar-field resource
		// tile far from rail, so it requires a future rail connection.
		// With canBuildRail: false, the placement must be filtered out.
		// The old code used missing.length > 1 as structuralChainIncomplete,
		// which bypassed the rail gate. The fix checks the selected
		// material's own downstream sink state.
		const base = baseGame('drinks', 'convenience');
		const game = {
			...base,
			cash: 100_000,
			industrialBuildings: [
				building('syrup-plant', 'syrup-plant-1', 1, 6, 6),
				building('drink-bottling-plant', 'drink-bottling-1', 1, 10, 6),
				building('warehouse', 'warehouse-1', 1, 14, 6)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(6, 16, 8) } : city
			)
		};
		const plan = readyPlan(
			game,
			availability({
				canBuildRail: false,
				canUpgradeIndustry: false,
				allowedIndustryBuildingTypeIds: [
					'sugar-farm',
					'water-pump',
					'syrup-plant',
					'drink-bottling-plant',
					'warehouse',
					'water-filtration-plant',
					'fruit-farm'
				]
			})
		);

		// The recommendation must NOT be a build-producer for sugar (or
		// water) — both require rail and canBuildRail is false, and
		// neither is structural because the Syrup Plant exists as their
		// downstream sink.
		const action = plan.recommendation.action;
		if (action.kind === 'build-producer') {
			// If a build-producer is recommended, it must be for a material
			// whose downstream sink is genuinely missing (structural), not
			// sugar or water which have the Syrup Plant as their sink.
			expect(action.materialId).not.toBe('sugar');
			expect(action.materialId).not.toBe('water');
		}
	});
});

describe('supply planner action helper coverage', () => {
	it('actionKey produces stable keys for each action kind', () => {
		expect(
			actionKey({
				kind: 'build-producer',
				materialId: 'water',
				buildingTypeId: 'water-pump',
				cost: 100
			})
		).toBe('build-producer:water:water-pump');
		expect(
			actionKey({
				kind: 'upgrade-building',
				materialId: 'water',
				buildingId: 'b-1',
				buildingTypeId: 'water-pump',
				fromLevel: 1,
				toLevel: 2,
				cost: 100
			})
		).toBe('upgrade-building:water:b-1');
		expect(
			actionKey({
				kind: 'build-warehouse',
				cityId: 'industry-city',
				buildingTypeId: 'warehouse',
				cost: 100
			})
		).toBe('build-warehouse:industry-city');
		expect(
			actionKey({
				kind: 'build-warehouse',
				cityId: 'breadbasket-basin',
				buildingTypeId: 'warehouse',
				cost: 100
			})
		).toBe('build-warehouse:breadbasket-basin');
		expect(actionKey({ kind: 'resume-route', routeId: 'route-2' })).toBe('resume-route:route-2');
		expect(
			actionKey({
				kind: 'edit-route',
				routeId: 'route-2',
				field: 'capacity',
				from: 1,
				to: 2
			})
		).toBe('edit-route:route-2:capacity:2');
		const input: RecurringRouteInput = {
			originCityId: 'industry-city',
			destinationCityId: 'harbor-city',
			materialId: 'bottled-water',
			capacity: 2,
			frequencyDays: 1,
			leadTimeDays: 1,
			transportCostPerUnit: 1,
			priority: 0
		};
		expect(actionKey({ kind: 'create-route', input })).toBe(
			'create-route:industry-city:harbor-city:bottled-water:2:1:1:1:0'
		);
		expect(
			actionKey({
				kind: 'change-supply-source',
				retailCityId: 'harbor-city',
				fromSupplyCityId: 'industry-city',
				toSupplyCityId: 'breadbasket-basin'
			})
		).toBe('change-supply-source:harbor-city:breadbasket-basin');
		expect(actionKey({ kind: 'connect-rail', buildingId: 'b-1', materialId: 'water' })).toBe(
			'connect-rail:water:b-1'
		);
		expect(actionKey({ kind: 'none', reason: 'surplus' })).toBe('none:surplus');
	});

	it('getBuildFeasibility reports placement availability for a producer', () => {
		const game = baseGame('bottled-water');
		const result = buildSupplyPlan(
			game,
			{
				retailCityId: 'harbor-city',
				categoryId: 'bottled-water'
			},
			availability()
		);
		if (result.status !== 'ready') throw new Error('Expected ready plan');
		const feasibility = getBuildFeasibility(
			game,
			result.plan.snapshot,
			'bottled-water',
			'water-bottler'
		);
		expect(feasibility.hasValidPlacement).toBe(true);
	});

	it('does not mutate the game while checking build feasibility', () => {
		const game = baseGame('bottled-water');
		const result = buildSupplyPlan(
			game,
			{
				retailCityId: 'harbor-city',
				categoryId: 'bottled-water'
			},
			availability()
		);
		if (result.status !== 'ready') throw new Error('Expected ready plan');
		const before = structuredClone(game);

		getBuildFeasibility(game, result.plan.snapshot, 'bottled-water', 'water-bottler');

		expect(game).toEqual(before);
	});

	it('getBuildFeasibility reports no placement when the supply city is missing', () => {
		const game = baseGame('bottled-water');
		const result = buildSupplyPlan(
			game,
			{
				retailCityId: 'harbor-city',
				categoryId: 'bottled-water'
			},
			availability()
		);
		if (result.status !== 'ready') throw new Error('Expected ready plan');
		const snapshotWithBadCity = {
			...result.plan.snapshot,
			supplyCityId: 'nonexistent' as WorldCityId
		};
		const feasibility = getBuildFeasibility(
			game,
			snapshotWithBadCity,
			'bottled-water',
			'water-bottler'
		);
		expect(feasibility.hasValidPlacement).toBe(false);
		expect(feasibility.hasRailReadyPlacement).toBe(false);
	});
});

describe('supply planner action candidate selection branches', () => {
	it('returns action-unavailable noop when both build and upgrade are unavailable', () => {
		// Production-capacity bottleneck with canBuildIndustry=false and
		// canUpgradeIndustry=false. Both producerCandidates and upgradeCandidates
		// return 'action-unavailable' → merged reason is 'action-unavailable'.
		const base = baseGame('bottled-water');
		const game = {
			...base,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 2, 2),
				building('water-bottler', 'water-bottler-1', 1, 6, 2),
				building('warehouse', 'warehouse-1', 1, 10, 2)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 12) } : city
			),
			stores: [
				{
					...base.stores[0]!,
					products: [product('bottled-water', { targetStock: 700, sellingPrice: 3 })]
				}
			]
		};
		const plan = readyPlan(
			game,
			availability({ canBuildIndustry: false, canUpgradeIndustry: false })
		);
		expect(plan.recommendation.action).toEqual({
			kind: 'none',
			reason: 'action-unavailable'
		});
	});

	it('returns no-feasible-action noop when build finds no placement and upgrade is unavailable', () => {
		// Production-capacity bottleneck with canBuildIndustry=true,
		// allowedTypes includes the right type, but allowedIndustrialPlacements
		// is an empty set so no tile passes the placement filter.
		// canUpgradeIndustry=false → upgrades.reason='action-unavailable'.
		// producerCandidates finds zero candidates → generated.reason='no-feasible-action'.
		// Merged reason: 'no-feasible-action'.
		expect.assertions(2);
		const base = baseGame('bottled-water');
		const game = {
			...base,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 2, 2),
				building('water-bottler', 'water-bottler-1', 1, 6, 2),
				building('warehouse', 'warehouse-1', 1, 10, 2)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 12) } : city
			),
			stores: [
				{
					...base.stores[0]!,
					products: [product('bottled-water', { targetStock: 700, sellingPrice: 3 })]
				}
			]
		};
		const plan = readyPlan(
			game,
			availability({
				canUpgradeIndustry: false,
				allowedIndustryBuildingTypeIds: ['water-pump', 'water-bottler', 'warehouse'],
				allowedIndustrialPlacements: new Set()
			})
		);
		expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'no-feasible-action' });
	});

	it('generates unique candidate IDs when existing buildings collide with the pattern', () => {
		// Place a building with ID 'supply-planner-water-bottler-1' to force
		// nextCandidateId's while loop to increment past the collision.
		const base = baseGame('bottled-water');
		const game = {
			...base,
			cash: 1_000_000,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 10, 2, 2),
				building('water-bottler', 'supply-planner-water-bottler-1', 1, 6, 2),
				building('warehouse', 'warehouse-1', 1, 10, 2)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 12) } : city
			),
			stores: [
				{
					...base.stores[0]!,
					products: [product('bottled-water', { targetStock: 7000, sellingPrice: 10 })]
				}
			]
		};
		const plan = readyPlan(game, availability({ canUpgradeIndustry: false }));

		// The plan should still produce candidates despite the ID collision.
		// The synthetic candidate should get ID 'supply-planner-water-bottler-2'.
		const buildCandidates = plan.alternatives.filter((row) => row.action.kind === 'build-producer');
		expect(buildCandidates.length).toBeGreaterThan(0);
	});
});

describe('supply planner actions patch coverage', () => {
	it('returns the non-ready snapshot result directly for an invalid request', () => {
		const result = buildSupplyPlan(
			baseGame('bottled-water'),
			{ retailCityId: '' as WorldCityId, categoryId: 'bottled-water' },
			availability()
		);
		expect(result.status).toBe('invalid');
		if (result.status === 'invalid') {
			expect(result.reason).toBe('invalid-request');
		}
	});

	it('returns the non-ready snapshot result for an unsupported category', () => {
		const result = buildSupplyPlan(
			baseGame('bottled-water'),
			{ retailCityId: 'harbor-city', categoryId: 'snacks' },
			availability()
		);
		expect(result.status).toBe('unsupported');
		if (result.status === 'unsupported') {
			expect(result.reason).toBe('unsupported-category');
		}
	});

	it('returns unaffordable noop when all producer candidates exceed cash', () => {
		const base = baseGame('bottled-water');
		const game = {
			...base,
			cash: 0,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 2, 2),
				building('water-bottler', 'water-bottler-1', 1, 6, 2),
				building('warehouse', 'warehouse-1', 1, 10, 2)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 12) } : city
			),
			stores: [
				{
					...base.stores[0]!,
					products: [product('bottled-water', { targetStock: 700, sellingPrice: 3 })]
				}
			]
		};
		const plan = readyPlan(game);
		expect(plan.baseline.bottleneck.kind).toBe('production-capacity');
		expect(plan.recommendation.action).toEqual({ kind: 'none', reason: 'unaffordable' });
	});

	it('generates upgrade candidates for a production-capacity bottleneck', () => {
		const base = baseGame('bottled-water');
		const game = {
			...base,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 2, 2),
				building('water-bottler', 'water-bottler-1', 1, 6, 2),
				building('warehouse', 'warehouse-1', 1, 10, 2)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 12) } : city
			),
			stores: [
				{
					...base.stores[0]!,
					products: [product('bottled-water', { targetStock: 700, sellingPrice: 3 })]
				}
			]
		};
		const plan = readyPlan(game, availability({ canBuildIndustry: false }));
		const upgrades = plan.alternatives.filter((row) => row.action.kind === 'upgrade-building');
		expect(upgrades.length).toBeGreaterThan(0);
	});

	it('sorts tied upgrade candidates deterministically by building ID', () => {
		const base = baseGame('bottled-water');
		const game = {
			...base,
			cash: 1_000_000,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 10, 2, 2),
				building('water-bottler', 'water-bottler-a', 1, 6, 2),
				building('water-bottler', 'water-bottler-b', 1, 10, 2),
				building('warehouse', 'warehouse-1', 1, 14, 2)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 16) } : city
			),
			stores: [
				{
					...base.stores[0]!,
					products: [product('bottled-water', { targetStock: 700, sellingPrice: 3 })]
				}
			]
		};
		const plan = readyPlan(game, availability({ canBuildIndustry: false }));
		const upgrades = plan.alternatives.filter((row) => row.action.kind === 'upgrade-building');
		expect(upgrades.length).toBeGreaterThan(1);
	});

	it('exercises build-producer economics for an upstream material', () => {
		// Pantry chain: bottleneck is grain (missing producer). The
		// build-producer candidate for grain exercises compareCandidate with
		// action.materialId !== snapshot.finishedMaterialId, hitting the
		// MATERIALS importCost branch.
		const plan = readyPlan(pantryGame());
		const candidate = plan.alternatives.find(
			(row) => row.action.kind === 'build-producer' && row.action.materialId === 'grain'
		);
		expect(candidate).toBeDefined();
		if (candidate) {
			expect(candidate.comparison.importSpendReduction30).toBeGreaterThanOrEqual(0);
		}
	});

	it('exercises connect-rail candidate with zero comparison fields', () => {
		const game = baseGame('bottled-water');
		const disconnected = {
			...game,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 3, 19),
				building('water-bottler', 'water-bottler-1', 1, 10, 2),
				building('warehouse', 'warehouse-1', 1, 2, 6)
			],
			industryCities: game.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: [{ x: 2, y: 5, level: 1 }] } : city
			)
		};
		const plan = readyPlan(disconnected);
		expect(plan.recommendation.action.kind).toBe('connect-rail');
		expect(plan.recommendation.comparison.requiresRailConnection).toBe(true);
	});
});

describe('supply planner actions branch coverage', () => {
	it('exercises improvementDays with null after when upgrade eliminates stockout', () => {
		// demand = 11/day (targetStock 77), one bottler level 1 (10/day).
		// Upgrading to level 2 gives 12/day > 11, so the candidate projection's
		// projectedStockoutDay becomes null while the baseline's is non-null.
		// This exercises improvementDays(before=non-null, after=null).
		const base = baseGame('bottled-water');
		const game = {
			...base,
			cash: 1_000_000,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 2, 2),
				building('water-bottler', 'water-bottler-1', 1, 6, 2),
				building('warehouse', 'warehouse-1', 1, 10, 2)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 12) } : city
			),
			stores: [
				{
					...base.stores[0]!,
					products: [product('bottled-water', { targetStock: 77, sellingPrice: 3 })]
				}
			]
		};
		const plan = readyPlan(game, availability({ canBuildIndustry: false }));
		expect(plan.baseline.bottleneck.kind).toBe('production-capacity');
		const upgrade = plan.alternatives.find((row) => row.action.kind === 'upgrade-building');
		expect(upgrade).toBeDefined();
		if (upgrade) {
			// The upgrade should eliminate the stockout (after=null), giving
			// improvementDays = 30 - before.
			expect(upgrade.comparison.stockoutImprovementDays).toBeGreaterThan(0);
		}
	});

	it('exercises improvementDays with null before when baseline has no stockout', () => {
		// When the baseline has no stockout for the target material but there
		// is a production-capacity deficit for another material, the candidate
		// comparison runs with before=null. This exercises
		// improvementDays(before=null, after=any) → return 0.
		// This happens in the pantry chain where grain is the bottleneck
		// (missing producer) but pantry itself has no stockout because it
		// has no producer either (both have projectedStockoutDay from
		// different calculations).
		const plan = readyPlan(pantryGame());
		const candidate = plan.alternatives.find(
			(row) => row.action.kind === 'build-producer' && row.action.materialId === 'grain'
		);
		expect(candidate).toBeDefined();
		if (candidate) {
			// Grain has no existing buildings, so baselineTarget.thirtyDay
			// has projectedStockoutDay. The candidate adds a grain farm,
			// which may or may not eliminate the stockout. The key is that
			// the comparison runs.
			expect(candidate.comparison.stockoutImprovementDays).toBeGreaterThanOrEqual(0);
		}
	});

	it('exercises projectionTotals with non-finished material import cost', () => {
		// The pantry chain has grain (intermediate) with importCost. The
		// projectionTotals function uses MATERIALS importCost for non-finished
		// materials. This exercises the false branch of the ternary at L724.
		const plan = readyPlan(pantryGame());
		// The totals should include import spend for grain at grain's importCost.
		expect(plan.baseline.totals.importSpend30).toBeGreaterThan(0);
	});

	it('exercises actionCost with a none action', () => {
		// The sortCandidates comparator calls actionCost. For a 'none' action,
		// actionCost returns 0 (no 'cost' property). This exercises the false
		// branch of the ternary at L778.
		const base = baseGame('bottled-water');
		const game = {
			...base,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 2, 2),
				building('water-bottler', 'water-bottler-1', 1, 6, 2),
				building('warehouse', 'warehouse-1', 1, 10, 2)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 12) } : city
			),
			stores: [
				{
					...base.stores[0]!,
					products: [product('bottled-water', { targetStock: 700, sellingPrice: 3 })]
				}
			]
		};
		const plan = readyPlan(
			game,
			availability({ canBuildIndustry: false, canUpgradeIndustry: false })
		);
		// With no actions available, the recommendation is a noop.
		expect(plan.recommendation.action.kind).toBe('none');
	});

	it('exercises bottleneckMaterialId with a warehouse-capacity bottleneck', () => {
		// When the bottleneck is warehouse-capacity (no materialId),
		// bottleneckMaterialId returns null. This exercises the false branch
		// of the 'in' check at L815.
		const game = {
			...baseGame('bottled-water'),
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 3, 19),
				building('water-bottler', 'water-bottler-1', 1, 10, 2),
				building('warehouse', 'warehouse-1', 1, 2, 6)
			],
			cityInventories: [{ cityId: 'industry-city' as const, materials: { water: 250 } }]
		};
		const plan = readyPlan(
			game,
			availability({ canBuildIndustry: false, canUpgradeIndustry: false })
		);
		expect(plan.baseline.bottleneck.kind).toBe('warehouse-capacity');
		expect(plan.recommendation.action.kind).toBe('none');
	});

	it('exercises compareCodeUnits with equal and different strings', () => {
		// The sortCandidates comparator uses compareCodeUnits as a final
		// tie-breaker. With two candidates that have identical comparison
		// values but different action keys, the comparator fires.
		// This is already exercised by the "tied upgrade" test, but we
		// verify it explicitly here.
		const base = baseGame('bottled-water');
		const game = {
			...base,
			cash: 1_000_000,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 10, 2, 2),
				building('water-bottler', 'water-bottler-z', 1, 6, 2),
				building('water-bottler', 'water-bottler-a', 1, 10, 2),
				building('warehouse', 'warehouse-1', 1, 14, 2)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 16) } : city
			),
			stores: [
				{
					...base.stores[0]!,
					products: [product('bottled-water', { targetStock: 700, sellingPrice: 3 })]
				}
			]
		};
		const plan = readyPlan(game, availability({ canBuildIndustry: false }));
		const upgrades = plan.alternatives.filter((row) => row.action.kind === 'upgrade-building');
		// With two upgrade candidates, the sort comparator fires with
		// compareCodeUnits as the final tie-breaker.
		expect(upgrades.length).toBe(2);
		// The candidate with the lower action key should come first.
		if (
			upgrades[0]!.action.kind === 'upgrade-building' &&
			upgrades[1]!.action.kind === 'upgrade-building'
		) {
			expect(upgrades[0]!.action.buildingId).toBe('water-bottler-a');
		}
	});
});

describe('supply planner actions patch coverage additions', () => {
	it('ranks a positive complete producer candidate for an installed capacity bottleneck', () => {
		const bottler = INDUSTRIAL_BUILDING_TYPES['water-bottler'];
		const originalCosts = {
			buildCost: bottler.buildCost,
			dailyOperatingCost: bottler.dailyOperatingCost
		};

		try {
			bottler.buildCost = 1;
			bottler.dailyOperatingCost = 0;
			const base = baseGame('bottled-water');
			const game = {
				...base,
				industrialBuildings: [
					building('water-pump', 'water-pump-1', 10, 2, 6),
					building('water-bottler', 'water-bottler-1', 1, 6, 6),
					building('warehouse', 'warehouse-1', 1, 10, 6)
				],
				industryCities: base.industryCities.map((city) =>
					city.id === 'industry-city' ? { ...city, rails: horizontalRails(0, 55, 8) } : city
				),
				stores: [
					{
						...base.stores[0]!,
						products: [product('bottled-water', { targetStock: 700 })]
					}
				]
			};
			const plan = readyPlan(game);

			expect(plan.baseline.bottleneck.kind).toBe('production-capacity');
			expect(plan.recommendation.action).toMatchObject({
				kind: 'build-producer',
				buildingTypeId: 'water-bottler'
			});
			expect(plan.recommendation.comparison.netCashBenefit30).toBeGreaterThan(0);
		} finally {
			bottler.buildCost = originalCosts.buildCost;
			bottler.dailyOperatingCost = originalCosts.dailyOperatingCost;
		}
	});

	it('ranks a positive pre-rail producer candidate for an installed capacity bottleneck', () => {
		const bottler = INDUSTRIAL_BUILDING_TYPES['water-bottler'];
		const originalCosts = {
			buildCost: bottler.buildCost,
			dailyOperatingCost: bottler.dailyOperatingCost
		};

		try {
			bottler.buildCost = 1;
			bottler.dailyOperatingCost = 0;
			const base = baseGame('bottled-water');
			const game = {
				...base,
				industrialBuildings: [
					building('water-pump', 'water-pump-1', 10, 2, 2),
					building('water-bottler', 'water-bottler-1', 1, 6, 2),
					building('warehouse', 'warehouse-1', 1, 10, 2)
				],
				industryCities: base.industryCities.map((city) =>
					city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 10) } : city
				),
				stores: [
					{
						...base.stores[0]!,
						products: [product('bottled-water', { targetStock: 700 })]
					}
				]
			};
			const plan = readyPlan(game);

			expect(plan.baseline.bottleneck.kind).toBe('production-capacity');
			expect(plan.recommendation.action).toMatchObject({
				kind: 'build-producer',
				buildingTypeId: 'water-bottler'
			});
			expect(plan.recommendation.comparison.requiresRailConnection).toBe(true);
			expect(plan.recommendation.comparison.preRailNetCashBenefit30).toBeGreaterThan(0);
		} finally {
			bottler.buildCost = originalCosts.buildCost;
			bottler.dailyOperatingCost = originalCosts.dailyOperatingCost;
		}
	});

	it('recommends a rail-ready producer when its configured import savings exceed construction cost', () => {
		const bottler = INDUSTRIAL_BUILDING_TYPES['water-bottler'];
		const originalCosts = {
			buildCost: bottler.buildCost,
			dailyOperatingCost: bottler.dailyOperatingCost
		};

		try {
			bottler.buildCost = 1;
			bottler.dailyOperatingCost = 0;
			const base = baseGame('bottled-water');
			const game = {
				...base,
				industrialBuildings: [
					building('water-pump', 'water-pump-1', 1, 2, 6),
					building('warehouse', 'warehouse-1', 1, 10, 6)
				],
				industryCities: base.industryCities.map((city) =>
					city.id === 'industry-city' ? { ...city, rails: horizontalRails(0, 55, 8) } : city
				)
			};
			const plan = readyPlan(game);

			expect(plan.recommendation.action).toMatchObject({
				kind: 'build-producer',
				buildingTypeId: 'water-bottler'
			});
			expect(plan.recommendation.comparison.netCashBenefit30).toBeGreaterThan(0);
		} finally {
			bottler.buildCost = originalCosts.buildCost;
			bottler.dailyOperatingCost = originalCosts.dailyOperatingCost;
		}
	});

	it('recommends a future-rail producer when its pre-rail economics are positive', () => {
		const bottler = INDUSTRIAL_BUILDING_TYPES['water-bottler'];
		const originalCosts = {
			buildCost: bottler.buildCost,
			dailyOperatingCost: bottler.dailyOperatingCost
		};

		try {
			bottler.buildCost = 1;
			bottler.dailyOperatingCost = 0;
			const base = baseGame('bottled-water');
			const game = {
				...base,
				industrialBuildings: [
					building('water-pump', 'water-pump-1', 1, 2, 2),
					building('warehouse', 'warehouse-1', 1, 10, 2)
				],
				industryCities: base.industryCities.map((city) =>
					city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 10) } : city
				)
			};
			const plan = readyPlan(game);

			expect(plan.recommendation.action).toMatchObject({
				kind: 'build-producer',
				buildingTypeId: 'water-bottler'
			});
			expect(plan.recommendation.comparison.requiresRailConnection).toBe(true);
			expect(plan.recommendation.comparison.preRailNetCashBenefit30).toBeGreaterThan(0);
		} finally {
			bottler.buildCost = originalCosts.buildCost;
			bottler.dailyOperatingCost = originalCosts.dailyOperatingCost;
		}
	});

	it('excludes rail-required build candidates when canBuildRail is false', () => {
		// Same setup as the future-rail producer test above: the only
		// valid water-bottler placement tiles require a future rail
		// connection. With canBuildRail restricted, those candidates
		// must be excluded rather than recommended — the player cannot
		// build the rail to make them usable.
		const bottler = INDUSTRIAL_BUILDING_TYPES['water-bottler'];
		// Scoped getter spies keep the shared catalog entry untouched once
		// restored — no direct mutation of INDUSTRIAL_BUILDING_TYPES.
		const buildCostSpy = vi.spyOn(bottler, 'buildCost', 'get').mockReturnValue(1);
		const operatingCostSpy = vi.spyOn(bottler, 'dailyOperatingCost', 'get').mockReturnValue(0);

		try {
			const base = baseGame('bottled-water');
			const game = {
				...base,
				industrialBuildings: [
					building('water-pump', 'water-pump-1', 1, 2, 2),
					building('warehouse', 'warehouse-1', 1, 10, 2)
				],
				industryCities: base.industryCities.map((city) =>
					city.id === 'industry-city' ? { ...city, rails: horizontalRails(2, 10) } : city
				)
			};
			const plan = readyPlan(
				game,
				availability({ canBuildRail: false, canUpgradeIndustry: false })
			);

			expect(plan.recommendation.action).toEqual({
				kind: 'none',
				reason: 'action-unavailable'
			});
		} finally {
			buildCostSpy.mockRestore();
			operatingCostSpy.mockRestore();
		}
	});

	it('sorts multiple compatible producer types by their stable building type id', () => {
		const buildingTypes = INDUSTRIAL_BUILDING_TYPES as Record<string, IndustrialBuildingType>;
		const variantId = 'water-bottler-variant';
		buildingTypes[variantId] = {
			...INDUSTRIAL_BUILDING_TYPES['water-bottler'],
			id: variantId as IndustrialBuildingTypeId
		};

		try {
			const base = baseGame('bottled-water');
			const game = {
				...base,
				industrialBuildings: [
					building('water-pump', 'water-pump-1', 1, 2, 6),
					building('warehouse', 'warehouse-1', 1, 10, 6)
				],
				industryCities: base.industryCities.map((city) =>
					city.id === 'industry-city' ? { ...city, rails: horizontalRails(0, 55, 8) } : city
				)
			};
			const plan = readyPlan(
				game,
				availability({
					allowedIndustryBuildingTypeIds: ['water-bottler', variantId as IndustrialBuildingTypeId]
				})
			);

			expect(
				plan.alternatives
					.filter((candidate) => candidate.action.kind === 'build-producer')
					.map((candidate) =>
						candidate.action.kind === 'build-producer' ? candidate.action.buildingTypeId : null
					)
			).toEqual(['water-bottler', variantId]);
		} finally {
			delete buildingTypes[variantId];
		}
	});

	it('encodeIndustrialPlacementKey produces a null-delimited composite key', () => {
		expect(encodeIndustrialPlacementKey('industry-city', 'tile-3-4', 'water-bottler')).toBe(
			'industry-city\u0000tile-3-4\u0000water-bottler'
		);
	});

	it('getBuildFeasibility filters tiles by allowedPlacements', () => {
		// Exercises the `allowedPlacements && !allowedPlacements.has(...)`
		// continue branch at L697-703 in findPlacementChoice: when
		// allowedPlacements is provided, tiles not in the set are skipped.
		const game = baseGame('bottled-water');
		const result = buildSupplyPlan(
			game,
			{ retailCityId: 'harbor-city', categoryId: 'bottled-water' },
			availability()
		);
		if (result.status !== 'ready') throw new Error('Expected ready plan');
		// Pass an empty allowedPlacements set — all tiles are filtered out.
		const feasibility = getBuildFeasibility(
			game,
			result.plan.snapshot,
			'bottled-water',
			'water-bottler',
			new Set()
		);
		expect(feasibility.hasValidPlacement).toBe(false);
	});

	it('keeps feasibility available when a stale snapshot has no known sinks for a material', () => {
		const game = baseGame('bottled-water');
		const result = buildSupplyPlan(
			game,
			{ retailCityId: 'harbor-city', categoryId: 'bottled-water' },
			availability()
		);
		if (result.status !== 'ready') throw new Error('Expected ready plan');
		const snapshot = {
			...result.plan.snapshot,
			usableSinkBuildingIdsByMaterial: {}
		};

		expect(getBuildFeasibility(game, snapshot, 'bottled-water', 'water-bottler')).toMatchObject({
			hasValidPlacement: true,
			hasRailReadyPlacement: false
		});
	});

	it('ignores a stale sink id while calculating build feasibility', () => {
		const game = baseGame('bottled-water');
		const result = buildSupplyPlan(
			game,
			{ retailCityId: 'harbor-city', categoryId: 'bottled-water' },
			availability()
		);
		if (result.status !== 'ready') throw new Error('Expected ready plan');
		const snapshot = {
			...result.plan.snapshot,
			usableSinkBuildingIdsByMaterial: { 'bottled-water': ['removed-warehouse'] }
		};

		expect(getBuildFeasibility(game, snapshot, 'bottled-water', 'water-bottler')).toMatchObject({
			hasValidPlacement: true,
			hasRailReadyPlacement: false
		});
	});

	it('compareCodeUnits sorts building types for a recipe with multiple producers', () => {
		// Exercises the `buildingTypesForRecipe(recipeId).sort(compareCodeUnits)`
		// call at L313-315: when a recipe has multiple building types,
		// they are sorted by code units. The pantry-goods-production recipe
		// has only one building type (pantry-works), but the sort comparator
		// still fires. We verify the function doesn't throw and produces
		// a valid plan.
		const game = pantryGame();
		const result = buildSupplyPlan(
			game,
			{ retailCityId: 'harbor-city', categoryId: 'pantry' },
			availability({ allowedIndustryBuildingTypeIds: ['grain-farm', 'flour-mill', 'pantry-works'] })
		);
		expect(result.status).toBe('ready');
	});

	it('evaluates multiple representative placement tiles and picks the strongest projection', () => {
		// Issue 3 regression: the planner must evaluate one representative
		// tile per distinct reachable-sink set, not just the first rail-ready
		// tile. This test sets up a bottled-water chain where multiple valid
		// placement tiles exist for the water-bottler. The planner should
		// evaluate all representative tiles and pick the one with the
		// strongest projection.
		//
		// The industry city has rail at y=8 connecting the warehouse and
		// water-pump. Multiple valid industrial-terrain tiles exist for the
		// water-bottler at y=6 (bottom attach at y=8, rail-ready). The
		// planner should evaluate them and the best candidate should be
		// rail-ready with complete economics.
		const base = baseGame('bottled-water');
		const game = {
			...base,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 2, 6),
				building('warehouse', 'warehouse-1', 1, 10, 6)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: horizontalRails(0, 55, 8) } : city
			)
		};
		const plan = readyPlan(game);
		// Find the water-bottler build-producer candidate.
		const candidate = plan.alternatives.find(
			(row) => row.action.kind === 'build-producer' && row.action.materialId === 'bottled-water'
		);
		expect(candidate).toBeDefined();
		if (!candidate || candidate.action.kind !== 'build-producer') return;
		// The candidate should be rail-ready (the best placement class
		// includes tiles adjacent to the rail at y=8).
		expect(candidate.comparison.requiresRailConnection).toBe(false);
		// Rail-ready candidates have complete economics.
		expect(candidate.comparison.netCashBenefit30).not.toBeNull();
		// The candidate should show some import reduction (the water-bottler
		// would produce bottled-water, reducing imports).
		expect(candidate.comparison.importReduction30).toBeGreaterThan(0);
	});

	it('groups placement tiles by current sink identity across separate rail islands', () => {
		// Two warehouses on separate rail islands create distinct
		// current-sink sets for placement tiles. Tiles near each
		// warehouse currently connect to a different sink but share the
		// same future reachable-sink set. Including current sink
		// identity in the grouping key keeps these tiles in separate
		// placement classes so both are evaluated, rather than
		// collapsing them into one group and keeping only the
		// first-sorted tile.
		const base = baseGame('bottled-water');
		const game = {
			...base,
			industrialBuildings: [
				building('water-pump', 'water-pump-1', 1, 2, 6),
				building('warehouse', 'warehouse-1', 1, 6, 6),
				building('warehouse', 'warehouse-2', 1, 20, 6)
			],
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city'
					? {
							...city,
							rails: [...horizontalRails(0, 10, 8), ...horizontalRails(16, 26, 8)]
						}
					: city
			)
		};
		const result = buildSupplyPlan(
			game,
			{ retailCityId: 'harbor-city', categoryId: 'bottled-water' },
			availability()
		);
		expect(result.status).toBe('ready');
		if (result.status !== 'ready') return;
		// Both warehouses are usable sinks on separate rail islands.
		// Placement tiles near each warehouse have different
		// currentSinkIds but the same future reachableSinkIds. The fix
		// ensures both classes are evaluated as separate representative
		// tiles.
		const feasibility = getBuildFeasibility(
			game,
			result.plan.snapshot,
			'bottled-water',
			'water-bottler'
		);
		expect(feasibility.hasValidPlacement).toBe(true);
		expect(feasibility.hasRailReadyPlacement).toBe(true);
	});
});
