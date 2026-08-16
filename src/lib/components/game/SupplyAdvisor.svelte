<script lang="ts">
	import { focusTrap } from '$lib/a11y/focusTrap';
	import { actionKey } from '$lib/game/supplyPlannerActions';
	import type {
		SupplyPlannerAction,
		SupplyPlannerCandidate,
		SupplyPlannerResult,
		SupplyPlannerComparison,
		SupplyPlanProjection
	} from '$lib/game/supplyPlannerActions';
	import type {
		SupplyBottleneck,
		SupplyLogisticsBottleneck,
		SupplyMaterialProjection,
		SupplyPlannerHorizonDays,
		SupplyPlannerRouteCondition,
		SupplyPlannerTraceLimitation,
		SupplyPlannerSnapshot
	} from '$lib/game/supplyPlanner';
	import type { I18nBundle } from '$lib/i18n';

	interface Props {
		result: SupplyPlannerResult | null;
		categoryIds: readonly string[];
		selectedCategoryId: string | null;
		horizonDays: SupplyPlannerHorizonDays;
		i18n: I18nBundle;
		onSelectCategory: (categoryId: string) => void;
		onSelectHorizon: (days: SupplyPlannerHorizonDays) => void;
		onAction: (action: SupplyPlannerAction) => void;
		onClose: () => void;
	}

	let {
		result,
		categoryIds,
		selectedCategoryId,
		horizonDays,
		i18n,
		onSelectCategory,
		onSelectHorizon,
		onAction,
		onClose
	}: Props = $props();

	const horizonOptions = [7, 30] as const satisfies readonly SupplyPlannerHorizonDays[];

	function formatNumber(value: number): string {
		return i18n.format.decimal(value);
	}

	function formatNullableNumber(value: number | null): string {
		return value === null ? i18n.t('supplyAdvisor.metrics.notAvailable') : formatNumber(value);
	}

	function formatInteger(value: number): string {
		return i18n.format.integer(value);
	}

	function formatCurrency(value: number): string {
		return i18n.format.currency(value);
	}

	function materialName(materialId: string): string {
		return i18n.labels.material(materialId);
	}

	function buildingName(snapshot: SupplyPlannerSnapshot, buildingId: string): string {
		const building = snapshot.buildings.find((candidate) => candidate.id === buildingId);
		return building ? i18n.labels.industrialBuilding(building.typeId) : buildingId;
	}

	function actionLabel(action: SupplyPlannerAction, snapshot: SupplyPlannerSnapshot): string {
		switch (action.kind) {
			case 'build-producer':
				return i18n.t('supplyAdvisor.actions.buildProducer', {
					buildingName: i18n.labels.industrialBuilding(action.buildingTypeId),
					materialName: materialName(action.materialId)
				});
			case 'upgrade-building':
				return i18n.t('supplyAdvisor.actions.upgradeBuilding', {
					buildingName: buildingName(snapshot, action.buildingId),
					level: action.toLevel
				});
			case 'build-warehouse':
				return i18n.t('supplyAdvisor.actions.buildWarehouse', {
					cityName: i18n.labels.worldCity(action.cityId).name
				});
			case 'connect-rail':
				return i18n.t('supplyAdvisor.actions.connectRail', {
					materialName: materialName(action.materialId)
				});
			case 'create-route':
				return i18n.t('supplyAdvisor.actions.createRoute', {
					materialName: materialName(action.input.materialId),
					originName: i18n.labels.worldCity(action.input.originCityId).name,
					destinationName: i18n.labels.worldCity(action.input.destinationCityId).name
				});
			case 'edit-route':
				return i18n.t('supplyAdvisor.actions.editRoute', {
					routeId: action.routeId,
					fieldName: routeFieldLabel(action.field),
					from: formatInteger(action.from),
					to: formatInteger(action.to)
				});
			case 'resume-route':
				return i18n.t('supplyAdvisor.actions.resumeRoute', { routeId: action.routeId });
			case 'change-supply-source':
				return i18n.t('supplyAdvisor.actions.changeSupplySource', {
					retailCityName: i18n.labels.worldCity(action.retailCityId).name,
					supplyCityName: i18n.labels.worldCity(action.toSupplyCityId).name
				});
			case 'none':
				return i18n.t('supplyAdvisor.actions.noAction');
		}
	}

	function routeFieldLabel(
		field: Extract<SupplyPlannerAction, { kind: 'edit-route' }>['field']
	): string {
		switch (field) {
			case 'capacity':
				return i18n.t('supplyAdvisor.actions.fields.capacity');
			case 'frequencyDays':
				return i18n.t('supplyAdvisor.actions.fields.frequencyDays');
			case 'priority':
				return i18n.t('supplyAdvisor.actions.fields.priority');
		}
	}

	function actionCost(action: SupplyPlannerAction): number | null {
		return 'cost' in action ? action.cost : null;
	}

	function displayedAlternatives(plan: {
		recommendation: SupplyPlannerCandidate;
		alternatives: readonly SupplyPlannerCandidate[];
	}): readonly SupplyPlannerCandidate[] {
		const recommendationIdentity = actionKey(plan.recommendation.action);
		return plan.alternatives.filter(
			(candidate) => actionKey(candidate.action) !== recommendationIdentity
		);
	}

	function actionDisabled(candidate: SupplyPlannerCandidate): boolean {
		return candidate.action.kind === 'none' || !candidate.affordable || !candidate.feasible;
	}

	function bottleneckText(bottleneck: SupplyBottleneck, snapshot: SupplyPlannerSnapshot): string {
		switch (bottleneck.kind) {
			case 'missing-producer':
				return i18n.t('supplyAdvisor.bottlenecks.missingProducer', {
					materialName: materialName(bottleneck.materialId)
				});
			case 'warehouse-capacity':
				return i18n.t('supplyAdvisor.bottlenecks.warehouseCapacity', {
					overflow: formatNumber(bottleneck.overflowUnits),
					freeCapacity: formatNumber(bottleneck.freeCapacity)
				});
			case 'rail-disconnected':
				return i18n.t('supplyAdvisor.bottlenecks.railDisconnected', {
					buildingName: buildingName(snapshot, bottleneck.buildingId),
					materialName: materialName(bottleneck.materialId)
				});
			case 'production-capacity':
				return i18n.t('supplyAdvisor.bottlenecks.productionCapacity', {
					materialName: materialName(bottleneck.materialId),
					deficit: formatNumber(bottleneck.deficitPerDay)
				});
			case 'inventory-cover':
				return i18n.t('supplyAdvisor.bottlenecks.inventoryCover', {
					materialName: materialName(bottleneck.materialId),
					stockoutDay: formatNumber(bottleneck.stockoutDay)
				});
			case 'import-reliance':
				return i18n.t('supplyAdvisor.bottlenecks.importReliance', {
					materialName: materialName(bottleneck.materialId),
					units: formatNumber(bottleneck.importedUnits30)
				});
			case 'none':
				return i18n.t('supplyAdvisor.bottlenecks.none');
		}
	}

	function limitationText(limitation: SupplyPlannerTraceLimitation): string {
		switch (limitation.kind) {
			case 'remote-origin-production-not-modeled':
				return i18n.t('supplyAdvisor.limitations.remoteOriginProduction', {
					routes: i18n.format.list(limitation.routeIds)
				});
			case 'rail-capacity-not-modeled':
				return i18n.t('supplyAdvisor.limitations.railCapacity');
			case 'store-sales-capacity-not-modeled':
				return i18n.t('supplyAdvisor.limitations.storeSalesCapacity');
		}
	}

	function noOpReason(reason: Extract<SupplyPlannerAction, { kind: 'none' }>['reason']): string {
		switch (reason) {
			case 'no-demand':
				return i18n.t('supplyAdvisor.noOpReasons.noDemand');
			case 'surplus':
				return i18n.t('supplyAdvisor.noOpReasons.surplus');
			case 'unaffordable':
				return i18n.t('supplyAdvisor.noOpReasons.unaffordable');
			case 'ineffective':
				return i18n.t('supplyAdvisor.noOpReasons.ineffective');
			case 'no-feasible-action':
				return i18n.t('supplyAdvisor.noOpReasons.noFeasibleAction');
			case 'action-unavailable':
				return i18n.t('supplyAdvisor.noOpReasons.actionUnavailable');
		}
	}

	const ROUTE_CONDITION_MESSAGE_KEY = {
		'awaiting-dispatch': 'supplyAdvisor.logistics.conditions.awaitingDispatch',
		normal: 'supplyAdvisor.logistics.conditions.normal',
		'destination-full': 'supplyAdvisor.logistics.conditions.destinationFull',
		'origin-stock-constrained': 'supplyAdvisor.logistics.conditions.originStockConstrained',
		'route-capacity-constrained': 'supplyAdvisor.logistics.conditions.routeCapacityConstrained',
		'route-event-suspended': 'supplyAdvisor.logistics.conditions.routeEventSuspended',
		'route-priority-constrained': 'supplyAdvisor.logistics.conditions.routePriorityConstrained',
		'route-frequency': 'supplyAdvisor.logistics.conditions.routeFrequency',
		'route-lead-time': 'supplyAdvisor.logistics.conditions.routeLeadTime',
		'route-paused': 'supplyAdvisor.logistics.conditions.routePaused'
	} as const satisfies Record<SupplyPlannerRouteCondition, string>;

	function routeConditionText(condition: SupplyPlannerRouteCondition): string {
		return i18n.t(ROUTE_CONDITION_MESSAGE_KEY[condition]);
	}

	function logisticsCauseText(cause: SupplyLogisticsBottleneck): string {
		switch (cause.kind) {
			case 'destination-full':
				return i18n.t('supplyAdvisor.logistics.causes.destinationFull', {
					cityName: i18n.labels.worldCity(cause.cityId).name,
					units: formatInteger(cause.blockedUnits)
				});
			case 'origin-stock-constrained':
				return i18n.t('supplyAdvisor.logistics.causes.originStockConstrained', {
					routeId: cause.routeId,
					units: formatInteger(cause.deficitUnits)
				});
			case 'route-capacity-constrained':
				return i18n.t('supplyAdvisor.logistics.causes.routeCapacityConstrained', {
					routeId: cause.routeId,
					units: formatInteger(cause.unmetUnits)
				});
			case 'route-priority-constrained':
				return i18n.t('supplyAdvisor.logistics.causes.routePriorityConstrained', {
					routeId: cause.routeId,
					blockingRouteId: cause.blockingRouteId
				});
			case 'route-frequency':
				return i18n.t('supplyAdvisor.logistics.causes.routeFrequency', {
					routeId: cause.routeId,
					nextArrivalDay: formatInteger(cause.nextArrivalDay)
				});
			case 'route-lead-time':
				return i18n.t('supplyAdvisor.logistics.causes.routeLeadTime', {
					routeId: cause.routeId,
					firstArrivalDay: formatInteger(cause.firstArrivalDay)
				});
			case 'route-paused':
				return i18n.t('supplyAdvisor.logistics.causes.routePaused', {
					routeId: cause.routeId
				});
			case 'destination-configuration':
				return i18n.t('supplyAdvisor.logistics.causes.destinationConfiguration', {
					retailCityName: i18n.labels.worldCity(cause.retailCityId).name,
					supplyCityName: i18n.labels.worldCity(cause.supplyCityId).name
				});
		}
	}

	function isLogisticsAction(action: SupplyPlannerAction): boolean {
		return (
			action.kind === 'create-route' ||
			action.kind === 'edit-route' ||
			action.kind === 'resume-route' ||
			action.kind === 'change-supply-source'
		);
	}

	function projectionTarget(
		projection: SupplyPlanProjection,
		snapshot: SupplyPlannerSnapshot
	): SupplyMaterialProjection | undefined {
		return projection.materials.find(
			(material) => material.materialId === snapshot.finishedMaterialId
		);
	}

	function forecastFor(
		material: SupplyMaterialProjection,
		days: SupplyPlannerHorizonDays
	): SupplyMaterialProjection['sevenDay'] {
		return days === 7 ? material.sevenDay : material.thirtyDay;
	}

	function comparisonStatus(comparison: SupplyPlannerComparison): string {
		if (comparison.requiresAdditionalProducerBuilds) {
			return i18n.t('supplyAdvisor.economics.structuralPrerequisite');
		}
		if (comparison.netCashBenefit30 !== null) {
			return i18n.t('supplyAdvisor.economics.netEstimate', {
				value: formatCurrency(comparison.netCashBenefit30)
			});
		}
		if (comparison.preRailNetCashBenefit30 !== null) {
			return i18n.t('supplyAdvisor.economics.beforeRail', {
				value: formatCurrency(comparison.preRailNetCashBenefit30)
			});
		}
		return i18n.t('supplyAdvisor.economics.unavailable');
	}

	function nonReadyText(current: Exclude<SupplyPlannerResult, { status: 'ready' }>): string {
		switch (current.status) {
			case 'empty':
				return i18n.t('supplyAdvisor.states.noSupportedProducts');
			case 'unavailable':
				return i18n.t(
					current.reason === 'retail-city-unavailable'
						? 'supplyAdvisor.states.retailCityUnavailable'
						: 'supplyAdvisor.states.supplyCityUnavailable'
				);
			case 'unsupported':
				return i18n.t(
					current.reason === 'unsupported-category'
						? 'supplyAdvisor.states.unsupportedCategory'
						: 'supplyAdvisor.states.missingProducerRecipe'
				);
			case 'invalid':
				return i18n.t('supplyAdvisor.states.invalidRequest');
		}
	}

	function selectCategory(event: Event): void {
		const value = (event.currentTarget as HTMLSelectElement).value;
		if (value) onSelectCategory(value);
	}

	function selectHorizon(days: SupplyPlannerHorizonDays): void {
		onSelectHorizon(days);
	}

	function dispatchAction(candidate: SupplyPlannerCandidate): void {
		if (!actionDisabled(candidate)) onAction(candidate.action);
	}
</script>

<div class="advisor-backdrop">
	<button
		type="button"
		class="backdrop-button"
		tabindex="-1"
		aria-label={i18n.t('supplyAdvisor.dismiss')}
		onclick={onClose}
	></button>
	<div
		class="advisor paper"
		role="dialog"
		aria-modal="true"
		aria-label={i18n.t('supplyAdvisor.dialog')}
		{@attach focusTrap}
	>
		<header>
			<div>
				<p class="eyebrow">{i18n.t('supplyAdvisor.eyebrow')}</p>
				<h2>{i18n.t('supplyAdvisor.title')}</h2>
			</div>
			<button
				type="button"
				class="btn-danger"
				aria-label={i18n.t('supplyAdvisor.closeLabel')}
				onclick={onClose}>{i18n.t('supplyAdvisor.close')}</button
			>
		</header>

		{#if result !== null}
			<div class="planner-controls">
				{#if categoryIds.length > 0}
					<label for="supply-advisor-category">{i18n.t('supplyAdvisor.category')}</label>
					<select
						id="supply-advisor-category"
						aria-label={i18n.t('supplyAdvisor.category')}
						value={selectedCategoryId ?? ''}
						onchange={selectCategory}
					>
						{#each categoryIds as categoryId (categoryId)}
							<option value={categoryId}>{i18n.labels.productCategory(categoryId)}</option>
						{/each}
					</select>
				{/if}
				<fieldset class="horizon-control">
					<legend>{i18n.t('supplyAdvisor.horizon')}</legend>
					<div class="horizon-options">
						{#each horizonOptions as days (days)}
							<button
								type="button"
								class:active={horizonDays === days}
								aria-pressed={horizonDays === days}
								onclick={() => selectHorizon(days)}
							>
								{i18n.t('supplyAdvisor.horizonDays', { days })}
							</button>
						{/each}
					</div>
				</fieldset>
			</div>

			{#if result.status !== 'ready'}
				<p class="muted state-message">{nonReadyText(result)}</p>
			{:else}
				{@const plan = result.plan}
				{@const snapshot = plan.snapshot}
				{@const recommendation = plan.recommendation}
				{@const alternatives = displayedAlternatives(plan)}
				{@const selectedHorizonLabel = i18n.t('supplyAdvisor.forecastHorizon', {
					days: horizonDays
				})}
				{@const recommendationBaselineTarget = projectionTarget(recommendation.baseline, snapshot)}
				{@const recommendationProjectionTarget = projectionTarget(
					recommendation.projection,
					snapshot
				)}
				{@const inTransitRows = (snapshot.logistics?.inTransitInventory ?? []).filter(
					(row) => row.destinationCityId === snapshot.supplyCityId
				)}
				{@const routeForecasts = (plan.baseline.routeForecasts ?? []).filter(
					(forecast) =>
						forecast.route.originCityId === snapshot.supplyCityId ||
						forecast.route.destinationCityId === snapshot.supplyCityId
				)}
				<section class="evidence overview" aria-label={i18n.t('supplyAdvisor.evidenceLabel')}>
					<div class="section-heading">
						<div>
							<p class="section-kicker">{i18n.t('supplyAdvisor.evidenceKicker')}</p>
							<h3>{materialName(snapshot.finishedMaterialId)}</h3>
						</div>
						<span class="horizon-badge">{selectedHorizonLabel}</span>
					</div>
					<dl class="metric-grid">
						<div>
							<dt>{i18n.t('supplyAdvisor.metrics.demand')}</dt>
							<dd>
								{i18n.t('supplyAdvisor.metrics.perDay', {
									value: formatNumber(snapshot.demandPerDay)
								})}
							</dd>
						</div>
						<div>
							<dt>{i18n.t('supplyAdvisor.metrics.retailImportPrice')}</dt>
							<dd>
								{i18n.t('supplyAdvisor.metrics.perUnit', {
									value: formatCurrency(snapshot.finishedImportCostPerUnit)
								})}
							</dd>
						</div>
						<div>
							<dt>{i18n.t('supplyAdvisor.metrics.logisticsWarehouse')}</dt>
							<dd>
								{formatInteger(snapshot.warehouseUsed)} / {formatInteger(
									snapshot.warehouseCapacity
								)}
							</dd>
						</div>
					</dl>
					<section class="city-context" aria-label={i18n.t('supplyAdvisor.cities.label')}>
						<p>
							{i18n.t('supplyAdvisor.cities.retail', {
								cityName: i18n.labels.worldCity(snapshot.retailCityId).name
							})}
						</p>
						<p>
							{i18n.t('supplyAdvisor.cities.supply', {
								cityName: i18n.labels.worldCity(snapshot.supplyCityId).name
							})}
						</p>
					</section>

					{#if snapshot.demandContributors.length > 1}
						<p class="claimants">
							<strong>{i18n.t('supplyAdvisor.demand.sharedClaimants')}</strong>
							{i18n.format.list(
								snapshot.demandContributors.map(
									(contributor) => i18n.labels.worldCity(contributor.retailCityId).name
								)
							)}
						</p>
					{/if}
					<div class="contributors">
						{#each snapshot.demandContributors as contributor (contributor.retailCityId)}
							{@const cityName = i18n.labels.worldCity(contributor.retailCityId).name}
							<article class="contributor">
								<h4>{cityName}</h4>
								<p>
									{i18n.t('supplyAdvisor.demand.contributor', {
										potential: formatNumber(contributor.potentialDemandPerDay),
										ceiling: formatNumber(contributor.replenishmentCeilingPerDay),
										effective: formatNumber(contributor.effectiveDemandPerDay)
									})}
								</p>
								{#if contributor.effectiveDemandPerDay < contributor.potentialDemandPerDay}
									<p class="annotation">
										{i18n.t('supplyAdvisor.demand.clamp', {
											ceiling: formatNumber(contributor.replenishmentCeilingPerDay)
										})}
									</p>
								{/if}
							</article>
						{/each}
					</div>
				</section>

				<section
					class="evidence capacity-evidence"
					aria-label={i18n.t('supplyAdvisor.capacityLabel')}
				>
					<div class="section-heading">
						<div>
							<p class="section-kicker">{i18n.t('supplyAdvisor.capacityKicker')}</p>
							<h3>{i18n.t('supplyAdvisor.capacityTitle')}</h3>
						</div>
						<p class="bottleneck">{bottleneckText(plan.baseline.bottleneck, snapshot)}</p>
					</div>
					<div class="material-list">
						{#each plan.baseline.materials as row (row.materialId)}
							{@const forecast = forecastFor(row, horizonDays)}
							<article class="material-row">
								<h4>{materialName(row.materialId)}</h4>
								<dl class="metric-grid compact">
									<div>
										<dt>{i18n.t('supplyAdvisor.metrics.buildings')}</dt>
										<dd>{formatInteger(row.buildingCount)}</dd>
									</div>
									<div>
										<dt>{i18n.t('supplyAdvisor.metrics.installedCapacity')}</dt>
										<dd>
											{i18n.t('supplyAdvisor.metrics.perDay', {
												value: formatNumber(row.installedCapacityPerDay)
											})}
										</dd>
									</div>
									<div>
										<dt>{i18n.t('supplyAdvisor.metrics.usableCapacity')}</dt>
										<dd>
											{i18n.t('supplyAdvisor.metrics.perDay', {
												value: formatNumber(row.usableCapacityPerDay)
											})}
										</dd>
									</div>
									<div>
										<dt>{i18n.t('supplyAdvisor.metrics.forecastImports')}</dt>
										<dd>{formatNumber(forecast.importRequiredUnits)}</dd>
									</div>
									<div>
										<dt>{i18n.t('supplyAdvisor.metrics.startingInventory')}</dt>
										<dd>{formatNumber(forecast.startingInventoryUnits)}</dd>
									</div>
									<div>
										<dt>{i18n.t('supplyAdvisor.metrics.endingInventory')}</dt>
										<dd>{formatNumber(forecast.endingInventoryUnits)}</dd>
									</div>
									<div>
										<dt>{i18n.t('supplyAdvisor.metrics.daysOfCover')}</dt>
										<dd>{formatNullableNumber(forecast.daysOfCover)}</dd>
									</div>
									<div>
										<dt>{i18n.t('supplyAdvisor.metrics.projectedStockout')}</dt>
										<dd>{formatNullableNumber(forecast.projectedStockoutDay)}</dd>
									</div>
								</dl>
							</article>
						{/each}
					</div>
					<div class="warehouse-evidence">
						<strong>{i18n.t('supplyAdvisor.warehouse.title')}</strong>
						<span>
							{i18n.t('supplyAdvisor.warehouse.capacity', {
								used: formatNumber(plan.baseline.warehouse.used),
								capacity: formatNumber(plan.baseline.warehouse.capacity),
								freeCapacity: formatNumber(plan.baseline.warehouse.freeCapacity)
							})}
						</span>
					</div>
				</section>

				<section
					class="evidence logistics-evidence"
					aria-label={i18n.t('supplyAdvisor.logistics.label')}
				>
					<div class="section-heading">
						<div>
							<p class="section-kicker">{i18n.t('supplyAdvisor.logistics.kicker')}</p>
							<h3>{i18n.t('supplyAdvisor.logistics.title')}</h3>
						</div>
					</div>
					<dl class="metric-grid compact">
						<div>
							<dt>{i18n.t('supplyAdvisor.logistics.currentWarehouse')}</dt>
							<dd>
								{i18n.t('supplyAdvisor.logistics.warehouseValue', {
									used: formatInteger(snapshot.warehouseUsed),
									capacity: formatInteger(snapshot.warehouseCapacity)
								})}
							</dd>
						</div>
					</dl>
					<div class="logistics-list">
						<h4>{i18n.t('supplyAdvisor.logistics.inTransitTitle')}</h4>
						{#if inTransitRows.length > 0}
							{#each inTransitRows as row (`${row.destinationCityId}-${row.materialId}`)}
								<p>
									{i18n.t('supplyAdvisor.logistics.inTransitRow', {
										quantity: formatInteger(row.quantity),
										materialName: materialName(row.materialId),
										cityName: i18n.labels.worldCity(row.destinationCityId).name,
										day: formatInteger(row.earliestArrivalOnDay)
									})}
								</p>
							{/each}
						{:else}
							<p>{i18n.t('supplyAdvisor.logistics.noInTransit')}</p>
						{/if}
					</div>
					<div class="logistics-list">
						<h4>{i18n.t('supplyAdvisor.logistics.routesTitle')}</h4>
						{#if routeForecasts.length > 0}
							{#each routeForecasts as forecast (forecast.route.id)}
								<article class="route-forecast">
									<h4>
										{i18n.t('supplyAdvisor.logistics.routeTitle', {
											originName: i18n.labels.worldCity(forecast.route.originCityId).name,
											destinationName: i18n.labels.worldCity(forecast.route.destinationCityId).name,
											materialName: materialName(forecast.route.materialId)
										})}
									</h4>
									<p>
										{i18n.t('supplyAdvisor.logistics.nextDispatch', {
											day: formatInteger(forecast.route.nextDispatchOnDay)
										})}
									</p>
									<p>
										{i18n.t('supplyAdvisor.logistics.forecast', {
											delivered7: formatInteger(forecast.projectedDeliveredUnits7),
											delivered30: formatInteger(forecast.projectedDeliveredUnits30),
											transportCost: formatCurrency(forecast.projectedTransportCost30)
										})}
									</p>
									<p>
										{i18n.t('supplyAdvisor.logistics.condition', {
											condition: routeConditionText(forecast.projectedCondition)
										})}
									</p>
								</article>
							{/each}
						{:else}
							<p>{i18n.t('supplyAdvisor.logistics.noRoutes')}</p>
						{/if}
					</div>
				</section>

				{#if plan.baseline.limitations.length > 0}
					<section class="limitations" aria-label={i18n.t('supplyAdvisor.limitationsLabel')}>
						<h3>{i18n.t('supplyAdvisor.limitationsTitle')}</h3>
						<ul>
							{#each plan.baseline.limitations as limitation, limitationIndex (`${limitation.kind}-${limitationIndex}`)}
								<li>{limitationText(limitation)}</li>
							{/each}
						</ul>
					</section>
				{/if}

				<section class="recommendation" aria-label={i18n.t('supplyAdvisor.recommendationLabel')}>
					<div class="section-heading">
						<div>
							<p class="section-kicker">{i18n.t('supplyAdvisor.recommendationKicker')}</p>
							<h3>{i18n.t('supplyAdvisor.recommendationTitle')}</h3>
						</div>
						{#if recommendation.action.kind === 'none'}
							<span class="status-chip">{i18n.t('supplyAdvisor.noOp')}</span>
						{/if}
					</div>
					<div class="candidate recommendation-card">
						<h4>{actionLabel(recommendation.action, snapshot)}</h4>
						{#if recommendation.action.kind === 'none'}
							<p class="annotation">{noOpReason(recommendation.action.reason)}</p>
						{:else}
							{#if recommendation.logisticsCause}
								<p class="annotation">{logisticsCauseText(recommendation.logisticsCause)}</p>
							{/if}
							{@const cost = actionCost(recommendation.action)}
							{#if cost !== null}
								<p>
									{i18n.t('supplyAdvisor.economics.actionCost', { cost: formatCurrency(cost) })}
								</p>
							{:else if recommendation.action.kind === 'connect-rail'}
								<p>{i18n.t('supplyAdvisor.economics.railCostPending')}</p>
							{/if}
							<p>
								{i18n.t('supplyAdvisor.economics.importSavings', {
									value: formatCurrency(recommendation.comparison.importSpendReduction30)
								})}
							</p>
							<p>
								{i18n.t('supplyAdvisor.economics.operatingCost', {
									value: formatCurrency(recommendation.comparison.incrementalOperatingCost30)
								})}
							</p>
							<p>
								{i18n.t('supplyAdvisor.economics.inputImportCost', {
									value: formatCurrency(recommendation.comparison.incrementalInputImportSpend30)
								})}
							</p>
							<p class="economic-state">{comparisonStatus(recommendation.comparison)}</p>
							{#if recommendationBaselineTarget && recommendationProjectionTarget}
								{@const baselineForecast = forecastFor(recommendationBaselineTarget, horizonDays)}
								{@const projectionForecast = forecastFor(
									recommendationProjectionTarget,
									horizonDays
								)}
								<p class="projection-comparison">
									{i18n.t('supplyAdvisor.economics.forecastOutcome', {
										horizon: horizonDays,
										baselineImports: formatNumber(baselineForecast.importRequiredUnits),
										actionImports: formatNumber(projectionForecast.importRequiredUnits),
										baselineCover: formatNullableNumber(baselineForecast.daysOfCover),
										actionCover: formatNullableNumber(projectionForecast.daysOfCover),
										baselineStockout: formatNullableNumber(baselineForecast.projectedStockoutDay),
										actionStockout: formatNullableNumber(projectionForecast.projectedStockoutDay)
									})}
								</p>
							{/if}
							{#if isLogisticsAction(recommendation.action)}
								<p class="projection-comparison">
									{i18n.t('supplyAdvisor.economics.logisticsOutcome', {
										baselineDelivered7: formatInteger(
											recommendation.baseline.logisticsMetrics?.projectedDeliveredUnits7 ?? 0
										),
										actionDelivered7: formatInteger(
											recommendation.projection.logisticsMetrics?.projectedDeliveredUnits7 ?? 0
										),
										baselineDelivered30: formatInteger(
											recommendation.baseline.logisticsMetrics?.projectedDeliveredUnits30 ?? 0
										),
										actionDelivered30: formatInteger(
											recommendation.projection.logisticsMetrics?.projectedDeliveredUnits30 ?? 0
										),
										baselineTransportCost: formatCurrency(
											recommendation.baseline.logisticsMetrics?.projectedTransportCost30 ?? 0
										),
										actionTransportCost: formatCurrency(
											recommendation.projection.logisticsMetrics?.projectedTransportCost30 ?? 0
										)
									})}
								</p>
							{/if}
							{#if recommendation.comparison.requiresRailConnection}
								<p class="annotation">{i18n.t('supplyAdvisor.economics.railRequired')}</p>
							{/if}
							{#if recommendationProjectionTarget}
								<p>
									{i18n.t('supplyAdvisor.economics.shortageReduction', {
										units: formatNumber(recommendation.comparison.shortageReduction30),
										stockoutDays: formatNumber(recommendation.comparison.stockoutImprovementDays)
									})}
								</p>
							{/if}
							<button
								type="button"
								class="build-next"
								disabled={actionDisabled(recommendation)}
								onclick={() => dispatchAction(recommendation)}
							>
								{actionLabel(recommendation.action, snapshot)}
							</button>
						{/if}
					</div>
				</section>

				{#if alternatives.length > 0}
					<section class="alternatives" aria-label={i18n.t('supplyAdvisor.alternativesLabel')}>
						<h3>{i18n.t('supplyAdvisor.alternativesTitle')}</h3>
						<div class="candidate-list">
							{#each alternatives as candidate (actionKey(candidate.action))}
								{@const candidateTarget = projectionTarget(candidate.projection, snapshot)}
								{@const candidateBaselineTarget = projectionTarget(candidate.baseline, snapshot)}
								<article class="candidate">
									<h4>{actionLabel(candidate.action, snapshot)}</h4>
									<p class="candidate-status">
										{#if !candidate.affordable}{i18n.t(
												'supplyAdvisor.candidate.unaffordable'
											)}{:else if !candidate.feasible}{i18n.t(
												'supplyAdvisor.candidate.infeasible'
											)}{:else}{i18n.t('supplyAdvisor.candidate.available')}{/if}
									</p>
									{#if candidateTarget && candidateBaselineTarget}
										{@const candidateForecast = forecastFor(candidateTarget, horizonDays)}
										{@const candidateBaselineForecast = forecastFor(
											candidateBaselineTarget,
											horizonDays
										)}
										<p class="projection-comparison">
											{i18n.t('supplyAdvisor.economics.forecastOutcome', {
												horizon: horizonDays,
												baselineImports: formatNumber(
													candidateBaselineForecast.importRequiredUnits
												),
												actionImports: formatNumber(candidateForecast.importRequiredUnits),
												baselineCover: formatNullableNumber(candidateBaselineForecast.daysOfCover),
												actionCover: formatNullableNumber(candidateForecast.daysOfCover),
												baselineStockout: formatNullableNumber(
													candidateBaselineForecast.projectedStockoutDay
												),
												actionStockout: formatNullableNumber(candidateForecast.projectedStockoutDay)
											})}
										</p>
									{/if}
									{#if candidate.potentialProjectionAfterRail}
										<p class="annotation">
											{i18n.t('supplyAdvisor.economics.afterRailProjection')}
										</p>
									{/if}
								</article>
							{/each}
						</div>
					</section>
				{/if}
			{/if}
		{:else}
			<p class="muted">{i18n.t('supplyAdvisor.empty')}</p>
		{/if}
	</div>
</div>

<style>
	.advisor-backdrop {
		position: fixed;
		inset: 0;
		z-index: 46;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(20, 16, 10, 0.72);
		backdrop-filter: blur(4px);
	}

	.backdrop-button {
		position: absolute;
		inset: 0;
		border: 0;
		background: transparent;
		padding: 0;
	}

	.advisor {
		position: relative;
		z-index: 1;
		width: min(44rem, 100%);
		max-height: calc(100vh - 2rem);
		overflow: auto;
		padding: 1.2rem;
		display: grid;
		gap: 1rem;
	}

	header,
	.section-heading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	header {
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--brass-500);
	}

	h2,
	h3,
	h4 {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 400;
		color: var(--ink-700);
	}

	h2 {
		font-size: 1.5rem;
	}

	h3 {
		font-size: 1.1rem;
	}

	h4 {
		font-size: 0.98rem;
	}

	.planner-controls {
		display: grid;
		grid-template-columns: minmax(10rem, 1fr) auto;
		align-items: end;
		gap: 0.75rem;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--ink-600);
	}

	.planner-controls select {
		min-height: 2.25rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.35rem 0.5rem;
		font: inherit;
		color: var(--ink-700);
	}

	.horizon-control {
		border: 0;
		margin: 0;
		padding: 0;
	}

	.horizon-control legend {
		margin-bottom: 0.25rem;
	}

	.horizon-options {
		display: flex;
		gap: 0.35rem;
	}

	.horizon-options button {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.35rem 0.55rem;
		font: inherit;
		color: var(--ink-600);
	}

	.horizon-options button.active,
	.horizon-options button:focus-visible,
	.horizon-options button:hover {
		border-color: var(--brass-500);
		background: var(--brass-100);
		color: var(--ink-700);
	}

	.evidence,
	.recommendation,
	.alternatives,
	.limitations {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.85rem;
		display: grid;
		gap: 0.75rem;
	}

	.section-kicker,
	.eyebrow {
		margin: 0 0 0.2rem;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--brass-700);
	}

	.horizon-badge,
	.status-chip {
		border: 1px solid var(--brass-500);
		border-radius: 999px;
		background: var(--brass-100);
		padding: 0.2rem 0.55rem;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--brass-700);
	}

	.metric-grid {
		margin: 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.metric-grid.compact {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.metric-grid div {
		border: 1px solid var(--paper-edge);
		padding: 0.5rem;
	}

	dt {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		color: var(--ink-500);
	}

	dd {
		margin: 0.2rem 0 0;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--ink-700);
	}

	.claimants,
	.city-context,
	.contributor p,
	.logistics-list > p,
	.route-forecast p,
	.warehouse-evidence,
	.candidate p {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		line-height: 1.45;
		color: var(--ink-600);
	}

	.city-context {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
		border-top: 1px solid var(--paper-edge);
		padding-top: 0.65rem;
	}

	.city-context p {
		margin: 0;
	}

	.contributors,
	.material-list,
	.candidate-list,
	.logistics-list {
		display: grid;
		gap: 0.5rem;
	}

	.contributor,
	.material-row,
	.candidate,
	.route-forecast {
		border: 1px solid var(--paper-edge);
		background: rgba(255, 255, 255, 0.28);
		padding: 0.65rem;
		display: grid;
		gap: 0.4rem;
	}

	.annotation,
	.economic-state,
	.bottleneck {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		line-height: 1.45;
		color: var(--brass-700);
	}

	.bottleneck {
		max-width: 58%;
		text-align: right;
	}

	.warehouse-evidence {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		border-top: 1px solid var(--paper-edge);
		padding-top: 0.65rem;
	}

	.limitations {
		background: var(--brass-100);
	}

	.limitations ul {
		margin: 0;
		padding-left: 1.1rem;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		line-height: 1.45;
		color: var(--ink-600);
	}

	.recommendation-card {
		border-color: var(--brass-500);
	}

	.economic-state {
		font-weight: 700;
	}

	.projection-comparison {
		border-top: 1px solid var(--paper-edge);
		padding-top: 0.5rem;
		font-weight: 700;
	}

	.build-next {
		justify-self: start;
		border: 1px solid var(--ink-900);
		border-radius: 2px;
		background: var(--moss);
		color: var(--paper-50);
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 0.78rem;
		padding: 0.35rem 0.7rem;
	}

	.build-next:hover,
	.build-next:focus-visible {
		background: var(--moss-2);
	}

	.build-next:disabled {
		cursor: not-allowed;
		opacity: 0.55;
	}

	.candidate-status {
		font-weight: 700;
	}

	.muted {
		margin: 0;
		color: var(--ink-500);
		font-family: var(--font-body);
	}

	@media (max-width: 36rem) {
		.planner-controls,
		.metric-grid,
		.metric-grid.compact {
			grid-template-columns: 1fr 1fr;
		}

		.bottleneck {
			max-width: 100%;
			text-align: left;
		}
	}
</style>
