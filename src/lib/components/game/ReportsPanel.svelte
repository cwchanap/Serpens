<script lang="ts">
	import type { I18nBundle } from '$lib/i18n';
	import type { ReportSummary } from '$lib/game/reports';
	import {
		localizeEventSourceTitle,
		localizeReportWarning,
		localizeStructuredCopy
	} from '$lib/i18n/gameCopy';
	import { getCityInventoryStats } from '$lib/game/cityInventory';
	import type {
		DailyMaterialMovement,
		DailyProductionReport,
		DailyStoreReport,
		EventModifierLifecycle,
		GameState,
		Store
	} from '$lib/game/types';

	interface Props {
		i18n: I18nBundle;
		summary: ReportSummary;
		stores: Store[];
		game?: GameState;
	}

	interface AttributionRow {
		id: string;
		text: string;
	}

	let { i18n, summary, stores, game }: Props = $props();

	const railShipmentUnits = $derived(
		(summary.latest?.productionReport.railShipments ?? []).reduce(
			(total, shipment) => total + shipment.quantity,
			0
		)
	);
	const productionCloseCityInventories = $derived(summary.latest?.productionReport.cityInventories);
	const currentCityInventories = $derived(game?.cityInventories);
	const attributionRows = $derived.by(() =>
		buildAttributionRows(summary.latest?.productionReport, summary.latest?.storeReports ?? [])
	);

	function cityName(cityId: string): string {
		return i18n.labels.worldCity(cityId).name;
	}

	function currentCityInventoryStats(cityId: string) {
		return game ? getCityInventoryStats(game, cityId) : null;
	}

	function buildAttributionRows(
		productionReport: DailyProductionReport | undefined,
		storeReports: DailyStoreReport[]
	): AttributionRow[] {
		if (!productionReport) {
			return [];
		}

		return [
			...movementAttributionRows('production', productionReport.produced),
			...movementAttributionRows('consumption', productionReport.consumed),
			...retailReplenishmentAttributionRows(storeReports)
		];
	}

	function movementAttributionRows(
		kind: 'production' | 'consumption',
		movements: DailyMaterialMovement[]
	): AttributionRow[] {
		const quantitiesByCityId = movements.reduce<
			Array<{ cityId: string | undefined; quantity: number }>
		>((grouped, movement) => {
			const existing = grouped.find((group) => group.cityId === movement.cityId);
			if (existing) {
				existing.quantity += movement.quantity;
			} else {
				grouped.push({ cityId: movement.cityId, quantity: movement.quantity });
			}
			return grouped;
		}, []);

		return quantitiesByCityId.map(({ cityId, quantity }, index) => {
			const units = i18n.format.integer(quantity);
			if (!cityId) {
				return {
					id: `${kind}-unavailable-${index}`,
					text:
						kind === 'production'
							? i18n.t('reportsPanel.attribution.productionUnavailable', { units })
							: i18n.t('reportsPanel.attribution.consumptionUnavailable', { units })
				};
			}

			return {
				id: `${kind}-${cityId}`,
				text:
					kind === 'production'
						? i18n.t('reportsPanel.attribution.production', {
								cityName: cityName(cityId),
								units
							})
						: i18n.t('reportsPanel.attribution.consumption', {
								cityName: cityName(cityId),
								units
							})
			};
		});
	}

	function retailReplenishmentAttributionRows(storeReports: DailyStoreReport[]): AttributionRow[] {
		const rows: AttributionRow[] = [];

		for (const report of storeReports) {
			const store = stores.find((candidate) => candidate.id === report.storeId);
			const retailCityId = report.replenishment?.retailCityId ?? store?.cityId;
			const retailCityName = retailCityId ? cityName(retailCityId) : null;
			const localUnits = report.productReports.reduce(
				(total, product) => total + product.warehouseUnits,
				0
			);
			const importedUnits = report.productReports.reduce(
				(total, product) => total + product.importedUnits,
				0
			);

			if (localUnits > 0) {
				const sourceCityId = report.replenishment?.resolvedSupplyCityId;
				rows.push(
					sourceCityId && retailCityName
						? {
								id: `local-${report.storeId}`,
								text: i18n.t('reportsPanel.attribution.localSupply', {
									sourceCityName: cityName(sourceCityId),
									retailCityName,
									units: i18n.format.integer(localUnits)
								})
							}
						: {
								id: `local-unavailable-${report.storeId}`,
								text: i18n.t('reportsPanel.attribution.localSupplyUnavailable', {
									retailCityName: retailCityName ?? i18n.t('reportsPanel.attribution.unknownCity'),
									units: i18n.format.integer(localUnits)
								})
							}
				);
			}

			if (importedUnits > 0) {
				rows.push(
					retailCityName
						? {
								id: `imports-${report.storeId}`,
								text: i18n.t('reportsPanel.attribution.externalImports', {
									retailCityName,
									units: i18n.format.integer(importedUnits)
								})
							}
						: {
								id: `imports-unavailable-${report.storeId}`,
								text: i18n.t('reportsPanel.attribution.externalImportsUnavailable', {
									units: i18n.format.integer(importedUnits)
								})
							}
				);
			}
		}

		return rows;
	}

	function localizeLifecycleStatus(status: EventModifierLifecycle['status']): string {
		switch (status) {
			case 'activated':
				return i18n.t('reportsPanel.modifierLifecycle.status.activated');
			case 'replaced':
				return i18n.t('reportsPanel.modifierLifecycle.status.replaced');
			case 'expired':
				return i18n.t('reportsPanel.modifierLifecycle.status.expired');
		}
	}
</script>

<section class="panel paper" aria-labelledby="reports-heading">
	<h2 id="reports-heading">{i18n.t('reportsPanel.title')}</h2>

	{#if summary.latest}
		<div class="metrics">
			<div>
				<span>{i18n.t('reportsPanel.metrics.operatingIncome')}</span>
				<strong>{i18n.format.currency(summary.latest.operatingIncome)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.operatingCashFlow')}</span>
				<strong>{i18n.format.currency(summary.latest.operatingCashFlow)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.financingCashFlow')}</span>
				<strong>{i18n.format.currency(summary.latest.financingCashFlow)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.revenue')}</span>
				<strong>{i18n.format.currency(summary.latest.revenue)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.cashAfter')}</span>
				<strong>{i18n.format.currency(summary.latest.cashAfter)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.principalBorrowed')}</span>
				<strong>{i18n.format.currency(summary.latest.principalBorrowed)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.principalRepaid')}</span>
				<strong>{i18n.format.currency(summary.latest.principalRepaid)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.interestPaid')}</span>
				<strong>{i18n.format.currency(summary.latest.interestPaid)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.interestAccrued')}</span>
				<strong>{i18n.format.decimal(summary.latest.interestAccrued)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.interestCapitalized')}</span>
				<strong>{i18n.format.currency(summary.latest.interestCapitalized)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.refinancedPrincipal')}</span>
				<strong>{i18n.format.currency(summary.latest.refinancedPrincipal)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.endingPrincipal')}</span>
				<strong>{i18n.format.currency(summary.latest.outstandingPrincipalAfter)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.payroll')}</span>
				<strong>{i18n.format.currency(summary.latest.payrollCost)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.imports')}</span>
				<strong>{i18n.format.currency(summary.latest.importSpend)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.productionImports')}</span>
				<strong>{i18n.format.currency(summary.latest.productionReport.importSpend)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.warehouseOverflow')}</span>
				<strong>{i18n.format.currency(summary.latest.productionReport.overflowCost)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.railShipments')}</span>
				<strong>{i18n.format.integer(railShipmentUnits)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.sevenDayOperatingCashFlow')}</span>
				<strong>{i18n.format.currency(summary.sevenDay.operatingCashFlow)}</strong>
			</div>
			<div>
				<span>{i18n.t('reportsPanel.metrics.thirtyDayOperatingCashFlow')}</span>
				<strong>{i18n.format.currency(summary.thirtyDay.operatingCashFlow)}</strong>
			</div>
		</div>

		<section class="inventory-evidence" aria-labelledby="production-close-inventory-heading">
			<h3 id="production-close-inventory-heading">
				{i18n.t('reportsPanel.inventory.productionCloseTitle')}
			</h3>
			<p>
				{i18n.t('reportsPanel.inventory.reportDay', {
					day: i18n.format.integer(summary.latest.day)
				})}
			</p>
			{#if productionCloseCityInventories}
				{#if productionCloseCityInventories.length > 0}
					<ul class="inventory-list">
						{#each productionCloseCityInventories as inventory (inventory.cityId)}
							<li>
								<strong>
									{i18n.t('reportsPanel.inventory.citySummary', {
										cityName: cityName(inventory.cityId),
										used: i18n.format.integer(inventory.used),
										capacity: i18n.format.integer(inventory.capacity)
									})}
								</strong>
								{#if inventory.overflowUnits > 0}
									<span>
										{i18n.t('reportsPanel.inventory.cityOverflow', {
											units: i18n.format.integer(inventory.overflowUnits),
											cost: i18n.format.currency(inventory.overflowCost)
										})}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p>{i18n.t('reportsPanel.inventory.productionCloseEmpty')}</p>
				{/if}
			{:else}
				<p>{i18n.t('reportsPanel.inventory.productionCloseUnavailable')}</p>
			{/if}
		</section>

		<section class="inventory-evidence" aria-labelledby="current-inventory-heading">
			<h3 id="current-inventory-heading">{i18n.t('reportsPanel.inventory.currentTitle')}</h3>
			{#if currentCityInventories}
				{#if currentCityInventories.length > 0}
					<ul class="inventory-list">
						{#each currentCityInventories as inventory (inventory.cityId)}
							{@const stats = currentCityInventoryStats(inventory.cityId)}
							<li>
								<strong>
									{i18n.t('reportsPanel.inventory.citySummary', {
										cityName: cityName(inventory.cityId),
										used: i18n.format.integer(stats?.used ?? 0),
										capacity: i18n.format.integer(stats?.capacity ?? 0)
									})}
								</strong>
								{#if (stats?.overflowUnits ?? 0) > 0}
									<span>
										{i18n.t('reportsPanel.inventory.cityOverflow', {
											units: i18n.format.integer(stats?.overflowUnits ?? 0),
											cost: i18n.format.currency(stats?.overflowCost ?? 0)
										})}
									</span>
								{/if}
							</li>
						{/each}
					</ul>
				{:else}
					<p>{i18n.t('reportsPanel.inventory.currentEmpty')}</p>
				{/if}
			{:else}
				<p>{i18n.t('reportsPanel.inventory.currentUnavailable')}</p>
			{/if}
		</section>

		<section class="inventory-evidence" aria-labelledby="city-attribution-heading">
			<h3 id="city-attribution-heading">{i18n.t('reportsPanel.attribution.title')}</h3>
			{#if attributionRows.length > 0}
				<ul class="attribution-list">
					{#each attributionRows as row (row.id)}
						<li>{row.text}</li>
					{/each}
				</ul>
			{:else}
				<p>{i18n.t('reportsPanel.attribution.empty')}</p>
			{/if}
		</section>

		{#if summary.latest.modifierImpacts.length > 0}
			<section class="modifier-evidence" aria-labelledby="modifier-impacts-heading">
				<h3 id="modifier-impacts-heading">{i18n.t('reportsPanel.modifierImpacts.title')}</h3>
				<div class="evidence-list">
					{#each summary.latest.modifierImpacts as impact (impact.modifierId)}
						<article>
							<p>{localizeStructuredCopy(impact.explanation, i18n)}</p>
							<ul>
								<li>
									{i18n.t('reportsPanel.modifierImpacts.source', {
										source: localizeEventSourceTitle(impact.source.eventId, i18n)
									})}
								</li>
								<li>
									{i18n.t('reportsPanel.modifierImpacts.affectedIds', {
										ids: i18n.format.list(impact.affectedIds)
									})}
								</li>
								<li>
									{i18n.t('reportsPanel.modifierImpacts.multiplier', {
										multiplier: i18n.format.decimal(impact.multiplier)
									})}
								</li>
								<li>
									{i18n.t('reportsPanel.modifierImpacts.resolvedMultiplier', {
										multiplier: i18n.format.decimal(impact.resolvedMultiplier)
									})}
								</li>
								<li>
									{i18n.t('reportsPanel.modifierImpacts.baselineCost', {
										cost: i18n.format.currency(impact.baselineCost)
									})}
								</li>
								<li>
									{i18n.t('reportsPanel.modifierImpacts.actualCost', {
										cost: i18n.format.currency(impact.actualCost)
									})}
								</li>
								<li>
									{i18n.t('reportsPanel.modifierImpacts.applications', {
										count: i18n.format.integer(impact.applicationCount)
									})}
								</li>
							</ul>
						</article>
					{/each}
				</div>
			</section>
		{/if}

		{#if summary.latest.modifierLifecycle.length > 0}
			<section class="modifier-evidence" aria-labelledby="modifier-lifecycle-heading">
				<h3 id="modifier-lifecycle-heading">
					{i18n.t('reportsPanel.modifierLifecycle.title')}
				</h3>
				<div class="evidence-list">
					{#each summary.latest.modifierLifecycle as lifecycle, index (`${lifecycle.status}-${lifecycle.modifier.id}-${index}`)}
						<article>
							<p>{localizeStructuredCopy(lifecycle.modifier.explanation, i18n)}</p>
							<ul>
								<li>
									{i18n.t('reportsPanel.modifierLifecycle.source', {
										source: localizeEventSourceTitle(lifecycle.modifier.source.eventId, i18n)
									})}
								</li>
								<li>{localizeLifecycleStatus(lifecycle.status)}</li>
								{#if lifecycle.replacedByModifierId}
									<li>
										{i18n.t('reportsPanel.modifierLifecycle.replacedBy', {
											modifierId: lifecycle.replacedByModifierId
										})}
									</li>
								{/if}
								<li>
									{i18n.t('copy.modifiers.expiresAfterDay', {
										day: i18n.format.integer(lifecycle.modifier.expiresOnDay - 1)
									})}
								</li>
							</ul>
						</article>
					{/each}
				</div>
			</section>
		{/if}

		{#if summary.latest.warnings.length}
			<ul class="warnings" aria-label={i18n.t('reportsPanel.dailyWarnings')}>
				{#each summary.latest.warnings as warning, i (`${warning.code}-${i}`)}
					<li>{localizeReportWarning(warning, stores, i18n)}</li>
				{/each}
			</ul>
		{/if}
	{:else}
		<p>{i18n.t('reportsPanel.empty')}</p>
	{/if}
</section>

<style>
	.panel {
		padding: 1.1rem 1.2rem;
	}

	h2,
	h3,
	p {
		margin: 0;
	}

	h2 {
		margin-bottom: 0.75rem;
		font-family: var(--font-display);
		font-size: 1.1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	h3 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 400;
		color: var(--ink-700);
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
		gap: 0.85rem;
	}

	.metrics div {
		display: grid;
		min-width: 0;
		gap: 0.3rem;
	}

	span,
	p {
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	p {
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.92rem;
		font-weight: 400;
		letter-spacing: 0;
		text-transform: none;
	}

	strong {
		overflow-wrap: anywhere;
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums lining-nums;
		font-size: 1.05rem;
		color: var(--ink-700);
	}

	.warnings {
		margin: 0.9rem 0 0;
		padding-left: 1rem;
		color: var(--wax-red);
		font-family: var(--font-body);
		font-size: 0.92rem;
	}

	.modifier-evidence,
	.inventory-evidence,
	.evidence-list,
	.evidence-list article {
		display: grid;
		gap: 0.65rem;
	}

	.modifier-evidence,
	.inventory-evidence {
		margin-top: 1rem;
	}

	.inventory-list,
	.attribution-list {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.inventory-list li,
	.attribution-list li {
		display: grid;
		gap: 0.25rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.6rem 0.7rem;
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.85rem;
	}

	.inventory-list strong {
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: 0;
		text-transform: none;
	}

	.evidence-list article {
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-50);
		padding: 0.8rem;
	}

	.evidence-list ul {
		margin: 0;
		padding-left: 1rem;
		color: var(--ink-500);
		font-family: var(--font-body);
		font-size: 0.85rem;
	}

	@media (max-width: 980px) {
		.metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 520px) {
		.metrics {
			grid-template-columns: 1fr;
		}
	}
</style>
