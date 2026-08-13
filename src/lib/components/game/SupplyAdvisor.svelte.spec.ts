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
	SupplyPlannerHorizonDays,
	SupplyPlannerSnapshot
} from '$lib/game/supplyPlanner';
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
	activeOutboundRouteIds: [],
	reachableDemandByMaterial: {},
	reachableDemandByBuildingAndMaterial: {},
	reachableBranchesByBuildingAndMaterial: {}
};

const baseComparison: SupplyPlannerComparison = {
	shortageReduction7: 14,
	shortageReduction30: 60,
	importReduction30: 60,
	importSpendReduction30: 120,
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
		categoryIds?: readonly string[];
		selectedCategoryId?: string | null;
		horizonDays?: SupplyPlannerHorizonDays;
		i18n?: I18nBundle;
		onSelectCategory?: (categoryId: string) => void;
		onSelectHorizon?: (days: SupplyPlannerHorizonDays) => void;
		onAction?: (action: SupplyPlannerAction) => void;
		onClose?: () => void;
	} = {}
) {
	return render(SupplyAdvisor, {
		result,
		categoryIds: options.categoryIds ?? ['bottled-water', 'produce'],
		selectedCategoryId: options.selectedCategoryId ?? 'bottled-water',
		horizonDays: options.horizonDays ?? 30,
		i18n: options.i18n ?? i18n,
		onSelectCategory: options.onSelectCategory ?? vi.fn(),
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
		await expect.element(page.getByText(/supply city/i)).toBeVisible();
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
		const onSelectCategory = vi.fn();
		const onSelectHorizon = vi.fn();
		renderPlanner(readyResult(), { horizonDays: 7, onSelectCategory, onSelectHorizon });
		await expect
			.element(page.getByText(/replenishment ceiling limits target demand/i))
			.toBeVisible();
		await page.getByRole('combobox', { name: /category/i }).selectOptions('produce');
		expect(onSelectCategory).toHaveBeenCalledWith('produce');
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

	it('shows the active-logistics no-op reason from planner output', async () => {
		expect.assertions(3);
		renderPlanner(
			readyResult({
				snapshot: { activeOutboundRouteIds: ['route-1'] },
				baseline: {
					limitations: [{ kind: 'active-logistics-not-modeled', routeIds: ['route-1'] }],
					bottleneck: { kind: 'none' }
				},
				recommendation: {
					action: { kind: 'none', reason: 'logistics-contention-not-modeled' },
					comparison: { ...baseComparison, netCashBenefit30: null, preRailNetCashBenefit30: null }
				}
			})
		);
		await expect.element(page.getByText(/active logistics are not modeled/i)).toBeVisible();
		await expect
			.element(page.getByText(/active logistics contention is not modeled/i))
			.toBeVisible();
		await expect
			.element(
				page
					.getByRole('region', { name: /supply planner recommendation/i })
					.getByRole('heading', { name: 'No action is recommended', exact: true })
			)
			.toBeVisible();
	});

	it('shows a no-demand no-op when no active logistics are present', async () => {
		expect.assertions(2);
		renderPlanner(
			readyResult({
				snapshot: { demandPerDay: 0, activeOutboundRouteIds: [] },
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

	it('renders the category selector with no options when categoryIds is empty', async () => {
		// Covers the false branch of the categoryIds.length > 0 check (line 291):
		// when categoryIds is empty, the select element is not rendered.
		expect.assertions(1);
		renderPlanner(readyResult(), { categoryIds: [], selectedCategoryId: null });
		await expect.element(page.getByRole('combobox', { name: /category/i })).not.toBeInTheDocument();
	});
});

describe('SupplyAdvisor branch coverage', () => {
	it('renders with null selectedCategoryId to exercise the nullish coalescing branch', async () => {
		expect.assertions(1);
		renderPlanner(readyResult(), { selectedCategoryId: null });
		// The select should render with an empty value due to `selectedCategoryId ?? ''`.
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

	it('calls onSelectCategory when the category select changes', async () => {
		// Exercises selectCategory (L247-249): changing the select value
		// calls onSelectCategory with the new value.
		expect.assertions(1);
		const onSelectCategory = vi.fn();
		renderPlanner(readyResult(), {
			categoryIds: ['bottled-water', 'produce'],
			selectedCategoryId: 'bottled-water',
			onSelectCategory
		});
		const select = page.getByRole('combobox', { name: /category/i });
		await select.selectOptions('produce');
		expect(onSelectCategory).toHaveBeenCalledWith('produce');
	});

	it('renders a build-warehouse action label without calling actionBuildingName', async () => {
		// Exercises the build-warehouse branch of actionLabel (L96-97):
		// actionBuildingName is not called for build-warehouse, so the
		// label is the simple buildWarehouse translation.
		expect.assertions(1);
		const result = readyResult();
		if (result.status !== 'ready') throw new Error('Expected ready planner result');
		const warehouseCandidate: SupplyPlannerCandidate = {
			...result.plan.recommendation,
			action: { kind: 'build-warehouse', buildingTypeId: 'warehouse', cost: 500 },
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
});
