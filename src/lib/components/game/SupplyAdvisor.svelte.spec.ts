import { page } from 'vitest/browser';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { createI18n, type I18nBundle } from '$lib/i18n';
import type {
	SupplyPlanProjection,
	SupplyPlannerCandidate,
	SupplyPlannerComparison,
	SupplyPlannerResult,
	SupplyPlannerAction
} from '$lib/game/supplyPlannerActions';
import type {
	SupplyMaterialProjection,
	SupplyDemandContributor,
	SupplyLogisticsBottleneck,
	SupplyPlannerHorizonDays,
	SupplyPlannerRouteCondition,
	SupplyPlannerSnapshot
} from '$lib/game/supplyPlanner';
import type { ProductId } from '$lib/game/types';
import SupplyAdvisor from './SupplyAdvisor.svelte';

const i18n = createI18n('en');

function horizon(
	days: SupplyPlannerHorizonDays,
	overrides: Partial<SupplyMaterialProjection['sevenDay']> = {}
) {
	return {
		horizonDays: days,
		requiredUnits: days * 10,
		startingInventoryUnits: 20,
		localAvailableUnits: days * 8 + 20,
		importRequiredUnits: days * 2,
		endingInventoryUnits: 0,
		daysOfCover: 2,
		projectedStockoutDay: 2,
		...overrides
	};
}

function material(overrides: Partial<SupplyMaterialProjection> = {}): SupplyMaterialProjection {
	return {
		materialId: 'bottled-water',
		requiredPerDay: 10,
		producerRecipeId: 'water-pumping',
		chainDepth: 0,
		buildingCount: 1,
		maxBuildingLevel: 1,
		buildingLevels: [1],
		inventoryUnits: 20,
		daysOfCover: 2,
		projectedStockoutDay: 2,
		installedCapacityPerDay: 12,
		usableCapacityPerDay: 8,
		sevenDay: horizon(7),
		thirtyDay: horizon(30),
		...overrides
	};
}

function contributor(overrides: Partial<SupplyDemandContributor> = {}): SupplyDemandContributor {
	return {
		retailCityId: 'harbor-city',
		potentialDemandPerDay: 12,
		replenishmentCeilingPerDay: 10,
		effectiveDemandPerDay: 10,
		retailImportCostPerUnit: 2,
		...overrides
	};
}

const baseSnapshot: SupplyPlannerSnapshot = {
	retailCityId: 'harbor-city',
	supplyCityId: 'industry-city',
	finishedMaterialId: 'bottled-water',
	cash: 42_000,
	demandContributors: [contributor()],
	demandPerDay: 10,
	finishedImportCostPerUnit: 2,
	inventory: { 'bottled-water': 20 },
	warehouseCapacity: 400,
	warehouseUsed: 220,
	buildings: [{ id: 'water-pump-1', cityId: 'industry-city', typeId: 'water-pump', level: 1 }],
	usableBuildingIds: ['water-pump-1'],
	disconnectedBuildingIds: [],
	usableSinkBuildingIdsByMaterial: { 'bottled-water': ['warehouse-1'] },
	reachableDemandByMaterial: {},
	reachableDemandByBuildingAndMaterial: {},
	reachableBranchesByBuildingAndMaterial: {},
	reachableProcessorsByBuildingAndMaterial: {},
	warehouseConnectedConsumerCapacityByMaterial: {},
	warehouseConnectedProcessorsByMaterial: {}
};

const baseComparison: SupplyPlannerComparison = {
	shortageReduction7: 14,
	shortageReduction30: 60,
	importReduction30: 60,
	importSpendReduction30: 120,
	projectedDeliveredUnits7: 0,
	projectedDeliveredUnits30: 0,
	incrementalTransportCost30: 0,
	firstShortageImprovementDays: 0,
	incrementalOperatingCost30: 30,
	incrementalInputImportSpend30: 10,
	preRailNetCashBenefit30: 80,
	netCashBenefit30: 80,
	requiresRailConnection: false,
	requiresAdditionalProducerBuilds: false,
	stockoutImprovementDays: 5,
	warehouseFreeGain: 0
};

const baseAction: SupplyPlannerAction = {
	kind: 'build-producer',
	materialId: 'bottled-water',
	buildingTypeId: 'water-pump',
	cost: 250
};

type SupplyPlannerRouteForecast = NonNullable<SupplyPlanProjection['routeForecasts']>[number];

function logisticsSnapshot(
	overrides: Partial<NonNullable<SupplyPlannerSnapshot['logistics']>> = {}
): NonNullable<SupplyPlannerSnapshot['logistics']> {
	return {
		currentDay: 12,
		remoteCities: [],
		inTransitOrders: [],
		inTransitInventory: [],
		routes: [],
		routeModifiers: [],
		nextRouteSequence: 2,
		nextTransferSequence: 2,
		...overrides
	};
}

function routeForecast(
	overrides: Partial<SupplyPlannerRouteForecast> = {}
): SupplyPlannerRouteForecast {
	return {
		route: {
			id: 'route-1',
			originCityId: 'breadbasket-basin',
			destinationCityId: 'industry-city',
			materialId: 'bottled-water',
			capacity: 8,
			frequencyDays: 1,
			leadTimeDays: 2,
			transportCostPerUnit: 3,
			priority: 0,
			state: 'active',
			nextDispatchOnDay: 13
		},
		projectedCondition: 'normal',
		projectedDispatchedUnits7: 5,
		projectedDispatchedUnits30: 20,
		projectedDeliveredUnits7: 5,
		projectedDeliveredUnits30: 20,
		projectedTransportCost30: 60,
		firstProjectedArrivalDay: 15,
		peakUnmetDestinationNeed: 0,
		firstOriginStockConstraintDay: null,
		firstDestinationCapacityConstraintDay: null,
		firstRouteCapacityConstraintDay: null,
		firstPriorityConstraintDay: null,
		priorityBlockedByRouteId: null,
		...overrides
	};
}

function withoutSnapshot<T extends { snapshot?: unknown }>(
	value: T | undefined
): Omit<T, 'snapshot'> {
	if (!value) return {} as Omit<T, 'snapshot'>;
	const copy = { ...value };
	delete copy.snapshot;
	return copy;
}

function withoutBaseline<T extends { baseline?: unknown }>(
	value: T | undefined
): Omit<T, 'baseline'> {
	if (!value) return {} as Omit<T, 'baseline'>;
	const copy = { ...value };
	delete copy.baseline;
	return copy;
}

function readyResult(
	options: {
		snapshot?: Partial<SupplyPlannerSnapshot>;
		baseline?: Partial<SupplyPlanProjection>;
		projection?: Partial<SupplyPlanProjection>;
		recommendation?: Partial<SupplyPlannerCandidate>;
		alternatives?: readonly SupplyPlannerCandidate[];
	} = {}
): SupplyPlannerResult {
	const snapshot = { ...baseSnapshot, ...options.snapshot };
	const baselineOverrides = withoutSnapshot(options.baseline);
	const baseline: SupplyPlanProjection = {
		snapshot,
		materials: [material()],
		warehouse: { capacity: 400, used: 220, freeCapacity: 180, overflowUnits: 0 },
		bottleneck: { kind: 'production-capacity', materialId: 'bottled-water', deficitPerDay: 2 },
		limitations: [
			{ kind: 'rail-capacity-not-modeled' },
			{ kind: 'store-sales-capacity-not-modeled' }
		],
		totals: { shortageUnits7: 14, shortageUnits30: 60, importUnits30: 60, importSpend30: 120 },
		...baselineOverrides
	};
	const projectionOverrides = withoutSnapshot(options.projection);
	const projection: SupplyPlanProjection = {
		...baseline,
		...projectionOverrides
	};
	const recommendationOverrides = withoutBaseline(options.recommendation);
	const recommendation: SupplyPlannerCandidate = {
		action: baseAction,
		baseline,
		projection,
		comparison: baseComparison,
		affordable: true,
		feasible: true,
		...recommendationOverrides
	};
	return {
		status: 'ready',
		plan: {
			snapshot,
			baseline,
			recommendation,
			alternatives: options.alternatives ?? [recommendation]
		}
	};
}

function renderPlanner(
	result: SupplyPlannerResult,
	options: {
		productIds?: readonly ProductId[];
		selectedProductId?: ProductId | null;
		horizonDays?: SupplyPlannerHorizonDays;
		i18n?: I18nBundle;
		onSelectProduct?: (productId: ProductId) => void;
		onSelectHorizon?: (days: SupplyPlannerHorizonDays) => void;
		onAction?: (action: SupplyPlannerAction) => void;
		onClose?: () => void;
	} = {}
) {
	return render(SupplyAdvisor, {
		result,
		productIds: options.productIds ?? ['bottled-water', 'produce'],
		selectedProductId:
			options.selectedProductId === undefined ? 'bottled-water' : options.selectedProductId,
		horizonDays: options.horizonDays ?? 30,
		i18n: options.i18n ?? i18n,
		onSelectProduct: options.onSelectProduct ?? vi.fn(),
		onSelectHorizon: options.onSelectHorizon ?? vi.fn(),
		onAction: options.onAction ?? vi.fn(),
		onClose: options.onClose ?? vi.fn()
	});
}

describe('SupplyAdvisor planner evidence additions', () => {
	it('shows selected city context and stock, cover, and stockout evidence for the chosen horizon', async () => {
		expect.assertions(8);
		renderPlanner(
			readyResult({
				baseline: {
					materials: [
						material({
							sevenDay: horizon(7, {
								startingInventoryUnits: 20,
								endingInventoryUnits: 8,
								daysOfCover: 1.5,
								projectedStockoutDay: 6,
								importRequiredUnits: 12
							})
						})
					]
				}
			}),
			{ horizonDays: 7 }
		);
		await expect.element(page.getByText(/retail city/i)).toBeVisible();
		await expect.element(page.getByText('Harbor City', { exact: true })).toBeVisible();
		await expect.element(page.getByText(/^supply city:/i)).toBeVisible();
		await expect.element(page.getByText(/industry city/i)).toBeVisible();
		await expect.element(page.getByText(/starting inventory/i)).toBeVisible();
		await expect.element(page.getByText(/ending inventory/i)).toBeVisible();
		await expect.element(page.getByText(/days of cover/i)).toBeVisible();
		await expect.element(page.getByText(/projected stockout/i)).toBeVisible();
	});

	it('shows baseline to action forecast outcomes at the selected horizon', async () => {
		expect.assertions(3);
		renderPlanner(
			readyResult({
				baseline: {
					materials: [
						material({
							sevenDay: horizon(7, {
								importRequiredUnits: 14,
								daysOfCover: 2,
								projectedStockoutDay: 5
							}),
							thirtyDay: horizon(30, {
								importRequiredUnits: 60,
								daysOfCover: 2,
								projectedStockoutDay: 22
							})
						})
					]
				},
				projection: {
					materials: [
						material({
							sevenDay: horizon(7, {
								importRequiredUnits: 4,
								daysOfCover: 4,
								projectedStockoutDay: null
							}),
							thirtyDay: horizon(30, {
								importRequiredUnits: 18,
								daysOfCover: 30,
								projectedStockoutDay: null
							})
						})
					]
				}
			}),
			{ horizonDays: 7 }
		);
		const recommendation = page.getByRole('region', { name: /supply planner recommendation/i });
		await expect.element(recommendation.getByText(/forecast outcome/i)).toBeVisible();
		await expect.element(recommendation.getByText(/14\s*→\s*4/)).toBeVisible();
		await expect.element(recommendation.getByText(/2\s*→\s*4/)).toBeVisible();
	});
});

describe('SupplyAdvisor', () => {
	it('localizes complete per-day and per-unit metric values', async () => {
		expect.assertions(2);
		renderPlanner(readyResult(), { i18n: createI18n('ja') });

		expect(document.body.textContent).toContain(' / 日');
		expect(document.body.textContent).toContain(' / 個');
	});

	it('uses stable candidate identity for identical upgrade labels', async () => {
		expect.assertions(1);
		const result = readyResult({
			snapshot: {
				buildings: [
					{ id: 'water-pump-a', cityId: 'industry-city', typeId: 'water-pump', level: 1 },
					{ id: 'water-pump-b', cityId: 'industry-city', typeId: 'water-pump', level: 1 }
				],
				usableBuildingIds: ['water-pump-a', 'water-pump-b']
			}
		});
		if (result.status !== 'ready') throw new Error('Expected ready planner result');
		const upgradeCandidate = (buildingId: string): SupplyPlannerCandidate => ({
			action: {
				kind: 'upgrade-building',
				materialId: 'bottled-water',
				buildingId,
				buildingTypeId: 'water-pump',
				fromLevel: 1,
				toLevel: 2,
				cost: 500
			},
			baseline: result.plan.baseline,
			projection: result.plan.baseline,
			comparison: baseComparison,
			affordable: true,
			feasible: true
		});

		const first = upgradeCandidate('water-pump-a');
		const second = upgradeCandidate('water-pump-b');
		renderPlanner({
			status: 'ready',
			plan: { ...result.plan, alternatives: [first, second] }
		});

		expect(document.querySelectorAll('.alternatives h4').length).toBe(2);
	});

	it('filters the winning recommendation out of alternatives and hides an empty section', async () => {
		expect.assertions(2);
		const result = readyResult();
		if (result.status !== 'ready') throw new Error('Expected ready planner result');

		renderPlanner(result);

		await expect
			.element(page.getByRole('region', { name: /supply planner alternatives/i }))
			.not.toBeInTheDocument();

		const alternative: SupplyPlannerCandidate = {
			...result.plan.recommendation,
			action: {
				kind: 'build-warehouse',
				cityId: 'industry-city',
				buildingTypeId: 'warehouse',
				cost: 900
			}
		};
		renderPlanner({
			status: 'ready',
			plan: { ...result.plan, alternatives: [result.plan.recommendation, alternative] }
		});

		await expect
			.element(page.getByRole('region', { name: /supply planner alternatives/i }))
			.toBeVisible();
	});

	it('presents demand, shared claimants, price, capacity, and complete economics', async () => {
		expect.assertions(13);
		const onAction = vi.fn();
		renderPlanner(
			readyResult({
				snapshot: {
					demandContributors: [
						contributor(),
						contributor({
							retailCityId: 'garden-borough',
							potentialDemandPerDay: 5,
							replenishmentCeilingPerDay: 7,
							effectiveDemandPerDay: 5,
							retailImportCostPerUnit: 4
						})
					],
					demandPerDay: 15,
					finishedImportCostPerUnit: 2.67
				},
				baseline: {
					materials: [material({ installedCapacityPerDay: 14, usableCapacityPerDay: 11 })]
				}
			}),
			{ onAction }
		);
		await expect
			.element(
				page
					.getByRole('region', { name: /supply planner evidence/i })
					.getByRole('heading', { name: 'Bottled Water', exact: true })
			)
			.toBeVisible();
		await expect.element(page.getByText(/shared claimants/i)).toBeVisible();
		await expect.element(page.getByText(/retail import price/i)).toBeVisible();
		await expect.element(page.getByText(/installed capacity/i)).toBeVisible();
		await expect.element(page.getByText('Usable capacity', { exact: true })).toBeVisible();
		await expect.element(page.getByText(/net 30-day estimate/i)).toBeVisible();
		await expect.element(page.getByText(/30-day import spend avoided/i)).toBeVisible();
		await expect.element(page.getByText(/30-day operating cost/i)).toBeVisible();
		await expect.element(page.getByText(/30-day input import cost/i)).toBeVisible();
		await expect
			.element(page.getByRole('heading', { name: 'Harbor City', exact: true }))
			.toBeVisible();
		await expect
			.element(page.getByRole('heading', { name: 'Garden Borough', exact: true }))
			.toBeVisible();
		await expect.element(page.getByRole('button', { name: /build water pump/i })).toBeVisible();
		await page.getByRole('button', { name: /build water pump/i }).click();
		expect(onAction).toHaveBeenCalledWith(baseAction);
	});

	it('shows target clamping and forwards category and horizon selections', async () => {
		expect.assertions(3);
		const onSelectProduct = vi.fn();
		const onSelectHorizon = vi.fn();
		renderPlanner(readyResult(), { horizonDays: 7, onSelectProduct, onSelectHorizon });
		await expect
			.element(page.getByText(/replenishment ceiling limits target demand/i))
			.toBeVisible();
		await page.getByRole('combobox', { name: /category/i }).selectOptions('produce');
		expect(onSelectProduct).toHaveBeenCalledWith('produce');
		await page.getByRole('button', { name: /30 days/i }).click();
		expect(onSelectHorizon).toHaveBeenCalledWith(30);
	});

	it('labels rail-only economics as before rail cost and never fabricates a zero rail cost', async () => {
		expect.assertions(4);
		const action: SupplyPlannerAction = {
			kind: 'connect-rail',
			buildingId: 'water-pump-1',
			materialId: 'bottled-water'
		};
		const onAction = vi.fn();
		renderPlanner(
			readyResult({
				baseline: {
					bottleneck: {
						kind: 'rail-disconnected',
						buildingId: 'water-pump-1',
						materialId: 'bottled-water'
					}
				},
				recommendation: {
					action,
					comparison: {
						...baseComparison,
						preRailNetCashBenefit30: null,
						netCashBenefit30: null,
						requiresRailConnection: true
					}
				}
			}),
			{ onAction }
		);
		await expect
			.element(page.getByText('Rail connection required for Water Pump to move Bottled Water.'))
			.toBeVisible();
		await expect.element(page.getByText(/rail cost will be calculated/i)).toBeVisible();
		await expect.element(page.getByText(/net 30-day estimate/i)).not.toBeInTheDocument();
		await page.getByRole('button', { name: /connect rail/i }).click();
		expect(onAction).toHaveBeenCalledWith(action);
	});

	it('explains structural prerequisites without showing an ROI estimate', async () => {
		expect.assertions(3);
		renderPlanner(
			readyResult({
				recommendation: {
					comparison: {
						...baseComparison,
						preRailNetCashBenefit30: null,
						netCashBenefit30: null,
						requiresAdditionalProducerBuilds: true
					}
				}
			})
		);
		await expect
			.element(
				page.getByText(
					'Structural prerequisite — ROI unavailable until remaining producer stages exist'
				)
			)
			.toBeVisible();
		await expect.element(page.getByText(/net 30-day estimate/i)).not.toBeInTheDocument();
		await expect.element(page.getByText(/before rail cost/i)).not.toBeInTheDocument();
	});

	it('shows warehouse bottleneck evidence and sends warehouse actions', async () => {
		expect.assertions(3);
		const action: SupplyPlannerAction = {
			kind: 'build-warehouse',
			cityId: 'industry-city',
			buildingTypeId: 'warehouse',
			cost: 900
		};
		const onAction = vi.fn();
		renderPlanner(
			readyResult({
				baseline: {
					warehouse: { capacity: 200, used: 260, freeCapacity: 0, overflowUnits: 60 },
					bottleneck: { kind: 'warehouse-capacity', overflowUnits: 60, freeCapacity: 0 }
				},
				recommendation: { action, comparison: { ...baseComparison, warehouseFreeGain: 200 } }
			}),
			{ onAction }
		);
		await expect.element(page.getByText(/warehouse capacity bottleneck/i)).toBeVisible();
		await expect.element(page.getByText('260 used of 200; 0 free capacity.')).toBeVisible();
		await page.getByRole('button', { name: /build warehouse/i }).click();
		expect(onAction).toHaveBeenCalledWith(action);
	});

	it('shows the remote-origin trace limitation from planner output', async () => {
		expect.assertions(2);
		renderPlanner(
			readyResult({
				baseline: {
					limitations: [{ kind: 'remote-origin-production-not-modeled', routeIds: ['route-1'] }],
					bottleneck: { kind: 'none' }
				},
				recommendation: {
					action: { kind: 'none', reason: 'no-feasible-action' },
					comparison: { ...baseComparison, netCashBenefit30: null, preRailNetCashBenefit30: null }
				}
			})
		);
		await expect.element(page.getByText(/remote-origin production is not modeled/i)).toBeVisible();
		await expect
			.element(
				page
					.getByRole('region', { name: /supply planner recommendation/i })
					.getByRole('heading', { name: 'No action is recommended', exact: true })
			)
			.toBeVisible();
	});

	it('shows a no-demand no-op', async () => {
		expect.assertions(2);
		renderPlanner(
			readyResult({
				snapshot: { demandPerDay: 0 },
				baseline: {
					limitations: [],
					bottleneck: { kind: 'none' }
				},
				recommendation: {
					action: { kind: 'none', reason: 'no-demand' },
					comparison: { ...baseComparison, netCashBenefit30: null, preRailNetCashBenefit30: null }
				}
			})
		);
		await expect.element(page.getByText(/no demand to plan/i)).toBeVisible();
		await expect
			.element(
				page
					.getByRole('region', { name: /supply planner recommendation/i })
					.getByRole('heading', { name: 'No action is recommended', exact: true })
			)
			.toBeVisible();
	});

	it('shows current logistics inventory and route forecast evidence', async () => {
		expect.assertions(7);
		const logistics = logisticsSnapshot({
			inTransitInventory: [
				{
					destinationCityId: 'industry-city',
					materialId: 'bottled-water',
					quantity: 7,
					orderIds: ['transfer-1'],
					earliestArrivalOnDay: 14
				}
			]
		});
		renderPlanner(
			readyResult({
				snapshot: { logistics },
				baseline: {
					routeForecasts: [routeForecast({ projectedCondition: 'origin-stock-constrained' })]
				}
			})
		);

		const evidence = page.getByRole('region', { name: /logistics forecast evidence/i });
		await expect.element(evidence.getByText('220 / 400', { exact: true })).toBeVisible();
		await expect.element(evidence.getByText(/current in-transit inventory/i)).toBeVisible();
		await expect
			.element(evidence.getByText(/7 Bottled Water to Industry City; earliest arrival day 14/i))
			.toBeVisible();
		await expect
			.element(evidence.getByText(/breadbasket basin.*industry city.*bottled water/i))
			.toBeVisible();
		await expect.element(evidence.getByText(/next dispatch: day 13/i)).toBeVisible();
		await expect
			.element(
				evidence.getByText(/7-day delivery: 5; 30-day delivery: 20; 30-day transport cost: [$]60/i)
			)
			.toBeVisible();
		await expect.element(evidence.getByText(/condition: origin stock constrained/i)).toBeVisible();
	});

	const routeConditions: readonly (readonly [SupplyPlannerRouteCondition, string])[] = [
		['awaiting-dispatch', 'Awaiting dispatch'],
		['normal', 'Normal'],
		['destination-full', 'Destination full'],
		['origin-stock-constrained', 'Origin stock constrained'],
		['route-capacity-constrained', 'Route capacity constrained'],
		['route-event-suspended', 'Suspended by event'],
		['route-priority-constrained', 'Route priority constrained'],
		['route-frequency', 'Route frequency constrained'],
		['route-lead-time', 'Route lead time constrained'],
		['route-paused', 'Route paused']
	];

	it.each(routeConditions)('renders the %s route condition', async (condition, label) => {
		renderPlanner(
			readyResult({
				snapshot: { logistics: logisticsSnapshot() },
				baseline: { routeForecasts: [routeForecast({ projectedCondition: condition })] }
			})
		);

		await expect.element(page.getByText(`Condition: ${label}.`, { exact: true })).toBeVisible();
	});

	it('shows the supply-city empty state when only unrelated route forecasts are present', async () => {
		expect.assertions(2);
		renderPlanner(
			readyResult({
				snapshot: { logistics: logisticsSnapshot() },
				baseline: {
					routeForecasts: [
						routeForecast({
							route: {
								id: 'route-unrelated',
								originCityId: 'harbor-city',
								destinationCityId: 'garden-borough',
								materialId: 'bottled-water',
								capacity: 8,
								frequencyDays: 1,
								leadTimeDays: 2,
								transportCostPerUnit: 3,
								priority: 0,
								state: 'active',
								nextDispatchOnDay: 13
							}
						})
					]
				}
			})
		);

		const evidence = page.getByRole('region', { name: /logistics forecast evidence/i });
		await expect
			.element(evidence.getByText(/no route forecasts affect this supply city/i))
			.toBeVisible();
		await expect
			.element(evidence.getByText(/harbor city.*garden borough.*bottled water/i))
			.not.toBeInTheDocument();
	});

	it('renders only the relevant inbound route when an unrelated route is also present', async () => {
		expect.assertions(3);
		renderPlanner(
			readyResult({
				snapshot: { logistics: logisticsSnapshot() },
				baseline: {
					routeForecasts: [
						routeForecast(),
						routeForecast({
							route: {
								id: 'route-unrelated',
								originCityId: 'harbor-city',
								destinationCityId: 'garden-borough',
								materialId: 'bottled-water',
								capacity: 8,
								frequencyDays: 1,
								leadTimeDays: 2,
								transportCostPerUnit: 3,
								priority: 0,
								state: 'active',
								nextDispatchOnDay: 13
							}
						}),
						// A second relevant route that touches the supply
						// city (industry-city) but carries a different
						// material. It must still appear, proving the
						// forecast filter is keyed on city relevance, not
						// on matching the finished material.
						routeForecast({
							route: {
								id: 'route-flour-inbound',
								originCityId: 'industry-city',
								destinationCityId: 'harbor-city',
								materialId: 'flour',
								capacity: 6,
								frequencyDays: 1,
								leadTimeDays: 2,
								transportCostPerUnit: 3,
								priority: 0,
								state: 'active',
								nextDispatchOnDay: 14
							}
						})
					]
				}
			})
		);

		const evidence = page.getByRole('region', { name: /logistics forecast evidence/i });
		await expect
			.element(evidence.getByText(/breadbasket basin.*industry city.*bottled water/i))
			.toBeVisible();
		await expect.element(evidence.getByText(/industry city.*harbor city.*flour/i)).toBeVisible();
		await expect
			.element(evidence.getByText(/harbor city.*garden borough.*bottled water/i))
			.not.toBeInTheDocument();
	});

	it('renders an outbound route whose origin matches the configured supply city', async () => {
		expect.assertions(1);
		renderPlanner(
			readyResult({
				snapshot: { logistics: logisticsSnapshot() },
				baseline: {
					routeForecasts: [
						routeForecast({
							route: {
								id: 'route-outbound',
								originCityId: 'industry-city',
								destinationCityId: 'harbor-city',
								materialId: 'bottled-water',
								capacity: 8,
								frequencyDays: 1,
								leadTimeDays: 2,
								transportCostPerUnit: 3,
								priority: 0,
								state: 'active',
								nextDispatchOnDay: 13
							}
						})
					]
				}
			})
		);

		const evidence = page.getByRole('region', { name: /logistics forecast evidence/i });
		await expect
			.element(evidence.getByText(/industry city.*harbor city.*bottled water/i))
			.toBeVisible();
	});

	const logisticsCauseCases: readonly {
		cause: SupplyLogisticsBottleneck;
		action: SupplyPlannerAction;
		actionLabel: string;
		causeLabel: string;
	}[] = [
		{
			cause: {
				kind: 'destination-full',
				routeId: 'route-1',
				cityId: 'industry-city',
				materialId: 'bottled-water',
				day: 12,
				blockedUnits: 8,
				amount: 8
			},
			action: {
				kind: 'build-warehouse',
				cityId: 'industry-city',
				buildingTypeId: 'warehouse',
				cost: 500
			},
			actionLabel: 'Build warehouse in Industry City',
			causeLabel: 'Industry City has no logistics-visible warehouse capacity for 8 units.'
		},
		{
			cause: {
				kind: 'origin-stock-constrained',
				routeId: 'route-1',
				cityId: 'industry-city',
				materialId: 'bottled-water',
				day: 12,
				deficitUnits: 3,
				amount: 3
			},
			action: { kind: 'edit-route', routeId: 'route-1', field: 'capacity', from: 8, to: 10 },
			actionLabel: 'Edit route route-1: capacity 8 → 10',
			causeLabel: 'Route route-1 is constrained by 3 units of origin stock.'
		},
		{
			cause: {
				kind: 'route-capacity-constrained',
				routeId: 'route-1',
				cityId: 'industry-city',
				materialId: 'bottled-water',
				day: 12,
				unmetUnits: 4,
				amount: 4
			},
			action: { kind: 'edit-route', routeId: 'route-1', field: 'capacity', from: 8, to: 12 },
			actionLabel: 'Edit route route-1: capacity 8 → 12',
			causeLabel: 'Route route-1 has 4 units beyond its capacity.'
		},
		{
			cause: {
				kind: 'route-priority-constrained',
				routeId: 'route-1',
				blockingRouteId: 'route-0',
				cityId: 'industry-city',
				materialId: 'bottled-water',
				day: 12,
				blockedUnits: 2,
				amount: 2
			},
			action: { kind: 'edit-route', routeId: 'route-1', field: 'priority', from: 2, to: 0 },
			actionLabel: 'Edit route route-1: priority 2 → 0',
			causeLabel: 'Route route-1 is constrained by priority behind route route-0.'
		},
		{
			cause: {
				kind: 'route-frequency',
				routeId: 'route-1',
				cityId: 'industry-city',
				materialId: 'bottled-water',
				day: 12,
				stockoutDay: 3,
				nextArrivalDay: 18,
				amount: 2
			},
			action: { kind: 'edit-route', routeId: 'route-1', field: 'frequencyDays', from: 3, to: 2 },
			actionLabel: 'Edit route route-1: frequency 3 → 2',
			causeLabel: 'Route route-1 cannot arrive before day 18.'
		},
		{
			cause: {
				kind: 'route-lead-time',
				routeId: 'route-1',
				cityId: 'industry-city',
				materialId: 'bottled-water',
				day: 12,
				stockoutDay: 2,
				firstArrivalDay: 16,
				amount: 2
			},
			action: {
				kind: 'create-route',
				input: {
					originCityId: 'breadbasket-basin',
					destinationCityId: 'industry-city',
					materialId: 'bottled-water',
					capacity: 8,
					frequencyDays: 1,
					leadTimeDays: 2,
					transportCostPerUnit: 3,
					priority: 0
				}
			},
			actionLabel: 'Create Bottled Water route: Breadbasket Basin → Industry City',
			causeLabel: 'Route route-1 first arrives on day 16.'
		},
		{
			cause: {
				kind: 'route-paused',
				routeId: 'route-1',
				cityId: 'industry-city',
				materialId: 'bottled-water',
				day: 12,
				blockedUnits: 8,
				amount: 8
			},
			action: { kind: 'resume-route', routeId: 'route-1' },
			actionLabel: 'Resume route route-1',
			causeLabel: 'Route route-1 is paused.'
		},
		{
			cause: {
				kind: 'destination-configuration',
				retailCityId: 'harbor-city',
				supplyCityId: 'industry-city',
				materialId: 'bottled-water',
				day: 12,
				amount: 8
			},
			action: {
				kind: 'change-supply-source',
				retailCityId: 'harbor-city',
				fromSupplyCityId: 'industry-city',
				toSupplyCityId: 'breadbasket-basin'
			},
			actionLabel: 'Use Breadbasket Basin for Harbor City',
			causeLabel:
				'Harbor City is configured to use Industry City; select a better source or add an inbound route.'
		}
	];

	it.each(logisticsCauseCases)(
		'renders the $cause.kind logistics cause and its city-scoped action',
		async ({ cause, action, actionLabel, causeLabel }) => {
			renderPlanner(
				readyResult({
					snapshot: { logistics: logisticsSnapshot() },
					recommendation: { action, logisticsCause: cause }
				})
			);

			await expect
				.element(page.getByRole('heading', { name: actionLabel, exact: true }))
				.toBeVisible();
			await expect.element(page.getByText(causeLabel, { exact: true })).toBeVisible();
		}
	);

	it('compares baseline and candidate delivery and transport forecasts for logistics actions', async () => {
		expect.assertions(1);
		renderPlanner(
			readyResult({
				snapshot: { logistics: logisticsSnapshot() },
				baseline: {
					logisticsMetrics: {
						projectedDeliveredUnits7: 0,
						projectedDeliveredUnits30: 0,
						projectedTransportCost30: 0
					}
				},
				projection: {
					logisticsMetrics: {
						projectedDeliveredUnits7: 5,
						projectedDeliveredUnits30: 20,
						projectedTransportCost30: 60
					}
				},
				recommendation: {
					action: {
						kind: 'create-route',
						input: {
							originCityId: 'breadbasket-basin',
							destinationCityId: 'industry-city',
							materialId: 'bottled-water',
							capacity: 8,
							frequencyDays: 1,
							leadTimeDays: 2,
							transportCostPerUnit: 3,
							priority: 0
						}
					}
				}
			})
		);

		await expect
			.element(
				page.getByText(
					/Logistics forecast, baseline → action: delivered in 7 days 0 → 5; delivered in 30 days 0 → 20; 30-day transport cost [$]0 → [$]60/i
				)
			)
			.toBeVisible();
	});

	it('renders empty, unavailable, unsupported, and invalid planner states', async () => {
		expect.assertions(6);
		renderPlanner({ status: 'empty', reason: 'no-supported-products' });
		await expect.element(page.getByText(/no supported products/i)).toBeVisible();
		renderPlanner({ status: 'unavailable', reason: 'retail-city-unavailable' });
		await expect.element(page.getByText(/retail city is unavailable/i)).toBeVisible();
		renderPlanner({ status: 'unavailable', reason: 'supply-city-unavailable' });
		await expect.element(page.getByText(/supply city is unavailable/i)).toBeVisible();
		renderPlanner({ status: 'unsupported', reason: 'unsupported-category' });
		await expect.element(page.getByText(/category is unsupported/i)).toBeVisible();
		renderPlanner({ status: 'unsupported', reason: 'missing-producer-recipe' });
		await expect.element(page.getByText(/producer recipe is available/i)).toBeVisible();
		renderPlanner({ status: 'invalid', reason: 'invalid-request' });
		await expect.element(page.getByText(/planner request is invalid/i)).toBeVisible();
	});

	it('preserves dialog close, backdrop dismissal, and focus behavior', async () => {
		expect.assertions(5);
		const onClose = vi.fn();
		renderPlanner(readyResult(), { onClose });
		await expect.element(page.getByRole('dialog', { name: /supply advisor/i })).toBeVisible();
		await expect.element(page.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
		await page.getByRole('button', { name: /close supply advisor/i }).click();
		expect(onClose).toHaveBeenCalledTimes(1);
		document.querySelector<HTMLButtonElement>('.backdrop-button')!.click();
		expect(onClose).toHaveBeenCalledTimes(2);
		expect(document.activeElement?.classList.contains('backdrop-button')).toBe(false);
	});
});

describe('SupplyAdvisor bottleneck and noop coverage', () => {
	it('renders production-capacity, inventory-cover, and import-reliance bottleneck text', async () => {
		expect.assertions(3);
		renderPlanner(
			readyResult({
				baseline: {
					bottleneck: {
						kind: 'production-capacity',
						materialId: 'bottled-water',
						deficitPerDay: 5
					}
				}
			})
		);
		await expect
			.element(page.getByText(/production capacity bottleneck for bottled water: 5\/day short/i))
			.toBeVisible();

		renderPlanner(
			readyResult({
				baseline: {
					bottleneck: {
						kind: 'inventory-cover',
						materialId: 'bottled-water',
						stockoutDay: 3
					}
				}
			})
		);
		await expect
			.element(page.getByText(/inventory cover reaches stockout around day 3 for bottled water/i))
			.toBeVisible();

		renderPlanner(
			readyResult({
				baseline: {
					bottleneck: {
						kind: 'import-reliance',
						materialId: 'bottled-water',
						importedUnits30: 200
					}
				}
			})
		);
		await expect
			.element(page.getByText(/import reliance: 200 units of bottled water over 30 days/i))
			.toBeVisible();
	});

	it('renders surplus, unaffordable, ineffective, no-feasible-action, and action-unavailable noop reasons', async () => {
		expect.assertions(5);
		const noopReasons: Array<{ reason: string; pattern: RegExp }> = [
			{ reason: 'surplus', pattern: /supply is already in surplus/i },
			{ reason: 'unaffordable', pattern: /no affordable action is available/i },
			{ reason: 'ineffective', pattern: /no action is projected to improve the plan/i },
			{ reason: 'no-feasible-action', pattern: /no feasible action is available/i },
			{ reason: 'action-unavailable', pattern: /required action is unavailable/i }
		];
		for (const { reason, pattern } of noopReasons) {
			renderPlanner(
				readyResult({
					baseline: { bottleneck: { kind: 'none' } },
					recommendation: {
						action: { kind: 'none', reason: reason as never },
						comparison: { ...baseComparison, netCashBenefit30: null, preRailNetCashBenefit30: null }
					}
				})
			);
			await expect.element(page.getByText(pattern)).toBeVisible();
		}
	});

	it('renders the before-rail economic status when netCashBenefit30 is null but preRail is set', async () => {
		expect.assertions(2);
		renderPlanner(
			readyResult({
				recommendation: {
					comparison: {
						...baseComparison,
						preRailNetCashBenefit30: 120,
						netCashBenefit30: null,
						requiresRailConnection: true
					}
				}
			})
		);
		await expect.element(page.getByText(/before rail cost/i)).toBeVisible();
		await expect.element(page.getByText(/net 30-day estimate/i)).not.toBeInTheDocument();
	});

	it('renders the empty state when result is null', async () => {
		expect.assertions(1);
		renderPlanner(null as never);
		await expect.element(page.getByText(/nothing to plan/i)).toBeVisible();
	});

	it('renders alternative candidate status labels and after-rail projection annotation', async () => {
		expect.assertions(3);
		const result = readyResult();
		if (result.status !== 'ready') throw new Error('Expected ready planner result');
		const unaffordableCandidate: SupplyPlannerCandidate = {
			...result.plan.recommendation,
			action: {
				kind: 'build-producer',
				materialId: 'bottled-water',
				buildingTypeId: 'water-bottler',
				cost: 500
			},
			affordable: false,
			feasible: true,
			potentialProjectionAfterRail: {} as never
		};
		renderPlanner({
			status: 'ready',
			plan: { ...result.plan, alternatives: [result.plan.recommendation, unaffordableCandidate] }
		});
		await expect.element(page.getByText(/unaffordable at current cash/i)).toBeVisible();
		await expect
			.element(page.getByText(/potential projection shown only after rail connection/i))
			.toBeVisible();
		await expect
			.element(page.getByRole('region', { name: /supply planner alternatives/i }))
			.toBeVisible();
	});

	it('renders missing-producer and rail-disconnected bottleneck text', async () => {
		expect.assertions(2);
		renderPlanner(
			readyResult({
				baseline: {
					bottleneck: {
						kind: 'missing-producer',
						materialId: 'grain',
						chainDepth: 2
					}
				}
			})
		);
		await expect.element(page.getByText(/missing producer for grain/i)).toBeVisible();

		renderPlanner(
			readyResult({
				snapshot: {
					buildings: [
						{ id: 'water-pump-1', cityId: 'industry-city', typeId: 'water-pump', level: 1 },
						{ id: 'water-bottler-1', cityId: 'industry-city', typeId: 'water-bottler', level: 1 }
					]
				},
				baseline: {
					bottleneck: {
						kind: 'rail-disconnected',
						buildingId: 'water-bottler-1',
						materialId: 'bottled-water'
					}
				}
			})
		);
		await expect
			.element(page.getByText(/rail connection required for water bottler to move bottled water/i))
			.toBeVisible();
	});
});

describe('SupplyAdvisor branch coverage', () => {
	it('falls back to buildingId when a connect-rail action references a missing building', async () => {
		// Covers the false branch of the buildingName ternary (line 68):
		// building not found in snapshot → return buildingId.
		expect.assertions(1);
		const action: SupplyPlannerAction = {
			kind: 'connect-rail',
			buildingId: 'missing-building-id',
			materialId: 'bottled-water'
		};
		renderPlanner(
			readyResult({
				baseline: {
					bottleneck: {
						kind: 'rail-disconnected',
						buildingId: 'missing-building-id',
						materialId: 'bottled-water'
					}
				},
				recommendation: {
					action,
					comparison: {
						...baseComparison,
						preRailNetCashBenefit30: null,
						netCashBenefit30: null,
						requiresRailConnection: true
					}
				}
			})
		);
		await expect
			.element(page.getByText(/rail connection required for missing-building-id/i))
			.toBeVisible();
	});

	it('disables the action button for an unaffordable recommendation and does not dispatch', async () => {
		// Covers the false branch of dispatchAction's guard (line 257):
		// actionDisabled returns true → onAction is not called.
		expect.assertions(2);
		const onAction = vi.fn();
		renderPlanner(
			readyResult({
				recommendation: {
					affordable: false,
					feasible: true
				}
			}),
			{ onAction }
		);
		const button = page.getByRole('button', { name: /build water pump/i });
		await expect.element(button).toBeDisabled();
		// Playwright won't click a disabled button, so verify the disabled state
		// prevents dispatch by checking onAction was never called.
		expect(onAction).not.toHaveBeenCalled();
	});

	it('renders comparisonStatus as unavailable when both cash benefit fields are null', async () => {
		// Covers the fallback return in comparisonStatus (line 223):
		// requiresAdditionalProducerBuilds=false, netCashBenefit30=null,
		// preRailNetCashBenefit30=null → "unavailable" text.
		expect.assertions(1);
		renderPlanner(
			readyResult({
				recommendation: {
					comparison: {
						...baseComparison,
						preRailNetCashBenefit30: null,
						netCashBenefit30: null,
						requiresRailConnection: false,
						requiresAdditionalProducerBuilds: false
					}
				}
			})
		);
		await expect.element(page.getByText(/ROI estimate unavailable/i)).toBeVisible();
	});

	it('hides forecast and shortage reduction when projection has no matching material', async () => {
		// Covers the false branches of projectionTarget checks (lines 540, 561):
		// projectionTarget returns undefined when the projection's materials
		// don't include the finished material.
		expect.assertions(2);
		renderPlanner(
			readyResult({
				projection: {
					materials: []
				}
			})
		);
		await expect.element(page.getByText(/forecast outcome/i)).not.toBeInTheDocument();
		await expect.element(page.getByText(/30-day shortage reduction/i)).not.toBeInTheDocument();
	});

	it('renders an infeasible alternative candidate status', async () => {
		// Covers the {:else if !candidate.feasible} branch (line 593)
		// in the alternatives candidate status.
		expect.assertions(2);
		const result = readyResult();
		if (result.status !== 'ready') throw new Error('Expected ready planner result');
		const infeasibleCandidate: SupplyPlannerCandidate = {
			...result.plan.recommendation,
			action: {
				kind: 'build-producer',
				materialId: 'bottled-water',
				buildingTypeId: 'water-bottler',
				cost: 500
			},
			affordable: true,
			feasible: false
		};
		renderPlanner({
			status: 'ready',
			plan: {
				...result.plan,
				alternatives: [result.plan.recommendation, infeasibleCandidate]
			}
		});
		await expect.element(page.getByText(/No feasible placement/i)).toBeVisible();
		await expect
			.element(page.getByRole('region', { name: /supply planner alternatives/i }))
			.toBeVisible();
	});

	it('hides alternative forecast when candidate projection has no matching material', async () => {
		// Covers the false branch of candidateTarget && candidateBaselineTarget
		// (line 597) in the alternatives section.
		expect.assertions(2);
		const result = readyResult();
		if (result.status !== 'ready') throw new Error('Expected ready planner result');
		const noTargetCandidate: SupplyPlannerCandidate = {
			...result.plan.recommendation,
			action: {
				kind: 'build-producer',
				materialId: 'bottled-water',
				buildingTypeId: 'water-bottler',
				cost: 500
			},
			projection: { ...result.plan.baseline, materials: [] }
		};
		renderPlanner({
			status: 'ready',
			plan: {
				...result.plan,
				alternatives: [result.plan.recommendation, noTargetCandidate]
			}
		});
		await expect
			.element(page.getByRole('region', { name: /supply planner alternatives/i }))
			.toBeVisible();
		// The alternative candidate should not have a forecast outcome paragraph
		const alternativesRegion = page.getByRole('region', {
			name: /supply planner alternatives/i
		});
		await expect.element(alternativesRegion.getByText(/forecast outcome/i)).not.toBeInTheDocument();
	});

	it('renders the product selector with no options when productIds is empty', async () => {
		// Covers the false branch of the productIds.length > 0 check:
		// when productIds is empty, the select element is not rendered.
		expect.assertions(1);
		renderPlanner(readyResult(), { productIds: [], selectedProductId: null });
		await expect.element(page.getByRole('combobox', { name: /category/i })).not.toBeInTheDocument();
	});
});

describe('SupplyAdvisor selection and action dispatch', () => {
	it('renders with null selectedProductId to exercise the nullish coalescing branch', async () => {
		expect.assertions(1);
		renderPlanner(readyResult(), { selectedProductId: null });
		// The select should render with an empty value due to `selectedProductId ?? ''`.
		await expect.element(page.getByRole('combobox', { name: /category/i })).toBeInTheDocument();
	});

	it('dispatches action when clicking an enabled recommendation', async () => {
		// An enabled build-producer recommendation should call onAction when clicked.
		expect.assertions(1);
		const onAction = vi.fn();
		renderPlanner(readyResult(), { onAction });
		const button = page.getByRole('button', { name: /build water pump/i });
		await button.click();
		expect(onAction).toHaveBeenCalledOnce();
	});

	it('calls onSelectProduct when the product select changes', async () => {
		// Changing the product select calls onSelectProduct with the selected ProductId.
		expect.assertions(1);
		const onSelectProduct = vi.fn();
		renderPlanner(readyResult(), {
			productIds: ['bottled-water', 'produce'],
			selectedProductId: 'bottled-water',
			onSelectProduct
		});
		const select = page.getByRole('combobox', { name: /category/i });
		await select.selectOptions('produce');
		expect(onSelectProduct).toHaveBeenCalledWith('produce');
	});

	it('renders a city-scoped build-warehouse action label', async () => {
		expect.assertions(1);
		const result = readyResult();
		if (result.status !== 'ready') throw new Error('Expected ready planner result');
		const warehouseCandidate: SupplyPlannerCandidate = {
			...result.plan.recommendation,
			action: {
				kind: 'build-warehouse',
				cityId: 'industry-city',
				buildingTypeId: 'warehouse',
				cost: 500
			},
			affordable: true,
			feasible: true
		};
		renderPlanner({
			status: 'ready',
			plan: {
				...result.plan,
				recommendation: warehouseCandidate,
				alternatives: [warehouseCandidate]
			}
		});
		await expect.element(page.getByRole('heading', { name: /build warehouse/i })).toBeVisible();
	});

	it('renders not-available text for null daysOfCover and projectedStockoutDay', async () => {
		// Exercises formatNullableNumber(null) (L50-52): when a forecast
		// metric is null, the localized "not available" text is rendered
		// instead of a formatted number.
		expect.assertions(2);
		const nullHorizon = horizon(30, {
			daysOfCover: null,
			projectedStockoutDay: null
		});
		renderPlanner(
			readyResult({
				baseline: {
					materials: [
						material({
							daysOfCover: null,
							projectedStockoutDay: null,
							sevenDay: horizon(7, {
								daysOfCover: null,
								projectedStockoutDay: null
							}),
							thirtyDay: nullHorizon
						})
					]
				}
			}),
			{ horizonDays: 30 }
		);
		const notAvailable = i18n.t('supplyAdvisor.metrics.notAvailable');
		// Both daysOfCover and projectedStockoutDay should render the
		// not-available text. They appear in the baseline forecast section.
		const ddElements = page.getByText(notAvailable, { exact: true });
		await expect.element(ddElements.first()).toBeVisible();
		await expect.element(ddElements.nth(1)).toBeVisible();
	});

	it('does not call onSelectProduct when the select value does not match any product', async () => {
		expect.assertions(1);
		const onSelectProduct = vi.fn();
		renderPlanner(readyResult(), {
			productIds: ['bottled-water', 'produce'],
			selectedProductId: 'bottled-water',
			onSelectProduct
		});
		const selectEl = document.querySelector<HTMLSelectElement>('#supply-advisor-category')!;
		selectEl.value = 'nonexistent-product';
		selectEl.dispatchEvent(new Event('change', { bubbles: true }));
		expect(onSelectProduct).not.toHaveBeenCalled();
	});

	it('renders the select with an empty value when selectedProductId is null', async () => {
		expect.assertions(1);
		renderPlanner(readyResult(), { selectedProductId: null });
		const selectEl = document.querySelector<HTMLSelectElement>('#supply-advisor-category')!;
		expect(selectEl.value).toBe('');
	});

	it('renders an option element for each product ID in the selector', async () => {
		expect.assertions(1);
		renderPlanner(readyResult(), {
			productIds: ['bottled-water', 'produce'],
			selectedProductId: 'bottled-water'
		});
		const selectEl = document.querySelector<HTMLSelectElement>('#supply-advisor-category')!;
		expect(selectEl.options.length).toBe(2);
	});
});
