<script lang="ts">
	import { asset } from '$app/paths';
	import { getProductArt, getStoreArt } from '$lib/assets/gameArt';
	import type { I18nBundle } from '$lib/i18n';
	import { formatEvidenceValue } from '$lib/i18n/scenarioCopy';
	import type { ReportSummary } from '$lib/game/reports';
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
		ObjectiveEvidence,
		ScenarioCondition,
		ScenarioDefinition,
		ScenarioRun
	} from '$lib/scenarios/types';
	import type {
		DailyMaterialMovement,
		DailyMarketCompetitorReport,
		DailyMarketReport,
		DailyProductReport,
		DailyProductionReport,
		DailyReport,
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
		/** Active scenario source for the grade plate; null falls back to the scorecard composite. */
		scenario?: { definition: ScenarioDefinition; run: ScenarioRun } | null;
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

	let { i18n, summary, stores, game, scenario = null }: Props = $props();

	// ---- Scorecard plate ----
	// Window selection is presentation-only: every figure below is sliced from
	// real DailyReport history; no new analytics state is introduced.
	const WINDOW_DAYS = [7, 14, 30] as const;
	let windowDays = $state<(typeof WINDOW_DAYS)[number]>(14);

	/** Window slices; falls back to the single latest report when game state is absent. */
	const reports = $derived(game?.reports ?? (summary.latest ? [summary.latest] : []));
	const windowReports = $derived(reports.slice(-windowDays));
	const priorWindowReports = $derived(
		reports.length > windowDays ? reports.slice(-windowDays * 2, -windowDays) : []
	);

	// Cost line: goods plus operating costs (payroll and transport included;
	// inventory loss is reported separately as the spoilage cell).
	const revenueSeries = $derived(windowReports.map((report) => report.revenue));
	const costSeries = $derived(
		windowReports.map((report) => report.costOfGoods + report.operatingCosts)
	);
	const windowAverageRevenue = $derived.by(() => {
		const total = revenueSeries.reduce((sum, value) => sum + value, 0);
		return revenueSeries.length === 0 ? 0 : Math.round(total / revenueSeries.length);
	});
	const windowMargin = $derived.by(() => {
		const revenue = revenueSeries.reduce((sum, value) => sum + value, 0);
		const margin = windowReports.reduce((sum, report) => sum + report.grossMargin, 0);
		return revenue > 0 ? margin / revenue : null;
	});
	const windowFootfall = $derived(
		windowReports.reduce(
			(total, report) =>
				total +
				report.storeReports.reduce((sum, storeReport) => sum + storeReport.customersServed, 0),
			0
		)
	);
	const windowSpoilage = $derived(
		windowReports.reduce((total, report) => total + report.inventoryLossExpense, 0)
	);

	const chartXLabels = $derived.by(() => {
		const count = windowReports.length;
		if (count === 0) return [];
		if (count <= 2) return windowReports.map((report) => report.day);
		return [
			windowReports[0]!.day,
			windowReports[Math.floor((count - 1) / 2)]!.day,
			windowReports[count - 1]!.day
		];
	});

	// Minimal line chart: sparse endpoint labels, no grid clutter.
	function chartPoints(values: number[], width: number, height: number): string {
		if (values.length === 0) return '';
		const peak = Math.max(...values, 1);
		const y = (value: number) => height - 4 - (value / peak) * (height - 8);
		if (values.length === 1) return `0,${y(values[0]!)} ${width},${y(values[0]!)}`;
		const step = width / (values.length - 1);
		return values.map((value, index) => `${index * step},${y(value)}`).join(' ');
	}

	interface StorePerformanceRow {
		id: string;
		name: string;
		artPath: string;
		revenue: number;
		deltaPercent: number | null;
		direction: 'up' | 'down' | 'flat';
		series: number[];
	}

	const storePerformanceRows = $derived.by(() => {
		const revenueForStore = (storeId: string, slice: DailyReport[]): number =>
			slice.reduce(
				(total, report) =>
					total + (report.storeReports.find((entry) => entry.storeId === storeId)?.revenue ?? 0),
				0
			);

		return stores.map((store, index): StorePerformanceRow => {
			const revenue = revenueForStore(store.id, windowReports);
			const prior = revenueForStore(store.id, priorWindowReports);
			return {
				id: store.id,
				name: storeDisplayName(store, index + 1, i18n),
				artPath: getStoreArt(store.archetypeId).path,
				revenue,
				deltaPercent: prior > 0 ? (revenue - prior) / prior : null,
				direction: prior <= 0 || revenue === prior ? 'flat' : revenue > prior ? 'up' : 'down',
				series: windowReports.map(
					(report) => report.storeReports.find((entry) => entry.storeId === store.id)?.revenue ?? 0
				)
			};
		});
	});

	// Mock parity: equal cards per store, capped at four with a "+N more" cell.
	const visibleStoreRows = $derived(storePerformanceRows.slice(0, 4));
	const extraStoreCount = $derived(Math.max(0, storePerformanceRows.length - 4));

	function storeDeltaLabel(row: StorePerformanceRow): string {
		if (row.direction === 'flat' || row.deltaPercent === null) return '—';
		const formatted = i18n.format.percent1(Math.abs(row.deltaPercent));
		return row.direction === 'up' ? `▲ ${formatted}` : `▼ ${formatted}`;
	}

	interface ProductPerformanceRow {
		productId: DailyProductReport['productId'];
		revenue: number;
		share: number;
	}

	const productPerformanceRows = $derived.by(() => {
		const totals: Array<{ productId: DailyProductReport['productId']; revenue: number }> = [];
		for (const report of windowReports) {
			for (const storeReport of report.storeReports) {
				for (const product of storeReport.productReports) {
					const existing = totals.find((row) => row.productId === product.productId);
					if (existing) {
						existing.revenue += product.revenue;
					} else {
						totals.push({ productId: product.productId, revenue: product.revenue });
					}
				}
			}
		}
		const total = totals.reduce((sum, row) => sum + row.revenue, 0);
		return totals
			.map(
				(row): ProductPerformanceRow => ({
					productId: row.productId,
					revenue: row.revenue,
					share: total > 0 ? row.revenue / total : 0
				})
			)
			.filter((row) => row.revenue > 0)
			.sort((a, b) => b.revenue - a.revenue)
			.slice(0, 6);
	});

	interface ObjectivePlateRow {
		key: string;
		label: string;
		actualText: string;
		targetText: string;
		status: 'satisfied' | 'pending' | 'missed' | 'triggered' | null;
	}

	interface GradePlate {
		score: number;
		maxScore: number;
		dayLine: string;
		objectives: ObjectivePlateRow[];
	}

	const gradePlate = $derived.by<GradePlate | null>(() => {
		if (scenario) {
			const active = scenario;
			const evaluation = active.run.evaluation;
			type EvaluationRow = {
				conditionId: string;
				status: 'pending' | 'satisfied' | 'missed' | 'inactive' | 'triggered';
				evidence: ObjectiveEvidence;
			};
			const objectiveRow = (
				row: EvaluationRow,
				definitions: readonly ScenarioCondition[]
			): ObjectivePlateRow => {
				const condition = definitions.find((candidate) => candidate.id === row.conditionId);
				return {
					key: row.conditionId,
					label: condition ? i18n.t(condition.labelKey) : row.conditionId,
					actualText: formatEvidenceValue(row.evidence, row.evidence.actual, i18n),
					targetText: formatEvidenceValue(row.evidence, row.evidence.target, i18n),
					status: row.status === 'inactive' ? null : row.status
				};
			};
			return {
				// Scenario projections score 0–1000; the ring arc scales to that real maximum.
				score: evaluation.projection.score,
				maxScore: 1000,
				dayLine: i18n.t('reportsPanel.dayOf', {
					day: i18n.format.integer(evaluation.day),
					limit: i18n.format.integer(active.definition.dayLimit)
				}),
				objectives: [
					...evaluation.required.map((row) =>
						objectiveRow(row, active.definition.requiredObjectives)
					),
					...evaluation.optional.map((row) =>
						objectiveRow(row, active.definition.optionalObjectives)
					),
					...evaluation.failures
						.filter((row) => row.status === 'triggered')
						.map((row) => objectiveRow(row, active.definition.failures))
				]
			};
		}

		// No active scenario: fall back to the plain scorecard composite (average
		// of the four real scorecard values, 0–100) so the plate stays grounded.
		const scorecard = game?.scorecard;
		if (!scorecard) return null;
		const composite = Math.round(
			(scorecard.profit +
				scorecard.customerSatisfaction +
				scorecard.staffMorale +
				scorecard.marketPosition) /
				4
		);
		const keys = ['profit', 'customerSatisfaction', 'staffMorale', 'marketPosition'] as const;
		return {
			score: composite,
			maxScore: 100,
			dayLine: i18n.t('reportsPanel.dayOnly', { day: i18n.format.integer(game?.day ?? 0) }),
			objectives: keys.map((key) => ({
				key,
				label: i18n.labels.scoreKey(key),
				actualText: i18n.format.integer(scorecard[key]),
				targetText: '100',
				status: null
			}))
		};
	});

	const gradeArcPercent = $derived(
		gradePlate === null
			? 0
			: Math.max(0, Math.min(100, (gradePlate.score / gradePlate.maxScore) * 100))
	);

	// Presentational mapping only: no canonical letter-grade scale exists in game
	// state (the mock shows a serif letter inside the score ring).
	function gradeLetter(scoreOutOf100: number): string {
		if (scoreOutOf100 >= 90) return 'A';
		if (scoreOutOf100 >= 80) return 'B+';
		if (scoreOutOf100 >= 70) return 'B';
		if (scoreOutOf100 >= 60) return 'C';
		return 'D';
	}

	function objectiveGlyph(status: ObjectivePlateRow['status']): string {
		if (status === 'satisfied') return '✓';
		if (status === 'pending') return '◔';
		if (status === null) return '·';
		return '×';
	}

	function objectiveStatusLabel(status: ObjectivePlateRow['status']): string | null {
		if (status === 'satisfied') return i18n.t('reportsPanel.objectivesMet');
		if (status === 'pending') return i18n.t('reportsPanel.objectivesInProgress');
		if (status === 'missed' || status === 'triggered') {
			return i18n.t('reportsPanel.objectivesMissed');
		}
		return null;
	}

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
	<h2 id="reports-heading" class="visually-hidden">{i18n.t('reportsPanel.title')}</h2>

	{#if summary.latest}
		<div class="plate">
			<div class="window-controls" role="group" aria-label={i18n.t('reportsPanel.window')}>
				{#each WINDOW_DAYS as days (days)}
					<button
						type="button"
						class="window-btn"
						class:active={windowDays === days}
						aria-pressed={windowDays === days}
						onclick={() => (windowDays = days)}
					>
						{i18n.t('reportsPanel.windowDays', { days })}
					</button>
				{/each}
			</div>

			<div class="analytics-row">
				<section class="chart-plate" aria-labelledby="revenue-cost-heading">
					<h3 id="revenue-cost-heading" class="eyebrow">
						{i18n.t('reportsPanel.revenueVsCost')}
					</h3>
					<strong class="headline">
						{i18n.t('reportsPanel.perDay', {
							amount: i18n.format.currency(windowAverageRevenue)
						})}
					</strong>
					<p class="legend">
						<span class="legend-item">
							<span class="swatch revenue" aria-hidden="true"></span>
							{i18n.t('reportsPanel.legendRevenue')}
						</span>
						<span class="legend-item">
							<span class="swatch cost" aria-hidden="true"></span>
							{i18n.t('reportsPanel.legendCost')}
						</span>
					</p>
					{#if windowReports.length > 0}
						<svg
							class="chart"
							viewBox="0 0 320 112"
							role="img"
							aria-label={i18n.t('reportsPanel.chartLabel')}
						>
							<polyline class="line cost" points={chartPoints(costSeries, 320, 112)} />
							<polyline class="line revenue" points={chartPoints(revenueSeries, 320, 112)} />
						</svg>
						<div class="x-labels" aria-hidden="true">
							{#each chartXLabels as day (day)}<span>{i18n.format.integer(day)}</span>{/each}
						</div>
					{:else}
						<p class="chart-empty">—</p>
					{/if}
					<div class="cells">
						<div class="cell">
							<span class="eyebrow">{i18n.t('reportsPanel.margin')}</span>
							<strong>
								{windowMargin === null ? '—' : i18n.format.percent1(windowMargin)}
							</strong>
						</div>
						<div class="cell">
							<span class="eyebrow">{i18n.t('reportsPanel.footfall')}</span>
							<strong>{i18n.format.integer(windowFootfall)}</strong>
						</div>
						<div class="cell">
							<span class="eyebrow">{i18n.t('reportsPanel.spoilage')}</span>
							<strong>{i18n.format.currency(windowSpoilage)}</strong>
						</div>
					</div>
				</section>

				{#if gradePlate}
					<section class="grade-plate" aria-labelledby="scenario-grade-heading">
						<h3 id="scenario-grade-heading" class="eyebrow">
							{i18n.t(scenario ? 'reportsPanel.scenarioGrade' : 'reportsPanel.companyStanding')}
						</h3>
						<div class="ring-wrap">
							<svg
								class="ring"
								viewBox="0 0 120 120"
								role="img"
								aria-label={i18n.t('reportsPanel.scoreOutOf', {
									score: i18n.format.integer(gradePlate.score),
									max: i18n.format.integer(gradePlate.maxScore)
								})}
							>
								<circle class="ring-track" cx="60" cy="60" r="52" pathLength="100" />
								<circle
									class="ring-arc"
									cx="60"
									cy="60"
									r="52"
									pathLength="100"
									stroke-dasharray={`${gradeArcPercent} 100`}
								/>
							</svg>
							<strong class="grade" aria-hidden="true">
								{gradeLetter((gradePlate.score / gradePlate.maxScore) * 100)}
							</strong>
						</div>
						<p class="score-line">
							{i18n.t('reportsPanel.scoreOutOf', {
								score: i18n.format.integer(gradePlate.score),
								max: i18n.format.integer(gradePlate.maxScore)
							})}
							· {gradePlate.dayLine}
						</p>
						{#if gradePlate.objectives.length > 0}
							<ul class="objectives">
								{#each gradePlate.objectives as row (row.key)}
									<li data-status={row.status ?? 'info'}>
										<span class="glyph" aria-hidden="true">{objectiveGlyph(row.status)}</span>
										<span class="visually-hidden">{objectiveStatusLabel(row.status)}</span>
										<span class="objective-text">
											{row.label} · {row.actualText} / {row.targetText}
										</span>
									</li>
								{/each}
							</ul>
						{/if}
					</section>
				{/if}
			</div>

			{#if visibleStoreRows.length > 0}
				<section class="store-row" aria-labelledby="by-store-heading">
					<h3 id="by-store-heading" class="eyebrow">{i18n.t('reportsPanel.byStore')}</h3>
					<div class="store-cards">
						{#each visibleStoreRows as row (row.id)}
							<article class="store-card">
								<img src={asset(row.artPath)} alt="" width="96" height="72" />
								<h4>{row.name}</h4>
								<strong class="mono-value">{i18n.format.currency(row.revenue)}</strong>
								<span class="delta" data-direction={row.direction}>{storeDeltaLabel(row)}</span>
								<svg
									class="spark"
									viewBox="0 0 100 28"
									preserveAspectRatio="none"
									aria-hidden="true"
								>
									<polyline
										class="spark-line"
										data-direction={row.direction}
										points={chartPoints(row.series, 100, 28)}
									/>
								</svg>
							</article>
						{/each}
						{#if extraStoreCount > 0}
							<article class="store-card more-card">
								<span class="mono-value">
									{i18n.t('reportsPanel.moreStores', { count: extraStoreCount })}
								</span>
							</article>
						{/if}
					</div>
				</section>
			{/if}

			{#if productPerformanceRows.length > 0}
				<section class="product-row" aria-labelledby="by-product-heading">
					<h3 id="by-product-heading" class="eyebrow">{i18n.t('reportsPanel.byProduct')}</h3>
					<div class="product-cards">
						{#each productPerformanceRows as row (row.productId)}
							{@const productArt = getProductArt(row.productId)}
							<article class="product-card">
								<img src={asset(productArt.path)} alt="" width="48" height="48" />
								<strong class="mono-value">{i18n.format.currency(row.revenue)}</strong>
								<span class="product-name">{i18n.labels.productCategory(row.productId)}</span>
								<span class="perf-bar" aria-hidden="true">
									<span class="perf-fill" style:width={`${Math.round(row.share * 100)}%`}></span>
								</span>
							</article>
						{/each}
					</div>
				</section>
			{/if}
		</div>

		<details class="evidence-disclosure">
			<summary>{i18n.t('reportsPanel.detailedEvidence')}</summary>
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

	/* ---- Scorecard plate ---- */
	.plate {
		display: grid;
		gap: 0.85rem;
	}

	.window-controls {
		display: flex;
		justify-content: flex-end;
		gap: 0.4rem;
	}

	.window-btn {
		min-width: 2.7rem;
		padding: 0.3rem 0.6rem;
		border: 1px solid var(--brass-300);
		border-radius: 2px;
		background: var(--paper-50);
		color: var(--ink-700);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums lining-nums;
		cursor: pointer;
	}

	/* Selected window: pale brass fill, matching the policy segmented control. */
	.window-btn.active {
		border-color: var(--ink-900);
		background: var(--brass-300);
		color: var(--ink-900);
		box-shadow: inset 0 0 0 1px var(--paper-100);
	}

	.analytics-row {
		display: grid;
		grid-template-columns: minmax(0, 7fr) minmax(0, 3fr);
		gap: 0.85rem;
		align-items: stretch;
	}

	.chart-plate,
	.grade-plate {
		display: grid;
		gap: 0.5rem;
		align-content: start;
		min-width: 0;
		padding: 0.75rem 0.8rem;
		border: 1px solid var(--brass-300);
		border-radius: 2px;
		background: var(--paper-50);
		background-image: var(--grain-svg);
		background-blend-mode: multiply;
		background-size: 200px 200px;
		box-shadow:
			inset 0 0 0 1px var(--paper-100),
			0 1px 0 rgba(20, 16, 10, 0.08);
	}

	.eyebrow {
		margin: 0;
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}

	.headline {
		color: var(--ink-700);
		font-family: var(--font-mono);
		font-size: 1.7rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums lining-nums;
		line-height: 1.1;
	}

	.legend {
		display: flex;
		gap: 0.9rem;
		margin: 0;
		color: var(--ink-500);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.legend-item {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		color: inherit;
		letter-spacing: inherit;
	}

	.swatch {
		width: 1.3rem;
		border-top: 2px solid var(--moss);
	}

	.swatch.cost {
		border-top: 2px dashed var(--wax-red);
	}

	.chart {
		display: block;
		width: 100%;
		height: auto;
	}

	.chart .line {
		fill: none;
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}

	.chart .line.revenue {
		stroke: var(--moss);
	}

	.chart .line.cost {
		stroke: var(--wax-red);
		stroke-dasharray: 5 4;
	}

	.chart-empty {
		min-height: 3.5rem;
	}

	.x-labels {
		display: flex;
		justify-content: space-between;
	}

	.x-labels span {
		color: var(--ink-400);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		font-variant-numeric: tabular-nums lining-nums;
		letter-spacing: 0;
		text-transform: none;
	}

	.cells {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.6rem;
		border-top: 1px solid var(--paper-edge);
		padding-top: 0.6rem;
	}

	.cell {
		display: grid;
		min-width: 0;
		gap: 0.2rem;
	}

	.cell strong {
		overflow-wrap: anywhere;
		color: var(--ink-700);
		font-family: var(--font-mono);
		font-size: 0.95rem;
		font-weight: 700;
	}

	.ring-wrap {
		position: relative;
		display: grid;
		justify-items: center;
	}

	.ring {
		width: min(8.5rem, 100%);
		height: auto;
		/* Some shell box-shadow frames svg viewports; the mock's ring is unframed. */
		border: 0;
		outline: none;
		box-shadow: none;
	}

	.ring circle {
		fill: none;
		stroke-width: 10;
	}

	.ring-track {
		stroke: var(--paper-200);
	}

	.ring-arc {
		stroke: var(--moss);
		stroke-linecap: round;
		transform: rotate(-90deg);
		transform-origin: center;
	}

	.grade {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: var(--moss);
		font-family: var(--font-display);
		font-size: 2.1rem;
		font-weight: 700;
		line-height: 1;
	}

	.score-line {
		margin: 0;
		color: var(--ink-500);
		font-family: var(--font-mono);
		font-size: 0.74rem;
		font-variant-numeric: tabular-nums lining-nums;
		text-align: center;
	}

	.objectives {
		display: grid;
		gap: 0.3rem;
		margin: 0;
		border-top: 1px solid var(--paper-edge);
		padding: 0.5rem 0 0;
		list-style: none;
	}

	.objectives li {
		display: flex;
		gap: 0.4rem;
		align-items: baseline;
		color: var(--ink-500);
		font-family: var(--font-mono);
		font-size: 0.74rem;
		font-variant-numeric: tabular-nums lining-nums;
	}

	.objective-text {
		min-width: 0;
		overflow-wrap: anywhere;
		color: inherit;
		font-family: inherit;
		font-size: inherit;
		font-weight: 400;
		letter-spacing: 0;
		text-transform: none;
	}

	.glyph {
		flex: none;
		font-size: inherit;
		letter-spacing: 0;
		text-transform: none;
	}

	.objectives li[data-status='satisfied'] .glyph {
		color: var(--moss);
		font-weight: 700;
	}

	.objectives li[data-status='pending'] .glyph {
		color: var(--brass-700);
		font-weight: 700;
	}

	.objectives li[data-status='missed'],
	.objectives li[data-status='triggered'] {
		color: var(--wax-red);
	}

	.store-row,
	.product-row {
		display: grid;
		gap: 0.45rem;
	}

	.store-cards {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.6rem;
	}

	.store-card {
		display: grid;
		grid-template-columns: 76px minmax(0, 1fr);
		grid-template-rows: auto auto auto;
		column-gap: 0.6rem;
		align-items: center;
		gap: 0.15rem 0.6rem;
		min-width: 0;
		padding: 0.45rem 0.5rem;
		border: 1px solid var(--brass-300);
		border-radius: 2px;
		background: var(--paper-50);
	}

	.store-card img {
		grid-row: 1 / span 3;
		width: 76px;
		height: 60px;
		object-fit: cover;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
	}

	.store-card h4 {
		grid-column: 2;
		margin: 0;
		overflow: hidden;
		color: var(--ink-700);
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 400;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.store-card .mono-value,
	.store-card .delta {
		grid-column: 2;
	}

	.store-card .spark {
		grid-column: 2;
		width: 100%;
		height: 1.4rem;
	}

	.mono-value {
		overflow-wrap: anywhere;
		color: var(--ink-700);
		font-family: var(--font-mono);
		font-size: 0.9rem;
		font-weight: 700;
	}

	.delta {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums lining-nums;
		letter-spacing: 0;
		text-transform: none;
	}

	.delta[data-direction='up'] {
		color: var(--moss);
	}

	.delta[data-direction='down'] {
		color: var(--wax-red);
	}

	.delta[data-direction='flat'] {
		color: var(--brass-700);
	}

	.spark {
		display: block;
		width: 100%;
		height: 1.7rem;
	}

	.spark-line {
		fill: none;
		stroke-width: 2;
		stroke-linejoin: round;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}

	.spark-line[data-direction='up'] {
		stroke: var(--moss);
	}

	.spark-line[data-direction='down'] {
		stroke: var(--wax-red);
	}

	.spark-line[data-direction='flat'] {
		stroke: var(--brass-700);
	}

	.more-card {
		place-items: center;
		border-style: dashed;
		color: var(--ink-500);
	}

	.product-cards {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.6rem;
	}

	.product-card {
		position: relative;
		display: grid;
		gap: 0.25rem;
		justify-items: center;
		min-width: 0;
		padding: 0.5rem 0.5rem 0.7rem;
		border: 1px solid var(--brass-300);
		border-radius: 2px;
		background: var(--paper-50);
	}

	.product-card img {
		width: 3rem;
		height: 3rem;
		object-fit: cover;
		border: 1px solid var(--paper-edge);
		border-radius: 2px;
	}

	.product-name {
		overflow: hidden;
		max-width: 100%;
		color: var(--ink-500);
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.perf-bar {
		position: absolute;
		inset-inline: 0;
		bottom: 0;
		height: 3px;
		background: var(--paper-200);
	}

	.perf-fill {
		display: block;
		height: 100%;
		background: var(--moss);
	}

	.evidence-disclosure {
		margin-top: 0.9rem;
		border-top: 1px solid var(--paper-edge);
		padding-top: 0.55rem;
	}

	.evidence-disclosure > summary {
		cursor: pointer;
		color: var(--brass-700);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	.evidence-disclosure[open] > summary {
		margin-bottom: 0.75rem;
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		padding: 0;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}

	@media (max-width: 980px) {
		.metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.analytics-row {
			grid-template-columns: 1fr;
		}

		.store-cards {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 520px) {
		.metrics {
			grid-template-columns: 1fr;
		}

		.product-cards {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
</style>
