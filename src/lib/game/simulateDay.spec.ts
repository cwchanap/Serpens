import { describe, expect, test, vi } from 'vitest';
import { ARCHETYPES } from './archetypes';
import { EVENT_DRAW_COUNT_PER_DAY } from './eventSelection';
import { appendFinanceTransaction, getTotalDebt } from './finance';
import { buildIndustrialBuilding } from './industryPlacement';
import { dispatchManualTransfer, processRecurringRouteDispatches } from './interCityLogistics';
import {
	createLogisticsBuilding,
	createTwoIndustryCityGame,
	withCityMaterials,
	withWarehouses
} from './interCityLogistics.testUtils';
import { createRngFromState } from './rng';
import { createNewGame, resolveDecision, updatePolicy } from './state';
import { getStaffXpForLevel } from './staffLeveling';
import { DEFAULT_SIMULATION_RULES, type SimulationRules } from './simulationRules';
import { simulateDay } from './simulateDay';
import { createOneCityInventoryFixture, projectOneCityParity } from './cityInventory.testUtils';
import { openWorldCity } from './world';
import type {
	ActiveEventModifier,
	EventDecisionItem,
	GameState,
	RecurringRoute,
	StaffMember,
	SystemDecisionItem,
	TransferOrder
} from './types';

function advanceEventRngState(state: number): number {
	const rng = createRngFromState(state);
	for (let draw = 0; draw < EVENT_DRAW_COUNT_PER_DAY; draw += 1) rng.next();
	return rng.getState();
}

function supplierBulkDiscountDecision(day: number): EventDecisionItem {
	return {
		kind: 'event',
		id: 'event-instance-900',
		eventId: 'supplier-terms',
		definitionVersion: 2,
		generatedOnDay: day,
		expiresOnDay: day + 2,
		target: { kind: 'company' },
		copy: { key: 'events.supplierTerms', params: {} },
		options: [
			{
				id: 'bulk-discount',
				effects: [],
				modifiers: [
					{
						durationDays: 3,
						stackingKey: 'supplier-bulk-discount:retail-product',
						stackingRule: 'replace',
						effect: {
							kind: 'import-cost-multiplier',
							scope: 'retail-product',
							target: { kind: 'all' },
							multiplier: 0.9
						},
						explanation: {
							key: 'events.supplierTerms.bulkDiscount.modifier',
							params: {}
						},
						importance: 'important'
					}
				]
			}
		]
	};
}

function activeImportModifier(id: string, multiplier: number, day: number): ActiveEventModifier {
	return {
		id,
		source: {
			eventId: `event-${id}`,
			instanceId: `instance-${id}`,
			optionId: `option-${id}`
		},
		target: { kind: 'company' },
		startsOnDay: day,
		expiresOnDay: day + 3,
		stackingKey: `stack-${id}`,
		stackingRule: 'replace',
		effect: {
			kind: 'import-cost-multiplier',
			scope: 'retail-product',
			target: { kind: 'all' },
			multiplier
		},
		explanation: { key: `events.${id}`, params: {} },
		importance: 'normal'
	};
}

function openTwoIndustryCityLogisticsGame(day = 7): GameState {
	return createTwoIndustryCityGame({ seed: 292_940, day, materials: false });
}

function straightRails(y: number, fromX: number, toX: number) {
	return Array.from({ length: toX - fromX + 1 }, (_, index) => ({
		x: fromX + index,
		y,
		level: 1
	}));
}

function createTransferOrder(overrides: Partial<TransferOrder> = {}): TransferOrder {
	return {
		id: 'transfer-1',
		source: { kind: 'manual' },
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		quantity: 4,
		createdOnDay: 6,
		dispatchedOnDay: 6,
		arrivalOnDay: 7,
		transportCost: 8,
		status: 'in-transit',
		...overrides
	};
}

function createDueRoute(overrides: Partial<RecurringRoute> = {}): RecurringRoute {
	return {
		id: 'route-1',
		originCityId: 'industry-city',
		destinationCityId: 'breadbasket-basin',
		materialId: 'water',
		capacity: 5,
		frequencyDays: 3,
		leadTimeDays: 2,
		transportCostPerUnit: 7,
		priority: 0,
		state: 'active',
		nextDispatchOnDay: 7,
		...overrides
	};
}

describe('daily simulation', () => {
	test('rejects invalid entity ownership before starting a daily tick', () => {
		expect.assertions(1);
		const base = createNewGame('convenience', 292_524);
		const game: GameState = {
			...base,
			stores: [{ ...base.stores[0]!, cityId: 'industry-city' }]
		};

		expect(() => simulateDay(game)).toThrow(/city ownership/i);
	});

	test('preserves one-city production, retail, report, and cash behavior', () => {
		const after = simulateDay(createOneCityInventoryFixture());

		expect(projectOneCityParity(after)).toMatchInlineSnapshot(`
			{
			  "cash": 99762,
			  "cityInventories": [
			    {
			      "cityId": "industry-city",
			      "materials": {
			        "bottled-water": 0,
			        "water": 190,
			      },
			    },
			  ],
			  "report": {
			    "importSpend": 10,
			    "netCashChange": -238,
			    "production": {
			      "cityInventories": [
			        {
			          "capacity": 200,
			          "cityId": "industry-city",
			          "overflowCost": 10,
			          "overflowUnits": 5,
			          "used": 205,
			        },
			      ],
			      "consumed": [
			        {
			          "cityId": "industry-city",
			          "materialId": "water",
			          "quantity": 10,
			          "source": "rail",
			          "value": 10,
			        },
			      ],
			      "importSpend": 0,
			      "importedInputs": [],
			      "operatingCost": 19,
			      "overflowCost": 10,
			      "overflowUnits": 5,
			      "produced": [
			        {
			          "cityId": "industry-city",
			          "materialId": "water",
			          "quantity": 40,
			          "source": "local",
			          "value": 40,
			        },
			        {
			          "cityId": "industry-city",
			          "materialId": "bottled-water",
			          "quantity": 10,
			          "source": "local",
			          "value": 20,
			        },
			      ],
			      "railShipments": [
			        {
			          "cityId": "industry-city",
			          "fromId": "pump",
			          "kind": "pull-producer",
			          "materialId": "water",
			          "quantity": 10,
			          "toId": "bottler",
			          "value": 10,
			        },
			        {
			          "cityId": "industry-city",
			          "fromId": "bottler",
			          "kind": "push-warehouse",
			          "materialId": "bottled-water",
			          "quantity": 10,
			          "toId": "warehouse",
			          "value": 20,
			        },
			      ],
			      "railUsage": {
			        "industry-city:10,4": 10,
			        "industry-city:11,4": 10,
			        "industry-city:12,4": 10,
			        "industry-city:13,4": 10,
			        "industry-city:14,4": 10,
			        "industry-city:15,4": 10,
			        "industry-city:16,4": 10,
			        "industry-city:17,4": 10,
			        "industry-city:18,4": 10,
			        "industry-city:3,4": 10,
			        "industry-city:4,4": 10,
			        "industry-city:5,4": 10,
			        "industry-city:6,4": 10,
			        "industry-city:7,4": 10,
			        "industry-city:8,4": 10,
			        "industry-city:9,4": 10,
			      },
			      "shopImports": [
			        {
			          "cityId": "harbor-city",
			          "materialId": "bottled-water",
			          "quantity": 5,
			          "source": "import",
			          "value": 10,
			        },
			      ],
			      "warehouseCapacity": 200,
			      "warehousePulls": [
			        {
			          "cityId": "industry-city",
			          "materialId": "bottled-water",
			          "quantity": 15,
			          "source": "warehouse",
			          "value": 30,
			        },
			      ],
			      "warehouseUsed": 205,
			    },
			  },
			  "stores": [
			    {
			      "id": "store-1",
			      "products": [
			        {
			          "categoryId": "bottled-water",
			          "stock": 20,
			        },
			      ],
			    },
			  ],
			}
		`);
	});

	test('makes due transfer arrivals available to same-day industry production', () => {
		const closingDay = 7;
		const base = openTwoIndustryCityLogisticsGame(closingDay);
		const game: GameState = {
			...base,
			industryCities: base.industryCities.map((city) =>
				city.id === 'industry-city' ? { ...city, rails: straightRails(2, 2, 10) } : city
			),
			industrialBuildings: [
				createLogisticsBuilding('mill', 'flour-mill', 'industry-city', 2),
				createLogisticsBuilding('warehouse-industry-city', 'warehouse', 'industry-city', 10)
			],
			logistics: {
				...base.logistics,
				transferOrders: [
					createTransferOrder({
						originCityId: 'breadbasket-basin',
						destinationCityId: 'industry-city',
						materialId: 'grain',
						quantity: 10,
						arrivalOnDay: closingDay
					})
				]
			}
		};

		const result = simulateDay(game);
		const report = result.reports.at(-1)!;

		expect(report.logistics.arrivals).toEqual([
			{
				transferOrderId: 'transfer-1',
				originCityId: 'breadbasket-basin',
				destinationCityId: 'industry-city',
				materialId: 'grain',
				quantity: 10
			}
		]);
		expect(report.logistics.deliveredUnits).toBe(10);
		expect(report.productionReport.warehousePulls).toContainEqual({
			cityId: 'industry-city',
			materialId: 'grain',
			quantity: 1,
			value: 1,
			source: 'warehouse'
		});
		expect(report.productionReport.importedInputs).toContainEqual({
			cityId: 'industry-city',
			materialId: 'grain',
			quantity: 9,
			value: 18,
			source: 'import'
		});
		expect(result.logistics.transferOrders[0]?.status).toBe('delivered');
	});

	test('lets weekly replenishment consume origin stock before a due route dispatch', () => {
		const base = withCityMaterials(
			withWarehouses(openTwoIndustryCityLogisticsGame(), ['industry-city', 'breadbasket-basin'], {
				mapXOffset: 10,
				mapY: 2
			}),
			'industry-city',
			{ 'bottled-water': 10 }
		);
		const game: GameState = {
			...base,
			stores: [
				{
					...base.stores[0]!,
					products: [
						{
							categoryId: 'bottled-water',
							stock: 0,
							reorderThreshold: 1,
							targetStock: 10,
							sellingPrice: 3
						}
					]
				}
			],
			logistics: {
				...base.logistics,
				recurringRoutes: [
					createDueRoute({ materialId: 'bottled-water', capacity: 10, transportCostPerUnit: 3 })
				]
			}
		};

		const result = simulateDay(game);
		const report = result.reports.at(-1)!;
		const attempt = report.logistics.routeDispatchAttempts[0]!;

		expect(report.storeReports[0]?.productReports[0]).toMatchObject({
			warehouseUnits: 10,
			importedUnits: 0
		});
		expect(attempt).toMatchObject({
			destinationNeed: 200,
			availableOriginStock: 0,
			dispatchedQuantity: 0,
			unusedCapacity: 10,
			unmetDestinationNeed: 200,
			transportCost: 0,
			transferOrderId: null
		});
		expect(
			result.cityInventories.find((inventory) => inventory.cityId === 'industry-city')?.materials[
				'bottled-water'
			]
		).toBe(0);
	});

	test('reports an empty logistics day explicitly', () => {
		const report = simulateDay(createNewGame('convenience', 292_941)).reports.at(-1)!;

		expect(report.logistics).toEqual({
			arrivals: [],
			routeDispatchAttempts: [],
			deliveredUnits: 0,
			scheduledTransportCost: 0,
			modifierRecoveries: []
		});
	});

	test('reports a full route destination as an explicit no-need zero attempt', () => {
		const base = withCityMaterials(
			withWarehouses(openTwoIndustryCityLogisticsGame(), ['industry-city', 'breadbasket-basin'], {
				mapXOffset: 10,
				mapY: 2
			}),
			'breadbasket-basin',
			{ water: 200 }
		);
		const result = simulateDay({
			...withCityMaterials(base, 'industry-city', { water: 5 }),
			logistics: { ...base.logistics, recurringRoutes: [createDueRoute()] }
		});
		const attempt = result.reports.at(-1)!.logistics.routeDispatchAttempts[0]!;

		expect(attempt).toMatchObject({
			destinationNeed: 0,
			dispatchedQuantity: 0,
			unmetDestinationNeed: 0,
			transportCost: 0,
			transferOrderId: null
		});
	});

	test('keeps route scheduling cash-free until daily accounting applies its cost exactly once', () => {
		const base = withCityMaterials(
			withCityMaterials(
				withWarehouses(openTwoIndustryCityLogisticsGame(), ['industry-city', 'breadbasket-basin'], {
					mapXOffset: 10,
					mapY: 2
				}),
				'industry-city',
				{ water: 5 }
			),
			'breadbasket-basin',
			{ grain: 1 }
		);
		const withRoute = {
			...base,
			logistics: { ...base.logistics, recurringRoutes: [createDueRoute()] }
		};
		const manual = dispatchManualTransfer(withRoute, {
			originCityId: 'breadbasket-basin',
			destinationCityId: 'industry-city',
			materialId: 'grain',
			quantity: 1
		});
		if (!manual.ok) throw new Error(`Expected manual transfer, received ${manual.reason}`);

		const scheduled = processRecurringRouteDispatches(manual.game);
		const result = simulateDay(manual.game);
		const report = result.reports.at(-1)!;
		const sumAttemptCosts = report.logistics.routeDispatchAttempts.reduce(
			(total, attempt) => total + attempt.transportCost,
			0
		);
		const baseOperatingCosts =
			report.storeReports.reduce((total, storeReport) => total + storeReport.operatingCosts, 0) +
			report.payrollCost +
			report.productionReport.operatingCost +
			report.productionReport.overflowCost;
		const baseOperatingCashFlow = Math.round(
			report.revenue - baseOperatingCosts - report.importSpend
		);
		const preFinanceCash = report.cashAfter - report.financingCashFlow;

		expect(scheduled.game.cash).toBe(manual.game.cash);
		expect(report.logistics.scheduledTransportCost).toBe(sumAttemptCosts);
		expect(report.logistics.scheduledTransportCost).toBe(35);
		expect(report.logistics.scheduledTransportCost).not.toBe(35 + manual.order.transportCost);
		expect(report.logistics.routeDispatchAttempts).toContainEqual(
			expect.objectContaining({
				destinationNeed: 200,
				dispatchedQuantity: 5,
				unmetDestinationNeed: 195
			})
		);
		expect(report.operatingCosts).toBe(baseOperatingCosts + sumAttemptCosts);
		expect(report.operatingCashFlow).toBe(baseOperatingCashFlow - sumAttemptCosts);
		expect(preFinanceCash).toBe(manual.game.cash + report.operatingCashFlow);
		expect(report.cashAfter).toBe(report.cashBefore + report.netCashChange);
	});

	test('applies an active route capacity modifier to a live dispatch with baseline/effective evidence', () => {
		const base = withCityMaterials(
			withWarehouses(openTwoIndustryCityLogisticsGame(), ['industry-city', 'breadbasket-basin'], {
				mapXOffset: 10,
				mapY: 2
			}),
			'industry-city',
			{ water: 100 }
		);
		const capacityModifier: ActiveEventModifier = {
			id: 'event-modifier-1',
			source: {
				eventId: 'freight-disruption',
				instanceId: 'event-instance-1',
				optionId: 'accept-delay'
			},
			target: { kind: 'recurring-route', routeId: 'route-1' },
			startsOnDay: 7,
			expiresOnDay: 10,
			stackingKey: 'freight-capacity:route-1',
			stackingRule: 'replace',
			effect: { kind: 'route-capacity-multiplier', multiplier: 0.75 },
			explanation: { key: 'events.freightDisruption.acceptDelay.capacity', params: {} },
			importance: 'normal'
		};
		const result = simulateDay({
			...base,
			events: { ...base.events, activeModifiers: [capacityModifier] },
			logistics: {
				...base.logistics,
				recurringRoutes: [createDueRoute({ capacity: 100, transportCostPerUnit: 2 })]
			}
		});
		const attempt = result.reports.at(-1)!.logistics.routeDispatchAttempts[0]!;

		expect(attempt).toMatchObject({
			capacity: 75,
			baselineCapacity: 100,
			dispatchedQuantity: 75,
			unusedCapacity: 0,
			unmetDestinationNeed: 125,
			transportCost: 150,
			transferOrderId: 'transfer-1'
		});
		expect(attempt.modifierImpacts).toContainEqual(
			expect.objectContaining({
				effectKind: 'route-capacity-multiplier',
				baselineCapacity: 100,
				effectiveCapacity: 75,
				baselineDispatchedQuantity: 100,
				effectiveDispatchedQuantity: 75
			})
		);
		expect(
			result.logistics.transferOrders.find((order) => order.source.kind === 'recurring-route')
		).toMatchObject({ quantity: 75, arrivalOnDay: 9, transportCost: 150 });
	});

	test('suspends a due route dispatch without creating an order while advancing cadence', () => {
		const base = withCityMaterials(
			withWarehouses(openTwoIndustryCityLogisticsGame(), ['industry-city', 'breadbasket-basin'], {
				mapXOffset: 10,
				mapY: 2
			}),
			'industry-city',
			{ water: 100 }
		);
		const suspensionModifier: ActiveEventModifier = {
			id: 'event-modifier-1',
			source: {
				eventId: 'freight-disruption',
				instanceId: 'event-instance-1',
				optionId: 'suspend-shipments'
			},
			target: { kind: 'recurring-route', routeId: 'route-1' },
			startsOnDay: 7,
			expiresOnDay: 10,
			stackingKey: 'freight-suspension:route-1',
			stackingRule: 'replace',
			effect: { kind: 'route-dispatch-suspension' },
			explanation: { key: 'events.freightDisruption.suspendShipments.suspension', params: {} },
			importance: 'important'
		};
		const result = simulateDay({
			...base,
			events: { ...base.events, activeModifiers: [suspensionModifier] },
			logistics: {
				...base.logistics,
				recurringRoutes: [createDueRoute({ capacity: 100, transportCostPerUnit: 2 })]
			}
		});
		const report = result.reports.at(-1)!;
		const attempt = report.logistics.routeDispatchAttempts[0]!;

		expect(attempt).toMatchObject({
			capacity: 100,
			baselineCapacity: 100,
			dispatchedQuantity: 0,
			unusedCapacity: 100,
			unmetDestinationNeed: 200,
			transportCost: 0,
			transferOrderId: null,
			dispatchSuspended: true
		});
		expect(attempt.modifierImpacts).toContainEqual(
			expect.objectContaining({
				effectKind: 'route-dispatch-suspension',
				baselineDispatchedQuantity: 100,
				effectiveDispatchedQuantity: 0
			})
		);
		expect(report.logistics.scheduledTransportCost).toBe(0);
		expect(result.logistics.transferOrders).toHaveLength(0);
		expect(result.logistics.recurringRoutes[0]?.nextDispatchOnDay).toBe(10);
	});

	test('charges only production-close overflow after a transfer arrival', () => {
		const startingCash = 50_000;
		const base = openTwoIndustryCityLogisticsGame();
		const result = simulateDay({
			...base,
			cash: startingCash,
			logistics: {
				...base.logistics,
				transferOrders: [
					createTransferOrder({ quantity: 10, transportCost: 99, arrivalOnDay: base.day })
				]
			}
		});
		const report = result.reports.at(-1)!;
		const localOperatingCosts =
			report.storeReports.reduce((total, storeReport) => total + storeReport.operatingCosts, 0) +
			report.payrollCost +
			report.productionReport.operatingCost;

		expect(report.logistics).toMatchObject({ deliveredUnits: 10, scheduledTransportCost: 0 });
		expect(report.productionReport.overflowUnits).toBe(10);
		expect(report.productionReport.overflowCost).toBe(20);
		expect(report.operatingCosts).toBe(localOperatingCosts + report.productionReport.overflowCost);
		expect(report.operatingCashFlow).toBe(
			Math.round(report.revenue - report.operatingCosts - report.importSpend)
		);
		expect(report.cashAfter).toBe(startingCash + report.operatingCashFlow);
	});

	test('keeps omitted and explicit defaults deeply equal', () => {
		const game = createNewGame('electronics', 280_002);

		expect(simulateDay(game)).toEqual(simulateDay(game, DEFAULT_SIMULATION_RULES));
	});

	test('applies a resolved modifier through its final close, reports expiry, then selects', () => {
		expect.assertions(23);
		const closingDay = 5;
		const base = createNewGame('convenience', 280_278);
		const decision = supplierBulkDiscountDecision(closingDay);
		const prepared: GameState = {
			...base,
			day: closingDay,
			cash: -1,
			finance: {
				...base.finance,
				currentDayActivity: { ...base.finance.currentDayActivity, day: closingDay }
			},
			stores: base.stores.map((store) => ({
				...store,
				products: store.products.map((product) => ({
					...product,
					stock: 0,
					reorderThreshold: 1,
					targetStock: 10
				}))
			})),
			decisions: [decision]
		};
		const resolution = resolveDecision(prepared, decision.id, 'bulk-discount');

		expect(resolution.ok).toBe(true);
		if (!resolution.ok) throw new Error('expected supplier decision to resolve');
		expect(resolution.game.events.activeModifiers).toHaveLength(1);
		const modifier = resolution.game.events.activeModifiers[0]!;
		expect(modifier).toMatchObject({
			startsOnDay: closingDay,
			expiresOnDay: closingDay + 3,
			effect: { multiplier: 0.9 }
		});
		const pendingCashPressure: EventDecisionItem = {
			kind: 'event',
			id: 'event-instance-901',
			eventId: 'cash-pressure',
			definitionVersion: 1,
			generatedOnDay: closingDay,
			expiresOnDay: closingDay + 2,
			target: { kind: 'company' },
			copy: { key: 'events.cashPressure', params: {} },
			options: [{ id: 'hold-course', effects: [], modifiers: [] }]
		};

		let expectedEventRngState = resolution.game.events.rngState;
		let game: GameState = { ...resolution.game, decisions: [pendingCashPressure] };
		for (let offset = 0; offset < 3; offset += 1) {
			expectedEventRngState = advanceEventRngState(expectedEventRngState);
			game = simulateDay(game);
			const report = game.reports.at(-1)!;

			expect(report.day).toBe(closingDay + offset);
			expect(game.day).toBe(closingDay + offset + 1);
			expect(game.events.rngState).toBe(expectedEventRngState);
			if (offset < 2) {
				expect(game.events.activeModifiers.map((candidate) => candidate.id)).toContain(modifier.id);
				expect(report.modifierImpacts).toEqual([]);
			} else {
				expect(report.modifierImpacts).toEqual([
					{
						modifierId: modifier.id,
						source: modifier.source,
						target: { kind: 'company' },
						effectKind: 'import-cost-multiplier',
						explanation: modifier.explanation,
						scope: 'retail-product',
						affectedIds: ['bottled-water'],
						multiplier: 0.9,
						resolvedMultiplier: 0.9,
						baselineCost: 20,
						actualCost: 18,
						applicationCount: 1
					}
				]);
				expect(report.modifierLifecycle).toEqual([
					{
						status: 'expired',
						modifier: expect.objectContaining({ id: modifier.id, expiresOnDay: closingDay + 3 })
					}
				]);
				expect(game.events.activeModifiers).toEqual([]);
			}
		}

		expect(game.day).toBe(closingDay + 3);
		expect(game.decisions).toContainEqual(
			expect.objectContaining({
				kind: 'event',
				eventId: 'cash-pressure',
				generatedOnDay: closingDay + 3
			})
		);
		expect(game.reports[0]!.modifierLifecycle).toEqual([
			expect.objectContaining({
				status: 'activated',
				modifier: expect.objectContaining({ id: modifier.id })
			})
		]);
		expect(game.reports[1]!.modifierLifecycle).toEqual([]);
	});

	test('merges scenario and event rules while aggregating only deterministic event impacts', () => {
		const closingDay = 7;
		const base = createNewGame('convenience', 280_279);
		const products = [
			{
				categoryId: 'snacks',
				stock: 0,
				reorderThreshold: 1,
				targetStock: 10,
				sellingPrice: 5
			},
			{
				categoryId: 'bottled-water',
				stock: 0,
				reorderThreshold: 1,
				targetStock: 10,
				sellingPrice: 3
			}
		];
		const firstStore = { ...base.stores[0]!, products };
		const rules: SimulationRules = {
			importCostMultipliers: [
				{
					source: { kind: 'scenario', sourceId: 'scenario:test:modifier:0' },
					scope: 'retail-product',
					target: { kind: 'ids', ids: ['snacks'] },
					multiplier: 2
				}
			]
		};
		const result = simulateDay(
			{
				...base,
				day: closingDay,
				stores: [firstStore, { ...firstStore, id: 'store-2' }],
				events: {
					...base.events,
					activeModifiers: [
						activeImportModifier('modifier-b', 0.8, closingDay),
						activeImportModifier('modifier-a', 0.9, closingDay)
					]
				}
			},
			rules
		);
		const report = result.reports.at(-1)!;

		expect(report.importSpend).toBe(114);
		expect(report.modifierImpacts).toEqual([
			{
				modifierId: 'modifier-a',
				source: {
					eventId: 'event-modifier-a',
					instanceId: 'instance-modifier-a',
					optionId: 'option-modifier-a'
				},
				target: { kind: 'company' },
				effectKind: 'import-cost-multiplier',
				explanation: { key: 'events.modifier-a', params: {} },
				scope: 'retail-product',
				affectedIds: ['bottled-water', 'snacks'],
				multiplier: 0.9,
				resolvedMultiplier: 1.152,
				baselineCost: 100,
				actualCost: 114,
				applicationCount: 4
			},
			{
				modifierId: 'modifier-b',
				source: {
					eventId: 'event-modifier-b',
					instanceId: 'instance-modifier-b',
					optionId: 'option-modifier-b'
				},
				target: { kind: 'company' },
				effectKind: 'import-cost-multiplier',
				explanation: { key: 'events.modifier-b', params: {} },
				scope: 'retail-product',
				affectedIds: ['bottled-water', 'snacks'],
				multiplier: 0.8,
				resolvedMultiplier: 1.152,
				baselineCost: 100,
				actualCost: 114,
				applicationCount: 4
			}
		]);
	});

	test('sums each rounded import application instead of rounding aggregate baseline cost', () => {
		const closingDay = 7;
		const base = createNewGame('convenience', 280_280);
		const store = {
			...base.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 0,
					reorderThreshold: 1,
					targetStock: 1,
					sellingPrice: 5
				}
			]
		};
		const modifier = activeImportModifier('modifier-rounding', 0.5, closingDay);
		const result = simulateDay({
			...base,
			day: closingDay,
			stores: [store, { ...store, id: 'store-2' }],
			events: { ...base.events, activeModifiers: [modifier] }
		});

		expect(result.reports.at(-1)!.modifierImpacts).toEqual([
			{
				modifierId: modifier.id,
				source: modifier.source,
				target: { kind: 'company' },
				effectKind: 'import-cost-multiplier',
				explanation: modifier.explanation,
				scope: 'retail-product',
				affectedIds: ['snacks'],
				multiplier: 0.5,
				resolvedMultiplier: 0.5,
				baselineCost: 6,
				actualCost: 4,
				applicationCount: 2
			}
		]);
	});

	test('changes weekly retail import spend without changing sales cost or rng', () => {
		const base = createNewGame('electronics', 280_003);
		const game = {
			...base,
			day: 7,
			stores: base.stores.map((store) => ({
				...store,
				products: store.products.map((product) => ({
					...product,
					stock: 20,
					reorderThreshold: 100,
					targetStock: 100
				}))
			}))
		};
		const rules: SimulationRules = {
			importCostMultipliers: [
				{
					source: { kind: 'scenario', sourceId: 'scenario:test:modifier:0' },
					scope: 'retail-product',
					target: { kind: 'ids', ids: ['games'] },
					multiplier: 2
				}
			]
		};
		const baseline = simulateDay(game);
		const doubled = simulateDay(game, rules);
		const baselineProduct = baseline.reports[0]!.storeReports[0]!.productReports[0]!;
		const doubledProduct = doubled.reports[0]!.storeReports[0]!.productReports[0]!;

		expect(doubledProduct.importedUnits).toBe(baselineProduct.importedUnits);
		expect(doubledProduct.importSpend).toBe(baselineProduct.importSpend * 2);
		expect(doubledProduct.costOfGoods).toBe(baselineProduct.costOfGoods);
		expect(doubled.reports[0]!.costOfGoods).toBe(baseline.reports[0]!.costOfGoods);
		expect(doubled.rngState).toBe(baseline.rngState);
	});

	test('advances one day deterministically for the same seed and actions', () => {
		expect.assertions(5);
		const first = simulateDay(createNewGame('convenience', 2026));
		const second = simulateDay(createNewGame('convenience', 2026));

		expect(first.day).toBe(2);
		expect(first.cash).toBe(second.cash);
		expect(first.reports[0]?.netIncome).toBe(second.reports[0]?.netIncome);
		expect(first.rngState).toBe(second.rngState);
		expect(first.staff).toEqual(second.staff);
	});

	test('reconciles the founding loan day-8 tick and resets finance activity for day 9', () => {
		expect.assertions(14);
		let beforeClosingDay = createNewGame('grocery', 277_008);

		for (let day = 1; day < 8; day += 1) {
			beforeClosingDay = simulateDay(beforeClosingDay);
		}

		const result = simulateDay(beforeClosingDay);
		const report = result.reports.at(-1)!;

		expect(report.day).toBe(8);
		expect(result.day).toBe(9);
		expect(report.cashBefore).toBe(
			beforeClosingDay.cash - beforeClosingDay.finance.currentDayActivity.financingCashFlow
		);
		expect(report.operatingIncome).toBe(report.grossMargin - report.operatingCosts);
		expect(report.netIncome).toBe(report.operatingCashFlow);
		expect(report.interestAccrued).toBeGreaterThan(0);
		expect(report.interestAccrued % 1).not.toBe(0);
		expect(report.principalRepaid).toBeGreaterThan(0);
		expect(report.interestPaid).toBeGreaterThanOrEqual(0);
		expect(report.financingCashFlow).toBe(
			report.principalBorrowed - report.principalRepaid - report.interestPaid
		);
		expect(report.cashAfter).toBe(
			report.cashBefore + report.operatingCashFlow + report.financingCashFlow
		);
		expect(report.outstandingPrincipalAfter).toBe(getTotalDebt(result));
		expect(report.nextLoanPayment).toMatchObject({ loanId: 'loan-1', day: 15 });
		expect(result.finance.currentDayActivity).toEqual({
			day: 9,
			principalBorrowed: 0,
			principalRepaid: 0,
			interestPaid: 0,
			interestCapitalized: 0,
			refinancedPrincipal: 0,
			financingCashFlow: 0
		});
	});

	test('uses plain ID ordering for equal-date next-loan-payment snapshots', () => {
		const base = createNewGame('convenience', 277_281);
		const [foundingLoan] = base.finance.loans;
		const game = {
			...base,
			finance: {
				...base.finance,
				loans: [
					{ ...foundingLoan!, id: 'loan-10' },
					{ ...foundingLoan!, id: 'loan-2' }
				]
			}
		};
		const localeCompare = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
			throw new Error('finance ordering must not depend on locale');
		});

		try {
			expect(simulateDay(game).reports.at(-1)?.nextLoanPayment?.loanId).toBe('loan-10');
		} finally {
			localeCompare.mockRestore();
		}
	});

	test('reports same-day manual financing activity before resetting it for the next day', () => {
		expect.assertions(6);
		const base = createNewGame('boutique', 277_009);
		const finance = appendFinanceTransaction(base.finance, {
			day: base.day,
			kind: 'disbursement',
			loanId: 'manual-credit',
			cashDelta: 500,
			principalAmount: 500,
			principalDelta: 500,
			interestAmount: 0
		});
		const result = simulateDay({ ...base, cash: base.cash + 500, finance });
		const report = result.reports.at(-1)!;

		expect(report.principalBorrowed).toBe(500);
		expect(report.financingCashFlow).toBe(500);
		expect(report.cashBefore).toBe(base.cash);
		expect(report.cashAfter).toBe(
			report.cashBefore + report.operatingCashFlow + report.financingCashFlow
		);
		expect(result.finance.transactions.at(-1)).toMatchObject({ day: 1, kind: 'disbursement' });
		expect(result.finance.currentDayActivity.day).toBe(2);
	});

	test('keeps imports, payroll, and scheduled finance service in one reconciled closing day', () => {
		expect.assertions(7);
		const base = createNewGame('convenience', 277_210);
		const loan = base.finance.loans[0]!;
		const game = {
			...base,
			day: 210,
			finance: {
				...base.finance,
				loans: [{ ...loan, nextPaymentDay: 210, lastInterestAccrualDay: 209 }]
			}
		};
		const result = simulateDay(game);
		const report = result.reports.at(-1)!;

		expect(report.importSpend).toBeGreaterThan(0);
		expect(report.payrollCost).toBeGreaterThan(0);
		expect(report.principalRepaid).toBeGreaterThan(0);
		expect(report.interestAccrued).toBeGreaterThan(0);
		expect(report.cashAfter).toBe(
			report.cashBefore + report.operatingCashFlow + report.financingCashFlow
		);
		expect(result.finance.transactions.every((transaction) => transaction.day === 210)).toBe(true);
		expect(result.finance.currentDayActivity.day).toBe(211);
	});

	test('keeps a deterministic 28-day finance snapshot for every archetype', () => {
		expect.assertions(ARCHETYPES.length * 2);
		const expectedSnapshots: Record<
			string,
			Array<{
				day: number;
				cashBefore: number;
				cashAfter: number;
				reserveWarning: boolean;
				cashPressureDecision: boolean;
				missedPaymentCount: number;
				arrears: number;
			}>
		> = {
			convenience: [
				{
					day: 8,
					cashBefore: 30_643,
					cashAfter: 29_967,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 15,
					cashBefore: 28_674,
					cashAfter: 27_981,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 22,
					cashBefore: 26_706,
					cashAfter: 26_024,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				}
			],
			boutique: [
				{
					day: 8,
					cashBefore: 37_507,
					cashAfter: 39_321,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 15,
					cashBefore: 37_261,
					cashAfter: 38_999,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 22,
					cashBefore: 37_015,
					cashAfter: 38_641,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				}
			],
			electronics: [
				{
					day: 8,
					cashBefore: 44_835,
					cashAfter: 46_789,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 15,
					cashBefore: 43_603,
					cashAfter: 45_463,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 22,
					cashBefore: 42_373,
					cashAfter: 44_091,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				}
			],
			grocery: [
				{
					day: 8,
					cashBefore: 40_350,
					cashAfter: 39_186,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 15,
					cashBefore: 37_582,
					cashAfter: 36_417,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				},
				{
					day: 22,
					cashBefore: 34_817,
					cashAfter: 33_642,
					reserveWarning: false,
					cashPressureDecision: false,
					missedPaymentCount: 0,
					arrears: 0
				}
			]
		};

		for (const archetype of ARCHETYPES) {
			let game = createNewGame(archetype.id, 277_280);
			const scheduledDays: Array<{
				day: number;
				cashBefore: number;
				cashAfter: number;
				reserveWarning: boolean;
				cashPressureDecision: boolean;
				missedPaymentCount: number;
				arrears: number;
			}> = [];

			for (let day = 1; day <= 28; day += 1) {
				game = simulateDay(game);
				const report = game.reports.at(-1)!;
				if (report.principalRepaid > 0 || report.interestPaid > 0) {
					const loan = game.finance.loans[0]!;
					scheduledDays.push({
						day: report.day,
						cashBefore: report.cashBefore,
						cashAfter: report.cashAfter,
						reserveWarning: report.warnings.some((warning) => warning.code === 'cashReservesLow'),
						cashPressureDecision: game.decisions.some((decision) => decision.id.includes('cash')),
						missedPaymentCount: loan.missedPaymentCount,
						arrears: loan.overdueInterest + loan.overduePrincipal
					});
				}
			}

			expect(scheduledDays).toEqual(expectedSnapshots[archetype.id]);
			expect(game.reports).toHaveLength(28);
		}
	});

	test('assigned staff accrue xp each day while unassigned staff do not', () => {
		expect.assertions(3);
		const base = createNewGame('grocery', 20260615);
		const idle: StaffMember = {
			id: 'staff-idle',
			name: 'Idle Worker',
			role: 'general',
			monthlySalary: 2_800,
			skill: 60,
			morale: 65,
			assignedStoreId: null,
			hiredOnDay: 1,
			level: 1,
			xp: 0
		};
		const result = simulateDay({ ...base, staff: [...base.staff, idle] });
		const assigned = result.staff.filter((member) => member.assignedStoreId !== null);

		expect(assigned.length).toBeGreaterThan(0);
		expect(assigned.every((member) => member.xp > 0)).toBe(true);
		expect(result.staff.find((member) => member.id === 'staff-idle')?.xp).toBe(0);
	});

	test('xp accrual is capped at the next-level threshold', () => {
		expect.assertions(3);
		const base = createNewGame('grocery', 20260615);
		const assigned = base.staff.filter((member) => member.assignedStoreId !== null)[0]!;
		const cap = getStaffXpForLevel(assigned.level);
		const nearCap = { ...assigned, xp: cap - 1 };
		const game = {
			...base,
			staff: base.staff.map((member) => (member.id === nearCap.id ? nearCap : member))
		};
		const result = simulateDay(game);
		const updated = result.staff.find((member) => member.id === nearCap.id)!;

		expect(updated.xp).toBeGreaterThanOrEqual(nearCap.xp);
		expect(updated.xp).toBeLessThanOrEqual(cap);
		expect(updated.xp).not.toBeGreaterThan(cap);
	});

	test('includes an empty production report in the daily report', () => {
		expect.assertions(1);
		const result = simulateDay(createNewGame('convenience', 20260512));

		expect(result.reports[0]?.productionReport).toEqual({
			cityInventories: [
				{
					cityId: 'industry-city',
					capacity: 0,
					used: 0,
					overflowUnits: 0,
					overflowCost: 0
				}
			],
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
			railUsage: {}
		});
	});

	test('charges production overflow cost for over-capacity warehouse stock', () => {
		expect.assertions(6);
		const startingCash = 50_000;
		const result = simulateDay({
			...createNewGame('convenience', 20260512),
			cash: startingCash,
			cityInventories: [
				{
					cityId: 'industry-city',
					materials: { snacks: 12 }
				}
			]
		});
		const report = result.reports[0]!;
		const storeOperatingCosts = report.storeReports.reduce(
			(sum, storeReport) => sum + storeReport.operatingCosts,
			0
		);

		expect(report.productionReport.overflowUnits).toBe(12);
		expect(report.productionReport.overflowCost).toBe(24);
		expect(report.productionReport.operatingCost).toBe(0);
		expect(report.operatingCosts).toBe(
			storeOperatingCosts + report.payrollCost + report.productionReport.overflowCost
		);
		expect(report.netIncome).toBe(report.revenue - report.operatingCosts - report.importSpend);
		expect(report.cashAfter).toBe(startingCash + report.netIncome);
	});

	test('premium pricing improves gross margin but can reduce customers served', () => {
		expect.assertions(2);
		const base = createNewGame('boutique', 900);
		const standard = simulateDay(updatePolicy(base, { pricing: 'standard' }));
		const premium = simulateDay(updatePolicy(base, { pricing: 'premium' }));

		expect(premium.reports[0]?.grossMargin).toBeGreaterThan(standard.reports[0]?.grossMargin ?? 0);
		expect(premium.reports[0]?.storeReports[0]?.customersServed).toBeLessThanOrEqual(
			standard.reports[0]?.storeReports[0]?.customersServed ?? 0
		);
	});

	test('lean inventory can create stock warnings', () => {
		expect.assertions(1);
		const game = updatePolicy(createNewGame('grocery', 10), { inventory: 'lean' });
		const result = simulateDay({
			...game,
			stores: game.stores.map((store) => ({ ...store, stockHealth: 18 }))
		});

		expect(result.reports[0]?.warnings.some((warning) => warning.code === 'stockPressure')).toBe(
			true
		);
	});

	test('warnings use post-day store health', () => {
		expect.assertions(2);
		const game = updatePolicy(createNewGame('convenience', 41), {
			staffing: 'minimal',
			service: 'speed'
		});
		const result = simulateDay({
			...game,
			stores: game.stores.map((store) => ({
				...store,
				localDemand: 30,
				stockHealth: 80,
				staffCapacity: 100,
				staffMorale: 35,
				managerQuality: 0
			}))
		});
		const report = result.reports[0]?.storeReports[0];

		expect(report?.staffMorale).toBeLessThan(30);
		expect(report?.warnings.some((warning) => warning.code === 'nearStaffCapacity')).toBe(true);
	});

	test('resumes persisted rng state across sequential days', () => {
		expect.assertions(6);
		const initial = updatePolicy(createNewGame('electronics', 1234), {
			inventory: 'generous',
			marketing: 'promotions',
			pricing: 'competitive'
		});
		const uninterruptedDayOne = simulateDay(initial);
		const uninterruptedDayTwo = simulateDay(uninterruptedDayOne);
		const persistedDayOne = JSON.parse(JSON.stringify(uninterruptedDayOne)) as GameState;
		const resumedDayTwo = simulateDay(persistedDayOne);
		const staleRngDayTwo = simulateDay({
			...persistedDayOne,
			rngState: initial.rngState
		});

		expect(resumedDayTwo.day).toBe(uninterruptedDayTwo.day);
		expect(resumedDayTwo.rngState).toBe(uninterruptedDayTwo.rngState);
		expect(resumedDayTwo.cash).toBe(uninterruptedDayTwo.cash);
		expect(resumedDayTwo.reports[1]?.netIncome).toBe(uninterruptedDayTwo.reports[1]?.netIncome);
		expect(resumedDayTwo.reports[1]?.storeReports).toEqual(
			uninterruptedDayTwo.reports[1]?.storeReports
		);
		expect(staleRngDayTwo.reports[1]?.storeReports).not.toEqual(
			uninterruptedDayTwo.reports[1]?.storeReports
		);
	});

	test('removes expired system decisions after a simulated day', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 55);
		const expiredDecision: SystemDecisionItem = {
			kind: 'system',
			id: 'expired',
			title: 'Expired',
			context: { code: 'locationGeneric' },
			expiresOnDay: game.day,
			options: []
		};

		const result = simulateDay({ ...game, decisions: [expiredDecision] });

		expect(result.decisions.some((decision) => decision.id === expiredDecision.id)).toBe(false);
		expect(result.events.history).toBe(game.events.history);
	});

	test('preserves non-expired existing decisions after a simulated day', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 56);
		const activeDecision: SystemDecisionItem = {
			kind: 'system',
			id: 'active',
			title: 'Active',
			context: { code: 'locationGeneric' },
			expiresOnDay: game.day + 2,
			options: []
		};

		const result = simulateDay({ ...game, decisions: [activeDecision] });

		expect(result.decisions.some((decision) => decision.id === activeDecision.id)).toBe(true);
	});

	test('records event expiry against the closing day', () => {
		const game = createNewGame('convenience', 57);
		const expiredDecision: EventDecisionItem = {
			kind: 'event',
			id: 'expired-event-1',
			eventId: 'fixture-event',
			definitionVersion: 1,
			generatedOnDay: game.day,
			expiresOnDay: game.day,
			target: { kind: 'company' },
			copy: { key: 'events.fixture', params: {} },
			options: [{ id: 'accept', effects: [], modifiers: [] }]
		};

		const result = simulateDay({ ...game, decisions: [expiredDecision] });

		expect(result.decisions.some((decision) => decision.id === expiredDecision.id)).toBe(false);
		expect(result.events.history.at(-1)).toEqual({
			kind: 'event-decision-expired',
			day: game.day,
			eventId: expiredDecision.eventId,
			instanceId: expiredDecision.id,
			target: { kind: 'company' }
		});
	});

	test('refreshes the hiring market each week with staffed role coverage', () => {
		expect.assertions(5);
		const game = createNewGame('convenience', 94);
		const staleCandidateIds = game.hiringCandidates.map((candidate) => candidate.id);
		const refreshed = simulateDay({
			...game,
			day: 7,
			hiringCandidates: []
		});
		const preserved = simulateDay({ ...game, day: 6 });

		expect(refreshed.day).toBe(8);
		expect(refreshed.hiringCandidates).toHaveLength(5);
		expect(refreshed.hiringCandidates.map((candidate) => candidate.id)).toEqual([
			'candidate-8-1',
			'candidate-8-2',
			'candidate-8-3',
			'candidate-8-4',
			'candidate-8-5'
		]);
		expect(refreshed.hiringCandidates.map((candidate) => candidate.role)).toEqual([
			'manager',
			'general',
			'general',
			'manager',
			'general'
		]);
		expect(preserved.hiringCandidates.map((candidate) => candidate.id)).toEqual(staleCandidateIds);
	});

	test('charges monthly payroll on payroll days only', () => {
		expect.assertions(8);
		const startingCash = 50_000;
		const baseGame = {
			...createNewGame('convenience', 90),
			cash: startingCash,
			reports: []
		};
		const payroll = baseGame.staff.reduce((sum, member) => sum + member.monthlySalary, 0);
		const payrollDay = simulateDay({ ...baseGame, day: 30 });
		const nonPayrollDay = simulateDay({ ...baseGame, day: 29 });
		const payrollReport = payrollDay.reports[0]!;
		const storeOperatingCosts = payrollReport.storeReports.reduce(
			(sum, report) => sum + report.operatingCosts,
			0
		);

		expect(payrollReport.payrollCost).toBe(payroll);
		expect(nonPayrollDay.reports[0]?.payrollCost).toBe(0);
		expect(payrollDay.cash).toBeLessThan(nonPayrollDay.cash);
		expect(payrollReport.operatingCosts).toBeGreaterThan(
			nonPayrollDay.reports[0]?.operatingCosts ?? 0
		);
		expect(payroll).toBeGreaterThan(0);
		expect(payrollReport.operatingCosts).toBe(storeOperatingCosts + payrollReport.payrollCost);
		expect(payrollReport.netIncome).toBe(
			payrollReport.revenue - payrollReport.operatingCosts - payrollReport.importSpend
		);
		expect(payrollReport.cashAfter).toBe(startingCash + payrollReport.netIncome);
	});

	test('records product reports and aggregates store report totals', () => {
		expect.assertions(8);
		const game = createNewGame('convenience', 20260508);
		const result = simulateDay(game);
		const report = result.reports[0]!.storeReports[0]!;
		const productTotals = report.productReports.reduce(
			(totals, product) => ({
				revenue: totals.revenue + product.revenue,
				costOfGoods: totals.costOfGoods + product.costOfGoods,
				importSpend: totals.importSpend + product.importSpend,
				unitsSold: totals.unitsSold + product.unitsSold,
				demandMissed: totals.demandMissed + product.demandMissed
			}),
			{ revenue: 0, costOfGoods: 0, importSpend: 0, unitsSold: 0, demandMissed: 0 }
		);

		expect(report.productReports).toHaveLength(game.stores[0]!.products.length);
		expect(report.revenue).toBe(productTotals.revenue);
		expect(report.costOfGoods).toBe(productTotals.costOfGoods);
		expect(report.importSpend).toBe(productTotals.importSpend);
		expect(report.customersServed).toBe(productTotals.unitsSold);
		expect(report.demandMissed).toBe(productTotals.demandMissed);
		expect(result.stores[0]!.products[0]!.stock).toBeLessThanOrEqual(
			game.stores[0]!.products[0]!.stock
		);
		expect(report.stockHealth).toBe(result.stores[0]!.stockHealth);
	});

	test('inventory posture changes daily product sales capacity', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260508);
		const stores = game.stores.map((store) => ({
			...store,
			products: store.products.map((product) => ({
				...product,
				stock: 500,
				targetStock: 500
			})),
			stockHealth: 100,
			staffCapacity: 80,
			staffMorale: 90
		}));
		const lean = simulateDay(updatePolicy({ ...game, stores }, { inventory: 'lean' }));
		const generous = simulateDay(updatePolicy({ ...game, stores }, { inventory: 'generous' }));
		const leanReport = lean.reports[0]!.storeReports[0]!;
		const generousReport = generous.reports[0]!.storeReports[0]!;

		expect(generousReport.customersServed).toBeGreaterThan(leanReport.customersServed);
		expect(generousReport.reputation).toBeGreaterThanOrEqual(leanReport.reputation);
		expect(generousReport.revenue).toBeGreaterThan(leanReport.revenue);
	});

	test('simulates product demand for stores in every city', () => {
		expect.assertions(6);
		const initial = createNewGame('convenience', 20260508);
		const game = openWorldCity(
			{
				...initial,
				cash: 100_000,
				world: {
					...initial.world,
					revealedCityIds: [...initial.world.revealedCityIds, 'campus-junction']
				}
			},
			'campus-junction'
		);
		const secondCity = game.cities.find((city) => city.id === 'campus-junction')!;
		const firstStore = {
			...game.stores[0]!,
			products: game.stores[0]!.products.map((product) => ({
				...product,
				stock: 500,
				targetStock: 500
			})),
			stockHealth: 100,
			staffCapacity: 140,
			staffMorale: 90
		};
		const secondTile = secondCity.tiles.find((tile) => !tile.locked && tile.feature === null)!;
		const secondStore = {
			...firstStore,
			id: 'store-2',
			name: 'Second City Store',
			cityId: secondCity.id,
			tileId: secondTile.id,
			mapX: secondTile.x,
			mapY: secondTile.y,
			location: { neighborhoodId: 'downtown' as const, x: 0, y: 0 }
		};
		const result = simulateDay({ ...game, stores: [firstStore, secondStore] });
		const firstReport = result.reports[0]!.storeReports.find(
			(report) => report.storeId === firstStore.id
		)!;
		const secondReport = result.reports[0]!.storeReports.find(
			(report) => report.storeId === secondStore.id
		)!;

		expect(firstReport.productReports.some((report) => report.unitsSold > 0)).toBe(true);
		expect(secondReport.productReports.some((report) => report.unitsSold > 0)).toBe(true);
		expect(firstReport.customersServed).toBeGreaterThan(0);
		expect(secondReport.customersServed).toBeGreaterThan(0);
		expect(firstReport.revenue).toBeGreaterThan(0);
		expect(secondReport.revenue).toBeGreaterThan(0);
	});

	test('weekly imports subtract cash even when cash goes negative', () => {
		expect.assertions(5);
		const game = {
			...createNewGame('convenience', 20260508),
			day: 7,
			cash: 10
		};
		const store = {
			...game.stores[0]!,
			products: game.stores[0]!.products.map((product) => ({
				...product,
				stock: 0,
				reorderThreshold: 5,
				targetStock: 20
			}))
		};
		const result = simulateDay({ ...game, stores: [store] });
		const report = result.reports[0]!;

		expect(report.importSpend).toBeGreaterThan(10);
		expect(result.cash).toBeLessThan(0);
		expect(result.stores[0]!.products.every((product) => product.stock >= 20)).toBe(true);
		expect(
			report.storeReports[0]?.productReports.some((product) => product.importedUnits > 0)
		).toBe(true);
		expect(report.cashAfter).toBe(result.cash);
	});

	test('runs industry production before weekly shop refill', () => {
		expect.assertions(4);
		const baseGame = {
			...createNewGame('convenience', 20260508),
			day: 7,
			cash: 50_000
		};
		const store = {
			...baseGame.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 0,
					reorderThreshold: 5,
					targetStock: 20,
					sellingPrice: 5
				}
			]
		};
		const noWarehouse = simulateDay({
			...baseGame,
			stores: [store],
			cityInventories: [
				{
					cityId: 'industry-city',
					materials: {}
				}
			]
		});
		const withWarehouse = simulateDay({
			...baseGame,
			stores: [store],
			cityInventories: [
				{
					cityId: 'industry-city',
					materials: { snacks: 12 }
				}
			]
		});
		const warehouseReport = withWarehouse.reports[0]!.storeReports[0]!.productReports[0]!;

		expect(noWarehouse.reports[0]!.storeReports[0]!.productReports[0]!.importedUnits).toBe(20);
		expect(warehouseReport.warehouseUnits).toBe(12);
		expect(warehouseReport.importedUnits).toBe(8);
		expect(withWarehouse.reports[0]!.importSpend).toBeLessThan(noWarehouse.reports[0]!.importSpend);
	});

	test('keeps production-close pressure separate from post-replenishment inventory and report attribution', () => {
		expect.assertions(15);
		const startingCash = 50_000;
		const baseGame = {
			...createNewGame('convenience', 292_606),
			day: 7,
			cash: startingCash
		};
		const store = {
			...baseGame.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 0,
					reorderThreshold: 5,
					targetStock: 20,
					sellingPrice: 5
				},
				{
					categoryId: 'bottled-water',
					stock: 100,
					reorderThreshold: 5,
					targetStock: 100,
					sellingPrice: 3
				}
			]
		};
		const result = simulateDay({
			...baseGame,
			stores: [store],
			cityInventories: [
				{
					cityId: 'industry-city',
					materials: { snacks: 12 }
				}
			]
		});
		const report = result.reports[0]!;
		const storeReport = report.storeReports[0]!;
		const snacks = storeReport.productReports.find((product) => product.categoryId === 'snacks')!;
		const bottledWater = storeReport.productReports.find(
			(product) => product.categoryId === 'bottled-water'
		)!;

		expect(report.productionReport.cityInventories).toEqual([
			{
				cityId: 'industry-city',
				capacity: 0,
				used: 12,
				overflowUnits: 12,
				overflowCost: 24
			}
		]);
		expect(report.productionReport.warehouseUsed).toBe(12);
		expect(report.productionReport.overflowUnits).toBe(12);
		expect(report.productionReport.overflowCost).toBe(24);
		expect(result.cityInventories).toEqual([
			{
				cityId: 'industry-city',
				materials: { snacks: 0 }
			}
		]);
		expect(result).not.toHaveProperty('warehouse');
		expect(snacks).toMatchObject({
			warehouseUnits: 12,
			warehouseValue: 96,
			importedUnits: 8,
			importSpend: 24
		});
		expect(snacks).not.toHaveProperty('replenishmentOutcome');
		expect(bottledWater).not.toHaveProperty('replenishmentOutcome');
		expect(storeReport.replenishment).toEqual({
			retailCityId: 'harbor-city',
			configuredSupplyCityId: 'industry-city',
			resolvedSupplyCityId: 'industry-city'
		});
		expect(report.productionReport.warehousePulls).toContainEqual({
			cityId: 'industry-city',
			materialId: 'snacks',
			quantity: 12,
			value: 96,
			source: 'warehouse'
		});
		expect(report.productionReport.shopImports).toContainEqual({
			cityId: 'harbor-city',
			materialId: 'snacks',
			quantity: 8,
			value: 24,
			source: 'import'
		});
		expect(report.importSpend).toBe(24);
		expect(report.importSpend).toBe(snacks.importSpend);
		expect(report.cashAfter).toBe(startingCash + report.netCashChange);
	});

	test('writes null replenishment attribution outside the replenishment cadence', () => {
		expect.assertions(3);
		const baseGame = createNewGame('convenience', 292_607);
		const result = simulateDay({
			...baseGame,
			day: 6,
			stores: [
				{
					...baseGame.stores[0]!,
					products: [
						{
							categoryId: 'snacks',
							stock: 0,
							reorderThreshold: 1,
							targetStock: 20,
							sellingPrice: 5
						}
					]
				}
			]
		});
		const storeReport = result.reports[0]!.storeReports[0]!;

		expect(storeReport.replenishment).toBeNull();
		expect(storeReport.productReports).not.toHaveLength(0);
		expect(
			storeReport.productReports.every((product) => !Object.hasOwn(product, 'replenishmentOutcome'))
		).toBe(true);
	});

	test('without a rail link, same-day production stays in the factory buffer and the weekly refill fully imports', () => {
		expect.assertions(13);
		const startingCash = 50_000;
		let game = {
			...createNewGame('convenience', 20260508),
			day: 7,
			cash: 100_000
		};
		const industrialTiles = game.industryCities[0]!.tiles.filter(
			(tile) => tile.terrain === 'industrial' && !tile.locked
		);
		game = buildIndustrialBuilding(game, {
			tileId: industrialTiles[0]!.id,
			buildingTypeId: 'snack-factory'
		});
		game = buildIndustrialBuilding(game, {
			tileId: industrialTiles[1]!.id,
			buildingTypeId: 'warehouse'
		});
		const store = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 0,
					reorderThreshold: 5,
					targetStock: 20,
					sellingPrice: 5
				}
			]
		};
		const result = simulateDay({
			...game,
			cash: startingCash,
			stores: [store]
		});
		const dailyReport = result.reports[0]!;
		const productReport = dailyReport.storeReports[0]!.productReports[0]!;
		const storeOperatingCosts = dailyReport.storeReports.reduce(
			(total, report) => total + report.operatingCosts,
			0
		);
		const storeImportSpend = dailyReport.storeReports.reduce(
			(total, report) => total + report.importSpend,
			0
		);

		// The snack factory still produces same-day (into its own buffer), but
		// with no rail connecting it to the warehouse building, that output
		// never reaches the shared warehouse pool — the store's weekly refill
		// finds nothing there and imports the full target stock instead.
		expect(dailyReport.productionReport.produced).toContainEqual({
			cityId: 'industry-city',
			materialId: 'snacks',
			quantity: 8,
			value: 64,
			source: 'local'
		});
		expect(dailyReport.productionReport.warehousePulls).toHaveLength(0);
		expect(productReport.warehouseUnits).toBe(0);
		expect(productReport.importedUnits).toBe(20);
		expect(productReport.importSpend).toBe(60);
		expect(result.stores[0]!.products[0]!.stock).toBe(20);
		expect(
			result.cityInventories.find((inventory) => inventory.cityId === 'industry-city')?.materials
				.snacks ?? 0
		).toBe(0);
		expect(dailyReport.productionReport.operatingCost).toBeGreaterThan(0);
		expect(dailyReport.productionReport.importSpend).toBeGreaterThan(0);
		expect(dailyReport.operatingCosts).toBe(
			storeOperatingCosts +
				dailyReport.payrollCost +
				dailyReport.productionReport.operatingCost +
				dailyReport.productionReport.overflowCost
		);
		expect(dailyReport.importSpend).toBe(
			storeImportSpend + dailyReport.productionReport.importSpend
		);
		expect(dailyReport.netIncome).toBe(
			dailyReport.revenue - dailyReport.operatingCosts - dailyReport.importSpend
		);
		expect(dailyReport.cashAfter).toBe(startingCash + dailyReport.netIncome);
	});

	test('understaffing reduces served demand and reports role shortages', () => {
		expect.assertions(4);
		const baseGame = updatePolicy(createNewGame('grocery', 91), {
			pricing: 'discount',
			inventory: 'generous',
			marketing: 'promotions'
		});
		const stores = baseGame.stores.map((store) => ({
			...store,
			localDemand: 220,
			stockHealth: 100,
			staffCapacity: 100,
			staffMorale: 85
		}));
		const staffed = simulateDay({
			...baseGame,
			stores,
			staff: baseGame.staff.map((member) => ({ ...member, skill: 88, morale: 82 }))
		});
		const understaffed = simulateDay({
			...baseGame,
			stores,
			staff: baseGame.staff
				.filter((member) => member.role === 'manager')
				.map((member) => ({ ...member, skill: 88, morale: 82 }))
		});
		const staffedReport = staffed.reports[0]?.storeReports[0];
		const understaffedReport = understaffed.reports[0]?.storeReports[0];

		expect(understaffedReport?.customersServed).toBeLessThan(staffedReport?.customersServed ?? 0);
		expect(understaffedReport?.staffingCoverage).toBeLessThan(100);
		expect(understaffedReport?.staffingShortage).toEqual({ manager: 0, general: 3 });
		expect(understaffedReport?.warnings).toContainEqual({
			code: 'shortGeneral',
			storeId: 'store-1',
			count: 3
		});
	});

	test('handles product categories not in starting categories', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260508);
		const store = game.stores[0]!;
		const storeWithExtraProduct = {
			...store,
			products: [
				...store.products,
				{
					categoryId: 'unknown-category',
					stock: 10,
					reorderThreshold: 5,
					targetStock: 20,
					sellingPrice: 5
				}
			]
		};
		const result = simulateDay({ ...game, stores: [storeWithExtraProduct] });
		const productReport = result.reports[0]!.storeReports[0]!.productReports.find(
			(report) => report.categoryId === 'unknown-category'
		);

		expect(productReport).toBeDefined();
		expect(productReport?.name).toBe('unknown-category');
	});

	test('reports reputation warning when store reputation falls below threshold', () => {
		expect.assertions(1);
		const game = updatePolicy(createNewGame('convenience', 41), {
			staffing: 'minimal',
			service: 'speed'
		});
		const result = simulateDay({
			...game,
			stores: game.stores.map((store) => ({
				...store,
				localDemand: 30,
				stockHealth: 80,
				staffCapacity: 100,
				staffMorale: 35,
				managerQuality: 0,
				reputation: 30
			}))
		});

		expect(result.reports[0]?.storeReports[0]?.warnings).toContainEqual({
			code: 'reputationSlipping',
			storeId: 'store-1'
		});
	});

	test('uses fallback averages when no store reports exist', () => {
		expect.assertions(1);
		const game = createNewGame('convenience', 1);
		const result = simulateDay({
			...game,
			stores: []
		});

		expect(result.scorecard).toEqual({
			profit: expect.any(Number),
			customerSatisfaction: expect.any(Number),
			staffMorale: expect.any(Number),
			marketPosition: expect.any(Number)
		});
	});

	test('assigns zero utilization when a store has zero staff capacity', () => {
		expect.assertions(1);
		const base = createNewGame('grocery', 20260615);
		const store = {
			...base.stores[0]!,
			staffCapacity: 0,
			products: base.stores[0]!.products.map((p) => ({
				...p,
				stock: 500,
				targetStock: 500
			}))
		};
		const result = simulateDay({ ...base, stores: [store] });
		const report = result.reports[0]!.storeReports[0]!;

		expect(report.customersServed).toBe(0);
	});

	test('does not accrue xp for staff already at the level cap', () => {
		expect.assertions(2);
		const base = createNewGame('grocery', 20260615);
		const assigned = base.staff.filter((member) => member.assignedStoreId !== null)[0]!;
		const cap = getStaffXpForLevel(assigned.level);
		const maxedOut = { ...assigned, xp: cap };
		const game = {
			...base,
			staff: base.staff.map((member) => (member.id === maxedOut.id ? maxedOut : member))
		};
		const result = simulateDay(game);
		const updated = result.staff.find((member) => member.id === maxedOut.id)!;

		expect(updated.xp).toBe(cap);
		expect(updated).toEqual(maxedOut);
	});

	test('uses zero demand-missed rate when stores have no customers or missed demand', () => {
		expect.assertions(2);
		const game = createNewGame('convenience', 20260508);
		const storeWithNoProducts = {
			...game.stores[0]!,
			products: []
		};
		const result = simulateDay({ ...game, stores: [storeWithNoProducts] });
		const report = result.reports[0]!.storeReports[0]!;

		expect(report.customersServed).toBe(0);
		expect(report.demandMissed).toBe(0);
	});

	test('creates default product reports for stores with no sales or import reports', () => {
		expect.assertions(3);
		const game = createNewGame('convenience', 20260508);
		const store = {
			...game.stores[0]!,
			products: [
				{
					categoryId: 'unknown-category',
					stock: 100,
					reorderThreshold: 5,
					targetStock: 100,
					sellingPrice: 5
				}
			]
		};
		const result = simulateDay({ ...game, stores: [store] });
		const productReport = result.reports[0]!.storeReports[0]!.productReports.find(
			(report) => report.categoryId === 'unknown-category'
		);

		expect(productReport).toBeDefined();
		expect(productReport?.unitsSold).toBe(0);
		expect(productReport?.name).toBe('unknown-category');
	});

	test('omits shop imports for non-finished-material categories from the production report', () => {
		expect.assertions(2);
		const game = {
			...createNewGame('boutique', 20260508),
			day: 7,
			cash: 100_000
		};
		const store = {
			...game.stores[0]!,
			products: [
				{ categoryId: 'apparel', stock: 0, reorderThreshold: 5, targetStock: 20, sellingPrice: 38 }
			]
		};
		const result = simulateDay({ ...game, stores: [store] });
		const productionReport = result.reports[0]!.productionReport;

		expect(productionReport.shopImports).toEqual([]);
		expect(result.reports[0]!.storeReports[0]!.productReports[0]!.importedUnits).toBeGreaterThan(0);
	});

	test('reports replaced modifier lifecycle with replacedByModifierId on the closing day', () => {
		const closingDay = 5;
		const base = createNewGame('convenience', 280_300);
		const firstDecision = supplierBulkDiscountDecision(closingDay);
		const prepared: GameState = {
			...base,
			day: closingDay,
			stores: base.stores.map((store) => ({
				...store,
				products: store.products.map((product) => ({
					...product,
					stock: 0,
					reorderThreshold: 1,
					targetStock: 10
				}))
			})),
			decisions: [firstDecision]
		};
		const afterFirst = resolveDecision(prepared, firstDecision.id, 'bulk-discount');
		expect(afterFirst.ok).toBe(true);
		if (!afterFirst.ok) throw new Error('expected first decision to resolve');

		const secondDecision: EventDecisionItem = {
			kind: 'event',
			id: 'event-instance-901',
			eventId: 'supplier-terms',
			definitionVersion: 2,
			generatedOnDay: closingDay,
			expiresOnDay: closingDay + 2,
			target: { kind: 'company' },
			copy: { key: 'events.supplierTerms', params: {} },
			options: [
				{
					id: 'bulk-discount',
					effects: [],
					modifiers: [
						{
							durationDays: 3,
							stackingKey: 'supplier-bulk-discount:retail-product',
							stackingRule: 'replace',
							effect: {
								kind: 'import-cost-multiplier',
								scope: 'retail-product',
								target: { kind: 'all' },
								multiplier: 0.8
							},
							explanation: {
								key: 'events.supplierTerms.bulkDiscount.modifier',
								params: {}
							},
							importance: 'important'
						}
					]
				}
			]
		};
		const afterSecond = resolveDecision(
			{ ...afterFirst.game, decisions: [secondDecision] },
			secondDecision.id,
			'bulk-discount'
		);
		expect(afterSecond.ok).toBe(true);
		if (!afterSecond.ok) throw new Error('expected second decision to resolve');

		const result = simulateDay(afterSecond.game);
		const report = result.reports.at(-1)!;

		expect(report.modifierLifecycle).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					status: 'replaced',
					modifier: expect.objectContaining({ id: 'event-modifier-1' }),
					replacedByModifierId: 'event-modifier-2'
				})
			])
		);
	});

	test('skips import contributions from event-modifier sources not in active modifiers', () => {
		const closingDay = 7;
		const base = createNewGame('convenience', 280_301);
		const store = {
			...base.stores[0]!,
			products: [
				{
					categoryId: 'snacks',
					stock: 0,
					reorderThreshold: 1,
					targetStock: 10,
					sellingPrice: 5
				}
			]
		};
		const rules: SimulationRules = {
			importCostMultipliers: [
				{
					source: {
						kind: 'event-modifier',
						sourceId: 'non-existent-modifier',
						modifierId: 'non-existent-modifier',
						eventId: 'event-x',
						instanceId: 'instance-x',
						explanation: { key: 'events.x', params: {} }
					},
					scope: 'retail-product',
					target: { kind: 'all' },
					multiplier: 0.5
				}
			]
		};
		const result = simulateDay({ ...base, day: closingDay, stores: [store] }, rules);
		const report = result.reports.at(-1)!;

		expect(report.modifierImpacts).toEqual([]);
	});
});
