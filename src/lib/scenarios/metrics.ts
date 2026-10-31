import { getTotalDebt, isOutstandingLoan } from '$lib/game/finance';
import { isReplenishmentDay } from '$lib/game/retailSupply';
import type { DailyReport, GameState, ProductId } from '$lib/game/types';
import type {
	ObjectiveEvidence,
	ScenarioComparator,
	ScenarioCondition,
	ScenarioDefinition,
	ScenarioDiagnostic,
	ScenarioEvaluation,
	ScenarioMetricQuery,
	ScenarioMetricWindow
} from './types';

export interface MetricEvaluation {
	actual: number;
	contributingIds: string[];
	windowComplete: boolean;
}

type MetricId = ScenarioMetricQuery['metric'];
type WindowKind = ScenarioMetricWindow['kind'];

interface MetricValue {
	actual: number;
	contributingIds: string[];
}

interface MetricContext {
	game: GameState;
	query: ScenarioMetricQuery;
	window: ScenarioMetricWindow;
	reports: readonly DailyReport[];
}

type MetricFormat = 'currency' | 'percent' | 'decimal';

interface MetricRegistration {
	supportedWindows: ReadonlySet<WindowKind>;
	/** True when queries carry productIds and evaluation filters product reports. */
	productScoped: boolean;
	/** Evidence-value formatting used for actual/target in localized copy. */
	format: MetricFormat;
	/** Product-scoped queries that additionally require a feasible producer-to-warehouse path. */
	requiresLocalProductionPath: boolean;
	neutral: number;
	isComplete: (context: MetricContext) => boolean;
	evaluate: (context: MetricContext) => MetricValue;
}

interface ProductContribution {
	id: string;
	importSpend: number;
	importedUnits: number;
	warehouseUnits: number;
	unitsSold: number;
	demandMissed: number;
	wasteUnits: number;
}

const CURRENT = new Set<WindowKind>(['current']);
const RUN_TO_DATE = new Set<WindowKind>(['run-to-date']);
const REPORT_WINDOWS = new Set<WindowKind>([
	'current',
	'run-to-date',
	'trailing-reports',
	'fixed-report-days'
]);
const AGGREGATE_REPORT_WINDOWS = new Set<WindowKind>([
	'run-to-date',
	'trailing-reports',
	'fixed-report-days'
]);
export function compareScenarioEvidenceIds(first: string, second: string): number {
	return first < second ? -1 : first > second ? 1 : 0;
}

export function areScenarioEvidenceIdsCanonical(ids: readonly string[]): boolean {
	return ids.every(
		(id, index) => index === 0 || compareScenarioEvidenceIds(ids[index - 1]!, id) < 0
	);
}

function sortedIds(ids: readonly string[]): string[] {
	return [...new Set(ids)].sort(compareScenarioEvidenceIds);
}

function stateMetricComplete(): boolean {
	return true;
}

function reportMetricComplete({ window, reports }: MetricContext): boolean {
	switch (window.kind) {
		case 'current':
			return reports.length === 1;
		case 'run-to-date':
			return true;
		case 'trailing-reports':
			return reports.length === window.count;
		case 'fixed-report-days': {
			const days = new Set(reports.map((report) => report.day));
			for (let day = window.startDay; day <= window.endDay; day += 1) {
				if (!days.has(day)) return false;
			}
			return true;
		}
	}
}

function reportIds(reports: readonly DailyReport[]): string[] {
	return sortedIds(reports.map((report) => reportEvidenceId(report.day)));
}

function sumReports(
	reports: readonly DailyReport[],
	getValue: (report: DailyReport) => number
): number {
	return reports.reduce((sum, report) => sum + getValue(report), 0);
}

function averageOperatingCashFlow(reports: readonly DailyReport[], neutral: number): MetricValue {
	if (reports.length === 0) return { actual: neutral, contributingIds: [] };
	return {
		actual: Math.round(sumReports(reports, (report) => report.operatingCashFlow) / reports.length),
		contributingIds: reportIds(reports)
	};
}

function productIds(query: ScenarioMetricQuery): ReadonlySet<ProductId> {
	return new Set('productIds' in query ? query.productIds : []);
}

function productContributions(context: MetricContext): ProductContribution[] {
	const included = productIds(context.query);
	const contributions: ProductContribution[] = [];

	for (const report of context.reports) {
		for (const storeReport of report.storeReports) {
			for (const productReport of storeReport.productReports) {
				if (!included.has(productReport.productId)) continue;
				contributions.push({
					id: productEvidenceId(report.day, storeReport.storeId, productReport.productId),
					importSpend: productReport.importSpend,
					importedUnits: productReport.importedUnits,
					warehouseUnits: productReport.warehouseUnits,
					unitsSold: productReport.unitsSold,
					demandMissed: productReport.demandMissed,
					wasteUnits: productReport.wasteUnits
				});
			}
		}
	}

	return contributions.sort((first, second) => compareScenarioEvidenceIds(first.id, second.id));
}

function marketContributions(context: MetricContext): Array<{
	id: string;
	playerDemandPool: number;
	cityDemandPool: number;
}> {
	const included = productIds(context.query);
	const contributions: Array<{
		id: string;
		playerDemandPool: number;
		cityDemandPool: number;
	}> = [];

	for (const report of context.reports) {
		for (const marketReport of report.marketReports) {
			if (!included.has(marketReport.productId)) continue;
			contributions.push({
				id: marketEvidenceId(report.day, marketReport.cityId, marketReport.productId),
				playerDemandPool: marketReport.playerDemandPool,
				cityDemandPool: marketReport.cityDemandPool
			});
		}
	}

	return contributions.sort((first, second) => compareScenarioEvidenceIds(first.id, second.id));
}

function sumProductMetric(
	context: MetricContext,
	getValue: (contribution: ProductContribution) => number
): MetricValue {
	const contributions = productContributions(context);
	return {
		actual: contributions.reduce((sum, contribution) => sum + getValue(contribution), 0),
		contributingIds: contributions.map((contribution) => contribution.id)
	};
}

function consecutivePositiveOperatingCashFlow(context: MetricContext): MetricValue {
	const reports = sortedReports(context.reports);
	const contributingIds: string[] = [];

	for (let index = reports.length - 1; index >= 0; index -= 1) {
		const report = reports[index]!;
		if (report.operatingCashFlow <= 0) break;
		contributingIds.push(reportEvidenceId(report.day));
	}

	return { actual: contributingIds.length, contributingIds: sortedIds(contributingIds) };
}

export const METRIC_REGISTRY = {
	cash: {
		supportedWindows: CURRENT,
		productScoped: false,
		format: 'currency',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: stateMetricComplete,
		evaluate: ({ game }) => ({ actual: game.cash, contributingIds: [] })
	},
	'total-debt': {
		supportedWindows: CURRENT,
		productScoped: false,
		format: 'currency',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: stateMetricComplete,
		evaluate: ({ game }) => ({
			actual: getTotalDebt(game),
			contributingIds: game.finance.loans
				.filter(isOutstandingLoan)
				.map((loan) => loanEvidenceId(loan.id))
		})
	},
	'missed-loan-payments': {
		supportedWindows: CURRENT,
		productScoped: false,
		format: 'decimal',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: stateMetricComplete,
		evaluate: ({ game }) => ({
			// Lifetime count across every loan, including paid/refinanced ones;
			// refinancing never resets it.
			actual: game.finance.loans.reduce((total, loan) => total + loan.missedPaymentCount, 0),
			contributingIds: game.finance.loans
				.filter((loan) => loan.missedPaymentCount > 0)
				.map((loan) => loanEvidenceId(loan.id))
		})
	},
	'daily-net-income': {
		supportedWindows: REPORT_WINDOWS,
		productScoped: false,
		format: 'currency',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => averageOperatingCashFlow(context.reports, 0)
	},
	'cumulative-net-income': {
		supportedWindows: RUN_TO_DATE,
		productScoped: false,
		format: 'currency',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: ({ reports }) => ({
			actual: sumReports(reports, (report) => report.operatingCashFlow),
			contributingIds: reportIds(reports)
		})
	},
	'consecutive-positive-net-income-reports': {
		supportedWindows: new Set<WindowKind>(['current', 'trailing-reports']),
		productScoped: false,
		format: 'decimal',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: consecutivePositiveOperatingCashFlow
	},
	'completed-retail-import-cycles': {
		supportedWindows: RUN_TO_DATE,
		productScoped: false,
		format: 'decimal',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: ({ reports }) => {
			const importReports = reports.filter((report) => isReplenishmentDay(report.day));
			return { actual: importReports.length, contributingIds: reportIds(importReports) };
		}
	},
	'retail-import-spend': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		productScoped: true,
		format: 'currency',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => sumProductMetric(context, (contribution) => contribution.importSpend)
	},
	'retail-imported-units': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		productScoped: true,
		format: 'decimal',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => sumProductMetric(context, (contribution) => contribution.importedUnits)
	},
	'retail-local-units': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		productScoped: true,
		format: 'decimal',
		requiresLocalProductionPath: true,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => sumProductMetric(context, (contribution) => contribution.warehouseUnits)
	},
	'retail-local-share': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		productScoped: true,
		format: 'percent',
		requiresLocalProductionPath: true,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => {
			const contributions = productContributions(context);
			const warehouseUnits = contributions.reduce(
				(sum, contribution) => sum + contribution.warehouseUnits,
				0
			);
			const importedUnits = contributions.reduce(
				(sum, contribution) => sum + contribution.importedUnits,
				0
			);
			const denominator = warehouseUnits + importedUnits;
			return {
				actual: denominator === 0 ? 0 : warehouseUnits / denominator,
				contributingIds: contributions.map((contribution) => contribution.id)
			};
		}
	},
	'units-sold': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		productScoped: true,
		format: 'decimal',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => sumProductMetric(context, (contribution) => contribution.unitsSold)
	},
	'demand-missed': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		productScoped: true,
		format: 'decimal',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => sumProductMetric(context, (contribution) => contribution.demandMissed)
	},
	'product-waste-units': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		productScoped: true,
		format: 'decimal',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => sumProductMetric(context, (contribution) => contribution.wasteUnits)
	},
	'product-waste-share': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		productScoped: true,
		format: 'percent',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => {
			const contributions = productContributions(context);
			const wasteUnits = contributions.reduce((sum, item) => sum + item.wasteUnits, 0);
			const unitsSold = contributions.reduce((sum, item) => sum + item.unitsSold, 0);
			const outflow = unitsSold + wasteUnits;
			// Outflow denominator (sold + wasted) includes day-0 opening stock once
			// it spoils or sells. Zero outflow stays 0, so scenarios must pair this
			// metric with a positive units-sold objective to prevent no-trade wins.
			return {
				actual: outflow === 0 ? 0 : wasteUnits / outflow,
				contributingIds: contributions.map((contribution) => contribution.id)
			};
		}
	},
	'player-market-share': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		productScoped: true,
		format: 'percent',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => {
			const contributions = marketContributions(context);
			// Demand-weighted share: sum the STORED simulation numerator
			// (already rounded per day) over the pooled city demand; never
			// re-round from `playerShare`.
			const cityDemandPool = contributions.reduce(
				(sum, contribution) => sum + contribution.cityDemandPool,
				0
			);
			const playerDemandPool = contributions.reduce(
				(sum, contribution) => sum + contribution.playerDemandPool,
				0
			);
			return {
				actual: cityDemandPool === 0 ? 0 : playerDemandPool / cityDemandPool,
				contributingIds: contributions.map((contribution) => contribution.id)
			};
		}
	},
	scorecard: {
		supportedWindows: CURRENT,
		productScoped: false,
		format: 'decimal',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: stateMetricComplete,
		evaluate: ({ game, query }) => ({
			actual: query.metric === 'scorecard' ? game.scorecard[query.score] : 0,
			contributingIds: []
		})
	},
	'store-count': {
		supportedWindows: CURRENT,
		productScoped: false,
		format: 'decimal',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: stateMetricComplete,
		evaluate: ({ game }) => ({
			actual: game.stores.length,
			contributingIds: sortedIds(game.stores.map((store) => store.id))
		})
	},
	'max-store-level': {
		supportedWindows: CURRENT,
		productScoped: false,
		format: 'decimal',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: stateMetricComplete,
		evaluate: ({ game }) => {
			const maxLevel = game.stores.reduce((level, store) => Math.max(level, store.level), 0);
			return {
				actual: maxLevel,
				contributingIds: sortedIds(
					game.stores.filter((store) => store.level === maxLevel).map((store) => store.id)
				)
			};
		}
	},
	'opened-city-count': {
		supportedWindows: CURRENT,
		productScoped: false,
		format: 'decimal',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: stateMetricComplete,
		evaluate: ({ game }) => ({
			actual: game.world.openedCityIds.length,
			contributingIds: sortedIds([...game.world.openedCityIds])
		})
	},
	'peak-company-book-value': {
		supportedWindows: RUN_TO_DATE,
		productScoped: false,
		format: 'currency',
		requiresLocalProductionPath: false,
		neutral: 0,
		// Zero report history is not a completed window (design §2).
		isComplete: ({ reports }) => reports.length > 0,
		evaluate: ({ reports }) => {
			if (reports.length === 0) return { actual: 0, contributingIds: [] };
			// Spread Math.max throws RangeError once report history passes ~100k
			// entries; a reduce scan has no argument-count ceiling.
			const peak = reports.reduce(
				(max, report) => Math.max(max, report.companyBookValueAfter),
				Number.NEGATIVE_INFINITY
			);
			return {
				actual: peak,
				contributingIds: reportIds(
					reports.filter((report) => report.companyBookValueAfter === peak)
				)
			};
		}
	},
	'industrial-building-count': {
		supportedWindows: CURRENT,
		productScoped: false,
		format: 'decimal',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: stateMetricComplete,
		evaluate: ({ game, query }) => {
			const included = new Set(
				query.metric === 'industrial-building-count' ? query.buildingTypeIds : []
			);
			const buildings = game.industrialBuildings.filter((building) =>
				included.has(building.typeId)
			);
			return {
				actual: buildings.length,
				contributingIds: sortedIds(buildings.map((building) => building.id))
			};
		}
	},
	'city-inventory-quantity': {
		supportedWindows: CURRENT,
		productScoped: false,
		format: 'decimal',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: stateMetricComplete,
		evaluate: ({ game, query }) => {
			if (query.metric !== 'city-inventory-quantity') {
				return { actual: 0, contributingIds: [] };
			}
			const inventory = game.cityInventories.find((candidate) => candidate.cityId === query.cityId);
			return {
				actual: inventory?.materials[query.materialId] ?? 0,
				contributingIds: [cityInventoryEvidenceId(query.cityId, query.materialId)]
			};
		}
	},
	'delivered-transfer-units': {
		supportedWindows: AGGREGATE_REPORT_WINDOWS,
		productScoped: false,
		format: 'decimal',
		requiresLocalProductionPath: false,
		neutral: 0,
		isComplete: reportMetricComplete,
		evaluate: (context) => {
			const contributions: Array<{ id: string; quantity: number }> = [];
			for (const report of context.reports) {
				if (context.query.metric !== 'delivered-transfer-units') continue;
				for (const arrival of report.logistics.arrivals) {
					if (
						arrival.destinationCityId !== context.query.destinationCityId ||
						arrival.materialId !== context.query.materialId
					) {
						continue;
					}
					contributions.push({
						id: transferArrivalEvidenceId(report.day, arrival.transferOrderId),
						quantity: arrival.quantity
					});
				}
			}
			return {
				actual: contributions.reduce((sum, contribution) => sum + contribution.quantity, 0),
				contributingIds: contributions.map((contribution) => contribution.id)
			};
		}
	}
} satisfies Record<MetricId, MetricRegistration>;

// Report arrays are append-only snapshots (transitions never mutate them in
// place), so the day-sorted view can be memoized per array reference. Every
// goal evaluation routes through `selectReports`, which used to copy and
// re-sort the full history once per goal — a dozen sorts of the same array
// per `evaluateProgression`/save-codec pass.
const sortedReportsCache = new WeakMap<readonly DailyReport[], DailyReport[]>();

function sortedReports(reports: readonly DailyReport[]): DailyReport[] {
	const cached = sortedReportsCache.get(reports);
	if (cached) return cached;
	const sorted = [...reports].sort((first, second) => first.day - second.day);
	sortedReportsCache.set(reports, sorted);
	return sorted;
}

function selectReports(game: GameState, window: ScenarioMetricWindow): DailyReport[] {
	const reports = sortedReports(game.reports);
	switch (window.kind) {
		case 'current':
			return reports.length === 0 ? [] : [reports.at(-1)!];
		case 'run-to-date':
			return reports;
		case 'trailing-reports':
			return reports.slice(-window.count);
		case 'fixed-report-days':
			return reports.filter(
				(report) => report.day >= window.startDay && report.day <= window.endDay
			);
	}
}

export function encodeEvidenceSegment(value: string): string {
	return encodeURIComponent(value);
}

export function reportEvidenceId(day: number): string {
	return `report:${day}`;
}

export function storeReportEvidenceId(day: number, storeId: string): string {
	return `${reportEvidenceId(day)}/store:${encodeEvidenceSegment(storeId)}`;
}

export function productEvidenceId(day: number, storeId: string, productId: ProductId): string {
	return `${storeReportEvidenceId(day, storeId)}/product:${encodeEvidenceSegment(productId)}`;
}

export function marketEvidenceId(day: number, cityId: string, productId: ProductId): string {
	return `${reportEvidenceId(day)}/market:${encodeEvidenceSegment(cityId)}/product:${encodeEvidenceSegment(productId)}`;
}

export function cityInventoryEvidenceId(cityId: string, materialId: string): string {
	return `city-inventory:${encodeEvidenceSegment(cityId)}/material:${encodeEvidenceSegment(materialId)}`;
}

export function loanEvidenceId(loanId: string): string {
	return `loan:${encodeEvidenceSegment(loanId)}`;
}

export function transferArrivalEvidenceId(day: number, transferOrderId: string): string {
	return `${reportEvidenceId(day)}/transfer:${encodeEvidenceSegment(transferOrderId)}`;
}

export function evaluateMetric(
	game: GameState,
	query: ScenarioMetricQuery,
	window: ScenarioMetricWindow,
	requiresCompleteWindow = false
): MetricEvaluation {
	const registration = METRIC_REGISTRY[query.metric];
	if (!registration.supportedWindows.has(window.kind)) {
		throw new Error(`Metric ${query.metric} does not support ${window.kind}.`);
	}

	const context: MetricContext = {
		game,
		query,
		window,
		reports: selectReports(game, window)
	};
	const value = registration.evaluate(context);

	return {
		actual: Number.isFinite(value.actual) ? value.actual : registration.neutral,
		contributingIds: sortedIds(value.contributingIds),
		windowComplete: !requiresCompleteWindow || registration.isComplete(context)
	};
}

function comparatorPasses(actual: number, comparator: ScenarioComparator, target: number): boolean {
	switch (comparator) {
		case 'lt':
			return actual < target;
		case 'lte':
			return actual <= target;
		case 'eq':
			return actual === target;
		case 'gte':
			return actual >= target;
		case 'gt':
			return actual > target;
	}
}

export function scenarioConditionPasses(
	condition: ScenarioCondition,
	actual: number,
	windowComplete: boolean
): boolean {
	return windowComplete && comparatorPasses(actual, condition.comparator, condition.target);
}

export function evaluateCondition(condition: ScenarioCondition, game: GameState) {
	const evaluation = evaluateMetric(
		game,
		condition.query,
		condition.window,
		condition.requiresCompleteWindow
	);
	const evidence: ObjectiveEvidence = {
		conditionId: condition.id,
		metric: condition.query.metric,
		comparator: condition.comparator,
		target: condition.target,
		actual: evaluation.actual,
		day: game.day,
		window: condition.window,
		windowComplete: evaluation.windowComplete,
		contributingIds: evaluation.contributingIds
	};
	return {
		evidence,
		passes: scenarioConditionPasses(condition, evaluation.actual, evaluation.windowComplete)
	};
}

function finiteDistance(actual: number, target: number): number {
	const distance = Math.abs(actual - target);
	return Number.isFinite(distance) ? distance : 0;
}

export function evaluateScenarioConditions(
	definition: ScenarioDefinition,
	game: GameState,
	terminal: boolean
): Omit<ScenarioEvaluation, 'projection'> {
	const required = definition.requiredObjectives.map((condition) => {
		const result = evaluateCondition(condition, game);
		return {
			conditionId: condition.id,
			status: result.passes
				? ('satisfied' as const)
				: terminal
					? ('missed' as const)
					: ('pending' as const),
			evidence: result.evidence
		};
	});
	const optional = definition.optionalObjectives.map((condition) => {
		const result = evaluateCondition(condition, game);
		return {
			conditionId: condition.id,
			status: result.passes
				? ('satisfied' as const)
				: terminal
					? ('missed' as const)
					: ('pending' as const),
			evidence: result.evidence
		};
	});
	const failureResults = definition.failures.map((condition) => ({
		condition,
		result: evaluateCondition(condition, game)
	}));
	const failures = failureResults.map(({ condition, result }) => ({
		conditionId: condition.id,
		status: result.passes ? ('triggered' as const) : ('inactive' as const),
		evidence: result.evidence
	}));
	const deadlineTriggered = game.day >= definition.dayLimit;

	return {
		day: game.day,
		required,
		optional,
		failures,
		deadline: deadlineTriggered
			? {
					triggered: true,
					evidence: {
						conditionId: 'deadline-exceeded',
						day: game.day,
						dayLimit: definition.dayLimit
					}
				}
			: null,
		risks: [
			...failureResults.map(({ condition, result }) => ({
				kind: 'condition' as const,
				conditionId: condition.id,
				distance: finiteDistance(result.evidence.actual, result.evidence.target),
				triggered: result.passes
			})),
			{
				kind: 'deadline' as const,
				daysRemaining: Math.max(0, definition.dayLimit - game.day),
				triggered: deadlineTriggered
			}
		]
	};
}

export function validateScenarioReportInvariants(
	reports: readonly DailyReport[]
): ScenarioDiagnostic[] {
	const diagnostics: ScenarioDiagnostic[] = [];

	for (const [reportIndex, report] of reports.entries()) {
		if (reportIndex > 0 && report.day <= reports[reportIndex - 1]!.day) {
			diagnostics.push({
				code: 'non-increasing-report-day',
				path: `reports[${reportIndex}].day`,
				value: report.day,
				detail: 'Scenario report days must be strictly increasing and unique.'
			});
		}

		const storeIds = new Set<string>();
		for (const [storeIndex, storeReport] of report.storeReports.entries()) {
			if (storeIds.has(storeReport.storeId)) {
				diagnostics.push({
					code: 'duplicate-store-report-id',
					path: `reports[${reportIndex}].storeReports[${storeIndex}].storeId`,
					value: storeReport.storeId,
					detail: 'Store IDs must be unique within each daily report.'
				});
			} else {
				storeIds.add(storeReport.storeId);
			}

			const productIds = new Set<ProductId>();
			for (const [productIndex, productReport] of storeReport.productReports.entries()) {
				if (productIds.has(productReport.productId)) {
					diagnostics.push({
						code: 'duplicate-product-report-product-id',
						path: `reports[${reportIndex}].storeReports[${storeIndex}].productReports[${productIndex}].productId`,
						value: productReport.productId,
						detail: 'Product IDs must be unique within each store report.'
					});
				} else {
					productIds.add(productReport.productId);
				}
			}
		}
	}

	return diagnostics.sort(
		(first, second) =>
			compareScenarioEvidenceIds(first.path, second.path) ||
			compareScenarioEvidenceIds(first.code, second.code)
	);
}
