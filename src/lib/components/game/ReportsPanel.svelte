<script lang="ts">
	import HudIcon from './HudIcon.svelte';
	import { asset } from '$app/paths';
	import { getProductArt, getStoreArt } from '$lib/assets/gameArt';
	import type { I18nBundle } from '$lib/i18n';
	import { getImportSpend, type ReportSummary } from '$lib/game/reports';
	import {
		localizeEventSourceTitle,
		localizeBrandName,
		localizeCompetitorProfile,
		localizeReportWarning,
		localizeRouteModifierImpact,
		localizeRouteModifierRecovery,
		localizeStructuredCopy,
		storeDisplayName
	} from '$lib/i18n/gameCopy';
	import { getCityInventoryStats } from '$lib/game/cityInventory';
	import { getProductFreshnessPercent } from '$lib/game/products';
	import { getRetailReplenishmentOutcome } from '$lib/game/retailSupply';
	import type {
		DailyMaterialMovement,
		DailyMarketCompetitorReport,
		DailyMarketReport,
		DailyProductReport,
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
		chartDays?: number;
	}

	interface AttributionRow {
		id: string;
		text: string;
	}

	interface ProductPressureRow {
		id: string;
		storeName: string;
		productName: string;
		report: DailyProductReport;
		freshnessPercent: number | null;
	}

	interface BrandPerformanceRow {
		brandId: DailyProductReport['brandId'];
		unitsSold: number;
		revenue: number;
		grossMargin: number;
	}

	interface ByProductRow {
		productId: DailyProductReport['productId'];
		revenue: number;
	}

	interface BrandReputationRow {
		id: string;
		storeName: string;
		adjustment: number;
	}

	interface MarketSnapshotRow {
		id: string;
		report: DailyMarketReport;
		strongestRival: DailyMarketCompetitorReport | null;
		currentRival: GameState['competitors'][number] | null;
	}

	let { i18n, summary, stores, game, chartDays = 14 }: Props = $props();
	const chartReports = $derived((game?.reports ?? []).slice(-chartDays));
	const byProductRows = $derived(
		Object.values(
			(summary.latest?.storeReports ?? [])
				.flatMap((report) => report.productReports)
				.reduce<Record<string, ByProductRow>>((acc, product) => {
					const existing = acc[product.productId];
					if (existing) existing.revenue += product.revenue;
					else acc[product.productId] = { productId: product.productId, revenue: product.revenue };
					return acc;
				}, {})
		)
	);
	const productRevenuePeak = $derived(Math.max(1, ...byProductRows.map((row) => row.revenue)));
	const chartCeiling = $derived(
		Math.max(
			1,
			...chartReports.flatMap((report) => [report.revenue, report.revenue - report.operatingIncome])
		)
	);
	const revenuePoints = $derived(
		chartReports
			.map(
				(report, index) =>
					`${40 + (index * 650) / Math.max(1, chartReports.length - 1)},${190 - (report.revenue / chartCeiling) * 160}`
			)
			.join(' ')
	);
	const costPoints = $derived(
		chartReports
			.map(
				(report, index) =>
					`${40 + (index * 650) / Math.max(1, chartReports.length - 1)},${190 - ((report.revenue - report.operatingIncome) / chartCeiling) * 160}`
			)
			.join(' ')
	);

	const railShipmentUnits = $derived(
		(summary.latest?.productionReport.railShipments ?? []).reduce(
			(total, shipment) => total + shipment.quantity,
			0
		)
	);
	const productionCloseCityInventories = $derived(summary.latest?.productionReport.cityInventories);
	const currentCityInventories = $derived(game?.cityInventories);
	const latestLogisticsReport = $derived(summary.latest?.logistics);
	const attributionRows = $derived.by(() =>
		buildAttributionRows(summary.latest?.productionReport, summary.latest?.storeReports ?? [])
	);
	const productPressureRows = $derived.by(() =>
		buildProductPressureRows(summary.latest?.storeReports ?? [])
	);
	const brandPerformanceRows = $derived.by(() =>
		buildBrandPerformanceRows(summary.latest?.storeReports ?? [])
	);
	const brandReputationRows = $derived.by(() =>
		buildBrandReputationRows(summary.latest?.storeReports ?? [])
	);
	const marketSnapshotRows = $derived.by(() =>
		buildMarketSnapshotRows(summary.latest?.marketReports ?? [])
	);
	const inventoryLossExpense = $derived.by(() => {
		if (!summary.latest) return 0;
		return summary.latest.inventoryLossExpense;
	});

	function cityName(cityId: string): string {
		return i18n.labels.worldCity(cityId).name;
	}

	function currentCityInventoryStats(cityId: string) {
		if (!game) {
			throw new Error('Current inventory requires game state');
		}

		return getCityInventoryStats(game, cityId);
	}

	function getFreshnessPercent(report: DailyProductReport): number | null {
		return getProductFreshnessPercent(report.productId, report.averageAgeDays);
	}

	function brandName(brandId: DailyProductReport['brandId']): string {
		return localizeBrandName(brandId);
	}

	function signedShareDelta(delta: number | null): string {
		if (delta === null) return i18n.t('reportsPanel.market.noPriorShare');
		const formatted = i18n.format.percent(Math.abs(delta));
		return delta > 0 ? `+${formatted}` : delta < 0 ? `-${formatted}` : formatted;
	}

	function hasProductPressure(
		report: DailyProductReport,
		freshnessPercent: number | null
	): boolean {
		return (
			report.wasteUnits > 0 ||
			report.shrinkUnits > 0 ||
			report.stockoutLostDemand > 0 ||
			report.markdownAmount > 0 ||
			report.obsolescenceMultiplier < 1 ||
			(freshnessPercent !== null && freshnessPercent < 100)
		);
	}

	function buildProductPressureRows(storeReports: DailyStoreReport[]): ProductPressureRow[] {
		return storeReports.flatMap((storeReport) => {
			const storeIndex = stores.findIndex((store) => store.id === storeReport.storeId);
			const storeRecord = stores[storeIndex];
			const storeName = storeRecord
				? storeDisplayName(storeRecord, storeIndex + 1, i18n)
				: storeReport.storeId;

			return storeReport.productReports.flatMap((report) => {
				const freshnessPercent = getFreshnessPercent(report);
				return hasProductPressure(report, freshnessPercent)
					? [
							{
								id: `${storeReport.storeId}-${report.productId}`,
								storeName,
								productName: i18n.labels.productCategory(report.productId),
								report,
								freshnessPercent
							}
						]
					: [];
			});
		});
	}

	function buildBrandPerformanceRows(storeReports: DailyStoreReport[]): BrandPerformanceRow[] {
		const totals: BrandPerformanceRow[] = [];
		for (const storeReport of storeReports) {
			for (const report of storeReport.productReports) {
				const existing = totals.find((row) => row.brandId === report.brandId);
				if (existing) {
					existing.unitsSold += report.unitsSold;
					existing.revenue += report.revenue;
					existing.grossMargin += report.grossMargin;
				} else {
					totals.push({
						brandId: report.brandId,
						unitsSold: report.unitsSold,
						revenue: report.revenue,
						grossMargin: report.grossMargin
					});
				}
			}
		}
		return totals;
	}

	function buildBrandReputationRows(storeReports: DailyStoreReport[]): BrandReputationRow[] {
		return storeReports.map((report, index) => {
			const storeIndex = stores.findIndex((store) => store.id === report.storeId);
			const storeRecord = stores[storeIndex];
			return {
				id: `${report.storeId}-${index}`,
				storeName: storeRecord
					? storeDisplayName(storeRecord, storeIndex + 1, i18n)
					: report.storeId,
				adjustment: report.brandReputationAdjustment
			};
		});
	}

	function buildMarketSnapshotRows(reports: DailyMarketReport[]): MarketSnapshotRow[] {
		return reports.map((report, index) => {
			const strongestRival =
				[...report.competitors].sort((left, right) => right.share - left.share)[0] ?? null;
			const currentRival = strongestRival
				? (game?.competitors.find((competitor) => competitor.id === strongestRival.competitorId) ??
					null)
				: null;
			return {
				id: `${report.cityId}-${report.productId}-${index}`,
				report,
				strongestRival,
				currentRival
			};
		});
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
			const context = report.replenishment;
			if (!context) continue;

			const retailCityName = cityName(context.retailCityId);
			const outcomes = report.productReports.map((product) => ({
				product,
				outcome: getRetailReplenishmentOutcome(context, product)
			}));
			const localUnits = outcomes.reduce(
				(total, { product, outcome }) =>
					outcome === 'city-inventory' || outcome === 'mixed'
						? total + product.warehouseUnits
						: total,
				0
			);
			const importedUnits = outcomes.reduce(
				(total, { product, outcome }) =>
					outcome === 'mixed' ||
					outcome === 'import-only' ||
					outcome === 'unassigned-import' ||
					outcome === 'source-unavailable-import'
						? total + product.importedUnits
						: total,
				0
			);

			if (localUnits > 0) {
				const sourceCityId = context.resolvedSupplyCityId;
				rows.push(
					sourceCityId
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
									retailCityName,
									units: i18n.format.integer(localUnits)
								})
							}
				);
			}

			if (importedUnits > 0) {
				rows.push({
					id: `imports-${report.storeId}`,
					text: i18n.t('reportsPanel.attribution.externalImports', {
						retailCityName,
						units: i18n.format.integer(importedUnits)
					})
				});
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

<section class="panel" aria-labelledby="reports-heading">
	<h2 class="sr-only" id="reports-heading">{i18n.t('reportsPanel.title')}</h2>

	{#if chartReports.length > 0}
		<div class="report-overview">
			<section class="report-chart" aria-label={i18n.t('reportsPanel.chart.title')}>
				<div class="chart-heading">
					<div class="revenue-headline">
						<h3>{i18n.t('reportsPanel.chart.title')}</h3>
						<strong
							>{i18n.format.currency(chartReports.at(-1)!.revenue)}<small
								>{i18n.t('reportsPanel.perDay')}</small
							></strong
						>
					</div>
					<div class="chart-legend">
						<span class="revenue-key">{i18n.t('reportsPanel.metrics.revenue')}</span><span
							class="cost-key">{i18n.t('reportsPanel.chart.cost')}</span
						>
					</div>
				</div>
				<svg viewBox="0 0 700 220" role="img" aria-label={i18n.t('reportsPanel.chart.title')}>
					<path
						d="M40 20H690 M40 70H690 M40 120H690 M40 170H690"
						stroke="var(--paper-200)"
						fill="none"
					/>
					<path d="M40 10V190H690" stroke="var(--paper-edge)" stroke-width="1.5" fill="none" />
					<polyline
						data-testid="revenue-trend"
						points={revenuePoints}
						fill="none"
						stroke="var(--moss)"
						stroke-width="3"
					/>
					<polyline points={costPoints} fill="none" stroke="var(--wax-red)" stroke-width="2" />
					{#each chartReports as report, index (report.day)}
						<circle
							cx={40 + (index * 650) / Math.max(1, chartReports.length - 1)}
							cy={190 - (report.revenue / chartCeiling) * 160}
							r="3"
							fill="var(--moss)"
							><title
								>{i18n.t('topBar.day', { day: report.day })}: {i18n.format.currency(
									report.revenue
								)}</title
							></circle
						>
					{/each}
					<text x="40" y="208">{chartReports[0].day}</text>
					<text x="360" y="208">{chartReports[Math.floor((chartReports.length - 1) / 2)].day}</text>
					<text x="690" y="208" text-anchor="end">{chartReports.at(-1)!.day}</text>
				</svg>
				{#if summary.latest}
					<div class="headline-metrics">
						<div>
							<HudIcon name="reports" />
							<div>
								<span>{i18n.t('reportsPanel.metrics.margin')}</span><strong
									>{i18n.format.percent(
										summary.latest.revenue > 0
											? summary.latest.grossMargin / summary.latest.revenue
											: 0
									)}</strong
								>
							</div>
						</div>
						<div>
							<HudIcon name="staff" />
							<div>
								<span>{i18n.t('reportsPanel.metrics.customers')}</span><strong
									>{i18n.format.integer(
										summary.latest.storeReports.reduce(
											(total, report) => total + report.customersServed,
											0
										)
									)}</strong
								>
							</div>
						</div>
						<div>
							<HudIcon name="demolish" />
							<div>
								<span>{i18n.t('reportsPanel.metrics.spoilage')}</span><strong
									>{i18n.format.currency(
										summary.latest.storeReports.reduce(
											(total, report) =>
												total +
												report.productReports.reduce((sum, product) => sum + product.wasteValue, 0),
											0
										)
									)}</strong
								>
							</div>
						</div>
					</div>
				{/if}
			</section>
			{#if game}<aside class="report-score" aria-label={i18n.t('scorecard.title')}>
					<div class="score-main">
						<h3>{i18n.t('scorecard.title')}</h3>
						<div class="score-ring" style={`--score:${game.scorecard.profit}%`}>
							<strong>{game.scorecard.profit}</strong>
						</div>
						<p>{i18n.labels.scoreKey('profit')} · {game.scorecard.profit} / 100</p>
					</div>
					<div class="score-details">
						{#each ['customerSatisfaction', 'staffMorale', 'marketPosition'] as key (key)}
							<div class="score-metric">
								<HudIcon
									name={key === 'customerSatisfaction'
										? 'person'
										: key === 'staffMorale'
											? 'staff'
											: 'world'}
								/>
								<span>{i18n.labels.scoreKey(key)}</span><strong
									>{game.scorecard[key as keyof typeof game.scorecard]} / 100</strong
								>
							</div>
						{/each}
					</div>
				</aside>{/if}
		</div>
		<h3 class="section-title">{i18n.t('reportsPanel.byStore')}</h3>
		<div class="store-results">
			{#each summary.latest?.storeReports ?? [] as report (report.storeId)}
				{@const store = stores.find((item) => item.id === report.storeId)}
				{#if store}
					{@const history = chartReports.flatMap((day) =>
						day.storeReports.filter((item) => item.storeId === store.id).map((item) => item.revenue)
					)}
					{@const peak = Math.max(1, ...history)}
					<div class="store-result">
						<img src={asset(getStoreArt(store.archetypeId).path)} alt="" width="68" height="68" />
						<div>
							<span>{storeDisplayName(store, stores.indexOf(store) + 1, i18n)}</span><strong
								>{i18n.format.currency(report.revenue)}</strong
							>
							<svg
								viewBox="0 0 140 26"
								role="img"
								aria-label={i18n.t('reportsPanel.metrics.revenue')}
								><polyline
									points={history
										.map(
											(value, index) =>
												`${2 + (index * 136) / Math.max(1, history.length - 1)},${24 - (value / peak) * 22}`
										)
										.join(' ')}
									fill="none"
									stroke="var(--moss)"
									stroke-width="2"
								/></svg
							>
						</div>
					</div>
				{/if}
			{/each}
		</div>
	{/if}
	{#if summary.latest}
		<h3 class="section-title">{i18n.t('reportsPanel.byProduct')}</h3>
		<div class="product-results">
			{#each byProductRows as product (product.productId)}
				<div>
					<img
						src={asset(getProductArt(product.productId).path)}
						alt={i18n.labels.productCategory(product.productId)}
						width="44"
						height="44"
					/><strong>{i18n.format.currency(product.revenue)}</strong>
					<div class="product-revenue-track" aria-hidden="true">
						<div style:width={`${(product.revenue / productRevenuePeak) * 100}%`}></div>
					</div>
				</div>
			{/each}
		</div>
		<details class="report-details">
			<summary data-testid="report-details-toggle"
				>{i18n.t('reportsPanel.title')} · {i18n.t('tileInspector.openDetails')}</summary
			>

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
				<div data-testid="reports-net-cash-change">
					<span>{i18n.t('reportsPanel.metrics.netCashChange')}</span>
					<strong>{i18n.format.currency(summary.latest.netCashChange)}</strong>
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
					<strong>{i18n.format.currency(getImportSpend(summary.latest))}</strong>
				</div>
				<div>
					<span>{i18n.t('reportsPanel.metrics.inventoryLoss')}</span>
					<strong>{i18n.format.currency(inventoryLossExpense)}</strong>
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

			{#if productPressureRows.length > 0 || inventoryLossExpense > 0}
				<section class="product-pressure-evidence" aria-labelledby="product-pressure-heading">
					<h3 id="product-pressure-heading">{i18n.t('reportsPanel.productPressure.title')}</h3>
					{#if productPressureRows.length > 0}
						<div class="evidence-list">
							{#each productPressureRows as row (row.id)}
								<article data-testid={`product-pressure-${row.id}`}>
									<h4>{row.storeName} · {row.productName}</h4>
									<ul>
										{#if row.freshnessPercent !== null}
											<li>
												{i18n.t('reportsPanel.productPressure.freshness', {
													percent: i18n.format.integer(row.freshnessPercent)
												})}
											</li>
										{/if}
										{#if row.report.wasteUnits > 0}
											<li>
												{i18n.t('reportsPanel.productPressure.waste', {
													units: i18n.format.integer(row.report.wasteUnits),
													value: i18n.format.currency(row.report.wasteValue)
												})}
											</li>
										{/if}
										{#if row.report.shrinkUnits > 0}
											<li>
												{i18n.t(
													row.report.shrinkUnits === 1
														? 'reportsPanel.productPressure.shrinkSingular'
														: 'reportsPanel.productPressure.shrink',
													{
														units: i18n.format.integer(row.report.shrinkUnits),
														value: i18n.format.currency(row.report.shrinkValue)
													}
												)}
											</li>
										{/if}
										{#if row.report.stockoutLostDemand > 0}
											<li>
												{i18n.t('reportsPanel.productPressure.stockout', {
													units: i18n.format.integer(row.report.stockoutLostDemand)
												})}
											</li>
										{/if}
										{#if row.report.obsolescenceMultiplier < 1}
											<li>
												{i18n.t('reportsPanel.productPressure.obsolescence', {
													percent: i18n.format.percent(row.report.obsolescenceMultiplier)
												})}
											</li>
										{/if}
										{#if row.report.markdownAmount > 0}
											<li>
												{i18n.t('reportsPanel.productPressure.markdown', {
													amount: i18n.format.currency(row.report.markdownAmount)
												})}
											</li>
											<li>
												{i18n.t('reportsPanel.productPressure.basePrice', {
													price: i18n.format.currency(row.report.baseSellingPrice)
												})}
											</li>
											<li>
												{i18n.t('reportsPanel.productPressure.effectivePrice', {
													price: i18n.format.currency(row.report.effectiveSellingPrice)
												})}
											</li>
										{/if}
									</ul>
								</article>
							{/each}
						</div>
					{:else}
						<p>{i18n.t('reportsPanel.productPressure.empty')}</p>
					{/if}
					{#if inventoryLossExpense > 0}
						<p data-testid="inventory-loss-expense">
							{i18n.t('reportsPanel.productPressure.inventoryLoss', {
								amount: i18n.format.currency(inventoryLossExpense)
							})}
						</p>
					{/if}
				</section>
			{/if}

			{#if brandPerformanceRows.length > 0 || brandReputationRows.length > 0}
				<section class="brand-performance-evidence" aria-labelledby="brand-performance-heading">
					<h3 id="brand-performance-heading">{i18n.t('reportsPanel.brandPerformance.title')}</h3>
					{#if brandPerformanceRows.length > 0}
						<div class="evidence-list">
							{#each brandPerformanceRows as row (row.brandId)}
								<article data-testid={`brand-performance-${row.brandId}`}>
									<h4>{brandName(row.brandId)}</h4>
									<ul>
										<li>
											{i18n.t('reportsPanel.brandPerformance.unitsSold', {
												units: i18n.format.integer(row.unitsSold)
											})}
										</li>
										<li>
											{i18n.t('reportsPanel.brandPerformance.revenue', {
												amount: i18n.format.currency(row.revenue)
											})}
										</li>
										<li>
											{i18n.t('reportsPanel.brandPerformance.grossMargin', {
												amount: i18n.format.currency(row.grossMargin)
											})}
										</li>
									</ul>
								</article>
							{/each}
						</div>
					{:else}
						<p>{i18n.t('reportsPanel.brandPerformance.empty')}</p>
					{/if}
					{#each brandReputationRows as row (row.id)}
						<p data-testid={`brand-reputation-${row.id}`}>
							{i18n.t('reportsPanel.brandPerformance.reputationAdjustment', {
								storeName: row.storeName,
								adjustment:
									row.adjustment > 0
										? `+${i18n.format.integer(row.adjustment)}`
										: i18n.format.integer(row.adjustment)
							})}
						</p>
					{/each}
				</section>
			{/if}

			{#if marketSnapshotRows.length > 0}
				<section class="market-evidence" aria-labelledby="market-snapshot-heading">
					<h3 id="market-snapshot-heading">{i18n.t('reportsPanel.market.title')}</h3>
					<div class="evidence-list">
						{#each marketSnapshotRows as row (row.id)}
							<article data-testid={`market-snapshot-${row.id}`}>
								<h4>
									{i18n.labels.productCategory(row.report.productId)} · {cityName(
										row.report.cityId
									)}
								</h4>
								<ul>
									<li>
										{i18n.t('reportsPanel.market.playerShare', {
											share: i18n.format.percent(row.report.playerShare)
										})}
									</li>
									<li>
										{i18n.t('reportsPanel.market.shareDelta', {
											delta: signedShareDelta(row.report.playerShareDelta)
										})}
									</li>
									{#if row.strongestRival}
										<li>
											{i18n.t('reportsPanel.market.strongestRival', {
												competitorId: row.strongestRival.competitorId,
												competitorName: row.currentRival?.name ?? row.strongestRival.competitorId
											})}
										</li>
										{#if row.currentRival}
											<li>
												{i18n.t('reportsPanel.market.currentProfile', {
													profile: localizeCompetitorProfile(row.currentRival, i18n)
												})}
											</li>
										{/if}
										<li>
											{i18n.t('reportsPanel.market.rivalShare', {
												share: i18n.format.percent(row.strongestRival.share)
											})}
										</li>
										<li>
											{i18n.t('reportsPanel.market.rivalAttraction', {
												attraction: i18n.format.integer(row.strongestRival.attractionScore),
												multiplier: i18n.format.decimal(row.strongestRival.eventMultiplier)
											})}
										</li>
									{:else}
										<li>{i18n.t('reportsPanel.market.noRival')}</li>
									{/if}
								</ul>
							</article>
						{/each}
					</div>
				</section>
			{/if}

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
											used: i18n.format.integer(stats.used),
											capacity: i18n.format.integer(stats.capacity)
										})}
									</strong>
									{#if stats.overflowUnits > 0}
										<span>
											{i18n.t('reportsPanel.inventory.cityOverflow', {
												units: i18n.format.integer(stats.overflowUnits),
												cost: i18n.format.currency(stats.overflowCost)
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

			{#if latestLogisticsReport}
				<section class="logistics-evidence" aria-labelledby="latest-logistics-heading">
					<h3 id="latest-logistics-heading">{i18n.t('reportsPanel.logistics.title')}</h3>
					<div class="logistics-metrics">
						<span>
							{i18n.t('reportsPanel.logistics.deliveredUnits', {
								units: i18n.format.integer(latestLogisticsReport.deliveredUnits)
							})}
						</span>
						<span>
							{i18n.t('reportsPanel.logistics.scheduledTransportCost', {
								cost: i18n.format.currency(latestLogisticsReport.scheduledTransportCost)
							})}
						</span>
					</div>

					<div class="logistics-subsection">
						<h4>{i18n.t('reportsPanel.logistics.arrivalsTitle')}</h4>
						{#if latestLogisticsReport.arrivals.length > 0}
							<ul class="logistics-list">
								{#each latestLogisticsReport.arrivals as arrival (arrival.transferOrderId)}
									<li>
										{i18n.t('reportsPanel.logistics.arrival', {
											transferId: arrival.transferOrderId,
											originCityName: cityName(arrival.originCityId),
											destinationCityName: cityName(arrival.destinationCityId),
											materialName: i18n.labels.material(arrival.materialId),
											units: i18n.format.integer(arrival.quantity)
										})}
									</li>
								{/each}
							</ul>
						{:else}
							<p>{i18n.t('reportsPanel.logistics.noArrivals')}</p>
						{/if}
					</div>

					<div class="logistics-subsection">
						<h4>{i18n.t('reportsPanel.logistics.attemptsTitle')}</h4>
						{#if latestLogisticsReport.routeDispatchAttempts.length > 0}
							<ul class="logistics-list">
								{#each latestLogisticsReport.routeDispatchAttempts as attempt (`${attempt.routeId}-${attempt.transferOrderId ?? 'none'}`)}
									{@const utilization =
										attempt.capacity > 0 ? attempt.dispatchedQuantity / attempt.capacity : 0}
									<li>
										<strong>
											{i18n.t('reportsPanel.logistics.attemptRoute', {
												routeId: attempt.routeId,
												originCityName: cityName(attempt.originCityId),
												destinationCityName: cityName(attempt.destinationCityId),
												materialName: i18n.labels.material(attempt.materialId)
											})}
										</strong>
										<span>
											{i18n.t('reportsPanel.logistics.destinationNeed', {
												units: i18n.format.integer(attempt.destinationNeed)
											})}
										</span>
										{#if attempt.destinationNeed === 0}
											<span>{i18n.t('reportsPanel.logistics.destinationFull')}</span>
										{/if}
										<span>
											{i18n.t('reportsPanel.logistics.attemptCapacity', {
												units: i18n.format.integer(attempt.capacity)
											})}
										</span>
										<span>
											{i18n.t('reportsPanel.logistics.dispatchedQuantity', {
												units: i18n.format.integer(attempt.dispatchedQuantity)
											})}
										</span>
										<span>
											{i18n.t('reportsPanel.logistics.unusedCapacity', {
												units: i18n.format.integer(attempt.unusedCapacity)
											})}
										</span>
										<span>
											{i18n.t('reportsPanel.logistics.unmetDestinationNeed', {
												units: i18n.format.integer(attempt.unmetDestinationNeed)
											})}
										</span>
										<span>
											{i18n.t('reportsPanel.logistics.utilization', {
												value: i18n.format.percent(utilization)
											})}
										</span>
										<span>
											{i18n.t('reportsPanel.logistics.transportCost', {
												cost: i18n.format.currency(attempt.transportCost)
											})}
										</span>
										{#if attempt.modifierImpacts.length > 0}
											<!-- Persisted per-attempt evidence: rendered as-is so the report
										stays valid and attributable after the modifiers expire. -->
											<ul class="logistics-impact-list">
												{#each attempt.modifierImpacts as impact, impactIndex (`${attempt.routeId}-${impact.effectKind}-${impactIndex}`)}
													<li>
														<span>{localizeRouteModifierImpact(impact, i18n)}</span>
														{#each impact.contributors as contributor (contributor.modifierId)}
															<span>
																{i18n.t('copy.modifiers.impactSource', {
																	source: localizeEventSourceTitle(contributor.source.eventId, i18n)
																})}
															</span>
														{/each}
													</li>
												{/each}
											</ul>
										{/if}
									</li>
								{/each}
							</ul>
						{:else}
							<p>{i18n.t('reportsPanel.logistics.noAttempts')}</p>
						{/if}
					</div>

					{#if latestLogisticsReport.modifierRecoveries.length > 0}
						<div class="logistics-subsection">
							<h4>{i18n.t('reportsPanel.logistics.recoveriesTitle')}</h4>
							<!-- Rows are per expired contributor and already carry combined
						effective values; render as-is, never sum per route. -->
							<ul class="logistics-list">
								{#each latestLogisticsReport.modifierRecoveries as recovery, index (`${recovery.modifierId}-${index}`)}
									<li>
										<span>{localizeRouteModifierRecovery(recovery, i18n)}</span>
										<span>
											{i18n.t('copy.modifiers.impactSource', {
												source: localizeEventSourceTitle(recovery.source.eventId, i18n)
											})}
										</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</section>
			{/if}

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
		</details>
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
	h4,
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

	h4 {
		margin: 0;
		font-family: var(--font-display);
		font-size: 0.95rem;
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
	.product-pressure-evidence,
	.brand-performance-evidence,
	.market-evidence,
	.logistics-evidence,
	.logistics-subsection,
	.evidence-list,
	.evidence-list article {
		display: grid;
		gap: 0.65rem;
	}

	.modifier-evidence,
	.inventory-evidence,
	.product-pressure-evidence,
	.brand-performance-evidence,
	.market-evidence,
	.logistics-evidence {
		margin-top: 1rem;
	}

	.inventory-list,
	.attribution-list,
	.logistics-list {
		display: grid;
		gap: 0.45rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.inventory-list li,
	.attribution-list li,
	.logistics-list li {
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

	.logistics-metrics {
		display: flex;
		flex-wrap: wrap;
		gap: 0.65rem 1rem;
	}

	.logistics-impact-list {
		display: grid;
		gap: 0.3rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.logistics-impact-list li {
		display: grid;
		gap: 0.15rem;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
		background: var(--paper-100);
		padding: 0.4rem 0.5rem;
	}

	.logistics-list strong {
		font-family: var(--font-body);
		font-size: 0.9rem;
		font-weight: 700;
		letter-spacing: 0;
		text-transform: none;
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
	.revenue-headline h3 {
		font: 700 9.5px/1.2 var(--font-ui);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--brass-700);
	}
	.revenue-headline strong {
		display: block;
		margin-top: 3px;
		font: 700 30px/1 var(--font-mono);
	}
	.report-chart {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 14px;
		margin-bottom: 0;
		border: 1px solid var(--brass-500);
		background: var(--paper-50);
	}
	.report-chart svg {
		display: block;
		width: 100%;
		height: 220px;
	}
	.chart-heading {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.7rem;
		flex-wrap: wrap;
	}
	.chart-legend {
		padding-top: 4px;
		display: flex;
		gap: 12px;
		font: 11px var(--font-ui);
	}

	.revenue-key {
		color: var(--moss);
	}
	.cost-key {
		color: var(--wax-red);
	}
	.store-results {
		display: grid;
		gap: 0.4rem;
		margin-top: 1rem;
	}
	.store-result {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		border-top: 1px solid var(--paper-edge);
		padding-top: 0.4rem;
	}
	.store-result img {
		object-fit: contain;
	}
	.store-result span {
		flex: 1;
		text-transform: none;
		letter-spacing: 0;
	}
	.metrics > div {
		padding: 0.7rem;
		background: var(--paper-50);
		border-bottom: 2px solid var(--paper-300);
	}

	.panel {
		padding: 0;
	}
	.report-overview {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 300px;
		gap: 1rem;
	}
	.report-score {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.score-main {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		background: var(--paper-50);
		padding: 14px;
		border: 1px solid var(--brass-500);
	}
	.score-main h3 {
		font: 700 9.5px/1.2 var(--font-ui);
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.score-main p {
		font: 12px var(--font-mono);
	}
	.score-metric {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}
	.score-metric span {
		font: 13px var(--font-ui);
		text-transform: none;
		letter-spacing: 0;
	}
	.score-metric strong {
		font: 12px var(--font-mono);
		white-space: nowrap;
	}
	.score-ring {
		display: grid;
		place-items: center;
		width: 120px;
		height: 120px;
		border-radius: 50%;
		background: conic-gradient(var(--moss) var(--score), var(--paper-300) 0);
	}
	.score-ring strong {
		display: grid;
		place-items: center;
		width: 100px;
		height: 100px;
		border-radius: 50%;
		background: var(--paper-50);
		font: 2.5rem var(--font-display);
	}
	.headline-metrics {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		margin: 0;
		gap: 10px;
	}
	.headline-metrics > div {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 9px 11px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-100);
	}
	.headline-metrics strong {
		font: 700 17px/1.3 var(--font-mono);
	}
	.product-results {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 10px;
		margin: 10px 0 0;
	}
	.product-results > div {
		display: grid;
		place-items: center;
		gap: 6px;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		padding: 10px 6px;
		font: 14px/1.4 var(--font-mono);
	}
	.product-revenue-track {
		height: 6px;
		border-radius: 999px;
		overflow: hidden;
		width: 100%;
		background: var(--paper-300);
	}
	.product-revenue-track > div {
		height: 100%;
		background: var(--moss);
	}
	.product-results strong {
		font: 700 14px/1.4 var(--font-mono);
	}
	.product-results img {
		object-fit: contain;
	}
	.store-results {
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 12px;
		margin-top: 10px;
	}
	.report-details summary {
		cursor: pointer;
		font: 0.8rem var(--font-ui);
		padding: 0.25rem 0;
		border-top: 1px solid var(--paper-edge);
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
	}
	@media (max-width: 700px) {
		.report-overview {
			grid-template-columns: 1fr;
		}
		.product-results {
			grid-template-columns: repeat(3, 1fr);
		}
	}

	.store-result {
		align-items: start;
		min-height: 106px;
		display: grid;
		grid-template-columns: 68px minmax(0, 1fr);
		gap: 12px;
		background: var(--paper-50);
		border: 1px solid var(--paper-edge);
		border-left: 4px solid var(--moss);
		padding: 12px;
	}
	.store-result img {
		width: 68px;
		height: 68px;
		object-fit: cover;
		border: 1px solid var(--paper-edge);
		background: var(--paper-100);
	}
	.store-result > div {
		display: grid;
		gap: 5px;
		min-width: 0;
	}
	.store-result span {
		font: 16px/1.2 var(--font-display);
	}
	.store-result strong {
		font: 700 17px/1.3 var(--font-mono);
	}
	.store-result svg {
		width: 100%;
		height: 26px;
	}
	.section-title {
		margin-top: 16px;
		font-size: 18px;
		line-height: 1.4;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.section-title::after {
		content: '';
		flex: 1;
		height: 1px;
		background: linear-gradient(to right, var(--brass-500), transparent);
	}
	.headline-metrics > div > div {
		display: grid;
		gap: 2px;
	}
	.headline-metrics strong {
		display: block;
	}
	.headline-metrics :global(svg) {
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}
	.headline-metrics span {
		font: 700 9.5px/1.2 var(--font-ui);
	}

	.store-results {
		margin-bottom: 0;
	}
	.revenue-headline small {
		margin-left: 6px;
		font: 700 15px var(--font-mono);
		color: var(--ink-700);
	}
	.chart-legend span {
		font: 11.5px var(--font-ui);
		color: var(--ink-700);
		text-transform: none;
		letter-spacing: 0;
	}
	.report-chart text {
		font: 16px var(--font-ui);
		fill: var(--ink-700);
	}
	.score-details {
		display: grid;
		gap: 8px;
		padding: 12px;
		border: 1px solid var(--paper-edge);
		background: var(--paper-50);
	}
	.score-metric {
		align-items: center;
	}
	.score-metric span {
		flex: 1;
		color: var(--ink-700);
	}
	.score-metric :global(svg) {
		width: 17px;
		height: 17px;
		flex-shrink: 0;
		color: var(--brass-700);
	}
	.chart-legend span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.chart-legend span::before {
		content: '';
		width: 14px;
		height: 4px;
		border-radius: 999px;
		background: var(--moss);
	}
	.chart-legend .cost-key::before {
		background: var(--wax-red);
	}
	.headline-metrics > div:first-child :global(svg) {
		color: var(--moss);
	}
	.headline-metrics > div:nth-child(2) :global(svg) {
		color: var(--brass-700);
	}
	.headline-metrics > div:last-child :global(svg) {
		color: var(--wax-red);
	}
</style>
